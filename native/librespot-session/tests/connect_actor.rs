#[path = "support/publication.rs"]
mod publication;

use std::sync::{Arc, Mutex};

use librespot_protocol::{connect::Cluster, player::PlayerState};
use protobuf::{Message, MessageField};
use serde_json::{json, Value};
use streaming_spotify_session::{connect_activation::{ConnectExplicitActivation, ConnectActivationPlayerReadiness, build_explicit_activation}, connect_search::{ConnectSearchInput, ConnectSearchOperations, ConnectSearchTrack}, connect_receipts::{ConnectCommandAcknowledgement, decode_command_acknowledgement}, connect_metadata::{ConnectMetadataOperations, ConnectTrackMetadata}, connect_session::ConnectSessionOperations, connect_commands::ConnectCommand,
    connect_transport::{process_connected_events, ConnectAction, ConnectEvent, ConnectEventData, OutgoingFrame},
    connect_wire::{decode_cluster_snapshot, ConnectCluster, DealerInput}, model::Failure};
use tokio::{sync::{mpsc, oneshot}, task::JoinHandle};
use tokio_util::sync::CancellationToken;

const COMMAND_ACKNOWLEDGEMENT_RESPONSE: &[u8] = br#"{"ack_id":"synthetic-server-acknowledgement"}"#;
const SERVER_ACKNOWLEDGEMENT: &str = "synthetic-server-acknowledgement";
const OTHER_SERVER_ACKNOWLEDGEMENT: &str = "synthetic-unrelated-server-acknowledgement";
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
const EARLY_ACTIVATION_MESSAGE: &str = "Activation completed before the blocked publication was released";
const OTHER_TARGET: &str = "replacement-host-device";
const COMMAND_FIELD: &str = "command";
const COMMAND_LIFETIME_MILLISECONDS: u64 = 10000;
const EXPECTED_TIMED_COMMAND: &str = "Expected a timed command event";

#[derive(Default)]
struct Calls { search_failure: Option<Failure>, deactivation_sequences: Vec<u64>, deactivation_failure: Option<Failure>, search_requests: Vec<ConnectSearchInput>, membership_requests: usize, connections: Vec<String>, commands: Vec<(String, Value)>, refreshes: usize, metadata_requests: Vec<Vec<String>>, publication_sequences: Vec<u64> }

struct FakeSession {
    calls: Arc<Mutex<Calls>>, registration_failure: Option<Failure>, snapshot: Arc<Mutex<ConnectCluster>>,
    refresh_gate: Option<oneshot::Receiver<()>>, refresh_started: Option<oneshot::Sender<()>>,
    command_gate: Option<oneshot::Receiver<()>>, command_started: Option<oneshot::Sender<()>>,
    publication_gate: Option<oneshot::Receiver<()>>, publication_started: Option<oneshot::Sender<()>>,
}

fn cluster() -> ConnectCluster { decode_cluster_snapshot(&Cluster::new().write_to_bytes().unwrap()).unwrap() }

impl ConnectMetadataOperations for FakeSession {
    async fn metadata(&mut self, identifiers: Vec<String>) -> Result<Vec<ConnectTrackMetadata>, Failure> {
        self.calls.lock().unwrap().metadata_requests.push(identifiers);
        if let Some(started) = self.refresh_started.take() { let _ = started.send(()); }
        if let Some(gate) = self.refresh_gate.take() { gate.await.map_err(|_| Failure::Network)?; }
        Err(Failure::Unsupported)
    }
}

impl ConnectSearchOperations for FakeSession {
    async fn search(&mut self, input: ConnectSearchInput) -> Result<Vec<ConnectSearchTrack>, Failure> {
        self.calls.lock().unwrap().search_requests.push(input);
        if let Some(failure) = self.calls.lock().unwrap().search_failure { return Err(failure); }
        if let Some(started) = self.refresh_started.take() { let _ = started.send(()); }
        if let Some(gate) = self.refresh_gate.take() { gate.await.map_err(|_| Failure::Network)?; }
        Ok(Vec::new())
    }
}

impl ConnectSessionOperations for FakeSession {
    fn device_identifier(&self) -> &str { DEVICE }
    fn account_identifier(&self) -> String { ACCOUNT.to_owned() }
    fn playback_session_identifier(&self) -> Option<&str> { Some(publication::SESSION) }
    async fn current_membership(&mut self) -> Result<Option<streaming_spotify_session::connect_membership::ConnectJamMembership>, Failure> {
        self.calls.lock().unwrap().membership_requests += ONE_CALL;
        Ok(None)
    }
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
    async fn activate(&mut self, snapshot: streaming_spotify_session::connect_publication::ConnectPublicationSnapshot,
        activation: ConnectExplicitActivation, readiness: ConnectActivationPlayerReadiness, cluster: ConnectCluster, generation: u64) -> Result<ConnectCluster, Failure> {
        let registration = streaming_spotify_session::connect_device::initial_registration(
            &streaming_spotify_session::connect_device::ConnectDeviceConfiguration { name: DEVICE.to_owned(), playback_ready: true },
            DEVICE, publication::SESSION, publication::SERVER_TIMESTAMP_MILLISECONDS)?;
        build_explicit_activation(&registration, &snapshot, &activation, &readiness, &cluster, generation,
            streaming_spotify_session::connect_transport::native_monotonic_milliseconds())?;
        let mut published = self.publish(snapshot).await?;
        published.server_at_milliseconds = cluster.server_at_milliseconds;
        published.changed_at_milliseconds = cluster.changed_at_milliseconds;
        Ok(published)
    }
    async fn withdraw(&mut self, sequence: u64) -> Result<ConnectCluster, Failure> {
        {
            let mut calls = self.calls.lock().unwrap(); calls.deactivation_sequences.push(sequence);
            if let Some(failure) = calls.deactivation_failure { return Err(failure); }
        }
        if let Some(started) = self.publication_started.take() { let _ = started.send(()); }
        if let Some(gate) = self.publication_gate.take() { gate.await.map_err(|_| Failure::UnknownOutcome)?; }
        Ok(self.snapshot.lock().unwrap().clone())
    }
    async fn deactivate(&mut self, snapshot: streaming_spotify_session::connect_publication::ConnectPublicationSnapshot) -> Result<ConnectCluster, Failure> {
        {
            let mut calls = self.calls.lock().unwrap(); calls.deactivation_sequences.push(snapshot.sequence);
            if let Some(failure) = calls.deactivation_failure { return Err(failure); }
        }
        if let Some(started) = self.publication_started.take() { let _ = started.send(()); }
        if let Some(gate) = self.publication_gate.take() { gate.await.map_err(|_| Failure::UnknownOutcome)?; }
        Ok(self.snapshot.lock().unwrap().clone())
    }
    async fn publish(&mut self, snapshot: streaming_spotify_session::connect_publication::ConnectPublicationSnapshot) -> Result<ConnectCluster, Failure> {
        self.calls.lock().unwrap().publication_sequences.push(snapshot.sequence);
        if let Some(started) = self.publication_started.take() { let _ = started.send(()); }
        if let Some(gate) = self.publication_gate.take() { gate.await.map_err(|_| Failure::UnknownOutcome)?; }
        Ok(playable_cluster(DEVICE))
    }
    async fn command(&mut self, target: &str, body: Value) -> Result<ConnectCommandAcknowledgement, Failure> {
        self.calls.lock().unwrap().commands.push((target.to_owned(), body));
        if let Some(started) = self.command_started.take() { let _ = started.send(()); }
        if let Some(gate) = self.command_gate.take() { gate.await.map_err(|_| Failure::Network)?; }
        Ok(decode_command_acknowledgement(COMMAND_ACKNOWLEDGEMENT_RESPONSE))
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
        Self::with_publication(registration_failure, refresh_gate, refresh_started, command_gate, command_started, None, None)
    }

