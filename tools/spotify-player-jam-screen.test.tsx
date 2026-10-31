import { SpotifyHostingQueueIssue } from '../src/services/spotify/SpotifyHostingQueue';
import { SpotifyHostingQueueIssueMessages } from '../src/services/spotify/SpotifyHostingFailureCopy';
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SpotifyPlayerJamMode } from '../src/services/spotify/SpotifyPlayerJamController';
import type { SpotifyPlayerJamSnapshot } from '../src/services/spotify/SpotifyPlayerJamController';
import { SpotifyUpcomingQueueCopy } from '../src/services/spotify/SpotifyUpcomingQueueCopy';
import { IntegrationFailureCode } from 'streaming-service-spotify-jam';
const Imports = Object.freeze({ service: '../src/services/PlayerJamRuntime', screen: '../src/pages/Playing/SpotifyPlayerJam.render' });
const Fixture = Object.freeze({ market: 'RO', emptyMarket: '', first: 0, single: 1, updatedMarket: 'GB' });
let snapshot: SpotifyPlayerJamSnapshot;
const store = { subscribe: () => () => undefined, getSnapshot: () => snapshot, setMarket: jest.fn(), startSharing: jest.fn(async () => undefined),
  joinAndListen: jest.fn(async () => undefined), startFollowing: jest.fn(async () => undefined), stop: jest.fn(async () => undefined) };
jest.doMock(Imports.service, () => ({ playerJam: store }));
const { default: SpotifyPlayerJam, PlayerJamCopy } = require(Imports.screen);
let rendered: ReactTestRenderer; const navigation = { navigate: jest.fn() };
function press(label: string) { return rendered.root.findAllByType(Pressable).find(button => button.props.accessibilityLabel === label)!; }
async function mount(open = true) { await act(async () => { rendered = create(<SpotifyPlayerJam navigation={navigation} />); }); if (open) await act(async () => press(PlayerJamCopy.manage).props.onPress()); }
beforeEach(() => { jest.clearAllMocks(); snapshot = { mode: SpotifyPlayerJamMode.Available, connected: true, owned: true, canHost: true, canCreate: false, canJoin: false,
  canFollow: true, remoteControlsAvailable: true, pending: false, market: Fixture.market, failure: null }; });
afterEach(async () => { if (rendered) await act(async () => rendered.unmount()); });
test('Player Jam opens an explicit sheet without activating hosting on mount', async () => {
  await mount(false); expect(store.startSharing).not.toHaveBeenCalled(); expect(rendered.root.findByType(Modal).props.visible).toBe(false);
  await act(async () => press(PlayerJamCopy.manage).props.onPress()); expect(rendered.root.findByType(Modal).props.visible).toBe(true);
  await act(async () => press(PlayerJamCopy.host).props.onPress()); expect(store.startSharing).toHaveBeenCalledTimes(Fixture.single);
});
test('Player hosting requires a country and guest accounts receive no hosting button', async () => {
  snapshot = { ...snapshot, market: Fixture.emptyMarket }; await mount(); expect(press(PlayerJamCopy.host).props.disabled).toBe(true);
  await act(async () => rendered.root.findByType(TextInput).props.onChangeText(Fixture.updatedMarket)); expect(store.setMarket).toHaveBeenCalledWith(Fixture.updatedMarket);
  snapshot = { ...snapshot, canHost: false, owned: false, mode: SpotifyPlayerJamMode.Following };
  await act(async () => rendered.update(<SpotifyPlayerJam navigation={navigation} />));
  expect(press(PlayerJamCopy.host)).toBeUndefined();
  expect(rendered.root.findAllByType(Text).some(text => text.props.children === PlayerJamCopy.guestSelection)).toBe(true);
});
test('Host and follow actions do not end remote membership and closing retains native ownership', async () => {
  snapshot = { ...snapshot, mode: SpotifyPlayerJamMode.Hosting }; await mount();
  await act(async () => press(PlayerJamCopy.stop).props.onPress()); expect(store.stop).toHaveBeenCalledTimes(Fixture.single);
  await act(async () => press(PlayerJamCopy.close).props.onPress()); expect(store.stop).toHaveBeenCalledTimes(Fixture.single);
  expect(rendered.root.findByType(Modal).props.visible).toBe(false);
});
test('Player invitation and QR destination uses the existing Jam route', async () => {
  await mount(); await act(async () => press(PlayerJamCopy.details).props.onPress()); expect(navigation.navigate).toHaveBeenCalledWith('SpotifyJam');
});
test('Pending sharing prevents duplicate actions and safe failures remain visible', async () => {
  snapshot = { ...snapshot, pending: true, failure: IntegrationFailureCode.UnknownOutcome }; await mount();
  expect(press(PlayerJamCopy.host).props.disabled).toBe(true);
  expect(rendered.root.findAllByType(Text).some(text => text.props.accessibilityRole === 'alert')).toBe(true);
});
test('Stop remains available while a hosted song is matching', async () => {
  snapshot = { ...snapshot, mode: SpotifyPlayerJamMode.Hosting, pending: true }; await mount();
  expect(press(PlayerJamCopy.stop).props.disabled).toBe(false);
  await act(async () => press(PlayerJamCopy.stop).props.onPress()); expect(store.stop).toHaveBeenCalledTimes(Fixture.single);
});

