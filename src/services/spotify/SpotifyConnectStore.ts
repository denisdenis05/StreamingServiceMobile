import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { SpotifyLoginProvider } from 'streaming-service-spotify-jam';

export enum SpotifyConnectStatus {
  Detached = 'detached', Connecting = 'connecting', Ready = 'ready', Reconnecting = 'reconnecting', Failed = 'failed',
}

export interface SpotifyConnectSnapshot {
  readonly status: SpotifyConnectStatus;
  readonly deviceIdentifier: string | null;
  readonly generation: number;
  readonly failure: IntegrationFailureCode | null;
}

export interface SpotifyConnectNative {
  start(identifier: string, serialized: string): Promise<number>;
  close(identifier: string): Promise<void>;
  refresh(identifier: string, generation: number): Promise<void>;
}

export interface SpotifyConnectDependencies {
  readonly native: () => SpotifyConnectNative | null;
  readonly observe: (listener: (event: unknown) => void) => () => void;
  readonly nextIdentifier: () => string;
  readonly membershipChanged?: () => void;
}

const Policy = Object.freeze({ zero: 0, firstGeneration: 1, stringType: 'string', objectType: 'object',
  booleanType: 'boolean', maximumRequestIdentifierCharacters: 128,
  abortEvent: 'abort', deviceName: 'StreamingService', maximumBatchCharacters: 2097152, maximumBatchEvents: 4,
  maximumIdentifierCharacters: 2048, controlPattern: /[\u0000-\u0020\u007f]/,
  connecting: 'connecting', registered: 'registered', cluster: 'cluster', reconnecting: 'reconnecting',
  stopped: 'stopped', membership: 'membership', sessionMessage: 'sessionMessage', command: 'command' } as const);
const RegistrationSource = Object.freeze({ cluster: 'cluster', deviceStatus: 'deviceStatus' } as const);
const FailureCodes = new Set<string>(Object.values(IntegrationFailureCode));
const EmptySnapshot: SpotifyConnectSnapshot = Object.freeze({ status: SpotifyConnectStatus.Detached,
  deviceIdentifier: null, generation: Policy.zero, failure: null });

interface Binding {
  readonly identifier: string;
  readonly accountIdentifier: string;
  readonly cancellation: AbortController;
  readonly externalCancellation: AbortSignal;
  readonly abort: () => void;
  native: SpotifyConnectNative | null;
  handle: number | null;
  dispatched: boolean;
  stopObservation: (() => void) | null;
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== Policy.objectType || Array.isArray(value)) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== Policy.stringType || !(value as string).length || (value as string).length > Policy.maximumIdentifierCharacters
    || Policy.controlPattern.test(value as string)) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
  return value as string;
}
function natural(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < Policy.zero) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
  return value as number;
}
function failureCode(failure: unknown): IntegrationFailureCode {
  let code: unknown;
  try { code = object(failure).code; } catch {}
  return typeof code === Policy.stringType && FailureCodes.has(code as string) ? code as IntegrationFailureCode : IntegrationFailureCode.Network;
}

export class SpotifyConnectStore {
  private snapshot = EmptySnapshot;
  private readonly listeners = new Set<() => void>();
  private binding: Binding | null = null;
  private cleanup: Promise<void> = Promise.resolve();
  private readonly retiring = new Set<Binding>();

  constructor(private readonly dependencies: SpotifyConnectDependencies) {}

