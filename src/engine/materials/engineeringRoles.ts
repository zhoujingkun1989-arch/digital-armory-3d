import { buildCentennialGasManifolds } from '../../weapons/expansion/centennialProjectors';
import type {
  AssemblyGroupKey,
  MaterialKind,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';
import { isArcheryWeapon, isTankWeapon } from '../physics/armoryPhysics';

/**
 * WP-05 — Engineering Functional Role Classification & Operating Energy-Flow Profiles
 * ----------------------------------------------------------------------------------
 * Maps all 683 parts across 27 vault exhibits (21 firearms, 2 compound archery systems
 * & 4 1:1 Main Battle Tanks) into 6 canonical mechanical engineering functional roles,
 * enabling Matt Rittman-style color-coded cutaway pedagogy with zero WebGL shader recompilation.
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
 * Heavy Armor 1:1 Main Battle Tank subsystem labels & descriptions preserving
 * canonical 6 role IDs, shader tint hexes, and ISO 128 stencil cap palettes.
 */
export const ARMOR_ROLE_META: Readonly<
  Record<EngineeringRole, EngineeringRoleMeta>
> = {
  locking: defineArcheryRole('locking', {
    labelZh: '主炮炮管与炮闩承压',
    labelEn: 'Main Gun & Breech',
    shortZh: '主炮闭锁',
    shortEn: 'Main Gun',
    descZh:
      '承受 320–670 MPa 坦克主炮极限膛压的镀铬滑膛/线膛炮管、立/卧式楔形炮闩、炮盾摇架与炮塔座圈。',
    descEn:
      'High-pressure main armament: 88–125mm gun tube, vertical/horizontal sliding-wedge breech block, mantlet, and turret ring.',
  }),
  gas_drive: defineArcheryRole('gas_drive', {
    labelZh: '动力包与液力传动',
    labelEn: 'Powerpack & Drive',
    shortZh: '动力传动',
    shortEn: 'Powerpack',
    descZh:
      '为 55–67 吨重装底盘输出澎湃动力的 V12 双涡轮柴油机、AGT1500 燃气轮机、液力综合变速箱、冷却风扇与主油箱。',
    descEn:
      'Heavy armor propulsion pack: 700–1,500 hp V12 diesel or AGT1500 gas turbine, hydromechanical transmission, cooling fans, and fuel cells.',
  }),
  bolt_carrier: defineArcheryRole('bolt_carrier', {
    labelZh: '自动装弹与驻退循环',
    labelEn: 'Loader & Recoil',
    shortZh: '装弹驻退',
    shortEn: 'Loader/Recoil',
    descZh:
      '完成 290–340 mm 炮身驻退缓冲、转盘举弹推弹、液压防爆门启闭、待发弹装填与退壳导流的核心循环机构。',
    descEn:
      'Ordnance cycling mass: hydro-pneumatic recoil cradle, 22-rd carousel autoloader, rammer chain, hydraulic blast doors, and stub deflector.',
  }),
  fire_control: defineArcheryRole('fire_control', {
    labelZh: '猎歼观瞄与乘员战位',
    labelEn: 'Optics, FCS & Crew',
    shortZh: '火控观瞄',
    shortEn: 'Optics/FCS',
    descZh:
      '整合车长独立周视热像仪（CITV / PERI / TZF 9b）、顶置遥控武器站、烟幕弹发射器与车内乘员火控终端战位。',
    descEn:
      'Hunter-killer fire control: commander CITV/PERI/TZF optics, CROWS roof weapons, smoke dischargers, and crew tactical stations.',
  }),
  energy_spring: defineArcheryRole('energy_spring', {
    labelZh: '复进主簧与扭杆悬挂',
    labelEn: 'Recoil & Torsion',
    shortZh: '复进扭杆',
    shortEn: 'Springs/Bars',
    descZh:
      '吸收数十吨主炮后坐冲量的高刚度螺旋复进簧、炮闩/防爆门复位簧与贯穿车体底盘的 12–16 根高强度扭杆弹簧。',
    descEn:
      'Heavy mechanical energy storage: main-gun recuperator springs, breech/blast-door return springs, and hull torsion suspension bars.',
  }),
  housing_feed: defineArcheryRole('housing_feed', {
    labelZh: '复合主装甲与行走弹舱',
    labelEn: 'Armor, Tracks & Racks',
    shortZh: '装甲弹舱',
    shortEn: 'Armor/Hull',
    descZh:
      '提供多维度防护与机动支撑的焊接主车体、炮塔复合装甲、ERA/楔形附加模块、负重轮履带及隔爆/侧舷弹药舱。',
    descEn:
      'Armored hull, turret shell, ERA/arrowhead/composite arrays, road wheels, steel-rubber tracks, and compartmentalized ammo racks.',
  }),
};

/**
 * Resolves subsystem role metadata tailored to the active platform (firearm vs archery vs heavy armor).
 */
export function getEngineeringRoleMeta(
  role: EngineeringRole,
  weaponId?: WeaponId | string | null
): EngineeringRoleMeta {
  if (isTankWeapon(weaponId)) {
    return ARMOR_ROLE_META[role];
  }
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
  | 'caseless_rotary_clockwork'
  | 'integral_suppressed_piston'
  | 'electric_rotary_gatling'
  | 'pulley_floating_hyperburst'
  | 'compound_bow_binary_cam'
  | 'compound_crossbow_helical_cam'
  | 'tank_smoothbore_autoloader'
  | 'tank_smoothbore_bustle'
  | 'tank_rifled_horizontal_wedge';

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
  g11: {
    weaponId: 'g11',
    family: 'caseless_rotary_clockwork',
    hasGasTap: true,
    familyTitleZh: '浮置下置短行程导气活塞 · 90° 旋转无壳弹膛 + 2,100 RPM 钟表齿轮',
    familyTitleEn: 'Floating Underbarrel Short-Stroke Piston · 90-Deg Caseless Rotary Breech',
    flowNoteZh:
      '4.73mm DM11 药块 100% 燃尽推动弹头越过下导气孔，高压燃气脉冲冲击枪管下方短行程导气活塞，在全浮置机匣后坐 42mm 期间经齿条与钟表齿轮驱动旋转弹膛 90° 进弹闭锁。',
    flowNoteEn:
      'As the 4.73mm DM11 bullet passes the underbarrel tap, a short-stroke gas pulse drives the toothed rack and clockwork gears to cycle the 90-degree rotary breech during 42mm floating recoil.',
    chamberX: -19.5,
    muzzleX: 39.0,
    boreY: 0.0,
    gasPortX: 5.5,
    gasChannelY: -2.2,
    gasChannelZ: 0,
    gasTargetX: -13.5,
    ventPos: [3.2, -2.5, 0],
  },
  vss: {
    weaponId: 'vss',
    family: 'integral_suppressed_piston',
    hasGasTap: true,
    familyTitleZh: '整体六级隔板消音器 + 长行程导气活塞 · 六突笋回转 + 线性微声击针',
    familyTitleEn: 'Integral 6-Stage Baffle Suppressor & Long-Stroke Piston · 6-Lug Bolt',
    flowNoteZh:
      '290 m/s 9×39mm 亚音速重弹经过 200mm 泄压孔枪管时，部分燃气上冲进入导气管驱动长行程活塞，其余燃气经四排斜孔提前泄入整体六级斜切消音隔板腔逐级减速冷却。',
    flowNoteEn:
      'Along the ported 200mm barrel, gas taps upward into the long-stroke piston while excess subsonic propellant bleeds through radial ports into the 6-stage integral slant-baffle chamber.',
    chamberX: 6.2,
    muzzleX: 47.4,
    boreY: 1.05,
    gasPortX: 17.6,
    gasChannelY: 2.35,
    gasChannelZ: 0,
    gasTargetX: 7.4,
    ventPos: [31.0, 1.05, 0],
  },
  m134: {
    weaponId: 'm134',
    family: 'electric_rotary_gatling',
    hasGasTap: false,
    familyTitleZh: '28V 直流外能源电动六管加特林 · 正弦螺旋凸轮槽闭锁 (3,000 RPM)',
    familyTitleEn: '28V DC External-Powered 6-Barrel Gatling · Elliptical Cam-Track Lock',
    flowNoteZh:
      '无导气孔（100% 28V 外能源电动驱动）：全部 415 MPa 7.62 NATO 火药燃气专用于推进弹头出膛，由顶部直流马达驱动六槽转子沿静止凸轮定子环以每秒 50 发频率并行进弹、闭锁、击发与底排空壳！',
    flowNoteEn:
      'Zero gas tap (100% external 28V DC electric drive): all 415 MPa 7.62 NATO chamber pressure accelerates the projectile while the motor spins 6 cam-roller bolts at 50 rounds per second.',
    chamberX: -3.2,
    muzzleX: 50.2,
    boreY: 2.65,
    gasPortX: null,
    gasChannelY: 2.65,
    gasChannelZ: 0,
    gasTargetX: -12.0,
    ventPos: [-3.2, -3.5, 0],
  },
  an94: {
    weaponId: 'an94',
    family: 'pulley_floating_hyperburst',
    hasGasTap: true,
    familyTitleZh: '延迟后坐浮置导气枪管 + 滑轮钢索二级预供弹 (1,800 RPM 双发同孔)',
    familyTitleEn: 'Floating Recoil-Delayed Gas Action + Cable-Pulley 2-Stage Pre-Feed',
    flowNoteZh:
      '5.45mm 7N6 弹头越过导气孔（X=30.7）驱动活塞枪机框在整体后滑 42mm 的浮置内机匣内高速往复；同时编织钢索绕精密 CNC 滑轮前拽二级青铜预供弹滑块，实现 1,800 RPM 极速双发同孔连射！',
    flowNoteEn:
      'High-pressure 5.45mm gas drives the bolt carrier inside a 42mm-recoiling floating receiver while a braided steel cable around a CNC pulley lunges the 2-stage pre-feed rammer forward for 1,800 RPM bursts.',
    chamberX: 7.45,
    muzzleX: 51.3,
    boreY: 1.65,
    gasPortX: 30.7,
    gasChannelY: 3.15,
    gasChannelZ: 0,
    gasTargetX: 11.5,
    ventPos: [30.7, 3.35, 0.3],
  },
  ztz99a: {
    weaponId: 'ztz99a',
    family: 'tank_smoothbore_autoloader',
    hasGasTap: false,
    familyTitleZh: '125mm 高压滑膛炮 + 液气双筒驻退 · 22发底置转盘自动装弹机',
    familyTitleEn: '125mm Smoothbore Hydro-Pneumatic Recoil · 22-Rd Carousel Autoloader',
    flowNoteZh:
      '全闭锁高压主炮（无侧向导气孔）：650 MPa 膛压将 4.8 kg DTC10-125 钨合金长杆穿甲弹以 1,780 m/s 推射出膛；中段抽烟装置负压抽除炮膛废气，液气驻退机吸收 320mm 后坐并触发自动装弹机循环！',
    flowNoteEn:
      '100% sealed breech (zero gas tap): 650 MPa propellant accelerates a 4.8 kg tungsten dart to 1,780 m/s while the bore evacuator scavenges fumes and hydro-pneumatic cylinders arrest 320mm of recoil.',
    chamberX: 85,
    muzzleX: 710,
    boreY: 38,
    gasPortX: null,
    gasChannelY: 38,
    gasChannelZ: 0,
    gasTargetX: 25,
    ventPos: [405, 38, 0],
  },
  m1a2: {
    weaponId: 'm1a2',
    family: 'tank_smoothbore_bustle',
    hasGasTap: false,
    familyTitleZh: '120mm L/44 M256 滑膛炮 + 立式楔闩 · 隔爆尾舱防爆门人工装填',
    familyTitleEn: '120mm L/44 M256 Smoothbore · Vertical Wedge & Blast-Door Bustle',
    flowNoteZh:
      '全闭锁高压炮膛（无导气孔）：670 MPa 膛压将 M829A4 贫铀穿甲弹推射至 1,670 m/s，硝化纤维半可燃药筒在膛内几乎燃尽，立楔炮闩下沉退下钢制弹底护板并借抽烟筒清除炮膛残气。',
    flowNoteEn:
      'Sealed 670 MPa smoothbore breech drives the M829A4 dart to 1,670 m/s while incinerating its combustible cartridge case; the vertical wedge drops the steel stub base as the bore evacuator clears fumes.',
    chamberX: 54,
    muzzleX: 581,
    boreY: 44,
    gasPortX: null,
    gasChannelY: 44,
    gasChannelZ: 0,
    gasTargetX: 10,
    ventPos: [315, 44, 0],
  },
  leopard2a7: {
    weaponId: 'leopard2a7',
    family: 'tank_smoothbore_bustle',
    hasGasTap: false,
    familyTitleZh: '120mm Rh-120 L/55A1 超长高压滑膛炮 · 同轴液气驻退 + 隔爆尾舱',
    familyTitleEn: '120mm Rh-120 L/55A1 High-Pressure Smoothbore · Concentric Recoil',
    flowNoteZh:
      '加长 1.3 米的 6.6m L/55A1 高压滑膛身管令 670 MPa 发射药充分膨胀做功，赋予 DM63A1 穿甲弹 1,750 m/s 惊人初速；偏心抽烟筒利用膛压压差定向清膛，同轴双筒驻退复进机平稳吸收 340mm 后坐！',
    flowNoteEn:
      'The 6.6m L/55A1 barrel extends high-pressure expansion to accelerate DM63A1 to 1,750 m/s, with an eccentric bore evacuator scavenging fumes during the 340mm concentric hydro-pneumatic recoil stroke.',
    chamberX: 40,
    muzzleX: 712,
    boreY: 74,
    gasPortX: null,
    gasChannelY: 74,
    gasChannelZ: 0,
    gasTargetX: -10,
    ventPos: [365, 74, 0],
  },
  tiger1: {
    weaponId: 'tiger1',
    family: 'tank_rifled_horizontal_wedge',
    hasGasTap: false,
    familyTitleZh: '88mm KwK 36 L/56 线膛炮 + 双室膛口制退器 · 克虏伯半自动水平楔闩',
    familyTitleEn: '88mm KwK 36 L/56 Rifled Cannon · Twin-Baffle Brake & Krupp Wedge',
    flowNoteZh:
      '32 条右旋膛线令 10.2 kg PzGr. 39 被帽穿甲弹在 320 MPa 膛压下自旋稳定至 773 m/s；膛口标志性双室制退器向两侧分流逾 35% 高压火药燃气大幅削减 290mm 后坐冲量，复进末端自动横向拉开水平滑楔退出整枚 88mm 黄铜药筒！',
    flowNoteEn:
      '32-groove rifling spin-stabilizes the 10.2 kg PzGr. 39 shell to 773 m/s while the twin-baffle muzzle brake vents blast laterally to tame 290mm recoil and power the semi-automatic Krupp horizontal wedge.',
    chamberX: 60,
    muzzleX: 529,
    boreY: 102,
    gasPortX: null,
    gasChannelY: 102,
    gasChannelZ: 0,
    gasTargetX: 12,
    ventPos: [518, 102, 0],
  },
  winchester1894: {
    weaponId: 'winchester1894',
    family: 'manual_bolt_action',
    hasGasTap: false,
    familyTitleZh: 'D型杠杆手动连杆驱动 · 勃朗宁 H 型垂直升降闭锁块 + 开顶抛壳',
    familyTitleEn: 'Manual Lever-Link Drive · Browning Vertical H-Locking Block & Top Eject',
    flowNoteZh:
      '全闭膛无导气孔设计将 .30-30 WCF 290 MPa 燃气全部保留于 20" 枪管内加速平头弹至 670 m/s；射毕前推 D 型杠杆，由连杆下拉 H 型垂直闭锁块让位后抽出圆柱枪机向上高抛空壳。',
    flowNoteEn:
      'Sealed lever action retains 100% of 290 MPa .30-30 WCF pressure behind the 170 gr flat-nose bullet; swinging the D-loop forward drops the H locking block before drawing the cylindrical bolt rearward.',
    chamberX: 6.2,
    muzzleX: 56.5,
    boreY: 1.45,
    gasPortX: null,
    gasChannelY: 1.45,
    gasChannelZ: 0,
    gasTargetX: -0.4,
    ventPos: [56.5, 1.45, 0],
  },
  rem870: {
    weaponId: 'rem870',
    family: 'manual_bolt_action',
    hasGasTap: false,
    familyTitleZh: '手动双平行推拉连杆泵动 · 斜楔上翘闭锁块与硬铬托弹勺',
    familyTitleEn: 'Twin-Action-Bar Pump Drive · Tilting Locking Wedge & Flexitab Lifter',
    flowNoteZh:
      '封闭式 12 号重壁滑膛在射出 9 粒 00 号鹿弹期间零泄气承受 79 MPa 膛压；击锤降落解锁左拨片后，射手抓握玉米棒护木带动双钢推杆强制下拉斜楔闭锁块开锁退壳。',
    flowNoteEn:
      'Sealed 12-gauge smoothbore holds 79 MPa through shot exit; hammer fall unlocks the left action-bar lock so dual steel action bars retract the camming slide, drop the locking wedge, and cycle hulls.',
    chamberX: 9.0,
    muzzleX: 53.5,
    boreY: 1.35,
    gasPortX: null,
    gasChannelY: 1.35,
    gasChannelZ: 0,
    gasTargetX: 3.6,
    ventPos: [53.5, 1.35, 0],
  },
  m1911: {
    weaponId: 'm1911',
    family: 'short_recoil_tilting',
    hasGasTap: false,
    familyTitleZh: '勃朗宁 0.278" 单绞链偏移枪管短后坐 · 顶部双半圆闭锁筋',
    familyTitleEn:
      'Browning 0.278" Swinging-Link Short Recoil · Dual Top Locking Ribs',
    flowNoteZh:
      '闭锁状态下 5" 枪管与锻钢套筒随 .45 ACP（145 MPa）燃气反冲同步后坐 3 mm，待弹头离口膛压归零后单绞链绕横销后摆 53° 拉降枪尾 2.7 mm 脱锁，套筒独自完成 45.5 mm 抽抛壳循环。',
    flowNoteEn:
      'Slide and 5" dual-rib barrel recoil locked for 3 mm during .45 ACP (145 MPa) pressure blowdown before the 0.278" swinging link pivots 53 deg to drop the breech 2.7 mm and let the slide complete a 45.5 mm stroke.',
    chamberX: 0.25,
    muzzleX: 11.6,
    boreY: 2.55,
    gasPortX: null,
    gasChannelY: 2.55,
    gasChannelZ: 0,
    gasTargetX: -4.5,
    ventPos: null,
  },
  mg42: {
    weaponId: 'mg42',
    family: 'short_recoil_accelerator',
    hasGasTap: true,
    familyTitleZh: '锥形枪口助退 8.5mm 短后坐 · 对称双滚柱闭锁 + S 槽双级拨弹',
    familyTitleEn:
      'Muzzle-Boosted 8.5mm Short Recoil · Symmetric Twin-Roller Lock & S-Cam Feed',
    flowNoteZh:
      '7.92×57mm 390 MPa 高压燃气全部加速弹头至 755 m/s 后冲入枪口锥形助退器截气反冲枪管与节套同步短后坐 8.5 mm，随后机匣斜面挤回左右双滚柱加速 550g 机框飙出 1,200 RPM。',
    flowNoteEn:
      'Sealed 390 MPa pressure drives the 198gr spitzer into the conical muzzle recoil booster, trapping exit gas to kick the barrel and locked twin rollers back 8.5 mm before receiver ramps cam the rollers inward at 1,200 RPM.',
    chamberX: 20.2,
    muzzleX: 81.0,
    boreY: 1.5,
    gasPortX: 76.5,
    gasChannelY: 1.5,
    gasChannelZ: 0,
    gasTargetX: 44.5,
    ventPos: [81.0, 1.5, 0],
  },
  k98k: {
    weaponId: 'k98k',
    family: 'manual_bolt_action',
    hasGasTap: false,
    familyTitleZh:
      '手动 90° 旋转后拉栓动 · 前双主突笋+第三保险突笋 · 不旋转全长抓钩受控供弹',
    familyTitleEn:
      'Manual 90° Rotating Bolt · Dual Front + Rear Safety Lugs · Non-Rotating Claw Feed',
    flowNoteZh:
      '全闭膛无导气孔设计将 7.92×57mm 390 MPa 峰值膛压 100% 转化为 600mm 阶梯枪管推力（760 m/s）；射毕手抬弯拉机柄 90° 开锁并压缩击针主簧，不旋转大抓钩直拉 110 mm 强制抽壳。',
    flowNoteEn:
      'Sealed 600 mm stepped barrel converts 100% of 390 MPa 7.92x57mm pressure into 760 m/s muzzle velocity; a 90-deg bolt lift unlocks three lugs and cocks the striker while the non-rotating claw extracts 110 mm.',
    chamberX: 8.6,
    muzzleX: 66.2,
    boreY: 1.5,
    gasPortX: null,
    gasChannelY: 1.5,
    gasChannelZ: 0,
    gasTargetX: -0.2,
    ventPos: [66.2, 1.5, 0],
  },
  thompson: {
    weaponId: 'thompson',
    family: 'roller_delayed_blowback',
    hasGasTap: false,
    familyTitleZh: '45° 倾斜轨道青铜 H 型布利什粘附延迟半自由枪机 + 卡茨防跳',
    familyTitleEn:
      '45° Inclined Bronze Blish Adhesion-Delayed Blowback & Cutts Compensator',
    flowNoteZh:
      '145 MPa .45 ACP 亚音速重弹推压机头，青铜 H 型布利什块在高压期紧抵机匣 45° 钢槽产生瞬态摩擦阻滞，出膛后经卡茨四槽向上泄气压低枪口并沿 72° 枪机斜槽上滑开锁。',
    flowNoteEn:
      'Peak 145 MPa .45 ACP thrust seats the bronze Blish H-piece against 45° steel receiver tracks; as the 230gr slug exits the 4-slot upward-venting Cutts compensator, 72° bolt ramps cam the bronze lock upward.',
    chamberX: 12.5,
    muzzleX: 46.2,
    boreY: 1.6,
    gasPortX: null,
    gasChannelY: 2.75,
    gasChannelZ: 0,
    gasTargetX: 1.6,
    ventPos: [42.6, 2.75, 0],
  },
  gau8: {
    weaponId: 'gau8',
    family: 'electric_rotary_gatling',
    hasGasTap: false,
    familyTitleZh: '双 38.5 马力 3,000 PSI 液压外驱 · 七管 360° 螺旋凸轮与闭环弹鼓',
    familyTitleEn:
      'Twin 38.5-HP 3,000 PSI Hydraulic Drive · 7-Barrel 360° Helical Cam & Closed-Loop Drum',
    flowNoteZh:
      '无导气孔：由 A-10 双余度 3,000 PSI 机载液压马达直接提供 77 马力旋转扭矩；430 MPa 高压燃气全部用于将 395g 穿甲弹沿 2.3 米炮管加速至 1,010 m/s，空铝壳经右侧闭环通道 100% 返鼓。',
    flowNoteEn:
      'No gas tap: twin redundant 3,000 PSI aircraft hydraulic motors supply 77 HP directly to the rotor while 100% of 430 MPa propellant energy accelerates the 395g DU/tungsten core down the 2.3 m bore.',
    chamberX: 78.0,
    muzzleX: 320.0,
    boreY: 7.4,
    gasPortX: null,
    gasChannelY: 7.4,
    gasChannelZ: 0,
    gasTargetX: 30.0,
    ventPos: [320.0, 7.4, 0],
  },
  ...buildCentennialGasManifolds(),
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

    // H&K G11 K2 4.73×33mm Caseless Clockwork Bullpup (24 parts — gas-operated)
    g11_barrel: 'locking',
    g11_rotary_breech: 'locking',
    g11_inner_receiver: 'locking',
    g11_gas_piston: 'gas_drive',
    g11_driving_rod: 'gas_drive',
    g11_clockwork_gears: 'bolt_carrier',
    g11_loading_rammer: 'bolt_carrier',
    g11_winding_knob: 'bolt_carrier',
    g11_buffer_assembly: 'bolt_carrier',
    g11_firing_pin: 'fire_control',
    g11_trigger_pack: 'fire_control',
    g11_trigger: 'fire_control',
    g11_selector: 'fire_control',
    g11_recoil_spring: 'energy_spring',
    g11_mag_spring: 'energy_spring',
    g11_flash_hider: 'housing_feed',
    g11_outer_housing: 'housing_feed',
    g11_optic_handle: 'housing_feed',
    g11_pistol_grip: 'housing_feed',
    g11_buttplate: 'housing_feed',
    g11_spare_clips: 'housing_feed',
    g11_mag_tube: 'housing_feed',
    g11_mag_follower: 'housing_feed',
    g11_mag_endcap: 'housing_feed',

    // VSS Vintorez 9×39mm Integral Suppressed Sniper (24 parts — gas-operated)
    vss_barrel: 'locking',
    vss_bolt: 'locking',
    vss_baffle_stack: 'gas_drive',
    vss_bolt_carrier: 'bolt_carrier',
    vss_recoil_guide: 'bolt_carrier',
    vss_firing_pin: 'fire_control',
    vss_striker: 'fire_control',
    vss_trigger: 'fire_control',
    vss_sear: 'fire_control',
    vss_safety_lever: 'fire_control',
    vss_selector_switch: 'fire_control',
    vss_recoil_spring: 'energy_spring',
    vss_striker_spring: 'energy_spring',
    vss_mag_spring: 'energy_spring',
    vss_receiver: 'housing_feed',
    vss_dust_cover: 'housing_feed',
    vss_suppressor_tube: 'housing_feed',
    vss_rear_sight: 'housing_feed',
    vss_forend: 'housing_feed',
    vss_wood_stock: 'housing_feed',
    vss_pso1_scope: 'housing_feed',
    vss_mag_body: 'housing_feed',
    vss_mag_follower: 'housing_feed',
    vss_mag_floorplate: 'housing_feed',

    // GE M134D Minigun 7.62×51mm NATO (25 parts — 28V DC electric drive: 0 gas_drive!)
    m134_barrel_cluster: 'locking',
    m134_barrel_clamp: 'locking',
    m134_cam_track_ring: 'locking',
    m134_bolt_1: 'locking',
    m134_bolt_2: 'locking',
    m134_bolt_3: 'locking',
    m134_bolt_4: 'locking',
    m134_bolt_5: 'locking',
    m134_bolt_6: 'locking',
    m134_rotor_assembly: 'bolt_carrier',
    m134_drive_gear: 'bolt_carrier',
    m134_delinker_sprocket: 'bolt_carrier',
    m134_drive_motor: 'fire_control',
    m134_safing_sector: 'fire_control',
    m134_spade_grip: 'fire_control',
    m134_clutch_spring: 'energy_spring',
    m134_feeder_spring: 'energy_spring',
    m134_flash_suppressor: 'housing_feed',
    m134_main_housing: 'housing_feed',
    m134_gear_housing: 'housing_feed',
    m134_carry_handle: 'housing_feed',
    m134_mount_pintle: 'housing_feed',
    m134_delinker_housing: 'housing_feed',
    m134_ammo_chute: 'housing_feed',
    m134_ejection_chute: 'housing_feed',

    // Nikonov AN-94 "Abakan" 5.45×39mm Pulley-Cable Rifle (26 parts — gas-operated)
    an94_barrel: 'locking',
    an94_bolt: 'locking',
    an94_inner_receiver: 'locking',
    an94_gas_tube: 'gas_drive',
    an94_bolt_carrier: 'bolt_carrier',
    an94_pulley_wheel: 'bolt_carrier',
    an94_steel_cable: 'bolt_carrier',
    an94_feed_rammer: 'bolt_carrier',
    an94_recoil_guide: 'bolt_carrier',
    an94_firing_pin: 'fire_control',
    an94_hammer: 'fire_control',
    an94_trigger: 'fire_control',
    an94_safety_switch: 'fire_control',
    an94_fire_selector: 'fire_control',
    an94_recoil_spring: 'energy_spring',
    an94_receiver_buffer_spring: 'energy_spring',
    an94_mag_spring: 'energy_spring',
    an94_outer_housing: 'housing_feed',
    an94_dust_cover: 'housing_feed',
    an94_muzzle_brake: 'housing_feed',
    an94_buttstock: 'housing_feed',
    an94_pistol_grip: 'housing_feed',
    an94_rear_sight: 'housing_feed',
    an94_mag_body: 'housing_feed',
    an94_mag_follower: 'housing_feed',
    an94_mag_floorplate: 'housing_feed',

    // PLA ZTZ-99A Main Battle Tank (26 parts — powerpack/drivetrain mapped to gas_drive via ARMOR_ROLE_META)
    ztz99a_main_gun: 'locking',
    ztz99a_breech_block: 'locking',
    ztz99a_gun_cradle: 'locking',
    ztz99a_turret_ring: 'locking',
    ztz99a_v12_engine: 'gas_drive',
    ztz99a_transmission: 'gas_drive',
    ztz99a_recoil_cylinders: 'bolt_carrier',
    ztz99a_autoloader_carousel: 'bolt_carrier',
    ztz99a_loading_tray: 'bolt_carrier',
    ztz99a_rammer_chain: 'bolt_carrier',
    ztz99a_stub_ejector: 'bolt_carrier',
    ztz99a_optics_citv: 'fire_control',
    ztz99a_roof_armaments: 'fire_control',
    ztz99a_crew_stations: 'fire_control',
    ztz99a_recoil_springs: 'energy_spring',
    ztz99a_rammer_spring: 'energy_spring',
    ztz99a_torsion_bars: 'energy_spring',
    ztz99a_hull_armor: 'housing_feed',
    ztz99a_glacis_era: 'housing_feed',
    ztz99a_side_skirts: 'housing_feed',
    ztz99a_road_wheels: 'housing_feed',
    ztz99a_tracks_left: 'housing_feed',
    ztz99a_tracks_right: 'housing_feed',
    ztz99a_rear_deck: 'housing_feed',
    ztz99a_turret_shell: 'housing_feed',
    ztz99a_era_wedges: 'housing_feed',

    // M1A2 SEP v3 Abrams Main Battle Tank (26 parts)
    m1a2_main_gun: 'locking',
    m1a2_breech_block: 'locking',
    m1a2_gun_mantlet: 'locking',
    m1a2_turret_ring: 'locking',
    m1a2_agt1500_turbine: 'gas_drive',
    m1a2_x1100_transmission: 'gas_drive',
    m1a2_fuel_cells: 'gas_drive',
    m1a2_blast_doors: 'bolt_carrier',
    m1a2_ready_round: 'bolt_carrier',
    m1a2_stub_deflector: 'bolt_carrier',
    m1a2_crows_optics: 'fire_control',
    m1a2_smoke_launchers: 'fire_control',
    m1a2_crew_stations: 'fire_control',
    m1a2_recoil_springs: 'energy_spring',
    m1a2_door_spring: 'energy_spring',
    m1a2_torsion_bars: 'energy_spring',
    m1a2_hull_shell: 'housing_feed',
    m1a2_side_skirts: 'housing_feed',
    m1a2_road_wheels: 'housing_feed',
    m1a2_tracks_left: 'housing_feed',
    m1a2_tracks_right: 'housing_feed',
    m1a2_engine_deck: 'housing_feed',
    m1a2_turret_shell: 'housing_feed',
    m1a2_blowoff_panels: 'housing_feed',
    m1a2_composite_armor: 'housing_feed',
    m1a2_ammo_bustle: 'housing_feed',

    // KMW Leopard 2A7V Main Battle Tank (26 parts)
    leo_main_gun: 'locking',
    leo_breech_block: 'locking',
    leo_gun_mantlet: 'locking',
    leo_turret_ring: 'locking',
    leo_mtu_v12: 'gas_drive',
    leo_renk_transmission: 'gas_drive',
    leo_cooling_fans: 'gas_drive',
    leo_recoil_system: 'bolt_carrier',
    leo_blast_door: 'bolt_carrier',
    leo_ready_round: 'bolt_carrier',
    leo_optics_peri: 'fire_control',
    leo_smoke_dischargers: 'fire_control',
    leo_crew_stations: 'fire_control',
    leo_recoil_springs: 'energy_spring',
    leo_breech_spring: 'energy_spring',
    leo_torsion_bars: 'energy_spring',
    leo_hull_shell: 'housing_feed',
    leo_side_skirts: 'housing_feed',
    leo_road_wheels: 'housing_feed',
    leo_tracks_left: 'housing_feed',
    leo_tracks_right: 'housing_feed',
    leo_engine_deck: 'housing_feed',
    leo_turret_shell: 'housing_feed',
    leo_arrowhead_wedges: 'housing_feed',
    leo_ammo_bustle: 'housing_feed',
    leo_hull_ammo_rack: 'housing_feed',

    // Pz.Kpfw. VI Ausf. E "Tiger 131" Heavy Tank (26 parts)
    tiger_main_gun: 'locking',
    tiger_breech_block: 'locking',
    tiger_gun_mantlet: 'locking',
    tiger_turret_ring: 'locking',
    tiger_maybach_v12: 'gas_drive',
    tiger_transmission: 'gas_drive',
    tiger_driveshaft: 'gas_drive',
    tiger_fuel_tanks: 'gas_drive',
    tiger_recoil_cradle: 'bolt_carrier',
    tiger_shell_guard: 'bolt_carrier',
    tiger_ready_round: 'bolt_carrier',
    tiger_turret_basket: 'bolt_carrier',
    tiger_optics_tzf9b: 'fire_control',
    tiger_cupola_hatches: 'fire_control',
    tiger_crew_stations: 'fire_control',
    tiger_recoil_springs: 'energy_spring',
    tiger_breech_spring: 'energy_spring',
    tiger_torsion_bars: 'energy_spring',
    tiger_hull_box: 'housing_feed',
    tiger_side_fenders: 'housing_feed',
    tiger_interleaved_wheels: 'housing_feed',
    tiger_tracks_left: 'housing_feed',
    tiger_tracks_right: 'housing_feed',
    tiger_engine_deck: 'housing_feed',
    tiger_turret_shell: 'housing_feed',
    tiger_ammo_racks: 'housing_feed',

    // Winchester Model 1894 (24 parts)
    win94_barrel: 'locking',
    win94_breech_bolt: 'locking',
    win94_locking_bolt: 'locking',
    win94_lever: 'bolt_carrier',
    win94_link: 'bolt_carrier',
    win94_hammer: 'fire_control',
    win94_trigger: 'fire_control',
    win94_firing_pin: 'fire_control',
    win94_tang_safety: 'fire_control',
    win94_mainspring: 'energy_spring',
    win94_sear_spring: 'energy_spring',
    win94_mag_spring: 'energy_spring',
    win94_receiver: 'housing_feed',
    win94_front_sight: 'housing_feed',
    win94_rear_sight: 'housing_feed',
    win94_saddle_ring: 'housing_feed',
    win94_forend: 'housing_feed',
    win94_barrel_bands: 'housing_feed',
    win94_walnut_stock: 'housing_feed',
    win94_buttplate: 'housing_feed',
    win94_mag_tube: 'housing_feed',
    win94_mag_follower: 'housing_feed',
    win94_loading_gate: 'housing_feed',
    win94_carrier: 'housing_feed',

    // Remington Model 870 Police Magnum (24 parts)
    rem870_barrel: 'locking',
    rem870_breech_bolt: 'locking',
    rem870_locking_block: 'locking',
    rem870_forend: 'bolt_carrier',
    rem870_action_bars: 'bolt_carrier',
    rem870_slide_block: 'bolt_carrier',
    rem870_firing_pin: 'fire_control',
    rem870_trigger: 'fire_control',
    rem870_hammer: 'fire_control',
    rem870_action_release: 'fire_control',
    rem870_hammer_spring: 'energy_spring',
    rem870_firing_pin_spring: 'energy_spring',
    rem870_mag_spring: 'energy_spring',
    rem870_receiver: 'housing_feed',
    rem870_front_sight: 'housing_feed',
    rem870_rear_sight: 'housing_feed',
    rem870_walnut_stock: 'housing_feed',
    rem870_buttplate: 'housing_feed',
    rem870_stock_bolt: 'housing_feed',
    rem870_trigger_plate: 'housing_feed',
    rem870_mag_tube: 'housing_feed',
    rem870_mag_cap: 'housing_feed',
    rem870_mag_follower: 'housing_feed',
    rem870_shell_carrier: 'housing_feed',

    // Colt M1911A1 U.S. Army (24 parts)
    m1911_barrel: 'locking',
    m1911_barrel_link: 'locking',
    m1911_barrel_bushing: 'locking',
    m1911_slide: 'bolt_carrier',
    m1911_recoil_plug: 'bolt_carrier',
    m1911_recoil_guide: 'bolt_carrier',
    m1911_extractor: 'bolt_carrier',
    m1911_hammer: 'fire_control',
    m1911_trigger: 'fire_control',
    m1911_sear_disconnector: 'fire_control',
    m1911_grip_safety: 'fire_control',
    m1911_thumb_safety: 'fire_control',
    m1911_firing_pin: 'fire_control',
    m1911_recoil_spring: 'energy_spring',
    m1911_mainspring: 'energy_spring',
    m1911_mag_spring: 'energy_spring',
    m1911_leaf_spring: 'energy_spring',
    m1911_frame: 'housing_feed',
    m1911_slide_stop: 'housing_feed',
    m1911_mainspring_housing: 'housing_feed',
    m1911_grip_left: 'housing_feed',
    m1911_grip_right: 'housing_feed',
    m1911_mag_body: 'housing_feed',
    m1911_mag_follower: 'housing_feed',

    // MG 42 General-Purpose Machine Gun (25 parts)
    mg42_barrel: 'locking',
    mg42_bolt_head: 'locking',
    mg42_locking_rollers: 'locking',
    mg42_locking_roller_left: 'locking',
    mg42_locking_wedge: 'locking',
    mg42_muzzle_booster: 'gas_drive',
    mg42_barrel_latch: 'locking',
    mg42_bolt_carrier: 'bolt_carrier',
    mg42_charging_handle: 'bolt_carrier',
    mg42_recoil_buffer: 'bolt_carrier',
    mg42_feed_pawl: 'bolt_carrier',
    mg42_trigger: 'fire_control',
    mg42_sear: 'fire_control',
    mg42_recoil_spring: 'energy_spring',
    mg42_buffer_spring: 'energy_spring',
    mg42_sear_spring: 'energy_spring',
    mg42_receiver_shroud: 'housing_feed',
    mg42_top_cover: 'housing_feed',
    mg42_aa_sight: 'housing_feed',
    mg42_bipod: 'housing_feed',
    mg42_buttstock: 'housing_feed',
    mg42_grip_frame: 'housing_feed',
    mg42_feed_tray: 'housing_feed',
    mg42_ammo_belt: 'housing_feed',
    mg42_ammo_drum: 'housing_feed',

    // Mauser Karabiner 98k (24 parts)
    k98k_barrel: 'locking',
    k98k_bolt_body: 'locking',
    k98k_claw_extractor: 'bolt_carrier',
    k98k_bolt_shroud: 'bolt_carrier',
    k98k_flag_safety: 'fire_control',
    k98k_firing_pin: 'fire_control',
    k98k_trigger: 'fire_control',
    k98k_sear: 'fire_control',
    k98k_firing_pin_spring: 'energy_spring',
    k98k_sear_spring: 'energy_spring',
    k98k_mag_spring: 'energy_spring',
    k98k_receiver: 'housing_feed',
    k98k_stock: 'housing_feed',
    k98k_handguard: 'housing_feed',
    k98k_front_band: 'housing_feed',
    k98k_rear_band: 'housing_feed',
    k98k_cleaning_rod: 'housing_feed',
    k98k_buttplate: 'housing_feed',
    k98k_front_sight: 'housing_feed',
    k98k_rear_sight: 'housing_feed',
    k98k_trigger_guard: 'housing_feed',
    k98k_mag_follower: 'housing_feed',
    k98k_mag_floorplate: 'housing_feed',
    k98k_stripper_clip: 'housing_feed',

    // Thompson M1928A1 Submachine Gun (25 parts)
    thompson_barrel: 'locking',
    thompson_blish_lock: 'locking',
    thompson_cutts_comp: 'housing_feed',
    thompson_oiler: 'housing_feed',
    thompson_bolt: 'bolt_carrier',
    thompson_actuator: 'bolt_carrier',
    thompson_buffer_pilot: 'bolt_carrier',
    thompson_trigger: 'fire_control',
    thompson_sear: 'fire_control',
    thompson_selector_levers: 'fire_control',
    thompson_hammer_pin: 'fire_control',
    thompson_recoil_spring: 'energy_spring',
    thompson_sear_spring: 'energy_spring',
    thompson_drum_spring: 'energy_spring',
    thompson_receiver: 'housing_feed',
    thompson_lower_frame: 'housing_feed',
    thompson_lyman_sight: 'housing_feed',
    thompson_foregrip: 'housing_feed',
    thompson_pistol_grip: 'housing_feed',
    thompson_buttstock: 'housing_feed',
    thompson_buttplate: 'housing_feed',
    thompson_mag_catch: 'housing_feed',
    thompson_drum_mag: 'housing_feed',
    thompson_drum_rotor: 'housing_feed',
    thompson_drum_rounds: 'housing_feed',

    // GE GAU-8/A Avenger 30mm Autocannon (25 parts)
    gau8_barrel_cluster: 'locking',
    gau8_barrel_clamps: 'locking',
    gau8_muzzle_clamp: 'locking',
    gau8_cam_track: 'locking',
    gau8_hydraulic_motors: 'fire_control',
    gau8_recoil_buffers: 'bolt_carrier',
    gau8_rotor_core: 'bolt_carrier',
    gau8_bolt_1: 'bolt_carrier',
    gau8_bolt_2: 'bolt_carrier',
    gau8_bolt_3: 'bolt_carrier',
    gau8_bolt_4: 'bolt_carrier',
    gau8_bolt_5: 'bolt_carrier',
    gau8_bolt_6: 'bolt_carrier',
    gau8_bolt_7: 'bolt_carrier',
    gau8_transfer_unit: 'fire_control',
    gau8_recoil_springs: 'energy_spring',
    gau8_buffer_spring: 'energy_spring',
    gau8_striker_spring: 'energy_spring',
    gau8_gun_housing: 'housing_feed',
    gau8_recoil_mount: 'housing_feed',
    gau8_ammo_drum: 'housing_feed',
    gau8_drum_rotor: 'housing_feed',
    gau8_ammo_belt_stack: 'housing_feed',
    gau8_chute_feed: 'housing_feed',
    gau8_chute_return: 'housing_feed',
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
  weaponId: WeaponId,
  part: Pick<WeaponPartSpec, 'id' | 'group' | 'material' | 'isShell'>
): EngineeringRole {
  const explicit = EXPLICIT_PART_ROLE_OVERRIDES[part.id];
  if (explicit) return explicit;

  const prefix = `${weaponId}_`;
  const localId = part.id.startsWith(prefix)
    ? part.id.slice(prefix.length)
    : part.id;

  if (part.material === 'spring_steel' || /spring/.test(localId)) {
    return 'energy_spring';
  }

  if (part.group === 'magazine') {
    return 'housing_feed';
  }

  if (
    part.group === 'fire_control' ||
    /trigger|hammer|striker|sear|disconnector|selector|firing_pin|connector/.test(
      localId
    )
  ) {
    return 'fire_control';
  }

  if (
    /gas_block|gas_tube|gas_piston|gas_regulator/.test(localId) ||
    (localId === 'gas_system' &&
      (WEAPON_GAS_MANIFOLD_PROFILES[weaponId]?.hasGasTap ||
        isArcheryWeapon(weaponId) ||
        isTankWeapon(weaponId)))
  ) {
    return 'gas_drive';
  }

  if (
    /locking|accelerator|barrel_extension/.test(localId) ||
    localId === 'bolt' ||
    part.material === 'barrel_steel'
  ) {
    return 'locking';
  }

  if (
    !part.isShell &&
    /bolt_carrier|charging_handle|recoil_guide|recoil_rod|guide_rod/.test(
      localId
    )
  ) {
    return 'bolt_carrier';
  }

  return 'housing_feed';
}
