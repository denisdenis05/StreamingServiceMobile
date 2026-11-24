import React, { useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import {
  IntegrationFailureCode,
  SpotifyLoginMethod,
  SpotifyLoginStage,
} from 'streaming-service-spotify-jam';
import { spotifyMobile } from '../../services/SpotifyMobileService';
import {
  SpotifyAuthenticationAction,
  SpotifyMobileOperation,
} from '../../services/spotify/SpotifyMobileController';
import {
  SpotifyFailureMessages,
  SpotifyMobilePolicy,
} from '../../services/spotify/SpotifyMobilePolicy';
import { SpotifyConnectStatus } from '../../services/spotify/SpotifyConnectStore';
import { SpotifyJamCopy, SpotifyJamRoute } from '../SpotifyJam/SpotifyJam.copy';
import {
  SettingsButton,
  SettingsButtonAppearance,
  SettingsFrame,
} from './Settings.components';
import { SettingsCopy } from './Settings.copy';
import { SettingsNavigation } from './Settings.routes';
import { settingsStyles as styles } from './Settings.style';
import { SpotifySettingsCopy } from './SpotifySettings.copy';

const InputPolicy = Object.freeze({
  capitalization: 'none',
  autoComplete: 'off',
  cancelStyle: 'cancel',
  destructiveStyle: 'destructive',
} as const);
const ClientIdentifierCharacters = 32;
const LibrespotInputLimits = Object.freeze({
  maximumUsernameCharacters: 512,
  maximumPasswordCharacters: 4096,
});

export default function SpotifySettings({
  navigation,
}: {
  navigation: SettingsNavigation;
}) {
  const snapshot = useSyncExternalStore(
    spotifyMobile.subscribe,
    spotifyMobile.getSnapshot,
  );
  const [clientIdentifier, setClientIdentifier] = useState<string>(
    SpotifyMobilePolicy.emptyText,
  );
  const [username, setUsername] = useState<string>(
    SpotifyMobilePolicy.emptyText,
  );
  const [password, setPassword] = useState<string>(
    SpotifyMobilePolicy.emptyText,
  );
  const [advanced, setAdvanced] = useState(false);
  const [details, setDetails] = useState(false);
  const [connectionChanged, setConnectionChanged] = useState(false);
  const busy = snapshot.operation !== SpotifyMobileOperation.Idle;
  const librespotLogin =
    snapshot.authenticationMethod === SpotifyLoginMethod.Librespot;
  const pairing = snapshot.deviceAuthorization;
  const waitingForApproval =
    pairing !== undefined &&
    (snapshot.loginStage === undefined ||
      snapshot.loginStage === SpotifyLoginStage.Preparing ||
      snapshot.loginStage === SpotifyLoginStage.Authorizing);
  const loginStep = waitingForApproval
    ? SpotifyJamCopy.waitingApproval
    : snapshot.loginStage === undefined
    ? null
    : librespotLogin && snapshot.loginStage === SpotifyLoginStage.Authorizing
    ? SpotifyJamCopy.librespotAuthorizing
    : SpotifyJamCopy.loginSteps[snapshot.loginStage];
  const deviceLogin = snapshot.deviceAuthorizationLogin === true;
  const failedNativeBootstrap =
    deviceLogin &&
    snapshot.loginStage === SpotifyLoginStage.Exchanging &&
    (snapshot.failure === IntegrationFailureCode.Unauthorized ||
      snapshot.failure === IntegrationFailureCode.Forbidden ||
      snapshot.failure === IntegrationFailureCode.Unsupported ||
      snapshot.failure === IntegrationFailureCode.InvalidResponse);
  const loginFailure = failedNativeBootstrap
    ? SpotifyJamCopy.deviceSessionRejected
    : deviceLogin && snapshot.failure === IntegrationFailureCode.Unauthorized
    ? SpotifyJamCopy.deviceRejected
    : deviceLogin && snapshot.failure === IntegrationFailureCode.Unsupported
    ? SpotifyJamCopy.deviceUnavailable
    : librespotLogin &&
      (snapshot.failure === IntegrationFailureCode.Forbidden ||
        snapshot.failure === IntegrationFailureCode.Unauthorized)
    ? SpotifyJamCopy.librespotRejected
    : librespotLogin && snapshot.failure === IntegrationFailureCode.Unsupported
    ? SpotifyJamCopy.librespotUnsupported
    : snapshot.authenticationAction === SpotifyAuthenticationAction.Resume &&
      (snapshot.failure === IntegrationFailureCode.Unauthorized ||
        snapshot.failure === IntegrationFailureCode.InvalidResponse)
    ? SpotifyJamCopy.resumeFailed
    : !librespotLogin &&
      snapshot.loginStage === SpotifyLoginStage.Authorizing &&
      snapshot.failure === IntegrationFailureCode.Canceled
    ? snapshot.authorizationReturnStatus === undefined
      ? SpotifyJamCopy.loginCancelled
      : SpotifyJamCopy.returnFailures[snapshot.authorizationReturnStatus]
    : snapshot.failure === null
    ? null
    : SpotifyFailureMessages[snapshot.failure];

  function connect(): void {
    void spotifyMobile.login({
      clientIdentifier: clientIdentifier.trim(),
      redirectAddress: SpotifyJamCopy.redirectAddress,
      scopes: Object.values(SpotifyJamCopy.loginScopes),
    });
  }
  function connectLibrespot(): void {
    const input = { username: username.trim(), password };
    setPassword(SpotifyMobilePolicy.emptyText);
    void spotifyMobile.loginWithLibrespot(input);
  }

  function confirmDisconnect(): void {
    setConnectionChanged(false);
    const expectedSnapshot = spotifyMobile.getSnapshot();
    Alert.alert(
      SpotifySettingsCopy.disconnectTitle,
      SpotifySettingsCopy.disconnectDescription,
      [
        { text: SettingsCopy.cancel, style: InputPolicy.cancelStyle },
        {
          text: SpotifyJamCopy.disconnect,
          style: InputPolicy.destructiveStyle,
          onPress: () => {
            if (spotifyMobile.getSnapshot() !== expectedSnapshot) {
              setConnectionChanged(true);
              return;
            }
            setPassword(SpotifyMobilePolicy.emptyText);
            spotifyMobile.disconnect();
          },
        },
      ],
    );
  }

  const nativeConnection = snapshot.nativeConnection;
  const needsReconnect =
    snapshot.connected &&
    (nativeConnection?.status === SpotifyConnectStatus.Failed ||
      nativeConnection?.status === SpotifyConnectStatus.Detached);
  const reconnecting =
    nativeConnection?.status === SpotifyConnectStatus.Connecting ||
    nativeConnection?.status === SpotifyConnectStatus.Reconnecting;

  return (
    <SettingsFrame title={SpotifySettingsCopy.title} navigation={navigation}>
      <Text style={styles.muted}>{SpotifySettingsCopy.introduction}</Text>
      <View style={styles.detailGroup}>
        <Text style={styles.section}>
          {snapshot.connected
            ? reconnecting
              ? SpotifySettingsCopy.reconnecting
              : needsReconnect
              ? SpotifySettingsCopy.connectionInterrupted
              : SettingsCopy.connected
            : SettingsCopy.disconnected}
        </Text>
        {snapshot.connected && (
          <Text style={styles.text}>
            {snapshot.displayName || SpotifySettingsCopy.accountFallback}
          </Text>
        )}
        <Text style={styles.muted}>
          {snapshot.connected
            ? SpotifySettingsCopy.connectedDescription
            : SpotifySettingsCopy.disconnectedDescription}
        </Text>
      </View>
      {connectionChanged && (
        <Text accessibilityRole="alert" style={styles.error}>
          {SpotifySettingsCopy.connectionChanged}
        </Text>
      )}
      {busy && <ActivityIndicator accessibilityLabel={SpotifyJamCopy.busy} />}
      {!snapshot.connected ? (
        <View style={styles.detailGroup}>
          <Text style={styles.section}>{SpotifyJamCopy.deviceHeading}</Text>
          <Text style={styles.muted}>{SpotifyJamCopy.deviceExplanation}</Text>
          <SettingsButton
            title={SpotifyJamCopy.deviceConnect}
            onPress={() => {
              void spotifyMobile.loginWithDeviceAuthorization();
            }}
            disabled={busy}
          />
          {waitingForApproval && pairing !== undefined && (
            <View style={styles.detailGroup}>
              <Text style={styles.text}>
                {SpotifyJamCopy.pairingCode + pairing.userCode}
              </Text>
              <Text>
                {SpotifyJamCopy.pairingExpires +
                  new Date(pairing.expiresAtMilliseconds).toLocaleTimeString()}
              </Text>
              <Text style={styles.muted}>
                {SpotifyJamCopy.pairingExplanation}
              </Text>
              <SettingsButton
                title={SpotifyJamCopy.reopenVerification}
                appearance={SettingsButtonAppearance.Secondary}
                onPress={() => {
                  void spotifyMobile.openDeviceAuthorization();
                }}
              />
            </View>
          )}
          {busy && (
            <SettingsButton
              title={SpotifyJamCopy.cancelSignIn}
              appearance={SettingsButtonAppearance.Secondary}
              onPress={() => spotifyMobile.disconnect()}
            />
          )}
          {loginStep !== null && <Text style={styles.muted}>{loginStep}</Text>}
          {loginFailure !== null && (
            <Text accessibilityRole="alert" style={styles.error}>
              {loginFailure}
            </Text>
          )}
          <SettingsButton
            title={SpotifyJamCopy.restore}
            appearance={SettingsButtonAppearance.Secondary}
            onPress={() => {
              void spotifyMobile.restore();
            }}
            disabled={busy}
          />
          <SettingsButton
            appearance={SettingsButtonAppearance.Secondary}
            title={
              advanced
                ? SpotifySettingsCopy.hideAlternatives
                : SpotifySettingsCopy.alternativeMethods
            }
            onPress={() => setAdvanced(!advanced)}
            disabled={busy}
          />
          {advanced && (
            <View style={styles.detailGroup}>
              <Text style={styles.section}>
                {SpotifyJamCopy.librespotHeading}
              </Text>
              <Text style={styles.muted}>
                {SpotifyJamCopy.librespotExplanation}
              </Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder={SpotifyJamCopy.usernamePlaceholder}
                accessibilityLabel={SpotifyJamCopy.usernamePlaceholder}
                autoCorrect={false}
                autoCapitalize={InputPolicy.capitalization}
                autoComplete={InputPolicy.autoComplete}
                maxLength={LibrespotInputLimits.maximumUsernameCharacters}
                editable={!busy}
                style={styles.input}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={SpotifyJamCopy.passwordPlaceholder}
                accessibilityLabel={SpotifyJamCopy.passwordPlaceholder}
                autoCorrect={false}
                secureTextEntry
                autoCapitalize={InputPolicy.capitalization}
                autoComplete={InputPolicy.autoComplete}
                maxLength={LibrespotInputLimits.maximumPasswordCharacters}
                editable={!busy}
                style={styles.input}
              />
              <SettingsButton
                title={SpotifyJamCopy.librespotConnect}
                onPress={connectLibrespot}
                disabled={busy || !username.trim() || !password}
              />
              <Text style={styles.section}>{SpotifyJamCopy.oauthHeading}</Text>
              <Text style={styles.muted}>
                {SpotifyJamCopy.loginExplanation}
              </Text>
              <Text style={styles.muted}>
                {SpotifyJamCopy.registrationNotice}
              </Text>
              <Text style={styles.text}>{SpotifyJamCopy.redirectAddress}</Text>
              <TextInput
                value={clientIdentifier}
                onChangeText={setClientIdentifier}
                placeholder={SpotifyJamCopy.clientIdentifierPlaceholder}
                accessibilityLabel={SpotifyJamCopy.clientIdentifierPlaceholder}
                autoCorrect={false}
                autoCapitalize={InputPolicy.capitalization}
                autoComplete={InputPolicy.autoComplete}
                maxLength={ClientIdentifierCharacters}
                editable={!busy}
                style={styles.input}
              />
              <SettingsButton
                title={SpotifyJamCopy.connect}
                onPress={connect}
                disabled={busy || !clientIdentifier.trim()}
              />
              <SettingsButton
                title={SpotifyJamCopy.forget}
                appearance={SettingsButtonAppearance.Destructive}
                onPress={confirmDisconnect}
                disabled={busy}
              />
            </View>
          )}
        </View>
      ) : (
        <>
          {needsReconnect && (
            <SettingsButton
              title={SpotifySettingsCopy.reconnect}
              appearance={SettingsButtonAppearance.Secondary}
              onPress={() => {
                void spotifyMobile.restore();
              }}
              disabled={busy}
            />
          )}
          {nativeConnection?.failure && (
            <Text accessibilityRole="alert" style={styles.error}>
              {SpotifyFailureMessages[nativeConnection.failure]}
            </Text>
          )}
          <SettingsButton
            title={SpotifySettingsCopy.openJam}
            onPress={() => navigation.navigate(SpotifyJamRoute)}
          />
          <Text style={styles.muted}>{SpotifySettingsCopy.jamDescription}</Text>
          <SettingsButton
            appearance={SettingsButtonAppearance.Secondary}
            title={
              details
                ? SpotifySettingsCopy.hideDetails
                : SpotifySettingsCopy.details
            }
            onPress={() => setDetails(!details)}
          />
          {details && (
            <View style={styles.detailGroup}>
              {nativeConnection && (
                <Text style={styles.text}>
                  {
                    SpotifyJamCopy.nativeConnectionStates[
                      nativeConnection.status
                    ]
                  }
                </Text>
              )}
              {snapshot.failure !== null && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {snapshot.failure === IntegrationFailureCode.Forbidden
                    ? SpotifyJamCopy.jamAccessRejected
                    : SpotifyFailureMessages[snapshot.failure]}
                </Text>
              )}
              <Text style={styles.muted}>
                {SpotifySettingsCopy.detailsDescription}
              </Text>
            </View>
          )}
          <SettingsButton
            title={SpotifyJamCopy.disconnect}
            appearance={SettingsButtonAppearance.Destructive}
            onPress={confirmDisconnect}
            disabled={busy}
          />
        </>
      )}
    </SettingsFrame>
  );
}
