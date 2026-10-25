use librespot_core::authentication::Credentials;
use librespot_protocol::authentication::AuthenticationType;
use serde_json::json;
use streaming_spotify_session::{connect_bridge::{decode_control, decode_start, ConnectControl}, desktop_login5::CLIENT_IDENTIFIER,
    model::{Failure, StoredSession, SCHEMA_VERSION}};

const ACCOUNT: &str = "synthetic-account";
const DEVICE: &str = "synthetic-device";
const NAME: &str = "Synthetic observer";
const REQUEST_KEY: &str = "synthetic-request";
const STORED_BYTES: &[u8] = &[7, 8, 9];
const STORED_FIELD: &str = "storedCredential";
const ACCOUNT_FIELD: &str = "accountIdentifier";
const OTHER_ACCOUNT: &str = "synthetic-other-account";
const CONFIGURATION_FIELD: &str = "configuration";
const NAME_FIELD: &str = "name";
const PLAYBACK_READY_FIELD: &str = "playbackReady";
const OPERATION_FIELD: &str = "operation";
const GENERATION_FIELD: &str = "generation";
const KEY_FIELD: &str = "key";
const ACCEPTED_FIELD: &str = "accepted";
const REFRESH: &str = "refresh";
const REPLY: &str = "reply";
const RAW_COMMAND: &str = "command";
const UNKNOWN_FIELD: &str = "syntheticUnknownField";
const INVALID_RECORD: &str = "synthetic-invalid-record";
const CONTROL_KEY: &str = "request\nkey";
const EMPTY_TEXT: &str = "";
const VALID_GENERATION: u64 = 3;
const ZERO_GENERATION: u64 = 0;
const UNSAFE_GENERATION: u64 = 9007199254740992;
const MAXIMUM_KEY_EXCEEDED: usize = 2049;
const MAXIMUM_INPUT_EXCEEDED: usize = 131073;

fn start(playback_ready: bool) -> serde_json::Value {
    let stored = StoredSession { schema_version: SCHEMA_VERSION, account_identifier: ACCOUNT.to_owned(),
        device_identifier: DEVICE.to_owned(), client_identifier: CLIENT_IDENTIFIER.to_owned(), credentials: Credentials {
            username: Some(ACCOUNT.to_owned()), auth_type: AuthenticationType::AUTHENTICATION_STORED_SPOTIFY_CREDENTIALS,
            auth_data: STORED_BYTES.to_vec() } };
    json!({ (ACCOUNT_FIELD): ACCOUNT, (STORED_FIELD): serde_json::to_string(&stored).unwrap(),
        (CONFIGURATION_FIELD): { (NAME_FIELD): NAME, (PLAYBACK_READY_FIELD): playback_ready } })
}

#[test]
fn native_start_accepts_a_bound_reusable_record_and_observer_configuration() {
    let decoded = decode_start(&start(false).to_string()).unwrap();
    assert_eq!(decoded.configuration.name, NAME); assert!(!decoded.configuration.playback_ready);
}

#[test]
fn native_start_cannot_advertise_a_player_before_the_player_adapter_exists() {
    assert!(matches!(decode_start(&start(true).to_string()), Err(Failure::Unsupported)));
}

#[test]
fn connection_start_rejects_a_saved_record_from_another_selected_account() {
    let mut value = start(false); value[ACCOUNT_FIELD] = json!(OTHER_ACCOUNT);
    assert!(matches!(decode_start(&value.to_string()), Err(Failure::Unauthorized)));
}

#[test]
fn malformed_oversized_and_unbound_starts_fail_before_any_runtime_or_network_work() {
    let mut unknown = start(false); unknown[UNKNOWN_FIELD] = json!(true);
    let mut malformed = start(false); malformed[STORED_FIELD] = json!(INVALID_RECORD);
    for serialized in [EMPTY_TEXT.to_owned(), NAME.repeat(MAXIMUM_INPUT_EXCEEDED), unknown.to_string(), malformed.to_string()] {
        assert!(decode_start(&serialized).is_err());
    }
}

#[test]
fn native_controls_accept_only_bound_refreshes_and_explicit_command_replies() {
    assert!(matches!(decode_control(&json!({ (OPERATION_FIELD): REFRESH, (GENERATION_FIELD): VALID_GENERATION }).to_string()),
        Ok(ConnectControl::Refresh { generation: VALID_GENERATION })));
    assert!(matches!(decode_control(&json!({ (OPERATION_FIELD): REPLY, (GENERATION_FIELD): VALID_GENERATION,
        (KEY_FIELD): REQUEST_KEY, (ACCEPTED_FIELD): false }).to_string()), Ok(ConnectControl::Reply { accepted: false, .. })));
    assert!(decode_control(&json!({ (OPERATION_FIELD): RAW_COMMAND, (GENERATION_FIELD): VALID_GENERATION }).to_string()).is_err());
}

#[test]
fn stale_unsafe_and_unknown_control_fields_never_become_native_actions() {
    for generation in [ZERO_GENERATION, UNSAFE_GENERATION] {
        assert!(decode_control(&json!({ (OPERATION_FIELD): REFRESH, (GENERATION_FIELD): generation }).to_string()).is_err());
    }
    assert!(decode_control(&json!({ (OPERATION_FIELD): REFRESH, (GENERATION_FIELD): VALID_GENERATION, (UNKNOWN_FIELD): true }).to_string()).is_err());
}

#[test]
fn native_replies_reject_missing_control_bearing_and_excessive_keys() {
    let excessive = NAME.repeat(MAXIMUM_KEY_EXCEEDED);
    for key in [EMPTY_TEXT, CONTROL_KEY, &excessive] {
        assert!(decode_control(&json!({ (OPERATION_FIELD): REPLY, (GENERATION_FIELD): VALID_GENERATION,
            (KEY_FIELD): key, (ACCEPTED_FIELD): true }).to_string()).is_err());
    }
}
