import * as THREE from 'three';
import type { CaliberProfile, WeaponId } from '../../weapons/types';

/**
 * WP-06 — 1:1 SAAMI / CIP Cartridge Cutaway Lab Specifications & Lathe Builder
 * ----------------------------------------------------------------------------
 * Every geometry is constructed in EXACT `1:1` CAD scale (`1 world unit = 1 cm = 10 mm`),
 * standing upright on the datum plane (`y = 0` at headstamp base, `y = oalMm / 10` at tip).
 * When `cutaway === true`, each axisymmetric component is revolved across the rear `-Z`
 * 180° hemisphere (`phiStart = π/2, phiLength = π`) and sealed with flat `z = 0` section
 * end-caps facing `+Z`, revealing:
 *   1. Drawn C26000 brass case wall taper, pressure web, undercut groove & Boxer flash hole
 *   2. Nickel-plated Boxer primer cup
 *   3. Brass Boxer anvil + lead-styphnate priming pellet
 *   4. Granular smokeless propellant charge column (scaled to exact SAAMI fill ratio)
 *   5. Gilding-metal / bimetal projectile jacket
 *   6. Internal dual-core hardened steel penetrator cone + lead/aluminum rear slug
 */

export type MetallicCaliberProfile =
  | '9mm_para'
  | '45_acp'
  | '473_caseless'
  | '357_magnum'
  | '57_28'
  | '50_ae'
  | '9x39_subsonic'
  | '762_m43'
  | '545_m74'
  | '556_nato'
  | '12_gauge'
  | '762_nato'
  | '30_30_win'
  | '792_mauser'
  | '30_06'
  | '338_lapua'
  | '50_bmg';

export type TankOrdnanceCaliberProfile =
  | '30x173_gau8'
  | '88mm_pzgr39'
  | '120mm_apfsds'
  | '125mm_apfsds';

export type ArcheryCaliberProfile = 'arrow_400gr' | 'bolt_400gr';

export const CARTRIDGE_LAB_ORDER: readonly MetallicCaliberProfile[] = [
  '9mm_para',
  '45_acp',
  '473_caseless',
  '357_magnum',
  '57_28',
  '50_ae',
  '9x39_subsonic',
  '762_m43',
  '545_m74',
  '556_nato',
  '12_gauge',
  '762_nato',
  '30_30_win',
  '792_mauser',
  '30_06',
  '338_lapua',
  '50_bmg',
];

/** Separate 1:1 Heavy Armor & Aero Ordnance rack order (keeps 17-caliber small-arms rack crisp). */
export const TANK_ORDNANCE_ORDER: readonly TankOrdnanceCaliberProfile[] = [
  '30x173_gau8',
  '88mm_pzgr39',
  '120mm_apfsds',
  '125mm_apfsds',
];

export function isTankOrdnanceProfile(
  val: string | null | undefined
): val is TankOrdnanceCaliberProfile {
  return (
    val === '30x173_gau8' ||
    val === '88mm_pzgr39' ||
    val === '120mm_apfsds' ||
    val === '125mm_apfsds'
  );
}

export function isCaliberProfile(
  val: string | null | undefined
): val is MetallicCaliberProfile {
  return (
    typeof val === 'string' &&
    (CARTRIDGE_LAB_ORDER as readonly string[]).includes(val)
  );
}

export function isArcheryCaliberProfile(
  val: string | null | undefined
): val is ArcheryCaliberProfile {
  return val === 'arrow_400gr' || val === 'bolt_400gr';
}

export type ProjectileCoreKind =
  | 'fmj_lead'
  | 'caseless_telescoped'
  | 'ap_steel_alu'
  | 'jsp_soft_point'
  | 'jhp_cavity'
  | 'subsonic_tungsten_ap'
  | 'buckshot_wad_column'
  | 'steel_core_lead_shirt'
  | 'dual_core_penetrator'
  | 'fmj_spitzer'
  | 'otm_scenar'
  | 'm33_heavy_steel'
  | 'apfsds_sabot_dart'
  | 'apcbc_he_shell';

export interface CartridgeLabSpec {
  caliber: CaliberProfile;
  code: string;
  standard: 'SAAMI' | 'CIP' | 'NATO STANAG' | 'PLA GJB';
  nameZh: string;
  nameEn: string;
  loadSubtitleZh: string;
  loadSubtitleEn: string;
  representativeWeapons: readonly WeaponId[];
  primaryWeaponId: WeaponId;
  /** World-space X slot in the 1:1 side-by-side lineup (cm) */
  lineupXCm: number;

  // --- Exact SAAMI / CIP 1:1 Dimensions (mm) ---
  caseLengthMm: number;
  oalMm: number;
  bulletDiameterMm: number;
  neckDiameterMm: number;
  shoulderDiameterMm: number | null;
  baseDiameterMm: number;
  rimDiameterMm: number;
  rimThicknessMm: number;

  // --- Quantitative Internal Ballistics & Charge Data ---
  caseCapacityMl: number;
  propellantMassG: number;
  propellantFillRatio: number;
  propellantTypeZh: string;
  propellantTypeEn: string;
  primerTypeZh: string;
  primerTypeEn: string;
  projectileMassG: number;
  projectileGrain: number;
  coreKind: ProjectileCoreKind;
  coreAnatomyZh: string;
  coreAnatomyEn: string;
  peakPressureMPa: number;
  muzzleVelocityMps: number;
  muzzleEnergyJ: number;

  // --- Curatorial Engineering Notes ---
  highlightZh: string;
  highlightEn: string;

  // --- Metallurgy Tint Palette ---
  caseColor: string;
  jacketColor: string;
  penetratorColor: string;
  coreSlugColor: string;
  propellantColor: string;
}

const METALLIC_CARTRIDGE_LAB_SPECS: Readonly<
  Record<MetallicCaliberProfile, CartridgeLabSpec>
