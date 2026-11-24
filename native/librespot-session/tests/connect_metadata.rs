use librespot_core::SpotifyId;
use librespot_protocol::{extended_metadata::{BatchedEntityRequest, BatchedExtensionResponse, EntityExtensionDataArray},
    entity_extension_data::{EntityExtensionData, EntityExtensionDataHeader}, extension_kind::ExtensionKind, metadata::{Artist, Track, ExternalId}};
use protobuf::{well_known_types::any::Any, EnumOrUnknown, Message, MessageField};
use streaming_spotify_session::{connect_metadata::{decode_metadata_response, encode_metadata_request}, model::Failure};

const FIRST_TRACK: &str = "0000000000000000000001";
const SECOND_TRACK: &str = "0000000000000000000002";
const TRACK_URI_PREFIX: &str = "spotify:track:";
const TITLE: &str = "Synthetic track";
const ARTIST: &str = "Synthetic artist";
const DURATION_MILLISECONDS: i32 = 180000;
const SUCCESS_STATUS: i32 = 200;
const FIRST_POSITION: usize = 0;
const SECOND_POSITION: usize = 1;
const SINGLE_ENTRY: usize = 1;
const EXCESSIVE_TRACK_COUNT: usize = 21;
const EXCESSIVE_RESPONSE_BYTES: usize = 1048577;
const PADDING_BYTE: u8 = 0;
const INVALID_IDENTIFIER: &str = "not-a-track";
const WRONG_URI: &str = "spotify:track:0000000000000000000003";

fn identifiers() -> Vec<String> { vec![FIRST_TRACK.to_owned(), SECOND_TRACK.to_owned()] }
fn entry(identifier: &str) -> EntityExtensionData {
    let track = Track { gid: Some(SpotifyId::from_base62(identifier).unwrap().to_raw().to_vec()), name: Some(TITLE.to_owned()),
        duration: Some(DURATION_MILLISECONDS), artist: vec![Artist { name: Some(ARTIST.to_owned()), ..Default::default() }], ..Default::default() };
    EntityExtensionData { entity_uri: TRACK_URI_PREFIX.to_owned() + identifier,
        header: MessageField::some(EntityExtensionDataHeader { status_code: SUCCESS_STATUS, ..Default::default() }),
        extension_data: MessageField::some(Any { value: track.write_to_bytes().unwrap(), ..Default::default() }), ..Default::default() }
}
fn response(entries: Vec<EntityExtensionData>) -> BatchedExtensionResponse {
    BatchedExtensionResponse { extended_metadata: vec![EntityExtensionDataArray { extension_kind: EnumOrUnknown::new(ExtensionKind::TRACK_V4),
        extension_data: entries, ..Default::default() }], ..Default::default() }
}

#[test]
fn metadata_requests_bound_unique_identifiers_and_query_only_track_metadata() {
    let requested = identifiers();
    let request = BatchedEntityRequest::parse_from_bytes(&encode_metadata_request(&requested).unwrap()).unwrap();
    assert_eq!(request.entity_request.len(), requested.len());
    for (request, identifier) in request.entity_request.iter().zip(requested) {
        assert_eq!(request.entity_uri, TRACK_URI_PREFIX.to_owned() + &identifier);
        assert_eq!(request.query.len(), SINGLE_ENTRY);
        assert_eq!(request.query[FIRST_POSITION].extension_kind.enum_value().unwrap(), ExtensionKind::TRACK_V4);
    }
    for requested in [vec![], vec![INVALID_IDENTIFIER.to_owned()], vec![FIRST_TRACK.to_owned(), FIRST_TRACK.to_owned()], vec![FIRST_TRACK.to_owned(); EXCESSIVE_TRACK_COUNT]] {
        assert!(matches!(encode_metadata_request(&requested), Err(Failure::InvalidInput)));
    }
}

