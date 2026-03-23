import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { initializeDatabase } from '@/src/db/database';
import { AppProvider } from '@/src/providers/app-provider';

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
