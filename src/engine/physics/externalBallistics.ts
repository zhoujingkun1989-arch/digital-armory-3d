import type { CaliberProfile } from '../../weapons/types';

// ============================================================================
// WP-14 · Digital Armory 3D — 1,000m External Ballistics, Wind Drift & DOPE Engine
//
// Pure, DOM-free, Three.js-free deterministic 3-DOF Point-Mass Exterior Ballistics
// module (Zero-GC hot loop, unit-testable in Node) providing:
//   1. All 13 canonical projectile profiles (11 SAAMI/CIP/NATO metallic & shotshell
//      calibers incl. `.45 ACP 230gr FMJ` + 2 ATA/IBO 400gr compound bow &
//      crossbow carbon projectiles).
//   2. Standard ICAO / ISA atmosphere air density ρ(h, T) & speed of sound a(T).
//   3. Monotone-cubic Hermite BRL/McCoy G1 & G7 standard drag curves C_d(M) plus
//      low-Mach finned shaft/vane arrow drag curve.
//   4. Iterative secant + bracketed-bisection Sight-In Zero Elevation Solver
//      converging to < 0.001 cm (< 0.02 cm contract) vertical error at zeroRangeM.
//   5. 4th-Order Runge-Kutta (RK4, dt = 0.001s–0.0015s) 3D trajectory integration
//      with crosswind lag deflection, transonic M=1.0 crossing detection, max
//      ordinate, retained velocity/energy, 12ga 9-pellet buckshot dispersion, and
//      true MIL (mrad) / MOA holdover & windage DOPE card generation.
//
// Coordinate frame:
//   +X = Downrange along Line of Sight (m)
//   +Y = Vertical height relative to Line of Sight (m; converted to cm in samples)
//   +Z = Lateral crosswind drift (+Z = downwind for positive crosswindMps)
// ============================================================================

export type ExternalProjectileId = CaliberProfile | '45_acp';

export type ExternalProjectileInput =
  ExternalProjectileId | '9x19' | '57x28' | string;

export type DragModelId = 'G1' | 'G7' | 'ARROW';

export type ProjectileCategory =
  'pistol' | 'pdw' | 'shotgun' | 'rifle' | 'sniper' | 'archery';

export type FlightRegime = 'supersonic' | 'transonic' | 'subsonic';

/** Standard gravity g₀ (m/s²) */
export const GRAVITY_MPS2 = 9.80665;
/** ICAO sea-level standard pressure P₀ (Pa) */
export const ISA_SEA_LEVEL_PRESSURE_PA = 101325;
/** ICAO sea-level standard temperature T₀ (K, 15 °C) */
export const ISA_SEA_LEVEL_TEMP_K = 288.15;
/** ICAO tropospheric temperature lapse rate L (K/m) */
export const ISA_LAPSE_RATE_K_PER_M = 0.0065;
/** Specific gas constant for dry air R_specific (J/(kg·K)) */
export const DRY_AIR_GAS_CONSTANT = 287.058;
/** Standard ICAO sea-level air density ρ₀ at 15 °C (kg/m³) */
export const ISA_SEA_LEVEL_DENSITY_KG_M3 = 1.225;
/** Conversion grains -> grams */
export const GRAMS_PER_GRAIN = 0.06479891;
/** Conversion standard ballistic coefficient (lb/in²) -> SI sectional density (kg/m²): 1 lb / (1 in)² */
const SI_KG_M2_PER_LB_IN2 = 0.45359237 / (0.0254 * 0.0254); // 703.06957964
/** Pre-multiplied aerodynamic drag constant π / (8 · 703.06958) (m²/kg) */
const DRAG_RETARDATION_CONST = Math.PI / (8 * SI_KG_M2_PER_LB_IN2);
/** 1 radian in Milliradians (true mrad) */
export const MRAD_PER_RAD = 1000;
/** 1 radian in true Minutes of Angle (MOA = (180 * 60) / π) */
export const MOA_PER_RAD = (180 * 60) / Math.PI;

export const ALLOWED_MAX_RANGES_M = [100, 300, 600, 1000] as const;
export type MaxRangeOptionM = (typeof ALLOWED_MAX_RANGES_M)[number];

export const ALLOWED_ZERO_RANGES_M = [25, 50, 100, 200, 300] as const;
export type ZeroRangeOptionM = (typeof ALLOWED_ZERO_RANGES_M)[number];

export const DEFAULT_DOPE_RANGES_M = [
  50, 100, 200, 300, 500, 800, 1000,
] as const;

/** Canonical ordered list of all 13 external-ballistics projectile profiles. */
export const EXTERNAL_PROJECTILE_ORDER: readonly ExternalProjectileId[] = [
  '9mm_para',
  '45_acp',
  '57_28',
  '357_magnum',
  '50_ae',
  '12_gauge',
  '762_m43',
  '556_nato',
  '30_06',
  '338_lapua',
  '50_bmg',
  'arrow_400gr',
  'bolt_400gr',
];

export interface ExternalProjectileSpec {
  id: ExternalProjectileId;
  code: string;
  nameZh: string;
  nameEn: string;
  loadLabelZh: string;
  loadLabelEn: string;
  category: ProjectileCategory;
  dragModel: DragModelId;
  /** Ballistic coefficient in standard lb/in² units */
  bc: number;
  /** Muzzle / launch velocity V₀ (m/s) */
  muzzleVelocityMps: number;
  /** Single-projectile mass in grains */
  massGrains: number;
  /** Single-projectile mass in grams */
  massGrams: number;
  /** Projectile / pellet diameter in mm */
  caliberMm: number;
  /** Number of sub-projectiles launched simultaneously (9 for 12ga 00 Buckshot, 1 otherwise) */
  pelletCount: number;
  /** Total launched payload mass in grams (massGrams * pelletCount) */
  totalPayloadGrams: number;
  /** Single-projectile muzzle energy (J) */
  singleMuzzleEnergyJ: number;
  /** Total payload muzzle energy (J) — equals 9-pellet total for 12ga 00 Buckshot */
  muzzleEnergyJ: number;
  /** Default sight height over bore axis (cm) */
  defaultSightHeightCm: number;
  /** Recommended zero distance (m) */
  recommendedZeroM: ZeroRangeOptionM;
  /** Representative museum weapon IDs (includes Wave-2 exhibits `m249`, `p08`, `vector`) */
  representativeWeaponIds: readonly string[];
  primaryWeaponId: string;
  noteZh: string;
  noteEn: string;
}

type ProjectileSeed = Omit<
  ExternalProjectileSpec,
  'totalPayloadGrams' | 'singleMuzzleEnergyJ' | 'muzzleEnergyJ'
>;

function defineProjectile(seed: ProjectileSeed): ExternalProjectileSpec {
  const singleMassKg = seed.massGrams / 1000;
  const singleMuzzleEnergyJ =
    0.5 * singleMassKg * seed.muzzleVelocityMps * seed.muzzleVelocityMps;
  const totalPayloadGrams = seed.massGrams * seed.pelletCount;
  return {
    ...seed,
    totalPayloadGrams,
    singleMuzzleEnergyJ,
    muzzleEnergyJ: singleMuzzleEnergyJ * seed.pelletCount,
  };
}

export const EXTERNAL_PROJECTILE_SPECS: Readonly<
  Record<ExternalProjectileId, ExternalProjectileSpec>
