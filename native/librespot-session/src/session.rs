use std::time::{SystemTime, UNIX_EPOCH};

use librespot_core::{authentication::Credentials, error::ErrorKind, Session, SessionConfig};
use librespot_protocol::authentication::AuthenticationType;

use crate::model::{decode_stored_session, validate_grant, validate_password_input, Failure, SessionGrant, StoredSession, SCHEMA_VERSION};

const MAXIMUM_EPOCH_MILLISECONDS: u128 = u64::MAX as u128;

struct SessionLifetime(Session);

impl Drop for SessionLifetime {
    fn drop(&mut self) {
        self.0.shutdown();
    }
}

pub fn sanitized_failure(failure: librespot_core::Error) -> Failure {
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
    let mut configuration = SessionConfig::default();
    if configuration.client_id != stored.client_identifier {
        return Err(Failure::Unauthorized);
    }
    configuration.device_id = stored.device_identifier;
    let session = SessionLifetime(Session::new(configuration, None));
    session.0.connect(stored.credentials, false).await.map_err(sanitized_failure)?;
    if session.0.username() != stored.account_identifier {
        return Err(Failure::Unauthorized);
    }
    grant(&session.0).await
}

async fn grant(session: &Session) -> Result<SessionGrant, Failure> {
    let token = session.login5().auth_token().await.map_err(sanitized_failure)?;
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
