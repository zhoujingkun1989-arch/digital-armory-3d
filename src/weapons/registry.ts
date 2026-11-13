import { useEffect, useSyncExternalStore } from 'react';
import type { WeaponId, WeaponRuntimePlugin } from './types';
import { isWeaponId } from './types';

const PLUGIN_LOADERS: Record<WeaponId, () => Promise<WeaponRuntimePlugin>> = {
  ak15: () => import('./ak15/plugin').then((m) => m.AK15_PLUGIN),
  m4a1: () => import('./m4a1/plugin').then((m) => m.M4A1_PLUGIN),
  mp5: () => import('./mp5/plugin').then((m) => m.MP5_PLUGIN),
  g17: () => import('./g17/plugin').then((m) => m.G17_PLUGIN),
  m82a1: () => import('./m82a1/plugin').then((m) => m.M82A1_PLUGIN),
  awm: () => import('./awm/plugin').then((m) => m.AWM_PLUGIN),
  scar: () => import('./scar/plugin').then((m) => m.SCAR_PLUGIN),
  deagle: () => import('./deagle/plugin').then((m) => m.DEAGLE_PLUGIN),
  aug: () => import('./aug/plugin').then((m) => m.AUG_PLUGIN),
  p320: () => import('./p320/plugin').then((m) => m.P320_PLUGIN),
  p90: () => import('./p90/plugin').then((m) => m.P90_PLUGIN),
};

const pluginCache = new Map<WeaponId, WeaponRuntimePlugin>();
const inflightMap = new Map<WeaponId, Promise<WeaponRuntimePlugin>>();
const pluginListeners = new Set<() => void>();

function notifyPluginLoaded(): void {
  pluginListeners.forEach((fn) => fn());
}

export function subscribeWeaponPlugins(listener: () => void): () => void {
  pluginListeners.add(listener);
  return () => {
    pluginListeners.delete(listener);
  };
}

export function getLoadedWeaponPlugin(
  weaponId: string
): WeaponRuntimePlugin | null {
  if (!isWeaponId(weaponId)) return null;
  return pluginCache.get(weaponId) ?? null;
}

export function loadWeaponPlugin(
  weaponId: string
): Promise<WeaponRuntimePlugin> {
  const id: WeaponId = isWeaponId(weaponId) ? weaponId : 'ak15';
  const cached = pluginCache.get(id);
  if (cached) return Promise.resolve(cached);

  const inflight = inflightMap.get(id);
  if (inflight) return inflight;

  const promise = PLUGIN_LOADERS[id]().then((plugin) => {
    pluginCache.set(id, plugin);
    inflightMap.delete(id);
    notifyPluginLoaded();
    return plugin;
  });
  inflightMap.set(id, promise);
  return promise;
}

export function preloadWeaponPlugin(weaponId: string): void {
  void loadWeaponPlugin(weaponId);
}

/**
 * React hook returning the dynamically loaded `WeaponRuntimePlugin` for `weaponId`.
 * Subscribes via `useSyncExternalStore` and triggers background chunk load on demand.
 */
export function useWeaponPlugin(weaponId: string): WeaponRuntimePlugin | null {
  const id: WeaponId = isWeaponId(weaponId) ? weaponId : 'ak15';

  useEffect(() => {
    preloadWeaponPlugin(id);
  }, [id]);

  return useSyncExternalStore(
    subscribeWeaponPlugins,
    () => pluginCache.get(id) ?? null,
    () => null
  );
}
