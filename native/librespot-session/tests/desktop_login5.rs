use std::{collections::VecDeque, time::{Duration, SystemTime, UNIX_EPOCH}};

use librespot_protocol::{hashcash::{HashcashChallenge, HashcashSolution}, login5::{Challenge, Challenges,
    LoginError, LoginOk, LoginRequest, LoginResponse, login_response::Response}};
use protobuf::Message;
use streaming_spotify_session::{desktop_login5::{exchange, stored_credential_request, token_request, CLIENT_IDENTIFIER,
    LOGIN_ADDRESS}, model::Failure};

const ACCOUNT: &str = "synthetic-account";
const OTHER_ACCOUNT: &str = "other-account";
const DEVICE: &str = "synthetic-device";
const TOKEN: &str = "synthetic-token";
const WHITESPACE_TOKEN: &str = "invalid token";
const CREDENTIAL: &[u8] = b"synthetic-stored-credential";
const CONTEXT: &[u8] = b"synthetic-context";
const PREFIX: &[u8] = b"synthetic-prefix";
const SUFFIX: &[u8] = b"synthetic-suffix";
const LIFETIME_SECONDS: i32 = 3600;
const NOW_SECONDS: u64 = 1000;
const NO_LIFETIME_SECONDS: i32 = 0;
const EXCESSIVE_LIFETIME_SECONDS: i32 = 86401;
const NEGATIVE_LIFETIME_SECONDS: i32 = -1;
const NO_DIFFICULTY: i32 = 0;
const EXCESSIVE_DIFFICULTY: i32 = 33;
const NO_REQUESTS: usize = 0;
const SINGLE_REQUEST: usize = 1;
const TWO_REQUESTS: usize = 2;
const FIRST_POSITION: usize = 0;
const NEXT_POSITION: usize = 1;
const MAXIMUM_REQUESTS: usize = 3;
const OVERSIZED_BYTES: usize = 65537;
const RESPONSE_FILL_BYTE: u8 = 0;
const OVERSIZED_CONTEXT_BYTES: usize = 16385;
const OVERSIZED_PREFIX_BYTES: usize = 129;
const EXCESSIVE_CHALLENGE_COUNT: usize = 5;
const INVALID_PROTOBUF: &[u8] = &[255];
const CLIENT_TOKEN_HEADER: &str = "client-token";
const AUTHORIZATION_HEADER: &str = "authorization";
const ACCEPT_HEADER: &str = "accept";
const PROTOBUF_MEDIA_TYPE: &str = "application/x-protobuf";
const POST_METHOD: &str = "POST";
const EMPTY_TEXT: &str = "";

fn now() -> SystemTime { UNIX_EPOCH + Duration::from_secs(NOW_SECONDS) }
fn request() -> LoginRequest { stored_credential_request(ACCOUNT, DEVICE, CREDENTIAL) }
fn success() -> LoginResponse { LoginResponse { response: Some(Response::Ok(LoginOk {
    username: ACCOUNT.to_owned(), access_token: TOKEN.to_owned(), access_token_expires_in: LIFETIME_SECONDS,
    ..Default::default()
})), ..Default::default() } }
fn serialized(response: LoginResponse) -> Vec<u8> { response.write_to_bytes().unwrap() }
fn challenge() -> LoginResponse {
    let mut challenge = Challenge::new();
    challenge.set_hashcash(HashcashChallenge { prefix: PREFIX.to_vec(), length: NO_DIFFICULTY, ..Default::default() });
    LoginResponse { login_context: CONTEXT.to_vec(), response: Some(Response::Challenges(Challenges {
        challenges: vec![challenge], ..Default::default()
    })), ..Default::default() }
}

async fn run(responses: Vec<Result<Vec<u8>, Failure>>) -> (Result<librespot_core::token::Token, Failure>, Vec<LoginRequest>) {
    let mut replies = VecDeque::from(responses);
    let mut requests = Vec::new();
    let result = exchange(request(), |body| {
        requests.push(LoginRequest::parse_from_bytes(&body).unwrap());
        let response = replies.pop_front().expect(ACCOUNT);
        async move { response }
    }, |context, prefix, difficulty| {
        assert_eq!(context, CONTEXT); assert_eq!(prefix, PREFIX); assert_eq!(difficulty, NO_DIFFICULTY);
        Ok(HashcashSolution { suffix: SUFFIX.to_vec(), ..Default::default() })
    }, now).await;
    (result, requests)
}

