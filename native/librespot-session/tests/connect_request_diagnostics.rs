use streaming_spotify_session::{connect_authentication::ConnectRequestPurpose,
    connect_request_diagnostics::ConnectRequestDiagnostic, model::Failure};
const EXPECTED_RESPONSE: &str = r#"{"purpose":"publication","stage":"response","status":429,"failure":null,"retryAfterSeconds":56}"#;
const EXPECTED_ADMISSION: &str = r#"{"purpose":"observation","stage":"admission","status":429,"failure":"rate-limited","retryAfterSeconds":null}"#;
const RETRY_AFTER_SECONDS: u64 = 56;
#[test]
fn publication_diagnostics_retain_http_cooldown_without_payload_device_path_or_account_fields() {
    let diagnostic = ConnectRequestDiagnostic::response(ConnectRequestPurpose::Publication, http::StatusCode::TOO_MANY_REQUESTS, Some(RETRY_AFTER_SECONDS));
    assert_eq!(serde_json::to_string(&diagnostic).unwrap(), EXPECTED_RESPONSE);
}
#[test]
fn admission_diagnostics_distinguish_local_request_rejection_without_claiming_an_http_cooldown() {
    let diagnostic = ConnectRequestDiagnostic::admission(ConnectRequestPurpose::Observation, Some(http::StatusCode::TOO_MANY_REQUESTS), Failure::RateLimited);
    assert_eq!(serde_json::to_string(&diagnostic).unwrap(), EXPECTED_ADMISSION);
}
