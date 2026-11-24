import type {
  ArmorPenetrationResult,
  LayerDefeatResult,
  PenetrationOutcome,
} from '../../engine/physics/armorPenetration';

/** Exact Digital Armory 3D world unit scale: 1 world unit = 1 cm = 10 mm. */
export const MM_TO_WORLD_CM = 0.1;

/** Normalized timeline milestones over `progress` in [0, 1]. */
export const THEATER_T_IMPACT = 0.22;
export const THEATER_T_PERFORATION_EXIT = 0.62;
export const THEATER_T_DEFEAT_STALL = 0.68;
export const THEATER_T_RICOCHET_PIVOT_END = 0.3;

export const SPALL_PARTICLE_COUNT = 56;
export const SPARK_PARTICLE_COUNT = 56;
export const BACK_JET_PARTICLE_COUNT = 36;
export const BACK_JET_CONE_MIN_DEG = 32;
export const BACK_JET_CONE_MAX_DEG = 52;
export const HYDRODYNAMIC_LONG_ROD_RESIDUAL_MIN = 0.34;
export const HYDRODYNAMIC_RIGID_AP_RESIDUAL_MIN = 0.82;
export const HYDRODYNAMIC_RICOCHET_RESIDUAL_MIN = 0.95;

export interface HydrodynamicRodErosionSample {
  /** Remaining longitudinal fraction of penetrator length `[0.34..1.0]` */
  remainingLengthRatio: number;
  /** Radial tip mushrooming / adiabatic shear-band flare multiplier `[1.0..1.7]` */
  mushroomTipScale: number;
  /** Molten crater back-jet ejecta spray intensity `[0..1]` during active transit */
  backJetIntensity01: number;
  /** Hydrodynamic penetration channel radial dilation multiplier `[1.0..1.28]` */
  erosionChannelRadiusMult: number;
}

export type TheaterPlaybackSpeed = 0.15 | 0.5 | 1;

export type TheaterPhase =
  | 'approach'
  | 'era_detonation'
  | 'penetration'
  | 'perforation_spall'
  | 'defeated_arrest'
  | 'ricochet_deflect';

export type ArmorLayerVisualKind =
  | 'era'
  | 'ceramic_nera'
  | 'du_composite'
  | 'rha_steel';

export interface ArmorLayerLayout {
  index: number;
  nameZh: string;
  nameEn: string;
  colorHex: string;
  isEra: boolean;
  defeated: boolean;
  kind: ArmorLayerVisualKind;
  physicalMm: number;
  effectiveLosMm: number;
  rhaEquivalentMm: number;
  /** Layer start offset along tilted armor inward normal (cm). */
  localStartCm: number;
  /** Physical normal thickness (cm). */
  localThicknessCm: number;
  /** Layer end offset along tilted armor inward normal (cm). */
  localEndCm: number;
  /** Horizontal line-of-sight start coordinate along +X ray (cm). */
  losStartCm: number;
  /** Horizontal line-of-sight length along +X ray (cm). */
  losLengthCm: number;
  /** Horizontal line-of-sight end coordinate along +X ray (cm). */
  losEndCm: number;
  /** Fraction [0..1] of this layer penetrated by the projectile. */
  breachFraction: number;
}

export interface ArmorTheaterLayout {
  result: ArmorPenetrationResult;
  outcome: PenetrationOutcome;
  eraActive: boolean;
  eraLayerIndex: number;
  obliquityDeg: number;
  naturalSlopeDeg: number;
  effectiveImpactAngleDeg: number;
  /** Visual slab tilt angle (deg) in XY cutaway plane, matching effective angle up to 78 deg. */
  visualTiltDeg: number;
  visualTiltRad: number;
  /** Outward surface normal unit vector of the tilted front face (pointing toward -X / +Y). */
  outwardNormalX: number;
  outwardNormalY: number;
  /** Inward normal unit vector into the armor stack (+X / -Y). */
  inwardNormalX: number;
  inwardNormalY: number;
  /** Up-slope tangent unit vector lying on the front armor face (+X / +Y). */
  slopeTangentX: number;
  slopeTangentY: number;
  totalPhysicalCm: number;
  totalLosCm: number;
  /** Geometry dimensions of the 3D cutaway armor cross-section block (cm). */
  slabHeightCm: number;
  slabDepthCm: number;
  slabLocalCenterYCm: number;
  layers: readonly ArmorLayerLayout[];
  /** Penetrator physical 1:1 dimensions (cm). */
  penetratorLengthCm: number;
  penetratorDiameterCm: number;
  approachStartXCm: number;
  /** Maximum hydrodynamic cavity depth along horizontal +X ray (cm). */
  maxCavityDepthLosCm: number;
  /** Maximum cavity depth projected onto armor inward normal (cm). */
  maxCavityDepthNormalCm: number;
  /** Index of layer that arrested the penetrator (-1 if perforated or ricocheted). */
  stoppedLayerIndex: number;
  /** Remaining intact fraction of penetrator length after erosion [0.18..0.95]. */
  residualLengthFraction: number;
  /** Post-interaction velocity (m/s): exit velocity on perforation, deflected velocity on ricochet, 0 on arrest. */
  residualVelocityMps: number;
  exitXCm: number;
  crewZoneStartXCm: number;
  crewZoneEndXCm: number;
  /** Behind-Armor Spall (BAP) cone parameters (zero unless outcome === 'perforation'). */
  spallConeHalfAngleDeg: number;
  spallConeHalfAngleRad: number;
  spallLeadVelocityMps: number;
  spallMaxReachCm: number;
  /** Post-ricochet deflected unit vector in XY plane (strictly outward from sloped face). */
  ricochetDirX: number;
  ricochetDirY: number;
  ricochetDeflectionAngleDeg: number;
  ricochetTravelCm: number;
  /** ERA flyer plate peak normal separation distances (cm). */
  eraMaxFrontFlyerDistCm: number;
  eraMaxRearFlyerDistCm: number;
  /** Camera framing hints so all tanks & calibers sit centered in the theater viewport. */
  recommendedCameraDistanceCm: number;
  recommendedTargetXCm: number;
  recommendedTargetYCm: number;
}

/**
 * Mutable per-frame state updated in-place by `evaluateArmorTheaterFrameInto`
 * for Zero-GC 60fps `useFrame` animation.
 */
