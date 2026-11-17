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

export const CARTRIDGE_LAB_ORDER: readonly CaliberProfile[] = [
  '9mm_para',
  '57_28',
  '50_ae',
  '762_m43',
  '556_nato',
  '338_lapua',
  '50_bmg',
];

export function isCaliberProfile(
  val: string | null | undefined
): val is CaliberProfile {
  return (
    typeof val === 'string' &&
    (CARTRIDGE_LAB_ORDER as readonly string[]).includes(val)
  );
}

export type ProjectileCoreKind =
  | 'fmj_lead'
  | 'ap_steel_alu'
  | 'jhp_cavity'
  | 'steel_core_lead_shirt'
  | 'dual_core_penetrator'
  | 'otm_scenar'
  | 'm33_heavy_steel';

export interface CartridgeLabSpec {
  caliber: CaliberProfile;
  code: string;
  standard: 'SAAMI' | 'CIP' | 'NATO STANAG';
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

export const CARTRIDGE_LAB_SPECS: Readonly<
  Record<CaliberProfile, CartridgeLabSpec>
> = {
  '9mm_para': {
    caliber: '9mm_para',
    code: '9×19mm',
    standard: 'NATO STANAG',
    nameZh: '9×19mm 帕拉贝鲁姆手枪弹',
    nameEn: '9×19mm Parabellum (NATO M882)',
    loadSubtitleZh: '124 格令全被甲圆头铅芯弹（FMJ-RN）',
    loadSubtitleEn: '124 gr Full Metal Jacket Round-Nose',
    representativeWeapons: ['g17', 'mp5', 'p320'],
    primaryWeaponId: 'g17',
    lineupXCm: -15.0,
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
    lineupXCm: -10.8,
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
    lineupXCm: -6.2,
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
    lineupXCm: -1.4,
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
    representativeWeapons: ['m4a1', 'scar', 'aug'],
    primaryWeaponId: 'm4a1',
    lineupXCm: 3.2,
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
    lineupXCm: 8.6,
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
    lineupXCm: 15.2,
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
};

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

/**
 * Generates exact 1:1 SAAMI/CIP standing geometries (`1 unit = 1 cm = 10 mm`)
 * for any of the 7 calibers in either longitudinal cutaway (`true`) or full (`false`) mode.
 */
export function getCartridgeLabMeshBundle(
  caliber: CaliberProfile,
  cutaway: boolean
): CartridgeCutawayMeshBundle {
  const key = `${caliber}|${cutaway ? 'cut' : 'full'}`;
  const cached = cutawayCache.get(key);
  if (cached) return cached;

  const s = CARTRIDGE_LAB_SPECS[caliber];
  const caseH = s.caseLengthMm / 10;
  const oalH = s.oalMm / 10;
  const rRim = s.rimDiameterMm / 20;
  const rBase = s.baseDiameterMm / 20;
  const rNeck = s.neckDiameterMm / 20;
  const rBullet = s.bulletDiameterMm / 20;
  const rimT = s.rimThicknessMm / 10;

  const pocketR = Math.min(rRim * 0.44, caliber === '50_bmg' ? 0.41 : 0.265);
  const pocketH = Math.min(caseH * 0.14, caliber === '50_bmg' ? 0.34 : 0.21);
  const flashHoleR = Math.max(0.042, pocketR * 0.28);
  const webFloorY = pocketH + Math.max(0.11, caseH * 0.065);
  const wallBaseT = Math.max(0.045, (rBase - rBullet) * 0.42);
  const wallMouthT = Math.max(0.026, (rNeck - rBullet) * 0.92);
  const rInnerBase = Math.max(flashHoleR + 0.05, rBase - wallBaseT);
  const rInnerMouth = Math.max(flashHoleR + 0.04, rNeck - wallMouthT);

  const grooveR = Math.min(rRim, rBase) * 0.855;
  const grooveTopY = rimT + Math.max(0.11, rimT * 0.95);
  const webRampTopY = grooveTopY + Math.max(0.08, rimT * 0.65);

  const isBottleneck = s.shoulderDiameterMm !== null;
  const rShoulder = isBottleneck ? s.shoulderDiameterMm! / 20 : rNeck;
  const shoulderStartY = isBottleneck ? caseH * 0.74 : caseH * 0.82;
  const neckStartY = isBottleneck ? caseH * 0.86 : caseH * 0.9;

  // 1. Drawn Brass Case Wall (closed meridian loop excluding central flash hole `r = flashHoleR`)
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(pocketR, 0),
    new THREE.Vector2(rRim - 0.02, 0),
    new THREE.Vector2(rRim, 0.02),
    new THREE.Vector2(rRim, rimT),
    new THREE.Vector2(grooveR, rimT + 0.03),
    new THREE.Vector2(grooveR, grooveTopY),
    new THREE.Vector2(rBase, webRampTopY),
  ];

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

  casePts.push(
    new THREE.Vector2(rInnerBase, webFloorY + 0.08),
    new THREE.Vector2(flashHoleR, webFloorY),
    new THREE.Vector2(flashHoleR, pocketH),
    new THREE.Vector2(pocketR, pocketH)
  );

  const caseGeo = buildRevolvedCutaway(casePts, 40, cutaway);

  // 2. Nickel-Plated Boxer Primer Cup
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

  // 4. Granular Smokeless Propellant Charge Column
  const bulletSeatDepth = Math.min(
    (oalH - caseH) * 0.52,
    isBottleneck ? (caseH - neckStartY) * 1.18 : caseH * 0.28
  );
  const bulletBaseY = caseH - bulletSeatDepth;
  const powderMaxTopY = Math.max(webFloorY + 0.18, bulletBaseY - 0.03);
  const powderTopY =
    webFloorY + (powderMaxTopY - webFloorY) * s.propellantFillRatio;

  const propPts: THREE.Vector2[] = [
    new THREE.Vector2(0, webFloorY + 0.006),
    new THREE.Vector2(flashHoleR, webFloorY + 0.006),
    new THREE.Vector2(rInnerBase - 0.008, webFloorY + 0.085),
  ];
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
    s.coreKind === 'm33_heavy_steel';

  const boatTailH =
    s.coreKind === 'fmj_lead' || isJhp ? projLen * 0.06 : projLen * 0.16;
  const bearingTopY = caseH + projLen * 0.12;

  // Outer ogive helper
  const ogiveRadiusAt = (u01: number): number => {
    if (isJhp) {
      return rBullet * (1 - 0.44 * Math.pow(u01, 1.25));
    }
    if (s.coreKind === 'fmj_lead') {
      return rBullet * Math.sqrt(Math.max(0, 1 - Math.pow(u01, 1.85)));
    }
    // Spitzer secant ogive
    return rBullet * (1 - Math.pow(u01, 1.55));
  };

  const jacketPts: THREE.Vector2[] = [];
  if (isJhp) {
    // Open-mouth hollow-point jacket shell
    const cavityDepth = projLen * 0.34;
    const cavityFloorY = oalH - cavityDepth;
    const rMouthOuter = ogiveRadiusAt(1);
    const rMouthInner = rMouthOuter * 0.62;

    jacketPts.push(
      new THREE.Vector2(0, bulletBaseY),
      new THREE.Vector2(rBullet * 0.88, bulletBaseY),
      new THREE.Vector2(rBullet, bulletBaseY + boatTailH),
      new THREE.Vector2(rBullet, bearingTopY)
    );
    for (let step = 1; step <= 6; step++) {
      const u = step / 6;
      const y = THREE.MathUtils.lerp(bearingTopY, oalH, u);
      jacketPts.push(new THREE.Vector2(ogiveRadiusAt(u), y));
    }
    jacketPts.push(
      new THREE.Vector2(rMouthInner, oalH - 0.015),
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

  if (hasSteelPenetrator) {
    const splitY =
      s.coreKind === 'm33_heavy_steel' ||
      s.coreKind === 'steel_core_lead_shirt'
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
      : isOtm
        ? oalH - projLen * 0.19
        : oalH - jacketT * 1.85;
    const slugPts: THREE.Vector2[] = [
      new THREE.Vector2(0, bulletBaseY + (isJhp ? jacketT * 1.05 : 0.01)),
      new THREE.Vector2(
        Math.max(0.03, rBullet * 0.8 - jacketT * 1.05),
        bulletBaseY + (isJhp ? jacketT * 1.05 : 0.01)
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
          step === 5 && !isJhp
            ? 0
            : Math.max(0.02, ogiveRadiusAt(uOgive) - jacketT * 1.06);
        slugPts.push(new THREE.Vector2(isJhp && step === 5 ? r * 0.38 : r, y));
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
