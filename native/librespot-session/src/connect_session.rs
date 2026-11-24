use crate::connect_request_cooldown::{require_service_allowed, observe_service_cooldown};
use crate::connect_request_diagnostics::ConnectRequestDiagnostic;
use crate::connect_client_token::{ClientTokenExchange, ClientTokenIdentity, ClientTokenCache, ClientTokenPlatform, obtain_client_token, CLIENT_TOKEN_ADDRESS, MAXIMUM_CLIENT_TOKEN_RESPONSE_BYTES};
use crate::connect_search::diagnostics::{SearchDiagnostic, SearchDiagnosticStage};
use crate::connect_search_traffic::{CatalogSearchTraffic, retry_after_seconds, quota_exceeded, MAXIMUM_RATE_LIMIT_BODY_BYTES, RATE_LIMIT_BODY_TIMEOUT_MILLISECONDS};
use crate::connect_transport::native_monotonic_milliseconds;

use std::{future::Future, time::{Duration, SystemTime, UNIX_EPOCH}};

use http::{Method, Request};
use http_body_util::BodyExt;
use librespot_core::{http_client::HttpClientError, token::Token, Session, SessionConfig};
use librespot_protocol::connect::PutStateRequest;
use protobuf::Message;
use serde_json::Value;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{connect_activation::{build_explicit_activation, ConnectActivationPlayerReadiness, ConnectExplicitActivation}, connect_search::{ConnectSearchInput, ConnectSearchOperations, ConnectSearchTrack, search_request, search_address, decode_search_response}, connect_membership::{decode_current_membership, ConnectJamMembership, CURRENT_MEMBERSHIP_PATH}, connect_publication::{build_withdrawal, build_deactivation, build_publication, verify_publication_response, publication_server_timestamp, ConnectPublicationState, ConnectPublicationSnapshot}, connect_authentication::{ConnectAuthenticatedDispatch, ConnectHttpRequest, ConnectRequestPurpose, execute_authenticated_request}, connect_receipts::{ConnectCommandAcknowledgement, decode_command_acknowledgement}, connect_metadata::{ConnectMetadataOperations, ConnectTrackMetadata, encode_metadata_request, decode_metadata_response, METADATA_PATH}, connect_device::{initial_registration, ConnectDeviceConfiguration},
    connect_wire::{decode_cluster_snapshot, ConnectCluster, MAXIMUM_FRAME_BYTES},
    desktop_login5, model::{decode_stored_session, Failure}, session::{sanitized_failure, stored_session_configuration}};

const CLIENT_TOKEN_HEADER: &str = "client-token";
const PARTNER_ORIGIN_HEADER: &str = "origin";
const PARTNER_REFERER_HEADER: &str = "referer";
const PARTNER_ORIGIN: &str = "https://xpui.app.spotify.com";
const HASHCASH_SUFFIX_BYTES: usize = 16;
const ANDROID_PLATFORM: &str = "android";
const LINUX_PLATFORM: &str = "linux";
const MACOS_PLATFORM: &str = "macos";
const IOS_PLATFORM: &str = "ios";
const WINDOWS_PLATFORM: &str = "windows";
const BEARER_PREFIX: &str = "Bearer ";
const AUTHORIZATION_HEADER: &str = "authorization";
const ACCEPT_HEADER: &str = "accept";
const CONTENT_TYPE_HEADER: &str = "content-type";
const CONNECTION_HEADER: &str = "x-spotify-connection-id";
const PROTOBUF_MEDIA_TYPE: &str = "application/x-protobuf";
const JSON_MEDIA_TYPE: &str = "application/json";
const DEVICE_PATH_PREFIX: &str = "/connect-state/v1/devices/";
const COMMAND_PATH_PREFIX: &str = "/connect-state/v1/player/command/from/";
const COMMAND_TARGET_SEPARATOR: &str = "/to/";
const DEALER_SERVICE: &str = "dealer";
const SECURE_WEBSOCKET_SCHEME: &str = "wss://";
const TOKEN_QUERY_PARAMETER: &str = "access_token";
const SERVICE_HOST_SUFFIX: &str = ".spotify.com";
const EMPTY_PATH: &str = "/";
const REQUEST_TIMEOUT_SECONDS: u64 = 15;
const AUTHENTICATION_TIMEOUT_SECONDS: u64 = 60;
const UNAUTHORIZED_STATUS: u16 = 401;
const INVALID_REQUEST_STATUS: u16 = 400;
const FORBIDDEN_STATUS: u16 = 403;
const NOT_FOUND_STATUS: u16 = 404;
const RATE_LIMITED_STATUS: u16 = 429;
const MINIMUM_SERVER_FAILURE_STATUS: u16 = 500;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectFailureStage { Restore, DealerResolution, DealerAddress, DealerWebsocket, DealerEvents,
    RegistrationEncoding, RegistrationHttp, RegistrationProtobuf, RegistrationDevice }

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RegistrationVerification { Cluster, DeviceStatus, AcknowledgedObserver }

