export const SpotifyListeningCountryPolicy = Object.freeze({
  empty: '',
  pattern: /^[A-Z]{2}$/,
});
export interface SpotifyListeningCountryDependencies {
  readonly deviceRegion: () => string | null;
  readonly read: (accountIdentifier: string) => Promise<string | null>;
  readonly write: (accountIdentifier: string, country: string) => Promise<void>;
}
export function normalizeSpotifyListeningCountry(value: string | null): string {
  const normalized = value?.trim().toUpperCase() ?? SpotifyListeningCountryPolicy.empty;
  return SpotifyListeningCountryPolicy.pattern.test(normalized)
    ? normalized
    : SpotifyListeningCountryPolicy.empty;
}
export class SpotifyListeningCountryStore {
  private country: string;
  private accountIdentifier: string | null = null;
  private lifetime = {};
  private revision = {};
  private writes = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  constructor(private readonly dependencies: SpotifyListeningCountryDependencies) {
    this.country = this.fallback();
  }
  readonly getSnapshot = (): string => this.country;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  async setAccount(accountIdentifier: string | null): Promise<void> {
    if (this.accountIdentifier === accountIdentifier) return;
    this.accountIdentifier = accountIdentifier;
    const lifetime = {};
    const revision = {};
    this.lifetime = lifetime;
    this.revision = revision;
    this.country = this.fallback();
    this.publish();
    if (accountIdentifier === null) return;
    try {
      const country = normalizeSpotifyListeningCountry(await this.dependencies.read(accountIdentifier));
      if (this.lifetime !== lifetime || this.revision !== revision || !country) return;
      this.country = country;
      this.publish();
    } catch {}
  }
  readonly set = (value: string): void => {
    this.revision = {};
    this.country = normalizeSpotifyListeningCountry(value);
    this.publish();
    const accountIdentifier = this.accountIdentifier;
    const country = this.country;
    if (accountIdentifier === null || !country) return;
    this.writes = this.writes.then(() => this.dependencies.write(accountIdentifier, country)).catch(() => undefined);
  };
  private fallback(): string {
    try { return normalizeSpotifyListeningCountry(this.dependencies.deviceRegion()); }
    catch { return SpotifyListeningCountryPolicy.empty; }
  }
  private publish(): void {
    this.listeners.forEach(listener => { try { listener(); } catch {} });
  }
}
