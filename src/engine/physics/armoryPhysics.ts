import type { CaliberProfile, WeaponId } from '../../weapons/types';

// ============================================================================
// Digital Armory — Quantitative Internal Ballistics & 60Hz Micro-Physics Engine
//
// Pure, DOM-free, Three.js-free module (unit-testable in Node) providing:
//   1. SAAMI / CIP / NATO EPVAT calibrated chamber pressure P(t), projectile
//      bore velocity V(t), bore travel x(t), gas-port pressure & safe-unlock
//      window across the 7 firing phases (`fireProgress` in [0..1]).
//   2. Spring-damper whole-weapon recoil (kick, rise, muzzle-climb torque),
//      220 Hz barrel whip harmonic, bolt-carrier battery bounce ripple.
//   3. Barrel thermal (Newton convective cooling) & carbon-fouling integrator.
//   4. Zero-GC 16-slot rigid-body spent-brass pool with gravity, 3D spin,
//      floor restitution / Coulomb friction / spin transfer + impact callback.
//   5. Zero-GC 24-slot buoyant smoke-wisp pool (muzzle, open chamber, gas vent).
//
// Units: 1 world unit = 1 cm. Gravity = -981 cm/s². +X muzzle, +Y up, +Z right.
// Every hot-path function mutates pre-allocated structs — no per-frame heap
// allocations (no arrays, closures or object literals inside step loops).
// ============================================================================

export const AMBIENT_TEMP_C = 22;
export const MAX_BARREL_TEMP_C = 580;
/** Newton convective cooling coefficient h/(m·c) for a rifle barrel in still air (1/s). */
export const BARREL_COOLING_RATE = 0.045;
export const GRAVITY_CM_S2 = -981;
export const SPENT_CASING_POOL_SIZE = 16;
export const SMOKE_WISP_POOL_SIZE = 24;
export const BRASS_RESTITUTION = 0.38;
export const BRASS_FLOOR_FRICTION = 0.72;
export const BRASS_AUDIBLE_IMPACT_CMS = 18;
export const BRASS_MAX_AUDIBLE_BOUNCES = 3;
export const BARREL_WHIP_HZ = 220;
export const BOLT_BOUNCE_AMPLITUDE_CM = 0.12;
export const BOLT_BOUNCE_HZ = 38;

/** Ordered firearm caliber list used by SAAMI/CIP UI, tests and data tables. */
export const BALLISTIC_CALIBERS: readonly CaliberProfile[] = [
  '9mm_para',
  '45_acp',
  '473_caseless',
  '57_28',
  '357_magnum',
  '50_ae',
  '9x39_subsonic',
  '12_gauge',
  '762_m43',
  '545_m74',
  '556_nato',
  '30_30_win',
  '762_nato',
  '792_mauser',
  '30_06',
  '338_lapua',
  '50_bmg',
];

/** Ordered heavy ordnance & tank main-gun profiles (1:1 Heavy Armor & Ordnance Halls). */
export const TANK_CANNON_CALIBERS: readonly CaliberProfile[] = [
  '30x173_gau8',
  '88mm_pzgr39',
  '120mm_apfsds',
  '125mm_apfsds',
];

/** Ordered archery projectile profiles (compound bow & helical-cam crossbow). */
export const ARCHERY_PROFILES: readonly CaliberProfile[] = [
  'arrow_400gr',
  'bolt_400gr',
];

/** True for compound bow / crossbow arrow & bolt profiles. */
export function isArcheryCaliber(
  caliber: CaliberInput | string | null | undefined
): boolean {
  return caliber === 'arrow_400gr' || caliber === 'bolt_400gr';
}

/** True for archery platforms (`lift33` compound bow & `r500` compound crossbow). */
export function isArcheryWeapon(
  weaponId: WeaponId | string | null | undefined
): boolean {
  return weaponId === 'lift33' || weaponId === 'r500';
}

/** True for 1:1 Main Battle Tank main-cannon ordnance calibers. */
export function isTankCaliber(
  caliber: CaliberInput | string | null | undefined
): boolean {
  return (
    caliber === '125mm_apfsds' ||
    caliber === '120mm_apfsds' ||
    caliber === '88mm_pzgr39'
  );
}

/** True for 1:1 Heavy Armor Main Battle Tank exhibits (`BAY-24 ~ BAY-27`). */
export function isTankWeapon(
  weaponId: WeaponId | string | null | undefined
): boolean {
  return (
    weaponId === 'ztz99a' ||
    weaponId === 'm1a2' ||
    weaponId === 'leopard2a7' ||
    weaponId === 'tiger1'
  );
}

/** Accepts canonical `CaliberProfile` keys as well as shorthand `'9x19'` / `'57x28'` aliases. */
export type CaliberInput = CaliberProfile | '9x19' | '57x28';

export function normalizeCaliberProfile(caliber: CaliberInput): CaliberProfile {
  if (caliber === '9x19') return '9mm_para';
  if (caliber === '57x28') return '57_28';
  return caliber in CALIBER_BALLISTICS ? caliber : '9mm_para';
}

// ----------------------------------------------------------------------------
// 1. Caliber engineering data
// ----------------------------------------------------------------------------

export interface ArcheryBallisticsMeta {
  /** Peak draw weight in pounds-force (e.g. 70 lbf / 300 lbf) */
  peakDrawForceLb: number;
  /** Peak draw / power-stroke thrust force in Newtons (311 N / 1334 N) */
  peakDrawForceN: number;
  /** Binary/helical cam let-off percentage at full draw */
  letOffPercent: number;
  /** Holding force in the full-draw valley in Newtons */
  holdingForceN: number;
  /** Holding weight in pounds-force */
  holdingForceLb: number;
  /** Brace height in mm */
  braceHeightMm: number;
  /** Power stroke travel in mm */
  powerStrokeMm: number;
  /** Axle-to-axle span in mm */
  axleToAxleMm: number;
  /** Projectile total mass in grains */
  grainWeight: number;
  /** ATA/IBO velocity rating in FPS */
  velocityFps: number;
}

export interface CaliberBallisticsSpec {
  caliber: CaliberProfile;
  labelEn: string;
  labelZh: string;
  /** Pressure / thrust standard the peak load is quoted against */
  standard: 'SAAMI' | 'CIP' | 'NATO EPVAT' | 'ATA / IBO' | 'PLA GJB';
  /** Maximum average (peak) chamber pressure (MPa) — or peak thrust force (N) for archery */
  peakPressureMPa: number;
  /** Service-load muzzle velocity (m/s) */
  muzzleVelocityMps: number;
  /** Projectile mass (g) */
  projectileMassG: number;
  /** Muzzle kinetic energy E = ½·m·V₀² (J), derived */
  muzzleEnergyJ: number;
  /** Residual chamber pressure below which bolt unlock/extraction is safe (MPa) */
  safeUnlockPressureMPa: number;
  /** Projectile in-bore transit time from shot-start to muzzle exit (ms) */
  boreTimeMs: number;
  /** Reference barrel / power-stroke length the velocity/time figures correspond to (mm) */
  referenceBarrelMm: number;
  /** Pressure-curve shape exponent (higher = sharper peak, lower muzzle pressure) */
  pressureShapeK: number;
  /** Normalized in-bore time u at which peak pressure occurs */
  peakU: number;
  /** Barrel temperature rise per shot (°C) */
  heatPerShotC: number;
  /** Carbon fouling accumulation per shot (0..1 scale) */
  foulingPerShot: number;
  /** Peak whole-weapon rearward recoil displacement (cm) */
  recoilKickCm: number;
  /** Peak upward bore-axis rise (cm) */
  recoilRiseCm: number;
  /** Peak muzzle-climb pitch around the grip pivot (rad) */
  muzzleClimbRad: number;
  /** Initial barrel-whip harmonic amplitude at the muzzle (cm) */
  barrelWhipCm: number;
  /** Ejector / case-deflector exit speed of the spent case (cm/s) */
  ejectSpeedCmS: number;
  /** Case half-length in BallisticsSystem lathe units (before roundScale) */
  caseHalfLenCm: number;
  /** Case max radius in lathe units (before roundScale) */
  caseRadiusCm: number;
  /** Empty brass case mass (g) */
  caseMassG: number;
  /** Number of visible supersonic Mach shock diamonds in the muzzle plume */
  shockDiamonds: number;
  /** Archery-specific physical telemetry (draw force, let-off, brace height, power stroke) */
  archerySpec?: ArcheryBallisticsMeta;
}

type CaliberSeed = Omit<CaliberBallisticsSpec, 'muzzleEnergyJ'>;

function defineCaliber(seed: CaliberSeed): CaliberBallisticsSpec {
  const massKg = seed.projectileMassG / 1000;
  return {
    ...seed,
    muzzleEnergyJ: 0.5 * massKg * seed.muzzleVelocityMps * seed.muzzleVelocityMps,
  };
}

export const CALIBER_BALLISTICS: Readonly<
  Record<CaliberProfile, CaliberBallisticsSpec>
