#[path = "support/publication.rs"]
mod publication;

use librespot_protocol::connect::{PutStateReason, PutStateRequest};
use protobuf::Message;
use streaming_spotify_session::{connect_device::{initial_registration, ConnectDeviceConfiguration}, connect_publication::{build_publication,
    ConnectPublicationOrder, ConnectPublicationState, publication_server_timestamp, MAXIMUM_PUBLICATION_SAMPLE_AGE_MILLISECONDS, ConnectPublicationPlayback, ConnectPublicationCommand, MAXIMUM_PUBLICATION_QUEUE_TRACKS,
    MAXIMUM_PUBLICATION_CLOCK_UNCERTAINTY_MILLISECONDS}, model::Failure};
use publication::*;

const PUBLICATION_TIMESTAMP_MILLISECONDS: u64 = 1700000010100;
const NAME: &str = "Synthetic local player";
const TRACK_URI: &str = "spotify:track:4uLU6hMCjMI75M1A2tKUQC";
const FOREIGN_IDENTIFIER: &str = "synthetic-foreign-identity";
const INVALID_TRACK: &str = "invalid-track";
const COMMAND_MESSAGE_IDENTIFIER: u32 = 42;
const COMMAND_SENDER: &str = "synthetic-command-sender";
const COMMAND_SESSION: &str = "synthetic-command-session";
const EXCEEDS_LIMIT: usize = 1;
const EXCEEDS_CLOCK_LIMIT: u64 = 1;
const PAUSED_PLAYBACK_SPEED: f64 = 0.0;
const NORMAL_PLAYBACK_SPEED: f64 = 1.0;

fn registration() -> PutStateRequest {
    initial_registration(&ConnectDeviceConfiguration { name: NAME.to_owned(), playback_ready: true }, DEVICE, SESSION, SERVER_TIMESTAMP_MILLISECONDS).unwrap()
}

#[test]
fn actual_player_state_round_trips_with_real_track_identity_occurrences_revision_and_clock_anchor() {
    let serialized = build_publication(&registration(), &snapshot(), PUBLICATION_TIMESTAMP_MILLISECONDS).unwrap().write_to_bytes().unwrap();
    let decoded = PutStateRequest::parse_from_bytes(&serialized).unwrap();
    assert_eq!(decoded.put_state_reason.enum_value().unwrap(), PutStateReason::PLAYER_STATE_CHANGED);
    assert!(decoded.is_active);
    assert_eq!(decoded.client_side_timestamp, PUBLICATION_TIMESTAMP_MILLISECONDS);
    assert_eq!(decoded.started_playing_at, ACTIVE_SINCE_MILLISECONDS);
    let player = &decoded.device.player_state;
    assert_eq!(player.timestamp, SERVER_TIMESTAMP_MILLISECONDS as i64);
    assert_eq!(player.position_as_of_timestamp, POSITION_MILLISECONDS as i64);
    assert_eq!(player.duration, DURATION_MILLISECONDS as i64);
    assert_eq!(player.session_id, SESSION); assert_eq!(player.playback_id, PLAYBACK); assert_eq!(player.queue_revision, REVISION);
    assert_eq!(player.track.uri, TRACK_URI); assert_eq!(player.track.uid, OCCURRENCE);
    assert_eq!(player.next_tracks.first().unwrap().uri, TRACK_URI); assert_eq!(player.next_tracks.first().unwrap().uid, NEXT_OCCURRENCE);
}

