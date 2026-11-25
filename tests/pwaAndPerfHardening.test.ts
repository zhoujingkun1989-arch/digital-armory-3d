import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import viteConfig from '../vite.config';
import { GLB_WEAPON_CONFIGS } from '../src/engine/geometry/glbAssetService';
import {
  ARMOR_DETAIL_TEXTURE_FILES,
  buildExhibitOfflineAssetUrls,
  cacheExhibitOffline,
  DRACO_RUNTIME_ASSET_PATHS,
  HEAVY_ARMOR_HDRI_FILE,
  isExhibitCachedOffline,
  OFFLINE_MUSEUM_CACHE_NAME,
  OFFLINE_RUNTIME_CACHE_NAME,
  purgeAllOfflineCaches,
  queryAllCachedWeaponIds,
  removeExhibitOfflineCache,
  SMALL_ARMS_HDRI_FILE,
} from '../src/engine/offline/offlineMuseumManager';
import { isTankWeapon } from '../src/engine/physics/armoryPhysics';
import { MechanismShowdownModal } from '../src/features/armory/MechanismShowdownModal';
import { WeaponSilhouetteSvg } from '../src/features/armory/WeaponSilhouetteSvg';
import { TextureAtlasModal } from '../src/features/atlas/TextureAtlasModal';
import { MonographPrintModal } from '../src/features/monograph/MonographPrintModal';
import {
  OFFLINE_MUSEUM_STRINGS,
  OfflineMuseumModal,
} from '../src/features/offline/OfflineMuseumModal';
import { getLocalizedShortWeaponLabel } from '../src/i18n/weaponFallbacks';
import { WEAPON_IDS } from '../src/weapons/types';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const SW_PATH = path.join(PUBLIC_DIR, 'sw.js');
const CJK_REGEX = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

interface MockCacheEntry {
  req: { url: string };
  res: Response;
}

function createInMemoryCacheStorage() {
  const buckets = new Map<string, Map<string, MockCacheEntry>>();
  const putCalls: Array<{ cacheName: string; url: string }> = [];
  const addCalls: Array<{ cacheName: string; url: string }> = [];

  const getBucket = (name: string) => {
    let map = buckets.get(name);
    if (!map) {
      map = new Map();
      buckets.set(name, map);
    }
    return map;
  };

  const toKey = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input.url;
  };

  const storage = {
    async open(name: string) {
      const bucket = getBucket(name);
      return {
        async match(req: RequestInfo | URL) {
          const key = toKey(req);
          const direct = bucket.get(key);
          if (direct) return direct.res.clone();
          try {
            const pathname = new URL(key, 'https://armory.test').pathname;
            for (const entry of bucket.values()) {
              if (
                new URL(entry.req.url, 'https://armory.test').pathname ===
                pathname
              ) {
                return entry.res.clone();
              }
            }
          } catch {
            // ignore URL parse error
          }
          return undefined;
        },
        async add(req: RequestInfo | URL) {
          const key = toKey(req);
          addCalls.push({ cacheName: name, url: key });
          bucket.set(key, {
            req: { url: key },
            res: new Response(`cached:${key}`, { status: 200 }),
          });
        },
        async put(req: RequestInfo | URL, res: Response) {
          const key = toKey(req);
          putCalls.push({ cacheName: name, url: key });
          // Refresh insertion order cleanly like Cache API
          bucket.delete(key);
          bucket.set(key, { req: { url: key }, res: res.clone() });
        },
        async delete(req: RequestInfo | URL) {
          const key = toKey(req);
          return bucket.delete(key);
        },
        async keys() {
          return Array.from(bucket.values()).map((entry) => entry.req);
        },
      };
    },
    async keys() {
      return Array.from(buckets.keys());
    },
    async delete(name: string) {
      return buckets.delete(name);
    },
  };

  return { storage, buckets, putCalls, addCalls };
}

