use librespot_core::authentication::Credentials;
use librespot_protocol::authentication::AuthenticationType;
use streaming_spotify_session::{model::{decode_stored_session, validate_grant, validate_password_input,
    validate_request_identifier, Failure, SessionGrant, StoredSession, MAXIMUM_PASSWORD_CHARACTERS,
    MAXIMUM_REQUEST_CHARACTERS, MAXIMUM_STORED_CHARACTERS, SCHEMA_VERSION},
    operations::{execute, AuthenticationOperation, OperationRegistry}};
use tokio_util::sync::CancellationToken;

const ACCOUNT: &str = "synthetic-account";
const OTHER_ACCOUNT: &str = "other-account";
const DEVICE: &str = "synthetic-device";
const CLIENT: &str = "synthetic-client";
const PASSWORD: &str = "synthetic-password";
const ACCESS_TOKEN: &str = "synthetic-access-token";
const REQUEST: &str = "synthetic-request";
const OTHER_REQUEST: &str = "other-request";
const INVALID_JSON: &str = "invalid-json";
const EMPTY_TEXT: &str = "";
const PADDING: &str = "x";
const CONTROL_TEXT: &str = "invalid\nvalue";
const STORED_BYTES: &[u8] = &[1, 2, 3];
const NOW_MILLISECONDS: u64 = 1000;
const EXPIRATION_MILLISECONDS: u64 = 2000;
const BOUNDARY_INCREMENT: usize = 1;

fn stored() -> StoredSession {
    StoredSession { schema_version: SCHEMA_VERSION, account_identifier: ACCOUNT.to_owned(),
        device_identifier: DEVICE.to_owned(), client_identifier: CLIENT.to_owned(),
        credentials: Credentials { username: Some(ACCOUNT.to_owned()),
            auth_type: AuthenticationType::AUTHENTICATION_STORED_SPOTIFY_CREDENTIALS,
            auth_data: STORED_BYTES.to_vec() } }
}
fn serialize(value: &StoredSession) -> String { serde_json::to_string(value).expect(ACCOUNT) }
fn grant() -> SessionGrant { SessionGrant { account_identifier: ACCOUNT.to_owned(), access_token: ACCESS_TOKEN.to_owned(),
    expires_at_milliseconds: EXPIRATION_MILLISECONDS, stored_credential: serialize(&stored()) } }

