import { authenticationSession } from '../AuthenticationService';
import { createApplicationNetworkClient } from '../ApplicationNetworkClient';
import {
  notifyLibraryChanged,
  subscribeLibraryChanges,
} from '../LibraryChanges';
import {
  LikedSongsSettingsPolicy,
  LikedSongsSettingsService,
} from './LikedSongsSettingsService';

function accountIdentifier(): string | null {
  const account = authenticationSession.getSnapshot();
  return account.isLoggedIn ? account.accountIdentifier : null;
}
function accountClient(expectedAccountIdentifier: string, signal: AbortSignal) {
  const account = authenticationSession.getSnapshot();
  if (
    signal.aborted ||
    !account.isLoggedIn ||
    account.accountIdentifier !== expectedAccountIdentifier ||
    account.token === null
  )
    throw new Error(LikedSongsSettingsPolicy.signInRequired);
  return createApplicationNetworkClient({
    accountIdentifier: expectedAccountIdentifier,
    token: account.token,
  });
}
export const likedSongsSettings = new LikedSongsSettingsService({
  accountIdentifier,
  subscribeAccount: authenticationSession.subscribe,
  async read(account, signal) {
    const client = accountClient(account, signal);
    const [selection, playlists] = await Promise.all([
      client.get<unknown>(LikedSongsSettingsPolicy.selectionRoute, { signal }),
      client.get<unknown>(LikedSongsSettingsPolicy.playlistsRoute, { signal }),
    ]);
    return { selection: selection.data, playlists: playlists.data };
  },
  async write(account, playlistIdentifier, signal) {
    const client = accountClient(account, signal);
    return (
      await client.put<unknown>(
        LikedSongsSettingsPolicy.selectionRoute,
        { playlistId: playlistIdentifier },
        { signal },
      )
    ).data;
  },
  notifyLibraryChanged,
});
const unsubscribeLibrary = subscribeLibraryChanges(() => {
  void likedSongsSettings.refresh();
});
declare const module: {
  readonly hot?: { dispose(callback: () => void): void };
};
module.hot?.dispose(() => {
  unsubscribeLibrary();
  likedSongsSettings.dispose();
});