#[derive(Deserialize)]
struct DeviceStatusResponse { device_broadcast_status: DeviceBroadcastStatus }

#[derive(Deserialize)]
struct DeviceBroadcastStatus { device_id: String }

pub fn verify_device_status(serialized: &[u8], expected_device_identifier: &str) -> Result<(), Failure> {
    if serialized.len() > MAXIMUM_FRAME_BYTES { return Err(Failure::InvalidResponse); }
    let response: DeviceStatusResponse = serde_json::from_slice(serialized).map_err(|_| Failure::InvalidResponse)?;
    if response.device_broadcast_status.device_id != expected_device_identifier { return Err(Failure::InvalidResponse); }
    identifier_segment(expected_device_identifier)?;
    Ok(())
}

pub fn verify_registered_device(cluster: &ConnectCluster, expected_device_identifier: &str, playback_ready: bool) -> Result<RegistrationVerification, Failure> {
    identifier_segment(expected_device_identifier)?;
    if cluster.devices.iter().any(|device| device.identifier == expected_device_identifier) { return Ok(RegistrationVerification::Cluster); }
    if playback_ready { return Err(Failure::InvalidResponse); }
    Ok(RegistrationVerification::AcknowledgedObserver)
}

pub struct NativeConnectSession {
    session: Session,
    token: Option<Token>,
    origin: String,
    registration: PutStateRequest,
    connection_identifier: Option<String>,
    registered: bool,
    registration_attempted: bool,
    publication_state: ConnectPublicationState,
    pub failure_stage: ConnectFailureStage,
    verification: RegistrationVerification,
    catalog_traffic: CatalogSearchTraffic,
    client_token: ClientTokenCache,
    client_token_platform: Option<ClientTokenPlatform>,
}

pub trait ConnectSessionOperations: Send {
    fn device_identifier(&self) -> &str;
    fn account_identifier(&self) -> String;
    fn failure_stage(&self) -> ConnectFailureStage { ConnectFailureStage::DealerEvents }
    fn registration_verification(&self) -> RegistrationVerification { RegistrationVerification::Cluster }
    fn playback_session_identifier(&self) -> Option<&str> { None }
    fn register(&mut self, connection_identifier: String) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send;
    fn refresh(&mut self) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send;
    fn current_membership(&mut self) -> impl Future<Output = Result<Option<ConnectJamMembership>, Failure>> + Send { async { Err(Failure::Unsupported) } }
    fn activate(&mut self, _snapshot: ConnectPublicationSnapshot, _activation: ConnectExplicitActivation,
        _readiness: ConnectActivationPlayerReadiness, _cluster: ConnectCluster, _generation: u64) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send { async { Err(Failure::Unsupported) } }
    fn withdraw(&mut self, _sequence: u64) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send { async { Err(Failure::Unsupported) } }
    fn deactivate(&mut self, _snapshot: ConnectPublicationSnapshot) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send { async { Err(Failure::Unsupported) } }
    fn publish(&mut self, _snapshot: ConnectPublicationSnapshot) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send { async { Err(Failure::Unsupported) } }
    fn command(&mut self, target_device_identifier: &str, body: Value) -> impl Future<Output = Result<ConnectCommandAcknowledgement, Failure>> + Send;
}

impl Drop for NativeConnectSession {
    fn drop(&mut self) { self.session.shutdown(); }
}

pub fn timed_out_request_failure(mutation: bool, observed_rate_limit: bool) -> Failure {
    if observed_rate_limit { Failure::RateLimited } else if mutation { Failure::UnknownOutcome } else { Failure::Deadline }
}

pub fn private_http_status_failure(status: u16, mutation: bool) -> Failure {
        match status {
            INVALID_REQUEST_STATUS => Failure::InvalidInput,
            UNAUTHORIZED_STATUS => Failure::Unauthorized,
            FORBIDDEN_STATUS => Failure::Forbidden,
            NOT_FOUND_STATUS => Failure::NotFound,
            RATE_LIMITED_STATUS => Failure::RateLimited,
            value if value >= MINIMUM_SERVER_FAILURE_STATUS && mutation => Failure::UnknownOutcome,
            _ => Failure::Network,
        }
}

pub fn private_http_failure(failure: librespot_core::Error, mutation: bool) -> Failure {
    if let Some(HttpClientError::StatusCode(status)) = failure.error.downcast_ref() {
        return private_http_status_failure(status.as_u16(), mutation);
    }
    let classified = sanitized_failure(failure);
    if mutation && matches!(classified, Failure::Network | Failure::Deadline | Failure::Canceled) {
        Failure::UnknownOutcome
    } else { classified }
}

