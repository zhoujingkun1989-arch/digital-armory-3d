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
  ZTZ99A_BORE_Y,
  ZTZ99A_BREECH_DROP,
  ZTZ99A_CAROUSEL_STATIONS,
  ZTZ99A_HOIST_LIFT,
  ZTZ99A_MUZZLE_X,
  ZTZ99A_POS,
  ZTZ99A_RAMMER_STROKE,
  ZTZ99A_RECOIL_STROKE,
} from './meshes/ztz99aGeometries';

export const ZTZ99A_ID: WeaponId = 'ztz99a';
export const ZTZ99A_CALIBER: CaliberProfile = '125mm_apfsds';

export const ZTZ99A_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '125mm ZPT-98滑膛炮、防盾炮架、制退复进器与抛壳底机',
    nameEn: '125mm ZPT-98 Smoothbore Gun, Cradle, Recoil System & Stub Ejector',
    badgeColor: '#0ea5e9',
  },
  {
    key: 'frame',
    nameZh: '空心复合装甲车体、楔形FY-4爆反炮塔、履带行走与扭杆组',
    nameEn: 'Hollow Composite Hull, Arrowhead FY-4 ERA Turret, Tracks & Torsion Bars',
    badgeColor: '#65a30d',
  },
  {
    key: 'fire_control',
    nameZh: '立楔炮闩、车长周视/JD-3激光压制、150HB V12与CH-1000动力组',
    nameEn: 'Sliding-Wedge Breech, CITV/JD-3 Laser, 150HB V12 Diesel & CH-1000 Pack',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '22发底置转盘自动装弹机、举升托架与链式推弹机组',
    nameEn: '22-Rd Floor Carousel Autoloader, Hoist Arm & Electro-Mechanical Rammer',
    badgeColor: '#e11d48',
  },
];

export const ZTZ99A_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整战备合拢态',
    subLabel: '0% Combat Ready',
    t: 0,
    desc: '中国 ZTZ-99A 主战坦克 1:1 真实尺度战备合拢态（车长 7.60 m、含炮全长 10.90 m、宽 3.50 m、高 2.37 m）：标志性箭头楔形 FY-4 双防爆炸反应装甲、6.25 米 125mm ZPT-98 L/50 滑膛主炮、车顶 JD-3 激光主动压制系统与现代化三色数码迷彩蓄势待发。',
  },
  {
    id: 'field_strip',
    label: '外挂爆反与动力甲板快拆',
    subLabel: '30% Armor & Deck Strip',
    t: 0.3,
    desc: '按重装甲旅基地野战勤务规范展开：向前卸除首上 FY-4 爆反模块与炮塔箭头楔形装甲，向两侧水平拉出双侧挂胶履带，向上掀开后置 150HB 动力百叶甲板与双副油箱，并吊离车顶 QJC-88 高射机枪与光电瞄具。',
  },
  {
    id: 'powerpack_autoloader',
    label: '吊离炮塔、转盘装弹与V12动力包',
    subLabel: '65% Turret, Autoloader & V12',
    t: 0.65,
    desc: '整体垂直吊起低矮焊接复合装甲炮塔、抽离 6.25 米 125mm 滑膛主炮与双铬液压反后坐筒，完整揭示车体战斗室底部的 22 发分装式转盘自动装弹机、举升提弹臂，以及后置 1,500 马力 150HB V12 双涡轮增压柴油机与 CH-1000 液力综合传动。',
  },
  {
    id: 'full_exploded',
    label: '全车 26 节点 1:1 爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 26 个 1:1 真实重装甲工程构件零干涉立体展开：涵盖空心复合车体与 12 根横置扭杆悬挂、六对双轮缘负重轮、22 发 125mm 穿甲弹转盘、链式推弹机、立楔炮闩、双复进簧、JD-3 激光压制转塔与 1,500 马力 150HB V12 动力包。',
  },
];

