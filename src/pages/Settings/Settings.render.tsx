import React, { useSyncExternalStore } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { spotifyMobile } from '../../services/SpotifyMobileService';
import { SettingsIcon, SettingsSymbol } from './Settings.icons';
import { useAuth } from '../../hooks/AuthContext';
import { lastFmSettings } from '../../services/settings/SettingsRuntime';
import { SpotifyJamRoute } from '../SpotifyJam/SpotifyJam.copy';
import {
  SettingsFrame,
  SettingsRow,
  SettingsSymbols,
} from './Settings.components';
import { SettingsCopy as copy } from './Settings.copy';
import { SettingsNavigation, SettingsRoutes } from './Settings.routes';
import { settingsStyles as styles } from './Settings.style';
export default function Settings({
  navigation,
}: {
  navigation: SettingsNavigation;
}) {
  const { logout } = useAuth();
  const spotify = useSyncExternalStore(
    spotifyMobile.subscribe,
    spotifyMobile.getSnapshot,
  );
  const lastFm = useSyncExternalStore(
    lastFmSettings.subscribe,
    lastFmSettings.getSnapshot,
  );
  const row = (
    title: string,
    subtitle: string,
    symbol: SettingsSymbol,
    destination: string,
    status?: string,
  ) => (
    <SettingsRow
      key={destination}
      title={title}
      subtitle={subtitle}
      symbol={symbol}
      onPress={() => navigation.navigate(destination)}
      status={status}
    />
  );
  return (
    <SettingsFrame title={copy.title} navigation={navigation}>
      <Text style={styles.muted}>{copy.introduction}</Text>
      <Text style={styles.label}>{copy.accountGroup}</Text>
      <View style={styles.group}>
        {row(
          copy.account,
          copy.accountDescription,
          SettingsSymbols.account,
          SettingsRoutes.account,
        )}
      </View>
      <Text style={styles.label}>{copy.connectedGroup}</Text>
      <View style={styles.group}>
        {row(
          copy.spotify,
          copy.spotifyDescription,
          SettingsSymbols.spotify,
          SpotifyJamRoute,
          spotify.connected ? copy.connected : undefined,
        )}
        {row(
          copy.lastFm,
          copy.lastFmDescription,
          SettingsSymbols.lastFm,
          SettingsRoutes.lastFm,
          lastFm.connected ? copy.connected : undefined,
        )}
      </View>
      <Text style={styles.label}>{copy.listeningGroup}</Text>
      <View style={styles.group}>
        {row(
          copy.playback,
          copy.playbackDescription,
          SettingsSymbols.playback,
          SettingsRoutes.playback,
        )}
        {row(
          copy.storage,
          copy.storageDescription,
          SettingsSymbols.storage,
          SettingsRoutes.storage,
        )}
      </View>
      <Text style={styles.label}>{copy.applicationGroup}</Text>
      <View style={styles.group}>
        {row(
          copy.about,
          copy.aboutDescription,
          SettingsSymbols.about,
          SettingsRoutes.about,
        )}
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={copy.signOut}
        style={styles.signOut}
        onPress={() =>
          Alert.alert(copy.signOut, copy.signOutDescription, [
            { text: copy.cancel, style: 'cancel' },
            {
              text: copy.signOut,
              style: 'destructive',
              onPress: () => {
                void logout();
              },
            },
          ])
        }
      >
        <SettingsIcon
          symbol={SettingsSymbol.Logout}
          color={styles.signOutText.color}
        />
        <Text style={styles.signOutText}>{copy.signOut}</Text>
      </TouchableOpacity>
      <Text style={styles.muted}>
        {copy.product} · {copy.madeForListening}
      </Text>
    </SettingsFrame>
  );
}
