import {
  resolveAssetUrl,
  resolveModelUrl,
  resolveTextureUrl,
} from '../utils/assetUrl';
import { hasGlbWeaponAsset } from '../geometry/glbAssetService';
import { WEAPON_MANIFESTS } from '../../weapons/manifests';
import type { WeaponId } from '../../weapons/types';
import { isTankWeapon } from '../physics/armoryPhysics';

export const OFFLINE_MUSEUM_CACHE_NAME = 'digital-armory-offline-v5-0';

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

/**
 * Computes the complete subpath-safe URL list for offline museum viewing of a single
 * exhibit (Draco GLB + bilingual narration JSON + primary WebP textures).
 */
export function buildExhibitOfflineAssetUrls(
  weaponId: WeaponId,
  baseOverride?: string
): ExhibitOfflineManifest {
  const urls: string[] = [];
  if (hasGlbWeaponAsset(weaponId)) {
    urls.push(resolveModelUrl(`${weaponId}.glb`, baseOverride));
  }
  urls.push(resolveAssetUrl(`narrations/${weaponId}.json`, baseOverride));

  if (isTankWeapon(weaponId)) {
    urls.push(
      resolveTextureUrl(`${weaponId}_v3_hull_albedo.webp`, baseOverride),
      resolveTextureUrl(`${weaponId}_v3_hull_normal.webp`, baseOverride),
      resolveTextureUrl(`${weaponId}_v3_hull_orm.webp`, baseOverride)
    );
  } else {
    urls.push(
      resolveTextureUrl('steel_normal.webp', baseOverride),
      resolveTextureUrl('polymer_normal.webp', baseOverride)
    );
  }

  return {
    weaponId,
    urls,
    estimatedMb: isTankWeapon(weaponId) ? 14.5 : 5.2,
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
    const hit = await cache.match(urls[0]);
    return !!hit;
  } catch {
    return false;
  }
}

export async function cacheExhibitOffline(
  weaponId: WeaponId
): Promise<{ ok: boolean; cachedCount: number }> {
  if (typeof caches === 'undefined') return { ok: false, cachedCount: 0 };
  const { urls } = buildExhibitOfflineAssetUrls(weaponId);
  try {
    const cache = await caches.open(OFFLINE_MUSEUM_CACHE_NAME);
    let count = 0;
    for (const u of urls) {
      try {
        await cache.add(u);
        count += 1;
      } catch {
        // tolerate optional texture miss while caching core GLB/JSON
      }
    }
    return { ok: count > 0, cachedCount: count };
  } catch {
    return { ok: false, cachedCount: 0 };
  }
}

export async function removeExhibitOfflineCache(
  weaponId: WeaponId
): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(OFFLINE_MUSEUM_CACHE_NAME);
    const { urls } = buildExhibitOfflineAssetUrls(weaponId);
    await Promise.all(urls.map((u) => cache.delete(u)));
  } catch {
    // ignore cache error
  }
}

export async function purgeAllOfflineCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(OFFLINE_MUSEUM_CACHE_NAME);
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
  await Promise.all(
    WEAPON_MANIFESTS.map(async (m) => {
      if (await isExhibitCachedOffline(m.id)) {
        out.add(m.id);
      }
    })
  );
  return out;
}
