import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { LIQUID_COLORS } from '@/src/theme/liquid';

export default function NotFoundScreen() {
  return (
    <LiquidBackground>
      <SafeAreaView style={styles.safeArea}>
        <GlassCard style={styles.card}>
          <Text style={styles.title}>Сторінку не знайдено</Text>
          <Text style={styles.copy}>Поверніться до бібліотеки та відкрийте коректне відео.</Text>
          <Pressable
            onPress={() => {
              router.replace('/library');
            }}
            style={styles.button}>
            <Text style={styles.buttonLabel}>До бібліотеки</Text>
          </Pressable>
        </GlassCard>
      </SafeAreaView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    gap: 12,
  },
  title: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  copy: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  buttonLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
