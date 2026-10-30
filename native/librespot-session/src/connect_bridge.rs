use std::{sync::OnceLock, time::Duration};

use jni::{objects::{JObject, JString}, sys::{jlong, jstring}, JNIEnv};
use serde::{Deserialize, Serialize};
use tokio::{runtime::Runtime, sync::oneshot};
use tokio_util::sync::CancellationToken;

use crate::{connect_activation::{ConnectExplicitActivation, ConnectActivationPlayerReadiness}, connect_publication::ConnectPublicationSnapshot, connect_search::{ConnectSearchInput, ConnectSearchTrack}, connect_membership::ConnectMembershipReading, connect_device::{validate_configuration, ConnectDeviceConfiguration}, connect_registry::ConnectRegistry,
    connect_receipts::ConnectCommandAcknowledgement, connect_metadata::{ConnectTrackMetadata, encode_metadata_request}, connect_transport::{native_monotonic_milliseconds, run_connect_transport, ConnectAction, ConnectReading, ConnectHostIdentity}, connect_commands::ConnectCommand, model::{bounded_text, decode_stored_session, Failure}};

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
    HostIdentity { generation: u64 },
    Activate { generation: u64, snapshot: ConnectPublicationSnapshot, activation: ConnectExplicitActivation, readiness: ConnectActivationPlayerReadiness },
    Withdraw { generation: u64, device_identifier: String, session_identifier: String, sequence: u64 },
    Deactivate { generation: u64, snapshot: ConnectPublicationSnapshot },
    Publish { generation: u64, snapshot: ConnectPublicationSnapshot },
    Refresh { generation: u64 },
    Reply { generation: u64, key: String, accepted: bool },
    Command { generation: u64, request_identifier: String, target_device_identifier: String, command: ConnectCommand },
}

