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
const TRACK_PREFIX: &str = "spotify:track:";
const TRACK_TYPE: &str = "Track";
const WRONG_TYPE: &str = "episode";
const TRACK_TITLE: &str = "Synthetic track (Live)";
const DURATION_MILLISECONDS: u64 = 180000;
const FIRST_POSITION: usize = 0;
const SINGLE_RESULT: usize = 1;
const NO_RESULTS: usize = 0;
const MAXIMUM_ARTISTS: usize = 32;
const EXCESSIVE_RESPONSE_BYTES: usize = 1048577;
const PADDING_BYTE: u8 = 0;
const QUERY: &str = "track:\"Synthetic \\\"mix\\\" \\\\ title\" artist:\"Synthetic artist\"";
const LIMIT_PARAMETER: &str = "limit";
const ORIGIN: &str = "https://api-partner.spotify.com";
const SEARCH_PATH: &str = "/pathfinder/v2/query";
const FOREIGN_PATH: &str = "//example.com/v1/search?q=private";
const OTHER_PUBLIC_PATH: &str = "/v1/me";
const AUTHORIZATION_QUERY: &str = "access_token";
const PRIVATE_VALUE: &str = "synthetic-private-value";
const ITEMS_FIELD: &str = "items";
const IDENTIFIER_FIELD: &str = "id";
const REFERENCE_FIELD: &str = "uri";
const NAME_FIELD: &str = "name";
const ARTISTS_FIELD: &str = "artists";
const DURATION_FIELD: &str = "duration";
const TOTAL_MILLISECONDS_FIELD: &str = "totalMilliseconds";
const DATA_FIELD: &str = "data";
const SEARCH_FIELD: &str = "searchV2";
const TRACK_RESULTS_FIELD: &str = "tracksV2";
const ITEM_FIELD: &str = "item";
const PROFILE_FIELD: &str = "profile";
const PLAYABILITY_FIELD: &str = "playability";
const VARIABLES_FIELD: &str = "variables";
const SEARCH_TERM_FIELD: &str = "searchTerm";
const OPERATION_FIELD: &str = "operationName";
const SEARCH_OPERATION: &str = "searchTracks";
const ERRORS_FIELD: &str = "errors";
const EXTENSIONS_FIELD: &str = "extensions";
const CODE_FIELD: &str = "code";
const RETIRED_QUERY_CODE: &str = "PERSISTED_QUERY_NOT_FOUND";
const TYPE_FIELD: &str = "__typename";
const PLAYABLE_FIELD: &str = "playable";
const INPUT_TITLE_FIELD: &str = "title";
const INPUT_AUTHOR_FIELD: &str = "author";
const INPUT_MARKET_FIELD: &str = "market";
const INPUT_LIMIT_FIELD: &str = "limit";

fn input() -> ConnectSearchInput { ConnectSearchInput { title: TITLE.to_owned(), author: AUTHOR.to_owned(), market: MARKET.to_owned(), limit: LIMIT } }
fn track(identifier: &str) -> Value {
    json!({ (IDENTIFIER_FIELD): identifier, (REFERENCE_FIELD): TRACK_PREFIX.to_owned() + identifier, (NAME_FIELD): TRACK_TITLE,
        (ARTISTS_FIELD): { (ITEMS_FIELD): [{ (PROFILE_FIELD): { (NAME_FIELD): AUTHOR } }] },
        (DURATION_FIELD): { (TOTAL_MILLISECONDS_FIELD): DURATION_MILLISECONDS }, (TYPE_FIELD): TRACK_TYPE })
}
fn response(tracks: Vec<Value>) -> Vec<u8> {
    let items = tracks.into_iter().map(|track| json!({ (ITEM_FIELD): { (DATA_FIELD): track } })).collect::<Vec<_>>();
    serde_json::to_vec(&json!({ (DATA_FIELD): { (SEARCH_FIELD): { (TRACK_RESULTS_FIELD): { (ITEMS_FIELD): items } } } })).unwrap()
}

