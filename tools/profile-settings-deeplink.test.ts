import {
  ApplicationDeepLinkHandler,
  DeepLinkEvents,
} from '../src/services/DeepLinkHandler';
const Fixture = Object.freeze({
  callback: 'streamingservice://lastfm/callback?token=authorization-token',
  failure: 'streamingservice://lastfm/callback?error=server_error',
  token: 'authorization-token',
  notification: 'trackplayer://notification.click',
  unrelated: 'otherapp://lastfm/callback?token=authorization-token',
  oneCall: 1,
});
function harness() {
  let receive!: (address: string) => void;
  const remove = jest.fn();
  const handler = new ApplicationDeepLinkHandler({
    subscribe: listener => {
      receive = listener;
      return { remove };
    },
    initialAddress: async () => null,
  });
  const listener = jest.fn();
  handler.addListener(listener);
  return { handler, receive, remove, listener };
}
test('Last.fm callback delivers the token only to the explicit callback listener', () => {
  const { receive, listener } = harness();
  receive(Fixture.callback);
  expect(listener).toHaveBeenCalledWith(DeepLinkEvents.lastFmCallback, {
    token: Fixture.token,
  });
});
test('Last.fm failure delivers a sanitized lifecycle event without exposing backend details', () => {
  const { receive, listener } = harness();
  receive(Fixture.failure);
  expect(listener).toHaveBeenCalledWith(DeepLinkEvents.lastFmFailure, {});
});
test('Notification clicks preserve navigation event behavior and reject unrelated schemes', () => {
  const { receive, listener } = harness();
  receive(Fixture.unrelated);
  expect(listener).not.toHaveBeenCalled();
  receive(Fixture.notification);
  expect(listener).toHaveBeenCalledWith(DeepLinkEvents.notification, {});
});
test('Unsubscribed and cleaned-up listeners receive no later callbacks', () => {
  const { handler, receive, remove, listener } = harness();
  handler.cleanup();
  receive(Fixture.callback);
  expect(listener).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledTimes(Fixture.oneCall);
});

test('A failing deep-link observer does not prevent another observer receiving navigation events', () => {
  const { handler, receive } = harness(); const listener = jest.fn();
  handler.addListener(() => { throw new Error(Fixture.token); }); handler.addListener(listener);
  receive(Fixture.notification);
  expect(listener).toHaveBeenCalledWith(DeepLinkEvents.notification, {});
});
