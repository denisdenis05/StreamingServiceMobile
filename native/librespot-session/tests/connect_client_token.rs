use std::collections::VecDeque;

use librespot_protocol::clienttoken_http::{ClientTokenResponse, ClientTokenResponseType, Challenge, ChallengeType, ClientTokenRequest};
use protobuf::Message;
use streaming_spotify_session::{connect_client_token::{ClientTokenExchange, ClientTokenIdentity, ClientTokenPlatform,
    initial_request, obtain_client_token}, model::Failure};

const ANDROID_VERSION: &str = "synthetic-android-release";
const ANDROID_API_VERSION: i32 = 35;
const ANDROID_DEVICE: &str = "synthetic-actual-device";
const ANDROID_MODEL: &str = "synthetic-actual-model";
const ANDROID_MANUFACTURER: &str = "synthetic-actual-manufacturer";
const ACCOUNT: &str = "synthetic-account";
const CLIENT: &str = "synthetic-existing-client";
const CLIENT_TOKEN_CLIENT: &str = "synthetic-fixed-platform-client";
const DEVICE: &str = "synthetic-existing-device";
const TOKEN: &str = "synthetic-client-token";
const STATE: &str = "synthetic-challenge-state";
const PREFIX_FIRST_BYTE: u8 = 170;
const PREFIX_SECOND_BYTE: u8 = 187;
const PREFIX: &str = "AABB";
const DIFFICULTY: i32 = 1;
const EXCESSIVE_DIFFICULTY: i32 = 21;
const EXPIRES_SECONDS: i32 = 3600;
const REFRESH_SECONDS: i32 = 1800;
const NO_CALLS: usize = 0;
const ONE_CALL: usize = 1;
const TWO_CALLS: usize = 2;
const SUFFIX_BYTES: usize = 16;
const SUFFIX_BYTE: u8 = 10;
const SUFFIX_HEX: &str = "0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A";
const EXPECTED_RESPONSE: &str = "Expected a bounded safe failure";
const EMPTY_TEXT: &str = "";
const EXCESSIVE_RESPONSE_BYTES: usize = 65537;
const FILL_BYTE: u8 = 0;

