import type { WeaponId } from '../../weapons/types';

// ============================================================================
// Digital Armory 3D — Modular Optics & Muzzle Attachment Specifications
// ----------------------------------------------------------------------------
// Pure, DOM-free, Three.js-free engineering specs & anchor math (Node testable).
// Coordinate invariant (`AGENTS.md` Rule #1):
//   1 world unit = 1 cm = 10 mm · +X muzzle, +Y up, +Z right flank.
// All muzzle & optic rail anchors are derived directly from each weapon's
// verified GLB / CAD barrel crown & top receiver rail bounds so attachments
// seat flush with ZERO floating gap.
// ============================================================================

export type MuzzleAttachmentId =
  | 'none'
  | 'suppressor'
  | 'muzzle_brake'
  | 'flash_hider';

export type OpticAttachmentId = 'none' | 'red_dot' | 'lpvo' | 'thermal';

export type AttachmentPresetId =
  | 'factory'
  | 'stealth_ops'
  | 'cqb_race'
  | 'dmr_precision';

export type PlatformAttachmentClass =
  | 'rifle'
  | 'smg'
  | 'pistol'
  | 'sniper'
  | 'lmg'
  | 'shotgun'
  | 'archery'
  | 'armor'
  | 'ordnance';

export const MUZZLE_ATTACHMENT_ORDER: readonly MuzzleAttachmentId[] = [
  'none',
  'suppressor',
  'muzzle_brake',
  'flash_hider',
];

export const OPTIC_ATTACHMENT_ORDER: readonly OpticAttachmentId[] = [
  'none',
  'red_dot',
  'lpvo',
  'thermal',
];

export const ATTACHMENT_PRESET_ORDER: readonly AttachmentPresetId[] = [
  'stealth_ops',
  'cqb_race',
  'dmr_precision',
  'factory',
];

export interface AttachmentPhysicsDelta {
  /** Acoustic pressure level delta in dB (e.g. -28 dB suppressor, +6 dB brake) */
  soundDbDelta: number;
  /** Optional low-pass filter cutoff ceiling in Hz (null = no low-pass attenuation) */
  lowPassHz: number | null;
  /** Multiplicative whole-weapon recoil rise & kick scaling (<1 reduces recoil) */
  recoilRiseMultiplier: number;
  /** Multiplicative muzzle velocity factor (>1 = freebore suppressor boost) */
  muzzleVelocityMultiplier: number;
  /** Fraction [0..1] of muzzle propellant gas trapped & swirled inside baffles */
  gasBaffleRetention: number;
  /** Fraction [0..1] of muzzle gas redirected laterally (±Z side jets) */
  sideBlastRatio: number;
  /** Total added mass in grams (g) */
  addedMassGrams: number;
  /** Muzzle flash suppression ratio [0..1] (higher = darker muzzle signature) */
  flashAttenuation: number;
  /** High-frequency lateral concussion crack boost [0..1] for muzzle brakes */
  highFreqCrackBoost: number;
}

export interface MuzzleAttachmentSpec {
  id: MuzzleAttachmentId;
  nameZh: string;
  nameEn: string;
  shortZh: string;
  shortEn: string;
  materialZh: string;
  materialEn: string;
  detailZh: string;
  detailEn: string;
  cutawayNoteZh: string;
  cutawayNoteEn: string;
  /** Nominal forward extension beyond the barrel shoulder at modelScale = 1.0 (cm) */
  lengthCm: number;
  /** Nominal outer radius at modelScale = 1.0 (cm) */
  outerRadiusCm: number;
  physics: AttachmentPhysicsDelta;
}

export interface OpticAttachmentSpec {
  id: OpticAttachmentId;
  nameZh: string;
  nameEn: string;
  shortZh: string;
  shortEn: string;
  materialZh: string;
  materialEn: string;
  detailZh: string;
  detailEn: string;
  cutawayNoteZh: string;
  cutawayNoteEn: string;
  /** Nominal longitudinal footprint along X at modelScale = 1.0 (cm) */
  lengthCm: number;
  physics: AttachmentPhysicsDelta;
}

export interface AttachmentPresetSpec {
  id: AttachmentPresetId;
  nameZh: string;
  nameEn: string;
  descZh: string;
  descEn: string;
  muzzle: MuzzleAttachmentId;
  optic: OpticAttachmentId;
}

export interface WeaponAttachmentMountProfile {
  weaponId: WeaponId;
  platformClass: PlatformAttachmentClass;
  /** Geometric proportion factor matching the weapon's CAD mesh scale (1.0 = full 1:1 cm) */
  modelScale: number;
  /** Exact barrel shoulder / thread mount coordinate `[x, y, z]` in weapon space (cm) */
  muzzleAnchor: readonly [number, number, number] | null;
  /** Optional reciprocating barrel part ID whose firing kinematics the muzzle device tracks */
  muzzleFollowPartId: string | null;
  /** Stock factory muzzle part IDs cleanly hidden when a custom muzzle device is mounted */
  muzzleReplacedPartIds: readonly string[];
  /** Exact top receiver / rail / slide mount plane `[x, y, z]` in weapon space (cm) */
  opticRailAnchor: readonly [number, number, number] | null;
  /** Optional reciprocating slide part ID whose firing kinematics a slide-mounted optic tracks */
  opticFollowPartId: string | null;
  /** Stock factory carry-handle / scope / plate part IDs cleanly hidden when a custom optic is mounted */
  opticReplacedPartIds: readonly string[];
  allowedMuzzles: readonly MuzzleAttachmentId[];
  allowedOptics: readonly OpticAttachmentId[];
  muzzleCompatibilityNoteZh?: string;
  muzzleCompatibilityNoteEn?: string;
  opticCompatibilityNoteZh?: string;
  opticCompatibilityNoteEn?: string;
}

