import {
  Animated,
  GestureResponderEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { ReactNode } from 'react';
import DefaultText from '../DefaultText';
import { colors, typography } from '../../constants/styling.tsx';
import ScrollView = Animated.ScrollView;
import { moderateScale, scale, verticalScale } from '../../utils/scaling';
import CachedImage from '../CachedImage.tsx';
import { ImageProps } from 'react-native';

interface Props extends React.ComponentProps<typeof View> {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  numberOfLines?: number;
}

const styles = StyleSheet.create({
  mainContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: verticalScale(20),
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(10),
    width: '100%',
    maxWidth: '100%',
  },
  cardContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    maxWidth: '100%',
    gap: scale(10),
  },
  card: {
    display: 'flex',
    flexDirection: 'row',
    gap: scale(10),
    flex: 1,
    alignItems: 'center',
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: verticalScale(2),
    flex: 1,
  },
  albumCover: {
    width: verticalScale(45),
    height: verticalScale(45),
    borderRadius: moderateScale(4),
  },
  cardTitle: {
    color: colors.normalText,
    margin: 0,
    marginTop: verticalScale(5),
    fontSize: typography.itemTitle,
    fontWeight: '600',
    maxWidth: '100%',
  },
  cardAuthor: {
    color: colors.slightlyTransparentText,
    margin: 0,
    fontSize: typography.secondary,
  },
});

export const MainContainer = ({ children }: Props) => {
  return <View style={[styles.mainContainer]}>{children}</View>;
};

export const CardContainer = ({ children }: Props) => {
  return (
    <View style={styles.cardContainer}>
      {children}
    </View>
  );
};

export const MusicCard = ({ children, onPress }: Props) => {
  return (
    <Pressable style={[styles.card]} onPress={onPress}>
      {children}
    </Pressable>
  );
};

export const AlbumCover = ({ source }: ImageProps) => {
  return (
    <CachedImage source={source} style={styles.albumCover} resizeMode="cover" />
  );
};

export const TextContainer = ({ children }: Props) => {
  return <View style={styles.textContainer}>{children}</View>;
};

export const CardTitle = ({ children, numberOfLines }: Props) => {
  return (
    <DefaultText style={[styles.cardTitle]} numberOfLines={numberOfLines}>
      {children}
    </DefaultText>
  );
};

export const CardAuthor = ({ children, numberOfLines }: Props) => {
  return (
    <DefaultText style={[styles.cardAuthor]} numberOfLines={numberOfLines}>
      {children}
    </DefaultText>
  );
};
