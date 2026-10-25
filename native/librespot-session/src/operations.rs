use std::{collections::HashMap, future::Future, sync::Mutex, time::Duration};

use tokio_util::sync::CancellationToken;

use crate::{model::{validate_request_identifier, Failure, SessionGrant}, session};

const MAXIMUM_PENDING_REQUESTS: usize = 8;
const AUTHENTICATION_TIMEOUT_SECONDS: u64 = 60;

#[derive(Default)]
pub struct OperationRegistry {
    pending: Mutex<HashMap<String, CancellationToken>>,
}

impl OperationRegistry {
    pub fn begin(&self, identifier: &str) -> Result<(), Failure> {
        validate_request_identifier(identifier)?;
        let mut pending = self.pending.lock().map_err(|_| Failure::Network)?;
        if pending.contains_key(identifier) || pending.len() >= MAXIMUM_PENDING_REQUESTS {
            return Err(Failure::Backpressure);
        }
        pending.insert(identifier.to_owned(), CancellationToken::new());
        Ok(())
    }

    pub fn cancel(&self, identifier: &str) {
        if let Ok(pending) = self.pending.lock() {
            if let Some(cancellation) = pending.get(identifier) {
                cancellation.cancel();
            }
        }
    }

    pub fn finish(&self, identifier: &str) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(identifier);
        }
    }

    pub fn cancellation(&self, identifier: &str) -> Result<CancellationToken, Failure> {
        self.pending.lock().map_err(|_| Failure::Network)?.get(identifier).cloned().ok_or(Failure::Canceled)
    }

    pub fn cancel_all(&self) {
        if let Ok(pending) = self.pending.lock() {
            for cancellation in pending.values() {
                cancellation.cancel();
            }
        }
    }
}

pub enum AuthenticationOperation {
    Login { username: String, password: String },
    Restore { serialized: String },
}

pub async fn execute(operation: AuthenticationOperation, cancellation: CancellationToken) -> Result<SessionGrant, Failure> {
    if cancellation.is_cancelled() {
        return Err(Failure::Canceled);
    }
    let authentication = async {
        match operation {
            AuthenticationOperation::Login { username, password } => session::login(username, password).await,
            AuthenticationOperation::Restore { serialized } => session::restore(serialized).await,
        }
    };
    await_authentication(authentication, cancellation).await
}

pub async fn await_authentication<AuthenticationFuture>(authentication: AuthenticationFuture,
    cancellation: CancellationToken) -> Result<SessionGrant, Failure>
where AuthenticationFuture: Future<Output = Result<SessionGrant, Failure>> {
    if cancellation.is_cancelled() { return Err(Failure::Canceled); }
    tokio::select! {
        biased;
        _ = cancellation.cancelled() => Err(Failure::Canceled),
        result = tokio::time::timeout(Duration::from_secs(AUTHENTICATION_TIMEOUT_SECONDS), authentication) => {
            result.map_err(|_| Failure::Deadline)?
        }
    }
}
