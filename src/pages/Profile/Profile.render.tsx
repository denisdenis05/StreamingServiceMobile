import React, { useEffect, useSyncExternalStore } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import PageContainer from '../../components/PageContainer';
import Navbar from '../../components/Navbar';
import { profilePreferences } from '../../services/settings/SettingsServices';
import { SettingsCopy as copy } from '../Settings/Settings.copy';
import {
  SettingsNavigation,
  SettingsRoutes,
} from '../Settings/Settings.routes';
import { SettingsRow, SettingsSymbols } from '../Settings/Settings.components';
import { SettingsIcon } from '../Settings/Settings.icons';
import { colors } from '../../constants/styling';
import { settingsStyles as styles } from '../Settings/Settings.style';
const ProfileRoutes = Object.freeze({ create: 'CreatePlaylist' });
export default function Profile({
  navigation,
  route,
}: {
  navigation: SettingsNavigation;
  route: { name: string };
}) {
  const profile = useSyncExternalStore(
    profilePreferences.subscribe,
    profilePreferences.getSnapshot,
  );
  useEffect(() => {
    void profilePreferences.restore();
  }, []);
  const displayName = profile.displayName || copy.profileFallback;
  return (
    <PageContainer>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.profile}
          </Text>
          <TouchableOpacity
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={copy.title}
            onPress={() => navigation.navigate(SettingsRoutes.main)}
          >
            <SettingsIcon symbol={SettingsSymbols.settings} />
          </TouchableOpacity>
        </View>
        <View style={styles.person}>
          <View style={styles.avatar}>
            {!profile.displayName && (
              <SettingsIcon
                symbol={SettingsSymbols.account}
                color={colors.textOnAccent}
              />
            )}
            <Text style={styles.avatarText}>
              {profile.displayName
                ? Array.from(profile.displayName)[
                    ProfilePresentation.initialStart
                  ]?.toLocaleUpperCase()
                : null}
            </Text>
          </View>
          <Text style={styles.section}>{displayName}</Text>
          <Text style={styles.muted}>{copy.profileDescription}</Text>
          <TouchableOpacity
            style={styles.outlineButton}
            accessibilityRole="button"
            accessibilityLabel={copy.edit}
            onPress={() => navigation.navigate(SettingsRoutes.account)}
          >
            <Text style={styles.icon}>{copy.edit}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.section}>{copy.library}</Text>
        <View style={styles.grid}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={copy.collection}
            style={styles.tile}
            onPress={() => navigation.navigate(SettingsRoutes.library)}
          >
            <SettingsIcon symbol={SettingsSymbols.library} />
            <Text style={styles.text}>{copy.collection}</Text>
            <Text style={styles.muted}>{copy.collectionDescription}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={copy.create}
            style={styles.tile}
            onPress={() => navigation.navigate(ProfileRoutes.create)}
          >
            <SettingsIcon symbol={SettingsSymbols.liked} />
            <Text style={styles.text}>{copy.create}</Text>
            <Text style={styles.muted}>{copy.createDescription}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.section}>{copy.personalize}</Text>
        <View style={styles.settingsLink}>
          <SettingsRow
            title={copy.title}
            subtitle={copy.settingsDescription}
            symbol={SettingsSymbols.settings}
            onPress={() => navigation.navigate(SettingsRoutes.main)}
          />
        </View>
        <Text style={styles.muted}>{copy.footer}</Text>
      </ScrollView>
      <Navbar navigation={navigation} route={route} />
    </PageContainer>
  );
}
const ProfilePresentation = Object.freeze({ initialStart: 0 });
