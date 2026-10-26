use std::{future::Future, time::{Duration, SystemTime, UNIX_EPOCH}};

use http::{Method, Request};
use http_body_util::BodyExt;
use librespot_core::{http_client::HttpClientError, token::Token, Session, SessionConfig};
use librespot_protocol::connect::PutStateRequest;
use protobuf::Message;
use serde_json::Value;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{connect_metadata::{ConnectMetadataOperations, ConnectTrackMetadata, encode_metadata_request, decode_metadata_response, METADATA_PATH}, connect_device::{initial_registration, ConnectDeviceConfiguration},
    connect_wire::{decode_cluster_snapshot, ConnectCluster, MAXIMUM_FRAME_BYTES},
    desktop_login5, model::{decode_stored_session, Failure}, session::{sanitized_failure, stored_session_configuration}};

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
    pub failure_stage: ConnectFailureStage,
    verification: RegistrationVerification,
}

pub trait ConnectSessionOperations: Send {
    fn device_identifier(&self) -> &str;
    fn account_identifier(&self) -> String;
    fn failure_stage(&self) -> ConnectFailureStage { ConnectFailureStage::DealerEvents }
    fn registration_verification(&self) -> RegistrationVerification { RegistrationVerification::Cluster }
    fn register(&mut self, connection_identifier: String) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send;
    fn refresh(&mut self) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send;
    fn command(&mut self, target_device_identifier: &str, body: Value) -> impl Future<Output = Result<(), Failure>> + Send;
}

impl Drop for NativeConnectSession {
    fn drop(&mut self) { self.session.shutdown(); }
}

pub fn private_http_status_failure(status: u16, mutation: bool) -> Failure {
        match status {
            INVALID_REQUEST_STATUS => Failure::InvalidInput,
            UNAUTHORIZED_STATUS => Failure::Unauthorized,
            FORBIDDEN_STATUS => Failure::Forbidden,
            NOT_FOUND_STATUS => Failure::NotFound,
            RATE_LIMITED_STATUS => Failure::Backpressure,
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
        crate::connect_device::validate_configuration(configuration)?;
        let stored = decode_stored_session(serialized)?;
        let session_configuration = stored_session_configuration(&stored, SessionConfig::default())?;
        let session = Session::new(session_configuration, None);
        let mut owned = Self { session, token: None, origin: String::new(), registration: PutStateRequest::new(),
            connection_identifier: None, registered: false, registration_attempted: false, failure_stage: ConnectFailureStage::Restore,
            verification: RegistrationVerification::Cluster };
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

    async fn request(&mut self, method: Method, path: String, body: Vec<u8>, media_type: &str, mutation: bool) -> Result<Vec<u8>, Failure> {
        if body.len() > MAXIMUM_FRAME_BYTES { return Err(Failure::InvalidInput); }
        let token = self.access_token().await?;
        let mut request = Request::builder().method(method).uri(self.origin.clone() + &path)
            .header(AUTHORIZATION_HEADER, BEARER_PREFIX.to_owned() + &token)
            .header(ACCEPT_HEADER, media_type).header(CONTENT_TYPE_HEADER, media_type);
        if let Some(connection) = self.connection_identifier.as_ref() { request = request.header(CONNECTION_HEADER, connection); }
        let request = request.body(body.into()).map_err(|_| Failure::InvalidInput)?;
        let dispatch = async {
            let response = self.session.http_client().request_fut(request)
                .map_err(|failure| private_http_failure(failure, mutation))?.await
                .map_err(|failure| private_http_failure(failure.into(), mutation))?;
            if !response.status().is_success() { return Err(private_http_status_failure(response.status().as_u16(), mutation)); }
            let mut body = response.into_body();
            let mut received = Vec::new();
            while let Some(frame) = body.frame().await {
                let frame = frame.map_err(|_| if mutation { Failure::UnknownOutcome } else { Failure::Network })?;
                if let Ok(bytes) = frame.into_data() {
                    if received.len().saturating_add(bytes.len()) > MAXIMUM_FRAME_BYTES {
                        return Err(if mutation { Failure::UnknownOutcome } else { Failure::Backpressure });
                    }
                    received.extend_from_slice(&bytes);
                }
            }
            Ok(received)
        };
        tokio::time::timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS), dispatch)
            .await.map_err(|_| if mutation { Failure::UnknownOutcome } else { Failure::Deadline })?
    }

    pub async fn register(&mut self, connection_identifier: String) -> Result<ConnectCluster, Failure> {
        self.failure_stage = ConnectFailureStage::RegistrationEncoding;
        self.connection_identifier = Some(connection_identifier);
        self.registration.client_side_timestamp = epoch_milliseconds()?;
        let body = self.registration.write_to_bytes().map_err(|_| Failure::InvalidResponse)?;
        let path = DEVICE_PATH_PREFIX.to_owned() + &identifier_segment(self.device_identifier())?;
        self.registration_attempted = true;
        self.failure_stage = ConnectFailureStage::RegistrationHttp;
        let response = self.request(Method::PUT, path, body, PROTOBUF_MEDIA_TYPE, false).await?;
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

    pub async fn command(&mut self, target_device_identifier: &str, body: serde_json::Value) -> Result<(), Failure> {
        if !self.registered { return Err(Failure::InvalidInput); }
        let path = COMMAND_PATH_PREFIX.to_owned() + &identifier_segment(self.device_identifier())?
            + COMMAND_TARGET_SEPARATOR + &identifier_segment(target_device_identifier)?;
        let body = serde_json::to_vec(&body).map_err(|_| Failure::InvalidInput)?;
        self.request(Method::POST, path, body, JSON_MEDIA_TYPE, true).await?;
        Ok(())
    }

    pub async fn close(&mut self) -> Result<(), Failure> {
        if !self.registered && !self.registration_attempted { return Ok(()); }
        let path = DEVICE_PATH_PREFIX.to_owned() + &identifier_segment(self.device_identifier())?;
        match self.request(Method::DELETE, path, Vec::new(), PROTOBUF_MEDIA_TYPE, false).await {
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
    fn register(&mut self, connection_identifier: String) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send {
        NativeConnectSession::register(self, connection_identifier)
    }
    fn refresh(&mut self) -> impl Future<Output = Result<ConnectCluster, Failure>> + Send { NativeConnectSession::refresh(self) }
    fn command(&mut self, target_device_identifier: &str, body: Value) -> impl Future<Output = Result<(), Failure>> + Send {
        NativeConnectSession::command(self, target_device_identifier, body)
    }
}

impl ConnectMetadataOperations for NativeConnectSession {
    async fn metadata(&mut self, identifiers: Vec<String>) -> Result<Vec<ConnectTrackMetadata>, Failure> {
        let body = encode_metadata_request(&identifiers)?;
        let response = self.request(Method::POST, METADATA_PATH.to_owned(), body, PROTOBUF_MEDIA_TYPE, false).await?;
        decode_metadata_response(&identifiers, &response)
    }
}