#[derive(Serialize)]
struct ConnectStarted { handle: u64 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectReadReceipt { handle: u64, generation: u64, sampled_native_monotonic_milliseconds: u64, reading: ConnectReading }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectMembershipReceipt { handle: u64, generation: u64, reading: ConnectMembershipReading }

async fn membership(handle: u64, generation: u64) -> Result<ConnectMembershipReceipt, Failure> {
    if generation < MINIMUM_HANDLE as u64 || generation > MAXIMUM_SAFE_JAVASCRIPT_INTEGER { return Err(Failure::InvalidInput); }
    let (result, response) = oneshot::channel();
    connections().actions(handle)?.try_send(ConnectAction::Membership { generation, result }).map_err(|_| Failure::Backpressure)?;
    let reading = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
        .map_err(|_| Failure::Deadline)?.map_err(|_| Failure::Canceled)??;
    Ok(ConnectMembershipReceipt { handle, generation, reading })
}

async fn read(handle: u64, generation: u64) -> Result<ConnectReadReceipt, Failure> {
    if generation < MINIMUM_HANDLE as u64 || generation > MAXIMUM_SAFE_JAVASCRIPT_INTEGER { return Err(Failure::InvalidInput); }
    let (result, response) = oneshot::channel();
    connections().actions(handle)?.try_send(ConnectAction::Read { generation, result }).map_err(|_| Failure::Backpressure)?;
    let reading = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
        .map_err(|_| Failure::Deadline)?.map_err(|_| Failure::Canceled)??;
    Ok(ConnectReadReceipt { handle, generation, sampled_native_monotonic_milliseconds: native_monotonic_milliseconds(), reading })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectMetadataReceipt { handle: u64, generation: u64, tracks: Vec<ConnectTrackMetadata> }

async fn metadata(handle: u64, generation: u64, identifiers: Vec<String>) -> Result<ConnectMetadataReceipt, Failure> {
    encode_metadata_request(&identifiers)?;
    let (result, response) = oneshot::channel();
    connections().actions(handle)?.try_send(ConnectAction::Metadata { generation, identifiers, result }).map_err(|_| Failure::Backpressure)?;
    let tracks = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
        .map_err(|_| Failure::Deadline)?.map_err(|_| Failure::Canceled)??;
    Ok(ConnectMetadataReceipt { handle, generation, tracks })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectSearchReceipt { handle: u64, generation: u64, tracks: Vec<ConnectSearchTrack> }

struct SearchCancellation(CancellationToken);
impl Drop for SearchCancellation { fn drop(&mut self) { self.0.cancel(); } }

async fn search(handle: u64, generation: u64, input: ConnectSearchInput) -> Result<ConnectSearchReceipt, Failure> {
    input.validate()?;
    if generation < MINIMUM_HANDLE as u64 || generation > MAXIMUM_SAFE_JAVASCRIPT_INTEGER { return Err(Failure::InvalidInput); }
    let cancellation = SearchCancellation(CancellationToken::new());
    let (result, response) = oneshot::channel();
    connections().actions(handle)?.try_send(ConnectAction::Search { generation, input, search_cancellation: cancellation.0.clone(), result })
        .map_err(|_| Failure::Backpressure)?;
    let tracks = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
        .map_err(|_| Failure::Deadline)?.map_err(|_| Failure::Canceled)??;
    Ok(ConnectSearchReceipt { handle, generation, tracks })
}

#[derive(Serialize)]
struct ConnectReceipt {
    failure: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    acknowledgement: Option<ConnectCommandAcknowledgement>,
    #[serde(rename = "hostingIdentity", skip_serializing_if = "Option::is_none")]
    hosting_identity: Option<ConnectHostIdentity>,
}

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
        ConnectControl::HostIdentity { generation } | ConnectControl::Activate { generation, .. }
        | ConnectControl::Deactivate { generation, .. } | ConnectControl::Publish { generation, .. } | ConnectControl::Refresh { generation } => generation,
        ConnectControl::Command { generation, request_identifier, target_device_identifier, command } => {
            command.validate(request_identifier, target_device_identifier)?; generation
        },
        ConnectControl::Withdraw { generation, device_identifier, session_identifier, sequence } => {
            if !bounded_text(device_identifier, MAXIMUM_KEY_CHARACTERS) || !bounded_text(session_identifier, MAXIMUM_KEY_CHARACTERS)
                || *sequence < MINIMUM_HANDLE as u64 || *sequence > MAXIMUM_SAFE_JAVASCRIPT_INTEGER { return Err(Failure::InvalidInput); }
            generation
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
    result?; Ok(ConnectReceipt { failure: None, acknowledgement: None, hosting_identity: None })
}

async fn execute(handle: u64, control: ConnectControl) -> Result<ConnectReceipt, Failure> {
    let actions = connections().actions(handle)?;
    match control {
        ConnectControl::HostIdentity { generation } => {
            let (result, response) = oneshot::channel();
            actions.try_send(ConnectAction::HostIdentity { generation, result }).map_err(|_| Failure::Backpressure)?;
            let identity = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
                .map_err(|_| Failure::Deadline)?.map_err(|_| Failure::Canceled)??;
            Ok(ConnectReceipt { failure: None, acknowledgement: None, hosting_identity: Some(identity) })
        },
        ConnectControl::Activate { generation, snapshot, activation, readiness } => {
            let cancellation = SearchCancellation(CancellationToken::new());
            let (result, response) = oneshot::channel();
            actions.try_send(ConnectAction::Activate { generation, snapshot, activation, readiness, activation_cancellation: cancellation.0.clone(), result }).map_err(|_| Failure::Backpressure)?;
            let response = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
                .map_err(|_| Failure::UnknownOutcome)?.map_err(|_| Failure::UnknownOutcome)?;
            receipt(response.map(|_| ()))
        },
        ConnectControl::Withdraw { generation, device_identifier, session_identifier, sequence } => {
            let cancellation = SearchCancellation(CancellationToken::new());
            let (result, response) = oneshot::channel();
            actions.try_send(ConnectAction::Withdraw { generation, device_identifier, session_identifier, sequence, cancellation: cancellation.0.clone(), result }).map_err(|_| Failure::Backpressure)?;
            let response = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
                .map_err(|_| Failure::UnknownOutcome)?.map_err(|_| Failure::UnknownOutcome)?;
            receipt(response.map(|_| ()))
        },
        ConnectControl::Deactivate { generation, snapshot } => {
            let cancellation = SearchCancellation(CancellationToken::new());
            let (result, response) = oneshot::channel();
            actions.try_send(ConnectAction::Deactivate { generation, snapshot, cancellation: cancellation.0.clone(), result }).map_err(|_| Failure::Backpressure)?;
            let response = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
                .map_err(|_| Failure::UnknownOutcome)?.map_err(|_| Failure::UnknownOutcome)?;
            receipt(response.map(|_| ()))
        },
        ConnectControl::Publish { generation, snapshot } => {
            let cancellation = SearchCancellation(CancellationToken::new());
            let (result, response) = oneshot::channel();
            actions.try_send(ConnectAction::Publish { generation, snapshot, publication_cancellation: cancellation.0.clone(), result }).map_err(|_| Failure::Backpressure)?;
            let response = tokio::time::timeout(Duration::from_secs(ACTION_TIMEOUT_SECONDS), response).await
                .map_err(|_| Failure::UnknownOutcome)?.map_err(|_| Failure::UnknownOutcome)?;
            receipt(response.map(|_| ()))
        },
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
            result.map(|acknowledgement| ConnectReceipt { failure: None, acknowledgement: Some(acknowledgement), hosting_identity: None })
        },
    }
}

pub fn guarded_native_operation<Response>(panic_failure: Failure, operation: impl FnOnce() -> Result<Response, Failure>) -> Result<Response, Failure> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(operation)).unwrap_or(Err(panic_failure))
}

