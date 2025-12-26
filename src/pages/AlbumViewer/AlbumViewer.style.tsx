import { ReactNode } from 'react';
import {
  Image,
  ImageProps,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../../constants/styling.tsx';
import DefaultText from '../../components/DefaultText';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';
import CachedImage from '../../components/CachedImage.tsx';

interface Props {
  children: ReactNode;
}

const styles = StyleSheet.create({
  content: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    paddingHorizontal: scale(30),
    paddingVertical: verticalScale(50),
    gap: verticalScale(20),
    backgroundColor: colors.background,
  },
  songDetailsContainer: {
    display: 'flex',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: moderateScale(20),
    paddingHorizontal: scale(30),
    gap: scale(20),
  },
  songDescriptorContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: verticalScale(2),
  },
  header: {
    position: 'absolute',
    top: verticalScale(50),
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(30),
  },
  songTitle: { fontWeight: 'bold', fontSize: moderateScale(26) },
  songAuthor: {
    fontWeight: 'condensedBold',
    fontSize: moderateScale(14),
    color: colors.slightlyTransparentText,
  },
  albumCover: {
    width: '60%',
    aspectRatio: 1,
    borderRadius: moderateScale(30),
  },
  recordingsContainer: {
    width: '100%',
    paddingHorizontal: scale(20),
  },
});

export const ContentContainer = ({ children }: Props) => {
  return <SafeAreaView style={styles.content}>{children}</SafeAreaView>;
};

export const HeaderContainer = ({ children }: Props) => {
  return <View style={styles.header}>{children}</View>;
};

export const AlbumCover = ({ source }: ImageProps) => {
  return <CachedImage source={source} style={styles.albumCover} resizeMode="cover" />;
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

export const RecordingsContainer = ({ children }: Props) => {
  return <ScrollView style={styles.recordingsContainer}>{children}</ScrollView>;
};
