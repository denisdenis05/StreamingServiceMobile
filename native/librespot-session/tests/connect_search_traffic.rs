use http::{HeaderMap, HeaderValue};
use streaming_spotify_session::{connect_search::ConnectSearchInput, connect_search::diagnostics::{SearchDiagnostic, SearchDiagnosticStage},
    connect_search_traffic::{CatalogSearchTraffic, retry_after_seconds, quota_exceeded, CACHE_LIFETIME_MILLISECONDS,
        MINIMUM_SEARCH_INTERVAL_MILLISECONDS, DEFAULT_RATE_LIMIT_SECONDS, MAXIMUM_CACHED_SEARCHES, MAXIMUM_RATE_LIMIT_BODY_BYTES}, model::Failure};

const START_MILLISECONDS: u64 = 10000;
const MILLISECONDS_PER_SECOND: u64 = 1000;
const SINGLE_MILLISECOND: u64 = 1;
const NO_WAIT_MILLISECONDS: u64 = 0;
const SINGLE_REQUEST: u64 = 1;
const SINGLE_SECOND: u64 = 1;
const COOLDOWN_SECONDS: u64 = 3600;
const SHORTER_COOLDOWN_SECONDS: u64 = 1;
const RETRY_HEADER: &str = "retry-after";
const VALID_RETRY: &str = "3600";
const INVALID_RETRY_VALUES: &[&str] = &["-1", "+2", "1.5", "private", "18446744073709551615"];
const TITLE: &str = "Synthetic title";
const AUTHOR: &str = "Synthetic artist";
const MARKET: &str = "RO";
const OTHER_MARKET: &str = "US";
const SEARCH_LIMIT: usize = 2;
const OTHER_LIMIT: usize = 1;
const FIRST_INDEX: usize = 0;
const NO_REQUESTS: u64 = 0;
const IMMEDIATE_RETRY_SECONDS: u64 = 0;
const CACHE_EXTRA_ENTRY: usize = 1;
const PRIVATE_VALUE: &str = "synthetic-private-value";
const PADDING_BYTE: u8 = b'x';
const QUOTA_BODY: &[u8] = br#"{"reason":"QUOTA_EXCEEDED","message":"synthetic-private-value"}"#;
const NESTED_QUOTA_BODY: &[u8] = br#"{"error":{"reason":"QUOTA_EXCEEDED","message":"synthetic-private-value"}}"#;
const UNKNOWN_BODY: &[u8] = br#"{"error":{"reason":"synthetic-private-value"}}"#;
const NO_BODY: &[u8] = b"";
const REQUEST_COUNT_FIELD: &str = "requestCount";
const RETRY_SECONDS_FIELD: &str = "retryAfterSeconds";
const QUOTA_FIELD: &str = "quotaExceeded";
const COOLDOWN_FIELD: &str = "cooldownRemainingSeconds";
const DIAGNOSTIC_FIELD_COUNT: usize = 8;

fn input() -> ConnectSearchInput { ConnectSearchInput { title: TITLE.to_owned(), author: AUTHOR.to_owned(), market: MARKET.to_owned(), limit: SEARCH_LIMIT } }
fn headers(value: &str) -> HeaderMap {
    let mut headers = HeaderMap::new(); headers.insert(RETRY_HEADER, HeaderValue::from_str(value).unwrap()); headers
}

#[test]
fn retry_after_preserves_actual_seconds_without_shortening_long_cooldowns() {
    assert_eq!(retry_after_seconds(&headers(VALID_RETRY)), Some(COOLDOWN_SECONDS));
    assert_eq!(retry_after_seconds(&HeaderMap::new()), None);
    for invalid in INVALID_RETRY_VALUES {
        assert_eq!(retry_after_seconds(&headers(invalid)), None);
    }
}

#[test]
fn rate_limit_blocks_dispatch_until_the_actual_deadline_without_counting_a_new_request() {
    let mut traffic = CatalogSearchTraffic::default();
    traffic.dispatched(START_MILLISECONDS);
    traffic.rate_limited(START_MILLISECONDS, Some(COOLDOWN_SECONDS));
    let deadline = START_MILLISECONDS + COOLDOWN_SECONDS * MILLISECONDS_PER_SECOND;
    assert_eq!(traffic.require_allowed(deadline - SINGLE_MILLISECOND), Err(Failure::RateLimited));
    assert_eq!(traffic.cooldown_remaining_seconds(deadline - SINGLE_MILLISECOND), Some(SINGLE_SECOND));
    assert_eq!(traffic.require_allowed(deadline), Ok(()));
    assert_eq!(traffic.dispatch_count(), SINGLE_REQUEST);
}

#[test]
fn missing_retry_header_uses_a_named_conservative_cooldown() {
    let mut traffic = CatalogSearchTraffic::default(); traffic.rate_limited(START_MILLISECONDS, None);
    assert_eq!(traffic.cooldown_remaining_seconds(START_MILLISECONDS), Some(DEFAULT_RATE_LIMIT_SECONDS));
    assert_eq!(traffic.require_allowed(START_MILLISECONDS + DEFAULT_RATE_LIMIT_SECONDS * MILLISECONDS_PER_SECOND), Ok(()));
}

#[test]
fn a_later_shorter_rate_limit_cannot_shorten_an_existing_cooldown() {
    let mut traffic = CatalogSearchTraffic::default(); traffic.rate_limited(START_MILLISECONDS, Some(COOLDOWN_SECONDS));
    traffic.rate_limited(START_MILLISECONDS + SINGLE_MILLISECOND, Some(SHORTER_COOLDOWN_SECONDS));
    assert_eq!(traffic.cooldown_remaining_seconds(START_MILLISECONDS), Some(COOLDOWN_SECONDS));
}