  readonly getSnapshot = (): SpotifyConnectSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  async attach(provider: SpotifyLoginProvider, accountIdentifier: string, cancellation: AbortSignal): Promise<void> {
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    let requestIdentifier: string;
    let selectedAccountIdentifier: string;
    try {
      requestIdentifier = identifier(this.dependencies.nextIdentifier());
      selectedAccountIdentifier = identifier(accountIdentifier);
      if (requestIdentifier.length > Policy.maximumRequestIdentifierCharacters) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    } catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidInput); }
    const retired = this.binding;
    if (retired) { this.binding = null; this.cleanup = this.retire(retired); }
    else this.cleanup = this.drainRetired();
    const binding: Binding = { identifier: requestIdentifier, accountIdentifier: selectedAccountIdentifier,
      cancellation: new AbortController(), externalCancellation: cancellation, abort: () => {
        if (this.binding === binding) void this.detach().catch(() => undefined);
      }, native: null, handle: null, dispatched: false, stopObservation: null };
    this.binding = binding;
    cancellation.addEventListener(Policy.abortEvent, binding.abort, { once: true });
    this.publish({ ...EmptySnapshot, status: SpotifyConnectStatus.Connecting });
    try {
      await this.cleanup;
      this.requireCurrent(binding);
      if (!provider.getNativeSessionCredential) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
      const credential = await provider.getNativeSessionCredential(binding.cancellation.signal);
      this.requireCurrent(binding);
      if (credential.accountIdentifier !== accountIdentifier) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
      const native = this.dependencies.native();
      if (native === null) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
      binding.native = native;
      binding.stopObservation = this.dependencies.observe(event => this.accept(binding, event));
      this.requireCurrent(binding);
      binding.dispatched = true;
      const handle = natural(await native.start(binding.identifier, JSON.stringify({ accountIdentifier,
        storedCredential: credential.storedCredential, configuration: { name: Policy.deviceName, playbackReady: false } })));
      if (handle < Policy.firstGeneration || binding.handle !== null && binding.handle !== handle) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      this.requireCurrent(binding);
      binding.handle = handle;
    } catch (failure) {
      if (this.binding === binding) {
        this.binding = null;
        this.cleanup = this.retire(binding);
        void this.cleanup.catch(() => undefined);
        this.publish({ ...EmptySnapshot, status: SpotifyConnectStatus.Failed, failure: failureCode(failure) });
      }
      throw new IntegrationFailure(failureCode(failure));
    }
  }

  async refresh(): Promise<void> {
    const binding = this.binding;
    if (!binding?.native || this.snapshot.generation < Policy.firstGeneration) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
    try {
      await binding.native.refresh(binding.identifier, this.snapshot.generation);
      this.requireCurrent(binding);
    } catch (failure) { throw new IntegrationFailure(failureCode(failure)); }
  }

  detach(): Promise<void> {
    const binding = this.binding;
    this.binding = null;
    this.cleanup = binding ? this.retire(binding) : this.drainRetired();
    const cleanup = this.cleanup;
    if (this.binding === null) this.publish(EmptySnapshot);
    return cleanup;
  }

  private retire(binding: Binding): Promise<void> {
    if (binding.dispatched) this.retiring.add(binding);
    const cleanup = this.drainRetired();
    binding.cancellation.abort();
    binding.externalCancellation.removeEventListener(Policy.abortEvent, binding.abort);
    try { binding.stopObservation?.(); } catch {}
    binding.stopObservation = null;
    return cleanup;
  }

  private drainRetired(): Promise<void> {
    const previous = this.cleanup;
    const draining = previous.catch(() => undefined).then(async () => {
      for (const binding of this.retiring) {
        await binding.native?.close(binding.identifier);
        this.retiring.delete(binding);
      }
    }).catch(failure => { throw new IntegrationFailure(failureCode(failure)); });
    this.cleanup = draining;
    return draining;
  }

  private accept(binding: Binding, event: unknown): void {
    if (this.binding !== binding || binding.cancellation.signal.aborted) return;
    try {
      const envelope = object(event);
      if (envelope.identifier !== binding.identifier) return;
      if (envelope.failure !== undefined) throw new IntegrationFailure(typeof envelope.failure === Policy.stringType && FailureCodes.has(envelope.failure as string)
        ? envelope.failure as IntegrationFailureCode : IntegrationFailureCode.Network);
      if (typeof envelope.batch !== Policy.stringType || (envelope.batch as string).length > Policy.maximumBatchCharacters) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      const batch = object(JSON.parse(envelope.batch as string));
      const handle = natural(batch.handle);
      if (handle < Policy.firstGeneration || binding.handle !== null && binding.handle !== handle
        || typeof batch.finished !== Policy.booleanType || !Array.isArray(batch.events) || batch.events.length > Policy.maximumBatchEvents) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      natural(batch.sampledNativeMonotonicMilliseconds);
      binding.handle = handle;
      for (const event of batch.events) { if (this.binding === binding) this.acceptData(binding, object(event)); }
      if (batch.finished && this.binding === binding) {
        this.binding = null; this.cleanup = this.retire(binding);
        this.publish({ ...EmptySnapshot, status: SpotifyConnectStatus.Failed, failure: this.snapshot.failure ?? IntegrationFailureCode.Network });
        void this.cleanup.catch(() => undefined);
      }
    } catch (failure) {
      if (this.binding !== binding) return;
      this.binding = null; this.cleanup = this.retire(binding);
      this.publish({ ...EmptySnapshot, status: SpotifyConnectStatus.Failed,
        failure: failure instanceof IntegrationFailure ? failure.code : IntegrationFailureCode.InvalidResponse });
      void this.cleanup.catch(() => undefined);
    }
  }

  private acceptData(binding: Binding, event: Record<string, unknown>): void {
    const generation = natural(event.generation);
    natural(event.observedMonotonicMilliseconds);
    const data = object(event.data);
    if (generation < this.snapshot.generation) return;
    if (generation > this.snapshot.generation) this.publish({ ...EmptySnapshot, generation, status: SpotifyConnectStatus.Connecting });
    if (this.binding !== binding) return;
    switch (data.type) {
      case Policy.connecting:
        this.publish({ ...EmptySnapshot, generation, status: SpotifyConnectStatus.Connecting }); return;
      case Policy.registered: {
        if (generation < Policy.firstGeneration || data.accountIdentifier !== binding.accountIdentifier) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
        const deviceIdentifier = identifier(data.deviceIdentifier);
        const devices = object(data.cluster).devices;
        if (!Array.isArray(devices) || data.verificationSource !== RegistrationSource.cluster && data.verificationSource !== RegistrationSource.deviceStatus
          || data.verificationSource === RegistrationSource.cluster && !devices.some(device => object(device).identifier === deviceIdentifier)) {
          throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
        }
        this.publish({ status: SpotifyConnectStatus.Ready, generation, deviceIdentifier, failure: null }); return;
      }
      case Policy.reconnecting:
        this.publish({ ...EmptySnapshot, generation, status: SpotifyConnectStatus.Reconnecting,
          failure: typeof data.failure === Policy.stringType && FailureCodes.has(data.failure as string) ? data.failure as IntegrationFailureCode : IntegrationFailureCode.Network }); return;
      case Policy.stopped:
        this.publish({ ...EmptySnapshot, generation, status: SpotifyConnectStatus.Failed,
          failure: typeof data.cleanupFailure === Policy.stringType && FailureCodes.has(data.cleanupFailure as string)
            ? data.cleanupFailure as IntegrationFailureCode : this.snapshot.failure ?? IntegrationFailureCode.Network }); return;
      case Policy.membership:
      case Policy.sessionMessage:
        if (this.snapshot.status === SpotifyConnectStatus.Ready) { try { void Promise.resolve(this.dependencies.membershipChanged?.()).catch(() => undefined); } catch {} }
        return;
      case Policy.cluster:
      case Policy.command: return;
      default: throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    }
  }

  private requireCurrent(binding: Binding): void {
    if (this.binding !== binding || binding.cancellation.signal.aborted || binding.externalCancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
  }

  private publish(snapshot: SpotifyConnectSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    for (const listener of [...this.listeners]) { if (this.listeners.has(listener)) { try { listener(); } catch {} } }
  }
}
