use librespot_protocol::{connect::{MemberType, PutStateReason}, devices::DeviceType};
use streaming_spotify_session::{connect_device::{initial_registration, validate_configuration, ConnectDeviceConfiguration}, model::Failure};

const DEVICE_NAME: &str = "Synthetic StreamingService device";
const DEVICE_IDENTIFIER: &str = "synthetic-device";
const SESSION_IDENTIFIER: &str = "synthetic-session";
const NOW_MILLISECONDS: u64 = 1700000000000;
const NORMAL_SPEED: f64 = 1.0;
const EMPTY_TEXT: &str = "";
const WHITESPACE: &str = "   ";
const CONTROL_TEXT: &str = "device\nname";
const NAME_LIMIT_EXCEEDED: usize = 129;
const IDENTIFIER_LIMIT_EXCEEDED: usize = 513;

fn configuration(playback_ready: bool) -> ConnectDeviceConfiguration {
    ConnectDeviceConfiguration { name: DEVICE_NAME.to_owned(), playback_ready }
}

#[test]
fn observer_registration_is_visible_to_state_delivery_without_advertising_audio_readiness() {
    let registration = initial_registration(&configuration(false), DEVICE_IDENTIFIER, SESSION_IDENTIFIER, NOW_MILLISECONDS).unwrap();
    assert_eq!(registration.member_type.enum_value().unwrap(), MemberType::CONNECT_STATE);
    assert_eq!(registration.put_state_reason.enum_value().unwrap(), PutStateReason::NEW_DEVICE);
    assert_eq!(registration.client_side_timestamp, NOW_MILLISECONDS);
    assert!(!registration.is_active);
    let information = &registration.device.device_info;
    assert_eq!(information.device_id, DEVICE_IDENTIFIER);
    assert_eq!(information.name, DEVICE_NAME);
    assert_eq!(information.device_type.enum_value().unwrap(), DeviceType::COMPUTER);
    assert!(!information.can_play);
    let capabilities = &information.capabilities;
    assert!(capabilities.hidden && capabilities.is_observable && capabilities.needs_full_player_state);
    assert!(capabilities.command_acks && capabilities.supports_gzip_pushes);
    assert!(!capabilities.can_be_player && !capabilities.is_controllable && !capabilities.supports_transfer_command);
    assert!(!capabilities.supports_command_request);
}

#[test]
fn playback_registration_advertises_commands_only_when_explicitly_ready() {
    let registration = initial_registration(&configuration(true), DEVICE_IDENTIFIER, SESSION_IDENTIFIER, NOW_MILLISECONDS).unwrap();
    let information = &registration.device.device_info;
    let capabilities = &information.capabilities;
    assert!(information.can_play && capabilities.can_be_player && capabilities.is_controllable);
    assert!(capabilities.supports_transfer_command && capabilities.supports_command_request);
    assert!(!capabilities.hidden);
    assert!(!registration.is_active);
}

#[test]
fn initial_player_state_does_not_invent_a_track_or_playing_position() {
    let registration = initial_registration(&configuration(true), DEVICE_IDENTIFIER, SESSION_IDENTIFIER, NOW_MILLISECONDS).unwrap();
    let player = &registration.device.player_state;
    assert_eq!(player.session_id, SESSION_IDENTIFIER);
    assert!(player.track.is_none());
    assert!(!player.is_playing);
    assert!(player.is_system_initiated);
    assert_eq!(player.playback_speed, NORMAL_SPEED);
    assert!(player.options.is_some() && player.play_origin.is_some() && player.suppressions.is_some());
}

#[test]
fn invalid_device_names_and_session_identifiers_fail_before_registration() {
    let excessive_name = DEVICE_NAME.repeat(NAME_LIMIT_EXCEEDED);
    for name in [EMPTY_TEXT, WHITESPACE, CONTROL_TEXT, &excessive_name] {
        let configuration = ConnectDeviceConfiguration { name: name.to_owned(), playback_ready: false };
        assert!(matches!(validate_configuration(&configuration), Err(Failure::InvalidInput)));
    }
    let excessive_identifier = DEVICE_IDENTIFIER.repeat(IDENTIFIER_LIMIT_EXCEEDED);
    for identifier in [EMPTY_TEXT, CONTROL_TEXT, &excessive_identifier] {
        assert!(matches!(initial_registration(&configuration(false), identifier, SESSION_IDENTIFIER, NOW_MILLISECONDS), Err(Failure::InvalidInput)));
        assert!(matches!(initial_registration(&configuration(false), DEVICE_IDENTIFIER, identifier, NOW_MILLISECONDS), Err(Failure::InvalidInput)));
    }
}