> = {
  '9mm_para': {
    caliber: '9mm_para',
    code: '9×19mm',
    standard: 'NATO STANAG',
    nameZh: '9×19mm 帕拉贝鲁姆手枪弹',
    nameEn: '9×19mm Parabellum (NATO M882)',
    loadSubtitleZh: '124 格令全被甲圆头铅芯弹（FMJ-RN）',
    loadSubtitleEn: '124 gr Full Metal Jacket Round-Nose',
    representativeWeapons: ['g17', 'mp5', 'p320', 'p08'],
    primaryWeaponId: 'g17',
    lineupXCm: -20.8,
    caseLengthMm: 19.15,
    oalMm: 29.69,
    bulletDiameterMm: 9.01,
    neckDiameterMm: 9.65,
    shoulderDiameterMm: null,
    baseDiameterMm: 9.93,
    rimDiameterMm: 9.96,
    rimThicknessMm: 1.27,
    caseCapacityMl: 0.86,
    propellantMassG: 0.38,
    propellantFillRatio: 0.78,
    propellantTypeZh: '双基扁球状速燃发射药',
    propellantTypeEn: 'Fast Double-Base Flattened Ball Powder',
    primerTypeZh: 'Boxer 小型手枪底火 + 三脚黄铜砧座',
    primerTypeEn: 'Small Pistol Boxer Primer + 3-Leg Brass Anvil',
    projectileMassG: 8.04,
    projectileGrain: 124,
    coreKind: 'fmj_lead',
    coreAnatomyZh: '黄铜覆铜被甲 + 冷镦铅锑合金实心弹芯',
    coreAnatomyEn: 'Gilding-Metal Jacket + Swaged Antimonial Lead Core',
    peakPressureMPa: 252,
    muzzleVelocityMps: 365,
    muzzleEnergyJ: 535,
    highlightZh:
      '格奥尔格·卢格 1901 年定型的微锥无底缘弹壳（底径 9.93mm → 口径 9.65mm），兼具高双排弹匣容量与极佳抽壳可靠性。',
    highlightEn:
      'Georg Luger’s 1901 tapered rimless straight-wall case (9.93mm web → 9.65mm mouth) balances high double-stack capacity with reliable extraction.',
    caseColor: '#e5b318',
    jacketColor: '#c2511a',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#475569',
    propellantColor: '#27272a',
  },

  '45_acp': {
    caliber: '45_acp',
    code: '.45 ACP',
    standard: 'SAAMI',
    nameZh: '.45 ACP 勃朗宁大口径自动手枪弹',
    nameEn: '.45 ACP (11.43×23mm M1911 Ball)',
    loadSubtitleZh: '230 格令全金属被甲圆头重铅芯弹（FMJ-RN）',
    loadSubtitleEn: '230 gr Full Metal Jacket Round-Nose (FMJ-RN)',
    representativeWeapons: ['m1911', 'thompson', 'vector'],
    primaryWeaponId: 'm1911',
    lineupXCm: -18.2,
    caseLengthMm: 22.81,
    oalMm: 32.39,
    bulletDiameterMm: 11.48,
    neckDiameterMm: 12.01,
    shoulderDiameterMm: null,
    baseDiameterMm: 12.09,
    rimDiameterMm: 12.19,
    rimThicknessMm: 1.24,
    caseCapacityMl: 1.54,
    propellantMassG: 0.41,
    propellantFillRatio: 0.68,
    propellantTypeZh: '双基速燃球片状手枪发射药（W231 / Bullseye 级）',
    propellantTypeEn: 'Fast Double-Base Flake/Ball Pistol Powder (W231 Class)',
    primerTypeZh: 'Boxer 大型手枪底火 + 三脚黄铜砧座',
    primerTypeEn: 'Large Pistol Boxer Primer + 3-Leg Brass Anvil',
    projectileMassG: 14.9,
    projectileGrain: 230,
    coreKind: 'fmj_lead',
    coreAnatomyZh: '厚壁黄铜覆铜圆头被甲 + 冷镦高密度铅锑合金重弹芯',
    coreAnatomyEn:
      'Thick Gilding-Metal Round-Nose Jacket + Heavy Swaged Antimonial Lead Core',
    peakPressureMPa: 145,
    muzzleVelocityMps: 260,
    muzzleEnergyJ: 504,
    highlightZh:
      '约翰·勃朗宁 1904 年定型的经典亚音速大口径手枪弹（260 m/s 天然低于音速易配消音器）：仅凭 145 MPa 低膛压驱动 14.9 克（230 格令）重弹头释放充沛停止动量，壳口直角台阶精准定位闭锁间隙。',
    highlightEn:
      'John Browning’s 1904 naturally subsonic big-bore cartridge (260 m/s) propels a heavy 230 gr (14.9 g) round-nose slug at a gentle 145 MPa peak pressure with massive stopping momentum.',
    caseColor: '#e2b12b',
    jacketColor: '#c4521c',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#475569',
    propellantColor: '#27272a',
  },

  '57_28': {
    caliber: '57_28',
    code: '5.7×28mm',
    standard: 'NATO STANAG',
    nameZh: '5.7×28mm FN SS190 单兵自卫穿甲弹',
    nameEn: '5.7×28mm FN SS190 PDW Duty AP',
    loadSubtitleZh: '31 格令钢穿甲锥 + 铝芯超高速尖头弹',
    loadSubtitleEn: '31 gr Hardened Steel Penetrator + Aluminum Core',
    representativeWeapons: ['p90'],
    primaryWeaponId: 'p90',
    lineupXCm: -10.4,
    caseLengthMm: 28.9,
    oalMm: 40.5,
    bulletDiameterMm: 5.7,
    neckDiameterMm: 6.35,
    shoulderDiameterMm: 7.9,
    baseDiameterMm: 7.92,
    rimDiameterMm: 7.8,
    rimThicknessMm: 1.14,
    caseCapacityMl: 0.9,
    propellantMassG: 0.45,
    propellantFillRatio: 0.86,
    propellantTypeZh: '高燃速微球状双基无烟药',
    propellantTypeEn: 'High-Density Spherical Double-Base Propellant',
    primerTypeZh: 'Boxer 小型步枪耐压底火（铆固防退）',
    primerTypeEn: 'Crimped Small Rifle High-Pressure Boxer Primer',
    projectileMassG: 2.0,
    projectileGrain: 31,
    coreKind: 'ap_steel_alu',
    coreAnatomyZh: '前段淬火钢穿甲锥 + 后段轻质铝芯复合弹头',
    coreAnatomyEn: 'Front Hardened Steel Penetrator + Rear Aluminum Core',
    peakPressureMPa: 345,
    muzzleVelocityMps: 716,
    muzzleEnergyJ: 513,
    highlightZh:
      '近乎零锥度的 7.92mm 直筒弹体表面覆有干膜聚合物减摩涂层，确保 P90 顶部 50 发水平弹匣经 90° 螺旋坡道顺畅供弹。',
    highlightEn:
      'Polymer dry-film coated cylindrical body enables 50-round horizontal stacking and 90° helical feed rotation while defeating CRISAT armor at 200m.',
    caseColor: '#d9ae38',
    jacketColor: '#b8501c',
    penetratorColor: '#e2e8f0',
    coreSlugColor: '#94a3b8',
    propellantColor: '#1f2937',
  },

  '50_ae': {
    caliber: '50_ae',
    code: '.50 AE',
    standard: 'SAAMI',
    nameZh: '.50 Action Express 马格南手枪弹',
    nameEn: '.50 Action Express Magnum',
    loadSubtitleZh: '300 格令预刻槽受控膨胀空尖弹（JHP）',
    loadSubtitleEn: '300 gr Skived Jacketed Hollow Point (JHP)',
    representativeWeapons: ['deagle'],
    primaryWeaponId: 'deagle',
    lineupXCm: -7.8,
    caseLengthMm: 32.64,
    oalMm: 40.89,
    bulletDiameterMm: 12.7,
    neckDiameterMm: 13.72,
    shoulderDiameterMm: null,
    baseDiameterMm: 13.89,
    rimDiameterMm: 13.06,
    rimThicknessMm: 1.4,
    caseCapacityMl: 2.92,
    propellantMassG: 2.1,
    propellantFillRatio: 0.88,
    propellantTypeZh: '慢燃马格南球状发射药（H110 级）',
    propellantTypeEn: 'Slow Magnum Spherical Powder (H110 Class)',
    primerTypeZh: 'Boxer 大型手枪马格南强装底火',
    primerTypeEn: 'Large Pistol Magnum Boxer Primer',
    projectileMassG: 19.44,
    projectileGrain: 300,
    coreKind: 'jhp_cavity',
    coreAnatomyZh: '厚壁紫铜预刻槽被甲 + 深锥形空尖膨胀腔 + 铅芯',
    coreAnatomyEn: 'Thick Skived Copper Jacket + Deep JHP Cavity + Lead Core',
    peakPressureMPa: 248,
    muzzleVelocityMps: 470,
    muzzleEnergyJ: 2147,
    highlightZh:
      '标志性缩缘底（Rebated Rim：底缘 13.06mm 小于壳体 13.89mm）沿用 .44 Magnum 枪机镜面尺寸，枪口动能高达 9mm 手枪弹的 4 倍！',
    highlightEn:
      'Signature SAAMI rebated rim (13.06mm rim < 13.89mm web) shares a .44 Magnum bolt face while delivering 4× the muzzle energy of 9×19mm.',
    caseColor: '#e6c258',
    jacketColor: '#c4511a',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#475569',
    propellantColor: '#27272a',
  },

  '762_m43': {
    caliber: '762_m43',
    code: '7.62×39mm',
    standard: 'CIP',
    nameZh: '7.62×39mm M43 中间威力步枪弹',
    nameEn: '7.62×39mm M43 (GRAU 57-N-231)',
    loadSubtitleZh: '123 格令双金属被甲低碳钢芯船尾弹（PS）',
    loadSubtitleEn: '123 gr Bimetal Jacket Mild-Steel Core Boat-Tail',
    representativeWeapons: ['ak15'],
    primaryWeaponId: 'ak15',
    lineupXCm: -2.6,
    caseLengthMm: 38.7,
    oalMm: 56.0,
    bulletDiameterMm: 7.92,
    neckDiameterMm: 8.6,
    shoulderDiameterMm: 10.01,
    baseDiameterMm: 11.35,
    rimDiameterMm: 11.35,
    rimThicknessMm: 1.5,
    caseCapacityMl: 2.31,
    propellantMassG: 1.6,
    propellantFillRatio: 0.84,
    propellantTypeZh: '单孔管状硝化棉步枪药（VUfl）',
    propellantTypeEn: 'Single-Perforated Tubular Nitrocellulose (VUfl)',
    primerTypeZh: '重型步枪底火 + 传火孔防水红漆密封',
    primerTypeEn: 'Large Rifle Primer + Lacquer-Sealed Flash Hole',
    projectileMassG: 7.97,
    projectileGrain: 123,
    coreKind: 'steel_core_lead_shirt',
    coreAnatomyZh: '覆铜钢被甲 + 铅衬套 + 圆柱低碳钢主穿甲芯',
    coreAnatomyEn: 'Copper-Washed Steel Jacket + Lead Shirt + Mild-Steel Core',
    peakPressureMPa: 355,
    muzzleVelocityMps: 715,
    muzzleEnergyJ: 2037,
    highlightZh:
      '大锥度壳身（底径 11.35mm → 肩部 10.01mm）造就了 AK 标志性的“香蕉弧形弹匣”，使泥沙严寒恶劣工况下的抽壳阻力降至最低。',
    highlightEn:
      'Pronounced M43 body taper (11.35mm base → 10.01mm shoulder) dictates the iconic curved AK magazine and ensures positive dirty-chamber extraction.',
    caseColor: '#b98d3b',
    jacketColor: '#bd4c19',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#52525b',
    propellantColor: '#1e293b',
  },

  '556_nato': {
    caliber: '556_nato',
    code: '5.56 NATO',
    standard: 'NATO STANAG',
    nameZh: '5.56×45mm 北约制式小口径步枪弹',
    nameEn: '5.56×45mm NATO (STANAG 4172 M855)',
    loadSubtitleZh: '62 格令 SS109 绿尖钢铅复合芯船尾弹',
    loadSubtitleEn: '62 gr M855 / SS109 Dual-Core Penetrator',
    representativeWeapons: ['m4a1', 'scar', 'aug', 'm249'],
    primaryWeaponId: 'm4a1',
    lineupXCm: 2.6,
    caseLengthMm: 44.7,
    oalMm: 57.4,
    bulletDiameterMm: 5.7,
    neckDiameterMm: 6.43,
    shoulderDiameterMm: 9.0,
    baseDiameterMm: 9.58,
    rimDiameterMm: 9.6,
    rimThicknessMm: 1.14,
    caseCapacityMl: 1.85,
    propellantMassG: 1.68,
    propellantFillRatio: 0.9,
    propellantTypeZh: 'WC844 钝化双基球状步枪发射药',
    propellantTypeEn: 'WC844 Deterrent-Coated Ball Propellant',
    primerTypeZh: '北约 #41 厚杯步枪底火（防浮动击针惯性走火）',
    primerTypeEn: 'Mil-Spec #41 Thick-Cup Boxer Primer (Slamfire Resistant)',
    projectileMassG: 4.02,
    projectileGrain: 62,
    coreKind: 'dual_core_penetrator',
    coreAnatomyZh: '黄铜被甲 + 前段 SAE 1095 淬火钢穿甲锥 + 后段铅锑芯',
    coreAnatomyEn: 'Gilding Jacket + Front SAE 1095 Steel Tip + Rear Lead Slug',
    peakPressureMPa: 430,
    muzzleVelocityMps: 910,
    muzzleEnergyJ: 1664,
    highlightZh:
      '全馆最高峰值膛压（430 MPa EPVAT），以 4 克轻量化弹头飙出 910 m/s 近三倍音速，前钢后铅双芯兼顾中远距钢盔侵彻与高着速翻滚效应。',
    highlightEn:
      'Highest chamber pressure in the collection (430 MPa), propelling a 62gr dual-core projectile to Mach 2.7 with hardened steel barrier penetration.',
    caseColor: '#daa724',
    jacketColor: '#c04e18',
    penetratorColor: '#e2e8f0',
    coreSlugColor: '#475569',
    propellantColor: '#27272a',
  },

  '338_lapua': {
    caliber: '338_lapua',
    code: '.338 LM',
    standard: 'CIP',
    nameZh: '.338 拉普阿马格南超远程狙击弹',
    nameEn: '.338 Lapua Magnum (8.6×70mm)',
    loadSubtitleZh: '250 格令 Lapua Scenar 空尖船尾比赛狙击弹（OTM）',
    loadSubtitleEn: '250 gr Lapua Scenar Open-Tip Match VLD Boat-Tail',
    representativeWeapons: ['awm'],
    primaryWeaponId: 'awm',
    lineupXCm: 18.2,
    caseLengthMm: 69.2,
    oalMm: 93.5,
    bulletDiameterMm: 8.59,
    neckDiameterMm: 9.8,
    shoulderDiameterMm: 13.82,
    baseDiameterMm: 14.91,
    rimDiameterMm: 14.93,
    rimThicknessMm: 1.52,
    caseCapacityMl: 7.4,
    propellantMassG: 5.95,
    propellantFillRatio: 0.91,
    propellantTypeZh: 'Vihtavuori N560 高能缓燃单孔管状双基药',
    propellantTypeEn: 'Vihtavuori N560 High-Energy Extruded Tubular Powder',
    primerTypeZh: 'Boxer 大型步枪马格南高能点火底火',
    primerTypeEn: 'Large Rifle Magnum Boxer Primer',
    projectileMassG: 16.2,
    projectileGrain: 250,
    coreKind: 'otm_scenar',
    coreAnatomyZh: '同心拉制紫铜被甲 + 弹尖微空腔（Meplat Air Pocket）+ 高密度铅芯',
    coreAnatomyEn: 'Concentric Copper Jacket + Forward OTM Air Pocket + Lead Core',
    peakPressureMPa: 420,
    muzzleVelocityMps: 905,
    muzzleEnergyJ: 6634,
    highlightZh:
      '专为 1,500 米以上极远距狙击正向研发的无凸缘加厚底壁弹壳（可承受 420 MPa 膛压），极低阻船尾弹头在 1,300 米外仍保持超音速稳定飞行。',
    highlightEn:
      'Purpose-engineered beltless thick-web magnum case handles 420 MPa, keeping VLD boat-tail projectiles supersonic past 1,300 meters.',
    caseColor: '#deb23d',
    jacketColor: '#b85314',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#475569',
    propellantColor: '#1f2937',
  },

  '50_bmg': {
    caliber: '50_bmg',
    code: '.50 BMG',
    standard: 'SAAMI',
    nameZh: '12.7×99mm NATO（.50 BMG 重机枪/反器材弹）',
    nameEn: '.50 BMG / 12.7×99mm NATO (M33 Ball)',
    loadSubtitleZh: '660 格令 M33 淬火低碳钢芯反器材普通弹',
    loadSubtitleEn: '660 gr M33 Hardened Mild-Steel Core Boat-Tail',
    representativeWeapons: ['m82a1'],
    primaryWeaponId: 'm82a1',
    lineupXCm: 20.8,
    caseLengthMm: 99.31,
    oalMm: 138.43,
    bulletDiameterMm: 12.98,
    neckDiameterMm: 14.22,
    shoulderDiameterMm: 18.82,
    baseDiameterMm: 20.42,
    rimDiameterMm: 20.42,
    rimThicknessMm: 2.11,
    caseCapacityMl: 18.9,
    propellantMassG: 15.2,
    propellantFillRatio: 0.92,
    propellantTypeZh: 'WC860 重武器缓燃大颗粒球状发射药（15.2克）',
    propellantTypeEn: 'WC860 Heavy Slow-Burning Ball Propellant (235 gr)',
    primerTypeZh: '美军规 #35 特大号重机枪底火（三点冲铆固定）',
    primerTypeEn: 'US Arsenal #35 .50-Caliber Boxer Primer (3-Point Staked)',
    projectileMassG: 42.77,
    projectileGrain: 660,
    coreKind: 'm33_heavy_steel',
    coreAnatomyZh: '重型黄铜被甲 + 弹尖填充平衡剂 + 贯通式硬化钢主芯',
    coreAnatomyEn: 'Heavy Gilding Jacket + Point Filler + Full-Length Steel Core',
    peakPressureMPa: 379,
    muzzleVelocityMps: 890,
    muzzleEnergyJ: 16940,
    highlightZh:
      '全长 138.4mm、装药容积高达 18.9mL（相当于 9mm 手枪弹的 22 倍），枪口动能近 17,000–18,000 焦耳，足以击穿轻装甲、雷达舱与钢筋混凝土掩体。',
    highlightEn:
      'Standing 138.4mm tall with 22× the powder volume of 9×19mm, .50 BMG unleashes ~17,000–18,000 J of anti-materiel kinetic energy.',
    caseColor: '#d2a334',
    jacketColor: '#bb4414',
    penetratorColor: '#e2e8f0',
    coreSlugColor: '#64748b',
    propellantColor: '#18181b',
  },

  '357_magnum': {
    caliber: '357_magnum',
    code: '.357 Magnum',
    standard: 'SAAMI',
    nameZh: '.357 S&W 马格南凸缘转轮手枪弹',
    nameEn: '.357 S&W Magnum Rimmed Revolver',
    loadSubtitleZh: '158 格令滚花凹槽半被甲平头软尖弹（JSP）',
    loadSubtitleEn: '158 gr Cannelured Jacketed Soft-Point (JSP)',
    representativeWeapons: ['python'],
    primaryWeaponId: 'python',
    lineupXCm: -13.0,
    caseLengthMm: 32.77,
    oalMm: 40.39,
    bulletDiameterMm: 9.07,
    neckDiameterMm: 9.63,
    shoulderDiameterMm: null,
    baseDiameterMm: 9.63,
    rimDiameterMm: 11.18,
    rimThicknessMm: 1.52,
    caseCapacityMl: 1.7,
    propellantMassG: 0.98,
    propellantFillRatio: 0.85,
    propellantTypeZh: '双基缓燃手枪马格南片球药（Alliant 2400 级）',
    propellantTypeEn: 'Slow Double-Base Magnum Propellant (2400 / H110)',
    primerTypeZh: 'Boxer 小型手枪马格南底火',
    primerTypeEn: 'Small Pistol Magnum Boxer Primer',
    projectileMassG: 10.25,
    projectileGrain: 158,
    coreKind: 'jsp_soft_point',
    coreAnatomyZh: '滚花锁口紫铜半被甲 + 裸露平头纯铅软尖膨胀弹芯',
    coreAnatomyEn: 'Cannelured Copper Semi-Jacket + Exposed Flat-Meplat Soft Lead Core',
    peakPressureMPa: 241,
    muzzleVelocityMps: 385,
    muzzleEnergyJ: 760,
    highlightZh:
      '1935 年埃尔默·基思与史密斯-韦森在 .38 Special 基础上加长壳体 3.43mm（防止误装老式低压转轮枪）开创“马格南时代”，外凸实心底缘精准定位弹巢间隙并由星形退壳器同步顶出。',
    highlightEn:
      'Lengthened 3.43mm over .38 Special to prevent chambering in vintage frames, its 11.18mm solid rim headspaces on the cylinder face for positive star extraction.',
    caseColor: '#e6b938',
    jacketColor: '#c2511a',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#64748b',
    propellantColor: '#27272a',
  },

  '12_gauge': {
    caliber: '12_gauge',
    code: '12 Gauge',
    standard: 'SAAMI',
    nameZh: '12 号 70mm（2¾"）军用 00 号鹿弹',
    nameEn: '12 Gauge 2.75" (70mm) M162 00 Buckshot',
    loadSubtitleZh: '9 粒 Ø8.38mm 硬化锑铅鹿弹丸 + 花瓣塑料弹托',
    loadSubtitleEn: '9-Pellet .33" Antimonial Lead 00 Buckshot + Shot-Cup Wad',
    representativeWeapons: ['benellim4', 'rem870'],
    primaryWeaponId: 'benellim4',
    lineupXCm: 5.2,
    caseLengthMm: 58.5,
    oalMm: 69.8,
    bulletDiameterMm: 18.53,
    neckDiameterMm: 20.1,
    shoulderDiameterMm: null,
    baseDiameterMm: 20.45,
    rimDiameterMm: 22.48,
    rimThicknessMm: 1.75,
    caseCapacityMl: 16.4,
    propellantMassG: 1.95,
    propellantFillRatio: 0.34,
    propellantTypeZh: '多孔速燃双基片状霰弹无烟药',
    propellantTypeEn: 'Fast-Burning Double-Base Flake Shotshell Powder',
    primerTypeZh: '209 型带砧座封闭杯霰弹底火',
    primerTypeEn: '209 Battery-Cup Shotshell Primer + Integral Anvil',
    projectileMassG: 30.2,
    projectileGrain: 466,
    coreKind: 'buckshot_wad_column',
    coreAnatomyZh: '高铜底绯红塑料弹壳 + 缓冲闭气花瓣弹托 + 3×3 叠装 9 粒 00 号铅丸',
    coreAnatomyEn: 'High-Brass Crimson Polymer Hull + Cushioned Petal Wad + 3×3 Stacked 00 Buckshot',
    peakPressureMPa: 79,
    muzzleVelocityMps: 404,
    muzzleEnergyJ: 2465,
    highlightZh:
      '尽管峰值膛压仅 79 MPa，但凭借 Ø18.53mm 超大滑膛截面积一次性同步推出 9 粒 8.38mm 锑铅圆球（总重 30.2 克），近战单发同时命中多点并释放 2,465 焦耳压制动能！',
    highlightEn:
      'Operating at just 79 MPa across an 18.53mm bore, a cushioned polyethylene petal wad launches nine 8.38mm hardened lead pellets simultaneously for 2,465 J.',
    caseColor: '#b91c1c',
    jacketColor: '#e2e8f0',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#64748b',
    propellantColor: '#1f2937',
  },

  '30_06': {
    caliber: '30_06',
    code: '.30-06',
    standard: 'SAAMI',
    nameZh: '.30-06 春田全威力军用步枪弹（M2 Ball）',
    nameEn: '.30-06 Springfield (7.62×63mm M2 Ball)',
    loadSubtitleZh: '150 格令平底黄铜被甲尖头铅芯普通弹',
    loadSubtitleEn: '150 gr M2 Ball Flat-Base Gilding-Metal Spitzer',
    representativeWeapons: ['garand'],
    primaryWeaponId: 'garand',
    lineupXCm: 15.6,
    caseLengthMm: 63.35,
    oalMm: 84.84,
    bulletDiameterMm: 7.82,
    neckDiameterMm: 8.63,
    shoulderDiameterMm: 11.2,
    baseDiameterMm: 11.94,
    rimDiameterMm: 12.01,
    rimThicknessMm: 1.24,
    caseCapacityMl: 4.42,
    propellantMassG: 3.24,
    propellantFillRatio: 0.86,
    propellantTypeZh: 'IMR 4895 单基管状挤出硝化棉步枪药（50 格令）',
    propellantTypeEn: 'IMR 4895 Single-Base Extruded Tubular Propellant (50 gr)',
    primerTypeZh: '美军规 #34 大型步枪军用耐压底火',
    primerTypeEn: 'US Arsenal #34 Large Rifle Boxer Primer',
    projectileMassG: 9.73,
    projectileGrain: 150,
    coreKind: 'fmj_spitzer',
    coreAnatomyZh: '95/5 黄铜平底尖头被甲 + 滚花锁槽 + 铅锑合金实心弹芯',
    coreAnatomyEn: '95/5 Gilding-Metal Flat-Base Spitzer Jacket + Antimonial Lead Core',
    peakPressureMPa: 345,
    muzzleVelocityMps: 853,
    muzzleEnergyJ: 3540,
    highlightZh:
      '1906 年定型的美国两代世界大战传奇主力步枪弹：修长 63.35mm 瓶形壳体搭配专门调配导气孔膛压曲线的 IMR 4895 发射药，完美匹配 M1 加兰德 24 英寸枪口长行程拉机柄机构。',
    highlightEn:
      'Adopted in 1906, its 63.35mm case loaded with IMR 4895 matches the M1 Garand’s port-pressure envelope while delivering 3,540 J at 853 m/s.',
    caseColor: '#dca92c',
    jacketColor: '#bd4c19',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#475569',
    propellantColor: '#1e293b',
  },

  '30_30_win': {
    caliber: '30_30_win',
    code: '.30-30 Win',
    standard: 'SAAMI',
    nameZh: '.30-30 温彻斯特无烟步枪弹（170 gr 平头）',
    nameEn: '.30-30 Winchester (.30 WCF 170 gr Flat-Nose)',
    loadSubtitleZh: '170 格令管仓防误触软尖平头弹（JSP-FN）',
    loadSubtitleEn: '170 gr Tubular-Safe Jacketed Soft-Point Flat-Nose',
    representativeWeapons: ['winchester1894'],
    primaryWeaponId: 'winchester1894',
    lineupXCm: 10.4,
    caseLengthMm: 51.79,
    oalMm: 64.77,
    bulletDiameterMm: 7.82,
    neckDiameterMm: 8.46,
    shoulderDiameterMm: 10.19,
    baseDiameterMm: 10.72,
    rimDiameterMm: 12.85,
    rimThicknessMm: 1.6,
    caseCapacityMl: 2.86,
    propellantMassG: 2.1,
    propellantFillRatio: 0.84,
    propellantTypeZh: 'IMR 3031 单基管状无烟步枪药（32.4 gr）',
    propellantTypeEn: 'IMR 3031 Extruded Single-Base Smokeless Propellant (32.4 gr)',
    primerTypeZh: 'Winchester WLR 大号步枪底火',
    primerTypeEn: 'Winchester WLR Large Rifle Boxer Primer',
    projectileMassG: 11.02,
    projectileGrain: 170,
    coreKind: 'jsp_soft_point',
    coreAnatomyZh: '凸缘大底缘拉延黄铜壳 + 半被甲平头外露纯铅膨胀软芯',
    coreAnatomyEn: 'Rimmed Bottleneck Brass Case + Semi-Jacketed Flat-Nose Lead Soft-Point Core',
    peakPressureMPa: 290,
    muzzleVelocityMps: 670,
    muzzleEnergyJ: 2473,
    highlightZh:
      '1895 年问世的全球首款民间无烟火药狩猎步枪弹：显著外凸的 12.85mm 实心底缘专门配合杠杆步枪拔弹，平头软尖专为防止在全长下挂管式弹仓内前后碰撞误击前发底火而演化！',
    highlightEn:
      'America’s first civilian smokeless hunting cartridge (1895): a 12.85mm solid rim aids positive lever extraction while the flat soft-point nose prevents magazine-tube primer detonation.',
    caseColor: '#dfae2b',
    jacketColor: '#bd4c19',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#52525b',
    propellantColor: '#1e293b',
  },

  '473_caseless': {
    caliber: '473_caseless',
    code: '4.73×33mm',
    standard: 'CIP',
    nameZh: '4.73×33mm DM11 高温耐燃无壳步枪弹',
    nameEn: '4.73×33mm DM11 Caseless Telescoped (HITP)',
    loadSubtitleZh: '50 格令铜被甲细长船尾弹 + 8×8mm 方形可燃硝胺药块',
    loadSubtitleEn: '50 gr Telescoped Copper Spitzer + 8×8mm Molded HITP Block',
    representativeWeapons: ['g11'],
    primaryWeaponId: 'g11',
    lineupXCm: -15.6,
    caseLengthMm: 31.8,
    oalMm: 33.0,
    bulletDiameterMm: 4.73,
    neckDiameterMm: 8.0,
    shoulderDiameterMm: null,
    baseDiameterMm: 8.0,
    rimDiameterMm: 8.0,
    rimThicknessMm: 1.0,
    caseCapacityMl: 1.62,
    propellantMassG: 1.65,
    propellantFillRatio: 0.96,
    propellantTypeZh: 'Dynamit Nobel HITP 高自燃点模压奥克托今硝胺固体药块',
    propellantTypeEn: 'Dynamit Nobel HITP Molded Nitramine Combustible Propellant Block',
    primerTypeZh: '全可燃硝化纤维击发底火片 + 中央导火药柱（零残壳）',
    primerTypeEn: 'Combustible Nitrocellulose Primer Wafer + Central Booster Pellet',
    projectileMassG: 3.25,
    projectileGrain: 50,
    coreKind: 'caseless_telescoped',
    coreAnatomyZh: '零黄铜弹壳：8×8mm 倒角方形模压发射药块完整埋装 26.5mm 细长 4.73mm 铜被甲弹头与可燃聚合物端帽',
    coreAnatomyEn: 'Zero Brass Case: 8×8mm Chamfered HITP Block Telescoping a 26.5mm 4.73mm Copper Spitzer & Combustible Cap',
    peakPressureMPa: 360,
    muzzleVelocityMps: 930,
    muzzleEnergyJ: 1405,
    highlightZh:
      '人类轻武器史上唯一量产定型的军用无壳弹：将 50 格令超细长 4.73mm 弹头完全埋入 8×8mm 方形固体发射药块，击发瞬间药块 100% 气化燃尽，彻底消除抽壳与抛壳机械周期！',
    highlightEn:
      'History’s pinnacle caseless rifle cartridge: a 50 gr 4.73mm spitzer telescoped completely inside a square 8×8mm solid HITP propellant block that burns cleanly with zero brass extraction.',
    caseColor: '#a68252',
    jacketColor: '#c95c22',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#475569',
    propellantColor: '#8c6a3e',
  },

  '9x39_subsonic': {
    caliber: '9x39_subsonic',
    code: '9×39mm',
    standard: 'CIP',
    nameZh: '9×39mm SP-6 俄制亚音速穿甲狙击弹',
    nameEn: '9×39mm SP-6 Subsonic Armor-Piercing',
    loadSubtitleZh: '250 格令硬化钢/钨合金穿甲芯亚音速重弹（290 m/s）',
    loadSubtitleEn: '250 gr Hardened Steel/Tungsten-Core Subsonic AP (290 m/s)',
    representativeWeapons: ['vss'],
    primaryWeaponId: 'vss',
    lineupXCm: -5.2,
    caseLengthMm: 39.0,
    oalMm: 56.0,
    bulletDiameterMm: 9.25,
    neckDiameterMm: 9.95,
    shoulderDiameterMm: 10.6,
    baseDiameterMm: 11.35,
    rimDiameterMm: 11.35,
    rimThicknessMm: 1.5,
    caseCapacityMl: 2.38,
    propellantMassG: 0.72,
    propellantFillRatio: 0.56,
    propellantTypeZh: '速燃微声双基单孔步枪药（亚音速低燃压配方）',
    propellantTypeEn: 'Fast-Burning Subsonic Double-Base Tubular Propellant',
    primerTypeZh: '俄制伯丹（Berdan）重型漆封军用步枪底火',
    primerTypeEn: 'Soviet Lacquer-Sealed Heavy Military Rifle Primer',
    projectileMassG: 16.2,
    projectileGrain: 250,
    coreKind: 'subsonic_tungsten_ap',
    coreAnatomyZh: '黑尖裸露硬化穿甲钢芯 + 双金属覆铜被甲 + 软铅缓冲衬套（总重 16.2 克）',
    coreAnatomyEn: 'Exposed Black-Tip Hardened AP Core + Bimetal Jacket + Lead Cushion Sleeve (16.2 g)',
    peakPressureMPa: 280,
    muzzleVelocityMps: 290,
    muzzleEnergyJ: 681,
    highlightZh:
      '基于 7.62×39mm 弹壳扩口改制的特种微声穿甲弹：将初速严控在 290 m/s 消除音爆，借 16.2 克超大截面密度硬钢芯在 200 米击穿 8mm 均质钢板与 III 级防弹衣！',
    highlightEn:
      'Necked-up 7.62×39mm case launching a massive 250 gr (16.2 g) hardened-core projectile at 290 m/s — completely eliminating ballistic crack while penetrating 8mm steel plate at 200m.',
    caseColor: '#5c6654',
    jacketColor: '#b94e1b',
    penetratorColor: '#1e293b',
    coreSlugColor: '#64748b',
    propellantColor: '#1f2937',
  },

  '545_m74': {
    caliber: '545_m74',
    code: '5.45×39mm',
    standard: 'CIP',
    nameZh: '5.45×39mm 7N6 苏联小口径步枪弹',
    nameEn: '5.45×39mm 7N6 (M74 Soviet Service)',
    loadSubtitleZh: '53 格令尖头空腔低碳钢芯长船尾弹（7N6）',
    loadSubtitleEn: '53 gr Hollow-Nose Air-Cavity Steel-Core Boat-Tail (7N6)',
    representativeWeapons: ['an94'],
    primaryWeaponId: 'an94',
    lineupXCm: 0.0,
    caseLengthMm: 39.82,
    oalMm: 57.0,
    bulletDiameterMm: 5.62,
    neckDiameterMm: 6.29,
    shoulderDiameterMm: 9.25,
    baseDiameterMm: 10.0,
    rimDiameterMm: 10.0,
    rimThicknessMm: 1.45,
    caseCapacityMl: 1.75,
    propellantMassG: 1.45,
    propellantFillRatio: 0.85,
    propellantTypeZh: 'SSNF 钝化球状小口径步枪无烟药',
    propellantTypeEn: 'SSNF Deterrent-Coated Spherical Rifle Propellant',
    primerTypeZh: '俄制漆封防水步枪底火 + 壳颈红漆防潮密封',
    primerTypeEn: 'Soviet Lacquer-Sealed Military Rifle Primer',
    projectileMassG: 3.43,
    projectileGrain: 53,
    coreKind: 'steel_core_lead_shirt',
    coreAnatomyZh: '覆铜钢长船尾被甲 + 弹尖空腔失稳室 + 圆柱钢芯与铅衬套',
    coreAnatomyEn: 'Bimetal Boat-Tail Jacket + Nose Air Cavity + Cylindrical Steel Core & Lead Plug',
    peakPressureMPa: 294,
    muzzleVelocityMps: 900,
    muzzleEnergyJ: 1389,
    highlightZh:
      '以极低后坐冲量与 5.62mm 高长径比长船尾弹头闻名：弹尖内置空腔使重心后移，命中软目标迅速失稳翻滚，并令 AN-94 得以实现 1,800 RPM 双发超高速同孔连射。',
    highlightEn:
      'Low-impulse high-aspect boat-tail cartridge featuring a hollow nose air-cavity for rapid terminal yaw and minimal recoil — the ballistic heart of the AN-94 1,800 RPM hyperburst.',
    caseColor: '#69725e',
    jacketColor: '#bc4d19',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#52525b',
    propellantColor: '#1e293b',
  },

  '762_nato': {
    caliber: '762_nato',
    code: '7.62 NATO',
    standard: 'NATO STANAG',
    nameZh: '7.62×51mm NATO 北约全威力通用机枪弹（M80）',
    nameEn: '7.62×51mm NATO (STANAG 2310 M80 Ball)',
    loadSubtitleZh: '147 格令 M80 铜被甲铅芯船尾弹（M13 弹链供弹）',
    loadSubtitleEn: '147 gr M80 Gilding-Metal FMJ Boat-Tail (M13 Linked)',
    representativeWeapons: ['m134'],
    primaryWeaponId: 'm134',
    lineupXCm: 7.8,
    caseLengthMm: 51.18,
    oalMm: 71.12,
    bulletDiameterMm: 7.82,
    neckDiameterMm: 8.71,
    shoulderDiameterMm: 11.53,
    baseDiameterMm: 11.94,
    rimDiameterMm: 12.01,
    rimThicknessMm: 1.37,
    caseCapacityMl: 3.5,
    propellantMassG: 2.92,
    propellantFillRatio: 0.88,
    propellantTypeZh: 'WC846 双基钝化球状机枪发射药（45 格令）',
    propellantTypeEn: 'WC846 Double-Base Deterrent Ball Propellant (45 gr)',
    primerTypeZh: '北约 #34 厚杯军用耐压底火（防高速机匣惯性击发）',
    primerTypeEn: 'NATO #34 Thick-Cup Mil-Spec Large Rifle Primer',
    projectileMassG: 9.5,
    projectileGrain: 147,
    coreKind: 'fmj_spitzer',
    coreAnatomyZh: '90/10 铜锌合金船尾被甲 + 冷镦铅锑合金实心重弹芯',
    coreAnatomyEn: '90/10 Gilding-Metal Boat-Tail Jacket + Swaged Antimonial Lead Core',
    peakPressureMPa: 415,
    muzzleVelocityMps: 853,
    muzzleEnergyJ: 3456,
    highlightZh:
      '将 .30-06 春田 3,500 J 级威力浓缩至缩短 12.2mm 的紧凑瓶形弹壳（415 MPa 膛压），在 M134D 六管加特林上以 50 发/秒（3,000 RPM）经 M13 可散弹链源源不断倾泻！',
    highlightEn:
      'Packs .30-06 class 3,456 J ballistics into a 12.2mm shorter 415 MPa NATO case — fed via M13 disintegrating links into the M134D Minigun at 50 rounds per second.',
    caseColor: '#dfae2b',
    jacketColor: '#c04f19',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#475569',
    propellantColor: '#1e293b',
  },

  '792_mauser': {
    caliber: '792_mauser',
    code: '7.92×57mm',
    standard: 'CIP',
    nameZh: '7.92×57mm 毛瑟重尖船尾步枪弹（8mm Mauser s.S.）',
    nameEn: '7.92×57mm Mauser (8mm IS · s.S. Patrone)',
    loadSubtitleZh: '198 格令重尖船尾全被甲铅芯弹（s.S. FMJ-BT）',
    loadSubtitleEn: '198 gr schweres Spitzgeschoss Boat-Tail (FMJ-BT)',
    representativeWeapons: ['mg42', 'k98k'],
    primaryWeaponId: 'mg42',
    lineupXCm: 13.0,
    caseLengthMm: 57.0,
    oalMm: 82.0,
    bulletDiameterMm: 8.22,
    neckDiameterMm: 9.08,
    shoulderDiameterMm: 10.95,
    baseDiameterMm: 11.95,
    rimDiameterMm: 11.95,
    rimThicknessMm: 1.3,
    caseCapacityMl: 4.09,
    propellantMassG: 3.15,
    propellantFillRatio: 0.86,
    propellantTypeZh: 'Nz.R.P. 硝化纤维片管状单基步枪发射药',
    propellantTypeEn: 'Nz.R.P. Single-Base Nitrocellulose Flake/Tubular Powder',
    primerTypeZh: 'Berdan 88 大型步枪防漏耐压底火（绿/黑防水环漆）',
    primerTypeEn: 'Berdan 88 Large Rifle High-Pressure Primer (Lacquer Sealed)',
    projectileMassG: 12.8,
    projectileGrain: 198,
    coreKind: 'fmj_spitzer',
    coreAnatomyZh: '覆铜钢/黄铜流线型船尾被甲 + 高密度铅锑合金重弹芯',
    coreAnatomyEn:
      'Gilding-Metal Streamlined Boat-Tail Jacket + Heavy Antimonial Lead Core',
    peakPressureMPa: 390,
    muzzleVelocityMps: 755,
    muzzleEnergyJ: 3648,
    highlightZh:
      '1888 年定型、1905 年升级 S 尖头弹并最终演进为 198 格令重尖船尾（s.S.）弹的欧洲步枪弹祖师：11.95 mm 无底缘底径成为后世 .30-06 与 7.62 NATO 共同几何母本，在 MG 42 与 K98k 上倾泻 3,648 J 全威力动能！',
    highlightEn:
      'Pioneering 1888 rimless military bottleneck case (11.95 mm head — ancestor to .30-06 and 7.62 NATO): its streamlined 198 gr s.S. boat-tail delivers 3,648 J across MG 42 & K98k.',
    caseColor: '#e2b22a',
    jacketColor: '#c3541e',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#475569',
    propellantColor: '#1f2937',
  },
};

