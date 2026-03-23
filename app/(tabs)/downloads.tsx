import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import {
  getAllVideos,
  initializeDatabase,
  type VideoRow,
} from '@/src/db/database';
import { LIQUID_COLORS } from '@/src/theme/liquid';

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00';
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function displayFilename(filename: string) {
  return filename.replace(/\.[^.]+$/i, '').trim() || filename;
}

function DownloadRow({
  item,
  onPress,
}: {
  item: VideoRow;
  onPress: () => void;
}) {
  const progressRatio =
    item.duration > 0 ? Math.max(0, Math.min(item.progress / item.duration, 1)) : 0;

  return (
    <Pressable onPress={onPress}>
      <GlassCard style={styles.downloadCard}>
        <View style={styles.downloadIconWrap}>
          <Ionicons
            name={item.is_pinned ? 'pin' : 'film-outline'}
            size={18}
            color={item.is_pinned ? LIQUID_COLORS.accentGold : LIQUID_COLORS.accentBlue}
          />
        </View>

        <View style={styles.downloadCopy}>
          <Text style={styles.downloadTitle} numberOfLines={2}>
            {displayFilename(item.filename)}
          </Text>
          <Text style={styles.downloadMeta} numberOfLines={1}>
            {item.episode_num ? `Епізод ${String(item.episode_num).padStart(2, '0')}` : 'Відео'}
          </Text>
          <Text style={styles.downloadProgress}>
            {formatClock(item.progress)} / {formatClock(item.duration)}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
          </View>
        </View>

        <Ionicons name="play-circle-outline" size={24} color={LIQUID_COLORS.textPrimary} />
      </GlassCard>
    </Pressable>
  );
}

export default function DownloadsTabScreen() {
  const db = useSQLiteContext();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await initializeDatabase(db);
      setVideos(await getAllVideos(db));
    } catch {
      setVideos([]);
      setError('Не вдалося завантажити список файлів із SQLite.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadVideos();
    }, [loadVideos])
  );

  const renderItem = ({ item }: ListRenderItemInfo<VideoRow>) => (
    <DownloadRow
      item={item}
      onPress={() => {
        router.push({
          pathname: '/player/[source]/[id]',
          params: {
            source: 'library',
            id: String(item.id),
          },
        });
      }}
    />
  );

  return (
    <LiquidBackground>
      <View style={styles.header}>
        <View>
          <Image source={require('../../assets/images/icon.png')} style={styles.appIcon} contentFit="cover" />
          <Text style={styles.eyebrow}>SQLite</Text>
          <Text style={styles.title}>Файли</Text>
          <Text style={styles.subtitle}>Усі імпортовані відео з локальної бази даних.</Text>
        </View>

        <Pressable
          onPress={() => {
            void loadVideos();
          }}
          style={styles.headerButton}>
          <Ionicons name="refresh" size={18} color={LIQUID_COLORS.textPrimary} />
        </Pressable>
      </View>

      {error ? (
        <GlassCard style={styles.messageCard}>
          <Text style={styles.errorText}>{error}</Text>
        </GlassCard>
      ) : null}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={LIQUID_COLORS.textPrimary} />
          <Text style={styles.stateTitle}>Читаю SQLite</Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={8}
          removeClippedSubviews
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <GlassCard style={styles.messageCard}>
              <Text style={styles.emptyTitle}>Файлів ще немає</Text>
              <Text style={styles.emptyCopy}>Імпортуйте відео у вкладці бібліотеки.</Text>
            </GlassCard>
          }
        />
      )}
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  appIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  eyebrow: {
    color: LIQUID_COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 8,
    color: LIQUID_COLORS.textPrimary,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    marginTop: 8,
    maxWidth: 280,
    color: LIQUID_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LIQUID_COLORS.button,
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
  },
  messageCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  errorText: {
    color: LIQUID_COLORS.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  downloadCard: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  downloadIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  downloadCopy: {
    flex: 1,
    gap: 4,
  },
  downloadTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  downloadMeta: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 12,
  },
  downloadProgress: {
    color: LIQUID_COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    marginTop: 6,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: LIQUID_COLORS.accentBlue,
  },
  emptyTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyCopy: {
    marginTop: 6,
    color: LIQUID_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
