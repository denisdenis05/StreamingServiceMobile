import {
  GestureResponderEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { ReactNode } from 'react';
import { colors, sizes } from '../../constants/styling.tsx';
import LinearGradient from 'react-native-linear-gradient';
import DefaultText from '../DefaultText';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

const styles = StyleSheet.create({
  gradientContainer: {
    position: 'absolute',
    height: sizes.navbarHeight,
    width: '100%',
    bottom: 0,
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(10),
    paddingHorizontal: verticalScale(10),
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: scale(20),
    width: '100%',
    height: '100%',
  },
  buttonContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: moderateScale(10),
    fontWeight: 'bold',
  },
});

export const GradientContainer = ({ children }: Props) => {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={colors.navbarGradient}
      locations={[0, 0.1, 0.2, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[
        styles.gradientContainer,
        { height: sizes.navbarHeight + insets.bottom, paddingBottom: verticalScale(10) + insets.bottom },
      ]}
    >
      {children}
    </LinearGradient>
  );
};

export const MainContainer = ({ children }: Props) => {
  return <View style={[styles.mainContainer]}>{children}</View>;
};

export const ButtonContainer = ({ children, onPress, style }: Props) => {
  return (
    <Pressable style={[styles.buttonContainer, style]} onPress={onPress}>
      {children}
    </Pressable>
  );
};

export const ButtonText = ({ children }: Props) => {
  return <DefaultText style={[styles.buttonText]}>{children}</DefaultText>;
};
