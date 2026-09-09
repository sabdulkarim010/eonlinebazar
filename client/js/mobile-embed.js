/**
 * Mobile app WebView embed mode — strips duplicate header/footer and syncs language.
 * Activated via ?embed=mobile&lang=en|bn on info/CMS pages.
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get('embed') !== 'mobile') return;

  document.documentElement.classList.add('mobile-app-embed');

  const lang = String(params.get('lang') || '').trim().toLowerCase();
  if (lang === 'en' || lang === 'bn') {
    const applyLang = () => {
      if (window.i18n?.setLanguage) {
        window.i18n.setLanguage(lang);
      } else {
        try {
          localStorage.setItem('eonlinebazar_lang', lang);
        } catch (_) {
          /* ignore */
        }
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyLang);
    } else {
      applyLang();
    }
  }
})();
