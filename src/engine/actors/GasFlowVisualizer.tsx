import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { getLoadedWeaponPlugin } from '../../weapons/registry';
import type { WeaponId } from '../../weapons/types';
import {
  MUZZLE_ATTACHMENT_SPECS,
  getWeaponAttachmentMountProfile,
} from '../attachments/attachmentSpecs';
import {
  getActiveWeaponAttachmentPhysics,
  getWeaponAttachmentLoadout,
} from '../attachments/attachmentStore';
import { computeRiflingBoreBounds } from '../ballistics/riflingSpecs';
import { playbackClock } from '../clock/playbackClock';
import { WEAPON_GAS_MANIFOLD_PROFILES } from '../materials/engineeringRoles';
import {
  computeGasPortUncoverF,
  createInternalBallisticsSample,
  evaluateInternalBallisticsInto,
  getArmoryPhysicsState,
  getWeaponFiringTiming,
} from '../physics/armoryPhysics';
import { RIFLING_EXPLODE_VISIBILITY_MAX } from './RiflingBoreActor';

const STREAM_CHEVRON_COUNT = 24;
const SUPP_VORTEX_SLOTS = [0, 1, 2, 3, 4] as const;
const BRAKE_JET_SLOTS = [0, 1, 2, 3] as const;
const FH_PRONG_SLOTS = [0, 1, 2] as const;
const BREECH_WISP_SLOTS = [0, 1, 2] as const;
const THERMAL_MIRAGE_SLOTS = [0, 1, 2, 3] as const;
const TANK_EVAC_PUFF_SLOTS = [0, 1, 2, 3, 4, 5] as const;
const TIGER_BAFFLE_JET_SLOTS = [0, 1, 2, 3] as const;
const BRAKE_SWEEP_RAD = (32 * Math.PI) / 180;
const noRaycast = (): null => null;

// Floor surface offsets matching GunsmithStageMat (`HEAVY_ARMOR_HANGAR_SPEC.topOffsetYCm` & `TAKEDOWN_MAT_SPEC.thicknessCm`)
const HEAVY_HANGAR_FLOOR_OFFSET_Y = 1.0;
const TAKEDOWN_MAT_FLOOR_OFFSET_Y = 0.45;

export const THERMAL_MIRAGE_HEAT_THRESHOLD = 0.22;
export const THERMAL_MIRAGE_RIBBON_COUNT = THERMAL_MIRAGE_SLOTS.length;

// Cycle 19A: High-RPM Rotary Cannon Motion-Blur Sweep Halo & 1:1 MBT Bore-Evacuator Vent Plume constants
export const ROTARY_BLUR_FIRE_THRESHOLD = 0.04;
export const TANK_BORE_EVACUATOR_START_F = 0.28;
export const TANK_BORE_EVACUATOR_END_F = 0.78;
export const TANK_EVAC_PUFF_COUNT = TANK_EVAC_PUFF_SLOTS.length;
export const TIGER_BAFFLE_JET_COUNT = TIGER_BAFFLE_JET_SLOTS.length;

export interface RotaryBlurHaloSample {
  /** True ONLY for `gau8` & `m134` during active firing (`fireProgress > 0.04`), non-cutaway, non-exploded */
  active: boolean;
  /** Translucent radial-streak cylindrical sweep halo opacity `[0..0.46]` */
  opacity: number;
  /** Effective barrel-cluster angular velocity in rad/s scaled by RPM & `speedMultiplier` */
  spinRadPerSec: number;
  /** Outer cylindrical motion-blur sweep radius around the coaxial rotor axis (cm) */
  radiusCm: number;
  /** Axial length of the exposed spinning barrel cluster sweep halo (cm) */
  lengthCm: number;
  /** Dull-cherry thermal heat tint `[0..1]` rising smoothly with `barrelHeat01` */
  heatTint01: number;
  /** World-space axial center X (cm) of the exposed rotary barrel cluster */
  centerX: number;
  /** Number of rotary barrels (`7` for GAU-8/A, `6` for M134D) */
  barrelCount: number;
}

export function createMutableRotaryBlurHaloSample(): RotaryBlurHaloSample {
  return {
    active: false,
    opacity: 0,
    spinRadPerSec: 0,
    radiusCm: 0,
    lengthCm: 0,
    heatTint01: 0,
    centerX: 0,
    barrelCount: 0,
  };
}

export interface TankBoreEvacuatorSample {
  /** True strictly for the 4 1:1 MBTs (`ztz99a`, `m1a2`, `leopard2a7`, `tiger1`) post-exit */
  active: boolean;
  /** Expanding volumetric scavenging plume scale multiplier `[0..1.9]` */
  plumeScale: number;
  /** Soft trailing bore-scavenging residual smoke opacity `[0..0.40]` */
  opacity: number;
  /** World-space bore evacuator / muzzle-brake anchor X (cm) */
  originX: number;
  /** World-space bore centerline Y (cm) */
  originY: number;
  /** World-space muzzle crown X (cm) for trailing barrel-scavenging smoke */
  muzzleX: number;
  /** Normalized progression `[0..1]` across the post-exit scavenging window */
  progress01: number;
  /** True on Tiger I (`tiger1`) Krupp twin-baffle muzzle brake, false on modern bore-evacuator MBTs */
  hasTwinBaffleBrake: boolean;
  /** Lateral dual-baffle smoke jet intensity `[0..1]` on Tiger I (`0` on non-Tiger MBTs) */
  baffleJetStrength01: number;
}

export function createMutableTankBoreEvacuatorSample(): TankBoreEvacuatorSample {
  return {
    active: false,
    plumeScale: 0,
    opacity: 0,
    originX: 0,
    originY: 0,
    muzzleX: 0,
    progress01: 0,
    hasTwinBaffleBrake: false,
    baffleJetStrength01: 0,
  };
}

interface RotaryBlurProfile {
  cyclicRpm: number;
  barrelCount: number;
  radiusCm: number;
  lengthCm: number;
  centerX: number;
  peakOpacity: number;
}

const ROTARY_BLUR_PROFILES: Partial<Record<WeaponId, RotaryBlurProfile>> = {
  // GE GAU-8/A Avenger: 3,900 RPM across 7 barrels (557.14 cluster RPM = 58.34 rad/s),
  // exposed 2.3m barrel bundle X ∈ [90, 306] cm, pitch R=7.4 cm + tube R=2.75 cm -> halo R=10.8 cm
  gau8: {
    cyclicRpm: 3900,
    barrelCount: 7,
    radiusCm: 10.8,
    lengthCm: 216.0,
    centerX: 198.0,
    peakOpacity: 0.36,
  },
  // GE / Dillon Aero M134D Minigun: 3,000 RPM nominal across 6 barrels (500 cluster RPM = 52.36 rad/s),
  // exposed 22" barrel bundle X ∈ [3.6, 45.2] cm, pitch R=2.65 cm + tube R=0.84 cm -> halo R=3.65 cm
  m134: {
    cyclicRpm: 3000,
    barrelCount: 6,
    radiusCm: 3.65,
    lengthCm: 41.6,
    centerX: 24.4,
    peakOpacity: 0.34,
  },
};

interface TankBoreEvacuatorProfile {
  originX: number;
  originY: number;
  muzzleX: number;
  evacRadiusCm: number;
  peakOpacity: number;
  mainGunPartId: string;
  hasTwinBaffleBrake: boolean;
  rearBaffleX: number;
  frontBaffleX: number;
}

const TANK_BORE_EVACUATOR_PROFILES: Partial<
  Record<WeaponId, TankBoreEvacuatorProfile>
> = {
  // PLA ZTZ-99A 125mm ZPT-98 L/50 smoothbore: evacuator world X ∈ [335, 419], forward collar 405, Y=38
  ztz99a: {
    originX: 405.0,
    originY: 38.0,
    muzzleX: 710.0,
    evacRadiusCm: 14.8,
    peakOpacity: 0.34,
    mainGunPartId: 'ztz99a_main_gun',
    hasTwinBaffleBrake: false,
    rearBaffleX: 0,
    frontBaffleX: 0,
  },
  // M1A2 SEP v3 Abrams 120mm L/44 M256 smoothbore: evacuator world X ∈ [280, 350], center 315, Y=44
  m1a2: {
    originX: 315.0,
    originY: 44.0,
    muzzleX: 581.0,
    evacRadiusCm: 13.4,
    peakOpacity: 0.34,
    mainGunPartId: 'm1a2_main_gun',
    hasTwinBaffleBrake: false,
    rearBaffleX: 0,
    frontBaffleX: 0,
  },
  // Leopard 2A7V 120mm Rh-120 L/55A1 smoothbore: evacuator world X ∈ [338, 414], center 376, Y=74
  leopard2a7: {
    originX: 376.0,
    originY: 74.0,
    muzzleX: 712.0,
    evacRadiusCm: 13.8,
    peakOpacity: 0.34,
    mainGunPartId: 'leo_main_gun',
    hasTwinBaffleBrake: false,
    rearBaffleX: 0,
    frontBaffleX: 0,
  },
  // Pz.Kpfw. VI Tiger 131 88mm KwK 36 L/56 rifled + Krupp twin-baffle brake (world X ∈ [498, 529], center 513.5, Y=102)
  tiger1: {
    originX: 513.5,
    originY: 102.0,
    muzzleX: 529.0,
    evacRadiusCm: 13.5,
    peakOpacity: 0.38,
    mainGunPartId: 'tiger_main_gun',
    hasTwinBaffleBrake: true,
    rearBaffleX: 507.5,
    frontBaffleX: 519.5,
  },
};

// Cycle 15A: Matt Rittman In-Bore Propellant Deflagration & Boxer Primer Flash constants
export const IN_BORE_RADIUS_CLEARANCE_SCALE = 0.88;
export const IN_BORE_TEMP_PEAK_K = 3200;
export const IN_BORE_TEMP_EXPANSION_K = 1900;
export const IN_BORE_TEMP_EMBER_K = 1150;
export const IN_BORE_PRIMER_WINDOW_PRE_F = 0.008;
export const IN_BORE_PRIMER_WINDOW_POST_F = 0.056;
export const IN_BORE_BLOWDOWN_TAIL_F = 0.14;

export interface InBoreDeflagrationSample {
  /** True whenever either Boxer primer flash spark or in-bore plasma column is visible */
  active: boolean;
  /** Crisp white-amber Boxer primer ignition burst intensity `[0, 1]` at flash-hole onset */
  primerFlashIntensity01: number;
  /** World-space X anchor (cm) of the rear Boxer primer flash-hole spark */
  primerFlashX: number;
  /** True while incandescent propellant deflagration plasma occupies the bore */
  columnActive: boolean;
  /** World-space breech start X (cm) of the expanding propellant column */
  columnStartX: number;
  /** World-space bullet-base end X (cm), clamped strictly inside `[chamberX..muzzleX]` */
  columnEndX: number;
  /** Plasma column radius (cm), strictly `boreRadiusCm * 0.88` to clear sliced rifling lands */
  columnRadiusCm: number;
  /** Normalized plasma brightness `[0, 1]` coupled directly to `P(t) / P_max` */
  columnIntensity01: number;
  /** Physical propellant gas blackbody color temperature in Kelvin (`1,150K..3,200K`) */
  colorTempK: number;
  /** Chamber breech anchor X (cm) */
  chamberX: number;
  /** Inset rifled muzzle crown anchor X (cm) from `computeRiflingBoreBounds` */
  muzzleX: number;
  /** Exact world-space bore centerline Y (cm) */
  boreY: number;
  /** Exact world-space bore centerline Z (cm) */
  boreZ: number;
}

export function createMutableInBoreDeflagrationSample(): InBoreDeflagrationSample {
  return {
    active: false,
    primerFlashIntensity01: 0,
    primerFlashX: 0,
    columnActive: false,
    columnStartX: 0,
    columnEndX: 0,
    columnRadiusCm: 0,
    columnIntensity01: 0,
    colorTempK: IN_BORE_TEMP_EMBER_K,
    chamberX: 0,
    muzzleX: 0,
    boreY: 0,
    boreZ: 0,
  };
}

export interface MuzzleShockwaveSample {
  active: boolean;
  radiusCm: number;
  opacity: number;
  floorY: number;
  /** Secondary trailing outer ground-dust wave radius (cm) */
  dustRadiusCm: number;
  /** Secondary trailing outer ground-dust wave opacity */
  dustOpacity: number;
  /** Normalized progression 0..1 across the shockwave window */
  progress01: number;
  /** Longitudinal center offset ahead of muzzle exit (cm) */
  centerOffsetXCm: number;
}

export interface ThermalMirageSample {
  active: boolean;
  opacity: number;
  riseSpeed: number;
  swayAmplitudeCm: number;
}

interface MuzzleShockwaveProfile {
  startF: number;
  endF: number;
  minRadiusCm: number;
  maxRadiusCm: number;
  peakOpacity: number;
  dustPeakOpacity: number;
  centerOffsetXCm: number;
  isHeavyHangar: boolean;
}

const MUZZLE_SHOCKWAVE_PROFILES: Partial<
  Record<WeaponId, MuzzleShockwaveProfile>
> = {
  // 1:1 125mm / 120mm Main Battle Tanks — 140..520 cm supersonic overpressure sweep across concrete hangar
  ztz99a: {
    startF: 0.22,
    endF: 0.68,
    minRadiusCm: 140,
    maxRadiusCm: 520,
    peakOpacity: 0.62,
    dustPeakOpacity: 0.34,
    centerOffsetXCm: 95,
    isHeavyHangar: true,
  },
  m1a2: {
    startF: 0.22,
    endF: 0.68,
    minRadiusCm: 140,
    maxRadiusCm: 520,
    peakOpacity: 0.62,
    dustPeakOpacity: 0.34,
    centerOffsetXCm: 95,
    isHeavyHangar: true,
  },
  leopard2a7: {
    startF: 0.22,
    endF: 0.68,
    minRadiusCm: 140,
    maxRadiusCm: 520,
    peakOpacity: 0.62,
    dustPeakOpacity: 0.34,
    centerOffsetXCm: 95,
    isHeavyHangar: true,
  },
  // WWII 88mm KwK 36 L/56 heavy tank
  tiger1: {
    startF: 0.24,
    endF: 0.68,
    minRadiusCm: 120,
    maxRadiusCm: 430,
    peakOpacity: 0.56,
    dustPeakOpacity: 0.3,
    centerOffsetXCm: 75,
    isHeavyHangar: true,
  },
  // 30×173mm GAU-8/A rotary autocannon on concrete hangar bay
  gau8: {
    startF: 0.22,
    endF: 0.64,
    minRadiusCm: 72,
    maxRadiusCm: 255,
    peakOpacity: 0.48,
    dustPeakOpacity: 0.26,
    centerOffsetXCm: 48,
    isHeavyHangar: true,
  },
  // .50 BMG anti-materiel rifle — crisp benchtop blast wave across gunsmith mat
  m82a1: {
    startF: 0.22,
    endF: 0.66,
    minRadiusCm: 14,
    maxRadiusCm: 56,
    peakOpacity: 0.46,
    dustPeakOpacity: 0.24,
    centerOffsetXCm: 8,
    isHeavyHangar: false,
  },
  // .338 Lapua Magnum sniper rifle — crisp benchtop overpressure ripple
  awm: {
    startF: 0.35,
    endF: 0.68,
    minRadiusCm: 11,
    maxRadiusCm: 42,
    peakOpacity: 0.36,
    dustPeakOpacity: 0.19,
    centerOffsetXCm: 6,
    isHeavyHangar: false,
  },
  // High-pressure full-power 7.92mm / .30-06 rifles — subtle bench dust ripple
  mg42: {
    startF: 0.31,
    endF: 0.66,
    minRadiusCm: 9,
    maxRadiusCm: 32,
    peakOpacity: 0.28,
    dustPeakOpacity: 0.15,
    centerOffsetXCm: 5,
    isHeavyHangar: false,
  },
  garand: {
    startF: 0.23,
    endF: 0.62,
    minRadiusCm: 8,
    maxRadiusCm: 28,
    peakOpacity: 0.24,
    dustPeakOpacity: 0.13,
    centerOffsetXCm: 4.5,
    isHeavyHangar: false,
  },
  k98k: {
    startF: 0.27,
    endF: 0.64,
    minRadiusCm: 8,
    maxRadiusCm: 28,
    peakOpacity: 0.24,
    dustPeakOpacity: 0.13,
    centerOffsetXCm: 4.5,
    isHeavyHangar: false,
  },
};

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-5, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Zero-GC evaluator writing the ground-plane supersonic muzzle overpressure
 * shockwave ring & outer dust wave state into `out`.
 */
