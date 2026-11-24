import { assetIdentity } from './AssetIdentity';

export const AssetCachePolicy = Object.freeze({ initialCount: 0, countIncrement: 1, successStatus: 200,
  manifestVersion: 1, manifestSuffix: '.complete.json', temporarySuffix: '.partial', assetSuffix: '.asset',
  filePrefix: 'file://', pathSeparator: '/', encoding: 'utf8', hashAlgorithm: 'sha256',
  canceledMessage: 'Asset request canceled.', invalidMessage: 'The downloaded asset is incomplete or invalid.',
  storageFullMessage: 'The download cache is full. Remove saved downloads before adding more.',
  firstServerFailureStatus: 500, throttledStatus: 429, requestTimeoutStatus: 408,
  missingMessage: 'The requested asset is unavailable.', visiblePriority: 0, prefetchPriority: 1,
  byteBudget: 268435456, maximumImageBytes: 20971520, maximumAudioBytes: 1073741824,
  maximumAgeMilliseconds: 2592000000, maximumParallelDownloads: 3, maximumDownloadAttempts: 2, evictionDelayMilliseconds: 500, retryDelayMilliseconds: 500 });
export interface AssetRequest { readonly address: string; readonly scope: string; readonly headers?: Readonly<Record<string, string>> }
export interface AssetFile { readonly path: string; readonly size: number; readonly modifiedMilliseconds: number; readonly isFile: boolean }
export interface AssetFilesystem {
  ensureDirectory(path: string): Promise<void>;
  information(path: string): Promise<AssetFile | null>;
  list(path: string): Promise<readonly AssetFile[]>;
  read(path: string): Promise<string>;
  write(path: string, value: string): Promise<void>;
  move(source: string, destination: string): Promise<void>;
  remove(path: string): Promise<void>;
  checksum(path: string): Promise<string>;
}
export interface AssetDownloadResult { readonly status: number; readonly bytes: number; readonly expectedBytes: number; readonly contentType: string }
export interface AssetDelay { readonly result: Promise<void>; cancel(): void }
export interface AssetDownload { readonly result: Promise<AssetDownloadResult>; cancel(): void }
export interface AssetCacheDependencies {
  readonly filesystem: AssetFilesystem;
  download(request: AssetRequest, destination: string, maximumBytes: number): AssetDownload;
  delay(milliseconds: number): AssetDelay;
  validate(path: string, response: AssetDownloadResult): Promise<void>;
  nowMilliseconds(): number;
  nextIdentifier(): string;
  report(event: AssetCacheEvent): void;
}
export interface AssetCacheEvent { readonly kind: 'hit' | 'miss' | 'complete' | 'failure' | 'evicted' | 'displayed'; readonly identity: string; readonly elapsedMilliseconds: number }
export interface AssetCacheConfiguration {
  readonly directory: string; readonly maximumBytes: number; readonly byteBudget: number;
  readonly maximumAgeMilliseconds: number; readonly maximumParallelDownloads: number; readonly verifyChecksum: boolean; readonly evictExisting?: boolean;
}
export interface AssetLease { readonly result: Promise<string>; cancel(): void }
interface Manifest { version: number; identity: string; bytes: number; checksum: string; completedAtMilliseconds: number }
interface Work { request: AssetRequest; identity: string; generation: object; references: number; priority: number;
  canceled: boolean; running: boolean; download: AssetDownload | null; retryDelay: AssetDelay | null; result: Promise<string>;
  resolve(value: string): void; reject(failure: unknown): void }
