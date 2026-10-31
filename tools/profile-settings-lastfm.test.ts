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
  expect(controller.getSnapshot().failure).toBe(LastFmPolicy.failure);
  gateway.status.mockRejectedValue(new Error(Fixture.token));
  await controller.refresh();
  expect(controller.getSnapshot().failure).toBe(LastFmPolicy.failure);
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
  expect(controller.getSnapshot().failure).toBe(LastFmPolicy.failure);
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
  gateway.status.mockResolvedValue({ connected: true, username: Fixture.username, connectedAt: Fixture.connectedAt, token: Fixture.token } as LastFmStatus);
  controller.setAccount(Fixture.firstAccount); await settle();
  expect(JSON.stringify(controller.getSnapshot())).not.toContain(Fixture.token);
  gateway.status.mockResolvedValue({ connected: Fixture.token } as unknown as LastFmStatus);
  await controller.refresh(); expect(controller.getSnapshot().failure).toBe(LastFmPolicy.failure);
});
test('A failing Last.fm observer cannot prevent another observer or a status refresh', async () => {
  const { controller } = harness(); const listener = jest.fn();
  controller.subscribe(() => { throw new Error(Fixture.token); }); controller.subscribe(listener);
  controller.setAccount(Fixture.firstAccount); await settle();
  expect(listener).toHaveBeenCalled(); expect(controller.getSnapshot().operation).toBe(LastFmOperation.Idle);
});
