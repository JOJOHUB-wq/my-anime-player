import { BlurView } from 'expo-blur';
import { type ReactNode } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { useApp } from '@/src/providers/app-provider';

export function GlassCard({
  children,
  style,
  intensity = 80,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}) {
  const { theme } = useApp();

  const isLight = theme.id === 'sakura';

  return (
    <BlurView
      intensity={intensity}
      tint={isLight ? 'light' : 'dark'}
      style={[
        styles.card,
        {
          backgroundColor: isLight ? 'rgba(255, 255, 255, 0.65)' : 'rgba(12, 12, 15, 0.55)',
          borderColor: isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.08)',
        },
        style,
      ]}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 16,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 6,
  },
});
