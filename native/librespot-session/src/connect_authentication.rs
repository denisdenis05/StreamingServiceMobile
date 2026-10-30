use std::{future::Future, time::Duration};

use http::Method;

use crate::model::Failure;

pub const SAFE_REQUEST_TIMEOUT_SECONDS: u64 = 15;

#[derive(Clone, Copy)]
pub enum ConnectRequestPurpose { Observation, Metadata, CatalogSearch, Membership, Removal, Command, Publication }

impl ConnectRequestPurpose {
    pub fn is_mutation(self) -> bool { matches!(self, Self::Command | Self::Publication) }
    fn permits_renewal_replay(self) -> bool { matches!(self, Self::Observation | Self::Metadata | Self::CatalogSearch | Self::Membership) }
}

pub struct ConnectHttpRequest {
    pub method: Method,
    pub path: String,
    pub body: Vec<u8>,
    pub media_type: &'static str,
    pub purpose: ConnectRequestPurpose,
}

pub trait ConnectAuthenticatedDispatch: Send {
    fn supports_rejected_token_renewal(&self) -> bool;
    fn access_token(&mut self) -> impl Future<Output = Result<String, Failure>> + Send;
    fn discard_access_token(&mut self);
    fn dispatch_once(&mut self, request: &ConnectHttpRequest, access_token: &str) -> impl Future<Output = Result<Vec<u8>, Failure>> + Send;
}

pub async fn execute_authenticated_request(dispatch: &mut impl ConnectAuthenticatedDispatch, request: &ConnectHttpRequest) -> Result<Vec<u8>, Failure> {
    if request.purpose.permits_renewal_replay() {
        tokio::time::timeout(Duration::from_secs(SAFE_REQUEST_TIMEOUT_SECONDS), execute_request(dispatch, request)).await.map_err(|_| Failure::Deadline)?
    } else { execute_request(dispatch, request).await }
}

async fn execute_request(dispatch: &mut impl ConnectAuthenticatedDispatch, request: &ConnectHttpRequest) -> Result<Vec<u8>, Failure> {
    let access_token = dispatch.access_token().await?;
    let response = dispatch.dispatch_once(request, &access_token).await;
    if !matches!(response, Err(Failure::Unauthorized)) { return response; }
    dispatch.discard_access_token();
    if !request.purpose.permits_renewal_replay() || !dispatch.supports_rejected_token_renewal() { return response; }
    let access_token = dispatch.access_token().await?;
    let response = dispatch.dispatch_once(request, &access_token).await;
    if matches!(response, Err(Failure::Unauthorized)) { dispatch.discard_access_token(); }
    response
}
