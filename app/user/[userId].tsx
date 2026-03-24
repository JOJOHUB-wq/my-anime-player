import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useApp } from '@/src/providers/app-provider';
import { useSocial, type SocialPublicProfile } from '@/src/providers/social-provider';

function formatJoined(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

export default function UserProfileScreen() {
  const { theme } = useApp();
  const { t } = useTranslation();
  const { getPublicProfile, getOrCreateChat, inviteToRoom } = useSocial();
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const rawUserId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const [profile, setProfile] = useState<SocialPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!rawUserId) {
        setLoading(false);
        setError(t('social.profileError', { defaultValue: 'Unable to load profile.' }));
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const nextProfile = await getPublicProfile(rawUserId);
        if (active) {
          setProfile(nextProfile);
        }
      } catch (profileError) {
        if (active) {
          setError(
            profileError instanceof Error
              ? profileError.message
              : t('social.profileError', { defaultValue: 'Unable to load profile.' })
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [getPublicProfile, rawUserId, t]);

  return (
    <LiquidBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.backButton, { borderColor: theme.cardBorder }]}>
            <Ionicons name="chevron-back" size={20} color={theme.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.content}>
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={theme.textPrimary} />
            </View>
          ) : error || !profile ? (
            <GlassCard style={styles.card}>
              <Text style={[styles.errorText, { color: theme.danger }]}>{error || t('social.profileError', { defaultValue: 'Unable to load profile.' })}</Text>
            </GlassCard>
          ) : (
            <GlassCard style={styles.card}>
              <View style={[styles.avatar, { backgroundColor: `${theme.accentPrimary}22` }]}>
                <Text style={[styles.avatarLabel, { color: theme.textPrimary }]}>
                  {profile.user.username.slice(0, 1).toUpperCase()}
                </Text>
              </View>

              <Text style={[styles.username, { color: theme.textPrimary }]}>{profile.user.username}</Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                @{profile.user.username} • {profile.user.rank} • {profile.user.role}
              </Text>
              <Text style={[styles.meta, { color: theme.textMuted }]}>
                {t(`social.status.${profile.user.status}`, { defaultValue: profile.user.status })} • {t('profile.joined', { defaultValue: 'Joined' })} {formatJoined(profile.user.createdAt)}
              </Text>

              <View style={styles.statsRow}>
                <GlassCard style={styles.statCard}>
                  <Text style={[styles.statValue, { color: theme.textPrimary }]}>{profile.user.stats.friends}</Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('profile.statsFriends', { defaultValue: 'Friends' })}</Text>
                </GlassCard>
                <GlassCard style={styles.statCard}>
                  <Text style={[styles.statValue, { color: theme.textPrimary }]}>{profile.user.stats.messages}</Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('profile.statsMessages', { defaultValue: 'Messages' })}</Text>
                </GlassCard>
              </View>

              <Text style={[styles.relationship, { color: theme.textSecondary }]}>
                {t(`social.relationship.${profile.relationship}`, { defaultValue: profile.relationship })}
              </Text>

              <View style={styles.actions}>
                <Pressable
                  onPress={() => {
                    void (async () => {
                      const chat = await getOrCreateChat(profile.user.id);
                      router.push({
                        pathname: '/chat/[chatId]',
                        params: { chatId: chat.id },
                      });
                    })();
                  }}
                  style={[styles.primaryButton, { backgroundColor: theme.surfaceStrong }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.textPrimary} />
                  <Text style={[styles.primaryButtonLabel, { color: theme.textPrimary }]}>{t('social.openChat', { defaultValue: 'Open chat' })}</Text>
                </Pressable>

                {profile.relationship === 'friend' ? (
                  <Pressable
                    onPress={() => {
                      void inviteToRoom(profile.user.id);
                    }}
                    style={[styles.primaryButton, { backgroundColor: theme.accentPrimary }]}>
                    <Ionicons name="people-outline" size={18} color="#05070F" />
                    <Text style={[styles.primaryButtonLabel, { color: '#05070F' }]}>{t('social.invite', { defaultValue: 'Invite' })}</Text>
                  </Pressable>
                ) : null}
              </View>
            </GlassCard>
          )}
        </View>
      </SafeAreaView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 8 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, justifyContent: 'center' },
  centerState: { alignItems: 'center', justifyContent: 'center' },
  card: { padding: 22, alignItems: 'center', gap: 12 },
  avatar: { width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarLabel: { fontSize: 30, fontWeight: '900' },
  username: { fontSize: 28, fontWeight: '900' },
  meta: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  relationship: { marginTop: 4, fontSize: 13, fontWeight: '700' },
  statsRow: { width: '100%', flexDirection: 'row', gap: 12, marginTop: 8 },
  statCard: { flex: 1, padding: 14, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { marginTop: 6, fontSize: 12, fontWeight: '700' },
  actions: { width: '100%', marginTop: 8, gap: 10 },
  primaryButton: { minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  primaryButtonLabel: { fontSize: 14, fontWeight: '900' },
  errorText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
