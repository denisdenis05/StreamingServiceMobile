import { SpotifyHostingQueueIssue } from '../src/services/spotify/SpotifyHostingQueue';
import { SpotifyHostingQueueIssueMessages } from '../src/services/spotify/SpotifyHostingFailureCopy';
import type { ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Alert, Share, TextInput } from 'react-native';
import {
  IntegrationFailureCode,
  JamConnectionStatus,
  JamJoinMode,
  SpotifyLoginMethod,
  SpotifyLoginStage,
} from 'streaming-service-spotify-jam';
import {
  SpotifyAuthenticationAction,
  SpotifyMobileOperation,
} from '../src/services/spotify/SpotifyMobileController';
import type { SpotifyMobileSnapshot } from '../src/services/spotify/SpotifyMobileController';
import {
  SpotifyJamCopy,
  SpotifyJamRoute,
} from '../src/pages/SpotifyJam/SpotifyJam.copy';
import {
  SpotifyFailureMessages,
  SpotifyMobilePolicy,
} from '../src/services/spotify/SpotifyMobilePolicy';
import { SpotifyAuthorizationReturnStatus } from '../src/services/spotify/SpotifyLoginBrowser';
import { SpotifyPlayerJamMode } from '../src/services/spotify/SpotifyPlayerJamController';
import { SpotifyHostingFailureStage } from '../src/services/spotify/SpotifyHostingStore';
import { SpotifyHostingFailureMessages, SpotifyHostingFailureDetailMessages } from '../src/services/spotify/SpotifyHostingFailureCopy';
import { SpotifyConnectStatus } from '../src/services/spotify/SpotifyConnectStore';
import { SettingsRoutes } from '../src/pages/Settings/Settings.routes';
import { SpotifySettingsCopy } from '../src/pages/Settings/SpotifySettings.copy';
import DefaultButton from '../src/components/DefaultButton/DefaultButton.render';

const Imports = Object.freeze({
  settingsComponents: '../src/pages/Settings/Settings.components',
  settingsScreen: '../src/pages/Settings/SpotifySettings.render',
  player: '../src/services/PlayerJamRuntime',
  service: '../src/services/SpotifyMobileService',
  screen: '../src/pages/SpotifyJam/SpotifyJam.render',
  membership: '../src/pages/SpotifyJam/SpotifyJamMembership.render',
  hostedQueue: '../src/pages/SpotifyJam/SpotifyHostedQueue.render',
  container: '../src/components/PageContainer',
});
const Methods = Object.freeze({ alert: 'alert', share: 'share' } as const);
const Fixture = Object.freeze({
  spotifyAccount: 'spotify-account',
  displayName: 'Listener',
  deviceIdentifier: 'device',
  deviceName: 'Phone',
  sessionIdentifier: 'session',
  otherSessionIdentifier: 'replacement-session',
  token: 'temporary-test-token',
  clientIdentifier: '0123456789abcdef0123456789abcdef',
  trackIdentifier: '0123456789abcdefghijkl',
  invitation: 'spotify:socialsession:invitation-test',
  firstPosition: 0,
  confirmationPosition: 1,
  alertButtonsArgumentIndex: 2,
  singleInvocationCount: 1,
});
const Names = Object.freeze({
  catalogRejection: 'Jam membership catalog rejection in %s does not ask users to change developer settings',
  matchingFailure:
    'Created membership retains visible matching failure when shared hosting fails',
  membershipPreparing:
    'Joining membership keeps playback preparation visible while following starts',
  connect:
    'Login opens only on a press and supplies the public client identifier and callback',
  nativeWaiting:
    'Native connection readiness is separate from login and blocks joining until registered',
  nativeReady:
    'Registered native connection allows control joining while remote playback stays unavailable',
  create: 'Connected screen creates a Jam only when requested',
  join: 'Join sends the invitation in the selected membership mode',
  host: 'Host end requires the shared-session confirmation',
  guest: 'Guest sees leave instead of end',
  changedConfirmation:
    'End confirmation cannot end a Jam that replaced the displayed session',
  pending: 'Pending operations disable create and join',
  uncertain:
    'Uncertain outcomes keep passive refresh available and disable changes',
  share:
    'Share passes the invitation only to the explicit platform share action',
  disconnect:
    'Disconnect clears local invitation input and retires the connection',
  navigation: 'Back and device reload controls call their application actions',
});

let snapshot: SpotifyMobileSnapshot;
const controller = {
  getSnapshot: () => snapshot,
  subscribe: () => () => undefined,
  connect: jest.fn(),
  login: jest.fn(),
  loginWithLibrespot: jest.fn(),
  loginWithDeviceAuthorization: jest.fn(),
  openDeviceAuthorization: jest.fn(),
  restore: jest.fn(),
  addToQueue: jest.fn(),
  disconnect: jest.fn(),
  reconcileSharedState: jest.fn(),
  createSession: jest.fn(),
  joinSession: jest.fn(),
  refreshSession: jest.fn(),
  leaveSession: jest.fn(),
  endSession: jest.fn(),
  reloadDevices: jest.fn(),
  selectDevice: jest.fn(),
  invitationAddress: jest.fn(() => Fixture.invitation),
};
interface SharingSnapshot {
  queueIssue?: SpotifyHostingQueueIssue | null;
  pending: boolean;
  failure: IntegrationFailureCode | null;
  failureStage?: SpotifyHostingFailureStage | null;
  mode: SpotifyPlayerJamMode;
}
let sharingSnapshot: SharingSnapshot;
const playerJam = {
  subscribe: () => () => undefined,
  getSnapshot: () => sharingSnapshot,
  startSharing: () => controller.createSession(),
  joinAndListen: (invitation: string) =>
    controller.joinSession(invitation, JamJoinMode.Control),
};
jest.doMock(Imports.player, () => ({ playerJam }));
const HostingScreen = '../src/pages/SpotifyJam/SpotifyHosting.render';
jest.doMock(HostingScreen, () => ({ __esModule: true, default: () => null }));
const SharedPlaybackScreen =
  '../src/pages/SpotifyJam/SpotifySharedPlayback.render';
