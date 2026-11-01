import { LibraryChangeStore } from './LibraryChanges';

const listeningHistoryChanges = new LibraryChangeStore();
export const notifyListeningHistoryChanged = listeningHistoryChanges.publish;
export const subscribeListeningHistoryChanges = listeningHistoryChanges.subscribe;
