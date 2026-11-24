import * as THREE from 'three';
import type {
  MaterialKind,
  PbrBindingSpec,
  WeaponId,
} from '../../weapons/types';
import { isWeaponId } from '../../weapons/types';
import { getKtx2Loader, resolvePreferredTexturePath } from './ktx2Support';
import { resolveTextureUrl } from '../utils/assetUrl';

export interface PartPbrBundle {
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  normalScale: number;
  hasCustomAtlas: boolean;
  textureKeys: string[];
}

export const ARMOR_DETAIL_NORMAL_FILE = 'armor_detail_normal.webp';
export const ARMOR_DETAIL_ROUGHNESS_FILE = 'armor_detail_roughness.webp';

export interface ArmorDetailTextureBundle {
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  textureKeys: string[];
}

interface CachedTextureRecord {
  key: string;
  tex: THREE.Texture;
  ownerWeapon: WeaponId | 'shared';
  source: 'ktx2' | 'webp' | 'pending_ktx2';
  disposed: boolean;
}

export interface PbrCacheStats {
  cachedTextureCount: number;
  cachedWeaponsLru: readonly WeaponId[];
  ktx2Hits: number;
  webpHits: number;
}

const MAX_CACHED_TEXTURE_WEAPONS = 5;

const texCache = new Map<string, CachedTextureRecord>();
const weaponTexKeys = new Map<WeaponId, Set<string>>();
const weaponTexLru: WeaponId[] = [];
const keyListeners = new Map<string, Set<() => void>>();
const armorDetailBundleCache = new Map<string, ArmorDetailTextureBundle>();

let loaderInstance: THREE.TextureLoader | null = null;
let ktx2Hits = 0;
let webpHits = 0;

/**
 * Returns live telemetry for the PBR GPU texture LRU cache and KTX2/WebP delivery counts.
 */
export function getPbrCacheStats(): PbrCacheStats {
  return {
    cachedTextureCount: texCache.size,
    cachedWeaponsLru: [...weaponTexLru],
    ktx2Hits,
    webpHits,
  };
}

/**
 * Resolves the currently active cached `THREE.Texture` (or swapped `THREE.CompressedTexture`)
 * for a given cache key, returning `null` if evicted or absent.
 */
export function getCachedTexture(key: string): THREE.Texture | null {
  const rec = texCache.get(key);
  return rec && !rec.disposed ? rec.tex : null;
}

/**
 * Disposes every cached PBR texture and clears LRU / bundle registries and telemetry counters.
 */
export function clearPbrTextureCache(): void {
  texCache.forEach((rec) => {
    rec.disposed = true;
    rec.tex.dispose();
  });
  texCache.clear();
  weaponTexKeys.clear();
  weaponTexLru.length = 0;
  armorDetailBundleCache.clear();
  ktx2Hits = 0;
  webpHits = 0;
}

/** Hard ceiling for texture anisotropic filtering (16x is the WebGL practical max). */
export const PBR_MAX_ANISOTROPY = 16;
/** Safe default before the renderer reports its capability (most GPUs support >= 12). */
export const PBR_DEFAULT_ANISOTROPY = 12;

let textureAnisotropy = PBR_DEFAULT_ANISOTROPY;

export function getPbrTextureAnisotropy(): number {
  return textureAnisotropy;
}

/**
 * Clamps PBR anisotropic filtering to `min(16, renderer max)` and re-applies it to every
 * cached texture. Idempotent: repeated calls with the same capability are no-ops.
 */
export function configurePbrTextureAnisotropy(rendererMaxAnisotropy: number): number {
  const cap =
    Number.isFinite(rendererMaxAnisotropy) && rendererMaxAnisotropy >= 1
      ? Math.floor(rendererMaxAnisotropy)
      : PBR_DEFAULT_ANISOTROPY;
  const next = Math.max(1, Math.min(PBR_MAX_ANISOTROPY, cap));
  if (next === textureAnisotropy) return textureAnisotropy;
  textureAnisotropy = next;
  texCache.forEach((rec) => {
    if (rec.tex.anisotropy !== next) {
      rec.tex.anisotropy = next;
      if (isTextureLoaded(rec.tex)) rec.tex.needsUpdate = true;
    }
  });
  return textureAnisotropy;
}

