import {
  resolveAssetUrl,
  resolveHdriUrl,
  resolveModelUrl,
  resolveTextureUrl,
} from '../utils/assetUrl';
import { GLB_WEAPON_CONFIGS } from '../geometry/glbAssetService';
import { WEAPON_MANIFESTS } from '../../weapons/manifests';
import type { WeaponId } from '../../weapons/types';
import {
  isArcheryWeapon,
  isHeavyScaleWeapon,
  isOrdnanceWeapon,
  isTankWeapon,
} from '../physics/armoryPhysics';

export const OFFLINE_MUSEUM_CACHE_NAME = 'digital-armory-offline-v6-0';
export const OFFLINE_RUNTIME_CACHE_NAME = 'digital-armory-runtime-v6-0';
const LEGACY_OFFLINE_CACHE_NAMES = ['digital-armory-offline-v5-0'] as const;

export const HEAVY_ARMOR_HDRI_FILE = 'heavy_armor_hangar.hdr';
export const SMALL_ARMS_HDRI_FILE = 'tactical_vault.hdr';
export const ARMOR_DETAIL_TEXTURE_FILES = [
  'armor_detail_normal.webp',
  'armor_detail_roughness.webp',
] as const;
export const DRACO_RUNTIME_ASSET_PATHS = [
  'draco/draco_decoder.wasm',
  'draco/draco_wasm_wrapper.js',
] as const;

/** Curated 5-legend cross-hall offline starter pack (Rifle · Pistol · WWII Icon · 30mm Aero Cannon · 1:1 MBT). */
export const FEATURED_LEGENDS_OFFLINE_IDS: readonly WeaponId[] = [
  'ak15',
  'p08',
  'm1911',
  'gau8',
  'ztz99a',
] as const;

/** Complete 8-tank Heavy Armor Hall offline pack. */
export const ARMOR_HALL_OFFLINE_IDS: readonly WeaponId[] = [
  'ztz99a',
  'm1a2',
  'leopard2a7',
  'tiger1',
  't90m',
  'challenger2',
  'merkava4',
  't34_85',
] as const;

export interface OfflinePackSummary {
  weaponIds: readonly WeaponId[];
  uniqueUrls: readonly string[];
  totalAssetRequests: number;
  estimatedMb: number;
}

export interface ExhibitOfflineManifest {
  weaponId: WeaponId;
  urls: readonly string[];
  estimatedMb: number;
}

export interface OfflineStorageEstimate {
  supported: boolean;
  usageMb: number;
  quotaMb: number;
  cachedUrlsCount: number;
}

export type OfflineCacheProgressCallback = (
  done: number,
  total: number,
  url: string
) => void;

export interface CacheExhibitResult {
  ok: boolean;
  cachedCount: number;
  totalCount: number;
  failedUrls: readonly string[];
}

function isHeavyOrdnanceExhibit(weaponId: WeaponId): boolean {
  return isHeavyScaleWeapon(weaponId);
}

function collectUniqueGlbTextureFiles(weaponId: WeaponId): string[] {
  const glbConfig = GLB_WEAPON_CONFIGS[weaponId];
  if (!glbConfig) return [];
  const files = new Set<string>();
  for (const binding of Object.values(glbConfig.pbrOverrides)) {
    if (binding.albedoFile) files.add(binding.albedoFile);
    if (binding.normalFile) files.add(binding.normalFile);
    if (binding.roughnessFile) files.add(binding.roughnessFile);
  }
  return Array.from(files);
}

function estimateExhibitOfflineMb(
  weaponId: WeaponId,
  uniqueTextureCount: number,
  hasGlb: boolean
): number {
  if (!hasGlb) {
    return isHeavyScaleWeapon(weaponId) ? 1.5 : 1.0;
  }
  if (isTankWeapon(weaponId)) return 11.2;
  if (isOrdnanceWeapon(weaponId)) return 4.2;
  if (isArcheryWeapon(weaponId)) return 3.6;
  return uniqueTextureCount <= 6 ? 3.2 : 3.5;
}

