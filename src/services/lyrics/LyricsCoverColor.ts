import { useEffect, useState } from 'react';
import { NativeModules } from 'react-native';
import { requestImage } from '../cache/ImageDownloadService';
import { ensureContrastWithWhite } from '../../utils/colorUtils';
import { LyricsPanelPolicy } from '../../components/LyricsPanel/LyricsPanelPolicy';
import type { PlaybackTrackView } from '../player/PlaybackTrack';

const CoverColorPolicy = Object.freeze({
  tier: 'verySmall' as const,
  colorPattern: /^#[a-f\d]{6}$/i,
});
interface NativeCoverColor {
  getColor(address: string): Promise<string | null>;
}
export function useLyricsCoverColor(track: PlaybackTrackView | null) {
  const identity = JSON.stringify([
    track?.albumIdentifier,
    track?.artworkAddress,
    track?.smallArtworkAddress,
    track?.thumbnailArtworkAddress,
  ]);
  const [result, setResult] = useState<{ identity: string; color: string }>({
    identity,
    color: LyricsPanelPolicy.backgroundFallback,
  });
  useEffect(() => {
    let current = true;
    const extractor = NativeModules.CoverColor as NativeCoverColor | undefined;
    if (extractor === undefined || track === null) return;
    const lease = requestImage(
      track.albumIdentifier ?? track.artworkAddress ?? identity,
      CoverColorPolicy.tier,
      {
        cover: track.artworkAddress,
        smallCover: track.smallArtworkAddress,
        verySmallCover: track.thumbnailArtworkAddress,
      },
    );
    void lease.result
      .then(address => extractor.getColor(address))
      .then(color => {
        if (
          current &&
          color !== null &&
          CoverColorPolicy.colorPattern.test(color)
        )
          setResult({ identity, color: ensureContrastWithWhite(color) });
      })
      .catch(() => undefined);
    return () => {
      current = false;
      lease.cancel();
    };
  }, [identity]);
  return result.identity === identity
    ? result.color
    : LyricsPanelPolicy.backgroundFallback;
}
