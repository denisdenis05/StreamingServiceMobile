use std::{future::Future, time::{SystemTime, UNIX_EPOCH}};

use librespot_core::{authentication::Credentials, error::ErrorKind, Session, SessionConfig};
use librespot_protocol::authentication::AuthenticationType;

use crate::model::{decode_stored_session, validate_bootstrap_token, validate_grant, validate_password_input, Failure, SessionGrant, StoredSession, SCHEMA_VERSION};

const MAXIMUM_EPOCH_MILLISECONDS: u128 = u64::MAX as u128;
const UNAUTHORIZED_STATUS: i32 = 401;
const ACCOUNT_RESTRICTED_STATUS: i32 = 402;
const FORBIDDEN_STATUS: i32 = 403;
const RATE_LIMITED_STATUS: i32 = 429;
pub const DEVICE_AUTHORIZATION_CLIENT_IDENTIFIER: &str = "65b708073fc0480ea92a077233ca87bd";
pub const DEVICE_AUTHORIZATION_TOKEN_SCOPES: &str = "streaming,user-read-private,user-read-playback-state,user-read-currently-playing,user-modify-playback-state";

pub fn authentication_stage_failure(failure: Failure, rejected_stage: Failure) -> Failure {
    match failure {
        Failure::Unauthorized | Failure::InvalidInput | Failure::InvalidResponse => rejected_stage,
        _ => failure,
    }
}

pub async fn request_session_token<Token, DesktopRequest, DesktopResponse, MobileRequest, MobileResponse>(
    client_identifier: &str,
    desktop_request: DesktopRequest,
    mobile_request: MobileRequest,
) -> Result<Token, Failure>
where
    DesktopRequest: FnOnce() -> DesktopResponse,
    DesktopResponse: Future<Output = Result<Token, Failure>>,
    MobileRequest: FnOnce() -> MobileResponse,
    MobileResponse: Future<Output = Result<Token, Failure>>,
{
    if client_identifier == DEVICE_AUTHORIZATION_CLIENT_IDENTIFIER {
        desktop_request().await
    } else {
        mobile_request().await
    }
}

struct SessionLifetime(Session);

impl Drop for SessionLifetime {
    fn drop(&mut self) {
        self.0.shutdown();
    }
}

pub fn sanitized_failure(failure: librespot_core::Error) -> Failure {
    if let Some(librespot_core::mercury::MercuryError::Response(response)) = failure.error.downcast_ref() {
        return match response.status_code {
            UNAUTHORIZED_STATUS | ACCOUNT_RESTRICTED_STATUS | FORBIDDEN_STATUS => Failure::Unauthorized,
            RATE_LIMITED_STATUS => Failure::Backpressure,
            _ => Failure::Network,
        };
    }
    match failure.kind {
        ErrorKind::Cancelled | ErrorKind::Aborted => Failure::Canceled,
        ErrorKind::Unauthenticated | ErrorKind::PermissionDenied | ErrorKind::FailedPrecondition => Failure::Unauthorized,
        ErrorKind::Unimplemented => Failure::Unsupported,
        ErrorKind::InvalidArgument | ErrorKind::OutOfRange => Failure::InvalidInput,
        ErrorKind::DeadlineExceeded => Failure::Deadline,
        ErrorKind::ResourceExhausted => Failure::Backpressure,
        _ => Failure::Network,
    }
}

pub async fn login(username: String, password: String) -> Result<SessionGrant, Failure> {
    validate_password_input(&username, &password)?;
    let session = SessionLifetime(Session::new(SessionConfig::default(), None));
    let (token, _) = session.0.login5().login(username, password).await.map_err(sanitized_failure)?;
    session.0.connect(Credentials::with_access_token(token.access_token), false).await.map_err(sanitized_failure)?;
    grant(&session.0).await
}

pub async fn restore(serialized: String) -> Result<SessionGrant, Failure> {
    let stored = decode_stored_session(&serialized)?;
    let configuration = stored_session_configuration(&stored, SessionConfig::default())?;
    let session = SessionLifetime(Session::new(configuration, None));
    session.0.connect(stored.credentials, false).await.map_err(sanitized_failure)?;
    if session.0.username() != stored.account_identifier {
        return Err(Failure::Unauthorized);
    }
    grant(&session.0).await
}

pub fn stored_session_configuration(stored: &StoredSession, mut configuration: SessionConfig) -> Result<SessionConfig, Failure> {
    if configuration.client_id != stored.client_identifier && stored.client_identifier != DEVICE_AUTHORIZATION_CLIENT_IDENTIFIER {
        return Err(Failure::Unauthorized);
    }
    configuration.client_id.clone_from(&stored.client_identifier);
    configuration.device_id.clone_from(&stored.device_identifier);
    Ok(configuration)
}

pub async fn bootstrap(access_token: String) -> Result<SessionGrant, Failure> {
    validate_bootstrap_token(&access_token)?;
    let mut configuration = SessionConfig::default();
    configuration.client_id = DEVICE_AUTHORIZATION_CLIENT_IDENTIFIER.to_owned();
    let session = SessionLifetime(Session::new(configuration, None));
    session.0.connect(Credentials::with_access_token(access_token), false).await
        .map_err(|failure| authentication_stage_failure(sanitized_failure(failure), Failure::NativeSessionRejected))?;
    grant(&session.0).await
}

async fn grant(session: &Session) -> Result<SessionGrant, Failure> {
    let token = request_session_token(&session.client_id(),
        || async { session.token_provider().get_token(DEVICE_AUTHORIZATION_TOKEN_SCOPES).await.map_err(sanitized_failure) },
        || async { session.login5().auth_token().await.map_err(sanitized_failure) },
    ).await.map_err(|failure| authentication_stage_failure(failure, Failure::NativeTokenRejected))?;
    let account_identifier = session.username();
    let stored = StoredSession {
        schema_version: SCHEMA_VERSION,
        account_identifier: account_identifier.clone(),
        device_identifier: session.device_id().to_owned(),
        client_identifier: session.client_id(),
        credentials: Credentials {
            username: Some(account_identifier.clone()),
            auth_type: AuthenticationType::AUTHENTICATION_STORED_SPOTIFY_CREDENTIALS,
            auth_data: session.auth_data(),
        },
    };
    let expiration = token.timestamp.checked_add(token.expires_in).ok_or(Failure::InvalidResponse)?;
    let grant = SessionGrant {
        account_identifier,
        access_token: token.access_token,
        expires_at_milliseconds: epoch_milliseconds(expiration)?,
        stored_credential: serde_json::to_string(&stored).map_err(|_| Failure::InvalidResponse)?,
    };
    validate_grant(&grant, epoch_milliseconds(SystemTime::now())?)?;
    Ok(grant)
}

fn epoch_milliseconds(time: SystemTime) -> Result<u64, Failure> {
    let milliseconds = time.duration_since(UNIX_EPOCH).map_err(|_| Failure::InvalidResponse)?.as_millis();
    if milliseconds > MAXIMUM_EPOCH_MILLISECONDS {
        return Err(Failure::InvalidResponse);
    }
    Ok(milliseconds as u64)
}