export function writeMuzzleShockwaveSampleInto(
  weaponId: WeaponId,
  fireProgress: number,
  out: MuzzleShockwaveSample
): MuzzleShockwaveSample {
  const manifest = getWeaponManifest(weaponId);
  const isHeavyFloor =
    manifest.workbenchMeta.scaleProfile === 'main_battle_tank';
  const floorY =
    manifest.workbenchMeta.gridY +
    (isHeavyFloor ? HEAVY_HANGAR_FLOOR_OFFSET_Y : TAKEDOWN_MAT_FLOOR_OFFSET_Y);

  out.floorY = floorY;
  out.active = false;
  out.radiusCm = 0;
  out.opacity = 0;
  out.dustRadiusCm = 0;
  out.dustOpacity = 0;
  out.progress01 = 0;
  out.centerOffsetXCm = 0;

  if ((weaponId as string) === 'lift33' || (weaponId as string) === 'r500') {
    return out;
  }
  const prof = MUZZLE_SHOCKWAVE_PROFILES[weaponId];
  if (!prof || !Number.isFinite(fireProgress) || fireProgress <= 0) {
    return out;
  }
  if (fireProgress < prof.startF || fireProgress > prof.endF) {
    return out;
  }

  const u = clamp01((fireProgress - prof.startF) / (prof.endF - prof.startF));
  if (u <= 0 || u >= 1) {
    return out;
  }

  // Sedov-Taylor blast front deceleration: rapid supersonic slap tapering as energy spreads ~1/r^2
  const expandCurve = 1 - Math.pow(1 - u, 2.15);
  const radiusCm =
    prof.minRadiusCm + (prof.maxRadiusCm - prof.minRadiusCm) * expandCurve;

  // Sharp pressure wavefront onset followed by smooth 1/r acoustic-overpressure decay
  const onset = smoothstep01(0, 0.1, u);
  const decay = Math.pow(1 - u, 1.35);
  const opacity = prof.peakOpacity * onset * decay;

  // Secondary ground dust / displaced bench grit wave lags slightly behind the shock crest
  const dustExpand = 1 - Math.pow(1 - u, 1.55);
  const dustRadiusCm =
    prof.minRadiusCm * 0.85 +
    (prof.maxRadiusCm * 1.14 - prof.minRadiusCm * 0.85) * dustExpand;
  const dustOnset = smoothstep01(0.04, 0.22, u);
  const dustDecay = Math.pow(1 - u, 1.1);
  const dustOpacity = prof.dustPeakOpacity * dustOnset * dustDecay;

  out.active = opacity > 0.004 || dustOpacity > 0.004;
  out.radiusCm = out.active ? radiusCm : 0;
  out.opacity = out.active ? opacity : 0;
  out.dustRadiusCm = out.active ? dustRadiusCm : 0;
  out.dustOpacity = out.active ? dustOpacity : 0;
  out.progress01 = u;
  out.centerOffsetXCm = prof.centerOffsetXCm;
  return out;
}

/**
 * Pure helper computing the ground-plane supersonic muzzle overpressure
 * shockwave sample for a given exhibit & normalized `fireProgress`.
 */
export function computeMuzzleShockwaveSample(
  weaponId: WeaponId,
  fireProgress: number
): MuzzleShockwaveSample {
  const out: MuzzleShockwaveSample = {
    active: false,
    radiusCm: 0,
    opacity: 0,
    floorY: 0,
    dustRadiusCm: 0,
    dustOpacity: 0,
    progress01: 0,
    centerOffsetXCm: 0,
  };
  return writeMuzzleShockwaveSampleInto(weaponId, fireProgress, out);
}

/**
 * Zero-GC evaluator writing hot-barrel convective thermal mirage shimmer
 * state into `out`. Strictly inactive at `barrelHeat01 <= 0.22` and on archery.
 */
export function writeThermalMirageSampleInto(
  weaponId: WeaponId,
  barrelHeat01: number,
  out: ThermalMirageSample
): ThermalMirageSample {
  out.active = false;
  out.opacity = 0;
  out.riseSpeed = 0;
  out.swayAmplitudeCm = 0;

  if (
    (weaponId as string) === 'lift33' ||
    (weaponId as string) === 'r500' ||
    !Number.isFinite(barrelHeat01) ||
    barrelHeat01 <= THERMAL_MIRAGE_HEAT_THRESHOLD
  ) {
    return out;
  }

  const heatNorm = clamp01(
    (barrelHeat01 - THERMAL_MIRAGE_HEAT_THRESHOLD) /
      (1 - THERMAL_MIRAGE_HEAT_THRESHOLD)
  );
  const manifest = getWeaponManifest(weaponId);
  const isTank = manifest.workbenchMeta.scaleProfile === 'main_battle_tank';

  out.active = true;
  out.opacity = 0.055 + 0.165 * Math.pow(heatNorm, 0.85);
  out.riseSpeed = 1.1 + 1.25 * heatNorm;
  out.swayAmplitudeCm = (isTank ? 12.0 : 0.45) * (0.65 + 0.55 * heatNorm);
  return out;
}

/**
 * Pure helper computing hot-barrel convective thermal mirage shimmer state.
 */
export function computeThermalMirageSample(
  weaponId: WeaponId,
  barrelHeat01: number
): ThermalMirageSample {
  const out: ThermalMirageSample = {
    active: false,
    opacity: 0,
    riseSpeed: 0,
    swayAmplitudeCm: 0,
  };
  return writeThermalMirageSampleInto(weaponId, barrelHeat01, out);
}

/**
 * Zero-GC physical blackbody ramp mapping propellant deflagration gas temperature
 * (`1,150K` soft ember -> `1,900K` burnt orange adiabatic expansion -> `3,200K` incandescent white-gold)
 * into a reusable `THREE.Color`.
 */
export function inBoreColorTempToRgbInto(
  colorTempK: number,
  out: THREE.Color
): THREE.Color {
  const k = Number.isFinite(colorTempK)
    ? Math.max(IN_BORE_TEMP_EMBER_K, Math.min(IN_BORE_TEMP_PEAK_K, colorTempK))
    : IN_BORE_TEMP_EMBER_K;
  if (k <= IN_BORE_TEMP_EXPANSION_K) {
    const t = clamp01(
      (k - IN_BORE_TEMP_EMBER_K) /
        (IN_BORE_TEMP_EXPANSION_K - IN_BORE_TEMP_EMBER_K)
    );
    return out.copy(COL_INBORE_EMBER).lerp(COL_INBORE_ORANGE, t);
  }
  const t = clamp01(
    (k - IN_BORE_TEMP_EXPANSION_K) /
      (IN_BORE_TEMP_PEAK_K - IN_BORE_TEMP_EXPANSION_K)
  );
  return out.copy(COL_INBORE_ORANGE).lerp(COL_INBORE_WHITE_GOLD, t);
}

/**
 * Zero-GC evaluator writing Cycle 15A Boxer primer ignition spark and in-bore
 * propellant deflagration plasma state into `out`.
 * Strictly inactive when `!isCutawayZ`, when `explodeProgress >= 0.04`, when
 * `fireProgress <= 0` or outside ignition/bore-transit/blowdown window, or on
 * unbarreled compound archery (`lift33`, `r500`).
 */
export function writeInBoreDeflagrationSampleInto(
  weaponId: WeaponId,
  fireProgress: number,
  pressureRatio01: number,
  boreTravelRatio01: number,
  isCutawayZ: boolean,
  out: InBoreDeflagrationSample,
  explodeProgress = 0
): InBoreDeflagrationSample {
  out.active = false;
  out.primerFlashIntensity01 = 0;
  out.primerFlashX = 0;
  out.columnActive = false;
  out.columnStartX = 0;
  out.columnEndX = 0;
  out.columnRadiusCm = 0;
  out.columnIntensity01 = 0;
  out.colorTempK = IN_BORE_TEMP_EMBER_K;
  out.chamberX = 0;
  out.muzzleX = 0;
  out.boreY = 0;
  out.boreZ = 0;

  if (
    !isCutawayZ ||
    !Number.isFinite(explodeProgress) ||
    explodeProgress >= RIFLING_EXPLODE_VISIBILITY_MAX ||
    !Number.isFinite(fireProgress) ||
    fireProgress <= 0
  ) {
    return out;
  }

  const bounds = computeRiflingBoreBounds(weaponId);
  if (!bounds) {
    return out;
  }

  const manifest = getWeaponManifest(weaponId);
  const chamberX = Math.min(manifest.workbenchMeta.chamberGlowPos[0], bounds.startX);
  const muzzleX = bounds.endX;
  const columnRadiusCm = bounds.boreRadiusCm * IN_BORE_RADIUS_CLEARANCE_SCALE;
  const caseBackOffset = Math.min(
    bounds.throatLengthCm * 0.45,
    Math.max(0.18, (bounds.startX - chamberX) * 0.35)
  );
  const primerFlashX = chamberX - caseBackOffset;

  out.chamberX = chamberX;
  out.muzzleX = muzzleX;
  out.boreY = bounds.boreY;
  out.boreZ = bounds.boreZ;
  out.columnRadiusCm = columnRadiusCm;
  out.primerFlashX = primerFlashX;
  out.columnStartX = chamberX;
  out.columnEndX = chamberX;

  const timing = getWeaponFiringTiming(weaponId);
  const primerStartF = Math.max(
    0.004,
    timing.ignitionF - IN_BORE_PRIMER_WINDOW_PRE_F
  );
  const primerEndF = timing.ignitionF + IN_BORE_PRIMER_WINDOW_POST_F;
  const blowdownEndF = Math.min(0.95, timing.muzzleExitF + IN_BORE_BLOWDOWN_TAIL_F);

  if (fireProgress < primerStartF || fireProgress > blowdownEndF) {
    return out;
  }

  // 1. Intense crisp white-amber Boxer primer ignition burst at flash-hole onset
  let primerFlashIntensity01 = 0;
  if (fireProgress >= primerStartF && fireProgress <= primerEndF) {
    const primerPeakF = timing.ignitionF + 0.005;
    if (fireProgress <= primerPeakF) {
      primerFlashIntensity01 = smoothstep01(
        primerStartF,
        primerPeakF,
        fireProgress
      );
    } else {
      const decayU = clamp01(
        (fireProgress - primerPeakF) /
          Math.max(0.015, primerEndF - primerPeakF)
      );
      primerFlashIntensity01 = Math.exp(-5.2 * decayU) * (1 - decayU);
    }
  }

  // 2. Incandescent propellant deflagration plasma chasing the bullet base down the sliced rifled bore
  const clampedP = clamp01(Number.isFinite(pressureRatio01) ? pressureRatio01 : 0);
  const clampedTravel = clamp01(
    Number.isFinite(boreTravelRatio01) ? boreTravelRatio01 : 0
  );
  const postExitFade =
    fireProgress <= timing.muzzleExitF
      ? 1
      : Math.pow(
          1 -
            clamp01(
              (fireProgress - timing.muzzleExitF) /
                Math.max(0.03, blowdownEndF - timing.muzzleExitF)
            ),
          1.45
        );

  const columnStartX = chamberX;
  const columnEndX = chamberX + (muzzleX - chamberX) * clampedTravel;
  const colorTempK = Math.round(
    IN_BORE_TEMP_EMBER_K +
      (IN_BORE_TEMP_PEAK_K - IN_BORE_TEMP_EMBER_K) * Math.pow(clampedP, 0.65)
  );
  const columnIntensity01 =
    fireProgress >= timing.ignitionF
      ? clamp01(Math.pow(clampedP, 0.5) * postExitFade)
      : 0;
  const columnActive =
    columnIntensity01 > 0.01 && columnEndX > columnStartX + 1e-4;

  out.primerFlashIntensity01 = primerFlashIntensity01;
  out.columnActive = columnActive;
  out.columnStartX = columnStartX;
  out.columnEndX = columnEndX;
  out.columnIntensity01 = columnActive ? columnIntensity01 : 0;
  out.colorTempK = colorTempK;
  out.active = primerFlashIntensity01 > 0.01 || columnActive;
  return out;
}

/**
 * Pure allocating wrapper for `writeInBoreDeflagrationSampleInto`.
 */
export function computeInBoreDeflagrationSample(
  weaponId: WeaponId,
  fireProgress: number,
  pressureRatio01: number,
  boreTravelRatio01: number,
  isCutawayZ: boolean,
  explodeProgress = 0
): InBoreDeflagrationSample {
  return writeInBoreDeflagrationSampleInto(
    weaponId,
    fireProgress,
    pressureRatio01,
    boreTravelRatio01,
    isCutawayZ,
    createMutableInBoreDeflagrationSample(),
    explodeProgress
  );
}

/**
 * Zero-GC evaluator writing Cycle 19A.1 High-RPM rotary barrel-cluster motion-blur
 * sweep halo state into `out`.
 * Strictly active ONLY for `gau8` & `m134` when `isFiring === true && fireProgress > 0.04`,
 * and strictly inactive at `t = 0`, in `explode` mode (`!isFiring` or `explodeProgress >= 0.04`),
 * during `sectionCut` cutaway (`isCutaway === true`), and on all other 32 exhibits.
 */
export function writeRotaryBlurHaloSampleInto(
  weaponId: WeaponId,
  isFiring: boolean,
  fireProgress: number,
  speedMultiplier: number,
  barrelHeat01: number,
  out: RotaryBlurHaloSample,
  isCutaway = false,
  explodeProgress = 0
): RotaryBlurHaloSample {
  out.active = false;
  out.opacity = 0;
  out.spinRadPerSec = 0;
  out.radiusCm = 0;
  out.lengthCm = 0;
  out.heatTint01 = 0;
  out.centerX = 0;
  out.barrelCount = 0;

  const prof = ROTARY_BLUR_PROFILES[weaponId];
  if (
    !prof ||
    !isFiring ||
    isCutaway ||
    !Number.isFinite(explodeProgress) ||
    explodeProgress >= RIFLING_EXPLODE_VISIBILITY_MAX ||
    !Number.isFinite(fireProgress) ||
    fireProgress <= ROTARY_BLUR_FIRE_THRESHOLD ||
    fireProgress > 1.0001 ||
    !Number.isFinite(speedMultiplier) ||
    speedMultiplier <= 0
  ) {
    return out;
  }

  const clampedSpeed = Math.max(0.05, Math.min(2.5, speedMultiplier));
  const baseOmega = (prof.cyclicRpm / prof.barrelCount) * ((Math.PI * 2) / 60);
  const spinEnvelope =
    0.22 + 0.78 * smoothstep01(ROTARY_BLUR_FIRE_THRESHOLD, 0.16, fireProgress);
  const spinRadPerSec = baseOmega * clampedSpeed * spinEnvelope;

  const speedBlur = Math.pow(clamp01(spinRadPerSec / 62.0), 0.72);
  const opacity = clamp01(
    prof.peakOpacity * (0.18 + 0.82 * speedBlur) * spinEnvelope
  );

  const clampedHeat = Number.isFinite(barrelHeat01) ? clamp01(barrelHeat01) : 0;
  const heatTint01 =
    clampedHeat <= 0.05 ? 0 : smoothstep01(0.05, 0.95, clampedHeat);

  out.active = opacity > 0.004;
  out.opacity = out.active ? opacity : 0;
  out.spinRadPerSec = out.active ? spinRadPerSec : 0;
  out.radiusCm = out.active ? prof.radiusCm : 0;
  out.lengthCm = out.active ? prof.lengthCm : 0;
  out.heatTint01 = out.active ? heatTint01 : 0;
  out.centerX = out.active ? prof.centerX : 0;
  out.barrelCount = out.active ? prof.barrelCount : 0;
  return out;
}

/**
 * Pure allocating wrapper for `writeRotaryBlurHaloSampleInto`.
 */
export function computeRotaryBlurHaloSample(
  weaponId: WeaponId,
  isFiring: boolean,
  fireProgress: number,
  speedMultiplier = 1.0,
  barrelHeat01 = 0,
  isCutaway = false,
  explodeProgress = 0
): RotaryBlurHaloSample {
  return writeRotaryBlurHaloSampleInto(
    weaponId,
    isFiring,
    fireProgress,
    speedMultiplier,
    barrelHeat01,
    createMutableRotaryBlurHaloSample(),
    isCutaway,
    explodeProgress
  );
}

/**
 * Zero-GC evaluator writing Cycle 19A.2 1:1 MBT bore-evacuator / fume-extractor
 * & Tiger I twin-baffle muzzle-brake scavenging smoke plume state into `out`.
 * Strictly active ONLY for the 4 1:1 MBTs (`ztz99a`, `m1a2`, `leopard2a7`, `tiger1`)
 * during the post-exit scavenging window `(0.28..0.78)`; strictly inactive at `t = 0`
 * and on all non-tank exhibits.
 */
export function writeTankBoreEvacuatorSampleInto(
  weaponId: WeaponId,
  isFiring: boolean,
  fireProgress: number,
  out: TankBoreEvacuatorSample,
  explodeProgress = 0
): TankBoreEvacuatorSample {
  const prof = TANK_BORE_EVACUATOR_PROFILES[weaponId];

  out.active = false;
  out.plumeScale = 0;
  out.opacity = 0;
  out.originX = prof ? prof.originX : 0;
  out.originY = prof ? prof.originY : 0;
  out.muzzleX = prof ? prof.muzzleX : 0;
  out.progress01 = 0;
  out.hasTwinBaffleBrake = prof ? prof.hasTwinBaffleBrake : false;
  out.baffleJetStrength01 = 0;

  if (
    !prof ||
    !isFiring ||
    !Number.isFinite(explodeProgress) ||
    explodeProgress >= RIFLING_EXPLODE_VISIBILITY_MAX ||
    !Number.isFinite(fireProgress) ||
    fireProgress <= TANK_BORE_EVACUATOR_START_F ||
    fireProgress >= TANK_BORE_EVACUATOR_END_F
  ) {
    return out;
  }

  const u = clamp01(
    (fireProgress - TANK_BORE_EVACUATOR_START_F) /
      (TANK_BORE_EVACUATOR_END_F - TANK_BORE_EVACUATOR_START_F)
  );
  if (u <= 0 || u >= 1) {
    return out;
  }

  const onset = smoothstep01(0.0, 0.16, u);
  const decay = Math.pow(1 - u, 1.15);
  const opacity = prof.peakOpacity * onset * decay;
  const plumeScale = 0.55 + 1.3 * Math.pow(u, 0.72);
  const baffleJetStrength01 = prof.hasTwinBaffleBrake
    ? smoothstep01(0.0, 0.1, u) * Math.pow(1 - u, 1.45)
    : 0;

  out.active = opacity > 0.004;
  out.plumeScale = out.active ? plumeScale : 0;
  out.opacity = out.active ? opacity : 0;
  out.progress01 = out.active ? u : 0;
  out.baffleJetStrength01 = out.active ? baffleJetStrength01 : 0;
  return out;
}

