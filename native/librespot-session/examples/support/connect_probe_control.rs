use std::{path::{Path, PathBuf}, sync::{Arc, atomic::{AtomicU64, Ordering}}, time::Duration};
use std::os::unix::fs::{FileTypeExt, MetadataExt, PermissionsExt};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use streaming_spotify_session::{connect_commands::ConnectCommand, connect_metadata::encode_metadata_request,
    connect_receipts::ConnectCommandAcknowledgement, connect_transport::{native_monotonic_milliseconds, ConnectAction}, model::Failure};
use tokio::{io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader}, net::{UnixListener, UnixStream}, sync::{mpsc, oneshot}, task::JoinSet};
use tokio_util::sync::CancellationToken;

const MAXIMUM_INPUT_BYTES: usize = 131072;
const INPUT_BOUNDARY_INCREMENT: usize = 1;
const MAXIMUM_CLIENTS: usize = 4;
const REQUEST_TIMEOUT_SECONDS: u64 = 20;
const SOCKET_PERMISSIONS: u32 = 0o600;
const MINIMUM_GENERATION: u64 = 1;
const MAXIMUM_GENERATION: u64 = 9007199254740991;
const PROBE_HANDLE: u64 = 1;
const HANDLE_FIELD: &str = "handle";
const GENERATION_FIELD: &str = "generation";
const SAMPLED_NATIVE_FIELD: &str = "sampledNativeMonotonicMilliseconds";
const READING_FIELD: &str = "reading";
const TRACKS_FIELD: &str = "tracks";
const LINE_SEPARATOR: &[u8] = b"\n";

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum ProbeRequest {
    Read {},
    Membership {},
    Metadata { identifiers: Vec<String> },
    Command { generation: u64, request_identifier: String, target_device_identifier: String, command: ConnectCommand },
}