#[test]
fn paused_and_buffering_samples_never_claim_uninterrupted_playback() {
    for playback in [ConnectPublicationPlayback::Playing, ConnectPublicationPlayback::Paused, ConnectPublicationPlayback::Buffering, ConnectPublicationPlayback::PausedBuffering] {
        let mut sample = snapshot(); sample.playback = playback;
        let publication = build_publication(&registration(), &sample, PUBLICATION_TIMESTAMP_MILLISECONDS).unwrap();
        assert!(publication.device.player_state.is_playing);
        assert_eq!(publication.device.player_state.is_paused, matches!(playback, ConnectPublicationPlayback::Paused | ConnectPublicationPlayback::PausedBuffering));
        assert_eq!(publication.device.player_state.is_buffering, matches!(playback, ConnectPublicationPlayback::Buffering | ConnectPublicationPlayback::PausedBuffering));
        assert_eq!(publication.device.player_state.playback_speed,
            if matches!(playback, ConnectPublicationPlayback::Paused | ConnectPublicationPlayback::PausedBuffering) { PAUSED_PLAYBACK_SPEED } else { NORMAL_PLAYBACK_SPEED });
        assert_eq!(publication.device.player_state.position_as_of_timestamp, POSITION_MILLISECONDS as i64);
    }
}

#[test]
fn publication_preserves_only_accepted_incoming_command_provenance_and_clears_old_provenance() {
    let mut sample = snapshot(); sample.accepted_command = Some(ConnectPublicationCommand { message_identifier: COMMAND_MESSAGE_IDENTIFIER,
        sender_device_identifier: COMMAND_SENDER.to_owned(), session_command_identifier: COMMAND_SESSION.to_owned() });
    let acknowledged = build_publication(&registration(), &sample, PUBLICATION_TIMESTAMP_MILLISECONDS).unwrap();
    assert_eq!(acknowledged.last_command_message_id, COMMAND_MESSAGE_IDENTIFIER);
    assert_eq!(acknowledged.last_command_sent_by_device_id, COMMAND_SENDER);
    assert_eq!(acknowledged.device.player_state.session_command_id, COMMAND_SESSION);
    let cleared = build_publication(&acknowledged, &snapshot(), PUBLICATION_TIMESTAMP_MILLISECONDS).unwrap();
    assert!(cleared.last_command_sent_by_device_id.is_empty()); assert!(cleared.device.player_state.session_command_id.is_empty());
}

#[test]
fn observers_and_foreign_device_or_session_samples_cannot_be_published() {
    let mut observer = registration(); observer.device.mut_or_insert_default().device_info.mut_or_insert_default().can_play = false;
    assert!(matches!(build_publication(&observer, &snapshot(), PUBLICATION_TIMESTAMP_MILLISECONDS), Err(Failure::InvalidInput)));
    let mut foreign_device = snapshot(); foreign_device.device_identifier = FOREIGN_IDENTIFIER.to_owned();
    assert!(matches!(build_publication(&registration(), &foreign_device, PUBLICATION_TIMESTAMP_MILLISECONDS), Err(Failure::InvalidInput)));
    let mut foreign_session = snapshot(); foreign_session.session_identifier = FOREIGN_IDENTIFIER.to_owned();
    assert!(matches!(build_publication(&registration(), &foreign_session, PUBLICATION_TIMESTAMP_MILLISECONDS), Err(Failure::InvalidInput)));
}

#[test]
fn malformed_tracks_duplicate_occurrences_and_oversized_queues_are_rejected() {
    let mut malformed = snapshot(); malformed.track.spotify_track_identifier = INVALID_TRACK.to_owned();
    assert!(matches!(build_publication(&registration(), &malformed, PUBLICATION_TIMESTAMP_MILLISECONDS), Err(Failure::InvalidInput)));
    let mut duplicate = snapshot(); duplicate.next_tracks = vec![duplicate.track.clone()];
    assert!(matches!(build_publication(&registration(), &duplicate, PUBLICATION_TIMESTAMP_MILLISECONDS), Err(Failure::InvalidInput)));
    let mut oversized = snapshot(); oversized.next_tracks = vec![oversized.track.clone(); MAXIMUM_PUBLICATION_QUEUE_TRACKS + EXCEEDS_LIMIT];
    assert!(matches!(build_publication(&registration(), &oversized, PUBLICATION_TIMESTAMP_MILLISECONDS), Err(Failure::InvalidInput)));
}

