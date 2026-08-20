function getAnalyticsScript() {
    const gaId = process.env.GOOGLE_ANALYTICS_ID;
    const enabled = process.env.GOOGLE_ANALYTICS_ENABLED === 'true';

    if (!gaId || !enabled || process.env.NODE_ENV !== 'production') {
        if (process.env.NODE_ENV !== 'production') {
            return `
<script>
  // GA4 Mock (development mode)
  window.gtag = function() {
    console.log('[GA4 Mock]', ...arguments);
  };
  window.dataLayer = window.dataLayer || [];
  console.log('[GA4] Development mode - tracking disabled, using mock');
</script>`;
        }
        return '';
    }

    return `
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${gaId}', {
    page_title: document.title,
    page_location: window.location.href,
    send_page_view: true,
    cookie_flags: 'SameSite=None;Secure',
    anonymize_ip: true
  });

  window.GA_ID = '${gaId}';
</script>`;
}

module.exports = { getAnalyticsScript };
