import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { LibrespotAuthentication, LibrespotLoginInput, LibrespotSessionGrant } from 'streaming-service-spotify-jam';

export interface SpotifyLibrespotNative {
  login(requestIdentifier: string, username: string, password: string): Promise<LibrespotSessionGrant>;
  restore(requestIdentifier: string, storedCredential: string): Promise<LibrespotSessionGrant>;
  cancel(requestIdentifier: string): void;
}

export interface SpotifyLibrespotAuthenticationDependencies {
  readonly native: () => SpotifyLibrespotNative | null;
  readonly nextRequestIdentifier: () => string;
}

const RequestPolicy = Object.freeze({ abortEvent: 'abort', maximumIdentifierCharacters: 128,
  objectType: 'object', stringType: 'string', whitespacePattern: /\s/ });
const FailureCodes = new Set<string>(Object.values(IntegrationFailureCode));

export class SpotifyLibrespotAuthentication implements LibrespotAuthentication {
  constructor(private readonly dependencies: SpotifyLibrespotAuthenticationDependencies) {}

  login(input: LibrespotLoginInput, cancellation: AbortSignal): Promise<LibrespotSessionGrant> {
    return this.request((native, requestIdentifier) => native.login(requestIdentifier, input.username, input.password), cancellation);
  }

  restore(storedCredential: string, cancellation: AbortSignal): Promise<LibrespotSessionGrant> {
    return this.request((native, requestIdentifier) => native.restore(requestIdentifier, storedCredential), cancellation);
  }

  private async request(dispatch: (native: SpotifyLibrespotNative, requestIdentifier: string) => Promise<LibrespotSessionGrant>,
    cancellation: AbortSignal): Promise<LibrespotSessionGrant> {
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    let native: SpotifyLibrespotNative | null;
    try { native = this.dependencies.native(); } catch { throw new IntegrationFailure(IntegrationFailureCode.Unsupported); }
    if (native === null) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
    const implementation = native;
    let requestIdentifier: string;
    try { requestIdentifier = this.dependencies.nextRequestIdentifier(); }
    catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidInput); }
    if (!requestIdentifier.trim() || requestIdentifier.length > RequestPolicy.maximumIdentifierCharacters
      || RequestPolicy.whitespacePattern.test(requestIdentifier)) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    return new Promise<LibrespotSessionGrant>((resolve, reject) => {
      let settled = false;
      let dispatched = false;
      const settle = (): boolean => {
        if (settled) return false;
        settled = true; cancellation.removeEventListener(RequestPolicy.abortEvent, abort);
        return true;
      };
      const fail = (failure: unknown) => { if (settle()) reject(this.failure(failure)); };
      const complete = (result: LibrespotSessionGrant | undefined) => {
        if (!settle()) return;
        if (result === undefined) reject(new IntegrationFailure(IntegrationFailureCode.InvalidResponse));
        else resolve(result);
      };
      const abort = () => {
        if (settled) return;
        if (dispatched) { try { implementation.cancel(requestIdentifier); } catch {} }
        fail(new IntegrationFailure(IntegrationFailureCode.Canceled));
      };
      cancellation.addEventListener(RequestPolicy.abortEvent, abort, { once: true });
      if (cancellation.aborted) { abort(); return; }
      void Promise.resolve().then(() => {
        if (settled) return;
        dispatched = true;
        return dispatch(implementation, requestIdentifier);
      }).then(complete, fail);
    });
  }

  private failure(value: unknown): IntegrationFailure {
    let code: unknown;
    try { code = typeof value === RequestPolicy.objectType && value !== null && !Array.isArray(value)
      ? (value as { readonly code?: unknown }).code : undefined; } catch {}
    return new IntegrationFailure(typeof code === RequestPolicy.stringType && FailureCodes.has(code as string)
      ? code as IntegrationFailureCode : IntegrationFailureCode.Network);
  }
}
