import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FullscreenPlayer, normalizePlayableUri, type PlayableMedia } from '@/src/components/player/fullscreen-player';
import { KodikPlayerSurface } from './kodik-player-surface';
import { useApp } from '@/src/providers/app-provider';

type PlayerSnapshot = {
  currentTime: number;
  duration: number;
  playing: boolean;
};

type VideoPlayerScreenProps = {
  media: PlayableMedia;
  title?: string;
  subtitle?: string;
  onClose: () => Promise<void> | void;
  onPersistProgress?: (snapshot: PlayerSnapshot) => Promise<void> | void;
  onFinished?: () => Promise<void> | void;
};

function normalizeUrl(uri: string) {
  if (uri.startsWith('//')) {
    return `https:${uri}`;
  }

  return uri;
}

function shouldUseWebView(uri: string) {
  return /(^https?:)?\/\/[^/]*kodik\.(info|biz|site|cdn|link)/i.test(uri) || uri.includes('kodik.info');
}

function KodikWebViewPlayer({
  media,
  title,
  subtitle,
  onClose,
}: Pick<VideoPlayerScreenProps, 'media' | 'title' | 'subtitle' | 'onClose'>) {
  const { theme } = useApp();
  const { t } = useTranslation();
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!isClosing) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void onClose();
    }, 60);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isClosing, onClose]);

  return (
    <View style={styles.root}>
      <KodikPlayerSurface uri={normalizeUrl(media.uri)} active={!isClosing} />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <BlurView
          intensity={30}
          tint="dark"
          style={[
            styles.topBar,
            {
              borderColor: theme.cardBorder,
              backgroundColor: theme.cardBackground,
            },
          ]}>
          <Pressable
            onPress={() => {
              setIsClosing(true);
            }}
            style={[styles.iconButton, { backgroundColor: theme.surfaceMuted }]}>
            <Ionicons name="chevron-back" size={20} color={theme.textPrimary} />
          </Pressable>

          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
              {title || t('player.missingLinkTitle')}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </BlurView>
      </SafeAreaView>
    </View>
  );
}

export function VideoPlayerScreen(props: VideoPlayerScreenProps) {
  const { theme } = useApp();
  const { t } = useTranslation();
  const normalizedUri = normalizePlayableUri(props.media.uri);

  if (!normalizedUri || normalizedUri.trim() === '') {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.overlay}>
          <BlurView
            intensity={30}
            tint="dark"
            style={[
              styles.errorCard,
              {
                borderColor: theme.cardBorder,
                backgroundColor: theme.cardBackground,
              },
            ]}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{t('player.errorTitle')}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{t('player.emptyUrl')}</Text>
            <Pressable
              onPress={() => {
                void props.onClose();
              }}
              style={[styles.iconButton, { backgroundColor: theme.surfaceMuted }]}>
              <Ionicons name="chevron-back" size={20} color={theme.textPrimary} />
            </Pressable>
          </BlurView>
        </SafeAreaView>
      </View>
    );
  }

  if (shouldUseWebView(normalizedUri)) {
    return <KodikWebViewPlayer {...props} media={{ ...props.media, uri: normalizedUri }} />;
  }

  return <FullscreenPlayer {...props} media={{ ...props.media, uri: normalizedUri }} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  topBar: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorCard: {
    marginTop: 'auto',
    marginBottom: 'auto',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
});