    fn with_publication(registration_failure: Option<Failure>, refresh_gate: Option<oneshot::Receiver<()>>, refresh_started: Option<oneshot::Sender<()>>,
        command_gate: Option<oneshot::Receiver<()>>, command_started: Option<oneshot::Sender<()>>,
        publication_gate: Option<oneshot::Receiver<()>>, publication_started: Option<oneshot::Sender<()>>) -> Self {
        let calls = Arc::new(Mutex::new(Calls::default()));
        let snapshot = Arc::new(Mutex::new(cluster()));
        let mut session = FakeSession { calls: Arc::clone(&calls), registration_failure, snapshot: Arc::clone(&snapshot), refresh_gate, refresh_started, command_gate, command_started, publication_gate, publication_started };
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
    assert!(matches!(harness.events.recv().await.unwrap().data, ConnectEventData::Cluster { .. }));
    let mut observed = playable_cluster(TARGET); observed.acknowledgement_identifier = Some(SERVER_ACKNOWLEDGEMENT.to_owned());
    harness.incoming.send(DealerInput::Cluster(observed)).await.unwrap();
    let confirmation = receipt.await.unwrap().unwrap(); assert!(confirmation.delivery_observed);
    assert_eq!(confirmation.acknowledgement_identifier.as_deref(), Some(SERVER_ACKNOWLEDGEMENT));
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
async fn incoming_command_deadline_is_native_and_duplicates_cannot_extend_it() {
    let mut harness = Harness::start(None); harness.register().await;
    harness.inbound(PAUSE).await;
    let event = harness.events.recv().await.unwrap();
    match event.data {
        ConnectEventData::Command { received_native_monotonic_milliseconds, deadline_native_monotonic_milliseconds, .. } => {
            assert_eq!(deadline_native_monotonic_milliseconds - received_native_monotonic_milliseconds, COMMAND_LIFETIME_MILLISECONDS);
            assert!(received_native_monotonic_milliseconds <= event.observed_monotonic_milliseconds);
        },
        _ => panic!("{EXPECTED_TIMED_COMMAND}"),
    }
    harness.inbound(PAUSE).await;
    assert!(harness.acknowledge(false).await.is_ok());
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

#[tokio::test]
async fn protocol_failure_inspection_exposes_only_the_fixed_stage_for_the_matching_generation() {
    let harness = Harness::start(None);
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::InspectFailure { generation: GENERATION, result }).await.unwrap();
    assert!(matches!(receipt.await.unwrap(), Ok(streaming_spotify_session::connect_session::ConnectFailureStage::DealerEvents)));
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::InspectFailure { generation: STALE_GENERATION, result }).await.unwrap();
    assert!(matches!(receipt.await.unwrap(), Err(Failure::Canceled))); harness.stop().await;
}

#[tokio::test]
async fn http_accepted_commands_wait_for_the_matching_dealer_acknowledgement_on_the_same_host() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let (result, mut receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::CheckedCommand { generation: GENERATION, request_identifier: REQUEST.to_owned(),
        target_device_identifier: TARGET.to_owned(), command: ConnectCommand::Pause {}, command_cancellation: CancellationToken::new(), result }).await.unwrap();
    harness.events.recv().await.unwrap();
    let mut unrelated = playable_cluster(TARGET); unrelated.acknowledgement_identifier = Some(OTHER_SERVER_ACKNOWLEDGEMENT.to_owned());
    harness.incoming.send(DealerInput::Cluster(unrelated)).await.unwrap(); harness.events.recv().await.unwrap();
    assert!(matches!(receipt.try_recv(), Err(oneshot::error::TryRecvError::Empty)));
    let mut matching = playable_cluster(TARGET); matching.acknowledgement_identifier = Some(SERVER_ACKNOWLEDGEMENT.to_owned());
    harness.incoming.send(DealerInput::Cluster(matching)).await.unwrap();
    assert!(receipt.await.unwrap().unwrap().delivery_observed); assert_eq!(harness.calls.lock().unwrap().commands.len(), ONE_CALL);
    harness.stop().await;
}

const CANCELLATION_SWEEP_MILLISECONDS: u64 = 1000;

#[tokio::test(start_paused = true)]
async fn cancellation_while_waiting_for_dealer_confirmation_preserves_unknown_outcome_without_resending() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let command_cancellation = CancellationToken::new(); let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::CheckedCommand { generation: GENERATION, request_identifier: REQUEST.to_owned(),
        target_device_identifier: TARGET.to_owned(), command: ConnectCommand::Pause {}, command_cancellation: command_cancellation.clone(), result }).await.unwrap();
    harness.events.recv().await.unwrap(); command_cancellation.cancel();
    tokio::time::advance(std::time::Duration::from_millis(CANCELLATION_SWEEP_MILLISECONDS)).await;
    assert!(matches!(receipt.await.unwrap(), Err(Failure::UnknownOutcome)));
    assert_eq!(harness.calls.lock().unwrap().commands.len(), ONE_CALL); harness.stop().await;
}

