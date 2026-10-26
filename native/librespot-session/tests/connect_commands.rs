use librespot_protocol::{connect::Cluster, player::{PlayerState, ProvidedTrack}};
use protobuf::MessageField;
use streaming_spotify_session::{connect_commands::ConnectCommand, connect_wire::{normalize_cluster, ConnectCluster}, model::Failure};

const HOST: &str = "synthetic-host-device";
const OTHER_HOST: &str = "replacement-host-device";
const REQUEST: &str = "synthetic-command-request";
const TRACK: &str = "aaaaaaaaaaaaaaaaaaaaaa";
const OTHER_TRACK: &str = "bbbbbbbbbbbbbbbbbbbbbb";
const TRACK_URI: &str = "spotify:track:aaaaaaaaaaaaaaaaaaaaaa";
const OCCURRENCE: &str = "synthetic-queue-occurrence";
const DURATION_MILLISECONDS: i64 = 180000;
const POSITION_MILLISECONDS: u64 = 12345;
const UNSAFE_POSITION_MILLISECONDS: u64 = 9007199254740992;
const RESTRICTION: &str = "synthetic-restriction";
const EMPTY_TEXT: &str = "";
const CONTROL_TEXT: &str = "invalid\nvalue";
const INVALID_TRACK: &str = "not-a-spotify-track";
const OVERSIZED_OCCURRENCE_CHARACTERS: usize = 129;
const COMMAND_FIELD: &str = "command";
const ENDPOINT_FIELD: &str = "endpoint";
const LOGGING_FIELD: &str = "logging_params";
const IDENTIFIER_FIELD: &str = "command_id";
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

fn cluster() -> ConnectCluster {
    normalize_cluster(Cluster { active_device_id: HOST.to_owned(), player_state: MessageField::some(PlayerState {
        duration: DURATION_MILLISECONDS, track: MessageField::some(ProvidedTrack { uri: TRACK_URI.to_owned(), ..Default::default() }),
        ..Default::default() }), ..Default::default() }).unwrap()
}
fn seek() -> ConnectCommand { ConnectCommand::Seek { position_milliseconds: POSITION_MILLISECONDS, expected_spotify_track_identifier: TRACK.to_owned() } }
fn queue() -> ConnectCommand { ConnectCommand::AddToQueue { spotify_track_identifier: TRACK.to_owned(), occurrence_identifier: OCCURRENCE.to_owned() } }

#[test]
fn playback_intents_use_the_private_connect_endpoints_and_exact_command_identity() {
    for (command, endpoint) in [(ConnectCommand::Play {}, RESUME_ENDPOINT), (ConnectCommand::Pause {}, PAUSE_ENDPOINT),
        (ConnectCommand::Next {}, NEXT_ENDPOINT), (ConnectCommand::Previous {}, PREVIOUS_ENDPOINT)] {
        let body = command.prepare(REQUEST, HOST, &cluster()).unwrap();
        assert_eq!(body[COMMAND_FIELD][ENDPOINT_FIELD], endpoint);
        assert_eq!(body[COMMAND_FIELD][LOGGING_FIELD][IDENTIFIER_FIELD], REQUEST);
        assert!(body[COMMAND_FIELD].get(VALUE_FIELD).is_none());
    }
}

#[test]
fn seek_preserves_milliseconds_and_requires_the_exact_current_track_and_duration_bound() {
    let body = seek().prepare(REQUEST, HOST, &cluster()).unwrap();
    assert_eq!(body[COMMAND_FIELD][ENDPOINT_FIELD], SEEK_ENDPOINT);
    assert_eq!(body[COMMAND_FIELD][VALUE_FIELD], POSITION_MILLISECONDS);
    let changed = ConnectCommand::Seek { position_milliseconds: POSITION_MILLISECONDS, expected_spotify_track_identifier: OTHER_TRACK.to_owned() };
    assert!(matches!(changed.prepare(REQUEST, HOST, &cluster()), Err(Failure::Superseded)));
    let outside = ConnectCommand::Seek { position_milliseconds: DURATION_MILLISECONDS as u64, expected_spotify_track_identifier: TRACK.to_owned() };
    assert!(matches!(outside.prepare(REQUEST, HOST, &cluster()), Err(Failure::InvalidInput)));
}

