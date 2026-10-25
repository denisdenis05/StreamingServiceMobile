use librespot_protocol::{connect::{Capabilities, Device, DeviceInfo, MemberType, PutStateReason, PutStateRequest},
    devices::DeviceType, player::{ContextPlayerOptions, PlayOrigin, PlayerState, Suppressions}};
use protobuf::{EnumOrUnknown, MessageField};
use serde::{Deserialize, Serialize};

use crate::{desktop_login5::CLIENT_IDENTIFIER, model::{bounded_text, Failure}};

const MAXIMUM_DEVICE_NAME_CHARACTERS: usize = 128;
const MAXIMUM_IDENTIFIER_CHARACTERS: usize = 512;
const MAXIMUM_VOLUME: u32 = 65535;
const NORMAL_PLAYBACK_SPEED: f64 = 1.0;
const SUPPORTED_AUDIO_TRACK: &str = "audio/track";
const DEVICE_BRAND: &str = "StreamingService";
const DEVICE_MODEL: &str = "StreamingServicePlayer";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConnectDeviceConfiguration {
    pub name: String,
    pub playback_ready: bool,
}

pub fn validate_configuration(configuration: &ConnectDeviceConfiguration) -> Result<(), Failure> {
    if configuration.name.trim().is_empty() || !bounded_text(&configuration.name, MAXIMUM_DEVICE_NAME_CHARACTERS) { return Err(Failure::InvalidInput); }
    Ok(())
}

pub fn initial_registration(configuration: &ConnectDeviceConfiguration, device_identifier: &str,
    session_identifier: &str, now_milliseconds: u64) -> Result<PutStateRequest, Failure> {
    validate_configuration(configuration)?;
    if !bounded_text(device_identifier, MAXIMUM_IDENTIFIER_CHARACTERS)
        || !bounded_text(session_identifier, MAXIMUM_IDENTIFIER_CHARACTERS) { return Err(Failure::InvalidInput); }
    Ok(PutStateRequest { member_type: EnumOrUnknown::new(MemberType::CONNECT_STATE),
        put_state_reason: EnumOrUnknown::new(PutStateReason::NEW_DEVICE), client_side_timestamp: now_milliseconds,
        is_active: false, device: MessageField::some(Device {
            device_info: MessageField::some(DeviceInfo { device_id: device_identifier.to_owned(), name: configuration.name.clone(),
                can_play: configuration.playback_ready, device_type: EnumOrUnknown::new(DeviceType::COMPUTER),
                device_software_version: env!("CARGO_PKG_VERSION").to_owned(), client_id: CLIENT_IDENTIFIER.to_owned(),
                spirc_version: librespot_core::version::SPOTIFY_SPIRC_VERSION.to_owned(),
                brand: DEVICE_BRAND.to_owned(), model: DEVICE_MODEL.to_owned(), volume: MAXIMUM_VOLUME,
                is_social_connect: true, capabilities: MessageField::some(Capabilities {
                    can_be_player: configuration.playback_ready, is_controllable: configuration.playback_ready,
                    is_observable: true, needs_full_player_state: true, command_acks: true, hidden: !configuration.playback_ready,
                    gaia_eq_connect_id: true, supports_gzip_pushes: true, supports_playlist_v2: true,
                    supports_transfer_command: configuration.playback_ready, supports_command_request: configuration.playback_ready,
                    supports_set_options_command: configuration.playback_ready, disable_volume: true,
                    supported_types: vec![SUPPORTED_AUDIO_TRACK.to_owned()], ..Default::default()
                }), ..Default::default()
            }), player_state: MessageField::some(PlayerState { session_id: session_identifier.to_owned(),
                is_system_initiated: true, playback_speed: NORMAL_PLAYBACK_SPEED,
                options: MessageField::some(ContextPlayerOptions::new()), play_origin: MessageField::some(PlayOrigin::new()),
                suppressions: MessageField::some(Suppressions::new()), ..Default::default()
            }), ..Default::default()
        }), ..Default::default()
    })
}
