import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useApp } from '@/src/providers/app-provider';

export default function TwoFactorScreen() {
  const { t } = useTranslation();
  const { theme } = useApp();

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace('/auth');
    }, 120);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  return (
    <LiquidBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <GlassCard style={styles.card}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              {t('auth.twoFactorDisabledTitle', { defaultValue: '2FA setup is disabled' })}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {t('auth.twoFactorDisabledCopy', {
                defaultValue: 'This build signs in directly. Redirecting back to the auth screen…',
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
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  card: { padding: 22, gap: 12 },
  title: { fontSize: 24, fontWeight: '900', lineHeight: 30 },
  subtitle: { fontSize: 14, lineHeight: 20 },
});
