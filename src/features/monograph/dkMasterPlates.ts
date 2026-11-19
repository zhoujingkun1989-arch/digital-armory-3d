import { resolveAssetUrl } from '../../engine/utils/assetUrl';
import { isWeaponId, type WeaponId } from '../../weapons/types';
import {
  MONOGRAPH_PLATE_KEYS,
  type MonographPlateKey,
} from './monographCaptureStore';

export interface DkMasterPlateEntry {
  file: string;
  width: number;
  height: number;
  azimuthDeg?: number;
  elevationDeg?: number;
  fovDeg?: number;
}

export interface DkWeaponMasterPlates {
  renderer: string;
  resolution: [number, number];
  transparent: boolean;
  plates: Partial<Record<MonographPlateKey, DkMasterPlateEntry>>;
}

export interface DkMasterPlateManifest {
  version: number;
  generatedAt?: string;
  weapons: Partial<Record<WeaponId, DkWeaponMasterPlates>>;
}

const VALID_PLATE_KEY_SET = new Set<string>(MONOGRAPH_PLATE_KEYS);

function createEmptyManifest(): DkMasterPlateManifest {
  return { version: 1, weapons: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function parsePlateEntry(raw: unknown): DkMasterPlateEntry | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.file !== 'string' || raw.file.trim().length === 0) {
    return null;
  }
  if (!isFinitePositive(raw.width) || !isFinitePositive(raw.height)) {
    return null;
  }

  const entry: DkMasterPlateEntry = {
    file: raw.file.trim(),
    width: Math.round(raw.width),
    height: Math.round(raw.height),
  };

  if (typeof raw.azimuthDeg === 'number' && Number.isFinite(raw.azimuthDeg)) {
    entry.azimuthDeg = raw.azimuthDeg;
  }
  if (
    typeof raw.elevationDeg === 'number' &&
    Number.isFinite(raw.elevationDeg)
  ) {
    entry.elevationDeg = raw.elevationDeg;
  }
  if (isFinitePositive(raw.fovDeg)) {
    entry.fovDeg = raw.fovDeg;
  }

  return entry;
}

function parseWeaponMasterPlates(raw: unknown): DkWeaponMasterPlates | null {
  if (!isRecord(raw)) return null;
  if (!isRecord(raw.plates)) return null;

  const plates: Partial<Record<MonographPlateKey, DkMasterPlateEntry>> = {};
  let validCount = 0;

  for (const [key, val] of Object.entries(raw.plates)) {
    if (!VALID_PLATE_KEY_SET.has(key)) continue;
    const parsed = parsePlateEntry(val);
    if (!parsed) continue;
    plates[key as MonographPlateKey] = parsed;
    validCount += 1;
  }

  if (validCount === 0) return null;

  const resRaw = raw.resolution;
  const resolution: [number, number] =
    Array.isArray(resRaw) &&
    resRaw.length === 2 &&
    isFinitePositive(resRaw[0]) &&
    isFinitePositive(resRaw[1])
      ? [Math.round(resRaw[0]), Math.round(resRaw[1])]
      : [2880, 1800];

  return {
    renderer:
      typeof raw.renderer === 'string' && raw.renderer.trim().length > 0
        ? raw.renderer.trim()
        : 'Blender Cycles',
    resolution,
    transparent: raw.transparent !== false,
    plates,
  };
}

export function parseDkMasterPlateManifest(
  raw: unknown
): DkMasterPlateManifest {
  if (!isRecord(raw)) return createEmptyManifest();

  const version =
    typeof raw.version === 'number' && Number.isFinite(raw.version)
      ? raw.version
      : 1;
  const generatedAt =
    typeof raw.generatedAt === 'string' && raw.generatedAt.trim().length > 0
      ? raw.generatedAt.trim()
      : undefined;

  const weapons: Partial<Record<WeaponId, DkWeaponMasterPlates>> = {};
  if (isRecord(raw.weapons)) {
    for (const [wid, val] of Object.entries(raw.weapons)) {
      if (!isWeaponId(wid)) continue;
      const parsed = parseWeaponMasterPlates(val);
      if (parsed) {
        weapons[wid] = parsed;
      }
    }
  }

  return {
    version,
    ...(generatedAt ? { generatedAt } : {}),
    weapons,
  };
}

let cachedManifest: DkMasterPlateManifest | null = null;
let cachedManifestKey: string | null = null;
let inflightManifestPromise: Promise<DkMasterPlateManifest> | null = null;
let inflightManifestKey: string | null = null;

/**
 * Loads and caches `public/plates/manifest.json` describing offline Blender Cycles
 * transparent studio master plates. Safely resolves to an empty manifest in non-browser,
 * Vitest, offline, or 404 environments without throwing.
 */
export async function loadDkMasterPlateManifest(
  baseOverride?: string
): Promise<DkMasterPlateManifest> {
  const manifestUrl = resolveAssetUrl('plates/manifest.json', baseOverride);

  if (cachedManifest !== null && cachedManifestKey === manifestUrl) {
    return cachedManifest;
  }
  if (inflightManifestPromise !== null && inflightManifestKey === manifestUrl) {
    return inflightManifestPromise;
  }

  const fetchFn =
    typeof globalThis.fetch === 'function' ? globalThis.fetch : null;
  if (!fetchFn) {
    const empty = createEmptyManifest();
    cachedManifest = empty;
    cachedManifestKey = manifestUrl;
    return empty;
  }

  const task = (async (): Promise<DkMasterPlateManifest> => {
    try {
      const response = await fetchFn(manifestUrl, { cache: 'no-cache' });
      if (!response.ok) {
        return createEmptyManifest();
      }
      const json: unknown = await response.json();
      return parseDkMasterPlateManifest(json);
    } catch {
      return createEmptyManifest();
    }
  })().then((manifest) => {
    if (inflightManifestKey === manifestUrl) {
      inflightManifestPromise = null;
      inflightManifestKey = null;
    }
    cachedManifest = manifest;
    cachedManifestKey = manifestUrl;
    return manifest;
  });

  inflightManifestPromise = task;
  inflightManifestKey = manifestUrl;
  return task;
}

export function getCachedDkMasterPlateManifest(): DkMasterPlateManifest | null {
  return cachedManifest;
}

export function getWeaponMasterPlates(
  weaponId: WeaponId
): DkWeaponMasterPlates | null {
  return cachedManifest?.weapons[weaponId] ?? null;
}

export function hasCyclesMasterPlates(weaponId: WeaponId): boolean {
  const entry = getWeaponMasterPlates(weaponId);
  return Boolean(entry && Object.keys(entry.plates).length > 0);
}

/**
 * Resolves a manifest plate entry's file path safely under both `/` and subpath
 * deployments (e.g. `/digital-armory-3d/`).
 */
export function resolveMasterPlateUrl(
  entry: Pick<DkMasterPlateEntry, 'file'>,
  baseOverride?: string
): string {
  return resolveAssetUrl(entry.file, baseOverride);
}

/** Resets module-level manifest cache for isolated Vitest runs. */
export function resetDkMasterPlateManifestCacheForTests(): void {
  cachedManifest = null;
  cachedManifestKey = null;
  inflightManifestPromise = null;
  inflightManifestKey = null;
}
