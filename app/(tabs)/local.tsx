import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File } from 'expo-file-system';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
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
import { useDatabaseContext } from '@/src/db/db-context';
import { useApp } from '@/src/providers/app-provider';
import { downloadYouTubeVideo } from '@/src/services/youtube-downloader';

type PlaylistMenuMode = 'actions' | 'rename' | null;
type ImportCandidate = {
  name: string;
  uri: string;
  file?: Blob | null;
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
const PRIMARY_TEXT = '#FFFFFF';
const SECONDARY_TEXT = '#A0A0A0';
const GLASS_BG = 'rgba(11, 16, 30, 0.42)';
const GLASS_BORDER = 'rgba(255, 255, 255, 0.15)';
const GLASS_SOFT = 'rgba(255,255,255,0.08)';

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

function PremiumActionCard({
  icon,
  title,
  subtitle,
  onPress,
  accent,
  large,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  accent: string;
  large?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.actionPressable, large && styles.actionPressableLarge]}>
      <BlurView intensity={72} tint="dark" style={[styles.actionCard, large && styles.actionCardLarge]}>
        <LinearGradient
          colors={[`${accent}28`, 'rgba(255,255,255,0.01)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.actionIconWrap, { backgroundColor: `${accent}26` }]}>
          <Ionicons name={icon} size={20} color={accent} />
        </View>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </BlurView>
    </Pressable>
  );
}

function PlaylistCard({
  item,
  index,
  onPress,
  onOpenMenu,
}: {
  item: PlaylistRow;
  index: number;
  onPress: () => void;
  onOpenMenu: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 100).springify()}
      layout={LinearTransition.springify().damping(18).stiffness(180)}
      style={styles.playlistShell}>
      <Pressable onPress={onPress}>
        <BlurView intensity={72} tint="dark" style={styles.playlistCard}>
          <View style={styles.playlistArtwork}>
            {item.thumbnailUri ? (
              <Image source={{ uri: item.thumbnailUri }} style={styles.playlistThumbnail} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={['rgba(56, 189, 248, 0.22)', 'rgba(124, 58, 237, 0.22)', 'rgba(2, 6, 23, 0.2)']}
                style={styles.playlistThumbnail}>
                <Ionicons name={resolvePlaylistIcon(item.icon)} size={28} color={PRIMARY_TEXT} />
              </LinearGradient>
            )}

            <LinearGradient
              colors={['transparent', 'rgba(3, 6, 18, 0.84)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.playlistPosterShade}
            />

            <View style={styles.playlistChipsRow}>
              {item.is_pinned ? (
                <View style={styles.statusChip}>
                  <Ionicons name="pin" size={11} color={PRIMARY_TEXT} />
                  <Text style={styles.statusChipLabel}>{t('common.pinned')}</Text>
                </View>
              ) : (
                <View style={styles.statusChip}>
                  <Ionicons name="folder-open-outline" size={11} color={PRIMARY_TEXT} />
                  <Text style={styles.statusChipLabel}>{t('common.playlist')}</Text>
                </View>
              )}

              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onOpenMenu();
                }}
                hitSlop={8}
                style={styles.menuBubble}>
                <Ionicons name="ellipsis-horizontal" size={17} color={PRIMARY_TEXT} />
              </Pressable>
            </View>

            <View style={styles.playlistBody}>
              <View style={styles.posterMetaRow}>
                <View style={styles.countPill}>
                  <Ionicons name="play-outline" size={12} color={PRIMARY_TEXT} />
                  <Text style={styles.countPillLabel}>{t('local.videosCount', { count: item.videoCount })}</Text>
                </View>
              </View>

              <Text style={styles.playlistTitle} numberOfLines={2}>
                {item.name}
              </Text>

              <Text style={styles.playlistMeta} numberOfLines={1}>
                {item.videoCount > 0 ? t('local.choosePlaylistSubtitle') : t('local.emptyCopy')}
              </Text>
            </View>
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
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
      <Ionicons name={icon} size={18} color={destructive ? '#FF8FA3' : PRIMARY_TEXT} />
      <Text style={[styles.sheetButtonLabel, destructive && styles.sheetButtonLabelDanger]}>{label}</Text>
    </Pressable>
  );
}

