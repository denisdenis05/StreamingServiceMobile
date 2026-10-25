use std::{future::Future, time::{Duration, SystemTime}};

use librespot_core::{token::Token, Session};
use librespot_protocol::{client_info::ClientInfo, credentials::StoredCredential, hashcash::HashcashSolution,
    login5::{ChallengeSolution, ChallengeSolutions, LoginError, LoginOk, LoginRequest, LoginResponse,
        login_request::Login_method, login_response::Response}};
use protobuf::{Message, MessageField, well_known_types::duration::Duration as ProtocolDuration};

use crate::{model::{validate_bootstrap_token, Failure}, session::sanitized_failure};

pub const CLIENT_IDENTIFIER: &str = "65b708073fc0480ea92a077233ca87bd";
pub const LOGIN_ADDRESS: &str = "https://login5.spotify.com/v3/login";
const POST_METHOD: &str = "POST";
const ACCEPT_HEADER: &str = "accept";
const PROTOBUF_MEDIA_TYPE: &str = "application/x-protobuf";
const BEARER_TOKEN_TYPE: &str = "Bearer";
const MAXIMUM_RESPONSE_BYTES: usize = 65536;
const MAXIMUM_CONTEXT_BYTES: usize = 16384;
const MAXIMUM_CHALLENGES: usize = 4;
const MAXIMUM_REQUESTS: usize = 3;
const FIRST_REQUEST: usize = 0;
const MAXIMUM_TOKEN_LIFETIME_SECONDS: i32 = 86400;
const MINIMUM_TOKEN_LIFETIME_SECONDS: i32 = 1;
const MAXIMUM_HASHCASH_PREFIX_BYTES: usize = 128;
const MINIMUM_HASHCASH_DIFFICULTY: i32 = 0;
const MAXIMUM_HASHCASH_DIFFICULTY: i32 = 32;
const HASHCASH_SUFFIX_BYTES: usize = 16;

pub fn stored_credential_request(account_identifier: &str, device_identifier: &str, credential: &[u8]) -> LoginRequest {
    LoginRequest {
        client_info: MessageField::some(ClientInfo { client_id: CLIENT_IDENTIFIER.to_owned(),
            device_id: device_identifier.to_owned(), ..Default::default() }),
        login_method: Some(Login_method::StoredCredential(StoredCredential {
            username: account_identifier.to_owned(), data: credential.to_owned(), ..Default::default()
        })), ..Default::default()
    }
}

fn error_category(error: LoginError) -> Failure {
    match error {
        LoginError::INVALID_CREDENTIALS | LoginError::UNKNOWN_IDENTIFIER => Failure::Unauthorized,
        LoginError::BAD_REQUEST | LoginError::INVALID_PHONENUMBER => Failure::InvalidInput,
        LoginError::UNSUPPORTED_LOGIN_PROTOCOL => Failure::Unsupported,
        LoginError::TIMEOUT => Failure::Deadline,
        LoginError::TOO_MANY_ATTEMPTS | LoginError::TRY_AGAIN_LATER => Failure::Backpressure,
        LoginError::UNKNOWN_ERROR => Failure::Network,
    }
}

fn validated_token(response: LoginOk, account_identifier: &str, timestamp: SystemTime) -> Result<Token, Failure> {
    if response.username != account_identifier { return Err(Failure::Unauthorized); }
    if validate_bootstrap_token(&response.access_token).is_err()
        || !(MINIMUM_TOKEN_LIFETIME_SECONDS..=MAXIMUM_TOKEN_LIFETIME_SECONDS).contains(&response.access_token_expires_in) {
        return Err(Failure::InvalidResponse);
    }
    let expires_in = Duration::from_secs(response.access_token_expires_in as u64);
    timestamp.checked_add(expires_in).ok_or(Failure::InvalidResponse)?;
    Ok(Token { access_token: response.access_token, expires_in, timestamp,
        token_type: BEARER_TOKEN_TYPE.to_owned(), scopes: Vec::new() })
}

pub async fn exchange<Transport, TransportResponse, Solver, Clock>(mut request: LoginRequest,
    mut transport: Transport, mut solve: Solver, clock: Clock) -> Result<Token, Failure>