#[derive(Serialize)]
struct Receipt { failure: Option<&'static str> }

#[derive(Serialize)]
struct CommandReceipt { failure: Option<&'static str>, acknowledgement: ConnectCommandAcknowledgement }

struct SocketOwner { path: PathBuf, file_identity: u64 }
impl Drop for SocketOwner {
    fn drop(&mut self) {
        if std::fs::symlink_metadata(&self.path).is_ok_and(|metadata| metadata.file_type().is_socket() && metadata.ino() == self.file_identity) {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

pub fn decode_request(bytes: &[u8]) -> Result<ProbeRequest, Failure> {
    if bytes.len() > MAXIMUM_INPUT_BYTES { return Err(Failure::InvalidInput); }
    let request: ProbeRequest = serde_json::from_slice(bytes).map_err(|_| Failure::InvalidInput)?;
    match &request {
        ProbeRequest::Read {} | ProbeRequest::Membership {} => (),
        ProbeRequest::Metadata { identifiers } => { encode_metadata_request(identifiers)?; },
        ProbeRequest::Command { generation, request_identifier, target_device_identifier, command } => {
            if *generation < MINIMUM_GENERATION || *generation > MAXIMUM_GENERATION { return Err(Failure::InvalidInput); }
            command.validate(request_identifier, target_device_identifier)?;
        },
    }
    Ok(request)
}

fn bind(path: &Path) -> Result<(UnixListener, SocketOwner), Failure> {
    if let Ok(metadata) = std::fs::symlink_metadata(path) {
        if !metadata.file_type().is_socket() { return Err(Failure::InvalidInput); }
        match std::os::unix::net::UnixStream::connect(path) {
            Ok(_) => return Err(Failure::Backpressure),
            Err(failure) if failure.kind() == std::io::ErrorKind::ConnectionRefused => std::fs::remove_file(path).map_err(|_| Failure::Network)?,
            Err(_) => return Err(Failure::Network),
        }
    }
    let listener = UnixListener::bind(path).map_err(|_| Failure::Network)?;
    let owner = SocketOwner { path: path.to_owned(), file_identity: std::fs::symlink_metadata(path).map_err(|_| Failure::Network)?.ino() };
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(SOCKET_PERMISSIONS)).map_err(|_| Failure::Network)?;
    Ok((listener, owner))
}

async fn execute(request: ProbeRequest, actions: &mpsc::Sender<ConnectAction>, generation: &AtomicU64, cancellation: &CancellationToken) -> Result<Value, Failure> {
    match request {
        ProbeRequest::Read {} => {
            let generation = generation.load(Ordering::Acquire);
            let (result, response) = oneshot::channel();
            actions.try_send(ConnectAction::Read { generation, result }).map_err(|_| Failure::Backpressure)?;
            let reading = response.await.map_err(|_| Failure::Canceled)??;
            Ok(serde_json::json!({ (HANDLE_FIELD): PROBE_HANDLE, (GENERATION_FIELD): generation,
                (SAMPLED_NATIVE_FIELD): native_monotonic_milliseconds(), (READING_FIELD): reading }))
        },
        ProbeRequest::Membership {} => {
            let generation = generation.load(Ordering::Acquire);
            let (result, response) = oneshot::channel();
            actions.try_send(ConnectAction::Membership { generation, result }).map_err(|_| Failure::Backpressure)?;
            let reading = response.await.map_err(|_| Failure::Canceled)??;
            Ok(serde_json::json!({ (HANDLE_FIELD): PROBE_HANDLE, (GENERATION_FIELD): generation, (READING_FIELD): reading }))
        },
        ProbeRequest::Metadata { identifiers } => {
            let generation = generation.load(Ordering::Acquire);
            let (result, response) = oneshot::channel();
            actions.try_send(ConnectAction::Metadata { generation, identifiers, result }).map_err(|_| Failure::Backpressure)?;
            let tracks = response.await.map_err(|_| Failure::Canceled)??;
            Ok(serde_json::json!({ (HANDLE_FIELD): PROBE_HANDLE, (GENERATION_FIELD): generation, (TRACKS_FIELD): tracks }))
        },
        ProbeRequest::Command { generation, request_identifier, target_device_identifier, command } => {
            let (result, response) = oneshot::channel();
            actions.try_send(ConnectAction::CheckedCommand { generation, request_identifier, target_device_identifier, command,
                command_cancellation: cancellation.clone(), result }).map_err(|_| Failure::Backpressure)?;
            let acknowledgement = response.await.map_err(|_| Failure::UnknownOutcome)??;
            serde_json::to_value(CommandReceipt { failure: None, acknowledgement }).map_err(|_| Failure::InvalidResponse)
        },
    }
}

async fn client(stream: UnixStream, actions: mpsc::Sender<ConnectAction>, generation: Arc<AtomicU64>, cancellation: CancellationToken) {
    let request_cancellation = cancellation.child_token();
    let mut reader = BufReader::new(stream);
    let operation = async {
        let mut bytes = Vec::new();
        (&mut reader).take((MAXIMUM_INPUT_BYTES + INPUT_BOUNDARY_INCREMENT) as u64).read_until(LINE_SEPARATOR[LINE_POSITION], &mut bytes)
            .await.map_err(|_| Failure::InvalidInput)?;
        let request = decode_request(&bytes)?;
        let query = execute(request, &actions, &generation, &request_cancellation);
        let mut surplus = [EMPTY_BYTE; SURPLUS_CAPACITY];
        tokio::select! { biased;
            _ = reader.read(&mut surplus) => Err(Failure::UnknownOutcome),
            response = query => response,
        }
    };
    let result = tokio::select! { biased;
        _ = cancellation.cancelled() => Err(Failure::Canceled),
        result = tokio::time::timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS), operation) => result.unwrap_or(Err(Failure::UnknownOutcome)),
    };
    request_cancellation.cancel();
    let response = match result { Ok(response) => response, Err(failure) => serde_json::to_value(Receipt { failure: Some(failure.code()) }).unwrap_or(Value::Null) };
    if let Ok(mut bytes) = serde_json::to_vec(&response) {
        bytes.extend_from_slice(LINE_SEPARATOR);
        let _ = tokio::time::timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS), reader.get_mut().write_all(&bytes)).await;
    }
}

const EMPTY_BYTE: u8 = 0;
const SURPLUS_CAPACITY: usize = 1;
const LINE_POSITION: usize = 0;

