import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getKtx2SupportStatus,
  initKtx2Support,
  loadKtx2ManifestFromNetwork,
  resetKtx2Support,
  resolvePreferredTexturePath,
  setKtx2ManifestForRuntime,
} from '../src/engine/materials/ktx2Support';
import {
  clearPbrTextureCache,
  getArmorDetailTextures,
  getCachedTexture,
  getPartPbrBundle,
  getPbrCacheStats,
  isTextureLoaded,
  subscribeTextureKeys,
} from '../src/engine/materials/pbrManager';
import {
  clearWeaponGeometryCache,
  ensureWeaponGeometries,
  getGeometryCacheStats,
} from '../src/engine/geometry/geometryService';
import * as glbAssetService from '../src/engine/geometry/glbAssetService';
import {
  CARTRIDGE_LAB_SPECS,
  TANK_ORDNANCE_ORDER,
} from '../src/engine/cartridges/cartridgeSpecs';
import { computeCartridgeStageOffsetInto } from '../src/engine/actors/CartridgeCutawayStage';
import type { PbrBindingSpec, WeaponId } from '../src/weapons/types';

const ROOT = process.cwd();

function makeCompressedTexture(
  width = 512,
  height = 512,
  mipCount = 3
): THREE.CompressedTexture {
  const mipmaps: ImageData[] = [];
  for (let i = 0; i < mipCount; i++) {
    const w = Math.max(1, width >> i);
    const h = Math.max(1, height >> i);
    mipmaps.push({
      data: new Uint8ClampedArray(16),
      width: w,
      height: h,
      colorSpace: 'srgb',
    } as ImageData);
  }
  return new THREE.CompressedTexture(
    mipmaps,
    width,
    height,
    THREE.RGBA_ASTC_4x4_Format
  );
}

function makeMockRenderer(): THREE.WebGLRenderer {
  return {
    extensions: {
      has: () => true,
    },
    capabilities: {
      isWebGL2: true,
      getMaxAnisotropy: () => 16,
    },
  } as unknown as THREE.WebGLRenderer;
}

function installBrowserWindow(): () => void {
  const prevWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { location: { origin: 'http://localhost', pathname: '/' } },
  });
  return () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: prevWindow,
    });
  };
}

async function flushMicrotasks(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

/**
 * Extracts the source slice of every `useFrame(...)` callback body in a TSX file
 * by brace-depth tracking so static zero-GC checks stay resilient to formatting.
 */
function extractUseFrameBodies(source: string): string[] {
  const bodies: string[] = [];
  const regex = /\buseFrame\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    let idx = match.index + match[0].length;
    let parenDepth = 1;
    while (idx < source.length && parenDepth > 0) {
      const ch = source[idx];
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
      idx++;
    }
    bodies.push(source.slice(match.index, idx));
  }
  return bodies;
}