const PlaybackControlScreen =
  '../src/pages/SpotifyJam/SpotifyPlaybackControls.render';
jest.doMock(PlaybackControlScreen, () => ({
  __esModule: true,
  default: () => null,
}));
jest.doMock(SharedPlaybackScreen, () => ({
  __esModule: true,
  default: () => null,
}));
jest.doMock(Imports.membership, () => ({
  __esModule: true,
  default: () => null,
}));
jest.doMock(Imports.hostedQueue, () => ({
  __esModule: true,
  default: () => null,
}));
jest.doMock(Imports.service, () => ({ spotifyMobile: controller }));
jest.doMock(Imports.container, () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
const { SettingsButton } = require(Imports.settingsComponents);
const SpotifyJam = require(Imports.screen).default;
const SpotifySettings =
  require(Imports.settingsScreen).default;
let rendered: ReactTestRenderer;
const navigation = { goBack: jest.fn(), navigate: jest.fn() };

function connection(
  connected = true,
  owner: boolean | null = null,
): SpotifyMobileSnapshot {
  return {
    connected,
    displayName: connected ? Fixture.displayName : null,
    devices: connected
      ? [
          {
            identifier: Fixture.deviceIdentifier,
            name: Fixture.deviceName,
            active: true,
          },
        ]
      : [],
    selectedDeviceIdentifier: connected ? Fixture.deviceIdentifier : null,
    operation: SpotifyMobileOperation.Idle,
    session: connected
      ? {
          accountIdentifier: Fixture.spotifyAccount,
          status: JamConnectionStatus.Ready,
          failure: null,
          session:
            owner === null
              ? null
              : {
                  identifier: Fixture.sessionIdentifier,
                  ownedByCurrentAccount: owner,
                  active: true,
                  participants: [],
                },
        }
      : null,
    failure: null,
    deviceFailure: null,
  };
}
async function render(): Promise<void> {
  await act(async () => {
    rendered = create(<SpotifyJam navigation={navigation} />);
  });
}
async function renderSettings(): Promise<void> {
  await act(async () => {
    rendered = create(<SpotifySettings navigation={navigation} />);
  });
}
async function openAlternativeMethods(): Promise<void> {
  await act(async () =>
    button(SpotifySettingsCopy.alternativeMethods).props.onPress(),
  );
}
function button(title: string) {
  return rendered.root
    .findAll(
      instance =>
        instance.type === DefaultButton || instance.type === SettingsButton,
    )
    .find(instance => instance.props.title === title)!;
}
function input(placeholder: string) {
  return rendered.root
    .findAllByType(TextInput)
    .find(instance => instance.props.placeholder === placeholder)!;
}

beforeEach(() => {
  jest.clearAllMocks();
  snapshot = connection();
  sharingSnapshot = {
    pending: false,
    failure: null,
    failureStage: null,
    mode: SpotifyPlayerJamMode.Available,
  };
});
afterEach(async () => {
  if (rendered) await act(async () => rendered.unmount());
  jest.restoreAllMocks();
});

test(Names.connect, async () => {
  snapshot = connection(false);
  await renderSettings();
  expect(controller.login).not.toHaveBeenCalled();
  await openAlternativeMethods();
  await act(async () =>
    input(SpotifyJamCopy.clientIdentifierPlaceholder).props.onChangeText(
      Fixture.clientIdentifier,
    ),
  );
  await act(async () => button(SpotifyJamCopy.connect).props.onPress());
  expect(controller.login).toHaveBeenCalledWith({
    clientIdentifier: Fixture.clientIdentifier,
    redirectAddress: SpotifyJamCopy.redirectAddress,
    scopes: Object.values(SpotifyJamCopy.loginScopes),
  });
});
test(Names.nativeWaiting, async () => {
  snapshot = {
    ...connection(),
    authenticationMethod: SpotifyLoginMethod.Librespot,
    nativeConnection: {
      status: SpotifyConnectStatus.Reconnecting,
      deviceIdentifier: null,
      generation: Fixture.singleInvocationCount,
      failure: IntegrationFailureCode.InvalidResponse,
    },
  };
  await render();
  await act(async () =>
    input(SpotifyJamCopy.invitePlaceholder).props.onChangeText(
      Fixture.invitation,
    ),
  );
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifyJamCopy.nativeConnectionStates[SpotifyConnectStatus.Reconnecting],
  );
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifyFailureMessages[IntegrationFailureCode.InvalidResponse],
  );
  expect(button(SpotifyJamCopy.join).props.disabled).toBe(true);
});
test(Names.nativeReady, async () => {
  snapshot = {
    ...connection(),
    authenticationMethod: SpotifyLoginMethod.Librespot,
    nativeConnection: {
      status: SpotifyConnectStatus.Ready,
      deviceIdentifier: Fixture.deviceIdentifier,
      generation: Fixture.singleInvocationCount,
      failure: null,
    },
  };
  await render();
  await act(async () =>
    input(SpotifyJamCopy.invitePlaceholder).props.onChangeText(
      Fixture.invitation,
    ),
  );
  expect(button(SpotifyJamCopy.join).props.disabled).toBe(false);
  expect(button(SpotifyJamCopy.remoteMode).props.disabled).toBe(true);
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifyJamCopy.nativeConnectionStates[SpotifyConnectStatus.Ready],
  );
});
test(Names.create, async () => {
  await render();
  expect(controller.createSession).not.toHaveBeenCalled();
  await act(async () => button(SpotifyJamCopy.create).props.onPress());
  expect(controller.createSession).toHaveBeenCalledTimes(
    Fixture.singleInvocationCount,
  );
});
test(Names.join, async () => {
  await render();
  await act(async () =>
    input(SpotifyJamCopy.invitePlaceholder).props.onChangeText(
      Fixture.invitation,
    ),
  );
  await act(async () => button(SpotifyJamCopy.remoteMode).props.onPress());
  await act(async () => button(SpotifyJamCopy.joinRemote).props.onPress());
  expect(controller.joinSession).toHaveBeenCalledWith(
    Fixture.invitation,
    JamJoinMode.Remote,
  );
  expect(input(SpotifyJamCopy.invitePlaceholder).props.value).toBe(
    SpotifyMobilePolicy.emptyText,
  );
});
test(Names.host, async () => {
  snapshot = connection(true, true);
  const confirmation = jest
    .spyOn(Alert, Methods.alert)
    .mockImplementation(() => undefined);
  await render();
  await act(async () => button(SpotifyJamCopy.end).props.onPress());
  expect(controller.endSession).not.toHaveBeenCalled();
  const buttons =
    confirmation.mock.calls[Fixture.firstPosition]?.[
      Fixture.alertButtonsArgumentIndex
    ];
  await act(async () => buttons?.[Fixture.confirmationPosition]?.onPress?.());
  expect(controller.endSession).toHaveBeenCalled();
});
test(Names.guest, async () => {
  snapshot = connection(true, false);
  await render();
  expect(button(SpotifyJamCopy.end)).toBeUndefined();
  await act(async () => button(SpotifyJamCopy.leave).props.onPress());
  expect(controller.leaveSession).toHaveBeenCalled();
});
test(Names.changedConfirmation, async () => {
  snapshot = connection(true, true);
  const confirmation = jest
    .spyOn(Alert, Methods.alert)
    .mockImplementation(() => undefined);
  await render();
  await act(async () => button(SpotifyJamCopy.end).props.onPress());
  snapshot = {
    ...snapshot,
    session: {
      ...snapshot.session!,
      session: {
        ...snapshot.session!.session!,
        identifier: Fixture.otherSessionIdentifier,
      },
    },
  };
  const buttons =
    confirmation.mock.calls[Fixture.firstPosition]?.[
      Fixture.alertButtonsArgumentIndex
    ];
  await act(async () => buttons?.[Fixture.confirmationPosition]?.onPress?.());
  expect(controller.endSession).not.toHaveBeenCalled();
});
test(Names.pending, async () => {
  snapshot = { ...connection(), operation: SpotifyMobileOperation.Creating };
  await render();
  expect(button(SpotifyJamCopy.create).props.disabled).toBe(true);
  expect(button(SpotifyJamCopy.join).props.disabled).toBe(true);
});
test(Names.uncertain, async () => {
  const connected = connection();
  snapshot = {
    ...connected,
    session: { ...connected.session!, status: JamConnectionStatus.Uncertain },
  };
  await render();
  expect(button(SpotifyJamCopy.create).props.disabled).toBe(true);
  expect(button(SpotifyJamCopy.refresh).props.disabled).toBe(false);
  await act(async () => button(SpotifyJamCopy.refresh).props.onPress());
  expect(controller.refreshSession).toHaveBeenCalled();
});
test(Names.share, async () => {
  snapshot = connection(true, true);
  const share = jest
    .spyOn(Share, Methods.share)
    .mockResolvedValue({ action: Share.dismissedAction });
  await render();
  expect(share).not.toHaveBeenCalled();
  await act(async () => button(SpotifyJamCopy.share).props.onPress());
  expect(share).toHaveBeenCalledWith({
    title: SpotifyJamCopy.shareTitle,
    message: Fixture.invitation,
  });
});
test(Names.disconnect, async () => {
  await render();
  await act(async () => button(SpotifySettingsCopy.title).props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith(SettingsRoutes.spotify);
  expect(controller.disconnect).not.toHaveBeenCalled();
});
test(Names.navigation, async () => {
  await render();
  await act(async () => button(SpotifyJamCopy.back).props.onPress());
  expect(navigation.goBack).toHaveBeenCalled();
  await act(async () => button(SpotifyJamCopy.reloadDevices).props.onPress());
  expect(controller.reloadDevices).toHaveBeenCalled();
});

const QueueNames = Object.freeze({
  target: 'Host queue action requires a host device from the Jam',
  accepted: 'Acknowledged queue submission clears the track field',
  failure: 'Failed queue submission retains the track for correction',
});
test(QueueNames.target, async () => {
  snapshot = connection(true, true);
  await render();
  await act(async () =>
    input(SpotifyJamCopy.queuePlaceholder).props.onChangeText(
      Fixture.trackIdentifier,
    ),
  );
  expect(button(SpotifyJamCopy.addToQueue).props.disabled).toBe(true);
});
test(QueueNames.accepted, async () => {
  const connected = connection(true, true);
  snapshot = {
    ...connected,
    session: {
      ...connected.session!,
      session: {
        ...connected.session!.session!,
        hostDeviceIdentifier: Fixture.deviceIdentifier,
      },
    },
  };
  controller.addToQueue.mockResolvedValue(true);
  await render();
  await act(async () =>
    input(SpotifyJamCopy.queuePlaceholder).props.onChangeText(
      Fixture.trackIdentifier,
    ),
  );
  expect(button(SpotifyJamCopy.addToQueue).props.disabled).toBe(false);
  await act(async () => button(SpotifyJamCopy.addToQueue).props.onPress());
  expect(controller.addToQueue).toHaveBeenCalledWith(Fixture.trackIdentifier);
  expect(input(SpotifyJamCopy.queuePlaceholder).props.value).toBe(
    SpotifyMobilePolicy.emptyText,
  );
});
test(QueueNames.failure, async () => {
  const connected = connection(true, true);
  snapshot = {
    ...connected,
    session: {
      ...connected.session!,
      session: {
        ...connected.session!.session!,
        hostDeviceIdentifier: Fixture.deviceIdentifier,
      },
    },
  };
  controller.addToQueue.mockResolvedValue(false);
  await render();
  await act(async () =>
    input(SpotifyJamCopy.queuePlaceholder).props.onChangeText(
      Fixture.trackIdentifier,
    ),
  );
  await act(async () => button(SpotifyJamCopy.addToQueue).props.onPress());
  expect(input(SpotifyJamCopy.queuePlaceholder).props.value).toBe(
    Fixture.trackIdentifier,
  );
});

const QueueReceiptReplacementName =
  'Queue acceptance from an old Jam disappears after session replacement';
test(QueueReceiptReplacementName, async () => {
  const connected = connection(true, true);
  snapshot = {
    ...connected,
    session: {
      ...connected.session!,
      session: {
        ...connected.session!.session!,
        hostDeviceIdentifier: Fixture.deviceIdentifier,
      },
    },
  };
  controller.addToQueue.mockResolvedValue(true);
  await render();
  await act(async () =>
    input(SpotifyJamCopy.queuePlaceholder).props.onChangeText(
      Fixture.trackIdentifier,
    ),
  );
  await act(async () => button(SpotifyJamCopy.addToQueue).props.onPress());
  expect(
    JSON.stringify(rendered.toJSON()).includes(SpotifyJamCopy.queueAccepted),
  ).toBe(true);
  snapshot = {
    ...snapshot,
    session: {
      ...snapshot.session!,
      session: {
        ...snapshot.session!.session!,
        identifier: Fixture.otherSessionIdentifier,
      },
    },
  };
  await act(async () =>
    rendered.update(<SpotifyJam navigation={navigation} />),
  );
  expect(
    JSON.stringify(rendered.toJSON()).includes(SpotifyJamCopy.queueAccepted),
  ).toBe(false);
});

const SavedScreenNames = Object.freeze({
  automatic:
    'Opening the Jam screen leaves saved connection startup to the application lifecycle',
  forget: 'A disconnected screen can explicitly forget the saved Spotify login',
});
test(SavedScreenNames.automatic, async () => {
  snapshot = connection(false);
  await render();
  expect(controller.restore).not.toHaveBeenCalled();
  expect(controller.login).not.toHaveBeenCalled();
});
test(SavedScreenNames.forget, async () => {
  snapshot = connection(false);
  await renderSettings();
  await openAlternativeMethods();
  const confirmation = jest
    .spyOn(Alert, Methods.alert)
    .mockImplementation(() => undefined);
  await act(async () => button(SpotifyJamCopy.forget).props.onPress());
  expect(controller.disconnect).not.toHaveBeenCalled();
  await act(async () =>
    confirmation.mock.calls[Fixture.firstPosition]?.[
      Fixture.alertButtonsArgumentIndex
    ]?.[Fixture.confirmationPosition]?.onPress?.(),
  );
  expect(controller.disconnect).toHaveBeenCalled();
});

const LoginRecoveryScreenNames = Object.freeze({
  preserved:
    'Remounting a failed sign-in preserves its phase and error instead of silently restoring an empty login',
  resumed:
    'An unrecoverable callback shows an explicit interrupted sign-in message near the login action',
  waiting: 'Browser authorization displays the active login step',
  canceled: 'A cancelled callback cannot return to an unexplained login form',
});
test(LoginRecoveryScreenNames.preserved, async () => {
  snapshot = {
    ...connection(false),
    failure: IntegrationFailureCode.Network,
    authenticationAction: SpotifyAuthenticationAction.Login,
    loginStage: SpotifyLoginStage.Exchanging,
  };
  await renderSettings();
  expect(controller.restore).not.toHaveBeenCalled();
  const text = JSON.stringify(rendered.toJSON());
  expect(text).toContain(
    SpotifyJamCopy.loginSteps[SpotifyLoginStage.Exchanging],
  );
  expect(text).toContain(
    SpotifyFailureMessages[IntegrationFailureCode.Network],
  );
});
test(LoginRecoveryScreenNames.resumed, async () => {
  snapshot = {
    ...connection(false),
    failure: IntegrationFailureCode.Unauthorized,
    authenticationAction: SpotifyAuthenticationAction.Resume,
    loginStage: SpotifyLoginStage.Preparing,
  };
  await renderSettings();
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifyJamCopy.resumeFailed,
  );
  expect(controller.restore).not.toHaveBeenCalled();
});
test(LoginRecoveryScreenNames.waiting, async () => {
  snapshot = {
    ...connection(false),
    operation: SpotifyMobileOperation.Connecting,
    authenticationAction: SpotifyAuthenticationAction.Login,
    loginStage: SpotifyLoginStage.Authorizing,
  };
  await renderSettings();
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifyJamCopy.loginSteps[SpotifyLoginStage.Authorizing],
  );
});
test(LoginRecoveryScreenNames.canceled, async () => {
  snapshot = {
    ...connection(false),
    failure: IntegrationFailureCode.Canceled,
    authenticationAction: SpotifyAuthenticationAction.Login,
    loginStage: SpotifyLoginStage.Authorizing,
  };
  await renderSettings();
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifyJamCopy.loginCancelled,
  );
  expect(controller.restore).not.toHaveBeenCalled();
});

