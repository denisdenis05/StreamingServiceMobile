use std::collections::HashMap;

use librespot_core::SpotifyId;
use librespot_protocol::{extended_metadata::{BatchedEntityRequest, BatchedExtensionResponse, EntityRequest, ExtensionQuery},
    extension_kind::ExtensionKind, metadata::Track};
use protobuf::{EnumOrUnknown, Message};
use serde::Serialize;

use crate::model::{bounded_text, Failure};

pub trait ConnectMetadataOperations: Send {
    fn metadata(&mut self, identifiers: Vec<String>) -> impl std::future::Future<Output = Result<Vec<ConnectTrackMetadata>, Failure>> + Send;
}

pub const METADATA_PATH: &str = "/extended-metadata/v0/extended-metadata";
const TRACK_URI_PREFIX: &str = "spotify:track:";
const TRACK_IDENTIFIER_CHARACTERS: usize = 22;
const MAXIMUM_REQUEST_TRACKS: usize = 20;
const MAXIMUM_METADATA_BYTES: usize = 1048576;
const MAXIMUM_TEXT_CHARACTERS: usize = 2048;
const MAXIMUM_ARTISTS: usize = 32;
const MAXIMUM_RECORDING_CODES: usize = 16;
const MINIMUM_ITEMS: usize = 1;
const MINIMUM_DURATION_MILLISECONDS: i32 = 1;
const FIRST_POSITION: usize = 0;
const SUCCESS_STATUS: i32 = 200;
const NOT_FOUND_STATUS: i32 = 404;
const DEFAULT_STATUS: i32 = 0;
const RECORDING_CODE_TYPE: &str = "isrc";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectTrackMetadata {
    pub spotify_track_identifier: String,
    pub title: String,
    pub artist_names: Vec<String>,
    pub duration_milliseconds: u64,
    pub recording_codes: Vec<String>,
}

fn track_identifier(identifier: &str) -> Result<SpotifyId, Failure> {
    if identifier.len() != TRACK_IDENTIFIER_CHARACTERS || !identifier.bytes().all(|character| character.is_ascii_alphanumeric()) {
        return Err(Failure::InvalidInput);
    }
    SpotifyId::from_base62(identifier).map_err(|_| Failure::InvalidInput)
}

fn identifiers(identifiers: &[String]) -> Result<(), Failure> {
    if identifiers.len() < MINIMUM_ITEMS || identifiers.len() > MAXIMUM_REQUEST_TRACKS { return Err(Failure::InvalidInput); }
    let mut seen = HashMap::new();
    for identifier in identifiers {
        track_identifier(identifier)?;
        if seen.insert(identifier, ()).is_some() { return Err(Failure::InvalidInput); }
    }
    Ok(())
}

pub fn encode_metadata_request(requested_identifiers: &[String]) -> Result<Vec<u8>, Failure> {
    identifiers(requested_identifiers)?;
    BatchedEntityRequest { entity_request: requested_identifiers.iter().map(|identifier| EntityRequest {
        entity_uri: TRACK_URI_PREFIX.to_owned() + identifier,
        query: vec![ExtensionQuery { extension_kind: EnumOrUnknown::new(ExtensionKind::TRACK_V4), ..Default::default() }],
        ..Default::default() }).collect(), ..Default::default() }.write_to_bytes().map_err(|_| Failure::InvalidInput)
}

fn project_track(identifier: &str, bytes: &[u8]) -> Result<ConnectTrackMetadata, Failure> {
    let track = Track::parse_from_bytes(bytes).map_err(|_| Failure::InvalidResponse)?;
    if track.gid.as_deref() != Some(track_identifier(identifier)?.to_raw().as_slice()) { return Err(Failure::InvalidResponse); }
    let title = track.name.filter(|name| bounded_text(name, MAXIMUM_TEXT_CHARACTERS)).ok_or(Failure::InvalidResponse)?;
    let duration = track.duration.filter(|duration| *duration >= MINIMUM_DURATION_MILLISECONDS).ok_or(Failure::InvalidResponse)?;
    if track.artist.is_empty() || track.artist.len() > MAXIMUM_ARTISTS || track.external_id.len() > MAXIMUM_RECORDING_CODES {
        return Err(Failure::InvalidResponse);
    }
    let artist_names = track.artist.into_iter().map(|artist| artist.name.filter(|name| bounded_text(name, MAXIMUM_TEXT_CHARACTERS))
        .ok_or(Failure::InvalidResponse)).collect::<Result<Vec<_>, _>>()?;
    let recording_codes = track.external_id.into_iter().filter(|identifier| identifier.type_.as_deref() == Some(RECORDING_CODE_TYPE))
        .map(|identifier| identifier.id.filter(|value| bounded_text(value, MAXIMUM_TEXT_CHARACTERS)).ok_or(Failure::InvalidResponse))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ConnectTrackMetadata { spotify_track_identifier: identifier.to_owned(), title, artist_names,
        duration_milliseconds: duration as u64, recording_codes })
}

pub fn decode_metadata_response(requested_identifiers: &[String], bytes: &[u8]) -> Result<Vec<ConnectTrackMetadata>, Failure> {
    identifiers(requested_identifiers)?;
    if bytes.len() > MAXIMUM_METADATA_BYTES { return Err(Failure::Backpressure); }
    let response = BatchedExtensionResponse::parse_from_bytes(bytes).map_err(|_| Failure::InvalidResponse)?;
    if response.extended_metadata.len() != MINIMUM_ITEMS { return Err(Failure::InvalidResponse); }
    let extension = &response.extended_metadata[FIRST_POSITION];
    if extension.header.provider_error_status == NOT_FOUND_STATUS { return Err(Failure::NotFound); }
    if extension.extension_kind.enum_value().ok() != Some(ExtensionKind::TRACK_V4)
        || extension.extension_data.len() != requested_identifiers.len()
        || extension.header.provider_error_status != DEFAULT_STATUS && extension.header.provider_error_status != SUCCESS_STATUS {
        return Err(Failure::InvalidResponse);
    }
    let mut entries = HashMap::new();
    for entry in &extension.extension_data {
        if entry.header.status_code == NOT_FOUND_STATUS { return Err(Failure::NotFound); }
        if entry.header.status_code != SUCCESS_STATUS || entries.insert(entry.entity_uri.as_str(), entry).is_some() {
            return Err(Failure::InvalidResponse);
        }
    }
    requested_identifiers.iter().map(|identifier| {
        let uri = TRACK_URI_PREFIX.to_owned() + identifier;
        let entry = entries.get(uri.as_str()).ok_or(Failure::InvalidResponse)?;
        let data = entry.extension_data.as_ref().ok_or(Failure::InvalidResponse)?;
        project_track(identifier, &data.value)
    }).collect()
}
