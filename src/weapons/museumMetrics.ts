import type {
  ArmorTargetTankId,
  PenetratorId,
} from '../engine/physics/armorPenetration';
import { WEAPON_MANIFESTS, matchesArmoryCategory } from './manifests';
import type { ArmoryCategory, WeaponId } from './types';

/**
 * Single Source of Truth (SSOT) for Digital Armory 3D museum exhibit counts,
 * part totals, hall counts, caliber coverage, timeline span, and cross-lab presets.
 *
 * Dynamically derived from `WEAPON_MANIFESTS` and pure domain specs so UI copy
 * never drifts across releases.
 */
export const MUSEUM_VERSION = 'v6.0' as const;
export const MUSEUM_RELEASE_VERSION = '6.0.0' as const;

export const MUSEUM_EXHIBIT_COUNT = WEAPON_MANIFESTS.length;

export const MUSEUM_TOTAL_PARTS = WEAPON_MANIFESTS.reduce(
  (sum, manifest) => sum + manifest.catalog.partsCount,
  0
);

export const MUSEUM_HALL_KEYS: readonly ArmoryCategory[] = [
  'all',
  'assault',
  'lmg',
  'smg',
  'sniper',
  'shotgun',
  'pistol',
  'archery',
  'armor',
  'ordnance',
];

export const MUSEUM_HALL_COUNT = MUSEUM_HALL_KEYS.length;

export const MUSEUM_HALL_COUNTS: Readonly<Record<ArmoryCategory, number>> =
  MUSEUM_HALL_KEYS.reduce(
    (acc, key) => {
      acc[key] = WEAPON_MANIFESTS.filter((manifest) =>
        matchesArmoryCategory(manifest.catalog, key)
      ).length;
      return acc;
    },
    {} as Record<ArmoryCategory, number>
  );

export const MUSEUM_HEAVY_ARMOR_COUNT = MUSEUM_HALL_COUNTS.armor;
export const MUSEUM_ARCHERY_COUNT = MUSEUM_HALL_COUNTS.archery;
export const MUSEUM_ORDNANCE_COUNT = MUSEUM_HALL_COUNTS.ordnance;
export const MUSEUM_FIREARM_COUNT =
  MUSEUM_EXHIBIT_COUNT -
  MUSEUM_ARCHERY_COUNT -
  MUSEUM_HEAVY_ARMOR_COUNT -
  MUSEUM_ORDNANCE_COUNT;

export const MUSEUM_SMALL_ARMS_CALIBER_COUNT = new Set(
  WEAPON_MANIFESTS.filter(
    (manifest) =>
      manifest.catalog.category !== 'archery' &&
      manifest.catalog.category !== 'armor' &&
      manifest.catalog.category !== 'ordnance'
  ).map((manifest) => manifest.caliberProfile)
).size;

export const MUSEUM_HEAVY_ORDNANCE_CALIBER_COUNT = new Set(
  WEAPON_MANIFESTS.filter(
    (manifest) =>
      manifest.catalog.category === 'armor' ||
      manifest.catalog.category === 'ordnance'
  ).map((manifest) => manifest.caliberProfile)
).size;

export const MUSEUM_CARTRIDGE_LAB_TOTAL_COUNT =
  MUSEUM_SMALL_ARMS_CALIBER_COUNT + MUSEUM_HEAVY_ORDNANCE_CALIBER_COUNT;

export const MUSEUM_BALLISTICS_PROFILE_COUNT = new Set(
  WEAPON_MANIFESTS.map((manifest) => manifest.caliberProfile)
).size;

/**
 * Lightweight metadata constants verified against lazy-loaded domain specs
 * (`PENETRATOR_IDS`, `HISTORY_TIMELINE_NODES`, `TIMELINE_LINEAGES`,
 * `HISTORY_TIMELINE_TOURS`) in `tests/acousticAndUxHardening.test.ts` so
 * first-paint bundles never eagerly pull lazy modal data modules.
 */
export const MUSEUM_PENETRATOR_COUNT = 5;

export const MUSEUM_PBR_SUITE_COUNT = 101;
export const MUSEUM_PBR_WEBP_COUNT = 414;