export const TANK_ORDNANCE_LAB_SPECS: Readonly<
  Record<TankOrdnanceCaliberProfile, CartridgeLabSpec>
> = {
  '30x173_gau8': {
    caliber: '30x173_gau8',
    code: '30×173mm GAU-8',
    standard: 'NATO STANAG',
    nameZh: '30×173mm GAU-8/A PGU-14/B 航空穿甲燃烧弹 (API)',
    nameEn: '30×173mm GAU-8/A PGU-14/B Armor-Piercing Incendiary (API)',
    loadSubtitleZh:
      '395g 铝壳风帽 + 300g 贫铀/钨合金高密度穿甲芯 + 152g 球状双基装药',
    loadSubtitleEn:
      '395g Aluminum-Cased Shell + 300g Depleted-Uranium/Tungsten Core + 152g Propellant',
    representativeWeapons: ['gau8'],
    primaryWeaponId: 'gau8',
    lineupXCm: -36.0,
    caseLengthMm: 173.0,
    oalMm: 290.0,
    bulletDiameterMm: 30.0,
    neckDiameterMm: 33.4,
    shoulderDiameterMm: 41.0,
    baseDiameterMm: 42.6,
    rimDiameterMm: 42.6,
    rimThicknessMm: 3.6,
    caseCapacityMl: 182.0,
    propellantMassG: 152.0,
    propellantFillRatio: 0.89,
    propellantTypeZh: 'WC 870 级双基球状高能航炮发射药（152 g）',
    propellantTypeEn:
      'WC 870 Class Double-Base Ball Autocannon Propellant (152 g)',
    primerTypeZh: 'M52A3B1 重型电击发航空耐压底火',
    primerTypeEn: 'M52A3B1 Heavy Percussion/Electric Aviation Cannon Primer',
    projectileMassG: 395.0,
    projectileGrain: 6096,
    coreKind: 'subsonic_tungsten_ap',
    coreAnatomyZh:
      '轻合金炭黑空气动力风帽 + 绯红燃烧剂环 + Ø16mm 300g 超高密度贫铀/钨合金穿甲芯 + 红铜导带',
    coreAnatomyEn:
      'Lightweight Black Alloy Windshield + Crimson Incendiary Ring + Ø16mm 300g High-Density DU/Tungsten Core + Copper Driving Band',
    peakPressureMPa: 430,
    muzzleVelocityMps: 1010,
    muzzleEnergyJ: 201470,
    highlightZh:
      '单发高 290 mm 堪比玻璃汽水瓶！率先改用拉丝航空铝合金弹壳替代黄铜狂减 30% 死重，在 430 MPa 膛压下将 300g 高密度穿甲芯轰至 1,010 m/s（201 kJ），每秒 65 发撕碎重装甲顶甲！',
    highlightEn:
      'Towering 290 mm tall like a soda bottle: pioneered brushed aerospace aluminum casings to slash weight 30%, driving a dense 300 g DU/tungsten core to 1,010 m/s (201 kJ) at 65 rounds per second.',
    caseColor: '#cfd8e3',
    jacketColor: '#2c313a',
    penetratorColor: '#94a3b8',
    coreSlugColor: '#cf2e2a',
    propellantColor: '#1e293b',
  },
  '88mm_pzgr39': {
    caliber: '88mm_pzgr39',
    code: '88×571mmR',
    standard: 'CIP',
    nameZh: '88×571mmR 虎式主炮被帽穿甲弹 (PzGr. 39)',
    nameEn: '88×571mmR KwK 36 PzGr. 39 APCBC-HE',
    loadSubtitleZh: '10.2 kg 硬化钢被帽风帽穿甲弹 + 2.41 kg 管状发射药 + 黄铜凸缘药筒',
    loadSubtitleEn: '10.2 kg Hardened APCBC-HE Shell + 2.41 kg Diglycol Charge + Rimmed Brass Case',
    representativeWeapons: ['tiger1'],
    primaryWeaponId: 'tiger1',
    lineupXCm: -14.0,
    caseLengthMm: 571.0,
    oalMm: 822.0,
    bulletDiameterMm: 88.0,
    neckDiameterMm: 93.2,
    shoulderDiameterMm: 108.0,
    baseDiameterMm: 112.0,
    rimDiameterMm: 125.0,
    rimThicknessMm: 7.2,
    caseCapacityMl: 4350,
    propellantMassG: 2410,
    propellantFillRatio: 0.78,
    propellantTypeZh: 'Gudol-Röhrenpulver 管状二甘醇双基发射药 (2.41 kg)',
    propellantTypeEn: 'Gudol-Röhrenpulver Tubular Diglycol Propellant (2.41 kg)',
    primerTypeZh: 'C/22 德军电击发底火螺塞',
    primerTypeEn: 'Wehrmacht C/22 Electric Percussion Primer Screw',
    projectileMassG: 10200,
    projectileGrain: 157410,
    coreKind: 'apcbc_he_shell',
    coreAnatomyZh: '空气动力风帽 + 钝头软钢被帽 + 淬火合金钢穿甲体 + 59g 底部延时高爆装药',
    coreAnatomyEn: 'Ballistic Windscreen + Soft Piercing Cap + Hardened Alloy Steel Body + 59g Base-Fuzed HE Filler',
    peakPressureMPa: 320,
    muzzleVelocityMps: 773,
    muzzleEnergyJ: 3047397,
    highlightZh:
      '全长 822 mm、单发重达 16 kg 的二战反装甲霸主：88×571mmR 巨型瓶形黄铜凸缘药筒配电发火底火，赋予 10.2 kg 穿甲弹 3.05 MJ 动能，2,000 m 外仍可贯穿百毫米匀质钢板！',
    highlightEn:
      'Towering 822 mm tall and 16 kg complete: the rimmed 88×571mmR brass case propels a 10.2 kg APCBC-HE shell to 3.05 MJ, defeating heavy armor past 2,000 meters.',
    caseColor: '#d9ac43',
    jacketColor: '#3c4047',
    penetratorColor: '#94a3b8',
    coreSlugColor: '#c9743f',
    propellantColor: '#262930',
  },
  '120mm_apfsds': {
    caliber: '120mm_apfsds',
    code: '120×570mm',
    standard: 'NATO STANAG',
    nameZh: '120×570mm 北约尾翼稳定脱壳穿甲弹 (M829A4 / DM63A1)',
    nameEn: '120×570mm NATO APFSDS-T (M829A4 / DM63A1)',
    loadSubtitleZh: '4.6 kg 贫铀/钨合金长杆穿甲芯 + 轻合金三瓣弹托 + 半可燃药筒',
    loadSubtitleEn: '4.6 kg DU/Tungsten Long-Rod Dart + 3-Petal Sabot + Combustible Case',
    representativeWeapons: ['m1a2', 'leopard2a7'],
    primaryWeaponId: 'leopard2a7',
    lineupXCm: 10.0,
    caseLengthMm: 570.0,
    oalMm: 984.0,
    bulletDiameterMm: 120.0,
    neckDiameterMm: 126.0,
    shoulderDiameterMm: 146.0,
    baseDiameterMm: 152.0,
    rimDiameterMm: 158.0,
    rimThicknessMm: 9.0,
    caseCapacityMl: 9400,
    propellantMassG: 8100,
    propellantFillRatio: 0.88,
    propellantTypeZh: 'SCDB 温度无关表面涂层双基发射药 (8.1 kg · 燃尽式硝化纤维药筒)',
    propellantTypeEn: 'SCDB Temperature-Independent Double-Base Charge (8.1 kg · Combustible Case)',
    primerTypeZh: 'DM12A1 / M129 高能长管电发火底火 (钢制弹底护板)',
    primerTypeEn: 'DM12A1 / M129 Long-Tube Electric Primer in Obturating Steel Stub Base',
    projectileMassG: 4600,
    projectileGrain: 70989,
    coreKind: 'apfsds_sabot_dart',
    coreAnatomyZh: 'Ø25mm 超大长径比贫铀/钨合金穿甲长杆 + 六片十字稳定尾翼 + 碳纤/铝合金鞍形弹托',
    coreAnatomyEn: 'Ø25mm High-L/D DU/Tungsten Monoblock Dart + 6-Fin Tail Stabilizer + Lightweight 3-Petal Sabot',
    peakPressureMPa: 670,
    muzzleVelocityMps: 1710,
    muzzleEnergyJ: 6725430,
    highlightZh:
      '西方三代半主战坦克核心矛头：670 MPa 恐怖膛压将 4.6 kg 次口径长杆弹芯以 5.0 马赫（1,710 m/s · 6.73 MJ）射出，击发后硝化纤维药筒几乎完全燃尽，仅退一枚短金属弹底！',
    highlightEn:
      'NATO’s premier 670 MPa tank spearhead: drives a 4.6 kg sub-caliber dart to Mach 5.0 (1,710 m/s · 6.73 MJ) while burning away its combustible case down to a short steel stub base.',
    caseColor: '#b9935a',
    jacketColor: '#3f4752',
    penetratorColor: '#cbd5e1',
    coreSlugColor: '#64748b',
    propellantColor: '#1e293b',
  },
  '125mm_apfsds': {
    caliber: '125mm_apfsds',
    code: '125mm DTC10',
    standard: 'PLA GJB',
    nameZh: '125mm DTC10-125 分装式钨合金穿甲弹 (ZTZ-99A)',
    nameEn: '125mm DTC10-125 Two-Piece Tungsten APFSDS (ZTZ-99A)',
    loadSubtitleZh: '4.8 kg 大长径比特种钨合金长杆芯 + 分装半可燃主药筒 (1,780 m/s)',
    loadSubtitleEn: '4.8 kg High-L/D Tungsten Penetrator + Separate Combustible Charge (1,780 m/s)',
    representativeWeapons: ['ztz99a'],
    primaryWeaponId: 'ztz99a',
    lineupXCm: 34.0,
    caseLengthMm: 408.0,
    oalMm: 1150.0,
    bulletDiameterMm: 125.0,
    neckDiameterMm: 132.0,
    shoulderDiameterMm: 146.0,
    baseDiameterMm: 149.0,
    rimDiameterMm: 159.0,
    rimThicknessMm: 8.8,
    caseCapacityMl: 10200,
    propellantMassG: 8800,
    propellantFillRatio: 0.91,
    propellantTypeZh: '高能低烧蚀渐增燃速复合装药 (8.8 kg · 主药筒 + 弹体附加药包)',
    propellantTypeEn: 'High-Energy Progressive-Burning Charge (8.8 kg · Main Combustible Case + Increment)',
    primerTypeZh: 'GUV-7 级高能电击发底火管 + 金属紧塞弹底',
    primerTypeEn: 'High-Energy Axial Electric Primer Tube + Metallic Obturating Stub Base',
    projectileMassG: 4800,
    projectileGrain: 74075,
    coreKind: 'apfsds_sabot_dart',
    coreAnatomyZh: 'Ø26mm 700mm+ 超长特种钨合金自锐穿甲长杆 + 铝合金轻量化鞍形弹托 + 尾翼曳光管',
    coreAnatomyEn: 'Ø26mm 700mm+ Self-Sharpening Tungsten Long-Rod Dart + Alloy Saddle Sabot + Tracer Fin Assembly',
    peakPressureMPa: 650,
    muzzleVelocityMps: 1780,
    muzzleEnergyJ: 7604160,
    highlightZh:
      '适配 ZTZ-99A 22 发底置转盘自动装弹机的分装穿甲杀手锏：总长 1,150 mm、650 MPa 膛压轰出 1,780 m/s（5.2 马赫）与 7.60 MJ 惊世动能，是人类现役陆战直射火力之巅！',
    highlightEn:
      'Engineered for ZTZ-99A’s 22-round carousel autoloader: 1,150 mm combined length generating 650 MPa, Mach 5.2 (1,780 m/s), and 7.60 MJ of kinetic armor-defeating fury.',
    caseColor: '#b8823c',
    jacketColor: '#4c535f',
    penetratorColor: '#e2e8f0',
    coreSlugColor: '#94a3b8',
    propellantColor: '#1e293b',
  },
};

