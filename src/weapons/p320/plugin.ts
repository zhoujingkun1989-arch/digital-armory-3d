import {
  clamp01,
  findActiveFiringPhase,
  linearSeg,
  seg,
} from '../../engine/kinematics/math';
import type {
  AssemblyGroupMeta,
  ExtendedBallisticsState,
  FiringPhaseInfo,
  KeyframeStep,
  PartKinematicDelta,
  PbrBindingSpec,
  PbrSuiteItem,
  TimelinePresetItem,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';

const P320_GRIP_ANGLE_RAD = (-18 * Math.PI) / 180;

export const P320_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '狼棕 PVD 套筒与枪管总成',
    nameEn: 'Coyote PVD Slide & Barrel Group',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: 'M17 聚合物握把模块与外围件',
    nameEn: 'Carry Grip Module & Controls',
    badgeColor: '#7c3aed',
  },
  {
    key: 'fire_control',
    nameZh: '模块化不锈钢 FCU 火控内胆',
    nameEn: 'Serialized Stainless FCU & Safety',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '17 发双排钢匣与 FDE 底盖',
    nameEn: '17-Rd Steel Magazine Assembly',
    badgeColor: '#e11d48',
  },
];

export const P320_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '合拢态',
    subLabel: '0%',
    t: 0.0,
    desc: '全枪完全装配闭合（右侧握把窗口露出不锈钢 FCU 序列号 TF004912，支持 X-Ray 透视）',
  },
  {
    id: 'field_strip',
    label: '一级野战快拆',
    subLabel: '30%',
    t: 0.3,
    desc: '退出 17 发弹匣并旋转快拆解脱柄 90°，向前推下狼棕 PVD 套筒、4.7" 枪管与捕获式复进簧',
  },
  {
    id: 'upper_mag_strip',
    label: '提出 FCU 内胆',
    subLabel: '65%',
    t: 0.65,
    desc: '抽出快拆柄，将带序列号的不锈钢 FCU 火控内胆从聚合物握把座中垂直整体提出，并分解红点盖板与弹匣',
  },
  {
    id: 'full_explode',
    label: '全零件爆炸图',
    subLabel: '100%',
    t: 1.0,
    desc: '展开 FCU 火控组件、美军 M17 双侧手动保险、内部击针总成及弹匣共 24 个精密节点',
  },
] as const;

const SLIDE_STAGE1: KeyframeStep[] = [
  { range: [0.12, 0.19], offset: [5.4, 0, 0] },
  { range: [0.19, 0.27], offset: [-4.2, 6.2, 0] },
  { range: [0.27, 0.32], offset: [0, 1.6, 0] },
];

const SLIDE_LIFT2: KeyframeStep = {
  range: [0.48, 0.64],
  offset: [0, 3.0, 0],
};

const FCU_UNIT_LIFT: KeyframeStep = {
  range: [0.44, 0.62],
  offset: [0, 4.2, 0],
};

const MAG_EXTRACT_STAGE1: KeyframeStep[] = [
  { range: [0.0, 0.09], offset: [-2.6, -8.4, 0] },
  { range: [0.09, 0.18], offset: [6.8, 2.8, 0] },
];

