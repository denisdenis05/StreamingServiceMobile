import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { Modal } from 'react-native';
import { JamConnectionStatus } from 'streaming-service-spotify-jam';
import { SpotifyMobileOperation } from '../src/services/spotify/SpotifyMobileController';
import type { SpotifyMobileSnapshot } from '../src/services/spotify/SpotifyMobileController';
import { SpotifyJamQr, SpotifyJamQrPolicy, SpotifyJamQrStatus, spotifyJamQrGeometry } from '../src/services/spotify/SpotifyJamQr';
import type { SpotifyJamQrMatrix } from '../src/services/spotify/SpotifyJamQr';
import { encodeSpotifyJamQr } from '../src/services/spotify/SpotifyJamQrEncoder';
import DefaultButton from '../src/components/DefaultButton/DefaultButton.render';

const Fixture = Object.freeze({ shortAddress: 'https://spotify.link/synthetic-join', address: 'https://open.spotify.com/socialsession/test-invitation', replacementAddress: 'spotify:socialsession:replacement',
  account: 'qr-account', session: 'qr-session', replacement: 'qr-replacement', empty: '', first: 0,
  excessiveModuleCount: 81, invalidModules: 22, minimumModuleCount: 21, quietZoneSize: 29,
  darkSquare: 'M4 4h1v1h-1z', prefix: 'spotify:socialsession:', invalidAddress: 'https://example.invalid/invite',
  unencodedUnicode: 'spotify:socialsession:é', failureSecret: 'private-invitation-error' });
const Imports = Object.freeze({ service: '../src/services/SpotifyMobileService', screen: '../src/pages/SpotifyJam/SpotifyJamQr.render' });
jest.doMock(Imports.service, () => ({ spotifyMobile: {} }));
const { default: SpotifyJamQrInvitation, SpotifyJamQrCopy } = require(Imports.screen);

