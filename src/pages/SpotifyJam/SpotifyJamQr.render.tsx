import { useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Modal, ScrollView, Share, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import DefaultButton from '../../components/DefaultButton/DefaultButton.render';
import DefaultText from '../../components/DefaultText';
import { colors, fonts, typography } from '../../constants/styling';
import { spotifyMobile } from '../../services/SpotifyMobileService';
import { SpotifyJamQr, SpotifyJamQrStatus } from '../../services/spotify/SpotifyJamQr';
import { encodeSpotifyJamQr } from '../../services/spotify/SpotifyJamQrEncoder';
import type { SpotifyJamQrDependencies } from '../../services/spotify/SpotifyJamQr';

export const SpotifyJamQrCopy = Object.freeze({ open: 'Show Jam QR code', heading: 'Invite to this Jam',
  explanation: 'Ask a friend to scan this Spotify invitation with their phone camera. The link opens Spotify; they still choose whether to join.',
  privacy: 'Anyone with this invitation can ask to join. Show or share it only with people you choose.',
  generated: 'Generated on this device. No QR service receives your invitation.',
  scanning: 'Spotify Jam invitation QR code. Use Show invitation text or Share invitation link for an accessible alternative.',
  failed: 'The QR code could not be created. Close this window and use Share invitation, or refresh the Jam and try again.',
  share: 'Share invitation link', showText: 'Show invitation text', close: 'Close invitation',
  shareFailed: 'The invitation could not be shared. Try again or select the invitation text.',
  shareTitle: 'Spotify Jam invitation' });
const Presentation = Object.freeze({ animation: 'fade', accessibilityRole: 'image', alertRole: 'alert',
  squareSidePoints: 280, white: '#FFFFFF', black: '#000000', coordinateOrigin: 0,
  fullWidth: '100%', maximumCardWidthPoints: 420, pageInsetPoints: 24, gapPoints: 16, radiusPoints: 20,
  backdrop: 'rgba(42, 36, 32, 0.55)', fillWeight: 1, squareAspectRatio: 1, alignment: 'center', serifWeight: '700' } as const);
const Dependencies: SpotifyJamQrDependencies = { source: spotifyMobile, encode: encodeSpotifyJamQr,
  share: async address => { await Share.share({ title: SpotifyJamQrCopy.shareTitle, message: address }); } };
interface SpotifyJamQrInvitationProperties { readonly disabled: boolean; readonly dependencies?: SpotifyJamQrDependencies }

export default function SpotifyJamQrInvitation({ disabled, dependencies = Dependencies }: SpotifyJamQrInvitationProperties) {
  const [invitation] = useState(() => new SpotifyJamQr(dependencies));
  const snapshot = useSyncExternalStore(invitation.subscribe, invitation.getSnapshot);
  const geometry = snapshot.geometry;
  return <>
    <DefaultButton title={SpotifyJamQrCopy.open} onPress={() => { void invitation.open(); }} disabled={disabled} />
    <Modal visible={!disabled && snapshot.status !== SpotifyJamQrStatus.Closed} transparent
      animationType={Presentation.animation} onRequestClose={invitation.close}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card} accessibilityViewIsModal>
            <DefaultText style={styles.heading}>{SpotifyJamQrCopy.heading}</DefaultText>
            <DefaultText>{SpotifyJamQrCopy.explanation}</DefaultText>
            <DefaultText style={styles.detail}>{SpotifyJamQrCopy.privacy}</DefaultText>
            {snapshot.status === SpotifyJamQrStatus.Generating && <ActivityIndicator color={colors.accentPrimary} />}
            {snapshot.status === SpotifyJamQrStatus.Ready && geometry !== null && <>
              <View style={styles.code} accessible accessibilityRole={Presentation.accessibilityRole} accessibilityLabel={SpotifyJamQrCopy.scanning}>
                <Svg width={Presentation.fullWidth} height={Presentation.fullWidth}
                  viewBox={`${Presentation.coordinateOrigin} ${Presentation.coordinateOrigin} ${geometry.sizeModules} ${geometry.sizeModules}`}>
                  <Rect width={geometry.sizeModules} height={geometry.sizeModules} fill={Presentation.white} />
                  <Path d={geometry.path} fill={Presentation.black} />
                </Svg>
              </View>
              <DefaultText style={styles.detail}>{SpotifyJamQrCopy.generated}</DefaultText>
              <DefaultButton title={SpotifyJamQrCopy.share} onPress={() => { void invitation.share(); }} />
              <DefaultButton title={SpotifyJamQrCopy.showText} onPress={invitation.revealText} />
              {snapshot.textVisible && <DefaultText selectable>{invitation.invitationText()}</DefaultText>}
            </>}
            {snapshot.status === SpotifyJamQrStatus.Failed && <DefaultText accessibilityRole={Presentation.alertRole}>{SpotifyJamQrCopy.failed}</DefaultText>}
            {snapshot.shareFailed && <DefaultText accessibilityRole={Presentation.alertRole}>{SpotifyJamQrCopy.shareFailed}</DefaultText>}
            <DefaultButton title={SpotifyJamQrCopy.close} onPress={invitation.close} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  backdrop: { flex: Presentation.fillWeight, backgroundColor: Presentation.backdrop, justifyContent: Presentation.alignment },
  scroll: { flexGrow: Presentation.fillWeight, justifyContent: Presentation.alignment, alignItems: Presentation.alignment, padding: Presentation.pageInsetPoints },
  card: { width: Presentation.fullWidth, maxWidth: Presentation.maximumCardWidthPoints, backgroundColor: colors.surfaceCard,
    borderRadius: Presentation.radiusPoints, padding: Presentation.pageInsetPoints, gap: Presentation.gapPoints },
  heading: { fontFamily: fonts.serif, fontSize: typography.dialogTitle, fontWeight: Presentation.serifWeight },
  detail: { fontSize: typography.secondary, color: colors.slightlyTransparentText },
  code: { width: Presentation.fullWidth, maxWidth: Presentation.squareSidePoints, aspectRatio: Presentation.squareAspectRatio, alignSelf: Presentation.alignment,
    backgroundColor: Presentation.white },
});
