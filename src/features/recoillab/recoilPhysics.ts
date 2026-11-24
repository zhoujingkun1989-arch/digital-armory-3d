import { CARTRIDGE_LAB_SPECS } from '../../engine/cartridges/cartridgeSpecs';
import { getCaliberBallisticsSpec } from '../../engine/physics/armoryPhysics';
import type { LanguageCode } from '../../narration/types';
import { WEAPON_MANIFESTS } from '../../weapons/manifests';
import type { ArmoryWeaponItem, WeaponId } from '../../weapons/types';

export type RecoilMuzzleOption =
  | 'raw'
  | 'factory'
  | 'brake'
  | 'suppressor'
  | 'flash_hider';

export type RecoilPresetId =
  | 'vector_vs_thompson'
  | 'm1911_vs_g17'
  | 'm82a1_vs_awm'
  | 'gau8_vs_ztz99a'
  | 'ak15_vs_m4a1';

export type RecoilCategory = ArmoryWeaponItem['category'];

export const RECOIL_WAVEFORM_SAMPLES = 120;
export const RECOIL_WAVEFORM_WINDOW_MS = 40;

interface ExactRecoilSpec {
  /** Effective recoiling platform mass (kg) — includes barrel/cradle/hull as appropriate */
  platformMassKg: number;
  /** Bore axis height above primary pivot (wrist/shoulder/trunnion) in mm */
  boreAxisMm: number;
  /** Gas-jet rocket velocity multiplier beta (v_gas = beta * v_0) */
  gasBeta: number;
  /** Nominal recoil impulse duration (ms) before optional buffer/pad */
  basePulseDurationMs: number;
  /** Factory muzzle gas-jet redirection fraction (0 = bare crown) */
  factoryMuzzleRedirect: number;
  /** Additional mechanical climb-redirection multiplier (<1 for Super V / inline dampers) */
  climbCoupling: number;
  /** Cyclic rate of fire in RPM (0 for manual/single-shot/MBT) */
  cyclicRpm: number;
  /** Pivot type for lever diagram labeling */
  pivotKind: 'wrist' | 'shoulder' | 'mount' | 'trunnion';
  /** Whether a conventional muzzle brake/suppressor physically applies */
  supportsMuzzleDevices: boolean;
}

