import {
  clamp01,
  findActiveFiringPhase,
  linearSeg,
  seg,
  smoothstep01,
} from '../../engine/kinematics/math';
import type {
  AssemblyGroupMeta,
  CaliberProfile,
  ExtendedBallisticsState,
  FiringPhaseInfo,
  KeyframeStep,
  PartKinematicDelta,
  PbrBindingSpec,
  PbrSuiteItem,
  TimelinePresetItem,
  WeaponId,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';

export const GARAND_ID = 'garand' as unknown as WeaponId;
export const GARAND_CALIBER = '30_06' as unknown as CaliberProfile;

export const GARAND_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '24英寸枪管、枪口导气筒与长行程拉机柄组',
    nameEn: '24" Barrel, Muzzle Gas Cylinder & Long-Stroke Op-Rod',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '开顶锻造机匣、T105觇孔表尺与美洲黑胡桃木枪托组',
    nameEn: 'Forged Open-Top Receiver, T105 Sight & Walnut Stock',
    badgeColor: '#a16207',
  },
  {
    key: 'fire_control',
    nameZh: '免工具快拆铣削火控盒与护圈前保险组',
    nameEn: 'Quick-Detach Milled Trigger Group & Winter Safety',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '8发弹簧钢漏夹、双面托弹板与末发自动弹射组',
    nameEn: '8-Rd En-Bloc Clip, Follower Arm & Auto-Eject Latch',
    badgeColor: '#fb923c',
  },
];

export const GARAND_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: '美国 M1 伽兰德半自动步枪（U.S. Rifle, Cal. .30, M1）标准闭锁待击态：8 发 .30-06 弹簧钢漏夹整夹压入开顶锻造机匣，枪口不锈钢导气筒、右侧长行程活塞拉机柄与双突笋回转枪机严密闭锁。',
  },
  {
    id: 'field_strip',
    label: '三大件野战快拆',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '遵循美军 FM 23-5 教范免工具十秒野战分解：按压左侧漏夹卡笋向上弹出 8 发漏夹，向下掰开铣削扳机护圈整体抽出快拆火控盒，分离美洲黑胡桃木主枪托，并摘除复进簧、拉机柄与双突笋枪机。',
  },
  {
    id: 'sub_assembly',
    label: '导气/护木/供弹细拆',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '旋下十字排气阀导气筒锁螺拆出不锈钢导气筒与前后胡桃木护木，分解 T105 双鼓轮觇孔照门、快拆火控组件以及托弹臂、子弹导引块与左侧漏夹卡笋弹簧机构。',
  },
  {
    id: 'full_exploded',
    label: '全枪 26 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 26 个 1:1 精密机械零件零遮挡展开：从 24 英寸四膛线 .30-06 阶梯枪管、S 型长行程活塞拉机柄、桥式防早发长击针到带附件仓活门的防滑钢托底板，完整呈现巴顿将军盛赞的「史上最伟大战斗兵器」。',
  },
];

// Shared Stage-1 M1 Garand quick-detach trigger group straight downward extraction (-Y)
const GARAND_FCG_STAGE1: KeyframeStep = {
  range: [0.04, 0.22],
  offset: [2.5, -14.5, 0],
};

// Shared Stage-1 American black walnut stock + buttplate rearward-downward separation
const GARAND_STOCK_STAGE1: KeyframeStep = {
  range: [0.08, 0.26],
  offset: [-38.0, -6.5, 0],
};

