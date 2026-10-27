use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::{connect_wire::MAXIMUM_FRAME_BYTES, model::{bounded_text, Failure}};

pub const CURRENT_MEMBERSHIP_PATH: &str = "/social-connect/v2/sessions/current";
const MAXIMUM_IDENTIFIER_CHARACTERS: usize = 512;
const MAXIMUM_PARTICIPANTS: usize = 256;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectJamMembership {
    pub session_identifier: String,
    pub owned_by_current_account: bool,
    pub active: bool,
    pub host_device_identifier: Option<String>,
    pub participant_identifiers: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectMembershipReading {
    pub account_identifier: String,
    pub membership: Option<ConnectJamMembership>,
}

#[derive(Deserialize)]
struct WireMembership {
    #[serde(rename = "session_id")]
    session_identifier: String,
    #[serde(rename = "is_session_owner")]
    owned_by_current_account: bool,
    active: bool,
    #[serde(rename = "hostActiveDeviceId")]
    host_device_identifier: Option<String>,
    #[serde(rename = "session_members")]
    participants: Vec<WireParticipant>,
}

#[derive(Deserialize)]
struct WireParticipant { #[serde(rename = "id")] identifier: String }

fn identifier(value: &str) -> bool {
    bounded_text(value, MAXIMUM_IDENTIFIER_CHARACTERS) && !value.contains(char::is_whitespace)
}

pub fn decode_current_membership(bytes: &[u8]) -> Result<ConnectJamMembership, Failure> {
    if bytes.len() > MAXIMUM_FRAME_BYTES { return Err(Failure::Backpressure); }
    let response: WireMembership = serde_json::from_slice(bytes).map_err(|_| Failure::InvalidResponse)?;
    if !identifier(&response.session_identifier) || response.participants.len() > MAXIMUM_PARTICIPANTS { return Err(Failure::InvalidResponse); }
    let host_device_identifier = response.host_device_identifier.filter(|identifier| !identifier.trim().is_empty());
    if host_device_identifier.as_ref().is_some_and(|value| !identifier(value)) { return Err(Failure::InvalidResponse); }
    let mut seen = HashSet::new();
    let mut participant_identifiers = Vec::with_capacity(response.participants.len());
    for participant in response.participants {
        if !identifier(&participant.identifier) || !seen.insert(participant.identifier.clone()) { return Err(Failure::InvalidResponse); }
        participant_identifiers.push(participant.identifier);
    }
    Ok(ConnectJamMembership { session_identifier: response.session_identifier, owned_by_current_account: response.owned_by_current_account,
        active: response.active, host_device_identifier, participant_identifiers })
}