#[test]
fn desktop_request_has_the_fixed_login5_endpoint_and_no_android_client_token_header() {
    let request = token_request(request().write_to_bytes().unwrap()).unwrap();
    assert_eq!(request.uri().to_string(), LOGIN_ADDRESS); assert_eq!(request.method(), POST_METHOD);
    assert_eq!(request.headers().get(ACCEPT_HEADER).unwrap(), PROTOBUF_MEDIA_TYPE);
    assert!(request.headers().get(CLIENT_TOKEN_HEADER).is_none());
    assert!(request.headers().get(AUTHORIZATION_HEADER).is_none());
    let body = LoginRequest::parse_from_bytes(request.body()).unwrap();
    assert_eq!(body.client_info.client_id, CLIENT_IDENTIFIER); assert_eq!(body.client_info.device_id, DEVICE);
    assert_eq!(body.stored_credential().username, ACCOUNT); assert_eq!(body.stored_credential().data, CREDENTIAL);
}

#[tokio::test]
async fn successful_exchange_preserves_the_canonical_account_token_and_injected_expiry() {
    let (result, requests) = run(vec![Ok(serialized(success()))]).await;
    let token = result.unwrap(); assert_eq!(token.access_token, TOKEN); assert_eq!(token.timestamp, now());
    assert_eq!(token.expires_in, Duration::from_secs(LIFETIME_SECONDS as u64));
    assert_eq!(requests.len(), SINGLE_REQUEST);
}

#[tokio::test]
async fn cross_account_success_is_rejected_without_requesting_another_identity() {
    let mut response = success(); response.mut_ok().username = OTHER_ACCOUNT.to_owned();
    let (result, requests) = run(vec![Ok(serialized(response))]).await;
    assert!(matches!(result, Err(Failure::Unauthorized))); assert_eq!(requests.len(), SINGLE_REQUEST);
}

#[tokio::test]
async fn malformed_expiry_and_token_successes_are_rejected() {
    for lifetime in [NO_LIFETIME_SECONDS, NEGATIVE_LIFETIME_SECONDS, EXCESSIVE_LIFETIME_SECONDS] {
        let mut response = success(); response.mut_ok().access_token_expires_in = lifetime;
        assert!(matches!(run(vec![Ok(serialized(response))]).await.0, Err(Failure::InvalidResponse)));
    }
    for token in [EMPTY_TEXT, WHITESPACE_TOKEN] {
        let mut response = success(); response.mut_ok().access_token = token.to_owned();
        assert!(matches!(run(vec![Ok(serialized(response))]).await.0, Err(Failure::InvalidResponse)));
    }
}

#[tokio::test]
async fn malformed_empty_and_oversized_responses_fail_before_a_second_request() {
    for response in [INVALID_PROTOBUF.to_vec(), vec![RESPONSE_FILL_BYTE; OVERSIZED_BYTES], serialized(LoginResponse::new())] {
        let (result, requests) = run(vec![Ok(response)]).await;
        assert!(matches!(result, Err(Failure::InvalidResponse))); assert_eq!(requests.len(), SINGLE_REQUEST);
    }
}

#[tokio::test]
async fn login5_error_categories_preserve_transient_recovery_and_unsupported_verification() {
    for (error, expected) in [(LoginError::INVALID_CREDENTIALS, Failure::Unauthorized),
        (LoginError::UNKNOWN_IDENTIFIER, Failure::Unauthorized), (LoginError::BAD_REQUEST, Failure::InvalidInput),
        (LoginError::UNSUPPORTED_LOGIN_PROTOCOL, Failure::Unsupported), (LoginError::TIMEOUT, Failure::Deadline),
        (LoginError::TOO_MANY_ATTEMPTS, Failure::Backpressure), (LoginError::TRY_AGAIN_LATER, Failure::Backpressure),
        (LoginError::UNKNOWN_ERROR, Failure::Network)] {
        let response = LoginResponse { response: Some(Response::Error(error.into())), ..Default::default() };
        assert!(run(vec![Ok(serialized(response))]).await.0.is_err_and(|failure| failure == expected));
    }
}

