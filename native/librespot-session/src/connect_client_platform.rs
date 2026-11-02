use jni::{objects::JString, JNIEnv};

use crate::model::{bounded_text, Failure};

const MAXIMUM_BUILD_TEXT_CHARACTERS: usize = 512;
const MINIMUM_API_VERSION: i32 = 1;
const BUILD_CLASS: &str = "android/os/Build";
const VERSION_CLASS: &str = "android/os/Build$VERSION";
const RELEASE_FIELD: &str = "RELEASE";
const API_VERSION_FIELD: &str = "SDK_INT";
const DEVICE_FIELD: &str = "DEVICE";
const MODEL_FIELD: &str = "MODEL";
const MANUFACTURER_FIELD: &str = "MANUFACTURER";
const STRING_SIGNATURE: &str = "Ljava/lang/String;";
const INTEGER_SIGNATURE: &str = "I";

#[derive(Clone, PartialEq, Eq)]
pub struct AndroidClientTokenData {
    pub android_version: String,
    pub api_version: i32,
    pub device_name: String,
    pub model: String,
    pub manufacturer: String,
}

impl AndroidClientTokenData {
    pub fn validate(&self) -> Result<(), Failure> {
        if self.api_version < MINIMUM_API_VERSION { return Err(Failure::Unsupported); }
        for value in [&self.android_version, &self.device_name, &self.model, &self.manufacturer] {
            if value.trim().is_empty() || !bounded_text(value, MAXIMUM_BUILD_TEXT_CHARACTERS) { return Err(Failure::Unsupported); }
        }
        Ok(())
    }
}

pub trait AndroidBuildSource {
    fn android_version(&mut self) -> Result<String, Failure>;
    fn api_version(&mut self) -> Result<i32, Failure>;
    fn device_name(&mut self) -> Result<String, Failure>;
    fn model(&mut self) -> Result<String, Failure>;
    fn manufacturer(&mut self) -> Result<String, Failure>;
}

pub fn capture_android_build(source: &mut impl AndroidBuildSource) -> Result<AndroidClientTokenData, Failure> {
    let data = AndroidClientTokenData { android_version: source.android_version()?, api_version: source.api_version()?,
        device_name: source.device_name()?, model: source.model()?, manufacturer: source.manufacturer()? };
    data.validate()?;
    Ok(data)
}

struct JniAndroidBuildSource<'environment, 'local> { environment: &'environment mut JNIEnv<'local> }

impl JniAndroidBuildSource<'_, '_> {
    fn text(&mut self, class: &str, field: &str) -> Result<String, Failure> {
        let result = self.environment.get_static_field(class, field, STRING_SIGNATURE)
            .and_then(|value| value.l())
            .and_then(|value| self.environment.get_string(&JString::from(value)).map(String::from));
        result.map_err(|_| { let _ = self.environment.exception_clear(); Failure::Unsupported })
    }
}

impl AndroidBuildSource for JniAndroidBuildSource<'_, '_> {
    fn android_version(&mut self) -> Result<String, Failure> { self.text(VERSION_CLASS, RELEASE_FIELD) }
    fn api_version(&mut self) -> Result<i32, Failure> {
        self.environment.get_static_field(VERSION_CLASS, API_VERSION_FIELD, INTEGER_SIGNATURE).and_then(|value| value.i())
            .map_err(|_| { let _ = self.environment.exception_clear(); Failure::Unsupported })
    }
    fn device_name(&mut self) -> Result<String, Failure> { self.text(BUILD_CLASS, DEVICE_FIELD) }
    fn model(&mut self) -> Result<String, Failure> { self.text(BUILD_CLASS, MODEL_FIELD) }
    fn manufacturer(&mut self) -> Result<String, Failure> { self.text(BUILD_CLASS, MANUFACTURER_FIELD) }
}

pub fn capture_android_client_token_data(environment: &mut JNIEnv) -> Result<AndroidClientTokenData, Failure> {
    capture_android_build(&mut JniAndroidBuildSource { environment })
}
