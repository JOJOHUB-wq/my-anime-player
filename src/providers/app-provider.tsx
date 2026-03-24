import * as SystemUI from 'expo-system-ui';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getSettingBoolean,
  initializeDatabase,
  setSettingBoolean,
  setSettingString,
} from '@/src/db/database';
import {
  type AppLanguage,
  getDeviceLanguage,
  initializeI18n,
  setAppLanguage,
} from '@/src/i18n';
import {
  DEFAULT_THEME_PRESET,
  getPremiumTheme,
  type PremiumTheme,
  type ThemePresetId,
} from '@/src/theme/liquid';
import { getItem, setItem } from '@/src/utils/storage';

type AppContextValue = {
  ready: boolean;
  theme: PremiumTheme;
  language: AppLanguage;
  darkModeEnabled: boolean;
  autoDeleteWatchedEpisodes: boolean;
  themePreset: ThemePresetId;
  setLanguage: (value: AppLanguage) => Promise<void>;
  setDarkModeEnabled: (value: boolean) => Promise<void>;
  setAutoDeleteWatchedEpisodes: (value: boolean) => Promise<void>;
  setThemePreset: (value: ThemePresetId) => Promise<void>;
  refreshPreferences: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);
const AUTO_DELETE_KEY = 'auto_delete_watched_episodes';
const DARK_MODE_KEY = 'dark_mode_enabled';
const THEME_PRESET_KEY = 'theme_preset';
const LANGUAGE_KEY = 'language';

function isThemePreset(value: string): value is ThemePresetId {
  return (
    value === 'darkNavy' ||
    value === 'amoledBlack' ||
    value === 'cyberpunk' ||
    value === 'sakura' ||
    value === 'dracula'
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const [language, setLanguageState] = useState<AppLanguage>('uk');
  const [darkModeEnabled, setDarkModeEnabledState] = useState(true);
  const [autoDeleteWatchedEpisodes, setAutoDeleteWatchedEpisodesState] = useState(false);
  const [themePreset, setThemePresetState] = useState<ThemePresetId>(DEFAULT_THEME_PRESET);

  const refreshPreferences = useCallback(async () => {
    setReady(false);

    try {
      await initializeDatabase(db);

      const [storedAutoDelete, storedDarkMode, storedThemePreset, storedLanguage] = await Promise.all([
        getSettingBoolean(db, AUTO_DELETE_KEY, false),
        getSettingBoolean(db, DARK_MODE_KEY, true),
        getItem(THEME_PRESET_KEY),
        getItem(LANGUAGE_KEY),
      ]);

      const resolvedThemePreset: ThemePresetId = isThemePreset(storedThemePreset ?? '')
        ? (storedThemePreset as ThemePresetId)
        : DEFAULT_THEME_PRESET;
      const resolvedLanguage =
        storedLanguage === 'en' ||
        storedLanguage === 'uk' ||
        storedLanguage === 'ru' ||
        storedLanguage === 'ja'
          ? storedLanguage
          : getDeviceLanguage();

      await initializeI18n(resolvedLanguage);

      setAutoDeleteWatchedEpisodesState(storedAutoDelete);
      setDarkModeEnabledState(storedDarkMode);
      setThemePresetState(resolvedThemePreset);
      setLanguageState(resolvedLanguage);

      const theme = getPremiumTheme(resolvedThemePreset);
      await SystemUI.setBackgroundColorAsync(theme.gradient[0]);
    } finally {
      setReady(true);
    }
  }, [db]);

  useEffect(() => {
    void refreshPreferences();
  }, [refreshPreferences]);

  const setLanguage = useCallback(async (value: AppLanguage) => {
    setLanguageState(value);
    await setItem(LANGUAGE_KEY, value);
    await setAppLanguage(value);
  }, []);

  const setDarkModeEnabled = useCallback(
    async (value: boolean) => {
      setDarkModeEnabledState(value);
      await initializeDatabase(db);
      await setSettingBoolean(db, DARK_MODE_KEY, value);
      const theme = getPremiumTheme(themePreset);
      await SystemUI.setBackgroundColorAsync(theme.gradient[0]);
    },
    [db, themePreset]
  );

  const setAutoDeleteWatchedEpisodes = useCallback(
    async (value: boolean) => {
      setAutoDeleteWatchedEpisodesState(value);
      await initializeDatabase(db);
      await setSettingBoolean(db, AUTO_DELETE_KEY, value);
    },
    [db]
  );

  const setThemePreset = useCallback(
    async (value: ThemePresetId) => {
      setThemePresetState(value);
      await setItem(THEME_PRESET_KEY, value);
      await initializeDatabase(db);
      await setSettingString(db, THEME_PRESET_KEY, value);
      const theme = getPremiumTheme(value);
      await SystemUI.setBackgroundColorAsync(theme.gradient[0]);
    },
    [db]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      theme: getPremiumTheme(themePreset),
      language,
      darkModeEnabled,
      autoDeleteWatchedEpisodes,
      themePreset,
      setLanguage,
      setDarkModeEnabled,
      setAutoDeleteWatchedEpisodes,
      setThemePreset,
      refreshPreferences,
    }),
    [
      autoDeleteWatchedEpisodes,
      darkModeEnabled,
      language,
      ready,
      refreshPreferences,
      setAutoDeleteWatchedEpisodes,
      setDarkModeEnabled,
      setLanguage,
      setThemePreset,
      themePreset,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useApp must be used inside AppProvider.');
  }

  return context;
}
