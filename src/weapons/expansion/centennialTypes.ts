import type {
  ArmoryWeaponItem,
  CaliberProfile,
  WeaponScaleProfile,
} from '../types';

// ============================================================================
// Digital Armory 3D — Centennial 100-Exhibit Pure Leaf Blueprint Contract
// ----------------------------------------------------------------------------
// Pure leaf types & ID tuples (ZERO runtime imports) enabling 34 -> 100
// zero-drift projection across all 28+ museum registries, factories, and
// bilingual narrations with 0 circular Rollup chunk warnings.
// ============================================================================

/** The original 34 Blender 5.2 flagship exhibits (`BAY-01..BAY-34`). */
export const FLAGSHIP_34_IDS = [
  'ak15',
  'm4a1',
  'mp5',
  'g17',
  'm82a1',
  'awm',
  'scar',
  'deagle',
  'aug',
  'p320',
  'p90',
  'lift33',
  'r500',
  'python',
  'benellim4',
  'garand',
  'm249',
  'p08',
  'vector',
  'g11',
  'vss',
  'm134',
  'an94',
  'ztz99a',
  'm1a2',
  'leopard2a7',
  'tiger1',
  'winchester1894',
  'rem870',
  'm1911',
  'mg42',
  'k98k',
  'thompson',
  'gau8',
] as const;

export type FlagshipWeaponId = (typeof FLAGSHIP_34_IDS)[number];

/** The 66 Centennial Expansion exhibits (`BAY-35..BAY-100`) in canonical order. */
export const CENTENNIAL_66_IDS = [
  // Assault +15 (BAY-35..49)
  'ak47',
  'ak74m',
  'm16a1',
  'hk416',
  'fnfal',
  'g3a3',
  'm14',
  'famas',
  'stg44',
  'sks',
  'qbz95',
  'tavor',
  'sig550',
  'g36c',
  'xm7',
  // LMG +7 (BAY-50..56)
  'pkm',
  'm240b',
  'm60e4',
  'm2hb',
  'rpk74',
  'bar1918',
  'dp28',
  // SMG +9 (BAY-57..65)
  'uzi',
  'mp40',
  'ppsh41',
  'mp7',
  'ump45',
  'mac10',
  'sten',
  'scorpion',
  'bizon',
  // Sniper +9 (BAY-66..74)
  'svd',
  'mosin',
  'leeenfield',
  'm24',
  'm200',
  'wa2000',
  'mk14ebr',
  'sr25',
  'springfield1903',
  // Shotgun +6 (BAY-75..80)
  'mossberg500',
  'spas12',
  'aa12',
  'saiga12',
  'winchester1887',
  'ks23',
  // Pistol +10 (BAY-81..90)
  'beretta92',
  'p226',
  'usp45',
  'cz75',
  'ppk',
  'c96',
  'tt33',
  'fiveseven',
  'saa1873',
  'sw500',
  // Archery +3 (BAY-91..93)
  'hoytrx8',
  'excalibur',
  'englishlongbow',
  // Armor 1:1 MBTs +4 (BAY-94..97)
  't90m',
  'challenger2',
  'merkava4',
  't34_85',
  // Ordnance +3 (BAY-98..100)
  'm61vulcan',
  'bofors40',
  'm777',
] as const;

export type CentennialWeaponId = (typeof CENTENNIAL_66_IDS)[number];

/** Complete 100-exhibit museum tuple (`FLAGSHIP_34_IDS` + `CENTENNIAL_66_IDS`). */
export const ALL_100_WEAPON_IDS = [
  ...FLAGSHIP_34_IDS,
  ...CENTENNIAL_66_IDS,
] as const;

export type CentennialAllWeaponId = (typeof ALL_100_WEAPON_IDS)[number];

const FLAGSHIP_34_SET: ReadonlySet<string> = new Set(FLAGSHIP_34_IDS);
const CENTENNIAL_66_SET: ReadonlySet<string> = new Set(CENTENNIAL_66_IDS);

export function isFlagshipWeaponId(
  id: string | null | undefined
): id is FlagshipWeaponId {
  return !!id && FLAGSHIP_34_SET.has(id);
}

export function isCentennialWeaponId(
  id: string | null | undefined
): id is CentennialWeaponId {
  return !!id && CENTENNIAL_66_SET.has(id);
}

export type CentennialCategory = ArmoryWeaponItem['category'];

