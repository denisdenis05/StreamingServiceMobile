use std::sync::{Arc, Mutex};

use librespot_protocol::{connect::Cluster, player::PlayerState};
use protobuf::{Message, MessageField};
use serde_json::{json, Value};
use streaming_spotify_session::{connect_metadata::{ConnectMetadataOperations, ConnectTrackMetadata}, connect_session::ConnectSessionOperations, connect_commands::ConnectCommand,
    connect_transport::{process_connected_events, ConnectAction, ConnectEvent, ConnectEventData, OutgoingFrame},
    connect_wire::{decode_cluster_snapshot, ConnectCluster, DealerInput}, model::Failure};
use tokio::{sync::{mpsc, oneshot}, task::JoinHandle};
use tokio_util::sync::CancellationToken;

const DEVICE: &str = "synthetic-device";
const ACCOUNT: &str = "synthetic-account";
const CONNECTION: &str = "synthetic-connection";
const TARGET: &str = "synthetic-host";
const KEY: &str = "synthetic-request";
const ENDPOINT_FIELD: &str = "endpoint";
const PAUSE: &str = "pause";
const RESUME: &str = "resume";
const PAYLOAD_FIELD: &str = "payload";
const SUCCESS_FIELD: &str = "success";
const CAPACITY: usize = 32;
const GENERATION: u64 = 7;
const STALE_GENERATION: u64 = 6;
const EMPTY_CALL_COUNT: usize = 0;
const ONE_CALL: usize = 1;
const FIRST_CALL: usize = 0;
const EXPIRATION_SECONDS: u64 = 11;
const REQUEST: &str = "synthetic-checked-command";
const OTHER_TARGET: &str = "replacement-host-device";
const COMMAND_FIELD: &str = "command";

#[derive(Default)]
struct Calls { connections: Vec<String>, commands: Vec<(String, Value)>, refreshes: usize, metadata_requests: Vec<Vec<String>> }

struct FakeSession {
    calls: Arc<Mutex<Calls>>, registration_failure: Option<Failure>, snapshot: Arc<Mutex<ConnectCluster>>,
    refresh_gate: Option<oneshot::Receiver<()>>, refresh_started: Option<oneshot::Sender<()>>,
    command_gate: Option<oneshot::Receiver<()>>, command_started: Option<oneshot::Sender<()>>,
}

fn cluster() -> ConnectCluster { decode_cluster_snapshot(&Cluster::new().write_to_bytes().unwrap()).unwrap() }

impl ConnectMetadataOperations for FakeSession {
    async fn metadata(&mut self, identifiers: Vec<String>) -> Result<Vec<ConnectTrackMetadata>, Failure> {
        self.calls.lock().unwrap().metadata_requests.push(identifiers); Err(Failure::Unsupported)
    }
}

impl ConnectSessionOperations for FakeSession {
    fn device_identifier(&self) -> &str { DEVICE }
    fn account_identifier(&self) -> String { ACCOUNT.to_owned() }
    async fn register(&mut self, connection_identifier: String) -> Result<ConnectCluster, Failure> {
        self.calls.lock().unwrap().connections.push(connection_identifier);
        if let Some(failure) = self.registration_failure.take() { Err(failure) } else { Ok(cluster()) }
    }
    async fn refresh(&mut self) -> Result<ConnectCluster, Failure> {
        self.calls.lock().unwrap().refreshes += ONE_CALL;
        if let Some(started) = self.refresh_started.take() { let _ = started.send(()); }
        if let Some(gate) = self.refresh_gate.take() { gate.await.map_err(|_| Failure::Network)?; }
        Ok(self.snapshot.lock().unwrap().clone())
    }
    async fn command(&mut self, target: &str, body: Value) -> Result<(), Failure> {
        self.calls.lock().unwrap().commands.push((target.to_owned(), body));
        if let Some(started) = self.command_started.take() { let _ = started.send(()); }
        if let Some(gate) = self.command_gate.take() { gate.await.map_err(|_| Failure::Network)?; }
        Ok(())
    }
}

