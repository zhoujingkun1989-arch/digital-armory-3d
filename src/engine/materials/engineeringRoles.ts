import type {
  AssemblyGroupKey,
  MaterialKind,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';
import { isArcheryWeapon } from '../physics/armoryPhysics';

/**
 * WP-05 — Engineering Functional Role Classification & Operating Energy-Flow Profiles
 * ----------------------------------------------------------------------------------
 * Maps all 404 procedural/CSG parts across 16 vault exhibits (14 firearms & 2 compound
 * archery systems) into 6 canonical mechanical engineering functional roles, enabling
 * Matt Rittman-style color-coded cutaway pedagogy with zero WebGL shader recompilation.
 */

export type EngineeringRole =
  | 'locking'
  | 'gas_drive'
  | 'bolt_carrier'
  | 'fire_control'
  | 'energy_spring'
  | 'housing_feed';

export const ENGINEERING_ROLE_ORDER: readonly EngineeringRole[] = [
  'locking',
  'gas_drive',
  'bolt_carrier',
  'fire_control',
  'energy_spring',
  'housing_feed',
];

export interface EngineeringRoleMeta {
  role: EngineeringRole;
  labelZh: string;
  labelEn: string;
  shortZh: string;
  shortEn: string;
  descZh: string;
  descEn: string;
  /** Primary sRGB hex injected into `uFunctionalTint` (calibrated for AgX without bloom blow-out) */
  colorHex: string;
  /** Cross-section stencil cap base color when section-cut (`C`) + functional tint (`T`) are active */
  capBaseHex: string;
  /** Cross-section ISO 45° hatch color */
  capHatchHex: string;
  /** Default diffuse mix factor in [0..1] when active */
  mixStrength: number;
}

export const ENGINEERING_ROLE_META: Readonly<
  Record<EngineeringRole, EngineeringRoleMeta>
> = {
  locking: {
    role: 'locking',
    labelZh: '闭锁与承压膛体',
    labelEn: 'Locking & Breech',
    shortZh: '闭锁承压',
    shortEn: 'Locking',
    descZh:
      '承受数百兆帕峰值膛压的刚性闭锁突笋、滚柱楔铁、加速子与冷锻枪管节套。',
    descEn:
      'High-pressure breech parts: rotating bolt lugs, locking rollers/wedge, accelerator, and barrel trunnion.',
    colorHex: '#f59e0b',
    capBaseHex: '#d97706',
    capHatchHex: '#78350f',
    mixStrength: 0.84,
  },
  gas_drive: {
    role: 'gas_drive',
    labelZh: '导气与活塞驱动',
    labelEn: 'Gas Tap & Piston',
    shortZh: '导气驱动',
    shortEn: 'Gas System',
    descZh:
      '自枪管导气孔分流高压火药燃气的导气箍、气吹管、调节塞与长/短行程活塞。',
    descEn:
      'Propellant gas manifold: gas block, DI gas tube, regulator plug, and long/short-stroke pistons.',
    colorHex: '#06b6d4',
    capBaseHex: '#0891b2',
    capHatchHex: '#164e63',
    mixStrength: 0.86,
  },
  bolt_carrier: {
    role: 'bolt_carrier',
    labelZh: '自动机与复进总成',
    labelEn: 'Carrier & Slide',
    shortZh: '自动机框',
    shortEn: 'Carrier/Slide',
    descZh:
      '驱动开闭锁凸轮并完成抽抛壳推弹循环的枪机框、手枪套筒、配重缓冲器与导杆。',
    descEn:
      'Reciprocating operating mass: bolt carrier, pistol slide, cam pin, charging handle, and guide rod.',
    colorHex: '#3b82f6',
    capBaseHex: '#2563eb',
    capHatchHex: '#1e3a8a',
    mixStrength: 0.82,
  },
  fire_control: {
    role: 'fire_control',
    labelZh: '火控与击发机构',
    labelEn: 'Fire Control & Striker',
    shortZh: '火控击发',
    shortEn: 'Fire Control',
    descZh:
      '控制待击、保险、单连发截获与底火撞击的扳机、阻铁、断连器、击锤与击针。',
    descEn:
      'Trigger, primary sear, disconnector, selector cam, rotary hammer, striker, and firing pin.',
    colorHex: '#f43f5e',
    capBaseHex: '#e11d48',
    capHatchHex: '#881337',
    mixStrength: 0.85,
  },
  energy_spring: {
    role: 'energy_spring',
    labelZh: '弹性储能复位件',
    labelEn: 'Energy Springs',
    shortZh: '储能弹簧',
    shortEn: 'Springs',
    descZh:
      '吸收后坐动能并驱动复进闭锁、击发与托弹上抬的复进簧、击针簧与弹匣簧。',
    descEn:
      'Mechanical energy storage: recoil/buffer springs, hammer/striker springs, and magazine springs.',
    colorHex: '#10b981',
    capBaseHex: '#059669',
    capHatchHex: '#064e3b',
    mixStrength: 0.86,
  },
  housing_feed: {
    role: 'housing_feed',
    labelZh: '机匣基座与供弹具',
    labelEn: 'Receiver & Magazine',
    shortZh: '机匣供弹',
    shortEn: 'Housing/Mag',
    descZh:
      '提供导轨约束与人机握持的上下机匣、底盘护木、枪托瞄具及供弹弹匣壳体。',
    descEn:
      'Structural receiver shells, chassis furniture, sights, muzzle devices, and magazine feed body.',
    colorHex: '#475569',
    capBaseHex: '#334155',
    capHatchHex: '#64748b',
    mixStrength: 0.74,
  },
};

function defineArcheryRole(
  role: EngineeringRole,
  labels: Pick<
    EngineeringRoleMeta,
    'labelZh' | 'labelEn' | 'shortZh' | 'shortEn' | 'descZh' | 'descEn'
  >
): EngineeringRoleMeta {
  const base = ENGINEERING_ROLE_META[role];
  return {
    ...base,
    ...labels,
  };
}

/**
 * Archery-domain subsystem labels & descriptions preserving canonical role IDs,
 * shader tint hexes, and ISO 128 stencil cross-section cap palettes.
 */
export const ARCHERY_ROLE_META: Readonly<
  Record<EngineeringRole, EngineeringRoleMeta>
> = {
  locking: defineArcheryRole('locking', {
    labelZh: '凸轮主轴与承力锁止',
    labelEn: 'Cam & Axle Load',
    shortZh: '凸轮承力',
    shortEn: 'Cam / Axle',
    descZh:
      '承受满拉峰值张力与偏心扭矩的二进制/螺旋凸轮、钛合金轮轴、弓片座及防空放抓弦锁。',
    descEn:
      'High-load cam & lockup parts: SwitchWeight-X / HexCoil cams, titanium axles, limb pockets, and anti-dry-fire latches.',
  }),
  gas_drive: defineArcheryRole('gas_drive', {
    labelZh: '弯曲弓片与传动缆索',
    labelEn: 'Flex Limbs & Cables',
    shortZh: '弓片力缆',
    shortEn: 'Limbs/Cables',
    descZh:
      '弯曲蓄积数百磅弹性势能的分体碳纤维弓片、Y 型分叉副弦与螺旋交叉传动动力缆索。',
    descEn:
      'Elastic energy-storage assembly: split quad carbon limbs, Y-yoke control cables, and helical power cables.',
  }),
  bolt_carrier: defineArcheryRole('bolt_carrier', {
    labelZh: '主弦推射与驱动滑架',
    labelEn: 'Bowstring & Drive Sled',
    shortZh: '弦索滑架',
    shortEn: 'String/Sled',
    descZh:
      '沿做功行程传递推力的 BCY 编织主弓弦、VersaDrive 上弦丝杠、悬浮滑架、分弦滚轮与落箭拨叉。',
    descEn:
      'Power-stroke transfer assembly: BCY bowstring, VersaDrive leadscrew, floating sled, cable guard, and launcher fork.',
  }),
  fire_control: defineArcheryRole('fire_control', {
    labelZh: '撒放火控与箭台瞄具',
    labelEn: 'Release & Rest',
    shortZh: '撒放箭台',
    shortEn: 'Release/Rest',
    descZh:
      '控制 D 环撒放、联动落箭让位、匹配阻铁脱扣、自动防空放保险及多层弹道标定瞄具的精准机构。',
    descEn:
      'Release & aiming control: D-loop peep, drop-away arrow rest, match sear, safety selector, and fiber-optic sight pins.',
  }),
  energy_spring: defineArcheryRole('energy_spring', {
    labelZh: '谐波阻尼与复位弹簧',
    labelEn: 'Dampers & Springs',
    shortZh: '阻尼弹簧',
    shortEn: 'Dampers',
    descZh:
      '吸收撒放后高频弓片余振、刹停主弓弦并驱动抓弦爪迅速回弹锁弦的弹性体阻尼与琴钢丝弹簧。',
    descEn:
      'Vibration control & return springs: elastomer limb/string dampeners and high-fatigue coil springs for latch reset.',
  }),
  housing_feed: defineArcheryRole('housing_feed', {
    labelZh: '弓把托架与箭壶箭矢',
    labelEn: 'Riser, Stock & Quiver',
    shortZh: '弓把箭壶',
    shortEn: 'Riser/Quiver',
    descZh:
      '提供桥式桁架刚性支撑与人机握持的 CNC 弓把、无托底盘、光学桥镜、快拆箭壶与 400 格令碳素矢箭。',
    descEn:
      'Structural chassis & arrow feed: 7075-T6 truss riser, bullpup stock, flight rail/optic, quick-detach quiver, and 400 gr arrows/bolts.',
  }),
};

/**
 * Resolves subsystem role metadata tailored to the active platform (firearm vs archery).
 */
export function getEngineeringRoleMeta(
  role: EngineeringRole,
  weaponId?: WeaponId | string | null
): EngineeringRoleMeta {
  return isArcheryWeapon(weaponId)
    ? ARCHERY_ROLE_META[role]
    : ENGINEERING_ROLE_META[role];
}

export type GasOperatingFamily =
  | 'long_stroke_piston'
  | 'direct_impingement'
  | 'short_stroke_piston'
  | 'dual_short_stroke_argo'
  | 'muzzle_long_stroke_piston'
  | 'forward_underbarrel_piston'
  | 'roller_delayed_blowback'
  | 'off_axis_delayed_blowback'
  | 'straight_blowback'
  | 'short_recoil_tilting'
  | 'short_recoil_toggle_lock'
  | 'short_recoil_accelerator'
  | 'revolver_ratchet_index'
  | 'manual_bolt_action'
  | 'compound_bow_binary_cam'
  | 'compound_crossbow_helical_cam';

export interface WeaponGasManifoldProfile {
  weaponId: WeaponId;
  family: GasOperatingFamily;
  hasGasTap: boolean;
  familyTitleZh: string;
  familyTitleEn: string;
  flowNoteZh: string;
  flowNoteEn: string;
  /** Chamber breech X in weapon world space (cm) */
  chamberX: number;
  /** Muzzle crown X in weapon world space (cm) */
  muzzleX: number;
  /** Bore centerline Y in weapon world space (cm) */
  boreY: number;
  /** Gas port tap X along barrel (null when non-gas-operated) */
  gasPortX: number | null;
  /** Gas cylinder / gas tube centerline Y (cm) */
  gasChannelY: number;
  /** Gas cylinder / gas tube lateral Z offset (cm; e.g. AUG right-cant +0.52) */
  gasChannelZ: number;
  /** Downstream end X of gas tube / piston stroke target (cm) */
  gasTargetX: number;
  /** Exhaust / secondary expansion vent world coords [x, y, z] */
  ventPos: readonly [number, number, number] | null;
}

export const WEAPON_GAS_MANIFOLD_PROFILES: Readonly<
  Record<WeaponId, WeaponGasManifoldProfile>
> = {
  ak15: {
    weaponId: 'ak15',
    family: 'long_stroke_piston',
    hasGasTap: true,
    familyTitleZh: '长行程导气活塞 · 双突笋 35° 回转闭锁',
    familyTitleEn: 'Long-Stroke Gas Piston · 2-Lug 35° Rotating Bolt',
    flowNoteZh:
      '弹头越过 60% 枪管导气孔后，高压燃气经 90° 导气箍上冲进入导气管，全程推动一体式长行程活塞与枪机框后坐。',
    flowNoteEn:
      'Past 60% bore travel, high-pressure gas taps upward at 90° into the gas tube, driving the unitized long-stroke piston and bolt carrier through full stroke.',
    chamberX: 5.4,
    muzzleX: 25.5,
    boreY: 1.05,
    gasPortX: 16.7,
    gasChannelY: 2.35,
    gasChannelZ: 0,
    gasTargetX: 7.2,
    ventPos: [15.4, 2.42, 0.45],
  },
  m4a1: {
    weaponId: 'm4a1',
    family: 'direct_impingement',
    hasGasTap: true,
    familyTitleZh: '斯通纳直接气吹 (DI) · 机框内膨胀室',
    familyTitleEn: 'Stoner Direct Impingement · Internal Carrier Piston',
    flowNoteZh:
      '燃气自三角准星座导气孔分流，沿细不锈钢导气管直吹入枪机框气匙，在枪机框内腔膨胀推框后坐并由右侧双孔泄压。',
    flowNoteEn:
      'Gas taps through the FSB down the stainless DI tube into the staked BCG gas key, pressurizing the internal carrier expansion chamber before venting right.',
    chamberX: 4.65,
    muzzleX: 24.15,
    boreY: 1.05,
    gasPortX: 15.05,
    gasChannelY: 1.72,
    gasChannelZ: 0,
    gasTargetX: 0.45,
    ventPos: [0.65, 1.05, 0.72],
  },
  mp5: {
    weaponId: 'mp5',
    family: 'roller_delayed_blowback',
    hasGasTap: false,
    familyTitleZh: '双滚柱 4:1 延迟半自由枪机 · 浮置槽弹膛',
    familyTitleEn: 'Roller-Delayed Blowback (4:1) · 12-Flute Chamber',
    flowNoteZh:
      '无导气孔：弹膛 12 条燃气浮置槽平衡抽壳摩擦，膛压经弹壳底面直推机头，迫使 Ø8mm 双滚柱沿 45° 楔铁内缩以 1:4 传动比延迟开锁。',
    flowNoteEn:
      'No gas port: 12 chamber flutes float the brass case while breech thrust drives Ø8mm rollers inward against the 45° locking piece at a 4:1 mechanical delay.',
    chamberX: 3.65,
    muzzleX: 19.55,
    boreY: 1.0,
    gasPortX: null,
    gasChannelY: 1.0,
    gasChannelZ: 0,
    gasTargetX: -1.8,
    ventPos: [2.2, 1.15, 0.75],
  },
  g17: {
    weaponId: 'g17',
    family: 'short_recoil_tilting',
    hasGasTap: false,
    familyTitleZh: '布朗宁枪管短后坐偏移下倾闭锁',
    familyTitleEn: 'Browning Short-Recoil Tilting-Barrel Lockup',
    flowNoteZh:
      '发射瞬间方形膛室与套筒抛壳窗刚性咬合共同短后坐约 3mm；待弹头出膛膛压骤降后，下闭锁耳沿闭锁块斜面下倾解脱套筒。',
    flowNoteEn:
      'Barrel hood and slide recoil locked together ~3mm until bullet exit drops pressure; locking-block cam then tilts the breech down to unlock the slide.',
    chamberX: 0.85,
    muzzleX: 11.4,
    boreY: 2.55,
    gasPortX: null,
    gasChannelY: 2.55,
    gasChannelZ: 0,
    gasTargetX: -2.4,
    ventPos: null,
  },
  m82a1: {
    weaponId: 'm82a1',
    family: 'short_recoil_accelerator',
    hasGasTap: false,
    familyTitleZh: '重枪管短后坐 · 加速子杠杆回转闭锁',
    familyTitleEn: 'Short-Recoil Heavy Barrel · Accelerator Lever Lock',
    flowNoteZh:
      '29 寸重枪管与三突笋枪机闭锁共同后坐约 25mm 吸收巨额冲量，加速子撞击机匣撬动枪机框高速分离并完成 15° 回转开锁。',
    flowNoteEn:
      'The 29" fluted barrel and 3-lug bolt recoil locked together ~25mm while the pivoted accelerator transfers barrel momentum into the bolt carrier.',
    chamberX: 6.42,
    muzzleX: 33.6,
    boreY: 1.25,
    gasPortX: null,
    gasChannelY: 1.25,
    gasChannelZ: 0,
    gasTargetX: -1.5,
    ventPos: null,
  },
  awm: {
    weaponId: 'awm',
    family: 'manual_bolt_action',
    hasGasTap: false,
    familyTitleZh: '手动 60° 六突笋刚性闭锁栓动',
    familyTitleEn: 'Manual 60° 6-Lug Locked-Breech Bolt Action',
    flowNoteZh:
      '全密封刚性闭膛：双排六突笋将 415 MPa 峰值膛压锁死在厚壁钢机匣内，零导气分流损失，能量 100% 转化为弹头超音速初速。',
    flowNoteEn:
      '100% sealed breech: dual-row 6 locking lugs contain 415 MPa peak pressure with zero gas-tap bleed, maximizing muzzle velocity Consistency.',
    chamberX: 4.55,
    muzzleX: 31.0,
    boreY: 1.05,
    gasPortX: null,
    gasChannelY: 1.05,
    gasChannelZ: 0,
    gasTargetX: 0.2,
    ventPos: null,
  },
  scar: {
    weaponId: 'scar',
    family: 'short_stroke_piston',
    hasGasTap: true,
    familyTitleZh: '短行程导气活塞顶杆 (Tappet) · 七突笋回转闭锁',
    familyTitleEn: 'Short-Stroke Gas Tappet · 7-Lug Rotating Bolt',
    flowNoteZh:
      '燃气经导气调节塞冲击不锈钢短行程活塞顶杆，顶杆仅急促后退约 14mm 赋予枪机框惯性后即截断高温积碳进入机匣。',
    flowNoteEn:
      'Gas metered by the regulator strikes the short-stroke stainless tappet over a ~14mm impulse stroke, isolating hot carbon fouling from the upper receiver.',
    chamberX: 5.35,
    muzzleX: 24.5,
    boreY: 1.05,
    gasPortX: 14.7,
    gasChannelY: 2.12,
    gasChannelZ: 0,
    gasTargetX: 10.6,
    ventPos: [15.9, 2.15, 0],
  },
  deagle: {
    weaponId: 'deagle',
    family: 'forward_underbarrel_piston',
    hasGasTap: true,
    familyTitleZh: '膛底前导气活塞 · 四突笋步枪级回转闭锁',
    familyTitleEn: 'Forward Under-Barrel Gas Piston · 4-Lug Rotating Bolt',
    flowNoteZh:
      '弹膛前方膛底导气孔将燃气引入枪管下方长通道，直冲枪口下方导气室推动桥式套筒活塞杆后坐，带动四突笋枪机回转开锁。',
    flowNoteEn:
      'A bore tap just ahead of the chamber ducts gas forward beneath the fixed barrel into the front cylinder cup, driving the slide-mounted piston rearward.',
    chamberX: 1.05,
    muzzleX: 16.05,
    boreY: 2.6,
    gasPortX: 3.3,
    gasChannelY: 1.48,
    gasChannelZ: 0,
    gasTargetX: 13.4,
    ventPos: [13.6, 1.32, 0.45],
  },
  aug: {
    weaponId: 'aug',
    family: 'short_stroke_piston',
    hasGasTap: true,
    familyTitleZh: '无托右偏置短行程活塞 · 双导杆七突笋闭锁',
    familyTitleEn: 'Bullpup Offset Short-Stroke Piston · Twin Guide Rods',
    flowNoteZh:
      '右偏置倾斜导气箍内短行程活塞受压后冲，通过右侧空心长导杆将冲量传至后置无托枪机框，驱动七突笋枪机旋转开锁。',
    flowNoteEn:
      'Right-offset gas block drives a short-stroke piston with its own return spring, transmitting impulse via the right guide rod to the bullpup bolt carrier.',
    chamberX: -7.1,
    muzzleX: 20.5,
    boreY: 1.05,
    gasPortX: 9.4,
    gasChannelY: 1.52,
    gasChannelZ: 0.52,
    gasTargetX: 5.8,
    ventPos: [10.8, 1.56, 0.65],
  },
  p320: {
    weaponId: 'p320',
    family: 'short_recoil_tilting',
    hasGasTap: false,
    familyTitleZh: '模块化 FCU 内胆 · 布朗宁枪管偏移下倾闭锁',
    familyTitleEn: 'Modular FCU Chassis · Short-Recoil Tilting Barrel',
    flowNoteZh:
      '套筒与闭锁枪管短后坐闭锁同行，待膛压安全泄放后枪管下凸耳沿不锈钢 FCU 闭锁斜面下沉开锁，平移击针由双阶阻铁复位。',
    flowNoteEn:
      'Slide and barrel recoil locked briefly before the barrel cam lug rides down the stainless FCU ramp, unlocking the slide after pressure blowdown.',
    chamberX: 0.95,
    muzzleX: 11.85,
    boreY: 2.68,
    gasPortX: null,
    gasChannelY: 2.68,
    gasChannelZ: 0,
    gasTargetX: -2.5,
    ventPos: null,
  },
  p90: {
    weaponId: 'p90',
    family: 'straight_blowback',
    hasGasTap: false,
    familyTitleZh: '重型自由枪机惯性闭膛 · 90° 螺旋供弹下抛壳',
    familyTitleEn: 'Heavy Straight Blowback · 90° Helical Feed & Bottom Eject',
    flowNoteZh:
      '5.7×28mm 直壁微锥弹壳依靠重型枪机质量惯性与双复进簧阻力限制早期后退，抽壳后空壳经握把后方垂直抛壳道向下抛出。',
    flowNoteEn:
      'Bolt mass inertia and twin recoil springs resist breech opening until safe pressure drop, ejecting spent brass straight down through the stock chute.',
    chamberX: -1.9,
    muzzleX: 16.85,
    boreY: 0.85,
    gasPortX: null,
    gasChannelY: 0.85,
    gasChannelZ: 0,
    gasTargetX: -6.4,
    ventPos: [-3.9, -2.6, 0],
  },
  lift33: {
    weaponId: 'lift33',
    family: 'compound_bow_binary_cam',
    hasGasTap: false,
    familyTitleZh: 'SwitchWeight-X 双同步偏心轮 · 四分体弹性储能',
    familyTitleEn: 'SwitchWeight-X Binary Cams · Split-Limb Elastic Strain Drive',
    flowNoteZh:
      '无火药燃气发射：拉弦时上下碳纤四分体弓片蓄积 57.6 J 弹性能并通过偏心轮降省至 15% 持力；撒放瞬间做功行程将 400 gr 碳箭平顺推射至 348 FPS (106 m/s)。',
    flowNoteEn:
      'Smokeless elastic propulsion: drawing stores energy across split carbon limbs through synchronized binary cams to an 85% let-off valley, then delivers 145.6 J over a 571.5 mm power stroke.',
    chamberX: -16.5,
    muzzleX: 35.5,
    boreY: 2.4,
    gasPortX: -12.6,
    gasChannelY: 41.5,
    gasChannelZ: 0,
    gasTargetX: -1.4,
    ventPos: [-12.6, -41.5, 0],
  },
  r500: {
    weaponId: 'r500',
    family: 'compound_crossbow_helical_cam',
    hasGasTap: false,
    familyTitleZh: 'HexCoil 360° 螺旋凸轮 · 悬浮零摩擦滑轨推射',
    familyTitleEn: 'HexCoil 360° Helical Cams · Frictionless Flight Power-Stroke',
    flowNoteZh:
      '300 lb 高刚度弓片弹性势能驱动：Versa-Drive 绞盘拉挂后，HexCoil 双叠螺旋轮将能量高度集中于 91 mm 宽跨距，由 Trac-Trigger 悬浮挂爪释放 500 FPS (301 J) 动能。',
    flowNoteEn:
      '300 lb compound limb strain: HexCoil 360° cams coil cables around opposing helical grooves for zero rail friction, releasing the bolt at 500 FPS (152.4 m/s · 301 J) from the floating trigger sled.',
    chamberX: -22.0,
    muzzleX: 38.5,
    boreY: 1.8,
    gasPortX: 25.2,
    gasChannelY: 1.8,
    gasChannelZ: 9.65,
    gasTargetX: 26.2,
    ventPos: [25.2, 1.8, -9.65],
  },
  python: {
    weaponId: 'python',
    family: 'revolver_ratchet_index',
    hasGasTap: false,
    familyTitleZh: '转轮棘轮拨齿分度 · 弹巢坡口间隙径向泄气',
    familyTitleEn: 'DA/SA Ratchet Cylinder Index · Forcing-Cone Gap Flash',
    flowNoteZh:
      '无导气孔：.357 马格南燃气推动弹头跃过弹巢前端与枪管坡口（Forcing Cone）之间的微米级间隙，产生特征性 360° 径向火光并沿 6 英寸锥度膛加速出膛，空弹壳留驻弹巢内。',
    flowNoteEn:
      'No gas tap: .357 Magnum propellant drives the JSP bullet across the cylinder-to-forcing-cone gap with a signature radial flash ring while brass remains sealed in the 6-shot cylinder.',
    chamberX: 0.1,
    muzzleX: 17.42,
    boreY: 2.35,
    gasPortX: null,
    gasChannelY: 2.35,
    gasChannelZ: 0,
    gasTargetX: -1.9,
    ventPos: [2.2, 2.35, 0.35],
  },
  benellim4: {
    weaponId: 'benellim4',
    family: 'dual_short_stroke_argo',
    hasGasTap: true,
    familyTitleZh: 'ARGO 膛前双路自调短行程活塞 · 双突笋回转闭锁',
    familyTitleEn: 'ARGO Twin Short-Stroke Gas Pistons · 2-Lug Rotating Bolt',
    flowNoteZh:
      '紧贴弹膛前方的左右对称双导气孔在最高温洁净区截取高压燃气，同步冲击枪管下方 ±Z 并列双不锈钢短行程活塞顶杆推动枪机框解锁。',
    flowNoteEn:
      'Twin symmetrical ports just ahead of the 12ga chamber tap hot clean gas into dual ±Z under-barrel stainless ARGO short-stroke pistons, impinging the bolt carrier.',
    chamberX: 10.8,
    muzzleX: 53.5,
    boreY: 1.35,
    gasPortX: 16.2,
    gasChannelY: 0.12,
    gasChannelZ: 1.18,
    gasTargetX: 11.4,
    ventPos: [16.8, 0.12, 1.45],
  },
  garand: {
    weaponId: 'garand',
    family: 'muzzle_long_stroke_piston',
    hasGasTap: true,
    familyTitleZh: '枪口下方导气筒长行程拉机柄 · 双突笋回转 + 8发漏夹弹射',
    familyTitleEn: 'Under-Muzzle Long-Stroke Op-Rod · 2-Lug Bolt & En-Bloc Clip',
    flowNoteZh:
      '弹头临近 24 英寸枪口（92% 膛程）越过底导气孔后，燃气下冲入不锈钢导气筒推动 S 形弯曲长行程拉机柄后坐，经自由行程泄压后由螺旋凸轮槽旋开枪机。',
    flowNoteEn:
      'At 92% of the 24" barrel, gas taps down into the stainless under-muzzle cylinder, driving the S-curved long-stroke op-rod rearward through free dwell before camming the bolt open.',
    chamberX: 8.35,
    muzzleX: 63.0,
    boreY: 1.15,
    gasPortX: 59.6,
    gasChannelY: 0.25,
    gasChannelZ: 0,
    gasTargetX: 48.8,
    ventPos: [56.2, -0.25, 0],
  },
  m249: {
    weaponId: 'm249',
    family: 'long_stroke_piston',
    hasGasTap: true,
    familyTitleZh: '下置长行程导气活塞 · 开膛双突笋回转 + 顶滚轮拨链',
    familyTitleEn: 'Underbarrel Long-Stroke Piston · Open-Bolt 2-Lug & Belt Shuttle',
    flowNoteZh:
      'M855 弹头越过 18.3 英寸枪管下导气孔（X=34.8）后，高压燃气经调节箍冲入下导气筒，推动长行程杯状活塞滑块全程后坐，驱动双突笋逆旋开锁并由顶滚轮横向拨动 M27 弹链。',
    flowNoteEn:
      'Past the 18.3" barrel gas block, propellant taps downward into the underbarrel cylinder, driving the long-stroke piston carrier to cam open the 2-lug bolt and shuttle the M27 belt.',
    chamberX: 6.82,
    muzzleX: 57.3,
    boreY: 1.25,
    gasPortX: 34.8,
    gasChannelY: -0.65,
    gasChannelZ: 0,
    gasTargetX: 21.5,
    ventPos: [37.8, -0.85, 0.25],
  },
  p08: {
    weaponId: 'p08',
    family: 'short_recoil_toggle_lock',
    hasGasTap: false,
    familyTitleZh: '枪管短后坐 (6.5mm) · 双连杆过死点屈膝肘节闭锁',
    familyTitleEn: 'Short-Recoil Barrel (6.5mm) · Over-Center Knee-Joint Toggle Lock',
    flowNoteZh:
      '无导气孔：最高膛压期间双连杆肘节自锁于死点线下方 1.5°，随枪管与叉形节套刚性短后坐 6.5mm 泄压；随后尾滚子撞击机匣弧坡向上屈膝折起 53.5° 抽抛空壳。',
    flowNoteEn:
      'No gas port: the 2-bar toggle stays locked 1.5° below dead-center through 6.5mm of barrel recoil before rear rollers strike the frame ramps, buckling the knee upward 53.5°.',
    chamberX: 2.78,
    muzzleX: 12.2,
    boreY: 2.15,
    gasPortX: null,
    gasChannelY: 2.15,
    gasChannelZ: 0,
    gasTargetX: -1.8,
    ventPos: [1.2, 2.95, 0.25],
  },
  vector: {
    weaponId: 'vector',
    family: 'off_axis_delayed_blowback',
    hasGasTap: false,
    familyTitleZh: 'KRISS Super V 变角凸轮延迟 · -65° 钨钢滑块下潜偏转',
    familyTitleEn: 'KRISS Super V Cam-Delayed Blowback · -65° Off-Axis Vectoring',
    flowNoteZh:
      '无导气孔：.45 ACP 膛底推力经紧凑枪机两侧凸轮耳压入钨钢滑块陡角延迟槽，迫使配重滑块沿弹匣后方 -65° 垂直导轨高速下潜 64mm，产生向下反冲力矩抵消枪口上跳。',
    flowNoteEn:
      'No gas port: .45 ACP breech thrust drives lateral bolt trunnions against variable-angle cam slots, forcing the tungsten slider 64mm down the -65° chute to cancel muzzle climb.',
    chamberX: 11.2,
    muzzleX: 26.1,
    boreY: -0.95,
    gasPortX: null,
    gasChannelY: -0.95,
    gasChannelZ: 0,
    gasTargetX: 5.1,
    ventPos: [9.2, -0.85, 0.95],
  },
};

/**
 * Explicit per-part role overrides for parts whose mechanical role cannot be inferred
 * purely from generic substring rules (e.g. Desert Eagle gas-channel barrel, P90 blowback bolt).
 */
const EXPLICIT_PART_ROLE_OVERRIDES: Readonly<Record<string, EngineeringRole>> =
  {
    // AK-15
    ak_bolt: 'locking',
    ak_barrel: 'locking',
    ak_gas_block: 'gas_drive',
    ak_gas_tube: 'gas_drive',
    ak_bolt_carrier: 'bolt_carrier',
    ak_extractor: 'bolt_carrier',
    ak_recoil_guide: 'bolt_carrier',
    ak_firing_pin: 'fire_control',

    // M4A1
    m4a1_bolt: 'locking',
    m4a1_barrel: 'locking',
    m4a1_front_sight_base: 'gas_drive',
    m4a1_gas_tube: 'gas_drive',
    m4a1_bolt_carrier: 'bolt_carrier',
    m4a1_charging_handle: 'bolt_carrier',
    m4a1_buffer: 'bolt_carrier',
    m4a1_firing_pin: 'fire_control',

    // MP5
    mp5_bolt_head: 'locking',
    mp5_locking_rollers: 'locking',
    mp5_locking_roller_left: 'locking',
    mp5_locking_piece: 'locking',
    mp5_barrel: 'locking',
    mp5_bolt_carrier: 'bolt_carrier',
    mp5_charging_handle: 'bolt_carrier',
    mp5_recoil_rod: 'bolt_carrier',
    mp5_firing_pin: 'fire_control',
    mp5_grip_housing: 'housing_feed',

    // Glock 17
    barrel: 'locking',
    locking_block: 'locking',
    locking_block_pin: 'locking',
    slide: 'bolt_carrier',
    recoil_guide_rod: 'bolt_carrier',
    extractor: 'bolt_carrier',
    slide_lock: 'bolt_carrier',
    slide_stop_lever: 'bolt_carrier',
    slide_cover_plate: 'housing_feed',
    striker: 'fire_control',
    firing_pin_safety: 'fire_control',
    extractor_plunger: 'fire_control',

    // Barrett M82A1
    m82a1_barrel: 'locking',
    m82a1_barrel_extension: 'locking',
    m82a1_bolt: 'locking',
    m82a1_accelerator: 'locking',
    m82a1_bolt_carrier: 'bolt_carrier',
    m82a1_firing_pin: 'fire_control',

    // Accuracy International AWM
    awm_bolt_body: 'locking',
    awm_barrel: 'locking',
    awm_extractor: 'locking',
    awm_bolt_shroud: 'bolt_carrier',
    awm_striker: 'fire_control',
    awm_mag_catch: 'housing_feed',

    // FN SCAR-L
    scar_bolt: 'locking',
    scar_barrel: 'locking',
    scar_barrel_crossbolts: 'locking',
    scar_gas_block: 'gas_drive',
    scar_gas_piston: 'gas_drive',
    scar_bolt_carrier: 'bolt_carrier',
    scar_charging_handle: 'bolt_carrier',
    scar_recoil_rod: 'bolt_carrier',
    scar_firing_pin: 'fire_control',

    // Desert Eagle Mark XIX (.50 AE)
    deagle_bolt: 'locking',
    deagle_cam_pin: 'locking',
    deagle_barrel: 'gas_drive', // Integrates forward gas port & front piston cylinder
    deagle_slide: 'bolt_carrier', // Integrates reciprocating front gas piston rod
    deagle_recoil_rods: 'bolt_carrier',
    deagle_extractor: 'bolt_carrier',
    deagle_slide_stop: 'bolt_carrier',
    deagle_firing_pin: 'fire_control',
    deagle_safety: 'fire_control',
    deagle_hammer_strut: 'energy_spring',

    // Steyr AUG A1
    aug_bolt: 'locking',
    aug_barrel: 'locking',
    aug_barrel_lock: 'locking',
    aug_gas_block: 'gas_drive',
    aug_gas_regulator: 'gas_drive',
    aug_gas_piston: 'gas_drive',
    aug_bolt_carrier: 'bolt_carrier',
    aug_charging_handle: 'bolt_carrier',
    aug_firing_pin: 'fire_control',

    // SIG Sauer P320 M17
    p320_barrel: 'locking',
    p320_takedown_lever: 'locking',
    p320_slide: 'bolt_carrier',
    p320_recoil_guide_rod: 'bolt_carrier',
    p320_extractor: 'bolt_carrier',
    p320_slide_catch: 'bolt_carrier',
    p320_striker: 'fire_control',
    p320_striker_housing: 'fire_control',
    p320_safety_lock: 'fire_control',

    // FN P90
    p90_barrel: 'locking',
    p90_takedown_lock: 'locking',
    p90_bolt: 'bolt_carrier',
    p90_charging_handles: 'bolt_carrier',
    p90_guide_rods: 'bolt_carrier',
    p90_firing_pin: 'fire_control',
    p90_helical_ramp: 'housing_feed',

    // Mathews LIFT 33 Compound Bow (24 parts)
    lift33_riser: 'housing_feed',
    lift33_grip: 'housing_feed',
    lift33_upper_pocket: 'locking',
    lift33_lower_pocket: 'locking',
    lift33_cable_guard: 'bolt_carrier',
    lift33_stabilizer: 'housing_feed',
    lift33_upper_limbs: 'gas_drive',
    lift33_lower_limbs: 'gas_drive',
    lift33_upper_cam: 'locking',
    lift33_lower_cam: 'locking',
    lift33_cam_axles: 'locking',
    lift33_bowstring: 'bolt_carrier',
    lift33_yoke_cables: 'gas_drive',
    lift33_limb_dampeners: 'energy_spring',
    lift33_drop_away_rest: 'fire_control',
    lift33_launcher_fork: 'bolt_carrier',
    lift33_sight_housing: 'fire_control',
    lift33_sight_pins: 'fire_control',
    lift33_d_loop: 'fire_control',
    lift33_quiver_frame: 'housing_feed',
    lift33_quiver_hood: 'housing_feed',
    lift33_quiver_latch: 'housing_feed',
    lift33_arrow_shaft: 'housing_feed',
    lift33_broadhead: 'housing_feed',

    // Ravin R500 HexCoil Crossbow (25 parts)
    r500_chassis: 'housing_feed',
    r500_forend_grip: 'housing_feed',
    r500_pistol_grip: 'housing_feed',
    r500_buttstock: 'housing_feed',
    r500_foot_stirrup: 'housing_feed',
    r500_flight_rail: 'housing_feed',
    r500_riser_head: 'locking',
    r500_left_limbs: 'gas_drive',
    r500_right_limbs: 'gas_drive',
    r500_left_cam: 'locking',
    r500_right_cam: 'locking',
    r500_cam_axles: 'locking',
    r500_bowstring: 'bolt_carrier',
    r500_power_cables: 'gas_drive',
    r500_versadrive_screw: 'bolt_carrier',
    r500_trigger_sled: 'bolt_carrier',
    r500_string_latch: 'locking',
    r500_anti_dry_fire: 'locking',
    r500_trigger_sear: 'fire_control',
    r500_safety_selector: 'fire_control',
    r500_trigger_spring: 'energy_spring',
    r500_scope: 'housing_feed',
    r500_quiver_frame: 'housing_feed',
    r500_retention_arm: 'housing_feed',
    r500_carbon_bolt: 'housing_feed',

    // Colt Python 6" .357 Magnum Revolver (25 parts — non-gas-operated: 0 gas_drive!)
    python_barrel: 'locking',
    python_barrel_pin: 'locking',
    python_detent_plunger: 'locking',
    python_cylinder: 'locking',
    python_cylinder_bolt: 'locking',
    python_crane: 'locking',
    python_hand: 'bolt_carrier',
    python_extractor_star: 'bolt_carrier',
    python_extractor_rod: 'bolt_carrier',
    python_cylinder_latch: 'bolt_carrier',
    python_trigger: 'fire_control',
    python_hammer: 'fire_control',
    python_hammer_stirrup: 'fire_control',
    python_rebound_lever: 'fire_control',
    python_firing_pin: 'fire_control',
    python_mainspring: 'energy_spring',
    python_extractor_spring: 'energy_spring',
    python_frame: 'housing_feed',
    python_sideplate: 'housing_feed',
    python_sideplate_screws: 'housing_feed',
    python_grip_left: 'housing_feed',
    python_grip_right: 'housing_feed',
    python_front_sight: 'housing_feed',
    python_rear_sight: 'housing_feed',
    python_speedloader: 'housing_feed',

    // Benelli M4 (M1014) 12 Gauge Combat Shotgun (26 parts)
    benellim4_barrel: 'locking',
    benellim4_bolt_head: 'locking',
    benellim4_cam_pin: 'locking',
    benellim4_argo_pistons: 'gas_drive',
    benellim4_argo_plugs: 'gas_drive',
    benellim4_bolt_carrier: 'bolt_carrier',
    benellim4_charging_handle: 'bolt_carrier',
    benellim4_firing_pin: 'fire_control',
    benellim4_trigger: 'fire_control',
    benellim4_hammer: 'fire_control',
    benellim4_safety_button: 'fire_control',
    benellim4_recoil_spring: 'energy_spring',
    benellim4_hammer_spring: 'energy_spring',
    benellim4_mag_spring: 'energy_spring',
    benellim4_receiver: 'housing_feed',
    benellim4_picatinny_rail: 'housing_feed',
    benellim4_rear_sight: 'housing_feed',
    benellim4_front_sight: 'housing_feed',
    benellim4_forend: 'housing_feed',
    benellim4_recoil_tube: 'housing_feed',
    benellim4_telestock: 'housing_feed',
    benellim4_trigger_housing: 'housing_feed',
    benellim4_mag_tube: 'housing_feed',
    benellim4_mag_cap: 'housing_feed',
    benellim4_mag_follower: 'housing_feed',
    benellim4_shell_elevator: 'housing_feed',

    // U.S. Rifle Cal. .30 M1 Garand (26 parts)
    garand_barrel: 'locking',
    garand_bolt: 'locking',
    garand_gas_cylinder: 'gas_drive',
    garand_gas_lock_screw: 'gas_drive',
    garand_op_rod: 'gas_drive',
    garand_follower_arm: 'bolt_carrier',
    garand_op_rod_catch: 'bolt_carrier',
    garand_firing_pin: 'fire_control',
    garand_trigger: 'fire_control',
    garand_hammer: 'fire_control',
    garand_lower_band: 'housing_feed',
    garand_op_rod_spring: 'energy_spring',
    garand_hammer_spring: 'energy_spring',
    garand_receiver: 'housing_feed',
    garand_rear_sight: 'housing_feed',
    garand_front_sight: 'housing_feed',
    garand_walnut_stock: 'housing_feed',
    garand_front_handguard: 'housing_feed',
    garand_rear_handguard: 'housing_feed',
    garand_buttplate: 'housing_feed',
    garand_trigger_housing: 'housing_feed',
    garand_trigger_guard: 'housing_feed',
    garand_enbloc_clip: 'housing_feed',
    garand_follower: 'housing_feed',
    garand_bullet_guide: 'housing_feed',
    garand_clip_latch: 'housing_feed',

    // FN M249 SAW 5.56×45mm NATO Open-Bolt LMG (26 parts — gas-operated)
    m249_barrel: 'locking',
    m249_barrel_handle: 'locking',
    m249_bolt: 'locking',
    m249_gas_regulator: 'gas_drive',
    m249_gas_tube: 'gas_drive',
    m249_piston_carrier: 'bolt_carrier',
    m249_charging_handle: 'bolt_carrier',
    m249_hydraulic_buffer: 'bolt_carrier',
    m249_feed_lever: 'bolt_carrier',
    m249_firing_pin: 'fire_control',
    m249_trigger: 'fire_control',
    m249_open_bolt_sear: 'fire_control',
    m249_recoil_spring: 'energy_spring',
    m249_sear_spring: 'energy_spring',
    m249_receiver: 'housing_feed',
    m249_top_cover: 'housing_feed',
    m249_rear_sight: 'housing_feed',
    m249_front_sight: 'housing_feed',
    m249_handguard: 'housing_feed',
    m249_bipod: 'housing_feed',
    m249_buttstock: 'housing_feed',
    m249_trigger_frame: 'housing_feed',
    m249_feed_tray: 'housing_feed',
    m249_feed_pawls: 'housing_feed',
    m249_m27_belt: 'housing_feed',
    m249_ammo_box: 'housing_feed',

    // DWM Luger P08 9×19mm Toggle-Lock Pistol (25 parts — non-gas-operated: 0 gas_drive!)
    p08_barrel: 'locking',
    p08_barrel_extension: 'locking',
    p08_front_toggle: 'locking',
    p08_rear_toggle: 'locking',
    p08_toggle_pins: 'locking',
    p08_takedown_lever: 'locking',
    p08_breechblock: 'bolt_carrier',
    p08_extractor: 'bolt_carrier',
    p08_ejector: 'bolt_carrier',
    p08_hold_open: 'bolt_carrier',
    p08_striker: 'fire_control',
    p08_trigger: 'fire_control',
    p08_trigger_lever: 'fire_control',
    p08_sear_bar: 'fire_control',
    p08_thumb_safety: 'fire_control',
    p08_striker_spring: 'energy_spring',
    p08_recoil_spring: 'energy_spring',
    p08_mag_spring: 'energy_spring',
    p08_frame: 'housing_feed',
    p08_sideplate: 'housing_feed',
    p08_grip_left: 'housing_feed',
    p08_grip_right: 'housing_feed',
    p08_mag_body: 'housing_feed',
    p08_mag_follower: 'housing_feed',
    p08_mag_base: 'housing_feed',

    // KRISS Vector SMG Gen II .45 ACP (25 parts — non-gas-operated: 0 gas_drive!)
    vector_barrel: 'locking',
    vector_bolt: 'locking',
    vector_takedown_pins: 'locking',
    vector_slider: 'bolt_carrier',
    vector_guide_rod: 'bolt_carrier',
    vector_charging_handle: 'bolt_carrier',
    vector_firing_pin: 'fire_control',
    vector_fcu_chassis: 'fire_control',
    vector_trigger: 'fire_control',
    vector_hammer: 'fire_control',
    vector_fire_selector: 'fire_control',
    vector_thumb_safety: 'fire_control',
    vector_recoil_spring: 'energy_spring',
    vector_hammer_spring: 'energy_spring',
    vector_mag_spring: 'energy_spring',
    vector_muzzle_device: 'housing_feed',
    vector_upper_housing: 'housing_feed',
    vector_lower_chassis: 'housing_feed',
    vector_front_sight: 'housing_feed',
    vector_rear_sight: 'housing_feed',
    vector_stock_hinge: 'housing_feed',
    vector_folding_stock: 'housing_feed',
    vector_mag_body: 'housing_feed',
    vector_mag_follower: 'housing_feed',
    vector_mag_baseplate: 'housing_feed',
  };

export interface EngineeringPartClassifierInput {
  id: string;
  group: AssemblyGroupKey;
  material: MaterialKind;
  isShell?: boolean;
}

/**
 * Deterministically classifies any weapon component into one of the 6 canonical
 * mechanical engineering roles. O(1) dictionary/pattern lookup, safe for hot paths.
 */
export function resolvePartEngineeringRole(
  _weaponId: WeaponId,
  part: Pick<WeaponPartSpec, 'id' | 'group' | 'material' | 'isShell'>
): EngineeringRole {
  const explicit = EXPLICIT_PART_ROLE_OVERRIDES[part.id];
  if (explicit) return explicit;

  if (part.material === 'spring_steel' || /spring/.test(part.id)) {
    return 'energy_spring';
  }

  if (part.group === 'magazine') {
    return 'housing_feed';
  }

  if (
    part.group === 'fire_control' ||
    /trigger|hammer|striker|sear|disconnector|selector|firing_pin|connector/.test(
      part.id
    )
  ) {
    return 'fire_control';
  }

  if (/gas_block|gas_tube|gas_piston|gas_regulator/.test(part.id)) {
    return 'gas_drive';
  }

  if (
    /locking|accelerator|barrel_extension/.test(part.id) ||
    part.material === 'barrel_steel'
  ) {
    return 'locking';
  }

  if (
    !part.isShell &&
    /bolt_carrier|charging_handle|recoil_guide|recoil_rod|guide_rod/.test(
      part.id
    )
  ) {
    return 'bolt_carrier';
  }

  return 'housing_feed';
}