describe('Engine Hardening — KTX2 Runtime, PBR Cache Hygiene, Geometry Telemetry & Zero-GC', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    clearPbrTextureCache();
    resetKtx2Support();
    clearWeaponGeometryCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearPbrTextureCache();
    resetKtx2Support();
    clearWeaponGeometryCache();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: origFetch,
    });
  });

  describe('KTX2 runtime manifest loading & non-blocking init', () => {
    it('silently no-ops when ktx2-manifest.json is missing, unreachable, malformed, or empty', async () => {
      const fetchMock = vi.fn();
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: fetchMock,
      });

      // 1. 404 missing manifest
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
      expect(await loadKtx2ManifestFromNetwork()).toBeNull();
      expect(getKtx2SupportStatus().publishedCount).toBe(0);

      // 2. Network rejection
      fetchMock.mockRejectedValueOnce(new Error('offline'));
      expect(await loadKtx2ManifestFromNetwork()).toBeNull();
      expect(getKtx2SupportStatus().publishedCount).toBe(0);

      // 3. Empty baseline manifest (`entries: {}`)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: 1,
          transcoderPath: 'basis/',
          entries: {},
        }),
      });
      expect(await loadKtx2ManifestFromNetwork()).toBeNull();
      expect(getKtx2SupportStatus().publishedCount).toBe(0);

      // 4. Malformed payload
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 'bad', entries: [] }),
      });
      expect(await loadKtx2ManifestFromNetwork()).toBeNull();
      expect(getKtx2SupportStatus().publishedCount).toBe(0);
    });

    it('loads non-empty ktx2-manifest.json via resolveAssetUrl and auto-triggers non-blockingly from initKtx2Support', async () => {
      const restoreWin = installBrowserWindow();
      const fetchedUrls: string[] = [];
      const fetchMock = vi.fn(async (url: string) => {
        fetchedUrls.push(url);
        return {
          ok: true,
          json: async () => ({
            version: 1,
            transcoderPath: 'basis/',
            entries: {
              'ak15_v3_metal_albedo.webp': 'ktx2/ak15_v3_metal_albedo.ktx2',
              'ak15_v3_metal_normal.webp': 'ktx2/ak15_v3_metal_normal.ktx2',
            },
          }),
        };
      });
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: fetchMock,
      });

      const detectSpy = vi
        .spyOn(KTX2Loader.prototype, 'detectSupport')
        .mockImplementation(function (this: KTX2Loader) {
          return this;
        });

      try {
        // initKtx2Support returns synchronously and kicks off manifest load non-blockingly
        const ok = initKtx2Support(makeMockRenderer());
        expect(ok).toBe(true);
        expect(detectSpy).toHaveBeenCalledTimes(1);

        await flushMicrotasks();

        expect(fetchedUrls).toEqual(['/textures/ktx2-manifest.json']);
        const status = getKtx2SupportStatus();
        expect(status.initialized).toBe(true);
        expect(status.gpuSupported).toBe(true);
        expect(status.publishedCount).toBe(2);

        const resolved = resolvePreferredTexturePath(
          'ak15_v3_metal_albedo.png',
          '/digital-armory-3d/'
        );
        expect(resolved.isKtx2).toBe(true);
        expect(resolved.url).toBe(
          '/digital-armory-3d/textures/ktx2/ak15_v3_metal_albedo.ktx2'
        );

        // Explicit subpath manifest load resolves under subpath cleanly
        await loadKtx2ManifestFromNetwork('/digital-armory-3d/');
        expect(fetchedUrls).toContain(
          '/digital-armory-3d/textures/ktx2-manifest.json'
        );
      } finally {
        restoreWin();
      }
    });
  });

  describe('PBR KTX2 no double-fetch, CompressedTexture swap, fallback, disposal & telemetry', () => {
    const sampleBinding: PbrBindingSpec = {
      albedoFile: 'ak15_v3_metal_albedo.webp',
      normalFile: 'ak15_v3_metal_normal.webp',
      roughnessFile: 'ak15_v3_metal_roughness.webp',
      normalScale: 0.72,
      repeat: 1,
    };

    it('avoids eager WebP double-fetch, swaps real CompressedTexture with locked linear colorSpace, disposes placeholders, and tracks getPbrCacheStats', async () => {
      const restoreWin = installBrowserWindow();
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: vi.fn(async () => ({ ok: false, status: 404 })),
      });
      vi.spyOn(KTX2Loader.prototype, 'detectSupport').mockImplementation(
        function (this: KTX2Loader) {
          return this;
        }
      );

      const webpLoadSpy = vi
        .spyOn(THREE.TextureLoader.prototype, 'load')
        .mockImplementation(() => new THREE.Texture());

      const compressedByUrl = new Map<string, THREE.CompressedTexture>();
      const ktx2LoadSpy = vi
        .spyOn(KTX2Loader.prototype, 'loadAsync')
        .mockImplementation(async (url: string) => {
          const ct = makeCompressedTexture(
            512,
            512,
            url.includes('_roughness') ? 1 : 4
          );
          compressedByUrl.set(url, ct);
          return ct;
        });

      try {
        initKtx2Support(makeMockRenderer());
        setKtx2ManifestForRuntime({
          version: 1,
          entries: {
            'ak15_v3_metal_albedo.webp': 'ktx2/ak15_v3_metal_albedo.ktx2',
            'ak15_v3_metal_normal.webp': 'ktx2/ak15_v3_metal_normal.ktx2',
            'ak15_v3_metal_roughness.webp': 'ktx2/ak15_v3_metal_roughness.ktx2',
          },
        });

        const bundle = getPartPbrBundle('ak15', 'nitride_steel', sampleBinding);

        // Zero eager WebP fetches when KTX2 is active
        expect(webpLoadSpy).not.toHaveBeenCalled();
        expect(ktx2LoadSpy).toHaveBeenCalledTimes(3);

        // Capture placeholders before KTX2 resolves & spy on their disposal
        const placeholderAlb = bundle.map!;
        const placeholderNrm = bundle.normalMap!;
        const placeholderRgh = bundle.roughnessMap!;
        expect(placeholderAlb).toBeInstanceOf(THREE.Texture);
        expect(isTextureLoaded(placeholderAlb)).toBe(false);

        const disposeAlbSpy = vi.spyOn(placeholderAlb, 'dispose');
        const disposeNrmSpy = vi.spyOn(placeholderNrm, 'dispose');
        const disposeRghSpy = vi.spyOn(placeholderRgh, 'dispose');

        let readyNotifies = 0;
        const unsub = subscribeTextureKeys(bundle.textureKeys, () => {
          readyNotifies += 1;
        });

        await flushMicrotasks();
        unsub();

        // Still ZERO WebP requests after KTX2 succeeds
        expect(webpLoadSpy).not.toHaveBeenCalled();
        expect(readyNotifies).toBe(3);

        // Placeholders cleanly disposed upon swap
        expect(disposeAlbSpy).toHaveBeenCalledTimes(1);
        expect(disposeNrmSpy).toHaveBeenCalledTimes(1);
        expect(disposeRghSpy).toHaveBeenCalledTimes(1);

        // Actual CompressedTexture instances are now live in cache & on bundle getters
        expect(bundle.map).toBeInstanceOf(THREE.CompressedTexture);
        expect(bundle.normalMap).toBeInstanceOf(THREE.CompressedTexture);
        expect(bundle.roughnessMap).toBeInstanceOf(THREE.CompressedTexture);
        expect(bundle.map).toBe(
          compressedByUrl.get('/textures/ktx2/ak15_v3_metal_albedo.ktx2')
        );
        expect(bundle.map).toBe(getCachedTexture(bundle.textureKeys[0]));
        expect(isTextureLoaded(bundle.map)).toBe(true);
        expect(isTextureLoaded(bundle.normalMap)).toBe(true);

        // ColorSpace & CompressedTexture filtering invariants
        expect(bundle.map!.colorSpace).toBe(THREE.SRGBColorSpace);
        expect(bundle.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
        expect(bundle.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);
        // Must survive R3F v8 sRGB clobber attempt
        bundle.normalMap!.colorSpace = THREE.SRGBColorSpace;
        bundle.roughnessMap!.colorSpace = THREE.SRGBColorSpace;
        expect(bundle.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
        expect(bundle.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);

        // WebGL2 compressed mipmap safety
        expect(bundle.map!.generateMipmaps).toBe(false);
        expect(bundle.map!.minFilter).toBe(THREE.LinearMipmapLinearFilter);
        expect(bundle.roughnessMap!.generateMipmaps).toBe(false);
        expect(bundle.roughnessMap!.minFilter).toBe(THREE.LinearFilter);

        const stats = getPbrCacheStats();
        expect(stats.cachedTextureCount).toBe(3);
        expect(stats.cachedWeaponsLru).toEqual(['ak15']);
        expect(stats.ktx2Hits).toBe(3);
        expect(stats.webpHits).toBe(0);
      } finally {
        restoreWin();
      }
    });

    it('falls back to WebP only when KTX2 fails, disposes placeholder, and notifies subscribers', async () => {
      const restoreWin = installBrowserWindow();
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: vi.fn(async () => ({ ok: false, status: 404 })),
      });
      vi.spyOn(KTX2Loader.prototype, 'detectSupport').mockImplementation(
        function (this: KTX2Loader) {
          return this;
        }
      );

      vi.spyOn(KTX2Loader.prototype, 'loadAsync').mockRejectedValue(
        new Error('KTX2 404')
      );

      const fallbackUrls: string[] = [];
      const webpLoadSpy = vi
        .spyOn(THREE.TextureLoader.prototype, 'load')
        .mockImplementation((url, onLoad) => {
          fallbackUrls.push(url);
          const tex = new THREE.Texture();
          tex.image = { width: 512, height: 512, complete: true };
          queueMicrotask(() => onLoad?.(tex));
          return tex;
        });

      try {
        initKtx2Support(makeMockRenderer());
        setKtx2ManifestForRuntime({
          version: 1,
          entries: {
            'ak15_v3_metal_albedo.webp': 'ktx2/ak15_v3_metal_albedo.ktx2',
            'ak15_v3_metal_normal.webp': 'ktx2/ak15_v3_metal_normal.ktx2',
            'ak15_v3_metal_roughness.webp': 'ktx2/ak15_v3_metal_roughness.ktx2',
          },
        });

        const bundle = getPartPbrBundle('ak15', 'nitride_steel', sampleBinding);
        // Not fetched synchronously before KTX2 fails
        expect(webpLoadSpy).not.toHaveBeenCalled();

        const placeholderAlb = bundle.map!;
        const placeholderDisposeSpy = vi.spyOn(placeholderAlb, 'dispose');

        let readyCount = 0;
        const unsub = subscribeTextureKeys(bundle.textureKeys, () => {
          readyCount += 1;
        });

        await flushMicrotasks(8);
        unsub();

        expect(webpLoadSpy).toHaveBeenCalledTimes(3);
        expect(fallbackUrls).toEqual([
          '/textures/ak15_v3_metal_albedo.webp',
          '/textures/ak15_v3_metal_normal.webp',
          '/textures/ak15_v3_metal_roughness.webp',
        ]);
        expect(placeholderDisposeSpy).toHaveBeenCalledTimes(1);
        expect(readyCount).toBe(3);

        // Replaced with loaded WebP textures with proper colorSpace locks
        expect(bundle.map).not.toBe(placeholderAlb);
        expect(isTextureLoaded(bundle.map)).toBe(true);
        expect(bundle.map!.colorSpace).toBe(THREE.SRGBColorSpace);
        expect(bundle.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
        expect(bundle.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);

        const stats = getPbrCacheStats();
        expect(stats.ktx2Hits).toBe(0);
        expect(stats.webpHits).toBe(3);
        expect(stats.cachedTextureCount).toBe(3);
      } finally {
        restoreWin();
      }
    });

    it('disposes evicted LRU weapon textures and late-resolving inflight KTX2 textures cleanly', async () => {
      const restoreWin = installBrowserWindow();
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: vi.fn(async () => ({ ok: false, status: 404 })),
      });
      vi.spyOn(KTX2Loader.prototype, 'detectSupport').mockImplementation(
        function (this: KTX2Loader) {
          return this;
        }
      );
      vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(
        () => new THREE.Texture()
      );

      let resolveDeferredKtx2!: (t: THREE.CompressedTexture) => void;
      const deferredKtx2Promise = new Promise<THREE.CompressedTexture>(
        (resolve) => {
          resolveDeferredKtx2 = resolve;
        }
      );
      vi.spyOn(KTX2Loader.prototype, 'loadAsync').mockReturnValue(
        deferredKtx2Promise
      );

      try {
        initKtx2Support(makeMockRenderer());
        setKtx2ManifestForRuntime({
          version: 1,
          entries: {
            'w1_albedo.webp': 'ktx2/w1_albedo.ktx2',
          },
        });

        const weapons: WeaponId[] = ['ak15', 'm4a1', 'mp5', 'g17', 'awm', 'p08'];
        const firstBundle = getPartPbrBundle(weapons[0], 'nitride_steel', {
          albedoFile: 'w1_albedo.webp',
          normalFile: 'w1_normal.webp',
          roughnessFile: 'w1_roughness.webp',
          normalScale: 0.5,
        });
        const firstPlaceholderDispose = vi.spyOn(firstBundle.map!, 'dispose');

        // Load 5 more weapons to evict `ak15` (MAX_CACHED_TEXTURE_WEAPONS = 5)
        for (let i = 1; i < weapons.length; i++) {
          const w = weapons[i];
          getPartPbrBundle(w, 'nitride_steel', {
            albedoFile: `${w}_alb.webp`,
            normalFile: `${w}_nrm.webp`,
            roughnessFile: `${w}_rgh.webp`,
            normalScale: 0.5,
          });
        }

        // Oldest weapon evicted & placeholder disposed
        expect(firstPlaceholderDispose).toHaveBeenCalledTimes(1);
        expect(firstBundle.map).toBeNull();

        const statsBeforeLate = getPbrCacheStats();
        expect(statsBeforeLate.cachedWeaponsLru).toEqual([
          'm4a1',
          'mp5',
          'g17',
          'awm',
          'p08',
        ]);
        expect(statsBeforeLate.cachedTextureCount).toBe(15);

        // Late KTX2 resolution for already-evicted `ak15` must immediately dispose itself
        const lateCompressed = makeCompressedTexture(256, 256, 2);
        const lateDisposeSpy = vi.spyOn(lateCompressed, 'dispose');
        resolveDeferredKtx2(lateCompressed);
        await flushMicrotasks();

        expect(lateDisposeSpy).toHaveBeenCalledTimes(1);
        expect(getPbrCacheStats().ktx2Hits).toBe(0);

        // Armor detail bundle stays cached and live across shared accesses
        const armor1 = getArmorDetailTextures();
        const armor2 = getArmorDetailTextures();
        expect(armor2).toBe(armor1);
        expect(armor1.normalMap).not.toBeNull();
        expect(armor1.roughnessMap).not.toBeNull();
      } finally {
        restoreWin();
      }
    });
  });

  describe('Geometry cache telemetry (`getGeometryCacheStats`)', () => {
    it('tracks cached weapons, GLB vs CSG part counts, and immutable LRU order', async () => {
      const emptyStats = getGeometryCacheStats();
      expect(emptyStats).toEqual({
        cachedWeaponsCount: 0,
        cachedPartsCount: 0,
        glbPartsCount: 0,
        csgPartsCount: 0,
        lruOrder: [],
      });

      // Headless Node build populates Track B (CSG) parts
      await ensureWeaponGeometries('ak15', ['ak_receiver', 'ak_recoil_spring']);
      const csgStats = getGeometryCacheStats();
      expect(csgStats.cachedWeaponsCount).toBe(1);
      expect(csgStats.cachedPartsCount).toBe(2);
      expect(csgStats.glbPartsCount).toBe(0);
      expect(csgStats.csgPartsCount).toBe(2);
      expect(csgStats.lruOrder).toEqual(['ak15']);

      // Mutating returned lruOrder snapshot must not mutate internal LRU array
      (csgStats.lruOrder as WeaponId[]).push('m4a1');
      expect(getGeometryCacheStats().lruOrder).toEqual(['ak15']);

      // Simulate browser Dual-Track build: Track A GLB solid part + Track B CSG dynamic spring
      const restoreWin = installBrowserWindow();
      const glbSpy = vi
        .spyOn(glbAssetService, 'loadWeaponGlbGeometries')
        .mockImplementation(async (_weaponId, partIds) => {
          const map = new Map<string, THREE.BufferGeometry>();
          for (const id of partIds) {
            const g = new THREE.BoxGeometry(1, 1, 1);
            g.userData = { isGlbAsset: true };
            map.set(id, g);
          }
          return map;
        });

      try {
        await ensureWeaponGeometries('p08', [
          'p08_frame',
          'p08_barrel_extension',
          'p08_recoil_spring',
        ]);
        expect(glbSpy).toHaveBeenCalledTimes(1);

        const mixedStats = getGeometryCacheStats();
        expect(mixedStats.cachedWeaponsCount).toBe(2);
        expect(mixedStats.cachedPartsCount).toBe(5);
        expect(mixedStats.glbPartsCount).toBe(2);
        expect(mixedStats.csgPartsCount).toBe(3);
        expect(mixedStats.lruOrder).toEqual(['ak15', 'p08']);
      } finally {
        restoreWin();
      }

      clearWeaponGeometryCache('ak15');
      const afterSingleClear = getGeometryCacheStats();
      expect(afterSingleClear.cachedWeaponsCount).toBe(1);
      expect(afterSingleClear.cachedPartsCount).toBe(3);
      expect(afterSingleClear.glbPartsCount).toBe(2);
      expect(afterSingleClear.csgPartsCount).toBe(1);
      expect(afterSingleClear.lruOrder).toEqual(['p08']);

      clearWeaponGeometryCache();
      expect(getGeometryCacheStats().cachedPartsCount).toBe(0);
    });
  });

  describe('Zero-GC useFrame, GPU disposal hygiene & secondary canvas resilience', () => {
    it('enforces zero `new THREE.` inside CaliperActor useFrame and disposes memoized geometries', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'src/engine/canvas/CaliperActor.tsx'),
        'utf8'
      );
      const bodies = extractUseFrameBodies(src);
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        expect(body).not.toMatch(/\bnew\s+THREE\./);
      }
      expect(src).toContain('const _zAxis = new THREE.Vector3(0, 0, 1)');
      expect(src).toContain('envelopeGeo?.dispose()');
      expect(src).toContain('lockedSpanGeo?.dispose()');
    });

    it('keeps MalfunctionActor and CartridgeCutawayStage zero-GC and safe with module singletons + 4-round heavy ordnance framing', () => {
      const malfSrc = fs.readFileSync(
        path.join(ROOT, 'src/engine/actors/MalfunctionActor.tsx'),
        'utf8'
      );
      for (const body of extractUseFrameBodies(malfSrc)) {
        expect(body).not.toMatch(/\bnew\s+THREE\./);
      }
      // Shared `caliberGeoCache` singletons must never be disposed by MalfunctionActor
      expect(malfSrc).not.toMatch(/\b(?:caseGeo|bulletGeo|livePrimerGeo|spentPrimerGeo|sootRingGeo)\.dispose\s*\(/);

      const stageSrc = fs.readFileSync(
        path.join(ROOT, 'src/engine/actors/CartridgeCutawayStage.tsx'),
        'utf8'
      );
      for (const body of extractUseFrameBodies(stageSrc)) {
        expect(body).not.toMatch(/\bnew\s+THREE\./);
      }
      // Shared `cutawayCache` singletons must never be disposed per specimen
      expect(stageSrc).not.toMatch(/\bbundle\.\w+\.dispose\s*\(/);

      // Verify 4-round heavy ordnance plinth (102 cm => [-51, +51]) & backdrop ([-48, +48]) enclosure
      expect(TANK_ORDNANCE_ORDER).toHaveLength(4);
      const haloOuterRadiusCm = 9.4;
      for (const cal of TANK_ORDNANCE_ORDER) {
        const spec = CARTRIDGE_LAB_SPECS[cal];
        expect(spec.lineupXCm - haloOuterRadiusCm).toBeGreaterThan(-51.0);
        expect(spec.lineupXCm + haloOuterRadiusCm).toBeLessThan(51.0);
        expect(spec.lineupXCm - haloOuterRadiusCm).toBeGreaterThan(-48.0);
        expect(spec.lineupXCm + haloOuterRadiusCm).toBeLessThan(48.0);
        expect(spec.oalMm / 10).toBeLessThan(122.0);
      }

      for (const [w, h] of [
        [1920, 1080],
        [1280, 760],
      ] as const) {
        const off = computeCartridgeStageOffsetInto(
          w,
          h,
          true,
          '30x173_gau8',
          false,
          false,
          0,
          { x: 0, y: 0, z: 0 }
        );
        expect(Number.isFinite(off.x)).toBe(true);
        expect(Number.isFinite(off.y)).toBe(true);
        expect(Number.isFinite(off.z)).toBe(true);
      }
    });

    it('wraps ArmorPenetration3DScene Canvas in ViewportErrorBoundary with bilingual context-loss recovery', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'src/features/armorlab/ArmorPenetration3DScene.tsx'),
        'utf8'
      );
      expect(src).toContain('import { ViewportErrorBoundary }');
      expect(src).toMatch(/<ViewportErrorBoundary>[\s\S]*?<Canvas\b/);
      expect(src).toContain('webglcontextlost');
      expect(src).toContain('webglcontextrestored');
      expect(src).toContain('Reinitialize 3D Viewport');
      expect(src).toContain('重新初始化 3D 视口');
      // Verify zero `new THREE.` inside TheaterInnerScene useFrame
      for (const body of extractUseFrameBodies(src)) {
        expect(body).not.toMatch(/\bnew\s+THREE\./);
      }
    });
  });
});
