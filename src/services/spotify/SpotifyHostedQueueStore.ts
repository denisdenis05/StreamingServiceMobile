import { HostedQueueStatus } from 'streaming-service-spotify-jam';
import type { HostedQueueSnapshot } from 'streaming-service-spotify-jam';
import { SpotifyObservationStore } from './SpotifyObservationStore';
import type { SpotifyConnectionObservation } from './SpotifyObservationStore';

interface HostedQueueStoreDependencies {
  readonly getObserver: () => SpotifyConnectionObservation<HostedQueueSnapshot> | null;
  readonly subscribeConnection: (listener: () => void) => () => void;
}

const EmptySnapshot: HostedQueueSnapshot = Object.freeze({ enabled: false, status: HostedQueueStatus.Detached,
  sessionIdentifier: null, hostDeviceIdentifier: null, currentlyPlaying: null, entries: Object.freeze([]),
  observedAtMilliseconds: null, failure: null });

export class SpotifyHostedQueueStore extends SpotifyObservationStore<HostedQueueSnapshot> {
  constructor(dependencies: HostedQueueStoreDependencies) { super({ ...dependencies, initialSnapshot: EmptySnapshot }); }
}
