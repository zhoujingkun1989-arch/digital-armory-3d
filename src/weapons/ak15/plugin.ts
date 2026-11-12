import {
  clamp01,
  findActiveFiringPhase,
  linearSeg,
  seg,
  smoothstep01,
} from '../../engine/kinematics/math';
import type {
  AssemblyGroupMeta,
  ExtendedBallisticsState,
  FiringPhaseInfo,
  KeyframeStep,
  PartKinematicDelta,
  PbrBindingSpec,
  PbrSuiteItem,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';

export const AK15_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '长行程活塞枪机与上盖导气组',
    nameEn: 'Long-Stroke Piston Bolt & Top Cover Group',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: '冲压机匣、冷锻枪管与战术枪托护木',
    nameEn: 'Stamped Receiver, CHF Barrel & Furniture',
    badgeColor: '#7c3aed',
  },
  {
    key: 'fire_control',
    nameZh: '回转击锤火控与双侧快慢机组',
    nameEn: 'Hammer-Fired FCG & Ambi Selector',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '7.62×39mm 观察窗弧形弹匣组',
    nameEn: '30-Rd 7.62×39mm Windowed Magazine',
    badgeColor: '#e11d48',
  },
];

export const AK15_TIMELINE_PRESETS = [
  {
    id: 'assembled',
    label: '合拢态',
    subLabel: '0%',
    t: 0.0,
    desc: 'AK-15M1 (2023定型版) 全枪闭合状态，可开启 X-Ray 透视检视双突笋回转闭锁与击锤待击状态',
  },
  {
    id: 'field_strip',
    label: '野战一级快拆',
    subLabel: '30%',
    t: 0.3,
    desc: '标准俄军野战快拆：卸下 7.62 弯弹匣、拔销掀开导轨机匣盖、取出伸缩复进簧与长行程活塞枪机框组',
  },
  {
    id: 'upper_mag_strip',
    label: '枪机/护木/弹匣细拆',
    subLabel: '65%',
    t: 0.65,
    desc: '旋转抽出双突笋枪机与浮动击针、拆下浮置隔热上下护木与导气管，并分解观察窗弧形弹匣',
  },
  {
    id: 'full_explode',
    label: '全枪 26 节点爆炸图',
    subLabel: '100%',
    t: 1.0,
    desc: '完整展开冷锻镀铬枪管、90°导气箍准星座、EVO 折叠贴腮枪托及回转击锤双侧快慢机火控组',
  },
] as const;

// Shared stage-1 carrier group extraction (slides back out of receiver rails, then lifts cleanly into upper sky)
const CARRIER_STAGE1: KeyframeStep[] = [
  { range: [0.16, 0.23], offset: [-5.6, 0.4, 0] },
  { range: [0.23, 0.3], offset: [-1.4, 5.2, 0] },
];

// Shared stage-1 magazine forward-rock extraction
const AK_MAG_STAGE1: KeyframeStep[] = [
  {
    range: [0.02, 0.1],
    offset: [2.2, -5.8, 0],
    rotation: [0, 0, 0.12],
  },
];