fn epoch_milliseconds() -> Result<u64, Failure> {
    let elapsed = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_| Failure::InvalidResponse)?;
    u64::try_from(elapsed.as_millis()).map_err(|_| Failure::InvalidResponse)
}

fn identifier_segment(identifier: &str) -> Result<String, Failure> {
    const MAXIMUM_IDENTIFIER_CHARACTERS: usize = 512;
    const DOT_SEGMENT: &str = ".";
    const PARENT_SEGMENT: &str = "..";
    if identifier.is_empty() || identifier.chars().count() > MAXIMUM_IDENTIFIER_CHARACTERS
        || identifier.contains(char::is_whitespace) || identifier.contains(char::is_control)
        || identifier == DOT_SEGMENT || identifier == PARENT_SEGMENT { return Err(Failure::InvalidInput); }
    Ok(url::form_urlencoded::byte_serialize(identifier.as_bytes()).collect())
}

impl NativeConnectSession {
    pub async fn restore(serialized: &str, configuration: &ConnectDeviceConfiguration) -> Result<Self, Failure> {
        Self::restore_with_client_platform(serialized, configuration, None).await
    }

    pub async fn restore_with_client_platform(serialized: &str, configuration: &ConnectDeviceConfiguration,
        client_token_platform: Option<ClientTokenPlatform>) -> Result<Self, Failure> {
        crate::connect_device::validate_configuration(configuration)?;
        let stored = decode_stored_session(serialized)?;
        let session_configuration = stored_session_configuration(&stored, SessionConfig::default())?;
        let session = Session::new(session_configuration, None);
        let mut owned = Self { session, token: None, origin: String::new(), registration: PutStateRequest::new(),
            connection_identifier: None, registered: false, registration_attempted: false, publication_state: ConnectPublicationState::default(), failure_stage: ConnectFailureStage::Restore,
            verification: RegistrationVerification::Cluster, catalog_traffic: CatalogSearchTraffic::default(), client_token: ClientTokenCache::default(), client_token_platform };
        tokio::time::timeout(Duration::from_secs(AUTHENTICATION_TIMEOUT_SECONDS),
            owned.session.connect(stored.credentials, false)).await.map_err(|_| Failure::Deadline)?.map_err(sanitized_failure)?;
        if owned.session.username() != stored.account_identifier { return Err(Failure::Unauthorized); }
        owned.registration = initial_registration(configuration, owned.session.device_id(), &owned.session.session_id(), epoch_milliseconds()?)?;
        owned.origin = tokio::time::timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS), owned.session.spclient().base_url())
            .await.map_err(|_| Failure::Deadline)?.map_err(sanitized_failure)?;
        owned.access_token().await?;
        Ok(owned)
    }

    pub fn device_identifier(&self) -> &str { self.session.device_id() }
    pub fn account_identifier(&self) -> String { self.session.username() }

    async fn access_token(&mut self) -> Result<String, Failure> {
        if let Some(token) = self.token.as_ref().filter(|token| !token.is_expired()) { return Ok(token.access_token.clone()); }
        let token = tokio::time::timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS), async {
            if self.session.client_id() == desktop_login5::CLIENT_IDENTIFIER { desktop_login5::session_token(&self.session).await }
            else { self.session.login5().auth_token().await.map_err(sanitized_failure) }
        }).await.map_err(|_| Failure::Deadline)??;
        let access_token = token.access_token.clone(); self.token = Some(token); Ok(access_token)
    }

    fn client_token_identity(&self) -> ClientTokenIdentity {
        ClientTokenIdentity { account_identifier: self.session.username(), client_identifier: self.session.client_id(),
            client_token_client_identifier: match std::env::consts::OS {
                ANDROID_PLATFORM | LINUX_PLATFORM | IOS_PLATFORM => SessionConfig::default().client_id,
                _ => self.session.client_id(),
            }, device_identifier: self.session.device_id().to_owned() }
    }

    async fn catalog_client_token(&mut self) -> Result<String, Failure> {
        let identity = self.client_token_identity();
        let now = native_monotonic_milliseconds();
        if let Some(token) = self.client_token.read(&identity, now) { return Ok(token.to_owned()); }
        self.client_token.clear();
        let platform = if let Some(platform) = &self.client_token_platform { platform.clone() } else { match std::env::consts::OS {
            ANDROID_PLATFORM => return Err(Failure::Unsupported),
            LINUX_PLATFORM => ClientTokenPlatform::Linux,
            MACOS_PLATFORM => ClientTokenPlatform::MacOs,
            IOS_PLATFORM => ClientTokenPlatform::Ios,
            WINDOWS_PLATFORM => ClientTokenPlatform::Windows,
            _ => return Err(Failure::Unsupported),
        } };
        let grant = tokio::time::timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS), obtain_client_token(self, &identity, platform))
            .await.map_err(|_| Failure::Deadline)??;
        let token = grant.token.clone();
        self.client_token.remember(identity, grant, native_monotonic_milliseconds())?;
        Ok(token)
    }

    pub async fn dealer_address(&mut self) -> Result<Url, Failure> {
        self.failure_stage = ConnectFailureStage::DealerResolution;
        let (host, port) = self.session.apresolver().resolve(DEALER_SERVICE).await.map_err(sanitized_failure)?;
        if !host.ends_with(SERVICE_HOST_SUFFIX) { return Err(Failure::InvalidResponse); }
        self.failure_stage = ConnectFailureStage::DealerAddress;
        let mut address = Url::parse(&format!("{SECURE_WEBSOCKET_SCHEME}{host}:{port}{EMPTY_PATH}")).map_err(|_| Failure::InvalidResponse)?;
        let access_token = self.access_token().await?;
        address.query_pairs_mut().append_pair(TOKEN_QUERY_PARAMETER, &access_token);
        Ok(address)
    }

    async fn request(&mut self, method: Method, path: String, body: Vec<u8>, media_type: &'static str, purpose: ConnectRequestPurpose) -> Result<Vec<u8>, Failure> {
        if body.len() > MAXIMUM_FRAME_BYTES { return Err(Failure::InvalidInput); }
        require_service_allowed(native_monotonic_milliseconds())?;
        execute_authenticated_request(self, &ConnectHttpRequest { method, path, body, media_type, purpose }).await
    }

    pub async fn register(&mut self, connection_identifier: String) -> Result<ConnectCluster, Failure> {
        if !self.publication_state.permits_observer_registration() { return Err(Failure::Unsupported); }
        self.failure_stage = ConnectFailureStage::RegistrationEncoding;
        self.connection_identifier = Some(connection_identifier);
        self.registration.client_side_timestamp = epoch_milliseconds()?;
        let body = self.registration.write_to_bytes().map_err(|_| Failure::InvalidResponse)?;
        let path = DEVICE_PATH_PREFIX.to_owned() + &identifier_segment(self.device_identifier())?;
        self.registration_attempted = true;
        self.failure_stage = ConnectFailureStage::RegistrationHttp;
        let response = self.request(Method::PUT, path, body, PROTOBUF_MEDIA_TYPE, ConnectRequestPurpose::Observation).await?;
        self.failure_stage = ConnectFailureStage::RegistrationProtobuf;
        let cluster = decode_cluster_snapshot(&response)?;
        self.failure_stage = ConnectFailureStage::RegistrationDevice;
        self.verification = verify_registered_device(&cluster, self.device_identifier(), self.registration.device.device_info.can_play)?;
        self.registered = true;
        self.failure_stage = ConnectFailureStage::DealerEvents;
        Ok(cluster)
    }

    pub async fn refresh(&mut self) -> Result<ConnectCluster, Failure> {
        let connection = self.connection_identifier.clone().ok_or(Failure::InvalidInput)?;
        self.register(connection).await
    }

    pub async fn current_membership(&mut self) -> Result<Option<ConnectJamMembership>, Failure> {
        if !self.registered { return Err(Failure::InvalidInput); }
        match self.request(Method::GET, CURRENT_MEMBERSHIP_PATH.to_owned(), Vec::new(), JSON_MEDIA_TYPE, ConnectRequestPurpose::Membership).await {
            Ok(response) => decode_current_membership(&response).map(Some),
            Err(Failure::NotFound) => Ok(None),
            Err(failure) => Err(failure),
        }
    }

    pub async fn activate(&mut self, snapshot: ConnectPublicationSnapshot, activation: ConnectExplicitActivation,
        readiness: ConnectActivationPlayerReadiness, cluster: ConnectCluster, generation: u64) -> Result<ConnectCluster, Failure> {
        if !self.registered || !self.publication_state.permits_observer_registration() { return Err(Failure::Canceled); }
        let mut registration = self.registration.clone();
        let device = registration.device.mut_or_insert_default().device_info.mut_or_insert_default();
        device.can_play = true;
        let capabilities = device.capabilities.mut_or_insert_default();
        capabilities.can_be_player = true;
        capabilities.hidden = false;
        let publication = build_explicit_activation(&registration, &snapshot, &activation, &readiness, &cluster,
            generation, crate::connect_transport::native_monotonic_milliseconds())?;
        let body = publication.write_to_bytes().map_err(|_| Failure::InvalidInput)?;
        let path = DEVICE_PATH_PREFIX.to_owned() + &identifier_segment(self.device_identifier())?;
        self.publication_state.begin_dispatch(snapshot.sequence)?;
        self.registration = registration;
        let response = self.request(Method::PUT, path, body, PROTOBUF_MEDIA_TYPE, ConnectRequestPurpose::Publication).await?;
        let observed = decode_cluster_snapshot(&response).map_err(|_| Failure::UnknownOutcome)?;
        verify_publication_response(&publication, &observed)?;
        Ok(observed)
    }

    pub async fn withdraw(&mut self, sequence: u64) -> Result<ConnectCluster, Failure> {
        if !self.registered { return Err(Failure::Canceled); }
        let observer = build_withdrawal(&self.registration, epoch_milliseconds()?)?;
        let body = observer.write_to_bytes().map_err(|_| Failure::InvalidInput)?;
        let path = DEVICE_PATH_PREFIX.to_owned() + &identifier_segment(self.device_identifier())?;
        self.publication_state.begin_dispatch(sequence)?;
        let response = self.request(Method::PUT, path, body, PROTOBUF_MEDIA_TYPE, ConnectRequestPurpose::Publication).await?;
        let observed = decode_cluster_snapshot(&response).map_err(|_| Failure::UnknownOutcome)?;
        if observed.active_device_identifier == self.device_identifier() { return Err(Failure::UnknownOutcome); }
        self.registration = observer;
        self.publication_state.complete_deactivation();
        Ok(observed)
    }

    pub async fn deactivate(&mut self, snapshot: ConnectPublicationSnapshot) -> Result<ConnectCluster, Failure> {
        if !self.registered { return Err(Failure::Canceled); }
        let timestamp = publication_server_timestamp(&snapshot, crate::connect_transport::native_monotonic_milliseconds())?;
        let publication = build_deactivation(&self.registration, &snapshot, timestamp)?;
        let body = publication.write_to_bytes().map_err(|_| Failure::InvalidInput)?;
        let path = DEVICE_PATH_PREFIX.to_owned() + &identifier_segment(self.device_identifier())?;
        self.publication_state.begin_dispatch(snapshot.sequence)?;
        let response = self.request(Method::PUT, path, body, PROTOBUF_MEDIA_TYPE, ConnectRequestPurpose::Publication).await?;
        let observed = decode_cluster_snapshot(&response).map_err(|_| Failure::UnknownOutcome)?;
        if observed.active_device_identifier == self.device_identifier() { return Err(Failure::UnknownOutcome); }
        self.registration = publication;
        self.publication_state.complete_deactivation();
        Ok(observed)
    }

    pub async fn publish(&mut self, snapshot: ConnectPublicationSnapshot) -> Result<ConnectCluster, Failure> {
        if !self.registered { return Err(Failure::Canceled); }
        let publication_timestamp_milliseconds = publication_server_timestamp(&snapshot, crate::connect_transport::native_monotonic_milliseconds())?;
        let publication = build_publication(&self.registration, &snapshot, publication_timestamp_milliseconds)?;
        let body = publication.write_to_bytes().map_err(|_| Failure::InvalidInput)?;
        let path = DEVICE_PATH_PREFIX.to_owned() + &identifier_segment(self.device_identifier())?;
        self.publication_state.begin_dispatch(snapshot.sequence)?;
        let response = self.request(Method::PUT, path, body, PROTOBUF_MEDIA_TYPE, ConnectRequestPurpose::Publication).await?;
        let observed = decode_cluster_snapshot(&response).map_err(|_| Failure::UnknownOutcome)?;
        verify_publication_response(&publication, &observed)?;
        Ok(observed)
    }

    pub async fn command(&mut self, target_device_identifier: &str, body: serde_json::Value) -> Result<ConnectCommandAcknowledgement, Failure> {
        if !self.registered { return Err(Failure::InvalidInput); }
        let path = COMMAND_PATH_PREFIX.to_owned() + &identifier_segment(self.device_identifier())?
            + COMMAND_TARGET_SEPARATOR + &identifier_segment(target_device_identifier)?;
        let body = serde_json::to_vec(&body).map_err(|_| Failure::InvalidInput)?;
        let response = self.request(Method::POST, path, body, JSON_MEDIA_TYPE, ConnectRequestPurpose::Command).await?;
        Ok(decode_command_acknowledgement(&response))
    }

    pub async fn close(&mut self) -> Result<(), Failure> {
        if !self.registered && !self.registration_attempted { return Ok(()); }
        let path = DEVICE_PATH_PREFIX.to_owned() + &identifier_segment(self.device_identifier())?;
        match self.request(Method::DELETE, path, Vec::new(), PROTOBUF_MEDIA_TYPE, ConnectRequestPurpose::Removal).await {
            Ok(_) | Err(Failure::NotFound) => { self.registered = false; self.registration_attempted = false; Ok(()) },
            Err(failure) => Err(failure),
        }
    }
}

