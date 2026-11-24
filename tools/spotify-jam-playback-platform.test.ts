export {};

const Imports = Object.freeze({ native: 'react-native', platform: '../src/services/SpotifyJamPlaybackPlatform' });
const Fixture = Object.freeze({ android: 'android', ios: 'ios', eventName: 'SpotifyJamPlaybackChanged', singleCount: 1,
  names: { native: 'Android Jam playback exposes the packaged native runtime',
    unavailable: 'Unsupported platforms and missing Jam playback modules cannot subscribe to native events',
    events: 'Jam playback observations use their exact native module and release the registered listener' } });
let operatingSystem: string = Fixture.android;
let available = true;
const native = { startFollowing: jest.fn(), stopFollowing: jest.fn(), getSnapshot: jest.fn(), updateApplicationAccount: jest.fn() };
const remove = jest.fn(); const addListener = jest.fn(); const emitter = jest.fn();
jest.doMock(Imports.native, () => ({ Platform: { OS: operatingSystem },
  NativeModules: available ? { SpotifyJamPlayback: native } : {}, NativeEventEmitter: emitter }));
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); operatingSystem = Fixture.android; available = true;
  addListener.mockReturnValue({ remove }); emitter.mockImplementation(() => ({ addListener }));
});
test(Fixture.names.native, () => { expect(require(Imports.platform).spotifyJamPlaybackNative()).toBe(native); });
test(Fixture.names.unavailable, () => {
  for (const moduleAvailable of [true, false]) {
    available = moduleAvailable; operatingSystem = moduleAvailable ? Fixture.ios : Fixture.android; jest.resetModules();
    const platform = require(Imports.platform); expect(platform.spotifyJamPlaybackNative()).toBeNull();
    platform.observeSpotifyJamPlayback(jest.fn())(); expect(emitter).not.toHaveBeenCalled();
  }
});
test(Fixture.names.events, () => {
  const listener = jest.fn(); const release = require(Imports.platform).observeSpotifyJamPlayback(listener);
  expect(emitter).toHaveBeenCalledWith(native); expect(addListener).toHaveBeenCalledWith(Fixture.eventName, listener);
  release(); expect(remove).toHaveBeenCalledTimes(Fixture.singleCount);
});