export const AK15_PARTS: WeaponPartSpec[] = [
  // ==================== 1. PISTON BOLT, RECOIL & TOP GAS/COVER GROUP ('slide' · 10 parts) ====================
  {
    id: 'ak_dust_cover',
    bomCode: 'B-01',
    nameZh: '全通皮卡汀尼导轨冲压机匣盖',
    calloutLabel: '导轨冲压机匣盖',
    nameEn: 'Railed Stamped Receiver Top Cover (2023 Lock)',
    group: 'slide',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-0.1, 2.22, 0],
    explodeSteps: [
      { range: [0.07, 0.16], offset: [-0.6, 8.2, 0] },
      { range: [0.66, 0.86], offset: [-0.8, 3.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 34,
    calloutAnchor: [-0.8, 0.78, 0],
    labelAppearAt: 0.0,
    roleTag: '光学瞄具归零基座 / 机匣防尘密封',
    description:
      '2023 定型版改进型高刚度冲压钢防尘盖，顶部铆接全通 MIL-STD-1913 皮卡汀尼导轨，前端铰接咬合前节套、后端采用横插闭锁销消除晃动，确保串联安装红点/热成像瞄具重复拆装保持归零。',
  },
  {
    id: 'ak_rear_sight',
    bomCode: 'B-02',
    nameZh: '2023 全天候翻转双觇孔照门',
    calloutLabel: '全天候双觇孔照门',
    nameEn: 'Model 2023 Flip-Aperture Diopter Rear Sight',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-4.65, 3.32, 0],
    explodeSteps: [
      { range: [0.07, 0.16], offset: [-0.6, 8.2, 0] },
      { range: [0.66, 0.9], offset: [-3.6, 5.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 36,
    calloutAnchor: [0, 0.42, 0],
    labelAppearAt: 0.0,
    roleTag: '后置长瞄准基线 / 日夜双孔径切换',
    description:
      '针对实战反馈于 2023 版全面重构的后置觇孔机械照门：移除早期复杂鼓轮，改为紧凑耐冲击翻转式大/小双孔径觇孔（兼顾昏暗雨雾视野与中远距离精确射击），大幅延长机械瞄准基线。',
  },
  {
    id: 'ak_bolt_carrier',
    bomCode: 'B-03',
    nameZh: '枪机框与长行程导气活塞一体件',
    calloutLabel: '枪机框与长行程活塞',
    nameEn: 'Bolt Carrier with Integrated Long-Stroke Gas Piston',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [1.6, 1.55, 0],
    explodeSteps: [
      ...CARRIER_STAGE1,
      { range: [0.32, 0.52], offset: [0.6, 0.8, 0] },
      { range: [0.66, 0.88], offset: [0.4, 1.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [4.5, 0.85, 0],
    labelAppearAt: 0.16,
    roleTag: '核心自动机主动件 / 螺旋凸轮开闭锁驱动',
    description:
      '卡拉什尼科夫自动步枪最核心的动力心脏：前端连接带三道闭气环的镀铬不锈钢长行程导气活塞，后段机框内部铣有精密螺旋导槽，后坐时先行走约 7mm 自由行程泄压，再强制旋转双突笋枪机完成可靠开锁与抽抛壳。',
  },
  {
    id: 'ak_bolt',
    bomCode: 'B-04',
    nameZh: '双突笋回转闭锁枪机头',
    calloutLabel: '双突笋回转枪机',
    nameEn: '2-Lug Rotating Bolt Head',
    group: 'slide',
    material: 'stainless',
    assembledPos: [2.85, 1.05, 0],
    explodeSteps: [
      ...CARRIER_STAGE1,
      {
        range: [0.32, 0.52],
        offset: [7.6, -1.6, 0],
        rotation: [0.62, 0, 0],
      },
      { range: [0.66, 0.88], offset: [1.2, 0.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 34,
    calloutAnchor: [0.4, 0.35, 0],
    labelAppearAt: 0.3,
    roleTag: '弹膛刚性回转闭锁 / 推弹闭锁核心',
    description:
      '前端对称布置左右两枚粗壮闭锁突笋，主凸耳嵌入枪机框螺旋曲线槽内；推弹到位后绕枪管轴线逆时针旋转约 35° 卡入前节套闭锁支承面，承受 7.62×39mm 高膛压冲击。',
  },
  {
    id: 'ak_firing_pin',
    bomCode: 'B-05',
    nameZh: '枪机浮动式长击针',
    calloutLabel: '浮动式长击针',
    nameEn: 'Free-Floating Fluted Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [2.68, 1.05, 0],
    explodeSteps: [
      ...CARRIER_STAGE1,
      { range: [0.36, 0.56], offset: [3.2, -1.9, 0] },
      { range: [0.66, 0.88], offset: [0.2, 0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [-0.4, 0.12, 0],
    labelAppearAt: 0.36,
    roleTag: '传递击锤冲击能量 / 刺破底火',
    description:
      '贯穿于回转枪机轴心通孔内并由横向限位销约束行程；采用无击针簧浮动轻量化设计，唯有枪机完全旋转闭锁到位后，击锤方能正面敲击击针尾端引燃底火，物理杜绝不闭锁早发火。',
  },
  {
    id: 'ak_extractor',
    bomCode: 'B-06',
    nameZh: '重型爪式抽壳钩与压簧',
    calloutLabel: '爪式抽壳钩组件',
    nameEn: 'Heavy Claw Extractor & Spring',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [4.0, 1.08, 0.34],
    explodeSteps: [
      ...CARRIER_STAGE1,
      { range: [0.36, 0.56], offset: [10.4, -1.6, 0.6] },
      { range: [0.66, 0.88], offset: [2.0, 0.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 56,
    calloutAnchor: [0, 0.15, 0],
    labelAppearAt: 0.38,
    roleTag: '强力咬合 7.62 锥形弹壳底缘抽壳',
    description:
      '铰接于枪机头右侧凹槽内的宽大钩爪，配合高劲度抽壳钩簧紧紧扣住 7.62×39mm 弹壳底槽；即便在泥沙结冰或涂漆钢壳膨胀工况下也能可靠将空弹壳拉出弹膛。',
  },
  {
    id: 'ak_recoil_guide',
    bomCode: 'B-07',
    nameZh: '双套管伸缩复进簧导杆与缓冲座',
    calloutLabel: '伸缩复进簧导杆',
    nameEn: 'Telescoping Dual-Tube Recoil Guide & Buffer',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-2.1, 1.85, 0],
    explodeSteps: [
      { range: [0.12, 0.22], offset: [-10.8, 4.2, 0] },
      { range: [0.34, 0.54], offset: [-3.2, 0.8, 0] },
      { range: [0.66, 0.88], offset: [-2.4, 1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [-1.2, 0.25, 0],
    labelAppearAt: 0.14,
    roleTag: '复进簧导向防屈曲 / 后坐终端缓冲',
    description:
      '前后两节钢制套管相互伸缩导向，尾端卡笋嵌入后节套燕尾槽并兼作防尘盖后端支撑座；2023 版增设聚合物减震止动垫，降低枪机框后坐撞击尾端震动。',
  },
  {
    id: 'ak_recoil_spring',
    bomCode: 'B-08',
    nameZh: '多股绞合高寿命螺旋复进簧',
    calloutLabel: '多股螺旋复进簧',
    nameEn: 'Braided Helical Recoil Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [0, 1.85, 0],
    explodeSteps: [
      { range: [0.12, 0.22], offset: [-10.8, 4.2, 0] },
      { range: [0.34, 0.56], offset: [2.8, 1.2, 0] },
      { range: [0.66, 0.88], offset: [-1.2, 1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 56,
    calloutAnchor: [-0.8, 0.32, 0],
    labelAppearAt: 0.34,
    roleTag: '吸收枪机框后坐动能 / 驱动复进推弹',
    description:
      '套装于伸缩导杆并伸入枪机框背部盲孔内，储存长行程活塞后坐冲量，回程时驱动枪机框高速前冲完成推弹上膛与枪机回转闭锁。',
  },
  {
    id: 'ak_upper_handguard',
    bomCode: 'B-09',
    nameZh: '皮卡汀尼导轨隔热上护木罩',
    calloutLabel: '导轨隔热上护木',
    nameEn: 'Railed Polymer Upper Handguard Heatshield',
    group: 'slide',
    material: 'polymer_frame',
    assembledPos: [10.55, 2.38, 0],
    explodeSteps: [
      { range: [0.34, 0.54], offset: [5.2, 6.2, 0] },
      { range: [0.66, 0.88], offset: [2.4, 2.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 34,
    calloutAnchor: [0, 0.62, 0],
    labelAppearAt: 0.0,
    roleTag: '导气管隔热防护 / 前置战术附件导轨',
    description:
      '与机匣盖顶部导轨齐平衔接的耐高温玻纤聚酰胺上护木，不直接压迫枪管，既防止连发高温导气管烫伤弱手，又可稳固加装激光指示器与战术灯开关。',
  },
  {
    id: 'ak_gas_tube',
    bomCode: 'B-10',
    nameZh: '加强肋钢制导气管与前清理堵头',
    calloutLabel: '导气管与清理塞',
    nameEn: 'Fluted Steel Gas Tube & Cleanout Plug',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [10.8, 2.35, 0],
    explodeSteps: [
      { range: [0.38, 0.58], offset: [7.6, 3.0, 0] },
      { range: [0.66, 0.88], offset: [3.2, 1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0.8, 0.42, 0],
    labelAppearAt: 0.38,
    roleTag: '长行程活塞导向管 / 固定浮置护木基轴',
    description:
      '在 AK-15/AK-12 架构中采用刚性焊接/销定于前节套的厚壁导气管，兼具引导长行程活塞往复运动与承托浮置式上下护木的双重结构功能，前端设有旋拧式清积碳堵头。',
  },

  // ==================== 2. STAMPED RECEIVER, BARREL & EVO FURNITURE ('frame' · 8 parts) ====================
  {
    id: 'ak_receiver',
    bomCode: 'R-01',
    nameZh: '1.5mm 冲压钢下机匣与前后铆接节套',
    calloutLabel: '冲压钢机匣与节套',
    nameEn: 'Stamped Steel Receiver with Front & Rear Trunnions',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 86,
    calloutAnchor: [1.4, -0.82, 0],
    labelAppearAt: 0.0,
    roleTag: '全枪主承力基准壳体 / 导轨与抛壳挺载体',
    description:
      '采用 1.5mm 合金钢板冲压折弯并经磷化烤漆处理，两侧压有标志性弹匣井定位加强凹坑；前部重型六铆钉锻造前节套承担枪管压装与双突笋枪机闭锁载荷，内侧左导轨集成固定钢制抛壳挺。',
  },
  {
    id: 'ak_barrel',
    bomCode: 'R-02',
    nameZh: '415mm 冷锻内膛镀铬 7.62mm 枪管',
    calloutLabel: '415mm冷锻镀铬枪管',
    nameEn: '415mm Cold-Hammer-Forged Chrome-Lined Barrel',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [0, 1.05, 0],
    explodeSteps: [{ range: [0.68, 0.92], offset: [6.8, -0.4, 0] }],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [19.8, -0.35, 0],
    labelAppearAt: 0.0,
    roleTag: '赋予 7.62×39mm 弹头初速与四条右旋膛线自转',
    description:
      '采用精密旋转冷精锻成形，弹膛与四条右旋膛线全表面镀硬铬，抗烧蚀寿命极高；中前段钻有斜向导气孔通往 90° 导气箍，浮置式护木设计显著提升了中远距离连发散布精度。',
  },
  {
    id: 'ak_muzzle_device',
    bomCode: 'R-03',
    nameZh: '2023 固定槽式消焰补偿器(快拆消音接口)',
    calloutLabel: '槽式消焰器(快拆口)',
    nameEn: 'Model 2023 Slotted Birdcage Flash Suppressor (QD Mount)',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [24.2, 1.05, 0],
    explodeSteps: [
      { range: [0.36, 0.56], offset: [5.4, 0, 0] },
      { range: [0.68, 0.92], offset: [5.8, -0.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 36,
    calloutAnchor: [0.2, 0.48, 0],
    labelAppearAt: 0.0,
    roleTag: '抑制夜间枪口火光 / 套筒式快拆消音器底座',
    description:
      '2023 定型版重大实战改进：取消早期易积碳卡死的快拆制退器，改为销钉固定式五槽鸟笼消焰器，外周车削专用快拆闭锁环槽，士兵可直接将战术消音器套在消焰器外一秒旋紧锁定。',
  },
  {
    id: 'ak_gas_block',
    bomCode: 'R-04',
    nameZh: '90° 垂直导气箍兼护翼准星座',
    calloutLabel: '90°导气箍兼准星座',
    nameEn: '90° Gas Block & Hooded Front Sight Combo',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [16.7, 1.05, 0],
    explodeSteps: [{ range: [0.7, 0.94], offset: [9.4, 1.6, 0] }],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, 2.35, 0],
    labelAppearAt: 0.0,
    roleTag: '引出高压火药燃气冲击活塞 / 前机械准星',
    description:
      '将传统前移准星座后撤与 90° 垂直导气箍合二为一：既减少了枪管前端附加集中质量以改善谐振精度，又保护可调高低柱状准星，内部气室将膛内高压燃气平顺导向长行程活塞头。',
  },
  {
    id: 'ak_lower_handguard',
    bomCode: 'R-05',
    nameZh: '浮置耐热加强导轨下护木',
    calloutLabel: '浮置耐热导轨下护木',
    nameEn: 'Reinforced Free-Float Polymer Lower Handguard',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [10.75, 0.82, 0],
    explodeSteps: [
      { range: [0.34, 0.54], offset: [4.0, -4.4, 0] },
      { range: [0.68, 0.9], offset: [1.8, -1.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [0.4, -0.85, 0],
    labelAppearAt: 0.0,
    roleTag: '悬臂浮置不触碰枪管 / 底部握把与两脚架导轨',
    description:
      '后部嵌装于机匣前延伸端、前部悬挂于固定导气管而不与枪管发生接触，实现真正意义上的枪管自由浮置；2023 版加厚了侧壁散热筋与铝制隔热屏，彻底解决持续连发软化变形问题。',
  },
  {
    id: 'ak_buttstock',
    bomCode: 'R-06',
    nameZh: '2023 EVO 侧折叠多段伸缩战术枪托',
    calloutLabel: 'EVO折叠伸缩枪托',
    nameEn: 'Model 2023 EVO Folding & Telescoping Buttstock',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-12.35, 0.45, 0],
    explodeSteps: [{ range: [0.66, 0.92], offset: [-7.2, -0.8, 0] }],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [-1.2, -1.85, 0],
    labelAppearAt: 0.0,
    roleTag: '与枪管同轴直托抵肩 / 左侧 180° 折叠携行',
    description:
      '采用与枪管轴线高度重合的直托工程设计，显著减小 7.62×39mm 连发枪口上跳力矩；支持多档长度伸缩、左侧折叠锁止以及防滑橡胶缓冲托底板（内藏通条附件盒）。',
  },
  {
    id: 'ak_cheek_riser',
    bomCode: 'R-07',
    nameZh: 'EVO 高低可调光学瞄具贴腮板',
    calloutLabel: '高低可调贴腮板',
    nameEn: 'Adjustable Optic Cheek Riser',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-11.8, 1.62, 0],
    explodeSteps: [{ range: [0.68, 0.94], offset: [-7.2, 4.2, 0] }],
    calloutDir: 'up',
    calloutStem: 36,
    calloutAnchor: [0, 0.35, 0],
    labelAppearAt: 0.68,
    roleTag: '抬高贴腮高度对齐高倍率瞄准镜/热成像光轴',
    description:
      '2023 定型版标志性人机工程升级：骑跨卡扣于 EVO 枪托脊背上，可快速向上抬升锁定，使射手在使用高基线白光瞄准镜或夜视热成像仪时获得稳固舒适的下颌贴腮支撑。',
  },
  {
    id: 'ak_pistol_grip',
    bomCode: 'R-08',
    nameZh: '一体式人体工学防滑握把与扳机护圈',
    calloutLabel: '一体握把与护圈',
    nameEn: 'Monolithic Ergonomic Pistol Grip & Trigger Guard',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-3.2, -0.88, 0],
    explodeSteps: [{ range: [0.68, 0.92], offset: [-5.8, -5.6, 0] }],
    calloutDir: 'down',
    calloutStem: 36,
    calloutAnchor: [-2.4, -4.6, 0],
    labelAppearAt: 0.0,
    roleTag: '指槽防滑握持 / 加大戴手套扳机护圈与弹匣卡笋',
    description:
      '2023 版将手枪握把与加宽扳机护圈整合为高强玻纤聚酰胺一体模压件，消除传统钢制护圈硌手棱角；握把内部设有密封油壶/电池储物仓，前端集成加长杠杆式弹匣快拆卡笋。',
  },

  // ==================== 3. HAMMER-FIRED FCG & 2023 AMBI SELECTOR ('fire_control' · 4 parts) ====================
  {
    id: 'ak_hammer',
    bomCode: 'FC-01',
    nameZh: '回转式重型击锤与多股双翼扭簧',
    calloutLabel: '回转击锤与双扭簧',
    nameEn: 'Rotary Hammer & Braided Dual-Leg Torsion Spring',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-0.35, -0.05, 0],
    explodeSteps: [{ range: [0.7, 0.94], offset: [-1.2, 3.8, 0] }],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-0.2, 0.85, 0],
    labelAppearAt: 0.7,
    roleTag: '蓄能回转打击击针 / 多股钢丝扭簧终身免断',
    description:
      '沿用卡拉什尼科夫极高可靠性的回转击锤与三股绞合琴钢丝双翼主扭簧：枪机框后坐将其压倒待击，扣动扳机后绕横轴强力前旋敲击击针，即便单股钢丝受损仍可正常击发。',
  },
  {
    id: 'ak_trigger',
    bomCode: 'FC-02',
    nameZh: '双钩弧形扳机与主阻铁一体件',
    calloutLabel: '双钩扳机与主阻铁',
    nameEn: 'Curved Trigger & Double-Hook Primary Sear',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-2.15, -0.35, 0],
    explodeSteps: [{ range: [0.7, 0.94], offset: [-1.6, -4.6, 0] }],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0.1, -1.2, 0],
    labelAppearAt: 0.7,
    roleTag: '待击挂住击锤 / 扣动解脱击发',
    description:
      '锻造一体成型的弧形扳机舌与前双阻铁爪：待击时前爪稳稳扣住击锤下部待击缺口，扣动扳机时前爪下沉释放击锤前旋击发，双钩冗余设计消除了扳机横向偏摆与走火隐患。',
  },
  {
    id: 'ak_disconnector',
    bomCode: 'FC-03',
    nameZh: '中央单发阻铁与复位压簧',
    calloutLabel: '中央单发阻铁',
    nameEn: 'Semi-Auto Disconnector & Spring',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-2.35, -0.15, 0],
    explodeSteps: [{ range: [0.72, 0.96], offset: [-3.8, -3.6, -0.5] }],
    calloutDir: 'down',
    calloutStem: 56,
    calloutAnchor: [0, 0.35, 0],
    labelAppearAt: 0.72,
    roleTag: '半自动射击中途拦截击锤 / 松扳机交接复位',
    description:
      '夹装于双钩扳机中央槽内：单发模式（ОД）下若射手扣住扳机不放，枪机框后坐压倒击锤时由单发阻铁后钩先行捕获击锤防止连发；待松开扳机时再将击锤平顺交接回前主阻铁。',
  },
  {
    id: 'ak_selector',
    bomCode: 'FC-04',
    nameZh: '2023 双侧联动拇指快慢机组件 (ПР/АВ/ОД)',
    calloutLabel: '双侧拇指快慢机',
    nameEn: 'Model 2023 Ambidextrous Fire Selector (Safe/Auto/Semi)',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-3.85, 0.35, 0],
    explodeSteps: [{ range: [0.7, 0.95], offset: [-4.6, 2.2, 1.8] }],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [1.6, 0.25, 0.85],
    labelAppearAt: 0.7,
    roleTag: '取消双发点射 / 左右手拇指免离握把切换保险-连-单',
    description:
      '2023 定型版核心火控升级：彻底取消实战中故障率较高的两发点射棘轮，回归纯粹可靠的「保险 ПР - 全自动 АВ - 半自动 ОД」三档，并新增贯穿机匣轴的左右双侧大拇指拨杆，射手手不离握把即可单指拨动。',
  },

  // ==================== 4. 30-RD 7.62×39mm WINDOWED CURVED MAGAZINE ('magazine' · 4 parts) ====================
  {
    id: 'ak_mag_body',
    bomCode: 'M-01',
    nameZh: '30发 7.62×39mm 透明观察窗弧形弹匣体',
    calloutLabel: '30发观察窗弧形弹匣',
    nameEn: '30-Rd 7.62×39mm Windowed Curved Polymer Magazine',
    group: 'magazine',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [2.55, -0.55, 0],
    explodeSteps: [
      ...AK_MAG_STAGE1,
      { range: [0.34, 0.54], offset: [0.4, -0.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 34,
    calloutAnchor: [2.6, -7.8, 0],
    labelAppearAt: 0.0,
    roleTag: '大弧度容纳 7.62×39mm 锥形弹 / 可视化余弹观察',
    description:
      '因 7.62×39mm M43 步枪弹壳锥度较大而呈标志性的前倾大弯弧（“香蕉弹匣”），采用高抗冲玻纤聚酰胺制造，前后埋入钢制挂齿与抱弹口加强衬，侧面嵌有带 10/15/20/25/30 发刻度的透明聚碳酸酯余弹观察窗。',
  },
  {
    id: 'ak_mag_follower',
    bomCode: 'M-02',
    nameZh: '防倾侧高辨识红色弧形托弹板',
    calloutLabel: '防倾侧红色托弹板',
    nameEn: 'Anti-Tilt Red Polymer Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [2.65, -1.65, 0],
    explodeSteps: [
      ...AK_MAG_STAGE1,
      { range: [0.34, 0.56], offset: [-0.8, 2.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, -0.2, 0],
    labelAppearAt: 0.34,
    roleTag: '双排双进平顺托弹 / 观察窗余弹刻度指示',
    description:
      '贴合 7.62×39mm 弹匣曲率的长裙边防卡滞托弹板，鲜艳橙红配色既便于从抛壳口快速确认空仓状态，又在透明侧窗内充当直观的余弹数指示游标。',
  },
  {
    id: 'ak_mag_spring',
    bomCode: 'M-03',
    nameZh: '沿弧线弯曲矩形截面弹匣托弹簧',
    calloutLabel: '弧形弹匣托弹簧',
    nameEn: 'Curved Rectangular Magazine Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [2.55, -0.55, 0],
    explodeSteps: [
      ...AK_MAG_STAGE1,
      { range: [0.34, 0.58], offset: [2.4, -3.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 34,
    calloutAnchor: [3.2, -9.2, 0],
    labelAppearAt: 0.34,
    roleTag: '沿香蕉弯道恒力推升 30 发重型 7.62 步枪弹',
    description:
      '中心线按 7.62×39mm 弹匣圆弧曲率预成型的磷化弹簧钢丝托弹簧，在高达每分钟 700 发的连发射速下依然能将双排步枪弹稳定推升至钢衬抱弹口。',
  },
  {
    id: 'ak_mag_floorplate',
    bomCode: 'M-04',
    nameZh: '倾角防滑钢制弹匣底盖与锁片',
    calloutLabel: '防滑弹匣底盖',
    nameEn: 'Angled Ribbed Magazine Floorplate & Lock',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [6.94, -9.54, 0],
    explodeSteps: [
      ...AK_MAG_STAGE1,
      { range: [0.34, 0.58], offset: [3.4, -4.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 34,
    calloutAnchor: [0.2, -0.25, 0],
    labelAppearAt: 0.34,
    roleTag: '封闭弹匣底部 / 支持单发触地卧姿稳定依托',
    description:
      '新一代 AK-15/AK-12 弹匣特有的前倾平底橡胶包覆钢制底盖：射手在卧姿射击时可直接将弹匣底盖抵靠地面充当临时单脚架而不影响供弹可靠性，按下底部圆锁扣即可免工具滑出清沙。',
  },
];

export const AK15_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'ak_trigger_hammer',
    stepNum: '01',
    shortLabel: '扣扳机释击锤',
    title: '阶段 1 · 扣动双钩扳机与多股扭簧驱动击锤前旋',
    range: [0.0, 0.15],
    description:
      '手指扣动弧形扳机（快慢机置于单发 ОД 或连发 АВ），扳机前部双钩主阻铁向下潜入脱离击锤待击卡槽；回转击锤在三股绞合双翼扭簧驱动下绕横轴高速向前上方挥击。',
  },
  {
    id: 'ak_pin_ignition',
    stepNum: '02',
    shortLabel: '击针刺破底火',
    title: '阶段 2 · 浮动长击针前冲撞击 7.62×39mm 弹底火',
    range: [0.15, 0.22],
    description:
      '由于双突笋枪机已完全闭锁且枪机框处于最前位，不到位保险让开通道，击锤正面重重敲击浮动式长击针尾端；击针尖刺破 M43 步枪弹底火，瞬间引燃锥形弹壳内的双基发射药。',
  },
  {
    id: 'ak_gas_tap',
    stepNum: '03',
    shortLabel: '过导气孔引气',
    title: '阶段 3 · 弹头高速越过 90° 导气箍分流高压火药燃气',
    range: [0.22, 0.32],
    description:
      '7.62mm 覆铜钢芯尖头弹沿 415mm 镀铬膛线加速前冲；当弹头越过枪管前段导气孔瞬间，部分高压火药燃气经 90° 导气箍垂直涌入导气管气室，猛烈冲击长行程导气活塞凹面端头，随后弹头冲出五槽消焰器。',
  },
  {
    id: 'ak_piston_unlock',
    stepNum: '04',
    shortLabel: '活塞推框旋锁',
    title: '阶段 4 · 长行程活塞自由行程泄压与 35° 螺旋回转开锁',
    range: [0.32, 0.45],
    description:
      '长行程活塞推动枪机框先行单独后退约 7.5mm 自由行程（待弹头离膛、膛压安全下降），随后枪机框内壁螺旋导槽强制拨动枪机主凸耳，驱动双突笋枪机顺时针旋转约 35° 脱离前节套闭锁槽，携枪机同步后坐！',
  },
  {
    id: 'ak_extract_eject',
    stepNum: '05',
    shortLabel: '拉壳撞挺抛壳',
    title: '阶段 5 · 爪式抽壳钩拉出锥形弹壳、压倒击锤并撞挺翻滚抛壳',
    range: [0.45, 0.62],
    description:
      '枪机框与双突笋枪机同步高速后坐压倒回转击锤挂入中央单发阻铁；右侧重型抽壳钩拉出空弹壳撞上机匣左侧固定抛壳挺向右上前方翻滚抛出，枪机框尾端经缓冲垫平稳止动。',
  },
  {
    id: 'ak_feed_lock',
    stepNum: '06',
    shortLabel: '复进推弹旋闭',
    title: '阶段 6 · 香蕉弹匣托弹上升与枪机同步复进逆旋 35° 闭锁',
    range: [0.62, 0.86],
    description:
      '大弧度观察窗弹匣内下一发 7.62 步枪弹上托至抱弹口；多股螺旋复进簧驱动枪机框与枪机同步复进推新弹滑入弹膛，枪机抵拢膛口后枪机框继续前冲驱动枪机逆旋 35° 锁死前节套并走完闭锁保险行程。',
  },
  {
    id: 'ak_sear_reset',
    stepNum: '07',
    shortLabel: '单发断路交接',
    title: '阶段 7 · 松开扳机，中央单发阻铁将击锤交接回主阻铁',
    range: [0.86, 1.0],
    description:
      '后坐期间被压倒的击锤原本由中央单发阻铁后钩暂时扣住（防止半自动连发）；射手松开扳机后，单发阻铁前倾脱钩，击锤微幅上抬即被双钩主阻铁重新稳稳接住，发出清脆“咔哒”声完成待击复位。',
  },
];

const AK15_UNLOCK_RAD = (35 * Math.PI) / 180; // Authentic ~35° (0.6109 rad) AK 2-lug rotation
const AK15_FREE_DWELL = 0.4; // ~7.5mm initial carrier free-travel dwell before helical cam contact
const AK15_CAM_STROKE = 0.65; // ~11.5mm helical cam-slot axial rotation stroke
const AK15_MAX_STROKE = 4.2; // Stops carrier rear (-0.855 - 4.20 = -5.055) flush on ak_recoil_guide bufferPad (-5.06)!

/**
 * Mechanically coupled Kalashnikov carrier-to-bolt cam kinematics:
 *  - [0.305, 0.365] -> s ∈ [0, 0.40]: Carrier free-travel dwell (bolt stays locked at dx=0, rx=0 while bore pressure drops)
 *  - [0.365, 0.445] -> s ∈ [0.40, 1.05]: Helical cam track rotates bolt 35° (+0.6109 rad) + primary extraction (-0.10)
 *  - [0.445, 0.560] -> s ∈ [1.05, 4.20]: Synchronized 1:1 carrier & bolt rearward recoil (boltDX = carrierDX + 0.95 -> -3.25)
 *  - [0.610, 0.770] -> s ∈ [4.20, 1.05]: Synchronized 1:1 counter-recoil stripping fresh 7.62×39mm cartridge
 *  - [0.770, 0.835] -> s ∈ [1.05, 0.40]: Reverse 35° helical cam lockup into front trunnion
 *  - [0.835, 0.870] -> s ∈ [0.40, 0.00]: Final carrier safety over-travel tail
 */
function sampleAk15BoltGroup(f: number): {
  carrierDX: number;
  boltDX: number;
  boltRX: number;
} {
  let s = 0;
  if (f >= 0.305 && f < 0.365) {
    s = AK15_FREE_DWELL * seg(f, 0.305, 0.365);
  } else if (f >= 0.365 && f < 0.445) {
    s = AK15_FREE_DWELL + AK15_CAM_STROKE * seg(f, 0.365, 0.445);
  } else if (f >= 0.445 && f < 0.56) {
    s =
      AK15_FREE_DWELL +
      AK15_CAM_STROKE +
      (AK15_MAX_STROKE - (AK15_FREE_DWELL + AK15_CAM_STROKE)) *
        seg(f, 0.445, 0.56);
  } else if (f >= 0.56 && f < 0.61) {
    s = AK15_MAX_STROKE;
  } else if (f >= 0.61 && f < 0.77) {
    s =
      AK15_MAX_STROKE -
      (AK15_MAX_STROKE - (AK15_FREE_DWELL + AK15_CAM_STROKE)) *
        seg(f, 0.61, 0.77);
  } else if (f >= 0.77 && f < 0.835) {
    s = AK15_FREE_DWELL + AK15_CAM_STROKE * (1.0 - seg(f, 0.77, 0.835));
  } else if (f >= 0.835 && f < 0.87) {
    s = AK15_FREE_DWELL * (1.0 - seg(f, 0.835, 0.87));
  }

  const carrierDX = -s;

  if (s <= AK15_FREE_DWELL + 1e-7) {
    return { carrierDX, boltDX: 0, boltRX: 0 };
  }
  if (s <= AK15_FREE_DWELL + AK15_CAM_STROKE) {
    const camU = smoothstep01((s - AK15_FREE_DWELL) / AK15_CAM_STROKE);
    return {
      carrierDX,
      boltDX: -0.1 * camU,
      boltRX: AK15_UNLOCK_RAD * camU,
    };
  }
  return {
    carrierDX,
    boltDX: -0.1 - (s - (AK15_FREE_DWELL + AK15_CAM_STROKE)),
    boltRX: AK15_UNLOCK_RAD,
  };
}

export function computeAk15FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let rx = 0;
  const ry = 0;
  let rz = 0;
  let scaleX = 1;

  const { carrierDX, boltDX, boltRX } = sampleAk15BoltGroup(f);

  switch (partId) {
    case 'ak_bolt_carrier': {
      dx = carrierDX;
      break;
    }

    case 'ak_bolt': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'ak_extractor': {
      dx = boltDX;
      rx = boltRX;
      // Snap flex outward (+Z) over case rim when locking onto fresh 7.62×39mm cartridge
      const rimSnap = Math.sin(linearSeg(f, 0.77, 0.83) * Math.PI);
      dz = 0.08 * rimSnap;
      break;
    }

    case 'ak_firing_pin': {
      // Driven forward +0.36 by hammer blow only while bolt is locked & carrier is in battery [0.145, 0.29]
      const pinStrike = seg(f, 0.145, 0.185) - seg(f, 0.205, 0.295);
      dx = boltDX + 0.36 * pinStrike;
      break;
    }

    case 'ak_recoil_spring': {
      // Assembled spring spans local X ∈ [-5.6, +3.6] (L0 = 9.2)
      // Rear end (-5.6) stays seated at rear trunnion; front end (+3.6) compresses with carrierDX (-4.20 -> LNew = 5.00)!
      const x0Orig = -5.6;
      const L0 = 9.2;
      const x1New = 3.6 + carrierDX;
      const LNew = Math.max(4.85, x1New - x0Orig);
      scaleX = LNew / L0;
      dx = x0Orig - x0Orig * scaleX;
      break;
    }

    case 'ak_hammer': {
      // Cocked-flat at rz = 0 (worldY_max <= +0.54) -> released at sear break [0.075, 0.155] to swing UP & FORWARD
      // into ak_firing_pin anvil (rz = -1.66) -> cammed back down [0.32, 0.43] to overcock (rz = +0.10) before
      // solid carrier sweeps across X = -0.35 -> settles onto disconnector [0.56, 0.65] (rz = +0.05) ->
      // handed back to double-hook primary sear during trigger reset [0.89, 0.95] (rz = 0)!
      const swingStrike = seg(f, 0.075, 0.155);
      const recockByCarrier = seg(f, 0.32, 0.43);
      const settleOnDisconnector = seg(f, 0.56, 0.65);
      const handoffToPrimary = seg(f, 0.89, 0.95);

      rz =
        -1.66 * swingStrike +
        1.76 * recockByCarrier -
        0.05 * settleOnDisconnector -
        0.05 * handoffToPrimary;
      break;
    }

    case 'ak_trigger': {
      // Pulled back (rz = -0.25) during [0.00, 0.12], held down until reset [0.87, 0.96]
      const pull = seg(f, 0.0, 0.12) - seg(f, 0.87, 0.96);
      rz = -0.25 * pull;
      break;
    }

    case 'ak_disconnector': {
      // Tilts with trigger, cams backward against spring when hammer passes under claw [0.39, 0.46],
      // holds hammer under slight tension until trigger release [0.88, 0.95]
      const pull = seg(f, 0.0, 0.12) - seg(f, 0.87, 0.96);
      const camSnap = Math.sin(linearSeg(f, 0.39, 0.46) * Math.PI) * 0.16;
      const latchHold = seg(f, 0.43, 0.48) - seg(f, 0.88, 0.95);
      rz = -0.18 * pull + camSnap + 0.04 * latchHold;
      break;
    }

    case 'ak_mag_follower': {
      // Upward feed pulse along curved banana path when stripping next cartridge
      const pulse = seg(f, 0.52, 0.63) - seg(f, 0.66, 0.8);
      dx = -0.08 * pulse;
      dy = 0.42 * pulse;
      break;
    }

    case 'ak_mag_spring': {
      const pulse = seg(f, 0.52, 0.63) - seg(f, 0.66, 0.8);
      dy = 0.18 * pulse;
      break;
    }

    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes 7.62×39mm M43 cartridge, spitzer projectile, gas-block port tap flash, muzzle flash & case ejection.
 */
export function computeAk15BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const { boltDX } = sampleAk15BoltGroup(f);

  // 1. 7.62mm Spitzer Projectile:
  // Seated at chamber neck [7.15, 1.05, 0] until f = 0.20 -> accelerates down 415mm barrel past gas port X=16.7 (at f≈0.27) ->
  // exits flash suppressor X=25.65 at f = 0.305 -> supersonic downrange flight [0.305, 0.46]!
  const bulletVisible = f < 0.46;
  let bulletX = 7.15;
  let streakLength = 0;

  if (f >= 0.2 && f < 0.305) {
    const u = Math.pow(linearSeg(f, 0.2, 0.305), 1.45);
    bulletX = 7.15 + 18.5 * u;
    streakLength = 4.2 * u;
  } else if (f >= 0.305 && f < 0.46) {
    const u = linearSeg(f, 0.305, 0.46);
    bulletX = 25.65 + 48.0 * u;
    streakLength = 9.5 * (1 - u * 0.45);
  }

  // 2. Spent 7.62×39mm Bottleneck Case:
  // Seated in chamber at [5.15, 1.05, 0] -> extracted rearward 1:1 with boltDX [0.365, 0.485] ->
  // strikes fixed left ejector blade at X ≈ 1.85 and tumbles vigorously out right-upper dust cover port [0.485, 0.76]!
  const spentCaseVisible = f < 0.76;
  let caseX = 5.15;
  let caseY = 1.05;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.365 && f < 0.51) {
    caseX = 5.15 + boltDX;
  } else if (f >= 0.51 && f < 0.76) {
    const u = linearSeg(f, 0.51, 0.76);
    const ejectOriginX = 5.15 + sampleAk15BoltGroup(0.51).boltDX;
    caseX = ejectOriginX + 3.2 * u;
    caseY = 1.05 + 8.6 * u - 10.5 * u * u;
    caseZ = 12.8 * u;
    caseRX = u * 9.5;
    caseRY = -u * 14.0;
    caseRZ = -u * 11.5;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.76);
    }
  }

  // 3. Chamber Flash, 90° Gas-Block Port Tap Flash, & Slotted Birdcage Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.19 && f <= 0.28) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.19, 0.28) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.265 && f <= 0.355) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.265, 0.355) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.295 && f <= 0.39) {
    const u = linearSeg(f, 0.295, 0.39);
    muzzlePlumeScale = 0.45 + 1.55 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.85;
  }

  // 4. Next 7.62×39mm Cartridge in Curved Mag -> Stripped up bullet guide into Chamber [5.15, 1.05, 0]
  let nextX = 2.55;
  let nextY = -0.15;
  let nextRZ = 0.16;

  if (f >= 0.52 && f < 0.62) {
    const u = seg(f, 0.52, 0.62);
    nextX = 2.55 + 0.15 * u;
    nextY = -0.15 + 0.55 * u;
    nextRZ = 0.16 + 0.06 * u;
  } else if (f >= 0.62 && f < 0.84) {
    const u = seg(f, 0.62, 0.84);
    const guideArc = Math.sin(u * Math.PI) * 0.22;
    nextX = 2.7 + (5.15 - 2.7) * u;
    nextY = 0.4 + (1.05 - 0.4) * u + guideArc;
    nextRZ = 0.22 * (1 - u);
  } else if (f >= 0.84) {
    nextX = 5.15;
    nextY = 1.05;
    nextRZ = 0;
  }

  // 5. Reserve Cartridge underneath in Curved Mag
  const magShift = seg(f, 0.52, 0.72);
  const resX = 2.78 + (2.55 - 2.78) * magShift;
  const resY = -1.25 + (-0.15 - -1.25) * magShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.05, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [16.4, 2.25, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0.14],
  };
}

export const AK15_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  ak_receiver: {
    albedoFile: 'ak_receiver_albedo.webp',
    normalFile: 'ak_receiver_normal.webp',
    roughnessFile: 'ak_receiver_roughness.webp',
    normalScale: 0.38,
  },
  ak_bolt_carrier: {
    albedoFile: 'ak_metal_albedo.webp',
    normalFile: 'ak_metal_normal.webp',
    roughnessFile: 'ak_metal_roughness.webp',
    normalScale: 0.55,
  },
  ak_mag_body: {
    albedoFile: 'ak_mag_albedo.webp',
    normalFile: 'ak_mag_normal.webp',
    roughnessFile: 'ak_mag_roughness.webp',
    normalScale: 0.68,
  },
};

export const AK15_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'ak_receiver',
    weapon: 'ak15',
    titleCn: '伊热夫斯克冲压钢机匣与烤漆铭文贴图组',
    partTag: 'R-01 / B-01 RECEIVER',
    resolution: '2048 × 1024 px',
    summary:
      '参考卡拉什尼科夫集团 6П71М (AK-15M1) 真铁实拍：还原俄式磷化底漆黑色苯胺烤漆 (Нигрозин)、机匣点焊凹坑与铆钉高光、右侧西里尔字母 ПР/АВ/ОД 档位钢印与标志性快慢机圆弧划痕，以及左侧原厂厂徽序列号。',
    highlights: [
      '右侧 ПР / АВ / ОД 钢印与快慢机圆弧划痕',
      '左侧 [КК] АК-15 7,62×39 · 6П71М 铭文',
      '1.5mm 冲压钢棱边露白与点焊凹坑法线',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'ak_receiver_albedo.webp',
        note: 'sRGB · 俄式黑烤漆 / 西里尔白字铭文 / 快慢机划痕露白',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'ak_receiver_normal.webp',
        note: 'Linear · 冲压点焊凹坑 + 档位压印凹槽 + 划痕法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'ak_receiver_roughness.webp',
        note: 'Linear · 烤漆半亚光底面 vs 导轨/棱边摩擦低粗糙度',
      },
    ],
  },
  {
    id: 'ak_mag',
    weapon: 'ak15',
    titleCn: '7.62×39mm 透明观察窗弧形弹匣贴图组',
    partTag: 'M-01 WINDOWED MAG',
    resolution: '1024 × 1024 px',
    summary:
      '专为新一代 AK-15 30 发玻纤聚酰胺 (ПА6С) 大弯弧弹匣制作：包含斜向防滑加强筋、10/15/20/25/30 发余弹白字刻度、烟熏聚碳酸酯透明侧窗内双排黄铜/覆铜 7.62mm 实弹视觉层，以及前后钢衬抱弹口磨损。',
    highlights: [
      '烟熏透明观察窗内 7.62×39mm 实弹叠排细节',
      '侧壁 10 / 15 / 20 / 25 / 30 余弹刻度钢印',
      '透明窗镜面低粗糙度 vs 聚酰胺壳体哑光对比',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'ak_mag_albedo.webp',
        note: 'sRGB · 哑光黑聚酰胺 / 观察窗黄铜弹壳 / 余弹数字刻字',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'ak_mag_normal.webp',
        note: 'Linear · 弹匣斜向防滑凸筋 + 观察窗镶嵌台阶法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'ak_mag_roughness.webp',
        note: 'Linear · 聚碳酸酯视窗高光 (0.14) vs 防滑筋哑光 (0.78)',
      },
    ],
  },
  {
    id: 'ak_metal',
    weapon: 'ak15',
    titleCn: '长行程镀铬导气活塞高温烧蚀与枪机贴图组',
    partTag: 'B-03 / R-02 PISTON & BARREL',
    resolution: '1024 × 1024 px',
    summary:
      '刻画长行程活塞自动机特有的射击热力学痕迹：后段黑色机加工枪机框带有导轨纵向往复亮痕，前段硬铬不锈钢活塞杆呈现高温燃气烘烤的金褐/蓝紫回火渐变色，活塞头环槽附着真实火药积碳。',
    highlights: [
      '镀硬铬活塞杆金褐至蓝紫高温回火色渐变',
      '活塞头燃气冲击端面黑色火药积碳层',
      '枪机框导轨与螺旋凸轮槽往复摩擦亮带',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'ak_metal_albedo.webp',
        note: 'sRGB · 黑磷化枪机框 / 亮铬活塞杆 / 热回火色与积碳',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'ak_metal_normal.webp',
        note: 'Linear · 车床精细环形刀纹 + 活塞闭气环槽微凹凸',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'ak_metal_roughness.webp',
        note: 'Linear · 镜面硬铬活塞杆 (0.18) vs 积碳端面哑光 (0.86)',
      },
    ],
  },
  {
    id: 'ak_detail',
    weapon: 'ak15',
    titleCn: 'EVO 战术枪托护木与火控内件无缝细节贴图',
    partTag: '22 FURNITURE & FCG PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为 2023 EVO 折叠枪托、高低可调贴腮板、浮置隔热上下护木、一体握把护圈及回转击锤双钩扳机火控组提供无缝平铺的 CNC 金属拉丝与玻纤聚酰胺注塑皮纹细节。',
    highlights: [
      'EVO 枪托与浮置护木玻纤聚酰胺微皮纹',
      '回转击锤、双钩扳机、双突笋枪机 CNC 金属拉丝',
      '覆盖其余全部 22 个战术护木与内部机械节点',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于双突笋枪机/击锤/扳机/导气箍/消焰器等',
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
        note: 'Linear · 用于 EVO 枪托/贴腮板/上下护木/一体握把',
      },
    ],
  },
];

export const AK15_PLUGIN: WeaponRuntimePlugin = {
  id: 'ak15',
  partGroups: AK15_PART_GROUPS,
  timelinePresets: AK15_TIMELINE_PRESETS,
  parts: AK15_PARTS,
  firingPhases: AK15_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(AK15_FIRING_PHASES, f),
  computeFiringKinematics: computeAk15FiringKinematics,
  computeBallisticsState: computeAk15BallisticsState,
  pbrBindings: AK15_PBR_BINDINGS,
  pbrSuites: AK15_PBR_SUITES,
};
