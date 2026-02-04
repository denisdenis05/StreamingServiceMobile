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
import DefaultText from '../DefaultText';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';
import CachedImage from '../CachedImage.tsx';

interface Props {
  children: ReactNode;
}

const styles = StyleSheet.create({
  content: {
    height: '100%',
    width: '100%',
    maxWidth: '100%',
    display: 'flex',
    backgroundColor: colors.background,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: scale(10),
    paddingTop: verticalScale(50),
    paddingBottom: verticalScale(10),
    gap: verticalScale(20),
  },
  songDetailsContainer: {
    display: 'flex',
    width: '100%',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: moderateScale(5),
    paddingHorizontal: scale(15),
    gap: scale(20),
  },
  songDescriptorContainer: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '60%',
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
    zIndex: 10,
    paddingHorizontal: scale(20),
  },
  songTitle: { fontWeight: 'bold', fontSize: moderateScale(18) },
  songAuthor: {
    fontWeight: 'condensedBold',
    fontSize: moderateScale(12),
    color: colors.slightlyTransparentText,
  },
  albumCover: {
    width: '60%',
    aspectRatio: 1,
    borderRadius: moderateScale(15),
  },
  recordingsContainer: {
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: scale(0),
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 10,
  },
  lineContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: scale(15),
  },
});

export const ContentContainer = ({ children }: Props) => {
  return <SafeAreaView style={styles.content}>{children}</SafeAreaView>;
};

export const MainScrollContainer = ({ children }: Props) => {
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
};

export const HeaderContainer = ({ children }: Props) => {
  return <View style={styles.header}>{children}</View>;
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

export const RecordingsContainer = ({ children }: Props) => {
  return <View style={styles.recordingsContainer}>{children}</View>;
};

export const ControlsContainer = ({ children }: Props) => {
  return <View style={styles.controlsContainer}>{children}</View>;
};

export const ActionsContainer = ({ children }: Props) => {
  return <View style={styles.actionsContainer}>{children}</View>;
};

export const LineContainer = ({ children }: Props) => {
  return <View style={styles.lineContainer}>{children}</View>;
};
