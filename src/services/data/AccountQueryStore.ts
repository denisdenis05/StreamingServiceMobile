export const QueryCachePolicy = Object.freeze({ maximumInactiveEntries: 256, freshnessMilliseconds: 300000 });
export interface QuerySnapshot<Value> { readonly data: Value | null; readonly loading: boolean; readonly error: Error | null }
export type QueryFetcher<Value> = (signal: AbortSignal) => Promise<Value>;
interface QueryEntry {
  snapshot: QuerySnapshot<unknown>;
  hasValue: boolean;
  updatedAt: number;
  generation: object;
  controller: AbortController | null;
  listeners: Set<(snapshot: QuerySnapshot<unknown>) => void>;
  fetchers: Map<object, QueryFetcher<unknown>>;
}
const EmptyQuerySnapshot: QuerySnapshot<never> = Object.freeze({ data: null, loading: false, error: null });
export class AccountQueryStore {
  private readonly entries = new Map<string, QueryEntry>();
  private readonly scopeListeners = new Set<() => void>();
  private scope = {};
  private account: string | null = null;

  constructor(private readonly nowMilliseconds: () => number,
    private readonly maximumInactiveEntries = QueryCachePolicy.maximumInactiveEntries,
    private readonly freshnessMilliseconds = QueryCachePolicy.freshnessMilliseconds) {}

  getScope = (): object => this.scope;
  subscribeScope = (listener: () => void): (() => void) => {
    this.scopeListeners.add(listener);
    return () => { this.scopeListeners.delete(listener); };
  };
  setAccount(account: string | null): void {
    if (this.account === account) return;
    this.account = account;
    this.clear();
  }
  clear(): void {
    this.scope = {};
    for (const entry of this.entries.values()) this.cancel(entry);
    this.entries.clear();
    for (const listener of this.scopeListeners) listener();
  }
  read<Value>(key: string): QuerySnapshot<Value> {
    const entry = this.entries.get(key);
    return (entry !== undefined && (entry.listeners.size > 0 || this.fresh(entry)) ? entry.snapshot : EmptyQuerySnapshot) as QuerySnapshot<Value>;
  }
  observe<Value>(key: string, scope: object, listener: (snapshot: QuerySnapshot<Value>) => void,
    fetcher?: QueryFetcher<Value>, initialData?: Value): () => void {
    if (scope !== this.scope) return () => undefined;
    let entry = this.entries.get(key);
    if (entry === undefined) {
      entry = { snapshot: EmptyQuerySnapshot, hasValue: false, updatedAt: 0, generation: {}, controller: null,
        listeners: new Set(), fetchers: new Map() };
      this.entries.set(key, entry);
    }
    const owned = entry;
    const owner = {};
    if (!this.fresh(owned) && owned.hasValue && owned.listeners.size === 0) {
      owned.hasValue = false;
      owned.snapshot = EmptyQuerySnapshot;
    }
    if (!owned.hasValue && initialData !== undefined) this.writeEntry(owned, initialData);
    const subscription = (snapshot: QuerySnapshot<unknown>) => listener(snapshot as QuerySnapshot<Value>);
    owned.listeners.add(subscription);
    if (fetcher !== undefined) owned.fetchers.set(owner, fetcher as QueryFetcher<unknown>);
    subscription(owned.snapshot);
    if (!this.fresh(owned)) this.load(key, owned);
    this.trim();
    return () => {
      owned.listeners.delete(subscription);
      owned.fetchers.delete(owner);
      if (owned.listeners.size === 0) {
        this.cancel(owned);
        owned.snapshot = Object.freeze({ ...owned.snapshot, loading: false });
        if (this.entries.get(key) === owned) { this.entries.delete(key); this.entries.set(key, owned); }
        this.trim();
      }
    };
  }
  update<Value>(key: string, scope: object, value: Value): void {
    if (scope !== this.scope) return;
    const entry = this.entries.get(key);
    if (entry === undefined) return;
    this.cancel(entry);
    this.writeEntry(entry, value);
    this.publish(entry);
  }
  invalidate(key: string): void {
    const entry = this.entries.get(key);
    if (entry === undefined) return;
    this.cancel(entry);
    entry.hasValue = false;
    entry.snapshot = EmptyQuerySnapshot;
    this.publish(entry);
    this.load(key, entry);
  }
  get retainedEntries(): number { return this.entries.size; }
  private fresh(entry: QueryEntry): boolean {
    return entry.hasValue && this.nowMilliseconds() - entry.updatedAt < this.freshnessMilliseconds;
  }
  private load(key: string, entry: QueryEntry): void {
    const fetcher = entry.fetchers.values().next().value;
    if (entry.controller !== null || fetcher === undefined) return;
    const scope = this.scope;
    const generation = entry.generation;
    const controller = new AbortController();
    entry.controller = controller;
    entry.snapshot = Object.freeze({ ...entry.snapshot, loading: true, error: null });
    this.publish(entry);
    const current = () => scope === this.scope && entry.generation === generation && this.entries.get(key) === entry;
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error('Query canceled.');
      return fetcher(controller.signal);
    }).then(value => {
      if (!current()) return;
      this.writeEntry(entry, value);
    }, failure => {
      if (!current()) return;
      entry.snapshot = Object.freeze({ ...entry.snapshot, loading: false,
        error: failure instanceof Error ? failure : new Error(String(failure)) });
    }).finally(() => {
      if (!current()) return;
      entry.controller = null;
      this.publish(entry);
      this.trim();
    });
  }
  private writeEntry(entry: QueryEntry, value: unknown): void {
    entry.hasValue = true;
    entry.updatedAt = this.nowMilliseconds();
    entry.snapshot = Object.freeze({ data: value, loading: false, error: null });
  }
  private cancel(entry: QueryEntry): void {
    entry.generation = {};
    entry.controller?.abort();
    entry.controller = null;
  }
  private publish(entry: QueryEntry): void {
    for (const listener of [...entry.listeners]) if (entry.listeners.has(listener)) listener(entry.snapshot);
  }
  private trim(): void {
    let inactive = [...this.entries.values()].filter(entry => entry.listeners.size === 0).length;
    for (const [key, entry] of this.entries) {
      if (entry.listeners.size > 0) continue;
      if (this.fresh(entry) && inactive <= this.maximumInactiveEntries) continue;
      this.cancel(entry);
      this.entries.delete(key);
      inactive -= 1;
    }
  }
}