test('A connected account without a Jam can explicitly start sharing or join with an invitation', async () => {
  snapshot = { ...snapshot, connected: false, canHost: false, canCreate: true, canJoin: true };
  await mount(); expect(press(PlayerJamCopy.host).props.disabled).toBe(false);
  expect(press(PlayerJamCopy.join).props.disabled).toBe(true);
  const invitation = PlayerJamCopy.invitation;
  await act(async () => rendered.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === PlayerJamCopy.invitation)!.props.onChangeText(invitation));
  await act(async () => press(PlayerJamCopy.join).props.onPress());
  expect(store.joinAndListen).toHaveBeenCalledWith(invitation);
});

test('Player sheet shows upcoming matching without replacing the current following status', async () => {
  snapshot = { ...snapshot, mode: SpotifyPlayerJamMode.Following, upcomingQueuePending: true,
    upcomingQueueFailure: null, unavailableUpcomingCount: Fixture.first };
  await mount(); const presentation = JSON.stringify(rendered.toJSON());
  expect(presentation).toContain(PlayerJamCopy.following); expect(presentation).toContain(SpotifyUpcomingQueueCopy.pending);
  expect(press(PlayerJamCopy.stop).props.disabled).toBe(false);
});
test('Player sheet reports a partial future queue without an active playback failure', async () => {
  snapshot = { ...snapshot, mode: SpotifyPlayerJamMode.Following, upcomingQueuePending: false,
    upcomingQueueFailure: IntegrationFailureCode.NotFound, unavailableUpcomingCount: Fixture.single };
  await mount(); const presentation = JSON.stringify(rendered.toJSON());
  expect(presentation).toContain(SpotifyUpcomingQueueCopy.unavailable); expect(presentation).toContain(PlayerJamCopy.following);
  expect(rendered.root.findAllByType(Text).some(text => text.props.accessibilityRole === 'alert')).toBe(false);
});

test.each(Object.values(SpotifyHostingQueueIssue))('Player queue issue %s gives a specific correction', async queueIssue => {
  snapshot = { ...snapshot, mode: SpotifyPlayerJamMode.Failed, failure: IntegrationFailureCode.Unsupported, queueIssue };
  await mount(); expect(JSON.stringify(rendered.toJSON())).toContain(SpotifyHostingQueueIssueMessages[queueIssue]);
});

const SheetLayout = Object.freeze({ maximumHeight: '90%', keyboardTaps: 'handled', keyboardDismissal: 'on-drag' });
test('Player Jam controls scroll inside a bounded sheet while the close action stays outside scrolling content', async () => {
  snapshot = { ...snapshot, mode: SpotifyPlayerJamMode.Following, upcomingQueuePending: true };
  await mount();
  const scroll = rendered.root.findByType(ScrollView);
  expect(scroll.props.keyboardShouldPersistTaps).toBe(SheetLayout.keyboardTaps);
  expect(scroll.props.keyboardDismissMode).toBe(SheetLayout.keyboardDismissal);
  expect(scroll.findAllByType(Pressable)).toContain(press(PlayerJamCopy.stop));
  expect(scroll.findAllByType(Pressable)).toContain(press(PlayerJamCopy.details));
  expect(scroll.findAllByType(Pressable)).not.toContain(press(PlayerJamCopy.close));
  expect(StyleSheet.flatten(scroll.parent!.props.style).maxHeight).toBe(SheetLayout.maximumHeight);
});