#[tokio::test]
async fn connection_shutdown_retires_http_accepted_commands_as_uncertain_without_losing_their_receipt() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::CheckedCommand { generation: GENERATION, request_identifier: REQUEST.to_owned(),
        target_device_identifier: TARGET.to_owned(), command: ConnectCommand::Pause {}, command_cancellation: CancellationToken::new(), result }).await.unwrap();
    harness.events.recv().await.unwrap(); harness.stop().await;
    assert!(matches!(receipt.await.unwrap(), Err(Failure::UnknownOutcome)));
}

async fn publish_sample(harness: &Harness, generation: u64, sequence: u64, publication_cancellation: CancellationToken) -> Result<ConnectCluster, Failure> {
    let mut snapshot = publication::snapshot(); snapshot.device_identifier = DEVICE.to_owned(); snapshot.sequence = sequence;
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::Publish { generation, snapshot, publication_cancellation, result }).await.unwrap();
    receipt.await.unwrap()
}

async fn observe_publication_host(harness: &mut Harness, device_identifier: &str) {
    harness.incoming.send(DealerInput::Cluster(playable_cluster(device_identifier))).await.unwrap();
    assert!(matches!(harness.events.recv().await.unwrap().data, ConnectEventData::Cluster { .. }));
}

#[tokio::test]
async fn publication_requires_existing_local_authority_and_never_takes_over_another_host() {
    let mut harness = Harness::start(None); harness.register().await;
    observe_publication_host(&mut harness, TARGET).await;
    assert!(matches!(publish_sample(&harness, GENERATION, publication::FIRST_SEQUENCE, CancellationToken::new()).await, Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().publication_sequences.is_empty()); harness.stop().await;
}

#[tokio::test]
async fn stale_generations_and_canceled_publications_never_reach_the_session() {
    let mut harness = Harness::start(None); harness.register().await;
    observe_publication_host(&mut harness, DEVICE).await;
    assert!(matches!(publish_sample(&harness, STALE_GENERATION, publication::FIRST_SEQUENCE, CancellationToken::new()).await, Err(Failure::Canceled)));
    let canceled = CancellationToken::new(); canceled.cancel();
    assert!(matches!(publish_sample(&harness, GENERATION, publication::FIRST_SEQUENCE, canceled).await, Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().publication_sequences.is_empty()); harness.stop().await;
}

#[tokio::test]
async fn duplicate_or_older_publications_are_fenced_after_first_dispatch() {
    let mut harness = Harness::start(None); harness.register().await;
    observe_publication_host(&mut harness, DEVICE).await;
    publish_sample(&harness, GENERATION, publication::SECOND_SEQUENCE, CancellationToken::new()).await.unwrap();
    assert!(matches!(publish_sample(&harness, GENERATION, publication::SECOND_SEQUENCE, CancellationToken::new()).await, Err(Failure::Canceled)));
    assert!(matches!(publish_sample(&harness, GENERATION, publication::FIRST_SEQUENCE, CancellationToken::new()).await, Err(Failure::Canceled)));
    assert_eq!(harness.calls.lock().unwrap().publication_sequences, vec![publication::SECOND_SEQUENCE]); harness.stop().await;
}

#[tokio::test]
async fn host_replacement_retires_further_local_publications() {
    let mut harness = Harness::start(None); harness.register().await;
    observe_publication_host(&mut harness, DEVICE).await;
    publish_sample(&harness, GENERATION, publication::FIRST_SEQUENCE, CancellationToken::new()).await.unwrap();
    observe_publication_host(&mut harness, OTHER_TARGET).await;
    assert!(matches!(publish_sample(&harness, GENERATION, publication::SECOND_SEQUENCE, CancellationToken::new()).await, Err(Failure::Canceled)));
    assert_eq!(harness.calls.lock().unwrap().publication_sequences, vec![publication::FIRST_SEQUENCE]); harness.stop().await;
}

#[tokio::test]
async fn in_flight_publication_cancellation_is_unknown_and_the_sequence_never_replays() {
    let (release, gate) = oneshot::channel(); let (started, dispatched) = oneshot::channel();
    let mut harness = Harness::with_publication(None, None, None, None, None, Some(gate), Some(started));
    harness.register().await; observe_publication_host(&mut harness, DEVICE).await;
    let mut snapshot = publication::snapshot(); snapshot.device_identifier = DEVICE.to_owned();
    let publication_cancellation = CancellationToken::new(); let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::Publish { generation: GENERATION, snapshot, publication_cancellation: publication_cancellation.clone(), result }).await.unwrap();
    dispatched.await.unwrap(); publication_cancellation.cancel();
    assert!(matches!(receipt.await.unwrap(), Err(Failure::UnknownOutcome)));
    assert!(matches!(publish_sample(&harness, GENERATION, publication::FIRST_SEQUENCE, CancellationToken::new()).await, Err(Failure::Canceled)));
    assert_eq!(harness.calls.lock().unwrap().publication_sequences, vec![publication::FIRST_SEQUENCE]);
    drop(release); harness.stop().await;
}

#[tokio::test]
async fn abandoned_queued_publications_never_dispatch() {
    let mut harness = Harness::start(None); harness.register().await;
    observe_publication_host(&mut harness, DEVICE).await;
    let mut snapshot = publication::snapshot(); snapshot.device_identifier = DEVICE.to_owned();
    let (result, receipt) = oneshot::channel(); drop(receipt);
    harness.actions.send(ConnectAction::Publish { generation: GENERATION, snapshot, publication_cancellation: CancellationToken::new(), result }).await.unwrap();
    publish_sample(&harness, GENERATION, publication::SECOND_SEQUENCE, CancellationToken::new()).await.unwrap();
    assert_eq!(harness.calls.lock().unwrap().publication_sequences, vec![publication::SECOND_SEQUENCE]); harness.stop().await;
}

#[tokio::test]
async fn a_host_replacement_cannot_be_undone_by_a_delayed_local_host_update() {
    let mut harness = Harness::start(None); harness.register().await;
    observe_publication_host(&mut harness, DEVICE).await;
    publish_sample(&harness, GENERATION, publication::FIRST_SEQUENCE, CancellationToken::new()).await.unwrap();
    observe_publication_host(&mut harness, OTHER_TARGET).await;
    observe_publication_host(&mut harness, DEVICE).await;
    assert!(matches!(publish_sample(&harness, GENERATION, publication::SECOND_SEQUENCE, CancellationToken::new()).await, Err(Failure::Canceled)));
    assert_eq!(harness.calls.lock().unwrap().publication_sequences, vec![publication::FIRST_SEQUENCE]); harness.stop().await;
}

#[tokio::test]
async fn foreign_publication_sessions_never_dispatch_even_when_device_and_generation_match() {
    let mut harness = Harness::start(None); harness.register().await;
    observe_publication_host(&mut harness, DEVICE).await;
    let mut snapshot = publication::snapshot(); snapshot.device_identifier = DEVICE.to_owned(); snapshot.session_identifier = OTHER_TARGET.to_owned();
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::Publish { generation: GENERATION, snapshot, publication_cancellation: CancellationToken::new(), result }).await.unwrap();
    assert!(matches!(receipt.await.unwrap(), Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().publication_sequences.is_empty()); harness.stop().await;
}

const RESPONSIVENESS_TIMEOUT_MILLISECONDS: u64 = 100;

#[tokio::test(start_paused = true)]
async fn dealer_commands_and_their_replies_progress_while_a_passive_http_read_is_stalled() {
    let (release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_refresh(None, Some(gate), Some(started)); harness.register().await;
    let (result, mut reading) = oneshot::channel();
    harness.actions.send(ConnectAction::Read { generation: GENERATION, result }).await.unwrap(); observing.await.unwrap();
    harness.inbound(PAUSE).await;
    let event = tokio::time::timeout(std::time::Duration::from_millis(RESPONSIVENESS_TIMEOUT_MILLISECONDS), harness.events.recv()).await.unwrap().unwrap();
    assert!(matches!(event.data, ConnectEventData::Command { .. }));
    tokio::time::timeout(std::time::Duration::from_millis(RESPONSIVENESS_TIMEOUT_MILLISECONDS), harness.acknowledge(true)).await.unwrap().unwrap();
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], true);
    assert!(matches!(reading.try_recv(), Err(oneshot::error::TryRecvError::Empty)));
    release.send(()).unwrap(); reading.await.unwrap().unwrap(); harness.stop().await;
}

