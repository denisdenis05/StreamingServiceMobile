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

export const ContentContainer = ({ children, style, onScroll }: Props) => {
  return (
    <SafeAreaView style={PlayingLayout.safeArea}>
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
  disabled: 'none' as const,
  enabled: 'auto' as const,
  disabledOpacity: 0.4,
});
const PlayingLayout = StyleSheet.create({
  safeArea: { flex: 1, width: '100%' },
  disabled: { opacity: PlayingControlPolicy.disabledOpacity },
});