> = {
  '9mm_para': defineCaliber({
    caliber: '9mm_para',
    labelEn: '9×19mm Parabellum 124gr FMJ',
    labelZh: '9×19mm 帕拉贝鲁姆 124格令 全被甲弹',
    standard: 'SAAMI',
    peakPressureMPa: 241,
    muzzleVelocityMps: 360,
    projectileMassG: 8.0,
    safeUnlockPressureMPa: 8,
    boreTimeMs: 0.42,
    referenceBarrelMm: 114,
    pressureShapeK: 2.4,
    peakU: 0.44,
    heatPerShotC: 8,
    foulingPerShot: 0.012,
    recoilKickCm: 0.55,
    recoilRiseCm: 0.12,
    muzzleClimbRad: 0.045,
    barrelWhipCm: 0.018,
    ejectSpeedCmS: 150,
    caseHalfLenCm: 0.78,
    caseRadiusCm: 0.406,
    caseMassG: 3.9,
    shockDiamonds: 2,
  }),
  '45_acp': defineCaliber({
    caliber: '45_acp',
    labelEn: '.45 ACP (11.43×23mm) 230gr FMJ-RN',
    labelZh: '.45 ACP (11.43×23mm) 230格令 全被甲圆头弹',
    standard: 'SAAMI',
    peakPressureMPa: 145,
    muzzleVelocityMps: 260,
    projectileMassG: 14.9,
    safeUnlockPressureMPa: 6,
    boreTimeMs: 0.68,
    referenceBarrelMm: 140,
    pressureShapeK: 2.2,
    peakU: 0.42,
    heatPerShotC: 7.5,
    foulingPerShot: 0.015,
    recoilKickCm: 0.62,
    recoilRiseCm: 0.08,
    muzzleClimbRad: 0.016,
    barrelWhipCm: 0.016,
    ejectSpeedCmS: 145,
    caseHalfLenCm: 0.92,
    caseRadiusCm: 0.488,
    caseMassG: 5.7,
    shockDiamonds: 1,
  }),
  '57_28': defineCaliber({
    caliber: '57_28',
    labelEn: '5.7×28mm FN SS190 AP',
    labelZh: '5.7×28mm FN SS190 穿甲弹',
    standard: 'CIP',
    peakPressureMPa: 345,
    muzzleVelocityMps: 716,
    projectileMassG: 2.0,
    safeUnlockPressureMPa: 7,
    boreTimeMs: 0.5,
    referenceBarrelMm: 263,
    pressureShapeK: 3.2,
    peakU: 0.44,
    heatPerShotC: 9,
    foulingPerShot: 0.009,
    recoilKickCm: 0.42,
    recoilRiseCm: 0.08,
    muzzleClimbRad: 0.014,
    barrelWhipCm: 0.015,
    ejectSpeedCmS: 140,
    caseHalfLenCm: 0.96,
    caseRadiusCm: 0.238,
    caseMassG: 1.6,
    shockDiamonds: 3,
  }),
  '556_nato': defineCaliber({
    caliber: '556_nato',
    labelEn: '5.56×45mm NATO M855 62gr',
    labelZh: '5.56×45mm 北约 M855 62格令',
    standard: 'NATO EPVAT',
    peakPressureMPa: 430,
    muzzleVelocityMps: 910,
    projectileMassG: 4.0,
    safeUnlockPressureMPa: 10,
    boreTimeMs: 0.82,
    referenceBarrelMm: 368,
    pressureShapeK: 4.0,
    peakU: 0.44,
    heatPerShotC: 14,
    foulingPerShot: 0.014,
    recoilKickCm: 0.7,
    recoilRiseCm: 0.14,
    muzzleClimbRad: 0.018,
    barrelWhipCm: 0.028,
    ejectSpeedCmS: 190,
    caseHalfLenCm: 1.22,
    caseRadiusCm: 0.262,
    caseMassG: 6.3,
    shockDiamonds: 4,
  }),
  '762_m43': defineCaliber({
    caliber: '762_m43',
    labelEn: '7.62×39mm M43 57-N-231 123gr',
    labelZh: '7.62×39mm M43 57-N-231 123格令',
    standard: 'CIP',
    peakPressureMPa: 355,
    muzzleVelocityMps: 715,
    projectileMassG: 7.9,
    safeUnlockPressureMPa: 10,
    boreTimeMs: 0.98,
    referenceBarrelMm: 415,
    pressureShapeK: 3.8,
    peakU: 0.44,
    heatPerShotC: 15,
    foulingPerShot: 0.018,
    recoilKickCm: 0.95,
    recoilRiseCm: 0.2,
    muzzleClimbRad: 0.026,
    barrelWhipCm: 0.034,
    ejectSpeedCmS: 200,
    caseHalfLenCm: 1.1,
    caseRadiusCm: 0.323,
    caseMassG: 6.6,
    shockDiamonds: 4,
  }),
  '50_ae': defineCaliber({
    caliber: '50_ae',
    labelEn: '.50 Action Express 300gr JHP',
    labelZh: '.50 AE 300格令 空尖弹',
    standard: 'SAAMI',
    peakPressureMPa: 248,
    muzzleVelocityMps: 470,
    projectileMassG: 19.4,
    safeUnlockPressureMPa: 8,
    boreTimeMs: 0.55,
    referenceBarrelMm: 152,
    pressureShapeK: 2.6,
    peakU: 0.44,
    heatPerShotC: 12,
    foulingPerShot: 0.02,
    recoilKickCm: 1.45,
    recoilRiseCm: 0.3,
    muzzleClimbRad: 0.09,
    barrelWhipCm: 0.03,
    ejectSpeedCmS: 170,
    caseHalfLenCm: 1.18,
    caseRadiusCm: 0.502,
    caseMassG: 8.8,
    shockDiamonds: 2,
  }),
  '338_lapua': defineCaliber({
    caliber: '338_lapua',
    labelEn: '.338 Lapua Magnum 250gr Scenar',
    labelZh: '.338 拉普阿马格南 250格令 Scenar',
    standard: 'CIP',
    peakPressureMPa: 420,
    muzzleVelocityMps: 905,
    projectileMassG: 16.2,
    safeUnlockPressureMPa: 12,
    boreTimeMs: 1.45,
    referenceBarrelMm: 686,
    pressureShapeK: 4.4,
    peakU: 0.44,
    heatPerShotC: 20,
    foulingPerShot: 0.016,
    recoilKickCm: 1.5,
    recoilRiseCm: 0.24,
    muzzleClimbRad: 0.022,
    barrelWhipCm: 0.045,
    ejectSpeedCmS: 120,
    caseHalfLenCm: 1.65,
    caseRadiusCm: 0.362,
    caseMassG: 16.5,
    shockDiamonds: 5,
  }),
  '50_bmg': defineCaliber({
    caliber: '50_bmg',
    labelEn: '.50 BMG M33 Ball 660gr',
    labelZh: '.50 BMG M33 普通弹 660格令',
    standard: 'SAAMI',
    peakPressureMPa: 379,
    muzzleVelocityMps: 853,
    projectileMassG: 42.8,
    safeUnlockPressureMPa: 14,
    boreTimeMs: 1.9,
    referenceBarrelMm: 737,
    pressureShapeK: 4.4,
    peakU: 0.44,
    heatPerShotC: 24,
    foulingPerShot: 0.022,
    recoilKickCm: 2.3,
    recoilRiseCm: 0.32,
    muzzleClimbRad: 0.03,
    barrelWhipCm: 0.06,
    ejectSpeedCmS: 210,
    caseHalfLenCm: 2.25,
    caseRadiusCm: 0.463,
    caseMassG: 56,
    shockDiamonds: 5,
  }),
  '357_magnum': defineCaliber({
    caliber: '357_magnum',
    labelEn: '.357 Magnum 158gr JSP',
    labelZh: '.357 马格南 158格令 半被甲软尖弹',
    standard: 'SAAMI',
    peakPressureMPa: 241,
    muzzleVelocityMps: 385,
    projectileMassG: 10.25,
    safeUnlockPressureMPa: 8,
    boreTimeMs: 0.54,
    referenceBarrelMm: 152.4,
    pressureShapeK: 2.5,
    peakU: 0.42,
    heatPerShotC: 10,
    foulingPerShot: 0.016,
    recoilKickCm: 0.92,
    recoilRiseCm: 0.22,
    muzzleClimbRad: 0.072,
    barrelWhipCm: 0.022,
    ejectSpeedCmS: 95,
    caseHalfLenCm: 1.02,
    caseRadiusCm: 0.38,
    caseMassG: 5.1,
    shockDiamonds: 2,
  }),
  '12_gauge': defineCaliber({
    caliber: '12_gauge',
    labelEn: '12 Gauge 2.75" 9-Pellet 00 Buckshot',
    labelZh: '12号 70mm 9粒 00号军用鹿弹',
    standard: 'SAAMI',
    peakPressureMPa: 79,
    muzzleVelocityMps: 404,
    projectileMassG: 30.2,
    safeUnlockPressureMPa: 4,
    boreTimeMs: 1.55,
    referenceBarrelMm: 470,
    pressureShapeK: 2.3,
    peakU: 0.36,
    heatPerShotC: 11,
    foulingPerShot: 0.024,
    recoilKickCm: 1.65,
    recoilRiseCm: 0.28,
    muzzleClimbRad: 0.038,
    barrelWhipCm: 0.032,
    ejectSpeedCmS: 165,
    caseHalfLenCm: 0.82,
    caseRadiusCm: 0.46,
    caseMassG: 8.4,
    shockDiamonds: 1,
  }),
  '30_30_win': defineCaliber({
    caliber: '30_30_win',
    labelEn: '.30-30 Winchester 170gr Flat-Nose',
    labelZh: '.30-30 温彻斯特 170格令 平头狩猎弹',
    standard: 'SAAMI',
    peakPressureMPa: 290,
    muzzleVelocityMps: 670,
    projectileMassG: 11.02,
    safeUnlockPressureMPa: 9,
    boreTimeMs: 1.32,
    referenceBarrelMm: 508,
    pressureShapeK: 3.4,
    peakU: 0.42,
    heatPerShotC: 14,
    foulingPerShot: 0.015,
    recoilKickCm: 0.98,
    recoilRiseCm: 0.18,
    muzzleClimbRad: 0.022,
    barrelWhipCm: 0.036,
    ejectSpeedCmS: 175,
    caseHalfLenCm: 1.32,
    caseRadiusCm: 0.34,
    caseMassG: 10.8,
    shockDiamonds: 3,
  }),
  '30_06': defineCaliber({
    caliber: '30_06',
    labelEn: '.30-06 Springfield 150gr M2 Ball',
    labelZh: '.30-06 春田 150格令 M2 普通弹',
    standard: 'SAAMI',
    peakPressureMPa: 345,
    muzzleVelocityMps: 853,
    projectileMassG: 9.73,
    safeUnlockPressureMPa: 11,
    boreTimeMs: 1.28,
    referenceBarrelMm: 610,
    pressureShapeK: 4.1,
    peakU: 0.44,
    heatPerShotC: 18,
    foulingPerShot: 0.017,
    recoilKickCm: 1.28,
    recoilRiseCm: 0.22,
    muzzleClimbRad: 0.025,
    barrelWhipCm: 0.042,
    ejectSpeedCmS: 195,
    caseHalfLenCm: 1.45,
    caseRadiusCm: 0.31,
    caseMassG: 12.6,
    shockDiamonds: 4,
  }),
  '473_caseless': defineCaliber({
    caliber: '473_caseless',
    labelEn: '4.73×33mm DM11 Caseless 50gr HITP',
    labelZh: '4.73×33mm DM11 50格令 无壳发射药块弹',
    standard: 'CIP',
    peakPressureMPa: 360,
    muzzleVelocityMps: 930,
    projectileMassG: 3.25,
    safeUnlockPressureMPa: 9,
    boreTimeMs: 0.94,
    referenceBarrelMm: 540,
    pressureShapeK: 3.8,
    peakU: 0.44,
    heatPerShotC: 16,
    foulingPerShot: 0.011,
    recoilKickCm: 0.54,
    recoilRiseCm: 0.1,
    muzzleClimbRad: 0.012,
    barrelWhipCm: 0.022,
    ejectSpeedCmS: 0, // 100% caseless — propellant block combusts completely with zero brass ejection
    caseHalfLenCm: 1.59,
    caseRadiusCm: 0.38,
    caseMassG: 0,
    shockDiamonds: 3,
  }),
  '9x39_subsonic': defineCaliber({
    caliber: '9x39_subsonic',
    labelEn: '9×39mm SP-6 Subsonic AP 250gr',
    labelZh: '9×39mm SP-6 250格令 亚音速钨芯穿甲弹',
    standard: 'CIP',
    peakPressureMPa: 280,
    muzzleVelocityMps: 290,
    projectileMassG: 16.2,
    safeUnlockPressureMPa: 8,
    boreTimeMs: 1.08,
    referenceBarrelMm: 200,
    pressureShapeK: 2.8,
    peakU: 0.42,
    heatPerShotC: 11,
    foulingPerShot: 0.022,
    recoilKickCm: 0.68,
    recoilRiseCm: 0.13,
    muzzleClimbRad: 0.016,
    barrelWhipCm: 0.018,
    ejectSpeedCmS: 165,
    caseHalfLenCm: 1.45,
    caseRadiusCm: 0.42,
    caseMassG: 7.4,
    shockDiamonds: 0,
  }),
  '762_nato': defineCaliber({
    caliber: '762_nato',
    labelEn: '7.62×51mm NATO M80 147gr FMJ',
    labelZh: '7.62×51mm 北约 M80 147格令 全被甲普通弹',
    standard: 'NATO EPVAT',
    peakPressureMPa: 415,
    muzzleVelocityMps: 853,
    projectileMassG: 9.5,
    safeUnlockPressureMPa: 12,
    boreTimeMs: 1.18,
    referenceBarrelMm: 559,
    pressureShapeK: 4.2,
    peakU: 0.44,
    heatPerShotC: 19,
    foulingPerShot: 0.018,
    recoilKickCm: 1.32,
    recoilRiseCm: 0.22,
    muzzleClimbRad: 0.024,
    barrelWhipCm: 0.036,
    ejectSpeedCmS: 225,
    caseHalfLenCm: 1.8,
    caseRadiusCm: 0.37,
    caseMassG: 11.4,
    shockDiamonds: 4,
  }),
  '545_m74': defineCaliber({
    caliber: '545_m74',
    labelEn: '5.45×39mm 7N6 53gr Steel-Core',
    labelZh: '5.45×39mm 7N6 53格令 空腔钢芯小口径弹',
    standard: 'CIP',
    peakPressureMPa: 294,
    muzzleVelocityMps: 900,
    projectileMassG: 3.43,
    safeUnlockPressureMPa: 9,
    boreTimeMs: 0.86,
    referenceBarrelMm: 405,
    pressureShapeK: 3.9,
    peakU: 0.44,
    heatPerShotC: 13,
    foulingPerShot: 0.014,
    recoilKickCm: 0.58,
    recoilRiseCm: 0.11,
    muzzleClimbRad: 0.014,
    barrelWhipCm: 0.024,
    ejectSpeedCmS: 195,
    caseHalfLenCm: 1.32,
    caseRadiusCm: 0.29,
    caseMassG: 5.4,
    shockDiamonds: 3,
  }),
  arrow_400gr: defineCaliber({
    caliber: 'arrow_400gr',
    labelEn: '400gr Carbon Arrow (70 lb · 348 FPS)',
    labelZh: '400格令 碳纤维猎箭 (70磅 · 348 FPS)',
    standard: 'ATA / IBO',
    peakPressureMPa: 311, // 70 lbf peak draw / power-stroke thrust mapped in Newtons (N)
    muzzleVelocityMps: 106.0,
    projectileMassG: 25.92,
    safeUnlockPressureMPa: 18,
    boreTimeMs: 10.4,
    referenceBarrelMm: 571.5,
    pressureShapeK: 2.2,
    peakU: 0.44,
    heatPerShotC: 0,
    foulingPerShot: 0,
    recoilKickCm: 0.08,
    recoilRiseCm: 0.02,
    muzzleClimbRad: 0.005,
    barrelWhipCm: 0,
    ejectSpeedCmS: 0,
    caseHalfLenCm: 34.0,
    caseRadiusCm: 0.33,
    caseMassG: 0,
    shockDiamonds: 0,
    archerySpec: {
      peakDrawForceLb: 70,
      peakDrawForceN: 311,
      letOffPercent: 85,
      holdingForceN: 47,
      holdingForceLb: 10.5,
      braceHeightMm: 165.1,
      powerStrokeMm: 571.5,
      axleToAxleMm: 838,
      grainWeight: 400,
      velocityFps: 348,
    },
  }),
  bolt_400gr: defineCaliber({
    caliber: 'bolt_400gr',
    labelEn: '400gr Crossbow Bolt (300 lb · 500 FPS)',
    labelZh: '400格令 碳素弩箭 (300磅 · 500 FPS)',
    standard: 'ATA / IBO',
    peakPressureMPa: 1334, // 300 lbf peak draw / power-stroke thrust mapped in Newtons (N)
    muzzleVelocityMps: 152.4,
    projectileMassG: 25.92,
    safeUnlockPressureMPa: 45,
    boreTimeMs: 4.8,
    referenceBarrelMm: 381,
    pressureShapeK: 2.4,
    peakU: 0.44,
    heatPerShotC: 0,
    foulingPerShot: 0,
    recoilKickCm: 0.14,
    recoilRiseCm: 0.03,
    muzzleClimbRad: 0.008,
    barrelWhipCm: 0,
    ejectSpeedCmS: 0,
    caseHalfLenCm: 24.0,
    caseRadiusCm: 0.36,
    caseMassG: 0,
    shockDiamonds: 0,
    archerySpec: {
      peakDrawForceLb: 300,
      peakDrawForceN: 1334,
      letOffPercent: 38,
      holdingForceN: 827,
      holdingForceLb: 186,
      braceHeightMm: 114.3,
      powerStrokeMm: 381,
      axleToAxleMm: 193,
      grainWeight: 400,
      velocityFps: 500,
    },
  }),
  '125mm_apfsds': defineCaliber({
    caliber: '125mm_apfsds',
    labelEn: '125mm ZPT-98 DTC10-125 Tungsten APFSDS',
    labelZh: '125mm DTC10-125 钨合金尾翼稳定脱壳穿甲弹',
    standard: 'PLA GJB',
    peakPressureMPa: 650,
    muzzleVelocityMps: 1780,
    projectileMassG: 4800,
    safeUnlockPressureMPa: 18,
    boreTimeMs: 5.8,
    referenceBarrelMm: 6250,
    pressureShapeK: 4.8,
    peakU: 0.36,
    heatPerShotC: 32,
    foulingPerShot: 0.032,
    recoilKickCm: 5.2,
    recoilRiseCm: 1.4,
    muzzleClimbRad: 0.012,
    barrelWhipCm: 0.42,
    ejectSpeedCmS: 260,
    caseHalfLenCm: 20.4,
    caseRadiusCm: 7.45,
    caseMassG: 3400,
    shockDiamonds: 7,
  }),
  '120mm_apfsds': defineCaliber({
    caliber: '120mm_apfsds',
    labelEn: '120×570mm NATO M829A4 / DM63A1 APFSDS-T',
    labelZh: '120×570mm 北约 M829A4 / DM63A1 尾翼脱壳穿甲弹',
    standard: 'NATO EPVAT',
    peakPressureMPa: 670,
    muzzleVelocityMps: 1710,
    projectileMassG: 4600,
    safeUnlockPressureMPa: 18,
    boreTimeMs: 5.6,
    referenceBarrelMm: 6600,
    pressureShapeK: 4.9,
    peakU: 0.35,
    heatPerShotC: 34,
    foulingPerShot: 0.03,
    recoilKickCm: 4.8,
    recoilRiseCm: 1.25,
    muzzleClimbRad: 0.011,
    barrelWhipCm: 0.38,
    ejectSpeedCmS: 240,
    caseHalfLenCm: 28.5,
    caseRadiusCm: 7.6,
    caseMassG: 3100,
    shockDiamonds: 7,
  }),
  '88mm_pzgr39': defineCaliber({
    caliber: '88mm_pzgr39',
    labelEn: '88×571mmR KwK 36 PzGr. 39 APCBC-HE',
    labelZh: '88×571mmR KwK 36 39式被帽穿甲弹 (PzGr. 39)',
    standard: 'CIP',
    peakPressureMPa: 320,
    muzzleVelocityMps: 773,
    projectileMassG: 10200,
    safeUnlockPressureMPa: 14,
    boreTimeMs: 9.2,
    referenceBarrelMm: 4930,
    pressureShapeK: 3.9,
    peakU: 0.4,
    heatPerShotC: 26,
    foulingPerShot: 0.036,
    recoilKickCm: 4.5,
    recoilRiseCm: 1.5,
    muzzleClimbRad: 0.014,
    barrelWhipCm: 0.35,
    ejectSpeedCmS: 210,
    caseHalfLenCm: 28.55,
    caseRadiusCm: 5.6,
    caseMassG: 4200,
    shockDiamonds: 5,
  }),
  '792_mauser': defineCaliber({
    caliber: '792_mauser',
    labelEn: '7.92×57mm Mauser 198gr s.S. Boat-Tail',
    labelZh: '7.92×57mm 毛瑟 198格令 s.S. 重尖船尾弹',
    standard: 'CIP',
    peakPressureMPa: 390,
    muzzleVelocityMps: 755,
    projectileMassG: 12.8,
    safeUnlockPressureMPa: 12,
    boreTimeMs: 1.18,
    referenceBarrelMm: 530,
    pressureShapeK: 4.2,
    peakU: 0.43,
    heatPerShotC: 22,
    foulingPerShot: 0.019,
    recoilKickCm: 1.38,
    recoilRiseCm: 0.25,
    muzzleClimbRad: 0.028,
    barrelWhipCm: 0.044,
    ejectSpeedCmS: 225,
    caseHalfLenCm: 1.42,
    caseRadiusCm: 0.3,
    caseMassG: 11.4,
    shockDiamonds: 4,
  }),
  '30x173_gau8': defineCaliber({
    caliber: '30x173_gau8',
    labelEn: '30×173mm GAU-8 PGU-14/B API (395g DU/Tungsten Core)',
    labelZh: '30×173mm GAU-8 PGU-14/B 贫铀/钨芯穿甲燃烧弹 (395g)',
    standard: 'NATO EPVAT',
    peakPressureMPa: 430,
    muzzleVelocityMps: 1010,
    projectileMassG: 395,
    safeUnlockPressureMPa: 12,
    boreTimeMs: 3.15,
    referenceBarrelMm: 2300,
    pressureShapeK: 4.2,
    peakU: 0.39,
    heatPerShotC: 19,
    foulingPerShot: 0.022,
    recoilKickCm: 3.6,
    recoilRiseCm: 0.55,
    muzzleClimbRad: 0.008,
    barrelWhipCm: 0.16,
    ejectSpeedCmS: 195,
    caseHalfLenCm: 8.65,
    caseRadiusCm: 2.13,
    caseMassG: 148,
    shockDiamonds: 6,
  }),
};

