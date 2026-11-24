import {
  computeGasPortUncoverF,
  computePeakPressureF,
  computeSafeUnlockF,
  createInternalBallisticsSample,
  DEFAULT_FIRING_TIMING,
  evaluateInternalBallisticsInto,
  getCaliberBallisticsSpec,
  getWeaponFiringTiming,
  isArcheryCaliber,
  isArcheryWeapon,
  type WeaponFiringTiming,
} from '../../engine/physics/armoryPhysics';
import {
  getLocalizedCatalogSpecs,
  getLocalizedShortWeaponLabel,
  resolveWeaponDisplayMeta,
} from '../../i18n/weaponFallbacks';
import type { LanguageCode } from '../../narration/types';
import { ARMORY_WEAPONS, getWeaponManifest } from '../../weapons/manifests';
import { isWeaponId, type CaliberProfile } from '../../weapons/types';

// ============================================================================
// WP-11 · Mechanism Showdown — 3-Axis Mechanical Lineage & A-vs-B Quantitative
// Comparison Engine (Scales Seamlessly from 13 -> 16+ Vault Exhibits)
// ============================================================================

export type TaxonomyAxisId = 'drive' | 'locking' | 'feed';

export type DriveFamilyId =
  | 'long_stroke_piston'
  | 'short_stroke_piston'
  | 'direct_impingement'
  | 'short_recoil_barrel'
  | 'delayed_or_straight_blowback'
  | 'external_electric_rotary'
  | 'manual_bolt_or_revolver_linkage'
  | 'compound_cam_elastic'
  | 'hydro_pneumatic_cannon_recoil';

export type LockingFamilyId =
  | 'rotating_lug_bolt'
  | 'rotary_cylindrical_breech'
  | 'tilting_barrel_cam'
  | 'toggle_knee_joint'
  | 'super_v_off_axis_cam'
  | 'roller_or_mass_blowback'
  | 'cylinder_notch_ratchet'
  | 'cam_letoff_or_adf_sled'
  | 'sliding_wedge_breech';

export type FeedFamilyId =
  | 'staggered_box_magazine'
  | 'disintegrating_belt_shuttle'
  | 'overhead_caseless_rammer'
  | 'top_helical_90deg'
  | 'swing_out_cylinder'
  | 'underbarrel_tubular_elevator'
  | 'top_enbloc_clip'
  | 'drop_away_or_flight_track'
  | 'autoloader_carousel_or_blast_bustle';

export type AnyMechanismFamilyId =
  DriveFamilyId | LockingFamilyId | FeedFamilyId;

export interface BilingualText {
  zh: string;
  en: string;
}

export interface TaxonomyAxisMeta {
  id: TaxonomyAxisId;
  code: string;
  title: BilingualText;
  subtitle: BilingualText;
}

export interface MechanismFamilySeed<TId extends string = string> {
  id: TId;
  axis: TaxonomyAxisId;
  accentHex: string;
  badge: BilingualText;
  title: BilingualText;
  principle: BilingualText;
  pros: BilingualText;
  cons: BilingualText;
}

export interface LocalizedMechanismFamily {
  id: AnyMechanismFamilyId;
  axis: TaxonomyAxisId;
  accentHex: string;
  badge: string;
  title: string;
  principle: string;
  pros: string;
  cons: string;
  exhibitIds: string[];
}

export interface FallbackExhibitCatalogSeed {
  bayCode: string;
  modelCode: string;
  shortLabel: BilingualText;
  fullName: BilingualText;
  originTag: BilingualText;
  caliber: BilingualText;
  compactCaliber: BilingualText;
  caliberProfileFallback: CaliberProfile;
  isArchery: boolean;
  peakLoadValue: number;
  peakLoadFormatted: BilingualText;
  standardLabel: string;
  muzzleVelocityMps: number;
  projectileMassG: number;
  overallLengthMm: number;
  barrelOrStrokeMm: number;
  emptyWeightKg: number;
  partsCount: number;
  cyclicRateRpm: number | null;
  rateOfFireDisplay: BilingualText;
  timing: WeaponFiringTiming;
}

export interface ShowdownExhibitClassification {
  id: string;
  driveFamily: DriveFamilyId;
  lockingFamily: LockingFamilyId;
  feedFamily: FeedFamilyId;
  driveDetail: BilingualText;
  lockingDetail: BilingualText;
  feedDetail: BilingualText;
  fireControlDetail: BilingualText;
  signatureAdvantage: BilingualText;
  engineeringTradeoff: BilingualText;
  /** Pre-populated fallback metadata for Wave-2 exhibits (`python`, `benellim4`, `garand`) prior to manifest registration */
  fallbackCatalog?: FallbackExhibitCatalogSeed;
}

export interface ShowdownExhibitProfile {
  id: string;
  bayCode: string;
  modelCode: string;
  shortLabel: string;
  fullName: string;
  originTag: string;
  caliberLabel: string;
  compactCaliber: string;
  available: boolean;
  isArchery: boolean;
  driveFamily: DriveFamilyId;
  lockingFamily: LockingFamilyId;
  feedFamily: FeedFamilyId;
  driveFamilyTitle: string;
  driveFamilyBadge: string;
  lockingFamilyTitle: string;
  lockingFamilyBadge: string;
  feedFamilyTitle: string;
  feedFamilyBadge: string;
  driveDetail: string;
  lockingDetail: string;
  feedDetail: string;
  fireControlDetail: string;
  signatureAdvantage: string;
  engineeringTradeoff: string;
  /** Peak chamber pressure in MPa (firearms) or peak draw force in Newtons (archery) */
  peakLoadValue: number;
  peakLoadUnit: 'MPa' | 'N';
  peakLoadFormatted: string;
  standardLabel: string;
  muzzleVelocityMps: number;
  muzzleEnergyJ: number;
  projectileMassG: number;
  overallLengthMm: number;
  barrelOrStrokeMm: number;
  emptyWeightKg: number;
  partsCount: number;
  cyclicRateRpm: number | null;
  rateOfFireDisplay: string;
  timing: {
    ignitionF: number;
    peakF: number;
    muzzleExitF: number;
    safeUnlockF: number;
    ejectF: number;
    batteryF: number;
    gasPortUncoverF: number | null;
  };
}

export interface ClassicRivalrySeed {
  id: string;
  weaponA: string;
  weaponB: string;
  pillLabel: BilingualText;
  headline: BilingualText;
  verdict: BilingualText;
}

export interface LocalizedClassicRivalry {
  id: string;
  weaponA: string;
  weaponB: string;
  pillLabel: string;
  headline: string;
  verdict: string;
}

export interface ShowdownCurvePoint {
  f: number;
  pressure01: number;
  pressureRaw: number;
  velocity01: number;
  velocityMps: number;
  energyJ: number;
}

export type ShowdownChartScaleMode = 'normalized' | 'relative';

export interface ShowdownChartMarker {
  f: number;
  x: number;
  y: number;
  valueFormatted: string;
}

export interface ShowdownSvgTraceGeometry {
  pressureLinePath: string;
  pressureAreaPath: string;
  velocityLinePath: string;
  peakMarker: ShowdownChartMarker;
  muzzleExitX: number;
  points: readonly ShowdownCurvePoint[];
}

export interface ShowdownDualSvgGeometry {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  effectiveScaleMode: ShowdownChartScaleMode;
  crossDomain: boolean;
  traceA: ShowdownSvgTraceGeometry;
  traceB: ShowdownSvgTraceGeometry;
}

// ----------------------------------------------------------------------------
// 1. Canonical 3-Axis Mechanical Taxonomy Metadata
// ----------------------------------------------------------------------------

export const MECHANISM_TAXONOMY_AXES: readonly TaxonomyAxisMeta[] = [
  {
    id: 'drive',
    code: 'AXIS 01',
    title: {
      zh: '能量来源与自动机驱动流派',
      en: 'Energy Source & Operating Drive',
    },
    subtitle: {
      zh: '火药燃气导引、枪管短后坐动量守恒、外能源电驱转管、惯性后坐与复合凸轮弹性势能的机械分流',
      en: 'How propellant gas, barrel recoil, external electric motors, bolt inertia, or cam-limb strain drives the cycle',
    },
  },
  {
    id: 'locking',
    code: 'AXIS 02',
    title: {
      zh: '弹膛闭锁与释放泄压机构',
      en: 'Breech Locking & Release Mechanism',
    },
    subtitle: {
      zh: '在数千大气压膛压峰值下锁死弹底或 90° 无壳旋转弹膛，待残压降至安全窗口后精确解锁的几何约束',
      en: 'Geometric constraints sealing high-pressure ignition or 90-deg caseless chambers before safe residual unlock',
    },
  },
  {
    id: 'feed',
    code: 'AXIS 03',
    title: {
      zh: '弹药供输与空间排布架构',
      en: 'Ammunition Feed & Spatial Packaging',
    },
    subtitle: {
      zh: '盒式双排、可散弹链脱链、顶置无壳压弹、90° 螺旋旋转、侧摆转轮、管仓升降托弹板、顶装漏夹与落箭轨道',
      en: 'Box mags, disintegrating belts, caseless rammers, 90-deg helical ramps, cylinders, tube elevators, clips & arrow rests',
    },
  },
];

export const DRIVE_FAMILIES: readonly MechanismFamilySeed<DriveFamilyId>[] = [
  {
    id: 'long_stroke_piston',
    axis: 'drive',
    accentHex: '#f59e0b',
    badge: {
      zh: '长行程活塞 · LONG-STROKE',
      en: 'LONG-STROKE PISTON',
    },
    title: {
      zh: '长行程导气活塞联动',
      en: 'Long-Stroke Gas Piston',
    },
    principle: {
      zh: '导气活塞与枪机框/拉柄刚性连接，随自动机走完全部后坐与复进行程，以大往复质量强力破除泥沙冰冻阻力。',
      en: 'Piston head is rigidly coupled to the bolt carrier or op-rod for the entire stroke, delivering high reciprocating momentum.',
    },
    pros: {
      zh: '抽壳推弹裕度极大，泥沙、严寒与积碳恶劣环境下极端可靠',
      en: 'Massive extraction/feeding margin; legendary reliability in mud, ice, and heavy fouling',
    },
    cons: {
      zh: '高重心往复质量较大，连发射击时枪口俯仰谐振较明显',
      en: 'Higher reciprocating mass shifts center of gravity during full-auto fire',
    },
  },
  {
    id: 'short_stroke_piston',
    axis: 'drive',
    accentHex: '#38bdf8',
    badge: {
      zh: '短行程活塞 · SHORT-STROKE',
      en: 'SHORT-STROKE PISTON',
    },
    title: {
      zh: '短行程导气活塞 / 自调双活塞',
      en: 'Short-Stroke Gas Piston / ARGO Twin',
    },
    principle: {
      zh: '活塞仅做数毫米至十余毫米瞬态冲击即将动量传递给枪机框，随后提前截断燃气并独立复位，兼顾洁净机匣与平顺后坐。',
      en: 'Tappet piston travels only a few millimeters to impart a sharp impulse to the carrier before venting gas forward.',
    },
    pros: {
      zh: '高温火药残渣隔离在导气箍前端，机匣冷洁且往复冲击柔和',
      en: 'Isolates heat and carbon away from the receiver while keeping carrier impulse crisp',
    },
    cons: {
      zh: '前端增加导气塞、活塞与复位簧零件，护木前端质量略增',
      en: 'Adds forward gas block, tappet, and return spring parts ahead of the chamber',
    },
  },
  {
    id: 'direct_impingement',
    axis: 'drive',
    accentHex: '#22d3ee',
    badge: {
      zh: '斯通纳气吹 · DIRECT GAS',
      en: 'STONER DIRECT IMPINGEMENT',
    },
    title: {
      zh: '斯通纳气吹直喷内活塞 (DI)',
      en: 'Direct Gas Impingement (Internal Piston)',
    },
    principle: {
      zh: '不锈钢导气管将高压燃气直接导入枪机框气匙，以枪机框内腔与枪机气环构成同轴膨胀气室驱动开锁。',
      en: 'A slender gas tube pipes propellant gas through the carrier key into an internal expansion chamber concentric with the bore.',
    },
    pros: {
      zh: '零偏心活塞力矩、往复件最轻、枪管自由谐振精度极佳',
      en: 'Zero off-axis piston torque, minimum reciprocating mass, and superb inline accuracy',
    },
    cons: {
      zh: '高温含碳燃气直接排入机匣枪机区，需更频密清洁润滑',
      en: 'Vents hot carbon-laden propellant gas directly into the bolt carrier group',
    },
  },
  {
    id: 'short_recoil_barrel',
    axis: 'drive',
    accentHex: '#fb7185',
    badge: {
      zh: '枪管短后坐 · SHORT-RECOIL',
      en: 'SHORT-RECOIL BARREL',
    },
    title: {
      zh: '枪管短后坐能量耦合',
      en: 'Short-Recoil Moving Barrel',
    },
    principle: {
      zh: '无需导气孔，击发瞬间枪管与套筒/枪机锁死共同后坐数毫米分担后坐冲量，随后经斜槽或加速子分离解锁。',
      en: 'Barrel and breech recoil locked together for a short travel before camming or accelerating the bolt open—zero gas tap needed.',
    },
    pros: {
      zh: '省去导气管路，天然适配紧凑手枪套筒及大口径反器材缓冲',
      en: 'Eliminates gas plumbing; ideal for compact pistol slides and heavy .50 BMG recoil buffering',
    },
    cons: {
      zh: '活动枪管对枪口重型附件（如消音器）质量敏感，需复进调校',
      en: 'Moving barrel mass is sensitive to heavy muzzle suppressors without booster tuning',
    },
  },
  {
    id: 'delayed_or_straight_blowback',
    axis: 'drive',
    accentHex: '#a78bfa',
    badge: {
      zh: '延迟/自由枪机 · BLOWBACK',
      en: 'ROLLER-DELAYED / BLOWBACK',
    },
    title: {
      zh: '滚柱延迟 / 重型自由枪机后坐',
      en: 'Roller-Delayed & Straight Blowback',
    },
    principle: {
      zh: '固定枪管无导气机构，直接利用弹壳底部后推力克服枪机惯性或 1:4 滚柱机械减速比完成抽抛壳循环。',
      en: 'Fixed barrel with zero gas system; case-head thrust directly drives bolt inertia or 1:4 roller-wedge mechanical leverage.',
    },
    pros: {
      zh: '枪管刚性固连机匣首发精度高，结构紧凑适配冲锋枪/PDW',
      en: 'Rigidly fixed barrel maximizes accuracy inside ultra-compact SMG/PDW envelopes',
    },
    cons: {
      zh: '弹膛需开燃气浮置槽或限制膛压曲线，防止高压拔断弹壳',
      en: 'Requires fluted chambers or controlled case taper to prevent case-head rupture',
    },
  },
  {
    id: 'external_electric_rotary',
    axis: 'drive',
    accentHex: '#fb923c',
    badge: {
      zh: '外能源电驱转管 · ELECTRIC GATLING',
      en: 'EXTERNAL ELECTRIC ROTARY',
    },
    title: {
      zh: '28V 外能源电驱多管正弦凸轮旋转',
      en: '28V External Electric Multi-Barrel Rotary',
    },
    principle: {
      zh: '完全脱离火药燃气与后坐自驱限制，由 28V 直流航空电机驱动中心星形转子与六管簇匀速公转，沿 360° 静止正弦凸轮槽并行驱动六套枪机。',
      en: 'A 28V DC aerospace motor spins a central star-rotor and six barrels past a stationary 360-deg sinusoidal cam track, cycling six bolts in parallel.',
    },
    pros: {
      zh: '六管轮转风冷突破 3,000 RPM 持续火力极限，遇失效哑弹强制抽出抛出绝不卡停',
      en: 'Shares 3,000 RPM heat across six air-cooled barrels and ejects dud rounds with zero stoppage',
    },
    cons: {
      zh: '依赖载具/航空 28V 大电流电源与供弹脱链器，整机及电池全重远超步兵单兵携行极限',
      en: 'Requires heavy 28V vehicle/aircraft power buses and mounts, exceeding dismounted infantry weight',
    },
  },
  {
    id: 'manual_bolt_or_revolver_linkage',
    axis: 'drive',
    accentHex: '#34d399',
    badge: {
      zh: '人力栓动/转轮 · MANUAL / DA-SA',
      en: 'MANUAL BOLT / DA-SA LINKAGE',
    },
    title: {
      zh: '手动拉栓 / 双动转轮机械连杆',
      en: 'Manual Bolt-Action & DA/SA Clockwork',
    },
    principle: {
      zh: '完全由射手拉动枪机柄或扣动双动扳机经拨齿连杆驱动循环，击发瞬间零自动机运动质量干扰且不受哑弹卡壳中断。',
      en: 'Powered entirely by shooter bolt manipulation or trigger-hand clockwork—zero gas bleed or reciprocating disturbance during shot exit.',
    },
    pros: {
      zh: '100% 燃气能量集中推弹，弹药适应性无限，远射一致性登峰造极',
      en: '100% propellant energy stays behind the bullet; immune to gas-port ammo sensitivity',
    },
    cons: {
      zh: '射速受限于人机操作节奏，连续火力密度低于自动武器',
      en: 'Follow-up shot cadence is bounded by manual bolt throw or double-action trigger stroke',
    },
  },
  {
    id: 'compound_cam_elastic',
    axis: 'drive',
    accentHex: '#10b981',
    badge: {
      zh: '凸轮弹性储能 · CAM LIMB',
      en: 'COMPOUND CAM ELASTIC',
    },
    title: {
      zh: '偏心/螺旋凸轮弓片弹性势能',
      en: 'Compound Cam & Split-Limb Strain Storage',
    },
    principle: {
      zh: '零火药燃烧，通过人力或丝杠拉弦使四分体碳玻复合弓片弯曲蓄积弹性应变能，经同步偏心轮或 360° 螺旋轮变杠杆比做功。',
      en: 'Zero combustion: carbon-glass split limbs store elastic strain energy released through variable-ratio binary or 360° helical cams.',
    },
    pros: {
      zh: '无膛口焰与火药燃气特征，长做功行程平滑加速重型碳箭',
      en: 'Zero muzzle flash or propellant signature; long power stroke smoothly accelerates heavy arrows',
    },
    cons: {
      zh: '初速受制于弓弦材料声速极限，严禁无箭空放以免震裂弓片',
      en: 'Velocity bounded by string material wave speed; dry-firing risks catastrophic limb damage',
    },
  },
  {
    id: 'hydro_pneumatic_cannon_recoil',
    axis: 'drive',
    accentHex: '#d97706',
    badge: {
      zh: '主炮液压驻退 · CANNON RECOIL',
      en: 'HYDRO-PNEUMATIC CANNON',
    },
    title: {
      zh: '主战坦克主炮液压驻退复进 + 自动/人工装填',
      en: 'MBT Hydro-Pneumatic Cannon Recoil & Powerpack',
    },
    principle: {
      zh: '88–125mm 大口径坦克主炮经同轴液压驻退机与氮气复进机将 290–340 mm 巨型后坐能量耗散至 55–67 吨装甲车体，复进末端凸轮自动拉落炮闩抛壳。',
      en: '88-125mm tank cannons absorb 290-340 mm of megajoule recoil via concentric hydraulic brakes and pneumatic recuperators, camming the breech open on counter-recoil.',
    },
    pros: {
      zh: '驾驭 320–670 MPa 与 3–7.6 MJ 穿甲动能，兼顾 1,500 hp 动力包机动与全向稳定行进间射击',
      en: 'Harnesses 320-670 MPa and 3.0-7.6 MJ armor-piercing energy with stabilized fire-on-the-move capability',
    },
    cons: {
      zh: '55–67 吨战斗全重对桥梁通过性、战略空运及燃油/动力包后勤提出极限挑战',
      en: '55-67 tonne combat mass imposes immense bridge-loading, logistics, and powerpack demands',
    },
  },
];

export const LOCKING_FAMILIES: readonly MechanismFamilySeed<LockingFamilyId>[] =
  [
    {
      id: 'rotating_lug_bolt',
      axis: 'locking',
      accentHex: '#38bdf8',
      badge: {
        zh: '多突笋回转 · ROTATING BOLT',
        en: 'ROTATING LUG BOLT',
      },
      title: {
        zh: '双突笋 / 多突笋回转枪机闭锁',
        en: 'Multi-Lug / Dual-Lug Rotating Bolt',
      },
      principle: {
        zh: '枪机头部 2 至 7 个径向闭锁突笋旋入枪管节套闭锁槽，轴向刚性承接数百兆帕膛压，经螺旋凸轮槽延迟回转开锁。',
        en: 'Two to seven radial lugs on the bolt head rotate into barrel-extension recesses, sealing peak breech pressure axially.',
      },
      pros: {
        zh: '轴向对称刚性闭锁强度最高，胜任从 5.56 NATO 到 .50 BMG 高膛压',
        en: 'Highest axial lockup strength; scales cleanly from .50 AE pistols to .50 BMG rifles',
      },
      cons: {
        zh: '枪机头与节套需精密多轴铣削及配合间隙热处理控制',
        en: 'Demands precision multi-axis CNC machining of bolt lugs, cam pin, and barrel extension',
      },
    },
    {
      id: 'rotary_cylindrical_breech',
      axis: 'locking',
      accentHex: '#14b8a6',
      badge: {
        zh: '90°旋膛无壳闭锁 · ROTARY BREECH',
        en: '90-DEG ROTARY BREECH',
      },
      title: {
        zh: '90° 旋转镀铬圆柱无壳弹膛闭锁',
        en: '90-Deg Rotating Cylindrical Caseless Breech',
      },
      principle: {
        zh: '摒弃前后往复枪机与抽壳钩，由双齿条与瑞士钟表齿轮系驱动横向穿孔圆柱弹膛原地翻转 90° 垂直纳弹，再归平气密抵紧枪管击发。',
        en: 'Eliminates reciprocating bolts completely: gas racks and watchmaker spur gears rotate a transverse chrome cylinder 90 deg to load caseless blocks and align horizontally to fire.',
      },
      pros: {
        zh: '彻底消除黄铜抽抛壳往复行程，以 28 毫秒超短旋转循环解锁 2,100 RPM 三连发',
        en: 'Eliminates brass extraction and ejection travel, enabling 28 ms cycling at 2,100 RPM',
      },
      cons: {
        zh: '无弹壳带走废热对 HITP 高自燃药块与气密环耐磨提出极严苛要求，钟表齿轮系极其精密',
        en: 'Requires heat-resistant HITP caseless propellant, tight gas-seal rings, and intricate gear trains',
      },
    },
    {
      id: 'tilting_barrel_cam',
      axis: 'locking',
      accentHex: '#f59e0b',
      badge: {
        zh: '枪管偏移凸轮 · TILTING CAM',
        en: 'BROWNING TILTING CAM',
      },
      title: {
        zh: '勃朗宁矩形弹膛枪管偏移闭锁',
        en: 'Browning Tilting-Barrel Hood Cam',
      },
      principle: {
        zh: '方形弹膛节套直接嵌入套筒抛壳窗顶缘闭锁；共同后坐约 3 mm 泄压后，枪管下突笋沿开锁斜面下沉脱离套筒。',
        en: 'Squared barrel hood locks directly into the slide ejection port; after ~3 mm locked travel, an underlug ramp cams the breech down.',
      },
      pros: {
        zh: '零件极简、套筒截面紧凑轻薄，现代勤务半自动手枪黄金标准',
        en: 'Minimal part count and low bore axis; the universal standard for modern service pistols',
      },
      cons: {
        zh: '开锁下倾减小进弹坡角裕度，不适合超长步枪弹或超重枪管',
        en: 'Downward barrel tilt limits cartridge length and struggles with ultra-heavy magnum pressures',
      },
    },
    {
      id: 'toggle_knee_joint',
      axis: 'locking',
      accentHex: '#eab308',
      badge: {
        zh: '过死点肘节 · TOGGLE LOCK',
        en: 'KNEE-JOINT TOGGLE LOCK',
      },
      title: {
        zh: '鲁格过死点双连杆肘节屈伸闭锁',
        en: 'Over-Center Two-Link Knee-Joint Toggle',
      },
      principle: {
        zh: '前、后肘节连杆铰接中枢下沉至枪膛轴线以下 1.5 mm 过死点自锁；短后坐 7 mm 泄压后，肘节滚轮撞击机匣开锁斜坡向上折起 54° 完成抽抛壳。',
        en: 'Articulated front and rear toggle links rest 1.5 mm below dead-center to lock rigid; after 7 mm short recoil, frame ramps cam the knee joint 54° upward.',
      },
      pros: {
        zh: '枪管无上下倾斜纯直线后坐，握把重心靠后指向性极佳，机械运动极具钟表美感',
        en: 'Purely linear non-tilting barrel travel and natural pointability with clockwork mechanical elegance',
      },
      cons: {
        zh: '精密铰接销轴铣削工时昂贵，外露上折肘节在战壕泥浆中易受阻滞',
        en: 'Expensive hand-fitted link tolerances and exposed upward-folding toggle vulnerable to trench mud',
      },
    },
    {
      id: 'super_v_off_axis_cam',
      axis: 'locking',
      accentHex: '#ec4899',
      badge: {
        zh: '110°偏轴滑块 · SUPER V CAM',
        en: 'SUPER V 110° OFF-AXIS CAM',
      },
      title: {
        zh: 'KRISS Super V 110° 偏轴下沉滑块延迟',
        en: 'KRISS Super V 110° Off-Axis Cam-Delayed',
      },
      principle: {
        zh: '铰接枪机两侧凸轮耳嵌入重型配重滑块的变斜率曲线槽：初段近垂直机械死角提供闭锁延迟，随后驱动配重沿弹匣井后方 110° 导轨向斜下方俯冲抵消上跳。',
        en: 'Lateral bolt cam lugs ride variable-angle slots in an off-axis counterweight slider, delaying initial opening before redirecting recoil momentum 110° downward.',
      },
      pros: {
        zh: '配合低于虎口的枪管轴线，将 1,200 RPM .45 ACP 连发枪口上跳压制到近乎水平',
        en: 'Redirects high-impulse .45 ACP recoil downward below the firing hand for flat 1,200 RPM bursts',
      },
      cons: {
        zh: '弹匣井后方需容纳长行程垂直滑块腔，下机匣前后高度与横向体积增大',
        en: 'Requires a deep vertical slider housing behind the magwell, increasing lower-receiver bulk',
      },
    },
    {
      id: 'roller_or_mass_blowback',
      axis: 'locking',
      accentHex: '#a78bfa',
      badge: {
        zh: '滚柱延迟/惯性 · ROLLER / MASS',
        en: 'ROLLER-DELAY / INERTIA',
      },
      title: {
        zh: '双滚柱楔铁延迟 / 重枪机惯性闭锁',
        en: 'Roller-Delayed Wedge & Mass Blowback',
      },
      principle: {
        zh: '无刚性死锁闭锁笋，依靠双圆柱滚柱与 45° 闭锁楔铁 1:4 动量放大延迟，或重型枪机质量惯性在弹头出膛前限制后移。',
        en: 'Uses dual cylindrical rollers cammed against a 45° locking piece (1:4 ratio) or calibrated bolt mass to hold case support during bore transit.',
      },
      pros: {
        zh: '免除回转凸轮与上下偏移运动，闭膛直线往复极其顺滑',
        en: 'Eliminates bolt rotation and barrel tilting for ultra-fast linear cyclic smoothness',
      },
      cons: {
        zh: '无法直接承受全威力步枪弹长时间高压，滚柱闭锁间隙需塞尺校准',
        en: 'Bolt gap requires periodic feeler-gauge checks on roller systems; mass scales steeply with pressure',
      },
    },
    {
      id: 'cylinder_notch_ratchet',
      axis: 'locking',
      accentHex: '#fb7185',
      badge: {
        zh: '止转笋棘轮 · CYLINDER NOTCH',
        en: 'CYLINDER NOTCH & HAND',
      },
      title: {
        zh: '转轮止转笋凹槽与棘轮拨齿分度',
        en: 'Cylinder Bolt Notch & Ratchet Hand',
      },
      principle: {
        zh: '扣动扳机时止转笋先落下解锁，竖直拨齿推动六齿棘轮星盘精确旋转 60°，击锤落上前止转笋弹入定位槽锁死弹巢同轴。',
        en: 'Cylinder bolt drops to free the drum, the rising hand advances the 6-point ratchet star 60°, and the bolt snaps into the next notch before ignition.',
      },
      pros: {
        zh: '每发独立弹膛互不干涉，遇瞎火底火无需排障再扣即发下一弹',
        en: 'Six independent chambers; a dud primer requires zero clearing—just pull the trigger again',
      },
      cons: {
        zh: '弹巢与枪管尾锥间存在微米级泄气间隙，无法直接消音密闭',
        en: 'Barrel-cylinder gap vents high-pressure gas laterally and requires precise coaxial timing',
      },
    },
    {
      id: 'cam_letoff_or_adf_sled',
      axis: 'locking',
      accentHex: '#10b981',
      badge: {
        zh: '省力谷/悬浮钩 · LET-OFF / ADF',
        en: 'VALLEY LET-OFF / ADF SLED',
      },
      title: {
        zh: '双轮省力谷稳瞄 / 防空放悬浮阻铁滑台',
        en: 'Binary Let-Off Valley & ADF Trigger Sled',
      },
      principle: {
        zh: '复合弓以偏心轮几何在满拉末端骤降 85% 拉力形成稳瞄谷；复合弩以悬浮滑台弦钩与防空放互锁舌锁死 300 磅满弦。',
        en: 'Compound cams roll over into an 85% let-off valley at full draw, while crossbows lock 300 lb string tension on a floating Anti-Dry-Fire sled.',
      },
      pros: {
        zh: '高储能待击态下保持极轻释放力，防空放互锁杜绝无箭误击发',
        en: 'Crisp low-effort release under massive stored limb tension with mechanical dry-fire protection',
      },
      cons: {
        zh: '双轮同步正时与弦缆伸长需精密调校以保证箭尾直线离弦',
        en: 'Requires synchronized cam timing and cable-stretch maintenance for straight nock travel',
      },
    },
    {
      id: 'sliding_wedge_breech',
      axis: 'locking',
      accentHex: '#f97316',
      badge: {
        zh: '楔形滑闩闭锁 · SLIDING WEDGE',
        en: 'SLIDING-WEDGE BREECH',
      },
      title: {
        zh: '大口径锻钢立式 / 水平半自动楔形炮闩',
        en: 'Heavy Vertical / Horizontal Sliding-Wedge Breech',
      },
      principle: {
        zh: '厚重合金锻钢楔块沿炮尾垂直或水平滑槽紧锁弹膛后端，刚性承受 320–670 MPa 坦克主炮峰值膛压；复进到位自动滑开弹出金属底托或黄铜药筒，新弹入膛即瞬间自动闭合。',
        en: 'A massive forged alloy-steel wedge glides vertically or horizontally inside the breech ring to seal 320-670 MPa ignition, opening automatically on run-out to eject spent stubs.',
      },
      pros: {
        zh: '闭锁面积巨大且开启行程极短，天然适配半可燃药筒底托与高射速自动/人工推弹',
        en: 'Huge bearing surface with compact stroke, enabling fast semi-automatic stub ejection and rapid reloading',
      },
      cons: {
        zh: '锻钢炮尾环与楔闩质量达数百公斤，需高强液压驻退与大空间炮塔扫掠包络',
        en: 'Multi-hundred-kilogram breech ring demands generous turret sweep clearance and precision cradle alignment',
      },
    },
  ];

