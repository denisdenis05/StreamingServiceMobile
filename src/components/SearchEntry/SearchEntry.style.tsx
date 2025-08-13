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

interface Props {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

const styles = StyleSheet.create({
  mainContainer: {
    display: 'flex',
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    width: '100%',
  },
  cardContainer: {
    display: 'flex',
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  cardTitle: {
    color: colors.normalText,
    margin: 0,
    marginTop: 5,
    fontSize: 14,
    fontWeight: 'semibold',
  },
  cardAuthor: {
    color: colors.slightlyTransparentText,
    margin: 0,
    fontSize: 12,
  },
  albumCover: {
    width: 50,
    aspectRatio: 1,
    borderRadius: 5,
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
