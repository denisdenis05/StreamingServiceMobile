#[path = "support/connect_probe_control.rs"]
mod connect_probe_control;

use std::{io::{self, BufRead, Read}, sync::{Arc, Mutex, atomic::{AtomicU64, Ordering}}};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use streaming_spotify_session::{connect_device::ConnectDeviceConfiguration,
    connect_commands::ConnectCommand, connect_metadata::ConnectTrackMetadata, connect_transport::{run_connect_transport, ConnectAction, ConnectReading, ConnectEventData}, connect_wire::ConnectCluster, model::Failure};
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

const MAXIMUM_INPUT_BYTES: usize = 131072;
const INPUT_BOUNDARY_INCREMENT: usize = 1;
const CHANNEL_CAPACITY: usize = 32;
const MAXIMUM_RUNTIME_WORKERS: usize = 2;
const LOCAL_CONTROL_PATH: &str = "build/spotify-jam/connect-probe.sock";
const FAILURE_SUMMARY_PATH: &str = "build/spotify-jam/live-registration-failure.json";
const METADATA_SUMMARY_PATH: &str = "build/spotify-jam/live-metadata-summary.json";
const METADATA_REQUEST_POSITION: usize = 0;
const OBSERVATION_SUMMARY_PATH: &str = "build/spotify-jam/live-observation-summary.json";
const OBSERVATION_SUMMARY_TEMPORARY_PATH: &str = "build/spotify-jam/live-observation-summary.json.tmp";
const TRACK_URI_PREFIX: &str = "spotify:track:";
const EMPTY_TRACK_COUNT: usize = 0;
const INITIAL_GENERATION: u64 = 0;
const INVALID_INPUT_REPORT: &str = "{\"failure\":\"invalid-input\"}";
const RUNTIME_FAILURE_REPORT: &str = "{\"failure\":\"network\"}";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProbeInput {
    stored_credential: String,
    configuration: ConnectDeviceConfiguration,
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]
enum ProbeControl {
    Refresh,
    Stop,
    Reply { key: String, accepted: bool },
    Command { target_device_identifier: String, body: Value },
    CheckedCommand { generation: u64, request_identifier: String, target_device_identifier: String, command: ConnectCommand },
}

#[derive(Serialize)]
struct ControlReceipt { failure: Option<&'static str> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ObservationSummary {
    server_at_milliseconds: i64,
    player_timestamp_milliseconds: Option<i64>,
    position_at_timestamp_milliseconds: Option<i64>,
    duration_milliseconds: Option<i64>,
    playback_speed: Option<f64>,
    playing: bool,
    paused: bool,
    buffering: bool,
    has_active_device: bool,
    has_current_occurrence: bool,
    next_count: usize,
    queued_occurrence_confirmed: bool,
    request_started_native_monotonic_milliseconds: Option<u64>,
    request_completed_native_monotonic_milliseconds: Option<u64>,
}

fn observation_summary(cluster: &ConnectCluster, expected: Option<&(String, String)>, interval: Option<(u64, u64)>) -> ObservationSummary {
    let playback = cluster.playback.as_ref();
    ObservationSummary { server_at_milliseconds: cluster.server_at_milliseconds,
        player_timestamp_milliseconds: playback.map(|state| state.timestamp_milliseconds),
        position_at_timestamp_milliseconds: playback.map(|state| state.position_as_of_timestamp_milliseconds),
        duration_milliseconds: playback.map(|state| state.duration_milliseconds),
        playback_speed: playback.map(|state| state.playback_speed),
        playing: playback.is_some_and(|state| state.playing), paused: playback.is_some_and(|state| state.paused),
        buffering: playback.is_some_and(|state| state.buffering), has_active_device: !cluster.active_device_identifier.is_empty(),
        has_current_occurrence: playback.and_then(|state| state.track.as_ref()).is_some_and(|track| track.occurrence_identifier.is_some()),
        next_count: playback.map_or(EMPTY_TRACK_COUNT, |state| state.next_tracks.len()),
        queued_occurrence_confirmed: expected.is_some_and(|(uri, occurrence)| playback.is_some_and(|state| state.next_tracks.iter()
            .any(|track| &track.uri == uri && track.occurrence_identifier.as_ref() == Some(occurrence)))),
        request_started_native_monotonic_milliseconds: interval.map(|(started, _)| started),
        request_completed_native_monotonic_milliseconds: interval.map(|(_, completed)| completed) }
}