struct Harness {
    calls: Arc<Mutex<Calls>>,
    snapshot: Arc<Mutex<ConnectCluster>>,
    incoming: mpsc::Sender<DealerInput>,
    actions: mpsc::Sender<ConnectAction>,
    events: mpsc::Receiver<ConnectEvent>,
    replies: mpsc::Receiver<Value>,
    cancellation: CancellationToken,
    actor: JoinHandle<Result<(), Failure>>,
    writer: JoinHandle<()>,
}

impl Harness {
    fn start(registration_failure: Option<Failure>) -> Self {
        Self::with_refresh(registration_failure, None, None)
    }

    fn with_refresh(registration_failure: Option<Failure>, refresh_gate: Option<oneshot::Receiver<()>>, refresh_started: Option<oneshot::Sender<()>>) -> Self {
        Self::with_gates(registration_failure, refresh_gate, refresh_started, None, None)
    }

    fn with_gates(registration_failure: Option<Failure>, refresh_gate: Option<oneshot::Receiver<()>>, refresh_started: Option<oneshot::Sender<()>>,
        command_gate: Option<oneshot::Receiver<()>>, command_started: Option<oneshot::Sender<()>>) -> Self {
        let calls = Arc::new(Mutex::new(Calls::default()));
        let snapshot = Arc::new(Mutex::new(cluster()));
        let mut session = FakeSession { calls: Arc::clone(&calls), registration_failure, snapshot: Arc::clone(&snapshot), refresh_gate, refresh_started, command_gate, command_started };
        let (incoming, mut inputs) = mpsc::channel(CAPACITY);
        let (actions, mut commands) = mpsc::channel(CAPACITY);
        let (events_sender, events) = mpsc::channel(CAPACITY);
        let (socket, mut outgoing) = mpsc::channel::<OutgoingFrame>(CAPACITY);
        let (reply_sender, replies) = mpsc::channel(CAPACITY);
        let cancellation = CancellationToken::new();
        let actor_cancellation = cancellation.clone();
        let actor = tokio::spawn(async move {
            process_connected_events(&mut session, &mut inputs, &socket, GENERATION, &events_sender, &mut commands, &actor_cancellation).await
        });
        let writer = tokio::spawn(async move {
            while let Some(frame) = outgoing.recv().await {
                let value = serde_json::from_slice(frame.message.into_data().as_ref()).unwrap();
                reply_sender.send(value).await.unwrap();
                if let Some(receipt) = frame.receipt { let _ = receipt.send(Ok(())); }
            }
        });
        Self { calls, snapshot, incoming, actions, events, replies, cancellation, actor, writer }
    }

    async fn register(&mut self) {
        self.incoming.send(DealerInput::Connection(CONNECTION.to_owned())).await.unwrap();
        let event = self.events.recv().await.unwrap();
        assert_eq!(event.generation, GENERATION);
        assert!(matches!(event.data, ConnectEventData::Registered { account_identifier, device_identifier, .. }
            if account_identifier == ACCOUNT && device_identifier == DEVICE));
    }

    async fn inbound(&mut self, endpoint: &str) {
        self.incoming.send(DealerInput::Command { key: KEY.to_owned(), request: json!({ (ENDPOINT_FIELD): endpoint }) }).await.unwrap();
    }

    async fn acknowledge(&mut self, accepted: bool) -> Result<(), Failure> {
        let (result, receipt) = oneshot::channel();
        self.actions.send(ConnectAction::Reply { generation: GENERATION, key: KEY.to_owned(), accepted, result }).await.unwrap();
        receipt.await.unwrap()
    }

    async fn stop(self) {
        self.cancellation.cancel();
        assert!(matches!(self.actor.await.unwrap(), Err(Failure::Canceled)));
        self.writer.await.unwrap();
    }
}

fn playable_cluster(target: &str) -> ConnectCluster {
    decode_cluster_snapshot(&Cluster { active_device_id: target.to_owned(), player_state: MessageField::some(PlayerState::new()),
        ..Default::default() }.write_to_bytes().unwrap()).unwrap()
}

