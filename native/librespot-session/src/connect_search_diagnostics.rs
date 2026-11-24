use serde::Serialize;

use crate::model::Failure;
use super::CATALOG_SEARCH_ORIGIN;

const CLIENT_TOKEN_ORIGIN: &str = "https://clienttoken.spotify.com";
pub const LOG_TARGET: &str = "streaming_spotify_catalog_diagnostic";

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchDiagnosticStage { RequestCompletion, DispatchAdmission, Transport, HttpResponse, ResponseBody, Decode, ClientToken }

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchDiagnostic {
    origin: &'static str,
    stage: SearchDiagnosticStage,
    status: Option<u16>,
    failure: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_after_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cooldown_remaining_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    quota_exceeded: Option<bool>,
}

impl SearchDiagnostic {
    pub fn new(stage: SearchDiagnosticStage, status: Option<http::StatusCode>, failure: Option<Failure>) -> Self {
        Self { origin: CATALOG_SEARCH_ORIGIN, stage, status: status.map(|status| status.as_u16()), failure: failure.map(Failure::code),
            retry_after_seconds: None, cooldown_remaining_seconds: None, request_count: None, quota_exceeded: None }
    }

    pub fn client_token(status: Option<http::StatusCode>, failure: Option<Failure>) -> Self {
        let mut diagnostic = Self::new(SearchDiagnosticStage::ClientToken, status, failure);
        diagnostic.origin = CLIENT_TOKEN_ORIGIN;
        diagnostic
    }

    pub fn traffic(mut self, request_count: u64, cooldown_remaining_seconds: Option<u64>) -> Self {
        self.request_count = Some(request_count); self.cooldown_remaining_seconds = cooldown_remaining_seconds; self
    }

    pub fn rate_limit(mut self, retry_after_seconds: Option<u64>, quota_exceeded: bool) -> Self {
        self.retry_after_seconds = retry_after_seconds;
        self.quota_exceeded = Some(quota_exceeded); self
    }

    pub fn emit(self) {
        if let Ok(serialized) = serde_json::to_string(&self) {
            #[cfg(target_os = "android")]
            android_diagnostic(&serialized);
            #[cfg(not(target_os = "android"))]
            log::info!(target: LOG_TARGET, "{}", serialized);
        }
    }
}

#[cfg(target_os = "android")]
fn android_diagnostic(serialized: &str) {
    use std::{ffi::CString, os::raw::{c_char, c_int}};
    const ANDROID_INFORMATION_PRIORITY: c_int = 4;
    const ANDROID_TAG: &str = "SpotifyCatalog";
    #[link(name = "log")]
    extern "C" { fn __android_log_write(priority: c_int, tag: *const c_char, text: *const c_char) -> c_int; }
    if let (Ok(tag), Ok(message)) = (CString::new(ANDROID_TAG), CString::new(serialized)) {
        unsafe { __android_log_write(ANDROID_INFORMATION_PRIORITY, tag.as_ptr(), message.as_ptr()); }
    }
}