const EXACT_RECOIL_SPECS: Readonly<Record<WeaponId, ExactRecoilSpec>> = {
  ak15: {
    platformMassKg: 3.5,
    boreAxisMm: 28,
    gasBeta: 1.75,
    basePulseDurationMs: 11.5,
    factoryMuzzleRedirect: 0.24,
    climbCoupling: 1.0,
    cyclicRpm: 700,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  m4a1: {
    platformMassKg: 2.92,
    boreAxisMm: 12,
    gasBeta: 1.75,
    basePulseDurationMs: 12.2,
    factoryMuzzleRedirect: 0.04,
    climbCoupling: 0.88,
    cyclicRpm: 800,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  mp5: {
    platformMassKg: 3.08,
    boreAxisMm: 24,
    gasBeta: 1.5,
    basePulseDurationMs: 12.8,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 0.92,
    cyclicRpm: 800,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  g17: {
    platformMassKg: 0.71,
    boreAxisMm: 22,
    gasBeta: 1.5,
    basePulseDurationMs: 8.6,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 1.0,
    cyclicRpm: 0,
    pivotKind: 'wrist',
    supportsMuzzleDevices: true,
  },
  m82a1: {
    platformMassKg: 13.5,
    boreAxisMm: 26,
    gasBeta: 1.78,
    basePulseDurationMs: 18.5,
    factoryMuzzleRedirect: 0.46,
    climbCoupling: 0.9,
    cyclicRpm: 0,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  awm: {
    platformMassKg: 6.9,
    boreAxisMm: 28,
    gasBeta: 1.75,
    basePulseDurationMs: 12.0,
    factoryMuzzleRedirect: 0.36,
    climbCoupling: 1.0,
    cyclicRpm: 0,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  scar: {
    platformMassKg: 3.29,
    boreAxisMm: 16,
    gasBeta: 1.75,
    basePulseDurationMs: 12.0,
    factoryMuzzleRedirect: 0.2,
    climbCoupling: 0.92,
    cyclicRpm: 625,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  deagle: {
    platformMassKg: 1.998,
    boreAxisMm: 44,
    gasBeta: 1.55,
    basePulseDurationMs: 8.2,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 1.08,
    cyclicRpm: 0,
    pivotKind: 'wrist',
    supportsMuzzleDevices: true,
  },
  aug: {
    platformMassKg: 3.6,
    boreAxisMm: 15,
    gasBeta: 1.75,
    basePulseDurationMs: 11.8,
    factoryMuzzleRedirect: 0.06,
    climbCoupling: 0.9,
    cyclicRpm: 680,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  p320: {
    platformMassKg: 0.833,
    boreAxisMm: 34,
    gasBeta: 1.5,
    basePulseDurationMs: 8.8,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 1.0,
    cyclicRpm: 0,
    pivotKind: 'wrist',
    supportsMuzzleDevices: true,
  },
  p90: {
    platformMassKg: 2.6,
    boreAxisMm: 14,
    gasBeta: 1.65,
    basePulseDurationMs: 11.4,
    factoryMuzzleRedirect: 0.14,
    climbCoupling: 0.88,
    cyclicRpm: 900,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  lift33: {
    platformMassKg: 1.79,
    boreAxisMm: 18,
    gasBeta: 0.0,
    basePulseDurationMs: 16.0,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 0.75,
    cyclicRpm: 0,
    pivotKind: 'wrist',
    supportsMuzzleDevices: false,
  },
  r500: {
    platformMassKg: 3.81,
    boreAxisMm: 16,
    gasBeta: 0.0,
    basePulseDurationMs: 14.5,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 0.8,
    cyclicRpm: 0,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: false,
  },
  python: {
    platformMassKg: 1.23,
    boreAxisMm: 40,
    gasBeta: 1.5,
    basePulseDurationMs: 7.4,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 1.05,
    cyclicRpm: 0,
    pivotKind: 'wrist',
    supportsMuzzleDevices: false,
  },
  benellim4: {
    platformMassKg: 3.82,
    boreAxisMm: 27,
    gasBeta: 1.3,
    basePulseDurationMs: 13.5,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 0.96,
    cyclicRpm: 0,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  garand: {
    platformMassKg: 4.31,
    boreAxisMm: 32,
    gasBeta: 1.75,
    basePulseDurationMs: 11.8,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 1.0,
    cyclicRpm: 0,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  m249: {
    platformMassKg: 7.5,
    boreAxisMm: 24,
    gasBeta: 1.75,
    basePulseDurationMs: 13.5,
    factoryMuzzleRedirect: 0.06,
    climbCoupling: 0.9,
    cyclicRpm: 800,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  p08: {
    platformMassKg: 0.87,
    boreAxisMm: 24,
    gasBeta: 1.5,
    basePulseDurationMs: 9.2,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 0.94,
    cyclicRpm: 0,
    pivotKind: 'wrist',
    supportsMuzzleDevices: true,
  },
  vector: {
    platformMassKg: 2.7,
    boreAxisMm: 16,
    gasBeta: 1.5,
    basePulseDurationMs: 13.0,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 0.56,
    cyclicRpm: 1200,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  g11: {
    platformMassKg: 3.6,
    boreAxisMm: 18,
    gasBeta: 1.75,
    basePulseDurationMs: 14.5,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 0.84,
    cyclicRpm: 2100,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: false,
  },
  vss: {
    platformMassKg: 2.6,
    boreAxisMm: 26,
    gasBeta: 1.55,
    basePulseDurationMs: 13.8,
    factoryMuzzleRedirect: 0.24,
    climbCoupling: 0.92,
    cyclicRpm: 850,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: false,
  },
  m134: {
    platformMassKg: 30.8,
    boreAxisMm: 20,
    gasBeta: 1.75,
    basePulseDurationMs: 10.5,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 0.8,
    cyclicRpm: 3000,
    pivotKind: 'mount',
    supportsMuzzleDevices: false,
  },
  an94: {
    platformMassKg: 3.85,
    boreAxisMm: 24,
    gasBeta: 1.75,
    basePulseDurationMs: 15.2,
    factoryMuzzleRedirect: 0.28,
    climbCoupling: 0.82,
    cyclicRpm: 1800,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  ztz99a: {
    platformMassKg: 55000,
    boreAxisMm: 38,
    gasBeta: 2.05,
    basePulseDurationMs: 32.0,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 0.72,
    cyclicRpm: 0,
    pivotKind: 'trunnion',
    supportsMuzzleDevices: false,
  },
  m1a2: {
    platformMassKg: 66800,
    boreAxisMm: 40,
    gasBeta: 2.05,
    basePulseDurationMs: 33.5,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 0.7,
    cyclicRpm: 0,
    pivotKind: 'trunnion',
    supportsMuzzleDevices: false,
  },
  leopard2a7: {
    platformMassKg: 66500,
    boreAxisMm: 39,
    gasBeta: 2.05,
    basePulseDurationMs: 33.0,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 0.7,
    cyclicRpm: 0,
    pivotKind: 'trunnion',
    supportsMuzzleDevices: false,
  },
  tiger1: {
    platformMassKg: 57000,
    boreAxisMm: 44,
    gasBeta: 1.95,
    basePulseDurationMs: 30.0,
    factoryMuzzleRedirect: 0.38,
    climbCoupling: 0.78,
    cyclicRpm: 0,
    pivotKind: 'trunnion',
    supportsMuzzleDevices: true,
  },
  winchester1894: {
    platformMassKg: 3.1,
    boreAxisMm: 36,
    gasBeta: 1.72,
    basePulseDurationMs: 9.8,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 1.02,
    cyclicRpm: 0,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  rem870: {
    platformMassKg: 3.4,
    boreAxisMm: 32,
    gasBeta: 1.3,
    basePulseDurationMs: 10.6,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 1.0,
    cyclicRpm: 0,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  m1911: {
    platformMassKg: 1.105,
    boreAxisMm: 31,
    gasBeta: 1.5,
    basePulseDurationMs: 8.8,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 1.0,
    cyclicRpm: 0,
    pivotKind: 'wrist',
    supportsMuzzleDevices: true,
  },
  mg42: {
    platformMassKg: 11.6,
    boreAxisMm: 22,
    gasBeta: 1.75,
    basePulseDurationMs: 12.4,
    factoryMuzzleRedirect: 0.1,
    climbCoupling: 0.88,
    cyclicRpm: 1200,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  k98k: {
    platformMassKg: 3.92,
    boreAxisMm: 34,
    gasBeta: 1.75,
    basePulseDurationMs: 9.6,
    factoryMuzzleRedirect: 0.0,
    climbCoupling: 1.02,
    cyclicRpm: 0,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  thompson: {
    platformMassKg: 4.9,
    boreAxisMm: 42,
    gasBeta: 1.5,
    basePulseDurationMs: 11.0,
    factoryMuzzleRedirect: 0.2,
    climbCoupling: 1.04,
    cyclicRpm: 725,
    pivotKind: 'shoulder',
    supportsMuzzleDevices: true,
  },
  gau8: {
    platformMassKg: 1828,
    boreAxisMm: 18,
    gasBeta: 2.05,
    basePulseDurationMs: 14.5,
    factoryMuzzleRedirect: 0.04,
    climbCoupling: 0.72,
    cyclicRpm: 3900,
    pivotKind: 'mount',
    supportsMuzzleDevices: false,
  },
};

export interface RecoilExhibitProfile {
  weaponId: WeaponId;
  bayCode: string;
  category: RecoilCategory;
  projectileMassG: number;
  propellantMassG: number;
  muzzleVelocityMps: number;
  platformMassKg: number;
  boreAxisMm: number;
  gasBeta: number;
  basePulseDurationMs: number;
  factoryMuzzleRedirect: number;
  climbCoupling: number;
  cyclicRpm: number;
  pivotKind: 'wrist' | 'shoulder' | 'mount' | 'trunnion';
  supportsMuzzleDevices: boolean;
}

const CARTRIDGE_SPECS_MAP = CARTRIDGE_LAB_SPECS as Record<
  string,
  { propellantMassG: number } | undefined
>;

export const RECOIL_EXHIBIT_PROFILES: readonly RecoilExhibitProfile[] =
  WEAPON_MANIFESTS.map((manifest) => {
    const exact = EXACT_RECOIL_SPECS[manifest.id];
    const ballistics = getCaliberBallisticsSpec(manifest.caliberProfile);
    const cartridge = CARTRIDGE_SPECS_MAP[manifest.caliberProfile];
    const isArchery = manifest.catalog.category === 'archery';

    return {
      weaponId: manifest.id,
      bayCode: manifest.catalog.bayCode,
      category: manifest.catalog.category,
      projectileMassG: ballistics.projectileMassG,
      propellantMassG: isArchery ? 0 : (cartridge?.propellantMassG ?? 0),
      muzzleVelocityMps: ballistics.muzzleVelocityMps,
      platformMassKg: exact.platformMassKg,
      boreAxisMm: exact.boreAxisMm,
      gasBeta: isArchery ? 0 : exact.gasBeta,
      basePulseDurationMs: exact.basePulseDurationMs,
      factoryMuzzleRedirect: exact.factoryMuzzleRedirect,
      climbCoupling: exact.climbCoupling,
      cyclicRpm: exact.cyclicRpm,
      pivotKind: exact.pivotKind,
      supportsMuzzleDevices: exact.supportsMuzzleDevices,
    };
  });

const PROFILE_BY_ID: ReadonlyMap<WeaponId, RecoilExhibitProfile> = new Map(
  RECOIL_EXHIBIT_PROFILES.map((p) => [p.weaponId, p])
);

export function getRecoilExhibitProfile(
  weaponId: WeaponId
): RecoilExhibitProfile {
  return PROFILE_BY_ID.get(weaponId) ?? RECOIL_EXHIBIT_PROFILES[0];
}

export interface RecoilEvalConfig {
  muzzleDevice?: RecoilMuzzleOption;
  bufferEnabled?: boolean;
}

export interface RecoilWaveformSample {
  tMs: number;
  forceN: number;
  projectileForceN: number;
  gasForceN: number;
}

export interface RecoilDynamicsResult {
  weaponId: WeaponId;
  profile: RecoilExhibitProfile;
  muzzleDevice: RecoilMuzzleOption;
  bufferEnabled: boolean;
  /** Projectile momentum p_b = m_b * v_0 (N*s) */
  projectileMomentumNs: number;
  /** Unmitigated propellant gas-jet rocket momentum p_g = beta * m_p * v_0 (N*s) */
  rawGasJetMomentumNs: number;
  /** Momentum redirected/absorbed by muzzle device (N*s) */
  muzzleCounterThrustNs: number;
  /** Net propellant gas-jet momentum after muzzle device (N*s) */
  netGasJetMomentumNs: number;
  /** Total free-recoil impulse I = p_b + p_g_net (N*s) */
  totalImpulseNs: number;
  /** Free-recoil velocity v_r = I / M_platform (m/s) */
  freeRecoilVelocityMps: number;
  /** Free-recoil kinetic energy E_r = 0.5 * M * v_r^2 (J) */
  freeRecoilEnergyJ: number;
  /** Peak felt recoil force F_peak (N) */
  peakFeltForceN: number;
  /** Bore axis height lever arm h_bore (mm) */
  boreAxisMm: number;
  /** Peak muzzle-climb torque tau = F_peak * (h_bore / 1000) * coupling (N*m) */
  muzzleClimbTorqueNm: number;
  /** Sustained average recoil thrust at cyclic RPM (kN); 0 for semi/bolt/MBT */
  sustainedThrustKn: number;
  /** Effective pulse duration (ms) */
  pulseDurationMs: number;
  /** 120-point F(t) recoil impulse waveform across 0..40 ms */
  waveform: readonly RecoilWaveformSample[];
}

function resolveMuzzleGasRedirect(
  profile: RecoilExhibitProfile,
  muzzleDevice: RecoilMuzzleOption
): { redirectFrac: number; dwellStretch: number } {
  if (profile.propellantMassG <= 0 || profile.gasBeta <= 0) {
    return { redirectFrac: 0, dwellStretch: 1.0 };
  }
  switch (muzzleDevice) {
    case 'raw':
      return { redirectFrac: 0, dwellStretch: 1.0 };
    case 'factory':
      return {
        redirectFrac: profile.factoryMuzzleRedirect,
        dwellStretch: profile.weaponId === 'vss' ? 1.25 : 1.0,
      };
    case 'brake':
      return { redirectFrac: 0.44, dwellStretch: 1.0 };
    case 'suppressor':
      return { redirectFrac: 0.24, dwellStretch: 1.28 };
    case 'flash_hider':
      return { redirectFrac: 0.04, dwellStretch: 1.0 };
  }
}

/**
 * Computes exact Newton's 3rd law projectile + rocket gas-jet momentum,
 * muzzle-device counter-thrust, free-recoil energy, bore-axis climb torque,
 * and a momentum-conserving 120-point F(t) recoil force waveform (0..40 ms).
 */
export function evaluateRecoilDynamics(
  weaponId: WeaponId,
  config: RecoilEvalConfig = {}
): RecoilDynamicsResult {
  const profile = getRecoilExhibitProfile(weaponId);
  const muzzleDevice: RecoilMuzzleOption = config.muzzleDevice ?? 'factory';
  const bufferEnabled = Boolean(config.bufferEnabled);

  const mBulletKg = profile.projectileMassG / 1000;
  const mPropellantKg = profile.propellantMassG / 1000;
  const v0 = profile.muzzleVelocityMps;

  const projectileMomentumNs = mBulletKg * v0;
  const rawGasJetMomentumNs = profile.gasBeta * mPropellantKg * v0;

  const { redirectFrac, dwellStretch } = resolveMuzzleGasRedirect(
    profile,
    muzzleDevice
  );
  const muzzleCounterThrustNs = rawGasJetMomentumNs * redirectFrac;
  const netGasJetMomentumNs = Math.max(
    0,
    rawGasJetMomentumNs - muzzleCounterThrustNs
  );
  const totalImpulseNs = projectileMomentumNs + netGasJetMomentumNs;

  const freeRecoilVelocityMps = totalImpulseNs / profile.platformMassKg;
  const freeRecoilEnergyJ =
    0.5 * profile.platformMassKg * freeRecoilVelocityMps * freeRecoilVelocityMps;

  const bufferStretch = bufferEnabled ? 1.35 : 1.0;
  const pulseDurationMs = Math.min(
    38.0,
    profile.basePulseDurationMs * dwellStretch * bufferStretch
  );

  // Build momentum-conserving 120-point F(t) waveform over 0..40 ms:
  // Projectile acceleration pulse (skewed gamma shape) + delayed gas-jet rocket shoulder
  const dtMs = RECOIL_WAVEFORM_WINDOW_MS / (RECOIL_WAVEFORM_SAMPLES - 1);
  const dtSec = dtMs / 1000;

  const projTauMs = Math.max(0.8, pulseDurationMs * 0.24);
  const gasDelayMs = Math.max(0.4, pulseDurationMs * 0.18);
  const gasTauMs = Math.max(0.9, pulseDurationMs * 0.22);

  const rawProj: number[] = [];
  const rawGas: number[] = [];
  let sumProj = 0;
  let sumGas = 0;

  for (let i = 0; i < RECOIL_WAVEFORM_SAMPLES; i += 1) {
    const tMs = i * dtMs;
    const uP = tMs / projTauMs;
    const shapeP = uP > 0 ? Math.pow(uP, 1.65) * Math.exp(-uP) : 0;

    const tGas = Math.max(0, tMs - gasDelayMs);
    const uG = tGas / gasTauMs;
    const shapeG = uG > 0 ? Math.pow(uG, 1.45) * Math.exp(-uG) : 0;

    rawProj.push(shapeP);
    rawGas.push(shapeG);
    sumProj += shapeP;
    sumGas += shapeG;
  }

  const projScale =
    sumProj > 0 ? projectileMomentumNs / (sumProj * dtSec) : 0;
  const gasScale =
    sumGas > 0 ? netGasJetMomentumNs / (sumGas * dtSec) : 0;

  const waveform: RecoilWaveformSample[] = [];
  let peakFeltForceN = 0;

  for (let i = 0; i < RECOIL_WAVEFORM_SAMPLES; i += 1) {
    const tMs = Number((i * dtMs).toFixed(2));
    const projectileForceN = Number((rawProj[i] * projScale).toFixed(2));
    const gasForceN = Number((rawGas[i] * gasScale).toFixed(2));
    const forceN = Number((projectileForceN + gasForceN).toFixed(2));
    if (forceN > peakFeltForceN) {
      peakFeltForceN = forceN;
    }
    waveform.push({ tMs, forceN, projectileForceN, gasForceN });
  }

  const muzzleClimbTorqueNm =
    peakFeltForceN * (profile.boreAxisMm / 1000) * profile.climbCoupling;

  const sustainedThrustKn =
    profile.cyclicRpm > 0
      ? (totalImpulseNs * (profile.cyclicRpm / 60)) / 1000
      : 0;

  return {
    weaponId,
    profile,
    muzzleDevice,
    bufferEnabled,
    projectileMomentumNs: Number(projectileMomentumNs.toFixed(3)),
    rawGasJetMomentumNs: Number(rawGasJetMomentumNs.toFixed(3)),
    muzzleCounterThrustNs: Number(muzzleCounterThrustNs.toFixed(3)),
    netGasJetMomentumNs: Number(netGasJetMomentumNs.toFixed(3)),
    totalImpulseNs: Number(totalImpulseNs.toFixed(3)),
    freeRecoilVelocityMps: Number(freeRecoilVelocityMps.toFixed(3)),
    freeRecoilEnergyJ: Number(freeRecoilEnergyJ.toFixed(2)),
    peakFeltForceN: Number(peakFeltForceN.toFixed(1)),
    boreAxisMm: profile.boreAxisMm,
    muzzleClimbTorqueNm: Number(muzzleClimbTorqueNm.toFixed(2)),
    sustainedThrustKn: Number(sustainedThrustKn.toFixed(2)),
    pulseDurationMs: Number(pulseDurationMs.toFixed(1)),
    waveform,
  };
}

export interface RecoilMatchupPreset {
  id: RecoilPresetId;
  weaponA: WeaponId;
  weaponB: WeaponId;
  muzzleA: RecoilMuzzleOption;
  muzzleB: RecoilMuzzleOption;
  titleZh: string;
  titleEn: string;
  insightZh: string;
  insightEn: string;
}

export const RECOIL_MATCHUP_PRESETS: readonly RecoilMatchupPreset[] = [
  {
    id: 'vector_vs_thompson',
    weaponA: 'vector',
    weaponB: 'thompson',
    muzzleA: 'factory',
    muzzleB: 'factory',
    titleZh: 'KRISS Vector vs 汤姆逊 (.45 ACP 轴线对决)',
    titleEn: 'KRISS Vector vs Thompson (.45 ACP Bore-Axis)',
    insightZh: '同为 .45 ACP：16 mm 超低轴线 + Super V 向下偏转 vs 42 mm 下沉木托',
    insightEn: 'Same .45 ACP: 16 mm Super V bore axis vs 42 mm dropped walnut stock',
  },
  {
    id: 'm1911_vs_g17',
    weaponA: 'm1911',
    weaponB: 'g17',
    muzzleA: 'factory',
    muzzleB: 'factory',
    titleZh: 'M1911A1 (.45 锻钢) vs Glock 17 (9mm 聚合物)',
    titleEn: 'Colt M1911A1 (.45 Steel) vs Glock 17 (9mm)',
    insightZh: '全钢 1.1 kg 质量缓冲 .45 ACP 重冲量 vs 轻量化聚合物低轴线 9mm',
    insightEn: '1.1 kg forged steel absorbs .45 ACP vs ultralight 22 mm low-bore 9mm',
  },
  {
    id: 'm82a1_vs_awm',
    weaponA: 'm82a1',
    weaponB: 'awm',
    muzzleA: 'factory',
    muzzleB: 'factory',
    titleZh: '巴雷特 M82A1 (.50 BMG) vs AWM (.338 LM)',
    titleEn: 'Barrett M82A1 (.50 BMG) vs AWM (.338 LM)',
    insightZh: '箭头双室制退器偏转 46% 高压燃气射流 + 短后坐枪管缓冲',
    insightEn: 'Arrowhead brake deflects 46% gas-jet rocket thrust + recoiling barrel',
  },
  {
    id: 'gau8_vs_ztz99a',
    weaponA: 'gau8',
    weaponB: 'ztz99a',
    muzzleA: 'factory',
    muzzleB: 'factory',
    titleZh: 'GAU-8/A (44.5 kN 持续推力) vs ZTZ-99A (125mm)',
    titleEn: 'GAU-8/A (44.5 kN Thrust) vs ZTZ-99A (125mm)',
    insightZh: '3,900 RPM 航空机炮超越单台涡扇推力 vs 55 吨主战坦克液压驻退机',
    insightEn: '3,900 RPM rotary thrust rivals a TF34 turbofan vs 55 t hydro-recuperator',
  },
  {
    id: 'ak15_vs_m4a1',
    weaponA: 'ak15',
    weaponB: 'm4a1',
    muzzleA: 'factory',
    muzzleB: 'factory',
    titleZh: 'AK-15M1 (7.62×39) vs M4A1 (5.56 直托)',
    titleEn: 'AK-15M1 (7.62x39) vs M4A1 (5.56 In-Line)',
    insightZh: '俄式 7.62mm 制退器脉冲 vs 斯通纳 12 mm 直线缓冲管低上跳架构',
    insightEn: '7.62x39mm impulse vs Eugene Stoner 12 mm straight-line buffer tube',
  },
] as const;

export function formatForceValue(newtons: number): string {
  if (newtons >= 10000) {
    return `${(newtons / 1000).toFixed(1)} kN`;
  }
  if (newtons >= 1000) {
    return `${(newtons / 1000).toFixed(2)} kN`;
  }
  return `${Math.round(newtons).toLocaleString('en-US')} N`;
}

export function formatImpulse(ns: number): string {
  if (ns >= 1000) {
    return `${(ns / 1000).toFixed(2)} kN·s`;
  }
  if (ns >= 100) {
    return `${ns.toFixed(1)} N·s`;
  }
  return `${ns.toFixed(2)} N·s`;
}

export function formatTorque(nm: number): string {
  if (nm >= 1000) {
    return `${(nm / 1000).toFixed(2)} kN·m`;
  }
  return `${nm.toFixed(1)} N·m`;
}

export function formatRecoilEnergy(joules: number): string {
  if (joules >= 1000) {
    return `${(joules / 1000).toFixed(2)} kJ`;
  }
  return `${joules.toFixed(1)} J`;
}

export const RECOIL_LAB_STRINGS: Readonly<
  Record<
    LanguageCode,
    {
      kicker: string;
      title: string;
      subtitle: string;
      closeAria: string;
      presetsLabel: string;
      sideALabel: string;
      sideBLabel: string;
      muzzleLabel: string;
      muzzleRaw: string;
      muzzleFactory: string;
      muzzleBrake: string;
      muzzleSuppressor: string;
      bufferToggle: string;
      bufferHint: string;
      waveformHeading: string;
      waveformSub: string;
      waveformNormalizedNote: string;
      leverHeading: string;
      leverSub: string;
      momentumHeading: string;
      momentumProj: string;
      momentumGas: string;
      momentumBrakeSaved: string;
      kpiImpulse: string;
      kpiVelocity: string;
      kpiEnergy: string;
      kpiPeakForce: string;
      kpiClimbTorque: string;
      kpiSustainedThrust: string;
      kpiSingleShot: string;
      pivotLabels: Record<'wrist' | 'shoulder' | 'mount' | 'trunnion', string>;
      inspect3dBtn: string;
      split3dBtn: string;
      archeryZeroGasNote: string;
    }
  >
> = {
  zh: {
    kicker: '牛顿第三定律 · 后坐冲量与枪口上跳物理实验室',
    title: '后坐冲量、火药燃气射流与枪口上跳力矩交互实验室',
    subtitle:
      '基于动量守恒 I = m_b·v₀ + β·m_p·v₀ 实时解算全馆 34 款馆藏的弹头动量、火箭燃气射流、制退器反推减震、120 点 F(t) 力波形与枪管轴线力矩 τ = F·h_bore',
    closeAria: '关闭后坐与上跳物理实验室',
    presetsLabel: '经典后坐物理对决',
    sideALabel: '展品 A（青色曲线）',
    sideBLabel: '展品 B（琥珀曲线）',
    muzzleLabel: '枪口装置',
    muzzleRaw: '裸枪口',
    muzzleFactory: '原厂标配',
    muzzleBrake: '双室制退器',
    muzzleSuppressor: '7 级消音器',
    bufferToggle: '启用液压/缓冲垫 (+35% 脉冲展宽)',
    bufferHint: '动量守恒：展宽脉冲总冲量 I 不变，峰值体感力 F_peak 与上跳力矩同步降低 ~26%',
    waveformHeading: '双通道 120 点后坐力 F(t) 冲量波形 (0–40 ms)',
    waveformSub: '曲线下面积严格等于自由后坐总冲量 ∫F(t)dt = I_total',
    waveformNormalizedNote: '跨量级对比已启用独立纵轴归一化，悬停/卡片显示精确物理读数',
    leverHeading: '枪管轴线高度 h_bore 与枪口上跳力矩 τ = F_peak · h_bore',
    leverSub: '轴线越贴近握持支点（如 KRISS Vector 16 mm、M4A1 12 mm），翻转上跳力矩越小',
    momentumHeading: '动量来源分解（弹头动量 vs 火箭燃气射流 vs 制退器抵消）',
    momentumProj: '弹头动量 p_b',
    momentumGas: '净燃气射流 p_g',
    momentumBrakeSaved: '制退/消音抵消 -Δp',
    kpiImpulse: '总后坐冲量 I',
    kpiVelocity: '自由后坐初速 v_r',
    kpiEnergy: '自由后坐动能 E_r',
    kpiPeakForce: '峰值体感后坐力',
    kpiClimbTorque: '枪口上跳力矩 τ',
    kpiSustainedThrust: '连发持续平均推力',
    kpiSingleShot: '单发 / 手动循环',
    pivotLabels: {
      wrist: '腕部支点',
      shoulder: '抵肩支点',
      mount: '机炮/武器架支点',
      trunnion: '炮塔耳轴支点',
    },
    inspect3dBtn: '3D 拆解',
    split3dBtn: '双屏 3D 剖视对比',
    archeryZeroGasNote: '复合弓弩无火药燃气射流（β = 0，纯箭矢弹性动量）',
  },
  en: {
    kicker: "NEWTON'S 3RD LAW · RECOIL IMPULSE & MUZZLE-CLIMB PHYSICS LAB",
    title: 'Interactive Recoil Impulse, Gas-Jet Momentum & Muzzle-Climb Torque Lab',
    subtitle:
      'Solve exact momentum conservation I = m_b*v0 + beta*m_p*v0 across all 34 exhibits: bullet momentum, rocket gas-jet thrust, muzzle-brake counter-thrust, 120-point F(t) force waveforms, and bore-axis torque tau = F*h_bore',
    closeAria: 'Close Recoil & Muzzle-Climb Physics Lab',
    presetsLabel: 'Iconic Recoil Matchups',
    sideALabel: 'Exhibit A (Cyan Trace)',
    sideBLabel: 'Exhibit B (Amber Trace)',
    muzzleLabel: 'Muzzle Device',
    muzzleRaw: 'Raw Crown',
    muzzleFactory: 'Factory',
    muzzleBrake: 'Dual-Brake',
    muzzleSuppressor: 'Suppressor',
    bufferToggle: 'Platform Buffer / Pad (+35% Pulse Stretch)',
    bufferHint:
      'Conservation of momentum: stretching pulse duration keeps total impulse I identical while cutting peak force and climb torque ~26%',
    waveformHeading: 'Dual-Channel 120-Point Recoil Force F(t) Waveform (0-40 ms)',
    waveformSub: 'Area under each curve equals exact free-recoil impulse Integral F(t)dt = I_total',
    waveformNormalizedNote:
      'Cross-scale pair uses normalized vertical peaks; KPI cards display exact Newton / kN figures',
    leverHeading: 'Bore-Axis Lever Arm h_bore & Muzzle-Climb Torque (tau = F_peak * h_bore)',
    leverSub:
      'Lower bore axis above the pivot (KRISS Vector 16 mm, M4A1 12 mm) dramatically cuts rotational muzzle flip',
    momentumHeading: 'Momentum Decomposition (Projectile vs Rocket Gas-Jet vs Muzzle Counter-Thrust)',
    momentumProj: 'Projectile p_b',
    momentumGas: 'Net Gas-Jet p_g',
    momentumBrakeSaved: 'Muzzle Offset -dp',
    kpiImpulse: 'Total Impulse I',
    kpiVelocity: 'Free-Recoil Vel v_r',
    kpiEnergy: 'Recoil Energy E_r',
    kpiPeakForce: 'Peak Felt Force',
    kpiClimbTorque: 'Climb Torque tau',
    kpiSustainedThrust: 'Sustained Auto Thrust',
    kpiSingleShot: 'Single / Manual Cycle',
    pivotLabels: {
      wrist: 'Wrist Pivot',
      shoulder: 'Shoulder Pivot',
      mount: 'Cradle Mount Pivot',
      trunnion: 'Turret Trunnion',
    },
    inspect3dBtn: 'Inspect in 3D',
    split3dBtn: 'Compare in Split 3D',
    archeryZeroGasNote: 'Compound archery has zero propellant gas-jet momentum (beta = 0)',
  },
};
