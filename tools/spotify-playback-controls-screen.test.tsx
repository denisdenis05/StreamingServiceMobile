import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { HostedPlaybackCommandKind, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { SpotifyPlaybackCommandSnapshot } from '../src/services/spotify/SpotifyPlaybackCommandStore';
import DefaultButton from '../src/components/DefaultButton/DefaultButton.render';

const Imports = Object.freeze({ service: '../src/services/SpotifyMobileService', screen: '../src/pages/SpotifyJam/SpotifyPlaybackControls.render' });
const Fixture = Object.freeze({ seconds: '12.345', firstPosition: 0,
  names: Object.freeze({ idle: 'Host playback controls do not send commands on render',
    command: 'Explicit host playback button %s sends its command', seek: 'Seek submits the entered seconds only on a press',
    disabled: 'Unavailable and pending playback controls disable all mutations',
    uncertain: 'An unknown outcome remains visible and blocks another playback command' }) });
let snapshot: SpotifyPlaybackCommandSnapshot;
const commands = { getSnapshot: () => snapshot, subscribe: () => () => undefined,
  execute: jest.fn(async () => undefined), seek: jest.fn(async () => undefined) };
jest.doMock(Imports.service, () => ({ spotifyPlaybackCommands: commands }));
const { default: SpotifyPlaybackControls, PlaybackControlCopy } = require(Imports.screen);
let rendered: ReactTestRenderer;
function button(title: string) { return rendered.root.findAllByType(DefaultButton).find(candidate => candidate.props.title === title)!; }
async function mount() { await act(async () => { rendered = create(<SpotifyPlaybackControls />); }); }
beforeEach(() => { jest.clearAllMocks(); snapshot = { available: true, pending: false, uncertain: false, failure: null }; });
afterEach(async () => { if (rendered) await act(async () => { rendered.unmount(); }); });
test(Fixture.names.idle, async () => { await mount(); expect(commands.execute).not.toHaveBeenCalled(); expect(commands.seek).not.toHaveBeenCalled(); });
const Commands = Object.values({ play: HostedPlaybackCommandKind.Play, pause: HostedPlaybackCommandKind.Pause,
  next: HostedPlaybackCommandKind.Next, previous: HostedPlaybackCommandKind.Previous });
test.each(Commands)(Fixture.names.command, async kind => { await mount();
  await act(async () => { button(PlaybackControlCopy[kind]).props.onPress(); }); expect(commands.execute).toHaveBeenCalledWith(kind);
});
test(Fixture.names.seek, async () => { await mount(); expect(button(PlaybackControlCopy.seek).props.disabled).toBe(true);
  await act(async () => { rendered.root.findAllByType(TextInput)[Fixture.firstPosition]!.props.onChangeText(Fixture.seconds); });
  await act(async () => { button(PlaybackControlCopy.seek).props.onPress(); }); expect(commands.seek).toHaveBeenCalledWith(Fixture.seconds);
});
test(Fixture.names.disabled, async () => { for (const state of [{ ...snapshot, available: false }, { ...snapshot, pending: true }]) {
  snapshot = state; await mount(); expect(rendered.root.findAllByType(DefaultButton).every(candidate => candidate.props.disabled)).toBe(true);
  await act(async () => { rendered.unmount(); });
} });
test(Fixture.names.uncertain, async () => { snapshot = { ...snapshot, uncertain: true, failure: IntegrationFailureCode.UnknownOutcome };
  await mount(); expect(JSON.stringify(rendered.toJSON())).toContain(PlaybackControlCopy.uncertain);
  expect(rendered.root.findAllByType(DefaultButton).every(candidate => candidate.props.disabled)).toBe(true);
});
