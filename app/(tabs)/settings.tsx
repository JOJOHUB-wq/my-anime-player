import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';

import {
  getSettingBoolean,
  initializeDatabase,
  setSettingBoolean,
} from '@/src/db/database';
import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { LIQUID_COLORS } from '@/src/theme/liquid';

const AUTO_DELETE_KEY = 'auto_delete_watched_episodes';
const DARK_MODE_KEY = 'dark_mode_enabled';

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
  const db = useSQLiteContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoDelete, setAutoDelete] = useState(false);
  const [darkTheme, setDarkTheme] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await initializeDatabase(db);
      const [storedAutoDelete, storedDarkMode] = await Promise.all([
        getSettingBoolean(db, AUTO_DELETE_KEY, false),
        getSettingBoolean(db, DARK_MODE_KEY, true),
      ]);

      setAutoDelete(storedAutoDelete);
      setDarkTheme(storedDarkMode);
    } catch {
      setError('Не вдалося завантажити налаштування з SQLite.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadSettings();
    }, [loadSettings])
  );

  const updateSetting = useCallback(
    async (key: string, nextValue: boolean, setter: (value: boolean) => void) => {
      setter(nextValue);
      setSaving(true);
      setError(null);

      try {
        await setSettingBoolean(db, key, nextValue);
      } catch {
        setter(!nextValue);
        setError('Не вдалося зберегти налаштування.');
      } finally {
        setSaving(false);
      }
    },
    [db]
  );

  if (loading) {
    return (
      <LiquidBackground>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={LIQUID_COLORS.textPrimary} />
          <Text style={styles.loadingText}>Завантажую налаштування</Text>
        </View>
      </LiquidBackground>
    );
  }

  return (
    <LiquidBackground>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Параметри</Text>
        <Text style={styles.title}>Налаштування</Text>
        <Text style={styles.subtitle}>
          Ці перемикачі зберігаються в таблиці `settings` у SQLite і відновлюються після перезапуску застосунку.
        </Text>
      </View>

      {error ? (
        <GlassCard style={styles.messageCard}>
          <Text style={styles.errorText}>{error}</Text>
        </GlassCard>
      ) : null}

      <View style={styles.content}>
        <SettingRow
          label="Авто-видалення переглянутих серій"
          description="Коли опцію увімкнено, майбутня логіка плеєра зможе автоматично прибирати переглянуті епізоди."
          value={autoDelete}
          onValueChange={(value) => {
            void updateSetting(AUTO_DELETE_KEY, value, setAutoDelete);
          }}
        />

        <SettingRow
          label="Темна тема"
          description="Стан темної теми теж зберігається в SQLite, навіть після повного перезапуску."
          value={darkTheme}
          onValueChange={(value) => {
            void updateSetting(DARK_MODE_KEY, value, setDarkTheme);
          }}
        />

        <GlassCard style={styles.noteCard}>
          <Text style={styles.noteTitle}>Статус</Text>
          <Text style={styles.noteCopy}>
            Авто-видалення: {autoDelete ? 'увімкнено' : 'вимкнено'} • Темна тема:{' '}
            {darkTheme ? 'увімкнено' : 'вимкнено'}
          </Text>
          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={LIQUID_COLORS.textPrimary} />
              <Text style={styles.savingText}>Зберігаю зміни</Text>
            </View>
          ) : null}
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
    gap: 8,
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
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  savingText: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
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
});