#[tokio::test(start_paused = true)]
async fn a_busy_http_worker_defers_metadata_but_rejects_unqueued_mutations_and_stale_reads() {
    let (release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_refresh(None, Some(gate), Some(started)); harness.register().await;
    let (result, reading) = oneshot::channel();
    harness.actions.send(ConnectAction::Read { generation: GENERATION, result }).await.unwrap(); observing.await.unwrap();
    let (result, mut metadata) = oneshot::channel();
    harness.actions.send(ConnectAction::Metadata { generation: GENERATION, identifiers: vec![METADATA_TRACK_IDENTIFIER.to_owned()], result }).await.unwrap();
    assert!(matches!(metadata.try_recv(), Err(oneshot::error::TryRecvError::Empty)));
    let (result, command) = oneshot::channel();
    harness.actions.send(ConnectAction::CheckedCommand { generation: GENERATION, request_identifier: REQUEST.to_owned(), target_device_identifier: TARGET.to_owned(),
        command: ConnectCommand::Pause {}, command_cancellation: CancellationToken::new(), result }).await.unwrap();
    assert!(matches!(command.await.unwrap(), Err(Failure::Backpressure)));
    let (result, stale) = oneshot::channel();
    harness.actions.send(ConnectAction::Read { generation: STALE_GENERATION, result }).await.unwrap();
    assert!(matches!(stale.await.unwrap(), Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().metadata_requests.is_empty()); assert!(harness.calls.lock().unwrap().commands.is_empty());
    release.send(()).unwrap(); reading.await.unwrap().unwrap(); assert!(matches!(metadata.await.unwrap(), Err(Failure::Unsupported)));
    assert_eq!(harness.calls.lock().unwrap().metadata_requests.len(), ONE_CALL); harness.stop().await;
}

#[tokio::test(start_paused = true)]
async fn pending_incoming_commands_expire_while_http_waits_instead_of_accepting_a_late_player_action() {
    let (release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_refresh(None, Some(gate), Some(started)); harness.register().await;
    let (result, reading) = oneshot::channel();
    harness.actions.send(ConnectAction::Read { generation: GENERATION, result }).await.unwrap(); observing.await.unwrap();
    harness.inbound(PAUSE).await; harness.events.recv().await.unwrap();
    tokio::time::advance(std::time::Duration::from_secs(EXPIRATION_SECONDS)).await;
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], false);
    assert!(matches!(harness.acknowledge(true).await, Err(Failure::InvalidInput)));
    release.send(()).unwrap(); reading.await.unwrap().unwrap(); harness.stop().await;
}

#[tokio::test(start_paused = true)]
async fn an_early_dealer_ack_is_processed_during_the_mutation_but_success_waits_for_its_matching_http_receipt() {
    let (release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_gates(None, None, None, Some(gate), Some(started)); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let (result, mut command) = oneshot::channel();
    harness.actions.send(ConnectAction::CheckedCommand { generation: GENERATION, request_identifier: REQUEST.to_owned(), target_device_identifier: TARGET.to_owned(),
        command: ConnectCommand::Pause {}, command_cancellation: CancellationToken::new(), result }).await.unwrap();
    harness.events.recv().await.unwrap(); observing.await.unwrap();
    let mut matching = playable_cluster(TARGET); matching.acknowledgement_identifier = Some(SERVER_ACKNOWLEDGEMENT.to_owned());
    harness.incoming.send(DealerInput::Cluster(matching)).await.unwrap();
    let event = tokio::time::timeout(std::time::Duration::from_millis(RESPONSIVENESS_TIMEOUT_MILLISECONDS), harness.events.recv()).await.unwrap().unwrap();
    assert!(matches!(event.data, ConnectEventData::Cluster { .. }));
    assert!(matches!(command.try_recv(), Err(oneshot::error::TryRecvError::Empty)));
    harness.inbound(PAUSE).await; harness.events.recv().await.unwrap(); harness.acknowledge(false).await.unwrap();
    release.send(()).unwrap(); assert!(command.await.unwrap().unwrap().delivery_observed);
    assert_eq!(harness.calls.lock().unwrap().commands.len(), ONE_CALL); harness.stop().await;
}

#[tokio::test(start_paused = true)]
async fn connection_shutdown_cancels_a_stalled_http_worker_and_completes_passive_receipts() {
    let (_release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_refresh(None, Some(gate), Some(started)); harness.register().await;
    let (result, reading) = oneshot::channel();
    harness.actions.send(ConnectAction::Read { generation: GENERATION, result }).await.unwrap(); observing.await.unwrap();
    harness.cancellation.cancel();
    assert!(matches!(reading.await.unwrap(), Err(Failure::Canceled)));
    harness.stop().await;
}

#[tokio::test(start_paused = true)]
async fn private_metadata_waiting_does_not_block_dealer_commands_or_their_explicit_replies() {
    let (release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_refresh(None, Some(gate), Some(started)); harness.register().await;
    let (result, metadata) = oneshot::channel();
    harness.actions.send(ConnectAction::Metadata { generation: GENERATION, identifiers: vec![METADATA_TRACK_IDENTIFIER.to_owned()], result }).await.unwrap(); observing.await.unwrap();
    harness.inbound(PAUSE).await;
    let event = tokio::time::timeout(std::time::Duration::from_millis(RESPONSIVENESS_TIMEOUT_MILLISECONDS), harness.events.recv()).await.unwrap().unwrap();
    assert!(matches!(event.data, ConnectEventData::Command { .. }));
    harness.acknowledge(true).await.unwrap();
    assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], true);
    release.send(()).unwrap(); assert!(matches!(metadata.await.unwrap(), Err(Failure::Unsupported))); harness.stop().await;
}

#[tokio::test]
async fn native_membership_reads_return_the_authenticated_account_even_when_no_jam_exists() {
    let mut harness = Harness::start(None); harness.register().await;
    let (result, membership) = oneshot::channel();
    harness.actions.send(ConnectAction::Membership { generation: GENERATION, result }).await.unwrap();
    let reading = membership.await.unwrap().unwrap();
    assert_eq!(reading.account_identifier, ACCOUNT); assert!(reading.membership.is_none());
    let (result, stale) = oneshot::channel();
    harness.actions.send(ConnectAction::Membership { generation: STALE_GENERATION, result }).await.unwrap();
    assert!(matches!(stale.await.unwrap(), Err(Failure::Canceled)));
    assert_eq!(harness.calls.lock().unwrap().membership_requests, ONE_CALL); harness.stop().await;
}

#[tokio::test(start_paused = true)]
async fn stalled_local_state_publication_keeps_incoming_controls_and_host_retirement_responsive() {
    let (release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_publication(None, None, None, None, None, Some(gate), Some(started)); harness.register().await;
    observe_publication_host(&mut harness, DEVICE).await;
    let mut snapshot = publication::snapshot(); snapshot.device_identifier = DEVICE.to_owned();
    let (result, published) = oneshot::channel();
    harness.actions.send(ConnectAction::Publish { generation: GENERATION, snapshot, publication_cancellation: CancellationToken::new(), result }).await.unwrap();
    observing.await.unwrap(); harness.inbound(PAUSE).await;
    let event = tokio::time::timeout(std::time::Duration::from_millis(RESPONSIVENESS_TIMEOUT_MILLISECONDS), harness.events.recv()).await.unwrap().unwrap();
    assert!(matches!(event.data, ConnectEventData::Command { .. }));
    harness.acknowledge(true).await.unwrap(); assert_eq!(harness.replies.recv().await.unwrap()[PAYLOAD_FIELD][SUCCESS_FIELD], true);
    observe_publication_host(&mut harness, OTHER_TARGET).await;
    release.send(()).unwrap(); published.await.unwrap().unwrap();
    assert!(matches!(publish_sample(&harness, GENERATION, publication::SECOND_SEQUENCE, CancellationToken::new()).await, Err(Failure::Canceled)));
    assert_eq!(harness.calls.lock().unwrap().publication_sequences, vec![publication::FIRST_SEQUENCE]); harness.stop().await;
}

async fn activation_read(harness: &Harness) -> streaming_spotify_session::connect_transport::ConnectReading {
    harness.snapshot.lock().unwrap().server_at_milliseconds = publication::SERVER_TIMESTAMP_MILLISECONDS as i64;
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::Read { generation: GENERATION, result }).await.unwrap();
    receipt.await.unwrap().unwrap()
}

async fn activate_sample(actions: &mpsc::Sender<ConnectAction>, reading: &streaming_spotify_session::connect_transport::ConnectReading,
    generation: u64, previous_host: &str, playback_output_ready: bool) -> Result<ConnectCluster, Failure> {
    let native_now = streaming_spotify_session::connect_transport::native_monotonic_milliseconds();
    let (result, receipt) = oneshot::channel();
    actions.send(ConnectAction::HostIdentity { generation: GENERATION, result }).await.unwrap();
    let next_sequence = receipt.await.unwrap()?.next_publication_sequence;
    let mut snapshot = publication::snapshot(); snapshot.device_identifier = DEVICE.to_owned(); snapshot.sequence = next_sequence; snapshot.command_handling_ready = true;
    snapshot.sampled_native_monotonic_milliseconds = native_now;
    snapshot.sampled_server_timestamp_milliseconds = reading.cluster.server_at_milliseconds as u64
        + native_now - reading.request_completed_native_monotonic_milliseconds;
    let activation = ConnectExplicitActivation { request_identifier: REQUEST.to_owned(), generation,
        expected_previous_host_device_identifier: previous_host.to_owned(),
        observation_started_native_monotonic_milliseconds: reading.request_started_native_monotonic_milliseconds,
        observation_completed_native_monotonic_milliseconds: reading.request_completed_native_monotonic_milliseconds,
        requested_native_monotonic_milliseconds: reading.request_started_native_monotonic_milliseconds };
    let readiness = ConnectActivationPlayerReadiness { playback_output_ready, external_authority_absent: true, command_handling_ready: true };
    let (result, receipt) = oneshot::channel();
    actions.send(ConnectAction::Activate { generation, snapshot, activation, readiness,
        activation_cancellation: CancellationToken::new(), result }).await.unwrap();
    receipt.await.unwrap()
}

#[tokio::test]
async fn explicit_activation_uses_the_actual_preflight_and_establishes_local_publication_authority() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let reading = activation_read(&harness).await;
    activate_sample(&harness.actions, &reading, GENERATION, TARGET, true).await.unwrap();
    publish_sample(&harness, GENERATION, publication::SECOND_SEQUENCE, CancellationToken::new()).await.unwrap();
    assert_eq!(harness.calls.lock().unwrap().publication_sequences, [publication::FIRST_SEQUENCE, publication::SECOND_SEQUENCE]);
    assert!(matches!(activate_sample(&harness.actions, &reading, GENERATION, TARGET, true).await, Err(Failure::UnknownOutcome)));
    harness.stop().await;
}

#[tokio::test]
async fn stale_generation_changed_host_and_unready_output_cannot_dispatch_activation() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let reading = activation_read(&harness).await;
    assert!(matches!(activate_sample(&harness.actions, &reading, STALE_GENERATION, TARGET, true).await, Err(Failure::Canceled)));
    assert!(matches!(activate_sample(&harness.actions, &reading, GENERATION, OTHER_TARGET, true).await, Err(Failure::Canceled)));
    assert!(matches!(activate_sample(&harness.actions, &reading, GENERATION, TARGET, false).await, Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().publication_sequences.is_empty());
    harness.stop().await;
}

#[tokio::test]
async fn actual_native_host_identity_requires_the_current_registered_generation() {
    let mut harness = Harness::start(None); harness.register().await;
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::HostIdentity { generation: GENERATION, result }).await.unwrap();
    let identity = receipt.await.unwrap().unwrap();
    assert_eq!(identity.device_identifier, DEVICE); assert_eq!(identity.session_identifier, publication::SESSION);
    let (result, receipt) = oneshot::channel();
    harness.actions.send(ConnectAction::HostIdentity { generation: STALE_GENERATION, result }).await.unwrap();
    assert!(matches!(receipt.await.unwrap(), Err(Failure::Canceled)));
    harness.stop().await;
}

