import { ReactNode } from 'react';
import {
  ImageProps,
  SafeAreaView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { colors, fonts, typography } from '../../constants/styling.tsx';
import DefaultText from '../../components/DefaultText';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';
import CachedImage from '../../components/CachedImage.tsx';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    paddingTop: moderateScale(20),
    gap: verticalScale(10),
    height: '100%',
    borderTopLeftRadius: moderateScale(15),
    borderTopRightRadius: moderateScale(15),
  },
  songDetailsContainer: {
    display: 'flex',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(20),
    paddingHorizontal: scale(30),
    gap: scale(20),
  },
  songDescriptorContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: verticalScale(2),
  },
  dragIndicator: {
    width: scale(40),
    height: verticalScale(4),
    backgroundColor: 'rgba(42, 36, 32, 0.2)',
    borderRadius: moderateScale(2),
    alignSelf: 'center',
    marginBottom: verticalScale(20),
  },
  header: {
    width: '100%',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(30),
  },
  headerTitle: {
    fontWeight: '500',
    fontSize: typography.secondary,
    textAlign: 'center',
    color: colors.slightlyTransparentText,
  },
  songTitle: {
    fontFamily: fonts.serif,
    fontSize: typography.dialogTitle,
    letterSpacing: -0.3,
  },
  songAuthor: {
    fontWeight: '400',
    fontSize: typography.secondary,
    color: colors.slightlyTransparentText,
  },
  albumCover: {
    width: '80%',
    aspectRatio: 1,
    borderRadius: moderateScale(20),
  },
  allPlayingControlsContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(30),
    marginBottom: verticalScale(30),
  },
});

export const BackdropContainer = ({ children, style }: Props) => {
  return <View style={[styles.backdrop, style]}>{children}</View>;
};

export const ContentContainer = ({ children, style }: Props) => {
  return (
    <SafeAreaView style={[styles.content, style]}>{children}</SafeAreaView>
  );
};

export const DragIndicator = () => {
  return <View style={styles.dragIndicator} />;
};

export const HeaderContainer = ({ children }: Props) => {
  return <View style={styles.header}>{children}</View>;
};

export const HeaderTitle = ({ children }: Props) => {
  return <DefaultText style={styles.headerTitle}>{children}</DefaultText>;
};

export const AlbumCover = ({ source }: ImageProps) => {
  return (
    <CachedImage source={source} style={styles.albumCover} resizeMode="cover" />
  );
};

export const SongDetailsContainer = ({ children }: Props) => {
  return <View style={styles.songDetailsContainer}>{children}</View>;
};

export const SongDescriptorContainer = ({ children }: Props) => {
  return <View style={styles.songDescriptorContainer}>{children}</View>;
};

export const SongTitle = ({ children }: Props) => {
  return <DefaultText style={styles.songTitle}>{children}</DefaultText>;
};
export const SongAuthor = ({ children }: Props) => {
  return <DefaultText style={styles.songAuthor}>{children}</DefaultText>;
};

export const AllPlayingControlsContainer = ({ children }: Props) => {
  return <View style={styles.allPlayingControlsContainer}>{children}</View>;
};
