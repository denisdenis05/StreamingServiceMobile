use std::{collections::{HashMap, VecDeque}, sync::{Arc, OnceLock, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant as MonotonicInstant}};

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::Value;
use tokio::{io::{AsyncRead, AsyncWrite}, sync::{mpsc, oneshot}, time::Instant as DeadlineInstant};
use tokio_tungstenite::{connect_async_with_config, WebSocketStream,
    tungstenite::{self, protocol::WebSocketConfig, Message}};
use tokio_util::sync::CancellationToken;

use crate::{connect_activation::{ConnectActivationDispatchGuard, ConnectExplicitActivation, ConnectActivationPlayerReadiness}, connect_search::{ConnectSearchInput, ConnectSearchOperations, ConnectSearchTrack}, connect_membership::ConnectMembershipReading, connect_http_worker::{run_http_worker, CheckedHttpCommand, CompletedHttpWork, HttpCompletion, HttpWork, PendingHttpResponse, HTTP_CHANNEL_CAPACITY}, connect_publication::{ConnectPublicationSnapshot, ConnectPublicationOrder}, connect_command_journal::ConnectCommandJournal, connect_receipts::ConnectCommandAcknowledgement, connect_metadata::{ConnectMetadataOperations, ConnectTrackMetadata}, connect_device::ConnectDeviceConfiguration, connect_session::{ConnectFailureStage, ConnectSessionOperations, NativeConnectSession, RegistrationVerification},
    connect_wire::{decode_dealer_input, ConnectCluster, DealerInput, MAXIMUM_FRAME_BYTES}, connect_commands::ConnectCommand, model::Failure};

const CONNECT_TIMEOUT_SECONDS: u64 = 15;
const PING_INTERVAL_SECONDS: u64 = 30;
const PONG_TIMEOUT_SECONDS: u64 = 5;
const EVENT_BACKPRESSURE_MILLISECONDS: u64 = 500;
const COMMAND_ACKNOWLEDGEMENT_SECONDS: u64 = 10;
const HOUSEKEEPING_INTERVAL_MILLISECONDS: u64 = 500;
const RECONNECT_DELAY_SECONDS: u64 = 5;
const CLEANUP_TIMEOUT_SECONDS: u64 = 5;
const MAXIMUM_PENDING_REQUESTS: usize = 16;
const MAXIMUM_COMPLETED_REPLIES: usize = 32;
const SOCKET_CHANNEL_CAPACITY: usize = 32;
const INITIAL_GENERATION: u64 = 0;
const GENERATION_INCREMENT: u64 = 1;
const MAXIMUM_SAFE_JAVASCRIPT_INTEGER: u64 = 9007199254740991;
const REPLY_KIND: &str = "reply";
const UNAUTHORIZED_STATUS: u16 = 401;
const FORBIDDEN_STATUS: u16 = 403;
static CLOCK_ORIGIN: OnceLock<MonotonicInstant> = OnceLock::new();

type ActionResult<Response> = oneshot::Sender<Result<Response, Failure>>;

pub struct OutgoingFrame {
    pub message: Message,
    pub receipt: Option<ActionResult<()>>,
}

