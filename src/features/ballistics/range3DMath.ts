import {
  interpolateTrajectoryAt,
  type BallisticSolution,
  type ExternalProjectileId,
  type ExternalProjectileSpec,
  type FlightRegime,
  type TrajectorySample,
} from '../../engine/physics/externalBallistics';

// ============================================================================
// Track B2 · 3D 1,000m Interactive Firing Range & Bullet-Cam Math Engine
//
// Pure, DOM-free, Three.js-free deterministic physics-to-3D projection module
// strictly driven by RK4 3-DOF `BallisticSolution` outputs from
// `src/engine/physics/externalBallistics.ts`.
//
// World coordinate frame (1 world unit = 1 meter):
//   +X = Downrange toward target (0 .. 1000 m)
//   +Y = Vertical elevation above range deck (m; muzzle/LOS at Y = 1.65 m)
//   +Z = Lateral crosswind drift (+Z = downwind right, -Z = left)
// ============================================================================

export const RANGE_WORLD_SCALE = 1;
export const FIRING_LINE_HEIGHT_M = 1.65;
export const DEFAULT_SPEED_OF_SOUND_MPS = 343;
export const RANGE_YARDAGE_MARKERS_M = [100, 300, 500, 800, 1000] as const;

export const RANGE_CAMERA_MODES = [
  'overview',
  'bullet_cam',
  'spotter_flir',
] as const;
export type RangeCameraMode = (typeof RANGE_CAMERA_MODES)[number];

export const RANGE_SPEED_OPTIONS = [0.05, 0.2, 1.0] as const;
export type RangeSpeedMultiplier = (typeof RANGE_SPEED_OPTIONS)[number];

export const RANGE_TARGET_TYPES = ['steel_gong', 'ballistic_gel'] as const;
export type RangeTargetType = (typeof RANGE_TARGET_TYPES)[number];

export const RANGE_AIM_MODES = ['dope_dial', 'elev_only', 'raw_zero'] as const;
export type RangeAimMode = (typeof RANGE_AIM_MODES)[number];

export type ProjectileVisualStyle =
  | 'spitzer_brass'
  | 'pistol_copper'
  | 'apfsds_tungsten'
  | 'apcbc_shell'
  | 'carbon_arrow'
  | 'buckshot_cluster';

export type SteelHitZone = 'bullseye' | 'plate' | 'edge' | 'miss';

export const SMALL_ARMS_GONG_RADIUS_M = 0.25; // 50 cm diameter AR500 ELR gong
export const ARMOR_PLATE_RADIUS_M = 1.1; // 2.2 m diameter heavy armor gong
export const GEL_BLOCK_LENGTH_CM = 52;
export const GEL_BLOCK_HEIGHT_CM = 24;
export const GEL_BLOCK_WIDTH_CM = 24;

export interface Range3DPoint {
  x: number;
  y: number;
  z: number;
  rangeM: number;
  dropCm: number;
  windDriftCm: number;
  velocityMps: number;
  mach: number;
  energyJ: number;
  timeOfFlightS: number;
  flightRegime: FlightRegime;
}

export interface MachRingState {
  visible: boolean;
  x: number;
  y: number;
  z: number;
  rangeM: number;
  timeOfFlightS: number;
  tangentX: number;
  tangentY: number;
  tangentZ: number;
}

export interface SteelTargetImpactResult {
  hit: boolean;
  hitZone: SteelHitZone;
  plateRadiusM: number;
  impactOffsetYCm: number;
  impactOffsetZCm: number;
  radialErrorCm: number;
  impactVelocityMps: number;
  impactEnergyJ: number;
  impactMomentumNs: number;
  swingPeakAngleRad: number;
  swingAngularVelRadS: number;
  swingDamping: number;
  swingFreqRadS: number;
  acousticReturnDelayS: number;
  totalAudioCueDelayS: number;
  sparkCount: number;
}

export interface BallisticGelCavityResult {
  hit: boolean;
  penetrationDepthCm: number;
  permanentCavityRadiusCm: number;
  tempStretchRadiusCm: number;
  tempPeakDepthCm: number;
  passesThrough: boolean;
  gelLengthCm: number;
  impactVelocityMps: number;
  impactEnergyJ: number;
  tumbleStartCm: number;
}

export interface WindFlagState {
  rangeM: number;
  lateralZ: number;
  /** Y-axis yaw pointing downwind (+Z = 0, -Z = PI) */
  yawRad: number;
  /** Downward droop angle from horizontal (0 = stiff horizontal, ~1.4 = limp vertical) */
  droopRad: number;
  /** Wave flutter oscillation frequency in Hz */
  flutterHz: number;
  /** Wave flutter angular amplitude in radians */
  flutterAmpRad: number;
  windSpeedMps: number;
}

export interface ProjectilePose3D {
  x: number;
  y: number;
  z: number;
  pitchRad: number;
  yawRad: number;
  rollRad: number;
  rangeM: number;
  dropCm: number;
  windDriftCm: number;
  velocityMps: number;
  mach: number;
  energyJ: number;
  timeOfFlightS: number;
  flightRegime: FlightRegime;
  progress01: number;
  hasImpacted: boolean;
  postImpactTimeS: number;
}

