import { BlurView } from 'expo-blur';
import { ReactNode } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { LIQUID_COLORS } from '@/src/theme/liquid';

export function GlassCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <BlurView intensity={50} tint="dark" style={[styles.card, style]}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: LIQUID_COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
});
