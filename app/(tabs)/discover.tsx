import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useApp } from '@/src/providers/app-provider';
import { fetchTrendingCatalog, searchCatalog, type CatalogAnime } from '@/src/services/online-catalog';

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

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 45).springify()}
      layout={LinearTransition.springify().damping(18).stiffness(180)}
      style={styles.cardShell}>
      <Pressable onPress={onPress}>
        <BlurView
          intensity={40}
          tint="dark"
          style={[styles.card, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
          <View style={styles.posterShell}>
            {item.posterUrl ? (
              <Image source={{ uri: item.posterUrl }} style={styles.poster} contentFit="cover" />
            ) : (
              <View style={[styles.poster, styles.posterFallback, { backgroundColor: theme.surfaceStrong }]}>
                <Ionicons name="image-outline" size={24} color={theme.textPrimary} />
              </View>
            )}

            <View style={[styles.scoreBadge, { backgroundColor: theme.surfaceStrong }]}>
              <Ionicons name="star" size={12} color={theme.accentPrimary} />
              <Text style={[styles.scoreBadgeLabel, { color: theme.textPrimary }]}>{item.score}</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.cardMeta, { color: theme.textSecondary }]} numberOfLines={1}>
              {item.episodesAired || item.episodes || 0} серий
            </Text>
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

export default function DiscoverTabScreen() {
  const { theme } = useApp();
  const [items, setItems] = useState<CatalogAnime[]>([]);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async (nextQuery?: string) => {
    const trimmedQuery = (nextQuery ?? activeQuery).trim();
    setError(null);
    setRefreshing(true);

    try {
      const nextItems = trimmedQuery ? await searchCatalog(trimmedQuery) : await fetchTrendingCatalog();
      setItems(nextItems);
      setActiveQuery(trimmedQuery);
    } catch {
      setError('Не удалось загрузить каталог.');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeQuery]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

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
          <Text style={[styles.loadingText, { color: theme.textPrimary }]}>Загружаю каталог...</Text>
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
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onRefresh={() => {
          void loadCatalog();
        }}
        refreshing={refreshing}
        ListHeaderComponent={
          <View style={styles.header}>
            <BlurView
              intensity={40}
              tint="dark"
              style={[styles.heroCard, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
              <Image
                source={require('../../assets/images/icon.png')}
                style={styles.heroIcon}
                contentFit="cover"
              />
              <View style={styles.heroCopy}>
                <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>Premium catalog</Text>
                <Text style={[styles.title, { color: theme.textPrimary }]}>Online</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  Shikimori даёт метаданные, Kodik даёт озвучки и эпизоды. Открой тайтл и выбери нужный дуб.
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
            </BlurView>

            <BlurView
              intensity={40}
              tint="dark"
              style={[styles.searchCard, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
              <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => {
                  void loadCatalog(query);
                }}
                placeholder="Поиск аниме..."
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
            </BlurView>

            {error ? (
              <BlurView
                intensity={40}
                tint="dark"
                style={[styles.noticeCard, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
                <Ionicons name="warning-outline" size={18} color={theme.warning} />
                <Text style={[styles.noticeText, { color: theme.textSecondary }]}>{error}</Text>
              </BlurView>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <BlurView
            intensity={40}
            tint="dark"
            style={[styles.emptyCard, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
            <Ionicons name="film-outline" size={28} color={theme.textPrimary} />
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Каталог пуст</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Сейчас Shikimori не вернул доступные тайтлы.
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
    gap: 14,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '700',
  },
  header: {
    marginBottom: 20,
    gap: 14,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 18,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
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
  noticeCard: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  searchCard: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  },
  cardShell: {
    flex: 1,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  posterShell: {
    position: 'relative',
  },
  poster: {
    width: '100%',
    aspectRatio: 0.72,
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
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  cardMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    marginTop: 40,
    borderWidth: 1,
    borderRadius: 24,
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
