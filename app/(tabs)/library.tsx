import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { LIQUID_COLORS } from '@/src/theme/liquid';

type VideoRow = {
  id: number;
  uri: string;
  title: string;
  duration: number;
  currentTime: number;
};

const VIDEOS_DIRECTORY = `${FileSystem.documentDirectory ?? ''}videos/`;

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/g, '').trim();
}

function sanitizeFilename(filename: string) {
  const normalized = filename
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return `video-${Date.now()}.mp4`;
  }

  return normalized;
}

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

function progressRatio(video: VideoRow) {
  if (!video.duration || video.duration <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(video.currentTime / video.duration, 1));
}

function VideoCard({
  item,
  onPlay,
  onRename,
}: {
  item: VideoRow;
  onPlay: () => void;
  onRename: () => void;
}) {
  const ratio = progressRatio(item);

  return (
    <Pressable onPress={onPlay}>
      <GlassCard style={styles.videoCard}>
        <View style={styles.videoTopRow}>
          <View style={styles.videoIconWrap}>
            <Ionicons name="play" size={18} color={LIQUID_COLORS.textPrimary} />
          </View>

          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onRename();
            }}
            style={styles.editButton}
            hitSlop={10}>
            <Ionicons name="pencil" size={16} color={LIQUID_COLORS.textPrimary} />
          </Pressable>
        </View>

        <Text style={styles.videoTitle} numberOfLines={2}>
          {item.title}
        </Text>

        <Text style={styles.videoMeta}>
          {formatClock(item.currentTime)} / {formatClock(item.duration)}
        </Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
        </View>
      </GlassCard>
    </Pressable>
  );
}

