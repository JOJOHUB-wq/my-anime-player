import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { deleteVideoById, getDownloadRows, initializeDatabase, type DownloadRow } from '@/src/db/database';
import { useDatabaseContext } from '@/src/db/db-context';
import { useDownloads } from '@/src/providers/download-provider';
import { useApp } from '@/src/providers/app-provider';

const PRIMARY_TEXT = '#FFFFFF';
const SECONDARY_TEXT = '#A0A0A0';
const GLASS_BG = 'rgba(10, 14, 28, 0.42)';
const GLASS_BORDER = 'rgba(255,255,255,0.1)';

function statusLabel(status: string, t: (key: string, options?: Record<string, unknown>) => string) {
  if (status === 'downloading') {
    return t('downloads.statusDownloading', { defaultValue: 'Downloading' });
  }

  if (status === 'downloaded') {
    return t('downloads.statusDownloaded', { defaultValue: 'Downloaded' });
  }

  if (status === 'failed') {
    return t('downloads.statusFailed', { defaultValue: 'Failed' });
  }

  if (status === 'available') {
    return t('downloads.statusAvailable', { defaultValue: 'Ready to download' });
  }

  return t('downloads.statusQueued', { defaultValue: 'Queued' });
}

function DownloadCard({
  item,
  index,
  activeProgress,
  onPlay,
  onDelete,
}: {
  item: DownloadRow;
  index: number;
  activeProgress: number;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useApp();
  const progress = Math.max(item.download_progress, activeProgress);
  const playable = item.download_status === 'downloaded' && Boolean(item.uri);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 70).springify()}
      layout={LinearTransition.springify().damping(18).stiffness(180)}>
      <BlurView intensity={40} tint="dark" style={styles.card}>
        <View style={styles.cardRow}>
          {item.thumbnail_uri ? (
            <Image source={{ uri: item.thumbnail_uri }} style={styles.thumbnail} contentFit="cover" />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailFallback, { backgroundColor: theme.surfaceStrong }]}>
              <Ionicons name="download-outline" size={20} color={theme.accentPrimary} />
            </View>
          )}

          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={2}>
              {item.filename.replace(/\.[^.]+$/i, '').replace(/_/g, ' ')}
            </Text>
            <Text style={styles.meta} numberOfLines={2}>
              {item.playlist_name} • {statusLabel(item.download_status, t)}
            </Text>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(0, Math.min(progress, 1)) * 100}%`,
                    backgroundColor: theme.accentPrimary,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={playable ? onPlay : undefined} style={[styles.circleButton, !playable && styles.circleButtonDisabled]}>
              <Ionicons
                name={playable ? 'play' : 'download-outline'}
                size={18}
                color={PRIMARY_TEXT}
              />
            </Pressable>
            <Pressable onPress={onDelete} style={styles.circleButton}>
              <Ionicons name="trash-outline" size={18} color={theme.danger} />
            </Pressable>
          </View>
        </View>
      </BlurView>
    </Animated.View>
  );
}

export default function DownloadsTabScreen() {
  const db = useDatabaseContext();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { theme } = useApp();
  const { activeDownloads } = useDownloads();
  const [items, setItems] = useState<DownloadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDownloads = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    setLoading((current) => current && items.length === 0);

    try {
      await initializeDatabase(db);
      setItems(await getDownloadRows(db));
    } catch {
      setError(t('downloads.loadError', { defaultValue: 'Unable to load downloads.' }));
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, items.length, t]);

  useFocusEffect(
    useCallback(() => {
      void loadDownloads();
    }, [loadDownloads])
  );

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: true,
      headerTitle: '',
      headerShadowVisible: false,
      headerStyle: {
        backgroundColor: 'transparent',
      },
    });
  }, [navigation]);

  useEffect(() => {
    if (Object.keys(activeDownloads).length === 0) {
      return;
    }

    void loadDownloads();
  }, [activeDownloads, loadDownloads]);

  const activeProgressByVideoId = useMemo(() => {
    return Object.values(activeDownloads).reduce<Record<number, number>>((accumulator, item) => {
      accumulator[item.videoId] = item.progress;
      return accumulator;
    }, {});
  }, [activeDownloads]);

  const renderItem = ({ item, index }: ListRenderItemInfo<DownloadRow>) => (
    <DownloadCard
      item={item}
      index={index}
      activeProgress={activeProgressByVideoId[item.id] ?? 0}
      onPlay={() => {
        router.push({
          pathname: '/player/[source]/[id]',
          params: {
            source: 'download',
            id: String(item.id),
          },
        });
      }}
      onDelete={() => {
        void (async () => {
          await deleteVideoById(db, item.id);
          await loadDownloads();
        })();
      }}
    />
  );

  return (
    <LiquidBackground>
      <View style={styles.screen}>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={theme.textPrimary} />
            <Text style={styles.stateTitle}>{t('downloads.loading', { defaultValue: 'Loading downloads' })}</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={[styles.content, items.length === 0 && styles.contentEmpty]}
            showsVerticalScrollIndicator={false}
            onRefresh={() => {
              void loadDownloads();
            }}
            refreshing={refreshing}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListHeaderComponent={
              <Animated.View entering={FadeInDown.duration(420)} style={styles.header}>
                <Image source={require('../../assets/images/icon.png')} style={styles.appIcon} contentFit="cover" />
                <Text style={styles.eyebrow}>{t('downloads.eyebrow', { defaultValue: 'Offline manager' })}</Text>
                <Text style={styles.headerTitle}>{t('downloads.title', { defaultValue: 'Downloads' })}</Text>
                <Text style={styles.subtitle}>{t('downloads.subtitle', { defaultValue: 'Track live download progress, retry failed items, and open offline episodes from one place.' })}</Text>

                {error ? (
                  <BlurView intensity={40} tint="dark" style={styles.noticeCard}>
                    <Text style={styles.noticeText}>{error}</Text>
                  </BlurView>
                ) : null}
              </Animated.View>
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <BlurView intensity={40} tint="dark" style={styles.emptyCard}>
                  <Ionicons name="download-outline" size={28} color={theme.textPrimary} />
                  <Text style={styles.emptyTitle}>{t('downloads.emptyTitle', { defaultValue: 'No downloads yet' })}</Text>
                  <Text style={styles.emptyCopy}>{t('downloads.emptyCopy', { defaultValue: 'Start a download from the Online tab and it will appear here.' })}</Text>
                </BlurView>
              </View>
            }
          />
        )}
      </View>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateTitle: {
    color: PRIMARY_TEXT,
    fontSize: 16,
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  contentEmpty: {
    flexGrow: 1,
  },
  header: {
    marginBottom: 22,
  },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    marginBottom: 14,
  },
  eyebrow: {
    color: SECONDARY_TEXT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    marginTop: 8,
    color: PRIMARY_TEXT,
    fontSize: 34,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 10,
    color: SECONDARY_TEXT,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
  },
  noticeCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    padding: 14,
  },
  noticeText: {
    color: PRIMARY_TEXT,
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    padding: 14,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 16,
  },
  thumbnailFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  title: {
    color: PRIMARY_TEXT,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  meta: {
    marginTop: 6,
    color: SECONDARY_TEXT,
    fontSize: 12,
    lineHeight: 16,
  },
  progressTrack: {
    marginTop: 12,
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  actions: {
    gap: 10,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  circleButtonDisabled: {
    opacity: 0.45,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 12,
    color: PRIMARY_TEXT,
    fontSize: 18,
    fontWeight: '900',
  },
  emptyCopy: {
    marginTop: 8,
    color: SECONDARY_TEXT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