export interface RangeTrajectory3D {
  projectileId: ExternalProjectileId;
  spec: ExternalProjectileSpec;
  targetRangeM: number;
  effectiveEndRangeM: number;
  aimMode: RangeAimMode;
  targetType: RangeTargetType;
  elevDialRad: number;
  windDialRad: number;
  targetCenterX: number;
  targetCenterY: number;
  targetCenterZ: number;
  points: Range3DPoint[];
  totalFlightTimeS: number;
  postImpactDurationS: number;
  totalTimelineS: number;
  impactSample: TrajectorySample;
  stalledShort: boolean;
  machRing: MachRingState;
  steelImpact: SteelTargetImpactResult;
  gelCavity: BallisticGelCavityResult;
  visualStyle: ProjectileVisualStyle;
  spinRateRadS: number;
  visualSpinRateRadS: number;
}

export interface CameraPose3D {
  posX: number;
  posY: number;
  posZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  fovDeg: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Classifies the 3D projectile geometry archetype from canonical ballistics specs.
 */
export function resolveProjectileVisualStyle(
  spec: ExternalProjectileSpec
): ProjectileVisualStyle {
  if (spec.dragModel === 'ARROW' || spec.category === 'archery') {
    return 'carbon_arrow';
  }
  if (spec.id === '120mm_apfsds' || spec.id === '125mm_apfsds') {
    return 'apfsds_tungsten';
  }
  if (spec.id === '88mm_pzgr39' || spec.id === '30x173_gau8') {
    return 'apcbc_shell';
  }
  if (spec.pelletCount > 1 || spec.category === 'shotgun') {
    return 'buckshot_cluster';
  }
  if (spec.category === 'pistol') {
    return 'pistol_copper';
  }
  return 'spitzer_brass';
}

/**
 * Computes physical projectile axial spin rate ω = 2π·v / L_twist (rad/s).
 * Smoothbore APFSDS darts and arrows rotate slowly from canted fins/vanes;
 * rifled firearms spin at 60,000–300,000+ RPM (~6,000–32,000 rad/s).
 */
export function computeProjectileSpinRateRadS(
  spec: ExternalProjectileSpec,
  velocityMps: number
): number {
  const safeV = Math.max(0, velocityMps);
  const style = resolveProjectileVisualStyle(spec);
  if (style === 'apfsds_tungsten') {
    // Cant-fin slow roll stabilization (~14 Hz at Mach 5)
    return (safeV / 1700) * 14 * Math.PI * 2;
  }
  if (style === 'carbon_arrow') {
    // Helical fletching spin (~16 Hz at 110 m/s)
    return (safeV / 110) * 16 * Math.PI * 2;
  }
  if (style === 'buckshot_cluster') {
    return 18;
  }
  if (style === 'apcbc_shell') {
    // KwK 36 88mm rifling twist ~2.46 m; GAU-8 30mm gain-twist exit ~0.85 m
    const shellTwistM = spec.id === '30x173_gau8' ? 0.85 : 2.46;
    return (safeV / shellTwistM) * Math.PI * 2;
  }
  if (style === 'pistol_copper') {
    // Typical pistol 1:10" – 1:16" (~0.30 m)
    return (safeV / 0.305) * Math.PI * 2;
  }
  // Rifle / Sniper / PDW rifling twist ~1:8" – 1:10" (~0.23 m)
  const twistM = spec.id === '50_bmg' ? 0.381 : 0.229;
  return (safeV / twistM) * Math.PI * 2;
}

/**
 * Computes acoustic sound-return delay in seconds (`distance / speedOfSound`),
 * defaulting to standard sea-level speed of sound `343 m/s`.
 */
export function computeAcousticReturnDelayS(
  distanceM: number,
  speedOfSoundMps = DEFAULT_SPEED_OF_SOUND_MPS
): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 0;
  const c =
    Number.isFinite(speedOfSoundMps) && speedOfSoundMps > 50
      ? speedOfSoundMps
      : DEFAULT_SPEED_OF_SOUND_MPS;
  return distanceM / c;
}

/**
 * Writes a vivid supersonic -> transonic -> subsonic RGB triple (`0..1`)
 * into `out` without allocating objects.
 *   - Supersonic (`M > 1.2`): Electric cyan -> emerald
 *   - Transonic (`0.85 <= M <= 1.2`): Luminous amber -> crimson shock peak at M=1.0
 *   - Subsonic (`M < 0.85`): Cool violet-indigo -> steel blue
 */
