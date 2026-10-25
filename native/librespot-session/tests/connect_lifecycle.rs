use streaming_spotify_session::{connect_device::ConnectDeviceConfiguration,
    connect_transport::{run_connect_transport, ConnectEventData}, model::Failure};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

const CAPACITY: usize = 8;
const NAME: &str = "Synthetic observer";
const INVALID_RECORD: &str = "synthetic-invalid-record";
const FIRST_GENERATION: u64 = 1;
const NO_GENERATION: u64 = 0;

#[tokio::test]
async fn canceled_transport_never_attempts_credential_restore_or_device_registration() {
    let (events, mut observed) = mpsc::channel(CAPACITY);
    let (_commands, actions) = mpsc::channel(CAPACITY);
    let cancellation = CancellationToken::new(); cancellation.cancel();
    run_connect_transport(INVALID_RECORD.to_owned(), ConnectDeviceConfiguration { name: NAME.to_owned(), playback_ready: false },
        events, actions, cancellation).await;
    let event = observed.recv().await.unwrap();
    assert_eq!(event.generation, NO_GENERATION);
    assert!(matches!(event.data, ConnectEventData::Stopped { cleanup_failure: None }));
    assert!(observed.recv().await.is_none());
}

#[tokio::test]
async fn malformed_saved_credentials_stop_once_without_retrying_or_registering() {
    let (events, mut observed) = mpsc::channel(CAPACITY);
    let (_commands, actions) = mpsc::channel(CAPACITY);
    run_connect_transport(INVALID_RECORD.to_owned(), ConnectDeviceConfiguration { name: NAME.to_owned(), playback_ready: false },
        events, actions, CancellationToken::new()).await;
    assert!(matches!(observed.recv().await.unwrap().data, ConnectEventData::Connecting));
    let rejected = observed.recv().await.unwrap(); assert_eq!(rejected.generation, FIRST_GENERATION);
    assert!(matches!(rejected.data, ConnectEventData::Reconnecting { failure } if failure == Failure::InvalidInput.code()));
    assert!(matches!(observed.recv().await.unwrap().data, ConnectEventData::Stopped { cleanup_failure: None }));
    assert!(observed.recv().await.is_none());
}
