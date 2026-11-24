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
import { colors, sizes, typography } from '../../constants/styling.tsx';
import ScrollView = Animated.ScrollView;
import { moderateScale, scale, verticalScale } from '../../utils/scaling';
import CachedImage from '../CachedImage.tsx';

interface Props {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

export const cardImageSize = moderateScale(sizes.albumCoverHomeHeight);
export const cardImageRadius = moderateScale(10);

const styles = StyleSheet.create({
  mainContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: verticalScale(14),
    width: '100%',
  },
  cardContainer: {
    display: 'flex',
    flexDirection: 'row',
    gap: scale(14),
    paddingRight: scale(20),
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: verticalScale(3),
    width: cardImageSize,
  },
  cardImage: {
    width: cardImageSize,
    height: cardImageSize,
    borderRadius: cardImageRadius,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cardTitle: {
    color: colors.normalText,
    margin: 0,
    marginTop: verticalScale(6),
    fontSize: typography.itemTitle,
    fontWeight: '600',
    lineHeight: moderateScale(18),
  },
  cardAuthor: {
    color: colors.slightlyTransparentText,
    margin: 0,
    fontSize: typography.secondary,
    fontWeight: '400',
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
    <Pressable style={({ pressed }) => [styles.card, { opacity: pressed ? 0.75 : 1 }]} onPress={onPress}>
      {children}
    </Pressable>
  );
};

interface CardImageProps {
  releaseId?: string;
  cover?: string;
  smallCover?: string;
  verySmallCover?: string;
}

export const CardImage = ({ releaseId, cover, smallCover, verySmallCover }: CardImageProps) => {
  return (
    <CachedImage
      releaseId={releaseId}
      cover={cover}
      smallCover={smallCover}
      verySmallCover={verySmallCover}
      tier="small"
      style={styles.cardImage}
      resizeMode="cover"
    />
  );
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

