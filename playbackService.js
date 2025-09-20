import TrackPlayer, { Event } from 'react-native-track-player';

module.exports = async function () {
  // This service needs to be registered for the module to work
  // but it will be used to handle remote events
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () =>
    TrackPlayer.skipToNext()
  );

  TrackPlayer.addEventListener(Event.RemotePrevious, () =>
    TrackPlayer.skipToPrevious()
  );

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

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, event => {
    console.log('Queue ended', event);
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, event => {
    console.log('Track changed', event);
  });

  TrackPlayer.addEventListener('remote-play', () => TrackPlayer.play());
  TrackPlayer.addEventListener('remote-pause', () => TrackPlayer.pause());
  TrackPlayer.addEventListener('remote-next', () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener('remote-previous', () =>
    TrackPlayer.skipToPrevious()
  );
  TrackPlayer.addEventListener('remote-stop', () => TrackPlayer.destroy());
};
