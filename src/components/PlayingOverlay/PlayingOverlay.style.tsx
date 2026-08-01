import {
  GestureResponderEvent,
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
import { moderateScale, scale, verticalScale } from '../../utils/scaling';
import CachedImage from '../CachedImage.tsx';

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
    width: '92%',
    height: verticalScale(56),
    borderRadius: moderateScale(14),
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: scale(14),
    paddingVertical: moderateScale(4),
    borderWidth: 0,
    shadowColor: '#1A2F1B',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  metadataContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '78%',
    gap: scale(12),
  },
  cardImage: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(8),
  },
  cardTitle: {
    color: colors.textOnAccent,
    margin: 0,
    fontSize: typography.itemTitle,
    fontWeight: '700',
    maxWidth: '100%',
  },
  cardAuthor: {
    color: colors.textOnAccentMuted,
    margin: 0,
    marginTop: 2,
    fontSize: typography.secondary,
    fontWeight: '400',
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
});

export const MainContainer = ({ children, onPress, style }: Props) => {
  return (
    <Pressable
      style={[styles.mainContainer, { alignSelf: 'center' }, style]}
      onPress={onPress}
    >
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
  return (
    <CachedImage source={source} style={styles.cardImage} resizeMode="cover" />
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