impl ConnectSessionOperations for NativeConnectSession {
    fn device_identifier(&self) -> &str { NativeConnectSession::device_identifier(self) }
    fn account_identifier(&self) -> String { NativeConnectSession::account_identifier(self) }
    fn failure_stage(&self) -> ConnectFailureStage { self.failure_stage }
    fn registration_verification(&self) -> RegistrationVerification { self.verification }
    fn playback_session_identifier(&self) -> Option<&str> { Some(&self.registration.device.player_state.session_id) }
    fn register(&mut self, connection_identifier: String) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send {
        NativeConnectSession::register(self, connection_identifier)
    }
    fn refresh(&mut self) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send { NativeConnectSession::refresh(self) }
    fn current_membership(&mut self) -> impl Future<Output = Result<Option<ConnectJamMembership>, Failure>> + Send { NativeConnectSession::current_membership(self) }
    fn activate(&mut self, snapshot: ConnectPublicationSnapshot, activation: ConnectExplicitActivation,
        readiness: ConnectActivationPlayerReadiness, cluster: ConnectCluster, generation: u64) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send {
        NativeConnectSession::activate(self, snapshot, activation, readiness, cluster, generation)
    }
    fn withdraw(&mut self, sequence: u64) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send {
        NativeConnectSession::withdraw(self, sequence)
    }
    fn deactivate(&mut self, snapshot: ConnectPublicationSnapshot) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send {
        NativeConnectSession::deactivate(self, snapshot)
    }
    fn publish(&mut self, snapshot: ConnectPublicationSnapshot) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send { NativeConnectSession::publish(self, snapshot) }
    fn command(&mut self, target_device_identifier: &str, body: Value) -> impl Future<Output = Result<ConnectCommandAcknowledgement, Failure>> + Send {
        NativeConnectSession::command(self, target_device_identifier, body)
    }
}

