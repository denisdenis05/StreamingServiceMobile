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


#[derive(Clone, PartialEq, Eq)]
struct EarlyCommandObservation {
    acknowledgement_identifier: String,
    target_device_identifier: String,
    server_at_milliseconds: i64,
    observed_native_monotonic_milliseconds: u64,
    queue_revision: Option<String>,
}

struct CommandDispatch {
    target_device_identifier: String,
    minimum_server_at_milliseconds: i64,
    started_native_monotonic_milliseconds: u64,
    deadline: Instant,
    observations: Vec<EarlyCommandObservation>,
    previously_observed_identifiers: Vec<String>,
    uncertain: bool,
}

#[derive(Default)]
pub struct ConnectCommandJournal {
    pending: HashMap<String, PendingCommand>,
    recent: VecDeque<String>,
    recently_observed: VecDeque<String>,
    dispatch: Option<CommandDispatch>,
}

impl ConnectCommandJournal {
    pub fn has_capacity(&self) -> bool { self.pending.len() < MAXIMUM_PENDING_COMMANDS }

    pub fn begin_dispatch(&mut self, target_device_identifier: String, minimum_server_at_milliseconds: i64,
        started_native_monotonic_milliseconds: u64) -> Result<(), Failure> {
        self.expire();
        if self.dispatch.is_some() || !self.has_capacity() { return Err(Failure::Backpressure); }
        self.dispatch = Some(CommandDispatch { target_device_identifier, minimum_server_at_milliseconds, started_native_monotonic_milliseconds,
            deadline: Instant::now() + Duration::from_secs(COMMAND_CONFIRMATION_TIMEOUT_SECONDS), observations: Vec::new(),
            previously_observed_identifiers: self.recently_observed.iter().cloned().collect(), uncertain: false });
        Ok(())
    }

    pub fn abort_dispatch(&mut self) { self.dispatch = None; }

    pub fn accept_dispatched(&mut self, acknowledgement: ConnectCommandAcknowledgement, cancellation: CancellationToken, completion: Completion) {
        let Some(dispatch) = self.dispatch.take() else { let _ = completion.send(Err(Failure::UnknownOutcome)); return; };
        if dispatch.uncertain || Instant::now() >= dispatch.deadline
            || acknowledgement.acknowledgement_identifier.as_ref().is_some_and(|identifier| dispatch.previously_observed_identifiers.contains(identifier)) {
            let _ = completion.send(Err(Failure::UnknownOutcome)); return;
        }
        let identifier = acknowledgement.acknowledgement_identifier.clone();
        self.accept(acknowledgement, dispatch.target_device_identifier, dispatch.minimum_server_at_milliseconds, cancellation, completion);
        if let Some(identifier) = identifier {
            if let Some(command) = self.pending.get_mut(&identifier) { command.deadline = dispatch.deadline; }
            if let Some(observation) = dispatch.observations.iter().find(|observation| observation.acknowledgement_identifier == identifier) {
                if let Some(mut command) = self.pending.remove(&identifier) {
                    command.acknowledgement.delivery_observed = true;
                    command.acknowledgement.observed_native_monotonic_milliseconds = Some(observation.observed_native_monotonic_milliseconds);
                    command.acknowledgement.observed_queue_revision = observation.queue_revision.clone();
                    let _ = command.completion.send(Ok(command.acknowledgement));
                }
            }
        }
    }

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
        if let Some(dispatch) = &mut self.dispatch {
            if observed_native_monotonic_milliseconds >= dispatch.started_native_monotonic_milliseconds
                && cluster.server_at_milliseconds >= dispatch.minimum_server_at_milliseconds {
                dispatch.uncertain |= cluster.active_device_identifier != dispatch.target_device_identifier || Instant::now() >= dispatch.deadline;
                if let Some(identifier) = &cluster.acknowledgement_identifier {
                    let observation = EarlyCommandObservation { acknowledgement_identifier: identifier.clone(), target_device_identifier: cluster.active_device_identifier.clone(),
                        server_at_milliseconds: cluster.server_at_milliseconds, observed_native_monotonic_milliseconds,
                        queue_revision: cluster.playback.as_ref().map(|playback| playback.queue_revision.clone()).filter(|revision| !revision.is_empty()) };
                    if let Some(previous) = dispatch.observations.iter().find(|previous| previous.acknowledgement_identifier == *identifier) {
                        dispatch.uncertain |= previous.target_device_identifier != observation.target_device_identifier || previous.queue_revision != observation.queue_revision;
                    } else if dispatch.observations.len() >= MAXIMUM_RECENT_ACKNOWLEDGEMENTS { dispatch.uncertain = true; }
                    else { dispatch.observations.push(observation); }
                }
            }
        }
        if let Some(identifier) = &cluster.acknowledgement_identifier {
            if !self.recently_observed.contains(identifier) { self.recently_observed.push_back(identifier.clone()); }
            while self.recently_observed.len() > MAXIMUM_RECENT_ACKNOWLEDGEMENTS { self.recently_observed.pop_front(); }
        }
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