export const FEED_FAMILIES: readonly MechanismFamilySeed<FeedFamilyId>[] = [
  {
    id: 'staggered_box_magazine',
    axis: 'feed',
    accentHex: '#38bdf8',
    badge: {
      zh: '可拆盒式弹匣 · BOX MAG',
      en: 'DETACHABLE BOX MAG',
    },
    title: {
      zh: '可拆卸双排 / 单排盒式弹匣',
      en: 'Staggered / Single-Stack Box Magazine',
    },
    principle: {
      zh: '托弹簧与防倾托弹板将弹药自下而上顶至抱弹口，枪机复进时沿进弹坡道直线推弹入膛，打空后一秒更换满匣。',
      en: 'Spring-loaded follower presents cartridges vertically to feed lips so the returning bolt strips each round straight up the feed ramp.',
    },
    pros: {
      zh: '换弹速度最快、供弹路径最短，兼容有托与无托标准化战术携行',
      en: 'Fastest reload cycle and shortest feed path across pistols, carbines, bullpups, and sniper rifles',
    },
    cons: {
      zh: '高容量弹匣向下凸出增加卧姿火线高度，抱弹口变形易诱发双进弹',
      en: '30-round vertical magazines increase prone profile; bent feed lips cause double-feeds',
    },
  },
  {
    id: 'disintegrating_belt_shuttle',
    axis: 'feed',
    accentHex: '#84cc16',
    badge: {
      zh: '可散弹链供弹 · BELT / DELINKER',
      en: 'BELT SHUTTLE / DELINKER',
    },
    title: {
      zh: '可散金属弹链拨爪梭动 / 星轮强制脱链供弹',
      en: 'Disintegrating Belt Shuttle & Star-Wheel Delinker',
    },
    principle: {
      zh: '经受机盖 S 槽双拨爪横移 M27 钢链（辅以 STANAG 应急井）或由同步六瓣星轮脱链器以每秒 50 发极速剥离 M13 弹链送入转子。',
      en: 'Advances M27 links via top-cover S-cam dual pawls (plus emergency STANAG magwell) or strips M13 links at 50 rounds/sec through a gear-synced star-wheel delinker.',
    },
    pros: {
      zh: '支持 200 至数千发持续压制弹链供弹，彻底摆脱频繁换匣中断火力的限制',
      en: 'Sustains 200- to 4,000-round continuous belt fire without frequent magazine reload pauses',
    },
    cons: {
      zh: '重型弹链拖拽与高速脱链对拨齿、柔性输弹槽及驱动扭矩裕度提出极高机械要求',
      en: 'Heavy belt drag and extreme delinking speeds demand robust pawls, chutes, and drive torque',
    },
  },
  {
    id: 'overhead_caseless_rammer',
    axis: 'feed',
    accentHex: '#f97316',
    badge: {
      zh: '置顶无壳压弹 · CASELESS RAMMER',
      en: 'OVERHEAD CASELESS RAMMER',
    },
    title: {
      zh: '置顶 45 发水平无壳弹匣 + 垂直压弹冲头',
      en: 'Overhead 45-Rd Caseless Mag & Vertical Rammer',
    },
    principle: {
      zh: '45 发 8×8mm 方形无壳药块垂直朝下紧贴排布于枪管正上方水平弹匣，凸轮冲头在旋转弹膛转至 90° 时垂直下刺 26.5 mm 压弹入膛。',
      en: 'Forty-five rectangular 8x8mm caseless blocks stack nose-down parallel above the barrel; a vertical cam rammer plunges 26.5 mm to seat each round into the 90-deg rotary breech.',
    },
    pros: {
      zh: '方形药块 100% 密排零空隙，单匣 45 发零下凸且护木双备弹夹实现 135 发随枪携弹',
      en: 'Zero-void prismatic stacking packs 45 flush rounds above the bore (135 rounds with K2 clips)',
    },
    cons: {
      zh: '专用无壳方形药块完全无法兼容现役北约黄铜弹药后勤体系，哑弹需摇柄向下排出',
      en: 'Proprietary square caseless blocks are incompatible with NATO brass logistics; duds clear downward',
    },
  },
  {
    id: 'top_helical_90deg',
    axis: 'feed',
    accentHex: '#f59e0b',
    badge: {
      zh: '顶置90°螺旋 · HELICAL 90°',
      en: 'TOP 90° HELICAL RAMP',
    },
    title: {
      zh: '置顶水平弹匣 + 90° 螺旋旋转坡道',
      en: 'Top Horizontal Mag + 90° Helical Ramp',
    },
    principle: {
      zh: '50 发弹药与枪管垂直横向平铺于枪脊半透明匣内，尾端专利双阶螺旋坡道在托弹推力下将每发弹顺时针旋转 90° 对准枪膛。',
      en: 'Fifty cartridges lie sideways flat atop the receiver and rotate 90° clockwise through a twin-stage helical ramp into chamber alignment.',
    },
    pros: {
      zh: '零下凸轮廓实现 50 发超大容弹量与底部垂直向下全对称抛壳',
      en: 'Packs 50 rounds with zero downward protrusion and enables downward ambidextrous ejection',
    },
    cons: {
      zh: '仅适配直筒/微锥短弹壳，螺旋转换通道几何公差要求极为苛刻',
      en: 'Demands low-friction straight-tapered cases and tight polycarbonate ramp tolerances',
    },
  },
  {
    id: 'swing_out_cylinder',
    axis: 'feed',
    accentHex: '#fb7185',
    badge: {
      zh: '侧摆六巢转轮 · REVOLVING CYL',
      en: 'SWING-OUT CYLINDER',
    },
    title: {
      zh: '侧摆式六巢旋转弹巢与星形退壳杆',
      en: 'Swing-Out 6-Chamber Cylinder & Star',
    },
    principle: {
      zh: '6 发凸缘弹直接装入旋转弹巢独立弹膛，无托弹簧推弹过程；卸弹时鹤臂向左摆出，按压前退壳杆同时顶出全部空弹壳。',
      en: 'Six rimmed cartridges sit pre-chambered in a rotating drum; swinging the crane left exposes the ejector rod for simultaneous extraction.',
    },
    pros: {
      zh: '彻底根除弹匣弹簧疲劳与进弹坡卡弹，兼容任意弹头外形与装药量',
      en: 'Zero feed-ramp jams or spring set; cycles light target loads to heavy magnum hollow-points alike',
    },
    cons: {
      zh: '6 发容弹量有限，即便配合快速装弹器换弹仍慢于盒式弹匣',
      en: 'Six-round capacity ceiling and slower reloads compared to detachable box magazines',
    },
  },
  {
    id: 'underbarrel_tubular_elevator',
    axis: 'feed',
    accentHex: '#22d3ee',
    badge: {
      zh: '管仓升降托板 · TUBE + CARRIER',
      en: 'TUBULAR MAG + ELEVATOR',
    },
    title: {
      zh: '枪管下置管式弹仓 + 升降托弹板',
      en: 'Underbarrel Tubular Mag & Carrier Elevator',
    },
    principle: {
      zh: '霰弹首尾相接纵列于枪管下方钢制管仓内，射击中可随时从机匣底口补弹；止弹器释放单发滑上托弹板并上抬对准枪膛。',
      en: 'Shells stack nose-to-tail in an underbarrel steel tube, releasing one hull onto a pivoting elevator tongue that lifts it to bore line.',
    },
    pros: {
      zh: '贴合枪管轮廓无下凸弹匣，支持边打边补（Top-Off）与特种弹切换',
      en: 'Flush low-profile silhouette allowing combat top-off loading and instant slug select-load',
    },
    cons: {
      zh: '随弹药消耗前端重心逐渐后移，管内纵列布局不宜裸露尖头中心发火弹',
      en: 'Forward balance shifts as shells fire, and slow single-shell loading takes practice',
    },
  },
  {
    id: 'top_enbloc_clip',
    axis: 'feed',
    accentHex: '#eab308',
    badge: {
      zh: '顶装8发漏夹 · EN-BLOC CLIP',
      en: '8-RD EN-BLOC AUTO-EJECT',
    },
    title: {
      zh: '顶装 8 发钢制漏夹 + 末发自动弹射',
      en: 'Top-Loaded 8-Rd En-Bloc Auto-Ejecting Clip',
    },
    principle: {
      zh: '8 发全威力步枪弹连同冲压弹簧钢漏夹从机匣顶部整体压入内置弹仓，复进簧连杆驱动托弹臂上推，第 8 发抛壳瞬间自动弹出空漏夹。',
      en: 'An 8-round spring-steel clip locks whole inside the receiver; follower-arm leverage feeds rounds upward and auto-ejects the empty clip on shot 8.',
    },
    pros: {
      zh: '机匣底部完全齐平极利卧射拼刺，整夹顶压装填迅捷且轻量化',
      en: 'Flush belly profile ideal for prone fire, ultra-light stamped clips, and fast thumb-press reloads',
    },
    cons: {
      zh: '容弹量固定 8 发且中途补弹繁琐，空夹弹出伴随清脆金属鸣响',
      en: 'Fixed 8-round capacity, awkward partial top-offs, and audible metallic ping on clip ejection',
    },
  },
  {
    id: 'drop_away_or_flight_track',
    axis: 'feed',
    accentHex: '#10b981',
    badge: {
      zh: '落箭台/悬浮轨 · REST / TRACK',
      en: 'DROP-AWAY / ZERO-RAIL',
    },
    title: {
      zh: '联动落箭台 / 零摩擦全悬浮箭道',
      en: 'Drop-Away Launcher & Frictionless Flight Track',
    },
    principle: {
      zh: '长杆碳纤维箭矢尾羽扣入弓弦 D 环或滑台防空放口，击发瞬间落箭台叉舌高速翻落或箭体悬空飞离，实现 360° 零刮擦出箭。',
      en: 'Full-length carbon arrows nock directly onto string D-loops or floating sled latches, clearing drop-away forks with zero rail drag.',
    },
    pros: {
      zh: '尾羽零接触消除了导轨摩擦热损耗与横向扰动，能量转化率极高',
      en: 'Zero fletching contact or rail friction losses, preserving long-range broadhead accuracy',
    },
    cons: {
      zh: '单发前装搭箭，箭尾扣合未到底将触发防空放锁死或跳弦风险',
      en: 'Single-projectile manual nocking; incomplete nock seating engages Anti-Dry-Fire lockout',
    },
  },
  {
    id: 'autoloader_carousel_or_blast_bustle',
    axis: 'feed',
    accentHex: '#f59e0b',
    badge: {
      zh: '转盘自装/隔爆尾舱 · CAROUSEL / BUSTLE',
      en: 'CAROUSEL / BLAST BUSTLE',
    },
    title: {
      zh: '底置转盘自动装弹机 / 隔爆防爆门尾舱弹架',
      en: 'Hull Carousel Autoloader / Blast-Door Turret Bustle',
    },
    principle: {
      zh: '重型主炮弹药分为三大装甲供输流派：车体底部 22 发分装旋转弹盘与提升链式推弹机（ZTZ-99A）、装甲防爆滑门加泄压顶板隔离的整装尾舱（M1A2 / 豹 2A7V），以及二战侧舷全周弹药架（虎式）。',
      en: 'Heavy tank rounds stow in 22-round hull-floor carousel autoloaders (ZTZ-99A), armored blast-door turret bustles with roof blow-off panels (M1A2 / Leopard 2A7V), or WWII sponson panniers (Tiger I).',
    },
    pros: {
      zh: '转盘自装缩减车体高度与乘员至 3 人且行进间射速恒定；隔爆尾舱将殉爆火焰安全导向车外保乘员生还',
      en: 'Carousel autoloaders cut crew to 3 and silhouette height; blast-door bustles vent ammo cook-offs safely upward away from crew',
    },
    cons: {
      zh: '底置转盘限制穿甲弹杆长；隔爆尾舱需第 4 名装填手且拉长炮塔外形',
      en: 'Carousel geometry constrains dart length; manual bustle racks require a fourth crewman and lengthen the turret',
    },
  },
];

const DRIVE_FAMILY_MAP: Readonly<
  Record<DriveFamilyId, MechanismFamilySeed<DriveFamilyId>>
> = Object.fromEntries(DRIVE_FAMILIES.map((f) => [f.id, f])) as Record<
  DriveFamilyId,
  MechanismFamilySeed<DriveFamilyId>
>;

const LOCKING_FAMILY_MAP: Readonly<
  Record<LockingFamilyId, MechanismFamilySeed<LockingFamilyId>>
> = Object.fromEntries(LOCKING_FAMILIES.map((f) => [f.id, f])) as Record<
  LockingFamilyId,
  MechanismFamilySeed<LockingFamilyId>
>;

const FEED_FAMILY_MAP: Readonly<
  Record<FeedFamilyId, MechanismFamilySeed<FeedFamilyId>>
> = Object.fromEntries(FEED_FAMILIES.map((f) => [f.id, f])) as Record<
  FeedFamilyId,
  MechanismFamilySeed<FeedFamilyId>
>;

// ----------------------------------------------------------------------------
// 2. Per-Exhibit Mechanical Classification Registry (13 Live + 3 Wave-2 Ready)
// ----------------------------------------------------------------------------

function makeWave2Timing(
  ignitionF: number,
  muzzleExitF: number,
  ejectF: number,
  batteryF: number,
  gasPortTravel: number | null
): WeaponFiringTiming {
  return {
    ...DEFAULT_FIRING_TIMING,
    ignitionF,
    muzzleExitF,
    ejectF,
    batteryF,
    gasPortTravel,
  };
}

export const SHOWDOWN_EXHIBIT_SPECS: Readonly<
  Record<string, ShowdownExhibitClassification>
