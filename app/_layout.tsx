import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { I18nextProvider } from 'react-i18next';

import { initializeDatabase } from '@/src/db/database';
import i18n, { getDeviceLanguage, initializeI18n } from '@/src/i18n';
import { AppProvider } from '@/src/providers/app-provider';
import { AuthProvider } from '@/src/providers/auth-provider';
import { DownloadProvider } from '@/src/providers/download-provider';
import { SocialProvider } from '@/src/providers/social-provider';
import { getItem } from '@/src/utils/storage';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const storedLanguage = await getItem('language');
      const resolvedLanguage =
        storedLanguage === 'en' ||
        storedLanguage === 'uk' ||
        storedLanguage === 'ru' ||
        storedLanguage === 'ja'
          ? storedLanguage
          : getDeviceLanguage();

      await initializeI18n(resolvedLanguage);

      if (active) {
        setReady(true);
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: '#05070F',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <ActivityIndicator size="large" color="#F8FAFC" />
          <StatusBar style="light" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nextProvider i18n={i18n}>
        <SQLiteProvider databaseName="media-manager.db" onInit={initializeDatabase}>
          <AppProvider>
            <AuthProvider>
              <SocialProvider>
                <DownloadProvider>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      animation: 'fade_from_bottom',
                      contentStyle: {
                        backgroundColor: '#05070F',
                      },
                    }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="auth/index" />
                    <Stack.Screen name="auth/verify" />
                    <Stack.Screen name="auth/two-factor" />
                    <Stack.Screen name="chat/[chatId]" />
                    <Stack.Screen name="profile" />
                    <Stack.Screen name="folder/[folderKey]" />
                    <Stack.Screen name="online/[id]" />
                    <Stack.Screen name="player/[source]/[id]" options={{ presentation: 'fullScreenModal' }} />
                    <Stack.Screen name="+not-found" />
                  </Stack>
                </DownloadProvider>
              </SocialProvider>
            </AuthProvider>
            <StatusBar style="light" />
          </AppProvider>
        </SQLiteProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}