pub enum ConnectAction {
    Deactivate { generation: u64, snapshot: ConnectPublicationSnapshot, cancellation: CancellationToken, result: ActionResult<ConnectCluster> },
    HostIdentity { generation: u64, result: ActionResult<ConnectHostIdentity> },
    Activate { generation: u64, snapshot: ConnectPublicationSnapshot, activation: ConnectExplicitActivation,
        readiness: ConnectActivationPlayerReadiness, activation_cancellation: CancellationToken, result: ActionResult<ConnectCluster> },
    Publish { generation: u64, snapshot: ConnectPublicationSnapshot, publication_cancellation: CancellationToken, result: ActionResult<ConnectCluster> },
    InspectFailure { generation: u64, result: ActionResult<ConnectFailureStage> },
    Refresh { generation: u64, result: ActionResult<ConnectCluster> },
    Search { generation: u64, input: ConnectSearchInput, search_cancellation: CancellationToken, result: ActionResult<Vec<ConnectSearchTrack>> },
    Metadata { generation: u64, identifiers: Vec<String>, result: ActionResult<Vec<ConnectTrackMetadata>> },
    Read { generation: u64, result: ActionResult<ConnectReading> },
    Membership { generation: u64, result: ActionResult<ConnectMembershipReading> },
    Command { generation: u64, target_device_identifier: String, body: Value, result: ActionResult<()> },
    CheckedCommand { generation: u64, request_identifier: String, target_device_identifier: String, command: ConnectCommand,
        command_cancellation: CancellationToken, result: ActionResult<ConnectCommandAcknowledgement> },
    Reply { generation: u64, key: String, accepted: bool, result: ActionResult<()> },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectHostIdentity {
    pub device_identifier: String,
    pub session_identifier: String,
    pub next_publication_sequence: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectReading {
    pub request_started_native_monotonic_milliseconds: u64,
    pub request_completed_native_monotonic_milliseconds: u64,
    pub cluster: ConnectCluster,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ConnectEventData {
    Connecting,
    Registered { account_identifier: String, device_identifier: String, verification_source: RegistrationVerification, cluster: ConnectCluster },
    Cluster { cluster: ConnectCluster },
    Membership { update: Value },
    SessionMessage { message: Value },
    Command { key: String, request: Value },
    Reconnecting { failure: &'static str, stage: ConnectFailureStage },
    Stopped { cleanup_failure: Option<&'static str> },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectEvent {
    pub generation: u64,
    pub observed_monotonic_milliseconds: u64,
    pub data: ConnectEventData,
}

#[derive(Serialize)]
struct DealerReply<'request> {
    #[serde(rename = "type")]
    kind: &'static str,
    key: &'request str,
    payload: ReplyPayload,
}

#[derive(Serialize)]
struct ReplyPayload { success: bool }

struct PendingRequest { request: Value, deadline: DeadlineInstant }
struct CompletedReply { key: String, request: Value, accepted: bool }

pub fn native_monotonic_milliseconds() -> u64 {
    u64::try_from(CLOCK_ORIGIN.get_or_init(MonotonicInstant::now).elapsed().as_millis()).unwrap_or(MAXIMUM_SAFE_JAVASCRIPT_INTEGER)
}

fn socket_failure(failure: tungstenite::Error) -> Failure {
    if let tungstenite::Error::Http(response) = failure {
        match response.status().as_u16() {
            UNAUTHORIZED_STATUS => Failure::Unauthorized,
            FORBIDDEN_STATUS => Failure::Forbidden,
            _ => Failure::Network,
        }
    } else { Failure::Network }
}

async fn emit(events: &mpsc::Sender<ConnectEvent>, generation: u64, data: ConnectEventData,
    cancellation: &CancellationToken) -> Result<(), Failure> {
    let event = ConnectEvent { generation, observed_monotonic_milliseconds: native_monotonic_milliseconds(), data };
    tokio::select! {
        biased;
        _ = cancellation.cancelled() => Err(Failure::Canceled),
        result = tokio::time::timeout(Duration::from_millis(EVENT_BACKPRESSURE_MILLISECONDS), events.send(event)) => {
            result.map_err(|_| Failure::Backpressure)?.map_err(|_| Failure::Canceled)
        }
    }
}

async fn send(socket: &mpsc::Sender<OutgoingFrame>, message: Message) -> Result<(), Failure> {
    let (receipt, result) = oneshot::channel();
    tokio::time::timeout(Duration::from_millis(EVENT_BACKPRESSURE_MILLISECONDS),
        socket.send(OutgoingFrame { message, receipt: Some(receipt) })).await
        .map_err(|_| Failure::Backpressure)?.map_err(|_| Failure::Network)?;
    tokio::time::timeout(Duration::from_secs(CONNECT_TIMEOUT_SECONDS), result).await.map_err(|_| Failure::Deadline)?
        .map_err(|_| Failure::Network)?
}

async fn reply(socket: &mpsc::Sender<OutgoingFrame>, key: &str, accepted: bool) -> Result<(), Failure> {
    let message = serde_json::to_string(&DealerReply { kind: REPLY_KIND, key, payload: ReplyPayload { success: accepted } })
        .map_err(|_| Failure::InvalidResponse)?;
    send(socket, Message::Text(message.into())).await
}

fn retire_action(action: ConnectAction) {
    match action {
        ConnectAction::CheckedCommand { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
        ConnectAction::InspectFailure { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
        ConnectAction::Search { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
        ConnectAction::Metadata { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
        ConnectAction::Membership { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
        ConnectAction::Read { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
        ConnectAction::Deactivate { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
        ConnectAction::HostIdentity { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
        ConnectAction::Activate { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
        ConnectAction::Publish { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
        ConnectAction::Refresh { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
        ConnectAction::Command { result, .. } | ConnectAction::Reply { result, .. } => { let _ = result.send(Err(Failure::Canceled)); },
    }
}

struct ConnectActorIdentity {
    device_identifier: String,
    account_identifier: String,
    playback_session_identifier: Option<String>,
}

struct ConnectActorAuthority {
    device_identifier: String,
    current_host: Option<String>,
    timestamp: (i64, i64),
    publication_retired: bool,
}

impl ConnectActorAuthority {
    fn new(device_identifier: String) -> Self { Self { device_identifier, current_host: None, timestamp: (i64::MIN, i64::MIN), publication_retired: false } }

    fn observe(&mut self, cluster: &ConnectCluster) {
        let timestamp = (cluster.server_at_milliseconds, cluster.changed_at_milliseconds);
        if timestamp < self.timestamp { return; }
        self.publication_retired |= self.current_host.as_deref() == Some(self.device_identifier.as_str()) && cluster.active_device_identifier != self.device_identifier;
        self.current_host = Some(cluster.active_device_identifier.clone());
        self.timestamp = timestamp;
    }

    fn permits_publication(&self) -> bool { !self.publication_retired && self.current_host.as_deref() == Some(self.device_identifier.as_str()) }

    fn supersedes_preflight(&self, target_device_identifier: &str, cluster: &ConnectCluster) -> bool {
        self.timestamp > (cluster.server_at_milliseconds, cluster.changed_at_milliseconds)
            && self.current_host.as_deref() != Some(target_device_identifier)
    }
}

fn http_action_failure(expected_generation: u64, generation: u64, registered: bool, busy: bool, canceled: bool) -> Option<Failure> {
    if expected_generation != generation || !registered || canceled { Some(Failure::Canceled) }
    else if busy { Some(Failure::Backpressure) } else { None }
}

fn submit_http_work(work: &mpsc::Sender<HttpWork>, operation: HttpWork) -> Result<(), Failure> {
    work.try_send(operation).map_err(|failure| match failure {
        mpsc::error::TrySendError::Full(_) => Failure::Backpressure,
        mpsc::error::TrySendError::Closed(_) => Failure::Canceled,
    })
}

async fn process_actor_events(identity: ConnectActorIdentity, initial_failure_stage: ConnectFailureStage,
    incoming: &mut mpsc::Receiver<DealerInput>, socket: &mpsc::Sender<OutgoingFrame>, generation: u64,
    events: &mpsc::Sender<ConnectEvent>, actions: &mut mpsc::Receiver<ConnectAction>,
    work: mpsc::Sender<HttpWork>, mut completions: mpsc::Receiver<CompletedHttpWork>, cancellation: &CancellationToken) -> Result<(), Failure> {
    let mut registered = false;
    let mut busy = false;
    let mut failure_stage = initial_failure_stage;
    let mut activation_previous_host: Option<String> = None;
    let mut activation_guard = ConnectActivationDispatchGuard::default();
    let mut latest_reading: Option<ConnectReading> = None;
    let mut publication_order = ConnectPublicationOrder::default();
    let mut authority = ConnectActorAuthority::new(identity.device_identifier.clone());
    let mut housekeeping = tokio::time::interval(Duration::from_millis(HOUSEKEEPING_INTERVAL_MILLISECONDS));
    let mut pending = HashMap::<String, PendingRequest>::new();
    let mut completed = VecDeque::<CompletedReply>::new();
    let mut outgoing_commands = ConnectCommandJournal::default();
    loop {
        if cancellation.is_cancelled() { return Err(Failure::Canceled); }
        tokio::select! { biased;
            _ = cancellation.cancelled() => return Err(Failure::Canceled),
            completion = completions.recv(), if busy => {
                let completion = completion.ok_or(Failure::Canceled)?;
                busy = false;
                failure_stage = completion.failure_stage;
                match completion.completion {
                    HttpCompletion::Registered { cluster } => {
                        let cluster = cluster?;
                        authority.observe(&cluster); registered = true;
                        emit(events, generation, ConnectEventData::Registered { account_identifier: identity.account_identifier.clone(),
                            device_identifier: identity.device_identifier.clone(), verification_source: completion.verification, cluster }, cancellation).await?;
                    },
                    HttpCompletion::Search { result, response } => response.complete(result),
                    HttpCompletion::Metadata { result, response } => response.complete(result),
                    HttpCompletion::Membership { result, response } => response.complete(result),
                    HttpCompletion::Read { result, response } => {
                        if let Ok(reading) = &result { authority.observe(&reading.cluster); latest_reading = Some(reading.clone()); }
                        response.complete(result);
                    },
                    HttpCompletion::Refreshed { result, response } => {
                        if let Ok(cluster) = &result { authority.observe(cluster); emit(events, generation, ConnectEventData::Cluster { cluster: cluster.clone() }, cancellation).await?; }
                        response.complete(result);
                    },
                    HttpCompletion::Command { result, response } => response.complete(result),
                    HttpCompletion::Activated { mut result, response } => {
                        if result.as_ref().is_ok_and(|cluster| cluster.active_device_identifier != identity.device_identifier) { result = Err(Failure::UnknownOutcome); }
                        let expected_host = activation_previous_host.take();
                        if authority.current_host != expected_host && authority.current_host.as_deref() != Some(identity.device_identifier.as_str()) {
                            result = Err(Failure::UnknownOutcome);
                        }
                        if let Ok(cluster) = &result { authority.observe(cluster); authority.publication_retired = false; }
                        response.complete(result);
                    },
                    HttpCompletion::Deactivated { mut result, response } => {
                        if result.as_ref().is_ok_and(|cluster| cluster.active_device_identifier == identity.device_identifier
                            || authority.current_host.as_deref() == Some(identity.device_identifier.as_str())
                                && authority.timestamp > (cluster.server_at_milliseconds, cluster.changed_at_milliseconds)) { result = Err(Failure::UnknownOutcome); }
                        if let Ok(cluster) = &result { authority.observe(cluster); activation_guard.complete_deactivation(); }
                        response.complete(result);
                    },
                    HttpCompletion::Published { result, response } => {
                        if let Ok(cluster) = &result { authority.observe(cluster); }
                        response.complete(result);
                    },
                    HttpCompletion::Prepared { result, command } => {
                        let (body, cluster) = match result { Ok(prepared) => prepared, Err(failure) => { command.response.complete(Err(failure)); continue; } };
                        if authority.supersedes_preflight(&command.target_device_identifier, &cluster) { command.response.complete(Err(Failure::Superseded)); continue; }
                        let minimum_server_at_milliseconds = cluster.server_at_milliseconds;
                        authority.observe(&cluster);
                        emit(events, generation, ConnectEventData::Cluster { cluster }, cancellation).await?;
                        if command.response.is_closed() || command.cancellation.is_cancelled() || cancellation.is_cancelled() { command.response.complete(Err(Failure::Canceled)); continue; }
                        if let Err(failure) = outgoing_commands.begin_dispatch(command.target_device_identifier.clone(), minimum_server_at_milliseconds, native_monotonic_milliseconds()) {
                            command.response.complete(Err(failure)); continue;
                        }
                        submit_http_work(&work, HttpWork::CheckedMutation { command, body })?; busy = true;
                    },
                    HttpCompletion::CheckedMutation { result, command } => {
                        let response = command.response.into_sender();
                        match result {
                            Ok(acknowledgement) => outgoing_commands.accept_dispatched(acknowledgement, command.cancellation, response),
                            Err(failure) => { outgoing_commands.abort_dispatch(); let _ = response.send(Err(failure)); },
                        }
                    },
                }
            },
            input = incoming.recv() => {
                let input = input.ok_or(Failure::Network)?;
                match input {
                    DealerInput::Connection(connection_identifier) => {
                        if busy { return Err(Failure::Backpressure); }
                        submit_http_work(&work, HttpWork::Register { connection_identifier })?; busy = true;
                    },
                    DealerInput::Cluster(cluster) if registered => {
                        authority.observe(&cluster);
                        outgoing_commands.observe(&cluster, native_monotonic_milliseconds());
                        emit(events, generation, ConnectEventData::Cluster { cluster }, cancellation).await?;
                    },
                    DealerInput::Membership(update) if registered => emit(events, generation, ConnectEventData::Membership { update }, cancellation).await?,
                    DealerInput::SessionMessage(message) if registered => emit(events, generation, ConnectEventData::SessionMessage { message }, cancellation).await?,
                    DealerInput::Command { key, request } => {
                        if let Some(previous) = completed.iter().find(|previous| previous.key == key) { reply(socket, &key, previous.accepted && previous.request == request).await?; continue; }
                        if let Some(previous) = pending.get(&key) { if previous.request != request { reply(socket, &key, false).await?; } continue; }
                        if !registered || pending.len() >= MAXIMUM_PENDING_REQUESTS { reply(socket, &key, false).await?; continue; }
                        pending.insert(key.clone(), PendingRequest { request: request.clone(), deadline: DeadlineInstant::now() + Duration::from_secs(COMMAND_ACKNOWLEDGEMENT_SECONDS) });
                        emit(events, generation, ConnectEventData::Command { key, request }, cancellation).await?;
                    },
                    DealerInput::RejectedCommand { key } => reply(socket, &key, false).await?,
                    _ => (),
                }
            },
            action = actions.recv() => {
                let action = action.ok_or(Failure::Canceled)?;
                match action {
                    ConnectAction::InspectFailure { generation: expected, result } => { let _ = result.send(if expected == generation { Ok(failure_stage) } else { Err(Failure::Canceled) }); },
                    ConnectAction::Reply { generation: expected, key, accepted, result } => {
                        if expected != generation || !registered { let _ = result.send(Err(Failure::Canceled)); continue; }
                        let Some(previous) = pending.remove(&key) else { let _ = result.send(Err(Failure::InvalidInput)); continue; };
                        let accepted = accepted && DeadlineInstant::now() < previous.deadline;
                        let receipt = reply(socket, &key, accepted).await;
                        completed.push_back(CompletedReply { key, request: previous.request, accepted });
                        while completed.len() > MAXIMUM_COMPLETED_REPLIES { completed.pop_front(); }
                        let _ = result.send(receipt);
                    },
                    ConnectAction::Membership { generation: expected, result } => {
                        if result.is_closed() { continue; }
                        if let Some(failure) = http_action_failure(expected, generation, registered, busy, cancellation.is_cancelled()) { let _ = result.send(Err(failure)); continue; }
                        submit_http_work(&work, HttpWork::Membership { response: PendingHttpResponse::new(result) })?; busy = true;
                    },
                    ConnectAction::Search { generation: expected, input, search_cancellation, result } => {
                        if result.is_closed() { continue; }
                        if let Some(failure) = http_action_failure(expected, generation, registered, busy, cancellation.is_cancelled() || search_cancellation.is_cancelled()) { let _ = result.send(Err(failure)); continue; }
                        if let Err(failure) = input.validate() { let _ = result.send(Err(failure)); continue; }
                        submit_http_work(&work, HttpWork::Search { input, cancellation: search_cancellation, response: PendingHttpResponse::new(result) })?; busy = true;
                    },
                    ConnectAction::Metadata { generation: expected, identifiers, result } => {
                        if result.is_closed() { continue; }
                        if let Some(failure) = http_action_failure(expected, generation, registered, busy, cancellation.is_cancelled()) { let _ = result.send(Err(failure)); continue; }
                        submit_http_work(&work, HttpWork::Metadata { identifiers, response: PendingHttpResponse::new(result) })?; busy = true;
                    },
                    ConnectAction::Read { generation: expected, result } => {
                        if result.is_closed() { continue; }
                        if let Some(failure) = http_action_failure(expected, generation, registered, busy, cancellation.is_cancelled()) { let _ = result.send(Err(failure)); continue; }
                        submit_http_work(&work, HttpWork::Read { response: PendingHttpResponse::new(result) })?; busy = true;
                    },
                    ConnectAction::Refresh { generation: expected, result } => {
                        if result.is_closed() { continue; }
                        if let Some(failure) = http_action_failure(expected, generation, registered, busy, cancellation.is_cancelled()) { let _ = result.send(Err(failure)); continue; }
                        submit_http_work(&work, HttpWork::Refresh { response: PendingHttpResponse::new(result) })?; busy = true;
                    },
                    ConnectAction::Command { generation: expected, target_device_identifier, body, result } => {
                        if result.is_closed() { continue; }
                        if let Some(failure) = http_action_failure(expected, generation, registered, busy, cancellation.is_cancelled()) { let _ = result.send(Err(failure)); continue; }
                        submit_http_work(&work, HttpWork::Command { target_device_identifier, body, response: PendingHttpResponse::new(result) })?; busy = true;
                    },
                    ConnectAction::CheckedCommand { generation: expected, request_identifier, target_device_identifier, command, command_cancellation, result } => {
                        if result.is_closed() { continue; }
                        outgoing_commands.expire();
                        if let Some(failure) = http_action_failure(expected, generation, registered, busy, cancellation.is_cancelled() || command_cancellation.is_cancelled()) { let _ = result.send(Err(failure)); continue; }
                        if !outgoing_commands.has_capacity() { let _ = result.send(Err(Failure::Backpressure)); continue; }
                        if let Err(failure) = command.validate(&request_identifier, &target_device_identifier) { let _ = result.send(Err(failure)); continue; }
                        submit_http_work(&work, HttpWork::CheckedPreflight { command: CheckedHttpCommand { request_identifier, target_device_identifier, command,
                            cancellation: command_cancellation, response: PendingHttpResponse::new(result) } })?; busy = true;
                    },
                    ConnectAction::HostIdentity { generation: expected, result } => {
                        if let Some(failure) = http_action_failure(expected, generation, registered, false, cancellation.is_cancelled()) { let _ = result.send(Err(failure)); continue; }
                        let response = identity.playback_session_identifier.as_ref().ok_or(Failure::Unsupported).and_then(|session_identifier| {
                            publication_order.next_sequence().map(|next_publication_sequence| ConnectHostIdentity {
                                device_identifier: identity.device_identifier.clone(), session_identifier: session_identifier.clone(), next_publication_sequence
                            })
                        });
                        let _ = result.send(response);
                    },
                    ConnectAction::Activate { generation: expected, snapshot, activation, readiness, activation_cancellation, result } => {
                        if result.is_closed() { continue; }
                        if let Some(failure) = http_action_failure(expected, generation, registered, busy, cancellation.is_cancelled() || activation_cancellation.is_cancelled()) { let _ = result.send(Err(failure)); continue; }
                        let Some(reading) = latest_reading.as_ref() else { let _ = result.send(Err(Failure::Canceled)); continue; };
                        if snapshot.device_identifier != identity.device_identifier || identity.playback_session_identifier.as_deref() != Some(snapshot.session_identifier.as_str())
                            || activation.generation != generation || !readiness.playback_output_ready || !readiness.external_authority_absent
                            || activation.observation_started_native_monotonic_milliseconds != reading.request_started_native_monotonic_milliseconds
                            || activation.observation_completed_native_monotonic_milliseconds != reading.request_completed_native_monotonic_milliseconds
                            || activation.expected_previous_host_device_identifier != reading.cluster.active_device_identifier
                            || authority.supersedes_preflight(&activation.expected_previous_host_device_identifier, &reading.cluster) {
                            let _ = result.send(Err(Failure::Canceled)); continue;
                        }
                        if let Err(failure) = activation_guard.acquire(false).and_then(|_| publication_order.acquire(snapshot.sequence)) { let _ = result.send(Err(failure)); continue; }
                        activation_previous_host = Some(activation.expected_previous_host_device_identifier.clone());
                        submit_http_work(&work, HttpWork::Activate { snapshot, activation, readiness, cluster: reading.cluster.clone(), generation,
                            cancellation: activation_cancellation, response: PendingHttpResponse::new(result) })?; busy = true;
                    },
                    ConnectAction::Deactivate { generation: expected, snapshot, cancellation: deactivation_cancellation, result } => {
                        if result.is_closed() { continue; }
                        if let Some(failure) = http_action_failure(expected, generation, registered, busy, cancellation.is_cancelled() || deactivation_cancellation.is_cancelled()) { let _ = result.send(Err(failure)); continue; }
                        if snapshot.device_identifier != identity.device_identifier || identity.playback_session_identifier.as_deref() != Some(snapshot.session_identifier.as_str()) {
                            let _ = result.send(Err(Failure::Canceled)); continue;
                        }
                        if let Err(failure) = publication_order.acquire(snapshot.sequence) { let _ = result.send(Err(failure)); continue; }
                        submit_http_work(&work, HttpWork::Deactivate { snapshot, cancellation: deactivation_cancellation,
                            response: PendingHttpResponse::new(result) })?; busy = true;
                    },
                    ConnectAction::Publish { generation: expected, snapshot, publication_cancellation, result } => {
                        if result.is_closed() { continue; }
                        if let Some(failure) = http_action_failure(expected, generation, registered, busy, cancellation.is_cancelled() || publication_cancellation.is_cancelled()) { let _ = result.send(Err(failure)); continue; }
                        if snapshot.device_identifier != identity.device_identifier || identity.playback_session_identifier.as_deref() != Some(snapshot.session_identifier.as_str()) || !authority.permits_publication() {
                            let _ = result.send(Err(Failure::Canceled)); continue;
                        }
                        if let Err(failure) = publication_order.acquire(snapshot.sequence) { let _ = result.send(Err(failure)); continue; }
                        submit_http_work(&work, HttpWork::Publish { snapshot, cancellation: publication_cancellation, response: PendingHttpResponse::new(result) })?; busy = true;
                    },
                }
            },
            _ = housekeeping.tick() => {
                outgoing_commands.expire();
                let expired = pending.iter().filter(|(_, request)| DeadlineInstant::now() >= request.deadline).map(|(key, _)| key.clone()).collect::<Vec<_>>();
                for key in expired {
                    if let Some(previous) = pending.remove(&key) {
                        reply(socket, &key, false).await?;
                        completed.push_back(CompletedReply { key, request: previous.request, accepted: false });
                        while completed.len() > MAXIMUM_COMPLETED_REPLIES { completed.pop_front(); }
                    }
                }
            },
        }
    }
}

pub async fn process_connected_events(session: &mut (impl ConnectSessionOperations + ConnectMetadataOperations + ConnectSearchOperations), incoming: &mut mpsc::Receiver<DealerInput>, socket: &mpsc::Sender<OutgoingFrame>,
    generation: u64, events: &mpsc::Sender<ConnectEvent>, actions: &mut mpsc::Receiver<ConnectAction>, cancellation: &CancellationToken) -> Result<(), Failure> {
    let identity = ConnectActorIdentity { device_identifier: session.device_identifier().to_owned(), account_identifier: session.account_identifier(),
        playback_session_identifier: session.playback_session_identifier().map(str::to_owned) };
    let initial_failure_stage = session.failure_stage();
    let (work, operations) = mpsc::channel(HTTP_CHANNEL_CAPACITY);
    let (completions, completed) = mpsc::channel(HTTP_CHANNEL_CAPACITY);
    let worker_cancellation = cancellation.child_token();
    let worker = run_http_worker(session, operations, completions, worker_cancellation.clone());
    let actor = process_actor_events(identity, initial_failure_stage, incoming, socket, generation, events, actions, work, completed, cancellation);
    tokio::pin!(worker, actor);
    let result = tokio::select! { biased;
        result = &mut actor => result,
        _ = &mut worker => return Err(Failure::Canceled),
    };
    worker_cancellation.cancel();
    worker.await;
    result
}

pub async fn process_dealer_socket<Socket>(socket: WebSocketStream<Socket>, incoming: mpsc::Sender<DealerInput>,
    outgoing_sender: mpsc::Sender<OutgoingFrame>, mut outgoing: mpsc::Receiver<OutgoingFrame>, cancellation: CancellationToken) -> Result<(), Failure>
where Socket: AsyncRead + AsyncWrite + Unpin + Send + 'static {
    let (mut writer, mut reader) = socket.split();
    let pong_received = Arc::new(AtomicBool::new(true));
    let result = {
        let receiver_pong = Arc::clone(&pong_received);
        let receive = async {
            while let Some(frame) = reader.next().await {
                let input = match frame.map_err(socket_failure)? {
                    Message::Pong(_) => { receiver_pong.store(true, Ordering::Release); continue; },
                    Message::Ping(bytes) => {
                        outgoing_sender.try_send(OutgoingFrame { message: Message::Pong(bytes), receipt: None }).map_err(|_| Failure::Backpressure)?;
                        continue;
                    },
                    Message::Text(text) => decode_dealer_input(text.as_bytes())?,
                    Message::Binary(bytes) => decode_dealer_input(&bytes)?,
                    Message::Close(_) => return Err(Failure::Network),
                    _ => continue,
                };
                if matches!(input, DealerInput::Pong) { receiver_pong.store(true, Ordering::Release); continue; }
                incoming.try_send(input).map_err(|failure| match failure {
                    mpsc::error::TrySendError::Full(_) => Failure::Backpressure,
                    mpsc::error::TrySendError::Closed(_) => Failure::Canceled,
                })?;
            }
            Err(Failure::Network)
        };
        let transmit = async {
            let mut heartbeat = tokio::time::interval(Duration::from_secs(PING_INTERVAL_SECONDS));
            let mut pong_deadline: Option<DeadlineInstant> = None;
            loop {
                tokio::select! {
                    frame = outgoing.recv() => {
                        let frame = frame.ok_or(Failure::Canceled)?;
                        let result = tokio::time::timeout(Duration::from_secs(CONNECT_TIMEOUT_SECONDS), writer.send(frame.message)).await
                            .map_err(|_| Failure::Deadline)?.map_err(socket_failure);
                        if let Some(receipt) = frame.receipt { let _ = receipt.send(result); }
                        result?;
                    },
                    _ = heartbeat.tick() => {
                        pong_received.store(false, Ordering::Release);
                        tokio::time::timeout(Duration::from_secs(CONNECT_TIMEOUT_SECONDS), writer.send(Message::Ping(Vec::new().into()))).await
                            .map_err(|_| Failure::Deadline)?.map_err(socket_failure)?;
                        pong_deadline = Some(DeadlineInstant::now() + Duration::from_secs(PONG_TIMEOUT_SECONDS));
                    },
                    _ = tokio::time::sleep_until(pong_deadline.unwrap_or_else(DeadlineInstant::now)), if pong_deadline.is_some() => {
                        if !pong_received.load(Ordering::Acquire) { return Err(Failure::Deadline); }
                        pong_deadline = None;
                    },
                }
            }
        };
        tokio::select! {
            biased;
            _ = cancellation.cancelled() => Err(Failure::Canceled),
            result = receive => result,
            result = transmit => result,
        }
    };
    let _ = tokio::time::timeout(Duration::from_secs(CLEANUP_TIMEOUT_SECONDS), writer.close()).await;
    result
}

pub async fn run_connect_transport(serialized_credential: String, configuration: ConnectDeviceConfiguration,
    events: mpsc::Sender<ConnectEvent>, mut actions: mpsc::Receiver<ConnectAction>, cancellation: CancellationToken) {
    let mut generation = INITIAL_GENERATION;
    let mut last_cleanup_failure = None;
    loop {
        if cancellation.is_cancelled() { break; }
        generation = match generation.checked_add(GENERATION_INCREMENT).filter(|value| *value <= MAXIMUM_SAFE_JAVASCRIPT_INTEGER) {
            Some(generation) => generation,
            None => break,
        };
        if emit(&events, generation, ConnectEventData::Connecting, &cancellation).await.is_err() { break; }
        let restore = NativeConnectSession::restore(&serialized_credential, &configuration);
        let mut session = tokio::select! {
            biased;
            _ = cancellation.cancelled() => break,
            result = restore => match result {
                Ok(session) => session,
                Err(failure) => {
                    let _ = emit(&events, generation, ConnectEventData::Reconnecting { failure: failure.code(), stage: ConnectFailureStage::Restore }, &cancellation).await;
                    if matches!(failure, Failure::Unauthorized | Failure::Forbidden | Failure::InvalidInput | Failure::Unsupported) { break; }
                    tokio::select! { _ = cancellation.cancelled() => break, _ = tokio::time::sleep(Duration::from_secs(RECONNECT_DELAY_SECONDS)) => continue }
                },
            }
        };
        let result = async {
            let address = session.dealer_address().await?;
            session.failure_stage = ConnectFailureStage::DealerWebsocket;
            let websocket_configuration = WebSocketConfig::default().max_message_size(Some(MAXIMUM_FRAME_BYTES)).max_frame_size(Some(MAXIMUM_FRAME_BYTES));
            let (socket, _) = tokio::time::timeout(Duration::from_secs(CONNECT_TIMEOUT_SECONDS),
                connect_async_with_config(address.as_str(), Some(websocket_configuration), false)).await
                .map_err(|_| Failure::Deadline)?.map_err(socket_failure)?;
            session.failure_stage = ConnectFailureStage::DealerEvents;
            let (incoming_sender, mut incoming) = mpsc::channel(SOCKET_CHANNEL_CAPACITY);
            let (outgoing_sender, outgoing) = mpsc::channel(SOCKET_CHANNEL_CAPACITY);
            let socket_cancellation = cancellation.child_token();
            let socket_io = process_dealer_socket(socket, incoming_sender, outgoing_sender.clone(), outgoing, socket_cancellation.clone());
            tokio::pin!(socket_io);
            let (result, socket_finished) = tokio::select! {
                biased;
                _ = cancellation.cancelled() => (Err(Failure::Canceled), false),
                result = &mut socket_io => (result, true),
                result = process_connected_events(&mut session, &mut incoming, &outgoing_sender, generation, &events, &mut actions, &cancellation) => (result, false),
            };
            socket_cancellation.cancel();
            if !socket_finished { let _ = tokio::time::timeout(Duration::from_secs(CLEANUP_TIMEOUT_SECONDS), &mut socket_io).await; }
            result
        };
        let result = tokio::select! { biased; _ = cancellation.cancelled() => Err(Failure::Canceled), result = result => result };
        let cleanup = tokio::time::timeout(Duration::from_secs(CLEANUP_TIMEOUT_SECONDS), session.close()).await;
        let cleanup_failure = match cleanup { Ok(Ok(())) => None, Ok(Err(failure)) => Some(failure.code()), Err(_) => Some(Failure::Deadline.code()) };
        last_cleanup_failure = cleanup_failure;
        while let Ok(action) = actions.try_recv() { retire_action(action); }
        if cancellation.is_cancelled() || matches!(result, Err(Failure::Canceled)) {
            let _ = events.try_send(ConnectEvent { generation, observed_monotonic_milliseconds: native_monotonic_milliseconds(),
                data: ConnectEventData::Stopped { cleanup_failure } });
            return;
        }
        let failure = result.err().unwrap_or(Failure::Network);
        let _ = emit(&events, generation, ConnectEventData::Reconnecting { failure: failure.code(), stage: session.failure_stage }, &cancellation).await;
        if matches!(failure, Failure::Unauthorized | Failure::Forbidden | Failure::InvalidInput | Failure::Unsupported) { break; }
        tokio::select! { _ = cancellation.cancelled() => break, _ = tokio::time::sleep(Duration::from_secs(RECONNECT_DELAY_SECONDS)) => () }
    }
    while let Ok(action) = actions.try_recv() { retire_action(action); }
    let _ = events.try_send(ConnectEvent { generation, observed_monotonic_milliseconds: native_monotonic_milliseconds(),
        data: ConnectEventData::Stopped { cleanup_failure: last_cleanup_failure } });
}
