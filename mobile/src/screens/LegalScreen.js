import { useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { API_ORIGIN } from '../services/api';
import { useAppTheme } from '../store/useThemeStore';

export const LEGAL_LINKS = [
  { title: 'Privacy Policy', slug: 'privacy-policy' },
  { title: 'Terms & Conditions', slug: 'terms-conditions' },
  { title: 'Contact Us', slug: 'contact' },
  { title: 'Return Policy', slug: 'return-policy' },
];

const PAGE_PATHS = {
  'privacy-policy': '/privacy-policy',
  privacy: '/privacy-policy',
  terms: '/terms-conditions',
  'terms-conditions': '/terms-conditions',
  'terms-and-conditions': '/terms-conditions',
  contact: '/contact',
  about: '/about',
  'return-policy': '/return-policy',
};

export function legalPageUrl(slug) {
  const key = String(slug || '').trim().toLowerCase();
  const path = PAGE_PATHS[key] || `/page/${encodeURIComponent(key)}`;
  return `${API_ORIGIN}${path}`;
}

export default function LegalScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const slug = route.params?.slug || 'privacy-policy';
  const title = route.params?.title || 'Legal';
  const pageUrl = useMemo(() => legalPageUrl(slug), [slug]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Could not load page</Text>
        <Text style={[styles.errorBody, { color: colors.muted }]}>{error}</Text>
        <Pressable
          style={[styles.retryBtn, { backgroundColor: colors.primaryBtn }]}
          onPress={() => {
            setError('');
            setLoading(true);
            setReloadKey((key) => key + 1);
          }}
        >
          <Text style={[styles.retryText, { color: colors.primaryBtnText }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {loading ? (
        <View style={[styles.loaderWrap, { backgroundColor: colors.bg }]}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : null}
      <WebView
        key={reloadKey}
        source={{ uri: pageUrl }}
        originWhitelist={['https://*', 'http://*']}
        startInLoadingState={false}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(`Unable to open ${pageUrl}`);
        }}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 400) {
            setLoading(false);
            setError(`This page returned ${nativeEvent.statusCode}.`);
          }
        }}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loaderWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  retryBtn: {
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
