use librespot_protocol::{connect::Cluster, player::PlayerState};
use protobuf::MessageField;
use serde_json::json;
use streaming_spotify_session::{connect_command_journal::{ConnectCommandJournal, COMMAND_CONFIRMATION_TIMEOUT_SECONDS},
    connect_receipts::{decode_command_acknowledgement, ConnectCommandAcknowledgement}, connect_wire::{normalize_cluster, ConnectCluster}, model::Failure};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

const HOST: &str = "synthetic-host";
const OTHER_HOST: &str = "synthetic-replacement-host";
const ACKNOWLEDGEMENT: &str = "synthetic-server-acknowledgement";
const OTHER_ACKNOWLEDGEMENT: &str = "synthetic-unrelated-acknowledgement";
const ACKNOWLEDGEMENT_FIELD: &str = "ack_id";
const REVISION: &str = "synthetic-observed-queue-revision";
const OBSERVED_NATIVE_MILLISECONDS: u64 = 123;
const DEADLINE_OVERAGE_SECONDS: u64 = 1;
const MAXIMUM_PENDING_COMMANDS: usize = 16;
const FIRST_POSITION: usize = 0;
const INITIAL_SERVER_MILLISECONDS: i64 = 0;
const PREFLIGHT_SERVER_MILLISECONDS: i64 = 2000;
const OLDER_SERVER_MILLISECONDS: i64 = 1999;
const EMPTY_BODY: &[u8] = b"";
const ACKNOWLEDGEMENT_PREFIX: &str = "synthetic-capacity-acknowledgement-";

type Receipt = oneshot::Receiver<Result<ConnectCommandAcknowledgement, Failure>>;
fn acknowledgement(identifier: &str) -> ConnectCommandAcknowledgement {
    decode_command_acknowledgement(&serde_json::to_vec(&json!({ (ACKNOWLEDGEMENT_FIELD): identifier })).unwrap())
}
fn cluster(host: &str, identifier: &str) -> ConnectCluster {
    let mut cluster = normalize_cluster(Cluster { active_device_id: host.to_owned(), player_state: MessageField::some(PlayerState {
        queue_revision: REVISION.to_owned(), ..Default::default() }), ..Default::default() }).unwrap();
    cluster.acknowledgement_identifier = Some(identifier.to_owned()); cluster
}
fn accept(journal: &mut ConnectCommandJournal, identifier: &str, cancellation: CancellationToken) -> Receipt {
    let (completion, receipt) = oneshot::channel();
    journal.accept(acknowledgement(identifier), HOST.to_owned(), INITIAL_SERVER_MILLISECONDS, cancellation, completion); receipt
}

#[tokio::test]
async fn http_acceptance_and_unrelated_cluster_changes_do_not_confirm_delivery() {
    let mut journal = ConnectCommandJournal::default(); let mut receipt = accept(&mut journal, ACKNOWLEDGEMENT, CancellationToken::new());
    assert!(matches!(receipt.try_recv(), Err(oneshot::error::TryRecvError::Empty)));
    journal.observe(&cluster(HOST, OTHER_ACKNOWLEDGEMENT), OBSERVED_NATIVE_MILLISECONDS);
    assert!(matches!(receipt.try_recv(), Err(oneshot::error::TryRecvError::Empty)));
    journal.observe(&cluster(HOST, ACKNOWLEDGEMENT), OBSERVED_NATIVE_MILLISECONDS);
    let receipt = receipt.await.unwrap().unwrap(); assert!(receipt.delivery_observed);
    assert_eq!(receipt.observed_queue_revision.as_deref(), Some(REVISION));
    assert_eq!(receipt.observed_native_monotonic_milliseconds, Some(OBSERVED_NATIVE_MILLISECONDS));
}

#[tokio::test]
async fn a_host_replacement_after_dispatch_preserves_uncertainty_instead_of_confirming_another_device() {
    let mut journal = ConnectCommandJournal::default(); let receipt = accept(&mut journal, ACKNOWLEDGEMENT, CancellationToken::new());
    journal.observe(&cluster(OTHER_HOST, ACKNOWLEDGEMENT), OBSERVED_NATIVE_MILLISECONDS);
    assert!(matches!(receipt.await.unwrap(), Err(Failure::UnknownOutcome)));
}