> = {
  '9mm_para': defineProjectile({
    id: '9mm_para',
    code: '9×19mm',
    nameZh: '9×19mm 帕拉贝鲁姆',
    nameEn: '9×19mm Parabellum',
    loadLabelZh: '124 gr FMJ 全被甲圆头弹',
    loadLabelEn: '124 gr FMJ Round-Nose',
    category: 'pistol',
    dragModel: 'G1',
    bc: 0.145,
    muzzleVelocityMps: 375,
    massGrains: 124,
    massGrams: 8.04,
    caliberMm: 9.01,
    pelletCount: 1,
    defaultSightHeightCm: 4.8,
    recommendedZeroM: 25,
    representativeWeaponIds: ['g17', 'mp5', 'p320', 'p08'],
    primaryWeaponId: 'g17',
    noteZh:
      '初速 375 m/s 微超音速出膛，约 55 m 跌入亚音速区，适合 25–100 m 近战交火。',
    noteEn:
      'Launches slightly supersonic at 375 m/s and drops subsonic near 55 m; optimized for 25–100 m service engagements.',
  }),

  '45_acp': defineProjectile({
    id: '45_acp',
    code: '.45 ACP',
    nameZh: '.45 ACP 自动手枪弹',
    nameEn: '.45 ACP (11.43×23mm)',
    loadLabelZh: '230 gr FMJ 重型亚音速圆头弹',
    loadLabelEn: '230 gr FMJ Subsonic Ball',
    category: 'pistol',
    dragModel: 'G1',
    bc: 0.195,
    muzzleVelocityMps: 260,
    massGrains: 230,
    massGrams: 14.9,
    caliberMm: 11.48,
    pelletCount: 1,
    defaultSightHeightCm: 4.8,
    recommendedZeroM: 25,
    representativeWeaponIds: ['vector'],
    primaryWeaponId: 'vector',
    noteZh:
      '天生亚音速（Mach 0.76）重弹头无激波阻力突变，配合微声抑制器极佳，但远距重力下坠显著。',
    noteEn:
      'Inherently subsonic (Mach 0.76) 230 gr slug avoids transonic wave-drag turbulence altogether at the cost of steep mid-range drop.',
  }),

  '57_28': defineProjectile({
    id: '57_28',
    code: '5.7×28mm',
    nameZh: '5.7×28mm FN SS190',
    nameEn: '5.7×28mm FN SS190',
    loadLabelZh: '31 gr SS190 钢铝复合穿甲弹',
    loadLabelEn: '31 gr SS190 Duty AP',
    category: 'pdw',
    dragModel: 'G7',
    bc: 0.105,
    muzzleVelocityMps: 716,
    massGrains: 31,
    massGrams: 2.01,
    caliberMm: 5.7,
    pelletCount: 1,
    defaultSightHeightCm: 4.8,
    recommendedZeroM: 50,
    representativeWeaponIds: ['p90'],
    primaryWeaponId: 'p90',
    noteZh:
      '2 克极轻弹头实现 200 m 内平直弹道与低后坐，但低截面密度使其横风偏流较敏感。',
    noteEn:
      'Ultra-light 31 gr spitzer delivers flat 0–200 m trajectory and mild recoil, though low sectional density increases crosswind sensitivity.',
  }),

  '357_magnum': defineProjectile({
    id: '357_magnum',
    code: '.357 Mag',
    nameZh: '.357 S&W 马格南',
    nameEn: '.357 S&W Magnum',
    loadLabelZh: '158 gr JSP 平头半被甲软尖弹',
    loadLabelEn: '158 gr JSP Flat-Meplat',
    category: 'pistol',
    dragModel: 'G1',
    bc: 0.162,
    muzzleVelocityMps: 385,
    massGrains: 158,
    massGrams: 10.24,
    caliberMm: 9.07,
    pelletCount: 1,
    defaultSightHeightCm: 4.8,
    recommendedZeroM: 25,
    representativeWeaponIds: ['python'],
    primaryWeaponId: 'python',
    noteZh:
      '6 英寸枪管下初速 385 m/s、枪口动能 759 J，比 9×19mm 具备更充沛的中近距存速与侵彻力。',
    noteEn:
      'From a 6" revolver barrel, the 158 gr JSP launches at 385 m/s (759 J), retaining higher downrange momentum than standard 9×19mm.',
  }),

  '50_ae': defineProjectile({
    id: '50_ae',
    code: '.50 AE',
    nameZh: '.50 Action Express',
    nameEn: '.50 Action Express',
    loadLabelZh: '300 gr JHP 重型空尖马格南弹',
    loadLabelEn: '300 gr JHP Magnum',
    category: 'pistol',
    dragModel: 'G1',
    bc: 0.155,
    muzzleVelocityMps: 470,
    massGrains: 300,
    massGrams: 19.44,
    caliberMm: 12.7,
    pelletCount: 1,
    defaultSightHeightCm: 4.8,
    recommendedZeroM: 50,
    representativeWeaponIds: ['deagle'],
    primaryWeaponId: 'deagle',
    noteZh:
      '19.44 g 大口径空尖弹爆发逾 2,140 J 枪口动能，但钝头大迎风面使超音速段在约 150 m 终结。',
    noteEn:
      'Unleashes over 2,140 J from a 300 gr 12.7mm hollow-point, though wide meplat drag brings Mach 1.0 transition near 150 m.',
  }),

  '12_gauge': defineProjectile({
    id: '12_gauge',
    code: '12 Gauge',
    nameZh: '12号 00号军用鹿弹',
    nameEn: '12ga 00 Buckshot (9-Pellet)',
    loadLabelZh: '9× 53.8 gr (Ø8.38mm) 锑铅圆球',
    loadLabelEn: '9× 53.8 gr (8.38mm) Sphere Payload',
    category: 'shotgun',
    dragModel: 'G1',
    bc: 0.065,
    muzzleVelocityMps: 404,
    massGrains: 53.8,
    massGrams: 3.486,
    caliberMm: 8.38,
    pelletCount: 9,
    defaultSightHeightCm: 4.8,
    recommendedZeroM: 25,
    representativeWeaponIds: ['benellim4'],
    primaryWeaponId: 'benellim4',
    noteZh:
      '9 粒 Ø8.38mm 圆球齐射总动能达 2,561 J，但圆球极低弹道系数（G1 0.065）伴随距离呈散布锥扩张与急剧能量衰减。',
    noteEn:
      'Nine 8.38mm spheres deliver 2,561 J combined muzzle energy, but spherical G1 BC 0.065 causes rapid velocity decay and conical pattern spread.',
  }),

  '762_m43': defineProjectile({
    id: '762_m43',
    code: '7.62×39mm',
    nameZh: '7.62×39mm M43',
    nameEn: '7.62×39mm M43 (57-N-231)',
    loadLabelZh: '123 gr PS 低碳钢芯船尾弹',
    loadLabelEn: '123 gr PS Steel-Core Boat-Tail',
    category: 'rifle',
    dragModel: 'G1',
    bc: 0.275,
    muzzleVelocityMps: 715,
    massGrains: 123,
    massGrams: 7.97,
    caliberMm: 7.92,
    pelletCount: 1,
    defaultSightHeightCm: 4.8,
    recommendedZeroM: 100,
    representativeWeaponIds: ['ak15'],
    primaryWeaponId: 'ak15',
    noteZh:
      '经典中间威力步枪弹，300 m 内动能充沛，在 480 m 左右进入跨音速区后下坠明显加剧（“彩虹弹道”）。',
    noteEn:
      'Classic intermediate rifle cartridge retaining stout barrier energy inside 300 m before entering transonic steepening near 480 m.',
  }),

  '556_nato': defineProjectile({
    id: '556_nato',
    code: '5.56 NATO',
    nameZh: '5.56×45mm NATO M855',
    nameEn: '5.56×45mm NATO M855',
    loadLabelZh: '62 gr M855 / SS109 钢铅双芯弹',
    loadLabelEn: '62 gr M855 Dual-Core Boat-Tail',
    category: 'rifle',
    dragModel: 'G7',
    bc: 0.151,
    muzzleVelocityMps: 910,
    massGrains: 62,
    massGrams: 4.02,
    caliberMm: 5.7,
    pelletCount: 1,
    defaultSightHeightCm: 4.8,
    recommendedZeroM: 100,
    representativeWeaponIds: ['m4a1', 'scar', 'aug', 'm249'],
    primaryWeaponId: 'm4a1',
    noteZh:
      '910 m/s 高初速带来 0–400 m 极平直直射弹道，约 650 m 穿越音障，远距横风偏流大于全威力弹。',
    noteEn:
      '910 m/s muzzle velocity yields a flat 0–400 m point-blank trajectory, crossing Mach 1.0 near 650 m with moderate long-range wind drift.',
  }),

  '30_06': defineProjectile({
    id: '30_06',
    code: '.30-06',
    nameZh: '.30-06 春田 M2 Ball',
    nameEn: '.30-06 Springfield M2 Ball',
    loadLabelZh: '150 gr M2 平底尖头全威力步枪弹',
    loadLabelEn: '150 gr M2 Flat-Base Spitzer',
    category: 'rifle',
    dragModel: 'G1',
    bc: 0.405,
    muzzleVelocityMps: 853,
    massGrains: 150,
    massGrams: 9.72,
    caliberMm: 7.82,
    pelletCount: 1,
    defaultSightHeightCm: 4.8,
    recommendedZeroM: 100,
    representativeWeaponIds: ['garand'],
    primaryWeaponId: 'garand',
    noteZh:
      '全威力步枪弹标杆：3,537 J 枪口动能与 G1 0.405 弹道系数使其超音速射程延伸至约 870 m。',
    noteEn:
      'Full-power battle rifle standard: 3,537 J muzzle energy and G1 BC 0.405 sustain supersonic flight out to ~870 m.',
  }),

  '338_lapua': defineProjectile({
    id: '338_lapua',
    code: '.338 LM',
    nameZh: '.338 拉普阿马格南',
    nameEn: '.338 Lapua Magnum',
    loadLabelZh: '250 gr Lapua Scenar VLD 空尖比赛弹',
    loadLabelEn: '250 gr Lapua Scenar OTM Boat-Tail',
    category: 'sniper',
    dragModel: 'G7',
    bc: 0.348,
    muzzleVelocityMps: 900,
    massGrains: 250,
    massGrams: 16.2,
    caliberMm: 8.59,
    pelletCount: 1,
    defaultSightHeightCm: 6.2,
    recommendedZeroM: 100,
    representativeWeaponIds: ['awm'],
    primaryWeaponId: 'awm',
    noteZh:
      '极低阻 VLD 船尾气动外形（G7 0.348）配合 900 m/s 初速，1,000 m 处仍保持 ~1.35 马赫超音速与极小风偏！',
    noteEn:
      'High-efficiency VLD boat-tail (G7 BC 0.348) at 900 m/s stays comfortably supersonic (~Mach 1.35) past 1,000 m with minimal windage.',
  }),

  '50_bmg': defineProjectile({
    id: '50_bmg',
    code: '.50 BMG',
    nameZh: '.50 BMG (12.7×99mm)',
    nameEn: '.50 BMG M33 Anti-Materiel',
    loadLabelZh: '660 gr M33 硬化钢芯反器材普通弹',
    loadLabelEn: '660 gr M33 Steel-Core Boat-Tail',
    category: 'sniper',
    dragModel: 'G7',
    bc: 0.34,
    muzzleVelocityMps: 890,
    massGrains: 660,
    massGrams: 42.77,
    caliberMm: 12.98,
    pelletCount: 1,
    defaultSightHeightCm: 6.2,
    recommendedZeroM: 100,
    representativeWeaponIds: ['m82a1'],
    primaryWeaponId: 'm82a1',
    noteZh:
      '42.8 克巨型弹头携带 16,940 J 毁灭级动能出膛，在 1,000 m 终点仍保有逾 4,200 J 装甲侵彻能量！',
    noteEn:
      '42.8 g anti-materiel projectile launches with 16,940 J and still delivers over 4,200 J of armor-defeating energy at 1,000 m.',
  }),

  arrow_400gr: defineProjectile({
    id: 'arrow_400gr',
    code: '400gr Arrow',
    nameZh: '400 gr 碳纤维复合猎箭',
    nameEn: '400 gr Carbon Hunting Arrow',
    loadLabelZh: '29" 微径碳杆 + 100 gr 三刃猎箭头 (348 FPS)',
    loadLabelEn: '29" Micro-Shaft + 100 gr Broadhead (348 FPS)',
    category: 'archery',
    dragModel: 'ARROW',
    bc: 0.052,
    muzzleVelocityMps: 106.0,
    massGrains: 400,
    massGrams: 25.92,
    caliberMm: 5.2,
    pelletCount: 1,
    defaultSightHeightCm: 4.8,
    recommendedZeroM: 25,
    representativeWeaponIds: ['lift33'],
    primaryWeaponId: 'lift33',
    noteZh:
      '70 磅双凸轮复合弓弹性蓄能发射（106 m/s · 145.6 J），低马赫尾羽摩擦主导气动减速，需高抛角补偿重力。',
    noteEn:
      '70 lb binary-cam elastic launch (106 m/s · 145.6 J); low-Mach shaft/vane skin drag and long flight time demand steep holdover arcs.',
  }),

  bolt_400gr: defineProjectile({
    id: 'bolt_400gr',
    code: '400gr Bolt',
    nameZh: '400 gr 螺旋凸轮碳素弩箭',
    nameEn: '400 gr Helical-Cam Crossbow Bolt',
    loadLabelZh: '20" 竞赛碳箭 + 100 gr 猎箭头 (500 FPS)',
    loadLabelEn: '20" Match Bolt + 100 gr Broadhead (500 FPS)',
    category: 'archery',
    dragModel: 'ARROW',
    bc: 0.056,
    muzzleVelocityMps: 152.4,
    massGrains: 400,
    massGrams: 25.92,
    caliberMm: 7.6,
    pelletCount: 1,
    defaultSightHeightCm: 4.8,
    recommendedZeroM: 25,
    representativeWeaponIds: ['r500'],
    primaryWeaponId: 'r500',
    noteZh:
      '300 磅 HexCoil 螺旋凸轮将 400 格令碳箭推至 500 FPS（152.4 m/s · 301 J），100 m 下坠仅为传统复合弓的一半。',
    noteEn:
      '300 lb HexCoil cams propel a 400 gr bolt to 500 FPS (152.4 m/s · 301 J), cutting 100 m gravitational drop to less than half of a compound bow.',
  }),
};

