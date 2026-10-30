use http::Method;
use serde_json::{json, Value};
use streaming_spotify_session::{connect_search::{ConnectSearchInput, decode_search_response, search_address, search_request}, model::Failure};

const TITLE: &str = "Synthetic \"mix\" \\ title";
const AUTHOR: &str = "Synthetic artist";
const MARKET: &str = "US";
const ACCOUNT_COUNTRY: &str = "RO";
const INVALID_MARKET: &str = "usa";
const LIMIT: usize = 2;
const EXCESSIVE_LIMIT: usize = 11;
const EMPTY_LIMIT: usize = 0;
const MAXIMUM_TEXT_CHARACTERS: usize = 2048;
const BOUNDARY_INCREMENT: usize = 1;
const PADDING_CHARACTER: char = 'x';
const CONTROL_TITLE: &str = "Synthetic\nprivate";
const BLANK_TEXT: &str = " ";
const EMPTY_TEXT: &str = "";
const FIRST_TRACK: &str = "0000000000000000000001";
const SECOND_TRACK: &str = "0000000000000000000002";
const THIRD_TRACK: &str = "0000000000000000000003";
const TRACK_PREFIX: &str = "spotify:track:";
const TRACK_TYPE: &str = "track";
const WRONG_TYPE: &str = "episode";
const TRACK_TITLE: &str = "Synthetic track (Live)";
const RECORDING_CODE: &str = "TEST00000001";
const DURATION_MILLISECONDS: u64 = 180000;
const FIRST_POSITION: usize = 0;
const SINGLE_RESULT: usize = 1;
const NO_RESULTS: usize = 0;
const MAXIMUM_ARTISTS: usize = 32;
const EXCESSIVE_RESPONSE_BYTES: usize = 1048577;
const PADDING_BYTE: u8 = 0;
const QUERY: &str = "track:\"Synthetic \\\"mix\\\" \\\\ title\" artist:\"Synthetic artist\"";
const QUERY_PARAMETER: &str = "q";
const TYPE_PARAMETER: &str = "type";
const MARKET_PARAMETER: &str = "market";
const LIMIT_PARAMETER: &str = "limit";
const ORIGIN: &str = "https://api.spotify.com";
const SEARCH_PATH: &str = "/v1/search";
const FOREIGN_PATH: &str = "//example.com/v1/search?q=private";
const OTHER_PUBLIC_PATH: &str = "/v1/me";
const AUTHORIZATION_QUERY: &str = "access_token";
const PRIVATE_VALUE: &str = "synthetic-private-value";
const TRACKS_FIELD: &str = "tracks";
const ITEMS_FIELD: &str = "items";
const IDENTIFIER_FIELD: &str = "id";
const REFERENCE_FIELD: &str = "uri";
const NAME_FIELD: &str = "name";
const ARTISTS_FIELD: &str = "artists";
const DURATION_FIELD: &str = "duration_ms";
const TYPE_FIELD: &str = "type";
const LOCAL_FIELD: &str = "is_local";
const EXTERNAL_IDENTIFIERS_FIELD: &str = "external_ids";
const RECORDING_CODE_FIELD: &str = "isrc";
const PLAYABLE_FIELD: &str = "is_playable";
const RESTRICTIONS_FIELD: &str = "restrictions";
const REASON_FIELD: &str = "reason";
const MARKET_REASON: &str = "market";
const LINKED_FROM_FIELD: &str = "linked_from";
const INPUT_TITLE_FIELD: &str = "title";
const INPUT_AUTHOR_FIELD: &str = "author";
const INPUT_MARKET_FIELD: &str = "market";
const INPUT_LIMIT_FIELD: &str = "limit";

fn input() -> ConnectSearchInput { ConnectSearchInput { title: TITLE.to_owned(), author: AUTHOR.to_owned(), market: MARKET.to_owned(), limit: LIMIT } }
fn track(identifier: &str) -> Value {
    json!({ (IDENTIFIER_FIELD): identifier, (REFERENCE_FIELD): TRACK_PREFIX.to_owned() + identifier, (NAME_FIELD): TRACK_TITLE,
        (ARTISTS_FIELD): [{ (NAME_FIELD): AUTHOR }], (DURATION_FIELD): DURATION_MILLISECONDS, (TYPE_FIELD): TRACK_TYPE,
        (LOCAL_FIELD): false, (EXTERNAL_IDENTIFIERS_FIELD): { (RECORDING_CODE_FIELD): RECORDING_CODE } })
}
fn response(tracks: Vec<Value>) -> Vec<u8> { serde_json::to_vec(&json!({ (TRACKS_FIELD): { (ITEMS_FIELD): tracks } })).unwrap() }

