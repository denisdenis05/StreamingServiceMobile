import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { SpotifyLoginBrowser } from 'streaming-service-spotify-jam';

export interface SpotifyBrowserPlatform {
  isAvailable(): Promise<boolean>;
  openAuthorization(address: string, redirectAddress: string): Promise<{ readonly type: string; readonly url?: string }>;
  closeAuthorization(): void;
}
const BrowserPolicy = Object.freeze({ success: 'success', abortEvent: 'abort' });

export class SpotifyLoginBrowserAdapter implements SpotifyLoginBrowser {
  constructor(private readonly platform: SpotifyBrowserPlatform) {}

  async authorize(address: string, redirectAddress: string, cancellation: AbortSignal): Promise<string> {
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    if (!await this.platform.isAvailable()) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    const abort = () => { try { this.platform.closeAuthorization(); } catch {} };
    cancellation.addEventListener(BrowserPolicy.abortEvent, abort, { once: true });
    try {
      const result = await this.platform.openAuthorization(address, redirectAddress);
      if (cancellation.aborted || result.type !== BrowserPolicy.success) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      if (!result.url) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      return result.url;
    } catch (failure) {
      if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      throw failure instanceof IntegrationFailure ? failure : new IntegrationFailure(IntegrationFailureCode.Network);
    } finally { cancellation.removeEventListener(BrowserPolicy.abortEvent, abort); }
  }
}
