import {
  HostedPlaybackCommandKind,
  IntegrationFailure,
  IntegrationFailureCode,
  SharedPlaybackStatus,
} from 'streaming-service-spotify-jam';
import type { SharedPlaybackSnapshot } from 'streaming-service-spotify-jam';
import { SpotifyHostingFailureStage, SpotifyHostingStatus } from './SpotifyHostingStore';
import type { SpotifyHostingQueueIssue } from './SpotifyHostingQueue';
import type { SpotifyHostingSnapshot } from './SpotifyHostingStore';
export enum SpotifyPlayerJamMode {
  Disconnected = 'disconnected',
  Available = 'available',
  Hosting = 'hosting',
  Following = 'following',
  Preparing = 'preparing',
  Resolving = 'resolving',
  Stopping = 'stopping',
  Failed = 'failed',
}
export interface SpotifyPlayerJamConnection {
  readonly scopeIdentifier: string;
  readonly owned: boolean;
  readonly native: boolean;
  readonly nativeReady: boolean;
  readonly admitted: boolean;
  readonly hasHost: boolean;
}
export interface SpotifyPlayerJamSnapshot {
  readonly mode: SpotifyPlayerJamMode;
  readonly connected: boolean;
  readonly owned: boolean;
  readonly canHost: boolean;
  readonly canCreate: boolean;
  readonly canJoin: boolean;
  readonly canFollow: boolean;
  readonly remoteControlsAvailable: boolean;
  readonly pending: boolean;
  readonly market: string;
  readonly failure: IntegrationFailureCode | null;
  readonly failureStage?: SpotifyHostingFailureStage | null;
  readonly queueIssue?: SpotifyHostingQueueIssue | null;
  readonly upcomingQueuePending?: boolean;
  readonly upcomingQueueFailure?: IntegrationFailureCode | null;
  readonly unavailableUpcomingCount?: number;
}
export interface SpotifyPlayerJamDependencies {
  readonly getConnection: () => SpotifyPlayerJamConnection | null;
  readonly getIdentity?: () => string | null;
  readonly getCanCreate?: () => boolean;
  readonly getCanJoin?: () => boolean;
  readonly createJam?: () => Promise<void>;
  readonly joinJam?: (invitation: string) => Promise<void>;
  readonly listeningCountry?: { getSnapshot(): string; set(value: string): void };
  readonly getHosting: () => SpotifyHostingSnapshot;
  readonly getFollowing: () => SharedPlaybackSnapshot;
  readonly remoteControlsAvailable: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
  readonly startHosting: (market: string) => Promise<void>;
  readonly stopHosting: () => Promise<void>;
  readonly startFollowing: (market: string) => Promise<void>;
  readonly stopFollowing: () => Promise<void>;
  readonly prepareRecordings: (
    recordingIdentifiers: readonly string[],
  ) => Promise<void>;
  readonly publishLocalChanges: () => Promise<void>;
  readonly remoteControl: (
    kind: Exclude<HostedPlaybackCommandKind, HostedPlaybackCommandKind.Seek>,
  ) => Promise<void>;
  readonly remoteSeek: (seconds: string) => Promise<void>;
}
const Policy = Object.freeze({
  emptyUpcomingCount: 0,
  emptyMarket: '',
  marketPattern: /^[A-Z]{2}$/,
  maximumRecordings: 80,
  minimumRecordings: 1,
  millisecondsPerSecond: 1000,
  firstPosition: 0,
  maximumSeekMilliseconds: Number.MAX_SAFE_INTEGER,
});
const FollowingStatuses = new Set([
  SharedPlaybackStatus.Waiting,
  SharedPlaybackStatus.Resolving,
  SharedPlaybackStatus.Preparing,
  SharedPlaybackStatus.Following,
  SharedPlaybackStatus.Buffering,
  SharedPlaybackStatus.Stale,
  SharedPlaybackStatus.Unavailable,
]);
const FailureCodes = new Set<unknown>(Object.values(IntegrationFailureCode));
export class SpotifyPlayerJamController {
  private snapshot: SpotifyPlayerJamSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private scope: string | null;
  private intent = {};
  private market: string = Policy.emptyMarket;
  private pending = false;
  private failure: IntegrationFailureCode | null = null;
  private disposed = false;
  private membershipTransition = false;
  private queueHandoffScope: string | null = null;
  constructor(private readonly dependencies: SpotifyPlayerJamDependencies) {
    this.scope = dependencies.getConnection()?.scopeIdentifier ?? null;
    this.snapshot = this.read();
    this.unsubscribe = dependencies.subscribe(() => this.changed());
  }
  readonly getSnapshot = (): SpotifyPlayerJamSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setMarket(value: string): void {
    this.market = value.trim().toUpperCase();
    this.dependencies.listeningCountry?.set(this.market);
    this.failure = null;
    this.publish();
  }
  async startSharing(): Promise<void> {
    await this.membershipAction(async () => {
      if (!this.dependencies.getConnection()) {
        if (!this.dependencies.getCanCreate?.() || !this.dependencies.createJam)
          throw new IntegrationFailure(IntegrationFailureCode.Forbidden);
        await this.dependencies.createJam();
      }
    }, true);
  }
  async joinAndListen(invitation: string): Promise<void> {
    await this.membershipAction(async () => {
      if (!this.dependencies.getCanJoin?.() || !this.dependencies.joinJam)
        throw new IntegrationFailure(IntegrationFailureCode.Forbidden);
      await this.dependencies.joinJam(invitation);
    }, false);
  }
  private async membershipAction(operation: () => Promise<void>, hosting: boolean): Promise<void> {
    if (this.pending || this.disposed) return;
    const identity = this.dependencies.getIdentity?.();
    this.membershipTransition = true;
    try {
      await this.action(async current => {
        this.requireMarket();
        await operation();
        if (!current() || this.disposed || identity !== this.dependencies.getIdentity?.())
          throw new IntegrationFailure(IntegrationFailureCode.Superseded);
        const membershipScope = this.dependencies.getConnection()?.scopeIdentifier;
        const snapshot = this.read();
        if (hosting ? !snapshot.canHost : !snapshot.canFollow)
          throw new IntegrationFailure(IntegrationFailureCode.Forbidden);
        if (hosting) {
          await this.dependencies.startHosting(this.currentMarket());
          const result = this.dependencies.getHosting();
          if (result.status !== SpotifyHostingStatus.Hosting)
            throw new IntegrationFailure(result.failure ?? IntegrationFailureCode.Network);
        } else {
          await this.dependencies.startFollowing(this.currentMarket());
          const result = this.dependencies.getFollowing();
          if (!FollowingStatuses.has(result.status))
            throw new IntegrationFailure(result.failure ?? IntegrationFailureCode.Network);
        }
        if (!current() || membershipScope !== this.dependencies.getConnection()?.scopeIdentifier)
          throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      });
    } finally {
      this.membershipTransition = false;
      this.publish();
    }
  }
  async startHosting(): Promise<void> {
    await this.action(async () => {
      if (!this.snapshot.canHost)
        throw new IntegrationFailure(IntegrationFailureCode.Forbidden);
      this.requireMarket();
      await this.dependencies.startHosting(this.currentMarket());
      const result = this.dependencies.getHosting();
      if (result.status !== SpotifyHostingStatus.Hosting)
        throw new IntegrationFailure(
          result.failure ?? IntegrationFailureCode.Network,
        );
    });
  }
  async startFollowing(): Promise<void> {
    await this.action(async () => {
      if (!this.snapshot.canFollow)
        throw new IntegrationFailure(IntegrationFailureCode.Forbidden);
      this.requireMarket();
      await this.dependencies.startFollowing(this.currentMarket());
      const result = this.dependencies.getFollowing();
      if (!FollowingStatuses.has(result.status))
        throw new IntegrationFailure(
          result.failure ?? IntegrationFailureCode.Network,
        );
    });
  }
  async stop(): Promise<void> {
    await this.action(async current => {
      await this.dependencies.stopFollowing();
      if (current()) await this.dependencies.stopHosting();
    });
  }
  async prepareQueueChange(
    recordingIdentifiers: readonly (string | undefined)[],
    isCurrent: () => boolean,
    clearQueue: boolean,
    acknowledgeAuthorityRelease?: () => Promise<void>,
  ): Promise<() => Promise<void>> {
    const connection = this.dependencies.getConnection();
    const scope = connection?.scopeIdentifier ?? null;
    const hosting = this.dependencies.getHosting().status;
    if (this.following() || this.queueHandoffScope !== null) {
      if (!connection?.owned || !connection.native || !connection.nativeReady || clearQueue || !acknowledgeAuthorityRelease) {
        this.reject(IntegrationFailureCode.Unsupported);
        throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
      }
      return this.prepareOwnerQueueHandoff(
        recordingIdentifiers,
        connection.scopeIdentifier,
        isCurrent,
        acknowledgeAuthorityRelease,
      );
    }
    if (hosting !== SpotifyHostingStatus.Hosting) {
      if (
        hosting === SpotifyHostingStatus.Preparing ||
        hosting === SpotifyHostingStatus.Starting ||
        hosting === SpotifyHostingStatus.Resolving ||
        hosting === SpotifyHostingStatus.Stopping
      ) {
        this.reject(IntegrationFailureCode.Backpressure);
        throw new IntegrationFailure(IntegrationFailureCode.Backpressure);
      }
      if (connection?.owned && connection.native && connection.nativeReady && !clearQueue && acknowledgeAuthorityRelease)
        return this.prepareOwnerQueueHandoff(recordingIdentifiers, connection.scopeIdentifier, isCurrent, acknowledgeAuthorityRelease);
      return async () => undefined;
    }
    if (!connection?.native || !connection.owned)
      throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    const intent = {};
    this.intent = intent;
    this.pending = true;
    this.failure = null;
    this.publish();
    const current = () =>
      !this.disposed &&
      this.intent === intent &&
      this.dependencies.getConnection()?.scopeIdentifier === scope &&
      isCurrent();
    try {
      if (!clearQueue) {
        if (
          recordingIdentifiers.length > Policy.maximumRecordings ||
          recordingIdentifiers.some(identifier => !identifier)
        )
          throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
        await this.dependencies.prepareRecordings([
          ...new Set(recordingIdentifiers as readonly string[]),
        ]);
      }
      if (!current())
        throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      if (
        !clearQueue &&
        this.dependencies.getHosting().status !== SpotifyHostingStatus.Hosting
      )
        throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      this.pending = false;
      this.publish();
      return async () => {
        if (!current()) return;
        try {
          if (clearQueue) await this.dependencies.stopHosting();
          else await this.dependencies.publishLocalChanges();
        } catch (failure) {
          if (current()) this.reject(this.safeCode(failure));
          throw failure;
        }
      };
    } catch (failure) {
      if (this.intent === intent) {
        this.pending = false;
        this.failure = this.safeCode(failure);
        this.publish();
      }
      throw failure;
    }
  }
  private async prepareOwnerQueueHandoff(
    recordingIdentifiers: readonly (string | undefined)[],
    scope: string,
    isCurrent: () => boolean,
    acknowledgeAuthorityRelease: () => Promise<void>,
  ): Promise<() => Promise<void>> {
    this.requireMarket();
    if (
      recordingIdentifiers.length < Policy.minimumRecordings ||
      recordingIdentifiers.length > Policy.maximumRecordings ||
      recordingIdentifiers.some(identifier => !identifier)
    ) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
    const intent = {};
    this.intent = intent;
    this.queueHandoffScope = scope;
    this.pending = true;
    this.failure = null;
    this.publish();
    const current = () =>
      !this.disposed && this.intent === intent && isCurrent() &&
      this.dependencies.getConnection()?.scopeIdentifier === scope &&
      this.dependencies.getConnection()?.owned === true &&
      this.dependencies.getConnection()?.native === true &&
      this.dependencies.getConnection()?.nativeReady === true;
    try {
      await this.dependencies.stopFollowing();
      if (!current()) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      await acknowledgeAuthorityRelease();
      if (!current()) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      this.pending = false;
      this.publish();
      let committed = false;
      return async () => {
        if (committed || !current()) return;
        committed = true;
        try {
          await this.dependencies.startHosting(this.currentMarket());
          if (!current()) return;
          const hosting = this.dependencies.getHosting();
          if (hosting.status !== SpotifyHostingStatus.Hosting)
            throw new IntegrationFailure(hosting.failure ?? IntegrationFailureCode.Network);
        } catch (failure) {
          if (current()) this.failure = this.safeCode(failure);
          throw failure;
        } finally {
          if (this.intent === intent) {
            this.queueHandoffScope = null;
            this.pending = false;
            this.publish();
          }
        }
      };
    } catch (failure) {
      if (this.intent === intent) {
        this.queueHandoffScope = null;
        this.pending = false;
        this.failure = this.safeCode(failure);
        this.publish();
      }
      throw failure;
    }
  }
  async control(
    kind: Exclude<HostedPlaybackCommandKind, HostedPlaybackCommandKind.Seek>,
    local: () => Promise<void>,
  ): Promise<void> {
    const hosting = this.dependencies.getHosting().status;
    if (
      !this.following() &&
      (hosting === SpotifyHostingStatus.Stopped ||
        hosting === SpotifyHostingStatus.Failed)
    ) {
      await local();
      return;
    }
    await this.action(async current => {
      if (this.following()) {
        if (!this.dependencies.remoteControlsAvailable())
          throw new IntegrationFailure(IntegrationFailureCode.Forbidden);
        await this.dependencies.remoteControl(kind);
        return;
      }
      await local();
      if (
        current() &&
        this.dependencies.getHosting().status === SpotifyHostingStatus.Hosting
      )
        await this.dependencies.publishLocalChanges();
    });
  }
  async seek(seconds: number, local: () => Promise<void>): Promise<void> {
    const hosting = this.dependencies.getHosting().status;
    if (
      !this.following() &&
      (hosting === SpotifyHostingStatus.Stopped ||
        hosting === SpotifyHostingStatus.Failed)
    ) {
      await local();
      return;
    }
    await this.action(async current => {
      const milliseconds = Math.round(seconds * Policy.millisecondsPerSecond);
      if (
        !Number.isSafeInteger(milliseconds) ||
        milliseconds < Policy.firstPosition ||
        milliseconds > Policy.maximumSeekMilliseconds
      )
        throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
      if (this.following()) {
        if (!this.dependencies.remoteControlsAvailable())
          throw new IntegrationFailure(IntegrationFailureCode.Forbidden);
        await this.dependencies.remoteSeek(
          String(milliseconds / Policy.millisecondsPerSecond),
        );
        return;
      }
      await local();
      if (
        current() &&
        this.dependencies.getHosting().status === SpotifyHostingStatus.Hosting
      )
        await this.dependencies.publishLocalChanges();
    });
  }
  async localOptions(operation: () => Promise<void>): Promise<void> {
    const hosting = this.dependencies.getHosting().status;
    if (
      this.following() ||
      (hosting !== SpotifyHostingStatus.Stopped &&
        hosting !== SpotifyHostingStatus.Failed)
    ) {
      this.reject(IntegrationFailureCode.Unsupported);
      return;
    }
    await operation();
  }
  dispose(): void {
    this.disposed = true;
    this.intent = {};
    this.unsubscribe();
    this.listeners.clear();
  }
  private async action(
    operation: (current: () => boolean) => Promise<void>,
  ): Promise<void> {
    if (this.disposed) return;
    const intent = {};
    this.intent = intent;
    const scope = this.dependencies.getConnection()?.scopeIdentifier ?? null;
    const identity = this.dependencies.getIdentity?.();
    this.pending = true;
    this.failure = null;
    this.publish();
    const current = () =>
      !this.disposed &&
      this.intent === intent &&
      (this.membershipTransition
        ? identity === this.dependencies.getIdentity?.()
        : scope === (this.dependencies.getConnection()?.scopeIdentifier ?? null));
    try {
      await operation(current);
    } catch (failure) {
      if (this.intent === intent) this.failure = this.safeCode(failure);
    } finally {
      if (this.intent === intent) {
        this.pending = false;
        if (!current()) this.failure = null;
        this.publish();
      }
    }
  }
  private currentMarket(): string {
    return this.dependencies.listeningCountry?.getSnapshot() ?? this.market;
  }
  private requireMarket(): void {
    if (!Policy.marketPattern.test(this.currentMarket()))
      throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  }
  private following(): boolean {
    return FollowingStatuses.has(this.dependencies.getFollowing().status);
  }
  private reject(code: IntegrationFailureCode): void {
    this.failure = code;
    this.publish();
  }
  private safeCode(failure: unknown): IntegrationFailureCode {
    try {
      const code = (failure as { readonly code?: unknown } | null)?.code;
      return FailureCodes.has(code)
        ? (code as IntegrationFailureCode)
        : IntegrationFailureCode.Network;
    } catch {
      return IntegrationFailureCode.Network;
    }
  }
  private changed(): void {
    const scope = this.dependencies.getConnection()?.scopeIdentifier ?? null;
    if (scope !== this.scope) {
      this.scope = scope;
      if (!this.membershipTransition) {
        this.queueHandoffScope = null;
        this.intent = {};
        this.pending = false;
        this.failure = null;
      }
    }
    this.publish();
  }
  private read(): SpotifyPlayerJamSnapshot {
    const connection = this.dependencies.getConnection();
    const hosting = this.dependencies.getHosting();
    const following = this.dependencies.getFollowing();
    const mode =
      hosting.status === SpotifyHostingStatus.Hosting
        ? SpotifyPlayerJamMode.Hosting
        : hosting.status === SpotifyHostingStatus.Resolving
        ? SpotifyPlayerJamMode.Resolving
        : hosting.status === SpotifyHostingStatus.Preparing ||
          hosting.status === SpotifyHostingStatus.Starting
        ? SpotifyPlayerJamMode.Preparing
        : hosting.status === SpotifyHostingStatus.Stopping ||
          following.status === SharedPlaybackStatus.Stopping
        ? SpotifyPlayerJamMode.Stopping
        : this.following()
        ? SpotifyPlayerJamMode.Following
        : this.failure !== null ||
          hosting.status === SpotifyHostingStatus.Failed ||
          following.status === SharedPlaybackStatus.Failed
        ? SpotifyPlayerJamMode.Failed
        : connection
        ? SpotifyPlayerJamMode.Available
        : SpotifyPlayerJamMode.Disconnected;
    return Object.freeze({
      mode,
      connected: connection !== null,
      owned: connection?.owned ?? false,
      canHost: connection?.native === true && connection.nativeReady && connection.owned &&
        !this.following() && following.status !== SharedPlaybackStatus.Stopping,
      canCreate: this.dependencies.getCanCreate?.() ?? false,
      canJoin: this.dependencies.getCanJoin?.() ?? false,
      canFollow:
        !!connection &&
        connection.hasHost &&
        (connection.owned || (connection.native && connection.admitted)),
      remoteControlsAvailable: this.dependencies.remoteControlsAvailable(),
      pending: this.pending,
      market: this.currentMarket(),
      failure: this.failure ?? hosting.failure ?? following.failure,
      failureStage: hosting.failureStage ?? null,
      queueIssue: hosting.queueIssue ?? null,
      upcomingQueuePending: this.following() && (following.upcomingQueuePending ?? false),
      upcomingQueueFailure: this.following() ? following.upcomingQueueFailure ?? null : null,
      unavailableUpcomingCount: this.following() ? following.unavailableUpcomingCount ?? Policy.emptyUpcomingCount : Policy.emptyUpcomingCount,
    });
  }
  private publish(): void {
    if (!this.disposed) {
      this.snapshot = this.read();
      this.listeners.forEach(listener => {
        try {
          listener();
        } catch {}
      });
    }
  }
}