const ReturnDiagnosticsScreenName =
  'A failed browser return displays only its safe diagnostic category beside login';
test(ReturnDiagnosticsScreenName, async () => {
  snapshot = {
    ...connection(false),
    failure: IntegrationFailureCode.Canceled,
    authenticationAction: SpotifyAuthenticationAction.Login,
    loginStage: SpotifyLoginStage.Authorizing,
    authorizationReturnStatus: SpotifyAuthorizationReturnStatus.StateMismatch,
  };
  await renderSettings();
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifyJamCopy.returnFailures[
      SpotifyAuthorizationReturnStatus.StateMismatch
    ],
  );
  expect(controller.restore).not.toHaveBeenCalled();
});

const RedirectComponentStatuses = Object.values({
  scheme: SpotifyAuthorizationReturnStatus.SchemeMismatch,
  host: SpotifyAuthorizationReturnStatus.HostMismatch,
  path: SpotifyAuthorizationReturnStatus.PathMismatch,
});
const RedirectComponentScreenName =
  'A rejected callback shows its specific safe %s category beside login';
test.each(RedirectComponentStatuses)(
  RedirectComponentScreenName,
  async authorizationReturnStatus => {
    snapshot = {
      ...connection(false),
      failure: IntegrationFailureCode.Canceled,
      authenticationAction: SpotifyAuthenticationAction.Login,
      loginStage: SpotifyLoginStage.Authorizing,
      authorizationReturnStatus,
    };
    await renderSettings();
    expect(JSON.stringify(rendered.toJSON())).toContain(
      SpotifyJamCopy.returnFailures[authorizationReturnStatus],
    );
    expect(controller.restore).not.toHaveBeenCalled();
  },
);

