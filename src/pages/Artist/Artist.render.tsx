import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import PageContainer from '../../components/PageContainer';
import DefaultText from '../../components/DefaultText';
import CachedImage from '../../components/CachedImage';
import { colors, fonts, typography } from '../../constants/styling';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/AuthContext';
import type { Album, Artist } from '../../constants/types';
import {
  HomeCollectionType,
  homeCollectionDestination,
} from '../../services/home/HomeCollectionNavigation';
import { ArtistParameters } from './ArtistNavigation';

const Policy = Object.freeze({
  firstOffset: 0,
  initialRetry: 0,
  retryIncrement: 1,
  columns: 2,
  padding: 20,
  gap: 12,
  radius: 12,
  fullWidth: '100%' as const,
  coverRatio: 1,
  artistTitleSize: 34,
  bottomPadding: 120,
  title: 'Artist',
  library: 'In your library',
  catalog: 'Discography',
  back: 'Back',
  retry: 'Try again',
  more: 'Load more albums',
  resolveFailure: 'This artist could not be opened. Try again.',
  loadFailure: 'Albums could not be loaded. Try again.',
  emptyLibrary:
    'No albums by this artist are in your library yet. Browse their discography to find albums.',
  emptyCatalog: 'No releases were found for this artist.',
  catalogNotice:
    'Catalog releases open the album page. Availability depends on your server’s download sources.',
});
interface Navigation {
  navigate(screen: string, parameters: object): void;
  goBack(): void;
}
interface AlbumPage {
  readonly artist: Artist;
  readonly albums: Album[];
  readonly nextOffset: number | null;
}
const styles = StyleSheet.create({
  content: {
    padding: Policy.padding,
    paddingBottom: Policy.bottomPadding,
    gap: Policy.gap,
  },
  list: { width: Policy.fullWidth },
  header: { gap: Policy.gap, marginBottom: Policy.padding },
  title: { fontSize: Policy.artistTitleSize, fontFamily: fonts.serif },
  muted: { color: colors.slightlyTransparentText },
  tabs: { flexDirection: 'row', gap: Policy.gap },
  button: {
    padding: Policy.gap,
    borderRadius: Policy.radius,
    backgroundColor: colors.surfaceCard,
  },
  selected: { backgroundColor: colors.accentPrimary },
  selectedText: { color: colors.textOnAccent },
  columns: { gap: Policy.gap },
  album: {
    flex: 1,
    maxWidth: '50%',
    gap: Policy.gap,
    marginBottom: Policy.padding,
  },
  artwork: {
    width: Policy.fullWidth,
    aspectRatio: Policy.coverRatio,
    borderRadius: Policy.radius,
  },
  albumTitle: { fontSize: typography.itemTitle },
  notice: { gap: Policy.gap },
});

export default function ArtistPage({
  navigation,
  route,
}: {
  navigation: Navigation;
  route: { params?: ArtistParameters };
}) {
  const { accountIdentifier } = useAuth();
  const parameters = route.params ?? {};
  return (
    <ArtistIdentity
      key={JSON.stringify([accountIdentifier, parameters])}
      navigation={navigation}
      parameters={parameters}
    />
  );
}

