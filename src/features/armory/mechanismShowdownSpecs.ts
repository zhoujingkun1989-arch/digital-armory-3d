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
  | 'manual_bolt_or_revolver_linkage'
  | 'compound_cam_elastic';

export type LockingFamilyId =
  | 'rotating_lug_bolt'
  | 'tilting_barrel_cam'
  | 'roller_or_mass_blowback'
  | 'cylinder_notch_ratchet'
  | 'cam_letoff_or_adf_sled';

export type FeedFamilyId =
  | 'staggered_box_magazine'
  | 'top_helical_90deg'
  | 'swing_out_cylinder'
  | 'underbarrel_tubular_elevator'
  | 'top_enbloc_clip'
  | 'drop_away_or_flight_track';

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
      zh: '火药燃气导引、枪管短后坐动量守恒、惯性后坐与复合凸轮弹性势能的机械分流',
      en: 'How propellant gas, barrel recoil momentum, bolt inertia, or cam-limb strain drives the cycle',
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
      zh: '在数千大气压膛压峰值下锁死弹底，待残压降至安全窗口后精确解锁的几何约束',
      en: 'Geometric constraints sealing high-pressure ignition before timing safe residual unlock',
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
      zh: '盒式双排、顶置 90° 螺旋旋转、侧摆转轮、管仓升降托弹板、顶装漏夹与落箭轨道',
      en: 'Box magazines, 90° helical ramps, revolving cylinders, tubular elevators, en-bloc clips & arrow rests',
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
      caliberProfileFallback: '9mm_para',
      isArchery: false,
      peakLoadValue: 241,
      peakLoadFormatted: { zh: '241 MPa', en: '241 MPa' },
      standardLabel: 'SAAMI',
      muzzleVelocityMps: 440,
      projectileMassG: 10.24,
      overallLengthMm: 292,
      barrelOrStrokeMm: 152.4,
      emptyWeightKg: 1.19,
      partsCount: 25,
      cyclicRateRpm: null,
      rateOfFireDisplay: { zh: '双动 / 单动', en: 'DA / SA Revolver' },
      timing: makeWave2Timing(0.2, 0.34, 0.62, 0.88, null),
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
      caliberProfileFallback: '50_ae',
      isArchery: false,
      peakLoadValue: 79,
      peakLoadFormatted: { zh: '79 MPa', en: '79 MPa' },
      standardLabel: 'SAAMI',
      muzzleVelocityMps: 405,
      projectileMassG: 35.0,
      overallLengthMm: 886,
      barrelOrStrokeMm: 470,
      emptyWeightKg: 3.82,
      partsCount: 26,
      cyclicRateRpm: null,
      rateOfFireDisplay: { zh: '半自动', en: 'Semi-Auto' },
      timing: makeWave2Timing(0.14, 0.29, 0.44, 0.86, 0.18),
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
      caliberProfileFallback: '762_m43',
      isArchery: false,
      peakLoadValue: 345,
      peakLoadFormatted: { zh: '345 MPa', en: '345 MPa' },
      standardLabel: 'SAAMI',
      muzzleVelocityMps: 853,
      projectileMassG: 9.72,
      overallLengthMm: 1105,
      barrelOrStrokeMm: 610,
      emptyWeightKg: 4.31,
      partsCount: 26,
      cyclicRateRpm: null,
      rateOfFireDisplay: {
        zh: '半自动 (40–50发/分)',
        en: 'Semi-Auto (40–50 rpm)',
      },
      timing: makeWave2Timing(0.12, 0.21, 0.45, 0.86, 0.92),
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
];

// ----------------------------------------------------------------------------
// 4. Runtime Filtering, Quantitative Metric Extraction & Curve Sampling
// ----------------------------------------------------------------------------

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
      return Math.round((lo + hi) * 0.5);
    }
  }
  const val = Number(nums[0]);
  return Number.isFinite(val) && val > 0 ? Math.round(val) : null;
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