export const P320_PARTS: WeaponPartSpec[] = [
  // ============================================================================
  // 1. COYOTE TAN PVD SLIDE, OPTIC PLATE & 4.7" BARREL ASSEMBLY (11 Parts)
  // ============================================================================
  {
    id: 'p320_slide',
    bomCode: 'U-01',
    nameZh: '狼棕 PVD 不锈钢套筒 (含红点底座切槽)',
    calloutLabel: '狼棕 PVD 套筒',
    nameEn: 'Coyote Tan PVD Stainless Slide (Optic-Ready)',
    group: 'slide',
    material: 'stainless',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [...SLIDE_STAGE1, SLIDE_LIFT2],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [3.2, 3.55, 0],
    labelAppearAt: 0.0,
    roleTag: '核心往复自动机 / 光学瞄具平台',
    description:
      '高强度不锈钢 CNC 切削套筒，表面采用美军 MHS 制式狼棕色（Coyote Tan）PVD 物理气相沉积耐蚀涂层。两侧前后均铣有斜向防滑拉机锯齿，顶部开放式抛壳窗与枪管方形弹膛咬合闭锁，后上顶面预留 M17 军规红点直装切槽。',
  },
  {
    id: 'p320_optic_plate_sight',
    bomCode: 'U-02',
    nameZh: '可拆卸红点盖板与一体式夜视照门',
    calloutLabel: '红点盖板与照门',
    nameEn: 'Removable Optic Plate w/ Integral M17 Night Rear Sight',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-5.55, 3.26, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      SLIDE_LIFT2,
      { range: [0.46, 0.58], offset: [-0.8, 2.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [-0.8, 0.72, 0],
    labelAppearAt: 0.0,
    roleTag: '模块化红点封板 / 双点氚光照门',
    description:
      '美军 M17 标志性的黑色阳极氧化/氮化可拆卸护板，通过顶部内梅花螺钉锁固在套筒红点槽内，后段一体集成带护翼的 SIGLITE 双点氚光夜视缺口照门；拆下此板即可直接加装 Leupold DeltaPoint Pro 战术红点。',
  },
  {
    id: 'p320_front_sight',
    bomCode: 'U-03',
    nameZh: '燕尾槽氚光夜视准星',
    calloutLabel: '燕尾槽氚光准星',
    nameEn: 'Dovetail SIGLITE Night Front Sight',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [10.55, 3.56, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      SLIDE_LIFT2,
      { range: [0.46, 0.58], offset: [1.2, 2.1, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 34,
    calloutAnchor: [0, 0.42, 0],
    labelAppearAt: 0.0,
    roleTag: '全天候氚光前瞄具',
    description:
      '横向嵌入套筒前端燕尾槽的氮化钢片状准星，背面镶嵌带高对比白圈的自发光氚气管，与后照门构成三点式夜间快速瞄准基线。',
  },
  {
    id: 'p320_barrel',
    bomCode: 'U-04',
    nameZh: '4.7 英寸氮化钢偏移闭锁枪管 (含膛内有弹槽)',
    calloutLabel: '4.7" 氮化钢枪管',
    nameEn: '4.7" Black Nitride Tilting Barrel w/ LCI Cut',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.12, 0.19], offset: [5.4, 0, 0] },
      { range: [0.19, 0.28], offset: [-4.2, 6.2, 0] },
      { range: [0.28, 0.34], offset: [0.8, -0.8, 0] },
      { range: [0.54, 0.7], offset: [1.6, 2.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [8.6, 3.25, 0],
    labelAppearAt: 0.24,
    roleTag: '改进型勃朗宁偏移闭锁核心',
    description:
      '全尺寸 4.7 英寸（119mm）黑色氮化处理冷锻铬钼钢枪管。上方方形弹膛节套卡入套筒抛壳窗闭锁，节套顶面后端铣有美军要求的膛内有弹观察槽（LCI），下方开锁凸耳与不锈钢 FCU 前部闭锁块斜面啮合。',
  },
  {
    id: 'p320_recoil_guide_rod',
    bomCode: 'U-05',
    nameZh: '捕获式钢制复进簧导杆',
    calloutLabel: '捕获式复进导杆',
    nameEn: 'Captive Steel Recoil Spring Guide Rod',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.12, 0.19], offset: [5.4, 0, 0] },
      { range: [0.19, 0.28], offset: [-4.2, 6.2, 0] },
      { range: [0.24, 0.32], offset: [0.2, -2.4, 0] },
      { range: [0.52, 0.66], offset: [5.4, 1.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [8.5, 1.65, 0],
    labelAppearAt: 0.48,
    roleTag: '双套管复进导向支撑',
    description:
      '高刚度全钢捕获式复进导杆，尾端带有防装反平切定位法兰（安装时两平切面须竖直朝向两侧），抵住枪管下凸耳半圆台阶，确保高速后坐循环平顺无挠曲。',
  },
  {
    id: 'p320_recoil_spring',
    bomCode: 'U-06',
    nameZh: '扁钢丝螺旋复进簧',
    calloutLabel: '扁钢丝复进簧',
    nameEn: 'Captured Flat-Wire Helical Recoil Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.12, 0.19], offset: [5.4, 0, 0] },
      { range: [0.19, 0.28], offset: [-4.2, 6.2, 0] },
      { range: [0.24, 0.32], offset: [0.2, -2.4, 0] },
      { range: [0.52, 0.66], offset: [-2.8, 1.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [6.2, 1.78, 0],
    labelAppearAt: 0.24,
    roleTag: '后坐缓冲储能 / 推弹上膛复进',
    description:
      '高疲劳寿命矩形扁截面弹簧钢丝绕制，捕获套装在钢制导杆外周；后坐时大幅压缩吸收套筒冲量，随后释放弹性势能推套筒剥弹入膛并抬升枪管闭锁。',
  },
  {
    id: 'p320_striker',
    bomCode: 'U-07',
    nameZh: '平移式不锈钢击针 (含挂机齿与保险钩)',
    calloutLabel: '平移式不锈钢击针',
    nameEn: 'Stainless Striker Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      SLIDE_LIFT2,
      { range: [0.46, 0.62], offset: [-14.2, -0.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [-4.2, 2.8, 0],
    labelAppearAt: 0.48,
    roleTag: '全待击平移惯性击发件',
    description:
      'P320 采用全待击平移击针体制：套筒复进时击针底部挂机齿已被 FCU 回转阻铁完全挂住蓄满击发能；击针上方还设有与内部跌落保险锁片啮合的第二重防走火拦截卡槽。',
  },
  {
    id: 'p320_striker_spring',
    bomCode: 'U-08',
    nameZh: '击针螺旋主簧与卡杯',
    calloutLabel: '击针主簧与卡杯',
    nameEn: 'Striker Main Spring & Retainer Cups',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      SLIDE_LIFT2,
      { range: [0.46, 0.62], offset: [-9.8, 0.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 56,
    calloutAnchor: [-4.5, 2.9, 0],
    labelAppearAt: 0.48,
    roleTag: '击针高速撞击底火动力源',
    description:
      '套装在击针中后段与内部击针座前壁之间的高弹力螺旋压簧，在阻铁下潜脱钩瞬间驱动击针高速前冲刺破军规硬质底火。',
  },
  {
    id: 'p320_striker_housing',
    bomCode: 'U-09',
    nameZh: '内部击针座总成与套筒尾盖板',
    calloutLabel: '击针座与尾盖板',
    nameEn: 'Internal Striker Housing Cage & Slide Cap',
    group: 'slide',
    material: 'polymer_frame',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      SLIDE_LIFT2,
      { range: [0.44, 0.58], offset: [-5.6, 0.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-6.4, 3.05, 0],
    labelAppearAt: 0.46,
    roleTag: '模块化套筒内击针托架',
    description:
      'SIG P320 独特的模块化聚合物击针座笼架与黑色氮化钢尾盖板：将击针、击针主簧及跌落保险锁片集成为一个独立内胆模块滑入套筒尾腔，免工具即可快速拆洗维护。',
  },
  {
    id: 'p320_safety_lock',
    bomCode: 'U-10',
    nameZh: '击针跌落保险锁片与复位微簧',
    calloutLabel: '击针保险锁片',
    nameEn: 'Pivoting Striker Safety Lock & Spring',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-4.35, 2.86, 0.22],
    explodeSteps: [
      ...SLIDE_STAGE1,
      SLIDE_LIFT2,
      { range: [0.48, 0.62], offset: [-2.8, 2.0, 2.4] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 0.25, 0],
    labelAppearAt: 0.5,
    roleTag: '套筒内被动防跌落锁钩',
    description:
      '铰接于击针座右侧的不锈钢摆动锁钩，平时在微簧作用下钩住击针卡槽，即便意外跌落导致阻铁脱钩亦能死死拦住击针；仅当扣动扳机使 FCU 保险顶杆上抬时才解锁放行。',
  },
  {
    id: 'p320_extractor',
    bomCode: 'U-11',
    nameZh: '长爪外露式抽壳钩与顶杆弹簧组',
    calloutLabel: '外露式长抽壳钩',
    nameEn: 'External Extractor, Pin & Plunger Spring',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-1.45, 2.68, 1.02],
    explodeSteps: [
      ...SLIDE_STAGE1,
      SLIDE_LIFT2,
      { range: [0.46, 0.6], offset: [1.2, 0.6, 3.1] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [0, 0.22, 0],
    labelAppearAt: 0.48,
    roleTag: '高可靠抓弹底缘抽壳组件',
    description:
      '嵌装于套筒抛壳窗后方右侧壁的加长杠杆式氮化钢抽壳钩，尾端受独立螺旋压簧与柱塞持续向外推压，使前端钩爪强力抱紧 9×19mm 弹壳底缘抽出弹膛。',
  },

  // ============================================================================
  // 2. COYOTE FDE CARRY GRIP MODULE & CONTROLS (4 Parts)
  // ============================================================================
  {
    id: 'p320_grip_module',
    bomCode: 'F-01',
    nameZh: 'M17 狼棕聚合物握把模块 (含右侧 FCU 序列号窗)',
    calloutLabel: 'M17 聚合物握把座',
    nameEn: 'Coyote FDE Polymer Carry Grip Module (w/ FCU Window)',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [7.2, -0.3, 0],
    labelAppearAt: 0.0,
    roleTag: '非受控可换人机工程学外壳',
    description:
      '狼棕色（Coyote FDE）高强度玻纤聚合物 Carry 规格握把座：前端带 3 槽 M1913 皮卡汀尼导轨，后部延伸加长海狸尾护手，双侧激光蚀刻防滑纹嵌有 SIG SAUER 徽章；右侧上方开有标志性矩形窗口以露出内部不锈钢 FCU 的法定序列号（TF004912），握把外壳本身无序列号，支持免审批更换不同尺码握把！',
  },
  {
    id: 'p320_takedown_lever',
    bomCode: 'F-02',
    nameZh: '旋转式快拆解脱柄 (无需扣扳机拆解连锁)',
    calloutLabel: '旋转式快拆解脱柄',
    nameEn: 'Rotating Takedown Lever',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [1.85, 0.42, 0],
    explodeSteps: [
      {
        range: [0.08, 0.16],
        offset: [0, 0, 0],
        rotation: [0, 0, -Math.PI / 2],
      },
      { range: [0.32, 0.44], offset: [2.2, -0.6, -4.2] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0.35, -0.1, -1.2],
    labelAppearAt: 0.34,
    roleTag: '套筒解锁凸轮轴 / FCU 固定横栓',
    description:
      '横穿聚合物握把模块与不锈钢 FCU 前孔的旋转锁轴：野战拆解时必须在挂机并卸下弹匣后方可顺时针旋转 90° 让开枪管下凸耳（无需扣动扳机即可安全拆解！）；完全拔出此柄即可将整套不锈钢 FCU 内胆向上提出。',
  },
  {
    id: 'p320_slide_catch',
    bomCode: 'F-03',
    nameZh: '双侧空仓挂机解脱杆',
    calloutLabel: '双侧空仓挂机杆',
    nameEn: 'Ambidextrous Slide Catch Lever',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      FCU_UNIT_LIFT,
      { range: [0.7, 0.88], offset: [-1.4, 1.2, -3.4] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-2.45, 0.86, -1.25],
    labelAppearAt: 0.72,
    roleTag: '左右手通用挂机与释放控制',
    description:
      '铰接在不锈钢 FCU 扳机销轴上的冲压折弯一体式双侧挂机杆：最后一发弹射出后由托弹板顶起卡入套筒缺口挂机，左右手射手均可直接拇指下压防滑拨片释放套筒复进上膛。',
  },
  {
    id: 'p320_mag_catch',
    bomCode: 'F-04',
    nameZh: '可换向圆角三角形弹匣卡榫与压簧',
    calloutLabel: '可换向弹匣卡榫',
    nameEn: 'Reversible Triangular Magazine Catch & Spring',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-2.35, -2.15, 0],
    assembledRot: [0, 0, P320_GRIP_ANGLE_RAD],
    explodeSteps: [{ range: [0.66, 0.8], offset: [1.8, -0.8, 3.8] }],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, 0, -1.2],
    labelAppearAt: 0.68,
    roleTag: '人体工学三角形弹匣释放钮',
    description:
      '安装在握把护圈根部的圆角三角形防滑网纹释放按钮，内置螺旋弹簧与模块化锁止镶块，可根据左右撇子射手习惯翻转安装方向以扣合双排钢匣两侧锁孔。',
  },

  // ============================================================================
  // 3. MODULAR SERIALIZED STAINLESS FCU CHASSIS & M17 SAFETY (5 Parts)
  // ============================================================================
  {
    id: 'p320_fcu_chassis',
    bomCode: 'FCU-01',
    nameZh: '序列号不锈钢 FCU 模块化火控内胆框架 (TF004912)',
    calloutLabel: '不锈钢 FCU 内胆',
    nameEn: 'Serialized Stainless-Steel Fire Control Unit (FCU) Chassis',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [0, 0, 0],
    explodeSteps: [FCU_UNIT_LIFT],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [-1.2, 1.05, 0],
    labelAppearAt: 0.45,
    roleTag: 'P320 核心专利 / 法定受控模块化机匣',
    description:
      'SIG Sauer P320 颠覆传统手枪架构的革命性设计：采用 17-4 PH 高强度不锈钢精密冲压与 CNC 复合加工而成的一体式火控内胆框架，集成了前后四段套筒导轨、枪管开锁斜面座、左侧固定式抛壳挺及右侧激光雕刻法定序列号（TF004912），拔出快拆柄即可从聚合物握把中完整无损提出！',
  },
  {
    id: 'p320_trigger_shoe',
    bomCode: 'FCU-02',
    nameZh: 'M17 弧形氮化钢军规扳机',
    calloutLabel: '弧形军规钢扳机',
    nameEn: 'Curved Nitride Steel Trigger Shoe',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [0.05, 0.25, 0],
    explodeSteps: [
      FCU_UNIT_LIFT,
      { range: [0.72, 0.9], offset: [3.6, -0.6, 1.8] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [-0.15, -1.65, 0],
    labelAppearAt: 0.74,
    roleTag: '低质量防跌落弧形发射扳机',
    description:
      '美军 M17 量产改进型轻量化低转动惯量实心弧形钢扳机：消除意外跌落时的惯性后摆力矩，上部曲柄销孔与右侧联动扳机连杆铰接，扣动时干脆顺滑。',
  },
  {
    id: 'p320_trigger_bar',
    bomCode: 'FCU-03',
    nameZh: '冲压不锈钢联动扳机连杆与复位拉簧',
    calloutLabel: '扳机连杆与拉簧',
    nameEn: 'Stamped Stainless Trigger Bar & Return Spring',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      FCU_UNIT_LIFT,
      { range: [0.72, 0.92], offset: [0.8, -0.3, 3.4] },
    ],
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [-2.6, 0.62, 0.98],
    labelAppearAt: 0.74,
    roleTag: '前拉式联动传力 / 半自动断路',
    description:
      '贴合不锈钢 FCU 右外壁滑行的冲压不锈钢长连杆与螺旋复位拉簧：扣动扳机时上曲柄将连杆微向前拉并拨转后方阻铁与保险顶杆；套筒后坐时下沿压下连杆上方断路凸耳实现半自动单发断路。',
  },
  {
    id: 'p320_sear_group',
    bomCode: 'FCU-04',
    nameZh: '双阶回转阻铁、保险顶杆与聚合物阻铁座',
    calloutLabel: '双阶阻铁与顶杆座',
    nameEn: 'Dual-Notch Pivoting Sear, Safety Lever & Housing',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-5.15, 0.62, 0],
    explodeSteps: [
      FCU_UNIT_LIFT,
      { range: [0.74, 0.94], offset: [-3.8, 1.1, -1.4] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 0.65, 0],
    labelAppearAt: 0.75,
    roleTag: '全待击阻铁释放 / 顶开击针锁片',
    description:
      '嵌装在不锈钢 FCU 尾腔内的核心火控盒：包含带双级防跌落拦截台阶的 MIM 不锈钢回转阻铁、双螺旋阻铁簧，以及同步向上翘起以顶开套筒内击针保险锁片的保险顶杆（Safety Lever）。',
  },
  {
    id: 'p320_manual_safety',
    bomCode: 'FCU-05',
    nameZh: '美军 M17 双侧联动手动拇指保险',
    calloutLabel: 'M17 双侧手动保险',
    nameEn: 'US Army M17 Ambidextrous Manual Thumb Safety',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-5.75, 0.76, 0],
    explodeSteps: [
      FCU_UNIT_LIFT,
      { range: [0.74, 0.96], offset: [-6.6, 0.4, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [-0.65, 0.15, 1.32],
    labelAppearAt: 0.75,
    roleTag: '美军 MHS 招标强制双侧机械保险',
    description:
      '美军 M17 区别于商业版基础型 P320 的最显著外部特征：横穿 FCU 尾部的联动横轴连接左右两侧水滴形防滑拇指拨片；向上拨入保险位时内部锁块物理锁死扳机连杆与阻铁，向下拨平即可迅捷射击。',
  },

  // ============================================================================
  // 4. 17-ROUND STEEL MAGAZINE W/ COYOTE TAN FDE BASEPLATE (4 Parts)
  // ============================================================================
  {
    id: 'p320_mag_body',
    bomCode: 'M-01',
    nameZh: '17 发双排单进哑光黑钢制弹匣体',
    calloutLabel: '17 发钢制弹匣体',
    nameEn: '17-Round Matte-Steel Double-Stack Magazine Body',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-5.25, -4.59, 0],
    assembledRot: [0, 0, P320_GRIP_ANGLE_RAD],
    explodeSteps: [
      ...MAG_EXTRACT_STAGE1,
      { range: [0.5, 0.62], offset: [-0.4, 0.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0.2, -2.6, 0],
    labelAppearAt: 0.1,
    roleTag: '高强度全钢双排单进供弹管',
    description:
      '意大利 Mec-Gar / SIG 原厂热处理碳钢冲压焊接弹匣管，表面防锈氮化涂层，双侧冲有减摩导槽与可换向卡榫锁孔，背面开有 5 / 10 / 15 / 17 发余弹观察圆孔。',
  },
  {
    id: 'p320_mag_follower',
    bomCode: 'M-02',
    nameZh: '防倾阶梯式聚合物托弹板',
    calloutLabel: '防倾聚合物托弹板',
    nameEn: 'Anti-Tilt Polymer Magazine Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [-4.22, -1.41, 0],
    assembledRot: [0, 0, P320_GRIP_ANGLE_RAD],
    explodeSteps: [
      ...MAG_EXTRACT_STAGE1,
      { range: [0.52, 0.65], offset: [3.6, 1.4, 2.6] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, 0, 0],
    labelAppearAt: 0.52,
    roleTag: '双排错位导引 / 触发空仓挂机',
    description:
      '前后带长导引防倾裙边的聚合物阶梯式托弹板，确保 17 发 9×19mm 手枪弹高速上托不卡滞，并在打空最后一发后利用左前凸台顶起双侧空仓挂机杆。',
  },
  {
    id: 'p320_mag_spring',
    bomCode: 'M-03',
    nameZh: '矩形截面螺旋托弹簧',
    calloutLabel: '矩形螺旋托弹簧',
    nameEn: 'Rectangular Helical Magazine Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [-5.48, -5.3, 0],
    assembledRot: [0, 0, P320_GRIP_ANGLE_RAD],
    explodeSteps: [
      ...MAG_EXTRACT_STAGE1,
      { range: [0.52, 0.65], offset: [-3.2, -1.2, 2.8] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [0, -1.8, 0],
    labelAppearAt: 0.52,
    roleTag: '恒压可靠上托供弹动力',
    description:
      '高弹力琴钢丝大折角矩形螺旋弹簧，在泥沙低温严苛环境下仍能持续稳定地将双排弹柱推至钢制单进抱弹口。',
  },
  {
    id: 'p320_mag_baseplate',
    bomCode: 'M-04',
    nameZh: '狼棕 FDE 聚合物平齐弹匣底盖与锁片',
    calloutLabel: '狼棕 FDE 弹匣底盖',
    nameEn: 'Flush-Fit Coyote Tan FDE Polymer Floorplate',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [-6.731, -9.16, 0],
    assembledRot: [0, 0, P320_GRIP_ANGLE_RAD],
    explodeSteps: [
      ...MAG_EXTRACT_STAGE1,
      { range: [0.5, 0.58], offset: [2.6, -0.8, 0] },
      { range: [0.58, 0.68], offset: [1.8, -0.4, -2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [0, -0.2, 0],
    labelAppearAt: 0.5,
    roleTag: '狼棕平齐闭锁底盖 / 快拔抠槽',
    description:
      '与 M17 Carry 握把模块底部完全平齐咬合（零缝隙贴合）的狼棕色聚合物标准 17 发弹匣底盖，两侧带防滑手抠凹槽，底部设中心钢制闭锁定位柱。',
  },
];

export const P320_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'p320_trigger_pull',
    stepNum: '01',
    shortLabel: '扣扳机抬保险',
    title: '阶段 1 · 扣动弧形扳机与前拉连杆顶开击针锁片',
    range: [0.0, 0.18],
    description:
      'M17 双侧手动拇指保险置于解除位；手指扣动弧形钢扳机（绕主销逆时针转动 rz < 0），扳机上部曲柄带动右侧不锈钢连杆前移并拨起 FCU 尾部的保险顶杆，向上顶开套筒内的击针跌落保险锁片。',
  },
  {
    id: 'p320_sear_release',
    stepNum: '02',
    shortLabel: '阻铁下潜击发',
    title: '阶段 2 · 双阶不锈钢回转阻铁下潜释放全待击击针',
    range: [0.18, 0.25],
    description:
      '扳机行程末端驱动 FCU 内的双阶不锈钢回转阻铁鼻端向下倾转脱钩；原本处于全待击满蓄能位置的平移不锈钢击针在主簧强力推动下高速前冲，精准刺破 9×19mm 弹底火。',
  },
  {
    id: 'p320_projectile_exit',
    stepNum: '03',
    shortLabel: '燃气推弹出膛',
    title: '阶段 3 · 发射药燃爆膨胀与 9mm 弹头冲出 4.7" 枪管',
    range: [0.25, 0.36],
    description:
      '底火引燃发射药产生高温高压火药燃气，推动 9×19mm 覆铜被甲弹头沿 4.7 英寸氮化钢膛线高速旋转加速冲出枪口，膛口形成明亮锥形燃气羽流。',
  },
  {
    id: 'p320_unlock_recoil',
    stepNum: '04',
    shortLabel: '枪管偏移开锁',
    title: '阶段 4 · FCU 斜面引导枪管下倾开锁与狼棕套筒后坐',
    range: [0.36, 0.54],
    description:
      '套筒携枪管共同短后坐约 3mm 泄压后，枪管下方凸耳沿不锈钢 FCU 一体闭锁斜面下沉，方形弹膛向下脱离套筒抛壳窗完成开锁；狼棕 PVD 套筒沿 FCU 四段钢导轨独立后坐到底并大幅压缩扁钢丝复进簧。',
  },
  {
    id: 'p320_extract_eject',
    stepNum: '05',
    shortLabel: '抽壳撞挺抛壳',
    title: '阶段 5 · 外露长抽壳钩拉壳与 FCU 抛壳挺踢出空弹壳',
    range: [0.46, 0.72],
    description:
      '套筒右侧外露长爪抽壳钩紧紧咬住空黄铜弹壳底缘将其抽出弹膛；当空弹壳左后底缘撞击不锈钢 FCU 左侧一体成型的弯折抛壳挺时，弹壳向右上前方翻滚抛出抛壳窗。',
  },
  {
    id: 'p320_feed_lock',
    stepNum: '06',
    shortLabel: '复进推弹闭锁',
    title: '阶段 6 · 17 发钢匣托弹上升与套筒复进推弹重锁',
    range: [0.56, 0.86],
    description:
      '17 发钢制弹匣内下一发 9mm 弹上托至单进抱弹口；扁钢丝复进簧释放能量推套筒高速前冲，推新弹顺镜面供弹坡滑入弹膛，同时顶推枪管上抬重锁抛壳窗，击针挂机齿被 FCU 阻铁挂入全待击位。',
  },
  {
    id: 'p320_trigger_reset',
    stepNum: '07',
    shortLabel: '断路交接复位',
    title: '阶段 7 · 松开弧形扳机与连杆半自动断路清脆复位',
    range: [0.86, 1.0],
    description:
      '射手松开弧形扳机，复位拉簧牵引联动连杆复位，先前被后坐套筒压下断路的连杆凸耳重新弹起啮合双阶阻铁，套筒内击针跌落保险锁片回落闭锁，完成半自动待击循环。',
  },
];

export function computeP320FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  const rx = 0;
  const ry = 0;
  let rz = 0;
  let scaleX = 1;

  // Master Slide Recoil Stroke (0 -> -4.55 cm at f=0.54 -> 0 at f=0.855)
  const slideRecoilIn = seg(f, 0.315, 0.54);
  const slideReturn = seg(f, 0.57, 0.855);
  const slideDX = -4.55 * (slideRecoilIn - slideReturn);
  const slideTravel = -slideDX; // >= 0

  // True Browning Short-Recoil Two-Support Barrel Camming Law for 4.7" M17 Barrel:
  // 1) Locked dwell for first 3.0 mm (slideTravel <= 0.30 cm): barrel & slide move 1:1 with rz = 0.
  // 2) Over slideTravel in [0.30, 1.14] cm, FCU 38° locking-block ramp cams chamber lug down -0.32 cm
  //    and arrests barrel rearward travel smoothly at -0.56 cm while front tube rides concentrically inside slide muzzle ring.
  const barrelTX =
    slideTravel <= 0.3
      ? slideDX
      : -0.3 - 0.26 * (1 - Math.exp(-(slideTravel - 0.3) / 0.26));
  const camLinear = clamp01((slideTravel - 0.3) / 0.84);
  const camSmooth = camLinear * camLinear * (3 - 2 * camLinear);

  const xLug = 1.05;
  const yBore = 2.68;
  const xSlideRing = 10.85 + slideDX - barrelTX;
  const lugDrop = -0.32 * camSmooth;
  const ringDrop = -0.02 * camSmooth;
  const barrelRZ = Math.asin(
    Math.min(0.12, Math.max(0, (ringDrop - lugDrop) / (xSlideRing - xLug)))
  );

  // Full-cock P320 Striker cycle:
  // Slight final sear take-up (-0.12) -> Fast primer strike (+0.86) -> Primer rebound (+0.68) -> Full-cock sear catch (0)
  const preCreep = seg(f, 0.08, 0.18);
  const snapForward = seg(f, 0.185, 0.22);
  const primerRebound = seg(f, 0.235, 0.29);
  const recock = seg(f, 0.71, 0.855);
  const localStrikerX =
    -0.12 * preCreep +
    0.98 * snapForward -
    0.18 * primerRebound -
    0.68 * recock;

  if (
    partId === 'p320_slide' ||
    partId === 'p320_optic_plate_sight' ||
    partId === 'p320_front_sight' ||
    partId === 'p320_striker_housing' ||
    partId === 'p320_extractor'
  ) {
    dx = slideDX;
    if (partId === 'p320_extractor') {
      const caseInChamber = 1 - seg(f, 0.45, 0.49) + seg(f, 0.8, 0.855);
      const rimSnap = Math.sin(linearSeg(f, 0.77, 0.85) * Math.PI);
      dz = 0.02 * clamp01(caseInChamber) + 0.06 * rimSnap;
    }
    return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
  }

  switch (partId) {
    case 'p320_barrel': {
      // Exact rigid-body transform placing (xLug, yBore) at (xLug + barrelTX, yBore + lugDrop) with tilt barrelRZ
      const cosT = Math.cos(barrelRZ);
      const sinT = Math.sin(barrelRZ);
      dx = barrelTX + xLug * (1 - cosT) + yBore * sinT;
      dy = lugDrop - xLug * sinT + yBore * (1 - cosT);
      rz = barrelRZ;
      break;
    }

    case 'p320_recoil_guide_rod': {
      // Flat-sided D-flange stays seated against barrel cam lug while slide recoils over telescoping shaft
      dx = barrelTX;
      dy = -0.04 * camSmooth;
      break;
    }

    case 'p320_recoil_spring': {
      // Captured flat-wire recoil spring spans X in [2.12, 10.82] (L0 = 8.70)
      const x0Orig = 2.12;
      const L0 = 8.7;
      const x0New = x0Orig + barrelTX;
      const x1New = 10.82 + slideDX;
      const LNew = Math.max(3.3, x1New - x0New);
      scaleX = LNew / L0;
      dx = x0New - x0Orig * scaleX;
      dy = -0.02 * camSmooth;
      break;
    }

    case 'p320_striker': {
      dx = slideDX + localStrikerX;
      break;
    }

    case 'p320_striker_spring': {
      // Original striker spring spans X in [-6.55, -2.55] (L0 = 4.00)
      const x0Orig = -6.55;
      const L0 = 4.0;
      const x0New = x0Orig + slideDX;
      const x1New = -2.55 + slideDX + localStrikerX;
      const LNew = Math.max(2.1, x1New - x0New);
      scaleX = LNew / L0;
      dx = x0New - x0Orig * scaleX;
      break;
    }

    case 'p320_safety_lock': {
      // Lifted upward & pivoted clear of striker safety hook by FCU safety lever during trigger pull
      const liftUp = seg(f, 0.05, 0.16);
      const dropBack = seg(f, 0.35, 0.43);
      const active = liftUp - dropBack;
      dx = slideDX;
      dy = 0.22 * active;
      rz = 0.14 * active;
      break;
    }

    case 'p320_trigger_shoe': {
      // Pivots around local [0,0,0] = world [0.05, 0.25, 0]; rz < 0 pulls curved bottom shoe rearward (-X)
      const pull = seg(f, 0.0, 0.18);
      const release = seg(f, 0.87, 0.96);
      rz = -0.26 * (pull - release);
      break;
    }

    case 'p320_trigger_bar': {
      // Upper crank pulls P320 trigger bar forward (+X) to trip sear & safety lever;
      // recoiling slide cams upper disconnector lobe downward (-Y) until trigger release reset
      const pull = seg(f, 0.0, 0.18);
      const release = seg(f, 0.87, 0.96);
      const disconnectDown = seg(f, 0.365, 0.445) - seg(f, 0.885, 0.95);
      dx = 0.35 * (pull - release);
      dy = -0.15 * disconnectDown;
      break;
    }

    case 'p320_sear_group': {
      // Dual-notch MIM sear tips downward (rz < 0 drops +x nose) at sear release, snaps back up under twin coil springs to catch striker on return
      const searDrop = seg(f, 0.16, 0.205) - seg(f, 0.67, 0.74);
      rz = -0.19 * searDrop;
      break;
    }

    case 'p320_mag_follower': {
      const feedRise = seg(f, 0.52, 0.62) - seg(f, 0.64, 0.78);
      dx = 0.12 * feedRise;
      dy = 0.37 * feedRise;
      break;
    }

    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

export function computeP320BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);

  const slideRecoilIn = seg(f, 0.315, 0.54);
  const slideReturn = seg(f, 0.57, 0.855);
  const slideDX = -4.55 * (slideRecoilIn - slideReturn);

  // 1. 9x19mm Projectile along Y = +2.68 bore axis (exits 4.7" muzzle at X = +11.85)
  const bulletVisible = f < 0.47;
  let bulletX = 1.85;
  let streakLength = 0;

  if (f >= 0.24 && f < 0.31) {
    const u = Math.pow(linearSeg(f, 0.24, 0.31), 1.5);
    bulletX = 1.85 + 10.0 * u;
    streakLength = 2.6 * u;
  } else if (f >= 0.31 && f < 0.47) {
    const u = linearSeg(f, 0.31, 0.47);
    bulletX = 11.85 + 33.0 * u;
    streakLength = 6.6 * (1 - u * 0.5);
  }

  // 2. Spent 9x19mm Brass Case extracted & kicked out right-top ejection port by FCU fixed ejector
  const spentCaseVisible = f < 0.76;
  let caseX = 0.48;
  let caseY = 2.68;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.315 && f < 0.47) {
    caseX = 0.48 + slideDX;
    caseY = 2.68 - 0.14 * Math.sin(linearSeg(f, 0.34, 0.45) * Math.PI);
  } else if (f >= 0.47 && f < 0.76) {
    const u = linearSeg(f, 0.47, 0.76);
    const slideAtEject = -4.55 * seg(0.47, 0.315, 0.54);
    const baseAtEject = 0.48 + slideAtEject;
    caseX = baseAtEject - 4.0 * u;
    caseY = 2.68 + 6.9 * u - 8.4 * u * u;
    caseZ = 9.6 * u;
    caseRX = u * 8.8;
    caseRY = u * 12.4;
    caseRZ = -u * 10.2;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.76);
    }
  }

  // 3. Chamber Flash & Muzzle Gas Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.22 && f <= 0.32) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.22, 0.32) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.3 && f <= 0.39) {
    const u = linearSeg(f, 0.3, 0.39);
    muzzlePlumeScale = 0.36 + 1.28 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.84;
  }

  // 4. Next 9x19mm Cartridge stripped from 17-rd steel mag up feed ramp into chamber [0.48, 2.68, 0]
  let nextX = -2.85;
  let nextY = 1.15;
  let nextRZ = 0.12;

  if (f >= 0.52 && f < 0.62) {
    const u = seg(f, 0.52, 0.62);
    nextX = -2.85 + 0.18 * u;
    nextY = 1.15 + 0.52 * u;
    nextRZ = 0.12 + 0.08 * u;
  } else if (f >= 0.62 && f < 0.855) {
    const u = seg(f, 0.62, 0.855);
    const rampArc = Math.sin(u * Math.PI) * 0.24;
    nextX = -2.67 + (0.48 - -2.67) * u;
    nextY = 1.67 + (2.68 - 1.67) * u + rampArc;
    nextRZ = 0.2 * (1 - u);
  } else if (f >= 0.855) {
    nextX = 0.48;
    nextY = 2.68;
    nextRZ = 0;
  }

  // 5. Reserve round rising inside 17-rd magazine along -18 deg grip angle
  const magFeedShift = seg(f, 0.52, 0.72);
  const resX = -3.18 + (-2.85 - -3.18) * magFeedShift;
  const resY = 0.15 + (1.15 - 0.15) * magFeedShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, 2.68, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0],
    gasPortFlashIntensity: 0,
    gasPortPos: [0, 0, 0],
  };
}

const M17_ATLAS = {
  albedoFile: 'p320_m17_albedo.webp',
  normalFile: 'p320_m17_normal.webp',
  roughnessFile: 'p320_m17_roughness.webp',
};

export const P320_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  p320_slide: {
    ...M17_ATLAS,
    normalScale: 0.45,
  },
  p320_grip_module: {
    ...M17_ATLAS,
    normalScale: 0.52,
  },
  p320_fcu_chassis: {
    ...M17_ATLAS,
    normalScale: 0.4,
  },
  p320_mag_baseplate: {
    ...M17_ATLAS,
    normalScale: 0.44,
  },
};

export const P320_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'p320_m17',
    weapon: 'p320',
    titleCn: 'P320 M17 狼棕 PVD 套筒、FDE 握把与序列号 FCU 贴图组',
    partTag: 'U-01 / F-01 / FCU-01',
    resolution: '2048 × 2048 px',
    summary:
      '专为美军制式 SIG Sauer P320-M17 定制的 2K 复合高精度物理材质图集：上半幅还原温暖丝滑的狼棕色（Coyote Tan #9d8363）PVD 不锈钢套筒及双侧凹刻 SIG SAUER P320 / M17 与军规 UID 二维码钢印；下半幅刻画狼棕 FDE（#8d7251）激光防滑纹握把与浮雕徽章，以及右侧透窗可见的 17-4 PH 拉丝不锈钢 FCU 序列号牌（TF004912）。',
    highlights: [
      '左侧 SIG SAUER P320 [M17] & 右侧军规 UID 码',
      'Coyote FDE 激光防滑握把面板与浮雕原厂徽标',
      '拉丝不锈钢 FCU 激光深雕序列号 TF004912',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'p320_m17_albedo.webp',
        note: 'sRGB · 狼棕 PVD 套筒 / FDE 握把 / 拉丝不锈钢 FCU 钢牌',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'p320_m17_normal.webp',
        note: 'Linear · 平整 CNC 表面 + 凹刻铭文 + 激光颗粒防滑法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'p320_m17_roughness.webp',
        note: 'Linear · PVD 金属丝光 (0.27) vs 激光防滑哑光 (0.82) vs 不锈钢 (0.20)',
      },
    ],
  },
  {
    id: 'p320_seamless_detail',
    weapon: 'p320',
    titleCn: '4.7吋氮化枪管、扁钢丝复进簧与双侧保险内件无缝细节贴图',
    partTag: '20 BARREL & FCU PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为 4.7 英寸碳氮共渗枪管、可拆红点护板兼夜视照门、平移击针组件、扁钢丝复进簧、M17 双侧手动拇指保险及 17 发磷化钢弹匣提供精细拉丝与皮纹细节。',
    highlights: [
      '4.7" 偏移闭锁枪管、双阶安全阻铁与扳机连杆金属拉丝',
      'M17 双侧拇指手动保险、快拆分解柄与 17 发钢弹匣微晶光泽',
      '覆盖其余全部 20 个套筒内件、FCU 火控与弹匣节点',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于4.7"枪管/击针组件/双阶阻铁/扳机连杆/17发钢弹匣等',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 金属微表面各向异性枪油光泽起伏',
      },
      {
        kind: 'Normal',
        labelCn: '工程聚酰胺皮纹法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于击针内衬座/防尘护板/高可视托弹板等',
      },
    ],
  },
];

export const P320_PLUGIN: WeaponRuntimePlugin = {
  id: 'p320',
  partGroups: P320_PART_GROUPS,
  timelinePresets: P320_TIMELINE_PRESETS,
  parts: P320_PARTS,
  firingPhases: P320_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(P320_FIRING_PHASES, f),
  computeFiringKinematics: computeP320FiringKinematics,
  computeBallisticsState: computeP320BallisticsState,
  pbrBindings: P320_PBR_BINDINGS,
  pbrSuites: P320_PBR_SUITES,
};
