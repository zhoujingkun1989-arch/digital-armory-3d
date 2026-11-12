import { useEffect, useSyncExternalStore } from 'react';
import { resolveAssetUrl } from '../engine/utils/assetUrl';
import type { WeaponId } from '../weapons/types';
import { isWeaponId } from '../weapons/types';
import type { WeaponNarrationBundle } from './types';

const bundleCache = new Map<WeaponId, WeaponNarrationBundle | null>();
const inflightMap = new Map<WeaponId, Promise<WeaponNarrationBundle | null>>();
const loadingSet = new Set<WeaponId>();
const listeners = new Set<() => void>();

// Snapshot version counter so `useSyncExternalStore` re-renders cleanly on load state changes
let snapshotVersion = 0;

function notifyListeners(): void {
  snapshotVersion += 1;
  listeners.forEach((fn) => fn());
}

export function subscribeWeaponNarrations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Synchronous O(1) lookup used inside 60fps `CalloutOverlay` loop without async overhead.
 */
export function getLoadedNarrationBundle(
  weaponId: string
): WeaponNarrationBundle | null {
  if (!isWeaponId(weaponId)) return null;
  return bundleCache.get(weaponId) ?? null;
}

export function isWeaponNarrationLoading(weaponId: string): boolean {
  if (!isWeaponId(weaponId)) return false;
  return loadingSet.has(weaponId);
}

export function loadWeaponNarration(
  weaponId: string
): Promise<WeaponNarrationBundle | null> {
  const id: WeaponId = isWeaponId(weaponId) ? weaponId : 'ak15';
  if (bundleCache.has(id)) {
    return Promise.resolve(bundleCache.get(id) ?? null);
  }

  const existing = inflightMap.get(id);
  if (existing) return existing;

  if (typeof fetch !== 'function') {
    return Promise.resolve(null);
  }

  loadingSet.add(id);
  notifyListeners();

  const url = resolveAssetUrl(`narrations/${id}.json`);
  const promise = fetch(url)
    .then(async (res) => {
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) {
        // Vite SPA fallback when static JSON does not exist yet
        return null;
      }
      const parsed = (await res.json()) as WeaponNarrationBundle;
      if (!parsed || parsed.weaponId !== id || !parsed.story || !parsed.parts) {
        return null;
      }
      return parsed;
    })
    .catch(() => null)
    .then((bundle) => {
      bundleCache.set(id, bundle);
      loadingSet.delete(id);
      inflightMap.delete(id);
      notifyListeners();
      return bundle;
    });

  inflightMap.set(id, promise);
  return promise;
}

export function preloadWeaponNarration(weaponId: string): void {
  void loadWeaponNarration(weaponId);
}

export function useWeaponNarration(weaponId: string): {
  bundle: WeaponNarrationBundle | null;
  loading: boolean;
} {
  const id: WeaponId = isWeaponId(weaponId) ? weaponId : 'ak15';

  useEffect(() => {
    preloadWeaponNarration(id);
  }, [id]);

  useSyncExternalStore(
    subscribeWeaponNarrations,
    () => snapshotVersion,
    () => 0
  );

  return {
    bundle: bundleCache.get(id) ?? null,
    loading: loadingSet.has(id),
  };
}
