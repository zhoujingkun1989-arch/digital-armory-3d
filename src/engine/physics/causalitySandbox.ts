import { create } from 'zustand';
import { getWeaponManifest } from '../../weapons/manifests';
import type { WeaponId } from '../../weapons/types';
import {
  computeSafeUnlockF,
  createInternalBallisticsSample,
  evaluateInternalBallisticsInto,
  getCaliberBallisticsSpec,
  getWeaponFiringTiming,
  isArcheryWeapon,
} from './armoryPhysics';

export type CausalityPresetId =
  | 'factory'
  | 'suppressed_overgas'
  | 'subsonic_underpower'
  | 'lightweight_competition'
  | 'heavy_arctic_buffer';

export type CausalityDiagnosticStatus =
  | 'nominal'
  | 'overgassed_early_unlock'
  | 'short_stroke_fte'
  | 'excessive_bolt_velocity';

export interface CausalityParameters {
  enabled: boolean;
  gasPortScale: number;
  recoilSpringKScale: number;
  boltMassScale: number;
  powderLoadScale: number;
  presetId: CausalityPresetId | 'custom';
}

export interface CausalityEvaluation {
  weaponId: WeaponId;
  baselinePeakMPa: number;
  modifiedPeakMPa: number;
  baselineVelocityMps: number;
  modifiedVelocityMps: number;
  baselineRpm: number;
  modifiedRpm: number;
  boltVelocityRatio: number;
  recoilImpulseRatio: number;
  strokeRatio: number;
  baselineUnlockF: number;
  unlockProgressF: number;
  chamberPressureAtUnlockMPa: number;
  safeUnlockPressureMPa: number;
  dwellMarginMs: number;
  status: CausalityDiagnosticStatus;
}

export const CAUSALITY_PRESETS: Readonly<
  Record<
    CausalityPresetId,
    Omit<CausalityParameters, 'enabled' | 'presetId'>
  >
> = {
  factory: {
    gasPortScale: 1.0,
    recoilSpringKScale: 1.0,
    boltMassScale: 1.0,
    powderLoadScale: 1.0,
  },
  suppressed_overgas: {
    gasPortScale: 1.38,
    recoilSpringKScale: 0.78,
    boltMassScale: 0.86,
    powderLoadScale: 1.08,
  },
  subsonic_underpower: {
    gasPortScale: 0.72,
    recoilSpringKScale: 1.15,
    boltMassScale: 1.12,
    powderLoadScale: 0.78,
  },
  lightweight_competition: {
    gasPortScale: 1.08,
    recoilSpringKScale: 0.85,
    boltMassScale: 0.72,
    powderLoadScale: 1.04,
  },
  heavy_arctic_buffer: {
    gasPortScale: 1.12,
    recoilSpringKScale: 1.35,
    boltMassScale: 1.42,
    powderLoadScale: 1.02,
  },
};

const NOMINAL_CADENCE_RPM: Readonly<Record<WeaponId, number>> = {
  ak15: 700,
  m4a1: 820,
  mp5: 800,
  g17: 380,
  m82a1: 90,
  awm: 24,
  scar: 625,
  deagle: 180,
  aug: 720,
  p320: 360,
  p90: 900,
  lift33: 18,
  r500: 14,
  python: 110,
  benellim4: 260,
  garand: 140,
  m249: 800,
  p08: 340,
  vector: 1200,
  g11: 2100,
  vss: 850,
  m134: 3000,
  an94: 1800,
  ztz99a: 8,
  m1a2: 10,
  leopard2a7: 10,
  tiger1: 8,
  winchester1894: 35,
  rem870: 30,
};

function clampRange(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return 1.0;
  return Math.max(min, Math.min(max, val));
}

const _sampleScratch = createInternalBallisticsSample();

/**
 * Pure First-Principles Causality Solver coupling gas port drive / draw force,
 * recoil spring constant k, bolt/carrier mass m, and powder charge scaling into
 * real-time chamber pressure, unlock pressure hazard, cyclic RPM, and carrier stroke.
 */
