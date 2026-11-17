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
  PartKinematicDelta,
  PbrBindingSpec,
  PbrSuiteItem,
  TimelinePresetItem,
  WeaponId,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';

const DEG = Math.PI / 180;

export const R500_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'frame',
    nameZh: '镂空CNC无托机匣与光学桥总成',
    nameEn: 'Skeletonized CNC Bullpup Mainframe & Optical Bridge',
    badgeColor: '#94a3b8',
  },
  {
    key: 'slide',
    nameZh: 'HexCoil 360°螺旋凸轮、四片分体碳弓片与绞盘导螺杆',
    nameEn: 'HexCoil 360° Helical Cams, Quad Limbs & VersaDrive',
    badgeColor: '#38bdf8',
  },
  {
    key: 'fire_control',
    nameZh: 'Trac-Trigger悬浮扳机滑架与防空放火控总成',
    nameEn: 'Trac-Trigger Floating Sled, Anti-Dry-Fire & Match Sear',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '100码BDC瞄准镜、三箭箭壶与500 FPS碳箭总成',
    nameEn: '100-Yd BDC Crossbow Scope, 3-Bolt Quiver & 500 FPS Bolt',
    badgeColor: '#fb923c',
  },
];

export const R500_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: 'Ravin R500 HexCoil 超窄无托复合弩标准展陈态：全长 710 mm，未上弦轴距仅 193 mm（满拉压缩至 92 mm），360° 螺旋凸轮、Trac-Trigger 悬浮滑架、1–8×24 100 码 BDC 瞄准镜与右侧快拆三箭箭壶严密装配。',
  },
  {
    id: 'field_strip',
    label: '一级勤务模块分解',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '快速分解外围战术模块：拆卸右侧快拆 3 箭箭壶与 1–8×24 BDC 瞄准镜，分离折叠不锈钢脚蹬、防拇指护木与后部 VersaDrive 离合枪托。',
  },
  {
    id: 'sub_assembly',
    label: '二级凸轮与悬浮火控分解',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '前推分离 CNC 弓头与水平四片碳纤维分体弓片，展开 360° 多层螺旋 HexCoil 凸轮、主弓弦与交叉力缆，并向上抽出 Trac-Trigger 悬浮扳机滑架总成。',
  },
  {
    id: 'full_exploded',
    label: '全零件军械爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 25 个核心工程零件零遮挡展开：呈现 VersaDrive 梯形丝杠、双棘轮螺旋离合器、悬浮弦爪与防空放连杆、钛合金凸轮轴及 20 吋 500 FPS 比赛级碳箭全部精密配合关系。',
  },
];

