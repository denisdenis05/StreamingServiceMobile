use std::{io::{self, BufRead, Read}, sync::{Arc, atomic::{AtomicU64, Ordering}}};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use streaming_spotify_session::{connect_device::ConnectDeviceConfiguration,
    connect_transport::{run_connect_transport, ConnectAction}, model::Failure};
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

const MAXIMUM_INPUT_BYTES: usize = 131072;
const INPUT_BOUNDARY_INCREMENT: usize = 1;
const CHANNEL_CAPACITY: usize = 32;
const MAXIMUM_RUNTIME_WORKERS: usize = 2;
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
}

#[derive(Serialize)]
struct ControlReceipt { failure: Option<&'static str> }

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

fn main() {
    log::set_max_level(log::LevelFilter::Off);
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
                    let (result, response) = oneshot::channel(); worker.spawn(receipt(response));
                    ConnectAction::Refresh { generation, result }
                },
                ProbeControl::Reply { key, accepted } => {
                    let (result, response) = oneshot::channel(); worker.spawn(receipt(response));
                    ConnectAction::Reply { generation, key, accepted, result }
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
        let transport = run_connect_transport(input.stored_credential, input.configuration, events, actions, cancellation);
        let observe = async {
            while let Some(event) = observed.recv().await {
                generation.store(event.generation, Ordering::Release);
                if let Ok(serialized) = serde_json::to_string(&event) { println!("{serialized}"); }
            }
        };
        tokio::join!(transport, observe);
    });
}
