import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File } from 'expo-file-system';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
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
  createCustomPlaylist,
  DEFAULT_PLAYLIST_ICON,
  deletePlaylistById,
  getPlaylistsWithCounts,
  importVideoFromSource,
  initializeDatabase,
  parseImportedFilename,
  renamePlaylist,
  setPlaylistPinned,
  updatePlaylistIcon,
  type PlaylistRow,
} from '@/src/db/database';
import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { LIQUID_COLORS } from '@/src/theme/liquid';

type PlaylistMenuMode = 'actions' | 'rename' | null;
type ImportCandidate = {
  name: string;
  uri: string;
};

const PLAYLIST_ICON_OPTIONS = [
  'folder-open-outline',
  'film-outline',
  'sparkles-outline',
  'flame-outline',
  'skull-outline',
  'heart-outline',
  'planet-outline',
  'rocket-outline',
  'game-controller-outline',
] as const;
const VIDEO_FILE_RE = /\.(?:mkv|mp4|m4v|mov|avi|webm)$/i;

function isVideoFilename(name: string) {
  return VIDEO_FILE_RE.test(name);
}

function collectDirectoryVideos(directory: Directory) {
  const results: ImportCandidate[] = [];

  for (const entry of directory.list()) {
    if (entry instanceof Directory) {
      results.push(...collectDirectoryVideos(entry));
      continue;
    }

    if (entry instanceof File && isVideoFilename(entry.name)) {
      results.push({
        name: entry.name,
        uri: entry.uri,
      });
    }
  }

  return results;
}

function resolvePlaylistIcon(icon?: string): keyof typeof Ionicons.glyphMap {
  if (icon && Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, icon)) {
    return icon as keyof typeof Ionicons.glyphMap;
  }

  return DEFAULT_PLAYLIST_ICON as keyof typeof Ionicons.glyphMap;
}

function formatVideoCount(count: number) {
  return `${count} відео`;
}

function PlaylistCard({
  item,
  onPress,
  onOpenMenu,
}: {
  item: PlaylistRow;
  onPress: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.playlistShell}>
      <GlassCard style={styles.playlistCard}>
        {item.is_pinned ? (
          <View style={styles.pinBadge}>
            <Ionicons name="pin" size={12} color={LIQUID_COLORS.textPrimary} />
          </View>
        ) : null}

        <View style={styles.playlistTopRow}>
          <View style={styles.playlistIconWrap}>
            <Ionicons
              name={resolvePlaylistIcon(item.icon)}
              size={24}
              color={LIQUID_COLORS.accentPurple}
            />
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

        <View style={styles.playlistCopy}>
          <Text style={styles.playlistTitle} numberOfLines={3}>
            {item.name}
          </Text>
          <Text style={styles.playlistMeta}>{formatVideoCount(item.videoCount)}</Text>
        </View>
      </GlassCard>
    </Pressable>
  );
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

