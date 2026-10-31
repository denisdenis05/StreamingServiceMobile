import React, { useEffect, useSyncExternalStore } from 'react';
import { Switch, Text, View } from 'react-native';
import { RepeatMode } from 'streaming-service-player';
import { playbackSettings } from '../../services/settings/SettingsServices';
import { colors } from '../../constants/styling';
import { SettingsButton, SettingsFrame } from './Settings.components';
import { SettingsCopy as copy } from './Settings.copy';
import { SettingsNavigation } from './Settings.routes';
import { settingsStyles as styles } from './Settings.style';
const PlaybackCopy = Object.freeze({
  shuffle: 'Shuffle',
  shuffleDescription: 'Play the current queue in a shuffled order.',
  repeat: 'Repeat',
  off: 'Off',
  one: 'One track',
  all: 'All tracks',
  selected: 'Selected: ',
  introduction: 'Control the current playback queue.',
  external: 'Shared playback is controlled from Spotify & Jam.',
  unavailable: 'Start playback to change queue preferences.',
  refresh: 'Refresh playback',
});
const repeatChoices = Object.freeze([
  { mode: RepeatMode.Off, title: PlaybackCopy.off },
  { mode: RepeatMode.One, title: PlaybackCopy.one },
  { mode: RepeatMode.All, title: PlaybackCopy.all },
]);
export default function PlaybackSettings({
  navigation,
}: {
  navigation: SettingsNavigation;
}) {
  const snapshot = useSyncExternalStore(
    playbackSettings.subscribe,
    playbackSettings.getSnapshot,
  );
  useEffect(() => {
    void playbackSettings.refresh();
  }, []);
  const disabled =
    !snapshot.ready || snapshot.busy || snapshot.externallyControlled;
  return (
    <SettingsFrame title={copy.playback} navigation={navigation}>
      <Text style={styles.muted}>{PlaybackCopy.introduction}</Text>
      {snapshot.externallyControlled && (
        <Text style={styles.muted}>{PlaybackCopy.external}</Text>
      )}
      {!snapshot.ready && (
        <Text style={styles.muted}>{PlaybackCopy.unavailable}</Text>
      )}
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={styles.text}>{PlaybackCopy.shuffle}</Text>
            <Text style={styles.muted}>{PlaybackCopy.shuffleDescription}</Text>
          </View>
          <Switch
            accessibilityLabel={PlaybackCopy.shuffle}
            disabled={disabled}
            value={snapshot.shuffled}
            onValueChange={enabled => {
              void playbackSettings.setShuffle(enabled);
            }}
            trackColor={{ true: colors.accentPrimary }}
          />
        </View>
      </View>
      <Text style={styles.section}>{PlaybackCopy.repeat}</Text>
      {repeatChoices.map(choice => (
        <SettingsButton
          key={choice.mode}
          title={
            snapshot.repeatMode === choice.mode
              ? PlaybackCopy.selected + choice.title
              : choice.title
          }
          disabled={disabled}
          onPress={() => {
            void playbackSettings.setRepeat(choice.mode);
          }}
        />
      ))}
      {snapshot.error && (
        <Text accessibilityRole="alert" style={styles.text}>
          {snapshot.error}
        </Text>
      )}
      <SettingsButton
        title={PlaybackCopy.refresh}
        disabled={snapshot.busy}
        onPress={() => {
          void playbackSettings.refresh();
        }}
      />
    </SettingsFrame>
  );
}
