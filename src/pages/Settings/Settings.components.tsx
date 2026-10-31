import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SettingsIcon, SettingsSymbol } from './Settings.icons';
import PageContainer from '../../components/PageContainer';
import { settingsStyles as styles } from './Settings.style';
import { SettingsCopy } from './Settings.copy';
import { SettingsNavigation } from './Settings.routes';
export const SettingsSymbols = Object.freeze({
  back: SettingsSymbol.Back,
  forward: SettingsSymbol.Forward,
  account: SettingsSymbol.Account,
  settings: SettingsSymbol.Settings,
  library: SettingsSymbol.Library,
  liked: SettingsSymbol.Create,
  lastFm: SettingsSymbol.LastFm,
  spotify: SettingsSymbol.Spotify,
  playback: SettingsSymbol.Playback,
  storage: SettingsSymbol.Storage,
  about: SettingsSymbol.About,
});
export function SettingsFrame({
  title,
  navigation,
  children,
}: {
  title: string;
  navigation: SettingsNavigation;
  children: React.ReactNode;
}) {
  return (
    <PageContainer>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.frameHeader}>
          <TouchableOpacity
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={SettingsCopy.back}
            onPress={() => navigation.goBack()}
          >
            <SettingsIcon symbol={SettingsSymbols.back} />
          </TouchableOpacity>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
        </View>
        {children}
      </ScrollView>
    </PageContainer>
  );
}
export function SettingsRow({
  title,
  subtitle,
  symbol,
  onPress,
  status,
}: {
  title: string;
  subtitle: string;
  symbol: SettingsSymbol;
  onPress: () => void;
  status?: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={title}
      style={styles.row}
      onPress={onPress}
    >
      <SettingsIcon symbol={symbol} />
      <View style={styles.grow}>
        <Text style={styles.text}>{title}</Text>
        <Text style={styles.muted}>{subtitle}</Text>
      </View>
      {status && <Text style={styles.statusBadge}>{status}</Text>}
      <SettingsIcon symbol={SettingsSymbols.forward} />
    </TouchableOpacity>
  );
}
export function SettingsButton({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabledButton]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );
}