export const R500_PARTS: WeaponPartSpec[] = [
  // ==================== 1. 'frame': BULLPUP MAINFRAME, GRIPS, STOCK, STIRRUP & BRIDGE (6 parts) ====================
  {
    id: 'r500_chassis',
    bomCode: 'B-01',
    nameZh: 'CNC整块锻铝镂空无托主框架',
    calloutLabel: 'CNC镂空无托主框',
    nameEn: 'CNC Billet Aluminum Skeletonized Bullpup Chassis',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-6.0, -1.6, 0],
    labelAppearAt: 0.04,
    roleTag: '无摩擦悬浮导轨基座 · 镂空桁架CNC机匣',
    description:
      '7075-T6 航空铝合金整块 CNC 铣削而成的 R500 无托主框架：内部贯穿 430 mm 长 VersaDrive 梯形丝杠导槽与 Trac-Trigger 悬浮滑道，侧面铣削减重桁架窗，顶部保留中心开口供弦爪滑架无接触悬浮运行。',
  },
  {
    id: 'r500_forend_grip',
    bomCode: 'B-02',
    nameZh: '带宽翼防拇指护木前握把',
    calloutLabel: '防拇指翼前护木',
    nameEn: 'Textured Forend Grip w/ Anti-Thumb Safety Wings',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [14.2, -1.85, 0],
    explodeSteps: [
      { range: [0.08, 0.34], offset: [0, -4.4, 0] },
      { range: [0.65, 1.0], offset: [1.8, -2.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.12,
    roleTag: '手指防切护翼 · 人机防滑掌托',
    description:
      '安装于无托机匣前下缘的玻纤尼龙前护木，两侧水平延展至 Z=±3.15 cm 的宽幅防拇指护翼（Anti-Thumb Wings）将辅助手掌安全隔离在 500 FPS 弓弦与力缆扫掠平面之下。',
  },
  {
    id: 'r500_pistol_grip',
    bomCode: 'B-03',
    nameZh: '人机工程无托小握把与扳机护圈',
    calloutLabel: '无托握把与护圈',
    nameEn: 'Ergonomic Bullpup Pistol Grip & Trigger Guard',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [1.6, -4.8, 0],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [-1.0, -5.8, 0] },
      { range: [0.65, 1.0], offset: [-1.4, -2.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    labelAppearAt: 0.14,
    roleTag: '18°倾角握持支点 · 冬季加宽扳机护圈',
    description:
      '前置无托握把结构将重心收拢至射手肩窝附近，一体成型加宽扳机护圈容纳戴手套食指操作 3.5 磅比赛级扳机鞋，表层覆盖 VDI-27 微火花防滑蚀纹。',
  },
  {
    id: 'r500_buttstock',
    bomCode: 'B-04',
    nameZh: '镂空尾托、VersaDrive离合座与缓冲垫',
    calloutLabel: '镂空离合尾托',
    nameEn: 'Skeletonized Buttstock w/ VersaDrive Clutch Bore',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-27.8, -0.45, 0],
    explodeSteps: [
      { range: [0.05, 0.28], offset: [-6.8, -0.6, 0] },
      { range: [0.65, 1.0], offset: [-4.5, -1.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.08,
    roleTag: '双棘轮离合容腔 · 橡胶防滑肩垫',
    description:
      '对接于 CNC 主框尾端的轻量镂空尾托，上腔精确镗孔 Ø29.2 mm 容纳 VersaDrive 双棘轮螺旋离合齿轮与折叠摇把驱动头，尾端装配吸震橡胶抵肩垫。',
  },
  {
    id: 'r500_foot_stirrup',
    bomCode: 'B-05',
    nameZh: '前折叠不锈钢上弦脚蹬',
    calloutLabel: '折叠不锈钢脚蹬',
    nameEn: 'Folding Stainless-Steel Cocking Foot Stirrup',
    group: 'frame',
    material: 'stainless',
    assembledPos: [34.0, 1.15, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [6.8, -1.2, 0] },
      { range: [0.65, 1.0], offset: [5.2, -1.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.1,
    roleTag: '17-4PH不锈钢蹬环 · 滚花防滑踩踏杆',
    description:
      '铰接固定于前弓头鼻端的 17-4PH 不锈钢脚蹬环，前踏杆下沉至箭道平面以下避免干涉箭头飞行，搭配滚花踏套以便稳定支撑或抵地待机。',
  },
  {
    id: 'r500_flight_rail',
    bomCode: 'B-06',
    nameZh: '无摩擦悬臂光学桥与皮卡汀尼瞄具轨',
    calloutLabel: '悬臂光学桥导轨',
    nameEn: 'Frictionless Zero-Rail Optical Bridge & Picatinny Rail',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-7.0, 3.85, 0],
    explodeSteps: [
      { range: [0.12, 0.38], offset: [0, 4.8, 0] },
      { range: [0.65, 1.0], offset: [0, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.16,
    roleTag: '后跨悬臂高刚度桥架 · MIL-STD-1913齿槽',
    description:
      'Ravin 无摩擦飞行系统核心：碳箭底部全悬空不摩擦导轨，全高强度 CNC 悬臂光学桥仅由后侧双外跨立柱锚定在满拉止点（-22 cm）之后，顶部铣削 245 mm 标准 MIL-STD-1913 皮卡汀尼瞄具导轨。',
  },

  // ==================== 2. 'slide': HEXCOIL CAMS, QUAD LIMBS & VERSADRIVE (9 parts) ====================
  {
    id: 'r500_riser_head',
    bomCode: 'H-01',
    nameZh: '前CNC合金弓头与倾斜分体弓片座',
    calloutLabel: 'CNC前弓头与片座',
    nameEn: 'Forward CNC Riser Block & Angled Limb Pockets',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [26.2, 1.75, 0],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [5.2, 0, 0] },
      { range: [0.65, 1.0], offset: [3.2, 0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.16,
    roleTag: '300磅张力承载枢纽 · 前V型无摩擦托箭滚轮座',
    description:
      '锁固于主机匣最前端的高强铝合金弓头块，左右两侧铣削出深槽双层斜角弓片座牢固夹持四片分体碳片根部，中央集成 V 型双滚轮前箭托引导碳箭以零导轨摩擦飞出。',
  },
  {
    id: 'r500_left_limbs',
    bomCode: 'H-02',
    nameZh: '左侧水平四片分体碳纤维弓片',
    calloutLabel: '左分体碳纤维弓片',
    nameEn: 'Left Horizontal Split Quad Carbon Limbs',
    group: 'slide',
    material: 'polymer_frame',
    assembledPos: [26.2, 1.8, -2.4],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [5.2, 0, 0] },
      { range: [0.4, 0.72], offset: [1.2, 0.4, -4.8] },
      { range: [0.72, 1.0], offset: [0.8, 0.4, -2.6] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.28,
    roleTag: '3K高模量碳玻复合 · 抛物线大挠度储能',
    description:
      '上下成对对称夹持左 HexCoil 凸轮轴的水平分体式碳纤维-玻璃钢复合弓片：待机时轴端外张至 Z=-9.65 cm，蓄力满拉时弯曲内收 50.5 mm 至 Z=-4.60 cm 储存逾 300 磅弹性能。',
  },
  {
    id: 'r500_right_limbs',
    bomCode: 'H-03',
    nameZh: '右侧水平四片分体碳纤维弓片',
    calloutLabel: '右分体碳纤维弓片',
    nameEn: 'Right Horizontal Split Quad Carbon Limbs',
    group: 'slide',
    material: 'polymer_frame',
    assembledPos: [26.2, 1.8, 2.4],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [5.2, 0, 0] },
      { range: [0.4, 0.72], offset: [1.2, 0.4, 4.8] },
      { range: [0.72, 1.0], offset: [0.8, 0.4, 2.6] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.28,
    roleTag: '镜像对称四片弓臂 · 消除侧向扭矩',
    description:
      '与左侧严格镜像匹配的右侧分体双层碳纤维弓片：与左侧联合实现满拉 92 mm（3.6 英寸）极致超窄轴距，并在回弹瞬间零侧向抖动释放能量。',
  },
  {
    id: 'r500_left_cam',
    bomCode: 'H-04',
    nameZh: '左HexCoil 360°多层螺旋凸轮组',
    calloutLabel: '左HexCoil螺旋凸轮',
    nameEn: 'Left HexCoil 360° Multi-Tier Helical Cam Stack',
    group: 'slide',
    material: 'copper_accent',
    assembledPos: [25.2, 1.8, -9.65],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [5.2, 0, 0] },
      { range: [0.4, 0.72], offset: [1.2, 0.4, -4.8] },
      { range: [0.72, 1.0], offset: [-0.8, 2.8, -3.4] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.42,
    roleTag: '310°大转角螺旋缠绕 · 三层独立弦/缆槽',
    description:
      'Ravin 专利 HexCoil 三层偏心螺旋凸轮：中央深槽缠绕主弓弦，上下双螺旋卷盘分别收放力缆与同步控制缆，在 15 英寸短弓体行程内旋转 310° 实现传统平面凸轮无法企及的 500 FPS 加速效率。',
  },
  {
    id: 'r500_right_cam',
    bomCode: 'H-05',
    nameZh: '右HexCoil 360°多层螺旋凸轮组',
    calloutLabel: '右HexCoil螺旋凸轮',
    nameEn: 'Right HexCoil 360° Multi-Tier Helical Cam Stack',
    group: 'slide',
    material: 'copper_accent',
    assembledPos: [25.2, 1.8, 9.65],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [5.2, 0, 0] },
      { range: [0.4, 0.72], offset: [1.2, 0.4, 4.8] },
      { range: [0.72, 1.0], offset: [-0.8, 2.8, 3.4] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.42,
    roleTag: '同步二进制螺旋轮 · ±310°零偏心同步',
    description:
      '与左凸轮等角度反向同步回转 310° 的右侧青铜金阳极氧化 HexCoil 凸轮组：通过交叉力缆强制双轮同步，保证弓弦中心箭尾扣始终沿 Z=0 绝对中线直线推进。',
  },
  {
    id: 'r500_cam_axles',
    bomCode: 'H-06',
    nameZh: '左右钛合金凸轮主轴与滚针轴承',
    calloutLabel: '钛合金凸轮主轴组',
    nameEn: 'Left & Right Titanium Cam Axles & Needle Bearings',
    group: 'slide',
    material: 'stainless',
    assembledPos: [25.2, 1.8, 0],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [5.2, 0, 0] },
      { range: [0.4, 0.72], offset: [1.2, 0.4, 0] },
      { range: [0.72, 1.0], offset: [-1.2, 5.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    labelAppearAt: 0.68,
    roleTag: 'Ti-6Al-4V精密磨削轴 · 低阻推力垫片',
    description:
      '高强钛合金垂向主轴、滚针轴承外圈、阳极氧化推力垫片与 E 型卡簧：在 300 磅静拉力与 500 FPS 瞬间卸载冲击下确保双 HexCoil 凸轮丝滑同轴回转。',
  },
  {
    id: 'r500_bowstring',
    bomCode: 'H-07',
    nameZh: '高强缠绕主弓弦（360mm动力行程）',
    calloutLabel: '高强缠绕主弓弦',
    nameEn: 'Served High-Tenacity Bowstring (15" Power Stroke)',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [14.0, 1.8, 0],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [5.2, 0, 0] },
      { range: [0.42, 0.76], offset: [-4.2, 3.8, 0] },
      { range: [0.76, 1.0], offset: [-2.8, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.44,
    roleTag: 'BCY超分子缠绕护弦 · -36cm后拉储力',
    description:
      '高模量高分子聚乙烯编织主弓弦：中央耐磨护弦区精确被 Trac-Trigger 弦爪夹持后拉 360 mm 至 X=-22.0 cm 待发位，两侧端部严格锁定在随凸轮内收的 HexCoil 弦槽切点。',
  },
  {
    id: 'r500_power_cables',
    bomCode: 'H-08',
    nameZh: '双螺旋交叉力缆与分缆滑块',
    calloutLabel: '螺旋交叉力缆组',
    nameEn: 'Dual Helical Power & Control Cables w/ Slide',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [22.8, 1.8, 0],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [5.2, 0, 0] },
      { range: [0.42, 0.76], offset: [-1.8, -3.2, 0] },
      { range: [0.76, 1.0], offset: [-1.2, -2.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.46,
    roleTag: '上下交叉力缆同步 · 箭道下方低阻分缆器',
    description:
      '四股交叉螺旋动力缆与同步控制缆从左右 HexCoil 上下卷盘引出，经由主框内部低于箭道 5.6 mm 的自润滑分缆滑块交叉锚定至对侧弓头座，彻底避让箭羽飞行走廊。',
  },
  {
    id: 'r500_versadrive_screw',
    bomCode: 'H-09',
    nameZh: 'VersaDrive梯形丝杠与双棘轮离合齿轮',
    calloutLabel: 'VersaDrive丝杠离合',
    nameEn: 'VersaDrive Acme Cocking Screw & Helical Clutch',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-5.5, 0.55, 0],
    explodeSteps: [
      { range: [0.05, 0.28], offset: [-6.8, -0.6, 0] },
      { range: [0.36, 0.68], offset: [-10.5, 0.6, 0] },
      { range: [0.68, 1.0], offset: [-5.2, 0.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.34,
    roleTag: '404mm不锈钢梯形螺杆 · 静音防逆转棘轮',
    description:
      '贯穿整个无托机匣的 VersaDrive 不锈钢梯形螺纹上弦螺杆与尾部 12 齿青铜双棘轮离合器：摇动即可驱动 Trac-Trigger 滑架往复运动，松手任意位置自动防逆转锁停且支持静音安全退弦。',
  },

  // ==================== 3. 'fire_control': TRAC-TRIGGER SLED, LATCH & SEAR (6 parts) ====================
  {
    id: 'r500_trigger_sled',
    bomCode: 'T-01',
    nameZh: 'Trac-Trigger悬浮扳机滑架',
    calloutLabel: 'Trac-Trigger滑架',
    nameEn: 'Trac-Trigger Floating Sear Carriage (TTFS)',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [12.5, 1.05, 0],
    explodeSteps: [
      { range: [0.16, 0.44], offset: [-1.5, 5.4, 0] },
      { range: [0.7, 1.0], offset: [-1.5, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.18,
    roleTag: '360mm导轨悬浮滑车 · 全程无接触承托弦爪',
    description:
      'CNC 精密加工的 Trac-Trigger 悬浮火控滑架：借由内膛梯形螺母与 VersaDrive 螺杆啮合，在机匣内导轨上从 X=+12.5 cm 前推抓弦位置一路平滑后移 360 mm 至 X=-23.5 cm 满拉待击止点。',
  },
  {
    id: 'r500_string_latch',
    bomCode: 'T-02',
    nameZh: '双对开弹簧加载抓弦爪',
    calloutLabel: '双对开抓弦爪',
    nameEn: 'Dual Spring-Loaded Pivoting Bowstring Catch Jaws',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [13.85, 1.8, 0],
    explodeSteps: [
      { range: [0.16, 0.44], offset: [-1.5, 5.4, 0] },
      { range: [0.7, 1.0], offset: [2.4, 3.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.66,
    roleTag: '自对中上下爪钳 · 300磅零偏摆瞬间脱扣',
    description:
      '对称铰接于滑架前端的双硬化不锈钢抓弦爪：合拢时以极高同心度抱死主弓弦中心护弦，击发阻铁脱扣瞬间上下同步弹开，杜绝任何弓弦横向抖动或磨损。',
  },
  {
    id: 'r500_anti_dry_fire',
    bomCode: 'T-03',
    nameZh: '自动防空放互锁杠杆与箭尾传感器',
    calloutLabel: '防空放互锁杠杆',
    nameEn: 'Automatic Anti-Dry-Fire Interlock & Bolt Sensor',
    group: 'fire_control',
    material: 'copper_accent',
    assembledPos: [13.15, 2.05, 0],
    explodeSteps: [
      { range: [0.16, 0.44], offset: [-1.5, 5.4, 0] },
      { range: [0.7, 1.0], offset: [-0.8, 5.2, -1.6] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    labelAppearAt: 0.68,
    roleTag: '无箭绝不解锁 · 机械顶推式物理互锁',
    description:
      '位于悬浮滑架上槽内的青铜防空放安全杠杆：未装填碳箭时其前端传感爪下沉死锁阻铁通道；唯独 20 吋碳箭半月形尾扣完全推入到位后方将其顶起解锁，100% 杜绝 300 磅能量空放炸弓风险。',
  },
  {
    id: 'r500_trigger_sear',
    bomCode: 'T-04',
    nameZh: '3.5磅无蠕动比赛扳机、连杆与主阻铁',
    calloutLabel: '比赛扳机与传力杆',
    nameEn: 'Zero-Creep 3.5 lb Match Trigger Shoe, Rod & Sear',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-6.0, -1.0, 0],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [-1.0, -5.8, 0] },
      { range: [0.46, 0.78], offset: [-2.8, -3.2, 0] },
      { range: [0.78, 1.0], offset: [-2.2, -2.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.44,
    roleTag: '1.59kg清脆扳机力 · 长行程不锈钢传动杆',
    description:
      '由前置无托弯月扳机鞋、贯穿机匣下通道的 274 mm 高刚性不锈钢传力杆及尾部精密研磨主阻铁组成：将手指轻微后拉直接零变形传递至满拉滑架尾爪，实现步枪级 3.5 磅清脆零蠕动击发。',
  },
  {
    id: 'r500_safety_selector',
    bomCode: 'T-05',
    nameZh: '自动双侧拇指保险拨杆 (SAFE / FIRE)',
    calloutLabel: '双侧自动保险',
    nameEn: 'Automatic Ambidextrous Safety Selector (SAFE / FIRE)',
    group: 'fire_control',
    material: 'follower_orange',
    assembledPos: [-1.8, 0.25, 0],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [-1.0, -5.8, 0] },
      { range: [0.46, 0.78], offset: [-1.8, -2.2, 2.8] },
      { range: [0.78, 1.0], offset: [-1.0, -1.2, 1.8] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.46,
    roleTag: '上弦自动入保险 · 醒目橙双侧拨片',
    description:
      '高识别度安全橙双侧对称拇指保险拨杆与内部阻断凸轮轴：当悬浮滑架拉回满拉待击瞬间自动弹入 SAFE 位置锁死传力杆，须在碳箭上膛后由射手主动下拨至 FIRE 方可扣发。',
  },
  {
    id: 'r500_trigger_spring',
    bomCode: 'T-06',
    nameZh: '螺旋阻铁与抓弦爪复位簧',
    calloutLabel: '阻铁复位螺旋簧',
    nameEn: 'Helical Sear & Latch Return Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [11.55, 1.48, 0],
    explodeSteps: [
      { range: [0.16, 0.44], offset: [-1.5, 5.4, 0] },
      { range: [0.7, 1.0], offset: [-4.2, 4.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.68,
    roleTag: '等线径琴钢丝压簧 · 驱动抓弦爪复位',
    description:
      '内置于 Trac-Trigger 悬浮滑架内的精密琴钢丝螺旋压簧：在抓弦爪弹开脱扣时受压蓄能，并随滑架前推复归弓弦时迅速提供复位预紧力使双爪可靠咬合。',
  },

  // ==================== 4. 'magazine': 100-YD BDC SCOPE, QUIVER, RETENTION ARM & BOLT (4 parts) ====================
  {
    id: 'r500_scope',
    bomCode: 'Q-01',
    nameZh: '1–8×24 100码BDC高亮十字准星弩用瞄准镜',
    calloutLabel: '1-8×24 100码弩镜',
    nameEn: '1–8×24 Illuminated 100-Yd BDC Crossbow Scope',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [-6.0, 6.25, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [0, 5.8, 0] },
      { range: [0.65, 1.0], offset: [0, 4.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.08,
    roleTag: '500 FPS弹道标尺 · 100码BDC与双悬臂镜环',
    description:
      '专为 500 FPS 超高速弹道标定的 1–8×24 战术级低倍率可变倍弩用瞄准镜：配备双螺栓快锁悬臂镜桥、带快拨杆的 1–8× 变倍环、20–100 码弹道下坠补偿（BDC）外露高低鼓及双面绿蓝多层增透光学镜片。',
  },
  {
    id: 'r500_quiver_frame',
    bomCode: 'Q-02',
    nameZh: '右侧快拆3箭箭壶与防割护罩',
    calloutLabel: '快拆3箭侧挂箭壶',
    nameEn: 'Quick-Detach 3-Bolt Side Quiver & Broadhead Hood',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [7.5, -3.15, 4.65],
    explodeSteps: [
      { range: [0.04, 0.28], offset: [0, -1.6, 5.8] },
      { range: [0.65, 1.0], offset: [0, -1.2, 4.2] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.06,
    roleTag: '3箭侧挂快拆 · 吸音泡沫狩猎箭头护罩',
    description:
      '安装于无托机匣右下方独立底座的快拆式 3 箭侧挂箭壶：内置前后双排柔性橡胶卡扣夹持 3 支 20 吋比赛碳箭，前端封闭式聚合物护罩内衬高密度吸音消振泡沫包覆三刃机械猎箭头，全程避开水平弓片与力缆运动区。',
  },
  {
    id: 'r500_retention_arm',
    bomCode: 'Q-03',
    nameZh: '弹簧加载压箭臂与无摩擦前滚轮',
    calloutLabel: '压箭臂与滚轮',
    nameEn: 'Spring-Loaded Arrow Retention Arm & Front Roller',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [10.4, 3.15, 0],
    explodeSteps: [
      { range: [0.12, 0.38], offset: [0, 4.8, 0] },
      { range: [0.58, 0.92], offset: [3.2, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.36,
    roleTag: '无摩擦顶压定位 · 俯仰颠簸零脱弦',
    description:
      '悬臂安装在光学桥最前端下缘的高可见度弹簧压箭臂与前滚轮：在上方双箭羽之间以柔性轻压稳固压住碳箭杆身，确保攀爬或急停瞄准时箭尾始终紧贴弓弦而不产生滑动磨损。',
  },
  {
    id: 'r500_carbon_bolt',
    bomCode: 'Q-04',
    nameZh: '20吋500 FPS比赛级碳箭（配100格令猎箭头）',
    calloutLabel: '20" 500FPS碳箭',
    nameEn: '20" Match Carbon Bolt w/ Half-Moon Nock & Broadhead',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [3.4, 1.8, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [7.8, 2.8, 0] },
      { range: [0.58, 0.95], offset: [11.5, 1.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.14,
    roleTag: '400格令微径碳杆 · 152.4 m/s (500 FPS) 穿甲动能',
    description:
      '全长 508 mm（20 英寸）、总重 400 格令（25.92 克）高直度微径碳纤维弩箭：尾部装配精密车削黄铜半月形尾扣（Half-Moon Nock）和 120° 三片螺旋稳定箭羽（主羽向下跨入导轨槽），前段配不锈钢半外插套与 100 格令 CNC 三刃猎箭头。',
  },
];

export const R500_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'phase_1',
    stepNum: '01',
    shortLabel: 'VersaDrive卷弦蓄力',
    title: 'VersaDrive 丝杠驱动滑架后拉 360mm，HexCoil 凸轮旋转 310° 压窄四片弓臂',
    range: [0.0, 0.24],
    description:
      '摇动尾部 VersaDrive 梯形螺杆使 Trac-Trigger 悬浮滑架抓紧主弓弦向后平滑行程 360 mm 至 X=-22.0 cm 待击止点；左右 HexCoil 螺旋凸轮同步反向旋转 ±310°，将四片分体碳弓片轴距从 193 mm 极致压缩至 92 mm，自动保险随之入位。',
  },
  {
    id: 'phase_2',
    stepNum: '02',
    shortLabel: '装填解保险',
    title: '20吋碳箭半月尾扣推入悬浮滑架，顶起防空放杠杆并拨开双侧安全保险',
    range: [0.24, 0.32],
    description:
      '20 英寸 400 格令比赛碳箭落入前 V 型无摩擦托轮与弹簧压箭轮下，黄铜半月尾扣完全抵紧主弓弦并顶起 Trac-Trigger 内部青铜防空放互锁杠杆；射手下拨安全橙色拇指保险至 FIRE 击发档位。',
  },
  {
    id: 'phase_3',
    stepNum: '03',
    shortLabel: '阻铁零蠕动释放',
    title: '轻扣 3.5 磅比赛级扳机鞋，长传力杆脱扣释放双弹簧抓弦爪',
    range: [0.32, 0.36],
    description:
      '扣下 3.5 磅清脆扳机触发长行程不锈钢传力杆释放尾部主阻铁，滑架内部螺旋压簧（T-06）瞬时受压让位，上下对称硬化钢抓弦爪以零偏摆对称张开彻底释放 300 磅满拉弓弦。',
  },
  {
    id: 'phase_4',
    stepNum: '04',
    shortLabel: '500 FPS高能推射',
    title: 'HexCoil 凸轮 310° 高速回卷，无摩擦推动 400 格令碳箭以 152.4 m/s 离弦',
    range: [0.36, 0.5],
    description:
      '四片高模量碳纤维弓片在 14 毫秒内急剧外弹复位，驱动双 HexCoil 螺旋凸轮高速回转 310° 将 301 焦耳弹性能几乎无摩擦损地转化为碳箭动能，碳箭加速越过鼻端脚蹬基准面（muzzleExitF = 0.48）达到惊人的 500 FPS 初速！',
  },
  {
    id: 'phase_5',
    stepNum: '05',
    shortLabel: '出弩与余振衰减',
    title: '碳箭螺旋自稳高速飞离，弓弦与分体碳弓片完成微幅阻尼谐振止稳',
    range: [0.5, 0.66],
    description:
      '3 片螺旋箭羽赋予碳箭高速旋转稳定姿态穿透目标，高强弓弦在到达前方止点后完成 2.5 个周期的低幅阻尼微振并在分体碳弓片阻尼下迅速恢复平衡静止，防空放杠杆同步落回锁定。',
  },
  {
    id: 'phase_6',
    stepNum: '06',
    shortLabel: '滑架前推复归',
    title: 'VersaDrive 丝杠反向旋转，护送悬浮滑架顺滑前移 360mm 接近弓弦',
    range: [0.66, 0.84],
    description:
      '退解双棘轮离合反向驱动 VersaDrive 梯形螺杆，将锁定于尾部的 Trac-Trigger 悬浮火控滑架沿主机匣内道稳步前送 360 mm 返回前部弓弦停泊位置。',
  },
  {
    id: 'phase_7',
    stepNum: '07',
    shortLabel: '重咬合待机复位',
    title: '抓弦双爪在复位簧推动下重新闭合咬死弓弦，全机构回归均衡待发状态',
    range: [0.84, 1.0],
    description:
      '滑架前端到达 +14.0 cm 弦位，螺旋复位簧释放储能推动双对开抓弦爪重新扣紧主弓弦护弦套，扳机传力杆与主阻铁清脆归零啮合，整弩与箭头索引无缝复位至下一循环起点。',
  },
];

function computeR500CycleValues(f: number): {
  flex01: number;
  sledDX: number;
  boltDX: number;
  boltDY: number;
  boltRX: number;
} {
  // 1. HexCoil + Quad Limbs + Bowstring flex parameter in [-0.048, 1.0]
  let drawBase = 0;
  if (f <= 0.36) {
    drawBase = seg(f, 0.0, 0.24);
  } else if (f <= 0.485) {
    drawBase = 1 - seg(f, 0.36, 0.485);
  }
  const vibU = linearSeg(f, 0.485, 0.66);
  const vibOsc =
    f > 0.485 && f < 0.66
      ? -0.058 * Math.sin(vibU * Math.PI * 5.0) * Math.exp(-vibU * 2.4)
      : 0;
  const flex01 = drawBase + vibOsc;

  // 2. Trac-Trigger floating sled travel (0 -> -36.0 cm -> 0)
  const sledBack = seg(f, 0.0, 0.24);
  const sledReturn = seg(f, 0.66, 0.84);
  const sledDX = -36.0 * sledBack * (1 - sledReturn);

  // 3. 20" Carbon Bolt flight (clears string during cocking, seats [0.24..0.32], fires [0.36..0.60], resets [0.68..0.96])
  let boltDY = 0;
  if (f < 0.24) {
    boltDY = 0.56 * seg(f, 0.01, 0.08);
  } else if (f < 0.32) {
    boltDY = 0.56 * (1 - seg(f, 0.24, 0.31));
  }

  let boltDX = 0;
  let boltRX = 0;
  if (f >= 0.36 && f < 0.62) {
    if (f < 0.485) {
      // Driven strictly by unwinding bowstring from x_nock=-22.0 to x_nock=+14.0 (36.0 cm),
      // pushing broadhead tip from +28.8 past muzzlePos=+38.5 -> +64.8!
      boltDX = 36.0 * seg(f, 0.36, 0.485);
    } else {
      // Smooth aerodynamic coast forward
      boltDX = 36.0 + 26.0 * linearSeg(f, 0.485, 0.62);
    }
    boltRX = 12.56637 * linearSeg(f, 0.36, 0.62); // 2 full helical turns
  } else if (f >= 0.62 && f < 0.96) {
    const reset = seg(f, 0.68, 0.94);
    boltDX = 62.0 * (1 - reset);
    boltRX = 12.56637 * (1 - reset);
  }

  return { flex01, sledDX, boltDX, boltDY, boltRX };
}

/**
 * Real-time 60fps mechanical kinematics for Ravin R500 (`r500`) across f in [0, 1].
 */
export function computeR500FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  const { flex01, sledDX, boltDX, boltDY, boltRX } = computeR500CycleValues(f);
  const flexScaleX = 1.0 + flex01;
  const camRotRad = 310 * DEG * flex01;

  let dx = 0;
  let dy = 0;
  let dz = 0;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let scaleX = 1;

  switch (partId) {
    case 'r500_left_limbs':
    case 'r500_right_limbs':
    case 'r500_cam_axles':
    case 'r500_bowstring':
    case 'r500_power_cables': {
      scaleX = flexScaleX;
      break;
    }

    case 'r500_left_cam': {
      dx = -1.8 * flex01;
      dz = 5.05 * flex01;
      ry = camRotRad;
      break;
    }

    case 'r500_right_cam': {
      dx = -1.8 * flex01;
      dz = -5.05 * flex01;
      ry = -camRotRad;
      break;
    }

    case 'r500_versadrive_screw': {
      const spin = seg(f, 0.0, 0.24) - seg(f, 0.66, 0.84);
      rx = spin * Math.PI * 12;
      break;
    }

    case 'r500_trigger_sled': {
      dx = sledDX;
      break;
    }

    case 'r500_string_latch': {
      dx = sledDX;
      const jawOpen = seg(f, 0.32, 0.355) * (1 - seg(f, 0.84, 0.94));
      rz = 0.34 * jawOpen;
      break;
    }

    case 'r500_anti_dry_fire': {
      dx = sledDX;
      const adfLift = seg(f, 0.24, 0.31) * (1 - seg(f, 0.4, 0.52));
      dy = 0.14 * adfLift;
      rz = 0.28 * adfLift;
      break;
    }

    case 'r500_trigger_spring': {
      dx = sledDX;
      const springComp = seg(f, 0.32, 0.355) * (1 - seg(f, 0.84, 0.94));
      scaleX = 1.0 - 0.38 * springComp;
      break;
    }

    case 'r500_trigger_sear': {
      const trigPull = seg(f, 0.3, 0.345) * (1 - seg(f, 0.86, 0.96));
      dx = -0.35 * trigPull;
      rz = -0.03 * trigPull;
      break;
    }

    case 'r500_safety_selector': {
      const autoSafe = seg(f, 0.16, 0.23) * (1 - seg(f, 0.26, 0.31));
      rz = 0.44 * autoSafe;
      break;
    }

    case 'r500_retention_arm': {
      const holdLift = seg(f, 0.24, 0.31) * (1 - seg(f, 0.46, 0.54));
      dy = 0.15 * holdLift;
      rz = 0.025 * holdLift;
      break;
    }

    case 'r500_carbon_bolt': {
      dx = boltDX;
      dy = boltDY;
      rx = boltRX;
      break;
    }

    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes Ravin R500 500 FPS internal & external ballistics + 3-bolt quiver handoff:
 *  - Zero gunpowder effects (`spentCaseVisible: false`, `chamberFlashIntensity: 0`,
 *    `muzzlePlumeOpacity: 0`, `gasPortFlashIntensity: 0`).
 *  - `bulletPos` tracks the 100gr broadhead tip (`+28.8 -> +90.8`) during launch (`0.32..0.62`).
 *  - `nextRoundPos` starts cleanly at Quiver `Slot 0` (`[6.8, -2.05, 4.85]`) at `f = 0`, then
 *    lifts smoothly onto the flight rail staging `[3.4, 1.80, 0]` over `0.48..0.78` so `Slot 1`
 *    never collides as the quiver stack advances!
 */
export function computeR500BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const { boltDX, boltDY } = computeR500CycleValues(f);

  const bulletVisible = f >= 0.32 && f <= 0.62;
  const bulletX = 28.8 + boltDX;
  let streakLength = 0;
  if (f >= 0.36 && f <= 0.58) {
    streakLength = 6.2 * Math.sin(linearSeg(f, 0.36, 0.58) * Math.PI);
  }

  // Next bolt in quiver Slot 0 -> clears quiver along -Z [0.40..0.50] BEFORE feedWindow [0.52..0.66],
  // then lifts to rail staging [3.4, 1.80, 0] with zero tail-tilt collision against rising Slot 1!
  const zOut = seg(f, 0.4, 0.5);
  const yLift = seg(f, 0.44, 0.62);
  const xSlide = seg(f, 0.44, 0.68);
  const nextX = 6.8 + (3.4 - 6.8) * xSlide;
  const nextY = -2.05 + (1.8 - -2.05) * yLift;
  const nextZ = 4.85 * (1 - zOut);
  const nextRZ = 0;

  // Reserve bolt in Slot 1 advances upward toward Slot 0 (`0.52..0.66`)
  const uRes = seg(f, 0.52, 0.66);
  const resY = -3.6 + (-2.05 - -3.6) * uRes;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.8 + boltDY, 0],
    streakLength,
    spentCaseVisible: false,
    spentCasePos: [0, 0, 0],
    spentCaseRot: [0, 0, 0],
    spentCaseOpacity: 0,
    chamberFlashIntensity: 0,
    gasPortFlashIntensity: 0,
    gasPortPos: [26.2, 1.8, 0],
    muzzlePlumeScale: 0.01,
    muzzlePlumeOpacity: 0,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotY: 0,
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [6.8, resY, 4.85],
    reserveRoundRotY: 0,
  };
}

export const R500_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  r500_chassis: {
    albedoFile: 'r500_chassis_albedo.webp',
    normalFile: 'r500_chassis_normal.webp',
    roughnessFile: 'r500_chassis_roughness.webp',
    normalScale: 0.44,
  },
  r500_flight_rail: {
    albedoFile: 'r500_chassis_albedo.webp',
    normalFile: 'r500_chassis_normal.webp',
    roughnessFile: 'r500_chassis_roughness.webp',
    normalScale: 0.4,
  },
  r500_trigger_sled: {
    albedoFile: 'r500_chassis_albedo.webp',
    normalFile: 'r500_chassis_normal.webp',
    roughnessFile: 'r500_chassis_roughness.webp',
    normalScale: 0.42,
  },
  r500_foot_stirrup: {
    albedoFile: 'r500_chassis_albedo.webp',
    normalFile: 'r500_chassis_normal.webp',
    roughnessFile: 'r500_chassis_roughness.webp',
    normalScale: 0.48,
  },
  r500_left_limbs: {
    albedoFile: 'r500_limbs_albedo.webp',
    normalFile: 'r500_limbs_normal.webp',
    roughnessFile: 'r500_limbs_roughness.webp',
    normalScale: 0.52,
  },
  r500_right_limbs: {
    albedoFile: 'r500_limbs_albedo.webp',
    normalFile: 'r500_limbs_normal.webp',
    roughnessFile: 'r500_limbs_roughness.webp',
    normalScale: 0.52,
  },
  r500_left_cam: {
    albedoFile: 'r500_limbs_albedo.webp',
    normalFile: 'r500_limbs_normal.webp',
    roughnessFile: 'r500_limbs_roughness.webp',
    normalScale: 0.48,
  },
  r500_right_cam: {
    albedoFile: 'r500_limbs_albedo.webp',
    normalFile: 'r500_limbs_normal.webp',
    roughnessFile: 'r500_limbs_roughness.webp',
    normalScale: 0.48,
  },
  r500_scope: {
    albedoFile: 'r500_limbs_albedo.webp',
    normalFile: 'r500_limbs_normal.webp',
    roughnessFile: 'r500_limbs_roughness.webp',
    normalScale: 0.36,
  },
  r500_quiver_frame: {
    albedoFile: 'r500_limbs_albedo.webp',
    normalFile: 'r500_limbs_normal.webp',
    roughnessFile: 'r500_limbs_roughness.webp',
    normalScale: 0.46,
  },
  r500_buttstock: {
    albedoFile: 'r500_limbs_albedo.webp',
    normalFile: 'r500_limbs_normal.webp',
    roughnessFile: 'r500_limbs_roughness.webp',
    normalScale: 0.46,
  },
  r500_forend_grip: {
    albedoFile: 'r500_limbs_albedo.webp',
    normalFile: 'r500_limbs_normal.webp',
    roughnessFile: 'r500_limbs_roughness.webp',
    normalScale: 0.46,
  },
  r500_pistol_grip: {
    albedoFile: 'r500_limbs_albedo.webp',
    normalFile: 'r500_limbs_normal.webp',
    roughnessFile: 'r500_limbs_roughness.webp',
    normalScale: 0.46,
  },
};

export const R500_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'r500_chassis',
    weapon: 'r500' as WeaponId,
    titleCn: 'CNC 7075-T6 无托主框架、无摩擦光学桥、悬浮滑架与不锈钢脚蹬贴图组',
    partTag: 'B-01 / B-05 / B-06 / T-01 CNC MAINFRAME & TTFS',
    resolution: '2048 × 1024 px',
    summary:
      '专为 Ravin R500 航空锻铝无托架构烘焙的 2K 5 通道 ORM 贴图组：呈现深枪灰硬质阳极氧化铝的定向 CNC 铣削刀痕、两侧原厂激光标刻「RAVIN CROSSBOWS · R500 HEXCOIL」与「500 FPS · 15" POWER STROKE」、悬臂光学桥 MIL-STD-1913 导轨高光亮棱、Trac-Trigger 悬浮滑架激光刻标以及 17-4PH 不锈钢脚蹬菱形滚花踏面。',
    highlights: [
      '7075-T6 锻铝主框架双侧原厂激光铭文、序列号 RV-500-04819 与导槽磨损光泽',
      '无摩擦悬臂光学桥 MIL-STD-1913 皮卡汀尼齿槽精铣倒角分层',
      'Trac-Trigger 悬浮火控滑架激光标刻与 17-4PH 不锈钢菱形滚花脚蹬',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'r500_chassis_albedo.webp',
        note: 'sRGB · 硬质阳极铝灰 / 亮银导轨倒角 / 17-4PH拉丝不锈钢脚蹬',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'r500_chassis_normal.webp',
        note: 'Linear · CNC定向铣刀纹 + TTFS凹刻标牌 + 脚蹬菱形滚花法线',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'r500_chassis_roughness.webp',
        note: 'Linear · R:高度积分AO / G:磨光导轨(0.24)-铝框(0.37) / B:逐纹素金属度',
      },
    ],
  },
  {
    id: 'r500_limbs',
    weapon: 'r500' as WeaponId,
    titleCn: '3K斜纹碳纤维四片弓臂、青铜金HexCoil螺旋凸轮与1-8×24弩镜贴图组',
    partTag: 'H-02~05 / Q-01~02 3K CARBON, HEXCOIL CAMS & BDC SCOPE',
    resolution: '2048 × 1024 px',
    summary:
      '高还原度复合弓弩核心功能表面 2K 5 通道 ORM 贴图组：底栏编织 3K 2×2 斜纹碳纤维弓片与「7.6" → 3.6"」参数标刻；中栏呈现阳极氧化青铜金 HexCoil 360° 螺旋凸轮径向铣槽与「0°–310°」正时刻度；上栏集成 1–8×24 BDC 瞄准镜翡翠蓝宝光学增透物镜、VDI-27 握把防滑蚀纹及快拆三箭箭壶纹理。',
    highlights: [
      '3K 2×2 斜纹碳纤维编织几何起伏与高光树脂清漆法线质感',
      '青铜金阳极氧化 HexCoil 螺旋凸轮环形弦槽与 310° 正时刻度',
      '1–8×24 100码 BDC 瞄准镜多层翡翠青光学镀膜物镜 (0.065) 与 EDM 握把防滑纹',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'r500_limbs_albedo.webp',
        note: 'sRGB · 3K斜纹碳布 / 青铜金HexCoil凸轮 / 翡翠蓝宝瞄镜镀膜 / 石墨黑握把',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'r500_limbs_normal.webp',
        note: 'Linear · 3K编织纹理起伏 + 凸轮弦槽凹刻 + VDI-27握把蚀纹',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'r500_limbs_roughness.webp',
        note: 'Linear · R:高度积分AO / G:物镜(0.065)-凸轮(0.25)-碳布(0.32)-握把(0.70) / B:金属度',
      },
    ],
  },
  {
    id: 'r500_seamless_detail',
    weapon: 'r500' as WeaponId,
    titleCn: 'VersaDrive梯形螺杆、钛合金凸轮轴、防空放杠杆与500 FPS碳箭无缝细节贴图',
    partTag: '12 INTERNAL & BOLT PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为 VersaDrive 不锈钢梯形丝杠、双棘轮离合齿轮、双对开抓弦爪、防空放青铜互锁杠杆、3.5 磅匹配扳机传力杆、琴钢丝螺旋复位簧、压箭滚轮臂与 20 吋比赛碳箭及 100 格令三刃猎箭头提供微米级拉丝金属与自润滑复合材料细节。',
    highlights: [
      'VersaDrive 不锈钢梯形螺纹与钛合金主轴精细金属车削拉丝',
      '双抓弦爪、比赛级扳机连杆与防空放青铜杠杆机械接触表面',
      '覆盖其余全部 12 个精密核心内构与碳箭运动构件',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于VersaDrive丝杠/钛轴/抓弦爪/防空放杆/比赛扳机等',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 不锈钢与阳极铜机械表面微粗糙度油膜变化',
      },
      {
        kind: 'Normal',
        labelCn: '工程聚酰胺皮纹法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于安全橙保险拨杆/压箭轮/聚合物护件等',
      },
    ],
  },
];

export const R500_PLUGIN: WeaponRuntimePlugin = {
  id: 'r500' as WeaponId,
  partGroups: R500_PART_GROUPS,
  timelinePresets: R500_TIMELINE_PRESETS,
  parts: R500_PARTS,
  firingPhases: R500_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(R500_FIRING_PHASES, f),
  computeFiringKinematics: computeR500FiringKinematics,
  computeBallisticsState: computeR500BallisticsState,
  pbrBindings: R500_PBR_BINDINGS,
  pbrSuites: R500_PBR_SUITES,
};
