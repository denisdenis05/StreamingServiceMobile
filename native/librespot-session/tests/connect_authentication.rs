use std::{collections::VecDeque, future::pending, time::Duration};

use http::Method;
use streaming_spotify_session::{connect_authentication::{ConnectAuthenticatedDispatch, ConnectHttpRequest, ConnectRequestPurpose,
    execute_authenticated_request, SAFE_REQUEST_TIMEOUT_SECONDS}, model::Failure};

const ORIGINAL_TOKEN: &str = "synthetic-original-token";
const RENEWED_TOKEN: &str = "synthetic-renewed-token";
const REQUEST_PATH: &str = "/synthetic-safe-read";
const MEDIA_TYPE: &str = "application/synthetic";
const REQUEST_BODY: &[u8] = b"synthetic-request";
const RESPONSE_BODY: &[u8] = b"synthetic-response";
const NO_CALLS: usize = 0;
const SINGLE_CALL: usize = 1;
const TWO_CALLS: usize = 2;
const FIRST_POSITION: usize = 0;
const NEXT_POSITION: usize = 1;
const EXHAUSTED_TOKENS_MESSAGE: &str = "synthetic token sequence exhausted";
const EXHAUSTED_RESPONSES_MESSAGE: &str = "synthetic response sequence exhausted";

#[derive(PartialEq, Debug)]
struct DispatchRecord { method: Method, path: String, body: Vec<u8>, media_type: String, access_token: String }

struct Dispatch {
    tokens: VecDeque<Result<String, Failure>>,
    responses: VecDeque<Result<Vec<u8>, Failure>>,
    access_token_calls: usize,
    discarded_tokens: usize,
    records: Vec<DispatchRecord>,
    suspend_renewal: bool,
    supports_renewal: bool,
}

impl Dispatch {
    fn new(responses: Vec<Result<Vec<u8>, Failure>>) -> Self {
        Self { tokens: VecDeque::from([Ok(ORIGINAL_TOKEN.to_owned()), Ok(RENEWED_TOKEN.to_owned())]), responses: responses.into(),
            access_token_calls: NO_CALLS, discarded_tokens: NO_CALLS, records: Vec::new(), suspend_renewal: false, supports_renewal: true }
    }
}

impl ConnectAuthenticatedDispatch for Dispatch {
    fn supports_rejected_token_renewal(&self) -> bool { self.supports_renewal }
    async fn access_token(&mut self) -> Result<String, Failure> {
        self.access_token_calls += SINGLE_CALL;
        if self.suspend_renewal && self.access_token_calls == TWO_CALLS { return pending().await; }
        self.tokens.pop_front().expect(EXHAUSTED_TOKENS_MESSAGE)
    }
    fn discard_access_token(&mut self) { self.discarded_tokens += SINGLE_CALL; }
    async fn dispatch_once(&mut self, request: &ConnectHttpRequest, access_token: &str) -> Result<Vec<u8>, Failure> {
        self.records.push(DispatchRecord { method: request.method.clone(), path: request.path.clone(), body: request.body.clone(),
            media_type: request.media_type.to_owned(), access_token: access_token.to_owned() });
        self.responses.pop_front().expect(EXHAUSTED_RESPONSES_MESSAGE)
    }
}

fn request(purpose: ConnectRequestPurpose) -> ConnectHttpRequest {
    ConnectHttpRequest { method: Method::POST, path: REQUEST_PATH.to_owned(), body: REQUEST_BODY.to_vec(), media_type: MEDIA_TYPE, purpose }
}
fn success() -> Result<Vec<u8>, Failure> { Ok(RESPONSE_BODY.to_vec()) }

#[tokio::test]
async fn successful_reads_use_the_current_token_without_renewal_or_duplicate_dispatch() {
    let mut dispatch = Dispatch::new(vec![success()]);
    assert_eq!(execute_authenticated_request(&mut dispatch, &request(ConnectRequestPurpose::Metadata)).await, success());
    assert_eq!(dispatch.access_token_calls, SINGLE_CALL); assert_eq!(dispatch.discarded_tokens, NO_CALLS);
    assert_eq!(dispatch.records.len(), SINGLE_CALL);
}

#[tokio::test]
async fn unauthorized_observation_and_metadata_reads_renew_once_and_preserve_the_exact_request() {
    for purpose in [ConnectRequestPurpose::Observation, ConnectRequestPurpose::Metadata] {
        let mut dispatch = Dispatch::new(vec![Err(Failure::Unauthorized), success()]);
        assert_eq!(execute_authenticated_request(&mut dispatch, &request(purpose)).await, success());
        assert_eq!(dispatch.access_token_calls, TWO_CALLS); assert_eq!(dispatch.discarded_tokens, SINGLE_CALL);
        assert_eq!(dispatch.records.len(), TWO_CALLS);
        assert_eq!(dispatch.records[FIRST_POSITION].access_token, ORIGINAL_TOKEN);
        assert_eq!(dispatch.records[NEXT_POSITION].access_token, RENEWED_TOKEN);
        dispatch.records[FIRST_POSITION].access_token = RENEWED_TOKEN.to_owned();
        assert_eq!(dispatch.records[FIRST_POSITION], dispatch.records[NEXT_POSITION]);
    }
}

