import {
  Animated,
  GestureResponderHandlers,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../../constants/styling.tsx';
import DefaultText from '../DefaultText';

interface Props {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  panHandlers?: GestureResponderHandlers; // Updated to match PanResponder.panHandlers
}

const styles = StyleSheet.create({
  mainContainer: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 30,
  },
  progressContainer: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 8,
  },
  track: {
    height: 8, // Increased for visibility
    backgroundColor: colors.slightlyTransparentText,
    borderRadius: 10,
    overflow: 'hidden',
  },
  buffer: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 12,
    backgroundColor: colors.normalText,
    borderRadius: 2,
  },
  progress: {
    height: 12,
    backgroundColor: colors.normalText,
    borderRadius: 2,
  },
  loadingIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 12,
    backgroundColor: '#666',
    borderRadius: 2,
    opacity: 0.6,
  },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    backgroundColor: colors.normalText,
    borderRadius: 10,
    elevation: 5,
    zIndex: 10,
  },
  touchArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -20,
    height: 52, // Large touch area for easier interaction
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: colors.slightlyTransparentText,
    fontSize: 12,
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
