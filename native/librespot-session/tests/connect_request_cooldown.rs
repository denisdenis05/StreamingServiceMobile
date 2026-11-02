use streaming_spotify_session::{connect_request_cooldown::ConnectRequestCooldown, model::Failure};
const NOW_MILLISECONDS: u64 = 100;
const RETRY_SECONDS: u64 = 90;
const BEFORE_EXPIRY_MILLISECONDS: u64 = 90099;
const AT_EXPIRY_MILLISECONDS: u64 = 90100;
const DEFAULT_EXPIRY_MILLISECONDS: u64 = 60100;
const SHORT_RETRY_SECONDS: u64 = 1;
const MAXIMUM_TIMESTAMP: u64 = u64::MAX;
#[test]
fn service_cooldown_preserves_full_server_duration_and_rejects_requests_until_exact_expiry() {
    let mut cooldown = ConnectRequestCooldown::default();
    assert!(cooldown.require_allowed(NOW_MILLISECONDS).is_ok());
    cooldown.observe(NOW_MILLISECONDS, Some(RETRY_SECONDS));
    assert!(matches!(cooldown.require_allowed(BEFORE_EXPIRY_MILLISECONDS), Err(Failure::RateLimited)));
    cooldown.observe(NOW_MILLISECONDS, Some(SHORT_RETRY_SECONDS));
    assert!(matches!(cooldown.require_allowed(BEFORE_EXPIRY_MILLISECONDS), Err(Failure::RateLimited)));
    assert!(cooldown.require_allowed(AT_EXPIRY_MILLISECONDS).is_ok());
}
#[test]
fn missing_retry_header_has_a_bounded_default_and_timestamp_overflow_does_not_clear_a_limit() {
    let mut cooldown = ConnectRequestCooldown::default();
    cooldown.observe(NOW_MILLISECONDS, None);
    assert!(cooldown.require_allowed(DEFAULT_EXPIRY_MILLISECONDS).is_ok());
    cooldown.observe(NOW_MILLISECONDS, Some(MAXIMUM_TIMESTAMP));
    assert!(matches!(cooldown.require_allowed(AT_EXPIRY_MILLISECONDS), Err(Failure::RateLimited)));
}
