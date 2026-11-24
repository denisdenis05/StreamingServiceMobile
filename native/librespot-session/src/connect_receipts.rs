use serde::Serialize;
use serde_json::Value;

use crate::model::bounded_text;

const EMPTY_BODY_BYTES: usize = 0;
const MAXIMUM_IDENTIFIER_CHARACTERS: usize = 2048;
const ACKNOWLEDGEMENT_FIELDS: &[&str] = &["ack_id", "ackId", "acknowledgement_id"];
const COMMAND_FIELDS: &[&str] = &["command_id", "commandId"];
const REQUEST_FIELDS: &[&str] = &["request_id", "requestId"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectCommandResponseKind { Empty, Object, Other, Malformed }

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectCommandAcknowledgement {
    pub response_kind: ConnectCommandResponseKind,
    pub response_bytes: usize,
    pub delivery_observed: bool,
    pub observed_native_monotonic_milliseconds: Option<u64>,
    pub observed_queue_revision: Option<String>,
    pub acknowledgement_identifier: Option<String>,
    pub command_identifier: Option<String>,
    pub request_identifier: Option<String>,
}

fn identifier(value: &Value, fields: &[&str]) -> Option<String> {
    let mut selected: Option<&str> = None;
    for field in fields {
        let Some(value) = value.get(field) else { continue; };
        let candidate = value.as_str().filter(|candidate| bounded_text(candidate, MAXIMUM_IDENTIFIER_CHARACTERS))?;
        if selected.is_some_and(|selected| selected != candidate) { return None; }
        selected = Some(candidate);
    }
    selected.map(str::to_owned)
}

pub fn decode_command_acknowledgement(bytes: &[u8]) -> ConnectCommandAcknowledgement {
    let (response_kind, value) = if bytes.len() == EMPTY_BODY_BYTES { (ConnectCommandResponseKind::Empty, Value::Null) }
        else { match serde_json::from_slice::<Value>(bytes) {
            Ok(value) if value.is_object() => (ConnectCommandResponseKind::Object, value),
            Ok(value) => (ConnectCommandResponseKind::Other, value),
            Err(_) => (ConnectCommandResponseKind::Malformed, Value::Null),
        } };
    ConnectCommandAcknowledgement { response_kind, response_bytes: bytes.len(), delivery_observed: false,
        observed_native_monotonic_milliseconds: None, observed_queue_revision: None,
        acknowledgement_identifier: identifier(&value, ACKNOWLEDGEMENT_FIELDS), command_identifier: identifier(&value, COMMAND_FIELDS),
        request_identifier: identifier(&value, REQUEST_FIELDS) }
}
