import type { ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { JamConnectionStatus, MatchEvidence, MatchStatus, RecordingQueueStatus } from 'streaming-service-spotify-jam';
import type { JamSnapshot, RecordingQueueSnapshot } from 'streaming-service-spotify-jam';
import DefaultButton from '../src/components/DefaultButton/DefaultButton.render';
import { SpotifyMobileOperation } from '../src/services/spotify/SpotifyMobileController';
import type { SpotifySongSelection } from '../src/services/spotify/SpotifySongSelection';

const Imports = Object.freeze({ service: '../src/services/SpotifyMobileService', screen: '../src/pages/SpotifyJam/SpotifyRecordingQueue.render' });
const Fixture = Object.freeze({ recordingIdentifier: 'recording', title: 'Song', author: 'Artist', spotifyIdentifier: '0123456789abcdefghijkl',
  spotifyAccount: 'spotify-account', sessionIdentifier: 'queue-jam', host: 'queue-host',
  applicationAccount: 'app-account', market: 'US', otherMarket: 'GB', firstPosition: 0, initialScore: 0 });
const Names = Object.freeze({ explicit: 'App recording matching and submission require separate presses',
  guest: 'Native admitted guests can enqueue while unsupported guests and removed participants cannot',
  country: 'Changing the country after matching disables the previous selection',
  unavailable: 'Contradictory and unavailable candidates cannot be queued',
  account: 'A route from another app account cannot start matching',
  matching: 'Pending matching disables additional source selections',
  notFound: 'No match does not present a queue action',
  receipt: 'Accepted submission has an explicit receipt scoped to the displayed source' });
let snapshot: RecordingQueueSnapshot;
let currentAccount = true;
const workflow = { getSnapshot: () => snapshot, subscribe: () => () => undefined,
  prepare: jest.fn(), enqueue: jest.fn() };
const mobile = { getSnapshot: () => mobileSnapshot, subscribe: () => () => undefined,
  isApplicationAccount: () => currentAccount };
let mobileSnapshot: { operation: SpotifyMobileOperation; canSubmitGuestCommands: boolean; session: JamSnapshot };
function membership(): JamSnapshot { return { accountIdentifier: Fixture.spotifyAccount, status: JamConnectionStatus.Ready, failure: null,
  session: { identifier: Fixture.sessionIdentifier, ownedByCurrentAccount: true, active: true, hostDeviceIdentifier: Fixture.host,
    participants: [{ identifier: Fixture.spotifyAccount, displayName: Fixture.author }] } }; }
jest.doMock(Imports.service, () => ({ spotifyRecordingQueue: workflow, spotifyMobile: mobile }));
const Screen = require(Imports.screen).default;
const Copy = require(Imports.screen).RecordingQueueCopy;
let rendered: ReactTestRenderer;
const selection: SpotifySongSelection = { applicationAccountIdentifier: Fixture.applicationAccount,
  recordings: [{ identifier: Fixture.recordingIdentifier, title: Fixture.title, author: Fixture.author }] };
function empty(): RecordingQueueSnapshot { return { status: RecordingQueueStatus.Idle, recordingIdentifier: null,
  market: null, match: null, acceptedSpotifyIdentifier: null, failure: null }; }
function matched(): RecordingQueueSnapshot { return { ...empty(), status: RecordingQueueStatus.Ready, recordingIdentifier: Fixture.recordingIdentifier,
  market: Fixture.market, match: { status: MatchStatus.Ambiguous, selected: null, failure: null,
    candidates: [{ song: { identifier: Fixture.spotifyIdentifier, title: Fixture.title, author: Fixture.author },
      score: Fixture.initialScore, evidence: [MatchEvidence.Title, MatchEvidence.Artist], acceptable: false }] } }; }
async function render(): Promise<void> { await act(async () => { rendered = create(<Screen selection={selection} />); }); }
function button(title: string) { return rendered.root.findAllByType(DefaultButton).find(instance => instance.props.title === title)!; }
function sourceTitle() { return Copy.find + Copy.separator + Fixture.title + Copy.separator + Fixture.author; }
function candidateTitle() { return Copy.candidate + Fixture.title + Copy.separator + Fixture.author; }
async function country(value: string = Fixture.market): Promise<void> { await act(async () => rendered.root.findByType(TextInput).props.onChangeText(value)); }
beforeEach(() => { jest.clearAllMocks(); currentAccount = true; snapshot = empty();
  mobileSnapshot = { operation: SpotifyMobileOperation.Idle, canSubmitGuestCommands: false, session: membership() }; });
afterEach(async () => { if (rendered) await act(async () => rendered.unmount()); });
test(Names.explicit, async () => { await render(); expect(workflow.prepare).not.toHaveBeenCalled(); expect(workflow.enqueue).not.toHaveBeenCalled();
  await country(); await act(async () => button(sourceTitle()).props.onPress()); expect(workflow.prepare).toHaveBeenCalledWith(Fixture.recordingIdentifier, Fixture.market);
  snapshot = matched(); await act(async () => rendered.update(<Screen selection={selection} />));
  expect(workflow.enqueue).not.toHaveBeenCalled(); expect(button(candidateTitle()).props.disabled).toBe(false);
  await act(async () => button(candidateTitle()).props.onPress()); expect(workflow.enqueue).toHaveBeenCalledWith(Fixture.spotifyIdentifier); });
test(Names.country, async () => { snapshot = matched(); await render(); await country(); expect(button(candidateTitle()).props.disabled).toBe(false);
  await country(Fixture.otherMarket); expect(button(candidateTitle()).props.disabled).toBe(true); });
test(Names.unavailable, async () => { snapshot = matched(); snapshot = { ...snapshot, match: { ...snapshot.match!, candidates: snapshot.match!.candidates.map(candidate =>
  ({ ...candidate, evidence: [MatchEvidence.VersionConflict] })) } }; await render(); await country(); expect(button(candidateTitle()).props.disabled).toBe(true); });
test(Names.account, async () => { currentAccount = false; await render(); await country(); expect(button(sourceTitle()).props.disabled).toBe(true); });
test(Names.matching, async () => { snapshot = { ...matched(), status: RecordingQueueStatus.Matching }; await render(); await country();
  expect(button(sourceTitle()).props.disabled).toBe(true); expect(button(candidateTitle()).props.disabled).toBe(true); });
test(Names.notFound, async () => { snapshot = { ...matched(), match: { status: MatchStatus.NotFound, selected: null, candidates: [], failure: null } };
  await render(); expect(button(candidateTitle())).toBeUndefined(); expect(JSON.stringify(rendered.toJSON()).includes(Copy.noMatch)).toBe(true); });
test(Names.receipt, async () => { snapshot = { ...matched(), status: RecordingQueueStatus.Accepted, acceptedSpotifyIdentifier: Fixture.spotifyIdentifier };
  await render(); expect(JSON.stringify(rendered.toJSON()).includes(Copy.accepted)).toBe(true);
  currentAccount = false; await act(async () => rendered.update(<Screen selection={selection} />));
  expect(JSON.stringify(rendered.toJSON()).includes(Copy.accepted)).toBe(false); });

const NavigationImports = Object.freeze({ account: '../src/services/AuthenticationService',
  action: '../src/services/SpotifyJamMenuAction', menu: '../src/constants/navigation', copy: '../src/pages/SpotifyJam/SpotifyJam.copy' });
jest.doMock(NavigationImports.account, () => ({ authenticationSession: { getSnapshot: () => ({ accountIdentifier: Fixture.applicationAccount }) } }));
const NavigationNames = Object.freeze({ action: 'Song context menu opens Jam with copied song metadata and the originating app account',
  registered: 'The shared song context menu includes the Spotify Jam action' });
test(NavigationNames.action, () => { const { spotifyJamMenuAction } = require(NavigationImports.action);
  const { SpotifyJamRoute } = require(NavigationImports.copy); const navigation = { navigate: jest.fn() };
  spotifyJamMenuAction.onClick(navigation, { songs: [{ id: Fixture.recordingIdentifier, title: Fixture.title, artistName: Fixture.author }] });
  expect(navigation.navigate).toHaveBeenCalledWith(SpotifyJamRoute, selection); });
test(NavigationNames.registered, () => { const { spotifyJamMenuAction } = require(NavigationImports.action);
  const { menuOptions } = require(NavigationImports.menu); expect(menuOptions).toContain(spotifyJamMenuAction); });

test(Names.guest, async () => {
  snapshot = matched();
  mobileSnapshot.session = { ...membership(), session: { ...membership().session!, ownedByCurrentAccount: false } };
  await render(); await country();
  expect(button(candidateTitle()).props.disabled).toBe(true);
  mobileSnapshot = { ...mobileSnapshot, canSubmitGuestCommands: true };
  await act(async () => rendered.update(<Screen selection={selection} />));
  expect(button(candidateTitle()).props.disabled).toBe(false);
  mobileSnapshot = { ...mobileSnapshot, session: { ...mobileSnapshot.session, session: { ...mobileSnapshot.session.session!, participants: [] } } };
  await act(async () => rendered.update(<Screen selection={selection} />));
  expect(button(candidateTitle()).props.disabled).toBe(true);
});
