import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { SpotifyLoginBrowser } from 'streaming-service-spotify-jam';
import type { Scheduler } from 'streaming-service-spotify-jam';
import { URL } from 'react-native-url-polyfill';

export interface SpotifyBrowserPlatform {
  isAvailable(): Promise<boolean>;
  openAuthorization(address: string, redirectAddress: string): Promise<{ readonly type: string; readonly url?: string }>;
  closeAuthorization(): void;
  prepareAuthorization?(): Promise<void>;
  observeRedirects?(listener: (address: string) => void): () => void;
  readInitialAddress?(): Promise<string | null>;
}
export const SpotifyBrowserPolicy = Object.freeze({ success: 'success', abortEvent: 'abort', stateParameter: 'state',
  singleStateCount: 1, redirectGraceMilliseconds: 1500, redirectProbeMilliseconds: 100 });

export enum SpotifyAuthorizationReturnStatus {
  NotReceived = 'not-received', InvalidAddress = 'invalid-address', RedirectMismatch = 'redirect-mismatch',
  MissingState = 'missing-state', DuplicateState = 'duplicate-state', StateMismatch = 'state-mismatch',
  UnsafeAddress = 'unsafe-address', Accepted = 'accepted',
}

export class SpotifyLoginBrowserAdapter implements SpotifyLoginBrowser {
  private active = false;
  private pendingBrowser: Promise<unknown> | null = null;
  private returnStatus = SpotifyAuthorizationReturnStatus.NotReceived;

  constructor(private readonly platform: SpotifyBrowserPlatform, private readonly scheduler?: Scheduler) {}
  isAuthorizing(): boolean { return this.active || this.pendingBrowser !== null; }
  getReturnStatus(): SpotifyAuthorizationReturnStatus { return this.returnStatus; }

  async authorize(address: string, redirectAddress: string, cancellation: AbortSignal): Promise<string> {
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    if (this.active || this.pendingBrowser) throw new IntegrationFailure(IntegrationFailureCode.Backpressure);
    this.active = true;
    this.returnStatus = SpotifyAuthorizationReturnStatus.NotReceived;
    try {
      if (!await this.platform.isAvailable()) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
      if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      await this.platform.prepareAuthorization?.();
      if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      if (this.platform.observeRedirects && this.platform.readInitialAddress && this.scheduler) {
        return await this.authorizeCaptured(address, redirectAddress, cancellation);
      }
      return await this.authorizeNative(address, redirectAddress, cancellation);
    } catch (failure) {
      throw failure instanceof IntegrationFailure ? failure : new IntegrationFailure(IntegrationFailureCode.Network);
    } finally { this.active = false; }
  }

  private async authorizeNative(address: string, redirectAddress: string, cancellation: AbortSignal): Promise<string> {
    const abort = () => { try { this.platform.closeAuthorization(); } catch {} };
    cancellation.addEventListener(SpotifyBrowserPolicy.abortEvent, abort, { once: true });
    try {
      const result = await this.platform.openAuthorization(address, redirectAddress);
      if (cancellation.aborted || result.type !== SpotifyBrowserPolicy.success) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      if (!result.url) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      return result.url;
    } catch (failure) {
      if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      throw failure instanceof IntegrationFailure ? failure : new IntegrationFailure(IntegrationFailureCode.Network);
    } finally { cancellation.removeEventListener(SpotifyBrowserPolicy.abortEvent, abort); }
  }