export const MUSEUM_TIMELINE_MIN_YEAR = 1894;
export const MUSEUM_TIMELINE_MAX_YEAR = 2026;
export const MUSEUM_TIMELINE_SPAN_LABEL =
  `${MUSEUM_TIMELINE_MIN_YEAR}–${MUSEUM_TIMELINE_MAX_YEAR}` as const;
export const MUSEUM_TIMELINE_SPAN_ASCII =
  `${MUSEUM_TIMELINE_MIN_YEAR}-${MUSEUM_TIMELINE_MAX_YEAR}` as const;
export const MUSEUM_TIMELINE_LINEAGE_COUNT = 6;
export const MUSEUM_TIMELINE_TOUR_COUNT = 4;
export const MUSEUM_TIMELINE_NODE_COUNT = MUSEUM_EXHIBIT_COUNT;

export const MUSEUM_METRICS = {
  version: MUSEUM_VERSION,
  releaseVersion: MUSEUM_RELEASE_VERSION,
  exhibitCount: MUSEUM_EXHIBIT_COUNT,
  totalParts: MUSEUM_TOTAL_PARTS,
  hallCount: MUSEUM_HALL_COUNT,
  hallCounts: MUSEUM_HALL_COUNTS,
  firearmCount: MUSEUM_FIREARM_COUNT,
  archeryCount: MUSEUM_ARCHERY_COUNT,
  heavyArmorCount: MUSEUM_HEAVY_ARMOR_COUNT,
  ordnanceCount: MUSEUM_ORDNANCE_COUNT,
  smallArmsCaliberCount: MUSEUM_SMALL_ARMS_CALIBER_COUNT,
  heavyOrdnanceCaliberCount: MUSEUM_HEAVY_ORDNANCE_CALIBER_COUNT,
  cartridgeLabTotalCount: MUSEUM_CARTRIDGE_LAB_TOTAL_COUNT,
  ballisticsProfileCount: MUSEUM_BALLISTICS_PROFILE_COUNT,
  penetratorCount: MUSEUM_PENETRATOR_COUNT,
  pbrSuiteCount: MUSEUM_PBR_SUITE_COUNT,
  pbrWebpCount: MUSEUM_PBR_WEBP_COUNT,
  timelineMinYear: MUSEUM_TIMELINE_MIN_YEAR,
  timelineMaxYear: MUSEUM_TIMELINE_MAX_YEAR,
  timelineSpanLabel: MUSEUM_TIMELINE_SPAN_LABEL,
  timelineSpanAscii: MUSEUM_TIMELINE_SPAN_ASCII,
  timelineLineageCount: MUSEUM_TIMELINE_LINEAGE_COUNT,
  timelineTourCount: MUSEUM_TIMELINE_TOUR_COUNT,
  timelineNodeCount: MUSEUM_TIMELINE_NODE_COUNT,
} as const;

export interface ArmorLabLaunchPreset {
  projectileId: PenetratorId;
  targetTankId: ArmorTargetTankId;
}

/**
 * Resolves the contextual Armor Penetration Lab penetrator and target tank
 * when launching directly from an exhibit's Workbench or Armory plaque.
 */
export function resolveArmorLabPresetForWeapon(
  weaponId: WeaponId
): ArmorLabLaunchPreset {
  switch (weaponId) {
    case 'gau8':
      return { projectileId: '30x173_gau8', targetTankId: 'ztz99a' };
    case 'ztz99a':
      return { projectileId: '125mm_apfsds', targetTankId: 'ztz99a' };
    case 'm1a2':
      return { projectileId: '120mm_apfsds', targetTankId: 'm1a2' };
    case 'leopard2a7':
      return { projectileId: '120mm_apfsds', targetTankId: 'leopard2a7' };
    case 'tiger1':
      return { projectileId: '88mm_pzgr39', targetTankId: 'tiger1' };
    case 'm82a1':
      return { projectileId: '50_bmg', targetTankId: 'ztz99a' };
    default:
      return { projectileId: '125mm_apfsds', targetTankId: 'ztz99a' };
  }
}
