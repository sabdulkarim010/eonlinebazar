/**
 * PWA: service worker registration + install prompt banner
 */
let deferredPrompt;

function isInstallBannerDismissed() {
  const dismissed = localStorage.getItem('pwa-dismissed');
  if (!dismissed) return false;
  return Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000;
}

function showInstallBanner() {
  if (isInstallBannerDismissed() || document.getElementById('pwa-install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.innerHTML = `
    <div class="pwa-banner-content">
      <span>📱 Install the EOnlineBazar app — get quick access!</span>
      <button id="pwa-install-btn" type="button">Install</button>
      <button id="pwa-dismiss-btn" type="button">Later</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('pwa-install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    banner.remove();
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });

  document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('pwa-dismissed', String(Date.now()));
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] App installed');
  deferredPrompt = null;
  document.getElementById('pwa-install-banner')?.remove();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(
        '/service-worker.js',
        { updateViaCache: 'none' }
      );
      console.log('[SW] Registered:', reg.scope);

      reg.update();
      setInterval(() => reg.update(), 30 * 60 * 1000);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] New version available, reloading...');
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    } catch (err) {
      console.warn('[SW] Registration failed:', err);
    }
  });
}
