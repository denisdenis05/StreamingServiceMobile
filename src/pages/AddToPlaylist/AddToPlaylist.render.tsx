import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  FlatList,
} from 'react-native';
import { colors } from '../../constants/styling.tsx';
import {
  BackdropContainer,
  CardTitle,
  ContentContainer,
  DragIndicator,
  ListContainer,
  PlaylistItem,
  StyledButton,
} from './AddToPlaylist.style.tsx';
import { notifyLibraryChanged } from '../../services/LibraryChanges';
import DefaultText from '../../components/DefaultText';
import { useApi } from '../../hooks/useApi.ts';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const AddToPlaylist = ({ navigation, route }: any) => {
  const { songs } = route.params;
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;
  const api = useApi();

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 0 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) translateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 300,
            useNativeDriver: true,
          }).start(() => navigation.goBack());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const fetchPlaylists = useCallback(async () => {
    try {
      const res = await api.get('library/playlists');
      setPlaylists(res.data);
    } catch {
      setErrorMessage(PlaylistMutationCopy.loadFailed);
    }
  }, [api]);

  useEffect(() => {
    translateY.setValue(SCREEN_HEIGHT);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
    }).start();

    fetchPlaylists();
  }, [fetchPlaylists, translateY]);

  const addToExistingPlaylist = useCallback(async (playlistId: string) => {
    if (isLoading) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const payload = songs.map((s: any) => ({
        id: s.id,
        title: s.title,
        artist: s.artistName || s.artist,
        album: s.releaseTitle || s.album,
        cover: s.cover,
      }));
      await api.post(`library/playlists/${playlistId}/recordings`, payload);
      notifyLibraryChanged();
      navigation.goBack();
    } catch {
      setErrorMessage(PlaylistMutationCopy.addFailed);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, songs, api, navigation]);

  const renderPlaylistItem = useCallback(({ item }: { item: any }) => (
    <PlaylistItem
      name={item.name || 'Untitled Playlist'}
      onPress={() => addToExistingPlaylist(item.id)}
    />
  ), [addToExistingPlaylist]);

  const createNewPlaylist = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const recordingIds = songs.map((s: any) => s.id);
      await api.post('library/playlists', { name: '', recordingIds });
      notifyLibraryChanged();
      navigation.goBack();
    } catch {
      setErrorMessage(PlaylistMutationCopy.createFailed);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, songs, api, navigation]);


  return (
    <BackdropContainer>
      <Animated.View
        style={[styles.container, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        <ContentContainer>
          <DragIndicator />
          <CardTitle>Add to Playlist</CardTitle>

          <StyledButton
            title="Create New Playlist"
            onPress={createNewPlaylist}
            disabled={isLoading}
          />

          {errorMessage && <DefaultText accessibilityRole="alert">{errorMessage}</DefaultText>}
          <ListContainer>
            <FlatList
              data={playlists}
              keyExtractor={item => item.id}
              renderItem={renderPlaylistItem}
              removeClippedSubviews
              maxToRenderPerBatch={10}
              initialNumToRender={10}
            />
          </ListContainer>
        </ContentContainer>
      </Animated.View>
    </BackdropContainer>
  );
};

export default AddToPlaylist;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 60,
  },
});

const PlaylistMutationCopy = Object.freeze({
  loadFailed: 'Playlists could not be loaded. Reopen this page to try again.',
  addFailed: 'Songs could not be added. Try again.',
  createFailed: 'The playlist could not be created. Try again.',
});
