import { useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import {
  legalPageUrlWithEmbed,
  legalTitleForSlug,
  MOBILE_EMBED_INJECT,
} from '../i18n/legalWebView';
import { API_ORIGIN } from '../services/api';
import { useTranslation } from '../store/useLanguageStore';
import { useAppTheme } from '../store/useThemeStore';

export const LEGAL_LINKS = [
  { titleKey: 'legal.privacy_policy', slug: 'privacy-policy' },
  { titleKey: 'legal.terms_conditions', slug: 'terms-conditions' },
  { titleKey: 'legal.contact_us', slug: 'contact' },
  { titleKey: 'legal.return_policy', slug: 'return-policy' },
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

export function legalPageUrl(slug, lang) {
  const key = String(slug || '').trim().toLowerCase();
  const path = PAGE_PATHS[key] || `/page/${encodeURIComponent(key)}`;
  const base = `${API_ORIGIN}${path}`;
  return legalPageUrlWithEmbed(base, lang);
}

function resolveScreenTitle(route, lang, t) {
  const titleKey = route.params?.titleKey;
  if (titleKey) return t(titleKey);
  const slug = route.params?.slug;
  if (slug) return legalTitleForSlug(slug, lang);
  return route.params?.title || t('screen.legal');
}

export default function LegalScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const { lang, t } = useTranslation();
  const slug = route.params?.slug || 'privacy-policy';
  const title = useMemo(
    () => resolveScreenTitle(route, lang, t),
    [route, lang, t]
  );
  const pageUrl = useMemo(() => legalPageUrl(slug, lang), [slug, lang]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          {t('legal.load_error')}
        </Text>
        <Text style={[styles.errorBody, { color: colors.muted }]}>{error}</Text>
        <Pressable
          style={[styles.retryBtn, { backgroundColor: colors.primaryBtn }]}
          onPress={() => {
            setError('');
            setLoading(true);
            setReloadKey((key) => key + 1);
          }}
        >
          <Text style={[styles.retryText, { color: colors.primaryBtnText }]}>
            {t('legal.try_again')}
          </Text>
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
        key={`${reloadKey}-${lang}`}
        source={{ uri: pageUrl }}
        originWhitelist={['https://*', 'http://*']}
        injectedJavaScriptBeforeContentLoaded={MOBILE_EMBED_INJECT}
        startInLoadingState={false}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(t('legal.page_error', { url: pageUrl }));
        }}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 400) {
            setLoading(false);
            setError(t('legal.http_error', { code: nativeEvent.statusCode }));
          }
        }}
        style={styles.webview}
      />
    </View>
  );
}