> = {
  ak15: {
    id: 'ak15',
    driveFamily: 'long_stroke_piston',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '90° 导气箍分流火药燃气冲击连体长行程镀铬活塞杆，与大质量枪机框一体走完整个后坐与复进循环。',
      en: '90° gas block taps bore gas against a chrome-lined piston rod rigidly pinned to the heavy bolt carrier throughout full travel.',
    },
    lockingDetail: {
      zh: '枪机框自由行程泄压后，螺旋曲线槽驱动大尺寸双闭锁突笋逆时针旋转 35° 脱离前节套。',
      en: 'After free-travel blowdown safety delay, the carrier cam slot rotates two massive locking lugs 35° out of the front trunnion.',
    },
    feedDetail: {
      zh: '前挂后卡式 30 发大弧度透明余弹窗聚合物双排双进弹匣，适应 7.62×39mm 强锥度弹壳顺畅上膛。',
      en: 'Rock-and-lock 30-round windowed curved polymer magazine engineered around the steep taper of 7.62×39mm brass/steel cases.',
    },
    fireControlDetail: {
      zh: '经典双钩回转击锤 + 单发断连器 + 不到位保险阻铁，配 2023 型双侧拇指快慢机（保险/连发/单发）。',
      en: ' Twin-hook rotary hammer, semi disconnector, and out-of-battery auto sear paired with Obr. 2023 ambidextrous thumb selector.',
    },
    signatureAdvantage: {
      zh: '超大过载裕度与锥度抽壳力，在泥浆、严寒结冰与重度积碳下依旧稳定循环',
      en: 'Unmatched over-gassed extraction authority in mud, arctic ice, and extreme fouling',
    },
    engineeringTradeoff: {
      zh: '活塞连杆往复质量偏高，连发点射时枪口上跳冲量大于同级气吹步枪',
      en: 'Heavy reciprocating piston-carrier assembly increases full-auto muzzle climb',
    },
  },
  m4a1: {
    id: 'm4a1',
    driveFamily: 'direct_impingement',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '斯通纳气吹直喷（DI）：准星座导气孔经不锈钢细管将燃气导入气匙，在枪机框内腔膨胀后推机框并向前撑住枪机。',
      en: 'Stoner Direct Impingement pipes gas via a stainless tube through the staked carrier key into an internal expansion chamber behind the bolt.',
    },
    lockingDetail: {
      zh: '横插凸轮销沿机框斜槽导引七突笋加一抽壳笋回转 22.5° 解锁，全部后坐力沿枪管-缓冲管同轴直线传递。',
      en: 'Cam pin guides a 7-lug star bolt through a short 22.5° rotation inside the barrel extension along a pure inline recoil axis.',
    },
    feedDetail: {
      zh: '直插式井口配 30 发 STANAG 双排双进铝/聚合物弹匣，结合 M4 加深双进弹坡道保障高速卡宾供弹。',
      en: 'Flared straight magwell accepting 30-round STANAG magazines assisted by deepened M4 dual-cut receiver feed ramps.',
    },
    fireControlDetail: {
      zh: '铝下机匣内置回转击锤、单发断连器与连发阻铁，三档快慢机旋转 90°/180° 切换 SAFE / SEMI / AUTO。',
      en: 'Forged lower houses rotary hammer, disconnector, and auto sear with 90°/180° thumb selector across SAFE / SEMI / AUTO.',
    },
    signatureAdvantage: {
      zh: '枪管至尾托缓冲管完全同轴且往复质量极轻，连发可控性与首发精度极高',
      en: 'Pure coaxial bore-to-buffer line and minimal reciprocating mass yield flat recoil',
    },
    engineeringTradeoff: {
      zh: '火药残渣随燃气吹入枪机框内腔，高射频作战下对润滑油膜保持要求更高',
      en: 'Propellant carbon vents directly into the bolt carrier group requiring regular lubrication',
    },
  },
  mp5: {
    id: 'mp5',
    driveFamily: 'delayed_or_straight_blowback',
    lockingFamily: 'roller_or_mass_blowback',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '无导气固定枪管，9×19mm 弹壳底部燃气推力直接作用于枪机头，弹膛内壁 12 条纵向浮置槽平衡内外壁气压防粘壳。',
      en: 'Gasless fixed barrel with 12 longitudinal chamber flutes floating the brass case on gas film while breech thrust drives the bolt.',
    },
    lockingDetail: {
      zh: '两侧对称圆柱滚柱受节套凹槽挤压向内收拢，迫使 45° 闭锁楔铁以 4 倍速推动重型机框后退，实现精确延迟开锁。',
      en: 'Dual cylindrical rollers cam inward against a 45° locking piece, accelerating the heavy carrier at a 4:1 ratio to delay bolt face opening.',
    },
    feedDetail: {
      zh: '30 发弯弧冲压钢双排双进弹匣，配左侧非随动拉机柄卡槽（经典 HK-Slap 拍柄上膛）。',
      en: '30-round curved stamped-steel magazine paired with a forward non-reciprocating cocking tube and HK-Slap lock notch.',
    },
    fireControlDetail: {
      zh: '闭膛待击模块化聚合物握把火控盒，内置回转击锤与滚轮阻铁，红白子弹图标双侧快慢机。',
      en: 'Closed-bolt modular Navy trigger pack with rotary hammer, roller sear, and ambidextrous pictogram selector.',
    },
    signatureAdvantage: {
      zh: '闭膛击发配合固定冷锻枪管与 1:4 滚柱缓冲，创下冲锋枪首发散布标杆',
      en: 'Closed-bolt fixed barrel and 1:4 roller delay deliver rifle-like first-round precision',
    },
    engineeringTradeoff: {
      zh: '冲压机匣焊接与闭锁楔滚柱配对工艺复杂，且无空仓挂机机构',
      en: 'Complex stamped-trunnion welding, headspace roller sizing, and no last-round bolt catch',
    },
  },
  g17: {
    id: 'g17',
    driveFamily: 'short_recoil_barrel',
    lockingFamily: 'tilting_barrel_cam',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '氮化钢套筒与冷锻枪管在击发后锁死共同后坐约 3 mm，待 9×19mm 弹头离膛泄压后再分离。',
      en: 'Tenifer slide and cold-hammer-forged barrel recoil locked together for ~3 mm until the 9×19mm bullet clears the muzzle.',
    },
    lockingDetail: {
      zh: '矩形弹膛节套顶面直锁抛壳窗，枪管下方闭锁突笋撞击机匣开锁块斜面，拉动枪管尾端下倾开锁。',
      en: 'Rectangular barrel hood locks into the ejection port before the underlug cams down against the steel locking block.',
    },
    feedDetail: {
      zh: '钢衬聚合物双排单进 17 发弹匣垂直插入握把井，紧凑锥形收口直对一体进弹坡。',
      en: 'Steel-lined polymer 17-round double-stack single-feed magazine seated inside the grip frame right beneath the integral ramp.',
    },
    fireControlDetail: {
      zh: 'Safe Action 半待击平移击针：扣扳机同时完成补压与释放，集成扳机舌、击针阻铁柱与跌落防走火槽三重被动保险。',
      en: 'Safe Action half-cocked striker finishes cocking during trigger pull, guarded by trigger tab, firing-pin plunger, and drop shelf.',
    },
    signatureAdvantage: {
      zh: '极低枪膛轴线抑制枪口上跳，全枪仅 28 组简洁节点且无需手动外保险',
      en: 'Ultra-low bore axis tames muzzle flip with triple passive safeties and minimal parts',
    },
    engineeringTradeoff: {
      zh: '握把座即法定序列号机匣不可自由换壳，半待击扳机行程断点略带弹性感',
      en: 'Serialized polymer frame cannot swap grip sizes; half-cocked striker yields a rolling trigger break',
    },
  },
  m82a1: {
    id: 'm82a1',
    driveFamily: 'short_recoil_barrel',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '29 英寸重型开槽枪管整体浮动后坐约 25 mm，双室后掠箭头制退器反向喷射燃气削减约 65% 后坐冲量。',
      en: '29-inch fluted barrel recoils ~25 mm against dual return springs while the arrowhead tank brake vents gas rearward to cut ~65% recoil.',
    },
    lockingDetail: {
      zh: '枪管延伸节后退撞击铰接加速子杠杆，放大推动枪机框并通过凸轮销旋开三突笋重型枪机。',
      en: 'Recoiling barrel extension strikes a pivoting accelerator arm that throws the carrier rearward, rotating the 3-lug bolt unlocked.',
    },
    feedDetail: {
      zh: '10 发双排双进 .50 BMG 加强筋冲压钢盒式弹匣，适应 138.4 mm 超长反器材枪弹供输。',
      en: '10-round ribbed stamped-steel double-stack box magazine feeding 138.4 mm .50 BMG cartridges.',
    },
    fireControlDetail: {
      zh: '下机匣内置AR构型风格线性击锤/击针联动组件与左侧拇指SAFE/SEMI旋转保险。',
      en: 'Sheet-steel lower receiver houses heavy sear/firing-pin linkage with AR-ergonomic thumb safety (SAFE / SEMI).',
    },
    signatureAdvantage: {
      zh: '将 15.5 千焦重机枪弹药驯服于单兵半自动肩射平台，具备极快远距补射能力',
      en: 'Tames 15.5 kJ .50 BMG energy into a shoulder-fired semi-auto platform for rapid follow-up shots',
    },
    engineeringTradeoff: {
      zh: '活动枪管复进定位公差与 13.5 kg 全重使其单发极限散布略逊于固定管栓动步枪',
      en: 'Recoiling barrel return tolerances and 13.5 kg mass trade sub-MOA benchrest precision for semi-auto firepower',
    },
  },
  awm: {
    id: 'awm',
    driveFamily: 'manual_bolt_or_revolver_linkage',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '纯人力旋转后拉栓动循环，27 英寸自由浮置比赛枪管刚性旋入胶合于 CNC 铝合金主梁的厚壁钢机匣。',
      en: 'Pure manual bolt throw; 27-inch free-floated match barrel threads into a flat-sided steel action epoxy-bonded to an aluminum chassis.',
    },
    lockingDetail: {
      zh: '前后双排共六枚闭锁突笋仅需抬柄旋转 60° 即可完全解闭锁，机身上铣有螺旋破冰排污槽。',
      en: 'Dual-row 6-lug bolt requires just a 60° handle lift to clear optics, machined with helical anti-icing flutes for -40°C reliability.',
    },
    feedDetail: {
      zh: '5 发可拆卸单排冲压钢盒式弹匣，精准托送 .338 Lapua Magnum 远射比赛弹同轴入膛。',
      en: '5-round detachable single-stack steel box magazine presenting .338 Lapua Magnum match cartridges coaxially.',
    },
    fireControlDetail: {
      zh: '两道火可调比赛级扳机阻铁 + 枪机尾端三档击针锁死拨片保险（锁死枪机与击针）。',
      en: 'Two-stage adjustable match trigger paired with a 3-position shroud safety that mechanically blocks the firing pin and bolt lift.',
    },
    signatureAdvantage: {
      zh: '零自动机振动干扰与全天候刚性铝梁底盘，1500 米极远距首发命中精度标杆',
      en: 'Zero reciprocating vibration and rigid aluminum spine deliver benchmark 1,500 m first-round cold-bore precision',
    },
    engineeringTradeoff: {
      zh: '每发需右手离握抬柄拉栓供弹，近中距突发多目标持续射速受限',
      en: 'Manual bolt cycling breaks firing-hand grip between shots, limiting rapid multi-target engagement',
    },
  },
  scar: {
    id: 'scar',
    driveFamily: 'short_stroke_piston',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '导气箍内不锈钢短行程套筒活塞仅冲击数毫米撞击整块矩形重枪机框，余气向前排出，上机匣保持低温洁净。',
      en: 'Stainless short-stroke tappet piston strikes the monolithic rectangular carrier over a few millimeters, venting excess gas forward.',
    },
    lockingDetail: {
      zh: '方砖机框沿一体挤压铝上机匣长导轨滑行，经凸轮销驱动七突笋枪机在快拆枪管节套内回转闭锁。',
      en: 'Monolithic carrier glides inside the extruded aluminum upper, camming a 7-lug rotating bolt into a 6-bolt quick-change barrel extension.',
    },
    feedDetail: {
      zh: '兼容北约标准 30 发 STANAG 双排双进盒式弹匣，配双侧弹匣释放钮与空仓挂机拍板。',
      en: 'Standard 30-round NATO STANAG double-stack box magazine with ambidextrous mag release and bolt catch.',
    },
    fireControlDetail: {
      zh: '聚合物下机匣容纳回转击锤火控组与 45°/90° 双侧快慢机，折叠枪托折向右侧仍可应急射击。',
      en: 'Polymer lower module houses rotary hammer FCG with ambidextrous selector; side-folding stock clears ejection to fire folded.',
    },
    signatureAdvantage: {
      zh: '一体铝挤全通导轨零点稳固，短活塞极耐消音器背压且支持跨口径快拆换管',
      en: 'Monolithic upper holds optic zero rigidly while the regulator tappet runs cleanly suppressed',
    },
    engineeringTradeoff: {
      zh: '经典 Mk 16 随动拉机柄往复运动需注意弱手握持位置以免干涉闭锁',
      en: 'Reciprocating charging handle on Mk 16 requires mindful support-hand thumb placement',
    },
  },
  deagle: {
    id: 'deagle',
    driveFamily: 'short_stroke_piston',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '弹膛前方膛底导气孔引气进入枪管下方气室，推动前置短活塞向后撞击敞顶桥式套筒两侧翼板。',
      en: 'A bore port just ahead of the chamber vents gas into an under-barrel cylinder, driving a short piston against the open-top bridge slide.',
    },
    lockingDetail: {
      zh: '颠覆手枪管退传统：6 英寸三角形枪管刚性固定不后坐，套筒凸轮槽驱动步枪级四突笋枪机回转闭锁。',
      en: 'Fixed 6-inch triangular barrel stays stationary while the reciprocating bridge slide cams a rifle-style 4-lug rotating bolt.',
    },
    feedDetail: {
      zh: '7 发单排厚壁钢制盒式弹匣容纳直径达 13.0 mm 的 .50 AE 大威力无凸缘手枪弹。',
      en: '7-round single-stack steel box magazine housing massive 13.0 mm diameter .50 Action Express cartridges.',
    },
    fireControlDetail: {
      zh: '外露马刺形单动回转击锤 + 套筒双侧泪滴形手动保险兼击针阻断器 + 并列双复进簧组。',
      en: 'Single-action exposed spur hammer with ambidextrous slide-mounted safety/firing-pin block and dual parallel recoil springs.',
    },
    signatureAdvantage: {
      zh: '导气回转闭锁与固定导轨枪管轻松承受近 2,100 焦耳马格南动能且瞄镜不随套筒晃动',
      en: 'Rifle-grade gas rotating bolt and fixed scope-railed barrel handle 2,100+ J magnum loads accurately',
    },
    engineeringTradeoff: {
      zh: '空重近 2.0 kg 且握把周长硕大，必须使用高膛压被甲弹保证导气孔充足且忌铅弹堵孔',
      en: 'Nearly 2.0 kg unloaded mass, oversized grip circumference, and unsuited to unjacketed lead bullets',
    },
  },
  aug: {
    id: 'aug',
    driveFamily: 'short_stroke_piston',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '倾斜导气箍兼折叠前握把座内置三档短行程活塞，通过右侧长导杆向后推动无托机匣内的双导杆枪机框。',
      en: 'Canted gas block houses a 3-position short-stroke piston transmitting impulse rearward along twin steel guide rods.',
    },
    lockingDetail: {
      zh: '七突笋枪机在快拆枪管钢节套内回转闭锁，使 508 mm 全尺寸步枪管缩入仅 790 mm 无托全长中。',
      en: '7-lug rotating bolt locks into a quick-change steel barrel trunnion, fitting a 20-inch rifle barrel inside a 790 mm bullpup.',
    },
    feedDetail: {
      zh: '握把后方直插 30 发半透明琥珀色华夫格聚酰胺双排双进弹匣，射手余光即可瞬读余弹。',
      en: 'Rear-mounted 30-round translucent amber waffle polymer magazine allowing instant visual round-count checks.',
    },
    fireControlDetail: {
      zh: '无快慢机拨杆：采用横闩保险 + 渐进式双连杆滑块扳机（轻扣一道火单发、扣到底二道火连发）及全工程塑料击锤盒。',
      en: 'Cross-bolt safety and progressive dual-bar trigger (half-pull semi, full-pull auto) driving an all-polymer rear hammer pack.',
    },
    signatureAdvantage: {
      zh: '冲锋枪级CQB紧凑全长却爆发 970 m/s 高初速与 1,880+ 焦耳全管长 5.56 弹道潜能',
      en: 'Delivers full 20-inch 970 m/s velocity and 1,880+ J energy inside a maneuverable CQB footprint',
    },
    engineeringTradeoff: {
      zh: '长距离双扳机连杆令单发扳机感偏韧，贴腮处紧邻后置抛壳窗需换装左撇子枪机才可左肩射击',
      en: 'Long dual trigger linkage yields a heavier pull, and cheek weld sits right beside the ejection port',
    },
  },
  p320: {
    id: 'p320',
    driveFamily: 'short_recoil_barrel',
    lockingFamily: 'tilting_barrel_cam',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '狼棕 PVD 不锈钢套筒与 4.7 英寸氮化枪管短后坐联动，椭圆形双套管复进簧平顺吸收后坐能量。',
      en: 'Coyote PVD stainless slide and 4.7-inch nitrided barrel recoil together against a captive flat-wire recoil spring assembly.',
    },
    lockingDetail: {
      zh: '改进无闭锁块设计：枪管下突笋直接与不锈钢 FCU 火控内胆横销凸轮槽啮合完成偏移解锁。',
      en: ' Rectangular barrel hood locks in the slide while the underlug cams directly against the takedown pin/bridge of the stainless FCU.',
    },
    feedDetail: {
      zh: '17 发双排单进钢制弹匣插入无序列号可自由更换尺寸的聚合物 Carry 握把壳。',
      en: '17-round double-stack steel magazine seated inside a non-serialized interchangeable polymer Carry grip module.',
    },
    fireControlDetail: {
      zh: '可免工具整体提出带序列号不锈钢 FCU 内胆：全预压平移击针 + 双阶安全阻铁缺口 + M17 双侧手动拇指保险。',
      en: 'Tool-free removable serialized stainless Fire Control Unit (FCU) with fully pre-tensioned striker, secondary sear notch, and M17 ambi thumb safety.',
    },
    signatureAdvantage: {
      zh: '单一法定 FCU 内胆可秒级换装不同尺寸握把、套筒与口径，全预压击针扳机干脆利落',
      en: 'Modular serialized FCU swaps across grip sizes and calibers in seconds with a crisp fully-cocked trigger break',
    },
    engineeringTradeoff: {
      zh: '包含独立不锈钢内胆框架使套筒轴线高度略高于一体聚合物握把的格洛克',
      en: 'Internal stainless FCU chassis sits slightly higher above the web of the hand than Glock frames',
    },
  },
  p90: {
    id: 'p90',
    driveFamily: 'delayed_or_straight_blowback',
    lockingFamily: 'roller_or_mass_blowback',
    feedFamily: 'top_helical_90deg',
    driveDetail: {
      zh: '重型块状枪机沿双平行导杆直线惯性后坐，配合高分子涂层直微锥 5.7×28mm 弹壳可控微移延迟。',
      en: 'Heavy monolithic breech block rides twin guide rods in straight blowback calibrated to polymer-coated 5.7×28mm cases.',
    },
    lockingDetail: {
      zh: '无旋转突笋或滚柱，完全依赖精确配重的枪机惯性质量与双复进簧在 0.5 ms 膛内时间维持弹底支撑。',
      en: 'Pure calibrated bolt inertia and twin recoil springs hold breech closure across the 0.5 ms in-bore acceleration window.',
    },
    feedDetail: {
      zh: '50 发半透明顶置水平弹匣内子弹横置排列，尾端专利 90° 螺旋坡道逐发旋正供弹，空壳从握把后方垂直向下抛出。',
      en: 'Top-mounted 50-round horizontal magazine rotates sideways cartridges 90° down a helical ramp while spent brass drops straight out the bottom chute.',
    },
    fireControlDetail: {
      zh: '扳机护弓下方旋转圆盘三档快慢机（S / 1 / A）+ 渐进式双段连发扳机 + 模块化全工程塑料后置击锤盒。',
      en: 'Under-trigger ambidextrous rotary dial (S / 1 / A), two-stage progressive auto trigger, and removable polymer hammer pack.',
    },
    signatureAdvantage: {
      zh: '504 mm 超紧凑全对称无托轮廓容纳 50 发高初速穿甲火力，左右肩切换零抛壳打脸',
      en: 'Packs 50 armor-piercing rounds into a 504 mm 100% ambidextrous bullpup with downward brass ejection',
    },
    engineeringTradeoff: {
      zh: '顶置水平弹匣迫使光学瞄具基线抬高，且弹匣装弹耗时较传统双排弹匣更长',
      en: 'Top-mounted magazine raises optic height-over-bore and takes longer to hand-load 50 rounds',
    },
  },
  lift33: {
    id: 'lift33',
    driveFamily: 'compound_cam_elastic',
    lockingFamily: 'cam_letoff_or_adf_sled',
    feedFamily: 'drop_away_or_flight_track',
    driveDetail: {
      zh: '人力拉动弓弦使上下四片碳玻抛物线分体弓片对称弯曲储能，峰值拉力 70 磅（311 N），571.5 mm 超长做功行程平滑推箭。',
      en: 'Archer draw bends split quad carbon-glass limbs to 70 lb (311 N) peak force, accelerating a 400 gr arrow across a 571.5 mm power stroke.',
    },
    lockingDetail: {
      zh: 'SwitchWeight-X 上下双偏心凸轮经副缆严格同步，满拉末端机械杠杆比突变卸除 85% 拉力，仅需 10.5 磅稳瞄持弓。',
      en: 'Synchronized SwitchWeight-X binary cams roll over at full draw into an 85% let-off valley, holding at just 10.5 lb before release.',
    },
    feedDetail: {
      zh: '箭壶抽箭后尾槽卡入 D 环，QAD 联动落箭台在撒放瞬间翻落叉舌，令箭羽悬空无接触飞过桥式镂空弓把。',
      en: 'Carbon arrow nocks onto the string D-loop while the cord-driven QAD drop-away launcher snaps down at release for zero vane contact.',
    },
    fireControlDetail: {
      zh: '射手腕带/拇指撒放器钳钩锁持 D 环，支持半拉检视（Draw-Check）与阻铁式无扭矩清脆撒放。',
      en: 'Mechanical caliper/thumb release aid engages the braided D-loop for torque-free sear release and controlled let-down.',
    },
    signatureAdvantage: {
      zh: '1.79 kg 极致轻量桥式铝桁架与 85% 深省力谷，零燃烧噪音实现 106 m/s 高效动能转化',
      en: '1.79 kg bridged aluminum truss riser and 85% let-off valley deliver silent 106 m/s kinetic efficiency',
    },
    engineeringTradeoff: {
      zh: '需射手肌肉克服 70 磅拉峰且无法长时间预上弦携行，严禁无箭空放',
      en: 'Requires manual physical draw over the 70 lb peak before each shot and cannot remain pre-cocked',
    },
  },
  r500: {
    id: 'r500',
    driveFamily: 'compound_cam_elastic',
    lockingFamily: 'cam_letoff_or_adf_sled',
    feedFamily: 'drop_away_or_flight_track',
    driveDetail: {
      zh: 'VersaDrive 内置梯形丝杠曲柄驱动滑台后拉上弦，HexCoil 凸轮旋转 360° 缠绕缆绳，令四分体弓片蓄积 300 磅（1,334 N）巨力。',
      en: 'Internal VersaDrive leadscrew crank draws the string as HexCoil cams rotate a full 360°, storing 300 lb (1,334 N) limb thrust.',
    },
    lockingDetail: {
      zh: 'Trac-Trigger 悬浮阻铁滑台沿丝杠前移咬合弓弦中心，内置铜质防空放互锁舌（ADF）与自动落锁保险，满弦轮距仅 91 mm。',
      en: 'Floating Trac-Trigger sled latches the string center with a mechanical Anti-Dry-Fire sensor, shrinking cocked width to 91 mm.',
    },
    feedDetail: {
      zh: '零轨悬浮箭道：400 格令碳素弩箭仅首尾两点支撑，尾扣顶开防空放舌后完全悬空飞离，彻底消除导轨摩擦烧弦。',
      en: 'Zero-rail frictionless flight track supports the 400 gr bolt only at rest and nock, eliminating rail drag at 500 FPS.',
    },
    fireControlDetail: {
      zh: '无托前移握把通过连杆联通后置悬浮滑台阻铁，上弦到位自动挂入 SAFE，具备双向棘轮离合安全退弦能力。',
      en: 'Bullpup forward grip links to the rear sled sear with auto-engaging SAFE and bidirectional clutch safe de-cocking.',
    },
    signatureAdvantage: {
      zh: '91 mm 步枪级超窄无托横向轮廓迸发 152.4 m/s（500 FPS / 301 J）惊人弩箭动能且可满弦待击',
      en: '91 mm rifle-slim bullpup profile unleashes 152.4 m/s (500 FPS / 301 J) energy from a pre-cocked state',
    },
    engineeringTradeoff: {
      zh: '300 磅超高弓弦张力必须依赖专用曲柄丝杠上弦，单发装填周期长于火器',
      en: '300 lb draw weight requires leadscrew cranking between shots, trading rate of fire for peak bolt velocity',
    },
  },

  // ---- Pre-Populated Wave-2 Exhibits (Auto-Activate When Appended to WEAPON_IDS) ----
  python: {
    id: 'python',
    driveFamily: 'manual_bolt_or_revolver_linkage',
    lockingFamily: 'cylinder_notch_ratchet',
    feedFamily: 'swing_out_cylinder',
    driveDetail: {
      zh: '经典柯尔特双动/单动（DA/SA）纯机械连杆：扣动扳机或拇指扳击锤压缩折叠 V 形主簧，完全不依赖火药燃气或后坐驱动。',
      en: 'Colt DA/SA mechanical clockwork: trigger pull or thumb cocking compresses a forged V-leaf mainspring with zero gas or recoil reliance.',
    },
    lockingDetail: {
      zh: '下方止转笋先脱槽、竖直拨齿顶推棘轮星盘分度 60°，击锤落上前回弹杠杆与止转笋双重抱死弹巢实现零晃动同轴击发。',
      en: 'Cylinder bolt drops, the hand advances the 6-point star 60°, and Colt’s full-lockup rebound geometry clamps the cylinder tight at ignition.',
    },
    feedDetail: {
      zh: '左侧拇指闩前推解锁鹤臂摆出六巢凹槽弹巢，兼容 HKS 旋转快速装弹器与星形退壳杆六发同步退壳。',
      en: 'Left-flank latch releases the crane to swing out the 6-chamber fluted cylinder for simultaneous star ejection and speedloader reloads.',
    },
    fireControlDetail: {
      zh: '手工调校 V 形片簧 + 回弹安全杠杆（Rebound Lever）自动回撤击锤并阻断惯性击针，单动断点如玻璃折断般清脆。',
      en: 'Hand-tuned V-mainspring and signature Colt rebound lever positively block the frame-mounted firing pin unless the trigger is held.',
    },
    signatureAdvantage: {
      zh: '全长枪管下突笋配重与 6 英寸通风瞄准肋条结合同轴满锁弹巢，机械顺滑度与精度享誉转轮之王',
      en: 'Full underlug balance, 6-inch ventilated rib, and bank-vault cylinder lockup deliver legendary revolver accuracy',
    },
    engineeringTradeoff: {
      zh: '6 发弹巢容弹量受限、侧隙泄气无法常规消音，精密片簧棘轮正时对工匠装配要求极高',
      en: 'Six-round capacity, lateral cylinder-gap blast, and intricate hand-fitted clockwork timing',
    },
    fallbackCatalog: {
      bayCode: 'BAY-14',
      modelCode: 'COLT PYTHON 6" · .357 MAGNUM ROYAL BLUE',
      shortLabel: { zh: '柯尔特蟒蛇', en: 'Colt Python' },
      fullName: {
        zh: '柯尔特 Python 6英寸左轮手枪',
        en: 'Colt Python 6" .357 Magnum Revolver',
      },
      originTag: {
        zh: '美国 · 双动转轮手枪',
        en: 'United States · DA/SA Revolver',
      },
      caliber: { zh: '.357 Magnum', en: '.357 Magnum' },
      compactCaliber: { zh: '.357 Magnum', en: '.357 Magnum' },
      caliberProfileFallback: '357_magnum',
      isArchery: false,
      peakLoadValue: 241,
      peakLoadFormatted: { zh: '241 MPa', en: '241 MPa' },
      standardLabel: 'SAAMI',
      muzzleVelocityMps: 385,
      projectileMassG: 10.25,
      overallLengthMm: 292,
      barrelOrStrokeMm: 152.4,
      emptyWeightKg: 1.23,
      partsCount: 25,
      cyclicRateRpm: null,
      rateOfFireDisplay: { zh: '双动 / 单动', en: 'DA / SA (6-Round Cylinder)' },
      timing: makeWave2Timing(0.2, 0.34, 0.5, 0.86, null),
    },
  },
  benellim4: {
    id: 'benellim4',
    driveFamily: 'short_stroke_piston',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'underbarrel_tubular_elevator',
    driveDetail: {
      zh: '专利 ARGO 自调节双对称不锈钢短行程活塞紧贴弹膛前方两侧，直接截取高温洁净燃气推动机框肩部并自动泄放过剩压力。',
      en: 'Twin symmetrical ARGO stainless short-stroke pistons sit right ahead of the chamber, tapping hot clean gas and self-venting excess pressure.',
    },
    lockingDetail: {
      zh: '重型枪机框螺旋凸轮槽导引镀硬铬双突笋枪机头回转约 38° 刚性闭锁于 18.5 英寸枪管延伸节内。',
      en: 'Helical cam slot in the heavy carrier rotates a hard-chrome 2-lug bolt head 38° into the 18.5-inch barrel extension.',
    },
    feedDetail: {
      zh: '枪管下方 7 发全长钢制管式弹仓推动霰弹滑上底部不锈钢升降托弹板，向上摆动托举 12 号霰弹对准弹膛。',
      en: '7-round underbarrel steel magazine tube feeds 12-gauge shells onto a pivoting stainless carrier elevator that lifts each hull to bore axis.',
    },
    fireControlDetail: {
      zh: '单销快拆铝合金扳机盒内置回转击锤、横闩保险及托弹板挂弹释放拨片（支持退膛换独头弹）。',
      en: 'Single-pin removable alloy trigger group with rotary hammer, cross-bolt safety, and cartridge-drop shell release lever.',
    },
    signatureAdvantage: {
      zh: '免调气阀即可通吃轻装战术鹿弹与重装马格南独头弹，战术导轨或枪灯挂载丝毫不影响管退可靠性',
      en: 'Cycles light tactical loads to heavy 3-inch magnums without manual regulator adjustment or inertia-mount sensitivity',
    },
    engineeringTradeoff: {
      zh: '下置管式弹仓逐发塞弹补给速度慢于盒式弹匣，且随 7 发重弹打出前护木重心逐步后移',
      en: 'Single-shell bottom port loading is slower than box mags, and front balance lightens as 7 shells fire',
    },
    fallbackCatalog: {
      bayCode: 'BAY-15',
      modelCode: 'BENELLI M4 SUPER 90 · U.S. M1014 12GA',
      shortLabel: { zh: 'Benelli M4', en: 'Benelli M4' },
      fullName: {
        zh: '伯奈利 M4 (M1014) 半自动霰弹枪',
        en: 'Benelli M4 Super 90 (M1014) Combat Shotgun',
      },
      originTag: { zh: '意大利 · 战术霰弹枪', en: 'Italy · Combat Shotgun' },
      caliber: {
        zh: '12 Gauge (18.5×70mm)',
        en: '12 Gauge (2.75" / 3" 00 Buck)',
      },
      compactCaliber: { zh: '12 Gauge 霰弹', en: '12 Gauge 00 Buck' },
      caliberProfileFallback: '12_gauge',
      isArchery: false,
      peakLoadValue: 79,
      peakLoadFormatted: { zh: '79 MPa', en: '79 MPa' },
      standardLabel: 'SAAMI / CIP',
      muzzleVelocityMps: 404,
      projectileMassG: 30.2,
      overallLengthMm: 1010,
      barrelOrStrokeMm: 470,
      emptyWeightKg: 3.82,
      partsCount: 26,
      cyclicRateRpm: null,
      rateOfFireDisplay: { zh: '半自动 (7+1发)', en: 'Semi-Auto (7+1 Rd)' },
      timing: makeWave2Timing(0.12, 0.29, 0.44, 0.9, 0.15),
    },
  },
  garand: {
    id: 'garand',
    driveFamily: 'long_stroke_piston',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'top_enbloc_clip',
    driveDetail: {
      zh: '24 英寸枪口下方不锈钢导气筒截取低压尾段燃气，驱动右侧全长弯曲长行程操作拉杆（Op-Rod）克服长复进簧后坐。',
      en: 'Muzzle-mounted stainless gas cylinder taps low-port-pressure gas to drive a full-length curved right-side long-stroke operating rod.',
    },
    lockingDetail: {
      zh: '操作拉杆经约 4 mm 自由行程安全泄压后，其弯曲凸轮驼峰引导双突笋锻钢枪机右耳旋转约 32° 解锁（启发了后世 AK 枪机）。',
      en: 'After ~4 mm free-travel blowdown delay, the op-rod cam hump rotates the forged 2-lug bolt 32° unlocked—direct ancestor to Kalashnikov’s bolt.',
    },
    feedDetail: {
      zh: '8 发 .30-06 步枪弹连同磷化弹簧钢漏夹从敞顶机匣整夹压入，复进簧力经托弹连杆双向驱动推弹，末发抛壳自动弹出空漏夹。',
      en: '8-round stamped spring-steel en-bloc clip presses flush into the open-top receiver and automatically pings skyward as the 8th case ejects.',
    },
    fireControlDetail: {
      zh: '扳机护弓向前下扳即可无工具整体拆出铣削钢火控组：两道火军用扳机、强力回转击锤与护弓前端勾拉保险。',
      en: 'Pivoting the milled trigger guard cams out the entire trigger housing for instant field-stripping, featuring a two-stage sear and front tang safety.',
    },
    signatureAdvantage: {
      zh: '人类历史上首款全面列装的主战半自动步枪，齐平胡桃木下腹与整夹快装缔造压倒性二战步兵火力',
      en: 'First standard-issue semi-auto battle rifle in history; flush walnut belly and fast 8-round clip reloads',
    },
    engineeringTradeoff: {
      zh: '长弯操作拉杆对超高膛压现代狩猎装药敏感，装填时若大拇指撤离稍慢易被快弹释放的枪机夹伤（Garand Thumb）',
      en: 'Long curved op-rod is sensitive to non-M2 port pressures, and mistimed thumb placement invites "Garand Thumb"',
    },
    fallbackCatalog: {
      bayCode: 'BAY-16',
      modelCode: 'U.S. RIFLE CAL. .30 M1 GARAND · SPRINGFIELD',
      shortLabel: { zh: 'M1 加兰德', en: 'M1 Garand' },
      fullName: {
        zh: '美国 M1 加兰德半自动步枪',
        en: 'U.S. Rifle Cal. .30 M1 Garand',
      },
      originTag: {
        zh: '美国 · 半自动步枪',
        en: 'United States · Battle Rifle',
      },
      caliber: {
        zh: '.30-06 Springfield (7.62×63mm)',
        en: '.30-06 Springfield M2 Ball',
      },
      compactCaliber: { zh: '.30-06 M2 普通弹', en: '.30-06 M2 Ball' },
      caliberProfileFallback: '30_06',
      isArchery: false,
      peakLoadValue: 345,
      peakLoadFormatted: { zh: '345 MPa', en: '345 MPa' },
      standardLabel: 'SAAMI / USGI M2',
      muzzleVelocityMps: 853,
      projectileMassG: 9.73,
      overallLengthMm: 1105,
      barrelOrStrokeMm: 610,
      emptyWeightKg: 4.31,
      partsCount: 26,
      cyclicRateRpm: null,
      rateOfFireDisplay: {
        zh: '40–50 发/分 · 8发漏夹',
        en: 'Semi-Auto (40–50 rpm · 8-Rd Clip)',
      },
      timing: makeWave2Timing(0.1, 0.21, 0.45, 0.88, 0.92),
    },
  },
  m249: {
    id: 'm249',
    driveFamily: 'long_stroke_piston',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'disintegrating_belt_shuttle',
    driveDetail: {
      zh: '18.3 英寸快拆重枪管下方长行程导气活塞与双导杆滑座连成一体，开膛待击释放后整组前冲推弹闭锁并承接导气后坐。',
      en: 'Under-barrel long-stroke gas piston and dual-rod slide travel full-stroke from an open-bolt sear, slamming forward to chamber, lock, and fire.',
    },
    lockingDetail: {
      zh: '滑座立柱驱动双突笋回转枪机旋入快拆枪管节套刚性闭锁；待弹头越过导气孔泄压后，滑座先自由后退数毫米再旋出突笋并提速抽壳。',
      en: 'Slide post cams a heavy 2-lug rotating bolt into the quick-change barrel extension, holding dwell until post-port blowdown before primary extraction.',
    },
    feedDetail: {
      zh: '枪机框顶部滚轮驱动受机盖 S 形杠杆带动内外双拨爪，分两步将 200 发 M27 可散钢链横移到位，同时左下侧斜置弹匣井兼容 30 发 STANAG 弹匣。',
      en: 'Top-cover S-cam lever swings inner and outer pawls to index 200-round M27 disintegrating links in two half-steps, supplemented by a 35° STANAG magwell.',
    },
    fireControlDetail: {
      zh: '纯全自动开膛待击阻铁（Open-Bolt Sear）：停射时枪机锁在后方保持枪膛空气对流冷却，彻底杜绝持续扫射红热枪管诱发膛内自燃（Cook-Off）。',
      en: 'Open-bolt full-auto sear holds the bolt group rearward between bursts so air cools the chamber and eliminates hot-barrel propellant cook-off.',
    },
    signatureAdvantage: {
      zh: '集 200 发弹链持续压制火力、3 秒免工具快拆换管与同班步兵 STANAG 弹匣应急互通于一体',
      en: 'Combines 200-round belt-fed suppression, 3-second quick-change barrel cooling, and emergency rifle-magazine sharing',
    },
    engineeringTradeoff: {
      zh: '开膛待击扣扳机瞬间大质量活塞滑座前冲造成轻微点射散布抖动，空枪全重达 7.5 kg',
      en: 'Forward-slamming open-bolt carrier mass nudges point-of-aim on trigger break, with 7.5 kg unloaded weight',
    },
    fallbackCatalog: {
      bayCode: 'BAY-17',
      modelCode: 'FN M249 SAW · MINIMI 5.56MM BELT-FED',
      shortLabel: { zh: 'M249 SAW', en: 'M249 SAW' },
      fullName: {
        zh: 'FN M249 班用自动武器 (轻机枪)',
        en: 'FN M249 SAW Squad Automatic Weapon',
      },
      originTag: {
        zh: '比利时 / 美国 · 弹链轻机枪',
        en: 'Belgium / USA · Belt-Fed LMG',
      },
      caliber: {
        zh: '5.56×45mm NATO (M27弹链)',
        en: '5.56×45mm NATO (M27 Belt)',
      },
      compactCaliber: { zh: '5.56 NATO · M27弹链', en: '5.56 NATO · M27 Belt' },
      caliberProfileFallback: '556_nato',
      isArchery: false,
      peakLoadValue: 430,
      peakLoadFormatted: { zh: '430 MPa', en: '430 MPa' },
      standardLabel: 'NATO EPVAT',
      muzzleVelocityMps: 915,
      projectileMassG: 4.02,
      overallLengthMm: 1038,
      barrelOrStrokeMm: 465,
      emptyWeightKg: 7.5,
      partsCount: 26,
      cyclicRateRpm: 800,
      rateOfFireDisplay: { zh: '750–850 发/分', en: '750–850 rpm (Open-Bolt)' },
      timing: makeWave2Timing(0.24, 0.35, 0.62, 0.9, 0.56),
    },
  },
  p08: {
    id: 'p08',
    driveFamily: 'short_recoil_barrel',
    lockingFamily: 'toggle_knee_joint',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '无全包套筒，4 英寸锥形枪管与叉形节套锁死为一体沿握把导轨纯直线短后坐约 7 mm，动能直接传递至双连杆肘节。',
      en: 'Instead of an enclosing slide, the 4" tapered barrel and forked receiver recoil straight rearward 7 mm on frame ways before tripping the toggle.',
    },
    lockingDetail: {
      zh: '方形枪机、前肘节与后肘节三铰点处于轴线下方 1.5 mm 过死点锁死；双侧滚轮撞击机匣斜坡后以 54° 向上急剧屈膝折起完成解锁。',
      en: 'Breechblock and twin toggle links rest 1.5 mm below bore centerline in over-center lockup until frame cam ears snap the knee joint 54° skyward.',
    },
    feedDetail: {
      zh: '55° 大倾角握把内嵌 8 发单排折弯薄钢板弹匣，带同心圆双耳底托与拇指助推钮，末发打空顶起空仓挂机挡铁将肘节定格高耸张开态。',
      en: 'Steep 55° grip houses an 8-round sheet-steel single-stack magazine with a thumb follower button that trips the hold-open catch on the empty round.',
    },
    fireControlDetail: {
      zh: '新月扳机推顶侧盖内 L 形横向传递杠杆压下枪机左侧扁簧阻铁释放内置平移击针，配合刻有“GESICHERT”字样的麦秆回火拇指保险杆。',
      en: 'Crescent trigger cams a sideplate L-lever laterally against a leaf sear to release the internal striker, guarded by a straw-tempered Gesichert safety bar.',
    },
    signatureAdvantage: {
      zh: '55° 自然握角与非偏移纯直线枪管缔造指向性与首发精度神话，孕育了统治百年的 9×19mm 帕拉贝鲁姆手枪弹',
      en: '55° grip ergonomics and inline non-tilting barrel deliver legendary pointability—and birthed the universal 9×19mm Parabellum cartridge',
    },
    engineeringTradeoff: {
      zh: '多连杆手工研配制造成本极高，且对弹药冲量窗口挑剔，泥沙侵入上折铰链易致不完全闭锁',
      en: 'Labor-intensive hand-fitted toggle links are costly to machine and sensitive to weak ammunition or mud',
    },
    fallbackCatalog: {
      bayCode: 'BAY-18',
      modelCode: 'DWM PISTOLE PARABELLUM 1908 · 9×19MM',
      shortLabel: { zh: '鲁格 P08', en: 'Luger P08' },
      fullName: {
        zh: '德国鲁格 P08 肘节手枪',
        en: 'DWM Luger P08 Parabellum Pistol',
      },
      originTag: {
        zh: '德国 · 肘节半自动手枪',
        en: 'Germany · Toggle-Lock Pistol',
      },
      caliber: {
        zh: '9×19mm Parabellum',
        en: '9×19mm Parabellum',
      },
      compactCaliber: { zh: '9×19mm 帕拉贝鲁姆', en: '9×19mm Parabellum' },
      caliberProfileFallback: '9mm_para',
      isArchery: false,
      peakLoadValue: 235,
      peakLoadFormatted: { zh: '235 MPa', en: '235 MPa' },
      standardLabel: 'CIP / SAAMI',
      muzzleVelocityMps: 365,
      projectileMassG: 8.04,
      overallLengthMm: 222,
      barrelOrStrokeMm: 102,
      emptyWeightKg: 0.871,
      partsCount: 25,
      cyclicRateRpm: null,
      rateOfFireDisplay: { zh: '半自动 (8发单排)', en: 'Semi-Auto (8-Rd Mag)' },
      timing: makeWave2Timing(0.11, 0.22, 0.5, 0.88, null),
    },
  },
  vector: {
    id: 'vector',
    driveFamily: 'delayed_or_straight_blowback',
    lockingFamily: 'super_v_off_axis_cam',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '无导气孔固定 5.5 英寸低轴线枪管，直接利用 .45 ACP 弹底后推力驱动铰接枪机，经偏轴滑块将直线冲量折射至弹匣井后方竖井。',
      en: 'Fixed 5.5" sub-hand barrel uses zero gas ports; .45 ACP case thrust drives an articulated bolt coupled to a vertical counterweight well.',
    },
    lockingDetail: {
      zh: '枪机两侧凸轮耳在重型滑块陡峭初段槽内获得高机械减速比延迟开锁，泄压后迫使滑块沿 110° 斜轨向下猛冲压缩顶置复进簧。',
      en: 'Steep initial cam-slot geometry delays breech opening under peak pressure before forcing the heavy slider 110° downward behind the magwell.',
    },
    feedDetail: {
      zh: '前倾 66° 握把兼容标准格洛克 G21 双排双进弹匣与加长 25 发 MagEx2 弹匣，短复进行程支持高达 1,200 发/分极速连发。',
      en: 'Accepts standard Glock 21 and extended 25-round .45 ACP MagEx2 double-stack magazines at 66°, cycling cleanly at 1,200 rpm.',
    },
    fireControlDetail: {
      zh: '上机匣顶置线性回转击锤配独立双侧拇指保险与单发 / 两连发点射（2-Rd Burst） / 全自动三档快慢机，确保高射速精确控弹。',
      en: 'Top-mounted linear hammer pack features separate ambidextrous safety levers and a 3-mode Semi / 2-Round Burst / Full-Auto selector.',
    },
    signatureAdvantage: {
      zh: '虎口以下超低枪管轴线叠加 110° 下沉反冲矢量，让大冲量 .45 ACP 在 1,200 RPM 连发下保持惊人平顺聚拢',
      en: 'Sub-hand bore axis plus 110° downward recoil redirection tames heavy 230 gr .45 ACP bursts at 1,200 RPM',
    },
    engineeringTradeoff: {
      zh: '230 格令亚音速大直径弹头气动下坠剧烈，100 米外外弹道能量与落点远逊小口径高速弹',
      en: 'Subsonic 230 gr .45 ACP suffers steep trajectory drop beyond 100 m, and the vertical Super V well adds receiver height',
    },
    fallbackCatalog: {
      bayCode: 'BAY-19',
      modelCode: 'KRISS VECTOR GEN II SDP-SB · .45 ACP SUPER V',
      shortLabel: { zh: 'KRISS Vector', en: 'KRISS Vector' },
      fullName: {
        zh: 'KRISS Vector 短剑偏轴冲锋枪 (.45 ACP)',
        en: 'KRISS Vector Gen II Super V SMG (.45 ACP)',
      },
      originTag: {
        zh: '美国 / 瑞士 · 偏轴延迟冲锋枪',
        en: 'USA / Switzerland · Off-Axis SMG',
      },
      caliber: {
        zh: '.45 ACP (11.43×23mm)',
        en: '.45 ACP (230 gr Subsonic FMJ)',
      },
      compactCaliber: { zh: '.45 ACP · 230 gr', en: '.45 ACP · 230 gr' },
      caliberProfileFallback: '9mm_para',
      isArchery: false,
      peakLoadValue: 145,
      peakLoadFormatted: { zh: '145 MPa', en: '145 MPa' },
      standardLabel: 'SAAMI',
      muzzleVelocityMps: 260,
      projectileMassG: 14.9,
      overallLengthMm: 617,
      barrelOrStrokeMm: 140,
      emptyWeightKg: 2.72,
      partsCount: 25,
      cyclicRateRpm: 1200,
      rateOfFireDisplay: {
        zh: '1,200 发/分 (单/两连/全自动)',
        en: '1,200 rpm (Semi / 2-Rd / Auto)',
      },
      timing: makeWave2Timing(0.11, 0.24, 0.52, 0.89, null),
    },
  },
  // WP-17 Clockwork, Subsonic & Rotary Wonders (BAY-20 .. BAY-23):
  g11: {
    id: 'g11',
    driveFamily: 'short_stroke_piston',
    lockingFamily: 'rotary_cylindrical_breech',
    feedFamily: 'overhead_caseless_rammer',
    driveDetail: {
      zh: '540 mm 浮置枪管中段下方短行程镀铬活塞仅猛冲 13.5 mm 推动双联齿条与瑞士钟表齿轮系；整套枪管、旋转弹膛与弹匣在单体聚合物外壳内自由浮置后坐 42 mm。',
      en: 'An under-barrel short-stroke chrome piston punches 13.5 mm to drive twin toothed racks and watchmaker spur gears while the entire 540 mm barreled action and overhead magazine float rearward 42 mm.',
    },
    lockingDetail: {
      zh: '零往复枪机、零抽抛壳：不锈钢/黄铜行星齿轮驱使硬铬圆柱弹膛绕 Z 轴原地翻转 90° 接弹后归平气密抵紧枪管，28 毫秒完成单次闭锁循环。',
      en: 'Zero reciprocating bolt or brass extraction: stainless-brass spur gears turn a hard-chromed cylindrical breech 90 deg upward to load and back to 0 deg for hermetic ignition in under 28 ms.',
    },
    feedDetail: {
      zh: '45 发 4.73×33mm DM11 方形 HITP 无壳药块垂直紧排于枪管正上方烟熏水平弹匣，凸轮冲头垂直下刺 26.5 mm 压弹入膛，K2 护木双备弹夹实现 135 发随枪携弹。',
      en: '45 rectangular 4.73x33mm DM11 HITP caseless blocks stack nose-down in a smoked overhead tube; a vertical cam rammer plunges 26.5 mm to chamber each round, with twin K2 spare clips totaling 135 ready rounds.',
    },
    fireControlDetail: {
      zh: '全封闭冬用护弓内曲柄扳机联动三发点射擒纵棘轮与同轴平移击针，左侧弹出式 360° 上膛摇柄兼作哑弹下排机构，支持单发 / 2,100 RPM 三连发 / 460 RPM 全自动。',
      en: 'Bullpup trigger drives a 3-round burst escapement and coaxial striker alongside a pop-out 360-deg winding crank, selecting Semi, 2,100 RPM 3-round hyperburst, or 460 RPM full-auto.',
    },
    signatureAdvantage: {
      zh: '无壳零抛壳结合 42 mm 浮置延迟后坐，在后坐抵肩前以 2,100 RPM（85 毫秒）叠射三发 930 m/s 弹头大幅倍增首发命中率',
      en: 'Zero brass extraction and 42 mm floating delayed impulse launch three 930 m/s bullets in 85 ms at 2,100 RPM before recoil reaches the shoulder',
    },
    engineeringTradeoff: {
      zh: '堪比高级机械腕表的复杂齿轮系与专用 4.73mm 无壳药块造价高昂且无法兼容北约 5.56 黄铜弹药体系',
      en: 'Watchmaker-grade internal gear complexity and proprietary 4.73 mm caseless ammunition lack NATO 5.56 mm brass logistical compatibility',
    },
  },
  vss: {
    id: 'vss',
    driveFamily: 'long_stroke_piston',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '200 mm 冷锻枪管前段三排径向泄气孔将高压燃气提前泄入 414 mm 整体消音膨胀舱并经 6 级 ±28° 斜挡板涡旋降噪，舱内隐蔽长行程镀铬活塞驱动枪机框后坐 74 mm。',
      en: 'Three rows of radial barrel ports bleed subsonic gas into a 414 mm integral suppressor with six +/-28-deg slanted baffles while an enclosed long-stroke piston strokes the carrier 74 mm.',
    },
    lockingDetail: {
      zh: '摒弃 AK 双突笋改用 60° 均布 6 枚对称闭锁突笋圆柱旋转枪机，仅旋转 32° 即与整坯 CNC 铣削烤蓝钢机匣达成栓动级同轴刚性闭锁。',
      en: 'Replaces twin AK lugs with six symmetrical radial locking lugs spaced at 60-deg intervals, rotating just 32 deg inside a billet-milled steel receiver for bolt-action concentricity.',
    },
    feedDetail: {
      zh: '10 发深李子褐华夫纹聚合物双排盒式弹匣（与 AS Val 20 发匣通用），紧凑低矮轮廓极利卧姿隐蔽狙击与 30 秒公文箱拆装携行。',
      en: 'Compact 10-round plum waffle polymer double-stack box magazine (interchangeable with 20-round AS Val mags) preserves a low prone profile for clandestine briefcase deployment.',
    },
    fireControlDetail: {
      zh: '彻底取消响亮回转击锤，独创同轴平移超静音直线击铁；右侧防尘拨片独立管控保险，扳机后方隐藏横推钮可在单发狙击与 900 RPM 应急全自动间无声切换。',
      en: 'Eliminates rotary hammer clatter via a coaxial hammerless linear sliding striker; right dust-shield handles safety while a silent behind-trigger cross-bolt toggles semi and 900 RPM emergency auto.',
    },
    signatureAdvantage: {
      zh: '290 m/s 零音爆 250 格令 9×39mm 钨/钢芯重弹配合整体 6 级斜挡板消音与直线击铁，400 米悄无声息击穿防弹衣',
      en: '290 m/s 250-gr 9x39mm armor-piercing rounds paired with 6 slanted baffles and a linear striker defeat body armor silently out to 400 m',
    },
    engineeringTradeoff: {
      zh: '290 m/s 亚音速重弹呈高抛物线大下坠弹道，超越 400 米后测距误差对落点高度极为敏感且整体消音芯需频繁清碳',
      en: 'Steep rainbow subsonic trajectory magnifies range-estimation errors beyond 400 m and integral baffle stacks accumulate heavy carbon',
    },
  },
  m134: {
    id: 'm134',
    driveFamily: 'external_electric_rotary',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'disintegrating_belt_shuttle',
    driveDetail: {
      zh: '零火药导气孔：顶置 28V 直流 3.2 马力航空电机经 28 齿主驱动齿轮带动六槽 CNC 星形转子与六根 22 英寸枪管以 500 RPM 恒速公转，机匣内壁 360° 静止正弦凸轮槽驱动六枪机同步起伏。',
      en: 'Zero gas ports: a top-mounted 3.2-HP 28V DC aerospace motor drives a 28-tooth spur gear and six-flute star-rotor at 500 rpm past a stationary 360-deg sinusoidal cam track.',
    },
    lockingDetail: {
      zh: '六套独立镀硬铬双突笋旋转枪机各自嵌滑于转子 T 型导轨，随滚轮沿正弦槽以 60° 相位波浪接力在 12 点位旋转闭锁击发（415 MPa）、4 点位抽抛壳与 10 点位推弹入膛。',
      en: "Six independent chrome dual-lug rotary bolts orbit 60 deg out of phase inside rotor tracks, riding the sinusoidal groove to lock and fire at 12 o'clock, eject at 4, and chamber at 10.",
    },
    feedDetail: {
      zh: '与主转子 1:1 反向同步啮合的迪伦航空六瓣不锈钢星轮脱链供弹器，配合柔性不锈钢输弹槽以每秒 50 发极速将 7.62×51mm NATO 实弹剥离 M13 钢链送入 8 点位转子沟槽。',
      en: 'A gear-synchronized Dillon Aero six-pocket stainless star-wheel delinker strips 7.62x51mm NATO cartridges out of M13 steel links via a ribbed flexible chute at 50 rounds per second.',
    },
    fireControlDetail: {
      zh: '尾部双铲航空握把集成双拇指蝴蝶电门与绯红主武装拨动开关，顶部黄红 SAFE/ARMED 机械安全门可数秒内断开 12 点位击发凸轮；外能源强驱令哑弹直接抛出零卡停。',
      en: 'Rear twin spade grips house dual butterfly thumb triggers and a crimson master-arm toggle backed by a quick-release safing sector; external electric torque ejects duds with zero stoppage.',
    },
    signatureAdvantage: {
      zh: '六管轮转 300° 强迫风冷与外能源电驱实现 3,000 RPM 全威力 7.62 NATO 持续火力与逾 100,000 发平均故障间隔',
      en: 'Six air-cooled barrels with 300-deg cooling arcs and external electric power sustain 3,000 RPM 7.62 NATO fire past 100,000 MRBF',
    },
    engineeringTradeoff: {
      zh: '18.8 kg 本体加电机、电池与千发弹箱必须依托直升机、快艇或载具枢轴支架，且每秒耗弹 50 发后勤负荷惊人',
      en: '18.8 kg bare gun plus 28V aircraft power, delinker, and bulk ammunition limits deployment to vehicles, helicopters, and naval mounts',
    },
  },
  an94: {
    id: 'an94',
    driveFamily: 'long_stroke_piston',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '405 mm 冷锻枪管、8 字制退器与数控钢制内机匣刚性绑为一体，在静止炭黑聚酰胺外机匣内整体自由浮置后滑 42 mm 实现后坐冲量延迟；内部长行程活塞枪机框再相对后坐 50 mm 完成循环。',
      en: 'A 405 mm barrel, figure-8 brake, and steel sub-receiver float 42 mm rearward inside a stationary polyamide shell for blowback-shifted impulse while an internal long-stroke piston carrier cycles.',
    },
    lockingDetail: {
      zh: '轻量化精磨不锈钢双突笋回转枪机在安全自由行程泄压后旋转 35.5° 解锁抽壳，并在 33 毫秒极速窗口内从青铜预供弹盘剥取第 2 发弹逆旋闭锁击发。',
      en: 'A compact brushed-stainless two-lug bolt rotates 35.5 deg to unlock after dwell, then rockets forward within 33 ms to chamber and lock the pre-staged second burst round.',
    },
    feedDetail: {
      zh: '标志性 15° 右倾标准 30 发 AK-74 李子黑盒式弹匣为内部滑轮轨让位：枪机框后坐猛拉 180° 编织不锈钢钢索驱转 CNC 定滑轮，反向倍速推动青铜二级预供弹滑块提前送弹上盘。',
      en: 'Canting standard 30-round AK-74 plum magazines 15 deg right clears a CNC steel V-groove pulley and braided cable that whips a bronze two-stage pre-feed rammer ahead at 1,800 RPM.',
    },
    fireControlDetail: {
      zh: '浮置联动阻铁与青铜两发点射棘轮，配独立虎口拇指保险（ПР/ОГ）与三档射控（单发 / 1,800 RPM 两发点射 / 首两发 1,800 后转 600 RPM 全自动），百米常现双发同孔。',
      en: 'Floating disconnector and bronze 2-round burst ratchet pair with a separate thumb safety and Semi / 1,800 RPM 2-rd hyperburst / 1,800-to-600 RPM Auto modes capable of twin-bullet same-hole hits.',
    },
    signatureAdvantage: {
      zh: '百分百兼容现役 5.45×39mm 制式弹匣的同时以钢索滑轮二级预供弹与浮置枪管达成 1,800 RPM 双发同孔聚能穿甲',
      en: 'Uses standard 5.45x39mm AK-74 magazines while floating-action pulley-cable pre-feeding puts two bullets through the same 100 m hole at 1,800 RPM',
    },
    engineeringTradeoff: {
      zh: '浮置内机匣、编织钢索、定滑轮与两发棘轮令制造成本达 AK-74M 五至六倍，且野战深度拆装对军械维护要求极高',
      en: 'Floating carriage, braided wire cable, pulley wheel, and burst escapement multiply manufacturing cost 5x-6x and complicate conscript field maintenance',
    },
  },
  ztz99a: {
    id: 'ztz99a',
    driveFamily: 'hydro_pneumatic_cannon_recoil',
    lockingFamily: 'sliding_wedge_breech',
    feedFamily: 'autoloader_carousel_or_blast_bustle',
    driveDetail: {
      zh: '125mm ZPT-98 L/50 高压滑膛炮经双液压驻退筒与同轴复进簧吸收 320 mm 后坐行程，配 1,500 hp 150HB-2 双涡轮 V12 柴油机与 CH-1000 液力综合传动。',
      en: '125mm ZPT-98 L/50 smoothbore absorbs 320 mm recoil via twin hydraulic cylinders and return coils, mobilized by a 1,500 hp 150HB-2 twin-turbo V12 and CH-1000 hydromechanical transmission.',
    },
    lockingDetail: {
      zh: '电渣重熔镀铬炮管衔接锻钢立式楔形炮闩（650 MPa 承压），复进到位炮闩垂直下落 160 mm 并由弹底抛壳机经炮塔顶舱盖向上抛射黄铜底托。',
      en: 'ESR chrome-lined barrel mates with a 650 MPa vertical sliding-wedge breech that drops 160 mm on run-out while the roof stub ejector clears the spent brass base.',
    },
    feedDetail: {
      zh: '车体底部 22 发双层旋转转盘自动装弹机将分装式 DTC10-125 穿甲弹芯与半可燃药筒经提升托弹盘升至炮尾，由电动链式推弹机分两步推入弹膛。',
      en: '22-round hull-floor carousel autoloader indexes separated DTC10-125 APFSDS darts and semi-combustible charges up an elevator tray for electric chain ramming.',
    },
    fireControlDetail: {
      zh: '双轴全电火炮稳定器 + 车长独立周视热像仪（CITV）猎歼火控 + JD-3 激光告警主动致盲对抗系统，3 人车组 8 发/分恒定射速。',
      en: 'Dual-axis digital gun stabilizer, hunter-killer CITV thermal sight, and JD-3 laser active countermeasure suite serving a 3-crew cockpit at 8 rounds/min.',
    },
    signatureAdvantage: {
      zh: '仅 55 吨紧凑低矮车体集成 1,780 m/s 7.60 MJ 125mm 超高速火力、FY-4 重型双防爆反与 27.3 hp/t 顶级功重比',
      en: 'Compact 55-tonne low-profile hull unites 1,780 m/s 7.60 MJ 125mm firepower, FY-4 heavy ERA wedges, and 27.3 hp/t power-to-weight agility',
    },
    engineeringTradeoff: {
      zh: '底置转盘几何尺寸限制一体化穿甲弹杆长，且战斗室下部弹药集中需严密防护底盘侧甲',
      en: 'Hull-floor carousel geometry caps one-piece penetrator rod length and places stowed propellant beneath the turret ring',
    },
  },
  m1a2: {
    id: 'm1a2',
    driveFamily: 'hydro_pneumatic_cannon_recoil',
    lockingFamily: 'sliding_wedge_breech',
    feedFamily: 'autoloader_carousel_or_blast_bustle',
    driveDetail: {
      zh: '120mm M256 L/44 镀铬滑膛炮采用同轴双套筒液压驻退机与双复进簧吸收 300 mm 后坐；车尾搭载 1,500 hp 霍尼韦尔 AGT1500 多燃料燃气轮机与 X1100-3B 传动。',
      en: '120mm M256 L/44 smoothbore uses concentric hydraulic recoil cylinders (300 mm stroke); propulsion comes from a 1,500 hp Honeywell AGT1500 multifuel gas turbine and X1100-3B transmission.',
    },
    lockingDetail: {
      zh: '高强度锻钢立式楔形炮闩刚性封锁 670 MPa M829A4 贫铀弹峰值膛压，复进后炮闩下沉 150 mm 将残余金属底托弹入下置防烫收壳槽。',
      en: 'Forged vertical sliding-wedge breech seals 670 MPa M829A4 DU ignition before dropping 150 mm to kick the metallic stub base into the breech deflector.',
    },
    feedDetail: {
      zh: '气动装甲防爆滑门将 42 发 120mm 整装弹彻底隔离于带顶部泄压板的尾舱弹药室，装填手膝触开关瞬开滑门 340 mm 取弹直推入膛。',
      en: 'Pneumatic armored blast doors isolate 42 rounds inside a rear turret bustle topped with blow-off panels; knee-switch actuation slides the door 340 mm for manual ramming.',
    },
    fireControlDetail: {
      zh: '第 3 代 FLIR 炮长/车长独立热像猎歼火控 + AMK 弹药数据链 + CROWS-LP 低轮廓遥控武器站，4 人车组爆发射速达 10 发/分。',
      en: '3rd-gen FLIR hunter-killer FCS, ammunition data link, and CROWS-LP remote weapon station supporting a 4-person crew up to 10 rounds/min burst.',
    },
    signatureAdvantage: {
      zh: '全隔爆装甲尾舱 + 顶置泄压板树立乘员生存性标杆，燃气轮机低噪冷启动与贫铀网状复合装甲防护极其雄厚',
      en: 'Isolated blast-door bustle with roof blow-off panels sets the survivability benchmark alongside silent turbine acceleration and DU composite armor',
    },
    engineeringTradeoff: {
      zh: '战斗全重飙升至 66.8 吨且燃气轮机怠速油耗与高温尾气特征显著高于同级 V12 柴油机',
      en: '66.8-tonne combat weight and high turbine idle fuel consumption / thermal exhaust plume demand massive fuel logistics',
    },
  },
  leopard2a7: {
    id: 'leopard2a7',
    driveFamily: 'hydro_pneumatic_cannon_recoil',
    lockingFamily: 'sliding_wedge_breech',
    feedFamily: 'autoloader_carousel_or_blast_bustle',
    driveDetail: {
      zh: '6.60 米超长莱茵金属 Rh-120 L/55A1 高压滑膛炮以 340 mm 精密液压驻退控制 670 MPa 激波；后置 MTU MB 873 V12 双涡轮柴油机与 RENK 变速箱实现 15 分钟野战快换。',
      en: '6.60 m Rheinmetall Rh-120 L/55A1 smoothbore manages 670 MPa impulse over a 340 mm recoil stroke; its MTU MB 873 V12 twin-turbo diesel and RENK gearbox swap in 15 minutes.',
    },
    lockingDetail: {
      zh: '强化 L/55A1 立式楔形炮闩与电发火击针配合超长 55 倍径镀铬炮管，将 DM63A1 钨芯长杆穿甲弹初速推高至 1,750 m/s。',
      en: 'Reinforced L/55A1 vertical sliding-wedge breech and 55-caliber chrome bore accelerate DM63A1 tungsten APFSDS darts to 1,750 m/s.',
    },
    feedDetail: {
      zh: '15 发隔爆防爆滑门尾舱待发弹架（带顶部泄压板）配车体左前部 27 发主备弹架，手动装填爆发射速可达 12–15 发/分。',
      en: '15-round isolated blast-door ready bustle (with blow-off panels) paired with a 27-round forward hull rack enables 12-15 rounds/min burst loading.',
    },
    fireControlDetail: {
      zh: 'EMES-15 稳像主瞄具 + PERI R17A3 车长独立 360° 稳定周视热像仪 + 全电炮塔驱动与程控可编程多用途弹（DM11）引信接口。',
      en: 'EMES-15 stabilized sight, PERI R17A3 360-deg panoramic thermal periscope, all-electric turret drive, and programmable DM11 HE-T data link.',
    },
    signatureAdvantage: {
      zh: 'L/55A1 6.6 米超高压长管与空心楔形箭簇复合装甲实现穿透与抗穿双优，15 分钟快换柴油动力包续航维护比极佳',
      en: '6.6 m L/55A1 tube and hollow arrowhead composite wedges maximize armor-vs-armor duel performance with 15-minute EuroPowerpack logistics',
    },
    engineeringTradeoff: {
      zh: '含炮管全长逼近 11 米在城市巷战转向受限，且 27 发车体前备弹架缺乏独立炮塔泄压通道',
      en: 'Nearly 11 m gun-forward length complicates dense urban maneuvering, and the 27-round hull rack lacks overhead blow-off venting',
    },
  },
  tiger1: {
    id: 'tiger1',
    driveFamily: 'hydro_pneumatic_cannon_recoil',
    lockingFamily: 'sliding_wedge_breech',
    feedFamily: 'autoloader_carousel_or_blast_bustle',
    driveDetail: {
      zh: '4.93 米 88mm KwK 36 L/56 线膛炮配双室膛口制退器将 10.2 kg 穿甲弹后坐控于 290 mm；700 hp 迈巴赫 HL230 V12 汽油机经贯穿战斗室传动轴驱动前置奥尔瓦 8 速变速箱。',
      en: '4.93 m 88mm KwK 36 L/56 rifled gun with twin-baffle muzzle brake limits recoil to 290 mm; a 700 hp Maybach HL230 V12 drives a front Olvar 8-speed gearbox through the fighting floor.',
    },
    lockingDetail: {
      zh: '克虏伯半自动水平滑楔炮闩（横移 150 mm）承受 320 MPa 膛压，复进到位自动弹开并将滚烫 88×571mmR 黄铜药筒抛入防烫帆布袋。',
      en: 'Krupp semi-automatic horizontal sliding-wedge breech (150 mm lateral stroke) seals 320 MPa ignition and auto-ejects spent 88x571mmR brass cases into a turret catcher basket.',
    },
    feedDetail: {
      zh: '5 人车组由装填手自车体两侧 100 mm 装甲侧舷弹药架（总备弹 92 发定装黄铜炮弹）人工抽弹推入水平楔闩炮膛，稳态射速 6–8 发/分。',
      en: '5-crew fighting compartment draws 92 fixed brass-cased 88mm rounds from armored sponson side panniers for manual loading into the horizontal wedge breech at 6-8 rounds/min.',
    },
    fireControlDetail: {
      zh: '蔡司 TZF 9b 双目光学测距瞄准镜 + 发动机动力液压炮塔回转齿轮箱 + 电击发 88mm 脚踏/手控击发电路，首创先敌 2,000 m 远距直瞄猎杀战术。',
      en: 'Zeiss TZF 9b binocular optical sight, engine-driven hydraulic turret traverse, and electric primer firing circuit pioneering 2,000 m standoff gunnery.',
    },
    signatureAdvantage: {
      zh: '1942–1943 年以 100 mm 轧制均质钢、48 轮交错负重轮平稳射台与传奇 88mm L/56 线膛炮建立跨时代远距装甲压制力',
      en: 'Combined 100 mm rolled homogeneous steel, smooth 48-wheel Schachtellaufwerk ride, and the feared 88mm L/56 gun for unprecedented WWII standoff dominance',
    },
    engineeringTradeoff: {
      zh: '垂直装甲未利用大倾角等效厚度、48 轮交错负重轮泥雪结冰极难野战抢修，且 57 吨车重令迈巴赫 V12 与前置传动负荷沉重',
      en: 'Un-sloped vertical armor plates, mud-and-ice-prone interleaved road wheels, and 57-tonne drivetrain strain caused severe field maintenance burdens',
    },
  },
  winchester1894: {
    id: 'winchester1894',
    driveFamily: 'manual_bolt_or_revolver_linkage',
    lockingFamily: 'sliding_wedge_breech',
    feedFamily: 'underbarrel_tubular_elevator',
    driveDetail: {
      zh: '射手手指前推下摆 D 形杠杆 53° 驱动底部连杆桥：先下拉垂直 H 型闭锁块开锁，再抽拉顶抛枪机后坐退壳并顺势压倒外露拇指击锤。',
      en: 'Throwing the forged D-loop lever forward-down 53° rotates the bottom link bridge, dropping the vertical H-locking bolt before pulling the breech bolt back to recock the hammer.',
    },
    lockingDetail: {
      zh: '勃朗宁 H 型垂直升降锻钢闭锁块在机匣双壁垂直导槽内升降 24 mm，合拢时死死撑在圆柱枪机尾端承压 290 MPa 无烟火药爆发力。',
      en: 'Browning’s forged vertical rising H-locking bolt translates 24 mm inside milled receiver mortises to buttress the cylindrical breech bolt against 290 MPa .30-30 smokeless pressure.',
    },
    feedDetail: {
      zh: '6 发全长下挂管式弹仓配 Nelson King 右侧弹簧装弹活门：下层实弹后退落入黄铜托弹勺，回拉杠杆瞬间抬升 22° 送入弹膛。',
      en: 'Full-length 6-rd underbarrel tubular magazine loaded via Nelson King’s side spring gate feeds onto a brass shell carrier that tilts upward 22° on lever closure.',
    },
    fireControlDetail: {
      zh: '外露网格拇指击锤配半待击保险档 + 下尾舌杠杆握紧自动联锁阻断块，单动扳机清脆干脆且防跌落走火。',
      en: 'Exposed checkered spurred hammer with half-cock notch paired with a tang trigger-block safety requiring full lever squeeze before the single-action trigger can trip.',
    },
    signatureAdvantage: {
      zh: '纤薄扁平开顶锻钢机匣极其轻便平衡，单手拨杆即可在马背或林间随打随从侧门补弹，铸就 750 万支西部传奇',
      en: 'Ultra-slim forged receiver balances naturally in one hand while side-gate top-off allows continuous shooting across 7.5+ million rifles built',
    },
    engineeringTradeoff: {
      zh: '管式弹仓头尾串联限制只能装填平头/圆头 .30-30 弹，顶抛壳口占用正上方光学瞄具直装空间',
      en: 'Linear tubular magazine mandates flat- or round-nose bullets to prevent primer strikes, and top ejection complicates coaxial optics mounting',
    },
  },
  rem870: {
    id: 'rem870',
    driveFamily: 'manual_bolt_or_revolver_linkage',
    lockingFamily: 'sliding_wedge_breech',
    feedFamily: 'underbarrel_tubular_elevator',
    driveDetail: {
      zh: '玉米棒深槽核桃木前护木经左右对称双平行合金钢推拉连杆直接推进机匣驱动凸轮滑块，彻底消除了单连杆泵动时的扭转卡阻风险。',
      en: 'Twelve-groove corn-cob walnut pump forend drives twin parallel alloy-steel action bars directly into the billet receiver, preventing pump binding under torque.',
    },
    lockingDetail: {
      zh: '驱动滑块斜坡在最后 7 mm 前冲阶段将淬火钢楔形闭锁块向上顶起咬合 18" 枪管顶部闭锁肩，构筑钢-钢刚性闭锁面。',
      en: 'Camming slide ramps tilt the hardened steel locking block upward into the 18" barrel extension mortise across the final 7 mm of forearm closure.',
    },
    feedDetail: {
      zh: '4+1 磷化管式弹仓配高可视鲜橙色聚合物托弹杯、双侧交替阻弹片及硬铬 Flexitab 防夹手升降托弹勺，严寒污泥工况供弹稳健。',
      en: '4+1 Parkerized steel tube with high-vis orange follower, dual alternating shell latches, and a polished hard-chrome Flexitab lifter pivoting up 20° on forward stroke.',
    },
    fireControlDetail: {
      zh: 'CNC 铝合金双销快拆 Police Magnum 扳机座集成 20% 加强击锤簧、横栓保险与左前推杆互锁拨片：实弹未发时锁定护木防误开膛。',
      en: 'Dual-pin CNC aluminum Police trigger plate packs an extra-power hammer spring, rear crossbolt safety, and left action-bar slide lock released on hammer fall.',
    },
    signatureAdvantage: {
      zh: '整块锻钢机匣与双推杆防偏磨设计在泥沙、破门震动与不同威力弹种之间实现近乎零故障，全球累计产量突破 1,100 万支',
      en: 'Solid milled billet receiver and dual action bars cycle light less-lethal or 3" Magnum buckshot seamlessly with over 11 million produced worldwide',
    },
    engineeringTradeoff: {
      zh: '全手工往复泵动在紧张高应激条件下若“短拉护木”易出现未完全抛壳，且全钢机匣较铝合金竞争对手重约 350 克',
      en: 'Requires deliberate full-stroke manual cycling under stress to avoid short-stroking, and solid steel adds ~350 g over aluminum receivers',
    },
  },
  // V6.0 Wave 2 Additions (BAY-30 .. BAY-34):
  m1911: {
    id: 'm1911',
    driveFamily: 'short_recoil_barrel',
    lockingFamily: 'tilting_barrel_cam',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '全包锻钢套筒与 5" 枪管闭锁共同短后坐 3 mm 待膛压安全下降，随后单绞链将枪管拉停在底把冲击床上，套筒独自后坐 45.5 mm。',
      en: 'Forged slide and 5" barrel recoil locked together 3 mm before the swinging link arrests the barrel on the frame bed while the slide completes a 45.5 mm stroke.',
    },
    lockingDetail: {
      zh: '枪管顶部双半圆闭锁筋死锁套筒顶槽；孔距 7.06 mm 单绞链绕空仓挂机横销向后旋转 53° 拉降枪尾 2.7 mm，仰起 +2.1° 干脆脱锁。',
      en: 'Dual top barrel ribs lock into slide roof mortises until the 0.278" swinging link pivots 53 deg around the slide-stop pin, dropping the breech 2.7 mm.',
    },
    feedDetail: {
      zh: '18° 纤薄握把容纳 7 发 .45 ACP 单排钢弹匣，渐进锥形抱弹唇配合内置管状抽壳钩实现高可靠受控供弹，托弹板中央带勃朗宁防前窜凸点。',
      en: '18 deg slim grip houses a 7-round single-stack .45 ACP steel magazine with progressive controlled-feed lips and Browning dimpled follower.',
    },
    fireControlDetail: {
      zh: '纯水平直线滑动 U 形扳机框驱动单动阻铁与垂直断连器，由一片无螺钉三叉板簧统管三套机构，配 Condition 1 拇指保险与虎口自动握把保险。',
      en: 'Straight-sliding U-stirrup trigger actuates a single-action sear & paddle disconnector powered by one screwless 3-leaf spring with thumb and grip safeties.',
    },
    signatureAdvantage: {
      zh: '6,000 发零故障历史传奇、纯直线“玻璃棒”单动扳机手感与统治百年的套筒偏移闭锁范式',
      en: '6,000-round zero-malfunction pedigree, crisp straight-pull single-action trigger, and the foundational tilting-barrel pistol layout',
    },
    engineeringTradeoff: {
      zh: '单排弹匣容弹量仅 7+1 发，且全锻钢结构 1.1 kg 空重高于现代聚合物双排手枪',
      en: '7+1 single-stack capacity and 1.1 kg all-steel mass trail modern double-stack polymer service pistols',
    },
  },
  mg42: {
    id: 'mg42',
    driveFamily: 'short_recoil_barrel',
    lockingFamily: 'roller_or_mass_blowback',
    feedFamily: 'disintegrating_belt_shuttle',
    driveDetail: {
      zh: '锥形枪口助退器截留高压尾流猛推 530mm 枪管与节套整体短后坐 8.5 mm，开锁瞬间滚柱反推斜楔将能量高效注入 550g 重机框。',
      en: 'Conical muzzle recoil booster traps exit gases to drive the 530mm barrel and extension back 8.5 mm before unlocking cams accelerate the 550g carrier.',
    },
    lockingDetail: {
      zh: '左右两枚对称硬化轴承钢滚柱受击针斜楔外撑死锁于锻钢枪管节套内，完全封闭 390 MPa 膛压，解放冷冲压薄钢板机匣。',
      en: 'Symmetric twin hardened bearing-steel rollers are wedged outward by the firing-pin locking piece into the forged barrel extension, isolating 390 MPa from the stamped receiver.',
    },
    feedDetail: {
      zh: '机框顶柱沿顶盖 S 型曲线轨道驱动双级拨弹爪在后坐与复进双程接力拉动 Gurt 34 不可散钢链与 50 发侧挂突击弹鼓。',
      en: 'A vertical bolt-carrier stud rides the top-cover S-cam to drive dual-stage shuttle pawls across both strokes, feeding Gurt 34 belts and 50-rd assault drums.',
    },
    fireControlDetail: {
      zh: '极简纯全自动开膛待击阻铁配横推 S/F 保险栓，三股绞合复进簧抗 20 Hz 共振断裂。',
      en: 'Rugged full-auto-only open-bolt sear with S/F cross-bolt safety and anti-resonance 3-strand braided driving spring.',
    },
    signatureAdvantage: {
      zh: '冷冲压工时腰斩、5 秒单侧门极速换管、1,200 RPM 压倒性火力与现代西方通用机枪共同的 S 槽供弹血统',
      en: 'Half the machining time via presswork, 5-second side-door barrel swaps, 1,200 RPM suppression, and the S-cam belt feed inherited by NATO machine guns',
    },
    engineeringTradeoff: {
      zh: '极高射速导致弹药消耗巨大且连发 250 发即须频繁换管，纯连发设计对射手食指点放控枪训练要求极高',
      en: 'Blistering cyclic rate devours ammunition rapidly, requires barrel changes every ~250 rounds, and demands disciplined short bursts',
    },
  },
  k98k: {
    id: 'k98k',
    driveFamily: 'manual_bolt_or_revolver_linkage',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '手动 90° 上抬下弯球头拉机柄同步完成开锁、3.5 mm 螺旋预抽壳与顶回击针待击，再直拉 110 mm 完成抽抛壳与推弹闭锁。',
      en: 'Manual 90-degree lift of the bent bolt handle unlocks three lugs, generates 3.5 mm cammed primary extraction, and cocks the striker before a 110 mm linear extraction stroke.',
    },
    lockingDetail: {
      zh: '前端双对称大面积闭锁主突笋锁入 Ø35.8mm 大环锻钢机匣，辅以后根部第三保险突笋与多层泄气孔防炸膛。',
      en: 'Massive symmetrical dual front locking lugs seat into the 35.8 mm large-ring forged receiver, reinforced by a rear third safety lug and multi-stage gas venting.',
    },
    feedDetail: {
      zh: '与木托下缘齐平的 5 发双排交错内置钢制弹仓，支持后桥 5 发黄铜桥夹单指压装，由全长不旋转大抓钩全程受控供弹。',
      en: 'Flush 5-round staggered internal steel magazine top-loaded via 5-round brass stripper clips and positively controlled from mag lips to chamber by the non-rotating claw extractor.',
    },
    fireControlDetail: {
      zh: '三零件极简双支点两道火军用扳机 + 杠杆阻铁，尾套顶置直锁击针的三档翼形旗式机械保险。',
      en: 'Three-part twin-fulcrum two-stage military trigger and pivoting sear paired with Paul Mauser’s direct-striker three-position wing flag safety on the bolt shroud.',
    },
    signatureAdvantage: {
      zh: '全长不旋转大抓钩受控供弹 + 三突笋防爆泄气 + 免工具拆解盘，缔造统治全球 125 年的栓动步枪工业标准',
      en: 'Non-rotating claw controlled-round feed, triple-lug gas safety, and tool-less takedown disk established the 125-year global standard for bolt-action rifles',
    },
    engineeringTradeoff: {
      zh: '手动 90° 抬栓射速（15 发/分）显著低于半自动步枪，且早期竖直旗式保险与低置光学瞄准镜存在空间干涉',
      en: 'Manual 90-degree bolt cycling (~15 rpm) lags semi-auto firepower, and the tall vertical flag safety interferes with low-mounted optical scopes',
    },
  },
  thompson: {
    id: 'thompson',
    driveFamily: 'delayed_or_straight_blowback',
    lockingFamily: 'sliding_wedge_breech',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '开膛半自由枪机配约翰·布利什 45° 斜槽青铜延迟块，靠 72° 枪机斜面与 45° 机匣槽几何角度配比控制开膛时序。',
      en: 'Open-bolt Blish delayed blowback balances 45° inclined receiver rails against 72° bolt ramps via a sliding phosphor-bronze H-piece.',
    },
    lockingDetail: {
      zh: '铸造磷青铜 H 型布利什滑块在闭锁末瞬沿 45° 斜槽前下沉 5.5 mm，借助青铜/钢异质界面高压摩擦阻滞延缓开膛，随后由枪机斜面抬升解锁。',
      en: 'Cast phosphor-bronze H-piece drops 5.5 mm into 45° receiver ears at battery to delay initial opening before camming upward along 72° bolt slots.',
    },
    feedDetail: {
      zh: '50 发 L 型冲压钢发条大弹鼓：前置折叠钥匙上弦 9 响，中心四翼星轮转子沿双圈阿基米德螺旋轨道旋推 .45 ACP 重弹直达顶颈（兼容 20/30 发直匣）。',
      en: '50-round Type L clockwork drum wound 9 clicks drives a central 4-arm spider rotor along concentric Archimedean spiral tracks (also accepts 20/30-rd stick mags).',
    },
    fireControlDetail: {
      zh: '左侧双独立桨式拨片分别控制 FULL AUTO/SINGLE 与 FIRE/SAFE，枪机内置防早发杠杆惯性击锤。',
      en: 'Twin left-side paddles decouple FULL AUTO/SINGLE from FIRE/SAFE, paired with a bolt-mounted pivoting inertia hammer.',
    },
    signatureAdvantage: {
      zh: '50 发圆鼓超大容弹、28 道散热鳍配卡茨防跳器与重型铣削钢壳造就极其平稳的 .45 ACP 近战火力与传世工艺质感',
      en: '50-round drum capacity, 28 cooling fins, Cutts compensator, and milled steel mass deliver smooth .45 ACP control and unmatched heirloom finish',
    },
    engineeringTradeoff: {
      zh: '整块锻钢立铣与布利什斜槽工时极高且空枪重达 4.9 kg（满鼓逾 7 kg），促使二战后期演化出简化自由枪机 M1A1',
      en: 'Expensive billet machining and 4.9 kg empty mass (over 7 kg with loaded drum) led to the simplified wartime straight-blowback M1A1',
    },
  },
  gau8: {
    id: 'gau8',
    driveFamily: 'external_electric_rotary',
    lockingFamily: 'rotating_lug_bolt',
    feedFamily: 'autoloader_carousel_or_blast_bustle',
    driveDetail: {
      zh: '双 38.5 马力（77 HP）3,000 PSI 冗余液压马达外能源强驱 · 遇哑弹直接抽出返鼓零卡炮',
      en: 'Twin 38.5-HP (77 HP) 3,000 PSI redundant hydraulic drive — extracts misfires with zero stoppage',
    },
    lockingDetail: {
      zh: '静止 360° 硬化正弦凸轮套筒驱动 7 套三突笋钛合金炮闩作 300mm 错相波浪闭锁',
      en: 'Stationary 360° sinusoidal cam sleeve cycling 7 three-lug titanium rotary bolts across 300 mm',
    },
    feedDetail: {
      zh: 'Ø876mm 1,150 发无链螺旋弹鼓 + 双通道滑槽 100% 回收空铝壳保战机重心',
      en: 'Ø876mm 1,150-rd linkless helical drum w/ closed-loop spent aluminum case return preserving aircraft CG',
    },
    fireControlDetail: {
      zh: 'A-10 二段扳机液压电控 + 清膛安全门停射自动空转清膛防烤燃',
      en: 'Two-stage stick hydraulic trigger + automatic burst-end clearing sector gate preventing cook-off',
    },
    signatureAdvantage: {
      zh: '每秒 65 发 395g 贫铀/钨芯 30mm 穿甲弹幕（单发 201 kJ），千米外撕碎主战坦克顶甲',
      en: '65 rounds/sec of 395g DU/tungsten 30mm API (201 kJ/rd) shredding tank roof armor past 1,200 m',
    },
    engineeringTradeoff: {
      zh: '整套系统长 6.06 m、满载 1,828 kg、后坐力达 44.5 kN，必须围绕机炮专属打造整架 A-10 攻击机',
      en: '6.06 m length, 1,828 kg loaded mass & 44.5 kN recoil required designing the entire A-10 airframe around it',
    },
  },
};