  private async authorizeCaptured(address: string, redirectAddress: string, cancellation: AbortSignal): Promise<string> {
    const expected = new URL(redirectAddress);
    const states = new URL(address).searchParams.getAll(SpotifyBrowserPolicy.stateParameter);
    if (states.length !== SpotifyBrowserPolicy.singleStateCount || !states[InitialPosition]) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    const state = states[InitialPosition];
    const cleanup: { stopRedirects: (() => void) | null; cancelDeadline: (() => void) | null; cancelProbe: (() => void) | null }
      = { stopRedirects: null, cancelDeadline: null, cancelProbe: null };
    let settled = false;
    let finishing = false;
    let eventReceived = false;
    let abort: () => void = () => undefined;
    const classify = (value: string): SpotifyAuthorizationReturnStatus => {
      try {
        const callback = new URL(value);
        if (callback.protocol !== expected.protocol || callback.host !== expected.host || callback.pathname !== expected.pathname)
          return SpotifyAuthorizationReturnStatus.RedirectMismatch;
        if (callback.username || callback.password || callback.hash) return SpotifyAuthorizationReturnStatus.UnsafeAddress;
        const callbackStates = callback.searchParams.getAll(SpotifyBrowserPolicy.stateParameter);
        if (callbackStates.length < SpotifyBrowserPolicy.singleStateCount || !callbackStates[InitialPosition]) return SpotifyAuthorizationReturnStatus.MissingState;
        if (callbackStates.length > SpotifyBrowserPolicy.singleStateCount) return SpotifyAuthorizationReturnStatus.DuplicateState;
        return callbackStates[InitialPosition] === state ? SpotifyAuthorizationReturnStatus.Accepted : SpotifyAuthorizationReturnStatus.StateMismatch;
      } catch { return SpotifyAuthorizationReturnStatus.InvalidAddress; }
    };
    try {
      return await new Promise<string>((resolve, reject) => {
        const finishFailure = (failure: IntegrationFailureCode) => {
          if (settled) return; settled = true; reject(new IntegrationFailure(failure));
        };
        const accept = (value: string, fromEvent: boolean) => {
          if (settled) return;
          const status = classify(value);
          if (fromEvent || !eventReceived || status === SpotifyAuthorizationReturnStatus.Accepted) this.returnStatus = status;
          if (fromEvent) eventReceived = true;
          if (status !== SpotifyAuthorizationReturnStatus.Accepted) return;
          settled = true; resolve(value);
        };
        const probe = async () => {
          if (settled) return;
          try {
            const initial = await this.platform.readInitialAddress!();
            if (initial !== null) accept(initial, false);
          } catch { finishFailure(IntegrationFailureCode.Network); }
          if (!settled && !finishing) cleanup.cancelProbe = this.scheduler!.schedule(SpotifyBrowserPolicy.redirectProbeMilliseconds, () => { void probe(); });
        };
        abort = () => finishFailure(IntegrationFailureCode.Canceled);
        cancellation.addEventListener(SpotifyBrowserPolicy.abortEvent, abort, { once: true });
        cleanup.stopRedirects = this.platform.observeRedirects!(value => accept(value, true));
        if (cancellation.aborted) { abort(); return; }
        const opening = Promise.resolve().then(() => {
          if (settled) return null;
          return this.platform.openAuthorization(address, redirectAddress);
        });
        this.pendingBrowser = opening;
        const releaseBrowser = () => { if (this.pendingBrowser === opening) this.pendingBrowser = null; };
        void opening.then(releaseBrowser, releaseBrowser);
        void opening.then(result => {
          if (settled || result === null) return;
          if (result.type === SpotifyBrowserPolicy.success && result.url) {
            accept(result.url, true);
            if (!settled) finishFailure(IntegrationFailureCode.InvalidResponse);
            return;
          }
          cleanup.cancelDeadline = this.scheduler!.schedule(SpotifyBrowserPolicy.redirectGraceMilliseconds, () => {
            finishing = true;
            void probe().then(() => finishFailure(IntegrationFailureCode.Canceled), () => finishFailure(IntegrationFailureCode.Network));
          });
          void probe();
        }, () => finishFailure(IntegrationFailureCode.Network)).catch(() => finishFailure(IntegrationFailureCode.Network));
      });
    } finally {
      settled = true;
      for (const stop of Object.values(cleanup)) { try { stop?.(); } catch {} }
      cancellation.removeEventListener(SpotifyBrowserPolicy.abortEvent, abort);
      try { this.platform.closeAuthorization(); } catch {}
    }
  }
}

const InitialPosition = 0;
