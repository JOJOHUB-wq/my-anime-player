import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
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

import {
  deleteVideoById,
  DEFAULT_PLAYLIST_ICON,
  getAllPlaylists,
  getPlaylistById,
  parseImportedFilename,
  getVideosByPlaylist,
  initializeDatabase,
  moveVideoToPlaylist,
  renameVideo,
  setVideoPinned,
  type PlaylistDetailRow,
  type VideoRow,
} from '@/src/db/database';
import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { LIQUID_COLORS } from '@/src/theme/liquid';

type VideoMenuMode = 'actions' | 'rename' | 'move' | null;

function resolvePlaylistIcon(icon?: string): keyof typeof Ionicons.glyphMap {
  if (icon && Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, icon)) {
    return icon as keyof typeof Ionicons.glyphMap;
  }

  return DEFAULT_PLAYLIST_ICON as keyof typeof Ionicons.glyphMap;
}

function displayFilename(filename: string) {
  return parseImportedFilename(filename).cleanFilename || filename.replace(/\.[^.]+$/i, '').trim() || filename;
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

  return Math.max(0, Math.min(video.progress / video.duration, 1));
}

function ActionSheetButton({
  label,
  icon,
  onPress,
  destructive,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.sheetButton}>
      <Ionicons
        name={icon}
        size={18}
        color={destructive ? LIQUID_COLORS.danger : LIQUID_COLORS.textPrimary}
      />
      <Text style={[styles.sheetButtonLabel, destructive && styles.sheetButtonLabelDanger]}>{label}</Text>
    </Pressable>
  );
}

function EpisodeRow({
  item,
  onPlay,
  onOpenMenu,
}: {
  item: VideoRow;
  onPlay: () => void;
  onOpenMenu: () => void;
}) {
  const ratio = progressRatio(item);

  return (
    <Pressable onPress={onPlay}>
      <GlassCard style={styles.episodeCard}>
        {item.is_pinned ? (
          <View style={styles.pinBadge}>
            <Ionicons name="pin" size={12} color={LIQUID_COLORS.textPrimary} />
          </View>
        ) : null}

        <View style={styles.episodeTopRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="play" size={18} color={LIQUID_COLORS.textPrimary} />
          </View>

          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onOpenMenu();
            }}
            style={styles.menuButton}
            hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={18} color={LIQUID_COLORS.textPrimary} />
          </Pressable>
        </View>

        <Text style={styles.episodeTitle} numberOfLines={2}>
          {displayFilename(item.filename)}
        </Text>
        <Text style={styles.episodeMeta}>
          Епізод {item.episode_num ?? '—'} • {formatClock(item.progress)} / {formatClock(item.duration)}
        </Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
        </View>
      </GlassCard>
    </Pressable>
  );
}

