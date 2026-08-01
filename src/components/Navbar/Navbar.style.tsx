import {
  GestureResponderEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { ReactNode } from 'react';
import { colors, typography } from '../../constants/styling.tsx';
import DefaultText from '../DefaultText';
import { moderateScale, scale } from '../../utils/scaling';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: any) => void;
}

interface ButtonTextProps {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}

const styles = StyleSheet.create({
  gradientContainer: {
    position: 'absolute',
    width: '100%',
    bottom: 0,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: moderateScale(8),
    paddingHorizontal: scale(4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
  },
  buttonContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: moderateScale(4),
    paddingHorizontal: moderateScale(8),
    gap: moderateScale(4),
  },
  iconPill: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: moderateScale(12),
    padding: moderateScale(8),
  },
  buttonText: {
    fontSize: typography.navLabel,
    fontWeight: '600',
    color: colors.normalText,
  },
});

export const GradientContainer = ({ children, onLayout }: Props) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.gradientContainer,
        { paddingBottom: moderateScale(8) + insets.bottom },
      ]}
    >
      {children}
    </View>
  );
};

export const MainContainer = ({ children }: Props) => {
  return <View style={styles.mainContainer}>{children}</View>;
};

export const ButtonContainer = ({ children, onPress }: Props) => {
  return (
    <Pressable style={styles.buttonContainer} onPress={onPress}>
      {children}
    </Pressable>
  );
};

export const IconPill = ({ children, style }: Props) => {
  return <View style={[styles.iconPill, style]}>{children}</View>;
};

export const ButtonText = ({ children, style }: ButtonTextProps) => {
  return <DefaultText style={[styles.buttonText, style]}>{children}</DefaultText>;
};