export function writeMachGradientColorRGB(
  mach: number,
  out: [number, number, number]
): [number, number, number] {
  if (mach >= 2.2) {
    // Hypersonic / high-supersonic cyan
    out[0] = 0.14;
    out[1] = 0.85;
    out[2] = 0.98;
    return out;
  }
  if (mach > 1.2) {
    // Supersonic emerald -> cyan
    const t = clamp((mach - 1.2) / 1.0, 0, 1);
    out[0] = 0.2 + (0.14 - 0.2) * t;
    out[1] = 0.84 + (0.85 - 0.84) * t;
    out[2] = 0.62 + (0.98 - 0.62) * t;
    return out;
  }
  if (mach >= 1.0) {
    // Transonic entry: fiery crimson-amber at M=1.0 -> amber-gold at M=1.2
    const t = clamp((mach - 1.0) / 0.2, 0, 1);
    out[0] = 0.96 + (0.96 - 0.96) * t;
    out[1] = 0.25 + (0.64 - 0.25) * t;
    out[2] = 0.34 + (0.08 - 0.34) * t;
    return out;
  }
  if (mach >= 0.85) {
    // Subsonic exit of transonic band: purple-magenta -> crimson at M=1.0
    const t = clamp((mach - 0.85) / 0.15, 0, 1);
    out[0] = 0.56 + (0.96 - 0.56) * t;
    out[1] = 0.44 + (0.25 - 0.44) * t;
    out[2] = 0.96 + (0.34 - 0.96) * t;
    return out;
  }
  // Subsonic: indigo -> cool slate blue
  const t = clamp(mach / 0.85, 0, 1);
  out[0] = 0.38 + (0.56 - 0.38) * t;
  out[1] = 0.46 + (0.44 - 0.46) * t;
  out[2] = 0.72 + (0.96 - 0.72) * t;
  return out;
}

