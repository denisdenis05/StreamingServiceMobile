use serde::Serialize;

use crate::model::Failure;
use super::CATALOG_SEARCH_ORIGIN;

pub const LOG_TARGET: &str = "streaming_spotify_catalog_diagnostic";

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchDiagnosticStage { RequestCompletion, DispatchAdmission, Transport, HttpResponse, ResponseBody, Decode }

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchDiagnostic {
    origin: &'static str,
    stage: SearchDiagnosticStage,
    status: Option<u16>,
    failure: Option<&'static str>,
}

impl SearchDiagnostic {
    pub fn new(stage: SearchDiagnosticStage, status: Option<http::StatusCode>, failure: Option<Failure>) -> Self {
        Self { origin: CATALOG_SEARCH_ORIGIN, stage, status: status.map(|status| status.as_u16()), failure: failure.map(Failure::code) }
    }

    pub fn emit(self) {
        if let Ok(serialized) = serde_json::to_string(&self) { log::info!(target: LOG_TARGET, "{}", serialized); }
    }
}
