import {
  Animated,
  GestureResponderEvent,
  Image,
  ImageProps,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { ReactNode } from 'react';
import DefaultText from '../DefaultText';
import { colors, sizes } from '../../constants/styling.tsx';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';
import CachedImage from '../CachedImage.tsx';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

const styles = StyleSheet.create({
  mainContainer: {
    position: 'absolute',
    justifyContent: 'space-between',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '90%',
    height: verticalScale(60),
    borderRadius: moderateScale(10),
    backgroundColor: 'green',
    padding: moderateScale(5),
  },
  metadataContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '75%',
    gap: scale(15),
  },
  cardImage: {
    width: moderateScale(45),
    height: moderateScale(45),
    borderRadius: moderateScale(7),
  },
  cardTitle: {
    color: colors.normalText,
    margin: 0,
    marginTop: verticalScale(5),
    fontSize: moderateScale(12),
    fontWeight: 'bold',
    maxWidth: '100%',
    maxHeight: '100%',
  },
  cardAuthor: {
    color: colors.slightlyTransparentText,
    margin: 0,
    fontSize: moderateScale(9),
    fontWeight: 'semibold',
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
});



export const MainContainer = ({ children, onPress, style }: Props) => {
  const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
  const insets = useSafeAreaInsets();

  return (
    <AnimatedPressable
      style={[styles.mainContainer, { bottom: sizes.navbarHeight + insets.bottom }, style]}
      onPress={onPress}
    >
      {children}
    </AnimatedPressable>
  );
};

export const TextContainer = ({ children }: Props) => {
  return <View style={[styles.textContainer]}>{children}</View>;
};

export const MetadataContainer = ({ children }: Props) => {
  return <View style={[styles.metadataContainer]}>{children}</View>;
};

export const CardImage = ({ source }: ImageProps) => {
  return (
    <CachedImage source={source} style={styles.cardImage} resizeMode="cover" />
  );
};

export const CardTitle = ({ children }: Props) => {
  return <DefaultText style={[styles.cardTitle]}>{children}</DefaultText>;
};

export const CardAuthor = ({ children }: Props) => {
  return <DefaultText style={[styles.cardAuthor]}>{children}</DefaultText>;
};
