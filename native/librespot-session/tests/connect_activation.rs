#[path = "support/publication.rs"]
mod publication;

use librespot_protocol::connect::{PutStateReason, PutStateRequest};
use streaming_spotify_session::{connect_activation::{build_explicit_activation, ConnectActivationDispatchGuard, ConnectActivationPlayerReadiness, ConnectExplicitActivation},
    connect_device::{initial_registration, ConnectDeviceConfiguration}, connect_wire::ConnectCluster, model::Failure};

const NAME: &str = "Synthetic host player";
const ACTIVATION_REQUEST: &str = "synthetic-explicit-user-activation";
const PREVIOUS_HOST: &str = "synthetic-previous-host";
const FOREIGN_HOST: &str = "synthetic-foreign-host";
const GENERATION: u64 = 7;
const STALE_GENERATION: u64 = 6;
const OBSERVATION_START_MILLISECONDS: u64 = 100;
const OBSERVATION_END_MILLISECONDS: u64 = 120;
const PLAYER_SAMPLE_MILLISECONDS: u64 = 125;
const CURRENT_MILLISECONDS: u64 = 130;
const OLD_SERVER_TIMESTAMP_MILLISECONDS: i64 = 1700000000000;
const OBSERVATION_SERVER_TIMESTAMP_MILLISECONDS: i64 = 1700000009990;

fn activation() -> ConnectExplicitActivation {
    ConnectExplicitActivation { request_identifier: ACTIVATION_REQUEST.to_owned(), generation: GENERATION,
        expected_previous_host_device_identifier: PREVIOUS_HOST.to_owned(), observation_started_native_monotonic_milliseconds: OBSERVATION_START_MILLISECONDS,
        observation_completed_native_monotonic_milliseconds: OBSERVATION_END_MILLISECONDS, requested_native_monotonic_milliseconds: publication::NATIVE_TIMESTAMP_MILLISECONDS }
}
fn registration() -> PutStateRequest {
    initial_registration(&ConnectDeviceConfiguration { name: NAME.to_owned(), playback_ready: true }, publication::DEVICE, publication::SESSION, publication::SERVER_TIMESTAMP_MILLISECONDS).unwrap()
}
fn cluster() -> ConnectCluster {
    ConnectCluster { changed_at_milliseconds: OLD_SERVER_TIMESTAMP_MILLISECONDS, server_at_milliseconds: OBSERVATION_SERVER_TIMESTAMP_MILLISECONDS,
        active_device_identifier: PREVIOUS_HOST.to_owned(), playback: None, devices: Vec::new(), acknowledgement_identifier: None, update_reason: None, devices_changed: Vec::new() }
}
fn readiness() -> ConnectActivationPlayerReadiness { ConnectActivationPlayerReadiness { playback_output_ready: true, external_authority_absent: true, command_handling_ready: true } }
fn snapshot() -> streaming_spotify_session::connect_publication::ConnectPublicationSnapshot {
    let mut snapshot = publication::snapshot(); snapshot.sampled_native_monotonic_milliseconds = PLAYER_SAMPLE_MILLISECONDS; snapshot.sequence = publication::SECOND_SEQUENCE; snapshot.command_handling_ready = true; snapshot
}

#[test]
fn explicit_activation_preserves_real_player_state_and_supplies_active_player_state_reason() {
    let request = build_explicit_activation(&registration(), &snapshot(), &activation(), &readiness(), &cluster(), GENERATION, CURRENT_MILLISECONDS).unwrap();
    assert!(request.is_active); assert_eq!(request.put_state_reason.enum_value().unwrap(), PutStateReason::PLAYER_STATE_CHANGED);
    assert_eq!(request.device.player_state.track.uid, publication::OCCURRENCE);
    assert_eq!(request.device.player_state.queue_revision, publication::REVISION);
    assert_eq!(request.device.player_state.session_id, publication::SESSION);
}

