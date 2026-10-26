use serde::Deserialize;
use serde_json::{json, Value};

use crate::{connect_wire::ConnectCluster, model::{bounded_text, validate_request_identifier, Failure}};

const TRACK_IDENTIFIER_CHARACTERS: usize = 22;
const MAXIMUM_DEVICE_CHARACTERS: usize = 512;
const MAXIMUM_OCCURRENCE_CHARACTERS: usize = 128;
const MAXIMUM_SAFE_JAVASCRIPT_INTEGER: u64 = 9007199254740991;
const TRACK_URI_PREFIX: &str = "spotify:track:";
const COMMAND_FIELD: &str = "command";
const ENDPOINT_FIELD: &str = "endpoint";
const LOGGING_FIELD: &str = "logging_params";
const REQUEST_IDENTIFIER_FIELD: &str = "command_id";
const VALUE_FIELD: &str = "value";
const TRACK_FIELD: &str = "track";
const URI_FIELD: &str = "uri";
const OCCURRENCE_FIELD: &str = "uid";
const RESUME_ENDPOINT: &str = "resume";
const PAUSE_ENDPOINT: &str = "pause";
const NEXT_ENDPOINT: &str = "skip_next";
const PREVIOUS_ENDPOINT: &str = "skip_prev";
const SEEK_ENDPOINT: &str = "seek_to";
const QUEUE_ENDPOINT: &str = "add_to_queue";

#[derive(Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum ConnectCommand {
    Play {},
    Pause {},
    Next {},
    Previous {},
    Seek { position_milliseconds: u64, expected_spotify_track_identifier: String },
    AddToQueue { spotify_track_identifier: String, occurrence_identifier: String },
}

fn track_identifier(value: &str) -> bool {
    value.len() == TRACK_IDENTIFIER_CHARACTERS && value.bytes().all(|character| character.is_ascii_alphanumeric())
}

pub fn validate_target(value: &str) -> Result<(), Failure> {
    if !bounded_text(value, MAXIMUM_DEVICE_CHARACTERS) || value.contains(char::is_whitespace) { return Err(Failure::InvalidInput); }
    Ok(())
}

impl ConnectCommand {
    pub fn validate(&self, request_identifier: &str, target_device_identifier: &str) -> Result<(), Failure> {
        validate_request_identifier(request_identifier)?;
        if request_identifier.contains(char::is_whitespace) { return Err(Failure::InvalidInput); }
        validate_target(target_device_identifier)?;
        match self {
            Self::Seek { position_milliseconds, expected_spotify_track_identifier } => {
                if *position_milliseconds > MAXIMUM_SAFE_JAVASCRIPT_INTEGER || !track_identifier(expected_spotify_track_identifier) {
                    return Err(Failure::InvalidInput);
                }
            },
            Self::AddToQueue { spotify_track_identifier, occurrence_identifier } => {
                if !track_identifier(spotify_track_identifier) || !bounded_text(occurrence_identifier, MAXIMUM_OCCURRENCE_CHARACTERS)
                    || occurrence_identifier.contains(char::is_whitespace) { return Err(Failure::InvalidInput); }
            },
            _ => (),
        }
        Ok(())
    }

    pub fn prepare(&self, request_identifier: &str, target_device_identifier: &str, cluster: &ConnectCluster) -> Result<Value, Failure> {
        self.validate(request_identifier, target_device_identifier)?;
        if cluster.active_device_identifier.is_empty() { return Err(Failure::Unsupported); }
        if cluster.active_device_identifier != target_device_identifier { return Err(Failure::Superseded); }
        let playback = cluster.playback.as_ref().ok_or(Failure::Unsupported)?;
        if !playback.disallow_remote_control_reasons.is_empty() { return Err(Failure::Forbidden); }
        let (endpoint, restrictions) = match self {
            Self::Play {} => (RESUME_ENDPOINT, &playback.disallow_resuming_reasons),
            Self::Pause {} => (PAUSE_ENDPOINT, &playback.disallow_pausing_reasons),
            Self::Next {} => (NEXT_ENDPOINT, &playback.disallow_next_reasons),
            Self::Previous {} => (PREVIOUS_ENDPOINT, &playback.disallow_previous_reasons),
            Self::Seek { .. } => (SEEK_ENDPOINT, &playback.disallow_seeking_reasons),
            Self::AddToQueue { .. } => (QUEUE_ENDPOINT, &playback.disallow_queue_reasons),
        };
        if !restrictions.is_empty() { return Err(Failure::Forbidden); }
        let mut body = json!({ (COMMAND_FIELD): { (ENDPOINT_FIELD): endpoint,
            (LOGGING_FIELD): { (REQUEST_IDENTIFIER_FIELD): request_identifier } } });
        match self {
            Self::Seek { position_milliseconds, expected_spotify_track_identifier } => {
                let expected_uri = TRACK_URI_PREFIX.to_owned() + expected_spotify_track_identifier;
                if playback.track.as_ref().map(|track| track.uri.as_str()) != Some(expected_uri.as_str()) { return Err(Failure::Superseded); }
                let duration = u64::try_from(playback.duration_milliseconds).map_err(|_| Failure::InvalidResponse)?;
                if *position_milliseconds >= duration { return Err(Failure::InvalidInput); }
                body[COMMAND_FIELD][VALUE_FIELD] = json!(position_milliseconds);
            },
            Self::AddToQueue { spotify_track_identifier, occurrence_identifier } => {
                body[COMMAND_FIELD][TRACK_FIELD] = json!({ (URI_FIELD): TRACK_URI_PREFIX.to_owned() + spotify_track_identifier,
                    (OCCURRENCE_FIELD): occurrence_identifier });
            },
            _ => (),
        }
        Ok(body)
    }
}
