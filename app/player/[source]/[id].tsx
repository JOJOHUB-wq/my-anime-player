import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ScreenOrientation from 'expo-screen-orientation';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';

import {
  getVideoById,
  initializeDatabase,
  updateVideoProgress,
  type VideoRow,
} from '@/src/db/database';
import { GlassCard } from '@/src/components/ui/glass-card';
import { LiquidBackground } from '@/src/components/ui/liquid-background';
import { LIQUID_COLORS } from '@/src/theme/liquid';

type PlayerSnapshot = {
  currentTime: number;
  duration: number;
  playing: boolean;
};

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
  const [position, setPosition] = useState(video.progress);
  const [duration, setDuration] = useState(video.duration);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [interactionTick, setInteractionTick] = useState(0);
  const lastPersistAtRef = useRef(0);
  const hideControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const progressTrackWidthRef = useRef(1);

  const player = useVideoPlayer({ uri: video.uri }, (videoPlayer) => {
    videoPlayer.staysActiveInBackground = true;
    videoPlayer.currentTime = video.progress;
    videoPlayer.play();
  });

  const persistSnapshot = useCallback(
    async (snapshot: PlayerSnapshot) => {
      await updateVideoProgress(db, video.id, snapshot.currentTime, snapshot.duration);
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

  useEffect(() => {
    Animated.timing(controlsOpacity, {
      toValue: showControls && !isLocked ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [controlsOpacity, isLocked, showControls]);

  useEffect(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }

    if (!showControls || isLocked) {
      return;
    }

    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 5000);

    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
        hideControlsTimeoutRef.current = null;
      }
    };
  }, [interactionTick, isLocked, showControls]);

  const keepControlsAlive = useCallback(() => {
    if (isLocked) {
      return;
    }

    setShowControls(true);
    setInteractionTick((current) => current + 1);
  }, [isLocked]);

  const togglePlayback = useCallback(() => {
    keepControlsAlive();

    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
      return;
    }

    player.play();
    setIsPlaying(true);
  }, [isPlaying, keepControlsAlive, player]);

  const handleClose = useCallback(async () => {
    const snapshot = readSnapshot(player);
    if (snapshot) {
      await persistSnapshot(snapshot);
    }
    await onClose();
  }, [onClose, persistSnapshot, player]);

  const handleSurfacePress = useCallback(() => {
    if (isLocked) {
      return;
    }

    if (showControls) {
      setShowControls(false);
      return;
    }

    setShowControls(true);
    setInteractionTick((current) => current + 1);
  }, [isLocked, showControls]);

  const handleLock = useCallback((event?: GestureResponderEvent) => {
    event?.stopPropagation();
    setIsLocked(true);
    setShowControls(false);
  }, []);

  const handleUnlock = useCallback(() => {
    setIsLocked(false);
    setShowControls(true);
    setInteractionTick((current) => current + 1);
  }, []);

  const seekToRatio = useCallback(
    (nextRatio: number) => {
      if (!duration || duration <= 0) {
        return;
      }

      keepControlsAlive();
      const safeRatio = Math.max(0, Math.min(nextRatio, 1));
      const nextTime = duration * safeRatio;
      player.currentTime = nextTime;
      setPosition(nextTime);
    },
    [duration, keepControlsAlive, player]
  );

  const handleProgressTrackLayout = useCallback((event: LayoutChangeEvent) => {
    progressTrackWidthRef.current = Math.max(event.nativeEvent.layout.width, 1);
  }, []);

  const handleProgressTrackPress = useCallback(
    (event: GestureResponderEvent) => {
      const ratio = event.nativeEvent.locationX / progressTrackWidthRef.current;
      seekToRatio(ratio);
    },
    [seekToRatio]
  );

  const progressRatio = duration > 0 ? Math.max(0, Math.min(position / duration, 1)) : 0;

  return (
    <View style={styles.playerRoot}>
      <VideoView style={styles.playerVideo} player={player} nativeControls={false} contentFit="contain" />

      {!isLocked ? <Pressable style={styles.tapSurface} onPress={handleSurfacePress} /> : null}

      {isLocked ? (
        <SafeAreaView style={styles.lockedOverlay} pointerEvents="box-none">
          <Pressable onPress={handleUnlock} style={styles.unlockButton}>
            <Ionicons name="lock-open-outline" size={20} color={LIQUID_COLORS.textPrimary} />
          </Pressable>
        </SafeAreaView>
      ) : (
        <SafeAreaView style={styles.playerOverlay} pointerEvents="box-none">
          <Animated.View
            pointerEvents={showControls ? 'box-none' : 'none'}
            style={[styles.topBar, { opacity: controlsOpacity }]}>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                keepControlsAlive();
                void handleClose();
              }}
              style={styles.closeButton}>
              <Ionicons name="chevron-back" size={20} color={LIQUID_COLORS.textPrimary} />
            </Pressable>
          </Animated.View>

          <Animated.View
            pointerEvents={showControls ? 'box-none' : 'none'}
            style={[styles.bottomOverlay, { opacity: controlsOpacity }]}>
            <BlurView intensity={40} tint="dark" style={styles.bottomBar}>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  togglePlayback();
                }}
                style={styles.bottomIconButton}>
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={20}
                  color={LIQUID_COLORS.textPrimary}
                />
              </Pressable>

              <Text style={styles.timeText}>{formatClock(position)}</Text>

              <View style={styles.progressWrap}>
                <View
                  onLayout={handleProgressTrackLayout}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={handleProgressTrackPress}
                  onResponderMove={handleProgressTrackPress}
                  style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
                  <View style={[styles.progressThumb, { left: `${progressRatio * 100}%` }]} />
                </View>
              </View>

              <Text style={styles.timeText}>{formatClock(duration)}</Text>

              <Pressable
                onPress={handleLock}
                style={styles.bottomIconButton}>
                <Ionicons name="lock-closed" size={18} color={LIQUID_COLORS.textPrimary} />
              </Pressable>
            </BlurView>
          </Animated.View>
        </SafeAreaView>
      )}
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
        if (!canLoad) {
          throw new Error('Некоректний ідентифікатор відео.');
        }

        await initializeDatabase(db);
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

        const row = await getVideoById(db, videoId);

        if (!row) {
          throw new Error('Відео не знайдено у базі даних.');
        }

        if (active) {
          setVideo(row);
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
  },
  tapSurface: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: 18,
  },
  unlockButton: {
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
    paddingBottom: 18,
  },
  bottomBar: {
    minHeight: 68,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    backgroundColor: 'rgba(7,11,18,0.46)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  bottomIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  timeText: {
    color: LIQUID_COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    minWidth: 44,
    textAlign: 'center',
  },
  progressWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 20,
    justifyContent: 'center',
  },
  progressFill: {
    height: 4,
    borderRadius: 999,
    backgroundColor: LIQUID_COLORS.textPrimary,
  },
  progressThumb: {
    position: 'absolute',
    top: 3,
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
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