fn boundary<Response: Serialize>(environment: &mut JNIEnv, operation: impl FnOnce(&mut JNIEnv) -> Result<Response, Failure>) -> jstring {
    boundary_with_panic_failure(environment, Failure::Network, operation)
}

fn boundary_with_panic_failure<Response: Serialize>(environment: &mut JNIEnv, panic_failure: Failure, operation: impl FnOnce(&mut JNIEnv) -> Result<Response, Failure>) -> jstring {
    let _ = crate::registry();
    let result = guarded_native_operation(panic_failure, || operation(environment));
    let serialized = match result {
        Ok(response) => serde_json::to_string(&response),
        Err(failure) => serde_json::to_string(&ConnectReceipt { failure: Some(failure.code()), acknowledgement: None, hosting_identity: None }),
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
    boundary_with_panic_failure(&mut environment, Failure::UnknownOutcome, |environment| {
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

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectRead(
    mut environment: JNIEnv, _receiver: JObject, connection_handle: jlong, generation: jlong) -> jstring {
    boundary(&mut environment, |_| runtime()?.block_on(read(handle(connection_handle)?, handle(generation)?)))
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectMembership(
    mut environment: JNIEnv, _receiver: JObject, connection_handle: jlong, generation: jlong) -> jstring {
    boundary(&mut environment, |_| runtime()?.block_on(membership(handle(connection_handle)?, handle(generation)?)))
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectMetadata(
    mut environment: JNIEnv, _receiver: JObject, connection_handle: jlong, generation: jlong, serialized: JString) -> jstring {
    boundary(&mut environment, |environment| {
        let serialized = crate::read_string(environment, serialized)?;
        if serialized.len() > MAXIMUM_INPUT_BYTES { return Err(Failure::InvalidInput); }
        let identifiers = serde_json::from_str(&serialized).map_err(|_| Failure::InvalidInput)?;
        runtime()?.block_on(metadata(handle(connection_handle)?, handle(generation)?, identifiers))
    })
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_connectSearch(
    mut environment: JNIEnv, _receiver: JObject, connection_handle: jlong, generation: jlong, serialized: JString) -> jstring {
    boundary(&mut environment, |environment| {
        let serialized = crate::read_string(environment, serialized)?;
        if serialized.len() > MAXIMUM_INPUT_BYTES { return Err(Failure::InvalidInput); }
        let input = serde_json::from_str(&serialized).map_err(|_| Failure::InvalidInput)?;
        runtime()?.block_on(search(handle(connection_handle)?, handle(generation)?, input))
    })
}