/** Trilinear mip filtering + anisotropy for crisp grazing-angle micro-detail (CompressedTexture-safe). */
export function applyPbrTextureFiltering(tex: THREE.Texture): void {
  const isCompressed =
    (tex as THREE.CompressedTexture).isCompressedTexture === true;
  if (isCompressed) {
    // WebGL2 cannot generate mipmaps on compressed textures; embedded KTX2 mip chains must be preserved.
    tex.generateMipmaps = false;
    tex.minFilter =
      Array.isArray(tex.mipmaps) && tex.mipmaps.length > 1
        ? THREE.LinearMipmapLinearFilter
        : THREE.LinearFilter;
  } else {
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = textureAnisotropy;
}

function notifyKeyReady(key: string): void {
  const set = keyListeners.get(key);
  if (set) {
    set.forEach((fn) => fn());
  }
}

export function subscribeTextureKeys(
  keys: readonly string[],
  listener: () => void
): () => void {
  if (keys.length === 0) return () => {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    let set = keyListeners.get(k);
    if (!set) {
      set = new Set();
      keyListeners.set(k, set);
    }
    set.add(listener);
  }
  return () => {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const set = keyListeners.get(k);
      if (set) {
        set.delete(listener);
        if (set.size === 0) keyListeners.delete(k);
      }
    }
  };
}

export function isTextureLoaded(tex: THREE.Texture | null): boolean {
  if (!tex) return false;
  if ((tex as THREE.CompressedTexture).isCompressedTexture === true) {
    const img = tex.image as { width?: number; height?: number } | null | undefined;
    if (img && (img.width ?? 0) > 0) return true;
    const mip0 = Array.isArray(tex.mipmaps)
      ? (tex.mipmaps[0] as { width?: number } | undefined)
      : undefined;
    return (mip0?.width ?? 0) > 0;
  }
  if (!tex.image) return false;
  const img = tex.image as { width?: number; complete?: boolean };
  if (typeof img.complete === 'boolean') {
    return img.complete && (img.width ?? 0) > 0;
  }
  return (img.width ?? 0) > 0;
}

function touchTextureWeaponLru(
  weaponId: WeaponId,
  activeProtectedId?: WeaponId
): void {
  const idx = weaponTexLru.indexOf(weaponId);
  if (idx !== -1) {
    weaponTexLru.splice(idx, 1);
  }
  weaponTexLru.push(weaponId);

  while (weaponTexLru.length > MAX_CACHED_TEXTURE_WEAPONS) {
    const candidate = weaponTexLru[0];
    if (candidate === activeProtectedId) break;
    weaponTexLru.shift();
    const keys = weaponTexKeys.get(candidate);
    if (keys) {
      keys.forEach((k) => {
        const rec = texCache.get(k);
        if (rec && rec.ownerWeapon !== 'shared') {
          rec.disposed = true;
          rec.tex.dispose();
          texCache.delete(k);
        }
      });
      weaponTexKeys.delete(candidate);
    }
  }
}

/**
 * Locks a linear data texture (`normalMap`, Packed ORM `roughnessMap`/`aoMap`/`metalnessMap`)
 * to `THREE.NoColorSpace` with a strict-mode-safe no-op setter.
 *
 * `@react-three/fiber` v8 `applyProps` unconditionally overwrites `texture.colorSpace =
 * rootState.gl.outputColorSpace` (`SRGBColorSpace`) on every RGBA8 `THREE.Texture` JSX prop,
 * which otherwise causes WebGL2 to upload normal/ORM maps as `SRGB8_ALPHA8` (bending flat
 * normals by ~30° and squaring roughness/AO/metalness in hardware).
 */
export function lockLinearTextureColorSpace(tex: THREE.Texture): THREE.Texture {
  tex.colorSpace = THREE.NoColorSpace;
  Object.defineProperty(tex, 'colorSpace', {
    get: () => THREE.NoColorSpace,
    set: () => {},
    enumerable: true,
    configurable: true,
  });
  return tex;
}

function configureTextureProperties(
  tex: THREE.Texture,
  opts: {
    srgb: boolean;
    repeat?: number;
    wrapRepeat?: boolean;
  }
): void {
  if (opts.srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
  } else {
    lockLinearTextureColorSpace(tex);
  }
  applyPbrTextureFiltering(tex);

  if (opts.repeat && opts.repeat > 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat, opts.repeat);
  } else if (opts.wrapRepeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }
}

function registerCachedRecord(rec: CachedTextureRecord): void {
  texCache.set(rec.key, rec);
  if (rec.ownerWeapon !== 'shared') {
    let set = weaponTexKeys.get(rec.ownerWeapon);
    if (!set) {
      set = new Set();
      weaponTexKeys.set(rec.ownerWeapon, set);
    }
    set.add(rec.key);
    touchTextureWeaponLru(rec.ownerWeapon, rec.ownerWeapon);
  }
}

