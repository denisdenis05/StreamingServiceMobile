use std::cell::Cell;

use streaming_spotify_session::{model::Failure, session::{authentication_stage_failure,
    request_session_token, DEVICE_AUTHORIZATION_CLIENT_IDENTIFIER}};

const MOBILE_CLIENT_IDENTIFIER: &str = "synthetic-mobile-client";
const DESKTOP_TOKEN: &str = "synthetic-desktop-token";
const MOBILE_TOKEN: &str = "synthetic-mobile-token";
const NATIVE_SESSION_REJECTION_CODE: &str = "native-session-rejected";
const NATIVE_TOKEN_REJECTION_CODE: &str = "native-token-rejected";

#[tokio::test]
async fn desktop_authorization_uses_keymaster_without_requesting_android_login5_metadata() {
    let desktop_requested = Cell::new(false);
    let mobile_requested = Cell::new(false);
    let result = request_session_token(DEVICE_AUTHORIZATION_CLIENT_IDENTIFIER,
        || { desktop_requested.set(true); async { Ok(DESKTOP_TOKEN) } },
        || { mobile_requested.set(true); async { Ok(MOBILE_TOKEN) } },
    ).await;
    assert_eq!(result, Ok(DESKTOP_TOKEN));
    assert!(desktop_requested.get());
    assert!(!mobile_requested.get());
}

#[tokio::test]
async fn password_session_retains_login5_without_requesting_keymaster() {
    let desktop_requested = Cell::new(false);
    let mobile_requested = Cell::new(false);
    let result = request_session_token(MOBILE_CLIENT_IDENTIFIER,
        || { desktop_requested.set(true); async { Ok(DESKTOP_TOKEN) } },
        || { mobile_requested.set(true); async { Ok(MOBILE_TOKEN) } },
    ).await;
    assert_eq!(result, Ok(MOBILE_TOKEN));
    assert!(!desktop_requested.get());
    assert!(mobile_requested.get());
}

#[tokio::test]
async fn desktop_rejection_is_not_replayed_through_another_client_identity() {
    let mobile_requested = Cell::new(false);
    let result = request_session_token(DEVICE_AUTHORIZATION_CLIENT_IDENTIFIER,
        || async { Err::<&str, Failure>(Failure::Unauthorized) },
        || { mobile_requested.set(true); async { Ok(MOBILE_TOKEN) } },
    ).await;
    assert_eq!(result, Err(Failure::Unauthorized));
    assert!(!mobile_requested.get());
}

#[test]
fn permanent_authentication_failures_identify_the_rejected_stage_without_private_error_text() {
    for failure in [Failure::Unauthorized, Failure::InvalidInput, Failure::InvalidResponse] {
        assert_eq!(authentication_stage_failure(failure, Failure::NativeSessionRejected).code(), NATIVE_SESSION_REJECTION_CODE);
        assert_eq!(authentication_stage_failure(failure, Failure::NativeTokenRejected).code(), NATIVE_TOKEN_REJECTION_CODE);
    }
}

#[test]
fn transient_cancellation_and_unsupported_verification_failures_keep_their_original_recovery_classification() {
    for failure in [Failure::Network, Failure::Deadline, Failure::Canceled, Failure::Backpressure, Failure::Unsupported] {
        assert_eq!(authentication_stage_failure(failure, Failure::NativeSessionRejected), failure);
        assert_eq!(authentication_stage_failure(failure, Failure::NativeTokenRejected), failure);
    }
}

const PRIVATE_REQUEST_ADDRESS: &str = "hm://keymaster/synthetic-sensitive-address";
const PRIVATE_RESPONSE_PAYLOAD: &[u8] = b"synthetic-private-response";
const UNAUTHORIZED_STATUS: i32 = 401;
const ACCOUNT_RESTRICTED_STATUS: i32 = 402;
const FORBIDDEN_STATUS: i32 = 403;
const RATE_LIMITED_STATUS: i32 = 429;
const SERVER_FAILURE_STATUS: i32 = 503;

fn mercury_failure(status_code: i32) -> librespot_core::Error {
    librespot_core::mercury::MercuryError::Response(librespot_core::mercury::MercuryResponse {
        uri: PRIVATE_REQUEST_ADDRESS.to_owned(), status_code, payload: vec![PRIVATE_RESPONSE_PAYLOAD.to_vec()],
    }).into()
}

#[test]
fn keymaster_permission_failures_are_rejections_even_when_upstream_classifies_them_as_unavailable() {
    for status_code in [UNAUTHORIZED_STATUS, ACCOUNT_RESTRICTED_STATUS, FORBIDDEN_STATUS] {
        let failure = streaming_spotify_session::session::sanitized_failure(mercury_failure(status_code));
        assert_eq!(authentication_stage_failure(failure, Failure::NativeTokenRejected).code(), NATIVE_TOKEN_REJECTION_CODE);
    }
}

#[test]
fn keymaster_rate_limit_and_server_failure_remain_transient_without_response_data() {
    assert_eq!(streaming_spotify_session::session::sanitized_failure(mercury_failure(RATE_LIMITED_STATUS)), Failure::Backpressure);
    assert_eq!(streaming_spotify_session::session::sanitized_failure(mercury_failure(SERVER_FAILURE_STATUS)), Failure::Network);
}