function ArtistIdentity({
  navigation,
  parameters,
}: {
  navigation: Navigation;
  parameters: ArtistParameters;
}) {
  const network = useApi();
  const [artist, setArtist] = useState<Artist | null>(
    parameters.artistId
      ? {
          id: parameters.artistId,
          name: parameters.artistName ?? Policy.title,
          image: parameters.artistImage ?? null,
        }
      : null,
  );
  const [failure, setFailure] = useState(false);
  const [retry, setRetry] = useState<number>(Policy.initialRetry);
  const [catalogSource, setCatalogSource] = useState(false);
  useEffect(() => {
    if (parameters.artistId) return;
    const cancellation = new AbortController();
    setFailure(false);
    void network
      .get<Artist>('api/artists/resolve', {
        params: {
          recordingId: parameters.recordingId,
          albumId: parameters.albumId,
        },
        signal: cancellation.signal,
      })
      .then(response => {
        if (!cancellation.signal.aborted) setArtist(response.data);
      })
      .catch(() => {
        if (!cancellation.signal.aborted) setFailure(true);
      });
    return () => cancellation.abort();
  }, [network, parameters, retry]);
  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={Policy.back}
        onPress={() => navigation.goBack()}
      >
        <DefaultText>{Policy.back}</DefaultText>
      </Pressable>
      <DefaultText style={styles.muted}>{Policy.title}</DefaultText>
      <DefaultText style={styles.title}>
        {artist?.name ?? parameters.artistName ?? Policy.title}
      </DefaultText>
      {artist && (
        <View style={styles.tabs}>
          {[false, true].map(catalog => {
            const title = catalog ? Policy.catalog : Policy.library;
            return (
              <Pressable
                key={title}
                accessibilityRole="tab"
                accessibilityLabel={title}
                accessibilityState={{ selected: catalogSource === catalog }}
                style={[
                  styles.button,
                  catalogSource === catalog && styles.selected,
                ]}
                onPress={() => setCatalogSource(catalog)}
              >
                <DefaultText
                  style={catalogSource === catalog && styles.selectedText}
                >
                  {title}
                </DefaultText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
  return (
    <PageContainer>
      {artist ? (
        <ArtistAlbums
          key={JSON.stringify([artist.id, catalogSource])}
          artist={artist}
          catalogSource={catalogSource}
          navigation={navigation}
          header={header}
          onArtistLoaded={setArtist}
        />
      ) : (
        <View style={styles.content}>
          {header}
          {failure ? (
            <View style={styles.notice}>
              <DefaultText>{Policy.resolveFailure}</DefaultText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={Policy.retry}
                onPress={() => setRetry(value => value + Policy.retryIncrement)}
              >
                <DefaultText>{Policy.retry}</DefaultText>
              </Pressable>
            </View>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      )}
    </PageContainer>
  );
}

function ArtistAlbums({
  artist,
  catalogSource,
  navigation,
  header,
  onArtistLoaded,
}: {
  artist: Artist;
  catalogSource: boolean;
  navigation: Navigation;
  header: React.ReactElement;
  onArtistLoaded(artist: Artist): void;
}) {
  const network = useApi();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [offset, setOffset] = useState<number>(Policy.firstOffset);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(false);
  const [retry, setRetry] = useState<number>(Policy.initialRetry);
  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true);
    setFailure(false);
    void network
      .get<AlbumPage>(`api/artists/${encodeURIComponent(artist.id)}/albums`, {
        params: { offset, catalogSource },
        signal: cancellation.signal,
      })
      .then(response => {
        if (cancellation.signal.aborted) return;
        setAlbums(previous => [
          ...new Map(
            [...previous, ...response.data.albums].map(album => [
              album.id,
              album,
            ]),
          ).values(),
        ]);
        setNextOffset(response.data.nextOffset);
        onArtistLoaded(response.data.artist);
      })
      .catch(() => {
        if (!cancellation.signal.aborted) setFailure(true);
      })
      .finally(() => {
        if (!cancellation.signal.aborted) setLoading(false);
      });
    return () => cancellation.abort();
  }, [network, artist.id, catalogSource, offset, retry, onArtistLoaded]);
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      columnWrapperStyle={styles.columns}
      data={albums}
      numColumns={Policy.columns}
      keyExtractor={album => album.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open album ${item.title}`}
          style={styles.album}
          onPress={() => {
            const destination = homeCollectionDestination({
              ...item,
              type: HomeCollectionType.Album,
            });
            if (destination)
              navigation.navigate(destination.route, destination.parameters);
          }}
        >
          <CachedImage
            releaseId={item.id}
            cover={item.cover}
            smallCover={item.smallCover}
            verySmallCover={item.verySmallCover}
            style={styles.artwork}
          />
          <DefaultText style={styles.albumTitle}>{item.title}</DefaultText>
          <DefaultText style={styles.muted}>{item.artistName}</DefaultText>
        </Pressable>
      )}
      ListFooterComponent={
        <View style={styles.notice}>
          {loading && <ActivityIndicator />}
          {failure && (
            <>
              <DefaultText>{Policy.loadFailure}</DefaultText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={Policy.retry}
                onPress={() => setRetry(value => value + Policy.retryIncrement)}
              >
                <DefaultText>{Policy.retry}</DefaultText>
              </Pressable>
            </>
          )}
          {!loading && !failure && albums.length === Policy.firstOffset && (
            <DefaultText>
              {catalogSource ? Policy.emptyCatalog : Policy.emptyLibrary}
            </DefaultText>
          )}
          {!loading && !failure && nextOffset !== null && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={Policy.more}
              style={styles.button}
              onPress={() => setOffset(nextOffset)}
            >
              <DefaultText>{Policy.more}</DefaultText>
            </Pressable>
          )}
          {catalogSource && (
            <DefaultText style={styles.muted}>
              {Policy.catalogNotice}
            </DefaultText>
          )}
        </View>
      }
    />
  );
}
