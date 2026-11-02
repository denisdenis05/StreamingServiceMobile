pub mod model;
pub mod desktop_login5;
pub mod connect_wire;
pub mod connect_device;
pub mod connect_publication;
pub mod connect_activation;
pub mod connect_session;
pub mod connect_authentication;
pub mod connect_transport;
mod connect_http_worker;
pub mod connect_registry;
pub mod connect_bridge;
pub mod connect_commands;
pub mod connect_metadata;
pub mod connect_search;
pub mod connect_client_token;
pub mod connect_client_platform;
pub mod connect_request_diagnostics;
pub mod connect_request_cooldown;
pub mod connect_search_traffic;
pub mod connect_membership;
pub mod connect_receipts;
pub mod connect_command_journal;
pub mod operations;
pub mod session;

use std::{panic::{catch_unwind, AssertUnwindSafe}, ptr, sync::{Once, OnceLock}};

use jni::{objects::{JObject, JString}, sys::jstring, JNIEnv};
use serde::Serialize;

use model::{Failure, SessionGrant};
use operations::{AuthenticationOperation, OperationRegistry};

const EMPTY_TEXT: &str = "";
const LOGIN_OPERATION: &str = "login";
const RESTORE_OPERATION: &str = "restore";
const BOOTSTRAP_OPERATION: &str = "bootstrap";
const FALLBACK_FAILURE_JSON: &str = "{\"failure\":\"network\"}";
static REGISTRY: OnceLock<OperationRegistry> = OnceLock::new();
static INITIALIZATION: Once = Once::new();

#[derive(Serialize)]
struct FailureEnvelope {
    failure: &'static str,
}

fn registry() -> &'static OperationRegistry {
    INITIALIZATION.call_once(|| {
        log::set_max_level(log::LevelFilter::Off);
        std::panic::set_hook(Box::new(|_| {}));
    });
    REGISTRY.get_or_init(OperationRegistry::default)
}

struct PendingOperation<'registry> {
    identifier: String,
    registry: &'registry OperationRegistry,
}

impl Drop for PendingOperation<'_> {
    fn drop(&mut self) {
        self.registry.finish(&self.identifier);
    }
}

fn encode_result(result: Result<SessionGrant, Failure>) -> String {
    let serialized = match result {
        Ok(grant) => serde_json::to_string(&grant),
        Err(failure) => serde_json::to_string(&FailureEnvelope { failure: failure.code() }),
    };
    serialized.unwrap_or_else(|_| FALLBACK_FAILURE_JSON.to_owned())
}

fn read_string(environment: &mut JNIEnv, value: JString) -> Result<String, Failure> {
    match environment.get_string(&value) {
        Ok(value) => Ok(String::from(value)),
        Err(_) => {
            let _ = environment.exception_clear();
            Err(Failure::InvalidInput)
        }
    }
}

fn return_string(environment: &mut JNIEnv, value: String) -> jstring {
    match environment.new_string(value) {
        Ok(value) => value.into_raw(),
        Err(_) => {
            let _ = environment.exception_clear();
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_begin(
    mut environment: JNIEnv,
    _receiver: JObject,
    identifier: JString,
) -> jstring {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let identifier = read_string(&mut environment, identifier)?;
        registry().begin(&identifier)
    })).unwrap_or(Err(Failure::Network));
    return_string(&mut environment, result.err().map(Failure::code).unwrap_or(EMPTY_TEXT).to_owned())
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_execute(
    mut environment: JNIEnv,
    _receiver: JObject,
    identifier: JString,
    operation: JString,
    username: JString,
    password: JString,
    credential: JString,
) -> jstring {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let identifier = read_string(&mut environment, identifier)?;
        let pending = PendingOperation { identifier, registry: registry() };
        let cancellation = pending.registry.cancellation(&pending.identifier)?;
        let operation = match read_string(&mut environment, operation)?.as_str() {
            LOGIN_OPERATION => AuthenticationOperation::Login {
                username: read_string(&mut environment, username)?,
                password: read_string(&mut environment, password)?,
            },
            RESTORE_OPERATION => AuthenticationOperation::Restore {
                serialized: read_string(&mut environment, credential)?,
            },
            BOOTSTRAP_OPERATION => AuthenticationOperation::Bootstrap {
                access_token: read_string(&mut environment, credential)?,
            },
            _ => return Err(Failure::InvalidInput),
        };
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().map_err(|_| Failure::Network)?;
        runtime.block_on(operations::execute(operation, cancellation))
    })).unwrap_or(Err(Failure::Network));
    return_string(&mut environment, encode_result(result))
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_cancel(
    mut environment: JNIEnv,
    _receiver: JObject,
    identifier: JString,
) {
    let _ = catch_unwind(AssertUnwindSafe(|| {
        if let Ok(identifier) = read_string(&mut environment, identifier) {
            registry().cancel(&identifier);
        }
    }));
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_cancelAll(
    _environment: JNIEnv,
    _receiver: JObject,
) {
    let _ = catch_unwind(|| registry().cancel_all());
}

#[no_mangle]
pub extern "system" fn Java_com_streamingservice_spotify_SpotifyLibrespotNative_finish(
    mut environment: JNIEnv,
    _receiver: JObject,
    identifier: JString,
) {
    let _ = catch_unwind(AssertUnwindSafe(|| {
        if let Ok(identifier) = read_string(&mut environment, identifier) {
            registry().finish(&identifier);
        }
    }));
}
