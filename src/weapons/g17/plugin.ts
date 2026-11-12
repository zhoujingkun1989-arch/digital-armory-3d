import {
  clamp01,
  findActiveFiringPhase,
  linearSeg,
  seg,
  toExtendedBallistics,
} from '../../engine/kinematics/math';
import type {
  AssemblyGroupMeta,
  BallisticsVisualState,
  FiringPhaseInfo,
  KeyframeStep,
  PartKinematicDelta,
  PbrBindingSpec,
  PbrSuiteItem,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';

export const PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '套筒与上机匣总成',
    nameEn: 'Slide & Barrel Assembly',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: '下机匣与锁止销件',
    nameEn: 'Receiver Frame & Controls',
    badgeColor: '#7c3aed',
  },
  {
    key: 'fire_control',
    nameZh: 'Safe Action 击发机构',
    nameEn: 'Safe Action Fire Control',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '双排弹匣总成',
    nameEn: 'Magazine Assembly',
    badgeColor: '#e11d48',
  },
];

export const TIMELINE_PRESETS = [
  {
    id: 'assembled',
    label: '合拢态',
    subLabel: '0%',
    t: 0.0,
    desc: '全枪完全装配闭合（可开启 X-Ray 透视查看内部咬合）',
  },
  {
    id: 'field_strip',
    label: '一级野战快拆',
    subLabel: '30%',
    t: 0.3,
    desc: '经典五大件快拆状态：套筒、枪管、复进簧、下机匣、弹匣',
  },
  {
    id: 'upper_mag_strip',
    label: '套筒/弹匣细拆',
    subLabel: '65%',
    t: 0.65,
    desc: '分解击针组、抽壳钩顶杆、击针保险及弹匣内部弹簧组件',
  },
  {
    id: 'full_explode',
    label: '全零件爆炸图',
    subLabel: '100%',
    t: 1.0,
    desc: '推出三销钉并提出闭锁块与十字尾扳机连杆，28 节点完全展开',
  },
] as const;

/** Grip angle: ~20 degrees swept backward as Y goes down */
export const GRIP_ANGLE_RAD = (-20 * Math.PI) / 180;

const SLIDE_GROUP_STAGE1: KeyframeStep[] = [
  { range: [0.08, 0.14], offset: [5.6, 0, 0] },
  { range: [0.14, 0.22], offset: [-4.4, 5.8, 0] },
  { range: [0.22, 0.3], offset: [0, 2.0, 0] },
];

const SLIDE_GROUP_LIFT2: KeyframeStep = {
  range: [0.68, 0.82],
  offset: [0, 2.0, 0],
};

const MAG_EXTRACT_STAGE1: KeyframeStep[] = [
  { range: [0.0, 0.08], offset: [-3.1, -8.5, 0] },
  { range: [0.08, 0.15], offset: [2.6, 2.2, 0] },
];