export interface ArmorTheaterFrameState {
  progress: number;
  phase: TheaterPhase;
  rodNoseX: number;
  rodNoseY: number;
  rodNoseZ: number;
  rodPitchRad: number;
  rodLengthFraction: number;
  rodGlowIntensity: number;
  /** Normalized armor transit progress `[0..1]` driving Tate hydrodynamic erosion */
  penetrationFrac01: number;
  /** Radial self-sharpening mushroom tip flare multiplier `[1.0..1.7]` */
  rodMushroomTipScale: number;
  /** Molten crater back-jet ejecta intensity `[0..1]` (`0` pre-impact) */
  backJetIntensity01: number;
  /** Normalized progression `[0..1]` of backward molten crater ejecta streaks */
  backJetProgress: number;
  /** Hydrodynamic cavity radial expansion factor `[1.0..1.28]` */
  erosionChannelRadiusMult: number;
  cavityDepthLosCm: number;
  cavityRadiusCm: number;
  cavityGlowIntensity: number;
  impactFlashIntensity: number;
  shockwaveRadiusCm: number;
  shockwaveOpacity: number;
  arrestShockRadiusCm: number;
  arrestShockOpacity: number;
  eraDetonated: boolean;
  eraFlashIntensity: number;
  /** Outward normal separation of front ERA flyer plate (cm, >= 0). */
  eraFrontFlyerNormalCm: number;
  /** Up-slope tangential shear of front ERA flyer plate (cm). */
  eraFrontFlyerShearCm: number;
  /** World-space displacement of front ERA flyer plate (cm). */
  eraFrontFlyerOffsetX: number;
  eraFrontFlyerOffsetY: number;
  eraFrontFlyerTiltRad: number;
  /** Inward normal separation of rear ERA flyer plate (cm, >= 0). */
  eraRearFlyerNormalCm: number;
  /** Down-slope tangential shear of rear ERA flyer plate (cm). */
  eraRearFlyerShearCm: number;
  /** World-space displacement of rear ERA flyer plate (cm). */
  eraRearFlyerOffsetX: number;
  eraRearFlyerOffsetY: number;
  eraRearFlyerTiltRad: number;
  spallActive: boolean;
  spallProgress: number;
  spallConeLengthCm: number;
  spallConeRadiusCm: number;
  spallGlowIntensity: number;
  sparkActive: boolean;
  sparkProgress: number;
  sparkIntensity: number;
  crewAlertIntensity: number;
  currentVelocityMps: number;
}

export interface ParticleSeed {
  radialFrac: number;
  azimuthRad: number;
  speedScale: number;
  sizeCm: number;
  delayFrac: number;
  tumbleRateX: number;
  tumbleRateY: number;
  tumbleRateZ: number;
  lateralSpread: number;
}

