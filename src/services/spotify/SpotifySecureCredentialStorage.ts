import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { SpotifyAccountCredentialStorage } from 'streaming-service-spotify-jam';

export interface SpotifySecureCredentialPlatform {
  read(service: string): Promise<{ readonly username: string; readonly password: string } | null>;
  write(service: string, owner: string, serialized: string): Promise<boolean>;
  clear(service: string): Promise<boolean>;
}

export interface SpotifyCredentialRevocations {
  isRevoked(service: string): Promise<boolean>;
  revoke(service: string): Promise<void>;
  allow(service: string): Promise<void>;
}

const StoragePolicy = Object.freeze({ servicePrefix: 'StreamingService.SpotifyLogin.', maximumAccountCharacters: 512,
  maximumCredentialCharacters: 65536 });

export class SpotifySecureCredentialStorage implements SpotifyAccountCredentialStorage {
  constructor(private readonly platform: SpotifySecureCredentialPlatform, private readonly revocations: SpotifyCredentialRevocations) {}

  async read(accountIdentifier: string, cancellation: AbortSignal): Promise<string | null> {
    try {
      this.checkCancellation(cancellation);
      const service = this.service(accountIdentifier);
      if (await this.revocations.isRevoked(service)) { this.checkCancellation(cancellation); return null; }
      this.checkCancellation(cancellation);
      const value = await this.platform.read(service);
      this.checkCancellation(cancellation);
      if (value === null) return null;
      if (value.username !== accountIdentifier || value.password.length > StoragePolicy.maximumCredentialCharacters) {
        throw new IntegrationFailure(IntegrationFailureCode.CredentialStorage);
      }
      return value.password;
    } catch (failure) { throw this.failure(failure); }
  }

  async write(accountIdentifier: string, serialized: string, cancellation: AbortSignal): Promise<void> {
    try {
      this.checkCancellation(cancellation);
      if (serialized.length > StoragePolicy.maximumCredentialCharacters) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
      const service = this.service(accountIdentifier);
      const success = await this.platform.write(service, accountIdentifier, serialized);
      this.checkCancellation(cancellation);
      if (!success) throw new IntegrationFailure(IntegrationFailureCode.CredentialStorage);
      await this.revocations.allow(service);
      this.checkCancellation(cancellation);
    } catch (failure) { throw this.failure(failure); }
  }

  async clear(accountIdentifier: string): Promise<void> {
    try {
      const service = this.service(accountIdentifier);
      await this.revocations.revoke(service);
      const removed = await this.platform.clear(service);
      if (!removed && await this.platform.read(service) !== null) throw new IntegrationFailure(IntegrationFailureCode.CredentialStorage);
    } catch (failure) { throw this.failure(failure); }
  }

  private service(accountIdentifier: string): string {
    if (!accountIdentifier.trim() || accountIdentifier.length > StoragePolicy.maximumAccountCharacters) {
      throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    }
    return StoragePolicy.servicePrefix + encodeURIComponent(accountIdentifier);
  }

  private checkCancellation(cancellation: AbortSignal): void {
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
  }

  private failure(failure: unknown): IntegrationFailure {
    return failure instanceof IntegrationFailure ? failure : new IntegrationFailure(IntegrationFailureCode.CredentialStorage);
  }
}
