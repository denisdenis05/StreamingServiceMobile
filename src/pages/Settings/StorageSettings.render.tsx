import React, { useEffect, useSyncExternalStore } from 'react';
import { Alert, Text, View } from 'react-native';
import { storageSettings } from '../../services/settings/SettingsServices';
import { SettingsButton, SettingsFrame } from './Settings.components';
import { SettingsCopy as copy } from './Settings.copy';
import { SettingsNavigation } from './Settings.routes';
import { settingsStyles as styles } from './Settings.style';
const StorageCopy = Object.freeze({
  image: 'Artwork cache',
  audio: 'Cached audio',
  available: 'Available device storage',
  clear: 'Clear artwork cache',
  confirmation:
    'Remove cached artwork from this device? Artwork will download again when needed.',
  introduction:
    'Audio already cached for this account and server appears below. Artwork is downloaded again when needed.',
  refresh: 'Refresh storage',
  unavailable: 'Unavailable',
  loading: 'Measuring storage…',
  mebibytes: ' MiB',
  bytesPerMebibyte: 1048576,
  decimalPlaces: 1,
});
function formatBytes(bytes: number | null): string {
  return bytes === null
    ? StorageCopy.unavailable
    : (bytes / StorageCopy.bytesPerMebibyte).toFixed(
        StorageCopy.decimalPlaces,
      ) + StorageCopy.mebibytes;
}
export default function StorageSettings({
  navigation,
}: {
  navigation: SettingsNavigation;
}) {
  const snapshot = useSyncExternalStore(
    storageSettings.subscribe,
    storageSettings.getSnapshot,
  );
  useEffect(() => {
    void storageSettings.refresh();
  }, []);
  const busy = snapshot.loading || snapshot.clearing;
  return (
    <SettingsFrame title={copy.storage} navigation={navigation}>
      <Text style={styles.muted}>{StorageCopy.introduction}</Text>
      <View style={styles.tile}>
        {[
          { title: StorageCopy.image, value: snapshot.imageCacheBytes },
          { title: StorageCopy.audio, value: snapshot.audioCacheBytes },
          { title: StorageCopy.available, value: snapshot.availableBytes },
        ].map(metric => (
          <View key={metric.title} style={styles.header}>
            <Text style={styles.text}>{metric.title}</Text>
            <Text style={styles.muted}>{formatBytes(metric.value)}</Text>
          </View>
        ))}
      </View>
      {snapshot.loading && (
        <Text style={styles.muted}>{StorageCopy.loading}</Text>
      )}
      {snapshot.error && (
        <Text accessibilityRole="alert" style={styles.text}>
          {snapshot.error}
        </Text>
      )}
      <SettingsButton
        title={StorageCopy.clear}
        disabled={busy}
        onPress={() =>
          Alert.alert(StorageCopy.clear, StorageCopy.confirmation, [
            { text: copy.cancel, style: 'cancel' },
            {
              text: StorageCopy.clear,
              style: 'destructive',
              onPress: () => {
                void storageSettings.clearImageCache();
              },
            },
          ])
        }
      />
      <SettingsButton
        title={StorageCopy.refresh}
        disabled={busy}
        onPress={() => {
          void storageSettings.refresh();
        }}
      />
    </SettingsFrame>
  );
}
