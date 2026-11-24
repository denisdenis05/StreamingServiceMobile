const test = require('node:test');
const assertion = require('node:assert/strict');
const { RepeatMode } = require('streaming-service-player');
const { ProfilePreferencesService, ProfilePreferencesPolicy } = require('../.build/settings/ProfilePreferencesService');
const { PlaybackSettingsService, PlaybackSettingsPolicy } = require('../.build/settings/PlaybackSettingsService');
const { StorageSettingsService, StorageSettingsPolicy } = require('../.build/settings/StorageSettingsService');
const { directoryStorageBytes, StorageStatisticsPolicy } = require('../.build/settings/StorageStatistics');
const Fixture = Object.freeze({ account: 'synthetic-account', replacement: 'synthetic-replacement', name: 'Alex', replacementName: 'River',
  initialName: 'Initial', invalidName: '\nName', whitespace: '   ', paddedName: '  Alex  ', emptyName: '', privateError: 'synthetic-private-error',
  zero: 0, single: 1, double: 2, imageBytes: 100, audioBytes: 200, freeBytes: 1000, negativeBytes: -1, fractionalBytes: 0.5,
  initialTurns: 0, flushTurns: 12, directory: '/synthetic/cache', invalidRepeat: 'synthetic-invalid-repeat' });
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let turn = Fixture.initialTurns; turn < Fixture.flushTurns; turn += Fixture.single) await Promise.resolve(); }
function profileFixture() {
  const state = { account: Fixture.account, storedName: Fixture.initialName, read: null, write: null, failedWrite: false, writes: [], unsubscribed: false };
  let changed;
  const service = new ProfilePreferencesService({ accountIdentifier: () => state.account,
    subscribeAccount(listener) { changed = listener; return () => { state.unsubscribed = true; }; },
    async readName() { return state.read ? state.read.promise : state.storedName; },
    async writeName(account, name) { state.writes.push({ account, name }); if (state.write) await state.write.promise;
      if (state.failedWrite) throw new Error(Fixture.privateError); } });
  return { state, service, change(account) { state.account = account; changed(); } };
}
test('Profile restores the current account name and trims a saved edit', async () => {
  const current = profileFixture(); await flush(); assertion.equal(current.service.getSnapshot().displayName, Fixture.initialName);
  await current.service.saveDisplayName(Fixture.paddedName);
  assertion.equal(current.service.getSnapshot().displayName, Fixture.name);
  assertion.deepEqual(current.state.writes, [{ account: Fixture.account, name: Fixture.name }]);
});
test('Profile rejects empty, oversized and control-character names without storage writes', async () => {
  const current = profileFixture(); await flush();
  for (const value of [Fixture.emptyName, Fixture.whitespace, Fixture.invalidName, Fixture.name.repeat(ProfilePreferencesPolicy.maximumNameCharacters)]) {
    await current.service.saveDisplayName(value); assertion.equal(current.service.getSnapshot().error, ProfilePreferencesPolicy.invalidNameMessage);
  }
  assertion.equal(current.state.writes.length, Fixture.zero);
});
test('Profile accepts the maximum name length', async () => {
  const current = profileFixture(); await flush(); const value = Fixture.name.substring(Fixture.zero, Fixture.single).repeat(ProfilePreferencesPolicy.maximumNameCharacters);
  await current.service.saveDisplayName(value); assertion.equal(current.service.getSnapshot().displayName, value);
});
test('A late profile read cannot overwrite a newer saved name', async () => {
  const current = profileFixture(); await flush(); current.state.read = deferred(); const restoration = current.service.restore();
  await current.service.saveDisplayName(Fixture.name); current.state.read.resolve(Fixture.initialName); await restoration;
  assertion.equal(current.service.getSnapshot().displayName, Fixture.name);
});
test('Profile account replacement clears the old name and ignores its delayed write', async () => {
  const current = profileFixture(); await flush(); current.state.write = deferred(); const saving = current.service.saveDisplayName(Fixture.name); await flush();
  current.state.storedName = Fixture.replacementName; current.change(Fixture.replacement); await flush();
  current.state.write.resolve(); await saving; assertion.equal(current.service.getSnapshot().displayName, Fixture.replacementName);
  assertion.equal(current.state.writes[Fixture.zero].account, Fixture.account);
});
test('Profile logout prevents saving and exposes no old profile', async () => {
  const current = profileFixture(); await flush(); current.change(null); await current.service.saveDisplayName(Fixture.name);
  assertion.equal(current.service.getSnapshot().displayName, Fixture.emptyName);
  assertion.equal(current.state.writes.length, Fixture.zero);
  assertion.equal(current.service.getSnapshot().error, ProfilePreferencesPolicy.accountRequiredMessage);
});
test('Profile writes remain ordered and only the latest edit becomes visible', async () => {
  const current = profileFixture(); await flush(); current.state.write = deferred(); const first = current.service.saveDisplayName(Fixture.name); await flush();
  const second = current.service.saveDisplayName(Fixture.replacementName); current.state.write.resolve(); await Promise.all([first, second]);
  assertion.equal(current.state.writes.length, Fixture.double); assertion.equal(current.service.getSnapshot().displayName, Fixture.replacementName);
});
test('Profile storage failures exclude raw error data and preserve the last saved name', async () => {
  const current = profileFixture(); await flush(); current.state.failedWrite = true; await current.service.saveDisplayName(Fixture.name);
  assertion.equal(current.service.getSnapshot().error, ProfilePreferencesPolicy.saveFailureMessage);
  assertion.equal(current.service.getSnapshot().displayName, Fixture.initialName);
  assertion.equal(JSON.stringify(current.service.getSnapshot()).includes(Fixture.privateError), false);
});
test('Invalid stored profile names are excluded and disposed stores ignore delayed reads', async () => {
  const current = profileFixture(); await flush(); current.state.storedName = Fixture.invalidName; await current.service.restore();
  assertion.equal(current.service.getSnapshot().displayName, Fixture.emptyName);
  current.state.read = deferred(); const reading = current.service.restore(); current.service.dispose();
  const previous = current.service.getSnapshot(); current.state.read.resolve(Fixture.name); await reading;
  assertion.equal(current.service.getSnapshot(), previous); assertion.equal(current.state.unsubscribed, true);
});
function playbackFixture() {
  let changed;
  const state = { account: Fixture.account, ready: true, shuffled: false, repeatMode: RepeatMode.Off, externallyControlled: false,
    preparation: null, action: null, failure: false, commands: [], unsubscribed: false };
  const service = new PlaybackSettingsService({ accountIdentifier: () => state.account,
    read: () => ({ ready: state.ready, shuffled: state.shuffled, repeatMode: state.repeatMode, externallyControlled: state.externallyControlled }),
    subscribe(listener) { changed = listener; return () => { state.unsubscribed = true; }; },
    async whenReady() { if (state.preparation) await state.preparation.promise; }, async refresh() {},
    async setShuffle(enabled) { state.commands.push(enabled); if (state.action) await state.action.promise;
      if (state.failure) throw new Error(Fixture.privateError); state.shuffled = enabled; },
    async setRepeat(mode) { state.commands.push(mode); state.repeatMode = mode; } });
  return { service, state, changed: () => changed() };
}
test('Playback preferences show actual shuffle and repeat command results', async () => {
  const current = playbackFixture(); await current.service.setShuffle(true); await current.service.setRepeat(RepeatMode.All);
  assertion.equal(current.service.getSnapshot().shuffled, true); assertion.equal(current.service.getSnapshot().repeatMode, RepeatMode.All);
});
test('Playback blocks local changes while an external Spotify authority owns playback', async () => {
  const current = playbackFixture(); current.state.externallyControlled = true; await current.service.setShuffle(true);
  assertion.equal(current.state.commands.length, Fixture.zero);
  assertion.equal(current.service.getSnapshot().error, PlaybackSettingsPolicy.controlledMessage);
});
test('Playback rechecks external ownership after asynchronous player preparation', async () => {
  const current = playbackFixture(); current.state.preparation = deferred(); const change = current.service.setShuffle(true);
  current.state.externallyControlled = true; current.state.preparation.resolve(); await change;
  assertion.equal(current.state.commands.length, Fixture.zero);
});
test('Playback account replacement prevents a delayed setting from dispatching', async () => {
  const current = playbackFixture(); current.state.preparation = deferred(); const change = current.service.setShuffle(true);
  current.state.account = Fixture.replacement; current.changed(); current.state.preparation.resolve(); await change;
  assertion.equal(current.state.commands.length, Fixture.zero); assertion.equal(current.service.getSnapshot().busy, false);
});
test('Playback coalesces a busy mutation without issuing another command', async () => {
  const current = playbackFixture(); current.state.action = deferred(); const change = current.service.setShuffle(true); await flush();
  await current.service.setRepeat(RepeatMode.All); assertion.equal(current.state.commands.length, Fixture.single);
  current.state.action.resolve(); await change;
});
test('Playback rejects unsupported repeat modes and ignores logged-out mutations', async () => {
  const current = playbackFixture(); await current.service.setRepeat(Fixture.invalidRepeat);
  assertion.equal(current.service.getSnapshot().error, PlaybackSettingsPolicy.invalidModeMessage);
  current.state.account = null; current.changed(); await current.service.setShuffle(true); assertion.equal(current.state.commands.length, Fixture.zero);
});
test('Playback errors exclude raw failures and disposal stops observation', async () => {
  const current = playbackFixture(); current.state.failure = true; await current.service.setShuffle(true);
  assertion.equal(current.service.getSnapshot().error, PlaybackSettingsPolicy.failureMessage);
  assertion.equal(JSON.stringify(current.service.getSnapshot()).includes(Fixture.privateError), false);
  current.service.dispose(); assertion.equal(current.state.unsubscribed, true);
});
function storageFixture() {
  let changed;
  const state = { account: Fixture.account, read: null, clear: null, failure: false, reads: Fixture.zero, clears: Fixture.zero,
    reading: { imageCacheBytes: Fixture.imageBytes, audioCacheBytes: Fixture.audioBytes, availableBytes: Fixture.freeBytes } };
  const service = new StorageSettingsService({ accountIdentifier: () => state.account,
    subscribeAccount(listener) { changed = listener; return () => undefined; },
    async read() { state.reads += Fixture.single; if (state.failure) throw new Error(Fixture.privateError); return state.read ? state.read.promise : state.reading; },
    async clearImages() { state.clears += Fixture.single; if (state.clear) await state.clear.promise; state.reading = { ...state.reading, imageCacheBytes: Fixture.zero }; } });
  return { service, state, change(account) { state.account = account; changed(); } };
}
test('Storage loads bounded account audio, image cache and available disk measurements', async () => {
  const current = storageFixture(); await current.service.refresh(); assertion.equal(current.service.getSnapshot().audioCacheBytes, Fixture.audioBytes);
  assertion.equal(current.service.getSnapshot().availableBytes, Fixture.freeBytes);
});
test('Clearing image cache preserves audio and refreshes actual storage after completion', async () => {
  const current = storageFixture(); await current.service.clearImageCache();
  assertion.equal(current.service.getSnapshot().imageCacheBytes, Fixture.zero); assertion.equal(current.service.getSnapshot().audioCacheBytes, Fixture.audioBytes);
});
test('Duplicate image cache clear and refresh cannot overlap an in-flight clear', async () => {
  const current = storageFixture(); current.state.clear = deferred(); const clearing = current.service.clearImageCache();
  await current.service.clearImageCache(); await current.service.refresh(); assertion.equal(current.state.clears, Fixture.single);
  assertion.equal(current.state.reads, Fixture.zero); current.state.clear.resolve(); await clearing;
});
test('A late storage refresh cannot replace a newer reading', async () => {
  const current = storageFixture(); current.state.read = deferred(); const previous = current.service.refresh();
  const delayed = current.state.read; current.state.read = null; await current.service.clearImageCache(); delayed.resolve({ ...current.state.reading, imageCacheBytes: Fixture.imageBytes }); await previous;
  assertion.equal(current.service.getSnapshot().imageCacheBytes, Fixture.zero);
});
test('Storage account replacement clears private readings and ignores old completion', async () => {
  const current = storageFixture(); current.state.read = deferred(); const reading = current.service.refresh(); current.change(Fixture.replacement);
  current.state.read.resolve(current.state.reading); await reading; assertion.equal(current.service.getSnapshot().audioCacheBytes, null);
});
test('Storage rejects malformed measurements and excludes raw errors', async () => {
  const current = storageFixture(); current.state.reading = { ...current.state.reading, audioCacheBytes: Fixture.negativeBytes };
  await current.service.refresh(); assertion.equal(current.service.getSnapshot().error, StorageSettingsPolicy.failureMessage);
  current.state.failure = true; await current.service.refresh(); assertion.equal(JSON.stringify(current.service.getSnapshot()).includes(Fixture.privateError), false);
});
test('Logged-out storage cannot clear files and disposal ignores pending reads', async () => {
  const current = storageFixture(); current.change(null); await current.service.clearImageCache(); assertion.equal(current.state.clears, Fixture.zero);
  current.change(Fixture.account); current.state.read = deferred(); const reading = current.service.refresh(); current.service.dispose();
  const previous = current.service.getSnapshot(); current.state.read.resolve(current.state.reading); await reading; assertion.equal(current.service.getSnapshot(), previous);
});
test('Storage statistics count files only and treat a missing cache directory as empty', async () => {
  const filesystem = { async exists() { return true; }, async readDirectory() { return [
    { size: Fixture.imageBytes, isFile: () => true }, { size: Fixture.audioBytes, isFile: () => true }, { size: Fixture.freeBytes, isFile: () => false }]; } };
  assertion.equal(await directoryStorageBytes(filesystem, Fixture.directory), Fixture.imageBytes + Fixture.audioBytes);
  filesystem.exists = async () => false; assertion.equal(await directoryStorageBytes(filesystem, Fixture.directory), Fixture.zero);
});
test('Storage statistics reject negative, fractional, overflowing and oversized directory readings', async () => {
  const filesystem = { async exists() { return true; }, async readDirectory() { return [{ size: Fixture.negativeBytes, isFile: () => true }]; } };
  await assertion.rejects(directoryStorageBytes(filesystem, Fixture.directory));
  filesystem.readDirectory = async () => [{ size: Fixture.fractionalBytes, isFile: () => true }]; await assertion.rejects(directoryStorageBytes(filesystem, Fixture.directory));
  filesystem.readDirectory = async () => [{ size: Number.MAX_SAFE_INTEGER, isFile: () => true }, { size: Fixture.single, isFile: () => true }];
  await assertion.rejects(directoryStorageBytes(filesystem, Fixture.directory));
  filesystem.readDirectory = async () => Array(StorageStatisticsPolicy.maximumDirectoryEntries + Fixture.single).fill({ size: Fixture.single, isFile: () => true });
  await assertion.rejects(directoryStorageBytes(filesystem, Fixture.directory));
});