const LibrespotScreenFixture = Object.freeze({
  username: 'spotify-listener',
  password: 'artificial-password',
  names: Object.freeze({
    credentials:
      'Librespot login requires explicit credentials and clears the password immediately after the press',
    rejected:
      'A Librespot credential rejection describes login rather than a Jam role',
    authorizing:
      'Native Librespot login does not tell the user to wait for a browser return',
    jamFailure:
      'A connected account with a rejected Jam read stays authenticated and names Jam access',
  }),
});
test(LibrespotScreenFixture.names.credentials, async () => {
  snapshot = connection(false);
  await renderSettings();
  await openAlternativeMethods();
  expect(controller.loginWithLibrespot).not.toHaveBeenCalled();
  expect(button(SpotifyJamCopy.librespotConnect).props.disabled).toBe(true);
  expect(input(SpotifyJamCopy.passwordPlaceholder).props.secureTextEntry).toBe(
    true,
  );
  await act(async () =>
    input(SpotifyJamCopy.usernamePlaceholder).props.onChangeText(
      LibrespotScreenFixture.username,
    ),
  );
  await act(async () =>
    input(SpotifyJamCopy.passwordPlaceholder).props.onChangeText(
      LibrespotScreenFixture.password,
    ),
  );
  expect(button(SpotifyJamCopy.librespotConnect).props.disabled).toBe(false);
  await act(async () =>
    button(SpotifyJamCopy.librespotConnect).props.onPress(),
  );
  expect(controller.loginWithLibrespot).toHaveBeenCalledWith({
    username: LibrespotScreenFixture.username,
    password: LibrespotScreenFixture.password,
  });
  expect(input(SpotifyJamCopy.passwordPlaceholder).props.value).toBe(
    SpotifyMobilePolicy.emptyText,
  );
  expect(controller.login).not.toHaveBeenCalled();
});
test(LibrespotScreenFixture.names.rejected, async () => {
  snapshot = {
    ...connection(false),
    authenticationMethod: SpotifyLoginMethod.Librespot,
    loginStage: SpotifyLoginStage.Authorizing,
    failure: IntegrationFailureCode.Unauthorized,
  };
  await renderSettings();
  const text = JSON.stringify(rendered.toJSON());
  expect(text).toContain(SpotifyJamCopy.librespotRejected);
  expect(text).not.toContain(
    SpotifyFailureMessages[IntegrationFailureCode.Forbidden],
  );
});
test(LibrespotScreenFixture.names.authorizing, async () => {
  snapshot = {
    ...connection(false),
    authenticationMethod: SpotifyLoginMethod.Librespot,
    operation: SpotifyMobileOperation.Connecting,
    loginStage: SpotifyLoginStage.Authorizing,
  };
  await renderSettings();
  const text = JSON.stringify(rendered.toJSON());
  expect(text).toContain(SpotifyJamCopy.librespotAuthorizing);
  expect(text).not.toContain(
    SpotifyJamCopy.loginSteps[SpotifyLoginStage.Authorizing],
  );
});
test(LibrespotScreenFixture.names.jamFailure, async () => {
  snapshot = {
    ...connection(),
    authenticationMethod: SpotifyLoginMethod.Librespot,
    failure: IntegrationFailureCode.Forbidden,
  };
  await renderSettings();
  await act(async () => button(SpotifySettingsCopy.details).props.onPress());
  const text = JSON.stringify(rendered.toJSON());
  expect(text).toContain(SpotifyJamCopy.jamAccessRejected);
  expect(text).toContain(Fixture.displayName);
  expect(controller.restore).not.toHaveBeenCalled();
});

