import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useLyrics } from '../src/services/lyrics/LyricsPlatform';
import { LyricsFixture, lyricsResponse } from './lyrics-fixtures';
import type { LyricsState } from '../src/services/lyrics/LyricsRepository';
import { LyricsRepositoryPolicy } from '../src/services/lyrics/LyricsRepository';
const mockGet = jest.fn();
const mockRead = jest.fn();
const mockWrite = jest.fn();
const mockRemove = jest.fn();
const mockNetwork = jest.fn((..._parameters: unknown[]) => ({ get: mockGet }));
const mockListeners = new Set<() => void>();
const mockAppListeners = new Set<() => void>();
const PlatformFixture = Object.freeze({
  token: 'fixture-authentication',
  route: 'api/lyrics/lyrics-recording',
  active: 'active',
  background: 'background',
});
let mockAccount = {
  isLoggedIn: true,
  accountIdentifier: LyricsFixture.account as string | null,
  token: PlatformFixture.token as string | null,
};
let mockAppState: string = PlatformFixture.active;
jest.mock('../src/services/AuthenticationService', () => ({
  authenticationSession: {
    getSnapshot: () => mockAccount,
    subscribe: (listener: () => void) => {
      mockListeners.add(listener);
      return () => mockListeners.delete(listener);
    },
  },
}));
jest.mock('../src/services/ApplicationNetworkClient', () => ({
  createApplicationNetworkClient: (...parameters: unknown[]) =>
    mockNetwork(...parameters),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...parameters: unknown[]) => mockRead(...parameters),
  setItem: (...parameters: unknown[]) => mockWrite(...parameters),
  removeItem: (...parameters: unknown[]) => mockRemove(...parameters),
}));
jest.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mockAppState;
    },
    addEventListener: (_event: string, listener: () => void) => {
      mockAppListeners.add(listener);
      return { remove: () => mockAppListeners.delete(listener) };
    },
  },
}));
let renderer: ReactTestRenderer;
let state: LyricsState;
function Probe() {
  state = useLyrics(LyricsFixture.recording).state;
  return null;
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRead.mockResolvedValue(null);
  mockWrite.mockResolvedValue(undefined);
  mockRemove.mockResolvedValue(undefined);
  mockGet.mockResolvedValue({ data: lyricsResponse() });
  mockAccount = {
    isLoggedIn: true,
    accountIdentifier: LyricsFixture.account,
    token: PlatformFixture.token,
  };
  mockAppState = PlatformFixture.active;
});
afterEach(() => {
  act(() => renderer?.unmount());
  jest.useRealTimers();
});
test('Calls the actual server lyrics route using the existing account-scoped authenticated client', async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(mockGet).toHaveBeenCalledWith(
    PlatformFixture.route,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(mockNetwork).toHaveBeenCalledWith({
    accountIdentifier: LyricsFixture.account,
    token: PlatformFixture.token,
  });
  expect(state.document?.synchronized).toBe(true);
});
test('Logout immediately removes displayed text and cancels polling', async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  await act(async () => {
    mockAccount = { isLoggedIn: false, accountIdentifier: null, token: null };
    mockListeners.forEach(listener => listener());
  });
  expect(state.document).toBeNull();
  await act(async () =>
    jest.advanceTimersByTime(LyricsRepositoryPolicy.retryIntervalMilliseconds),
  );
  expect(mockGet).toHaveBeenCalledTimes(LyricsFixture.singleCall);
});
test('Pending jobs refresh only in the foreground and resume after the app becomes active', async () => {
  mockGet.mockResolvedValue({
    data: lyricsResponse({
      state: LyricsFixture.pending,
      plainLyrics: null,
      syncedLyrics: null,
    }),
  });
  await act(async () => {
    renderer = create(<Probe />);
  });
  await act(async () => {
    mockAppState = PlatformFixture.background;
    mockAppListeners.forEach(listener => listener());
  });
  await act(async () =>
    jest.advanceTimersByTime(LyricsRepositoryPolicy.retryIntervalMilliseconds),
  );
  expect(mockGet).toHaveBeenCalledTimes(LyricsFixture.singleCall);
  await act(async () => {
    mockAppState = PlatformFixture.active;
    mockAppListeners.forEach(listener => listener());
  });
  await act(async () =>
    jest.advanceTimersByTime(LyricsRepositoryPolicy.retryIntervalMilliseconds),
  );
  expect(mockGet).toHaveBeenCalledTimes(LyricsFixture.twoCalls);
});
