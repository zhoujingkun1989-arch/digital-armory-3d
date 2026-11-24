import { getWeaponManifest } from '../../weapons/manifests';
import type { WeaponId } from '../../weapons/types';
import { WEAPON_ATTACHMENT_PROFILES } from '../attachments/attachmentSpecs';

// ============================================================================
// Digital Armory 3D — 34-Exhibit Barrel Rifling & Chamber Throat Registry
// ----------------------------------------------------------------------------
// Pure, DOM-free, Three.js-free engineering specifications & world-space bore
// geometry derivation (1 world unit = 1 cm = 10 mm · +X muzzle, +Y up, +Z right).
// ============================================================================

export type RiflingKind = 'cut_rifled' | 'polygonal' | 'smoothbore' | 'none';
export type RiflingTwistDirection = 'RH' | 'LH' | 'none';

export interface WeaponRiflingSpec {
  weaponId: WeaponId;
  kind: RiflingKind;
  /** Number of lands/grooves (or polygonal flats); `0` for smoothbore & archery */
  grooves: number;
  /** Twist rate in inches per turn (`0` for smoothbore & archery) */
  twistInches: number;
  /** Twist rate in millimeters per turn (`0` for smoothbore & archery) */
  twistMm: number;
  direction: RiflingTwistDirection;
  /** Nominal bore / groove diameter in mm (`0` for archery) */
  boreDiameterMm: number;
  /** Hard-chrome lined bore interior (mirror silver vs darkened ordnance steel) */
  chromeLined: boolean;
  labelEn: string;
  labelZh: string;
}

export interface RiflingBoreBounds {
  weaponId: WeaponId;
  /** World-space X coordinate (cm) where rifled bore / forcing cone begins ahead of chamber throat */
  startX: number;
  /** World-space X coordinate (cm) safely inset behind muzzle crown / muzzle device */
  endX: number;
  /** Total rendered bore sleeve length (`endX - startX`, cm) */
  lengthCm: number;
  /** Exact world-space bore centerline Y (cm) */
  boreY: number;
  /** Exact world-space bore centerline Z (cm) */
  boreZ: number;
  /** Scaled bore inner radius with 0.96× anti-z-fighting inset (cm) */
  boreRadiusCm: number;
  /** Chamber throat / leade chamfer length ahead of `startX` (cm) */
  throatLengthCm: number;
  /** Slightly wider chamber-mouth throat radius (cm) */
  throatRadiusCm: number;
  /** Number of helical rifling turns across `lengthCm` (0 for smoothbore) */
  turnsAlongBore: number;
}

const INCH_TO_MM = 25.4;

function defineRifling(
  spec: Omit<WeaponRiflingSpec, 'twistMm'> & { twistMm?: number }
): WeaponRiflingSpec {
  const twistMm =
    spec.twistMm ??
    (spec.twistInches > 0 ? Math.round(spec.twistInches * INCH_TO_MM) : 0);
  return {
    ...spec,
    twistMm,
  };
}

/**
 * Authoritative 34-exhibit barrel rifling registry:
 * - 2 `none` (archery: `lift33`, `r500`)
 * - 3 `polygonal` (`g17`, `deagle`, `mp5`)
 * - 5 `smoothbore` (`benellim4`, `rem870`, `ztz99a`, `m1a2`, `leopard2a7`)
 * - 24 `cut_rifled` (remaining firearms + `tiger1` 32-groove 88mm + `gau8` 9-groove 30mm)
 */
export const WEAPON_RIFLING_SPECS: Readonly<
  Record<WeaponId, WeaponRiflingSpec>