const LibrespotVerificationScreenName =
  'Unsupported Librespot verification explains the login limitation without a browser callback error';
test(LibrespotVerificationScreenName, async () => {
  snapshot = {
    ...connection(false),
    authenticationMethod: SpotifyLoginMethod.Librespot,
    loginStage: SpotifyLoginStage.Authorizing,
    failure: IntegrationFailureCode.Unsupported,
  };
  await renderSettings();
  const text = JSON.stringify(rendered.toJSON());
  expect(text).toContain(SpotifyJamCopy.librespotUnsupported);
  expect(text).not.toContain(SpotifyJamCopy.loginCancelled);
  expect(controller.restore).not.toHaveBeenCalled();
});

const DeviceScreenFixture = Object.freeze({
  code: 'ABCDEF',
  address: 'https://spotify.com/pair?code=ABCDEF',
  expirationMilliseconds: 90000,
  names: Object.freeze({
    login:
      'Primary device login opens only after an explicit press without requiring password or developer configuration',
    pairing:
      'Pending pairing displays its public code and differentiates the separate email verification code',
    cancel:
      'Cancel sign-in retires a pending pairing through the existing forgetting action',
    rejected:
      'A device approval rejection names pairing rather than password credentials',
  }),
});
test(DeviceScreenFixture.names.login, async () => {
  snapshot = connection(false);
  await renderSettings();
  expect(controller.loginWithDeviceAuthorization).not.toHaveBeenCalled();
  expect(button(SpotifyJamCopy.deviceConnect).props.disabled).toBe(false);
  await act(async () => button(SpotifyJamCopy.deviceConnect).props.onPress());
  expect(controller.loginWithDeviceAuthorization).toHaveBeenCalled();
  expect(controller.login).not.toHaveBeenCalled();
  expect(controller.loginWithLibrespot).not.toHaveBeenCalled();
});
test(DeviceScreenFixture.names.pairing, async () => {
  snapshot = {
    ...connection(false),
    operation: SpotifyMobileOperation.Connecting,
    authenticationMethod: SpotifyLoginMethod.Librespot,
    deviceAuthorizationLogin: true,
    deviceAuthorization: {
      userCode: DeviceScreenFixture.code,
      verificationAddress: DeviceScreenFixture.address,
      expiresAtMilliseconds: DeviceScreenFixture.expirationMilliseconds,
    },
  };
  await renderSettings();
  const text = JSON.stringify(rendered.toJSON());
  expect(text).toContain(DeviceScreenFixture.code);
  expect(text).toContain(SpotifyJamCopy.pairingExplanation);
  expect(text).toContain(SpotifyJamCopy.waitingApproval);
  expect(button(SpotifyJamCopy.deviceConnect).props.disabled).toBe(true);
  await act(async () =>
    button(SpotifyJamCopy.reopenVerification).props.onPress(),
  );
  expect(controller.openDeviceAuthorization).toHaveBeenCalled();
});
test(DeviceScreenFixture.names.cancel, async () => {
  snapshot = {
    ...connection(false),
    operation: SpotifyMobileOperation.Connecting,
    authenticationMethod: SpotifyLoginMethod.Librespot,
    deviceAuthorizationLogin: true,
  };
  await renderSettings();
  await act(async () => button(SpotifyJamCopy.cancelSignIn).props.onPress());
  expect(controller.disconnect).toHaveBeenCalled();
});
test(DeviceScreenFixture.names.rejected, async () => {
  snapshot = {
    ...connection(false),
    authenticationMethod: SpotifyLoginMethod.Librespot,
    deviceAuthorizationLogin: true,
    failure: IntegrationFailureCode.Unauthorized,
  };
  await renderSettings();
  const text = JSON.stringify(rendered.toJSON());
  expect(text).toContain(SpotifyJamCopy.deviceRejected);
  expect(text).not.toContain(SpotifyJamCopy.librespotRejected);
});