const DEFAULT_CLASSIFICATION: ShowdownExhibitClassification =
  SHOWDOWN_EXHIBIT_SPECS.ak15;

export function getExhibitClassification(
  weaponId: string
): ShowdownExhibitClassification {
  return SHOWDOWN_EXHIBIT_SPECS[weaponId] ?? DEFAULT_CLASSIFICATION;
}

// ----------------------------------------------------------------------------
// 3. Curated Classic Mechanical Rivalry Presets (13 Live + Wave-2 Auto-Ready)
// ----------------------------------------------------------------------------

export const CLASSIC_RIVALRY_SEEDS: readonly ClassicRivalrySeed[] = [
  {
    id: 'ak15_vs_m4a1',
    weaponA: 'ak15',
    weaponB: 'm4a1',
    pillLabel: {
      zh: 'AK-15 长行程活塞 vs M4A1 斯通纳气吹',
      en: 'AK-15 Long-Stroke vs M4A1 Stoner DI',
    },
    headline: {
      zh: '东西方制式步枪世纪路线之争：大质量长行程活塞双突笋 vs 同轴气吹内活塞七突笋',
      en: 'East vs West Service Rifle Doctrine: Heavy Long-Stroke 2-Lug Piston vs Coaxial DI 7-Lug Carbine',
    },
    verdict: {
      zh: 'AK-15 以大导程长活塞与强锥度 7.62 弹换取极端严寒泥沙可靠性；M4A1 将膨胀气室移入机框内腔并与缓冲管同轴，以最小往复质量换取高初速平顺连发。',
      en: 'AK-15 prioritizes unstoppable extraction in mud and ice via long-stroke mass and tapered 7.62 cases, while M4A1 minimizes reciprocating mass along a pure coaxial bore-to-buffer line.',
    },
  },
  {
    id: 'scar_vs_aug',
    weaponA: 'scar',
    weaponB: 'aug',
    pillLabel: {
      zh: 'SCAR-L 有托模块化 vs AUG 无托20吋管',
      en: 'SCAR-L Folding Carbine vs AUG 20" Bullpup',
    },
    headline: {
      zh: '同为 5.56 NATO 短行程活塞七突笋闭锁：传统有托人机工程 vs 无托后置全尺寸长枪管',
      en: 'Same 5.56mm Short-Stroke Piston & 7-Lug Bolt: Conventional Modular Carbine vs Bullpup Packaging',
    },
    verdict: {
      zh: 'AUG 将弹膛移至握把后方，在比 SCAR 展开态更短的 790 mm 全长内塞入 508 mm 长枪管，白赚 +95 m/s 初速与 +350 J 动能；SCAR 则保留直观双侧快慢机、快拔换匣与无遮挡抛壳安全裕度。',
      en: 'AUG packs a 508 mm rifle barrel inside a 790 mm bullpup (+95 m/s velocity & +350 J energy over SCAR’s 355 mm barrel), whereas SCAR preserves conventional mag changes and crisp trigger geometry.',
    },
  },
  {
    id: 'mp5_vs_p90',
    weaponA: 'mp5',
    weaponB: 'p90',
    pillLabel: {
      zh: 'MP5 滚柱延迟 vs P90 自由枪机+90°螺旋',
      en: 'MP5 Roller-Delayed vs P90 Helical Blowback',
    },
    headline: {
      zh: '反恐冲锋枪与北约单兵防卫武器（PDW）代际碰撞：9×19mm 双滚柱楔铁 vs 5.7×28mm 顶置50发螺旋供弹',
      en: 'Classic SMG vs NATO PDW: 9×19mm Roller-Delayed Wedge vs 5.7×28mm Top 50-Rd 90° Helical Feed',
    },
    verdict: {
      zh: 'MP5 借 G3 步枪 1:4 双滚柱延迟驯服 9mm 闭膛射击精度；P90 改用 715 m/s 小口径穿甲弹配重型自由枪机，并以顶置 90° 螺旋坡道与底部抛壳实现 504 mm 全对称 50 发火力。',
      en: 'MP5 uses 1:4 roller leverage for smooth closed-bolt 9mm accuracy; P90 pairs high-velocity 5.7mm AP rounds with straight blowback, a top 90° helical ramp, and downward ejection.',
    },
  },
  {
    id: 'g17_vs_p320',
    weaponA: 'g17',
    weaponB: 'p320',
    pillLabel: {
      zh: 'G17 一体Safe Action vs P320 模块化FCU',
      en: 'G17 Safe Action vs P320 Modular FCU',
    },
    headline: {
      zh: '两代聚合物平移击针手枪哲学：半待击极低轴线一体机匣 vs 全预压可拆序列号不锈钢火控内胆',
      en: 'Two Eras of Striker-Fired Service Pistols: Low-Bore Safe Action vs Removable Serialized FCU Chassis',
    },
    verdict: {
      zh: 'G17 以半待击击针与无内胆结构压低枪膛轴线抑制后坐上跳；P320 将全部导轨与阻铁集成于可免工具拆出的不锈钢 FCU，实现全预压清脆扳机与跨握把模块化换壳。',
      en: 'G17 achieves an ultra-low bore axis via an integrated frame and half-cocked Safe Action, while P320 isolates a fully-cocked striker system inside a swap-ready stainless FCU.',
    },
  },
  {
    id: 'deagle_vs_g17',
    weaponA: 'deagle',
    weaponB: 'g17',
    pillLabel: {
      zh: '沙漠之鹰 膛底导气回转 vs G17 枪管偏移',
      en: 'Desert Eagle Gas Bolt vs G17 Tilting Barrel',
    },
    headline: {
      zh: '当手枪动能突破 2,000 焦耳：步枪级固定管导气四突笋闭锁 vs 勃朗宁短后坐枪管下倾闭锁',
      en: 'Breaking the 2,000 J Handgun Barrier: Fixed-Barrel Gas Rotating Bolt vs Browning Tilting-Barrel Recoil',
    },
    verdict: {
      zh: '.50 AE 的狂暴冲量是 9×19mm 的近 4 倍，传统勃朗宁下倾开锁套筒难以承受；沙漠之鹰直接移植步枪膛底导气活塞与四突笋回转枪机，换来惊人马格南威力但空重增至 3.2 倍。',
      en: 'Generating nearly 4× the muzzle energy of 9×19mm, Desert Eagle abandons tilting barrels for a fixed barrel, forward gas piston, and 4-lug rotating bolt at 3.2× the unloaded mass.',
    },
  },
  {
    id: 'awm_vs_m82a1',
    weaponA: 'awm',
    weaponB: 'm82a1',
    pillLabel: {
      zh: 'AWM 60°手动栓动 vs M82A1 管退半自动',
      en: 'AWM Manual Bolt-Action vs M82A1 Short-Recoil',
    },
    headline: {
      zh: '超远距狙击与重型反器材分道扬镳：零活动质量浮置冷锻枪管 vs 29吋浮动短后坐重管 + 加速子',
      en: 'Precision Sniper vs Anti-Materiel SASR: Zero-Motion Free-Float Bolt Action vs Short-Recoil .50 BMG',
    },
    verdict: {
      zh: 'AWM 在弹头离膛全程无任何自动机件移动，最大化 .338 LM 远距一致性；M82A1 利用 29 英寸枪管后坐缓冲与双室坦克制退器化解 15.5 kJ 后坐，赋予单兵半自动压制轻装甲能力。',
      en: 'AWM keeps 100% of action components stationary during bullet exit for surgical .338 LM precision, while M82A1 uses barrel recoil and an arrowhead brake to cycle 15.5 kJ .50 BMG semi-automatically.',
    },
  },
  {
    id: 'lift33_vs_r500',
    weaponA: 'lift33',
    weaponB: 'r500',
    pillLabel: {
      zh: 'LIFT 33 双偏心轮猎弓 vs R500 360°螺旋弩',
      en: 'LIFT 33 Binary Bow vs R500 360° Crossbow',
    },
    headline: {
      zh: '现代冷兵器弹性动力学巅峰：70磅人力 85% 省力谷双轮弓 vs 300磅丝杠 360° 螺旋凸轮悬浮弩',
      en: 'Modern Elastic Energy Apex: 70 lb 85% Let-Off Binary Bow vs 300 lb HexCoil 360° Helical Crossbow',
    },
    verdict: {
      zh: '同推 400 格令碳箭，LIFT 33 凭 571.5 mm 超长做功行程与 85% 省力谷以 1.79 kg 轻躯输出 146 J；R500 用丝杠曲柄与 360° 螺旋轮将 300 磅巨力浓缩进 91 mm 窄幅，在 381 mm 行程内暴涨至 301 J（500 FPS）。',
      en: 'Launching the same 400 gr projectile mass, LIFT 33 uses a long 571.5 mm stroke and 85% let-off for featherweight 146 J efficiency, while R500 coils 300 lb over 360° cams to double energy to 301 J.',
    },
  },
  // Wave-2 Auto-Activating Rivalries:
  {
    id: 'ak15_vs_garand',
    weaponA: 'ak15',
    weaponB: 'garand',
    pillLabel: {
      zh: 'AK-15 现代长活塞 vs M1 加兰德 二战鼻祖',
      en: 'AK-15 Kalashnikov vs M1 Garand Ancestor',
    },
    headline: {
      zh: '跨越八十年的长行程导气双突笋回转闭锁血脉：顶装 8 发漏夹半自动 vs 30 发弧形弹匣突击步枪',
      en: '80 Years of Long-Stroke 2-Lug Rotating-Bolt Lineage: WWII En-Bloc Battle Rifle vs Modern Assault Rifle',
    },
    verdict: {
      zh: '卡拉什尼科夫深受加兰德长行程导气拉杆与双突笋回转枪机启发，将枪口下方弯拉杆重构为枪管上方直列连体活塞，并以 30 发中间威力可拆弹匣取代顶装 8 发全威力漏夹。',
      en: 'Kalashnikov evolved Garand’s long-stroke cam-lug rotating bolt by moving the piston coaxial above the barrel and replacing the 8-round .30-06 en-bloc clip with a 30-round intermediate box magazine.',
    },
  },
  {
    id: 'python_vs_deagle',
    weaponA: 'python',
    weaponB: 'deagle',
    pillLabel: {
      zh: '柯尔特蟒蛇 双动转轮 vs 沙漠之鹰 导气半自动',
      en: 'Colt Python Revolver vs Desert Eagle Gas Mag',
    },
    headline: {
      zh: '大威力马格南手枪的两条终极机械解答：纯机械六巢棘轮分度转轮 vs 步枪级膛底导气四突笋套筒',
      en: 'Two Mechanical Answers to Magnum Handguns: DA/SA Revolving Cylinder vs Gas-Operated Rotating Bolt',
    },
    verdict: {
      zh: '蟒蛇以六发独立弹巢彻底消除对膛压曲线与弹壳锥度的挑剔，哑弹再扣即发；沙漠之鹰则借固定三角枪管与前置导气回转枪机突破半自动马格南能量天花板。',
      en: 'Colt Python’s revolving cylinder fires any .357/.38 load with zero gas sensitivity, while Desert Eagle harnesses rifle gas operation to cycle massive .50 AE cartridges semi-automatically.',
    },
  },
  {
    id: 'benellim4_vs_scar',
    weaponA: 'benellim4',
    weaponB: 'scar',
    pillLabel: {
      zh: 'Benelli M4 双活塞管仓 vs SCAR 单活塞盒匣',
      en: 'Benelli M4 ARGO Twin vs SCAR Single Tappet',
    },
    headline: {
      zh: '短行程导气活塞在霰弹与步枪领域的异构演化：ARGO 近膛自调双活塞+升降托板 vs 单活塞+盒式弹匣',
      en: 'Short-Stroke Gas Evolution: Twin Chamber-Mounted ARGO + Tube Elevator vs Single Tappet + Box Mag',
    },
    verdict: {
      zh: '12 号霰弹膛压峰值低（79 MPa）且衰减极快，Benelli M4 必须在紧贴弹膛前方布置双对称 ARGO 活塞截获初段高压气并配升降托弹板供弹；SCAR 则在中段截取 430 MPa 步枪燃气轻推单活塞。',
      en: 'Because 12-gauge pressure peaks low (79 MPa) and decays fast, Benelli M4 mounts twin ARGO pistons right ahead of the chamber with a carrier elevator, whereas SCAR taps 430 MPa gas mid-barrel.',
    },
  },
  // V2.0 Flagship Trio Classic Rivalries:
  {
    id: 'p08_vs_g17',
    weaponA: 'p08',
    weaponB: 'g17',
    pillLabel: {
      zh: '鲁格 P08 过死点肘节 vs G17 勃朗宁偏移套筒',
      en: 'Luger P08 Toggle-Lock vs Glock 17 Tilting Slide',
    },
    headline: {
      zh: '跨越四分之三世纪的 9×19mm 手枪闭锁革命：1908 手工锻钢双连杆屈膝肘节 vs 1982 聚合物矩形弹膛下倾套筒',
      en: '75 Years of 9×19mm Pistol Evolution: 1908 Forged Over-Center Knee-Joint Toggle vs 1982 Polymer Tilting-Barrel Slide',
    },
    verdict: {
      zh: '鲁格 P08 缔造了 9×19mm 弹药并以非倾斜直线枪管与 55° 胡桃木握把树立精度标杆，但暴露铰链畏惧泥沙且造价高昂；格洛克 G17 以一体套筒包覆枪管偏移闭锁与 17 发双排弹匣将容弹量翻倍并减轻 28% 空重。',
      en: 'Luger P08 pioneered 9×19mm with an inline barrel and jewel-like toggle links, whereas Glock 17 enclosed a 2-piece tilting barrel inside a Tenifer slide over a polymer 17-round frame at 28% less weight.',
    },
  },
  {
    id: 'vector_vs_mp5',
    weaponA: 'vector',
    weaponB: 'mp5',
    pillLabel: {
      zh: 'Vector 110°偏轴滑块 vs MP5 双滚柱延迟',
      en: 'KRISS Vector Super V vs HK MP5 Roller-Delayed',
    },
    headline: {
      zh: '冲锋枪延迟闭锁的两大殿堂奇观：21世纪 .45 ACP 110°下沉矢量分解 vs 冷战 9×19mm 1:4 双滚柱楔铁减速',
      en: 'Two Masterpieces of Delayed-Blowback Physics: .45 ACP 110° Off-Axis Vector Slider vs 9mm 45° Dual-Roller Wedge',
    },
    verdict: {
      zh: 'MP5 在同轴机匣内以双圆柱滚柱实现 1:4 动量放大，赋予 9mm 步枪级闭膛精度；Vector 则将枪管压至虎口下方并令配重滑块向斜下方 110° 俯冲，在 1,200 RPM 狂暴射速下驯服双倍截面积的 .45 ACP 重弹。',
      en: 'MP5 keeps all mass coaxial via 1:4 roller-wedge mechanical leverage for surgical 800 RPM 9mm fire, while Vector drops its bore below the hand and dives a slider 110° downward to tame 1,200 RPM .45 ACP recoil.',
    },
  },
  {
    id: 'm249_vs_m4a1',
    weaponA: 'm249',
    weaponB: 'm4a1',
    pillLabel: {
      zh: 'M249 开膛弹链机枪 vs M4A1 闭膛气吹步枪',
      en: 'M249 SAW Open-Bolt Belt vs M4A1 Closed-Bolt DI',
    },
    headline: {
      zh: '美军步兵班同口径 5.56 NATO 火力黄金搭档：开膛长活塞 + 200发可散弹链快拆重管 vs 闭膛气吹 + 30发盒匣轻卡宾',
      en: '5.56 NATO Infantry Squad Fireteam Pair: Open-Bolt Belt-Fed Quick-Change SAW vs Closed-Bolt Direct-Impingement Carbine',
    },
    verdict: {
      zh: '同射 62 格令 M855 步枪弹，M4A1 以 2.92 kg 轻巧闭膛气吹保障精准快速单点；M249 则以 7.5 kg 开膛散热架构、双拨爪 M27 弹链与 3 秒快拆重管提供不惧自燃的 200 发持续火力，并可在弹尽时直接借用 M4 弹匣。',
      en: 'Firing the exact same 5.56mm M855 round, M4A1 optimizes 2.92 kg closed-bolt point accuracy, while M249 trades 7.5 kg mass for open-bolt cooling, 200-round M27 belt suppression, a quick-change barrel, and emergency M4 mag sharing.',
    },
  },
  // WP-17 Clockwork, Subsonic & Rotary Showdowns:
  {
    id: 'g11_vs_an94',
    weaponA: 'g11',
    weaponB: 'an94',
    pillLabel: {
      zh: 'G11 2,100 RPM 无壳钟表 vs AN-94 1,800 RPM 滑轮双发',
      en: 'G11 2,100 RPM Caseless vs AN-94 1,800 RPM Pulley',
    },
    headline: {
      zh: '冷战东西方浮置延迟后坐终极决战：西德 90° 旋转无壳弹膛三连发 vs 苏联钢索定滑轮两级预供弹双发同孔',
      en: 'Cold War Hyperburst Summit: West German 90-Deg Caseless Clockwork 3-Rd Burst vs Soviet Pulley-Cable 2-Rd Hyperburst',
    },
    verdict: {
      zh: '两款冷战机械珠峰皆采用 42 mm 浮置枪管内机匣在后坐抵肩前倾泻超高速点射：G11 彻底废除黄铜弹壳，靠钟表齿轮 90° 旋膛飙出 2,100 RPM 三连发；AN-94 坚守 5.45mm 通用弹匣后勤，以 15° 右倾匣与编织钢索定滑轮二级预供弹硬生生拉出 1,800 RPM 双发同孔奇迹。',
      en: 'Both Cold War clockwork icons float their barreled action 42 mm to fire salvos before shoulder recoil: G11 abolishes brass completely for a 2,100 RPM 3-round rotary-breech burst, whereas AN-94 keeps standard 5.45 mm magazines via a 15-deg cant and pulley-cable pre-feed at 1,800 RPM.',
    },
  },
  {
    id: 'm134_vs_m249',
    weaponA: 'm134',
    weaponB: 'm249',
    pillLabel: {
      zh: 'M134D 3,000 RPM 电驱六管 vs M249 导气弹链轻机枪',
      en: 'M134D 3,000 RPM Electric Rotary vs M249 Gas SAW',
    },
    headline: {
      zh: '持续压制火力的两条物理边界：28V 外能源六管 360° 正弦凸轮风暴 vs 单管长活塞快拆枪管步兵班用弹链',
      en: 'Two Physics Frontiers of Sustained Fire: 28V External Electric 6-Barrel Rotary vs Single-Barrel Gas-Driven SAW',
    },
    verdict: {
      zh: 'M249 以 7.5 kg 单兵可携重量借开膛散热与 3 秒快拆重管维持 800 RPM 5.56 班组火力；M134D 则彻底脱离火药自驱与单管过热红线，用 28V 电机驱动六管 300° 迎风散热与迪伦星轮脱链器，以 3,000 RPM 倾泻双倍动能的 7.62 NATO 弹幕且遇哑弹零停射。',
      en: 'M249 stays infantry-portable at 7.5 kg using open-bolt cooling and a 3-second quick-change barrel for 800 RPM 5.56 mm support; M134D breaks single-barrel thermal limits with 28V electric rotation, 300-deg six-barrel cooling, and a Dillon delinker pouring 3,000 RPM 7.62 NATO with zero dud stoppages.',
    },
  },
  {
    id: 'vss_vs_awm',
    weaponA: 'vss',
    weaponB: 'awm',
    pillLabel: {
      zh: 'VSS 290 m/s 微声斜挡板 vs AWM 936 m/s 超远程 .338',
      en: 'VSS 290 m/s Subsonic Baffle vs AWM 936 m/s .338',
    },
    headline: {
      zh: '狙击物理学的冰火两极：400 米零音爆 9×39mm 整体 6 级斜挡板穿甲 vs 1,500 米 3 倍音速 .338 马格南栓动',
      en: 'Opposite Poles of Sniper Physics: 400 m Silent 9x39mm 6-Baffle Subsonic vs 1,500 m Mach-2.7 .338 Lapua Bolt Action',
    },
    verdict: {
      zh: '二者均采用对称六突笋精密旋转闭锁却走向截然相反的弹道哲学：VSS 将 16.2 克重弹压制在 290 m/s 消除音爆，以多孔枪管、6 级斜挡板与无击锤直线击铁换取绝对隐蔽与公文箱携行；AWM 用 686 mm 浮置重管将同等 250 格令弹头推至 936 m/s，以近 10 倍枪口动能统治 1,500 米外极远距战场。',
      en: 'Both lock symmetrically on six radial bolt lugs yet pursue polar-opposite ballistics: VSS holds a 250-gr bullet at 290 m/s behind radial ports, 6 slanted baffles, and a hammerless linear striker for silent 400 m armor defeat, while AWM launches the same 250-gr mass to 936 m/s with nearly 10x the energy past 1,500 m.',
    },
  },
  // WP-18 Heavy Armor Hall Showdowns (1:1 Main Battle Tanks):
  {
    id: 'ztz99a_vs_m1a2',
    weaponA: 'ztz99a',
    weaponB: 'm1a2',
    pillLabel: {
      zh: 'ZTZ-99A 125mm转盘自装 vs M1A2 隔爆尾舱燃气轮机',
      en: 'ZTZ-99A 125mm Autoloader vs M1A2 Blast-Door Turbine',
    },
    headline: {
      zh: '东西方现役旗舰主战坦克架构巅峰对决：55 吨底置 22 发转盘自装 + 150HB V12 柴油 vs 66.8 吨防爆门人工尾舱 + AGT1500 燃气轮机',
      en: 'East vs West Flagship MBT Doctrine: 55t 125mm Carousel Autoloader V12 Diesel vs 66.8t 120mm Blast-Door Bustle Gas Turbine',
    },
    verdict: {
      zh: 'ZTZ-99A 以 22 发底置转盘自动装弹机省去第 4 名乘员，将战斗全重压低 11.8 吨并借 125mm ZPT-98 L/50 迸发 1,780 m/s（7.60 MJ）超高初速与 27.3 hp/t 机动优势；M1A2 SEP v3 则以气动装甲防爆滑门与顶置泄压板隔离全车弹药，搭配贫铀复合装甲与 AGT1500 燃气轮机瞬态加速构建顶级生存壁垒。',
      en: 'ZTZ-99A saves 11.8 tonnes and one crewman via its 22-round hull carousel autoloader, unleashing 1,780 m/s (7.60 MJ) from a 125mm ZPT-98 at 27.3 hp/t; M1A2 SEP v3 counters with pneumatic blast-door bustle isolation, blow-off roof panels, DU armor, and an AGT1500 gas turbine.',
    },
  },
  {
    id: 'leopard2a7_vs_ztz99a',
    weaponA: 'leopard2a7',
    weaponB: 'ztz99a',
    pillLabel: {
      zh: '豹 2A7V L/55A1空心箭簇 vs ZTZ-99A FY-4爆反125mm',
      en: 'Leopard 2A7V L/55A1 Wedge vs ZTZ-99A FY-4 ERA',
    },
    headline: {
      zh: '当代顶级双涡轮 V12 主战坦克穿甲与装甲路线之争：6.6 米 L/55A1 滑膛炮 + 空心楔形箭簇 vs 125mm ZPT-98 + FY-4 双防重型爆反',
      en: 'Modern V12 Diesel Armor Clash: 6.6 m Rh-120 L/55A1 Hollow Spaced Wedges vs 125mm ZPT-98 & FY-4 Heavy Dual-ERA',
    },
    verdict: {
      zh: '豹 2A7V 将 120mm 炮管拉长至 55 倍径（6.60 m）把北约 DM63A1 推至 1,750 m/s，炮塔前部以中空楔形复合装甲剪切折断来袭长杆弹芯，并靠 15 分钟快换 MTU 动力包称雄后勤；ZTZ-99A 则在更紧凑车体上以 125mm 超高速钨芯弹配合 FY-4 重型爆炸反应装甲主动剪切对抗动能与破甲双威胁。',
      en: 'Leopard 2A7V stretches its 120mm bore to 6.60 m (L/55A1) for 1,750 m/s DM63A1 fire, using hollow arrowhead wedges to snap incoming darts and a 15-minute EuroPowerpack; ZTZ-99A pairs 125mm 1,780 m/s firepower with FY-4 heavy ERA bricks in an 11.5-tonne lighter frame.',
    },
  },
  {
    id: 'm1a2_vs_tiger1',
    weaponA: 'm1a2',
    weaponB: 'tiger1',
    pillLabel: {
      zh: 'M1A2 贫铀复合/燃气轮机 vs 虎式 131 百毫米均质钢/88炮',
      en: 'M1A2 DU/Turbine vs Tiger 131 100mm RHA / 88mm',
    },
    headline: {
      zh: '跨越八十年的陆战之王代际鸿沟：670 MPa 贫铀滑膛 + 隔爆尾舱 + 1,500 hp 燃机 vs 320 MPa 88mm 线膛 + 100mm 均质钢 + 交错负重轮',
      en: '80 Years of Heavy Armor Evolution: 670 MPa Chobham/DU & 1,500 hp Turbine vs 320 MPa 88mm KwK 36 & 100mm Rolled Steel',
    },
    verdict: {
      zh: '1943 年虎式 131 以 57 吨车重承载 100 mm 垂直均质钢与 773 m/s 88mm KwK 36 线膛炮（3.05 MJ）震慑战场；八十年后 M1A2 SEP v3 仅增重 17%，却借滑膛脱壳穿甲弹将膛压翻倍至 670 MPa、初速拉升至 1,670 m/s（6.73 MJ）、动力暴涨至 1,500 hp 并以隔爆尾舱与复合装甲将防护等效放大近十倍！',
      en: 'In 1943 Tiger 131 ruled battlefields with 100 mm vertical steel and a 773 m/s 88mm KwK 36 (3.05 MJ) at 57 tonnes; 80 years later M1A2 adds just 17% mass while doubling pressure to 670 MPa, surging to 1,670 m/s (6.73 MJ) and 1,500 hp with multi-layer composite armor and blast-door survival.',
    },
  },
  {
    id: 'win94_vs_garand',
    weaponA: 'winchester1894',
    weaponB: 'garand',
    pillLabel: {
      zh: '温彻斯特 1894 杠杆管仓 vs M1 加兰德导气漏夹',
      en: 'Winchester 94 Lever vs M1 Garand Gas',
    },
    headline: {
      zh: '美国百年步枪自动化转型之路：1894 勃朗宁 D 型杠杆垂直闭锁 vs 1936 加兰德长行程导气漏夹',
      en: 'American Rifle Evolution: 1894 Browning Lever Vertical Wedge vs 1936 Garand Gas Rotating Bolt',
    },
    verdict: {
      zh: '两代黑胡桃木实木钢枪映照四十二年机械跨越：温彻斯特 1894 借纯手工 53° 拨杆与管式弹仓让平头 .30-30 实现随时单发侧门补弹与轻盈平衡；M1 加兰德则通过枪口导气自动旋转双突笋取代人手拨杆，释放全威力 .30-06 尖头弹压制火力！',
      en: 'Two American walnut-and-steel icons separated by 42 years: the 1894 harnesses finger-lever leverage, top ejection, and continuous side-gate tubular loading, while the 1936 Garand recruits muzzle gas to auto-rotate twin bolt lugs for spitzer .30-06 volume of fire.',
    },
  },
  {
    id: 'rem870_vs_benellim4',
    weaponA: 'rem870',
    weaponB: 'benellim4',
    pillLabel: {
      zh: '雷明顿 870 双杆泵动 vs 伯奈利 M4 ARGO 自动',
      en: 'Remington 870 Pump vs Benelli M4 ARGO',
    },
    headline: {
      zh: '12 号战斗霰弹枪巅峰对决：双平行钢推杆斜楔泵动 vs 双近膛 ARGO 短活塞自调半自动',
      en: '12-Gauge Combat Shotgun Showdown: Twin-Bar Tilting-Wedge Pump vs Twin-ARGO Semi-Auto',
    },
    verdict: {
      zh: '使用完全同款 12 号 00 号鹿弹：雷明顿 870 靠双平行钢推杆与全钢机匣直接以人手强力泵动通吃低威橡胶弹至 3 英寸马格南，机械零对弹药燃气依赖；伯奈利 M4 则以双对称 ARGO 自调泄压气室全自动完成闭锁与抛壳，将连射速度成倍放大！',
      en: 'Shooting identical 12-gauge 00 buckshot: the Remington 870 uses human-powered dual steel action bars and a billet steel receiver to digest any load regardless of gas energy, whereas Benelli M4 pairs twin self-regulating ARGO pistons with a 2-lug rotating bolt for semi-automatic rapid fire.',
    },
  },
  // V6.0 Wave 2 Classic & Heavy Ordnance Showdowns:
  {
    id: 'm1911_vs_p08',
    weaponA: 'm1911',
    weaponB: 'p08',
    pillLabel: {
      zh: '柯尔特 M1911A1 单绞链 vs 鲁格 P08 肘节',
      en: 'Colt M1911A1 Link vs Luger P08 Toggle',
    },
    headline: {
      zh: '两次世界大战王牌手枪世纪对决：美国 .45 ACP 单绞链套筒 vs 德国 9mm 双连杆屈膝肘节',
      en: 'World Wars Sidearm Clash: U.S. .45 ACP Swinging Link vs German 9mm Knee-Joint Toggle',
    },
    verdict: {
      zh: '两款诞生于二十世纪初的军用手枪走了截然相反的机械道路：鲁格 P08 以精密钟表般的过死点屈膝肘节与 55° 握把缔造 9×19mm 传奇；柯尔特 M1911A1 则凭借全包防尘套筒与 0.278" 单绞链在 6,000 发泥沙酷刑中零故障封神，并最终塑造了整个现代自动手枪工业！',
      en: 'Two iconic early-1900s sidearms took opposite kinematic paths: the Luger P08 paired watchmaker toggle links with a 55-deg grip to pioneer 9x19mm, while the M1911A1 paired an enclosing dust-proof slide with a 0.278" swinging link to survive 6,000 rounds unscathed and define modern pistols.',
    },
  },
  {
    id: 'm1911_vs_g17',
    weaponA: 'm1911',
    weaponB: 'g17',
    pillLabel: {
      zh: 'M1911A1 单绞链全钢 vs Glock 17 无绞链聚合物',
      en: 'M1911A1 Steel Link vs Glock 17 Linkless',
    },
    headline: {
      zh: '跨越七十年的勃朗宁闭锁传承：1911 锻钢单绞链单动 vs 1982 聚合物开式凸轮平移击针',
      en: '70 Years of Browning Lockup: 1911 Forged Swinging Link vs 1982 Polymer Linkless Cam',
    },
    verdict: {
      zh: '加斯顿·格洛克将勃朗宁的双顶筋简化为直接卡入抛壳窗的方形膛室、以固定斜坡取代了单绞链，并以聚合物底把将容弹量翻倍至 17 发；但 M1911A1 凭借纯直线滑动单动扳机与沉稳锻钢配重，至今仍稳居手枪击发手感的至高殿堂！',
      en: 'Gaston Glock streamlined Browning’s ribs into a squared ejection-port lock, replaced the swinging link with an open cam ramp, and doubled capacity to 17 rounds—yet the M1911A1’s linear single-action trigger remains the gold standard of handgun feel.',
    },
  },
  {
    id: 'k98k_vs_garand',
    weaponA: 'k98k',
    weaponB: 'garand',
    pillLabel: {
      zh: '毛瑟 98k 三突笋桥夹 vs M1 加兰德导气漏夹',
      en: 'Mauser K98k Bolt vs M1 Garand Gas',
    },
    headline: {
      zh: '二战步兵制式主战步枪终极交锋：德国 7.92mm 手动受控栓动 vs 美国 .30-06 八发半自动导气',
      en: 'WWII Service Rifle Clash: German 7.92mm Mauser 98 Bolt vs U.S. .30-06 Semi-Auto Garand',
    },
    verdict: {
      zh: '毛瑟 Karabiner 98k 将 1898 年三突笋防爆闭锁与全长不旋转大抓钩受控供弹推向机械可靠性巅峰；M1 加兰德则以膛口长行程导气活塞与 8 发弹夹漏夹赋予美军步兵压倒性半自动火力密度——前者铸就百年民用与狙击栓动标准，后者宣告自动装填时代不可逆转地降临！',
      en: 'The Mauser K98k perfected triple-lug safety and non-rotating claw controlled feeding into the benchmark bolt action, whereas the M1 Garand harnessed muzzle gas and 8-round en-bloc clips to deliver overwhelming semi-automatic squad firepower.',
    },
  },
  {
    id: 'k98k_vs_awm',
    weaponA: 'k98k',
    weaponB: 'awm',
    pillLabel: {
      zh: '毛瑟 K98k 90° 受控栓动 vs AWM 60° 现代狙击',
      en: 'Mauser K98k 90° CRF vs AWM 60° Modern Bolt',
    },
    headline: {
      zh: '跨越一个世纪的旋转栓动进化：1898 90° 双前突笋+不旋转大抓钩 vs 1996 60° 六突笋推弹供弹',
      en: 'A Century of Bolt-Action Evolution: 1898 90° Claw CRF vs 1996 60° 6-Lug Push Feed',
    },
    verdict: {
      zh: '从 90° 双主突笋加后第三保险突笋的不旋转抓钩，演进至 60° 短抬行程六突笋与铝合金底盘可拆弹匣，毛瑟 98 奠定的前突笋闭锁与受控泄气基因仍深深镌刻在每一支现代远程高精度狙击步枪之中。',
      en: 'From 90-deg twin front lugs and a full-length claw extractor to 60-deg 6-lug chassis repeaters, Paul Mauser’s front-locking, gas-vented architecture remains the DNA of modern precision rifles.',
    },
  },
  {
    id: 'mg42_vs_m249',
    weaponA: 'mg42',
    weaponB: 'm249',
    pillLabel: {
      zh: 'MG 42 双滚柱 1,200 RPM vs M249 长活塞 S 槽',
      en: 'MG 42 1,200 RPM Roller vs M249 SAW',
    },
    headline: {
      zh: '两代通用与班用机枪血脉对决：1942 冷冲压双滚柱短后坐 7.92mm vs 1984 长行程活塞 5.56mm 弹链',
      en: 'Machine Gun Lineage: 1942 Stamped Twin-Roller 7.92mm MG 42 vs 1984 Long-Stroke 5.56mm M249 SAW',
    },
    verdict: {
      zh: 'MG 42 用冷冲压钢板、5 秒快拆枪管、锥形助退双滚柱与顶盖 S 槽双向拨弹爪重新定义了现代机枪；四十余年后 FN M249 完整继承了 MG 42 的顶盖 S 槽双向拉链构型，改用 5.56 NATO 长行程导气并新增步枪弹匣应急供弹井。',
      en: 'The MG 42 redefined automatic support via stamped sheet steel, 5-second barrel swaps, muzzle-boosted rollers, and its top-cover S-cam feed—the exact belt shuttle blueprint FN M249 inherited for 5.56 NATO with an added STANAG backup mag well.',
    },
  },
  {
    id: 'thompson_vs_vector',
    weaponA: 'thompson',
    weaponB: 'vector',
    pillLabel: {
      zh: '汤姆逊青铜布利什圆鼓 vs KRISS Super V',
      en: 'Thompson Blish Drum vs KRISS Super V',
    },
    headline: {
      zh: '跨越九十年 .45 ACP 冲锋枪巅峰对决：1928 整钢铣削 45° 布利什+50发圆鼓 vs 2009 偏轴 110° 垂直滑块',
      en: '90 Years of .45 ACP SMGs: 1928 Milled Bronze Blish 50-Rd Drum vs 2009 Off-Axis Super V Slider',
    },
    verdict: {
      zh: '同为发射重达 230 格令 .45 ACP 亚音速重弹的传奇冲锋枪：汤姆逊 M1928A1 靠 4.9 kg 铣削钢重量、青铜布利什斜槽与卡茨防跳器压稳 750 RPM 弹幕；KRISS Vector 则将后坐动量 110° 下折导入握把前方滑槽，以一半重量驯服 1,200 RPM 狂飙射速。',
      en: 'Both tame heavy 230-gr .45 ACP automatic fire by opposite physics: Thompson relies on 4.9 kg milled steel inertia, a 45° bronze Blish lock, and Cutts jets at 750 RPM, whereas Vector redirects recoil 110° downward to master 1,200 RPM at half the mass.',
    },
  },
  {
    id: 'thompson_vs_mp5',
    weaponA: 'thompson',
    weaponB: 'mp5',
    pillLabel: {
      zh: '汤姆逊青铜布利什开膛 vs MP5 滚柱延迟闭膛',
      en: 'Thompson Bronze Blish vs HK MP5 Roller',
    },
    headline: {
      zh: '延迟闭锁冲锋枪两大经典学派：1928 磷青铜 45° 斜槽开膛 .45 vs 1966 1:4 双滚柱闭膛 9mm',
      en: 'Delayed Blowback Schools: 1928 Open-Bolt Bronze Blish .45 vs 1966 Closed-Bolt Roller-Delayed 9mm',
    },
    verdict: {
      zh: '汤姆逊以整块锻钢铣削机匣、开膛青铜布利什锁与 50 发发条螺旋鼓铸就近战火力图腾；MP5 则引入冷冲压钢机匣与闭膛击锤 1:4 滚柱楔铁延迟，将冲锋枪的首发精准度与轻量化推向反恐战术新高度。',
      en: 'Thompson embodies solid-billet craftsmanship, open-bolt Blish delay, and 50-round clockwork suppression, while MP5 perfected stamped receivers and 1:4 closed-bolt roller leverage for surgical CQB precision.',
    },
  },
  {
    id: 'gau8_vs_m134',
    weaponA: 'gau8',
    weaponB: 'm134',
    pillLabel: {
      zh: 'GAU-8/A 30mm 复仇者 vs M134D 7.62mm 迷你炮',
      en: 'GAU-8/A 30mm Avenger vs M134D Minigun',
    },
    headline: {
      zh: '现代加特林转管兵器大小王对决：6 米 77 马力液压七管 30mm 航炮 vs 3.2 马力电驱六管 7.62mm 直升机炮',
      en: 'Rotary Gatling Apex: 6.06 m 77-HP Hydraulic 30mm Avenger vs 3.2-HP Electric 7.62mm Minigun',
    },
    verdict: {
      zh: '同出通用电气 360° 静止正弦凸轮与星形转子血统：M134D 以 28V 电机驱动六管 3,000 RPM 扫射 7.62 NATO（3.3 kJ/发）；GAU-8/A 将其等比放大至超越甲壳虫轿车的 6.06 米 1.83 吨巨兽，以 77 马力双液压马达轰出每秒 65 发 30mm 贫铀穿甲弹（单发 201 kJ——能量飙升 60 倍）！',
      en: 'Sharing General Electric’s stationary 360° sinusoidal cam heritage, the M134D spins six 7.62 NATO barrels at 3,000 RPM (3.3 kJ/rd), whereas the 6.06 m, 1,828 kg GAU-8/A scales up to twin 77-HP hydraulic motors pouring 65 rounds/sec of 201 kJ 30mm DU API!',
    },
  },
  {
    id: 'gau8_vs_ztz99a',
    weaponA: 'gau8',
    weaponB: 'ztz99a',
    pillLabel: {
      zh: 'GAU-8/A 30mm 穿甲风暴 vs ZTZ-99A 主战坦克',
      en: 'GAU-8/A 30mm API vs ZTZ-99A MBT',
    },
    headline: {
      zh: '现代空地矛与盾的极致尺度碰撞：每秒 65 发 30mm 俯冲顶攻暴雨 vs 125mm 7.60 MJ 单发重锤与 FY-4 复合装甲',
      en: 'Air-to-Armor Physics Duel: 3,900 RPM 30mm API Saturation vs 125mm 7.60 MJ Single-Shot & FY-4 ERA',
    },
    verdict: {
      zh: '两座 1:1 真实尺度的机械巨兽同台较量：ZTZ-99A 将全部 7.60 兆焦动能浓缩于单发 1,780 m/s 125mm 钨芯长杆穿甲弹以正面对穿 700mm+ 复合主甲；GAU-8/A 则凭借 A-10 攻击机 30° 俯冲航线，在一秒内向坦克相对薄弱的顶甲与动力舱倾泻 65 发累计 13.1 兆焦的 30mm 贫铀穿甲暴雨！',
      en: 'Two 1:1 titans of modern ordnance: ZTZ-99A concentrates 7.60 MJ into one 1,780 m/s 125mm dart defeating 700+ mm frontal composite armor, while GAU-8/A delivers 65 rounds (13.1 MJ aggregate) per second onto vulnerable roof and engine-deck armor from a diving A-10!',
    },
  },
];

