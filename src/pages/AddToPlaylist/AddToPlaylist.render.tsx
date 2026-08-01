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
import { useApi } from '../../hooks/useApi.ts';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const AddToPlaylist = ({ navigation, route }: any) => {
  const { songs } = route.params;
  const [playlists, setPlaylists] = useState<any[]>([]);
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

  useEffect(() => {
    translateY.setValue(SCREEN_HEIGHT);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
    }).start();

    fetchPlaylists();
  }, []);

  const fetchPlaylists = useCallback(async () => {
    try {
      const res = await api.get('library/playlists');
      setPlaylists(res.data);
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
    }
  }, [api]);

  const addToExistingPlaylist = useCallback(async (playlistId: string) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const payload = songs.map((s: any) => ({
        id: s.id,
        title: s.title,
        artist: s.artistName || s.artist,
        album: s.releaseTitle || s.album,
        cover: s.cover,
      }));
      await api.post(`library/playlists/${playlistId}/recordings`, payload);
      navigation.goBack();
    } catch (err) {
      console.error('Failed to add to playlist:', err);
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
    try {
      const recordingIds = songs.map((s: any) => s.id);
      await api.post('library/playlists', { name: '', recordingIds });
      navigation.goBack();
    } catch (err) {
      console.error('Failed to create playlist:', err);
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
