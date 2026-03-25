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

function resolveIdParam(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 24).springify()}
      layout={LinearTransition.springify().damping(18).stiffness(180)}
      style={styles.episodeTileWrap}>
      <Pressable onPress={onPress}>
        <BlurView
          intensity={40}
          tint="dark"
          style={[styles.episodeTile, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
          <View style={[styles.episodeNumberBadge, { backgroundColor: theme.surfaceStrong }]}>
            <Text style={[styles.episodeNumberText, { color: theme.textPrimary }]}>{item.number}</Text>
          </View>

          <View style={styles.episodeTileCopy}>
            <Text style={[styles.episodeTileTitle, { color: theme.textPrimary }]} numberOfLines={2}>
              {item.title || `Episode ${item.number}`}
            </Text>
            <Text style={[styles.episodeTileMeta, { color: theme.textSecondary }]} numberOfLines={1}>
              Серия {item.number}
            </Text>
          </View>

          <Ionicons name="play-circle" size={24} color={theme.accentPrimary} />
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

export default function OnlineAnimeDetailScreen() {
  const { theme } = useApp();
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
      setError('Тайтл не найден.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextDetail = await fetchAnimeDetail(animeId);
      setDetail(nextDetail);

      try {
        const nextTranslations = await fetchKodikTranslations(
          animeId,
          nextDetail.title || nextDetail.originalTitle
        );

        setTranslations(nextTranslations);
        setSelectedDubId(nextTranslations[0]?.id ?? null);
        setSelectedSeasonId(nextTranslations[0]?.seasons[0]?.id ?? null);
      } catch {
        setTranslations([]);
        setSelectedDubId(null);
        setSelectedSeasonId(null);
      }
    } catch {
      setDetail(null);
      setTranslations([]);
      setSelectedDubId(null);
      setSelectedSeasonId(null);
      setError('Не удалось загрузить тайтл или озвучки Kodik.');
    } finally {
      setLoading(false);
    }
  }, [animeId]);

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
    () => activeTranslation?.seasons.find((season) => season.id === selectedSeasonId) ?? activeTranslation?.seasons[0] ?? null,
    [activeTranslation, selectedSeasonId]
  );

  const episodeColumns = width >= 1440 ? 5 : width >= 1180 ? 4 : width >= 860 ? 3 : 2;
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
            subtitle: `${activeTranslation?.title || 'Original'} • ${activeSeason?.label || 'Season 1'} • Episode ${item.number}`,
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
          <Text style={[styles.loadingText, { color: theme.textPrimary }]}>Загружаю каталог...</Text>
        </View>
      </LiquidBackground>
    );
  }

  if (error || !detail) {
    return (
      <LiquidBackground>
        <View style={styles.loadingState}>
          <BlurView
            intensity={40}
            tint="dark"
            style={[styles.noticeCard, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>Ошибка загрузки</Text>
            <Text style={[styles.noticeBody, { color: theme.textSecondary }]}>
              {error ?? 'Не удалось открыть тайтл.'}
            </Text>
            <Pressable
              onPress={() => {
                router.back();
              }}
              style={[styles.noticeAction, { backgroundColor: theme.surfaceStrong }]}>
              <Text style={[styles.noticeActionLabel, { color: theme.textPrimary }]}>Назад</Text>
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
        keyExtractor={(item) => item.id}
        numColumns={episodeColumns}
        key={`episodes-${episodeColumns}-${activeSeason?.id ?? 'empty'}`}
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
              <Text style={[styles.backButtonLabel, { color: theme.textPrimary }]}>Назад</Text>
            </Pressable>

            <BlurView
              intensity={40}
              tint="dark"
              style={[
                styles.heroCard,
                wideLayout && styles.heroCardWide,
                { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground },
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
                  <MetadataChip icon="film-outline" label={`${detail.episodes || detail.episodesAired || 0} eps`} />
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
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Озвучка / Язык</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectorRow}>
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
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Сезоны / Франшиза</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.selectorRow}>
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
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Эпизоды</Text>
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
            intensity={40}
            tint="dark"
            style={[styles.noticeCard, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>Эпизоды недоступны</Text>
            <Text style={[styles.noticeBody, { color: theme.textSecondary }]}>
              Kodik не вернул пригодные ссылки для этой озвучки или сезона.
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
    borderRadius: 14,
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
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 18,
    gap: 18,
  },
  heroCardWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  poster: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: 22,
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
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorChipLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counterBadge: {
    minWidth: 40,
    minHeight: 32,
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
    gap: 12,
    marginBottom: 12,
  },
  episodeTileWrap: {
    flex: 1,
    marginBottom: 12,
  },
  episodeTile: {
    minHeight: 108,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  episodeNumberBadge: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeNumberText: {
    fontSize: 16,
    fontWeight: '900',
  },
  episodeTileCopy: {
    flex: 1,
    gap: 6,
  },
  episodeTileTitle: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  episodeTileMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  noticeCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    gap: 10,
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
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeActionLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
});
