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
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(10),
    width: '100%',
  },
  cardContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: scale(10),
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: verticalScale(2),
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

export const CardTitle = ({ children }: Props) => {
  return <DefaultText style={[styles.cardTitle]}>{children}</DefaultText>;
};

export const CardAuthor = ({ children }: Props) => {
  return <DefaultText style={[styles.cardAuthor]}>{children}</DefaultText>;
};
