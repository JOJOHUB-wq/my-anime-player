import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useVideoPlayer, VideoView } from 'expo-video';

import { FullscreenPlayer, type PlayableMedia } from '@/src/components/player/fullscreen-player';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import {
  getVideosByExternalIds,
  initializeDatabase,
  updateVideoProgress,
  upsertRemoteEpisode,
  type VideoRow,
} from '@/src/db/database';
import { useAuth } from '@/src/providers/auth-provider';
import { useDownloads } from '@/src/providers/download-provider';
import { useApp } from '@/src/providers/app-provider';
import { getJson, setJson } from '@/src/utils/storage';

type ShikimoriGenre = {
  id: number;
  name: string;
  russian: string;
};

type ShikimoriAnimeDetail = {
  id: number;
  name: string;
  russian: string;
  english?: string | null;
  japanese?: string | null;
  score: string;
  episodes: number;
  episodes_aired: number;
  description?: string;
  franchise?: string;
  status?: string;
  kind?: string;
  synonyms?: string[];
  image?: {
    original?: string;
  };
  genres?: ShikimoriGenre[];
};

type LocalComment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

type PlaybackSelection = {
  media: PlayableMedia;
  title: string;
  subtitle: string;
  videoId: number;
  progress: number;
  duration: number;
};

type StreamingSource = {
  url: string;
  label: string;
  dub: string;
  headers?: Record<string, string>;
};

type StreamingEpisode = {
  id: string;
  number: number;
  title: string;
  image: string | null;
  dubs: string[];
  sources: StreamingSource[];
};

type StreamingSeason = {
  id: string;
  title: string;
  image: string | null;
  provider: string;
  type: string;
  episodes: StreamingEpisode[];
};

const SHIKIMORI_BASE_URL = 'https://shikimori.one';
const PRIMARY_TEXT = '#FFFFFF';
const SECONDARY_TEXT = '#A0A0A0';
const COMMENT_LIMIT = 40;

function buildPosterUrl(path?: string) {
  if (!path) {
    return null;
  }

  return `${SHIKIMORI_BASE_URL}${path}`;
}

function sanitizeDescription(value?: string) {
  if (!value) {
    return '';
  }

  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^[\]]+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatEpisodeFilename(seriesTitle: string, number: number, dub: string) {
  return `${seriesTitle} - ${dub} - Episode ${String(number).padStart(2, '0')}.mp4`;
}

function buildExternalId(animeId: number, seasonId: string, dub: string, episodeNumber: number) {
  return `shikimori:${animeId}:${seasonId}:${dub}:${episodeNumber}`;
}

