import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Alert, Switch, TextInput, TouchableOpacity } from 'react-native';
import { RepeatMode } from 'streaming-service-player';
import { LastFmOperation } from '../src/services/settings/LastFmController';
import { SettingsRoutes } from '../src/pages/Settings/Settings.routes';
import {
  SettingsIcon,
  SettingsSymbol,
} from '../src/pages/Settings/Settings.icons';
import { settingsStyles } from '../src/pages/Settings/Settings.style';
import { SettingsCopy as copy } from '../src/pages/Settings/Settings.copy';
const Modules = Object.freeze({
  services: '../src/services/settings/SettingsServices',
  runtime: '../src/services/settings/SettingsRuntime',
  auth: '../src/hooks/AuthContext',
  container: '../src/components/PageContainer',
  navbar: '../src/components/Navbar',
  profile: '../src/pages/Profile/Profile.render',
  settings: '../src/pages/Settings/Settings.render',
  account: '../src/pages/Settings/AccountSettings.render',
  playback: '../src/pages/Settings/PlaybackSettings.render',
  storage: '../src/pages/Settings/StorageSettings.render',
  lastFm: '../src/pages/Settings/LastFmSettings.render',
});
const Fixture = Object.freeze({
  account: 'account-identifier',
  name: 'Device listener',
  changedName: 'Changed listener',
  confirmPosition: 1,
  buttonsArgument: 2,
  firstCall: 0,
  oneCall: 1,
  cacheBytes: 1048576,
});
const profileSnapshot = {
  accountIdentifier: Fixture.account,
  displayName: Fixture.name,
  loading: false,
  saving: false,
  error: null,
};
const playbackSnapshot = {
  ready: true,
  busy: false,
  shuffled: false,
  repeatMode: RepeatMode.Off,
  externallyControlled: false,
  error: null,
};
const storageSnapshot = {
  loading: false,
  clearing: false,
  imageCacheBytes: Fixture.cacheBytes,
  audioCacheBytes: Fixture.cacheBytes,
  availableBytes: Fixture.cacheBytes,
  error: null,
};
const lastFmSnapshot = {
  connected: false,
  username: null,
  connectedAt: null,
  operation: LastFmOperation.Idle,
  failure: null,
};
const subscription = () => () => undefined;
const profilePreferences = {
  subscribe: subscription,
  getSnapshot: () => profileSnapshot,
  restore: jest.fn(),
  saveDisplayName: jest.fn(),
};
const playbackSettings = {
  subscribe: subscription,
  getSnapshot: () => playbackSnapshot,
  refresh: jest.fn(),
  setShuffle: jest.fn(),
  setRepeat: jest.fn(),
};
const storageSettings = {
  subscribe: subscription,
  getSnapshot: () => storageSnapshot,
  refresh: jest.fn(),
  clearImageCache: jest.fn(),
};
const lastFmSettings = {
  subscribe: subscription,
  getSnapshot: () => lastFmSnapshot,
  authorize: jest.fn(),
  cancel: jest.fn(),
  disconnect: jest.fn(),
  refresh: jest.fn(),
};
const spotifySnapshot = { connected: false };
const spotifyMobile = {
  subscribe: subscription,
  getSnapshot: () => spotifySnapshot,
};
const SpotifyServiceModule = '../src/services/SpotifyMobileService';
jest.doMock(SpotifyServiceModule, () => ({ spotifyMobile }));
const logout = jest.fn();
jest.doMock(
  Modules.services,
  () => ({ profilePreferences, playbackSettings, storageSettings }),
  { virtual: true },
);
jest.doMock(Modules.runtime, () => ({ lastFmSettings }));
jest.doMock(Modules.auth, () => ({ useAuth: () => ({ logout }) }));
jest.doMock(Modules.container, () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.doMock(Modules.navbar, () => ({ __esModule: true, default: () => null }));
const Profile = require(Modules.profile).default;
const Settings = require(Modules.settings).default;
const AccountSettings = require(Modules.account).default;
const PlaybackSettings = require(Modules.playback).default;
const StorageSettings = require(Modules.storage).default;
const LastFmSettings = require(Modules.lastFm).default;
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
let rendered: ReactTestRenderer;
async function render(component: React.ReactElement) {
  await act(async () => {
    rendered = create(component);
  });
}
function press(label: string) {
  const button = rendered.root
    .findAllByType(TouchableOpacity)
    .find(instance => instance.props.accessibilityLabel === label);
  expect(button).toBeDefined();
  act(() => button!.props.onPress());
}
beforeEach(() => {
  jest.clearAllMocks();
  spotifySnapshot.connected = false;
  playbackSnapshot.externallyControlled = false;
  profileSnapshot.loading = false;
});
afterEach(async () => {
  if (rendered) await act(async () => rendered.unmount());
  jest.restoreAllMocks();
});
test('Profile opens Settings, account editor, real library and playlist creation', async () => {
  await render(
    <Profile navigation={navigation} route={{ name: copy.profile }} />,
  );
  press(copy.title);
  expect(navigation.navigate).toHaveBeenLastCalledWith(SettingsRoutes.main);
  press(copy.edit);
  expect(navigation.navigate).toHaveBeenLastCalledWith(SettingsRoutes.account);
  press(copy.collection);
  expect(navigation.navigate).toHaveBeenLastCalledWith(SettingsRoutes.library);
  press(copy.create);
  expect(navigation.navigate).toHaveBeenLastCalledWith('CreatePlaylist');
});
test('Settings rows navigate to registered destinations and back returns to Profile', async () => {
  await render(<Settings navigation={navigation} />);
  for (const destination of [
    { label: copy.account, route: SettingsRoutes.account },
    { label: copy.lastFm, route: SettingsRoutes.lastFm },
    { label: copy.playback, route: SettingsRoutes.playback },
    { label: copy.storage, route: SettingsRoutes.storage },
    { label: copy.about, route: SettingsRoutes.about },
  ]) {
    press(destination.label);
    expect(navigation.navigate).toHaveBeenLastCalledWith(destination.route);
  }
  press(copy.spotify);
  expect(navigation.navigate).toHaveBeenLastCalledWith('SpotifyJam');
  press('Back');
  expect(navigation.goBack).toHaveBeenCalledTimes(Fixture.oneCall);
});
test('Sign out requires explicit confirmation', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await render(<Settings navigation={navigation} />);
  press(copy.signOut);
  expect(logout).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[Fixture.firstCall][Fixture.buttonsArgument]!;
  await act(async () => {
    buttons[Fixture.confirmPosition].onPress!();
  });
  expect(logout).toHaveBeenCalledTimes(Fixture.oneCall);
});
test('Account editor saves the entered local display name', async () => {
  await render(<AccountSettings navigation={navigation} />);
  const input = rendered.root.findByType(TextInput);
  act(() => input.props.onChangeText(Fixture.changedName));
  press('Save profile');
  expect(profilePreferences.saveDisplayName).toHaveBeenCalledWith(
    Fixture.changedName,
  );
});
test('Playback dispatches real shuffle and repeat controls and disables shared playback changes', async () => {
  await render(<PlaybackSettings navigation={navigation} />);
  act(() => rendered.root.findByType(Switch).props.onValueChange(true));
  expect(playbackSettings.setShuffle).toHaveBeenCalledWith(true);
  press('One track');
  expect(playbackSettings.setRepeat).toHaveBeenCalledWith(RepeatMode.One);
  playbackSnapshot.externallyControlled = true;
  await act(async () => {
    rendered.update(<PlaybackSettings navigation={navigation} />);
  });
  expect(rendered.root.findByType(Switch).props.disabled).toBe(true);
});
test('Storage removal is explicit and only removes artwork cache after confirmation', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await render(<StorageSettings navigation={navigation} />);
  press('Clear artwork cache');
  expect(storageSettings.clearImageCache).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[Fixture.firstCall][Fixture.buttonsArgument]!;
  act(() => buttons[Fixture.confirmPosition].onPress!());
  expect(storageSettings.clearImageCache).toHaveBeenCalledTimes(
    Fixture.oneCall,
  );
});
test('Last.fm authorization starts only on an explicit connect press', async () => {
  await render(<LastFmSettings navigation={navigation} />);
  expect(lastFmSettings.authorize).not.toHaveBeenCalled();
  press(copy.connect);
  expect(lastFmSettings.authorize).toHaveBeenCalledTimes(Fixture.oneCall);
});

test('Settings shows live Spotify connection status and uses vector icons with accessible back targets', async () => {
  spotifySnapshot.connected = true;
  await render(<Settings navigation={navigation} />);
  expect(
    rendered.root
      .findAllByType(SettingsIcon)
      .some(instance => instance.props.symbol === SettingsSymbol.Spotify),
  ).toBe(true);
  const back = rendered.root
    .findAllByType(TouchableOpacity)
    .find(instance => instance.props.accessibilityLabel === 'Back')!;
  expect(back.props.style).toBe(settingsStyles.iconButton);
  const signOut = rendered.root
    .findAllByType(TouchableOpacity)
    .find(instance => instance.props.accessibilityLabel === copy.signOut)!;
  expect(signOut.props.style).toBe(settingsStyles.signOut);
  const connectedStatus = rendered.root.findAll(
    instance => instance.props.status === copy.connected,
  );
  expect(connectedStatus.length).toBeGreaterThan(Fixture.firstCall);
});