fn write_summary(cluster: &ConnectCluster, expected: &Mutex<Option<(String, String)>>, interval: Option<(u64, u64)>) {
    if let Ok(expected) = expected.lock() {
        if let Ok(serialized) = serde_json::to_vec(&observation_summary(cluster, expected.as_ref(), interval)) {
            if std::fs::write(OBSERVATION_SUMMARY_TEMPORARY_PATH, serialized).is_ok() {
                let _ = std::fs::rename(OBSERVATION_SUMMARY_TEMPORARY_PATH, OBSERVATION_SUMMARY_PATH);
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FailureSummary { failure: &'static str, stage: streaming_spotify_session::connect_session::ConnectFailureStage }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetadataSummary { failure: Option<&'static str>, has_title: bool, artist_count: usize, has_duration: bool, recording_code_count: usize }

fn metadata_diagnostic_summary(result: Result<Vec<ConnectTrackMetadata>, Failure>) -> MetadataSummary {
    match result {
        Ok(metadata) => match metadata.get(METADATA_REQUEST_POSITION) {
            Some(track) => MetadataSummary { failure: None, has_title: !track.title.is_empty(), artist_count: track.artist_names.len(),
                has_duration: track.duration_milliseconds > INITIAL_GENERATION, recording_code_count: track.recording_codes.len() },
            None => MetadataSummary { failure: Some(Failure::InvalidResponse.code()), has_title: false, artist_count: EMPTY_TRACK_COUNT, has_duration: false, recording_code_count: EMPTY_TRACK_COUNT },
        },
        Err(failure) => MetadataSummary { failure: Some(failure.code()), has_title: false, artist_count: EMPTY_TRACK_COUNT, has_duration: false, recording_code_count: EMPTY_TRACK_COUNT },
    }
}

async fn metadata_summary(cluster: &ConnectCluster, actions: &mpsc::Sender<ConnectAction>, generation: u64) {
    let Some(identifier) = cluster.playback.as_ref().and_then(|state| state.track.as_ref()).and_then(|track| track.uri.strip_prefix(TRACK_URI_PREFIX)) else { return; };
    let (result, response) = oneshot::channel();
    let result = match actions.try_send(ConnectAction::Metadata { generation, identifiers: vec![identifier.to_owned()], result }) {
        Ok(()) => response.await.unwrap_or(Err(Failure::Canceled)), Err(_) => Err(Failure::Backpressure),
    };
    let summary = metadata_diagnostic_summary(result);
    if let Ok(serialized) = serde_json::to_vec(&summary) { let _ = std::fs::write(METADATA_SUMMARY_PATH, serialized); }
}

async fn read_receipt(result: oneshot::Receiver<Result<ConnectReading, Failure>>, expected: Arc<Mutex<Option<(String, String)>>>,
    actions: mpsc::Sender<ConnectAction>, generation: u64) {
    let result = match result.await {
        Ok(Ok(reading)) => { write_summary(&reading.cluster, &expected,
            Some((reading.request_started_native_monotonic_milliseconds, reading.request_completed_native_monotonic_milliseconds)));
            metadata_summary(&reading.cluster, &actions, generation).await; Ok(()) },
        Ok(Err(failure)) => {
            let (result, response) = oneshot::channel();
            if actions.try_send(ConnectAction::InspectFailure { generation, result }).is_ok() {
                if let Ok(Ok(stage)) = response.await {
                    if let Ok(serialized) = serde_json::to_vec(&FailureSummary { failure: failure.code(), stage }) {
                        let _ = std::fs::write(FAILURE_SUMMARY_PATH, serialized);
                    }
                }
            }
            Err(failure)
        }, Err(_) => Err(Failure::Canceled),
    };
    let (sender, receiver) = oneshot::channel(); let _ = sender.send(result); receipt(receiver).await;
}

fn read_line(input: &mut impl BufRead) -> Result<Option<String>, Failure> {
    let mut line = String::new();
    let read = Read::take(&mut *input, (MAXIMUM_INPUT_BYTES + INPUT_BOUNDARY_INCREMENT) as u64).read_line(&mut line)
        .map_err(|_| Failure::InvalidInput)?;
    if read > MAXIMUM_INPUT_BYTES { return Err(Failure::InvalidInput); }
    if line.is_empty() { Ok(None) } else { Ok(Some(line)) }
}

async fn receipt<Response>(result: oneshot::Receiver<Result<Response, Failure>>) {
    let failure = match result.await { Ok(Ok(_)) => None, Ok(Err(failure)) => Some(failure.code()), Err(_) => Some(Failure::Canceled.code()) };
    if let Ok(serialized) = serde_json::to_string(&ControlReceipt { failure }) { println!("{serialized}"); }
}

struct CatalogDiagnosticLogger;
static CATALOG_DIAGNOSTIC_LOGGER: CatalogDiagnosticLogger = CatalogDiagnosticLogger;
impl log::Log for CatalogDiagnosticLogger {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        metadata.target() == streaming_spotify_session::connect_search::diagnostics::LOG_TARGET
    }
    fn log(&self, record: &log::Record<'_>) {
        if self.enabled(record.metadata()) { eprintln!("{}", record.args()); }
    }
    fn flush(&self) {}
}

fn main() {
    if log::set_logger(&CATALOG_DIAGNOSTIC_LOGGER).is_ok() { log::set_max_level(log::LevelFilter::Info); }
    std::panic::set_hook(Box::new(|_| {}));
    let input = match read_line(&mut io::stdin().lock()).and_then(|line| line.ok_or(Failure::InvalidInput))
        .and_then(|line| serde_json::from_str::<ProbeInput>(&line).map_err(|_| Failure::InvalidInput)) {
        Ok(input) => input,
        Err(_) => { println!("{INVALID_INPUT_REPORT}"); return; },
    };
    let runtime = match tokio::runtime::Builder::new_multi_thread().worker_threads(MAXIMUM_RUNTIME_WORKERS).enable_all().build() {
        Ok(runtime) => runtime,
        Err(_) => { println!("{RUNTIME_FAILURE_REPORT}"); return; },
    };
    let (events, mut observed) = mpsc::channel(CHANNEL_CAPACITY);
    let (commands, actions) = mpsc::channel(CHANNEL_CAPACITY);
    let cancellation = CancellationToken::new();
    let reader_cancellation = cancellation.clone();
    let generation = Arc::new(AtomicU64::new(INITIAL_GENERATION));
    let current_generation = Arc::clone(&generation);
    let expected_queue = Arc::new(Mutex::new(None));
    let reader_expected_queue = Arc::clone(&expected_queue);
    let local_actions = commands.clone();
    let local_generation = Arc::clone(&generation);
    let worker = runtime.handle().clone();
    std::thread::spawn(move || {
        let mut input = io::stdin().lock();
        while let Ok(Some(line)) = read_line(&mut input) {
            let control = match serde_json::from_str::<ProbeControl>(&line) {
                Ok(control) => control,
                Err(_) => { println!("{INVALID_INPUT_REPORT}"); continue; },
            };
            let generation = current_generation.load(Ordering::Acquire);
            let action = match control {
                ProbeControl::Stop => break,
                ProbeControl::Refresh => {
                    let (result, response) = oneshot::channel(); worker.spawn(read_receipt(response, Arc::clone(&reader_expected_queue), commands.clone(), generation));
                    ConnectAction::Read { generation, result }
                },
                ProbeControl::Reply { key, accepted } => {
                    let (result, response) = oneshot::channel(); worker.spawn(receipt(response));
                    ConnectAction::Reply { generation, key, accepted, result }
                },
                ProbeControl::CheckedCommand { generation, request_identifier, target_device_identifier, command } => {
                    if let ConnectCommand::AddToQueue { spotify_track_identifier, occurrence_identifier } = &command {
                        if let Ok(mut expected) = reader_expected_queue.lock() {
                            *expected = Some((TRACK_URI_PREFIX.to_owned() + spotify_track_identifier, occurrence_identifier.clone()));
                        }
                    }
                    let (result, response) = oneshot::channel(); worker.spawn(receipt(response));
                    ConnectAction::CheckedCommand { generation, request_identifier, target_device_identifier, command,
                        command_cancellation: reader_cancellation.child_token(), result }
                },
                ProbeControl::Command { target_device_identifier, body } => {
                    let (result, response) = oneshot::channel(); worker.spawn(receipt(response));
                    ConnectAction::Command { generation, target_device_identifier, body, result }
                },
            };
            if commands.try_send(action).is_err() { break; }
        }
        reader_cancellation.cancel();
    });
    runtime.block_on(async {
        let transport = run_connect_transport(input.stored_credential, input.configuration, events, actions, cancellation.clone());
        let observe = async {
            while let Some(event) = observed.recv().await {
                generation.store(event.generation, Ordering::Release);
                if let ConnectEventData::Registered { cluster, .. } | ConnectEventData::Cluster { cluster, .. } = &event.data {
                    write_summary(cluster, &expected_queue, None);
                }
                if let Ok(serialized) = serde_json::to_string(&event) { println!("{serialized}"); }
            }
        };
        let running = async { tokio::join!(transport, observe); cancellation.cancel(); };
        let controls = async {
            if connect_probe_control::serve(std::path::Path::new(LOCAL_CONTROL_PATH), local_actions, local_generation, cancellation.clone(), None).await.is_err() {
                println!("{RUNTIME_FAILURE_REPORT}"); cancellation.cancel();
            }
        };
        tokio::join!(running, controls);
    });
}

#[cfg(test)]
mod tests {
    use super::{observation_summary, metadata_diagnostic_summary};
    use streaming_spotify_session::{connect_metadata::ConnectTrackMetadata, model::Failure};
    use librespot_protocol::{connect::Cluster, player::{PlayerState, ProvidedTrack}};
    use protobuf::MessageField;
    use streaming_spotify_session::connect_wire::normalize_cluster;
    const HOST: &str = "synthetic-private-host";
    const URI: &str = "spotify:track:aaaaaaaaaaaaaaaaaaaaaa";
    const OCCURRENCE: &str = "synthetic-private-occurrence";
    const OTHER_OCCURRENCE: &str = "synthetic-other-occurrence";
    const STARTED: u64 = 5;
    const COMPLETED: u64 = 9;

    const PRIVATE_TITLE: &str = "synthetic-private-title";
    const PRIVATE_ARTIST: &str = "synthetic-private-artist";
    const PRIVATE_CODE: &str = "synthetic-private-recording-code";
    const DURATION_MILLISECONDS: u64 = 180000;
    const SINGLE_METADATA_VALUE: usize = 1;

    #[test]
    fn metadata_diagnostics_report_presence_and_safe_failure_without_exporting_song_details() {
        let summary = metadata_diagnostic_summary(Ok(vec![ConnectTrackMetadata { spotify_track_identifier: URI.to_owned(),
            title: PRIVATE_TITLE.to_owned(), artist_names: vec![PRIVATE_ARTIST.to_owned()], duration_milliseconds: DURATION_MILLISECONDS,
            recording_codes: vec![PRIVATE_CODE.to_owned()] }]));
        assert!(summary.has_title); assert!(summary.has_duration); assert_eq!(summary.artist_count, SINGLE_METADATA_VALUE);
        let serialized = serde_json::to_string(&summary).unwrap();
        for private in [URI, PRIVATE_TITLE, PRIVATE_ARTIST, PRIVATE_CODE] { assert!(!serialized.contains(private)); }
        assert_eq!(metadata_diagnostic_summary(Err(Failure::Network)).failure, Some(Failure::Network.code()));
    }

    #[test]
    fn diagnostic_summary_verifies_exact_queued_occurrence_without_exporting_identifiers() {
        let cluster = normalize_cluster(Cluster { active_device_id: HOST.to_owned(), player_state: MessageField::some(PlayerState {
            next_tracks: vec![ProvidedTrack { uri: URI.to_owned(), uid: OCCURRENCE.to_owned(), ..Default::default() }],
            ..Default::default() }), ..Default::default() }).unwrap();
        let expected = (URI.to_owned(), OCCURRENCE.to_owned());
        let summary = observation_summary(&cluster, Some(&expected), Some((STARTED, COMPLETED)));
        assert!(summary.queued_occurrence_confirmed); assert!(summary.has_active_device);
        assert_eq!(summary.request_started_native_monotonic_milliseconds, Some(STARTED));
        let serialized = serde_json::to_string(&summary).unwrap();
        for private in [HOST, URI, OCCURRENCE] { assert!(!serialized.contains(private)); }
        assert!(!observation_summary(&cluster, Some(&(URI.to_owned(), OTHER_OCCURRENCE.to_owned())), None).queued_occurrence_confirmed);
    }
}