#[tokio::test]
async fn checked_commands_refresh_the_actual_host_before_sending_the_typed_payload_once() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::CheckedCommand { generation: GENERATION, request_identifier: REQUEST.to_owned(),
        target_device_identifier: TARGET.to_owned(), command: ConnectCommand::Pause {}, command_cancellation: CancellationToken::new(), result }).await.unwrap();
    assert!(receipt.await.unwrap().is_ok());
    assert!(matches!(harness.events.recv().await.unwrap().data, ConnectEventData::Cluster { .. }));
    {
        let calls = harness.calls.lock().unwrap(); assert_eq!(calls.refreshes, ONE_CALL); assert_eq!(calls.commands.len(), ONE_CALL);
        assert_eq!(calls.commands[FIRST_CALL].0, TARGET); assert_eq!(calls.commands[FIRST_CALL].1[COMMAND_FIELD][ENDPOINT_FIELD], PAUSE);
    }
    harness.stop().await;
}

#[tokio::test]
async fn a_replaced_host_during_checked_preflight_never_receives_the_old_target_command() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(OTHER_TARGET);
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::CheckedCommand { generation: GENERATION, request_identifier: REQUEST.to_owned(),
        target_device_identifier: TARGET.to_owned(), command: ConnectCommand::Pause {}, command_cancellation: CancellationToken::new(), result }).await.unwrap();
    assert!(matches!(receipt.await.unwrap(), Err(Failure::Superseded)));
    assert!(harness.calls.lock().unwrap().commands.is_empty());
    harness.stop().await;
}

#[tokio::test]
async fn canceled_checked_receipts_after_preflight_cannot_dispatch_a_mutation() {
    let (release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_refresh(None, Some(gate), Some(started)); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::CheckedCommand { generation: GENERATION, request_identifier: REQUEST.to_owned(),
        target_device_identifier: TARGET.to_owned(), command: ConnectCommand::Pause {}, command_cancellation: CancellationToken::new(), result }).await.unwrap();
    observing.await.unwrap(); drop(receipt); release.send(()).unwrap();
    assert!(matches!(harness.events.recv().await.unwrap().data, ConnectEventData::Cluster { .. }));
    assert!(harness.calls.lock().unwrap().commands.is_empty()); harness.stop().await;
}

#[tokio::test]
async fn stale_checked_generations_fail_before_any_refresh_or_mutation() {
    let mut harness = Harness::start(None); harness.register().await;
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::CheckedCommand { generation: STALE_GENERATION, request_identifier: REQUEST.to_owned(),
        target_device_identifier: TARGET.to_owned(), command: ConnectCommand::Pause {}, command_cancellation: CancellationToken::new(), result }).await.unwrap();
    assert!(matches!(receipt.await.unwrap(), Err(Failure::Canceled)));
    assert_eq!(harness.calls.lock().unwrap().refreshes, EMPTY_CALL_COUNT);
    assert!(harness.calls.lock().unwrap().commands.is_empty()); harness.stop().await;
}

#[tokio::test]
async fn registration_requires_the_actual_dealer_connection_before_publishing_readiness() {
    let mut harness = Harness::start(None);
    harness.incoming.send(DealerInput::Cluster(cluster())).await.unwrap();
    harness.register().await;
    assert_eq!(harness.calls.lock().unwrap().connections, vec![CONNECTION]);
    assert!(harness.events.try_recv().is_err());
    harness.stop().await;
}

#[tokio::test]
async fn failed_registration_never_publishes_readiness() {
    let mut harness = Harness::start(Some(Failure::Forbidden));
    harness.incoming.send(DealerInput::Connection(CONNECTION.to_owned())).await.unwrap();
    assert!(matches!(harness.actor.await.unwrap(), Err(Failure::Forbidden)));
    assert!(harness.events.recv().await.is_none());
    harness.writer.await.unwrap();
}

#[tokio::test]
async fn stale_and_unregistered_outbound_commands_never_reach_the_session() {
    let mut harness = Harness::start(None);
    for generation in [GENERATION, STALE_GENERATION] {
        let (result, receipt) = oneshot::channel();
        harness.actions.send(ConnectAction::Command { generation, target_device_identifier: TARGET.to_owned(),
            body: json!({ (ENDPOINT_FIELD): PAUSE }), result }).await.unwrap();
        assert!(matches!(receipt.await.unwrap(), Err(Failure::Canceled)));
        harness.register().await;
    }
    assert_eq!(harness.calls.lock().unwrap().commands.len(), EMPTY_CALL_COUNT);
    harness.stop().await;
}

