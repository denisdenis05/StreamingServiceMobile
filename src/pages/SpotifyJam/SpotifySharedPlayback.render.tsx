import { useSyncExternalStore } from 'react';
import { TextInput, View } from 'react-native';
import { SharedPlaybackStatus, SpotifyLoginMethod } from 'streaming-service-spotify-jam';
import DefaultText from '../../components/DefaultText';
import DefaultButton from '../../components/DefaultButton/DefaultButton.render';
import { spotifyMobile, spotifyPlaybackFollower, spotifyListeningCountry } from '../../services/SpotifyMobileService';
import { SpotifyUpcomingQueueCopy } from '../../services/spotify/SpotifyUpcomingQueueCopy';
import { SpotifyFailureMessages } from '../../services/spotify/SpotifyMobilePolicy';
import { spotifyJamStyles as styles } from './SpotifyJam.style';

export const SharedPlaybackCopy = Object.freeze({ title: 'Listen alongside Spotify',
  explanation: 'Plays matching songs from your library while Spotify supplies playback position. An active Jam host supplies playback. Device sign-in also supports admitted guests after native membership verification.',
  replacement: 'Starting replaces your local queue. The host controls below send playback commands to Spotify. Pausing locally stops following. Spotify browser sign-in supports foreground listening only. Guest playback requires device sign-in and current Jam admission.',
  market: 'Two-letter country code', emptyText: '', marketCharacters: 2, capitalization: 'characters',
  start: 'Replace queue and follow Spotify', stop: 'Stop following Spotify',
  stopping: 'Stopping local shared playback…',
  waiting: 'Connecting to Spotify playback…', resolving: 'Finding the matching song in your library…',
  preparing: 'Loading the matching song…', following: 'Following Spotify playback.', buffering: 'Waiting for playback to be ready…',
  stale: 'Spotify playback information is out of date. Local audio is paused.',
  unavailable: 'A compatible local recording is unavailable for this song. Waiting for the next song.' } as const);

const StatusMessages: Readonly<Partial<Record<SharedPlaybackStatus, string>>> = Object.freeze({
  [SharedPlaybackStatus.Stopping]: SharedPlaybackCopy.stopping,
  [SharedPlaybackStatus.Waiting]: SharedPlaybackCopy.waiting, [SharedPlaybackStatus.Resolving]: SharedPlaybackCopy.resolving,
  [SharedPlaybackStatus.Preparing]: SharedPlaybackCopy.preparing, [SharedPlaybackStatus.Following]: SharedPlaybackCopy.following,
  [SharedPlaybackStatus.Buffering]: SharedPlaybackCopy.buffering, [SharedPlaybackStatus.Stale]: SharedPlaybackCopy.stale,
  [SharedPlaybackStatus.Unavailable]: SharedPlaybackCopy.unavailable,
});

export default function SpotifySharedPlayback() {
  const snapshot = useSyncExternalStore(spotifyPlaybackFollower.subscribe, spotifyPlaybackFollower.getSnapshot);
  const connection = useSyncExternalStore(spotifyMobile.subscribe, spotifyMobile.getSnapshot);
  const market = useSyncExternalStore(spotifyListeningCountry.subscribe, spotifyListeningCountry.getSnapshot);
  const setMarket = spotifyListeningCountry.set;
  const session = connection.session?.session;
  const available = connection.connected && session && (session.ownedByCurrentAccount || connection.authenticationMethod === SpotifyLoginMethod.Librespot && session.participants?.some(participant => participant.identifier === connection.session?.accountIdentifier)) && session.active && session.hostDeviceIdentifier;
  const following = snapshot.status !== SharedPlaybackStatus.Detached && snapshot.status !== SharedPlaybackStatus.Failed;
  const message = StatusMessages[snapshot.status];
  return <View style={styles.section}>
    <DefaultText style={styles.sectionTitle}>{SharedPlaybackCopy.title}</DefaultText>
    <DefaultText style={styles.explanation}>{SharedPlaybackCopy.explanation}</DefaultText>
    <DefaultText style={styles.explanation}>{SharedPlaybackCopy.replacement}</DefaultText>
    <TextInput value={market} onChangeText={setMarket} placeholder={SharedPlaybackCopy.market}
      accessibilityLabel={SharedPlaybackCopy.market} maxLength={SharedPlaybackCopy.marketCharacters}
      autoCapitalize={SharedPlaybackCopy.capitalization} autoCorrect={false} editable={!following} style={styles.input} />
    <DefaultButton title={SharedPlaybackCopy.start} disabled={!available || following || market.length !== SharedPlaybackCopy.marketCharacters}
      onPress={() => { void spotifyPlaybackFollower.start(market.toUpperCase()).catch(() => undefined); }} />
    <DefaultButton title={SharedPlaybackCopy.stop} disabled={!following || snapshot.status === SharedPlaybackStatus.Stopping}
      onPress={() => { void spotifyPlaybackFollower.stop().catch(() => undefined); }} style={styles.neutral} />
    {message && <DefaultText>{message}</DefaultText>}
    {following && snapshot.upcomingQueuePending && <DefaultText>{SpotifyUpcomingQueueCopy.pending}</DefaultText>}
    {following && (snapshot.unavailableUpcomingCount ?? SpotifyUpcomingQueueCopy.emptyCount) > SpotifyUpcomingQueueCopy.emptyCount && <DefaultText>{SpotifyUpcomingQueueCopy.unavailable}</DefaultText>}
    {following && snapshot.upcomingQueueFailure && !snapshot.upcomingQueuePending && <DefaultText>{SpotifyUpcomingQueueCopy.failure}</DefaultText>}
    {snapshot.failure !== null && <DefaultText style={styles.error}>{SpotifyFailureMessages[snapshot.failure]}</DefaultText>}
  </View>;
}
