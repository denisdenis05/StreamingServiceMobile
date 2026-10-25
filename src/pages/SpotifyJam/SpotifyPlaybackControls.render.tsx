import { useState, useSyncExternalStore } from 'react';
import { TextInput, View } from 'react-native';
import { HostedPlaybackCommandKind } from 'streaming-service-spotify-jam';
import DefaultText from '../../components/DefaultText';
import DefaultButton from '../../components/DefaultButton/DefaultButton.render';
import { spotifyPlaybackCommands } from '../../services/SpotifyMobileService';
import { SpotifyFailureMessages } from '../../services/spotify/SpotifyMobilePolicy';
import { spotifyJamStyles as styles } from './SpotifyJam.style';

export const PlaybackControlCopy = Object.freeze({ title: 'Control Spotify host playback',
  explanation: 'Controls the active Spotify device hosting your Jam. Local following updates from Spotify afterward. Guest controls are not available yet.',
  play: 'Play on Spotify', pause: 'Pause on Spotify', next: 'Next on Spotify', previous: 'Previous on Spotify',
  seek: 'Seek on Spotify', position: 'Position in seconds', keyboard: 'decimal-pad', maximumPositionCharacters: 16,
  emptyText: '', pending: 'Waiting for Spotify playback acknowledgement…',
  uncertain: 'The playback command may have reached Spotify. Check playback, then disconnect and reconnect before another command.' } as const);

export default function SpotifyPlaybackControls() {
  const snapshot = useSyncExternalStore(spotifyPlaybackCommands.subscribe, spotifyPlaybackCommands.getSnapshot);
  const [seconds, setSeconds] = useState<string>(PlaybackControlCopy.emptyText);
  const disabled = !snapshot.available || snapshot.pending || snapshot.uncertain;
  return <View style={styles.section}>
    <DefaultText style={styles.sectionTitle}>{PlaybackControlCopy.title}</DefaultText>
    <DefaultText style={styles.explanation}>{PlaybackControlCopy.explanation}</DefaultText>
    <DefaultButton title={PlaybackControlCopy.play} disabled={disabled}
      onPress={() => { void spotifyPlaybackCommands.execute(HostedPlaybackCommandKind.Play); }} />
    <DefaultButton title={PlaybackControlCopy.pause} disabled={disabled}
      onPress={() => { void spotifyPlaybackCommands.execute(HostedPlaybackCommandKind.Pause); }} />
    <DefaultButton title={PlaybackControlCopy.next} disabled={disabled}
      onPress={() => { void spotifyPlaybackCommands.execute(HostedPlaybackCommandKind.Next); }} />
    <DefaultButton title={PlaybackControlCopy.previous} disabled={disabled}
      onPress={() => { void spotifyPlaybackCommands.execute(HostedPlaybackCommandKind.Previous); }} />
    <TextInput value={seconds} onChangeText={setSeconds} placeholder={PlaybackControlCopy.position}
      accessibilityLabel={PlaybackControlCopy.position} keyboardType={PlaybackControlCopy.keyboard}
      maxLength={PlaybackControlCopy.maximumPositionCharacters} editable={!disabled} style={styles.input} />
    <DefaultButton title={PlaybackControlCopy.seek} disabled={disabled || !seconds.trim()}
      onPress={() => { void spotifyPlaybackCommands.seek(seconds); }} />
    {snapshot.pending && <DefaultText>{PlaybackControlCopy.pending}</DefaultText>}
    {snapshot.uncertain && <DefaultText style={styles.error}>{PlaybackControlCopy.uncertain}</DefaultText>}
    {snapshot.failure !== null && <DefaultText style={styles.error}>{SpotifyFailureMessages[snapshot.failure]}</DefaultText>}
  </View>;
}
