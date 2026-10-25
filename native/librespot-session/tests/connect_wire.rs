use std::{collections::HashMap, io::Write};

use base64::{Engine, engine::general_purpose::STANDARD};
use flate2::{write::GzEncoder, Compression};
use librespot_protocol::{connect::{Cluster, ClusterUpdate}, player::{PlayerState, ProvidedTrack}};
use protobuf::{Message, MessageField};
use serde_json::{json, Value};
use streaming_spotify_session::{connect_wire::{decode_cluster_snapshot, decode_dealer_input, DealerInput,
    CLUSTER_TOPIC, COMMAND_TOPIC, CONNECTION_HEADER, CONNECTION_TOPIC, MAXIMUM_FRAME_BYTES, MEMBERSHIP_TOPIC}, model::Failure};

const TYPE_FIELD: &str = "type";
const MESSAGE_TYPE: &str = "message";
const REQUEST_TYPE: &str = "request";
const PONG_TYPE: &str = "pong";
const URI_FIELD: &str = "uri";
const HEADERS_FIELD: &str = "headers";
const PAYLOADS_FIELD: &str = "payloads";
const PAYLOAD_FIELD: &str = "payload";
const COMPRESSED_FIELD: &str = "compressed";
const MESSAGE_IDENTIFIER_FIELD: &str = "message_ident";
const KEY_FIELD: &str = "key";
const MESSAGE_ID_FIELD: &str = "message_id";
const SOURCE_DEVICE_FIELD: &str = "sent_by_device_id";
const COMMAND_FIELD: &str = "command";
const ENDPOINT_FIELD: &str = "endpoint";
const TRANSFER_ENCODING_HEADER: &str = "transfer-encoding";
const GZIP_ENCODING: &str = "gzip";
const CONNECTION: &str = "synthetic-connection";
const SOURCE: &str = "synthetic-source-device";
const HOST: &str = "synthetic-host-device";
const REQUEST_KEY: &str = "synthetic-request-key";
const PAUSE_ENDPOINT: &str = "pause";
const SESSION_FIELD: &str = "session";
const SESSION_ID_FIELD: &str = "session_id";
const SESSION: &str = "synthetic-session";
const QUEUE_REVISION: &str = "synthetic-queue-revision";
const ACKNOWLEDGEMENT: &str = "synthetic-command-acknowledgement";
const UPDATE_REASON: i32 = 3;
const TRACK_URI: &str = "spotify:track:aaaaaaaaaaaaaaaaaaaaaa";
const FIRST_OCCURRENCE: &str = "first-occurrence";
const SECOND_OCCURRENCE: &str = "second-occurrence";
const UNKNOWN_TOPIC: &str = "hm://synthetic-unhandled-topic";
const INVALID_FRAME: &[u8] = b"synthetic-invalid-json";
const INVALID_BASE64: &str = "not/base64%%%";
const CONTROL_IDENTIFIER: &str = "invalid\nconnection";
const OVERSIZED_PAYLOAD_BYTES: usize = 1048577;
const FRAME_BOUNDARY_INCREMENT: usize = 1;
const PAYLOAD_FILL_BYTE: u8 = 0;
const FIRST_POSITION: usize = 0;
const NEXT_POSITION: usize = 1;
const MESSAGE_IDENTIFIER: u32 = 7;
const CHANGED_MILLISECONDS: i64 = 1700000000000;
const SERVER_MILLISECONDS: i64 = 1700000000050;
const ANCHOR_POSITION_MILLISECONDS: i64 = 12345;
const DURATION_MILLISECONDS: i64 = 180000;
const NORMAL_SPEED: f64 = 1.0;
const MAXIMUM_QUEUE_LENGTH_EXCEEDED: usize = 2001;

