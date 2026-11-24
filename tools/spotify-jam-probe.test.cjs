const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  probe: './probe-spotify-jam-session.cjs', deviceProbe: './probe-spotify-device-login.cjs' });
const test = require(Imports.test);
const assert = require(Imports.assertion);
const library = require(Imports.library);
const { SpotifyJamLiveProbe } = require(Imports.probe);
const { parseNativeGrant } = require(Imports.deviceProbe);

const Fixture = Object.freeze({ account: 'synthetic-account', session: 'test-created-session', otherSession: 'replacement-session',
  requestPrefix: 'test-jam-request-', invitation: 'spotify:socialsession:synthetic-invitation', token: 'synthetic-token', stored: 'synthetic-reusable-record',
  expiryMilliseconds: 1000000, privateFailure: 'synthetic-sensitive-server-text', malformed: '{synthetic-sensitive-server-text',
  zero: 0, one: 1,
  names: Object.freeze({ passive: 'Live probe status is passive and excludes account and session identifiers',
    existing: 'The live probe cannot create over or clean up a preexisting Jam',
    lifecycle: 'The live probe cleans up only the owned Jam it explicitly created',
    replacement: 'A replaced Jam cannot be removed by the earlier test cleanup lease',
    uncertain: 'Unknown creation outcomes never invent a cleanup lease',
    privateGrant: 'Private native grant IPC projects only the four credential fields',
    rejectedGrant: 'Private native grant rejection and malformed output never expose native error text' }) });
async function fixture(existing = false) {
  const response = { session: { identifier: Fixture.session, ownedByCurrentAccount: true, active: true, participants: [] },
    invitation: { address: Fixture.invitation, joinToken: Fixture.token } };
  const state = { current: existing ? response : null, failure: null };
  const calls = { creates: Fixture.zero, ends: [] };
  const protocol = { readCurrentAccount: async () => state.current,
    createOrActivate: async () => { calls.creates += Fixture.one; if (state.failure) throw state.failure; state.current = response; return response; },
    end: async identifier => { calls.ends.push(identifier); state.current = null; } };
  const sessions = new library.JamSessionClient(); sessions.attachAccount(Fixture.account, protocol);
  let sequence = Fixture.zero;
  return { sessions, state, calls, response,
    probe: new SpotifyJamLiveProbe({ sessions }, () => Fixture.requestPrefix + (sequence += Fixture.one)) };
}
test(Fixture.names.passive, async () => { const current = await fixture(true); const status = await current.probe.status();
  assert.equal(status.present, true); assert.equal(current.calls.creates, Fixture.zero); assert.deepEqual(current.calls.ends, []);
  assert.equal(JSON.stringify(status).includes(Fixture.account), false); assert.equal(JSON.stringify(status).includes(Fixture.session), false);
});
test(Fixture.names.existing, async () => { const current = await fixture(true); await current.probe.create(); await current.probe.end();
  assert.equal(current.calls.creates, Fixture.zero); assert.deepEqual(current.calls.ends, []);
});
test(Fixture.names.lifecycle, async () => { const current = await fixture(); assert.equal((await current.probe.create()).present, true);
  assert.equal(current.probe.invitation(), Fixture.invitation); assert.deepEqual(await current.probe.end(), { ended: true });
  await current.probe.end(); assert.deepEqual(current.calls.ends, [Fixture.session]);
});
test(Fixture.names.replacement, async () => { const current = await fixture(); await current.probe.create();
  current.state.current = { ...current.response, session: { ...current.response.session, identifier: Fixture.otherSession } };
  assert.deepEqual(await current.probe.end(), { ended: false }); assert.deepEqual(current.calls.ends, []);
});
test(Fixture.names.uncertain, async () => { const current = await fixture(); current.state.failure = new library.IntegrationFailure(library.IntegrationFailureCode.UnknownOutcome);
  await assert.rejects(current.probe.create(), failure => failure.code === library.IntegrationFailureCode.UnknownOutcome);
  await current.probe.end(); assert.deepEqual(current.calls.ends, []);
});
test(Fixture.names.privateGrant, () => { const fields = { accountIdentifier: Fixture.account, accessToken: Fixture.token,
  storedCredential: Fixture.stored, expiresAtMilliseconds: Fixture.expiryMilliseconds };
  assert.deepEqual(parseNativeGrant(JSON.stringify({ ...fields, message: Fixture.privateFailure })), fields);
});
test(Fixture.names.rejectedGrant, () => { for (const [serialized, expected] of [
  [JSON.stringify({ failure: library.IntegrationFailureCode.NativeTokenRejected, message: Fixture.privateFailure }), library.IntegrationFailureCode.NativeTokenRejected],
  [Fixture.malformed, library.IntegrationFailureCode.InvalidResponse]]) {
  assert.throws(() => parseNativeGrant(serialized), failure => failure instanceof library.IntegrationFailure
    && failure.code === expected && !failure.message.includes(Fixture.privateFailure));
} });
