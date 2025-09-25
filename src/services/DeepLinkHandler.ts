import { Linking, Alert } from 'react-native';

type Listener = (type: string, data: Record<string, string>) => void;

class DeepLinkHandler {
  private listeners: Listener[] = [];
  private linkingListener: { remove: () => void } | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Listen for deep links when app is already running
    this.linkingListener = Linking.addEventListener('url', event => {
      this.handleDeepLink(event.url);
    });

    // Check if app was opened via deep link
    Linking.getInitialURL().then(url => {
      if (url) this.handleDeepLink(url);
    });
  }

  private handleDeepLink(url: string) {
    console.log('Deep link received:', url);

    const [scheme, rest] = url.split('://');
    if (scheme !== 'streamingservice' || !rest) return;

    const [path, queryString] = rest.split('?');
    if (!queryString) return;

    const params = new URLSearchParams(queryString);

    if (path === 'lastfm/callback') {
      const token = params.get('token');
      const error = params.get('error');

      if (error) {
        Alert.alert('Connection Failed', this.getErrorMessage(error));
        return;
      }

      if (token) {
        this.notifyListeners('lastfm_callback', { token });
      }
    }
  }

  private getErrorMessage(error: string) {
    switch (error) {
      case 'missing_token':
        return 'Authorization token is missing. Please try again.';
      case 'missing_user_id':
        return 'User ID is missing. Please try again.';
      case 'server_error':
        return 'Server error occurred. Please try again.';
      default:
        return 'An unknown error occurred. Please try again.';
    }
  }

  public addListener(callback: Listener) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(type: string, data: Record<string, string>) {
    this.listeners.forEach(callback => callback(type, data));
  }

  public cleanup() {
    this.linkingListener?.remove();
    this.listeners = [];
  }
}

export default new DeepLinkHandler();
