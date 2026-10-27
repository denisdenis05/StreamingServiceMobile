use serde_json::json;
use streaming_spotify_session::connect_receipts::{decode_command_acknowledgement, ConnectCommandResponseKind};

const ACKNOWLEDGEMENT: &str = "synthetic-server-acknowledgement";
const COMMAND: &str = "synthetic-server-command";
const REQUEST: &str = "synthetic-server-request";
const OTHER_ACKNOWLEDGEMENT: &str = "synthetic-other-acknowledgement";
const ACKNOWLEDGEMENT_FIELD: &str = "ack_id";
const ACKNOWLEDGEMENT_ALIAS: &str = "ackId";
const COMMAND_FIELD: &str = "command_id";
const REQUEST_FIELD: &str = "request_id";
const PRIVATE_FIELD: &str = "unrecognized_private_data";
const PRIVATE_VALUE: &str = "synthetic-private-value";
const CONTROL_IDENTIFIER: &str = "synthetic\nidentifier";
const EXCESSIVE_IDENTIFIER_CHARACTERS: usize = 2049;
const PADDING_CHARACTER: char = 'x';
const EMPTY_BODY: &[u8] = b"";
const NON_OBJECT_BODY: &[u8] = b"[]";
const MALFORMED_BODY: &[u8] = b"{";

#[test]
fn empty_http_acceptance_has_no_invented_remote_command_or_delivery_identifier() {
    let receipt = decode_command_acknowledgement(EMPTY_BODY);
    assert!(matches!(receipt.response_kind, ConnectCommandResponseKind::Empty));
    assert!(receipt.acknowledgement_identifier.is_none()); assert!(receipt.command_identifier.is_none()); assert!(receipt.request_identifier.is_none());
}

#[test]
fn recognized_server_identifier_fields_are_projected_without_exporting_other_response_data() {
    let bytes = serde_json::to_vec(&json!({ (ACKNOWLEDGEMENT_FIELD): ACKNOWLEDGEMENT, (COMMAND_FIELD): COMMAND, (REQUEST_FIELD): REQUEST,
        (PRIVATE_FIELD): PRIVATE_VALUE })).unwrap();
    let receipt = decode_command_acknowledgement(&bytes);
    assert!(matches!(receipt.response_kind, ConnectCommandResponseKind::Object));
    assert_eq!(receipt.response_bytes, bytes.len()); assert_eq!(receipt.acknowledgement_identifier.as_deref(), Some(ACKNOWLEDGEMENT));
    assert_eq!(receipt.command_identifier.as_deref(), Some(COMMAND)); assert_eq!(receipt.request_identifier.as_deref(), Some(REQUEST));
    assert!(!serde_json::to_string(&receipt).unwrap().contains(PRIVATE_VALUE));
}

#[test]
fn conflicting_aliases_coerced_values_control_text_and_excessive_identifiers_are_not_delivery_proof() {
    for value in [json!({ (ACKNOWLEDGEMENT_FIELD): ACKNOWLEDGEMENT, (ACKNOWLEDGEMENT_ALIAS): OTHER_ACKNOWLEDGEMENT }),
        json!({ (ACKNOWLEDGEMENT_FIELD): true }),
        json!({ (ACKNOWLEDGEMENT_FIELD): ACKNOWLEDGEMENT, (ACKNOWLEDGEMENT_ALIAS): true }), json!({ (ACKNOWLEDGEMENT_FIELD): CONTROL_IDENTIFIER }),
        json!({ (ACKNOWLEDGEMENT_FIELD): PADDING_CHARACTER.to_string().repeat(EXCESSIVE_IDENTIFIER_CHARACTERS) })] {
        assert!(decode_command_acknowledgement(&serde_json::to_vec(&value).unwrap()).acknowledgement_identifier.is_none());
    }
}

#[test]
fn non_object_and_malformed_response_bodies_remain_distinct_without_exporting_raw_payloads() {
    assert!(matches!(decode_command_acknowledgement(NON_OBJECT_BODY).response_kind, ConnectCommandResponseKind::Other));
    assert!(matches!(decode_command_acknowledgement(MALFORMED_BODY).response_kind, ConnectCommandResponseKind::Malformed));
}

#[test]
fn equal_explicit_acknowledgement_aliases_remain_one_server_identifier() {
    let value = json!({ (ACKNOWLEDGEMENT_FIELD): ACKNOWLEDGEMENT, (ACKNOWLEDGEMENT_ALIAS): ACKNOWLEDGEMENT });
    assert_eq!(decode_command_acknowledgement(&serde_json::to_vec(&value).unwrap()).acknowledgement_identifier.as_deref(), Some(ACKNOWLEDGEMENT));
}