#[test]
fn invalid_time_or_position_and_uncertain_clock_samples_are_rejected() {
    let mut position = snapshot(); position.position_milliseconds = DURATION_MILLISECONDS + EXCEEDS_CLOCK_LIMIT;
    assert!(matches!(build_publication(&registration(), &position, PUBLICATION_TIMESTAMP_MILLISECONDS), Err(Failure::InvalidInput)));
    assert!(matches!(build_publication(&registration(), &snapshot(), ACTIVE_SINCE_MILLISECONDS), Err(Failure::InvalidInput)));
    let mut clock = snapshot(); clock.clock_uncertainty_milliseconds = MAXIMUM_PUBLICATION_CLOCK_UNCERTAINTY_MILLISECONDS + EXCEEDS_CLOCK_LIMIT;
    assert!(matches!(build_publication(&registration(), &clock, PUBLICATION_TIMESTAMP_MILLISECONDS), Err(Failure::InvalidInput)));
}

#[test]
fn unimplemented_controls_are_never_advertised_by_state_publication() {
    let published = build_publication(&registration(), &snapshot(), PUBLICATION_TIMESTAMP_MILLISECONDS).unwrap();
    let capabilities = &published.device.device_info.capabilities;
    assert!(!capabilities.supports_transfer_command); assert!(!capabilities.supports_set_options_command);
    assert!(!capabilities.supports_playlist_v2); assert!(!capabilities.supports_command_request); assert!(!capabilities.is_controllable);
}

#[test]
fn local_sequences_fence_duplicate_and_old_publications_without_becoming_remote_revisions() {
    let mut order = ConnectPublicationOrder::default();
    order.acquire(SECOND_SEQUENCE).unwrap();
    assert_eq!(order.acquire(FIRST_SEQUENCE), Err(Failure::Canceled));
    assert_eq!(order.acquire(SECOND_SEQUENCE), Err(Failure::Canceled));
}

#[test]
fn observer_registration_cannot_reset_state_after_a_publication_with_unknown_outcome() {
    let mut state = ConnectPublicationState::default();
    assert!(state.permits_observer_registration());
    state.begin_dispatch(FIRST_SEQUENCE).unwrap();
    assert!(!state.permits_observer_registration());
    assert_eq!(state.begin_dispatch(FIRST_SEQUENCE), Err(Failure::Canceled));
    assert!(!state.permits_observer_registration());
}

#[test]
fn publication_clock_uses_only_elapsed_native_time_from_a_known_server_anchor() {
    let mut sample = snapshot(); sample.sampled_native_monotonic_milliseconds = POSITION_MILLISECONDS;
    assert_eq!(publication_server_timestamp(&sample, POSITION_MILLISECONDS).unwrap(), SERVER_TIMESTAMP_MILLISECONDS);
    assert!(matches!(publication_server_timestamp(&sample, NATIVE_TIMESTAMP_MILLISECONDS), Err(Failure::Canceled)));
    assert!(matches!(publication_server_timestamp(&sample, POSITION_MILLISECONDS + MAXIMUM_PUBLICATION_SAMPLE_AGE_MILLISECONDS + EXCEEDS_CLOCK_LIMIT), Err(Failure::Canceled)));
}

#[test]
fn paused_ready_samples_preserve_paused_without_inventing_buffering() {
    let mut paused = snapshot(); paused.playback = ConnectPublicationPlayback::Paused;
    let published = build_publication(&registration(), &paused, PUBLICATION_TIMESTAMP_MILLISECONDS).unwrap();
    assert!(published.device.player_state.is_paused);
    assert!(!published.device.player_state.is_buffering);
    let mut buffering = snapshot(); buffering.playback = ConnectPublicationPlayback::Buffering;
    let published = build_publication(&registration(), &buffering, PUBLICATION_TIMESTAMP_MILLISECONDS).unwrap();
    assert!(!published.device.player_state.is_paused);
    assert!(published.device.player_state.is_buffering);
}
