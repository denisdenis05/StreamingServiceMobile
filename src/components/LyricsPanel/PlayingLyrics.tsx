import React from 'react';
import { usePlaybackProgress } from '../../services/AudioPlayerService';
import { LyricsPanel } from './LyricsPanel';
import { LyricsPanelPolicy } from './LyricsPanelPolicy';
import { LyricsPolicy } from '../../services/lyrics/LyricsDocument';
import type { LyricsState } from '../../services/lyrics/LyricsRepository';

export function PlayingLyrics(properties: {
  readonly state: LyricsState;
  readonly entryIdentifier: string;
  readonly backgroundColor: string;
  readonly expanded: boolean;
  readonly onExpand: () => void;
  readonly onMinimize: () => void;
  readonly onSeek: (seconds: number) => void;
  readonly seekEnabled: boolean;
  readonly onRetry: () => void;
}) {
  const progress = usePlaybackProgress();
  const position =
    progress.entryIdentifier === properties.entryIdentifier
      ? progress.position * LyricsPolicy.millisecondsPerSecond
      : LyricsPanelPolicy.noOffset;
  return (
    <LyricsPanel
      document={properties.state.document}
      positionMilliseconds={position}
      backgroundColor={properties.backgroundColor}
      expanded={properties.expanded}
      onExpand={properties.onExpand}
      onMinimize={properties.onMinimize}
      onSeek={properties.onSeek}
      seekEnabled={properties.seekEnabled}
      message={properties.state.message}
      onRetry={properties.onRetry}
      retryable={properties.state.retryable}
    />
  );
}
