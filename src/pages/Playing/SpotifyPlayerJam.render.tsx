import React, { useState, useSyncExternalStore } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fonts, typography } from '../../constants/styling';
import { playerJam } from '../../services/PlayerJamRuntime';
import { SpotifyPlayerJamMode } from '../../services/spotify/SpotifyPlayerJamController';
import { SpotifyUpcomingQueueCopy } from '../../services/spotify/SpotifyUpcomingQueueCopy';
import { SpotifyHostingFailureMessages, spotifyHostingQueueIssueMessage } from '../../services/spotify/SpotifyHostingFailureCopy';
import { SpotifyFailureMessages } from '../../services/spotify/SpotifyMobilePolicy';
import { SpotifyJamRoute } from '../SpotifyJam/SpotifyJam.copy';
import { SettingsIcon, SettingsSymbol } from '../Settings/Settings.icons';
export const PlayerJamCopy = Object.freeze({
  title: 'Spotify Jam',
  manage: 'Manage Jam',
  close: 'Close Jam controls',
  connect: 'Connect Spotify or start a Jam',
  available: 'Ready to listen together',
  hosting: 'Sharing this player with Spotify',
  following: 'Following the Spotify host',
  preparing: 'Preparing shared playback…',
  resolving: 'Matching shared queue entries…',
  stopping: 'Stopping shared playback…',
  failed: 'Shared playback needs attention',
  updating: 'Updating shared playback…',
  market: 'Two-letter listening country',
  marketLength: 2,
  host: 'Start sharing',
  join: 'Join and listen',
  invitation: 'Spotify Jam invitation',
  emptyInvitation: '',
  follow: 'Follow Spotify host',
  stop: 'Stop sharing or following',
  details: 'Open Jam, invitations & QR',
  hostHelp:
    'Songs you choose in this app update the shared Spotify queue. New songs are matched before your queue changes.',
  followHelp:
    'Play, pause, next, previous and seek control the Spotify host when permitted. Host changes update your local playback.',
  ownerSelection:
    'To choose songs from your library for everyone, switch to Host from this player first.',
  guestSelection:
    'Stop following before choosing a different local song. You can add songs through the Jam queue when Spotify permits it.',
  stoppedHelp:
    'Stopping here keeps the remote Jam open. You can manage membership in Spotify Jam.',
  unsupportedOptions:
    'Shuffle and repeat are unavailable while sharing or following.',
});
const Presentation = Object.freeze({
  spacing: 12,
  page: 22,
  radius: 18,
  border: 1,
  full: 1,
  modalOpacity: 'rgba(42,36,32,0.35)',
  iconTarget: 44,
  fullWidth: '100%' as const,
  transparent: 'transparent',
  characters: 'characters' as const,
  animation: 'fade' as const,
  pagePercent: '92%' as const,
  maximumWidth: 460,
});
const StatusCopy = Object.freeze({
  [SpotifyPlayerJamMode.Disconnected]: PlayerJamCopy.connect,
  [SpotifyPlayerJamMode.Available]: PlayerJamCopy.available,
  [SpotifyPlayerJamMode.Hosting]: PlayerJamCopy.hosting,
  [SpotifyPlayerJamMode.Following]: PlayerJamCopy.following,
  [SpotifyPlayerJamMode.Preparing]: PlayerJamCopy.preparing,
  [SpotifyPlayerJamMode.Resolving]: PlayerJamCopy.resolving,
  [SpotifyPlayerJamMode.Stopping]: PlayerJamCopy.stopping,
  [SpotifyPlayerJamMode.Failed]: PlayerJamCopy.failed,
});
export default function SpotifyPlayerJam({
  navigation,
}: {
  navigation: { navigate(route: string): void };
}) {
  const snapshot = useSyncExternalStore(
    playerJam.subscribe,
    playerJam.getSnapshot,
  );
  const [visible, setVisible] = useState(false);
  const [invitation, setInvitation] = useState<string>(PlayerJamCopy.emptyInvitation);
  const shared =
    snapshot.mode === SpotifyPlayerJamMode.Hosting ||
    snapshot.mode === SpotifyPlayerJamMode.Following ||
    snapshot.mode === SpotifyPlayerJamMode.Resolving;
  const queueIssueMessage = spotifyHostingQueueIssueMessage(snapshot.queueIssue);
  const validMarket = snapshot.market.length === PlayerJamCopy.marketLength;
  const button = (title: string, onPress: () => void, disabled = false) => (
    <Pressable
      key={title}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
      onPress={onPress}
    >
      <Text style={[styles.buttonText, disabled && styles.disabledText]}>
        {title}
      </Text>
    </Pressable>
  );
  function details(): void {
    setVisible(false);
    navigation.navigate(SpotifyJamRoute);
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PlayerJamCopy.manage}
        style={styles.strip}
        onPress={() => setVisible(true)}
      >
        <SettingsIcon symbol={SettingsSymbol.Spotify} />
        <View style={styles.grow}>
          <Text style={styles.title}>{PlayerJamCopy.title}</Text>
          <Text style={styles.subtitle}>
            {snapshot.pending
              ? PlayerJamCopy.updating
              : snapshot.failure !== null
              ? PlayerJamCopy.failed
              : StatusCopy[snapshot.mode]}
          </Text>
        </View>
        <SettingsIcon symbol={SettingsSymbol.Forward} />
      </Pressable>
      <Modal
        visible={visible}
        transparent
        animationType={Presentation.animation}
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.headingText}>
                {PlayerJamCopy.title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={PlayerJamCopy.close}
                style={styles.close}
                onPress={() => setVisible(false)}
              >
                <SettingsIcon symbol={SettingsSymbol.Back} />
              </Pressable>
            </View>
            <Text style={styles.title}>
              {snapshot.pending
                ? PlayerJamCopy.updating
                : snapshot.failure !== null
                ? PlayerJamCopy.failed
                : StatusCopy[snapshot.mode]}
            </Text>
            {snapshot.mode === SpotifyPlayerJamMode.Hosting && (
              <Text style={styles.subtitle}>{PlayerJamCopy.hostHelp}</Text>
            )}
            {snapshot.mode === SpotifyPlayerJamMode.Following && (
              <>
                <Text style={styles.subtitle}>{PlayerJamCopy.followHelp}</Text>
                <Text style={styles.subtitle}>
                  {snapshot.owned
                    ? PlayerJamCopy.ownerSelection
                    : PlayerJamCopy.guestSelection}
                </Text>
              </>
            )}
            {(snapshot.connected || snapshot.canCreate || snapshot.canJoin) && (
              <TextInput
                accessibilityLabel={PlayerJamCopy.market}
                placeholder={PlayerJamCopy.market}
                autoCapitalize={Presentation.characters}
                autoCorrect={false}
                maxLength={PlayerJamCopy.marketLength}
                value={snapshot.market}
                editable={!snapshot.pending}
                onChangeText={value => playerJam.setMarket(value)}
                style={styles.input}
              />
            )}
            {(snapshot.canHost || snapshot.canCreate) &&
              button(
                PlayerJamCopy.host,
                () => {
                  void playerJam.startSharing();
                },
                snapshot.pending ||
                  !validMarket ||
                  snapshot.mode === SpotifyPlayerJamMode.Hosting,
              )}
            {snapshot.canJoin && !shared && (
              <>
                <TextInput
                  accessibilityLabel={PlayerJamCopy.invitation}
                  placeholder={PlayerJamCopy.invitation}
                  value={invitation}
                  editable={!snapshot.pending}
                  autoCorrect={false}
                  onChangeText={setInvitation}
                  style={styles.input}
                />
                {button(PlayerJamCopy.join, () => {
                  void playerJam.joinAndListen(invitation);
                }, snapshot.pending || !validMarket || !invitation.trim())}
              </>
            )}
            {snapshot.canFollow &&
              button(
                PlayerJamCopy.follow,
                () => {
                  void playerJam.startFollowing();
                },
                snapshot.pending ||
                  !validMarket ||
                  snapshot.mode === SpotifyPlayerJamMode.Following,
              )}
            {(shared ||
              snapshot.mode === SpotifyPlayerJamMode.Preparing ||
              snapshot.mode === SpotifyPlayerJamMode.Stopping ||
              snapshot.mode === SpotifyPlayerJamMode.Failed) &&
              button(
                PlayerJamCopy.stop,
                () => {
                  void playerJam.stop();
                },
                snapshot.mode === SpotifyPlayerJamMode.Stopping,
              )}
            {shared && (
              <Text style={styles.subtitle}>
                {PlayerJamCopy.unsupportedOptions}
              </Text>
            )}
            {snapshot.upcomingQueuePending && <Text style={styles.subtitle}>{SpotifyUpcomingQueueCopy.pending}</Text>}
            {(snapshot.unavailableUpcomingCount ?? SpotifyUpcomingQueueCopy.emptyCount) > SpotifyUpcomingQueueCopy.emptyCount && <Text style={styles.subtitle}>{SpotifyUpcomingQueueCopy.unavailable}</Text>}
            {snapshot.upcomingQueueFailure && !snapshot.upcomingQueuePending && <Text style={styles.subtitle}>{SpotifyUpcomingQueueCopy.failure}</Text>}
            {queueIssueMessage && <Text accessibilityRole="alert" style={styles.subtitle}>{queueIssueMessage}</Text>}
            {!queueIssueMessage && snapshot.failureStage && <Text style={styles.subtitle}>{SpotifyHostingFailureMessages[snapshot.failureStage]}</Text>}
            {!queueIssueMessage && snapshot.failure !== null && (
              <Text accessibilityRole="alert" style={styles.subtitle}>
                {SpotifyFailureMessages[snapshot.failure]}
              </Text>
            )}
            <Text style={styles.subtitle}>{PlayerJamCopy.stoppedHelp}</Text>
            {button(PlayerJamCopy.details, details)}
          </View>
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  strip: {
    width: Presentation.pagePercent,
    padding: Presentation.spacing,
    backgroundColor: colors.surfaceCard,
    borderRadius: Presentation.radius,
    borderWidth: Presentation.border,
    borderColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Presentation.spacing,
  },
  grow: { flex: Presentation.full },
  title: {
    fontFamily: fonts.sansSerif,
    fontSize: typography.body,
    color: colors.normalText,
  },
  subtitle: {
    fontFamily: fonts.sansSerif,
    fontSize: typography.secondary,
    color: colors.slightlyTransparentText,
  },
  backdrop: {
    flex: Presentation.full,
    backgroundColor: Presentation.modalOpacity,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    width: Presentation.pagePercent,
    maxWidth: Presentation.maximumWidth,
    borderRadius: Presentation.radius,
    backgroundColor: colors.background,
    padding: Presentation.page,
    gap: Presentation.spacing,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headingText: {
    fontFamily: fonts.serif,
    fontSize: typography.sectionTitle,
    color: colors.normalText,
  },
  close: {
    minWidth: Presentation.iconTarget,
    minHeight: Presentation.iconTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: Presentation.border,
    borderColor: colors.borderLight,
    borderRadius: Presentation.spacing,
    minHeight: Presentation.iconTarget,
    paddingHorizontal: Presentation.spacing,
    fontFamily: fonts.sansSerif,
    color: colors.normalText,
  },
  button: {
    minHeight: Presentation.iconTarget,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Presentation.spacing,
    backgroundColor: colors.accentPrimary,
    padding: Presentation.spacing,
  },
  buttonText: {
    fontFamily: fonts.sansSerif,
    fontSize: typography.body,
    color: colors.textOnAccent,
  },
  disabled: { backgroundColor: colors.secondaryBackground },
  disabledText: { color: colors.slightlyTransparentText },
});