export interface WeaponAttachmentLoadout {
  muzzle: MuzzleAttachmentId;
  optic: OpticAttachmentId;
}

export const DEFAULT_ATTACHMENT_LOADOUT: Readonly<WeaponAttachmentLoadout> = {
  muzzle: 'none',
  optic: 'none',
};

export const NEUTRAL_PHYSICS_DELTA: Readonly<AttachmentPhysicsDelta> = {
  soundDbDelta: 0,
  lowPassHz: null,
  recoilRiseMultiplier: 1.0,
  muzzleVelocityMultiplier: 1.0,
  gasBaffleRetention: 0,
  sideBlastRatio: 0,
  addedMassGrams: 0,
  flashAttenuation: 0,
  highFreqCrackBoost: 0,
};

export const MUZZLE_ATTACHMENT_SPECS: Readonly<
  Record<MuzzleAttachmentId, MuzzleAttachmentSpec>
> = {
  none: {
    id: 'none',
    nameZh: '原厂枪口配置',
    nameEn: 'Factory Muzzle',
    shortZh: '原厂',
    shortEn: 'Factory',
    materialZh: '原厂制式配置',
    materialEn: 'OEM Factory Crown',
    detailZh: '保持该枪出厂原配枪口装置或裸膛口基准状态。',
    detailEn: 'Preserves original factory muzzle device or bare target crown.',
    cutawayNoteZh: '无外挂枪口装置，按原厂弹道与气动配置运行。',
    cutawayNoteEn: 'No aftermarket muzzle attachment; baseline factory gas plume.',
    lengthCm: 0,
    outerRadiusCm: 0,
    physics: { ...NEUTRAL_PHYSICS_DELTA },
  },
  suppressor: {
    id: 'suppressor',
    nameZh: '钛合金整体 K 隔板消音器',
    nameEn: 'Monocore K-Baffle Titanium Suppressor',
    shortZh: 'K 隔板消音',
    shortEn: 'Suppressor',
    materialZh: 'Ti-6Al-4V 五级钛筒 · 铬镍铁合金首级隔板',
    materialEn: 'Grade-5 Ti-6Al-4V Tube · Inconel 718 Blast Baffle',
    detailZh:
      '7 级偏心泄压孔 K 型隔板膨胀腔，大幅截留降温火药燃气，降低枪口爆声 -28 dB 并微幅提升 1.8% 初速。',
    detailEn:
      '7-stage ported K-baffle monocore traps & cools propellant gas, cutting report by -28 dB with +1.8% freebore velocity boost.',
    cutawayNoteZh:
      '按 [C] 开启活体 CT 纵剖可直击筒内 7 级斜切 K 隔板腔与膨胀涡流！',
    cutawayNoteEn:
      'Toggle CT Slice [C] to inspect the internal 7-stage K-baffle stack & gas vortices!',
    lengthCm: 17.4,
    outerRadiusCm: 1.9,
    physics: {
      soundDbDelta: -28,
      lowPassHz: 1280,
      recoilRiseMultiplier: 0.86,
      muzzleVelocityMultiplier: 1.018,
      gasBaffleRetention: 0.82,
      sideBlastRatio: 0.08,
      addedMassGrams: 385,
      flashAttenuation: 0.88,
      highFreqCrackBoost: 0,
    },
  },
  muzzle_brake: {
    id: 'muzzle_brake',
    nameZh: '双室竞赛级侧喷制退器',
    nameEn: 'Dual-Chamber Competition Muzzle Brake',
    shortZh: '双室制退器',
    shortEn: 'Muzzle Brake',
    materialZh: '4140 氮化铣削铬钼钢',
    materialEn: 'CNC 4140 Nitride Chromoly Steel',
    detailZh:
      '双级 -32° 后掠导流隔室将 85% 高压燃气强力横向侧喷，削减 38% 后坐上跳，伴随显著 +6 dB 侧向爆震冲击波。',
    detailEn:
      'Twin -32° swept baffle chambers redirect 85% of gas laterally, cutting recoil rise by 38% while adding +6 dB lateral concussion.',
    cutawayNoteZh:
      '开启击发演示可直观观测双侧高速对称燃气侧喷羽流与高频侧爆声场。',
    cutawayNoteEn:
      'Run Firing mode to view twin high-velocity lateral side-jet plumes & crisp blast crack.',
    lengthCm: 6.4,
    outerRadiusCm: 1.35,
    physics: {
      soundDbDelta: 6,
      lowPassHz: null,
      recoilRiseMultiplier: 0.62,
      muzzleVelocityMultiplier: 0.995,
      gasBaffleRetention: 0.1,
      sideBlastRatio: 0.85,
      addedMassGrams: 115,
      flashAttenuation: 0.2,
      highFreqCrackBoost: 0.85,
    },
  },
  flash_hider: {
    id: 'flash_hider',
    nameZh: '三叉战术开槽消焰器',
    nameEn: '3-Prong Tactical Flash Hider',
    shortZh: '三叉消焰器',
    shortEn: '3-Prong FH',
    materialZh: '17-4PH 沉淀硬化不锈钢 · DLC 镀膜',
    materialEn: '17-4PH Stainless Steel · DLC Finish',
    detailZh:
      '120° 对称三叉开放音叉槽将出膛未燃火药燃气切分为三束冷却扩散羽流，消除 72% 夜间枪口焰。',
    detailEn:
      'Three 120° fluted tuning-fork prongs split muzzle gases into 3 cool dispersed plumes, cutting flash signature by 72%.',
    cutawayNoteZh:
      '击发时可观测 3 束 120° 对称柔化消焰羽流与极轻微音叉高频泛音。',
    cutawayNoteEn:
      'Splits forward muzzle plume into 3 muted 120° prongs with subtle fork ring.',
    lengthCm: 5.8,
    outerRadiusCm: 1.15,
    physics: {
      soundDbDelta: -1,
      lowPassHz: null,
      recoilRiseMultiplier: 0.97,
      muzzleVelocityMultiplier: 1.0,
      gasBaffleRetention: 0.05,
      sideBlastRatio: 0.38,
      addedMassGrams: 82,
      flashAttenuation: 0.72,
      highFreqCrackBoost: 0,
    },
  },
};

