import { Stack } from 'expo-router';
import { SQLiteDatabase, SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider } from '@/src/providers/app-provider';

async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY,
      uri TEXT NOT NULL,
      title TEXT NOT NULL,
      duration REAL NOT NULL DEFAULT 0,
      currentTime REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY NOT NULL,
      remote_url TEXT NOT NULL,
      local_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      cleaned_title TEXT NOT NULL,
      watched_progress REAL NOT NULL DEFAULT 0
    );
  `);
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName="media-manager.db" onInit={initializeDatabase}>
        <AppProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="folder/[folderKey]" />
            <Stack.Screen name="player/[source]/[id]" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="light" />
        </AppProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
