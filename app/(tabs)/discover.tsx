import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useApp } from '@/src/providers/app-provider';

type ShikimoriAnime = {
  id: number;
  name: string;
  russian: string;
  score: string;
  episodes: number;
  episodes_aired: number;
  image?: {
    original?: string;
  };
};

const SHIKIMORI_BASE_URL = 'https://shikimori.one';
const TRENDING_URL = `${SHIKIMORI_BASE_URL}/api/animes?limit=20&order=popularity`;
const SEARCH_URL = `${SHIKIMORI_BASE_URL}/api/animes`;
const PRIMARY_TEXT = '#FFFFFF';
const SECONDARY_TEXT = '#A0A0A0';

function buildPosterUrl(path?: string) {
  if (!path) {
    return null;
  }

  return `${SHIKIMORI_BASE_URL}${path}`;
}

async function fetchCatalog(query?: string) {
  const response = await fetch(
    query?.trim()
      ? `${SEARCH_URL}?search=${encodeURIComponent(query.trim())}&limit=20`
      : TRENDING_URL,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ShikimoriAnime[];
  return Array.isArray(payload) ? payload : [];
}

function DiscoverCard({
  item,
  index,
  onPress,
}: {
  item: ShikimoriAnime;
  index: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useApp();
  const title = item.russian || item.name || t('discover.unknownTitle');
  const posterUri = buildPosterUrl(item.image?.original);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).springify()}
      layout={LinearTransition.springify().damping(18).stiffness(180)}
      style={styles.cardShell}>
      <Pressable onPress={onPress}>
        <BlurView intensity={40} tint="dark" style={styles.card}>
          <View style={styles.posterWrap}>
            {posterUri ? (
              <Image source={{ uri: posterUri }} style={styles.poster} contentFit="cover" />
            ) : (
              <View style={[styles.poster, styles.posterFallback, { backgroundColor: theme.surfaceStrong }]}>
                <Ionicons name="sparkles-outline" size={28} color={theme.accentPrimary} />
              </View>
            )}

            <View style={styles.scoreBadge}>
              <Ionicons name="star" size={12} color={theme.accentPrimary} />
              <Text style={styles.scoreBadgeLabel}>{item.score || '0.0'}</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {t('discover.episodesCount', {
                count: item.episodes_aired || item.episodes || 0,
                defaultValue: `${item.episodes_aired || item.episodes || 0} episodes`,
              })}
            </Text>
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

function SuggestionRow({
  item,
  onPress,
}: {
  item: ShikimoriAnime;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const title = item.russian || item.name || t('discover.unknownTitle');
  const posterUri = buildPosterUrl(item.image?.original);

  return (
    <Pressable onPress={onPress} style={styles.suggestionRow}>
      {posterUri ? (
        <Image source={{ uri: posterUri }} style={styles.suggestionThumb} contentFit="cover" />
      ) : (
        <View style={styles.suggestionThumbFallback}>
          <Ionicons name="sparkles-outline" size={16} color={PRIMARY_TEXT} />
        </View>
      )}
      <View style={styles.suggestionCopy}>
        <Text style={styles.suggestionTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.suggestionMeta} numberOfLines={1}>
          {item.score || '0.0'} • {item.episodes_aired || item.episodes || 0}
        </Text>
      </View>
      <Ionicons name="arrow-forward" size={16} color={SECONDARY_TEXT} />
    </Pressable>
  );
}

export default function DiscoverTabScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { theme } = useApp();
  const [items, setItems] = useState<ShikimoriAnime[]>([]);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ShikimoriAnime[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestionAbortRef = useRef<AbortController | null>(null);

  const loadCatalog = useCallback(
    async (nextQuery?: string) => {
      const resolvedQuery = (nextQuery ?? activeQuery).trim();
      setError(null);
      setRefreshing(true);
      setLoading((current) => current && items.length === 0);

      try {
        const results = await fetchCatalog(resolvedQuery);
        setItems(results);
        setActiveQuery(resolvedQuery);
      } catch {
        setError(t('discover.loadError', { defaultValue: 'Unable to load the Shikimori catalog.' }));
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeQuery, items.length, t]
  );

  useFocusEffect(
    useCallback(() => {
      if (items.length === 0) {
        void loadCatalog();
      }
    }, [items.length, loadCatalog])
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
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      suggestionAbortRef.current?.abort();
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    const controller = new AbortController();
    suggestionAbortRef.current?.abort();
    suggestionAbortRef.current = controller;

    const timeout = setTimeout(() => {
      setSuggestionsLoading(true);

      void (async () => {
        try {
          const results = await fetchCatalog(trimmed);
          if (!controller.signal.aborted) {
            setSuggestions(results.slice(0, 6));
            setShowSuggestions(true);
          }
        } catch {
          if (!controller.signal.aborted) {
            setSuggestions([]);
          }
        } finally {
          if (!controller.signal.aborted) {
            setSuggestionsLoading(false);
          }
        }
      })();
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const renderItem = ({ item, index }: ListRenderItemInfo<ShikimoriAnime>) => (
    <DiscoverCard
      item={item}
      index={index}
      onPress={() => {
        setShowSuggestions(false);
        router.push({
          pathname: '/online/[id]',
          params: {
            id: String(item.id),
          },
        });
      }}
    />
  );

  const heroLabel = useMemo(
    () => (activeQuery ? `"${activeQuery}"` : t('discover.trending', { defaultValue: 'Trending now' })),
    [activeQuery, t]
  );

  return (
    <LiquidBackground>
      <View style={styles.screen}>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={theme.textPrimary} />
            <Text style={styles.stateTitle}>{t('discover.loading', { defaultValue: 'Loading trending anime' })}</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={[styles.listContent, items.length === 0 && styles.listContentEmpty]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onRefresh={() => {
              void loadCatalog();
            }}
            refreshing={refreshing}
            ListHeaderComponent={
              <Animated.View entering={FadeInDown.duration(420)} style={styles.header}>
                <View style={styles.headerRow}>
                  <View style={styles.headerCopy}>
                    <Image source={require('../../assets/images/icon.png')} style={styles.appIcon} contentFit="cover" />
                    <Text style={styles.eyebrow}>{t('discover.eyebrow', { defaultValue: 'Online discovery' })}</Text>
                    <Text style={styles.title}>{t('discover.title', { defaultValue: 'Discover' })}</Text>
                    <Text style={styles.subtitle}>
                      {t('discover.subtitle', {
                        defaultValue: 'Search the Shikimori catalog, pick a season, and launch streaming in a premium VOD flow.',
                      })}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => {
                      void loadCatalog();
                    }}
                    style={styles.refreshButton}>
                    {refreshing ? (
                      <ActivityIndicator size="small" color={PRIMARY_TEXT} />
                    ) : (
                      <Ionicons name="refresh" size={18} color={PRIMARY_TEXT} />
                    )}
                  </Pressable>
                </View>

                <View style={styles.searchWrap}>
                  <BlurView intensity={40} tint="dark" style={styles.searchCard}>
                    <Ionicons name="search-outline" size={18} color={theme.textMuted} />
                    <TextInput
                      value={query}
                      onChangeText={(value) => {
                        setQuery(value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => {
                        if (suggestions.length > 0) {
                          setShowSuggestions(true);
                        }
                      }}
                      onSubmitEditing={() => {
                        setShowSuggestions(false);
                        void loadCatalog(query);
                      }}
                      placeholder={t('discover.searchPlaceholder', { defaultValue: 'Search anime, studios, characters...' })}
                      placeholderTextColor={SECONDARY_TEXT}
                      style={styles.searchInput}
                      returnKeyType="search"
                    />
                    <Pressable
                      onPress={() => {
                        setShowSuggestions(false);
                        void loadCatalog(query);
                      }}
                      style={[styles.searchButton, { backgroundColor: theme.surfaceStrong }]}>
                      <Ionicons name="arrow-forward" size={16} color={theme.textPrimary} />
                    </Pressable>
                  </BlurView>

                  {showSuggestions && (suggestionsLoading || suggestions.length > 0) ? (
                    <BlurView intensity={48} tint="dark" style={styles.suggestionsCard}>
                      {suggestionsLoading ? (
                        <View style={styles.suggestionsLoader}>
                          <ActivityIndicator size="small" color={theme.textPrimary} />
                        </View>
                      ) : (
                        suggestions.map((item) => (
                          <SuggestionRow
                            key={item.id}
                            item={item}
                            onPress={() => {
                              setQuery(item.russian || item.name || '');
                              setShowSuggestions(false);
                              router.push({
                                pathname: '/online/[id]',
                                params: {
                                  id: String(item.id),
                                },
                              });
                            }}
                          />
                        ))
                      )}
                    </BlurView>
                  ) : null}
                </View>

                <BlurView intensity={40} tint="dark" style={styles.heroCard}>
                  <View style={styles.heroBadge}>
                    <Ionicons name="radio-outline" size={14} color={theme.accentPrimary} />
                    <Text style={styles.heroBadgeLabel}>
                      {t('discover.mockBadge', { defaultValue: 'Live catalog' })}
                    </Text>
                  </View>
                  <Text style={styles.heroTitle}>{heroLabel}</Text>
                  <Text style={styles.heroSubtitle}>
                    {activeQuery
                      ? t('discover.openTitle', { defaultValue: 'Tap any card to open seasons, streams, and comments.' })
                      : t('discover.trendingCopy', {
                          defaultValue: 'Fresh popularity feed from Shikimori with live search and instant suggestions.',
                        })}
                  </Text>
                </BlurView>

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
                  <Ionicons name="cloud-offline-outline" size={30} color={theme.textPrimary} />
                  <Text style={styles.emptyTitle}>
                    {t('discover.emptyTitle', { defaultValue: 'Nothing matched your search' })}
                  </Text>
                  <Text style={styles.emptyCopy}>
                    {t('discover.emptyCopy', {
                      defaultValue: 'Try a different title, franchise name, or switch back to the trending feed.',
                    })}
                  </Text>
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
  listContent: {
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  header: {
    marginBottom: 22,
  },
  headerRow: {
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
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  title: {
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
    maxWidth: 330,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchWrap: {
    marginTop: 18,
    gap: 10,
  },
  searchCard: {
    minHeight: 60,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 28, 0.42)',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    color: PRIMARY_TEXT,
    fontSize: 15,
    fontWeight: '700',
  },
  searchButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionsCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 28, 0.58)',
    overflow: 'hidden',
  },
  suggestionsLoader: {
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  suggestionThumb: {
    width: 42,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  suggestionThumbFallback: {
    width: 42,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  suggestionCopy: {
    flex: 1,
  },
  suggestionTitle: {
    color: PRIMARY_TEXT,
    fontSize: 14,
    fontWeight: '800',
  },
  suggestionMeta: {
    marginTop: 4,
    color: SECONDARY_TEXT,
    fontSize: 12,
    fontWeight: '600',
  },
  heroCard: {
    marginTop: 16,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 28, 0.42)',
    padding: 18,
    gap: 10,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroBadgeLabel: {
    color: PRIMARY_TEXT,
    fontSize: 12,
    fontWeight: '800',
  },
  heroTitle: {
    color: PRIMARY_TEXT,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  heroSubtitle: {
    color: SECONDARY_TEXT,
    fontSize: 14,
    lineHeight: 20,
  },
  noticeCard: {
    marginTop: 14,
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
  gridRow: {
    gap: 14,
    marginBottom: 14,
  },
  cardShell: {
    flex: 1,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 28, 0.42)',
    overflow: 'hidden',
  },
  posterWrap: {
    position: 'relative',
  },
  poster: {
    width: '100%',
    aspectRatio: 0.72,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(5, 8, 18, 0.74)',
  },
  scoreBadgeLabel: {
    color: PRIMARY_TEXT,
    fontSize: 12,
    fontWeight: '800',
  },
  cardBody: {
    padding: 14,
    gap: 6,
  },
  cardTitle: {
    color: PRIMARY_TEXT,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  cardMeta: {
    color: SECONDARY_TEXT,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 40,
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
});
