export {};

const Imports = Object.freeze({ native: 'react-native', platform: '../src/services/SpotifyConnectPlatform' });
const Fixture = Object.freeze({ android: 'android', ios: 'ios', eventName: 'SpotifyConnectSessionEvent', singleCall: 1,
  names: { native: 'Android Connect exposes only the packaged native connection module',
    missing: 'Missing and unsupported platform connections have no event subscription',
    events: 'Connect platform observation forwards events and releases its exact subscription',
    shutdown: 'Android Connect exposes explicit application shutdown through its native module' } });
let operatingSystem: string = Fixture.android;
let available = true;
const native = { shutdown: jest.fn(), start: jest.fn(), close: jest.fn(), refresh: jest.fn() };
const remove = jest.fn(); const addListener = jest.fn(); const emitter = jest.fn();
jest.doMock(Imports.native, () => ({ Platform: { OS: operatingSystem },
  NativeModules: available ? { SpotifyConnectSession: native } : {}, NativeEventEmitter: emitter }));
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); operatingSystem = Fixture.android; available = true;
  addListener.mockReturnValue({ remove }); emitter.mockImplementation(() => ({ addListener }));
});
test(Fixture.names.native, () => { expect(require(Imports.platform).spotifyConnectNative()).toBe(native); });
test(Fixture.names.missing, () => {
  for (const modulePresent of [false, true]) {
    available = modulePresent; operatingSystem = modulePresent ? Fixture.ios : Fixture.android; jest.resetModules();
    const platform = require(Imports.platform); expect(platform.spotifyConnectNative()).toBeNull();
    platform.observeSpotifyConnect(jest.fn())(); expect(emitter).not.toHaveBeenCalled();
  }
});
test(Fixture.names.events, () => {
  const listener = jest.fn(); const close = require(Imports.platform).observeSpotifyConnect(listener);
  expect(emitter).toHaveBeenCalledWith(native); expect(addListener).toHaveBeenCalledWith(Fixture.eventName, listener);
  close(); expect(remove).toHaveBeenCalledTimes(Fixture.singleCall);
});

test(Fixture.names.shutdown, async () => {
  await require(Imports.platform).spotifyConnectNative().shutdown();
  expect(native.shutdown).toHaveBeenCalledTimes(Fixture.singleCall);
});
