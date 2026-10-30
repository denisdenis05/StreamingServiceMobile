use std::future::Future;

use serde_json::Value;
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

use crate::{connect_activation::{ConnectExplicitActivation, ConnectActivationPlayerReadiness}, connect_search::{ConnectSearchInput, ConnectSearchOperations, ConnectSearchTrack}, connect_membership::ConnectMembershipReading, connect_commands::ConnectCommand, connect_metadata::{ConnectMetadataOperations, ConnectTrackMetadata},
    connect_publication::ConnectPublicationSnapshot, connect_receipts::ConnectCommandAcknowledgement,
    connect_session::{ConnectFailureStage, ConnectSessionOperations, RegistrationVerification},
    connect_transport::{native_monotonic_milliseconds, ConnectReading}, connect_wire::ConnectCluster, model::Failure};

pub(crate) const HTTP_CHANNEL_CAPACITY: usize = 1;
const OWNED_RESPONSE_MESSAGE: &str = "HTTP response sender remains owned until completion";

pub(crate) struct PendingHttpResponse<Response> {
    sender: Option<oneshot::Sender<Result<Response, Failure>>>,
    retirement_failure: Failure,
}

impl<Response> PendingHttpResponse<Response> {
    pub(crate) fn new(sender: oneshot::Sender<Result<Response, Failure>>) -> Self { Self { sender: Some(sender), retirement_failure: Failure::Canceled } }
    pub(crate) fn is_closed(&self) -> bool { self.sender.as_ref().is_none_or(|sender| sender.is_closed()) }
    pub(crate) fn mark_dispatched(&mut self) { self.retirement_failure = Failure::UnknownOutcome; }
    pub(crate) fn complete(mut self, response: Result<Response, Failure>) { if let Some(sender) = self.sender.take() { let _ = sender.send(response); } }
    pub(crate) fn into_sender(mut self) -> oneshot::Sender<Result<Response, Failure>> { self.sender.take().expect(OWNED_RESPONSE_MESSAGE) }
}

impl<Response> Drop for PendingHttpResponse<Response> {
    fn drop(&mut self) { if let Some(sender) = self.sender.take() { let _ = sender.send(Err(self.retirement_failure)); } }
}

pub(crate) struct CheckedHttpCommand {
    pub(crate) request_identifier: String,
    pub(crate) target_device_identifier: String,
    pub(crate) command: ConnectCommand,
    pub(crate) cancellation: CancellationToken,
    pub(crate) response: PendingHttpResponse<ConnectCommandAcknowledgement>,
}

pub(crate) enum HttpWork {
    Register { connection_identifier: String },
    Search { input: ConnectSearchInput, cancellation: CancellationToken, response: PendingHttpResponse<Vec<ConnectSearchTrack>> },
    Metadata { identifiers: Vec<String>, response: PendingHttpResponse<Vec<ConnectTrackMetadata>> },
    Read { response: PendingHttpResponse<ConnectReading> },
    Membership { response: PendingHttpResponse<ConnectMembershipReading> },
    Refresh { response: PendingHttpResponse<ConnectCluster> },
    Command { target_device_identifier: String, body: Value, response: PendingHttpResponse<()> },
    CheckedPreflight { command: CheckedHttpCommand },
    CheckedMutation { command: CheckedHttpCommand, body: Value },
    Activate { snapshot: ConnectPublicationSnapshot, activation: ConnectExplicitActivation, readiness: ConnectActivationPlayerReadiness,
        cluster: ConnectCluster, generation: u64, cancellation: CancellationToken, response: PendingHttpResponse<ConnectCluster> },
    Publish { snapshot: ConnectPublicationSnapshot, cancellation: CancellationToken, response: PendingHttpResponse<ConnectCluster> },
}

pub(crate) enum HttpCompletion {
    Registered { cluster: Result<ConnectCluster, Failure> },
    Search { result: Result<Vec<ConnectSearchTrack>, Failure>, response: PendingHttpResponse<Vec<ConnectSearchTrack>> },
    Metadata { result: Result<Vec<ConnectTrackMetadata>, Failure>, response: PendingHttpResponse<Vec<ConnectTrackMetadata>> },
    Read { result: Result<ConnectReading, Failure>, response: PendingHttpResponse<ConnectReading> },
    Membership { result: Result<ConnectMembershipReading, Failure>, response: PendingHttpResponse<ConnectMembershipReading> },
    Refreshed { result: Result<ConnectCluster, Failure>, response: PendingHttpResponse<ConnectCluster> },
    Command { result: Result<(), Failure>, response: PendingHttpResponse<()> },
    Prepared { result: Result<(Value, ConnectCluster), Failure>, command: CheckedHttpCommand },
    CheckedMutation { result: Result<ConnectCommandAcknowledgement, Failure>, command: CheckedHttpCommand },
    Activated { result: Result<ConnectCluster, Failure>, response: PendingHttpResponse<ConnectCluster> },
    Published { result: Result<ConnectCluster, Failure>, response: PendingHttpResponse<ConnectCluster> },
}

pub(crate) struct CompletedHttpWork {
    pub(crate) completion: HttpCompletion,
    pub(crate) failure_stage: ConnectFailureStage,
    pub(crate) verification: RegistrationVerification,
}