export function getCaliberBallisticsSpec(
  caliber: CaliberInput
): CaliberBallisticsSpec {
  return CALIBER_BALLISTICS[normalizeCaliberProfile(caliber)];
}

// ----------------------------------------------------------------------------
// 2. Per-weapon firing-cycle timing (aligned to each plugin's 7-phase kinematics)
// ----------------------------------------------------------------------------

export interface WeaponFiringTiming {
  /** Propellant ignition / shot-start (chamber flash onset) */
  ignitionF: number;
  /** Projectile base clears the muzzle crown */
  muzzleExitF: number;
  /** Spent case leaves the ejector and flies free */
  ejectF: number;
  /** Bolt / slide slams into battery */
  batteryF: number;
  /** Normalized bore travel of the gas port (null = no gas tap) */
  gasPortTravel: number | null;
  /** Ejection direction (unit vector, weapon space) */
  ejectDirX: number;
  ejectDirY: number;
  ejectDirZ: number;
}

function timing(
  ignitionF: number,
  muzzleExitF: number,
  ejectF: number,
  batteryF: number,
  gasPortTravel: number | null,
  dx: number,
  dy: number,
  dz: number
): WeaponFiringTiming {
  const len = Math.hypot(dx, dy, dz) || 1;
  return {
    ignitionF,
    muzzleExitF,
    ejectF,
    batteryF,
    gasPortTravel,
    ejectDirX: dx / len,
    ejectDirY: dy / len,
    ejectDirZ: dz / len,
  };
}