#[tokio::test]
async fn registered_command_is_sent_once_with_the_exact_target_and_body() {
    let mut harness = Harness::start(None); harness.register().await;
    let body = json!({ (ENDPOINT_FIELD): PAUSE });
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::Command { generation: GENERATION, target_device_identifier: TARGET.to_owned(), body: body.clone(), result }).await.unwrap();
    assert!(receipt.await.unwrap().is_ok());
    {
        let calls = harness.calls.lock().unwrap();
        assert_eq!(calls.commands.len(), ONE_CALL);
        assert_eq!(calls.commands[FIRST_CALL], (TARGET.to_owned(), body));
    }
    harness.stop().await;
}

#[tokio::test]
async fn canceled_queued_actions_do_not_dispatch_and_refresh_publishes_a_new_snapshot() {
    let mut harness = Harness::start(None); harness.register().await;
    let (result, receipt) = oneshot::channel(); drop(receipt);
    harness.actions.send(ConnectAction::Command { generation: GENERATION, target_device_identifier: TARGET.to_owned(), body: Value::Null, result }).await.unwrap();
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::Refresh { generation: GENERATION, result }).await.unwrap();
    assert!(receipt.await.unwrap().is_ok());
    assert!(matches!(harness.events.recv().await.unwrap().data, ConnectEventData::Cluster { .. }));
    assert_eq!(harness.calls.lock().unwrap().refreshes, ONE_CALL);
    assert!(harness.calls.lock().unwrap().commands.is_empty());
    harness.stop().await;
}

#[tokio::test]
async fn inbound_commands_require_explicit_acknowledgement_and_completed_duplicates_do_not_execute_again() {
    let mut harness = Harness::start(None); harness.register().await;
    harness.inbound(PAUSE).await;
    assert!(matches!(harness.events.recv().await.unwrap().data, ConnectEventData::Command { .. }));
    assert!(harness.replies.try_recv().is_err());
    assert!(harness.acknowledge(true).await.is_ok());
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], true);
    harness.inbound(PAUSE).await;
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], true);
    harness.inbound(RESUME).await;
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], false);
    assert!(harness.events.try_recv().is_err());
    harness.stop().await;
}

#[tokio::test]
async fn conflicting_pending_duplicates_are_rejected_without_replacing_the_original_command() {
    let mut harness = Harness::start(None); harness.register().await;
    harness.inbound(PAUSE).await; harness.events.recv().await.unwrap();
    harness.inbound(PAUSE).await; harness.inbound(RESUME).await;
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], false);
    assert!(harness.events.try_recv().is_err());
    assert!(harness.acknowledge(true).await.is_ok());
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], true);
    harness.stop().await;
}

#[tokio::test(start_paused = true)]
async fn expired_commands_are_rejected_and_a_late_success_cannot_change_the_reply() {
    let mut harness = Harness::start(None); harness.register().await;
    harness.inbound(PAUSE).await; harness.events.recv().await.unwrap();
    tokio::time::advance(std::time::Duration::from_secs(EXPIRATION_SECONDS)).await;
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], false);
    assert!(matches!(harness.acknowledge(true).await, Err(Failure::InvalidInput)));
    harness.inbound(PAUSE).await;
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], false);
    harness.stop().await;
}

#[tokio::test]
async fn commands_before_registration_and_unknown_request_topics_receive_explicit_rejections() {
    let mut harness = Harness::start(None);
    harness.inbound(PAUSE).await;
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], false);
    harness.register().await;
    harness.incoming.send(DealerInput::RejectedCommand { key: KEY.to_owned() }).await.unwrap();
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], false);
    assert!(harness.events.try_recv().is_err());
    harness.stop().await;
}

