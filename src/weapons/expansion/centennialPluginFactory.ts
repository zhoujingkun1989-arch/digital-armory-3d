import {
  clamp01,
  findActiveFiringPhase,
  linearSeg,
  seg,
} from '../../engine/kinematics/math';
import type {
  ExtendedBallisticsState,
  FiringPhaseInfo,
  KeyframeStep,
  PartKinematicDelta,
  PbrBindingSpec,
  TimelinePresetItem,
  WeaponId,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';
import { CENTENNIAL_BLUEPRINT_MAP } from './centennialCatalog';
import {
  CENTENNIAL_PART_SLOTS,
  centennialPartId,
  computeCentennialPartLayout,
  type CentennialLayoutResult,
  type CentennialPartSlot,
  type Vec3Tuple,
} from './centennialLayoutMath';
import {
  isCentennialShellSlot,
  resolveCentennialGroupMetas,
  resolveCentennialPartMeta,
} from './centennialPartNomenclature';
import type {
  CentennialKinematicLaw,
  CentennialWeaponBlueprint,
  CentennialWeaponId,
} from './centennialTypes';

// ============================================================================
// Digital Armory 3D — Centennial Lazy Runtime Plugin & 22-Law Kinematic Engine
// ----------------------------------------------------------------------------
// Pure lazy chunk: imports ONLY `./centennialCatalog`, `./centennialLayoutMath`,
// `./centennialPartNomenclature`, `../../engine/kinematics/math`, and `import
// type` contracts (ZERO Three.js, React, store, or flagship weapon imports).
// Projects 1:1 `WeaponRuntimePlugin` instances for all 66 Centennial exhibits.
// ============================================================================

const TWO_PI = Math.PI * 2;
const IDENTITY_DELTA: PartKinematicDelta = {
  pos: [0, 0, 0],
  rot: [0, 0, 0],
  scaleX: 1,
};

const UPPER_CALLOUT_SLOTS: ReadonlySet<CentennialPartSlot> = new Set([
  'receiver',
  'barrel',
  'muzzle',
  'bolt_carrier',
  'bolt',
  'recoil_spring',
  'handguard',
  'optic',
  'gas_system',
  'mount_rail',
]);

const CALLOUT_STEM_BY_SLOT: Readonly<Record<CentennialPartSlot, number>> = {
  receiver: 34,
  barrel: 40,
  muzzle: 46,
  bolt_carrier: 38,
  bolt: 44,
  recoil_spring: 32,
  handguard: 36,
  stock: 34,
  grip: 36,
  optic: 48,
  gas_system: 42,
  mount_rail: 30,
  trigger: 34,
  hammer: 40,
  hammer_spring: 44,
  selector: 28,
  mag_body: 38,
  follower: 42,
  mag_spring: 46,
  mag_base: 50,
};

const LABEL_APPEAR_BY_SLOT: Readonly<Record<CentennialPartSlot, number>> = {
  receiver: 0.0,
  barrel: 0.0,
  muzzle: 0.0,
  bolt_carrier: 0.22,
  bolt: 0.26,
  recoil_spring: 0.26,
  handguard: 0.0,
  stock: 0.0,
  grip: 0.0,
  optic: 0.0,
  gas_system: 0.28,
  mount_rail: 0.12,
  trigger: 0.42,
  hammer: 0.46,
  hammer_spring: 0.5,
  selector: 0.36,
  mag_body: 0.0,
  follower: 0.44,
  mag_spring: 0.48,
  mag_base: 0.38,
};

const EXPLODE_STAGE_WINDOWS: Readonly<
  Record<
    CentennialPartSlot,
    { readonly r1: [number, number]; readonly r2: [number, number]; readonly w1: number }
  >
> = {
  // Stage 1: Field-strip ammunition & upper operating group
  mag_body: { r1: [0.06, 0.24], r2: [0.46, 0.78], w1: 0.55 },
  mag_base: { r1: [0.08, 0.26], r2: [0.44, 0.74], w1: 0.52 },
  mag_spring: { r1: [0.1, 0.28], r2: [0.5, 0.82], w1: 0.5 },
  follower: { r1: [0.12, 0.3], r2: [0.54, 0.86], w1: 0.5 },
  bolt_carrier: { r1: [0.12, 0.28], r2: [0.48, 0.82], w1: 0.55 },
  bolt: { r1: [0.14, 0.3], r2: [0.52, 0.86], w1: 0.52 },
  recoil_spring: { r1: [0.15, 0.3], r2: [0.54, 0.88], w1: 0.5 },
  optic: { r1: [0.1, 0.28], r2: [0.52, 0.84], w1: 0.58 },
  muzzle: { r1: [0.12, 0.29], r2: [0.56, 0.88], w1: 0.55 },
  // Stage 2: Sub-assembly exterior furniture & operating system
  handguard: { r1: [0.32, 0.6], r2: [0.66, 0.92], w1: 0.6 },
  gas_system: { r1: [0.34, 0.62], r2: [0.68, 0.94], w1: 0.58 },
  mount_rail: { r1: [0.33, 0.61], r2: [0.67, 0.93], w1: 0.58 },
  stock: { r1: [0.34, 0.62], r2: [0.68, 0.94], w1: 0.6 },
  grip: { r1: [0.36, 0.64], r2: [0.7, 0.94], w1: 0.58 },
  // Stage 3: Full exploded core receiver, barrel & fire-control internals
  receiver: { r1: [0.38, 0.64], r2: [0.7, 0.95], w1: 0.55 },
  barrel: { r1: [0.36, 0.64], r2: [0.7, 0.95], w1: 0.55 },
  trigger: { r1: [0.4, 0.66], r2: [0.72, 0.95], w1: 0.52 },
  hammer: { r1: [0.42, 0.68], r2: [0.74, 0.95], w1: 0.52 },
  hammer_spring: { r1: [0.44, 0.7], r2: [0.75, 0.95], w1: 0.5 },
  selector: { r1: [0.38, 0.64], r2: [0.7, 0.94], w1: 0.55 },
};

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function buildExplodeSteps(
  slot: CentennialPartSlot,
  totalOffset: Vec3Tuple
): KeyframeStep[] {
  const cfg = EXPLODE_STAGE_WINDOWS[slot];
  const w1 = cfg.w1;
  const o1x = round3(totalOffset[0] * w1);
  const o1y = round3(totalOffset[1] * w1);
  const o1z = round3(totalOffset[2] * w1);
  return [
    {
      range: [cfg.r1[0], cfg.r1[1]],
      offset: [o1x, o1y, o1z],
    },
    {
      range: [cfg.r2[0], cfg.r2[1]],
      offset: [
        round3(totalOffset[0] - o1x),
        round3(totalOffset[1] - o1y),
        round3(totalOffset[2] - o1z),
      ],
    },
  ];
}

function buildCalloutAnchor(
  slot: CentennialPartSlot,
  layout: CentennialLayoutResult
): Vec3Tuple {
  const dir = UPPER_CALLOUT_SLOTS.has(slot) ? 1 : -1;
  const scaleRef =
    layout.dims.armorScale > 0
      ? layout.dims.armorScale * 0.12
      : Math.max(layout.dims.receiverH * 0.32, 0.65);
  return [0, round3(dir * scaleRef), 0];
}

function buildTimelinePresets(
  bp: CentennialWeaponBlueprint
): readonly TimelinePresetItem[] {
  if (bp.category === 'armor') {
    return [
      {
        id: 'assembled',
        label: '战备合拢态',
        subLabel: '0%',
        t: 0,
        desc: `${bp.nameZh}（${bp.year}）1:1 真实尺度战备合拢态，全车 20 组核心装甲与火炮节点严密就位。`,
      },
      {
        id: 'field_strip',
        label: '一级勤务快拆',
        subLabel: '30%',
        t: 0.3,
        desc: '分离弹药补给与炮塔观瞄外设，露出火炮尾闩、复进筒与装填机构。',
      },
      {
        id: 'sub_assembly',
        label: '二级炮塔车体剖拆',
        subLabel: '65%',
        t: 0.65,
        desc: '吊离主炮塔与复合装甲裙板，展开底盘履带行动系与火控联锁机构。',
      },
      {
        id: 'full_exploded',
        label: '全车 20 节点爆炸图',
        subLabel: '100%',
        t: 1,
        desc: `完整立体展开 ${bp.overallLengthDisplayZh} 1:1 重型主战坦克 20 大工程装配体。`,
      },
    ];
  }

  if (bp.category === 'archery') {
    return [
      {
        id: 'assembled',
        label: '待射合拢态',
        subLabel: '0%',
        t: 0,
        desc: `${bp.nameZh}（${bp.year}）待射合拢态，全弓/弩 20 组弹性弓片、弓弦与撒放节点精确对准。`,
      },
      {
        id: 'field_strip',
        label: '一级配件快拆',
        subLabel: '30%',
        t: 0.3,
        desc: '卸下箭壶、瞄具与平衡杆，分离主弓弦与箭矢发射基准面。',
      },
      {
        id: 'sub_assembly',
        label: '二级弓片滑轮细拆',
        subLabel: '65%',
        t: 0.65,
        desc: '释放弓片弹性预载，展开偏心凸轮、分弦机构与精密撒放火控组。',
      },
      {
        id: 'full_exploded',
        label: '全器 20 节点爆炸图',
        subLabel: '100%',
        t: 1,
        desc: `立体展开 ${bp.overallLengthDisplayZh} 弓弩全套 20 大力学与人机工程部件。`,
      },
    ];
  }

  if (bp.category === 'ordnance') {
    return [
      {
        id: 'assembled',
        label: '战备合拢态',
        subLabel: '0%',
        t: 0,
        desc: `${bp.nameZh}（${bp.year}）1:1 重型火炮战备合拢态，20 组身管、反后坐与供输弹机构严密对接。`,
      },
      {
        id: 'field_strip',
        label: '一级机务/炮班快拆',
        subLabel: '30%',
        t: 0.3,
        desc: '分离供弹机构、炮口装置与观瞄组件，敞开炮尾闭锁与复进缓冲总成。',
      },
      {
        id: 'sub_assembly',
        label: '二级炮闩摇架细拆',
        subLabel: '65%',
        t: 0.65,
        desc: '抽离身管与反后坐摇架，立体呈现炮闩机构、动力驱动与电控/拉火击发系。',
      },
      {
        id: 'full_exploded',
        label: '全炮 20 节点爆炸图',
        subLabel: '100%',
        t: 1,
        desc: `完整展开 ${bp.overallLengthDisplayZh} 重型火炮 20 大承力与自动循环装配体。`,
      },
    ];
  }

  return [
    {
      id: 'assembled',
      label: '合拢态',
      subLabel: '0%',
      t: 0,
      desc: `${bp.nameZh}（${bp.year}）全枪战备合拢态，20 组核心机械零件按 1:1 比例精密闭锁就位。`,
    },
    {
      id: 'field_strip',
      label: '野战一级快拆',
      subLabel: '30%',
      t: 0.3,
      desc: '遵循标准军械勤务教范：卸下供弹组件并取出枪机框、枪机与复进簧总成。',
    },
    {
      id: 'sub_assembly',
      label: '二级组件细拆',
      subLabel: '65%',
      t: 0.65,
      desc: '展开护木、导气/延迟机构与枪托组件，暴露内部闭锁与扳机火控联动面。',
    },
    {
      id: 'full_exploded',
      label: '全枪 20 节点爆炸图',
      subLabel: '100%',
      t: 1,
      desc: `完整立体展开 ${bp.overallLengthDisplayZh} 全部 20 个承力、运动、火控与供弹零件。`,
    },
  ];
}

function buildFiringPhases(bp: CentennialWeaponBlueprint): FiringPhaseInfo[] {
  if (bp.category === 'archery') {
    return [
      {
        id: 'phase_1',
        stepNum: '01',
        shortLabel: '拉弦蓄能',
        title: `阶段 1 · ${bp.shortLabel} 拉弦储能与搭箭`,
        description: `向后牵引主弓弦，将人力机械功转化为 ${bp.nameZh} 弹性弓片的高密度应变势能。`,
        range: [0.0, 0.14],
      },
      {
        id: 'phase_2',
        stepNum: '02',
        shortLabel: '满弓锚定',
        title: `阶段 2 · 峰值拉力与满弓靠位`,
        description: `弓片弯曲达最大势能并进入省力/待发锚定位，确保 ${bp.caliberLabel} 箭矢与发射轴线共线。`,
        range: [0.14, 0.24],
      },
      {
        id: 'phase_3',
        stepNum: '03',
        shortLabel: '击发撒放',
        title: `阶段 3 · 撒放器/阻铁干脆解脱`,
        description: '扣动扳机或释放弦钩，无侧向扭矩地瞬时解脱绷紧弓弦，启动前推做功冲程。',
        range: [0.24, 0.36],
      },
      {
        id: 'phase_4',
        stepNum: '04',
        shortLabel: '弓片回弹',
        title: `阶段 4 · 弓片迅猛回弹与箭体加速`,
        description: `弓片与凸轮在毫秒级内释放储能，沿 ${bp.barrelLengthMm} mm 加速行程将箭矢推向 ${bp.muzzleVelocityMs} m/s。`,
        range: [0.36, 0.5],
      },
      {
        id: 'phase_5',
        stepNum: '05',
        shortLabel: '离弦飞出',
        title: `阶段 5 · 离弦出弓与箭羽自旋稳定`,
        description: `箭矢携带 ${bp.muzzleEnergyJ} J 动能脱离箭台，螺旋尾羽切入气流建立飞行稳定。`,
        range: [0.5, 0.68],
      },
      {
        id: 'phase_6',
        stepNum: '06',
        shortLabel: '弦阻减震',
        title: `阶段 6 · 弓档止弦与余振衰减`,
        description: '止弦柱与阻尼稳定杆吸收残余弹性震荡，迅速回归静默低噪状态。',
        range: [0.68, 0.86],
      },
      {
        id: 'phase_7',
        stepNum: '07',
        shortLabel: '复位搭箭',
        title: `阶段 7 · 机构复位与下一箭预备`,
        description: `撒放机构复位并自箭壶取箭备发，做好 ${bp.effectiveRangeM} m 射程内的下一次精准发射准备。`,
        range: [0.86, 1.0],
      },
    ];
  }

  if (bp.category === 'armor') {
    return [
      {
        id: 'phase_1',
        stepNum: '01',
        shortLabel: '火控击发',
        title: `阶段 1 · ${bp.shortLabel} 电控击发与底火引燃`,
        description: `火控解算闭环通电触发炮闩电底火，在密闭 ${bp.caliberLabel} 药室内引燃发射药。`,
        range: [0.0, 0.14],
      },
      {
        id: 'phase_2',
        stepNum: '02',
        shortLabel: '膛压峰值',
        title: `阶段 2 · ${bp.peakPressureMpa} MPa 膛压爆发`,
        description: `高压发射药燃气瞬间攀升至 ${bp.peakPressureMpa} MPa，由重型楔式/螺式炮闩严密封闭炮尾。`,
        range: [0.14, 0.24],
      },
      {
        id: 'phase_3',
        stepNum: '03',
        shortLabel: '膛内加速',
        title: `阶段 3 · ${bp.barrelLengthMm} mm 主炮身管加速`,
        description: `炽热燃气驱动弹丸沿 ${bp.barrelLengthMm} mm 主炮膛线/滑膛身管加速至 ${bp.muzzleVelocityMs} m/s。`,
        range: [0.24, 0.36],
      },
      {
        id: 'phase_4',
        stepNum: '04',
        shortLabel: '炮口出膛',
        title: `阶段 4 · 炮口脱壳飞出与抽烟排障`,
        description: `弹丸离膛飞向 ${bp.effectiveRangeM} m 装甲目标，炮管抽烟装置形成压差向前吹扫有毒膛气。`,
        range: [0.36, 0.5],
      },
      {
        id: 'phase_5',
        stepNum: '05',
        shortLabel: '液气后坐',
        title: `阶段 5 · 主炮长行程液气制退后坐`,
        description: `驻退机与复进机协同吸收 ${bp.recoilImpulseNs} N·s 巨额冲量，驱动身管与炮尾平稳后坐逾 300 mm。`,
        range: [0.5, 0.68],
      },
      {
        id: 'phase_6',
        stepNum: '06',
        shortLabel: '开闩退底',
        title: `阶段 6 · 复进开闩与药筒底托抛出`,
        description: '身管复进末段自动撞开炮闩，半可燃药筒金属底托被抽壳板抛出落入收集筐。',
        range: [0.68, 0.86],
      },
      {
        id: 'phase_7',
        stepNum: '07',
        shortLabel: '输弹闭锁',
        title: `阶段 7 · 装填进膛与闭锁待发`,
        description: `${bp.kinematicLaw === 'tank_carousel' ? '底置转盘自动装弹机' : '装填手与隔爆尾舱'}完成下一发弹药推膛并自动关闩闭锁。`,
        range: [0.86, 1.0],
      },
    ];
  }

  if (bp.category === 'ordnance') {
    const isRotary = bp.kinematicLaw === 'rotary_gatling';
    return [
      {
        id: 'phase_1',
        stepNum: '01',
        shortLabel: isRotary ? '液压起旋' : '击发点火',
        title: isRotary
          ? `阶段 1 · ${bp.shortLabel} 液压马达驱动六管星轮起旋`
          : `阶段 1 · ${bp.shortLabel} 击发机构释放与底火点燃`,
        description: isRotary
          ? '外置液压马达驱动 6 根 20mm 炮管与中心星形转子高速旋回，凸轮炮闩依次推弹入膛。'
          : `击发拉火机构释放击针撞击 ${bp.caliberLabel} 底火，点燃重型发射药柱。`,
        range: [0.0, 0.14],
      },
      {
        id: 'phase_2',
        stepNum: '02',
        shortLabel: '膛压峰值',
        title: `阶段 2 · ${bp.peakPressureMpa} MPa 峰值膛压建立`,
        description: `高温高压火药燃气达 ${bp.peakPressureMpa} MPa，闭锁炮闩刚性承受轴向反作用力。`,
        range: [0.14, 0.24],
      },
      {
        id: 'phase_3',
        stepNum: '03',
        shortLabel: '身管加速',
        title: `阶段 3 · ${bp.barrelLengthMm} mm 线膛加速`,
        description: `弹丸嵌入膛线高速自旋，加速至 ${bp.muzzleVelocityMs} m/s（动能 ${bp.muzzleEnergyJ} J）。`,
        range: [0.24, 0.36],
      },
      {
        id: 'phase_4',
        stepNum: '04',
        shortLabel: '出膛制退',
        title: `阶段 4 · 炮口离膛与制退分流`,
        description: `弹丸高速飞出炮口射向 ${bp.effectiveRangeM} m 目标，炮口箍/制退器削减后坐冲击与跳动。`,
        range: [0.36, 0.5],
      },
      {
        id: 'phase_5',
        stepNum: '05',
        shortLabel: isRotary ? '凸轮开锁' : '后坐缓冲',
        title: isRotary
          ? '阶段 5 · 360° 螺旋凸轮轨道强制开锁抽壳'
          : '阶段 5 · 反后坐装置长行程吸能后坐',
        description: isRotary
          ? '炮闩滚轮驶入 360° 凸轮下降段，同步旋转解锁并向后抽出空弹壳。'
          : `驻退复进机平稳吸收 ${bp.recoilImpulseNs} N·s 后坐冲量并将载荷传导至炮架驻锄。`,
        range: [0.5, 0.68],
      },
      {
        id: 'phase_6',
        stepNum: '06',
        shortLabel: isRotary ? '无链退壳' : '开闩退壳',
        title: isRotary
          ? '阶段 6 · 闭环无链退壳交接与换管冷却'
          : '阶段 6 · 炮闩开启与空药筒抛出',
        description: isRotary
          ? '空弹壳经星轮交接回送螺旋弹鼓，击发后炮管进入非击发弧段强迫空冷。'
          : '身管复进驱动炮闩下降/侧摆开启，抽壳钩利落抛出已发射药筒。',
        range: [0.68, 0.86],
      },
      {
        id: 'phase_7',
        stepNum: '07',
        shortLabel: '供弹闭锁',
        title: `阶段 7 · 下一发供输与 ${bp.rateOfFireLabelZh} 循环闭环`,
        description: `完成新一轮供弹推膛与闭锁待发，保持 ${bp.rateOfFireLabelZh} 持续火力输出。`,
        range: [0.86, 1.0],
      },
    ];
  }

  return [
    {
      id: 'phase_1',
      stepNum: '01',
      shortLabel: '扣扳击发',
      title: `阶段 1 · ${bp.shortLabel} 扳机阻铁解脱与击发驱动`,
      description: `扣压扳机解脱阻铁，击锤/击针或开膛枪机在簧力驱动下向前冲击 ${bp.caliberLabel} 底火。`,
      range: [0.0, 0.14],
    },
    {
      id: 'phase_2',
      stepNum: '02',
      shortLabel: '底火燃爆',
      title: `阶段 2 · ${bp.peakPressureMpa} MPa 膛压峰值建立`,
      description: `发射药在闭锁弹膛内急剧燃烧，膛压飙升至 ${bp.peakPressureMpa} MPa 并胀紧弹壳实现气密。`,
      range: [0.14, 0.24],
    },
    {
      id: 'phase_3',
      stepNum: '03',
      shortLabel: '膛内加速',
      title: `阶段 3 · ${bp.barrelLengthMm} mm 枪管加速出膛`,
      description: `弹头切入膛线并加速至 ${bp.muzzleVelocityMs} m/s，炮口动能达 ${bp.muzzleEnergyJ} J。`,
      range: [0.24, 0.36],
    },
    {
      id: 'phase_4',
      stepNum: '04',
      shortLabel: '开锁后坐',
      title: `阶段 4 · ${bp.actionMechanismZh.split('·')[0].trim()}解锁`,
      description: `膛压回落至安全阈值后，自动机或手动机构完成开锁并启动后坐行程。`,
      range: [0.36, 0.5],
    },
    {
      id: 'phase_5',
      stepNum: '05',
      shortLabel: '抽壳抛壳',
      title: '阶段 5 · 空弹壳抽出、抛壳与复进簧压缩',
      description: '抓壳钩拉出空弹壳撞击抛壳挺翻滚飞出抛壳窗，同时压紧复进簧储存回程能量。',
      range: [0.5, 0.68],
    },
    {
      id: 'phase_6',
      stepNum: '06',
      shortLabel: '推弹闭锁',
      title: `阶段 6 · 托弹进膛与闭锁复进`,
      description: `复进簧释放势能推动枪机前冲，从 ${bp.magCapacity} 发供弹机构推入下一发实弹并刚性闭锁。`,
      range: [0.68, 0.86],
    },
    {
      id: 'phase_7',
      stepNum: '07',
      shortLabel: '火控复位',
      title: '阶段 7 · 阻铁交接与下一循环待发',
      description: `单发阻铁交接回主阻铁复位，全枪恢复闭锁待击状态（${bp.rateOfFireLabelZh}）。`,
      range: [0.86, 1.0],
    },
  ];
}

// ============================================================================
// 22-Law Mechanism-Specific Kinematic Evaluator
// ============================================================================

interface KinematicContext {
  readonly bp: CentennialWeaponBlueprint;
  readonly layout: CentennialLayoutResult;
  readonly slotByPartId: ReadonlyMap<string, CentennialPartSlot>;
  readonly stroke: number;
  readonly cannonRecoil: number;
  readonly springLen: number;
  readonly isGasOperated: boolean;
}

function createKinematicContext(
  bp: CentennialWeaponBlueprint,
  layout: CentennialLayoutResult
): KinematicContext {
  const slotByPartId = new Map<string, CentennialPartSlot>();
  for (const slot of CENTENNIAL_PART_SLOTS) {
    slotByPartId.set(centennialPartId(bp.id, slot), slot);
  }

  const isPistol =
    bp.archetype === 'pistol_slide' ||
    bp.archetype === 'pistol_broomhandle' ||
    bp.archetype === 'revolver_sa' ||
    bp.archetype === 'revolver_da';
  const isHeavyMg = bp.archetype === 'heavy_mg';
  const isMbt = bp.category === 'armor';
  const isArtillery =
    bp.kinematicLaw === 'aa_sliding_wedge' ||
    bp.kinematicLaw === 'artillery_howitzer';

  const stroke = isMbt
    ? Math.max(24, Math.min(36, layout.dims.boltLen * 0.65))
    : isArtillery
      ? Math.max(22, Math.min(32, layout.dims.boltLen * 0.72))
      : isHeavyMg
        ? 9.4
        : isPistol
          ? Math.max(3.0, Math.min(4.6, layout.dims.boltLen * 0.42))
          : Math.max(5.4, Math.min(8.6, layout.dims.boltLen * 0.56));

  const cannonRecoil = isMbt
    ? Math.max(26, Math.min(36, layout.dims.barrelLen * 0.058))
    : isArtillery
      ? Math.max(24, Math.min(35, layout.dims.barrelLen * 0.075))
      : 0;

  const isGasOperated =
    bp.kinematicLaw === 'long_stroke_piston' ||
    bp.kinematicLaw === 'direct_impingement' ||
    bp.kinematicLaw === 'short_stroke_piston' ||
    bp.kinematicLaw === 'tilting_bolt';

  return {
    bp,
    layout,
    slotByPartId,
    stroke,
    cannonRecoil,
    springLen: Math.max(2.4, layout.dims.springLen),
    isGasOperated,
  };
}

function evaluateKinematicsForLaw(
  ctx: KinematicContext,
  slot: CentennialPartSlot,
  f: number
): PartKinematicDelta {
  const { bp, stroke, cannonRecoil, springLen } = ctx;
  const law: CentennialKinematicLaw = bp.kinematicLaw;

  let dx = 0;
  let dy = 0;
  let dz = 0;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let scaleX = 1;

  // Common trigger & magazine-follower timing curves
  const trigPull = seg(f, 0.0, 0.11) - seg(f, 0.86, 0.96);
  const feedPulse = seg(f, 0.52, 0.65) - seg(f, 0.68, 0.84);
  const magSpringCycle = seg(f, 0.48, 0.66) - seg(f, 0.7, 0.88);
  const hammerStrike = seg(f, 0.07, 0.15);
  const hammerRecock = seg(f, 0.32, 0.46);
  const hammerReset = seg(f, 0.86, 0.96);

  switch (law) {
    // ------------------------------------------------------------------------
    // 1. Gas-Operated & Delayed Rotating / Tilting / Blowback Repeating Arms
    // ------------------------------------------------------------------------
    case 'long_stroke_piston':
    case 'direct_impingement':
    case 'short_stroke_piston':
    case 'roller_delayed':
    case 'lever_delayed':
    case 'tilting_bolt':
    case 'closed_bolt_blowback': {
      const delayedSlow =
        law === 'roller_delayed' || law === 'lever_delayed'
          ? seg(f, 0.23, 0.34) * 0.18 + seg(f, 0.34, 0.54) * 0.82
          : seg(f, 0.27, 0.52);
      const carrierCycle = delayedSlow - seg(f, 0.58, 0.84);
      const boltTravel = seg(f, 0.32, 0.52) - seg(f, 0.58, 0.8);
      const unlockAnglePulse = seg(f, 0.28, 0.36) - seg(f, 0.78, 0.85);
      const isRotatingBolt =
        law === 'long_stroke_piston' ||
        law === 'direct_impingement' ||
        law === 'short_stroke_piston';

      switch (slot) {
        case 'bolt_carrier':
          dx = -stroke * carrierCycle;
          break;
        case 'bolt':
          dx = -stroke * (isRotatingBolt ? 0.92 : 0.88) * boltTravel;
          if (isRotatingBolt) {
            rx = -0.62 * unlockAnglePulse; // ~35.5° coaxial lug rotation
          } else if (law === 'tilting_bolt') {
            dy = -0.28 * unlockAnglePulse;
            rz = -0.14 * unlockAnglePulse;
          } else if (law === 'roller_delayed') {
            dz = 0.08 * Math.sin(linearSeg(f, 0.25, 0.38) * Math.PI);
          } else if (law === 'lever_delayed') {
            rz = -0.18 * Math.sin(linearSeg(f, 0.24, 0.4) * Math.PI);
          }
          break;
        case 'gas_system':
          if (law === 'long_stroke_piston') {
            dx = -stroke * 0.92 * carrierCycle;
          } else if (law === 'short_stroke_piston' || law === 'tilting_bolt') {
            const tap = seg(f, 0.24, 0.33) - seg(f, 0.34, 0.46);
            dx = -stroke * 0.28 * tap;
          }
          break;
        case 'recoil_spring': {
          scaleX = 1 - 0.44 * carrierCycle;
          dx = -0.5 * springLen * (1 - scaleX);
          break;
        }
        case 'trigger':
          rz = -0.26 * trigPull;
          break;
        case 'hammer':
          rz = -1.45 * hammerStrike + 1.5 * hammerRecock - 0.05 * hammerReset;
          break;
        case 'hammer_spring': {
          const load = seg(f, 0.06, 0.16) - seg(f, 0.34, 0.5);
          scaleX = 1 - 0.36 * clamp01(load);
          break;
        }
        case 'follower':
          dy = 0.55 * feedPulse;
          break;
        case 'mag_spring':
          scaleX = 1 - 0.32 * magSpringCycle;
          break;
        default:
          break;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 2. Open-Bolt Blowback SMGs & Auto Shotguns (Uzi, MP40, PPSh-41, Sten, AA-12)
    // ------------------------------------------------------------------------
    case 'open_bolt_blowback': {
      // Bolt begins retracted at sear (-stroke), slams forward [0.02..0.16], blows back [0.25..0.56]
      const slamForward = seg(f, 0.02, 0.16);
      const blowback = seg(f, 0.25, 0.56);
      const retract01 = clamp01(1 - slamForward + blowback);

      switch (slot) {
        case 'bolt_carrier':
        case 'bolt':
          dx = -stroke * retract01;
          break;
        case 'recoil_spring':
          scaleX = 1 - 0.44 * retract01;
          dx = -0.5 * springLen * (1 - scaleX);
          break;
        case 'trigger':
          rz = -0.28 * trigPull;
          break;
        case 'hammer':
          // Open-bolt sear bar dips cleanly on trigger pull & re-engages on blowback
          dy = -0.32 * trigPull;
          rz = -0.22 * trigPull;
          break;
        case 'hammer_spring':
          scaleX = 1 - 0.34 * trigPull;
          break;
        case 'follower':
          dy = 0.52 * feedPulse;
          break;
        case 'mag_spring':
          scaleX = 1 - 0.3 * magSpringCycle;
          break;
        default:
          break;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 3. Browning Short-Recoil Tilt-Barrel Pistols & M2HB Heavy Machine Gun
    // ------------------------------------------------------------------------
    case 'browning_tilt_barrel': {
      const slideCycle = seg(f, 0.23, 0.52) - seg(f, 0.58, 0.84);
      const barrelShortRecoil = seg(f, 0.23, 0.35) - seg(f, 0.7, 0.84);
      const isHeavyMg = bp.archetype === 'heavy_mg';

      switch (slot) {
        case 'bolt_carrier':
          dx = -stroke * slideCycle;
          break;
        case 'bolt':
          dx = -stroke * (isHeavyMg ? 0.96 : 0.88) * slideCycle;
          if (!isHeavyMg) {
            dy = -0.18 * barrelShortRecoil;
          }
          break;
        case 'barrel':
          dx = -stroke * (isHeavyMg ? 0.28 : 0.24) * barrelShortRecoil;
          if (!isHeavyMg) {
            dy = -0.32 * barrelShortRecoil;
            rz = 0.085 * barrelShortRecoil; // Authentic Browning tilt-barrel cam pitch
          }
          break;
        case 'muzzle':
          dx = -stroke * (isHeavyMg ? 0.28 : 0.24) * barrelShortRecoil;
          if (!isHeavyMg) {
            dy = -0.22 * barrelShortRecoil;
            rz = 0.085 * barrelShortRecoil;
          }
          break;
        case 'recoil_spring':
          scaleX = 1 - 0.45 * slideCycle;
          dx = -0.5 * springLen * (1 - scaleX);
          break;
        case 'trigger':
          rz = -0.25 * trigPull;
          break;
        case 'hammer':
          rz = -1.35 * hammerStrike + 1.4 * hammerRecock - 0.05 * hammerReset;
          break;
        case 'hammer_spring':
          scaleX = 1 - 0.36 * clamp01(seg(f, 0.06, 0.16) - seg(f, 0.34, 0.5));
          break;
        case 'follower':
          dy = 0.48 * feedPulse;
          break;
        case 'mag_spring':
          scaleX = 1 - 0.3 * magSpringCycle;
          break;
        default:
          break;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 4. Falling-Block Short-Recoil Pistols (Beretta 92, Mauser C96)
    // ------------------------------------------------------------------------
    case 'falling_block_pistol': {
      const slideCycle = seg(f, 0.23, 0.52) - seg(f, 0.58, 0.84);
      const barrelRecoil = seg(f, 0.23, 0.34) - seg(f, 0.7, 0.84);
      const blockDrop = seg(f, 0.26, 0.35) - seg(f, 0.72, 0.82);

      switch (slot) {
        case 'bolt_carrier':
          dx = -stroke * slideCycle;
          break;
        case 'barrel':
        case 'muzzle':
          // Straight-line non-tilting barrel short recoil (zero tilt!)
          dx = -stroke * 0.24 * barrelRecoil;
          break;
        case 'bolt':
          // Falling locking block drops cleanly out of slide recesses
          dx = -stroke * 0.24 * barrelRecoil;
          dy = -0.45 * blockDrop;
          break;
        case 'recoil_spring':
          scaleX = 1 - 0.44 * slideCycle;
          dx = -0.5 * springLen * (1 - scaleX);
          break;
        case 'trigger':
          rz = -0.25 * trigPull;
          break;
        case 'hammer':
          rz = -1.42 * hammerStrike + 1.46 * hammerRecock - 0.04 * hammerReset;
          break;
        case 'hammer_spring':
          scaleX = 1 - 0.36 * clamp01(seg(f, 0.06, 0.16) - seg(f, 0.34, 0.5));
          break;
        case 'follower':
          dy = 0.46 * feedPulse;
          break;
        case 'mag_spring':
          scaleX = 1 - 0.3 * magSpringCycle;
          break;
        default:
          break;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 5. Turn-Bolt Precision Rifles (Mosin, Lee-Enfield, M24, M200, M1903)
    // ------------------------------------------------------------------------
    case 'bolt_action': {
      const liftRad = bp.id === 'leeenfield' ? Math.PI / 3 : Math.PI / 2;
      const boltLift = seg(f, 0.36, 0.46) - seg(f, 0.82, 0.92);
      const boltPull = seg(f, 0.46, 0.64) - seg(f, 0.66, 0.82);
      const strikerDrop = seg(f, 0.09, 0.16) - seg(f, 0.36, 0.46);

      switch (slot) {
        case 'bolt_carrier':
          dx = -stroke * boltPull;
          rx = liftRad * boltLift;
          break;
        case 'bolt':
          dx = -stroke * boltPull;
          rx = liftRad * boltLift;
          break;
        case 'recoil_spring':
          // Firing-pin / striker mainspring releases on fire and re-cocks on bolt lift
          scaleX = 1 - 0.42 * clamp01(1 - strikerDrop * 0.95);
          dx = -0.5 * springLen * (1 - scaleX);
          break;
        case 'trigger':
          rz = -0.24 * trigPull;
          break;
        case 'hammer':
          // Cocking piece snaps forward on fire and cams back during bolt lift
          dx = 0.65 * strikerDrop - stroke * boltPull;
          break;
        case 'hammer_spring':
          scaleX = 1 - 0.34 * trigPull;
          break;
        case 'follower':
          dy = 0.58 * (seg(f, 0.54, 0.68) - seg(f, 0.72, 0.86));
          break;
        case 'mag_spring':
          scaleX = 1 - 0.34 * (seg(f, 0.52, 0.68) - seg(f, 0.72, 0.88));
          break;
        default:
          break;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 6. Pump-Action Shotguns (Mossberg 500, KS-23)
    // ------------------------------------------------------------------------
    case 'pump_action': {
      const pumpCycle = seg(f, 0.36, 0.6) - seg(f, 0.65, 0.88);
      const lockDrop = seg(f, 0.36, 0.44) - seg(f, 0.8, 0.88);

      switch (slot) {
        case 'handguard':
        case 'gas_system':
        case 'bolt_carrier':
          dx = -stroke * pumpCycle;
          break;
        case 'bolt':
          dx = -stroke * 0.95 * pumpCycle;
          dy = -0.26 * lockDrop;
          break;
        case 'recoil_spring':
          scaleX = 1 - 0.4 * pumpCycle;
          dx = -0.5 * springLen * (1 - scaleX);
          break;
        case 'trigger':
          rz = -0.25 * trigPull;
          break;
        case 'hammer':
          rz = -1.35 * hammerStrike + 1.4 * seg(f, 0.42, 0.58) - 0.05 * hammerReset;
          break;
        case 'hammer_spring':
          scaleX = 1 - 0.36 * clamp01(seg(f, 0.06, 0.16) - seg(f, 0.42, 0.6));
          break;
        case 'follower':
          // Tubular magazine follower shifts rearward along tube during shell lift
          dx = -1.6 * feedPulse;
          break;
        case 'mag_spring':
          scaleX = 1 - 0.34 * magSpringCycle;
          break;
        default:
          break;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 7. Lever-Action Shotguns (Winchester 1887)
    // ------------------------------------------------------------------------
    case 'lever_action': {
      const leverSwing = seg(f, 0.36, 0.6) - seg(f, 0.65, 0.88);

      switch (slot) {
        case 'selector':
          // Iconic curved finger lever swings downward ~42°
          rz = 0.74 * leverSwing;
          break;
        case 'bolt_carrier':
          dx = -stroke * 0.65 * leverSwing;
          dy = -0.45 * leverSwing;
          break;
        case 'bolt':
          // Rolling-block breech rotates & drops clear of chamber
          rz = -0.62 * leverSwing;
          dy = -0.52 * leverSwing;
          break;
        case 'recoil_spring':
          scaleX = 1 - 0.38 * leverSwing;
          dx = -0.5 * springLen * (1 - scaleX);
          break;
        case 'trigger':
          rz = -0.24 * trigPull;
          break;
        case 'hammer':
          rz = -1.4 * hammerStrike + 1.45 * seg(f, 0.4, 0.58) - 0.05 * hammerReset;
          break;
        case 'hammer_spring':
          scaleX = 1 - 0.36 * clamp01(seg(f, 0.06, 0.16) - seg(f, 0.4, 0.58));
          break;
        case 'follower':
          dx = -1.4 * feedPulse;
          break;
        case 'mag_spring':
          scaleX = 1 - 0.32 * magSpringCycle;
          break;
        default:
          break;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 8. Single- & Double-Action Revolvers (Colt SAA 1873, S&W 500)
    // ------------------------------------------------------------------------
    case 'revolver_cylinder': {
      // Crisp 60° (6-shot SAA) / 72° (5-shot S&W 500) cylinder indexing rotation
      const indexAngle = TWO_PI / Math.max(5, Math.min(6, bp.magCapacity));
      const indexTurn = seg(f, 0.02, 0.14);
      const cockHammer = seg(f, 0.01, 0.13);
      const dropHammer = seg(f, 0.14, 0.2);
      const reboundHammer = seg(f, 0.25, 0.36);

      switch (slot) {
        case 'bolt':
          // Rotating fluted cylinder indexes cleanly by 60° / 72°
          rx = indexAngle * indexTurn;
          break;
        case 'bolt_carrier':
          // Indexing hand pawl lifts during cylinder advance
          dy = 0.52 * (seg(f, 0.02, 0.13) - seg(f, 0.16, 0.28));
          break;
        case 'hammer':
          rz = 0.72 * cockHammer - 0.88 * dropHammer + 0.16 * reboundHammer;
          break;
        case 'trigger':
          rz = -0.28 * (seg(f, 0.02, 0.15) - seg(f, 0.78, 0.92));
          break;
        case 'recoil_spring':
          // Cylinder bolt / hand spring compresses during indexing & lockup
          scaleX = 1 - 0.38 * (seg(f, 0.02, 0.15) - seg(f, 0.55, 0.76));
          dx = -0.5 * springLen * (1 - scaleX);
          break;
        case 'hammer_spring':
          // Mainspring compresses cleanly at full cock, relaxes cleanly on fall
          scaleX = 1 - 0.42 * clamp01(cockHammer - dropHammer);
          break;
        case 'follower':
          // Star extractor rod micro-settle pulse
          dx = -0.22 * (seg(f, 0.56, 0.68) - seg(f, 0.72, 0.84));
          break;
        case 'mag_spring':
          scaleX = 1 - 0.32 * (seg(f, 0.54, 0.68) - seg(f, 0.72, 0.86));
          break;
        default:
          break;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 9. Archery Systems (Hoyt RX-8, Excalibur Crossbow, English Longbow)
    // ------------------------------------------------------------------------
    case 'compound_bow':
    case 'recurve_crossbow':
    case 'self_longbow': {
      // Full draw [0.02..0.34] -> anchor hold [0.34..0.42] -> rapid power-stroke release [0.42..0.52]
      const draw = seg(f, 0.02, 0.34) - seg(f, 0.42, 0.52);
      const postOsc =
        f >= 0.52 && f <= 0.74
          ? Math.sin(linearSeg(f, 0.52, 0.74) * Math.PI * 3) *
            (1 - linearSeg(f, 0.52, 0.74)) *
            0.05
          : 0;
      const launchTravel = seg(f, 0.42, 0.56) - seg(f, 0.76, 0.92);

      switch (slot) {
        case 'barrel':
          // GPU `SPRING_AXIS_MODE_FLEX` limbs flex rearward when scaleX > 1.0
          scaleX = 1 + 0.78 * draw + postOsc;
          break;
        case 'bolt_carrier':
          // GPU `SPRING_AXIS_MODE_FLEX` bowstring pulls rearward when scaleX > 1.0
          scaleX = 1 + 0.92 * draw - postOsc;
          break;
        case 'muzzle':
          // Eccentric compound cams roll smoothly during draw & unwind
          if (law === 'compound_bow') {
            rz = 1.95 * draw;
          }
          break;
        case 'bolt': {
          const drawBack = Math.max(8, ctx.layout.dims.specialSpan * 0.16);
          dx = -drawBack * draw + drawBack * 0.65 * launchTravel;
          break;
        }
        case 'recoil_spring':
          scaleX = 1 - 0.36 * draw;
          dx = -0.5 * springLen * (1 - scaleX);
          break;
        case 'trigger':
          rz = -0.24 * (seg(f, 0.36, 0.43) - seg(f, 0.8, 0.92));
          break;
        case 'hammer':
          rz = -0.68 * (seg(f, 0.41, 0.46) - seg(f, 0.76, 0.88));
          break;
        case 'hammer_spring':
          scaleX = 1 - 0.38 * (seg(f, 0.2, 0.42) - seg(f, 0.43, 0.56));
          break;
        case 'mag_spring':
          scaleX = 1 - 0.3 * (seg(f, 0.68, 0.8) - seg(f, 0.84, 0.95));
          break;
        case 'follower':
          dy = 0.45 * (seg(f, 0.68, 0.8) - seg(f, 0.84, 0.95));
          break;
        default:
          break;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 10. 1:1 Main Battle Tanks & Heavy Sliding-Wedge / Howitzer Artillery
    // ------------------------------------------------------------------------
    case 'tank_carousel':
    case 'tank_manual':
    case 'aa_sliding_wedge':
    case 'artillery_howitzer': {
      // Heavy gun recoil > 20 cm during [0.24..0.44], hydraulic runout [0.46..0.72]
      const recoilPulse = seg(f, 0.24, 0.44) - seg(f, 0.46, 0.72);
      const breechOpen = seg(f, 0.54, 0.66) - seg(f, 0.78, 0.9);
      const ramCycle = seg(f, 0.64, 0.78) - seg(f, 0.82, 0.94);

      switch (slot) {
        case 'barrel':
        case 'muzzle':
          dx = -cannonRecoil * recoilPulse;
          break;
        case 'bolt':
          // Heavy sliding-wedge or interrupted-screw breech recoils with tube & opens for reload
          dx = -cannonRecoil * recoilPulse;
          dy = -(law === 'aa_sliding_wedge' ? 6.5 : 12.0) * breechOpen;
          if (law === 'artillery_howitzer') {
            ry = 1.15 * breechOpen;
          }
          break;
        case 'recoil_spring':
          // Heavy recuperator spring bank compresses in lockstep with barrel recoil
          scaleX = 1 - 0.44 * recoilPulse;
          dx = -0.5 * springLen * (1 - scaleX);
          break;
        case 'trigger':
          rz = -0.22 * trigPull;
          break;
        case 'hammer':
          dx = 2.4 * (seg(f, 0.08, 0.16) - seg(f, 0.22, 0.34));
          break;
        case 'hammer_spring':
          scaleX = 1 - 0.36 * (seg(f, 0.08, 0.22) - seg(f, 0.36, 0.54));
          break;
        case 'follower':
          // Carousel rammer / ammunition tray advances fresh round into open breech
          dx = (law === 'aa_sliding_wedge' ? 0 : 18.0) * ramCycle;
          dy = (law === 'aa_sliding_wedge' ? -7.5 : 8.5) * ramCycle;
          break;
        case 'mag_spring':
          scaleX = 1 - 0.34 * ramCycle;
          break;
        default:
          break;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 11. 6-Barrel Rotary Gatling Autocannon (M61A1 Vulcan)
    // ------------------------------------------------------------------------
    case 'rotary_gatling': {
      const spinAngle = TWO_PI * f;
      const camRecip = 0.5 * (1 - Math.cos(spinAngle));
      const feederPulse = 0.5 * (1 - Math.cos(spinAngle * 2));

      switch (slot) {
        case 'barrel':
        case 'muzzle':
        case 'bolt_carrier':
          // Full continuous 360° (2π) rotary cluster & star-rotor spin
          rx = spinAngle;
          break;
        case 'bolt':
          // Cam-driven bolt reciprocates sinusoidally while spinning with rotor
          rx = spinAngle;
          dx = -stroke * camRecip;
          break;
        case 'recoil_spring':
          scaleX = 1 - 0.4 * camRecip;
          dx = -0.5 * springLen * (1 - scaleX);
          break;
        case 'trigger':
          rz = -0.22 * trigPull;
          break;
        case 'hammer':
          dx = 1.4 * camRecip;
          break;
        case 'hammer_spring':
          scaleX = 1 - 0.36 * camRecip;
          break;
        case 'follower':
          rx = spinAngle;
          break;
        case 'mag_spring':
          scaleX = 1 - 0.32 * feederPulse;
          break;
        default:
          break;
      }
      break;
    }

    default: {
      const _exhaustive: never = law;
      void _exhaustive;
    }
  }

  return {
    pos: [dx, dy, dz],
    rot: [rx, ry, rz],
    scaleX,
  };
}

// ============================================================================
// Ballistics State Synthesizer (1:1 Aligned to Layout Muzzle & Chamber Anchors)
// ============================================================================

function computeBallisticsForBlueprint(
  ctx: KinematicContext,
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const { bp, layout, stroke, isGasOperated } = ctx;
  const [chX, chY, chZ] = layout.chamberGlowPos;
  const [mzX, mzY] = layout.muzzlePos;
  const [magX, magY, magZ] = layout.assembledPos.mag_body;
  const [gasX, gasY, gasZ] = layout.assembledPos.gas_system;

  // Archery: silent elastic arrow / crossbow bolt launch (zero powder flash or spent brass)
  if (bp.category === 'archery') {
    const draw = seg(f, 0.02, 0.34) - seg(f, 0.42, 0.52);
    const drawAmp = Math.max(10, layout.dims.specialSpan * 0.18);
    const bulletVisible = f < 0.78;
    let bulletX = chX - drawAmp * draw;
    let streakLength = 0;

    if (f >= 0.42 && f < 0.78) {
      const u = linearSeg(f, 0.42, 0.78);
      const launchStart = chX - drawAmp * (1 - seg(0.42, 0.42, 0.52));
      bulletX = launchStart + (mzX - launchStart + 72) * Math.pow(u, 1.15);
      streakLength = 6.5 * Math.sin(u * Math.PI);
    }

    const renock = seg(f, 0.66, 0.9);
    const nextX = magX + (chX - magX) * renock;
    const nextY = magY + (chY - magY) * renock;
    const nextZ = magZ + (chZ - magZ) * renock;

    return {
      bulletVisible,
      bulletPos: [bulletX, chY, chZ],
      streakLength,
      spentCaseVisible: false,
      spentCasePos: [chX, chY, chZ],
      spentCaseRot: [0, 0, 0],
      spentCaseOpacity: 0,
      chamberFlashIntensity: 0,
      gasPortFlashIntensity: 0,
      gasPortPos: [chX, chY, chZ],
      muzzlePlumeScale: 0.01,
      muzzlePlumeOpacity: 0,
      nextRoundPos: [nextX, nextY, nextZ],
      nextRoundRotZ: (1 - renock) * 0.35,
      reserveRoundPos: [magX, magY - 2.2, magZ],
    };
  }

  // Firearms, 1:1 MBTs & Heavy Ordnance
  const isHeavyScale = bp.category === 'armor' || bp.category === 'ordnance';
  const barrelSpan = Math.max(6, mzX - chX);
  const downrangeFlight = isHeavyScale ? Math.max(180, barrelSpan * 0.85) : 48;

  // 1. Projectile travel (chamber -> muzzle -> supersonic downrange)
  const bulletVisible = f < 0.48;
  let bulletX = chX;
  let streakLength = 0;
  if (f >= 0.19 && f < 0.31) {
    const u = Math.pow(linearSeg(f, 0.19, 0.31), 1.45);
    bulletX = chX + barrelSpan * u;
    streakLength = (isHeavyScale ? 18 : 4.2) * u;
  } else if (f >= 0.31 && f < 0.48) {
    const u = linearSeg(f, 0.31, 0.48);
    bulletX = mzX + downrangeFlight * u;
    streakLength = (isHeavyScale ? 42 : 9.6) * (1 - u * 0.45);
  }

  // 2. Spent cartridge case / stub extraction & tumbling ejection
  const retainsBrass = bp.kinematicLaw === 'revolver_cylinder';
  const spentCaseVisible = !retainsBrass && f < 0.78;
  let caseX = chX;
  let caseY = chY;
  let caseZ = chZ;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = retainsBrass ? 0 : 1;

  if (!retainsBrass) {
    const ejectScale = isHeavyScale ? 3.2 : 1.0;
    if (f >= 0.36 && f < 0.52) {
      const ext = seg(f, 0.36, 0.52);
      caseX = chX - stroke * 0.85 * ext;
    } else if (f >= 0.52 && f < 0.78) {
      const u = linearSeg(f, 0.52, 0.78);
      const originX = chX - stroke * 0.85;
      caseX = originX + 3.0 * ejectScale * u;
      caseY = chY + (8.2 * u - 10.2 * u * u) * ejectScale;
      caseZ = chZ + 12.0 * ejectScale * u;
      caseRX = u * 9.2;
      caseRY = -u * 13.4;
      caseRZ = -u * 10.8;
      if (f > 0.65) {
        spentCaseOpacity = 1 - linearSeg(f, 0.65, 0.78);
      }
    }
  }

  // 3. Chamber flash, gas-port flash, and muzzle blast plume
  const chamberFlashIntensity =
    f >= 0.18 && f <= 0.28
      ? Math.sin(linearSeg(f, 0.18, 0.28) * Math.PI)
      : 0;

  const gasPortFlashIntensity =
    isGasOperated && f >= 0.26 && f <= 0.35
      ? Math.sin(linearSeg(f, 0.26, 0.35) * Math.PI)
      : 0;

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.295 && f <= 0.4) {
    const u = linearSeg(f, 0.295, 0.4);
    const plumeGain = isHeavyScale ? 2.8 : 1.0;
    muzzlePlumeScale = (0.45 + 1.55 * Math.pow(u, 0.55)) * plumeGain;
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.86;
  }

  // 4. Next-round stripping & reserve cartridge rise from feed group into chamber
  const stripU = seg(f, 0.56, 0.84);
  const feedArc = Math.sin(stripU * Math.PI) * (isHeavyScale ? 4.5 : 0.35);
  const nextStartX = magX + (chX - magX) * 0.35;
  const nextStartY = magY + (chY - magY) * 0.55;
  const nextX = nextStartX + (chX - nextStartX) * stripU;
  const nextY = nextStartY + (chY - nextStartY) * stripU + feedArc;
  const nextRZ = 0.18 * (1 - stripU);

  const reserveShift = seg(f, 0.54, 0.76);
  const reserveBaseY = magY + (chY - magY) * 0.25;
  const resX = magX + (nextStartX - magX) * reserveShift;
  const resY = reserveBaseY + (nextStartY - reserveBaseY) * reserveShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, mzY, chZ],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [gasX, gasY, gasZ],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, magZ],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, magZ],
  };
}

// ============================================================================
// Shared 13-Material Centennial 1024×1024 5-Ch ORM PBR Binding Resolver
// ----------------------------------------------------------------------------
// Deterministically binds every single one of the 66 × 20 = 1,320 Centennial
// parts to one of the 13 seamless museum PBR material suites (`centennial_mat_*`,
// pooled under `ownerWeapon = 'shared'` in `pbrManager.ts` for zero VRAM churn).
// ============================================================================

export const CENTENNIAL_SHARED_MATERIAL_SUITES = [
  'oiled_walnut',
  'russian_laminate',
  'beech_yew',
  'blued_steel',
  'parkerized_steel',
  'anodized_alloy',
  'brushed_stainless',
  'tactical_polymer',
  'checkered_grip',
  'cast_rha_armor',
  'carc_olive',
  'carc_desert',
  'cartridge_brass',
] as const;

export type CentennialMaterialSuiteId =
  (typeof CENTENNIAL_SHARED_MATERIAL_SUITES)[number];

const CENTENNIAL_SUITE_NORMAL_SCALE: Readonly<
  Record<CentennialMaterialSuiteId, number>
> = {
  oiled_walnut: 0.66,
  russian_laminate: 0.64,
  beech_yew: 0.6,
  blued_steel: 0.48,
  parkerized_steel: 0.58,
  anodized_alloy: 0.5,
  brushed_stainless: 0.44,
  tactical_polymer: 0.52,
  checkered_grip: 0.76,
  cast_rha_armor: 0.72,
  carc_olive: 0.62,
  carc_desert: 0.66,
  cartridge_brass: 0.44,
};

const RUSSIAN_LAMINATE_IDS: ReadonlySet<CentennialWeaponId> = new Set([
  'ak47',
  'pkm',
  'rpk74',
  'svd',
  'ppsh41',
  'dp28',
  'mosin',
  'sks',
  'ks23',
]);

const POLYMER_BODY_IDS: ReadonlySet<CentennialWeaponId> = new Set([
  'g36c',
  'qbz95',
  'tavor',
  'famas',
  'mp7',
  'ump45',
  'scorpion',
  'aa12',
]);

const POLYMER_MAG_IDS: ReadonlySet<CentennialWeaponId> = new Set([
  'ak74m',
  'hk416',
  'qbz95',
  'tavor',
  'g36c',
  'sig550',
  'mp7',
  'ump45',
  'scorpion',
  'bizon',
  'aa12',
  'saiga12',
  'fiveseven',
]);

const ANODIZED_RECEIVER_IDS: ReadonlySet<CentennialWeaponId> = new Set([
  'm16a1',
  'hk416',
  'sr25',
  'xm7',
  'wa2000',
  'm200',
  'mk14ebr',
  'mossberg500',
]);

const ANODIZED_HANDGUARD_IDS: ReadonlySet<CentennialWeaponId> = new Set([
  'hk416',
  'sr25',
  'xm7',
  'm200',
  'mk14ebr',
]);

const BLUED_CLASSIC_IDS: ReadonlySet<CentennialWeaponId> = new Set([
  'ak47',
  'fnfal',
  'sks',
  'pkm',
  'bar1918',
  'dp28',
  'mp40',
  'ppsh41',
  'svd',
  'mosin',
  'leeenfield',
  'springfield1903',
  'winchester1887',
  'ks23',
  'cz75',
  'ppk',
  'c96',
  'tt33',
  'saa1873',
]);

const BRIGHT_CARRIER_IDS: ReadonlySet<CentennialWeaponId> = new Set([
  'ak47',
  'sks',
  'm16a1',
  'svd',
  'mosin',
  'leeenfield',
  'springfield1903',
  'ppsh41',
  'bar1918',
  'winchester1887',
  'c96',
  'm14',
]);

const ALUMINUM_MAG_IDS: ReadonlySet<CentennialWeaponId> = new Set([
  'm16a1',
  'sr25',
  'xm7',
]);

/**
 * Resolves the authentic museum PBR material suite from the 13 shared
 * `centennial_mat_*` suites for any of the 66 Centennial exhibits × 20 slots.
 */
export function resolveCentennialPartMaterialSuite(
  bp: CentennialWeaponBlueprint,
  slot: CentennialPartSlot
): CentennialMaterialSuiteId {
  // 1. 1:1 Main Battle Tanks (`t90m`, `challenger2`, `merkava4`, `t34_85`)
  if (bp.category === 'armor') {
    const hullArmor: CentennialMaterialSuiteId =
      bp.id === 't34_85'
        ? 'cast_rha_armor'
        : bp.id === 'merkava4'
          ? 'carc_desert'
          : 'carc_olive';

    switch (slot) {
      case 'receiver':
      case 'bolt_carrier':
      case 'handguard':
      case 'stock':
      case 'grip':
      case 'mount_rail':
        return hullArmor;
      case 'gas_system':
        return 'cast_rha_armor';
      case 'barrel':
      case 'muzzle':
      case 'trigger':
      case 'hammer':
      case 'mag_body':
      case 'mag_base':
        return 'parkerized_steel';
      case 'optic':
        return 'anodized_alloy';
      case 'bolt':
      case 'recoil_spring':
      case 'hammer_spring':
      case 'mag_spring':
        return 'brushed_stainless';
      case 'follower':
      case 'selector':
        return 'cartridge_brass';
    }
  }

  // 2. 1:1 Heavy Ordnance (`m61vulcan`, `bofors40`, `m777`)
  if (bp.category === 'ordnance') {
    const primaryChassis: CentennialMaterialSuiteId =
      bp.id === 'bofors40' ? 'cast_rha_armor' : 'anodized_alloy';

    switch (slot) {
      case 'receiver':
      case 'handguard':
      case 'stock':
      case 'mount_rail':
      case 'optic':
        return primaryChassis;
      case 'bolt_carrier':
        return bp.id === 'm61vulcan' ? 'anodized_alloy' : 'parkerized_steel';
      case 'grip':
        return bp.id === 'm61vulcan' ? 'parkerized_steel' : 'checkered_grip';
      case 'barrel':
      case 'muzzle':
      case 'trigger':
      case 'gas_system':
      case 'mag_body':
      case 'mag_base':
        return 'parkerized_steel';
      case 'bolt':
      case 'recoil_spring':
      case 'hammer':
      case 'hammer_spring':
      case 'mag_spring':
        return 'brushed_stainless';
      case 'follower':
      case 'selector':
        return 'cartridge_brass';
    }
  }

  // 3. Archery (`englishlongbow`, `hoytrx8`, `excalibur`)
  if (bp.category === 'archery') {
    if (bp.archetype === 'bow_longbow') {
      switch (slot) {
        case 'receiver':
        case 'barrel':
        case 'bolt':
        case 'stock':
        case 'handguard':
        case 'muzzle':
        case 'selector':
          return 'beech_yew';
        case 'grip':
          return 'checkered_grip';
        case 'mag_body':
        case 'mag_base':
        case 'optic':
        case 'mount_rail':
        case 'follower':
        case 'trigger':
          return 'oiled_walnut';
        case 'bolt_carrier':
        case 'recoil_spring':
        case 'gas_system':
        case 'hammer':
        case 'hammer_spring':
        case 'mag_spring':
          return 'tactical_polymer';
      }
    }

    // Modern compound bow & recurve crossbow (`hoytrx8`, `excalibur`)
    switch (slot) {
      case 'receiver':
      case 'barrel':
      case 'stock':
      case 'handguard':
      case 'mag_body':
      case 'mag_base':
        return 'tactical_polymer';
      case 'grip':
        return 'checkered_grip';
      case 'muzzle':
      case 'selector':
      case 'optic':
      case 'mount_rail':
        return 'anodized_alloy';
      case 'follower':
        return 'cartridge_brass';
      default:
        return 'brushed_stainless';
    }
  }

  // 4. Revolvers (`saa1873`, `sw500`)
  if (bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da') {
    const isStainlessRev = bp.finishPalette === 'stainless';
    switch (slot) {
      case 'grip':
        return isStainlessRev ? 'checkered_grip' : 'oiled_walnut';
      case 'follower':
      case 'selector':
        return 'cartridge_brass';
      case 'optic':
      case 'mount_rail':
        return isStainlessRev ? 'anodized_alloy' : 'blued_steel';
      case 'bolt':
      case 'bolt_carrier':
      case 'trigger':
      case 'hammer':
      case 'gas_system':
      case 'recoil_spring':
      case 'hammer_spring':
      case 'mag_spring':
        return 'brushed_stainless';
      default:
        return isStainlessRev ? 'brushed_stainless' : 'blued_steel';
    }
  }

  // 5. Semi-Auto & Broomhandle Pistols
  if (
    bp.archetype === 'pistol_slide' ||
    bp.archetype === 'pistol_broomhandle'
  ) {
    const isPolymerFrame = bp.id === 'usp45' || bp.id === 'fiveseven';
    const isAlloyFrame = bp.id === 'beretta92' || bp.id === 'p226';
    const isBluedSlide =
      bp.id === 'beretta92' ||
      bp.id === 'cz75' ||
      bp.id === 'ppk' ||
      bp.id === 'c96' ||
      bp.id === 'tt33';

    switch (slot) {
      case 'grip':
        if (bp.id === 'c96') return 'oiled_walnut';
        if (bp.id === 'ppk') return 'beech_yew';
        return 'checkered_grip';
      case 'receiver':
      case 'stock':
      case 'handguard':
      case 'mount_rail':
        if (isPolymerFrame) return 'tactical_polymer';
        if (isAlloyFrame) return 'anodized_alloy';
        return 'blued_steel';
      case 'bolt_carrier':
      case 'barrel':
      case 'muzzle':
      case 'optic':
      case 'trigger':
        return isBluedSlide ? 'blued_steel' : 'parkerized_steel';
      case 'mag_body':
        return bp.id === 'fiveseven'
          ? 'tactical_polymer'
          : isBluedSlide
            ? 'blued_steel'
            : 'parkerized_steel';
      case 'mag_base':
        return isPolymerFrame ? 'tactical_polymer' : 'parkerized_steel';
      case 'follower':
      case 'selector':
        return 'cartridge_brass';
      case 'bolt':
      case 'recoil_spring':
      case 'hammer':
      case 'hammer_spring':
      case 'mag_spring':
      case 'gas_system':
        return 'brushed_stainless';
    }
  }

  // 6. Standard Small Arms (Rifles, LMGs, SMGs, Snipers, Shotguns)
  const woodSuite: CentennialMaterialSuiteId | null =
    bp.id === 'stg44'
      ? 'beech_yew'
      : RUSSIAN_LAMINATE_IDS.has(bp.id)
        ? 'russian_laminate'
        : bp.cad.hasWoodFurniture
          ? 'oiled_walnut'
          : null;

  const isPolymerBody = POLYMER_BODY_IDS.has(bp.id);
  const isAnodizedRec = ANODIZED_RECEIVER_IDS.has(bp.id);
  const primarySteel: CentennialMaterialSuiteId =
    bp.finishPalette === 'stainless'
      ? 'brushed_stainless'
      : BLUED_CLASSIC_IDS.has(bp.id)
        ? 'blued_steel'
        : 'parkerized_steel';

  switch (slot) {
    case 'receiver':
      if (isPolymerBody) return 'tactical_polymer';
      if (isAnodizedRec) return 'anodized_alloy';
      return primarySteel;

    case 'barrel':
    case 'muzzle':
      if (bp.id === 'aa12') return 'brushed_stainless';
      return primarySteel;

    case 'bolt_carrier':
      return BRIGHT_CARRIER_IDS.has(bp.id)
        ? 'brushed_stainless'
        : primarySteel;

    case 'bolt':
    case 'recoil_spring':
    case 'hammer':
    case 'hammer_spring':
    case 'mag_spring':
    case 'gas_system':
      return 'brushed_stainless';

    case 'handguard':
      if (bp.id === 'ppsh41' || bp.id === 'dp28' || bp.id === 'mp40') {
        return 'blued_steel';
      }
      if (
        bp.id === 'spas12' ||
        bp.id === 'pkm' ||
        bp.id === 'm240b' ||
        bp.id === 'm60e4' ||
        bp.id === 'stg44' ||
        bp.id === 'sten' ||
        bp.id === 'm2hb' ||
        bp.id === 'mac10'
      ) {
        return 'parkerized_steel';
      }
      if (
        bp.id === 'ak47' ||
        bp.id === 'svd' ||
        bp.id === 'sks' ||
        bp.id === 'mosin' ||
        bp.id === 'ks23'
      ) {
        return 'russian_laminate';
      }
      if (bp.cad.hasWoodFurniture && woodSuite) return woodSuite;
      if (ANODIZED_HANDGUARD_IDS.has(bp.id)) return 'anodized_alloy';
      return 'tactical_polymer';

    case 'stock':
      if (bp.id === 'spas12') return 'parkerized_steel';
      if (woodSuite && (bp.cad.hasWoodFurniture || bp.id === 'pkm' || bp.id === 'rpk74')) {
        return woodSuite;
      }
      if (bp.id === 'm2hb' || bp.id === 'sten' || bp.id === 'mac10' || bp.id === 'mp40') {
        return primarySteel;
      }
      if (bp.id === 'm200' || bp.id === 'mk14ebr') return 'anodized_alloy';
      return 'tactical_polymer';

    case 'grip':
      if (bp.id === 'winchester1887') return 'blued_steel';
      if (bp.id === 'm2hb') return 'oiled_walnut';
      if (bp.id === 'sten') return 'parkerized_steel';
      if (
        bp.id === 'ppsh41' ||
        bp.id === 'mosin' ||
        bp.id === 'sks' ||
        bp.id === 'dp28' ||
        bp.id === 'svd' ||
        bp.id === 'ks23' ||
        bp.id === 'ak47'
      ) {
        return 'russian_laminate';
      }
      if (bp.id === 'stg44') return 'beech_yew';
      if (
        bp.cad.hasWoodFurniture &&
        (bp.id === 'm14' ||
          bp.id === 'bar1918' ||
          bp.id === 'leeenfield' ||
          bp.id === 'springfield1903' ||
          bp.id === 'wa2000')
      ) {
        return 'oiled_walnut';
      }
      return 'checkered_grip';

    case 'optic':
      return bp.cad.hasOptic ? 'anodized_alloy' : primarySteel;

    case 'mount_rail':
      if (bp.id === 'hk416' || bp.id === 'sr25' || bp.id === 'xm7' || bp.id === 'm200' || bp.id === 'mk14ebr') {
        return 'anodized_alloy';
      }
      return primarySteel;

    case 'trigger':
      return primarySteel;

    case 'selector':
    case 'follower':
      return 'cartridge_brass';

    case 'mag_body':
      if (POLYMER_MAG_IDS.has(bp.id)) return 'tactical_polymer';
      if (ALUMINUM_MAG_IDS.has(bp.id)) return 'anodized_alloy';
      return primarySteel;

    case 'mag_base':
      if (POLYMER_MAG_IDS.has(bp.id)) return 'tactical_polymer';
      return primarySteel;
  }
}

/** Builds a `PbrBindingSpec` pointing to the shared 1024×1024 museum suite. */
export function resolveCentennialPartPbrBinding(
  bp: CentennialWeaponBlueprint,
  slot: CentennialPartSlot
): PbrBindingSpec {
  const suite = resolveCentennialPartMaterialSuite(bp, slot);
  return {
    albedoFile: `centennial_mat_${suite}_albedo.webp`,
    normalFile: `centennial_mat_${suite}_normal.webp`,
    roughnessFile: `centennial_mat_${suite}_roughness.webp`,
    normalScale: CENTENNIAL_SUITE_NORMAL_SCALE[suite],
    repeat: 1,
  };
}

// ============================================================================
// Public Factory API
// ============================================================================

const BUILT_PLUGIN_CACHE = new Map<CentennialWeaponId, WeaponRuntimePlugin>();

/** Builds a complete 20-part `WeaponRuntimePlugin` for any Centennial blueprint. */
export function buildCentennialPluginForBlueprint(
  bp: CentennialWeaponBlueprint
): WeaponRuntimePlugin {
  const layout = computeCentennialPartLayout(bp);
  const ctx = createKinematicContext(bp, layout);

  const pbrBindings: Record<string, PbrBindingSpec> = {};
  const parts: WeaponPartSpec[] = CENTENNIAL_PART_SLOTS.map((slot) => {
    const partId = centennialPartId(bp.id, slot);
    const meta = resolveCentennialPartMeta(bp, slot);
    const assembled = layout.assembledPos[slot];
    const explodeOffset = layout.explodeOffset[slot];
    pbrBindings[partId] = resolveCentennialPartPbrBinding(bp, slot);
    return {
      id: partId,
      bomCode: meta.bomCode,
      nameZh: meta.nameZh,
      calloutLabel: meta.calloutLabelZh,
      nameEn: meta.nameEn,
      group: meta.group,
      material: meta.material,
      isShell: isCentennialShellSlot(bp, slot),
      assembledPos: [assembled[0], assembled[1], assembled[2]],
      explodeSteps: buildExplodeSteps(slot, explodeOffset),
      calloutDir: UPPER_CALLOUT_SLOTS.has(slot) ? 'up' : 'down',
      calloutStem: CALLOUT_STEM_BY_SLOT[slot],
      calloutAnchor: buildCalloutAnchor(slot, layout),
      labelAppearAt: LABEL_APPEAR_BY_SLOT[slot],
      roleTag: meta.roleTagZh,
      description: meta.descZh,
    };
  });

  const partGroups = resolveCentennialGroupMetas(bp);
  const timelinePresets = buildTimelinePresets(bp);
  const firingPhases = buildFiringPhases(bp);

  return {
    id: bp.id as unknown as WeaponId,
    partGroups,
    timelinePresets,
    parts,
    firingPhases,
    getActiveFiringPhase: (f: number) => findActiveFiringPhase(firingPhases, f),
    computeFiringKinematics: (partId: string, fRaw: number) => {
      const slot = ctx.slotByPartId.get(partId);
      if (!slot) return IDENTITY_DELTA;
      return evaluateKinematicsForLaw(ctx, slot, clamp01(fRaw));
    },
    computeBallisticsState: (fRaw: number) =>
      computeBallisticsForBlueprint(ctx, fRaw),
    pbrBindings,
    pbrSuites: [],
  };
}

/** Lazily builds & caches a `WeaponRuntimePlugin` by `CentennialWeaponId`. */
export function buildCentennialPlugin(
  id: CentennialWeaponId
): WeaponRuntimePlugin {
  const cached = BUILT_PLUGIN_CACHE.get(id);
  if (cached) return cached;
  const bp = CENTENNIAL_BLUEPRINT_MAP[id];
  if (!bp) {
    throw new Error(`Unknown Centennial exhibit id: ${String(id)}`);
  }
  const plugin = buildCentennialPluginForBlueprint(bp);
  BUILT_PLUGIN_CACHE.set(id, plugin);
  return plugin;
}