/** Generic timing per the WP-04 brief (ignition 0.14 → peak 0.21 → exit 0.30). */
export const DEFAULT_FIRING_TIMING: Readonly<WeaponFiringTiming> = timing(
  0.14,
  0.3,
  0.46,
  0.9,
  0.72,
  -0.25,
  0.6,
  0.76
);

export const WEAPON_FIRING_TIMING: Readonly<
  Record<WeaponId, WeaponFiringTiming>
> = {
  // Browning short-recoil tilting barrel pistols (no gas tap) — right/up ejection
  g17: timing(0.22, 0.3, 0.47, 0.855, null, -0.3, 0.6, 0.74),
  p320: timing(0.22, 0.3, 0.47, 0.855, null, -0.3, 0.6, 0.74),
  // Roller-delayed blowback (fluted chamber, no gas tap)
  mp5: timing(0.15, 0.205, 0.44, 0.86, null, -0.25, 0.45, 0.86),
  // Long-stroke piston — gas port at ~60% of the 415mm barrel
  ak15: timing(0.19, 0.295, 0.51, 0.845, 0.6, -0.2, 0.55, 0.81),
  // Stoner direct impingement (carbine-length port) — brass deflector throws forward-right
  m4a1: timing(0.19, 0.295, 0.475, 0.845, 0.72, 0.22, 0.45, 0.86),
  // Short-stroke piston
  scar: timing(0.19, 0.295, 0.48, 0.845, 0.65, -0.1, 0.5, 0.86),
  aug: timing(0.202, 0.298, 0.475, 0.845, 0.62, -0.2, 0.45, 0.87),
  // Manually operated bolt action — slow hand-cycled ejection
  awm: timing(0.252, 0.345, 0.695, 0.965, null, -0.25, 0.5, 0.83),
  // Short-recoil accelerator (no gas tap)
  m82a1: timing(0.138, 0.195, 0.39, 0.88, null, -0.28, 0.42, 0.86),
  // Gas-operated rotating bolt — port just ahead of the chamber
  deagle: timing(0.185, 0.295, 0.48, 0.845, 0.15, -0.3, 0.6, 0.74),
  // Straight blowback, downward ejection through the grip chute
  p90: timing(0.18, 0.275, 0.46, 0.845, null, -0.05, -1, 0.12),
  // Mathews LIFT 33 binary-cam compound bow (draw 0..0.32, release 0.32, arrow clear 0.50)
  lift33: timing(0.32, 0.5, 0.68, 0.86, null, 0, -0.5, 0.86),
  // Ravin R500 HexCoil helical-cam crossbow (cock/arm 0..0.32, release 0.32, bolt clear 0.48)
  r500: timing(0.32, 0.48, 0.66, 0.84, null, 0, -0.5, 0.86),
  // Colt Python 6" .357 Magnum DA/SA revolver (no gas tap; brass retained in cylinder)
  python: timing(0.2, 0.34, 0.5, 0.86, null, 0, 0.4, 0.92),
  // Benelli M4 (M1014) 12ga dual short-stroke ARGO pistons — chamber-forward ports at ~15% bore
  benellim4: timing(0.12, 0.29, 0.44, 0.9, 0.15, 0.18, 0.48, 0.86),
  // M1 Garand .30-06 long-stroke op-rod — under-muzzle gas port at ~92% bore, 1–2 o'clock ejection
  garand: timing(0.1, 0.21, 0.45, 0.88, 0.92, 0.46, 0.54, 0.7),
  // FN M249 SAW 5.56mm open-bolt long-stroke piston — underbarrel gas port ~62% bore, right-side ejection
  m249: timing(0.22, 0.31, 0.5, 0.79, 0.62, 0.18, 0.26, 0.95),
  // DWM Luger P08 9×19mm short-recoil articulated knee-toggle lock — high-angle upward + right ejection
  p08: timing(0.12, 0.19, 0.4, 0.85, null, -0.22, 0.84, 0.5),
  // KRISS Vector SMG .45 ACP Super V -65° off-axis delayed blowback — right-flank ejection
  vector: timing(0.11, 0.19, 0.44, 0.91, null, 0.16, 0.38, 0.91),
  // H&K G11 K2 4.73×33mm DM11 caseless rotary-breech clockwork — under-barrel gas tap at ~46% bore, zero brass ejection
  g11: timing(0.11, 0.2, 0.42, 0.9, 0.46, 0, -1, 0.05),
  // VSS Vintorez 9×39mm integral-suppressed subsonic — radial-ported barrel gas tap at ~28% total length, right ejection
  vss: timing(0.105, 0.22, 0.45, 0.91, 0.28, 0.24, 0.48, 0.84),
  // GE / Dillon Aero M134D Minigun 7.62×51mm NATO — externally 28V DC electric driven (no gas tap), lower-right chute ejection
  m134: timing(0.09, 0.19, 0.44, 0.88, null, -0.18, -0.58, 0.79),
  // Nikonov AN-94 "Abakan" 5.45×39mm floating pulley-cable hyperburst — gas tap at ~52% bore, right-upward ejection
  an94: timing(0.105, 0.195, 0.44, 0.88, 0.52, 0.22, 0.52, 0.82),
  // PLA ZTZ-99A 125mm ZPT-98 L/50 smoothbore + 22-rd carousel autoloader — rear turret stub-ejector window
  ztz99a: timing(0.11, 0.2, 0.44, 0.94, null, -0.82, 0.46, 0.34),
  // M1A2 SEP v3 Abrams 120mm L/44 M256 smoothbore — vertical sliding wedge drops steel stub base aft
  m1a2: timing(0.08, 0.19, 0.42, 0.91, null, -0.68, -0.58, 0.44),
  // KMW Leopard 2A7V 120mm Rh-120 L/55A1 smoothbore — vertical sliding wedge drops steel stub base aft
  leopard2a7: timing(0.08, 0.165, 0.42, 0.89, null, -0.72, -0.56, 0.4),
  // Pz.Kpfw. VI Tiger 131 88mm KwK 36 L/56 rifled — Krupp horizontal wedge extracts full brass case into canvas guard
  tiger1: timing(0.11, 0.23, 0.5, 0.94, null, -0.65, -0.62, 0.44),
  // Winchester Model 1894 .30-30 Win lever-action carbine — manual D-loop throw + top-upward ejection
  winchester1894: timing(0.12, 0.27, 0.5, 0.94, null, -0.18, 0.92, 0.34),
  // Remington 870 Police Magnum 12ga pump-action — manual corn-cob forend rack + twin action bars + right ejection
  rem870: timing(0.11, 0.27, 0.45, 0.955, null, 0.16, 0.44, 0.88),
  // Colt M1911A1 U.S. Army .45 ACP — Browning 0.278" swinging-link tilting barrel short recoil + right-up ejection
  m1911: timing(0.16, 0.29, 0.49, 0.87, null, -0.26, 0.62, 0.74),
  // MG 42 7.92×57mm — open-bolt muzzle-boosted short recoil + twin rollers + downward belly brass ejection
  mg42: timing(0.21, 0.3, 0.5, 0.84, 0.94, -0.1, -0.98, 0.14),
  // Mauser Karabiner 98k 7.92×57mm — manual 90° 3-lug bolt lift + non-rotating claw extraction
  k98k: timing(0.14, 0.26, 0.61, 0.96, null, -0.22, 0.54, 0.81),
  // Thompson M1928A1 .45 ACP — open-bolt 45° bronze Blish delayed blowback + Cutts comp + right ejection
  thompson: timing(0.23, 0.32, 0.52, 0.85, null, -0.18, 0.35, 0.92),
  // GE GAU-8/A Avenger 30×173mm — twin 38.5-HP hydraulic 7-barrel rotary + closed-loop aluminum case return
  gau8: timing(0.08, 0.19, 0.44, 0.88, null, -0.82, -0.32, 0.48),
};

export function getWeaponFiringTiming(
  weaponId: WeaponId | null | undefined
): Readonly<WeaponFiringTiming> {
  if (!weaponId) return DEFAULT_FIRING_TIMING;
  return WEAPON_FIRING_TIMING[weaponId] ?? DEFAULT_FIRING_TIMING;
}

// ----------------------------------------------------------------------------
// 3. Internal ballistics curve model
//
//   Pressure shape (normalized in-bore time u ∈ [0,1], peak at u = peakU):
//     g(u) = (u/peakU)^k · exp(k·(1 − u/peakU))          g(peakU) = 1
//   Velocity  V(u) = V₀ · ∫₀ᵘ g / ∫₀¹ g                  (Newton: m·dv = P·A·dt)
//   Travel    x(u) = ∫₀ᵘ V / ∫₀¹ V                         (bore-travel ratio)
//   Blowdown after muzzle exit: P = P_exit · exp(−(f − f_exit)/τ)
// ----------------------------------------------------------------------------

const CURVE_SAMPLES = 256;
/** Post-exit blowdown time constant in fireProgress units */
export const BLOWDOWN_TAU_F = 0.018;

