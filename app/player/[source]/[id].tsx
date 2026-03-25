import * as ScreenOrientation from 'expo-screen-orientation';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { VideoPlayerScreen } from '@/src/components/player/video-player-screen';
import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import {
  deleteVideoById,
  getVideoById,
  initializeDatabase,
  parseImportedFilename,
  updateVideoProgress,
  type VideoRow,
} from '@/src/db/database';
import { useDatabaseContext } from '@/src/db/db-context';
import { useApp } from '@/src/providers/app-provider';

export default function PlayerScreen() {
  const db = useDatabaseContext();
  const { t } = useTranslation();
  const { autoDeleteWatchedEpisodes, theme } = useApp();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const videoId = Number(rawId);
  const [video, setVideo] = useState<VideoRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const parsedFilename = useMemo(
    () => (video ? parseImportedFilename(video.filename) : null),
    [video]
  );

  const canLoad = useMemo(() => Number.isFinite(videoId) && videoId > 0, [videoId]);

  useEffect(() => {
    let active = true;

    async function loadVideo() {
      setLoading(true);
      setError(null);

      try {
        if (!canLoad) {
          throw new Error(t('player.errorCopy'));
        }

        await initializeDatabase(db);
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

        const row = await getVideoById(db, videoId);

        if (!row) {
          throw new Error(t('player.errorCopy'));
        }

        if (active) {
          setVideo(row);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : t('player.errorCopy'));
          setVideo(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadVideo();

    return () => {
      active = false;
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, [canLoad, db, t, videoId]);

  if (loading) {
    return (
      <LiquidBackground>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.textPrimary} />
          <Text style={[styles.messageTitle, { color: theme.textPrimary }]}>{t('player.opening')}</Text>
        </View>
      </LiquidBackground>
    );
  }

  if (error || !video) {
    return (
      <LiquidBackground>
        <View style={styles.centerState}>
          <GlassCard style={styles.messageCard}>
            <Text style={[styles.messageTitle, { color: theme.textPrimary }]}>{t('player.errorTitle')}</Text>
            <Text style={[styles.messageCopy, { color: theme.textSecondary }]}>{error ?? t('player.errorCopy')}</Text>
            <Pressable
              onPress={() => {
                router.back();
              }}
              style={[styles.inlineButton, { backgroundColor: theme.surfaceStrong, borderColor: theme.cardBorder }]}>
              <Text style={[styles.inlineButtonLabel, { color: theme.textPrimary }]}>{t('player.back')}</Text>
            </Pressable>
          </GlassCard>
        </View>
      </LiquidBackground>
    );
  }

  return (
    <VideoPlayerScreen
      media={{
        uri: video.uri || video.remote_url || '',
        progress: video.progress,
        duration: video.duration,
      }}
      title={parsedFilename?.seriesTitle || video.filename}
      subtitle={
        parsedFilename?.episode
          ? t('playlist.episode', { value: parsedFilename.episode })
          : parsedFilename?.cleanFilename || video.filename
      }
      onPersistProgress={async (snapshot) => {
        await updateVideoProgress(db, video.id, snapshot.currentTime, snapshot.duration);
      }}
      onFinished={async () => {
        if (!autoDeleteWatchedEpisodes) {
          return;
        }

        await deleteVideoById(db, video.id);
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        router.back();
      }}
      onClose={async () => {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        router.back();
      }}
    />
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  messageCard: {
    width: '100%',
    maxWidth: 420,
    padding: 22,
    gap: 10,
  },
  messageTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  messageCopy: {
    fontSize: 14,
    lineHeight: 20,
  },
  inlineButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  inlineButtonLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
});