// ----------------------------------------------------------------------------
// 4. Runtime Filtering, Quantitative Metric Extraction & Curve Sampling
// ----------------------------------------------------------------------------

export interface PendingShowdownLaunch {
  mode: 'matrix' | 'showdown';
  weaponA: string;
  weaponB: string;
}

let pendingShowdownLaunch: PendingShowdownLaunch | null = null;

export function queueMechanismShowdownLaunch(
  mode: 'matrix' | 'showdown',
  weaponA: string,
  weaponB?: string
): void {
  pendingShowdownLaunch = {
    mode,
    weaponA,
    weaponB: weaponB ?? getSuggestedRivalWeaponId(weaponA),
  };
}

export function consumePendingShowdownLaunch(): PendingShowdownLaunch | null {
  const req = pendingShowdownLaunch;
  pendingShowdownLaunch = null;
  return req;
}

export function getActiveShowdownWeaponIds(
  weaponIds?: readonly string[]
): string[] {
  if (weaponIds && weaponIds.length > 0) {
    return [...weaponIds];
  }
  return ARMORY_WEAPONS.map((w) => w.id);
}

export function getLocalizedAxisMeta(
  axis: TaxonomyAxisId,
  lang: LanguageCode
): { id: TaxonomyAxisId; code: string; title: string; subtitle: string } {
  const found =
    MECHANISM_TAXONOMY_AXES.find((a) => a.id === axis) ??
    MECHANISM_TAXONOMY_AXES[0];
  return {
    id: found.id,
    code: found.code,
    title: found.title[lang],
    subtitle: found.subtitle[lang],
  };
}