> = {
  // --- Polygonal Rifling (3 exhibits) ---
  g17: defineRifling({
    weaponId: 'g17',
    kind: 'polygonal',
    grooves: 6,
    twistInches: 9.84,
    twistMm: 250,
    direction: 'RH',
    boreDiameterMm: 9.0,
    chromeLined: false,
    labelEn: '6-Sided Hexagonal Polygonal · 1:9.84" (250 mm) RH · Tenifer Steel',
    labelZh: '6 边正六角形多边形膛线 · 1:9.84" (250 mm) 右旋 · 氮碳共渗钢',
  }),
  deagle: defineRifling({
    weaponId: 'deagle',
    kind: 'polygonal',
    grooves: 6,
    twistInches: 19.0,
    twistMm: 483,
    direction: 'RH',
    boreDiameterMm: 12.7,
    chromeLined: false,
    labelEn: '6-Sided Polygonal · 1:19" (483 mm) RH · Cold Hammer-Forged .50 AE',
    labelZh: '6 边多边形膛线 · 1:19" (483 mm) 右旋 · .50 AE 冷锻固定重管',
  }),
  mp5: defineRifling({
    weaponId: 'mp5',
    kind: 'polygonal',
    grooves: 6,
    twistInches: 9.84,
    twistMm: 250,
    direction: 'RH',
    boreDiameterMm: 9.0,
    chromeLined: true,
    labelEn: '6-Groove Polygonal · 1:9.84" (250 mm) RH · Fluted Chamber Chrome Bore',
    labelZh: '6 槽多边形膛线 · 1:9.84" (250 mm) 右旋 · 12 槽浮膛镀铬枪管',
  }),

  // --- Hard-Chrome Smoothbore (5 exhibits) ---
  benellim4: defineRifling({
    weaponId: 'benellim4',
    kind: 'smoothbore',
    grooves: 0,
    twistInches: 0,
    twistMm: 0,
    direction: 'none',
    boreDiameterMm: 18.5,
    chromeLined: true,
    labelEn: '12-Gauge Smoothbore + Forcing Cone · Hard-Chrome Lined Bore',
    labelZh: '12 号战术滑膛 + 锥形坡口 · 镜面硬铬内膛',
  }),
  rem870: defineRifling({
    weaponId: 'rem870',
    kind: 'smoothbore',
    grooves: 0,
    twistInches: 0,
    twistMm: 0,
    direction: 'none',
    boreDiameterMm: 18.5,
    chromeLined: true,
    labelEn: '12-Gauge Cylinder Smoothbore + Long Forcing Cone · Honed Chrome Bore',
    labelZh: '12 号直筒滑膛 + 过渡坡口 · 珩磨镀铬内膛',
  }),
  ztz99a: defineRifling({
    weaponId: 'ztz99a',
    kind: 'smoothbore',
    grooves: 0,
    twistInches: 0,
    twistMm: 0,
    direction: 'none',
    boreDiameterMm: 125.0,
    chromeLined: true,
    labelEn: '125mm ZPT-98 L/50 Smoothbore · Autofrettaged Hard-Chrome Liner',
    labelZh: '125mm ZPT-98 50 倍径滑膛主炮 · 自紧身管全膛镀铬内壁',
  }),
  m1a2: defineRifling({
    weaponId: 'm1a2',
    kind: 'smoothbore',
    grooves: 0,
    twistInches: 0,
    twistMm: 0,
    direction: 'none',
    boreDiameterMm: 120.0,
    chromeLined: true,
    labelEn: '120mm M256 L/44 Smoothbore · Chrome-Plated High-Pressure Tube',
    labelZh: '120mm M256 44 倍径滑膛主炮 · 高压镀铬身管内膛',
  }),
  leopard2a7: defineRifling({
    weaponId: 'leopard2a7',
    kind: 'smoothbore',
    grooves: 0,
    twistInches: 0,
    twistMm: 0,
    direction: 'none',
    boreDiameterMm: 120.0,
    chromeLined: true,
    labelEn: '120mm Rh-120 L/55A1 Smoothbore · ESR Hard-Chrome Lined Bore',
    labelZh: '120mm Rh-120 L/55A1 55 倍径滑膛炮 · 电渣重熔镀铬内膛',
  }),

  // --- Archery (2 exhibits: no firearm barrel) ---
  lift33: defineRifling({
    weaponId: 'lift33',
    kind: 'none',
    grooves: 0,
    twistInches: 0,
    twistMm: 0,
    direction: 'none',
    boreDiameterMm: 0,
    chromeLined: false,
    labelEn: 'Unbarreled Compound Bow · Open Drop-Away Arrow Rest',
    labelZh: '无枪管复合弓 · 下落式开放箭台导向',
  }),
  r500: defineRifling({
    weaponId: 'r500',
    kind: 'none',
    grooves: 0,
    twistInches: 0,
    twistMm: 0,
    direction: 'none',
    boreDiameterMm: 0,
    chromeLined: false,
    labelEn: 'Unbarreled Helical-Cam Crossbow · Frictionless Trac-Trigger Flight Track',
    labelZh: '无枪管螺旋凸轮复合弩 · 零摩擦悬浮箭轨',
  }),

  // --- Cut / Button / Cold Hammer-Forged Rifled Barrels (24 exhibits) ---
  ak15: defineRifling({
    weaponId: 'ak15',
    kind: 'cut_rifled',
    grooves: 4,
    twistInches: 7.87,
    twistMm: 200,
    direction: 'RH',
    boreDiameterMm: 7.62,
    chromeLined: true,
    labelEn: '4-Groove Cold Hammer-Forged · 1:7.87" (200 mm) RH · Chrome-Lined',
    labelZh: '4 条冷锻右旋膛线 · 缠距 1:7.87" (200 mm) · 内膛镀铬',
  }),
  m4a1: defineRifling({
    weaponId: 'm4a1',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 7.0,
    twistMm: 178,
    direction: 'RH',
    boreDiameterMm: 5.56,
    chromeLined: true,
    labelEn: '6-Groove Mil-Spec Button-Rifled · 1:7" (178 mm) RH · Chrome-Lined',
    labelZh: '6 条北约制式拉削膛线 · 缠距 1:7" (178 mm) 右旋 · 内膛镀铬',
  }),
  m82a1: defineRifling({
    weaponId: 'm82a1',
    kind: 'cut_rifled',
    grooves: 8,
    twistInches: 15.0,
    twistMm: 381,
    direction: 'RH',
    boreDiameterMm: 12.7,
    chromeLined: true,
    labelEn: '8-Groove Heavy Fluted .50 BMG · 1:15" (381 mm) RH · Chrome-Lined',
    labelZh: '8 条重型凹槽反器材膛线 · 缠距 1:15" (381 mm) 右旋 · 镀铬内膛',
  }),
  awm: defineRifling({
    weaponId: 'awm',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 11.0,
    twistMm: 279,
    direction: 'RH',
    boreDiameterMm: 8.58,
    chromeLined: false,
    labelEn: '6-Groove Match Cut-Rifled · 1:11" (279 mm) RH · Free-Floating Stainless',
    labelZh: '6 条比赛级切削膛线 · 缠距 1:11" (279 mm) 右旋 · 浮置不锈钢重管',
  }),
  scar: defineRifling({
    weaponId: 'scar',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 7.0,
    twistMm: 178,
    direction: 'RH',
    boreDiameterMm: 5.56,
    chromeLined: true,
    labelEn: '6-Groove FN Cold Hammer-Forged · 1:7" (178 mm) RH · Chrome-Lined',
    labelZh: '6 条 FN 冷锻重型膛线 · 缠距 1:7" (178 mm) 右旋 · 镀铬内膛',
  }),
  aug: defineRifling({
    weaponId: 'aug',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 9.0,
    twistMm: 229,
    direction: 'RH',
    boreDiameterMm: 5.56,
    chromeLined: true,
    labelEn: '6-Groove Steyr Cold Hammer-Forged · 1:9" (229 mm) RH · Quick-Change Chrome',
    labelZh: '6 条斯太尔冷锻膛线 · 缠距 1:9" (229 mm) 右旋 · 快拆镀铬枪管',
  }),
  p320: defineRifling({
    weaponId: 'p320',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 10.0,
    twistMm: 254,
    direction: 'RH',
    boreDiameterMm: 9.0,
    chromeLined: false,
    labelEn: '6-Groove Traditional Cut-Rifled · 1:10" (254 mm) RH · Carbon Steel',
    labelZh: '6 条传统切削膛线 · 缠距 1:10" (254 mm) 右旋 · 氮化碳钢枪管',
  }),
  p90: defineRifling({
    weaponId: 'p90',
    kind: 'cut_rifled',
    grooves: 8,
    twistInches: 9.1,
    twistMm: 231,
    direction: 'RH',
    boreDiameterMm: 5.7,
    chromeLined: true,
    labelEn: '8-Groove Cold Hammer-Forged · 1:9.1" (231 mm) RH · Chrome-Lined 5.7mm',
    labelZh: '8 条冷锻高旋膛线 · 缠距 1:9.1" (231 mm) 右旋 · 5.7mm 镀铬膛',
  }),
  python: defineRifling({
    weaponId: 'python',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 14.0,
    twistMm: 356,
    direction: 'LH',
    boreDiameterMm: 9.07,
    chromeLined: false,
    labelEn: '6-Groove Colt Recessed-Crown Cut-Rifled · 1:14" (356 mm) LH · Honed Steel',
    labelZh: '6 条柯尔特精磨左旋膛线 · 缠距 1:14" (356 mm) 左旋 · 锥形强力坡口',
  }),
  garand: defineRifling({
    weaponId: 'garand',
    kind: 'cut_rifled',
    grooves: 4,
    twistInches: 10.0,
    twistMm: 254,
    direction: 'RH',
    boreDiameterMm: 7.62,
    chromeLined: false,
    labelEn: '4-Groove Springfield Cut-Rifled · 1:10" (254 mm) RH · Ordnance Steel',
    labelZh: '4 条春田兵工厂切削膛线 · 缠距 1:10" (254 mm) 右旋 · 军工钢膛',
  }),
  m249: defineRifling({
    weaponId: 'm249',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 7.0,
    twistMm: 178,
    direction: 'RH',
    boreDiameterMm: 5.56,
    chromeLined: true,
    labelEn: '6-Groove Heavy Machine-Gun Bore · 1:7" (178 mm) RH · Stellite/Chrome-Lined',
    labelZh: '6 条重型快拆机枪膛线 · 缠距 1:7" (178 mm) 右旋 · 镀铬内膛',
  }),
  p08: defineRifling({
    weaponId: 'p08',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 9.84,
    twistMm: 250,
    direction: 'RH',
    boreDiameterMm: 9.0,
    chromeLined: false,
    labelEn: '6-Groove DWM Cut-Rifled · 1:9.84" (250 mm) RH · Blued Ordnance Steel',
    labelZh: '6 条 DWM 传统切削膛线 · 缠距 1:9.84" (250 mm) 右旋 · 发蓝军工钢',
  }),
  vector: defineRifling({
    weaponId: 'vector',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 16.0,
    twistMm: 406,
    direction: 'RH',
    boreDiameterMm: 11.43,
    chromeLined: false,
    labelEn: '6-Groove Button-Rifled · 1:16" (406 mm) RH · 4140 Nitride .45 ACP',
    labelZh: '6 条挤锻膛线 · 缠距 1:16" (406 mm) 右旋 · 4140 氮化 .45 枪管',
  }),
  g11: defineRifling({
    weaponId: 'g11',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 6.1,
    twistMm: 155,
    direction: 'RH',
    boreDiameterMm: 4.73,
    chromeLined: true,
    labelEn: '6-Groove High-Spin Cold-Forged · 1:6.1" (155 mm) RH · 4.73mm Caseless',
    labelZh: '6 条高转速冷锻膛线 · 缠距 1:6.1" (155 mm) 右旋 · 4.73mm 无壳膛',
  }),
  vss: defineRifling({
    weaponId: 'vss',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 8.27,
    twistMm: 210,
    direction: 'RH',
    boreDiameterMm: 9.0,
    chromeLined: true,
    labelEn: '6-Groove Ported Subsonic Bore · 1:8.27" (210 mm) RH · Chrome-Lined 9x39mm',
    labelZh: '6 条微声多孔泄压膛线 · 缠距 1:8.27" (210 mm) 右旋 · 9×39 镀铬管',
  }),
  m134: defineRifling({
    weaponId: 'm134',
    kind: 'cut_rifled',
    grooves: 4,
    twistInches: 10.0,
    twistMm: 254,
    direction: 'RH',
    boreDiameterMm: 7.62,
    chromeLined: true,
    labelEn: '4-Groove 6-Barrel Rotary Cluster · 1:10" (254 mm) RH · Stellite-Lined 7.62',
    labelZh: '4 条六管转管机枪膛线 · 缠距 1:10" (254 mm) 右旋 · 司太立合金衬膛',
  }),
  an94: defineRifling({
    weaponId: 'an94',
    kind: 'cut_rifled',
    grooves: 4,
    twistInches: 7.87,
    twistMm: 200,
    direction: 'RH',
    boreDiameterMm: 5.45,
    chromeLined: true,
    labelEn: '4-Groove Floating Recoil Bore · 1:7.87" (200 mm) RH · Chrome-Lined 5.45mm',
    labelZh: '4 条浮动枪管膛线 · 缠距 1:7.87" (200 mm) 右旋 · 5.45mm 镀铬内膛',
  }),
  winchester1894: defineRifling({
    weaponId: 'winchester1894',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 12.0,
    twistMm: 305,
    direction: 'RH',
    boreDiameterMm: 7.62,
    chromeLined: false,
    labelEn: '6-Groove Classic Cut-Rifled · 1:12" (305 mm) RH · Nickel-Steel .30-30',
    labelZh: '6 条经典切削膛线 · 缠距 1:12" (305 mm) 右旋 · .30-30 镍钢枪管',
  }),
  m1911: defineRifling({
    weaponId: 'm1911',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 16.0,
    twistMm: 406,
    direction: 'LH',
    boreDiameterMm: 11.43,
    chromeLined: false,
    labelEn: '6-Groove Colt Browning Cut-Rifled · 1:16" (406 mm) LH · Forged Ordnance Steel',
    labelZh: '6 条勃朗宁/柯尔特原厂左旋膛线 · 缠距 1:16" (406 mm) 左旋 · 锻钢内膛',
  }),
  mg42: defineRifling({
    weaponId: 'mg42',
    kind: 'cut_rifled',
    grooves: 4,
    twistInches: 9.45,
    twistMm: 240,
    direction: 'RH',
    boreDiameterMm: 7.92,
    chromeLined: true,
    labelEn: '4-Groove Cold Hammer-Forged Quick-Change · 1:9.45" (240 mm) RH · 7.92mm',
    labelZh: '4 条冷锻快拆重机枪膛线 · 缠距 1:9.45" (240 mm) 右旋 · 7.92mm 镀铬',
  }),
  k98k: defineRifling({
    weaponId: 'k98k',
    kind: 'cut_rifled',
    grooves: 4,
    twistInches: 9.45,
    twistMm: 240,
    direction: 'RH',
    boreDiameterMm: 7.92,
    chromeLined: false,
    labelEn: '4-Groove Mauser Cut-Rifled · 1:9.45" (240 mm) RH · Krupp Ordnance Steel',
    labelZh: '4 条毛瑟传统拉削膛线 · 缠距 1:9.45" (240 mm) 右旋 · 克虏伯军工钢',
  }),
  thompson: defineRifling({
    weaponId: 'thompson',
    kind: 'cut_rifled',
    grooves: 6,
    twistInches: 16.0,
    twistMm: 406,
    direction: 'RH',
    boreDiameterMm: 11.43,
    chromeLined: false,
    labelEn: '6-Groove Finned-Barrel Cut-Rifled · 1:16" (406 mm) RH · .45 ACP Ordnance Steel',
    labelZh: '6 条散热鳍片重管切削膛线 · 缠距 1:16" (406 mm) 右旋 · .45 ACP 钢膛',
  }),
  tiger1: defineRifling({
    weaponId: 'tiger1',
    kind: 'cut_rifled',
    grooves: 32,
    twistInches: 28.0,
    twistMm: 711,
    direction: 'RH',
    boreDiameterMm: 88.0,
    chromeLined: false,
    labelEn: '32-Groove Progressive Rifled 88mm KwK 36 L/56 · 1:28" (711 mm) RH',
    labelZh: '32 条渐速右旋线膛 88mm KwK 36 L/56 主炮 · 缠距 1:28" (711 mm)',
  }),
  gau8: defineRifling({
    weaponId: 'gau8',
    kind: 'cut_rifled',
    grooves: 9,
    twistInches: 39.4,
    twistMm: 1000,
    direction: 'RH',
    boreDiameterMm: 30.0,
    chromeLined: true,
    labelEn: '9-Groove 30mm 7-Barrel Rotary Cannon · 1:39.4" (1,000 mm) RH · Chrome-Lined',
    labelZh: '9 条 30mm 七管航炮膛线 · 缠距 1:39.4" (1,000 mm) 右旋 · 镀铬内膛',
  }),
};