export type CentennialArchetype =
  | 'ak_rifle'
  | 'ar_rifle'
  | 'battle_rifle'
  | 'bullpup_rifle'
  | 'lmg_belt'
  | 'lmg_pan'
  | 'heavy_mg'
  | 'smg_tube'
  | 'smg_drum'
  | 'smg_pdw'
  | 'sniper_bolt'
  | 'sniper_bullpup'
  | 'sniper_dmr'
  | 'shotgun_pump'
  | 'shotgun_auto'
  | 'shotgun_lever'
  | 'pistol_slide'
  | 'pistol_broomhandle'
  | 'revolver_sa'
  | 'revolver_da'
  | 'bow_compound'
  | 'crossbow_recurve'
  | 'bow_longbow'
  | 'mbt_modern'
  | 'mbt_wwii'
  | 'rotary_cannon'
  | 'aa_autocannon'
  | 'howitzer';

export type CentennialKinematicLaw =
  | 'long_stroke_piston'
  | 'direct_impingement'
  | 'short_stroke_piston'
  | 'roller_delayed'
  | 'lever_delayed'
  | 'tilting_bolt'
  | 'open_bolt_blowback'
  | 'closed_bolt_blowback'
  | 'browning_tilt_barrel'
  | 'falling_block_pistol'
  | 'bolt_action'
  | 'pump_action'
  | 'lever_action'
  | 'revolver_cylinder'
  | 'compound_bow'
  | 'recurve_crossbow'
  | 'self_longbow'
  | 'tank_carousel'
  | 'tank_manual'
  | 'rotary_gatling'
  | 'aa_sliding_wedge'
  | 'artillery_howitzer';

export type CentennialFinishPalette =
  | 'blued_steel'
  | 'parkerized'
  | 'stainless'
  | 'fde'
  | 'od_green'
  | 'bakelite_ak'
  | 'walnut_classic'
  | 'tactical_black'
  | 'desert_carc'
  | 'nato_camo'
  | 'russian_green'
  | 'wwii_soviet'
  | 'titanium_matte'
  | 'yew_wood'
  | 'carbon_camo';

export type CentennialMechanismFilter =
  | 'gas_piston'
  | 'direct_impingement'
  | 'blowback_delayed'
  | 'short_recoil'
  | 'manual_action'
  | 'rotary_heavy'
  | 'compound_archery'
  | 'heavy_armor';

export type CanonicalArmoryMechanismBucket =
  | 'rotating_bolt'
  | 'short_recoil'
  | 'roller_delay'
  | 'manual_action'
  | 'rotary_cannon'
  | 'smoothbore_armor'
  | 'compound_archery';

/** Maps Centennial semantic mechanism buckets into the existing 7 Armory sort/filter buckets. */
export function mapCentennialMechanismFilterToArmoryBucket(
  filter: CentennialMechanismFilter
): CanonicalArmoryMechanismBucket {
  switch (filter) {
    case 'gas_piston':
    case 'direct_impingement':
      return 'rotating_bolt';
    case 'blowback_delayed':
      return 'roller_delay';
    case 'short_recoil':
      return 'short_recoil';
    case 'manual_action':
      return 'manual_action';
    case 'rotary_heavy':
      return 'rotary_cannon';
    case 'compound_archery':
      return 'compound_archery';
    case 'heavy_armor':
      return 'smoothbore_armor';
  }
}

export type CentennialTimelineLineage =
  | 'toggle_short_recoil'
  | 'gas_rotating_bolt'
  | 'roller_blowback_delayed'
  | 'manual_revolver_lever'
  | 'compound_archery'
  | 'heavy_armor_mbt';

/** Canonical 28 term IDs from `src/engine/encyclopedia/engineeringGlossary.ts`. */
export const CENTENNIAL_GLOSSARY_TERM_IDS = [
  'rotating_bolt',
  'browning_tilting_link',
  'short_recoil_operation',
  'roller_delayed_blowback',
  'roller_locked_short_recoil',
  'blish_bronze_wedge',
  'long_stroke_piston',
  'direct_impingement',
  'short_stroke_piston',
  'controlled_round_feed',
  'toggle_knee_lock',
  'super_v_off_axis',
  'caseless_rotary_breech',
  'pulley_hyperburst',
  'integral_ported_suppressor',
  'electric_gatling_cam',
  'hydraulic_rotary_cannon',
  'open_bolt_operation',
  'en_bloc_clip',
  'argo_dual_piston',
  'lever_dropping_block',
  'twin_bar_pump_and_revolver',
  'compound_let_off_cam',
  'helical_crossbow_cam',
  'apfsds_sabot_dart',
  'polygonal_vs_cut_rifling',
  'carousel_autoloader',
  'sliding_wedge_breech',
] as const;

export type CentennialGlossaryTermId =
  (typeof CENTENNIAL_GLOSSARY_TERM_IDS)[number];

