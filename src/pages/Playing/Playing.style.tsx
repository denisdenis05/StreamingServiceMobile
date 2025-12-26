import { ReactNode } from 'react';
import {
  Image,
  ImageProps,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../../constants/styling.tsx';
import DefaultText from '../../components/DefaultText';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';

interface Props {
  children: ReactNode;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    padding: moderateScale(20),
    gap: verticalScale(20),
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
    backgroundColor: '#666',
    borderRadius: moderateScale(2),
    alignSelf: 'center',
    marginBottom: verticalScale(20),
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(30),
  },
  headerTitle: { fontWeight: 'bold', fontSize: moderateScale(16) },
  songTitle: { fontWeight: 'condensedBold', fontSize: moderateScale(26) },
  songAuthor: {
    fontWeight: 'regular',
    fontSize: moderateScale(14),
    color: colors.slightlyTransparentText,
  },
  albumCover: {
    width: '80%',
    aspectRatio: 1,
    borderRadius: moderateScale(30),
  },
  allPlayingControlsContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: moderateScale(30),
    marginBottom: verticalScale(30),
  },
});

export const BackdropContainer = ({ children }: Props) => {
  return <View style={styles.backdrop}>{children}</View>;
};

export const ContentContainer = ({ children }: Props) => {
  return <SafeAreaView style={styles.content}>{children}</SafeAreaView>;
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
  return <Image source={source} style={styles.albumCover} resizeMode="cover" />;
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
