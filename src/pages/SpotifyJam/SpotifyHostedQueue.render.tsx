import { useEffect, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { HostedQueueStatus } from 'streaming-service-spotify-jam';
import DefaultText from '../../components/DefaultText';
import DefaultButton from '../../components/DefaultButton/DefaultButton.render';
import { spotifyHostedQueue } from '../../services/SpotifyMobileService';
import { SpotifyFailureMessages } from '../../services/spotify/SpotifyMobilePolicy';
import { spotifyJamStyles as styles } from './SpotifyJam.style';

export const HostedQueueCopy = Object.freeze({ title: 'Spotify host queue', refresh: 'Refresh host queue',
  explanation: 'Shows the hosting Spotify account’s queue. Guest queue observation is not available yet.',
  current: 'Playing in Spotify: ', separator: ' · ', empty: 'The Spotify host queue is empty.',
  unloaded: 'Refresh to load the host queue after starting playback in Spotify.',
  stale: 'The queue view is out of date. Refresh after reconnecting.', initialCount: 0 });

export default function SpotifyHostedQueue() {
  const snapshot = useSyncExternalStore(spotifyHostedQueue.subscribe, spotifyHostedQueue.getSnapshot);
  const focused = useIsFocused();
  useEffect(() => { if (focused) return spotifyHostedQueue.observe(); }, [focused]);
  const current = snapshot.currentlyPlaying;
  return <View style={styles.section}>
    <DefaultText style={styles.sectionTitle}>{HostedQueueCopy.title}</DefaultText>
    <DefaultText style={styles.explanation}>{HostedQueueCopy.explanation}</DefaultText>
    <DefaultButton title={HostedQueueCopy.refresh} onPress={() => { void spotifyHostedQueue.refresh(); }}
      disabled={!snapshot.enabled || snapshot.status === HostedQueueStatus.Loading} />
    {snapshot.failure !== null && <DefaultText style={styles.error}>{SpotifyFailureMessages[snapshot.failure]}</DefaultText>}
    {snapshot.status === HostedQueueStatus.Stale && <DefaultText>{HostedQueueCopy.stale}</DefaultText>}
    {current && <DefaultText>{HostedQueueCopy.current + current.title + HostedQueueCopy.separator + current.author}</DefaultText>}
    {snapshot.entries.map((entry, position) => <DefaultText key={position}>{entry.title + HostedQueueCopy.separator + entry.author}</DefaultText>)}
    {snapshot.entries.length === HostedQueueCopy.initialCount && <DefaultText>{snapshot.status === HostedQueueStatus.Ready
      ? HostedQueueCopy.empty : HostedQueueCopy.unloaded}</DefaultText>}
  </View>;
}