export const CARTRIDGE_LAB_SPECS: Readonly<
  Record<CaliberProfile, CartridgeLabSpec>
> = {
  ...METALLIC_CARTRIDGE_LAB_SPECS,
  ...TANK_ORDNANCE_LAB_SPECS,
} as unknown as Readonly<Record<CaliberProfile, CartridgeLabSpec>>;

export interface ArcheryProjectileSpec {
  caliber: ArcheryCaliberProfile;
  code: string;
  standard: 'ATA / IBO';
  nameZh: string;
  nameEn: string;
  loadSubtitleZh: string;
  loadSubtitleEn: string;
  primaryWeaponId: 'lift33' | 'r500';
  oalMm: number;
  shaftLengthMm: number;
  shaftDiameterMm: number;
  broadheadDiameterMm: number;
  broadheadGrain: number;
  projectileGrain: number;
  projectileMassG: number;
  peakDrawForceLb: number;
  peakDrawForceN: number;
  letOffPercent: number;
  holdingForceLb: number;
  holdingForceN: number;
  powerStrokeMm: number;
  braceHeightMm: number;
  axleToAxleMm: number;
  velocityFps: number;
  muzzleVelocityMps: number;
  muzzleEnergyJ: number;
  coreAnatomyZh: string;
  coreAnatomyEn: string;
  energyDriveZh: string;
  energyDriveEn: string;
  nockLatchZh: string;
  nockLatchEn: string;
  highlightZh: string;
  highlightEn: string;
  shaftColor: string;
  broadheadColor: string;
  vaneColor: string;
  nockColor: string;
}

