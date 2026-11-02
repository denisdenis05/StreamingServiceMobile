use std::sync::{Mutex, OnceLock};
use crate::model::Failure;

const DEFAULT_RETRY_AFTER_SECONDS: u64 = 60;
const MILLISECONDS_PER_SECOND: u64 = 1000;
const NO_REMAINING_MILLISECONDS: u64 = 0;
static SERVICE_COOLDOWN: OnceLock<Mutex<ConnectRequestCooldown>> = OnceLock::new();

#[derive(Default)]
pub struct ConnectRequestCooldown { blocked_until_milliseconds: Option<u64> }
impl ConnectRequestCooldown {
    pub fn require_allowed(&self, now_milliseconds: u64) -> Result<(), Failure> {
        if self.blocked_until_milliseconds.is_some_and(|until| until.saturating_sub(now_milliseconds) > NO_REMAINING_MILLISECONDS) {
            Err(Failure::RateLimited)
        } else { Ok(()) }
    }
    pub fn observe(&mut self, now_milliseconds: u64, retry_after_seconds: Option<u64>) {
        let duration = retry_after_seconds.unwrap_or(DEFAULT_RETRY_AFTER_SECONDS).saturating_mul(MILLISECONDS_PER_SECOND);
        let until = now_milliseconds.saturating_add(duration);
        self.blocked_until_milliseconds = Some(self.blocked_until_milliseconds.unwrap_or(until).max(until));
    }
}
fn service_cooldown() -> &'static Mutex<ConnectRequestCooldown> { SERVICE_COOLDOWN.get_or_init(|| Mutex::new(ConnectRequestCooldown::default())) }
pub fn require_service_allowed(now_milliseconds: u64) -> Result<(), Failure> {
    service_cooldown().lock().map_err(|_| Failure::Backpressure)?.require_allowed(now_milliseconds)
}
pub fn observe_service_cooldown(now_milliseconds: u64, retry_after_seconds: Option<u64>) -> Result<(), Failure> {
    service_cooldown().lock().map_err(|_| Failure::Backpressure)?.observe(now_milliseconds, retry_after_seconds);
    Ok(())
}