interface CaliberCurveTable {
  /** Normalized cumulative impulse (velocity ratio) at each sample */
  vel01: Float32Array;
  /** Normalized cumulative travel at each sample */
  travel01: Float32Array;
  /** Pressure ratio P/Pmax at the muzzle exit (u = 1) */
  exitPressureRatio: number;
}

function pressureShape(u: number, peakU: number, k: number): number {
  if (u <= 0) return 0;
  const r = u / peakU;
  return Math.pow(r, k) * Math.exp(k * (1 - r));
}

function getArcheryLetOffRatio(spec: CaliberBallisticsSpec): number {
  return spec.archerySpec ? 1 - spec.archerySpec.letOffPercent / 100 : 0.15;
}

/**
 * Compound bow / crossbow power-stroke thrust curve: starts continuously from
 * the full-draw let-off valley (`letOffRatio`), surges to peak cam leverage at `peakU`,
 * and tapers smoothly to brace-height equilibrium (`u = 1`).
 */
function archeryPowerStrokeShape(
  u: number,
  peakU: number,
  letOffRatio: number
): number {
  if (u <= 0) return letOffRatio;
  if (u <= peakU) {
    const t = u / Math.max(1e-6, peakU);
    return letOffRatio + (1 - letOffRatio) * Math.sin(t * Math.PI * 0.5);
  }
  const t = (u - peakU) / Math.max(1e-6, 1 - peakU);
  return Math.cos(Math.min(1, t) * Math.PI * 0.44);
}

/**
 * Compound cam draw-force curve across `[0..ignitionF]`: limb preload ramp -> peak draw
 * plateau -> smooth roll-over into the holding let-off valley before release.
 */
function archeryDrawForceShape(
  f: number,
  ignitionF: number,
  letOffRatio: number
): number {
  if (f <= 0 || ignitionF <= 0) return 0;
  const drawEnd = ignitionF * 0.75;
  if (f >= drawEnd) return letOffRatio;
  const uDraw = f / drawEnd;
  if (uDraw <= 0.55) {
    return 0.98 * Math.sin((uDraw / 0.55) * Math.PI * 0.5);
  }
  const tDrop = (uDraw - 0.55) / 0.45;
  const s = tDrop * tDrop * (3 - 2 * tDrop);
  return 0.98 + (letOffRatio - 0.98) * s;
}

function buildCurveTable(spec: CaliberBallisticsSpec): CaliberCurveTable {
  const n = CURVE_SAMPLES;
  const vel = new Float32Array(n + 1);
  const trav = new Float32Array(n + 1);
  const du = 1 / n;
  const isArchery = isArcheryCaliber(spec.caliber);
  const letOffRatio = getArcheryLetOffRatio(spec);
  const shapeAt = (u: number) =>
    isArchery
      ? archeryPowerStrokeShape(u, spec.peakU, letOffRatio)
      : pressureShape(u, spec.peakU, spec.pressureShapeK);

  let cumP = 0;
  let cumV = 0;
  let prevG = shapeAt(0);
  let prevV = 0;
  for (let i = 1; i <= n; i++) {
    const g = shapeAt(i * du);
    cumP += 0.5 * (g + prevG) * du;
    prevG = g;
    vel[i] = cumP;
    cumV += 0.5 * (cumP + prevV) * du;
    prevV = cumP;
    trav[i] = cumV;
  }
  for (let i = 0; i <= n; i++) {
    vel[i] /= cumP;
    trav[i] /= cumV;
  }
  return {
    vel01: vel,
    travel01: trav,
    exitPressureRatio: shapeAt(1),
  };
}

const CURVE_TABLES = {} as Record<CaliberProfile, CaliberCurveTable>;
for (const cal of [
  ...BALLISTIC_CALIBERS,
  ...TANK_CANNON_CALIBERS,
  ...ARCHERY_PROFILES,
]) {
  CURVE_TABLES[cal] = buildCurveTable(CALIBER_BALLISTICS[cal]);
}

function sampleTable(table: Float32Array, u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return table[CURVE_SAMPLES];
  const x = u * CURVE_SAMPLES;
  const i = Math.floor(x);
  const t = x - i;
  return table[i] + (table[i + 1] - table[i]) * t;
}

/** Inverse of the travel table: returns normalized in-bore time u at which travel reaches `x01`. */
function invertTravel(table: Float32Array, x01: number): number {
  if (x01 <= 0) return 0;
  if (x01 >= 1) return 1;
  let lo = 0;
  let hi = CURVE_SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] < x01) lo = mid;
    else hi = mid;
  }
  const span = table[hi] - table[lo];
  const t = span > 1e-9 ? (x01 - table[lo]) / span : 0;
  return (lo + t) / CURVE_SAMPLES;
}

export type BallisticPhaseId =
  | 'cocked'
  | 'pressure_rise'
  | 'bore_travel'
  | 'blowdown'
  | 'extraction'
  | 'ejection_feed'
  | 'lockup';

export const BALLISTIC_PHASE_ORDER: readonly BallisticPhaseId[] = [
  'cocked',
  'pressure_rise',
  'bore_travel',
  'blowdown',
  'extraction',
  'ejection_feed',
  'lockup',
];

export interface InternalBallisticsSample {
  caliber: CaliberProfile;
  fireProgress: number;
  phase: BallisticPhaseId;
  /** Instantaneous chamber (breech) pressure (MPa) */
  pressureMPa: number;
  /** P / Pmax in [0..1] */
  pressure01: number;
  /** Projectile velocity (m/s) — in-bore, then held at V₀ after exit */
  velocityMps: number;
  /** Instantaneous projectile kinetic energy (J) */
  energyJ: number;
  /** Pressure at the gas port (0 until the projectile uncovers it) (MPa) */
  gasPortPressureMPa: number;
  /** Projectile base travel / barrel length in [0..1] */
  boreTravelRatio: number;
  /** true when chamber pressure exceeds the safe bolt-unlock residual */
  isOverSafeUnlockThreshold: boolean;
  /** fireProgress at which residual pressure drops below the safe unlock threshold */
  safeUnlockF: number;
  /** fireProgress of peak chamber pressure */
  peakF: number;
}

export function createInternalBallisticsSample(
  caliber: CaliberInput = '9mm_para'
): InternalBallisticsSample {
  return {
    caliber: normalizeCaliberProfile(caliber),
    fireProgress: 0,
    phase: 'cocked',
    pressureMPa: 0,
    pressure01: 0,
    velocityMps: 0,
    energyJ: 0,
    gasPortPressureMPa: 0,
    boreTravelRatio: 0,
    isOverSafeUnlockThreshold: false,
    safeUnlockF: 0,
    peakF: 0,
  };
}

/** fireProgress of peak chamber pressure for a caliber + weapon timing. */
export function computePeakPressureF(
  caliber: CaliberInput,
  t: Readonly<WeaponFiringTiming> = DEFAULT_FIRING_TIMING
): number {
  const spec = getCaliberBallisticsSpec(caliber);
  return t.ignitionF + spec.peakU * (t.muzzleExitF - t.ignitionF);
}

/**
 * fireProgress at which the post-exit blowdown residual pressure falls below
 * the caliber's safe bolt-unlock threshold (start of the Safe Unlock Window).
 */
export function computeSafeUnlockF(
  caliber: CaliberInput,
  t: Readonly<WeaponFiringTiming> = DEFAULT_FIRING_TIMING
): number {
  const spec = getCaliberBallisticsSpec(caliber);
  const pExit = CURVE_TABLES[spec.caliber].exitPressureRatio * spec.peakPressureMPa;
  if (pExit <= spec.safeUnlockPressureMPa) return t.muzzleExitF;
  return (
    t.muzzleExitF +
    BLOWDOWN_TAU_F * Math.log(pExit / spec.safeUnlockPressureMPa)
  );
}

/**
 * Zero-allocation internal-ballistics evaluator. Writes the instantaneous
 * chamber pressure, bore velocity, energy, gas-port pressure and bore travel
 * for `fireProgress` into `out` and returns it.
 */
export function evaluateInternalBallisticsInto(
  caliber: CaliberInput,
  fireProgress: number,
  out: InternalBallisticsSample,
  t: Readonly<WeaponFiringTiming> = DEFAULT_FIRING_TIMING
): InternalBallisticsSample {
  const spec = getCaliberBallisticsSpec(caliber);
  const table = CURVE_TABLES[spec.caliber];
  const f = fireProgress < 0 ? 0 : fireProgress > 1 ? 1 : fireProgress;
  const span = Math.max(1e-6, t.muzzleExitF - t.ignitionF);
  const peakF = t.ignitionF + spec.peakU * span;
  const safeUnlockF = computeSafeUnlockF(spec.caliber, t);
  const massKg = spec.projectileMassG / 1000;

  const isArchery = isArcheryCaliber(spec.caliber);
  const letOffRatio = getArcheryLetOffRatio(spec);

  let p01 = 0;
  let v01 = 0;
  let travel = 0;

  if (f < t.ignitionF) {
    if (isArchery) {
      p01 = archeryDrawForceShape(f, t.ignitionF, letOffRatio);
    }
  } else if (f <= t.muzzleExitF) {
    const u = (f - t.ignitionF) / span;
    p01 = isArchery
      ? archeryPowerStrokeShape(u, spec.peakU, letOffRatio)
      : pressureShape(u, spec.peakU, spec.pressureShapeK);
    v01 = sampleTable(table.vel01, u);
    travel = sampleTable(table.travel01, u);
  } else {
    p01 =
      table.exitPressureRatio * Math.exp(-(f - t.muzzleExitF) / BLOWDOWN_TAU_F);
    v01 = 1;
    travel = 1;
  }

  const pressureMPa = p01 * spec.peakPressureMPa;
  const velocityMps = v01 * spec.muzzleVelocityMps;

  let gasPortPressureMPa = 0;
  if (t.gasPortTravel !== null && travel >= t.gasPortTravel) {
    // Port pressure trails breech pressure (Lagrange gradient ≈ 0.82 at the port)
    gasPortPressureMPa = pressureMPa * 0.82;
  }

  let phase: BallisticPhaseId;
  if (f < t.ignitionF) phase = 'cocked';
  else if (f < peakF) phase = 'pressure_rise';
  else if (f < t.muzzleExitF) phase = 'bore_travel';
  else if (f < safeUnlockF) phase = 'blowdown';
  else if (f < t.ejectF) phase = 'extraction';
  else if (f < t.batteryF) phase = 'ejection_feed';
  else phase = 'lockup';

  out.caliber = spec.caliber;
  out.fireProgress = f;
  out.phase = phase;
  out.pressureMPa = pressureMPa;
  out.pressure01 = p01;
  out.velocityMps = velocityMps;
  out.energyJ = 0.5 * massKg * velocityMps * velocityMps;
  out.gasPortPressureMPa = gasPortPressureMPa;
  out.boreTravelRatio = travel;
  out.isOverSafeUnlockThreshold = pressureMPa > spec.safeUnlockPressureMPa;
  out.safeUnlockF = safeUnlockF;
  out.peakF = peakF;
  return out;
}