where
    Transport: FnMut(Vec<u8>) -> TransportResponse,
    TransportResponse: Future<Output = Result<Vec<u8>, Failure>>,
    Solver: FnMut(&[u8], &[u8], i32) -> Result<HashcashSolution, Failure>,
    Clock: FnOnce() -> SystemTime,
{
    let account_identifier = match &request.login_method {
        Some(Login_method::StoredCredential(credential)) if !credential.username.is_empty() && !credential.data.is_empty()
            && request.client_info.client_id == CLIENT_IDENTIFIER => credential.username.clone(),
        _ => return Err(Failure::InvalidInput),
    };
    for _request_number in FIRST_REQUEST..MAXIMUM_REQUESTS {
        let body = transport(request.write_to_bytes().map_err(|_| Failure::InvalidResponse)?).await?;
        if body.len() > MAXIMUM_RESPONSE_BYTES { return Err(Failure::InvalidResponse); }
        let response = LoginResponse::parse_from_bytes(&body).map_err(|_| Failure::InvalidResponse)?;
        match response.response {
            Some(Response::Ok(success)) => return validated_token(success, &account_identifier, clock()),
            Some(Response::Error(error)) => return Err(error_category(error.enum_value().map_err(|_| Failure::InvalidResponse)?)),
            Some(Response::Challenges(challenges)) => {
                if challenges.challenges.is_empty() || challenges.challenges.len() > MAXIMUM_CHALLENGES
                    || response.login_context.is_empty() || response.login_context.len() > MAXIMUM_CONTEXT_BYTES {
                    return Err(Failure::InvalidResponse);
                }
                let mut solutions = ChallengeSolutions::new();
                for challenge in challenges.challenges {
                    if !challenge.has_hashcash() { return Err(Failure::Unsupported); }
                    let challenge = challenge.hashcash();
                    if challenge.prefix.len() > MAXIMUM_HASHCASH_PREFIX_BYTES
                        || !(MINIMUM_HASHCASH_DIFFICULTY..=MAXIMUM_HASHCASH_DIFFICULTY).contains(&challenge.length) {
                        return Err(Failure::InvalidResponse);
                    }
                    let mut solution = ChallengeSolution::new();
                    solution.set_hashcash(solve(&response.login_context, &challenge.prefix, challenge.length)?);
                    solutions.solutions.push(solution);
                }
                request.login_context = response.login_context;
                request.challenge_solutions = MessageField::some(solutions);
            },
            None => return Err(Failure::InvalidResponse),
            Some(_) => return Err(Failure::Unsupported),
        }
    }
    Err(Failure::Unsupported)
}

fn solve_challenge(context: &[u8], prefix: &[u8], difficulty: i32) -> Result<HashcashSolution, Failure> {
    let mut suffix = [0u8; HASHCASH_SUFFIX_BYTES];
    let duration = librespot_core::util::solve_hash_cash(context, prefix, difficulty, &mut suffix).map_err(sanitized_failure)?;
    Ok(HashcashSolution { suffix: suffix.to_vec(), duration: MessageField::some(ProtocolDuration {
        seconds: duration.as_secs() as i64, nanos: duration.subsec_nanos() as i32, ..Default::default()
    }), ..Default::default() })
}

pub async fn session_token(session: &Session) -> Result<Token, Failure> {
    if session.client_id() != CLIENT_IDENTIFIER { return Err(Failure::InvalidInput); }
    let request = stored_credential_request(&session.username(), session.device_id(), &session.auth_data());
    exchange(request, |body| async {
        let request = token_request(body)?.map(Into::into);
        session.http_client().request_body(request).await.map(|response| response.to_vec()).map_err(sanitized_failure)
    }, solve_challenge, SystemTime::now).await
}

pub fn token_request(body: Vec<u8>) -> Result<http::Request<Vec<u8>>, Failure> {
    http::Request::builder().method(POST_METHOD).uri(LOGIN_ADDRESS)
        .header(ACCEPT_HEADER, PROTOBUF_MEDIA_TYPE).body(body).map_err(|_| Failure::InvalidInput)
}