export const ARCHERY_PROJECTILE_SPECS: Readonly<
  Record<ArcheryCaliberProfile, ArcheryProjectileSpec>
> = {
  arrow_400gr: {
    caliber: 'arrow_400gr',
    code: '400 gr Arrow',
    standard: 'ATA / IBO',
    nameZh: '400 格令微径碳纤维猎箭（Mathews LIFT 33）',
    nameEn: '400 gr Micro-Diameter Carbon Arrow (Mathews LIFT 33)',
    loadSubtitleZh: '29" 高模量碳杆 + 100 格令三刃机械猎箭头 + 三片螺旋尾羽',
    loadSubtitleEn: '29" High-Modulus Carbon Shaft + 100 gr 3-Blade Broadhead + Helical Vanes',
    primaryWeaponId: 'lift33',
    oalMm: 736.6,
    shaftLengthMm: 711.2,
    shaftDiameterMm: 5.2,
    broadheadDiameterMm: 28.6,
    broadheadGrain: 100,
    projectileGrain: 400,
    projectileMassG: 25.92,
    peakDrawForceLb: 70,
    peakDrawForceN: 311.4,
    letOffPercent: 85,
    holdingForceLb: 10.5,
    holdingForceN: 46.7,
    powerStrokeMm: 571.5,
    braceHeightMm: 165.1,
    axleToAxleMm: 838,
    velocityFps: 348,
    muzzleVelocityMps: 106.0,
    muzzleEnergyJ: 145.6,
    coreAnatomyZh: '高模量 5.2mm 微径碳纤维缠绕杆体 + 铝制半内置插套 + 100格令三刃不锈钢猎箭头',
    coreAnatomyEn: '5.2mm High-Modulus Carbon-Composite Shaft + Half-Out Insert + 100 gr 3-Blade Broadhead',
    energyDriveZh: 'SwitchWeight-X 双同步凸轮 70 lb 峰值拉力 · 85% 省力谷区蓄能',
    energyDriveEn: 'SwitchWeight-X Binary-Cam 70 lb Peak Elastic Storage · 85% Let-Off',
    nockLatchZh: '聚碳酸酯发光箭尾扣 + Dyneema D-Loop 撒放环',
    nockLatchEn: 'Illuminated Polycarbonate Micro-Nock + Dyneema Release D-Loop',
    highlightZh:
      '无火药发射体：依靠四分体碳纤弓片弯曲储能（57.6 J 蓄能与极低 10.5 lb 满弓持力），在 571.5 mm 做功行程中将 25.92g 碳箭平稳加速至 106 m/s (348 FPS)。',
    highlightEn:
      'Smokeless elastic-propulsion projectile: SwitchWeight-X binary cams yield 85% let-off (10.5 lb hold) and accelerate a 400 gr arrow to 348 FPS (145.6 J) along a 22.5" (571.5 mm) power stroke.',
    shaftColor: '#1e293b',
    broadheadColor: '#cbd5e1',
    vaneColor: '#f97316',
    nockColor: '#22d3ee',
  },
  bolt_400gr: {
    caliber: 'bolt_400gr',
    code: '400 gr Bolt',
    standard: 'ATA / IBO',
    nameZh: '400 格令竞赛级碳纤维弩箭（Ravin R500）',
    nameEn: '400 gr Match Carbon Crossbow Bolt (Ravin R500)',
    primaryWeaponId: 'r500',
    loadSubtitleZh: '20" 高刚度碳杆 + 黄铜半月尾扣 + 100 格令穿甲猎箭头',
    loadSubtitleEn: '20" Match Carbon Shaft + Brass Half-Moon Nock + 100 gr Broadhead',
    oalMm: 508.0,
    shaftLengthMm: 476.0,
    shaftDiameterMm: 7.6,
    broadheadDiameterMm: 27.0,
    broadheadGrain: 100,
    projectileGrain: 400,
    projectileMassG: 25.92,
    peakDrawForceLb: 300,
    peakDrawForceN: 1334.5,
    letOffPercent: 38,
    holdingForceLb: 186,
    holdingForceN: 827.4,
    powerStrokeMm: 381.0,
    braceHeightMm: 114.3,
    axleToAxleMm: 193.0,
    velocityFps: 500,
    muzzleVelocityMps: 152.4,
    muzzleEnergyJ: 301.0,
    coreAnatomyZh: '20 英寸高刚度碳纤维箭杆 + 三片高偏转尾羽 + 100格令不锈钢一体猎箭头',
    coreAnatomyEn: '20" High-Stiffness Carbon Bolt + 3 High-Offset Vanes + 100 gr Stainless Broadhead',
    energyDriveZh: 'HexCoil 360° 螺旋凸轮 300 lb 弹性势能驱动（无轨悬空发射）',
    energyDriveEn: 'HexCoil 360° Helical Cam 300 lb Elastic Strain (Frictionless Zero-Rail Flight)',
    nockLatchZh: '精密车削黄铜半月护尾扣 + Trac-Trigger 悬浮卡爪 + 防空放联锁',
    nockLatchEn: 'Machined Brass Half-Moon Nock + Trac-Trigger Floating Sear & ADF Lock',
    highlightZh:
      '依靠 HexCoil 360° 螺旋缠绕轮组将 300 lb 峰值拉力浓缩于仅 91mm 宽的满弦跨距，在 381mm (15") 做功行程上推射 400 格令碳箭飙出 500 FPS (152.4 m/s, 301 J) 惊人动能。',
    highlightEn:
      'HexCoil 360° helical cams coil to a 3.6" cocked axle width at 300 lb draw, launching a 400 gr bolt over a 15" frictionless power stroke at 500 FPS (152.4 m/s · 301 J).',
    shaftColor: '#0f172a',
    broadheadColor: '#e2e8f0',
    vaneColor: '#f59e0b',
    nockColor: '#eab308',
  },
};

export function getArcheryProjectileMeta(
  caliber: string | null | undefined
): ArcheryProjectileSpec | null {
  if (caliber === 'arrow_400gr' || caliber === 'bolt_400gr') {
    return ARCHERY_PROJECTILE_SPECS[caliber];
  }
  return null;
}

export function archeryProjectileToLabSpec(
  meta: ArcheryProjectileSpec
): CartridgeLabSpec {
  return {
    caliber: meta.caliber as CaliberProfile,
    code: meta.code,
    standard: 'SAAMI',
    nameZh: meta.nameZh,
    nameEn: meta.nameEn,
    loadSubtitleZh: meta.loadSubtitleZh,
    loadSubtitleEn: meta.loadSubtitleEn,
    representativeWeapons: [meta.primaryWeaponId as WeaponId],
    primaryWeaponId: meta.primaryWeaponId as WeaponId,
    lineupXCm: 0,
    caseLengthMm: meta.shaftLengthMm,
    oalMm: meta.oalMm,
    bulletDiameterMm: meta.shaftDiameterMm,
    neckDiameterMm: meta.shaftDiameterMm,
    shoulderDiameterMm: null,
    baseDiameterMm: meta.shaftDiameterMm,
    rimDiameterMm: meta.shaftDiameterMm,
    rimThicknessMm: 2,
    caseCapacityMl: 0,
    propellantMassG: meta.projectileMassG,
    propellantFillRatio: 0,
    propellantTypeZh: meta.energyDriveZh,
    propellantTypeEn: meta.energyDriveEn,
    primerTypeZh: meta.nockLatchZh,
    primerTypeEn: meta.nockLatchEn,
    projectileMassG: meta.projectileMassG,
    projectileGrain: meta.projectileGrain,
    coreKind: 'fmj_lead',
    coreAnatomyZh: meta.coreAnatomyZh,
    coreAnatomyEn: meta.coreAnatomyEn,
    peakPressureMPa: Math.round(meta.peakDrawForceN),
    muzzleVelocityMps: meta.muzzleVelocityMps,
    muzzleEnergyJ: meta.muzzleEnergyJ,
    highlightZh: meta.highlightZh,
    highlightEn: meta.highlightEn,
    caseColor: meta.shaftColor,
    jacketColor: meta.broadheadColor,
    penetratorColor: meta.vaneColor,
    coreSlugColor: meta.nockColor,
    propellantColor: '#0f172a',
  };
}

export interface CartridgeCutawayMeshBundle {
  caseGeo: THREE.BufferGeometry;
  primerCupGeo: THREE.BufferGeometry;
  anvilGeo: THREE.BufferGeometry;
  propellantGeo: THREE.BufferGeometry;
  jacketGeo: THREE.BufferGeometry;
  penetratorGeo: THREE.BufferGeometry | null;
  coreSlugGeo: THREE.BufferGeometry;
}

/**
 * Merges multiple non-indexed / indexed `BufferGeometry` instances into one clean
 * `BufferGeometry` with `position` and `normal` attributes (zero external dependencies).
 */
