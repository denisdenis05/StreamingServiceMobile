const test = require('node:test');
const assertion = require('node:assert/strict');
const { SpotifyListeningCountryStore, normalizeSpotifyListeningCountry } = require('../.build/spotify/SpotifyListeningCountryStore');
const Fixture = Object.freeze({ device: 'RO', remembered: 'US', other: 'DE', invalid: 'USA', normalizedInput: ' ro ', empty: '', account: 'synthetic-account', replacement: 'synthetic-replacement', absent: null });
function deferred() { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; }
function fixture(read = async () => Fixture.absent) {
  const writes = [];
  const store = new SpotifyListeningCountryStore({ deviceRegion: () => Fixture.device, read,
    write: async (accountIdentifier, country) => { writes.push({ accountIdentifier, country }); } });
  return { store, writes };
}
test('Country validation normalizes case and whitespace and rejects extra characters', () => {
  assertion.equal(normalizeSpotifyListeningCountry(Fixture.normalizedInput), Fixture.device);
  assertion.equal(normalizeSpotifyListeningCountry(Fixture.invalid), Fixture.empty);
  assertion.equal(normalizeSpotifyListeningCountry(Fixture.absent), Fixture.empty);
});
test('Device region is available immediately and remembered account preference replaces it', async () => {
  const current = fixture(async () => Fixture.remembered);
  assertion.equal(current.store.getSnapshot(), Fixture.device);
  await current.store.setAccount(Fixture.account);
  assertion.equal(current.store.getSnapshot(), Fixture.remembered);
});
test('Replacing account immediately removes old country and ignores its delayed read', async () => {
  const pending = deferred();
  const current = fixture(accountIdentifier => accountIdentifier === Fixture.account ? pending.promise : Promise.resolve(Fixture.other));
  const first = current.store.setAccount(Fixture.account);
  await current.store.setAccount(Fixture.replacement);
  pending.resolve(Fixture.remembered); await first;
  assertion.equal(current.store.getSnapshot(), Fixture.other);
  await current.store.setAccount(Fixture.absent);
  assertion.equal(current.store.getSnapshot(), Fixture.device);
});
test('An explicit country edit wins over a delayed remembered preference', async () => {
  const pending = deferred(); const current = fixture(() => pending.promise);
  const loading = current.store.setAccount(Fixture.account);
  current.store.set(Fixture.other); pending.resolve(Fixture.remembered); await loading;
  assertion.equal(current.store.getSnapshot(), Fixture.other);
  assertion.deepEqual(current.writes, [{ accountIdentifier: Fixture.account, country: Fixture.other }]);
});
test('Invalid edits cannot be persisted and storage failures retain device fallback', async () => {
  const current = fixture(async () => { throw new Error(Fixture.invalid); });
  await current.store.setAccount(Fixture.account); assertion.equal(current.store.getSnapshot(), Fixture.device);
  current.store.set(Fixture.invalid); await Promise.resolve();
  assertion.deepEqual(current.writes, []); assertion.equal(current.store.getSnapshot(), Fixture.empty);
});

test('A broken country observer does not prevent other screens receiving the preference', () => {
  const current = fixture(); const observed = [];
  current.store.subscribe(() => { throw new Error(Fixture.invalid); });
  current.store.subscribe(() => observed.push(current.store.getSnapshot()));
  current.store.set(Fixture.other); assertion.deepEqual(observed, [Fixture.other]);
});
test('Device region lookup failure leaves an empty country for explicit correction', () => {
  const store = new SpotifyListeningCountryStore({ deviceRegion: () => { throw new Error(Fixture.invalid); },
    read: async () => Fixture.absent, write: async () => undefined });
  assertion.equal(store.getSnapshot(), Fixture.empty);
});
