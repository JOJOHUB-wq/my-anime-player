import { useVideoPlayer, VideoView } from 'expo-video';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { MediaItem, PlaybackProgress, PlayerSettings } from '@/src/types/media';
import { formatClock } from '@/src/utils/time';

type AnimeVideoPlayerProps = {
  item: MediaItem;
  settings: PlayerSettings;
  onBack: () => void;
  onProgressChange: (progress: PlaybackProgress) => void;
  onMetadataChange: (patch: Partial<MediaItem>) => void;
  onFinished: () => Promise<void> | void;
};

export function AnimeVideoPlayer({
  item,
  onBack,
}: AnimeVideoPlayerProps) {
  const player = useVideoPlayer(item.uri, (videoPlayer) => {
    videoPlayer.currentTime = (item.progress?.positionMs ?? 0) / 1000;
    videoPlayer.play();
  });

  return (
    <View style={styles.root}>
      <VideoView style={styles.video} player={player} nativeControls contentFit="contain" />
      <SafeAreaView style={styles.overlay}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} style={styles.actionButton}>
            <Text style={styles.actionLabel}>Назад</Text>
          </Pressable>
        </View>
        <View style={styles.bottomSheet}>
          <Text style={styles.videoTitle}>{item.cleanTitle}</Text>
          <Text style={styles.videoMeta}>{formatClock((item.durationMs ?? 0) / 1000)}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topRow: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  actionButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,10,0.72)',
  },
  actionLabel: {
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomSheet: {
    marginHorizontal: 18,
    marginBottom: 18,
    padding: 18,
    borderRadius: 26,
    backgroundColor: 'rgba(10,10,10,0.72)',
  },
  videoTitle: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '800',
  },
  videoMeta: {
    marginTop: 4,
    color: '#A1A1AA',
    fontSize: 13,
  },
});
