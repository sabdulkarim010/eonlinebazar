const CACHE_NAME = 'eonlinebazar-v__BUILD_TIMESTAMP__';
const STATIC_ASSETS = [
  '/',
  '/search',
  '/cart',
  '/login',
  '/css/style.css',
  '/css/home.css',
  '/js/main.js',
  '/images/og-default.jpg',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip localhost entirely
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return; // Don't intercept - let browser handle normally
  }

  // NEVER intercept admin panel requests
  if (url.pathname.startsWith('/admin')) return;
  if (url.pathname.startsWith('/api/admin')) return;
  if (url.pathname.startsWith('/sys/')) return;

  // Skip non-GET
  if (event.request.method !== 'GET') return;

  // Skip cross-origin
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-cart') {
    event.waitUntil(syncOfflineCart());
  }
});

async function syncOfflineCart() {
  console.log('[SW] Cart sync triggered');
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