export const GARAND_PARTS: WeaponPartSpec[] = [
  // ==================== 1. 24" BARREL, MUZZLE GAS CYLINDER & OP-ROD ('slide' · 8 parts) ====================
  {
    id: 'garand_barrel',
    bomCode: 'B-01',
    nameZh: '24英寸 .30-06 四膛线阶梯精密枪管',
    calloutLabel: '24".30-06膛线枪管',
    nameEn: '24" .30-06 Springfield 4-Groove Stepped Barrel',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 1.15, 0],
    explodeSteps: [
      { range: [0.35, 0.65], offset: [12.0, 0.6, 0] },
      { range: [0.68, 0.96], offset: [10.0, 0.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [24.0, 0.82, 0],
    labelAppearAt: 0.28,
    roleTag: '610mm 固定枪管 · 1:10"右旋四膛线与枪口三花键导气孔',
    description:
      '全长 24 英寸（610 mm）铬钼合金钢阶梯车削枪管，内设 4 条右旋（缠距 254 mm）精密膛线，赋予 150 格令 .30-06 M2 普通弹 853 m/s 高初速；枪口段铣有三条纵向定位花键并在底部钻有垂直导气孔，待弹头即将出膛瞬间引出温和燃气驱动自动机。',
  },
  {
    id: 'garand_gas_cylinder',
    bomCode: 'B-02',
    nameZh: '枪口不锈钢导气筒总成(含刺刀座与架枪环)',
    calloutLabel: '枪口不锈钢导气筒',
    nameEn: 'Stainless Muzzle Gas Cylinder w/ Bayonet Lug & Stacking Swivel',
    group: 'slide',
    material: 'stainless',
    assembledPos: [58.4, 0.25, 0],
    explodeSteps: [
      { range: [0.35, 0.62], offset: [28.0, -1.8, 0] },
      { range: [0.68, 0.95], offset: [14.0, -1.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.36,
    roleTag: '410不锈钢耐蚀气室 · M1刺刀T型座与三枪架枪环',
    description:
      '伽兰德放弃早期易炸裂枪口集气罩后定型的 1940 型耐高温 410 不锈钢导气筒：上部花键套环骑跨枪管口部并对准导气孔，下部精密研磨气缸容纳长行程活塞头，底部一体集成美军野战架枪环与 M1905/M1 刺刀卡座。',
  },
  {
    id: 'garand_gas_lock_screw',
    bomCode: 'B-03',
    nameZh: '8字导气筒锁环与十字槽枪榴弹泄压阀螺塞',
    calloutLabel: '导气筒锁与十字阀螺',
    nameEn: 'Figure-8 Gas Cylinder Lock & Cross-Valve Lock Screw',
    group: 'slide',
    material: 'stainless',
    assembledPos: [61.85, 0.38, 0],
    explodeSteps: [
      { range: [0.32, 0.58], offset: [37.5, -1.8, 0], rotation: [0.95, 0, 0] },
      { range: [0.68, 0.96], offset: [20.5, -1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.34,
    roleTag: '锁紧枪口导气筒 · 加装M7枪榴弹自动顶开泄气护机',
    description:
      '旋上枪口螺纹压紧导气筒的 8 字形钢锁环与前端十字槽锁紧螺塞：螺塞中心内置弹簧顶杆泄压阀，平时严密闭气实现半自动循环；一旦套上 M7 枪榴弹发射器，顶杆即被自动推开泄放高压燃气，保护长行程拉机柄免受超高膛压弯曲。',
  },
  {
    id: 'garand_front_sight',
    bomCode: 'B-04',
    nameZh: '燕尾槽双护翼柱状准星组件',
    calloutLabel: '双护翼柱状准星',
    nameEn: 'Dovetail Winged Blade Front Sight Assembly',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [59.55, 2.38, 0],
    explodeSteps: [
      { range: [0.35, 0.62], offset: [28.0, 3.8, 0] },
      { range: [0.68, 0.96], offset: [14.0, 3.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.38,
    roleTag: '燕尾横向归零锁紧 · 外张防撞双护耳',
    description:
      '通过横向内六角螺钉锁固在导气筒顶部燕尾槽上的柱状准星座：中央 0.062 英寸窄准星叶片两侧矗立标志性的外张斜护翼，既便于在战壕烟尘中快速捕捉准星，又避免行军跌落撞歪准星。',
  },
  {
    id: 'garand_op_rod',
    bomCode: 'B-05',
    nameZh: 'S型长行程导气活塞拉机柄一体件',
    calloutLabel: '长行程活塞拉机柄',
    nameEn: 'Curved Long-Stroke Operating Rod & Piston Assembly',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [28.0, 0.15, 0],
    explodeSteps: [
      { range: [0.15, 0.29], offset: [0, 6.2, 5.2] },
      { range: [0.36, 0.64], offset: [4.5, 4.2, 3.8] },
      { range: [0.68, 0.95], offset: [4.0, 3.2, 2.8] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-24.5, 1.45, 1.35],
    labelAppearAt: 0.15,
    roleTag: '伽兰德灵魂主动件 · 4mm自由行程泄压与32°凸轮驼峰',
    description:
      '约翰·伽兰德最具辨识度的工程杰作：前端焊接无心磨削亮白不锈钢迷宫槽活塞头，中段空心钢套管经精密三维 S 型弯折绕过枪管节套延伸至机匣右侧，尾端拱形凸轮驼峰内铣有 4 mm 直线自由行程段与 32° 螺旋开闭锁斜面，集活塞、导杆、凸轮框与拉机柄于一身！',
  },
  {
    id: 'garand_bolt',
    bomCode: 'B-06',
    nameZh: '双突笋回转闭锁锻造枪机',
    calloutLabel: '双突笋回转枪机',
    nameEn: 'Forged 2-Lug Rotating Breech Bolt',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-0.65, 1.15, 0],
    explodeSteps: [
      { range: [0.19, 0.3], offset: [-10.5, 6.8, 0] },
      {
        range: [0.36, 0.64],
        offset: [-3.5, 4.2, 0],
        rotation: [0.56, 0, 0],
      },
      { range: [0.68, 0.95], offset: [-2.5, 3.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.18,
    roleTag: '32°刚性回转闭锁 · 右开锁导柱啮合拉机柄驼峰',
    description:
      '采用镍钼合金钢整体模锻并经渗碳热处理的重型回转枪机：前端左右对称设置两枚粗壮闭锁突笋承受 345 MPa 膛压，右侧突笋向外延伸圆柱导笋嵌入拉机柄凸轮驼峰槽内，将拉机柄直线运动转化为 32° 精准回转开闭锁。',
  },
  {
    id: 'garand_firing_pin',
    bomCode: 'B-07',
    nameZh: '桥式防早发长击针、抽壳钩与柱塞抛壳挺组',
    calloutLabel: '防早发长击针与抽抛壳组',
    nameEn: 'Tang-Blocked Firing Pin, Claw Extractor & Plunger Ejector',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-0.85, 1.15, 0],
    explodeSteps: [
      { range: [0.19, 0.3], offset: [-10.5, 6.8, 0] },
      { range: [0.38, 0.65], offset: [-14.5, 5.8, -2.6] },
      { range: [0.68, 0.96], offset: [-8.5, 4.2, -1.8] },
    ],
    calloutDir: 'up',
    calloutStem: 54,
    labelAppearAt: 0.4,
    roleTag: '机匣后桥物理阻挡未闭锁击针 · 右前1点钟弹簧抛壳',
    description:
      '贯穿枪机轴心的长击针尾端带有向下凸出的安全尾翼（Tang）：只要双突笋枪机尚未完全旋转闭锁到位，机匣后桥便刚性挡住击针尾翼，彻底根绝炸膛早发隐患；镜面同时集成重型抽壳钩与左上方弹簧柱塞抛壳挺。',
  },
  {
    id: 'garand_op_rod_spring',
    bomCode: 'B-08',
    nameZh: '一簧双用长行程螺旋复进簧',
    calloutLabel: '长行程螺旋复进簧',
    nameEn: 'Dual-Purpose Long Helical Operating-Rod Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [26.5, -0.35, 0],
    explodeSteps: [
      { range: [0.14, 0.28], offset: [-8.0, 9.8, 5.2] },
      { range: [0.36, 0.64], offset: [-6.0, 6.2, 3.8] },
      { range: [0.68, 0.96], offset: [-4.5, 4.5, 2.8] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    labelAppearAt: 0.16,
    roleTag: '一根主簧双向做功：前推拉机柄复进 + 后顶托弹杆上供弹',
    description:
      '深藏于拉机柄空心长管内的耐热不锈钢螺旋压簧，体现了伽兰德登峰造极的机构简化智慧：其前端顶推拉机柄向前复进闭锁，后端同时顶压分叉托弹杆通过杠杆将 8 发漏夹内的实弹持续向上托举，以单根弹簧兼任复进簧与弹仓簧！',
  },

  // ==================== 2. FORGED OPEN-TOP RECEIVER, T105 SIGHT & WALNUT STOCK ('frame' · 8 parts) ====================
  {
    id: 'garand_receiver',
    bomCode: 'F-01',
    nameZh: '春田兵工厂开顶斜尾锻造钢机匣',
    calloutLabel: '开顶斜尾锻造机匣',
    nameEn: 'Forged Open-Top Heeled Springfield Receiver',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-6.8, 1.85, 0],
    labelAppearAt: 0.04,
    roleTag: '全枪主承力基准 · 顶部直压漏夹仓与锰系磷化铭文尾桥',
    description:
      '历经逾百道精密铣削与拉削工序锻造而成的镍铬钼钢一体机匣，表层经二战军规锰系磷化（Parkerizing）处理呈深橄榄石板灰；顶部敞开供 8 发漏夹垂直压入，斜切机匣尾桥深压印「U.S. RIFLE / CAL. .30 M1 / SPRINGFIELD ARMORY / 2841944」原厂钢印。',
  },
  {
    id: 'garand_rear_sight',
    bomCode: 'F-02',
    nameZh: 'T105 精密双鼓轮觇孔照门总成',
    calloutLabel: 'T105双鼓轮觇孔照门',
    nameEn: 'T105 Micrometric Aperture Peep Rear Sight',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-6.85, 2.48, 0],
    explodeSteps: [
      { range: [0.4, 0.68], offset: [-4.5, 5.2, 0] },
      { range: [0.7, 0.96], offset: [-3.5, 3.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.42,
    roleTag: '100-1200码齿轮升降鼓轮 · 1MOA咔哒风偏微调',
    description:
      '被公认为二战步兵步枪最优秀的机械瞄具：靠近眼球的小孔径带护罩觇孔形成自然景深虚化，左侧滚花高低手轮刻有 100 至 1200 码射表分划，右侧风偏旋钮每一声清脆咔哒精确修正 1 MOA 弹着点。',
  },
  {
    id: 'garand_walnut_stock',
    bomCode: 'F-03',
    nameZh: '亚麻籽油浸润美洲黑胡桃木主枪托(带DAS军检验收章)',
    calloutLabel: '美洲黑胡桃木主枪托',
    nameEn: 'Linseed-Oiled American Black Walnut Stock (DAS Cartouche)',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      GARAND_STOCK_STAGE1,
      { range: [0.65, 0.95], offset: [-8.0, -5.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [-26.0, -6.2, 0],
    labelAppearAt: 0.08,
    roleTag: '北美黑胡桃心材 · 半手枪握把颈与春田双交叉炮管火印',
    description:
      '甄选窑干北美黑胡桃木（Juglans nigra）心材车削并用生亚麻籽油反复浸润防潮：左侧机匣腮部压印二战国防验收鹰章（DAS）与春田兵工厂交叉火炮军械徽章，半手枪握把前下缘打有实弹强装药检验圆圈「[P]」钢印。',
  },
  {
    id: 'garand_rear_handguard',
    bomCode: 'F-04',
    nameZh: '黑胡桃木上后护木与弹簧卡箍',
    calloutLabel: '黑胡桃木后上护木',
    nameEn: 'American Black Walnut Rear Handguard & Retaining Clip',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [18.4, 1.45, 0],
    explodeSteps: [
      { range: [0.34, 0.62], offset: [4.5, 11.5, -3.5] },
      { range: [0.68, 0.95], offset: [2.5, 5.2, -2.0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.36,
    roleTag: '拱形隔热木罩 · 保护拼刺与齐射持枪弱手',
    description:
      '覆盖于机匣前环至下箍之间枪管上方的拱形黑胡桃木隔热护木，后端由冲压锰磷化弹簧钢卡箍弹性抱紧枪管，防止连续射击灼热枪管烫伤射手并消除热气上腾对瞄准基线的虚影干扰。',
  },
  {
    id: 'garand_front_handguard',
    bomCode: 'F-05',
    nameZh: '黑胡桃木前护木与金属前箍帽',
    calloutLabel: '黑胡桃木前护木',
    nameEn: 'American Black Walnut Front Handguard & Ferrule',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [42.85, 0.95, 0],
    explodeSteps: [
      { range: [0.36, 0.64], offset: [18.5, 9.8, -3.5] },
      { range: [0.68, 0.95], offset: [11.5, 5.2, -2.0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.38,
    roleTag: '前端嵌入导气筒尾环 · 包覆长行程拉机柄前段',
    description:
      '位于下箍与枪口导气筒之间的前段黑胡桃木护木，前缘铆接冲压磷化钢护木箍帽并插入导气筒后环定位，内部车出阶梯双腔通道，确保下方长行程活塞拉机柄高速往复绝不摩擦木壁。',
  },
  {
    id: 'garand_lower_band',
    bomCode: 'F-06',
    nameZh: '中段枪管箍环与前背带环组件',
    calloutLabel: '中段下箍与前背带环',
    nameEn: 'Barrel Lower Retaining Band & Front Sling Swivel',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [30.65, 0.45, 0],
    explodeSteps: [
      { range: [0.34, 0.6], offset: [12.0, -7.2, 0] },
      { range: [0.68, 0.95], offset: [10.0, -4.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.38,
    roleTag: '弹性圆柱销锁固 · 锚定M1907射击皮背带前环',
    description:
      '以横向弹性卷销固定在枪管中段台阶上的拱形磷化钢箍，将主枪托前箍端稳固拉紧于枪管下方，底部铰接宽大前背带环，专为美军经典的 M1907 双钩皮背带依托精确射击设计。',
  },
  {
    id: 'garand_buttplate',
    bomCode: 'F-07',
    nameZh: '菱形防滑钢托底板(带通条油壶附件仓活门)',
    calloutLabel: '防滑钢托底板与活门',
    nameEn: 'Checkered Steel Buttplate w/ Hinged Oiler Trapdoor',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-46.95, -6.1, 0],
    explodeSteps: [
      GARAND_STOCK_STAGE1,
      { range: [0.66, 0.96], offset: [-18.5, -6.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.66,
    roleTag: '承受枪托砸击肉搏 · 圆盖翻门内藏M10擦枪工具与黄油盒',
    description:
      '由上下两枚一字木螺钉固定在胡桃木枪托尾端的厚重锻钢托底板，表面压制防滑格纹并在近距离白刃战中充当铁锤；上半部设有弹簧铰接圆盖活门，掀起即可取出枪托双盲孔内的 M3 组合工具、通条与润滑脂罐。',
  },
  {
    id: 'garand_op_rod_catch',
    bomCode: 'F-08',
    nameZh: '空仓挂机拉机柄阻铁与加速子连杆组',
    calloutLabel: '拉机柄阻铁与加速子',
    nameEn: 'Operating-Rod Catch & Accelerator Pawl Linkage',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [4.85, -0.35, 0.55],
    explodeSteps: [
      { range: [0.42, 0.68], offset: [5.5, -5.2, 4.8] },
      { range: [0.7, 0.96], offset: [4.2, -3.6, 3.6] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.44,
    roleTag: '末发打空自动挂机 · 压入满夹联动释放枪机上膛',
    description:
      '铰接于机匣内腔前下方的精密多连杆机构：第 8 发弹打完瞬间被上抬的托弹臂顶起钩住拉机柄缺口实现空仓挂机；当士兵用大拇指将新漏夹压到底部时，加速子与漏夹卡笋联动解脱阻铁，令枪机顺势推首弹上膛（动作稍慢便会留下著名的「伽兰德拇指 Garand Thumb」勋章！）。',
  },

  // ==================== 3. QUICK-DETACH MILLED TRIGGER GROUP & SAFETY ('fire_control' · 5 parts) ====================
  {
    id: 'garand_trigger_housing',
    bomCode: 'FC-01',
    nameZh: '免工具快拆铣削火控盒壳体(含护圈前冬季保险)',
    calloutLabel: '快拆火控盒与前保险',
    nameEn: 'Quick-Detach Milled Trigger Housing & Winter Safety',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-4.6, -2.55, 0],
    explodeSteps: [
      GARAND_FCG_STAGE1,
      { range: [0.36, 0.64], offset: [1.5, -3.5, 0] },
      { range: [0.68, 0.95], offset: [1.0, -2.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.08,
    roleTag: '整盒模块化快拆 · 食指伸入护圈一推即解保险',
    description:
      '比现代模块化步枪早诞生半个多世纪的一体可快拆钢制火控基板：将击锤、两道火扳机、复进击锤簧与护圈前扳把式保险高度集成；戴厚棉手套时只需将食指伸至扳机护圈前缘向前轻推保险片即可瞬间进入射击状态。',
  },
  {
    id: 'garand_trigger_guard',
    bomCode: 'FC-02',
    nameZh: '翻转凸轮闭锁铣削扳机护圈',
    calloutLabel: '凸轮快拆扳机护圈',
    nameEn: 'Pivoting Cam-Locking Milled Trigger Guard',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-4.5, -4.35, 0],
    explodeSteps: [
      { range: [0.01, 0.05], offset: [0, -0.3, 0], rotation: [0, 0, 0.38] },
      GARAND_FCG_STAGE1,
      {
        range: [0.38, 0.66],
        offset: [7.5, -8.5, 0],
        rotation: [0, 0, 0.24],
      },
      { range: [0.68, 0.96], offset: [5.5, -5.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.38,
    roleTag: '全枪唯一快拆钥匙 · 向下拉钩凸轮撬出整座火控组',
    description:
      '既是护圈又是整枪野战分解的「内置杠杆扳手」：后端设有挂指圆环，向上扣合时顶部双凸耳卡死机匣下支腿并将胡桃木枪托紧紧夹固；分解时只需勾住尾环向下掰开 90°，即可利用凸轮增力轻松拔出整套火控盒。',
  },
  {
    id: 'garand_trigger',
    bomCode: 'FC-03',
    nameZh: '军用两道火扳机与弹簧单发阻铁组',
    calloutLabel: '两道火扳机与单发阻铁',
    nameEn: 'Two-Stage Service Trigger & Spring Disconnector Sear',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-5.55, -3.45, 0],
    explodeSteps: [
      GARAND_FCG_STAGE1,
      { range: [0.4, 0.68], offset: [-4.8, -8.8, -2.5] },
      { range: [0.7, 0.96], offset: [-3.6, -5.2, -1.8] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    labelAppearAt: 0.42,
    roleTag: '清脆两道火击发 · 后阻铁捕获回压击锤杜绝连发',
    description:
      '融合一体主阻铁台面与铰接弹簧副阻铁（单发断路器）的经典半自动两道火扳机：第一道火消除空行程后壁垒感极其分明；射击后坐压倒击锤时由后副阻铁先行截获，松开扳机时再发出清脆咔哒声交接回前主阻铁。',
  },
  {
    id: 'garand_hammer',
    bomCode: 'FC-04',
    nameZh: '双挂钩锻造内藏回转击锤',
    calloutLabel: '双挂钩锻造回转击锤',
    nameEn: 'Forged Dual-Hook Internal Rotating Hammer',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-4.95, -1.65, 0],
    explodeSteps: [
      GARAND_FCG_STAGE1,
      {
        range: [0.38, 0.66],
        offset: [1.5, 4.2, -3.2],
        rotation: [0, 0, -0.45],
      },
      { range: [0.68, 0.96], offset: [1.2, 2.8, -2.2] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.4,
    roleTag: '前后双阻铁钩 · 锤面闭锁安全定位槽二重防早发',
    description:
      '全封闭隐藏在火控盒与机匣内腔中的锻钢回转击锤：根部精铣前后双待击挂钩分别对应主/副阻铁，锤头顶端还设有第二道不到位保险缺口——若枪机尾端未旋转到位，击锤即使挥起也会先顶推枪机闭锁而无法触及击针尖！',
  },
  {
    id: 'garand_hammer_spring',
    bomCode: 'FC-05',
    nameZh: '套筒导向螺旋击锤压簧与顶杆',
    calloutLabel: '螺旋击锤簧与顶杆',
    nameEn: 'Helical Hammer Plunger Spring & Guide Housing',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-6.35, -2.65, 0],
    explodeSteps: [
      GARAND_FCG_STAGE1,
      { range: [0.4, 0.68], offset: [-7.5, -3.8, 2.8] },
      { range: [0.7, 0.96], offset: [-5.8, -2.8, 2.0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    labelAppearAt: 0.44,
    roleTag: '高劲度螺旋压簧 · 双翼顶杆强力驱动击锤前挥',
    description:
      '封装于火控盒后下方导管内的琴钢丝螺旋压缩击锤簧与带翼顶杆：击锤被后坐枪机压倒时压缩蓄能，扣动扳机瞬间沿轴向释放充沛推力，在严寒冻油条件下依然能干脆击穿军用底火。',
  },

  // ==================== 4. 8-RD EN-BLOC CLIP, FOLLOWER ARM & LATCH ('magazine' · 5 parts) ====================
  {
    id: 'garand_enbloc_clip',
    bomCode: 'M-01',
    nameZh: '二战原厂冲压磷化弹簧钢 8 发双排漏夹',
    calloutLabel: '8发弹簧钢漏夹(PING!)',
    nameEn: 'WWII 8-Round Stamped Spring-Steel En-Bloc Clip',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [-0.95, -0.15, 0],
    explodeSteps: [
      { range: [0.02, 0.16], offset: [0, 8.5, 0] },
      { range: [0.36, 0.65], offset: [0, 5.5, 0] },
      { range: [0.68, 0.96], offset: [0, 4.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.02,
    roleTag: '上下对称盲插交错8发 · 末发空夹高亢清脆「PING!」自动弹射',
    description:
      '轻武器史上最具传奇听觉符号的供弹具：由高弹性碳素弹簧钢板冲压锰磷化制成，8 发 .30-06 步枪弹呈双排交错抱紧于夹内，无需区分正反面即可整夹压入机匣充当内弹仓抱弹口；第 8 发弹壳抛出瞬间，空漏夹如音叉般向上弹飞并发出响彻二战战场的清脆金属长鸣「PING！」',
  },
  {
    id: 'garand_follower',
    bomCode: 'M-02',
    nameZh: '上下全对称双排交错托弹板与滑块',
    calloutLabel: '全对称交错托弹板',
    nameEn: 'Reversible Staggered 8-Round Follower & Slide',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [-0.95, -0.95, 0],
    explodeSteps: [
      { range: [0.34, 0.62], offset: [-1.5, 7.2, -4.2] },
      { range: [0.68, 0.96], offset: [-1.2, 4.8, -2.8] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.36,
    roleTag: '正反盲插自适应阶梯 · 穿入漏夹底部开槽托升子弹',
    description:
      '沿机匣内侧导槽垂直升降的精铣托弹板与下方滑动块：不论士兵压入的 8 发漏夹最上一发偏左还是偏右，托弹板表面可自动滑移翻转阶梯面精准贴合最底层子弹，确保在战壕夜战中闭眼压弹亦 100% 顺畅供弹。',
  },
  {
    id: 'garand_follower_arm',
    bomCode: 'M-03',
    nameZh: '杠杆托弹臂与分叉托弹推杆总成',
    calloutLabel: '杠杆托弹臂与分叉推杆',
    nameEn: 'Pivoting Follower Arm & Forked Follower Rod',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [3.85, -1.25, 0],
    explodeSteps: [
      { range: [0.38, 0.66], offset: [3.2, -6.5, -4.2] },
      { range: [0.68, 0.96], offset: [2.5, -4.5, -3.0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.4,
    roleTag: '将复进簧向后推力90°偏转为托弹板向上恒压升力',
    description:
      '连接复进簧后端与托弹板之间的巧妙曲柄连杆：分叉长推杆前端承接长行程复进簧的向后弹力，后端铰接锻造托弹臂绕子弹导引块横销向上摆起，持续平稳地将 8 发 .30-06 实弹逐发顶向进弹口。',
  },
  {
    id: 'garand_bullet_guide',
    bomCode: 'M-04',
    nameZh: '锻钢双坡道子弹导引块',
    calloutLabel: '双坡道子弹导引块',
    nameEn: 'Forged Twin-Ramp Bullet Guide Block',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [3.35, -0.45, 0],
    explodeSteps: [
      { range: [0.42, 0.68], offset: [8.5, -4.2, -3.8] },
      { range: [0.7, 0.96], offset: [6.5, -3.2, -2.6] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.44,
    roleTag: '双弧面抛光进弹坡 · 承托托弹臂枢轴与加速子凸轮',
    description:
      '横跨夹装在机匣前下端与枪管尾端之间的高耐磨锻钢块：上部铣有左右对称的抛光导弹斜坡，引导双排交错的 .30-06 尖头弹平顺滑入弹膛而不磕伤铜被甲弹尖，下部兼作托弹臂与拉机柄阻铁的基准支座。',
  },
  {
    id: 'garand_clip_latch',
    bomCode: 'M-05',
    nameZh: '左侧拇指漏夹卡笋、卡笋簧与V型抛夹簧组',
    calloutLabel: '漏夹卡笋与V型抛夹簧',
    nameEn: 'Left Thumb Clip Latch, Helical Latch Spring & V-Ejector Wire',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [-1.15, 0.45, -1.48],
    explodeSteps: [
      { range: [0.36, 0.64], offset: [-2.5, 2.2, -5.8] },
      { range: [0.68, 0.96], offset: [-2.0, 1.8, -4.2] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.38,
    roleTag: '平时锁紧漏夹抗衡V簧 · 末发解锁或手动按压一键弹射全夹',
    description:
      '布置于机匣左外壁的滚花大拇指杠杆、螺旋卡笋压簧与机匣底部的强力 V 型弹簧钢丝抛夹簧：压入漏夹时 V 型抛夹簧即处于满蓄能状态；无论是打完第 8 发由托弹板自动顶开卡笋，还是中途手动按下左卡笋钮，V 型簧都能瞬间将空夹或未打完的实弹夹整夹凌空弹出！',
  },
];

export const GARAND_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'garand_phase_1',
    stepNum: '01',
    shortLabel: '两道火释击锤',
    title: '阶段 1 · 扣动两道火扳机释放内藏击锤，通过机匣桥安全槽重击长击针',
    range: [0.0, 0.1],
    description:
      '射手食指推开护圈前冬季保险并扣穿两道火扳机壁垒，前主阻铁下沉脱钩；螺旋击锤簧顶推锻钢击锤高速前挥，因双突笋枪机已完全闭锁、长击针尾翼对准机匣后桥安全槽，击锤精准敲击击针尾端。',
  },
  {
    id: 'garand_phase_2',
    stepNum: '02',
    shortLabel: '.30-06出膛引气',
    title: '阶段 2 · .30-06 M2 普通弹 345 MPa 点火，150gr 弹头掠过枪口导气孔',
    range: [0.1, 0.22],
    description:
      '底火引燃 50 格令 IMR 4895 单基管状发射药产生 345 MPa 峰值膛压，推动 150 格令覆铜尖头弹沿 24 英寸（610 mm）四膛线枪管加速至 853 m/s；弹头越过近枪口底部导气孔瞬间，高压火药燃气向下涌入不锈钢导气筒并在 f ≈ 0.21 冲出枪口。',
  },
  {
    id: 'garand_phase_3',
    stepNum: '03',
    shortLabel: '4mm延时与旋锁',
    title: '阶段 3 · 燃气驱动长行程拉机柄先退 4mm 自由行程泄压，驼峰旋开枪机 32°',
    range: [0.22, 0.36],
    description:
      '导气筒内膨胀燃气冲击亮白不锈钢活塞头，推动 S 型长行程拉机柄先行单独后退约 4 mm 直线自由行程（此时弹头早已离膛、膛压安全骤降），随后拉机柄凸轮驼峰斜面拨动枪机右侧导笋，强制双突笋枪机逆时针旋转 32°（0.56 rad）完成预抽壳与开锁！',
  },
  {
    id: 'garand_phase_4',
    stepNum: '04',
    shortLabel: '长后坐抛壳弹夹',
    title: '阶段 4 · 自动机满行程后坐 108mm 压缩主簧、右前抛壳并触发漏夹上弹脉冲',
    range: [0.36, 0.56],
    description:
      '长行程拉机柄携双突笋枪机同步高速后坐 108 mm，大幅压缩管内螺旋复进簧并将击锤压倒挂入单发副阻铁；镜面弹簧柱塞抛壳挺在 f ≈ 0.45 将 63.3 mm 长的 .30-06 黄铜空壳向右前上方（1~2点钟方向）强劲抛出，同时联动漏夹卡笋与托弹臂触发标志性上抬脉冲！',
  },
  {
    id: 'garand_phase_5',
    stepNum: '05',
    shortLabel: '一簧双用推弹',
    title: '阶段 5 · 复进簧后端借托弹臂顶升次发实弹，前端推拉机柄剥弹滑入弹膛',
    range: [0.56, 0.74],
    description:
      '处于最大压缩状态的螺旋复进簧展现「一簧双用」绝技：其后端推动分叉托弹杆与杠杆托弹臂将 8 发漏夹内的次发 .30-06 实弹顶升至抱弹口，前端则驱动拉机柄与枪机凌厉复进，剥离新弹顺双坡道子弹导引块直推入膛。',
  },
  {
    id: 'garand_phase_6',
    stepNum: '06',
    shortLabel: '32°旋闭锁死',
    title: '阶段 6 · 枪机抵拢膛口后驼峰驱动正旋 32° 刚性闭锁，走完 4mm 闭锁保险行程',
    range: [0.74, 0.88],
    description:
      '新弹完全入膛、枪机镜面贴合枪管尾端后，继续前冲的长行程拉机柄通过凸轮驼峰驱动枪机顺时针回转 32°（-0.56 rad），令左右闭锁突笋严密锁入机匣闭锁支承面，并走完最后 4 mm 自由行程解除桥式击针保险。',
  },
  {
    id: 'garand_phase_7',
    stepNum: '07',
    shortLabel: '两道火阻铁交接',
    title: '阶段 7 · 松开扳机，后单发副阻铁将击锤清脆交接回前主阻铁待击',
    range: [0.88, 1.0],
    description:
      '射手松开两道火扳机，弹簧副阻铁向前归位脱钩，被截获的锻钢击锤微幅上抬约 3° 即被前主阻铁台面稳稳接住，发出标志性的金属清脆复位声，全枪回归待击合拢态。',
  },
];

const GARAND_UNLOCK_RAD = 0.56; // ~32.1° 2-lug bolt rotation (>= 0.45 rad contract!)
const GARAND_FREE_DWELL = 0.4; // 4.0 mm op-rod free-travel safety delay before bolt cam contact
const GARAND_CAM_STROKE = 1.05; // 10.5 mm curved cam-hump rotation stroke
const GARAND_MAX_STROKE = 10.8; // 108 mm (10.8 cm) full long-stroke operating-rod recoil travel

/**
 * Mechanically coupled John C. Garand Operating-Rod Cam Hump <-> 2-Lug Bolt kinematics:
 *  - [0.22, 0.26] -> s ∈ [0.00, 0.40]: 4 mm free-travel safety dwell (bolt locked at dx=0, rx=0 while bore vents!)
 *  - [0.26, 0.36] -> s ∈ [0.40, 1.45]: Curved cam hump rotates bolt +0.56 rad (~32.1°) + primary extraction (-0.18)
 *  - [0.36, 0.50] -> s ∈ [1.45, 10.80]: Synchronized 1:1 op-rod & bolt full rearward stroke (-10.80 cm / -9.53 cm)
 *  - [0.50, 0.56] -> s = 10.80: Rearward buffer dwell during clip-latch / follower lift milestone
 *  - [0.56, 0.74] -> s ∈ [10.80, 1.45]: Synchronized forward counter-recoil stripping .30-06 round into chamber
 *  - [0.74, 0.83] -> s ∈ [1.45, 0.40]: Reverse 32.1° cam hump lockup into receiver lugs
 *  - [0.83, 0.88] -> s ∈ [0.40, 0.00]: Final 4 mm op-rod forward safety over-travel
 */
function sampleGarandOperatingGroup(f: number): {
  opRodDX: number;
  boltDX: number;
  boltRX: number;
} {
  let s = 0;
  if (f >= 0.22 && f < 0.26) {
    s = GARAND_FREE_DWELL * seg(f, 0.22, 0.26);
  } else if (f >= 0.26 && f < 0.36) {
    s = GARAND_FREE_DWELL + GARAND_CAM_STROKE * seg(f, 0.26, 0.36);
  } else if (f >= 0.36 && f < 0.5) {
    s =
      GARAND_FREE_DWELL +
      GARAND_CAM_STROKE +
      (GARAND_MAX_STROKE - (GARAND_FREE_DWELL + GARAND_CAM_STROKE)) *
        seg(f, 0.36, 0.5);
  } else if (f >= 0.5 && f < 0.56) {
    s = GARAND_MAX_STROKE;
  } else if (f >= 0.56 && f < 0.74) {
    s =
      GARAND_MAX_STROKE -
      (GARAND_MAX_STROKE - (GARAND_FREE_DWELL + GARAND_CAM_STROKE)) *
        seg(f, 0.56, 0.74);
  } else if (f >= 0.74 && f < 0.83) {
    s = GARAND_FREE_DWELL + GARAND_CAM_STROKE * (1.0 - seg(f, 0.74, 0.83));
  } else if (f >= 0.83 && f < 0.88) {
    s = GARAND_FREE_DWELL * (1.0 - seg(f, 0.83, 0.88));
  }

  const opRodDX = -s;

  if (s <= GARAND_FREE_DWELL + 1e-7) {
    return { opRodDX, boltDX: 0, boltRX: 0 };
  }
  if (s <= GARAND_FREE_DWELL + GARAND_CAM_STROKE) {
    const camU = smoothstep01((s - GARAND_FREE_DWELL) / GARAND_CAM_STROKE);
    return {
      opRodDX,
      boltDX: -0.18 * camU,
      boltRX: GARAND_UNLOCK_RAD * camU,
    };
  }
  return {
    opRodDX,
    boltDX: -0.18 - (s - (GARAND_FREE_DWELL + GARAND_CAM_STROKE)),
    boltRX: GARAND_UNLOCK_RAD,
  };
}

export function computeGarandFiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  const dz = 0;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let scaleX = 1;

  const { opRodDX, boltDX, boltRX } = sampleGarandOperatingGroup(f);

  switch (partId) {
    case 'garand_op_rod': {
      dx = opRodDX;
      break;
    }

    case 'garand_bolt': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'garand_firing_pin': {
      // Driven forward +0.34 by hammer blow at [0.075, 0.115] ONLY while bolt is locked (boltRX = 0)!
      const pinStrike = seg(f, 0.075, 0.1) - seg(f, 0.13, 0.2);
      dx = boltDX + 0.34 * pinStrike;
      break;
    }

    case 'garand_op_rod_spring': {
      // Local spring spans [-16.70, +16.70] (L0 = 33.40 cm):
      // Rear end (-16.70 -> world X = +9.80) stays pinned against garand_follower_arm fork;
      // Front end (+16.70 -> world X = +43.20) compresses dynamically by opRodDX (-10.80 -> scaleX = 0.6766)!
      const pinAnchorX = -16.7;
      const L0 = 33.4;
      const LNew = Math.max(18.0, L0 + opRodDX);
      scaleX = LNew / L0;
      dx = pinAnchorX * (1 - scaleX);
      break;
    }

    case 'garand_trigger': {
      // Two-stage pull [0.00, 0.08] -> held rearward until sear reset [0.89, 0.96]
      const stage1 = seg(f, 0.0, 0.045);
      const stage2 = seg(f, 0.045, 0.085);
      const release = seg(f, 0.89, 0.96);
      rz = (-0.11 * stage1 - 0.13 * stage2) * (1 - release);
      break;
    }

    case 'garand_hammer': {
      // Cocked at rz = 0 -> swings forward/upward (rz = -1.32 rad) at [0.045, 0.09] striking garand_firing_pin ->
      // cammed back down by recoiling bolt [0.34, 0.44] to overcock (+0.07 rad) on secondary sear ->
      // handed back to primary sear at [0.90, 0.96] (rz -> 0)!
      const swingStrike = seg(f, 0.045, 0.09);
      const recockByBolt = seg(f, 0.34, 0.44);
      const searHandoff = seg(f, 0.9, 0.96);
      rz = -1.32 * swingStrike + 1.39 * recockByBolt - 0.07 * searHandoff;
      break;
    }

    case 'garand_hammer_spring': {
      // Local spring spans [-1.55, +1.45] (L0 = 3.00 cm), pinned at rear guide collar (-1.55):
      // Extends as hammer falls forward (+14%), then compresses to 0.85 when bolt re-cocks hammer!
      const pinAnchorX = -1.55;
      const swingExtend = seg(f, 0.045, 0.09) - seg(f, 0.34, 0.44);
      const overcockComp = seg(f, 0.34, 0.44) - seg(f, 0.9, 0.96);
      scaleX = 1 + 0.14 * swingExtend - 0.15 * overcockComp;
      dx = pinAnchorX * (1 - scaleX);
      break;
    }

    case 'garand_enbloc_clip': {
      // Signature upward en-bloc clip pop / ejector-spring tension pulse in Phase 4 [0.46, 0.58]
      const clipPop = seg(f, 0.46, 0.52) - seg(f, 0.54, 0.62);
      dy = 0.58 * clipPop;
      rz = 0.035 * clipPop;
      break;
    }

    case 'garand_follower': {
      // Lifts next staggered .30-06 cartridge upward inside the en-bloc clip [0.46, 0.72]
      const lift = seg(f, 0.46, 0.56) - seg(f, 0.64, 0.76);
      dy = 0.52 * lift;
      break;
    }

    case 'garand_follower_arm': {
      // Pivoting follower arm swings upward under op-rod spring rear thrust to lift follower!
      const lift = seg(f, 0.46, 0.56) - seg(f, 0.64, 0.76);
      rz = -0.095 * lift;
      dy = 0.22 * lift;
      break;
    }

    case 'garand_clip_latch': {
      // Left thumb clip latch rocks on pivot during Phase 4 clip-latch / ejector impulse
      const latchPulse = Math.sin(linearSeg(f, 0.45, 0.57) * Math.PI);
      ry = 0.15 * latchPulse;
      break;
    }

    case 'garand_op_rod_catch': {
      // Accelerator & op-rod catch linkage trips during full rearward stroke [0.45, 0.57]
      const catchPulse = Math.sin(linearSeg(f, 0.45, 0.57) * Math.PI);
      rz = -0.18 * catchPulse;
      break;
    }

    // garand_barrel (fixed!), garand_gas_cylinder, garand_receiver, garand_walnut_stock stay stationary
    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes .30-06 Springfield M2 Ball (150 gr @ 853 m/s, 345 MPa) internal & external ballistics:
 *  1. 150gr gilding-metal spitzer accelerating down the 24" (61.0 cm) barrel from chamber neck
 *     `[8.35, 1.15, 0]` past muzzle gas port `X = 59.60` (`f ≈ 0.198`) and exiting muzzle `X = 63.00`
 *     at **`muzzleExitF = 0.21`**!
 *  2. 63.3 mm `.30-06` brass case extracted with `boltDX` `[0.26, 0.45]` and kicked briskly
 *     forward-upward-right (authentic Garand 1–2 o'clock ejection!) at **`ejectF = 0.45`**!
 *  3. Next `.30-06` cartridge lifted inside `garand_enbloc_clip` by `garand_follower` and stripped
 *     up `garand_bullet_guide` into the chamber `[5.15, 1.15, 0]`!
 */
export function computeGarandBallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const { boltDX } = sampleGarandOperatingGroup(f);

  // 1. .30-06 M2 Ball 150gr Spitzer Projectile (exits 24" barrel X = 63.00 at muzzleExitF = 0.21!)
  const bulletVisible = f < 0.4;
  let bulletX = 8.35;
  let streakLength = 0;

  if (f >= 0.1 && f < 0.21) {
    const u = Math.pow(linearSeg(f, 0.1, 0.21), 1.42);
    bulletX = 8.35 + (63.0 - 8.35) * u;
    streakLength = 6.5 * u;
  } else if (f >= 0.21 && f < 0.4) {
    const u = linearSeg(f, 0.21, 0.4);
    bulletX = 63.0 + 78.0 * u;
    streakLength = 14.0 * (1 - u * 0.45);
  }

  // 2. Spent 63.3 mm .30-06 Brass Cartridge Case — Extracted [0.26, 0.45] & Ejected at ejectF = 0.45!
  const spentCaseVisible = f < 0.78;
  let caseX = 5.15;
  let caseY = 1.15;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.26 && f < 0.45) {
    caseX = 5.15 + boltDX;
  } else if (f >= 0.45 && f < 0.78) {
    const u = linearSeg(f, 0.45, 0.78);
    const ejectOriginX = 5.15 + sampleGarandOperatingGroup(0.45).boltDX;
    // Spring-loaded plunger ejector on bolt face hurls .30-06 brass to 1-2 o'clock (+X, +Y, +Z)!
    caseX = ejectOriginX + 8.4 * u;
    caseY = 1.15 + 10.5 * u - 11.8 * u * u;
    caseZ = 13.5 * u;
    caseRX = u * 8.6;
    caseRY = -u * 13.2;
    caseRZ = -u * 10.8;
    if (f > 0.65) {
      spentCaseOpacity = 1 - linearSeg(f, 0.65, 0.78);
    }
  }

  // 3. Chamber Ignition Glow, Under-Muzzle Gas Cylinder Port Tap & .30-06 Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.095 && f <= 0.175) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.095, 0.175) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.19 && f <= 0.275) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.19, 0.275) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.202 && f <= 0.3) {
    const u = linearSeg(f, 0.202, 0.3);
    muzzlePlumeScale = 0.55 + 1.85 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.88;
  }

  // 4. Next .30-06 Cartridge in 8-Rd En-Bloc Clip -> Lifted by Follower -> Stripped up Bullet Guide into Chamber!
  let nextX = -0.95;
  let nextY = 0.28;
  let nextRZ = 0.08;

  if (f >= 0.46 && f < 0.58) {
    const u = seg(f, 0.46, 0.58);
    nextX = -0.95 + 0.25 * u;
    nextY = 0.28 + 0.58 * u;
    nextRZ = 0.08 + 0.06 * u;
  } else if (f >= 0.58 && f < 0.82) {
    const u = seg(f, 0.58, 0.82);
    const guideArc = Math.sin(u * Math.PI) * 0.24;
    nextX = -0.7 + (5.15 - -0.7) * u;
    nextY = 0.86 + (1.15 - 0.86) * u + guideArc;
    nextRZ = 0.14 * (1 - u);
  } else if (f >= 0.82) {
    nextX = 5.15;
    nextY = 1.15;
    nextRZ = 0;
  }

  // 5. Staggered Reserve .30-06 Cartridge in En-Bloc Clip rising one half-step
  const clipAdvance = seg(f, 0.46, 0.68);
  const resX = -0.95;
  const resY = -0.52 + (0.28 - -0.52) * clipAdvance;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.15, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [59.6, 0.25, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, -0.22],
  };
}

export const GARAND_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  garand_walnut_stock: {
    albedoFile: 'garand_walnut_albedo.webp',
    normalFile: 'garand_walnut_normal.webp',
    roughnessFile: 'garand_walnut_roughness.webp',
    normalScale: 0.52,
  },
  garand_rear_handguard: {
    albedoFile: 'garand_walnut_albedo.webp',
    normalFile: 'garand_walnut_normal.webp',
    roughnessFile: 'garand_walnut_roughness.webp',
    normalScale: 0.46,
  },
  garand_front_handguard: {
    albedoFile: 'garand_walnut_albedo.webp',
    normalFile: 'garand_walnut_normal.webp',
    roughnessFile: 'garand_walnut_roughness.webp',
    normalScale: 0.46,
  },
  garand_receiver: {
    albedoFile: 'garand_parkerized_albedo.webp',
    normalFile: 'garand_parkerized_normal.webp',
    roughnessFile: 'garand_parkerized_roughness.webp',
    normalScale: 0.44,
  },
  garand_rear_sight: {
    albedoFile: 'garand_parkerized_albedo.webp',
    normalFile: 'garand_parkerized_normal.webp',
    roughnessFile: 'garand_parkerized_roughness.webp',
    normalScale: 0.38,
  },
  garand_op_rod: {
    albedoFile: 'garand_parkerized_albedo.webp',
    normalFile: 'garand_parkerized_normal.webp',
    roughnessFile: 'garand_parkerized_roughness.webp',
    normalScale: 0.42,
  },
  garand_bolt: {
    albedoFile: 'garand_parkerized_albedo.webp',
    normalFile: 'garand_parkerized_normal.webp',
    roughnessFile: 'garand_parkerized_roughness.webp',
    normalScale: 0.4,
  },
  garand_trigger_housing: {
    albedoFile: 'garand_parkerized_albedo.webp',
    normalFile: 'garand_parkerized_normal.webp',
    roughnessFile: 'garand_parkerized_roughness.webp',
    normalScale: 0.38,
  },
  garand_enbloc_clip: {
    albedoFile: 'garand_parkerized_albedo.webp',
    normalFile: 'garand_parkerized_normal.webp',
    roughnessFile: 'garand_parkerized_roughness.webp',
    normalScale: 0.48,
  },
};

export const GARAND_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'garand_walnut',
    weapon: GARAND_ID,
    titleCn:
      '二战美洲黑胡桃木生亚麻籽油枪托、前后护木与春田 DAS 军械火印贴图组',
    partTag: 'F-03 / F-04 / F-05 AMERICAN BLACK WALNUT',
    resolution: '2048 × 1024 px',
    summary:
      '专为 1944 年春田兵工厂（Springfield Armory）M1 伽兰德全尺寸木托烘焙的 2K 5 通道 Packed ORM 贴图组：细腻刻画北美黑胡桃心材山纹年轮、纵向导管微毛孔法线与生亚麻籽油温润半亚光包浆（Roughness ≈ 0.52，木材区零金属度 0.02 vs 护木钢箍 0.78）；左腮清晰压印二战美军「DAS」鹰徽验收框章与交叉双炮军械局火印，半手枪握把下缘冲印圆圈「[P]」高压强装药试射合格章。',
    highlights: [
      '北美黑胡桃木山纹心材、导管毛孔法线与亚麻籽油温润包浆 (0.52)',
      '左腮二战春田兵工厂交叉火炮军械徽与 DAS 国防鹰徽方框钢印',
      '半手枪握把颈实弹检验圆圈「[P]」印记与护木锰磷化钢箍金属分层',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'garand_walnut_albedo.webp',
        note: 'sRGB · 亚麻籽油浸润美洲黑胡桃心材 / DAS与交叉火炮印章 / 磷化钢箍',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'garand_walnut_normal.webp',
        note: 'Linear · 胡桃木纵向导管毛孔 + DAS/[P]木纹压陷方框 + 钢箍台阶',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'garand_walnut_roughness.webp',
        note: 'Linear · R:木孔压印AO / G:油润胡桃木(0.52) / B:木材绝缘(0.02)-钢箍金属(0.78)',
      },
    ],
  },
  {
    id: 'garand_parkerized',
    weapon: GARAND_ID,
    titleCn:
      '春田兵工厂锰系磷化锻造机匣、T105 觇孔表尺与 8 发弹簧钢漏夹贴图组',
    partTag: 'F-01 / F-02 / B-05 / B-06 / M-01 PARKERIZED STEEL',
    resolution: '2048 × 1024 px',
    summary:
      '真实还原二战美军标志性的微绿石板灰锰系磷化（Manganese-Phosphate Parkerizing）防锈晶粒层与枪油浸润质感：上栏在斜切机匣尾桥深镌「U.S. RIFLE / CAL. .30 M1 / SPRINGFIELD ARMORY / 2841944」五排历史滚印与右侧 T105 觇孔鼓轮 200-1200 码白字射表；中栏分离 S 型拉机柄亮白不锈钢活塞头与双突笋枪机闭锁面银白磨痕；底栏刻画 8 发弹簧钢漏夹「SA」厂标、定位凸筋与黄铜弹壳刮擦亮迹。',
    highlights: [
      '机匣尾桥 U.S. RIFLE CAL. .30 M1 SPRINGFIELD ARMORY 2841944 深镌钢印',
      '二战微绿石板灰锰系磷化晶粒层、T105 射表刻度与亮白不锈钢导气活塞',
      '8 发弹簧钢漏夹 SA 冲压钢印、双侧定位肋露白与 .30-06 铜壳摩擦痕',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'garand_parkerized_albedo.webp',
        note: 'sRGB · 二战绿灰锰系磷化钢 / 春田机匣铭文 / 亮白不锈钢活塞与闭锁笋',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'garand_parkerized_normal.webp',
        note: 'Linear · 磷酸锰微晶颗粒 + 机匣尾桥深凹钢印 + T105鼓轮滚花与漏夹肋',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'garand_parkerized_roughness.webp',
        note: 'Linear · 吸油磷化层(0.43) vs 无心磨削不锈钢活塞/磨亮闭锁突笋(0.19)',
      },
    ],
  },
  {
    id: 'garand_seamless_detail',
    weapon: GARAND_ID,
    titleCn: '24吋 .30-06 膛线枪管、不锈钢导气筒与快拆火控内件无缝细节贴图',
    partTag: '17 ORDNANCE BARREL & INTERNAL PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为 24 英寸四膛线 .30-06 阶梯枪管、410 不锈钢枪口导气筒、十字泄压阀螺塞、防早发长击针、一簧双用长复进簧、防滑钢托底板以及双挂钩锻造击锤、两道火扳机、杠杆托弹臂等全部 17 个精密军械内件提供微米级车削刀纹与金属油膜细节。',
    highlights: [
      '24 英寸铬钼钢枪管车削环纹、枪口三花键与四条右旋膛线金属高光',
      '410 不锈钢导气筒、防滑格纹钢托底板与翻转扳机护圈铣削拉丝',
      '覆盖其余全部 17 个二战美军制式步枪核心承压与火控传动构件',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 车铣拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于24"枪管/不锈钢导气筒/长击针/两道火扳机/托弹臂/托底板等',
      },
      {
        kind: 'Roughness',
        labelCn: '军械金属油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 磷化锻钢与不锈钢表面驻留枪油微光泽起伏',
      },
      {
        kind: 'Normal',
        labelCn: '微细颗粒基底法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 辅助微观表面漫反射散射与防滑接触面微纹理',
      },
    ],
  },
];

export const GARAND_PLUGIN: WeaponRuntimePlugin = {
  id: GARAND_ID,
  partGroups: GARAND_PART_GROUPS,
  timelinePresets: GARAND_TIMELINE_PRESETS,
  parts: GARAND_PARTS,
  firingPhases: GARAND_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(GARAND_FIRING_PHASES, f),
  computeFiringKinematics: computeGarandFiringKinematics,
  computeBallisticsState: computeGarandBallisticsState,
  pbrBindings: GARAND_PBR_BINDINGS,
  pbrSuites: GARAND_PBR_SUITES,
};