#[test]
fn search_builds_only_fixed_public_track_queries_with_quoted_escaped_metadata() {
    let request = search_request(&input()).unwrap(); let address = search_address(&request).unwrap();
    assert_eq!(request.method, Method::GET); assert!(request.body.is_empty());
    assert_eq!(address.origin().ascii_serialization(), ORIGIN); assert_eq!(address.path(), SEARCH_PATH);
    let values = address.query_pairs().collect::<std::collections::HashMap<_, _>>();
    assert_eq!(values[QUERY_PARAMETER], QUERY); assert_eq!(values[TYPE_PARAMETER], TRACK_TYPE);
    assert_eq!(values[MARKET_PARAMETER], MARKET); assert_eq!(values[LIMIT_PARAMETER], LIMIT.to_string());
}

#[test]
fn search_input_bounds_required_fields_market_and_positive_result_limit_before_dispatch() {
    let variants = [ConnectSearchInput { title: EMPTY_TEXT.to_owned(), ..input() }, ConnectSearchInput { author: BLANK_TEXT.to_owned(), ..input() },
        ConnectSearchInput { title: CONTROL_TITLE.to_owned(), ..input() }, ConnectSearchInput { market: INVALID_MARKET.to_owned(), ..input() },
        ConnectSearchInput { limit: EMPTY_LIMIT, ..input() }, ConnectSearchInput { limit: EXCESSIVE_LIMIT, ..input() },
        ConnectSearchInput { title: PADDING_CHARACTER.to_string().repeat(MAXIMUM_TEXT_CHARACTERS + BOUNDARY_INCREMENT), ..input() }];
    for input in variants { assert!(matches!(search_request(&input), Err(Failure::InvalidInput))); }
}

#[test]
fn authenticated_account_country_takes_precedence_without_hiding_invalid_inputs() {
    assert_eq!(input().for_account_country(ACCOUNT_COUNTRY).unwrap().market, ACCOUNT_COUNTRY);
    assert_eq!(input().for_account_country(EMPTY_TEXT).unwrap().market, MARKET);
    assert!(matches!(ConnectSearchInput { market: INVALID_MARKET.to_owned(), ..input() }.for_account_country(ACCOUNT_COUNTRY), Err(Failure::InvalidInput)));
}

#[test]
fn search_address_cannot_be_repurposed_for_arbitrary_hosts_paths_methods_or_credential_parameters() {
    for path in [FOREIGN_PATH, OTHER_PUBLIC_PATH] {
        let mut request = search_request(&input()).unwrap(); request.path = path.to_owned(); assert!(search_address(&request).is_err());
    }
    let mut request = search_request(&input()).unwrap(); request.method = Method::POST; assert!(search_address(&request).is_err());
    let mut request = search_request(&input()).unwrap(); request.body = PRIVATE_VALUE.as_bytes().to_vec(); assert!(search_address(&request).is_err());
    let mut request = search_request(&input()).unwrap(); let mut address = search_address(&request).unwrap();
    address.query_pairs_mut().append_pair(AUTHORIZATION_QUERY, PRIVATE_VALUE);
    request.path = address.path().to_owned() + QUERY_DELIMITER + address.query().unwrap(); assert!(search_address(&request).is_err());
}
const QUERY_DELIMITER: &str = "?";

#[test]
fn response_projection_preserves_real_identity_version_artists_duration_and_recording_code_without_claiming_playability() {
    let projected = decode_search_response(&input(), &response(vec![track(FIRST_TRACK)])).unwrap(); let song = &projected[FIRST_POSITION];
    assert_eq!(projected.len(), SINGLE_RESULT); assert_eq!(song.spotify_track_identifier, FIRST_TRACK); assert_eq!(song.title, TRACK_TITLE);
    assert_eq!(song.artist_names, vec![AUTHOR]); assert_eq!(song.duration_milliseconds, DURATION_MILLISECONDS);
    assert_eq!(song.recording_codes, vec![RECORDING_CODE]); assert_eq!(song.playable, None);
}

#[test]
fn empty_search_results_are_success_and_duplicate_results_preserve_first_ordered_identity() {
    assert_eq!(decode_search_response(&input(), &response(Vec::new())).unwrap().len(), NO_RESULTS);
    let projected = decode_search_response(&input(), &response(vec![track(FIRST_TRACK), track(FIRST_TRACK)])).unwrap();
    assert_eq!(projected.len(), SINGLE_RESULT); assert_eq!(projected[FIRST_POSITION].spotify_track_identifier, FIRST_TRACK);
}

