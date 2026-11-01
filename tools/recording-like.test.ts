import {
  RecordingLikeGateway,
  RecordingLikePolicy,
  RecordingLikeService,
} from '../src/services/settings/RecordingLikeService';
const Fixture = Object.freeze({
  account: 'first-account',
  replacementAccount: 'replacement-account',
  recording: 'first-recording',
  replacementRecording: 'replacement-recording',
  oneCall: 1,
  noCalls: 0,
  requestSignalIndex: 2,
});
const details = Object.freeze({
  title: undefined,
  artist: undefined,
  album: undefined,
  cover: undefined,
});
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (failure: unknown) => void;
  const promise = new Promise<Value>((completion, failure) => {
    resolve = completion;
    reject = failure;
  });
  return { promise, resolve, reject };
}
function harness() {
  const gateway = {
    read: jest.fn().mockResolvedValue({ isLiked: true }),
    toggle: jest.fn().mockResolvedValue({ isLiked: false }),
    changed: jest.fn(),
  } satisfies RecordingLikeGateway;
  return { gateway, service: new RecordingLikeService(gateway) };
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}
test('Loads authoritative membership and returns server toggle state', async () => {
  const { gateway, service } = harness();
  service.setScope(Fixture.account, Fixture.recording);
  expect(service.getSnapshot()).toMatchObject({ isLiked: null, pending: true });
  await settle();
  expect(service.getSnapshot().isLiked).toBe(true);
  await service.toggle(details);
  expect(service.getSnapshot()).toMatchObject({
    isLiked: false,
    pending: false,
    failure: null,
  });
  expect(gateway.changed).toHaveBeenCalledTimes(Fixture.oneCall);
});
test('Double presses cause one toggle and preserve the authoritative heart while saving', async () => {
  const { gateway, service } = harness();
  service.setScope(Fixture.account, Fixture.recording);
  await settle();
  const pending = deferred<unknown>();
  gateway.toggle.mockReturnValueOnce(pending.promise);
  const first = service.toggle(details);
  await service.toggle(details);
  expect(gateway.toggle).toHaveBeenCalledTimes(Fixture.oneCall);
  expect(service.getSnapshot()).toMatchObject({ isLiked: true, pending: true });
  pending.resolve({ isLiked: false });
  await first;
});
test('Failed GET exposes an unknown heart and prevents guessing or toggling until retry', async () => {
  const { gateway, service } = harness();
  gateway.read.mockRejectedValueOnce(new Error());
  service.setScope(Fixture.account, Fixture.recording);
  await settle();
  expect(service.getSnapshot()).toMatchObject({
    isLiked: null,
    pending: false,
    failure: RecordingLikePolicy.loadFailure,
  });
  await service.toggle(details);
  expect(gateway.toggle).not.toHaveBeenCalled();
  await service.refresh();
  expect(service.getSnapshot().isLiked).toBe(true);
});
test('Failed toggle clears certainty because the server may have committed before disconnect', async () => {
  const { gateway, service } = harness();
  service.setScope(Fixture.account, Fixture.recording);
  await settle();
  gateway.toggle.mockRejectedValueOnce(new Error());
  await service.toggle(details);
  expect(service.getSnapshot()).toMatchObject({
    isLiked: null,
    failure: RecordingLikePolicy.saveFailure,
  });
  expect(gateway.changed).not.toHaveBeenCalled();
  await service.refresh();
  expect(service.getSnapshot().isLiked).toBe(true);
});
test.each([Fixture.replacementAccount, null])(
  'Late account reads are discarded after replacement %s',
  async replacement => {
    const { gateway, service } = harness();
    const stale = deferred<unknown>();
    gateway.read
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue({ isLiked: false });
    service.setScope(Fixture.account, Fixture.recording);
    const signal = gateway.read.mock.calls[Fixture.noCalls][
      Fixture.requestSignalIndex
    ] as AbortSignal;
    service.setScope(replacement, Fixture.recording);
    await settle();
    stale.resolve({ isLiked: true });
    await settle();
    expect(signal.aborted).toBe(true);
    expect(service.getSnapshot()).toMatchObject({
      accountIdentifier: replacement,
      isLiked: replacement === null ? null : false,
    });
  },
);
test('Late song toggles cannot mutate the next song or notify its library', async () => {
  const { gateway, service } = harness();
  service.setScope(Fixture.account, Fixture.recording);
  await settle();
  const stale = deferred<unknown>();
  gateway.toggle.mockReturnValueOnce(stale.promise);
  const pending = service.toggle(details);
  service.setScope(Fixture.account, Fixture.replacementRecording);
  await settle();
  stale.resolve({ isLiked: false });
  await pending;
  expect(service.getSnapshot()).toMatchObject({
    recordingIdentifier: Fixture.replacementRecording,
    isLiked: true,
  });
  expect(gateway.changed).not.toHaveBeenCalled();
});
test('Late account toggle cannot overwrite the next account heart', async () => {
  const { gateway, service } = harness();
  service.setScope(Fixture.account, Fixture.recording);
  await settle();
  const stale = deferred<unknown>();
  gateway.toggle.mockReturnValueOnce(stale.promise);
  const operation = service.toggle(details);
  service.setScope(Fixture.replacementAccount, Fixture.recording);
  await settle();
  stale.resolve({ isLiked: false });
  await operation;
  expect(service.getSnapshot()).toMatchObject({
    accountIdentifier: Fixture.replacementAccount,
    isLiked: true,
  });
  expect(gateway.changed).not.toHaveBeenCalled();
});
test('Library changes during toggle trigger a new authoritative read after the write', async () => {
  const { gateway, service } = harness();
  service.setScope(Fixture.account, Fixture.recording);
  await settle();
  const pending = deferred<unknown>();
  gateway.toggle.mockReturnValueOnce(pending.promise);
  const operation = service.toggle(details);
  await service.refresh();
  gateway.read.mockResolvedValueOnce({ isLiked: true });
  pending.resolve({ isLiked: false });
  await operation;
  expect(service.getSnapshot()).toMatchObject({
    isLiked: true,
    pending: false,
  });
});
test('Malformed read and toggle payloads never become guessed boolean hearts', async () => {
  const { gateway, service } = harness();
  gateway.read.mockResolvedValueOnce({});
  service.setScope(Fixture.account, Fixture.recording);
  await settle();
  expect(service.getSnapshot().isLiked).toBeNull();
  await service.refresh();
  gateway.toggle.mockResolvedValueOnce(undefined);
  await service.toggle(details);
  expect(service.getSnapshot()).toMatchObject({
    isLiked: null,
    failure: RecordingLikePolicy.saveFailure,
  });
});
test('Dispose aborts pending work and ignores late completion', async () => {
  const { gateway, service } = harness();
  const pending = deferred<unknown>();
  gateway.read.mockReturnValueOnce(pending.promise);
  service.setScope(Fixture.account, Fixture.recording);
  const listener = jest.fn();
  service.subscribe(listener);
  service.dispose();
  pending.resolve({ isLiked: true });
  await settle();
  expect(listener).not.toHaveBeenCalled();
});
