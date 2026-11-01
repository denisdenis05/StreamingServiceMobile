import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import {
  LastFmOperation,
  LastFmPolicy,
  LastFmSnapshot,
} from '../src/services/settings/LastFmController';
import { SettingsCopy } from '../src/pages/Settings/Settings.copy';
import { LastFmSettingsCopy } from '../src/pages/Settings/LastFmSettings.copy';

const ModulePaths = Object.freeze({
  runtime: '../src/services/settings/SettingsRuntime',
  container: '../src/components/PageContainer',
  screen: '../src/pages/Settings/LastFmSettings.render',
});
const Fixture = Object.freeze({
  username: 'connected-listener',
  connectedAt: '2026-11-01T10:00:00Z',
  invalidDate: 'invalid-connection-date',
  invalidDateDisplay: 'Invalid Date',
  firstPosition: 0,
  confirmationPosition: 1,
  buttonsArgument: 2,
  oneCall: 1,
});
const disconnected: LastFmSnapshot = Object.freeze({
  connected: false,
  connectedAt: null,
  username: null,
  operation: LastFmOperation.Idle,
  failure: null,
  authorizationPending: false,
});
let snapshot: LastFmSnapshot = disconnected;
const lastFmSettings = {
  subscribe: () => () => undefined,
  getSnapshot: () => snapshot,
  refresh: jest.fn(),
  authorize: jest.fn(),
  cancel: jest.fn(),
  disconnect: jest.fn(),
};
jest.doMock(ModulePaths.runtime, () => ({ lastFmSettings }));
jest.doMock(ModulePaths.container, () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
const LastFmSettings = require(ModulePaths.screen).default;
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
let rendered: ReactTestRenderer;
async function render() {
  await act(async () => {
    rendered = create(<LastFmSettings navigation={navigation} />);
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
beforeEach(() => {
  jest.clearAllMocks();
  snapshot = disconnected;
});
afterEach(async () => {
  if (rendered) await act(async () => rendered.unmount());
  jest.restoreAllMocks();
});

test('Opening Last.fm settings checks status and explains approval and separate history', async () => {
  await render();
  expect(lastFmSettings.refresh).toHaveBeenCalledTimes(Fixture.oneCall);
  expect(lastFmSettings.authorize).not.toHaveBeenCalled();
  expect(textContent()).toContain(LastFmSettingsCopy.disconnectedDescription);
  expect(textContent()).toContain(LastFmSettingsCopy.historyDescription);
  press(SettingsCopy.connect);
  expect(lastFmSettings.authorize).toHaveBeenCalledTimes(Fixture.oneCall);
});

test('Pending browser approval provides check and cancel actions without another connect button', async () => {
  snapshot = {
    ...disconnected,
    operation: LastFmOperation.Authorizing,
    authorizationPending: true,
  };
  await render();
  expect(textContent()).toContain(LastFmSettingsCopy.authorizingDescription);
  expect(button(SettingsCopy.connect)).toBeUndefined();
  press(LastFmSettingsCopy.refreshApproval);
  press(SettingsCopy.cancelAuthorization);
  expect(lastFmSettings.refresh).toHaveBeenCalled();
  expect(lastFmSettings.cancel).toHaveBeenCalledTimes(Fixture.oneCall);
});

test.each([
  [LastFmOperation.Opening, LastFmSettingsCopy.opening],
  [LastFmOperation.Connecting, LastFmSettingsCopy.connecting],
  [LastFmOperation.Disconnecting, LastFmSettingsCopy.disconnecting],
  [LastFmOperation.Loading, LastFmSettingsCopy.checking],
])(
  'Busy Last.fm operation %s explains its current action and disables refresh',
  async (operation, title) => {
    snapshot = { ...disconnected, operation };
    await render();
    expect(textContent()).toContain(title);
    expect(button(SettingsCopy.connect)).toBeUndefined();
    const refreshTitle =
      operation === LastFmOperation.Loading
        ? LastFmSettingsCopy.checking
        : SettingsCopy.refresh;
    expect(button(refreshTitle)!.props.disabled).toBe(true);
  },
);

test('Approval status checks keep cancellation available while a request is pending', async () => {
  snapshot = {
    ...disconnected,
    operation: LastFmOperation.Loading,
    authorizationPending: true,
  };
  await render();
  press(SettingsCopy.cancelAuthorization);
  expect(lastFmSettings.cancel).toHaveBeenCalledTimes(Fixture.oneCall);
});

test('Connected Last.fm shows the account and requires confirmation before disconnecting', async () => {
  snapshot = {
    ...disconnected,
    connected: true,
    username: Fixture.username,
    connectedAt: Fixture.connectedAt,
  };
  const alert = jest.spyOn(Alert, 'alert');
  await render();
  expect(textContent()).toContain(Fixture.username);
  expect(textContent()).toContain(LastFmSettingsCopy.connectedDescription);
  press(SettingsCopy.disconnect);
  expect(lastFmSettings.disconnect).not.toHaveBeenCalled();
  const confirmation = alert.mock.calls[Fixture.firstPosition];
  expect(confirmation[Fixture.confirmationPosition]).toBe(
    LastFmSettingsCopy.disconnectDescription,
  );
  const buttons = confirmation[Fixture.buttonsArgument]!;
  act(() => buttons[Fixture.confirmationPosition].onPress!());
  expect(lastFmSettings.disconnect).toHaveBeenCalledTimes(Fixture.oneCall);
});

test('Malformed connection dates are omitted and safe failures remain visible with retry actions', async () => {
  snapshot = {
    ...disconnected,
    connected: true,
    connectedAt: Fixture.invalidDate,
    failure: LastFmPolicy.disconnectFailure,
  };
  await render();
  expect(textContent()).not.toContain(Fixture.invalidDateDisplay);
  expect(textContent()).toContain(LastFmPolicy.disconnectFailure);
  expect(button(SettingsCopy.disconnect)).toBeDefined();
  expect(button(SettingsCopy.refresh)).toBeDefined();
});
