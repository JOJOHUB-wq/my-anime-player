import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '@/src/providers/app-provider';

function GradientLayer({
  colors,
  opacityProgress,
  duration,
}: {
  colors: readonly [string, string, string];
  opacityProgress: SharedValue<number>;
  duration: number;
}) {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(0, {
          duration,
          easing: Easing.inOut(Easing.quad),
        })
      ),
      -1,
      false
    );
  }, [drift, duration]);

  const layerStyle = useAnimatedStyle(() => {
    const scale = 1.02 + interpolate(drift.value, [0, 1], [0, 0.06]);
    const translateX = interpolate(drift.value, [0, 1], [-18, 18]);
    const translateY = interpolate(drift.value, [0, 1], [12, -12]);

    return {
      opacity: opacityProgress.value,
      transform: [{ scale }, { translateX }, { translateY }],
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, layerStyle]}>
      <LinearGradient colors={colors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
    </Animated.View>
  );
}

function LiquidOrb({
  colors,
  size,
  initialTop,
  initialLeft,
  duration,
}: {
  colors: readonly [string, string];
  size: number;
  initialTop: number;
  initialLeft: number;
  duration: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(0, {
          duration,
          easing: Easing.inOut(Easing.quad),
        })
      ),
      -1,
      false
    );
  }, [duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [-24, 24]) },
      { translateY: interpolate(progress.value, [0, 1], [18, -18]) },
      { scale: interpolate(progress.value, [0, 1], [0.92, 1.08]) },
      { rotate: `${interpolate(progress.value, [0, 1], [-10, 10])}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          top: initialTop,
          left: initialLeft,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        animatedStyle,
      ]}>
      <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

export function LiquidBackground({ children }: { children: ReactNode }) {
  const { theme } = useApp();
  const layerA = useSharedValue(1);
  const layerB = useSharedValue(0.42);
  const layerC = useSharedValue(0.28);

  const gradientA = useMemo(
    () => [theme.gradient[0], theme.gradient[1], theme.gradient[2]] as const,
    [theme.gradient]
  );
  const gradientB = useMemo(
    () => [theme.gradient[1], theme.gradient[2], theme.gradient[0]] as const,
    [theme.gradient]
  );
  const gradientC = useMemo(
    () => [theme.gradient[2], theme.gradient[0], theme.gradient[1]] as const,
    [theme.gradient]
  );

  useEffect(() => {
    layerA.value = withRepeat(
      withSequence(
        withTiming(0.78, {
          duration: 18000,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(1, {
          duration: 18000,
          easing: Easing.inOut(Easing.quad),
        })
      ),
      -1,
      false
    );

    layerB.value = withRepeat(
      withSequence(
        withTiming(0.72, {
          duration: 22000,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(0.36, {
          duration: 22000,
          easing: Easing.inOut(Easing.quad),
        })
      ),
      -1,
      false
    );

    layerC.value = withRepeat(
      withSequence(
        withTiming(0.58, {
          duration: 26000,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(0.2, {
          duration: 26000,
          easing: Easing.inOut(Easing.quad),
        })
      ),
      -1,
      false
    );
  }, [layerA, layerB, layerC]);

  return (
    <View style={[styles.root, { backgroundColor: theme.gradient[0] }]}>
      <GradientLayer colors={gradientA} opacityProgress={layerA} duration={26000} />
      <GradientLayer colors={gradientB} opacityProgress={layerB} duration={32000} />
      <GradientLayer colors={gradientC} opacityProgress={layerC} duration={28000} />

      <LiquidOrb colors={theme.orbGradients[0]} size={320} initialTop={-60} initialLeft={-40} duration={21000} />
      <LiquidOrb colors={theme.orbGradients[1]} size={280} initialTop={180} initialLeft={210} duration={25000} />
      <LiquidOrb colors={theme.orbGradients[2]} size={260} initialTop={520} initialLeft={30} duration={29000} />

      <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.shadeTop} />
      <View style={styles.shadeBottom} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#02030A',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  orb: {
    position: 'absolute',
    overflow: 'hidden',
  },
  shadeTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  shadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '34%',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
});
