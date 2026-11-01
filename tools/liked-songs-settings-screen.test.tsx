import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import {
  LikedSongsSettingsPolicy,
  LikedSongsSettingsSnapshot,
} from '../src/services/settings/LikedSongsSettingsService';
import { LikedSongsSettingsCopy as copy } from '../src/pages/Settings/LikedSongsSettings.copy';
const ModulePaths = Object.freeze({
  platform: '../src/services/settings/LikedSongsPlatform',
  container: '../src/components/PageContainer',
  screen: '../src/pages/Settings/LikedSongsSettings.render',
});
const Fixture = Object.freeze({
  account: 'first-account',
  otherAccount: 'second-account',
  playlist: 'playlist-identifier',
  otherPlaylist: 'other-playlist-identifier',
  name: 'Evening listening',
  otherName: 'Morning listening',
  count: 12,
  otherCount: 3,
  oneCall: 1,
  noPlaylists: 0,
});
const loaded: LikedSongsSettingsSnapshot = Object.freeze({
  accountIdentifier: Fixture.account,
  loaded: true,
  loading: false,
  saving: false,
  selectedPlaylistIdentifier: Fixture.playlist,
  playlists: [
    {
      identifier: Fixture.playlist,
      name: Fixture.name,
      recordingCount: Fixture.count,
    },
    {
      identifier: Fixture.otherPlaylist,
      name: Fixture.otherName,
      recordingCount: Fixture.otherCount,
    },
  ],
  error: null,
});
let snapshot = loaded;
const listeners = new Set<() => void>();
const likedSongsSettings = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
  refresh: jest.fn(),
  saveSelection: jest.fn(),
};
jest.doMock(ModulePaths.platform, () => ({ likedSongsSettings }));
jest.doMock(ModulePaths.container, () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
const LikedSongsSettings = require(ModulePaths.screen).default;
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
let rendered: ReactTestRenderer;
async function render() {
  await act(async () => {
    rendered = create(<LikedSongsSettings navigation={navigation} />);
  });
}
function button(label: string) {
  return rendered.root
    .findAllByType(TouchableOpacity)
    .find(instance => instance.props.accessibilityLabel === label);
}
function textContent() {
  return rendered.root
    .findAllByType(Text)
    .map(instance => instance.props.children)
    .flat()
    .join();
}
function press(label: string) {
  const selected = button(label);
  expect(selected).toBeDefined();
  act(() => selected!.props.onPress());
}
async function update(next: LikedSongsSettingsSnapshot) {
  await act(async () => {
    snapshot = next;
    listeners.forEach(listener => listener());
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  snapshot = loaded;
});
afterEach(async () => {
  if (rendered) await act(async () => rendered.unmount());
});

test('Liked Songs page loads current choices and explains playlist membership and heart behavior', async () => {
  await render();
  expect(likedSongsSettings.refresh).toHaveBeenCalledTimes(Fixture.oneCall);
  expect(likedSongsSettings.saveSelection).not.toHaveBeenCalled();
  expect(textContent()).toContain(copy.explanation);
  expect(button(Fixture.name)!.props.accessibilityState.checked).toBe(true);
  expect(button(copy.save)!.props.disabled).toBe(true);
  expect(button(Fixture.otherName)!.props.accessibilityRole).toBe('radio');
});

test('Selecting an owned playlist requires Save before persisting and marks the selected radio choice', async () => {
  await render();
  press(Fixture.otherName);
  expect(likedSongsSettings.saveSelection).not.toHaveBeenCalled();
  expect(button(Fixture.otherName)!.props.accessibilityState.checked).toBe(
    true,
  );
  expect(button(Fixture.name)!.props.accessibilityState.checked).toBe(false);
  expect(button(copy.save)!.props.disabled).toBe(false);
  press(copy.save);
  expect(likedSongsSettings.saveSelection).toHaveBeenCalledWith(
    Fixture.otherPlaylist,
  );
});

test('Automatic Liked Songs explains preserving playlists and saves a null assignment', async () => {
  await render();
  press(copy.automatic);
  expect(textContent()).toContain(copy.automaticPreservation);
  press(copy.save);
  expect(likedSongsSettings.saveSelection).toHaveBeenCalledWith(null);
});

test('Saving disables choices and refresh, then successful confirmation resets the draft', async () => {
  await render();
  press(Fixture.otherName);
  await update({ ...loaded, saving: true });
  expect(button(Fixture.name)!.props.disabled).toBe(true);
  expect(button(copy.refresh)!.props.disabled).toBe(true);
  expect(button(copy.saving)!.props.disabled).toBe(true);
  await update({
    ...loaded,
    selectedPlaylistIdentifier: Fixture.otherPlaylist,
  });
  expect(button(Fixture.otherName)!.props.accessibilityState.checked).toBe(
    true,
  );
  expect(button(copy.save)!.props.disabled).toBe(true);
});

test('Save failure preserves the chosen draft for retry and keeps the confirmed current setting visible', async () => {
  await render();
  press(Fixture.otherName);
  await update({ ...loaded, error: LikedSongsSettingsPolicy.saveFailure });
  expect(textContent()).toContain(LikedSongsSettingsPolicy.saveFailure);
  expect(button(Fixture.otherName)!.props.accessibilityState.checked).toBe(
    true,
  );
  expect(button(copy.save)!.props.disabled).toBe(false);
  press(copy.save);
  expect(likedSongsSettings.saveSelection).toHaveBeenCalledWith(
    Fixture.otherPlaylist,
  );
});

test('Account replacement discards the prior account draft and logout removes choices', async () => {
  await render();
  press(Fixture.otherName);
  await update({
    ...loaded,
    accountIdentifier: Fixture.otherAccount,
    selectedPlaylistIdentifier: null,
  });
  expect(button(copy.automatic)!.props.accessibilityState.checked).toBe(true);
  expect(button(copy.save)!.props.disabled).toBe(true);
  await update({
    ...loaded,
    accountIdentifier: null,
    loaded: false,
    playlists: [],
    selectedPlaylistIdentifier: null,
  });
  expect(button(Fixture.otherName)).toBeUndefined();
  expect(button(copy.save)).toBeUndefined();
});

test('Initial load failure shows unavailable status without suggesting automatic mode was confirmed', async () => {
  snapshot = {
    ...loaded,
    loaded: false,
    playlists: [],
    selectedPlaylistIdentifier: null,
    error: LikedSongsSettingsPolicy.loadFailure,
  };
  await render();
  expect(textContent()).toContain(copy.unavailable);
  expect(textContent()).not.toContain(copy.automaticDescription);
  expect(button(copy.save)).toBeUndefined();
  press(copy.refresh);
  expect(likedSongsSettings.refresh).toHaveBeenCalled();
});

test('An empty playlist library explains where to create a playlist and missing assigned choices are explicit', async () => {
  snapshot = { ...loaded, playlists: [] };
  await render();
  expect(textContent()).toContain(copy.noPlaylists);
  expect(textContent()).toContain(copy.selectedUnavailable);
  expect(button(copy.automatic)).toBeDefined();
  expect(snapshot.playlists).toHaveLength(Fixture.noPlaylists);
});

test('Initial loading hides unconfirmed choices and disables refresh until the response arrives', async () => {
  snapshot = {
    ...loaded,
    loaded: false,
    loading: true,
    playlists: [],
    selectedPlaylistIdentifier: null,
  };
  await render();
  expect(textContent()).toContain(copy.loading);
  expect(button(copy.loading)!.props.disabled).toBe(true);
  expect(button(copy.automatic)).toBeUndefined();
  expect(button(copy.save)).toBeUndefined();
});
