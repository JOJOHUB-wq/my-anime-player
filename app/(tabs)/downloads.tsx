import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useApp } from '@/src/providers/app-provider';
import { LIQUID_COLORS } from '@/src/theme/liquid';
import { DownloadRecord } from '@/src/types/media';
import { formatClock } from '@/src/utils/time';

function DownloadRow({
  item,
  onPress,
}: {
  item: DownloadRecord;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <GlassCard style={styles.downloadCard}>
        <View style={styles.downloadIconWrap}>
          <Ionicons name="download-outline" size={18} color={LIQUID_COLORS.accentBlue} />
        </View>

        <View style={styles.downloadCopy}>
          <Text style={styles.downloadTitle} numberOfLines={2}>
            {item.cleanedTitle}
          </Text>
          <Text style={styles.downloadMeta} numberOfLines={1}>
            {item.filename}
          </Text>
          <Text style={styles.downloadProgress}>
            Перегляд: {formatClock(item.watchedProgress * 1000)}
          </Text>
        </View>

        <Ionicons name="play-circle-outline" size={24} color={LIQUID_COLORS.textPrimary} />
      </GlassCard>
    </Pressable>
  );
}

export default function DownloadsTabScreen() {
  const {
    downloads,
    downloadsLoading,
    downloadsError,
    refreshDownloads,
  } = useApp();

  const renderItem = ({ item }: ListRenderItemInfo<DownloadRecord>) => (
    <DownloadRow
      item={item}
      onPress={() => {
        router.push({
          pathname: '/player/[source]/[id]',
          params: {
            source: 'download',
            id: item.id,
          },
        });
      }}
    />
  );

  return (
    <LiquidBackground>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Локальне сховище</Text>
          <Text style={styles.title}>Файли</Text>
          <Text style={styles.subtitle}>Усі імпортовані відео збережені в `documentDirectory` і зареєстровані в SQLite.</Text>
        </View>

        <Pressable
          onPress={() => {
            void refreshDownloads();
          }}
          style={styles.headerButton}>
          <Ionicons name="refresh" size={18} color={LIQUID_COLORS.textPrimary} />
        </Pressable>
      </View>

      {downloadsError ? (
        <GlassCard style={styles.messageCard}>
          <Text style={styles.errorText}>{downloadsError}</Text>
        </GlassCard>
      ) : null}

      {downloadsLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={LIQUID_COLORS.textPrimary} />
          <Text style={styles.stateTitle}>Читаю SQLite</Text>
        </View>
      ) : (
        <FlatList
          data={downloads}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={8}
          removeClippedSubviews
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <GlassCard style={styles.messageCard}>
              <Text style={styles.emptyTitle}>Файлів ще немає</Text>
              <Text style={styles.emptyCopy}>Імпортуйте відео у вкладці бібліотеки, і вони з’являться тут.</Text>
            </GlassCard>
          }
        />
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
    justifyContent: 'space-between',
    gap: 16,
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
    maxWidth: 280,
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
  downloadCard: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  downloadIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  downloadCopy: {
    flex: 1,
    gap: 4,
  },
  downloadTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  downloadMeta: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 12,
  },
  downloadProgress: {
    color: LIQUID_COLORS.textMuted,
    fontSize: 12,
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
});