export const G17_PARTS: WeaponPartSpec[] = [
  // ============================================================================
  // 1. SLIDE & BARREL ASSEMBLY (12 Nodes)
  // ============================================================================
  {
    id: 'slide',
    bomCode: 'U-01',
    nameZh: '套筒主体',
    calloutLabel: '氮化钢套筒',
    nameEn: 'Slide',
    group: 'slide',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [...SLIDE_GROUP_STAGE1, SLIDE_GROUP_LIFT2],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [5.4, 3.35, 0],
    labelAppearAt: 0.0,
    roleTag: '核心运动自动机 / 闭锁体',
    description:
      '高强度氮化处理钢制套筒。右侧上方开有方形抛壳窗与枪管方形膛室直接咬合闭锁；内部后段设有平行的击针通道与抽壳钩顶杆通道，前下方半圆形护套容纳复进簧组件。',
  },
  {
    id: 'front_sight',
    bomCode: 'U-02',
    nameZh: '准星',
    calloutLabel: '片状准星',
    nameEn: 'Front Sight',
    group: 'slide',
    material: 'polymer_frame',
    assembledPos: [10.15, 3.45, 0],
    explodeSteps: [
      ...SLIDE_GROUP_STAGE1,
      { range: [0.46, 0.56], offset: [0, 1.55, 0] },
      SLIDE_GROUP_LIFT2,
    ],
    calloutDir: 'up',
    calloutStem: 34,
    calloutAnchor: [0, 0.35, 0],
    labelAppearAt: 0.0,
    roleTag: '前瞄准具',
    description:
      '嵌入套筒前端顶部安装孔的片状准星，后方带白色瞄准点，通过套筒内侧六角薄螺母或卡扣固定。',
  },
  {
    id: 'rear_sight',
    bomCode: 'U-03',
    nameZh: '照门',
    calloutLabel: '燕尾槽照门',
    nameEn: 'Rear Sight',
    group: 'slide',
    material: 'polymer_frame',
    assembledPos: [-6.45, 3.45, 0],
    explodeSteps: [
      ...SLIDE_GROUP_STAGE1,
      { range: [0.46, 0.56], offset: [0, 1.55, 0] },
      SLIDE_GROUP_LIFT2,
    ],
    calloutDir: 'up',
    calloutStem: 34,
    calloutAnchor: [0, 0.35, 0],
    labelAppearAt: 0.0,
    roleTag: '燕尾槽后瞄具',
    description:
      '横向嵌入套筒后部燕尾槽的缺口式照门，带有标志性的 U 形白框对比标线，可通过横向微调修正风偏。',
  },
  {
    id: 'barrel',
    bomCode: 'U-04',
    nameZh: '枪管 (含方形膛室与下闭锁耳)',
    calloutLabel: '冷锻枪管与闭锁膛',
    nameEn: 'Barrel',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.14], offset: [5.6, 0, 0] },
      { range: [0.14, 0.22], offset: [-4.4, 5.8, 0] },
      { range: [0.22, 0.3], offset: [0.4, -1.1, 0] },
      { range: [0.68, 0.82], offset: [0, 1.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 56,
    calloutAnchor: [8.2, 2.95, 0],
    labelAppearAt: 0.22,
    roleTag: '勃朗宁偏移闭锁核心',
    description:
      '采用改进型勃朗宁枪管偏移闭锁：上方方形弹膛直接卡入套筒抛壳窗闭锁；后坐时枪管下方的闭锁凸耳（Barrel Lug）沿机匣闭锁块斜面下沉，使枪管尾端向下倾转完成开锁。',
  },
  {
    id: 'recoil_guide_rod',
    bomCode: 'U-05',
    nameZh: '复进簧导杆',
    calloutLabel: '聚合物复进导杆',
    nameEn: 'Recoil Spring Guide Rod',
    group: 'slide',
    material: 'polymer_frame',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.14], offset: [5.6, 0, 0] },
      { range: [0.14, 0.22], offset: [-4.4, 5.8, 0] },
      { range: [0.2, 0.3], offset: [-0.2, -3.0, 0] },
      { range: [0.48, 0.6], offset: [5.0, 0, 0] },
      { range: [0.68, 0.82], offset: [0, 1.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 86,
    calloutAnchor: [7.6, 1.35, 0],
    labelAppearAt: 0.45,
    roleTag: '复进导向支撑',
    description:
      '高韧性聚合物导杆，后端圆盘法兰抵住枪管下凸耳前缘半圆槽，前端穿入套筒前下孔，防止复进簧在高速压缩时发生侧向弯曲。',
  },
  {
    id: 'recoil_spring',
    bomCode: 'U-06',
    nameZh: '扁钢丝复进簧',
    calloutLabel: '扁钢丝复进簧',
    nameEn: 'Captured Flat-Wire Recoil Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.14], offset: [5.6, 0, 0] },
      { range: [0.14, 0.22], offset: [-4.4, 5.8, 0] },
      { range: [0.2, 0.3], offset: [-0.2, -3.0, 0] },
      { range: [0.48, 0.6], offset: [-3.2, 0, 0] },
      { range: [0.68, 0.82], offset: [0, 1.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [6.0, 1.65, 0],
    labelAppearAt: 0.22,
    roleTag: '吸收后坐能量 / 推套筒复进',
    description:
      '矩形扁截面螺旋弹簧，比传统圆钢丝弹簧在相同长度下拥有更高的压缩行程与储能寿命，负责吸收套筒后坐动能并推弹上膛闭锁。',
  },
  {
    id: 'slide_cover_plate',
    bomCode: 'U-07',
    nameZh: '套筒尾盖板',
    calloutLabel: '套筒尾盖锁板',
    nameEn: 'Slide Cover Plate',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-7.52, 2.25, 0],
    explodeSteps: [
      ...SLIDE_GROUP_STAGE1,
      { range: [0.3, 0.36], offset: [0, -2.1, 0] },
      { range: [0.36, 0.44], offset: [-2.6, 0.5, 0] },
      SLIDE_GROUP_LIFT2,
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 0.5, 0],
    labelAppearAt: 0.34,
    roleTag: '尾部封闭锁板',
    description:
      '纵向滑入套筒尾部导槽的挡板，同时封闭击针通道与抽壳钩顶杆通道。二级细拆套筒时，必须先将击针衬套向前压下，再将尾盖板向下滑出。',
  },
  {
    id: 'striker',
    bomCode: 'U-08',
    nameZh: '击针 (含底部挂机齿)',
    calloutLabel: '平移击针与挂机齿',
    nameEn: 'Striker / Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...SLIDE_GROUP_STAGE1,
      { range: [0.35, 0.47], offset: [-9.8, 0, 0] },
      SLIDE_GROUP_LIFT2,
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-4.6, 2.65, 0],
    labelAppearAt: 0.38,
    roleTag: '平移式惯性击发件',
    description:
      'G17 无外露击锤，采用平移式击针：上膛复进时处于半待击（约压缩一半弹簧力），扣动扳机时由扳机连杆十字尾将其继续后拉至全待击并最终释放前冲。底部垂直挂机齿是核心啮合部位。',
  },
  {
    id: 'striker_spring',
    bomCode: 'U-09',
    nameZh: '击针簧与衬套组件',
    calloutLabel: '击针簧与隔套',
    nameEn: 'Striker Spring, Cups & Spacer Sleeve',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...SLIDE_GROUP_STAGE1,
      { range: [0.35, 0.5], offset: [-15.0, 0, 0] },
      SLIDE_GROUP_LIFT2,
    ],
    calloutDir: 'up',
    calloutStem: 68,
    calloutAnchor: [-4.2, 2.75, 0],
    labelAppearAt: 0.38,
    roleTag: '击针驱动簧组',
    description:
      '包含击针螺旋主簧、聚合物隔套（Spacer Sleeve）及两片对合式弹簧杯卡箍，套于击针后段提供击发冲量。',
  },
  {
    id: 'firing_pin_safety',
    bomCode: 'U-10',
    nameZh: '击针保险柱塞与弹簧',
    calloutLabel: '击针保险柱塞',
    nameEn: 'Firing Pin Safety Plunger & Spring',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-2.1, 2.1, 0.28],
    explodeSteps: [
      ...SLIDE_GROUP_STAGE1,
      { range: [0.46, 0.56], offset: [-1.1, -1.4, 2.3] },
      SLIDE_GROUP_LIFT2,
    ],
    calloutDir: 'up',
    calloutStem: 56,
    calloutAnchor: [0, 0.35, 0],
    labelAppearAt: 0.48,
    roleTag: 'Safe Action 第二重被动保险',
    description:
      '平时在弹簧作用下向下伸出，利用柱塞宽体段物理阻挡击针前冲通道；只有扣动扳机时，扳机连杆上方的鸟嘴凸起将其向上顶起，缩腰段才对准击针放行。',
  },
  {
    id: 'extractor',
    bomCode: 'U-11',
    nameZh: '外露式抽壳钩',
    calloutLabel: '外露式抽壳钩',
    nameEn: 'Extractor (with Loaded Chamber Indicator)',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-1.05, 2.55, 0.98],
    explodeSteps: [
      ...SLIDE_GROUP_STAGE1,
      { range: [0.44, 0.56], offset: [1.4, 0.3, 2.9] },
      SLIDE_GROUP_LIFT2,
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, 0.2, 0],
    labelAppearAt: 0.46,
    roleTag: '抓弹底缘抽壳 / 膛内有弹指示',
    description:
      '镶嵌在套筒抛壳窗后缘外侧，前端钩齿勾住弹壳底缘；当膛内有弹时抽壳钩外侧凸缘会微向外突出，兼具触觉与视觉膛内有弹指示功能。',
  },
  {
    id: 'extractor_plunger',
    bomCode: 'U-12',
    nameZh: '抽壳钩顶杆与弹簧组',
    calloutLabel: '抽壳钩顶杆与压簧',
    nameEn: 'Extractor Depressor Plunger & Spring',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...SLIDE_GROUP_STAGE1,
      { range: [0.36, 0.45], offset: [-5.2, 0, 0] },
      { range: [0.45, 0.55], offset: [-1.8, 0.4, 2.6] },
      SLIDE_GROUP_LIFT2,
    ],
    calloutDir: 'up',
    calloutStem: 72,
    calloutAnchor: [-4.5, 2.65, 0.72],
    labelAppearAt: 0.42,
    roleTag: '抽壳钩恒压弹性支撑',
    description:
      '位于套筒右后方独立盲孔通道内，前端斜切顶头持续向前推压抽壳钩尾端，使抽壳钩前端钩爪向内抱紧弹壳底缘。',
  },

  // ============================================================================
  // 2. RECEIVER FRAME & CONTROLS (8 Nodes)
  // ============================================================================
  {
    id: 'frame',
    bomCode: 'F-01',
    silhouetteBoxes: [
      [-8.5, -1.1, -1.3, 11.05, 1.08, 1.3],
      [-8.5, -9.3, -1.3, 2.35, 0.2, 1.3],
    ],
    nameZh: '聚合物下机匣 (握把座)',
    calloutLabel: '聚合物下机匣',
    nameEn: 'Polymer Receiver Frame',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [8.4, -0.05, 0],
    labelAppearAt: 0.0,
    roleTag: '全枪基准承载骨架',
    description:
      '高强度尼龙66聚合物一体注塑机匣，内嵌前后四段式金属套筒导轨。前下方带战术附件导轨槽，握把呈经典的约 108°~110° 人机工程学倾角，在拆解视图中作为零位基准件保持不动。',
  },
  {
    id: 'locking_block',
    bomCode: 'F-02',
    nameZh: '金属闭锁块 (开锁斜面座)',
    calloutLabel: '精密铸钢闭锁块',
    nameEn: 'Locking Block',
    group: 'frame',
    material: 'stainless',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.75, 0.86], offset: [0, 2.6, 0] },
      { range: [0.86, 0.96], offset: [4.2, 0.2, -1.5] },
    ],
    calloutDir: 'down',
    calloutStem: 58,
    calloutAnchor: [0.6, 0.45, 0],
    labelAppearAt: 0.78,
    roleTag: '枪管偏移开锁支点',
    description:
      '精密铸造钢制嵌块，通过闭锁块销与扳机主销固定在机匣中部。其中央V形斜面与枪管下方闭锁凸耳啮合，承受后坐冲击并强制引导枪管尾端下沉解锁。',
  },
  {
    id: 'slide_lock',
    bomCode: 'F-03',
    nameZh: '拆卸卡榫与板簧',
    calloutLabel: '快拆卡榫与板簧',
    nameEn: 'Slide Lock & Leaf Spring',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [{ range: [0.66, 0.78], offset: [1.6, 0.1, 4.0] }],
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [2.05, 0.42, 0],
    labelAppearAt: 0.68,
    roleTag: '一级快拆锁止片',
    description:
      '横穿机匣护圈前上方的扁平钢片，由机匣槽内的片状折弯弹簧向上顶起卡住枪管下凸耳前缘；双侧拇指与食指同时向下拉动此卡榫即可向前推下套筒完成快拆。',
  },
  {
    id: 'slide_stop_lever',
    bomCode: 'F-04',
    nameZh: '空仓挂机解脱杆',
    calloutLabel: '空仓挂机解脱杆',
    nameEn: 'Slide Stop Lever',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.74, 0.85], offset: [0, 2.3, 0] },
      { range: [0.85, 0.96], offset: [-0.6, 0.3, -3.0] },
    ],
    calloutDir: 'up',
    calloutStem: 54,
    calloutAnchor: [-1.8, 0.65, -1.1],
    labelAppearAt: 0.76,
    roleTag: '空仓挂机与释放控制',
    description:
      '铰接于扳机主销左侧。当弹匣打空后，橙色托弹板左侧台阶将其内侧挑脚向上顶起，卡入套筒左侧缺口实现空仓挂机；换弹后下压外侧防滑拇指垫即可释放套筒复进。',
  },
  {
    id: 'magazine_catch',
    bomCode: 'F-05',
    nameZh: '弹匣卡榫与直簧',
    calloutLabel: '弹匣卡榫与直簧',
    nameEn: 'Magazine Catch & Wire Spring',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [0, 0, 0],
    explodeSteps: [{ range: [0.66, 0.78], offset: [-0.8, -0.3, 4.2] }],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [-2.4, -2.5, 0],
    labelAppearAt: 0.68,
    roleTag: '弹匣锁定与释放按钮',
    description:
      '横向安装在握把前上壁槽孔内，内部一字形弹簧钢丝嵌入卡榫凹槽提供横向回弹力，内侧凸齿卡入双排弹匣前右侧方孔固定弹匣。',
  },
  {
    id: 'trigger_pin',
    bomCode: 'F-06',
    nameZh: '扳机主销',
    calloutLabel: '扳机主承力销',
    nameEn: 'Trigger Pin',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, 0.15, 0],
    explodeSteps: [{ range: [0.65, 0.76], offset: [1.4, -0.1, -4.5] }],
    calloutDir: 'down',
    calloutStem: 64,
    calloutAnchor: [0, 0, 0],
    labelAppearAt: 0.67,
    roleTag: '扳机与挂机杆旋转主轴',
    description:
      '三根横向销钉中直径最粗的主承力销，表面车有两道环形定位凹槽，由空仓挂机杆扭簧卡入槽内防止射击震动退销。',
  },
  {
    id: 'locking_block_pin',
    bomCode: 'F-07',
    nameZh: '闭锁块前上销',
    calloutLabel: '闭锁块定位销',
    nameEn: 'Locking Block Pin',
    group: 'frame',
    material: 'stainless',
    assembledPos: [0.65, 0.58, 0],
    explodeSteps: [{ range: [0.65, 0.76], offset: [2.4, 0.3, -4.0] }],
    calloutDir: 'down',
    calloutStem: 74,
    calloutAnchor: [0, 0, 0],
    labelAppearAt: 0.67,
    roleTag: '闭锁块前部锚定销',
    description:
      '位于扳机主销前上方（经典 Gen3 三销钉特征），横向穿过机匣与金属闭锁块前孔，增强闭锁块抗抬升刚度；拆装时遵循“先拆最先装”原则以挂住挂机杆簧脚。',
  },
  {
    id: 'trigger_housing_pin',
    bomCode: 'F-08',
    nameZh: '扳机座尾销',
    calloutLabel: '扳机座固定尾销',
    nameEn: 'Trigger Mechanism Housing Pin',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-5.65, 0.1, 0],
    explodeSteps: [{ range: [0.65, 0.76], offset: [-2.8, 0, -4.0] }],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, 0, 0],
    labelAppearAt: 0.67,
    roleTag: '尾部扳机座固定销',
    description:
      '横穿握把上后部，将扳机座总成（含抛壳挺与阻铁片）牢牢锁定在下机匣尾腔内。',
  },

  // ============================================================================
  // 3. SAFE ACTION FIRE CONTROL GROUP (4 Nodes)
  // ============================================================================
  {
    id: 'trigger_with_bar',
    bomCode: 'T-01',
    nameZh: '双阶保险扳机与十字尾连杆',
    calloutLabel: '保险扳机与连杆',
    nameEn: 'Trigger with Safety Blade & Cruciform Bar',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.76, 0.86], offset: [0, 2.8, 0] },
      { range: [0.86, 1.0], offset: [1.2, 0.2, 1.4] },
    ],
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [-0.25, -1.55, 0.05],
    labelAppearAt: 0.78,
    roleTag: 'Safe Action 第一/三重保险枢纽',
    description:
      '集成两重被动保险：1) 扳机中央铰接保险片未按下时会卡住机匣底部阻止扳机后移；2) 冲压不锈钢连杆上方带顶开击针保险的鸟嘴凸起，尾端折弯成十字片（Cruciform），平时架在扳机座防跌落平台上（第三重跌落保险），扣到底时沿阻铁片斜面下沉释放击针。',
  },
  {
    id: 'trigger_housing',
    bomCode: 'T-02',
    nameZh: '扳机座壳体与抛壳挺',
    calloutLabel: '扳机座与抛壳挺',
    nameEn: 'Trigger Mechanism Housing with Ejector',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.76, 0.86], offset: [0, 2.8, 0] },
      { range: [0.86, 1.0], offset: [-4.8, 0.1, -1.2] },
    ],
    calloutDir: 'down',
    calloutStem: 68,
    calloutAnchor: [-5.4, -0.35, -0.2],
    labelAppearAt: 0.78,
    roleTag: '防跌落导轨台 / 固定式抛壳挺',
    description:
      '安装在握把后上腔的聚合物基座，内部设有承托扳机连杆十字尾的防跌落水平导槽；左上方嵌有向前伸出并微向内弯折的钢制抛壳挺（Ejector），套筒后坐时撞击弹壳底部将其从右侧抛壳窗踢出。',
  },
  {
    id: 'connector',
    bomCode: 'T-03',
    nameZh: '连杆阻铁片 (断路斜面片)',
    calloutLabel: 'L形连杆阻铁片',
    nameEn: 'Connector',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.76, 0.86], offset: [0, 2.8, 0] },
      { range: [0.86, 1.0], offset: [-2.4, 0.2, 3.0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [-5.3, 0.9, 0.75],
    labelAppearAt: 0.78,
    roleTag: '半自动断路与击发释放控制',
    description:
      '插在扳机座右侧槽内的 L 形冲压弹簧钢片。其右上角折弯斜面引导后移的扳机连杆向下潜入释放击针；套筒后坐时下沿凸棱将阻铁片向内推开实现半自动断路（Disconnector），确保每扣一次扳机只发射一发。',
  },
  {
    id: 'trigger_spring',
    bomCode: 'T-04',
    nameZh: '扳机复位拉簧',
    calloutLabel: '扳机复位拉簧',
    nameEn: 'Trigger Spring (Coil Tension)',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.76, 0.86], offset: [0, 2.8, 0] },
      { range: [0.86, 1.0], offset: [-0.2, 1.2, 0.2] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-5.7, 0.45, 0.12],
    labelAppearAt: 0.78,
    roleTag: '连杆上抬啮合与辅助拉动',
    description:
      '两端带 S 形挂钩的螺旋拉簧，前端勾住扳机连杆十字尾下垂孔，后端勾住扳机座尾臂，将扳机连杆尾部向上拉起使其可靠挂住击针挂机齿。',
  },

  // ============================================================================
  // 4. MAGAZINE ASSEMBLY (4 Nodes, oriented along -20° Grip Axis)
  // ============================================================================
  {
    id: 'mag_body',
    bomCode: 'M-01',
    nameZh: '双排单进弹匣体',
    calloutLabel: '双排弹匣壳体',
    nameEn: 'Double-Stack Magazine Body',
    group: 'magazine',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-5.26, -4.25, 0],
    assembledRot: [0, 0, GRIP_ANGLE_RAD],
    explodeSteps: [
      ...MAG_EXTRACT_STAGE1,
      { range: [0.5, 0.62], offset: [0.9, 0.9, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0.4, -3.2, 0],
    labelAppearAt: 0.08,
    roleTag: '钢衬聚合物双排供弹盒',
    description:
      '内层硬化钢胆外包高抗冲聚合物护套，顶部收拢为双排单进抱弹口（Feed Lips），前右侧开有弹匣卡榫锁孔，背面设有余弹观察孔标记。',
  },
  {
    id: 'mag_follower',
    bomCode: 'M-02',
    nameZh: '阶梯式托弹板',
    calloutLabel: '阶梯式托弹板',
    nameEn: 'Magazine Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [-4.25, -1.47, 0],
    assembledRot: [0, 0, GRIP_ANGLE_RAD],
    explodeSteps: [
      ...MAG_EXTRACT_STAGE1,
      { range: [0.52, 0.64], offset: [3.8, 1.4, 2.8] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, 0, 0],
    labelAppearAt: 0.5,
    roleTag: '双排错位托弹 / 触发空仓挂机',
    description:
      '高对比度橙色聚合物托弹板，顶部呈倾斜阶梯面使弹药交错双排排列；左侧前缘设有抬升凸台，最后一发打完后向上顶起空仓挂机杆内脚。',
  },
  {
    id: 'mag_spring',
    bomCode: 'M-03',
    nameZh: '矩形螺旋弹匣弹簧',
    calloutLabel: '矩形托弹簧',
    nameEn: 'Magazine Coil Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [-5.54, -5.03, 0],
    assembledRot: [0, 0, GRIP_ANGLE_RAD],
    explodeSteps: [
      ...MAG_EXTRACT_STAGE1,
      { range: [0.52, 0.64], offset: [-2.0, -1.6, 2.6] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [0, -2.2, 0],
    labelAppearAt: 0.52,
    roleTag: '持续向上供弹动力',
    description:
      '贴合弹匣内壁截面的大折角矩形螺旋弹簧，保证双排供弹柱在不同余弹量下均能稳定平顺地将下一发顶至抱弹口。',
  },
  {
    id: 'mag_base_plate',
    bomCode: 'M-04',
    nameZh: '弹匣底盖与锁止内衬片',
    calloutLabel: '弹匣底盖与锁片',
    nameEn: 'Magazine Floor Plate & Insert',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [-6.99, -8.99, 0],
    assembledRot: [0, 0, GRIP_ANGLE_RAD],
    explodeSteps: [
      ...MAG_EXTRACT_STAGE1,
      { range: [0.49, 0.55], offset: [2.8, 0.6, 0] },
      { range: [0.55, 0.65], offset: [2.6, 0.2, -2.0] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [0, 0, 0],
    labelAppearAt: 0.5,
    roleTag: '弹匣底部闭锁盖',
    description:
      '包含带中心锁止圆凸的内衬锁片（Floor Plate Insert）与外滑盖板；拆解弹匣时用冲子压入底盖中心圆孔解除凸起锁定，即可将底盖向前推脱。',
  },
];

export const FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'trigger_pull',
    stepNum: '01',
    shortLabel: '扣扳机解保险',
    title: '阶段 1 · 扣动扳机与三重保险逐级解除',
    range: [0.0, 0.18],
    description:
      '手指先压平扳机中央保险舌片（解除第一重保险），随后扳机连杆后移：连杆上方鸟嘴凸起将击针保险柱塞向上顶开（解除第二重保险），尾部十字片将半待击的击针继续向后拉至全待击满蓄能位置。',
  },
  {
    id: 'sear_release',
    stepNum: '02',
    shortLabel: '阻铁断路击发',
    title: '阶段 2 · 十字尾沿阻铁斜面下沉释放击针',
    range: [0.18, 0.25],
    description:
      '扳机连杆后移到底时，右侧凸耳受 L 形阻铁片（Connector）45° 斜面引导向下潜入，脱离防跌落平台（解除第三重保险）；十字尾下沉脱钩，击针在击针簧推动下高速前冲撞击弹底火。',
  },
  {
    id: 'projectile_exit',
    stepNum: '03',
    shortLabel: '燃气推弹出膛',
    title: '阶段 3 · 发射药燃爆膨胀与弹头出膛',
    range: [0.25, 0.36],
    description:
      '底火引燃发射药产生高压高温燃气，推动紫铜被甲弹头沿枪管膛线高速向前加速并冲出枪口，膛口形成锥形火药燃气羽流。',
  },
  {
    id: 'unlock_recoil',
    stepNum: '04',
    shortLabel: '枪管偏移开锁',
    title: '阶段 4 · 勃朗宁枪管下倾开锁与套筒后坐',
    range: [0.36, 0.54],
    description:
      '后坐冲量带动套筒与枪管共同短暂后退约 3mm 后，枪管下凸耳撞击机匣金属闭锁块斜面，迫使枪管尾端向下倾转脱离套筒抛壳窗完成开锁；套筒继续独立后坐到底并大幅压缩扁钢丝复进簧。',
  },
  {
    id: 'extract_eject',
    stepNum: '05',
    shortLabel: '抽壳撞挺抛壳',
    title: '阶段 5 · 抽壳钩拉壳与抛壳挺踢出空弹壳',
    range: [0.46, 0.72],
    description:
      '套筒后坐过程中，右侧抽壳钩紧紧勾住空黄铜弹壳底缘将其抽出弹膛；当弹壳左侧底部撞击扳机座上固定的钢制抛壳挺（Ejector）时，空弹壳向右侧上方抛壳窗翻滚抛出。',
  },
  {
    id: 'feed_lock',
    stepNum: '06',
    shortLabel: '复进推弹上膛',
    title: '阶段 6 · 弹匣托弹上升与复进推弹闭锁',
    range: [0.56, 0.86],
    description:
      '弹匣内下一发弹在托弹簧作用下上升至抱弹口；复进簧释放能量推套筒高速前冲，套筒下沿推新弹顺着枪管坡道（Feed Ramp）滑入弹膛，同时顶推枪管复原上抬重新卡入抛壳窗闭锁，击针挂入半待击位。',
  },
  {
    id: 'trigger_reset',
    stepNum: '07',
    shortLabel: '扳机断路复位',
    title: '阶段 7 · 松开扳机与半自动断路复位',
    range: [0.86, 1.0],
    description:
      '松开扳机后，扳机连杆前移，先前被套筒压向内侧断路的阻铁片向外弹回，将十字尾重新托举回击针挂机齿正前方（发出清脆复位声），击针保险柱塞回落闭锁，准备下一次击发。',
  },
];

export function computeFiringKinematics(
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

  // Master Slide Recoil Stroke (X delta: 0 -> -4.45 cm at f=0.54 -> 0 at f=0.855)
  const slideRecoilIn = seg(f, 0.315, 0.54);
  const slideReturn = seg(f, 0.57, 0.855);
  const slideDX = -4.45 * (slideRecoilIn - slideReturn);
  const slideTravel = -slideDX; // >= 0

  // True Browning Short-Recoil Two-Support Barrel Camming Law:
  // 1) Locked dwell for the first 3.0 mm (slideTravel <= 0.30 cm): barrel & slide move 1:1 with rz = 0.
  // 2) Over slideTravel in [0.30, 1.15] cm, locking-block 40° ramp cams chamber lug down -0.31 cm
  //    and arrests barrel rearward travel smoothly at -0.56 cm while front tube rides inside moving slide muzzle ring.
  const barrelTX =
    slideTravel <= 0.3
      ? slideDX
      : -0.3 - 0.26 * (1 - Math.exp(-(slideTravel - 0.3) / 0.26));
  const camLinear = clamp01((slideTravel - 0.3) / 0.82);
  const camSmooth = camLinear * camLinear * (3 - 2 * camLinear);

  // Rear support at locking block lug (x1 = 1.0, Yp = 2.55) drops -0.31 cm;
  // Front support at moving slide barrel ring (x2 = 10.45 + slideDX - barrelTX, Yp = 2.55) stays concentric (-0.02 cm)
  const xLug = 1.0;
  const yBore = 2.55;
  const xSlideRing = 10.45 + slideDX - barrelTX;
  const lugDrop = -0.31 * camSmooth;
  const ringDrop = -0.02 * camSmooth;
  const barrelRZ = Math.asin(
    Math.min(0.12, Math.max(0, (ringDrop - lugDrop) / (xSlideRing - xLug)))
  );

  // Safe Action Striker cycle:
  // Half-cock rest (0) -> Full-cock draw (-0.58) in [0.04, 0.18] -> Primer strike (+0.52) in [0.185, 0.22]
  // -> Primer rebound (+0.36) in [0.235, 0.29] -> Cruciform half-cock pickup (0) during slide return [0.72, 0.855]
  const strikerFullCock = seg(f, 0.04, 0.18);
  const strikerRelease = seg(f, 0.185, 0.22);
  const strikerRebound = seg(f, 0.235, 0.29);
  const strikerRecock = seg(f, 0.72, 0.855);
  const localStrikerX =
    -0.58 * strikerFullCock +
    1.1 * strikerRelease -
    0.16 * strikerRebound -
    0.36 * strikerRecock;

  const isSlideRigidChild =
    partId === 'slide' ||
    partId === 'front_sight' ||
    partId === 'rear_sight' ||
    partId === 'slide_cover_plate' ||
    partId === 'extractor' ||
    partId === 'extractor_plunger';

  if (isSlideRigidChild) {
    dx = slideDX;
    if (partId === 'extractor') {
      // Gen3 LCI tactile step protrudes subtly (+0.024 cm) while cartridge rim is chambered,
      // plus outward claw snap (+0.058 cm) as returning breech rides over next case rim
      const caseInChamber = 1 - seg(f, 0.45, 0.49) + seg(f, 0.8, 0.855);
      const rimSnap = Math.sin(linearSeg(f, 0.77, 0.85) * Math.PI);
      dz = 0.024 * clamp01(caseInChamber) + 0.058 * rimSnap;
    } else if (partId === 'extractor_plunger') {
      const rimSnap = Math.sin(linearSeg(f, 0.77, 0.85) * Math.PI);
      dx = slideDX - 0.04 * rimSnap;
    }
    return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
  }

  switch (partId) {
    case 'barrel': {
      // Exact rigid-body transform placing (xLug, yBore) at (xLug + barrelTX, yBore + lugDrop) with tilt barrelRZ
      const cosT = Math.cos(barrelRZ);
      const sinT = Math.sin(barrelRZ);
      dx = barrelTX + xLug * (1 - cosT) + yBore * sinT;
      dy = lugDrop - xLug * sinT + yBore * (1 - cosT);
      rz = barrelRZ;
      break;
    }

    case 'recoil_guide_rod': {
      // Rear flange stays seated in the barrel lug half-moon pocket while slide recoils over front shaft
      dx = barrelTX;
      dy = -0.04 * camSmooth;
      break;
    }

    case 'recoil_spring': {
      // Captured flat-wire spring spans X in [2.02, 10.62] (L0 = 8.60)
      const x0Orig = 2.02;
      const L0 = 8.6;
      const x0New = x0Orig + barrelTX;
      const x1New = 10.62 + slideDX;
      const LNew = Math.max(3.2, x1New - x0New);
      scaleX = LNew / L0;
      dx = x0New - x0Orig * scaleX;
      dy = -0.02 * camSmooth;
      break;
    }

    case 'striker': {
      dx = slideDX + localStrikerX;
      break;
    }

    case 'striker_spring': {
      // Striker spring spans X in [-5.85, -2.15] (L0 = 3.70)
      const x0Orig = -5.85;
      const L0 = 3.7;
      const x0New = x0Orig + slideDX;
      const x1New = -2.15 + slideDX + localStrikerX;
      const LNew = Math.max(1.75, x1New - x0New);
      scaleX = LNew / L0;
      dx = x0New - x0Orig * scaleX;
      break;
    }

    case 'firing_pin_safety': {
      // Lifted +0.28 cm in Y by trigger-bar shark-fin during pull, drops once slide clears shark-fin on recoil
      const liftUp = seg(f, 0.05, 0.16);
      const dropOnSlideMove = seg(f, 0.35, 0.43);
      dx = slideDX;
      dy = 0.28 * (liftUp - dropOnSlideMove);
      break;
    }

    case 'trigger_with_bar': {
      // Take-up & wall pull (-0.54 in X), connector ramp drop (-0.14 in Y at sear break) +
      // slide disconnector depression (-0.06 in Y during recoil), audible tactile click-up on trigger reset [0.87, 0.96]
      const pull = seg(f, 0.0, 0.18);
      const release = seg(f, 0.87, 0.955);
      const searDrop = seg(f, 0.168, 0.205);
      const disconnectDip = seg(f, 0.37, 0.44) - seg(f, 0.82, 0.87);
      const searReset = seg(f, 0.91, 0.965);
      dx = -0.54 * (pull - release);
      dy = -0.14 * (searDrop - searReset) - 0.06 * disconnectDip;
      break;
    }

    case 'connector': {
      // Cammed inward (-Z) when recoiling slide rail strikes upper disconnector lobe; snaps outward (+Z) at reset
      const disconnectIn = seg(f, 0.365, 0.44);
      const resetOut = seg(f, 0.9, 0.95);
      dz = -0.095 * (disconnectIn - resetOut);
      break;
    }

    case 'trigger_spring': {
      const pull = seg(f, 0.0, 0.18);
      const release = seg(f, 0.87, 0.955);
      dx = -0.27 * (pull - release);
      break;
    }

    case 'mag_follower': {
      // Upward feed pulse along +20° magazine axis when next cartridge rises to feed lips
      const feedRise = seg(f, 0.52, 0.62) - seg(f, 0.64, 0.78);
      dx = 0.14 * feedRise;
      dy = 0.38 * feedRise;
      break;
    }

    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes positions, rotations & effects for cartridges, bullet, shell ejection, and muzzle gas plume.
 */
export function computeBallisticsState(fRaw: number): BallisticsVisualState {
  const f = clamp01(fRaw);

  // Slide recoil helper matching computeFiringKinematics
  const slideRecoilIn = seg(f, 0.315, 0.54);
  const slideReturn = seg(f, 0.57, 0.855);
  const slideDX = -4.45 * (slideRecoilIn - slideReturn);

  // 1. Projectile: seated at [1.75, 2.55, 0] until f=0.24 -> accelerates down polygonal bore [0.24, 0.31] -> exits muzzle [0.31, 0.47]
  const bulletVisible = f < 0.47;
  let bulletX = 1.75;
  let streakLength = 0;

  if (f >= 0.24 && f < 0.31) {
    const u = Math.pow(linearSeg(f, 0.24, 0.31), 1.5);
    bulletX = 1.75 + 9.8 * u; // Reaches muzzle X = 11.55 at f = 0.31
    streakLength = 2.5 * u;
  } else if (f >= 0.31 && f < 0.47) {
    const u = linearSeg(f, 0.31, 0.47);
    bulletX = 11.55 + 32.0 * u;
    streakLength = 6.5 * (1 - u * 0.5);
  }

  // 2. Spent Brass Case:
  // [0, 0.315]: in chamber at [0.42, 2.55, 0]
  // [0.315, 0.47]: pulled back by extractor claw with slideDX (slight chamber cam-down dip)
  // [0.47, 0.76]: strikes #336 ejector blade at X ≈ -2.85 and launches out right-top ejection port!
  const spentCaseVisible = f < 0.76;
  let caseX = 0.42;
  let caseY = 2.55;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.315 && f < 0.47) {
    caseX = 0.42 + slideDX;
    const drop = Math.sin(linearSeg(f, 0.34, 0.45) * Math.PI) * -0.14;
    caseY = 2.55 + drop;
  } else if (f >= 0.47 && f < 0.76) {
    const u = linearSeg(f, 0.47, 0.76);
    const slideAtEject = -4.45 * seg(0.47, 0.315, 0.54);
    const baseAtEject = 0.42 + slideAtEject;
    caseX = baseAtEject - 4.2 * u;
    caseY = 2.55 + 6.8 * u - 8.5 * u * u;
    caseZ = 9.5 * u;
    caseRX = u * 8.5;
    caseRY = u * 12.0;
    caseRZ = -u * 10.5;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.76);
    }
  }

  // 3. Chamber Flash & Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.22 && f <= 0.32) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.22, 0.32) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.3 && f <= 0.39) {
    const u = linearSeg(f, 0.3, 0.39);
    muzzlePlumeScale = 0.35 + 1.25 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.82;
  }

  // 4. Next Cartridge in Magazine -> Stripped up Feed Ramp into Chamber [0.42, 2.55, 0]
  let nextX = -2.85;
  let nextY = 1.05;
  let nextRZ = 0.12;

  if (f >= 0.52 && f < 0.62) {
    const u = seg(f, 0.52, 0.62);
    nextX = -2.85 + 0.18 * u;
    nextY = 1.05 + 0.52 * u;
    nextRZ = 0.12 + 0.08 * u;
  } else if (f >= 0.62 && f < 0.855) {
    const u = seg(f, 0.62, 0.855);
    const rampArc = Math.sin(u * Math.PI) * 0.24;
    nextX = -2.67 + (0.42 - -2.67) * u;
    nextY = 1.57 + (2.55 - 1.57) * u + rampArc;
    nextRZ = 0.2 * (1 - u);
  } else if (f >= 0.855) {
    nextX = 0.42;
    nextY = 2.55;
    nextRZ = 0;
  }

  // 5. Reserve cartridge underneath in magazine
  const magFeedShift = seg(f, 0.52, 0.72);
  const resX = -3.22 + (-2.85 - -3.22) * magFeedShift;
  const resY = 0.05 + (1.05 - 0.05) * magFeedShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, 2.55, 0],
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
  };
}

