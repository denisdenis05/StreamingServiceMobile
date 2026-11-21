import { PlayingCardLayout } from '../../constants/playingLayout';
import { ReactNode } from 'react';
import {
  ImageProps,
  SafeAreaView,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
  disabled?: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

const PlayingSpacing = Object.freeze({ headerCoverGap: 8 });

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
    paddingBottom: verticalScale(30),
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
    marginBottom: verticalScale(PlayingSpacing.headerCoverGap),
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
    width: PlayingCardLayout.width,
    aspectRatio: 1,
    borderRadius: moderateScale(20),
  },
  allPlayingControlsContainer: {
    width: PlayingCardLayout.width,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(30),
  },
});

export const BackdropContainer = ({ children, style }: Props) => {
  return <View style={[styles.backdrop, style]}>{children}</View>;
};

export const ContentContainer = ({
  children,
  style,
  onScroll,
  disabled = false,
}: Props) => {
  return (
    <SafeAreaView
      style={PlayingLayout.safeArea}
      pointerEvents={
        disabled ? PlayingControlPolicy.disabled : PlayingControlPolicy.enabled
      }
      importantForAccessibility={
        disabled
          ? PlayingControlPolicy.hiddenAccessibility
          : PlayingControlPolicy.enabled
      }
    >
      <ScrollView
        onScroll={onScroll}
        contentContainerStyle={[styles.content, style]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
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

export const AlbumCover = ({
  source,
  releaseId,
  cover,
  smallCover,
  verySmallCover,
}: ImageProps & {
  releaseId?: string;
  cover?: string;
  smallCover?: string;
  verySmallCover?: string;
}) => {
  return (
    <CachedImage
      testID={PlayingControlPolicy.coverIdentifier}
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

export const AllPlayingControlsContainer = ({
  children,
  disabled = false,
}: Props) => {
  return (
    <View
      pointerEvents={
        disabled ? PlayingControlPolicy.disabled : PlayingControlPolicy.enabled
      }
      testID={PlayingControlPolicy.controlsIdentifier}
      style={[
        styles.allPlayingControlsContainer,
        disabled && PlayingLayout.disabled,
      ]}
    >
      {children}
    </View>
  );
};

const PlayingControlPolicy = Object.freeze({
  coverIdentifier: 'playing-album-cover',
  controlsIdentifier: 'playing-controls',
  disabled: 'none' as const,
  enabled: 'auto' as const,
  hiddenAccessibility: 'no-hide-descendants' as const,
  disabledOpacity: 0.4,
});
const PlayingLayout = StyleSheet.create({
  safeArea: { flex: 1, width: '100%' },
  disabled: { opacity: PlayingControlPolicy.disabledOpacity },
});