function connected(): SpotifyMobileSnapshot {
  return { connected: true, displayName: null, devices: [], selectedDeviceIdentifier: null, operation: SpotifyMobileOperation.Idle,
    session: { accountIdentifier: Fixture.account, status: JamConnectionStatus.Ready, failure: null,
      session: { identifier: Fixture.session, active: true, ownedByCurrentAccount: true, participants: [] } }, failure: null, deviceFailure: null };
}
function matrix(moduleCount: number = Fixture.minimumModuleCount): SpotifyJamQrMatrix {
  return { moduleCount, isDark: (row, column) => row === Fixture.first && column === Fixture.first };
}
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}
function setup() {
  let snapshot = connected();
  let address: string | null = Fixture.address;
  const listeners = new Set<() => void>();
  const source = { getSnapshot: () => snapshot, invitationAddress: jest.fn(() => address),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  const encode = jest.fn<SpotifyJamQrMatrix | Promise<SpotifyJamQrMatrix>, [address: string]>(() => matrix());
  const share = jest.fn<Promise<void>, [address: string]>(async () => undefined);
  const dependencies = { source, encode, share };
  const store = new SpotifyJamQr(dependencies);
  const unsubscribe = store.subscribe(() => undefined);
  return { store, source, encode, share, dependencies, unsubscribe,
    publish: (replacement: SpotifyMobileSnapshot) => { snapshot = replacement; for (const listener of listeners) listener(); },
    rotate: (replacement: string | null) => { address = replacement; for (const listener of listeners) listener(); } };
}

test('QR generation and invitation access require an explicit open action', async () => {
  const fixture = setup();
  expect(fixture.encode).not.toHaveBeenCalled(); expect(fixture.source.invitationAddress).not.toHaveBeenCalled();
  await fixture.store.open(); expect(fixture.encode).toHaveBeenCalledWith(Fixture.address);
  expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Ready);
  expect(fixture.store.invitationText()).toBeNull(); expect(fixture.share).not.toHaveBeenCalled();
  expect(JSON.stringify(fixture.source.getSnapshot())).not.toContain(Fixture.address);
});
test('Text and platform sharing each require explicit consent', async () => {
  const fixture = setup(); await fixture.store.open(); fixture.store.revealText();
  expect(fixture.store.invitationText()).toBe(Fixture.address);
  await fixture.store.share(); expect(fixture.share).toHaveBeenCalledWith(Fixture.address);
});
test.each([
  ['logout', { ...connected(), connected: false }],
  ['pending operation', { ...connected(), operation: SpotifyMobileOperation.Devices }],
  ['account replacement', { ...connected(), session: { ...connected().session!, accountIdentifier: Fixture.replacement } }],
  ['Jam replacement', { ...connected(), session: { ...connected().session!, session: { ...connected().session!.session!, identifier: Fixture.replacement } } }],
  ['uncertain membership', { ...connected(), session: { ...connected().session!, status: JamConnectionStatus.Uncertain } }],
  ['operating membership', { ...connected(), session: { ...connected().session!, status: JamConnectionStatus.Operating } }],
  ['inactive Jam', { ...connected(), session: { ...connected().session!, session: { ...connected().session!.session!, active: false } } }],
  ['removed membership', { ...connected(), session: null }],
] as const)('%s clears QR geometry and invitation text synchronously', async (_name, replacement) => {
  const fixture = setup(); await fixture.store.open(); fixture.store.revealText(); fixture.publish(replacement);
  expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Closed); expect(fixture.store.getSnapshot().geometry).toBeNull();
  expect(fixture.store.invitationText()).toBeNull(); await fixture.store.share(); expect(fixture.share).not.toHaveBeenCalled();
});
test('Invitation rotation within the same Jam clears the old QR', async () => {
  const fixture = setup(); await fixture.store.open(); fixture.rotate(Fixture.replacementAddress);
  expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Closed);
  await fixture.store.open(); expect(fixture.encode).toHaveBeenLastCalledWith(Fixture.replacementAddress);
});
test('Closing during generation prevents a stale completion from reopening the QR', async () => {
  const fixture = setup(); const pending = deferred<SpotifyJamQrMatrix>(); fixture.encode.mockReturnValue(pending.promise);
  const opening = fixture.store.open(); fixture.store.close(); pending.resolve(matrix()); await opening;
  expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Closed);
});
test('An older generation cannot overwrite a newer explicit open', async () => {
  const fixture = setup(); const pending = deferred<SpotifyJamQrMatrix>(); fixture.encode.mockReturnValueOnce(pending.promise);
  const opening = fixture.store.open(); await fixture.store.open(); const latest = fixture.store.getSnapshot();
  pending.reject(new Error(Fixture.failureSecret)); await opening; expect(fixture.store.getSnapshot()).toBe(latest);
});
test('Readiness loss followed by recovery cannot resurrect a pending generation', async () => {
  const fixture = setup(); const pending = deferred<SpotifyJamQrMatrix>(); fixture.encode.mockReturnValue(pending.promise);
  const opening = fixture.store.open(); fixture.publish({ ...connected(), connected: false }); fixture.publish(connected());
  pending.resolve(matrix()); await opening; expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Closed);
});
test('Last subscriber removal clears secrets and fences pending work', async () => {
  const fixture = setup(); await fixture.store.open(); fixture.store.revealText(); fixture.unsubscribe();
  expect(fixture.store.invitationText()).toBeNull(); expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Closed);
});
test.each([null, Fixture.empty, Fixture.invalidAddress, Fixture.unencodedUnicode,
  Fixture.prefix + Fixture.account.repeat(SpotifyJamQrPolicy.maximumPayloadCharacters)])('Invalid or oversized invitations fail without encoding or exposing values: %s', async address => {
  const fixture = setup(); fixture.rotate(address); await fixture.store.open();
  expect(fixture.encode).not.toHaveBeenCalled(); expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Failed);
  expect(fixture.store.invitationText()).toBeNull();
});
test('The maximum ASCII payload is encoded while excessive module density is rejected', async () => {
  const fixture = setup(); fixture.rotate(Fixture.prefix + Fixture.account.charAt(Fixture.first).repeat(SpotifyJamQrPolicy.maximumPayloadCharacters - Fixture.prefix.length));
  await fixture.store.open(); expect(fixture.encode).toHaveBeenCalled(); expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Ready);
  fixture.encode.mockReturnValue(matrix(Fixture.excessiveModuleCount)); await fixture.store.open();
  expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Failed);
});
test('Encoder rejection produces a fixed failure without copying the error or invitation', async () => {
  const fixture = setup(); fixture.encode.mockImplementation(() => { throw new Error(Fixture.failureSecret); }); await fixture.store.open();
  const serialized = JSON.stringify(fixture.store.getSnapshot());
  expect(serialized).not.toContain(Fixture.failureSecret); expect(serialized).not.toContain(Fixture.address);
  expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Failed);
});
test('Delayed share rejection cannot modify a closed or replaced QR', async () => {
  const fixture = setup(); const pending = deferred<void>(); fixture.share.mockReturnValue(pending.promise);
  await fixture.store.open(); const sharing = fixture.store.share(); fixture.store.close();
  pending.reject(new Error(Fixture.failureSecret)); await sharing; expect(fixture.store.getSnapshot().shareFailed).toBe(false);
});
test('Current platform share failure is accessible and keeps the current invitation usable', async () => {
  const fixture = setup(); fixture.share.mockRejectedValue(new Error(Fixture.failureSecret)); await fixture.store.open(); await fixture.store.share();
  expect(fixture.store.getSnapshot().shareFailed).toBe(true); fixture.store.revealText(); expect(fixture.store.invitationText()).toBe(Fixture.address);
});
test('Geometry preserves a four module quiet zone on every side', () => {
  const geometry = spotifyJamQrGeometry(matrix()); expect(geometry.sizeModules).toBe(Fixture.quietZoneSize); expect(geometry.path).toBe(Fixture.darkSquare);
  expect(() => spotifyJamQrGeometry(matrix(Fixture.invalidModules))).toThrow();
});
test('Production offline encoder produces deterministic real finder patterns from the invitation', () => {
  const encoded = encodeSpotifyJamQr(Fixture.address); const repeated = encodeSpotifyJamQr(Fixture.address);
  expect(spotifyJamQrGeometry(encoded)).toEqual(spotifyJamQrGeometry(repeated));
  expect(encoded.isDark(Fixture.first, Fixture.first)).toBe(true);
  expect(encoded.moduleCount).toBeGreaterThanOrEqual(SpotifyJamQrPolicy.minimumModuleCount);
  expect(encoded.moduleCount).toBeLessThanOrEqual(SpotifyJamQrPolicy.maximumModuleCount);
});
let rendered: ReactTestRenderer | undefined;
afterEach(async () => { if (rendered) await act(async () => rendered!.unmount()); rendered = undefined; });
function button(title: string) { return rendered!.root.findAllByType(DefaultButton).find(instance => instance.props.title === title)!; }
test('QR UI opens only on a press and offers accessible text, sharing and close', async () => {
  const fixture = setup(); await act(async () => { rendered = create(<SpotifyJamQrInvitation disabled={false} dependencies={fixture.dependencies} />); });
  expect(fixture.encode).not.toHaveBeenCalled(); expect(rendered!.root.findByType(Modal).props.visible).toBe(false);
  await act(async () => button(SpotifyJamQrCopy.open).props.onPress()); expect(rendered!.root.findByType(Modal).props.visible).toBe(true);
  expect(JSON.stringify(rendered!.toJSON())).toContain(SpotifyJamQrCopy.scanning);
  expect(JSON.stringify(rendered!.toJSON())).not.toContain(Fixture.address);
  await act(async () => button(SpotifyJamQrCopy.showText).props.onPress()); expect(JSON.stringify(rendered!.toJSON())).toContain(Fixture.address);
  await act(async () => button(SpotifyJamQrCopy.share).props.onPress()); expect(fixture.share).toHaveBeenCalledWith(Fixture.address);
  await act(async () => button(SpotifyJamQrCopy.close).props.onPress()); expect(rendered!.root.findByType(Modal).props.visible).toBe(false);
});
test('QR UI retires the modal immediately on logout and shows fixed generation failure copy', async () => {
  const fixture = setup(); await act(async () => { rendered = create(<SpotifyJamQrInvitation disabled={false} dependencies={fixture.dependencies} />); });
  await act(async () => button(SpotifyJamQrCopy.open).props.onPress());
  await act(async () => fixture.publish({ ...connected(), connected: false })); expect(rendered!.root.findByType(Modal).props.visible).toBe(false);
  fixture.publish(connected()); fixture.encode.mockImplementation(() => { throw new Error(Fixture.failureSecret); });
  await act(async () => button(SpotifyJamQrCopy.open).props.onPress()); expect(JSON.stringify(rendered!.toJSON())).toContain(SpotifyJamQrCopy.failed);
  expect(JSON.stringify(rendered!.toJSON())).not.toContain(Fixture.failureSecret);
});