export function getMachGradientHex(mach: number): string {
  const rgb: [number, number, number] = [0, 0, 0];
  writeMachGradientColorRGB(mach, rgb);
  const r = Math.round(clamp(rgb[0], 0, 1) * 255)
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(clamp(rgb[1], 0, 1) * 255)
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(clamp(rgb[2], 0, 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

/**
 * Computes animated range wind flag orientations and flutter physics along
 * the proving ground from signed crosswind speed (`+Z` left->right, `-Z` right->left).
 */
export function computeWindFlagStates(
  maxRangeM: number,
  signedCrosswindMps: number,
  markersM: readonly number[] = RANGE_YARDAGE_MARKERS_M
): WindFlagState[] {
  const windAbs = Math.abs(
    Number.isFinite(signedCrosswindMps) ? signedCrosswindMps : 0
  );
  // Downwind heading: +Z is yaw = 0 in flag local space (+Z pennant extension), -Z is PI
  const yawRad = signedCrosswindMps >= 0 ? 0 : Math.PI;
  // Wind speed lifts the pennant from limp (~1.38 rad down) toward taut horizontal (~0.06 rad)
  const liftNorm = 1 - Math.exp(-windAbs / 3.8);
  const droopRad = 1.38 * (1 - liftNorm) + 0.06 * liftNorm;
  const flutterHz = 0.35 + windAbs * 0.78;
  const flutterAmpRad = 0.015 + Math.min(0.24, windAbs * 0.018);

  const selectedDistances = markersM.filter((d) => d <= maxRangeM);
  if (selectedDistances.length === 0) {
    selectedDistances.push(Math.min(50, Math.max(25, maxRangeM)));
  }

  return selectedDistances.map((rangeM, idx) => ({
    rangeM,
    // Alternate lane sides cleanly outside the main firing corridor
    lateralZ: idx % 2 === 0 ? -9.5 : 9.5,
    yawRad,
    droopRad,
    flutterHz,
    flutterAmpRad,
    windSpeedMps: windAbs,
  }));
}

/**
 * Evaluates a wind flag segment's flutter transverse displacement (meters) at time `elapsedS`.
 */
export function evaluateWindFlagFlutterOffset(
  flag: WindFlagState,
  uAlongCloth01: number,
  elapsedS: number,
  phaseOffsetRad = 0
): number {
  const u = clamp(uAlongCloth01, 0, 1);
  if (u <= 0) return 0;
  // Traveling wave down the pennant, clamped at pole (u=0)
  const wave = Math.sin(
    elapsedS * flag.flutterHz * Math.PI * 2 - u * 4.4 + phaseOffsetRad
  );
  const harmonic =
    0.35 *
    Math.sin(
      elapsedS * flag.flutterHz * Math.PI * 3.7 - u * 7.8 + phaseOffsetRad * 1.4
    );
  return u * u * flag.flutterAmpRad * (wave + harmonic);
}

/**
 * Evaluates AR500 steel gong hit/miss geometry, pendulum recoil impulse,
 * spark intensity, and speed-of-sound acoustic return delay.
 */
export function evaluateSteelTargetImpact(
  spec: ExternalProjectileSpec,
  impactSample: TrajectorySample,
  impactOffsetYCm: number,
  impactOffsetZCm: number,
  stalledShort: boolean,
  speedOfSoundMps = DEFAULT_SPEED_OF_SOUND_MPS
): SteelTargetImpactResult {
  const isArmor = spec.category === 'armor';
  const plateRadiusM = isArmor
    ? ARMOR_PLATE_RADIUS_M
    : SMALL_ARMS_GONG_RADIUS_M;
  const plateRadiusCm = plateRadiusM * 100;
  const radialErrorCm = Math.hypot(impactOffsetYCm, impactOffsetZCm);

  const hit = !stalledShort && radialErrorCm <= plateRadiusCm;
  let hitZone: SteelHitZone = 'miss';
  if (hit) {
    if (radialErrorCm <= plateRadiusCm * 0.32) {
      hitZone = 'bullseye';
    } else if (radialErrorCm <= plateRadiusCm * 0.84) {
      hitZone = 'plate';
    } else {
      hitZone = 'edge';
    }
  }

  const totalMassKg = (spec.massGrams * spec.pelletCount) / 1000;
  const impactVelocityMps = impactSample.velocityMps;
  const impactEnergyJ = impactSample.energyJ;
  const impactMomentumNs = totalMassKg * impactVelocityMps;

  // Hanging AR500 gong physical pendulum parameters
  const chainLengthM = isArmor ? 1.55 : 0.65;
  const plateMassKg = isArmor ? 260 : 11.5;
  const restitution = 0.28;
  const swingFreqRadS = Math.sqrt(9.80665 / chainLengthM);
  const swingDamping = 0.2;

  let swingAngularVelRadS = 0;
  let swingPeakAngleRad = 0;
  let sparkCount = 0;

  if (hit) {
    // Physical impulse + slight perceptual floor so 9mm/arrows still visibly ring the plate
    const physicalOmega =
      ((1 + restitution) * impactMomentumNs) / (plateMassKg * chainLengthM);
    const perceptualScale = isArmor ? 0.55 : 2.1;
    swingAngularVelRadS = clamp(
      physicalOmega * perceptualScale,
      0.38,
      swingFreqRadS * 1.28
    );
    swingPeakAngleRad = clamp(swingAngularVelRadS / swingFreqRadS, 0.08, 1.28);

    // Metallic sparks scale with impact velocity & energy (arrows spark minimally)
    if (spec.dragModel === 'ARROW') {
      sparkCount = 6;
    } else {
      sparkCount = Math.round(
        clamp(12 + Math.log10(Math.max(10, impactEnergyJ)) * 8, 12, 48)
      );
    }
  }

  const acousticReturnDelayS = computeAcousticReturnDelayS(
    impactSample.rangeM,
    speedOfSoundMps
  );

  return {
    hit,
    hitZone,
    plateRadiusM,
    impactOffsetYCm,
    impactOffsetZCm,
    radialErrorCm,
    impactVelocityMps,
    impactEnergyJ,
    impactMomentumNs,
    swingPeakAngleRad,
    swingAngularVelRadS,
    swingDamping,
    swingFreqRadS,
    acousticReturnDelayS,
    totalAudioCueDelayS: impactSample.timeOfFlightS + acousticReturnDelayS,
    sparkCount,
  };
}

/**
 * Evaluates the damped pendulum deflection angle (radians) of the AR500 steel gong
 * at `postImpactTimeS >= 0` after strike.
 */
export function evaluateSteelPendulumAngle(
  impact: SteelTargetImpactResult,
  postImpactTimeS: number
): number {
  if (!impact.hit || postImpactTimeS <= 0 || impact.swingPeakAngleRad <= 0) {
    return 0;
  }
  const wn = impact.swingFreqRadS;
  const zeta = impact.swingDamping;
  const wd = wn * Math.sqrt(Math.max(0.05, 1 - zeta * zeta));
  return (
    impact.swingPeakAngleRad *
    Math.exp(-zeta * wn * postImpactTimeS) *
    Math.sin(wd * postImpactTimeS)
  );
}

/**
 * Evaluates 10% FBI ordnance ballistic gelatin penetration depth, temporary
 * hydrodynamic stretch cavity radius, and permanent wound track radius.
 */
export function evaluateBallisticGelCavity(
  spec: ExternalProjectileSpec,
  impactSample: TrajectorySample,
  hit: boolean
): BallisticGelCavityResult {
  const impactVelocityMps = impactSample.velocityMps;
  const impactEnergyJ = impactSample.energyJ;

  if (!hit || impactVelocityMps <= 1) {
    return {
      hit: false,
      penetrationDepthCm: 0,
      permanentCavityRadiusCm: 0,
      tempStretchRadiusCm: 0,
      tempPeakDepthCm: 0,
      passesThrough: false,
      gelLengthCm: GEL_BLOCK_LENGTH_CM,
      impactVelocityMps,
      impactEnergyJ,
      tumbleStartCm: 0,
    };
  }

  const caliberCm = Math.max(0.45, spec.caliberMm / 10);
  const crossSectionCm2 = Math.PI * (caliberCm * 0.5) * (caliberCm * 0.5);
  const sectionalDensityGPerCm2 = spec.massGrams / crossSectionCm2;

  let rawPenetrationCm: number;
  let tempStretchRadiusCm: number;
  let permanentCavityRadiusCm: number;
  let tumbleStartCm: number;

  if (spec.dragModel === 'ARROW') {
    // Razor broadhead slices deeply with minimal hydrostatic stretch
    rawPenetrationCm = clamp(
      14 + 0.28 * impactVelocityMps * (spec.massGrams / 25.9),
      18,
      58
    );
    tempStretchRadiusCm = clamp(caliberCm * 1.45, 0.9, 1.9);
    permanentCavityRadiusCm = clamp(caliberCm * 1.15, 0.7, 1.4);
    tumbleStartCm = rawPenetrationCm;
  } else if (spec.category === 'armor') {
    // Megajoule tank ordnance punches straight through ordnance gel with massive shockwave
    rawPenetrationCm = 180 + Math.sqrt(impactEnergyJ) * 0.12;
    tempStretchRadiusCm = 11.2;
    permanentCavityRadiusCm = clamp(caliberCm * 0.85, 2.2, 5.2);
    tumbleStartCm = 8;
  } else {
    // Poncelet-like hydrodynamic gelatin penetration estimate calibrated to FBI 10% gel tests
    const vRatio = impactVelocityMps / 300;
    rawPenetrationCm =
      15.5 * Math.pow(sectionalDensityGPerCm2, 0.52) * Math.log(1 + 2.6 * vRatio * vRatio);
    // Single-pellet energy governs cavity radius for buckshot
    const cavityEnergyJ = impactSample.singlePelletEnergyJ;
    tempStretchRadiusCm = clamp(
      caliberCm * 0.9 + 0.165 * Math.pow(Math.max(0, cavityEnergyJ), 0.42),
      1.1,
      10.6
    );
    permanentCavityRadiusCm = clamp(
      caliberCm * 0.65 + tempStretchRadiusCm * 0.16,
      0.55,
      3.1
    );
    tumbleStartCm = spec.category === 'rifle' || spec.category === 'sniper'
      ? clamp(10 + 18 * (spec.bc / 0.35), 9, 24)
      : clamp(18, 12, 26);
  }

  const passesThrough = rawPenetrationCm >= GEL_BLOCK_LENGTH_CM;
  const penetrationDepthCm = Math.min(rawPenetrationCm, GEL_BLOCK_LENGTH_CM);
  const tempPeakDepthCm = clamp(
    Math.min(penetrationDepthCm * 0.52, tumbleStartCm + 6),
    4,
    GEL_BLOCK_LENGTH_CM - 4
  );

  return {
    hit: true,
    penetrationDepthCm,
    permanentCavityRadiusCm,
    tempStretchRadiusCm,
    tempPeakDepthCm,
    passesThrough,
    gelLengthCm: GEL_BLOCK_LENGTH_CM,
    impactVelocityMps,
    impactEnergyJ,
    tumbleStartCm,
  };
}

/**
 * Evaluates normalized temporary gel cavity expansion `[0..1]` at `postImpactTimeS`.
 * Rapid hydrodynamic expansion peaks around `8 ms`, then rebounds elastically over `120 ms`.
 */
export function evaluateGelCavityPulse01(
  gel: BallisticGelCavityResult,
  postImpactTimeS: number
): number {
  if (!gel.hit || postImpactTimeS <= 0) return 0;
  const tMs = postImpactTimeS * 1000;
  // Smooth fast rise to peak around 9 ms, damped elastic rebound settling toward permanent track ratio
  const rise = 1 - Math.exp(-tMs / 3.2);
  const decay = Math.exp(-tMs / 46);
  const rebound = 0.18 * Math.exp(-tMs / 65) * Math.sin((tMs / 1000) * 82);
  const floorRatio = clamp(
    gel.permanentCavityRadiusCm / Math.max(0.5, gel.tempStretchRadiusCm),
    0.15,
    0.65
  );
  return clamp(floorRatio + (1 - floorRatio) * rise * decay + rebound, 0, 1.08);
}

/**
 * Converts a solved RK4 `BallisticSolution` into a complete 3D proving-ground
 * trajectory with Mach 1.0 shock ring, terminal steel/gel impact physics,
 * and camera-ready metadata.
 */
export function buildRangeTrajectory3D(
  solution: BallisticSolution,
  targetRangeM: number,
  aimMode: RangeAimMode = 'dope_dial',
  targetType: RangeTargetType = 'steel_gong'
): RangeTrajectory3D {
  const clampedTargetM = clamp(
    Number.isFinite(targetRangeM) ? targetRangeM : 500,
    10,
    solution.maxRangeM
  );
  const stalledShort = clampedTargetM > solution.effectiveMaxRangeM + 0.5;
  const effectiveEndRangeM = Math.min(
    clampedTargetM,
    Math.max(1, solution.effectiveMaxRangeM)
  );

  const rawImpactSample =
    interpolateTrajectoryAt(solution, effectiveEndRangeM) ??
    solution.samples[solution.samples.length - 1];

  const elevDialRad =
    aimMode === 'raw_zero'
      ? 0
      : Math.atan2(-rawImpactSample.dropM, Math.max(1, effectiveEndRangeM));
  const windDialRad =
    aimMode === 'dope_dial'
      ? -Math.atan2(rawImpactSample.windDriftM, Math.max(1, effectiveEndRangeM))
      : 0;

  const tanElev = Math.tan(elevDialRad);
  const tanWind = Math.tan(windDialRad);

  const toWorldPoint = (s: TrajectorySample): Range3DPoint => {
    const x = s.rangeM * RANGE_WORLD_SCALE;
    const yRelM = s.dropM + s.rangeM * tanElev;
    const zRelM = s.windDriftM + s.rangeM * tanWind;
    return {
      x,
      y: (FIRING_LINE_HEIGHT_M + yRelM) * RANGE_WORLD_SCALE,
      z: zRelM * RANGE_WORLD_SCALE,
      rangeM: s.rangeM,
      dropCm: s.dropCm,
      windDriftCm: s.windDriftCm,
      velocityMps: s.velocityMps,
      mach: s.mach,
      energyJ: s.energyJ,
      timeOfFlightS: s.timeOfFlightS,
      flightRegime: s.flightRegime,
    };
  };

  const points: Range3DPoint[] = [];
  for (let i = 0; i < solution.samples.length; i++) {
    const s = solution.samples[i];
    if (s.rangeM > effectiveEndRangeM + 1e-6) break;
    points.push(toWorldPoint(s));
  }

  // Ensure exact terminal sample at effectiveEndRangeM
  const lastPt = points[points.length - 1];
  if (!lastPt || Math.abs(lastPt.rangeM - effectiveEndRangeM) > 1e-4) {
    points.push(toWorldPoint(rawImpactSample));
  }

  const endPt = points[points.length - 1];
  const targetCenterX = clampedTargetM * RANGE_WORLD_SCALE;
  const targetCenterY = FIRING_LINE_HEIGHT_M * RANGE_WORLD_SCALE;
  const targetCenterZ = 0;

  const impactOffsetYCm = (endPt.y - targetCenterY) * 100;
  const impactOffsetZCm = (endPt.z - targetCenterZ) * 100;

  // Mach 1.0 transonic shock ring location & tangent orientation
  let machRing: MachRingState = {
    visible: false,
    x: 0,
    y: targetCenterY,
    z: 0,
    rangeM: 0,
    timeOfFlightS: 0,
    tangentX: 1,
    tangentY: 0,
    tangentZ: 0,
  };

  if (
    solution.transonicRangeM !== null &&
    solution.transonicRangeM > 1 &&
    solution.transonicRangeM <= effectiveEndRangeM
  ) {
    const mSample = interpolateTrajectoryAt(solution, solution.transonicRangeM);
    if (mSample) {
      const mPt = toWorldPoint(mSample);
      const prevSample = interpolateTrajectoryAt(
        solution,
        Math.max(0, solution.transonicRangeM - 2)
      );
      const nextSample = interpolateTrajectoryAt(
        solution,
        Math.min(effectiveEndRangeM, solution.transonicRangeM + 2)
      );
      let tx = 1;
      let ty = 0;
      let tz = 0;
      if (prevSample && nextSample) {
        const pA = toWorldPoint(prevSample);
        const pB = toWorldPoint(nextSample);
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const dz = pB.z - pA.z;
        const len = Math.hypot(dx, dy, dz);
        if (len > 1e-6) {
          tx = dx / len;
          ty = dy / len;
          tz = dz / len;
        }
      }
      machRing = {
        visible: true,
        x: mPt.x,
        y: mPt.y,
        z: mPt.z,
        rangeM: solution.transonicRangeM,
        timeOfFlightS: mSample.timeOfFlightS,
        tangentX: tx,
        tangentY: ty,
        tangentZ: tz,
      };
    }
  }

  const steelImpact = evaluateSteelTargetImpact(
    solution.spec,
    rawImpactSample,
    impactOffsetYCm,
    impactOffsetZCm,
    stalledShort,
    DEFAULT_SPEED_OF_SOUND_MPS
  );

  // Gel block hit check (within 24 cm x 24 cm face)
  const gelHit =
    !stalledShort &&
    Math.abs(impactOffsetYCm) <= GEL_BLOCK_HEIGHT_CM * 0.5 &&
    Math.abs(impactOffsetZCm) <= GEL_BLOCK_WIDTH_CM * 0.5;
  const gelCavity = evaluateBallisticGelCavity(
    solution.spec,
    rawImpactSample,
    gelHit
  );

  const visualStyle = resolveProjectileVisualStyle(solution.spec);
  const spinRateRadS = computeProjectileSpinRateRadS(
    solution.spec,
    solution.spec.muzzleVelocityMps
  );
  // Perceptually crisp visual spin rate so rifling rotation never aliases in Bullet-Cam
  const visualSpinRateRadS =
    visualStyle === 'apfsds_tungsten' || visualStyle === 'carbon_arrow'
      ? Math.min(spinRateRadS, 68)
      : clamp(spinRateRadS * 0.0085, 42, 160);

  const totalFlightTimeS = Math.max(0.01, rawImpactSample.timeOfFlightS);
  const postImpactDurationS = Math.max(
    1.8,
    Math.min(3.6, steelImpact.acousticReturnDelayS + 0.55)
  );

  return {
    projectileId: solution.projectileId,
    spec: solution.spec,
    targetRangeM: clampedTargetM,
    effectiveEndRangeM,
    aimMode,
    targetType,
    elevDialRad,
    windDialRad,
    targetCenterX,
    targetCenterY,
    targetCenterZ,
    points,
    totalFlightTimeS,
    postImpactDurationS,
    totalTimelineS: totalFlightTimeS + postImpactDurationS,
    impactSample: rawImpactSample,
    stalledShort,
    machRing,
    steelImpact,
    gelCavity,
    visualStyle,
    spinRateRadS,
    visualSpinRateRadS,
  };
}

export function createMutableProjectilePose3D(): ProjectilePose3D {
  return {
    x: 0,
    y: FIRING_LINE_HEIGHT_M,
    z: 0,
    pitchRad: 0,
    yawRad: 0,
    rollRad: 0,
    rangeM: 0,
    dropCm: 0,
    windDriftCm: 0,
    velocityMps: 0,
    mach: 0,
    energyJ: 0,
    timeOfFlightS: 0,
    flightRegime: 'supersonic',
    progress01: 0,
    hasImpacted: false,
    postImpactTimeS: 0,
  };
}

/**
 * Zero-GC trajectory sampler: evaluates exact 3D position, tangent pitch/yaw,
 * axial rifling spin roll, and RK4 telemetry at simulation time `simTimeS`.
 */
export function sampleProjectilePoseAtTimeInto(
  traj: RangeTrajectory3D,
  simTimeS: number,
  out: ProjectilePose3D
): ProjectilePose3D {
  const pts = traj.points;
  const n = pts.length;
  if (n === 0) {
    out.x = 0;
    out.y = FIRING_LINE_HEIGHT_M;
    out.z = 0;
    out.pitchRad = 0;
    out.yawRad = 0;
    out.rollRad = 0;
    out.hasImpacted = false;
    out.postImpactTimeS = 0;
    out.progress01 = 0;
    return out;
  }

  const tSafe = Math.max(0, Number.isFinite(simTimeS) ? simTimeS : 0);
  const totalT = traj.totalFlightTimeS;
  const hasImpacted = tSafe >= totalT;
  const clampedT = hasImpacted ? totalT : tSafe;
  const postImpactTimeS = hasImpacted ? tSafe - totalT : 0;

  let lo = 0;
  let hi = n - 1;
  if (clampedT <= pts[0].timeOfFlightS) {
    lo = 0;
    hi = Math.min(1, n - 1);
  } else if (clampedT >= pts[n - 1].timeOfFlightS) {
    lo = Math.max(0, n - 2);
    hi = n - 1;
  } else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].timeOfFlightS <= clampedT) lo = mid;
      else hi = mid;
    }
  }

  const a = pts[lo];
  const b = pts[hi];
  const dt = b.timeOfFlightS - a.timeOfFlightS;
  const u = dt > 1e-9 ? clamp((clampedT - a.timeOfFlightS) / dt, 0, 1) : 1;

  out.x = a.x + (b.x - a.x) * u;
  out.y = a.y + (b.y - a.y) * u;
  out.z = a.z + (b.z - a.z) * u;
  out.rangeM = a.rangeM + (b.rangeM - a.rangeM) * u;
  out.dropCm = a.dropCm + (b.dropCm - a.dropCm) * u;
  out.windDriftCm = a.windDriftCm + (b.windDriftCm - a.windDriftCm) * u;
  out.velocityMps = a.velocityMps + (b.velocityMps - a.velocityMps) * u;
  out.mach = a.mach + (b.mach - a.mach) * u;
  out.energyJ = a.energyJ + (b.energyJ - a.energyJ) * u;
  out.timeOfFlightS = clampedT;
  out.flightRegime =
    out.mach > 1.2 ? 'supersonic' : out.mach >= 0.85 ? 'transonic' : 'subsonic';
  out.progress01 = totalT > 1e-9 ? clamp(clampedT / totalT, 0, 1) : 1;
  out.hasImpacted = hasImpacted;
  out.postImpactTimeS = postImpactTimeS;

  // Tangent orientation from local segment (nose points along +X in local projectile space)
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const horiz = Math.hypot(dx, dz);
  out.pitchRad = horiz > 1e-9 ? Math.atan2(dy, horiz) : 0;
  // Three.js right-handed Y-up yaw: rotating +X toward +Z requires negative rotation around Y
  out.yawRad = Math.atan2(-dz, Math.max(1e-9, dx));
  out.rollRad = traj.visualSpinRateRadS * clampedT;

  // If hitting ballistic gel, glide into cavity penetration depth during first ~8 ms
  if (hasImpacted && traj.targetType === 'ballistic_gel' && traj.gelCavity.hit) {
    const gelPenM = traj.gelCavity.penetrationDepthCm / 100;
    const penFrac = clamp(postImpactTimeS / 0.008, 0, 1);
    const easedPen = 1 - (1 - penFrac) * (1 - penFrac);
    out.x += gelPenM * easedPen;
  }

  return out;
}