export function normalizeExternalProjectileId(
  input: ExternalProjectileInput | null | undefined
): ExternalProjectileId {
  if (!input) return '556_nato';
  if (input === '9x19') return '9mm_para';
  if (input === '57x28') return '57_28';
  if (input === '.45_acp' || input === '45acp') return '45_acp';
  return input in EXTERNAL_PROJECTILE_SPECS
    ? (input as ExternalProjectileId)
    : '556_nato';
}

export function getExternalProjectileSpec(
  input: ExternalProjectileInput
): ExternalProjectileSpec {
  return EXTERNAL_PROJECTILE_SPECS[normalizeExternalProjectileId(input)];
}

// ============================================================================
// 1. Standard ICAO / ISA Atmosphere Model
// ============================================================================

export interface BallisticsAtmosphere {
  altitudeM: number;
  tempC: number;
  /** Barometric pressure at altitude (hPa) */
  pressureHPa: number;
  /** Dry air density ρ(h, T) (kg/m³) */
  airDensityKgM3: number;
  /** Ratio ρ / ρ₀ relative to ICAO sea-level standard (1.225 kg/m³) */
  densityRatio: number;
  /** Local speed of sound a(T) = 331.3 * sqrt(1 + T / 273.15) (m/s) */
  speedOfSoundMps: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Computes ICAO barometric air density ρ(h, T) and speed of sound a(T).
 * Supports `altitudeM` across `[-500..6000]` (UI `0..3000 m`) and `tempC` across `[-50..65 °C]`.
 */
export function computeAtmosphere(
  altitudeM = 0,
  tempC = 15
): BallisticsAtmosphere {
  const safeAlt = clamp(Number.isFinite(altitudeM) ? altitudeM : 0, -500, 6000);
  const safeTemp = clamp(Number.isFinite(tempC) ? tempC : 15, -50, 65);
  const tempK = safeTemp + 273.15;

  // Barometric pressure exponent g₀·M / (R*·L) = 5.255877
  const base = Math.max(
    0.1,
    1 - (ISA_LAPSE_RATE_K_PER_M * safeAlt) / ISA_SEA_LEVEL_TEMP_K
  );
  const pressurePa = ISA_SEA_LEVEL_PRESSURE_PA * Math.pow(base, 5.255877);
  const airDensityKgM3 = pressurePa / (DRY_AIR_GAS_CONSTANT * tempK);
  const speedOfSoundMps = 331.3 * Math.sqrt(1 + safeTemp / 273.15);

  return {
    altitudeM: safeAlt,
    tempC: safeTemp,
    pressureHPa: pressurePa / 100,
    airDensityKgM3,
    densityRatio: airDensityKgM3 / ISA_SEA_LEVEL_DENSITY_KG_M3,
    speedOfSoundMps,
  };
}

// ============================================================================
// 2. Standard G1, G7 & Low-Mach Arrow Aerodynamic Drag Curves C_d(M)
//    Pre-baked into 1,025-entry C¹ monotone-cubic Hermite LUTs for O(1) Zero-GC RK4
// ============================================================================

const LUT_MAX_MACH = 4.0;
const LUT_STEPS = 1024;
const LUT_INV_DM = LUT_STEPS / LUT_MAX_MACH;

/** BRL / McCoy Standard G1 Projectile (2-caliber blunt ogive, flat base) */
const G1_KNOTS: readonly [mach: number, cd: number][] = [
  [0.0, 0.2629],
  [0.05, 0.2558],
  [0.1, 0.2487],
  [0.2, 0.2344],
  [0.3, 0.2229],
  [0.4, 0.2152],
  [0.5, 0.2032],
  [0.6, 0.2034],
  [0.7, 0.2065],
  [0.75, 0.2105],
  [0.8, 0.2181],
  [0.85, 0.2315],
  [0.9, 0.2596],
  [0.925, 0.2852],
  [0.95, 0.3215],
  [0.975, 0.3688],
  [1.0, 0.4225],
  [1.025, 0.4765],
  [1.05, 0.5217],
  [1.1, 0.5736],
  [1.15, 0.5983],
  [1.2, 0.6118],
  [1.3, 0.6231],
  [1.4, 0.6235],
  [1.5, 0.6177],
  [1.6, 0.6079],
  [1.8, 0.5847],
  [2.0, 0.5608],
  [2.2, 0.5378],
  [2.5, 0.5055],
  [3.0, 0.4616],
  [3.5, 0.4282],
  [4.0, 0.4025],
];

/** BRL / McCoy / Litz Standard G7 Projectile (10-caliber secant/tangent ogive, 7.5° boat-tail) */
const G7_KNOTS: readonly [mach: number, cd: number][] = [
  [0.0, 0.1198],
  [0.2, 0.1197],
  [0.4, 0.1196],
  [0.6, 0.1194],
  [0.7, 0.1199],
  [0.75, 0.1207],
  [0.8, 0.1223],
  [0.85, 0.1257],
  [0.875, 0.1292],
  [0.9, 0.1355],
  [0.925, 0.1476],
  [0.95, 0.1727],
  [0.975, 0.228],
  [1.0, 0.3052],
  [1.025, 0.3712],
  [1.05, 0.4043],
  [1.075, 0.4178],
  [1.1, 0.4225],
  [1.15, 0.4216],
  [1.2, 0.4158],
  [1.3, 0.4],
  [1.4, 0.3834],
  [1.5, 0.3673],
  [1.6, 0.3522],
  [1.8, 0.3257],
  [2.0, 0.3033],
  [2.2, 0.2846],
  [2.5, 0.2615],
  [3.0, 0.233],
  [3.5, 0.212],
  [4.0, 0.1965],
];

/** Fin-stabilized carbon shaft + 3 helical vanes low-Mach boundary-layer drag curve */
const ARROW_KNOTS: readonly [mach: number, cd: number][] = [
  [0.0, 0.228],
  [0.1, 0.218],
  [0.2, 0.209],
  [0.3, 0.203],
  [0.45, 0.198],
  [0.6, 0.197],
  [0.8, 0.208],
  [0.95, 0.295],
  [1.1, 0.46],
  [1.5, 0.42],
  [4.0, 0.32],
];

/**
 * Builds a uniform 1,025-sample Float64Array lookup table using Fritsch–Carlson
 * monotone piecewise cubic Hermite interpolation so C_d(M) has zero overshoot and C¹ continuity.
 */
function buildMonotoneHermiteDragLut(
  knots: readonly [number, number][]
): Float64Array {
  const n = knots.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = knots[i][0];
    ys[i] = knots[i][1];
  }