export function getWeaponRiflingSpec(weaponId: WeaponId): WeaponRiflingSpec {
  return WEAPON_RIFLING_SPECS[weaponId];
}

/**
 * Deterministic texture cache key shared across exhibits with identical visual
 * rifling cross-section `(kind, grooves, direction, chromeLined)`.
 */
export function getRiflingTextureSignatureKey(
  spec: Readonly<WeaponRiflingSpec>
): string {
  return `${spec.kind}:${spec.grooves}:${spec.direction}:${spec.chromeLined ? 'chrome' : 'steel'}`;
}

/**
 * Derives exact world-space longitudinal bore sleeve coordinates (`startX..endX`,
 * `boreY`, `boreZ`, `boreRadiusCm`) from `WEAPON_MANIFESTS` + `WEAPON_ATTACHMENT_PROFILES`
 * so the half-cylinder rifling liner sits strictly inside the barrel interior and
 * never protrudes past the muzzle crown, muzzle brake slots, or outer barrel walls.
 *
 * Returns `null` for unbarreled archery exhibits (`lift33`, `r500`).
 */
export function computeRiflingBoreBounds(
  weaponId: WeaponId
): RiflingBoreBounds | null {
  const spec = WEAPON_RIFLING_SPECS[weaponId];
  if (!spec || spec.kind === 'none' || spec.boreDiameterMm <= 0) {
    return null;
  }

  const manifest = getWeaponManifest(weaponId);
  const meta = manifest.workbenchMeta;
  const att = WEAPON_ATTACHMENT_PROFILES[weaponId];
  const modelScale = att.modelScale;
  const isTank = meta.scaleProfile === 'main_battle_tank';
  const isGau8 = weaponId === 'gau8';

  const chamberX = meta.chamberGlowPos[0];
  const chamberY = meta.chamberGlowPos[1];
  const chamberZ = meta.chamberGlowPos[2];

  // Multi-barrel clusters (`gau8`, `m134`) & non-threaded barrels use exact firing-barrel `chamberGlowPos[1]`;
  // threaded small arms align strictly with verified `muzzleAnchor[1]` (which matches `chamberGlowPos[1]`).
  const boreY = att.muzzleAnchor ? att.muzzleAnchor[1] : chamberY;
  const boreZ = att.muzzleAnchor ? att.muzzleAnchor[2] : chamberZ;

  // Stop strictly before factory muzzle brakes/flash-hiders/suppressor baffles:
  // - Threaded exhibits: `min(muzzlePos[0], muzzleAnchor[0])`
  // - `vss`: 200mm ported rifled barrel terminates inside integral 414mm suppressor tube before the 6-stage baffle stack
  // - `tiger1`: 88mm KwK 36 twin-baffle brake spans the forward ~62 cm ahead of the rifled tube
  let barrelCrownX = att.muzzleAnchor
    ? Math.min(meta.muzzlePos[0], att.muzzleAnchor[0])
    : meta.muzzlePos[0];
  if (weaponId === 'vss') {
    barrelCrownX = chamberX + (meta.muzzlePos[0] - chamberX) * 0.48;
  } else if (weaponId === 'tiger1') {
    barrelCrownX = meta.muzzlePos[0] - 62.0;
  }

  // Exact scaled bore radius (mm -> cm via *0.05) with 0.96x anti-z-fighting clearance inset
  const boreRadiusCm = spec.boreDiameterMm * 0.05 * modelScale * 0.96;

  const rawSpan = Math.max(0.5, barrelCrownX - chamberX);
  const defaultThroatMargin =
    weaponId === 'python'
      ? 3.2 // Clears 6-shot revolving cylinder gap to start right at the barrel forcing cone
      : isTank
        ? Math.min(rawSpan * 0.14, Math.max(26, boreRadiusCm * 4.2))
        : isGau8
          ? Math.min(rawSpan * 0.12, Math.max(16, boreRadiusCm * 8.0))
          : Math.min(rawSpan * 0.22, Math.max(0.75 * modelScale, boreRadiusCm * 3.0));

  const crownMargin = isTank
    ? 8.0
    : isGau8
      ? 4.5
      : Math.max(0.14, 0.22 * modelScale);

  const startX = chamberX + defaultThroatMargin;
  const endX = Math.max(startX + (isTank ? 20 : 1.0), barrelCrownX - crownMargin);
  const lengthCm = endX - startX;

  const throatLengthCm = Math.min(
    lengthCm * 0.16,
    Math.max(boreRadiusCm * 1.4, isTank ? 18 : isGau8 ? 6 : 0.45 * modelScale)
  );
  const throatRadiusCm = boreRadiusCm * 1.055;

  // Helical turns across visible bore length (using scaled twist length in CAD units)
  const twistCmScaled =
    spec.twistMm > 0 ? (spec.twistMm / 10) * modelScale : 0;
  const turnsAlongBore =
    twistCmScaled > 0 ? Math.max(0.25, lengthCm / twistCmScaled) : 0;

  return {
    weaponId,
    startX,
    endX,
    lengthCm,
    boreY,
    boreZ,
    boreRadiusCm,
    throatLengthCm,
    throatRadiusCm,
    turnsAlongBore,
  };
}