#[test]
fn search_builds_only_fixed_partner_track_reads_with_quoted_escaped_metadata() {
    let request = search_request(&input()).unwrap(); let address = search_address(&request).unwrap();
    assert_eq!(request.method, Method::POST);
    assert_eq!(address.origin().ascii_serialization(), ORIGIN); assert_eq!(address.path(), SEARCH_PATH);
    let body: Value = serde_json::from_slice(&request.body).unwrap();
    assert_eq!(body[OPERATION_FIELD], SEARCH_OPERATION);
    assert_eq!(body[VARIABLES_FIELD][SEARCH_TERM_FIELD], QUERY);
    assert_eq!(body[VARIABLES_FIELD][LIMIT_PARAMETER], LIMIT);
    assert!(address.query().is_none());
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
    let mut request = search_request(&input()).unwrap(); request.method = Method::GET; assert!(search_address(&request).is_err());
    let mut request = search_request(&input()).unwrap(); request.body = PRIVATE_VALUE.as_bytes().to_vec(); assert!(search_address(&request).is_err());
    let mut request = search_request(&input()).unwrap(); let mut body: Value = serde_json::from_slice(&request.body).unwrap();
    body[AUTHORIZATION_QUERY] = json!(PRIVATE_VALUE); request.body = serde_json::to_vec(&body).unwrap();
    assert!(search_address(&request).is_err());
}

#[test]
fn response_projection_preserves_real_identity_version_artists_duration_without_fabricating_recording_codes_or_playability() {
    let projected = decode_search_response(&input(), &response(vec![track(FIRST_TRACK)])).unwrap(); let song = &projected[FIRST_POSITION];
    assert_eq!(projected.len(), SINGLE_RESULT); assert_eq!(song.spotify_track_identifier, FIRST_TRACK); assert_eq!(song.title, TRACK_TITLE);
    assert_eq!(song.artist_names, vec![AUTHOR]); assert_eq!(song.duration_milliseconds, DURATION_MILLISECONDS);
    assert!(song.recording_codes.is_empty()); assert_eq!(song.playable, None);
}

#[test]
fn empty_search_results_are_success_and_duplicate_results_preserve_first_ordered_identity() {
    assert_eq!(decode_search_response(&input(), &response(Vec::new())).unwrap().len(), NO_RESULTS);
    let projected = decode_search_response(&input(), &response(vec![track(FIRST_TRACK), track(FIRST_TRACK)])).unwrap();
    assert_eq!(projected.len(), SINGLE_RESULT); assert_eq!(projected[FIRST_POSITION].spotify_track_identifier, FIRST_TRACK);
}

#[test]
fn explicit_partner_playability_preserves_account_scoped_availability() {
    for playable in [true, false] {
        let mut song = track(FIRST_TRACK); song[PLAYABILITY_FIELD] = json!({ (PLAYABLE_FIELD): playable });
        assert_eq!(decode_search_response(&input(), &response(vec![song])).unwrap()[FIRST_POSITION].playable, Some(playable));
    }
}

#[test]
fn actual_returned_identity_is_used_and_a_uri_can_supply_its_own_missing_identifier() {
    let mut song = track(SECOND_TRACK); song.as_object_mut().unwrap().remove(IDENTIFIER_FIELD);
    let projected = decode_search_response(&input(), &response(vec![song])).unwrap();
    assert_eq!(projected[FIRST_POSITION].spotify_track_identifier, SECOND_TRACK);
}

#[test]
fn inconsistent_returned_track_identity_cannot_enter_matching() {
    let mut inconsistent = track(FIRST_TRACK); inconsistent[REFERENCE_FIELD] = json!(TRACK_PREFIX.to_owned() + SECOND_TRACK);
    assert!(matches!(decode_search_response(&input(), &response(vec![inconsistent])), Err(Failure::InvalidResponse)));
}