  const dx = new Float64Array(n - 1);
  const secants = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    secants[i] = (ys[i + 1] - ys[i]) / dx[i];
  }

  const slopes = new Float64Array(n);
  slopes[0] = secants[0];
  slopes[n - 1] = secants[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (secants[i - 1] * secants[i] <= 0) {
      slopes[i] = 0;
    } else {
      slopes[i] = 0.5 * (secants[i - 1] + secants[i]);
    }
  }

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(secants[i]) < 1e-12) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
    } else {
      const a = slopes[i] / secants[i];
      const b = slopes[i + 1] / secants[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        const scale = 3 / h;
        slopes[i] = scale * a * secants[i];
        slopes[i + 1] = scale * b * secants[i];
      }
    }
  }

  const lut = new Float64Array(LUT_STEPS + 1);
  let seg = 0;
  for (let k = 0; k <= LUT_STEPS; k++) {
    const m = (k * LUT_MAX_MACH) / LUT_STEPS;
    while (seg < n - 2 && m > xs[seg + 1]) {
      seg++;
    }
    const h = dx[seg];
    const t = clamp((m - xs[seg]) / h, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    lut[k] =
      h00 * ys[seg] +
      h10 * h * slopes[seg] +
      h01 * ys[seg + 1] +
      h11 * h * slopes[seg + 1];
  }
  return lut;
}

const DRAG_LUT_G1 = buildMonotoneHermiteDragLut(G1_KNOTS);
const DRAG_LUT_G7 = buildMonotoneHermiteDragLut(G7_KNOTS);
const DRAG_LUT_ARROW = buildMonotoneHermiteDragLut(ARROW_KNOTS);

function getDragLut(model: DragModelId): Float64Array {
  if (model === 'G7') return DRAG_LUT_G7;
  if (model === 'ARROW') return DRAG_LUT_ARROW;
  return DRAG_LUT_G1;
}

function sampleDragLutFast(lut: Float64Array, mach: number): number {
  if (mach <= 0) return lut[0];
  if (mach >= LUT_MAX_MACH) {
    // High-hypersonic tail mild asymptotic decay above Mach 4
    return lut[LUT_STEPS] * Math.pow(LUT_MAX_MACH / mach, 0.32);
  }
  const idxFloat = mach * LUT_INV_DM;
  const idx = idxFloat | 0;
  const frac = idxFloat - idx;
  return lut[idx] + (lut[idx + 1] - lut[idx]) * frac;
}

/**
 * Evaluates standard projectile drag coefficient C_d(M) at Mach number `mach >= 0`
 * for `'G1'`, `'G7'`, or `'ARROW'` drag curves.
 */
export function evaluateDragCoefficient(
  dragModel: DragModelId,
  mach: number
): number {
  return sampleDragLutFast(getDragLut(dragModel), mach);
}

export function classifyFlightRegime(mach: number): FlightRegime {
  if (mach > 1.2) return 'supersonic';
  if (mach >= 0.85) return 'transonic';
  return 'subsonic';
}

/**
 * Computes 12-Gauge 00 Buckshot conical pattern spread radius in mm at `rangeM`.
 * Returns `0` for single-projectile calibers (`pelletCount === 1`).
 */
export function computeBuckshotPatternRadiusMm(
  spec: ExternalProjectileSpec,
  rangeM: number
): number {
  if (spec.pelletCount <= 1 || rangeM <= 0) return 0;
  // Cylinder / Improved-Cylinder military 18.5" combat barrel: ~9.25mm bore exit radius
  // + ~13.5mm/m (~1" per yd diameter) dispersion + slight downrange billiard bloom
  return 9.25 + rangeM * 13.5 + 0.018 * Math.pow(rangeM, 1.35);
}

// ============================================================================
// 3. Sight-In Zero Elevation Solver & RK4 3-DOF Trajectory Integrator
// ============================================================================

export interface BallisticsSolveOptions {
  /** Maximum downrange chart distance in meters (default: 1000) */
  maxRangeM?: number;
  /** Sight-in zero distance in meters (default: 100) */
  zeroRangeM?: number;
  /** Optic / iron sight centerline height above bore axis in cm (default: 4.8) */
  sightHeightCm?: number;
  /** 90° lateral crosswind speed in m/s (+ = left-to-right +Z, - = right-to-left -Z; default: 0) */
  crosswindMps?: number;
  /** Geometric altitude above sea level in meters (0..3000+; default: 0) */
  altitudeM?: number;
  /** Ambient air temperature in °C (-20..+45; default: 15) */
  tempC?: number;
  /** Downrange sampling interval in meters (default: 5 m for >= 300 m, 2 m for 100 m) */
  sampleStepM?: number;
}