/** Pure (allocating) convenience wrapper — use the `Into` variant in render loops. */
export function evaluateInternalBallistics(
  caliber: CaliberInput,
  fireProgress: number,
  t: Readonly<WeaponFiringTiming> = DEFAULT_FIRING_TIMING
): InternalBallisticsSample {
  return evaluateInternalBallisticsInto(
    caliber,
    fireProgress,
    createInternalBallisticsSample(caliber),
    t
  );
}

/** fireProgress at which the projectile uncovers the gas port (null if no gas tap). */
export function computeGasPortUncoverF(
  caliber: CaliberInput,
  t: Readonly<WeaponFiringTiming> = DEFAULT_FIRING_TIMING
): number | null {
  if (t.gasPortTravel === null) return null;
  const spec = getCaliberBallisticsSpec(caliber);
  const u = invertTravel(CURVE_TABLES[spec.caliber].travel01, t.gasPortTravel);
  return t.ignitionF + u * (t.muzzleExitF - t.ignitionF);
}

// ----------------------------------------------------------------------------
// 4. Micro-physics state (recoil, harmonics, thermal) + pools
// ----------------------------------------------------------------------------

export interface ArmoryPhysicsState {
  weaponId: WeaponId | null;
  caliber: CaliberProfile;
  /** Accumulated (time-scaled) simulation time (s) */
  simTimeSec: number;
  /** Whole-weapon rearward recoil displacement (cm, negative = toward stock) */
  recoilOffsetX: number;
  /** Whole-weapon vertical bore rise (cm) */
  recoilOffsetY: number;
  /** Muzzle-climb pitch around the grip pivot (rad, positive = muzzle up) */
  recoilPitchZ: number;
  recoilVelX: number;
  recoilVelY: number;
  recoilPitchVel: number;
  /** 220 Hz damped barrel-whip displacement at the muzzle (cm) */
  barrelWhipY: number;
  whipAmpCm: number;
  whipAgeSec: number;
  /** Bolt-carrier battery rebound ripple (cm) */
  boltBounceX: number;
  bounceAmpCm: number;
  bounceAgeSec: number;
  /** Barrel temperature (°C) */
  barrelTempC: number;
  /** (T − ambient)/(Tmax − ambient) in [0..1] */
  barrelHeat01: number;
  /** Bore & gas-system carbon fouling in [0..1] */
  carbonFouling01: number;
  shotCount: number;
  lastFireProgress: number;
  hasLastFire: boolean;
  smokeTrickleAcc: number;
}

export interface SpentCasingState {
  active: boolean;
  caliber: CaliberProfile;
  /** Uniform render scale (weapon roundScale) */
  scale: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  ageSec: number;
  bounces: number;
  /** Fresh-from-chamber brass heat glow in [0..1] */
  heat01: number;
  /** true once the case has come to rest on the mat */
  resting: boolean;
  floorY: number;
}

export interface SmokeWispState {
  active: boolean;
  /** 0 = muzzle plume, 1 = open chamber / ejection port, 2 = gas vent, 3 = heat haze */
  kind: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  ageSec: number;
  lifeSec: number;
  size0: number;
  growth: number;
  opacity0: number;
  seed: number;
  /** Derived each step: current radius (cm) & opacity */
  size: number;
  opacity: number;
}

/**
 * Pre-allocated per-frame input struct. Callers keep ONE instance
 * (see `createArmoryPhysicsInput`) and overwrite fields every frame.
 */
export interface ArmoryPhysicsInput {
  weaponId: WeaponId | null;
  caliber: CaliberProfile;
  fireProgress: number;
  /** Only fire/eject/battery events when true (Workbench firing mode) */
  firing: boolean;
  /** Takedown-mat surface height (cm) */
  floorY: number;
  matMinX: number;
  matMaxX: number;
  matMinZ: number;
  matMaxZ: number;
  muzzleX: number;
  muzzleY: number;
  muzzleZ: number;
  ejectPortX: number;
  ejectPortY: number;
  ejectPortZ: number;
  ejectRotX: number;
  ejectRotY: number;
  ejectRotZ: number;
  casingScale: number;
  hasGasVent: boolean;
  gasVentX: number;
  gasVentY: number;
  gasVentZ: number;
  /** Optional modular attachment recoil scaling multiplier (default 1.0) */
  recoilMultiplier?: number;
}

export function createArmoryPhysicsInput(): ArmoryPhysicsInput {
  return {
    weaponId: null,
    caliber: '9mm_para',
    fireProgress: 0,
    firing: false,
    floorY: -20,
    matMinX: -55,
    matMaxX: 55,
    matMinZ: -26,
    matMaxZ: 26,
    muzzleX: 10,
    muzzleY: 0,
    muzzleZ: 0,
    ejectPortX: 0,
    ejectPortY: 0,
    ejectPortZ: 0,
    ejectRotX: 0,
    ejectRotY: 0,
    ejectRotZ: 0,
    casingScale: 1,
    hasGasVent: false,
    gasVentX: 0,
    gasVentY: 0,
    gasVentZ: 0,
    recoilMultiplier: 1,
  };
}

function createCasing(): SpentCasingState {
  return {
    active: false,
    caliber: '9mm_para',
    scale: 1,
    px: 0,
    py: 0,
    pz: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
    ageSec: 0,
    bounces: 0,
    heat01: 0,
    resting: false,
    floorY: 0,
  };
}

function createWisp(): SmokeWispState {
  return {
    active: false,
    kind: 0,
    px: 0,
    py: 0,
    pz: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    ageSec: 0,
    lifeSec: 1,
    size0: 0.5,
    growth: 1,
    opacity0: 0.3,
    seed: 0,
    size: 0,
    opacity: 0,
  };
}

const physicsState: ArmoryPhysicsState = {
  weaponId: null,
  caliber: '9mm_para',
  simTimeSec: 0,
  recoilOffsetX: 0,
  recoilOffsetY: 0,
  recoilPitchZ: 0,
  recoilVelX: 0,
  recoilVelY: 0,
  recoilPitchVel: 0,
  barrelWhipY: 0,
  whipAmpCm: 0,
  whipAgeSec: 0,
  boltBounceX: 0,
  bounceAmpCm: 0,
  bounceAgeSec: 0,
  barrelTempC: AMBIENT_TEMP_C,
  barrelHeat01: 0,
  carbonFouling01: 0,
  shotCount: 0,
  lastFireProgress: 0,
  hasLastFire: false,
  smokeTrickleAcc: 0,
};

const casingPool: SpentCasingState[] = [];
for (let i = 0; i < SPENT_CASING_POOL_SIZE; i++) casingPool.push(createCasing());

const smokePool: SmokeWispState[] = [];
for (let i = 0; i < SMOKE_WISP_POOL_SIZE; i++) smokePool.push(createWisp());

type BrassImpactListener = (
  caliber: CaliberProfile,
  impactSpeedCmS: number
) => void;

let brassImpactListener: BrassImpactListener | null = null;

/** Registers the (single) spent-brass floor-impact audio hook (pass null to clear). */
export function setBrassFloorImpactListener(
  cb: BrassImpactListener | null
): void {
  brassImpactListener = cb;
}

export function getArmoryPhysicsState(): Readonly<ArmoryPhysicsState> {
  return physicsState;
}

export function getSpentCasingPool(): readonly Readonly<SpentCasingState>[] {
  return casingPool;
}

export function getSmokeWispPool(): readonly Readonly<SmokeWispState>[] {
  return smokePool;
}

export function countActiveSpentCasings(): number {
  let n = 0;
  for (let i = 0; i < casingPool.length; i++) if (casingPool[i].active) n++;
  return n;
}

// Deterministic xorshift32 RNG (reproducible tests, zero allocation)
let rngState = 0x9e3779b9;

export function seedArmoryPhysicsRng(seed: number): void {
  rngState = (seed >>> 0) || 0x9e3779b9;
}

function rand01(): number {
  let x = rngState;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  rngState = x;
  return x / 4294967296;
}

function randRange(lo: number, hi: number): number {
  return lo + (hi - lo) * rand01();
}

function randSign(): number {
  return rand01() < 0.5 ? -1 : 1;
}

export function clearSpentCasings(): void {
  for (let i = 0; i < casingPool.length; i++) casingPool[i].active = false;
}

export function clearSmokeWisps(): void {
  for (let i = 0; i < smokePool.length; i++) {
    smokePool[i].active = false;
    smokePool[i].opacity = 0;
  }
}

/** Resets recoil, harmonics, thermal, fouling, shot counter and both pools. */
export function resetArmoryPhysics(): void {
  const s = physicsState;
  s.weaponId = null;
  s.caliber = '9mm_para';
  s.simTimeSec = 0;
  s.recoilOffsetX = 0;
  s.recoilOffsetY = 0;
  s.recoilPitchZ = 0;
  s.recoilVelX = 0;
  s.recoilVelY = 0;
  s.recoilPitchVel = 0;
  s.barrelWhipY = 0;
  s.whipAmpCm = 0;
  s.whipAgeSec = 0;
  s.boltBounceX = 0;
  s.bounceAmpCm = 0;
  s.bounceAgeSec = 0;
  s.barrelTempC = AMBIENT_TEMP_C;
  s.barrelHeat01 = 0;
  s.carbonFouling01 = 0;
  s.shotCount = 0;
  s.lastFireProgress = 0;
  s.hasLastFire = false;
  s.smokeTrickleAcc = 0;
  clearSpentCasings();
  clearSmokeWisps();
}

// --- Spring-damper constants -------------------------------------------------

const RECOIL_OMEGA = 2 * Math.PI * 4.2;
const RECOIL_ZETA = 0.42;
const PITCH_OMEGA = 2 * Math.PI * 3.4;
const PITCH_ZETA = 0.38;
const WHIP_DECAY_SEC = 0.022;
const BOUNCE_DECAY_SEC = 0.03;
const MAX_SUBSTEP_SEC = 1 / 240;

/** Ratio between the first displacement peak and v₀/ω for an under-damped oscillator. */
function firstPeakRatio(zeta: number): number {
  const wd = Math.sqrt(1 - zeta * zeta);
  return Math.exp((-zeta / wd) * Math.atan2(wd, zeta));
}

const RECOIL_PEAK_RATIO = firstPeakRatio(RECOIL_ZETA);
const PITCH_PEAK_RATIO = firstPeakRatio(PITCH_ZETA);