fn encoded(value: Value) -> Vec<u8> { serde_json::to_vec(&value).unwrap() }
fn message(topic: &str, payload: Value) -> Value {
    json!({ (TYPE_FIELD): MESSAGE_TYPE, (URI_FIELD): topic, (PAYLOADS_FIELD): [payload] })
}
fn compressed(bytes: &[u8]) -> String {
    let mut writer = GzEncoder::new(Vec::new(), Compression::default()); writer.write_all(bytes).unwrap();
    STANDARD.encode(writer.finish().unwrap())
}
fn player() -> PlayerState {
    PlayerState { timestamp: CHANGED_MILLISECONDS, position_as_of_timestamp: ANCHOR_POSITION_MILLISECONDS,
        duration: DURATION_MILLISECONDS, playback_speed: NORMAL_SPEED, is_playing: true,
        queue_revision: QUEUE_REVISION.to_owned(), track: MessageField::some(ProvidedTrack { uri: TRACK_URI.to_owned(), ..Default::default() }),
        next_tracks: vec![ProvidedTrack { uri: TRACK_URI.to_owned(), uid: FIRST_OCCURRENCE.to_owned(), ..Default::default() },
            ProvidedTrack { uri: TRACK_URI.to_owned(), uid: SECOND_OCCURRENCE.to_owned(), ..Default::default() }], ..Default::default() }
}
fn cluster() -> Cluster {
    Cluster { active_device_id: HOST.to_owned(), changed_timestamp_ms: CHANGED_MILLISECONDS, server_timestamp_ms: SERVER_MILLISECONDS,
        player_state: MessageField::some(player()), ..Default::default() }
}
fn request() -> Value {
    json!({ (MESSAGE_ID_FIELD): MESSAGE_IDENTIFIER, (SOURCE_DEVICE_FIELD): SOURCE,
        (COMMAND_FIELD): { (ENDPOINT_FIELD): PAUSE_ENDPOINT } })
}
fn request_frame(topic: &str, body: Value) -> Value {
    json!({ (TYPE_FIELD): REQUEST_TYPE, (MESSAGE_IDENTIFIER_FIELD): topic, (KEY_FIELD): REQUEST_KEY,
        (HEADERS_FIELD): { (TRANSFER_ENCODING_HEADER): GZIP_ENCODING },
        (PAYLOAD_FIELD): { (COMPRESSED_FIELD): compressed(&encoded(body)) } })
}

#[test]
fn dealer_connection_reads_the_header_without_requiring_an_information_payload() {
    let frame = json!({ (TYPE_FIELD): MESSAGE_TYPE, (URI_FIELD): CONNECTION_TOPIC,
        (HEADERS_FIELD): { (CONNECTION_HEADER): CONNECTION } });
    assert!(matches!(decode_dealer_input(&encoded(frame)), Ok(DealerInput::Connection(identifier)) if identifier == CONNECTION));
}

#[test]
fn missing_or_control_bearing_connection_identifiers_are_rejected() {
    for headers in [HashMap::new(), HashMap::from([(CONNECTION_HEADER, CONTROL_IDENTIFIER)])] {
        let frame = json!({ (TYPE_FIELD): MESSAGE_TYPE, (URI_FIELD): CONNECTION_TOPIC, (HEADERS_FIELD): headers });
        assert!(matches!(decode_dealer_input(&encoded(frame)), Err(Failure::InvalidResponse)));
    }
}

#[test]
fn protobuf_cluster_updates_preserve_actual_clock_values_queue_revision_and_distinct_occurrences() {
    let update = ClusterUpdate { cluster: MessageField::some(cluster()), ack_id: ACKNOWLEDGEMENT.to_owned(),
        update_reason: protobuf::EnumOrUnknown::from_i32(UPDATE_REASON), devices_that_changed: vec![HOST.to_owned()], ..Default::default() };
    let frame = message(CLUSTER_TOPIC, Value::String(STANDARD.encode(update.write_to_bytes().unwrap())));
    let DealerInput::Cluster(cluster) = decode_dealer_input(&encoded(frame)).unwrap() else { panic!() };
    assert_eq!(cluster.changed_at_milliseconds, CHANGED_MILLISECONDS); assert_eq!(cluster.server_at_milliseconds, SERVER_MILLISECONDS);
    assert_eq!(cluster.acknowledgement_identifier.as_deref(), Some(ACKNOWLEDGEMENT));
    assert_eq!(cluster.update_reason, Some(UPDATE_REASON));
    assert_eq!(cluster.devices_changed, vec![HOST]);
    let playback = cluster.playback.unwrap(); assert_eq!(playback.timestamp_milliseconds, CHANGED_MILLISECONDS);
    assert_eq!(playback.position_as_of_timestamp_milliseconds, ANCHOR_POSITION_MILLISECONDS);
    assert_eq!(playback.queue_revision, QUEUE_REVISION);
    assert_eq!(playback.next_tracks[FIRST_POSITION].occurrence_identifier.as_deref(), Some(FIRST_OCCURRENCE));
    assert_eq!(playback.next_tracks[NEXT_POSITION].occurrence_identifier.as_deref(), Some(SECOND_OCCURRENCE));
    assert!(playback.track.unwrap().occurrence_identifier.is_none());
}

