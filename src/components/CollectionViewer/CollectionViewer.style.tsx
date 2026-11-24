import { ReactNode } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { colors, fonts, typography } from '../../constants/styling.tsx';
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
  songTitle: { fontFamily: fonts.serif, fontSize: typography.dialogTitle, letterSpacing: -0.3 },
  songAuthor: {
    fontWeight: '400',
    fontSize: typography.secondary,
    color: colors.slightlyTransparentText,
  },
  albumCover: {
    width: '60%',
    aspectRatio: 1,
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: colors.borderSubtle,
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

interface MainScrollContainerProps {
  children: ReactNode;
  onScroll?: (event: any) => void;
  scrollEventThrottle?: number;
}

export const MainScrollContainer = ({ children, onScroll, scrollEventThrottle }: MainScrollContainerProps) => {
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={scrollEventThrottle}
    >
      {children}
    </ScrollView>
  );
};

export const HeaderContainer = ({ children }: Props) => {
  return <View style={styles.header}>{children}</View>;
};

interface AlbumCoverProps {
  releaseId?: string;
  cover?: string;
  smallCover?: string;
  verySmallCover?: string;
  source?: any;
}

export const AlbumCover = ({ releaseId, cover, smallCover, verySmallCover, source }: AlbumCoverProps) => {
  return (
    <CachedImage
      releaseId={releaseId}
      cover={cover}
      smallCover={smallCover}
      verySmallCover={verySmallCover}
      tier="full"
      source={source}
      style={styles.albumCover}
      resizeMode="cover"
    />
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