impl ConnectMetadataOperations for NativeConnectSession {
    async fn metadata(&mut self, identifiers: Vec<String>) -> Result<Vec<ConnectTrackMetadata>, Failure> {
        let body = encode_metadata_request(&identifiers)?;
        let response = self.request(Method::POST, METADATA_PATH.to_owned(), body, PROTOBUF_MEDIA_TYPE, ConnectRequestPurpose::Metadata).await?;
        decode_metadata_response(&identifiers, &response)
    }
}

impl ConnectSearchOperations for NativeConnectSession {
    async fn search(&mut self, input: ConnectSearchInput) -> Result<Vec<ConnectSearchTrack>, Failure> {
        let input = input.for_account_country(&self.session.country())?;
        if let Some(cached) = self.catalog_traffic.cached(&input, native_monotonic_milliseconds()) {
            SearchDiagnostic::new(SearchDiagnosticStage::Decode, None, None)
                .traffic(self.catalog_traffic.dispatch_count(), self.catalog_traffic.cooldown_remaining_seconds(native_monotonic_milliseconds())).emit();
            return Ok(cached);
        }
        let now = native_monotonic_milliseconds();
        self.catalog_traffic.require_allowed(now).map_err(|failure| {
            SearchDiagnostic::new(SearchDiagnosticStage::DispatchAdmission, None, Some(failure))
                .traffic(self.catalog_traffic.dispatch_count(), self.catalog_traffic.cooldown_remaining_seconds(now)).emit();
            failure
        })?;
        let request = search_request(&input)?;
        let response = execute_authenticated_request(self, &request).await.map_err(|failure| {
            let failure = if failure == Failure::Deadline && self.catalog_traffic.observed_rate_limit() { Failure::RateLimited } else { failure };
            SearchDiagnostic::new(SearchDiagnosticStage::RequestCompletion, None, Some(failure)).emit(); failure
        })?;
        let decoded = decode_search_response(&input, &response);
        if let Ok(tracks) = &decoded { self.catalog_traffic.remember(input, tracks.clone(), native_monotonic_milliseconds()); }
        SearchDiagnostic::new(SearchDiagnosticStage::Decode, None, decoded.as_ref().err().copied()).emit();
        decoded
    }
}

