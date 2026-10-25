use std::{collections::HashMap, io::Read};

use base64::{Engine, engine::general_purpose::STANDARD};
use flate2::read::GzDecoder;
use librespot_protocol::{connect::{Cluster, ClusterUpdate}, player::ProvidedTrack};
use protobuf::Message;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::model::{bounded_text, Failure};

pub const CONNECTION_TOPIC: &str = "hm://pusher/v1/connections/";
pub const CLUSTER_TOPIC: &str = "hm://connect-state/v1/cluster";
pub const MEMBERSHIP_TOPIC: &str = "social-connect/v2/session_update";
pub const SESSION_MESSAGE_TOPIC: &str = "social-connect/v2/session_messages";
pub const COMMAND_TOPIC: &str = "hm://connect-state/v1/player/command";
pub const CONNECTION_HEADER: &str = "Spotify-Connection-Id";
pub const MAXIMUM_FRAME_BYTES: usize = 1048576;
pub const MAXIMUM_EVENT_BYTES: usize = 262144;
const MAXIMUM_DECOMPRESSED_BYTES: usize = 1048576;
const MAXIMUM_IDENTIFIER_CHARACTERS: usize = 2048;
const MAXIMUM_QUEUE_TRACKS: usize = 2000;
const SINGLE_PAYLOAD: usize = 1;
const BOUNDARY_INCREMENT: usize = 1;
const TRANSFER_ENCODING_HEADER: &str = "transfer-encoding";
const GZIP_ENCODING: &str = "gzip";
const MESSAGE_KIND: &str = "message";
const REQUEST_KIND: &str = "request";
const PONG_KIND: &str = "pong";
const MESSAGE_ID_FIELD: &str = "message_id";
const SOURCE_DEVICE_FIELD: &str = "sent_by_device_id";
const COMMAND_FIELD: &str = "command";
const ENDPOINT_FIELD: &str = "endpoint";
const FIRST_POSITION: usize = 0;

#[derive(Deserialize)]
struct DealerEnvelope {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    payloads: Vec<Value>,
    uri: Option<String>,
    key: Option<String>,
    message_ident: Option<String>,
    payload: Option<CompressedPayload>,
}

#[derive(Deserialize)]
struct CompressedPayload { compressed: String }

