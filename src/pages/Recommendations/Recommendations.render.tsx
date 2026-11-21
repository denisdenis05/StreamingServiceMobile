import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import PageContainer from '../../components/PageContainer';
import DefaultText from '../../components/DefaultText';
import CachedImage from '../../components/CachedImage';
import { colors, typography } from '../../constants/styling';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/AuthContext';
import { recommendationPlayback } from '../../services/RecommendationPlaybackPlatform';
import {
  RecommendationModes,
  RecommendationRoutes,
} from '../../services/recommendations/RecommendationContracts';
import type {
  DailyRecommendationMix,
  RecommendationPage,
  RecommendationRequest,
} from '../../services/recommendations/RecommendationContracts';
import { notifyLibraryChanged } from '../../services/LibraryChanges';

const Policy = Object.freeze({
  gap: 12,
  padding: 20,
  radius: 12,
  cover: 48,
  title: 24,
  firstIndex: 0,
  empty: '',
  titleLines: 1,
  buttonPadding: 12,
  maximumNameLength: 160,
  conflictStatus: 409,
  screen: 'PlaylistViewer',
  owner: true,
  dailyName: "Today's playlist",
  loadFailure: 'Recommendations could not be loaded. Try again.',
  saveFailure: 'The playlist could not be saved. Your selection is still here.',
  playbackFailure: 'This selection could not start. Please try again.',
  refreshConflict:
    'This daily mix changed elsewhere. Reload it before regenerating.',
});
const styles = StyleSheet.create({
  content: {
    padding: Policy.padding,
    gap: Policy.gap,
    paddingBottom: Policy.padding * 2,
  },
  scroll: { width: '100%' },
  title: { fontSize: Policy.title, fontWeight: '700' },
  muted: { color: colors.slightlyTransparentText },
  card: {
    backgroundColor: colors.surfaceCard,
    padding: Policy.padding,
    borderRadius: Policy.radius,
    gap: Policy.gap,
  },
  row: { flexDirection: 'row', gap: Policy.gap, alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Policy.gap },
  button: {
    backgroundColor: colors.surfaceElevated,
    padding: Policy.buttonPadding,
    borderRadius: Policy.radius,
  },
  cover: {
    width: 180,
    height: 180,
    borderRadius: Policy.radius,
    alignSelf: 'center',
  },
  artwork: {
    width: Policy.cover,
    height: Policy.cover,
    borderRadius: Policy.radius,
  },
  track: { flex: 1 },
  trackTitle: { fontSize: typography.itemTitle },
  input: {
    color: colors.normalText,
    padding: Policy.buttonPadding,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: Policy.radius,
  },
});
const playlistTitles: Record<string, string> = {
  [RecommendationModes.daily]: Policy.dailyName,
  [RecommendationModes.calm]: 'Take it easy',
  [RecommendationModes.energy]: 'Pick up the pace',
  [RecommendationModes.instrumental]: 'Mostly instrumental',
  [RecommendationModes.smartShuffle]: 'Smart shuffle',
  [RecommendationModes.songRadio]: 'Song radio',
  [RecommendationModes.artistRadio]: 'Artist radio',
  [RecommendationModes.playlistRadio]: 'Playlist radio',
};
type PlaylistParameters = RecommendationRequest & { playlistTitle?: string };
function playlistRequest(
  parameters: object | undefined,
): RecommendationRequest {
  const selection = { ...parameters } as PlaylistParameters;
  delete selection.playlistTitle;
  return selection.mode ? selection : { mode: RecommendationModes.daily };
}
export default function Recommendations({
  navigation,
  route,
}: NativeStackScreenProps<ParamListBase, 'Recommendations'>) {
  const network = useApi();
  const { accountIdentifier } = useAuth();
  const parameters = route.params as PlaylistParameters | undefined;
  const title =
    parameters?.playlistTitle ??
    playlistTitles[parameters?.mode ?? RecommendationModes.daily] ??
    'Recommended playlist';
  const [request, setRequest] = useState<RecommendationRequest>(
    playlistRequest(route.params),
  );
  const [page, setPage] = useState<RecommendationPage | null>(null);
  const [dailyVersion, setDailyVersion] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [name, setName] = useState<string>(Policy.dailyName);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(Policy.firstIndex);
  const pageOwner = useRef<string | null>(null);
  const account = useRef(accountIdentifier);
  account.current = accountIdentifier;
  const playback = useSyncExternalStore(
    recommendationPlayback.subscribe,
    recommendationPlayback.getSnapshot,
  );

  const load = useCallback(
    async (selection: RecommendationRequest, regenerateVersion?: string) => {
      pending.current?.abort();
      const controller = new AbortController();
      const operationGeneration = ++generation.current;
      const owner = account.current;
      pending.current = controller;
      pageOwner.current = null;
      setRequest(selection);
      setLoading(true);
      setError(null);
      setPage(null);
      setDailyVersion(null);
      setSavedId(null);
      try {
        let result: RecommendationPage;
        let daily: DailyRecommendationMix | null = null;
        if (selection.mode === RecommendationModes.daily) {
          daily =
            regenerateVersion === undefined
              ? (
                  await network.get<DailyRecommendationMix>(
                    RecommendationRoutes.daily,
                    { signal: controller.signal },
                  )
                ).data
              : (
                  await network.post<DailyRecommendationMix>(
                    RecommendationRoutes.regenerate,
                    { expectedVersion: regenerateVersion },
                    { signal: controller.signal },
                  )
                ).data;
          result = {
            tracks: daily.tracks,
            continuationToken: null,
            explanation:
              'Your daily selection. Save it to keep a playlist you can edit.',
            featureGeneration: daily.version,
            mode: selection.mode,
          };
        } else
          result = (
            await network.post<RecommendationPage>(
              RecommendationRoutes.generate,
              selection,
              { signal: controller.signal },
            )
          ).data;
        if (
          controller.signal.aborted ||
          owner !== account.current ||
          operationGeneration !== generation.current
        )
          return;
        pageOwner.current = owner;
        setPage(result);
        setDailyVersion(daily?.version ?? null);
        setSavedId(daily?.savedPlaylistId ?? null);
        setName(title);
      } catch (failure: any) {
        if (
          !controller.signal.aborted &&
          owner === account.current &&
          operationGeneration === generation.current
        )
          setError(
            failure?.response?.status === Policy.conflictStatus
              ? Policy.refreshConflict
              : Policy.loadFailure,
          );
      } finally {
        if (operationGeneration === generation.current) setLoading(false);
      }
    },
    [network, title],
  );

  useEffect(() => {
    const requestGeneration = generation;
    void load(playlistRequest(route.params));
    return () => {
      pending.current?.abort();
      requestGeneration.current++;
    };
  }, [accountIdentifier, load, network, route.params]);

  const play = async (index: number = Policy.firstIndex) => {
    if (!page || pageOwner.current !== account.current) return;
    try {
      await recommendationPlayback.start(request, page, index);
      navigation.navigate(RecommendationRoutes.playing);
    } catch {
      setError(Policy.playbackFailure);
    }
  };
  const save = async () => {
    if (
      !page ||
      pageOwner.current !== account.current ||
      saving ||
      page.tracks.length === 0 ||
      savedId
    )
      return;
    const owner = account.current;
    const operationGeneration = generation.current;
    setSaving(true);
    setError(null);
    try {
      const result = (
        await network.post<{ id: string; name: string; cover: string }>(
          RecommendationRoutes.playlists,
          {
            name,
            recordingIds: page.tracks.map(track => track.id),
            dailyVersion,
          },
        )
      ).data;
      if (
        owner !== account.current ||
        operationGeneration !== generation.current
      )
        return;
      setSavedId(result.id);
      notifyLibraryChanged();
      navigation.navigate(Policy.screen, {
        playlistId: result.id,
        playlistTitle: result.name,
        playlistCover: result.cover,
        isOwner: Policy.owner,
        playlistOwner: Policy.empty,
      });
    } catch {
      if (
        owner === account.current &&
        operationGeneration === generation.current
      )
        setError(Policy.saveFailure);
    } finally {
      setSaving(false);
    }
  };
  const button = (label: string, action: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={action}
      style={styles.button}
    >
      <DefaultText>{label}</DefaultText>
    </Pressable>
  );
  return (
    <PageContainer>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {button('Back', () => navigation.goBack())}
        {page?.tracks[0] && (
          <CachedImage
            cover={page.tracks[0].cover}
            smallCover={page.tracks[0].smallCover}
            verySmallCover={page.tracks[0].verySmallCover}
            releaseId={page.tracks[0].releaseId}
            tier="full"
            style={styles.cover}
            resizeMode="cover"
          />
        )}
        <DefaultText style={styles.title}>{title}</DefaultText>
        <DefaultText style={styles.muted}>
          Recommended playlist · Listen now or save it to your library.
        </DefaultText>
        {loading && (
          <ActivityIndicator
            accessibilityLabel="Loading recommendations"
            color={colors.accentPrimary}
          />
        )}
        {error && (
          <View accessibilityRole="alert">
            <DefaultText>{error}</DefaultText>
            {button('Try again', () => void load(request), loading)}
          </View>
        )}
        {page && (
          <View style={styles.card}>
            <DefaultText>{page.explanation}</DefaultText>
            <DefaultText style={styles.muted}>
              {page.tracks.length} tracks
            </DefaultText>
            <View style={styles.wrap}>
              {button(
                'Play selection',
                () => void play(),
                loading || page.tracks.length === 0,
              )}
              {dailyVersion &&
                button(
                  'Regenerate today',
                  () => void load(request, dailyVersion),
                  loading || saving,
                )}
              {button(
                'New selection',
                () => void load(request),
                loading || request.mode === RecommendationModes.daily || saving,
              )}
            </View>
            {page.tracks.length === 0 && (
              <DefaultText style={styles.muted}>
                No playable candidates yet. Try another mode after more tracks
                are available.
              </DefaultText>
            )}
            <TextInput
              accessibilityLabel="Playlist name"
              value={name}
              onChangeText={setName}
              style={styles.input}
              maxLength={Policy.maximumNameLength}
            />
            {button(
              savedId ? 'Playlist saved' : 'Save as playlist',
              () => void save(),
              saving ||
                savedId !== null ||
                page.tracks.length === 0 ||
                name.trim().length === 0,
            )}
            {page.tracks.map((track, index) => (
              <Pressable
                key={track.id}
                accessibilityRole="button"
                accessibilityLabel={'Play ' + track.title}
                style={styles.row}
                onPress={() => void play(index)}
              >
                <CachedImage
                  cover={track.cover}
                  smallCover={track.smallCover}
                  verySmallCover={track.verySmallCover}
                  releaseId={track.releaseId}
                  tier="small"
                  style={styles.artwork}
                  resizeMode="cover"
                />
                <View style={styles.track}>
                  <DefaultText numberOfLines={Policy.titleLines}>
                    {track.title}
                  </DefaultText>
                  <DefaultText
                    numberOfLines={Policy.titleLines}
                    style={styles.muted}
                  >
                    {track.artistName}
                  </DefaultText>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        {playback.active &&
          button('Stop automatic continuation', recommendationPlayback.stop)}
        {playback.failure && (
          <View>
            <DefaultText>{playback.failure}</DefaultText>
            {button(
              'Retry continuation',
              () => void recommendationPlayback.retry(),
            )}
          </View>
        )}
      </ScrollView>
    </PageContainer>
  );
}
