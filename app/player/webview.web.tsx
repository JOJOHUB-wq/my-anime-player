import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VideoPlayerScreen } from '@/src/components/player/video-player-screen';
import { useApp } from '@/src/providers/app-provider';

function resolveParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function WebviewPlayerScreen() {
  const { theme } = useApp();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    url?: string | string[];
    title?: string | string[];
    subtitle?: string | string[];
  }>();
  const url = useMemo(() => resolveParam(params.url), [params.url]);
  const title = useMemo(() => resolveParam(params.title), [params.title]);
  const subtitle = useMemo(() => resolveParam(params.subtitle), [params.subtitle]);

  if (!url) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.overlay}>
          <View style={[styles.messageCard, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.messageTitle, { color: theme.textPrimary }]}>{t('player.missingLinkTitle')}</Text>
            <Text style={[styles.messageCopy, { color: theme.textSecondary }]}>
              {t('player.missingKodikLink')}
            </Text>
            <Pressable
              onPress={() => {
                router.back();
              }}
              style={[styles.backButtonInline, { borderColor: theme.cardBorder, backgroundColor: theme.surfaceMuted }]}>
              <Text style={[styles.backButtonInlineLabel, { color: theme.textPrimary }]}>{t('common.back')}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <VideoPlayerScreen
      media={{ uri: url }}
      title={title}
      subtitle={subtitle}
      onClose={() => {
        router.back();
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  messageCard: {
    marginTop: 24,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    gap: 8,
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  messageCopy: {
    fontSize: 14,
    lineHeight: 20,
  },
  backButtonInline: {
    marginTop: 10,
    alignSelf: 'flex-start',
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonInlineLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
});