export interface ParticleTransformOut {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  heat: number;
  visible: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function easeOutQuad(t: number): number {
  const u = clamp01(t);
  return 1 - (1 - u) * (1 - u);
}

function easeOutCubic(t: number): number {
  const u = clamp01(t);
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}

function classifyLayerKind(layer: LayerDefeatResult): ArmorLayerVisualKind {
  if (layer.isEra) return 'era';
  const hex = layer.colorHex.toLowerCase();
  const en = layer.nameEn.toLowerCase();
  if (hex === '#10b981' || en.includes('uranium') || en.includes('du ')) {
    return 'du_composite';
  }
  if (
    hex === '#0ea5e9' ||
    hex === '#38bdf8' ||
    en.includes('ceramic') ||
    en.includes('nera') ||
    en.includes('composite') ||
    en.includes('arrowhead')
  ) {
    return 'ceramic_nera';
  }
  return 'rha_steel';
}

function createDeterministicSeeds(
  count: number,
  seedInit: number
): readonly ParticleSeed[] {
  const seeds: ParticleSeed[] = [];
  let state = seedInit >>> 0;
  const nextRand = (): number => {
    // Mulberry32 deterministic PRNG (zero allocation, identical across platforms)
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const r1 = nextRand();
    const r2 = nextRand();
    const r3 = nextRand();
    const r4 = nextRand();
    const r5 = nextRand();
    const r6 = nextRand();
    const r7 = nextRand();
    const r8 = nextRand();
    const r9 = nextRand();

    seeds.push({
      // Bias slightly toward dense bright center core while filling outer cone edge
      radialFrac: 0.08 + 0.92 * Math.pow(r1, 0.72),
      azimuthRad: r2 * Math.PI * 2,
      speedScale: 0.38 + 0.72 * r3,
      sizeCm: 0.42 + 1.08 * r4,
      delayFrac: r5 * 0.2,
      tumbleRateX: (r6 - 0.5) * 14,
      tumbleRateY: (r7 - 0.5) * 14,
      tumbleRateZ: (r8 - 0.5) * 14,
      lateralSpread: (r9 - 0.5) * 2,
    });
  }
  return seeds;
}

export const SPALL_PARTICLE_SEEDS: readonly ParticleSeed[] =
  createDeterministicSeeds(SPALL_PARTICLE_COUNT, 0x99a12501);

export const SPARK_PARTICLE_SEEDS: readonly ParticleSeed[] =
  createDeterministicSeeds(SPARK_PARTICLE_COUNT, 0x88f4c307);

export const BACK_JET_PARTICLE_SEEDS: readonly ParticleSeed[] =
  createDeterministicSeeds(BACK_JET_PARTICLE_COUNT, 0x71e4b903);

export function createMutableHydrodynamicRodErosion(): HydrodynamicRodErosionSample {
  return {
    remainingLengthRatio: 1,
    mushroomTipScale: 1,
    backJetIntensity01: 0,
    erosionChannelRadiusMult: 1,
  };
}

/**
 * Zero-GC Tate / Alekseevskii hydrodynamic penetrator erosion & molten crater
 * back-jet evaluator writing directly into `out`:
 * - Long-rod APFSDS (`125mm DTC10-125`, `120mm M829A4 / DM63`): erodes
 *   monotonically from `1.0 -> 0.34` with pronounced self-sharpening mushroom tip
 *   flare and intense molten hydrodynamic back-jet spray.
 * - Rigid AP / API shells (`88mm PzGr.39`, `30mm PGU-14/B`, `.50 BMG M2 AP`):
 *   preserve rigid core length (`1.0 -> 0.82`) with moderate splashback.
 * - Ricochets: remain virtually un-eroded (`>= 0.95`) with grazing flash only.
 */
export function writeHydrodynamicRodErosionInto(
  penetrationFrac01: number,
  isLongRodApfsds: boolean,
  isRicochet: boolean,
  out: HydrodynamicRodErosionSample
): HydrodynamicRodErosionSample {
  const f = Number.isFinite(penetrationFrac01)
    ? clamp01(penetrationFrac01)
    : 0;

  if (f <= 0) {
    out.remainingLengthRatio = 1;
    out.mushroomTipScale = 1;
    out.backJetIntensity01 = 0;
    out.erosionChannelRadiusMult = 1;
    return out;
  }

  if (isRicochet) {
    const ease = easeOutQuad(f);
    out.remainingLengthRatio =
      1 - (1 - HYDRODYNAMIC_RICOCHET_RESIDUAL_MIN) * ease;
    out.mushroomTipScale = 1 + 0.12 * Math.sin(f * Math.PI);
    out.backJetIntensity01 = 0.24 * Math.sin(f * Math.PI);
    out.erosionChannelRadiusMult = 1 + 0.05 * ease;
    return out;
  }

  if (isLongRodApfsds) {
    const erodeCurve = 0.72 * f + 0.28 * easeOutQuad(f);
    out.remainingLengthRatio =
      1 - (1 - HYDRODYNAMIC_LONG_ROD_RESIDUAL_MIN) * erodeCurve;
    out.mushroomTipScale =
      1 + 0.66 * Math.pow(Math.sin(Math.min(1, f * 1.04) * Math.PI * 0.88), 0.72);
    out.backJetIntensity01 = clamp01(
      Math.pow(Math.sin(f * Math.PI), 0.52) * (1.12 - 0.2 * f)
    );
    out.erosionChannelRadiusMult = 1 + 0.26 * easeOutQuad(f);
    return out;
  }

  const rigidEase = easeOutQuad(f);
  out.remainingLengthRatio =
    1 - (1 - HYDRODYNAMIC_RIGID_AP_RESIDUAL_MIN) * rigidEase;
  out.mushroomTipScale = 1 + 0.26 * Math.pow(Math.sin(f * Math.PI), 0.7);
  out.backJetIntensity01 = clamp01(Math.pow(Math.sin(f * Math.PI), 0.58) * 0.76);
  out.erosionChannelRadiusMult = 1 + 0.12 * rigidEase;
  return out;
}

/**
 * Pure allocating wrapper for `writeHydrodynamicRodErosionInto`.
 */
export function computeHydrodynamicRodErosion(
  penetrationFrac01: number,
  isLongRodApfsds: boolean,
  isRicochet: boolean
): HydrodynamicRodErosionSample {
  return writeHydrodynamicRodErosionInto(
    penetrationFrac01,
    isLongRodApfsds,
    isRicochet,
    createMutableHydrodynamicRodErosion()
  );
}

const _erosionScratch: HydrodynamicRodErosionSample =
  createMutableHydrodynamicRodErosion();

/**
 * Computes the complete static 1:1 3D theater geometry & terminal-ballistic
 * boundary layout directly from `evaluateArmorPenetration()` output.
 */
export function buildArmorTheaterLayout(
  result: ArmorPenetrationResult
): ArmorTheaterLayout {
  const visualTiltDeg = clamp(result.effectiveImpactAngleDeg, 0, 78);
  const visualTiltRad = (visualTiltDeg * Math.PI) / 180;
  const cosTilt = Math.cos(visualTiltRad);
  const sinTilt = Math.sin(visualTiltRad);
  const tanTilt = sinTilt / Math.max(0.18, cosTilt);

  // Armor front face passes through (0, 0, 0) and slopes up-and-rearward (+X, +Y).
  const outwardNormalX = -cosTilt;
  const outwardNormalY = sinTilt;
  const inwardNormalX = cosTilt;
  const inwardNormalY = -sinTilt;
  const slopeTangentX = sinTilt;
  const slopeTangentY = cosTilt;

  // Build exact layer stack along normal & horizontal line-of-sight (+X)
  let accumLocalCm = 0;
  let accumLosCm = 0;
  let eraLayerIndex = -1;

  // Determine exact layer-by-layer physical stopping depth for partial_penetration
  let remRhaeMm = result.penetrationDepthRhaeMm;
  let stopLosMm = 0;
  let stopNormalMm = 0;
  let stoppedLayerIndex = -1;
  const layerBreachFracs: number[] = [];

  for (let i = 0; i < result.layerBreakdown.length; i++) {
    const layer = result.layerBreakdown[i];
    if (layer.isEra && eraLayerIndex === -1) {
      eraLayerIndex = i;
    }

    if (result.outcome === 'perforation') {
      layerBreachFracs.push(1);
    } else if (result.outcome === 'ricochet') {
      layerBreachFracs.push(i === 0 ? 0.12 : 0);
    } else {
      // partial_penetration: consume RHAe layer by layer
      if (stoppedLayerIndex !== -1) {
        layerBreachFracs.push(0);
      } else if (layer.defeated && remRhaeMm >= layer.rhaEquivalentMm) {
        remRhaeMm = Math.max(0, remRhaeMm - layer.rhaEquivalentMm);
        stopLosMm += layer.effectiveLosMm;
        stopNormalMm += layer.physicalMm;
        layerBreachFracs.push(1);
      } else {
        const frac =
          layer.rhaEquivalentMm > 0
            ? clamp(remRhaeMm / layer.rhaEquivalentMm, 0.04, 0.94)
            : 0.04;
        stopLosMm += layer.effectiveLosMm * frac;
        stopNormalMm += layer.physicalMm * frac;
        stoppedLayerIndex = i;
        remRhaeMm = 0;
        layerBreachFracs.push(frac);
      }
    }
  }

  // Compute exact visual LOS per layer consistent with the visual tilt angle
  // so the 3D cutaway cavity ends at the exact geometric back face of the tilted block.
  const visualLosScale = 1 / Math.max(0.2, cosTilt);
  const layers: ArmorLayerLayout[] = [];
  for (let i = 0; i < result.layerBreakdown.length; i++) {
    const layer = result.layerBreakdown[i];
    const localThicknessCm = Math.max(0.8, layer.physicalMm * MM_TO_WORLD_CM);
    const losLengthCm = localThicknessCm * visualLosScale;
    layers.push({
      index: i,
      nameZh: layer.nameZh,
      nameEn: layer.nameEn,
      colorHex: layer.colorHex,
      isEra: layer.isEra,
      defeated: layer.defeated,
      kind: classifyLayerKind(layer),
      physicalMm: layer.physicalMm,
      effectiveLosMm: layer.effectiveLosMm,
      rhaEquivalentMm: layer.rhaEquivalentMm,
      localStartCm: accumLocalCm,
      localThicknessCm,
      localEndCm: accumLocalCm + localThicknessCm,
      losStartCm: accumLosCm,
      losLengthCm,
      losEndCm: accumLosCm + losLengthCm,
      breachFraction: layerBreachFracs[i] ?? 0,
    });
    accumLocalCm += localThicknessCm;
    accumLosCm += losLengthCm;
  }

  const totalPhysicalCm = Math.max(5, accumLocalCm);
  const totalLosCm = Math.max(5, accumLosCm);

  // Convert stopping depth to the visual LOS coordinate frame so the cavity stops
  // cleanly inside the exact arresting layer in 3D space.
  let maxCavityDepthLosCm: number;
  let maxCavityDepthNormalCm: number;
  if (result.outcome === 'perforation') {
    maxCavityDepthLosCm = totalLosCm;
    maxCavityDepthNormalCm = totalPhysicalCm;
  } else if (result.outcome === 'ricochet') {
    const gougeCm = clamp(
      result.projectile.coreDiameterMm * MM_TO_WORLD_CM * 1.4,
      5.5,
      11.5
    );
    maxCavityDepthLosCm = Math.min(gougeCm, totalLosCm * 0.35);
    maxCavityDepthNormalCm = maxCavityDepthLosCm * cosTilt;
  } else {
    const exactLosCm =
      result.effectiveLosThicknessMm > 0
        ? (stopLosMm / result.effectiveLosThicknessMm) * totalLosCm
        : stopLosMm * MM_TO_WORLD_CM;
    maxCavityDepthLosCm = clamp(exactLosCm, 1.5, totalLosCm * 0.94);
    maxCavityDepthNormalCm = clamp(
      stopNormalMm * MM_TO_WORLD_CM,
      1.0,
      totalPhysicalCm * 0.94
    );
    if (stoppedLayerIndex === -1 && layers.length > 0) {
      stoppedLayerIndex = layers.length - 1;
    }
  }

  const penetratorLengthCm = Math.max(
    4.5,
    result.projectile.coreLengthMm * MM_TO_WORLD_CM
  );
  const penetratorDiameterCm = Math.max(
    1.0,
    result.projectile.coreDiameterMm * MM_TO_WORLD_CM
  );

  // Approach start gives comfortable visual run-up for both 64cm APFSDS and 5.9cm .50 BMG
  const approachStartXCm = -Math.max(46, penetratorLengthCm * 0.95 + 22);

  // Compute residual rod length fraction & velocity after armor interaction
  const safePenRhae = Math.max(1, result.penetrationDepthRhaeMm);
  const overmatchFrac = clamp01(result.overmatchMarginMm / safePenRhae);

  let residualLengthFraction: number;
  let residualVelocityMps: number;
  if (result.outcome === 'perforation') {
    residualLengthFraction = result.projectile.isSubCaliberRod
      ? clamp(0.24 + 0.56 * overmatchFrac, 0.24, 0.8)
      : clamp(0.68 + 0.24 * overmatchFrac, 0.68, 0.92);
    residualVelocityMps =
      result.impactVelocityMps *
      Math.sqrt(clamp(0.1 + 0.84 * overmatchFrac, 0.1, 0.94));
  } else if (result.outcome === 'ricochet') {
    residualLengthFraction = result.projectile.isSubCaliberRod ? 0.84 : 0.94;
    // Glancing deflection retains tangential momentum (~65-82% of impact speed)
    residualVelocityMps =
      result.impactVelocityMps * clamp(0.62 + 0.24 * sinTilt, 0.62, 0.86);
  } else {
    residualLengthFraction = result.projectile.isSubCaliberRod ? 0.2 : 0.42;
    residualVelocityMps = 0;
  }

  // Behind-Armor Spall (BAP) cone physics (only active on perforation)
  let spallConeHalfAngleDeg = 0;
  let spallLeadVelocityMps = 0;
  let spallMaxReachCm = 0;
  if (result.outcome === 'perforation') {
    // High overmatch produces tighter, faster hypervelocity spall jet;
    // near-threshold perforation causes wider plate petalling & broader spall cone.
    const baseAngle = result.projectile.isSubCaliberRod ? 32 : 36;
    spallConeHalfAngleDeg = clamp(
      baseAngle - 12 * overmatchFrac + (result.eraActive ? 2.5 : 0),
      18,
      38
    );
    spallLeadVelocityMps = clamp(
      residualVelocityMps * (0.72 + 0.22 * overmatchFrac),
      180,
      result.impactVelocityMps * 0.95
    );
    spallMaxReachCm = clamp(
      42 + 28 * overmatchFrac + Math.min(12, result.impactEnergyMJ * 0.9),
      42,
      74
    );
  }
  const spallConeHalfAngleRad = (spallConeHalfAngleDeg * Math.PI) / 180;

  // Inelastic ricochet deflection vector off sloped face normal (e_n = 0.34)
  // Incoming direction d_in = (1, 0), outward normal n_out = (-cosTilt, +sinTilt).
  // d_in · n_out = -cosTilt; reflected = d_in - (1 + e_n)(d_in · n_out) n_out
  const restitutionNormal = result.projectile.isSubCaliberRod ? 0.28 : 0.38;
  const normalImpulse = (1 + restitutionNormal) * cosTilt;
  const rawRicX = 1 + normalImpulse * outwardNormalX;
  const rawRicY = normalImpulse * outwardNormalY;
  const rawRicLen = Math.hypot(rawRicX, rawRicY) || 1;
  const ricochetDirX = rawRicX / rawRicLen;
  const ricochetDirY = rawRicY / rawRicLen;
  const ricochetDeflectionAngleDeg =
    (Math.atan2(ricochetDirY, ricochetDirX) * 180) / Math.PI;
  const ricochetTravelCm = Math.max(58, penetratorLengthCm * 1.05 + 26);

  // ERA flyer plate separation distances (FY-4 / ARAT-II twin steel flyer plates)
  const eraActive = result.eraActive && eraLayerIndex !== -1;
  const eraScale = result.outcome === 'ricochet' ? 0.65 : 1.0;
  const eraMaxFrontFlyerDistCm = eraActive
    ? clamp(22 + result.impactEnergyMJ * 0.9, 22, 34) * eraScale
    : 0;
  const eraMaxRearFlyerDistCm = eraActive ? 5.2 * eraScale : 0;

  // Size cutaway armor slab height so horizontal ray always enters/exits cleanly inside the slab
  const activeDepthForHeightCm =
    result.outcome === 'ricochet'
      ? Math.min(totalPhysicalCm, 18)
      : Math.min(totalPhysicalCm, maxCavityDepthNormalCm + 6);
  const verticalTraverseCm = Math.min(145, activeDepthForHeightCm * tanTilt);
  const slabHeightCm = clamp(verticalTraverseCm + 58, 66, 200);
  const slabLocalCenterYCm = verticalTraverseCm * 0.45;
  const slabDepthCm = 44;

  const exitXCm = totalLosCm;
  const crewZoneStartXCm = exitXCm + 1.5;
  const crewZoneEndXCm = exitXCm + Math.max(56, spallMaxReachCm + 8);

  // Camera framing span covering approach + armor stack + exit/crew zone
  const spanLeft = Math.abs(approachStartXCm) * 0.62;
  const spanRight =
    result.outcome === 'perforation'
      ? exitXCm + spallMaxReachCm * 0.62
      : result.outcome === 'ricochet'
        ? Math.max(totalLosCm * 0.65, 48)
        : Math.max(totalLosCm * 0.95, 42);
  const totalSpanX = spanLeft + spanRight;
  const recommendedTargetXCm = (spanRight - spanLeft) * 0.42;
  const recommendedTargetYCm =
    result.outcome === 'ricochet' ? 14 : slabLocalCenterYCm * 0.22;
  const recommendedCameraDistanceCm = clamp(
    Math.max(totalSpanX * 1.04, slabHeightCm * 1.38, 146),
    136,
    275
  );

  return {
    result,
    outcome: result.outcome,
    eraActive,
    eraLayerIndex,
    obliquityDeg: result.obliquityDeg,
    naturalSlopeDeg: result.zone.naturalSlopeDeg,
    effectiveImpactAngleDeg: result.effectiveImpactAngleDeg,
    visualTiltDeg,
    visualTiltRad,
    outwardNormalX,
    outwardNormalY,
    inwardNormalX,
    inwardNormalY,
    slopeTangentX,
    slopeTangentY,
    totalPhysicalCm,
    totalLosCm,
    slabHeightCm,
    slabDepthCm,
    slabLocalCenterYCm,
    layers,
    penetratorLengthCm,
    penetratorDiameterCm,
    approachStartXCm,
    maxCavityDepthLosCm,
    maxCavityDepthNormalCm,
    stoppedLayerIndex,
    residualLengthFraction,
    residualVelocityMps,
    exitXCm,
    crewZoneStartXCm,
    crewZoneEndXCm,
    spallConeHalfAngleDeg,
    spallConeHalfAngleRad,
    spallLeadVelocityMps,
    spallMaxReachCm,
    ricochetDirX,
    ricochetDirY,
    ricochetDeflectionAngleDeg,
    ricochetTravelCm,
    eraMaxFrontFlyerDistCm,
    eraMaxRearFlyerDistCm,
    recommendedCameraDistanceCm,
    recommendedTargetXCm,
    recommendedTargetYCm,
  };
}

/** Allocates a reusable mutable frame state object for Zero-GC updates. */
export function createArmorTheaterFrameState(): ArmorTheaterFrameState {
  return {
    progress: 0,
    phase: 'approach',
    rodNoseX: -50,
    rodNoseY: 0,
    rodNoseZ: 0,
    rodPitchRad: 0,
    rodLengthFraction: 1,
    rodGlowIntensity: 0,
    penetrationFrac01: 0,
    rodMushroomTipScale: 1,
    backJetIntensity01: 0,
    backJetProgress: 0,
    erosionChannelRadiusMult: 1,
    cavityDepthLosCm: 0,
    cavityRadiusCm: 1.5,
    cavityGlowIntensity: 0,
    impactFlashIntensity: 0,
    shockwaveRadiusCm: 0,
    shockwaveOpacity: 0,
    arrestShockRadiusCm: 0,
    arrestShockOpacity: 0,
    eraDetonated: false,
    eraFlashIntensity: 0,
    eraFrontFlyerNormalCm: 0,
    eraFrontFlyerShearCm: 0,
    eraFrontFlyerOffsetX: 0,
    eraFrontFlyerOffsetY: 0,
    eraFrontFlyerTiltRad: 0,
    eraRearFlyerNormalCm: 0,
    eraRearFlyerShearCm: 0,
    eraRearFlyerOffsetX: 0,
    eraRearFlyerOffsetY: 0,
    eraRearFlyerTiltRad: 0,
    spallActive: false,
    spallProgress: 0,
    spallConeLengthCm: 0,
    spallConeRadiusCm: 0,
    spallGlowIntensity: 0,
    sparkActive: false,
    sparkProgress: 0,
    sparkIntensity: 0,
    crewAlertIntensity: 0,
    currentVelocityMps: 0,
  };
}

/**
 * Pure, Zero-GC frame evaluator writing directly into `out`.
 * Drives projectile motion, rod erosion, ERA flyer plates, hydrodynamic cavity,
 * behind-armor spall cone, shockwaves, and ricochet kinematics from `progress` in [0, 1].
 */
export function evaluateArmorTheaterFrameInto(
  layout: ArmorTheaterLayout,
  rawProgress: number,
  out: ArmorTheaterFrameState
): ArmorTheaterFrameState {
  const p = clamp01(rawProgress);
  const vImpact = layout.result.impactVelocityMps;
  const cavityBaseRadiusCm =
    layout.penetratorDiameterCm *
    0.5 *
    (layout.result.projectile.isSubCaliberRod ? 1.48 : 1.18);

  out.progress = p;
  out.rodNoseZ = 0;
  out.cavityRadiusCm =
    layout.outcome === 'ricochet'
      ? Math.max(0.65, Math.min(1.45, layout.penetratorDiameterCm * 0.18))
      : Math.max(0.85, cavityBaseRadiusCm);

  // Reset transient per-outcome channels cleanly
  out.penetrationFrac01 = 0;
  out.rodMushroomTipScale = 1;
  out.backJetIntensity01 = 0;
  out.backJetProgress = 0;
  out.erosionChannelRadiusMult = 1;
  out.arrestShockRadiusCm = 0;
  out.arrestShockOpacity = 0;
  out.spallActive = false;
  out.spallProgress = 0;
  out.spallConeLengthCm = 0;
  out.spallConeRadiusCm = 0;
  out.spallGlowIntensity = 0;
  out.sparkActive = false;
  out.sparkProgress = 0;
  out.sparkIntensity = 0;
  out.crewAlertIntensity = 0;

  // --- ERA reactive detonation & twin flyer plates (whenever eraActive && p >= impact) ---
  if (layout.eraActive && p >= THEATER_T_IMPACT) {
    const eraElapsed = clamp01((p - THEATER_T_IMPACT) / (1 - THEATER_T_IMPACT));
    const flyEase = easeOutQuad(clamp01(eraElapsed * 1.25));
    const frontNorm = layout.eraMaxFrontFlyerDistCm * flyEase;
    const frontShear = frontNorm * 0.22;
    const rearNorm = layout.eraMaxRearFlyerDistCm * easeOutCubic(clamp01(eraElapsed * 1.7));
    const rearShear = -rearNorm * 0.32;

    out.eraDetonated = true;
    // Intense rapid flash peaking right after contact, cooling to ember glow
    const flashRise = clamp01((p - THEATER_T_IMPACT) / 0.035);
    const flashDecay = Math.exp(-Math.max(0, p - THEATER_T_IMPACT - 0.035) * 6.5);
    out.eraFlashIntensity = flashRise * flashDecay;

    out.eraFrontFlyerNormalCm = frontNorm;
    out.eraFrontFlyerShearCm = frontShear;
    out.eraFrontFlyerOffsetX =
      frontNorm * layout.outwardNormalX + frontShear * layout.slopeTangentX;
    out.eraFrontFlyerOffsetY =
      frontNorm * layout.outwardNormalY + frontShear * layout.slopeTangentY;
    out.eraFrontFlyerTiltRad = -0.26 * flyEase;

    out.eraRearFlyerNormalCm = rearNorm;
    out.eraRearFlyerShearCm = rearShear;
    out.eraRearFlyerOffsetX =
      rearNorm * layout.inwardNormalX + rearShear * layout.slopeTangentX;
    out.eraRearFlyerOffsetY =
      rearNorm * layout.inwardNormalY + rearShear * layout.slopeTangentY;
    out.eraRearFlyerTiltRad = 0.09 * easeOutCubic(clamp01(eraElapsed * 1.7));
  } else {
    out.eraDetonated = false;
    out.eraFlashIntensity = 0;
    out.eraFrontFlyerNormalCm = 0;
    out.eraFrontFlyerShearCm = 0;
    out.eraFrontFlyerOffsetX = 0;
    out.eraFrontFlyerOffsetY = 0;
    out.eraFrontFlyerTiltRad = 0;
    out.eraRearFlyerNormalCm = 0;
    out.eraRearFlyerShearCm = 0;
    out.eraRearFlyerOffsetX = 0;
    out.eraRearFlyerOffsetY = 0;
    out.eraRearFlyerTiltRad = 0;
  }

  // --- Phase 1: Hypervelocity Approach (p < THEATER_T_IMPACT) ---
  if (p < THEATER_T_IMPACT) {
    const u = p / THEATER_T_IMPACT;
    out.phase = 'approach';
    out.rodNoseX = layout.approachStartXCm * (1 - u);
    out.rodNoseY = 0;
    out.rodPitchRad = 0;
    out.rodLengthFraction = 1;
    out.rodGlowIntensity = 0.14 + 0.12 * u;
    out.cavityDepthLosCm = 0;
    out.cavityGlowIntensity = 0;
    out.impactFlashIntensity = 0;
    out.shockwaveRadiusCm = 0;
    out.shockwaveOpacity = 0;
    out.currentVelocityMps = vImpact;
    return out;
  }

  // Shared primary impact flash & surface shockwave ring for p >= THEATER_T_IMPACT
  const postImpact = p - THEATER_T_IMPACT;
  const flashPeak = clamp01(postImpact / 0.028);
  out.impactFlashIntensity = flashPeak * Math.exp(-Math.max(0, postImpact - 0.028) * 10);

  const shockU = clamp01(postImpact / 0.42);
  out.shockwaveRadiusCm = 1.8 + 26 * easeOutCubic(shockU);
  out.shockwaveOpacity = (1 - shockU) * (1 - shockU) * 0.92;

  // --- Outcome A: PERFORATION ---
  const isLongRod = layout.result.projectile.isSubCaliberRod;
  if (layout.outcome === 'perforation') {
    if (p < THEATER_T_PERFORATION_EXIT) {
      const penU =
        (p - THEATER_T_IMPACT) /
        (THEATER_T_PERFORATION_EXIT - THEATER_T_IMPACT);
      // Slight hydrodynamic deceleration across the armor stack
      const depthCurve = 0.85 * penU + 0.15 * easeOutQuad(penU);
      const depthCm = layout.totalLosCm * depthCurve;
      const erosion = writeHydrodynamicRodErosionInto(
        penU,
        isLongRod,
        false,
        _erosionScratch
      );

      out.phase =
        layout.eraActive && p < THEATER_T_IMPACT + 0.11
          ? 'era_detonation'
          : 'penetration';
      out.rodNoseX = depthCm;
      out.rodNoseY = 0;
      out.rodPitchRad = 0;
      out.penetrationFrac01 = penU;
      out.rodLengthFraction = erosion.remainingLengthRatio;
      out.rodMushroomTipScale = erosion.mushroomTipScale;
      out.backJetIntensity01 = erosion.backJetIntensity01;
      out.backJetProgress = clamp01(penU * 0.82);
      out.erosionChannelRadiusMult = erosion.erosionChannelRadiusMult;
      out.rodGlowIntensity = 0.45 + 0.55 * penU;
      out.cavityDepthLosCm = depthCm;
      out.cavityGlowIntensity = 0.72 + 0.28 * Math.sin(penU * Math.PI);
      out.currentVelocityMps =
        vImpact - (vImpact - layout.residualVelocityMps) * penU;

      // Entry crater splashback sparks during active boring
      out.sparkActive = true;
      out.sparkProgress = clamp01(penU * 1.15);
      out.sparkIntensity = 1 - 0.55 * penU;
    } else {
      const exitU = clamp01(
        (p - THEATER_T_PERFORATION_EXIT) / (1 - THEATER_T_PERFORATION_EXIT)
      );
      const exitFlightCm = Math.max(48, layout.spallMaxReachCm * 0.95);
      const noseX = layout.exitXCm + exitFlightCm * exitU;
      const finalErosion = writeHydrodynamicRodErosionInto(
        1,
        isLongRod,
        false,
        _erosionScratch
      );

      out.phase = 'perforation_spall';
      out.rodNoseX = noseX;
      out.rodNoseY = -1.6 * exitU * exitU;
      out.rodPitchRad = -0.04 * exitU;
      out.penetrationFrac01 = 1;
      out.rodLengthFraction = finalErosion.remainingLengthRatio;
      out.rodMushroomTipScale =
        1 + (finalErosion.mushroomTipScale - 1) * (1 - 0.55 * exitU);
      // Residual molten ejecta smoothly fades to 0 post-perforation
      out.backJetIntensity01 =
        exitU < 0.36 ? 0.38 * (1 - exitU / 0.36) * (1 - exitU / 0.36) : 0;
      out.backJetProgress = clamp01(0.82 + exitU * 0.5);
      out.erosionChannelRadiusMult = finalErosion.erosionChannelRadiusMult;
      out.rodGlowIntensity = 0.95 * (1 - 0.45 * exitU);
      out.cavityDepthLosCm = layout.totalLosCm;
      out.cavityGlowIntensity = Math.max(0.28, 0.88 * (1 - 0.62 * exitU));
      out.currentVelocityMps = layout.residualVelocityMps;

      // Behind-Armor Spall (BAP) cone expansion inside crew compartment
      const spallEase = easeOutQuad(exitU);
      out.spallActive = true;
      out.spallProgress = exitU;
      out.spallConeLengthCm = Math.max(
        1.2,
        layout.spallMaxReachCm * spallEase
      );
      out.spallConeRadiusCm =
        Math.max(1.2, out.spallConeLengthCm * Math.tan(layout.spallConeHalfAngleRad)) +
        out.cavityRadiusCm * 0.8;
      out.spallGlowIntensity = (1 - 0.48 * exitU) * clamp01(exitU * 6 + 0.35);
      out.crewAlertIntensity = clamp01(exitU * 3.5) * (0.65 + 0.35 * (1 - exitU));

      // Cooling residual entry sparks
      out.sparkActive = exitU < 0.45;
      out.sparkProgress = clamp01(0.75 + exitU * 0.6);
      out.sparkIntensity = Math.max(0, 0.42 * (1 - exitU / 0.45));
    }
    return out;
  }

  // --- Outcome B: PARTIAL PENETRATION / DEFEATED ---
  if (layout.outcome === 'partial_penetration') {
    const stopRatio = clamp01(
      layout.maxCavityDepthLosCm / Math.max(1, layout.totalLosCm)
    );
    if (p < THEATER_T_DEFEAT_STALL) {
      const penU =
        (p - THEATER_T_IMPACT) / (THEATER_T_DEFEAT_STALL - THEATER_T_IMPACT);
      const depthEase = easeOutQuad(penU);
      const depthCm = layout.maxCavityDepthLosCm * depthEase;
      const effFrac = clamp01(Math.max(penU * 0.85, depthEase * stopRatio));
      const erosion = writeHydrodynamicRodErosionInto(
        effFrac,
        isLongRod,
        false,
        _erosionScratch
      );

      out.phase =
        layout.eraActive && p < THEATER_T_IMPACT + 0.11
          ? 'era_detonation'
          : 'penetration';
      out.rodNoseX = depthCm;
      out.rodNoseY = 0;
      out.rodPitchRad = 0;
      out.penetrationFrac01 = effFrac;
      out.rodLengthFraction = erosion.remainingLengthRatio;
      out.rodMushroomTipScale = erosion.mushroomTipScale;
      out.backJetIntensity01 = erosion.backJetIntensity01;
      out.backJetProgress = clamp01(penU * 0.86);
      out.erosionChannelRadiusMult = erosion.erosionChannelRadiusMult;
      out.rodGlowIntensity = 0.45 + 0.55 * penU;
      out.cavityDepthLosCm = depthCm;
      out.cavityGlowIntensity = 0.68 + 0.32 * Math.sin(penU * Math.PI);
      out.currentVelocityMps = vImpact * Math.max(0, 1 - penU);

      out.sparkActive = true;
      out.sparkProgress = penU;
      out.sparkIntensity = 1 - 0.38 * penU;
    } else {
      const restU = clamp01(
        (p - THEATER_T_DEFEAT_STALL) / (1 - THEATER_T_DEFEAT_STALL)
      );
      const stallFrac = clamp01(Math.max(0.85, stopRatio));
      const stallErosion = writeHydrodynamicRodErosionInto(
        stallFrac,
        isLongRod,
        false,
        _erosionScratch
      );

      out.phase = 'defeated_arrest';
      out.rodNoseX = layout.maxCavityDepthLosCm;
      out.rodNoseY = 0;
      out.rodPitchRad = 0;
      out.penetrationFrac01 = stallFrac;
      out.rodLengthFraction = stallErosion.remainingLengthRatio;
      out.rodMushroomTipScale =
        1 + (stallErosion.mushroomTipScale - 1) * (1 - 0.4 * restU);
      out.backJetIntensity01 =
        restU < 0.4 ? 0.34 * (1 - restU / 0.4) * (1 - restU / 0.4) : 0;
      out.backJetProgress = clamp01(0.86 + restU * 0.35);
      out.erosionChannelRadiusMult = stallErosion.erosionChannelRadiusMult;
      out.rodGlowIntensity = Math.max(0.22, 0.92 * (1 - 0.72 * restU));
      out.cavityDepthLosCm = layout.maxCavityDepthLosCm;
      out.cavityGlowIntensity = Math.max(0.2, 0.75 * (1 - 0.72 * restU));
      out.currentVelocityMps = 0;

      // Localized internal arrest stress/shockwave ring where armor halts the rod
      out.arrestShockRadiusCm = 1.5 + 22 * easeOutCubic(restU);
      out.arrestShockOpacity = (1 - restU) * (1 - restU) * 0.88;

      out.sparkActive = restU < 0.55;
      out.sparkProgress = clamp01(0.75 + restU * 0.45);
      out.sparkIntensity = Math.max(0, 0.45 * (1 - restU / 0.55));
    }
    return out;
  }

  // --- Outcome C: RICOCHET ---
  const ricAngleRad = Math.atan2(layout.ricochetDirY, layout.ricochetDirX);
  out.phase =
    layout.eraActive && p < THEATER_T_IMPACT + 0.08
      ? 'era_detonation'
      : 'ricochet_deflect';

  if (p < THEATER_T_RICOCHET_PIVOT_END) {
    const pivotU =
      (p - THEATER_T_IMPACT) / (THEATER_T_RICOCHET_PIVOT_END - THEATER_T_IMPACT);
    const gougeCm = layout.maxCavityDepthLosCm * easeOutQuad(pivotU);
    const surfaceLiftCm =
      layout.penetratorDiameterCm * 0.55 * easeOutQuad(pivotU);
    const ricErosion = writeHydrodynamicRodErosionInto(
      pivotU,
      isLongRod,
      true,
      _erosionScratch
    );

    out.rodNoseX =
      gougeCm * layout.slopeTangentX + surfaceLiftCm * layout.outwardNormalX;
    out.rodNoseY =
      gougeCm * layout.slopeTangentY + surfaceLiftCm * layout.outwardNormalY;
    out.rodPitchRad = ricAngleRad * easeOutQuad(pivotU);
    out.penetrationFrac01 = pivotU;
    out.rodLengthFraction = ricErosion.remainingLengthRatio;
    out.rodMushroomTipScale = ricErosion.mushroomTipScale;
    out.backJetIntensity01 = ricErosion.backJetIntensity01;
    out.backJetProgress = clamp01(pivotU * 0.55);
    out.erosionChannelRadiusMult = ricErosion.erosionChannelRadiusMult;
    out.rodGlowIntensity = 0.45 + 0.45 * pivotU;
    out.cavityDepthLosCm = gougeCm;
    out.cavityGlowIntensity = 0.92;
    out.currentVelocityMps =
      vImpact - (vImpact - layout.residualVelocityMps) * pivotU;

    out.sparkActive = true;
    out.sparkProgress = pivotU * 0.25;
    out.sparkIntensity = 1.0;
  } else {
    const flyU = clamp01(
      (p - THEATER_T_RICOCHET_PIVOT_END) / (1 - THEATER_T_RICOCHET_PIVOT_END)
    );
    const startLiftCm = layout.penetratorDiameterCm * 0.55;
    const startX =
      layout.maxCavityDepthLosCm * layout.slopeTangentX +
      startLiftCm * layout.outwardNormalX;
    const startY =
      layout.maxCavityDepthLosCm * layout.slopeTangentY +
      startLiftCm * layout.outwardNormalY;
    const travelCm = layout.ricochetTravelCm * flyU;
    const extraClearanceCm = 9.5 * easeOutQuad(flyU);
    const ricFinal = writeHydrodynamicRodErosionInto(
      1,
      isLongRod,
      true,
      _erosionScratch
    );

    out.rodNoseX =
      startX +
      layout.ricochetDirX * travelCm +
      layout.outwardNormalX * extraClearanceCm;
    out.rodNoseY =
      startY +
      layout.ricochetDirY * travelCm +
      layout.outwardNormalY * extraClearanceCm -
      1.6 * flyU * flyU;
    // Deflected projectile aligns with reflection vector and begins slight upward yaw/tumble
    out.rodPitchRad = ricAngleRad + 0.3 * flyU;
    out.penetrationFrac01 = 1;
    out.rodLengthFraction = ricFinal.remainingLengthRatio;
    out.rodMushroomTipScale = 1;
    out.backJetIntensity01 = 0;
    out.backJetProgress = 1;
    out.erosionChannelRadiusMult = ricFinal.erosionChannelRadiusMult;
    out.rodGlowIntensity = Math.max(0.14, 0.78 * (1 - 0.72 * flyU));
    out.cavityDepthLosCm = layout.maxCavityDepthLosCm;
    out.cavityGlowIntensity = Math.max(0.14, 0.85 * (1 - 0.82 * flyU));
    out.currentVelocityMps = layout.residualVelocityMps;

    out.sparkActive = true;
    out.sparkProgress = clamp01(0.22 + 0.78 * flyU);
    out.sparkIntensity = Math.max(0.08, 1 - 0.75 * flyU);
  }

  return out;
}

/** Convenience wrapper returning a freshly allocated frame state (for tests / one-off queries). */
export function evaluateArmorTheaterFrame(
  layout: ArmorTheaterLayout,
  progress: number
): ArmorTheaterFrameState {
  return evaluateArmorTheaterFrameInto(
    layout,
    progress,
    createArmorTheaterFrameState()
  );
}

/**
 * Zero-GC per-particle evaluator for Behind-Armor Spall (BAP) incandescent fragments.
 */
export function evaluateSpallParticleInto(
  layout: ArmorTheaterLayout,
  frame: ArmorTheaterFrameState,
  index: number,
  out: ParticleTransformOut
): void {
  if (!frame.spallActive || layout.outcome !== 'perforation') {
    out.visible = false;
    out.scaleX = 0;
    out.scaleY = 0;
    out.scaleZ = 0;
    out.heat = 0;
    return;
  }

  const seed = SPALL_PARTICLE_SEEDS[index % SPALL_PARTICLE_SEEDS.length];
  const rawU = (frame.spallProgress - seed.delayFrac) / (1 - seed.delayFrac);
  if (rawU <= 0) {
    out.visible = false;
    out.scaleX = 0;
    out.scaleY = 0;
    out.scaleZ = 0;
    out.heat = 0;
    return;
  }

  const u = clamp01(rawU);
  const travel = easeOutQuad(u) * layout.spallMaxReachCm * seed.speedScale;
  const coneAngle = seed.radialFrac * layout.spallConeHalfAngleRad;
  const sinA = Math.sin(coneAngle);
  const cosA = Math.cos(coneAngle);

  out.visible = true;
  out.x = layout.exitXCm + travel * cosA;
  out.y = travel * sinA * Math.sin(seed.azimuthRad) - 1.8 * u * u;
  out.z = travel * sinA * Math.cos(seed.azimuthRad);
  out.rotX = seed.tumbleRateX * u;
  out.rotY = seed.tumbleRateY * u;
  out.rotZ = seed.tumbleRateZ * u;

  // Slight elongation along travel streak + fade near end of travel
  const fade = 1 - 0.35 * u;
  out.scaleX = seed.sizeCm * 1.45 * fade;
  out.scaleY = seed.sizeCm * 0.62 * fade;
  out.scaleZ = seed.sizeCm * 0.62 * fade;
  out.heat = clamp01((1 - 0.65 * u) * (0.75 + 0.25 * seed.speedScale));
}

/**
 * Zero-GC per-particle evaluator for grazing ricochet sparks & crater splashback sparks.
 */
export function evaluateSparkParticleInto(
  layout: ArmorTheaterLayout,
  frame: ArmorTheaterFrameState,
  index: number,
  out: ParticleTransformOut
): void {
  if (!frame.sparkActive || frame.sparkIntensity <= 0.01) {
    out.visible = false;
    out.scaleX = 0;
    out.scaleY = 0;
    out.scaleZ = 0;
    out.heat = 0;
    return;
  }

  const seed = SPARK_PARTICLE_SEEDS[index % SPARK_PARTICLE_SEEDS.length];
  const rawU = (frame.sparkProgress - seed.delayFrac * 0.8) / (1 - seed.delayFrac * 0.8);
  if (rawU <= 0 || rawU >= 1.05) {
    out.visible = false;
    out.scaleX = 0;
    out.scaleY = 0;
    out.scaleZ = 0;
    out.heat = 0;
    return;
  }

  const u = clamp01(rawU);
  const easeU = easeOutQuad(u);
  out.visible = true;

  if (layout.outcome === 'ricochet') {
    // Grazing spark fan skimming along up-slope armor tangent + outward lift
    const dist = easeU * (28 + 38 * seed.speedScale);
    const lift = easeU * (3.5 + 14 * seed.radialFrac);
    const dirX =
      layout.slopeTangentX * dist + layout.outwardNormalX * lift;
    const dirY =
      layout.slopeTangentY * dist + layout.outwardNormalY * lift - 4.5 * u * u;
    const dirZ = seed.lateralSpread * (2.5 + 14 * easeU);

    out.x = dirX;
    out.y = dirY;
    out.z = dirZ;
    out.rotX = 0;
    out.rotY = 0;
    out.rotZ = Math.atan2(layout.slopeTangentY, layout.slopeTangentX);
    const fade = (1 - u * 0.68) * frame.sparkIntensity;
    out.scaleX = (3.4 + 3.6 * seed.speedScale) * fade;
    out.scaleY = 0.42 * fade;
    out.scaleZ = 0.42 * fade;
    out.heat = clamp01((1 - 0.45 * u) * frame.sparkIntensity);
  } else {
    // Crater splashback molten ejecta spraying outward from front entry point (0, 0, 0)
    const dist = easeU * (16 + 24 * seed.speedScale);
    const spreadAngle = (seed.radialFrac - 0.5) * 1.1;
    const cosS = Math.cos(spreadAngle);
    const sinS = Math.sin(spreadAngle);
    const ejDirX = layout.outwardNormalX * cosS - layout.outwardNormalY * sinS;
    const ejDirY = layout.outwardNormalX * sinS + layout.outwardNormalY * cosS;

    out.x = ejDirX * dist;
    out.y = ejDirY * dist - 5.2 * u * u;
    out.z = seed.lateralSpread * (1.8 + 13 * easeU);
    out.rotX = seed.tumbleRateX * u;
    out.rotY = seed.tumbleRateY * u;
    out.rotZ = Math.atan2(ejDirY, ejDirX);
    const fade = (1 - u * 0.78) * frame.sparkIntensity;
    out.scaleX = (1.6 + 1.8 * seed.speedScale) * fade;
    out.scaleY = 0.26 * fade;
    out.scaleZ = 0.26 * fade;
    out.heat = clamp01((1 - 0.65 * u) * frame.sparkIntensity);
  }
}

/**
 * Zero-GC per-particle evaluator for the 36-streak hydrodynamic molten crater
 * back-jet ejecta spray erupting backward off the armor strike face (`entryX = 0`)
 * along an authentic `32°–52°` conical hydrodynamic splash sheet.
 */
export function evaluateBackJetParticleInto(
  layout: ArmorTheaterLayout,
  frame: ArmorTheaterFrameState,
  index: number,
  out: ParticleTransformOut
): void {
  if (
    frame.backJetIntensity01 <= 0.05 ||
    frame.progress < THEATER_T_IMPACT
  ) {
    out.visible = false;
    out.scaleX = 0;
    out.scaleY = 0;
    out.scaleZ = 0;
    out.heat = 0;
    return;
  }

  const seed = BACK_JET_PARTICLE_SEEDS[index % BACK_JET_PARTICLE_SEEDS.length];
  // Recycle streaks continuously across active crater boring so the molten collar stays alive
  const cycleU = (frame.backJetProgress * 1.45 + seed.delayFrac * 2.2) % 1;
  const u = clamp01(cycleU);
  const easeU = easeOutQuad(u);

  const coneDeg =
    BACK_JET_CONE_MIN_DEG +
    (BACK_JET_CONE_MAX_DEG - BACK_JET_CONE_MIN_DEG) * seed.radialFrac;
  const coneRad = (coneDeg * Math.PI) / 180;
  const cosC = Math.cos(coneRad);
  const sinC = Math.sin(coneRad);
  const cosA = Math.cos(seed.azimuthRad);
  const sinA = Math.sin(seed.azimuthRad);

  // Exact 3D conical direction around outwardNormal (dot(dir, outwardNormal) === cos(coneRad))
  const dirX =
    layout.outwardNormalX * cosC + layout.slopeTangentX * sinC * cosA;
  const dirY =
    layout.outwardNormalY * cosC + layout.slopeTangentY * sinC * cosA;
  const dirZ = sinC * sinA;

  const isLongRod = layout.result.projectile.isSubCaliberRod;
  const maxReachCm = (isLongRod ? 26 : 16) * (0.55 + 0.72 * seed.speedScale);
  const dist = easeU * maxReachCm;
  const craterLipR = Math.max(0.9, frame.cavityRadiusCm * 0.95);

  out.visible = true;
  out.x = dirX * (craterLipR + dist);
  out.y = dirY * (craterLipR + dist) - 3.6 * u * u;
  out.z = 0.35 + dirZ * (craterLipR + dist);

  // Align streak +X axis cleanly with velocity vector (yaw & pitch)
  const horizLen = Math.hypot(dirX, dirZ) || 1e-5;
  out.rotX = 0;
  out.rotY = Math.atan2(-dirZ, dirX);
  out.rotZ = Math.atan2(dirY, horizLen);

  const fade = (1 - u * 0.72) * frame.backJetIntensity01;
  out.scaleX = (2.2 + 2.8 * seed.speedScale) * fade;
  out.scaleY = (0.34 + 0.24 * seed.sizeCm) * fade;
  out.scaleZ = (0.34 + 0.24 * seed.sizeCm) * fade;
  out.heat = clamp01((1 - 0.55 * u) * frame.backJetIntensity01);
}