#[test]
fn local_tracks_wrong_types_invalid_names_and_nonpositive_durations_cannot_become_spotify_candidates() {
    let mut local = track(FIRST_TRACK); local[REFERENCE_FIELD] = json!(PRIVATE_VALUE);
    let mut episode = track(FIRST_TRACK); episode[TYPE_FIELD] = json!(WRONG_TYPE);
    let mut duration = track(FIRST_TRACK); duration[DURATION_FIELD] = json!({ (TOTAL_MILLISECONDS_FIELD): NO_RESULTS });
    let mut title = track(FIRST_TRACK); title[NAME_FIELD] = json!(EMPTY_TEXT);
    let mut artist = track(FIRST_TRACK); artist[ARTISTS_FIELD] = json!({ (ITEMS_FIELD): [{ (PROFILE_FIELD): { (NAME_FIELD): CONTROL_TITLE } }] });
    for song in [local, episode, duration, title, artist] { assert!(matches!(decode_search_response(&input(), &response(vec![song])), Err(Failure::InvalidResponse))); }
}

#[test]
fn bounded_response_decoder_rejects_oversized_bytes_results_and_artist_lists() {
    assert!(matches!(decode_search_response(&input(), &vec![PADDING_BYTE; EXCESSIVE_RESPONSE_BYTES]), Err(Failure::Backpressure)));
    assert!(matches!(decode_search_response(&input(), &response(vec![track(FIRST_TRACK); LIMIT + BOUNDARY_INCREMENT])), Err(Failure::Backpressure)));
    let mut song = track(FIRST_TRACK); song[ARTISTS_FIELD] = json!({ (ITEMS_FIELD): vec![json!({ (PROFILE_FIELD): { (NAME_FIELD): AUTHOR } }); MAXIMUM_ARTISTS + BOUNDARY_INCREMENT] });
    assert!(matches!(decode_search_response(&input(), &response(vec![song])), Err(Failure::InvalidResponse)));
}

#[test]
fn malformed_unknown_input_and_mistyped_response_values_remain_invalid() {
    assert!(serde_json::from_value::<ConnectSearchInput>(json!({ (INPUT_TITLE_FIELD): TITLE, (INPUT_AUTHOR_FIELD): AUTHOR,
        (INPUT_MARKET_FIELD): MARKET, (INPUT_LIMIT_FIELD): LIMIT, (AUTHORIZATION_QUERY): PRIVATE_VALUE })).is_err());
    assert!(matches!(decode_search_response(&input(), PRIVATE_VALUE.as_bytes()), Err(Failure::InvalidResponse)));
    let mut song = track(FIRST_TRACK); song[PLAYABILITY_FIELD] = json!({ (PLAYABLE_FIELD): PRIVATE_VALUE });
    assert!(matches!(decode_search_response(&input(), &response(vec![song])), Err(Failure::InvalidResponse)));
}

#[test]
fn catalog_diagnostics_expose_only_fixed_origin_stage_http_status_and_safe_failure() {
    use streaming_spotify_session::connect_search::diagnostics::{SearchDiagnostic, SearchDiagnosticStage};
    const ORIGIN_FIELD: &str = "origin";
    const STAGE_FIELD: &str = "stage";
    const STATUS_FIELD: &str = "status";
    const FAILURE_FIELD: &str = "failure";
    const FIELD_COUNT: usize = 4;
    const LIMITED_STATUS: u16 = 429;
    const HTTP_RESPONSE_STAGE: &str = "httpResponse";
    let diagnostic = SearchDiagnostic::new(SearchDiagnosticStage::HttpResponse,
        Some(http::StatusCode::TOO_MANY_REQUESTS), Some(Failure::Backpressure));
    let value = serde_json::to_value(diagnostic).unwrap();
    assert_eq!(value.as_object().unwrap().len(), FIELD_COUNT);
    assert_eq!(value[ORIGIN_FIELD], ORIGIN); assert_eq!(value[STAGE_FIELD], HTTP_RESPONSE_STAGE);
    assert_eq!(value[STATUS_FIELD], LIMITED_STATUS); assert_eq!(value[FAILURE_FIELD], Failure::Backpressure.code());
    for stage in [SearchDiagnosticStage::RequestCompletion, SearchDiagnosticStage::DispatchAdmission,
        SearchDiagnosticStage::Transport, SearchDiagnosticStage::ResponseBody, SearchDiagnosticStage::Decode] {
        let value = serde_json::to_value(SearchDiagnostic::new(stage, None, None)).unwrap();
        assert_eq!(value.as_object().unwrap().len(), FIELD_COUNT);
        assert!(value[STATUS_FIELD].is_null()); assert!(value[FAILURE_FIELD].is_null());
    }
}

