import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useApp } from '@/src/providers/app-provider';
import {
  fetchAnimeDetail,
  fetchKodikTranslations,
  type CatalogAnimeDetail,
  type KodikEpisode,
  type KodikSeason,
  type KodikTranslation,
} from '@/src/services/online-catalog';
import {
  buildStreamProxyUrl,
  resolveStreamingCatalog,
  resolveStreamingCatalogByAnimeId,
  type StreamingResolution,
  type StreamingSource,
} from '@/src/services/stream-provider';

const LIQUID_GLASS_BG = 'rgba(11, 16, 30, 0.42)';
const LIQUID_GLASS_BORDER = 'rgba(255, 255, 255, 0.15)';

function resolveIdParam(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeLabel(value?: string | null, fallback = 'Original') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function sortDubTitles(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

function pickBestSource(sources: StreamingSource[]) {
  const normalizedSources = [...sources].sort((left, right) => {
    const leftLabel = normalizeLabel(left.label, left.dub).toLowerCase();
    const rightLabel = normalizeLabel(right.label, right.dub).toLowerCase();

    if (leftLabel.includes('1080') && !rightLabel.includes('1080')) {
      return -1;
    }

    if (!leftLabel.includes('1080') && rightLabel.includes('1080')) {
      return 1;
    }

    if (leftLabel.includes('720') && !rightLabel.includes('720')) {
      return -1;
    }

    if (!leftLabel.includes('720') && rightLabel.includes('720')) {
      return 1;
    }

    return 0;
  });

  return normalizedSources[0] ?? null;
}

function mapStreamResolutionToTranslations(
  resolution: StreamingResolution,
  options: {
    posterUrl: string | null;
    originalDubLabel: string;
    seasonLabelPrefix: string;
    episodeLabelPrefix: string;
  }
) {
  const translations = new Map<string, KodikTranslation>();

  for (const season of resolution.seasons) {
    const episodesByDub = new Map<
      string,
      {
        link: string | null;
        episodes: KodikEpisode[];
      }
    >();

    for (const episode of season.episodes) {
      const sourcesByDub = new Map<string, StreamingSource[]>();

      for (const source of episode.sources) {
        const dubTitle = normalizeLabel(source.dub || source.label, options.originalDubLabel);
        const current = sourcesByDub.get(dubTitle) ?? [];
        current.push(source);
        sourcesByDub.set(dubTitle, current);
      }

      for (const [dubTitle, sources] of sourcesByDub.entries()) {
        const bestSource = pickBestSource(sources);
        if (!bestSource?.url) {
          continue;
        }

        const proxiedUrl = buildStreamProxyUrl(bestSource.url, bestSource.headers);
        const current = episodesByDub.get(dubTitle) ?? {
          link: proxiedUrl,
          episodes: [],
        };

        if (!current.episodes.some((item) => item.number === episode.number)) {
          current.episodes.push({
            id: `${season.id}-${dubTitle}-${episode.id}`,
            number: episode.number,
            title: episode.title || `${options.episodeLabelPrefix} ${episode.number}`,
            link: proxiedUrl,
            screenshot: episode.image,
          });
        }

        if (!current.link) {
          current.link = proxiedUrl;
        }

        episodesByDub.set(dubTitle, current);
      }
    }

    for (const [dubTitle, seasonData] of episodesByDub.entries()) {
      const translationKey = dubTitle.toLowerCase();
      const existing = translations.get(translationKey);
      const nextSeason: KodikSeason = {
        id: season.id,
        label: season.title || `${options.seasonLabelPrefix} 1`,
        link: seasonData.link,
        episodes: [...seasonData.episodes].sort((left, right) => left.number - right.number),
      };

      if (!existing) {
        translations.set(translationKey, {
          id: translationKey,
          title: dubTitle,
          type: season.provider || 'stream',
          posterUrl: season.image || options.posterUrl,
          playerLink: seasonData.link,
          seasons: [nextSeason],
        });
        continue;
      }

      const mergedSeasons = new Map(existing.seasons.map((item) => [item.id, item]));
      const currentSeason = mergedSeasons.get(nextSeason.id);

      if (!currentSeason) {
        mergedSeasons.set(nextSeason.id, nextSeason);
      } else {
        const mergedEpisodes = new Map(currentSeason.episodes.map((item) => [item.number, item]));
        for (const item of nextSeason.episodes) {
          if (!mergedEpisodes.has(item.number)) {
            mergedEpisodes.set(item.number, item);
          }
        }

        mergedSeasons.set(nextSeason.id, {
          ...currentSeason,
          link: currentSeason.link ?? nextSeason.link,
          episodes: [...mergedEpisodes.values()].sort((left, right) => left.number - right.number),
        });
      }

      translations.set(translationKey, {
        ...existing,
        posterUrl: existing.posterUrl ?? season.image ?? options.posterUrl,
        playerLink: existing.playerLink ?? seasonData.link,
        seasons: [...mergedSeasons.values()],
      });
    }
  }

  return [...translations.values()]
    .map((translation) => ({
      ...translation,
      seasons: [...translation.seasons].sort((left, right) =>
        left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' })
      ),
    }))
    .sort((left, right) => sortDubTitles(left.title, right.title));
}

function MetadataChip({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  const { theme } = useApp();

  return (
    <View style={[styles.metaChip, { backgroundColor: theme.surfaceStrong }]}>
      <Ionicons name={icon} size={13} color={theme.textPrimary} />
      <Text style={[styles.metaChipLabel, { color: theme.textPrimary }]}>{label}</Text>
    </View>
  );
}

function SelectorChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useApp();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.selectorChip,
        {
          backgroundColor: active ? theme.accentPrimary : theme.surfaceMuted,
          borderColor: active ? theme.accentPrimary : theme.cardBorder,
        },
      ]}>
      <Text style={[styles.selectorChipLabel, { color: active ? '#05070F' : theme.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

function EpisodeTile({
  item,
  index,
  onPress,
}: {
  item: KodikEpisode;
  index: number;
  onPress: () => void;
}) {
  const { theme } = useApp();
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 20).springify()}
      layout={LinearTransition.springify().damping(18).stiffness(180)}
      style={styles.episodeTileWrap}>
      <Pressable onPress={onPress}>
        <BlurView
          intensity={72}
          tint="dark"
          style={[styles.episodeTile, { borderColor: LIQUID_GLASS_BORDER, backgroundColor: LIQUID_GLASS_BG }]}>
          <View style={[styles.episodeNumberBadge, { backgroundColor: theme.surfaceStrong }]}>
            <Text style={[styles.episodeNumberText, { color: theme.textPrimary }]}>{item.number}</Text>
          </View>

          <Text style={[styles.episodeTileTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            {item.title || t('online.episodeLabel', { value: item.number })}
          </Text>

          <Ionicons name="play" size={16} color={theme.accentPrimary} />
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

export default function OnlineAnimeDetailScreen() {
  const { theme } = useApp();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const animeId = useMemo(() => resolveIdParam(params.id), [params.id]);
  const [detail, setDetail] = useState<CatalogAnimeDetail | null>(null);
  const [translations, setTranslations] = useState<KodikTranslation[]>([]);
  const [selectedDubId, setSelectedDubId] = useState<string | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnime = useCallback(async () => {
    if (!animeId) {
      setError(t('online.loadTitleErrorCopy'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextDetail = await fetchAnimeDetail(animeId);
      setDetail(nextDetail);

      try {
        let streamResolution = await resolveStreamingCatalogByAnimeId(animeId);
        if (streamResolution.seasons.length === 0) {
          streamResolution = await resolveStreamingCatalog({
            title: nextDetail.title || nextDetail.originalTitle,
            alternativeTitles: [nextDetail.originalTitle, nextDetail.title],
          });
        }

        const streamTranslations = mapStreamResolutionToTranslations(streamResolution, {
          posterUrl: nextDetail.posterUrl,
          originalDubLabel: t('online.dubs.original'),
          seasonLabelPrefix: t('online.seasonLabel'),
          episodeLabelPrefix: t('online.episodeLabelPrefix'),
        });

        if (streamTranslations.length > 0) {
          setTranslations(streamTranslations);
          setSelectedDubId(streamTranslations[0]?.id ?? null);
          setSelectedSeasonId(streamTranslations[0]?.seasons[0]?.id ?? null);
          return;
        }
      } catch (streamError) {
        console.warn('Primary stream provider unavailable, falling back to Kodik:', streamError);
      }

      try {
        const nextTranslations = await fetchKodikTranslations(animeId, nextDetail.title || nextDetail.originalTitle);

        if (nextTranslations.length > 0) {
          setTranslations(nextTranslations);
          setSelectedDubId(nextTranslations[0]?.id ?? null);
          setSelectedSeasonId(nextTranslations[0]?.seasons[0]?.id ?? null);
          return;
        }

        setTranslations([]);
        setSelectedDubId(null);
        setSelectedSeasonId(null);
      } catch (kodikError) {
        console.error('Kodik fallback failed:', kodikError);
        setTranslations([]);
        setSelectedDubId(null);
        setSelectedSeasonId(null);
      }
    } catch {
      setDetail(null);
      setTranslations([]);
      setSelectedDubId(null);
      setSelectedSeasonId(null);
      setError(t('online.loadTitleErrorCopy'));
    } finally {
      setLoading(false);
    }
  }, [animeId, t]);

  useEffect(() => {
    void loadAnime();
  }, [loadAnime]);

  const activeTranslation = useMemo(
    () => translations.find((item) => item.id === selectedDubId) ?? translations[0] ?? null,
    [selectedDubId, translations]
  );

  useEffect(() => {
    if (!activeTranslation) {
      setSelectedSeasonId(null);
      return;
    }

    const seasonStillExists = activeTranslation.seasons.some((season) => season.id === selectedSeasonId);
    if (!seasonStillExists) {
      setSelectedSeasonId(activeTranslation.seasons[0]?.id ?? null);
    }
  }, [activeTranslation, selectedSeasonId]);

  const activeSeason = useMemo(
    () =>
      activeTranslation?.seasons.find((season) => season.id === selectedSeasonId) ??
      activeTranslation?.seasons[0] ??
      null,
    [activeTranslation, selectedSeasonId]
  );

  const episodeColumns = width >= 1400 ? 7 : width >= 1180 ? 6 : width >= 900 ? 5 : width >= 680 ? 4 : 3;
  const wideLayout = width >= 1040;

  const renderEpisode = ({ item, index }: ListRenderItemInfo<KodikEpisode>) => (
    <EpisodeTile
      item={item}
      index={index}
      onPress={() => {
        const resolvedLink = item.link ?? activeSeason?.link ?? activeTranslation?.playerLink;
        if (!resolvedLink || !detail) {
          return;
        }

        router.push({
          pathname: '/player/webview',
          params: {
            url: resolvedLink,
            title: detail.title,
            subtitle: `${activeTranslation?.title || t('online.dubs.original')} • ${activeSeason?.label || t('online.seasonsTitle')} • ${t('online.episodeLabel', { value: item.number })}`,
          },
        });
      }}
    />
  );

  if (loading) {
    return (
      <LiquidBackground>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={theme.textPrimary} />
          <Text style={[styles.loadingText, { color: theme.textPrimary }]}>{t('online.loading')}</Text>
        </View>
      </LiquidBackground>
    );
  }

  if (error || !detail) {
    return (
      <LiquidBackground>
        <View style={styles.loadingState}>
          <BlurView
            intensity={72}
            tint="dark"
            style={[styles.noticeCard, { borderColor: LIQUID_GLASS_BORDER, backgroundColor: LIQUID_GLASS_BG }]}>
            <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>{t('online.loadTitleError')}</Text>
            <Text style={[styles.noticeBody, { color: theme.textSecondary }]}>
              {error ?? t('online.loadTitleErrorCopy')}
            </Text>
            <Pressable
              onPress={() => {
                router.back();
              }}
              style={[styles.noticeAction, { backgroundColor: theme.surfaceStrong }]}>
              <Text style={[styles.noticeActionLabel, { color: theme.textPrimary }]}>{t('common.back')}</Text>
            </Pressable>
          </BlurView>
        </View>
      </LiquidBackground>
    );
  }

  return (
    <LiquidBackground>
      <FlatList
        data={activeSeason?.episodes ?? []}
        renderItem={renderEpisode}
        keyExtractor={(item) => String(item.id)}
        numColumns={episodeColumns}
        key={`episodes-${episodeColumns}-${activeSeason?.id ?? 'empty'}`}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        columnWrapperStyle={episodeColumns > 1 ? styles.episodeGridRow : undefined}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable
              onPress={() => {
                router.back();
              }}
              style={[styles.backButton, { backgroundColor: theme.surfaceStrong }]}>
              <Ionicons name="chevron-back" size={18} color={theme.textPrimary} />
              <Text style={[styles.backButtonLabel, { color: theme.textPrimary }]}>{t('common.back')}</Text>
            </Pressable>

            <BlurView
              intensity={72}
              tint="dark"
              style={[
                styles.heroCard,
                wideLayout && styles.heroCardWide,
                { borderColor: LIQUID_GLASS_BORDER, backgroundColor: LIQUID_GLASS_BG },
              ]}>
              {detail.posterUrl ? (
                <Image
                  source={{ uri: detail.posterUrl }}
                  style={[styles.poster, wideLayout && styles.posterWide]}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[
                    styles.poster,
                    wideLayout && styles.posterWide,
                    styles.posterFallback,
                    { backgroundColor: theme.surfaceStrong },
                  ]}>
                  <Ionicons name="image-outline" size={34} color={theme.textPrimary} />
                </View>
              )}

              <View style={styles.heroCopy}>
                <Text style={[styles.heroTitle, { color: theme.textPrimary }]}>{detail.title}</Text>
                <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>{detail.originalTitle}</Text>

                <View style={styles.metaRow}>
                  <MetadataChip icon="star" label={detail.score} />
                  <MetadataChip icon="film-outline" label={String(detail.episodes || detail.episodesAired || 0)} />
                  <MetadataChip icon="layers-outline" label={detail.kind} />
                </View>

                <Text style={[styles.description, { color: theme.textSecondary }]}>{detail.description}</Text>

                {detail.genres.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genresRow}>
                    {detail.genres.map((genre) => (
                      <View
                        key={genre}
                        style={[styles.genreBadge, { backgroundColor: theme.surfaceMuted, borderColor: theme.cardBorder }]}>
                        <Text style={[styles.genreBadgeLabel, { color: theme.textPrimary }]}>{genre}</Text>
                      </View>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            </BlurView>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{t('online.dubbingTitle')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorRow}>
                {translations.map((translation) => (
                  <SelectorChip
                    key={translation.id}
                    label={translation.title}
                    active={translation.id === activeTranslation?.id}
                    onPress={() => {
                      setSelectedDubId(translation.id);
                    }}
                  />
                ))}
              </ScrollView>
            </View>

            {activeTranslation?.seasons.length ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{t('online.seasonsTitle')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorRow}>
                  {activeTranslation.seasons.map((season: KodikSeason) => (
                    <SelectorChip
                      key={season.id}
                      label={season.label}
                      active={season.id === activeSeason?.id}
                      onPress={() => {
                        setSelectedSeasonId(season.id);
                      }}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{t('online.episodesTitle')}</Text>
              <View style={[styles.counterBadge, { backgroundColor: theme.surfaceStrong }]}>
                <Text style={[styles.counterBadgeLabel, { color: theme.textPrimary }]}>
                  {activeSeason?.episodes.length ?? 0}
                </Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <BlurView
            intensity={72}
            tint="dark"
            style={[styles.noticeCard, { borderColor: LIQUID_GLASS_BORDER, backgroundColor: LIQUID_GLASS_BG }]}>
            <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>{t('online.emptyEpisodesTitle')}</Text>
            <Text style={[styles.noticeBody, { color: theme.textSecondary }]}>
              {t('online.emptyEpisodesCopy')}
            </Text>
          </BlurView>
        }
      />
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '700',
  },
  header: {
    gap: 18,
    marginBottom: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButtonLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 18,
    gap: 18,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  heroCardWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  poster: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: 16,
  },
  posterWide: {
    width: 260,
    flexShrink: 0,
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
    gap: 12,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  heroSubtitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaChip: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaChipLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
  },
  genresRow: {
    gap: 10,
  },
  genreBadge: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genreBadgeLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  selectorRow: {
    gap: 10,
    paddingRight: 6,
  },
  selectorChip: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorChipLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counterBadge: {
    minWidth: 40,
    minHeight: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  counterBadgeLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  episodeGridRow: {
    gap: 10,
    marginBottom: 10,
  },
  episodeTileWrap: {
    flex: 1,
    marginBottom: 10,
    maxWidth: 104,
  },
  episodeTile: {
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  episodeNumberBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeNumberText: {
    fontSize: 15,
    fontWeight: '900',
  },
  episodeTileTitle: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  noticeCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    gap: 10,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  noticeBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  noticeAction: {
    marginTop: 6,
    alignSelf: 'flex-start',
    minHeight: 42,
    borderRadius: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeActionLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
});
