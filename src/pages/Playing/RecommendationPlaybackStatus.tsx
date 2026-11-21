import React, { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import DefaultText from '../../components/DefaultText';
import { colors } from '../../constants/styling';
import { recommendationPlayback } from '../../services/RecommendationPlaybackPlatform';

const Layout = Object.freeze({ padding: 8, gap: 8 });
const styles = StyleSheet.create({
  row: { padding: Layout.padding, gap: Layout.gap },
  action: { color: colors.accentPrimary },
});
export default function RecommendationPlaybackStatus() {
  const state = useSyncExternalStore(
    recommendationPlayback.subscribe,
    recommendationPlayback.getSnapshot,
  );
  if (!state.active && !state.failure) return null;
  return (
    <View style={styles.row}>
      <DefaultText>
        {state.loading
          ? 'Finding the next tracks'
          : state.failure ?? 'Automatic radio continuation'}
      </DefaultText>
      {state.failure && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void recommendationPlayback.retry()}
        >
          <DefaultText style={styles.action}>Retry continuation</DefaultText>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={recommendationPlayback.stop}
      >
        <DefaultText style={styles.action}>Stop continuation</DefaultText>
      </Pressable>
    </View>
  );
}
