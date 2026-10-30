use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use librespot_core::SpotifyId;
use librespot_protocol::{connect::{PutStateReason, PutStateRequest}, player::{PlayerState, ProvidedTrack}};
use protobuf::{EnumOrUnknown, MessageField};

use crate::model::{bounded_text, Failure};

const MAXIMUM_IDENTIFIER_CHARACTERS: usize = 512;
pub const MAXIMUM_PUBLICATION_QUEUE_TRACKS: usize = 80;
const TRACK_URI_PREFIX: &str = "spotify:track:";
const TRACK_IDENTIFIER_CHARACTERS: usize = 22;
const NORMAL_PLAYBACK_SPEED: f64 = 1.0;
const PAUSED_PLAYBACK_SPEED: f64 = 0.0;
const INITIAL_SEQUENCE: u64 = 0;
const MINIMUM_DURATION_MILLISECONDS: u64 = 1;
const MINIMUM_SERVER_TIMESTAMP_MILLISECONDS: u64 = 1;
pub const MAXIMUM_PUBLICATION_SAMPLE_AGE_MILLISECONDS: u64 = 15000;
pub const MAXIMUM_PUBLICATION_CLOCK_UNCERTAINTY_MILLISECONDS: u64 = 2000;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConnectPublicationTrack {
    pub spotify_track_identifier: String,
    pub occurrence_identifier: String,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectPublicationPlayback { Playing, Paused, Buffering, PausedBuffering }

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConnectPublicationCommand {
    pub message_identifier: u32,
    pub sender_device_identifier: String,
    pub session_command_identifier: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConnectPublicationSnapshot {
    pub device_identifier: String,
    pub session_identifier: String,
    pub sequence: u64,
    pub playback_identifier: String,
    pub queue_revision: String,
    pub track: ConnectPublicationTrack,
    pub previous_tracks: Vec<ConnectPublicationTrack>,
    pub next_tracks: Vec<ConnectPublicationTrack>,
    pub position_milliseconds: u64,
    pub duration_milliseconds: u64,
    pub sampled_server_timestamp_milliseconds: u64,
    pub sampled_native_monotonic_milliseconds: u64,
    pub clock_uncertainty_milliseconds: u64,
    pub active_since_server_timestamp_milliseconds: u64,
    pub playback: ConnectPublicationPlayback,
    pub accepted_command: Option<ConnectPublicationCommand>,
}

fn identifier(identifier: &str) -> Result<(), Failure> {
    if !bounded_text(identifier, MAXIMUM_IDENTIFIER_CHARACTERS) || identifier.trim().is_empty()
        || identifier.contains(char::is_control) { return Err(Failure::InvalidInput); }
    Ok(())
}

fn provided_track(track: &ConnectPublicationTrack) -> Result<ProvidedTrack, Failure> {
    identifier(&track.occurrence_identifier)?;
    if track.spotify_track_identifier.len() != TRACK_IDENTIFIER_CHARACTERS
        || !track.spotify_track_identifier.bytes().all(|character| character.is_ascii_alphanumeric())
        || SpotifyId::from_base62(&track.spotify_track_identifier).is_err() { return Err(Failure::InvalidInput); }
    Ok(ProvidedTrack { uri: TRACK_URI_PREFIX.to_owned() + &track.spotify_track_identifier,
        uid: track.occurrence_identifier.clone(), ..Default::default() })
}

pub fn build_publication(registration: &PutStateRequest, snapshot: &ConnectPublicationSnapshot,
    publication_server_timestamp_milliseconds: u64) -> Result<PutStateRequest, Failure> {
    for value in [&snapshot.device_identifier, &snapshot.session_identifier, &snapshot.playback_identifier, &snapshot.queue_revision] { identifier(value)?; }
    if !registration.device.device_info.can_play || !registration.device.device_info.capabilities.can_be_player
        || registration.device.device_info.device_id != snapshot.device_identifier
        || registration.device.player_state.session_id != snapshot.session_identifier
        || snapshot.clock_uncertainty_milliseconds > MAXIMUM_PUBLICATION_CLOCK_UNCERTAINTY_MILLISECONDS
        || snapshot.sequence == INITIAL_SEQUENCE
        || snapshot.previous_tracks.len().saturating_add(snapshot.next_tracks.len()) > MAXIMUM_PUBLICATION_QUEUE_TRACKS
        || snapshot.duration_milliseconds < MINIMUM_DURATION_MILLISECONDS || snapshot.position_milliseconds > snapshot.duration_milliseconds
        || snapshot.duration_milliseconds > i64::MAX as u64
        || snapshot.active_since_server_timestamp_milliseconds < MINIMUM_SERVER_TIMESTAMP_MILLISECONDS
        || snapshot.active_since_server_timestamp_milliseconds > snapshot.sampled_server_timestamp_milliseconds
        || snapshot.sampled_server_timestamp_milliseconds > publication_server_timestamp_milliseconds
        || publication_server_timestamp_milliseconds > i64::MAX as u64 { return Err(Failure::InvalidInput); }
    let mut occurrences = HashSet::new();
    for track in snapshot.previous_tracks.iter().chain(std::iter::once(&snapshot.track)).chain(snapshot.next_tracks.iter()) {
        if !occurrences.insert(&track.occurrence_identifier) { return Err(Failure::InvalidInput); }
    }
    let mut publication = registration.clone();
    let capabilities = publication.device.mut_or_insert_default().device_info.mut_or_insert_default().capabilities.mut_or_insert_default();
    capabilities.supports_transfer_command = false;
    capabilities.supports_set_options_command = false;
    capabilities.supports_playlist_v2 = false;
    capabilities.supports_command_request = false;
    capabilities.is_controllable = false;
    publication.put_state_reason = EnumOrUnknown::new(PutStateReason::PLAYER_STATE_CHANGED);
    publication.client_side_timestamp = publication_server_timestamp_milliseconds;
    publication.is_active = true;
    publication.started_playing_at = snapshot.active_since_server_timestamp_milliseconds;
    publication.has_been_playing_for_ms = Default::default();
    publication.last_command_message_id = Default::default();
    publication.last_command_sent_by_device_id.clear();
    let mut player = PlayerState { timestamp: snapshot.sampled_server_timestamp_milliseconds as i64,
        session_id: snapshot.session_identifier.clone(), playback_id: snapshot.playback_identifier.clone(),
        queue_revision: snapshot.queue_revision.clone(), track: MessageField::some(provided_track(&snapshot.track)?),
        prev_tracks: snapshot.previous_tracks.iter().map(provided_track).collect::<Result<_, _>>()?,
        next_tracks: snapshot.next_tracks.iter().map(provided_track).collect::<Result<_, _>>()?,
        position_as_of_timestamp: snapshot.position_milliseconds as i64, duration: snapshot.duration_milliseconds as i64,
        is_playing: true, is_paused: matches!(snapshot.playback, ConnectPublicationPlayback::Paused | ConnectPublicationPlayback::PausedBuffering),
        is_buffering: matches!(snapshot.playback, ConnectPublicationPlayback::Buffering | ConnectPublicationPlayback::PausedBuffering),
        playback_speed: if matches!(snapshot.playback, ConnectPublicationPlayback::Paused | ConnectPublicationPlayback::PausedBuffering) { PAUSED_PLAYBACK_SPEED } else { NORMAL_PLAYBACK_SPEED }, options: registration.device.player_state.options.clone(),
        play_origin: registration.device.player_state.play_origin.clone(), suppressions: registration.device.player_state.suppressions.clone(),
        ..Default::default() };
    if let Some(command) = &snapshot.accepted_command {
        identifier(&command.sender_device_identifier)?;
        if let Some(identifier_value) = &command.session_command_identifier { identifier(identifier_value)?; }
        publication.last_command_message_id = command.message_identifier;
        publication.last_command_sent_by_device_id = command.sender_device_identifier.clone();
        player.session_command_id = command.session_command_identifier.clone().unwrap_or_default();
    }
    publication.device.mut_or_insert_default().player_state = MessageField::some(player);
    Ok(publication)
}

#[derive(Default)]
pub struct ConnectPublicationOrder { last_sequence: u64 }

impl ConnectPublicationOrder {
    pub fn acquire(&mut self, sequence: u64) -> Result<(), Failure> {
        if sequence <= self.last_sequence { return Err(Failure::Canceled); }
        self.last_sequence = sequence;
        Ok(())
    }
}

#[derive(Default)]
pub struct ConnectPublicationState {
    order: ConnectPublicationOrder,
    started: bool,
}

impl ConnectPublicationState {
    pub fn permits_observer_registration(&self) -> bool { !self.started }

    pub fn begin_dispatch(&mut self, sequence: u64) -> Result<(), Failure> {
        self.order.acquire(sequence)?;
        self.started = true;
        Ok(())
    }
}

pub fn publication_server_timestamp(snapshot: &ConnectPublicationSnapshot, native_monotonic_milliseconds: u64) -> Result<u64, Failure> {
    let elapsed_milliseconds = native_monotonic_milliseconds.checked_sub(snapshot.sampled_native_monotonic_milliseconds).ok_or(Failure::Canceled)?;
    if elapsed_milliseconds > MAXIMUM_PUBLICATION_SAMPLE_AGE_MILLISECONDS { return Err(Failure::Canceled); }
    snapshot.sampled_server_timestamp_milliseconds.checked_add(elapsed_milliseconds).ok_or(Failure::InvalidInput)
}