/**
 * Applies a single discharge to the micro-physics state: recoil impulse,
 * muzzle-climb torque, barrel-whip excitation, heat and fouling.
 */
export function applyArmoryShot(
  caliber: CaliberProfile,
  recoilMultiplier = 1.0
): void {
  const spec = getCaliberBallisticsSpec(caliber);
  const s = physicsState;
  s.caliber = spec.caliber;
  const modRecoil =
    Number.isFinite(recoilMultiplier) && recoilMultiplier > 0
      ? Math.max(0.25, Math.min(2.0, recoilMultiplier))
      : 1.0;
  // Platform-specific mechanical recoil mitigation:
  // - KRISS Vector Super V -65° off-axis tungsten slider + low bore axis slashes vertical rise & climb
  // - FN M249 SAW 7.5 kg mass + PIP hydraulic stock buffer attenuates linear kick & climb
  // - GE M134D 18.8 kg pintle-mounted rotary gun disperses recoil into steady axial thrust
  // - H&K G11 K2 & Nikonov AN-94 42mm floating barreled-action delayed-impulse carriages attenuate felt burst climb
  // - VSS Vintorez integral 6-stage baffle suppressor moderates subsonic 9×39mm impulse
  const isVector = s.weaponId === 'vector';
  const isM249 = s.weaponId === 'm249';
  const isM134 = s.weaponId === 'm134';
  const isG11 = s.weaponId === 'g11';
  const isAn94 = s.weaponId === 'an94';
  const isVss = s.weaponId === 'vss';
  const kickMult = isM134
    ? 0.45
    : isG11
      ? 0.65
      : isM249
        ? 0.68
        : isAn94
          ? 0.7
          : isVss
            ? 0.78
            : isVector
              ? 0.82
              : 1;
  const riseMult = isM134
    ? 0.3
    : isVector
      ? 0.36
      : isG11
        ? 0.45
        : isAn94
          ? 0.48
          : isM249
            ? 0.64
            : isVss
              ? 0.65
              : 1;
  const climbMult = isM134
    ? 0.25
    : isVector
      ? 0.32
      : isG11
        ? 0.4
        : isAn94
          ? 0.42
          : isM249
            ? 0.6
            : isVss
              ? 0.6
              : 1;
  s.recoilVelX -=
    ((spec.recoilKickCm * kickMult * modRecoil) * RECOIL_OMEGA) /
    RECOIL_PEAK_RATIO;
  s.recoilVelY +=
    ((spec.recoilRiseCm * riseMult * modRecoil) * RECOIL_OMEGA) /
    RECOIL_PEAK_RATIO;
  s.recoilPitchVel +=
    ((spec.muzzleClimbRad * climbMult * modRecoil) * PITCH_OMEGA) /
    PITCH_PEAK_RATIO;
  s.whipAmpCm = spec.barrelWhipCm;
  s.whipAgeSec = 0;
  s.barrelTempC = Math.min(MAX_BARREL_TEMP_C, s.barrelTempC + spec.heatPerShotC);
  s.carbonFouling01 = Math.min(1, s.carbonFouling01 + spec.foulingPerShot);
  s.shotCount += 1;
  s.barrelHeat01 =
    (s.barrelTempC - AMBIENT_TEMP_C) / (MAX_BARREL_TEMP_C - AMBIENT_TEMP_C);
}

/** Excites the bolt-carrier battery rebound ripple. */
export function applyBoltBattery(): void {
  physicsState.bounceAmpCm = BOLT_BOUNCE_AMPLITUDE_CM;
  physicsState.bounceAgeSec = 0;
}

function pickCasingSlot(): SpentCasingState {
  let oldest = casingPool[0];
  for (let i = 0; i < casingPool.length; i++) {
    const c = casingPool[i];
    if (!c.active) return c;
    if (c.ageSec > oldest.ageSec) oldest = c;
  }
  return oldest;
}

function pickWispSlot(): SmokeWispState {
  let oldest = smokePool[0];
  let oldestRatio = -1;
  for (let i = 0; i < smokePool.length; i++) {
    const w = smokePool[i];
    if (!w.active) return w;
    const ratio = w.ageSec / w.lifeSec;
    if (ratio > oldestRatio) {
      oldestRatio = ratio;
      oldest = w;
    }
  }
  return oldest;
}

/** Spawns a rigid-body spent case at the ejection port with caliber-specific ejector velocity + 3D spin. */
export function spawnSpentCasing(
  input: Readonly<ArmoryPhysicsInput>,
  t: Readonly<WeaponFiringTiming>
): SpentCasingState {
  const spec = getCaliberBallisticsSpec(input.caliber);
  const c = pickCasingSlot();
  const speed = spec.ejectSpeedCmS * randRange(0.88, 1.12);
  c.active = true;
  c.caliber = spec.caliber;
  c.scale = input.casingScale;
  c.px = input.ejectPortX;
  c.py = input.ejectPortY;
  c.pz = input.ejectPortZ;
  c.vx = t.ejectDirX * speed + randRange(-8, 8);
  c.vy = t.ejectDirY * speed + randRange(-6, 6);
  c.vz = t.ejectDirZ * speed + randRange(-8, 8);
  c.rx = input.ejectRotX;
  c.ry = input.ejectRotY;
  c.rz = input.ejectRotZ;
  c.wx = randSign() * randRange(18, 38);
  c.wy = randSign() * randRange(18, 38);
  c.wz = randSign() * randRange(18, 38);
  c.ageSec = 0;
  c.bounces = 0;
  c.heat01 = 1;
  c.resting = false;
  c.floorY = input.floorY;
  return c;
}

function spawnWisp(
  kind: number,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  life: number,
  size0: number,
  growth: number,
  opacity0: number
): void {
  const w = pickWispSlot();
  w.active = true;
  w.kind = kind;
  w.px = x;
  w.py = y;
  w.pz = z;
  w.vx = vx;
  w.vy = vy;
  w.vz = vz;
  w.ageSec = 0;
  w.lifeSec = life;
  w.size0 = size0;
  w.growth = growth;
  w.opacity0 = opacity0;
  w.seed = rand01() * 6.283;
  w.size = size0;
  w.opacity = 0;
}

function spawnMuzzleSmoke(input: Readonly<ArmoryPhysicsInput>): void {
  const spec = getCaliberBallisticsSpec(input.caliber);
  const isTank = isTankCaliber(spec.caliber) || isTankWeapon(input.weaponId);
  const bulk = isTank ? 9.5 : Math.sqrt(spec.muzzleEnergyJ / 1500);
  const count = isTank
    ? 8
    : spec.caliber === '50_bmg' || spec.caliber === '338_lapua'
      ? 6
      : 4;
  for (let i = 0; i < count; i++) {
    spawnWisp(
      0,
      input.muzzleX + randRange(0.2, 2.5) * bulk,
      input.muzzleY + randRange(-0.3, 0.3) * (isTank ? 5.5 : 1),
      input.muzzleZ + randRange(-0.4, 0.4) * (isTank ? 5.5 : 1),
      randRange(18, 55) * bulk,
      randRange(4, 14) * (isTank ? 3.5 : 1),
      randRange(-10, 10) * (isTank ? 4.5 : 1),
      randRange(isTank ? 2.4 : 1.8, isTank ? 4.2 : 3.2),
      randRange(0.45, 0.8) * bulk,
      randRange(1.4, 2.6) * bulk,
      randRange(0.22, 0.34)
    );
  }
}

function spawnChamberSmoke(input: Readonly<ArmoryPhysicsInput>): void {
  const isTank = isTankCaliber(input.caliber) || isTankWeapon(input.weaponId);
  const s = isTank ? 7.5 : 1;
  for (let i = 0; i < 3; i++) {
    spawnWisp(
      1,
      input.ejectPortX + randRange(-0.6, 0.6) * s,
      input.ejectPortY + randRange(0, 0.5) * s,
      input.ejectPortZ + randRange(0, 0.6) * s,
      randRange(-4, 4) * s,
      randRange(8, 18) * (isTank ? 3.5 : 1),
      randRange(2, 9) * (isTank ? 3.0 : 1),
      randRange(1.6, 2.6),
      randRange(0.3, 0.5) * s,
      randRange(0.9, 1.5) * s,
      randRange(0.16, 0.26)
    );
  }
}

function spawnVentSmoke(input: Readonly<ArmoryPhysicsInput>): void {
  for (let i = 0; i < 2; i++) {
    spawnWisp(
      2,
      input.gasVentX + randRange(-0.3, 0.3),
      input.gasVentY + randRange(0, 0.3),
      input.gasVentZ + randRange(0.1, 0.5),
      randRange(-3, 3),
      randRange(10, 20),
      randRange(6, 14),
      randRange(1.2, 2.0),
      randRange(0.25, 0.4),
      randRange(0.8, 1.3),
      randRange(0.14, 0.22)
    );
  }
}

/** Forward-crossing test with loop-wrap support; large jumps are treated as teleports. */
function crossedForward(prev: number, cur: number, target: number): boolean {
  if (cur >= prev) {
    if (cur - prev > 0.25) return false;
    return prev < target && target <= cur;
  }
  // Looped from ~1 back to ~0
  if (prev - cur < 0.5) return false;
  if (1 - prev + cur > 0.25) return false;
  return target > prev || target <= cur;
}

/**
 * Euler XYZ rotated local +X axis → world Y component (casing long axis tilt).
 * R = Rx·Ry·Rz → column 0 = (cy·cz, cx·sz + sx·sy·cz, sx·sz − cx·sy·cz)
 */
function casingAxisY(rx: number, ry: number, rz: number): number {
  return (
    Math.cos(rx) * Math.sin(rz) + Math.sin(rx) * Math.sin(ry) * Math.cos(rz)
  );
}

/** Lowest-point height of a tilted cylindrical case above its center (cm). */
export function computeCasingContactHeight(c: Readonly<SpentCasingState>): number {
  const spec = getCaliberBallisticsSpec(c.caliber);
  const ay = Math.min(1, Math.abs(casingAxisY(c.rx, c.ry, c.rz)));
  const half = spec.caseHalfLenCm * c.scale;
  const r = spec.caseRadiusCm * c.scale;
  return half * ay + r * Math.sqrt(Math.max(0, 1 - ay * ay));
}

function nearestMultipleOfPi(a: number): number {
  return Math.round(a / Math.PI) * Math.PI;
}

