const CACHE_NAME = 'mijlai-cache-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icon.svg',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching for API endpoints (/api/*) to ensure fresh real-time streaming data
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for navigations (HTML pages) so new deployments show
  // immediately; falls back to the cached page when offline.
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
        .catch(() =>
          caches.match(event.request).then((cached) =>
            cached ||
            caches.match('/index.html').then((shell) => {
              if (shell) return shell;
              return new Response(
                '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MijlAi — غير متصل</title><style>body{font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#e8f0fe;color:#0f172a;margin:0}div{text-align:center;padding:2rem}h1{font-size:1.2rem}p{color:#64748b;font-size:.9rem}</style></head><body><div><h1>لا يوجد اتصال بالإنترنت</h1><p>سيتم تحميل MijlAi تلقائياً عند عودة الاتصال. محادثاتك المحفوظة متاحة بعد العودة.</p></div></body></html>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
              )
            })
          )
        )
    );
    return;
  }

  // Stale-while-revalidate for hashed static assets (fingerprinted by Vite)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