export type CentennialRiflingProfile =
  | 'conventional'
  | 'polygonal'
  | 'smoothbore'
  | 'archery_rail';

export interface CentennialRiflingSpec {
  readonly profile: CentennialRiflingProfile;
  readonly grooveCount: number;
  readonly twistMm: number;
  readonly twistDirection: 'RH' | 'LH' | 'NONE';
  readonly boreDiameterMm: number;
  readonly noteZh: string;
  readonly noteEn: string;
}

export type CentennialMagStyle =
  | 'curved'
  | 'straight'
  | 'drum'
  | 'pan'
  | 'belt'
  | 'tube'
  | 'box_internal'
  | 'cylinder'
  | 'quiver'
  | 'carousel'
  | 'bustle'
  | 'top_clip'
  | 'breech_single'
  | 'pistol_grip';

export type CentennialMuzzleStyle =
  | 'flash_hider'
  | 'brake'
  | 'bare'
  | 'suppressor'
  | 'shroud'
  | 'rotary_clamp'
  | 'tank_evacuator'
  | 'artillery_brake';

export interface CentennialCadSpec {
  readonly barrelLenCm: number;
  readonly receiverLenCm: number;
  readonly receiverHeightCm: number;
  readonly stockLenCm: number;
  readonly handguardLenCm: number;
  readonly magStyle: CentennialMagStyle;
  readonly hasOptic: boolean;
  readonly hasCarryHandle: boolean;
  readonly hasBipod: boolean;
  readonly hasWoodFurniture: boolean;
  readonly muzzleStyle: CentennialMuzzleStyle;
}

/**
 * Single Source of Truth (SSOT) engineering blueprint for each of the 66 Centennial exhibits.
 * Every downstream registry, parametric CAD factory, kinematic plugin, silhouette SVG,
 * ballistic profile, and bilingual curation sheet projects deterministically from this record.
 */
export interface CentennialWeaponBlueprint {
  // --- Identity & Curation ---
  readonly id: CentennialWeaponId;
  readonly orderIndex: number;
  readonly bayCode: `BAY-${number}`;
  readonly shortLabel: string;
  readonly modelCode: string;
  readonly year: number;
  readonly originCountryZh: string;
  readonly originCountryEn: string;
  readonly manufacturerZh: string;
  readonly manufacturerEn: string;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly subtitleEn: string;
  readonly weaponTypeZh: string;
  readonly weaponTypeEn: string;
  readonly category: CentennialCategory;
  readonly categoryZh: string;

  // --- Ballistics, Kinematics & 1:1 Metrology ---
  readonly caliberLabel: string;
  readonly caliberProfile: CaliberProfile;
  readonly actionMechanismZh: string;
  readonly actionMechanismEn: string;
  readonly mechanismFilter: CentennialMechanismFilter;
  readonly kinematicLaw: CentennialKinematicLaw;
  readonly timelineLineage: CentennialTimelineLineage;
  readonly scaleProfile: WeaponScaleProfile;
  readonly overallLengthMm: number;
  readonly overallLengthDisplayZh: string;
  readonly overallLengthDisplayEn: string;
  readonly barrelLengthMm: number;
  readonly barrelSpecZh: string;
  readonly barrelSpecEn: string;
  readonly emptyWeightKg: number;
  readonly muzzleVelocityMs: number;
  readonly effectiveRangeM: number;
  readonly rateOfFireRpm: number;
  readonly rateOfFireLabelZh: string;
  readonly rateOfFireLabelEn: string;
  readonly peakPressureMpa: number;
  readonly magCapacity: number;
  readonly boreAxisMm: number;
  readonly recoilImpulseNs: number;
  readonly muzzleEnergyJ: number;

  // --- Bore & Rifling ---
  readonly rifling: CentennialRiflingSpec;

  // --- Parametric CAD Visual Proportions & Finish ---
  readonly archetype: CentennialArchetype;
  readonly finishPalette: CentennialFinishPalette;
  readonly cad: CentennialCadSpec;

  // --- Bilingual Curatorial Narrative (strictly 0 EN CJK, 0 WP-XX) ---
  readonly descriptionZh: string;
  readonly descriptionEn: string;
  readonly highlightsZh: readonly [string, string, string, string];
  readonly highlightsEn: readonly [string, string, string, string];
  readonly historicalFactZh: string;
  readonly historicalFactEn: string;
  readonly glossaryTermIds: readonly [
    CentennialGlossaryTermId,
    CentennialGlossaryTermId,
    ...CentennialGlossaryTermId[],
  ];
}
