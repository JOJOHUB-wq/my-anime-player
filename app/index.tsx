import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useAuth } from '@/src/providers/auth-provider';
import { useApp } from '@/src/providers/app-provider';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const { theme } = useApp();
  const { user, continueAsGuest } = useAuth();

  return (
    <LiquidBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <Image source={require('../assets/images/icon.png')} style={styles.heroIcon} contentFit="cover" />
            <Text style={[styles.eyebrow, { color: theme.textMuted }]}>{t('welcome.eyebrow', { defaultValue: 'Premium anime lounge' })}</Text>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{t('welcome.title', { defaultValue: 'Atherium Player' })}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{t('welcome.subtitle', { defaultValue: 'Local collections, online anime, offline downloads, and social watch parties in one premium shell.' })}</Text>
          </View>

          <GlassCard style={styles.card}>
            <Pressable
              onPress={() => {
                router.push('/auth');
              }}
              style={[styles.primaryButton, { backgroundColor: theme.accentPrimary }]}>
              <Text style={styles.primaryButtonLabel}>{t('welcome.register', { defaultValue: 'Register' })}</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                router.push({
                  pathname: '/auth',
                  params: { mode: 'login' },
                });
              }}
              style={[styles.secondaryButton, { backgroundColor: theme.surfaceStrong, borderColor: theme.cardBorder }]}>
              <Text style={[styles.secondaryButtonLabel, { color: theme.textPrimary }]}>{t('welcome.login', { defaultValue: 'Login' })}</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void (async () => {
                  await continueAsGuest();
                  router.replace('/local');
                })();
              }}
              style={[styles.secondaryButton, { backgroundColor: theme.surfaceMuted, borderColor: theme.cardBorder }]}>
              <Text style={[styles.secondaryButtonLabel, { color: theme.textPrimary }]}>{t('welcome.guest', { defaultValue: 'Continue as Guest' })}</Text>
            </Pressable>

            {user ? (
              <Pressable
                onPress={() => {
                  router.replace('/local');
                }}
                style={styles.inlineLink}>
                <Ionicons name="arrow-forward-circle-outline" size={18} color={theme.textPrimary} />
                <Text style={[styles.inlineLinkLabel, { color: theme.textPrimary }]}>
                  {t('welcome.enterApp', { defaultValue: 'Enter app as' })} {user.username}
                </Text>
              </Pressable>
            ) : null}
          </GlassCard>
        </View>
      </SafeAreaView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  hero: {
    paddingTop: 32,
  },
  heroIcon: {
    width: 78,
    height: 78,
    borderRadius: 24,
    marginBottom: 18,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 10,
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 44,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 340,
  },
  card: {
    padding: 20,
    gap: 12,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    color: '#05070F',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
  inlineLink: {
    marginTop: 4,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineLinkLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
});
