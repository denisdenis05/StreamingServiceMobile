import {
  LastFmController,
  LastFmGateway,
  LastFmOperation,
  LastFmPolicy,
  LastFmStatus,
} from '../src/services/settings/LastFmController';
const Fixture = Object.freeze({
  firstAccount: 'first-account',
  secondAccount: 'second-account',
  authorizationAddress: 'https://www.last.fm/api/auth',
  token: 'test-authorization',
  username: 'test-listener',
  connectedAt: '2026-10-31T10:00:00Z',
  oneCall: 1,
  zeroCalls: 0,
});
const disconnected: LastFmStatus = {
  connected: false,
  username: null,
  connectedAt: null,
};
const connected: LastFmStatus = {
  connected: true,
  username: Fixture.username,
  connectedAt: Fixture.connectedAt,
};
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>(completion => {
    resolve = completion;
  });
  return { promise, resolve };
}
function harness() {
  const gateway = {
    status: jest
      .fn<Promise<LastFmStatus>, [AbortSignal]>()
      .mockResolvedValue(disconnected),
    authorization: jest.fn().mockResolvedValue(Fixture.authorizationAddress),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  } satisfies LastFmGateway;
  const browser = { open: jest.fn().mockResolvedValue(true) };
  return {
    gateway,
    browser,
    controller: new LastFmController(gateway, browser),
  };
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}
test('Last.fm loads real connection identity and disconnects explicitly', async () => {
  const { controller, gateway } = harness();
  gateway.status.mockResolvedValue(connected);
  controller.setAccount(Fixture.firstAccount);
  await settle();
  expect(controller.getSnapshot()).toMatchObject(connected);
  await controller.disconnect();
  expect(gateway.disconnect).toHaveBeenCalledTimes(Fixture.oneCall);
  expect(controller.getSnapshot()).toMatchObject(disconnected);
});
test('A previous account status response cannot replace the current account', async () => {
  const { controller, gateway } = harness();
  const previous = deferred<LastFmStatus>();
  gateway.status
    .mockReturnValueOnce(previous.promise)
    .mockResolvedValue(disconnected);
  controller.setAccount(Fixture.firstAccount);
  const previousSignal =
    gateway.status.mock.calls[Fixture.zeroCalls][Fixture.zeroCalls];
  controller.setAccount(Fixture.secondAccount);
  await settle();
  previous.resolve(connected);
  await settle();
  expect(previousSignal.aborted).toBe(true);
  expect(controller.getSnapshot()).toMatchObject(disconnected);
});
test('Cancelling pending authorization prevents browser launch and rejects late callbacks', async () => {
  const { controller, gateway, browser } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  const authorization = deferred<string>();
  gateway.authorization.mockReturnValueOnce(authorization.promise);
  const pending = controller.authorize();
  controller.cancel();
  authorization.resolve(Fixture.authorizationAddress);
  await pending;
  await controller.complete(Fixture.token);
  expect(browser.open).not.toHaveBeenCalled();
  expect(gateway.connect).not.toHaveBeenCalled();
  expect(controller.getSnapshot().operation).toBe(LastFmOperation.Idle);
});
test('Browser return refresh preserves pending authorization and callback connects exactly once', async () => {
  const { controller, gateway, browser } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  await controller.authorize();
  expect(browser.open).toHaveBeenCalledWith(Fixture.authorizationAddress);
  await controller.refresh();
  expect(controller.getSnapshot().operation).toBe(LastFmOperation.Authorizing);
  const connection = deferred<void>();
  gateway.connect.mockReturnValueOnce(connection.promise);
  gateway.status.mockResolvedValue(connected);
  const pending = controller.complete(Fixture.token);
  await controller.complete(Fixture.token);
  connection.resolve();
  await pending;
  expect(gateway.connect).toHaveBeenCalledTimes(Fixture.oneCall);
  expect(controller.getSnapshot()).toMatchObject(connected);
});
test('Account replacement cancels connection and ignores its delayed completion', async () => {
  const { controller, gateway } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  await controller.authorize();
  const connection = deferred<void>();
  gateway.connect.mockReturnValueOnce(connection.promise);
  const pending = controller.complete(Fixture.token);
  controller.setAccount(Fixture.secondAccount);
  await settle();
  connection.resolve();
  await pending;
  expect(controller.getSnapshot()).toMatchObject(disconnected);
});
test('Unavailable browser and failed status requests produce safe retryable failure', async () => {
  const { controller, gateway, browser } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  browser.open.mockResolvedValue(false);
  await controller.authorize();
  expect(controller.getSnapshot().failure).toBe(LastFmPolicy.unavailable);
  gateway.status.mockRejectedValue(new Error(Fixture.token));
  await controller.refresh();
  expect(controller.getSnapshot().failure).toBe(LastFmPolicy.statusFailure);
});
test('Authorization errors retire the pending flow while unrelated errors do nothing', async () => {
  const { controller, gateway } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  controller.authorizationFailed();
  expect(controller.getSnapshot().failure).toBeNull();
  await controller.authorize();
  controller.authorizationFailed();
  await controller.complete(Fixture.token);
  expect(gateway.connect).not.toHaveBeenCalled();
  expect(controller.getSnapshot().failure).toBe(
    LastFmPolicy.authorizationFailure,
  );
});
test('Logout aborts the active status request and resets all account details', async () => {
  const { controller, gateway } = harness();
  const status = deferred<LastFmStatus>();
  gateway.status.mockReturnValueOnce(status.promise);
  controller.setAccount(Fixture.firstAccount);
  controller.setAccount(null);
  status.resolve(connected);
  await settle();
  expect(controller.getSnapshot()).toMatchObject(disconnected);
  expect(controller.getSnapshot().operation).toBe(LastFmOperation.Idle);
});

