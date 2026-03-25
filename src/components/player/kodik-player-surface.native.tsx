import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

export function KodikPlayerSurface({ uri, active = true }: { uri: string; active?: boolean }) {
  const webViewRef = useRef<WebView>(null);
  const [shouldRenderWebView, setShouldRenderWebView] = useState(true);

  useEffect(() => {
    if (active) {
      setShouldRenderWebView(true);
      return;
    }

    try {
      webViewRef.current?.injectJavaScript(
        'document.querySelectorAll("video").forEach(function(v){try{v.pause();}catch(e){}}); true;'
      );
    } catch {
      // noop
    }

    const timeoutId = setTimeout(() => {
      setShouldRenderWebView(false);
    }, 40);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [active]);

  useEffect(() => {
    const currentWebView = webViewRef.current;

    return () => {
      try {
        currentWebView?.injectJavaScript(
          'document.querySelectorAll("video").forEach(function(v){try{v.pause();}catch(e){}}); true;'
        );
      } catch {
        // noop
      }
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