/**
 * Pure allocating wrapper for `writeTankBoreEvacuatorSampleInto`.
 */
export function computeTankBoreEvacuatorSample(
  weaponId: WeaponId,
  isFiring: boolean,
  fireProgress: number,
  explodeProgress = 0
): TankBoreEvacuatorSample {
  return writeTankBoreEvacuatorSampleInto(
    weaponId,
    isFiring,
    fireProgress,
    createMutableTankBoreEvacuatorSample(),
    explodeProgress
  );
}

const SHOCKWAVE_RING_VERT_GLSL = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHOCKWAVE_RING_FRAG_GLSL = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uProgress;
  uniform float uRingCenter;
  uniform float uRingWidth;
  uniform float uTurbulence;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r >= 0.995) discard;
    float ang = atan(p.y, p.x);

    // Subtle organic supersonic Mach-cone / ground-dust angular break-up
    float jitter =
      sin(ang * 9.0 + uProgress * 4.5) * 0.022 +
      sin(ang * 17.0 - uProgress * 7.2) * 0.014 +
      cos(ang * 25.0 + uProgress * 3.1) * 0.009;
    float rMod = r + jitter * uTurbulence;

    float d = abs(rMod - uRingCenter);
    float band = exp(-pow(d / max(uRingWidth, 0.02), 2.0));
    // Soft trailing wake inside the shock crest
    float wake = smoothstep(uRingCenter - uRingWidth * 3.4, uRingCenter, rMod) *
                 (1.0 - smoothstep(uRingCenter, uRingCenter + uRingWidth * 0.65, rMod)) * 0.34;
    float edgeFade = 1.0 - smoothstep(0.88, 0.99, r);
    float angularMod = 1.0 - uTurbulence * 0.22 * (0.5 + 0.5 * sin(ang * 13.0 - uProgress * 5.0));

    float alpha = clamp((band + wake) * edgeFade * angularMod * uOpacity, 0.0, 0.85);
    if (alpha <= 0.003) discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

const THERMAL_MIRAGE_VERT_GLSL = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const THERMAL_MIRAGE_FRAG_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPhase;
  uniform vec3 uWarmColor;
  uniform vec3 uCoolColor;
  varying vec2 vUv;

  void main() {
    // Smooth horizontal & vertical convective envelope (zero rectangular borders)
    float maskX = smoothstep(0.0, 0.24, vUv.x) * smoothstep(1.0, 0.76, vUv.x);
    float maskY = smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.22, vUv.y);

    // Rising buoyant refractive shear filaments
    float sway = sin(vUv.y * 7.5 - uTime * 3.6 + uPhase) * 0.14 +
                 sin(vUv.y * 13.0 - uTime * 5.4 + uPhase * 1.7) * 0.06;
    float w1 = 0.5 + 0.5 * sin((vUv.x + sway) * 18.0 + uPhase * 2.3);
    float w2 = 0.5 + 0.5 * sin((vUv.x - sway * 0.8) * 29.0 - uTime * 2.2 + uPhase);
    float filaments = pow(clamp(w1 * 0.62 + w2 * 0.38, 0.0, 1.0), 1.65);

    float alpha = maskX * maskY * (0.35 + 0.65 * filaments) * uOpacity;
    if (alpha <= 0.0025) discard;

    vec3 col = mix(uWarmColor, uCoolColor, smoothstep(0.05, 0.72, vUv.y));
    gl_FragColor = vec4(col, alpha);
  }
`;

// Cycle 15A: Incandescent in-bore propellant deflagration plasma column shader
// Cylinder oriented along +X (rotateZ(-PI/2)): vUv.y = 0 at chamber breech -> 1 at bullet base.
const IN_BORE_PLASMA_VERT_GLSL = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vViewNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const IN_BORE_PLASMA_FRAG_GLSL = /* glsl */ `
  uniform vec3 uCoreColor;
  uniform vec3 uEdgeColor;
  uniform float uIntensity;
  uniform float uPressure;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;

  void main() {
    // Center-weighted plasma core with soft edge falloff inside the rifled grooves (no hard tube silhouette)
    float ndotv = abs(dot(normalize(vViewNormal), normalize(vViewDir)));
    float coreProfile = pow(clamp(ndotv, 0.0, 1.0), 0.72);

    // Smooth axial breech & bullet-base caps (strict edge0 < edge1 per GLSL ES spec)
    float breechCap = smoothstep(0.0, 0.08, vUv.y);
    float bulletBaseCap = 1.0 - smoothstep(0.92, 1.0, vUv.y);
    float axialMask = breechCap * bulletBaseCap;

    // Turbulent deflagration gas filaments accelerating from chamber breech (+X) toward bullet base
    float scroll = vUv.y * 11.0 - uTime * 22.0;
    float streakA = 0.5 + 0.5 * sin(scroll + sin(vUv.x * 12.56637) * 1.4);
    float streakB = 0.5 + 0.5 * cos(vUv.y * 19.0 - uTime * 34.0 + vUv.x * 18.84955);
    float turbulence = 0.66 + 0.34 * (streakA * 0.62 + streakB * 0.38);

    // Brightest near chamber throat & bullet-base stagnation compression wave
    float throatHot = 1.0 - smoothstep(0.0, 0.42, vUv.y);
    float baseHot = smoothstep(0.62, 0.94, vUv.y);
    float axialGlow = 0.72 + 0.28 * max(throatHot, baseHot * 0.85);

    float coreMix = clamp(coreProfile * (0.45 + 0.55 * uPressure) * axialGlow, 0.0, 1.0);
    vec3 col = mix(uEdgeColor, uCoreColor, coreMix);
    float alpha = clamp(axialMask * (0.28 + 0.72 * coreProfile) * turbulence * uIntensity * 0.82, 0.0, 0.88);
    if (alpha <= 0.004) discard;

    gl_FragColor = vec4(col * (1.0 + 0.35 * coreMix * uPressure), alpha);
  }
`;

// Cycle 15A: Crisp white-amber Boxer primer flash-hole spark shader
const PRIMER_SPARK_VERT_GLSL = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PRIMER_SPARK_FRAG_GLSL = /* glsl */ `
  uniform vec3 uCoreColor;
  uniform vec3 uHaloColor;
  uniform float uIntensity;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r >= 0.99) discard;

    float ang = atan(p.y, p.x);
    float hotCore = exp(-r * r * 14.0);
    float corona = exp(-r * 3.4) * (1.0 - smoothstep(0.55, 0.98, r));
    // 6-ray incandescent ignition spark star oriented along flash-hole axis
    float rays = pow(abs(cos(ang * 3.0)), 10.0) * exp(-r * 3.2) * (1.0 - smoothstep(0.25, 0.95, r));

    float strength = (hotCore * 1.15 + corona * 0.55 + rays * 0.65) * uIntensity;
    vec3 col = mix(uHaloColor, uCoreColor, clamp(hotCore + rays * 0.5, 0.0, 1.0));
    float alpha = clamp(strength, 0.0, 0.95);
    if (alpha <= 0.005) discard;

    gl_FragColor = vec4(col * (1.0 + 0.45 * hotCore), alpha);
  }
`;

// Cycle 19A.1: High-RPM Rotary Barrel-Cluster Motion-Blur Sweep Halo shader
// Open cylinder oriented along +X (rotateZ(-PI/2)): vUv.x = azimuth [0..1], vUv.y = axial [0..1].
const ROTARY_BLUR_HALO_VERT_GLSL = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vViewNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const ROTARY_BLUR_HALO_FRAG_GLSL = /* glsl */ `
  uniform vec3 uCoolColor;
  uniform vec3 uHighlightColor;
  uniform vec3 uHeatColor;
  uniform float uOpacity;
  uniform float uPhase;
  uniform float uBarrelCount;
  uniform float uBlurFactor;
  uniform float uHeatTint;

  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;

  void main() {
    // Soft axial end-feathering (strict edge0 < edge1 per GLSL ES spec)
    float breechFade = smoothstep(0.0, 0.08, vUv.y);
    float muzzleFade = 1.0 - smoothstep(0.92, 1.0, vUv.y);
    float axialMask = breechFade * muzzleFade;

    // Coaxial tangential streak harmonics locked to 7-barrel (GAU-8) / 6-barrel (M134D) symmetry
    float theta = vUv.x * 6.2831853;
    float spun = theta - uPhase;
    float primaryWave = 0.5 + 0.5 * sin(spun * uBarrelCount);
    float secondHarmonic = 0.5 + 0.5 * sin(spun * uBarrelCount * 2.0 + 0.85);
    float microStreak = 0.5 + 0.5 * sin(spun * uBarrelCount * 5.0 - vUv.y * 6.0);

    float axialRipple = 0.86 + 0.14 * sin(vUv.y * 18.84955);

    // Higher RPM / speedMultiplier smears individual barrel pulses toward a sleek continuous halo
    float streakArticulation = mix(0.62, 0.24, clamp(uBlurFactor, 0.0, 1.0));
    float streakPattern =
      (1.0 - streakArticulation) +
      streakArticulation * (primaryWave * 0.56 + secondHarmonic * 0.28 + microStreak * 0.16);

    // Grazing cylindrical Fresnel rim emphasizes metallic spin envelope while keeping center transparent
    float ndotv = abs(dot(normalize(vViewNormal), normalize(vViewDir)));
    float fresnel = pow(1.0 - clamp(ndotv, 0.0, 1.0), 1.45);
    float silhouetteWeight = 0.34 + 0.66 * fresnel;

    // Subtle dull-cherry thermal glow concentrated along mid-forward heated barrel span
    float thermalAxial = smoothstep(0.14, 0.86, vUv.y);
    float heatMix = clamp(uHeatTint * (0.38 + 0.62 * thermalAxial), 0.0, 1.0);
    vec3 metalCol = mix(uCoolColor, uHighlightColor, clamp(fresnel * 0.7 + microStreak * 0.3, 0.0, 1.0));
    vec3 col = mix(metalCol, uHeatColor, heatMix * 0.78);
    col += uHeatColor * heatMix * (0.28 + 0.32 * primaryWave);

    float alpha = clamp(
      axialMask * axialRipple * streakPattern * silhouetteWeight * uOpacity,
      0.0,
      0.65
    );
    if (alpha <= 0.003) discard;

    gl_FragColor = vec4(col, alpha);
  }
`;

// Cycle 19A.2a: Soft volumetric 1:1 MBT bore-evacuator & muzzle-scavenging residual cordite smoke puff
const TANK_EVAC_PUFF_VERT_GLSL = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vViewNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const TANK_EVAC_PUFF_FRAG_GLSL = /* glsl */ `
  uniform vec3 uWarmColor;
  uniform vec3 uCoolColor;
  uniform float uOpacity;
  uniform float uProgress;
  uniform float uPhase;

  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;

  void main() {
    // Center-weighted volumetric falloff eliminates spherical silhouette edges from every angle
    float ndotv = abs(dot(normalize(vViewNormal), normalize(vViewDir)));
    float softCore = pow(clamp(ndotv, 0.0, 1.0), 1.45);

    // Organic buoyant turbulent smoke billows
    float w1 = 0.5 + 0.5 * sin(vUv.x * 12.56637 + uProgress * 4.2 + uPhase);
    float w2 = 0.5 + 0.5 * cos(vUv.y * 9.42478 - uProgress * 5.6 + uPhase * 1.7);
    float w3 = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 15.70796 - uProgress * 3.8);
    float billow = 0.52 + 0.48 * (w1 * 0.45 + w2 * 0.35 + w3 * 0.20);

    float alpha = clamp(softCore * billow * uOpacity, 0.0, 0.52);
    if (alpha <= 0.003) discard;

    float coolMix = clamp(uProgress * 1.15 + (1.0 - ndotv) * 0.35, 0.0, 1.0);
    vec3 col = mix(uWarmColor, uCoolColor, coolMix);
    gl_FragColor = vec4(col, alpha);
  }
`;

// Cycle 19A.2b: Tiger I 88mm KwK 36 dual-baffle conical muzzle-brake lateral smoke jet shader
const TANK_BAFFLE_JET_VERT_GLSL = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vViewNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const TANK_BAFFLE_JET_FRAG_GLSL = /* glsl */ `
  uniform vec3 uWarmColor;
  uniform vec3 uCoolColor;
  uniform float uOpacity;
  uniform float uProgress;
  uniform float uPhase;

  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;

  void main() {
    // Soft cylindrical volume falloff so lateral smoke plumes blend seamlessly in 3D
    float ndotv = abs(dot(normalize(vViewNormal), normalize(vViewDir)));
    float volEdge = pow(clamp(ndotv, 0.0, 1.0), 0.95);

    // Smooth baffle-port nozzle entry & far dispersion fade (strict edge0 < edge1)
    float portEntry = smoothstep(0.0, 0.14, vUv.y);
    float farFade = 1.0 - smoothstep(0.32, 1.0, vUv.y);
    float axialEnv = portEntry * farFade;

    float theta = vUv.x * 6.2831853;
    float eddyA = 0.5 + 0.5 * sin(vUv.y * 10.5 - uProgress * 9.0 + sin(theta * 3.0 + uPhase));
    float eddyB = 0.5 + 0.5 * cos(vUv.y * 17.0 - uProgress * 13.0 + theta * 2.0 + uPhase * 1.4);
    float smokeTex = 0.56 + 0.44 * (eddyA * 0.62 + eddyB * 0.38);

    float alpha = clamp(volEdge * axialEnv * smokeTex * uOpacity, 0.0, 0.58);
    if (alpha <= 0.003) discard;

    float coolMix = clamp(vUv.y * 0.85 + uProgress * 0.55, 0.0, 1.0);
    vec3 col = mix(uWarmColor, uCoolColor, coolMix);
    gl_FragColor = vec4(col, alpha);
  }
