import { useSyncExternalStore } from 'react';
import { TextInput, View } from 'react-native';
import { JamConnectionStatus, MatchEvidence, MatchStatus, RecordingQueueStatus } from 'streaming-service-spotify-jam';
import DefaultText from '../../components/DefaultText';
import DefaultButton from '../../components/DefaultButton/DefaultButton.render';
import { spotifyMobile, spotifyRecordingQueue, spotifyListeningCountry } from '../../services/SpotifyMobileService';
import type { SpotifySongSelection } from '../../services/spotify/SpotifySongSelection';
import { SpotifyFailureMessages } from '../../services/spotify/SpotifyMobilePolicy';
import { spotifyJamStyles as styles } from './SpotifyJam.style';

export const RecordingQueueCopy = Object.freeze({ heading: 'Share a song from your library',
  marketLabel: 'Matches for country: ', market: 'Spotify country code, for example US', find: 'Find a Spotify recording',
  choose: 'Choose the matching recording to add it to the host queue.', noMatch: 'No matching Spotify recording was found.',
  matching: 'Finding Spotify recordings…', submitting: 'Submitting to Spotify…', accepted: 'Spotify accepted the queue request.',
  changedAccount: 'This selection belongs to a different app account. Select the song again.',
  separator: ' · ', selected: 'Selected song: ', candidate: 'Add recording: ', blocked: 'Different version, conflicting recording or unavailable',
  marketPattern: /^[A-Z]{2}$/, capitalization: 'characters', marketCharacters: 2 } as const);

export default function SpotifyRecordingQueue({ selection }: { readonly selection: SpotifySongSelection }) {
  const mobile = useSyncExternalStore(spotifyMobile.subscribe, spotifyMobile.getSnapshot);
  const snapshot = useSyncExternalStore(spotifyRecordingQueue.subscribe, spotifyRecordingQueue.getSnapshot);
  const market = useSyncExternalStore(spotifyListeningCountry.subscribe, spotifyListeningCountry.getSnapshot);
  const setMarket = spotifyListeningCountry.set;
  const busy = snapshot.status === RecordingQueueStatus.Matching || snapshot.status === RecordingQueueStatus.Submitting;
  const currentAccount = spotifyMobile.isApplicationAccount(selection.applicationAccountIdentifier);
  const canFind = currentAccount && !busy && RecordingQueueCopy.marketPattern.test(market.toUpperCase());
  const session = mobile.session?.session;
  const canEnqueue = mobile.session?.status === JamConnectionStatus.Ready && session?.active && session.hostDeviceIdentifier
    && (session.ownedByCurrentAccount || (mobile.canSubmitGuestCommands
      && session.participants.some(participant => participant.identifier === mobile.session?.accountIdentifier)));
  const source = selection.recordings.find(recording => recording.identifier === snapshot.recordingIdentifier);

  return <View style={styles.section}>
    <DefaultText style={styles.sectionTitle}>{RecordingQueueCopy.heading}</DefaultText>
    {!currentAccount && <DefaultText>{RecordingQueueCopy.changedAccount}</DefaultText>}
    <TextInput value={market} onChangeText={setMarket} placeholder={RecordingQueueCopy.market} accessibilityLabel={RecordingQueueCopy.market}
      autoCorrect={false} autoCapitalize={RecordingQueueCopy.capitalization} maxLength={RecordingQueueCopy.marketCharacters}
      editable={!busy} style={styles.input} />
    {selection.recordings.map(recording => <DefaultButton key={recording.identifier}
      title={RecordingQueueCopy.find + RecordingQueueCopy.separator + recording.title + RecordingQueueCopy.separator + recording.author}
      disabled={!canFind} onPress={() => { void spotifyRecordingQueue.prepare(recording.identifier, market.toUpperCase()); }} />)}
    {source && <DefaultText>{RecordingQueueCopy.selected + source.title + RecordingQueueCopy.separator + source.author}</DefaultText>}
    {snapshot.status === RecordingQueueStatus.Matching && <DefaultText>{RecordingQueueCopy.matching}</DefaultText>}
    {snapshot.status === RecordingQueueStatus.Submitting && <DefaultText>{RecordingQueueCopy.submitting}</DefaultText>}
    {snapshot.failure !== null && <DefaultText style={styles.error}>{SpotifyFailureMessages[snapshot.failure]}</DefaultText>}
    {snapshot.match?.status === MatchStatus.NotFound && <DefaultText>{RecordingQueueCopy.noMatch}</DefaultText>}
    {source && snapshot.match !== null && snapshot.match.status !== MatchStatus.NotFound && <>
      <DefaultText>{RecordingQueueCopy.marketLabel + snapshot.market}</DefaultText>
      <DefaultText>{RecordingQueueCopy.choose}</DefaultText>
      {snapshot.match.candidates.map(candidate => {
        const blocked = candidate.song.playable === false || candidate.evidence.includes(MatchEvidence.VersionConflict)
          || candidate.evidence.includes(MatchEvidence.RecordingCodeConflict) || candidate.evidence.includes(MatchEvidence.Unavailable);
        return <View key={candidate.song.identifier}>
          <DefaultButton title={RecordingQueueCopy.candidate + candidate.song.title + RecordingQueueCopy.separator + candidate.song.author}
            disabled={!currentAccount || !canEnqueue || snapshot.status !== RecordingQueueStatus.Ready || market.toUpperCase() !== snapshot.market || blocked}
            onPress={() => { void spotifyRecordingQueue.enqueue(candidate.song.identifier); }} />
          {blocked && <DefaultText>{RecordingQueueCopy.blocked}</DefaultText>}
        </View>;
      })}
    </>}
    {source && currentAccount && snapshot.status === RecordingQueueStatus.Accepted && <DefaultText>{RecordingQueueCopy.accepted}</DefaultText>}
  </View>;
}
