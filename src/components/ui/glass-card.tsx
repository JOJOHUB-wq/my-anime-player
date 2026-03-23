import { BlurView } from 'expo-blur';
import { ReactNode } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { useApp } from '@/src/providers/app-provider';
import { getGlassCardAppearance } from '@/src/theme/liquid';

export function GlassCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { darkModeEnabled } = useApp();
  const chrome = getGlassCardAppearance(darkModeEnabled);

  return (
    <BlurView
      intensity={50}
      tint="dark"
      style={[
        styles.card,
        {
          borderColor: chrome.borderColor,
          backgroundColor: chrome.backgroundColor,
        },
        style,
      ]}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
