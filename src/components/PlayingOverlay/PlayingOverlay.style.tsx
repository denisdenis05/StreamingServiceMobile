import {
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

interface Props {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

const styles = StyleSheet.create({
  mainContainer: {
    position: 'absolute',
    bottom: sizes.navbarHeight,
    justifyContent: 'space-between',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    width: '60%',
    height: 60,
    borderRadius: 10,
    backgroundColor: 'green',
    padding: 5,
  },
  metadataContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  cardImage: {
    width: 50,
    height: 50,
    borderRadius: 5,
  },
  cardTitle: {
    color: colors.normalText,
    margin: 0,
    marginTop: 5,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardAuthor: {
    color: colors.slightlyTransparentText,
    margin: 0,
    fontSize: 9,
    fontWeight: 'semibold',
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
});

export const MainContainer = ({ children, onPress }: Props) => {
  return (
    <Pressable style={[styles.mainContainer]} onPress={onPress}>
      {children}
    </Pressable>
  );
};

export const TextContainer = ({ children }: Props) => {
  return <View style={[styles.textContainer]}>{children}</View>;
};

export const MetadataContainer = ({ children }: Props) => {
  return <View style={[styles.metadataContainer]}>{children}</View>;
};

export const CardImage = ({ source }: ImageProps) => {
  return <Image source={source} style={styles.cardImage} resizeMode="cover" />;
};

export const CardTitle = ({ children }: Props) => {
  return <DefaultText style={[styles.cardTitle]}>{children}</DefaultText>;
};

export const CardAuthor = ({ children }: Props) => {
  return <DefaultText style={[styles.cardAuthor]}>{children}</DefaultText>;
};
