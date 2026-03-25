import { Platform } from 'react-native';

import { KodikPlayerSurface as NativeKodikPlayerSurface } from '@/src/components/player/kodik-player-surface.native';
import { KodikPlayerSurface as WebKodikPlayerSurface } from '@/src/components/player/kodik-player-surface.web';

export function KodikPlayerSurface({ uri }: { uri: string }) {
  if (Platform.OS === 'web') {
    return <WebKodikPlayerSurface uri={uri} />;
  }

  return <NativeKodikPlayerSurface uri={uri} />;
}
