import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { GlassCard } from '@/src/components/ui/glass-card';

export function GlassPressable({
  children,
  style,
  contentStyle,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        {...props}
        onPressIn={(event) => {
          scale.value = withSpring(0.97, {
            damping: 18,
            stiffness: 240,
          });
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          scale.value = withSpring(1, {
            damping: 18,
            stiffness: 220,
          });
          onPressOut?.(event);
        }}>
        <GlassCard style={[styles.card, contentStyle]}>{children}</GlassCard>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
  },
});
