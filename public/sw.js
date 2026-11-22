const CACHE_VERSION = 'digital-armory-offline-v5-0';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION && k.startsWith('digital-armory-'))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'PRECACHE_URLS' && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(CACHE_VERSION).then(async (cache) => {
        for (const rawUrl of data.urls) {
          try {
            await cache.add(rawUrl);
          } catch {
            // Skip missing optional URL silently so partial caches still succeed
          }
        }
      })
    );
  } else if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.delete(CACHE_VERSION));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Stale-while-revalidate for precached assets and same-origin static files
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const netPromise = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            void cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      return cached || netPromise;
    })
  );
});