function swapRecordToWebpFallback(
  rec: CachedTextureRecord,
  fallbackWebpUrl: string,
  opts: { srgb: boolean; repeat?: number; wrapRepeat?: boolean }
): void {
  if (!loaderInstance) {
    loaderInstance = new THREE.TextureLoader();
  }
  let loadedSync = false;
  let swapped = false;
  const webpTex = loaderInstance.load(fallbackWebpUrl, (loadedTex) => {
    const target = loadedTex ?? webpTex;
    if (rec.disposed || texCache.get(rec.key) !== rec) {
      target?.dispose();
      return;
    }
    if (target) {
      target.needsUpdate = true;
    }
    if (!swapped) {
      loadedSync = true;
      return;
    }
    notifyKeyReady(rec.key);
  });

  configureTextureProperties(webpTex, opts);
  const prevTex = rec.tex;
  rec.tex = webpTex;
  rec.source = 'webp';
  webpHits += 1;
  swapped = true;

  if (prevTex && prevTex !== webpTex) {
    prevTex.dispose();
  }
  if (loadedSync) {
    notifyKeyReady(rec.key);
  }
}

function loadCachedTexture(
  fileName: string,
  opts: {
    srgb: boolean;
    repeat?: number;
    wrapRepeat?: boolean;
    baseOverride?: string;
    ownerWeapon: WeaponId | 'shared';
  }
): { key: string; tex: THREE.Texture | null } {
  const preferred = resolvePreferredTexturePath(fileName, opts.baseOverride);
  const url = preferred.url || resolveTextureUrl(fileName, opts.baseOverride);
  const repeatTag = opts.repeat ?? (opts.wrapRepeat ? 'rep' : 1);
  const key = `${url}|${opts.srgb ? 'srgb' : 'lin'}|${repeatTag}`;
  if (typeof window === 'undefined') {
    return { key, tex: null };
  }

  const existing = texCache.get(key);
  if (existing && !existing.disposed) {
    if (opts.ownerWeapon !== 'shared') {
      if (
        existing.ownerWeapon !== 'shared' &&
        existing.ownerWeapon !== opts.ownerWeapon
      ) {
        existing.ownerWeapon = 'shared';
      } else {
        touchTextureWeaponLru(opts.ownerWeapon, opts.ownerWeapon);
      }
    }
    return { key, tex: existing.tex };
  }

  const ktx2 = preferred.isKtx2 ? getKtx2Loader() : null;
  const fallbackWebpUrl = resolveTextureUrl(fileName, opts.baseOverride);

  // KTX2-first path: fetch ONLY the KTX2 asset (zero eager WebP double-fetch),
  // swap the actual THREE.CompressedTexture into the cache record on success
  // (never copying `.image` onto a regular THREE.Texture), and fall back to WebP
  // exclusively if KTX2 decoding/network fails.
  if (preferred.isKtx2 && ktx2) {
    const placeholderTex = new THREE.Texture();
    configureTextureProperties(placeholderTex, opts);
    const rec: CachedTextureRecord = {
      key,
      tex: placeholderTex,
      ownerWeapon: opts.ownerWeapon,
      source: 'pending_ktx2',
      disposed: false,
    };
    registerCachedRecord(rec);

    void ktx2
      .loadAsync(url)
      .then((compressedTex) => {
        if (rec.disposed || texCache.get(key) !== rec) {
          compressedTex.dispose();
          return;
        }
        configureTextureProperties(compressedTex, opts);
        compressedTex.needsUpdate = true;
        const prevTex = rec.tex;
        rec.tex = compressedTex;
        rec.source = 'ktx2';
        ktx2Hits += 1;
        if (prevTex && prevTex !== compressedTex) {
          prevTex.dispose();
        }
        notifyKeyReady(key);
      })
      .catch(() => {
        if (rec.disposed || texCache.get(key) !== rec) {
          return;
        }
        swapRecordToWebpFallback(rec, fallbackWebpUrl, opts);
      });

    return { key, tex: rec.tex };
  }

  if (!loaderInstance) {
    loaderInstance = new THREE.TextureLoader();
  }

  let loadedSync = false;
  let registered = false;
  let recRef: CachedTextureRecord | null = null;
  const tex = loaderInstance.load(fallbackWebpUrl, (loadedTex) => {
    const target = loadedTex ?? tex;
    if (recRef && (recRef.disposed || texCache.get(key) !== recRef)) {
      target?.dispose();
      return;
    }
    if (target) {
      target.needsUpdate = true;
    }
    if (!registered) {
      loadedSync = true;
      return;
    }
    notifyKeyReady(key);
  });
  configureTextureProperties(tex, opts);

  const rec: CachedTextureRecord = {
    key,
    tex,
    ownerWeapon: opts.ownerWeapon,
    source: 'webp',
    disposed: false,
  };
  recRef = rec;
  webpHits += 1;
  registerCachedRecord(rec);
  registered = true;

  if (loadedSync) {
    notifyKeyReady(key);
  }

  return { key, tex: rec.tex };
}

/**
 * Returns the cached, subpath-safe, RepeatWrapping + linear-locked 512x512 seamless
 * rolled-steel RHA + mineral CARC triplanar detail texture pair (`normalMap`, `roughnessMap`).
 * Gracefully returns `{ normalMap: null, roughnessMap: null, textureKeys: [] }` in headless Node.
 */