export const OPTIC_ATTACHMENT_SPECS: Readonly<
  Record<OpticAttachmentId, OpticAttachmentSpec>
> = {
  none: {
    id: 'none',
    nameZh: '原厂瞄具 / 机械铁瞄',
    nameEn: 'Factory / Iron Sights',
    shortZh: '原厂瞄具',
    shortEn: 'Factory',
    materialZh: '原厂制式配置',
    materialEn: 'OEM Sighting System',
    detailZh: '保持该枪原厂机械瞄具、提把照门或标配瞄准镜。',
    detailEn: 'Uses factory iron sights, carry handle, or OEM optic.',
    cutawayNoteZh: '无外挂光学改装。',
    cutawayNoteEn: 'No aftermarket optic installed.',
    lengthCm: 0,
    physics: { ...NEUTRAL_PHYSICS_DELTA },
  },
  red_dot: {
    id: 'red_dot',
    nameZh: '微型反射红点瞄具',
    nameEn: 'Micro Reflex Red Dot',
    shortZh: '微型红点',
    shortEn: 'Red Dot',
    materialZh: '7075-T6 锻造铝壳 · 红宝石 AR 镀膜镜片',
    materialEn: '7075-T6 Forged Aluminum · Ruby AR Dichroic Lens',
    detailZh:
      '超轻 48g 开放式近战反射瞄具，倾斜红宝石分光镀膜反射 2 MOA 高亮红点分划，兼容手枪套筒随动后坐。',
    detailEn:
      'Ultralight 48g open-emitter reflex sight with ruby AR lens & glowing 2 MOA reticle dot; tracks reciprocating pistol slides.',
    cutawayNoteZh: '按 [C] 剖视可观测底座 LED 发射管与倾斜红宝石分光镜。',
    cutawayNoteEn: 'CT Slice [C] reveals the internal LED emitter & angled dichroic lens.',
    lengthCm: 4.8,
    physics: {
      soundDbDelta: 0,
      lowPassHz: null,
      recoilRiseMultiplier: 0.99,
      muzzleVelocityMultiplier: 1.0,
      gasBaffleRetention: 0,
      sideBlastRatio: 0,
      addedMassGrams: 48,
      flashAttenuation: 0,
      highFreqCrackBoost: 0,
    },
  },
  lpvo: {
    id: 'lpvo',
    nameZh: '1-8×24 战术变倍镜 (LPVO)',
    nameEn: '1-8×24 Tactical LPVO Scope',
    shortZh: '1-8× LPVO',
    shortEn: '1-8× LPVO',
    materialZh: '30mm 航空铝主镜筒 · 绿宝石宽带多层镀膜',
    materialEn: '30mm 6061-T6 Tube · Emerald Multi-Coated ED Glass',
    detailZh:
      '悬臂式双环快拆镜座配 1-8×24 第一像面变倍镜，兼顾 1× 双眼近战与 8× 中远距精确点杀，640g 质量轻微稳枪。',
    detailEn:
      'Cantilever dual-ring mount with 1-8×24 FFP scope & emerald multi-coated lenses; 640g mass adds mild muzzle stability.',
    cutawayNoteZh:
      '按 [C] 开启 CT 纵剖可穿透 30mm 镜筒直击内部 5 片光学透镜组、转像管与蚀刻分划板！',
    cutawayNoteEn:
      'Toggle CT Slice [C] to reveal the internal erector tube & 5-element ground-glass lens stack!',
    lengthCm: 25.4,
    physics: {
      soundDbDelta: 0,
      lowPassHz: null,
      recoilRiseMultiplier: 0.95,
      muzzleVelocityMultiplier: 1.0,
      gasBaffleRetention: 0,
      sideBlastRatio: 0,
      addedMassGrams: 640,
      flashAttenuation: 0,
      highFreqCrackBoost: 0,
    },
  },
  thermal: {
    id: 'thermal',
    nameZh: '串列前挂 FLIR 热成像仪',
    nameEn: 'Clip-On FLIR Thermal Imager',
    shortZh: 'FLIR 热像仪',
    shortEn: 'FLIR Thermal',
    materialZh: '镁铝合金防震壳 · 单晶锗红外物镜',
    materialEn: 'Magnesium-Alloy Chassis · Germanium LWIR Objective',
    detailZh:
      '非制冷氧化钒 (VOx) 微测辐射热计前挂热像仪，配紫铜虹彩单晶锗长波红外镜头，可全天候穿透烟雾暗夜。',
    detailEn:
      'Uncooled VOx microbolometer clip-on thermal sight with multi-coated Germanium LWIR lens for all-weather target detection.',
    cutawayNoteZh:
      '按 [C] 开启 CT 纵剖可观测锗红外物镜、金矽 VOx 热像传感器晶片与后置微 OLED 目镜！',
    cutawayNoteEn:
      'Toggle CT Slice [C] to inspect the Germanium lens, VOx sensor die, DSP PCB & OLED prism!',
    lengthCm: 14.2,
    physics: {
      soundDbDelta: 0,
      lowPassHz: null,
      recoilRiseMultiplier: 0.96,
      muzzleVelocityMultiplier: 1.0,
      gasBaffleRetention: 0,
      sideBlastRatio: 0,
      addedMassGrams: 490,
      flashAttenuation: 0,
      highFreqCrackBoost: 0,
    },
  },
};

