use streaming_spotify_session::connect_publication::{ConnectPublicationSnapshot, ConnectPublicationTrack, ConnectPublicationPlayback};

pub const DEVICE: &str = "synthetic-publication-device";
pub const SESSION: &str = "synthetic-publication-session";
pub const PLAYBACK: &str = "synthetic-publication-playback";
pub const REVISION: &str = "synthetic-local-content-revision";
pub const TRACK: &str = "4uLU6hMCjMI75M1A2tKUQC";
pub const OCCURRENCE: &str = "synthetic-current-occurrence";
pub const NEXT_OCCURRENCE: &str = "synthetic-next-occurrence";
pub const FIRST_SEQUENCE: u64 = 1;
pub const SECOND_SEQUENCE: u64 = 2;
pub const POSITION_MILLISECONDS: u64 = 12500;
pub const DURATION_MILLISECONDS: u64 = 180000;
pub const SERVER_TIMESTAMP_MILLISECONDS: u64 = 1700000010000;
pub const ACTIVE_SINCE_MILLISECONDS: u64 = 1700000000000;
pub const NATIVE_TIMESTAMP_MILLISECONDS: u64 = 0;
pub const CLOCK_UNCERTAINTY_MILLISECONDS: u64 = 20;

pub fn snapshot() -> ConnectPublicationSnapshot {
    ConnectPublicationSnapshot { device_identifier: DEVICE.to_owned(), session_identifier: SESSION.to_owned(), sequence: FIRST_SEQUENCE,
        playback_identifier: PLAYBACK.to_owned(), queue_revision: REVISION.to_owned(),
        track: ConnectPublicationTrack { spotify_track_identifier: TRACK.to_owned(), occurrence_identifier: OCCURRENCE.to_owned() },
        previous_tracks: Vec::new(), next_tracks: vec![ConnectPublicationTrack { spotify_track_identifier: TRACK.to_owned(), occurrence_identifier: NEXT_OCCURRENCE.to_owned() }],
        position_milliseconds: POSITION_MILLISECONDS, duration_milliseconds: DURATION_MILLISECONDS,
        sampled_server_timestamp_milliseconds: SERVER_TIMESTAMP_MILLISECONDS, sampled_native_monotonic_milliseconds: NATIVE_TIMESTAMP_MILLISECONDS,
        clock_uncertainty_milliseconds: CLOCK_UNCERTAINTY_MILLISECONDS, active_since_server_timestamp_milliseconds: ACTIVE_SINCE_MILLISECONDS,
        playback: ConnectPublicationPlayback::Playing, accepted_command: None }
}
