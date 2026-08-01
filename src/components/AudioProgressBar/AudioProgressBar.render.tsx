import React, { useState, useEffect, useRef } from 'react';
import { PanResponder, Animated, Dimensions } from 'react-native';
import { useProgress } from 'react-native-track-player';
import { colors } from '../../constants/styling.tsx';
import {
  MainContainer,
  ProgressContainer,
  Track,
  Buffer,
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
  const { position, duration } = useProgress(250);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPercentage, setDragPercentage] = useState(0);
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH - 60);
  const trackPageX = useRef(0);

  const progressPercentage = duration > 0 ? (position / duration) * 100 : 0;
  const displayTime = isDragging
    ? (dragPercentage / 100) * duration
    : position;

  const formatTime = (timeInSeconds: number) => {
    if (!timeInSeconds || isNaN(timeInSeconds) || timeInSeconds < 0) return '0:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const calculatePercentage = (pageX: number) => {
    if (containerWidth <= 0) return 0;
    const relativeX = pageX - trackPageX.current;
    return Math.max(0, Math.min(100, (relativeX / containerWidth) * 100));
  };

  const dragPercentageRef = useRef(dragPercentage);
  dragPercentageRef.current = dragPercentage;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled && !isLoading,
      onMoveShouldSetPanResponder: () => !disabled && !isLoading,
      onPanResponderGrant: evt => {
        const pct = calculatePercentage(evt.nativeEvent.pageX);
        setIsDragging(true);
        setDragPercentage(pct);
        onSeekStart?.();
      },
      onPanResponderMove: evt => {
        const pct = calculatePercentage(evt.nativeEvent.pageX);
        setDragPercentage(pct);
      },
      onPanResponderRelease: () => {
        const targetPct = dragPercentageRef.current;
        const seekTime = (targetPct / 100) * duration;
        setIsDragging(false);
        onSeek?.(seekTime);
        onSeekEnd?.();
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
            event.target?.measure?.((_x: number, _y: number, _w: number, _h: number, pageX: number) => {
              if (pageX) trackPageX.current = pageX;
            });
          }}
        >
          <Progress style={{ width: `${currentProgress}%`, backgroundColor: colors.accentPrimary }} />
          {isLoading && <LoadingIndicator />}
        </Track>
        {showThumb && !isLoading && (
          <Thumb
            style={{ left: thumbPosition, backgroundColor: colors.accentPrimary }}
            panHandlers={panResponder.panHandlers}
          />
        )}
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