export const ATTACHMENT_PRESET_SPECS: Readonly<
  Record<AttachmentPresetId, AttachmentPresetSpec>
> = {
  stealth_ops: {
    id: 'stealth_ops',
    nameZh: '潜行微声',
    nameEn: 'Stealth Ops',
    descZh: '钛合金 K 隔板消音器 + FLIR 热成像仪（手枪自动降档为微型红点）',
    descEn: 'Titanium K-baffle suppressor + FLIR thermal (auto-clamps to Red Dot on pistols)',
    muzzle: 'suppressor',
    optic: 'thermal',
  },
  cqb_race: {
    id: 'cqb_race',
    nameZh: '近战竞速',
    nameEn: 'CQB Race',
    descZh: '双室竞赛制退器 (-38% 后坐) + 微型反射红点快速捉靶',
    descEn: 'Dual-chamber race brake (-38% recoil) + micro reflex red dot',
    muzzle: 'muzzle_brake',
    optic: 'red_dot',
  },
  dmr_precision: {
    id: 'dmr_precision',
    nameZh: '精确射手',
    nameEn: 'DMR Precision',
    descZh: '三叉消焰器 + 1-8×24 战术 LPVO 变倍镜（精确中远距配置）',
    descEn: '3-prong flash hider + 1-8×24 LPVO scope for precision engagements',
    muzzle: 'flash_hider',
    optic: 'lpvo',
  },
  factory: {
    id: 'factory',
    nameZh: '原厂出厂',
    nameEn: 'Factory Stock',
    descZh: '卸除全部后装配件，恢复馆藏出厂原貌与基准声学/后坐参数',
    descEn: 'Strip all modular attachments and restore factory stock configuration',
    muzzle: 'none',
    optic: 'none',
  },
};

const ALL_MUZZLES: readonly MuzzleAttachmentId[] = [
  'none',
  'suppressor',
  'muzzle_brake',
  'flash_hider',
];
const ALL_OPTICS: readonly OpticAttachmentId[] = [
  'none',
  'red_dot',
  'lpvo',
  'thermal',
];
const PISTOL_OPTICS: readonly OpticAttachmentId[] = ['none', 'red_dot'];
const NONE_MUZZLE: readonly MuzzleAttachmentId[] = ['none'];
const NONE_OPTIC: readonly OpticAttachmentId[] = ['none'];

/**
 * Exact 1:1 / model-space modular mount profiles for ALL 29 Digital Armory exhibits.
 * Every anchor coordinate was measured directly against the exhibit's Blender GLB
 * barrel crown (`muzzleAnchor`) and upper receiver / rail / slide top (`opticRailAnchor`)
 * so mounted devices seat flush with ZERO floating gap and ZERO mesh collision.
 */
export const WEAPON_ATTACHMENT_PROFILES: Readonly<
  Record<WeaponId, WeaponAttachmentMountProfile>
