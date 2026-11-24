import type { AxiosInstance } from 'axios';

const millisecondsPerSecond = 1_000;
const progressReportIntervalMilliseconds = 30_000;
const initialListenedMilliseconds = 0;
const minimumProgressDeltaSeconds = 0;
const trackingEndpoints = {
  progress: '/lastfm/playback-progress',
  pause: '/lastfm/pause',
  resume: '/lastfm/resume',
  seek: '/lastfm/seek',
  stop: '/lastfm/stop-playback',
} as const;
const reportingFailureMessage = 'Playback reporting failed';

type ReportingClient = Pick<AxiosInstance, 'post'>;
type SessionIdentifierSource = string | (() => Promise<string | null>);

export class PlaybackReportingQueue {
  private pendingOperation: Promise<unknown> = Promise.resolve();

  enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.pendingOperation.then(operation);
    this.pendingOperation = result.catch(() => undefined);
    return result;
  }
}

export class PlaybackTracker {
  private readonly reportingClient: ReportingClient;
  private readonly sessionIdentifierSource: SessionIdentifierSource;
  private sessionIdentifier: Promise<string | null> | null = null;
  private readonly reportingQueue: PlaybackReportingQueue;
  private stopReport: Promise<void> | null = null;
  private lastUpdateTimeMilliseconds = Date.now();
  private totalListenedMilliseconds = initialListenedMilliseconds;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private isPaused = false;
  private isStopped = false;
  private isProgressReportPending = false;

  constructor(
    sessionIdentifierSource: SessionIdentifierSource,
    reportingClient: ReportingClient,
    reportingQueue = new PlaybackReportingQueue(),
  ) {
    this.sessionIdentifierSource = sessionIdentifierSource;
    this.reportingClient = reportingClient;
    this.reportingQueue = reportingQueue;
  }

  start(): void {
    if (this.sessionIdentifier || this.isStopped) return;

    this.lastUpdateTimeMilliseconds = Date.now();
    this.sessionIdentifier = this.reportingQueue
      .enqueue(async () =>
        typeof this.sessionIdentifierSource === 'string'
          ? this.sessionIdentifierSource
          : this.sessionIdentifierSource(),
      )
      .catch(() => {
        console.error(reportingFailureMessage);
        return null;
      });

    this.updateInterval = setInterval(() => {
      if (this.isPaused || this.isStopped || this.isProgressReportPending)
        return;

      const deltaListenedSeconds = this.captureListeningTime();
      if (deltaListenedSeconds <= minimumProgressDeltaSeconds) return;

      this.isProgressReportPending = true;
      this.report(trackingEndpoints.progress, {
        deltaListenedSeconds,
        totalListenedSeconds: this.getTotalListenedTime(),
      }).finally(() => {
        this.isProgressReportPending = false;
      });
    }, progressReportIntervalMilliseconds);
  }

  pause(): Promise<void> {
    if (this.isPaused || this.isStopped) return Promise.resolve();

    const deltaListenedSeconds = this.captureListeningTime();
    this.isPaused = true;
    return this.report(trackingEndpoints.pause, {
      deltaListenedSeconds,
      totalListenedSeconds: this.getTotalListenedTime(),
    });
  }

  resume(): Promise<void> {
    if (!this.isPaused || this.isStopped) return Promise.resolve();

    this.isPaused = false;
    this.lastUpdateTimeMilliseconds = Date.now();
    return this.report(trackingEndpoints.resume, {});
  }

  seek(fromSeconds: number, toSeconds: number): Promise<void> {
    if (this.isStopped) return Promise.resolve();

    this.captureListeningTime();
    return this.report(trackingEndpoints.seek, {
      fromSeconds: Math.floor(fromSeconds),
      toSeconds: Math.floor(toSeconds),
    });
  }

  stop(): Promise<void> {
    if (this.stopReport) return this.stopReport;

    this.captureListeningTime();
    this.isStopped = true;
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.stopReport = this.report(trackingEndpoints.stop, {
      totalListenedSeconds: this.getTotalListenedTime(),
    });
    return this.stopReport;
  }

  getTotalListenedTime(): number {
    return Math.floor(this.totalListenedMilliseconds / millisecondsPerSecond);
  }

  private captureListeningTime(): number {
    const previousTotalSeconds = this.getTotalListenedTime();
    const currentTimeMilliseconds = Date.now();
    if (!this.isPaused && !this.isStopped) {
      this.totalListenedMilliseconds += Math.max(
        initialListenedMilliseconds,
        currentTimeMilliseconds - this.lastUpdateTimeMilliseconds,
      );
    }
    this.lastUpdateTimeMilliseconds = currentTimeMilliseconds;
    return this.getTotalListenedTime() - previousTotalSeconds;
  }

  private report(
    endpoint: string,
    payload: Record<string, number>,
  ): Promise<void> {
    const sessionIdentifier = this.sessionIdentifier;
    return this.reportingQueue
      .enqueue(async () => {
        const resolvedSessionIdentifier = await sessionIdentifier;
        if (!resolvedSessionIdentifier) return;

        await this.reportingClient.post(endpoint, {
          ...payload,
          sessionId: resolvedSessionIdentifier,
        });
      })
      .catch(() => {
        console.error(reportingFailureMessage);
      });
  }
}
