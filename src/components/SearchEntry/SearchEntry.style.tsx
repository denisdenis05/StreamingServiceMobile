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
import { colors, typography } from '../../constants/styling.tsx';
import ScrollView = Animated.ScrollView;
import { moderateScale, scale, verticalScale } from '../../utils/scaling';

interface Props {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

export const albumCoverSize = moderateScale(50);
export const albumCoverRadius = moderateScale(5);

const styles = StyleSheet.create({
  mainContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(20),
    paddingVertical: verticalScale(10),
    width: '100%',
  },
  cardContainer: {
    display: 'flex',
    flexDirection: 'row',
    gap: scale(10),
  },
  card: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: verticalScale(2),
  },
  cardTitle: {
    color: colors.normalText,
    margin: 0,
    marginTop: verticalScale(5),
    fontSize: typography.itemTitle,
    fontWeight: '600',
  },
  cardAuthor: {
    color: colors.slightlyTransparentText,
    margin: 0,
    fontSize: typography.secondary,
  },
  albumCover: {
    width: albumCoverSize,
    aspectRatio: 1,
    borderRadius: albumCoverRadius,
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

export const CardTitle = ({ children }: Props) => {
  return <DefaultText style={[styles.cardTitle]}>{children}</DefaultText>;
};

export const CardAuthor = ({ children }: Props) => {
  return <DefaultText style={[styles.cardAuthor]}>{children}</DefaultText>;
};
export const AlbumCover = ({ source }: ImageProps) => {
  return <Image source={source} style={styles.albumCover} resizeMode="cover" />;
};
