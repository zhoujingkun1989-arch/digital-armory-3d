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
  TIGER_BORE_Y,
  TIGER_BREECH_WEDGE_DZ,
  TIGER_CHAMBER_X,
  TIGER_MUZZLE_X,
  TIGER_RECOIL_STROKE,
  TIGER_TURRET_CENTER_X,
} from './meshes/tiger1Geometries';

export const TIGER1_ID: WeaponId = 'tiger1';
export const TIGER1_CALIBER: CaliberProfile = '88mm_pzgr39';

const TWO_PI = Math.PI * 2;

export const TIGER1_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '克虏伯 88mm KwK 36 L/56 主炮、120mm 炮盾与液压复进机组',
    nameEn: 'Krupp 88mm KwK 36 L/56 Main Gun, 120mm Mantlet & Recoil Group',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '垂直均质钢车体、马蹄形炮塔、交错负重轮与 725mm 宽履带组',
    nameEn: 'Boxy RHA Hull, Horseshoe Turret, Interleaved Wheels & 725mm Tracks',
    badgeColor: '#94a3b8',
  },
  {
    key: 'fire_control',
    nameZh: '水平楔式炮闩、TZF 9b 瞄具、迈巴赫 HL230 V12 与 Olvar 传动组',
    nameEn: 'Sliding-Wedge Breech, TZF 9b Sight, Maybach HL230 V12 & Olvar Drive',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '侧翼 88×571mmR PzGr. 39 黄铜弹药架与装填待发实弹组',
    nameEn: 'Sponson 88x571mmR PzGr. 39 Brass Ammo Racks & Ready Round',
    badgeColor: '#4ade80',
  },
];

export const TIGER1_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '虎式 131 战备合拢态',
    subLabel: '0% Combat Ready',
    t: 0,
    desc: '二战德国六号重型坦克虎 I E 型（Tiger 131，第 504 重装甲营）1:1 真尺战备合拢态：车体全长 6,316 mm（含 88mm KwK 36 L/56 主炮全长 8,450 mm）、宽 3,560 mm、高 3,000 mm，标志性 100 mm 垂直首上装甲、防磁水泥涂覆与双挡板锥形炮口制退器蓄势待发。',
  },
  {
    id: 'field_strip',
    label: '野战炮塔与装甲外盖快拆',
    subLabel: '32% Turret & Armor Strip',
    t: 0.32,
    desc: '按重装甲营野战检修规程分离外置装甲总成：向上吊离车体两侧折叠挡泥板、动力舱百叶顶盖（连同双联费菲尔沙漠空滤与铸铁排气管罩）以及指挥塔舱盖，左右外推 725 mm 超宽战斗履带。',
  },
  {
    id: 'powertrain_strip',
    label: '88mm 炮尾、迈巴赫 V12 与交错轮系分解',
    subLabel: '66% 88mm Gun & Powertrain',
    t: 0.66,
    desc: '整座马蹄形铸弯装甲炮塔高升脱离车体，前抽 4.93 米 88mm KwK 36 主炮、120 mm 炮盾、液压复进摇架与克虏伯水平楔式炮闩；后方拉出 23.1 升 700 马力迈巴赫 HL230 V12 汽油机与双油箱，前方滑出迈巴赫 Olvar 8 速预选变速箱，底部完整展开 16 根横向扭力杆与三排交错负重轮。',
  },
  {
    id: 'full_exploded',
    label: '虎式 131 全车 26 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 26 个 1:1 重型装甲工程节点三维零干涉立体展开：从 88mm KwK 36 锥形炮口制退器、克虏伯水平楔式半自动炮闩、双联重型复进弹簧、TZF 9b 双目瞄准镜、18 发 88×571mmR 黄铜穿甲弹架，到迈巴赫 HL230 P45 V12 发动机、中央传动轴、Olvar 8 速齿轮箱与享誉世界的 Schachtellaufwerk 交错负重轮系。',
  },
];

