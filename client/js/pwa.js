async function checkSWEnabled() {
  try {
    const res = await fetch('/api/store/cache-settings');
    const data = await res.json();
    return data.serviceWorkerEnabled !== false; // default true
  } catch {
    return true; // default to enabled
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {

    // NEVER register SW on localhost or development
    const isLocalhost = (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]' ||
      window.location.hostname.startsWith('192.168.')
    );

    if (isLocalhost) {
      // On localhost: unregister any existing SW and stop
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
        console.log('[SW] Unregistered SW on localhost — caching disabled for dev');
      }
      return; // EXIT — do not register SW on localhost
    }

    const swEnabled = await checkSWEnabled();
    if (!swEnabled) {
      console.log('[SW] Disabled by admin settings');
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.unregister();
      return;
    }

    // Production only: register SW
    try {
      const reg = await navigator.serviceWorker.register(
        '/service-worker.js',
        { updateViaCache: 'none' }
      );

      console.log('[SW] Registered:', reg.scope);

      // Check for updates every hour
      setInterval(() => reg.update(), 60 * 60 * 1000);

      // Handle updates safely — NO automatic reload
      let updateReady = false;

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller &&
            !updateReady
          ) {
            updateReady = true;
            // Tell SW to skip waiting
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      // Only reload ONCE when SW takes control
      // Use sessionStorage to prevent reload loop
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const lastReload = sessionStorage.getItem('sw_last_reload');
        const now = Date.now();

        // Only reload if more than 30 seconds since last reload
        if (!lastReload || (now - parseInt(lastReload, 10)) > 30000) {
          sessionStorage.setItem('sw_last_reload', now.toString());
          window.location.reload();
        }
        // Otherwise: ignore the controllerchange (prevent loop)
      });

    } catch (err) {
      console.warn('[SW] Registration failed:', err);
    }
  });
}



