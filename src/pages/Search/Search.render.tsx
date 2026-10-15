import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View, ActivityIndicator } from 'react-native';
import PageContainer from '../../components/PageContainer';
import {
  HeaderContainer,
  HeaderTitle,
  SearchInput,
  StyledImage,
  TopSection,
  Wrapper,
  listContentStyle,
  loadingMoreStyle,
} from './Search.style.tsx';
import {
  PLACEHOLDER_ALBUM_COVER,
  PLACEHOLDER_PROFILE_PIC,
} from '../../constants/placeholders.tsx';
import { SEARCH_HEADER_TEXT } from '../../constants/texts.tsx';
import Navbar from '../../components/Navbar';
import { Album, Track, Artist } from '../../constants/types.tsx';
import SearchEntry from '../../components/SearchEntry';
import { SearchEntrySkeleton } from '../../components/SearchEntry/SearchEntry.render.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { catalogPlaybackMapping } from '../../services/NativeAudioRuntime';
import { useData } from '../../services/DataProvider.tsx';
import ContextMenu from '../../components/ContextMenu/ContextMenu.render';
import { menuOptions } from '../../constants/navigation.tsx';
import { colors } from '../../constants/styling.tsx';

const ListHeader = ({ loading }: { loading: boolean }) => {
  if (!loading) return null;
  return (
    <View style={{ gap: 10, paddingTop: 10 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <SearchEntrySkeleton key={i} />
      ))}
    </View>
  );
};

const ListFooter = ({ loadingMore }: { loadingMore: boolean }) => {
  if (!loadingMore) return null;
  return (
    <View style={loadingMoreStyle}>
      <ActivityIndicator size="small" color={colors.accentPrimary} />
    </View>
  );
};

type SearchItem =
  | { kind: 'track'; data: Track }
  | { kind: 'album'; data: Album }
  | { kind: 'artist'; data: Artist };

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

const toTrackItems = (tracks: Track[]): SearchItem[] =>
  tracks.map(t => ({ kind: 'track', data: t }));

const toAlbumItems = (albums: Album[]): SearchItem[] =>
  albums.map(a => ({ kind: 'album', data: a }));

const toArtistItems = (artists: Artist[]): SearchItem[] =>
  artists.map(a => ({ kind: 'artist', data: a }));

// Signature helpers — prefix prevents cross-type false positives
// (e.g. a track and album can share the same title + artist name)
const trackSig = (t: Track) =>
  `track:${t.title.toLowerCase()}|${(t.artistName || '').toLowerCase()}`;
const albumSig = (a: Album) =>
  `album:${a.title.toLowerCase()}|${(a.artistName || '').toLowerCase()}`;
const artistSig = (a: Artist) => `artist:${a.name.toLowerCase()}`;

function addToKnown(known: Set<string>, items: SearchItem[]) {
  for (const item of items) {
    known.add(item.data.id);
    if (item.kind === 'track')  known.add(trackSig(item.data as Track));
    if (item.kind === 'album')  known.add(albumSig(item.data as Album));
    if (item.kind === 'artist') known.add(artistSig(item.data as Artist));
  }
}

