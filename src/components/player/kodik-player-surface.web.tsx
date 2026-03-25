import type { CSSProperties } from 'react';
import { StyleSheet, View } from 'react-native';

const iframeStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  backgroundColor: '#000000',
};

export function KodikPlayerSurface({ uri }: { uri: string; active?: boolean }) {
  return (
    <View style={styles.root}>
      <iframe
        src={uri}
        style={iframeStyle}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
