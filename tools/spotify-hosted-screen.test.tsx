import type { ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { HostedQueueStatus, HostedQueueItemKind } from 'streaming-service-spotify-jam';
import type { HostedQueueSnapshot } from 'streaming-service-spotify-jam';
import DefaultButton from '../src/components/DefaultButton/DefaultButton.render';

const Imports = Object.freeze({ service: '../src/services/SpotifyMobileService', screen: '../src/pages/SpotifyJam/SpotifyHostedQueue.render',
  navigation: '@react-navigation/native' });
const Fixture = Object.freeze({ title: 'Song', author: 'Artist', uri: 'spotify:track:0123456789abcdefghijkl',
  durationMilliseconds: 200000, observedAtMilliseconds: 1000, host: 'spotify-host', session: 'jam', expectedRepeatedItems: 2 });
const Names = Object.freeze({ visible: 'Focused queue screens observe and release when blurred',
  refresh: 'Queue refresh requires an explicit press while not loading',
  duplicates: 'Queue view preserves duplicate tracks and their positions',
  stale: 'Stale queue data is labeled instead of presented as current',
  disabled: 'Unconfigured queue observation disables refresh' });
let snapshot: HostedQueueSnapshot;
let focused = true;
const cleanup = jest.fn();
const store = { getSnapshot: () => snapshot, subscribe: () => () => undefined, observe: jest.fn(() => cleanup), refresh: jest.fn() };
jest.doMock(Imports.service, () => ({ spotifyHostedQueue: store }));
jest.doMock(Imports.navigation, () => ({ useIsFocused: () => focused }));
const Screen = require(Imports.screen).default;
const Copy = require(Imports.screen).HostedQueueCopy;
let rendered: ReactTestRenderer;
function empty(): HostedQueueSnapshot { return { enabled: true, status: HostedQueueStatus.Idle, sessionIdentifier: Fixture.session,
  hostDeviceIdentifier: Fixture.host, currentlyPlaying: null, entries: [], observedAtMilliseconds: null, failure: null }; }
async function render() { await act(async () => { rendered = create(<Screen />); }); }
function refresh() { return rendered.root.findByType(DefaultButton); }
beforeEach(() => { jest.clearAllMocks(); focused = true; snapshot = empty(); });
afterEach(async () => { if (rendered) await act(async () => rendered.unmount()); });
test(Names.visible, async () => { await render(); expect(store.observe).toHaveBeenCalled(); focused = false;
  await act(async () => rendered.update(<Screen />)); expect(cleanup).toHaveBeenCalled(); });
test(Names.refresh, async () => { await render(); expect(store.refresh).not.toHaveBeenCalled();
  await act(async () => refresh().props.onPress()); expect(store.refresh).toHaveBeenCalled();
  snapshot = { ...snapshot, status: HostedQueueStatus.Loading }; await act(async () => rendered.update(<Screen />)); expect(refresh().props.disabled).toBe(true); });
test(Names.duplicates, async () => { const entry = { uri: Fixture.uri, title: Fixture.title, author: Fixture.author,
  durationMilliseconds: Fixture.durationMilliseconds, kind: HostedQueueItemKind.Track };
  snapshot = { ...empty(), status: HostedQueueStatus.Ready, entries: [entry, entry], observedAtMilliseconds: Fixture.observedAtMilliseconds }; await render();
  const renderedText = JSON.stringify(rendered.toJSON()); const occurrences = renderedText.split(Fixture.title + Copy.separator + Fixture.author).length - ExpectedInitialSegment;
  expect(occurrences).toBe(Fixture.expectedRepeatedItems); });
const ExpectedInitialSegment = 1;
test(Names.stale, async () => { snapshot = { ...empty(), status: HostedQueueStatus.Stale }; await render();
  expect(JSON.stringify(rendered.toJSON()).includes(Copy.stale)).toBe(true); });
test(Names.disabled, async () => { snapshot = { ...empty(), enabled: false }; await render(); expect(refresh().props.disabled).toBe(true); });
