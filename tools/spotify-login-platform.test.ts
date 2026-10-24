export {};

const Imports = Object.freeze({ native: 'react-native', browser: 'react-native-inappbrowser-reborn',
  platform: '../src/services/SpotifyLoginPlatform' });
const Fixture = Object.freeze({ android: 'android', ios: 'ios', event: 'url', success: 'success', cancel: 'cancel',
  authorization: 'https://accounts.spotify.com/authorize?state=platform-test-state',
  redirect: 'streamingservicespotify://callback', callback: 'streamingservicespotify://callback?code=artificial-code&state=platform-test-state',
  flushCount: 30, zero: 0, increment: 1 });
const Names = Object.freeze({ android: 'Android captures the callback while opening a redirect-closing custom tab',
  intent: 'Android recovers the current Activity callback when the custom tab closes without an event',
  ios: 'iOS retains native authentication-session callback handling' });
let operatingSystem: string = Fixture.android;
let receive: ((event: { url: string }) => void) | null = null;
const remove = jest.fn();
const linking = { addEventListener: jest.fn((_event: string, listener: (event: { url: string }) => void) => {
  receive = listener; return { remove }; }), getInitialURL: jest.fn() };
const browser = { isAvailable: jest.fn(), open: jest.fn(), openAuth: jest.fn(), close: jest.fn(), closeAuth: jest.fn() };
jest.doMock(Imports.native, () => ({ Platform: { OS: operatingSystem }, Linking: linking, NativeModules: {} }));
jest.doMock(Imports.browser, () => ({ InAppBrowser: browser }));
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); receive = null; operatingSystem = Fixture.android;
  browser.isAvailable.mockResolvedValue(true); linking.getInitialURL.mockResolvedValue(null);
});
async function flush() { for (let turn = Fixture.zero; turn < Fixture.flushCount; turn += Fixture.increment) await Promise.resolve(); }
function platform() { return require(Imports.platform).spotifyLoginBrowser; }
test(Names.android, async () => {
  browser.open.mockImplementation(async () => { receive?.({ url: Fixture.callback }); return { type: Fixture.cancel }; });
  const adapter = platform();
  expect(await adapter.authorize(Fixture.authorization, Fixture.redirect, new AbortController().signal)).toBe(Fixture.callback);
  expect(browser.open).toHaveBeenCalledWith(Fixture.authorization, { forceCloseOnRedirection: true });
  expect(browser.openAuth).not.toHaveBeenCalled(); expect(linking.addEventListener).toHaveBeenCalledWith(Fixture.event, expect.any(Function));
  expect(remove).toHaveBeenCalled(); expect(browser.close).toHaveBeenCalled();
});
test(Names.intent, async () => {
  linking.getInitialURL.mockResolvedValue(Fixture.callback); browser.open.mockResolvedValue({ type: Fixture.cancel });
  expect(await platform().authorize(Fixture.authorization, Fixture.redirect, new AbortController().signal)).toBe(Fixture.callback);
  expect(linking.getInitialURL).toHaveBeenCalled(); expect(remove).toHaveBeenCalled(); await flush();
});
test(Names.ios, async () => {
  operatingSystem = Fixture.ios; browser.openAuth.mockResolvedValue({ type: Fixture.success, url: Fixture.callback });
  expect(await platform().authorize(Fixture.authorization, Fixture.redirect, new AbortController().signal)).toBe(Fixture.callback);
  expect(browser.openAuth).toHaveBeenCalledWith(Fixture.authorization, Fixture.redirect);
  expect(browser.open).not.toHaveBeenCalled(); expect(linking.addEventListener).not.toHaveBeenCalled();
});
