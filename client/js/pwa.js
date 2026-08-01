async function checkSWEnabled() {
  try {
    const res = await fetch('/api/store/cache-settings');
    const data = await res.json();
    return data.serviceWorkerEnabled !== false;
  } catch {
    return true;
  }
}

if ('serviceWorker' in navigator) {
  const isLocalhost = (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );

  if (isLocalhost) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
  } else {
    window.addEventListener('load', async () => {
      const swEnabled = await checkSWEnabled();
      if (!swEnabled) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
        return;
      }

      try {
        const reg = await navigator.serviceWorker.register(
          '/service-worker.js',
          { updateViaCache: 'none' }
        );

        reg.update();

        setInterval(() => reg.update(), 30 * 60 * 1000);

        let reloadOnce = false;

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloadOnce) return;
          reloadOnce = true;
          console.log('[SW] New version active, reloading...');
          window.location.reload();
        });
      } catch (err) {
        console.warn('[SW] Registration failed:', err);
      }
    });
  }
}