impl ConnectAuthenticatedDispatch for NativeConnectSession {
    fn supports_rejected_token_renewal(&self) -> bool { self.session.client_id() == desktop_login5::CLIENT_IDENTIFIER }
    async fn access_token(&mut self) -> Result<String, Failure> { NativeConnectSession::access_token(self).await }
    fn discard_access_token(&mut self) { self.token = None; }
    async fn dispatch_once(&mut self, request: &ConnectHttpRequest, access_token: &str) -> Result<Vec<u8>, Failure> {
        let purpose = request.purpose;
        let mutation = purpose.is_mutation();
        let request_body = request.body.clone();
        let catalog_search = matches!(request.purpose, ConnectRequestPurpose::CatalogSearch);
        if !catalog_search { require_service_allowed(native_monotonic_milliseconds())?; }
        let address = if catalog_search { search_address(request)?.to_string() } else { self.origin.clone() + &request.path };
        if catalog_search {
            let now = native_monotonic_milliseconds();
            if let Err(failure) = self.catalog_traffic.require_allowed(now) {
                SearchDiagnostic::new(SearchDiagnosticStage::DispatchAdmission, None, Some(failure))
                    .traffic(self.catalog_traffic.dispatch_count(), self.catalog_traffic.cooldown_remaining_seconds(now)).emit();
                return Err(failure);
            }
            let wait_milliseconds = self.catalog_traffic.minimum_wait_milliseconds(now);
            tokio::time::sleep(Duration::from_millis(wait_milliseconds)).await;
        }
        let client_token = if catalog_search { Some(self.catalog_client_token().await.map_err(|failure| { SearchDiagnostic::client_token(None, Some(failure))
            .traffic(self.catalog_traffic.dispatch_count(), self.catalog_traffic.cooldown_remaining_seconds(native_monotonic_milliseconds())).emit(); failure })?) } else { None };
        let mut request = Request::builder().method(request.method.clone()).uri(address)
            .header(AUTHORIZATION_HEADER, BEARER_PREFIX.to_owned() + access_token)
            .header(ACCEPT_HEADER, request.media_type).header(CONTENT_TYPE_HEADER, request.media_type);
        if let Some(client_token) = client_token {
            request = request.header(CLIENT_TOKEN_HEADER, client_token).header(PARTNER_ORIGIN_HEADER, PARTNER_ORIGIN)
                .header(PARTNER_REFERER_HEADER, PARTNER_ORIGIN);
        }
        if !catalog_search {
            if let Some(connection) = self.connection_identifier.as_ref() { request = request.header(CONNECTION_HEADER, connection); }
        }
        let request = request.body(request_body.into()).map_err(|_| Failure::InvalidInput)?;
        let dispatch = async {
            let admitted = self.session.http_client().request_fut(request)
                .map_err(|failure| {
                    let status = match failure.error.downcast_ref() { Some(HttpClientError::StatusCode(status)) => Some(*status), _ => None };
                    let failure = private_http_failure(failure, mutation);
                    if !catalog_search { ConnectRequestDiagnostic::admission(purpose, status, failure).emit(); }
                    if catalog_search { SearchDiagnostic::new(SearchDiagnosticStage::DispatchAdmission, status, Some(failure)).emit(); }
                    failure
                })?;
            if catalog_search { self.catalog_traffic.dispatched(native_monotonic_milliseconds()); }
            let response = admitted.await.map_err(|failure| {
                    let failure = private_http_failure(failure.into(), mutation);
                    if catalog_search { SearchDiagnostic::new(SearchDiagnosticStage::Transport, None, Some(failure)).emit(); }
                    failure
                })?;
            let status = response.status();
            if !catalog_search {
                let retry_seconds = retry_after_seconds(response.headers());
                ConnectRequestDiagnostic::response(purpose, status, retry_seconds).emit();
                if status.as_u16() == RATE_LIMITED_STATUS { observe_service_cooldown(native_monotonic_milliseconds(), retry_seconds)?; }
            }
            if catalog_search && status.as_u16() == RATE_LIMITED_STATUS {
                let retry_seconds = retry_after_seconds(response.headers());
                self.catalog_traffic.rate_limited(native_monotonic_milliseconds(), retry_seconds);
                SearchDiagnostic::new(SearchDiagnosticStage::HttpResponse, Some(status), Some(Failure::RateLimited))
                    .traffic(self.catalog_traffic.dispatch_count(), self.catalog_traffic.cooldown_remaining_seconds(native_monotonic_milliseconds()))
                    .rate_limit(retry_seconds, false).emit();
                let mut body = response.into_body();
                let quota = tokio::time::timeout(Duration::from_millis(RATE_LIMIT_BODY_TIMEOUT_MILLISECONDS), async {
                    let mut received = Vec::new();
                    while let Some(frame) = body.frame().await {
                        let Ok(frame) = frame else { return false; };
                        if let Ok(bytes) = frame.into_data() {
                            if received.len().saturating_add(bytes.len()) > MAXIMUM_RATE_LIMIT_BODY_BYTES { return false; }
                            received.extend_from_slice(&bytes);
                        }
                    }
                    quota_exceeded(&received)
                }).await.unwrap_or(false);
                if quota {
                    SearchDiagnostic::new(SearchDiagnosticStage::ResponseBody, Some(status), Some(Failure::RateLimited))
                        .traffic(self.catalog_traffic.dispatch_count(), self.catalog_traffic.cooldown_remaining_seconds(native_monotonic_milliseconds()))
                        .rate_limit(retry_seconds, true).emit();
                }
                return Err(Failure::RateLimited);
            }
            if catalog_search { SearchDiagnostic::new(SearchDiagnosticStage::HttpResponse, Some(status),
                (!status.is_success()).then(|| private_http_status_failure(status.as_u16(), mutation)))
                .traffic(self.catalog_traffic.dispatch_count(), None).emit(); }
            if catalog_search && status.as_u16() == UNAUTHORIZED_STATUS { self.client_token.clear(); }
            if !status.is_success() { return Err(private_http_status_failure(status.as_u16(), mutation)); }
            let mut body = response.into_body();
            let mut received = Vec::new();
            while let Some(frame) = body.frame().await {
                let frame = frame.map_err(|_| if mutation { Failure::UnknownOutcome } else { Failure::Network })?;
                if let Ok(bytes) = frame.into_data() {
                    if received.len().saturating_add(bytes.len()) > MAXIMUM_FRAME_BYTES {
                        let failure = if mutation { Failure::UnknownOutcome } else { Failure::Backpressure };
                        if catalog_search { SearchDiagnostic::new(SearchDiagnosticStage::ResponseBody, Some(status), Some(failure)).emit(); }
                        return Err(failure);
                    }
                    received.extend_from_slice(&bytes);
                }
            }
            Ok(received)
        };
        match tokio::time::timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS), dispatch).await {
            Ok(result) => result,
            Err(_) => Err(timed_out_request_failure(mutation, catalog_search
                && self.catalog_traffic.observed_rate_limit())),
        }
    }
}