#[tokio::test]
async fn transport_failures_are_not_replayed_or_reclassified_as_credentials_rejection() {
    for failure in [Failure::Network, Failure::Deadline, Failure::Canceled, Failure::Backpressure] {
        let (result, requests) = run(vec![Err(failure)]).await;
        assert!(result.is_err_and(|actual| actual == failure)); assert_eq!(requests.len(), SINGLE_REQUEST);
    }
}

#[tokio::test]
async fn hashcash_round_keeps_the_account_and_submits_the_bound_context_and_solution() {
    let (result, requests) = run(vec![Ok(serialized(challenge())), Ok(serialized(success()))]).await;
    assert!(result.is_ok()); assert_eq!(requests.len(), TWO_REQUESTS);
    let followup = &requests[NEXT_POSITION]; assert_eq!(followup.login_context, CONTEXT);
    assert_eq!(followup.client_info, requests[FIRST_POSITION].client_info);
    assert_eq!(followup.login_method, requests[FIRST_POSITION].login_method);
    assert_eq!(followup.challenge_solutions.solutions[FIRST_POSITION].hashcash().suffix, SUFFIX);
}

#[tokio::test]
async fn code_challenges_are_unsupported_and_never_submitted_as_hashcash() {
    let mut response = challenge(); response.mut_challenges().challenges[FIRST_POSITION].mut_code();
    let (result, requests) = run(vec![Ok(serialized(response))]).await;
    assert!(matches!(result, Err(Failure::Unsupported))); assert_eq!(requests.len(), SINGLE_REQUEST);
}

#[tokio::test]
async fn missing_context_and_excessive_difficulty_fail_before_solving_or_replaying() {
    let mut missing = challenge(); missing.login_context.clear();
    let mut difficult = challenge(); difficult.mut_challenges().challenges[FIRST_POSITION].mut_hashcash().length = EXCESSIVE_DIFFICULTY;
    for response in [missing, difficult] {
        let (result, requests) = run(vec![Ok(serialized(response))]).await;
        assert!(matches!(result, Err(Failure::InvalidResponse))); assert_eq!(requests.len(), SINGLE_REQUEST);
    }
}

#[tokio::test]
async fn repeated_challenges_have_a_fixed_request_limit() {
    let (result, requests) = run((NO_REQUESTS..MAXIMUM_REQUESTS).map(|_| Ok(serialized(challenge()))).collect()).await;
    assert!(matches!(result, Err(Failure::Unsupported))); assert_eq!(requests.len(), MAXIMUM_REQUESTS);
}

#[tokio::test]
async fn oversized_context_prefix_and_challenge_count_are_rejected_before_solving() {
    let mut context = challenge(); context.login_context = vec![RESPONSE_FILL_BYTE; OVERSIZED_CONTEXT_BYTES];
    let mut prefix = challenge(); prefix.mut_challenges().challenges[FIRST_POSITION].mut_hashcash().prefix = vec![RESPONSE_FILL_BYTE; OVERSIZED_PREFIX_BYTES];
    let mut count = challenge();
    let repeated = count.challenges().challenges[FIRST_POSITION].clone();
    count.mut_challenges().challenges = vec![repeated; EXCESSIVE_CHALLENGE_COUNT];
    for response in [context, prefix, count] {
        let (result, requests) = run(vec![Ok(serialized(response))]).await;
        assert!(matches!(result, Err(Failure::InvalidResponse))); assert_eq!(requests.len(), SINGLE_REQUEST);
    }
}

#[tokio::test]
async fn challenge_solver_failure_is_preserved_without_sending_a_partial_solution() {
    let mut requests = NO_REQUESTS;
    let result = exchange(request(), |_| {
        requests += SINGLE_REQUEST;
        async { Ok(serialized(challenge())) }
    }, |_, _, _| Err(Failure::Deadline), now).await;
    assert!(matches!(result, Err(Failure::Deadline))); assert_eq!(requests, SINGLE_REQUEST);
}