#[tokio::test]
async fn activation_without_an_actor_owned_read_cannot_promote_the_observer() {
    let mut harness = Harness::start(None); harness.register().await;
    let reading = streaming_spotify_session::connect_transport::ConnectReading {
        request_started_native_monotonic_milliseconds: publication::NATIVE_TIMESTAMP_MILLISECONDS,
        request_completed_native_monotonic_milliseconds: publication::NATIVE_TIMESTAMP_MILLISECONDS,
        cluster: playable_cluster(TARGET) };
    assert!(matches!(activate_sample(&harness.actions, &reading, GENERATION, TARGET, true).await, Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().publication_sequences.is_empty()); harness.stop().await;
}

#[tokio::test]
async fn changed_host_after_preflight_prevents_explicit_activation() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let reading = activation_read(&harness).await;
    let mut changed = playable_cluster(OTHER_TARGET);
    changed.server_at_milliseconds = reading.cluster.server_at_milliseconds + ONE_CALL as i64;
    harness.incoming.send(DealerInput::Cluster(changed)).await.unwrap(); harness.events.recv().await.unwrap();
    assert!(matches!(activate_sample(&harness.actions, &reading, GENERATION, TARGET, true).await, Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().publication_sequences.is_empty()); harness.stop().await;
}

#[tokio::test]
async fn a_host_change_during_activation_prevents_late_success_from_restoring_publication() {
    let (release, gate) = oneshot::channel(); let (started, observed_start) = oneshot::channel();
    let mut harness = Harness::with_publication(None, None, None, None, None, Some(gate), Some(started)); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let reading = activation_read(&harness).await;
    let actions = harness.actions.clone();
    let activation = activate_sample(&actions, &reading, GENERATION, TARGET, true);
    tokio::pin!(activation);
    tokio::select! { _result = &mut activation => panic!("{EARLY_ACTIVATION_MESSAGE}"), result = observed_start => result.unwrap() }
    let mut changed = playable_cluster(OTHER_TARGET);
    changed.server_at_milliseconds = reading.cluster.server_at_milliseconds + ONE_CALL as i64;
    harness.incoming.send(DealerInput::Cluster(changed)).await.unwrap(); harness.events.recv().await.unwrap();
    release.send(()).unwrap();
    assert!(matches!(activation.await, Err(Failure::UnknownOutcome)));
    assert!(matches!(publish_sample(&harness, GENERATION, publication::SECOND_SEQUENCE, CancellationToken::new()).await, Err(Failure::Canceled)));
    harness.stop().await;
}

async fn deactivate_sample(actions: &mpsc::Sender<ConnectAction>, generation: u64, sequence: u64, cancellation: CancellationToken) -> Result<ConnectCluster, Failure> {
    let mut snapshot = publication::snapshot(); snapshot.device_identifier = DEVICE.to_owned(); snapshot.sequence = sequence;
    let (result, receipt) = oneshot::channel();
    actions.send(ConnectAction::Deactivate { generation, snapshot, cancellation, result }).await.unwrap();
    receipt.await.unwrap()
}

#[tokio::test]
async fn known_deactivation_retires_publication_and_allows_a_new_explicit_activation_with_a_fresh_sequence() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let reading = activation_read(&harness).await;
    activate_sample(&harness.actions, &reading, GENERATION, TARGET, true).await.unwrap();
    deactivate_sample(&harness.actions, GENERATION, publication::SECOND_SEQUENCE, CancellationToken::new()).await.unwrap();
    let reading = activation_read(&harness).await;
    activate_sample(&harness.actions, &reading, GENERATION, TARGET, true).await.unwrap();
    assert_eq!(harness.calls.lock().unwrap().deactivation_sequences, [publication::SECOND_SEQUENCE]);
    harness.stop().await;
}

