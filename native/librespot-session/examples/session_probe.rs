use std::{future::Future, io::{self, Read}, time::Duration};

use librespot_core::{authentication::Credentials, http_client::HttpClientError,
    mercury::MercuryError, Error, Session, SessionConfig};
use serde::Serialize;
use protobuf::{Message, MessageField};
use librespot_protocol::{client_info::ClientInfo, credentials::StoredCredential,
    login5::{LoginRequest, LoginResponse, login_request::Login_method, login_response::Response}};
use streaming_spotify_session::{model::{validate_bootstrap_token, Failure, MAXIMUM_TOKEN_CHARACTERS},
    session::{sanitized_failure, DEVICE_AUTHORIZATION_CLIENT_IDENTIFIER, DEVICE_AUTHORIZATION_TOKEN_SCOPES}};

const STEP_TIMEOUT_SECONDS: u64 = 60;
const INPUT_BOUNDARY_INCREMENT_BYTES: usize = 1;
const STREAMING_SCOPE: &str = "streaming";
const CONNECTION_STAGE: &str = "access-point";
const KEYMASTER_STAGE: &str = "keymaster-playback-scopes";
const STREAMING_STAGE: &str = "keymaster-streaming-scope";
const LOGIN5_STAGE: &str = "login5";
const LOGIN5_WITHOUT_CLIENT_TOKEN_STAGE: &str = "login5-without-client-token";
const LOGIN5_ADDRESS: &str = "https://login5.spotify.com/v3/login";
const POST_METHOD: &str = "POST";
const ACCEPT_HEADER: &str = "accept";
const PROTOBUF_MEDIA_TYPE: &str = "application/x-protobuf";
const LOGIN5_REJECTED_MESSAGE: &str = "Login5 rejected the diagnostic request";
const LOGIN5_CHALLENGE_MESSAGE: &str = "Login5 requires verification";
const INPUT_STAGE: &str = "input";
const RUNTIME_STAGE: &str = "runtime";
const SUCCESS_STATUS: &str = "success";
const FAILURE_STATUS: &str = "failure";
const FALLBACK_REPORT: &str = "{\"stage\":\"runtime\",\"status\":\"failure\",\"code\":\"invalid-response\"}";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeReport {
    platform: &'static str,
    stage: &'static str,
    status: &'static str,
    code: Option<&'static str>,
    upstream_status: Option<i32>,
}

fn report(stage: &'static str, failure: Option<Failure>, upstream_status: Option<i32>) -> ProbeReport {
    ProbeReport { platform: std::env::consts::OS, stage,
        status: if failure.is_none() { SUCCESS_STATUS } else { FAILURE_STATUS },
        code: failure.map(Failure::code), upstream_status }
}

fn failure_report(stage: &'static str, failure: Error) -> ProbeReport {
    let upstream_status = if let Some(MercuryError::Response(response)) = failure.error.downcast_ref() {
        Some(response.status_code)
    } else if let Some(HttpClientError::StatusCode(status)) = failure.error.downcast_ref() {
        Some(i32::from(status.as_u16()))
    } else { None };
    report(stage, Some(sanitized_failure(failure)), upstream_status)
}

fn print_report(report: ProbeReport) {
    println!("{}", serde_json::to_string(&report).unwrap_or_else(|_| FALLBACK_REPORT.to_owned()));
}

async fn observe<Response>(stage: &'static str, operation: impl Future<Output = Result<Response, Error>>) -> bool {
    let result = match tokio::time::timeout(Duration::from_secs(STEP_TIMEOUT_SECONDS), operation).await {
        Ok(Ok(_)) => report(stage, None, None),
        Ok(Err(failure)) => failure_report(stage, failure),
        Err(_) => report(stage, Some(Failure::Deadline), None),
    };
    let success = result.code.is_none();
    print_report(result);
    success
}

