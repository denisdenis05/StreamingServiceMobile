import { Linking } from 'react-native';
export const DeepLinkEvents = Object.freeze({
  lastFmCallback: 'lastfm_callback',
  lastFmFailure: 'lastfm_failure',
  notification: 'notification_click',
});
const DeepLinkPolicy = Object.freeze({
  notificationPrefix: 'trackplayer://notification.click',
  schemeDelimiter: '://',
  applicationScheme: 'streamingservice',
  queryDelimiter: '?',
  callbackPath: 'lastfm/callback',
  tokenParameter: 'token',
  errorParameter: 'error',
  urlEvent: 'url' as const,
});
type Listener = (eventType: string, eventData: Record<string, string>) => void;
export interface DeepLinkSource {
  subscribe(listener: (address: string) => void): { remove(): void };
  initialAddress(): Promise<string | null>;
}
export class ApplicationDeepLinkHandler {
  private readonly listeners = new Set<Listener>();
  private readonly linkingListener: { remove(): void };
  constructor(source: DeepLinkSource) {
    this.linkingListener = source.subscribe(address =>
      this.handleDeepLink(address),
    );
    void source
      .initialAddress()
      .then(address => {
        if (address !== null) this.handleDeepLink(address);
      })
      .catch(() => undefined);
  }
  addListener(callback: Listener): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
  cleanup(): void {
    this.linkingListener.remove();
    this.listeners.clear();
  }
  private handleDeepLink(address: string): void {
    if (address.startsWith(DeepLinkPolicy.notificationPrefix)) {
      this.notify(DeepLinkEvents.notification, {});
      return;
    }
    const [scheme, remainingAddress] = address.split(
      DeepLinkPolicy.schemeDelimiter,
    );
    if (scheme !== DeepLinkPolicy.applicationScheme || !remainingAddress)
      return;
    const [path, queryString] = remainingAddress.split(
      DeepLinkPolicy.queryDelimiter,
    );
    if (path !== DeepLinkPolicy.callbackPath || !queryString) return;
    const query = new URLSearchParams(queryString);
    const error = query.get(DeepLinkPolicy.errorParameter);
    if (error) {
      this.notify(DeepLinkEvents.lastFmFailure, {});
      return;
    }
    const token = query.get(DeepLinkPolicy.tokenParameter);
    if (token) this.notify(DeepLinkEvents.lastFmCallback, { token });
  }
  private notify(eventType: string, eventData: Record<string, string>): void {
    this.listeners.forEach(callback => {
      try {
        callback(eventType, eventData);
      } catch {}
    });
  }
}
export default new ApplicationDeepLinkHandler({
  subscribe: listener =>
    Linking.addEventListener(DeepLinkPolicy.urlEvent, event =>
      listener(event.url),
    ),
  initialAddress: () => Linking.getInitialURL(),
});