export function sampleProjectilePoseAtTime(
  traj: RangeTrajectory3D,
  simTimeS: number
): ProjectilePose3D {
  return sampleProjectilePoseAtTimeInto(
    traj,
    simTimeS,
    createMutableProjectilePose3D()
  );
}

export function createMutableCameraPose3D(): CameraPose3D {
  return {
    posX: 0,
    posY: 5,
    posZ: 10,
    lookX: 100,
    lookY: FIRING_LINE_HEIGHT_M,
    lookZ: 0,
    fovDeg: 45,
  };
}

/**
 * Computes Zero-GC camera position, target look-at, and FOV for all 3 camera modes:
 *   - `'overview'`: elevated 3/4 panoramic proving-ground vantage framing 0..targetRangeM
 *   - `'bullet_cam'`: dramatic close-up side-aft chase beside the spinning projectile,
 *                     pulling gracefully outward just before impact so strike is crystal clear
 *   - `'spotter_flir'`: target-side spotting scope looking cleanly at the gong/gel & incoming arc
 */
export function evaluateRangeCameraPoseInto(
  mode: RangeCameraMode,
  traj: RangeTrajectory3D,
  pose: ProjectilePose3D,
  out: CameraPose3D
): CameraPose3D {
  if (mode === 'overview') {
    const span = Math.max(60, traj.targetRangeM);
    out.posX = -span * 0.14;
    out.posY = Math.max(14, span * 0.115);
    out.posZ = Math.max(24, span * 0.22);
    out.lookX = span * 0.5;
    out.lookY = FIRING_LINE_HEIGHT_M + Math.min(8, span * 0.01);
    out.lookZ = 0;
    out.fovDeg = 44;
    return out;
  }

  if (mode === 'spotter_flir') {
    const isArmor = traj.spec.category === 'armor';
    const isGel = traj.targetType === 'ballistic_gel';
    const standoffX = isGel ? 2.1 : isArmor ? 11.5 : 4.2;
    const lateralZ = isGel ? 1.55 : isArmor ? 5.8 : 2.35;
    const eyeY = isGel ? 0.28 : isArmor ? 1.15 : 0.42;

    out.posX = traj.targetCenterX - standoffX;
    out.posY = traj.targetCenterY + eyeY;
    out.posZ = traj.targetCenterZ + lateralZ;
    out.lookX = traj.targetCenterX + (isGel ? 0.24 : 0);
    out.lookY = traj.targetCenterY + (isGel ? 0.02 : 0.05);
    out.lookZ = traj.targetCenterZ;
    out.fovDeg = isGel ? 28 : 32;
    return out;
  }

  // Bullet-Cam: dynamic 3D chase camera flying beside the spinning projectile
  const isArmor = traj.spec.category === 'armor';
  const isGel = traj.targetType === 'ballistic_gel';
  const isArrow = traj.visualStyle === 'carbon_arrow';

  // Smoothly widen chase framing during final 12% approach so impact on gong/gel fills frame
  const terminalBlend = clamp((pose.progress01 - 0.86) / 0.14, 0, 1);
  const easedTerminal = terminalBlend * terminalBlend * (3 - 2 * terminalBlend);
  const impactSettle = pose.hasImpacted
    ? clamp(pose.postImpactTimeS / 0.45, 0, 1)
    : 0;

  const baseBehind = isArmor ? 1.85 : isArrow ? 0.92 : 0.44;
  const baseSide = isArmor ? 1.05 : isArrow ? 0.56 : 0.34;
  const baseAbove = isArmor ? 0.28 : 0.11;

  const endBehind = isGel ? 1.65 : isArmor ? 6.2 : 2.35;
  const endSide = isGel ? 1.15 : isArmor ? 3.5 : 1.45;
  const endAbove = isGel ? 0.24 : isArmor ? 0.85 : 0.36;

  const blend = clamp(easedTerminal * 0.72 + impactSettle * 0.28, 0, 1);
  const behind = baseBehind + (endBehind - baseBehind) * blend;
  const side = baseSide + (endSide - baseSide) * blend;
  const above = baseAbove + (endAbove - baseAbove) * blend;

  // Position camera tight beside & slightly aft of projectile so rifled spin fills foreground
  out.posX = pose.x - behind;
  out.posY = Math.max(0.42, pose.y + above);
  out.posZ = pose.z + side;

  // Look right at projectile nose with gentle forward lead toward looming target
  const lookAhead = (isArmor ? 1.1 : 0.32) * (1 - blend * 0.65);
  out.lookX = pose.x + lookAhead;
  out.lookY = pose.y + Math.sin(pose.pitchRad) * lookAhead;
  out.lookZ = pose.z - Math.sin(pose.yawRad) * lookAhead;
  out.fovDeg = 38 - blend * 4;
  return out;
}