function formatCommentTime(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getPrimarySource(episode: StreamingEpisode, selectedDub: string) {
  return (
    episode.sources.find((source) => source.dub === selectedDub) ??
    episode.sources.find((source) => source.dub === 'Original') ??
    episode.sources[0] ??
    null
  );
}

function formatDubLabel(
  dub: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (dub === 'Original') {
    return t('online.dubs.original');
  }

  if (dub === 'Subtitles') {
    return t('online.dubs.subtitles');
  }

  if (dub === 'Dubbed') {
    return t('online.dubs.dubbed');
  }

  return dub;
}

function buildSeasonLabel(season: StreamingSeason, index: number) {
  return season.title || `Season ${index + 1}`;
}

function HeroPreviewPlayer({
  posterUri,
  title,
  subtitle,
  media,
  onOpenFullscreen,
  watchLabel,
}: {
  posterUri: string | null;
  title: string;
  subtitle: string;
  media: PlayableMedia | null;
  onOpenFullscreen: () => void;
  watchLabel: string;
}) {
  const { theme } = useApp();
  const player = useVideoPlayer(
    media
      ? {
          uri: media.uri,
          headers: media.headers,
          contentType: media.uri.includes('.m3u8') ? 'hls' : 'auto',
          metadata: {
            title,
            artist: subtitle,
            artwork: posterUri ?? undefined,
          },
        }
      : null,
    (videoPlayer) => {
      if (media) {
        videoPlayer.loop = true;
        videoPlayer.muted = true;
        videoPlayer.play();
      }
    }
  );

  return (
    <View style={styles.heroShell}>
      {media ? (
        <VideoView style={styles.heroVideo} player={player} nativeControls={false} contentFit="cover" />
      ) : posterUri ? (
        <Image source={{ uri: posterUri }} style={styles.heroVideo} contentFit="cover" />
      ) : (
        <View style={[styles.heroVideo, styles.heroFallback, { backgroundColor: theme.surfaceStrong }]}>
          <Ionicons name="sparkles-outline" size={34} color={theme.accentPrimary} />
        </View>
      )}

      <View style={styles.heroShade} />

      <View style={styles.heroOverlay}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroPill}>
            <Ionicons name="play-circle-outline" size={14} color={theme.textPrimary} />
            <Text style={styles.heroPillLabel}>{subtitle}</Text>
          </View>
          <Pressable onPress={onOpenFullscreen} style={styles.heroActionButton}>
            <Ionicons name="expand-outline" size={18} color={theme.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.heroBottomRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.heroSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          <Pressable onPress={onOpenFullscreen} style={[styles.watchButton, { backgroundColor: theme.accentPrimary }]}>
            <Ionicons name="play" size={16} color="#05070F" />
            <Text style={styles.watchButtonLabel}>{watchLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MetadataChip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.metadataChip}>
      <Ionicons name={icon} size={13} color={PRIMARY_TEXT} />
      <Text style={styles.metadataChipLabel}>{label}</Text>
    </View>
  );
}

function EpisodeCard({
  item,
  index,
  downloadedVideo,
  activeDownloadProgress,
  currentDub,
  onSelect,
  onPlay,
  onDownload,
}: {
  item: StreamingEpisode;
  index: number;
  downloadedVideo: VideoRow | null;
  activeDownloadProgress: number;
  currentDub: string;
  onSelect: () => void;
  onPlay: () => void;
  onDownload: () => void;
}) {
  const { theme } = useApp();
  const { t } = useTranslation();
  const source = getPrimarySource(item, currentDub);
  const progress = Math.max(activeDownloadProgress, downloadedVideo?.download_progress ?? 0);
  const downloaded = downloadedVideo?.download_status === 'downloaded' && Boolean(downloadedVideo?.uri);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 35).springify()}
      layout={LinearTransition.springify().damping(18).stiffness(180)}
      style={styles.episodeWrap}>
      <BlurView intensity={40} tint="dark" style={styles.episodeCard}>
        <Pressable onPress={onSelect} style={styles.episodeCardMain}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.episodeImage} contentFit="cover" />
          ) : (
            <View style={[styles.episodeImage, styles.episodeImageFallback, { backgroundColor: theme.surfaceStrong }]}>
              <Ionicons name="film-outline" size={18} color={theme.textPrimary} />
            </View>
          )}

          <View style={styles.episodeCopy}>
            <Text style={styles.episodeTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.episodeMeta} numberOfLines={1}>
              {t('playlist.episode', {
                value: item.number,
                defaultValue: `Episode ${item.number}`,
              })}{' '}
              • {formatDubLabel(source?.dub || currentDub, t)}
            </Text>

            <View style={styles.episodeBadges}>
              {item.dubs.map((dub) => (
                <View key={`${item.id}-${dub}`} style={styles.episodeBadge}>
                  <Text style={styles.episodeBadgeLabel}>{formatDubLabel(dub, t)}</Text>
                </View>
              ))}
            </View>

            {progress > 0 ? (
              <View style={styles.downloadTrack}>
                <View
                  style={[
                    styles.downloadFill,
                    {
                      width: `${Math.max(0, Math.min(progress, 1)) * 100}%`,
                      backgroundColor: theme.accentPrimary,
                    },
                  ]}
                />
              </View>
            ) : null}
          </View>
        </Pressable>

        <View style={styles.episodeActions}>
          <Pressable onPress={onDownload} style={styles.circleButton}>
            <Ionicons
              name={downloaded ? 'checkmark-circle' : 'download-outline'}
              size={18}
              color={downloaded ? theme.success : theme.textPrimary}
            />
          </Pressable>
          <Pressable onPress={onPlay} style={[styles.circleButton, { backgroundColor: `${theme.accentPrimary}20` }]}>
            <Ionicons name="play" size={18} color={theme.textPrimary} />
          </Pressable>
        </View>
      </BlurView>
    </Animated.View>
  );
}

