import type { ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { MembershipObservationStatus } from 'streaming-service-spotify-jam';
import type { MembershipObservationSnapshot } from 'streaming-service-spotify-jam';
import DefaultButton from '../src/components/DefaultButton/DefaultButton.render';

const Imports = Object.freeze({ service: '../src/services/SpotifyMobileService', screen: '../src/pages/SpotifyJam/SpotifyJamMembership.render',
  navigation: '@react-navigation/native' });
const Names = Object.freeze({ visible: 'Membership observation follows screen focus and releases on blur',
  refresh: 'Membership refresh is explicit and disabled while refreshing', stale: 'Stale membership is labeled without pretending it is current' });
let snapshot: MembershipObservationSnapshot;
let focused = true;
const cleanup = jest.fn();
const store = { getSnapshot: () => snapshot, subscribe: () => () => undefined, observe: jest.fn(() => cleanup), refresh: jest.fn() };
jest.doMock(Imports.service, () => ({ spotifyMembership: store }));
jest.doMock(Imports.navigation, () => ({ useIsFocused: () => focused }));
const Screen = require(Imports.screen).default;
const Copy = require(Imports.screen).MembershipCopy;
let rendered: ReactTestRenderer;
async function render() { await act(async () => { rendered = create(<Screen />); }); }
beforeEach(() => { jest.clearAllMocks(); focused = true;
  snapshot = { enabled: true, status: MembershipObservationStatus.Idle, observedAtMilliseconds: null, failure: null }; });
afterEach(async () => { if (rendered) await act(async () => rendered.unmount()); });
test(Names.visible, async () => { await render(); expect(store.observe).toHaveBeenCalled(); focused = false;
  await act(async () => rendered.update(<Screen />)); expect(cleanup).toHaveBeenCalled(); });
test(Names.refresh, async () => { await render(); expect(store.refresh).not.toHaveBeenCalled();
  await act(async () => rendered.root.findByType(DefaultButton).props.onPress()); expect(store.refresh).toHaveBeenCalled();
  snapshot = { ...snapshot, status: MembershipObservationStatus.Refreshing }; await act(async () => rendered.update(<Screen />));
  expect(rendered.root.findByType(DefaultButton).props.disabled).toBe(true); });
test(Names.stale, async () => { snapshot = { ...snapshot, status: MembershipObservationStatus.Stale }; await render();
  expect(JSON.stringify(rendered.toJSON()).includes(Copy.stale)).toBe(true); });
