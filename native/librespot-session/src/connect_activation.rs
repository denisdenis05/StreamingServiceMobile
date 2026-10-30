use serde::{Deserialize, Serialize};
use librespot_protocol::connect::PutStateRequest;

use crate::{connect_publication::{build_publication, publication_server_timestamp, ConnectPublicationSnapshot, MAXIMUM_PUBLICATION_SAMPLE_AGE_MILLISECONDS},
    connect_wire::ConnectCluster, model::{bounded_text, Failure}};

const MAXIMUM_ACTIVATION_IDENTIFIER_CHARACTERS: usize = 128;
const MAXIMUM_PREVIOUS_HOST_CHARACTERS: usize = 512;
const INITIAL_GENERATION: u64 = 0;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConnectExplicitActivation {
    pub request_identifier: String,
    pub generation: u64,
    pub expected_previous_host_device_identifier: String,
    pub observation_started_native_monotonic_milliseconds: u64,
    pub observation_completed_native_monotonic_milliseconds: u64,
    pub requested_native_monotonic_milliseconds: u64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConnectActivationPlayerReadiness {
    pub playback_output_ready: bool,
    pub external_authority_absent: bool,
}

pub fn build_explicit_activation(registration: &PutStateRequest, snapshot: &ConnectPublicationSnapshot,
    activation: &ConnectExplicitActivation, readiness: &ConnectActivationPlayerReadiness, cluster: &ConnectCluster,
    current_generation: u64, native_monotonic_milliseconds: u64) -> Result<PutStateRequest, Failure> {
    if !bounded_text(&activation.request_identifier, MAXIMUM_ACTIVATION_IDENTIFIER_CHARACTERS)
        || activation.request_identifier.contains(char::is_whitespace)
        || activation.expected_previous_host_device_identifier.chars().count() > MAXIMUM_PREVIOUS_HOST_CHARACTERS
        || activation.expected_previous_host_device_identifier.contains(char::is_control)
        || activation.generation == INITIAL_GENERATION { return Err(Failure::InvalidInput); }
    if !readiness.playback_output_ready || !readiness.external_authority_absent { return Err(Failure::Unsupported); }
    if activation.generation != current_generation
        || cluster.active_device_identifier != activation.expected_previous_host_device_identifier
        || activation.requested_native_monotonic_milliseconds > activation.observation_started_native_monotonic_milliseconds
        || activation.observation_started_native_monotonic_milliseconds > activation.observation_completed_native_monotonic_milliseconds
        || activation.observation_completed_native_monotonic_milliseconds > native_monotonic_milliseconds
        || native_monotonic_milliseconds - activation.observation_started_native_monotonic_milliseconds > MAXIMUM_PUBLICATION_SAMPLE_AGE_MILLISECONDS
        || snapshot.sampled_native_monotonic_milliseconds < activation.observation_completed_native_monotonic_milliseconds {
        return Err(Failure::Canceled);
    }
    let publication_timestamp_milliseconds = publication_server_timestamp(snapshot, native_monotonic_milliseconds)?;
    if cluster.server_at_milliseconds <= i64::default()
        || cluster.server_at_milliseconds as u64 > publication_timestamp_milliseconds { return Err(Failure::InvalidInput); }
    let observation_start_server_milliseconds = snapshot.sampled_server_timestamp_milliseconds.checked_sub(
        snapshot.sampled_native_monotonic_milliseconds - activation.observation_started_native_monotonic_milliseconds).ok_or(Failure::InvalidInput)?;
    let observation_end_server_milliseconds = snapshot.sampled_server_timestamp_milliseconds.checked_sub(
        snapshot.sampled_native_monotonic_milliseconds - activation.observation_completed_native_monotonic_milliseconds).ok_or(Failure::InvalidInput)?;
    let observed_server_milliseconds = cluster.server_at_milliseconds as u64;
    if observed_server_milliseconds < observation_start_server_milliseconds.saturating_sub(snapshot.clock_uncertainty_milliseconds)
        || observed_server_milliseconds > observation_end_server_milliseconds.saturating_add(snapshot.clock_uncertainty_milliseconds) { return Err(Failure::Canceled); }
    build_publication(registration, snapshot, publication_timestamp_milliseconds)
}

#[derive(Default)]
pub struct ConnectActivationDispatchGuard {
    dispatched: bool,
}

impl ConnectActivationDispatchGuard {
    pub fn complete_deactivation(&mut self) { self.dispatched = false; }
    pub fn acquire(&mut self, canceled: bool) -> Result<(), Failure> {
        if canceled { return Err(Failure::Canceled); }
        if self.dispatched { return Err(Failure::UnknownOutcome); }
        self.dispatched = true;
        Ok(())
    }
}
