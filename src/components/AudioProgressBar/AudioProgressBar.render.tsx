import React, { useState, useEffect, useRef } from 'react';
import { PanResponder, Animated, Dimensions } from 'react-native';
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
  isLoading?: boolean;
  isBuffering?: boolean;
  onSeek?: (timeInSeconds: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  showTimeLabels?: boolean;
  showThumb?: boolean;
  disabled?: boolean;
  containerStyle?: any;
}

const AudioProgressBar = ({
  currentTime = 0,
  duration = 0,
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
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH - 40);

  const thumbOpacity = useRef(new Animated.Value(showThumb ? 1 : 0)).current;
  const bufferWidth = useRef(new Animated.Value(0)).current;

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const displayTime = isDragging
    ? (dragPosition * duration) / 100
    : currentTime;

  const formatTime = (timeInSeconds: number) => {
    if (!timeInSeconds || isNaN(timeInSeconds)) return '0:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (showThumb) {
      Animated.timing(thumbOpacity, {
        toValue: isDragging ? 1 : 0.8,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [isDragging, showThumb]);

  useEffect(() => {
    if (isBuffering && duration > 0) {
      const bufferPercentage =
        Math.min((currentTime + 10) / duration, 1) * containerWidth;
      Animated.timing(bufferWidth, {
        toValue: bufferPercentage,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [currentTime, duration, isBuffering, containerWidth]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled && !isLoading,
    onMoveShouldSetPanResponder: () => !disabled && !isLoading,
    onPanResponderGrant: evt => {
      const { locationX } = evt.nativeEvent;
      const percentage = Math.max(
        0,
        Math.min(100, (locationX / containerWidth) * 100)
      );
      setIsDragging(true);
      setDragPosition(percentage);
      onSeekStart?.();
    },
    onPanResponderMove: evt => {
      const { locationX } = evt.nativeEvent;
      const percentage = Math.max(
        0,
        Math.min(100, (locationX / containerWidth) * 100)
      );
      setDragPosition(percentage);
    },
    onPanResponderRelease: () => {
      const seekTime = (dragPosition / 100) * duration;
      setIsDragging(false);
      onSeek?.(seekTime);
      onSeekEnd?.();
    },
  });

  const currentProgress = isDragging ? dragPosition : progressPercentage;
  const progressWidth = (currentProgress / 100) * containerWidth;
  const thumbPosition = Math.max(
    0,
    Math.min(containerWidth - 20, progressWidth - 10)
  );

  return (
    <MainContainer style={containerStyle}>
      <ProgressContainer>
        <Track
          onLayout={event => {
            const { width } = event.nativeEvent.layout;
            setContainerWidth(width);
          }}
        >
          {isBuffering && <Buffer style={{ width: bufferWidth }} />}
          <Progress style={{ width: `${currentProgress}%` }} />
          {isLoading && <LoadingIndicator />}
        </Track>
        {showThumb && !isLoading && (
          <Thumb
            style={{ left: thumbPosition }}
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