impl ClientTokenExchange for NativeConnectSession {
    fn is_current(&self, identity: &ClientTokenIdentity) -> bool { self.client_token_identity() == *identity }
    async fn dispatch(&mut self, body: Vec<u8>) -> Result<Vec<u8>, Failure> {
        self.catalog_traffic.require_allowed(native_monotonic_milliseconds())?;
        let request = Request::builder().method(Method::POST).uri(CLIENT_TOKEN_ADDRESS)
            .header(ACCEPT_HEADER, PROTOBUF_MEDIA_TYPE).header(CONTENT_TYPE_HEADER, PROTOBUF_MEDIA_TYPE)
            .body(body.into()).map_err(|_| Failure::InvalidInput)?;
        let response = self.session.http_client().request_fut(request).map_err(|failure| private_http_failure(failure, false))?
            .await.map_err(|_| Failure::Network)?;
        let status = response.status();
        if status.as_u16() == RATE_LIMITED_STATUS {
            self.catalog_traffic.rate_limited(native_monotonic_milliseconds(), retry_after_seconds(response.headers()));
        }
        if !status.is_success() {
            let failure = if status.as_u16() == UNAUTHORIZED_STATUS { Failure::NativeTokenRejected }
                else { private_http_status_failure(status.as_u16(), false) };
            SearchDiagnostic::client_token(Some(status), Some(failure))
                .traffic(self.catalog_traffic.dispatch_count(), self.catalog_traffic.cooldown_remaining_seconds(native_monotonic_milliseconds())).emit();
            return Err(failure);
        }
        let mut body = response.into_body(); let mut received = Vec::new();
        while let Some(frame) = body.frame().await {
            let frame = frame.map_err(|_| Failure::Network)?;
            if let Ok(bytes) = frame.into_data() {
                if received.len().saturating_add(bytes.len()) > MAXIMUM_CLIENT_TOKEN_RESPONSE_BYTES { return Err(Failure::Backpressure); }
                received.extend_from_slice(&bytes);
            }
        }
        SearchDiagnostic::client_token(Some(status), None).emit();
        Ok(received)
    }
    async fn solve(&mut self, prefix: Vec<u8>, difficulty: i32) -> Result<Vec<u8>, Failure> {
        tokio::task::spawn_blocking(move || {
            let mut suffix = [u8::default(); HASHCASH_SUFFIX_BYTES];
            librespot_core::util::solve_hash_cash(&[], &prefix, difficulty, &mut suffix).map_err(sanitized_failure)?;
            Ok(suffix.to_vec())
        }).await.map_err(|_| Failure::Canceled)?
    }
}
