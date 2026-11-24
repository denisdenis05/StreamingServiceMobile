export class LibraryChangeStore {
  private revision = LibraryChangePolicy.initialRevision;
  private readonly listeners = new Set<() => void>();

  readonly getSnapshot = (): number => this.revision;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly publish = (): void => {
    this.revision += LibraryChangePolicy.revisionStep;
    for (const listener of [...this.listeners]) listener();
  };
}

const LibraryChangePolicy = Object.freeze({ initialRevision: 0, revisionStep: 1 });
const libraryChanges = new LibraryChangeStore();
export const notifyLibraryChanged = libraryChanges.publish;
export const subscribeLibraryChanges = libraryChanges.subscribe;
export const getLibraryRevision = libraryChanges.getSnapshot;
