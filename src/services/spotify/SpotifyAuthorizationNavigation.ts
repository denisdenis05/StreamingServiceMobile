import { SpotifyAuthenticationAction } from './SpotifyMobileController';

export class SpotifyAuthorizationNavigation {
  private handled = false;

  constructor(private readonly navigate: () => void) {}

  update(authenticationAction: SpotifyAuthenticationAction | undefined, navigationReady: boolean, accountReady: boolean): void {
    if (authenticationAction !== SpotifyAuthenticationAction.Resume) { this.handled = false; return; }
    if (!navigationReady || !accountReady || this.handled) return;
    this.handled = true;
    try { this.navigate(); } catch { this.handled = false; }
  }
}
