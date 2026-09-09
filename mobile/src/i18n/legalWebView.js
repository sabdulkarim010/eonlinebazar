import { LEGAL_TITLE_KEYS, translate } from './translations';

export function legalTitleForSlug(slug, lang) {
  const key = LEGAL_TITLE_KEYS[String(slug || '').trim().toLowerCase()];
  return key ? translate(lang, key) : translate(lang, 'screen.legal');
}

export function legalPageUrlWithEmbed(baseUrl, lang) {
  const url = new URL(baseUrl);
  url.searchParams.set('embed', 'mobile');
  if (lang === 'en' || lang === 'bn') {
    url.searchParams.set('lang', lang);
  }
  return url.toString();
}

/** Injected into WebView to hide duplicate chrome if query param is stripped by redirects */
export const MOBILE_EMBED_INJECT = `
(function() {
  document.documentElement.classList.add('mobile-app-embed');
  var style = document.createElement('style');
  style.textContent = '.amazon-header,#global-site-footer,.whatsapp-floating-container,.sw-chat-widget,#cw-root{display:none!important}';
  document.head.appendChild(style);
})();
true;
`;