function loadServiceWorkerHarness(options?: {
  scope?: string;
  origin?: string;
  fetchImpl?: (req: Request) => Promise<Response>;
}) {
  const origin = options?.origin ?? 'https://zhoujingkun1989-arch.github.io';
  const scope = options?.scope ?? `${origin}/digital-armory-3d/`;
  const mockCaches = createInMemoryCacheStorage();
  const listeners = new Map<string, Array<(event: unknown) => void>>();

  const selfObj = {
    location: { origin },
    registration: { scope },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()) },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
  };

  const defaultFetch = vi.fn(async (req: Request) => {
    return new Response(`net:${req.url}`, { status: 200 });
  });

  const sandbox = {
    self: selfObj,
    caches: mockCaches.storage,
    fetch: options?.fetchImpl ?? defaultFetch,
    Response,
    Headers,
    Request,
    URL,
    Set,
    Promise,
  };

  const swSrc = fs.readFileSync(SW_PATH, 'utf8');
  const script = new vm.Script(swSrc, { filename: 'public/sw.js' });
  script.runInContext(vm.createContext(sandbox));

  const dispatchExtendable = async (type: string, extra?: object) => {
    const waitPromises: Promise<unknown>[] = [];
    const evt = {
      ...extra,
      waitUntil: (p: Promise<unknown>) => {
        waitPromises.push(Promise.resolve(p));
      },
    };
    for (const fn of listeners.get(type) ?? []) {
      fn(evt);
    }
    await Promise.all(waitPromises);
  };

  const dispatchFetch = async (request: {
    url: string;
    method?: string;
    mode?: string;
    headers?: Headers;
  }): Promise<{ responded: boolean; response?: Response }> => {
    let responsePromise: Promise<Response> | null = null;
    const waitPromises: Promise<unknown>[] = [];
    const req = {
      method: 'GET',
      mode: 'cors',
      headers: new Headers(),
      ...request,
    };
    const evt = {
      request: req,
      respondWith: (p: Promise<Response> | Response) => {
        responsePromise = Promise.resolve(p);
      },
      waitUntil: (p: Promise<unknown>) => {
        waitPromises.push(Promise.resolve(p));
      },
    };
    for (const fn of listeners.get('fetch') ?? []) {
      fn(evt);
    }
    if (!responsePromise) {
      return { responded: false };
    }
    const response = await responsePromise;
    await Promise.all(waitPromises);
    return { responded: true, response };
  };

  return {
    selfObj,
    mockCaches,
    dispatchExtendable,
    dispatchFetch,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('PWA Offline Museum Manifests, Zero-404 Asset Parity & Cache Lifecycle', () => {
  it('resolves 100% real on-disk assets inside public/ for ALL 34 exhibits with zero 404s', () => {
    expect(WEAPON_IDS).toHaveLength(34);
    expect(OFFLINE_MUSEUM_CACHE_NAME).toBe('digital-armory-offline-v6-0');
    expect(OFFLINE_RUNTIME_CACHE_NAME).toBe('digital-armory-runtime-v6-0');

    for (const weaponId of WEAPON_IDS) {
      const manifest = buildExhibitOfflineAssetUrls(weaponId, '/');
      expect(manifest.weaponId).toBe(weaponId);
      expect(manifest.urls.length).toBeGreaterThanOrEqual(11);
      // Every URL must be unique (deduplicated)
      expect(new Set(manifest.urls).size).toBe(manifest.urls.length);

      // Assert EVERY returned URL maps to an existing file on disk inside public/
      for (const url of manifest.urls) {
        expect(url.startsWith('/'), `Expected leading slash on ${url}`).toBe(
          true
        );
        const diskPath = path.join(PUBLIC_DIR, url.replace(/^\/+/, ''));
        expect(
          fs.existsSync(diskPath),
          `Missing offline asset on disk for ${weaponId}: ${url} -> ${diskPath}`
        ).toBe(true);
        expect(fs.statSync(diskPath).size).toBeGreaterThan(0);
      }

      // Assert exact expected assets derived from GLB_WEAPON_CONFIGS[weaponId] (Flagship 34)
      const glbCfg = GLB_WEAPON_CONFIGS[weaponId];
      expect(manifest.urls).toContain(`/narrations/${weaponId}.json`);
      if (glbCfg) {
        expect(manifest.urls).toContain(`/models/${glbCfg.modelFile}`);

        const expectedTexFiles = new Set<string>();
        for (const spec of Object.values(glbCfg.pbrOverrides)) {
          expectedTexFiles.add(spec.albedoFile);
          expectedTexFiles.add(spec.normalFile);
          expectedTexFiles.add(spec.roughnessFile);
        }
        for (const texFile of expectedTexFiles) {
          expect(manifest.urls).toContain(`/textures/${texFile}`);
        }
      }

      // Heavy armor (4 MBTs) + GAU-8/A use hangar HDRI + armor micro-detail maps
      const isHeavy = isTankWeapon(weaponId) || weaponId === 'gau8';
      if (isHeavy) {
        for (const detailFile of ARMOR_DETAIL_TEXTURE_FILES) {
          expect(manifest.urls).toContain(`/textures/${detailFile}`);
        }
        expect(manifest.urls).toContain(`/hdri/${HEAVY_ARMOR_HDRI_FILE}`);
        expect(manifest.urls).not.toContain(`/hdri/${SMALL_ARMS_HDRI_FILE}`);
      } else {
        expect(manifest.urls).toContain(`/hdri/${SMALL_ARMS_HDRI_FILE}`);
        expect(manifest.urls).not.toContain(`/hdri/${HEAVY_ARMOR_HDRI_FILE}`);
      }

      // Shared Draco WASM decoder binaries always included
      for (const dracoPath of DRACO_RUNTIME_ASSET_PATHS) {
        expect(manifest.urls).toContain(`/${dracoPath}`);
      }

      // Accurate category-based estimatedMb
      if (isTankWeapon(weaponId)) {
        expect(manifest.estimatedMb).toBeGreaterThanOrEqual(10);
        expect(manifest.estimatedMb).toBeLessThanOrEqual(12.5);
      } else if (weaponId === 'gau8') {
        expect(manifest.estimatedMb).toBeGreaterThanOrEqual(3.5);
        expect(manifest.estimatedMb).toBeLessThanOrEqual(5.0);
      } else {
        expect(manifest.estimatedMb).toBeGreaterThanOrEqual(3.0);
        expect(manifest.estimatedMb).toBeLessThanOrEqual(4.0);
      }

      // Subpath parity under GitHub Pages '/digital-armory-3d/'
      const subpathManifest = buildExhibitOfflineAssetUrls(
        weaponId,
        '/digital-armory-3d/'
      );
      expect(subpathManifest.urls).toHaveLength(manifest.urls.length);
      for (const subUrl of subpathManifest.urls) {
        expect(subUrl.startsWith('/digital-armory-3d/')).toBe(true);
      }
    }
  });

  it('reports live onProgress callbacks and preserves shared assets when removing one cached exhibit', async () => {
    const mockCaches = createInMemoryCacheStorage();
    vi.stubGlobal('caches', mockCaches.storage);

    const progressEvents: Array<{ done: number; total: number; url: string }> =
      [];
    const resAk = await cacheExhibitOffline('ak15', (done, total, url) => {
      progressEvents.push({ done, total, url });
    });

    const akManifest = buildExhibitOfflineAssetUrls('ak15');
    expect(resAk.ok).toBe(true);
    expect(resAk.cachedCount).toBe(akManifest.urls.length);
    expect(resAk.totalCount).toBe(akManifest.urls.length);
    expect(resAk.failedUrls).toHaveLength(0);
    expect(progressEvents).toHaveLength(akManifest.urls.length);
    expect(progressEvents[0].done).toBe(1);
    expect(progressEvents[progressEvents.length - 1].done).toBe(
      akManifest.urls.length
    );
    expect(await isExhibitCachedOffline('ak15')).toBe(true);

    // Cache a second small arm (m4a1): shared HDRI + Draco assets must NOT be re-fetched
    const addCountBeforeM4 = mockCaches.addCalls.length;
    const resM4 = await cacheExhibitOffline('m4a1');
    expect(resM4.ok).toBe(true);
    const addedForM4 = mockCaches.addCalls.slice(addCountBeforeM4);
    expect(
      addedForM4.some((c) => c.url.includes('draco_decoder.wasm'))
    ).toBe(false);
    expect(
      addedForM4.some((c) => c.url.includes(SMALL_ARMS_HDRI_FILE))
    ).toBe(false);

    const cachedBoth = await queryAllCachedWeaponIds();
    expect(cachedBoth.has('ak15')).toBe(true);
    expect(cachedBoth.has('m4a1')).toBe(true);

    // Remove ak15: ak15-specific files are deleted, but m4a1 stays 100% cached (shared Draco/HDRI preserved)
    await removeExhibitOfflineCache('ak15');
    expect(await isExhibitCachedOffline('ak15')).toBe(false);
    expect(await isExhibitCachedOffline('m4a1')).toBe(true);

    // Purge cleans up everything
    await purgeAllOfflineCaches();
    expect(await isExhibitCachedOffline('m4a1')).toBe(false);
  });
});

describe('Hardened Service Worker (`public/sw.js`) Runtime Bounds, 206 Safety & Offline 503', () => {
  it('maintains v6-0 cache parity, cleans legacy caches, caps runtime cache at 120, skips Range/206, and returns 503 Offline', async () => {
    const swSrc = fs.readFileSync(SW_PATH, 'utf8');
    expect(() => new vm.Script(swSrc)).not.toThrow();
    expect(swSrc).toContain(OFFLINE_MUSEUM_CACHE_NAME);
    expect(swSrc).toContain(OFFLINE_RUNTIME_CACHE_NAME);

    let failNetwork = false;
    let return206 = false;
    const networkCalls: string[] = [];

    const harness = loadServiceWorkerHarness({
      origin: 'https://zhoujingkun1989-arch.github.io',
      scope: 'https://zhoujingkun1989-arch.github.io/digital-armory-3d/',
      fetchImpl: async (req) => {
        networkCalls.push(req.url);
        if (failNetwork) {
          throw new Error('Network offline');
        }
        if (return206) {
          return new Response('partial', { status: 206 });
        }
        return new Response(`body:${req.url}`, { status: 200 });
      },
    });

    // Seed legacy v5 cache + active v6 offline cache and run activate
    await harness.mockCaches.storage.open('digital-armory-offline-v5-0');
    const v6Offline = await harness.mockCaches.storage.open(
      OFFLINE_MUSEUM_CACHE_NAME
    );
    const protectedUrl =
      'https://zhoujingkun1989-arch.github.io/digital-armory-3d/models/ak15.glb';
    await v6Offline.put(protectedUrl, new Response('glb-bytes', { status: 200 }));

    await harness.dispatchExtendable('activate');
    const keysAfterActivate = await harness.mockCaches.storage.keys();
    expect(keysAfterActivate).not.toContain('digital-armory-offline-v5-0');
    expect(keysAfterActivate).toContain(OFFLINE_MUSEUM_CACHE_NAME);

    // 1. Protected offline cache hit serves immediately with zero network fetch
    const netCountBeforeProtected = networkCalls.length;
    const offlineHit = await harness.dispatchFetch({ url: protectedUrl });
    expect(offlineHit.responded).toBe(true);
    expect(offlineHit.response?.status).toBe(200);
    expect(await offlineHit.response?.text()).toBe('glb-bytes');
    expect(networkCalls.length).toBe(netCountBeforeProtected);

    // 2. Range header request & 206 Partial Content response MUST NOT call cache.put
    const putCountBeforeRange = harness.mockCaches.putCalls.length;
    const rangeRes = await harness.dispatchFetch({
      url: 'https://zhoujingkun1989-arch.github.io/digital-armory-3d/audio/ak15/story_act1_zh.mp3',
      headers: new Headers({ Range: 'bytes=0-1023' }),
    });
    expect(rangeRes.responded).toBe(true);
    expect(harness.mockCaches.putCalls.length).toBe(putCountBeforeRange);

    return206 = true;
    const partialRes = await harness.dispatchFetch({
      url: 'https://zhoujingkun1989-arch.github.io/digital-armory-3d/audio/ak15/story_act2_zh.mp3',
    });
    expect(partialRes.responded).toBe(true);
    expect(partialRes.response?.status).toBe(206);
    expect(harness.mockCaches.putCalls.length).toBe(putCountBeforeRange);
    return206 = false;

    // 3. Bounded runtime cache pruning: populate 126 distinct URLs -> capped at 120 (oldest 6 evicted)
    for (let i = 0; i < 126; i++) {
      const assetUrl = `https://zhoujingkun1989-arch.github.io/digital-armory-3d/assets/chunk-${i}.js`;
      const res = await harness.dispatchFetch({ url: assetUrl });
      expect(res.response?.status).toBe(200);
    }
    const runtimeBucket = harness.mockCaches.buckets.get(
      OFFLINE_RUNTIME_CACHE_NAME
    );
    expect(runtimeBucket?.size).toBe(120);
    expect(
      runtimeBucket?.has(
        'https://zhoujingkun1989-arch.github.io/digital-armory-3d/assets/chunk-0.js'
      )
    ).toBe(false);
    expect(
      runtimeBucket?.has(
        'https://zhoujingkun1989-arch.github.io/digital-armory-3d/assets/chunk-5.js'
      )
    ).toBe(false);
    expect(
      runtimeBucket?.has(
        'https://zhoujingkun1989-arch.github.io/digital-armory-3d/assets/chunk-125.js'
      )
    ).toBe(true);

    // Protected offline pack remains untouched after runtime pruning!
    expect(
      harness.mockCaches.buckets
        .get(OFFLINE_MUSEUM_CACHE_NAME)
        ?.has(protectedUrl)
    ).toBe(true);

    // 4. Offline cache miss returns proper HTTP 503 Response (never undefined)
    failNetwork = true;
    const missRes = await harness.dispatchFetch({
      url: 'https://zhoujingkun1989-arch.github.io/digital-armory-3d/models/uncached.glb',
    });
    expect(missRes.responded).toBe(true);
    expect(missRes.response).toBeInstanceOf(Response);
    expect(missRes.response?.status).toBe(503);
    expect(await missRes.response?.text()).toBe('Offline');

    // Navigation offline miss also safely returns 503 instead of undefined
    const navMiss = await harness.dispatchFetch({
      url: 'https://zhoujingkun1989-arch.github.io/digital-armory-3d/unknown-route',
      mode: 'navigate',
    });
    expect(navMiss.responded).toBe(true);
    expect(navMiss.response).toBeInstanceOf(Response);
    expect(navMiss.response?.status).toBe(503);

    // 5. Out-of-scope subpath request is ignored cleanly
    const outOfScope = await harness.dispatchFetch({
      url: 'https://zhoujingkun1989-arch.github.io/other-repo/index.html',
    });
    expect(outOfScope.responded).toBe(false);
  });
});

describe('First-Paint CSS Code-Splitting, Vite Chunking, React.memo & Modal A11y', () => {
  it('moves all 6 heavy lazy-feature stylesheets out of eager src/styles/index.css into their lazy entry modules', () => {
    const indexCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/index.css'),
      'utf8'
    );
    for (const lazyFile of [
      'monograph.css',
      'dk-monograph.css',
      'atlas-modal.css',
      'showdown.css',
      'showcase.css',
      'cartridges.css',
    ]) {
      expect(indexCss).not.toContain(lazyFile);
    }

    const monographSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/monograph/MonographPrintModal.tsx'),
      'utf8'
    );
    expect(monographSrc).toContain("import '../../styles/monograph.css';");
    expect(monographSrc).toContain("import '../../styles/dk-monograph.css';");
    expect(monographSrc.indexOf("import '../../styles/monograph.css';")).toBeLessThan(
      monographSrc.indexOf("import '../../styles/dk-monograph.css';")
    );

    expect(
      fs.readFileSync(
        path.join(ROOT, 'src/features/atlas/TextureAtlasModal.tsx'),
        'utf8'
      )
    ).toContain("import '../../styles/atlas-modal.css';");

    expect(
      fs.readFileSync(
        path.join(ROOT, 'src/features/armory/MechanismShowdownModal.tsx'),
        'utf8'
      )
    ).toContain("import '../../styles/showdown.css';");

    expect(
      fs.readFileSync(
        path.join(ROOT, 'src/features/showcase/ShowcaseView.tsx'),
        'utf8'
      )
    ).toContain("import '../../styles/showcase.css';");

    expect(
      fs.readFileSync(
        path.join(ROOT, 'src/features/cartridges/CartridgeLabView.tsx'),
        'utf8'
      )
    ).toContain("import '../../styles/cartridges.css';");

    // Verify showcase.html uses /src/main.tsx which lazy-loads ShowcaseView (and its extracted showcase.css)
    const showcaseHtml = fs.readFileSync(
      path.join(ROOT, 'showcase.html'),
      'utf8'
    );
    expect(showcaseHtml).toContain("window.__DIGITAL_ARMORY_ENTRY__ = 'showcase'");
    expect(showcaseHtml).toContain('src="/src/main.tsx"');
  });

  it('wraps WeaponSilhouetteSvg in React.memo and preserves acyclic Vite manualChunks under 800 kB', () => {
    const memoSymbol = Symbol.for('react.memo');
    expect(
      (WeaponSilhouetteSvg as unknown as { $$typeof?: symbol }).$$typeof
    ).toBe(memoSymbol);
    expect(WeaponSilhouetteSvg.displayName).toBe('WeaponSilhouetteSvg');

    expect(viteConfig.build?.chunkSizeWarningLimit).toBeLessThanOrEqual(800);
    const output = viteConfig.build?.rollupOptions?.output;
    const singleOutput = Array.isArray(output) ? output[0] : output;
    const manualChunks = singleOutput?.manualChunks;
    expect(typeof manualChunks).toBe('function');

    if (typeof manualChunks === 'function') {
      const chunkOf = (id: string) =>
        manualChunks(id, {
          getModuleInfo: () => null,
          getModuleIds: function* () {},
        });

      expect(chunkOf('/repo/src/weapons/manifests.ts')).toBe('armory-catalog');
      expect(chunkOf('/repo/src/engine/physics/armoryPhysics.ts')).toBe(
        'armory-catalog'
      );
      expect(chunkOf('/repo/src/engine/fieldstrip/fieldStripSpecs.ts')).toBe(
        'armory-specs'
      );
      expect(chunkOf('/repo/src/engine/physics/externalBallistics.ts')).toBe(
        'armory-ballistics-physics'
      );
      expect(
        chunkOf('/repo/src/features/armory/mechanismShowdownSpecs.ts')
      ).toBe('armory-showdown-specs');
      expect(chunkOf('/repo/src/engine/materials/armoryShader.ts')).toBe(
        'armory-materials'
      );
      expect(chunkOf('/repo/src/engine/actors/BallisticsSystem.tsx')).toBe(
        'armory-stage'
      );
      expect(chunkOf('/repo/src/engine/canvas/GunsmithStageMat.tsx')).toBe(
        'armory-stage'
      );
    }
  });

  it('enforces dialog ARIA contracts (role, aria-modal, aria-labelledby), Escape dismissal, and 0-CJK EN OfflineMuseumModal UI', () => {
    // 0. Full zh/en key parity & zero-CJK enforcement across all OFFLINE_MUSEUM_STRINGS.en values + all 34 EN weapon labels
    expect(Object.keys(OFFLINE_MUSEUM_STRINGS.en)).toEqual(
      Object.keys(OFFLINE_MUSEUM_STRINGS.zh)
    );
    const enSamples: string[] = [];
    for (const val of Object.values(OFFLINE_MUSEUM_STRINGS.en)) {
      if (typeof val === 'string') {
        enSamples.push(val);
      } else if (typeof val === 'function') {
        const fn = val as (...args: unknown[]) => string;
        enSamples.push(fn('AK-15M1', 7, 14));
      }
    }
    for (const weaponId of WEAPON_IDS) {
      enSamples.push(getLocalizedShortWeaponLabel(weaponId, 'en'));
    }
    expect(enSamples.length).toBeGreaterThan(50);
    for (const s of enSamples) {
      expect(s.trim().length).toBeGreaterThan(0);
      expect(CJK_REGEX.test(s)).toBe(false);
    }

    const assertDialogAriaHeadingParity = (html: string, label: string) => {
      expect(html, `${label} missing role="dialog"`).toContain('role="dialog"');
      expect(html, `${label} missing aria-modal="true"`).toContain(
        'aria-modal="true"'
      );
      const labelledByMatch = /aria-labelledby="([^"]+)"/.exec(html);
      expect(labelledByMatch, `${label} missing aria-labelledby`).not.toBeNull();
      const targetId = labelledByMatch![1];
      expect(html, `${label} missing heading matching aria-labelledby`).toContain(
        `id="${targetId}"`
      );
    };

    // 1. OfflineMuseumModal SSR + ARIA + accurate per-category size labels
    const offlineHtml = renderToStaticMarkup(
      React.createElement(OfflineMuseumModal, { onClose: () => undefined })
    );
    assertDialogAriaHeadingParity(offlineHtml, 'OfflineMuseumModal');
    expect(offlineHtml).toContain('~11.2 MB');
    expect(offlineHtml).toContain('~4.2 MB');
    expect(offlineHtml).toContain('~3.5 MB');

    // 2. TextureAtlasModal ARIA + Escape handler
    const atlasHtml = renderToStaticMarkup(
      React.createElement(TextureAtlasModal, { forceOpen: true })
    );
    assertDialogAriaHeadingParity(atlasHtml, 'TextureAtlasModal');
    const atlasSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/atlas/TextureAtlasModal.tsx'),
      'utf8'
    );
    expect(atlasSrc).toContain("e.key === 'Escape'");

    // 3. MonographPrintModal ARIA + Escape handler
    const monographHtml = renderToStaticMarkup(
      React.createElement(MonographPrintModal, { forceOpen: true })
    );
    assertDialogAriaHeadingParity(monographHtml, 'MonographPrintModal');
    const monographSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/monograph/MonographPrintModal.tsx'),
      'utf8'
    );
    expect(monographSrc).toContain("e.key === 'Escape'");

    // 4. MechanismShowdownModal ARIA + Escape handler
    const showdownHtml = renderToStaticMarkup(
      React.createElement(MechanismShowdownModal, { onClose: () => undefined })
    );
    assertDialogAriaHeadingParity(showdownHtml, 'MechanismShowdownModal');
    const showdownSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/armory/MechanismShowdownModal.tsx'),
      'utf8'
    );
    expect(showdownSrc).toContain("e.key === 'Escape'");
  });
});