export function getTaxonomyFamiliesForAxis(
  axis: TaxonomyAxisId,
  lang: LanguageCode,
  weaponIds?: readonly string[],
  includeEmpty = false
): LocalizedMechanismFamily[] {
  const activeIds = getActiveShowdownWeaponIds(weaponIds);
  const seeds: readonly MechanismFamilySeed[] =
    axis === 'drive'
      ? DRIVE_FAMILIES
      : axis === 'locking'
        ? LOCKING_FAMILIES
        : FEED_FAMILIES;

  const out: LocalizedMechanismFamily[] = [];
  for (const seed of seeds) {
    const exhibitIds = activeIds.filter((wid) => {
      const cls = getExhibitClassification(wid);
      if (axis === 'drive') return cls.driveFamily === seed.id;
      if (axis === 'locking') return cls.lockingFamily === seed.id;
      return cls.feedFamily === seed.id;
    });
    if (!includeEmpty && exhibitIds.length === 0) continue;
    out.push({
      id: seed.id as AnyMechanismFamilyId,
      axis,
      accentHex: seed.accentHex,
      badge: seed.badge[lang],
      title: seed.title[lang],
      principle: seed.principle[lang],
      pros: seed.pros[lang],
      cons: seed.cons[lang],
      exhibitIds,
    });
  }
  return out;
}

