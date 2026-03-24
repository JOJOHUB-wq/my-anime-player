import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { getAllVideos, initializeDatabase, parseImportedFilename, type VideoRow } from '@/src/db/database';
import { useAuth } from '@/src/providers/auth-provider';
import { useApp } from '@/src/providers/app-provider';

function formatHours(seconds: number) {
  const hours = seconds / 3600;
  return `${hours.toFixed(1)}h`;
}

function HistoryCard({ item, index }: { item: VideoRow; index: number }) {
  const { t } = useTranslation();
  const { theme } = useApp();
  const title = parseImportedFilename(item.filename).cleanFilename;
  const progressPercent = item.duration > 0 ? Math.round((item.progress / item.duration) * 100) : 0;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 70).springify()}
      layout={LinearTransition.springify().damping(18).stiffness(180)}>
      <GlassCard style={styles.historyCard}>
        <View style={styles.historyIcon}>
          <Ionicons name="play-circle-outline" size={18} color={theme.accentPrimary} />
        </View>
        <View style={styles.historyCopy}>
          <Text style={[styles.historyTitle, { color: theme.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.historyMeta, { color: theme.textSecondary }]}>
            {t('profile.watchedProgress', { count: progressPercent })}
          </Text>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

export default function ProfileScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { theme } = useApp();
  const { ready, user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const [history, setHistory] = useState<VideoRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const contentMaxWidth = width >= 1400 ? 1240 : 980;

  const stats = useMemo(() => {
    const watched = history.filter((item) => item.progress > 0);
    const completed = history.filter((item) => item.duration > 0 && item.progress >= item.duration * 0.9);
    const totalWatchSeconds = watched.reduce((sum, item) => sum + item.progress, 0);

    return {
      watchedCount: watched.length,
      completedCount: completed.length,
      totalWatchSeconds,
    };
  }, [history]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);

    try {
      await initializeDatabase(db);
      const rows = await getAllVideos(db);
      setHistory(rows.filter((item) => item.progress > 0).sort((a, b) => b.progress - a.progress).slice(0, 8));
    } finally {
      setLoadingHistory(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        void loadHistory();
      }
    }, [loadHistory, user])
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

  if (!ready) {
    return (
      <LiquidBackground>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.textPrimary} />
        </View>
      </LiquidBackground>
    );
  }

  if (!user) {
    return (
      <LiquidBackground>
        <View style={styles.emptyShell}>
          <GlassCard style={styles.authCard}>
            <Ionicons name="person-circle-outline" size={42} color={theme.textPrimary} />
            <Text style={[styles.authTitle, { color: theme.textPrimary }]}>{t('profile.guestTitle', { defaultValue: 'Profile is locked' })}</Text>
            <Text style={[styles.authCopy, { color: theme.textSecondary }]}>{t('profile.guestCopy', { defaultValue: 'Create an account or continue with a guest session to unlock profile stats and friends.' })}</Text>
            <Pressable onPress={() => router.push('/auth')} style={[styles.primaryButton, { backgroundColor: theme.accentPrimary }]}>
              <Text style={styles.primaryButtonLabel}>{t('profile.signIn', { defaultValue: 'Open auth' })}</Text>
            </Pressable>
          </GlassCard>
        </View>
      </LiquidBackground>
    );
  }

  return (
    <LiquidBackground>
      <FlatList
        data={history}
        renderItem={({ item, index }: ListRenderItemInfo<VideoRow>) => <HistoryCard item={item} index={index} />}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListHeaderComponent={
          <Animated.View entering={FadeInDown.duration(420)} style={styles.header}>
            <Pressable onPress={() => router.back()} style={[styles.backButton, { borderColor: theme.cardBorder }]}>
              <Ionicons name="chevron-back" size={20} color={theme.textPrimary} />
            </Pressable>

            <View style={[styles.avatar, { backgroundColor: `${theme.accentPrimary}22` }]}>
              <Text style={[styles.avatarLabel, { color: theme.textPrimary }]}>
                {user.username.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.username, { color: theme.textPrimary }]}>{user.username}</Text>
            <Text style={[styles.rank, { color: theme.textSecondary }]}>
              {user.rank} • {user.isGuest ? t('profile.guest', { defaultValue: 'Guest' }) : user.role}
            </Text>
            {user.email ? (
              <Text style={[styles.email, { color: theme.textMuted }]}>{user.email}</Text>
            ) : null}

            <View style={styles.statsRow}>
              <GlassCard style={styles.statCard}>
                <Text style={[styles.statValue, { color: theme.textPrimary }]}>{stats.watchedCount}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('profile.statsWatched', { defaultValue: 'Started' })}</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={[styles.statValue, { color: theme.textPrimary }]}>{stats.completedCount}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('profile.statsCompleted', { defaultValue: 'Finished' })}</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={[styles.statValue, { color: theme.textPrimary }]}>{formatHours(stats.totalWatchSeconds)}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('profile.statsTime', { defaultValue: 'Watch time' })}</Text>
              </GlassCard>
            </View>
            {user.stats ? (
              <View style={styles.statsRow}>
                <GlassCard style={styles.statCard}>
                  <Text style={[styles.statValue, { color: theme.textPrimary }]}>{user.stats.friends}</Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Friends</Text>
                </GlassCard>
                <GlassCard style={styles.statCard}>
                  <Text style={[styles.statValue, { color: theme.textPrimary }]}>{user.stats.messages}</Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Messages</Text>
                </GlassCard>
                <View style={styles.statSpacer} />
              </View>
            ) : null}

            <Pressable
              onPress={() => {
                void logout();
                router.replace('/');
              }}
              style={[styles.logoutButton, { backgroundColor: theme.surfaceStrong }]}>
              <Ionicons name="log-out-outline" size={18} color={theme.textPrimary} />
              <Text style={[styles.logoutLabel, { color: theme.textPrimary }]}>{t('profile.logout', { defaultValue: 'Logout' })}</Text>
            </Pressable>

            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{t('profile.watchHistory', { defaultValue: 'Watch history' })}</Text>
            {loadingHistory ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator size="small" color={theme.textPrimary} />
              </View>
            ) : null}
          </Animated.View>
        }
        ListEmptyComponent={
          !loadingHistory ? (
            <GlassCard style={styles.emptyHistoryCard}>
              <Text style={[styles.emptyHistoryTitle, { color: theme.textPrimary }]}>{t('profile.noHistory', { defaultValue: 'No history yet' })}</Text>
              <Text style={[styles.emptyHistoryCopy, { color: theme.textSecondary }]}>{t('profile.noHistoryCopy', { defaultValue: 'Start watching local or online episodes to build your profile stats.' })}</Text>
            </GlassCard>
          ) : null
        }
      />
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyShell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  authCard: { width: '100%', maxWidth: 420, padding: 22, alignItems: 'center', gap: 12 },
  authTitle: { fontSize: 22, fontWeight: '900' },
  authCopy: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  primaryButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryButtonLabel: { color: '#05070F', fontSize: 14, fontWeight: '900' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
  header: { marginBottom: 22 },
  backButton: {
    alignSelf: 'flex-start',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 18,
  },
  avatar: { width: 80, height: 80, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarLabel: { fontSize: 28, fontWeight: '900' },
  username: { marginTop: 14, fontSize: 30, fontWeight: '900' },
  rank: { marginTop: 6, fontSize: 14, fontWeight: '700' },
  email: { marginTop: 6, fontSize: 13, fontWeight: '600' },
  statsRow: { marginTop: 18, flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, padding: 14, alignItems: 'center' },
  statSpacer: { flex: 1 },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { marginTop: 6, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  logoutButton: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutLabel: { fontSize: 14, fontWeight: '800' },
  sectionTitle: { marginTop: 22, fontSize: 18, fontWeight: '900' },
  inlineLoader: { marginTop: 10 },
  historyCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  historyCopy: { flex: 1 },
  historyTitle: { fontSize: 15, fontWeight: '800' },
  historyMeta: { marginTop: 6, fontSize: 12, fontWeight: '600' },
  emptyHistoryCard: { padding: 18, gap: 8 },
  emptyHistoryTitle: { fontSize: 18, fontWeight: '900' },
  emptyHistoryCopy: { fontSize: 14, lineHeight: 20 },
});
