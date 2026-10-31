use std::collections::VecDeque;

use http::HeaderMap;
use serde::Deserialize;

use crate::{connect_search::{ConnectSearchInput, ConnectSearchTrack}, model::Failure};

pub const MINIMUM_SEARCH_INTERVAL_MILLISECONDS: u64 = 2000;
pub const DEFAULT_RATE_LIMIT_SECONDS: u64 = 60;
pub const MAXIMUM_RATE_LIMIT_BODY_BYTES: usize = 4096;
pub const RATE_LIMIT_BODY_TIMEOUT_MILLISECONDS: u64 = 1000;
pub const MAXIMUM_CACHED_SEARCHES: usize = 64;
pub const CACHE_LIFETIME_MILLISECONDS: u64 = 300000;
const MILLISECONDS_PER_SECOND: u64 = 1000;
const ROUNDING_INCREMENT: u64 = MILLISECONDS_PER_SECOND - 1;
const RETRY_AFTER_HEADER: &str = "retry-after";
const QUOTA_EXCEEDED_REASON: &str = "QUOTA_EXCEEDED";
const NO_ELAPSED_MILLISECONDS: u64 = 0;
const SINGLE_REQUEST: u64 = 1;

#[derive(Default, Deserialize)]
struct RateLimitBody { reason: Option<String>, error: Option<RateLimitError> }
#[derive(Deserialize)]
struct RateLimitError { reason: Option<String> }

pub fn retry_after_seconds(headers: &HeaderMap) -> Option<u64> {
    let value = headers.get(RETRY_AFTER_HEADER)?.to_str().ok()?;
    if value.is_empty() || !value.bytes().all(|character| character.is_ascii_digit()) { return None; }
    let seconds = value.parse::<u64>().ok()?;
    seconds.checked_mul(MILLISECONDS_PER_SECOND)?;
    Some(seconds)
}

pub fn quota_exceeded(body: &[u8]) -> bool {
    if body.len() > MAXIMUM_RATE_LIMIT_BODY_BYTES { return false; }
    let Ok(parsed) = serde_json::from_slice::<RateLimitBody>(body) else { return false; };
    parsed.reason.as_deref() == Some(QUOTA_EXCEEDED_REASON)
        || parsed.error.and_then(|error| error.reason).as_deref() == Some(QUOTA_EXCEEDED_REASON)
}

struct CachedSearch { input: ConnectSearchInput, tracks: Vec<ConnectSearchTrack>, received_at_milliseconds: u64 }

#[derive(Default)]
pub struct CatalogSearchTraffic {
    last_dispatch_milliseconds: Option<u64>,
    blocked_until_milliseconds: Option<u64>,
    dispatch_count: u64,
    current_dispatch_rate_limited: bool,
    cached: VecDeque<CachedSearch>,
}

impl CatalogSearchTraffic {
    pub fn require_allowed(&self, now_milliseconds: u64) -> Result<(), Failure> {
        if self.cooldown_remaining_seconds(now_milliseconds).is_some() { Err(Failure::RateLimited) } else { Ok(()) }
    }

    pub fn minimum_wait_milliseconds(&self, now_milliseconds: u64) -> u64 {
        self.last_dispatch_milliseconds.map(|last| last.saturating_add(MINIMUM_SEARCH_INTERVAL_MILLISECONDS)
            .saturating_sub(now_milliseconds)).unwrap_or(NO_ELAPSED_MILLISECONDS)
    }

    pub fn dispatched(&mut self, now_milliseconds: u64) {
        self.current_dispatch_rate_limited = false;
        self.last_dispatch_milliseconds = Some(now_milliseconds);
        self.dispatch_count = self.dispatch_count.saturating_add(SINGLE_REQUEST);
    }

    pub fn dispatch_count(&self) -> u64 { self.dispatch_count }

    pub fn observed_rate_limit(&self) -> bool { self.current_dispatch_rate_limited }

    pub fn rate_limited(&mut self, now_milliseconds: u64, retry_seconds: Option<u64>) {
        self.current_dispatch_rate_limited = true;
        let duration = retry_seconds.unwrap_or(DEFAULT_RATE_LIMIT_SECONDS).saturating_mul(MILLISECONDS_PER_SECOND);
        let until = now_milliseconds.saturating_add(duration);
        self.blocked_until_milliseconds = Some(self.blocked_until_milliseconds.unwrap_or(until).max(until));
    }

    pub fn cooldown_remaining_seconds(&self, now_milliseconds: u64) -> Option<u64> {
        let remaining = self.blocked_until_milliseconds?.saturating_sub(now_milliseconds);
        if remaining == NO_ELAPSED_MILLISECONDS { None } else { Some(remaining.saturating_add(ROUNDING_INCREMENT) / MILLISECONDS_PER_SECOND) }
    }

    pub fn cached(&self, input: &ConnectSearchInput, now_milliseconds: u64) -> Option<Vec<ConnectSearchTrack>> {
        self.cached.iter().find(|cached| cached.input == *input && now_milliseconds >= cached.received_at_milliseconds
            && now_milliseconds - cached.received_at_milliseconds < CACHE_LIFETIME_MILLISECONDS).map(|cached| cached.tracks.clone())
    }

    pub fn remember(&mut self, input: ConnectSearchInput, tracks: Vec<ConnectSearchTrack>, now_milliseconds: u64) {
        self.cached.retain(|cached| cached.input != input);
        self.cached.push_back(CachedSearch { input, tracks, received_at_milliseconds: now_milliseconds });
        while self.cached.len() > MAXIMUM_CACHED_SEARCHES { self.cached.pop_front(); }
    }
}