struct Exchange {
    current: bool, retire_after_dispatch: bool, retire_after_solution: bool, responses: VecDeque<Result<Vec<u8>, Failure>>,
    requests: Vec<ClientTokenRequest>, solutions: usize,
}
impl Exchange {
    fn new(responses: Vec<Result<Vec<u8>, Failure>>) -> Self {
        Self { current: true, retire_after_dispatch: false, retire_after_solution: false, responses: responses.into(), requests: Vec::new(), solutions: NO_CALLS }
    }
}
impl ClientTokenExchange for Exchange {
    fn is_current(&self, identity: &ClientTokenIdentity) -> bool { self.current && *identity == identity_value() }
    async fn dispatch(&mut self, body: Vec<u8>) -> Result<Vec<u8>, Failure> {
        self.requests.push(ClientTokenRequest::parse_from_bytes(&body).unwrap());
        if self.retire_after_dispatch { self.current = false; }
        self.responses.pop_front().unwrap()
    }
    async fn solve(&mut self, prefix: Vec<u8>, difficulty: i32) -> Result<Vec<u8>, Failure> {
        assert_eq!(prefix, vec![PREFIX_FIRST_BYTE, PREFIX_SECOND_BYTE]); assert_eq!(difficulty, DIFFICULTY);
        self.solutions += ONE_CALL; if self.retire_after_solution { self.current = false; }
        Ok(vec![SUFFIX_BYTE; SUFFIX_BYTES])
    }
}
fn android_platform() -> ClientTokenPlatform {
    ClientTokenPlatform::Android(streaming_spotify_session::connect_client_platform::AndroidClientTokenData {
        android_version: ANDROID_VERSION.to_owned(), api_version: ANDROID_API_VERSION, device_name: ANDROID_DEVICE.to_owned(),
        model: ANDROID_MODEL.to_owned(), manufacturer: ANDROID_MANUFACTURER.to_owned() })
}
fn identity_value() -> ClientTokenIdentity { ClientTokenIdentity { account_identifier: ACCOUNT.to_owned(), client_identifier: CLIENT.to_owned(), client_token_client_identifier: CLIENT_TOKEN_CLIENT.to_owned(), device_identifier: DEVICE.to_owned() } }
fn granted() -> Vec<u8> {
    let mut response = ClientTokenResponse::new(); response.response_type = ClientTokenResponseType::RESPONSE_GRANTED_TOKEN_RESPONSE.into();
    let granted = response.mut_granted_token(); granted.token = TOKEN.to_owned(); granted.expires_after_seconds = EXPIRES_SECONDS; granted.refresh_after_seconds = REFRESH_SECONDS;
    response.write_to_bytes().unwrap()
}
fn challenge(kind: ChallengeType, difficulty: i32) -> Vec<u8> {
    let mut response = ClientTokenResponse::new(); response.response_type = ClientTokenResponseType::RESPONSE_CHALLENGES_RESPONSE.into();
    let challenges = response.mut_challenges(); challenges.state = STATE.to_owned();
    let mut challenge = Challenge::new(); challenge.type_ = kind.into();
    let hashcash = challenge.mut_evaluate_hashcash_parameters(); hashcash.length = difficulty; hashcash.prefix = PREFIX.to_owned();
    challenges.challenges.push(challenge); response.write_to_bytes().unwrap()
}
#[tokio::test]
async fn client_token_uses_fixed_platform_client_without_replacing_session_identity() {
    for platform in [android_platform(), ClientTokenPlatform::Linux] {
        let mut exchange = Exchange::new(vec![Ok(granted())]);
        let token = obtain_client_token(&mut exchange, &identity_value(), platform).await.unwrap();
        assert_eq!(token.token, TOKEN); assert_eq!(token.refresh_after_seconds, REFRESH_SECONDS as u64);
        assert_eq!(exchange.requests.len(), ONE_CALL); assert_eq!(exchange.solutions, NO_CALLS);
        let request = exchange.requests.first().unwrap(); assert_eq!(request.client_data().client_id, CLIENT_TOKEN_CLIENT);
        assert_eq!(request.client_data().connectivity_sdk_data().device_id, DEVICE);
    }
}
#[tokio::test]
async fn a_single_bounded_hashcash_challenge_has_one_answer_and_keeps_its_bound_state() {
    let mut exchange = Exchange::new(vec![Ok(challenge(ChallengeType::CHALLENGE_HASH_CASH, DIFFICULTY)), Ok(granted())]);
    obtain_client_token(&mut exchange, &identity_value(), android_platform()).await.unwrap();
    assert_eq!(exchange.requests.len(), TWO_CALLS); assert_eq!(exchange.solutions, ONE_CALL);
    let answer = exchange.requests.last().unwrap().challenge_answers(); assert_eq!(answer.state, STATE);
    assert_eq!(answer.answers.first().unwrap().hash_cash().suffix, SUFFIX_HEX);
}
#[tokio::test]
async fn unknown_or_excessive_challenges_never_solve_or_start_another_request() {
    for body in [challenge(ChallengeType::CHALLENGE_EVALUATE_JS, DIFFICULTY), challenge(ChallengeType::CHALLENGE_HASH_CASH, EXCESSIVE_DIFFICULTY)] {
        let mut exchange = Exchange::new(vec![Ok(body)]);
        assert!(matches!(obtain_client_token(&mut exchange, &identity_value(), android_platform()).await, Err(Failure::Unsupported)));
        assert_eq!(exchange.requests.len(), ONE_CALL); assert_eq!(exchange.solutions, NO_CALLS);
    }
}
#[tokio::test]
async fn repeated_challenge_after_the_one_answer_stops_without_an_authentication_loop() {
    let mut exchange = Exchange::new(vec![Ok(challenge(ChallengeType::CHALLENGE_HASH_CASH, DIFFICULTY)), Ok(challenge(ChallengeType::CHALLENGE_HASH_CASH, DIFFICULTY))]);
    assert!(matches!(obtain_client_token(&mut exchange, &identity_value(), android_platform()).await, Err(Failure::Unsupported)));
    assert_eq!(exchange.requests.len(), TWO_CALLS); assert_eq!(exchange.solutions, ONE_CALL);
}
#[tokio::test]
async fn replaced_accounts_and_canceled_transport_cannot_adopt_a_token_or_retry() {
    let mut exchange = Exchange::new(vec![Ok(granted())]); exchange.retire_after_dispatch = true;
    assert!(matches!(obtain_client_token(&mut exchange, &identity_value(), android_platform()).await, Err(Failure::Superseded)));
    let mut retired = Exchange::new(Vec::new()); retired.current = false;
    assert!(matches!(obtain_client_token(&mut retired, &identity_value(), android_platform()).await, Err(Failure::Superseded)));
    assert_eq!(retired.requests.len(), NO_CALLS);
    for failure in [Failure::Canceled, Failure::RateLimited, Failure::Deadline, Failure::NativeTokenRejected] {
        let mut exchange = Exchange::new(vec![Err(failure)]);
        assert!(matches!(obtain_client_token(&mut exchange, &identity_value(), android_platform()).await, Err(actual) if actual == failure));
        assert_eq!(exchange.requests.len(), ONE_CALL);
    }
}
#[tokio::test]
async fn malformed_or_oversized_token_responses_do_not_start_search_or_another_exchange() {
    for body in [TOKEN.as_bytes().to_vec(), vec![FILL_BYTE; EXCESSIVE_RESPONSE_BYTES]] {
        let mut exchange = Exchange::new(vec![Ok(body)]);
        assert!(obtain_client_token(&mut exchange, &identity_value(), android_platform()).await.is_err(), "{EXPECTED_RESPONSE}");
        assert_eq!(exchange.requests.len(), ONE_CALL);
    }
    let mut empty = identity_value(); empty.client_identifier = EMPTY_TEXT.to_owned();
    assert!(matches!(initial_request(&empty, android_platform()), Err(Failure::InvalidInput)));
}

