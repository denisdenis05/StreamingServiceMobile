import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { IntegrationFailureCode, SharedPlaybackStatus } from 'streaming-service-spotify-jam';
import type { SharedPlaybackSnapshot } from 'streaming-service-spotify-jam';
import DefaultButton from '../src/components/DefaultButton/DefaultButton.render';
import { SpotifyFailureMessages } from '../src/services/spotify/SpotifyMobilePolicy';

const Imports = Object.freeze({ service: '../src/services/SpotifyMobileService', screen: '../src/pages/SpotifyJam/SpotifySharedPlayback.render' });
const Fixture = Object.freeze({ market: 'ro', normalizedMarket: 'RO', host: 'host-device', firstPosition: 0, singleCall: 1,
  names: Object.freeze({ explicit: 'Shared playback waits for an explicit queue replacement action',
    country: 'Starting shared playback uses the chosen country and requires a host',
    stop: 'Following exposes stop and disables another start', pending: 'Native release acknowledgement is shown as pending', failure: 'Shared playback failures remain visible to the user' }) });
let snapshot: SharedPlaybackSnapshot;
let connection = { connected: true, session: { session: { ownedByCurrentAccount: true, active: true, hostDeviceIdentifier: Fixture.host } } };
const follower = { getSnapshot: () => snapshot, subscribe: () => () => undefined, start: jest.fn(async () => undefined), stop: jest.fn(async () => undefined) };
const controller = { getSnapshot: () => connection, subscribe: () => () => undefined };
jest.doMock(Imports.service, () => ({ spotifyPlaybackFollower: follower, spotifyMobile: controller }));
const { default: SpotifySharedPlayback, SharedPlaybackCopy } = require(Imports.screen);
let rendered: ReactTestRenderer;
function button(title: string) { return rendered.root.findAllByType(DefaultButton).find(candidate => candidate.props.title === title)!; }
async function mount() { await act(async () => { rendered = create(<SpotifySharedPlayback />); }); }
beforeEach(() => { jest.clearAllMocks(); connection = { connected: true, session: { session: { ownedByCurrentAccount: true, active: true, hostDeviceIdentifier: Fixture.host } } }; snapshot = { status: SharedPlaybackStatus.Detached, identity: null,
  occurrenceIdentifier: null, recordingIdentifier: null, sequence: null, driftMilliseconds: null, failure: null }; });
afterEach(async () => { if (rendered) await act(async () => { rendered.unmount(); }); });
test(Fixture.names.explicit, async () => { await mount(); expect(follower.start).not.toHaveBeenCalled(); expect(button(SharedPlaybackCopy.start).props.disabled).toBe(true); });
test(Fixture.names.country, async () => { await mount(); await act(async () => { rendered.root.findAllByType(TextInput)[Fixture.firstPosition]!.props.onChangeText(Fixture.market); });
  await act(async () => { button(SharedPlaybackCopy.start).props.onPress(); }); expect(follower.start).toHaveBeenCalledWith(Fixture.normalizedMarket);
  connection = { ...connection, session: { session: { ...connection.session.session, ownedByCurrentAccount: false } } };
  await act(async () => { rendered.update(<SpotifySharedPlayback />); }); expect(button(SharedPlaybackCopy.start).props.disabled).toBe(true); });
test(Fixture.names.stop, async () => { snapshot = { ...snapshot, status: SharedPlaybackStatus.Following }; await mount(); expect(button(SharedPlaybackCopy.start).props.disabled).toBe(true);
  await act(async () => { button(SharedPlaybackCopy.stop).props.onPress(); }); expect(follower.stop).toHaveBeenCalledTimes(Fixture.singleCall); });
test(Fixture.names.failure, async () => { snapshot = { ...snapshot, status: SharedPlaybackStatus.Failed, failure: IntegrationFailureCode.Forbidden }; await mount();
  expect(JSON.stringify(rendered.toJSON())).toContain(SpotifyFailureMessages[IntegrationFailureCode.Forbidden]); });
test(Fixture.names.pending, async () => { snapshot = { ...snapshot, status: SharedPlaybackStatus.Stopping }; await mount(); expect(button(SharedPlaybackCopy.stop).props.disabled).toBe(true);
  expect(button(SharedPlaybackCopy.start).props.disabled).toBe(true); expect(JSON.stringify(rendered.toJSON())).toContain(SharedPlaybackCopy.stopping); });