#[test]
fn changed_previous_host_and_stale_generations_cannot_activate() {
    let mut changed = cluster(); changed.active_device_identifier = FOREIGN_HOST.to_owned();
    assert!(matches!(build_explicit_activation(&registration(), &snapshot(), &activation(), &readiness(), &changed, GENERATION, CURRENT_MILLISECONDS), Err(Failure::Canceled)));
    assert!(matches!(build_explicit_activation(&registration(), &snapshot(), &activation(), &readiness(), &cluster(), STALE_GENERATION, CURRENT_MILLISECONDS), Err(Failure::Canceled)));
}

#[test]
fn output_readiness_and_absent_follower_authority_are_required() {
    for readiness in [ConnectActivationPlayerReadiness { playback_output_ready: false, external_authority_absent: true, command_handling_ready: true },
        ConnectActivationPlayerReadiness { playback_output_ready: true, external_authority_absent: false, command_handling_ready: true }] {
        assert!(matches!(build_explicit_activation(&registration(), &snapshot(), &activation(), &readiness, &cluster(), GENERATION, CURRENT_MILLISECONDS), Err(Failure::Unsupported)));
    }
}

#[test]
fn observation_and_player_sample_must_follow_the_explicit_user_request() {
    let mut late_request = activation(); late_request.requested_native_monotonic_milliseconds = CURRENT_MILLISECONDS;
    assert!(matches!(build_explicit_activation(&registration(), &snapshot(), &late_request, &readiness(), &cluster(), GENERATION, CURRENT_MILLISECONDS), Err(Failure::Canceled)));
    let mut old_sample = snapshot(); old_sample.sampled_native_monotonic_milliseconds = OBSERVATION_START_MILLISECONDS;
    assert!(matches!(build_explicit_activation(&registration(), &old_sample, &activation(), &readiness(), &cluster(), GENERATION, CURRENT_MILLISECONDS), Err(Failure::Canceled)));
}

#[test]
fn activation_dispatch_is_one_shot_even_when_the_result_is_uncertain() {
    let mut guard = ConnectActivationDispatchGuard::default();
    assert_eq!(guard.acquire(true), Err(Failure::Canceled)); guard.acquire(false).unwrap();
    assert_eq!(guard.acquire(false), Err(Failure::UnknownOutcome));
}

#[test]
fn cached_server_timestamps_do_not_pass_a_fresh_native_observation_bracket() {
    let mut cached = cluster(); cached.server_at_milliseconds = OLD_SERVER_TIMESTAMP_MILLISECONDS;
    assert!(matches!(build_explicit_activation(&registration(), &snapshot(), &activation(), &readiness(), &cached, GENERATION, CURRENT_MILLISECONDS), Err(Failure::Canceled)));
}

#[test]
fn only_a_known_deactivation_boundary_allows_a_new_explicit_activation_dispatch() {
    let mut guard = ConnectActivationDispatchGuard::default(); guard.acquire(false).unwrap();
    assert_eq!(guard.acquire(false), Err(Failure::UnknownOutcome));
    guard.complete_deactivation(); guard.acquire(false).unwrap();
    assert_eq!(guard.acquire(false), Err(Failure::UnknownOutcome));
}

#[test]
fn missing_incoming_handler_readiness_cannot_activate_an_audible_device() {
    let mut missing_handler = readiness(); missing_handler.command_handling_ready = false;
    assert!(matches!(build_explicit_activation(&registration(), &snapshot(), &activation(), &missing_handler, &cluster(), GENERATION, CURRENT_MILLISECONDS), Err(Failure::Unsupported)));
    let mut unready_snapshot = snapshot(); unready_snapshot.command_handling_ready = false;
    assert!(matches!(build_explicit_activation(&registration(), &unready_snapshot, &activation(), &readiness(), &cluster(), GENERATION, CURRENT_MILLISECONDS), Err(Failure::Unsupported)));
}
