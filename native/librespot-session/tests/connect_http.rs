use librespot_core::{http_client::HttpClientError, Error};
use streaming_spotify_session::{connect_session::{private_http_failure, private_http_status_failure}, model::Failure};

const INVALID_STATUS: u16 = 400;
const UNAUTHORIZED_STATUS: u16 = 401;
const FORBIDDEN_STATUS: u16 = 403;
const MISSING_STATUS: u16 = 404;
const LIMITED_STATUS: u16 = 429;
const SERVER_FAILURE_STATUS: u16 = 503;
const PRIVATE_DIAGNOSTIC: &str = "synthetic diagnostic containing private request data";

#[test]
fn rejected_requests_retain_actionable_failure_categories_without_exposing_diagnostics() {
    for (status, expected) in [(INVALID_STATUS, Failure::InvalidInput), (UNAUTHORIZED_STATUS, Failure::Unauthorized),
        (FORBIDDEN_STATUS, Failure::Forbidden), (MISSING_STATUS, Failure::NotFound), (LIMITED_STATUS, Failure::Backpressure)] {
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
