#[path = "connect_search_diagnostics.rs"]
pub mod diagnostics;

use std::{collections::HashSet, future::Future};

use http::Method;
use librespot_core::SpotifyId;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{connect_authentication::{ConnectHttpRequest, ConnectRequestPurpose}, model::{bounded_text, Failure}};

pub const CATALOG_SEARCH_ORIGIN: &str = "https://api-partner.spotify.com";
const SEARCH_PATH: &str = "/pathfinder/v2/query";
const SEARCH_OPERATION: &str = "searchTracks";
const SEARCH_OPERATION_HASH: &str = "b02683192a98dde7966b5e6655a79eeb62713eab703eda9902c932818dd52751";
const PERSISTED_QUERY_VERSION: usize = 1;
const LEGACY_PERSISTED_QUERY_NOT_FOUND: &str = "PersistedQueryNotFound";
const PERSISTED_QUERY_NOT_FOUND: &str = "PERSISTED_QUERY_NOT_FOUND";
const TRACK_RESPONSE_KIND: &str = "Track";
const JSON_MEDIA_TYPE: &str = "application/json";
const TRACK_URI_PREFIX: &str = "spotify:track:";
const TRACK_FILTER_PREFIX: &str = "track:";
const ARTIST_FILTER_PREFIX: &str = " artist:";
const QUOTE: char = '"';
const ESCAPE: char = '\\';
const MINIMUM_RESULTS: usize = 1;
const MAXIMUM_RESULTS: usize = 10;
const MAXIMUM_RESPONSE_BYTES: usize = 1048576;
const MAXIMUM_TEXT_CHARACTERS: usize = 2048;
const MAXIMUM_ARTISTS: usize = 32;
const TRACK_IDENTIFIER_CHARACTERS: usize = 22;
const MARKET_CHARACTERS: usize = 2;
const EMPTY_COUNT: usize = 0;
const MINIMUM_DURATION_MILLISECONDS: u64 = 1;
const MAXIMUM_SAFE_INTEGER: u64 = 9007199254740991;
const MAXIMUM_ESCAPED_TEXT_EXPANSION: usize = 4;
const QUERY_FILTER_OVERHEAD_CHARACTERS: usize = 32;
const MAXIMUM_QUERY_CHARACTERS: usize = MAXIMUM_TEXT_CHARACTERS * MAXIMUM_ESCAPED_TEXT_EXPANSION + QUERY_FILTER_OVERHEAD_CHARACTERS;

#[derive(Clone, Deserialize, Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConnectSearchInput { pub title: String, pub author: String, pub market: String, pub limit: usize }

#[derive(Clone, Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConnectSearchTrack {
    pub spotify_track_identifier: String,
    pub title: String,
    pub artist_names: Vec<String>,
    pub duration_milliseconds: u64,
    pub recording_codes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playable: Option<bool>,
}

pub trait ConnectSearchOperations: Send {
    fn search(&mut self, input: ConnectSearchInput) -> impl Future<Output = Result<Vec<ConnectSearchTrack>, Failure>> + Send;
}

fn market(value: &str) -> bool { value.len() == MARKET_CHARACTERS && value.bytes().all(|character| character.is_ascii_uppercase()) }

impl ConnectSearchInput {
    pub fn validate(&self) -> Result<(), Failure> {
        if !bounded_text(&self.title, MAXIMUM_TEXT_CHARACTERS) || self.title.trim().is_empty()
            || !bounded_text(&self.author, MAXIMUM_TEXT_CHARACTERS) || self.author.trim().is_empty()
            || !market(&self.market) || !(MINIMUM_RESULTS..=MAXIMUM_RESULTS).contains(&self.limit) { return Err(Failure::InvalidInput); }
        Ok(())
    }

    pub fn for_account_country(mut self, country: &str) -> Result<Self, Failure> {
        self.validate()?;
        if market(country) { self.market = country.to_owned(); }
        Ok(self)
    }
}

