import { StyleSheet, View } from 'react-native';

type ProgressBarProps = {
  progress: number;
  trackColor: string;
  fillColor: string;
};

export function ProgressBar({ progress, trackColor, fillColor }: ProgressBarProps) {
  return (
    <View style={[styles.track, { backgroundColor: trackColor }]}>
      <View style={[styles.fill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: fillColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 5,
    width: '100%',
    overflow: 'hidden',
    borderRadius: 999,
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});
