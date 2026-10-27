use std::collections::{HashMap, VecDeque};
use std::time::Duration;

use tokio::{sync::oneshot, time::Instant};
use tokio_util::sync::CancellationToken;

use crate::{connect_receipts::ConnectCommandAcknowledgement, connect_wire::ConnectCluster, model::Failure};

pub const COMMAND_CONFIRMATION_TIMEOUT_SECONDS: u64 = 10;
const MAXIMUM_PENDING_COMMANDS: usize = 16;
const MAXIMUM_RECENT_ACKNOWLEDGEMENTS: usize = 32;

type Completion = oneshot::Sender<Result<ConnectCommandAcknowledgement, Failure>>;

struct PendingCommand {
    target: String,
    minimum_server_at_milliseconds: i64,
    acknowledgement: ConnectCommandAcknowledgement,
    cancellation: CancellationToken,
    completion: Completion,
    deadline: Instant,
}

#[derive(Default)]
pub struct ConnectCommandJournal {
    pending: HashMap<String, PendingCommand>,
    recent: VecDeque<String>,
}

impl ConnectCommandJournal {
    pub fn has_capacity(&self) -> bool { self.pending.len() < MAXIMUM_PENDING_COMMANDS }

    pub fn accept(&mut self, acknowledgement: ConnectCommandAcknowledgement, target: String, minimum_server_at_milliseconds: i64, cancellation: CancellationToken, completion: Completion) {
        let Some(identifier) = acknowledgement.acknowledgement_identifier.clone() else { let _ = completion.send(Err(Failure::UnknownOutcome)); return; };
        if self.recent.contains(&identifier) || self.pending.contains_key(&identifier) {
            if let Some(previous) = self.pending.remove(&identifier) { let _ = previous.completion.send(Err(Failure::UnknownOutcome)); }
            let _ = completion.send(Err(Failure::UnknownOutcome)); return;
        }
        self.recent.push_back(identifier.clone());
        while self.recent.len() > MAXIMUM_RECENT_ACKNOWLEDGEMENTS { self.recent.pop_front(); }
        if completion.is_closed() || cancellation.is_cancelled() || !self.has_capacity() { let _ = completion.send(Err(Failure::UnknownOutcome)); return; }
        self.pending.insert(identifier, PendingCommand { target, minimum_server_at_milliseconds, acknowledgement, cancellation, completion,
            deadline: Instant::now() + Duration::from_secs(COMMAND_CONFIRMATION_TIMEOUT_SECONDS) });
    }

    pub fn observe(&mut self, cluster: &ConnectCluster, observed_native_monotonic_milliseconds: u64) {
        self.expire();
        let changed = self.pending.iter().filter(|(identifier, command)| cluster.acknowledgement_identifier.as_ref() == Some(*identifier)
            || cluster.server_at_milliseconds >= command.minimum_server_at_milliseconds && cluster.active_device_identifier != command.target).map(|(identifier, _)| identifier.clone()).collect::<Vec<_>>();
        for identifier in changed {
            let Some(mut command) = self.pending.remove(&identifier) else { continue; };
            if cluster.active_device_identifier != command.target { let _ = command.completion.send(Err(Failure::UnknownOutcome)); continue; }
            command.acknowledgement.delivery_observed = true;
            command.acknowledgement.observed_native_monotonic_milliseconds = Some(observed_native_monotonic_milliseconds);
            command.acknowledgement.observed_queue_revision = cluster.playback.as_ref().map(|playback| playback.queue_revision.clone()).filter(|revision| !revision.is_empty());
            let _ = command.completion.send(Ok(command.acknowledgement));
        }
    }

    pub fn expire(&mut self) {
        let retired = self.pending.iter().filter(|(_, command)| command.completion.is_closed() || command.cancellation.is_cancelled()
            || Instant::now() >= command.deadline).map(|(identifier, _)| identifier.clone()).collect::<Vec<_>>();
        for identifier in retired {
            if let Some(command) = self.pending.remove(&identifier) { let _ = command.completion.send(Err(Failure::UnknownOutcome)); }
        }
    }
}

impl Drop for ConnectCommandJournal {
    fn drop(&mut self) {
        for (_, command) in self.pending.drain() { let _ = command.completion.send(Err(Failure::UnknownOutcome)); }
    }
}
