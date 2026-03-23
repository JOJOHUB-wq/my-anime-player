import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  ReactNode,
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
} from '@/src/db/database';
import { getTheme } from '@/src/theme/tokens';

type AppContextValue = {
  theme: ReturnType<typeof getTheme>;
  preferencesLoading: boolean;
  autoDeleteWatchedEpisodes: boolean;
  darkModeEnabled: boolean;
  setAutoDeleteWatchedEpisodes: (value: boolean) => Promise<void>;
  setDarkModeEnabled: (value: boolean) => Promise<void>;
  refreshPreferences: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);
const AUTO_DELETE_KEY = 'auto_delete_watched_episodes';
const DARK_MODE_KEY = 'dark_mode_enabled';

export function AppProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [autoDeleteWatchedEpisodes, setAutoDeleteWatchedEpisodesState] = useState(false);
  const [darkModeEnabled, setDarkModeEnabledState] = useState(true);

  const refreshPreferences = useCallback(async () => {
    setPreferencesLoading(true);

    try {
      await initializeDatabase(db);

      const [storedAutoDelete, storedDarkMode] = await Promise.all([
        getSettingBoolean(db, AUTO_DELETE_KEY, false),
        getSettingBoolean(db, DARK_MODE_KEY, true),
      ]);

      setAutoDeleteWatchedEpisodesState(storedAutoDelete);
      setDarkModeEnabledState(storedDarkMode);
    } finally {
      setPreferencesLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void refreshPreferences();
  }, [refreshPreferences]);

  const setAutoDeleteWatchedEpisodes = useCallback(
    async (value: boolean) => {
      setAutoDeleteWatchedEpisodesState(value);
      await initializeDatabase(db);
      await setSettingBoolean(db, AUTO_DELETE_KEY, value);
    },
    [db]
  );

  const setDarkModeEnabled = useCallback(
    async (value: boolean) => {
      setDarkModeEnabledState(value);
      await initializeDatabase(db);
      await setSettingBoolean(db, DARK_MODE_KEY, value);
    },
    [db]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      theme: getTheme('blue'),
      preferencesLoading,
      autoDeleteWatchedEpisodes,
      darkModeEnabled,
      setAutoDeleteWatchedEpisodes,
      setDarkModeEnabled,
      refreshPreferences,
    }),
    [
      autoDeleteWatchedEpisodes,
      darkModeEnabled,
      preferencesLoading,
      refreshPreferences,
      setAutoDeleteWatchedEpisodes,
      setDarkModeEnabled,
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