test('A delayed browser completion cannot revive cancelled authorization', async () => {
  const { controller, browser, gateway } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  const opening = deferred<boolean>();
  browser.open.mockReturnValueOnce(opening.promise);
  const pending = controller.authorize();
  await settle();
  controller.cancel();
  opening.resolve(true);
  await pending;
  await controller.complete(Fixture.token);
  expect(controller.getSnapshot().operation).toBe(LastFmOperation.Idle);
  expect(gateway.connect).not.toHaveBeenCalled();
});

test('Duplicate connect presses never launch a second authorization browser', async () => {
  const { controller, browser, gateway } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  const authorization = deferred<string>();
  gateway.authorization.mockReturnValueOnce(authorization.promise);
  const pending = controller.authorize();
  await controller.authorize();
  authorization.resolve(Fixture.authorizationAddress);
  await pending;
  expect(gateway.authorization).toHaveBeenCalledTimes(Fixture.oneCall);
  expect(browser.open).toHaveBeenCalledTimes(Fixture.oneCall);
});

test('Malformed Last.fm status cannot publish private or invalid server fields', async () => {
  const { controller, gateway } = harness();
  gateway.status.mockResolvedValue({
    connected: true,
    username: Fixture.username,
    connectedAt: Fixture.connectedAt,
    token: Fixture.token,
  } as LastFmStatus);
  controller.setAccount(Fixture.firstAccount);
  await settle();
  expect(JSON.stringify(controller.getSnapshot())).not.toContain(Fixture.token);
  gateway.status.mockResolvedValue({
    connected: Fixture.token,
  } as unknown as LastFmStatus);
  await controller.refresh();
  expect(controller.getSnapshot().failure).toBe(LastFmPolicy.statusFailure);
});
test('A failing Last.fm observer cannot prevent another observer or a status refresh', async () => {
  const { controller } = harness();
  const listener = jest.fn();
  controller.subscribe(() => {
    throw new Error(Fixture.token);
  });
  controller.subscribe(listener);
  controller.setAccount(Fixture.firstAccount);
  await settle();
  expect(listener).toHaveBeenCalled();
  expect(controller.getSnapshot().operation).toBe(LastFmOperation.Idle);
});

test('Foreground status refresh cannot interrupt opening the approval browser', async () => {
  const { controller, gateway, browser } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  const opening = deferred<boolean>();
  browser.open.mockReturnValueOnce(opening.promise);
  const pending = controller.authorize();
  await settle();
  expect(controller.getSnapshot().operation).toBe(LastFmOperation.Opening);
  await controller.refresh();
  expect(gateway.status).toHaveBeenCalledTimes(Fixture.oneCall);
  opening.resolve(true);
  await pending;
  expect(controller.getSnapshot().operation).toBe(LastFmOperation.Authorizing);
  expect(controller.getSnapshot().authorizationPending).toBe(true);
});

test('A transient approval status failure preserves the live browser callback', async () => {
  const { controller, gateway } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  await controller.authorize();
  gateway.status.mockRejectedValueOnce(new Error(Fixture.token));
  await controller.refresh();
  expect(controller.getSnapshot()).toMatchObject({
    authorizationPending: true,
    operation: LastFmOperation.Authorizing,
    failure: LastFmPolicy.statusFailure,
  });
  gateway.status.mockResolvedValue(connected);
  await controller.complete(Fixture.token);
  expect(controller.getSnapshot()).toMatchObject(connected);
  expect(controller.getSnapshot().authorizationPending).toBe(false);
});