#[tokio::test]
async fn unknown_deactivation_never_resets_the_activation_fence_or_replays_its_sequence() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let reading = activation_read(&harness).await;
    activate_sample(&harness.actions, &reading, GENERATION, TARGET, true).await.unwrap();
    harness.calls.lock().unwrap().deactivation_failure = Some(Failure::UnknownOutcome);
    assert!(matches!(deactivate_sample(&harness.actions, GENERATION, publication::SECOND_SEQUENCE, CancellationToken::new()).await, Err(Failure::UnknownOutcome)));
    assert!(matches!(deactivate_sample(&harness.actions, GENERATION, publication::SECOND_SEQUENCE, CancellationToken::new()).await, Err(Failure::Canceled)));
    let reading = activation_read(&harness).await;
    assert!(matches!(activate_sample(&harness.actions, &reading, GENERATION, TARGET, true).await, Err(Failure::UnknownOutcome)));
    assert_eq!(harness.calls.lock().unwrap().deactivation_sequences.len(), ONE_CALL);
    harness.stop().await;
}

#[tokio::test]
async fn stale_and_canceled_deactivation_cannot_touch_the_registered_device() {
    let mut harness = Harness::start(None); harness.register().await;
    assert!(matches!(deactivate_sample(&harness.actions, STALE_GENERATION, publication::FIRST_SEQUENCE, CancellationToken::new()).await, Err(Failure::Canceled)));
    let cancellation = CancellationToken::new(); cancellation.cancel();
    assert!(matches!(deactivate_sample(&harness.actions, GENERATION, publication::FIRST_SEQUENCE, cancellation).await, Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().deactivation_sequences.is_empty()); harness.stop().await;
}

#[tokio::test]
async fn deactivation_can_hide_the_local_device_after_a_remote_host_has_replaced_it() {
    let mut harness = Harness::start(None); harness.register().await;
    observe_publication_host(&mut harness, DEVICE).await;
    observe_publication_host(&mut harness, TARGET).await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let cluster = deactivate_sample(&harness.actions, GENERATION, publication::FIRST_SEQUENCE, CancellationToken::new()).await.unwrap();
    assert_eq!(cluster.active_device_identifier, TARGET);
    assert_eq!(harness.calls.lock().unwrap().deactivation_sequences.len(), ONE_CALL); harness.stop().await;
}

#[tokio::test]
async fn a_newer_local_host_observation_prevents_old_demotion_acknowledgement_from_resetting_authority() {
    let (release, gate) = oneshot::channel(); let (started, observed_start) = oneshot::channel();
    let mut harness = Harness::with_publication(None, None, None, None, None, Some(gate), Some(started)); harness.register().await;
    observe_publication_host(&mut harness, DEVICE).await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let actions = harness.actions.clone();
    let deactivation = deactivate_sample(&actions, GENERATION, publication::FIRST_SEQUENCE, CancellationToken::new());
    tokio::pin!(deactivation);
    tokio::select! { _result = &mut deactivation => panic!("{EARLY_ACTIVATION_MESSAGE}"), result = observed_start => result.unwrap() }
    let mut changed = playable_cluster(DEVICE); changed.server_at_milliseconds = publication::SERVER_TIMESTAMP_MILLISECONDS as i64;
    harness.incoming.send(DealerInput::Cluster(changed)).await.unwrap(); harness.events.recv().await.unwrap();
    release.send(()).unwrap(); assert!(matches!(deactivation.await, Err(Failure::UnknownOutcome)));
    harness.stop().await;
}

async fn withdraw_device(actions: &mpsc::Sender<ConnectAction>, generation: u64, sequence: u64, device_identifier: &str,
    cancellation: CancellationToken) -> Result<ConnectCluster, Failure> {
    let (result, receipt) = oneshot::channel();
    actions.send(ConnectAction::Withdraw { generation, sequence, device_identifier: device_identifier.to_owned(),
        session_identifier: publication::SESSION.to_owned(), cancellation, result }).await.unwrap();
    receipt.await.unwrap()
}

#[tokio::test]
async fn withdrawal_hides_only_the_owned_device_without_a_player_queue_or_membership_read() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(OTHER_TARGET);
    withdraw_device(&harness.actions, GENERATION, publication::FIRST_SEQUENCE, DEVICE, CancellationToken::new()).await.unwrap();
    let calls = harness.calls.lock().unwrap();
    assert_eq!(calls.deactivation_sequences, [publication::FIRST_SEQUENCE]);
    assert_eq!(calls.membership_requests, EMPTY_CALL_COUNT);
    drop(calls); harness.stop().await;
}

