import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useAuth } from '@/src/providers/auth-provider';
import { useApp } from '@/src/providers/app-provider';

export default function EmailVerificationScreen() {
  const { t } = useTranslation();
  const { theme } = useApp();
  const { pendingAuth, cancelPendingAuth } = useAuth();

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace(pendingAuth ? '/auth/two-factor' : '/auth');
    }, 30);

    return () => {
      clearTimeout(timeout);
    };
  }, [pendingAuth]);

  return (
    <LiquidBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              void (async () => {
                await cancelPendingAuth();
                router.replace('/auth');
              })();
            }}
            style={[styles.backButton, { borderColor: theme.cardBorder }]}>
            <Ionicons name="chevron-back" size={20} color={theme.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.center}>
          <GlassCard style={styles.card}>
            <Text style={[styles.eyebrow, { color: theme.textMuted }]}>
              {t('auth.verifyEyebrow', { defaultValue: 'Verification disabled' })}
            </Text>
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              {t('auth.verifyTitle', { defaultValue: 'Skipping email confirmation' })}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {t('auth.verifyCopy', {
                defaultValue: 'This app now sends you directly to 2FA. Redirecting…',
              })}
            </Text>
            <ActivityIndicator size="small" color={theme.textPrimary} />
          </GlassCard>
        </View>
      </SafeAreaView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  card: { padding: 22, gap: 14 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900', lineHeight: 32 },
  subtitle: { fontSize: 14, lineHeight: 20 },
});