`;

// Module-pooled Zero-GC math & color scratch objects (never allocate in useFrame)
const _sample = createInternalBallisticsSample('556_nato');
const _inBoreSample: InBoreDeflagrationSample =
  createMutableInBoreDeflagrationSample();
const _rotaryBlurSample: RotaryBlurHaloSample =
  createMutableRotaryBlurHaloSample();
const _tankEvacSample: TankBoreEvacuatorSample =
  createMutableTankBoreEvacuatorSample();
const _inBoreCoreColor = new THREE.Color();
const _inBoreEdgeColor = new THREE.Color();
const _shockSample: MuzzleShockwaveSample = {
  active: false,
  radiusCm: 0,
  opacity: 0,
  floorY: 0,
  dustRadiusCm: 0,
  dustOpacity: 0,
  progress01: 0,
  centerOffsetXCm: 0,
};
const _mirageSample: ThermalMirageSample = {
  active: false,
  opacity: 0,
  riseSpeed: 0,
  swayAmplitudeCm: 0,
};
const _upAxis = new THREE.Vector3(0, 1, 0);
const _dirVec = new THREE.Vector3();
const _posVec = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scaleVec = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _hiddenMat4 = new THREE.Matrix4().makeScale(0, 0, 0);
const _colorWork = new THREE.Color();
const _ringAxisZ = new THREE.Quaternion();
const _ringAxisY = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  Math.PI * 0.5
);
const _ringAxisX = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  Math.PI * 0.5
);
const _armAStart = new THREE.Vector3();
const _armAEnd = new THREE.Vector3();
const _armBStart = new THREE.Vector3();
const _armBEnd = new THREE.Vector3();
const _nockVec = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();
const _armChevronPairs: readonly [THREE.Vector3, THREE.Vector3][] = [
  [_armAEnd, _nockVec],
  [_armBEnd, _nockVec],
];

// Calibrated engineering palette (reads cleanly under AgX + half-res Bloom without whiteout)
const COL_PEAK_PLASMA = new THREE.Color('#fde68a');
const COL_HIGH_PRESSURE = new THREE.Color('#f59e0b');
const COL_GAS_TAP_CYAN = new THREE.Color('#22d3ee');
const COL_SAFE_BLOWDOWN = new THREE.Color('#06b6d4');
const COL_SEALED_RING = new THREE.Color('#fbbf24');
const COL_SAFE_UNLOCK = new THREE.Color('#10b981');
const COL_BREECH_WISP_WARM = new THREE.Color('#e2c9a6');
const COL_BREECH_WISP_COOL = new THREE.Color('#b8c4d4');
const COL_SHOCK_WAVE = new THREE.Color('#e8dcc6');
const COL_SHOCK_DUST = new THREE.Color('#a89b86');
const COL_MIRAGE_WARM = new THREE.Color('#f4d6a8');
const COL_MIRAGE_COOL = new THREE.Color('#cbd5e1');
const COL_INBORE_WHITE_GOLD = new THREE.Color('#fff4d2');
const COL_INBORE_ORANGE = new THREE.Color('#fb7a18');
const COL_INBORE_EMBER = new THREE.Color('#b8320a');
const COL_PRIMER_CORE = new THREE.Color('#fffbeb');
const COL_PRIMER_HALO = new THREE.Color('#f59e0b');
const COL_ROTARY_STEEL_COOL = new THREE.Color('#7f90a6');
const COL_ROTARY_STEEL_GLINT = new THREE.Color('#dbe4ef');
const COL_ROTARY_CHERRY_HEAT = new THREE.Color('#c84224');
const COL_TANK_EVAC_WARM = new THREE.Color('#d2c5b0');
const COL_TANK_EVAC_COOL = new THREE.Color('#9aa6b5');

function clamp01(x: number): number {
  if (!(x > 0)) return 0;
  return x > 1 ? 1 : x;
}

/**
 * WP-05 — Dynamic Propellant Gas-Flow & Breech Impulse Visualizer (60fps Zero-GC)
 * -------------------------------------------------------------------------------
 * Synchronized 1:1 with `playbackClock.animatedFireProgress` and `armoryPhysics`:
 *  1. Bore propellant expansion core from chamber breech to live bullet base.
 *  2. Gas-port tap riser, manifold stream tube, piston/BCG expansion pulse & exhaust vent
 *     across long-stroke (`ak15`), Stoner DI (`m4a1`), short-stroke (`scar`, `aug`),
 *     and forward under-barrel (`deagle`) operating systems.
 *  3. Breech-thrust / fluted-chamber / locked-recoil pressure rings for `mp5`, `p90`,
 *     `g17`, `p320`, `m82a1`, and `awm`.
 */
export const GasFlowVisualizer: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const mode = useAppStore((s) => s.mode);
  const gasFlowVisible = useAppStore((s) => s.gasFlowVisible);

  const rootRef = useRef<THREE.Group>(null);
  const gasGroupRef = useRef<THREE.Group>(null);
  const shockwaveGroupRef = useRef<THREE.Group>(null);
  const shockPrimaryRef = useRef<THREE.Mesh>(null);
  const shockDustRef = useRef<THREE.Mesh>(null);
  const mirageGroupRef = useRef<THREE.Group>(null);
  const mirageMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const inBoreGroupRef = useRef<THREE.Group>(null);
  const inBorePlasmaMeshRef = useRef<THREE.Mesh>(null);
  const primerSparkMeshRef = useRef<THREE.Mesh>(null);
  const rotaryBlurGroupRef = useRef<THREE.Group>(null);
  const rotaryBlurOuterRef = useRef<THREE.Mesh>(null);
  const rotaryBlurInnerRef = useRef<THREE.Mesh>(null);
  const rotaryBlurPhaseRef = useRef<number>(0);
  const tankEvacGroupRef = useRef<THREE.Group>(null);
  const tankEvacPuffRefs = useRef<(THREE.Mesh | null)[]>([]);
  const tigerBaffleJetRefs = useRef<(THREE.Mesh | null)[]>([]);
  const boreOuterRef = useRef<THREE.Mesh>(null);
  const boreOuterMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const boreCoreRef = useRef<THREE.Mesh>(null);
  const boreCoreMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const riserMeshRef = useRef<THREE.Mesh>(null);
  const riserMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const riserLeftRef = useRef<THREE.Mesh>(null);
  const riserLeftMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const manifoldTubeRef = useRef<THREE.Mesh>(null);
  const manifoldMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const manifoldLeftRef = useRef<THREE.Mesh>(null);
  const manifoldLeftMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const impulseHeadRef = useRef<THREE.Mesh>(null);
  const impulseHeadMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const impulseLeftRef = useRef<THREE.Mesh>(null);
  const impulseLeftMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const cylinderGapRingRef = useRef<THREE.Mesh>(null);
  const cylinderGapMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const ventPlumeRef = useRef<THREE.Mesh>(null);
  const ventPlumeMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const breechRingRef = useRef<THREE.Mesh>(null);
  const breechRingMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const chevronsRef = useRef<THREE.InstancedMesh>(null);
  const chevronMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // Modular muzzle attachment physical gas-dynamics refs (Zero-GC pre-allocated)
  const suppRingRefs = useRef<(THREE.Mesh | null)[]>([]);
  const suppRingMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const suppExitPlumeRef = useRef<THREE.Mesh>(null);
  const suppExitPlumeMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const brakeJetRefs = useRef<(THREE.Mesh | null)[]>([]);
  const brakeJetMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const fhProngRefs = useRef<(THREE.Mesh | null)[]>([]);
  const fhProngMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const breechWispRefs = useRef<(THREE.Mesh | null)[]>([]);
  const breechWispMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  // Pre-allocated ground-shockwave & hot-barrel thermal mirage materials (explicitly disposed on unmount)
  const shockPrimaryMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHOCKWAVE_RING_VERT_GLSL,
        fragmentShader: SHOCKWAVE_RING_FRAG_GLSL,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: COL_SHOCK_WAVE.clone() },
          uOpacity: { value: 0 },
          uProgress: { value: 0 },
          uRingCenter: { value: 0.84 },
          uRingWidth: { value: 0.065 },
          uTurbulence: { value: 0.72 },
        },
      }),
    []
  );

  const shockDustMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHOCKWAVE_RING_VERT_GLSL,
        fragmentShader: SHOCKWAVE_RING_FRAG_GLSL,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: COL_SHOCK_DUST.clone() },
          uOpacity: { value: 0 },
          uProgress: { value: 0 },
          uRingCenter: { value: 0.72 },
          uRingWidth: { value: 0.14 },
          uTurbulence: { value: 1.0 },
        },
      }),
    []
  );

  const mirageMats = useMemo(
    () =>
      THERMAL_MIRAGE_SLOTS.map(
        (i) =>
          new THREE.ShaderMaterial({
            vertexShader: THERMAL_MIRAGE_VERT_GLSL,
            fragmentShader: THERMAL_MIRAGE_FRAG_GLSL,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
              uTime: { value: 0 },
              uOpacity: { value: 0 },
              uPhase: { value: i * 1.57 + 0.35 },
              uWarmColor: { value: COL_MIRAGE_WARM.clone() },
              uCoolColor: { value: COL_MIRAGE_COOL.clone() },
            },
          })
      ),
    []
  );

  const inBorePlasmaMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: IN_BORE_PLASMA_VERT_GLSL,
        fragmentShader: IN_BORE_PLASMA_FRAG_GLSL,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uCoreColor: { value: COL_INBORE_WHITE_GOLD.clone() },
          uEdgeColor: { value: COL_INBORE_ORANGE.clone() },
          uIntensity: { value: 0 },
          uPressure: { value: 0 },
          uTime: { value: 0 },
        },
      }),
    []
  );

  const primerSparkMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PRIMER_SPARK_VERT_GLSL,
        fragmentShader: PRIMER_SPARK_FRAG_GLSL,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uCoreColor: { value: COL_PRIMER_CORE.clone() },
          uHaloColor: { value: COL_PRIMER_HALO.clone() },
          uIntensity: { value: 0 },
        },
      }),
    []
  );

  // Cycle 19A.1: High-RPM rotary barrel-cluster motion-blur sweep halo materials (explicitly disposed on unmount)
  const rotaryBlurOuterMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ROTARY_BLUR_HALO_VERT_GLSL,
        fragmentShader: ROTARY_BLUR_HALO_FRAG_GLSL,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uCoolColor: { value: COL_ROTARY_STEEL_COOL.clone() },
          uHighlightColor: { value: COL_ROTARY_STEEL_GLINT.clone() },
          uHeatColor: { value: COL_ROTARY_CHERRY_HEAT.clone() },
          uOpacity: { value: 0 },
          uPhase: { value: 0 },
          uBarrelCount: { value: 7 },
          uBlurFactor: { value: 0 },
          uHeatTint: { value: 0 },
        },
      }),
    []
  );

  const rotaryBlurInnerMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ROTARY_BLUR_HALO_VERT_GLSL,
        fragmentShader: ROTARY_BLUR_HALO_FRAG_GLSL,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uCoolColor: { value: COL_ROTARY_STEEL_COOL.clone() },
          uHighlightColor: { value: COL_ROTARY_STEEL_GLINT.clone() },
          uHeatColor: { value: COL_ROTARY_CHERRY_HEAT.clone() },
          uOpacity: { value: 0 },
          uPhase: { value: 0 },
          uBarrelCount: { value: 7 },
          uBlurFactor: { value: 0 },
          uHeatTint: { value: 0 },
        },
      }),
    []
  );

  // Cycle 19A.2: 1:1 MBT bore-evacuator scavenging puffs & Tiger I dual-baffle smoke jets (explicitly disposed)
  const tankEvacPuffMats = useMemo(
    () =>
      TANK_EVAC_PUFF_SLOTS.map(
        (i) =>
          new THREE.ShaderMaterial({
            vertexShader: TANK_EVAC_PUFF_VERT_GLSL,
            fragmentShader: TANK_EVAC_PUFF_FRAG_GLSL,
            transparent: true,
            depthWrite: false,
            side: THREE.FrontSide,
            uniforms: {
              uWarmColor: { value: COL_TANK_EVAC_WARM.clone() },
              uCoolColor: { value: COL_TANK_EVAC_COOL.clone() },
              uOpacity: { value: 0 },
              uProgress: { value: 0 },
              uPhase: { value: i * 1.17 + 0.4 },
            },
          })
      ),
    []
  );

  const tigerBaffleJetMats = useMemo(
    () =>
      TIGER_BAFFLE_JET_SLOTS.map(
        (i) =>
          new THREE.ShaderMaterial({
            vertexShader: TANK_BAFFLE_JET_VERT_GLSL,
            fragmentShader: TANK_BAFFLE_JET_FRAG_GLSL,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
              uWarmColor: { value: COL_TANK_EVAC_WARM.clone() },
              uCoolColor: { value: COL_TANK_EVAC_COOL.clone() },
              uOpacity: { value: 0 },
              uProgress: { value: 0 },
              uPhase: { value: i * 1.43 + 0.25 },
            },
          })
      ),
    []
  );

  useEffect(
    () => () => {
      shockPrimaryMat.dispose();
      shockDustMat.dispose();
      for (let i = 0; i < mirageMats.length; i++) {
        mirageMats[i].dispose();
      }
      inBorePlasmaMat.dispose();
      primerSparkMat.dispose();
      rotaryBlurOuterMat.dispose();
      rotaryBlurInnerMat.dispose();
      for (let i = 0; i < tankEvacPuffMats.length; i++) {
        tankEvacPuffMats[i].dispose();
      }
      for (let i = 0; i < tigerBaffleJetMats.length; i++) {
        tigerBaffleJetMats[i].dispose();
      }
    },
    [
      shockPrimaryMat,
      shockDustMat,
      mirageMats,
      inBorePlasmaMat,
      primerSparkMat,
      rotaryBlurOuterMat,
      rotaryBlurInnerMat,
      tankEvacPuffMats,
      tigerBaffleJetMats,
    ]
  );

  useEffect(() => {
    const inst = chevronsRef.current;
    if (!inst) return;
    for (let i = 0; i < STREAM_CHEVRON_COUNT; i++) {
      inst.setMatrixAt(i, _hiddenMat4);
      inst.setColorAt(i, COL_GAS_TAP_CYAN);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }, [activeWeaponId, mode, gasFlowVisible]);

  useFrame((state, delta) => {
    const root = rootRef.current;
    if (!root) return;

    const appState = useAppStore.getState();
    if (appState.mode !== 'firing' || appState.screen !== 'workbench') {
      root.visible = false;
      return;
    }

    const dt = Math.min(0.05, Math.max(0, delta));

    const weaponId = appState.activeWeaponId;
    const isArchery =
      (weaponId as string) === 'lift33' || (weaponId as string) === 'r500';
    const manifest = getWeaponManifest(weaponId);
    const caliber = manifest.caliberProfile;
    const timing = getWeaponFiringTiming(weaponId);
    const manifold =
      WEAPON_GAS_MANIFOLD_PROFILES[
        weaponId as keyof typeof WEAPON_GAS_MANIFOLD_PROFILES
      ];
    const f = playbackClock.getState().animatedFireProgress;
    const phys = getArmoryPhysicsState();
    const isHeavyPlatform =
      manifest.workbenchMeta.scaleProfile === 'main_battle_tank';

    // --- Cycle 9B.1: Supersonic ground-plane muzzle overpressure shockwave ring + dust wave ---
    writeMuzzleShockwaveSampleInto(weaponId, f, _shockSample);
    const shockVisible = _shockSample.active;
    const shockGroup = shockwaveGroupRef.current;
    if (shockGroup) {
      shockGroup.visible = shockVisible;
      if (shockVisible) {
        const wx = manifold.muzzleX + _shockSample.centerOffsetXCm;
        const wy = _shockSample.floorY + (isHeavyPlatform ? 0.55 : 0.08);

        // Counter-transform ancestor WeaponRecoilGroup so the ground ring stays dead-flat on the floor
        const recoilParent = root.parent?.parent;
        if (
          recoilParent &&
          (recoilParent.rotation.z !== 0 ||
            recoilParent.position.x !== 0 ||
            recoilParent.position.y !== 0)
        ) {
          const th = recoilParent.rotation.z;
          const cosT = Math.cos(th);
          const sinT = Math.sin(th);
          const dx = wx - recoilParent.position.x;
          const dy = wy - recoilParent.position.y;
          shockGroup.position.set(
            dx * cosT + dy * sinT,
            -dx * sinT + dy * cosT,
            0
          );
          shockGroup.rotation.set(0, 0, -th);
        } else {
          shockGroup.position.set(wx, wy, 0);
          shockGroup.rotation.set(0, 0, 0);
        }

        if (shockPrimaryRef.current) {
          shockPrimaryRef.current.scale.set(
            _shockSample.radiusCm,
            _shockSample.radiusCm,
            1
          );
          const pMat = shockPrimaryRef.current.material as THREE.ShaderMaterial;
          pMat.uniforms.uOpacity.value = _shockSample.opacity;
          pMat.uniforms.uProgress.value = _shockSample.progress01;
        }
        if (shockDustRef.current) {
          shockDustRef.current.scale.set(
            _shockSample.dustRadiusCm,
            _shockSample.dustRadiusCm,
            1
          );
          const dMat = shockDustRef.current.material as THREE.ShaderMaterial;
          dMat.uniforms.uOpacity.value = _shockSample.dustOpacity;
          dMat.uniforms.uProgress.value = _shockSample.progress01;
        }
      }
    }

    // --- Cycle 9B.2: Hot-barrel convective thermal mirage shimmer ribbons (barrelHeat01 > 0.22) ---
    writeThermalMirageSampleInto(weaponId, phys.barrelHeat01, _mirageSample);
    const mirageVisible = _mirageSample.active;
    const mirageGroup = mirageGroupRef.current;
    if (mirageGroup) {
      mirageGroup.visible = mirageVisible;
      if (mirageVisible) {
        const boreSpan = Math.max(4.0, manifold.muzzleX - manifold.chamberX);
        const barrelTopY = manifold.boreY + (isHeavyPlatform ? 14.0 : 1.15);
        const ribbonH = isHeavyPlatform ? 64.0 : 4.2;
        const ribbonW = Math.max(
          isHeavyPlatform ? 48.0 : 4.5,
          boreSpan * 0.28
        );
        const elapsed = state.clock.elapsedTime;
        const simTime = elapsed * _mirageSample.riseSpeed;

        for (let i = 0; i < THERMAL_MIRAGE_SLOTS.length; i++) {
          const mMesh = mirageMeshRefs.current[i];
          if (!mMesh) continue;
          const mMat = mMesh.material as THREE.ShaderMaterial;
          const frac = (i + 0.5) / THERMAL_MIRAGE_SLOTS.length;
          const rx = manifold.chamberX + boreSpan * (0.14 + 0.76 * frac);
          const wavePhase = simTime + i * 1.65;
          const bobY = Math.sin(wavePhase) * (isHeavyPlatform ? 5.2 : 0.32);
          const swayZ =
            Math.sin(wavePhase * 0.78 + i * 2.1) *
            _mirageSample.swayAmplitudeCm;
          const yaw =
            (i % 2 === 0 ? 0.28 : -0.28) + Math.sin(wavePhase * 0.45) * 0.07;

          mMesh.position.set(rx, barrelTopY + ribbonH * 0.44 + bobY, swayZ);
          mMesh.rotation.set(0, yaw, 0);
          mMesh.scale.set(ribbonW, ribbonH, 1);

          mMat.uniforms.uTime.value = simTime;
          mMat.uniforms.uOpacity.value =
            _mirageSample.opacity * (0.82 + 0.18 * Math.sin(wavePhase * 1.1));
        }
      }
    }

    // --- Cycle 15A: Matt Rittman In-Bore Propellant Deflagration Glow & Boxer Primer Spark ---
    if (!isArchery) {
      evaluateInternalBallisticsInto(caliber, f, _sample, timing);
    }
    const isCutawayZ = appState.sectionCut && appState.sectionCutAxis === 'z';
    const explodeT = playbackClock.getState().animatedProgress;
    writeInBoreDeflagrationSampleInto(
      weaponId,
      f,
      isArchery ? 0 : _sample.pressure01,
      isArchery ? 0 : _sample.boreTravelRatio,
      isCutawayZ,
      _inBoreSample,
      explodeT
    );
    const inBoreVisible = _inBoreSample.active;
    const inBoreGroup = inBoreGroupRef.current;
    if (inBoreGroup) {
      inBoreGroup.visible = inBoreVisible;
      if (inBoreVisible) {
        const plasmaMesh = inBorePlasmaMeshRef.current;
        if (plasmaMesh) {
          plasmaMesh.visible = _inBoreSample.columnActive;
          if (_inBoreSample.columnActive) {
            const colLen = Math.max(
              0.08,
              _inBoreSample.columnEndX - _inBoreSample.columnStartX
            );
            const colMidX = _inBoreSample.columnStartX + colLen * 0.5;
            const colR = _inBoreSample.columnRadiusCm;
            plasmaMesh.position.set(
              colMidX,
              _inBoreSample.boreY,
              _inBoreSample.boreZ
            );
            plasmaMesh.scale.set(colR, colLen, colR);

            inBoreColorTempToRgbInto(_inBoreSample.colorTempK, _inBoreCoreColor);
            inBoreColorTempToRgbInto(
              Math.max(IN_BORE_TEMP_EMBER_K, _inBoreSample.colorTempK - 750),
              _inBoreEdgeColor
            );
            const pMat = plasmaMesh.material as THREE.ShaderMaterial;
            (pMat.uniforms.uCoreColor.value as THREE.Color).copy(
              _inBoreCoreColor
            );
            (pMat.uniforms.uEdgeColor.value as THREE.Color).copy(
              _inBoreEdgeColor
            );
            pMat.uniforms.uIntensity.value = _inBoreSample.columnIntensity01;
            pMat.uniforms.uPressure.value = clamp01(_sample.pressure01);
            pMat.uniforms.uTime.value = state.clock.elapsedTime;
          }
        }

        const sparkMesh = primerSparkMeshRef.current;
        if (sparkMesh) {
          const sparkIntensity = _inBoreSample.primerFlashIntensity01;
          sparkMesh.visible = sparkIntensity > 0.01;
          if (sparkIntensity > 0.01) {
            const zSide = appState.sectionCutFlip ? -1 : 1;
            const sparkRadius = Math.max(
              _inBoreSample.columnRadiusCm * (1.75 + sparkIntensity * 1.15),
              isHeavyPlatform ? 4.2 : 0.48
            );
            sparkMesh.position.set(
              _inBoreSample.primerFlashX,
              _inBoreSample.boreY,
              _inBoreSample.boreZ + zSide * _inBoreSample.columnRadiusCm * 0.32
            );
            sparkMesh.scale.set(sparkRadius, sparkRadius, 1);
            const sMat = sparkMesh.material as THREE.ShaderMaterial;
            sMat.uniforms.uIntensity.value = sparkIntensity;
          }
        }
      }
    }

    // --- Cycle 19A.1: High-RPM Rotary Barrel-Cluster Motion-Blur Sweep Halo (`gau8` & `m134`) ---
    writeRotaryBlurHaloSampleInto(
      weaponId,
      appState.mode === 'firing',
      f,
      appState.fireSpeedMultiplier,
      phys.barrelHeat01,
      _rotaryBlurSample,
      appState.sectionCut,
      explodeT
    );
    const rotaryBlurVisible = _rotaryBlurSample.active;
    const rotaryBlurGroup = rotaryBlurGroupRef.current;
    if (rotaryBlurGroup) {
      rotaryBlurGroup.visible = rotaryBlurVisible;
      if (rotaryBlurVisible) {
        if (appState.isFiringPlaying) {
          rotaryBlurPhaseRef.current =
            (rotaryBlurPhaseRef.current + _rotaryBlurSample.spinRadPerSec * dt) %
            (Math.PI * 200);
        } else {
          rotaryBlurPhaseRef.current = f * Math.PI * 2;
        }
        const blurFactor = clamp01(_rotaryBlurSample.spinRadPerSec / 62.0);
        const outerMesh = rotaryBlurOuterRef.current;
        if (outerMesh) {
          outerMesh.position.set(_rotaryBlurSample.centerX, 0, 0);
          outerMesh.scale.set(
            _rotaryBlurSample.radiusCm,
            _rotaryBlurSample.lengthCm,
            _rotaryBlurSample.radiusCm
          );
          const oMat = outerMesh.material as THREE.ShaderMaterial;
          oMat.uniforms.uOpacity.value = _rotaryBlurSample.opacity;
          oMat.uniforms.uPhase.value = rotaryBlurPhaseRef.current;
          oMat.uniforms.uBarrelCount.value = _rotaryBlurSample.barrelCount;
          oMat.uniforms.uBlurFactor.value = blurFactor;
          oMat.uniforms.uHeatTint.value = _rotaryBlurSample.heatTint01;
        }
        const innerMesh = rotaryBlurInnerRef.current;
        if (innerMesh) {
          const innerR = _rotaryBlurSample.radiusCm * 0.72;
          innerMesh.position.set(_rotaryBlurSample.centerX, 0, 0);
          innerMesh.scale.set(innerR, _rotaryBlurSample.lengthCm * 0.96, innerR);
          const iMat = innerMesh.material as THREE.ShaderMaterial;
          iMat.uniforms.uOpacity.value = _rotaryBlurSample.opacity * 0.52;
          iMat.uniforms.uPhase.value = rotaryBlurPhaseRef.current + 0.35;
          iMat.uniforms.uBarrelCount.value = _rotaryBlurSample.barrelCount;
          iMat.uniforms.uBlurFactor.value = blurFactor;
          iMat.uniforms.uHeatTint.value = _rotaryBlurSample.heatTint01;
        }
      }
    }

    // --- Cycle 19A.2: 1:1 MBT Bore-Evacuator / Fume-Extractor & Tiger I Twin-Baffle Vent Plume ---
    writeTankBoreEvacuatorSampleInto(
      weaponId,
      appState.mode === 'firing',
      f,
      _tankEvacSample,
      explodeT
    );
    const tankEvacVisible = _tankEvacSample.active;
    const tankEvacGroup = tankEvacGroupRef.current;
    if (tankEvacGroup) {
      tankEvacGroup.visible = tankEvacVisible;
      if (tankEvacVisible) {
        const tankProf = TANK_BORE_EVACUATOR_PROFILES[weaponId];
        let barrelRecoilDx = 0;
        if (tankProf) {
          const loadedPlugin = getLoadedWeaponPlugin(weaponId);
          if (loadedPlugin) {
            const kd = loadedPlugin.computeFiringKinematics(
              tankProf.mainGunPartId,
              f
            );
            if (kd.pos) {
              barrelRecoilDx = kd.pos[0];
            }
          }
        }

        const u = _tankEvacSample.progress01;
        const evacR = tankProf ? tankProf.evacRadiusCm : 14.0;
        const evacOriginX = _tankEvacSample.originX + barrelRecoilDx;
        const muzzleOriginX = _tankEvacSample.muzzleX + barrelRecoilDx;
        const boreY = _tankEvacSample.originY;

        for (let i = 0; i < TANK_EVAC_PUFF_SLOTS.length; i++) {
          const pMesh = tankEvacPuffRefs.current[i];
          if (!pMesh) continue;
          const isMuzzleLobe = i >= 3;
          const localIdx = isMuzzleLobe ? i - 3 : i;
          const delay = localIdx * 0.08 + (isMuzzleLobe ? 0.04 : 0);
          const uSlot = clamp01((u - delay) / Math.max(0.25, 1 - delay));
          const slotEnv = smoothstep01(0, 0.14, uSlot) * (1 - uSlot * 0.55);
          const showPuff = uSlot > 0.005 && slotEnv > 0.01;
          pMesh.visible = showPuff;
          if (!showPuff) continue;

          const zSign = localIdx === 1 ? -1 : localIdx === 2 ? 1 : 0;
          if (isMuzzleLobe) {
            // Trailing residual scavenging smoke drifting out of 120/125/88mm muzzle crown
            const fwdX = 16 + uSlot * (96 + localIdx * 16);
            const liftY = 8 + uSlot * (62 + localIdx * 14);
            const spreadZ = zSign * (7 + uSlot * 24);
            const rad = (13 + 26 * _tankEvacSample.plumeScale) * (0.85 + localIdx * 0.12);
            pMesh.position.set(muzzleOriginX + fwdX, boreY + liftY, spreadZ);
            pMesh.scale.set(rad * 1.32, rad * 0.96, rad * 1.05);
            pMesh.rotation.set(localIdx * 0.7, uSlot * 0.8, 0.22);
          } else {
            // Subtle pressurized scavenging wisps curling above & forward from bore evacuator / brake collar
            const fwdX = 6 + uSlot * (44 + localIdx * 10);
            const liftY = evacR * 0.78 + 8 + uSlot * (48 + localIdx * 11);
            const spreadZ = zSign * (evacR * 0.45 + uSlot * 16);
            const rad = (10 + 18 * _tankEvacSample.plumeScale) * (0.82 + localIdx * 0.1);
            pMesh.position.set(evacOriginX + fwdX, boreY + liftY, spreadZ);
            pMesh.scale.set(rad * 1.24, rad * 0.94, rad);
            pMesh.rotation.set(localIdx * 0.9, -uSlot * 0.7, -0.18);
          }
          const pMat = pMesh.material as THREE.ShaderMaterial;
          pMat.uniforms.uOpacity.value =
            _tankEvacSample.opacity *
            slotEnv *
            (isMuzzleLobe ? 0.92 : 0.62) *
            (1 - localIdx * 0.14);
          pMat.uniforms.uProgress.value = uSlot;
        }

        // Tiger I iconic Krupp dual-baffle conical muzzle-brake lateral smoke jets (±Z × rear/front baffles)
        const showTigerJets =
          Boolean(tankProf?.hasTwinBaffleBrake) &&
          _tankEvacSample.baffleJetStrength01 > 0.008;
        for (let i = 0; i < TIGER_BAFFLE_JET_SLOTS.length; i++) {
          const jMesh = tigerBaffleJetRefs.current[i];
          if (!jMesh) continue;
          if (!showTigerJets || !tankProf) {
            jMesh.visible = false;
            continue;
          }
          const isRearBaffle = i < 2;
          const zSide = i % 2 === 0 ? 1 : -1;
          const portX =
            (isRearBaffle ? tankProf.rearBaffleX : tankProf.frontBaffleX) +
            barrelRecoilDx;
          const portZ = zSide * tankProf.evacRadiusCm;
          const backSweep = isRearBaffle ? -0.37 : -0.24;
          const liftBias = (isRearBaffle ? 0.14 : 0.12) + 0.34 * u;
          const sideBias = isRearBaffle ? 0.91 : 0.96;

          _dirVec.set(backSweep, liftBias, zSide * sideBias).normalize();
          _quat.setFromUnitVectors(_upAxis, _dirVec);

          const baffleGain = isRearBaffle ? 1.0 : 0.84;
          const jetLen =
            (42 + 74 * u) *
            baffleGain *
            (0.62 + 0.42 * _tankEvacSample.plumeScale);
          const jetRad = (10.5 + 22 * u) * (isRearBaffle ? 1.0 : 0.88);

          jMesh.visible = true;
          jMesh.position.set(
            portX + _dirVec.x * (jetLen * 0.5),
            boreY + _dirVec.y * (jetLen * 0.5),
            portZ + _dirVec.z * (jetLen * 0.5)
          );
          jMesh.quaternion.copy(_quat);
          jMesh.scale.set(jetRad, jetLen, jetRad);

          const jMat = jMesh.material as THREE.ShaderMaterial;
          jMat.uniforms.uOpacity.value =
            _tankEvacSample.baffleJetStrength01 * 0.44 * baffleGain;
          jMat.uniforms.uProgress.value = u;
        }
      }
    }

    const gasGroup = gasGroupRef.current;
    if (!appState.gasFlowVisible) {
      if (gasGroup) gasGroup.visible = false;
      root.visible =
        shockVisible ||
        mirageVisible ||
        inBoreVisible ||
        rotaryBlurVisible ||
        tankEvacVisible;
      return;
    }

    if (isArchery) {
      const isBow = (weaponId as string) === 'lift33';
      const exitF = isBow ? 0.5 : 0.48;
      if (f < 0.015 || f > 0.66) {
        if (gasGroup) gasGroup.visible = false;
        root.visible = false;
        return;
      }
      if (gasGroup) gasGroup.visible = true;
      root.visible = true;

      // Elastic draw displacement & kinetic release ratio
      const releaseF = 0.32;
      let strain01: number;
      let nockX: number;
      const boreY = isBow ? 2.4 : 1.8;
      if (f < 0.24) {
        const u = clamp01((f - 0.015) / 0.225);
        strain01 = u;
        nockX = isBow ? -16.5 - 27.5 * u : 14.0 - 36.0 * u;
      } else if (f < releaseF) {
        strain01 = 1;
        nockX = isBow ? -44.0 : -22.0;
      } else if (f <= exitF) {
        const u = clamp01((f - releaseF) / Math.max(0.01, exitF - releaseF));
        strain01 = 1 - u;
        nockX = isBow ? -44.0 + 27.5 * u : -22.0 + 36.0 * u;
      } else {
        strain01 = Math.max(0, 1 - clamp01((f - exitF) / 0.14)) * 0.25;
        nockX = isBow ? -16.5 : 14.0;
      }

      const isPowerStroke = f >= releaseF && f <= 0.62;
      const releaseFade =
        f <= exitF ? 1 : 1 - clamp01((f - exitF) / Math.max(0.02, 0.66 - exitF));
      const beamAlpha = isPowerStroke
        ? clamp01(0.86 * releaseFade)
        : clamp01(0.28 + 0.56 * strain01);

      if (isBow) {
        _armAStart.set(-1.4, 32.4, 0);
        _armAEnd.set(-12.6 - 2.4 * strain01, 41.5 - 2.1 * strain01, 0);
        _armBStart.set(-1.4, -32.4, 0);
        _armBEnd.set(-12.6 - 2.4 * strain01, -41.5 + 2.1 * strain01, 0);
      } else {
        const cockZ = 9.65 - 5.0 * strain01;
        _armAStart.set(26.2, 1.8, 2.4);
        _armAEnd.set(25.2 - 1.8 * strain01, 1.8, cockZ);
        _armBStart.set(26.2, 1.8, -2.4);
        _armBEnd.set(25.2 - 1.8 * strain01, 1.8, -cockZ);
      }
      _nockVec.set(nockX, boreY, 0);

      _colorWork
        .copy(COL_GAS_TAP_CYAN)
        .lerp(COL_HIGH_PRESSURE, clamp01(strain01 * 0.9))
        .lerp(COL_SAFE_UNLOCK, isPowerStroke ? 0.45 : 0);

      // Upper / right & lower / left limb strain beams
      if (riserMeshRef.current && riserMatRef.current) {
        _tmpVec.subVectors(_armAEnd, _armAStart);
        const lenA = _tmpVec.length();
        riserMeshRef.current.visible = beamAlpha > 0.03 && lenA > 0.2;
        riserMeshRef.current.position.addVectors(_armAStart, _armAEnd).multiplyScalar(0.5);
        _dirVec.copy(_tmpVec).normalize();
        _quat.setFromUnitVectors(_upAxis, _dirVec);
        riserMeshRef.current.quaternion.copy(_quat);
        const radA = 0.22 + 0.16 * strain01;
        riserMeshRef.current.scale.set(radA, lenA, radA);
        riserMatRef.current.color.copy(_colorWork);
        riserMatRef.current.opacity = beamAlpha * 0.62;
      }
      if (manifoldTubeRef.current && manifoldMatRef.current) {
        _tmpVec.subVectors(_armBEnd, _armBStart);
        const lenB = _tmpVec.length();
        manifoldTubeRef.current.visible = beamAlpha > 0.03 && lenB > 0.2;
        manifoldTubeRef.current.position
          .addVectors(_armBStart, _armBEnd)
          .multiplyScalar(0.5);
        _dirVec.copy(_tmpVec).normalize();
        _quat.setFromUnitVectors(_upAxis, _dirVec);
        manifoldTubeRef.current.quaternion.copy(_quat);
        const radB = 0.22 + 0.16 * strain01;
        manifoldTubeRef.current.scale.set(radB, lenB, radB);
        manifoldMatRef.current.color.copy(_colorWork);
        manifoldMatRef.current.opacity = beamAlpha * 0.62;
      }

      // Kinetic forward power-stroke / draw thrust beam along arrow/bolt trajectory
      const frontX = isPowerStroke
        ? nockX + Math.max(8, (isBow ? 52 : 60) * clamp01((f - releaseF) / 0.22))
        : isBow
          ? 24.0
          : 26.0;
      const beamSpan = Math.max(1.0, frontX - nockX);
      if (boreOuterRef.current && boreOuterMatRef.current) {
        boreOuterRef.current.visible = isPowerStroke && beamAlpha > 0.03;
        boreOuterRef.current.position.set(nockX + beamSpan * 0.5, boreY, 0);
        boreOuterRef.current.scale.set(0.28, beamSpan, 0.28);
        boreOuterMatRef.current.color.copy(
          isPowerStroke ? COL_SAFE_UNLOCK : COL_GAS_TAP_CYAN
        );
        boreOuterMatRef.current.opacity = beamAlpha * 0.42;
      }
      if (boreCoreRef.current && boreCoreMatRef.current) {
        boreCoreRef.current.visible = isPowerStroke && beamAlpha > 0.03;
        boreCoreRef.current.position.set(nockX + beamSpan * 0.5, boreY, 0);
        boreCoreRef.current.scale.set(0.13, beamSpan, 0.13);
        boreCoreMatRef.current.color
          .copy(COL_SAFE_UNLOCK)
          .lerp(COL_PEAK_PLASMA, 0.45);
        boreCoreMatRef.current.opacity = beamAlpha * 0.72;
      }

      // Twin Cam Torque Rings on upper/lower or right/left cams
      const camScale = (isBow ? 2.4 : 2.1) * (0.78 + 0.35 * strain01);
      if (breechRingRef.current && breechRingMatRef.current) {
        breechRingRef.current.visible = beamAlpha > 0.03;
        breechRingRef.current.position.copy(_armAEnd);
        breechRingRef.current.quaternion.copy(isBow ? _ringAxisZ : _ringAxisY);
        breechRingRef.current.scale.set(camScale, camScale, camScale);
        breechRingMatRef.current.color.copy(_colorWork);
        breechRingMatRef.current.opacity = beamAlpha * 0.78;
      }
      if (impulseHeadRef.current && impulseHeadMatRef.current) {
        impulseHeadRef.current.visible = beamAlpha > 0.03;
        impulseHeadRef.current.position.copy(_armBEnd);
        impulseHeadRef.current.quaternion.copy(isBow ? _ringAxisZ : _ringAxisY);
        impulseHeadRef.current.scale.set(camScale, camScale, camScale);
        impulseHeadMatRef.current.color.copy(_colorWork);
        impulseHeadMatRef.current.opacity = beamAlpha * 0.78;
      }
      if (ventPlumeRef.current) {
        ventPlumeRef.current.visible = false;
      }
      if (riserLeftRef.current) riserLeftRef.current.visible = false;
      if (manifoldLeftRef.current) manifoldLeftRef.current.visible = false;
      if (impulseLeftRef.current) impulseLeftRef.current.visible = false;
      if (cylinderGapRingRef.current) cylinderGapRingRef.current.visible = false;
      for (let i = 0; i < SUPP_VORTEX_SLOTS.length; i++) {
        const sr = suppRingRefs.current[i];
        if (sr) sr.visible = false;
      }
      if (suppExitPlumeRef.current) suppExitPlumeRef.current.visible = false;
      for (let i = 0; i < BRAKE_JET_SLOTS.length; i++) {
        const bj = brakeJetRefs.current[i];
        if (bj) bj.visible = false;
      }
      for (let i = 0; i < FH_PRONG_SLOTS.length; i++) {
        const fp = fhProngRefs.current[i];
        if (fp) fp.visible = false;
      }
      for (let i = 0; i < BREECH_WISP_SLOTS.length; i++) {
        const bw = breechWispRefs.current[i];
        if (bw) bw.visible = false;
      }

      // Animated elastic strain chevrons: cams -> nock -> +X arrow launch trajectory
      const inst = chevronsRef.current;
      if (!inst) return;
      const phaseScroll = (state.clock.elapsedTime * 2.8) % 1;
      let cursor = 0;

      // 3 chevrons along Arm A cam -> nock + 3 along Arm B cam -> nock (module-pooled Zero-GC)
      for (let p = 0; p < _armChevronPairs.length; p++) {
        const from = isPowerStroke ? _armChevronPairs[p][0] : _armChevronPairs[p][1];
        const to = isPowerStroke ? _armChevronPairs[p][1] : _armChevronPairs[p][0];
        _dirVec.subVectors(to, from);
        const segLen = _dirVec.length();
        if (segLen > 0.25) {
          _dirVec.divideScalar(segLen);
          _quat.setFromUnitVectors(_upAxis, _dirVec);
        }
        for (let i = 0; i < 3 && cursor < STREAM_CHEVRON_COUNT; i++) {
          const u = ((i + phaseScroll) / 3) % 1;
          _posVec.lerpVectors(from, to, u);
          const s = 0.85 + 0.25 * Math.sin(u * Math.PI);
          _scaleVec.set(s, s, s);
          _mat4.compose(_posVec, _quat, _scaleVec);
          inst.setMatrixAt(cursor, _mat4);
          inst.setColorAt(cursor, _colorWork);
          cursor++;
        }
      }

      // 10 chevrons along +X arrow/bolt acceleration corridor during power-stroke (or pullback on draw)
      _dirVec.set(isPowerStroke ? 1 : -1, 0, 0);
      _quat.setFromUnitVectors(_upAxis, _dirVec);
      for (let i = 0; i < 8 && cursor < STREAM_CHEVRON_COUNT; i++) {
        const u = ((i + phaseScroll) / 8) % 1;
        if (isPowerStroke) {
          _posVec.set(nockX + beamSpan * u, boreY, 0);
          const s = 0.9 + 0.35 * Math.sin(u * Math.PI);
          _scaleVec.set(s, s, s);
          _mat4.compose(_posVec, _quat, _scaleVec);
          inst.setMatrixAt(cursor, _mat4);
          inst.setColorAt(cursor, COL_SAFE_UNLOCK);
        } else if (strain01 > 0.04) {
          const braceX = isBow ? -16.5 : 14.0;
          _posVec.set(braceX + (nockX - braceX) * u, boreY, 0);
          _scaleVec.set(0.82, 0.82, 0.82);
          _mat4.compose(_posVec, _quat, _scaleVec);
          inst.setMatrixAt(cursor, _mat4);
          inst.setColorAt(cursor, COL_GAS_TAP_CYAN);
        } else {
          inst.setMatrixAt(cursor, _hiddenMat4);
        }
        cursor++;
      }

      while (cursor < STREAM_CHEVRON_COUNT) {
        inst.setMatrixAt(cursor, _hiddenMat4);
        cursor++;
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      if (chevronMatRef.current) {
        chevronMatRef.current.opacity = beamAlpha * 0.9;
      }
      return;
    }

    // Restore firearm default orientation for riserMesh, manifoldTube, breechRing & impulseHead
    if (riserMeshRef.current) riserMeshRef.current.quaternion.identity();
    if (manifoldTubeRef.current)
      manifoldTubeRef.current.rotation.set(0, 0, -Math.PI * 0.5);
    if (breechRingRef.current)
      breechRingRef.current.quaternion.copy(_ringAxisX);
    if (impulseHeadRef.current)
      impulseHeadRef.current.quaternion.copy(_ringAxisX);

    const blowdownEndF = Math.min(0.95, _sample.safeUnlockF + 0.11);
    if (f < timing.ignitionF || f > blowdownEndF) {
      if (gasGroup) gasGroup.visible = false;
      root.visible =
        shockVisible ||
        mirageVisible ||
        inBoreVisible ||
        rotaryBlurVisible ||
        tankEvacVisible;
      return;
    }
    if (gasGroup) gasGroup.visible = true;
    root.visible = true;

    const isTank = manifest.workbenchMeta.scaleProfile === 'main_battle_tank';
    const boreRadius =
      caliber === '125mm_apfsds'
        ? 5.6
        : caliber === '120mm_apfsds'
          ? 5.4
          : caliber === '88mm_pzgr39'
            ? 4.0
            : caliber === '12_gauge'
              ? 0.42
              : caliber === '50_bmg' || caliber === '50_ae'
                ? 0.34
                : caliber === '45_acp'
                  ? 0.31
                  : caliber === '9x39_subsonic'
                    ? 0.27
                    : caliber === '338_lapua' ||
                        caliber === '30_06' ||
                        caliber === '762_nato' ||
                        caliber === '762_m43' ||
                        caliber === '357_magnum' ||
                        caliber === '9mm_para'
                      ? 0.25
                      : caliber === '473_caseless'
                        ? 0.17
                        : 0.2;

    // 1. Bore propellant column (chamberX -> live projectile base)
    const boreSpan = Math.max(1.0, manifold.muzzleX - manifold.chamberX);
    const liveTravel = Math.max(0.035, _sample.boreTravelRatio);
    const liveLen = boreSpan * liveTravel;
    const boreMidX = manifold.chamberX + liveLen * 0.5;

    const pNorm = clamp01(_sample.pressure01);
    const postExitFade =
      f <= timing.muzzleExitF
        ? 1
        : 1 - clamp01((f - timing.muzzleExitF) / Math.max(0.03, blowdownEndF - timing.muzzleExitF));
    const boreAlpha = clamp01(Math.pow(pNorm, 0.42) * 0.72 * postExitFade);

    _colorWork
      .copy(COL_SAFE_BLOWDOWN)
      .lerp(COL_HIGH_PRESSURE, clamp01(pNorm * 1.6))
      .lerp(COL_PEAK_PLASMA, clamp01((pNorm - 0.55) * 2.2));

    const legacyBoreMix = _inBoreSample.columnActive ? 0.24 : 1.0;
    if (boreOuterRef.current && boreOuterMatRef.current) {
      boreOuterRef.current.visible = boreAlpha > 0.015;
      boreOuterRef.current.position.set(boreMidX, manifold.boreY, 0);
      boreOuterRef.current.scale.set(boreRadius, liveLen, boreRadius);
      boreOuterMatRef.current.color.copy(_colorWork);
      boreOuterMatRef.current.opacity = boreAlpha * 0.52 * legacyBoreMix;
    }
    if (boreCoreRef.current && boreCoreMatRef.current) {
      boreCoreRef.current.visible = boreAlpha > 0.02;
      boreCoreRef.current.position.set(boreMidX, manifold.boreY, 0);
      boreCoreRef.current.scale.set(
        boreRadius * 0.46,
        liveLen,
        boreRadius * 0.46
      );
      boreCoreMatRef.current.color
        .copy(_colorWork)
        .lerp(COL_PEAK_PLASMA, 0.55);
      boreCoreMatRef.current.opacity =
        Math.min(0.82, boreAlpha * 0.88) * legacyBoreMix;
    }

    // 2. Gas-tap riser, manifold channel & carrier/piston impulse glow
    const uncoverF = computeGasPortUncoverF(caliber, timing);
    const hasActiveTap =
      manifold.hasGasTap &&
      manifold.gasPortX !== null &&
      uncoverF !== null &&
      f >= uncoverF;

    let gasWave01 = 0;
    let gasAlpha = 0;
    if (hasActiveTap && uncoverF !== null) {
      const fillSpan = Math.max(0.028, timing.muzzleExitF + 0.035 - uncoverF);
      gasWave01 = clamp01((f - uncoverF) / fillSpan);
      const decayStart = timing.muzzleExitF + 0.015;
      const decay =
        f <= decayStart
          ? 1
          : 1 - clamp01((f - decayStart) / Math.max(0.04, blowdownEndF - decayStart));
      gasAlpha = clamp01((0.35 + 0.65 * Math.sqrt(pNorm)) * decay);
    }

    const isTwinArgo = manifold.family === 'dual_short_stroke_argo';
    const isRevolverGap = manifold.family === 'revolver_ratchet_index';

    if (riserMeshRef.current && riserMatRef.current) {
      if (hasActiveTap && manifold.gasPortX !== null && gasAlpha > 0.02) {
        const dy = manifold.gasChannelY - manifold.boreY;
        const dz = manifold.gasChannelZ;
        const riserLen = Math.max(0.18, Math.hypot(dy, dz));
        _dirVec.set(0, dy, dz).normalize();
        _quat.setFromUnitVectors(_upAxis, _dirVec);
        riserMeshRef.current.visible = true;
        riserMeshRef.current.position.set(
          manifold.gasPortX,
          manifold.boreY + dy * 0.5,
          dz * 0.5
        );
        riserMeshRef.current.quaternion.copy(_quat);
        riserMeshRef.current.scale.set(0.14, riserLen, 0.14);
        riserMatRef.current.color
          .copy(COL_GAS_TAP_CYAN)
          .lerp(COL_HIGH_PRESSURE, clamp01(pNorm * 1.1));
        riserMatRef.current.opacity = gasAlpha * 0.76;

        if (riserLeftRef.current && riserLeftMatRef.current) {
          if (isTwinArgo) {
            _dirVec.set(0, dy, -dz).normalize();
            _quat.setFromUnitVectors(_upAxis, _dirVec);
            riserLeftRef.current.visible = true;
            riserLeftRef.current.position.set(
              manifold.gasPortX,
              manifold.boreY + dy * 0.5,
              -dz * 0.5
            );
            riserLeftRef.current.quaternion.copy(_quat);
            riserLeftRef.current.scale.set(0.14, riserLen, 0.14);
            riserLeftMatRef.current.color.copy(riserMatRef.current.color);
            riserLeftMatRef.current.opacity = riserMatRef.current.opacity;
          } else {
            riserLeftRef.current.visible = false;
          }
        }
      } else {
        riserMeshRef.current.visible = false;
        if (riserLeftRef.current) riserLeftRef.current.visible = false;
      }
    }

    let liveFrontX = manifold.gasPortX ?? manifold.chamberX;
    if (manifoldTubeRef.current && manifoldMatRef.current) {
      if (hasActiveTap && manifold.gasPortX !== null && gasAlpha > 0.02) {
        const portX = manifold.gasPortX;
        const fullDx = manifold.gasTargetX - portX;
        liveFrontX = portX + fullDx * Math.max(0.08, gasWave01);
        const segLen = Math.max(0.2, Math.abs(liveFrontX - portX));
        const midX = (portX + liveFrontX) * 0.5;
        const tubeRadius =
          manifold.family === 'direct_impingement'
            ? 0.11
            : manifold.family === 'muzzle_long_stroke_piston'
              ? 0.22
              : 0.17;

        manifoldTubeRef.current.visible = true;
        manifoldTubeRef.current.position.set(
          midX,
          manifold.gasChannelY,
          manifold.gasChannelZ
        );
        manifoldTubeRef.current.scale.set(tubeRadius, segLen, tubeRadius);
        manifoldMatRef.current.color
          .copy(COL_GAS_TAP_CYAN)
          .lerp(COL_PEAK_PLASMA, clamp01(pNorm * 0.85));
        manifoldMatRef.current.opacity = gasAlpha * 0.68;

        if (manifoldLeftRef.current && manifoldLeftMatRef.current) {
          if (isTwinArgo) {
            manifoldLeftRef.current.visible = true;
            manifoldLeftRef.current.position.set(
              midX,
              manifold.gasChannelY,
              -manifold.gasChannelZ
            );
            manifoldLeftRef.current.scale.set(tubeRadius, segLen, tubeRadius);
            manifoldLeftMatRef.current.color.copy(manifoldMatRef.current.color);
            manifoldLeftMatRef.current.opacity = manifoldMatRef.current.opacity;
          } else {
            manifoldLeftRef.current.visible = false;
          }
        }
      } else {
        manifoldTubeRef.current.visible = false;
        if (manifoldLeftRef.current) manifoldLeftRef.current.visible = false;
      }
    }

    if (impulseHeadRef.current && impulseHeadMatRef.current) {
      if (hasActiveTap && gasWave01 > 0.25 && gasAlpha > 0.02) {
        const pulseR =
          manifold.family === 'direct_impingement'
            ? 0.34 + 0.14 * gasWave01
            : 0.28 + 0.1 * gasWave01;
        impulseHeadRef.current.visible = true;
        impulseHeadRef.current.position.set(
          liveFrontX,
          manifold.gasChannelY,
          manifold.gasChannelZ
        );
        impulseHeadRef.current.scale.set(pulseR, pulseR, pulseR * 1.35);
        impulseHeadMatRef.current.color
          .copy(COL_GAS_TAP_CYAN)
          .lerp(COL_HIGH_PRESSURE, clamp01(pNorm));
        impulseHeadMatRef.current.opacity = gasAlpha * 0.72;

        if (impulseLeftRef.current && impulseLeftMatRef.current) {
          if (isTwinArgo) {
            impulseLeftRef.current.visible = true;
            impulseLeftRef.current.quaternion.copy(_ringAxisX);
            impulseLeftRef.current.position.set(
              liveFrontX,
              manifold.gasChannelY,
              -manifold.gasChannelZ
            );
            impulseLeftRef.current.scale.set(pulseR, pulseR, pulseR * 1.35);
            impulseLeftMatRef.current.color.copy(impulseHeadMatRef.current.color);
            impulseLeftMatRef.current.opacity = impulseHeadMatRef.current.opacity;
          } else {
            impulseLeftRef.current.visible = false;
          }
        }
      } else {
        impulseHeadRef.current.visible = false;
        if (impulseLeftRef.current) impulseLeftRef.current.visible = false;
      }
    }

    // Revolver forcing-cone 360° cylinder-gap flash ring (Python X=2.20) OR VSS integral baffle radial bleed expansion (X=31.0)
    const isVssBaffleBleed = manifold.family === 'integral_suppressed_piston';
    if (cylinderGapRingRef.current && cylinderGapMatRef.current) {
      if (isRevolverGap && liveTravel >= 0.1 && boreAlpha > 0.03) {
        const gapPulse = Math.sin(clamp01((liveTravel - 0.1) / 0.88) * Math.PI);
        const gapScale = 0.52 + 0.78 * gapPulse;
        cylinderGapRingRef.current.visible = gapPulse > 0.02;
        cylinderGapRingRef.current.position.set(2.2, manifold.boreY, 0);
        cylinderGapRingRef.current.quaternion.copy(_ringAxisX);
        cylinderGapRingRef.current.scale.set(gapScale, gapScale, gapScale * 0.55);
        cylinderGapMatRef.current.color
          .copy(COL_HIGH_PRESSURE)
          .lerp(COL_PEAK_PLASMA, clamp01(pNorm));
        cylinderGapMatRef.current.opacity = clamp01(boreAlpha * (0.45 + 0.55 * gapPulse));
      } else if (isVssBaffleBleed && liveTravel >= 0.35 && boreAlpha > 0.02) {
        const bleedPulse = Math.sin(clamp01((liveTravel - 0.35) / 0.65) * Math.PI);
        const bleedScale = 0.75 + 1.05 * bleedPulse;
        cylinderGapRingRef.current.visible = bleedPulse > 0.02;
        cylinderGapRingRef.current.position.set(31.0, manifold.boreY, 0);
        cylinderGapRingRef.current.quaternion.copy(_ringAxisX);
        cylinderGapRingRef.current.scale.set(bleedScale, bleedScale, bleedScale * 2.2);
        cylinderGapMatRef.current.color
          .copy(COL_GAS_TAP_CYAN)
          .lerp(COL_SAFE_BLOWDOWN, 0.4);
        cylinderGapMatRef.current.opacity = clamp01(boreAlpha * 0.55 * bleedPulse);
      } else {
        cylinderGapRingRef.current.visible = false;
      }
    }

    if (ventPlumeRef.current && ventPlumeMatRef.current) {
      if (
        manifold.ventPos &&
        ((hasActiveTap && gasWave01 > 0.55) ||
          (!manifold.hasGasTap && pNorm > 0.15))
      ) {
        const vp = manifold.ventPos;
        const ventStrength = manifold.hasGasTap ? gasAlpha : boreAlpha * 0.65;
        ventPlumeRef.current.visible = ventStrength > 0.03;
        const zSign = vp[2] >= 0 ? 1 : -1;
        _dirVec.set(0.22, 0.36, vp[2] === 0 ? 0.15 : 0.88 * zSign).normalize();
        _quat.setFromUnitVectors(_upAxis, _dirVec);
        const ventScale = isTank ? 8.0 : 1.0;
        const jetLen = (0.75 + 0.85 * ventStrength) * ventScale;
        ventPlumeRef.current.position.set(
          vp[0] + _dirVec.x * jetLen * 0.5,
          vp[1] + _dirVec.y * jetLen * 0.5,
          vp[2] + _dirVec.z * jetLen * 0.5
        );
        ventPlumeRef.current.quaternion.copy(_quat);
        ventPlumeRef.current.scale.set(
          0.24 * ventScale,
          jetLen,
          0.24 * ventScale
        );
        ventPlumeMatRef.current.color.copy(COL_GAS_TAP_CYAN);
        ventPlumeMatRef.current.opacity = ventStrength * 0.52;
      } else {
        ventPlumeRef.current.visible = false;
      }
    }

    // 3. Breech pressure / safe-unlock status collar at chamberX
    if (breechRingRef.current && breechRingMatRef.current) {
      const ringAlpha = clamp01(boreAlpha * 1.15);
      breechRingRef.current.visible = ringAlpha > 0.025;
      breechRingRef.current.position.set(manifold.chamberX, manifold.boreY, 0);
      const ringScale = boreRadius * 1.85;
      breechRingRef.current.scale.set(ringScale, ringScale, ringScale);
      breechRingMatRef.current.color.copy(
        _sample.isOverSafeUnlockThreshold ? COL_SEALED_RING : COL_SAFE_UNLOCK
      );
      breechRingMatRef.current.opacity = ringAlpha * 0.68;
    }

    // 4. Instanced directional flow chevrons (Zero-GC matrix updates)
    const inst = chevronsRef.current;
    if (!inst) return;

    const phaseScroll = (state.clock.elapsedTime * 3.4) % 1;
    let cursor = 0;

    // 4a. Bore forward streamlines (+X)
    const boreArrows = 6;
    _dirVec.set(1, 0, 0);
    _quat.setFromUnitVectors(_upAxis, _dirVec);
    for (let i = 0; i < boreArrows && cursor < STREAM_CHEVRON_COUNT; i++) {
      const u = ((i + phaseScroll) / boreArrows) % 1;
      const x = manifold.chamberX + liveLen * u;
      if (boreAlpha > 0.03 && liveLen > 0.9) {
        const chevScale = isTank ? 8.0 : boreRadius / 0.24;
        const s = (0.72 + 0.35 * Math.sin(u * Math.PI)) * chevScale;
        _posVec.set(x, manifold.boreY, 0);
        _scaleVec.set(s, s, s);
        _mat4.compose(_posVec, _quat, _scaleVec);
        inst.setMatrixAt(cursor, _mat4);
        inst.setColorAt(cursor, _colorWork);
      } else {
        inst.setMatrixAt(cursor, _hiddenMat4);
      }
      cursor++;
    }

    // 4b. Gas manifold OR breech recoil/blowback/cylinder-gap streamlines
    if (hasActiveTap && manifold.gasPortX !== null && gasAlpha > 0.03) {
      const portX = manifold.gasPortX;
      const span = liveFrontX - portX;
      const dirSign = span >= 0 ? 1 : -1;
      _dirVec.set(dirSign, 0, 0);
      _quat.setFromUnitVectors(_upAxis, _dirVec);
      _colorWork
        .copy(COL_GAS_TAP_CYAN)
        .lerp(COL_PEAK_PLASMA, clamp01(pNorm * 0.7));
      if (isTwinArgo) {
        // 4 chevrons along +Z ARGO piston cylinder + 4 along -Z ARGO piston cylinder
        for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
          const zVal =
            sideIdx === 0 ? manifold.gasChannelZ : -manifold.gasChannelZ;
          for (let i = 0; i < 4 && cursor < STREAM_CHEVRON_COUNT; i++) {
            const u = ((i + phaseScroll) / 4) % 1;
            if (Math.abs(span) > 0.45) {
              _posVec.set(portX + span * u, manifold.gasChannelY, zVal);
              const s = 0.78 + 0.25 * Math.sin(u * Math.PI);
              _scaleVec.set(s, s, s);
              _mat4.compose(_posVec, _quat, _scaleVec);
              inst.setMatrixAt(cursor, _mat4);
              inst.setColorAt(cursor, _colorWork);
            } else {
              inst.setMatrixAt(cursor, _hiddenMat4);
            }
            cursor++;
          }
        }
      } else {
        const gasArrows = 8;
        for (let i = 0; i < gasArrows && cursor < STREAM_CHEVRON_COUNT; i++) {
          const u = ((i + phaseScroll) / gasArrows) % 1;
          if (Math.abs(span) > 0.45) {
            _posVec.set(
              portX + span * u,
              manifold.gasChannelY,
              manifold.gasChannelZ
            );
            const s = 0.78 + 0.25 * Math.sin(u * Math.PI);
            _scaleVec.set(s, s, s);
            _mat4.compose(_posVec, _quat, _scaleVec);
            inst.setMatrixAt(cursor, _mat4);
            inst.setColorAt(cursor, _colorWork);
          } else {
            inst.setMatrixAt(cursor, _hiddenMat4);
          }
          cursor++;
        }
      }
    } else if (isRevolverGap && liveTravel >= 0.1 && boreAlpha > 0.04) {
      // Radial forcing-cone cylinder-gap jets at X = 2.20 (4 directions around boreY)
      _colorWork
        .copy(COL_HIGH_PRESSURE)
        .lerp(COL_PEAK_PLASMA, clamp01(pNorm * 0.8));
      for (let k = 0; k < 4 && cursor < STREAM_CHEVRON_COUNT; k++) {
        const a = (k * Math.PI) / 2 + Math.PI * 0.25;
        const cy = Math.cos(a);
        const sz = Math.sin(a);
        _dirVec.set(0.15, cy, sz).normalize();
        _quat.setFromUnitVectors(_upAxis, _dirVec);
        const rOut = 0.35 + 0.85 * ((phaseScroll + k * 0.25) % 1);
        _posVec.set(2.2 + 0.12 * rOut, manifold.boreY + cy * rOut, sz * rOut);
        _scaleVec.set(0.76, 0.76, 0.76);
        _mat4.compose(_posVec, _quat, _scaleVec);
        inst.setMatrixAt(cursor, _mat4);
        inst.setColorAt(cursor, _colorWork);
        cursor++;
      }
    } else if (!manifold.hasGasTap && manifold.family !== 'manual_bolt_action') {
      // Rearward breech-thrust chevrons (or -65° downward Super V vectoring chevrons on KRISS Vector)
      const isOffAxisSuperV = manifold.family === 'off_axis_delayed_blowback';
      const thrustSpan = manifold.chamberX - manifold.gasTargetX;
      if (isOffAxisSuperV) {
        _dirVec.set(-0.422618, -0.906308, 0);
      } else {
        _dirVec.set(-1, 0, 0);
      }
      _quat.setFromUnitVectors(_upAxis, _dirVec);
      const thrustArrows = 5;
      _colorWork.copy(
        _sample.isOverSafeUnlockThreshold ? COL_HIGH_PRESSURE : COL_GAS_TAP_CYAN
      );
      for (let i = 0; i < thrustArrows && cursor < STREAM_CHEVRON_COUNT; i++) {
        const u = ((i + phaseScroll) / thrustArrows) % 1;
        if (boreAlpha > 0.04 && thrustSpan > 0.4) {
          if (isOffAxisSuperV) {
            _posVec.set(
              manifold.gasTargetX - 2.7 * u,
              manifold.gasChannelY - 5.8 * u,
              manifold.gasChannelZ
            );
          } else {
            _posVec.set(
              manifold.chamberX - thrustSpan * u * 0.75,
              manifold.gasChannelY,
              manifold.gasChannelZ
            );
          }
          const thrustScale = isTank ? 7.5 : 0.75;
          _scaleVec.set(thrustScale, thrustScale, thrustScale);
          _mat4.compose(_posVec, _quat, _scaleVec);
          inst.setMatrixAt(cursor, _mat4);
          inst.setColorAt(cursor, _colorWork);
        } else {
          inst.setMatrixAt(cursor, _hiddenMat4);
        }
        cursor++;
      }
    }

    // 4c. Modular Muzzle Attachment Gas Dynamics (Suppressor K-baffle vortices,
    //     Muzzle-Brake twin lateral side-jets, 3-Prong Flash-Hider split plumes)
    const attLoadout = getWeaponAttachmentLoadout(weaponId);
    const attPhys = getActiveWeaponAttachmentPhysics(weaponId);
    const attProfile = getWeaponAttachmentMountProfile(weaponId);
    const activeMuzzle = attLoadout.muzzle;
    const muzzleAnchor = attProfile.muzzleAnchor;
    const attScale = attProfile.modelScale;

    let ax = muzzleAnchor ? muzzleAnchor[0] : manifold.muzzleX;
    let ay = muzzleAnchor ? muzzleAnchor[1] : manifold.boreY;
    let az = muzzleAnchor ? muzzleAnchor[2] : 0;
    if (muzzleAnchor && attProfile.muzzleFollowPartId) {
      const loadedPlugin = getLoadedWeaponPlugin(weaponId);
      if (loadedPlugin) {
        const kd = loadedPlugin.computeFiringKinematics(
          attProfile.muzzleFollowPartId,
          f
        );
        if (kd.pos) {
          ax += kd.pos[0];
          ay += kd.pos[1];
          az += kd.pos[2];
        }
      }
    }

    const muzzleOnsetF = Math.max(timing.ignitionF, timing.muzzleExitF - 0.025);
    const muzzleActive =
      activeMuzzle !== 'none' &&
      muzzleAnchor !== null &&
      f >= muzzleOnsetF &&
      f <= blowdownEndF;
    const muzzleWave01 = muzzleActive
      ? clamp01(
          (f - muzzleOnsetF) / Math.max(0.03, timing.muzzleExitF + 0.055 - muzzleOnsetF)
        )
      : 0;
    const muzzleDecay = muzzleActive
      ? f <= timing.muzzleExitF + 0.02
        ? 1
        : 1 -
          clamp01(
            (f - (timing.muzzleExitF + 0.02)) /
              Math.max(0.035, blowdownEndF - (timing.muzzleExitF + 0.02))
          )
      : 0;
    const muzzleStrength = muzzleActive
      ? clamp01((0.35 + 0.65 * Math.sqrt(Math.max(pNorm, 0.12))) * muzzleDecay)
      : 0;

    // Suppressor: 5 swirling K-baffle expansion vortices + attenuated exit plume
    const showSuppressor =
      activeMuzzle === 'suppressor' && muzzleStrength > 0.025;
    for (let i = 0; i < SUPP_VORTEX_SLOTS.length; i++) {
      const mesh = suppRingRefs.current[i];
      const mat = suppRingMatRefs.current[i];
      if (!mesh || !mat) continue;
      if (showSuppressor) {
        const stageRatio = i / (SUPP_VORTEX_SLOTS.length - 1);
        const stageArrived = clamp01((muzzleWave01 - stageRatio * 0.52) / 0.36);
        const swirlPulse =
          0.76 + 0.24 * Math.sin(state.clock.elapsedTime * 18.0 - i * 1.15);
        mesh.visible = stageArrived > 0.04;
        if (mesh.visible) {
          const chamberX = ax + (3.2 + i * 2.85) * attScale;
          const rChamber =
            (0.92 + 0.56 * stageArrived * swirlPulse) *
            attScale *
            (1 - stageRatio * 0.14);
          mesh.position.set(chamberX, ay, az);
          mesh.rotation.set(
            state.clock.elapsedTime * (12.0 - i * 1.4),
            Math.PI * 0.5,
            0
          );
          mesh.scale.set(rChamber, rChamber, rChamber * 1.15);
          // Blast chamber glows hot amber -> cools progressively to cyan across K-baffles
          _colorWork
            .copy(COL_HIGH_PRESSURE)
            .lerp(COL_GAS_TAP_CYAN, clamp01(stageRatio * 0.92 + (1 - pNorm) * 0.35));
          mat.color.copy(_colorWork);
          mat.opacity =
            muzzleStrength *
            stageArrived *
            (0.45 + 0.42 * attPhys.gasBaffleRetention) *
            (1 - stageRatio * 0.28);

          if (cursor < STREAM_CHEVRON_COUNT) {
            const ang = state.clock.elapsedTime * 9.5 + i * 1.45;
            const cy = Math.cos(ang);
            const sz = Math.sin(ang);
            _dirVec.set(0.28, -sz, cy).normalize();
            _quat.setFromUnitVectors(_upAxis, _dirVec);
            const rOrb = 1.02 * attScale * stageArrived;
            _posVec.set(chamberX, ay + cy * rOrb, az + sz * rOrb);
            const sC = 0.62 * attScale;
            _scaleVec.set(sC, sC, sC);
            _mat4.compose(_posVec, _quat, _scaleVec);
            inst.setMatrixAt(cursor, _mat4);
            inst.setColorAt(cursor, _colorWork);
            cursor++;
          }
        }
      } else {
        mesh.visible = false;
      }
    }

    if (suppExitPlumeRef.current && suppExitPlumeMatRef.current) {
      if (showSuppressor && muzzleWave01 > 0.45) {
        const exitLen =
          (2.2 + 2.4 * muzzleStrength) *
          attScale *
          Math.max(0.18, 1 - attPhys.gasBaffleRetention);
        const exitX =
          ax + MUZZLE_ATTACHMENT_SPECS.suppressor.lengthCm * attScale;
        suppExitPlumeRef.current.visible = true;
        suppExitPlumeRef.current.position.set(exitX + exitLen * 0.5, ay, az);
        suppExitPlumeRef.current.scale.set(
          0.55 * attScale,
          exitLen,
          0.55 * attScale
        );
        suppExitPlumeMatRef.current.color.copy(COL_SAFE_BLOWDOWN);
        suppExitPlumeMatRef.current.opacity =
          muzzleStrength * (1 - attPhys.gasBaffleRetention) * 1.45;
      } else {
        suppExitPlumeRef.current.visible = false;
      }
    }

    // Muzzle Brake: twin high-velocity rearward-swept lateral side-jet plumes (±Z × 2 chambers)
    const showBrake =
      activeMuzzle === 'muzzle_brake' && muzzleStrength > 0.025;
    for (let i = 0; i < BRAKE_JET_SLOTS.length; i++) {
      const mesh = brakeJetRefs.current[i];
      const mat = brakeJetMatRefs.current[i];
      if (!mesh || !mat) continue;
      if (showBrake) {
        const chamberIdx = i >> 1; // 0 = rear chamber, 1 = front chamber
        const zSide = i % 2 === 0 ? 1 : -1;
        const falloff = chamberIdx === 0 ? 1.0 : 0.78;
        const jetLen =
          (4.6 + 4.4 * muzzleStrength) *
          attScale *
          attPhys.sideBlastRatio *
          falloff;
        const jetRad = (0.72 + 0.48 * muzzleStrength) * attScale * falloff;
        const portX = ax + (chamberIdx === 0 ? 1.65 : 3.55) * attScale;
        _dirVec
          .set(
            -Math.sin(BRAKE_SWEEP_RAD),
            0.06,
            zSide * Math.cos(BRAKE_SWEEP_RAD)
          )
          .normalize();
        _quat.setFromUnitVectors(_upAxis, _dirVec);
        mesh.visible = true;
        mesh.position.set(
          portX + _dirVec.x * (jetLen * 0.5),
          ay + _dirVec.y * (jetLen * 0.5),
          az + zSide * (0.95 * attScale) + _dirVec.z * (jetLen * 0.5)
        );
        mesh.quaternion.copy(_quat);
        mesh.scale.set(jetRad, jetLen, jetRad);
        _colorWork
          .copy(COL_HIGH_PRESSURE)
          .lerp(COL_PEAK_PLASMA, clamp01(pNorm * 0.9))
          .lerp(COL_GAS_TAP_CYAN, chamberIdx * 0.25);
        mat.color.copy(_colorWork);
        mat.opacity = muzzleStrength * (0.68 + 0.26 * attPhys.sideBlastRatio) * falloff;

        if (cursor < STREAM_CHEVRON_COUNT) {
          const u = (phaseScroll + chamberIdx * 0.35) % 1;
          const dist = (1.1 + jetLen * u) * 0.88;
          _posVec.set(
            portX + _dirVec.x * dist,
            ay + _dirVec.y * dist,
            az + zSide * (0.95 * attScale) + _dirVec.z * dist
          );
          const sC = (0.78 + 0.22 * Math.sin(u * Math.PI)) * attScale;
          _scaleVec.set(sC, sC, sC);
          _mat4.compose(_posVec, _quat, _scaleVec);
          inst.setMatrixAt(cursor, _mat4);
          inst.setColorAt(cursor, _colorWork);
          cursor++;
        }
      } else {
        mesh.visible = false;
      }
    }

    // 3-Prong Flash Hider: split forward plume into 3 muted 120° radial prongs
    const showFlashHider =
      activeMuzzle === 'flash_hider' && muzzleStrength > 0.025;
    for (let i = 0; i < FH_PRONG_SLOTS.length; i++) {
      const mesh = fhProngRefs.current[i];
      const mat = fhProngMatRefs.current[i];
      if (!mesh || !mat) continue;
      if (showFlashHider) {
        const ang = (i * Math.PI * 2) / 3 + Math.PI / 6;
        const cy = Math.cos(ang);
        const sz = Math.sin(ang);
        _dirVec.set(0.76, cy * 0.65, sz * 0.65).normalize();
        _quat.setFromUnitVectors(_upAxis, _dirVec);
        const pLen = (2.6 + 2.0 * muzzleStrength) * attScale;
        const pRad = (0.42 + 0.22 * muzzleStrength) * attScale;
        const originX = ax + 3.4 * attScale;
        mesh.visible = true;
        mesh.position.set(
          originX + _dirVec.x * pLen * 0.5,
          ay + cy * 0.38 * attScale + _dirVec.y * pLen * 0.5,
          az + sz * 0.38 * attScale + _dirVec.z * pLen * 0.5
        );
        mesh.quaternion.copy(_quat);
        mesh.scale.set(pRad, pLen, pRad);
        _colorWork
          .copy(COL_SAFE_BLOWDOWN)
          .lerp(COL_HIGH_PRESSURE, clamp01(pNorm * 0.55));
        mat.color.copy(_colorWork);
        mat.opacity =
          muzzleStrength * Math.max(0.22, 1 - attPhys.flashAttenuation * 0.65);

        if (cursor < STREAM_CHEVRON_COUNT) {
          const u = (phaseScroll + i * 0.33) % 1;
          _posVec.set(
            originX + _dirVec.x * pLen * u,
            ay + cy * 0.38 * attScale + _dirVec.y * pLen * u,
            az + sz * 0.38 * attScale + _dirVec.z * pLen * u
          );
          const sC = 0.68 * attScale;
          _scaleVec.set(sC, sC, sC);
          _mat4.compose(_posVec, _quat, _scaleVec);
          inst.setMatrixAt(cursor, _mat4);
          inst.setColorAt(cursor, _colorWork);
          cursor++;
        }
      } else {
        mesh.visible = false;
      }
    }

    // 4d. Subtle breech / ejection-port gas escape wisps during unlocking & blowdown
    //     (heightened slightly when a suppressor raises port backpressure; scaled cleanly by caliber class)
    const wispStartF = Math.max(timing.muzzleExitF, _sample.safeUnlockF - 0.04);
    const wispSpanF = Math.max(0.14, blowdownEndF - wispStartF + 0.08);
    const wispScale = isTank
      ? 9.2
      : caliber === '30x173_gau8'
        ? 3.8
        : caliber === '50_bmg'
          ? 1.55
          : 1.0;
    const suppBackpressureBoost = activeMuzzle === 'suppressor' ? 1.42 : 1.0;
    for (let i = 0; i < BREECH_WISP_SLOTS.length; i++) {
      const wMesh = breechWispRefs.current[i];
      const wMat = breechWispMatRefs.current[i];
      if (!wMesh || !wMat) continue;
      const u = (f - (wispStartF + i * 0.025)) / wispSpanF;
      const showWisp = u > 0 && u < 1;
      wMesh.visible = showWisp;
      if (!showWisp) continue;
      const env = Math.sin(u * Math.PI) * (1 - u * 0.45);
      const lift = (0.35 + u * 2.4 + i * 0.25) * wispScale;
      const side = (0.55 + u * 1.35 + i * 0.22) * wispScale;
      const back = (-0.25 - u * 0.75) * wispScale;
      wMesh.position.set(
        manifold.chamberX + back,
        manifold.boreY + lift,
        side
      );
      const rad = (0.28 + 0.56 * u + i * 0.08) * wispScale;
      wMesh.scale.set(rad * 1.15, rad * 1.45, rad);
      wMesh.rotation.set(i * 0.6 + u, u * 1.2, -0.32);
      _colorWork
        .copy(COL_BREECH_WISP_WARM)
        .lerp(COL_BREECH_WISP_COOL, clamp01(u * 1.35));
      wMat.color.copy(_colorWork);
      wMat.opacity = Math.min(
        0.24,
        env * 0.13 * suppBackpressureBoost * (1 - i * 0.18)
      );
    }

    while (cursor < STREAM_CHEVRON_COUNT) {
      inst.setMatrixAt(cursor, _hiddenMat4);
      cursor++;
    }

    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    if (chevronMatRef.current) {
      chevronMatRef.current.opacity = Math.max(boreAlpha, gasAlpha) * 0.85;
    }
  });

  if (mode !== 'firing') {
    return null;
  }

  return (
    <group ref={rootRef} name="WP05GasFlowVisualizer" visible={false}>
      {/* Cycle 9B.1: Supersonic ground-plane muzzle overpressure shockwave ring + outer dust wave */}
      <group
        ref={shockwaveGroupRef}
        name="MuzzleGroundShockwave"
        visible={false}
      >
        <mesh
          ref={shockPrimaryRef}
          rotation={[-Math.PI / 2, 0, 0]}
          material={shockPrimaryMat}
          frustumCulled={false}
          raycast={noRaycast}
          userData={{ excludeFromGtao: true }}
          renderOrder={12}
        >
          <planeGeometry args={[2, 2, 1, 1]} />
        </mesh>
        <mesh
          ref={shockDustRef}
          position={[0, -0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={shockDustMat}
          frustumCulled={false}
          raycast={noRaycast}
          userData={{ excludeFromGtao: true }}
          renderOrder={11}
        >
          <planeGeometry args={[2, 2, 1, 1]} />
        </mesh>
      </group>

      {/* Cycle 9B.2: Hot-barrel rising thermal convection mirage shimmer ribbons */}
      <group
        ref={mirageGroupRef}
        name="HotBarrelThermalMirage"
        visible={false}
      >
        {THERMAL_MIRAGE_SLOTS.map((i) => (
          <mesh
            key={`thermal-mirage-${i}`}
            ref={(el) => {
              mirageMeshRefs.current[i] = el;
            }}
            material={mirageMats[i]}
            frustumCulled={false}
            raycast={noRaycast}
            userData={{ excludeFromGtao: true }}
            renderOrder={13}
          >
            <planeGeometry args={[1, 1, 1, 1]} />
          </mesh>
        ))}
      </group>

      {/* Cycle 15A: Matt Rittman In-Bore Propellant Deflagration Plasma & Boxer Primer Ignition Spark */}
      <group
        ref={inBoreGroupRef}
        name="InBorePropellantDeflagration"
        visible={false}
      >
        <mesh
          ref={inBorePlasmaMeshRef}
          rotation={[0, 0, -Math.PI / 2]}
          material={inBorePlasmaMat}
          visible={false}
          frustumCulled={false}
          raycast={noRaycast}
          userData={{ excludeFromGtao: true }}
          renderOrder={13}
        >
          <cylinderGeometry args={[1, 1, 1, 18, 1, true]} />
        </mesh>
        <mesh
          ref={primerSparkMeshRef}
          material={primerSparkMat}
          visible={false}
          frustumCulled={false}
          raycast={noRaycast}
          userData={{ excludeFromGtao: true }}
          renderOrder={14}
        >
          <planeGeometry args={[2, 2, 1, 1]} />
        </mesh>
      </group>

      {/* Cycle 19A.1: High-RPM Rotary Barrel-Cluster Motion-Blur Sweep Halo (`gau8` & `m134`) */}
      <group
        ref={rotaryBlurGroupRef}
        name="RotaryBarrelBlurHalo"
        visible={false}
      >
        <mesh
          ref={rotaryBlurOuterRef}
          rotation={[0, 0, -Math.PI / 2]}
          material={rotaryBlurOuterMat}
          frustumCulled={false}
          raycast={noRaycast}
          userData={{ excludeFromGtao: true }}
          renderOrder={13}
        >
          <cylinderGeometry args={[1, 1, 1, 48, 1, true]} />
        </mesh>
        <mesh
          ref={rotaryBlurInnerRef}
          rotation={[0, 0, -Math.PI / 2]}
          material={rotaryBlurInnerMat}
          frustumCulled={false}
          raycast={noRaycast}
          userData={{ excludeFromGtao: true }}
          renderOrder={12}
        >
          <cylinderGeometry args={[1, 1, 1, 40, 1, true]} />
        </mesh>
      </group>

      {/* Cycle 19A.2: 1:1 MBT Bore-Evacuator Scavenging Plume & Tiger I Twin-Baffle Lateral Smoke Jets */}
      <group
        ref={tankEvacGroupRef}
        name="TankBoreEvacuatorPlume"
        visible={false}
      >
        {TANK_EVAC_PUFF_SLOTS.map((i) => (
          <mesh
            key={`tank-evac-puff-${i}`}
            ref={(el) => {
              tankEvacPuffRefs.current[i] = el;
            }}
            material={tankEvacPuffMats[i]}
            visible={false}
            frustumCulled={false}
            raycast={noRaycast}
            userData={{ excludeFromGtao: true }}
            renderOrder={13}
          >
            <icosahedronGeometry args={[1, 2]} />
          </mesh>
        ))}
        {TIGER_BAFFLE_JET_SLOTS.map((i) => (
          <mesh
            key={`tiger-baffle-jet-${i}`}
            ref={(el) => {
              tigerBaffleJetRefs.current[i] = el;
            }}
            material={tigerBaffleJetMats[i]}
            visible={false}
            frustumCulled={false}
            raycast={noRaycast}
            userData={{ excludeFromGtao: true }}
            renderOrder={13}
          >
            <cylinderGeometry args={[1.0, 0.28, 1, 16, 1, true]} />
          </mesh>
        ))}
      </group>

      <group ref={gasGroupRef} name="PropellantGasFlowSubgroup" visible={false}>
      {/* Bore propellant expansion sheath */}
      <mesh
        ref={boreOuterRef}
        rotation={[0, 0, -Math.PI / 2]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={14}
      >
        <cylinderGeometry args={[1, 1, 1, 16, 1, true]} />
        <meshBasicMaterial
          ref={boreOuterMatRef}
          color="#f59e0b"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Bore propellant incandescent plasma core */}
      <mesh
        ref={boreCoreRef}
        rotation={[0, 0, -Math.PI / 2]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={15}
      >
        <cylinderGeometry args={[1, 1, 1, 12, 1, false]} />
        <meshBasicMaterial
          ref={boreCoreMatRef}
          color="#fde68a"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Gas-port tap riser (bore -> gas block / gas cylinder) */}
      <mesh
        ref={riserMeshRef}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={15}
      >
        <cylinderGeometry args={[1, 1, 1, 12, 1, false]} />
        <meshBasicMaterial
          ref={riserMatRef}
          color="#22d3ee"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Gas tube / piston cylinder axial manifold stream */}
      <mesh
        ref={manifoldTubeRef}
        rotation={[0, 0, -Math.PI / 2]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={15}
      >
        <cylinderGeometry args={[1, 1, 1, 14, 1, false]} />
        <meshBasicMaterial
          ref={manifoldMatRef}
          color="#22d3ee"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Piston face / Stoner BCG internal expansion chamber pressure front */}
      <mesh
        ref={impulseHeadRef}
        rotation={[0, Math.PI / 2, 0]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={16}
      >
        <torusGeometry args={[1, 0.32, 12, 24]} />
        <meshBasicMaterial
          ref={impulseHeadMatRef}
          color="#22d3ee"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Left-flank (-Z) mirrored ARGO riser, gas cylinder & piston face (Benelli M4) */}
      <mesh
        ref={riserLeftRef}
        visible={false}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={15}
      >
        <cylinderGeometry args={[1, 1, 1, 12, 1, false]} />
        <meshBasicMaterial
          ref={riserLeftMatRef}
          color="#22d3ee"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh
        ref={manifoldLeftRef}
        visible={false}
        rotation={[0, 0, -Math.PI / 2]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={15}
      >
        <cylinderGeometry args={[1, 1, 1, 14, 1, false]} />
        <meshBasicMaterial
          ref={manifoldLeftMatRef}
          color="#22d3ee"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh
        ref={impulseLeftRef}
        visible={false}
        rotation={[0, Math.PI / 2, 0]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={16}
      >
        <torusGeometry args={[1, 0.32, 12, 24]} />
        <meshBasicMaterial
          ref={impulseLeftMatRef}
          color="#22d3ee"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Revolver 360° forcing-cone cylinder-gap radial flash torus (Colt Python) */}
      <mesh
        ref={cylinderGapRingRef}
        visible={false}
        rotation={[0, Math.PI / 2, 0]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={16}
      >
        <torusGeometry args={[1, 0.28, 12, 28]} />
        <meshBasicMaterial
          ref={cylinderGapMatRef}
          color="#f59e0b"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Secondary gas block / carrier exhaust vent jet */}
      <mesh
        ref={ventPlumeRef}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={14}
      >
        <coneGeometry args={[1, 1, 12, 1, true]} />
        <meshBasicMaterial
          ref={ventPlumeMatRef}
          color="#22d3ee"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Chamber breech lockup / safe-unlock pressure status ring */}
      <mesh
        ref={breechRingRef}
        rotation={[0, Math.PI / 2, 0]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={15}
      >
        <torusGeometry args={[1, 0.16, 10, 28]} />
        <meshBasicMaterial
          ref={breechRingMatRef}
          color="#fbbf24"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Suppressor internal swirling K-baffle gas expansion vortices (5 chambers) */}
      {SUPP_VORTEX_SLOTS.map((i) => (
        <mesh
          key={`supp-vortex-${i}`}
          ref={(el) => {
            suppRingRefs.current[i] = el;
          }}
          visible={false}
          frustumCulled={false}
          raycast={noRaycast}
          renderOrder={16}
        >
          <torusGeometry args={[1, 0.34, 10, 24]} />
          <meshBasicMaterial
            ref={(el) => {
              suppRingMatRefs.current[i] = el;
            }}
            color="#22d3ee"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* Suppressor markedly attenuated forward exit blowdown plume */}
      <mesh
        ref={suppExitPlumeRef}
        visible={false}
        rotation={[0, 0, -Math.PI / 2]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={15}
      >
        <coneGeometry args={[1, 1, 14, 1, true]} />
        <meshBasicMaterial
          ref={suppExitPlumeMatRef}
          color="#06b6d4"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Dual-Chamber Muzzle Brake twin high-velocity lateral side-jet plumes */}
      {BRAKE_JET_SLOTS.map((i) => (
        <mesh
          key={`brake-jet-${i}`}
          ref={(el) => {
            brakeJetRefs.current[i] = el;
          }}
          visible={false}
          frustumCulled={false}
          raycast={noRaycast}
          renderOrder={16}
        >
          <coneGeometry args={[1, 1, 14, 1, true]} />
          <meshBasicMaterial
            ref={(el) => {
              brakeJetMatRefs.current[i] = el;
            }}
            color="#f59e0b"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* 3-Prong Flash Hider split muted forward dispersion plumes */}
      {FH_PRONG_SLOTS.map((i) => (
        <mesh
          key={`fh-prong-${i}`}
          ref={(el) => {
            fhProngRefs.current[i] = el;
          }}
          visible={false}
          frustumCulled={false}
          raycast={noRaycast}
          renderOrder={15}
        >
          <coneGeometry args={[1, 1, 12, 1, true]} />
          <meshBasicMaterial
            ref={(el) => {
              fhProngMatRefs.current[i] = el;
            }}
            color="#22d3ee"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* Subtle breech / ejection-port residual gas escape wisps (Zero-GC pre-allocated) */}
      {BREECH_WISP_SLOTS.map((i) => (
        <mesh
          key={`breech-wisp-${i}`}
          ref={(el) => {
            breechWispRefs.current[i] = el;
          }}
          visible={false}
          frustumCulled={false}
          raycast={noRaycast}
          renderOrder={14}
        >
          <icosahedronGeometry args={[1, 1]} />
          <meshBasicMaterial
            ref={(el) => {
              breechWispMatRefs.current[i] = el;
            }}
            color="#d6cfc4"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* 24 pre-allocated instanced directional flow chevrons */}
      <instancedMesh
        ref={chevronsRef}
        args={[undefined, undefined, STREAM_CHEVRON_COUNT]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={16}
      >
        <coneGeometry args={[0.14, 0.42, 10, 1, true]} />
        <meshBasicMaterial
          ref={chevronMatRef}
          color="#ffffff"
          transparent
          opacity={0.82}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
      </group>
    </group>
  );
};

GasFlowVisualizer.displayName = 'GasFlowVisualizer';
