use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use streaming_spotify_session::{connect_transport::{process_dealer_socket, OutgoingFrame},
    connect_wire::DealerInput, model::Failure};
use tokio::{io::{duplex, DuplexStream}, sync::{mpsc, oneshot}, task::JoinHandle};
use tokio_tungstenite::{WebSocketStream, tungstenite::{protocol::Role, Message}};
use tokio_util::sync::CancellationToken;

const BUFFER_BYTES: usize = 8192;
const CAPACITY: usize = 4;
const SATURATED_CAPACITY: usize = 1;
const PONG_TIMEOUT_EXCEEDED_SECONDS: u64 = 6;
const HEARTBEAT_INTERVAL_SECONDS: u64 = 30;
const CLOSE_TIMEOUT_EXCEEDED_SECONDS: u64 = 6;
const JSON_PONG: &str = "{\"type\":\"pong\"}";
const INFORMATIONAL_FRAME: &str = "{\"type\":\"message\",\"uri\":\"synthetic-unhandled\"}";
const REPLY_FRAME: &str = "{\"type\":\"reply\",\"key\":\"synthetic\",\"payload\":{\"success\":false}}";

struct Harness {
    remote: WebSocketStream<DuplexStream>,
    incoming: mpsc::Receiver<DealerInput>,
    outgoing: mpsc::Sender<OutgoingFrame>,
    cancellation: CancellationToken,
    task: JoinHandle<Result<(), Failure>>,
}

impl Harness {
    async fn start(capacity: usize) -> Self {
        let (local, remote) = duplex(BUFFER_BYTES);
        let socket = WebSocketStream::from_raw_socket(local, Role::Client, None).await;
        let remote = WebSocketStream::from_raw_socket(remote, Role::Server, None).await;
        let (incoming_sender, incoming) = mpsc::channel(capacity);
        let (outgoing, output) = mpsc::channel(CAPACITY);
        let cancellation = CancellationToken::new();
        let task = tokio::spawn(process_dealer_socket(socket, incoming_sender, outgoing.clone(), output, cancellation.clone()));
        Self { remote, incoming, outgoing, cancellation, task }
    }

    async fn heartbeat(&mut self) {
        assert!(matches!(self.remote.next().await.unwrap().unwrap(), Message::Ping(_)));
    }

    async fn stop(mut self) {
        self.cancellation.cancel();
        let _ = self.remote.close(None).await;
        assert!(matches!(self.task.await.unwrap(), Err(Failure::Canceled)));
    }
}

#[tokio::test(start_paused = true)]
async fn command_receipts_are_delivered_after_the_frame_is_flushed_to_the_socket() {
    let mut harness = Harness::start(CAPACITY).await;
    harness.heartbeat().await;
    let (receipt, result) = oneshot::channel();
    harness.outgoing.send(OutgoingFrame { message: Message::Text(REPLY_FRAME.into()), receipt: Some(receipt) }).await.unwrap();
    assert!(result.await.unwrap().is_ok());
    assert_eq!(harness.remote.next().await.unwrap().unwrap().into_text().unwrap(), REPLY_FRAME);
    harness.stop().await;
}

#[tokio::test(start_paused = true)]
async fn heartbeat_deadline_closes_a_peer_that_does_not_pong() {
    let mut harness = Harness::start(CAPACITY).await;
    harness.heartbeat().await;
    tokio::time::advance(Duration::from_secs(PONG_TIMEOUT_EXCEEDED_SECONDS)).await;
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(CLOSE_TIMEOUT_EXCEEDED_SECONDS)).await;
    assert!(matches!(harness.task.await.unwrap(), Err(Failure::Deadline)));
}

#[tokio::test(start_paused = true)]
async fn json_pong_keeps_the_socket_alive_even_without_an_actor_consuming_registration() {
    let mut harness = Harness::start(CAPACITY).await;
    harness.heartbeat().await;
    harness.remote.send(Message::Text(JSON_PONG.into())).await.unwrap();
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(PONG_TIMEOUT_EXCEEDED_SECONDS)).await;
    tokio::task::yield_now().await;
    assert!(!harness.task.is_finished());
    tokio::time::advance(Duration::from_secs(HEARTBEAT_INTERVAL_SECONDS)).await;
    harness.heartbeat().await;
    harness.stop().await;
}

#[tokio::test(start_paused = true)]
async fn input_overflow_forces_reconnection_instead_of_silently_dropping_state() {
    let mut harness = Harness::start(SATURATED_CAPACITY).await;
    harness.heartbeat().await;
    harness.remote.send(Message::Text(INFORMATIONAL_FRAME.into())).await.unwrap();
    harness.remote.send(Message::Text(INFORMATIONAL_FRAME.into())).await.unwrap();
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(CLOSE_TIMEOUT_EXCEEDED_SECONDS)).await;
    assert!(matches!(harness.task.await.unwrap(), Err(Failure::Backpressure)));
    assert!(matches!(harness.incoming.recv().await, Some(DealerInput::Unhandled)));
    assert!(harness.incoming.recv().await.is_none());
}
