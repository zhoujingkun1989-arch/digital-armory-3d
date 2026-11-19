import { useSyncExternalStore } from 'react';
import type { WeaponId } from '../../weapons/types';
import type { DkCalloutItem, ExplodedPinItem } from './explodedPinLayout';

export type MonographEdition =
  'dk_encyclopedia' | 'blueprint_manual' | 'obsidian_folio';
export type MonographStyleMode =
  'dk_encyclopedia' | 'kids_pictorial' | 'pro_dossier';
export type MonographPageMode = 'full_8p' | 'compact_4p';
export type MonographLayoutMode = 'portrait_a4' | 'spread_a3';
export type MonographCaptureQuality = 'standard_1440' | 'print_2880';
export type MonographPlateSource = 'cycles_4k' | 'webgl_2880' | 'webgl_1440';
export type MonographLoupeKey =
  'group_slide' | 'group_frame' | 'group_fcg' | 'group_mag' | 'breech_closeup';

export interface MonographLoupeAnchor {
  u: number;
  v: number;
}

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
  quality: MonographCaptureQuality;
  capturedAtIso: string;
  plates: Record<MonographPlateKey, string>;
  plateSources: Partial<Record<MonographPlateKey, MonographPlateSource>>;
  explodedPins: ExplodedPinItem[];
  dkHeroCallouts: DkCalloutItem[];
  dkCutawayCallouts: DkCalloutItem[];
  dkExplodedCallouts: DkCalloutItem[];
  loupeAnchors: Partial<Record<MonographLoupeKey, MonographLoupeAnchor>>;
}

/**
 * Backward-compatible input shape for callers/tests that construct legacy v2 bundles
 * without explicitly passing v3 DK callout/quality/source metadata.
 */
export type MonographCaptureBundleInput = Omit<
  MonographCaptureBundle,
  | 'quality'
  | 'plateSources'
  | 'dkHeroCallouts'
  | 'dkCutawayCallouts'
  | 'dkExplodedCallouts'
  | 'loupeAnchors'
> &
  Partial<
    Pick<
      MonographCaptureBundle,
      | 'quality'
      | 'plateSources'
      | 'dkHeroCallouts'
      | 'dkCutawayCallouts'
      | 'dkExplodedCallouts'
      | 'loupeAnchors'
    >
  >;

export interface MonographCaptureRequest {
  requestId: number;
  weaponId: WeaponId;
  edition: MonographEdition;
  quality: MonographCaptureQuality;
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

function normalizeMonographBundle(
  input: MonographCaptureBundleInput
): MonographCaptureBundle {
  const quality: MonographCaptureQuality = input.quality ?? 'standard_1440';
  return {
    cacheKey: input.cacheKey,
    weaponId: input.weaponId,
    edition: input.edition,
    quality,
    capturedAtIso: input.capturedAtIso,
    plates: input.plates,
    plateSources: input.plateSources ?? {},
    explodedPins: input.explodedPins,
    dkHeroCallouts: input.dkHeroCallouts ?? [],
    dkCutawayCallouts: input.dkCutawayCallouts ?? [],
    dkExplodedCallouts: input.dkExplodedCallouts ?? [],
    loupeAnchors: input.loupeAnchors ?? {},
  };
}

export function buildMonographCacheKey(
  weaponId: WeaponId,
  edition: MonographEdition,
  quality: MonographCaptureQuality = 'standard_1440'
): string {
  return `${weaponId}:${edition}:${quality}:v3`;
}

export function getCachedMonographBundle(
  weaponId: WeaponId,
  edition: MonographEdition,
  quality: MonographCaptureQuality = 'standard_1440'
): MonographCaptureBundle | null {
  const key = buildMonographCacheKey(weaponId, edition, quality);
  const found = bundleCache.get(key) ?? null;
  if (found) {
    const idx = bundleLru.indexOf(key);
    if (idx !== -1) bundleLru.splice(idx, 1);
    bundleLru.push(key);
  }
  return found;
}

export function storeMonographBundle(
  bundle: MonographCaptureBundleInput
): void {
  const normalized = normalizeMonographBundle(bundle);
  const key = normalized.cacheKey;
  bundleCache.set(key, normalized);
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
  forceRefresh = false,
  quality: MonographCaptureQuality = 'standard_1440'
): number {
  if (!forceRefresh && getCachedMonographBundle(weaponId, edition, quality)) {
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
      quality,
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
  bundle: MonographCaptureBundleInput
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

/** Clears cached bundles and resets capture state for isolated unit tests. */
export function clearMonographCacheForTests(): void {
  bundleCache.clear();
  bundleLru.length = 0;
  stateSnapshot = {
    activeRequest: null,
    completedPlates: 0,
    totalPlates: MONOGRAPH_PLATE_KEYS.length,
    statusStepKey: 'idle',
    version: stateSnapshot.version + 1,
  };
  listeners.forEach((fn) => fn());
}
