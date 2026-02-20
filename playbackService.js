import TrackPlayer, { Event } from 'react-native-track-player';

let emitNextFn = () => { };
let emitPreviousFn = () => { };

try {
  const QueueEventEmitter = require('./src/services/QueueEventEmitter');
  emitNextFn = QueueEventEmitter.emitNext;
  emitPreviousFn = QueueEventEmitter.emitPrevious;
} catch (e) {
  console.warn('[PlaybackService] Failed to load QueueEventEmitter:', e);
}

async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    emitNextFn();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    emitPreviousFn();
  });

  TrackPlayer.addEventListener(Event.RemoteJumpForward, async event => {
    const position = await TrackPlayer.getPosition();
    TrackPlayer.seekTo(position + event.interval);
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async event => {
    const position = await TrackPlayer.getPosition();
    TrackPlayer.seekTo(position - event.interval);
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, event => {
    TrackPlayer.seekTo(event.position);
  });
}

export default playbackService;