#[test]
fn explicit_playability_and_restrictions_preserve_availability_and_reject_contradictions() {
    for playable in [true, false] {
        let mut song = track(FIRST_TRACK); song[PLAYABLE_FIELD] = json!(playable);
        assert_eq!(decode_search_response(&input(), &response(vec![song])).unwrap()[FIRST_POSITION].playable, Some(playable));
    }
    let mut restricted = track(FIRST_TRACK); restricted[RESTRICTIONS_FIELD] = json!({ (REASON_FIELD): MARKET_REASON });
    assert_eq!(decode_search_response(&input(), &response(vec![restricted.clone()])).unwrap()[FIRST_POSITION].playable, Some(false));
    restricted[PLAYABLE_FIELD] = json!(true); assert!(matches!(decode_search_response(&input(), &response(vec![restricted])), Err(Failure::InvalidResponse)));
}

#[test]
fn valid_relinking_keeps_actual_returned_track_instead_of_substituting_the_original() {
    let mut song = track(SECOND_TRACK); song[LINKED_FROM_FIELD] = json!({ (IDENTIFIER_FIELD): FIRST_TRACK, (REFERENCE_FIELD): TRACK_PREFIX.to_owned() + FIRST_TRACK });
    let projected = decode_search_response(&input(), &response(vec![song])).unwrap();
    assert_eq!(projected[FIRST_POSITION].spotify_track_identifier, SECOND_TRACK);
}

#[test]
fn inconsistent_returned_or_relinked_track_identity_cannot_enter_matching() {
    let mut inconsistent = track(FIRST_TRACK); inconsistent[REFERENCE_FIELD] = json!(TRACK_PREFIX.to_owned() + SECOND_TRACK);
    let mut linked = track(FIRST_TRACK); linked[LINKED_FROM_FIELD] = json!({ (IDENTIFIER_FIELD): SECOND_TRACK, (REFERENCE_FIELD): TRACK_PREFIX.to_owned() + THIRD_TRACK });
    for song in [inconsistent, linked] { assert!(matches!(decode_search_response(&input(), &response(vec![song])), Err(Failure::InvalidResponse))); }
}

#[test]
fn local_tracks_wrong_types_invalid_names_and_nonpositive_durations_cannot_become_spotify_candidates() {
    let mut local = track(FIRST_TRACK); local[LOCAL_FIELD] = json!(true);
    let mut episode = track(FIRST_TRACK); episode[TYPE_FIELD] = json!(WRONG_TYPE);
    let mut duration = track(FIRST_TRACK); duration[DURATION_FIELD] = json!(NO_RESULTS);
    let mut title = track(FIRST_TRACK); title[NAME_FIELD] = json!(EMPTY_TEXT);
    let mut artist = track(FIRST_TRACK); artist[ARTISTS_FIELD] = json!([{ (NAME_FIELD): CONTROL_TITLE }]);
    for song in [local, episode, duration, title, artist] { assert!(matches!(decode_search_response(&input(), &response(vec![song])), Err(Failure::InvalidResponse))); }
}

#[test]
fn bounded_response_decoder_rejects_oversized_bytes_results_and_artist_lists() {
    assert!(matches!(decode_search_response(&input(), &vec![PADDING_BYTE; EXCESSIVE_RESPONSE_BYTES]), Err(Failure::Backpressure)));
    assert!(matches!(decode_search_response(&input(), &response(vec![track(FIRST_TRACK); LIMIT + BOUNDARY_INCREMENT])), Err(Failure::Backpressure)));
    let mut song = track(FIRST_TRACK); song[ARTISTS_FIELD] = json!(vec![json!({ (NAME_FIELD): AUTHOR }); MAXIMUM_ARTISTS + BOUNDARY_INCREMENT]);
    assert!(matches!(decode_search_response(&input(), &response(vec![song])), Err(Failure::InvalidResponse)));
}

#[test]
fn malformed_unknown_input_and_mistyped_response_values_remain_invalid() {
    assert!(serde_json::from_value::<ConnectSearchInput>(json!({ (INPUT_TITLE_FIELD): TITLE, (INPUT_AUTHOR_FIELD): AUTHOR,
        (INPUT_MARKET_FIELD): MARKET, (INPUT_LIMIT_FIELD): LIMIT, (AUTHORIZATION_QUERY): PRIVATE_VALUE })).is_err());
    assert!(matches!(decode_search_response(&input(), PRIVATE_VALUE.as_bytes()), Err(Failure::InvalidResponse)));
    let mut song = track(FIRST_TRACK); song[PLAYABLE_FIELD] = json!(PRIVATE_VALUE);
    assert!(matches!(decode_search_response(&input(), &response(vec![song])), Err(Failure::InvalidResponse)));
}
