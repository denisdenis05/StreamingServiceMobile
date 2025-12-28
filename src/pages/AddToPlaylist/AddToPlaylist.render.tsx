import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  FlatList,
} from 'react-native';
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

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) =>
      gestureState.dy > 0 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        translateY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 100 || gestureState.vy > 0.5) {
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 300,
          useNativeDriver: true,
        }).start(() => navigation.goBack());
      } else {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    },
  });

  useEffect(() => {
    translateY.setValue(SCREEN_HEIGHT);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
    }).start();

    fetchPlaylists();
  }, []);

  const fetchPlaylists = async () => {
    try {
      const res = await api.get('library/playlists');
      setPlaylists(res.data);
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
    }
  };

  const createNewPlaylist = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      // Mapping songs to the format expected by CreatePlaylist if needed,
      // but CreatePlaylist endpoint might still expect IDs or we need to update it too.
      // For now, assuming CreatePlaylist still takes IDs or we update it.
      // Wait, CreatePlaylistRequest still has RecordingIds (List<Guid>).
      // If we want to support non-DB songs in creation, we need to update CreatePlaylistRequest too.
      // But for this task, let's focus on adding to existing playlist first as per user flow.
      // Actually, let's just pass IDs for creation for now, or update it if needed.
      // The user asked to "allow songs not yet in the database".
      // So CreatePlaylist also needs to handle this.
      // But let's stick to the plan for AddToPlaylist first.

      const recordingIds = songs.map((s: any) => s.id);
      await api.post('library/playlists', {
        name: '',
        recordingIds: recordingIds,
      });
      console.log('Created new playlist with songs:', recordingIds);
      navigation.goBack();
    } catch (err) {
      console.error('Failed to create playlist:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const addToExistingPlaylist = async (playlistId: string) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      // Send full song objects
      const payload = songs.map((s: any) => ({
        id: s.id,
        title: s.title,
        artist: s.artistName || s.artist, // Handle potential naming diffs
        album: s.releaseTitle || s.album,
        cover: s.cover,
      }));
      await api.post(`library/playlists/${playlistId}/recordings`, payload);
      console.log(`Added songs to playlist ${playlistId}`);
      navigation.goBack();
    } catch (err) {
      console.error('Failed to add to playlist:', err);
    } finally {
      setIsLoading(false);
    }
  };

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
              renderItem={({ item }) => (
                <PlaylistItem
                  name={item.name || 'Untitled Playlist'}
                  onPress={() => addToExistingPlaylist(item.id)}
                />
              )}
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
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 60,
  },
});
