use librespot_core::authentication::Credentials;
use serde::{Deserialize, Serialize};

pub const MAXIMUM_REQUEST_CHARACTERS: usize = 128;
pub const MAXIMUM_USERNAME_CHARACTERS: usize = 512;
pub const MAXIMUM_PASSWORD_CHARACTERS: usize = 4096;
pub const MAXIMUM_STORED_CHARACTERS: usize = 65536;
pub const MAXIMUM_TOKEN_CHARACTERS: usize = 16384;
pub const SCHEMA_VERSION: u8 = 1;
const EMPTY_LENGTH: usize = 0;
const MAXIMUM_DEVICE_CHARACTERS: usize = 128;
const MAXIMUM_CLIENT_CHARACTERS: usize = 128;
const MINIMUM_EXPIRATION_MILLISECONDS: u64 = 1;

const INVALID_INPUT_CODE: &str = "invalid-input";
const INVALID_RESPONSE_CODE: &str = "invalid-response";
const CANCELED_CODE: &str = "canceled";
const UNAUTHORIZED_CODE: &str = "unauthorized";
const NETWORK_CODE: &str = "network";
const DEADLINE_CODE: &str = "deadline";
const UNSUPPORTED_CODE: &str = "unsupported";
const BACKPRESSURE_CODE: &str = "backpressure";
const NATIVE_SESSION_REJECTED_CODE: &str = "native-session-rejected";
const NATIVE_TOKEN_REJECTED_CODE: &str = "native-token-rejected";
const FORBIDDEN_CODE: &str = "forbidden";
const NOT_FOUND_CODE: &str = "not-found";
const UNKNOWN_OUTCOME_CODE: &str = "unknown-outcome";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Failure {
    InvalidInput,
    InvalidResponse,
    Canceled,
    Unauthorized,
    Network,
    Deadline,
    Unsupported,
    Backpressure,
    NativeSessionRejected,
    NativeTokenRejected,
    Forbidden,
    NotFound,
    UnknownOutcome,
}

impl Failure {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidInput => INVALID_INPUT_CODE,
            Self::InvalidResponse => INVALID_RESPONSE_CODE,
            Self::Canceled => CANCELED_CODE,
            Self::Unauthorized => UNAUTHORIZED_CODE,
            Self::Network => NETWORK_CODE,
            Self::Deadline => DEADLINE_CODE,
            Self::Unsupported => UNSUPPORTED_CODE,
            Self::Backpressure => BACKPRESSURE_CODE,
            Self::NativeSessionRejected => NATIVE_SESSION_REJECTED_CODE,
            Self::NativeTokenRejected => NATIVE_TOKEN_REJECTED_CODE,
            Self::Forbidden => FORBIDDEN_CODE,
            Self::NotFound => NOT_FOUND_CODE,
            Self::UnknownOutcome => UNKNOWN_OUTCOME_CODE,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoredSession {
    pub schema_version: u8,
    pub account_identifier: String,
    pub device_identifier: String,
    pub client_identifier: String,
    pub credentials: Credentials,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionGrant {
    pub account_identifier: String,
    pub access_token: String,
    pub expires_at_milliseconds: u64,
    pub stored_credential: String,
}

pub fn bounded_text(value: &str, maximum_characters: usize) -> bool {
    let length = value.chars().count();
    length > EMPTY_LENGTH && length <= maximum_characters && !value.contains(char::is_control)
}

pub fn validate_request_identifier(value: &str) -> Result<(), Failure> {
    if bounded_text(value, MAXIMUM_REQUEST_CHARACTERS) {
        Ok(())
    } else {
        Err(Failure::InvalidInput)
    }
}

pub fn validate_password_input(username: &str, password: &str) -> Result<(), Failure> {
    if bounded_text(username, MAXIMUM_USERNAME_CHARACTERS)
        && username.trim() == username
        && bounded_text(password, MAXIMUM_PASSWORD_CHARACTERS)
    {
        Ok(())
    } else {
        Err(Failure::InvalidInput)
    }
}

pub fn validate_bootstrap_token(access_token: &str) -> Result<(), Failure> {
    if bounded_text(access_token, MAXIMUM_TOKEN_CHARACTERS) && !access_token.contains(char::is_whitespace) {
        Ok(())
    } else {
        Err(Failure::InvalidInput)
    }
}

pub fn decode_stored_session(serialized: &str) -> Result<StoredSession, Failure> {
    if serialized.len() > MAXIMUM_STORED_CHARACTERS {
        return Err(Failure::InvalidInput);
    }
    let stored: StoredSession = serde_json::from_str(serialized).map_err(|_| Failure::InvalidInput)?;
    if stored.schema_version != SCHEMA_VERSION
        || !bounded_text(&stored.account_identifier, MAXIMUM_USERNAME_CHARACTERS)
        || !bounded_text(&stored.device_identifier, MAXIMUM_DEVICE_CHARACTERS)
        || !bounded_text(&stored.client_identifier, MAXIMUM_CLIENT_CHARACTERS)
        || stored.credentials.username.as_ref() != Some(&stored.account_identifier)
        || stored.credentials.auth_data.is_empty()
        || stored.credentials.auth_type
            != librespot_protocol::authentication::AuthenticationType::AUTHENTICATION_STORED_SPOTIFY_CREDENTIALS
    {
        return Err(Failure::InvalidInput);
    }
    Ok(stored)
}

pub fn validate_grant(grant: &SessionGrant, now_milliseconds: u64) -> Result<(), Failure> {
    if !bounded_text(&grant.account_identifier, MAXIMUM_USERNAME_CHARACTERS)
        || !bounded_text(&grant.access_token, MAXIMUM_TOKEN_CHARACTERS)
        || grant.access_token.contains(char::is_whitespace)
        || grant.expires_at_milliseconds < MINIMUM_EXPIRATION_MILLISECONDS
        || grant.expires_at_milliseconds <= now_milliseconds
        || decode_stored_session(&grant.stored_credential)?.account_identifier != grant.account_identifier
    {
        return Err(Failure::InvalidResponse);
    }
    Ok(())
}
