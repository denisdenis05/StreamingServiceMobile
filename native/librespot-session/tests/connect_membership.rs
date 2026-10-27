use serde_json::{json, Value};
use streaming_spotify_session::{connect_membership::decode_current_membership, connect_wire::MAXIMUM_FRAME_BYTES, model::Failure};

const SESSION: &str = "synthetic-real-session";
const HOST: &str = "synthetic-real-host";
const PARTICIPANT: &str = "synthetic-current-participant";
const OTHER_PARTICIPANT: &str = "synthetic-other-participant";
const SECRET: &str = "synthetic-private-invitation";
const SESSION_FIELD: &str = "session_id";
const OWNER_FIELD: &str = "is_session_owner";
const ACTIVE_FIELD: &str = "active";
const HOST_FIELD: &str = "hostActiveDeviceId";
const MEMBERS_FIELD: &str = "session_members";
const IDENTIFIER_FIELD: &str = "id";
const INVITATION_FIELD: &str = "join_session_token";
const DISPLAY_FIELD: &str = "display_name";
const EXPORTED_SESSION_FIELD: &str = "sessionIdentifier";
const EXPORTED_OWNER_FIELD: &str = "ownedByCurrentAccount";
const EXPORTED_HOST_FIELD: &str = "hostDeviceIdentifier";
const EXPORTED_MEMBERS_FIELD: &str = "participantIdentifiers";
const TRUE_TEXT: &str = "true";
const WHITESPACE_IDENTIFIER: &str = "synthetic invalid identifier";
const CONTROL_IDENTIFIER: &str = "synthetic\ninvalid";
const EMPTY_TEXT: &str = "";
const BLANK_TEXT: &str = " ";
const FIRST_POSITION: usize = 0;
const MAXIMUM_PARTICIPANTS: usize = 256;
const ONE_ITEM: usize = 1;
const PADDING_BYTE: u8 = 0;

fn wire_membership() -> Value {
    json!({ (SESSION_FIELD): SESSION, (OWNER_FIELD): true, (ACTIVE_FIELD): true,
        (HOST_FIELD): HOST, (MEMBERS_FIELD): [{ (IDENTIFIER_FIELD): PARTICIPANT }, { (IDENTIFIER_FIELD): OTHER_PARTICIPANT }] })
}
fn decode(value: &Value) -> Result<streaming_spotify_session::connect_membership::ConnectJamMembership, Failure> {
    decode_current_membership(&serde_json::to_vec(value).unwrap())
}

#[test]
fn authenticated_current_membership_retains_actual_session_host_role_and_participant_order() {
    let membership = decode(&wire_membership()).unwrap();
    assert_eq!(membership.session_identifier, SESSION); assert!(membership.owned_by_current_account); assert!(membership.active);
    assert_eq!(membership.host_device_identifier.as_deref(), Some(HOST));
    assert_eq!(membership.participant_identifiers, [PARTICIPANT, OTHER_PARTICIPANT]);
}

#[test]
fn inactive_and_guest_membership_are_not_promoted_to_an_active_owned_host() {
    let mut wire = wire_membership(); wire[OWNER_FIELD] = json!(false); wire[ACTIVE_FIELD] = json!(false);
    let membership = decode(&wire).unwrap();
    assert!(!membership.owned_by_current_account); assert!(!membership.active);
}

#[test]
fn missing_null_and_blank_hosts_remain_absent_without_a_local_device_substitute() {
    let mut missing = wire_membership(); missing.as_object_mut().unwrap().remove(HOST_FIELD);
    assert!(decode(&missing).unwrap().host_device_identifier.is_none());
    for host in [Value::Null, json!(EMPTY_TEXT), json!(BLANK_TEXT)] {
        let mut wire = wire_membership(); wire[HOST_FIELD] = host;
        assert!(decode(&wire).unwrap().host_device_identifier.is_none());
    }
}

#[test]
fn invitation_credentials_display_names_and_unknown_fields_are_never_exported() {
    let mut wire = wire_membership(); wire[INVITATION_FIELD] = json!(SECRET); wire[MEMBERS_FIELD][FIRST_POSITION][DISPLAY_FIELD] = json!(SECRET);
    let membership = decode(&wire).unwrap(); let serialized = serde_json::to_value(membership).unwrap();
    let mut keys = serialized.as_object().unwrap().keys().map(String::as_str).collect::<Vec<_>>(); keys.sort_unstable();
    let mut expected = vec![EXPORTED_SESSION_FIELD, EXPORTED_OWNER_FIELD, ACTIVE_FIELD, EXPORTED_HOST_FIELD, EXPORTED_MEMBERS_FIELD]; expected.sort_unstable();
    assert_eq!(keys, expected); assert!(!serialized.to_string().contains(SECRET));
}

#[test]
fn coerced_roles_and_malformed_host_or_member_types_cannot_establish_membership() {
    for field in [OWNER_FIELD, ACTIVE_FIELD, HOST_FIELD, MEMBERS_FIELD] {
        let mut wire = wire_membership(); wire[field] = json!(TRUE_TEXT);
        if field == HOST_FIELD { wire[field] = json!(true); }
        assert!(matches!(decode(&wire), Err(Failure::InvalidResponse)));
    }
    let mut wire = wire_membership(); wire[MEMBERS_FIELD][FIRST_POSITION][IDENTIFIER_FIELD] = json!(true);
    assert!(matches!(decode(&wire), Err(Failure::InvalidResponse)));
}

#[test]
fn duplicate_or_invalid_identifiers_never_create_multiple_or_foreign_members() {
    let mut duplicate = wire_membership(); duplicate[MEMBERS_FIELD] = json!([{ (IDENTIFIER_FIELD): PARTICIPANT }, { (IDENTIFIER_FIELD): PARTICIPANT }]);
    assert!(matches!(decode(&duplicate), Err(Failure::InvalidResponse)));
    for identifier in [EMPTY_TEXT, WHITESPACE_IDENTIFIER, CONTROL_IDENTIFIER] {
        let mut wire = wire_membership(); wire[SESSION_FIELD] = json!(identifier);
        assert!(matches!(decode(&wire), Err(Failure::InvalidResponse)));
        let mut wire = wire_membership(); wire[MEMBERS_FIELD][FIRST_POSITION][IDENTIFIER_FIELD] = json!(identifier);
        assert!(matches!(decode(&wire), Err(Failure::InvalidResponse)));
    }
}

#[test]
fn bounded_participant_and_response_sizes_do_not_accept_truncated_or_unbounded_state() {
    let mut wire = wire_membership(); wire[MEMBERS_FIELD] = Value::Array((FIRST_POSITION..MAXIMUM_PARTICIPANTS + ONE_ITEM)
        .map(|position| json!({ (IDENTIFIER_FIELD): position.to_string() })).collect());
    assert!(matches!(decode(&wire), Err(Failure::InvalidResponse)));
    assert!(matches!(decode_current_membership(&vec![PADDING_BYTE; MAXIMUM_FRAME_BYTES + ONE_ITEM]), Err(Failure::Backpressure)));
}

#[test]
fn null_missing_or_non_json_payloads_are_invalid_instead_of_a_claim_that_the_account_left() {
    for wire in [Value::Null, json!({}), json!([])] { assert!(matches!(decode(&wire), Err(Failure::InvalidResponse))); }
    assert!(matches!(decode_current_membership(SECRET.as_bytes()), Err(Failure::InvalidResponse)));
}
