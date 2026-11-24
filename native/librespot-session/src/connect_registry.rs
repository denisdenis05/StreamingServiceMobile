use std::{collections::HashMap, future::Future, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}};

use serde::Serialize;
use tokio::{runtime::Handle, sync::mpsc};
use tokio_util::sync::CancellationToken;

use crate::{connect_transport::{native_monotonic_milliseconds, ConnectAction, ConnectEvent}, model::{validate_request_identifier, Failure}};

const CHANNEL_CAPACITY: usize = 32;
const MAXIMUM_BATCH_EVENTS: usize = 4;
const INITIAL_HANDLE: u64 = 0;
const HANDLE_INCREMENT: u64 = 1;
const MAXIMUM_SAFE_JAVASCRIPT_INTEGER: u64 = 9007199254740991;
const MAXIMUM_PENDING_COMMANDS: usize = 16;

struct ConnectionEntry {
    handle: u64,
    actions: mpsc::Sender<ConnectAction>,
    events: mpsc::Receiver<ConnectEvent>,
    cancellation: CancellationToken,
    finished: Arc<AtomicBool>,
    commands: HashMap<String, CancellationToken>,
}

struct RegistryState { last_handle: u64, active: Option<ConnectionEntry> }

pub struct ConnectRegistry { state: Mutex<RegistryState> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectEventBatch {
    pub handle: u64,
    pub finished: bool,
    pub sampled_native_monotonic_milliseconds: u64,
    pub events: Vec<ConnectEvent>,
}

struct CompletionGuard { finished: Arc<AtomicBool>, cancellation: CancellationToken }

impl Drop for CompletionGuard {
    fn drop(&mut self) { self.cancellation.cancel(); self.finished.store(true, Ordering::Release); }
}

impl Default for ConnectRegistry {
    fn default() -> Self { Self { state: Mutex::new(RegistryState { last_handle: INITIAL_HANDLE, active: None }) } }
}

impl ConnectRegistry {
    pub fn start<Transport, Running>(&self, runtime: &Handle, transport: Transport) -> Result<u64, Failure>
    where Transport: FnOnce(mpsc::Sender<ConnectEvent>, mpsc::Receiver<ConnectAction>, CancellationToken) -> Running,
        Running: Future<Output = ()> + Send + 'static {
        let mut state = self.state.lock().map_err(|_| Failure::Network)?;
        if state.active.is_some() { return Err(Failure::Backpressure); }
        let handle = state.last_handle.checked_add(HANDLE_INCREMENT)
            .filter(|handle| *handle <= MAXIMUM_SAFE_JAVASCRIPT_INTEGER).ok_or(Failure::Backpressure)?;
        let (events_sender, events) = mpsc::channel(CHANNEL_CAPACITY);
        let (actions, commands) = mpsc::channel(CHANNEL_CAPACITY);
        let cancellation = CancellationToken::new();
        let finished = Arc::new(AtomicBool::new(false));
        let guard = CompletionGuard { finished: Arc::clone(&finished), cancellation: cancellation.clone() };
        let running = transport(events_sender, commands, cancellation.clone());
        runtime.spawn(async move { let _guard = guard; running.await; });
        state.last_handle = handle;
        state.active = Some(ConnectionEntry { handle, actions, events, cancellation, finished, commands: HashMap::new() });
        Ok(handle)
    }

    pub fn actions(&self, handle: u64) -> Result<mpsc::Sender<ConnectAction>, Failure> {
        let state = self.state.lock().map_err(|_| Failure::Network)?;
        let entry = state.active.as_ref().filter(|entry| entry.handle == handle).ok_or(Failure::Canceled)?;
        if entry.cancellation.is_cancelled() || entry.finished.load(Ordering::Acquire) { return Err(Failure::Canceled); }
        Ok(entry.actions.clone())
    }

    pub fn begin_command(&self, handle: u64, request_identifier: &str) -> Result<(), Failure> {
        validate_request_identifier(request_identifier)?;
        let mut state = self.state.lock().map_err(|_| Failure::Network)?;
        let entry = state.active.as_mut().filter(|entry| entry.handle == handle).ok_or(Failure::Canceled)?;
        if entry.cancellation.is_cancelled() || entry.finished.load(Ordering::Acquire) { return Err(Failure::Canceled); }
        if entry.commands.len() >= MAXIMUM_PENDING_COMMANDS || entry.commands.contains_key(request_identifier) { return Err(Failure::Backpressure); }
        entry.commands.insert(request_identifier.to_owned(), entry.cancellation.child_token()); Ok(())
    }

    pub fn command_cancellation(&self, handle: u64, request_identifier: &str) -> Result<CancellationToken, Failure> {
        let state = self.state.lock().map_err(|_| Failure::Network)?;
        state.active.as_ref().filter(|entry| entry.handle == handle).and_then(|entry| entry.commands.get(request_identifier))
            .cloned().ok_or(Failure::Canceled)
    }

    pub fn cancel_command(&self, handle: u64, request_identifier: &str) -> Result<(), Failure> {
        self.command_cancellation(handle, request_identifier)?.cancel(); Ok(())
    }

    pub fn finish_command(&self, handle: u64, request_identifier: &str) -> Result<(), Failure> {
        let mut state = self.state.lock().map_err(|_| Failure::Network)?;
        let entry = state.active.as_mut().filter(|entry| entry.handle == handle).ok_or(Failure::Canceled)?;
        if let Some(cancellation) = entry.commands.remove(request_identifier) { cancellation.cancel(); }
        Ok(())
    }

    pub fn poll(&self, handle: u64) -> Result<ConnectEventBatch, Failure> {
        let mut state = self.state.lock().map_err(|_| Failure::Network)?;
        let entry = state.active.as_mut().filter(|entry| entry.handle == handle).ok_or(Failure::Canceled)?;
        let mut events = Vec::new();
        while events.len() < MAXIMUM_BATCH_EVENTS {
            match entry.events.try_recv() { Ok(event) => events.push(event), Err(_) => break }
        }
        Ok(ConnectEventBatch { handle, finished: entry.finished.load(Ordering::Acquire) && entry.events.is_empty(),
            sampled_native_monotonic_milliseconds: native_monotonic_milliseconds(), events })
    }

    pub fn cancel(&self, handle: u64) -> Result<(), Failure> {
        let state = self.state.lock().map_err(|_| Failure::Network)?;
        let entry = state.active.as_ref().filter(|entry| entry.handle == handle).ok_or(Failure::Canceled)?;
        entry.cancellation.cancel(); Ok(())
    }

    pub fn finish(&self, handle: u64) -> Result<(), Failure> {
        let mut state = self.state.lock().map_err(|_| Failure::Network)?;
        let entry = state.active.as_ref().filter(|entry| entry.handle == handle).ok_or(Failure::Canceled)?;
        if !entry.finished.load(Ordering::Acquire) || !entry.events.is_empty() { return Err(Failure::Backpressure); }
        state.active.take(); Ok(())
    }
}