#[tokio::test]
async fn stale_foreign_and_canceled_withdrawals_cannot_touch_the_device() {
    let mut harness = Harness::start(None); harness.register().await;
    assert!(matches!(withdraw_device(&harness.actions, STALE_GENERATION, publication::FIRST_SEQUENCE, DEVICE, CancellationToken::new()).await, Err(Failure::Canceled)));
    assert!(matches!(withdraw_device(&harness.actions, GENERATION, publication::FIRST_SEQUENCE, OTHER_TARGET, CancellationToken::new()).await, Err(Failure::Canceled)));
    let cancellation = CancellationToken::new(); cancellation.cancel();
    assert!(matches!(withdraw_device(&harness.actions, GENERATION, publication::FIRST_SEQUENCE, DEVICE, cancellation).await, Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().deactivation_sequences.is_empty()); harness.stop().await;
}

#[tokio::test]
async fn unknown_withdrawal_keeps_its_sequence_fence_and_is_never_replayed() {
    let mut harness = Harness::start(None); harness.register().await;
    harness.calls.lock().unwrap().deactivation_failure = Some(Failure::UnknownOutcome);
    assert!(matches!(withdraw_device(&harness.actions, GENERATION, publication::FIRST_SEQUENCE, DEVICE, CancellationToken::new()).await, Err(Failure::UnknownOutcome)));
    assert!(matches!(withdraw_device(&harness.actions, GENERATION, publication::FIRST_SEQUENCE, DEVICE, CancellationToken::new()).await, Err(Failure::Canceled)));
    assert_eq!(harness.calls.lock().unwrap().deactivation_sequences.len(), ONE_CALL); harness.stop().await;
}

#[tokio::test]
async fn successful_withdrawal_allows_only_a_new_explicit_activation_at_the_next_sequence() {
    let mut harness = Harness::start(None); harness.register().await;
    *harness.snapshot.lock().unwrap() = playable_cluster(TARGET);
    let reading = activation_read(&harness).await;
    activate_sample(&harness.actions, &reading, GENERATION, TARGET, true).await.unwrap();
    withdraw_device(&harness.actions, GENERATION, publication::SECOND_SEQUENCE, DEVICE, CancellationToken::new()).await.unwrap();
    let reading = activation_read(&harness).await;
    activate_sample(&harness.actions, &reading, GENERATION, TARGET, true).await.unwrap();
    harness.stop().await;
}

const SEARCH_TITLE: &str = "Synthetic title";
const SEARCH_AUTHOR: &str = "Synthetic author";
const SEARCH_MARKET: &str = "GB";
const SEARCH_LIMIT: usize = 1;
const DEFERRED_SEARCH_CAPACITY: usize = 8;

fn search_input() -> ConnectSearchInput { ConnectSearchInput { title: SEARCH_TITLE.to_owned(), author: SEARCH_AUTHOR.to_owned(), market: SEARCH_MARKET.to_owned(), limit: SEARCH_LIMIT } }

#[tokio::test]
async fn one_read_only_search_can_wait_for_the_active_http_request_without_replaying_it() {
    let (release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_refresh(None, Some(gate), Some(started)); harness.register().await;
    let (result, reading) = oneshot::channel(); harness.actions.send(ConnectAction::Read { generation: GENERATION, result }).await.unwrap(); observing.await.unwrap();
    let (result, searching) = oneshot::channel(); harness.actions.send(ConnectAction::Search { generation: GENERATION, input: search_input(), search_cancellation: CancellationToken::new(), result }).await.unwrap();
    harness.inbound(PAUSE).await; harness.events.recv().await.unwrap(); harness.acknowledge(false).await.unwrap();
    release.send(()).unwrap(); reading.await.unwrap().unwrap(); assert!(searching.await.unwrap().unwrap().is_empty());
    assert_eq!(harness.calls.lock().unwrap().search_requests.len(), ONE_CALL); harness.stop().await;
}

#[tokio::test]
async fn queued_search_capacity_is_bounded_and_cancellation_prevents_later_http_dispatch() {
    let (release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_refresh(None, Some(gate), Some(started)); harness.register().await;
    let (result, reading) = oneshot::channel(); harness.actions.send(ConnectAction::Read { generation: GENERATION, result }).await.unwrap(); observing.await.unwrap();
    let cancellation = CancellationToken::new();
    let mut queued = Vec::new();
    for _position in EMPTY_CALL_COUNT..DEFERRED_SEARCH_CAPACITY {
        let (result, searching) = oneshot::channel(); harness.actions.send(ConnectAction::Search { generation: GENERATION, input: search_input(), search_cancellation: cancellation.clone(), result }).await.unwrap();
        queued.push(searching);
    }
    let (result, excessive) = oneshot::channel(); harness.actions.send(ConnectAction::Search { generation: GENERATION, input: search_input(), search_cancellation: CancellationToken::new(), result }).await.unwrap();
    assert!(matches!(excessive.await.unwrap(), Err(Failure::Backpressure))); cancellation.cancel(); release.send(()).unwrap(); reading.await.unwrap().unwrap();
    for searching in queued { assert!(matches!(searching.await.unwrap(), Err(Failure::Canceled))); }
    assert!(harness.calls.lock().unwrap().search_requests.is_empty()); harness.stop().await;
}

#[tokio::test]
async fn native_shutdown_retires_a_queued_search_before_it_can_reach_http() {
    let (_release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_refresh(None, Some(gate), Some(started)); harness.register().await;
    let (result, reading) = oneshot::channel(); harness.actions.send(ConnectAction::Read { generation: GENERATION, result }).await.unwrap(); observing.await.unwrap();
    let (result, searching) = oneshot::channel(); harness.actions.send(ConnectAction::Search { generation: GENERATION, input: search_input(), search_cancellation: CancellationToken::new(), result }).await.unwrap();
    harness.inbound(PAUSE).await; harness.events.recv().await.unwrap(); harness.acknowledge(false).await.unwrap(); harness.cancellation.cancel();
    assert!(matches!(reading.await.unwrap(), Err(Failure::Canceled))); assert!(matches!(searching.await.unwrap(), Err(Failure::Canceled)));
    assert!(harness.calls.lock().unwrap().search_requests.is_empty()); harness.stop().await;
}

#[tokio::test]
async fn host_withdrawal_waits_for_passive_http_work_without_replay_or_foreign_takeover() {
    let (release, gate) = oneshot::channel(); let (started, observing) = oneshot::channel();
    let mut harness = Harness::with_refresh(None, Some(gate), Some(started)); harness.register().await;
    let (result, reading) = oneshot::channel(); harness.actions.send(ConnectAction::Read { generation: GENERATION, result }).await.unwrap(); observing.await.unwrap();
    let (result, withdrawn) = oneshot::channel(); harness.actions.send(ConnectAction::Withdraw { generation: GENERATION, device_identifier: DEVICE.to_owned(),
        session_identifier: publication::SESSION.to_owned(), sequence: publication::FIRST_SEQUENCE, cancellation: CancellationToken::new(), result }).await.unwrap();
    harness.inbound(PAUSE).await; harness.events.recv().await.unwrap(); harness.acknowledge(false).await.unwrap(); release.send(()).unwrap();
    reading.await.unwrap().unwrap(); withdrawn.await.unwrap().unwrap();
    assert_eq!(harness.calls.lock().unwrap().deactivation_sequences.len(), ONE_CALL); harness.stop().await;
}

#[tokio::test]
async fn http_catalog_backpressure_is_returned_without_repeating_the_search() {
    let mut harness = Harness::start(None); harness.register().await;
    harness.calls.lock().unwrap().search_failure = Some(Failure::Backpressure);
    let (result, searching) = oneshot::channel(); harness.actions.send(ConnectAction::Search { generation: GENERATION, input: search_input(), search_cancellation: CancellationToken::new(), result }).await.unwrap();
    assert!(matches!(searching.await.unwrap(), Err(Failure::Backpressure)));
    assert_eq!(harness.calls.lock().unwrap().search_requests.len(), ONE_CALL); harness.stop().await;
}