export interface TrajectorySample {
  /** Downrange horizontal distance x (m) */
  rangeM: number;
  /** Vertical height relative to Line of Sight in cm (negative = below LOS) */
  dropCm: number;
  /** Vertical height relative to Line of Sight in m */
  dropM: number;
  /** Lateral crosswind drift in cm (+ = downwind right, - = left) */
  windDriftCm: number;
  /** Lateral crosswind drift in m */
  windDriftM: number;
  /** Retained 3D speed |v| (m/s) */
  velocityMps: number;
  /** Instantaneous Mach number relative to air mass */
  mach: number;
  /** Standard drag coefficient C_d(M) at this point */
  dragCd: number;
  /** Retained total payload kinetic energy (J; 9-pellet sum for 12ga) */
  energyJ: number;
  /** Retained single-projectile / single-pellet kinetic energy (J) */
  singlePelletEnergyJ: number;
  /** Retained energy percentage relative to muzzle (0..100+) */
  retainedEnergyPct: number;
  /** Buckshot pattern spread radius in mm (0 for single projectiles) */
  patternSpreadRadiusMm: number;
  /** Elapsed time of flight in seconds */
  timeOfFlightS: number;
  /** Elapsed time of flight in milliseconds */
  timeOfFlightMs: number;
  /** Required scope elevation holdover in true MIL / mrad (+ = hold UP when dropCm < 0) */
  holdoverMil: number;
  /** Required scope elevation holdover in true MOA (+ = hold UP when dropCm < 0) */
  holdoverMoa: number;
  /** Lateral windage deflection in true MIL / mrad */
  windageMil: number;
  /** Lateral windage deflection in true MOA */
  windageMoa: number;
  /** True while Mach >= 1.0 */
  isSupersonic: boolean;
  /** Aerodynamic Mach regime ('supersonic' | 'transonic' | 'subsonic') */
  flightRegime: FlightRegime;
}

export interface DopeCardRow {
  rangeM: number;
  inFlight: boolean;
  dropCm: number;
  windDriftCm: number;
  holdoverMil: number;
  holdoverMoa: number;
  windageMil: number;
  windageMoa: number;
  velocityMps: number;
  mach: number;
  energyJ: number;
  singlePelletEnergyJ: number;
  patternSpreadRadiusMm: number;
  timeOfFlightS: number;
  flightRegime: FlightRegime;
}

export interface BallisticSolution {
  projectileId: ExternalProjectileId;
  spec: ExternalProjectileSpec;
  atmosphere: BallisticsAtmosphere;
  maxRangeM: number;
  effectiveMaxRangeM: number;
  sampleStepM: number;
  zeroRangeM: number;
  sightHeightCm: number;
  crosswindMps: number;
  /** Solved bore pitch angle relative to Line of Sight (rad) */
  zeroAngleRad: number;
  /** Solved bore pitch angle in true MIL (mrad) */
  zeroAngleMil: number;
  /** Solved bore pitch angle in true MOA */
  zeroAngleMoa: number;
  /** Residual vertical error |y(zeroRangeM)| in cm (< 0.02 cm) */
  zeroErrorCm: number;
  /** Exact downrange distance (m) where projectile decelerates below Mach 1.2 (null if M₀ < 1.2) */
  transonicEntryRangeM: number | null;
  /** Exact downrange distance (m) where projectile decelerates below Mach 1.0 (null if M₀ < 1.0) */
  transonicRangeM: number | null;
  /** True if projectile launches subsonic right at the muzzle (M₀ < 1.0) */
  isInitiallySubsonic: boolean;
  /** Maximum height of trajectory above Line of Sight within [0..maxRangeM] (cm) */
  maxOrdinateCm: number;
  /** Downrange distance at which maxOrdinateCm occurs (m) */
  maxOrdinateRangeM: number;
  /** Dense uniform trajectory samples from 0 up to effectiveMaxRangeM */
  samples: TrajectorySample[];
}

/**
 * Fast Zero-GC scalar RK4 integrator used by the Sight-In Zero Elevation Solver:
 * integrates from `x = 0` to `x = targetRangeM` and returns vertical height `y(targetRangeM)` in meters.
 */
function integrateVerticalAtRangeScalar(
  v0: number,
  sightHeightM: number,
  elevRad: number,
  targetRangeM: number,
  dragFactorBase: number,
  invSoundSpeed: number,
  lut: Float64Array,
  crosswindMps: number
): number {
  if (targetRangeM <= 0) return -sightHeightM;

  const dt = targetRangeM <= 200 ? 0.001 : 0.00125;
  let x = 0;
  let y = -sightHeightM;
  let vx = v0 * Math.cos(elevRad);
  let vy = v0 * Math.sin(elevRad);
  let vz = 0;

  const maxSteps = 20000;
  for (let step = 0; step < maxSteps; step++) {
    const prevX = x;
    const prevY = y;

    // RK4 stage 1
    const dwz1 = vz - crosswindMps;
    const vRel1 = Math.sqrt(vx * vx + vy * vy + dwz1 * dwz1);
    const kd1 =
      dragFactorBase * sampleDragLutFast(lut, vRel1 * invSoundSpeed) * vRel1;
    const ax1 = -kd1 * vx;
    const ay1 = -kd1 * vy - GRAVITY_MPS2;
    const az1 = -kd1 * dwz1;

    // RK4 stage 2
    const halfDt = 0.5 * dt;
    const vx2 = vx + halfDt * ax1;
    const vy2 = vy + halfDt * ay1;
    const vz2 = vz + halfDt * az1;
    const dwz2 = vz2 - crosswindMps;
    const vRel2 = Math.sqrt(vx2 * vx2 + vy2 * vy2 + dwz2 * dwz2);
    const kd2 =
      dragFactorBase * sampleDragLutFast(lut, vRel2 * invSoundSpeed) * vRel2;
    const ax2 = -kd2 * vx2;
    const ay2 = -kd2 * vy2 - GRAVITY_MPS2;
    const az2 = -kd2 * dwz2;

    // RK4 stage 3
    const vx3 = vx + halfDt * ax2;
    const vy3 = vy + halfDt * ay2;
    const vz3 = vz + halfDt * az2;
    const dwz3 = vz3 - crosswindMps;
    const vRel3 = Math.sqrt(vx3 * vx3 + vy3 * vy3 + dwz3 * dwz3);
    const kd3 =
      dragFactorBase * sampleDragLutFast(lut, vRel3 * invSoundSpeed) * vRel3;
    const ax3 = -kd3 * vx3;
    const ay3 = -kd3 * vy3 - GRAVITY_MPS2;
    const az3 = -kd3 * dwz3;

    // RK4 stage 4
    const vx4 = vx + dt * ax3;
    const vy4 = vy + dt * ay3;
    const vz4 = vz + dt * az3;
    const dwz4 = vz4 - crosswindMps;
    const vRel4 = Math.sqrt(vx4 * vx4 + vy4 * vy4 + dwz4 * dwz4);
    const kd4 =
      dragFactorBase * sampleDragLutFast(lut, vRel4 * invSoundSpeed) * vRel4;
    const ax4 = -kd4 * vx4;
    const ay4 = -kd4 * vy4 - GRAVITY_MPS2;
    const az4 = -kd4 * dwz4;

    const sixthDt = dt / 6;
    x += sixthDt * (vx + 2 * (vx2 + vx3) + vx4);
    y += sixthDt * (vy + 2 * (vy2 + vy3) + vy4);
    vx += sixthDt * (ax1 + 2 * (ax2 + ax3) + ax4);
    vy += sixthDt * (ay1 + 2 * (ay2 + ay3) + ay4);
    vz += sixthDt * (az1 + 2 * (az2 + az3) + az4);

    if (x >= targetRangeM) {
      const span = x - prevX;
      const frac = span > 1e-12 ? (targetRangeM - prevX) / span : 0;
      return prevY + (y - prevY) * frac;
    }
    if (vx < 2.0 || y < -800) {
      // Projectile stalled short of targetRangeM; return negative miss so solver raises angle
      return y - (targetRangeM - x) * 2;
    }
  }
  return y;
}

/**
 * Solves for the exact bore sight-in pitch elevation angle `zeroAngleRad` (radians)
 * so that `|y(zeroRangeM)| < 0.0005 cm` (`< 0.02 cm` contract) using safeguarded
 * secant + bracketed bisection.
 */