function IconPicker({
  selectedIcon,
  onSelect,
}: {
  selectedIcon: string;
  onSelect: (icon: string) => void;
}) {
  const { theme } = useApp();

  return (
    <View style={styles.iconGrid}>
      {PLAYLIST_ICON_OPTIONS.map((icon) => {
        const active = selectedIcon === icon;

        return (
          <Pressable
            key={icon}
            onPress={() => {
              onSelect(icon);
            }}
            style={[
              styles.iconOption,
              active && {
                borderColor: theme.accentPrimary,
                backgroundColor: `${theme.accentPrimary}1F`,
              },
            ]}>
            <Ionicons name={icon} size={18} color={active ? theme.accentPrimary : PRIMARY_TEXT} />
          </Pressable>
        );
      })}
    </View>
  );
}

export default function LocalTabScreen() {
  const db = useDatabaseContext();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { theme } = useApp();
  const { width } = useWindowDimensions();
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [youtubeModalVisible, setYouTubeModalVisible] = useState(false);
  const [youtubeUrl, setYouTubeUrl] = useState('');
  const [youtubeDownloading, setYouTubeDownloading] = useState(false);
  const [youtubeProgress, setYouTubeProgress] = useState(0);

  const sortedPlaylistOptions = useMemo(
    () => playlists.map((playlist) => ({ id: playlist.id, name: playlist.name, icon: playlist.icon })),
    [playlists]
  );
  const playlistColumnCount = width >= 1500 ? 4 : width >= 1100 ? 3 : 2;
  const contentMaxWidth = width >= 1700 ? 1560 : width >= 1300 ? 1320 : 1080;
  const actionWide = width >= 1180;

  const loadPlaylists = useCallback(async () => {
    setError(null);
    setLoading(true);
    setRefreshing(true);

    try {
      await initializeDatabase(db);
      setPlaylists(await getPlaylistsWithCounts(db));
    } catch {
      setError(t('local.refreshError'));
      setPlaylists([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, t]);

  useFocusEffect(
    useCallback(() => {
      void loadPlaylists();
    }, [loadPlaylists])
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

  const closePlaylistModals = useCallback(() => {
    setSelectedPlaylist(null);
    setPlaylistMenuMode(null);
    setRenameDraft('');
    setRenameIconDraft(DEFAULT_PLAYLIST_ICON);
  }, []);

  const closeImportModal = useCallback(() => {
    setImportModalVisible(false);
    setPickedAssets([]);
    setSelectedImportPlaylistId(null);
    setNewImportPlaylistName('');
    setNewImportPlaylistIcon(DEFAULT_PLAYLIST_ICON);
  }, []);

  const closeYouTubeModal = useCallback(() => {
    if (youtubeDownloading) {
      return;
    }

    setYouTubeModalVisible(false);
    setYouTubeUrl('');
    setYouTubeProgress(0);
  }, [youtubeDownloading]);

  const prepareImportSelection = useCallback(
    (assets: ImportCandidate[], fallbackName?: string) => {
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
      setNewImportPlaylistName(allSameSeries ? firstSuggestedTitle : fallbackName ?? '');
      setNewImportPlaylistIcon(matchedPlaylist?.icon || DEFAULT_PLAYLIST_ICON);
      setImportModalVisible(true);
    },
    [playlists]
  );

  const importFiles = useCallback(async () => {
    setError(null);
    setMessage(null);

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

      prepareImportSelection(
        result.assets.map((asset) => ({
          name: asset.name || `video-${Date.now()}.mp4`,
          uri: asset.uri,
          file:
            'file' in asset && asset.file instanceof Blob
              ? asset.file
              : null,
        }))
      );
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : t('local.importError'));
    }
  }, [db, prepareImportSelection, t]);

  const importFolder = useCallback(async () => {
    setError(null);
    setMessage(null);

    try {
      await initializeDatabase(db);
      const directory = (await Directory.pickDirectoryAsync()) as unknown as Directory;
      const assets = collectDirectoryVideos(directory);

      if (!assets.length) {
        setError(t('local.folderError'));
        return;
      }

      prepareImportSelection(assets, directory.name || '');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : t('local.folderError'));
    }
  }, [db, prepareImportSelection, t]);

  const handleConfirmImport = useCallback(async () => {
    if (!pickedAssets.length) {
      return;
    }

    setError(null);
    setMessage(null);
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
      setError(importError instanceof Error ? importError.message : t('local.importError'));
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
    t,
  ]);

  const handleCreatePlaylist = useCallback(async () => {
    const trimmedName = customPlaylistName.trim();
    if (!trimmedName) {
      setError(t('local.createError'));
      return;
    }

    setCreatingPlaylist(true);
    setError(null);
    setMessage(null);

    try {
      await createCustomPlaylist(db, trimmedName, customPlaylistIcon);
      setCreateModalVisible(false);
      setCustomPlaylistName('');
      setCustomPlaylistIcon(DEFAULT_PLAYLIST_ICON);
      await loadPlaylists();
    } catch (createError) {
      const messageText =
        createError instanceof Error && createError.message.includes('UNIQUE')
          ? t('local.uniquePlaylist')
          : createError instanceof Error
            ? createError.message
            : t('local.createError');
      setError(messageText);
    } finally {
      setCreatingPlaylist(false);
    }
  }, [customPlaylistIcon, customPlaylistName, db, loadPlaylists, t]);

  const handleYouTubeDownload = useCallback(async () => {
    setError(null);
    setMessage(null);

    if (!youtubeUrl.trim()) {
      setError(t('local.youtubeEmptyUrl'));
      return;
    }

    setYouTubeDownloading(true);
    setYouTubeProgress(0);

    try {
      await downloadYouTubeVideo(db, youtubeUrl, {
        playlistName: t('local.youtubeActionTitle'),
        playlistIcon: 'logo-youtube',
        onProgress: setYouTubeProgress,
      });

      setMessage(t('local.youtubeSuccess'));
      setYouTubeModalVisible(false);
      setYouTubeUrl('');
      setYouTubeProgress(0);
      await loadPlaylists();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : t('local.youtubeError'));
    } finally {
      setYouTubeDownloading(false);
    }
  }, [db, loadPlaylists, t, youtubeUrl]);

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
      setError(t('local.refreshError'));
    } finally {
      setSubmittingAction(false);
    }
  }, [closePlaylistModals, db, loadPlaylists, selectedPlaylist, t]);

  const handleRename = useCallback(async () => {
    if (!selectedPlaylist) {
      return;
    }

    setSubmittingAction(true);
    setError(null);

    try {
      await renamePlaylist(db, selectedPlaylist.id, renameDraft);
      await updatePlaylistIcon(db, selectedPlaylist.id, renameIconDraft);
      closePlaylistModals();
      await loadPlaylists();
    } catch (renameError) {
      const messageText =
        renameError instanceof Error && renameError.message.includes('UNIQUE')
          ? t('local.uniquePlaylist')
          : renameError instanceof Error
            ? renameError.message
            : t('common.rename');
      setError(messageText);
    } finally {
      setSubmittingAction(false);
    }
  }, [closePlaylistModals, db, loadPlaylists, renameDraft, renameIconDraft, selectedPlaylist, t]);

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
      setError(t('common.delete'));
    } finally {
      setSubmittingAction(false);
    }
  }, [closePlaylistModals, db, loadPlaylists, selectedPlaylist, t]);

  const renderPlaylist = ({ item, index }: ListRenderItemInfo<PlaylistRow>) => (
    <PlaylistCard
      item={item}
      index={index}
      onPress={() => {
        router.push({
          pathname: '/folder/[folderKey]',
          params: {
            folderKey: String(item.id),
          },
        });
      }}
      onOpenMenu={() => {
        setSelectedPlaylist(item);
        setPlaylistMenuMode('actions');
        setRenameDraft(item.name);
        setRenameIconDraft(item.icon || DEFAULT_PLAYLIST_ICON);
      }}
    />
  );

  return (
    <LiquidBackground>
      <View style={styles.screen}>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={PRIMARY_TEXT} />
            <Text style={styles.stateTitle}>{t('local.loading')}</Text>
          </View>
        ) : (
          <FlatList
            data={playlists}
            renderItem={renderPlaylist}
            keyExtractor={(item) => String(item.id)}
            numColumns={playlistColumnCount}
            columnWrapperStyle={playlistColumnCount > 1 ? styles.playlistRow : undefined}
            contentContainerStyle={[
              styles.listContent,
              { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
              playlists.length === 0 && styles.listContentEmpty,
            ]}
            showsVerticalScrollIndicator={false}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={8}
            removeClippedSubviews
            ListHeaderComponent={
              <>
                <Animated.View entering={FadeInDown.duration(450)} style={styles.headerWrap}>
                  <View style={styles.headerTopRow}>
                    <View style={styles.headerCopy}>
                      <Image source={require('../../assets/images/icon.png')} style={styles.appIcon} contentFit="cover" />
                      <Text style={styles.eyebrow}>{t('local.eyebrow')}</Text>
                      <Text style={styles.title}>{t('local.title')}</Text>
                      <Text style={styles.subtitle}>{t('local.subtitle')}</Text>
                    </View>

                    <Pressable
                      onPress={() => {
                        void loadPlaylists();
                      }}
                      style={styles.refreshButton}>
                      {refreshing ? (
                        <ActivityIndicator size="small" color={PRIMARY_TEXT} />
                      ) : (
                        <Ionicons name="refresh" size={18} color={PRIMARY_TEXT} />
                      )}
                    </Pressable>
                  </View>

                  <BlurView intensity={72} tint="dark" style={styles.heroPanel}>
                    <LinearGradient
                      colors={['rgba(56, 189, 248, 0.18)', 'rgba(124, 58, 237, 0.12)', 'rgba(2, 6, 23, 0.02)']}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.heroPanelRow}>
                      <View style={styles.heroBadge}>
                        <Ionicons name="sparkles-outline" size={16} color={theme.accentSecondary} />
                        <Text style={styles.heroBadgeLabel}>{t('app.name')}</Text>
                      </View>
                      <View style={styles.heroCountBadge}>
                        <Text style={styles.heroCountText}>{playlists.length}</Text>
                        <Text style={styles.heroCountLabel}>{t('common.playlist')}</Text>
                      </View>
                    </View>
                    <Text style={styles.heroTitle}>{t('app.tagline')}</Text>
                    <Text style={styles.heroSubtitle}>{t('local.subtitle')}</Text>
                  </BlurView>
                </Animated.View>

                <Animated.View
                  entering={FadeInDown.delay(90).duration(420)}
                  style={[styles.actionsGrid, actionWide && styles.actionsGridWide]}>
                  <PremiumActionCard
                    icon="cloud-upload-outline"
                    title={t('local.importFiles')}
                    subtitle={t('local.importModalTitle')}
                    onPress={() => {
                      void importFiles();
                    }}
                    accent={theme.accentSecondary}
                  />
                  <PremiumActionCard
                    icon="folder-open-outline"
                    title={t('local.importFolder')}
                    subtitle={t('local.choosePlaylist')}
                    onPress={() => {
                      void importFolder();
                    }}
                    accent={theme.accentPrimary}
                  />
                  <PremiumActionCard
                    icon="add-circle-outline"
                    title={t('local.createPlaylist')}
                    subtitle={t('local.createTitle')}
                    onPress={() => {
                      setCreateModalVisible(true);
                    }}
                    accent={theme.accentTertiary}
                    large
                  />
                  <PremiumActionCard
                    icon="logo-youtube"
                    title={t('local.youtubeActionTitle')}
                    subtitle={t('local.youtubeActionSubtitle')}
                    onPress={() => {
                      setYouTubeModalVisible(true);
                    }}
                    accent="#FF3040"
                    large
                  />
                </Animated.View>

                {error ? (
                  <BlurView intensity={72} tint="dark" style={styles.noticeCard}>
                    <Text style={styles.noticeError}>{error}</Text>
                  </BlurView>
                ) : null}

                {message ? (
                  <BlurView intensity={72} tint="dark" style={styles.noticeCard}>
                    <Text style={styles.noticeSuccess}>{message}</Text>
                  </BlurView>
                ) : null}

                <Text style={styles.sectionTitle}>{t('common.playlist')}</Text>
              </>
            }
            ListEmptyComponent={
              <View style={styles.emptyStateWrap}>
                <BlurView intensity={72} tint="dark" style={styles.emptyCard}>
                  <Ionicons name="add-circle-outline" size={30} color={PRIMARY_TEXT} />
                  <Text style={styles.emptyTitle}>{t('local.emptyTitle')}</Text>
                  <Text style={styles.emptyCopy}>{t('local.emptyImportPrompt')}</Text>
                </BlurView>
              </View>
            }
          />
        )}
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={createModalVisible}
        onRequestClose={() => {
          setCreateModalVisible(false);
        }}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('local.createTitle')}</Text>
            <TextInput
              value={customPlaylistName}
              onChangeText={setCustomPlaylistName}
              placeholder={t('local.createPlaceholder')}
              placeholderTextColor={SECONDARY_TEXT}
              style={styles.modalInput}
              autoFocus
            />

            <Text style={styles.sectionLabel}>{t('local.iconTitle')}</Text>
            <IconPicker selectedIcon={customPlaylistIcon} onSelect={setCustomPlaylistIcon} />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setCreateModalVisible(false);
                  setCustomPlaylistName('');
                  setCustomPlaylistIcon(DEFAULT_PLAYLIST_ICON);
                }}
                style={styles.modalButton}>
                <Text style={styles.modalButtonLabel}>{t('common.cancel')}</Text>
              </Pressable>

              <Pressable
                disabled={creatingPlaylist}
                onPress={() => {
                  void handleCreatePlaylist();
                }}
                style={[styles.modalButton, styles.modalButtonPrimary]}>
                {creatingPlaylist ? (
                  <ActivityIndicator size="small" color={PRIMARY_TEXT} />
                ) : (
                  <Text style={styles.modalButtonLabel}>{t('common.create')}</Text>
                )}
              </Pressable>
            </View>
          </GlassCard>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={importModalVisible}
        onRequestClose={closeImportModal}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('local.importModalTitle')}</Text>
            <Text style={styles.modalCopy}>{t('local.importSummary', { count: pickedAssets.length })}</Text>
            <Text style={[styles.modalCopy, styles.modalMuted]}>{t('local.choosePlaylistSubtitle')}</Text>

            <Text style={styles.sectionLabel}>{t('local.useExistingPlaylist')}</Text>
            <View style={styles.selectorList}>
              <Pressable
                onPress={() => {
                  setSelectedImportPlaylistId(null);
                }}
                style={[
                  styles.selectorItem,
                  selectedImportPlaylistId === null && { borderColor: theme.accentPrimary, backgroundColor: `${theme.accentPrimary}1E` },
                ]}>
                <Text style={styles.selectorItemLabel}>{t('local.noPlaylist')}</Text>
              </Pressable>

              {sortedPlaylistOptions.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  onPress={() => {
                    setSelectedImportPlaylistId(playlist.id);
                  }}
                  style={[
                    styles.selectorItem,
                    selectedImportPlaylistId === playlist.id && { borderColor: theme.accentPrimary, backgroundColor: `${theme.accentPrimary}1E` },
                  ]}>
                  <Ionicons name={resolvePlaylistIcon(playlist.icon)} size={16} color={theme.accentPrimary} />
                  <Text style={styles.selectorItemLabel}>{playlist.name}</Text>
                </Pressable>
              ))}
            </View>

            {selectedImportPlaylistId === null ? (
              <>
                <Text style={styles.sectionLabel}>{t('local.newPlaylistName')}</Text>
                <TextInput
                  value={newImportPlaylistName}
                  onChangeText={setNewImportPlaylistName}
                  placeholder={t('local.newPlaylistName')}
                  placeholderTextColor={SECONDARY_TEXT}
                  style={styles.modalInput}
                />
                <Text style={styles.sectionLabel}>{t('local.iconTitle')}</Text>
                <IconPicker selectedIcon={newImportPlaylistIcon} onSelect={setNewImportPlaylistIcon} />
              </>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable onPress={closeImportModal} style={styles.modalButton}>
                <Text style={styles.modalButtonLabel}>{t('common.cancel')}</Text>
              </Pressable>

              <Pressable
                disabled={importing}
                onPress={() => {
                  void handleConfirmImport();
                }}
                style={[styles.modalButton, styles.modalButtonPrimary]}>
                {importing ? (
                  <ActivityIndicator size="small" color={PRIMARY_TEXT} />
                ) : (
                  <Text style={styles.modalButtonLabel}>{t('local.importConfirm')}</Text>
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
            <Text style={styles.modalTitle}>{selectedPlaylist?.name}</Text>
            <ActionSheetButton
              label={selectedPlaylist?.is_pinned ? t('actions.unpin') : t('actions.pin')}
              icon="pin-outline"
              onPress={() => {
                void handleTogglePin();
              }}
            />
            <ActionSheetButton
              label={t('actions.rename')}
              icon="create-outline"
              onPress={() => {
                setPlaylistMenuMode('rename');
              }}
            />
            <ActionSheetButton
              label={t('actions.delete')}
              icon="trash-outline"
              destructive
              onPress={() => {
                void handleDelete();
              }}
            />

            <Pressable onPress={closePlaylistModals} style={styles.sheetCloseButton}>
              <Text style={styles.sheetCloseLabel}>{t('common.close')}</Text>
            </Pressable>

            {submittingAction ? (
              <View style={styles.sheetLoadingRow}>
                <ActivityIndicator size="small" color={PRIMARY_TEXT} />
              </View>
            ) : null}
          </GlassCard>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={youtubeModalVisible}
        onRequestClose={closeYouTubeModal}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('local.youtubeModalTitle')}</Text>
            <Text style={[styles.modalCopy, styles.modalMuted]}>{t('local.youtubeModalCopy')}</Text>
            <TextInput
              value={youtubeUrl}
              onChangeText={setYouTubeUrl}
              placeholder={t('local.youtubePlaceholder')}
              placeholderTextColor={SECONDARY_TEXT}
              style={styles.modalInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            {youtubeDownloading ? (
              <View style={styles.youtubeProgressWrap}>
                <View style={styles.youtubeProgressTrack}>
                  <View
                    style={[
                      styles.youtubeProgressFill,
                      { width: `${Math.max(4, Math.round(youtubeProgress * 100))}%` },
                    ]}
                  />
                </View>
                <Text style={styles.youtubeProgressLabel}>{Math.round(youtubeProgress * 100)}%</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable disabled={youtubeDownloading} onPress={closeYouTubeModal} style={styles.modalButton}>
                <Text style={styles.modalButtonLabel}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                disabled={youtubeDownloading}
                onPress={() => {
                  void handleYouTubeDownload();
                }}
                style={[styles.modalButton, styles.modalButtonPrimary]}>
                {youtubeDownloading ? (
                  <ActivityIndicator size="small" color={PRIMARY_TEXT} />
                ) : (
                  <Text style={styles.modalButtonLabel}>{t('local.youtubeStart')}</Text>
                )}
              </Pressable>
            </View>
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
            <Text style={styles.modalTitle}>{t('common.rename')}</Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder={t('local.createPlaceholder')}
              placeholderTextColor={SECONDARY_TEXT}
              style={styles.modalInput}
            />

            <Text style={styles.sectionLabel}>{t('local.iconTitle')}</Text>
            <IconPicker selectedIcon={renameIconDraft} onSelect={setRenameIconDraft} />

            <View style={styles.modalActions}>
              <Pressable onPress={closePlaylistModals} style={styles.modalButton}>
                <Text style={styles.modalButtonLabel}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                disabled={submittingAction}
                onPress={() => {
                  void handleRename();
                }}
                style={[styles.modalButton, styles.modalButtonPrimary]}>
                {submittingAction ? (
                  <ActivityIndicator size="small" color={PRIMARY_TEXT} />
                ) : (
                  <Text style={styles.modalButtonLabel}>{t('common.save')}</Text>
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
  screen: {
    flex: 1,
  },
  headerWrap: {
    marginBottom: 24,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  headerCopy: {
    flex: 1,
  },
  appIcon: {
    width: 58,
    height: 58,
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
  title: {
    marginTop: 8,
    color: PRIMARY_TEXT,
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
  },
  subtitle: {
    marginTop: 10,
    maxWidth: 300,
    color: SECONDARY_TEXT,
    fontSize: 14,
    lineHeight: 20,
  },
  refreshButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  heroPanel: {
    marginTop: 18,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  heroPanelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  heroBadgeLabel: {
    color: PRIMARY_TEXT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  heroCountBadge: {
    alignItems: 'flex-end',
  },
  heroCountText: {
    color: PRIMARY_TEXT,
    fontSize: 22,
    fontWeight: '800',
  },
  heroCountLabel: {
    color: SECONDARY_TEXT,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroTitle: {
    marginTop: 18,
    color: PRIMARY_TEXT,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28,
    maxWidth: 260,
  },
  heroSubtitle: {
    marginTop: 10,
    color: SECONDARY_TEXT,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 300,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  actionsGridWide: {
    alignItems: 'stretch',
  },
  actionPressable: {
    width: '48.2%',
  },
  actionPressableLarge: {
    width: '100%',
  },
  actionCard: {
    minHeight: 132,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  actionCardLarge: {
    minHeight: 108,
  },
  actionIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  actionTitle: {
    color: PRIMARY_TEXT,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  actionSubtitle: {
    marginTop: 8,
    color: SECONDARY_TEXT,
    fontSize: 13,
    lineHeight: 18,
  },
  noticeCard: {
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  noticeError: {
    color: '#FF8FA3',
    fontSize: 14,
    fontWeight: '700',
  },
  noticeSuccess: {
    color: '#5CE1B9',
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
    color: PRIMARY_TEXT,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    marginBottom: 12,
    color: PRIMARY_TEXT,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  listContent: {
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  playlistRow: {
    gap: 12,
    marginBottom: 16,
  },
  playlistShell: {
    flex: 1,
  },
  playlistCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  playlistArtwork: {
    position: 'relative',
    width: '100%',
  },
  playlistThumbnail: {
    width: '100%',
    aspectRatio: 0.666,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistPosterShade: {
    ...StyleSheet.absoluteFillObject,
  },
  playlistChipsRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statusChipLabel: {
    color: PRIMARY_TEXT,
    fontSize: 11,
    fontWeight: '800',
  },
  menuBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  posterMetaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 6,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.46)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  countPillLabel: {
    color: PRIMARY_TEXT,
    fontSize: 11,
    fontWeight: '800',
  },
  playlistBody: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 40,
    paddingBottom: 14,
    gap: 4,
  },
  playlistTitle: {
    color: PRIMARY_TEXT,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  playlistMeta: {
    color: SECONDARY_TEXT,
    fontSize: 13,
    lineHeight: 18,
  },
  playlistFooter: {
    display: 'none',
  },
  playlistFooterToken: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GLASS_SOFT,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  playlistFooterLabel: {
    flex: 1,
    color: SECONDARY_TEXT,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyCard: {
    width: '100%',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    alignItems: 'center',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  emptyStateWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 12,
  },
  emptyTitle: {
    marginTop: 12,
    color: PRIMARY_TEXT,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyCopy: {
    marginTop: 8,
    color: SECONDARY_TEXT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 16, 0.66)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 430,
    padding: 20,
    gap: 16,
  },
  sheetCard: {
    width: '100%',
    maxWidth: 420,
    padding: 18,
  },
  modalTitle: {
    color: PRIMARY_TEXT,
    fontSize: 20,
    fontWeight: '800',
  },
  modalCopy: {
    color: PRIMARY_TEXT,
    fontSize: 14,
    lineHeight: 20,
  },
  modalMuted: {
    color: SECONDARY_TEXT,
  },
  sectionLabel: {
    color: SECONDARY_TEXT,
    fontSize: 13,
    fontWeight: '800',
  },
  modalInput: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    color: PRIMARY_TEXT,
    fontSize: 15,
    fontWeight: '600',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    minWidth: 112,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalButtonPrimary: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  modalButtonLabel: {
    color: PRIMARY_TEXT,
    fontSize: 14,
    fontWeight: '800',
  },
  youtubeProgressWrap: {
    gap: 10,
  },
  youtubeProgressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  youtubeProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FF3040',
  },
  youtubeProgressLabel: {
    color: PRIMARY_TEXT,
    fontSize: 13,
    fontWeight: '800',
  },
  selectorList: {
    gap: 10,
  },
  selectorItem: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectorItemLabel: {
    flex: 1,
    color: PRIMARY_TEXT,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GLASS_BORDER,
  },
  sheetButtonLabel: {
    color: PRIMARY_TEXT,
    fontSize: 15,
    fontWeight: '700',
  },
  sheetButtonLabelDanger: {
    color: '#FF8FA3',
  },
  sheetCloseButton: {
    marginTop: 16,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sheetCloseLabel: {
    color: PRIMARY_TEXT,
    fontSize: 14,
    fontWeight: '800',
  },
  sheetLoadingRow: {
    paddingTop: 14,
    alignItems: 'center',
  },
});
