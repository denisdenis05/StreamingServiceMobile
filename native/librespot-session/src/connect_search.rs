use std::{collections::HashSet, future::Future};

use http::Method;
use librespot_core::SpotifyId;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{connect_authentication::{ConnectHttpRequest, ConnectRequestPurpose}, model::{bounded_text, Failure}};

pub const CATALOG_SEARCH_ORIGIN: &str = "https://api.spotify.com";
const SEARCH_PATH: &str = "/v1/search";
const JSON_MEDIA_TYPE: &str = "application/json";
const TRACK_KIND: &str = "track";
const TRACK_URI_PREFIX: &str = "spotify:track:";
const TRACK_FILTER_PREFIX: &str = "track:";
const ARTIST_FILTER_PREFIX: &str = " artist:";
const QUOTE: char = '"';
const ESCAPE: char = '\\';
const QUERY_PARAMETER: &str = "q";
const TYPE_PARAMETER: &str = "type";
const MARKET_PARAMETER: &str = "market";
const LIMIT_PARAMETER: &str = "limit";
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
const QUERY_PARAMETER_COUNT: usize = 4;
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

pub fn search_request(input: &ConnectSearchInput) -> Result<ConnectHttpRequest, Failure> {
    input.validate()?;
    let query = TRACK_FILTER_PREFIX.to_owned() + &quoted(&input.title) + ARTIST_FILTER_PREFIX + &quoted(&input.author);
    let mut address = Url::parse(&(CATALOG_SEARCH_ORIGIN.to_owned() + SEARCH_PATH)).map_err(|_| Failure::InvalidInput)?;
    address.query_pairs_mut().append_pair(QUERY_PARAMETER, &query).append_pair(TYPE_PARAMETER, TRACK_KIND)
        .append_pair(MARKET_PARAMETER, &input.market).append_pair(LIMIT_PARAMETER, &input.limit.to_string());
    let path = address.path().to_owned() + QUERY_DELIMITER + address.query().ok_or(Failure::InvalidInput)?;
    Ok(ConnectHttpRequest { method: Method::GET, path, body: Vec::new(), media_type: JSON_MEDIA_TYPE, purpose: ConnectRequestPurpose::CatalogSearch })
}

const QUERY_DELIMITER: &str = "?";

pub fn search_address(request: &ConnectHttpRequest) -> Result<Url, Failure> {
    if !matches!(request.purpose, ConnectRequestPurpose::CatalogSearch) || request.method != Method::GET || !request.body.is_empty()
        || request.media_type != JSON_MEDIA_TYPE { return Err(Failure::InvalidInput); }
    let address = Url::parse(&(CATALOG_SEARCH_ORIGIN.to_owned() + &request.path)).map_err(|_| Failure::InvalidInput)?;
    if address.origin().ascii_serialization() != CATALOG_SEARCH_ORIGIN || address.path() != SEARCH_PATH || address.fragment().is_some()
        || !address.username().is_empty() || address.password().is_some() { return Err(Failure::InvalidInput); }
    let pairs = address.query_pairs().collect::<Vec<_>>();
    if pairs.len() != QUERY_PARAMETER_COUNT { return Err(Failure::InvalidInput); }
    let mut names = HashSet::new();
    for (name, value) in pairs {
        if !names.insert(name.to_string()) { return Err(Failure::InvalidInput); }
        let valid = match name.as_ref() {
            QUERY_PARAMETER => bounded_text(&value, MAXIMUM_QUERY_CHARACTERS),
            TYPE_PARAMETER => value == TRACK_KIND,
            MARKET_PARAMETER => market(&value),
            LIMIT_PARAMETER => value.parse::<usize>().is_ok_and(|limit| (MINIMUM_RESULTS..=MAXIMUM_RESULTS).contains(&limit)),
            _ => false,
        };
        if !valid { return Err(Failure::InvalidInput); }
    }
    Ok(address)
}

