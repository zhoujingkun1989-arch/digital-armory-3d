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
  M1A2_BLAST_DOOR_SLIDE,
  M1A2_BORE_Y,
  M1A2_BREECH_DROP,
  M1A2_CHAMBER_X,
  M1A2_HULL_DECK_Y,
  M1A2_MUZZLE_X,
  M1A2_READY_ROUND_RAM,
  M1A2_RECOIL_STROKE,
} from './meshes/m1a2Geometries';

export const M1A2_ID: WeaponId = 'm1a2';
export const M1A2_CALIBER: CaliberProfile = '120mm_apfsds';

export const M1A2_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '120mm L/44 M256 滑膛主炮、防盾驻退复进簧与弹底挡板',
    nameEn: '120mm L/44 M256 Smoothbore Gun, Mantlet, Recuperators & Stub Guard',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '焊接车体、乔巴姆/贫铀复合装甲炮塔、泄压顶板与行走扭杆系统',
    nameEn: 'Welded Hull, Chobham/DU Turret, Blow-Off Panels & Torsion Running Gear',
    badgeColor: '#a8a29e',
  },
  {
    key: 'fire_control',
    nameZh: '立楔炮闩、CROWS-LP 观瞄、AGT1500 燃气轮机与数字乘员舱',
    nameEn: 'Falling-Wedge Breech, CROWS-LP Optics, AGT1500 Turbine & SEP v3 Crew',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '装甲滑移隔爆门、回位簧与尾舱 120mm M829A4 隔舱化弹药架',
    nameEn: 'Armored Sliding Blast Doors, Return Spring & 120mm M829A4 Ammo Bustle',
    badgeColor: '#4ade80',
  },
];

export const M1A2_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '战备合拢态',
    subLabel: '0% Combat Ready',
    t: 0,
    desc: '美国陆军 M1A2 SEP v3 “艾布拉姆斯”（Abrams）主战坦克 1:1 真实尺度战备合拢态（含 120mm L/44 M256 滑膛炮全长 9,770 mm，宽 3,660 mm，高 2,440 mm）：标志性楔形沙漠 CARC 沙色装甲炮塔、低矮尖鼻首上、CROWS-LP 遥控武器站与 T158 挂胶履带严阵以待。',
  },
  {
    id: 'field_strip',
    label: '一级装甲防务与动力检修',
    subLabel: '30% Armor & Service Access',
    t: 0.3,
    desc: '遵循美军装甲旅野战勤务规范展开：开启尾舱泄压顶板（Blow-Off Panels）与后置涡轮动力舱盖板，下放双侧模块化重型防弹裙板，同时向后抽出 AGT1500 燃气轮机与 X1100 液力传动整体动力包。',
  },
  {
    id: 'powerpack_bustle',
    label: '二级炮塔吊离与隔舱化剖解',
    subLabel: '65% Turret, Chobham & Bustle',
    t: 0.65,
    desc: '向上整体吊起 24 吨级楔形主炮塔，清晰呈现座圈齿环、前颊空腔内的多层乔巴姆/贫铀（DU）NERA 复合夹层装甲、120mm M256 主炮防盾与双复进簧、隔离乘员与弹药的电动装甲隔爆门，以及满载 M829A4 贫铀尾翼稳定脱壳穿甲弹的蜂窝尾舱。',
  },
  {
    id: 'full_exploded',
    label: '全车 26 节点 1:1 爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全车 26 个 1:1 重装机械工程模块零干涉立体展开：从 5.28 米 120mm M256 滑膛炮、贫铀复合前颊、CROWS-LP 观瞄、装甲隔爆门与 36 发蜂窝尾舱、1,500 马力霍尼韦尔 AGT1500 钛合金压气机/铜质回热器燃气轮机，到 14 根横向扭杆与 7 对负重轮完整呈现。',
  },
];

