import React, { useState, useEffect, useRef } from 'react';
import { PanResponder, Dimensions } from 'react-native';
import { usePlaybackProgress } from '../../services/AudioPlayerService';
import { colors } from '../../constants/styling.tsx';
import {
  MainContainer,
  ProgressContainer,
  Track,
  Progress,
  LoadingIndicator,
  Thumb,
  TouchArea,
  TimeContainer,
  TimeText,
} from './AudioProgressBar.style.tsx';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AudioProgressBarProps {
  currentTime?: number;
  duration?: number;
  isLoading: boolean;
  isBuffering: boolean;
  onSeek?: (timeInSeconds: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  showTimeLabels?: boolean;
  showThumb?: boolean;
  disabled?: boolean;
  containerStyle?: any;
}

const AudioProgressBar = ({
  isLoading = false,
  isBuffering = false,
  onSeek,
  onSeekStart,
  onSeekEnd,
  showTimeLabels = true,
  showThumb = true,
  disabled = false,
  containerStyle,
}: AudioProgressBarProps) => {
  const { position, duration } = usePlaybackProgress();
  const [isDragging, setIsDragging] = useState(false);
  const [dragPercentage, setDragPercentage] = useState(0);
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH - 60);
  const [postSeekPosition, setPostSeekPosition] = useState<number | null>(null);

  // Refs so PanResponder callbacks (created once) always read current values
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const containerWidthRef = useRef(containerWidth);
  containerWidthRef.current = containerWidth;
  const dragPercentageRef = useRef(dragPercentage);
  dragPercentageRef.current = dragPercentage;
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const onSeekStartRef = useRef(onSeekStart);
  onSeekStartRef.current = onSeekStart;
  const onSeekEndRef = useRef(onSeekEnd);
  onSeekEndRef.current = onSeekEnd;

  // Clear postSeekPosition once the player position catches up
  useEffect(() => {
    if (postSeekPosition !== null && Math.abs(position - postSeekPosition) < 2) {
      setPostSeekPosition(null);
    }
  }, [position, postSeekPosition]);

  const progressPercentage = duration > 0 ? (position / duration) * 100 : 0;
  const displayTime = isDragging
    ? (dragPercentage / 100) * duration
    : postSeekPosition !== null
    ? postSeekPosition
    : position;

  const formatTime = (timeInSeconds: number) => {
    if (!timeInSeconds || isNaN(timeInSeconds) || timeInSeconds < 0) return '0:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Uses locationX (relative to TouchArea, which starts at left: 0 of the track)
  // so no pageX offset calculation is needed
  const calculatePercentage = (locationX: number) => {
    const width = containerWidthRef.current;
    if (width <= 0) return 0;
    return Math.max(0, Math.min(100, (locationX / width) * 100));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current && !isLoadingRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current && !isLoadingRef.current,
      onPanResponderGrant: evt => {
        const pct = calculatePercentage(evt.nativeEvent.locationX);
        setIsDragging(true);
        setDragPercentage(pct);
        onSeekStartRef.current?.();
      },
      onPanResponderMove: evt => {
        const pct = calculatePercentage(evt.nativeEvent.locationX);
        setDragPercentage(pct);
      },
      onPanResponderRelease: () => {
        const targetPct = dragPercentageRef.current;
        const seekTime = (targetPct / 100) * durationRef.current;
        setIsDragging(false);
        setPostSeekPosition(seekTime);
        onSeekRef.current?.(seekTime);
        onSeekEndRef.current?.();
      },
    })
  ).current;

  const currentProgress = isDragging ? dragPercentage : progressPercentage;
  const progressWidth = (currentProgress / 100) * containerWidth;
  const thumbPosition = Math.max(0, Math.min(containerWidth - 12, progressWidth - 6));

  return (
    <MainContainer style={containerStyle}>
      <ProgressContainer>
        <Track
          onLayout={event => {
            const { width } = event.nativeEvent.layout;
            if (width > 0) setContainerWidth(width);
          }}
        >
          <Progress style={{ width: `${currentProgress}%`, backgroundColor: colors.accentPrimary }} />
          {isLoading && <LoadingIndicator />}
        </Track>
        {showThumb && !isLoading && (
          <Thumb style={{ left: thumbPosition, backgroundColor: colors.accentPrimary }} />
        )}
        {/* Thumb is purely visual; all gesture handling goes through TouchArea */}
        <TouchArea panHandlers={panResponder.panHandlers} />
      </ProgressContainer>
      {showTimeLabels && (
        <TimeContainer>
          <TimeText>{formatTime(displayTime)}</TimeText>
          <TimeText>{formatTime(duration)}</TimeText>
        </TimeContainer>
      )}
    </MainContainer>
  );
};

export default AudioProgressBar;