export function solveZeroElevationAngleRad(
  projectileInput: ExternalProjectileInput,
  zeroRangeM = 100,
  sightHeightCm = 4.8,
  atmosphere: BallisticsAtmosphere = computeAtmosphere(0, 15),
  crosswindMps = 0
): { zeroAngleRad: number; zeroErrorCm: number } {
  const spec = getExternalProjectileSpec(projectileInput);
  const safeZeroM = clamp(zeroRangeM, 5, 1000);
  const sightHeightM = Math.max(0, sightHeightCm) / 100;
  const dragFactorBase =
    (DRAG_RETARDATION_CONST * atmosphere.airDensityKgM3) / spec.bc;
  const invSoundSpeed = 1 / atmosphere.speedOfSoundMps;
  const lut = getDragLut(spec.dragModel);

  const evalY = (theta: number): number =>
    integrateVerticalAtRangeScalar(
      spec.muzzleVelocityMps,
      sightHeightM,
      theta,
      safeZeroM,
      dragFactorBase,
      invSoundSpeed,
      lut,
      crosswindMps
    );

  // Tolerance: 2e-6 m = 0.0002 cm (100x tighter than 0.02 cm requirement)
  const tolM = 2e-6;

  // Initial physical guesses: vacuum + drag estimate
  const tEst = safeZeroM / spec.muzzleVelocityMps;
  const dropEstM = sightHeightM + 0.5 * GRAVITY_MPS2 * tEst * tEst * 1.32;
  let theta0 = Math.atan2(sightHeightM, safeZeroM);
  let theta1 = clamp(Math.atan2(dropEstM, safeZeroM), theta0 + 1e-4, 0.72);

  let y0 = evalY(theta0);
  if (Math.abs(y0) <= tolM) {
    return { zeroAngleRad: theta0, zeroErrorCm: Math.abs(y0) * 100 };
  }
  let y1 = evalY(theta1);
  if (Math.abs(y1) <= tolM) {
    return { zeroAngleRad: theta1, zeroErrorCm: Math.abs(y1) * 100 };
  }

  // Ensure upper bracket reaches y >= 0 for steep low-velocity archery zeroing
  let hiProbe = theta1;
  while (y1 < 0 && hiProbe < 0.78) {
    theta0 = hiProbe;
    y0 = y1;
    hiProbe = Math.min(0.78, hiProbe * 1.8 + 0.015);
    theta1 = hiProbe;
    y1 = evalY(theta1);
  }

  // Safeguarded Secant + Bracketed Bisection
  let bracketLo = y0 < 0 && y1 > 0 ? theta0 : 0;
  let bracketHi = y0 < 0 && y1 > 0 ? theta1 : 0.78;
  const hasBracket = y0 * y1 < 0;

  for (let iter = 0; iter < 26; iter++) {
    let nextTheta: number;
    const dy = y1 - y0;
    if (Math.abs(dy) > 1e-14) {
      nextTheta = theta1 - (y1 * (theta1 - theta0)) / dy;
    } else {
      nextTheta = 0.5 * (theta0 + theta1);
    }

    if (hasBracket) {
      if (nextTheta <= bracketLo || nextTheta >= bracketHi) {
        nextTheta = 0.5 * (bracketLo + bracketHi);
      }
    } else {
      nextTheta = clamp(nextTheta, -0.05, 0.78);
    }

    const nextY = evalY(nextTheta);
    if (Math.abs(nextY) <= tolM) {
      return { zeroAngleRad: nextTheta, zeroErrorCm: Math.abs(nextY) * 100 };
    }

    if (hasBracket) {
      if (nextY < 0) {
        bracketLo = nextTheta;
      } else {
        bracketHi = nextTheta;
      }
      if (Math.abs(bracketHi - bracketLo) < 1e-10) {
        return { zeroAngleRad: nextTheta, zeroErrorCm: Math.abs(nextY) * 100 };
      }
    }

    theta0 = theta1;
    y0 = y1;
    theta1 = nextTheta;
    y1 = nextY;
  }

  return { zeroAngleRad: theta1, zeroErrorCm: Math.abs(y1) * 100 };
}

function buildTrajectorySample(
  spec: ExternalProjectileSpec,
  lut: Float64Array,
  soundSpeedMps: number,
  crosswindMps: number,
  rangeM: number,
  yM: number,
  zM: number,
  vx: number,
  vy: number,
  vz: number,
  timeS: number
): TrajectorySample {
  const speedMps = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const dwz = vz - crosswindMps;
  const vRel = Math.sqrt(vx * vx + vy * vy + dwz * dwz);
  const mach = vRel / soundSpeedMps;
  const dragCd = sampleDragLutFast(lut, mach);

  const singleMassKg = spec.massGrams / 1000;
  const singlePelletEnergyJ = 0.5 * singleMassKg * speedMps * speedMps;
  const energyJ = singlePelletEnergyJ * spec.pelletCount;
  const retainedEnergyPct =
    spec.muzzleEnergyJ > 0 ? (energyJ / spec.muzzleEnergyJ) * 100 : 0;

  let holdoverMil = 0;
  let holdoverMoa = 0;
  let windageMil = 0;
  let windageMoa = 0;
  if (rangeM > 1e-6) {
    const elevAngleRad = Math.atan2(-yM, rangeM);
    const windAngleRad = Math.atan2(zM, rangeM);
    holdoverMil = elevAngleRad * MRAD_PER_RAD;
    holdoverMoa = elevAngleRad * MOA_PER_RAD;
    windageMil = windAngleRad * MRAD_PER_RAD;
    windageMoa = windAngleRad * MOA_PER_RAD;
  }

  return {
    rangeM,
    dropCm: yM * 100,
    dropM: yM,
    windDriftCm: zM * 100,
    windDriftM: zM,
    velocityMps: speedMps,
    mach,
    dragCd,
    energyJ,
    singlePelletEnergyJ,
    retainedEnergyPct,
    patternSpreadRadiusMm: computeBuckshotPatternRadiusMm(spec, rangeM),
    timeOfFlightS: timeS,
    timeOfFlightMs: timeS * 1000,
    holdoverMil,
    holdoverMoa,
    windageMil,
    windageMoa,
    isSupersonic: mach >= 1.0,
    flightRegime: classifyFlightRegime(mach),
  };
}

/**
 * Full deterministic RK4 3-DOF External Ballistics Solver.
 * Integrates 3D trajectory up to `maxRangeM` (and tracks supersonic Mach 1.0 crossing
 * out to 2,500 m when still supersonic at `maxRangeM` so `.338 LM` & `.50 BMG` report
 * exact transonic crossing distances).
 */