export const TIGER1_PARTS: WeaponPartSpec[] = [
  // ==================== 1. 88mm KwK 36 L/56 MAIN GUN & RECOIL GROUP ('slide' · 5 parts) ====================
  {
    id: 'tiger_main_gun',
    bomCode: 'G-01',
    nameZh: '克虏伯 88mm KwK 36 L/56 (4.93米) 线膛炮管与双室制退器',
    calloutLabel: '88mm KwK 36 L/56 主炮',
    nameEn: 'Krupp 88mm KwK 36 L/56 (4.93m) Rifled Cannon & Twin-Baffle Brake',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [142, TIGER_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.7], offset: [165, 118, 0] },
      { range: [0.7, 1.0], offset: [63, 48, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [210, 12, 0],
    labelAppearAt: 0.0,
    roleTag: '56 倍径 4,930 mm 传世重炮 · 发射 PzGr. 39 初速 773 m/s 击穿盟军重甲',
    description:
      '源自 8.8 cm FlaK 36 高射炮血统的克虏伯 KwK 36 L/56 主炮：全长 4.93 米（含标志性双室锥形炮口制退器总伸出至车首前方 2.13 米），32 条右旋膛线赋予 10.2 kg PzGr. 39 穿甲被帽弹 773 m/s 膛口初速，千米距离可轻松贯通 100 mm 均质钢甲；发射瞬间随炮尾沿炮架导轨平直后坐 290 mm。',
  },
  {
    id: 'tiger_gun_mantlet',
    bomCode: 'G-02',
    nameZh: '120mm 整体铸钢外部防盾(含同轴 MG 34 与 TZF 9b 窥孔)',
    calloutLabel: '120mm 铸钢外部炮盾',
    nameEn: '120mm Cast-Steel External Gun Mantlet w/ Coaxial MG 34 & TZF 9b Ports',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [134, TIGER_BORE_Y, 0],
    explodeSteps: [
      { range: [0.32, 0.68], offset: [110, 118, 0] },
      { range: [0.68, 1.0], offset: [36, 48, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [16, 22, 0],
    labelAppearAt: 0.08,
    roleTag: '局部叠加厚达 200 mm 终极正面防护 · 内嵌同轴机枪与双目瞄孔',
    description:
      '覆罩于炮塔正面主炮开口处的巨型整体铸钢外防盾（Saukopf 前身平直加强肋构型）：基础厚度 120 mm、横向加强筋与底座叠合区等效厚度逼近 200 mm，正面右侧开设 7.92mm 同轴 MG 34 装甲枪套，左侧精准钻出双目 TZF 9b 炮手潜望瞄准孔。',
  },
  {
    id: 'tiger_recoil_cradle',
    bomCode: 'G-03',
    nameZh: '装甲内部炮架摇篮、液压制退筒与气压复进机总成',
    calloutLabel: '炮架摇篮与液压复进筒',
    nameEn: 'Armored Internal Gun Cradle, Hydraulic Recoil Brake & Recuperator',
    group: 'slide',
    material: 'stainless',
    assembledPos: [82, TIGER_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [84, 72, 118] },
      { range: [0.68, 1.0], offset: [30, 26, 47] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [14, 18, 14],
    labelAppearAt: 0.34,
    roleTag: 'Rohrbremse 液压制退 + Vorholer 复进机 · 吸收 88mm 巨额后坐动能',
    description:
      '通过粗壮耳轴铰接于炮塔前壁的 U 形装甲钢炮架摇篮，侧挂镀铬高频淬火液压节流制退筒（Rohrbremse）与液气式复进机（Vorholer）：在 88mm 炮弹爆发 320 MPa 峰值膛压瞬间，将狂暴后坐行程柔和限制在 290 mm 以内，并驱动炮身平稳复位。',
  },
  {
    id: 'tiger_recoil_springs',
    bomCode: 'G-04',
    nameZh: '双联重型锻钢螺旋复进缓冲主簧',
    calloutLabel: '双联重型复进缓冲簧',
    nameEn: 'Twin Heavy Forged Helical Recoil Recuperator Springs',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [76, TIGER_BORE_Y, -16],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [88, 118, 128] },
      { range: [0.68, 1.0], offset: [32, 48, 53] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 18, 0],
    labelAppearAt: 0.38,
    roleTag: '等线径 GPU 实时压缩形变 · 伴随 290 mm 后坐弹性储能并平稳推炮复进',
    description:
      '上下对称并列于炮架摇篮侧方的双联重型热卷铬硅合金螺旋复进弹簧（单簧线径 25 mm、自由长 680 mm）：在 88mm KwK 36 炮管后坐 -29 cm 阶段同步压缩至 57.4% 自由长，吸收尾端冲击能量并协同液气复进机将重达 1.3 吨的炮管与炮尾平稳送回待发位。',
  },
  {
    id: 'tiger_shell_guard',
    bomCode: 'G-05',
    nameZh: '管状钢制炮尾后坐护栏与黄铜空药筒收集篮',
    calloutLabel: '炮尾护栏与弹壳收集篮',
    nameEn: 'Tubular Steel Recoil Guard Frame & Slatted Brass Shell Catcher Basket',
    group: 'slide',
    material: 'copper_accent',
    assembledPos: [8, 92, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [42, 46, 124] },
      { range: [0.68, 1.0], offset: [15, 17, 51] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -24, 0],
    labelAppearAt: 0.36,
    roleTag: 'Abweiser 防撞护架 + Hülsenfangsack · 安全承接滚烫 88mm 黄铜药筒',
    description:
      '紧锁于克虏伯炮尾后方的双侧管状钢制后坐防护框（Abweiser），物理隔离 -29 cm 狂猛后坐的炮尾与左右炮手/装填手躯干；下方悬挂条状黄铜框弹壳收集篮（Hülsenfangsack），在炮闩半自动开闩瞬间稳稳接住向后退出的 571 mm 炽热黄铜空药筒，避免烫伤乘员或滚入炮塔齿圈卡死旋转。',
  },

  // ==================== 2. HULL, TURRET, SCHACHTELLAUFWERK & TRACKS ('frame' · 12 parts) ====================
  {
    id: 'tiger_hull_box',
    bomCode: 'H-01',
    nameZh: '100mm 垂直首上均质钢装甲车体(暗黄三色迷彩/防磁水泥/铁十字)',
    calloutLabel: '100mm 垂直装甲车体',
    nameEn: '100mm Vertical-Glacis Krupp RHA Box Hull (Dunkelgelb & Zimmerit)',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [145, 22, 162],
    labelAppearAt: 0.0,
    roleTag: '真正中空 100mm 克虏伯均质钢壳 · 指接燕尾焊缝、驾驶员窥窗与球架 MG 34',
    description:
      '亨舍尔（Henschel）经典方正垂直全焊接装甲车体（长 6,316 mm、全宽 3,240 mm 悬挑侧翼）：正面 100 mm、侧后 82 mm 克虏伯表面硬化均质钢板以精密燕尾指接焊缝互锁；外披 1943 年突尼斯战区暗黄（Dunkelgelb RAL 7028）迷彩与横向梳纹防磁水泥（Zimmerit），侧壁涂装清晰白边国防军直臂铁十字（Balkenkreuz），车体内部刷涂正宗德军象牙白（Elfenbein RAL 1001）反光漆；按下 [C] 纵剖即可一刀洞穿全车内脏！',
  },
  {
    id: 'tiger_side_fenders',
    bomCode: 'H-02',
    nameZh: '铰接式薄钢板侧履带挡泥板与前装甲挡泥翼',
    calloutLabel: '铰接式侧裙与前挡泥板',
    nameEn: 'Hinged Sheet-Metal Side Track Fenders & Front Armored Mudflaps',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 12, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [0, 42, 0] },
      { range: [0.64, 0.96], offset: [0, 15, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [120, 8, 174],
    labelAppearAt: 0.06,
    roleTag: '可折叠铁路运输侧挡板 · 遮蔽 725 mm 超宽履带泥浆飞溅',
    description:
      '沿车体两侧悬挑装甲边缘铰接安装的 5 段式薄钢板履带挡泥翼与前倾斜装甲挡泥罩：战斗状态向外展开覆盖 725 mm 超宽战斗履带外缘，铁路平板运输时可整体拆解折叠以缩窄车宽。',
  },
  {
    id: 'tiger_interleaved_wheels',
    bomCode: 'H-03',
    nameZh: '三排重叠交错负重轮系(Schachtellaufwerk)、前置主动轮与诱导轮',
    calloutLabel: '交错负重轮 Schachtellaufwerk',
    nameEn: 'Overlapping Interleaved Road Wheels (Schachtellaufwerk) & Sprockets',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, -76, 0],
    explodeSteps: [
      { range: [0.36, 0.7], offset: [0, 0, 250] },
      { range: [0.7, 1.0], offset: [0, 0, 110] },
    ],
    calloutDir: 'down',
    calloutStem: 50,
    calloutAnchor: [40, -28, 165],
    labelAppearAt: 0.04,
    roleTag: '虎式最传奇行走奇迹 · 每侧 8 轴 16 轮三排错落交叠均摊 57 吨接地压',
    description:
      '海因里希·克尼普坎普（Heinrich Kniepkamp）独步二战坦克史的杰作——交错重叠负重轮系统（Schachtellaufwerk）：每侧 8 根扭力轴（轴距 580 mm）装配直径高达 800 mm 的挂胶压制钢轮，外排、中双排与内排沿横向错落交叠达 220 mm，为 57 吨重甲巨兽带来如履平地的极低接地比压与行进间平稳射击平台，配合前置 20 齿重型主动轮与后置张紧诱导轮构成虎式最具辨识度的侧影。',
  },
  {
    id: 'tiger_tracks_left',
    bomCode: 'H-04',
    nameZh: '左侧 725mm 超宽 Kgs 63/725/130 锰钢战斗履带',
    calloutLabel: '左侧 725mm 战斗履带',
    nameEn: 'Left 725mm Ultra-Wide Kgs 63/725/130 Cast-Steel Combat Track Belt',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [0, -63, -140.75],
    explodeSteps: [
      { range: [0.1, 0.34], offset: [0, 0, -250] },
      { range: [0.64, 0.96], offset: [0, 0, -110] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -52, -32],
    labelAppearAt: 0.12,
    roleTag: '单块履带板宽达 725 mm · 粗犷防滑抓地齿与中央导向齿脊',
    description:
      '令盟军惊叹的左侧 Kgs 63/725/130 锰钢干销战斗履带（单侧 96 块履带板，宽达 725 mm）：外侧铸造深切 V 形抓地履刺，内侧居中矗立高强度钢制导向齿脊精准嵌入交错负重轮中槽，将 57 吨全重均匀分散至松软泥泞与北非沙地（接地比压仅 1.04 kg/cm²）。',
  },
  {
    id: 'tiger_tracks_right',
    bomCode: 'H-05',
    nameZh: '右侧 725mm 超宽 Kgs 63/725/130 锰钢战斗履带',
    calloutLabel: '右侧 725mm 战斗履带',
    nameEn: 'Right 725mm Ultra-Wide Kgs 63/725/130 Cast-Steel Combat Track Belt',
    group: 'frame',
    material: 'barrel_steel',
    isShell: true,
    assembledPos: [0, -63, 140.75],
    explodeSteps: [
      { range: [0.1, 0.34], offset: [0, 0, 320] },
      { range: [0.64, 0.96], offset: [0, 0, 140] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -52, 32],
    labelAppearAt: 0.12,
    roleTag: '纵剖模式自动隐藏显露三排交错负重轮 · 与左侧镜像对称',
    description:
      '右侧 725 mm 超宽锰钢战斗履带总成（与左侧完全镜像互换）：标记为纵剖壳体构件，开启 CT 纵剖（[C]）时自动切离视野，完整裸露出其内部精密交叠的三排 Schachtellaufwerk 交错负重轮系与扭力杆摇臂。',
  },
  {
    id: 'tiger_engine_deck',
    bomCode: 'H-06',
    nameZh: '后置百叶散热甲板、双联费菲尔空气滤清器与装甲排气管罩',
    calloutLabel: '动力舱盖、费菲尔滤筒与排气',
    nameEn: 'Rear Louvered Engine Deck, Twin Feifel Air Filters & Exhaust Shrouds',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-214, 30, 0],
    explodeSteps: [
      { range: [0.08, 0.32], offset: [2, 92, 0] },
      { range: [0.64, 0.96], offset: [0, 38, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-40, 24, 0],
    labelAppearAt: 0.08,
    roleTag: '虎式 131 北非沙漠标志性费菲尔双滤罐 + 高温锈蚀铸铁双排气管',
    description:
      '虎式 131 早期型最迷人的尾部特征组合：包含中央迈巴赫 V12 吊装检修舱门、左右对称进排气装甲百叶格栅、车尾两具巨大的圆柱形费菲尔（Feifel）旋风沙漠空气滤清罐与波纹进气管，以及双联外罩内两根经高温废气烤成锈橙色的粗壮铸铁排气管消声器。',
  },
  {
    id: 'tiger_torsion_bars',
    bomCode: 'H-07',
    nameZh: '16 根全宽横向锻钢扭力杆与外置负重轮摇臂总成',
    calloutLabel: '16 根横向扭力杆悬架',
    nameEn: '16 Transverse Floor Torsion Bars & Trailing Swing-Arm Hubs',
    group: 'frame',
    material: 'stainless',
    assembledPos: [-9, -68, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [9, -24, -215] },
      { range: [0.68, 1.0], offset: [0, -10, -95] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -4, 0],
    labelAppearAt: 0.36,
    roleTag: '贯穿底甲板高弹性扭杆弹簧 · 独立缓冲每组交错负重轮起伏',
    description:
      '横向错列铺设于车体底甲板内侧的 16 根高强度铬钒弹簧钢扭力杆（直径 55–58 mm，长逾 2 米）：每根扭杆一端花键锁死在异侧车体壁锚座，另一端贯穿对侧车体驱动外置拖臂式曲柄摇臂，为 57 吨车体提供大行程独立悬挂弹力。',
  },
  {
    id: 'tiger_turret_ring',
    bomCode: 'H-08',
    nameZh: '1,850mm 精密内齿钢制炮塔座圈与滚珠轴承环',
    calloutLabel: '1,850mm 炮塔齿圈轴承',
    nameEn: '1,850mm Precision Toothed Steel Turret Traverse Race Ring',
    group: 'frame',
    material: 'stainless',
    assembledPos: [TIGER_TURRET_CENTER_X, 51, 0],
    explodeSteps: [
      { range: [0.32, 0.66], offset: [0, 32, 0] },
      { range: [0.66, 1.0], offset: [0, 12, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [95, 4, 0],
    labelAppearAt: 0.34,
    roleTag: '承托 11 吨重炮塔 360° 平顺回转 · 内环精密渐开线齿圈',
    description:
      '螺栓固紧于车体顶甲板开孔处的超大口径（内径 1,850 mm）渗碳淬火钢制炮塔滚珠座圈：下方承托重达 11 吨的装甲炮塔与吊篮全重，内圈精密铣削全周渐开线齿轮与液压方向机小齿轮啮合，最快 60 秒完成整周 360° 电动/液压平稳转向。',
  },
  {
    id: 'tiger_turret_shell',
    bomCode: 'H-09',
    nameZh: '马蹄形整板弯折装甲炮塔壳体(战术编号 131 与车尾隆美尔储物箱)',
    calloutLabel: '马蹄形 131 装甲炮塔',
    nameEn: 'Hollow Horseshoe-Curved Tiger I Turret Shell (#131 & Rommelkiste)',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [TIGER_TURRET_CENTER_X, 100, 0],
    explodeSteps: [
      { range: [0.24, 0.64], offset: [0, 120, 0] },
      { range: [0.64, 1.0], offset: [0, 48, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-10, 44, 0],
    labelAppearAt: 0.0,
    roleTag: '真正中空 80–100 mm 整弯马蹄形炮塔 · 醒目白边黑字「131」与尾储物箱',
    description:
      '克虏伯独具匠心的马蹄形单块 80 mm 均质钢板热弯成型侧后壁与 100 mm 正面焊装装甲炮塔壳体：尾部栓挂经典德军「隆美尔储物箱」（Rommelkiste），两侧垂壁保留横向防磁水泥纹理与英国鲍文顿坦克博物馆全球唯一可动态行驶虎式「131」醒目白边黑色战术编号，内壁涂覆正宗象牙白反光漆，纵剖即览全套 88mm 战斗室。',
  },
  {
    id: 'tiger_cupola_hatches',
    bomCode: 'H-10',
    nameZh: '圆柱形七视孔车长指挥塔、顶铰链舱盖与装填手舱门',
    calloutLabel: '车长指挥塔与顶舱盖',
    nameEn: 'Cylindrical Commander Cupola (7 Vision Blocks) & Loader Roof Hatch',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-8, 160, -4],
    explodeSteps: [
      { range: [0.1, 0.34], offset: [0, 140, 0] },
      { range: [0.64, 1.0], offset: [0, 58, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-24, 20, -42],
    labelAppearAt: 0.08,
    roleTag: '全车最高点 3,000 mm · 360° 全周 7 具防弹玻璃潜望观察镜',
    description:
      '矗立于炮塔左后顶部的标志性虎式早期/中期高耸圆柱形车长指挥塔（塔顶海拔达 3,000 mm）：周身均布 7 具厚重防弹玻璃潜望观察块与防雨遮檐赋予车长无死角战场态势感知，配重铰链顶盖与右侧装填手矩形顶舱门及中央抽烟通风罩一并集成。',
  },
  {
    id: 'tiger_turret_basket',
    bomCode: 'H-11',
    nameZh: '悬挂式圆形钢制炮塔战斗室吊篮与液压方向机箱',
    calloutLabel: '炮塔吊篮与液压方向机',
    nameEn: 'Suspended Circular Turret Floor Basket & Hydraulic Traverse Gearbox',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [TIGER_TURRET_CENTER_X, 8, 0],
    explodeSteps: [
      { range: [0.28, 0.66], offset: [0, 108, 0] },
      { range: [0.66, 1.0], offset: [0, 42, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, -34, 0],
    labelAppearAt: 0.3,
    roleTag: '随炮塔同步 360° 旋转 · 悬空净跨中央传动轴上方',
    description:
      '由四根高强钢管悬吊于炮塔齿圈下方的圆形防滑钢板战斗室吊篮地板（底面离地高悬于中央传动轴与扭力杆上方）：令车长、炮手与装填手在炮塔 360° 转向时始终与 88mm 主炮保持固定人机相对位置，左侧地板安装博林格-斯图姆（Boehringer-Sturm）液力静压炮塔回转方向机。',
  },
  {
    id: 'tiger_fuel_tanks',
    bomCode: 'H-12',
    nameZh: '后动力舱双联焊接钢制 540 升航空汽油箱组',
    calloutLabel: '双联 540L 焊接汽油箱',
    nameEn: 'Twin Rear Side-Compartment Welded Steel Gasoline Fuel Tanks (540L)',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-202, -8, -126],
    explodeSteps: [
      { range: [0.34, 0.7], offset: [-168, 12, -32] },
      { range: [0.7, 1.0], offset: [-60, 4, -12] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, 28, 0],
    labelAppearAt: 0.36,
    roleTag: '串联双箱配黄铜加油颈与铜平衡油管 · 供能 700 马力 V12 汽油机',
    description:
      '布置于车体后动力舱侧隔室内的前后串联焊接薄钢板汽油箱总成（全车燃油总容量 540 升），外表防锈红丹底漆配黄铜加油口颈与紫铜连通平衡管，与迈巴赫 HL230 V12 经防火隔板隔离并协同提供约 140 公里公路作战半径。',
  },

  // ==================== 3. BREECH, OPTICS, MAYBACH V12, OLVAR GEARBOX & CREW ('fire_control' · 7 parts) ====================
  {
    id: 'tiger_breech_block',
    bomCode: 'FC-01',
    nameZh: '克虏伯整铣炮尾环与半自动水平滑动楔式炮闩',
    calloutLabel: '克虏伯水平楔式炮闩',
    nameEn: 'Krupp Milled Breech Ring & Semi-Automatic Horizontal Sliding Wedge',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [64, TIGER_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [96, 24, 118] },
      { range: [0.68, 1.0], offset: [36, 9, 47] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-6, 15, 0],
    labelAppearAt: 0.34,
    roleTag: 'Keilverschluss 半自动水平横滑开闩 · 装入新弹自动弹闭待击',
    description:
      '虎式高射速（每分钟 6–8 发）的火控核心——克虏伯整体铣削高强合金钢炮尾与半自动水平滑动楔式炮闩（Waagerechter Keilverschluss）：炮身复进末段凸轮自动将楔块横向滑开 160 mm 并甩出空黄铜药筒；装填手将下一发 88mm PzGr. 39 实弹推抵抽壳钩瞬间，弹簧自动猛然闭合炮闩，无需手动扳闩即可立即电击发！',
  },
  {
    id: 'tiger_breech_spring',
    bomCode: 'FC-02',
    nameZh: '半自动水平炮闩蓄能闭闩螺旋弹簧',
    calloutLabel: '水平炮闩闭闩蓄能簧',
    nameEn: 'Semi-Automatic Horizontal Breech-Closing Helical Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [56, 120, -14],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [102, 11, 168] },
      { range: [0.68, 1.0], offset: [38, 4, 64] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [0, 4, 0],
    labelAppearAt: 0.38,
    roleTag: '开闩压缩蓄能 · 新弹触动卡笋瞬间疾速弹出推闭水平炮闩',
    description:
      '装设于克虏伯炮尾左上方弹簧筒内的重型锻钢闭闩螺旋弹簧：在炮身复进驱动水平楔块横滑开闩时被压缩储能至 64%，待新弹药筒底缘触发双侧抽壳爪释放卡笋的刹那，瞬间爆发弹力推动炮闩铿锵闭合锁死炮膛。',
  },
  {
    id: 'tiger_optics_tzf9b',
    bomCode: 'FC-03',
    nameZh: '徕兹 TZF 9b 铰接双目望远炮手瞄准镜(蓝宝石镀膜物镜)',
    calloutLabel: 'TZF 9b 双目望远瞄具',
    nameEn: 'Leitz Turmzielfernrohr 9b Articulated Binocular Telescopic Gun Sight',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [84, 106, -38],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [82, 116, -92] },
      { range: [0.68, 1.0], offset: [30, 46, -35] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [16, 8, 0],
    labelAppearAt: 0.34,
    roleTag: '2.5× 广角双目三角测距分划 · 2,000 米首发精准狙杀之眼',
    description:
      '德国韦茨拉尔恩斯特·徕兹光学厂（Ernst Leitz Wetzlar）精密打造的 Turmzielfernrohr 9b 铰接双目炮手瞄准镜：与 88mm 主炮摇篮刚性联动俯仰，内置著名的「七角尖塔」密位测距分划与 4,000 米穿甲/榴弹双距离刻度鼓，配合蓝宝石抗反射镀膜物镜造就虎式远距一击必杀的光学神话。',
  },
  {
    id: 'tiger_maybach_v12',
    bomCode: 'FC-04',
    nameZh: '迈巴赫 HL230 P45 23.1升 700马力 V12 汽油机与双侧铝散热器',
    calloutLabel: '迈巴赫 HL230 V12 引擎',
    nameEn: 'Maybach HL230 P45 23.1L 700 HP V12 Gasoline Engine & Radiators',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-206, -12, 0],
    explodeSteps: [
      { range: [0.34, 0.7], offset: [-164, 14, 0] },
      { range: [0.7, 1.0], offset: [-60, 6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [0, 44, 0],
    labelAppearAt: 0.34,
    roleTag: '纵剖动力视觉心脏 · 60° 夹角 V12 缸体、4 具 Solex 化油器与双排气管',
    description:
      '推动 57 吨虎式巨兽达到 45 km/h 极速的动力心脏——迈巴赫 HL230 P45 60° 夹角水冷 12 缸汽油发动机（排量 23.095 升，3,000 转输出 700 马力）：铸铁灰色厚壁 V12 缸体上方矗立 4 具银色索莱克斯（Solex 52 JFF II）下吸式化油器与进气集滤筒，两侧伸出灼热橙棕色 6 合 1 铸铁排气歧管，并整合后侧大面积铝合金水冷散热器芯。',
  },
  {
    id: 'tiger_transmission',
    bomCode: 'FC-05',
    nameZh: '前置迈巴赫 Olvar 8 速预选变速箱与亨舍尔 L600C 双半径转向机',
    calloutLabel: 'Olvar 8速变速与转向机',
    nameEn: 'Maybach Olvar 40 12 16 8-Speed Gearbox & Henschel L600C Steering Diff',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [216, -32, 0],
    explodeSteps: [
      { range: [0.34, 0.7], offset: [148, 0, 0] },
      { range: [0.7, 1.0], offset: [56, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [16, -24, 0],
    labelAppearAt: 0.36,
    roleTag: '8 前进 / 4 倒挡液压预选换挡 · 独步二战原地中心转向能力',
    description:
      '布置于车体前舱的德国机械工程奇迹：迈巴赫 Olvar 40 12 16 型 8 速半自动液压预选变速箱（8 前进挡、4 倒挡）与亨舍尔 L600C 双半径再生差速转向机构直连为一体，经粗壮横向半轴与盘式转向制动器直接驱动前置主动轮，使 57 吨虎式竟可凭借汽车式方向盘实现原地中心 360° 灵巧回转！',
  },
  {
    id: 'tiger_driveshaft',
    bomCode: 'FC-06',
    nameZh: '贯穿底舱中央锻钢万向节主传动轴',
    calloutLabel: '中央底舱主传动轴',
    nameEn: 'Central Floor Forged Steel Propeller Driveshaft & Cardan Joints',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [20, -44, 0],
    explodeSteps: [
      { range: [0.36, 0.7], offset: [2, -38, 0] },
      { range: [0.7, 1.0], offset: [0, -16, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -8, 0],
    labelAppearAt: 0.38,
    roleTag: '后置发动机 → 前置变速箱动力大动脉 · 击发模拟期间同步高速旋转',
    description:
      '典型二战德系「后置引擎、前置主动轮」构型的机械纽带：长达 2.98 米的锻钢主传动轴从后方迈巴赫 HL230 V12 飞轮端出发，经四组重型螺栓法兰万向联轴器笔直穿行于炮塔吊篮地板正下方、横向扭力杆正上方，将 700 马力澎湃扭矩平稳输送至车首 Olvar 变速箱。',
  },
  {
    id: 'tiger_crew_stations',
    bomCode: 'FC-07',
    nameZh: '五人车组战位(方向盘驾驶席、机电员电台与炮塔三席)',
    calloutLabel: '五人车组战位与方向盘',
    nameEn: '5-Man Crew Stations (Driver Steering Wheel, Radio Op & Turret Seats)',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [86, 12, -10],
    explodeSteps: [
      { range: [0.34, 0.7], offset: [280, 74, -120] },
      { range: [0.7, 1.0], offset: [110, 30, -45] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [62, -16, -44],
    labelAppearAt: 0.38,
    roleTag: '经典五人分工 + 罕见汽车方向盘操驾 · 机电员配 FuG 5 无线电台',
    description:
      '完整还原虎式 131 的经典五人车组空间工程：前左驾驶员战位配备二战重型坦克罕见的圆形汽车式方向盘与仪表盘（操控 L600C 液压差速转向），前右机电员/航向机枪手战位配 FuG 5 超短波无线电台，炮塔吊篮内围绕 88mm 主炮梯次布置车长高席、炮手瞄准席与装填手折叠凳。',
  },

  // ==================== 4. 88x571mmR PzGr. 39 AMMO RACKS & READY ROUND ('magazine' · 2 parts) ====================
  {
    id: 'tiger_ammo_racks',
    bomCode: 'M-01',
    nameZh: '左侧翼装甲弹药架(18 发 88×571mmR PzGr. 39 黄铜穿甲弹列)',
    calloutLabel: '侧翼 88mm 黄铜弹药架',
    nameEn: 'Left-Sponson Armored Bins w/ 88x571mmR PzGr. 39 Brass Cartridges',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [14, 14, -124],
    explodeSteps: [
      { range: [0.16, 0.44], offset: [0, 34, -112] },
      { range: [0.64, 0.98], offset: [0, 14, -44] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 26, 0],
    labelAppearAt: 0.18,
    roleTag: '920 mm 真尺定装黄铜炮弹阵列 · 漆黑被帽穿甲弹头与紫铜弹带',
    description:
      '紧贴车体左侧宽大悬挑侧翼内壁布置的分层装甲弹药架（虎式全车共计可携弹 92 发）：架内整齐卧放 18 发全尺寸 88×571mmR PzGr. 39 定装穿甲被帽风帽弹（APCBC），闪耀的 C26000 退火黄铜长药筒、紫铜导转带与哑黑钢制穿甲弹头在纵剖视角下触手可及。',
  },
  {
    id: 'tiger_ready_round',
    bomCode: 'M-02',
    nameZh: '待发 88×571mmR PzGr. 39 穿甲被帽风帽定装弹(重 16.0 kg)',
    calloutLabel: '待发 88mm PzGr. 39 炮弹',
    nameEn: 'Animated Ready 88x571mmR PzGr. 39 APCBC Complete Brass Round',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [-64, 72, -62],
    explodeSteps: [
      { range: [0.18, 0.48], offset: [56, 52, -158] },
      { range: [0.66, 0.98], offset: [22, 21, -60] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, 6, 0],
    labelAppearAt: 0.22,
    roleTag: '击发阶段 6 动态托举前推 +124 cm 入膛 · 自动触发克虏伯水平炮闩闭锁',
    description:
      '全长 920 mm、全弹重达 16.0 kg（弹头重 10.2 kg、内置 59 g 黑索今/钝化梯恩梯高爆装药）的经典德军 88×571mmR PzGr. 39 APCBC 定装实弹：击发模拟阶段 6 中由装填手自侧翼待发架托举至炮膛中轴，笔直前推 +124 cm 送入张开的克虏伯水平楔式炮尾完成上膛闭锁。',
  },
];

export const TIGER1_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'tiger_phase_1_solenoid_ignition',
    stepNum: '01',
    shortLabel: '电击发与底火引燃',
    title: '阶段 1 · 炮手电击发电磁阀与 C/22 电底火瞬时起爆',
    range: [0.0, 0.12],
    description:
      '炮手透过徕兹 TZF 9b 双目望远镜锁定目标并按下脚踏/手轮电击发开关，24V 脉冲电流经水平炮闩击针引燃 88×571mmR 药筒底部的 C/22 电底火，点燃 2.50 kg 管状硝化甘油发射药。',
  },
  {
    id: 'tiger_phase_2_pzgr39_acceleration',
    stepNum: '02',
    shortLabel: '88mm PzGr. 39 加速出膛',
    title: '阶段 2 · 320 MPa 峰值膛压驱动 10.2 kg PzGr. 39 弹丸以 773 m/s 破膛',
    range: [0.12, 0.24],
    description:
      '炮膛内压骤升至 320 MPa，紫铜导转带紧密咬合 32 条右旋膛线，将 10.2 kg PzGr. 39 穿甲被帽弹沿 4.93 米 KwK 36 L/56 炮管加速至 773 m/s；高压火药燃气经双室锥形炮口制退器向两侧剧烈偏转卸压，削减逾 45% 后坐冲量。',
  },
  {
    id: 'tiger_phase_3_kwk36_recoil',
    stepNum: '03',
    shortLabel: '-29 cm 液压后坐制退',
    title: '阶段 3 · KwK 36 炮管与克虏伯炮尾后坐 -29 cm 压缩双联复进簧',
    range: [0.24, 0.42],
    description:
      '炮管、炮尾环与闭锁中的水平楔块作为刚体沿炮架摇篮导轨平稳后坐整整 290 mm，Rohrbremse 液压制退筒节流泄能，同时将双联锻钢螺旋复进簧压缩至 57.4% 自由长以蓄积复进势能。',
  },
  {
    id: 'tiger_phase_4_counter_recoil_wedge',
    stepNum: '04',
    shortLabel: '复进与半自动水平开闩',
    title: '阶段 4 · 炮身复进归位触发克虏伯水平楔块横滑 160 mm 半自动开闩',
    range: [0.42, 0.58],
    description:
      '液气复进机与双联主簧推动 1.3 吨炮身平顺前移复位；复进末段炮架开闩凸轮拨动曲柄，令克虏伯水平楔式炮闩自动向左侧横向滑开 160 mm（同步压缩闭闩蓄能簧至 64%），彻底敞开 88mm 炮膛口。',
  },
  {
    id: 'tiger_phase_5_brass_ejection',
    stepNum: '05',
    shortLabel: '黄铜药筒退入弹壳篮',
    title: '阶段 5 · 抽壳钩猛拔 571 mm 炽热黄铜空药筒落入下方收集篮',
    range: [0.58, 0.7],
    description:
      '水平炮闩滑抵最左死点瞬间猛力撞击左右双抽壳钩杠杆，将长达 571 mm 的滚烫黄铜空药筒向后干脆抽出炮膛，经管状后坐护栏导向准确跌落至下方条状黄铜弹壳收集篮（Hülsenfangsack）内。',
  },
  {
    id: 'tiger_phase_6_loader_chamber',
    stepNum: '06',
    shortLabel: '装填手推入 88mm 新弹',
    title: '阶段 6 · 装填手自侧翼架托举 16 kg PzGr. 39 实弹前推 +124 cm 入膛',
    range: [0.7, 0.88],
    description:
      '装填手从左侧翼装甲弹药架抽出下一发全长 920 mm 的 88×571mmR PzGr. 39 定装炮弹，抬升对齐炮膛中轴并双手发力向前猛推 +124 cm，令药筒底缘稳稳撞入抽壳钩卡位。',
  },
  {
    id: 'tiger_phase_7_wedge_snap_lock',
    stepNum: '07',
    shortLabel: '炮闩弹闭锁膛待击',
    title: '阶段 7 · 闭闩蓄能簧释放推动水平楔块铿锵闭锁 · 恢复待击状态',
    range: [0.88, 1.0],
    description:
      '新弹底缘顶开抽壳钩锁舌的瞬间，压缩中的闭闩螺旋弹簧轰然释能，推动克虏伯水平楔式炮闩横滑归位将炮膛严密锁死，电击发回路重新接通，整车动力传动轴保持平稳运转随时迎接下一次齐射。',
  },
];

export function computeTiger1FiringKinematics(
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

  // Recoil envelope: smooth ramp 0->1 in [0.22, 0.40], return 1->0 in [0.42, 0.56]
  const recoilT = seg(f, 0.22, 0.4) - seg(f, 0.42, 0.56);

  // Semi-automatic horizontal sliding-wedge opening: opens in [0.44, 0.54], holds open for ejection & reload, snaps shut in [0.88, 0.96]
  const wedgeOpenT = seg(f, 0.44, 0.54) - seg(f, 0.88, 0.96);

  switch (partId) {
    case 'tiger_main_gun': {
      dx = -TIGER_RECOIL_STROKE * recoilT;
      break;
    }

    case 'tiger_breech_block': {
      // Recoils -29 cm with the barrel in Phase 3, then slides open laterally |dz| = 16.0 cm (>= 14 cm) in Phase 4-6!
      dx = -TIGER_RECOIL_STROKE * recoilT;
      dz = TIGER_BREECH_WEDGE_DZ * wedgeOpenT;
      break;
    }

    case 'tiger_recoil_springs': {
      // Twin heavy X-axis helical recuperator coils (local X in [-34, +34], rear anchor -34):
      // Compresses cleanly with -29 cm gun recoil -> scaleX in [0.5735, 1.0000] (delta = 0.4265)
      const pinAnchorX = -34.0;
      scaleX = 1.0 - (TIGER_RECOIL_STROKE / 68.0) * recoilT;
      dx = pinAnchorX * (1.0 - scaleX);
      break;
    }

    case 'tiger_breech_spring': {
      // Heavy X-axis semi-auto breech closing spring (local X in [-18, +18], rear anchor -18):
      // Compresses as horizontal wedge slides open & snaps back on closure -> scaleX in [0.6400, 1.0000]
      const pinAnchorX = -18.0;
      scaleX = 1.0 - 0.36 * wedgeOpenT;
      dx = pinAnchorX * (1.0 - scaleX);
      break;
    }

    case 'tiger_ready_round': {
      // Assembled rest at [-64, +72, -62]; chamber center at [+60, +102, 0] -> total delta [+124, +30, +62]
      // Phase 6a [0.64, 0.72]: loader lifts & swings 88mm PzGr. 39 round into rear-of-breech bore alignment
      // Phase 6b [0.72, 0.86]: loader rams round straight forward into Krupp breech (dx = +124.0 cm >= +115 cm!)
      // Phase 7  [0.86, 1.00]: stays cleanly chambered inside closed breech (endpointJump === 0!)
      const liftU = seg(f, 0.64, 0.72);
      const ramU = seg(f, 0.72, 0.86);
      dx = 16.0 * liftU + 108.0 * ramU;
      dy = 30.0 * liftU;
      dz = 62.0 * liftU;
      rz = 0.08 * Math.sin(liftU * Math.PI);
      break;
    }

    case 'tiger_driveshaft': {
      // Smooth continuous rotation of central floor propeller shaft (rx = 2*pi*f)
      rx = TWO_PI * f;
      break;
    }

    default:
      break;
  }

  const snap0 = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  return {
    pos: [snap0(dx), snap0(dy), snap0(dz)],
    rot: [snap0(rx), ry, snap0(rz)],
    scaleX: Math.abs(scaleX - 1) < 1e-9 ? 1 : scaleX,
  };
}

/**
 * 88×571mmR PzGr. 39 APCBC (773 m/s, 320 MPa) Krupp KwK 36 L/56 Ballistics Choreography:
 *  - Chamber: `[+60.0, +102.0, 0.0]` -> Muzzle Brake Exit: `[+529.0, +102.0, 0.0]`
 *  - Ignition & bore acceleration: `f in [0.11, 0.23]`, muzzle blast flash `f in [0.22, 0.34]`
 *  - Spent 571mm brass casing ejects rearward out of open Krupp horizontal wedge into `tiger_shell_guard`
 *    basket (`spentCaseVisible = true` during `f in [0.50, 0.76]`, `false` at `f = 0.995..1.0`)
 */
export function computeTiger1BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);

  // 1. 88mm PzGr. 39 APCBC Projectile along bore axis (Y = +102, Z = 0)
  const bulletVisible = f >= 0.08 && f < 0.36;
  let bulletX = TIGER_CHAMBER_X;
  let streakLength = 0;

  if (f >= 0.11 && f < 0.23) {
    const u = Math.pow(linearSeg(f, 0.11, 0.23), 1.38);
    bulletX = TIGER_CHAMBER_X + (TIGER_MUZZLE_X - TIGER_CHAMBER_X) * u;
    streakLength = 24.0 * u;
  } else if (f >= 0.23 && f < 0.36) {
    const u = linearSeg(f, 0.23, 0.36);
    bulletX = TIGER_MUZZLE_X + 340.0 * u;
    streakLength = 54.0 * (1.0 - u * 0.45);
  }

  // 2. Spent 88x571mmR Brass Casing ejecting rearward into tubular shell guard catcher basket
  const spentCaseVisible = f >= 0.5 && f < 0.76;
  let caseX = TIGER_CHAMBER_X;
  let caseY = TIGER_BORE_Y;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.5 && f < 0.76) {
    const u = linearSeg(f, 0.5, 0.76);
    // Extracts aft from breech X=+60 into basket X=+6, dropping down Y=+102 -> +64
    caseX = TIGER_CHAMBER_X - 54.0 * Math.min(1, u * 1.25);
    caseY = TIGER_BORE_Y - 12.0 * u - 32.0 * u * u;
    caseZ = 4.0 * u;
    caseRX = u * 1.4;
    caseRY = u * 0.8;
    caseRZ = -0.65 * Math.sin(u * Math.PI * 0.8);
    if (f > 0.66) {
      spentCaseOpacity = 1.0 - linearSeg(f, 0.66, 0.76);
    }
  }

  // 3. Chamber Ignition Flash & Massive Twin-Baffle 88mm Muzzle Brake Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.08 && f <= 0.19) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.08, 0.19) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.22 && f <= 0.34) {
    const u = linearSeg(f, 0.22, 0.34);
    muzzlePlumeScale = 0.85 + 2.45 * Math.pow(u, 0.48);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.92;
  }

  // 4. Next Live Round & Reserve Round tracking smoothly into chamber (zero endpoint jump!)
  const liftU = seg(f, 0.64, 0.72);
  const ramU = seg(f, 0.72, 0.86);
  const nextX = -64.0 + 16.0 * liftU + 108.0 * ramU;
  const nextY = 72.0 + 30.0 * liftU;
  const nextZ = -62.0 + 62.0 * liftU;
  const nextRZ = 0.08 * Math.sin(liftU * Math.PI);

  const resShift = seg(f, 0.66, 0.86);
  const resX = -42.0 + (-64.0 - -42.0) * resShift;
  const resY = 28.0 + (72.0 - 28.0) * resShift;
  const resZ = -114.0 + (-62.0 - -114.0) * resShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, TIGER_BORE_Y, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity: 0,
    gasPortPos: [TIGER_CHAMBER_X, TIGER_BORE_Y, 0],
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

const TIGER1_HULL_ZIMMERIT_PBR: PbrBindingSpec = {
  albedoFile: 'tiger1_v3_hull_zimmerit_albedo.webp',
  normalFile: 'tiger1_v3_hull_zimmerit_normal.webp',
  roughnessFile: 'tiger1_v3_hull_zimmerit_roughness.webp',
  normalScale: 0.9,
};

const TIGER1_TURRET_88MM_PBR: PbrBindingSpec = {
  albedoFile: 'tiger1_v3_turret_88mm_albedo.webp',
  normalFile: 'tiger1_v3_turret_88mm_normal.webp',
  roughnessFile: 'tiger1_v3_turret_88mm_roughness.webp',
  normalScale: 0.88,
};

const TIGER1_DRIVETRAIN_INT_PBR: PbrBindingSpec = {
  albedoFile: 'tiger1_v3_drivetrain_int_albedo.webp',
  normalFile: 'tiger1_v3_drivetrain_int_normal.webp',
  roughnessFile: 'tiger1_v3_drivetrain_int_roughness.webp',
  normalScale: 0.86,
};

export const TIGER1_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  // Suite 1: tiger1_v3_hull_zimmerit (8 solid parts)
  tiger_hull_box: TIGER1_HULL_ZIMMERIT_PBR,
  tiger_side_fenders: TIGER1_HULL_ZIMMERIT_PBR,
  tiger_interleaved_wheels: TIGER1_HULL_ZIMMERIT_PBR,
  tiger_tracks_left: TIGER1_HULL_ZIMMERIT_PBR,
  tiger_tracks_right: TIGER1_HULL_ZIMMERIT_PBR,
  tiger_engine_deck: TIGER1_HULL_ZIMMERIT_PBR,
  tiger_torsion_bars: TIGER1_HULL_ZIMMERIT_PBR,
  tiger_turret_ring: TIGER1_HULL_ZIMMERIT_PBR,

  // Suite 2: tiger1_v3_turret_88mm (8 solid parts)
  tiger_turret_shell: TIGER1_TURRET_88MM_PBR,
  tiger_cupola_hatches: TIGER1_TURRET_88MM_PBR,
  tiger_gun_mantlet: TIGER1_TURRET_88MM_PBR,
  tiger_main_gun: TIGER1_TURRET_88MM_PBR,
  tiger_recoil_cradle: TIGER1_TURRET_88MM_PBR,
  tiger_breech_block: TIGER1_TURRET_88MM_PBR,
  tiger_shell_guard: TIGER1_TURRET_88MM_PBR,
  tiger_optics_tzf9b: TIGER1_TURRET_88MM_PBR,

  // Suite 3: tiger1_v3_drivetrain_int (8 solid parts)
  tiger_maybach_v12: TIGER1_DRIVETRAIN_INT_PBR,
  tiger_transmission: TIGER1_DRIVETRAIN_INT_PBR,
  tiger_driveshaft: TIGER1_DRIVETRAIN_INT_PBR,
  tiger_turret_basket: TIGER1_DRIVETRAIN_INT_PBR,
  tiger_ammo_racks: TIGER1_DRIVETRAIN_INT_PBR,
  tiger_ready_round: TIGER1_DRIVETRAIN_INT_PBR,
  tiger_fuel_tanks: TIGER1_DRIVETRAIN_INT_PBR,
  tiger_crew_stations: TIGER1_DRIVETRAIN_INT_PBR,
};

export const TIGER1_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'tiger1_v3_hull_zimmerit',
    weapon: TIGER1_ID,
    titleCn:
      '虎式 131 暗黄迷彩车体、防磁水泥浮雕、铁十字徽标、交错负重轮与 725mm 履带贴图组',
    partTag: 'H-01..08 HULL, ZIMMERIT, SCHACHTELLAUFWERK & 725MM TRACKS',
    resolution: '2048 × 2048 px',
    summary:
      '由 Blender 5.2 Cycles GPU 烘焙的虎式 131 车体与行走机构 2K 5 通道 Packed ORM 贴图组：精细再现 1943 年暗黄（Dunkelgelb RAL 7028）底漆与橄榄绿/红棕伏击条纹、横向梳纹防磁水泥（Zimmerit）切线法线凹凸、车体双侧白边黑心国防军直臂铁十字（Balkenkreuz）、内壁象牙白（Elfenbein）反光漆、高温锈蚀铸铁双排气管、挂胶交错负重轮橡胶轮缘隔离区以及 725 mm 宽履带金属磨亮抓地齿。',
    highlights: [
      '1943 暗黄 RAL 7028 迷彩 + 横向梳纹 Zimmerit 防磁水泥法线浮雕 + 燕尾焊缝',
      '车体双侧高清无镜像白边国防军 Balkenkreuz 铁十字徽标与象牙白内舱',
      '三排交错负重轮挂胶轮缘、高温锈橙铸铁排气管与 725mm 锰钢履带分层隔离',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'tiger1_v3_hull_zimmerit_albedo.webp',
        note: 'sRGB · 暗黄迷彩与铁十字 / 象牙白内舱 / 锈橙排气管 / 挂胶轮与锰钢履带',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'tiger1_v3_hull_zimmerit_normal.webp',
        note: 'Linear · 横向防磁水泥梳纹 + 燕尾装甲焊缝 + 铸造轧钢微纹 + 履带抓地齿',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'tiger1_v3_hull_zimmerit_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:磨亮齿圈(0.24)-暗黄漆(0.62)-橡胶轮(0.76) / B:金属度',
      },
    ],
  },
  {
    id: 'tiger1_v3_turret_88mm',
    weapon: TIGER1_ID,
    titleCn:
      '马蹄形「131」编号炮塔、88mm KwK 36 炮管制退器、克虏伯炮闩与 TZF 9b 光学贴图组',
    partTag: 'H-09..10 / G-01..05 / FC-01 / FC-03 TURRET #131, 88MM & OPTICS',
    resolution: '2048 × 2048 px',
    summary:
      '聚焦虎式 131 马蹄形炮塔与 88mm KwK 36 L/56 主炮系统的 2K 5 通道 Packed ORM 贴图组：在马蹄形炮塔左右 Hero UV 平面呈现高辨识度白边黑色鲍文顿馆藏战术编号「131」与防磁水泥纹理、88mm 双室锥形炮口制退器膛口积碳与热回火色带、克虏伯整铣水平楔式炮闩与镀铬液压复进筒、条状黄铜弹壳篮，以及实行 >=55 px 严格 UV 防火墙隔离的 TZF 9b 蓝宝石青色光学镀膜镜片。',
    highlights: [
      '马蹄形炮塔双侧无畸变白边黑色鲍文顿「131」战术编号与象牙白内壁',
      '88mm KwK 36 L/56 锥形双室炮口制退器热氧化与积碳渐变 + 镀铬液压复进筒',
      'TZF 9b 徕兹双目瞄准镜蓝宝石青色多层镀膜物镜（>=55 px 零色渗防火墙）',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'tiger1_v3_turret_88mm_albedo.webp',
        note: 'sRGB · 炮塔「131」编号 / 88mm 积碳制退器 / 精铣炮闩 / 蓝宝石 TZF 9b 镜片',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'tiger1_v3_turret_88mm_normal.webp',
        note: 'Linear · 炮塔防磁水泥纹 + 120mm 铸造炮盾砂纹 + 炮闩车铣刀痕 + 指挥塔焊缝',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'tiger1_v3_turret_88mm_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:蓝宝石镜(0.08)-镀铬复进筒(0.18)-积碳(0.84) / B:金属度',
      },
    ],
  },
  {
    id: 'tiger1_v3_drivetrain_int',
    weapon: TIGER1_ID,
    titleCn:
      '迈巴赫 HL230 V12 发动机、Olvar 8 速变速箱与 88×571mmR PzGr. 39 实弹贴图组',
    partTag: 'FC-04..07 / H-11..12 / M-01..02 MAYBACH V12, OLVAR & 88MM AMMO',
    resolution: '2048 × 2048 px',
    summary:
      '为虎式 131 纵剖内脏奇观量身打造的 2K 5 通道 Packed ORM 贴图组：精细刻画 23.1 升迈巴赫 HL230 P45 V12 铸铁灰缸体、迈巴赫原厂金属铭牌、4 具拉丝铝 Solex 化油器、灼热橙棕铸铁排气歧管与铝制侧翼散热器芯、前置 Olvar 8 速预选变速箱与中央传动轴，并对侧翼 18 发及待发 88×571mmR PzGr. 39 炮弹实施黄铜药筒 / 紫铜导转带 / 哑黑穿甲被帽弹头三重严格 UV 隔离。',
    highlights: [
      '迈巴赫 HL230 P45 V12 铸铁缸体、原厂铭牌、橙棕排气歧管与铝散热器芯',
      '88×571mmR PzGr. 39 闪耀黄铜药筒、紫铜导转带与哑黑穿甲弹头三重 UV 防火墙',
      '前置 Olvar 8 速变速箱、象牙白防滑炮塔吊篮地板与复古牛皮乘员座椅质感',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'tiger1_v3_drivetrain_int_albedo.webp',
        note: 'sRGB · 迈巴赫 V12 铸铁与橙棕歧管 / 88mm 黄铜弹与黑弹头 / 红丹油箱与牛皮席',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'tiger1_v3_drivetrain_int_normal.webp',
        note: 'Linear · V12 缸盖加强筋 + 散热器密集百叶 + 吊篮菱形防滑纹 + 齿轮箱铸砂纹',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'tiger1_v3_drivetrain_int_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:88mm黄铜(0.18)-铝散热器(0.26)-牛皮(0.62) / B:金属度',
      },
    ],
  },
];

export const TIGER1_PLUGIN: WeaponRuntimePlugin = {
  id: TIGER1_ID,
  partGroups: TIGER1_PART_GROUPS,
  timelinePresets: TIGER1_TIMELINE_PRESETS,
  parts: TIGER1_PARTS,
  firingPhases: TIGER1_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(TIGER1_FIRING_PHASES, f),
  computeFiringKinematics: computeTiger1FiringKinematics,
  computeBallisticsState: computeTiger1BallisticsState,
  pbrBindings: TIGER1_PBR_BINDINGS,
  pbrSuites: TIGER1_PBR_SUITES,
};
