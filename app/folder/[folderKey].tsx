import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, ListRenderItemInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useApp } from '@/src/providers/app-provider';
import { LIQUID_COLORS } from '@/src/theme/liquid';
import { LibraryVideo } from '@/src/types/media';
import { formatClock } from '@/src/utils/time';

function EpisodeRow({
  item,
  onPress,
}: {
  item: LibraryVideo;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <GlassCard style={styles.episodeCard}>
        <View style={styles.iconWrap}>
          <Ionicons name="play" size={18} color={LIQUID_COLORS.textPrimary} />
        </View>

        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={2}>
            {item.displayTitle}
          </Text>
          <Text style={styles.meta}>
            {item.durationSeconds > 0 ? formatClock(item.durationSeconds * 1000) : 'Відео'} • {item.albumTitle}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color={LIQUID_COLORS.textMuted} />
      </GlassCard>
    </Pressable>
  );
}

export default function FolderScreen() {
  const params = useLocalSearchParams<{ folderKey?: string | string[] }>();
  const folderKey = Array.isArray(params.folderKey) ? params.folderKey[0] : params.folderKey;
  const { getLibraryFolder } = useApp();
  const folder = folderKey ? getLibraryFolder(folderKey) : undefined;

  const renderItem = ({ item }: ListRenderItemInfo<LibraryVideo>) => (
    <EpisodeRow
      item={item}
      onPress={() => {
        router.push({
          pathname: '/player/[source]/[id]',
          params: {
            source: 'library',
            id: item.id,
          },
        });
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
          <Text style={styles.eyebrow}>Папка</Text>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {folder?.title ?? 'Невідома папка'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {folder ? `${folder.videos.length} відео` : 'Поверніться до бібліотеки та відкрийте іншу папку.'}
          </Text>
        </View>
      </View>

      {folder ? (
        <FlatList
          data={folder.videos}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={8}
          removeClippedSubviews
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      ) : (
        <GlassCard style={styles.missingCard}>
          <Text style={styles.missingTitle}>Папку не знайдено</Text>
          <Text style={styles.missingCopy}>Спробуйте оновити бібліотеку на головній вкладці.</Text>
        </GlassCard>
      )}
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  episodeCard: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  meta: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 12,
  },
  missingCard: {
    marginHorizontal: 20,
    padding: 20,
    gap: 8,
  },
  missingTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  missingCopy: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