#[tokio::test]
async fn individual_cancellation_during_preflight_prevents_mutation_without_retiring_the_connection() {
    let (_release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_refresh(None, Some(gate), Some(started)); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let command_cancellation = CancellationToken::new();
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::CheckedCommand { generation: GENERATION, request_identifier: REQUEST.to_owned(),
        target_device_identifier: TARGET.to_owned(), command: ConnectCommand::Pause {}, command_cancellation: command_cancellation.clone(), result }).await.unwrap();
    observing.await.unwrap(); command_cancellation.cancel();
    assert!(matches!(receipt.await.unwrap(), Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().commands.is_empty());
    assert!(!harness.cancellation.is_cancelled()); harness.stop().await;
}

#[tokio::test]
async fn individual_cancellation_after_dispatch_reports_unknown_outcome_and_never_replays() {
    let (_release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_gates(None, None, None, Some(gate), Some(started)); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let command_cancellation = CancellationToken::new();
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::CheckedCommand { generation: GENERATION, request_identifier: REQUEST.to_owned(),
        target_device_identifier: TARGET.to_owned(), command: ConnectCommand::Pause {}, command_cancellation: command_cancellation.clone(), result }).await.unwrap();
    observing.await.unwrap(); command_cancellation.cancel();
    assert!(matches!(receipt.await.unwrap(), Err(Failure::UnknownOutcome)));
    assert_eq!(harness.calls.lock().unwrap().commands.len(), ONE_CALL);
    assert!(!harness.cancellation.is_cancelled()); harness.stop().await;
}

#[tokio::test]
async fn native_read_returns_a_fresh_cluster_with_a_request_interval_in_its_own_clock_domain() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::Read { generation: GENERATION, result }).await.unwrap();
    let reading = receipt.await.unwrap().unwrap();
    assert_eq!(reading.cluster.active_device_identifier, TARGET);
    assert!(reading.request_completed_native_monotonic_milliseconds >= reading.request_started_native_monotonic_milliseconds);
    assert_eq!(harness.calls.lock().unwrap().refreshes, ONE_CALL);
    assert!(harness.calls.lock().unwrap().commands.is_empty()); harness.stop().await;
}

#[tokio::test]
async fn stale_native_reads_are_rejected_without_querying_another_generation() {
    let mut harness = Harness::start(None); harness.register().await;
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::Read { generation: STALE_GENERATION, result }).await.unwrap();
    assert!(matches!(receipt.await.unwrap(), Err(Failure::Canceled)));
    assert_eq!(harness.calls.lock().unwrap().refreshes, EMPTY_CALL_COUNT); harness.stop().await;
}

#[tokio::test]
async fn abandoned_native_reads_do_not_refresh_or_emit_an_uncorrelated_playback_event() {
    let mut harness = Harness::start(None); harness.register().await;
    let (result, receipt) = oneshot::channel(); drop(receipt);
    harness.actions.send(ConnectAction::Read { generation: GENERATION, result }).await.unwrap();
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::Refresh { generation: GENERATION, result }).await.unwrap();
    receipt.await.unwrap().unwrap();
    assert_eq!(harness.calls.lock().unwrap().refreshes, ONE_CALL); harness.stop().await;
}

const METADATA_TRACK_IDENTIFIER: &str = "0000000000000000000001";

#[tokio::test]
async fn metadata_actions_keep_the_exact_request_and_preserve_the_provider_failure_without_replaying() {
    let mut harness = Harness::start(None); harness.register().await;
    let identifiers = vec![METADATA_TRACK_IDENTIFIER.to_owned()];
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::Metadata { generation: GENERATION, identifiers: identifiers.clone(), result }).await.unwrap();
    assert!(matches!(receipt.await.unwrap(), Err(Failure::Unsupported)));
    assert_eq!(harness.calls.lock().unwrap().metadata_requests, vec![identifiers]); harness.stop().await;
}

#[tokio::test]
async fn stale_metadata_generations_cannot_query_the_current_accounts_catalog() {
    let mut harness = Harness::start(None); harness.register().await;
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::Metadata { generation: STALE_GENERATION, identifiers: vec![METADATA_TRACK_IDENTIFIER.to_owned()], result }).await.unwrap();
    assert!(matches!(receipt.await.unwrap(), Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().metadata_requests.is_empty()); harness.stop().await;
}