#[test]
fn retired_persisted_query_and_graph_errors_cannot_be_mistaken_for_empty_success() {
    let retired = serde_json::to_vec(&json!({ (ERRORS_FIELD): [{ (EXTENSIONS_FIELD): { (CODE_FIELD): RETIRED_QUERY_CODE } }] })).unwrap();
    assert!(matches!(decode_search_response(&input(), &retired), Err(Failure::Unsupported)));
    let rejected = serde_json::to_vec(&json!({ (ERRORS_FIELD): [{ (EXTENSIONS_FIELD): { (CODE_FIELD): PRIVATE_VALUE } }] })).unwrap();
    assert!(matches!(decode_search_response(&input(), &rejected), Err(Failure::InvalidResponse)));
}

#[test]
fn partner_catalog_posts_are_passive_reads_and_the_pinned_operation_cannot_be_changed() {
    const EXTENSIONS_FIELD: &str = "extensions";
    const PERSISTED_QUERY_FIELD: &str = "persistedQuery";
    const QUERY_HASH_FIELD: &str = "sha256Hash";
    const OFFSET_FIELD: &str = "offset";
    const OTHER_OFFSET: usize = 1;
    let request = search_request(&input()).unwrap(); assert!(!request.purpose.is_mutation());
    for field in [OPERATION_FIELD, QUERY_HASH_FIELD, OFFSET_FIELD] {
        let mut request = search_request(&input()).unwrap(); let mut body: Value = serde_json::from_slice(&request.body).unwrap();
        if field == OPERATION_FIELD { body[OPERATION_FIELD] = json!(PRIVATE_VALUE); }
        else if field == QUERY_HASH_FIELD { body[EXTENSIONS_FIELD][PERSISTED_QUERY_FIELD][QUERY_HASH_FIELD] = json!(PRIVATE_VALUE); }
        else { body[VARIABLES_FIELD][OFFSET_FIELD] = json!(OTHER_OFFSET); }
        request.body = serde_json::to_vec(&body).unwrap(); assert!(matches!(search_address(&request), Err(Failure::InvalidInput)));
    }
}

#[test]
fn client_token_diagnostics_use_only_their_fixed_origin_and_never_contain_protocol_or_account_payloads() {
    use streaming_spotify_session::connect_search::diagnostics::SearchDiagnostic;
    const CLIENT_TOKEN_ORIGIN: &str = "https://clienttoken.spotify.com";
    const CLIENT_TOKEN_STAGE: &str = "clientToken";
    const ORIGIN_FIELD: &str = "origin";
    const STAGE_FIELD: &str = "stage";
    let value = serde_json::to_value(SearchDiagnostic::client_token(Some(http::StatusCode::OK), None)).unwrap();
    assert_eq!(value[ORIGIN_FIELD], CLIENT_TOKEN_ORIGIN); assert_eq!(value[STAGE_FIELD], CLIENT_TOKEN_STAGE);
    assert!(!value.to_string().contains(AUTHOR)); assert!(!value.to_string().contains(TITLE));
    assert!(!value.to_string().contains(PRIVATE_VALUE));
}