export default function LibraryTabScreen() {
  const db = useSQLiteContext();
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [customPlaylistName, setCustomPlaylistName] = useState('');
  const [customPlaylistIcon, setCustomPlaylistIcon] = useState<string>(DEFAULT_PLAYLIST_ICON);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistRow | null>(null);
  const [playlistMenuMode, setPlaylistMenuMode] = useState<PlaylistMenuMode>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameIconDraft, setRenameIconDraft] = useState<string>(DEFAULT_PLAYLIST_ICON);
  const [pickedAssets, setPickedAssets] = useState<ImportCandidate[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [selectedImportPlaylistId, setSelectedImportPlaylistId] = useState<number | null>(null);
  const [newImportPlaylistName, setNewImportPlaylistName] = useState('');
  const [newImportPlaylistIcon, setNewImportPlaylistIcon] = useState<string>(DEFAULT_PLAYLIST_ICON);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlaylists = useCallback(async () => {
    setError(null);
    setLoading(true);
    setRefreshing(true);

    try {
      await initializeDatabase(db);
      setPlaylists(await getPlaylistsWithCounts(db));
    } catch {
      setError('Не вдалося завантажити плейлисти з бази даних.');
      setPlaylists([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadPlaylists();
    }, [loadPlaylists])
  );

  const closePlaylistModals = useCallback(() => {
    setSelectedPlaylist(null);
    setPlaylistMenuMode(null);
    setRenameDraft('');
    setRenameIconDraft(DEFAULT_PLAYLIST_ICON);
  }, []);

  const openPlaylistMenu = useCallback((playlist: PlaylistRow) => {
    setSelectedPlaylist(playlist);
    setPlaylistMenuMode('actions');
    setRenameDraft(playlist.name);
    setRenameIconDraft(playlist.icon || DEFAULT_PLAYLIST_ICON);
  }, []);

  const closeImportModal = useCallback(() => {
    setImportModalVisible(false);
    setPickedAssets([]);
    setSelectedImportPlaylistId(null);
    setNewImportPlaylistName('');
    setNewImportPlaylistIcon(DEFAULT_PLAYLIST_ICON);
  }, []);

  const importFiles = useCallback(async () => {
    setError(null);

    try {
      await initializeDatabase(db);

      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const assets = result.assets.map((asset) => ({
        name: asset.name || `video-${Date.now()}.mp4`,
        uri: asset.uri,
      }));
      const parsedFiles = assets.map((asset) => parseImportedFilename(asset.name || ''));
      const firstSuggestedTitle = parsedFiles[0]?.seriesTitle ?? '';
      const allSameSeries = parsedFiles.every(
        (parsed) =>
          parsed.seriesTitle.trim().toLowerCase() === firstSuggestedTitle.trim().toLowerCase()
      );
      const matchedPlaylist =
        allSameSeries && firstSuggestedTitle
          ? playlists.find(
              (playlist) =>
                playlist.name.trim().toLowerCase() === firstSuggestedTitle.trim().toLowerCase()
            )
          : null;

      setPickedAssets(assets);
      setSelectedImportPlaylistId(matchedPlaylist?.id ?? null);
      setNewImportPlaylistName(allSameSeries ? firstSuggestedTitle : '');
      setNewImportPlaylistIcon(matchedPlaylist?.icon || DEFAULT_PLAYLIST_ICON);
      setImportModalVisible(true);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Не вдалося імпортувати файл.');
    }
  }, [db, playlists]);

  const importFolder = useCallback(async () => {
    setError(null);

    try {
      await initializeDatabase(db);

      const directory = (await Directory.pickDirectoryAsync()) as unknown as Directory;
      const assets = collectDirectoryVideos(directory);

      if (!assets.length) {
        setError('У вибраній теці не знайдено жодного відеофайлу.');
        return;
      }

      const parsedFiles = assets.map((asset) => parseImportedFilename(asset.name || ''));
      const firstSuggestedTitle = parsedFiles[0]?.seriesTitle ?? '';
      const allSameSeries = parsedFiles.every(
        (parsed) =>
          parsed.seriesTitle.trim().toLowerCase() === firstSuggestedTitle.trim().toLowerCase()
      );
      const matchedPlaylist =
        allSameSeries && firstSuggestedTitle
          ? playlists.find(
              (playlist) =>
                playlist.name.trim().toLowerCase() === firstSuggestedTitle.trim().toLowerCase()
            )
          : null;

      setPickedAssets(assets);
      setSelectedImportPlaylistId(matchedPlaylist?.id ?? null);
      setNewImportPlaylistName(allSameSeries ? firstSuggestedTitle : directory.name || '');
      setNewImportPlaylistIcon(matchedPlaylist?.icon || DEFAULT_PLAYLIST_ICON);
      setImportModalVisible(true);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Не вдалося відкрити теку.');
    }
  }, [db, playlists]);

  const handleConfirmImport = useCallback(async () => {
    if (!pickedAssets.length) {
      return;
    }

    setError(null);
    setImporting(true);

    try {
      await initializeDatabase(db);
      for (const asset of pickedAssets) {
        const parsed = parseImportedFilename(asset.name || '');

        await importVideoFromSource(db, asset, {
          playlistId: selectedImportPlaylistId,
          playlistName: selectedImportPlaylistId
            ? null
            : newImportPlaylistName.trim() || parsed.seriesTitle,
          playlistIcon: selectedImportPlaylistId ? null : newImportPlaylistIcon,
        });
      }

      closeImportModal();
      await loadPlaylists();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Не вдалося додати відео до плейлиста.');
    } finally {
      setImporting(false);
    }
  }, [
    closeImportModal,
    db,
    loadPlaylists,
    newImportPlaylistIcon,
    newImportPlaylistName,
    pickedAssets,
    selectedImportPlaylistId,
  ]);

  const handleCreatePlaylist = useCallback(async () => {
    const trimmedName = customPlaylistName.trim();
    if (!trimmedName) {
      setError('Введіть назву нового плейлиста.');
      return;
    }

    setCreatingPlaylist(true);
    setError(null);

    try {
      await createCustomPlaylist(db, trimmedName, customPlaylistIcon);
      setCreateModalVisible(false);
      setCustomPlaylistName('');
      setCustomPlaylistIcon(DEFAULT_PLAYLIST_ICON);
      await loadPlaylists();
    } catch (createError) {
      const message =
        createError instanceof Error && createError.message.includes('UNIQUE')
          ? 'Плейлист із такою назвою вже існує.'
          : createError instanceof Error
            ? createError.message
            : 'Не вдалося створити плейлист.';
      setError(message);
    } finally {
      setCreatingPlaylist(false);
    }
  }, [customPlaylistIcon, customPlaylistName, db, loadPlaylists]);

  const handleTogglePin = useCallback(async () => {
    if (!selectedPlaylist) {
      return;
    }

    setSubmittingAction(true);
    setError(null);

    try {
      await setPlaylistPinned(db, selectedPlaylist.id, selectedPlaylist.is_pinned === 0);
      closePlaylistModals();
      await loadPlaylists();
    } catch {
      setError('Не вдалося змінити статус закріплення плейлиста.');
    } finally {
      setSubmittingAction(false);
    }
  }, [closePlaylistModals, db, loadPlaylists, selectedPlaylist]);

  const handleRename = useCallback(async () => {
    if (!selectedPlaylist) {
      return;
    }

    const trimmedName = renameDraft.trim();
    if (!trimmedName) {
      setError('Назва плейлиста не може бути порожньою.');
      return;
    }

    setSubmittingAction(true);
    setError(null);

    try {
      await renamePlaylist(db, selectedPlaylist.id, trimmedName);
      await updatePlaylistIcon(db, selectedPlaylist.id, renameIconDraft);
      closePlaylistModals();
      await loadPlaylists();
    } catch (renameError) {
      const message =
        renameError instanceof Error && renameError.message.includes('UNIQUE')
          ? 'Плейлист із такою назвою вже існує.'
          : renameError instanceof Error
            ? renameError.message
            : 'Не вдалося перейменувати плейлист.';
      setError(message);
    } finally {
      setSubmittingAction(false);
    }
  }, [closePlaylistModals, db, loadPlaylists, renameDraft, renameIconDraft, selectedPlaylist]);

  const handleDelete = useCallback(async () => {
    if (!selectedPlaylist) {
      return;
    }

    setSubmittingAction(true);
    setError(null);

    try {
      await deletePlaylistById(db, selectedPlaylist.id);
      closePlaylistModals();
      await loadPlaylists();
    } catch {
      setError('Не вдалося видалити плейлист і його файли.');
    } finally {
      setSubmittingAction(false);
    }
  }, [closePlaylistModals, db, loadPlaylists, selectedPlaylist]);

  const renderPlaylist = ({ item }: ListRenderItemInfo<PlaylistRow>) => (
    <PlaylistCard
      item={item}
      onPress={() => {
        router.push({
          pathname: '/folder/[folderKey]',
          params: {
            folderKey: String(item.id),
          },
        });
      }}
      onOpenMenu={() => {
        openPlaylistMenu(item);
      }}
    />
  );

  return (
    <LiquidBackground>
      <View style={styles.header}>
        <View>
          <Image source={require('../../assets/images/icon.png')} style={styles.appIcon} contentFit="cover" />
          <Text style={styles.eyebrow}>Авто-сортування</Text>
          <Text style={styles.title}>Бібліотека</Text>
          <Text style={styles.subtitle}>
            Можна вибрати одразу кілька файлів, а серії будуть автоматично підказані з назв епізодів.
          </Text>
        </View>

        <Pressable
          onPress={() => {
            void loadPlaylists();
          }}
          style={styles.headerButton}>
          {refreshing ? (
            <ActivityIndicator size="small" color={LIQUID_COLORS.textPrimary} />
          ) : (
            <Ionicons name="refresh" size={18} color={LIQUID_COLORS.textPrimary} />
          )}
        </Pressable>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          disabled={importing}
          onPress={() => {
            void importFiles();
          }}
          style={[styles.primaryAction, importing && styles.actionDisabled]}>
          {importing ? (
            <ActivityIndicator size="small" color={LIQUID_COLORS.textPrimary} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color={LIQUID_COLORS.textPrimary} />
              <Text style={styles.primaryActionLabel}>Імпортувати файли</Text>
            </>
          )}
        </Pressable>

        <Pressable
          disabled={importing}
          onPress={() => {
            void importFolder();
          }}
          style={[styles.secondaryAction, importing && styles.actionDisabled]}>
          <Ionicons name="folder-open-outline" size={18} color={LIQUID_COLORS.textPrimary} />
          <Text style={styles.secondaryActionLabel}>Імпортувати теку</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setCreateModalVisible(true);
          }}
          style={styles.secondaryAction}>
          <Ionicons name="add-circle-outline" size={18} color={LIQUID_COLORS.textPrimary} />
          <Text style={styles.secondaryActionLabel}>Створити власний плейлист</Text>
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
          <Text style={styles.stateTitle}>Завантажую плейлисти</Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          renderItem={renderPlaylist}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.playlistRow}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={8}
          removeClippedSubviews
          ListEmptyComponent={
            <GlassCard style={styles.messageCard}>
              <Text style={styles.emptyTitle}>Плейлистів ще немає</Text>
              <Text style={styles.emptyCopy}>
                Імпортуйте відео або створіть власний плейлист вручну.
              </Text>
            </GlassCard>
          }
        />
      )}

      <Modal
        animationType="fade"
        transparent
        visible={createModalVisible}
        onRequestClose={() => {
          setCreateModalVisible(false);
        }}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Новий плейлист</Text>
            <TextInput
              value={customPlaylistName}
              onChangeText={setCustomPlaylistName}
              placeholder="Назва плейлиста"
              placeholderTextColor={LIQUID_COLORS.textMuted}
              style={styles.modalInput}
              autoFocus
            />

            <View style={styles.iconPickerWrap}>
              <Text style={styles.iconPickerLabel}>Іконка серії</Text>
              <View style={styles.iconGrid}>
                {PLAYLIST_ICON_OPTIONS.map((icon) => (
                  <Pressable
                    key={icon}
                    onPress={() => {
                      setCustomPlaylistIcon(icon);
                    }}
                    style={[
                      styles.iconOption,
                      customPlaylistIcon === icon && styles.iconOptionActive,
                    ]}>
                    <Ionicons
                      name={icon}
                      size={18}
                      color={LIQUID_COLORS.textPrimary}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setCreateModalVisible(false);
                  setCustomPlaylistName('');
                  setCustomPlaylistIcon(DEFAULT_PLAYLIST_ICON);
                }}
                style={styles.modalButton}>
                <Text style={styles.modalButtonLabel}>Скасувати</Text>
              </Pressable>

              <Pressable
                disabled={creatingPlaylist}
                onPress={() => {
                  void handleCreatePlaylist();
                }}
                style={[styles.modalButton, styles.modalButtonPrimary]}>
                {creatingPlaylist ? (
                  <ActivityIndicator size="small" color={LIQUID_COLORS.textPrimary} />
                ) : (
                  <Text style={styles.modalButtonLabel}>Створити</Text>
                )}
              </Pressable>
            </View>
          </GlassCard>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={playlistMenuMode === 'actions' && Boolean(selectedPlaylist)}
        onRequestClose={closePlaylistModals}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>{selectedPlaylist?.name}</Text>

            <ActionSheetButton
              label={selectedPlaylist?.is_pinned ? 'Відкріпити' : 'Закріпити'}
              icon="pin-outline"
              onPress={() => {
                void handleTogglePin();
              }}
            />

            <ActionSheetButton
              label="Перейменувати"
              icon="create-outline"
              onPress={() => {
                setPlaylistMenuMode('rename');
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

            <Pressable onPress={closePlaylistModals} style={styles.sheetCancelButton}>
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
        visible={playlistMenuMode === 'rename' && Boolean(selectedPlaylist)}
        onRequestClose={closePlaylistModals}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Перейменувати плейлист</Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="Нова назва"
              placeholderTextColor={LIQUID_COLORS.textMuted}
              style={styles.modalInput}
              autoFocus
            />

            <View style={styles.iconPickerWrap}>
              <Text style={styles.iconPickerLabel}>Іконка серії</Text>
              <View style={styles.iconGrid}>
                {PLAYLIST_ICON_OPTIONS.map((icon) => (
                  <Pressable
                    key={icon}
                    onPress={() => {
                      setRenameIconDraft(icon);
                    }}
                    style={[
                      styles.iconOption,
                      renameIconDraft === icon && styles.iconOptionActive,
                    ]}>
                    <Ionicons
                      name={icon}
                      size={18}
                      color={LIQUID_COLORS.textPrimary}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={closePlaylistModals} style={styles.modalButton}>
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
        visible={importModalVisible && pickedAssets.length > 0}
        onRequestClose={closeImportModal}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
          <Text style={styles.modalTitle}>Куди додати відео</Text>
          <Text style={styles.modalCopy} numberOfLines={2}>
            {pickedAssets.length === 1
              ? pickedAssets[0]?.name ?? 'Обраний файл'
              : `Обрано файлів: ${pickedAssets.length}`}
          </Text>

            <Text style={styles.sectionLabel}>Існуючі плейлисти</Text>
            {playlists.length === 0 ? (
              <Text style={styles.modalCopy}>Поки що немає жодного плейлиста. Створимо новий нижче.</Text>
            ) : (
              <View style={styles.optionList}>
                {playlists.map((playlist) => (
                  <Pressable
                    key={playlist.id}
                    onPress={() => {
                      setSelectedImportPlaylistId(playlist.id);
                    }}
                    style={[
                      styles.playlistChoice,
                      selectedImportPlaylistId === playlist.id && styles.playlistChoiceActive,
                    ]}>
                    <View style={styles.playlistChoiceCopy}>
                      <Ionicons
                        name={resolvePlaylistIcon(playlist.icon)}
                        size={18}
                        color={LIQUID_COLORS.textPrimary}
                      />
                      <Text style={styles.playlistChoiceLabel}>{playlist.name}</Text>
                    </View>
                    {selectedImportPlaylistId === playlist.id ? (
                      <Ionicons name="checkmark-circle" size={18} color={LIQUID_COLORS.accentBlue} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.sectionLabel}>Або створити новий</Text>
            <TextInput
              value={newImportPlaylistName}
              onChangeText={(value) => {
                setSelectedImportPlaylistId(null);
                setNewImportPlaylistName(value);
              }}
              placeholder="Назва нового плейлиста"
              placeholderTextColor={LIQUID_COLORS.textMuted}
              style={styles.modalInput}
            />

            <View style={styles.iconPickerWrap}>
              <Text style={styles.iconPickerLabel}>Іконка серії</Text>
              <View style={styles.iconGrid}>
                {PLAYLIST_ICON_OPTIONS.map((icon) => (
                  <Pressable
                    key={icon}
                    onPress={() => {
                      setSelectedImportPlaylistId(null);
                      setNewImportPlaylistIcon(icon);
                    }}
                    style={[
                      styles.iconOption,
                      newImportPlaylistIcon === icon &&
                        selectedImportPlaylistId === null &&
                        styles.iconOptionActive,
                    ]}>
                    <Ionicons
                      name={icon}
                      size={18}
                      color={LIQUID_COLORS.textPrimary}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={closeImportModal} style={styles.modalButton}>
                <Text style={styles.modalButtonLabel}>Скасувати</Text>
              </Pressable>

              <Pressable
                disabled={importing || (!selectedImportPlaylistId && !newImportPlaylistName.trim())}
                onPress={() => {
                  void handleConfirmImport();
                }}
                style={[styles.modalButton, styles.modalButtonPrimary]}>
                {importing ? (
                  <ActivityIndicator size="small" color={LIQUID_COLORS.textPrimary} />
                ) : (
                  <Text style={styles.modalButtonLabel}>Додати</Text>
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
  actionsRow: {
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  primaryAction: {
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
  primaryActionLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryAction: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  secondaryActionLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  actionDisabled: {
    opacity: 0.72,
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
  playlistRow: {
    gap: 14,
    marginBottom: 14,
  },
  playlistShell: {
    flex: 1,
  },
  playlistCard: {
    minHeight: 188,
    padding: 16,
    justifyContent: 'space-between',
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
  playlistTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playlistIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
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
  playlistCopy: {
    gap: 8,
  },
  playlistTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  playlistMeta: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
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
  modalCopy: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
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
  sectionLabel: {
    color: LIQUID_COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  optionList: {
    gap: 10,
  },
  playlistChoice: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  playlistChoiceActive: {
    borderColor: LIQUID_COLORS.accentBlue,
    backgroundColor: 'rgba(103,232,249,0.08)',
  },
  playlistChoiceCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  playlistChoiceLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  iconPickerWrap: {
    gap: 10,
  },
  iconPickerLabel: {
    color: LIQUID_COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconOption: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptionActive: {
    borderColor: LIQUID_COLORS.accentBlue,
    backgroundColor: 'rgba(103,232,249,0.12)',
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
