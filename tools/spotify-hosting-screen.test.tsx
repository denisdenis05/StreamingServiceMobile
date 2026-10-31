import { SpotifyHostingQueueIssue } from '../src/services/spotify/SpotifyHostingQueue';
import { SpotifyHostingQueueIssueMessages } from '../src/services/spotify/SpotifyHostingFailureCopy';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import DefaultButton from '../src/components/DefaultButton/DefaultButton.render';
import { SpotifyHostingFailureStage, SpotifyHostingStatus } from '../src/services/spotify/SpotifyHostingStore';
import { SpotifyHostingFailureMessages } from '../src/services/spotify/SpotifyHostingFailureCopy';
import type { SpotifyHostingSnapshot } from '../src/services/spotify/SpotifyHostingStore';
import { SpotifyListeningCountryStore } from '../src/services/spotify/SpotifyListeningCountryStore';
const country = new SpotifyListeningCountryStore({ deviceRegion: () => null, read: async () => null, write: async () => undefined });
const Imports = Object.freeze({ service: '../src/services/SpotifyMobileService', screen: '../src/pages/SpotifyJam/SpotifyHosting.render' });
const Fixture = Object.freeze({ emptyCountry: '', market: 'gb', normalized: 'GB', first: 0, single: 1 });
let snapshot: SpotifyHostingSnapshot;
let connection = { connected: true, session: { session: { ownedByCurrentAccount: true, active: true } } };
const hosting = { getSnapshot: () => snapshot, subscribe: () => () => undefined, start: jest.fn(async () => undefined), stop: jest.fn(async () => undefined) };
const mobile = { getSnapshot: () => connection, subscribe: () => () => undefined };
jest.doMock(Imports.service, () => ({ spotifyListeningCountry: country, spotifyHosting: hosting, spotifyMobile: mobile }));
const { default: SpotifyHosting, SpotifyHostingCopy } = require(Imports.screen);
let rendered: ReactTestRenderer;
function button(title: string) { return rendered.root.findAllByType(DefaultButton).find(candidate => candidate.props.title === title)!; }
async function mount() { await act(async () => { rendered = create(<SpotifyHosting />); }); }
beforeEach(() => { jest.clearAllMocks(); country.set(Fixture.emptyCountry); snapshot = { status: SpotifyHostingStatus.Stopped, failure: null }; connection.session.session.ownedByCurrentAccount = true; });
afterEach(async () => { if (rendered) await act(async () => rendered.unmount()); });
test('Hosting requires an explicit action and a country', async () => {
  await mount(); expect(hosting.start).not.toHaveBeenCalled(); expect(button(SpotifyHostingCopy.start).props.disabled).toBe(true);
  await act(async () => { rendered.root.findAllByType(TextInput)[Fixture.first]!.props.onChangeText(Fixture.market); });
  await act(async () => { button(SpotifyHostingCopy.start).props.onPress(); });
  expect(hosting.start).toHaveBeenCalledWith(Fixture.normalized);
});
test('Guests cannot activate the app as Jam host', async () => {
  connection.session.session.ownedByCurrentAccount = false; await mount();
  await act(async () => { rendered.root.findAllByType(TextInput)[Fixture.first]!.props.onChangeText(Fixture.market); });
  expect(button(SpotifyHostingCopy.start).props.disabled).toBe(true);
});
test('Acknowledged hosting disables another activation and exposes explicit stop', async () => {
  snapshot = { status: SpotifyHostingStatus.Hosting, failure: null }; await mount();
  expect(button(SpotifyHostingCopy.start).props.disabled).toBe(true); expect(button(SpotifyHostingCopy.stop).props.disabled).toBe(false);
  await act(async () => { button(SpotifyHostingCopy.stop).props.onPress(); }); expect(hosting.stop).toHaveBeenCalledTimes(Fixture.single);
});

test('Hosting failures identify the safe matching stage', async () => {
  snapshot = { status: SpotifyHostingStatus.Failed, failure: null, failureStage: SpotifyHostingFailureStage.CatalogMatching };
  await mount(); expect(JSON.stringify(rendered.toJSON())).toContain(SpotifyHostingFailureMessages[SpotifyHostingFailureStage.CatalogMatching]);
});

test.each(Object.values(SpotifyHostingQueueIssue))('Hosting queue issue %s gives a specific correction', async queueIssue => {
  snapshot = { status: SpotifyHostingStatus.Failed, failure: null, queueIssue };
  await mount(); expect(JSON.stringify(rendered.toJSON())).toContain(SpotifyHostingQueueIssueMessages[queueIssue]);
});
