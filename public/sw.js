const CACHE_NAME = 'travelbuff-v7.3.0';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install Event - Pre-cache core app shell with resilient error handling
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[Service Worker] Pre-caching core app shell');
        await Promise.allSettled(
          ASSETS_TO_CACHE.map(async (url) => {
            try {
              const res = await fetch(url);
              if (res && res.status === 200) {
                await cache.put(url, res);
              }
            } catch (err) {
              console.warn('[Service Worker] Non-blocking pre-cache skip for:', url);
            }
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old cache versions safely
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME && !cache.startsWith('travelbuff-v7.3.0')) {
            console.log('[Service Worker] Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Exclude API requests, uploads, WebSockets, and non-GET methods from SW interception
  if (
    requestUrl.pathname.startsWith('/api') || 
    requestUrl.pathname.startsWith('/uploads') || 
    event.request.url.includes('ws') ||
    event.request.method !== 'GET'
  ) {
    return; // Let browser handle natively
  }

  // Network-First strategy for HTML navigation with offline fallback
  if (event.request.mode === 'navigate' || requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
              cache.put('/index.html', responseToCache.clone());
              cache.put('/', responseToCache.clone());
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline navigation fallback: serve cached index.html or root
          return caches.match('/index.html').then((response) => response || caches.match('/'));
        })
    );
    return;
  }

  // Cache-First strategy with dual query & clean-path matching for offline reliability
  event.respondWith(
    (async () => {
      const cleanUrl = requestUrl.origin + requestUrl.pathname;

      // 1. Check exact request in cache
      let cached = await caches.match(event.request);
      if (cached) return cached;

      // 2. Check clean path without query parameters
      if (requestUrl.search) {
        cached = await caches.match(cleanUrl);
        if (cached) return cached;
      }

      // 3. Fallback check with ignoreSearch across all open caches
      cached = await caches.match(event.request, { ignoreSearch: true });
      if (cached) return cached;

      cached = await caches.match(cleanUrl, { ignoreSearch: true });
      if (cached) return cached;

      // 4. Not in cache: Attempt network fetch and dynamically store in cache
      try {
        const networkResponse = await fetch(event.request);
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors' || networkResponse.type === 'opaque')
        ) {
          const responseToCache = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, responseToCache);
          if (requestUrl.search) {
            try {
              await cache.put(cleanUrl, responseToCache.clone());
            } catch (e) {
              // Ignore opaque put errors on synthetic paths
            }
          }
        }
        return networkResponse;
      } catch (err) {
        console.warn('[Service Worker] Offline resource not found:', event.request.url);
        return new Response('', {
          status: 404,
          statusText: 'Offline Resource Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      }
    })()
  );
});