/**
 * Computes the complete subpath-safe URL list for offline museum viewing of a single
 * exhibit using real assets derived directly from `GLB_WEAPON_CONFIGS[weaponId]`:
 * - Draco `.glb` model + shared Draco WASM runtime decoder files (for Flagship GLB exhibits)
 * - Bilingual narration `.json` (all 100 exhibits)
 * - Every unique Cycles-baked `albedoFile` / `normalFile` / `roughnessFile` WebP map
 * - Heavy armor micro-detail maps + hangar HDRI (for 1:1 MBTs & heavy ordnance) or vault HDRI
 */
export function buildExhibitOfflineAssetUrls(
  weaponId: WeaponId,
  baseOverride?: string
): ExhibitOfflineManifest {
  const urlSet = new Set<string>();
  const glbConfig = GLB_WEAPON_CONFIGS[weaponId];
  const hasGlb = Boolean(glbConfig?.modelFile);

  if (glbConfig?.modelFile) {
    urlSet.add(resolveModelUrl(glbConfig.modelFile, baseOverride));
  }

  urlSet.add(resolveAssetUrl(`narrations/${weaponId}.json`, baseOverride));

  const uniqueTextures = collectUniqueGlbTextureFiles(weaponId);
  for (const texFile of uniqueTextures) {
    urlSet.add(resolveTextureUrl(texFile, baseOverride));
  }

  if (isHeavyOrdnanceExhibit(weaponId)) {
    for (const detailFile of ARMOR_DETAIL_TEXTURE_FILES) {
      urlSet.add(resolveTextureUrl(detailFile, baseOverride));
    }
    urlSet.add(resolveHdriUrl(HEAVY_ARMOR_HDRI_FILE, baseOverride));
  } else {
    urlSet.add(resolveHdriUrl(SMALL_ARMS_HDRI_FILE, baseOverride));
  }

  if (hasGlb) {
    for (const dracoRelPath of DRACO_RUNTIME_ASSET_PATHS) {
      urlSet.add(resolveAssetUrl(dracoRelPath, baseOverride));
    }
  }

  return {
    weaponId,
    urls: Array.from(urlSet),
    estimatedMb: estimateExhibitOfflineMb(
      weaponId,
      uniqueTextures.length,
      hasGlb
    ),
  };
}

/**
 * Summarizes an offline batch pack (e.g. Featured 5 Legends or Heavy Armor Hall):
 * deduplicates shared URLs while computing accurate aggregate MB estimate.
 */
export function summarizeOfflinePack(
  weaponIds: readonly WeaponId[],
  baseOverride?: string
): OfflinePackSummary {
  const uniqueUrls = new Set<string>();
  let totalAssetRequests = 0;
  let totalMb = 0;

  for (const weaponId of weaponIds) {
    const manifest = buildExhibitOfflineAssetUrls(weaponId, baseOverride);
    totalAssetRequests += manifest.urls.length;
    totalMb += manifest.estimatedMb;
    for (const url of manifest.urls) {
      uniqueUrls.add(url);
    }
  }

  return {
    weaponIds: [...weaponIds],
    uniqueUrls: Array.from(uniqueUrls),
    totalAssetRequests,
    estimatedMb: Number(totalMb.toFixed(1)),
  };
}

export async function isExhibitCachedOffline(
  weaponId: WeaponId
): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(OFFLINE_MUSEUM_CACHE_NAME);
    const { urls } = buildExhibitOfflineAssetUrls(weaponId);
    if (urls.length === 0) return false;
    const hits = await Promise.all(urls.map((u) => cache.match(u)));
    return hits.every(Boolean);
  } catch {
    return false;
  }
}