export function evaluateCausalityPhysics(
  weaponId: WeaponId,
  params: Pick<
    CausalityParameters,
    'gasPortScale' | 'recoilSpringKScale' | 'boltMassScale' | 'powderLoadScale'
  >
): CausalityEvaluation {
  const manifest = getWeaponManifest(weaponId);
  const spec = getCaliberBallisticsSpec(manifest.caliberProfile);
  const timing = getWeaponFiringTiming(weaponId);
  const baselineRpm = NOMINAL_CADENCE_RPM[weaponId] ?? 600;
  const archery = isArcheryWeapon(weaponId);

  const gas = clampRange(params.gasPortScale, 0.6, 1.5);
  const springK = clampRange(params.recoilSpringKScale, 0.55, 1.7);
  const boltMass = clampRange(params.boltMassScale, 0.65, 1.65);
  const powder = clampRange(params.powderLoadScale, 0.75, 1.35);

  const pressureFactor = Math.pow(powder, 1.32);
  const velocityFactor = Math.pow(powder, 0.56);

  const baselinePeakMPa = spec.peakPressureMPa;
  const modifiedPeakMPa = baselinePeakMPa * pressureFactor;
  const baselineVelocityMps = spec.muzzleVelocityMps;
  const modifiedVelocityMps = baselineVelocityMps * velocityFactor;

  // Bolt carrier impulse balance: drive energy increases with gas port + charge, resisted by mass & spring
  const driveImpulse =
    (Math.pow(gas, 0.72) * Math.pow(powder, 0.78)) /
    (Math.pow(boltMass, 0.58) * Math.pow(springK, 0.24));

  const boltVelocityRatio = clampRange(driveImpulse, 0.42, 1.65);
  const strokeRatio = clampRange(
    Math.pow(driveImpulse, 0.85) * Math.pow(1 / springK, 0.16),
    0.45,
    1.18
  );
  const recoilImpulseRatio = clampRange(
    Math.pow(powder, 0.88) *
      Math.pow(boltMass, 0.15) *
      (0.85 + 0.15 * gas),
    0.55,
    1.65
  );

  const baselineUnlockF = Math.min(
    0.62,
    computeSafeUnlockF(manifest.caliberProfile, timing) + 0.012
  );
  const unlockShift = (driveImpulse - 1) * 0.048;
  const unlockProgressF = clampRange(
    baselineUnlockF - unlockShift,
    0.14,
    Math.min(0.68, baselineUnlockF + 0.06)
  );

  evaluateInternalBallisticsInto(
    manifest.caliberProfile,
    unlockProgressF,
    _sampleScratch,
    timing
  );
  const chamberPressureAtUnlockMPa = archery
    ? _sampleScratch.pressureMPa * pressureFactor
    : _sampleScratch.pressureMPa * pressureFactor;

  const dwellMarginMs =
    (unlockProgressF - timing.muzzleExitF) * 8.5 -
    (driveImpulse - 1) * 0.45;

  const rpmScale =
    (Math.pow(springK, 0.28) * Math.pow(gas * powder, 0.36)) /
    Math.pow(boltMass, 0.42);
  const modifiedRpm = Math.max(1, baselineRpm * rpmScale);

  let status: CausalityDiagnosticStatus = 'nominal';
  if (strokeRatio < 0.78) {
    status = 'short_stroke_fte';
  } else if (
    !archery &&
    chamberPressureAtUnlockMPa > spec.safeUnlockPressureMPa * 1.15
  ) {
    status = 'overgassed_early_unlock';
  } else if (boltVelocityRatio > 1.24) {
    status = 'excessive_bolt_velocity';
  }

  return {
    weaponId,
    baselinePeakMPa,
    modifiedPeakMPa,
    baselineVelocityMps,
    modifiedVelocityMps,
    baselineRpm,
    modifiedRpm,
    boltVelocityRatio,
    recoilImpulseRatio,
    strokeRatio,
    baselineUnlockF,
    unlockProgressF,
    chamberPressureAtUnlockMPa,
    safeUnlockPressureMPa: spec.safeUnlockPressureMPa,
    dwellMarginMs,
    status,
  };
}

interface CausalitySandboxStoreState extends CausalityParameters {
  setEnabled: (enabled: boolean) => void;
  setGasPortScale: (val: number) => void;
  setRecoilSpringKScale: (val: number) => void;
  setBoltMassScale: (val: number) => void;
  setPowderLoadScale: (val: number) => void;
  applyPreset: (presetId: CausalityPresetId) => void;
  reset: () => void;
}

export const useCausalitySandboxStore = create<CausalitySandboxStoreState>(
  (set) => ({
    enabled: false,
    ...CAUSALITY_PRESETS.factory,
    presetId: 'factory',

    setEnabled: (enabled) => set({ enabled }),
    setGasPortScale: (val) =>
      set({
        enabled: true,
        gasPortScale: clampRange(val, 0.6, 1.5),
        presetId: 'custom',
      }),
    setRecoilSpringKScale: (val) =>
      set({
        enabled: true,
        recoilSpringKScale: clampRange(val, 0.55, 1.7),
        presetId: 'custom',
      }),
    setBoltMassScale: (val) =>
      set({
        enabled: true,
        boltMassScale: clampRange(val, 0.65, 1.65),
        presetId: 'custom',
      }),
    setPowderLoadScale: (val) =>
      set({
        enabled: true,
        powderLoadScale: clampRange(val, 0.75, 1.35),
        presetId: 'custom',
      }),
    applyPreset: (presetId) => {
      const preset = CAUSALITY_PRESETS[presetId] ?? CAUSALITY_PRESETS.factory;
      set({
        enabled: true,
        ...preset,
        presetId,
      });
    },
    reset: () =>
      set({
        enabled: false,
        ...CAUSALITY_PRESETS.factory,
        presetId: 'factory',
      }),
  })
);

let _cachedWeaponId: WeaponId | null = null;
let _cachedGas = -1;
let _cachedSpring = -1;
let _cachedMass = -1;
let _cachedPowder = -1;
let _cachedEval: CausalityEvaluation | null = null;

/**
 * Zero-GC cached evaluation for 60fps `useFrame` loops in `ArmoryViewport`
 * and `PartActor`. Recomputes only when weapon or causality parameters change.
 */
export function getCachedCausalityEvaluation(
  weaponId: WeaponId,
  params: Pick<
    CausalityParameters,
    'gasPortScale' | 'recoilSpringKScale' | 'boltMassScale' | 'powderLoadScale'
  >
): CausalityEvaluation {
  if (
    _cachedEval &&
    _cachedWeaponId === weaponId &&
    _cachedGas === params.gasPortScale &&
    _cachedSpring === params.recoilSpringKScale &&
    _cachedMass === params.boltMassScale &&
    _cachedPowder === params.powderLoadScale
  ) {
    return _cachedEval;
  }
  _cachedWeaponId = weaponId;
  _cachedGas = params.gasPortScale;
  _cachedSpring = params.recoilSpringKScale;
  _cachedMass = params.boltMassScale;
  _cachedPowder = params.powderLoadScale;
  _cachedEval = evaluateCausalityPhysics(weaponId, params);
  return _cachedEval;
}