fn quoted(value: &str) -> String {
    let mut result = String::new(); result.push(QUOTE);
    for character in value.chars() {
        if matches!(character, QUOTE | ESCAPE) { result.push(ESCAPE); }
        result.push(character);
    }
    result.push(QUOTE); result
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PartnerSearchVariables {
    search_term: String, offset: usize, limit: usize, number_of_top_results: usize,
    include_pre_releases: bool, include_artist_has_concerts_field: bool, include_audiobooks: bool,
    include_authors: bool, include_episode_content_ratings_v2: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedQuery { version: usize, sha256_hash: String }
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PartnerExtensions { persisted_query: PersistedQuery }
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PartnerRequest { operation_name: String, variables: PartnerSearchVariables, extensions: PartnerExtensions }

pub fn search_request(input: &ConnectSearchInput) -> Result<ConnectHttpRequest, Failure> {
    input.validate()?;
    let query = TRACK_FILTER_PREFIX.to_owned() + &quoted(&input.title) + ARTIST_FILTER_PREFIX + &quoted(&input.author);
    let body = PartnerRequest { operation_name: SEARCH_OPERATION.to_owned(), variables: PartnerSearchVariables {
        search_term: query, offset: EMPTY_COUNT, limit: input.limit, number_of_top_results: input.limit,
        include_pre_releases: true, include_artist_has_concerts_field: false, include_audiobooks: false,
        include_authors: false, include_episode_content_ratings_v2: false,
    }, extensions: PartnerExtensions { persisted_query: PersistedQuery { version: PERSISTED_QUERY_VERSION,
        sha256_hash: SEARCH_OPERATION_HASH.to_owned() } } };
    Ok(ConnectHttpRequest { method: Method::POST, path: SEARCH_PATH.to_owned(),
        body: serde_json::to_vec(&body).map_err(|_| Failure::InvalidInput)?, media_type: JSON_MEDIA_TYPE, purpose: ConnectRequestPurpose::CatalogSearch })
}

pub fn search_address(request: &ConnectHttpRequest) -> Result<Url, Failure> {
    if !matches!(request.purpose, ConnectRequestPurpose::CatalogSearch) || request.method != Method::POST
        || request.path != SEARCH_PATH || request.media_type != JSON_MEDIA_TYPE || request.body.len() > MAXIMUM_RESPONSE_BYTES {
        return Err(Failure::InvalidInput);
    }
    let decoded: PartnerRequest = serde_json::from_slice(&request.body).map_err(|_| Failure::InvalidInput)?;
    let variables = decoded.variables;
    if decoded.operation_name != SEARCH_OPERATION || decoded.extensions.persisted_query.version != PERSISTED_QUERY_VERSION
        || decoded.extensions.persisted_query.sha256_hash != SEARCH_OPERATION_HASH
        || !bounded_text(&variables.search_term, MAXIMUM_QUERY_CHARACTERS) || variables.search_term.trim().is_empty()
        || variables.offset != EMPTY_COUNT || !(MINIMUM_RESULTS..=MAXIMUM_RESULTS).contains(&variables.limit)
        || variables.number_of_top_results != variables.limit || !variables.include_pre_releases
        || variables.include_artist_has_concerts_field || variables.include_audiobooks || variables.include_authors
        || variables.include_episode_content_ratings_v2 { return Err(Failure::InvalidInput); }
    Url::parse(&(CATALOG_SEARCH_ORIGIN.to_owned() + SEARCH_PATH)).map_err(|_| Failure::InvalidInput)
}

#[derive(Deserialize)]
struct SearchResponse { data: Option<SearchData>, errors: Option<Vec<GraphFailure>> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchData { search_v2: SearchResults }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchResults { tracks_v2: SearchPage }
#[derive(Deserialize)]
struct SearchPage { items: Vec<SearchItem> }
#[derive(Deserialize)]
struct SearchItem { item: TrackWrapper }
#[derive(Deserialize)]
struct TrackWrapper { data: PartnerTrack }
#[derive(Deserialize)]
struct GraphFailure { extensions: Option<GraphFailureExtensions>, message: Option<String> }
#[derive(Deserialize)]
struct GraphFailureExtensions { code: Option<String> }
#[derive(Deserialize)]
struct PartnerArtist { profile: ArtistProfile }
#[derive(Deserialize)]
struct ArtistProfile { name: String }
#[derive(Deserialize)]
struct PartnerArtists { items: Vec<PartnerArtist> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartnerDuration { total_milliseconds: u64 }
#[derive(Deserialize)]
struct PartnerPlayability { playable: bool }
#[derive(Deserialize)]
struct PartnerTrack {
    #[serde(rename = "__typename")]
    kind: Option<String>,
    #[serde(rename = "id")]
    identifier: Option<String>,
    #[serde(rename = "uri")]
    track_reference: String,
    name: String, artists: PartnerArtists, duration: PartnerDuration, playability: Option<PartnerPlayability>,
}

fn valid_identifier(identifier: &str) -> bool {
    identifier.len() == TRACK_IDENTIFIER_CHARACTERS && identifier.bytes().all(|character| character.is_ascii_alphanumeric())
        && SpotifyId::from_base62(identifier).is_ok()
}

fn identity(identifier: &str, track_reference: &str) -> Result<(), Failure> {
    if !valid_identifier(identifier) || track_reference != TRACK_URI_PREFIX.to_owned() + identifier { return Err(Failure::InvalidResponse); }
    Ok(())
}

fn project(track: PartnerTrack) -> Result<ConnectSearchTrack, Failure> {
    let identifier = track.identifier.unwrap_or_else(|| track.track_reference.strip_prefix(TRACK_URI_PREFIX).unwrap_or_default().to_owned());
    identity(&identifier, &track.track_reference)?;
    if track.kind.as_ref().is_some_and(|kind| kind != TRACK_RESPONSE_KIND) || !bounded_text(&track.name, MAXIMUM_TEXT_CHARACTERS)
        || track.name.trim().is_empty() || track.artists.items.len() == EMPTY_COUNT || track.artists.items.len() > MAXIMUM_ARTISTS
        || track.artists.items.iter().any(|artist| !bounded_text(&artist.profile.name, MAXIMUM_TEXT_CHARACTERS) || artist.profile.name.trim().is_empty())
        || !(MINIMUM_DURATION_MILLISECONDS..=MAXIMUM_SAFE_INTEGER).contains(&track.duration.total_milliseconds) { return Err(Failure::InvalidResponse); }
    Ok(ConnectSearchTrack { spotify_track_identifier: identifier, title: track.name,
        artist_names: track.artists.items.into_iter().map(|artist| artist.profile.name).collect(),
        duration_milliseconds: track.duration.total_milliseconds, recording_codes: Vec::new(), playable: track.playability.map(|playability| playability.playable) })
}

pub fn decode_search_response(input: &ConnectSearchInput, bytes: &[u8]) -> Result<Vec<ConnectSearchTrack>, Failure> {
    input.validate()?;
    if bytes.len() > MAXIMUM_RESPONSE_BYTES { return Err(Failure::Backpressure); }
    let response: SearchResponse = serde_json::from_slice(bytes).map_err(|_| Failure::InvalidResponse)?;
    if let Some(errors) = response.errors.filter(|errors| !errors.is_empty()) {
        if errors.iter().any(|failure| failure.extensions.as_ref().and_then(|extensions| extensions.code.as_deref()).is_some_and(|code| matches!(code, PERSISTED_QUERY_NOT_FOUND | LEGACY_PERSISTED_QUERY_NOT_FOUND))
            || failure.message.as_deref() == Some(LEGACY_PERSISTED_QUERY_NOT_FOUND)) {
            return Err(Failure::Unsupported);
        }
        return Err(Failure::InvalidResponse);
    }
    let items = response.data.ok_or(Failure::InvalidResponse)?.search_v2.tracks_v2.items;
    if items.len() > input.limit { return Err(Failure::Backpressure); }
    let mut identifiers = HashSet::new();
    let mut tracks = Vec::new();
    for item in items {
        let projected = project(item.item.data)?;
        if identifiers.insert(projected.spotify_track_identifier.clone()) { tracks.push(projected); }
    }
    Ok(tracks)
}
