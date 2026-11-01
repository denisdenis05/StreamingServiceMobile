use std::future::Future;

use librespot_protocol::clienttoken_http::{ClientTokenRequest, ClientTokenRequestType, ClientTokenResponse,
    ClientTokenResponseType, ChallengeType};
use protobuf::Message;

use crate::model::{bounded_text, Failure};

pub const CLIENT_TOKEN_ADDRESS: &str = "https://clienttoken.spotify.com/v1/clienttoken";
pub const MAXIMUM_CLIENT_TOKEN_RESPONSE_BYTES: usize = 65536;
const MAXIMUM_IDENTITY_CHARACTERS: usize = 512;
const MAXIMUM_TOKEN_CHARACTERS: usize = 16384;
const MAXIMUM_STATE_CHARACTERS: usize = 4096;
const MAXIMUM_PREFIX_BYTES: usize = 64;
const MAXIMUM_PREFIX_HEX_CHARACTERS: usize = MAXIMUM_PREFIX_BYTES * HEX_CHARACTERS_PER_BYTE;
const HEX_CHARACTERS_PER_BYTE: usize = 2;
const MAXIMUM_DIFFICULTY: i32 = 20;
const MINIMUM_DIFFICULTY: i32 = 0;
const MAXIMUM_CACHE_LIFETIME_SECONDS: u64 = 86400;
const MINIMUM_LIFETIME_SECONDS: i32 = 1;
const SINGLE_CHALLENGE: usize = 1;
const FIRST_CHALLENGE: usize = 0;
const HIGH_HEX_DIGIT_POSITION: usize = 0;
const LOW_HEX_DIGIT_POSITION: usize = 1;
const EMPTY_HEX_REMAINDER: usize = 0;
const HEX_RADIX: u32 = 16;
const HEX_DIGITS: &[u8] = b"0123456789ABCDEF";
const LOW_NIBBLE_MASK: u8 = 15;
const HIGH_NIBBLE_SHIFT: u8 = 4;
const MILLISECONDS_PER_SECOND: u64 = 1000;
const MAXIMUM_SUFFIX_BYTES: usize = 16;

#[derive(Clone, PartialEq, Eq)]
pub struct ClientTokenIdentity { pub account_identifier: String, pub client_identifier: String, pub device_identifier: String }

#[derive(Clone, Copy)]
pub enum ClientTokenPlatform { Android, Linux, MacOs, Ios, Windows }

pub struct ClientTokenGrant { pub token: String, pub refresh_after_seconds: u64 }

#[derive(Default)]
pub struct ClientTokenCache { entry: Option<(ClientTokenIdentity, ClientTokenGrant, u64)> }
impl ClientTokenCache {
    pub fn read(&self, identity: &ClientTokenIdentity, now_milliseconds: u64) -> Option<&str> {
        self.entry.as_ref().filter(|(bound, _, expires)| bound == identity && now_milliseconds < *expires)
            .map(|(_, grant, _)| grant.token.as_str())
    }
    pub fn clear(&mut self) { self.entry = None; }
    pub fn remember(&mut self, identity: ClientTokenIdentity, grant: ClientTokenGrant, now_milliseconds: u64) -> Result<(), Failure> {
        let lifetime = grant.refresh_after_seconds.min(MAXIMUM_CACHE_LIFETIME_SECONDS).checked_mul(MILLISECONDS_PER_SECOND).ok_or(Failure::InvalidResponse)?;
        let expires = now_milliseconds.checked_add(lifetime).ok_or(Failure::InvalidResponse)?;
        if grant.refresh_after_seconds < MINIMUM_LIFETIME_SECONDS as u64 {
            return Err(Failure::InvalidResponse);
        }
        self.entry = Some((identity, grant, expires)); Ok(())
    }
}

pub trait ClientTokenExchange: Send {
    fn is_current(&self, identity: &ClientTokenIdentity) -> bool;
    fn dispatch(&mut self, body: Vec<u8>) -> impl Future<Output = Result<Vec<u8>, Failure>> + Send;
    fn solve(&mut self, prefix: Vec<u8>, difficulty: i32) -> impl Future<Output = Result<Vec<u8>, Failure>> + Send;
}

fn require_current(exchange: &impl ClientTokenExchange, identity: &ClientTokenIdentity) -> Result<(), Failure> {
    if !exchange.is_current(identity) { return Err(Failure::Superseded); }
    Ok(())
}

pub fn initial_request(identity: &ClientTokenIdentity, platform: ClientTokenPlatform) -> Result<ClientTokenRequest, Failure> {
    for value in [&identity.account_identifier, &identity.client_identifier, &identity.device_identifier] {
        if value.trim().is_empty() || !bounded_text(value, MAXIMUM_IDENTITY_CHARACTERS) { return Err(Failure::InvalidInput); }
    }
    let mut request = ClientTokenRequest::new();
    request.request_type = ClientTokenRequestType::REQUEST_CLIENT_DATA_REQUEST.into();
    let data = request.mut_client_data();
    data.client_id = identity.client_identifier.clone();
    data.client_version = librespot_core::version::spotify_semantic_version();
    let connectivity = data.mut_connectivity_sdk_data();
    connectivity.device_id = identity.device_identifier.clone();
    let platform_data = connectivity.platform_specific_data.mut_or_insert_default();
    match platform {
        ClientTokenPlatform::Android => { platform_data.mut_android(); },
        ClientTokenPlatform::Linux => { platform_data.mut_desktop_linux(); },
        ClientTokenPlatform::MacOs => { platform_data.mut_desktop_macos(); },
        ClientTokenPlatform::Ios => { platform_data.mut_ios(); },
        ClientTokenPlatform::Windows => { platform_data.mut_desktop_windows(); },
    }
    Ok(request)
}