function mergeSimpleGeometries(
  geos: readonly THREE.BufferGeometry[]
): THREE.BufferGeometry {
  const expanded = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let totalVerts = 0;
  for (const g of expanded) {
    totalVerts += g.getAttribute('position').count;
  }

  const posOut = new Float32Array(totalVerts * 3);
  const normOut = new Float32Array(totalVerts * 3);
  let offset = 0;

  for (const g of expanded) {
    const pos = g.getAttribute('position');
    let norm = g.getAttribute('normal');
    if (!norm) {
      g.computeVertexNormals();
      norm = g.getAttribute('normal');
    }
    posOut.set(pos.array as Float32Array, offset * 3);
    normOut.set(norm.array as Float32Array, offset * 3);
    offset += pos.count;
  }

  // Dispose temporary non-indexed clones
  for (let i = 0; i < expanded.length; i++) {
    if (expanded[i] !== geos[i]) {
      expanded[i].dispose();
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posOut, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normOut, 3));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Builds either a full 360° solid of revolution or a 180° `-Z` cutaway shell
 * with watertight `z = 0` longitudinal cross-section end-caps facing `+Z`.
 */
function buildRevolvedCutaway(
  profilePts: readonly THREE.Vector2[],
  segments: number,
  cutaway: boolean
): THREE.BufferGeometry {
  if (!cutaway) {
    const full = new THREE.LatheGeometry([...profilePts], segments, 0, Math.PI * 2);
    full.computeVertexNormals();
    full.computeBoundingBox();
    full.computeBoundingSphere();
    return full;
  }

  const parts: THREE.BufferGeometry[] = [];
  const halfLathe = new THREE.LatheGeometry(
    [...profilePts],
    Math.max(20, Math.round(segments * 0.65)),
    Math.PI * 0.5,
    Math.PI
  );
  halfLathe.computeVertexNormals();
  parts.push(halfLathe);

  const hasOffAxisArea = profilePts.some((p) => p.x > 1e-4);
  if (hasOffAxisArea && profilePts.length >= 3) {
    // If the profile starts and ends on the central axis (`r ≈ 0`), right + left halves
    // form a single connected meridian silhouette; otherwise cap right (`+X`) and left (`-X`) walls separately.
    const startsOnAxis = profilePts[0].x <= 1e-4;
    const endsOnAxis = profilePts[profilePts.length - 1].x <= 1e-4;

    if (startsOnAxis && endsOnAxis) {
      const shape = new THREE.Shape();
      shape.moveTo(profilePts[0].x, profilePts[0].y);
      for (let i = 1; i < profilePts.length; i++) {
        shape.lineTo(profilePts[i].x, profilePts[i].y);
      }
      for (let i = profilePts.length - 2; i >= 1; i--) {
        shape.lineTo(-profilePts[i].x, profilePts[i].y);
      }
      shape.closePath();
      const capGeo = new THREE.ShapeGeometry(shape);
      capGeo.computeVertexNormals();
      parts.push(capGeo);
    } else {
      // Right wall (+X, z = 0)
      const rightShape = new THREE.Shape();
      rightShape.moveTo(profilePts[0].x, profilePts[0].y);
      for (let i = 1; i < profilePts.length; i++) {
        rightShape.lineTo(profilePts[i].x, profilePts[i].y);
      }
      rightShape.closePath();
      const rightCap = new THREE.ShapeGeometry(rightShape);
      rightCap.computeVertexNormals();
      parts.push(rightCap);

      // Left wall (-X, z = 0) — reverse traversal so polygon winding remains CCW facing +Z
      const leftShape = new THREE.Shape();
      const last = profilePts[profilePts.length - 1];
      leftShape.moveTo(-last.x, last.y);
      for (let i = profilePts.length - 2; i >= 0; i--) {
        leftShape.lineTo(-profilePts[i].x, profilePts[i].y);
      }
      leftShape.closePath();
      const leftCap = new THREE.ShapeGeometry(leftShape);
      leftCap.computeVertexNormals();
      parts.push(leftCap);
    }
  }

  const merged = mergeSimpleGeometries(parts);
  for (const p of parts) {
    p.dispose();
  }
  return merged;
}

const cutawayCache = new Map<string, CartridgeCutawayMeshBundle>();

function applyChamferedSquareOuterWall(
  geo: THREE.BufferGeometry,
  rInnerCutoff: number
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > rInnerCutoff && Math.abs(z) > 1e-4) {
      const ax = Math.abs(x) / r;
      const az = Math.abs(z) / r;
      const scale = Math.min(
        1 / Math.max(1e-4, ax),
        1 / Math.max(1e-4, az),
        1.72 / Math.max(1e-4, ax + az)
      );
      pos.setX(i, x * scale);
      pos.setZ(i, z * scale);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds a photorealistic 1:1 APFSDS-T (Armor-Piercing Fin-Stabilized Discarding Sabot)
 * cutaway or full 360° mesh bundle for 120×570mm NATO (M829A4/DM63A1) and
 * 125mm PLA (DTC10-125) tank cannon rounds:
 *   - `caseGeo`: Stepped steel obturating stub base + semi-combustible nitrocellulose cylinder
 *   - `primerCupGeo` / `anvilGeo`: Long axial electric ignition primer tube (DM12A1 / GUV-7)
 *   - `propellantGeo`: Bundled cylindrical combustible propellant sticks packed around the dart tail
 *   - `jacketGeo`: Sub-caliber Ø25–26mm tungsten/DU long-rod penetrator dart + 6 swept tail fins
 *     + buttress drive grooves + needle ogive reaching exact `oalH` (`spec.oalMm / 10`)
 *   - `coreSlugGeo`: Sculpted 3-petal grooved aerospace aluminum hourglass saddle sabot
 *   - `penetratorGeo`: Proud metallic obturator sealing band + ballistic windscreen cap + tracer cup
 */
function buildApfsdsCutawayBundle(
  s: CartridgeLabSpec,
  cutaway: boolean
): CartridgeCutawayMeshBundle {
  const caseH = s.caseLengthMm / 10;
  const oalH = s.oalMm / 10;
  const rRim = s.rimDiameterMm / 20;
  const rBase = s.baseDiameterMm / 20;
  const rNeck = s.neckDiameterMm / 20;
  const rBullet = s.bulletDiameterMm / 20;
  const rimT = s.rimThicknessMm / 10;

  const is125 = s.caliber === '125mm_apfsds';
  const rDart = is125 ? 1.3 : 1.25; // Ø26mm (DTC10-125) / Ø25mm (M829A4)
  const stubTopY = Math.min(caseH * 0.24, 11.2);
  const pocketR = 1.38;
  const pocketH = 2.0;
  const flashHoleR = 0.52;
  const webFloorY = 3.2;
  const wallT = 0.58;
  const rInnerBase = rBase - wallT;
  const rInnerMouth = rNeck - 0.48;

  // 1. Stepped Steel Obturating Stub Base + Semi-Combustible Nitrocellulose Cylinder
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(pocketR, 0),
    new THREE.Vector2(rRim - 0.12, 0),
    new THREE.Vector2(rRim, 0.14),
    new THREE.Vector2(rRim, rimT),
    new THREE.Vector2(rBase + 0.14, rimT + 0.22),
    new THREE.Vector2(rBase + 0.12, stubTopY - 0.35),
    new THREE.Vector2(rBase - 0.04, stubTopY),
    new THREE.Vector2(rNeck + 0.25, caseH * 0.84),
    new THREE.Vector2(rNeck, caseH - 0.25),
    new THREE.Vector2(rNeck - 0.1, caseH),
    new THREE.Vector2(rInnerMouth, caseH),
    new THREE.Vector2(rInnerMouth + 0.16, caseH * 0.82),
    new THREE.Vector2(rInnerBase, stubTopY),
    new THREE.Vector2(rInnerBase - 0.15, webFloorY + 0.6),
    new THREE.Vector2(flashHoleR, webFloorY),
    new THREE.Vector2(flashHoleR, pocketH),
    new THREE.Vector2(pocketR, pocketH),
  ];
  const caseGeo = buildRevolvedCutaway(casePts, 44, cutaway);

  // 2. Long Axial Electric Primer Ignition Tube (DM12A1 / GUV-7)
  const dartBaseY = webFloorY + (caseH - webFloorY) * (is125 ? 0.18 : 0.22);
  const primerTubeTopY = Math.max(webFloorY + 3.5, dartBaseY - 1.1);
  const primerPts: THREE.Vector2[] = [
    new THREE.Vector2(0, 0.04),
    new THREE.Vector2(pocketR * 0.96, 0.04),
    new THREE.Vector2(pocketR * 0.96, pocketH - 0.04),
    new THREE.Vector2(flashHoleR * 0.92, pocketH + 0.15),
    new THREE.Vector2(flashHoleR * 0.88, primerTubeTopY),
    new THREE.Vector2(flashHoleR * 0.56, primerTubeTopY),
    new THREE.Vector2(flashHoleR * 0.56, 0.42),
    new THREE.Vector2(0, 0.42),
  ];
  const primerCupGeo = buildRevolvedCutaway(primerPts, 32, cutaway);

  // 3. Electric Ignition Contact & Axial Flash Core
  const anvilPts: THREE.Vector2[] = [
    new THREE.Vector2(0, 0.46),
    new THREE.Vector2(flashHoleR * 0.48, 0.46),
    new THREE.Vector2(flashHoleR * 0.42, primerTubeTopY - 0.25),
    new THREE.Vector2(0, primerTubeTopY - 0.05),
  ];
  const anvilGeo = buildRevolvedCutaway(anvilPts, 24, cutaway);

  // 4. Bundled Cylindrical Combustible Stick-Propellant Grains around submerged dart tail
  const stickBaseY = webFloorY + 0.7;
  const stickTopY = caseH - 1.9;
  const stickLen = Math.max(4.0, stickTopY - stickBaseY);
  const stickMidY = (stickBaseY + stickTopY) * 0.5;
  const stickParts: THREE.BufferGeometry[] = [];

  const innerRingR = rDart + 1.55;
  const midRingR = (innerRingR + (rInnerMouth - 0.65)) * 0.52;
  const outerRingR = Math.min(rInnerBase, rInnerMouth) - 0.62;
  const rings: readonly { radius: number; count: number; stickR: number }[] = [
    { radius: innerRingR, count: 10, stickR: 0.34 },
    { radius: midRingR, count: 16, stickR: 0.38 },
    { radius: outerRingR, count: 22, stickR: 0.38 },
  ];

  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const ang = (i / ring.count) * Math.PI * 2 + 0.14;
      const cx = Math.cos(ang) * ring.radius;
      const cz = Math.sin(ang) * ring.radius;
      if (cutaway && cz > -ring.stickR * 0.25) continue;
      const stick = new THREE.CylinderGeometry(
        ring.stickR,
        ring.stickR,
        stickLen,
        10,
        1
      );
      stick.translate(cx, stickMidY, cz);
      stickParts.push(stick);
    }
  }
  // Base propellant wafer disc cradling the sticks cleanly above the case web
  const baseBedPts: THREE.Vector2[] = [
    new THREE.Vector2(flashHoleR + 0.12, stickBaseY - 0.45),
    new THREE.Vector2(rInnerBase - 0.18, stickBaseY - 0.45),
    new THREE.Vector2(rInnerBase - 0.18, stickBaseY + 0.55),
    new THREE.Vector2(flashHoleR + 0.12, stickBaseY + 0.55),
  ];
  stickParts.push(buildRevolvedCutaway(baseBedPts, 32, cutaway));

  const propellantGeo = mergeSimpleGeometries(stickParts);
  for (const part of stickParts) {
    part.dispose();
  }

  // 5. Sub-Caliber Finned Tungsten / DU Long-Rod Penetrator Dart (`jacketGeo`, max.y === oalH!)
  const finSpanR = rBullet * 0.72;
  const finBottomY = dartBaseY + 1.4;
  const finTopY = dartBaseY + 14.5;
  const sabotBaseY = is125 ? caseH - 3.2 : caseH - 4.8;
  const sabotTopY = is125 ? caseH + 24.5 : caseH + 21.5;
  const ogiveStartY = oalH - (is125 ? 16.0 : 14.2);

  const dartPts: THREE.Vector2[] = [
    new THREE.Vector2(0, dartBaseY),
    new THREE.Vector2(rDart * 0.76, dartBaseY),
    new THREE.Vector2(rDart * 0.94, dartBaseY + 1.1),
    new THREE.Vector2(rDart * 0.96, finTopY + 1.0),
    new THREE.Vector2(rDart, sabotBaseY),
  ];
  // Machined buttress drive grooves inside the sabot grip zone
  const grooveSteps = 8;
  for (let g = 0; g < grooveSteps; g++) {
    const gy0 = THREE.MathUtils.lerp(
      sabotBaseY + 2.4,
      sabotTopY - 3.0,
      g / grooveSteps
    );
    const gy1 = THREE.MathUtils.lerp(
      sabotBaseY + 2.4,
      sabotTopY - 3.0,
      (g + 0.52) / grooveSteps
    );
    dartPts.push(
      new THREE.Vector2(rDart + 0.14, gy0),
      new THREE.Vector2(rDart - 0.08, gy1)
    );
  }
  dartPts.push(
    new THREE.Vector2(rDart, sabotTopY + 0.8),
    new THREE.Vector2(rDart * 0.98, ogiveStartY)
  );
  // Needle-sharp high-fineness ballistic nose ogive terminating cleanly at y = oalH
  for (let step = 1; step <= 8; step++) {
    const u = step / 8;
    const y = THREE.MathUtils.lerp(ogiveStartY, oalH, u);
    const r = step === 8 ? 0 : rDart * 0.98 * (1 - Math.pow(u, 1.38));
    dartPts.push(new THREE.Vector2(r, y));
  }

  const dartParts: THREE.BufferGeometry[] = [
    buildRevolvedCutaway(dartPts, 36, cutaway),
  ];

  // 6 Swept Stabilizing Tail Fins (crisp trapezoidal swept delta profile)
  const finShape = new THREE.Shape();
  finShape.moveTo(rDart * 0.82, finBottomY);
  finShape.lineTo(finSpanR, finBottomY + 0.85);
  finShape.lineTo(finSpanR, finTopY - 3.6);
  finShape.lineTo(rDart * 0.82, finTopY);
  finShape.closePath();

  const finThickness = 0.28;
  const finAngles = [
    0,
    Math.PI / 3,
    (2 * Math.PI) / 3,
    Math.PI,
    (4 * Math.PI) / 3,
    (5 * Math.PI) / 3,
  ];
  for (const ang of finAngles) {
    // In cutaway mode keep the 4 rear/lateral fins (`z <= 0`) so the front slice plane stays unobstructed
    if (cutaway && Math.sin(ang) > 0.25) continue;
    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: finThickness,
      bevelEnabled: false,
      curveSegments: 1,
    });
    finGeo.translate(0, 0, -finThickness * 0.5);
    finGeo.rotateY(-ang);
    dartParts.push(finGeo);
  }

  const jacketGeo = mergeSimpleGeometries(dartParts);
  for (const part of dartParts) {
    part.dispose();
  }

  // 6. Sculpted 3-Petal Grooved Aerospace Aluminum Hourglass Saddle Sabot (`coreSlugGeo`)
  const rSabotBore = rBullet * 0.992;
  const rSabotWaist = rDart + 1.18;
  const sabotLen = sabotTopY - sabotBaseY;
  const sabotPts: THREE.Vector2[] = [
    // Inner bore gripping the dart's buttress grooves
    new THREE.Vector2(rDart + 0.16, sabotBaseY),
    // Rear full-bore pusher bulkhead + obturator seat groove
    new THREE.Vector2(rSabotBore * 0.88, sabotBaseY),
    new THREE.Vector2(rSabotBore, sabotBaseY + 0.5),
    new THREE.Vector2(rSabotBore, sabotBaseY + 2.9),
    new THREE.Vector2(rSabotBore * 0.93, sabotBaseY + 3.4),
    // Deeply scooped rear hourglass weight-reduction ramp
    new THREE.Vector2(rSabotBore * 0.66, sabotBaseY + sabotLen * 0.24),
    new THREE.Vector2(rSabotWaist, sabotBaseY + sabotLen * 0.4),
    new THREE.Vector2(rSabotWaist, sabotBaseY + sabotLen * 0.64),
    // Forward concave saddle flare up to full-bore front bourrelet ring
    new THREE.Vector2(rSabotBore * 0.72, sabotBaseY + sabotLen * 0.79),
    new THREE.Vector2(rSabotBore, sabotBaseY + sabotLen * 0.88),
    new THREE.Vector2(rSabotBore, sabotTopY - 0.55),
    new THREE.Vector2(rSabotBore * 0.92, sabotTopY),
    // Forward aerodynamic air-scoop cavity
    new THREE.Vector2(rSabotBore * 0.78, sabotTopY),
    new THREE.Vector2(rDart + 0.55, sabotTopY - 3.6),
    new THREE.Vector2(rDart + 0.16, sabotTopY - 4.2),
  ];

  const sabotParts: THREE.BufferGeometry[] = [];
  if (cutaway) {
    // 2 rear-side 84° petals with a crisp 6° longitudinal petal-split gap along the back spine (`phi = PI`)
    const petalRanges: readonly [number, number][] = [
      [Math.PI * 0.5, Math.PI * 0.482],
      [Math.PI * 1.018, Math.PI * 0.482],
    ];
    for (const [phiStart, phiLen] of petalRanges) {
      const petalLathe = new THREE.LatheGeometry(sabotPts, 18, phiStart, phiLen);
      petalLathe.computeVertexNormals();
      sabotParts.push(petalLathe);
    }
    // Watertight longitudinal cutaway end-caps on the z = 0 plane (+X and -X walls)
    const rightCapShape = new THREE.Shape();
    rightCapShape.moveTo(sabotPts[0].x, sabotPts[0].y);
    for (let i = 1; i < sabotPts.length; i++) {
      rightCapShape.lineTo(sabotPts[i].x, sabotPts[i].y);
    }
    rightCapShape.closePath();
    sabotParts.push(new THREE.ShapeGeometry(rightCapShape));

    const leftCapShape = new THREE.Shape();
    const lastPt = sabotPts[sabotPts.length - 1];
    leftCapShape.moveTo(-lastPt.x, lastPt.y);
    for (let i = sabotPts.length - 2; i >= 0; i--) {
      leftCapShape.lineTo(-sabotPts[i].x, sabotPts[i].y);
    }
    leftCapShape.closePath();
    sabotParts.push(new THREE.ShapeGeometry(leftCapShape));
  } else {
    // 3 distinct 114° aerospace-aluminum sabot petals separated by crisp 6° discard slots
    const petalSpan = (114 * Math.PI) / 180;
    const slotOffset = (3 * Math.PI) / 180;
    for (let p = 0; p < 3; p++) {
      const phiStart = p * ((Math.PI * 2) / 3) + slotOffset;
      const petal = new THREE.LatheGeometry(sabotPts, 18, phiStart, petalSpan);
      petal.computeVertexNormals();
      sabotParts.push(petal);
    }
  }
  const coreSlugGeo = mergeSimpleGeometries(sabotParts);
  for (const part of sabotParts) {
    part.dispose();
  }

  // 7. Proud Copper/Polymer Obturator Driving Band + Ballistic Nose Tip Cap + Rear Tracer Ring (`penetratorGeo`)
  const obturatorPts: THREE.Vector2[] = [
    new THREE.Vector2(rSabotBore * 0.96, sabotBaseY + 0.7),
    new THREE.Vector2(rSabotBore * 1.032, sabotBaseY + 0.85),
    new THREE.Vector2(rSabotBore * 1.032, sabotBaseY + 2.45),
    new THREE.Vector2(rSabotBore * 0.96, sabotBaseY + 2.6),
  ];
  const noseCapPts: THREE.Vector2[] = [
    new THREE.Vector2(rDart * 0.42, ogiveStartY + 1.4),
    new THREE.Vector2(rDart * 1.02, ogiveStartY + 1.4),
    new THREE.Vector2(rDart * 0.76, ogiveStartY + 5.6),
    new THREE.Vector2(rDart * 0.34, ogiveStartY + 5.6),
  ];
  const tracerCupPts: THREE.Vector2[] = [
    new THREE.Vector2(0, dartBaseY - 0.55),
    new THREE.Vector2(rDart * 0.78, dartBaseY - 0.55),
    new THREE.Vector2(rDart * 0.88, dartBaseY + 0.4),
    new THREE.Vector2(0, dartBaseY + 0.4),
  ];

  const accentParts: THREE.BufferGeometry[] = [
    buildRevolvedCutaway(obturatorPts, 40, cutaway),
    buildRevolvedCutaway(noseCapPts, 32, cutaway),
    buildRevolvedCutaway(tracerCupPts, 28, cutaway),
  ];
  const penetratorGeo = mergeSimpleGeometries(accentParts);
  for (const part of accentParts) {
    part.dispose();
  }

  return {
    caseGeo,
    primerCupGeo,
    anvilGeo,
    propellantGeo,
    jacketGeo,
    penetratorGeo,
    coreSlugGeo,
  };
}