const Search = ({ navigation, route }: { navigation: any; route: any }) => {
  const { data: searchState, updateData } = useData<{ query: string }>(
    'search_state',
    undefined,
    { query: '' },
  );

  const query = searchState?.query || '';
  const setQuery = (q: string) => updateData({ query: q });

  // Three separate buckets keep ordering stable as async responses arrive:
  //   dbItems    — tier-1 exact matches, grows as the user paginates
  //   fuzzyItems — tier-2 trigram matches, set once from the page-1 response
  //   externalItems — MusicBrainz results, set once when that request resolves
  // displayItems = [...dbItems, ...fuzzyItems, ...externalItems]
  const [dbItems, setDbItems] = useState<SearchItem[]>([]);
  const [fuzzyItems, setFuzzyItems] = useState<SearchItem[]>([]);
  const [externalItems, setExternalItems] = useState<SearchItem[]>([]);
  const [hasMoreTracks, setHasMoreTracks] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const knownRef = useRef<Set<string>>(new Set());
  const activeQueryRef = useRef('');
  const loadingMoreRef = useRef(false);
  const hasMoreTracksRef = useRef(false);
  const pageRef = useRef(1);

  const api = useApi();
  const { playTracks } = useMusicQueue();
  const FirstSearchEntryIndex = 0;
  const playTrack = useCallback((recording: Track) => {
    void playTracks([catalogPlaybackMapping.map(recording)], FirstSearchEntryIndex);
    navigation.navigate('Playing', {});
  }, [playTracks, navigation]);

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  const handleMorePress = useCallback((event: any, track: Track) => {
    setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    setSelectedTrack(track);
    setMenuVisible(true);
  }, []);

  const handleAlbumPress = useCallback((album: Album) => {
    navigation.navigate('AlbumViewer', {
      albumId: album.id,
      albumTitle: album.title,
      albumArtist: album.artistName,
      albumCover: album.cover,
      albumSmallCover: album.smallCover,
      albumVerySmallCover: album.verySmallCover,
    });
  }, [navigation]);

  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) {
      setDbItems([]);
      setFuzzyItems([]);
      setExternalItems([]);
      knownRef.current = new Set();
      hasMoreTracksRef.current = false;
      setHasMoreTracks(false);
      pageRef.current = 1;
      setPage(1);
      return;
    }

    const thisQuery = query;
    activeQueryRef.current = query;

    const timer = setTimeout(async () => {
      setLoading(true);
      pageRef.current = 1;
      setPage(1);
      setFuzzyItems([]);
      setExternalItems([]);

      try {
        const res = await api.get('Metadata/search/db', {
          params: { query: thisQuery, page: 1, pageSize: PAGE_SIZE },
        });

        if (activeQueryRef.current !== thisQuery) return;

        const tier1: SearchItem[] = [
          ...toTrackItems(res.data.tracks ?? []),
          ...toAlbumItems(res.data.albums ?? []),
          ...toArtistItems(res.data.artists ?? []),
        ];

        const tier2: SearchItem[] = [
          ...toTrackItems(res.data.fuzzyTracks ?? []),
          ...toAlbumItems(res.data.fuzzyAlbums ?? []),
          ...toArtistItems(res.data.fuzzyArtists ?? []),
        ];

        knownRef.current = new Set();
        addToKnown(knownRef.current, tier1);
        addToKnown(knownRef.current, tier2);
        setDbItems(tier1);
        setFuzzyItems(tier2);
        hasMoreTracksRef.current = res.data.hasMoreTracks ?? false;
        setHasMoreTracks(res.data.hasMoreTracks ?? false);
      } catch {
        // DB search failed — show empty state
      } finally {
        if (activeQueryRef.current === thisQuery) setLoading(false);
      }

      // External (MusicBrainz) fires in the background; results are appended
      // at the END once they resolve, deduplicated against whatever DB items
      // exist at that point (including any pages loaded in the meantime).
      api
        .get('Metadata/search', { params: { query: thisQuery, limit: 10 } })
        .then(res => {
          if (activeQueryRef.current !== thisQuery) return;

          const known = knownRef.current;
          const ext: SearchItem[] = [
            ...toTrackItems((res.data.tracks ?? []).filter(
              (t: Track) => !known.has(t.id) && !known.has(trackSig(t)),
            )),
            ...toAlbumItems((res.data.albums ?? []).filter(
              (a: Album) => !known.has(a.id) && !known.has(albumSig(a)),
            )),
            ...toArtistItems((res.data.artists ?? []).filter(
              (a: Artist) => !known.has(a.id) && !known.has(artistSig(a)),
            )),
          ];

          setExternalItems(ext);
        })
        .catch(() => {});
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const loadMoreTracks = useCallback(async () => {
    if (!hasMoreTracksRef.current || loadingMoreRef.current) return;

    const thisQuery = activeQueryRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const nextPage = pageRef.current + 1;
      const res = await api.get('Metadata/search/db', {
        params: { query: thisQuery, page: nextPage, pageSize: PAGE_SIZE },
      });

      if (activeQueryRef.current !== thisQuery) return;

      const newTracks = toTrackItems(
        (res.data.tracks ?? []).filter((t: Track) => !knownRef.current.has(t.id)),
      );

      addToKnown(knownRef.current, newTracks);
      setDbItems(prev => [...prev, ...newTracks]);
      const hasMore = res.data.hasMoreTracks ?? false;
      hasMoreTracksRef.current = hasMore;
      setHasMoreTracks(hasMore);
      pageRef.current = nextPage;
      setPage(nextPage);
    } catch {
      // Pagination failure is non-fatal
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const displayItems = useMemo(
    () => [...dbItems, ...fuzzyItems, ...externalItems],
    [dbItems, fuzzyItems, externalItems],
  );

  const renderItem = useCallback(
    ({ item }: { item: SearchItem }) => {
      switch (item.kind) {
        case 'track':
          return (
            <SearchEntry
              songTitle={item.data.title}
              songAuthor={`Track • ${item.data.artistName}`}
              albumCover={item.data.cover}
              onPressAction={() => playTrack(item.data)}
              onMorePress={(e: any) => handleMorePress(e, item.data)}
            />
          );
        case 'album':
          return (
            <SearchEntry
              songTitle={item.data.title}
              songAuthor={`Album • ${item.data.artistName}`}
              albumCover={item.data.cover}
              onPressAction={() => handleAlbumPress(item.data)}
            />
          );
        case 'artist':
          return (
            <SearchEntry
              songTitle={item.data.name}
              songAuthor="Artist"
              albumCover={item.data.image || ''}
              onPressAction={() => {}}
            />
          );
      }
    },
    [playTrack, handleMorePress, handleAlbumPress],
  );

  const listHeader = useMemo(() => <ListHeader loading={loading} />, [loading]);
  const listFooter = useMemo(() => <ListFooter loadingMore={loadingMore} />, [loadingMore]);

  return (
    <PageContainer>
      <Wrapper>
        <TopSection>
          <HeaderContainer>
            <StyledImage source={{ uri: PLACEHOLDER_PROFILE_PIC }} />
            <HeaderTitle>{SEARCH_HEADER_TEXT}</HeaderTitle>
          </HeaderContainer>
          <SearchInput value={query} onChangeText={setQuery} placeholder="Search..." />
        </TopSection>

        <FlatList
          style={{ flex: 1 }}
          data={loading ? [] : displayItems}
          keyExtractor={item => `${item.kind}-${item.data.id}`}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          contentContainerStyle={listContentStyle}
          onEndReached={loadMoreTracks}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          removeClippedSubviews
          maxToRenderPerBatch={10}
          initialNumToRender={10}
        />
      </Wrapper>

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
            songs: [selectedTrack],
            albumId: selectedTrack?.releaseId || '',
            albumTitle: selectedTrack?.releaseTitle || '',
            albumCover: selectedTrack?.cover || '',
            albumArtist: selectedTrack?.artistName || '',
          }}
        />
      )}
    </PageContainer>
  );
};

export default Search;