#[test]
fn initial_cluster_snapshot_keeps_inactive_and_absent_player_state_distinct() {
    let mut cluster = cluster(); cluster.player_state = MessageField::none(); cluster.active_device_id.clear();
    let normalized = decode_cluster_snapshot(&cluster.write_to_bytes().unwrap()).unwrap();
    assert!(normalized.playback.is_none()); assert!(normalized.active_device_identifier.is_empty());
}

#[test]
fn membership_accepts_json_objects_and_bounded_gzip_payloads_without_granting_permissions() {
    let update = json!({ (SESSION_FIELD): { (SESSION_ID_FIELD): SESSION } });
    let raw = message(MEMBERSHIP_TOPIC, update.clone());
    assert!(matches!(decode_dealer_input(&encoded(raw)), Ok(DealerInput::Membership(value)) if value == update));
    let mut gzip = message(MEMBERSHIP_TOPIC, Value::String(compressed(&encoded(update.clone()))));
    gzip[HEADERS_FIELD] = json!({ (TRANSFER_ENCODING_HEADER): GZIP_ENCODING });
    assert!(matches!(decode_dealer_input(&encoded(gzip)), Ok(DealerInput::Membership(value)) if value == update));
}

#[test]
fn compressed_requests_retain_the_reply_key_and_bound_command_identity() {
    let body = request();
    assert!(matches!(decode_dealer_input(&encoded(request_frame(COMMAND_TOPIC, body.clone()))),
        Ok(DealerInput::Command { key, request }) if key == REQUEST_KEY && request == body));
}

#[test]
fn unknown_request_topics_are_explicit_negative_acknowledgements_instead_of_executable_commands() {
    assert!(matches!(decode_dealer_input(&encoded(request_frame(UNKNOWN_TOPIC, request()))),
        Ok(DealerInput::RejectedCommand { key }) if key == REQUEST_KEY));
}

#[test]
fn malformed_frames_missing_command_identity_and_invalid_base64_never_become_commands() {
    assert!(matches!(decode_dealer_input(INVALID_FRAME), Err(Failure::InvalidResponse)));
    let missing = json!({ (COMMAND_FIELD): { (ENDPOINT_FIELD): PAUSE_ENDPOINT } });
    assert!(matches!(decode_dealer_input(&encoded(request_frame(COMMAND_TOPIC, missing))), Err(Failure::InvalidResponse)));
    let mut invalid = request_frame(COMMAND_TOPIC, request()); invalid[PAYLOAD_FIELD][COMPRESSED_FIELD] = Value::String(INVALID_BASE64.to_owned());
    assert!(matches!(decode_dealer_input(&encoded(invalid)), Err(Failure::InvalidResponse)));
}

#[test]
fn excessive_frames_and_gzip_expansion_are_bounded() {
    assert!(matches!(decode_dealer_input(&vec![PAYLOAD_FILL_BYTE; MAXIMUM_FRAME_BYTES + FRAME_BOUNDARY_INCREMENT]), Err(Failure::Backpressure)));
    let mut frame = message(MEMBERSHIP_TOPIC, Value::String(compressed(&vec![PAYLOAD_FILL_BYTE; OVERSIZED_PAYLOAD_BYTES])));
    frame[HEADERS_FIELD] = json!({ (TRANSFER_ENCODING_HEADER): GZIP_ENCODING });
    assert!(matches!(decode_dealer_input(&encoded(frame)), Err(Failure::Backpressure)));
}

#[test]
fn excessive_queue_lengths_are_rejected_before_publishing_a_snapshot() {
    let mut cluster = cluster(); cluster.player_state.mut_or_insert_default().next_tracks = vec![ProvidedTrack { uri: TRACK_URI.to_owned(), ..Default::default() }; MAXIMUM_QUEUE_LENGTH_EXCEEDED];
    assert!(matches!(decode_cluster_snapshot(&cluster.write_to_bytes().unwrap()), Err(Failure::InvalidResponse)));
}

#[test]
fn heartbeat_and_unknown_informational_topics_do_not_invent_state() {
    assert!(matches!(decode_dealer_input(&encoded(json!({ (TYPE_FIELD): PONG_TYPE }))), Ok(DealerInput::Pong)));
    assert!(matches!(decode_dealer_input(&encoded(message(UNKNOWN_TOPIC, Value::Null))), Ok(DealerInput::Unhandled)));
}
