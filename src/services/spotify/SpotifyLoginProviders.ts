import { hasPendingLibrespotDeviceAuthorization, hasSavedLibrespotLogin, IntegrationFailure, IntegrationFailureCode, LibrespotLoginSession,
  loadSpotifyAuthorizationConfiguration, loadSpotifyLoginConfiguration } from 'streaming-service-spotify-jam';
import type { Clock, LibrespotAuthentication, LibrespotDeviceAuthorizationView, LibrespotLoginInput, LibrespotSessionGrant, SpotifyLoginConfiguration,
  SpotifyLoginCredentialStore, SpotifyLoginProvider, SpotifyLoginStage } from 'streaming-service-spotify-jam';

interface AccountCredentialOwnership {
  acquire(accountIdentifier: string): SpotifyLoginCredentialStore;
  forget(accountIdentifier: string): Promise<void>;
}

export interface SpotifyLoginProvidersDependencies {
  readonly librespot: AccountCredentialOwnership;
  readonly oauth: AccountCredentialOwnership;
  readonly authorization: AccountCredentialOwnership;
  readonly deviceAuthorization: AccountCredentialOwnership;
  readonly createDeviceAuthorization: (accountIdentifier: string, observer?: (authorization: LibrespotDeviceAuthorizationView) => void, progress?: (stage: SpotifyLoginStage) => void) => {
    authorize(cancellation: AbortSignal): Promise<LibrespotSessionGrant>;
    resume(cancellation: AbortSignal): Promise<LibrespotSessionGrant>;
  };
  readonly authentication: LibrespotAuthentication;
  readonly clock: Clock;
  readonly createBrowserLogin: (configuration: SpotifyLoginConfiguration, credentialStore: SpotifyLoginCredentialStore,
    authorizationStore: SpotifyLoginCredentialStore, progress?: (stage: SpotifyLoginStage) => void) => SpotifyLoginProvider;
}

const RejectedCleanupStatus = 'rejected';

export class SpotifyLoginProviders {
  constructor(private readonly dependencies: SpotifyLoginProvidersDependencies) {}

  createLibrespot(accountIdentifier: string, input: LibrespotLoginInput, progress?: (stage: SpotifyLoginStage) => void): SpotifyLoginProvider {
    return this.librespotProvider(this.dependencies.librespot.acquire(accountIdentifier), progress, input);
  }

  createDeviceLogin(accountIdentifier: string, progress?: (stage: SpotifyLoginStage) => void,
    observer?: (authorization: LibrespotDeviceAuthorizationView) => void): LibrespotLoginSession {
    const authorization = this.dependencies.createDeviceAuthorization(accountIdentifier, observer, progress);
    return new LibrespotLoginSession({ authentication: this.dependencies.authentication,
      credentialStore: this.dependencies.librespot.acquire(accountIdentifier), clock: this.dependencies.clock,
      ...(progress === undefined ? {} : { onProgress: progress }),
      authorize: cancellation => authorization.authorize(cancellation),
      resumeAuthorization: cancellation => authorization.resume(cancellation) });
  }

  createBrowserLogin(accountIdentifier: string, configuration: SpotifyLoginConfiguration, progress?: (stage: SpotifyLoginStage) => void): SpotifyLoginProvider {
    return this.dependencies.createBrowserLogin(configuration, this.dependencies.oauth.acquire(accountIdentifier),
      this.dependencies.authorization.acquire(accountIdentifier), progress);
  }

  async restore(accountIdentifier: string, cancellation: AbortSignal, progress?: (stage: SpotifyLoginStage) => void,
    observer?: (authorization: LibrespotDeviceAuthorizationView) => void): Promise<SpotifyLoginProvider | null> {
    const librespotStore = this.dependencies.librespot.acquire(accountIdentifier);
    if (await hasSavedLibrespotLogin(librespotStore, cancellation)) return this.librespotProvider(librespotStore, progress);
    if (await hasPendingLibrespotDeviceAuthorization(this.dependencies.deviceAuthorization.acquire(accountIdentifier), this.dependencies.clock, cancellation))
      return this.createDeviceLogin(accountIdentifier, progress, observer);
    const credentialStore = this.dependencies.oauth.acquire(accountIdentifier);
    const configuration = await loadSpotifyLoginConfiguration(credentialStore, cancellation);
    return configuration === null ? null : this.dependencies.createBrowserLogin(configuration, credentialStore,
      this.dependencies.authorization.acquire(accountIdentifier), progress);
  }

  async resume(accountIdentifier: string, cancellation: AbortSignal, progress?: (stage: SpotifyLoginStage) => void): Promise<SpotifyLoginProvider | null> {
    const authorizationStore = this.dependencies.authorization.acquire(accountIdentifier);
    const configuration = await loadSpotifyAuthorizationConfiguration(authorizationStore, cancellation);
    return configuration === null ? null : this.dependencies.createBrowserLogin(configuration, this.dependencies.oauth.acquire(accountIdentifier), authorizationStore, progress);
  }

  async forget(accountIdentifier: string): Promise<void> {
    const owners = [this.dependencies.librespot, this.dependencies.oauth, this.dependencies.authorization, this.dependencies.deviceAuthorization];
    const results = await Promise.allSettled(owners.map(async owner => owner.forget(accountIdentifier)));
    if (results.some(result => result.status === RejectedCleanupStatus)) throw new IntegrationFailure(IntegrationFailureCode.CredentialStorage);
  }

  private librespotProvider(credentialStore: SpotifyLoginCredentialStore, progress?: (stage: SpotifyLoginStage) => void,
    input?: LibrespotLoginInput): LibrespotLoginSession {
    return new LibrespotLoginSession({ authentication: this.dependencies.authentication, credentialStore,
      clock: this.dependencies.clock, ...(progress === undefined ? {} : { onProgress: progress }) }, input);
  }
}