fn decode(bytes: &[u8]) -> Result<ClientTokenResponse, Failure> {
    if bytes.len() > MAXIMUM_CLIENT_TOKEN_RESPONSE_BYTES { return Err(Failure::Backpressure); }
    ClientTokenResponse::parse_from_bytes(bytes).map_err(|_| Failure::InvalidResponse)
}

fn grant(response: &ClientTokenResponse) -> Result<ClientTokenGrant, Failure> {
    if response.response_type.enum_value().ok() != Some(ClientTokenResponseType::RESPONSE_GRANTED_TOKEN_RESPONSE)
        || !response.has_granted_token() { return Err(Failure::Unsupported); }
    let token = response.granted_token();
    if token.token.trim().is_empty() || !bounded_text(&token.token, MAXIMUM_TOKEN_CHARACTERS)
        || token.expires_after_seconds < MINIMUM_LIFETIME_SECONDS
        || !(MINIMUM_LIFETIME_SECONDS..=token.expires_after_seconds).contains(&token.refresh_after_seconds) { return Err(Failure::InvalidResponse); }
    Ok(ClientTokenGrant { token: token.token.clone(), refresh_after_seconds: token.refresh_after_seconds as u64 })
}

fn decode_prefix(value: &str) -> Result<Vec<u8>, Failure> {
    if value.is_empty() || value.len() > MAXIMUM_PREFIX_HEX_CHARACTERS || value.len() % HEX_CHARACTERS_PER_BYTE != EMPTY_HEX_REMAINDER {
        return Err(Failure::InvalidResponse);
    }
    value.as_bytes().chunks_exact(HEX_CHARACTERS_PER_BYTE).map(|pair| {
        let high = (pair[HIGH_HEX_DIGIT_POSITION] as char).to_digit(HEX_RADIX).ok_or(Failure::InvalidResponse)? as u8;
        let low = (pair[LOW_HEX_DIGIT_POSITION] as char).to_digit(HEX_RADIX).ok_or(Failure::InvalidResponse)? as u8;
        Ok((high << HIGH_NIBBLE_SHIFT) | low)
    }).collect()
}

fn encode_suffix(value: &[u8]) -> Result<String, Failure> {
    if value.len() != MAXIMUM_SUFFIX_BYTES { return Err(Failure::InvalidResponse); }
    let mut result = String::with_capacity(value.len() * HEX_CHARACTERS_PER_BYTE);
    for byte in value { result.push(HEX_DIGITS[(byte >> HIGH_NIBBLE_SHIFT) as usize] as char); result.push(HEX_DIGITS[(byte & LOW_NIBBLE_MASK) as usize] as char); }
    Ok(result)
}

pub async fn obtain_client_token(exchange: &mut impl ClientTokenExchange, identity: &ClientTokenIdentity,
    platform: ClientTokenPlatform) -> Result<ClientTokenGrant, Failure> {
    require_current(exchange, identity)?;
    let request = initial_request(identity, platform)?;
    let response = decode(&exchange.dispatch(request.write_to_bytes().map_err(|_| Failure::InvalidInput)?).await?)?;
    require_current(exchange, identity)?;
    if response.response_type.enum_value().ok() == Some(ClientTokenResponseType::RESPONSE_GRANTED_TOKEN_RESPONSE) { return grant(&response); }
    if response.response_type.enum_value().ok() != Some(ClientTokenResponseType::RESPONSE_CHALLENGES_RESPONSE)
        || !response.has_challenges() { return Err(Failure::Unsupported); }
    let challenges = response.challenges();
    if challenges.challenges.len() != SINGLE_CHALLENGE || !bounded_text(&challenges.state, MAXIMUM_STATE_CHARACTERS)
        || challenges.state.trim().is_empty() { return Err(Failure::Unsupported); }
    let challenge = &challenges.challenges[FIRST_CHALLENGE];
    if challenge.type_.enum_value().ok() != Some(ChallengeType::CHALLENGE_HASH_CASH)
        || !challenge.has_evaluate_hashcash_parameters() { return Err(Failure::Unsupported); }
    let parameters = challenge.evaluate_hashcash_parameters();
    if !(MINIMUM_DIFFICULTY..=MAXIMUM_DIFFICULTY).contains(&parameters.length) { return Err(Failure::Unsupported); }
    let prefix = decode_prefix(&parameters.prefix)?;
    let suffix = exchange.solve(prefix, parameters.length).await?;
    require_current(exchange, identity)?;
    let mut answer = ClientTokenRequest::new(); answer.request_type = ClientTokenRequestType::REQUEST_CHALLENGE_ANSWERS_REQUEST.into();
    let answers = answer.mut_challenge_answers(); answers.state = challenges.state.clone();
    let mut challenge_answer = librespot_protocol::clienttoken_http::ChallengeAnswer::new();
    challenge_answer.ChallengeType = ChallengeType::CHALLENGE_HASH_CASH.into();
    challenge_answer.mut_hash_cash().suffix = encode_suffix(&suffix)?;
    answers.answers.push(challenge_answer);
    let response = decode(&exchange.dispatch(answer.write_to_bytes().map_err(|_| Failure::InvalidInput)?).await?)?;
    require_current(exchange, identity)?;
    grant(&response)
}