export const G17_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  slide: {
    albedoFile: 'slide_albedo.webp',
    normalFile: 'slide_normal.webp',
    roughnessFile: 'slide_roughness.webp',
    normalScale: 0.65,
  },
  barrel: {
    albedoFile: 'barrel_albedo.webp',
    normalFile: 'barrel_normal.webp',
    roughnessFile: 'barrel_roughness.webp',
    normalScale: 0.58,
  },
  frame: {
    albedoFile: 'frame_albedo.webp',
    normalFile: 'frame_normal.webp',
    roughnessFile: 'frame_roughness.webp',
    normalScale: 0.42,
  },
  mag_body: {
    albedoFile: 'mag_albedo.webp',
    normalFile: 'mag_normal.webp',
    roughnessFile: 'mag_roughness.webp',
    normalScale: 0.72,
  },
};

export const G17_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'slide',
    weapon: 'g17',
    titleCn: '套筒 Tenifer 氮化钢贴图组',
    partTag: 'U-01 SLIDE',
    resolution: '2048 × 1024 px',
    summary:
      '参考真铁 Gen3 G17 实拍微距制作：还原 Tenifer 氮化磷化钢微晶颗粒、枪油暗云斑、套筒肩棱与枪口快拔银亮磨损、抛壳口后沿黄铜擦痕，以及双侧凹刻原厂铭文。',
    highlights: [
      '左侧凹刻 [G] 17 AUSTRIA 9×19',
      '右侧钢印检验盾徽 + KPV 892',
      '肩棱快拔银色露白与油膜粗糙度变化',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'slide_albedo.webp',
        note: 'sRGB · 氮化钢底色 / 刻字色差 / 棱边露白 / 黄铜擦痕',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'slide_normal.webp',
        note: 'Linear · 凹刻铭文深度斜坡 + CNC 横向拉丝微凹凸',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'slide_roughness.webp',
        note: 'Linear · 棱边抛光低粗糙度 vs 磷化亚光与油斑对比',
      },
    ],
  },
  {
    id: 'frame',
    weapon: 'g17',
    titleCn: '下机匣玻纤尼龙与 Gen3 防滑纹贴图组',
    partTag: 'F-01 RECEIVER',
    resolution: '1536 × 1536 px',
    summary:
      '还原玻纤增强尼龙 66 注塑模具 EDM 电火花皮纹、握把双侧 -20° 倾角 Gen3 粗颗粒金字塔防滑区、凹槽原厂徽标铭牌，以及导轨下方嵌入式不锈钢序列号牌。',
    highlights: [
      'EDM 注塑细皮纹 + Gen3 金字塔防滑凸点',
      '握把凹框浮雕 G17 / GEN 3 铭牌',
      '导轨底部 KPV 892 US 激光蚀刻钢牌',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'frame_albedo.webp',
        note: 'sRGB · 深炭黑尼龙 / 握把防滑深色嵌块 / 不锈钢导轨与铭牌',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'frame_normal.webp',
        note: 'Linear · 高频金字塔防滑颗粒凸起 + 浮雕铭牌边缘',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'frame_roughness.webp',
        note: 'Linear · 防滑区高漫反射哑光 vs 手握处微油脂光泽',
      },
    ],
  },
  {
    id: 'barrel',
    weapon: 'g17',
    titleCn: '冷锻多边形枪管与闭锁节套贴图组',
    partTag: 'U-04 BARREL',
    resolution: '1024 × 1024 px',
    summary:
      '针对抛壳窗外露区域与分解态定制：节套右侧雕刻 9×19 口径与 KPV 892 序列号，节套顶面带有开闭锁纵向摩擦亮带，管身前段还原标志性的环形咬合磨损纹 (Glock Smile)。',
    highlights: [
      '抛壳窗可见 9×19 + 检验徽 + KPV 892',
      '管身前段环形摩擦亮圈 (Glock Smile)',
      '高光镜面抛光供弹坡与枪口冠面色块',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'barrel_albedo.webp',
        note: 'sRGB · 碳氮共渗钢色 / 环形磨白亮圈 / 镜面供弹坡',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'barrel_normal.webp',
        note: 'Linear · 车削环纹细节 + 弹膛右侧深压钢印法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'barrel_roughness.webp',
        note: 'Linear · 摩擦咬合圈与供弹坡呈低粗糙度镜面反射',
      },
    ],
  },
  {
    id: 'mag',
    weapon: 'g17',
    titleCn: '双排弹匣壳体与余弹刻度贴图组',
    partTag: 'M-01 MAGAZINE',
    resolution: '1024 × 1024 px',
    summary:
      '对应弹匣背面 6 个交错余弹观察孔精准排布 4 / 6 / 8 / 10 / 12 / 17 发刻度与 9mm 标识，右侧压印 [G] 9×19 徽标，并包含插拔纵向擦痕与顶部不锈钢内衬色块。',
    highlights: [
      '背面 4..17 发观察孔对齐数字钢印',
      '右侧压印原厂 [G] 9×19 标识',
      '弹匣井反复插拔纵向轻微擦痕',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'mag_albedo.webp',
        note: 'sRGB · 聚合物壳体 / 余弹数字刻字 / 钢制抱弹口色块',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'mag_normal.webp',
        note: 'Linear · 数字压痕凹陷 + 聚合物注塑微颗粒法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'mag_roughness.webp',
        note: 'Linear · 插拔摩擦滑道光泽变化与钢制内衬对比',
      },
    ],
  },
  {
    id: 'detail',
    weapon: 'g17',
    titleCn: '内部精密机加工金属与注塑件无缝细节贴图',
    partTag: '24 INTERNAL PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为击针、抽壳钩、扳机连杆、闭锁块、复进簧组件及聚合物内件提供可无缝平铺 (Repeat Wrapping) 的微米级 CNC 金属拉丝法线与注塑皮纹粗糙度贴图。',
    highlights: [
      '精密冲压/铣削金属拉丝无缝法线',
      '注塑工程塑料皮纹无缝法线与粗糙度',
      '覆盖其余全部 24 个火控与套筒内件',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于击针/连杆/抽壳钩/闭锁块等金属内件',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 金属微表面各向异性光泽起伏',
      },
      {
        kind: 'Normal',
        labelCn: '工程塑料皮纹法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于扳机护圈内件/背板/底盖/托弹板等',
      },
    ],
  },
];

export const G17_PLUGIN: WeaponRuntimePlugin = {
  id: 'g17',
  partGroups: PART_GROUPS,
  timelinePresets: TIMELINE_PRESETS,
  parts: G17_PARTS,
  firingPhases: FIRING_PHASES,
  getActiveFiringPhase: (f: number) => findActiveFiringPhase(FIRING_PHASES, f),
  computeFiringKinematics,
  computeBallisticsState: (f: number) =>
    toExtendedBallistics(computeBallisticsState(f)),
  pbrBindings: G17_PBR_BINDINGS,
  pbrSuites: G17_PBR_SUITES,
};
