import { StyleSheet, Text, View } from 'react-native';

import { MediaItem, PlayerSettings } from '@/src/types/media';

type AnimeVideoPlayerProps = {
  item: MediaItem;
  settings: PlayerSettings;
};

export function AnimeVideoPlayer({ item }: AnimeVideoPlayerProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{item.cleanTitle}</Text>
      <Text style={styles.copy}>У цій збірці використовується плеєр через expo-video.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#070B12',
  },
  title: {
    color: '#F4F7FB',
    fontSize: 22,
    fontWeight: '700',
  },
  copy: {
    color: '#A4B0C1',
    fontSize: 14,
    textAlign: 'center',
  },
});
