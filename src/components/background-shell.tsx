import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '@/src/providers/app-provider';

export function BackgroundShell({ children }: { children: ReactNode }) {
  const { theme } = useApp();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.orbLarge, { backgroundColor: theme.accentMuted }]} />
      <View style={[styles.orbSmall, { backgroundColor: theme.surfaceElevated }]} />
      <View style={[styles.orbGlow, { backgroundColor: theme.accentGlow }]} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  orbLarge: {
    position: 'absolute',
    top: -80,
    right: -20,
    width: 220,
    height: 220,
    borderRadius: 999,
    opacity: 0.2,
  },
  orbSmall: {
    position: 'absolute',
    bottom: 80,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 999,
    opacity: 0.4,
  },
  orbGlow: {
    position: 'absolute',
    top: 220,
    left: 48,
    width: 120,
    height: 120,
    borderRadius: 999,
    opacity: 0.12,
  },
});