export function getArmorDetailTextures(
  baseOverride?: string
): ArmorDetailTextureBundle {
  if (typeof window === 'undefined') {
    return { normalMap: null, roughnessMap: null, textureKeys: [] };
  }
  const nrm = loadCachedTexture(ARMOR_DETAIL_NORMAL_FILE, {
    srgb: false,
    wrapRepeat: true,
    baseOverride,
    ownerWeapon: 'shared',
  });
  const rgh = loadCachedTexture(ARMOR_DETAIL_ROUGHNESS_FILE, {
    srgb: false,
    wrapRepeat: true,
    baseOverride,
    ownerWeapon: 'shared',
  });
  const bundleKey = `${nrm.key}||${rgh.key}`;
  const cached = armorDetailBundleCache.get(bundleKey);
  if (cached) {
    return cached;
  }
  const nrmKey = nrm.key;
  const rghKey = rgh.key;
  const bundle: ArmorDetailTextureBundle = {
    get normalMap() {
      return getCachedTexture(nrmKey);
    },
    get roughnessMap() {
      return getCachedTexture(rghKey);
    },
    textureKeys: [nrmKey, rghKey],
  };
  armorDetailBundleCache.set(bundleKey, bundle);
  return bundle;
}

/**
 * Resolves multi-channel WebP / KTX2 PBR textures (Albedo + Tangent-Space Normal + Roughness)
 * for any weapon component, automatically pooling shared micro-detail maps and managing
 * weapon-specific 2K/4K atlases in a bounded GPU LRU pool.
 */
export function getPartPbrBundle(
  weaponIdRaw: string,
  material: MaterialKind,
  customBinding?: PbrBindingSpec
): PartPbrBundle {
  const ownerWeapon: WeaponId = isWeaponId(weaponIdRaw) ? weaponIdRaw : 'ak15';

  if (customBinding) {
    const alb = loadCachedTexture(customBinding.albedoFile, {
      srgb: true,
      repeat: customBinding.repeat,
      ownerWeapon,
    });
    const nrm = loadCachedTexture(customBinding.normalFile, {
      srgb: false,
      repeat: customBinding.repeat,
      ownerWeapon,
    });
    const rgh = loadCachedTexture(customBinding.roughnessFile, {
      srgb: false,
      repeat: customBinding.repeat,
      ownerWeapon,
    });
    const albKey = alb.key;
    const nrmKey = nrm.key;
    const rghKey = rgh.key;
    return {
      get map() {
        return getCachedTexture(albKey);
      },
      get normalMap() {
        return getCachedTexture(nrmKey);
      },
      get roughnessMap() {
        return getCachedTexture(rghKey);
      },
      normalScale: customBinding.normalScale,
      hasCustomAtlas: true,
      textureKeys: [albKey, nrmKey, rghKey],
    };
  }

  if (material === 'polymer_frame' || material === 'follower_orange') {
    const nrm = loadCachedTexture('polymer_detail_normal.webp', {
      srgb: false,
      repeat: 3,
      ownerWeapon: 'shared',
    });
    const rgh = loadCachedTexture('polymer_detail_roughness.webp', {
      srgb: false,
      repeat: 3,
      ownerWeapon: 'shared',
    });
    const nrmKey = nrm.key;
    const rghKey = rgh.key;
    return {
      map: null,
      get normalMap() {
        return getCachedTexture(nrmKey);
      },
      get roughnessMap() {
        return getCachedTexture(rghKey);
      },
      normalScale: material === 'polymer_frame' ? 0.34 : 0.24,
      hasCustomAtlas: false,
      textureKeys: [nrmKey, rghKey],
    };
  }

  if (
    material === 'nitride_steel' ||
    material === 'barrel_steel' ||
    material === 'stainless' ||
    material === 'copper_accent'
  ) {
    const nrm = loadCachedTexture('metal_detail_normal.webp', {
      srgb: false,
      repeat: 2,
      ownerWeapon: 'shared',
    });
    const rgh = loadCachedTexture('metal_detail_roughness.webp', {
      srgb: false,
      repeat: 2,
      ownerWeapon: 'shared',
    });
    const nrmKey = nrm.key;
    const rghKey = rgh.key;
    return {
      map: null,
      get normalMap() {
        return getCachedTexture(nrmKey);
      },
      get roughnessMap() {
        return getCachedTexture(rghKey);
      },
      normalScale: material === 'stainless' ? 0.28 : 0.42,
      hasCustomAtlas: false,
      textureKeys: [nrmKey, rghKey],
    };
  }

  return {
    map: null,
    normalMap: null,
    roughnessMap: null,
    normalScale: 0,
    hasCustomAtlas: false,
    textureKeys: [],
  };
}
