import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, FlatList } from 'react-native';
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
    const { recordingIds } = route.params;
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
            await api.post('library/playlists', { name: '', recordingIds: recordingIds });
            console.log('Created new playlist with songs:', recordingIds);
            navigation.goBack();
        } catch (err) {
            console.error('Failed to create playlist:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const addToExistingPlaylist = async (playlistId: string) => {
        console.log(`Adding songs ${recordingIds} to playlist ${playlistId}`);
        // TODO: Implement API call
        navigation.goBack();
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
                            keyExtractor={(item) => item.id}
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