export function computeBallisticSolution(
  projectileInput: ExternalProjectileInput,
  options: BallisticsSolveOptions = {}
): BallisticSolution {
  const spec = getExternalProjectileSpec(projectileInput);
  const maxRangeM = clamp(options.maxRangeM ?? 1000, 25, 2500);
  const zeroRangeM = clamp(
    options.zeroRangeM ?? spec.recommendedZeroM,
    10,
    1000
  );
  const sightHeightCm = clamp(
    options.sightHeightCm ?? spec.defaultSightHeightCm,
    0,
    20
  );
  const crosswindMps = clamp(
    Number.isFinite(options.crosswindMps)
      ? (options.crosswindMps as number)
      : 0,
    -35,
    35
  );
  const atmosphere = computeAtmosphere(
    options.altitudeM ?? 0,
    options.tempC ?? 15
  );

  const sampleStepM =
    options.sampleStepM ?? (maxRangeM <= 100 ? 2 : maxRangeM <= 300 ? 5 : 5);

  const { zeroAngleRad, zeroErrorCm } = solveZeroElevationAngleRad(
    spec.id,
    zeroRangeM,
    sightHeightCm,
    atmosphere,
    crosswindMps
  );

  const sightHeightM = sightHeightCm / 100;
  const dragFactorBase =
    (DRAG_RETARDATION_CONST * atmosphere.airDensityKgM3) / spec.bc;
  const soundSpeedMps = atmosphere.speedOfSoundMps;
  const invSoundSpeed = 1 / soundSpeedMps;
  const lut = getDragLut(spec.dragModel);

  let x = 0;
  let y = -sightHeightM;
  let z = 0;
  let vx = spec.muzzleVelocityMps * Math.cos(zeroAngleRad);
  let vy = spec.muzzleVelocityMps * Math.sin(zeroAngleRad);
  let vz = 0;
  let t = 0;

  const initialRelV = Math.sqrt(
    vx * vx + vy * vy + crosswindMps * crosswindMps
  );
  const initialMach = initialRelV * invSoundSpeed;
  const isInitiallySubsonic = initialMach < 1.0;

  let transonicEntryRangeM: number | null = null;
  let transonicRangeM: number | null = null;
  let crossedMach12 = initialMach < 1.2;
  let crossedMach10 = isInitiallySubsonic;

  const samples: TrajectorySample[] = [
    buildTrajectorySample(
      spec,
      lut,
      soundSpeedMps,
      crosswindMps,
      0,
      y,
      z,
      vx,
      vy,
      vz,
      0
    ),
  ];

  let nextSampleRangeM = sampleStepM;
  let maxOrdinateCm = y * 100;
  let maxOrdinateRangeM = 0;
  let effectiveMaxRangeM = 0;

  const dt = maxRangeM <= 600 ? 0.001 : 0.00125;
  const maxSteps = 32000;
  const transonicSearchCapM = 2500;

  let prevMach = initialMach;

  for (let step = 0; step < maxSteps; step++) {
    const prevX = x;
    const prevY = y;
    const prevZ = z;
    const prevVx = vx;
    const prevVy = vy;
    const prevVz = vz;
    const prevT = t;

    // Use coarse step once past maxRangeM when only hunting for supersonic M=1.0 crossing
    const h = x >= maxRangeM ? 0.0025 : dt;

    // RK4 stage 1
    const dwz1 = vz - crosswindMps;
    const vRel1 = Math.sqrt(vx * vx + vy * vy + dwz1 * dwz1);
    const kd1 =
      dragFactorBase * sampleDragLutFast(lut, vRel1 * invSoundSpeed) * vRel1;
    const ax1 = -kd1 * vx;
    const ay1 = -kd1 * vy - GRAVITY_MPS2;
    const az1 = -kd1 * dwz1;

    // RK4 stage 2
    const halfH = 0.5 * h;
    const vx2 = vx + halfH * ax1;
    const vy2 = vy + halfH * ay1;
    const vz2 = vz + halfH * az1;
    const dwz2 = vz2 - crosswindMps;
    const vRel2 = Math.sqrt(vx2 * vx2 + vy2 * vy2 + dwz2 * dwz2);
    const kd2 =
      dragFactorBase * sampleDragLutFast(lut, vRel2 * invSoundSpeed) * vRel2;
    const ax2 = -kd2 * vx2;
    const ay2 = -kd2 * vy2 - GRAVITY_MPS2;
    const az2 = -kd2 * dwz2;

    // RK4 stage 3
    const vx3 = vx + halfH * ax2;
    const vy3 = vy + halfH * ay2;
    const vz3 = vz + halfH * az2;
    const dwz3 = vz3 - crosswindMps;
    const vRel3 = Math.sqrt(vx3 * vx3 + vy3 * vy3 + dwz3 * dwz3);
    const kd3 =
      dragFactorBase * sampleDragLutFast(lut, vRel3 * invSoundSpeed) * vRel3;
    const ax3 = -kd3 * vx3;
    const ay3 = -kd3 * vy3 - GRAVITY_MPS2;
    const az3 = -kd3 * dwz3;

    // RK4 stage 4
    const vx4 = vx + h * ax3;
    const vy4 = vy + h * ay3;
    const vz4 = vz + h * az3;
    const dwz4 = vz4 - crosswindMps;
    const vRel4 = Math.sqrt(vx4 * vx4 + vy4 * vy4 + dwz4 * dwz4);
    const kd4 =
      dragFactorBase * sampleDragLutFast(lut, vRel4 * invSoundSpeed) * vRel4;
    const ax4 = -kd4 * vx4;
    const ay4 = -kd4 * vy4 - GRAVITY_MPS2;
    const az4 = -kd4 * dwz4;

    const sixthH = h / 6;
    x += sixthH * (vx + 2 * (vx2 + vx3) + vx4);
    y += sixthH * (vy + 2 * (vy2 + vy3) + vy4);
    z += sixthH * (vz + 2 * (vz2 + vz3) + vz4);
    vx += sixthH * (ax1 + 2 * (ax2 + ax3) + ax4);
    vy += sixthH * (ay1 + 2 * (ay2 + ay3) + ay4);
    vz += sixthH * (az1 + 2 * (az2 + az3) + az4);
    t += h;

    const curDwz = vz - crosswindMps;
    const curRelV = Math.sqrt(vx * vx + vy * vy + curDwz * curDwz);
    const curMach = curRelV * invSoundSpeed;

    // Detect exact Mach 1.2 transonic onset & Mach 1.0 sonic barrier crossing
    if (!crossedMach12 && curMach <= 1.2) {
      const denom = prevMach - curMach;
      const frac = denom > 1e-9 ? clamp((prevMach - 1.2) / denom, 0, 1) : 1;
      transonicEntryRangeM = prevX + (x - prevX) * frac;
      crossedMach12 = true;
    }
    if (!crossedMach10 && curMach <= 1.0) {
      const denom = prevMach - curMach;
      const frac = denom > 1e-9 ? clamp((prevMach - 1.0) / denom, 0, 1) : 1;
      transonicRangeM = prevX + (x - prevX) * frac;
      crossedMach10 = true;
    }
    prevMach = curMach;

    // Track peak ordinate height inside [0..maxRangeM]
    if (prevX < maxRangeM) {
      const clampedX = Math.min(x, maxRangeM);
      const span = x - prevX;
      const frac = span > 1e-12 ? (clampedX - prevX) / span : 1;
      const clampedYCm = (prevY + (y - prevY) * frac) * 100;
      if (clampedYCm > maxOrdinateCm) {
        maxOrdinateCm = clampedYCm;
        maxOrdinateRangeM = clampedX;
      }
    }

    // Emit uniform downrange samples up to maxRangeM
    const dx = x - prevX;
    while (
      nextSampleRangeM <= x &&
      nextSampleRangeM <= maxRangeM &&
      dx > 1e-12
    ) {
      const u = clamp((nextSampleRangeM - prevX) / dx, 0, 1);
      const sx = nextSampleRangeM;
      const sy = prevY + (y - prevY) * u;
      const sz = prevZ + (z - prevZ) * u;
      const svx = prevVx + (vx - prevVx) * u;
      const svy = prevVy + (vy - prevVy) * u;
      const svz = prevVz + (vz - prevVz) * u;
      const st = prevT + (t - prevT) * u;

      samples.push(
        buildTrajectorySample(
          spec,
          lut,
          soundSpeedMps,
          crosswindMps,
          sx,
          sy,
          sz,
          svx,
          svy,
          svz,
          st
        )
      );
      effectiveMaxRangeM = sx;
      nextSampleRangeM += sampleStepM;
    }

    // Ensure exact terminal sample if maxRangeM is not a multiple of sampleStepM
    if (
      prevX < maxRangeM &&
      x >= maxRangeM &&
      effectiveMaxRangeM < maxRangeM - 1e-6 &&
      dx > 1e-12
    ) {
      const u = clamp((maxRangeM - prevX) / dx, 0, 1);
      samples.push(
        buildTrajectorySample(
          spec,
          lut,
          soundSpeedMps,
          crosswindMps,
          maxRangeM,
          prevY + (y - prevY) * u,
          prevZ + (z - prevZ) * u,
          prevVx + (vx - prevVx) * u,
          prevVy + (vy - prevVy) * u,
          prevVz + (vz - prevVz) * u,
          prevT + (t - prevT) * u
        )
      );
      effectiveMaxRangeM = maxRangeM;
    }

    // Stop once we have covered maxRangeM AND resolved Mach 1.0 crossing (or reached search cap)
    if (x >= maxRangeM && (crossedMach10 || x >= transonicSearchCapM)) {
      break;
    }

    // Sub-terminal stall guard for low-BC subsonic arrows / buckshot at extreme ranges
    if (vx < 3.0 || y < -600 || t > 28) {
      if (effectiveMaxRangeM < x && x <= maxRangeM) {
        samples.push(
          buildTrajectorySample(
            spec,
            lut,
            soundSpeedMps,
            crosswindMps,
            Math.min(x, maxRangeM),
            y,
            z,
            vx,
            vy,
            vz,
            t
          )
        );
        effectiveMaxRangeM = Math.min(x, maxRangeM);
      }
      break;
    }
  }

  return {
    projectileId: spec.id,
    spec,
    atmosphere,
    maxRangeM,
    effectiveMaxRangeM,
    sampleStepM,
    zeroRangeM,
    sightHeightCm,
    crosswindMps,
    zeroAngleRad,
    zeroAngleMil: zeroAngleRad * MRAD_PER_RAD,
    zeroAngleMoa: zeroAngleRad * MOA_PER_RAD,
    zeroErrorCm,
    transonicEntryRangeM,
    transonicRangeM,
    isInitiallySubsonic,
    maxOrdinateCm,
    maxOrdinateRangeM,
    samples,
  };
}

// ============================================================================
// 4. Trajectory Interpolation & Sniper DOPE Drop Card Builder
// ============================================================================

/**
 * Interpolates a `BallisticSolution` at any arbitrary target distance `rangeM` (`0..effectiveMaxRangeM`).
 * Returns `null` only if `rangeM > solution.effectiveMaxRangeM + 0.5` (projectile stalled short).
 */
