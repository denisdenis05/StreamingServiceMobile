import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Text, TextInput, View } from 'react-native';
import { ProfilePreferencesPolicy } from '../../services/settings/ProfilePreferencesService';
import { profilePreferences } from '../../services/settings/SettingsServices';
import { SettingsButton, SettingsFrame } from './Settings.components';
import { SettingsCopy as copy } from './Settings.copy';
import { SettingsNavigation } from './Settings.routes';
import { settingsStyles as styles } from './Settings.style';
const AccountCopy = Object.freeze({
  displayName: 'Display name',
  save: 'Save profile',
  loading: 'Loading profile…',
  saving: 'Saving profile…',
});
export default function AccountSettings({
  navigation,
}: {
  navigation: SettingsNavigation;
}) {
  const profile = useSyncExternalStore(
    profilePreferences.subscribe,
    profilePreferences.getSnapshot,
  );
  const [displayName, setDisplayName] = useState(profile.displayName);
  useEffect(() => {
    void profilePreferences.restore();
  }, []);
  useEffect(() => {
    setDisplayName(profile.displayName);
  }, [profile.accountIdentifier, profile.displayName]);
  return (
    <SettingsFrame title={copy.account} navigation={navigation}>
      <View style={styles.tile}>
        <Text style={styles.text}>{AccountCopy.displayName}</Text>
        <TextInput
          accessibilityLabel={AccountCopy.displayName}
          maxLength={ProfilePreferencesPolicy.maximumNameCharacters}
          value={displayName}
          onChangeText={setDisplayName}
          style={styles.text}
          editable={!profile.loading && !profile.saving}
        />
        <Text style={styles.muted}>{copy.localProfile}</Text>
        <SettingsButton
          title={profile.saving ? AccountCopy.saving : AccountCopy.save}
          disabled={
            profile.loading ||
            profile.saving ||
            profile.accountIdentifier === null
          }
          onPress={() => {
            void profilePreferences.saveDisplayName(displayName);
          }}
        />
        {profile.loading && (
          <Text style={styles.muted}>{AccountCopy.loading}</Text>
        )}
        {profile.error && (
          <Text accessibilityRole="alert" style={styles.text}>
            {profile.error}
          </Text>
        )}
      </View>
      <Text style={styles.label}>{copy.accountIdentifier}</Text>
      <Text selectable style={styles.text}>
        {profile.accountIdentifier}
      </Text>
    </SettingsFrame>
  );
}