pub async fn serve(path: &Path, actions: mpsc::Sender<ConnectAction>, generation: Arc<AtomicU64>, cancellation: CancellationToken, ready: Option<oneshot::Sender<()>>) -> Result<(), Failure> {
    let (listener, _owner) = bind(path)?;
    if let Some(ready) = ready { let _ = ready.send(()); }
    let mut clients = JoinSet::new();
    loop {
        tokio::select! { biased;
            _ = cancellation.cancelled() => { clients.abort_all(); while clients.join_next().await.is_some() {} return Ok(()); },
            _ = clients.join_next(), if !clients.is_empty() => (),
            accepted = listener.accept(), if clients.len() < MAXIMUM_CLIENTS => {
                let (stream, _) = accepted.map_err(|_| Failure::Network)?;
                clients.spawn(client(stream, actions.clone(), Arc::clone(&generation), cancellation.clone()));
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const ACCESS_PERMISSIONS_MASK: u32 = 0o777;
    use streaming_spotify_session::{connect_transport::ConnectReading, connect_wire::normalize_cluster};
    const READ_REQUEST: &[u8] = br#"{"operation":"read"}"#;
    const MEMBERSHIP_REQUEST: &[u8] = br#"{"operation":"membership"}"#;
    const COMMAND_REQUEST: &[u8] = br#"{"operation":"command","generation":1,"requestIdentifier":"socket-command","targetDeviceIdentifier":"socket-host","command":{"kind":"pause"}}"#;
    const UNKNOWN_REQUEST: &[u8] = br#"{"operation":"read","storedCredential":"synthetic-private-value"}"#;
    const MALFORMED_METADATA_REQUEST: &[u8] = br#"{"operation":"metadata","identifiers":["invalid"]}"#;
    const PATH_PREFIX: &str = "streaming-service-connect-probe-";
    const ROUNDTRIP_SUFFIX: &str = "-roundtrip.sock";
    const CANCELED_SUFFIX: &str = "-canceled.sock";
    const OWNERSHIP_SUFFIX: &str = "-ownership.sock";
    const FILE_SUFFIX: &str = "-file.sock";
    const LIVE_SUFFIX: &str = "-live.sock";
    const PRIVATE_VALUE: &[u8] = b"synthetic-private-value";
    const TEST_CHANNEL_CAPACITY: usize = 4;
    const TEST_TIMEOUT_SECONDS: u64 = 5;
    const EMPTY_CLOCK_MILLISECONDS: u64 = 0;
    const UNEXPECTED_ACTION: &str = "Expected the requested native action";

    fn path(suffix: &str) -> PathBuf { std::env::temp_dir().join(PATH_PREFIX.to_owned() + &std::process::id().to_string() + suffix) }
    fn generation() -> Arc<AtomicU64> { Arc::new(AtomicU64::new(MINIMUM_GENERATION)) }

    const TEST_ACCOUNT: &str = "synthetic-probe-account";
    const ACCOUNT_FIELD: &str = "accountIdentifier";
    const MEMBERSHIP_FIELD: &str = "membership";

    #[tokio::test]
    async fn membership_channel_preserves_the_authenticated_account_and_absence_without_returning_credentials() {
        let (actions, mut requested) = mpsc::channel(TEST_CHANNEL_CAPACITY);
        let generation = generation();
        let cancellation = CancellationToken::new();
        let reading = execute(ProbeRequest::Membership {}, &actions, &generation, &cancellation);
        let provider = async {
            match requested.recv().await.unwrap() {
                ConnectAction::Membership { generation, result } => {
                    assert_eq!(generation, MINIMUM_GENERATION);
                    let _ = result.send(Ok(streaming_spotify_session::connect_membership::ConnectMembershipReading {
                        account_identifier: TEST_ACCOUNT.to_owned(), membership: None }));
                },
                _ => panic!("{}", UNEXPECTED_ACTION),
            }
        };
        let (reading, _) = tokio::join!(reading, provider);
        let reading = reading.unwrap();
        assert_eq!(reading[HANDLE_FIELD], PROBE_HANDLE);
        assert_eq!(reading[READING_FIELD][ACCOUNT_FIELD], TEST_ACCOUNT);
        assert!(reading[READING_FIELD][MEMBERSHIP_FIELD].is_null());
    }

    #[test]
    fn requests_accept_only_bounded_typed_reads_metadata_and_checked_commands_without_credentials() {
        assert!(matches!(decode_request(READ_REQUEST), Ok(ProbeRequest::Read {})));
        assert!(matches!(decode_request(MEMBERSHIP_REQUEST), Ok(ProbeRequest::Membership {})));
        assert!(matches!(decode_request(COMMAND_REQUEST), Ok(ProbeRequest::Command { .. })));
        for bytes in [UNKNOWN_REQUEST, MALFORMED_METADATA_REQUEST, PRIVATE_VALUE] { assert!(decode_request(bytes).is_err()); }
        assert!(decode_request(&vec![EMPTY_BYTE; MAXIMUM_INPUT_BYTES + INPUT_BOUNDARY_INCREMENT]).is_err());
    }

    #[tokio::test]
    async fn local_channel_is_owner_only_returns_fresh_native_read_envelopes_and_releases_its_socket() {
        let path = path(ROUNDTRIP_SUFFIX); let (actions, mut commands) = mpsc::channel(TEST_CHANNEL_CAPACITY);
        let cancellation = CancellationToken::new(); let server_cancellation = cancellation.clone();
        let server_path = path.clone(); let (ready, started) = oneshot::channel();
        let server = tokio::spawn(async move { serve(&server_path, actions, generation(), server_cancellation, Some(ready)).await });
        started.await.unwrap();
        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & ACCESS_PERMISSIONS_MASK, SOCKET_PERMISSIONS);
        let mut client = UnixStream::connect(&path).await.unwrap();
        client.write_all(READ_REQUEST).await.unwrap(); client.write_all(LINE_SEPARATOR).await.unwrap();
        let action = commands.recv().await.unwrap();
        let (requested_generation, result) = match action { ConnectAction::Read { generation, result } => Some((generation, result)), _ => None }.expect(UNEXPECTED_ACTION);
        assert_eq!(requested_generation, MINIMUM_GENERATION);
        result.send(Ok(ConnectReading { request_started_native_monotonic_milliseconds: EMPTY_CLOCK_MILLISECONDS,
            request_completed_native_monotonic_milliseconds: EMPTY_CLOCK_MILLISECONDS,
            cluster: normalize_cluster(librespot_protocol::connect::Cluster::new()).unwrap() })).ok().unwrap();
        let mut response = String::new(); BufReader::new(client).read_line(&mut response).await.unwrap();
        let value: Value = serde_json::from_str(&response).unwrap(); assert_eq!(value[HANDLE_FIELD], PROBE_HANDLE);
        assert_eq!(value[GENERATION_FIELD], MINIMUM_GENERATION); assert!(value[READING_FIELD].is_object());
        cancellation.cancel(); server.await.unwrap().unwrap(); assert!(!path.exists());
    }

    #[tokio::test]
    async fn disconnected_command_clients_cancel_their_native_reservation_instead_of_leaving_queued_mutations() {
        let path = path(CANCELED_SUFFIX); let (actions, mut commands) = mpsc::channel(TEST_CHANNEL_CAPACITY);
        let cancellation = CancellationToken::new(); let server_cancellation = cancellation.clone();
        let server_path = path.clone(); let (ready, started) = oneshot::channel();
        let server = tokio::spawn(async move { serve(&server_path, actions, generation(), server_cancellation, Some(ready)).await });
        started.await.unwrap(); let mut client = UnixStream::connect(&path).await.unwrap();
        client.write_all(COMMAND_REQUEST).await.unwrap(); client.write_all(LINE_SEPARATOR).await.unwrap();
        let action = commands.recv().await.unwrap();
        let (command_cancellation, result) = match action { ConnectAction::CheckedCommand { command_cancellation, result, .. } => Some((command_cancellation, result)), _ => None }.expect(UNEXPECTED_ACTION);
        drop(client);
        tokio::time::timeout(Duration::from_secs(TEST_TIMEOUT_SECONDS), command_cancellation.cancelled()).await.unwrap();
        assert!(result.is_closed()); cancellation.cancel(); server.await.unwrap().unwrap(); assert!(!path.exists());
    }

    #[tokio::test]
    async fn socket_binding_never_replaces_a_live_probe_or_a_regular_workspace_file() {
        let live_path = path(LIVE_SUFFIX); let (_listener, _owner) = bind(&live_path).unwrap();
        assert!(matches!(bind(&live_path), Err(Failure::Backpressure)));
        let file_path = path(FILE_SUFFIX); std::fs::write(&file_path, PRIVATE_VALUE).unwrap();
        assert!(matches!(bind(&file_path), Err(Failure::InvalidInput)));
        assert_eq!(std::fs::read(&file_path).unwrap(), PRIVATE_VALUE); std::fs::remove_file(file_path).unwrap();
    }

    #[tokio::test]
    async fn retired_socket_cleanup_cannot_delete_a_new_file_at_the_previous_path() {
        let path = path(OWNERSHIP_SUFFIX); let (listener, owner) = bind(&path).unwrap();
        std::fs::remove_file(&path).unwrap(); std::fs::write(&path, PRIVATE_VALUE).unwrap();
        drop(owner); drop(listener); assert_eq!(std::fs::read(&path).unwrap(), PRIVATE_VALUE); std::fs::remove_file(path).unwrap();
    }
}