export async function cacheExhibitOffline(
  weaponId: WeaponId,
  onProgress?: OfflineCacheProgressCallback
): Promise<CacheExhibitResult> {
  const { urls } = buildExhibitOfflineAssetUrls(weaponId);
  const totalCount = urls.length;
  if (typeof caches === 'undefined') {
    return { ok: false, cachedCount: 0, totalCount, failedUrls: [...urls] };
  }

  try {
    const cache = await caches.open(OFFLINE_MUSEUM_CACHE_NAME);
    let cachedCount = 0;
    let processed = 0;
    const failedUrls: string[] = [];

    for (const url of urls) {
      try {
        const existing = await cache.match(url);
        if (!existing) {
          await cache.add(url);
        }
        cachedCount += 1;
      } catch {
        failedUrls.push(url);
      }
      processed += 1;
      onProgress?.(processed, totalCount, url);
    }

    return {
      ok: failedUrls.length === 0 && cachedCount > 0,
      cachedCount,
      totalCount,
      failedUrls,
    };
  } catch {
    return { ok: false, cachedCount: 0, totalCount, failedUrls: [...urls] };
  }
}

export async function removeExhibitOfflineCache(
  weaponId: WeaponId
): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(OFFLINE_MUSEUM_CACHE_NAME);
    const { urls } = buildExhibitOfflineAssetUrls(weaponId);
    const cachedWeaponIds = await queryAllCachedWeaponIds();
    const sharedProtectedUrls = new Set<string>();

    for (const otherId of cachedWeaponIds) {
      if (otherId === weaponId) continue;
      for (const otherUrl of buildExhibitOfflineAssetUrls(otherId).urls) {
        sharedProtectedUrls.add(otherUrl);
      }
    }

    const deletableUrls = urls.filter((u) => !sharedProtectedUrls.has(u));
    await Promise.all(deletableUrls.map((u) => cache.delete(u)));
  } catch {
    // ignore cache error
  }
}

export async function purgeAllOfflineCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await Promise.all([
      caches.delete(OFFLINE_MUSEUM_CACHE_NAME),
      ...LEGACY_OFFLINE_CACHE_NAMES.map((name) => caches.delete(name)),
    ]);
  } catch {
    // ignore
  }
}

export async function queryOfflineStorageStatus(): Promise<OfflineStorageEstimate> {
  let cachedUrlsCount = 0;
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(OFFLINE_MUSEUM_CACHE_NAME);
      const keys = await cache.keys();
      cachedUrlsCount = keys.length;
    } catch {
      cachedUrlsCount = 0;
    }
  }

  let usageMb = 0;
  let quotaMb = 0;
  if (
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.estimate === 'function'
  ) {
    try {
      const est = await navigator.storage.estimate();
      usageMb = Number(((est.usage ?? 0) / (1024 * 1024)).toFixed(1));
      quotaMb = Number(((est.quota ?? 0) / (1024 * 1024)).toFixed(0));
    } catch {
      usageMb = 0;
    }
  }

  return {
    supported: typeof caches !== 'undefined',
    usageMb,
    quotaMb,
    cachedUrlsCount,
  };
}

export async function queryAllCachedWeaponIds(): Promise<Set<WeaponId>> {
  const out = new Set<WeaponId>();
  if (typeof caches === 'undefined') return out;
  try {
    const cache = await caches.open(OFFLINE_MUSEUM_CACHE_NAME);
    const keys = await cache.keys();
    if (keys.length === 0) return out;

    const cachedUrls = new Set<string>();
    for (const req of keys) {
      cachedUrls.add(req.url);
      try {
        cachedUrls.add(new URL(req.url).pathname);
      } catch {
        // relative mock URL already added above
      }
    }

    for (const manifest of WEAPON_MANIFESTS) {
      const { urls } = buildExhibitOfflineAssetUrls(manifest.id);
      if (urls.length === 0) continue;
      if (urls.every((u) => cachedUrls.has(u))) {
        out.add(manifest.id);
      }
    }
  } catch {
    return out;
  }
  return out;
}
