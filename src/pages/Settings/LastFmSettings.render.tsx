import React, { useEffect, useSyncExternalStore } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  LastFmOperation,
  LastFmSnapshot,
} from '../../services/settings/LastFmController';
import { lastFmSettings } from '../../services/settings/SettingsRuntime';
import { SettingsButton, SettingsFrame } from './Settings.components';
import { SettingsCopy as copy } from './Settings.copy';
import { LastFmSettingsCopy as lastFmCopy } from './LastFmSettings.copy';
import { SettingsNavigation } from './Settings.routes';
import { settingsStyles as styles } from './Settings.style';

function connectionPresentation(snapshot: LastFmSnapshot) {
  switch (snapshot.operation) {
    case LastFmOperation.Opening:
      return {
        title: lastFmCopy.opening,
        description: lastFmCopy.openingDescription,
      };
    case LastFmOperation.Authorizing:
      return {
        title: lastFmCopy.authorizing,
        description: lastFmCopy.authorizingDescription,
      };
    case LastFmOperation.Connecting:
      return {
        title: lastFmCopy.connecting,
        description: lastFmCopy.connectingDescription,
      };
    case LastFmOperation.Disconnecting:
      return {
        title: lastFmCopy.disconnecting,
        description: lastFmCopy.connectedDescription,
      };
    case LastFmOperation.Loading:
      return {
        title: lastFmCopy.checking,
        description: snapshot.authorizationPending
          ? lastFmCopy.authorizingDescription
          : null,
      };
    default:
      return {
        title: snapshot.connected
          ? copy.connected
          : snapshot.failure
          ? copy.unknown
          : lastFmCopy.disconnected,
        description: snapshot.connected
          ? lastFmCopy.connectedDescription
          : lastFmCopy.disconnectedDescription,
      };
  }
}

export default function LastFmSettings({
  navigation,
}: {
  navigation: SettingsNavigation;
}) {
  const snapshot = useSyncExternalStore(
    lastFmSettings.subscribe,
    lastFmSettings.getSnapshot,
  );
  useEffect(() => {
    void lastFmSettings.refresh();
  }, []);
  const presentation = connectionPresentation(snapshot);
  const idle = snapshot.operation === LastFmOperation.Idle;
  const authorizing = snapshot.operation === LastFmOperation.Authorizing;
  const cancellable = snapshot.authorizationPending;
  const connectedDate = snapshot.connectedAt
    ? new Date(snapshot.connectedAt)
    : null;
  const disconnect = () =>
    Alert.alert(copy.disconnect, lastFmCopy.disconnectDescription, [
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
      <Text style={styles.muted}>{lastFmCopy.introduction}</Text>
      <View style={styles.tile}>
        <Text style={styles.label}>{lastFmCopy.connection}</Text>
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={styles.section}
        >
          {presentation.title}
        </Text>
        {snapshot.username && (
          <Text style={styles.text}>
            {copy.username}: {snapshot.username}
          </Text>
        )}
        {connectedDate && !Number.isNaN(connectedDate.getTime()) && (
          <Text style={styles.muted}>
            {copy.connectedAt}: {connectedDate.toLocaleDateString()}
          </Text>
        )}
        {presentation.description && (
          <Text style={styles.muted}>{presentation.description}</Text>
        )}
        {snapshot.failure && (
          <Text accessibilityRole="alert" style={styles.text}>
            {snapshot.failure}
          </Text>
        )}
        {idle && (
          <SettingsButton
            title={snapshot.connected ? copy.disconnect : copy.connect}
            onPress={
              snapshot.connected
                ? disconnect
                : () => {
                    void lastFmSettings.authorize();
                  }
            }
          />
        )}
        <SettingsButton
          title={
            authorizing
              ? lastFmCopy.refreshApproval
              : snapshot.operation === LastFmOperation.Loading
              ? lastFmCopy.checking
              : copy.refresh
          }
          disabled={!idle && !authorizing}
          onPress={() => {
            void lastFmSettings.refresh();
          }}
        />
        {cancellable && (
          <>
            <SettingsButton
              title={copy.cancelAuthorization}
              onPress={lastFmSettings.cancel}
            />
            <Text style={styles.muted}>{lastFmCopy.cancelledDescription}</Text>
          </>
        )}
      </View>
      <View style={styles.tile}>
        <Text accessibilityRole="header" style={styles.section}>
          {lastFmCopy.historyTitle}
        </Text>
        <Text style={styles.muted}>{lastFmCopy.historyDescription}</Text>
      </View>
    </SettingsFrame>
  );
}