const DeviceBootstrapScreenName =
  'Approved pairing shows native completion instead of asking the user to approve the same code again';
test(DeviceBootstrapScreenName, async () => {
  snapshot = {
    ...connection(false),
    authenticationMethod: SpotifyLoginMethod.Librespot,
    deviceAuthorizationLogin: true,
    loginStage: SpotifyLoginStage.Exchanging,
    failure: IntegrationFailureCode.Unsupported,
    deviceAuthorization: {
      userCode: DeviceScreenFixture.code,
      verificationAddress: DeviceScreenFixture.address,
      expiresAtMilliseconds: DeviceScreenFixture.expirationMilliseconds,
    },
  };
  await renderSettings();
  const text = JSON.stringify(rendered.toJSON());
  expect(text).toContain(SpotifyJamCopy.deviceSessionRejected);
  expect(text).toContain(
    SpotifyJamCopy.loginSteps[SpotifyLoginStage.Exchanging],
  );
  expect(text).not.toContain(SpotifyJamCopy.waitingApproval);
  expect(
    rendered.root
      .findAllByType(DefaultButton)
      .some(
        instance => instance.props.title === SpotifyJamCopy.reopenVerification,
      ),
  ).toBe(false);
});

const NativeDiagnosticScreenCodes = Object.values({
  session: IntegrationFailureCode.NativeSessionRejected,
  token: IntegrationFailureCode.NativeTokenRejected,
});
const NativeDiagnosticScreenName =
  'Native rejection %s displays its safe stage instead of a generic pairing failure';
test.each(NativeDiagnosticScreenCodes)(
  NativeDiagnosticScreenName,
  async failure => {
    snapshot = {
      ...connection(false),
      authenticationMethod: SpotifyLoginMethod.Librespot,
      deviceAuthorizationLogin: true,
      loginStage: SpotifyLoginStage.Exchanging,
      failure,
    };
    await renderSettings();
    const text = JSON.stringify(rendered.toJSON());
    expect(text).toContain(SpotifyFailureMessages[failure]);
    expect(text).not.toContain(SpotifyJamCopy.deviceSessionRejected);
    expect(text).not.toContain(SpotifyJamCopy.deviceRejected);
    expect(text).not.toContain(SpotifyJamCopy.librespotRejected);
    expect(controller.restore).not.toHaveBeenCalled();
  },
);

