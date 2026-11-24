import {
  LyricsRepository,
  LyricsRepositoryPolicy,
} from '../src/services/lyrics/LyricsRepository';
import {
  LyricsFixture,
  deferredLyrics,
  lyricsResponse,
  settleLyrics,
} from './lyrics-fixtures';
function fixture() {
  const dependencies = {
    fetch: jest.fn().mockResolvedValue(lyricsResponse()),
    read: jest.fn().mockResolvedValue(null),
    write: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  return { dependencies, repository: new LyricsRepository(dependencies) };
}
test('Loads server lyrics and saves account-scoped text for offline use', async () => {
  const { dependencies, repository } = fixture();
  repository.setScope(LyricsFixture.account, LyricsFixture.recording);
  await settleLyrics();
  expect(repository.getSnapshot().document?.synchronized).toBe(true);
  expect(dependencies.fetch).toHaveBeenCalledWith(
    LyricsFixture.account,
    LyricsFixture.recording,
    expect.any(AbortSignal),
  );
  expect(dependencies.write).toHaveBeenCalledWith(
    expect.stringMatching(LyricsFixture.cacheKeyPattern),
    JSON.stringify(lyricsResponse()),
  );
});
test('Cached lyrics are immediately visible and remain readable when the server is offline', async () => {
  const { dependencies, repository } = fixture();
  const network = deferredLyrics<ReturnType<typeof lyricsResponse>>();
  dependencies.read.mockResolvedValue(JSON.stringify(lyricsResponse()));
  dependencies.fetch.mockReturnValue(network.promise);
  repository.setScope(LyricsFixture.account, LyricsFixture.recording);
  await settleLyrics();
  expect(
    repository.getSnapshot().document?.lines[LyricsFixture.first]?.text,
  ).toBe(LyricsFixture.firstText);
  network.reject(new Error(LyricsFixture.failure));
  await settleLyrics();
  expect(repository.getSnapshot().pending).toBe(false);
  expect(repository.getSnapshot().document).not.toBeNull();
});
test('Track changes abort old requests and reject their late results and cache writes', async () => {
  const { dependencies, repository } = fixture();
  const first = deferredLyrics<ReturnType<typeof lyricsResponse>>();
  dependencies.fetch.mockReturnValueOnce(first.promise);
  repository.setScope(LyricsFixture.account, LyricsFixture.recording);
  await settleLyrics();
  const signal = dependencies.fetch.mock.calls[LyricsFixture.first]![
    LyricsFixture.third
  ] as AbortSignal;
  repository.setScope(LyricsFixture.account, LyricsFixture.otherRecording);
  dependencies.fetch.mockResolvedValue(
    lyricsResponse({ recordingIdentifier: LyricsFixture.otherRecording }),
  );
  await settleLyrics();
  first.resolve(lyricsResponse());
  await settleLyrics();
  expect(signal.aborted).toBe(true);
  expect(repository.getSnapshot().recordingIdentifier).toBe(
    LyricsFixture.otherRecording,
  );
  expect(
    dependencies.write.mock.calls.some(call =>
      String(call[LyricsFixture.first]).endsWith(LyricsFixture.recording),
    ),
  ).toBe(false);
});
test('Logout clears displayed lyrics and never fetches without a current account', async () => {
  const { dependencies, repository } = fixture();
  repository.setScope(LyricsFixture.account, LyricsFixture.recording);
  await settleLyrics();
  repository.setScope(null, LyricsFixture.recording);
  expect(repository.getSnapshot().document).toBeNull();
  await repository.refresh();
  expect(dependencies.fetch).toHaveBeenCalledTimes(LyricsFixture.singleCall);
});
test('A new account uses a different cache key and cannot inherit the old document', async () => {
  const { dependencies, repository } = fixture();
  repository.setScope(LyricsFixture.account, LyricsFixture.recording);
  await settleLyrics();
  const oldKey =
    dependencies.read.mock.calls[LyricsFixture.first]![LyricsFixture.first];
  repository.setScope(LyricsFixture.otherAccount, LyricsFixture.recording);
  expect(repository.getSnapshot().document).toBeNull();
  await settleLyrics();
  expect(
    dependencies.read.mock.calls[LyricsFixture.second]![LyricsFixture.first],
  ).not.toBe(oldKey);
});
test('Online naming exclusion clears previously cached text', async () => {
  const { dependencies, repository } = fixture();
  dependencies.read.mockResolvedValue(JSON.stringify(lyricsResponse()));
  dependencies.fetch.mockResolvedValue(
    lyricsResponse({
      state: LyricsFixture.skipped,
      plainLyrics: null,
      syncedLyrics: null,
    }),
  );
  repository.setScope(LyricsFixture.account, LyricsFixture.recording);
  await settleLyrics();
  expect(repository.getSnapshot().document).toBeNull();
  expect(repository.getSnapshot().retryable).toBe(false);
  expect(dependencies.remove).toHaveBeenCalledTimes(LyricsFixture.singleCall);
});
test('Pending and instrumental results have truthful distinct states', async () => {
  const { dependencies, repository } = fixture();
  dependencies.fetch.mockResolvedValue(
    lyricsResponse({
      state: LyricsFixture.pending,
      plainLyrics: null,
      syncedLyrics: null,
    }),
  );
  repository.setScope(LyricsFixture.account, LyricsFixture.recording);
  await settleLyrics();
  expect(repository.getSnapshot()).toMatchObject({
    retryable: true,
    message: LyricsRepositoryPolicy.pending,
  });
  dependencies.fetch.mockResolvedValue(
    lyricsResponse({
      state: LyricsFixture.instrumental,
      plainLyrics: null,
      syncedLyrics: null,
    }),
  );
  await repository.refresh();
  expect(repository.getSnapshot()).toMatchObject({
    retryable: false,
    document: null,
    message: LyricsRepositoryPolicy.instrumental,
  });
});
test('Malformed cache and a response for the wrong recording cannot expose lyrics', async () => {
  const { dependencies, repository } = fixture();
  dependencies.read.mockResolvedValue(LyricsFixture.failure);
  dependencies.fetch.mockResolvedValue(
    lyricsResponse({ recordingIdentifier: LyricsFixture.otherRecording }),
  );
  repository.setScope(LyricsFixture.account, LyricsFixture.recording);
  await settleLyrics();
  expect(repository.getSnapshot()).toMatchObject({
    document: null,
    retryable: true,
    message: LyricsRepositoryPolicy.unavailable,
  });
  expect(dependencies.write).not.toHaveBeenCalled();
});
test('Missing identity does not contact cache or network', async () => {
  const { dependencies, repository } = fixture();
  repository.setScope(LyricsFixture.account, null);
  await repository.refresh();
  expect(dependencies.fetch).not.toHaveBeenCalled();
  expect(dependencies.read).not.toHaveBeenCalled();
});
test('A newer exclusion waits for an older cache write so stale text cannot return offline', async () => {
  const { dependencies, repository } = fixture();
  const writing = deferredLyrics<void>();
  dependencies.write.mockReturnValue(writing.promise);
  repository.setScope(LyricsFixture.account, LyricsFixture.recording);
  await settleLyrics();
  expect(dependencies.write).toHaveBeenCalledTimes(LyricsFixture.singleCall);
  dependencies.fetch.mockResolvedValue(
    lyricsResponse({
      state: LyricsFixture.skipped,
      plainLyrics: null,
      syncedLyrics: null,
    }),
  );
  const refreshing = repository.refresh();
  await settleLyrics();
  expect(dependencies.remove).not.toHaveBeenCalled();
  writing.resolve();
  await refreshing;
  expect(dependencies.remove).toHaveBeenCalledTimes(LyricsFixture.singleCall);
});

test('An identical server result preserves the cached document identity and manual reading position', async () => {
  const { dependencies, repository } = fixture();
  const network = deferredLyrics<ReturnType<typeof lyricsResponse>>();
  dependencies.read.mockResolvedValue(JSON.stringify(lyricsResponse()));
  dependencies.fetch.mockReturnValue(network.promise);
  repository.setScope(LyricsFixture.account, LyricsFixture.recording);
  await settleLyrics();
  const cached = repository.getSnapshot().document;
  expect(cached).not.toBeNull();
  network.resolve(lyricsResponse());
  await settleLyrics();
  expect(repository.getSnapshot().document).toBe(cached);
  await repository.refresh();
  expect(repository.getSnapshot().document).toBe(cached);
});