async fn execute<Response>(operation: impl Future<Output = Result<Response, Failure>>, cancellation: &CancellationToken,
    operation_cancellation: &CancellationToken, mutation: bool) -> Result<Response, Failure> {
    tokio::select! { biased;
        _ = cancellation.cancelled() => Err(if mutation { Failure::UnknownOutcome } else { Failure::Canceled }),
        _ = operation_cancellation.cancelled() => Err(if mutation { Failure::UnknownOutcome } else { Failure::Canceled }),
        response = operation => response,
    }
}

async fn perform_work(session: &mut (impl ConnectSessionOperations + ConnectMetadataOperations + ConnectSearchOperations), work: HttpWork, cancellation: &CancellationToken) -> HttpCompletion {
    match work {
        HttpWork::Register { connection_identifier } => HttpCompletion::Registered {
            cluster: execute(session.register(connection_identifier), cancellation, cancellation, false).await },
        HttpWork::Search { input, cancellation: search_cancellation, response } => {
            let result = if response.is_closed() || search_cancellation.is_cancelled() { Err(Failure::Canceled) } else {
                execute(session.search(input), cancellation, &search_cancellation, false).await
            };
            HttpCompletion::Search { result, response }
        },
        HttpWork::Metadata { identifiers, response } => {
            let result = if response.is_closed() { Err(Failure::Canceled) } else { execute(session.metadata(identifiers), cancellation, cancellation, false).await };
            HttpCompletion::Metadata { result, response }
        },
        HttpWork::Membership { response } => {
            let account_identifier = session.account_identifier();
            let result = if response.is_closed() { Err(Failure::Canceled) } else {
                execute(session.current_membership(), cancellation, cancellation, false).await.map(|membership| ConnectMembershipReading { account_identifier, membership })
            };
            HttpCompletion::Membership { result, response }
        },
        HttpWork::Read { response } => {
            let started = native_monotonic_milliseconds();
            let result = if response.is_closed() { Err(Failure::Canceled) } else { execute(session.refresh(), cancellation, cancellation, false).await };
            let completed = native_monotonic_milliseconds();
            HttpCompletion::Read { result: result.map(|cluster| ConnectReading { request_started_native_monotonic_milliseconds: started,
                request_completed_native_monotonic_milliseconds: completed, cluster }), response }
        },
        HttpWork::Refresh { response } => {
            let result = if response.is_closed() { Err(Failure::Canceled) } else { execute(session.refresh(), cancellation, cancellation, false).await };
            HttpCompletion::Refreshed { result, response }
        },
        HttpWork::Command { target_device_identifier, body, mut response } => {
            let result = if response.is_closed() || cancellation.is_cancelled() { Err(Failure::Canceled) } else {
                response.mark_dispatched(); execute(session.command(&target_device_identifier, body), cancellation, cancellation, true).await.map(|_| ())
            };
            HttpCompletion::Command { result, response }
        },
        HttpWork::CheckedPreflight { command } => {
            let result = if command.response.is_closed() || command.cancellation.is_cancelled() { Err(Failure::Canceled) } else {
                execute(session.refresh(), cancellation, &command.cancellation, false).await.and_then(|cluster| {
                    command.command.prepare(&command.request_identifier, &command.target_device_identifier, &cluster).map(|body| (body, cluster))
                })
            };
            HttpCompletion::Prepared { result, command }
        },
        HttpWork::CheckedMutation { mut command, body } => {
            let result = if command.response.is_closed() || command.cancellation.is_cancelled() || cancellation.is_cancelled() { Err(Failure::Canceled) } else {
                command.response.mark_dispatched();
                execute(session.command(&command.target_device_identifier, body), cancellation, &command.cancellation, true).await
            };
            HttpCompletion::CheckedMutation { result, command }
        },
        HttpWork::Activate { snapshot, activation, readiness, cluster, generation, cancellation: activation_cancellation, mut response } => {
            let result = if response.is_closed() || activation_cancellation.is_cancelled() || cancellation.is_cancelled() { Err(Failure::Canceled) } else {
                response.mark_dispatched();
                execute(session.activate(snapshot, activation, readiness, cluster, generation), cancellation, &activation_cancellation, true).await
            };
            HttpCompletion::Activated { result, response }
        },
        HttpWork::Publish { snapshot, cancellation: publication_cancellation, mut response } => {
            let result = if response.is_closed() || publication_cancellation.is_cancelled() || cancellation.is_cancelled() { Err(Failure::Canceled) } else {
                response.mark_dispatched(); execute(session.publish(snapshot), cancellation, &publication_cancellation, true).await
            };
            HttpCompletion::Published { result, response }
        },
    }
}

pub(crate) async fn run_http_worker(session: &mut (impl ConnectSessionOperations + ConnectMetadataOperations + ConnectSearchOperations), mut work: mpsc::Receiver<HttpWork>,
    completions: mpsc::Sender<CompletedHttpWork>, cancellation: CancellationToken) {
    loop {
        let work = tokio::select! { biased; _ = cancellation.cancelled() => return, work = work.recv() => match work { Some(work) => work, None => return } };
        let completion = perform_work(session, work, &cancellation).await;
        if cancellation.is_cancelled() { return; }
        let completed = CompletedHttpWork { completion, failure_stage: session.failure_stage(), verification: session.registration_verification() };
        tokio::select! { biased; _ = cancellation.cancelled() => return, sent = completions.send(completed) => if sent.is_err() { return; } }
    }
}
