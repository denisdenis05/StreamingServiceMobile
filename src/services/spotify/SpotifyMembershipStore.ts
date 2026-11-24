import { MembershipObservationStatus } from 'streaming-service-spotify-jam';
import type { MembershipObservationSnapshot } from 'streaming-service-spotify-jam';
import { SpotifyObservationStore } from './SpotifyObservationStore';
import type { SpotifyConnectionObservation } from './SpotifyObservationStore';

interface MembershipStoreDependencies {
  readonly getObserver: () => SpotifyConnectionObservation<MembershipObservationSnapshot> | null;
  readonly subscribeConnection: (listener: () => void) => () => void;
}

const EmptySnapshot: MembershipObservationSnapshot = Object.freeze({ enabled: false,
  status: MembershipObservationStatus.Detached, observedAtMilliseconds: null, failure: null });

export class SpotifyMembershipStore extends SpotifyObservationStore<MembershipObservationSnapshot> {
  constructor(dependencies: MembershipStoreDependencies) { super({ ...dependencies, initialSnapshot: EmptySnapshot }); }
}
