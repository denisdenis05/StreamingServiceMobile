import {
  Animated,
  Image,
  ImageProps,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ReactNode } from 'react';
import DefaultText from '../../components/DefaultText';
import ScrollView = Animated.ScrollView;
import { sizes } from '../../constants/styling.tsx';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';
import CachedImage from '../../components/CachedImage.tsx';

interface Props {
  children: ReactNode;
}

interface StyledImageProps extends ImageProps {
  redirect?: string;
  navigation?: any;
}

const styles = StyleSheet.create({
  headerContainer: {
    display: 'flex',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  contentContainer: {
    flexGrow: 1,
    display: 'flex',
    width: '100%',
    minHeight: '100%',
    flexDirection: 'column',
    gap: verticalScale(40),
    paddingBottom: sizes.navbarHeight,
  },
  image: { height: moderateScale(40), width: moderateScale(40), borderRadius: moderateScale(20) },
  title: { fontWeight: 'bold', fontSize: moderateScale(24) },
});

export const HeaderContainer = ({ children }: Props) => {
  return <View style={styles.headerContainer}>{children}</View>;
};

export const ContentContainer = ({ children }: Props) => {
  return (
    <ScrollView
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
};

export const StyledImage = ({
  source,
  redirect,
  navigation,
}: StyledImageProps) => {
  return (
    <TouchableOpacity onPress={() => navigation.navigate(redirect)}>
      <CachedImage source={source} style={styles.image} resizeMode="cover" />
    </TouchableOpacity>
  );
};

export const HeaderTitle = ({ children }: Props) => {
  return <DefaultText style={styles.title}>{children}</DefaultText>;
};
