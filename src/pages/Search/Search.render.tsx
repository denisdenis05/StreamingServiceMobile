import PageContainer from '../../components/PageContainer';
import {
  ContentContainer,
  HeaderContainer,
  HeaderTitle,
  SearchInput,
  SearchResultContainer,
  SectionTitle,
  StyledImage,
} from './Search.style.tsx';
import {
  PLACEHOLDER_ALBUM_COVER,
  PLACEHOLDER_PROFILE_PIC,
  TEMPORARY_API_URL,
} from '../../constants/placeholders.tsx';
import { SEARCH_HEADER_TEXT } from '../../constants/texts.tsx';
import Navbar from '../../components/Navbar';
import { useEffect, useState } from 'react';
import { Album, Track, Artist, SearchResults } from '../../constants/types.tsx';
import SearchEntry from '../../components/SearchEntry';
import { SearchEntrySkeleton } from '../../components/SearchEntry/SearchEntry.render.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { useAuth } from '../../hooks/AuthContext.tsx';
import { useData } from '../../services/DataProvider.tsx';
import { View } from 'react-native';
import ContextMenu from '../../components/ContextMenu/ContextMenu.render';
import { menuOptions } from '../../constants/navigation.tsx';

const MAX_ITEMS_PER_CATEGORY = 5;

const Search = ({ navigation, route }: { navigation: any; route: any }) => {
  const limit = 10;
  const { data: searchState, updateData } = useData<{
    query: string;
    results: SearchResults | null;
  }>('search_state', undefined, { query: '', results: null });

  const query = searchState?.query || '';
  const searchResults = searchState?.results || null;

  const setQuery = (newQuery: string) => {
    updateData({ ...searchState!, query: newQuery });
  };

  const setSearchResults = (newResults: SearchResults | null) => {
    updateData({ ...searchState!, results: newResults });
  };

  const [shouldPlayFromStart, setShouldPlayFromStart] = useState(false);
  const api = useApi();
  const { token } = useAuth();
  const { replaceQueue, playTrackAtIndex, queue } = useMusicQueue();

  useEffect(() => {
    if (shouldPlayFromStart) {
      playTrackAtIndex(0);
      setShouldPlayFromStart(false);
    }
  }, [queue]);

  const playTrack = (recording: any) => {
    const track = {
      id: recording.id,
      url: `${TEMPORARY_API_URL}Stream?id=${recording.id}`,
      title: recording.title,
      artist: recording.artistName,
      album: recording.releaseTitle,
      mediaId: recording.id,
      artwork: recording.cover || PLACEHOLDER_ALBUM_COVER,
      headers: { Authorization: `Bearer ${token}` },
      isLiked: recording.isLiked,
    };

    replaceQueue([track]);
    setShouldPlayFromStart(true);

    navigation.navigate('Playing', {});
  };

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedTrack, setSelectedTrack] = useState<any>(null);

  const handleMorePress = (event: any, track: any) => {
    setMenuPosition({
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    });
    setSelectedTrack(track);
    setMenuVisible(true);
  };

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length <= 3) {
      if (searchResults !== null) {
        setSearchResults(null);
      }
      return;
    }

    const delayDebounce = setTimeout(() => {
      const fetchData = async () => {
        try {
          setLoading(true);
          const response = await api.get(`Metadata/search`, {
            params: { query, limit },
          });
          setSearchResults(response.data);
        } catch (error) {
          console.error('Error fetching search results:', error);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  const handleSearchEntryClick = (
    albumId: any,
    albumTitle: any,
    albumArtist: any,
    albumCover: any
  ) => {
    navigation.navigate('AlbumViewer', {
      albumId,
      albumTitle,
      albumArtist,
      albumCover,
    });
  };

  const renderBestMatch = () => {
    if (!searchResults?.bestMatch) return null;
    const { type, data } = searchResults.bestMatch;

    let title: string | undefined;
    let subtitle: string | undefined;
    let cover: string | null | undefined;
    let id: string | undefined;

    if (type === 'artist') {
      const artist = data as Artist;
      title = artist.name;
      subtitle = 'Artist';
      cover = artist.image;
      id = artist.id;
    } else if (type === 'track') {
      const track = data as unknown as Track;
      title = track.title;
      subtitle = track.artistName;
      cover = track.verySmallCover;
      id = track.id;
    } else if (type === 'album') {
      const album = data as Album;
      title = album.title;
      subtitle = album.artistName;
      cover = album.verySmallCover;
      id = album.id;
    }

    if (!title) return null;

    return (
      <>
        <SectionTitle>Best Match</SectionTitle>
        <SearchEntry
          songTitle={title}
          songAuthor={subtitle || ''}
          albumCover={cover || ''}
          onPressAction={() => {
            console.log('Best match clicked', type, id);
          }}
        />
      </>
    );
  };

  return (
    <PageContainer>
      <ContentContainer>
        <HeaderContainer>
          <StyledImage source={{ uri: PLACEHOLDER_PROFILE_PIC }} />
          <HeaderTitle>{SEARCH_HEADER_TEXT}</HeaderTitle>
        </HeaderContainer>

        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search..."
        />

        <SearchResultContainer>
          {loading && (
            <View style={{ gap: 10, width: '100%' }}>
              {Array.from({ length: 5 }).map((_, index) => (
                <SearchEntrySkeleton key={index} />
              ))}
            </View>
          )}
          {!loading && searchResults && (
            <>
              {renderBestMatch()}

              {searchResults.artists.length > 0 && (
                <>
                  <SectionTitle>Artists</SectionTitle>
                  {searchResults.artists
                    .slice(0, MAX_ITEMS_PER_CATEGORY)
                    .map(artist => (
                      <SearchEntry
                        key={artist.id}
                        songTitle={artist.name}
                        songAuthor="Artist"
                        albumCover={artist.image || ''}
                        onPressAction={() => { }}
                      />
                    ))}
                </>
              )}

              {searchResults.tracks.length > 0 && (
                <>
                  <SectionTitle>Tracks</SectionTitle>
                  {searchResults.tracks
                    .slice(0, MAX_ITEMS_PER_CATEGORY)
                    .map(track => (
                      <SearchEntry
                        key={track.id}
                        songTitle={track.title}
                        songAuthor={track.artistName}
                        albumCover={track.cover}
                        onPressAction={() => {
                          playTrack(track);
                        }}
                        onMorePress={(e: any) => handleMorePress(e, track)}
                      />
                    ))}
                </>
              )}

              {searchResults.albums.length > 0 && (
                <>
                  <SectionTitle>Albums</SectionTitle>
                  {searchResults.albums
                    .slice(0, MAX_ITEMS_PER_CATEGORY)
                    .map(album => (
                      <SearchEntry
                        key={album.id}
                        songTitle={album.title}
                        songAuthor={album.artistName}
                        albumCover={album.cover}
                        onPressAction={() =>
                          handleSearchEntryClick(
                            album.id,
                            album.title,
                            album.artistName,
                            album.cover
                          )
                        }
                      />
                    ))}
                </>
              )}

              {/* TODO: Playlists */}
            </>
          )}
        </SearchResultContainer>
      </ContentContainer>
      <Navbar navigation={navigation} route={route} />
      {menuVisible && (
        <ContextMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          options={menuOptions}
          position={menuPosition}
          navigation={navigation}
          params={{
            recordingIds: [selectedTrack?.id],
            songs: [selectedTrack]
          }}
        />
      )}
    </PageContainer>
  );
};

export default Search;