async fn probe(access_token: String) {
    let mut configuration = SessionConfig::default();
    configuration.client_id = DEVICE_AUTHORIZATION_CLIENT_IDENTIFIER.to_owned();
    let session = Session::new(configuration, None);
    if observe(CONNECTION_STAGE, session.connect(Credentials::with_access_token(access_token), false)).await {
        observe(KEYMASTER_STAGE, session.token_provider().get_token(DEVICE_AUTHORIZATION_TOKEN_SCOPES)).await;
        observe(STREAMING_STAGE, session.token_provider().get_token(STREAMING_SCOPE)).await;
        observe(LOGIN5_STAGE, session.login5().auth_token()).await;
        observe(LOGIN5_WITHOUT_CLIENT_TOKEN_STAGE, login5_without_client_token(&session)).await;
    }
    session.shutdown();
}

async fn login5_without_client_token(session: &Session) -> Result<(), Error> {
    let request = LoginRequest {
        client_info: MessageField::some(ClientInfo { client_id: session.client_id(),
            device_id: session.device_id().to_owned(), ..Default::default() }),
        login_method: Some(Login_method::StoredCredential(StoredCredential {
            username: session.username(), data: session.auth_data(), ..Default::default()
        })), ..Default::default()
    };
    let response = session.http_client().request_body(http::Request::builder()
        .method(POST_METHOD).uri(LOGIN5_ADDRESS).header(ACCEPT_HEADER, PROTOBUF_MEDIA_TYPE)
        .body(request.write_to_bytes()?.into())?).await?;
    match LoginResponse::parse_from_bytes(&response)?.response {
        Some(Response::Ok(_)) => Ok(()),
        Some(Response::Challenges(_)) => Err(Error::unimplemented(LOGIN5_CHALLENGE_MESSAGE)),
        _ => Err(Error::failed_precondition(LOGIN5_REJECTED_MESSAGE)),
    }
}

fn main() {
    log::set_max_level(log::LevelFilter::Off);
    std::panic::set_hook(Box::new(|_| {}));
    let mut access_token = String::new();
    let maximum_input_bytes = (MAXIMUM_TOKEN_CHARACTERS + INPUT_BOUNDARY_INCREMENT_BYTES) as u64;
    if io::stdin().take(maximum_input_bytes).read_to_string(&mut access_token).is_err()
        || validate_bootstrap_token(&access_token).is_err() {
        print_report(report(INPUT_STAGE, Some(Failure::InvalidInput), None));
        return;
    }
    match tokio::runtime::Builder::new_current_thread().enable_all().build() {
        Ok(runtime) => runtime.block_on(probe(access_token)),
        Err(_) => print_report(report(RUNTIME_STAGE, Some(Failure::Network), None)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRIVATE_ADDRESS: &str = "hm://synthetic-sensitive-address";
    const PRIVATE_PAYLOAD: &[u8] = b"synthetic-private-response";
    const FORBIDDEN_STATUS: i32 = 403;
    const PRIVATE_MESSAGE: &str = "synthetic-sensitive-error-message";

    #[test]
    fn structured_rejection_reports_status_without_request_or_response_content() {
        let failure = MercuryError::Response(librespot_core::mercury::MercuryResponse {
            uri: PRIVATE_ADDRESS.to_owned(), status_code: FORBIDDEN_STATUS, payload: vec![PRIVATE_PAYLOAD.to_vec()],
        }).into();
        let result = failure_report(KEYMASTER_STAGE, failure);
        assert_eq!(result.upstream_status, Some(FORBIDDEN_STATUS));
        assert_eq!(result.code, Some(Failure::Unauthorized.code()));
        let serialized = serde_json::to_string(&result).unwrap();
        assert!(!serialized.contains(PRIVATE_ADDRESS));
        assert!(!serialized.contains(std::str::from_utf8(PRIVATE_PAYLOAD).unwrap()));
    }

    #[test]
    fn unknown_private_errors_expose_only_the_sanitized_category() {
        let result = failure_report(LOGIN5_STAGE, Error::failed_precondition(PRIVATE_MESSAGE));
        assert_eq!(result.upstream_status, None);
        assert_eq!(result.code, Some(Failure::Unauthorized.code()));
        assert!(!serde_json::to_string(&result).unwrap().contains(PRIVATE_MESSAGE));
    }

    #[tokio::test(start_paused = true)]
    async fn unresponsive_probe_steps_reach_their_deadline() {
        assert!(!observe::<()>(CONNECTION_STAGE, std::future::pending()).await);
    }
}
