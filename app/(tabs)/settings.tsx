import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { LIQUID_COLORS } from '@/src/theme/liquid';

function SettingRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <GlassCard style={styles.rowCard}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: 'rgba(255,255,255,0.16)', true: 'rgba(196,181,253,0.5)' }}
        thumbColor={value ? '#FFFFFF' : '#E2E8F0'}
      />
    </GlassCard>
  );
}

export default function SettingsTabScreen() {
  const [autoDelete, setAutoDelete] = useState(false);
  const [darkTheme, setDarkTheme] = useState(true);

  return (
    <LiquidBackground>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Параметри</Text>
        <Text style={styles.title}>Налаштування</Text>
        <Text style={styles.subtitle}>Базові перемикачі-заглушки для майбутньої логіки керування бібліотекою.</Text>
      </View>

      <View style={styles.content}>
        <SettingRow
          label="Авто-видалення серій"
          description="Після завершення перегляду серія може видалятися автоматично."
          value={autoDelete}
          onValueChange={setAutoDelete}
        />
        <SettingRow
          label="Темна тема"
          description="Візуальний перемикач для темної теми. Поки що без окремої світлої палітри."
          value={darkTheme}
          onValueChange={setDarkTheme}
        />

        <GlassCard style={styles.noteCard}>
          <Text style={styles.noteTitle}>Статус</Text>
          <Text style={styles.noteCopy}>Ці перемикачі зараз візуальні. Поведінку можна підв’язати до SQLite або окремої таблиці settings наступним кроком.</Text>
        </GlassCard>
      </View>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
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
    color: LIQUID_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 290,
  },
  content: {
    paddingHorizontal: 20,
    gap: 14,
  },
  rowCard: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  rowCopy: {
    flex: 1,
    gap: 6,
  },
  rowTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  rowDescription: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  noteCard: {
    padding: 18,
    gap: 6,
  },
  noteTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  noteCopy: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