const SharedStateScreenNames = Object.freeze({
  explicit:
    'Shared state recovery requires an explicit press and is disabled during recovery',
  unavailable:
    'Shared state recovery stays hidden without native capability or owned active hosting',
});
test(SharedStateScreenNames.explicit, async () => {
  const connected = connection(true, true);
  snapshot = {
    ...connected,
    canReconcileSharedState: true,
    session: {
      ...connected.session!,
      session: {
        ...connected.session!.session!,
        hostDeviceIdentifier: Fixture.deviceIdentifier,
      },
    },
  };
  await render();
  expect(controller.reconcileSharedState).not.toHaveBeenCalled();
  const recovery = rendered.root
    .findAllByType(DefaultButton)
    .find(
      candidate =>
        candidate.props.title === SpotifyJamCopy.reconcileSharedState,
    )!;
  expect(recovery.props.disabled).toBe(false);
  await act(async () => recovery.props.onPress());
  expect(controller.reconcileSharedState).toHaveBeenCalledTimes(
    Fixture.singleInvocationCount,
  );
  snapshot = { ...snapshot, operation: SpotifyMobileOperation.Reconciling };
  await act(async () =>
    rendered.update(<SpotifyJam navigation={navigation} />),
  );
  expect(
    rendered.root
      .findAllByType(DefaultButton)
      .find(
        candidate =>
          candidate.props.title === SpotifyJamCopy.reconcileSharedState,
      )!.props.disabled,
  ).toBe(true);
});
test(SharedStateScreenNames.unavailable, async () => {
  for (const current of [
    connection(),
    { ...connection(true, false), canReconcileSharedState: true },
    { ...connection(true, true), canReconcileSharedState: true },
  ]) {
    snapshot = current;
    await render();
    expect(
      rendered.root
        .findAllByType(DefaultButton)
        .some(
          candidate =>
            candidate.props.title === SpotifyJamCopy.reconcileSharedState,
        ),
    ).toBe(false);
    await act(async () => rendered.unmount());
  }
});

const GuestQueueScreenNames = Object.freeze({
  admitted:
    'An admitted guest with explicit native capability sees queue controls and still cannot end the Jam',
  absent:
    'A guest without explicit native capability cannot see queue controls',
  unadmitted:
    'Native capability without current-account participation cannot expose guest queue controls',
});
test(GuestQueueScreenNames.admitted, async () => {
  const membership = connection(true, false).session!;
  snapshot = {
    ...connection(true, false),
    canSubmitGuestCommands: true,
    session: {
      ...membership,
      session: {
        ...membership.session!,
        hostDeviceIdentifier: Fixture.deviceIdentifier,
        participants: [
          {
            identifier: Fixture.spotifyAccount,
            displayName: Fixture.displayName,
          },
        ],
      },
    },
  };
  await render();
  expect(button(SpotifyJamCopy.addToQueue)).toBeDefined();
  expect(button(SpotifyJamCopy.end)).toBeUndefined();
  expect(button(SpotifyJamCopy.leave)).toBeDefined();
});
test(GuestQueueScreenNames.absent, async () => {
  snapshot = connection(true, false);
  await render();
  expect(button(SpotifyJamCopy.addToQueue)).toBeUndefined();
});
test(GuestQueueScreenNames.unadmitted, async () => {
  snapshot = { ...connection(true, false), canSubmitGuestCommands: true };
  await render();
  expect(button(SpotifyJamCopy.addToQueue)).toBeUndefined();
});

test(Names.matchingFailure, async () => {
  await render();
  snapshot = connection(true, true);
  sharingSnapshot = {
    pending: false,
    mode: SpotifyPlayerJamMode.Failed,
    failure: IntegrationFailureCode.Backpressure,
    failureStage: SpotifyHostingFailureStage.CatalogMatching,
  };
  await act(async () =>
    rendered.update(<SpotifyJam navigation={navigation} />),
  );
  const presentation = JSON.stringify(rendered.toJSON());
  expect(presentation).toContain(SpotifyJamCopy.ownedSession);
  expect(presentation).toContain(SpotifyJamCopy.membershipWithoutPlayback);
  expect(presentation).toContain(
    SpotifyFailureMessages[IntegrationFailureCode.Backpressure],
  );
  expect(presentation).toContain(
    SpotifyHostingFailureMessages[SpotifyHostingFailureStage.CatalogMatching],
  );
});
test(Names.membershipPreparing, async () => {
  snapshot = connection(true, false);
  sharingSnapshot = {
    pending: true,
    mode: SpotifyPlayerJamMode.Available,
    failure: null,
  };
  await render();
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifyJamCopy.preparingSharing,
  );
});

const QueueIssueTestName =
  'Main Jam queue issue %s gives a specific correction while membership remains';
test.each(Object.values(SpotifyHostingQueueIssue))(
  QueueIssueTestName,
  async queueIssue => {
    snapshot = connection(true, true);
    sharingSnapshot = {
      pending: false,
      mode: SpotifyPlayerJamMode.Failed,
      failure: IntegrationFailureCode.Unsupported,
      queueIssue,
    };
    await render();
    const presentation = JSON.stringify(rendered.toJSON());
    expect(presentation).toContain(
      SpotifyHostingQueueIssueMessages[queueIssue],
    );
    expect(presentation).toContain(SpotifyJamCopy.membershipWithoutPlayback);
    expect(presentation).not.toContain(
      SpotifyFailureMessages[IntegrationFailureCode.Unsupported],
    );
  },
);

const SpotifySettingsTestNames = Object.freeze({
  alternatives:
    'Spotify settings hides alternate credentials until explicitly expanded',
  navigation:
    'A disconnected Jam routes sign-in to Spotify settings without starting authentication',
  connected:
    'Connected Spotify settings opens Jam without showing shared playback controls',
  reconnecting:
    'A reconnecting native connection does not offer another concurrent restore',
  retry:
    'A failed native connection offers an explicit saved-account reconnect',
  confirmation:
    'Disconnecting Spotify requires confirmation and retires only the confirmed snapshot',
  replacement:
    'Disconnect confirmation cannot retire a replacement Spotify connection',
  details:
    'Spotify connection diagnostics remain hidden until explicitly expanded',
  advancedDevice:
    'Jam manual device identifiers remain hidden until explicitly expanded',
});

