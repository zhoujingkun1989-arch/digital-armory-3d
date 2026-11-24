const OFFLINE_CACHE_NAME = 'digital-armory-offline-v6-0';
const RUNTIME_CACHE_NAME = 'digital-armory-runtime-v6-0';
const RUNTIME_CACHE_MAX_ENTRIES = 120;
const ACTIVE_CACHES = new Set([OFFLINE_CACHE_NAME, RUNTIME_CACHE_NAME]);

function createOfflineResponse() {
  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function isCacheableResponse(req, res) {
  if (!res || !req) return false;
  if (req.headers && req.headers.has('range')) return false;
  // Never attempt cache.put() on 206 Partial Content, errors, or opaque responses
  if (res.status !== 200) return false;
  return res.type === 'basic' || res.type === 'default';
}

async function trimRuntimeCache(cache, maxEntries = RUNTIME_CACHE_MAX_ENTRIES) {
  try {
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    const excess = keys.length - maxEntries;
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  } catch {
    // Best-effort pruning; never break active fetches
  }
}

async function putInRuntimeCache(req, res) {
  if (!isCacheableResponse(req, res)) return;
  try {
    const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
    await runtimeCache.put(req, res);
    await trimRuntimeCache(runtimeCache, RUNTIME_CACHE_MAX_ENTRIES);
  } catch {
    // Ignore quota or transient storage errors cleanly
  }
}

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
            .filter(
              (k) => k.startsWith('digital-armory-') && !ACTIVE_CACHES.has(k)
            )
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
      caches.open(OFFLINE_CACHE_NAME).then(async (cache) => {
        for (const rawUrl of data.urls) {
          if (typeof rawUrl !== 'string' || !rawUrl.trim()) continue;
          try {
            const existing = await cache.match(rawUrl);
            if (!existing) {
              await cache.add(rawUrl);
            }
          } catch {
            // Skip failed optional URL silently so partial caches still succeed
          }
        }
      })
    );
  } else if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.delete(OFFLINE_CACHE_NAME));
  } else if (data.type === 'CLEAR_RUNTIME_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE_NAME));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Subpath-safe scope guard (supports both `/` and `/digital-armory-3d/`)
  if (
    self.registration &&
    typeof self.registration.scope === 'string' &&
    !req.url.startsWith(self.registration.scope)
  ) {
    return;
  }

  // Range requests (e.g. partial media/audio streams) bypass Cache API puts cleanly
  if (req.headers && req.headers.has('range')) {
    event.respondWith(fetch(req).catch(() => createOfflineResponse()));
    return;
  }

  // HTML navigations: network-first with protected/runtime fallback, never undefined
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (isCacheableResponse(req, res)) {
            await putInRuntimeCache(req, res.clone());
          }
          return res;
        })
        .catch(async () => {
          const offlineCache = await caches.open(OFFLINE_CACHE_NAME);
          const offlineHit = await offlineCache.match(req);
          if (offlineHit) return offlineHit;
          const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
          const runtimeHit = await runtimeCache.match(req);
          return runtimeHit || createOfflineResponse();
        })
    );
    return;
  }

  // Register ExtendableEvent lifetime synchronously before async work begins
  let settleBackground = () => {};
  const backgroundWork = new Promise((resolve) => {
    settleBackground = resolve;
  });
  if (typeof event.waitUntil === 'function') {
    event.waitUntil(backgroundWork);
  }

  // Static & media assets:
  // 1. Protected offline museum pack cache (cache-first, never evicted by browsing)
  // 2. Bounded runtime cache (stale-while-revalidate, capped at 120 entries)
  // 3. Safe 503 Offline response on offline cache miss (never resolves undefined)
  event.respondWith(
    (async () => {
      try {
        const offlineCache = await caches.open(OFFLINE_CACHE_NAME);
        const offlineHit = await offlineCache.match(req);
        if (offlineHit) {
          settleBackground();
          return offlineHit;
        }

        const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
        const runtimeHit = await runtimeCache.match(req);

        const netPromise = fetch(req)
          .then(async (res) => {
            if (isCacheableResponse(req, res)) {
              await putInRuntimeCache(req, res.clone());
            }
            return res;
          })
          .catch(() => runtimeHit || createOfflineResponse());

        if (runtimeHit) {
          void netPromise.finally(() => settleBackground());
          return runtimeHit;
        }

        try {
          return await netPromise;
        } finally {
          settleBackground();
        }
      } catch {
        settleBackground();
        return createOfflineResponse();
      }
    })()
  );
});
