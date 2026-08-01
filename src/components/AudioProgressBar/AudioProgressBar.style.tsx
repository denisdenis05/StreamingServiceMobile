import {
  Animated,
  GestureResponderHandlers,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { colors, typography } from '../../constants/styling.tsx';
import DefaultText from '../DefaultText';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';

interface Props {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  panHandlers?: GestureResponderHandlers; // Updated to match PanResponder.panHandlers
}

const styles = StyleSheet.create({
  mainContainer: {
    width: '100%',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(30),
  },
  progressContainer: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  track: {
    height: verticalScale(6),
    backgroundColor: colors.lowOpacityText,
    borderRadius: moderateScale(10),
    overflow: 'hidden',
  },
  buffer: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: verticalScale(6),
    backgroundColor: colors.borderLight,
    borderRadius: moderateScale(2),
  },
  progress: {
    height: verticalScale(6),
    backgroundColor: colors.accentPrimary,
    borderRadius: moderateScale(2),
  },
  loadingIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: verticalScale(6),
    backgroundColor: colors.secondaryBackground,
    borderRadius: moderateScale(2),
    opacity: 0.8,
  },
  thumb: {
    position: 'absolute',
    width: moderateScale(12),
    height: moderateScale(12),
    backgroundColor: colors.accentPrimary,
    borderRadius: moderateScale(12),
    elevation: 5,
    zIndex: 10,
  },
  touchArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -verticalScale(20),
    height: verticalScale(52),
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: colors.slightlyTransparentText,
    fontSize: typography.caption,
    margin: 0,
  },
});

export const MainContainer = ({ children, style }: Props) => (
  <View style={[styles.mainContainer, style]}>{children}</View>
);

export const ProgressContainer = ({ children }: Props) => (
  <View style={styles.progressContainer}>{children}</View>
);

export const Track = ({
  children,
  onLayout,
}: Props & { onLayout?: (event: any) => void }) => (
  <View style={styles.track} onLayout={onLayout}>
    {children}
  </View>
);

export const Buffer = ({ style }: Props) => (
  <Animated.View style={[styles.buffer, style]} />
);

export const Progress = ({ style }: Props) => (
  <View style={[styles.progress, style]} />
);

export const LoadingIndicator = () => <View style={styles.loadingIndicator} />;

export const Thumb = ({ style, panHandlers }: Props) => (
  <Animated.View style={[styles.thumb, style]} {...panHandlers} />
);

export const TouchArea = ({ panHandlers }: Props) => (
  <View style={styles.touchArea} {...panHandlers} />
);

export const TimeContainer = ({ children }: Props) => (
  <View style={styles.timeContainer}>{children}</View>
);

export const TimeText = ({ children }: Props) => (
  <DefaultText style={styles.timeText}>{children}</DefaultText>
);
