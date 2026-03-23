import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';

import { LIQUID_GRADIENT } from '@/src/theme/liquid';

export function LiquidBackground({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={LIQUID_GRADIENT} style={styles.root}>
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
