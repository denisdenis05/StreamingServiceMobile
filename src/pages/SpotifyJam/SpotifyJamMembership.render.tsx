import { useEffect, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { MembershipObservationStatus } from 'streaming-service-spotify-jam';
import DefaultText from '../../components/DefaultText';
import DefaultButton from '../../components/DefaultButton/DefaultButton.render';
import { spotifyMembership } from '../../services/SpotifyMobileService';
import { SpotifyFailureMessages } from '../../services/spotify/SpotifyMobilePolicy';
import { spotifyJamStyles as styles } from './SpotifyJam.style';

export const MembershipCopy = Object.freeze({ refresh: 'Refresh participants', checking: 'Checking Jam membership…',
  stale: 'Membership data is out of date. Refresh before changing the Jam.' });

export default function SpotifyJamMembership() {
  const snapshot = useSyncExternalStore(spotifyMembership.subscribe, spotifyMembership.getSnapshot);
  const focused = useIsFocused();
  useEffect(() => { if (focused) return spotifyMembership.observe(); }, [focused]);
  return <View style={styles.section}>
    <DefaultButton title={MembershipCopy.refresh} onPress={() => { void spotifyMembership.refresh(); }}
      disabled={!snapshot.enabled || snapshot.status === MembershipObservationStatus.Refreshing} />
    {snapshot.status === MembershipObservationStatus.Refreshing && <DefaultText>{MembershipCopy.checking}</DefaultText>}
    {snapshot.status === MembershipObservationStatus.Stale && <DefaultText>{MembershipCopy.stale}</DefaultText>}
    {snapshot.failure !== null && <DefaultText style={styles.error}>{SpotifyFailureMessages[snapshot.failure]}</DefaultText>}
  </View>;
}
