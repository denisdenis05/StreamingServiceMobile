import { useSyncExternalStore } from 'react';
import { TextInput, View } from 'react-native';
import DefaultText from '../../components/DefaultText';
import DefaultButton from '../../components/DefaultButton/DefaultButton.render';
import { spotifyHosting, spotifyListeningCountry } from '../../services/SpotifyMobileService';
import { playerJam } from '../../services/PlayerJamRuntime';
import { SpotifyPlayerJamMode } from '../../services/spotify/SpotifyPlayerJamController';
import { SpotifyHostingStatus } from '../../services/spotify/SpotifyHostingStore';
import { SpotifyHostingFailureMessages, spotifyHostingQueueIssueMessage } from '../../services/spotify/SpotifyHostingFailureCopy';
import { SpotifyFailureMessages } from '../../services/spotify/SpotifyMobilePolicy';
import { spotifyJamStyles as styles } from './SpotifyJam.style';
export const SpotifyHostingCopy = Object.freeze({ title: 'Host from this app',
  explanation: 'Uses your current app queue and library audio. Your Spotify account must own the Jam and have a registered native connection.',
  ownerSelection: 'To share music while following Spotify, choose a song or playlist in this app. The new app queue will become the Jam queue.',
  start: 'Host current app queue', stop: 'Stop app hosting', market: 'Hosting country code', empty: '', marketCharacters: 2,
  capitalization: 'characters', preparing: 'Matching the current queue…', starting: 'Confirming app hosting…',
  hosting: 'This app is hosting the Jam.', resolving: 'Matching new queue entries. Playback is paused; use Play after matching finishes.', stopping: 'Stopping app hosting…' } as const);
const Messages = Object.freeze({ [SpotifyHostingStatus.Resolving]: SpotifyHostingCopy.resolving, [SpotifyHostingStatus.Preparing]: SpotifyHostingCopy.preparing, [SpotifyHostingStatus.Starting]: SpotifyHostingCopy.starting,
  [SpotifyHostingStatus.Hosting]: SpotifyHostingCopy.hosting, [SpotifyHostingStatus.Stopping]: SpotifyHostingCopy.stopping });
export default function SpotifyHosting() {
  const snapshot = useSyncExternalStore(spotifyHosting.subscribe, spotifyHosting.getSnapshot);
  const sharing = useSyncExternalStore(playerJam.subscribe, playerJam.getSnapshot);
  const market = useSyncExternalStore(spotifyListeningCountry.subscribe, spotifyListeningCountry.getSnapshot);
  const setMarket = spotifyListeningCountry.set;
  const queueIssueMessage = spotifyHostingQueueIssueMessage(snapshot.queueIssue);
  const busy = snapshot.status !== SpotifyHostingStatus.Stopped && snapshot.status !== SpotifyHostingStatus.Failed;
  const available = sharing.canHost;
  const message = snapshot.status in Messages ? Messages[snapshot.status as keyof typeof Messages] : null;
  return <View style={styles.section}>
    <DefaultText style={styles.sectionTitle}>{SpotifyHostingCopy.title}</DefaultText>
    <DefaultText style={styles.explanation}>{SpotifyHostingCopy.explanation}</DefaultText>
    {sharing.owned && sharing.mode === SpotifyPlayerJamMode.Following &&
      <DefaultText style={styles.explanation}>{SpotifyHostingCopy.ownerSelection}</DefaultText>}
    <TextInput value={market} onChangeText={setMarket} placeholder={SpotifyHostingCopy.market} accessibilityLabel={SpotifyHostingCopy.market}
      maxLength={SpotifyHostingCopy.marketCharacters} autoCapitalize={SpotifyHostingCopy.capitalization} autoCorrect={false} editable={!busy} style={styles.input} />
    <DefaultButton title={SpotifyHostingCopy.start} disabled={!available || busy || market.length !== SpotifyHostingCopy.marketCharacters}
      onPress={() => { void playerJam.startHosting(); }} />
    <DefaultButton title={SpotifyHostingCopy.stop} disabled={!busy || snapshot.status === SpotifyHostingStatus.Stopping}
      onPress={() => { void spotifyHosting.stop().catch(() => undefined); }} style={styles.neutral} />
    {message && <DefaultText>{message}</DefaultText>}
    {queueIssueMessage && <DefaultText style={styles.error}>{queueIssueMessage}</DefaultText>}
    {!queueIssueMessage && snapshot.failureStage && <DefaultText style={styles.error}>{SpotifyHostingFailureMessages[snapshot.failureStage]}</DefaultText>}
    {!queueIssueMessage && snapshot.failure !== null && <DefaultText style={styles.error}>{SpotifyFailureMessages[snapshot.failure]}</DefaultText>}
  </View>;
}
