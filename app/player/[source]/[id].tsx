import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';

import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { LIQUID_COLORS } from '@/src/theme/liquid';

type VideoRow = {
  id: number;
  uri: string;
  title: string;
  duration: number;
  currentTime: number;
};

type PlayerSnapshot = {
  currentTime: number;
  duration: number;
  playing: boolean;
};

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2];

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00';
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function OverlayButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.overlayButton}>
      <Ionicons name={icon} size={18} color={LIQUID_COLORS.textPrimary} />
      <Text style={styles.overlayButtonLabel}>{label}</Text>
    </Pressable>
  );
}

function readSnapshot(player: VideoPlayer): PlayerSnapshot | null {
  try {
    return {
      currentTime: Number.isFinite(player.currentTime) ? player.currentTime : 0,
      duration: Number.isFinite(player.duration) ? player.duration : 0,
      playing: player.playing,
    };
  } catch {
    return null;
  }
}

function FullscreenPlayer({
  video,
  onClose,
}: {
  video: VideoRow;
  onClose: () => Promise<void>;
}) {
  const db = useSQLiteContext();
  const [position, setPosition] = useState(video.currentTime);
  const [duration, setDuration] = useState(video.duration);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const lastPersistAtRef = useRef(0);

  const player = useVideoPlayer({ uri: video.uri }, (videoPlayer) => {
    videoPlayer.staysActiveInBackground = true;
    videoPlayer.currentTime = video.currentTime;
    videoPlayer.playbackRate = PLAYBACK_SPEEDS[0];
    videoPlayer.play();
  });

  const persistSnapshot = useCallback(
    async (snapshot: PlayerSnapshot) => {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          'UPDATE videos SET currentTime = ?, duration = ? WHERE id = ?',
          snapshot.currentTime,
          snapshot.duration,
          video.id
        );
      });
    },
    [db, video.id]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const snapshot = readSnapshot(player);
      if (!snapshot) {
        return;
      }

      setPosition(snapshot.currentTime);
      setDuration(snapshot.duration);
      setIsPlaying(snapshot.playing);

      if (Date.now() - lastPersistAtRef.current >= 5000) {
        lastPersistAtRef.current = Date.now();
        void persistSnapshot(snapshot);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [persistSnapshot, player]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
      return;
    }

    player.play();
    setIsPlaying(true);
  }, [isPlaying, player]);

  const handleSpeedCycle = useCallback(() => {
    setSpeedIndex((current) => {
      const nextIndex = (current + 1) % PLAYBACK_SPEEDS.length;
      player.playbackRate = PLAYBACK_SPEEDS[nextIndex];
      return nextIndex;
    });
  }, [player]);

  const handleSeek = useCallback(
    (seconds: number) => {
      player.seekBy(seconds);

      const snapshot = readSnapshot(player);
      if (!snapshot) {
        return;
      }

      setPosition(snapshot.currentTime);
      setDuration(snapshot.duration);
    },
    [player]
  );

  const handleClose = useCallback(async () => {
    const snapshot = readSnapshot(player);
    if (snapshot) {
      await persistSnapshot(snapshot);
    }
    await onClose();
  }, [onClose, persistSnapshot, player]);

  return (
    <View style={styles.playerRoot}>
      <VideoView style={styles.playerVideo} player={player} nativeControls={false} contentFit="contain" />

      <SafeAreaView style={styles.playerOverlay} pointerEvents="box-none">
        <Pressable
          onPress={() => {
            void handleClose();
          }}
          style={styles.closeButton}>
          <Ionicons name="close" size={20} color={LIQUID_COLORS.textPrimary} />
        </Pressable>

        <View style={styles.bottomOverlay}>
          <GlassCard style={styles.playerInfoCard}>
            <Text style={styles.playerTitle} numberOfLines={1}>
              {video.title}
            </Text>
            <Text style={styles.playerMeta}>
              {formatClock(position)} / {formatClock(duration)}
            </Text>
          </GlassCard>

          <View style={styles.controlsRow}>
            <OverlayButton
              icon="play-back"
              label="-15с"
              onPress={() => {
                handleSeek(-15);
              }}
            />
            <OverlayButton
              icon={isPlaying ? 'pause' : 'play'}
              label={isPlaying ? 'Пауза' : 'Пуск'}
              onPress={togglePlayback}
            />
            <OverlayButton
              icon="speedometer-outline"
              label={`${PLAYBACK_SPEEDS[speedIndex].toFixed(2).replace(/\.00$/, '')}x`}
              onPress={handleSpeedCycle}
            />
            <OverlayButton
              icon="play-forward"
              label="+15с"
              onPress={() => {
                handleSeek(15);
              }}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function PlayerScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const videoId = Number(rawId);
  const [video, setVideo] = useState<VideoRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canLoad = useMemo(() => Number.isFinite(videoId) && videoId > 0, [videoId]);

  useEffect(() => {
    let active = true;

    async function loadVideo() {
      setLoading(true);
      setError(null);

      try {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY,
            uri TEXT NOT NULL,
            title TEXT NOT NULL,
            duration REAL NOT NULL DEFAULT 0,
            currentTime REAL NOT NULL DEFAULT 0
          );
        `);

        if (!canLoad) {
          throw new Error('Некоректний ідентифікатор відео.');
        }

        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

        const row = await db.getFirstAsync<VideoRow>(
          'SELECT id, uri, title, duration, currentTime FROM videos WHERE id = ?',
          videoId
        );

        if (!row) {
          throw new Error('Відео не знайдено у базі даних.');
        }

        if (active) {
          setVideo({
            ...row,
            duration: Number(row.duration ?? 0),
            currentTime: Number(row.currentTime ?? 0),
          });
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Не вдалося відкрити відео.');
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
  }, [canLoad, db, videoId]);

  if (loading) {
    return (
      <LiquidBackground>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={LIQUID_COLORS.textPrimary} />
          <Text style={styles.messageTitle}>Відкриваю відео</Text>
        </View>
      </LiquidBackground>
    );
  }

  if (error || !video) {
    return (
      <LiquidBackground>
        <View style={styles.centerState}>
          <GlassCard style={styles.messageCard}>
            <Text style={styles.messageTitle}>Помилка плеєра</Text>
            <Text style={styles.messageCopy}>{error ?? 'Відео недоступне.'}</Text>
            <Pressable
              onPress={() => {
                router.back();
              }}
              style={styles.inlineButton}>
              <Text style={styles.inlineButtonLabel}>Назад</Text>
            </Pressable>
          </GlassCard>
        </View>
      </LiquidBackground>
    );
  }

  return (
    <FullscreenPlayer
      video={video}
      onClose={async () => {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        router.back();
      }}
    />
  );
}

const styles = StyleSheet.create({
  playerRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  playerVideo: {
    flex: 1,
    backgroundColor: '#000000',
  },
  playerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingBottom: 18,
  },
  closeButton: {
    marginTop: 10,
    marginLeft: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  bottomOverlay: {
    paddingHorizontal: 16,
    gap: 12,
  },
  playerInfoCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  playerTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  playerMeta: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  overlayButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(8,15,31,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  overlayButtonLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  messageCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    gap: 10,
  },
  messageTitle: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  messageCopy: {
    color: LIQUID_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: LIQUID_COLORS.button,
    borderWidth: 1,
    borderColor: LIQUID_COLORS.softBorder,
  },
  inlineButtonLabel: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
