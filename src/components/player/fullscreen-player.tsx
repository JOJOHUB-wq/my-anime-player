import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  isPictureInPictureSupported,
  useVideoPlayer,
  VideoView,
  type VideoPlayer,
} from 'expo-video';

import { useApp } from '@/src/providers/app-provider';

export type PlayableMedia = {
  uri: string;
  progress?: number;
  duration?: number;
  headers?: Record<string, string>;
};

type PlayerSnapshot = {
  currentTime: number;
  duration: number;
  playing: boolean;
};

type FullscreenPlayerProps = {
  media: PlayableMedia;
  title?: string;
  subtitle?: string;
  onClose: () => Promise<void> | void;
  onPersistProgress?: (snapshot: PlayerSnapshot) => Promise<void> | void;
  onFinished?: () => Promise<void> | void;
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

export function FullscreenPlayer({
  media,
  title,
  subtitle,
  onClose,
  onPersistProgress,
  onFinished,
}: FullscreenPlayerProps) {
  const { theme } = useApp();
  const [position, setPosition] = useState(media.progress ?? 0);
  const [duration, setDuration] = useState(media.duration ?? 0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [skipFeedback, setSkipFeedback] = useState<string | null>(null);
  const controlsOpacity = useSharedValue(1);
  const feedbackOpacity = useSharedValue(0);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistAtRef = useRef(0);
  const progressTrackWidthRef = useRef(1);
  const videoViewRef = useRef<VideoView | null>(null);
  const finishedRef = useRef(false);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const feedbackStyle = useAnimatedStyle(() => ({
    opacity: feedbackOpacity.value,
  }));

  const pipSupported = useMemo(() => {
    try {
      return isPictureInPictureSupported();
    } catch {
      return false;
    }
  }, []);

  const player = useVideoPlayer(
    {
      uri: media.uri,
      headers: media.headers,
      contentType: media.uri.includes('.m3u8') ? 'hls' : 'auto',
      metadata: {
        title,
        artist: subtitle,
      },
    },
    (videoPlayer) => {
    videoPlayer.staysActiveInBackground = true;
    videoPlayer.currentTime = media.progress ?? 0;
    videoPlayer.play();
    }
  );

  const persistSnapshot = useCallback(
    async (snapshot: PlayerSnapshot) => {
      if (!onPersistProgress) {
        return;
      }

      await onPersistProgress(snapshot);
    },
    [onPersistProgress]
  );

  const clearHideTimer = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
  }, []);

  const scheduleAutoHide = useCallback(() => {
    clearHideTimer();
    controlsTimeoutRef.current = setTimeout(() => {
      controlsOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
        if (finished) {
          runOnJS(setShowControls)(false);
        }
      });
    }, 3000);
  }, [clearHideTimer, controlsOpacity]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    controlsOpacity.value = withTiming(1, { duration: 180 });
    scheduleAutoHide();
  }, [controlsOpacity, scheduleAutoHide]);

  const hideControls = useCallback(() => {
    clearHideTimer();
    controlsOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
      if (finished) {
        runOnJS(setShowControls)(false);
      }
    });
  }, [clearHideTimer, controlsOpacity]);

  useEffect(() => {
    revealControls();

    return () => {
      clearHideTimer();
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, [clearHideTimer, revealControls]);

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
    if (finishedRef.current || duration <= 0) {
      return;
    }

    if (position >= Math.max(duration - 0.5, 0.5)) {
      finishedRef.current = true;
      const snapshot = readSnapshot(player) ?? {
        currentTime: duration,
        duration,
        playing: false,
      };
      void persistSnapshot(snapshot);
      void onFinished?.();
    }
  }, [duration, onFinished, persistSnapshot, player, position]);

  const showTransientFeedback = useCallback(
    (label: string) => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }

      setSkipFeedback(label);
      feedbackOpacity.value = withTiming(1, { duration: 120 });

      feedbackTimeoutRef.current = setTimeout(() => {
        feedbackOpacity.value = withTiming(0, { duration: 180 });
        setSkipFeedback(null);
      }, 700);
    },
    [feedbackOpacity]
  );

  const handleScreenPress = useCallback(() => {
    if (showControls) {
      hideControls();
      return;
    }

    revealControls();
  }, [hideControls, revealControls, showControls]);

  const handleSeekBy = useCallback(
    (seconds: number) => {
      try {
        player.seekBy(seconds);
      } catch {
        const nextTime = Math.max(0, (player.currentTime || 0) + seconds);
        player.currentTime = nextTime;
      }

      setPosition((current) => {
        const nextTime = current + seconds;
        if (duration > 0) {
          return Math.max(0, Math.min(duration, nextTime));
        }
        return Math.max(0, nextTime);
      });

      revealControls();
      showTransientFeedback(`${seconds > 0 ? '+' : ''}${seconds}s`);
    },
    [duration, player, revealControls, showTransientFeedback]
  );

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }

    revealControls();
  }, [isPlaying, player, revealControls]);

  const handleClose = useCallback(async () => {
    const snapshot = readSnapshot(player);
    if (snapshot) {
      await persistSnapshot(snapshot);
    }

    await onClose();
  }, [onClose, persistSnapshot, player]);

  const handleProgressTrackLayout = useCallback((event: LayoutChangeEvent) => {
    progressTrackWidthRef.current = Math.max(event.nativeEvent.layout.width, 1);
  }, []);

  const seekToRatio = useCallback(
    (nextRatio: number) => {
      if (!duration || duration <= 0) {
        return;
      }

      const safeRatio = Math.max(0, Math.min(nextRatio, 1));
      const nextTime = duration * safeRatio;
      player.currentTime = nextTime;
      setPosition(nextTime);
      revealControls();
    },
    [duration, player, revealControls]
  );

  const handleProgressTrackPress = useCallback(
    (event: GestureResponderEvent) => {
      const ratio = event.nativeEvent.locationX / progressTrackWidthRef.current;
      seekToRatio(ratio);
    },
    [seekToRatio]
  );

  const handleToggleFullscreen = useCallback(async () => {
    const nextExpanded = !isExpanded;
    setIsExpanded(nextExpanded);

    if (nextExpanded) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }

    revealControls();
  }, [isExpanded, revealControls]);

  const handleStartPictureInPicture = useCallback(async () => {
    revealControls();

    if (!pipSupported || !videoViewRef.current) {
      showTransientFeedback('PiP');
      return;
    }

    try {
      await videoViewRef.current.startPictureInPicture();
    } catch {
      showTransientFeedback('PiP');
    }
  }, [pipSupported, revealControls, showTransientFeedback]);

  const progressRatio = duration > 0 ? Math.max(0, Math.min(position / duration, 1)) : 0;

  return (
    <View style={styles.root}>
      <VideoView
        ref={videoViewRef}
        style={styles.video}
        player={player}
        nativeControls={false}
        contentFit="contain"
        allowsPictureInPicture
        startsPictureInPictureAutomatically={false}
      />

      <Pressable onPress={handleScreenPress} style={StyleSheet.absoluteFill} />

      {skipFeedback ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.feedbackBubble,
            feedbackStyle,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.cardBorder,
            },
          ]}>
          <Text style={[styles.feedbackText, { color: theme.textPrimary }]}>{skipFeedback}</Text>
        </Animated.View>
      ) : null}

      <Animated.View
        pointerEvents={showControls ? 'box-none' : 'none'}
        style={[styles.overlay, overlayStyle]}>
        <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
          <View style={styles.topBar} pointerEvents="box-none">
            <Pressable
              onPress={() => {
                void handleClose();
              }}
              style={[
                styles.iconButton,
                styles.topBackButton,
                {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.cardBorder,
                },
              ]}>
              <Ionicons name="chevron-back" size={20} color={theme.textPrimary} />
            </Pressable>

            <View style={styles.titleWrap}>
              {title ? (
                <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.centerControls} pointerEvents="box-none">
            <BlurView
              intensity={44}
              tint="dark"
              style={[
                styles.centerControlsBar,
                {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.cardBorder,
                },
              ]}>
              <Pressable
                onPress={() => {
                  handleSeekBy(-15);
                }}
                style={[
                  styles.centerButton,
                  {
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.cardBorder,
                  },
                ]}>
                <Ionicons name="play-back" size={22} color={theme.textPrimary} />
                <Text style={[styles.centerButtonLabel, { color: theme.textPrimary }]}>15</Text>
              </Pressable>

              <Pressable
                onPress={togglePlayback}
                style={[
                  styles.playPauseButton,
                  {
                    backgroundColor: theme.surfaceStrong,
                    borderColor: theme.cardBorder,
                  },
                ]}>
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={28}
                  color={theme.textPrimary}
                />
              </Pressable>

              <Pressable
                onPress={() => {
                  handleSeekBy(15);
                }}
                style={[
                  styles.centerButton,
                  {
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.cardBorder,
                  },
                ]}>
                <Ionicons name="play-forward" size={22} color={theme.textPrimary} />
                <Text style={[styles.centerButtonLabel, { color: theme.textPrimary }]}>15</Text>
              </Pressable>
            </BlurView>
          </View>

          <View style={styles.bottomBarWrap} pointerEvents="box-none">
            <BlurView
              intensity={42}
              tint="dark"
              style={[
                styles.bottomBar,
                {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.cardBorder,
                },
              ]}>
              <View style={styles.timelineHeader}>
                <Text style={[styles.timeText, { color: theme.textSecondary }]}>
                  {formatClock(position)}
                </Text>
                <Text style={[styles.timeText, { color: theme.textSecondary }]}>
                  {formatClock(duration)}
                </Text>
              </View>

              <View
                onLayout={handleProgressTrackLayout}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={handleProgressTrackPress}
                onResponderMove={handleProgressTrackPress}
                style={[styles.progressTrack, { backgroundColor: theme.surfaceMuted }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progressRatio * 100}%`,
                      backgroundColor: theme.accentPrimary,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.progressThumb,
                    {
                      left: `${progressRatio * 100}%`,
                      backgroundColor: theme.textPrimary,
                    },
                  ]}
                />
              </View>

              <View style={styles.bottomActions}>
                <Pressable
                  onPress={() => {
                    void handleStartPictureInPicture();
                  }}
                  style={[
                    styles.bottomSmallButton,
                    {
                      backgroundColor: theme.surfaceMuted,
                      borderColor: theme.cardBorder,
                      opacity: pipSupported ? 1 : 0.55,
                    },
                  ]}>
                  <Ionicons name="contract-outline" size={18} color={theme.textPrimary} />
                </Pressable>

                <Pressable
                  onPress={() => {
                    void handleToggleFullscreen();
                  }}
                  style={[
                    styles.bottomSmallButton,
                    {
                      backgroundColor: theme.surfaceMuted,
                      borderColor: theme.cardBorder,
                    },
                  ]}>
                  <Ionicons
                    name={isExpanded ? 'contract' : 'expand'}
                    size={18}
                    color={theme.textPrimary}
                  />
                </Pressable>
              </View>
            </BlurView>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  video: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topBackButton: {
    flexShrink: 0,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  centerControls: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  centerControlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
  },
  centerButton: {
    width: 72,
    height: 72,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  playPauseButton: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  feedbackBubble: {
    position: 'absolute',
    top: '20%',
    alignSelf: 'center',
    minWidth: 88,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
  },
  feedbackText: {
    fontSize: 14,
    fontWeight: '800',
  },
  bottomBarWrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  bottomBar: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    overflow: 'hidden',
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'visible',
    justifyContent: 'center',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressThumb: {
    position: 'absolute',
    top: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
  },
  bottomActions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  bottomSmallButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