export function getClassicRivalryPresets(
  lang: LanguageCode,
  weaponIds?: readonly string[]
): LocalizedClassicRivalry[] {
  const activeSet = new Set(getActiveShowdownWeaponIds(weaponIds));
  const out: LocalizedClassicRivalry[] = [];
  for (const seed of CLASSIC_RIVALRY_SEEDS) {
    if (!activeSet.has(seed.weaponA) || !activeSet.has(seed.weaponB)) continue;
    out.push({
      id: seed.id,
      weaponA: seed.weaponA,
      weaponB: seed.weaponB,
      pillLabel: seed.pillLabel[lang],
      headline: seed.headline[lang],
      verdict: seed.verdict[lang],
    });
  }
  return out;
}

export function findMatchingRivalryPreset(
  weaponA: string,
  weaponB: string,
  lang: LanguageCode,
  weaponIds?: readonly string[]
): LocalizedClassicRivalry | null {
  const presets = getClassicRivalryPresets(lang, weaponIds);
  return (
    presets.find(
      (p) =>
        (p.weaponA === weaponA && p.weaponB === weaponB) ||
        (p.weaponA === weaponB && p.weaponB === weaponA)
    ) ?? null
  );
}

/**
 * Returns the most instructive comparison counterpart for `weaponId` among
 * currently active vault exhibits (`!== weaponId`).
 */
export function getSuggestedRivalWeaponId(
  weaponId: string,
  weaponIds?: readonly string[]
): string {
  const activeIds = getActiveShowdownWeaponIds(weaponIds);
  const activeSet = new Set(activeIds);

  for (const seed of CLASSIC_RIVALRY_SEEDS) {
    if (seed.weaponA === weaponId && activeSet.has(seed.weaponB)) {
      return seed.weaponB;
    }
    if (seed.weaponB === weaponId && activeSet.has(seed.weaponA)) {
      return seed.weaponA;
    }
  }

  const selfCls = getExhibitClassification(weaponId);
  const sameLockDifferentDrive = activeIds.find((id) => {
    if (id === weaponId) return false;
    const cls = getExhibitClassification(id);
    return (
      cls.lockingFamily === selfCls.lockingFamily &&
      cls.driveFamily !== selfCls.driveFamily
    );
  });
  if (sameLockDifferentDrive) return sameLockDifferentDrive;

  return activeIds.find((id) => id !== weaponId) ?? activeIds[0] ?? 'm4a1';
}

/** Parses primary numeric measurement before parenthetical notes (supports comma thousands & ranges like `880–940`). */
function parseMaxLeadingMetric(raw: string, fallback: number): number {
  const head = raw.split('(')[0].replace(/,/g, '');
  const matches = head.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return fallback;
  let maxVal = Number(matches[0]);
  for (let i = 1; i < matches.length; i++) {
    const v = Number(matches[i]);
    // Only take range upper bound when connected by en-dash/hyphen (`880–940 mm`), not twist ratio (`1:240`)
    if (head.includes('–') || head.includes('-')) {
      if (v > maxVal) maxVal = v;
    }
  }
  return Number.isFinite(maxVal) && maxVal > 0 ? maxVal : fallback;
}

function parseFirstPositiveNumber(raw: string, fallback: number): number {
  const cleaned = raw.replace(/,/g, '');
  const m = cleaned.match(/\d+(?:\.\d+)?/);
  if (!m) return fallback;
  const v = Number(m[0]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function parseCyclicRpm(raw: string): number | null {
  if (!/(发\/分|rpm)/i.test(raw)) return null;
  const cleaned = raw.replace(/,/g, '');
  const nums = cleaned.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  if (nums.length >= 2 && (cleaned.includes('–') || cleaned.includes('-'))) {
    const lo = Number(nums[0]);
    const hi = Number(nums[1]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo) {
      const avg = Math.round((lo + hi) * 0.5);
      return avg >= 200 ? avg : null;
    }
  }
  const val = Number(nums[0]);
  return Number.isFinite(val) && val >= 200 ? Math.round(val) : null;
}

/**
 * Resolves live quantitative metrics + bilingual mechanical taxonomy profile for any
 * registered `WeaponId` (or pre-populated Wave-2 exhibit ID).
 */
export function getShowdownExhibitProfile(
  weaponId: string,
  lang: LanguageCode
): ShowdownExhibitProfile {
  const cls = getExhibitClassification(weaponId);
  const driveSeed = DRIVE_FAMILY_MAP[cls.driveFamily];
  const lockingSeed = LOCKING_FAMILY_MAP[cls.lockingFamily];
  const feedSeed = FEED_FAMILY_MAP[cls.feedFamily];

  if (isWeaponId(weaponId)) {
    const manifest = getWeaponManifest(weaponId);
    const cat = manifest.catalog;
    const display = resolveWeaponDisplayMeta(weaponId, lang, null);
    const catSpecs = getLocalizedCatalogSpecs(weaponId, lang);
    const calSpec = getCaliberBallisticsSpec(manifest.caliberProfile);
    const timingRaw = getWeaponFiringTiming(weaponId);
    const archery =
      isArcheryWeapon(weaponId) || isArcheryCaliber(manifest.caliberProfile);

    const muzzleVelocityMps = parseFirstPositiveNumber(
      cat.specs1To1.muzzleVelocityMs,
      calSpec.muzzleVelocityMps
    );
    const projectileMassG = calSpec.projectileMassG;
    const muzzleEnergyJ =
      0.5 * (projectileMassG / 1000) * muzzleVelocityMps * muzzleVelocityMps;

    const overallLengthMm = parseMaxLeadingMetric(
      cat.specs1To1.overallLengthMm,
      calSpec.referenceBarrelMm * 2
    );
    const barrelOrStrokeMm = parseFirstPositiveNumber(
      cat.specs1To1.barrelSpec,
      calSpec.referenceBarrelMm
    );
    const emptyWeightKg = parseFirstPositiveNumber(
      cat.specs1To1.emptyWeightKg,
      3.0
    );
    const cyclicRateRpm = parseCyclicRpm(cat.specs1To1.rateOfFire);

    const peakLoadValue = archery
      ? (calSpec.archerySpec?.peakDrawForceN ?? calSpec.peakPressureMPa)
      : calSpec.peakPressureMPa;
    const peakLoadUnit: 'MPa' | 'N' = archery ? 'N' : 'MPa';
    const peakLoadFormatted = archery
      ? calSpec.archerySpec
        ? `${Math.round(calSpec.archerySpec.peakDrawForceN)} N (${calSpec.archerySpec.peakDrawForceLb} lb)`
        : `${Math.round(peakLoadValue)} N`
      : `${Math.round(peakLoadValue)} MPa`;

    return {
      id: weaponId,
      bayCode: cat.bayCode,
      modelCode: cat.modelCode,
      shortLabel: getLocalizedShortWeaponLabel(weaponId, lang),
      fullName: display.name,
      originTag: display.originTag,
      caliberLabel: catSpecs.caliber,
      compactCaliber: catSpecs.compactCaliber,
      available: cat.available,
      isArchery: archery,
      driveFamily: cls.driveFamily,
      lockingFamily: cls.lockingFamily,
      feedFamily: cls.feedFamily,
      driveFamilyTitle: driveSeed.title[lang],
      driveFamilyBadge: driveSeed.badge[lang],
      lockingFamilyTitle: lockingSeed.title[lang],
      lockingFamilyBadge: lockingSeed.badge[lang],
      feedFamilyTitle: feedSeed.title[lang],
      feedFamilyBadge: feedSeed.badge[lang],
      driveDetail: cls.driveDetail[lang],
      lockingDetail: cls.lockingDetail[lang],
      feedDetail: cls.feedDetail[lang],
      fireControlDetail: cls.fireControlDetail[lang],
      signatureAdvantage: cls.signatureAdvantage[lang],
      engineeringTradeoff: cls.engineeringTradeoff[lang],
      peakLoadValue,
      peakLoadUnit,
      peakLoadFormatted,
      standardLabel: calSpec.standard,
      muzzleVelocityMps,
      muzzleEnergyJ,
      projectileMassG,
      overallLengthMm,
      barrelOrStrokeMm,
      emptyWeightKg,
      partsCount: cat.partsCount,
      cyclicRateRpm,
      rateOfFireDisplay: display.rateOfFire,
      timing: {
        ignitionF: timingRaw.ignitionF,
        peakF: computePeakPressureF(manifest.caliberProfile, timingRaw),
        muzzleExitF: timingRaw.muzzleExitF,
        safeUnlockF: computeSafeUnlockF(manifest.caliberProfile, timingRaw),
        ejectF: timingRaw.ejectF,
        batteryF: timingRaw.batteryF,
        gasPortUncoverF: computeGasPortUncoverF(
          manifest.caliberProfile,
          timingRaw
        ),
      },
    };
  }

  // Pre-populated Wave-2 fallback path (used before Wave 2 registers ID in `WEAPON_IDS`)
  const fb =
    cls.fallbackCatalog ?? SHOWDOWN_EXHIBIT_SPECS.python.fallbackCatalog!;
  const energyJ =
    0.5 *
    (fb.projectileMassG / 1000) *
    fb.muzzleVelocityMps *
    fb.muzzleVelocityMps;

  return {
    id: weaponId,
    bayCode: fb.bayCode,
    modelCode: fb.modelCode,
    shortLabel: fb.shortLabel[lang],
    fullName: fb.fullName[lang],
    originTag: fb.originTag[lang],
    caliberLabel: fb.caliber[lang],
    compactCaliber: fb.compactCaliber[lang],
    available: true,
    isArchery: fb.isArchery,
    driveFamily: cls.driveFamily,
    lockingFamily: cls.lockingFamily,
    feedFamily: cls.feedFamily,
    driveFamilyTitle: driveSeed.title[lang],
    driveFamilyBadge: driveSeed.badge[lang],
    lockingFamilyTitle: lockingSeed.title[lang],
    lockingFamilyBadge: lockingSeed.badge[lang],
    feedFamilyTitle: feedSeed.title[lang],
    feedFamilyBadge: feedSeed.badge[lang],
    driveDetail: cls.driveDetail[lang],
    lockingDetail: cls.lockingDetail[lang],
    feedDetail: cls.feedDetail[lang],
    fireControlDetail: cls.fireControlDetail[lang],
    signatureAdvantage: cls.signatureAdvantage[lang],
    engineeringTradeoff: cls.engineeringTradeoff[lang],
    peakLoadValue: fb.peakLoadValue,
    peakLoadUnit: fb.isArchery ? 'N' : 'MPa',
    peakLoadFormatted: fb.peakLoadFormatted[lang],
    standardLabel: fb.standardLabel,
    muzzleVelocityMps: fb.muzzleVelocityMps,
    muzzleEnergyJ: energyJ,
    projectileMassG: fb.projectileMassG,
    overallLengthMm: fb.overallLengthMm,
    barrelOrStrokeMm: fb.barrelOrStrokeMm,
    emptyWeightKg: fb.emptyWeightKg,
    partsCount: fb.partsCount,
    cyclicRateRpm: fb.cyclicRateRpm,
    rateOfFireDisplay: fb.rateOfFireDisplay[lang],
    timing: {
      ignitionF: fb.timing.ignitionF,
      peakF: computePeakPressureF(fb.caliberProfileFallback, fb.timing),
      muzzleExitF: fb.timing.muzzleExitF,
      safeUnlockF: computeSafeUnlockF(fb.caliberProfileFallback, fb.timing),
      ejectF: fb.timing.ejectF,
      batteryF: fb.timing.batteryF,
      gasPortUncoverF: computeGasPortUncoverF(
        fb.caliberProfileFallback,
        fb.timing
      ),
    },
  };
}

const scratchSample = createInternalBallisticsSample('9mm_para');

/**
 * Samples coupled internal ballistics ($P(f)$ / Draw Thrust & $V(f)$) across $f \in [0, 1]$
 * using the zero-allocation physics evaluator in `armoryPhysics.ts`, scaled to the
 * exhibit's exact barrel/stroke factory velocity.
 */
export function sampleShowdownBallisticsCurve(
  weaponId: string,
  sampleCount = 96
): ShowdownCurvePoint[] {
  const count = Math.max(16, Math.min(256, Math.floor(sampleCount)));
  const profile = getShowdownExhibitProfile(weaponId, 'en');

  let calProfile: CaliberProfile = '9mm_para';
  let timing: Readonly<WeaponFiringTiming> = DEFAULT_FIRING_TIMING;
  if (isWeaponId(weaponId)) {
    const manifest = getWeaponManifest(weaponId);
    calProfile = manifest.caliberProfile;
    timing = getWeaponFiringTiming(weaponId);
  } else {
    const fb = getExhibitClassification(weaponId).fallbackCatalog;
    if (fb) {
      calProfile = fb.caliberProfileFallback;
      timing = fb.timing;
    }
  }

  const calSpec = getCaliberBallisticsSpec(calProfile);
  const velScale =
    calSpec.muzzleVelocityMps > 0
      ? profile.muzzleVelocityMps / calSpec.muzzleVelocityMps
      : 1;
  const loadScale =
    calSpec.peakPressureMPa > 0
      ? profile.peakLoadValue / calSpec.peakPressureMPa
      : 1;
  const massKg = profile.projectileMassG / 1000;

  // Combine uniform grid with critical phase knots (ignitionF, peakF, muzzleExitF,
  // safeUnlockF & 12 in-bore sub-steps) so sharp short-bore peaks (MP5, M82A1) hit 1.000 exactly
  const rawKnots: number[] = [];
  for (let i = 0; i <= count; i++) {
    rawKnots.push(i / count);
  }
  rawKnots.push(
    profile.timing.ignitionF,
    profile.timing.peakF,
    profile.timing.muzzleExitF,
    profile.timing.safeUnlockF
  );
  const boreSpan = Math.max(
    0,
    profile.timing.muzzleExitF - profile.timing.ignitionF
  );
  if (boreSpan > 0) {
    for (let j = 1; j < 12; j++) {
      rawKnots.push(profile.timing.ignitionF + (j / 12) * boreSpan);
    }
  }
  rawKnots.sort((a, b) => a - b);

  const knots: number[] = [];
  for (let i = 0; i < rawKnots.length; i++) {
    const f = Math.max(0, Math.min(1, rawKnots[i]));
    if (knots.length === 0 || f - knots[knots.length - 1] > 1e-5) {
      knots.push(f);
    }
  }
  if (knots[knots.length - 1] < 1) {
    knots.push(1);
  }

  const points: ShowdownCurvePoint[] = new Array(knots.length);
  for (let i = 0; i < knots.length; i++) {
    const f = knots[i];
    evaluateInternalBallisticsInto(calProfile, f, scratchSample, timing);
    const p01 = Math.max(0, Math.min(1, scratchSample.pressure01));
    const pRaw = Math.max(0, scratchSample.pressureMPa * loadScale);
    const vMps = Math.max(0, scratchSample.velocityMps * velScale);
    const v01 =
      profile.muzzleVelocityMps > 0
        ? Math.max(0, Math.min(1, vMps / profile.muzzleVelocityMps))
        : 0;
    points[i] = {
      f,
      pressure01: p01,
      pressureRaw: pRaw,
      velocity01: v01,
      velocityMps: vMps,
      energyJ: 0.5 * massKg * vMps * vMps,
    };
  }
  return points;
}

/** Interpolates instantaneous curve values at arbitrary cycle progress `f in [0, 1]` over sorted knots. */
export function interpolateShowdownCurveAt(
  points: readonly ShowdownCurvePoint[],
  fRaw: number
): ShowdownCurvePoint {
  if (points.length === 0) {
    return {
      f: 0,
      pressure01: 0,
      pressureRaw: 0,
      velocity01: 0,
      velocityMps: 0,
      energyJ: 0,
    };
  }
  const f = Math.max(0, Math.min(1, fRaw));
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].f <= f) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const span = b.f - a.f;
  const t = span > 1e-9 ? Math.max(0, Math.min(1, (f - a.f) / span)) : 0;
  return {
    f,
    pressure01: a.pressure01 + (b.pressure01 - a.pressure01) * t,
    pressureRaw: a.pressureRaw + (b.pressureRaw - a.pressureRaw) * t,
    velocity01: a.velocity01 + (b.velocity01 - a.velocity01) * t,
    velocityMps: a.velocityMps + (b.velocityMps - a.velocityMps) * t,
    energyJ: a.energyJ + (b.energyJ - a.energyJ) * t,
  };
}

