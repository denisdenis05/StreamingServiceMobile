import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { likedSongsSettings } from '../../services/settings/LikedSongsPlatform';
import {
  SettingsButton,
  SettingsButtonAppearance,
  SettingsFrame,
} from './Settings.components';
import { SettingsNavigation } from './Settings.routes';
import { settingsStyles as styles } from './Settings.style';
import { LikedSongsSettingsCopy as copy } from './LikedSongsSettings.copy';

type PlaylistDraft = {
  readonly accountIdentifier: string | null;
  readonly playlistIdentifier: string | null;
};
export default function LikedSongsSettings({
  navigation,
}: {
  navigation: SettingsNavigation;
}) {
  const snapshot = useSyncExternalStore(
    likedSongsSettings.subscribe,
    likedSongsSettings.getSnapshot,
  );
  const [draft, setDraft] = useState<PlaylistDraft | null>(null);
  useEffect(() => {
    void likedSongsSettings.refresh();
  }, []);
  useEffect(() => {
    setDraft(null);
  }, [snapshot.accountIdentifier, snapshot.selectedPlaylistIdentifier]);
  const chosenIdentifier =
    draft?.accountIdentifier === snapshot.accountIdentifier
      ? draft.playlistIdentifier
      : snapshot.selectedPlaylistIdentifier;
  const currentPlaylist = snapshot.playlists.find(
    playlist => playlist.identifier === snapshot.selectedPlaylistIdentifier,
  );
  const busy = snapshot.loading || snapshot.saving;
  const editable =
    snapshot.loaded && snapshot.accountIdentifier !== null && !busy;
  const changed = chosenIdentifier !== snapshot.selectedPlaylistIdentifier;
  const choose = (playlistIdentifier: string | null) =>
    setDraft({
      accountIdentifier: snapshot.accountIdentifier,
      playlistIdentifier,
    });
  return (
    <SettingsFrame title={copy.title} navigation={navigation}>
      <Text style={styles.muted}>{copy.introduction}</Text>
      <Text style={styles.muted}>{copy.explanation}</Text>
      <View style={styles.tile}>
        <Text style={styles.label}>{copy.current}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {snapshot.loading && !snapshot.loaded
            ? copy.loading
            : !snapshot.loaded
            ? copy.unavailable
            : snapshot.selectedPlaylistIdentifier === null
            ? copy.automatic
            : currentPlaylist?.name ?? copy.selectedUnavailable}
        </Text>
        {snapshot.error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {snapshot.error}
          </Text>
        )}
        <SettingsButton
          title={snapshot.loading ? copy.loading : copy.refresh}
          disabled={busy}
          appearance={SettingsButtonAppearance.Secondary}
          onPress={() => {
            void likedSongsSettings.refresh();
          }}
        />
      </View>
      {snapshot.loaded && (
        <View style={styles.tile} accessibilityRole="radiogroup">
          <Text style={styles.label}>{copy.choices}</Text>
          <TouchableOpacity
            accessibilityRole="radio"
            accessibilityLabel={copy.automatic}
            accessibilityState={{
              checked: chosenIdentifier === null,
              disabled: !editable,
            }}
            disabled={!editable}
            style={styles.row}
            onPress={() => choose(null)}
          >
            <View style={styles.grow}>
              <Text style={styles.text}>{copy.automatic}</Text>
              <Text style={styles.muted}>{copy.automaticDescription}</Text>
            </View>
            {chosenIdentifier === null && (
              <Text style={styles.statusBadge}>{copy.selected}</Text>
            )}
          </TouchableOpacity>
          {snapshot.playlists.map(playlist => (
            <TouchableOpacity
              key={playlist.identifier}
              accessibilityRole="radio"
              accessibilityLabel={playlist.name}
              accessibilityState={{
                checked: chosenIdentifier === playlist.identifier,
                disabled: !editable,
              }}
              disabled={!editable}
              style={styles.row}
              onPress={() => choose(playlist.identifier)}
            >
              <View style={styles.grow}>
                <Text style={styles.text}>{playlist.name}</Text>
                <Text style={styles.muted}>
                  {playlist.recordingCount} {copy.tracks}
                </Text>
              </View>
              {chosenIdentifier === playlist.identifier && (
                <Text style={styles.statusBadge}>{copy.selected}</Text>
              )}
            </TouchableOpacity>
          ))}
          {snapshot.playlists.length === LikedSongsEmptyChoices && (
            <Text style={styles.muted}>{copy.noPlaylists}</Text>
          )}
          {chosenIdentifier === null && (
            <Text style={styles.muted}>{copy.automaticPreservation}</Text>
          )}
          <SettingsButton
            title={snapshot.saving ? copy.saving : copy.save}
            disabled={!editable || !changed}
            onPress={() => {
              void likedSongsSettings.saveSelection(chosenIdentifier);
            }}
          />
        </View>
      )}
    </SettingsFrame>
  );
}
const LikedSongsEmptyChoices = 0;