export default function FolderScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ folderKey?: string | string[] }>();
  const rawPlaylistId = Array.isArray(params.folderKey) ? params.folderKey[0] : params.folderKey;
  const playlistId = Number(rawPlaylistId);

  const [playlist, setPlaylist] = useState<PlaylistDetailRow | null>(null);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<PlaylistDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoRow | null>(null);
  const [videoMenuMode, setVideoMenuMode] = useState<VideoMenuMode>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  const availablePlaylists = useMemo(
    () => allPlaylists.filter((item) => item.id !== playlistId),
    [allPlaylists, playlistId]
  );

  const loadPlaylistData = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      await initializeDatabase(db);

      if (!Number.isFinite(playlistId) || playlistId <= 0) {
        throw new Error('Некоректний ідентифікатор плейлиста.');
      }

      const [playlistRow, videoRows, playlistRows] = await Promise.all([
        getPlaylistById(db, playlistId),
        getVideosByPlaylist(db, playlistId),
        getAllPlaylists(db),
      ]);

      if (!playlistRow) {
        throw new Error('Плейлист не знайдено.');
      }

      setPlaylist(playlistRow);
      setVideos(videoRows);
      setAllPlaylists(playlistRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити плейлист.');
      setPlaylist(null);
      setVideos([]);
      setAllPlaylists([]);
    } finally {
      setLoading(false);
    }
  }, [db, playlistId]);

  useFocusEffect(
    useCallback(() => {
      void loadPlaylistData();
    }, [loadPlaylistData])
  );

  const closeMenus = useCallback(() => {
    setSelectedVideo(null);
    setVideoMenuMode(null);
    setRenameDraft('');
  }, []);

  const openVideoMenu = useCallback((video: VideoRow) => {
    setSelectedVideo(video);
    setVideoMenuMode('actions');
    setRenameDraft(video.filename);
  }, []);

  const handleTogglePin = useCallback(async () => {
    if (!selectedVideo) {
      return;
    }

    setSubmittingAction(true);
    setError(null);

    try {
      await setVideoPinned(db, selectedVideo.id, selectedVideo.is_pinned === 0);
      closeMenus();
      await loadPlaylistData();
    } catch {
      setError('Не вдалося змінити статус закріплення відео.');
    } finally {
      setSubmittingAction(false);
    }
  }, [closeMenus, db, loadPlaylistData, selectedVideo]);

  const handleRename = useCallback(async () => {
    if (!selectedVideo) {
      return;
    }

    const trimmedName = renameDraft.trim();
    if (!trimmedName) {
      setError('Назва відео не може бути порожньою.');
      return;
    }

    setSubmittingAction(true);
    setError(null);

    try {
      await renameVideo(db, selectedVideo.id, trimmedName);
      closeMenus();
      await loadPlaylistData();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Не вдалося перейменувати відео.');
    } finally {
      setSubmittingAction(false);
    }
  }, [closeMenus, db, loadPlaylistData, renameDraft, selectedVideo]);

  const handleDelete = useCallback(async () => {
    if (!selectedVideo) {
      return;
    }

    setSubmittingAction(true);
    setError(null);

    try {
      await deleteVideoById(db, selectedVideo.id);
      closeMenus();
      await loadPlaylistData();
    } catch {
      setError('Не вдалося видалити відео.');
    } finally {
      setSubmittingAction(false);
    }
  }, [closeMenus, db, loadPlaylistData, selectedVideo]);

  const handleMove = useCallback(
    async (targetPlaylistId: number) => {
      if (!selectedVideo) {
        return;
      }

      setSubmittingAction(true);
      setError(null);

      try {
        await moveVideoToPlaylist(db, selectedVideo.id, targetPlaylistId);
        closeMenus();
        await loadPlaylistData();
      } catch {
        setError('Не вдалося перемістити відео до іншого плейлиста.');
      } finally {
        setSubmittingAction(false);
      }
    },
    [closeMenus, db, loadPlaylistData, selectedVideo]
  );

  const renderItem = ({ item }: ListRenderItemInfo<VideoRow>) => (
    <EpisodeRow
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
      onOpenMenu={() => {
        openVideoMenu(item);
      }}
    />
  );

  return (
    <LiquidBackground>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            router.back();
          }}
          style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={LIQUID_COLORS.textPrimary} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Плейлист</Text>
          <View style={styles.playlistIdentityRow}>
            <View style={styles.playlistIconWrap}>
              <Ionicons
                name={resolvePlaylistIcon(playlist?.icon)}
                size={18}
                color={LIQUID_COLORS.textPrimary}
              />
            </View>
            {playlist?.is_pinned ? (
              <View style={styles.headerPinBadge}>
                <Ionicons name="pin" size={12} color={LIQUID_COLORS.textPrimary} />
              </View>
            ) : null}
          </View>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {playlist?.name ?? 'Невідомий плейлист'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {playlist ? `${videos.length} відео у цьому плейлисті` : 'Поверніться до бібліотеки та оберіть інший плейлист.'}
          </Text>
        </View>
      </View>

      {error ? (
        <GlassCard style={styles.messageCard}>
          <Text style={styles.errorText}>{error}</Text>
        </GlassCard>
      ) : null}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={LIQUID_COLORS.textPrimary} />
          <Text style={styles.stateTitle}>Завантажую відео</Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={8}
          removeClippedSubviews
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <GlassCard style={styles.messageCard}>
              <Text style={styles.emptyTitle}>Плейлист порожній</Text>
              <Text style={styles.emptyCopy}>Імпортуйте нові відео або перемістіть сюди існуючі епізоди.</Text>
            </GlassCard>
          }
        />
      )}

      <Modal
        animationType="fade"
        transparent
        visible={videoMenuMode === 'actions' && Boolean(selectedVideo)}
        onRequestClose={closeMenus}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>
              {selectedVideo ? displayFilename(selectedVideo.filename) : ''}
            </Text>

            <ActionSheetButton
              label={selectedVideo?.is_pinned ? 'Відкріпити' : 'Закріпити'}
              icon="pin-outline"
              onPress={() => {
                void handleTogglePin();
              }}
            />

            <ActionSheetButton
              label="Перейменувати"
              icon="create-outline"
              onPress={() => {
                setVideoMenuMode('rename');
              }}
            />

            <ActionSheetButton
              label="Перемістити до іншого плейлиста"
              icon="swap-horizontal-outline"
              onPress={() => {
                setVideoMenuMode('move');
              }}
            />

            <ActionSheetButton
              label="Видалити"
              icon="trash-outline"
              destructive
              onPress={() => {
                void handleDelete();
              }}
            />

            <Pressable onPress={closeMenus} style={styles.sheetCancelButton}>
              <Text style={styles.sheetCancelLabel}>Закрити</Text>
            </Pressable>

            {submittingAction ? (
              <View style={styles.sheetLoadingRow}>
                <ActivityIndicator size="small" color={LIQUID_COLORS.textPrimary} />
              </View>
            ) : null}
          </GlassCard>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={videoMenuMode === 'rename' && Boolean(selectedVideo)}
        onRequestClose={closeMenus}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Перейменувати відео</Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="Нова назва файлу"
              placeholderTextColor={LIQUID_COLORS.textMuted}
              style={styles.modalInput}
              autoFocus
            />

            <View style={styles.modalActions}>
              <Pressable onPress={closeMenus} style={styles.modalButton}>
                <Text style={styles.modalButtonLabel}>Скасувати</Text>
              </Pressable>

              <Pressable
                disabled={submittingAction}
                onPress={() => {
                  void handleRename();
                }}
                style={[styles.modalButton, styles.modalButtonPrimary]}>
                {submittingAction ? (
                  <ActivityIndicator size="small" color={LIQUID_COLORS.textPrimary} />
                ) : (
                  <Text style={styles.modalButtonLabel}>Зберегти</Text>
                )}
              </Pressable>
            </View>
          </GlassCard>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={videoMenuMode === 'move' && Boolean(selectedVideo)}
        onRequestClose={closeMenus}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Перемістити до плейлиста</Text>

            {availablePlaylists.length === 0 ? (
              <Text style={styles.modalCopy}>Немає інших плейлистів для переміщення.</Text>
            ) : (
              availablePlaylists.map((item) => (
                <Pressable
                  key={item.id}
                  disabled={submittingAction}
                  onPress={() => {
                    void handleMove(item.id);
                  }}
                  style={styles.playlistOption}>
                  <View style={styles.playlistOptionCopy}>
                    <Ionicons
                      name={resolvePlaylistIcon(item.icon)}
                      size={16}
                      color={LIQUID_COLORS.textPrimary}
                    />
                    <Text style={styles.playlistOptionLabel}>
                      {item.is_pinned ? '📌 ' : ''}
                      {item.name}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}

            <Pressable onPress={closeMenus} style={styles.modalCancelButton}>
              <Text style={styles.modalCancelLabel}>Закрити</Text>
            </Pressable>
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
    alignItems: 'flex-start',
    gap: 14,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LIQUID_COLORS.button,
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
  },
  headerCopy: {
    flex: 1,
  },
  playlistIdentityRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playlistIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
  },
  headerPinBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  eyebrow: {
    color: LIQUID_COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  headerTitle: {
    marginTop: 8,
    color: LIQUID_COLORS.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
  },
  headerSubtitle: {
    marginTop: 8,
    color: LIQUID_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  messageCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
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
    paddingBottom: 36,
  },
  separator: {
    height: 12,
  },
  episodeCard: {
    padding: 14,
    gap: 12,
  },
  pinBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  episodeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  episodeTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  episodeMeta: {
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
    backgroundColor: LIQUID_COLORS.accentGold,
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
    backgroundColor: 'rgba(2,6,23,0.66)',
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
  modalCopy: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  playlistOption: {
    minHeight: 48,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
  },
  playlistOptionCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playlistOptionLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  modalCancelButton: {
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LIQUID_COLORS.button,
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
  },
  modalCancelLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  sheetCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    gap: 10,
  },
  sheetTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  sheetButton: {
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
  },
  sheetButtonLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetButtonLabelDanger: {
    color: LIQUID_COLORS.danger,
  },
  sheetCancelButton: {
    marginTop: 4,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LIQUID_COLORS.button,
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
  },
  sheetCancelLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  sheetLoadingRow: {
    alignItems: 'center',
    paddingTop: 4,
  },
});