test('A synchronous retirement while opening prevents reading or encoding an invitation', async () => {
  const fixture = setup();
  fixture.store.subscribe(() => {
    if (fixture.store.getSnapshot().status === SpotifyJamQrStatus.Generating) fixture.publish({ ...connected(), connected: false });
  });
  await fixture.store.open(); expect(fixture.encode).not.toHaveBeenCalled(); expect(fixture.source.invitationAddress).not.toHaveBeenCalled();
  expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Closed);
});
test('A synchronous retirement while requesting share prevents external dispatch', async () => {
  const fixture = setup(); await fixture.store.open();
  fixture.store.subscribe(() => { if (fixture.store.getSnapshot().status === SpotifyJamQrStatus.Ready) fixture.store.close(); });
  await fixture.store.share(); expect(fixture.share).not.toHaveBeenCalled(); expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Closed);
});

test('Existing supported Spotify short invitations are encoded without fetching or rewriting', async () => {
  const invitation = Fixture.shortAddress;
  const fixture = setup(); fixture.rotate(invitation); await fixture.store.open();
  expect(fixture.encode).toHaveBeenCalledWith(invitation);
  expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Ready);
});
test('A failing QR observer cannot prevent another subscriber or close retirement', async () => {
  const fixture = setup(); const listener = jest.fn();
  fixture.store.subscribe(() => { throw new Error(Fixture.failureSecret); }); fixture.store.subscribe(listener);
  await fixture.store.open(); expect(listener).toHaveBeenCalled(); fixture.store.close();
  expect(fixture.store.invitationText()).toBeNull(); expect(fixture.store.getSnapshot().status).toBe(SpotifyJamQrStatus.Closed);
});
