import { BlurView } from 'expo-blur';
import { type ReactNode } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { useApp } from '@/src/providers/app-provider';

export function GlassCard({
  children,
  style,
  intensity = 72,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}) {
  const { theme } = useApp();

  return (
    <BlurView
      intensity={intensity}
      tint="dark"
      style={[
        styles.card,
        {
          backgroundColor: theme.cardBackground,
          borderColor: 'rgba(255, 255, 255, 0.15)',
          shadowColor: '#FFFFFF',
        },
        style,
      ]}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 0,
  },
});