> = {
  ak15: {
    weaponId: 'ak15',
    platformClass: 'rifle',
    modelScale: 0.56,
    muzzleAnchor: [22.78, 1.05, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: ['ak_muzzle_device'],
    opticRailAnchor: [1.0, 3.11, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  m4a1: {
    weaponId: 'm4a1',
    platformClass: 'rifle',
    modelScale: 0.54,
    muzzleAnchor: [21.9, 1.05, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: ['m4a1_flash_hider'],
    opticRailAnchor: [-0.4, 2.11, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: ['m4a1_carry_handle'],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  mp5: {
    weaponId: 'mp5',
    platformClass: 'smg',
    modelScale: 0.52,
    muzzleAnchor: [18.86, 1.0, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: [0.8, 2.69, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  g17: {
    weaponId: 'g17',
    platformClass: 'pistol',
    modelScale: 0.72,
    muzzleAnchor: [11.24, 2.55, 0],
    muzzleFollowPartId: 'barrel',
    muzzleReplacedPartIds: [],
    opticRailAnchor: [-3.4, 3.44, 0],
    opticFollowPartId: 'slide',
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: PISTOL_OPTICS,
    opticCompatibilityNoteZh:
      '往复式手枪套筒仅兼容超轻微型反射红点（重型变倍镜/热像仪将阻碍短后坐抽壳循环）。',
    opticCompatibilityNoteEn:
      'Reciprocating pistol slide accepts Micro Reflex Red Dot only (heavy scopes stall short-recoil cycling).',
  },
  m82a1: {
    weaponId: 'm82a1',
    platformClass: 'sniper',
    modelScale: 0.76,
    muzzleAnchor: [30.66, 1.25, 0],
    muzzleFollowPartId: 'm82a1_barrel',
    muzzleReplacedPartIds: ['m82a1_muzzle_brake'],
    opticRailAnchor: [1.6, 2.58, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: ['m82a1_scope', 'm82a1_scope_rings'],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  awm: {
    weaponId: 'awm',
    platformClass: 'sniper',
    modelScale: 0.64,
    muzzleAnchor: [28.18, 1.05, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: ['awm_muzzle_brake'],
    opticRailAnchor: [-0.3, 2.25, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: ['awm_scope', 'awm_scope_mount'],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  scar: {
    weaponId: 'scar',
    platformClass: 'rifle',
    modelScale: 0.56,
    muzzleAnchor: [22.14, 1.05, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: ['scar_flash_suppressor'],
    opticRailAnchor: [2.0, 3.1, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  deagle: {
    weaponId: 'deagle',
    platformClass: 'pistol',
    modelScale: 0.8,
    muzzleAnchor: [15.86, 2.6, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: [6.4, 4.15, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ['none', 'red_dot', 'thermal'],
    opticCompatibilityNoteZh:
      '固定式三角枪管顶置韦弗导轨支持红点与紧凑热像仪（无需随套筒后坐）。',
    opticCompatibilityNoteEn:
      'Fixed barrel integral Weaver rail supports Red Dot & compact Thermal without slide-mass penalty.',
  },
  aug: {
    weaponId: 'aug',
    platformClass: 'rifle',
    modelScale: 0.54,
    muzzleAnchor: [18.3, 1.05, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: ['aug_flash_hider'],
    opticRailAnchor: [-0.5, 4.77, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: PISTOL_OPTICS,
    opticCompatibilityNoteZh:
      'AUG A1 一体铸造 1.5× 施华洛世奇镜桥顶部仅支持串联背负式微型红点。',
    opticCompatibilityNoteEn:
      'AUG A1 integral 1.5× Swarovski scope bridge supports piggyback Micro Reflex Red Dot.',
  },
  p320: {
    weaponId: 'p320',
    platformClass: 'pistol',
    modelScale: 0.74,
    muzzleAnchor: [11.72, 2.68, 0],
    muzzleFollowPartId: 'p320_barrel',
    muzzleReplacedPartIds: [],
    opticRailAnchor: [-5.1, 3.3, 0],
    opticFollowPartId: 'p320_slide',
    opticReplacedPartIds: ['p320_optic_plate_sight'],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: PISTOL_OPTICS,
    opticCompatibilityNoteZh:
      '卸除 M17 顶盖板后在凹槽内直装随动微型反射红点（兼容 DeltaPoint Pro 接口）。',
    opticCompatibilityNoteEn:
      'Removes M17 cover plate to direct-mount a slide-riding Micro Reflex Red Dot inside the milled pocket.',
  },
  p90: {
    weaponId: 'p90',
    platformClass: 'smg',
    modelScale: 0.5,
    muzzleAnchor: [14.92, 0.85, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: ['p90_flash_hider'],
    opticRailAnchor: [9.8, 5.65, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ['none', 'red_dot', 'thermal'],
    opticCompatibilityNoteZh:
      'P90 顶置高位光学桥可加装紧凑红点或前挂热像仪（保留 50 发水平弹匣快拆空间）。',
    opticCompatibilityNoteEn:
      'P90 upper bridge mounts compact Red Dot or Thermal while preserving top 50-rd magazine clearance.',
  },
  python: {
    weaponId: 'python',
    platformClass: 'pistol',
    modelScale: 0.74,
    muzzleAnchor: [17.32, 2.35, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: [8.2, 3.65, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ['none', 'muzzle_brake', 'flash_hider'],
    allowedOptics: PISTOL_OPTICS,
    muzzleCompatibilityNoteZh:
      '开放式转轮弹巢与枪管坡口存在高压泄气间隙，常规枪口消音器无法密封降噪；支持竞赛制退器与消焰器。',
    muzzleCompatibilityNoteEn:
      'Cylinder-to-forcing-cone gap vents high-pressure gas, precluding standard suppressors; accepts brake & flash hider.',
    opticCompatibilityNoteZh: '6 英寸通风散热肋条支持肋条卡具微型红点。',
    opticCompatibilityNoteEn:
      '6" ventilated rib accepts rib-clamped Micro Reflex Red Dot.',
  },
  benellim4: {
    weaponId: 'benellim4',
    platformClass: 'shotgun',
    modelScale: 0.94,
    muzzleAnchor: [53.35, 1.35, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: [2.0, 3.31, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  garand: {
    weaponId: 'garand',
    platformClass: 'rifle',
    modelScale: 0.9,
    muzzleAnchor: [62.82, 1.15, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: [15.5, 2.71, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
    opticCompatibilityNoteZh:
      '前护木侦察导轨位安装，完全避让机匣顶部 8 发弹簧钢漏夹装填与垂直弹射通道。',
    opticCompatibilityNoteEn:
      'Forward scout-rail mounting clears the top-loading 8-round en-bloc clip ejection path.',
  },
  m249: {
    weaponId: 'm249',
    platformClass: 'lmg',
    modelScale: 0.96,
    muzzleAnchor: [57.12, 1.25, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: [-1.8, 4.34, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  p08: {
    weaponId: 'p08',
    platformClass: 'pistol',
    modelScale: 0.72,
    muzzleAnchor: [12.1, 2.15, 0],
    muzzleFollowPartId: 'p08_barrel',
    muzzleReplacedPartIds: [],
    opticRailAnchor: null,
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: NONE_OPTIC,
    opticCompatibilityNoteZh:
      '鲁格 P08 双连杆肘节开锁时向上凌空屈膝折起 53.5°，机匣上方无法加装光学导轨。',
    opticCompatibilityNoteEn:
      'Luger P08 articulated knee-toggle buckles upward 53.5° during cycling, precluding a top optic rail.',
  },
  vector: {
    weaponId: 'vector',
    platformClass: 'smg',
    modelScale: 0.96,
    muzzleAnchor: [23.52, -0.95, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: ['vector_muzzle_device'],
    opticRailAnchor: [4.0, 4.09, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  g11: {
    weaponId: 'g11',
    platformClass: 'rifle',
    modelScale: 0.92,
    muzzleAnchor: [34.55, 0.0, 0],
    muzzleFollowPartId: 'g11_barrel',
    muzzleReplacedPartIds: ['g11_flash_hider'],
    opticRailAnchor: [-1.0, 6.58, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: ['g11_optic_handle'],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  vss: {
    weaponId: 'vss',
    platformClass: 'sniper',
    modelScale: 0.9,
    muzzleAnchor: null,
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: [-3.0, 3.18, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: ['vss_pso1_scope'],
    allowedMuzzles: NONE_MUZZLE,
    allowedOptics: ALL_OPTICS,
    muzzleCompatibilityNoteZh:
      'VSS 配备 414 mm 一体式多孔枪管 + 6 级斜挡板整体消音器，原生即达微声极限，不需外接枪口装置。',
    muzzleCompatibilityNoteEn:
      'VSS integrates a full-length ported barrel & 6-stage baffle suppressor; aftermarket muzzle devices are N/A.',
  },
  m134: {
    weaponId: 'm134',
    platformClass: 'lmg',
    modelScale: 1.05,
    muzzleAnchor: null,
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: [8.0, 14.12, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: NONE_MUZZLE,
    allowedOptics: ['none', 'red_dot', 'thermal'],
    muzzleCompatibilityNoteZh:
      'M134D 为 6 管 3,000 RPM 电动公转枪管簇，物理结构不兼容单孔枪口附件。',
    muzzleCompatibilityNoteEn:
      'M134D uses a 6-barrel 3,000 RPM rotating cluster, incompatible with single-bore muzzle attachments.',
    opticCompatibilityNoteZh:
      '顶部提把桥支持加装航空广角反射红点或 FLIR 夜间热成像仪。',
    opticCompatibilityNoteEn:
      'Top carry-handle bridge mounts reflex red dot or FLIR thermal sight.',
  },
  an94: {
    weaponId: 'an94',
    platformClass: 'rifle',
    modelScale: 0.94,
    muzzleAnchor: [45.55, 1.65, 0],
    muzzleFollowPartId: 'an94_barrel',
    muzzleReplacedPartIds: ['an94_muzzle_brake'],
    opticRailAnchor: [-2.5, 4.16, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  winchester1894: {
    weaponId: 'winchester1894',
    platformClass: 'rifle',
    modelScale: 0.88,
    muzzleAnchor: [56.32, 1.45, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: [8.4, 2.42, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
    opticCompatibilityNoteZh:
      '前移式侦察镜座安装于枪管节套上方，避让温彻斯特 1894 经典开顶垂直抛壳窗口。',
    opticCompatibilityNoteEn:
      'Forward scout mount on the barrel breech clears the classic top-ejecting receiver opening.',
  },
  rem870: {
    weaponId: 'rem870',
    platformClass: 'shotgun',
    modelScale: 0.94,
    muzzleAnchor: [53.35, 1.35, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: [2.4, 2.96, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  // --- Compound Archery (cleanly skipped with dedicated engineering notice) ---
  lift33: {
    weaponId: 'lift33',
    platformClass: 'archery',
    modelScale: 1.0,
    muzzleAnchor: null,
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: null,
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: NONE_MUZZLE,
    allowedOptics: NONE_OPTIC,
    muzzleCompatibilityNoteZh:
      '复合弓采用无烟弹性势能推射，无火药膛口与枪口螺纹接口。',
    muzzleCompatibilityNoteEn:
      'Compound bow uses smokeless elastic limb energy with no propellant muzzle.',
    opticCompatibilityNoteZh:
      'Mathews LIFT 33 采用专用 Bridge-Lock 燕尾槽多针光纤弓瞄。',
    opticCompatibilityNoteEn:
      'Mathews LIFT 33 uses a dedicated Bridge-Lock dovetail bow sight.',
  },
  r500: {
    weaponId: 'r500',
    platformClass: 'archery',
    modelScale: 1.0,
    muzzleAnchor: null,
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: null,
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: NONE_MUZZLE,
    allowedOptics: NONE_OPTIC,
    muzzleCompatibilityNoteZh:
      'Ravin R500 复合弩采用 300 lb 螺旋凸轮弓片蓄能，无火药枪口装置接口。',
    muzzleCompatibilityNoteEn:
      'Ravin R500 crossbow fires via 300 lb helical cams with no firearm muzzle interface.',
    opticCompatibilityNoteZh:
      '标配 100 yd BDC 专用弩瞄，无需替换轻武器导轨配件。',
    opticCompatibilityNoteEn:
      'Equipped with a dedicated 100 yd BDC crossbow scope.',
  },
  // --- 1:1 Main Battle Tanks (clean notice pointing to Tank Crew FLIR / Remote FCS) ---
  ztz99a: {
    weaponId: 'ztz99a',
    platformClass: 'armor',
    modelScale: 1.0,
    muzzleAnchor: null,
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: null,
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: NONE_MUZZLE,
    allowedOptics: NONE_OPTIC,
    muzzleCompatibilityNoteZh:
      '125mm ZPT-98 滑膛主炮配备炮口热护套与校炮镜，不适用单兵轻武器枪口附件。',
    muzzleCompatibilityNoteEn:
      '125mm ZPT-98 smoothbore cannon uses a thermal sleeve & muzzle reference system, not small-arms muzzle devices.',
    opticCompatibilityNoteZh:
      '主战坦克搭载车长独立周视热像仪 (CITV) 与激光压制观瞄，请前往「坦克车长火控台」体验实时热成像瞄准！',
    opticCompatibilityNoteEn:
      'ZTZ-99A integrates a stabilized Commander CITV & FLIR fire-control system — open Tank Crew FCS for live thermal sighting!',
  },
  m1a2: {
    weaponId: 'm1a2',
    platformClass: 'armor',
    modelScale: 1.0,
    muzzleAnchor: null,
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: null,
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: NONE_MUZZLE,
    allowedOptics: NONE_OPTIC,
    muzzleCompatibilityNoteZh:
      '120mm M256 滑膛炮不兼容轻武器枪口附件。',
    muzzleCompatibilityNoteEn:
      '120mm M256 smoothbore gun does not accept small-arms muzzle attachments.',
    opticCompatibilityNoteZh:
      'M1A2 SEP v3 配备第三代 FLIR 车长周视仪与 CROWS-LP 遥控武器站，请开启「坦克车长火控台」交互体验！',
    opticCompatibilityNoteEn:
      'M1A2 SEP v3 features 3rd-gen FLIR CITV & CROWS-LP remote weapon station — launch Tank Crew FCS for thermal optics!',
  },
  leopard2a7: {
    weaponId: 'leopard2a7',
    platformClass: 'armor',
    modelScale: 1.0,
    muzzleAnchor: null,
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: null,
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: NONE_MUZZLE,
    allowedOptics: NONE_OPTIC,
    muzzleCompatibilityNoteZh:
      '120mm Rh-120 L/55A1 高压滑膛炮不兼容轻武器枪口附件。',
    muzzleCompatibilityNoteEn:
      '120mm Rh-120 L/55A1 cannon does not accept small-arms muzzle attachments.',
    opticCompatibilityNoteZh:
      '豹 2A7V 集成 PERI R17A3 车长热像周视镜与 EMES-15 炮长镜，请开启「坦克车长火控台」切换热像火控！',
    opticCompatibilityNoteEn:
      'Leopard 2A7V integrates PERI R17A3 thermal CITV & EMES-15 gunner optics — open Tank Crew FCS for FLIR control!',
  },
  tiger1: {
    weaponId: 'tiger1',
    platformClass: 'armor',
    modelScale: 1.0,
    muzzleAnchor: null,
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: null,
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: NONE_MUZZLE,
    allowedOptics: NONE_OPTIC,
    muzzleCompatibilityNoteZh:
      '88mm KwK 36 L/56 主炮原厂已配备重型双室炮口制退器，不兼容轻武器附件。',
    muzzleCompatibilityNoteEn:
      '88mm KwK 36 L/56 main gun already carries a heavy twin-baffle artillery brake.',
    opticCompatibilityNoteZh:
      '虎式 131 配备蔡司 TZF 9b 炮长双目光学镜，请开启「坦克车长火控台」操纵炮塔回转与观瞄！',
    opticCompatibilityNoteEn:
      'Tiger 131 uses Zeiss TZF 9b binocular gunner optics — open Tank Crew FCS to operate turret traverse & optics!',
  },
  // --- V6.0 Track C Exhibits (BAY-30 ~ BAY-34) ---
  m1911: {
    weaponId: 'm1911',
    platformClass: 'pistol',
    modelScale: 0.72,
    muzzleAnchor: [11.6, 2.55, 0],
    muzzleFollowPartId: 'm1911_barrel',
    muzzleReplacedPartIds: [],
    opticRailAnchor: [-4.2, 3.62, 0],
    opticFollowPartId: 'm1911_slide',
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: PISTOL_OPTICS,
    opticCompatibilityNoteZh:
      '往复式手枪套筒仅兼容超轻微型反射红点（重型变倍镜/热像仪将阻碍勃朗宁单绞链短后坐循环）。',
    opticCompatibilityNoteEn:
      'Reciprocating slide accepts Micro Reflex Red Dot only (heavy optics stall Browning swinging-link cycling).',
  },
  mg42: {
    weaponId: 'mg42',
    platformClass: 'lmg',
    modelScale: 0.96,
    muzzleAnchor: [73.2, 1.5, 0],
    muzzleFollowPartId: 'mg42_barrel',
    muzzleReplacedPartIds: ['mg42_muzzle_booster'],
    opticRailAnchor: [4.2, 5.05, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  k98k: {
    weaponId: 'k98k',
    platformClass: 'rifle',
    modelScale: 0.92,
    muzzleAnchor: [66.2, 1.5, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: [1.5, 3.28, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: ['k98k_stripper_clip'],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  thompson: {
    weaponId: 'thompson',
    platformClass: 'smg',
    modelScale: 0.88,
    muzzleAnchor: [39.0, 1.6, 0],
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: ['thompson_cutts_comp'],
    opticRailAnchor: [7.2, 3.32, 0],
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: ALL_MUZZLES,
    allowedOptics: ALL_OPTICS,
  },
  gau8: {
    weaponId: 'gau8',
    platformClass: 'ordnance',
    modelScale: 1.0,
    muzzleAnchor: null,
    muzzleFollowPartId: null,
    muzzleReplacedPartIds: [],
    opticRailAnchor: null,
    opticFollowPartId: null,
    opticReplacedPartIds: [],
    allowedMuzzles: NONE_MUZZLE,
    allowedOptics: NONE_OPTIC,
    muzzleCompatibilityNoteZh:
      'GAU-8/A 七管 30×173mm 航炮采用 557 RPM 旋转穿孔炮口稳定箍，不兼容单兵轻武器枪口螺纹附件。',
    muzzleCompatibilityNoteEn:
      'GAU-8/A’s 7-barrel 30x173mm rotary cluster spins inside a perforated muzzle clamp and does not accept small-arms muzzle devices.',
    opticCompatibilityNoteZh:
      '该航空重武固定安装于 A-10 攻击机机头纵轴内，由座舱 HUD 光学平显与火控计算机统一瞄准解算。',
    opticCompatibilityNoteEn:
      'Hard-mounted along the A-10 Thunderbolt II fuselage centerline and aimed via cockpit HUD & CCIP fire-control computer.',
  },
};

export function getWeaponAttachmentMountProfile(
  weaponId: WeaponId
): WeaponAttachmentMountProfile {
  return WEAPON_ATTACHMENT_PROFILES[weaponId];
}

export function isWeaponAttachmentBenchSupported(weaponId: WeaponId): boolean {
  const p = WEAPON_ATTACHMENT_PROFILES[weaponId];
  return p.allowedMuzzles.length > 1 || p.allowedOptics.length > 1;
}

export function isMuzzleCompatible(
  weaponId: WeaponId,
  muzzleId: MuzzleAttachmentId
): boolean {
  return WEAPON_ATTACHMENT_PROFILES[weaponId].allowedMuzzles.includes(muzzleId);
}

export function isOpticCompatible(
  weaponId: WeaponId,
  opticId: OpticAttachmentId
): boolean {
  return WEAPON_ATTACHMENT_PROFILES[weaponId].allowedOptics.includes(opticId);
}

/**
 * Pure deterministic physics combinator merging mounted muzzle + optic deltas.
 */
export function computeCombinedAttachmentPhysics(
  muzzleId: MuzzleAttachmentId,
  opticId: OpticAttachmentId
): AttachmentPhysicsDelta {
  const m = MUZZLE_ATTACHMENT_SPECS[muzzleId].physics;
  const o = OPTIC_ATTACHMENT_SPECS[opticId].physics;
  const lowPassHz =
    m.lowPassHz !== null && o.lowPassHz !== null
      ? Math.min(m.lowPassHz, o.lowPassHz)
      : (m.lowPassHz ?? o.lowPassHz);

  return {
    soundDbDelta: m.soundDbDelta + o.soundDbDelta,
    lowPassHz,
    recoilRiseMultiplier: Number(
      (m.recoilRiseMultiplier * o.recoilRiseMultiplier).toFixed(4)
    ),
    muzzleVelocityMultiplier: Number(
      (m.muzzleVelocityMultiplier * o.muzzleVelocityMultiplier).toFixed(4)
    ),
    gasBaffleRetention: Math.min(1, m.gasBaffleRetention + o.gasBaffleRetention),
    sideBlastRatio: Math.min(1, m.sideBlastRatio + o.sideBlastRatio),
    addedMassGrams: m.addedMassGrams + o.addedMassGrams,
    flashAttenuation: Math.min(1, m.flashAttenuation + o.flashAttenuation),
    highFreqCrackBoost: Math.min(
      1,
      m.highFreqCrackBoost + o.highFreqCrackBoost
    ),
  };
}

/**
 * Computes exact world-space +X muzzle exit coordinate when a modular muzzle device is mounted.
 * When `muzzleId === 'none'` or weapon lacks a muzzle anchor, returns `fallbackMuzzleX`.
 */
export function computeMountedMuzzleExitX(
  weaponId: WeaponId,
  muzzleId: MuzzleAttachmentId,
  fallbackMuzzleX: number
): number {
  if (muzzleId === 'none') return fallbackMuzzleX;
  const profile = WEAPON_ATTACHMENT_PROFILES[weaponId];
  if (!profile.muzzleAnchor || !profile.allowedMuzzles.includes(muzzleId)) {
    return fallbackMuzzleX;
  }
  const spec = MUZZLE_ATTACHMENT_SPECS[muzzleId];
  return profile.muzzleAnchor[0] + spec.lengthCm * profile.modelScale;
}

/**
 * Returns stock weapon part IDs that should be hidden while replaced by active modular attachments.
 */
export function getAttachmentReplacedPartIds(
  weaponId: WeaponId,
  muzzleId: MuzzleAttachmentId,
  opticId: OpticAttachmentId
): readonly string[] {
  const profile = WEAPON_ATTACHMENT_PROFILES[weaponId];
  const out: string[] = [];
  if (muzzleId !== 'none' && profile.allowedMuzzles.includes(muzzleId)) {
    for (let i = 0; i < profile.muzzleReplacedPartIds.length; i++) {
      out.push(profile.muzzleReplacedPartIds[i]);
    }
  }
  if (opticId !== 'none' && profile.allowedOptics.includes(opticId)) {
    for (let i = 0; i < profile.opticReplacedPartIds.length; i++) {
      out.push(profile.opticReplacedPartIds[i]);
    }
  }
  return out;
}

/**
 * Resolves a named tactical preset into a guaranteed-compatible loadout for `weaponId`.
 * For example, `stealth_ops` (`suppressor + thermal`) gracefully falls back to
 * `suppressor + red_dot` on reciprocating-slide pistols (`g17`, `p320`), or
 * `none + thermal` on integrally suppressed `vss`.
 */
export function resolvePresetForWeapon(
  weaponId: WeaponId,
  presetId: AttachmentPresetId
): WeaponAttachmentLoadout {
  const preset = ATTACHMENT_PRESET_SPECS[presetId];
  const profile = WEAPON_ATTACHMENT_PROFILES[weaponId];

  let muzzle: MuzzleAttachmentId = preset.muzzle;
  if (!profile.allowedMuzzles.includes(muzzle)) {
    if (
      presetId === 'stealth_ops' &&
      profile.allowedMuzzles.includes('flash_hider')
    ) {
      muzzle = 'flash_hider';
    } else {
      muzzle = 'none';
    }
  }

  let optic: OpticAttachmentId = preset.optic;
  if (!profile.allowedOptics.includes(optic)) {
    if (optic !== 'none' && profile.allowedOptics.includes('red_dot')) {
      optic = 'red_dot';
    } else {
      optic = 'none';
    }
  }

  return { muzzle, optic };
}