test('A connected refresh retires browser approval and rejects its later callback', async () => {
  const { controller, gateway } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  await controller.authorize();
  gateway.status.mockResolvedValue(connected);
  await controller.refresh();
  await controller.complete(Fixture.token);
  expect(gateway.connect).not.toHaveBeenCalled();
  expect(controller.getSnapshot().authorizationPending).toBe(false);
});

test('Already connected accounts cannot start replacement authorization', async () => {
  const { controller, gateway, browser } = harness();
  gateway.status.mockResolvedValue(connected);
  controller.setAccount(Fixture.firstAccount);
  await settle();
  await controller.authorize();
  expect(browser.open).not.toHaveBeenCalled();
  expect(gateway.authorization).not.toHaveBeenCalled();
});

test('Connect success without a confirmed server connection gives an actionable failure', async () => {
  const { controller } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  await controller.authorize();
  await controller.complete(Fixture.token);
  expect(controller.getSnapshot()).toMatchObject({
    connected: false,
    operation: LastFmOperation.Idle,
    failure: LastFmPolicy.connectionFailure,
    authorizationPending: false,
  });
});

test('Foreground refresh cannot abort disconnect and a failed disconnect keeps account identity', async () => {
  const { controller, gateway } = harness();
  gateway.status.mockResolvedValue(connected);
  controller.setAccount(Fixture.firstAccount);
  await settle();
  const disconnecting = deferred<void>();
  gateway.disconnect.mockReturnValueOnce(disconnecting.promise);
  const pending = controller.disconnect();
  expect(controller.getSnapshot().operation).toBe(
    LastFmOperation.Disconnecting,
  );
  await controller.refresh();
  expect(gateway.status).toHaveBeenCalledTimes(Fixture.oneCall);
  disconnecting.resolve();
  await pending;
  expect(controller.getSnapshot()).toMatchObject(disconnected);
  await controller.refresh();
  gateway.disconnect.mockRejectedValueOnce(new Error(Fixture.token));
  await controller.disconnect();
  expect(controller.getSnapshot()).toMatchObject(connected);
  expect(controller.getSnapshot().failure).toBe(LastFmPolicy.disconnectFailure);
});

test('Cancelling a pending approval check discards its delayed connected result', async () => {
  const { controller, gateway } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  await controller.authorize();
  const status = deferred<LastFmStatus>();
  gateway.status.mockReturnValueOnce(status.promise);
  const pending = controller.refresh();
  expect(controller.getSnapshot().authorizationPending).toBe(true);
  controller.cancel();
  status.resolve(connected);
  await pending;
  expect(controller.getSnapshot()).toMatchObject(disconnected);
  expect(controller.getSnapshot().authorizationPending).toBe(false);
});

test('Failed approval URL requests retire authorization without exposing server messages', async () => {
  const { controller, gateway, browser } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  gateway.authorization.mockRejectedValueOnce(new Error(Fixture.token));
  await controller.authorize();
  expect(browser.open).not.toHaveBeenCalled();
  expect(controller.getSnapshot()).toMatchObject({
    operation: LastFmOperation.Idle,
    authorizationPending: false,
    failure: LastFmPolicy.unavailable,
  });
  await controller.complete(Fixture.token);
  expect(gateway.connect).not.toHaveBeenCalled();
});

test('Failed connection requests expose a status recovery action and consume the callback once', async () => {
  const { controller, gateway } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  await controller.authorize();
  gateway.connect.mockRejectedValueOnce(new Error(Fixture.token));
  await controller.complete(Fixture.token);
  await controller.complete(Fixture.token);
  expect(gateway.connect).toHaveBeenCalledTimes(Fixture.oneCall);
  expect(controller.getSnapshot()).toMatchObject({
    connected: false,
    operation: LastFmOperation.Idle,
    authorizationPending: false,
    failure: LastFmPolicy.connectionFailure,
  });
});

test('Disconnected accounts and duplicate disconnect presses never send redundant removal requests', async () => {
  const { controller, gateway } = harness();
  controller.setAccount(Fixture.firstAccount);
  await settle();
  await controller.disconnect();
  expect(gateway.disconnect).not.toHaveBeenCalled();
  gateway.status.mockResolvedValue(connected);
  await controller.refresh();
  const disconnecting = deferred<void>();
  gateway.disconnect.mockReturnValueOnce(disconnecting.promise);
  const pending = controller.disconnect();
  await controller.disconnect();
  expect(gateway.disconnect).toHaveBeenCalledTimes(Fixture.oneCall);
  disconnecting.resolve();
  await pending;
});