#[derive(Deserialize)]
struct SearchResponse { tracks: SearchPage }
#[derive(Deserialize)]
struct SearchPage { items: Vec<PublicTrack> }
#[derive(Deserialize)]
struct PublicArtist { name: String }
#[derive(Deserialize)]
struct ExternalIdentifiers { #[serde(rename = "isrc")] recording_code: Option<String> }
#[derive(Deserialize)]
struct Restriction { reason: String }
#[derive(Deserialize)]
struct LinkedIdentity {
    #[serde(rename = "id")]
    identifier: Option<String>,
    #[serde(rename = "uri")]
    track_reference: Option<String>,
}
#[derive(Deserialize)]
struct PublicTrack {
    #[serde(rename = "id")]
    identifier: String,
    #[serde(rename = "uri")]
    track_reference: String,
    name: String, artists: Vec<PublicArtist>,
    #[serde(rename = "duration_ms")]
    duration_milliseconds: u64,
    #[serde(rename = "type")]
    kind: String,
    is_local: bool,
    #[serde(rename = "external_ids")]
    external_identifiers: Option<ExternalIdentifiers>,
    is_playable: Option<bool>, restrictions: Option<Restriction>, linked_from: Option<LinkedIdentity>,
}

fn valid_identifier(identifier: &str) -> bool {
    identifier.len() == TRACK_IDENTIFIER_CHARACTERS && identifier.bytes().all(|character| character.is_ascii_alphanumeric())
        && SpotifyId::from_base62(identifier).is_ok()
}

fn identity(identifier: &str, track_reference: &str) -> Result<(), Failure> {
    if !valid_identifier(identifier) || track_reference != TRACK_URI_PREFIX.to_owned() + identifier { return Err(Failure::InvalidResponse); }
    Ok(())
}

fn project(track: PublicTrack) -> Result<ConnectSearchTrack, Failure> {
    identity(&track.identifier, &track.track_reference)?;
    if track.kind != TRACK_KIND || track.is_local || !bounded_text(&track.name, MAXIMUM_TEXT_CHARACTERS)
        || track.artists.len() == EMPTY_COUNT || track.artists.len() > MAXIMUM_ARTISTS
        || track.artists.iter().any(|artist| !bounded_text(&artist.name, MAXIMUM_TEXT_CHARACTERS))
        || !(MINIMUM_DURATION_MILLISECONDS..=MAXIMUM_SAFE_INTEGER).contains(&track.duration_milliseconds) { return Err(Failure::InvalidResponse); }
    if let Some(original) = track.linked_from {
        match (original.identifier, original.track_reference) {
            (Some(identifier), Some(track_reference)) => identity(&identifier, &track_reference)?,
            (None, None) => (),
            _ => return Err(Failure::InvalidResponse),
        }
    }
    let recording_codes = match track.external_identifiers.and_then(|identifiers| identifiers.recording_code) {
        Some(code) if bounded_text(&code, MAXIMUM_TEXT_CHARACTERS) => vec![code],
        Some(_) => return Err(Failure::InvalidResponse),
        None => Vec::new(),
    };
    let playable = match track.restrictions {
        Some(restriction) => {
            if !bounded_text(&restriction.reason, MAXIMUM_TEXT_CHARACTERS) || track.is_playable == Some(true) { return Err(Failure::InvalidResponse); }
            Some(false)
        },
        None => track.is_playable,
    };
    Ok(ConnectSearchTrack { spotify_track_identifier: track.identifier, title: track.name,
        artist_names: track.artists.into_iter().map(|artist| artist.name).collect(), duration_milliseconds: track.duration_milliseconds, recording_codes, playable })
}

pub fn decode_search_response(input: &ConnectSearchInput, bytes: &[u8]) -> Result<Vec<ConnectSearchTrack>, Failure> {
    input.validate()?;
    if bytes.len() > MAXIMUM_RESPONSE_BYTES { return Err(Failure::Backpressure); }
    let response: SearchResponse = serde_json::from_slice(bytes).map_err(|_| Failure::InvalidResponse)?;
    if response.tracks.items.len() > input.limit { return Err(Failure::Backpressure); }
    let mut identifiers = HashSet::new();
    let mut tracks = Vec::new();
    for track in response.tracks.items {
        let projected = project(track)?;
        if identifiers.insert(projected.spotify_track_identifier.clone()) { tracks.push(projected); }
    }
    Ok(tracks)
}
