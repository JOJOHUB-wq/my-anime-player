import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ScreenOrientation from 'expo-screen-orientation';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KodikPlayerSurface } from '@/src/components/player/kodik-player-surface.native';
import { useApp } from '@/src/providers/app-provider';

function resolveParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function WebviewPlayerScreen() {
  const { theme } = useApp();
  const params = useLocalSearchParams<{
    url?: string | string[];
    title?: string | string[];
    subtitle?: string | string[];
  }>();
  const url = useMemo(() => resolveParam(params.url), [params.url]);
  const title = useMemo(() => resolveParam(params.title), [params.title]);
  const subtitle = useMemo(() => resolveParam(params.subtitle), [params.subtitle]);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  if (!url) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.overlay}>
          <View style={[styles.messageCard, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.messageTitle, { color: theme.textPrimary }]}>Ошибка плеера</Text>
            <Text style={[styles.messageCopy, { color: theme.textSecondary }]}>
              Плеер не получил ссылку на Kodik.
            </Text>
            <Pressable
              onPress={() => {
                router.back();
              }}
              style={[styles.backButtonInline, { borderColor: theme.cardBorder, backgroundColor: theme.surfaceMuted }]}>
              <Text style={[styles.backButtonInlineLabel, { color: theme.textPrimary }]}>Назад</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <KodikPlayerSurface uri={url} />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <BlurView
          intensity={44}
          tint="dark"
          style={[styles.topBar, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
          <Pressable
            onPress={() => {
              router.back();
            }}
            style={[styles.iconButton, { backgroundColor: theme.surfaceMuted }]}>
            <Ionicons name="chevron-back" size={20} color={theme.textPrimary} />
          </Pressable>

          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
              {title || 'Kodik Player'}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </BlurView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  topBar: {
    minHeight: 64,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  messageCard: {
    marginTop: 24,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    gap: 8,
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  messageCopy: {
    fontSize: 14,
    lineHeight: 20,
  },
  backButtonInline: {
    marginTop: 10,
    alignSelf: 'flex-start',
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonInlineLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
});
