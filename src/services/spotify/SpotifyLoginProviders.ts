import { hasSavedLibrespotLogin, IntegrationFailure, IntegrationFailureCode, LibrespotLoginSession,
  loadSpotifyAuthorizationConfiguration, loadSpotifyLoginConfiguration } from 'streaming-service-spotify-jam';
import type { Clock, LibrespotAuthentication, LibrespotLoginInput, SpotifyLoginConfiguration,
  SpotifyLoginCredentialStore, SpotifyLoginProvider, SpotifyLoginStage } from 'streaming-service-spotify-jam';

interface AccountCredentialOwnership {
  acquire(accountIdentifier: string): SpotifyLoginCredentialStore;
  forget(accountIdentifier: string): Promise<void>;
}

export interface SpotifyLoginProvidersDependencies {
  readonly librespot: AccountCredentialOwnership;
  readonly oauth: AccountCredentialOwnership;
  readonly authorization: AccountCredentialOwnership;
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

  createBrowserLogin(accountIdentifier: string, configuration: SpotifyLoginConfiguration, progress?: (stage: SpotifyLoginStage) => void): SpotifyLoginProvider {
    return this.dependencies.createBrowserLogin(configuration, this.dependencies.oauth.acquire(accountIdentifier),
      this.dependencies.authorization.acquire(accountIdentifier), progress);
  }

  async restore(accountIdentifier: string, cancellation: AbortSignal, progress?: (stage: SpotifyLoginStage) => void): Promise<SpotifyLoginProvider | null> {
    const librespotStore = this.dependencies.librespot.acquire(accountIdentifier);
    if (await hasSavedLibrespotLogin(librespotStore, cancellation)) return this.librespotProvider(librespotStore, progress);
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
    const owners = [this.dependencies.librespot, this.dependencies.oauth, this.dependencies.authorization];
    const results = await Promise.allSettled(owners.map(async owner => owner.forget(accountIdentifier)));
    if (results.some(result => result.status === RejectedCleanupStatus)) throw new IntegrationFailure(IntegrationFailureCode.CredentialStorage);
  }

  private librespotProvider(credentialStore: SpotifyLoginCredentialStore, progress?: (stage: SpotifyLoginStage) => void,
    input?: LibrespotLoginInput): LibrespotLoginSession {
    return new LibrespotLoginSession({ authentication: this.dependencies.authentication, credentialStore,
      clock: this.dependencies.clock, ...(progress === undefined ? {} : { onProgress: progress }) }, input);
  }
}