/**
 * Builds crisp, finite SVG path geometry for dual overlaid A-vs-B ballistics traces.
 * Automatically falls back to `'normalized'` pressure scaling when comparing a firearm
 * (`MPa`) against an archery platform (`N`) so physical units are never conflated.
 */
export function buildShowdownDualSvgGeometry(
  weaponAId: string,
  weaponBId: string,
  requestedScaleMode: ShowdownChartScaleMode = 'normalized',
  sampleCount = 96,
  width = 680,
  height = 240
): ShowdownDualSvgGeometry {
  const profileA = getShowdownExhibitProfile(weaponAId, 'en');
  const profileB = getShowdownExhibitProfile(weaponBId, 'en');
  const pointsA = sampleShowdownBallisticsCurve(weaponAId, sampleCount);
  const pointsB = sampleShowdownBallisticsCurve(weaponBId, sampleCount);

  const crossDomain = profileA.isArchery !== profileB.isArchery;
  const effectiveScaleMode: ShowdownChartScaleMode = crossDomain
    ? 'normalized'
    : requestedScaleMode;

  const plotLeft = 40;
  const plotRight = width - 22;
  const plotTop = 24;
  const plotBottom = height - 30;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  const maxLoadPair = Math.max(
    1,
    profileA.peakLoadValue,
    profileB.peakLoadValue
  );
  const maxVelPair = Math.max(
    1,
    profileA.muzzleVelocityMps,
    profileB.muzzleVelocityMps
  );

  const buildTrace = (
    profile: ShowdownExhibitProfile,
    pts: readonly ShowdownCurvePoint[]
  ): ShowdownSvgTraceGeometry => {
    const loadScaleFactor =
      effectiveScaleMode === 'relative'
        ? profile.peakLoadValue / maxLoadPair
        : 1;
    const velScaleFactor =
      effectiveScaleMode === 'relative'
        ? profile.muzzleVelocityMps / maxVelPair
        : 1;

    const pCoords: string[] = new Array(pts.length);
    const vCoords: string[] = new Array(pts.length);

    let bestP = -1;
    let peakF = profile.timing.peakF;

    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      const x = plotLeft + pt.f * plotW;
      const pNorm = Math.max(0, Math.min(1, pt.pressure01 * loadScaleFactor));
      const vNorm = Math.max(0, Math.min(1, pt.velocity01 * velScaleFactor));
      const py = plotBottom - pNorm * plotH;
      const vy = plotBottom - vNorm * plotH;

      pCoords[i] = `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${py.toFixed(1)}`;
      vCoords[i] = `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${vy.toFixed(1)}`;

      if (pt.pressure01 > bestP) {
        bestP = pt.pressure01;
        peakF = pt.f;
      }
    }

    const exactPeakF = profile.timing.peakF || peakF;
    const peakX = plotLeft + Math.max(0, Math.min(1, exactPeakF)) * plotW;
    const peakY =
      plotBottom - Math.max(0, Math.min(1, loadScaleFactor)) * plotH;

    const pressureLinePath = pCoords.join(' ');
    const pressureAreaPath = `${pressureLinePath} L${plotRight.toFixed(1)},${plotBottom.toFixed(1)} L${plotLeft.toFixed(1)},${plotBottom.toFixed(1)} Z`;
    const velocityLinePath = vCoords.join(' ');

    return {
      pressureLinePath,
      pressureAreaPath,
      velocityLinePath,
      peakMarker: {
        f: exactPeakF,
        x: peakX,
        y: peakY,
        valueFormatted: profile.peakLoadFormatted,
      },
      muzzleExitX:
        plotLeft + Math.max(0, Math.min(1, profile.timing.muzzleExitF)) * plotW,
      points: pts,
    };
  };

  return {
    width,
    height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    effectiveScaleMode,
    crossDomain,
    traceA: buildTrace(profileA, pointsA),
    traceB: buildTrace(profileB, pointsB),
  };
}

export interface ShowdownPeakPillPlacement {
  slot: 'A' | 'B';
  labelText: string;
  textX: number;
  textY: number;
  textAnchor: 'start' | 'end';
  pillX: number;
  pillY: number;
  pillW: number;
  pillH: number;
  leaderX1: number;
  leaderY1: number;
  leaderX2: number;
  leaderY2: number;
  showLeader: boolean;
}

/**
 * Computes collision-free horizontal/vertical SVG pill callout boxes for Exhibit A & B
 * peak pressure/thrust markers. When peaks sit close horizontally (e.g. `|peakA.f - peakB.f| <= 0.22`),
 * anchors the left peak leftward (`textAnchor="end"`) and the right peak rightward (`textAnchor="start"`),
 * clamped strictly inside `[plotLeft, plotRight]` with non-overlapping pill bounds.
 */
export function computeShowdownPeakLabelLayout(
  chartGeo: ShowdownDualSvgGeometry
): {
  peakA: ShowdownPeakPillPlacement;
  peakB: ShowdownPeakPillPlacement;
} {
  const mA = chartGeo.traceA.peakMarker;
  const mB = chartGeo.traceB.peakMarker;
  const textA = `A Peak: ${mA.valueFormatted} @ ${Math.round(mA.f * 100)}%`;
  const textB = `B Peak: ${mB.valueFormatted} @ ${Math.round(mB.f * 100)}%`;

  const padX = 6;
  const pillH = 15;
  const charW = 5.8;
  const wA = Math.ceil(textA.length * charW + padX * 2);
  const wB = Math.ceil(textB.length * charW + padX * 2);

  const minX = chartGeo.plotLeft + 2;
  const maxX = chartGeo.plotRight - 2;
  const clampX = (x: number, w: number) =>
    Math.max(minX, Math.min(maxX - w, x));
  const computePillY = (dotY: number) =>
    Math.max(3, Math.min(chartGeo.plotBottom - pillH - 2, dotY - pillH - 5));

  const yA = computePillY(mA.y);
  const yB = computePillY(mB.y);

  const closeHoriz =
    Math.abs(mA.f - mB.f) <= 0.22 ||
    Math.abs(mA.x - mB.x) < Math.max(wA, wB) + 18;

  let anchorA: 'start' | 'end';
  let anchorB: 'start' | 'end';
  let xA: number;
  let xB: number;

  if (closeHoriz) {
    const aIsLeft = mA.x < mB.x || (mA.x === mB.x && mA.f <= mB.f);
    if (aIsLeft) {
      anchorA = 'end';
      anchorB = 'start';
      xA = clampX(mA.x - 7 - wA, wA);
      xB = clampX(mB.x + 7, wB);
      if (Math.abs(yA - yB) < pillH + 3 && xA + wA + 8 > xB) {
        xB = clampX(xA + wA + 8, wB);
        if (xA + wA + 8 > xB) {
          xA = clampX(xB - 8 - wA, wA);
        }
      }
    } else {
      anchorB = 'end';
      anchorA = 'start';
      xB = clampX(mB.x - 7 - wB, wB);
      xA = clampX(mA.x + 7, wA);
      if (Math.abs(yA - yB) < pillH + 3 && xB + wB + 8 > xA) {
        xA = clampX(xB + wB + 8, wA);
        if (xB + wB + 8 > xA) {
          xB = clampX(xA - 8 - wB, wB);
        }
      }
    }
  } else {
    anchorA = mA.x + 7 + wA > maxX ? 'end' : 'start';
    anchorB = mB.x + 7 + wB > maxX ? 'end' : 'start';
    xA = clampX(anchorA === 'end' ? mA.x - 7 - wA : mA.x + 7, wA);
    xB = clampX(anchorB === 'end' ? mB.x - 7 - wB : mB.x + 7, wB);
  }

  const finalize = (
    slot: 'A' | 'B',
    labelText: string,
    dotX: number,
    dotY: number,
    pillX: number,
    pillY: number,
    pillW: number,
    textAnchor: 'start' | 'end'
  ): ShowdownPeakPillPlacement => {
    const textX = textAnchor === 'end' ? pillX + pillW - padX : pillX + padX;
    const textY = pillY + 10.6;
    const nearX = Math.max(pillX + 4, Math.min(pillX + pillW - 4, dotX));
    const nearY = pillY + pillH * 0.5 <= dotY ? pillY + pillH : pillY;
    const showLeader = Math.hypot(nearX - dotX, nearY - dotY) > 4.5;
    return {
      slot,
      labelText,
      textX,
      textY,
      textAnchor,
      pillX,
      pillY,
      pillW,
      pillH,
      leaderX1: dotX,
      leaderY1: dotY,
      leaderX2: nearX,
      leaderY2: nearY,
      showLeader,
    };
  };

  return {
    peakA: finalize('A', textA, mA.x, mA.y, xA, yA, wA, anchorA),
    peakB: finalize('B', textB, mB.x, mB.y, xB, yB, wB, anchorB),
  };
}

// ============================================================================
// Cycle 11C · Free-Pair 34×33 Custom Duel Helpers & 6-Axis Engineering Radar
// ============================================================================

export type ShowdownRadarAxisId =
  | 'velocity'
  | 'energy'
  | 'cyclicRate'
  | 'compactness'
  | 'partComplexity'
  | 'rangeReach';

export interface ShowdownRadarAxisMeta {
  id: ShowdownRadarAxisId;
  labelZh: string;
  labelEn: string;
  shortZh: string;
  shortEn: string;
}

export const SHOWDOWN_RADAR_AXES: readonly ShowdownRadarAxisMeta[] = [
  {
    id: 'velocity',
    labelZh: '弹道初速',
    labelEn: 'Muzzle Velocity',
    shortZh: '初速',
    shortEn: 'Velocity',
  },
  {
    id: 'energy',
    labelZh: '枪口动能',
    labelEn: 'Muzzle Energy',
    shortZh: '动能',
    shortEn: 'Energy',
  },
  {
    id: 'cyclicRate',
    labelZh: '循环射速',
    labelEn: 'Cyclic Tempo',
    shortZh: '射速',
    shortEn: 'Tempo',
  },
  {
    id: 'compactness',
    labelZh: '紧凑尺度',
    labelEn: 'Compactness',
    shortZh: '紧凑',
    shortEn: 'Compact',
  },
  {
    id: 'partComplexity',
    labelZh: '机构复杂度',
    labelEn: 'Mechanism Complexity',
    shortZh: '复杂度',
    shortEn: 'Complex',
  },
  {
    id: 'rangeReach',
    labelZh: '有效射程',
    labelEn: 'Effective Reach',
    shortZh: '射程',
    shortEn: 'Reach',
  },
] as const;

export interface WeaponRadarRawMetrics {
  velocityMps: number;
  energyJ: number;
  effectiveRpm: number;
  overallLengthMm: number;
  partsCount: number;
  effectiveRangeM: number;
  emptyWeightKg: number;
}

export interface WeaponRadarMetrics {
  weaponId: string;
  velocity: number;
  energy: number;
  cyclicRate: number;
  compactness: number;
  partComplexity: number;
  rangeReach: number;
  raw: WeaponRadarRawMetrics;
}

const RADAR_DRIVE_COMPLEXITY_BONUS: Readonly<Record<DriveFamilyId, number>> = {
  external_electric_rotary: 24,
  hydro_pneumatic_cannon_recoil: 22,
  compound_cam_elastic: 18,
  short_stroke_piston: 14,
  delayed_or_straight_blowback: 13,
  direct_impingement: 12,
  long_stroke_piston: 11,
  short_recoil_barrel: 10,
  manual_bolt_or_revolver_linkage: 6,
};

const RADAR_LOCKING_COMPLEXITY_BONUS: Readonly<Record<LockingFamilyId, number>> =
  {
    rotary_cylindrical_breech: 20,
    super_v_off_axis_cam: 18,
    sliding_wedge_breech: 16,
    cam_letoff_or_adf_sled: 15,
    toggle_knee_joint: 14,
    roller_or_mass_blowback: 12,
    rotating_lug_bolt: 11,
    cylinder_notch_ratchet: 9,
    tilting_barrel_cam: 7,
  };

const RADAR_FEED_COMPLEXITY_BONUS: Readonly<Record<FeedFamilyId, number>> = {
  autoloader_carousel_or_blast_bustle: 16,
  overhead_caseless_rammer: 15,
  top_helical_90deg: 13,
  disintegrating_belt_shuttle: 12,
  top_enbloc_clip: 9,
  underbarrel_tubular_elevator: 8,
  swing_out_cylinder: 7,
  drop_away_or_flight_track: 7,
  staggered_box_magazine: 5,
};

function clampScore100(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(100, Math.round(val)));
}

function logNormalize0To100(value: number, minVal: number, maxVal: number): number {
  const safe = Math.max(minVal, Math.min(maxVal, value));
  const lo = Math.log10(minVal);
  const hi = Math.log10(maxVal);
  if (hi <= lo) return 0;
  return clampScore100(((Math.log10(safe) - lo) / (hi - lo)) * 100);
}

function resolveEffectiveRpm(
  weaponId: string,
  profile: ShowdownExhibitProfile,
  rawRateOfFire: string
): number {
  if (profile.cyclicRateRpm !== null && profile.cyclicRateRpm > 0) {
    return profile.cyclicRateRpm;
  }
  if (/(发\/分|rpm)/i.test(rawRateOfFire)) {
    const cleaned = rawRateOfFire.replace(/,/g, '');
    const nums = cleaned.match(/\d+(?:\.\d+)?/g);
    if (nums && nums.length >= 2 && (cleaned.includes('–') || cleaned.includes('-'))) {
      const lo = Number(nums[0]);
      const hi = Number(nums[1]);
      if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo && hi > 0) {
        return Math.round((lo + hi) * 0.5);
      }
    }
    if (nums && nums.length > 0) {
      const n = Number(nums[0]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  if (weaponId === 'r500') return 3;
  if (weaponId === 'lift33') return 6;
  if (weaponId === 'awm') return 12;
  if (weaponId === 'm82a1' || weaponId === 'python') return 30;
  if (weaponId === 'deagle' || weaponId === 'rem870') return 35;
  if (weaponId === 'benellim4') return 60;
  return 45;
}

function resolveEffectiveRangeM(weaponId: string): number {
  if (isWeaponId(weaponId)) {
    const raw = getWeaponManifest(weaponId).catalog.specs1To1.effectiveRangeM;
    return parseFirstPositiveNumber(raw, 300);
  }
  return 300;
}

/**
 * Pure 6-axis quantitative engineering radar evaluator covering all 34 exhibits.
 * Uses log-scale curves on velocity, kinetic energy, cyclic tempo, physical compactness,
 * and engagement reach so both 9mm handguns and 125mm APFSDS MBTs separate legibly.
 */
export function computeWeaponRadarMetrics(weaponId: string): WeaponRadarMetrics {
  const profile = getShowdownExhibitProfile(weaponId, 'en');
  const rawRateOfFire = isWeaponId(weaponId)
    ? getWeaponManifest(weaponId).catalog.specs1To1.rateOfFire
    : profile.rateOfFireDisplay;

  const velocityMps = Math.max(1, profile.muzzleVelocityMps);
  const energyJ = Math.max(1, profile.muzzleEnergyJ);
  const effectiveRpm = resolveEffectiveRpm(weaponId, profile, rawRateOfFire);
  const overallLengthMm = Math.max(100, profile.overallLengthMm);
  const effectiveRangeM = Math.max(25, resolveEffectiveRangeM(weaponId));

  // 1. Velocity: log10 [80 .. 1,900 m/s]
  const velocity = logNormalize0To100(velocityMps, 80, 1900);

  // 2. Kinetic Energy: log10 [50 J .. 15,000,000 J]
  const energy = logNormalize0To100(energyJ, 50, 15_000_000);

  // 3. Cyclic Tempo: log10 [3 .. 4,200 RPM]
  const cyclicRate = logNormalize0To100(effectiveRpm, 3, 4200);

  // 4. Compactness: inverse log10 physical length [180 mm .. 11,500 mm]
  const lengthScore = logNormalize0To100(overallLengthMm, 180, 11500);
  const compactness = clampScore100(100 - lengthScore);

  // 5. Mechanism Complexity: CAD independent part count + 3-axis architecture complexity
  const partBase = Math.max(
    0,
    Math.min(48, ((profile.partsCount - 14) / 22) * 48)
  );
  const archBonus =
    RADAR_DRIVE_COMPLEXITY_BONUS[profile.driveFamily] +
    RADAR_LOCKING_COMPLEXITY_BONUS[profile.lockingFamily] +
    RADAR_FEED_COMPLEXITY_BONUS[profile.feedFamily];
  const exoticBonus =
    weaponId === 'an94' || weaponId === 'g11' || weaponId === 'gau8' ? 8 : 0;
  const partComplexity = clampScore100(
    partBase + archBonus * 0.88 + exoticBonus
  );

  // 6. Effective Engagement Reach: log10 [35 m .. 5,000 m]
  const rangeReach = logNormalize0To100(effectiveRangeM, 35, 5000);

  return {
    weaponId,
    velocity,
    energy,
    cyclicRate,
    compactness,
    partComplexity,
    rangeReach,
    raw: {
      velocityMps,
      energyJ,
      effectiveRpm,
      overallLengthMm,
      partsCount: profile.partsCount,
      effectiveRangeM,
      emptyWeightKg: profile.emptyWeightKg,
    },
  };
}

export interface ShowdownRadarVertex {
  axisId: ShowdownRadarAxisId;
  angleRad: number;
  xA: number;
  yA: number;
  xB: number;
  yB: number;
  axisEndX: number;
  axisEndY: number;
  labelX: number;
  labelY: number;
  scoreA: number;
  scoreB: number;
}

export interface ShowdownRadarGeometry {
  width: number;
  height: number;
  cx: number;
  cy: number;
  radius: number;
  ringPolygons: readonly { level: number; points: string }[];
  vertices: readonly ShowdownRadarVertex[];
  polygonA: string;
  polygonB: string;
}

export function buildShowdownRadarGeometry(
  metricsA: WeaponRadarMetrics,
  metricsB: WeaponRadarMetrics,
  width = 340,
  height = 296,
  radius = 96
): ShowdownRadarGeometry {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const count = SHOWDOWN_RADAR_AXES.length;
  const labelOffset = radius + 24;

  const ringPolygons = [25, 50, 75, 100].map((level) => {
    const r = (level / 100) * radius;
    const pts: string[] = [];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
      pts.push(
        `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`
      );
    }
    return { level, points: pts.join(' ') };
  });

  const vertices: ShowdownRadarVertex[] = SHOWDOWN_RADAR_AXES.map((axis, i) => {
    const angleRad = -Math.PI / 2 + (i * Math.PI * 2) / count;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const scoreA = metricsA[axis.id];
    const scoreB = metricsB[axis.id];
    const rA = (scoreA / 100) * radius;
    const rB = (scoreB / 100) * radius;
    return {
      axisId: axis.id,
      angleRad,
      xA: cx + cos * rA,
      yA: cy + sin * rA,
      xB: cx + cos * rB,
      yB: cy + sin * rB,
      axisEndX: cx + cos * radius,
      axisEndY: cy + sin * radius,
      labelX: cx + cos * labelOffset,
      labelY: cy + sin * labelOffset,
      scoreA,
      scoreB,
    };
  });

  const polygonA = vertices
    .map((v) => `${v.xA.toFixed(1)},${v.yA.toFixed(1)}`)
    .join(' ');
  const polygonB = vertices
    .map((v) => `${v.xB.toFixed(1)},${v.yB.toFixed(1)}`)
    .join(' ');

  return {
    width,
    height,
    cx,
    cy,
    radius,
    ringPolygons,
    vertices,
    polygonA,
    polygonB,
  };
}

/** Pure helper for 1-click A ↔ B swap in Free-Pair 34×33 Showdown builder. */
export function resolveFreePairSwap(
  weaponA: string,
  weaponB: string
): [string, string] {
  return [weaponB, weaponA];
}

/**
 * Pure helper ensuring Exhibit A and Exhibit B stay strictly distinct across
 * all 34 × 33 = 1,122 ordered pairs (selecting the rival's exhibit swaps slots cleanly).
 */
export function resolveFreePairSelection(
  slot: 'A' | 'B',
  nextId: string,
  currentA: string,
  currentB: string
): [string, string] {
  if (slot === 'A') {
    if (nextId === currentB) return [nextId, currentA];
    return [nextId, currentB];
  }
  if (nextId === currentA) return [currentB, nextId];
  return [currentA, nextId];
}
