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
    padding: 20,
    gap: 20,
  },
  songDetailsContainer: {
    display: 'flex',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 30,
    gap: 20,
  },
  songDescriptorContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  dragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: '#666',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  headerTitle: { fontWeight: 'bold', fontSize: 16 },
  songTitle: { fontWeight: 'condensedBold', fontSize: 26 },
  songAuthor: {
    fontWeight: 'regular',
    fontSize: 14,
    color: colors.slightlyTransparentText,
  },
  albumCover: {
    width: '80%',
    aspectRatio: 1,
    borderRadius: 30,
  },
  allPlayingControlsContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 30,
    marginBottom: 30,
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