#[test]
fn client_token_cache_expires_on_refresh_boundary_and_never_crosses_account_or_device_scope() {
    use streaming_spotify_session::connect_client_token::{ClientTokenCache, ClientTokenGrant};
    const NOW_MILLISECONDS: u64 = 100;
    const BEFORE_REFRESH_MILLISECONDS: u64 = 1800099;
    const AT_REFRESH_MILLISECONDS: u64 = 1800100;
    const OTHER_ACCOUNT: &str = "synthetic-other-account";
    const OTHER_DEVICE: &str = "synthetic-other-device";
    let mut cache = ClientTokenCache::default();
    cache.remember(identity_value(), ClientTokenGrant { token: TOKEN.to_owned(), refresh_after_seconds: REFRESH_SECONDS as u64 }, NOW_MILLISECONDS).unwrap();
    assert_eq!(cache.read(&identity_value(), BEFORE_REFRESH_MILLISECONDS), Some(TOKEN));
    assert!(cache.read(&identity_value(), AT_REFRESH_MILLISECONDS).is_none());
    let mut other = identity_value(); other.account_identifier = OTHER_ACCOUNT.to_owned();
    assert!(cache.read(&other, NOW_MILLISECONDS).is_none());
    other = identity_value(); other.device_identifier = OTHER_DEVICE.to_owned();
    assert!(cache.read(&other, NOW_MILLISECONDS).is_none());
    other = identity_value(); other.client_identifier = OTHER_ACCOUNT.to_owned();
    assert!(cache.read(&other, NOW_MILLISECONDS).is_none());
    other = identity_value(); other.client_token_client_identifier = OTHER_ACCOUNT.to_owned();
    assert!(cache.read(&other, NOW_MILLISECONDS).is_none());
    cache.clear(); assert!(cache.read(&identity_value(), NOW_MILLISECONDS).is_none());
}

#[tokio::test]
async fn malformed_expiry_or_empty_grants_cannot_enter_the_client_token_cache() {
    const INVALID_LIFETIME_SECONDS: i32 = 0;
    for invalid_expiry in [true, false] {
        let mut response = ClientTokenResponse::parse_from_bytes(&granted()).unwrap();
        if invalid_expiry { response.mut_granted_token().expires_after_seconds = INVALID_LIFETIME_SECONDS; }
        else { response.mut_granted_token().token = EMPTY_TEXT.to_owned(); }
        let mut exchange = Exchange::new(vec![Ok(response.write_to_bytes().unwrap())]);
        assert!(matches!(obtain_client_token(&mut exchange, &identity_value(), android_platform()).await, Err(Failure::InvalidResponse)));
        assert_eq!(exchange.requests.len(), ONE_CALL);
    }
}

#[tokio::test]
async fn long_protocol_grants_are_accepted_while_local_cache_retention_is_limited_to_one_day() {
    use streaming_spotify_session::connect_client_token::ClientTokenCache;
    const LONG_EXPIRES_SECONDS: i32 = 1216800;
    const LONG_REFRESH_SECONDS: i32 = 1209600;
    const NOW_MILLISECONDS: u64 = 100;
    const BEFORE_CACHE_LIMIT_MILLISECONDS: u64 = 86400099;
    const AT_CACHE_LIMIT_MILLISECONDS: u64 = 86400100;
    let mut response = ClientTokenResponse::parse_from_bytes(&granted()).unwrap();
    response.mut_granted_token().expires_after_seconds = LONG_EXPIRES_SECONDS;
    response.mut_granted_token().refresh_after_seconds = LONG_REFRESH_SECONDS;
    let mut exchange = Exchange::new(vec![Ok(response.write_to_bytes().unwrap())]);
    let grant = obtain_client_token(&mut exchange, &identity_value(), android_platform()).await.unwrap();
    let mut cache = ClientTokenCache::default(); cache.remember(identity_value(), grant, NOW_MILLISECONDS).unwrap();
    assert_eq!(cache.read(&identity_value(), BEFORE_CACHE_LIMIT_MILLISECONDS), Some(TOKEN));
    assert!(cache.read(&identity_value(), AT_CACHE_LIMIT_MILLISECONDS).is_none());
}

#[tokio::test]
async fn scope_replacement_while_hashcash_is_solving_prevents_the_answer_request() {
    let mut exchange = Exchange::new(vec![Ok(challenge(ChallengeType::CHALLENGE_HASH_CASH, DIFFICULTY))]); exchange.retire_after_solution = true;
    assert!(matches!(obtain_client_token(&mut exchange, &identity_value(), android_platform()).await, Err(Failure::Superseded)));
    assert_eq!(exchange.requests.len(), ONE_CALL); assert_eq!(exchange.solutions, ONE_CALL);
}
