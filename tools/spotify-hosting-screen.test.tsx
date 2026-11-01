import { SpotifyHostingQueueIssue } from '../src/services/spotify/SpotifyHostingQueue';
import { SpotifyHostingQueueIssueMessages } from '../src/services/spotify/SpotifyHostingFailureCopy';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import DefaultButton from '../src/components/DefaultButton/DefaultButton.render';
import { SpotifyHostingFailureStage, SpotifyHostingStatus } from '../src/services/spotify/SpotifyHostingStore';
import { SpotifyPlayerJamMode } from '../src/services/spotify/SpotifyPlayerJamController';
import { SpotifyHostingFailureMessages } from '../src/services/spotify/SpotifyHostingFailureCopy';
import type { SpotifyHostingSnapshot } from '../src/services/spotify/SpotifyHostingStore';
import { SpotifyListeningCountryStore } from '../src/services/spotify/SpotifyListeningCountryStore';
const country = new SpotifyListeningCountryStore({ deviceRegion: () => null, read: async () => null, write: async () => undefined });
const Imports = Object.freeze({ service: '../src/services/SpotifyMobileService', player: '../src/services/PlayerJamRuntime', screen: '../src/pages/SpotifyJam/SpotifyHosting.render' });
const Fixture = Object.freeze({ emptyCountry: '', market: 'gb', normalized: 'GB', first: 0, single: 1 });
let snapshot: SpotifyHostingSnapshot;
let sharing = { canHost: true, owned: true, mode: SpotifyPlayerJamMode.Available };
const hosting = { getSnapshot: () => snapshot, subscribe: () => () => undefined, start: jest.fn<Promise<void>, [string]>(async () => undefined), stop: jest.fn(async () => undefined) };
const player = { getSnapshot: () => sharing, subscribe: () => () => undefined,
  startHosting: jest.fn(async () => { await hosting.start(country.getSnapshot()); }) };
jest.doMock(Imports.service, () => ({ spotifyListeningCountry: country, spotifyHosting: hosting }));
jest.doMock(Imports.player, () => ({ playerJam: player }));
const { default: SpotifyHosting, SpotifyHostingCopy } = require(Imports.screen);
let rendered: ReactTestRenderer;
function button(title: string) { return rendered.root.findAllByType(DefaultButton).find(candidate => candidate.props.title === title)!; }
async function mount() { await act(async () => { rendered = create(<SpotifyHosting />); }); }
beforeEach(() => { jest.clearAllMocks(); country.set(Fixture.emptyCountry); snapshot = { status: SpotifyHostingStatus.Stopped, failure: null };
  sharing = { canHost: true, owned: true, mode: SpotifyPlayerJamMode.Available }; });
afterEach(async () => { if (rendered) await act(async () => rendered.unmount()); });
test('Hosting requires an explicit action and a country', async () => {
  await mount(); expect(hosting.start).not.toHaveBeenCalled(); expect(button(SpotifyHostingCopy.start).props.disabled).toBe(true);
  await act(async () => { rendered.root.findAllByType(TextInput)[Fixture.first]!.props.onChangeText(Fixture.market); });
  await act(async () => { button(SpotifyHostingCopy.start).props.onPress(); });
  expect(hosting.start).toHaveBeenCalledWith(Fixture.normalized);
});
test('Guests cannot activate the app as Jam host', async () => {
  sharing = { ...sharing, canHost: false, owned: false }; await mount();
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
test('Owner following cannot host the mirrored queue and is directed to select app music instead', async () => {
  country.set(Fixture.normalized); sharing = { canHost: false, owned: true, mode: SpotifyPlayerJamMode.Following };
  await mount();
  expect(button(SpotifyHostingCopy.start).props.disabled).toBe(true);
  expect(JSON.stringify(rendered.toJSON())).toContain(SpotifyHostingCopy.ownerSelection);
  expect(player.startHosting).not.toHaveBeenCalled(); expect(hosting.start).not.toHaveBeenCalled();
});
test('Available queue hosting dispatches through the guarded player controller', async () => {
  country.set(Fixture.normalized); await mount();
  await act(async () => button(SpotifyHostingCopy.start).props.onPress());
  expect(player.startHosting).toHaveBeenCalledTimes(Fixture.single);
});