/**
 * Generates exact 1:1 SAAMI/CIP standing geometries (`1 unit = 1 cm = 10 mm`)
 * for any of the 15 calibers in either longitudinal cutaway (`true`) or full (`false`) mode.
 */
export function getCartridgeLabMeshBundle(
  caliber: CaliberProfile,
  cutaway: boolean
): CartridgeCutawayMeshBundle {
  const safeCaliber: MetallicCaliberProfile | TankOrdnanceCaliberProfile =
    isCaliberProfile(caliber) || isTankOrdnanceProfile(caliber)
      ? caliber
      : '556_nato';
  const key = `${safeCaliber}|${cutaway ? 'cut' : 'full'}`;
  const cached = cutawayCache.get(key);
  if (cached) return cached;

  const s = CARTRIDGE_LAB_SPECS[safeCaliber];
  if (s.coreKind === 'apfsds_sabot_dart') {
    const apfsdsBundle = buildApfsdsCutawayBundle(s, cutaway);
    cutawayCache.set(key, apfsdsBundle);
    return apfsdsBundle;
  }
  const caseH = s.caseLengthMm / 10;
  const oalH = s.oalMm / 10;
  const rRim = s.rimDiameterMm / 20;
  const rBase = s.baseDiameterMm / 20;
  const rNeck = s.neckDiameterMm / 20;
  const rBullet = s.bulletDiameterMm / 20;
  const rimT = s.rimThicknessMm / 10;

  const isCaseless = s.coreKind === 'caseless_telescoped';
  const isShotshell = s.coreKind === 'buckshot_wad_column';
  const isJsp = s.coreKind === 'jsp_soft_point';
  const isTankRound = isTankOrdnanceProfile(safeCaliber);

  const pocketR = isCaseless
    ? 0.21
    : isTankRound
      ? Math.min(rRim * 0.24, 1.45)
      : Math.min(rRim * 0.44, caliber === '50_bmg' ? 0.41 : 0.265);
  const pocketH = isCaseless
    ? 0.22
    : isTankRound
      ? Math.min(caseH * 0.08, 2.2)
      : Math.min(caseH * 0.14, caliber === '50_bmg' ? 0.34 : 0.21);
  const flashHoleR = Math.max(0.042, pocketR * 0.28);
  const webFloorY = pocketH + Math.max(0.11, caseH * 0.065);
  const wallBaseT = isCaseless
    ? 0.085
    : Math.max(0.045, (rBase - rBullet) * 0.42);
  const wallMouthT = isCaseless
    ? 0.085
    : Math.max(0.026, (rNeck - rBullet) * 0.92);
  const rInnerBase = Math.max(flashHoleR + 0.05, rBase - wallBaseT);
  const rInnerMouth = isCaseless
    ? Math.max(rBullet + 0.015, rBase - wallMouthT)
    : Math.max(flashHoleR + 0.04, rNeck - wallMouthT);

  const grooveR = Math.min(rRim, rBase) * 0.855;
  const grooveTopY = rimT + Math.max(0.11, rimT * 0.95);
  const webRampTopY = grooveTopY + Math.max(0.08, rimT * 0.65);
  const isRimmed = rRim > rBase * 1.05;

  const isBottleneck = s.shoulderDiameterMm !== null;
  const rShoulder = isBottleneck ? s.shoulderDiameterMm! / 20 : rNeck;
  const shoulderStartY = isBottleneck ? caseH * 0.74 : caseH * 0.82;
  const neckStartY = isBottleneck ? caseH * 0.86 : caseH * 0.9;

  // 1. Drawn Brass / Hull / Molded HITP Caseless Block Wall
  const casePts: THREE.Vector2[] = isCaseless
    ? [
        new THREE.Vector2(pocketR, 0),
        new THREE.Vector2(rBase - 0.025, 0),
        new THREE.Vector2(rBase, 0.03),
        new THREE.Vector2(rBase, caseH - 0.03),
        new THREE.Vector2(rBase - 0.025, caseH),
        new THREE.Vector2(rBullet + 0.012, caseH),
        new THREE.Vector2(rBullet + 0.012, caseH - 0.24),
        new THREE.Vector2(rInnerBase, caseH - 0.34),
      ]
    : isRimmed
      ? [
          new THREE.Vector2(pocketR, 0),
          new THREE.Vector2(rRim - 0.02, 0),
          new THREE.Vector2(rRim, 0.02),
          new THREE.Vector2(rRim, rimT),
          new THREE.Vector2(rBase, rimT + 0.025),
        ]
      : [
          new THREE.Vector2(pocketR, 0),
          new THREE.Vector2(rRim - 0.02, 0),
          new THREE.Vector2(rRim, 0.02),
          new THREE.Vector2(rRim, rimT),
          new THREE.Vector2(grooveR, rimT + 0.03),
          new THREE.Vector2(grooveR, grooveTopY),
          new THREE.Vector2(rBase, webRampTopY),
        ];

  if (!isCaseless) {
    if (isBottleneck) {
      casePts.push(
        new THREE.Vector2(rShoulder, shoulderStartY),
        new THREE.Vector2(rNeck, neckStartY),
        new THREE.Vector2(rNeck, caseH),
        new THREE.Vector2(rInnerMouth, caseH),
        new THREE.Vector2(rInnerMouth, neckStartY - 0.03),
        new THREE.Vector2(
          Math.max(rInnerMouth + 0.02, rShoulder - wallBaseT * 0.72),
          shoulderStartY - 0.04
        )
      );
    } else {
      casePts.push(
        new THREE.Vector2(rNeck, caseH),
        new THREE.Vector2(rInnerMouth, caseH),
        new THREE.Vector2(rInnerMouth, caseH * 0.68)
      );
    }
  }

  casePts.push(
    new THREE.Vector2(rInnerBase, webFloorY + 0.08),
    new THREE.Vector2(flashHoleR, webFloorY),
    new THREE.Vector2(flashHoleR, pocketH),
    new THREE.Vector2(pocketR, pocketH)
  );

  const rawCaseGeo = buildRevolvedCutaway(casePts, 40, cutaway);
  const caseGeo = isCaseless
    ? applyChamferedSquareOuterWall(rawCaseGeo, rInnerBase + 0.02)
    : rawCaseGeo;

  // 2. Nickel-Plated Boxer Primer Cup (or Combustible Nitrocellulose Wafer for 4.73mm DM11)
  const rCup = pocketR * 0.95;
  const cupWall = Math.max(0.022, rCup * 0.14);
  const primerPts: THREE.Vector2[] = [
    new THREE.Vector2(0, 0.008),
    new THREE.Vector2(rCup, 0.008),
    new THREE.Vector2(rCup, pocketH - 0.008),
    new THREE.Vector2(rCup - cupWall, pocketH - 0.008),
    new THREE.Vector2(rCup - cupWall, 0.008 + cupWall),
    new THREE.Vector2(0, 0.008 + cupWall),
  ];
  const primerCupGeo = buildRevolvedCutaway(primerPts, 32, cutaway);

  // 3. Brass Boxer Anvil + Priming Compound Pellet
  const rAnvil = (rCup - cupWall) * 0.88;
  const anvilBaseY = 0.012 + cupWall;
  const anvilApexY = pocketH - 0.012;
  const anvilPts: THREE.Vector2[] = [
    new THREE.Vector2(0, anvilApexY),
    new THREE.Vector2(flashHoleR * 0.85, anvilApexY - 0.02),
    new THREE.Vector2(rAnvil, anvilBaseY + 0.025),
    new THREE.Vector2(rAnvil, anvilBaseY),
    new THREE.Vector2(rAnvil * 0.42, anvilBaseY),
    new THREE.Vector2(0, anvilBaseY + (anvilApexY - anvilBaseY) * 0.48),
  ];
  const anvilGeo = buildRevolvedCutaway(anvilPts, 28, cutaway);

  // 4. Granular Smokeless Propellant Charge Column (or Telescoped Booster Charge for DM11)
  const bulletSeatDepth = isCaseless
    ? caseH * 0.78
    : isShotshell
      ? caseH * 0.56
      : Math.min(
          (oalH - caseH) * 0.52,
          isBottleneck ? (caseH - neckStartY) * 1.18 : caseH * 0.28
        );
  const bulletBaseY = caseH - bulletSeatDepth;
  const powderMaxTopY = isCaseless
    ? caseH - 0.36
    : isShotshell
      ? webFloorY + (caseH - webFloorY) * 0.42
      : Math.max(webFloorY + 0.18, bulletBaseY - 0.03);
  const powderTopY = isShotshell
    ? webFloorY + (caseH - webFloorY) * s.propellantFillRatio
    : webFloorY + (powderMaxTopY - webFloorY) * s.propellantFillRatio;

  const propPts: THREE.Vector2[] = isCaseless
    ? [
        new THREE.Vector2(0, webFloorY + 0.01),
        new THREE.Vector2(rInnerBase - 0.012, webFloorY + 0.08),
        new THREE.Vector2(rInnerBase - 0.012, powderTopY),
        new THREE.Vector2(rBullet + 0.016, powderTopY),
        new THREE.Vector2(rBullet + 0.016, bulletBaseY - 0.02),
        new THREE.Vector2(0, bulletBaseY - 0.02),
      ]
    : [
        new THREE.Vector2(0, webFloorY + 0.006),
        new THREE.Vector2(flashHoleR, webFloorY + 0.006),
        new THREE.Vector2(rInnerBase - 0.008, webFloorY + 0.085),
      ];
  if (!isCaseless) {
    if (isBottleneck && powderTopY > shoulderStartY - 0.04) {
      propPts.push(
        new THREE.Vector2(
          Math.max(rInnerMouth, rShoulder - wallBaseT * 0.72) - 0.008,
          shoulderStartY - 0.04
        ),
        new THREE.Vector2(rInnerMouth - 0.01, Math.min(powderTopY, neckStartY))
      );
    } else {
      const rAtTop = THREE.MathUtils.lerp(
        rInnerBase - 0.008,
        rInnerMouth - 0.008,
        Math.min(1, (powderTopY - webFloorY) / Math.max(0.2, caseH - webFloorY))
      );
      propPts.push(new THREE.Vector2(rAtTop, powderTopY));
    }
    propPts.push(new THREE.Vector2(0, powderTopY));
  }
  const propellantGeo = buildRevolvedCutaway(propPts, 32, cutaway);

  // 5 & 6. Projectile Copper Jacket + Dual-Core Penetrator / Lead Core Slug
  const projLen = oalH - bulletBaseY;
  const jacketT = Math.max(0.028, rBullet * 0.13);
  const rCoreMax = Math.max(0.05, rBullet - jacketT);
  const isJhp = s.coreKind === 'jhp_cavity';
  const isOtm = s.coreKind === 'otm_scenar';
  const hasSteelPenetrator =
    s.coreKind === 'ap_steel_alu' ||
    s.coreKind === 'dual_core_penetrator' ||
    s.coreKind === 'steel_core_lead_shirt' ||
    s.coreKind === 'subsonic_tungsten_ap' ||
    s.coreKind === 'm33_heavy_steel' ||
    s.coreKind === 'apcbc_he_shell';

  const boatTailH =
    s.coreKind === 'fmj_lead' || isJhp ? projLen * 0.06 : projLen * 0.16;
  const bearingTopY = isCaseless
    ? bulletBaseY + projLen * 0.56
    : caseH + projLen * 0.12;

  // Outer ogive helper
  const ogiveRadiusAt = (u01: number): number => {
    if (isJhp) {
      return rBullet * (1 - 0.44 * Math.pow(u01, 1.25));
    }
    if (isJsp) {
      return rBullet * (1 - 0.48 * Math.pow(u01, 1.35));
    }
    if (s.coreKind === 'fmj_lead') {
      return rBullet * Math.sqrt(Math.max(0, 1 - Math.pow(u01, 1.85)));
    }
    // Spitzer secant ogive
    return rBullet * (1 - Math.pow(u01, 1.55));
  };

  const jacketPts: THREE.Vector2[] = [];
  if (isShotshell) {
    // 12 Gauge Polyethylene Wad Column: obturator skirt + collapsible cushion ribs + shot-cup wall up to oalH
    const wadBaseY = powderTopY + 0.03;
    const cupFloorY = wadBaseY + (caseH - wadBaseY) * 0.34;
    const rWadOuter = Math.min(rInnerMouth - 0.012, rBullet * 0.98);
    const rCupInner = rWadOuter - 0.075;
    jacketPts.push(
      new THREE.Vector2(0, wadBaseY),
      new THREE.Vector2(rWadOuter, wadBaseY),
      new THREE.Vector2(rWadOuter, wadBaseY + 0.24),
      new THREE.Vector2(rWadOuter * 0.76, wadBaseY + 0.34),
      new THREE.Vector2(rWadOuter * 0.76, cupFloorY - 0.12),
      new THREE.Vector2(rWadOuter, cupFloorY),
      new THREE.Vector2(rWadOuter, oalH - 0.06),
      new THREE.Vector2(rWadOuter * 0.94, oalH),
      new THREE.Vector2(rCupInner, oalH),
      new THREE.Vector2(rCupInner, cupFloorY + 0.08),
      new THREE.Vector2(0, cupFloorY + 0.08)
    );
  } else if (isJhp || isJsp) {
    // Open-mouth JHP / exposed soft-point JSP semi-jacket shell
    const cavityDepth = isJsp ? 0.05 : projLen * 0.34;
    const cavityFloorY = oalH - cavityDepth;
    const rMouthOuter = ogiveRadiusAt(1);
    const rMouthInner = rMouthOuter * (isJsp ? 0.82 : 0.62);
    const lipTopY = isJsp ? oalH - 0.025 : oalH;

    jacketPts.push(
      new THREE.Vector2(0, bulletBaseY),
      new THREE.Vector2(rBullet * 0.88, bulletBaseY),
      new THREE.Vector2(rBullet, bulletBaseY + boatTailH),
      new THREE.Vector2(rBullet, bearingTopY)
    );
    for (let step = 1; step <= 6; step++) {
      const u = step / 6;
      const y = THREE.MathUtils.lerp(bearingTopY, lipTopY, u);
      jacketPts.push(new THREE.Vector2(ogiveRadiusAt(u), y));
    }
    jacketPts.push(
      new THREE.Vector2(rMouthInner, lipTopY - 0.01),
      new THREE.Vector2(rMouthInner * 0.45, cavityFloorY),
      new THREE.Vector2(rCoreMax, cavityFloorY - 0.04),
      new THREE.Vector2(rCoreMax, bulletBaseY + jacketT),
      new THREE.Vector2(0, bulletBaseY + jacketT)
    );
  } else {
    // Closed-tip FMJ / Spitzer / OTM jacket shell enclosing core cavity
    const innerTipY = isOtm ? oalH - projLen * 0.18 : oalH - jacketT * 1.8;
    jacketPts.push(
      new THREE.Vector2(rBullet * 0.8, bulletBaseY),
      new THREE.Vector2(rBullet, bulletBaseY + boatTailH),
      new THREE.Vector2(rBullet, bearingTopY)
    );
    for (let step = 1; step <= 7; step++) {
      const u = step / 7;
      const y = THREE.MathUtils.lerp(bearingTopY, oalH, u);
      const r = step === 7 ? (isOtm ? rBullet * 0.12 : 0) : ogiveRadiusAt(u);
      jacketPts.push(new THREE.Vector2(r, y));
    }
    if (isOtm) {
      jacketPts.push(new THREE.Vector2(0, oalH - 0.03));
    }
    jacketPts.push(new THREE.Vector2(0, innerTipY));
    for (let step = 5; step >= 1; step--) {
      const u = step / 6;
      const y = THREE.MathUtils.lerp(bearingTopY, innerTipY, u);
      const rOuter = ogiveRadiusAt(
        Math.min(1, (y - bearingTopY) / Math.max(0.1, oalH - bearingTopY))
      );
      jacketPts.push(new THREE.Vector2(Math.max(0.02, rOuter - jacketT), y));
    }
    jacketPts.push(
      new THREE.Vector2(rCoreMax, bearingTopY),
      new THREE.Vector2(rCoreMax, bulletBaseY + boatTailH),
      new THREE.Vector2(Math.max(0.03, rBullet * 0.8 - jacketT), bulletBaseY)
    );
  }

  const jacketGeo = buildRevolvedCutaway(jacketPts, 36, cutaway);

  // Internal Core(s)
  let penetratorGeo: THREE.BufferGeometry | null = null;
  let coreSlugGeo: THREE.BufferGeometry;

  if (isShotshell) {
    // 3-tier stacked 00 antimonial lead buckshot column inside the polyethylene shot cup
    const wadBaseY = powderTopY + 0.03;
    const cupFloorY = wadBaseY + (caseH - wadBaseY) * 0.34 + 0.1;
    const colTopY = oalH - 0.04;
    const tierSpan = (colTopY - cupFloorY) / 3;
    const rPelletMax = Math.min(rInnerMouth - 0.095, rBullet * 0.86);
    const buckPts: THREE.Vector2[] = [new THREE.Vector2(0, cupFloorY)];
    for (let tier = 0; tier < 3; tier++) {
      const y0 = cupFloorY + tier * tierSpan;
      const yMid = y0 + tierSpan * 0.5;
      const rHalf = tierSpan * 0.48;
      for (let sIdx = 0; sIdx <= 6; sIdx++) {
        const th = -Math.PI * 0.44 + (sIdx / 6) * Math.PI * 0.88;
        const r = Math.max(0.18, rPelletMax * Math.cos(th));
        const y = yMid + rHalf * Math.sin(th);
        buckPts.push(new THREE.Vector2(r, y));
      }
      if (tier < 2) {
        buckPts.push(new THREE.Vector2(rPelletMax * 0.38, y0 + tierSpan));
      }
    }
    buckPts.push(new THREE.Vector2(0, colTopY));
    coreSlugGeo = buildRevolvedCutaway(buckPts, 30, cutaway);
  } else if (hasSteelPenetrator) {
    const splitY =
      s.coreKind === 'm33_heavy_steel' ||
      s.coreKind === 'steel_core_lead_shirt' ||
      s.coreKind === 'subsonic_tungsten_ap'
        ? bulletBaseY + projLen * 0.24
        : bulletBaseY + projLen * 0.52;
    const penTipY = oalH - jacketT * 1.85;

    const penPts: THREE.Vector2[] = [new THREE.Vector2(0, splitY)];
    const rAtSplit = Math.max(
      0.035,
      ogiveRadiusAt(
        Math.max(0, (splitY - bearingTopY) / Math.max(0.1, oalH - bearingTopY))
      ) -
        jacketT * 1.04
    );
    penPts.push(new THREE.Vector2(Math.min(rCoreMax, rAtSplit), splitY));
    for (let step = 1; step <= 5; step++) {
      const u = step / 5;
      const y = THREE.MathUtils.lerp(splitY, penTipY, u);
      const uOgive = Math.max(
        0,
        Math.min(1, (y - bearingTopY) / Math.max(0.1, oalH - bearingTopY))
      );
      const r =
        step === 5
          ? 0
          : Math.max(0.015, Math.min(rCoreMax, ogiveRadiusAt(uOgive) - jacketT * 1.04));
      penPts.push(new THREE.Vector2(r, y));
    }
    penetratorGeo = buildRevolvedCutaway(penPts, 30, cutaway);

    const rearPts: THREE.Vector2[] = [
      new THREE.Vector2(0, bulletBaseY + 0.01),
      new THREE.Vector2(
        Math.max(0.025, rBullet * 0.8 - jacketT * 1.05),
        bulletBaseY + 0.01
      ),
      new THREE.Vector2(rCoreMax * 0.98, bulletBaseY + boatTailH),
      new THREE.Vector2(Math.min(rCoreMax * 0.98, rAtSplit), splitY - 0.005),
      new THREE.Vector2(0, splitY - 0.005),
    ];
    coreSlugGeo = buildRevolvedCutaway(rearPts, 30, cutaway);
  } else {
    const coreTopY = isJhp
      ? oalH - projLen * 0.35
      : isJsp
        ? oalH
        : isOtm
          ? oalH - projLen * 0.19
          : oalH - jacketT * 1.85;
    const slugPts: THREE.Vector2[] = [
      new THREE.Vector2(0, bulletBaseY + (isJhp || isJsp ? jacketT * 1.05 : 0.01)),
      new THREE.Vector2(
        Math.max(0.03, rBullet * 0.8 - jacketT * 1.05),
        bulletBaseY + (isJhp || isJsp ? jacketT * 1.05 : 0.01)
      ),
      new THREE.Vector2(rCoreMax * 0.98, bulletBaseY + boatTailH),
      new THREE.Vector2(rCoreMax * 0.98, Math.min(bearingTopY, coreTopY)),
    ];
    if (coreTopY > bearingTopY) {
      for (let step = 1; step <= 5; step++) {
        const u = step / 5;
        const y = THREE.MathUtils.lerp(bearingTopY, coreTopY, u);
        const uOgive = Math.min(
          1,
          (y - bearingTopY) / Math.max(0.1, oalH - bearingTopY)
        );
        const r =
          step === 5 && !isJhp && !isJsp
            ? 0
            : Math.max(0.02, ogiveRadiusAt(uOgive) - (isJsp && step === 5 ? 0 : jacketT * 1.06));
        slugPts.push(
          new THREE.Vector2(
            isJhp && step === 5 ? r * 0.38 : isJsp && step === 5 ? rBullet * 0.36 : r,
            y
          )
        );
      }
    }
    slugPts.push(new THREE.Vector2(0, coreTopY));
    coreSlugGeo = buildRevolvedCutaway(slugPts, 30, cutaway);
  }

  const bundle: CartridgeCutawayMeshBundle = {
    caseGeo,
    primerCupGeo,
    anvilGeo,
    propellantGeo,
    jacketGeo,
    penetratorGeo,
    coreSlugGeo,
  };
  cutawayCache.set(key, bundle);
  return bundle;
}