export default function LibraryTabScreen() {
  const db = useSQLiteContext();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingVideo, setEditingVideo] = useState<VideoRow | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const totalProgress = useMemo(() => {
    if (videos.length === 0) {
      return 0;
    }

    return videos.reduce((sum, video) => sum + progressRatio(video), 0) / videos.length;
  }, [videos]);

  const ensureSchema = useCallback(async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY,
        uri TEXT NOT NULL,
        title TEXT NOT NULL,
        duration REAL NOT NULL DEFAULT 0,
        currentTime REAL NOT NULL DEFAULT 0
      );
    `);
  }, [db]);

  const loadVideos = useCallback(async () => {
    setError(null);
    setLoading(true);
    setRefreshing(true);

    try {
      await ensureSchema();
      const rows = await db.getAllAsync<VideoRow>(
        'SELECT id, uri, title, duration, currentTime FROM videos ORDER BY id DESC'
      );
      setVideos(
        rows.map((row) => ({
          ...row,
          duration: Number(row.duration ?? 0),
          currentTime: Number(row.currentTime ?? 0),
        }))
      );
    } catch {
      setError('Не вдалося завантажити локальні відео з SQLite.');
      setVideos([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, ensureSchema]);

  useFocusEffect(
    useCallback(() => {
      void loadVideos();
    }, [loadVideos])
  );

  const handleImport = useCallback(async () => {
    setError(null);
    setImporting(true);

    try {
      await ensureSchema();

      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      if (!FileSystem.documentDirectory) {
        throw new Error('Локальне сховище недоступне.');
      }

      await FileSystem.makeDirectoryAsync(VIDEOS_DIRECTORY, { intermediates: true });

      const pickedAsset = result.assets[0];
      const safeFilename = sanitizeFilename(pickedAsset.name || `video-${Date.now()}.mp4`);
      const targetUri = `${VIDEOS_DIRECTORY}${Date.now()}-${safeFilename}`;

      await FileSystem.copyAsync({
        from: pickedAsset.uri,
        to: targetUri,
      });

      await db.withTransactionAsync(async () => {
        await db.runAsync(
          'INSERT INTO videos (uri, title, duration, currentTime) VALUES (?, ?, ?, ?)',
          targetUri,
          stripExtension(pickedAsset.name || safeFilename),
          0,
          0
        );
      });

      await loadVideos();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Не вдалося імпортувати файл.');
    } finally {
      setImporting(false);
    }
  }, [db, ensureSchema, loadVideos]);

  const openRenameModal = useCallback((video: VideoRow) => {
    setEditingVideo(video);
    setDraftTitle(video.title);
  }, []);

  const closeRenameModal = useCallback(() => {
    setEditingVideo(null);
    setDraftTitle('');
  }, []);

  const saveTitle = useCallback(async () => {
    if (!editingVideo) {
      return;
    }

    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setError('Назва не може бути порожньою.');
      return;
    }

    setSavingTitle(true);
    setError(null);

    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          'UPDATE videos SET title = ? WHERE id = ?',
          nextTitle,
          editingVideo.id
        );
      });

      setVideos((current) =>
        current.map((item) =>
          item.id === editingVideo.id
            ? {
                ...item,
                title: nextTitle,
              }
            : item
        )
      );
      closeRenameModal();
    } catch {
      setError('Не вдалося зберегти нову назву.');
    } finally {
      setSavingTitle(false);
    }
  }, [closeRenameModal, db, draftTitle, editingVideo]);

  const renderItem = ({ item }: ListRenderItemInfo<VideoRow>) => (
    <VideoCard
      item={item}
      onPlay={() => {
        router.push({
          pathname: '/player/[source]/[id]',
          params: {
            source: 'library',
            id: String(item.id),
          },
        });
      }}
      onRename={() => {
        openRenameModal(item);
      }}
    />
  );

  return (
    <LiquidBackground>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SQLite медіатека</Text>
          <Text style={styles.title}>Бібліотека</Text>
          <Text style={styles.subtitle}>
            Імпортуйте відео з Files, перейменовуйте їх і продовжуйте перегляд із збереженим прогресом.
          </Text>
        </View>

        <Pressable
          onPress={() => {
            void loadVideos();
          }}
          style={styles.headerButton}>
          {refreshing ? (
            <ActivityIndicator size="small" color={LIQUID_COLORS.textPrimary} />
          ) : (
            <Ionicons name="refresh" size={18} color={LIQUID_COLORS.textPrimary} />
          )}
        </Pressable>
      </View>

      <GlassCard style={styles.importCard}>
        <View style={styles.importCopy}>
          <Text style={styles.importTitle}>Імпортувати файл</Text>
          <Text style={styles.importSubtitle}>
            Файл буде скопійований у `documentDirectory` і доданий у таблицю `videos`.
          </Text>
        </View>

        <Pressable
          disabled={importing}
          onPress={() => {
            void handleImport();
          }}
          style={[styles.importButton, importing && styles.importButtonDisabled]}>
          {importing ? (
            <ActivityIndicator size="small" color={LIQUID_COLORS.textPrimary} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color={LIQUID_COLORS.textPrimary} />
              <Text style={styles.importButtonLabel}>Імпортувати файл</Text>
            </>
          )}
        </Pressable>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{videos.length} відео</Text>
          <Text style={styles.summaryLabel}>Прогрес {Math.round(totalProgress * 100)}%</Text>
        </View>
      </GlassCard>

      {error ? (
        <GlassCard style={styles.messageCard}>
          <Text style={styles.errorText}>{error}</Text>
        </GlassCard>
      ) : null}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={LIQUID_COLORS.textPrimary} />
          <Text style={styles.stateTitle}>Читаю базу відео</Text>
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
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <GlassCard style={styles.messageCard}>
              <Text style={styles.emptyTitle}>Бібліотека порожня</Text>
              <Text style={styles.emptyCopy}>
                Натисніть кнопку імпорту вище й додайте перше локальне відео.
              </Text>
            </GlassCard>
          }
        />
      )}

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(editingVideo)}
        onRequestClose={closeRenameModal}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Редагувати назву</Text>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Нова назва"
              placeholderTextColor={LIQUID_COLORS.textMuted}
              style={styles.modalInput}
              autoFocus
            />

            <View style={styles.modalActions}>
              <Pressable onPress={closeRenameModal} style={styles.modalButton}>
                <Text style={styles.modalButtonLabel}>Скасувати</Text>
              </Pressable>

              <Pressable
                disabled={savingTitle}
                onPress={() => {
                  void saveTitle();
                }}
                style={[styles.modalButton, styles.modalButtonPrimary]}>
                {savingTitle ? (
                  <ActivityIndicator size="small" color={LIQUID_COLORS.textPrimary} />
                ) : (
                  <Text style={styles.modalButtonLabel}>Зберегти</Text>
                )}
              </Pressable>
            </View>
          </GlassCard>
        </View>
      </Modal>
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
    maxWidth: 290,
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
  importCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 18,
    gap: 16,
  },
  importCopy: {
    gap: 6,
  },
  importTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  importSubtitle: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  importButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: LIQUID_COLORS.button,
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  importButtonDisabled: {
    opacity: 0.7,
  },
  importButtonLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: LIQUID_COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
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
  separator: {
    height: 12,
  },
  videoCard: {
    padding: 16,
    gap: 12,
  },
  videoTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  videoIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  videoTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  videoMeta: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.64)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    gap: 16,
  },
  modalTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  modalInput: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    color: LIQUID_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    minWidth: 112,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalButtonPrimary: {
    backgroundColor: LIQUID_COLORS.button,
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
  },
  modalButtonLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
