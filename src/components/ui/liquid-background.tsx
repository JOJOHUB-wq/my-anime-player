import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '@/src/providers/app-provider';
import { getLiquidGradient } from '@/src/theme/liquid';

export function LiquidBackground({ children }: { children: ReactNode }) {
  const { darkModeEnabled } = useApp();

  return (
    <LinearGradient colors={getLiquidGradient(darkModeEnabled)} style={styles.root}>
      <SafeAreaView style={styles.safeArea}>{children}</SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
});
