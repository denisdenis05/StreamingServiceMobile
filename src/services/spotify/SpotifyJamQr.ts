import { JamConnectionStatus } from 'streaming-service-spotify-jam';
import { SpotifyMobileOperation } from './SpotifyMobileController';
import type { SpotifyMobileSnapshot } from './SpotifyMobileController';

export const SpotifyJamQrPolicy = Object.freeze({ maximumPayloadCharacters: 512, maximumModuleCount: 77,
  minimumModuleCount: 21, quietZoneModules: 4, moduleStep: 4, firstPosition: 0, sequenceIncrement: 1,
  quietZoneSides: 2, unitSquarePath: 'h1v1h-1z', emptyText: '', printableAsciiPattern: /^[\x21-\x7e]+$/,
  invitationAddressPattern: /^(spotify:socialsession:[A-Za-z0-9_~-][A-Za-z0-9._~-]*|https:\/\/open\.spotify\.com\/(socialsession|jam)\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*(\?[^#\s]*)?|https:\/\/spotify\.(app\.)?link\/[A-Za-z0-9_~-][A-Za-z0-9._~/-]*(\?[^#\s]*)?)$/ });

export interface SpotifyJamQrMatrix { readonly moduleCount: number; readonly isDark: (row: number, column: number) => boolean }
export interface SpotifyJamQrGeometry { readonly path: string; readonly sizeModules: number }
export interface SpotifyJamQrSource {
  getSnapshot(): SpotifyMobileSnapshot;
  subscribe(listener: () => void): () => void;
  invitationAddress(): string | null;
}
export interface SpotifyJamQrDependencies {
  readonly source: SpotifyJamQrSource;
  readonly encode: (address: string) => SpotifyJamQrMatrix | Promise<SpotifyJamQrMatrix>;
  readonly share: (address: string) => Promise<void>;
}
export enum SpotifyJamQrStatus { Closed = 'closed', Generating = 'generating', Ready = 'ready', Failed = 'failed' }
export interface SpotifyJamQrSnapshot {
  readonly status: SpotifyJamQrStatus;
  readonly geometry: SpotifyJamQrGeometry | null;
  readonly textVisible: boolean;
  readonly shareFailed: boolean;
}
interface SpotifyJamQrScope { readonly accountIdentifier: string; readonly sessionIdentifier: string }
const ClosedSnapshot: SpotifyJamQrSnapshot = Object.freeze({ status: SpotifyJamQrStatus.Closed, geometry: null,
  textVisible: false, shareFailed: false });

function currentScope(snapshot: SpotifyMobileSnapshot): SpotifyJamQrScope | null {
  const membership = snapshot.session;
  if (!snapshot.connected || snapshot.operation !== SpotifyMobileOperation.Idle || membership?.status !== JamConnectionStatus.Ready || !membership.accountIdentifier
    || !membership.session?.active) return null;
  return { accountIdentifier: membership.accountIdentifier, sessionIdentifier: membership.session.identifier };
}
function sameScope(left: SpotifyJamQrScope | null, right: SpotifyJamQrScope | null): boolean {
  return left !== null && right !== null && left.accountIdentifier === right.accountIdentifier
    && left.sessionIdentifier === right.sessionIdentifier;
}
export function spotifyJamQrGeometry(matrix: SpotifyJamQrMatrix): SpotifyJamQrGeometry {
  const count = matrix.moduleCount;
  if (!Number.isInteger(count) || count < SpotifyJamQrPolicy.minimumModuleCount || count > SpotifyJamQrPolicy.maximumModuleCount
    || (count - SpotifyJamQrPolicy.minimumModuleCount) % SpotifyJamQrPolicy.moduleStep !== SpotifyJamQrPolicy.firstPosition) throw new Error();
  const segments: string[] = [];
  for (let row = SpotifyJamQrPolicy.firstPosition; row < count; row += SpotifyJamQrPolicy.sequenceIncrement) {
    for (let column = SpotifyJamQrPolicy.firstPosition; column < count; column += SpotifyJamQrPolicy.sequenceIncrement) {
      if (matrix.isDark(row, column)) segments.push(`M${column + SpotifyJamQrPolicy.quietZoneModules} ${row + SpotifyJamQrPolicy.quietZoneModules}${SpotifyJamQrPolicy.unitSquarePath}`);
    }
  }
  return Object.freeze({ path: segments.join(SpotifyJamQrPolicy.emptyText),
    sizeModules: count + SpotifyJamQrPolicy.quietZoneModules * SpotifyJamQrPolicy.quietZoneSides });
}
export class SpotifyJamQr {
  private snapshot = ClosedSnapshot;
  private scope: SpotifyJamQrScope | null = null;
  private address: string | null = null;
  private sequence = SpotifyJamQrPolicy.firstPosition;
  private readonly listeners = new Set<() => void>();
  private stopObservation: (() => void) | null = null;
  constructor(private readonly dependencies: SpotifyJamQrDependencies) {}
  getSnapshot = (): SpotifyJamQrSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.stopObservation === null) this.stopObservation = this.dependencies.source.subscribe(this.observe);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === SpotifyJamQrPolicy.firstPosition) {
        this.stopObservation?.(); this.stopObservation = null; this.close();
      }
    };
  };
  close = (): void => {
    this.sequence += SpotifyJamQrPolicy.sequenceIncrement;
    this.scope = null; this.address = null; this.publish(ClosedSnapshot);
  };
  open = async (): Promise<void> => {
    this.close();
    const sequence = this.sequence;
    this.scope = currentScope(this.dependencies.source.getSnapshot());
    if (this.scope === null) return;
    this.publish({ ...ClosedSnapshot, status: SpotifyJamQrStatus.Generating });
    if (sequence !== this.sequence || !sameScope(this.scope, currentScope(this.dependencies.source.getSnapshot()))) return;
    try {
      const address = this.dependencies.source.invitationAddress();
      if (address === null || address.length > SpotifyJamQrPolicy.maximumPayloadCharacters
        || !SpotifyJamQrPolicy.printableAsciiPattern.test(address) || !SpotifyJamQrPolicy.invitationAddressPattern.test(address)) throw new Error();
      this.address = address;
      const matrix = await this.dependencies.encode(address);
      if (!this.current(sequence)) return;
      const geometry = spotifyJamQrGeometry(matrix);
      if (this.current(sequence)) this.publish({ ...ClosedSnapshot, status: SpotifyJamQrStatus.Ready, geometry });
    } catch {
      if (sequence === this.sequence && sameScope(this.scope, currentScope(this.dependencies.source.getSnapshot()))) {
        this.address = null; this.publish({ ...ClosedSnapshot, status: SpotifyJamQrStatus.Failed });
      }
    }
  };
  revealText = (): void => { if (this.current(this.sequence) && this.snapshot.status === SpotifyJamQrStatus.Ready) this.publish({ ...this.snapshot, textVisible: true }); };
  invitationText = (): string | null => this.snapshot.textVisible && this.current(this.sequence) ? this.address : null;
  share = async (): Promise<void> => {
    const sequence = this.sequence;
    if (!this.current(sequence) || this.snapshot.status !== SpotifyJamQrStatus.Ready || this.address === null) return;
    const address = this.address;
    this.publish({ ...this.snapshot, shareFailed: false });
    if (!this.current(sequence)) return;
    try { await this.dependencies.share(address); }
    catch { if (this.current(sequence)) this.publish({ ...this.snapshot, shareFailed: true }); }
  };
  private current(sequence: number): boolean {
    return sequence === this.sequence && sameScope(this.scope, currentScope(this.dependencies.source.getSnapshot()))
      && this.address !== null && this.address === this.dependencies.source.invitationAddress();
  }
  private observe = (): void => {
    if (this.snapshot.status !== SpotifyJamQrStatus.Closed && (!sameScope(this.scope, currentScope(this.dependencies.source.getSnapshot()))
      || this.address !== null && this.address !== this.dependencies.source.invitationAddress())) this.close();
  };
  private publish(snapshot: SpotifyJamQrSnapshot): void {
    if (snapshot === this.snapshot) return;
    this.snapshot = Object.freeze(snapshot);
    for (const listener of this.listeners) { try { listener(); } catch {} }
  }
}
