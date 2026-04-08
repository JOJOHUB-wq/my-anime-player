import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';

import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useApp } from '@/src/providers/app-provider';
import { useAuth } from '@/src/providers/auth-provider';
import { fetchTrendingCatalog, searchCatalog, type CatalogAnime } from '@/src/services/online-catalog';

const GLASS_INTENSITY = 70;
const LIQUID_GLASS_BG = 'rgba(11, 16, 30, 0.42)';
const LIQUID_GLASS_BORDER = 'rgba(255, 255, 255, 0.2)';

function GlassPanel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <BlurView intensity={GLASS_INTENSITY} tint="dark" style={[styles.glassPanel, style]}>
      {children}
    </BlurView>
  );
}

function CatalogCard({
  item,
  index,
  onPress,
}: {
  item: CatalogAnime;
  index: number;
  onPress: () => void;
}) {
  const { theme } = useApp();
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 45).springify()}
      layout={LinearTransition.springify().damping(18).stiffness(180)}
      style={styles.cardShell}>
      <Pressable onPress={onPress}>
        <GlassPanel style={styles.card}>
          <View style={styles.posterShell}>
            {item.posterUrl ? (
              <Image source={{ uri: item.posterUrl }} style={styles.poster} contentFit="cover" />
            ) : (
              <View style={[styles.poster, styles.posterFallback, { backgroundColor: theme.surfaceStrong }]}>
                <Ionicons name="image-outline" size={24} color={theme.textPrimary} />
              </View>
            )}

            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.85)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />

            <View style={[styles.scoreBadge, { backgroundColor: theme.surfaceStrong }]}>
              <Ionicons name="star" size={12} color={theme.accentPrimary} />
              <Text style={[styles.scoreBadgeLabel, { color: theme.textPrimary }]}>{item.score}</Text>
            </View>

            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: '#FFFFFF' }]} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={[styles.cardMeta, { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>
                {t('discover.episodesCount', { count: item.episodesAired || item.episodes || 0 })}
              </Text>
            </View>
          </View>
        </GlassPanel>
      </Pressable>
    </Animated.View>
  );
}

export default function DiscoverTabScreen() {
  const { theme } = useApp();
  const { t } = useTranslation();
  const { user } = useAuth();

  const allowHentai = useMemo(() => {
    return typeof user?.age === 'number' && user.age >= 18;
  }, [user?.age]);

  const [items, setItems] = useState<CatalogAnime[]>([]);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CatalogAnime[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showSuggestions = useMemo(
    () => query.trim().length > 0 && (suggestionsLoading || suggestions.length > 0),
    [query, suggestions, suggestionsLoading]
  );

  const loadCatalog = useCallback(
    async (nextQuery?: string) => {
      const trimmedQuery = (nextQuery ?? activeQuery).trim();
      setError(null);
      setRefreshing(true);

      try {
        const nextItems = trimmedQuery
          ? await searchCatalog(trimmedQuery, allowHentai)
          : await fetchTrendingCatalog(allowHentai);
        setItems(nextItems);
        setActiveQuery(trimmedQuery);
      } catch {
        setError(t('discover.loadError'));
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeQuery, allowHentai, t]
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    let active = true;
    const timeoutId = setTimeout(() => {
      void (async () => {
        setSuggestionsLoading(true);

        try {
          const results = await searchCatalog(trimmed, allowHentai);
          if (active) {
            setSuggestions(results.slice(0, 6));
          }
        } catch {
          if (active) {
            setSuggestions([]);
          }
        } finally {
          if (active) {
            setSuggestionsLoading(false);
          }
        }
      })();
    }, 220);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [query, allowHentai]);

  const renderItem = ({ item, index }: ListRenderItemInfo<CatalogAnime>) => (
    <CatalogCard
      item={item}
      index={index}
      onPress={() => {
        router.push({
          pathname: '/online/[id]',
          params: {
            id: String(item.id),
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

  return (
    <LiquidBackground>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        style={styles.list}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        ListHeaderComponentStyle={styles.headerShell}
        onRefresh={() => {
          void loadCatalog();
        }}
        refreshing={refreshing}
        ListHeaderComponent={
          <View style={styles.header}>
            <GlassPanel style={styles.heroCard}>
              <Image
                source={require('../../assets/images/icon.png')}
                style={styles.heroIcon}
                contentFit="cover"
              />
              <View style={styles.heroCopy}>
                <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>{t('discover.heroEyebrow')}</Text>
                <Text style={[styles.title, { color: theme.textPrimary }]}>{t('tabs.discover')}</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  {t('discover.heroSubtitle')}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  void loadCatalog();
                }}
                style={[styles.heroAction, { backgroundColor: theme.surfaceStrong }]}>
                {refreshing ? (
                  <ActivityIndicator size="small" color={theme.textPrimary} />
                ) : (
                  <Ionicons name="refresh" size={18} color={theme.textPrimary} />
                )}
              </Pressable>
            </GlassPanel>

            <View style={styles.searchWrap}>
              <GlassPanel style={styles.searchCard}>
                <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => {
                    setSuggestions([]);
                    void loadCatalog(query);
                  }}
                  placeholder={t('discover.searchPlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.searchInput, { color: theme.textPrimary }]}
                />
                {query ? (
                  <Pressable
                    onPress={() => {
                      setQuery('');
                      setSuggestions([]);
                      void loadCatalog('');
                    }}
                    style={[styles.searchAction, { backgroundColor: theme.surfaceStrong }]}>
                    <Ionicons name="close" size={16} color={theme.textPrimary} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => {
                      void loadCatalog(query);
                    }}
                    style={[styles.searchAction, { backgroundColor: theme.surfaceStrong }]}>
                    <Ionicons name="arrow-forward" size={16} color={theme.textPrimary} />
                  </Pressable>
                )}
              </GlassPanel>

              {showSuggestions ? (
                <GlassPanel style={styles.searchDropdown}>
                  <FlatList
                    data={suggestions}
                    keyExtractor={(item) => `suggestion-${item.id}`}
                    keyboardShouldPersistTaps="handled"
                    scrollEnabled={false}
                    ListEmptyComponent={
                      <View style={styles.suggestionEmpty}>
                        <Text style={[styles.suggestionEmptyText, { color: theme.textSecondary }]}>
                          {t('discover.suggestionsEmpty')}
                        </Text>
                      </View>
                    }
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => {
                          setQuery(item.title);
                          setSuggestions([]);
                          router.push({
                            pathname: '/online/[id]',
                            params: { id: String(item.id) },
                          });
                        }}
                        style={styles.suggestionRow}>
                        {item.posterUrl ? (
                          <Image source={{ uri: item.posterUrl }} style={styles.suggestionThumb} contentFit="cover" />
                        ) : (
                          <View style={[styles.suggestionThumb, { backgroundColor: theme.surfaceStrong }]} />
                        )}
                        <View style={styles.suggestionCopy}>
                          <Text style={[styles.suggestionTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={[styles.suggestionMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                            {t('discover.episodesCount', { count: item.episodesAired || item.episodes || 0 })}
                          </Text>
                        </View>
                      </Pressable>
                    )}
                  />
                </GlassPanel>
              ) : null}
            </View>

            {error ? (
              <GlassPanel style={styles.noticeCard}>
                <Ionicons name="warning-outline" size={18} color={theme.warning} />
                <Text style={[styles.noticeText, { color: theme.textSecondary }]}>{error}</Text>
              </GlassPanel>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <GlassPanel style={styles.emptyCard}>
            <Ionicons name="film-outline" size={28} color={theme.textPrimary} />
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{t('discover.emptyTitle')}</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {t('discover.emptyCopy')}
            </Text>
          </GlassPanel>
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
    overflow: 'visible',
  },
  glassPanel: {
    borderWidth: 1,
    borderColor: LIQUID_GLASS_BORDER,
    borderRadius: 16,
    backgroundColor: LIQUID_GLASS_BG,
    overflow: 'hidden',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '700',
  },
  header: {
    marginBottom: 20,
    gap: 14,
    zIndex: 9999,
    elevation: 10,
    overflow: 'visible',
  },
  headerShell: {
    zIndex: 9999,
    elevation: 10,
    overflow: 'visible',
  },
  heroCard: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  heroAction: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    position: 'relative',
    zIndex: 9999,
    elevation: 10,
    overflow: 'visible',
  },
  searchCard: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  list: {
    zIndex: -1,
    elevation: 0,
    overflow: 'visible',
  },
  searchDropdown: {
    position: 'absolute',
    top: 64,
    zIndex: 9999,
    elevation: 10,
    width: '100%',
  },
  suggestionRow: {
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  suggestionThumb: {
    width: 38,
    height: 52,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  suggestionCopy: {
    flex: 1,
    minWidth: 0,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  suggestionMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  suggestionEmpty: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  suggestionEmptyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  noticeCard: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  searchAction: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridRow: {
    gap: 14,
    marginBottom: 14,
    zIndex: -1,
  },
  cardShell: {
    flex: 1,
    zIndex: -1,
  },
  card: {},
  posterShell: {
    position: 'relative',
  },
  poster: {
    width: '100%',
    aspectRatio: 0.666, /* 2:3 ratio */
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scoreBadgeLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  cardBody: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 40,
    paddingBottom: 14,
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardMeta: {
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  emptyCard: {
    marginTop: 40,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
});
