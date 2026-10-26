use streaming_spotify_session::{connect_registry::ConnectRegistry,
    connect_transport::{ConnectAction, ConnectEvent, ConnectEventData}, model::Failure};
use tokio::{runtime::Handle, sync::oneshot};

const GENERATION: u64 = 1;
const STALE_HANDLE: u64 = 9876;
const OBSERVED_MILLISECONDS: u64 = 123;
const EMITTED_EVENTS: usize = 7;
const MAXIMUM_BATCH_SIZE: usize = 4;
const REMAINING_EVENTS: usize = 3;
const NEXT_HANDLE_INCREMENT: u64 = 1;
const FIRST_REQUEST: &str = "first-native-command";
const SECOND_REQUEST: &str = "second-native-command";
const MAXIMUM_PENDING_COMMANDS: usize = 16;
const REQUEST_PREFIX: &str = "bounded-native-command-";
const FIRST_REQUEST_POSITION: usize = 0;

#[tokio::test]
async fn replacement_is_blocked_until_the_old_connection_has_completed_cleanup() {
    let registry = ConnectRegistry::default();
    let (finished, completed) = oneshot::channel();
    let handle = registry.start(&Handle::current(), |_, _, cancellation| async move {
        cancellation.cancelled().await; let _ = finished.send(());
    }).unwrap();
    assert!(matches!(registry.start(&Handle::current(), |_, _, _| async {}), Err(Failure::Backpressure)));
    assert!(matches!(registry.finish(handle), Err(Failure::Backpressure)));
    registry.cancel(handle).unwrap(); completed.await.unwrap();
    assert!(registry.poll(handle).unwrap().finished);
    registry.finish(handle).unwrap();
    let replacement = registry.start(&Handle::current(), |_, _, _| async {}).unwrap();
    assert_eq!(replacement, handle + NEXT_HANDLE_INCREMENT);
    assert!(matches!(registry.cancel(handle), Err(Failure::Canceled)));
    assert!(matches!(registry.finish(handle), Err(Failure::Canceled)));
    tokio::task::yield_now().await;
    registry.finish(replacement).unwrap();
}

#[tokio::test]
async fn cancellation_fences_new_actions_while_cleanup_still_owns_the_connection() {
    let registry = ConnectRegistry::default();
    let (finish_cleanup, cleanup) = oneshot::channel();
    let handle = registry.start(&Handle::current(), |_, _, cancellation| async move {
        cancellation.cancelled().await; let _ = cleanup.await;
    }).unwrap();
    assert!(registry.actions(handle).is_ok()); registry.cancel(handle).unwrap();
    assert!(matches!(registry.actions(handle), Err(Failure::Canceled)));
    assert!(matches!(registry.finish(handle), Err(Failure::Backpressure)));
    finish_cleanup.send(()).unwrap(); tokio::task::yield_now().await;
    registry.finish(handle).unwrap();
}

#[tokio::test]
async fn event_batches_are_bounded_and_finished_is_reported_after_the_final_batch() {
    let registry = ConnectRegistry::default();
    let (finished, completed) = oneshot::channel();
    let handle = registry.start(&Handle::current(), |events, _, _| async move {
        for _ in std::iter::repeat_n((), EMITTED_EVENTS) {
            events.send(ConnectEvent { generation: GENERATION, observed_monotonic_milliseconds: OBSERVED_MILLISECONDS,
                data: ConnectEventData::Connecting }).await.unwrap();
        }
        let _ = finished.send(());
    }).unwrap();
    completed.await.unwrap();
    assert!(matches!(registry.finish(handle), Err(Failure::Backpressure)));
    let first = registry.poll(handle).unwrap(); assert_eq!(first.events.len(), MAXIMUM_BATCH_SIZE); assert!(!first.finished);
    let last = registry.poll(handle).unwrap(); assert_eq!(last.events.len(), REMAINING_EVENTS); assert!(last.finished);
    registry.finish(handle).unwrap();
}

