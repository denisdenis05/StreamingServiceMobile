use librespot_core::{http_client::HttpClientError, Error};
use streaming_spotify_session::{connect_session::{private_http_failure, private_http_status_failure, timed_out_request_failure, verify_device_status}, model::Failure};
use serde_json::json;

const INVALID_STATUS: u16 = 400;
const UNAUTHORIZED_STATUS: u16 = 401;
const FORBIDDEN_STATUS: u16 = 403;
const MISSING_STATUS: u16 = 404;
const LIMITED_STATUS: u16 = 429;
const SERVER_FAILURE_STATUS: u16 = 503;
const PRIVATE_DIAGNOSTIC: &str = "synthetic diagnostic containing private request data";
const DEVICE_IDENTIFIER: &str = "synthetic-native-device";
const OTHER_DEVICE_IDENTIFIER: &str = "different-device";
const DEVICE_STATUS_FIELD: &str = "device_broadcast_status";
const DEVICE_IDENTIFIER_FIELD: &str = "device_id";
const UNKNOWN_FIELD: &str = "synthetic_extra_field";
const EXCESSIVE_RESPONSE_BYTES: usize = 1048577;
const PADDING_BYTE: u8 = 0;

#[test]
fn rejected_requests_retain_actionable_failure_categories_without_exposing_diagnostics() {
    for (status, expected) in [(INVALID_STATUS, Failure::InvalidInput), (UNAUTHORIZED_STATUS, Failure::Unauthorized),
        (FORBIDDEN_STATUS, Failure::Forbidden), (MISSING_STATUS, Failure::NotFound), (LIMITED_STATUS, Failure::RateLimited)] {
        for mutation in [false, true] {
            assert_eq!(private_http_status_failure(status, mutation).code(), expected.code());
            let failure = HttpClientError::StatusCode(http::StatusCode::from_u16(status).unwrap()).into();
            assert_eq!(private_http_failure(failure, mutation).code(), expected.code());
        }
    }
}

#[test]
fn server_and_transport_failures_mark_mutations_uncertain_without_claiming_rejection() {
    assert!(matches!(private_http_status_failure(SERVER_FAILURE_STATUS, true), Failure::UnknownOutcome));
    assert!(matches!(private_http_status_failure(SERVER_FAILURE_STATUS, false), Failure::Network));
    assert!(matches!(private_http_failure(Error::unavailable(PRIVATE_DIAGNOSTIC), true), Failure::UnknownOutcome));
    assert!(matches!(private_http_failure(Error::deadline_exceeded(PRIVATE_DIAGNOSTIC), true), Failure::UnknownOutcome));
    assert!(matches!(private_http_failure(Error::cancelled(PRIVATE_DIAGNOSTIC), true), Failure::UnknownOutcome));
}

#[test]
fn passive_transport_failure_does_not_claim_that_a_command_was_dispatched() {
    assert!(matches!(private_http_failure(Error::unavailable(PRIVATE_DIAGNOSTIC), false), Failure::Network));
    assert!(matches!(private_http_failure(Error::deadline_exceeded(PRIVATE_DIAGNOSTIC), false), Failure::Deadline));
    assert!(matches!(private_http_failure(Error::cancelled(PRIVATE_DIAGNOSTIC), false), Failure::Canceled));
}

#[test]
fn hidden_observer_device_status_requires_the_exact_server_returned_device_identifier() {
    let response = serde_json::to_vec(&json!({ (DEVICE_STATUS_FIELD): { (DEVICE_IDENTIFIER_FIELD): DEVICE_IDENTIFIER }, (UNKNOWN_FIELD): true })).unwrap();
    assert!(verify_device_status(&response, DEVICE_IDENTIFIER).is_ok());
    assert!(matches!(verify_device_status(&response, OTHER_DEVICE_IDENTIFIER), Err(Failure::InvalidResponse)));
}

#[test]
fn missing_malformed_coerced_and_oversized_status_responses_cannot_verify_registration() {
    for response in [json!({}), json!({ (DEVICE_STATUS_FIELD): {} }), json!({ (DEVICE_STATUS_FIELD): { (DEVICE_IDENTIFIER_FIELD): true } })] {
        assert!(verify_device_status(&serde_json::to_vec(&response).unwrap(), DEVICE_IDENTIFIER).is_err());
    }
    assert!(verify_device_status(PRIVATE_DIAGNOSTIC.as_bytes(), DEVICE_IDENTIFIER).is_err());
    assert!(verify_device_status(&vec![PADDING_BYTE; EXCESSIVE_RESPONSE_BYTES], DEVICE_IDENTIFIER).is_err());
}

#[test]
fn successful_hidden_observer_registration_does_not_require_an_unrelated_jam_status_echo() {
    let cluster = streaming_spotify_session::connect_wire::normalize_cluster(librespot_protocol::connect::Cluster::new()).unwrap();
    assert!(matches!(streaming_spotify_session::connect_session::verify_registered_device(&cluster, DEVICE_IDENTIFIER, false),
        Ok(streaming_spotify_session::connect_session::RegistrationVerification::AcknowledgedObserver)));
}

#[test]
fn playable_registration_still_requires_its_exact_device_in_the_returned_cluster() {
    let cluster = streaming_spotify_session::connect_wire::normalize_cluster(librespot_protocol::connect::Cluster::new()).unwrap();
    assert!(matches!(streaming_spotify_session::connect_session::verify_registered_device(&cluster, DEVICE_IDENTIFIER, true), Err(Failure::InvalidResponse)));
}

#[test]
fn actual_http_rate_limiting_is_distinct_from_local_capacity_backpressure() {
    assert_ne!(private_http_status_failure(LIMITED_STATUS, false).code(), Failure::Backpressure.code());
    assert_eq!(private_http_status_failure(LIMITED_STATUS, false).code(), Failure::RateLimited.code());
}

#[test]
fn a_recorded_rate_limit_cannot_be_hidden_by_a_later_error_body_timeout() {
    for mutation in [false, true] { assert_eq!(timed_out_request_failure(mutation, true), Failure::RateLimited); }
    assert_eq!(timed_out_request_failure(false, false), Failure::Deadline);
    assert_eq!(timed_out_request_failure(true, false), Failure::UnknownOutcome);
}
