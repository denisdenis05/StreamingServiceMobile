import React from 'react';
import { Text, View } from 'react-native';
import packageInformation from '../../../package.json';
import { SettingsFrame } from './Settings.components';
import { SettingsCopy as copy } from './Settings.copy';
import { SettingsNavigation } from './Settings.routes';
import { settingsStyles as styles } from './Settings.style';
export default function AboutSettings({
  navigation,
}: {
  navigation: SettingsNavigation;
}) {
  return (
    <SettingsFrame title={copy.about} navigation={navigation}>
      <View style={styles.tile}>
        <Text style={styles.section}>{copy.product}</Text>
        <Text style={styles.text}>
          {copy.version} {packageInformation.version}
        </Text>
        <Text style={styles.muted}>{copy.aboutDetails}</Text>
      </View>
    </SettingsFrame>
  );
}
