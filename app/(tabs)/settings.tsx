import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/src/components/ui/glass-card';
import { GlassPressable } from '@/src/components/ui/glass-pressable';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { clearBrokenVideoEntries, initializeDatabase } from '@/src/db/database';
import { useDatabaseContext } from '@/src/db/db-context';
import { SUPPORTED_LANGUAGES } from '@/src/i18n';
import { useApp } from '@/src/providers/app-provider';
import { THEME_PRESET_OPTIONS } from '@/src/theme/liquid';

type SheetMode = 'language' | 'theme' | null;

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { theme } = useApp();

  return (
    <GlassCard style={styles.rowCard}>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>{title}</Text>
        <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>{description}</Text>
      </View>
      {children}
    </GlassCard>
  );
}

export default function SettingsTabScreen() {
  const db = useDatabaseContext();
  const { t } = useTranslation();
  const {
    theme,
    ready,
    language,
    darkModeEnabled,
    autoDeleteWatchedEpisodes,
    themePreset,
    setLanguage,
    setDarkModeEnabled,
    setAutoDeleteWatchedEpisodes,
    setThemePreset,
  } = useApp();
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentLanguage = useMemo(
    () => SUPPORTED_LANGUAGES.find((item) => item.code === language) ?? SUPPORTED_LANGUAGES[1],
    [language]
  );
  const currentThemePreset = useMemo(
    () => THEME_PRESET_OPTIONS.find((item) => item.id === themePreset) ?? THEME_PRESET_OPTIONS[0],
    [themePreset]
  );
  const currentThemeLabel = useMemo(
    () => t(`themes.${currentThemePreset.id}`, { defaultValue: currentThemePreset.label }),
    [currentThemePreset.id, currentThemePreset.label, t]
  );

  const runAsyncSetting = useCallback(async (callback: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await callback();
    } catch {
      setError(t('settings.saving'));
    } finally {
      setSaving(false);
    }
  }, [t]);

  const handleClearCache = useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (FileSystem.cacheDirectory) {
        const entries = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);

        for (const entry of entries) {
          await FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${entry}`, {
            idempotent: true,
          });
        }
      }

      setMessage(t('settings.clearCacheDone'));
    } catch {
      setError(t('settings.clearCacheError'));
    } finally {
      setSaving(false);
    }
  }, [t]);

  const handleClearBrokenDownloads = useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await initializeDatabase(db);
      await clearBrokenVideoEntries(db);
      setMessage(t('settings.clearBrokenDownloadsDone'));
    } catch {
      setError(t('settings.clearBrokenDownloadsError'));
    } finally {
      setSaving(false);
    }
  }, [db, t]);

  if (!ready) {
    return (
      <LiquidBackground>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.textPrimary} />
          <Text style={[styles.loadingText, { color: theme.textPrimary }]}>{t('common.loading')}</Text>
        </View>
      </LiquidBackground>
    );
  }

  return (
    <LiquidBackground>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(420)} style={styles.header}>
          <Image source={require('../../assets/images/icon.png')} style={styles.appIcon} contentFit="cover" />
          <Text style={[styles.eyebrow, { color: theme.textMuted }]}>{t('settings.eyebrow')}</Text>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('settings.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{t('settings.subtitle')}</Text>
        </Animated.View>

        {error ? (
          <GlassCard style={styles.messageCard}>
            <Text style={[styles.messageText, { color: theme.danger }]}>{error}</Text>
          </GlassCard>
        ) : null}

        {message ? (
          <GlassCard style={styles.messageCard}>
            <Text style={[styles.messageText, { color: theme.success }]}>{message}</Text>
          </GlassCard>
        ) : null}

        <Animated.View layout={LinearTransition.springify()} style={styles.section}>
          <SettingRow
            title={t('settings.autoDelete')}
            description={t('settings.autoDeleteCopy')}>
            <Switch
              value={autoDeleteWatchedEpisodes}
              onValueChange={(value) => {
                void runAsyncSetting(async () => {
                  await setAutoDeleteWatchedEpisodes(value);
                });
              }}
              trackColor={{ false: theme.surfaceMuted, true: `${theme.accentPrimary}66` }}
              thumbColor={autoDeleteWatchedEpisodes ? '#FFFFFF' : '#E5E7EB'}
            />
          </SettingRow>

          <SettingRow title={t('settings.darkMode')} description={t('settings.darkModeCopy')}>
            <Switch
              value={darkModeEnabled}
              onValueChange={(value) => {
                void runAsyncSetting(async () => {
                  await setDarkModeEnabled(value);
                });
              }}
              trackColor={{ false: theme.surfaceMuted, true: `${theme.accentSecondary}66` }}
              thumbColor={darkModeEnabled ? '#FFFFFF' : '#E5E7EB'}
            />
          </SettingRow>
        </Animated.View>

        <Animated.View layout={LinearTransition.springify()} style={styles.section}>
          <GlassPressable
            onPress={() => {
              setSheetMode('language');
            }}
            contentStyle={styles.selectionRow}>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>{t('settings.language')}</Text>
              <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>{t('settings.languageCopy')}</Text>
            </View>
            <View style={styles.selectionValue}>
              <Text style={[styles.selectionLabel, { color: theme.textPrimary }]}>{currentLanguage.nativeLabel}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </View>
          </GlassPressable>

          <GlassPressable
            onPress={() => {
              setSheetMode('theme');
            }}
            contentStyle={styles.selectionRow}>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>{t('settings.theme')}</Text>
              <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>{t('settings.themeCopy')}</Text>
            </View>
            <View style={styles.selectionValue}>
              <Text style={[styles.selectionLabel, { color: theme.textPrimary }]}>{currentThemeLabel}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </View>
          </GlassPressable>

          <GlassPressable
            onPress={() => {
              void handleClearCache();
            }}
            contentStyle={styles.selectionRow}>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>{t('settings.clearCache')}</Text>
              <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>{t('settings.clearCacheCopy')}</Text>
            </View>
            {saving ? (
              <ActivityIndicator size="small" color={theme.textPrimary} />
            ) : (
              <Ionicons name="trash-outline" size={18} color={theme.textPrimary} />
            )}
          </GlassPressable>

          <GlassPressable
            onPress={() => {
              void handleClearBrokenDownloads();
            }}
            contentStyle={styles.selectionRow}>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>{t('settings.clearBrokenDownloads')}</Text>
              <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>{t('settings.clearBrokenDownloadsCopy')}</Text>
            </View>
            {saving ? (
              <ActivityIndicator size="small" color={theme.textPrimary} />
            ) : (
              <Ionicons name="warning-outline" size={18} color={theme.textPrimary} />
            )}
          </GlassPressable>
        </Animated.View>

        <GlassCard style={styles.statusCard}>
          <Text style={[styles.statusTitle, { color: theme.textPrimary }]}>{t('settings.status')}</Text>
          <Text style={[styles.statusCopy, { color: theme.textSecondary }]}>
            {currentLanguage.nativeLabel} • {currentThemeLabel} •{' '}
            {darkModeEnabled ? t('settings.modeDark') : t('settings.modeSoft')}
          </Text>
          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={theme.textPrimary} />
              <Text style={[styles.savingLabel, { color: theme.textPrimary }]}>{t('settings.saving')}</Text>
            </View>
          ) : null}
        </GlassCard>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={sheetMode !== null}
        onRequestClose={() => {
          setSheetMode(null);
        }}>
        <View style={styles.sheetBackdrop}>
          <Animated.View entering={FadeInDown.springify()} style={styles.sheetWrap}>
            <GlassCard style={styles.sheetCard}>
              <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>
                {sheetMode === 'language' ? t('settings.languageSheetTitle') : t('settings.themeSheetTitle')}
              </Text>

              {sheetMode === 'language'
                ? SUPPORTED_LANGUAGES.map((item) => {
                    const active = item.code === language;

                    return (
                      <Pressable
                        key={item.code}
                        onPress={() => {
                          void runAsyncSetting(async () => {
                            await setLanguage(item.code);
                            setSheetMode(null);
                          });
                        }}
                        style={[
                          styles.sheetOption,
                          {
                            backgroundColor: active ? theme.surfaceStrong : theme.surfaceMuted,
                            borderColor: active ? theme.accentPrimary : theme.separator,
                          },
                        ]}>
                        <View>
                          <Text style={[styles.sheetOptionTitle, { color: theme.textPrimary }]}>{item.nativeLabel}</Text>
                          <Text style={[styles.sheetOptionMeta, { color: theme.textSecondary }]}>{item.label}</Text>
                        </View>
                        {active ? <Ionicons name="checkmark-circle" size={20} color={theme.accentPrimary} /> : null}
                      </Pressable>
                    );
                  })
                : THEME_PRESET_OPTIONS.map((item) => {
                    const active = item.id === themePreset;

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          void runAsyncSetting(async () => {
                            await setThemePreset(item.id);
                            setSheetMode(null);
                          });
                        }}
                        style={[
                          styles.sheetOption,
                          {
                            backgroundColor: active ? theme.surfaceStrong : theme.surfaceMuted,
                            borderColor: active ? theme.accentPrimary : theme.separator,
                          },
                        ]}>
                        <Text style={[styles.sheetOptionTitle, { color: theme.textPrimary }]}>
                          {t(`themes.${item.id}`, { defaultValue: item.label })}
                        </Text>
                        {active ? <Ionicons name="checkmark-circle" size={20} color={theme.accentPrimary} /> : null}
                      </Pressable>
                    );
                  })}

              <Pressable
                onPress={() => {
                  setSheetMode(null);
                }}
                style={[styles.sheetCloseButton, { backgroundColor: theme.surfaceStrong }]}>
                <Text style={[styles.sheetCloseLabel, { color: theme.textPrimary }]}>{t('common.close')}</Text>
              </Pressable>
            </GlassCard>
          </Animated.View>
        </View>
      </Modal>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 20,
  },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 8,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 300,
  },
  messageCard: {
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  messageText: {
    fontSize: 14,
    fontWeight: '700',
  },
  section: {
    gap: 12,
    marginBottom: 16,
  },
  rowCard: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowCopy: {
    flex: 1,
    gap: 6,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  rowDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  selectionRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectionValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectionLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  statusCard: {
    padding: 18,
    gap: 8,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  statusCopy: {
    fontSize: 13,
    lineHeight: 18,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  savingLabel: {
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
    fontSize: 16,
    fontWeight: '700',
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(4, 7, 18, 0.56)',
  },
  sheetWrap: {
    padding: 20,
    paddingBottom: 32,
  },
  sheetCard: {
    padding: 18,
    gap: 12,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  sheetOption: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetOptionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  sheetOptionMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  sheetCloseButton: {
    marginTop: 8,
    minHeight: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
});