#[test]
fn queue_append_preserves_its_supplied_occurrence_and_spotify_track_uri() {
    let body = queue().prepare(REQUEST, HOST, &cluster()).unwrap();
    assert_eq!(body[COMMAND_FIELD][ENDPOINT_FIELD], QUEUE_ENDPOINT);
    assert_eq!(body[COMMAND_FIELD][TRACK_FIELD][URI_FIELD], TRACK_URI);
    assert_eq!(body[COMMAND_FIELD][TRACK_FIELD][OCCURRENCE_FIELD], OCCURRENCE);
}

#[test]
fn missing_and_replaced_active_hosts_never_prepare_a_mutation() {
    let mut missing = cluster(); missing.active_device_identifier.clear();
    assert!(matches!((ConnectCommand::Pause {}).prepare(REQUEST, HOST, &missing), Err(Failure::Unsupported)));
    assert!(matches!((ConnectCommand::Pause {}).prepare(REQUEST, OTHER_HOST, &cluster()), Err(Failure::Superseded)));
    let mut absent = cluster(); absent.playback = None;
    assert!(matches!(queue().prepare(REQUEST, HOST, &absent), Err(Failure::Unsupported)));
}

#[test]
fn remote_control_and_each_action_specific_restriction_block_their_mutations() {
    let mut remote = cluster(); remote.playback.as_mut().unwrap().disallow_remote_control_reasons.push(RESTRICTION.to_owned());
    for command in [ConnectCommand::Play {}, ConnectCommand::Pause {}, ConnectCommand::Next {}, ConnectCommand::Previous {}, seek(), queue()] {
        assert!(matches!(command.prepare(REQUEST, HOST, &remote), Err(Failure::Forbidden)));
        let mut restricted = cluster(); let playback = restricted.playback.as_mut().unwrap();
        let reasons = match &command {
            ConnectCommand::Play {} => &mut playback.disallow_resuming_reasons,
            ConnectCommand::Pause {} => &mut playback.disallow_pausing_reasons,
            ConnectCommand::Next {} => &mut playback.disallow_next_reasons,
            ConnectCommand::Previous {} => &mut playback.disallow_previous_reasons,
            ConnectCommand::Seek { .. } => &mut playback.disallow_seeking_reasons,
            ConnectCommand::AddToQueue { .. } => &mut playback.disallow_queue_reasons,
        };
        reasons.push(RESTRICTION.to_owned());
        assert!(matches!(command.prepare(REQUEST, HOST, &restricted), Err(Failure::Forbidden)));
    }
}

#[test]
fn invalid_request_target_track_occurrence_and_unsafe_position_fail_before_preflight() {
    for identifier in [EMPTY_TEXT, CONTROL_TEXT] {
        assert!((ConnectCommand::Pause {}).validate(identifier, HOST).is_err());
        assert!((ConnectCommand::Pause {}).validate(REQUEST, identifier).is_err());
    }
    let excessive = OCCURRENCE.repeat(OVERSIZED_OCCURRENCE_CHARACTERS);
    for occurrence in [EMPTY_TEXT, CONTROL_TEXT, &excessive] {
        assert!(ConnectCommand::AddToQueue { spotify_track_identifier: TRACK.to_owned(), occurrence_identifier: occurrence.to_owned() }.validate(REQUEST, HOST).is_err());
    }
    assert!(ConnectCommand::AddToQueue { spotify_track_identifier: INVALID_TRACK.to_owned(), occurrence_identifier: OCCURRENCE.to_owned() }.validate(REQUEST, HOST).is_err());
    assert!(ConnectCommand::Seek { position_milliseconds: UNSAFE_POSITION_MILLISECONDS, expected_spotify_track_identifier: TRACK.to_owned() }.validate(REQUEST, HOST).is_err());
}