#[tokio::test]
async fn cancellation_after_http_acceptance_cannot_become_a_late_successful_delivery() {
    let mut journal = ConnectCommandJournal::default(); let cancellation = CancellationToken::new();
    let receipt = accept(&mut journal, ACKNOWLEDGEMENT, cancellation.clone()); cancellation.cancel();
    journal.observe(&cluster(HOST, ACKNOWLEDGEMENT), OBSERVED_NATIVE_MILLISECONDS);
    assert!(matches!(receipt.await.unwrap(), Err(Failure::UnknownOutcome)));
}

#[tokio::test(start_paused = true)]
async fn expired_server_acknowledgements_report_unknown_once_and_never_replay_the_mutation() {
    let mut journal = ConnectCommandJournal::default(); let receipt = accept(&mut journal, ACKNOWLEDGEMENT, CancellationToken::new());
    tokio::time::advance(std::time::Duration::from_secs(COMMAND_CONFIRMATION_TIMEOUT_SECONDS + DEADLINE_OVERAGE_SECONDS)).await;
    journal.expire(); assert!(matches!(receipt.await.unwrap(), Err(Failure::UnknownOutcome)));
    journal.observe(&cluster(HOST, ACKNOWLEDGEMENT), OBSERVED_NATIVE_MILLISECONDS); assert!(journal.has_capacity());
}

#[tokio::test]
async fn missing_or_reused_server_acknowledgements_never_invent_correlations() {
    let mut journal = ConnectCommandJournal::default(); let (completion, receipt) = oneshot::channel();
    journal.accept(decode_command_acknowledgement(EMPTY_BODY), HOST.to_owned(), INITIAL_SERVER_MILLISECONDS, CancellationToken::new(), completion);
    assert!(matches!(receipt.await.unwrap(), Err(Failure::UnknownOutcome)));
    let first = accept(&mut journal, ACKNOWLEDGEMENT, CancellationToken::new());
    let second = accept(&mut journal, ACKNOWLEDGEMENT, CancellationToken::new());
    assert!(matches!(first.await.unwrap(), Err(Failure::UnknownOutcome)));
    assert!(matches!(second.await.unwrap(), Err(Failure::UnknownOutcome)));
}

#[tokio::test]
async fn pending_confirmation_capacity_is_bounded_and_abandoned_receipts_release_their_slot() {
    let mut journal = ConnectCommandJournal::default();
    let mut receipts = (FIRST_POSITION..MAXIMUM_PENDING_COMMANDS).map(|position| accept(&mut journal,
        &(ACKNOWLEDGEMENT_PREFIX.to_owned() + &position.to_string()), CancellationToken::new())).collect::<Vec<_>>();
    assert!(!journal.has_capacity());
    let overflow = accept(&mut journal, ACKNOWLEDGEMENT, CancellationToken::new());
    assert!(matches!(overflow.await.unwrap(), Err(Failure::UnknownOutcome)));
    drop(receipts.remove(FIRST_POSITION)); journal.expire(); assert!(journal.has_capacity());
}

#[tokio::test]
async fn connection_retirement_leaves_accepted_but_unobserved_commands_uncertain() {
    let mut journal = ConnectCommandJournal::default(); let receipt = accept(&mut journal, ACKNOWLEDGEMENT, CancellationToken::new());
    drop(journal); assert!(matches!(receipt.await.unwrap(), Err(Failure::UnknownOutcome)));
}

#[tokio::test]
async fn a_cached_host_change_older_than_preflight_cannot_retire_a_current_pending_confirmation() {
    let mut journal = ConnectCommandJournal::default(); let (completion, mut receipt) = oneshot::channel();
    journal.accept(acknowledgement(ACKNOWLEDGEMENT), HOST.to_owned(), PREFLIGHT_SERVER_MILLISECONDS, CancellationToken::new(), completion);
    let mut cached = cluster(OTHER_HOST, OTHER_ACKNOWLEDGEMENT); cached.server_at_milliseconds = OLDER_SERVER_MILLISECONDS;
    journal.observe(&cached, OBSERVED_NATIVE_MILLISECONDS);
    assert!(matches!(receipt.try_recv(), Err(oneshot::error::TryRecvError::Empty)));
    journal.observe(&cluster(HOST, ACKNOWLEDGEMENT), OBSERVED_NATIVE_MILLISECONDS);
    assert!(receipt.await.unwrap().unwrap().delivery_observed);
}