test(SpotifySettingsTestNames.alternatives, async () => {
  snapshot = connection(false);
  await renderSettings();
  expect(input(SpotifyJamCopy.passwordPlaceholder)).toBeUndefined();
  expect(input(SpotifyJamCopy.clientIdentifierPlaceholder)).toBeUndefined();
  await openAlternativeMethods();
  expect(input(SpotifyJamCopy.passwordPlaceholder)).toBeDefined();
  expect(input(SpotifyJamCopy.clientIdentifierPlaceholder)).toBeDefined();
});

test(SpotifySettingsTestNames.navigation, async () => {
  snapshot = connection(false);
  await render();
  expect(button(SpotifyJamCopy.restore)).toBeUndefined();
  expect(input(SpotifyJamCopy.passwordPlaceholder)).toBeUndefined();
  await act(async () => button(SpotifyJamCopy.deviceConnect).props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith(SettingsRoutes.spotify);
  expect(controller.loginWithDeviceAuthorization).not.toHaveBeenCalled();
});

test(SpotifySettingsTestNames.connected, async () => {
  await renderSettings();
  expect(JSON.stringify(rendered.toJSON())).toContain(Fixture.displayName);
  expect(button(SpotifyJamCopy.create)).toBeUndefined();
  expect(input(SpotifyJamCopy.invitePlaceholder)).toBeUndefined();
  await act(async () => button(SpotifySettingsCopy.openJam).props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith(SpotifyJamRoute);
});

test(SpotifySettingsTestNames.reconnecting, async () => {
  snapshot = {
    ...connection(),
    nativeConnection: {
      status: SpotifyConnectStatus.Reconnecting,
      deviceIdentifier: Fixture.deviceIdentifier,
      generation: Fixture.singleInvocationCount,
      failure: null,
    },
  };
  await renderSettings();
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifySettingsCopy.reconnecting,
  );
  expect(button(SpotifySettingsCopy.reconnect)).toBeUndefined();
  expect(controller.restore).not.toHaveBeenCalled();
});

test(SpotifySettingsTestNames.retry, async () => {
  snapshot = {
    ...connection(),
    nativeConnection: {
      status: SpotifyConnectStatus.Failed,
      deviceIdentifier: Fixture.deviceIdentifier,
      generation: Fixture.singleInvocationCount,
      failure: IntegrationFailureCode.Network,
    },
  };
  await renderSettings();
  expect(controller.restore).not.toHaveBeenCalled();
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifySettingsCopy.connectionInterrupted,
  );
  await act(async () => button(SpotifySettingsCopy.reconnect).props.onPress());
  expect(controller.restore).toHaveBeenCalledTimes(
    Fixture.singleInvocationCount,
  );
});

test(SpotifySettingsTestNames.confirmation, async () => {
  const confirmation = jest
    .spyOn(Alert, Methods.alert)
    .mockImplementation(() => undefined);
  await renderSettings();
  await act(async () => button(SpotifyJamCopy.disconnect).props.onPress());
  expect(controller.disconnect).not.toHaveBeenCalled();
  await act(async () =>
    confirmation.mock.calls[Fixture.firstPosition]?.[
      Fixture.alertButtonsArgumentIndex
    ]?.[Fixture.confirmationPosition]?.onPress?.(),
  );
  expect(controller.disconnect).toHaveBeenCalledTimes(
    Fixture.singleInvocationCount,
  );
});

test(SpotifySettingsTestNames.replacement, async () => {
  const confirmation = jest
    .spyOn(Alert, Methods.alert)
    .mockImplementation(() => undefined);
  await renderSettings();
  await act(async () => button(SpotifyJamCopy.disconnect).props.onPress());
  snapshot = { ...connection(), displayName: null };
  await act(async () =>
    confirmation.mock.calls[Fixture.firstPosition]?.[
      Fixture.alertButtonsArgumentIndex
    ]?.[Fixture.confirmationPosition]?.onPress?.(),
  );
  expect(controller.disconnect).not.toHaveBeenCalled();
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifySettingsCopy.connectionChanged,
  );
});

test(SpotifySettingsTestNames.details, async () => {
  snapshot = { ...connection(), failure: IntegrationFailureCode.Forbidden };
  await renderSettings();
  expect(JSON.stringify(rendered.toJSON())).not.toContain(
    SpotifyJamCopy.jamAccessRejected,
  );
  await act(async () => button(SpotifySettingsCopy.details).props.onPress());
  expect(JSON.stringify(rendered.toJSON())).toContain(
    SpotifyJamCopy.jamAccessRejected,
  );
});

test(SpotifySettingsTestNames.advancedDevice, async () => {
  await render();
  expect(input(SpotifyJamCopy.manualDevicePlaceholder)).toBeUndefined();
  await act(async () => button(SpotifyJamCopy.advancedDevices).props.onPress());
  expect(input(SpotifyJamCopy.manualDevicePlaceholder)).toBeDefined();
});
test.each([SpotifyHostingFailureStage.CatalogMatching, SpotifyHostingFailureStage.RecordingPreparation])(
  Names.catalogRejection, async failureStage => {
    snapshot = connection(true, true);
    sharingSnapshot = { pending: false, mode: SpotifyPlayerJamMode.Failed, failure: IntegrationFailureCode.InvalidInput, failureStage };
    await render(); const presentation = JSON.stringify(rendered.toJSON());
    expect(presentation).toContain(SpotifyHostingFailureDetailMessages.catalogRequestRejected);
    expect(presentation).not.toContain(SpotifyFailureMessages[IntegrationFailureCode.InvalidInput]);
  });
