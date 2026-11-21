import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ShuffleIcon from '../../../assets/icons/shuffleIcon';
import PreviousIcon from '../../../assets/icons/backwardIcon';
import PlayIcon from '../../../assets/icons/playIcon';
import PauseIcon from '../../../assets/icons/pauseIcon';
import NextIcon from '../../../assets/icons/forwardIcon';
import RepeatIcon from '../../../assets/icons/repeatIcon';
import RepeatOnceIcon from '../../../assets/icons/repeatOnceIcon';
import { iconSizes } from '../../constants/styling';
import { moderateScale } from '../../utils/scaling';
import {
  PlayingControlGeometry,
  PlayingControlGlyph,
  playingControlPlacement,
} from './PlayingControlGeometry';

const Glyphs = Object.freeze({
  shuffle: ShuffleIcon,
  previous: PreviousIcon,
  play: PlayIcon,
  pause: PauseIcon,
  next: NextIcon,
  repeat: RepeatIcon,
  repeatOnce: RepeatOnceIcon,
});
export const PlayingControlButtonPolicy = Object.freeze({
  minimumTouchSize: 48,
  disabledOpacity: 0.4,
  shuffle: 'Shuffle',
  previous: 'Previous song',
  play: 'Play',
  pause: 'Pause',
  next: 'Next song',
  repeat: 'Repeat mode',
});
export function PlayingControlButton({
  glyph,
  label,
  color,
  onPress,
  disabled = false,
  selected = false,
}: {
  readonly glyph: PlayingControlGlyph;
  readonly label: string;
  readonly color: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
}) {
  const size = moderateScale(iconSizes.lg);
  const hitInset = Math.max(
    PlayingControlGeometry.minimumOffset,
    (moderateScale(PlayingControlButtonPolicy.minimumTouchSize) - size) /
      PlayingControlGeometry.centerDivision,
  );
  const placement = playingControlPlacement(glyph, size);
  const Glyph = Glyphs[glyph];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      hitSlop={hitInset}
      onPress={onPress}
      style={[{ width: size, height: size }, disabled && styles.disabled]}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: placement.left,
          top: placement.top,
        }}
      >
        <Glyph
          width={placement.canvasSize}
          height={placement.canvasSize}
          fill={color}
        />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  disabled: { opacity: PlayingControlButtonPolicy.disabledOpacity },
});
