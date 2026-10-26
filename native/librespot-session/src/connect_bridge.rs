use std::{sync::OnceLock, time::Duration};

use jni::{objects::{JObject, JString}, sys::{jlong, jstring}, JNIEnv};
use serde::{Deserialize, Serialize};
use tokio::{runtime::Runtime, sync::oneshot};

use crate::{connect_device::{validate_configuration, ConnectDeviceConfiguration}, connect_registry::ConnectRegistry,
    connect_transport::{run_connect_transport, ConnectAction}, connect_commands::ConnectCommand, model::{bounded_text, decode_stored_session, Failure}};

const MAXIMUM_INPUT_BYTES: usize = 131072;
const MAXIMUM_KEY_CHARACTERS: usize = 2048;
const RUNTIME_WORKERS: usize = 2;
const ACTION_TIMEOUT_SECONDS: u64 = 20;
const MINIMUM_HANDLE: jlong = 1;
const MAXIMUM_SAFE_JAVASCRIPT_INTEGER: u64 = 9007199254740991;
static CONNECTIONS: OnceLock<ConnectRegistry> = OnceLock::new();
static RUNTIME: OnceLock<Result<Runtime, Failure>> = OnceLock::new();

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConnectStartInput {
    pub account_identifier: String,
    pub stored_credential: String,
    pub configuration: ConnectDeviceConfiguration,
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum ConnectControl {
    Refresh { generation: u64 },
    Reply { generation: u64, key: String, accepted: bool },
    Command { generation: u64, request_identifier: String, target_device_identifier: String, command: ConnectCommand },
}

#[derive(Serialize)]
struct ConnectStarted { handle: u64 }

#[derive(Serialize)]
struct ConnectReceipt { failure: Option<&'static str> }

fn runtime() -> Result<&'static Runtime, Failure> {
    RUNTIME.get_or_init(|| tokio::runtime::Builder::new_multi_thread().worker_threads(RUNTIME_WORKERS)
        .enable_all().build().map_err(|_| Failure::Network)).as_ref().map_err(|failure| *failure)
}

fn connections() -> &'static ConnectRegistry { CONNECTIONS.get_or_init(ConnectRegistry::default) }

pub fn decode_start(serialized: &str) -> Result<ConnectStartInput, Failure> {
    if serialized.len() > MAXIMUM_INPUT_BYTES { return Err(Failure::InvalidInput); }
    let input: ConnectStartInput = serde_json::from_str(serialized).map_err(|_| Failure::InvalidInput)?;
    validate_configuration(&input.configuration)?;
    let stored = decode_stored_session(&input.stored_credential)?;
    if stored.account_identifier != input.account_identifier { return Err(Failure::Unauthorized); }
    if input.configuration.playback_ready { return Err(Failure::Unsupported); }
    Ok(input)
}

pub fn decode_control(serialized: &str) -> Result<ConnectControl, Failure> {
    if serialized.len() > MAXIMUM_INPUT_BYTES { return Err(Failure::InvalidInput); }
    let control: ConnectControl = serde_json::from_str(serialized).map_err(|_| Failure::InvalidInput)?;
    let generation = match &control {
        ConnectControl::Refresh { generation } => generation,
        ConnectControl::Command { generation, request_identifier, target_device_identifier, command } => {
            command.validate(request_identifier, target_device_identifier)?; generation
        },
        ConnectControl::Reply { generation, key, .. } => {
            if !bounded_text(key, MAXIMUM_KEY_CHARACTERS) { return Err(Failure::InvalidInput); }
            generation
        },
    };
    if *generation < MINIMUM_HANDLE as u64 || *generation > MAXIMUM_SAFE_JAVASCRIPT_INTEGER { return Err(Failure::InvalidInput); }
    Ok(control)
}

fn handle(value: jlong) -> Result<u64, Failure> {
    u64::try_from(value).ok().filter(|value| *value >= MINIMUM_HANDLE as u64 && *value <= MAXIMUM_SAFE_JAVASCRIPT_INTEGER)
        .ok_or(Failure::InvalidInput)
}

fn receipt(result: Result<(), Failure>) -> Result<ConnectReceipt, Failure> {
    result?; Ok(ConnectReceipt { failure: None })
}

async fn execute(handle: u64, control: ConnectControl) -> Result<ConnectReceipt, Failure> {
    let actions = connections().actions(handle)?;
    match control {
        ConnectControl::Refresh { generation } => {
            let (result, response) = oneshot::channel();
            actions.try_send(ConnectAction::Refresh { generation, result }).map_err(|_| Failure::Backpressure)?;
            let result = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
                .map_err(|_| Failure::Deadline)?.map_err(|_| Failure::Canceled)?.map(|_| ());
            receipt(result)
        },
        ConnectControl::Reply { generation, key, accepted } => {
            let (result, response) = oneshot::channel();
            actions.try_send(ConnectAction::Reply { generation, key, accepted, result }).map_err(|_| Failure::Backpressure)?;
            let result = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
                .map_err(|_| Failure::UnknownOutcome)?.map_err(|_| Failure::UnknownOutcome)?;
            receipt(result)
        },
        ConnectControl::Command { generation, request_identifier, target_device_identifier, command } => {
            let (result, response) = oneshot::channel();
            let command_cancellation = connections().command_cancellation(handle, &request_identifier)?;
            actions.try_send(ConnectAction::CheckedCommand { generation, request_identifier, target_device_identifier, command, command_cancellation, result })
                .map_err(|_| Failure::Backpressure)?;
            let result = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
                .map_err(|_| Failure::UnknownOutcome)?.map_err(|_| Failure::UnknownOutcome)?;
            receipt(result)
        },
    }
}

fn boundary<Response: Serialize>(environment: &mut JNIEnv, operation: impl FnOnce(&mut JNIEnv) -> Result<Response, Failure>) -> jstring {
    let _ = crate::registry();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| operation(environment))).unwrap_or(Err(Failure::Network));
    let serialized = match result {
        Ok(response) => serde_json::to_string(&response),
        Err(failure) => serde_json::to_string(&ConnectReceipt { failure: Some(failure.code()) }),
    }.unwrap_or_else(|_| crate::FALLBACK_FAILURE_JSON.to_owned());
    crate::return_string(environment, serialized)
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectStart(
    mut environment: JNIEnv, _receiver: JObject, serialized: JString) -> jstring {
    boundary(&mut environment, |environment| {
        let input = decode_start(&crate::read_string(environment, serialized)?)?;
        let handle = connections().start(runtime()?.handle(), |events, actions, cancellation| {
            run_connect_transport(input.stored_credential, input.configuration, events, actions, cancellation)
        })?;
        Ok(ConnectStarted { handle })
    })
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectPoll(
    mut environment: JNIEnv, _receiver: JObject, connection_handle: jlong) -> jstring {
    boundary(&mut environment, |_| connections().poll(handle(connection_handle)?))
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectExecute(
    mut environment: JNIEnv, _receiver: JObject, connection_handle: jlong, serialized: JString) -> jstring {
    boundary(&mut environment, |environment| {
        let control = decode_control(&crate::read_string(environment, serialized)?)?;
        runtime()?.block_on(execute(handle(connection_handle)?, control))
    })
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectCancel(
    mut environment: JNIEnv, _receiver: JObject, connection_handle: jlong) -> jstring {
    boundary(&mut environment, |_| receipt(connections().cancel(handle(connection_handle)?)))
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectFinish(
    mut environment: JNIEnv, _receiver: JObject, connection_handle: jlong) -> jstring {
    boundary(&mut environment, |_| receipt(connections().finish(handle(connection_handle)?)))
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectBeginCommand(
    mut environment: JNIEnv, _receiver: JObject, connection_handle: jlong, request_identifier: JString) -> jstring {
    boundary(&mut environment, |environment| receipt(connections().begin_command(handle(connection_handle)?, &crate::read_string(environment, request_identifier)?)))
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectCancelCommand(
    mut environment: JNIEnv, _receiver: JObject, connection_handle: jlong, request_identifier: JString) -> jstring {
    boundary(&mut environment, |environment| receipt(connections().cancel_command(handle(connection_handle)?, &crate::read_string(environment, request_identifier)?)))
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectFinishCommand(
    mut environment: JNIEnv, _receiver: JObject, connection_handle: jlong, request_identifier: JString) -> jstring {
    boundary(&mut environment, |environment| receipt(connections().finish_command(handle(connection_handle)?, &crate::read_string(environment, request_identifier)?)))
}
