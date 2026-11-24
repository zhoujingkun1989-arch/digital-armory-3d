import { ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS } from './catalog/archeryArmorOrdnance';
import { RIFLES_AND_LMGS_BLUEPRINTS } from './catalog/riflesAndLmgs';
import { SHOTGUNS_AND_PISTOLS_BLUEPRINTS } from './catalog/shotgunsAndPistols';
import { SMGS_AND_SNIPERS_BLUEPRINTS } from './catalog/smgsAndSnipers';
import type {
  CentennialWeaponBlueprint,
  CentennialWeaponId,
} from './centennialTypes';

// ============================================================================
// Digital Armory 3D — Unified 66-Exhibit Centennial Expansion Catalog
// ----------------------------------------------------------------------------
// Pure leaf aggregator in canonical `BAY-35 .. BAY-100` order matching
// `CENTENNIAL_66_IDS` 1:1. Zero runtime imports from store, stage, or three.
// ============================================================================

/** All 66 Centennial Expansion exhibit blueprints (`BAY-35 .. BAY-100`). */
export const CENTENNIAL_BLUEPRINTS: readonly CentennialWeaponBlueprint[] = [
  ...RIFLES_AND_LMGS_BLUEPRINTS,
  ...SMGS_AND_SNIPERS_BLUEPRINTS,
  ...SHOTGUNS_AND_PISTOLS_BLUEPRINTS,
  ...ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS,
];

/** O(1) lookup table keyed by `CentennialWeaponId`. */
export const CENTENNIAL_BLUEPRINT_MAP: Readonly<
  Record<CentennialWeaponId, CentennialWeaponBlueprint>
> = Object.fromEntries(
  CENTENNIAL_BLUEPRINTS.map((bp) => [bp.id, bp])
) as Record<CentennialWeaponId, CentennialWeaponBlueprint>;

/** Safely resolves a Centennial exhibit blueprint by weapon ID, or `undefined` if flagship/unknown. */
export function getCentennialBlueprint(
  id: string
): CentennialWeaponBlueprint | undefined {
  return (
    CENTENNIAL_BLUEPRINT_MAP as Readonly<
      Record<string, CentennialWeaponBlueprint | undefined>
    >
  )[id];
}
