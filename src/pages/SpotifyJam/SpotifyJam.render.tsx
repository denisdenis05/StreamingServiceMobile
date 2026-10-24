import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, TextInput, View } from 'react-native';
import { IntegrationFailureCode, JamConnectionStatus, JamJoinMode, SpotifyLoginStage } from 'streaming-service-spotify-jam';
import PageContainer from '../../components/PageContainer';
import DefaultText from '../../components/DefaultText';
import DefaultButton from '../../components/DefaultButton/DefaultButton.render';
import { spotifyMobile } from '../../services/SpotifyMobileService';
import { SpotifyAuthenticationAction, SpotifyMobileOperation } from '../../services/spotify/SpotifyMobileController';
import { SpotifyFailureMessages, SpotifyMobilePolicy } from '../../services/spotify/SpotifyMobilePolicy';
import { SpotifyJamCopy } from './SpotifyJam.copy';
import { spotifyJamStyles as styles } from './SpotifyJam.style';
import SpotifyRecordingQueue from './SpotifyRecordingQueue.render';
import SpotifyHostedQueue from './SpotifyHostedQueue.render';
import SpotifyJamMembership from './SpotifyJamMembership.render';
import SpotifySharedPlayback from './SpotifySharedPlayback.render';
import { spotifyRouteSongSelection } from '../../services/spotify/SpotifySongSelection';

const InputPolicy = Object.freeze({ capitalization: 'none', autoComplete: 'off',
  cancelStyle: 'cancel', destructiveStyle: 'destructive' } as const);
interface SpotifyJamNavigation {
  readonly navigation: { goBack(): void };
  readonly route?: { readonly params?: unknown };
}

