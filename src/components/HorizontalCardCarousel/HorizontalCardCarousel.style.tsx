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
import { colors } from '../../constants/styling.tsx';
import ScrollView = Animated.ScrollView;
import { moderateScale, scale, verticalScale } from '../../utils/scaling';

interface Props {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

const styles = StyleSheet.create({
  mainContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: verticalScale(20),
    width: '100%',
  },
  cardContainer: {
    display: 'flex',
    flexDirection: 'row',
    gap: scale(10),
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: verticalScale(2),
    width: moderateScale(100),
  },
  cardImage: {
    width: moderateScale(100),
    height: moderateScale(100),
    borderRadius: moderateScale(10),
  },
  cardTitle: {
    color: colors.normalText,
    margin: 0,
    marginTop: verticalScale(5),
    fontSize: moderateScale(14),
    fontWeight: 'semibold',
  },
  cardAuthor: {
    color: colors.slightlyTransparentText,
    margin: 0,
    fontSize: moderateScale(12),
  },
});

export const MainContainer = ({ children }: Props) => {
  return <View style={[styles.mainContainer]}>{children}</View>;
};

export const CardContainer = ({ children }: Props) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.cardContainer}
    >
      {children}
    </ScrollView>
  );
};

export const MusicCard = ({ children, onPress }: Props) => {
  return (
    <Pressable style={[styles.card]} onPress={onPress}>
      {children}
    </Pressable>
  );
};

export const CardImage = ({ source }: ImageProps) => {
  return <Image source={source} style={styles.cardImage} resizeMode="cover" />;
};

export const CardTitle = ({ children }: Props) => {
  return (
    <DefaultText style={[styles.cardTitle]} numberOfLines={1}>
      {children}
    </DefaultText>
  );
};

export const CardAuthor = ({ children }: Props) => {
  return (
    <DefaultText style={[styles.cardAuthor]} numberOfLines={1}>
      {children}
    </DefaultText>
  );
};