#[tokio::test]
async fn repeated_unauthorized_reads_stop_after_one_renewal_and_discard_the_second_rejected_token() {
    let mut dispatch = Dispatch::new(vec![Err(Failure::Unauthorized), Err(Failure::Unauthorized)]);
    assert_eq!(execute_authenticated_request(&mut dispatch, &request(ConnectRequestPurpose::Metadata)).await, Err(Failure::Unauthorized));
    assert_eq!(dispatch.access_token_calls, TWO_CALLS); assert_eq!(dispatch.discarded_tokens, TWO_CALLS);
    assert_eq!(dispatch.records.len(), TWO_CALLS);
}

#[tokio::test]
async fn rejected_mutations_and_removals_discard_the_token_without_automatically_repeating_the_operation() {
    assert!(ConnectRequestPurpose::Publication.is_mutation());
    for purpose in [ConnectRequestPurpose::Command, ConnectRequestPurpose::Removal, ConnectRequestPurpose::Publication] {
        let mut dispatch = Dispatch::new(vec![Err(Failure::Unauthorized)]);
        assert_eq!(execute_authenticated_request(&mut dispatch, &request(purpose)).await, Err(Failure::Unauthorized));
        assert_eq!(dispatch.access_token_calls, SINGLE_CALL); assert_eq!(dispatch.discarded_tokens, SINGLE_CALL);
        assert_eq!(dispatch.records.len(), SINGLE_CALL);
    }
}

#[tokio::test]
async fn permission_transport_and_uncertain_failures_are_never_token_renewal_triggers() {
    for failure in [Failure::Forbidden, Failure::Network, Failure::Deadline, Failure::Canceled, Failure::UnknownOutcome, Failure::Backpressure] {
        let mut dispatch = Dispatch::new(vec![Err(failure)]);
        assert_eq!(execute_authenticated_request(&mut dispatch, &request(ConnectRequestPurpose::Observation)).await, Err(failure));
        assert_eq!(dispatch.access_token_calls, SINGLE_CALL); assert_eq!(dispatch.discarded_tokens, NO_CALLS);
        assert_eq!(dispatch.records.len(), SINGLE_CALL);
    }
}

#[tokio::test]
async fn initial_authentication_failure_prevents_dispatch_and_does_not_start_another_authentication_attempt() {
    let mut dispatch = Dispatch::new(Vec::new()); dispatch.tokens = VecDeque::from([Err(Failure::Unauthorized)]);
    assert_eq!(execute_authenticated_request(&mut dispatch, &request(ConnectRequestPurpose::Metadata)).await, Err(Failure::Unauthorized));
    assert_eq!(dispatch.access_token_calls, SINGLE_CALL); assert_eq!(dispatch.discarded_tokens, NO_CALLS);
    assert!(dispatch.records.is_empty());
}

#[tokio::test]
async fn failed_renewal_preserves_its_failure_and_never_dispatches_with_an_invalid_token() {
    let mut dispatch = Dispatch::new(vec![Err(Failure::Unauthorized)]);
    dispatch.tokens = VecDeque::from([Ok(ORIGINAL_TOKEN.to_owned()), Err(Failure::Forbidden)]);
    assert_eq!(execute_authenticated_request(&mut dispatch, &request(ConnectRequestPurpose::Metadata)).await, Err(Failure::Forbidden));
    assert_eq!(dispatch.records.len(), SINGLE_CALL); assert_eq!(dispatch.discarded_tokens, SINGLE_CALL);
}

#[tokio::test(start_paused = true)]
async fn a_safe_read_deadline_bounds_the_combined_initial_dispatch_and_token_renewal() {
    let mut dispatch = Dispatch::new(vec![Err(Failure::Unauthorized)]); dispatch.suspend_renewal = true;
    let operation = tokio::spawn(async move { let response = execute_authenticated_request(&mut dispatch, &request(ConnectRequestPurpose::Metadata)).await; (response, dispatch) });
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(SAFE_REQUEST_TIMEOUT_SECONDS)).await;
    let (response, dispatch) = operation.await.unwrap();
    assert_eq!(response, Err(Failure::Deadline)); assert_eq!(dispatch.records.len(), SINGLE_CALL);
    assert_eq!(dispatch.discarded_tokens, SINGLE_CALL);
}

#[tokio::test]
async fn a_provider_without_rejected_token_invalidation_does_not_replay_with_the_same_cached_token() {
    let mut dispatch = Dispatch::new(vec![Err(Failure::Unauthorized)]); dispatch.supports_renewal = false;
    assert_eq!(execute_authenticated_request(&mut dispatch, &request(ConnectRequestPurpose::Metadata)).await, Err(Failure::Unauthorized));
    assert_eq!(dispatch.access_token_calls, SINGLE_CALL); assert_eq!(dispatch.discarded_tokens, SINGLE_CALL);
    assert_eq!(dispatch.records.len(), SINGLE_CALL);
}