function integrateCasing(
  c: SpentCasingState,
  dt: number,
  input: Readonly<ArmoryPhysicsInput>
): void {
  c.ageSec += dt;
  c.heat01 = Math.exp(-c.ageSec / 3.5);

  if (c.resting) {
    // Lying on the mat: settle orientation flat and bleed any residual roll
    const k = 1 - Math.exp(-8 * dt);
    c.rx += (nearestMultipleOfPi(c.rx) - c.rx) * k;
    c.rz += (nearestMultipleOfPi(c.rz) - c.rz) * k;
    c.py = c.floorY + computeCasingContactHeight(c);
    return;
  }

  // Ballistic flight under gravity with mild aerodynamic drag
  const drag = Math.exp(-0.25 * dt);
  c.vy += GRAVITY_CM_S2 * dt;
  c.vx *= drag;
  c.vy *= drag;
  c.vz *= drag;
  c.px += c.vx * dt;
  c.py += c.vy * dt;
  c.pz += c.vz * dt;
  c.rx += c.wx * dt;
  c.ry += c.wy * dt;
  c.rz += c.wz * dt;

  // Raised takedown-mat perimeter lip (soft wall bounce)
  if (c.px < input.matMinX) {
    c.px = input.matMinX;
    c.vx = Math.abs(c.vx) * 0.3;
  } else if (c.px > input.matMaxX) {
    c.px = input.matMaxX;
    c.vx = -Math.abs(c.vx) * 0.3;
  }
  if (c.pz < input.matMinZ) {
    c.pz = input.matMinZ;
    c.vz = Math.abs(c.vz) * 0.3;
  } else if (c.pz > input.matMaxZ) {
    c.pz = input.matMaxZ;
    c.vz = -Math.abs(c.vz) * 0.3;
  }

  const contact = computeCasingContactHeight(c);
  const floorTop = c.floorY + contact;
  const onFloor = c.py <= floorTop;

  if (onFloor) {
    c.py = floorTop;
    if (c.vy < 0) {
      const impactSpeed = -c.vy;
      if (
        impactSpeed > BRASS_AUDIBLE_IMPACT_CMS &&
        c.bounces < BRASS_MAX_AUDIBLE_BOUNCES &&
        brassImpactListener
      ) {
        brassImpactListener(c.caliber, impactSpeed);
      }
      c.bounces += 1;

      // Normal restitution
      c.vy = impactSpeed * BRASS_RESTITUTION;

      // Coulomb friction impulse on the planar velocity: |Δv_t| ≤ μ·(1+e)·|v_n|
      const vt = Math.hypot(c.vx, c.vz);
      if (vt > 1e-6) {
        const dv = Math.min(
          vt,
          BRASS_FLOOR_FRICTION * (1 + BRASS_RESTITUTION) * impactSpeed
        );
        const scale = (vt - dv) / vt;
        c.vx *= scale;
        c.vz *= scale;
      }

      // Spin ↔ linear transfer: rim contact converts tumble into skitter
      const r = getCaliberBallisticsSpec(c.caliber).caseRadiusCm * c.scale;
      c.vx += c.wz * r * 0.25;
      c.vz -= c.wx * r * 0.25;
      c.wx *= 0.55;
      c.wz *= 0.55;
      c.wy = c.wy * 0.7 + randRange(-6, 6);

      // Too slow to leave the mat again → come to rest
      if (c.vy < 9) {
        c.vy = 0;
        c.resting = true;
      }
    } else if (c.vy < 9) {
      c.vy = 0;
      c.resting = true;
    }
  }

  if (c.resting) {
    c.vx = 0;
    c.vz = 0;
    c.wx = 0;
    c.wy = 0;
    c.wz = 0;
  }
}

function integrateWisp(w: SmokeWispState, dt: number): void {
  w.ageSec += dt;
  if (w.ageSec >= w.lifeSec) {
    w.active = false;
    w.opacity = 0;
    return;
  }
  const drag = Math.exp(-1.6 * dt);
  w.vx *= drag;
  w.vy = w.vy * drag + 14 * dt; // thermal buoyancy
  w.vz *= drag;
  // Gentle curl drift
  const curl = Math.sin(w.ageSec * 2.3 + w.seed);
  w.px += (w.vx + curl * 2.2) * dt;
  w.py += w.vy * dt;
  w.pz += (w.vz + Math.cos(w.ageSec * 1.7 + w.seed) * 2.2) * dt;
  const life01 = w.ageSec / w.lifeSec;
  const fadeIn = Math.min(1, w.ageSec / 0.08);
  const fadeOut = Math.pow(1 - life01, 1.5);
  w.size = w.size0 + w.growth * w.ageSec;
  w.opacity = w.opacity0 * fadeIn * fadeOut;
}

/**
 * Advances the full micro-physics simulation by `dtSec` (already time-scaled
 * for slow motion). Detects forward crossings of ignition / muzzle-exit /
 * ejection / battery in `input.fireProgress` to trigger discrete events.
 * Zero heap allocation.
 */
export function stepArmoryPhysics(
  dtSec: number,
  input: Readonly<ArmoryPhysicsInput>
): Readonly<ArmoryPhysicsState> {
  const s = physicsState;
  const dt = dtSec > 0 ? Math.min(dtSec, 0.1) : 0;

  if (input.weaponId !== s.weaponId) {
    resetArmoryPhysics();
    s.weaponId = input.weaponId;
    s.lastFireProgress = input.fireProgress;
    s.hasLastFire = true;
  }
  s.caliber = input.caliber;

  const t = getWeaponFiringTiming(input.weaponId);
  const f = input.fireProgress;
  const isArchery =
    isArcheryWeapon(input.weaponId) || isArcheryCaliber(input.caliber);

  // ---- 1. Discrete firing-cycle events --------------------------------------
  if (s.hasLastFire && input.firing) {
    const prev = s.lastFireProgress;
    if (crossedForward(prev, f, t.ignitionF)) {
      applyArmoryShot(input.caliber, input.recoilMultiplier ?? 1.0);
    }
    if (!isArchery) {
      if (crossedForward(prev, f, t.muzzleExitF)) {
        spawnMuzzleSmoke(input);
      }
      if (input.hasGasVent && crossedForward(prev, f, t.muzzleExitF + 0.02)) {
        spawnVentSmoke(input);
      }
      if (crossedForward(prev, f, t.ejectF)) {
        if (
          input.weaponId !== 'python' &&
          input.weaponId !== 'g11' &&
          input.caliber !== '473_caseless' &&
          !isTankWeapon(input.weaponId) &&
          !isTankCaliber(input.caliber)
        ) {
          spawnSpentCasing(input, t);
        }
        spawnChamberSmoke(input);
      }
      if (crossedForward(prev, f, t.batteryF)) {
        applyBoltBattery();
      }
    }
  }
  s.lastFireProgress = f;
  s.hasLastFire = true;

  if (isArchery) {
    s.barrelTempC = AMBIENT_TEMP_C;
    s.barrelHeat01 = 0;
    s.carbonFouling01 = 0;
  }

  if (dt <= 0) return s;
  s.simTimeSec += dt;

  // ---- 2. Spring-damper recoil (semi-implicit Euler substeps) ---------------
  const steps = Math.max(1, Math.ceil(dt / MAX_SUBSTEP_SEC));
  const h = dt / steps;
  const kR = RECOIL_OMEGA * RECOIL_OMEGA;
  const cR = 2 * RECOIL_ZETA * RECOIL_OMEGA;
  const kP = PITCH_OMEGA * PITCH_OMEGA;
  const cP = 2 * PITCH_ZETA * PITCH_OMEGA;
  for (let i = 0; i < steps; i++) {
    s.recoilVelX += (-kR * s.recoilOffsetX - cR * s.recoilVelX) * h;
    s.recoilOffsetX += s.recoilVelX * h;
    s.recoilVelY += (-kR * s.recoilOffsetY - cR * s.recoilVelY) * h;
    s.recoilOffsetY += s.recoilVelY * h;
    s.recoilPitchVel += (-kP * s.recoilPitchZ - cP * s.recoilPitchVel) * h;
    s.recoilPitchZ += s.recoilPitchVel * h;
  }

  // ---- 3. Barrel whip (220 Hz) & bolt bounce ripple -------------------------
  s.whipAgeSec += dt;
  if (s.whipAmpCm > 0) {
    const env = Math.exp(-s.whipAgeSec / WHIP_DECAY_SEC);
    s.barrelWhipY =
      s.whipAmpCm * env * Math.sin(2 * Math.PI * BARREL_WHIP_HZ * s.whipAgeSec);
    if (env < 1e-4) {
      s.whipAmpCm = 0;
      s.barrelWhipY = 0;
    }
  }
  s.bounceAgeSec += dt;
  if (s.bounceAmpCm > 0) {
    const env = Math.exp(-s.bounceAgeSec / BOUNCE_DECAY_SEC);
    s.boltBounceX =
      s.bounceAmpCm * env * Math.cos(2 * Math.PI * BOLT_BOUNCE_HZ * s.bounceAgeSec);
    if (env < 1e-4) {
      s.bounceAmpCm = 0;
      s.boltBounceX = 0;
    }
  }

  // ---- 4. Newton convective barrel cooling: dT/dt = −h·(T − T_amb) ----------
  s.barrelTempC =
    AMBIENT_TEMP_C +
    (s.barrelTempC - AMBIENT_TEMP_C) * Math.exp(-BARREL_COOLING_RATE * dt);
  s.barrelHeat01 =
    (s.barrelTempC - AMBIENT_TEMP_C) / (MAX_BARREL_TEMP_C - AMBIENT_TEMP_C);

  // ---- 5. Heat-haze / cook-off smoke trickle from a hot muzzle --------------
  if (s.barrelHeat01 > 0.12) {
    const isTank = isTankWeapon(input.weaponId) || isTankCaliber(input.caliber);
    const hazeScale = isTank ? 7.0 : 1;
    s.smokeTrickleAcc += dt * s.barrelHeat01 * 2.4;
    if (s.smokeTrickleAcc >= 1) {
      s.smokeTrickleAcc -= 1;
      spawnWisp(
        3,
        input.muzzleX + randRange(-0.3, 0.2) * hazeScale,
        input.muzzleY + 0.3 * hazeScale,
        input.muzzleZ + randRange(-0.2, 0.2) * hazeScale,
        randRange(-1.5, 1.5) * hazeScale,
        randRange(6, 12) * (isTank ? 3.0 : 1),
        randRange(-1.5, 1.5) * hazeScale,
        randRange(2.0, 3.0),
        0.25 * hazeScale,
        0.7 * hazeScale,
        0.1 + 0.12 * s.barrelHeat01
      );
    }
  } else {
    s.smokeTrickleAcc = 0;
  }

  // ---- 6. Rigid-body brass & smoke pools ------------------------------------
  for (let i = 0; i < casingPool.length; i++) {
    const c = casingPool[i];
    if (c.active) integrateCasing(c, dt, input);
  }
  for (let i = 0; i < smokePool.length; i++) {
    const w = smokePool[i];
    if (w.active) integrateWisp(w, dt);
  }

  return s;
}