#[test]
fn successful_searches_are_spaced_without_adding_synthetic_network_requests() {
    let mut traffic = CatalogSearchTraffic::default();
    assert_eq!(traffic.minimum_wait_milliseconds(START_MILLISECONDS), NO_WAIT_MILLISECONDS);
    traffic.dispatched(START_MILLISECONDS);
    assert_eq!(traffic.minimum_wait_milliseconds(START_MILLISECONDS), MINIMUM_SEARCH_INTERVAL_MILLISECONDS);
    assert_eq!(traffic.minimum_wait_milliseconds(START_MILLISECONDS + MINIMUM_SEARCH_INTERVAL_MILLISECONDS), NO_WAIT_MILLISECONDS);
    assert_eq!(traffic.dispatch_count(), SINGLE_REQUEST);
}

#[test]
fn identical_successful_and_empty_searches_can_be_reused_without_dispatch() {
    let mut traffic = CatalogSearchTraffic::default();
    traffic.remember(input(), Vec::new(), START_MILLISECONDS);
    traffic.rate_limited(START_MILLISECONDS, Some(COOLDOWN_SECONDS));
    assert_eq!(traffic.cached(&input(), START_MILLISECONDS), Some(Vec::new()));
    assert_eq!(traffic.dispatch_count(), NO_REQUESTS);
}

#[test]
fn cache_requires_exact_title_artist_market_and_limit() {
    let mut traffic = CatalogSearchTraffic::default(); traffic.remember(input(), Vec::new(), START_MILLISECONDS);
    let mut title = input(); title.title = PRIVATE_VALUE.to_owned();
    let mut author = input(); author.author = PRIVATE_VALUE.to_owned();
    let mut market = input(); market.market = OTHER_MARKET.to_owned();
    let mut limit = input(); limit.limit = OTHER_LIMIT;
    for changed in [title, author, market, limit] { assert_eq!(traffic.cached(&changed, START_MILLISECONDS), None); }
}

#[test]
fn cache_expires_at_its_boundary_and_cannot_survive_a_new_connection_owner() {
    let mut traffic = CatalogSearchTraffic::default(); traffic.remember(input(), Vec::new(), START_MILLISECONDS);
    assert!(traffic.cached(&input(), START_MILLISECONDS + CACHE_LIFETIME_MILLISECONDS - SINGLE_MILLISECOND).is_some());
    assert_eq!(traffic.cached(&input(), START_MILLISECONDS + CACHE_LIFETIME_MILLISECONDS), None);
    assert_eq!(traffic.cached(&input(), START_MILLISECONDS - SINGLE_MILLISECOND), None);
    assert_eq!(CatalogSearchTraffic::default().cached(&input(), START_MILLISECONDS), None);
}

#[test]
fn search_cache_evicts_the_oldest_query_at_the_bound() {
    let mut traffic = CatalogSearchTraffic::default();
    for index in FIRST_INDEX..MAXIMUM_CACHED_SEARCHES + CACHE_EXTRA_ENTRY {
        let mut query = input(); query.title = index.to_string(); traffic.remember(query, Vec::new(), START_MILLISECONDS);
    }
    let mut first = input(); first.title = FIRST_INDEX.to_string();
    let mut latest = input(); latest.title = MAXIMUM_CACHED_SEARCHES.to_string();
    assert_eq!(traffic.cached(&first, START_MILLISECONDS), None);
    assert!(traffic.cached(&latest, START_MILLISECONDS).is_some());
}

#[test]
fn only_the_known_bounded_quota_reason_is_retained() {
    assert!(quota_exceeded(QUOTA_BODY)); assert!(quota_exceeded(NESTED_QUOTA_BODY));
    assert!(!quota_exceeded(UNKNOWN_BODY)); assert!(!quota_exceeded(NO_BODY));
    assert!(!quota_exceeded(&vec![PADDING_BYTE; MAXIMUM_RATE_LIMIT_BODY_BYTES + CACHE_EXTRA_ENTRY]));
}

#[test]
fn extended_diagnostics_include_only_typed_cooldown_quota_and_request_count() {
    let diagnostic = SearchDiagnostic::new(SearchDiagnosticStage::HttpResponse, Some(http::StatusCode::TOO_MANY_REQUESTS), Some(Failure::RateLimited))
        .traffic(SINGLE_REQUEST, Some(COOLDOWN_SECONDS)).rate_limit(Some(COOLDOWN_SECONDS), quota_exceeded(QUOTA_BODY));
    let value = serde_json::to_value(diagnostic).unwrap();
    assert_eq!(value.as_object().unwrap().len(), DIAGNOSTIC_FIELD_COUNT);
    assert_eq!(value[REQUEST_COUNT_FIELD], SINGLE_REQUEST); assert_eq!(value[RETRY_SECONDS_FIELD], COOLDOWN_SECONDS);
    assert_eq!(value[COOLDOWN_FIELD], COOLDOWN_SECONDS); assert_eq!(value[QUOTA_FIELD], true);
    assert!(!value.to_string().contains(PRIVATE_VALUE));
}

#[test]
fn a_zero_second_cooldown_still_records_the_actual_response_for_timeout_classification() {
    let mut traffic = CatalogSearchTraffic::default();
    assert!(!traffic.observed_rate_limit()); traffic.dispatched(START_MILLISECONDS);
    traffic.rate_limited(START_MILLISECONDS, Some(IMMEDIATE_RETRY_SECONDS));
    assert_eq!(traffic.require_allowed(START_MILLISECONDS), Ok(())); assert!(traffic.observed_rate_limit());
    traffic.dispatched(START_MILLISECONDS + MINIMUM_SEARCH_INTERVAL_MILLISECONDS);
    assert!(!traffic.observed_rate_limit());
}
