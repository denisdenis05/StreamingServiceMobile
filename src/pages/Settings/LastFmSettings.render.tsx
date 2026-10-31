import React, { useSyncExternalStore } from 'react';
import { Alert, Text, View } from 'react-native';
import { LastFmOperation } from '../../services/settings/LastFmController';
import { lastFmSettings } from '../../services/settings/SettingsRuntime';
import { SettingsButton, SettingsFrame } from './Settings.components';
import { SettingsCopy as copy } from './Settings.copy';
import { SettingsNavigation } from './Settings.routes';
import { settingsStyles as styles } from './Settings.style';
export default function LastFmSettings({
  navigation,
}: {
  navigation: SettingsNavigation;
}) {
  const snapshot = useSyncExternalStore(
    lastFmSettings.subscribe,
    lastFmSettings.getSnapshot,
  );
  const authorizing = snapshot.operation === LastFmOperation.Authorizing;
  const busy = snapshot.operation !== LastFmOperation.Idle;
  const disconnect = () =>
    Alert.alert(copy.disconnect, copy.disconnectDescription, [
      { text: copy.cancel, style: 'cancel' },
      {
        text: copy.disconnect,
        style: 'destructive',
        onPress: () => {
          void lastFmSettings.disconnect();
        },
      },
    ]);
  return (
    <SettingsFrame title={copy.lastFm} navigation={navigation}>
      <Text style={styles.muted}>{copy.lastFmIntroduction}</Text>
      <View style={styles.tile}>
        <Text style={styles.section}>
          {snapshot.connected
            ? copy.connected
            : snapshot.failure
            ? copy.unknown
            : copy.disconnected}
        </Text>
        {snapshot.username && (
          <Text style={styles.text}>
            {copy.username}: {snapshot.username}
          </Text>
        )}
        {snapshot.connectedAt && (
          <Text style={styles.muted}>
            {copy.connectedAt}:{' '}
            {new Date(snapshot.connectedAt).toLocaleDateString()}
          </Text>
        )}
        {snapshot.failure && (
          <Text accessibilityRole="alert" style={styles.text}>
            {snapshot.failure}
          </Text>
        )}
        {authorizing && <Text style={styles.muted}>{copy.waiting}</Text>}
        <SettingsButton
          title={
            busy
              ? copy.busy
              : snapshot.connected
              ? copy.disconnect
              : copy.connect
          }
          disabled={busy}
          onPress={
            snapshot.connected
              ? disconnect
              : () => {
                  void lastFmSettings.authorize();
                }
          }
        />
        {authorizing && (
          <SettingsButton
            title={copy.cancelAuthorization}
            onPress={lastFmSettings.cancel}
          />
        )}
        <SettingsButton
          title={copy.refresh}
          disabled={busy && !authorizing}
          onPress={() => {
            void lastFmSettings.refresh();
          }}
        />
      </View>
    </SettingsFrame>
  );
}