export const M1A2_PARTS: WeaponPartSpec[] = [
  // ==================== 1. MAIN GUN, MANTLET, RECOIL SPRINGS & STUB GUARD ('slide' · 4 parts) ====================
  {
    id: 'm1a2_main_gun',
    bomCode: 'S-01',
    nameZh: '120mm L/44 M256 滑膛主炮管(含热护套、抽烟装置与膛口校炮仪)',
    calloutLabel: '120mm M256滑膛主炮',
    nameEn: '120mm L/44 M256 Smoothbore Cannon Barrel w/ Thermal Shroud & MRS',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [68, M1A2_BORE_Y, 0],
    explodeSteps: [
      { range: [0.22, 0.56], offset: [255, 160, 0] },
      { range: [0.56, 0.96], offset: [250, 146, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [255, 14, 0],
    labelAppearAt: 0.04,
    roleTag: '5,280mm 内镀硬铬自紧身管 · 650 MPa 膛压发射 1,670 m/s 贫铀穿甲弹',
    description:
      '美军引进莱茵金属技术并在沃特弗利特兵工厂深度强化改进的 120mm 44 倍径 M256 滑膛坦克炮：全长 5.28 米，采用电渣重熔钢液压自紧与内膛镀铬工艺，外包沙漠 CARC 沙色/炭黑铝玻纤隔热护套以消除日照弯曲，中段配同心偏心抽烟装置，膛口顶部装有激光膛口基准校炮仪（MRS）；击发时连同炮闩后坐 300 mm。',
  },
  {
    id: 'm1a2_gun_mantlet',
    bomCode: 'S-02',
    nameZh: '重型主炮装甲防盾、耳轴摇架与双液气驻退筒',
    calloutLabel: '主炮重装甲防盾摇架',
    nameEn: 'Heavy Armored Gun Mantlet Rotor, Trunnion & Twin Recoil Brakes',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [148, M1A2_BORE_Y, 0],
    explodeSteps: [
      { range: [0.24, 0.58], offset: [160, 160, 0] },
      { range: [0.58, 0.96], offset: [155, 146, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [24, 21, 0],
    labelAppearAt: 0.14,
    roleTag: '高强轧制均质装甲护盾 · 内置双同心液压驻退筒与右侧 M240 并列机枪口',
    description:
      '位于炮塔正面中轴的高厚度复合装甲主炮防盾与耳轴俯仰摇架（俯仰角 -10° 至 +20°）：内部同轴布置双液压驻退制动筒，将 120mm 主炮发射 M829A4 产生的逾 60 吨峰值后坐力柔顺限制在 300 mm 行程内，右侧集成 7.62mm M240 同轴机枪射孔。',
  },
  {
    id: 'm1a2_recoil_springs',
    bomCode: 'S-03',
    nameZh: '主炮摇架双联重型锻钢螺旋复进簧组',
    calloutLabel: '主炮双联重型复进簧',
    nameEn: 'Twin Heavy Forged Helical Gun Recuperator Springs',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [68, M1A2_BORE_Y, 0],
    explodeSteps: [
      { range: [0.26, 0.6], offset: [105, 160, 0] },
      { range: [0.6, 0.96], offset: [100, 146, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [37, 7, 26],
    labelAppearAt: 0.28,
    roleTag: '粗丝锻钢轴向储能复进 · 吸收 300 mm 主炮后坐并推回待击位',
    description:
      '成对对称布置在 120mm M256 摇架左右两侧（Z = ±260 mm）的重型高强度锻钢螺旋复进储能簧：击发瞬间随主炮后坐 300 mm 剧烈压缩蓄能，在阶段 4 顺滑释放弹力推动重逾 3 吨的炮身与炮尾平稳复进归位。',
  },
  {
    id: 'm1a2_stub_deflector',
    bomCode: 'S-04',
    nameZh: '炮尾防撞钢制护架与金属弹底壳偏转收集槽',
    calloutLabel: '炮尾护架与弹底收集槽',
    nameEn: 'Steel Breech Recoil Guard & Metallic Stub-Case Deflector Chute',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-16, 42, 0],
    explodeSteps: [
      { range: [0.28, 0.62], offset: [30, 160, 110] },
      { range: [0.62, 0.96], offset: [25, 146, 100] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -18, 18],
    labelAppearAt: 0.34,
    roleTag: '隔绝炮尾后坐保护装填手与车长 · 承接高温 120mm 金属底火盘',
    description:
      '刚性连接在炮尾后方的重型钢制防撞护栏与弧形金属弹底收集槽：既在火炮剧烈后坐 300 mm 时物理保护两侧的车长与装填手免遭误伤，又在半自动立楔炮闩下落抛壳瞬间将炽热的 120mm 可燃药筒金属底火盘安全导入吊篮底筐。',
  },

  // ==================== 2. HULL, TURRET ARMOR, BLOW-OFF PANELS & RUNNING GEAR ('frame' · 13 parts) ====================
  {
    id: 'm1a2_hull_shell',
    bomCode: 'F-01',
    nameZh: '尖鼻大倾角焊接装甲车体(沙漠 CARC 沙色与 3-69 AR / B-21 战术喷涂)',
    calloutLabel: '焊接装甲车体(中空壳)',
    nameEn: 'Hollow Welded M1A2 SEP v3 Armored Hull (Desert CARC Tan)',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.16, 0.52], offset: [0, 72, 0] },
      { range: [0.52, 0.94], offset: [0, 64, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 50,
    calloutAnchor: [290, -24, 165],
    labelAppearAt: 0.0,
    roleTag: '7,930mm 低矮楔形承力车体 · 82° 超大倾角首上 · 纵剖展示全车内构',
    description:
      '艾布拉姆斯最具辨识度的低矮焊接钢与复合装甲车体（全长 7.93 米、宽 3.46 米，车底离地 480 mm）：前端标志性尖锐楔鼻与 82° 超大倾角首上装甲可弹飞大多数穿甲弹，喷涂正宗美军沙漠 CARC 沙色与第 69 装甲团第 3 营 B 连 21 号车黑色战术识别标（3-69 AR / B-21）；按下 [C] 开启纵剖面即清晰劈开厚达 160–200 mm 的中空装甲壳壁！',
  },
  {
    id: 'm1a2_side_skirts',
    bomCode: 'F-02',
    nameZh: '七段铰接式模块化重型复合防弹侧裙板',
    calloutLabel: '模块化复合防弹侧裙',
    nameEn: 'Modular Heavy Ballistic Armored Side Skirts w/ Tactical Chevron',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, -54, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [0, 36, 0] },
      { range: [0.52, 0.92], offset: [0, 32, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [40, -18, 183],
    labelAppearAt: 0.08,
    roleTag: '前段加厚 NERA 抗破甲裙板 · 喷涂醒目美军黑色「^」战术识别 V 标',
    description:
      '覆盖车体两侧悬挂上部的七段铰接式重型防弹侧裙板（车宽增至 3,660 mm）：前两块覆盖战斗室的高厚度复合装甲裙板可提前引爆并削弱 RPG 与反坦克导弹金属射流，中段喷印醒目的美军装甲旅黑色倒 V 战术识别标（^），向上翻折即可检修负重轮。',
  },
  {
    id: 'm1a2_road_wheels',
    bomCode: 'F-03',
    nameZh: '七对双盘重型挂胶负重轮、后置齿圈主动轮与前置诱导轮组',
    calloutLabel: '7对双盘负重轮与主动轮',
    nameEn: '7-Pair Dual-Disc Heavy Road Wheels, Rear Drive Sprockets & Idlers',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, -84, 0],
    explodeSteps: [
      { range: [0.16, 0.44], offset: [0, -3, 0] },
      { range: [0.56, 0.94], offset: [0, -2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -28, 168],
    labelAppearAt: 0.16,
    roleTag: '14 组高强锻铝轮盘承托 66.8 吨全重 · 支撑 67 km/h 越野极速',
    description:
      '艾布拉姆斯行走系统的基石：每侧七组双盘挂胶大直径重型负重轮配合粗壮摆臂、前部液压张紧诱导轮、三组托带轮与尾端 11 齿高耐磨合金钢主动链轮，平稳分摊 66.8 吨战斗全重并赋予其荒漠高速机动能力。',
  },
  {
    id: 'm1a2_tracks_left',
    bomCode: 'F-04',
    nameZh: '左侧 T158 “大脚怪”双销挂胶重型履带总成',
    calloutLabel: '左侧 T158 挂胶履带',
    nameEn: 'Left T158 Bigfoot Double-Pin Rubber-Padded Track Belt',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [0, -82, -146],
    explodeSteps: [
      { range: [0.14, 0.44], offset: [0, 0, -70] },
      { range: [0.54, 0.94], offset: [0, 0, -65] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -38, -28],
    labelAppearAt: 0.18,
    roleTag: '635mm 宽幅可替换耐磨胶块 · 降低接地比压并保护城市路面',
    description:
      '全宽 635 mm 的美军制式 T158 “大脚怪”（Bigfoot）双销式挂胶履带（左侧）：每块锻钢履带板嵌装可快速拆换的八角形高耐磨硫化橡胶块，通过高强度端联器与中心诱导齿啮合，兼顾沙漠松软沙地通过性与公路高速行驶低振动。',
  },
  {
    id: 'm1a2_tracks_right',
    bomCode: 'F-05',
    nameZh: '右侧 T158 “大脚怪”双销挂胶重型履带总成',
    calloutLabel: '右侧 T158 挂胶履带',
    nameEn: 'Right T158 Bigfoot Double-Pin Rubber-Padded Track Belt',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, -82, 146],
    explodeSteps: [
      { range: [0.14, 0.44], offset: [0, 0, 70] },
      { range: [0.54, 0.94], offset: [0, 0, 65] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -38, 28],
    labelAppearAt: 0.18,
    roleTag: '纵剖模式自动隐藏右侧履带 · 彻底暴露扭杆悬挂与底盘内构',
    description:
      '对称布置于车体右侧（Z = +146 cm）的 T158 挂胶履带总成，履带底缘精确贴合 Y = -120.0 cm 展厅基准地面；作为外壳层标记为 isShell，开启纵剖面（[C]）时随右侧裙板与装甲同步剖离，无遮挡展示右侧扭杆与传动细节。',
  },
  {
    id: 'm1a2_engine_deck',
    bomCode: 'F-06',
    nameZh: '后置燃气轮机进气百叶与高温尾喷口装甲顶盖',
    calloutLabel: '涡轮动力舱百叶顶盖',
    nameEn: 'Slatted Rear Turbine Intake Deck & Jet-Blast Exhaust Grille',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-268, 20, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [-135, 95, 0] },
      { range: [0.52, 0.92], offset: [-130, 80, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-108, 6, 0],
    labelAppearAt: 0.08,
    roleTag: '防破片倾角进气格栅 · 尾部喷印鲜明红黄「DANGER JET BLAST」警示标',
    description:
      '封闭后置动力舱的重型可吊装装甲顶盖与尾端格栅：前段大面积倾角百叶窗为 AGT1500 燃气轮机提供每秒逾 5 公斤清洁空气并导流润滑油散热，车尾斜向防弹排风格栅处喷涂标志性红黄警示「DANGER — JET BLAST / EXHAUST」（尾流温度高达 500°C 以上，严禁步兵紧贴车尾）。',
  },
  {
    id: 'm1a2_torsion_bars',
    bomCode: 'F-07',
    nameZh: '14 根高强度合金钢横向扭杆与旋转液压减振器',
    calloutLabel: '14根高强钢横向扭杆',
    nameEn: '14 Transverse High-Strength Steel Torsion Bars & Rotary Dampers',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [0, -64, 0],
    explodeSteps: [
      { range: [0.18, 0.46], offset: [0, 15, 0] },
      { range: [0.56, 0.94], offset: [0, 13, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-40, -4, 95],
    labelAppearAt: 0.24,
    roleTag: '横贯车底的高韧弹簧钢扭轴 · 提供高达 381 mm 负重轮动行程',
    description:
      '密布于车体底部装甲夹层内的 14 根高强度预扭合金钢横向扭杆（左右七对交错布置）：一端通过精密花键锁死在车体对侧壁座内，另一端驱动负重轮摆臂，配合第 1、2、7 对轮位的旋转叶片式液压减振器，在崎岖戈壁高速冲锋时为火控稳定器奠定平稳底座。',
  },
  {
    id: 'm1a2_turret_ring',
    bomCode: 'F-08',
    nameZh: '2.16 米精密内齿钢制炮塔座圈与液压回转驱动齿轮',
    calloutLabel: '2.16m精密内齿炮塔座圈',
    nameEn: 'Precision 2.16m Geared Steel Turret Race Ring & Azimuth Drive',
    group: 'frame',
    material: 'stainless',
    assembledPos: [20, M1A2_HULL_DECK_Y, 0],
    explodeSteps: [
      { range: [0.22, 0.56], offset: [0, 90, 0] },
      { range: [0.56, 0.94], offset: [0, 78, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [98, 4, 48],
    labelAppearAt: 0.26,
    roleTag: '滚珠承托 24 吨级炮塔 · 9 秒完成 360° 极速液压方向调炮',
    description:
      '直径 2,160 mm 的大型淬火合金钢炮塔座圈滚道与精密内啮合大齿圈：通过多排高载荷钢球承托重逾 24 吨的整套炮塔与复合装甲，左侧液压马达驱动小齿轮以每秒高达 40° 的角速度实现 9 秒 360° 快速转向接敌。',
  },
  {
    id: 'm1a2_turret_shell',
    bomCode: 'F-09',
    nameZh: '多面体楔形复合装甲炮塔壳体(含 CIP 敌我识别板与尾舱置物篮)',
    calloutLabel: '楔形复合装甲炮塔壳体',
    nameEn: 'Hollow Faceted Angular Abrams Turret Shell w/ CIP & Bustle Rack',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.24, 0.58], offset: [0, 160, 0] },
      { range: [0.58, 0.96], offset: [0, 146, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [35, 76, 140],
    labelAppearAt: 0.04,
    roleTag: '标志性棱角楔形中空炮塔 · 前藏贫铀复合颊 · 后置隔离弹药尾舱',
    description:
      '现代装甲美学图腾——艾布拉姆斯标志性的宽大扁平多面体焊接炮塔壳体：前部双侧大倾角中空颊腔容纳极厚的乔巴姆/贫铀复合装甲，内部防爆隔墙将乘员战斗室与后延的弹药尾舱彻底分隔，侧壁悬挂美军热成像低辐射百叶敌我识别板（CIP）与醒目黑色「B-21」/「^」车号涂装，尾部配大型步兵杂物篮。',
  },
  {
    id: 'm1a2_blowoff_panels',
    bomCode: 'F-10',
    nameZh: '尾舱顶置弹药殉爆泄压装甲顶板(Blow-Off Panels)',
    calloutLabel: '尾舱殉爆泄压顶板',
    nameEn: 'Roof-Mounted Ammunition Compartment Blow-Off Vent Panels',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-166, 73, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [-30, 180, 0] },
      { range: [0.52, 0.94], offset: [-25, 168, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 5, 0],
    labelAppearAt: 0.1,
    roleTag: '拯救无数车组生命的传奇安全设计 · 弹药殉爆瞬间向上定向卸压',
    description:
      '安装在炮塔后部弹药尾舱正上方的三片剪切螺栓固定式装甲泄压顶板：一旦尾舱被反坦克武器洞穿引发 120mm 发射药爆燃，脆弱的泄压顶板会在毫秒内被冲击波掀飞，将毁灭性火焰与超压全部导向天空，配合密闭的装甲隔爆门确保舱内四名乘员安然无恙！',
  },
  {
    id: 'm1a2_composite_armor',
    bomCode: 'F-11',
    nameZh: '第三代乔巴姆/贫铀(DU)多层 NERA 夹层复合前颊装甲组',
    calloutLabel: '乔巴姆/贫铀复合前颊装甲',
    nameEn: 'Multi-Layer Chobham / Depleted-Uranium (DU) NERA Cheek Armor',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [148, M1A2_BORE_Y, 0],
    explodeSteps: [
      { range: [0.28, 0.62], offset: [98, 125, 0] },
      { range: [0.62, 0.96], offset: [92, 115, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    calloutAnchor: [0, 19, 82],
    labelAppearAt: 0.24,
    roleTag: '纵剖奇观核心 · 7 层钢/陶瓷/贫铀网/弹性体斜置三明治拦截射流',
    description:
      '隐藏在 M1A2 SEP v3 炮塔前颊空腔内的绝密级第三代重型贫铀（DU）乔巴姆复合装甲模组：开启 [C] 纵剖面瞬间即可清晰目睹由高硬轧制钢板、烧结陶瓷瓦、高密度贫铀合金网板、铜基/弹性体吸能隔层与防崩落背板交错斜置而成的 7 层非爆炸反应（NERA）三明治结构，赋予车体逾 900 mm RHA 抗穿甲与逾 1,300 mm 抗破甲等效防护。',
  },
  {
    id: 'm1a2_smoke_launchers',
    bomCode: 'F-12',
    nameZh: '双侧 M250 四联装 66mm 烟幕弹发射器与双鞭状电台天线',
    calloutLabel: 'M250烟幕发射器与天线',
    nameEn: 'Twin 4-Barrel M250 Smoke Grenade Dischargers & Dual Whip Antennas',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [40, 58, 0],
    explodeSteps: [
      { range: [0.16, 0.46], offset: [10, 225, 0] },
      { range: [0.54, 0.96], offset: [10, 210, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [55, 8, 165],
    labelAppearAt: 0.2,
    roleTag: '8 具扇形齐射红外遮蔽烟幕 · 尾部双 SINCGARS 数字化战网鞭状天线',
    description:
      '焊接于炮塔左右前肩部的一对美军四联装 M250 66mm 烟幕弹发射器（共计 8 枚 L8A1/M76 多频谱红外阻断烟幕弹，可在两秒内于车前拉起遮蔽激光测距与热成像的厚重烟墙），配搭炮塔尾端两根高弹性 SINCGARS 数字化战场通信鞭状天线。',
  },
  {
    id: 'm1a2_fuel_cells',
    bomCode: 'F-13',
    nameZh: '车体前部双侧装甲防护 JP-8 航空煤油燃料箱',
    calloutLabel: '前部装甲JP-8燃料箱',
    nameEn: 'Armored Forward Hull Twin JP-8 Turbine Fuel Cells',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [205, -28, 0],
    explodeSteps: [
      { range: [0.24, 0.58], offset: [155, 65, 0] },
      { range: [0.58, 0.96], offset: [150, 60, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -24, 74],
    labelAppearAt: 0.3,
    roleTag: '1,909 升宽馏分多燃料储备 · 夹护于驾驶员两侧兼作抗破甲吸能层',
    description:
      '对称嵌入车体前部驾驶员舱两侧装甲隔舱内的双大型高韧防自爆 JP-8 航空煤油燃料箱（与后部油箱合计储油逾 1,909 升）：得益于 AGT1500 燃气轮机的多燃料特性，可兼容喷气燃油、柴油甚至汽油，并借助柴油/煤油的高比热容充当驾驶员侧面的附加防破甲吸能屏障。',
  },

  // ==================== 3. BREECH, CROWS OPTICS, AGT1500 TURBINE, TRANSMISSION & CREW ('fire_control' · 5 parts) ====================
  {
    id: 'm1a2_breech_block',
    bomCode: 'FC-01',
    nameZh: 'M256 整体精铣钢制炮尾环与半自动立楔式下落炮闩',
    calloutLabel: 'M256炮尾与立楔炮闩',
    nameEn: 'M256 Machined Steel Breech Ring & Vertical Falling-Wedge Breechblock',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [42, M1A2_BORE_Y, 0],
    explodeSteps: [
      { range: [0.26, 0.6], offset: [115, 190, 0] },
      { range: [0.6, 0.96], offset: [110, 180, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 18, 0],
    labelAppearAt: 0.24,
    roleTag: '承压 650 MPa · 复进自动下落 150 mm 抛壳 · 推弹入膛瞬间自动闭锁',
    description:
      'M256 120mm 主炮的承压心脏：整块锻造合金钢精铣而成的厚重炮尾环内嵌重型立楔式垂直滑动炮闩与电发火击针机构。炮身复进归位瞬间，右侧半自动凸轮迫使炮闩向下滑落 150 mm 自动抛出高温金属底火盘；待装填手将新弹推入膛底撞开解脱爪时，炮闩凭借强力簧瞬间上弹闭锁待发！',
  },
  {
    id: 'm1a2_crows_optics',
    bomCode: 'FC-02',
    nameZh: 'CROWS-LP 遥控 M2HB 重机枪站、CITV 车长周视仪与 GPS 炮长主瞄镜',
    calloutLabel: 'CROWS-LP与猎歼双观瞄',
    nameEn: 'CROWS-LP M2HB .50 Cal RWS, Commander CITV & Gunner GPS Optics',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [48, 98, 0],
    explodeSteps: [
      { range: [0.18, 0.52], offset: [20, 180, 0] },
      { range: [0.52, 0.96], offset: [15, 165, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-18, 26, 46],
    labelAppearAt: 0.08,
    roleTag: '全车 2,440mm 制高点 · 翡翠/蓝宝多层镀膜热像仪实现昼夜猎-歼协同',
    description:
      '代表 M1A2 SEP v3 信息化巅峰的炮塔顶置三大火控观瞄群：右侧装甲“狗屋”护罩内的休斯 GPS 炮长主瞄准镜（双向独立稳定、激光测距与三代 FLIR 热成像）、左侧可 360° 旋转的 CITV 车长独立热像周视仪（赋予车长搜敌、炮长摧毁的“猎-歼”作战能力），以及车长舱口低轮廓 CROWS-LP 遥控 12.7mm M2HB 重机枪站。',
  },
  {
    id: 'm1a2_agt1500_turbine',
    bomCode: 'FC-03',
    nameZh: '霍尼韦尔 AGT1500 1,500马力多燃料燃气轮机(钛压气机与铜回热器)',
    calloutLabel: 'AGT1500 1500马力燃气轮机',
    nameEn: 'Honeywell AGT1500 1,500 SHP Multi-Fuel Gas Turbine w/ Recuperator',
    group: 'fire_control',
    material: 'copper_accent',
    assembledPos: [-212, -24, 0],
    explodeSteps: [
      { range: [0.08, 0.34], offset: [-160, 65, 0] },
      { range: [0.52, 0.94], offset: [-145, 60, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [-20, 34, 0],
    labelAppearAt: 0.12,
    roleTag: '纵剖动力奇观 · 5 级闪亮钛合金轴流压气机叶片 + 标志性暖铜环形回热器',
    description:
      '令艾布拉姆斯发出宛如喷气战斗机低沉啸叫的传奇心脏——霍尼韦尔 AGT1500 1,500 轴马力航空衍生燃气轮机！体积仅相当于传统重型 V12 柴油机的一半，却能爆发高达 3,754 牛·米的惊人低速扭矩：前段为 5 级精密闪亮钛合金轴流压气机转子叶片，中段单管切向燃烧室，尾段则是极具工业雕塑美感的暖铜/青铜褶皱环形圆柱式废气回热热交换器（大幅回收尾气热量降低油耗）。',
  },
  {
    id: 'm1a2_x1100_transmission',
    bomCode: 'FC-04',
    nameZh: '艾利逊 X1100-3B 液力机械综合变速与无级转向传动箱',
    calloutLabel: 'X1100-3B 液力综合传动箱',
    nameEn: 'Allison X1100-3B Hydro-Kinetic Cross-Drive Transmission',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-330, -28, 0],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [-195, 62, 0] },
      { range: [0.52, 0.94], offset: [-190, 58, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -28, 0],
    labelAppearAt: 0.16,
    roleTag: '4 前 2 倒自动行星变速 · 静液压无级双流转向实现原地 360° 中心回转',
    description:
      '直接法兰刚性对接在 AGT1500 燃气轮机尾端的艾利逊 X1100-3B 液力机械综合传动装置：集成了液力变矩器、4 前进 / 2 倒车全自动行星变速箱、静液压无级再生转向与双侧湿式多片主制动器，既可与燃气轮机作为一个 3.8 吨整体动力包在 30 分钟内野战吊换，又能驱动 66.8 吨钢铁巨兽流畅实现原地中心转向。',
  },
  {
    id: 'm1a2_crew_stations',
    bomCode: 'FC-05',
    nameZh: '半仰卧式驾驶舱、炮塔吊篮与 SEP v3 双数字化战术显控台',
    calloutLabel: '仰卧驾驶舱与SEP v3显控台',
    nameEn: 'Reclining Driver Couch, Turret Basket & SEP v3 Dual Tactical LCDs',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [95, -20, 0],
    explodeSteps: [
      { range: [0.24, 0.58], offset: [0, 136, 0] },
      { range: [0.58, 0.96], offset: [0, 126, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [108, -14, 0],
    labelAppearAt: 0.28,
    roleTag: '摩托 T 形转向把半躺驾驶 · 车长/炮长双青绿战术地图 LCD 与装填手膝控台',
    description:
      '高度契合现代人机工程学的四乘员战斗舱布局：车首中轴为贴合低矮车体而独创的半仰卧式驾驶员躺椅与摩托车 T 形转向把（配数字化仪表），炮塔旋转吊篮右侧分层布置炮长与车长的 SEP v3 双青绿色 FBCB2/JCR 战术显控 LCD 终端，左侧为装填手立姿作业台与黄色电动隔爆门膝控开关。',
  },

  // ==================== 4. BLAST DOORS, DOOR SPRING, 120MM AMMO BUSTLE & READY ROUND ('magazine' · 4 parts) ====================
  {
    id: 'm1a2_blast_doors',
    bomCode: 'M-01',
    nameZh: '弹药尾舱电动滑移重装甲隔爆门(带黄黑安全警示条)',
    calloutLabel: '电动滑移重装甲隔爆门',
    nameEn: 'Armored Sliding Ammunition Compartment Blast Doors',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [-84, 43, 0],
    explodeSteps: [
      { range: [0.24, 0.58], offset: [-120, 160, 0] },
      { range: [0.58, 0.96], offset: [-110, 146, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [0, 22, 0],
    labelAppearAt: 0.2,
    roleTag: '艾布拉姆斯生存性传奇核心 · 装填膝触瞬开 340mm · 闭门隔绝 36 发弹药殉爆',
    description:
      '艾布拉姆斯享誉世界的隔舱化生存核心——位于炮塔战斗室与后部弹药尾舱之间的高强钢厚壁双扇滑移隔爆门（边缘漆有醒目黄黑警示带）：平时由液压与回位弹簧严密锁闭，将乘员与后方 36 发 120mm 炮弹物理隔绝；装填手仅需用膝盖轻触开关，隔爆门即向左侧高速滑开 340 mm，抽出单发炮弹后松膝便瞬间轰然复位闭锁！',
  },
  {
    id: 'm1a2_door_spring',
    bomCode: 'M-02',
    nameZh: '隔爆门顶部气液助力与自动闭门螺旋回位簧',
    calloutLabel: '隔爆门自动闭门回位簧',
    nameEn: 'Blast-Door Pneumatic-Mechanical Return Helical Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [-84, 63, -24],
    explodeSteps: [
      { range: [0.24, 0.58], offset: [-140, 175, 0] },
      { range: [0.58, 0.96], offset: [-130, 165, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [26, 4, 0],
    labelAppearAt: 0.3,
    roleTag: '失效安全机械强制闭门 · 膝控松开即弹力锁闭防爆火串入',
    description:
      '安装于装甲隔爆门上方滑轨槽内的粗丝高刚度螺旋回位弹簧：当装填手压下膝控开关开启隔爆门时，该螺旋簧沿 X 轴压缩蓄能；一旦拔弹完成松开膝开关或遭遇全车断电故障，弹簧即强制拉动重型隔爆门自动严密关闭，贯彻最高等级失效安全原则。',
  },
  {
    id: 'm1a2_ammo_bustle',
    bomCode: 'M-03',
    nameZh: '炮塔尾舱 36 发蜂窝防爆弹药架(满载 120mm M829A4 贫铀尾翼脱壳穿甲弹)',
    calloutLabel: '尾舱36发120mm蜂窝弹架',
    nameEn: 'Honeycombed 36-Round Rear Bustle Rack w/ 120mm M829A4 APFSDS Rounds',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [-168, M1A2_BORE_Y, 0],
    explodeSteps: [
      { range: [0.24, 0.58], offset: [-205, 160, 0] },
      { range: [0.58, 0.96], offset: [-200, 146, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    calloutAnchor: [0, 21, 0],
    labelAppearAt: 0.22,
    roleTag: '全封闭隔离尾舱 · 整齐码放 984mm 长 120×570mm M829A4 银弹',
    description:
      '布置于炮塔尾舱防爆隔墙之后、泄压顶板正下方的蜂窝状防火隔舱弹药架：双层蜂窝套筒整齐容纳 36 发整装 120×570mm NATO 制式弹药——醒目的黄铜/镀镍金属底火盘、橄榄沙色半可燃发射药筒、亮银铝合金卡瓣弹托与暗灰高密度贫铀长杆穿甲弹芯尽收眼底！',
  },
  {
    id: 'm1a2_ready_round',
    bomCode: 'M-04',
    nameZh: '单发待装填 120×570mm NATO M829A4 贫铀尾翼稳定脱壳穿甲弹',
    calloutLabel: '120mm M829A4 贫铀穿甲弹',
    nameEn: 'Animated 120x570mm NATO M829A4 DU APFSDS-T Ready Cartridge',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [-150, M1A2_BORE_Y, -14],
    explodeSteps: [
      { range: [0.24, 0.58], offset: [-135, 160, 0] },
      { range: [0.58, 0.96], offset: [-130, 146, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 8, 0],
    labelAppearAt: 0.26,
    roleTag: '全长 984 mm · 击发循环中穿越开启的隔爆门前推 +196 cm 精准装填入膛',
    description:
      '美军现役最令对手胆寒的第四代“银弹”（Silver Bullet）——120×570mm NATO M829A4 贫铀尾翼稳定脱壳穿甲曳光弹：全长 984 mm，半可燃硝化纤维药筒在击发瞬间几乎完全气化，仅余尾部低矮金属底火盘抛壳；击发仿真阶段 6 中可直观观察这发待发弹从开启的隔爆门抽出并笔直前推 196 cm 稳稳装入 M256 炮膛！',
  },
];

// ============================================================================
// 7-Phase M1A2 SEP v3 120mm L/44 M256 Firing & Blast-Door Reload Cycle (f ∈ [0, 1])
// ============================================================================

export const M1A2_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'm1a2_phase_1_fire_ignition',
    stepNum: '01',
    shortLabel: '电控击发底火引燃',
    title: '阶段 1 · 炮长扣动双握把电控扳机，M256 立楔炮闩电击针瞬时引燃 120mm 底火',
    range: [0.0, 0.08],
    description:
      '数字火控计算机完成激光测距、横风与膛口基准仪（MRS）解算后，炮长压下掌压电门，炮尾顶部电磁击发机构输出高压脉冲瞬间引燃膛内 M829A4 金属底火盘，半可燃发射药室压力陡升。',
  },
  {
    id: 'm1a2_phase_2_sabot_launch',
    stepNum: '02',
    shortLabel: '1670m/s 贫铀穿甲弹发射',
    title: '阶段 2 · 650 MPa 峰值膛压推动 120mm M829A4 贫铀脱壳穿甲弹以 1,670 m/s 呼啸出膛',
    range: [0.08, 0.2],
    description:
      '逾 650 MPa 超高压火药燃气推动 M829A4 弹托与贫铀长杆弹芯沿 5.28 米镀铬滑膛疾驰加速，于 f = 0.19 以 1,670 m/s（约 4.9 马赫）极速破口而出，在膛口绽放炽烈冲击波并由中段同心抽烟装置强力排清炮膛废气。',
  },
  {
    id: 'm1a2_phase_3_gun_recoil',
    stepNum: '03',
    shortLabel: '300mm 主炮重型后坐',
    title: '阶段 3 · 120mm 炮管与立楔炮尾同步后坐 -300 mm，双联重型锻钢复进簧急剧压缩',
    range: [0.2, 0.36],
    description:
      '超过 12 兆焦耳的庞大炮口动能触发猛烈反冲：M256 炮管、立楔炮尾与金属弹底防撞护架作为一个整体在防盾摇架内向后平滑滑移 -300 mm（-30 cm），双联液压驻退筒吸收峰值冲击，同时将两侧粗丝螺旋复进簧压缩至 59.5% 蓄能。',
  },
  {
    id: 'm1a2_phase_4_return_breech_drop',
    stepNum: '04',
    shortLabel: '复进归位与落闩抛底',
    title: '阶段 4 · 复进簧推炮归位，半自动立楔炮闩垂直下落 -150 mm 并抛出金属底火盘',
    range: [0.36, 0.5],
    description:
      '双联复进簧释放弹能平稳将 120mm 主炮与炮尾前推 300 mm 回到待击原点；在复进末段，炮尾凸轮自动迫使重型立楔炮闩垂直向下滑落 -150 mm 打开炮膛，几乎燃尽药筒的炽热金属底火盘（Stub Base）被干脆抛入后下方收集槽。',
  },
  {
    id: 'm1a2_phase_5_blast_doors_open',
    stepNum: '05',
    shortLabel: '膝控开启装甲隔爆门',
    title: '阶段 5 · 装填手膝触开关，重型装甲隔爆门侧滑开启 340 mm 并压缩顶置回位簧',
    range: [0.5, 0.62],
    description:
      '装填手确认炮膛清空后用膝盖轻抵绿色/黄色电动膝控开关：隔绝战斗室与尾舱的厚重装甲滑移隔爆门高速向左平移开启 340 mm（|ΔZ| = 34 cm），同步压缩门顶水平螺旋回位簧，瞬间展露后方蜂窝弹架中闪耀的 36 发 120mm M829A4 实弹！',
  },
  {
    id: 'm1a2_phase_6_round_ramming',
    stepNum: '06',
    shortLabel: '人工极速抽弹推膛',
    title: '阶段 6 · 装填手抽出待发 M829A4 穿甲弹穿越隔爆门前推 +196 cm 精准装填入膛',
    range: [0.62, 0.84],
    description:
      '展现美军精锐装填手 4–5 秒神速人工装填的传奇动作：重达 20.9 公斤、全长 984 mm 的单发待装填 120mm M829A4 贫铀穿甲弹被干净利落地抽出蜂窝尾舱、对准炮管中轴并向前疾推 +196 cm，穿过敞开的装甲隔爆门一举送入敞开的 M256 炮膛！',
  },
  {
    id: 'm1a2_phase_7_lock_doors_shut',
    stepNum: '07',
    shortLabel: '立楔闭锁与隔爆门封舱',
    title: '阶段 7 · 立楔炮闩瞬时上弹闭锁，回位簧驱动装甲隔爆门轰然闭合封舱待发',
    range: [0.84, 1.0],
    description:
      'M829A4 金属底缘撞击炮膛闭锁爪瞬间，立楔炮闩闪电上弹 +150 mm 彻底锁死炮尾；装填手随即松开膝控开关，顶置螺旋回位簧释放弹力将重型装甲隔爆门轰然推回关闭位，高呼 “UP!” 宣告火炮就绪并重新建立完整隔舱化防殉爆屏障！',
  },
];

// ============================================================================
// Coupled 120mm M256 Recoil, Vertical Breech, Blast Doors & M829A4 Ramming Kinematics
// ============================================================================

export function computeM1a2FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  const rx = 0;
  const ry = 0;
  const rz = 0;
  let scaleX = 1;

  // 1. M256 120mm L/44 hydraulic recoil stroke: 0 -> -30.0 cm [0.20, 0.34] -> 0 [0.36, 0.46]
  const recoil01 = Math.max(0, seg(f, 0.2, 0.34) - seg(f, 0.36, 0.46));
  const recoilAmt = M1A2_RECOIL_STROKE * recoil01;

  // 2. Vertical falling-wedge breechblock drop: 0 -> -15.0 cm [0.40, 0.49] -> 0 [0.84, 0.91]
  const breechDrop01 = Math.max(0, seg(f, 0.4, 0.49) - seg(f, 0.84, 0.91));

  // 3. Armored sliding bustle blast doors: 0 -> -34.0 cm [0.50, 0.62] -> 0 [0.87, 0.95]
  const doorOpen01 = Math.max(0, seg(f, 0.5, 0.62) - seg(f, 0.87, 0.95));

  switch (partId) {
    case 'm1a2_main_gun':
    case 'm1a2_stub_deflector': {
      dx = -recoilAmt;
      break;
    }

    case 'm1a2_breech_block': {
      dx = -recoilAmt;
      dy = -M1A2_BREECH_DROP * breechDrop01;
      break;
    }

    case 'm1a2_recoil_springs': {
      // Dynamic CSG Spring #1 (local X ∈ [0, +74], rear pinned at local X = 0):
      // Compresses cleanly with -30 cm gun recoil (`scaleX: 1.000 -> 0.5946 -> 1.000`)!
      const L0 = 74.0;
      scaleX = (L0 - recoilAmt) / L0;
      break;
    }

    case 'm1a2_blast_doors': {
      // Slides smoothly -34 cm (-Z) into left bulkhead pocket, cleanly clearing cutaway view!
      dz = -M1A2_BLAST_DOOR_SLIDE * doorOpen01;
      break;
    }

    case 'm1a2_door_spring': {
      // Dynamic CSG Spring #2 (local X ∈ [0, +52], rear pinned at local X = 0):
      // Compresses dramatically while blast doors are held open (`scaleX: 1.000 -> 0.620 -> 1.000`)!
      scaleX = 1.0 - 0.38 * doorOpen01;
      break;
    }

    case 'm1a2_ready_round': {
      // Extracted from rear bustle [-150, +44, -14], aligned to bore Z=0, rammed +196 cm into breech [0.62, 0.84]!
      const ram01 = seg(f, 0.62, 0.84);
      const center01 = seg(f, 0.62, 0.72);
      dx = M1A2_READY_ROUND_RAM * ram01;
      dy = 2.4 * Math.sin(linearSeg(f, 0.62, 0.84) * Math.PI);
      dz = 14.0 * center01;
      break;
    }

    default:
      break;
  }

  const snap0 = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  return {
    pos: [snap0(dx), snap0(dy), snap0(dz)],
    rot: [rx, ry, rz],
    scaleX: Math.abs(scaleX - 1) < 1e-9 ? 1 : scaleX,
  };
}

/**
 * 120×570mm NATO M829A4 DU APFSDS-T (650 MPa, 1,670 m/s) Ballistics Choreography:
 *  - `ignitionF = 0.08` -> `muzzleExitF = 0.19` down the 5.28 m L/44 barrel (`X: +54 -> +581`, `Y = +44, Z = 0`).
 *  - `f in [0.42, 0.68)`: Fired metallic stub-base ejects aft & drops cleanly into `m1a2_stub_deflector`!
 *  - `f in [0.62, 0.84)`: Next 120mm M829A4 live round tracks `m1a2_ready_round` from bustle into chamber (`endpointJump === 0`).
 */
export function computeM1a2BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const recoil01 = Math.max(0, seg(f, 0.2, 0.34) - seg(f, 0.36, 0.46));
  const recoilAmt = M1A2_RECOIL_STROKE * recoil01;

  // 1. 120mm M829A4 Depleted-Uranium Sabot Dart Projectile (`Y = +44, Z = 0`)
  const bulletVisible = f < 0.4;
  let bulletX = M1A2_CHAMBER_X;
  let streakLength = 0;

  if (f >= 0.08 && f < 0.19) {
    const u = Math.pow(linearSeg(f, 0.08, 0.19), 1.45);
    bulletX = M1A2_CHAMBER_X + (M1A2_MUZZLE_X - M1A2_CHAMBER_X) * u;
    streakLength = 34.0 * u;
  } else if (f >= 0.19 && f < 0.4) {
    const u = linearSeg(f, 0.19, 0.4);
    bulletX = M1A2_MUZZLE_X + 860.0 * u;
    streakLength = 68.0 * (1 - u * 0.4);
  }

  // 2. Spent Metallic Stub-Base Casing: recoils inside breech, ejects aft-downward at f = 0.42 into deflector chute!
  const spentCaseVisible = f < 0.72;
  let caseX = M1A2_CHAMBER_X - recoilAmt;
  let caseY = M1A2_BORE_Y;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.42 && f < 0.72) {
    const u = linearSeg(f, 0.42, 0.72);
    caseX = 24.0 - 46.0 * u;
    caseY = M1A2_BORE_Y - 12.0 * u - 14.0 * u * u;
    caseZ = 4.0 * u;
    caseRX = u * 4.5;
    caseRY = -u * 6.2;
    caseRZ = u * 8.4;
    if (f > 0.58) {
      spentCaseOpacity = 1 - linearSeg(f, 0.58, 0.72);
    }
  }

  // 3. Chamber Ignition Flash, Concentric Bore Evacuator Purge & 120mm Muzzle Blast Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.075 && f <= 0.175) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.075, 0.175) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.15 && f <= 0.27) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.15, 0.27) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.185 && f <= 0.31) {
    const u = linearSeg(f, 0.185, 0.31);
    muzzlePlumeScale = 1.6 + 4.8 * Math.pow(u, 0.48);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.94;
  }

  // 4. Next Live 120mm M829A4 Round tracked from Bustle -> M256 Breech (`endpointJump === 0`)
  const ram01 = seg(f, 0.62, 0.84);
  const center01 = seg(f, 0.62, 0.72);
  const nextX = -150.0 + M1A2_READY_ROUND_RAM * ram01;
  const nextY = M1A2_BORE_Y + 2.4 * Math.sin(linearSeg(f, 0.62, 0.84) * Math.PI);
  const nextZ = -14.0 + 14.0 * center01;
  const nextRZ = 0.04 * Math.sin(linearSeg(f, 0.62, 0.84) * Math.PI);

  // 5. Reserve 120mm M829A4 Round waiting inside rear bustle honeycomb rack
  const resX = -168.0;
  const resY = M1A2_BORE_Y - 9.5;
  const resZ = -38.0;

  return {
    bulletVisible,
    bulletPos: [bulletX, M1A2_BORE_Y, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [315.0 - recoilAmt, M1A2_BORE_Y, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, resZ],
  };
}

// ============================================================================
// Direct v3 Cycles-Baked 2K 5-Channel Packed ORM WebP Suites & Bindings
// ============================================================================

export const M1A2_V3_HULL_ARMOR_PBR: PbrBindingSpec = {
  albedoFile: 'm1a2_v3_hull_armor_albedo.webp',
  normalFile: 'm1a2_v3_hull_armor_normal.webp',
  roughnessFile: 'm1a2_v3_hull_armor_roughness.webp',
  normalScale: 0.88,
};

export const M1A2_V3_TURRET_GUN_PBR: PbrBindingSpec = {
  albedoFile: 'm1a2_v3_turret_gun_albedo.webp',
  normalFile: 'm1a2_v3_turret_gun_normal.webp',
  roughnessFile: 'm1a2_v3_turret_gun_roughness.webp',
  normalScale: 0.86,
};

export const M1A2_V3_TURBINE_BUSTLE_PBR: PbrBindingSpec = {
  albedoFile: 'm1a2_v3_turbine_bustle_albedo.webp',
  normalFile: 'm1a2_v3_turbine_bustle_normal.webp',
  roughnessFile: 'm1a2_v3_turbine_bustle_roughness.webp',
  normalScale: 0.85,
};

export const M1A2_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  // Suite 1: m1a2_v3_hull_armor (8 solid parts)
  m1a2_hull_shell: M1A2_V3_HULL_ARMOR_PBR,
  m1a2_side_skirts: M1A2_V3_HULL_ARMOR_PBR,
  m1a2_road_wheels: M1A2_V3_HULL_ARMOR_PBR,
  m1a2_tracks_left: M1A2_V3_HULL_ARMOR_PBR,
  m1a2_tracks_right: M1A2_V3_HULL_ARMOR_PBR,
  m1a2_engine_deck: M1A2_V3_HULL_ARMOR_PBR,
  m1a2_torsion_bars: M1A2_V3_HULL_ARMOR_PBR,
  m1a2_turret_ring: M1A2_V3_HULL_ARMOR_PBR,

  // Suite 2: m1a2_v3_turret_gun (8 solid parts)
  m1a2_turret_shell: M1A2_V3_TURRET_GUN_PBR,
  m1a2_blowoff_panels: M1A2_V3_TURRET_GUN_PBR,
  m1a2_composite_armor: M1A2_V3_TURRET_GUN_PBR,
  m1a2_main_gun: M1A2_V3_TURRET_GUN_PBR,
  m1a2_gun_mantlet: M1A2_V3_TURRET_GUN_PBR,
  m1a2_breech_block: M1A2_V3_TURRET_GUN_PBR,
  m1a2_crows_optics: M1A2_V3_TURRET_GUN_PBR,
  m1a2_smoke_launchers: M1A2_V3_TURRET_GUN_PBR,

  // Suite 3: m1a2_v3_turbine_bustle (8 solid parts)
  m1a2_blast_doors: M1A2_V3_TURBINE_BUSTLE_PBR,
  m1a2_ammo_bustle: M1A2_V3_TURBINE_BUSTLE_PBR,
  m1a2_ready_round: M1A2_V3_TURBINE_BUSTLE_PBR,
  m1a2_stub_deflector: M1A2_V3_TURBINE_BUSTLE_PBR,
  m1a2_agt1500_turbine: M1A2_V3_TURBINE_BUSTLE_PBR,
  m1a2_x1100_transmission: M1A2_V3_TURBINE_BUSTLE_PBR,
  m1a2_fuel_cells: M1A2_V3_TURBINE_BUSTLE_PBR,
  m1a2_crew_stations: M1A2_V3_TURBINE_BUSTLE_PBR,
};

export const M1A2_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'm1a2_v3_hull_armor',
    weapon: M1A2_ID,
    titleCn:
      'M1A2 SEP v3 沙漠 CARC 沙色车体、重型防弹侧裙、涡轮尾喷盖板与 T158 履带贴图组 (V3)',
    partTag: 'F-01..F-08 HULL, SKIRTS, ENGINE DECK & RUNNING GEAR',
    resolution: '2048 × 2048 px',
    summary:
      '由 Blender 5.2 Cycles GPU 烘焙的 M1A2 SEP v3 车体与行走系统 2K 5 通道 Packed ORM 贴图组：精确呈现美军正宗沙漠 CARC 沙色防化学涂层（sRGB 0.62, 0.54, 0.40）哑光防滑颗粒、车首清晰黑色防撞杠编号「3-69 AR / B-21」、侧裙醒目美军黑色战术 V 标「^」与沙尘风化包浆、尾部高温喷口红黄「DANGER — JET BLAST / EXHAUST」警示喷漆，以及 T158 挂胶履带与淬火炮塔内齿座圈材质分层。',
    highlights: [
      '沙漠 CARC 沙色涂装配 1:1 平面 Hero UV 车首「3-69 AR / B-21」与侧裙黑色战术「^」识别标',
      '后置涡轮动力舱尾喷百叶红黄高对比「DANGER JET BLAST / EXHAUST」警示喷印（>=50px UV防火墙）',
      'T158 挂胶履带、7 对双盘负重轮、14 根扭杆与 2.16m 精密炮塔内齿座圈物理粗糙度分离',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm1a2_v3_hull_armor_albedo.webp',
        note: 'sRGB · 沙漠 CARC 沙色车体 / 3-69 AR B-21 与 ^ 战术标 / 红黄 JET BLAST 警示',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'm1a2_v3_hull_armor_normal.webp',
        note: 'Linear · Cycles 焊缝与防滑颗粒 + 侧裙接缝与百叶倒角 + 履带胶块凹凸',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'm1a2_v3_hull_armor_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:座圈齿(0.22)-CARC防滑漆(0.68)-橡胶履带(0.82) / B:金属度',
      },
    ],
  },
  {
    id: 'm1a2_v3_turret_gun',
    weapon: M1A2_ID,
    titleCn:
      '楔形复合炮塔、乔巴姆/贫铀夹层前颊、120mm M256 主炮与 CROWS-LP 观瞄贴图组 (V3)',
    partTag: 'F-09..F-12 / S-01..S-02 / FC-01..FC-02 TURRET, CHOBHAM & M256 GUN',
    resolution: '2048 × 2048 px',
    summary:
      '聚焦 M1A2 SEP v3 攻防核心的 2K 5 通道 Packed ORM 贴图套件：炮塔双侧高分辨率 Hero 展板喷印清晰美军黑色「B-21」与战术 V 标「^」及 CIP 识别百叶，前颊内腔 7 层乔巴姆/贫铀（DU）NERA 三明治复合装甲呈现钢/陶瓷/贫铀网/铜吸能层的震撼材质对照，120mm M256 主炮配隔热护套与膛口积碳，CROWS-LP、CITV 与 GPS 观瞄镜片实行严格 >=50 px UV 防火墙绿宝石-蓝宝石多层镀膜。',
    highlights: [
      '炮塔双侧无畸变黑色「B-21」/「^」战术喷涂、CIP 敌我识别板与尾舱泄压顶板细节',
      '纵剖专属 7 层乔巴姆/贫铀（DU）NERA 复合前颊三明治阵列（陶瓷/贫铀/铜层清晰分层）',
      'CROWS-LP、CITV 与 GPS 主瞄镜 >=50px 隔离防火墙绿宝石-蓝宝石多层光学镀膜镜片',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm1a2_v3_turret_gun_albedo.webp',
        note: 'sRGB · 沙漠 CARC 炮塔 B-21 / 乔巴姆贫铀夹层 / M256 主炮 / 绿宝石光学镀膜',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'm1a2_v3_turret_gun_normal.webp',
        note: 'Linear · 装甲板焊道 + 炮管隔热箍环 + M256 立楔炮闩 CNC 刀纹与 CIP 百叶',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'm1a2_v3_turret_gun_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:镀膜镜片(0.08)-炮闩钢(0.24)-CARC装甲(0.66) / B:金属度',
      },
    ],
  },
  {
    id: 'm1a2_v3_turbine_bustle',
    weapon: M1A2_ID,
    titleCn:
      '霍尼韦尔 AGT1500 燃气轮机、装甲隔爆门、120mm M829A4 蜂窝尾舱与 SEP v3 舱内贴图组 (V3)',
    partTag: 'FC-03..FC-05 / M-01 / M-03..M-04 / S-04 AGT1500 TURBINE & BUSTLE',
    resolution: '2048 × 2048 px',
    summary:
      '专为 M1A2 SEP v3 实时纵剖奇观定制的 2K 5 通道 Packed ORM 内构贴图套件：高光刻画霍尼韦尔 AGT1500 燃气轮机 5 级闪亮钛合金轴流压气机叶片与温暖夺目的铜-青铜褶皱环形圆柱回热热交换器、重型滑移装甲隔爆门黄黑「BLAST DOOR — KEEP CLOSED」警示带、尾舱 36 发 120mm M829A4 贫铀脱壳穿甲弹（黄铜底盘/橄榄沙可燃药筒/亮铝弹托/暗灰贫铀穿甲杆四重材质分层），以及 SEP v3 双青绿数字化战术地图 LCD 显控屏。',
    highlights: [
      '霍尼韦尔 AGT1500 燃气轮机闪亮钛合金多级压气机叶片 + 暖铜-青铜环形回热器热交换核心',
      '装甲滑移隔爆门黄黑「BLAST DOOR — KEEP CLOSED」醒目警示标与 36 发 M829A4 银弹蜂窝架',
      'SEP v3 车长/炮长/驾驶员青绿战术地图 LCD 屏幕与铜回热器严格 >=50px UV 防火墙零色渗',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm1a2_v3_turbine_bustle_albedo.webp',
        note: 'sRGB · 钛合金压气机 / 暖铜环形回热器 / 黄黑隔爆门 / 120mm M829A4 / 青绿战术LCD',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'm1a2_v3_turbine_bustle_normal.webp',
        note: 'Linear · 压气机叶片倒角 + 回热器褶皱散热片 + 变速箱加强筋与蜂窝弹筒车削纹',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'm1a2_v3_turbine_bustle_roughness.webp',
        note: 'Linear · R:内构自阴影AO / G:钛叶片与铜回热器(0.18)-黄铜弹底(0.20)-可燃药筒(0.62) / B:全金属分层',
      },
    ],
  },
];

export const M1A2_PLUGIN: WeaponRuntimePlugin = {
  id: M1A2_ID,
  partGroups: M1A2_PART_GROUPS,
  timelinePresets: M1A2_TIMELINE_PRESETS,
  parts: M1A2_PARTS,
  firingPhases: M1A2_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(M1A2_FIRING_PHASES, f),
  computeFiringKinematics: computeM1a2FiringKinematics,
  computeBallisticsState: computeM1a2BallisticsState,
  pbrBindings: M1A2_PBR_BINDINGS,
  pbrSuites: M1A2_PBR_SUITES,
};