#[test]
fn metadata_projection_matches_each_requested_uri_and_identifier_independent_of_response_order() {
    let response = response(vec![entry(SECOND_TRACK), entry(FIRST_TRACK)]).write_to_bytes().unwrap();
    let result = decode_metadata_response(&identifiers(), &response).unwrap();
    assert_eq!(result[FIRST_POSITION].spotify_track_identifier, FIRST_TRACK);
    assert_eq!(result[SECOND_POSITION].spotify_track_identifier, SECOND_TRACK);
    assert_eq!(result[FIRST_POSITION].title, TITLE);
    assert_eq!(result[FIRST_POSITION].artist_names, vec![ARTIST]);
    assert_eq!(result[FIRST_POSITION].duration_milliseconds, DURATION_MILLISECONDS as u64);
}

#[test]
fn metadata_missing_duplicated_or_foreign_entities_cannot_replace_a_requested_track() {
    let mut foreign = entry(FIRST_TRACK); foreign.entity_uri = WRONG_URI.to_owned();
    for entries in [vec![entry(FIRST_TRACK)], vec![entry(FIRST_TRACK), entry(FIRST_TRACK)], vec![foreign, entry(SECOND_TRACK)]] {
        assert!(matches!(decode_metadata_response(&identifiers(), &response(entries).write_to_bytes().unwrap()), Err(Failure::InvalidResponse)));
    }
    let mut foreign_identity = entry(FIRST_TRACK);
    foreign_identity.extension_data.as_mut().unwrap().value = entry(SECOND_TRACK).extension_data.unwrap().value;
    assert!(matches!(decode_metadata_response(&identifiers(), &response(vec![foreign_identity, entry(SECOND_TRACK)]).write_to_bytes().unwrap()), Err(Failure::InvalidResponse)));
}

#[test]
fn malformed_and_oversized_metadata_payloads_fail_before_projecting_untrusted_track_data() {
    assert!(matches!(decode_metadata_response(&identifiers(), &[PADDING_BYTE]), Err(Failure::InvalidResponse)));
    assert!(matches!(decode_metadata_response(&identifiers(), &vec![PADDING_BYTE; EXCESSIVE_RESPONSE_BYTES]), Err(Failure::Backpressure)));
    let mut invalid = entry(FIRST_TRACK); invalid.extension_data = MessageField::none();
    assert!(matches!(decode_metadata_response(&identifiers(), &response(vec![invalid, entry(SECOND_TRACK)]).write_to_bytes().unwrap()), Err(Failure::InvalidResponse)));
}

const RECORDING_CODE_TYPE: &str = "isrc";
const RECORDING_CODE: &str = "TEST00000001";
const OTHER_CODE_TYPE: &str = "other-code";
const NOT_FOUND_STATUS: i32 = 404;

#[test]
fn recording_codes_project_only_explicit_isrc_values_from_the_bound_track() {
    let mut first = entry(FIRST_TRACK);
    let mut track = Track::parse_from_bytes(&first.extension_data.value).unwrap();
    track.external_id = vec![ExternalId { type_: Some(RECORDING_CODE_TYPE.to_owned()), id: Some(RECORDING_CODE.to_owned()), ..Default::default() },
        ExternalId { type_: Some(OTHER_CODE_TYPE.to_owned()), id: Some(RECORDING_CODE.to_owned()), ..Default::default() }];
    first.extension_data.as_mut().unwrap().value = track.write_to_bytes().unwrap();
    let metadata = decode_metadata_response(&identifiers(), &response(vec![first, entry(SECOND_TRACK)]).write_to_bytes().unwrap()).unwrap();
    assert_eq!(metadata[FIRST_POSITION].recording_codes, vec![RECORDING_CODE]);
}

#[test]
fn an_explicit_missing_metadata_entity_remains_not_found_instead_of_becoming_another_track() {
    let mut first = entry(FIRST_TRACK); first.header.as_mut().unwrap().status_code = NOT_FOUND_STATUS;
    assert!(matches!(decode_metadata_response(&identifiers(), &response(vec![first, entry(SECOND_TRACK)]).write_to_bytes().unwrap()), Err(Failure::NotFound)));
}
