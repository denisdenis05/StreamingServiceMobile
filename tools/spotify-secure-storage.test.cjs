const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  storage: '../.build/spotify/SpotifySecureCredentialStorage' });
const test = require(Imports.test);
const assertion = require(Imports.assertion);
const library = require(Imports.library);
const { SpotifySecureCredentialStorage } = require(Imports.storage);
const Fixture = Object.freeze({ account: 'application-account', otherAccount: 'other-account', serialized: 'saved-refresh-grant',
  servicePrefix: 'StreamingService.SpotifyLogin.', emptyText: '', initialCount: 0, singleCount: 1, firstPosition: 0,
  maximumCharacters: 65536, excessiveCharacters: 65537, padding: 'x', rawError: 'Sensitive native storage details' });
const Names = Object.freeze({ write: 'Secure writes address the application account slot and retain only the supplied serialized grant',
  read: 'Secure reads return only the matching application account credential', owner: 'A keychain username mismatch cannot supply credentials to another account',
  nativeFailure: 'Native storage failures are sanitized into credential storage failures',
  falseWrite: 'A false native write result cannot claim durable login',
  clear: 'Missing native credentials count as successfully forgotten only after absence verification',
  failedClear: 'A failed native removal that leaves credentials is reported explicitly',
  cancellation: 'Cancelled reads and writes do not invoke the native storage boundary',
  late: 'A read completing after cancellation cannot return the secret', bounds: 'Oversized writes and reads fail instead of accepting unbounded credential data',
  invalid: 'Empty application account identifiers cannot address native storage' });
function fixture() { const calls = []; const state = { credential: null, writeSuccess: true, clearSuccess: true };
  const platform = { read: async service => { calls.push(service); return state.credential; },
    write: async (service, account, serialized) => { calls.push({ service, account, serialized }); return state.writeSuccess; },
    clear: async service => { calls.push(service); return state.clearSuccess; } };
  const revoked = new Set();
  const revocations = { isRevoked: async service => revoked.has(service), revoke: async service => { revoked.add(service); },
    allow: async service => { revoked.delete(service); } };
  return { calls, state, platform, revoked, storage: new SpotifySecureCredentialStorage(platform, revocations) }; }
function signal() { return new AbortController().signal; }
test(Names.write, async () => { const current = fixture(); await current.storage.write(Fixture.account, Fixture.serialized, signal());
  assertion.deepEqual(current.calls[Fixture.firstPosition], { service: Fixture.servicePrefix + Fixture.account, account: Fixture.account, serialized: Fixture.serialized }); });
test(Names.read, async () => { const current = fixture(); current.state.credential = { username: Fixture.account, password: Fixture.serialized };
  assertion.equal(await current.storage.read(Fixture.account, signal()), Fixture.serialized); });
test(Names.owner, async () => { const current = fixture(); current.state.credential = { username: Fixture.otherAccount, password: Fixture.serialized };
  await assertion.rejects(current.storage.read(Fixture.account, signal()), { code: library.IntegrationFailureCode.CredentialStorage }); });
test(Names.nativeFailure, async () => { const current = fixture(); current.platform.read = async () => { throw new Error(Fixture.rawError); };
  await assertion.rejects(current.storage.read(Fixture.account, signal()), { message: library.IntegrationFailureCode.CredentialStorage }); });
test(Names.falseWrite, async () => { const current = fixture(); current.state.writeSuccess = false;
  await assertion.rejects(current.storage.write(Fixture.account, Fixture.serialized, signal()), { code: library.IntegrationFailureCode.CredentialStorage }); });
test(Names.clear, async () => { const current = fixture(); current.state.clearSuccess = false; await current.storage.clear(Fixture.account);
  assertion.equal(current.calls.length, ClearVerificationCalls); });
const ClearVerificationCalls = 2;
test(Names.failedClear, async () => { const current = fixture(); current.state.clearSuccess = false;
  current.state.credential = { username: Fixture.account, password: Fixture.serialized };
  await assertion.rejects(current.storage.clear(Fixture.account), { code: library.IntegrationFailureCode.CredentialStorage }); });
test(Names.cancellation, async () => { const current = fixture(); const cancellation = new AbortController(); cancellation.abort();
  await assertion.rejects(current.storage.read(Fixture.account, cancellation.signal), { code: library.IntegrationFailureCode.Canceled });
  await assertion.rejects(current.storage.write(Fixture.account, Fixture.serialized, cancellation.signal), { code: library.IntegrationFailureCode.Canceled });
  assertion.equal(current.calls.length, Fixture.initialCount); });
test(Names.late, async () => { const current = fixture(); let finish; let begin; const started = new Promise(resolve => { begin = resolve; });
  current.platform.read = () => { begin(); return new Promise(resolve => { finish = resolve; }); };
  const cancellation = new AbortController(); const reading = current.storage.read(Fixture.account, cancellation.signal); await started; cancellation.abort();
  finish({ username: Fixture.account, password: Fixture.serialized }); await assertion.rejects(reading, { code: library.IntegrationFailureCode.Canceled }); });
test(Names.bounds, async () => { const current = fixture(); const oversized = Fixture.padding.repeat(Fixture.excessiveCharacters);
  await assertion.rejects(current.storage.write(Fixture.account, oversized, signal()), { code: library.IntegrationFailureCode.InvalidInput });
  current.state.credential = { username: Fixture.account, password: oversized };
  await assertion.rejects(current.storage.read(Fixture.account, signal()), { code: library.IntegrationFailureCode.CredentialStorage }); });
test(Names.invalid, async () => { const current = fixture(); await assertion.rejects(current.storage.read(Fixture.emptyText, signal()), { code: library.IntegrationFailureCode.InvalidInput });
  assertion.equal(current.calls.length, Fixture.initialCount); });

const RevocationNames = Object.freeze({ failedDeletion: 'A failed physical deletion cannot restore a logically forgotten login',
  newLogin: 'A successful new login releases only its own previous revocation marker' });
test(RevocationNames.failedDeletion, async () => { const current = fixture(); current.state.clearSuccess = false;
  current.state.credential = { username: Fixture.account, password: Fixture.serialized };
  await assertion.rejects(current.storage.clear(Fixture.account));
  assertion.equal(await current.storage.read(Fixture.account, signal()), null); });
test(RevocationNames.newLogin, async () => { const current = fixture(); current.state.credential = { username: Fixture.account, password: Fixture.serialized };
  await current.storage.clear(Fixture.account); assertion.equal(await current.storage.read(Fixture.account, signal()), null);
  await current.storage.write(Fixture.account, Fixture.serialized, signal());
  assertion.equal(await current.storage.read(Fixture.account, signal()), Fixture.serialized); });
