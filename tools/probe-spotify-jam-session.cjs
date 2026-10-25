const Imports = Object.freeze({ readline: 'node:readline', timers: 'node:timers/promises', library: 'streaming-service-spotify-jam',
  deviceProbe: './probe-spotify-device-login.cjs', url: './fixtures/spotify-url.cjs', gateway: '../.build/spotify/SpotifyMobileGateway' });
const readline = require(Imports.readline);
const { setTimeout: wait } = require(Imports.timers);
const library = require(Imports.library);
const { memoryAuthorizationStore, createDeviceAuthorization, authorizeWithRecovery, nativeSessionGrant } = require(Imports.deviceProbe);

const Policy = Object.freeze({ status: 'status', create: 'create', share: 'share', end: 'end', quit: 'quit', restore: 'restore',
  requestPrefix: 'live-jam-', initialSequence: 0, increment: 1, emptyCount: 0, catalogIdentity: 'diagnostic-unused-catalog',
  stage: 'jam-probe', success: 'success', failureExitCode: 1, interruptSignal: 'SIGINT', terminationSignal: 'SIGTERM' });
const Copy = Object.freeze({ ready: 'Signed in. Commands: status, create, share, end, restore, quit. Creation is explicit; quit cleans up only this test’s Jam.',
  existing: 'A Jam already exists. This probe will not create over it or end it.',
  noOwned: 'This probe has no test Jam to end.', invitationPrefix: 'Test Jam invitation: ' });

class SpotifyJamLiveProbe {
  constructor(runtime, nextIdentifier) { this.runtime = runtime; this.nextIdentifier = nextIdentifier; this.createdIdentifier = null; }

  async status() {
    const result = await this.runtime.sessions.refreshCurrentSession(this.nextIdentifier());
    this.requireApplied(result);
    const session = this.runtime.sessions.getSnapshot().session;
    return { present: session !== null, owned: session?.ownedByCurrentAccount ?? false, active: session?.active ?? false,
      hasHostDevice: Boolean(session?.hostDeviceIdentifier), participantCount: session?.participants.length ?? Policy.emptyCount };
  }

  async create() {
    const current = await this.status();
    if (current.present) return { ...current, message: Copy.existing };
    this.requireApplied(await this.runtime.sessions.createOrActivateSession(this.nextIdentifier()));
    const session = this.runtime.sessions.getSnapshot().session;
    if (!session?.ownedByCurrentAccount) throw new library.IntegrationFailure(library.IntegrationFailureCode.InvalidResponse);
    this.createdIdentifier = session.identifier;
    return this.status();
  }

  invitation() { return this.runtime.sessions.getInvitation()?.address ?? null; }

  async end() {
    if (this.createdIdentifier === null) return { ended: false, message: Copy.noOwned };
    await this.status();
    const session = this.runtime.sessions.getSnapshot().session;
    if (!session || session.identifier !== this.createdIdentifier || !session.ownedByCurrentAccount) {
      this.createdIdentifier = null;
      return { ended: false };
    }
    this.requireApplied(await this.runtime.sessions.endSession(this.nextIdentifier()));
    this.createdIdentifier = null;
    return { ended: true };
  }

  requireApplied(receipt) {
    if (!receipt.applied) throw new library.IntegrationFailure(receipt.failure ?? library.IntegrationFailureCode.Network);
  }
}

function printFailure(failure) {
  console.log(JSON.stringify({ stage: Policy.stage, code: failure instanceof library.IntegrationFailure
    ? failure.code : library.IntegrationFailureCode.Network }));
}

async function main() {
  require(Imports.url);
  const { SpotifyMobileGateway } = require(Imports.gateway);
  const cancellation = new AbortController();
  const pendingStore = memoryAuthorizationStore();
  const savedStore = memoryAuthorizationStore();
  const authorization = createDeviceAuthorization((token, signal) => nativeSessionGrant(token, false, signal), pendingStore);
  const login = new library.LibrespotLoginSession({ clock: { nowMilliseconds: () => Date.now() }, credentialStore: savedStore,
    authentication: { login: async () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.Unsupported); },
      restore: (credential, signal) => nativeSessionGrant(credential, true, signal) },
    authorize: signal => authorizeWithRecovery({ broker: authorization, store: pendingStore, cancellation: signal,
      wait: (delayMilliseconds, cancellation) => wait(delayMilliseconds, undefined, { signal: cancellation }),
      onRecovery: code => console.log(JSON.stringify({ stage: Policy.stage, code, resuming: true })) }) });
  let runtime = null;
  let probe = null;
  let sequence = Policy.initialSequence;
  const nextIdentifier = () => Policy.requestPrefix + (sequence += Policy.increment);
  try {
    const credential = await login.login(cancellation.signal);
    const scheduler = new library.SystemScheduler();
    const requests = new library.FetchHttpExecutor(scheduler);
    const gateway = new SpotifyMobileGateway(requests);
    runtime = new library.SpotifyJamRuntime({ accountIdentifier: credential.accountIdentifier, credentials: login,
      endpoints: { resolveServiceOrigin: signal => gateway.resolveServiceOrigin(signal) }, requests,
      clock: { nowMilliseconds: () => Date.now() }, playbackClock: { nowMonotonicMilliseconds: () => performance.now() },
      associations: new library.MemoryAssociationStore(), recordings: { identity: Policy.catalogIdentity,
        namespace: library.RecordingNamespace.Local, lookup: async () => null, search: async () => [] },
      enableHostedPlaybackCommands: true, experimentalMembership: true, enableHostedQueue: true });
    probe = new SpotifyJamLiveProbe(runtime, nextIdentifier);
    console.log(Copy.ready);
    console.log(JSON.stringify(await probe.status()));
    const input = readline.createInterface({ input: process.stdin });
    const closeInput = () => input.close();
    process.once(Policy.interruptSignal, closeInput); process.once(Policy.terminationSignal, closeInput);
    try {
      for await (const command of input) {
        try {
          if (command === Policy.quit) break;
          if (command === Policy.status) console.log(JSON.stringify(await probe.status()));
          if (command === Policy.create) console.log(JSON.stringify(await probe.create()));
          if (command === Policy.share) {
            const address = probe.invitation();
            if (address !== null) console.log(Copy.invitationPrefix + address);
          }
          if (command === Policy.end) console.log(JSON.stringify(await probe.end()));
          if (command === Policy.restore) {
            await login.restore(cancellation.signal);
            console.log(JSON.stringify({ stage: Policy.restore, status: Policy.success }));
          }
        } catch (failure) { printFailure(failure); }
      }
    } finally {
      process.removeListener(Policy.interruptSignal, closeInput); process.removeListener(Policy.terminationSignal, closeInput); input.close();
    }
  } catch (failure) { printFailure(failure); process.exitCode = Policy.failureExitCode;
  } finally {
    if (probe) { try { console.log(JSON.stringify(await probe.end())); } catch (failure) { printFailure(failure); } }
    runtime?.dispose(); login.dispose(); await savedStore.clear(); await pendingStore.clear();
  }
}

module.exports = { SpotifyJamLiveProbe };
if (require.main === module) void main();
