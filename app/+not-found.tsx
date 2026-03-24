import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { useApp } from '@/src/providers/app-provider';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  const { theme } = useApp();

  return (
    <LiquidBackground>
      <View style={styles.root}>
        <GlassCard style={styles.card}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>404</Text>
          <Text style={[styles.copy, { color: theme.textSecondary }]}>{t('common.empty')}</Text>
          <Pressable
            onPress={() => {
              router.replace('/local');
            }}
            style={[styles.button, { backgroundColor: theme.surfaceStrong }]}>
            <Text style={[styles.buttonLabel, { color: theme.textPrimary }]}>{t('tabs.local')}</Text>
          </Pressable>
        </GlassCard>
      </View>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
  },
  copy: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  button: {
    marginTop: 16,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
});