pub enum DealerInput {
    Connection(String),
    Cluster(ConnectCluster),
    Membership(Value),
    SessionMessage(Value),
    Command { key: String, request: Value },
    RejectedCommand { key: String },
    Pong,
    Unhandled,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectTrack {
    pub uri: String,
    pub occurrence_identifier: Option<String>,
    pub provider: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectPlayback {
    pub track: Option<ConnectTrack>,
    pub playback_identifier: String,
    pub session_identifier: String,
    pub queue_revision: String,
    pub session_command_identifier: Option<String>,
    pub timestamp_milliseconds: i64,
    pub position_as_of_timestamp_milliseconds: i64,
    pub position_milliseconds: i64,
    pub duration_milliseconds: i64,
    pub playback_speed: f64,
    pub playing: bool,
    pub paused: bool,
    pub buffering: bool,
    pub next_tracks: Vec<ConnectTrack>,
    pub previous_tracks: Vec<ConnectTrack>,
    pub disallow_pausing_reasons: Vec<String>,
    pub disallow_resuming_reasons: Vec<String>,
    pub disallow_seeking_reasons: Vec<String>,
    pub disallow_next_reasons: Vec<String>,
    pub disallow_previous_reasons: Vec<String>,
    pub disallow_queue_reasons: Vec<String>,
    pub disallow_remote_control_reasons: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectDevice {
    pub identifier: String,
    pub name: String,
    pub can_play: bool,
    pub controllable: bool,
    pub hidden: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectCluster {
    pub changed_at_milliseconds: i64,
    pub server_at_milliseconds: i64,
    pub active_device_identifier: String,
    pub playback: Option<ConnectPlayback>,
    pub devices: Vec<ConnectDevice>,
    pub acknowledgement_identifier: Option<String>,
    pub update_reason: Option<i32>,
    pub devices_changed: Vec<String>,
}

fn optional_identifier(value: &str) -> Result<Option<String>, Failure> {
    if value.is_empty() { return Ok(None); }
    if !bounded_text(value, MAXIMUM_IDENTIFIER_CHARACTERS) { return Err(Failure::InvalidResponse); }
    Ok(Some(value.to_owned()))
}

fn track(value: &ProvidedTrack) -> Result<ConnectTrack, Failure> {
    if !bounded_text(&value.uri, MAXIMUM_IDENTIFIER_CHARACTERS) { return Err(Failure::InvalidResponse); }
    Ok(ConnectTrack { uri: value.uri.clone(), occurrence_identifier: optional_identifier(&value.uid)?, provider: value.provider.clone() })
}

pub fn normalize_cluster(cluster: Cluster) -> Result<ConnectCluster, Failure> {
    let playback = if let Some(state) = cluster.player_state.as_ref() {
        if state.next_tracks.len() > MAXIMUM_QUEUE_TRACKS || state.prev_tracks.len() > MAXIMUM_QUEUE_TRACKS
            || !state.playback_speed.is_finite() { return Err(Failure::InvalidResponse); }
        Some(ConnectPlayback { track: state.track.as_ref().filter(|value| !value.uri.is_empty()).map(track).transpose()?,
            playback_identifier: state.playback_id.clone(), session_identifier: state.session_id.clone(), queue_revision: state.queue_revision.clone(),
            session_command_identifier: optional_identifier(&state.session_command_id)?,
            timestamp_milliseconds: state.timestamp, position_as_of_timestamp_milliseconds: state.position_as_of_timestamp,
            position_milliseconds: state.position, duration_milliseconds: state.duration, playback_speed: state.playback_speed,
            playing: state.is_playing, paused: state.is_paused, buffering: state.is_buffering,
            next_tracks: state.next_tracks.iter().map(track).collect::<Result<_, _>>()?,
            previous_tracks: state.prev_tracks.iter().map(track).collect::<Result<_, _>>()?,
            disallow_pausing_reasons: state.restrictions.disallow_pausing_reasons.clone(),
            disallow_resuming_reasons: state.restrictions.disallow_resuming_reasons.clone(),
            disallow_seeking_reasons: state.restrictions.disallow_seeking_reasons.clone(),
            disallow_next_reasons: state.restrictions.disallow_skipping_next_reasons.clone(),
            disallow_previous_reasons: state.restrictions.disallow_skipping_prev_reasons.clone(),
            disallow_queue_reasons: state.restrictions.disallow_add_to_queue_reasons.clone(),
            disallow_remote_control_reasons: state.restrictions.disallow_remote_control_reasons.clone() })
    } else { None };
    let mut devices = cluster.device.into_iter().map(|(identifier, device)| ConnectDevice {
        identifier, name: device.name, can_play: device.can_play,
        controllable: device.capabilities.is_controllable, hidden: device.capabilities.hidden,
    }).collect::<Vec<_>>();
    devices.sort_by(|first, second| first.identifier.cmp(&second.identifier));
    let normalized = ConnectCluster { changed_at_milliseconds: cluster.changed_timestamp_ms,
        server_at_milliseconds: cluster.server_timestamp_ms, active_device_identifier: cluster.active_device_id, playback, devices,
        acknowledgement_identifier: None, update_reason: None, devices_changed: Vec::new() };
    if serde_json::to_vec(&normalized).map_err(|_| Failure::InvalidResponse)?.len() > MAXIMUM_EVENT_BYTES { return Err(Failure::Backpressure); }
    Ok(normalized)
}

pub fn decode_cluster_snapshot(bytes: &[u8]) -> Result<ConnectCluster, Failure> {
    if bytes.len() > MAXIMUM_FRAME_BYTES { return Err(Failure::InvalidResponse); }
    normalize_cluster(Cluster::parse_from_bytes(bytes).map_err(|_| Failure::InvalidResponse)?)
}

fn decompress(headers: &HashMap<String, String>, bytes: Vec<u8>) -> Result<Vec<u8>, Failure> {
    let compressed = headers.iter().any(|(name, value)| name.eq_ignore_ascii_case(TRANSFER_ENCODING_HEADER) && value.eq_ignore_ascii_case(GZIP_ENCODING));
    if !compressed { return Ok(bytes); }
    let mut output = Vec::new();
    GzDecoder::new(bytes.as_slice()).take((MAXIMUM_DECOMPRESSED_BYTES + BOUNDARY_INCREMENT) as u64)
        .read_to_end(&mut output).map_err(|_| Failure::InvalidResponse)?;
    if output.len() > MAXIMUM_DECOMPRESSED_BYTES { return Err(Failure::Backpressure); }
    Ok(output)
}

fn payload(headers: &HashMap<String, String>, value: Value) -> Result<Vec<u8>, Failure> {
    let bytes = match value {
        Value::String(text) => STANDARD.decode(&text).unwrap_or_else(|_| text.into_bytes()),
        Value::Array(values) => values.into_iter().map(|value| value.as_u64().and_then(|value| u8::try_from(value).ok())
            .ok_or(Failure::InvalidResponse)).collect::<Result<Vec<_>, _>>()?,
        value @ Value::Object(_) => serde_json::to_vec(&value).map_err(|_| Failure::InvalidResponse)?,
        _ => return Err(Failure::InvalidResponse),
    };
    decompress(headers, bytes)
}

pub fn decode_dealer_input(serialized: &[u8]) -> Result<DealerInput, Failure> {
    if serialized.len() > MAXIMUM_FRAME_BYTES { return Err(Failure::Backpressure); }
    let envelope: DealerEnvelope = serde_json::from_slice(serialized).map_err(|_| Failure::InvalidResponse)?;
    if envelope.kind == PONG_KIND { return Ok(DealerInput::Pong); }
    if envelope.kind == REQUEST_KIND {
        let key = envelope.key.filter(|value| bounded_text(value, MAXIMUM_IDENTIFIER_CHARACTERS)).ok_or(Failure::InvalidResponse)?;
        if envelope.message_ident.as_deref() != Some(COMMAND_TOPIC) { return Ok(DealerInput::RejectedCommand { key }); }
        let encoded = envelope.payload.ok_or(Failure::InvalidResponse)?.compressed;
        let bytes = decompress(&envelope.headers, STANDARD.decode(encoded).map_err(|_| Failure::InvalidResponse)?)?;
        if bytes.len() > MAXIMUM_EVENT_BYTES { return Err(Failure::Backpressure); }
        let request: Value = serde_json::from_slice(&bytes).map_err(|_| Failure::InvalidResponse)?;
        if request.get(MESSAGE_ID_FIELD).and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).is_none()
            || request.get(SOURCE_DEVICE_FIELD).and_then(Value::as_str).filter(|value| bounded_text(value, MAXIMUM_IDENTIFIER_CHARACTERS)).is_none()
            || request.get(COMMAND_FIELD).and_then(|value| value.get(ENDPOINT_FIELD)).and_then(Value::as_str)
                .filter(|value| bounded_text(value, MAXIMUM_IDENTIFIER_CHARACTERS)).is_none() { return Err(Failure::InvalidResponse); }
        return Ok(DealerInput::Command { key, request });
    }
    if envelope.kind != MESSAGE_KIND { return Ok(DealerInput::Unhandled); }
    let topic = envelope.uri.unwrap_or_default();
    if topic.starts_with(CONNECTION_TOPIC) {
        let identifier = envelope.headers.iter().find(|(name, _)| name.eq_ignore_ascii_case(CONNECTION_HEADER)).map(|(_, value)| value)
            .filter(|value| bounded_text(value, MAXIMUM_IDENTIFIER_CHARACTERS)).ok_or(Failure::InvalidResponse)?;
        return Ok(DealerInput::Connection(identifier.clone()));
    }
    if topic != CLUSTER_TOPIC && topic != MEMBERSHIP_TOPIC && topic != SESSION_MESSAGE_TOPIC { return Ok(DealerInput::Unhandled); }
    if envelope.payloads.len() != SINGLE_PAYLOAD { return Err(Failure::InvalidResponse); }
    let bytes = payload(&envelope.headers, envelope.payloads.into_iter().nth(FIRST_POSITION).ok_or(Failure::InvalidResponse)?)?;
    if topic == CLUSTER_TOPIC {
        let update = ClusterUpdate::parse_from_bytes(&bytes).map_err(|_| Failure::InvalidResponse)?;
        let mut cluster = normalize_cluster(update.cluster.into_option().ok_or(Failure::InvalidResponse)?)?;
        cluster.acknowledgement_identifier = optional_identifier(&update.ack_id)?;
        cluster.update_reason = Some(update.update_reason.value());
        if update.devices_that_changed.len() > MAXIMUM_QUEUE_TRACKS { return Err(Failure::InvalidResponse); }
        cluster.devices_changed = update.devices_that_changed.into_iter().map(|value| optional_identifier(&value)
            .and_then(|identifier| identifier.ok_or(Failure::InvalidResponse))).collect::<Result<_, _>>()?;
        if serde_json::to_vec(&cluster).map_err(|_| Failure::InvalidResponse)?.len() > MAXIMUM_EVENT_BYTES { return Err(Failure::Backpressure); }
        return Ok(DealerInput::Cluster(cluster));
    }
    if bytes.len() > MAXIMUM_EVENT_BYTES { return Err(Failure::Backpressure); }
    let update = serde_json::from_slice(&bytes).map_err(|_| Failure::InvalidResponse)?;
    if topic == MEMBERSHIP_TOPIC { Ok(DealerInput::Membership(update)) } else { Ok(DealerInput::SessionMessage(update)) }
}
