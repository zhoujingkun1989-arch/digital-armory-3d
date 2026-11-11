export type PartGroupKey = 'slide' | 'frame' | 'fire_control' | 'magazine';

export type MaterialKind =
  | 'nitride_steel'
  | 'barrel_steel'
  | 'stainless'
  | 'polymer_frame'
  | 'spring_steel'
  | 'follower_orange'
  | 'copper_accent';

export interface KeyframeStep {
  /** Normalized timeline interval [start, end] within [0, 1] */
  range: [number, number];
  /** Incremental world-space translation delta (X=+Forward, Y=+Up, Z=+RightSide) */
  offset: [number, number, number];
  /** Optional incremental Euler rotation delta in radians */
  rotation?: [number, number, number];
}

export interface G17PartSpec {
  id: string;
  bomCode: string;
  nameZh: string;
  /** Concise editorial label shown at the tip of the architectural hairline leader */
  calloutLabel: string;
  nameEn: string;
  group: PartGroupKey;
  material: MaterialKind;
  /** Whether this outer housing becomes translucent when X-Ray mode is active */
  isShell?: boolean;
  /** Base assembled position in world units (1 unit ≈ 1 cm) */
  assembledPos: [number, number, number];
  /** Base assembled Euler rotation [rx, ry, rz] in radians */
  assembledRot?: [number, number, number];
  /** Multi-stage anti-clipping disassembly trajectory */
  explodeSteps: KeyframeStep[];
  /** Vertical hairline callout direction ('up' | 'down') */
  calloutDir: 'up' | 'down';
  /** Base vertical hairline stem length in screen pixels */
  calloutStem: number;
  /** Optional custom 3D local anchor point on the component surface */
  calloutAnchor?: [number, number, number];
  /** Disassembly progress threshold [0..1] after which this component's callout emerges */
  labelAppearAt: number;
  /** Short functional tag */
  roleTag: string;
  /** Detailed mechanical principle & mating relationship */
  description: string;
}

export interface GroupMeta {
  key: PartGroupKey;
  nameZh: string;
  nameEn: string;
  badgeColor: string;
}

export const PART_GROUPS: GroupMeta[] = [
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
  { range: [0.22, 0.30], offset: [0, 2.0, 0] },
];

const SLIDE_GROUP_LIFT2: KeyframeStep = {
  range: [0.68, 0.82],
  offset: [0, 2.0, 0],
};

const MAG_EXTRACT_STAGE1: KeyframeStep[] = [
  { range: [0.0, 0.08], offset: [-3.1, -8.5, 0] },
  { range: [0.08, 0.15], offset: [2.6, 2.2, 0] },
];

export const G17_PARTS: G17PartSpec[] = [
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
      { range: [0.22, 0.30], offset: [0.4, -1.1, 0] },
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
      { range: [0.20, 0.30], offset: [-0.2, -3.0, 0] },
      { range: [0.48, 0.60], offset: [5.0, 0, 0] },
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
      { range: [0.20, 0.30], offset: [-0.2, -3.0, 0] },
      { range: [0.48, 0.60], offset: [-3.2, 0, 0] },
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
      { range: [0.30, 0.36], offset: [0, -2.1, 0] },
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
      { range: [0.35, 0.50], offset: [-15.0, 0, 0] },
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
      { range: [0.50, 0.62], offset: [0.9, 0.9, 0] },
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
    assembledPos: [-3.93, -0.58, 0],
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
    assembledPos: [-5.41, -4.67, 0],
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

function smoothstep01(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

/**
 * Computes the target world position and Euler rotation for a part at normalized progress t ∈ [0, 1].
 */
export function computePartTransform(
  part: G17PartSpec,
  t: number
): {
  position: [number, number, number];
  rotation: [number, number, number];
} {
  let px = part.assembledPos[0];
  let py = part.assembledPos[1];
  let pz = part.assembledPos[2];

  const baseRot = part.assembledRot ?? [0, 0, 0];
  let rx = baseRot[0];
  let ry = baseRot[1];
  let rz = baseRot[2];

  for (const step of part.explodeSteps) {
    const [start, end] = step.range;
    if (t <= start) continue;
    const raw = end > start ? (t - start) / (end - start) : 1;
    const w = smoothstep01(raw);
    px += step.offset[0] * w;
    py += step.offset[1] * w;
    pz += step.offset[2] * w;
    if (step.rotation) {
      rx += step.rotation[0] * w;
      ry += step.rotation[1] * w;
      rz += step.rotation[2] * w;
    }
  }

  return {
    position: [px, py, pz],
    rotation: [rx, ry, rz],
  };
}