#[test]
fn validates_password_and_request_boundaries_without_changing_password() {
    assert_eq!(validate_password_input(ACCOUNT, PASSWORD), Ok(()));
    assert_eq!(validate_password_input(ACCOUNT, &PADDING.repeat(MAXIMUM_PASSWORD_CHARACTERS)), Ok(()));
    assert_eq!(validate_password_input(ACCOUNT, &PADDING.repeat(MAXIMUM_PASSWORD_CHARACTERS + BOUNDARY_INCREMENT)), Err(Failure::InvalidInput));
    assert_eq!(validate_password_input(EMPTY_TEXT, PASSWORD), Err(Failure::InvalidInput));
    assert_eq!(validate_password_input(ACCOUNT, CONTROL_TEXT), Err(Failure::InvalidInput));
    assert_eq!(validate_request_identifier(&PADDING.repeat(MAXIMUM_REQUEST_CHARACTERS)), Ok(()));
    assert_eq!(validate_request_identifier(&PADDING.repeat(MAXIMUM_REQUEST_CHARACTERS + BOUNDARY_INCREMENT)), Err(Failure::InvalidInput));
}
#[test]
fn reusable_record_contains_stored_credentials_and_round_trips_account() {
    let serialized = serialize(&stored());
    assert!(!serialized.contains(PASSWORD)); assert!(!serialized.contains(ACCESS_TOKEN));
    assert_eq!(decode_stored_session(&serialized).unwrap().account_identifier, ACCOUNT);
}
#[test]
fn reusable_record_rejects_malformed_oversized_and_wrong_account_payloads() {
    assert!(decode_stored_session(INVALID_JSON).is_err());
    assert!(decode_stored_session(&PADDING.repeat(MAXIMUM_STORED_CHARACTERS + BOUNDARY_INCREMENT)).is_err());
    let mut value = stored(); value.account_identifier = OTHER_ACCOUNT.to_owned();
    assert!(decode_stored_session(&serialize(&value)).is_err());
}
#[test]
fn password_and_access_token_credentials_cannot_be_saved_as_reusable_authentication() {
    for authentication_type in [AuthenticationType::AUTHENTICATION_USER_PASS, AuthenticationType::AUTHENTICATION_SPOTIFY_TOKEN] {
        let mut value = stored(); value.credentials.auth_type = authentication_type;
        assert!(decode_stored_session(&serialize(&value)).is_err());
    }
}
#[test]
fn grant_rejects_expiry_and_cross_account_binding() {
    assert_eq!(validate_grant(&grant(), NOW_MILLISECONDS), Ok(()));
    assert_eq!(validate_grant(&grant(), EXPIRATION_MILLISECONDS), Err(Failure::InvalidResponse));
    let mut value = grant(); value.account_identifier = OTHER_ACCOUNT.to_owned();
    assert_eq!(validate_grant(&value, NOW_MILLISECONDS), Err(Failure::InvalidResponse));
}
#[test]
fn registry_rejects_duplicates_and_releases_only_the_finished_identifier() {
    let registry = OperationRegistry::default();
    assert_eq!(registry.begin(REQUEST), Ok(())); assert_eq!(registry.begin(REQUEST), Err(Failure::Backpressure));
    assert_eq!(registry.begin(OTHER_REQUEST), Ok(())); registry.finish(REQUEST);
    assert_eq!(registry.begin(REQUEST), Ok(()));
    assert_eq!(registry.begin(OTHER_REQUEST), Err(Failure::Backpressure));
}
#[test]
fn scoped_cancellation_preserves_other_requests_and_global_cancellation_retires_both() {
    let registry = OperationRegistry::default(); registry.begin(REQUEST).unwrap(); registry.begin(OTHER_REQUEST).unwrap();
    registry.cancel(REQUEST); assert!(registry.cancellation(REQUEST).unwrap().is_cancelled());
    assert!(!registry.cancellation(OTHER_REQUEST).unwrap().is_cancelled());
    registry.cancel_all(); assert!(registry.cancellation(OTHER_REQUEST).unwrap().is_cancelled());
}
#[tokio::test]
async fn cancellation_before_dispatch_prevents_authentication_network_work() {
    let cancellation = CancellationToken::new(); cancellation.cancel();
    let result = execute(AuthenticationOperation::Login { username: ACCOUNT.to_owned(), password: PASSWORD.to_owned() }, cancellation).await;
    assert!(matches!(result, Err(Failure::Canceled)));
}
#[tokio::test]
async fn malformed_restore_fails_before_creating_an_authenticated_session() {
    let result = execute(AuthenticationOperation::Restore { serialized: INVALID_JSON.to_owned() }, CancellationToken::new()).await;
    assert!(matches!(result, Err(Failure::InvalidInput)));
}

const MAXIMUM_PENDING_REQUESTS: usize = 8;
const FIRST_PENDING_SEQUENCE: usize = 0;
const REQUEST_PREFIX: &str = "capacity-request-";
const PRIVATE_FAILURE: &str = "Sensitive native challenge failure";
#[test]
fn pending_capacity_is_bounded_and_recovers_after_release() {
    let registry = OperationRegistry::default();
    for sequence in FIRST_PENDING_SEQUENCE..MAXIMUM_PENDING_REQUESTS {
        assert_eq!(registry.begin(&format!("{REQUEST_PREFIX}{sequence}")), Ok(()));
    }
    assert_eq!(registry.begin(REQUEST), Err(Failure::Backpressure));
    registry.finish(&format!("{REQUEST_PREFIX}{FIRST_PENDING_SEQUENCE}"));
    assert_eq!(registry.begin(REQUEST), Ok(()));
}
#[test]
fn unsupported_verification_errors_are_sanitized_as_unsupported() {
    let failure = librespot_core::Error::unimplemented(PRIVATE_FAILURE);
    assert_eq!(streaming_spotify_session::session::sanitized_failure(failure), Failure::Unsupported);
}

#[tokio::test(start_paused = true)]
async fn an_unresponsive_authentication_transport_reaches_the_native_deadline() {
    let result = streaming_spotify_session::operations::await_authentication(std::future::pending(), CancellationToken::new()).await;
    assert!(matches!(result, Err(Failure::Deadline)));
}
#[tokio::test]
async fn cancellation_after_authentication_dispatch_retires_the_pending_future() {
    let cancellation = CancellationToken::new();
    let authentication = streaming_spotify_session::operations::await_authentication(std::future::pending(), cancellation.clone());
    let canceling = async { tokio::task::yield_now().await; cancellation.cancel(); };
    let (result, _) = tokio::join!(authentication, canceling);
    assert!(matches!(result, Err(Failure::Canceled)));
}
