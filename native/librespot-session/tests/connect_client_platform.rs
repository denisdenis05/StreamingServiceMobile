use streaming_spotify_session::{connect_client_platform::{AndroidBuildSource, AndroidClientTokenData, capture_android_build},
    connect_client_token::{ClientTokenIdentity, ClientTokenPlatform, initial_request}, model::Failure};

const RELEASE: &str = "synthetic-actual-release";
const API_VERSION: i32 = 35;
const DEVICE: &str = "synthetic-actual-build-device";
const MODEL: &str = "synthetic-actual-build-model";
const MANUFACTURER: &str = "synthetic-actual-build-manufacturer";
const ACCOUNT: &str = "synthetic-account";
const CLIENT: &str = "synthetic-existing-client";
const CLIENT_TOKEN_CLIENT: &str = "synthetic-fixed-platform-client";
const SESSION_DEVICE: &str = "synthetic-session-device";
const EMPTY_TEXT: &str = "";
const CONTROL_TEXT: &str = "synthetic\nprivate-build-value";
const EXCESSIVE_TEXT_CHARACTERS: usize = 513;
const INVALID_API_VERSION: i32 = 0;

#[derive(Clone, Copy, PartialEq, Debug)]
enum BuildField { Release, ApiVersion, Device, Model, Manufacturer }

struct BuildSource { data: AndroidClientTokenData, failure: Option<BuildField>, reads: Vec<BuildField> }
impl BuildSource {
    fn read(&mut self, field: BuildField) -> Result<(), Failure> {
        self.reads.push(field);
        if self.failure == Some(field) { Err(Failure::Unsupported) } else { Ok(()) }
    }
}
impl AndroidBuildSource for BuildSource {
    fn android_version(&mut self) -> Result<String, Failure> { self.read(BuildField::Release)?; Ok(self.data.android_version.clone()) }
    fn api_version(&mut self) -> Result<i32, Failure> { self.read(BuildField::ApiVersion)?; Ok(self.data.api_version) }
    fn device_name(&mut self) -> Result<String, Failure> { self.read(BuildField::Device)?; Ok(self.data.device_name.clone()) }
    fn model(&mut self) -> Result<String, Failure> { self.read(BuildField::Model)?; Ok(self.data.model.clone()) }
    fn manufacturer(&mut self) -> Result<String, Failure> { self.read(BuildField::Manufacturer)?; Ok(self.data.manufacturer.clone()) }
}
fn data() -> AndroidClientTokenData {
    AndroidClientTokenData { android_version: RELEASE.to_owned(), api_version: API_VERSION,
        device_name: DEVICE.to_owned(), model: MODEL.to_owned(), manufacturer: MANUFACTURER.to_owned() }
}
fn source() -> BuildSource { BuildSource { data: data(), failure: None, reads: Vec::new() } }
fn identity() -> ClientTokenIdentity {
    ClientTokenIdentity { account_identifier: ACCOUNT.to_owned(), client_identifier: CLIENT.to_owned(), client_token_client_identifier: CLIENT_TOKEN_CLIENT.to_owned(), device_identifier: SESSION_DEVICE.to_owned() }
}

#[test]
fn capture_reads_each_actual_platform_field_once_and_keeps_the_snapshot_immutable() {
    let mut source = source(); let captured = capture_android_build(&mut source).unwrap();
    assert_eq!(captured.android_version, RELEASE); assert_eq!(captured.api_version, API_VERSION);
    assert_eq!(captured.device_name, DEVICE); assert_eq!(captured.model, MODEL); assert_eq!(captured.manufacturer, MANUFACTURER);
    assert_eq!(source.reads, [BuildField::Release, BuildField::ApiVersion, BuildField::Device, BuildField::Model, BuildField::Manufacturer]);
    source.data.model = EMPTY_TEXT.to_owned(); assert_eq!(captured.model, MODEL);
}

#[test]
fn every_required_build_read_failure_remains_explicit_instead_of_creating_fallback_hardware() {
    for field in [BuildField::Release, BuildField::ApiVersion, BuildField::Device, BuildField::Model, BuildField::Manufacturer] {
        let mut source = source(); source.failure = Some(field);
        assert!(matches!(capture_android_build(&mut source), Err(Failure::Unsupported)));
        assert_eq!(source.reads.last(), Some(&field));
    }
}

#[test]
fn android_platform_data_rejects_empty_control_oversized_text_or_nonpositive_api_levels() {
    let mut invalid_release = data(); invalid_release.android_version = EMPTY_TEXT.to_owned();
    let mut invalid_device = data(); invalid_device.device_name = EMPTY_TEXT.to_owned();
    let mut invalid_model = data(); invalid_model.model = CONTROL_TEXT.to_owned();
    let mut invalid_manufacturer = data(); invalid_manufacturer.manufacturer = MANUFACTURER.repeat(EXCESSIVE_TEXT_CHARACTERS);
    let mut invalid_api = data(); invalid_api.api_version = INVALID_API_VERSION;
    for data in [invalid_release, invalid_device, invalid_model, invalid_manufacturer, invalid_api] {
        assert!(matches!(initial_request(&identity(), ClientTokenPlatform::Android(data)), Err(Failure::Unsupported)));
    }
}

#[test]
fn client_token_serializes_actual_android_build_fields_while_preserving_existing_session_identity() {
    let captured = capture_android_build(&mut source()).unwrap();
    let request = initial_request(&identity(), ClientTokenPlatform::Android(captured)).unwrap();
    let client = request.client_data(); let connectivity = client.connectivity_sdk_data();
    assert_eq!(client.client_id, CLIENT_TOKEN_CLIENT); assert_eq!(connectivity.device_id, SESSION_DEVICE);
    let platform = connectivity.platform_specific_data.android();
    assert_eq!(platform.android_version, RELEASE); assert_eq!(platform.api_version, API_VERSION);
    assert_eq!(platform.device_name, DEVICE); assert_eq!(platform.model_str, MODEL); assert_eq!(platform.vendor, MANUFACTURER);
}