export const ZTZ99A_PARTS: WeaponPartSpec[] = [
  // ==================== SUITE 1: HULL ARMOR, FY-4 ERA, RUNNING GEAR, DECK & RING (8 solid GLB) ====================
  {
    id: 'ztz99a_hull_armor',
    bomCode: 'H-01',
    nameZh: '空心焊接复合装甲车体（数码迷彩 · 99A-108）',
    calloutLabel: '空心复合装甲车体',
    nameEn: 'Hollow Welded Composite Armored Hull Tub (Digital Camo)',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [...ZTZ99A_POS.ztz99a_hull_armor],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [180, -30, 112],
    labelAppearAt: 0.0,
    roleTag: '68°大倾角首上复合装甲 · 14–16 cm 真实空心壁厚纵剖通透',
    description:
      'ZTZ-99A 全焊接高强度轧制均质钢与多层非金属陶瓷复合装甲车体（长 7.60 m，宽 3.50 m），采用大倾角 68° 楔形首上装甲与防弹液密底甲板；前居中设驾驶员装甲舱盖与三具潜望镜，侧面喷涂现代解放军三色数码迷彩、八一红星战术徽标与车体编号「99A-108」。开启 CT 纵剖面（[C]）时沿中轴切开右侧 14–16 cm 真实空心装甲壁，完整敞开内部战斗室转盘与后置 V12 动力舱。',
  },
  {
    id: 'ztz99a_glacis_era',
    bomCode: 'H-02',
    nameZh: '车体首上 FY-4 双防爆炸反应装甲阵列',
    calloutLabel: '首上FY-4爆反装甲',
    nameEn: 'Upper Glacis FY-4 Dual-Purpose ERA Brick Array',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [...ZTZ99A_POS.ztz99a_glacis_era],
    explodeSteps: [
      { range: [0.06, 0.34], offset: [150, 14, 0] },
      { range: [0.64, 0.98], offset: [70, 6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [10, 16, 0],
    labelAppearAt: 0.06,
    roleTag: '第三代重型双防爆反 · 兼防尾翼稳定脱壳穿甲弹与聚能破甲弹',
    description:
      '螺栓矩阵锚固于首上 68° 倾斜复合主装甲表面的中国第三代 FY-4 双防爆炸反应装甲（ERA）模块阵列及 V 形防浪板：采用双层飞板夹装钝感高能炸药结构，在迎击 120mm 贫铀/钨合金尾翼稳定脱壳穿甲弹（APFSDS）或串联聚能破甲弹（HEAT）时，高速双向飞板可精准剪断长杆穿甲弹芯并大幅削减射流侵彻深度。',
  },
  {
    id: 'ztz99a_side_skirts',
    bomCode: 'H-03',
    nameZh: '重型复合与挂胶钢丝分段式侧裙板',
    calloutLabel: '复合分段式侧裙板',
    nameEn: 'Segmented Ballistic Rubber-Steel & Composite Side Skirts',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [...ZTZ99A_POS.ztz99a_side_skirts],
    explodeSteps: [
      { range: [0.1, 0.38], offset: [0, 0, 235] },
      { range: [0.66, 0.98], offset: [0, 0, 140] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [60, -10, 173],
    labelAppearAt: 0.1,
    roleTag: '前段加厚复合装甲裙板 · 提前引爆反坦克火箭弹并抑制扬尘',
    description:
      '沿车体双侧翼子板外缘铰接悬挂的 6 节分段式装甲侧裙板：前两节对应驾驶室与战斗室前部采用加厚特种钢-复合夹层装甲块，后四节采用高韧性钢丝帘线硫化橡胶板，既可在 30° 侧向射界提前引爆 RPG 等聚能破甲弹保护翼下车体，又在高速越野时抑制履带卷尘保护红外瞄具。',
  },
  {
    id: 'ztz99a_road_wheels',
    bomCode: 'H-04',
    nameZh: '六对 670mm 双轮缘负重轮、诱导轮与后置主动轮',
    calloutLabel: '六对双轮缘负重轮组',
    nameEn: '6 Pairs of Twin-Rim 670mm Road Wheels, Idlers & Drive Sprockets',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [...ZTZ99A_POS.ztz99a_road_wheels],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [0, 0, -230] },
      { range: [0.68, 0.98], offset: [0, 0, -130] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [62, -26, 148],
    labelAppearAt: 0.34,
    roleTag: '55 吨级高速越野底盘支撑 · 挂胶冲压钢轮与 14 齿双主动轮',
    description:
      '承载 55 吨全战斗重量的经典 6 对 670 mm 直径冲压钢制双轮缘挂胶负重轮、前部张紧诱导轮、每侧 3 枚托带轮以及尾置 14 齿高强合金钢双环驱动主动轮：前二后一不等距轮轴排布优化重心与俯仰稳定性，配合高性能扭杆悬挂令 99A 拥有高达 76 km/h 的公路极速与强悍跨壕越障能力。',
  },
  {
    id: 'ztz99a_tracks_left',
    bomCode: 'H-05',
    nameZh: '左侧双销挂胶金属履带总成',
    calloutLabel: '左侧双销挂胶履带',
    nameEn: 'Left-Side Articulated Double-Pin Rubber-Padded Track Belt',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [...ZTZ99A_POS.ztz99a_tracks_left],
    explodeSteps: [
      { range: [0.14, 0.42], offset: [0, 0, -280] },
      { range: [0.66, 0.98], offset: [0, 0, -160] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -45, -18],
    labelAppearAt: 0.14,
    roleTag: '580 mm 宽双销挂胶履带 · 底部精准接地 Y = -120 cm',
    description:
      '宽 580 mm 的左侧双销端部联接器挂胶履带总成：高锰合金钢履带板内侧铸有中心诱导齿以防高速转向脱带，外侧装配可快速拆换的耐磨橡胶接地垫块，显著降低公路行驶振动噪音并保护沥青路面，同时提供澎湃越野牵引抓地力。',
  },
  {
    id: 'ztz99a_tracks_right',
    bomCode: 'H-06',
    nameZh: '右侧双销挂胶金属履带总成',
    calloutLabel: '右侧双销挂胶履带',
    nameEn: 'Right-Side Articulated Double-Pin Rubber-Padded Track Belt',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [...ZTZ99A_POS.ztz99a_tracks_right],
    explodeSteps: [
      { range: [0.14, 0.42], offset: [0, 0, 295] },
      { range: [0.66, 0.98], offset: [0, 0, 170] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -45, 18],
    labelAppearAt: 0.14,
    roleTag: '剖视自动隐切展开车底扭杆与战斗室 · 同步承接 CH-1000 扭矩',
    description:
      '与左侧对称的右侧 580 mm 宽双销挂胶金属履带：通过后部 CH-1000 双流液力综合传动实现无级半径转向乃至原地中心零半径高速旋转。在 CT 纵剖面模式下自动随右半壳体隐切，为观赏横置扭杆悬挂与底置转盘自动装弹机彻底让出视野。',
  },
  {
    id: 'ztz99a_rear_deck',
    bomCode: 'H-07',
    nameZh: '抬高式后置动力百叶散热甲板与双圆柱外挂油桶',
    calloutLabel: '后置百叶甲板与副油箱',
    nameEn: 'Raised Louvered Rear Engine Deck & Twin 200L External Fuel Drums',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [...ZTZ99A_POS.ztz99a_rear_deck],
    explodeSteps: [
      { range: [0.08, 0.36], offset: [-100, 90, 0] },
      { range: [0.64, 0.98], offset: [-60, 50, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 14, 0],
    labelAppearAt: 0.08,
    roleTag: '99A 标志性抬高动力舱盖 · 8 组装甲进气百叶窗与双 200L 副油箱',
    description:
      'ZTZ-99A 最具辨识度的车体尾段特征——为完整容纳横置一体化 1,500 马力 150HB V12 与 CH-1000 综合传动动力包而显著抬高的水平后甲板：顶部布置大面积防弹百叶散热进气格栅，左侧设高温排气隔热罩，车尾托架挂载两具 200 升外挂圆柱柴油副油箱及经典越野自救原木，将公路最大行程拓展至 600 公里。',
  },
  {
    id: 'ztz99a_turret_ring',
    bomCode: 'H-08',
    nameZh: '精铣内齿炮塔回转座圈与滚珠轴承导轨',
    calloutLabel: '精密内齿炮塔座圈',
    nameEn: 'Precision-Toothed Steel Turret Traverse Race Ring & Bearing',
    group: 'frame',
    material: 'stainless',
    assembledPos: [...ZTZ99A_POS.ztz99a_turret_ring],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [0, 82, 0] },
      { range: [0.66, 0.98], offset: [0, 46, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [104, 5, 0],
    labelAppearAt: 0.34,
    roleTag: '外径 2.16 m 高精度硬化钢滚道 · 支撑全电炮塔高速双向稳定',
    description:
      '坐落于空心复合装甲车体顶部圆孔的 2.16 米外径淬火合金钢大直径炮塔座圈：内圆周精密铣削全圈高模数渐开线内齿，配合双列硬化钢滚珠滚道承托超过 18 吨的焊接重甲炮塔，使全电驱动的 99A 炮塔具备极高方向跟踪角速度与行进间高精度双稳射击能力。',
  },

  // ==================== SUITE 2: TURRET SHELL, ARROWHEAD FY-4 ERA, 125MM GUN, RECOIL, BREECH & OPTICS (8 solid GLB) ====================
  {
    id: 'ztz99a_turret_shell',
    bomCode: 'T-01',
    nameZh: '空心低矮焊接复合炮塔壳体与尾舱栅栏（ZTZ-99A / 108）',
    calloutLabel: '空心焊接炮塔与尾篮',
    nameEn: 'Hollow Welded Low-Profile Turret Housing & Bustle Rack (108)',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [...ZTZ99A_POS.ztz99a_turret_shell],
    explodeSteps: [
      { range: [0.32, 0.66], offset: [0, 175, 0] },
      { range: [0.66, 0.98], offset: [0, 80, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-40, 26, 120],
    labelAppearAt: 0.04,
    roleTag: '低矮紧凑轮廓减小中弹面积 · 真实空心腔室剖视直击炮尾与推弹机',
    description:
      '告别苏式传统圆铸炮塔、全自主研发的 ZTZ-99A 棱角分明焊接复合装甲炮塔：正面呈大角度五边形斜面布局并整合后置尾舱电台储物栅栏，全车高度压低至仅 2.37 米；炮塔双侧装甲面喷涂清晰白字编号「ZTZ-99A / 108」与红边八一五角星。纵剖模式沿 Z=0 切开右侧 15 cm 装甲壁，零遮挡展现内部炮尾、复进筒、链式推弹机与车长/炮长显控台。',
  },
  {
    id: 'ztz99a_era_wedges',
    bomCode: 'T-02',
    nameZh: '炮塔正面标志性箭头楔形 FY-4 爆反与侧颊装甲块',
    calloutLabel: '箭头楔形FY-4爆反模块',
    nameEn: 'Iconic Arrowhead FY-4 ERA Turret Cheek Wedge Modules',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [...ZTZ99A_POS.ztz99a_era_wedges],
    explodeSteps: [
      { range: [0.06, 0.34], offset: [60, 120, 0] },
      { range: [0.34, 0.66], offset: [30, 145, 0] },
      { range: [0.66, 0.98], offset: [20, 77, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [55, 22, 72],
    labelAppearAt: 0.04,
    roleTag: '99A 标志性箭镞前脸 · 楔形中空复合夹层叠加 FY-4 双防爆反',
    description:
      '全球装甲界一眼即可认出的 ZTZ-99A 视觉图腾——沿炮塔正左右双颊以约 40° 锐角前掠排列的箭镞楔形（Arrowhead）附加装甲阵列与两侧 FY-4 爆反砖块：上下双斜面构成的锐利楔形腔体不仅能诱导高速来袭穿甲弹偏转折断，内嵌的 FY-4 重型双防反应模块更将炮塔正面综合抗穿甲等效匀质钢厚度推升至世界顶尖的 1,000 mm 以上！',
  },
  {
    id: 'ztz99a_main_gun',
    bomCode: 'G-01',
    nameZh: '125mm ZPT-98 L/50 滑膛主炮（含热护套、抽烟装置与校炮镜）',
    calloutLabel: '125mm ZPT-98滑膛主炮',
    nameEn: '125mm ZPT-98 L/50 Smoothbore Main Gun w/ Thermal Shroud & MRS',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [...ZTZ99A_POS.ztz99a_main_gun],
    explodeSteps: [
      { range: [0.32, 0.66], offset: [220, 165, 0] },
      { range: [0.66, 0.98], offset: [120, 80, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [310, 18, 0],
    labelAppearAt: 0.02,
    roleTag: '6.25 米电渣重熔自紧镀铬身管 · 发射 DTC10-125 初速 1,780 m/s',
    description:
      '全长 6,250 mm（50 倍径）的中国 ZPT-98 高膛压 125mm 滑膛坦克炮：采用高纯电渣重熔炮钢经液压自紧强化与全膛硬镀铬工艺制成，外部严密包覆多节隔热轻合金热护套以消除日照风雨温差弯曲，中段配圆柱形高压抽烟装置防止发射药毒气倒灌战斗室，炮口顶部集成动态炮口基准传感器（MRS）。发射 DTC10-125 钨合金尾翼稳定脱壳穿甲弹时膛压高达 650 MPa、初速 1,780 m/s，全管连同炮尾平滑后坐 320 mm！',
  },
  {
    id: 'ztz99a_gun_cradle',
    bomCode: 'G-02',
    nameZh: '重型装甲炮盾与高强度铸钢耳轴摇架',
    calloutLabel: '装甲炮盾与耳轴摇架',
    nameEn: 'Heavy Armored Gun Mantlet & Cast-Steel Trunnion Cradle',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [...ZTZ99A_POS.ztz99a_gun_cradle],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [125, 165, 0] },
      { range: [0.66, 0.98], offset: [65, 80, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [24, 18, 0],
    labelAppearAt: 0.34,
    roleTag: '承接 125mm 火炮 320 mm 直线后坐导轨 · 集成并列机枪射孔',
    description:
      '横亘于炮塔正面狭长开槽内的厚重铸钢外装甲炮盾与内嵌 U 形长导轨摇架总成：左右精密耳轴支承于炮塔前颊轴承座内实现 -5° 至 +14° 高低俯仰稳定；右盾整合 7.62mm 86 式并列机枪射孔，内部滑槽精确引导 125mm 主炮与炮尾在 650 MPa 巨力轰鸣下保持亚毫米级直线后坐复进。',
  },
  {
    id: 'ztz99a_recoil_cylinders',
    bomCode: 'G-03',
    nameZh: '双联镀铬液压驻退机与液气复进机筒',
    calloutLabel: '双联液压驻退复进筒',
    nameEn: 'Twin Chrome Hydraulic Recoil Brake & Hydro-Pneumatic Recuperators',
    group: 'slide',
    material: 'stainless',
    assembledPos: [...ZTZ99A_POS.ztz99a_recoil_cylinders],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [120, 185, 0] },
      { range: [0.66, 0.98], offset: [65, 95, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [10, 10, 15],
    labelAppearAt: 0.34,
    roleTag: '节流液压吸收数十吨后坐冲击 · 镜面镀铬活塞杆随炮往复',
    description:
      '对称并联安装于 125mm 炮尾上方摇架两侧的重型液压节流驻退筒与高压氮气-液压复进机：开火瞬间通过变截面节流杆在 320 mm 短行程内将高达数百吨的瞬时炮膛合力平滑泄放为车体可稳健承受的平稳推力，随后与下置双螺旋复进簧协同将沉重炮管平稳推送复位。',
  },
  {
    id: 'ztz99a_recoil_springs',
    bomCode: 'G-04',
    nameZh: '摇架下置双联重型锻钢螺旋复进缓冲簧',
    calloutLabel: '双联重型螺旋复进簧',
    nameEn: 'Twin Heavy Forged Helical Cannon Recuperator Springs',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [...ZTZ99A_POS.ztz99a_recoil_springs],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [135, 130, 0] },
      { range: [0.68, 0.98], offset: [70, 65, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [41, -7, 16.5],
    labelAppearAt: 0.36,
    roleTag: '1:1 真实 25 mm 粗锻钢螺旋压簧 · 随 320 mm 后坐实时压缩至 61%',
    description:
      '对称套设于摇架导杆下方的双联重型硅锰弹簧钢螺旋辅助复进缓冲簧（自由长 820 mm、钢丝直径 25 mm）：保留恒线径 GPU 实时压缩形变属性，在阶段 3 随 ZPT-98 主炮 -320 mm 剧烈后坐同步线性压缩至 61% 长度，于阶段 4 释放澎湃弹性势能辅助炮身平稳复进归位。',
  },
  {
    id: 'ztz99a_breech_block',
    bomCode: 'FC-01',
    nameZh: '重型锻钢炮尾环与半自动立楔式炮闩',
    calloutLabel: '锻钢炮尾与立楔炮闩',
    nameEn: 'Forged Steel Breech Ring & Vertical Sliding-Wedge Breechblock',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [...ZTZ99A_POS.ztz99a_breech_block],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [32, 105, 0] },
      { range: [0.68, 0.98], offset: [18, 53, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -18, 0],
    labelAppearAt: 0.36,
    roleTag: '承受 650 MPa 125mm 极高膛压 · 复进自动下垂 -160 mm 抽壳待装',
    description:
      '刚性旋接于 ZPT-98 滑膛炮身管尾端的整体锻造合金钢炮尾环与半自动垂直滑动楔式炮闩：内集成电击发底火撞针与双爪强力抽底钩。击发瞬间随炮管整体后坐 320 mm；在阶段 4 复进末段由开闩凸轮强制驱使楔形闩体垂直向下滑降 160 mm 彻底敞开炮膛，顺势抽出残余黄铜药筒底托，并在阶段 7 新弹推入到位瞬间自动向上弹锁闭膛！',
  },
  {
    id: 'ztz99a_optics_citv',
    bomCode: 'FC-02',
    nameZh: '车长周视热像仪（CITV）、炮长主瞄具与 JD-3 激光压制系统',
    calloutLabel: 'CITV热像与JD-3激光压制',
    nameEn: 'Commander Panoramic CITV, Gunner Thermal Sight & JD-3 Laser Dazzler',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [...ZTZ99A_POS.ztz99a_optics_citv],
    explodeSteps: [
      { range: [0.1, 0.38], offset: [-65, 165, 0] },
      { range: [0.38, 0.68], offset: [-25, 145, 0] },
      { range: [0.68, 0.98], offset: [-10, 65, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-66, 30, -56],
    labelAppearAt: 0.08,
    roleTag: '“猎-歼”双独立热像 + 全球独创 JD-3 主动激光致盲压制转塔',
    description:
      '傲视世界第三代改进型主战坦克的 ZTZ-99A 信息化光电中枢：包含炮长左前独立双稳凝视型热成像/激光测距主瞄准镜、车长右顶 360° 独立全周视热像仪（CITV，实现车长搜靶—一键超越移交炮长歼敌的“猎-歼”作战闭环），以及炮塔左后方全球独树一帜的 JD-3 激光告警接收穹顶与主动高能激光压制干扰发射转塔（翡翠蓝宝石镀膜光学窗口），一旦探测到敌方激光测距或反坦克导弹制导照射即自动转向发射强激光致盲敌光电头！',
  },
  {
    id: 'ztz99a_roof_armaments',
    bomCode: 'T-03',
    nameZh: '双侧六联 81mm 烟幕弹发射器、横风传感器与 QJC-88 12.7mm 机枪',
    calloutLabel: 'QJC-88重机枪与烟幕弹筒',
    nameEn: 'Twin 6-Barrel 81mm Smoke Launchers, Wind Sensor & QJC-88 12.7mm MG',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [...ZTZ99A_POS.ztz99a_roof_armaments],
    explodeSteps: [
      { range: [0.08, 0.36], offset: [60, 210, 0] },
      { range: [0.36, 0.68], offset: [35, 185, 0] },
      { range: [0.68, 0.98], offset: [15, 75, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [20, 22, 54],
    labelAppearAt: 0.06,
    roleTag: '12.7×108mm 防空自卫火力 + 多光谱红外烟幕瞬时遮蔽',
    description:
      '集成于炮塔顶部的多维自卫与弹道气象传感组件：车长右舱口旋转枪架配备 12.7×108mm QJC-88 车载高射机枪（用于打击武装直升机、无人机与轻装甲目标）；炮塔左右前侧对称安装双组 6 联装 81mm 多光谱防红外烟幕榴弹发射筒；尾部立杆搭载精密气象横风传感器，实时向火控计算机输送侧风、气压与气温修正值。',
  },

  // ==================== SUITE 3: AUTOLOADER CAROUSEL, HOIST, RAMMER, EJECTOR, V12, CH-1000, TORSION & CREW ====================
  {
    id: 'ztz99a_autoloader_carousel',
    bomCode: 'A-01',
    nameZh: '22 发底置分装式转盘自动装弹机（125mm 穿甲弹 + 药筒）',
    calloutLabel: '22发底置转盘自动装弹机',
    nameEn: '22-Cassette Floor Carousel Autoloader (125mm APFSDS + Charges)',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [...ZTZ99A_POS.ztz99a_autoloader_carousel],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [0, 72, 0] },
      { range: [0.68, 0.98], offset: [0, 32, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    calloutAnchor: [60, 14, 50],
    labelAppearAt: 0.02,
    roleTag: '纵剖绝对主角 · 直径 1.80 m 装甲转盘水平径向排布 22 套 125mm 分装弹',
    description:
      'ZTZ-99A 三人制紧凑车体与每分钟 8 发恒定高射速的机械心脏！直径 1.80 米的装甲钢环形转盘深嵌于车体战斗室最底部（紧贴扭杆底甲板，受重甲周密护卫），沿圆周均布 22 具上下双层钢制弹盒：下层水平放置 125mm DTC10-125 钨合金尾翼稳定脱壳穿甲弹弹丸，上层堆叠带黄铜底托的半可燃发射药筒。击发后由车底伺服电机驱动转盘迅速旋转选弹分度，将指定弹种精准送至后置举升提弹槽！',
  },
  {
    id: 'ztz99a_loading_tray',
    bomCode: 'A-02',
    nameZh: '双层弹盒垂直举升提弹臂与待发 125mm 分装弹',
    calloutLabel: '垂直举升提弹臂总成',
    nameEn: 'Articulated Vertical Cassette Elevator Hoist Arm & Staged 125mm Round',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [...ZTZ99A_POS.ztz99a_loading_tray],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-120, 96, 0] },
      { range: [0.68, 0.98], offset: [-55, 49, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 20, 0],
    labelAppearAt: 0.36,
    roleTag: '垂直大行程举升 +680 mm · 将车底弹盒精准托举对正 125mm 炮膛轴线',
    description:
      '位于转盘自动装弹机正后方、连接战斗室地板与炮尾轴线的双轨垂直举升提弹机构：当转盘将选定弹盒索引到位后，伺服卷扬臂即于阶段 6 将满载两段式 125mm 穿甲弹与可燃药筒的双层弹盒垂直高举整整 +680 mm，精准停驻于敞开的立楔炮闩正后方，等待尾舱链式推弹机分步一次推进上膛。',
  },
  {
    id: 'ztz99a_rammer_chain',
    bomCode: 'A-03',
    nameZh: '炮塔尾舱电动刚性链式推弹机总成',
    calloutLabel: '电动刚性链式推弹机',
    nameEn: 'Turret-Bustle Electro-Mechanical Rigid-Chain Rammer Assembly',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [...ZTZ99A_POS.ztz99a_rammer_chain],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-115, 165, 0] },
      { range: [0.68, 0.98], offset: [-60, 80, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [10, 12, 0],
    labelAppearAt: 0.36,
    roleTag: '单向刚性铰链伸缩推杆 · 前冲 +540 mm 高速送入穿甲弹与发射药筒',
    description:
      '藏身于炮塔后尾舱上部的精巧电动刚性链式推弹机：利用仅向单侧弯曲盘卷、伸直后即锁死为刚性压杆的特制高强合金链节，在极其紧凑的尾舱空间内实现高达 +540 mm 的超长直线推弹冲程，以稳定推力将 125mm 穿甲弹头与半可燃药筒顺畅顶入炮膛并卡紧底缘。',
  },
  {
    id: 'ztz99a_rammer_spring',
    bomCode: 'A-04',
    nameZh: '链式推弹机轴向回位缓冲螺旋簧',
    calloutLabel: '推弹机回位缓冲弹簧',
    nameEn: 'Chain-Rammer Axial Return & End-Stop Helical Buffer Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [...ZTZ99A_POS.ztz99a_rammer_spring],
    explodeSteps: [
      { range: [0.38, 0.68], offset: [-120, 190, 0] },
      { range: [0.68, 0.98], offset: [-60, 92, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [28, 6, 0],
    labelAppearAt: 0.38,
    roleTag: '实时 GPU 恒线径压缩形变 · 吸收推弹到位冲击并辅助高速复位',
    description:
      '并列内置于链式推弹机导轨顶部的重型硅锰弹簧钢螺旋缓冲回位簧（钢丝直径 19 mm，自由长 560 mm）：在阶段 6 推弹机前冲 +540 mm 将 125mm 炮弹推入药室的瞬间同步线性压缩至 58% 长度以平抑终端硬碰撞，并协助推弹链迅速回撤让出立楔炮闩闭锁空间。',
  },
  {
    id: 'ztz99a_stub_ejector',
    bomCode: 'G-05',
    nameZh: '药筒黄铜底托捕捉臂与炮塔顶部自动抛底窗',
    calloutLabel: '药筒底托抛壳窗机构',
    nameEn: 'Spent Brass Stub-Case Catcher & Turret-Roof Auto-Ejection Hatch',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [...ZTZ99A_POS.ztz99a_stub_ejector],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-155, 125, 0] },
      { range: [0.68, 0.98], offset: [-75, 60, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, 12, 0],
    labelAppearAt: 0.36,
    roleTag: '自动捕捉炽热黄铜底托 · 联动顶盖弹开向炮塔上方高抛排出车外',
    description:
      '125mm 半可燃药筒自动装弹机的灵魂排壳装置：击发后可燃药筒壁已全部燃尽，仅余一枚烫手的短柱形黄铜/钢制金属底托；当阶段 4 立楔炮闩下垂抽底瞬间，捕捉叉精准接住空底托并联动炮塔后顶装甲小舱盖弹起（-50°），将炽热金属底托干脆抛向车外高空，彻底杜绝炮塔内空弹壳堆积与烟气残留。',
  },
  {
    id: 'ztz99a_v12_engine',
    bomCode: 'P-01',
    nameZh: '150HB 型 1,500 马力 12 缸双涡轮增压液冷柴油机',
    calloutLabel: '150HB 1500马力V12柴油机',
    nameEn: '150HB 1,500-HP 12-Cylinder Twin-Turbo Liquid-Cooled Diesel Engine',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [...ZTZ99A_POS.ztz99a_v12_engine],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [-160, 26, 0] },
      { range: [0.68, 0.98], offset: [-80, 12, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 28, 0],
    labelAppearAt: 0.32,
    roleTag: '中国自主研制的陆战心脏 · 1,103 kW (1,500 HP) 双涡轮增压中冷 V12',
    description:
      '赋予 55 吨重甲 ZTZ-99A 逾 27 马力/吨惊人功重比的中国自主 150HB 系列 60° 夹角 V 型 12 缸高压共轨双涡轮增压中冷柴油机（输出功率 1,103 kW / 1,500 HP）：集成双对称银铝大流量涡轮增压器、顶置肋片中冷器、左右六缸独立摇臂室盖、青铜耐热铸铁排气歧管与醒目安全黄机油/冷却液加注口，支持 40 分钟战地野战整体吊换！',
  },
  {
    id: 'ztz99a_transmission',
    bomCode: 'P-02',
    nameZh: 'CH-1000 液力机械综合行星变速箱与双冷却散热器组',
    calloutLabel: 'CH-1000综合传动与散热器',
    nameEn: 'CH-1000 Hydro-Mechanical Planetary Transmission & Twin Radiators',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [...ZTZ99A_POS.ztz99a_transmission],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-205, -34, 0] },
      { range: [0.68, 0.98], offset: [-100, -16, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, -10, 0],
    labelAppearAt: 0.36,
    roleTag: '自动换挡 + 无级液压双流转向 · 支持 55 吨车体原地中心旋转',
    description:
      '横置串联于 150HB V12 柴油机后方的中国首代重型坦克 CH-1000 液力机械综合传动装置：整合液力变矩器、电控手自一体行星齿轮箱、双流静液压无级转向机构、大功率双联紫铜散热芯体与双轴流冷却风扇，彻底淘汰老式双操纵杆，让驾驶员以方向盘轻松实现自动换挡、高速精确弯道循迹及中心原地旋转。',
  },
  {
    id: 'ztz99a_torsion_bars',
    bomCode: 'H-09',
    nameZh: '12 根全宽横置高强合金钢扭杆弹簧与液压减振器阵列',
    calloutLabel: '12根横置扭杆悬挂阵列',
    nameEn: '12 Full-Width Transverse Steel Torsion Bars & Hydraulic Shock Absorbers',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [...ZTZ99A_POS.ztz99a_torsion_bars],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [0, -22, 0] },
      { range: [0.68, 0.98], offset: [0, -12, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [40, -6, 0],
    labelAppearAt: 0.36,
    roleTag: '全车宽错列扭转储能 · 赋予 55 吨主战坦克行进间平稳越野姿态',
    description:
      '贯穿整个车体底甲板上方的 12 根错列式高强度渗碳合金钢全宽横置扭杆弹簧（左右 6 对负重轮各独享整车宽有效扭转臂长），一端花键锚固于对侧车体底壁、另一端驱动平衡肘连接负重轮；第 1、2、6 负重轮站同步加装重型镀铬液压筒式减振器，在高速起伏越野时大幅衰减车体纵摇，为 125mm 主炮动对动射击创造稳固基座。',
  },
  {
    id: 'ztz99a_crew_stations',
    bomCode: 'FC-03',
    nameZh: '前居中驾驶席方向盘与炮塔车长/炮长数字化显控台',
    calloutLabel: '数字化驾驶与火控显控台',
    nameEn: 'Center Driver Yoke Station & Turret Digital Fire-Control Consoles',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [...ZTZ99A_POS.ztz99a_crew_stations],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [145, 76, 0] },
      { range: [0.68, 0.98], offset: [75, 36, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [100, -14, 0],
    labelAppearAt: 0.36,
    roleTag: '三人数字化网络战车 · 方向盘自动挡驾驶 + 战场态势综合显控屏',
    description:
      '代表中国陆军数字化信息作战巅峰的三人乘员人机工位：车体前正中为驾驶员半仰式减震座椅、类赛车蝶形方向盘与液晶仪表台；炮塔左侧为炮长稳像操控握把与弹道解算多功能显控屏（MFD），右侧为车长猎-歼综合指挥终端与陆军战术数据链态势屏，实现全车火控、观瞄、动力与旅团级战场态势一键互联。',
  },
];

// ============================================================================
// 7-PHASE 125MM ZPT-98 FIRING, RECOIL & 22-CASSETTE CAROUSEL AUTOLOADER CYCLE
// ============================================================================

export const ZTZ99A_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'ztz99a_phase_1_fcs_ignition',
    stepNum: '01',
    shortLabel: '火控解算电击发',
    title: '阶段 1 · 下反稳像数字化火控锁定与 125mm 电底火瞬时击发',
    range: [0.0, 0.12],
    description:
      '炮长通过热像仪激光测距并叠加车尾横风与药温数据，火控计算机瞬间解算提前量；扣动电发火开关，高压电流经立楔炮闩中心击针引燃 125mm 半可燃发射药筒底火。',
  },
  {
    id: 'ztz99a_phase_2_apfsds_accel',
    stepNum: '02',
    shortLabel: '650MPa穿甲弹加速',
    title: '阶段 2 · 650 MPa 峰压驱动 DTC10-125 钨芯穿甲弹以 1,780 m/s 出膛',
    range: [0.12, 0.22],
    description:
      '高能双基发射药瞬间爆燃产生 650 MPa 峰值膛压，推举 DTC10-125 尾翼稳定脱壳穿甲弹沿 6.25 米电渣重熔滑膛身管飙升至 1,780 m/s 穿甲极速，冲出炮口并经中段抽烟筒排净残烟。',
  },
  {
    id: 'ztz99a_phase_3_recoil_stroke',
    stepNum: '03',
    shortLabel: '320mm全管后坐',
    title: '阶段 3 · ZPT-98 主炮与炮尾后坐 -320 mm 压缩双联复进簧',
    range: [0.22, 0.36],
    description:
      '在巨大炮膛后坐推力作用下，125mm 主炮身管与重型锻钢炮尾沿铸钢摇架导轨向后平顺滑移整整 320 mm，双联镀铬液压驻退机精准节流泄能，下置双联螺旋复进簧线性压缩至 61% 长度。',
  },
  {
    id: 'ztz99a_phase_4_breech_stub_eject',
    stepNum: '04',
    shortLabel: '复进开闩抛底托',
    title: '阶段 4 · 复进归位、立楔炮闩下垂 -160 mm 与炮塔顶窗高抛铜底托',
    range: [0.36, 0.5],
    description:
      '液气复进机与螺旋簧推动主炮平滑前移复进归位；复进末段开闩凸轮驱使立楔炮闩垂直下降 160 mm 敞开药室，抽底钩甩出残余黄铜底托，后顶抛底窗同步弹开将空底托高抛至车外。',
  },
  {
    id: 'ztz99a_phase_5_carousel_index',
    stepNum: '05',
    shortLabel: '底置转盘旋转选弹',
    title: '阶段 5 · 22 发底置装甲转盘伺服旋转分度输送下一发 125mm 弹盒',
    range: [0.5, 0.64],
    description:
      '自动装弹机控制箱启动车底大扭矩伺服驱动环，直径 1.80 米的 22 发底置转盘在炮塔地板下方平顺旋转（+32.7° 双工位分度），将选定弹种的双层 125mm 穿甲弹盒精准对正后部举升槽。',
  },
  {
    id: 'ztz99a_phase_6_hoist_rammer',
    stepNum: '06',
    shortLabel: '举升+68cm链式推弹',
    title: '阶段 6 · 提弹臂垂直举升 +680 mm 与链式推弹机前冲 +540 mm 上膛',
    range: [0.64, 0.86],
    description:
      '垂直提弹臂将整套双层 125mm 穿甲弹丸与半可燃药筒自车底垂直高举 +680 mm 对齐炮膛轴线；尾舱电动刚性链式推弹机迅猛前伸 +540 mm（压缩回位簧至 58%）将弹丸与药筒连贯推入药室。',
  },
  {
    id: 'ztz99a_phase_7_breech_lock_ready',
    stepNum: '07',
    shortLabel: '立楔闭膛待发',
    title: '阶段 7 · 推弹机回撤、提弹臂归位与立楔炮闩自动上锁闭膛待击',
    range: [0.86, 1.0],
    description:
      '链式推弹机高速收回尾舱、举升提弹臂回落至车底转盘待命，立楔式炮闩在强力闭闩簧驱动下干脆向上弹升 +160 mm 严密锁死炮尾，仪表台“装填完毕”绿灯亮起，准备下一发雷霆齐射。',
  },
];

interface Ztz99aCoupledAction {
  /** Barrel & breech rearward recoil in cm (`0 -> -32.0 -> 0`) */
  recoilDX: number;
  /** Vertical breechblock wedge drop (`0 -> 1 -> 0`) */
  breechOpen01: number;
  /** Roof stub-case ejection hatch & catcher flip (`0 -> 1 -> 0`) */
  eject01: number;
  /** Carousel azimuth rotation in radians (`0 -> +2π*2/22 = +0.5712 rad`, seamless 22-fold loop!) */
  carouselRY: number;
  /** Vertical cassette hoist elevator lift (`0 -> 1 -> 0`, max +68.0 cm!) */
  hoist01: number;
  /** Chain-rammer forward thrust (`0 -> 1 -> 0`, max +54.0 cm!) */
  ram01: number;
}

function sampleZtz99aAction(f: number): Ztz99aCoupledAction {
  // 1. Main gun + breech -32 cm recoil stroke [0.16, 0.34] and hydro-pneumatic counter-recoil return [0.34, 0.48]
  const recoil01 = Math.max(0, seg(f, 0.16, 0.33) - seg(f, 0.34, 0.48));
  const recoilDX = -ZTZ99A_RECOIL_STROKE * recoil01;

  // 2. Vertical sliding breechblock opens -16 cm as counter-recoil completes [0.36, 0.46], locks closed [0.88, 0.96]
  const breechOpen01 = Math.max(0, seg(f, 0.36, 0.46) - seg(f, 0.88, 0.96));

  // 3. Stub-case catcher & roof hatch flips open [0.38, 0.49] and closes [0.51, 0.60]
  const eject01 = Math.max(0, seg(f, 0.38, 0.49) - seg(f, 0.51, 0.6));

  // 4. 22-cassette floor carousel rotates exactly 2 symmetric stations (+2π * 2 / 22 = +0.5712 rad >= 0.28 rad!)
  // Holds smoothly through f = 1.0 (zero endpoint jump; 22-fold rotational symmetry wraps seamlessly!)
  const carouselStepRad = (Math.PI * 2 * 2) / ZTZ99A_CAROUSEL_STATIONS;
  const carouselRY = carouselStepRad * seg(f, 0.48, 0.64);

  // 5. Cassette elevator hoist lifts +68 cm from carousel floor to bore axis [0.60, 0.72], lowers [0.85, 0.95]
  const hoist01 = Math.max(0, seg(f, 0.6, 0.72) - seg(f, 0.85, 0.95));

  // 6. Chain rammer thrusts +54 cm forward [0.72, 0.81], retracts [0.82, 0.90]
  const ram01 = Math.max(0, seg(f, 0.72, 0.81) - seg(f, 0.82, 0.9));

  return {
    recoilDX,
    breechOpen01,
    eject01,
    carouselRY,
    hoist01,
    ram01,
  };
}

export function computeZtz99aFiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  const dz = 0;
  const rx = 0;
  let ry = 0;
  let rz = 0;
  let scaleX = 1;

  const act = sampleZtz99aAction(f);

  switch (partId) {
    case 'ztz99a_main_gun': {
      dx = act.recoilDX;
      break;
    }

    case 'ztz99a_recoil_cylinders': {
      // Telescoping chrome hydraulic pistons move rearward with recoiling gun yoke
      dx = act.recoilDX * 0.55;
      break;
    }

    case 'ztz99a_recoil_springs': {
      // Dynamic CSG Spring #1 (local X in [0, 82], anchor=0 pinned at rear cradle bulkhead X=15):
      // Compresses cleanly from 1.000 -> 0.610 as ZPT-98 recoils -32 cm!
      const L0 = 82.0;
      scaleX = (L0 + act.recoilDX) / L0;
      break;
    }

    case 'ztz99a_breech_block': {
      // Recoils -32 cm with main gun, then vertical sliding wedge drops open -16 cm!
      dx = act.recoilDX;
      dy = -ZTZ99A_BREECH_DROP * act.breechOpen01;
      break;
    }

    case 'ztz99a_stub_ejector': {
      // Roof stub-case ejection hatch pops upward & pivots open -50° to fling spent brass base skyward!
      dy = 14.0 * act.eject01;
      rz = -0.88 * act.eject01;
      break;
    }

    case 'ztz99a_autoloader_carousel': {
      // 22-cassette floor carousel indexes smoothly (+0.5712 rad = 2 stations)
      ry = act.carouselRY;
      break;
    }

    case 'ztz99a_loading_tray': {
      // Vertical cassette elevator hoists fresh 2-piece 125mm APFSDS round +68 cm straight to bore height!
      dy = ZTZ99A_HOIST_LIFT * act.hoist01;
      break;
    }

    case 'ztz99a_rammer_chain': {
      // Overhead chain rammer thrusts +54 cm forward to seat APFSDS projectile & semi-combustible charge
      dx = ZTZ99A_RAMMER_STROKE * act.ram01;
      break;
    }

    case 'ztz99a_rammer_spring': {
      // Dynamic CSG Spring #2 (local X in [0, 56], anchor=0 at rear turret bustle):
      // Compresses smoothly from 1.000 -> 0.580 during rammer stroke!
      dx = 24.0 * act.ram01;
      scaleX = 1.0 - 0.42 * act.ram01;
      break;
    }

    case 'ztz99a_v12_engine': {
      // Subtle 1,500-HP V12 diesel powerpack rumble damping smoothly to 0 at endpoints
      const env = Math.sin(f * Math.PI);
      dy = 0.35 * Math.sin(f * Math.PI * 16) * env;
      break;
    }

    default:
      break;
  }

  const snap0 = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  return {
    pos: [snap0(dx), snap0(dy), dz],
    rot: [rx, snap0(ry), snap0(rz)],
    scaleX: Math.abs(scaleX - 1) < 1e-9 ? 1 : scaleX,
  };
}

/**
 * Computes `125mm DTC10-125 APFSDS` (650 MPa, 1,780 m/s) internal/external ballistics
 * & 2-piece autoloader visual state across `f ∈ [0, 1]`.
 */
export function computeZtz99aBallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const act = sampleZtz99aAction(f);

  // 1. 125mm DTC10-125 APFSDS Penetrator Dart along bore Y = +38.0 cm
  const bulletVisible = f >= 0.11 && f < 0.38;
  let bulletX = 95.0;
  let streakLength = 0;

  if (f >= 0.11 && f < 0.2) {
    const u = Math.pow(linearSeg(f, 0.11, 0.2), 1.35);
    bulletX = 95.0 + (ZTZ99A_MUZZLE_X + act.recoilDX - 95.0) * u;
    streakLength = 52.0 * u;
  } else if (f >= 0.2 && f < 0.38) {
    const u = linearSeg(f, 0.2, 0.38);
    const exitX = ZTZ99A_MUZZLE_X + sampleZtz99aAction(0.2).recoilDX;
    bulletX = exitX + 680.0 * u;
    streakLength = 120.0 * (1 - u * 0.45);
  }

  // 2. Spent 125mm Brass Propellant Stub Base — Extracted at f=0.38 and flung skyward out of roof ejection hatch!
  const spentCaseVisible = f >= 0.36 && f < 0.72;
  let caseX = 56.0 + act.recoilDX;
  let caseY = ZTZ99A_BORE_Y;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.36 && f < 0.44) {
    const u = seg(f, 0.36, 0.44);
    caseX = 56.0 + (-42.0 - 56.0) * u;
    caseY = ZTZ99A_BORE_Y + (56.0 - ZTZ99A_BORE_Y) * u;
  } else if (f >= 0.44 && f < 0.72) {
    const u = linearSeg(f, 0.44, 0.72);
    caseX = -42.0 - 115.0 * u;
    caseY = 56.0 + 185.0 * u - 140.0 * u * u;
    caseZ = 22.0 * u;
    caseRX = u * 7.5;
    caseRY = u * 5.2;
    caseRZ = -u * 9.6;
    if (f > 0.6) {
      spentCaseOpacity = 1 - linearSeg(f, 0.6, 0.72);
    }
  }

  // 3. Chamber Flash, Mid-Barrel Bore Evacuator Purge & Massive 125mm Muzzle Blast Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.1 && f <= 0.22) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.1, 0.22) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.21 && f <= 0.34) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.21, 0.34) * Math.PI) * 0.75;
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.19 && f <= 0.33) {
    const u = linearSeg(f, 0.19, 0.33);
    muzzlePlumeScale = 1.6 + 6.8 * Math.pow(u, 0.5);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.92;
  }

  // 4. Next 2-Piece 125mm APFSDS Round: rides upward on hoist tray [-44, -30, 0] -> [-44, +38, 0] -> rammed to [+85, +38, 0]
  let nextX = -44.0;
  let nextY = -30.0;
  const nextZ = 0;
  const nextRZ = 0;

  if (f >= 0.6 && f < 0.72) {
    const u = seg(f, 0.6, 0.72);
    nextY = -30.0 + (ZTZ99A_BORE_Y - -30.0) * u;
  } else if (f >= 0.72 && f < 0.82) {
    const u = seg(f, 0.72, 0.82);
    nextX = -44.0 + (85.0 - -44.0) * u;
    nextY = ZTZ99A_BORE_Y;
  } else if (f >= 0.82) {
    nextX = 85.0;
    nextY = ZTZ99A_BORE_Y;
  }

  // 5. Reserve 125mm Carousel Cassette indexing along floor ring radius R = 55 cm
  const resAngle = Math.PI - 0.5712 + act.carouselRY;
  const resX = 22.0 + Math.cos(resAngle) * 55.0;
  const resY = -36.0;
  const resZ = -Math.sin(resAngle) * 55.0;

  return {
    bulletVisible,
    bulletPos: [bulletX, ZTZ99A_BORE_Y, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [377.0 + act.recoilDX, ZTZ99A_BORE_Y, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, resZ],
  };
}

// ============================================================================
// 3 × 2K 5-Channel Packed ORM WebP Texture Suites (Blender 5.2 Cycles GPU)
// ============================================================================

export const ZTZ99A_V3_ARMOR_HULL_PBR: PbrBindingSpec = {
  albedoFile: 'ztz99a_v3_armor_hull_albedo.webp',
  normalFile: 'ztz99a_v3_armor_hull_normal.webp',
  roughnessFile: 'ztz99a_v3_armor_hull_roughness.webp',
  normalScale: 0.92,
};

export const ZTZ99A_V3_TURRET_GUN_PBR: PbrBindingSpec = {
  albedoFile: 'ztz99a_v3_turret_gun_albedo.webp',
  normalFile: 'ztz99a_v3_turret_gun_normal.webp',
  roughnessFile: 'ztz99a_v3_turret_gun_roughness.webp',
  normalScale: 0.9,
};

export const ZTZ99A_V3_INTERIOR_POWER_PBR: PbrBindingSpec = {
  albedoFile: 'ztz99a_v3_interior_power_albedo.webp',
  normalFile: 'ztz99a_v3_interior_power_normal.webp',
  roughnessFile: 'ztz99a_v3_interior_power_roughness.webp',
  normalScale: 0.86,
};

export const ZTZ99A_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  // Suite 1: ztz99a_v3_armor_hull (8 solid GLB parts)
  ztz99a_hull_armor: ZTZ99A_V3_ARMOR_HULL_PBR,
  ztz99a_glacis_era: ZTZ99A_V3_ARMOR_HULL_PBR,
  ztz99a_side_skirts: ZTZ99A_V3_ARMOR_HULL_PBR,
  ztz99a_road_wheels: ZTZ99A_V3_ARMOR_HULL_PBR,
  ztz99a_tracks_left: ZTZ99A_V3_ARMOR_HULL_PBR,
  ztz99a_tracks_right: ZTZ99A_V3_ARMOR_HULL_PBR,
  ztz99a_rear_deck: ZTZ99A_V3_ARMOR_HULL_PBR,
  ztz99a_turret_ring: ZTZ99A_V3_ARMOR_HULL_PBR,

  // Suite 2: ztz99a_v3_turret_gun (8 solid GLB parts)
  ztz99a_turret_shell: ZTZ99A_V3_TURRET_GUN_PBR,
  ztz99a_era_wedges: ZTZ99A_V3_TURRET_GUN_PBR,
  ztz99a_main_gun: ZTZ99A_V3_TURRET_GUN_PBR,
  ztz99a_gun_cradle: ZTZ99A_V3_TURRET_GUN_PBR,
  ztz99a_recoil_cylinders: ZTZ99A_V3_TURRET_GUN_PBR,
  ztz99a_breech_block: ZTZ99A_V3_TURRET_GUN_PBR,
  ztz99a_optics_citv: ZTZ99A_V3_TURRET_GUN_PBR,
  ztz99a_roof_armaments: ZTZ99A_V3_TURRET_GUN_PBR,

  // Suite 3: ztz99a_v3_interior_power (8 solid GLB parts)
  ztz99a_autoloader_carousel: ZTZ99A_V3_INTERIOR_POWER_PBR,
  ztz99a_loading_tray: ZTZ99A_V3_INTERIOR_POWER_PBR,
  ztz99a_rammer_chain: ZTZ99A_V3_INTERIOR_POWER_PBR,
  ztz99a_stub_ejector: ZTZ99A_V3_INTERIOR_POWER_PBR,
  ztz99a_v12_engine: ZTZ99A_V3_INTERIOR_POWER_PBR,
  ztz99a_transmission: ZTZ99A_V3_INTERIOR_POWER_PBR,
  ztz99a_torsion_bars: ZTZ99A_V3_INTERIOR_POWER_PBR,
  ztz99a_crew_stations: ZTZ99A_V3_INTERIOR_POWER_PBR,
};

export const ZTZ99A_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'ztz99a_v3_armor_hull',
    weapon: ZTZ99A_ID,
    titleCn: '空心复合装甲车体、首上 FY-4 爆反、双销履带与后动力甲板贴图组 (V3)',
    partTag: 'H-01..08 HULL ARMOR, GLACIS ERA, TRACKS & DECK',
    resolution: '2048 × 2048 px',
    summary:
      '基于 Blender 5.2 Cycles GPU 烘焙的 ZTZ-99A 车体与行走底盘 2K 5 通道 Packed ORM 贴图套件：忠实再现中国陆军现代三色（橄榄绿 / 沙土黄 / 深松炭灰）像素化数码迷彩与抗反光哑光军用漆面，车体双侧无畸变 Hero UV 区域精绘白色八一五角星徽标与战术车号「99A-108」，同时精细区分挂胶钢履带磨亮齿尖、硫化橡胶轮缘、车尾双 200L 副油箱与内齿精磨炮塔座圈的真实物理粗糙度。',
    highlights: [
      '现代解放军三色像素数码迷彩 + 清晰白色战术车体编号「99A-108」与五角星徽标',
      '首上 FY-4 双防爆反装甲焊缝、螺栓起伏法线与双侧橡胶/钢复合裙板质感分层',
      '双销挂胶履带接地磨亮金属棱边、670mm 负重轮硫化胶缘与精磨炮塔座圈钢光',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'ztz99a_v3_armor_hull_albedo.webp',
        note: 'sRGB · 解放军三色像素数码迷彩 / 白色「99A-108」铭牌 / 挂胶履带与精磨座圈',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'ztz99a_v3_armor_hull_normal.webp',
        note: 'Linear · 装甲板轧制纹与焊缝 + 首上 FY-4 爆反螺栓 + 百叶格栅与履带纹路',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'ztz99a_v3_armor_hull_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:座圈钢(0.22)-哑光迷彩漆(0.58)-橡胶胎缘(0.82) / B:金属度',
      },
    ],
  },
  {
    id: 'ztz99a_v3_turret_gun',
    weapon: ZTZ99A_ID,
    titleCn: '空心焊接炮塔、箭头楔形 FY-4 爆反、125mm ZPT-98 主炮与 JD-3 光电贴图组 (V3)',
    partTag: 'T-01..03 / G-01..03 / FC-01..02 TURRET, 125MM GUN & OPTICS',
    resolution: '2048 × 2048 px',
    summary:
      '专为 ZTZ-99A 标志性箭镞楔形炮塔与 125mm 火力系统定制的 2K 5 通道 Packed ORM 贴图套件：炮塔双侧 Hero 装甲翼面高清呈现红边八一五角星与白字战术编号「ZTZ-99A / 108」，6.25 米 ZPT-98 L/50 滑膛炮身管带迷彩热护套、不锈钢抱箍与膛口火药微积碳，内部展现镜面镀铬双联液压驻退复进活塞杆与机加立楔炮闩；炮长热像、车长 CITV 与 JD-3 激光主动压制镜头实行严格 >=50 px 翡翠蓝宝石光学 UV 防火墙，零色渗。',
    highlights: [
      '炮塔双侧高清红边八一五角星与战术编号「ZTZ-99A / 108」无镜像平面 Hero 映射',
      'CITV 周视镜、炮长热像仪与 JD-3 激光压制转塔翡翠蓝宝石镀膜镜头严格 UV 隔离',
      '镜面镀铬双联液压驻退筒、精铣锻钢立楔炮闩与 125mm 炮口细微高温烟熏过渡',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'ztz99a_v3_turret_gun_albedo.webp',
        note: 'sRGB · 数码迷彩箭镞炮塔与「ZTZ-99A / 108」徽标 / 镜面铬驻退筒 / 翡翠光学镜头',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'ztz99a_v3_turret_gun_normal.webp',
        note: 'Linear · 箭镞 FY-4 爆反倒角与焊道 + 炮管热护套箍带 + 炮闩 CNC 刀纹',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'ztz99a_v3_turret_gun_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:光学镜片与镜铬(0.12)-炮闩(0.24)-哑光装甲(0.58) / B:金属度',
      },
    ],
  },
  {
    id: 'ztz99a_v3_interior_power',
    weapon: ZTZ99A_ID,
    titleCn: '22 发底置转盘自动装弹机、150HB V12 双涡轮柴油机与数字座舱贴图组 (V3)',
    partTag: 'A-01..03 / G-05 / P-01..02 / H-09 / FC-03 CUTAWAY INTERIOR & V12',
    resolution: '2048 × 2048 px',
    summary:
      '献给 CT 纵剖面（[C]）硬核机械爱好者的殿堂级内构 2K 5 通道 Packed ORM 贴图组：精细刻画 22 发底置转盘中黑钨 125mm 尾翼稳定脱壳穿甲弹、琥珀半可燃发射药筒与闪亮 C26000 黄铜底托的四重 UV 隔离材质；后舱呈现 1,500 马力 150HB V12 双涡轮柴油机铸铝缸体、镜银涡轮蜗壳、青铜排气歧管、紫铜 CH-1000 散热芯与安全黄机油加注口，前舱与炮塔内置荧光青绿数字化战术显控屏（MFD）。',
    highlights: [
      '22 发转盘与提弹臂 125mm APFSDS 钨芯、琥珀可燃药筒与黄铜底托严格 UV 防火墙',
      '1,500 马力 150HB V12 双银涡轮增压器、青铜排气歧管、紫铜散热芯与安全黄检修盖',
      '车长/炮长/驾驶员三工位青绿数字化弹道火控 MFD 显控屏与 12 根横置扭杆钢光',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'ztz99a_v3_interior_power_albedo.webp',
        note: 'sRGB · 22发黄铜药筒与穿甲弹 / 银涡轮V12与安全黄油盖 / 青绿数字化 MFD 屏',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'ztz99a_v3_interior_power_normal.webp',
        note: 'Linear · 发动机缸体铸纹与散热翅片 + 转盘铆钉齿轮 + 刚性推弹链节微法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'ztz99a_v3_interior_power_roughness.webp',
        note: 'Linear · R:内腔提亮AO / G:亮黄铜与涡轮(0.18)-缸体(0.36)-座椅织物(0.84) / B:金属度',
      },
    ],
  },
];

export const ZTZ99A_PLUGIN: WeaponRuntimePlugin = {
  id: ZTZ99A_ID,
  partGroups: ZTZ99A_PART_GROUPS,
  timelinePresets: ZTZ99A_TIMELINE_PRESETS,
  parts: ZTZ99A_PARTS,
  firingPhases: ZTZ99A_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(ZTZ99A_FIRING_PHASES, f),
  computeFiringKinematics: computeZtz99aFiringKinematics,
  computeBallisticsState: computeZtz99aBallisticsState,
  pbrBindings: ZTZ99A_PBR_BINDINGS,
  pbrSuites: ZTZ99A_PBR_SUITES,
};
