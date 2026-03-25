import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const STOP_KODIK_PLAYBACK_SCRIPT = `
(function() {
  try {
    var mediaElements = Array.prototype.slice.call(document.querySelectorAll('video, audio'));
    mediaElements.forEach(function(media) {
      try { media.pause(); } catch (error) {}
      try { media.currentTime = 0; } catch (error) {}
      try { media.removeAttribute('src'); } catch (error) {}
      try { if (typeof media.load === 'function') { media.load(); } } catch (error) {}
    });

    var iframeElements = Array.prototype.slice.call(document.querySelectorAll('iframe'));
    iframeElements.forEach(function(frame) {
      try { frame.src = 'about:blank'; } catch (error) {}
    });

    try {
      if (window.player && typeof window.player.pause === 'function') {
        window.player.pause();
      }
    } catch (error) {}

    try {
      if (typeof window.stop === 'function') {
        window.stop();
      }
    } catch (error) {}

    true;
  } catch (error) {
    true;
  }
})();
`;

function stopWebViewPlayback(target: WebView | null) {
  if (!target) {
    return;
  }

  try {
    target.injectJavaScript(STOP_KODIK_PLAYBACK_SCRIPT);
  } catch {}

  try {
    target.stopLoading();
  } catch {}
}

export function KodikPlayerSurface({ uri, active = true }: { uri: string; active?: boolean }) {
  const webViewRef = useRef<WebView>(null);
  const [shouldRenderWebView, setShouldRenderWebView] = useState(true);

  useEffect(() => {
    if (active) {
      setShouldRenderWebView(true);
      return;
    }

    stopWebViewPlayback(webViewRef.current);

    const timeoutId = setTimeout(() => {
      setShouldRenderWebView(false);
    }, 140);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [active]);

  useEffect(() => {
    const currentWebView = webViewRef.current;

    return () => {
      stopWebViewPlayback(currentWebView);
    };
  }, []);

  return (
    <View style={styles.root}>
      {shouldRenderWebView ? (
        <WebView
          ref={webViewRef}
          source={{ uri }}
          style={styles.webview}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