function CommentCard({ item }: { item: LocalComment }) {
  return (
    <BlurView intensity={36} tint="dark" style={styles.commentCard}>
      <View style={styles.commentHeader}>
        <Text style={styles.commentAuthor}>{item.author}</Text>
        <Text style={styles.commentTime}>{formatCommentTime(item.createdAt)}</Text>
      </View>
      <Text style={styles.commentText}>{item.text}</Text>
    </BlurView>
  );
}

export default function OnlineDetailScreen() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const { theme } = useApp();
  const { user } = useAuth();
  const { downloadEpisode, getDownloadState } = useDownloads();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const animeId = Number(rawId);
  const [details, setDetails] = useState<ShikimoriAnimeDetail | null>(null);
  const [seasons, setSeasons] = useState<StreamingSeason[]>([]);
  const [storedEpisodes, setStoredEpisodes] = useState<Record<string, VideoRow>>({});
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [selectedDub, setSelectedDub] = useState('Original');
  const [focusedEpisodeId, setFocusedEpisodeId] = useState<string | null>(null);
  const [selectedPlayback, setSelectedPlayback] = useState<PlaybackSelection | null>(null);
  const [comments, setComments] = useState<LocalComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [seasonLoading, setSeasonLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);

  const title = details?.russian || details?.name || t('discover.unknownTitle');
  const posterUri = buildPosterUrl(details?.image?.original);
  const description = sanitizeDescription(details?.description) || t('discover.descriptionFallback', { defaultValue: 'Description is unavailable for this title.' });
  const commentsStorageKey = useMemo(() => `online-comments:${animeId}`, [animeId]);

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.id === selectedSeasonId) ?? seasons[0] ?? null,
    [seasons, selectedSeasonId]
  );

  const availableDubs = useMemo(() => {
    const values = new Set<string>();

    for (const episode of selectedSeason?.episodes ?? []) {
      for (const source of episode.sources) {
        if (source.dub) {
          values.add(source.dub);
        }
      }
    }

    return values.size > 0 ? [...values] : ['Original'];
  }, [selectedSeason]);

  const activeEpisode = useMemo(() => {
    const fallbackEpisode = selectedSeason?.episodes[0] ?? null;
    if (!focusedEpisodeId) {
      return fallbackEpisode;
    }

    return selectedSeason?.episodes.find((episode) => episode.id === focusedEpisodeId) ?? fallbackEpisode;
  }, [focusedEpisodeId, selectedSeason]);

  const activeSource = useMemo(
    () => (activeEpisode ? getPrimarySource(activeEpisode, selectedDub) : null),
    [activeEpisode, selectedDub]
  );

  useEffect(() => {
    if (selectedSeason && !selectedSeasonId) {
      setSelectedSeasonId(selectedSeason.id);
    }
  }, [selectedSeason, selectedSeasonId]);

  useEffect(() => {
    if (!availableDubs.includes(selectedDub)) {
      setSelectedDub(availableDubs[0] ?? 'Original');
    }
  }, [availableDubs, selectedDub]);

  useEffect(() => {
    if (selectedSeason?.episodes.length && !selectedSeason.episodes.some((episode) => episode.id === focusedEpisodeId)) {
      setFocusedEpisodeId(selectedSeason.episodes[0]?.id ?? null);
    }
  }, [focusedEpisodeId, selectedSeason]);

  useEffect(() => {
    let active = true;

    async function loadDetails() {
      setLoading(true);
      setError(null);

      try {
        if (!Number.isFinite(animeId) || animeId <= 0) {
          throw new Error(t('discover.loadError', { defaultValue: 'Unable to load the Shikimori catalog.' }));
        }

        const response = await fetch(`${SHIKIMORI_BASE_URL}/api/animes/${animeId}`, {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as ShikimoriAnimeDetail;
        if (active) {
          setDetails(payload);
        }
      } catch {
        if (active) {
          setError(t('discover.loadError', { defaultValue: 'Unable to load the Shikimori catalog.' }));
          setDetails(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDetails();

    return () => {
      active = false;
    };
  }, [animeId, t]);

  useEffect(() => {
    let active = true;

    async function loadSeasons() {
      if (!details) {
        return;
      }

      setSeasonLoading(true);
      setProviderError(null);

      try {
        const { resolveStreamingCatalog } = await import('@/src/services/stream-provider');
        const resolution = await resolveStreamingCatalog({
          title: details.russian || details.name || details.english || details.japanese || title,
          alternativeTitles: [
            details.russian,
            details.name,
            details.english,
            details.japanese,
            ...(details.synonyms ?? []),
          ].filter((value): value is string => Boolean(value)),
          franchise: details.franchise,
        });

        if (!active) {
          return;
        }

        setSeasons(resolution.seasons);
        setSelectedSeasonId(resolution.seasons[0]?.id ?? null);

        if (resolution.seasons.length === 0) {
          setProviderError(
            t('online.noStreams', {
              defaultValue: 'No playable sources were found for this title right now.',
            })
          );
        }
      } catch {
        if (active) {
          setSeasons([]);
          setProviderError(
            t('online.providerError', {
              defaultValue: 'The stream provider is unavailable right now.',
            })
          );
        }
      } finally {
        if (active) {
          setSeasonLoading(false);
        }
      }
    }

    void loadSeasons();

    return () => {
      active = false;
    };
  }, [details, t, title]);

  useEffect(() => {
    let active = true;

    async function loadStoredRows() {
      if (!details || seasons.length === 0) {
        setStoredEpisodes({});
        return;
      }

      await initializeDatabase(db);

      const externalIds = seasons.flatMap((season) =>
        season.episodes.flatMap((episode) =>
          [...new Set(episode.sources.map((source) => source.dub))].map((dub) =>
            buildExternalId(details.id, season.id, dub, episode.number)
          )
        )
      );

      const rows = await getVideosByExternalIds(db, externalIds);
      if (!active) {
        return;
      }

      setStoredEpisodes(
        rows.reduce<Record<string, VideoRow>>((accumulator, row) => {
          if (row.external_id) {
            accumulator[row.external_id] = row;
          }
          return accumulator;
        }, {})
      );
    }

    void loadStoredRows();

    return () => {
      active = false;
    };
  }, [db, details, seasons]);

  useEffect(() => {
    let active = true;

    async function loadComments() {
      setCommentsLoading(true);
      const nextComments = await getJson<LocalComment[]>(commentsStorageKey, []);

      if (!active) {
        return;
      }

      setComments(nextComments.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
      setCommentsLoading(false);
    }

    void loadComments();

    return () => {
      active = false;
    };
  }, [commentsStorageKey]);

  const openEpisodeFullscreen = useCallback(
    async (season: StreamingSeason, episode: StreamingEpisode, source: StreamingSource) => {
      if (!details) {
        return;
      }

      await initializeDatabase(db);

      const row = await upsertRemoteEpisode(db, {
        externalId: buildExternalId(details.id, season.id, source.dub, episode.number),
        remoteUrl: source.url,
        seriesTitle: title,
        filename: formatEpisodeFilename(title, episode.number, source.dub),
        episodeNumber: episode.number,
        thumbnailUri: posterUri,
        playlistIcon: 'sparkles-outline',
      });

      if (row.external_id) {
        setStoredEpisodes((current) => ({
          ...current,
          [row.external_id as string]: row,
        }));
      }

      setSelectedPlayback({
        media: {
          uri: row.uri || source.url,
          headers: row.uri ? undefined : source.headers,
          progress: row.progress,
          duration: row.duration,
        },
        title,
        subtitle: `${buildSeasonLabel(season, seasons.findIndex((item) => item.id === season.id))} • ${formatDubLabel(source.dub, t)} • ${t('playlist.episode', {
          value: episode.number,
          defaultValue: `Episode ${episode.number}`,
        })}`,
        videoId: row.id,
        progress: row.progress,
        duration: row.duration,
      });
    },
    [db, details, seasons, posterUri, t, title]
  );

  const handleDownloadEpisode = useCallback(
    async (season: StreamingSeason, episode: StreamingEpisode, source: StreamingSource) => {
      try {
        const row = await downloadEpisode({
          externalId: buildExternalId(details?.id ?? animeId, season.id, source.dub, episode.number),
          remoteUrl: source.url,
          headers: source.headers,
          seriesTitle: title,
          filename: formatEpisodeFilename(title, episode.number, source.dub),
          episodeNumber: episode.number,
          thumbnailUri: episode.image || posterUri,
          playlistIcon: 'sparkles-outline',
        });

        if (row.external_id) {
          setStoredEpisodes((current) => ({
            ...current,
            [row.external_id as string]: row,
          }));
        }
      } catch {
        setProviderError(
          t('online.downloadError', {
            defaultValue: 'Unable to download this episode.',
          })
        );
      }
    },
    [animeId, details?.id, downloadEpisode, posterUri, t, title]
  );

  const submitComment = useCallback(async () => {
    const trimmed = commentDraft.trim();

    if (!trimmed || trimmed.length > COMMENT_LIMIT * 20) {
      return;
    }

    const nextComment: LocalComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: user?.username || t('profile.guest'),
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    const nextComments = [nextComment, ...comments];
    setComments(nextComments);
    setCommentDraft('');
    await setJson(commentsStorageKey, nextComments);
  }, [commentDraft, comments, commentsStorageKey, t, user?.username]);

  const renderEpisode = ({ item, index }: ListRenderItemInfo<StreamingEpisode>) => {
    if (!selectedSeason || !details) {
      return null;
    }

    const source = getPrimarySource(item, selectedDub);
    const externalId = source
      ? buildExternalId(details.id, selectedSeason.id, source.dub, item.number)
      : null;
    const stored = externalId ? storedEpisodes[externalId] ?? null : null;
    const activeDownload = externalId ? getDownloadState(externalId) : null;

    return (
      <EpisodeCard
        item={item}
        index={index}
        downloadedVideo={stored}
        activeDownloadProgress={activeDownload?.progress ?? 0}
        currentDub={selectedDub}
        onSelect={() => {
          setFocusedEpisodeId(item.id);
        }}
        onPlay={() => {
          if (selectedSeason && source) {
            void openEpisodeFullscreen(selectedSeason, item, source);
          }
        }}
        onDownload={() => {
          if (selectedSeason && source) {
            void handleDownloadEpisode(selectedSeason, item, source);
          }
        }}
      />
    );
  };

  if (selectedPlayback) {
    return (
      <FullscreenPlayer
        media={selectedPlayback.media}
        title={selectedPlayback.title}
        subtitle={selectedPlayback.subtitle}
        onPersistProgress={async (snapshot) => {
          await updateVideoProgress(db, selectedPlayback.videoId, snapshot.currentTime, snapshot.duration);
        }}
        onClose={() => {
          setSelectedPlayback(null);
        }}
      />
    );
  }

  if (loading) {
    return (
      <LiquidBackground>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.textPrimary} />
          <Text style={styles.stateTitle}>{t('discover.loading', { defaultValue: 'Loading trending anime' })}</Text>
        </View>
      </LiquidBackground>
    );
  }

  if (error || !details) {
    return (
      <LiquidBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerState}>
            <BlurView intensity={40} tint="dark" style={styles.errorCard}>
              <Text style={styles.errorTitle}>
                {t('discover.loadError', { defaultValue: 'Unable to load the Shikimori catalog.' })}
              </Text>
              <Pressable onPress={() => router.back()} style={styles.errorButton}>
                <Text style={styles.errorButtonLabel}>{t('player.back', { defaultValue: 'Back' })}</Text>
              </Pressable>
            </BlurView>
          </View>
        </SafeAreaView>
      </LiquidBackground>
    );
  }

  return (
    <LiquidBackground>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={selectedSeason?.episodes ?? []}
          renderItem={renderEpisode}
          keyExtractor={(item) => `${selectedSeason?.id ?? 'season'}-${selectedDub}-${item.id}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListHeaderComponent={
            <>
              <Animated.View entering={FadeInDown.duration(420)} style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                  <Ionicons name="chevron-back" size={20} color={PRIMARY_TEXT} />
                </Pressable>

                <HeroPreviewPlayer
                  posterUri={posterUri}
                  title={title}
                  subtitle={
                    activeEpisode
                      ? `${formatDubLabel(activeSource?.dub || selectedDub, t)} • ${t('playlist.episode', {
                          value: activeEpisode.number,
                          defaultValue: `Episode ${activeEpisode.number}`,
                        })}`
                      : t('discover.episodesLabel', { defaultValue: 'Episodes' })
                  }
                  media={
                    activeSource
                      ? {
                          uri: activeSource.url,
                          headers: activeSource.headers,
                        }
                      : null
                  }
                  onOpenFullscreen={() => {
                    if (selectedSeason && activeEpisode && activeSource) {
                      void openEpisodeFullscreen(selectedSeason, activeEpisode, activeSource);
                    }
                  }}
                  watchLabel={t('online.watchButton', { defaultValue: 'Watch' })}
                />

                <View style={styles.titleBlock}>
                  <Text style={styles.seriesTitle}>{title}</Text>
                  <View style={styles.metadataRow}>
                    <MetadataChip icon="star" label={details.score || '0.0'} />
                    <MetadataChip
                      icon="film-outline"
                      label={String(details.episodes_aired || details.episodes || 0)}
                    />
                    {details.kind ? <MetadataChip icon="layers-outline" label={details.kind.toUpperCase()} /> : null}
                  </View>
                  <Text style={styles.description}>{description}</Text>
                </View>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(60).duration(380)} style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {t('online.dubbingTitle', { defaultValue: 'Dubbing / Language' })}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {availableDubs.map((dub) => {
                    const active = dub === selectedDub;

                    return (
                      <Pressable
                        key={dub}
                        onPress={() => setSelectedDub(dub)}
                        style={[
                          styles.selectorChip,
                          active && {
                            borderColor: theme.accentPrimary,
                            backgroundColor: `${theme.accentPrimary}20`,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.selectorChipLabel,
                            { color: active ? theme.textPrimary : theme.textSecondary },
                          ]}>
                          {formatDubLabel(dub, t)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(90).duration(380)} style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {t('online.seasonsTitle', { defaultValue: 'Seasons / Franchise' })}
                </Text>
                {seasonLoading ? (
                  <View style={styles.inlineLoader}>
                    <ActivityIndicator size="small" color={theme.textPrimary} />
                    <Text style={styles.inlineLoaderLabel}>
                      {t('online.loadingEpisodes', { defaultValue: 'Resolving seasons and streams' })}
                    </Text>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {seasons.map((season, index) => {
                      const active = season.id === selectedSeason?.id;

                      return (
                        <Pressable
                          key={season.id}
                          onPress={() => {
                            setSelectedSeasonId(season.id);
                            setFocusedEpisodeId(season.episodes[0]?.id ?? null);
                          }}
                          style={[
                            styles.selectorChip,
                            active && {
                              borderColor: theme.accentPrimary,
                              backgroundColor: `${theme.accentPrimary}20`,
                            },
                          ]}>
                          <Text
                            style={[
                              styles.selectorChipLabel,
                              { color: active ? theme.textPrimary : theme.textSecondary },
                            ]}>
                            {buildSeasonLabel(season, index)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </Animated.View>

              {providerError ? (
                <Animated.View entering={FadeInDown.delay(120).duration(360)} style={styles.section}>
                  <BlurView intensity={36} tint="dark" style={styles.noticeCard}>
                  <Text style={styles.noticeText}>{providerError}</Text>
                  </BlurView>
                </Animated.View>
              ) : null}

              <Animated.View entering={FadeInDown.delay(150).duration(360)} style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    {t('discover.episodesLabel', { defaultValue: 'Episodes' })}{selectedSeason ? ` • ${selectedSeason.episodes.length}` : ''}
                  </Text>
                </View>
              </Animated.View>
            </>
          }
          ListFooterComponent={
            <View style={styles.commentsSection}>
              <Text style={styles.sectionTitle}>
                {t('online.commentsTitle', { defaultValue: 'Comments' })}
              </Text>
              <BlurView intensity={40} tint="dark" style={styles.commentComposer}>
                <TextInput
                  value={commentDraft}
                  onChangeText={setCommentDraft}
                  placeholder={t('online.commentPlaceholder', { defaultValue: 'Share your thoughts about this anime...' })}
                  placeholderTextColor={theme.textMuted}
                  style={styles.commentInput}
                  multiline
                />
                <Pressable
                  onPress={() => {
                    void submitComment();
                  }}
                  style={[styles.commentSendButton, { backgroundColor: theme.accentPrimary }]}>
                  <Ionicons name="send" size={16} color="#05070F" />
                </Pressable>
              </BlurView>

              {commentsLoading ? (
                <View style={styles.inlineLoader}>
                  <ActivityIndicator size="small" color={theme.textPrimary} />
                </View>
              ) : comments.length > 0 ? (
                <View style={styles.commentsList}>
                  {comments.map((comment) => (
                    <CommentCard key={comment.id} item={comment} />
                  ))}
                </View>
              ) : (
                <BlurView intensity={36} tint="dark" style={styles.emptyCommentsCard}>
                  <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.textPrimary} />
                  <Text style={styles.emptyCommentsTitle}>
                    {t('online.commentsEmptyTitle', { defaultValue: 'No comments yet' })}
                  </Text>
                  <Text style={styles.emptyCommentsCopy}>
                    {t('online.commentsEmptyCopy', { defaultValue: 'Start the conversation and leave the first impression.' })}
                  </Text>
                </BlurView>
              )}
            </View>
          }
          ListEmptyComponent={
            !seasonLoading ? (
              <View style={styles.emptyWrap}>
                <BlurView intensity={40} tint="dark" style={styles.emptyCard}>
                  <Ionicons name="cloud-offline-outline" size={30} color={theme.textPrimary} />
                  <Text style={styles.emptyTitle}>
                    {t('online.emptyEpisodesTitle', { defaultValue: 'No episodes available' })}
                  </Text>
                  <Text style={styles.emptyCopy}>
                    {t('online.emptyEpisodesCopy', { defaultValue: 'The streaming provider did not return playable episodes for this title.' })}
                  </Text>
                </BlurView>
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stateTitle: {
    marginTop: 12,
    color: PRIMARY_TEXT,
    fontSize: 16,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 120,
  },
  header: {
    gap: 18,
    marginBottom: 18,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroShell: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#05070F',
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 7, 15, 0.28)',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 18,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(5, 7, 15, 0.64)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroPillLabel: {
    color: PRIMARY_TEXT,
    fontSize: 12,
    fontWeight: '800',
  },
  heroActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 7, 15, 0.64)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
  },
  heroCopy: {
    flex: 1,
  },
  heroTitle: {
    color: PRIMARY_TEXT,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  heroSubtitle: {
    marginTop: 6,
    color: SECONDARY_TEXT,
    fontSize: 13,
    fontWeight: '600',
  },
  watchButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  watchButtonLabel: {
    color: '#05070F',
    fontSize: 14,
    fontWeight: '900',
  },
  titleBlock: {
    gap: 12,
  },
  seriesTitle: {
    color: PRIMARY_TEXT,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  metadataRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  metadataChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  metadataChipLabel: {
    color: PRIMARY_TEXT,
    fontSize: 12,
    fontWeight: '800',
  },
  description: {
    color: SECONDARY_TEXT,
    fontSize: 14,
    lineHeight: 21,
  },
  section: {
    marginBottom: 18,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: PRIMARY_TEXT,
    fontSize: 18,
    fontWeight: '900',
  },
  chipRow: {
    gap: 10,
    paddingRight: 6,
  },
  selectorChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  selectorChipLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  inlineLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  inlineLoaderLabel: {
    color: SECONDARY_TEXT,
    fontSize: 13,
    fontWeight: '600',
  },
  noticeCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 28, 0.42)',
    padding: 14,
  },
  noticeText: {
    color: PRIMARY_TEXT,
    fontSize: 13,
    lineHeight: 18,
  },
  episodeWrap: {
    width: '100%',
  },
  episodeCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 28, 0.42)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  episodeCardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  episodeImage: {
    width: 84,
    height: 84,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  episodeImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeCopy: {
    flex: 1,
    gap: 8,
  },
  episodeTitle: {
    color: PRIMARY_TEXT,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  episodeMeta: {
    color: SECONDARY_TEXT,
    fontSize: 12,
    fontWeight: '600',
  },
  episodeBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  episodeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  episodeBadgeLabel: {
    color: PRIMARY_TEXT,
    fontSize: 11,
    fontWeight: '700',
  },
  episodeActions: {
    gap: 10,
  },
  circleButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  downloadTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  downloadFill: {
    height: '100%',
    borderRadius: 999,
  },
  commentsSection: {
    marginTop: 28,
    gap: 14,
  },
  commentComposer: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 28, 0.42)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  commentInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    color: PRIMARY_TEXT,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  commentSendButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentsList: {
    gap: 12,
  },
  commentCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 28, 0.42)',
    padding: 14,
    gap: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  commentAuthor: {
    color: PRIMARY_TEXT,
    fontSize: 14,
    fontWeight: '800',
  },
  commentTime: {
    color: SECONDARY_TEXT,
    fontSize: 12,
    fontWeight: '600',
  },
  commentText: {
    color: PRIMARY_TEXT,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyCommentsCard: {
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 28, 0.42)',
    padding: 20,
  },
  emptyCommentsTitle: {
    color: PRIMARY_TEXT,
    fontSize: 17,
    fontWeight: '900',
  },
  emptyCommentsCopy: {
    color: SECONDARY_TEXT,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyWrap: {
    paddingTop: 12,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 28, 0.42)',
    padding: 20,
  },
  emptyTitle: {
    color: PRIMARY_TEXT,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyCopy: {
    color: SECONDARY_TEXT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 28, 0.42)',
    padding: 20,
  },
  errorTitle: {
    color: PRIMARY_TEXT,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  errorButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  errorButtonLabel: {
    color: PRIMARY_TEXT,
    fontSize: 14,
    fontWeight: '800',
  },
});