export class AssetCache {
  private readonly work = new Map<string, Work>();
  private readonly previews = new Map<string, string>();
  private readonly pins = new Map<string, number>();
  private readonly accessTimes = new Map<string, number>();
  private cleanup: AssetDelay | null = null;
  private generation = {};
  private activeDownloads: number = AssetCachePolicy.initialCount;
  private mutation: Promise<unknown> = Promise.resolve();
  constructor(private readonly dependencies: AssetCacheDependencies, private readonly configuration: AssetCacheConfiguration) {}
  identity(request: AssetRequest): string { return assetIdentity(JSON.stringify([request.scope, request.address])); }
  path(request: AssetRequest): string { return this.pathForIdentity(this.identity(request)); }
  peek(request: AssetRequest): string | null { return this.previews.get(this.identity(request)) ?? null; }
  acquire(request: AssetRequest, priority: number = AssetCachePolicy.visiblePriority): AssetLease {
    const captured: AssetRequest = { ...request, ...(request.headers === undefined ? {} : { headers: { ...request.headers } }) };
    const identity = this.identity(captured);
    let work = this.work.get(identity);
    if (work === undefined) {
      let resolve!: (value: string) => void; let reject!: (failure: unknown) => void;
      const result = new Promise<string>((complete, fail) => { resolve = complete; reject = fail; });
      work = { request: captured, identity, generation: this.generation, references: AssetCachePolicy.initialCount,
        priority, canceled: false, running: false, download: null, retryDelay: null, result, resolve, reject };
      this.work.set(identity, work);
    }
    work.references += AssetCachePolicy.countIncrement;
    work.priority = Math.min(priority, work.priority);
    this.pins.set(identity, (this.pins.get(identity) ?? AssetCachePolicy.initialCount) + AssetCachePolicy.countIncrement);
    const owned = work;
    let canceled = false; let rejectLease!: (failure: unknown) => void;
    const cancellation = new Promise<never>((_complete, reject) => { rejectLease = reject; });
    const result = Promise.race([owned.result, cancellation]);
    void result.catch(() => undefined);
    this.drain();
    return { result, cancel: () => {
      if (canceled) return;
      canceled = true;
      rejectLease(new Error(AssetCachePolicy.canceledMessage));
      const remaining = (this.pins.get(identity) ?? AssetCachePolicy.initialCount) - AssetCachePolicy.countIncrement;
      if (remaining <= AssetCachePolicy.initialCount) this.pins.delete(identity); else this.pins.set(identity, remaining);
      if (remaining <= AssetCachePolicy.initialCount) this.scheduleCleanup();
      owned.references -= AssetCachePolicy.countIncrement;
      if (owned.references === AssetCachePolicy.initialCount && this.work.get(identity) === owned) {
        owned.canceled = true; owned.download?.cancel(); owned.retryDelay?.cancel(); owned.reject(new Error(AssetCachePolicy.canceledMessage));
        this.work.delete(identity);
      }
    } };
  }
  async find(request: AssetRequest): Promise<string | null> {
    const identity = this.identity(request);
    try {
      const manifest = JSON.parse(await this.dependencies.filesystem.read(this.manifestPath(identity))) as Manifest;
      const information = await this.dependencies.filesystem.information(this.pathForIdentity(identity));
      if (manifest.version !== AssetCachePolicy.manifestVersion || manifest.identity !== identity
        || !Number.isFinite(manifest.bytes) || !Number.isFinite(manifest.completedAtMilliseconds)
        || manifest.bytes > this.configuration.maximumBytes || manifest.bytes <= AssetCachePolicy.initialCount
        || information?.isFile !== true || information.size !== manifest.bytes
        || this.dependencies.nowMilliseconds() - manifest.completedAtMilliseconds > this.configuration.maximumAgeMilliseconds
        || (this.configuration.verifyChecksum && await this.dependencies.filesystem.checksum(information.path) !== manifest.checksum)) { this.previews.delete(identity); this.accessTimes.delete(identity); return null; }
      const address = AssetCachePolicy.filePrefix + information.path;
      return address;
    } catch { this.previews.delete(identity); this.accessTimes.delete(identity); return null; }
  }
  async invalidate(request: AssetRequest): Promise<void> {
    const identity = this.identity(request); const work = this.work.get(identity);
    if (work !== undefined) { work.canceled = true; work.download?.cancel(); work.retryDelay?.cancel(); work.reject(new Error(AssetCachePolicy.canceledMessage)); this.work.delete(identity); }
    this.previews.delete(identity);
    await this.exclusive(async () => {
      await this.dependencies.filesystem.remove(this.manifestPath(identity));
      await this.dependencies.filesystem.remove(this.pathForIdentity(identity));
    });
  }
  async clear(): Promise<void> {
    this.generation = {};
    this.cleanup?.cancel(); this.cleanup = null;
    for (const work of this.work.values()) {
      work.canceled = true; work.download?.cancel(); work.retryDelay?.cancel(); work.reject(new Error(AssetCachePolicy.canceledMessage));
    }
    this.work.clear(); this.previews.clear(); this.accessTimes.clear();
    await this.exclusive(() => this.dependencies.filesystem.remove(this.configuration.directory));
  }
  private drain(): void {
    while (this.activeDownloads < this.configuration.maximumParallelDownloads) {
      const pending = [...this.work.values()].filter(work => !work.running && !work.canceled)
        .sort((previous, next) => previous.priority - next.priority)[AssetCachePolicy.initialCount];
      if (pending === undefined) return;
      pending.running = true; this.activeDownloads += AssetCachePolicy.countIncrement;
      void this.execute(pending).then(pending.resolve, pending.reject).finally(() => {
        this.activeDownloads -= AssetCachePolicy.countIncrement;
        if (this.work.get(pending.identity) === pending) this.work.delete(pending.identity);
        this.drain();
      });
    }
  }
  private async execute(work: Work): Promise<string> {
    const started = this.dependencies.nowMilliseconds();
    const temporary = this.pathForIdentity(work.identity) + this.dependencies.nextIdentifier() + AssetCachePolicy.temporarySuffix;
    let installed = false;
    let published = false;
    try {
      const cached = await this.find(work.request); this.assertCurrent(work);
      if (cached !== null) { this.previews.set(work.identity, cached); this.accessTimes.set(work.identity, this.dependencies.nowMilliseconds());
        this.report('hit', work.identity, started); return cached; }
      this.report('miss', work.identity, started);
      await this.dependencies.filesystem.ensureDirectory(this.configuration.directory); this.assertCurrent(work);
      const response = await this.download(work, temporary); this.assertCurrent(work);
      const information = await this.dependencies.filesystem.information(temporary);
      if (response.status !== AssetCachePolicy.successStatus || information?.isFile !== true
        || information.size <= AssetCachePolicy.initialCount || information.size > this.configuration.maximumBytes
        || response.bytes !== information.size || (response.expectedBytes > AssetCachePolicy.initialCount && response.expectedBytes !== information.size)) {
        throw new Error(AssetCachePolicy.invalidMessage);
      }
      await this.dependencies.validate(temporary, response); this.assertCurrent(work);
      const checksum = await this.dependencies.filesystem.checksum(temporary); this.assertCurrent(work);
      await this.exclusive(async () => {
        this.assertCurrent(work);
        await this.dependencies.filesystem.ensureDirectory(this.configuration.directory);
        if (this.configuration.evictExisting === false) {
          const completed = (await this.dependencies.filesystem.list(this.configuration.directory))
            .filter(file => file.path.endsWith(AssetCachePolicy.assetSuffix) && file.path !== this.pathForIdentity(work.identity));
          const storedBytes = completed.reduce<number>((total, file) => total + file.size, AssetCachePolicy.initialCount);
          if (storedBytes + information.size > this.configuration.byteBudget) throw new Error(AssetCachePolicy.storageFullMessage);
        }
        await this.dependencies.filesystem.remove(this.manifestPath(work.identity));
        await this.dependencies.filesystem.move(temporary, this.pathForIdentity(work.identity));
        installed = true;
        const manifest: Manifest = { version: AssetCachePolicy.manifestVersion, identity: work.identity,
          bytes: information.size, checksum, completedAtMilliseconds: this.dependencies.nowMilliseconds() };
        const temporaryManifest = temporary + AssetCachePolicy.manifestSuffix;
        try {
          await this.dependencies.filesystem.write(temporaryManifest, JSON.stringify(manifest));
          await this.dependencies.filesystem.move(temporaryManifest, this.manifestPath(work.identity));
          published = true;
        } finally { await this.dependencies.filesystem.remove(temporaryManifest); }
        const address = AssetCachePolicy.filePrefix + this.pathForIdentity(work.identity);
        this.previews.set(work.identity, address); this.accessTimes.set(work.identity, this.dependencies.nowMilliseconds());
        this.scheduleCleanup();
      });
      this.assertCurrent(work); this.report('complete', work.identity, started);
      return AssetCachePolicy.filePrefix + this.pathForIdentity(work.identity);
    } catch (failure) {
      if (installed && !published) await this.exclusive(async () => {
        if (this.work.get(work.identity) !== work || work.generation !== this.generation) return;
        await this.dependencies.filesystem.remove(this.manifestPath(work.identity));
        await this.dependencies.filesystem.remove(this.pathForIdentity(work.identity));
      });
      this.report('failure', work.identity, started); throw failure;
    }
    finally { await this.dependencies.filesystem.remove(temporary); }
  }
  private async download(work: Work, temporary: string): Promise<AssetDownloadResult> {
    for (let attempt = AssetCachePolicy.initialCount; attempt < AssetCachePolicy.maximumDownloadAttempts; attempt += AssetCachePolicy.countIncrement) {
      let retryable = true;
      try {
        this.assertCurrent(work);
        work.download = this.dependencies.download(work.request, temporary, this.configuration.maximumBytes);
        const result = await work.download.result;
        if (result.status === AssetCachePolicy.successStatus) return result;
        retryable = result.status >= AssetCachePolicy.firstServerFailureStatus || result.status === AssetCachePolicy.throttledStatus
          || result.status === AssetCachePolicy.requestTimeoutStatus;
        throw new Error(AssetCachePolicy.missingMessage);
      } catch (failure) {
        this.assertCurrent(work);
        if (!retryable || (failure instanceof Error && failure.message === AssetCachePolicy.invalidMessage)
          || attempt + AssetCachePolicy.countIncrement >= AssetCachePolicy.maximumDownloadAttempts) throw failure;
        await this.dependencies.filesystem.remove(temporary);
        work.retryDelay = this.dependencies.delay(AssetCachePolicy.retryDelayMilliseconds);
        await work.retryDelay.result;
        work.retryDelay = null;
      }
    }
    throw new Error(AssetCachePolicy.missingMessage);
  }
  private async evict(): Promise<void> {
    if (this.configuration.evictExisting === false) return;
    const files = await this.dependencies.filesystem.list(this.configuration.directory);
    let bytes = files.reduce<number>((total, file) => total + file.size, AssetCachePolicy.initialCount);
    const candidates = files.filter(file => file.path.endsWith(AssetCachePolicy.assetSuffix)).sort((previous, next) =>
      (this.accessTimes.get(this.identityFromPath(previous.path)) ?? previous.modifiedMilliseconds)
      - (this.accessTimes.get(this.identityFromPath(next.path)) ?? next.modifiedMilliseconds));
    for (const file of candidates) {
      const identity = this.identityFromPath(file.path);
      const expired = this.dependencies.nowMilliseconds() - file.modifiedMilliseconds > this.configuration.maximumAgeMilliseconds;
      if ((!expired && bytes <= this.configuration.byteBudget) || this.pins.has(identity)) continue;
      await this.dependencies.filesystem.remove(this.manifestPath(identity)); await this.dependencies.filesystem.remove(file.path);
      this.previews.delete(identity); this.accessTimes.delete(identity); bytes -= file.size;
      this.report('evicted', identity, this.dependencies.nowMilliseconds());
    }
    for (const file of files) {
      if (file.path.includes(AssetCachePolicy.temporarySuffix) && this.dependencies.nowMilliseconds() - file.modifiedMilliseconds > this.configuration.maximumAgeMilliseconds) {
        await this.dependencies.filesystem.remove(file.path);
      }
    }
  }
  private scheduleCleanup(): void {
    if (this.cleanup !== null || this.configuration.evictExisting === false) return;
    const generation = this.generation;
    const operation = this.dependencies.delay(AssetCachePolicy.evictionDelayMilliseconds);
    this.cleanup = operation;
    void operation.result.then(async () => {
      if (generation !== this.generation) return;
      await this.exclusive(() => this.evict());
    }).catch(() => {
      if (generation === this.generation) this.report('failure', this.configuration.directory, this.dependencies.nowMilliseconds());
    }).finally(() => { if (this.cleanup === operation) this.cleanup = null; });
  }
  private identityFromPath(path: string): string { return path.substring(this.configuration.directory.length + AssetCachePolicy.countIncrement,
    path.length - AssetCachePolicy.assetSuffix.length); }
  private pathForIdentity(identity: string): string { return this.configuration.directory + AssetCachePolicy.pathSeparator + identity + AssetCachePolicy.assetSuffix; }
  private manifestPath(identity: string): string { return this.pathForIdentity(identity) + AssetCachePolicy.manifestSuffix; }
  private assertCurrent(work: Work): void {
    if (work.canceled || work.generation !== this.generation) throw new Error(AssetCachePolicy.canceledMessage);
  }
  private exclusive<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.mutation.then(operation); this.mutation = result.catch(() => undefined); return result;
  }
  private report(kind: AssetCacheEvent['kind'], identity: string, started: number): void {
    try { this.dependencies.report({ kind, identity, elapsedMilliseconds: this.dependencies.nowMilliseconds() - started }); } catch {}
  }
}
