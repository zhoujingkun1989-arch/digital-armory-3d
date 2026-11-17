import { useSyncExternalStore } from 'react';
import type { WeaponId } from '../../weapons/types';
import type { ExplodedPinItem } from './explodedPinLayout';

export type MonographEdition = 'obsidian_folio' | 'blueprint_manual';
export type MonographPageMode = 'full_8p' | 'compact_4p';
export type MonographStyleMode = 'kids_pictorial' | 'pro_dossier';

export type MonographPlateKey =
  | 'cover_hero'
  | 'breech_closeup'
  | 'ortho_right'
  | 'ortho_left'
  | 'ortho_top'
  | 'xray_magic'
  | 'stencil_cutaway'
  | 'functional_roles'
  | 'exploded_bom'
  | 'group_slide'
  | 'group_frame'
  | 'group_fcg'
  | 'group_mag'
  | 'comic_1_ready'
  | 'comic_2_ignition'
  | 'comic_3_eject'
  | 'comic_4_reload';

export const MONOGRAPH_PLATE_KEYS: readonly MonographPlateKey[] = [
  'cover_hero',
  'ortho_right',
  'ortho_left',
  'ortho_top',
  'xray_magic',
  'stencil_cutaway',
  'functional_roles',
  'exploded_bom',
  'group_slide',
  'group_frame',
  'group_fcg',
  'group_mag',
  'comic_1_ready',
  'comic_2_ignition',
  'comic_3_eject',
  'comic_4_reload',
  'breech_closeup',
];

export interface MonographCaptureBundle {
  cacheKey: string;
  weaponId: WeaponId;
  edition: MonographEdition;
  capturedAtIso: string;
  plates: Record<MonographPlateKey, string>;
  explodedPins: ExplodedPinItem[];
}

export interface MonographCaptureRequest {
  requestId: number;
  weaponId: WeaponId;
  edition: MonographEdition;
  forceRefresh: boolean;
}

export interface MonographCaptureState {
  activeRequest: MonographCaptureRequest | null;
  completedPlates: number;
  totalPlates: number;
  statusStepKey: MonographPlateKey | 'preparing' | 'idle';
  version: number;
}

const MAX_CACHED_BUNDLES = 4;
const bundleCache = new Map<string, MonographCaptureBundle>();
const bundleLru: string[] = [];
const listeners = new Set<() => void>();

let nextRequestId = 1;
let stateSnapshot: MonographCaptureState = {
  activeRequest: null,
  completedPlates: 0,
  totalPlates: MONOGRAPH_PLATE_KEYS.length,
  statusStepKey: 'idle',
  version: 0,
};

function emitChange(): void {
  stateSnapshot = {
    ...stateSnapshot,
    version: stateSnapshot.version + 1,
  };
  listeners.forEach((fn) => fn());
}

export function buildMonographCacheKey(
  weaponId: WeaponId,
  edition: MonographEdition
): string {
  return `${weaponId}:${edition}:v2`;
}

export function getCachedMonographBundle(
  weaponId: WeaponId,
  edition: MonographEdition
): MonographCaptureBundle | null {
  const key = buildMonographCacheKey(weaponId, edition);
  const found = bundleCache.get(key) ?? null;
  if (found) {
    const idx = bundleLru.indexOf(key);
    if (idx !== -1) bundleLru.splice(idx, 1);
    bundleLru.push(key);
  }
  return found;
}

export function storeMonographBundle(bundle: MonographCaptureBundle): void {
  const key = bundle.cacheKey;
  bundleCache.set(key, bundle);
  const idx = bundleLru.indexOf(key);
  if (idx !== -1) bundleLru.splice(idx, 1);
  bundleLru.push(key);

  while (bundleLru.length > MAX_CACHED_BUNDLES) {
    const oldest = bundleLru.shift();
    if (oldest) {
      bundleCache.delete(oldest);
    }
  }
}

export function requestMonographCapture(
  weaponId: WeaponId,
  edition: MonographEdition,
  forceRefresh = false
): number {
  if (!forceRefresh && getCachedMonographBundle(weaponId, edition)) {
    if (stateSnapshot.activeRequest !== null) {
      stateSnapshot = {
        ...stateSnapshot,
        activeRequest: null,
        completedPlates: MONOGRAPH_PLATE_KEYS.length,
        statusStepKey: 'idle',
      };
      emitChange();
    }
    return 0;
  }

  const requestId = nextRequestId++;
  stateSnapshot = {
    activeRequest: {
      requestId,
      weaponId,
      edition,
      forceRefresh,
    },
    completedPlates: 0,
    totalPlates: MONOGRAPH_PLATE_KEYS.length,
    statusStepKey: 'preparing',
    version: stateSnapshot.version,
  };
  emitChange();
  return requestId;
}

export function updateMonographCaptureProgress(
  requestId: number,
  completedPlates: number,
  statusStepKey: MonographPlateKey | 'preparing' | 'idle'
): void {
  if (stateSnapshot.activeRequest?.requestId !== requestId) return;
  stateSnapshot = {
    ...stateSnapshot,
    completedPlates,
    statusStepKey,
  };
  emitChange();
}

export function completeMonographCapture(
  requestId: number,
  bundle: MonographCaptureBundle
): void {
  storeMonographBundle(bundle);
  if (stateSnapshot.activeRequest?.requestId === requestId) {
    stateSnapshot = {
      ...stateSnapshot,
      activeRequest: null,
      completedPlates: MONOGRAPH_PLATE_KEYS.length,
      statusStepKey: 'idle',
    };
  }
  emitChange();
}

export function cancelMonographCapture(): void {
  if (!stateSnapshot.activeRequest) return;
  stateSnapshot = {
    ...stateSnapshot,
    activeRequest: null,
    completedPlates: 0,
    statusStepKey: 'idle',
  };
  emitChange();
}

export function getMonographCaptureState(): MonographCaptureState {
  return stateSnapshot;
}

export function subscribeMonographCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMonographCaptureState(): MonographCaptureState {
  return useSyncExternalStore(
    subscribeMonographCapture,
    getMonographCaptureState,
    getMonographCaptureState
  );
}
