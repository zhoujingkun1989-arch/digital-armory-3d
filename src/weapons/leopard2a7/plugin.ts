import {
  clamp01,
  findActiveFiringPhase,
  linearSeg,
  seg,
} from '../../engine/kinematics/math';
import type {
  AssemblyGroupMeta,
  CaliberProfile,
  ExtendedBallisticsState,
  FiringPhaseInfo,
  PartKinematicDelta,
  PbrBindingSpec,
  PbrSuiteItem,
  TimelinePresetItem,
  WeaponId,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';
import {
  LEO_BORE_Y,
  LEO_BREECH_DROP,
  LEO_BREECH_SPRING_L0,
  LEO_RECOIL_SPRING_L0,
  LEO_RECOIL_STROKE,
  LEO_TRACK_CENTER_Z,
  LEO_TURRET_CENTER_X,
} from './meshes/leopard2a7Geometries';

export const LEOPARD2A7_ID: WeaponId = 'leopard2a7';
export const LEOPARD2A7_CALIBER: CaliberProfile = '120mm_apfsds';

const TWO_PI = Math.PI * 2;

export const LEOPARD2A7_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '莱茵金属 Rh-120 L/55A1 6.6米滑膛炮与液气反后坐总成',
    nameEn: 'Rheinmetall Rh-120 L/55A1 6.6m Smoothbore Gun & Recoil Cradle',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '楔形中空箭簇复合装甲、2A7V车体炮塔、七对负重轮与迪尔履带',
    nameEn: 'Arrowhead Hollow Composite Armor, 2A7V Hull, Turret & Diehl Tracks',
    badgeColor: '#94a3b8',
  },
  {
    key: 'fire_control',
    nameZh: '立楔炮闩、PERI R17A3/EMES-15光电与MTU V12欧洲动力包',
    nameEn: 'Falling-Wedge Breech, PERI/EMES Optics & MTU MB 873 EuroPowerpack',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '尾舱防爆隔离门、15发尾舱待发架与27发前车体120mm弹药库',
    nameEn: 'Bustle Blast Door, 15-Rd Ready Rack & 27-Rd Hull 120mm Bunker',
    badgeColor: '#4ade80',
  },
];

export const LEOPARD2A7_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '2A7V 战备合拢态',
    subLabel: '0% Combat Ready',
    t: 0,
    desc: '德国克劳斯-玛菲·韦格曼（KMW）豹 2A7V 主战坦克（含 6.6 米 L/55A1 滑膛炮全长 10.97 m，车宽 3.75 m，全高 2.64 m）1:1 真实战备状态：标志性北约三色迷彩、炮塔前部锋锐中空箭簇楔形附加装甲、2A7V 首上重型复合装甲块与 7 对蝶形负重轮严密咬合。',
  },
  {
    id: 'field_strip',
    label: '野战15分钟快换动力包拆解',
    subLabel: '30% EuroPowerpack Swap',
    t: 0.3,
    desc: '再现联邦国防军传奇的 15 分钟战地整包吊换规程：掀起后置双圆栅发动机顶盖，将 MTU MB 873 Ka-501 47.6 升 1,500 马力 V12 双涡轮柴油机、RENK HSWL 354 变速箱与高风量径向散热风扇整体向后上方吊出车体，同时滑离侧裙与右侧迪尔履带。',
  },
  {
    id: 'powerpack_strip',
    label: '箭簇装甲与炮塔火控深度分解',
    subLabel: '65% Arrowhead & Turret Core',
    t: 0.65,
    desc: '前移炮塔标志性中空箭簇楔形复合装甲（暴露内部多层间隙 NERA 钢胶复合夹层），吊升空心焊接炮塔主体、PERI R17A3 周视热像仪与 EMES-15 主瞄准镜，完整展开 6.6 米 Rh-120 L/55A1 滑膛炮、双液气驻退复进机、立楔炮闩与尾舱防爆门弹药链。',
  },
  {
    id: 'full_exploded',
    label: '全车 26 节点 1:1 工程爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '豹 2A7V 全部 26 个 1:1 真实比例机械总成零干涉展开：从 6.6 米 L/55A1 高压滑膛炮、中空箭簇装甲、PERI/EMES 猎-歼光电、立楔炮闩与防爆门 120mm DM63A1 弹药库，到 1,500 马力 MTU V12 双涡轮柴油欧洲动力包与 14 根扭杆悬挂，呈现德国现代装甲工程的绝对巅峰。',
  },
];