#[tokio::test]
async fn stale_handles_cannot_read_cancel_finish_or_dispatch_to_another_connection() {
    let registry = ConnectRegistry::default();
    let (finished, completed) = oneshot::channel();
    let handle = registry.start(&Handle::current(), |_, _, cancellation| async move {
        cancellation.cancelled().await; let _ = finished.send(());
    }).unwrap();
    assert!(matches!(registry.poll(STALE_HANDLE), Err(Failure::Canceled)));
    assert!(matches!(registry.actions(STALE_HANDLE), Err(Failure::Canceled)));
    assert!(matches!(registry.cancel(STALE_HANDLE), Err(Failure::Canceled)));
    assert!(matches!(registry.finish(STALE_HANDLE), Err(Failure::Canceled)));
    assert!(registry.actions(handle).is_ok());
    registry.cancel(handle).unwrap(); completed.await.unwrap(); registry.finish(handle).unwrap();
}

#[tokio::test]
async fn account_bound_action_channel_closes_when_the_transport_finishes() {
    let registry = ConnectRegistry::default();
    let handle = registry.start(&Handle::current(), |_, _, _| async {}).unwrap();
    let actions = registry.actions(handle).unwrap();
    tokio::task::yield_now().await;
    let (result, _) = oneshot::channel();
    assert!(actions.send(ConnectAction::Refresh { generation: GENERATION, result }).await.is_err());
    assert!(matches!(registry.actions(handle), Err(Failure::Canceled)));
    registry.finish(handle).unwrap();
}

#[tokio::test]
async fn individual_command_cancellation_preserves_other_requests_and_cannot_reuse_a_pending_identifier() {
    let registry = ConnectRegistry::default(); let (finished, completed) = oneshot::channel();
    let handle = registry.start(&Handle::current(), |_, _, cancellation| async move {
        cancellation.cancelled().await; let _ = finished.send(());
    }).unwrap();
    registry.begin_command(handle, FIRST_REQUEST).unwrap(); registry.begin_command(handle, SECOND_REQUEST).unwrap();
    let first = registry.command_cancellation(handle, FIRST_REQUEST).unwrap(); let second = registry.command_cancellation(handle, SECOND_REQUEST).unwrap();
    registry.cancel_command(handle, FIRST_REQUEST).unwrap(); assert!(first.is_cancelled()); assert!(!second.is_cancelled());
    assert!(matches!(registry.begin_command(handle, FIRST_REQUEST), Err(Failure::Backpressure)));
    registry.finish_command(handle, FIRST_REQUEST).unwrap(); registry.begin_command(handle, FIRST_REQUEST).unwrap();
    assert!(!registry.command_cancellation(handle, FIRST_REQUEST).unwrap().is_cancelled());
    assert!(matches!(registry.cancel_command(STALE_HANDLE, SECOND_REQUEST), Err(Failure::Canceled)));
    assert!(!second.is_cancelled()); registry.cancel(handle).unwrap(); assert!(second.is_cancelled());
    completed.await.unwrap(); registry.finish(handle).unwrap();
}

#[tokio::test]
async fn native_command_capacity_is_bounded_and_released_only_after_finishing_a_request() {
    let registry = ConnectRegistry::default(); let (finished, completed) = oneshot::channel();
    let handle = registry.start(&Handle::current(), |_, _, cancellation| async move {
        cancellation.cancelled().await; let _ = finished.send(());
    }).unwrap();
    for position in FIRST_REQUEST_POSITION..MAXIMUM_PENDING_COMMANDS {
        registry.begin_command(handle, &format!("{REQUEST_PREFIX}{position}")).unwrap();
    }
    assert!(matches!(registry.begin_command(handle, FIRST_REQUEST), Err(Failure::Backpressure)));
    registry.finish_command(handle, &format!("{REQUEST_PREFIX}{FIRST_REQUEST_POSITION}")).unwrap();
    registry.begin_command(handle, FIRST_REQUEST).unwrap(); registry.cancel(handle).unwrap(); completed.await.unwrap(); registry.finish(handle).unwrap();
}

#[tokio::test]
async fn spontaneous_transport_completion_cancels_reserved_command_tokens() {
    let registry = ConnectRegistry::default(); let (finish_transport, transport) = oneshot::channel();
    let handle = registry.start(&Handle::current(), |_, _, _| async move { let _ = transport.await; }).unwrap();
    registry.begin_command(handle, FIRST_REQUEST).unwrap(); let token = registry.command_cancellation(handle, FIRST_REQUEST).unwrap();
    finish_transport.send(()).unwrap(); tokio::task::yield_now().await;
    assert!(token.is_cancelled()); registry.finish(handle).unwrap();
}
