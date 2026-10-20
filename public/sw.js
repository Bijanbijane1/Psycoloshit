// Standalone Service Worker for Psychology Library Offline Access (Phase 9)
const CACHE_NAME = 'psychology-pwa-v9';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch((err) => {
        console.warn('Pre-cache error:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      let deletedLegacy = false;
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            deletedLegacy = true;
            return caches.delete(name);
          }
          return Promise.resolve(false);
        })
      ).then(() => self.clients.claim()).then(() => {
        if (deletedLegacy) {
          return self.clients.matchAll({ type: 'window' }).then((windowClients) => {
            return Promise.all(
              windowClients.map((client) => {
                if ('navigate' in client) {
                  return client.navigate(client.url).catch(() => {});
                }
                return Promise.resolve();
              })
            );
          });
        }
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  // Strictly ignore non-HTTP(S) schemes (e.g., chrome-extension://)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Strict /api/* bypass: NEVER cache or intercept backend API routes
  // (/api/auth/*, /api/user/sync, /api/leaderboard/*, /api/ai/*, /api/analytics/*)
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
    return;
  }

  // Never intercept or cache Vite dev server source modules (/src/*), node_modules, or HMR endpoints
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.includes('@vite') ||
    url.pathname.includes('__vite') ||
    url.pathname.includes('node_modules') ||
    url.searchParams.has('t') ||
    url.searchParams.has('import') ||
    url.searchParams.has('direct')
  ) {
    return;
  }

  // Navigation requests (HTML): Network-First so UI updates are immediately visible, fallback to cache offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match('/index.html').then((res) => res || caches.match('/'));
        })
    );
    return;
  }

  // Stale-While-Revalidate for static production assets (icons, fonts, manifest, hashed bundles)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});


