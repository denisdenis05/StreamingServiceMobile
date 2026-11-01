import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { notifyLibraryChanged } from '../src/services/LibraryChanges';
const Fixture = Object.freeze({
  account: 'listener-account',
  replacement: 'replacement-account',
  token: 'synthetic-token',
  recording: 'recording-identifier',
  replacementRecording: 'replacement-recording',
  single: 1,
  firstCall: 0,
  expectedReadsAfterChange: 2,
  accountModule: '../src/services/AuthenticationService',
  networkModule: '../src/services/ApplicationNetworkClient',
});
let account = {
  isLoggedIn: true,
  accountIdentifier: Fixture.account as string | null,
  token: Fixture.token as string | null,
};
const accountListeners = new Set<() => void>();
const client = { get: jest.fn(), post: jest.fn() };
const createClient = jest.fn((..._argumentsList: unknown[]) => client);
jest.doMock(Fixture.accountModule, () => ({
  authenticationSession: {
    getSnapshot: () => account,
    subscribe: (listener: () => void) => {
      accountListeners.add(listener);
      return () => {
        accountListeners.delete(listener);
      };
    },
  },
}));
jest.doMock(Fixture.networkModule, () => ({
  createApplicationNetworkClient: (...argumentsList: unknown[]) =>
    createClient(...argumentsList),
}));
const { useRecordingLike } =
  require('../src/services/RecordingLikePlatform') as typeof import('../src/services/RecordingLikePlatform');
let current: ReturnType<typeof useRecordingLike>;
function Harness({ recording }: { recording: string }) {
  current = useRecordingLike(recording);
  return null;
}
let renderer: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  account = {
    isLoggedIn: true,
    accountIdentifier: Fixture.account,
    token: Fixture.token,
  };
  client.get.mockResolvedValue({ data: { isLiked: true } });
  client.post.mockResolvedValue({ data: { isLiked: false } });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});
test('Hook requests account scoped membership and refreshes after library changes', async () => {
  await act(async () => {
    renderer = create(<Harness recording={Fixture.recording} />);
  });
  expect(createClient).toHaveBeenCalledWith({
    accountIdentifier: Fixture.account,
    token: Fixture.token,
  });
  expect(client.get).toHaveBeenCalledWith(
    'Library/likes/' + Fixture.recording,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(current.state.isLiked).toBe(true);
  client.get.mockResolvedValueOnce({ data: { isLiked: false } });
  await act(async () => notifyLibraryChanged());
  expect(current.state.isLiked).toBe(false);
  expect(client.get).toHaveBeenCalledTimes(Fixture.expectedReadsAfterChange);
});
test('Successful toggle publishes changes without refreshing itself in a loop', async () => {
  await act(async () => {
    renderer = create(<Harness recording={Fixture.recording} />);
  });
  await act(async () =>
    current.toggle({
      title: undefined,
      artist: undefined,
      album: undefined,
      cover: undefined,
    }),
  );
  expect(current.state.isLiked).toBe(false);
  expect(client.post).toHaveBeenCalledTimes(Fixture.single);
  expect(client.get).toHaveBeenCalledTimes(Fixture.single);
});
test('Logout immediately clears membership and never requests another account with old credentials', async () => {
  await act(async () => {
    renderer = create(<Harness recording={Fixture.recording} />);
  });
  await act(async () => {
    account = { isLoggedIn: false, accountIdentifier: null, token: null };
    accountListeners.forEach(listener => listener());
  });
  expect(current.state).toMatchObject({
    accountIdentifier: null,
    isLiked: null,
    pending: false,
  });
  expect(client.get).toHaveBeenCalledTimes(Fixture.single);
});
test('Changing track checks its authoritative membership instead of queued metadata', async () => {
  await act(async () => {
    renderer = create(<Harness recording={Fixture.recording} />);
  });
  client.get.mockResolvedValueOnce({ data: { isLiked: false } });
  await act(async () =>
    renderer.update(<Harness recording={Fixture.replacementRecording} />),
  );
  expect(current.state).toMatchObject({
    recordingIdentifier: Fixture.replacementRecording,
    isLiked: false,
  });
  expect(client.get).toHaveBeenCalledTimes(Fixture.expectedReadsAfterChange);
});