export default function SpotifyJam({ navigation, route }: SpotifyJamNavigation) {
  const selection = spotifyRouteSongSelection(route?.params);
  const snapshot = useSyncExternalStore(spotifyMobile.subscribe, spotifyMobile.getSnapshot);
  useEffect(() => {
    const current = spotifyMobile.getSnapshot();
    if (!current.connected && current.operation === SpotifyMobileOperation.Idle && current.failure === null) void spotifyMobile.restore();
  }, []);
  const [clientIdentifier, setClientIdentifier] = useState<string>(SpotifyMobilePolicy.emptyText);
  const [queueTrack, setQueueTrack] = useState<string>(SpotifyMobilePolicy.emptyText);
  const [queueReceipt, setQueueReceipt] = useState<typeof snapshot.session>(null);
  const [invitation, setInvitation] = useState<string>(SpotifyMobilePolicy.emptyText);
  const [deviceIdentifier, setDeviceIdentifier] = useState<string>(SpotifyMobilePolicy.emptyText);
  const [mode, setMode] = useState(JamJoinMode.Control);
  const [shareFailure, setShareFailure] = useState(false);
  const [sessionChanged, setSessionChanged] = useState(false);
  const busy = snapshot.operation !== SpotifyMobileOperation.Idle;
  const session = snapshot.session?.session ?? null;
  const uncertain = snapshot.session?.status === JamConnectionStatus.Uncertain;
  const canMutate = snapshot.connected && !busy && snapshot.session?.status === JamConnectionStatus.Ready;
  const loginStep = snapshot.loginStage === undefined ? null : SpotifyJamCopy.loginSteps[snapshot.loginStage];
  const loginFailure = snapshot.authenticationAction === SpotifyAuthenticationAction.Resume
    && (snapshot.failure === IntegrationFailureCode.Unauthorized || snapshot.failure === IntegrationFailureCode.InvalidResponse)
    ? SpotifyJamCopy.resumeFailed : snapshot.loginStage === SpotifyLoginStage.Authorizing && snapshot.failure === IntegrationFailureCode.Canceled
      ? snapshot.authorizationReturnStatus === undefined ? SpotifyJamCopy.loginCancelled
        : SpotifyJamCopy.returnFailures[snapshot.authorizationReturnStatus]
      : snapshot.failure === null ? null : SpotifyFailureMessages[snapshot.failure];

  function connect(): void {
    void spotifyMobile.login({ clientIdentifier: clientIdentifier.trim(), redirectAddress: SpotifyJamCopy.redirectAddress,
      scopes: Object.values(SpotifyJamCopy.loginScopes) });
  }
  function disconnect(): void {
    setQueueReceipt(null);
    setQueueTrack(SpotifyMobilePolicy.emptyText);
    setInvitation(SpotifyMobilePolicy.emptyText);
    setDeviceIdentifier(SpotifyMobilePolicy.emptyText);
    spotifyMobile.disconnect();
  }
  function end(): void {
    const expectedSessionIdentifier = session?.identifier;
    if (expectedSessionIdentifier === undefined) return;
    setSessionChanged(false);
    Alert.alert(SpotifyJamCopy.endTitle, SpotifyJamCopy.endMessage, [
      { text: SpotifyJamCopy.cancel, style: InputPolicy.cancelStyle },
      { text: SpotifyJamCopy.end, style: InputPolicy.destructiveStyle, onPress: () => {
        const current = spotifyMobile.getSnapshot().session?.session;
        if (current?.identifier !== expectedSessionIdentifier || !current.ownedByCurrentAccount) { setSessionChanged(true); return; }
        void spotifyMobile.endSession();
      } },
    ]);
  }
  async function share(): Promise<void> {
    setShareFailure(false);
    const address = spotifyMobile.invitationAddress();
    if (address === null) { setShareFailure(true); return; }
    try { await Share.share({ title: SpotifyJamCopy.shareTitle, message: address }); }
    catch { setShareFailure(true); }
  }
  function join(): void {
    const address = invitation;
    setInvitation(SpotifyMobilePolicy.emptyText);
    void spotifyMobile.joinSession(address, mode);
  }
  async function queue(): Promise<void> {
    setQueueReceipt(null);
    const expectedSession = spotifyMobile.getSnapshot().session;
    if (await spotifyMobile.addToQueue(queueTrack)) {
      const current = spotifyMobile.getSnapshot().session;
      if (current?.accountIdentifier !== expectedSession?.accountIdentifier
        || current?.session?.identifier !== expectedSession?.session?.identifier) return;
      setQueueTrack(SpotifyMobilePolicy.emptyText);
      setQueueReceipt(current);
    }
  }

  return <PageContainer>
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps={KeyboardTapPolicy}>
      <DefaultButton title={SpotifyJamCopy.back} onPress={() => navigation.goBack()} style={styles.neutral} />
      <DefaultText style={styles.heading}>{SpotifyJamCopy.title}</DefaultText>
      <DefaultText>{SpotifyJamCopy.introduction}</DefaultText>
      <DefaultText style={styles.explanation}>{SpotifyJamCopy.playbackNotice}</DefaultText>
      {snapshot.connected && snapshot.failure !== null && <DefaultText accessibilityRole={AlertRole} style={styles.error}>{SpotifyFailureMessages[snapshot.failure]}</DefaultText>}
      {sessionChanged && <DefaultText accessibilityRole={AlertRole} style={styles.error}>{SpotifyJamCopy.sessionChanged}</DefaultText>}
      {busy && <View style={styles.row}><ActivityIndicator /><DefaultText>{SpotifyJamCopy.busy}</DefaultText></View>}
      {!snapshot.connected ? <View style={styles.section}>
        <DefaultText style={styles.sectionTitle}>{SpotifyJamCopy.testBuild}</DefaultText>
        <DefaultText style={styles.explanation}>{SpotifyJamCopy.loginExplanation}</DefaultText>
        <DefaultText style={styles.explanation}>{SpotifyJamCopy.registrationNotice}</DefaultText>
        <DefaultText>{SpotifyJamCopy.redirectAddress}</DefaultText>
        <TextInput value={clientIdentifier} onChangeText={setClientIdentifier} placeholder={SpotifyJamCopy.clientIdentifierPlaceholder}
          accessibilityLabel={SpotifyJamCopy.clientIdentifierPlaceholder} autoCorrect={false}
          autoCapitalize={InputPolicy.capitalization} autoComplete={InputPolicy.autoComplete}
          maxLength={ClientIdentifierCharacters} editable={!busy} style={styles.input} />
        <DefaultButton title={SpotifyJamCopy.connect} onPress={connect} disabled={busy || !clientIdentifier.trim()} />
        {loginStep !== null && <DefaultText>{loginStep}</DefaultText>}
        {loginFailure !== null && <DefaultText accessibilityRole={AlertRole} style={styles.error}>{loginFailure}</DefaultText>}
        <DefaultButton title={SpotifyJamCopy.restore} onPress={() => { void spotifyMobile.restore(); }} disabled={busy} style={styles.neutral} />
        <DefaultButton title={SpotifyJamCopy.forget} onPress={disconnect} disabled={busy} style={styles.neutral} />
      </View> : <>
        <SpotifyJamMembership />
        <SpotifySharedPlayback />
        <SpotifyHostedQueue />
        {selection && selection.recordings.length > SpotifyMobilePolicy.emptyCount && <SpotifyRecordingQueue selection={selection} />}
        <View style={styles.section}>
          <DefaultText>{SpotifyJamCopy.connected + snapshot.displayName}</DefaultText>
          <DefaultButton title={SpotifyJamCopy.disconnect} onPress={disconnect} style={styles.neutral} />
          <DefaultText style={styles.explanation}>{SpotifyJamCopy.disconnectNotice}</DefaultText>
        </View>
        <View style={styles.section}>
          <DefaultText style={styles.sectionTitle}>{SpotifyJamCopy.devices}</DefaultText>
          {snapshot.deviceFailure !== null && <DefaultText style={styles.explanation}>{SpotifyJamCopy.deviceIssuePrefix + SpotifyFailureMessages[snapshot.deviceFailure]}</DefaultText>}
          {snapshot.devices.length === SpotifyMobilePolicy.emptyCount && <DefaultText style={styles.explanation}>{SpotifyJamCopy.noDevices}</DefaultText>}
          {snapshot.devices.map(device => <DefaultButton key={device.identifier}
            title={device.name + (device.active ? SpotifyJamCopy.activeDevice : SpotifyMobilePolicy.emptyText)
              + (snapshot.selectedDeviceIdentifier === device.identifier ? SpotifyJamCopy.selectedDevice : SpotifyMobilePolicy.emptyText)}
            onPress={() => spotifyMobile.selectDevice(device.identifier)} disabled={busy}
            style={snapshot.selectedDeviceIdentifier === device.identifier ? styles.selected : styles.neutral} />)}
          <DefaultButton title={SpotifyJamCopy.reloadDevices} onPress={() => { void spotifyMobile.reloadDevices(); }} disabled={busy} style={styles.neutral} />
          <TextInput value={deviceIdentifier} onChangeText={setDeviceIdentifier} placeholder={SpotifyJamCopy.manualDevicePlaceholder}
            accessibilityLabel={SpotifyJamCopy.manualDevicePlaceholder} autoCapitalize={InputPolicy.capitalization} autoCorrect={false}
            maxLength={SpotifyMobilePolicy.maximumIdentifierCharacters} editable={!busy} style={styles.input} />
          <DefaultButton title={SpotifyJamCopy.selectDevice} onPress={() => spotifyMobile.selectDevice(deviceIdentifier)}
            disabled={busy || !deviceIdentifier.trim()} style={styles.neutral} />
          {snapshot.selectedDeviceIdentifier === null && <DefaultText style={styles.explanation}>{SpotifyJamCopy.noneSelected}</DefaultText>}
          <DefaultButton title={SpotifyJamCopy.refresh} onPress={() => { void spotifyMobile.refreshSession(); }}
            disabled={busy} />
        </View>
        <View style={styles.section}>
          <DefaultText style={styles.sectionTitle}>{session === null ? SpotifyJamCopy.noSession
            : session.ownedByCurrentAccount ? SpotifyJamCopy.ownedSession : SpotifyJamCopy.guestSession}</DefaultText>
          {uncertain && <DefaultText style={styles.error}>{SpotifyJamCopy.uncertainty}</DefaultText>}
          {session !== null ? <>
            {!session.active && <DefaultText>{SpotifyJamCopy.inactiveSession}</DefaultText>}
            <DefaultText>{SpotifyJamCopy.participants}</DefaultText>
            {session.participants.map(participant => <DefaultText key={participant.identifier}>{participant.displayName}</DefaultText>)}
            <DefaultButton title={SpotifyJamCopy.share} onPress={() => { void share(); }}
              disabled={busy || snapshot.session?.status !== JamConnectionStatus.Ready} />
            {session.ownedByCurrentAccount && <View style={styles.section}>
              <DefaultText style={styles.sectionTitle}>{SpotifyJamCopy.queueHeading}</DefaultText>
              <DefaultText style={styles.explanation}>{SpotifyJamCopy.queueNotice}</DefaultText>
              {!session.hostDeviceIdentifier && <DefaultText>{SpotifyJamCopy.queueNoHost}</DefaultText>}
              <TextInput value={queueTrack} onChangeText={setQueueTrack} placeholder={SpotifyJamCopy.queuePlaceholder}
                accessibilityLabel={SpotifyJamCopy.queuePlaceholder} autoCapitalize={InputPolicy.capitalization}
                autoCorrect={false} editable={!busy} maxLength={SpotifyMobilePolicy.maximumInvitationCharacters} style={styles.input} />
              <DefaultButton title={SpotifyJamCopy.addToQueue} onPress={() => { void queue(); }}
                disabled={!canMutate || !session.active || !session.hostDeviceIdentifier || !queueTrack.trim()} />
              {queueReceipt !== null && queueReceipt === snapshot.session && <DefaultText>{SpotifyJamCopy.queueAccepted}</DefaultText>}
            </View>}
            {shareFailure && <DefaultText style={styles.error}>{SpotifyJamCopy.shareFailure}</DefaultText>}
            {session.ownedByCurrentAccount ? <DefaultButton title={SpotifyJamCopy.end} onPress={end} disabled={!canMutate} />
              : <DefaultButton title={SpotifyJamCopy.leave} onPress={() => { void spotifyMobile.leaveSession(); }} disabled={!canMutate} />}
          </> : <>
            <DefaultButton title={SpotifyJamCopy.create} onPress={() => { void spotifyMobile.createSession(); }} disabled={!canMutate} />
            <TextInput value={invitation} onChangeText={setInvitation} placeholder={SpotifyJamCopy.invitePlaceholder}
              accessibilityLabel={SpotifyJamCopy.invitePlaceholder} autoCapitalize={InputPolicy.capitalization} autoCorrect={false}
              maxLength={SpotifyMobilePolicy.maximumInvitationCharacters} editable={!busy} style={styles.input} />
            <DefaultText style={styles.explanation}>{SpotifyJamCopy.joinHelp}</DefaultText>
            <DefaultButton title={SpotifyJamCopy.controlMode} onPress={() => setMode(JamJoinMode.Control)} disabled={busy}
              style={mode === JamJoinMode.Control ? styles.selected : styles.neutral} />
            <DefaultButton title={SpotifyJamCopy.remoteMode} onPress={() => setMode(JamJoinMode.Remote)} disabled={busy}
              style={mode === JamJoinMode.Remote ? styles.selected : styles.neutral} />
            <DefaultButton title={SpotifyJamCopy.join} onPress={join}
              disabled={!canMutate || !invitation.trim() || mode === JamJoinMode.Remote && snapshot.selectedDeviceIdentifier === null} />
          </>}
        </View>
      </>}
    </ScrollView>
  </PageContainer>;
}

const KeyboardTapPolicy = 'handled';
const AlertRole = 'alert';
const ClientIdentifierCharacters = 32;
