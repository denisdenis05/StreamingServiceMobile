use serde::Serialize;
use crate::{connect_authentication::ConnectRequestPurpose, model::Failure};

const ADMISSION_STAGE: &str = "admission";
const RESPONSE_STAGE: &str = "response";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequestDiagnostic {
    purpose: ConnectRequestPurpose,
    stage: &'static str,
    status: Option<u16>,
    failure: Option<&'static str>,
    retry_after_seconds: Option<u64>,
}

impl ConnectRequestDiagnostic {
    pub fn admission(purpose: ConnectRequestPurpose, status: Option<http::StatusCode>, failure: Failure) -> Self {
        Self { purpose, stage: ADMISSION_STAGE, status: status.map(|status| status.as_u16()), failure: Some(failure.code()), retry_after_seconds: None }
    }
    pub fn response(purpose: ConnectRequestPurpose, status: http::StatusCode, retry_after_seconds: Option<u64>) -> Self {
        Self { purpose, stage: RESPONSE_STAGE, status: Some(status.as_u16()), failure: None, retry_after_seconds }
    }
    pub fn emit(self) {
        if let Ok(serialized) = serde_json::to_string(&self) {
            #[cfg(target_os = "android")]
            android_diagnostic(&serialized);
            #[cfg(not(target_os = "android"))]
            log::info!("{}", serialized);
        }
    }
}

#[cfg(target_os = "android")]
fn android_diagnostic(serialized: &str) {
    use std::{ffi::CString, os::raw::{c_char, c_int}};
    const ANDROID_INFORMATION_PRIORITY: c_int = 4;
    const ANDROID_TAG: &str = "SpotifyConnectRequest";
    #[link(name = "log")]
    extern "C" { fn __android_log_write(priority: c_int, tag: *const c_char, text: *const c_char) -> c_int; }
    if let (Ok(tag), Ok(message)) = (CString::new(ANDROID_TAG), CString::new(serialized)) {
        unsafe { __android_log_write(ANDROID_INFORMATION_PRIORITY, tag.as_ptr(), message.as_ptr()); }
    }
}