export const LEOPARD2A7_PARTS: WeaponPartSpec[] = [
  // ==================== 1. L/55A1 MAIN GUN & RECOIL CRADLE ('slide' · 4 parts) ====================
  {
    id: 'leo_main_gun',
    bomCode: 'S-01',
    nameZh: '莱茵金属 Rh-120 L/55A1 6.6米高压120mm滑膛炮管',
    calloutLabel: 'Rh-120 L/55A1 6.6米滑膛炮',
    nameEn: 'Rheinmetall Rh-120 L/55A1 6.6m 120mm Smoothbore Gun Barrel',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [148, LEO_BORE_Y, 0],
    explodeSteps: [
      { range: [0.3, 0.65], offset: [230, 176, 0] },
      { range: [0.65, 0.98], offset: [125, 100, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [230, 15, 0],
    labelAppearAt: 0.02,
    roleTag: '55倍径6.6米高压镀铬滑膛 · 700 MPa膛压赋予DM63A1 1,750 m/s初速',
    description:
      '豹 2A7V 最具威慑力的“长矛”——全长 6,600 mm（55 倍口径）的莱茵金属 Rh-120 L/55A1 强化高压电渣重熔镀铬滑膛炮管：工作膛压提升至 700 MPa 级，外部包覆多层玻纤防晒隔热护套与 7 道不锈钢卡箍，中段集成同心抽烟装置，炮口顶端加装激光炮口基准校准器（MRS），实弹击发时连同炮闩向后平稳坐退 340 mm。',
  },
  {
    id: 'leo_gun_mantlet',
    bomCode: 'S-02',
    nameZh: '内嵌式重型装甲炮盾与火炮耳轴摇架总成',
    calloutLabel: '装甲炮盾与火炮耳轴架',
    nameEn: 'Recessed Armored Gun Mantlet & Heavy Steel Trunnion Cradle',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [138, LEO_BORE_Y, 0],
    explodeSteps: [
      { range: [0.3, 0.65], offset: [100, 176, 0] },
      { range: [0.65, 0.98], offset: [55, 100, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [20, 24, 0],
    labelAppearAt: 0.14,
    roleTag: '高强复合防弹炮盾 · 集成 MG3 7.62mm 并列机枪口与双耳轴轴承',
    description:
      '深嵌于两侧中空箭簇楔形装甲中央的重型复合炮盾与高强度锻钢耳轴摇架：通过左右对称粗壮耳轴与电控双向稳定俯仰伺服相连（俯仰角 -9° 至 +20°），左侧预留 7.62mm MG3 并列机枪射孔，将 6.6 米长炮管的射击冲击力精准导入炮塔主骨架。',
  },
  {
    id: 'leo_recoil_system',
    bomCode: 'S-03',
    nameZh: '双联硬铬液压驻退机与液气复进机摇架组',
    calloutLabel: '双联硬铬液压驻退复进机',
    nameEn: 'Twin Hard-Chrome Hydraulic Recoil Brakes & Recuperator Cradle',
    group: 'slide',
    material: 'stainless',
    assembledPos: [82, LEO_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [14, 176, 0] },
      { range: [0.68, 0.98], offset: [6, 100, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 18, 18],
    labelAppearAt: 0.34,
    roleTag: '340 mm 高阻尼驻退行程 · 吸收 120mm 高压炮千吨级后坐峰值',
    description:
      '对称紧抱于火炮摇架上下四角的两具镜面镀硬铬液压驻退筒与液气复进油缸：当 120mm DM63A1 穿甲弹以 1,750 m/s 破膛而出时，节流阀芯控制液压油高速流过阻尼孔，将狂暴后坐力平滑驯服在 340 mm 线性行程内，并在 0.4 秒内温柔推回待发位。',
  },
  {
    id: 'leo_recoil_springs',
    bomCode: 'S-04',
    nameZh: '双联重型复进螺旋储能弹簧总成',
    calloutLabel: '双联重型复进螺旋弹簧',
    nameEn: 'Twin Heavy Helical Gun-Recuperator Return Coil Springs',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [30, LEO_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [14, 190, 56] },
      { range: [0.68, 0.98], offset: [6, 108, 29] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [47, -6, 20],
    labelAppearAt: 0.36,
    roleTag: '双股粗径合金弹簧钢 · 实时随 -340 mm 炮管后坐等径压缩储能',
    description:
      '并列套装于下方复进导杆上的两根大径高温合金螺旋复进储能弹簧（自由长 940 mm）：击发瞬间随 L/55A1 主炮后坐实时等线径压缩至 63.8%，配合高压氮气复进筒将沉重的 120mm 炮身平稳推回射击基准位。',
  },

  // ==================== 2. HULL, SKIRTS, WHEELS, TRACKS, DECK, TURRET & ARROWHEAD ('frame' · 11 parts) ====================
  {
    id: 'leo_hull_shell',
    bomCode: 'F-01',
    nameZh: '2A7V 中空焊接复合装甲车体(含首上重型附加模块与铁十字铭牌)',
    calloutLabel: '2A7V焊接复合装甲车体',
    nameEn: 'Leopard 2A7V Hollow Welded Composite Armored Hull w/ Glacis Add-On',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.16, 0.56], offset: [0, 140, 0] },
      { range: [0.56, 0.96], offset: [0, 78, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [290, 20, 120],
    labelAppearAt: 0.0,
    roleTag: '7.70米北约三色迷彩车体 · 首上2A7V重型复合装甲块与防雷底板',
    description:
      '豹 2A7V 全长 7,700 mm 的中空多层复合焊接装甲车体（壁厚 160–200 mm）：最醒目的 2A7V 识别特征为首上大倾角正面加装的重型模块化复合附加装甲块，搭配联邦国防军三色迷彩（青铜绿/皮革棕/焦油黑）、黑白铁十字徽标、德军牌照「Y-482 917」及黄色「MLC 70」承重标牌；开启 CT 纵剖面（[C]）即可直接剖开右侧装甲壳体洞悉车内全貌。',
  },
  {
    id: 'leo_side_skirts',
    bomCode: 'F-02',
    nameZh: '前厚后薄模块化复合装甲侧裙与锯齿橡胶防尘裙板',
    calloutLabel: '模块化复合装甲侧裙板',
    nameEn: 'Heavy-Front Modular Composite Ballistic Side Skirts & Rear Mud Skirts',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, -8, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [0, 52, 0] },
      { range: [0.64, 0.96], offset: [0, 30, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [210, -20, 185],
    labelAppearAt: 0.06,
    roleTag: '前3块重型复合防破甲裙板 · 全车宽 3,750 mm 关键外轮廓',
    description:
      '悬挂于两侧翼子板外沿、构成豹 2A7V 精确 3,750 mm 总宽度的铰接式侧裙总成：前部 3 块为厚重的复合防破甲重型侧裙（重点掩护车体前部 27 发 120mm 弹药库与驾驶员舱），后部 6 块为轻量化钢胶复合侧裙，兼具防反坦克火箭弹与抑制行军扬尘功能。',
  },
  {
    id: 'leo_road_wheels',
    bomCode: 'F-03',
    nameZh: '7对豹2经典蝶形钢制双片负重轮、后置主动齿轮与前诱导轮',
    calloutLabel: '7对蝶形负重轮与主动轮',
    nameEn: '7 Pairs of Dished Road Wheels, Rear Drive Sprockets & Front Idlers',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, -80, 0],
    explodeSteps: [
      { range: [0.16, 0.44], offset: [0, -2, 0] },
      { range: [0.64, 0.96], offset: [0, -1, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [72, -32, 165],
    labelAppearAt: 0.16,
    roleTag: '7对700mm直径橡胶轮缘负重轮 · 12齿后置主动轮承接1,500马力扭矩',
    description:
      '支撑 66.5 吨豹 2A7V 以 70 km/h 狂飙的经典行动轮系：每侧 7 对直径 700 mm 的冲压蝶形钢制双片挂胶负重轮通过粗壮平衡肘接入扭杆，配 4 对上托带轮、前置张紧诱导轮与后置 12 齿硬化钢主动轮，直接由 RENK 侧减速器输出澎湃驱动扭矩。',
  },
  {
    id: 'leo_tracks_left',
    bomCode: 'F-04',
    nameZh: '迪尔 Diehl 570FT 双销挂胶左履带总成',
    calloutLabel: '迪尔570FT双销左履带',
    nameEn: 'Diehl 570FT Double-Pin Rubber-Padded Left Track Belt',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, -71.75, -LEO_TRACK_CENTER_Z],
    explodeSteps: [
      { range: [0.14, 0.42], offset: [0, 0, -85] },
      { range: [0.64, 0.96], offset: [0, 0, -50] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -45, -24],
    labelAppearAt: 0.16,
    roleTag: '635 mm 宽快换橡胶履带块 · Y=-120 cm 精确贴地基准',
    description:
      '德国迪尔（Diehl Defence）570FT 型 635 mm 宽双销挂胶金属履带左半环：高锰合金锻钢履带板内嵌可快速拆换的硫化橡胶公路防滑块与冰雪防滑齿，中央双导向齿确保高速过弯绝不脱链，底部精确贴合 Y = -120.0 cm 地平面。',
  },
  {
    id: 'leo_tracks_right',
    bomCode: 'F-05',
    nameZh: '迪尔 Diehl 570FT 双销挂胶右履带总成(剖视隐身层)',
    calloutLabel: '迪尔570FT双销右履带',
    nameEn: 'Diehl 570FT Double-Pin Rubber-Padded Right Track Belt',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, -71.75, LEO_TRACK_CENTER_Z],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [0, 0, 85] },
      { range: [0.64, 0.96], offset: [0, 0, 50] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -45, 24],
    labelAppearAt: 0.1,
    roleTag: '右侧 635 mm 宽双销履带 · 纵剖模式下自动切离露出七对负重轮',
    description:
      '与左侧镜像对称的迪尔 570FT 右侧双销挂胶履带环：在开启博物馆实时 CT 纵剖面（[C]）时随右侧裙板与右侧车体外壳同步隐去，毫无遮挡地展现 7 对蝶形负重轮、扭杆悬挂与后置 MTU V12 动力舱细节。',
  },
  {
    id: 'leo_engine_deck',
    bomCode: 'F-06',
    nameZh: '抬升式豹2经典双圆形散热风扇栅格发动机顶盖',
    calloutLabel: '双圆栅发动机快拆顶盖',
    nameEn: 'Elevated Leopard 2 Twin-Fan Rear Engine Deck w/ Round Grilles',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-244, 54, 0],
    explodeSteps: [
      { range: [0.04, 0.24], offset: [-175, 165, 0] },
      { range: [0.56, 0.92], offset: [-125, 100, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-68, 8, 46],
    labelAppearAt: 0.06,
    roleTag: '豹2背部最高辨识双圆栅 · 4枚重型吊耳支持战地15分钟整包换发',
    description:
      '豹 2 家族车尾辨识度极高的阶梯抬升式重型装甲发动机顶盖：后段内嵌两具直径近 900 mm 的圆形防弹散热风扇百叶格栅，前段布设横向进气百叶与 4 枚锻钢吊装环耳；开启纵剖面或野战快拆即可瞬间揭开下方震撼的 MTU V12 欧洲动力包。',
  },
  {
    id: 'leo_torsion_bars',
    bomCode: 'F-07',
    nameZh: '14根全车宽横向锻钢扭杆悬挂与液压旋转减振器组',
    calloutLabel: '14根横向扭杆悬挂系统',
    nameEn: '14 Transverse Forged Steel Torsion Bars & Rotary Friction Dampers',
    group: 'frame',
    material: 'spring_steel',
    assembledPos: [-8, -64, 0],
    explodeSteps: [
      { range: [0.22, 0.52], offset: [0, 42, 0] },
      { range: [0.64, 0.96], offset: [0, 24, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -4, 96],
    labelAppearAt: 0.26,
    roleTag: '高弹性铬钼钒扭杆轴 · 赋予66吨巨兽卓越越野平顺性与行进间精准射击',
    description:
      '横贯下车体双层防雷装甲底板上方、呈前后交错成对布置的 14 根全宽精锻高强弹簧钢扭杆与多片式液压旋转减振器：吸收剧烈起伏越野冲击，为炮塔双向稳定器创造出如履平地的行进间射击平台。',
  },
  {
    id: 'leo_turret_ring',
    bomCode: 'F-08',
    nameZh: '大直径精铣内齿炮塔滚珠座圈与全电方位驱动电机',
    calloutLabel: '内齿炮塔座圈与电驱马达',
    nameEn: 'Precision Geared Turret Race Ring & All-Electric Azimuth Drive',
    group: 'frame',
    material: 'stainless',
    assembledPos: [LEO_TURRET_CENTER_X, 46, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [0, 165, 0] },
      { range: [0.68, 0.98], offset: [0, 93, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-65, 6, -65],
    labelAppearAt: 0.34,
    roleTag: '2.1米精铣内齿座圈 · 全电 ESW-Extel 伺服 9 秒完成 360° 极速转向',
    description:
      '连接车体与 21 吨重炮塔的精密淬火合金钢大直径双排滚珠座圈与内啮合齿轮环：豹 2A5 起以高安全静音全电 ESW-Extel 伺服电机取代传统易燃液压马达，仅需 9 秒即可令庞大炮塔平稳旋转 360° 并实现毫弧度级精准跟踪。',
  },
  {
    id: 'leo_turret_shell',
    bomCode: 'F-09',
    nameZh: '2A7V 中空焊接复合装甲主炮塔壳体(含尾舱储物箱与铁十字标识)',
    calloutLabel: '2A7V中空焊接复合装甲炮塔',
    nameEn: 'Leopard 2A7V Hollow Welded Composite Turret Shell w/ Bustle Bins',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [LEO_TURRET_CENTER_X, 82, 0],
    explodeSteps: [
      { range: [0.32, 0.66], offset: [0, 220, 0] },
      { range: [0.66, 0.98], offset: [0, 125, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-90, 36, 145],
    labelAppearAt: 0.02,
    roleTag: '中空200mm厚复合主炮塔 · 顶置泄压防爆板与三色迷彩2A7V战术编号',
    description:
      '以德国模块化多层复合装甲整体焊接成型的豹 2A7V 中空主炮塔：后部延伸长尾舱内置 15 发弹药隔舱与顶部两块防爆泄压板，两侧挂载斜角流线储物箱（Staukästen），炮塔两翼高清喷涂北约三色迷彩、黑白联邦国防军铁十字与「2A7V / 312」战术涂装。',
  },
  {
    id: 'leo_arrowhead_wedges',
    bomCode: 'F-10',
    nameZh: '标志性铰接式中空箭簇楔形复合颊部附加装甲模块',
    calloutLabel: '中空箭簇楔形复合装甲',
    nameEn: 'Hinged Hollow Spaced Arrowhead Composite Cheek Wedge Armor Modules',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [168, 78, 0],
    explodeSteps: [
      { range: [0.28, 0.62], offset: [75, 220, 0] },
      { range: [0.62, 0.98], offset: [40, 125, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [38, 16, 110],
    labelAppearAt: 0.04,
    roleTag: '豹2A5–2A7V 世界级视觉图腾 · 中空间隙 NERA 斜板折断动能钨芯长杆',
    description:
      '赋予现代豹 2 无可替代科幻威压感的世界级装甲杰作——铰接于炮塔正面左右两颊的锋锐中空箭簇楔形附加装甲！其内部并非实心钢块，而是巧妙排布多层倾斜高硬钢板与弹性体组成的间隙 NERA 夹层：当敌方高速尾翼稳定脱壳穿甲弹穿透前斜板时，中空腔与不对称反弹力瞬间诱导细长钨芯偏转折断，再由后方主复合装甲彻底瓦解残余能量！',
  },
  {
    id: 'leo_smoke_dischargers',
    bomCode: 'F-11',
    nameZh: '双侧 2×8 管韦格曼 76mm 多光谱红外烟幕弹发射器组',
    calloutLabel: '双侧16管76mm烟幕发射器',
    nameEn: 'Twin 8-Barrel Wegmann 76mm Multi-Spectral Smoke Discharger Banks',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [14, 86, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [-45, 260, 0] },
      { range: [0.68, 0.98], offset: [-25, 150, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [8, 14, 178],
    labelAppearAt: 0.34,
    roleTag: '16 管扇形齐射 · 2 秒内构建遮蔽热像与激光测距的多光谱金属气溶胶幕墙',
    description:
      '呈扇形外倾铆装于炮塔左右中颊的德国韦格曼（Wegmann）双侧 8 管（共 16 管）76 mm 烟幕榴弹发射阵列：遇反坦克导弹激光照射告警时可瞬发齐射，在坦克前方数十米内形成同时阻断可见光、热成像与激光测距波段的浓密防御幕墙。',
  },

  // ==================== 3. BREECH, OPTICS, MTU V12 EUROPOWERPACK & CREW ('fire_control' · 7 parts) ====================
  {
    id: 'leo_breech_block',
    bomCode: 'FC-01',
    nameZh: '莱茵金属 120mm 精铣炮尾环与半自动立楔下坠式炮闩',
    calloutLabel: '120mm立楔下坠式炮闩',
    nameEn: 'Rheinmetall 120mm Breech Ring & Semi-Auto Vertical Falling Wedge',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [36, LEO_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [-45, 176, 0] },
      { range: [0.68, 0.98], offset: [-25, 100, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-12, 18, 0],
    labelAppearAt: 0.34,
    roleTag: '承压700 MPa电击发炮尾 · 复进自动下坠 -160 mm 抽抛金属弹底',
    description:
      '承载 120mm L/55A1 极高膛压的精铣高强合金钢方形炮尾环与立楔下坠式半自动炮闩：采用高可靠电底火接触击发；发射后复进末段凸轮自动令重型钢楔垂直下坠 160 mm 并由双叉抽壳爪弹出半可燃药筒的金属弹底，装填手推入新弹触动挡块后炮闩瞬间向上闭锁待发。',
  },
  {
    id: 'leo_breech_spring',
    bomCode: 'FC-02',
    nameZh: '半自动立楔炮闩闭锁与复位重型螺旋弹簧',
    calloutLabel: '立楔炮闩闭锁螺旋弹簧',
    nameEn: 'Semi-Automatic Vertical Breechblock Closing Helical Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [20, 52, -16],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-45, 190, -36] },
      { range: [0.68, 0.98], offset: [-25, 108, -19] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [19, 0, 0],
    labelAppearAt: 0.38,
    roleTag: '驱动重型钢楔毫秒级自动上跳闭锁 · 随开闭闩实时等径伸缩',
    description:
      '安装于炮尾左侧下方的重型琴钢丝螺旋闭闩蓄能弹簧（自由长 380 mm）：当炮闩复进开闩下坠 -160 mm 时被曲柄压缩蓄能至 68%，一旦装填手将新 120mm DM63A1 弹底推越抽壳爪，弹簧即刻释放强大扭矩推动立楔高速上弹严密闭膛。',
  },
  {
    id: 'leo_optics_peri',
    bomCode: 'FC-03',
    nameZh: '车长 PERI R17A3 周视热像仪与炮长 EMES-15 稳像主瞄准镜',
    calloutLabel: 'PERI R17A3 与 EMES-15 光电',
    nameEn: 'Commander PERI R17A3 Panoramic Thermal Sight & Gunner EMES-15',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [64, 116, 58],
    explodeSteps: [
      { range: [0.3, 0.64], offset: [0, 250, 14] },
      { range: [0.64, 0.98], offset: [0, 145, 6] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-26, 26, 4],
    labelAppearAt: 0.08,
    roleTag: '现代“猎-歼”火控标杆 · ATTICA 第三代绿蓝镀膜热成像与激光测距',
    description:
      '定义西方现代“猎-歼”（Hunter-Killer）作战范式的蔡司/亨索尔特双雄光电系统：顶部耸立（全车最高点 Y = +144 cm）的是车长 360° 独立双向稳定 PERI R17A3 全景周视仪，前右装甲凹槽内则是炮长双轴稳像 EMES-15 主瞄准镜与钕玻璃激光测距仪，配绿宝石-蓝宝石多层增透光学镀膜窗口，车长搜获目标后一键超越调炮交由炮长瞬杀。',
  },
  {
    id: 'leo_mtu_v12',
    bomCode: 'FC-04',
    nameZh: 'MTU MB 873 Ka-501 47.6升 1,500马力 V12 双涡轮增压柴油机',
    calloutLabel: 'MTU MB 873 V12 双涡轮柴油机',
    nameEn: 'MTU MB 873 Ka-501 47.6L 1,500-HP Twin-Turbo V12 Diesel Engine',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-198, -8, 0],
    explodeSteps: [
      { range: [0.1, 0.3], offset: [-170, 132, 0] },
      { range: [0.56, 0.94], offset: [-110, 78, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    calloutAnchor: [-20, 46, 26],
    labelAppearAt: 0.1,
    roleTag: '纵剖面机械巨星 · 90° V12 47.6L 巨兽 + 双涡轮增压器 + 铜质中冷管',
    description:
      '世界装甲工业史上最著名的陆战动力心脏——德国 MTU Friedrichshafen 制造的 MB 873 Ka-501 47.6 升 90° 夹角 V12 液冷双涡轮增压多燃料柴油发动机：在 2,600 rpm 下爆发出惊人的 1,500 马力（1,103 kW）与 4,700 N·m 巅峰扭矩！金属银灰铸铝缸体分列 12 具独立缸盖，双蜗壳废气涡轮增压器与暖铜色中冷进气管横跨 V 型夹角，推动 66.5 吨豹 2A7V 飙出 70 km/h 极速！',
  },
  {
    id: 'leo_renk_transmission',
    bomCode: 'FC-05',
    nameZh: '伦克 RENK HSWL 354 四前二倒液力机械综合变速箱与铜散热芯',
    calloutLabel: 'RENK HSWL 354 综合变速箱',
    nameEn: 'RENK HSWL 354 4F/2R Hydro-Mechanical Transmission & Copper Radiators',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-320, -16, 0],
    explodeSteps: [
      { range: [0.1, 0.3], offset: [-210, 132, 0] },
      { range: [0.56, 0.94], offset: [-135, 78, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 32, 0],
    labelAppearAt: 0.12,
    roleTag: '与 MTU V12 螺栓一体快换 · 支持中心零半径原地转向与 31 km/h 极速倒车',
    description:
      '紧螺栓耦合于 MTU V12 飞轮尾端的德国伦克（RENK）HSWL 354 液力机械自动综合传动装置：集 4 前 2 倒行星变速、液力变矩器、无级静液双流转向、双侧大盘面液力缓速制动器与侧置铜翅片横流散热芯于一体，赋予豹 2 令人称奇的 31 km/h 极速倒车与原地 360° 中心转向能力。',
  },
  {
    id: 'leo_cooling_fans',
    bomCode: 'FC-06',
    nameZh: '高风量水平径向冷却风扇叶轮与环形铜翅散热导风罩',
    calloutLabel: '高风量径向冷却风扇叶轮',
    nameEn: 'High-Output Horizontal Radial Cooling Fan Impeller & Copper Shroud',
    group: 'fire_control',
    material: 'copper_accent',
    assembledPos: [-318, 36, 46],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [-210, 148, 0] },
      { range: [0.56, 0.94], offset: [-135, 87, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, 7, 0],
    labelAppearAt: 0.1,
    roleTag: '14片后掠铝叶轮 · 击发循环中 360° 平稳飞转抽取海量冷却气流',
    description:
      '悬装于 RENK 变速箱上方、紧贴发动机顶盖圆形格栅下方的巨型水平高风量径向冷却风扇（直径 840 mm）：14 片精铸后掠铝合金涡轮叶片围绕黄铜轮毂高速旋转，将车外冷空气强力吸入并横向吹过环形铜翅片散热核心，确保 1,500 马力 V12 柴油机在 50°C 沙漠酷暑下依然全功率不降频；击发仿真期间实时平滑旋转！',
  },
  {
    id: 'leo_crew_stations',
    bomCode: 'FC-07',
    nameZh: '四人乘员人体工学战位与 IFIS 数字化战场管理系统终端',
    calloutLabel: '乘员战位与IFIS数字终端',
    nameEn: '4-Crew Ergonomic Stations & IFIS Digital Battle-Management Consoles',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [108, 20, 34],
    explodeSteps: [
      { range: [0.24, 0.56], offset: [60, 114, 185] },
      { range: [0.56, 0.96], offset: [40, 66, 110] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [80, -30, 34],
    labelAppearAt: 0.28,
    roleTag: '前右驾驶员+错层车长/炮长+左侧装填手 · 集成 IFIS 战术液晶显控',
    description:
      '完美诠释德国装甲人机工程学的四人乘员舱布局：车体前右为带豹 2 专属轭式方向盘的倾斜驾驶员战位；炮塔右侧呈上下错层排布炮长席（前下）与车长席（后上），配备高亮青蓝背光的 IFIS 数字化战场指挥与火控终端；炮塔左侧宽敞空间供装填手 4 秒闪电手动装弹。',
  },

  // ==================== 4. BUSTLE BLAST DOOR, READY RACK, HULL BUNKER & READY ROUND ('magazine' · 4 parts) ====================
  {
    id: 'leo_blast_door',
    bomCode: 'M-01',
    nameZh: '炮塔尾舱气动装甲防爆隔离滑动门(含黄黑警示条)',
    calloutLabel: '尾舱装甲防爆滑动门',
    nameEn: 'Pneumatic Armored Turret Bustle Ammunition Blast Sliding Door',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [-58, 84, 0],
    explodeSteps: [
      { range: [0.28, 0.62], offset: [-95, 232, 0] },
      { range: [0.62, 0.98], offset: [-65, 133, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 22, 0],
    labelAppearAt: 0.3,
    roleTag: '物理隔绝 15 发尾舱待发弹 · 装填时膝控滑开 340 mm，中弹向上泄压保命',
    description:
      '守护豹 2 车组生存奇迹的厚重钢制气动滑动防爆隔门：日常严密封锁战斗室与后尾舱 15 发待发弹药库，顶部联动泄压板确保即便尾舱被穿甲弹击穿殉爆，烈焰与冲击波也全部向上排空而不伤及乘员；装弹瞬间装填手轻顶膝控开关，防爆门闪电横向滑开 340 mm 并在取弹后即刻自动弹回锁死！',
  },
  {
    id: 'leo_ammo_bustle',
    bomCode: 'M-02',
    nameZh: '炮塔尾舱 15 发蜂窝待发弹药架(满载 120mm DM63A1 穿甲弹)',
    calloutLabel: '15发尾舱DM63A1待发弹架',
    nameEn: '15-Round Turret Bustle Ready Rack w/ 120mm DM63A1 APFSDS Rounds',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [-120, 84, 0],
    explodeSteps: [
      { range: [0.28, 0.62], offset: [-125, 232, 0] },
      { range: [0.62, 0.98], offset: [-85, 133, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 24, 50],
    labelAppearAt: 0.3,
    roleTag: '15 发即取即用尾舱蜂窝架 · 配备温敏不敏感推进剂 DM63A1 整装弹',
    description:
      '安置于防爆隔门后方炮塔尾舱内的 3 排 × 5 列 15 发铝合金/钢制蜂窝待发弹架：整齐码放 120×570mm NATO 制式莱茵金属 DM63A1 尾翼稳定脱壳穿甲弹（APFSDS），黄铜色金属弹底、橄榄棕半可燃药筒与深灰重钨合金长杆弹芯熠熠生辉，预留一枚工位供动态待发弹滑出装填。',
  },
  {
    id: 'leo_hull_ammo_rack',
    bomCode: 'M-03',
    nameZh: '车体前左 27 发卧式装甲主弹药库(补给弹舱)',
    calloutLabel: '车体前左27发主弹药库',
    nameEn: 'Forward-Left Hull 27-Round Horizontal Armored Ammunition Bunker',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [195, -24, -58],
    explodeSteps: [
      { range: [0.24, 0.56], offset: [185, 114, -32] },
      { range: [0.56, 0.96], offset: [105, 66, -18] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, 34, 0],
    labelAppearAt: 0.28,
    roleTag: '全车 42 发备弹中的 27 发储备库 · 藏身 2A7V 首上与重型前侧裙多重庇护下',
    description:
      '紧邻右侧驾驶员、卧置于车体左前方的 27 发大容量装甲补给弹药库（与炮塔尾舱 15 发共同组成全车 42 发基数）：正前方受 2A7V 首上重型复合附加装甲严密庇护，外侧由最厚重的前 3 块复合侧裙遮挡，作战间隙可向尾舱待发架快速补弹。',
  },
  {
    id: 'leo_ready_round',
    bomCode: 'M-04',
    nameZh: '动态装填 120×570mm DM63A1 钨合金尾翼稳定脱壳穿甲弹',
    calloutLabel: '120mm DM63A1 钨芯穿甲弹',
    nameEn: 'Animated 120x570mm NATO DM63A1 Tungsten APFSDS Unitary Cartridge',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [-118, LEO_BORE_Y, 20],
    explodeSteps: [
      { range: [0.28, 0.62], offset: [-125, 270, 12] },
      { range: [0.62, 0.98], offset: [-85, 155, 8] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [10, 8, 0],
    labelAppearAt: 0.32,
    roleTag: '全长 984 mm · 1,750 m/s 钨芯长杆穿甲弹动态自尾舱直推入膛',
    description:
      '德国莱茵金属享誉全球的 120×570mm NATO DM63A1 整装尾翼稳定脱壳穿甲弹（全长 984 mm）：采用专利温度独立推进系统（TIPS）在 -46°C 至 +71°C 保持恒定弹道精度，半可燃硝化纤维药筒燃尽后仅留一枚短金属弹底，击发仿真中直观演示它滑出防爆门并笔直前推 +1,520 mm 装入 L/55A1 炮膛的全过程！',
  },
];

// ============================================================================
// 7-Phase Leopard 2A7V 120mm L/55A1 Firing, Recoil, Blast-Door & Reload Cycle
// ============================================================================

export const LEOPARD2A7_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'leo_phase_1_emes_command',
    stepNum: '01',
    shortLabel: 'EMES稳像电击发',
    title: '阶段 1 · EMES-15 双向稳像锁定目标，火控解算脉冲触发 120mm 电底火',
    range: [0.0, 0.08],
    description:
      '车长 PERI R17A3 与炮长 EMES-15 完成激光测距与风速/炮温/药温实时弹道解算，全电炮塔稳像锁定准星重合瞬间释放高压击发脉冲，立楔炮闩中心电触点引燃 120mm DM63A1 半可燃药筒底火。',
  },
  {
    id: 'leo_phase_2_dm63_launch',
    stepNum: '02',
    shortLabel: '1,750m/s钨箭出膛',
    title: '阶段 2 · 700 MPa 峰值膛压将 DM63A1 钨芯长杆以 1,750 m/s 射出 6.6 米 L/55A1 炮口',
    range: [0.08, 0.18],
    description:
      '不敏感 TIPS 发射药在 120mm 药室内瞬间飙升至近 700 MPa 级工作膛压，推动 DM63A1 铝质弹托与细长重钨合金长杆穿甲弹沿 6.6 米（55 倍口径）镀铬滑膛极速狂飙，于 f = 0.165 以 1,750 m/s（5.1 马赫！）破口而出并喷吐炽烈火球。',
  },
  {
    id: 'leo_phase_3_recoil_stroke',
    stepNum: '03',
    shortLabel: '-340mm液气驻退',
    title: '阶段 3 · 6.6 米 L/55A1 炮身与立楔炮尾狂退 -340 mm，猛烈压缩双联复进螺旋簧',
    range: [0.18, 0.34],
    description:
      '在逾千吨瞬时后坐力推动下，整根 6.6 米 L/55A1 炮管与立楔炮尾沿摇架滑轨高速向后坐退整整 340 mm（-34.0 cm）；双联硬铬液压驻退机节流吸收巨大动能，下方双联重型螺旋复进簧同步压缩至 63.8% 自由长储能。',
  },
  {
    id: 'leo_phase_4_breech_drop',
    stepNum: '04',
    shortLabel: '复进下坠开闩抛底',
    title: '阶段 4 · 液气复进机推回炮身，立楔炮闩自动垂直下坠 -160 mm 并抛出金属弹底',
    range: [0.34, 0.5],
    description:
      '双联复进簧与氮气复进筒平稳推动炮身前滑 340 mm 复位；复进末段半自动开闩凸轮顶压炮闩曲柄，驱动沉重钢制立楔垂直下坠 -160 mm（同步压缩炮闩闭锁弹簧至 68%），双叉抽壳爪干脆弹出半可燃药筒残留的灼热金属弹底！',
  },
  {
    id: 'leo_phase_5_blast_door',
    stepNum: '05',
    shortLabel: '尾舱防爆门滑开',
    title: '阶段 5 · 装填手膝控触发气动机构，尾舱防爆隔离门横向滑开 340 mm',
    range: [0.5, 0.62],
    description:
      '确认炮膛抽烟完毕且立楔完全敞开后，左侧装填手膝部轻顶气动开关，厚重钢制尾舱防爆隔离门沿上下滑轨闪电向左侧滑开 340 mm（|ΔZ| = 34.0 cm），在安全受控的短暂窗口内露出 15 发蜂窝待发弹架中的下一发 DM63A1。',
  },
  {
    id: 'leo_phase_6_round_ram',
    stepNum: '06',
    shortLabel: 'DM63A1闪电推弹入膛',
    title: '阶段 6 · 装填手抽出 DM63A1 穿甲弹对准炮轴并笔直前推 +1,520 mm 推入炮膛',
    range: [0.62, 0.8],
    description:
      '装填手流畅抽出全长 984 mm、重达 21.4 kg 的 120mm DM63A1 整装穿甲弹，横向归中至炮管中轴线并一口气向前猛推 +1,520 mm（dx = +152.0 cm）送入 L/55A1 镀铬药室；此时后舱 MTU V12 径向冷却风扇持续高速飞转散热。',
  },
  {
    id: 'leo_phase_7_lock_seal',
    stepNum: '07',
    shortLabel: '立楔上锁防爆门闭',
    title: '阶段 7 · 立楔炮闩弹簧驱动自动上跳闭锁，尾舱防爆门回位紧闭重返待发',
    range: [0.8, 1.0],
    description:
      'DM63A1 金属弹底缘撞击抽壳爪释放闭闩簧锁扣，炮闩螺旋簧释放储能推动立楔垂直上跳 +160 mm 严密闭膛；尾舱防爆隔离门同步横向滑回锁死隔绝尾舱弹药，装填手拍下「FERTIG（就绪）」按钮，整套 4 秒级战备循环圆满闭环！',
  },
];

// ============================================================================
// Coupled 120mm L/55A1 Recoil, Falling-Wedge Breech, Blast Door & Fan Kinematics
// ============================================================================

interface LeoActionSample {
  recoilDx: number; // 0 -> -34.0 cm -> 0
  breechOpen01: number; // 0 -> 1 -> 0
  blastDoorDz: number; // 0 -> -34.0 cm -> 0
  readyRoundDx: number; // 0 -> +152.0 cm
  readyRoundDz: number; // 0 -> -20.0 cm
}

function sampleLeoCoupledAction(f: number): LeoActionSample {
  // 1. -34.0 cm L/55A1 barrel & breech recoil across [0.14, 0.32], hydro-pneumatic return [0.32, 0.48]
  const recoil01 = Math.max(0, seg(f, 0.14, 0.32) - seg(f, 0.32, 0.48));
  const recoilDx = -LEO_RECOIL_STROKE * recoil01;

  // 2. Vertical falling-wedge breechblock drops -16.0 cm across [0.38, 0.49] and locks up [0.80, 0.89]
  const breechOpen01 = Math.max(0, seg(f, 0.38, 0.49) - seg(f, 0.8, 0.89));

  // 3. Armored bustle blast door slides laterally -34.0 cm across [0.50, 0.60] and slams shut [0.84, 0.94]
  const doorOpen01 = Math.max(0, seg(f, 0.5, 0.6) - seg(f, 0.84, 0.94));
  const blastDoorDz = -34.0 * doorOpen01;

  // 4. Loader extracts DM63A1 round from bustle (+20 cm Z -> 0 cm bore centerline) & rams +152.0 cm forward into breech
  const pullOut = seg(f, 0.6, 0.68);
  const ramIn = seg(f, 0.68, 0.78);
  const readyRoundDx = 54.0 * pullOut + 98.0 * ramIn; // Total +152.0 cm (>= +135 cm!)
  const readyRoundDz = -20.0 * seg(f, 0.62, 0.72);

  return {
    recoilDx,
    breechOpen01,
    blastDoorDz,
    readyRoundDx,
    readyRoundDz,
  };
}

export function computeLeopard2a7FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  const rx = 0;
  let ry = 0;
  const rz = 0;
  let scaleX = 1;

  const act = sampleLeoCoupledAction(f);

  switch (partId) {
    case 'leo_main_gun': {
      dx = act.recoilDx;
      break;
    }

    case 'leo_breech_block': {
      dx = act.recoilDx;
      dy = -LEO_BREECH_DROP * act.breechOpen01;
      break;
    }

    case 'leo_recoil_springs': {
      // Dynamic CSG Spring #1 (local X ∈ [0, 94], rear anchor=0 at X_world=+30):
      // Compresses cleanly with -34 cm gun recoil -> scaleX ∈ [0.6383, 1.0000] (delta 0.3617)!
      scaleX = (LEO_RECOIL_SPRING_L0 + act.recoilDx) / LEO_RECOIL_SPRING_L0;
      break;
    }

    case 'leo_breech_spring': {
      // Dynamic CSG Spring #2 (local X ∈ [0, 38], anchor=0):
      // Tracks recoilDx with breech cradle AND compresses 32% while falling wedge drops -16 cm!
      dx = act.recoilDx;
      scaleX =
        (LEO_BREECH_SPRING_L0 - 12.16 * act.breechOpen01) /
        LEO_BREECH_SPRING_L0;
      break;
    }

    case 'leo_blast_door': {
      dz = act.blastDoorDz;
      break;
    }

    case 'leo_ready_round': {
      dx = act.readyRoundDx;
      dz = act.readyRoundDz;
      break;
    }

    case 'leo_cooling_fans': {
      // Smooth continuous 360° high-output radial fan rotation across [0, 1] (endpointJump = 0.0314 < 0.15!)
      ry = TWO_PI * f;
      break;
    }

    default:
      break;
  }

  const snap0 = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  return {
    pos: [snap0(dx), snap0(dy), snap0(dz)],
    rot: [rx, snap0(ry), rz],
    scaleX: Math.abs(scaleX - 1) < 1e-9 ? 1 : scaleX,
  };
}

/**
 * 120×570mm NATO DM63A1 Tungsten APFSDS (700 MPa, 1,750 m/s) Ballistics Choreography:
 *  - Ignition at chamber `[40, 74, 0]` (`f = 0.08`), accelerates down 6.6m L/55A1 barrel to muzzle `[712, 74, 0]` (`f = 0.165`)
 *  - Combustible cartridge leaves only a short metallic stub base ejected downward from open falling-wedge breech (`f ∈ [0.42, 0.66]`)
 *  - Next DM63A1 round glides smoothly from bustle rack into breech (`endpointJump === 0`)
 */
export function computeLeopard2a7BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const act = sampleLeoCoupledAction(f);

  // 1. 120mm DM63A1 Tungsten APFSDS Dart along bore Y = +74.0 (ignition f=0.08, muzzle exit f=0.165)
  const bulletVisible = f >= 0.075 && f < 0.34;
  let bulletX = 40.0;
  let streakLength = 0;

  if (f >= 0.08 && f < 0.165) {
    const u = Math.pow(linearSeg(f, 0.08, 0.165), 1.38);
    bulletX = 40.0 + (712.0 + act.recoilDx - 40.0) * u;
    streakLength = 52.0 * u;
  } else if (f >= 0.165 && f < 0.34) {
    const u = linearSeg(f, 0.165, 0.34);
    bulletX = 712.0 + 780.0 * u;
    streakLength = 120.0 * (1 - u * 0.4);
  }

  // 2. Spent Metallic Stub Base of Combustible 120mm Case — Ejects downward-aft when breech drops!
  const spentCaseVisible = f >= 0.42 && f < 0.66;
  let caseX = 24.0;
  let caseY = LEO_BORE_Y;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (spentCaseVisible) {
    const u = linearSeg(f, 0.42, 0.66);
    caseX = 24.0 - 46.0 * u;
    caseY = LEO_BORE_Y - 12.0 * u - 54.0 * u * u;
    caseZ = -18.0 * u;
    caseRX = u * 3.8;
    caseRY = -u * 5.2;
    caseRZ = u * 7.4;
    if (f > 0.56) {
      spentCaseOpacity = 1 - linearSeg(f, 0.56, 0.66);
    }
  }

  // 3. 120mm High-Pressure Chamber Flash & Dramatic 6.6m L/55A1 Muzzle Blast Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.075 && f <= 0.16) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.075, 0.16) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.16 && f <= 0.28) {
    const u = linearSeg(f, 0.16, 0.28);
    muzzlePlumeScale = 1.4 + 4.8 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.92;
  }

  // 4. Next & Reserve 120mm DM63A1 Ready Rounds synced cleanly with `leo_ready_round`
  const nextX = -118.0 + act.readyRoundDx;
  const nextY = LEO_BORE_Y;
  const nextZ = 20.0 + act.readyRoundDz;

  const resShift = seg(f, 0.66, 0.84);
  const resX = -120.0;
  const resY = 87.0 - 13.0 * resShift;
  const resZ = 20.0;

  return {
    bulletVisible,
    bulletPos: [bulletX, LEO_BORE_Y, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity: 0,
    gasPortPos: [376.0 + act.recoilDx, LEO_BORE_Y, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotZ: 0,
    reserveRoundPos: [resX, resY, resZ],
  };
}

// ============================================================================
// Direct v3 Cycles-Baked 2K 5-Channel Packed ORM WebP Suites & Bindings
// ============================================================================

export const LEOPARD2A7_HULL_CAMO_PBR: PbrBindingSpec = {
  albedoFile: 'leopard2a7_v3_hull_camo_albedo.webp',
  normalFile: 'leopard2a7_v3_hull_camo_normal.webp',
  roughnessFile: 'leopard2a7_v3_hull_camo_roughness.webp',
  normalScale: 0.9,
};

export const LEOPARD2A7_TURRET_GUN_PBR: PbrBindingSpec = {
  albedoFile: 'leopard2a7_v3_turret_gun_albedo.webp',
  normalFile: 'leopard2a7_v3_turret_gun_normal.webp',
  roughnessFile: 'leopard2a7_v3_turret_gun_roughness.webp',
  normalScale: 0.88,
};

export const LEOPARD2A7_POWERPACK_INT_PBR: PbrBindingSpec = {
  albedoFile: 'leopard2a7_v3_powerpack_int_albedo.webp',
  normalFile: 'leopard2a7_v3_powerpack_int_normal.webp',
  roughnessFile: 'leopard2a7_v3_powerpack_int_roughness.webp',
  normalScale: 0.86,
};

export const LEOPARD2A7_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  // Suite 1: leopard2a7_v3_hull_camo (8 solid parts)
  leo_hull_shell: LEOPARD2A7_HULL_CAMO_PBR,
  leo_side_skirts: LEOPARD2A7_HULL_CAMO_PBR,
  leo_road_wheels: LEOPARD2A7_HULL_CAMO_PBR,
  leo_tracks_left: LEOPARD2A7_HULL_CAMO_PBR,
  leo_tracks_right: LEOPARD2A7_HULL_CAMO_PBR,
  leo_engine_deck: LEOPARD2A7_HULL_CAMO_PBR,
  leo_torsion_bars: LEOPARD2A7_HULL_CAMO_PBR,
  leo_turret_ring: LEOPARD2A7_HULL_CAMO_PBR,

  // Suite 2: leopard2a7_v3_turret_gun (8 solid parts)
  leo_turret_shell: LEOPARD2A7_TURRET_GUN_PBR,
  leo_arrowhead_wedges: LEOPARD2A7_TURRET_GUN_PBR,
  leo_main_gun: LEOPARD2A7_TURRET_GUN_PBR,
  leo_gun_mantlet: LEOPARD2A7_TURRET_GUN_PBR,
  leo_recoil_system: LEOPARD2A7_TURRET_GUN_PBR,
  leo_breech_block: LEOPARD2A7_TURRET_GUN_PBR,
  leo_optics_peri: LEOPARD2A7_TURRET_GUN_PBR,
  leo_smoke_dischargers: LEOPARD2A7_TURRET_GUN_PBR,

  // Suite 3: leopard2a7_v3_powerpack_int (8 solid parts)
  leo_mtu_v12: LEOPARD2A7_POWERPACK_INT_PBR,
  leo_renk_transmission: LEOPARD2A7_POWERPACK_INT_PBR,
  leo_cooling_fans: LEOPARD2A7_POWERPACK_INT_PBR,
  leo_blast_door: LEOPARD2A7_POWERPACK_INT_PBR,
  leo_ammo_bustle: LEOPARD2A7_POWERPACK_INT_PBR,
  leo_hull_ammo_rack: LEOPARD2A7_POWERPACK_INT_PBR,
  leo_ready_round: LEOPARD2A7_POWERPACK_INT_PBR,
  leo_crew_stations: LEOPARD2A7_POWERPACK_INT_PBR,
};

export const LEOPARD2A7_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'leopard2a7_v3_hull_camo',
    weapon: LEOPARD2A7_ID,
    titleCn: '豹 2A7V 北约三色迷彩车体、重型侧裙、七对负重轮与迪尔履带贴图组 (V3)',
    partTag: 'F-01..F-08 HULL, SKIRTS, ROAD WHEELS & DIEHL 570FT TRACKS',
    resolution: '2048 × 2048 px',
    summary:
      '基于 Blender 5.2 Cycles GPU 烘焙的豹 2A7V 车体与行动系统 2K 5 通道 Packed ORM 贴图组：还原联邦国防军 CARC 哑光北约三色迷彩（青铜绿 RAL 6031 + 皮革棕 RAL 8027 + 抗压黑校准焦油黑 RAL 9021），首上 2A7V 重型附加装甲与车尾精准映射黑白联邦国防军铁十字徽标、德国联邦车牌「Y-482 917」及高可视黄色「MLC 70」桥梁承重圆盘，并独立刻画 7 对挂胶负重轮、迪尔 570FT 双销履带磨损金属光泽与精铣内齿炮塔座圈。',
    highlights: [
      '联邦国防军北约三色迷彩（青铜绿/皮革棕/焦油黑）与抗滑防滑砂粒涂装微法线',
      '首上与车尾高清 1:1 联邦铁十字、德军车牌「Y-482 917」及黄色「MLC 70」标牌',
      '7 对蝶形负重轮橡胶轮缘、迪尔 570FT 履带齿面磨损与 14 根扭杆钢铁质感分离',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'leopard2a7_v3_hull_camo_albedo.webp',
        note: 'sRGB · 北约三色迷彩车体 / 联邦铁十字与 Y-482 917 / 黄色 MLC 70 / 履带与负重轮',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'leopard2a7_v3_hull_camo_normal.webp',
        note: 'Linear · 装甲焊缝与倒角 + 防滑砂纹 + 散热百叶栅格与履带橡胶块浮雕',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'leopard2a7_v3_hull_camo_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:座圈亮钢(0.22)-CARC哑光迷彩(0.66)-履带胶块(0.80) / B:金属度',
      },
    ],
  },
  {
    id: 'leopard2a7_v3_turret_gun',
    weapon: LEOPARD2A7_ID,
    titleCn: '中空箭簇楔形装甲炮塔、6.6米 L/55A1 滑膛炮与 PERI/EMES 光电贴图组 (V3)',
    partTag: 'F-09..11 / S-01..03 / FC-01 / FC-03 TURRET, L/55A1 & OPTICS',
    resolution: '2048 × 2048 px',
    summary:
      '专为豹 2A7V 炮塔与火力系统打造的 2K 5 通道 ORM 贴图套件：炮塔两翼无畸变 Hero UV 翼面精印北约三色迷彩、清晰黑白联邦国防军铁十字与「2A7V / 312」战术编号；精细呈现中空箭簇楔形附加装甲内部间隙 NERA 复合板、6.6 米 Rh-120 L/55A1 隔热护套与抽烟装置金属卡箍、镜面硬铬液压驻退机、精铣立楔炮闩，以及通过 >=50 px UV 防火墙零色渗隔离的 PERI R17A3 与 EMES-15 绿蓝多层镀膜光学镜片。',
    highlights: [
      '炮塔双翼高清联邦国防军铁十字与「2A7V · 312」战术标识（1:1 非镜像平面 UV）',
      'PERI R17A3 周视热像仪与 EMES-15 主瞄准镜绿蓝增透镀膜镜片（>=50px UV 防火墙）',
      '6.6 米 L/55A1 玻纤隔热护套、硬铬驻退油缸与精铣 700 MPa 立楔炮闩真铁质感',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'leopard2a7_v3_turret_gun_albedo.webp',
        note: 'sRGB · 箭簇三色炮塔与铁十字 2A7V / 6.6米滑膛炮 / 镀铬驻退机 / 绿蓝镀膜光学',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'leopard2a7_v3_turret_gun_normal.webp',
        note: 'Linear · 箭簇螺栓接缝 + 隔热套环箍 + 炮闩精铣刀纹与烟幕筒倒角',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'leopard2a7_v3_turret_gun_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:镜片(0.08)-硬铬驻退缸(0.16)-迷彩炮塔(0.65) / B:金属度',
      },
    ],
  },
  {
    id: 'leopard2a7_v3_powerpack_int',
    weapon: LEOPARD2A7_ID,
    titleCn: 'MTU MB 873 V12 欧洲动力包、RENK 变速箱、防爆门与 120mm DM63A1 弹药贴图组 (V3)',
    partTag: 'FC-04..07 / M-01..04 MTU V12 EUROPOWERPACK, AMMO & CREW',
    resolution: '2048 × 2048 px',
    summary:
      '豹 2A7V 实时纵剖面（Cutaway）的机械艺术巅峰 2K 5 通道 ORM 贴图套件：高光银灰铸铝 MTU MB 873 Ka-501 47.6L V12 缸盖与双蜗壳增压器、暖铜色中冷进气管与铜翅片散热器、伦克 RENK HSWL 354 枪灰综合变速箱、14 片铝合金径向冷却风扇叶轮、严格 UV 防火墙隔离的尾舱防爆门德文黄黑警示条「ACHTUNG · MUNITION」、乘员舱青蓝发光 IFIS 战术显控屏幕，以及 120mm DM63A1 穿甲弹黄铜弹底/橄榄棕半可燃药筒/深灰钨芯长杆多材质分层。',
    highlights: [
      '金属银灰 MTU MB 873 V12 柴油机、暖铜中冷管/散热芯与 RENK 变速箱工业级材质对比',
      '尾舱防爆门高对比德文黄黑警示条与乘员舱青蓝 IFIS 战术终端（>=50px UV 防火墙）',
      '120mm DM63A1 穿甲弹黄铜弹底、半可燃药筒、铝质弹托与钨合金长杆四重材质还原',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'leopard2a7_v3_powerpack_int_albedo.webp',
        note: 'sRGB · 银灰 MTU V12 / 暖铜管路与散热芯 / 黄黑防爆门 / DM63A1 穿甲弹与 IFIS 屏',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'leopard2a7_v3_powerpack_int_normal.webp',
        note: 'Linear · V12 散热鳍片与缸盖螺栓 + 散热铜翅片细密波纹 + 变速箱加强筋',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'leopard2a7_v3_powerpack_int_roughness.webp',
        note: 'Linear · R:舱内自阴影AO / G:叶轮与铜管(0.20)-V12铸铝(0.32)-乘员座椅(0.76) / B:金属度',
      },
    ],
  },
];

export const LEOPARD2A7_PLUGIN: WeaponRuntimePlugin = {
  id: LEOPARD2A7_ID,
  partGroups: LEOPARD2A7_PART_GROUPS,
  timelinePresets: LEOPARD2A7_TIMELINE_PRESETS,
  parts: LEOPARD2A7_PARTS,
  firingPhases: LEOPARD2A7_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(LEOPARD2A7_FIRING_PHASES, f),
  computeFiringKinematics: computeLeopard2a7FiringKinematics,
  computeBallisticsState: computeLeopard2a7BallisticsState,
  pbrBindings: LEOPARD2A7_PBR_BINDINGS,
  pbrSuites: LEOPARD2A7_PBR_SUITES,
};