export function interpolateTrajectoryAt(
  solution: BallisticSolution,
  rangeM: number
): TrajectorySample | null {
  const pts = solution.samples;
  if (pts.length === 0) return null;
  if (rangeM <= 0) return pts[0];
  const last = pts[pts.length - 1];
  if (rangeM > last.rangeM + 0.5) {
    return null;
  }
  if (rangeM >= last.rangeM) {
    return last;
  }

  // Binary search over monotonically increasing rangeM
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].rangeM <= rangeM) lo = mid;
    else hi = mid;
  }

  const a = pts[lo];
  const b = pts[hi];
  const span = b.rangeM - a.rangeM;
  if (span <= 1e-9) return a;
  const u = clamp((rangeM - a.rangeM) / span, 0, 1);

  const dropM = a.dropM + (b.dropM - a.dropM) * u;
  const windDriftM = a.windDriftM + (b.windDriftM - a.windDriftM) * u;
  const velocityMps = a.velocityMps + (b.velocityMps - a.velocityMps) * u;
  const mach = a.mach + (b.mach - a.mach) * u;
  const dragCd = a.dragCd + (b.dragCd - a.dragCd) * u;
  const singlePelletEnergyJ =
    a.singlePelletEnergyJ + (b.singlePelletEnergyJ - a.singlePelletEnergyJ) * u;
  const energyJ = a.energyJ + (b.energyJ - a.energyJ) * u;
  const retainedEnergyPct =
    a.retainedEnergyPct + (b.retainedEnergyPct - a.retainedEnergyPct) * u;
  const timeOfFlightS =
    a.timeOfFlightS + (b.timeOfFlightS - a.timeOfFlightS) * u;

  const elevRad = rangeM > 1e-6 ? Math.atan2(-dropM, rangeM) : 0;
  const windRad = rangeM > 1e-6 ? Math.atan2(windDriftM, rangeM) : 0;

  return {
    rangeM,
    dropCm: dropM * 100,
    dropM,
    windDriftCm: windDriftM * 100,
    windDriftM,
    velocityMps,
    mach,
    dragCd,
    energyJ,
    singlePelletEnergyJ,
    retainedEnergyPct,
    patternSpreadRadiusMm: computeBuckshotPatternRadiusMm(
      solution.spec,
      rangeM
    ),
    timeOfFlightS,
    timeOfFlightMs: timeOfFlightS * 1000,
    holdoverMil: elevRad * MRAD_PER_RAD,
    holdoverMoa: elevRad * MOA_PER_RAD,
    windageMil: windRad * MRAD_PER_RAD,
    windageMoa: windRad * MOA_PER_RAD,
    isSupersonic: mach >= 1.0,
    flightRegime: classifyFlightRegime(mach),
  };
}

/**
 * Generates a multi-range Sniper DOPE (Data On Previous Engagements) Drop Card
 * across standard distances (`50 / 100 / 200 / 300 / 500 / 800 / 1000 m` by default).
 */
export function buildDopeCardRows(
  solution: BallisticSolution,
  rangesM: readonly number[] = DEFAULT_DOPE_RANGES_M
): DopeCardRow[] {
  // If solution was computed for a shorter chart range (e.g. 300m), seamlessly extend
  // a companion solution to cover max requested DOPE distance when needed.
  const maxRequested = rangesM.reduce((m, r) => (r > m ? r : m), 0);
  const fullSol =
    maxRequested > solution.maxRangeM
      ? computeBallisticSolution(solution.projectileId, {
          maxRangeM: maxRequested,
          zeroRangeM: solution.zeroRangeM,
          sightHeightCm: solution.sightHeightCm,
          crosswindMps: solution.crosswindMps,
          altitudeM: solution.atmosphere.altitudeM,
          tempC: solution.atmosphere.tempC,
          sampleStepM: 5,
        })
      : solution;

  return rangesM.map((rangeM) => {
    const sample = interpolateTrajectoryAt(fullSol, rangeM);
    if (!sample) {
      return {
        rangeM,
        inFlight: false,
        dropCm: 0,
        windDriftCm: 0,
        holdoverMil: 0,
        holdoverMoa: 0,
        windageMil: 0,
        windageMoa: 0,
        velocityMps: 0,
        mach: 0,
        energyJ: 0,
        singlePelletEnergyJ: 0,
        patternSpreadRadiusMm: 0,
        timeOfFlightS: 0,
        flightRegime: 'subsonic',
      };
    }
    return {
      rangeM,
      inFlight: true,
      dropCm: sample.dropCm,
      windDriftCm: sample.windDriftCm,
      holdoverMil: sample.holdoverMil,
      holdoverMoa: sample.holdoverMoa,
      windageMil: sample.windageMil,
      windageMoa: sample.windageMoa,
      velocityMps: sample.velocityMps,
      mach: sample.mach,
      energyJ: sample.energyJ,
      singlePelletEnergyJ: sample.singlePelletEnergyJ,
      patternSpreadRadiusMm: sample.patternSpreadRadiusMm,
      timeOfFlightS: sample.timeOfFlightS,
      flightRegime: sample.flightRegime,
    };
  });
}

// ============================================================================
// 5. Curated Multi-Caliber Range Showdown Presets
// ============================================================================

export interface BallisticsPresetSpec {
  id: string;
  labelZh: string;
  labelEn: string;
  subtitleZh: string;
  subtitleEn: string;
  projectiles: readonly ExternalProjectileId[];
  maxRangeM: MaxRangeOptionM;
  zeroRangeM: ZeroRangeOptionM;
  sightHeightCm: number;
  crosswindMps: number;
}

export const BALLISTICS_RANGE_PRESETS: readonly BallisticsPresetSpec[] = [
  {
    id: 'sniper_elr',
    labelZh: '狙击远射对决: .50 BMG vs .338 LM vs .30-06 vs 5.56',
    labelEn: 'Sniper ELR: .50 BMG vs .338 LM vs .30-06 vs 5.56',
    subtitleZh:
      '1,000m 极限对决：直观对比 VLD 船尾马格南超音速存速优势与跨音速激波衰减点',
    subtitleEn:
      '1,000m showdown contrasting VLD boat-tail supersonic retention against intermediate rifle transonic decay',
    projectiles: ['50_bmg', '338_lapua', '30_06', '556_nato'],
    maxRangeM: 1000,
    zeroRangeM: 100,
    sightHeightCm: 6.2,
    crosswindMps: 4.5,
  },
  {
    id: 'close_combat',
    labelZh: '近战手枪与霰弹: 9mm vs .357 Mag vs .50 AE vs 12ga',
    labelEn: 'Sidearms & Buckshot: 9mm vs .357 Mag vs .50 AE vs 12ga',
    subtitleZh:
      '100m 战术距离：对比大口径手枪弹与 9 粒 00 号鹿弹齐射动能交叉点及散布锥半径',
    subtitleEn:
      '100m CQB comparison of service/magnum sidearms against 9-pellet 00 buckshot energy crossover & spread cone',
    projectiles: ['9mm_para', '357_magnum', '50_ae', '12_gauge'],
    maxRangeM: 100,
    zeroRangeM: 25,
    sightHeightCm: 4.8,
    crosswindMps: 3.0,
  },
  {
    id: 'cold_vs_hot',
    labelZh: '冷热兵器跨界: 400gr 复合弓箭 vs 500FPS 弩箭 vs 9mm vs 5.56',
    labelEn: 'Archery vs Firearms: 400gr Bow vs 500FPS Crossbow vs 9mm vs 5.56',
    subtitleZh:
      '跨越冷热时代：同屏量化碳纤复合弓/螺旋弩高抛物线弧度与现代火药弹丸直射弹道',
    subtitleEn:
      'Cross-era comparison pitting 348/500 FPS carbon archery arcs directly against supersonic firearm trajectories',
    projectiles: ['arrow_400gr', 'bolt_400gr', '9mm_para', '556_nato'],
    maxRangeM: 100,
    zeroRangeM: 25,
    sightHeightCm: 4.8,
    crosswindMps: 3.0,
  },
  {
    id: 'subsonic_pdw',
    labelZh: '亚音速与PDW: .45 ACP vs 9mm vs 5.7×28 vs 7.62×39',
    labelEn: 'Subsonic & PDW: .45 ACP vs 9mm vs 5.7×28 vs 7.62×39',
    subtitleZh:
      '300m 突击与微声对比：230gr 亚音速重弹、高速穿甲微声弹与中间威力步枪弹交锋',
    subtitleEn:
      '300m subgun & PDW study comparing heavy subsonic .45 ACP, high-velocity 5.7×28mm AP, and 7.62×39mm M43',
    projectiles: ['45_acp', '9mm_para', '57_28', '762_m43'],
    maxRangeM: 300,
    zeroRangeM: 50,
    sightHeightCm: 4.8,
    crosswindMps: 4.0,
  },
];
