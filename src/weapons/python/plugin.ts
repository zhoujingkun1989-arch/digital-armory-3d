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

export const PYTHON_ID: WeaponId = 'python';
export const PYTHON_CALIBER: CaliberProfile = '357_magnum';

export const PYTHON_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '6英寸散热肋条枪管与靶用瞄具总成',
    nameEn: '6" Ventilated-Rib Barrel & Target Sight Assembly',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '锻造I型转轮框、侧盖板与胡桃木靶把',
    nameEn: 'Forged I-Frame, Sideplate & Walnut Target Grips',
    badgeColor: '#94a3b8',
  },
  {
    key: 'fire_control',
    nameZh: '手工调校双动/单动钟表火控与V形主簧',
    nameEn: 'Hand-Tuned DA/SA Clockwork & Folded V-Mainspring',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '左摆6发.357弹巢、棘轮退壳星与快速装弹器',
    nameEn: 'Swing-Out 6-Rd .357 Cylinder, Star & Speedloader',
    badgeColor: '#fb923c',
  },
];

export const PYTHON_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: '1955 年哈特福德原厂 Colt Python 6 英寸皇家烤蓝（Royal Blue）标准合拢态：三孔通风散热顶肋条、全长下护管退壳杆罩、6 发 .357 Magnum 凹槽弹巢与镶金跃马徽章美洲黑胡桃木靶把严丝合缝，12 点钟首膛与枪管内膛严格同轴。',
  },
  {
    id: 'field_strip',
    label: '摆出装弹与开盖',
    subLabel: '30% Swing-Out & Open',
    t: 0.3,
    desc: '后拉左侧泪滴形开锁卡笋将摇臂（Crane）与 6 发弹巢向左（-Z）整体摆出，HKS 旋转式快速装弹器同轴对准弹巢尾部；同步旋出右侧盖板螺钉揭开侧盖板并分离左右胡桃木护把，零遮挡呈现内部钟表级双动火控与折叠 V 形片状主簧。',
  },
  {
    id: 'sub_assembly',
    label: '二级火控与弹巢细拆',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '进一步分离 6 点棘轮退壳星、中心退壳簧、菱形滚花退壳顶杆与摇臂芯轴；同时将宽尾靶用击锤、击锤挂耳连杆、回弹保险杠杆、双阶拨轮棘爪（Hand）与下部止转笋从锻造 I 型转轮框内逐层展开。',
  },
  {
    id: 'full_exploded',
    label: '全零件军械爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 25 个精密机械构件完全展开：从 6 英寸 1:14" 右旋膛线枪管、下护管前定位柱塞、Accro 千分尺可调照门、机匣惯性击针到折叠 V 形主簧与 6 发空尖弹快速装弹器，全方位诠释「转轮手枪劳斯莱斯」的巅峰手工机械美学。',
  },
];

export const PYTHON_PARTS: WeaponPartSpec[] = [
  // ==================== 1. 6" VENTILATED-RIB BARREL & SIGHTS ('slide' · 5 parts) ====================
  {
    id: 'python_barrel',
    bomCode: 'U-01',
    nameZh: '6英寸三孔通风肋条全下护管枪管',
    calloutLabel: '6"通风肋条枪管',
    nameEn: '6" Ventilated-Rib & Full-Underlug Rifled Barrel',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [3.2, 0.8, 0] },
      { range: [0.32, 0.65], offset: [5.0, 0.8, 0] },
      { range: [0.65, 1.0], offset: [4.0, 0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [10.4, 3.66, 0],
    labelAppearAt: 0.05,
    roleTag: '152.4mm 固定靶管 · 三孔散热顶肋与满配重下护管',
    description:
      '科尔特 Python 闻名遐迩的标志性一体锻造 6 英寸（152.4 mm）重型比赛枪管：顶部镂铣 3 组矩形通风散热孔消除热气蜃景，顶面车有防眩光横纹；下方集成全长实心退壳杆护罩（Full Underlug）增加枪口前配重抑制 .357 马格南猛烈上跳；内膛尾部带 11° 坡口迫入锥（Forcing Cone），枪口车有内凹保护靶冠。',
  },
  {
    id: 'python_front_sight',
    bomCode: 'U-02',
    nameZh: '红嵌片斜坡销定靶用准星',
    calloutLabel: '红嵌片斜坡准星',
    nameEn: 'Pinned Red-Insert Ramped Target Front Sight',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [16.35, 3.82, 0],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [3.2, 2.2, 0] },
      { range: [0.32, 0.65], offset: [5.4, 1.8, 0] },
      { range: [0.65, 1.0], offset: [4.6, 1.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 36,
    labelAppearAt: 0.25,
    roleTag: 'Baughman 斜坡轮廓 · 高对比橙红瞄准嵌片',
    description:
      '横销锁定于通风肋条前端槽口内的经典 Baughman 斜坡片状准星，背面镶嵌高反差橙红有机玻璃导光片，在暗光靶场与深林背景下仍能瞬间捕获准星顶点。',
  },
  {
    id: 'python_rear_sight',
    bomCode: 'U-03',
    nameZh: 'Colt Accro 千分尺可调靶用照门',
    calloutLabel: 'Accro千分尺照门',
    nameEn: 'Colt Accro Micrometric Adjustable Target Rear Sight',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-2.15, 3.76, 0],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [-0.6, 1.8, 0] },
      { range: [0.32, 0.65], offset: [-0.8, 2.2, 0] },
      { range: [0.65, 1.0], offset: [-0.8, 2.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.22,
    roleTag: '高低/风偏精确微调 · 白框方形缺口照门',
    description:
      '沉入转轮框顶梁尾部的原厂 Colt Accro 精密比赛级照门：两侧设防撞护耳，方形缺口镶有清晰白色 U 形描边，顶部高低螺钉与右侧风偏螺钉均具备清脆棘轮分度手感。',
  },
  {
    id: 'python_barrel_pin',
    bomCode: 'U-04',
    nameZh: '枪管节套横向锁紧销',
    calloutLabel: '枪管横向锁紧销',
    nameEn: 'Frame-Boss Barrel Retention Cross-Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [3.05, 2.92, 0],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [1.6, 2.2, -2.4] },
      { range: [0.32, 0.65], offset: [2.2, 1.4, -1.6] },
      { range: [0.65, 1.0], offset: [1.8, 1.0, -1.4] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.42,
    roleTag: '防旋刚性锚定 · 锁定枪管尾端细牙螺纹',
    description:
      '过盈横穿 I 型转轮框前节套与枪管尾段螺纹肩部的硬化不锈钢定位销，确保在数万发高膛压 .357 Magnum 扭矩冲击下枪管与顶肋绝对不发生微米级偏转。',
  },
  {
    id: 'python_detent_plunger',
    bomCode: 'U-05',
    nameZh: '下护管退壳杆前定位柱塞与弹簧',
    calloutLabel: '退壳杆前锁柱塞',
    nameEn: 'Underlug Ejector-Rod Locking Detent Plunger & Spring',
    group: 'slide',
    material: 'stainless',
    assembledPos: [8.15, 1.17, 0],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [3.2, -1.2, 0] },
      { range: [0.32, 0.65], offset: [5.0, -1.4, 0] },
      { range: [0.65, 1.0], offset: [4.0, -1.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.44,
    roleTag: '前后双点锁死弹巢芯轴 · 提升同轴射击散布',
    description:
      '隐藏在全长下护管前端盲孔内的弹簧加载凹头柱塞：当弹巢合拢入框时，柱塞球窝精准扣入退壳杆前端锥头，与机匣尾部中心锁共同构成前后双支点同轴刚性闭锁。',
  },

  // ==================== 2. FORGED COLT I-FRAME, SIDEPLATE & GRIPS ('frame' · 6 parts) ====================
  {
    id: 'python_frame',
    bomCode: 'F-01',
    nameZh: '锻造科尔特I型转轮框主体',
    calloutLabel: '锻造I型转轮框',
    nameEn: 'Forged Colt I-Frame w/ Top Strap & Grip Tang',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0.2, -3.55, 0],
    labelAppearAt: 0.04,
    roleTag: '高强热锻合金钢骨架 · 皇家烤蓝镜面抛光',
    description:
      '基于科尔特大型 .41 号 I 型锻钢坯精密铣削而成的整体式闭框转轮座（零位基准件）：包含粗壮平顶梁（Top Strap）、半球形火药燃气挡盾（Recoil Shield）、椭圆扳机护圈、开放式右侧钟表火控腔及全尺寸一体握把龙骨，表面经手工毛毡轮粗细多道抛光后施以深邃如镜的哈特福德皇家热盐烤蓝（Royal Blue）。',
  },
  {
    id: 'python_sideplate',
    bomCode: 'F-02',
    nameZh: '手工研配右侧火控室盖板',
    calloutLabel: '右侧火控盖板',
    nameEn: 'Hand-Fitted Removable Right Lockwork Sideplate',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-4.42, 0.56, 0.54],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [0, 1.2, 3.6] },
      { range: [0.32, 0.65], offset: [-0.8, 0.6, 2.4] },
      { range: [0.65, 1.0], offset: [-0.8, 0.6, 2.2] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.14,
    roleTag: '封闭火控侧腔 · 开启 X-Ray / 剖视即刻透视内部机芯',
    description:
      '严丝合缝镶嵌在转轮框右侧的异形钢制火控室盖板：内侧带精密止口定位台肩为各火控转轴提供双端支撑；开启 X-Ray [X] 或军械纵剖面 [C] 时自动透视/剖开，完整呈现内部双动钟表机构与 V 形主簧咬合实况。',
  },
  {
    id: 'python_sideplate_screws',
    bomCode: 'F-03',
    nameZh: '窄槽烤蓝侧盖板紧固螺钉组 (×2)',
    calloutLabel: '烤蓝侧盖螺钉组',
    nameEn: 'Blued Gunsmith-Slotted Sideplate Screws (×2)',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-4.42, 0.56, 0.64],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [0, 1.2, 5.4] },
      { range: [0.32, 0.65], offset: [-0.8, 0.8, 3.6] },
      { range: [0.65, 1.0], offset: [-0.8, 0.8, 3.0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.18,
    roleTag: '等深沉头细牙螺钉 · 军械师平口改锥标准拆装',
    description:
      '两枚经独立热烤蓝与端面镜面打磨的细牙一字槽沉头螺钉，分别锁紧火控侧盖板后上方与前下角，拆解时严禁撬动盖板，须以木柄轻敲握把震松取下。',
  },
  {
    id: 'python_grip_left',
    bomCode: 'F-04',
    nameZh: '美洲黑胡桃木菱形格纹左靶把 (嵌24K金跃马章)',
    calloutLabel: '左胡桃木镶金护把',
    nameEn: 'Left Checkered American Walnut Grip w/ Gold Colt Medallion',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-8.05, -4.65, -0.82],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [-1.6, -2.0, -3.0] },
      { range: [0.32, 0.65], offset: [-1.8, -1.4, -2.4] },
      { range: [0.65, 1.0], offset: [-1.6, -1.2, -2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    labelAppearAt: 0.12,
    roleTag: '亚麻籽油浸润黑胡桃木 · 22线手工菱格纹与24K镀金徽章',
    description:
      '甄选北美黑胡桃木树瘤心材雕琢而成的第一代宽底靶用左护把：表面手工刻制尖盾框 22 LPI 精密防滑菱形格纹，上端齐平镶嵌一枚 24K 镀金浮雕「跃马（Rampant Colt）」圆章，有效分散马格南掌心冲击。',
  },
  {
    id: 'python_grip_right',
    bomCode: 'F-05',
    nameZh: '美洲黑胡桃木菱形格纹右靶把 (嵌24K金跃马章)',
    calloutLabel: '右胡桃木镶金护把',
    nameEn: 'Right Checkered American Walnut Grip w/ Gold Colt Medallion',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-8.05, -4.65, 0.82],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [-1.6, -2.0, 3.0] },
      { range: [0.32, 0.65], offset: [-1.8, -1.4, 2.4] },
      { range: [0.65, 1.0], offset: [-1.6, -1.2, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    labelAppearAt: 0.12,
    roleTag: '人体工学掌托弧面 · 黄铜贯通螺母锁紧',
    description:
      '与左护把成对选材配纹的黑胡桃木右靶把，中部嵌有黄铜防转螺母衬套，内腔精密挖槽包覆一体式握把钢龙骨与折叠 V 形片状主簧。',
  },
  {
    id: 'python_cylinder_latch',
    bomCode: 'F-06',
    nameZh: '科尔特后拉式泪滴防滑弹巢锁笋',
    calloutLabel: '后拉式弹巢解锁笋',
    nameEn: 'Colt Pull-Back Checkered Teardrop Cylinder Latch',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-3.35, 1.48, -0.74],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [-1.2, 2.6, -2.0] },
      { range: [0.32, 0.65], offset: [-1.4, 1.6, -1.6] },
      { range: [0.65, 1.0], offset: [-1.2, 1.2, -1.4] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.36,
    roleTag: '科尔特经典「向后拉」解锁 · 抽回弹巢中心锁定销',
    description:
      '与史密斯-韦森前推式截然不同，科尔特转轮采用标志性的「向后拉动」泪滴形竖纹拇指卡笋：向后拉动时同步抽回贯穿退壳星中心的锁定尾销，即可顺势将 6 发弹巢向左推出。',
  },

  // ==================== 3. HAND-TUNED DA/SA CLOCKWORK & V-MAINSPRING ('fire_control' · 8 parts) ====================
  {
    id: 'python_hammer',
    bomCode: 'FC-01',
    nameZh: '宽尾菱格防滑靶用双动/单动击锤',
    calloutLabel: '宽尾靶用击锤',
    nameEn: 'Wide Checkered Target Spur DA/SA Hammer',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-4.35, 0.58, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [-2.8, 3.8, 1.8] },
      { range: [0.32, 0.65], offset: [-2.4, 2.0, 1.2] },
      { range: [0.65, 1.0], offset: [-2.0, 1.6, 1.0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.24,
    roleTag: '单动挂机齿 + 双动铰接顶杆 · 平面敲击机匣击针',
    description:
      '侧面精细白钢抛光、顶部带加宽横格防滑马刺尾（Target Spur）的锻钢回转击锤：既可通过拇指压倒进入超轻清脆单动（SA）待击，也可直接扣扳机由铰接双动撑杆（DA Strut）平滑顶起完成双动连射；前端为平头打击面，专门敲击机匣内的浮动惯性击针。',
  },
  {
    id: 'python_hammer_stirrup',
    bomCode: 'FC-02',
    nameZh: '击锤尾部主簧铰接挂耳连杆',
    calloutLabel: '击锤主簧挂耳',
    nameEn: 'Pivoting Hammer Stirrup Mainspring Link',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-5.12, -0.45, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [-4.6, 1.8, 2.2] },
      { range: [0.32, 0.65], offset: [-3.2, 1.2, 1.6] },
      { range: [0.65, 1.0], offset: [-2.4, 1.0, 1.2] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.46,
    roleTag: '零摩擦滚动传力 · 消除双动行程末段叠簧硬点',
    description:
      '铰接悬挂于击锤后跟下方的双臂 U 形连杆，下端横销勾住折叠 V 形主簧上肢分叉钩：将击锤旋转圆弧转化为平顺轴向拉力，赋予 Python 如黄油般丝滑无顿挫的传奇双动扳机力曲线（Zero Stacking）。',
  },
  {
    id: 'python_trigger',
    bomCode: 'FC-03',
    nameZh: '纵向防滑槽弧面靶用扳机',
    calloutLabel: '防滑槽靶用扳机',
    nameEn: 'Grooved Curved Target Trigger & DA Sear',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-2.35, -1.05, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [0.8, -3.6, 2.1] },
      { range: [0.32, 0.65], offset: [1.0, -2.2, 1.4] },
      { range: [0.65, 1.0], offset: [1.0, -1.8, 1.2] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.28,
    roleTag: '联动拨轮棘爪、止转笋与击锤阻铁的总指挥枢',
    description:
      '指腹面铣有纵向引导沟槽的加宽靶用扳机：每一次扣压同步协调三路精密时序——前鼻压下止转笋解锁弹巢、后尾提拉拨轮棘爪推进弹巢旋转 60°、上阻铁面顶起并最终释放击锤！',
  },
  {
    id: 'python_mainspring',
    bomCode: 'FC-04',
    nameZh: '变截面折叠V形片状主簧',
    calloutLabel: '折叠V形片状主簧',
    nameEn: 'Hand-Tuned Tapered Folded V-Leaf Mainspring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-7.65, -4.85, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [-6.6, -3.6, 0] },
      { range: [0.32, 0.65], offset: [-4.2, -2.4, 0] },
      { range: [0.65, 1.0], offset: [-3.4, -2.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 52,
    labelAppearAt: 0.26,
    roleTag: '一簧双职 · 上肢驱动击锤打击 / 下肢顶推回弹保险复位',
    description:
      '哈特福德资深调枪匠逐片手工打磨调校的变厚度发夹式折叠 V 形弹簧钢片：不同于廉价螺旋压簧越压越重的「叠劲」现象，V 形长悬臂叶簧上肢为击锤提供恒定线性加速力，下肢同时向上托举回弹保险杠杆完成扳机与阻铁复位。',
  },
  {
    id: 'python_rebound_lever',
    bomCode: 'FC-05',
    nameZh: '科尔特专利回弹保险杠杆',
    calloutLabel: '回弹保险杠杆',
    nameEn: 'Colt Positive Safety Rebound Lever',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-5.55, -1.72, -0.04],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [-1.4, -1.8, 2.2] },
      { range: [0.32, 0.65], offset: [-1.8, -1.6, 1.2] },
      { range: [0.65, 1.0], offset: [-1.6, -1.4, 1.0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.44,
    roleTag: '自动顶退击锤脱离击针 · 机械跌落绝对防走火',
    description:
      '铰接在握把上根部并受 V 形主簧下肢托举的粗壮 L 形钢杠杆：只要射手松开扳机，回弹杠杆上部凸台即强行将击锤向后顶退数毫米并卡入刚性保险台肩，即使手枪意外跌落砸击击锤马刺也绝不可能触碰击针。',
  },
  {
    id: 'python_cylinder_bolt',
    bomCode: 'FC-06',
    nameZh: '下部弹巢止转锁笋与复位片簧',
    calloutLabel: '弹巢止转锁笋',
    nameEn: 'Pivoting Cylinder Locking Stop Bolt & Spring',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-0.85, -1.02, 0.12],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [2.8, -2.2, 2.1] },
      { range: [0.32, 0.65], offset: [2.2, -1.6, 1.4] },
      { range: [0.65, 1.0], offset: [1.8, -1.4, 1.2] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.42,
    roleTag: '6点钟精准入槽锁死 · 击发前实现金库级闭锁',
    description:
      '位于转轮框底桥槽口内的回转止转笋：扣扳机初段由扳机前鼻短暂压下解锁以便弹巢旋进，当下一发弹膛即将转至 12 点钟同轴位时提前弹起滑入引导槽并「咔哒」卡死止转缺口，保证底火点燃前弹膛与枪管 100% 严密对正。',
  },
  {
    id: 'python_hand',
    bomCode: 'FC-07',
    nameZh: '双阶分度拨轮棘爪 (Hand)',
    calloutLabel: '双阶拨轮棘爪',
    nameEn: 'Two-Step Vertical Indexing Ratchet Pawl (Hand)',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-2.48, 0.18, -0.14],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [-0.6, -0.6, -2.1] },
      { range: [0.32, 0.65], offset: [-1.0, -0.8, -1.4] },
      { range: [0.65, 1.0], offset: [-1.0, -0.8, -1.2] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.42,
    roleTag: '科尔特独门上下双阶爪尖 · 推进60°并在击发瞬时双向夹死弹巢',
    description:
      '科尔特 Python 超高精度的核心秘密：棘爪顶端磨有精密高低双台阶——上台阶负责向上顶推 6 齿退壳星完成 60° 分度旋转；在击锤落下的瞬间，下台阶继续死死顶住棘轮齿面，与底部止转笋形成一正一反「零间隙刚性互锁（Bank-Vault Lockup）」！',
  },
  {
    id: 'python_firing_pin',
    bomCode: 'FC-08',
    nameZh: '机匣嵌装浮动惯性击针与回位簧',
    calloutLabel: '机匣惯性击针组',
    nameEn: 'Frame-Mounted Inertial Firing Pin, Bushing & Spring',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-2.52, 2.35, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [0.4, 2.6, 1.8] },
      { range: [0.32, 0.65], offset: [0.4, 2.0, 1.4] },
      { range: [0.65, 1.0], offset: [0.4, 1.6, 1.2] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.44,
    roleTag: '短于通道的惯性击针 · 配合钢制镶套承受马格南膛压',
    description:
      '同轴嵌装在火药挡盾正中央硬化钢衬套内的阶梯形惯性击针与同心螺旋回位簧：击针总长短于挡盾孔深，唯有当扳机扣到底移开回弹保险且击锤全速敲击时才能凭惯性刺出点燃 .357 底火，击发后即刻缩回封平镜面。',
  },

  // ==================== 4. SWING-OUT 6-CHAMBER CYLINDER & SPEEDLOADER ('magazine' · 6 parts) ====================
  {
    id: 'python_crane',
    bomCode: 'M-01',
    nameZh: '左摆式弹巢摇臂 (Crane / Yoke)',
    calloutLabel: '左摆弹巢摇臂',
    nameEn: 'Swing-Out Cylinder Crane Yoke & Spindle Arbor',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [2.22, 0.28, -0.28],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [3.8, -2.2, -3.2] },
      { range: [0.32, 0.65], offset: [2.6, -1.4, -1.8] },
      { range: [0.65, 1.0], offset: [2.2, -1.2, -1.6] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.22,
    roleTag: '精密平行双轴铰链 · 支撑弹巢向左平滑摆出装退弹',
    description:
      '精密锻造并手工校直的 L 形转轮摇臂：下轴管插入机匣前下铰链孔，上部空心芯轴（Spindle Arbor）向后贯穿 6 发弹巢中心，使射手能够向左平稳摆出弹巢完成一键同时顶退 6 枚空弹壳与快速装填。',
  },
  {
    id: 'python_cylinder',
    bomCode: 'M-02',
    nameZh: '6发减重凹槽.357马格南弹巢',
    calloutLabel: '6发.357凹槽弹巢',
    nameEn: '6-Chamber Fluted .357 Magnum Revolving Cylinder',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [0.1, 1.17, 0],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [0, 0.2, -5.2] },
      { range: [0.32, 0.65], offset: [0, 0.4, -2.2] },
      { range: [0.65, 1.0], offset: [0, 0.4, -2.0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 1.97, 0],
    labelAppearAt: 0.06,
    roleTag: 'Ø39.4mm 热处理铬钼钢 · 6组R=11.8mm同轴弹膛与止转槽',
    description:
      '兼具弹匣与高压弹膛双重职能的特种电炉铬钼钒合金钢 6 发弹巢（外径 39.4 mm）：沿半径 11.8 mm 分度圆精镗 6 个带底缘沉孔的 .357 Magnum（兼容 .38 Special）镜面弹膛，12 点钟首膛（Y = 2.35 cm）与 6 英寸枪管内膛严格同轴；外壁铣有 6 道经典减重凹槽与 6 组带导坡的止转缺口，前端倒有顺滑入套斜角。',
  },
  {
    id: 'python_extractor_star',
    bomCode: 'M-03',
    nameZh: '6齿精密分度棘轮退壳星与芯管',
    calloutLabel: '6齿棘轮退壳星',
    nameEn: '6-Point Precision Ratchet Extractor Star & Stem',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [-0.65, 1.17, 0],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [-4.4, 0.2, -5.2] },
      { range: [0.32, 0.65], offset: [-2.8, 0.4, -2.2] },
      { range: [0.65, 1.0], offset: [-2.4, 0.4, -2.0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.28,
    roleTag: '6瓣抱缘退壳星盘 + 中央6齿精密分度棘轮',
    description:
      '镶嵌在弹巢尾端沉槽内的星形精密机构：外圈 6 瓣弧形星爪托住 .357 凸缘弹壳底缘，后推退壳杆时将 6 枚膨胀空弹壳同步顶出弹膛；中央凸起 6 枚手工修磨的不对称棘轮斜齿，接受拨轮棘爪（Hand）推顶驱动弹巢顺时针（从射手视角）精确步进 60°。',
  },
  {
    id: 'python_extractor_rod',
    bomCode: 'M-04',
    nameZh: '菱形滚花头不锈钢退壳顶杆',
    calloutLabel: '滚花退壳顶杆',
    nameEn: 'Diamond-Knurled Front Ejector Rod',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [4.95, 1.17, 0],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [3.2, 0.2, -5.2] },
      { range: [0.32, 0.65], offset: [4.6, 0.4, -2.2] },
      { range: [0.65, 1.0], offset: [3.8, 0.4, -2.0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.34,
    roleTag: '全封闭护罩保护 · 手掌后拍一键同步退壳',
    description:
      '旋接于退壳星芯管前端并收纳在枪管全长下护罩槽内的磨光不锈钢顶杆：前端膨大头车有防滑交叉菱形滚花与中心定位锥窝，摆出弹巢后枪口朝上向后拍击顶杆，即可干净利落地抛出全部 6 枚空弹壳。',
  },
  {
    id: 'python_extractor_spring',
    bomCode: 'M-05',
    nameZh: '弹巢中心螺旋退壳复位簧与挡圈',
    calloutLabel: '中心螺旋退壳簧',
    nameEn: 'Helical Center Extractor Return Spring & Collar',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [3.65, 1.17, 0],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [0.2, 2.8, -5.2] },
      { range: [0.32, 0.65], offset: [1.8, 2.0, -2.2] },
      { range: [0.65, 1.0], offset: [1.6, 1.6, -2.0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.38,
    roleTag: '高劲度琴钢丝螺旋簧 · 顶退空壳后瞬时拉回退壳星归位',
    description:
      '套装在摇臂芯轴内腔与退壳杆之间的螺旋压簧（支持 GPU 等线径实时弹簧变形）：退壳动作松手后立即将退壳星拉回弹巢尾端定位销内齐平贴合，并在实弹击发瞬间提供轴向闭锁缓冲。',
  },
  {
    id: 'python_speedloader',
    bomCode: 'M-06',
    nameZh: 'HKS旋转式6发.357马格南快速装弹器',
    calloutLabel: '6发快速装弹器',
    nameEn: 'HKS-Style 6-Round Rotary .357 Magnum Speedloader',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [4.2, -6.2, -2.2],
    explodeSteps: [
      { range: [0.04, 0.3], offset: [-13.6, 7.57, -3.0] },
      { range: [0.32, 0.65], offset: [-4.6, 0.4, -2.2] },
      { range: [0.65, 1.0], offset: [-3.8, 0.4, -2.0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.16,
    roleTag: '同步预置6发158gr空尖弹 · 顺时针一拧瞬间全装填',
    description:
      '经典的 HKS 586-A 型阳极氧化铝旋转锁珠式快速装弹器：按 11.8 mm 分度圆同心卡持 6 发 .357 Magnum 158 格令被甲空尖弹（JHP，镀镍/黄铜弹壳交替展示）；弹巢摆出退壳后将其对准 6 孔推入，顺时针轻拧尾部滚花旋钮即可在 1.5 秒内完成满巢重装！',
  },
];

export const PYTHON_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'phase_1',
    stepNum: '01',
    shortLabel: '双动拨轮待击',
    title: '扣压扳机压下止转笋，双阶棘爪上推退壳星驱动弹巢精确旋转 60°',
    range: [0.0, 0.14],
    description:
      '射手食指平滑扣动靶用扳机：扳机前鼻率先压下底部止转笋（Bolt）脱离弹巢缺口解锁；与此同时，后侧双阶棘爪（Hand）垂直上移顶推 6 齿退壳星，带动 6 发弹巢绕 X 轴顺滑旋转 60°（π/3），双动撑杆同步向后仰起宽尾击锤并弯曲压缩握把内的折叠 V 形片状主簧。',
  },
  {
    id: 'phase_2',
    stepNum: '02',
    shortLabel: '金库闭锁击发',
    title: '止转笋提前弹入缺口实现双向零间隙闭锁，击锤脱钩敲击惯性击针',
    range: [0.14, 0.24],
    description:
      '在击锤到达满待击临界点前，底部止转笋在片簧驱动下清脆弹入下一发弹膛的 6 点钟止转槽，配合棘爪第二台阶从反方向死死抵住退壳星齿，达成科尔特独步天下的「金库级满闭锁（Bank-Vault Full-Cock Lockup）」；随即双动阻铁清脆解脱，V 形主簧释放能量驱动击锤高速前摆，正面敲击机匣惯性击针刺破底火！',
  },
  {
    id: 'phase_3',
    stepNum: '03',
    shortLabel: '马格南燃爆出膛',
    title: '241 MPa 峰值膛压迸发转轮隙火光，158gr 弹头经迫入锥加速冲出 6" 枪口',
    range: [0.24, 0.38],
    description:
      '.357 Magnum 慢燃双基球形发射药猛烈燃爆产生 241 MPa（35,000 PSI）高压：158 格令紫铜被甲空尖弹跨越 0.15 mm 弹巢前间隙挤入 11° 枪管迫入锥（伴随短暂的转轮隙横向高压火光），咬合 6 条 1:14" 右旋靶用膛线加速至 385 m/s 呼啸冲出 6 英寸内凹靶冠。',
  },
  {
    id: 'phase_4',
    stepNum: '04',
    shortLabel: '满下护管抑跳',
    title: '全长实心下护管前配重抑制马格南枪口上跳，空弹壳留驻弹巢密封闭气',
    range: [0.38, 0.52],
    description:
      '强劲后坐冲量沿一体锻造 I 型转轮框与宽底胡桃木靶把传导至射手掌心，枪管下方全长退壳杆护罩（Full Underlug）的前置转动惯量显著压制枪口上跳；不同于自动手枪抛壳，膨胀后的直壁凸缘黄铜空弹壳稳稳留驻弹巢内（零抛壳干扰）。',
  },
  {
    id: 'phase_5',
    stepNum: '05',
    shortLabel: '惯性击针缩回',
    title: '膛压消退后同心螺旋回位簧推回浮动惯性击针，镜面恢复齐平',
    range: [0.52, 0.68],
    description:
      '随着膛内燃气泄压与击锤压力回落，火药挡盾衬套内的同心小螺旋簧立即将阶梯形惯性击针向后推离底火凹坑，使火药挡盾前镜面恢复绝对光滑，确保下一发弹巢旋转时底火绝不刮擦击针尖。',
  },
  {
    id: 'phase_6',
    stepNum: '06',
    shortLabel: '回弹保险锁止',
    title: '松开扳机，V 形主簧下肢顶起回弹保险杠杆将击锤强制退回安全台肩',
    range: [0.68, 0.86],
    description:
      '射手松开食指，折叠 V 形片状主簧的下肢向上顶转科尔特专利回弹保险杠杆（Rebound Lever），其上部凸轮面强制将击锤向后顶退脱离击针尾部并刚性垫锁在保险台肩上，彻底杜绝意外撞击走火。',
  },
  {
    id: 'phase_7',
    stepNum: '07',
    shortLabel: '棘爪下滑复位',
    title: '靶用扳机平稳回位，双阶棘爪下滑越过下一枚星齿进入次发待命',
    range: [0.86, 1.0],
    description:
      '在回弹杠杆前臂推动下，靶用扳机顺畅回到前止点，带动双阶拨轮棘爪沿导槽垂直下滑，弹性爪尖轻巧滑入 6 齿退壳星下一枚斜齿下方，6 发弹巢保持在已转过的 +60° 新膛位闭锁待发。',
  },
];

/**
 * Real-time 60fps mechanical kinematics for Colt Python 6" (`.357 Magnum`) across f ∈ [0, 1]:
 *  - `python_cylinder` & `python_extractor_star` index smoothly by exact `+60°` (`+Math.PI / 3`)
 *    around `+X` over `[0.03, 0.15]` and hold `+60°` cleanly through `f = 1.0` (`endpointJump = 0`,
 *    and C_6 6-fold rotational symmetry makes the `1.0 -> 0.0` loop wrap visually seamless!).
 *  - `python_cylinder_bolt` drops out of the 6 o'clock notch `[0.00, 0.04]` and snaps back into
 *    full-cock lockup `[0.135, 0.165]` *before* hammer fall (`ignitionF = 0.20`).
 *  - `python_hand` rises `[0.02, 0.15]` to drive the ratchet star and retracts `[0.76, 0.94]`.
 *  - `python_hammer` cocks rearward `[0.01, 0.165]`, falls sharply `[0.17, 0.205]`, and is cammed
 *    back to the safety rebound block by `python_rebound_lever` over `[0.68, 0.84]`.
 *  - `python_mainspring` (`w = 3` flex) bends `scaleX: 1.0 -> 1.28 -> 1.0`, and `python_extractor_spring`
 *    (`w = 1` helical X-axis) cushions lockup/recoil `scaleX: 1.0 -> 0.88 -> 1.0`.
 */
export function computePythonFiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  const dz = 0;
  let rx = 0;
  const ry = 0;
  let rz = 0;
  let scaleX = 1;

  // Master 60° (π/3) cylinder indexing profile & DA cocking/release envelopes
  const indexStep = seg(f, 0.03, 0.15);
  const trigPull = seg(f, 0.0, 0.16) * (1 - seg(f, 0.72, 0.94));
  const hammerCock = seg(f, 0.01, 0.165);
  const hammerFall = seg(f, 0.17, 0.205);
  const hammerRebound = seg(f, 0.68, 0.84);

  switch (partId) {
    case 'python_cylinder':
    case 'python_extractor_star': {
      // Exact 60° (+π/3 rad) clockwise step around +X axis, held locked from f=0.15 to f=1.0!
      rx = (Math.PI / 3) * indexStep;
      break;
    }

    case 'python_cylinder_bolt': {
      // Drops down out of 6 o'clock cylinder stop notch [0.00..0.04], snaps up into next notch [0.135..0.165]!
      const boltDrop = seg(f, 0.0, 0.04) * (1 - seg(f, 0.135, 0.165));
      dy = -0.18 * boltDrop;
      rz = -0.22 * boltDrop;
      break;
    }

    case 'python_hand': {
      // Vertical indexing pawl rises to rotate star 60°, holds bank-vault lockup, then retracts on trigger reset
      const handRise = seg(f, 0.015, 0.15) * (1 - seg(f, 0.75, 0.94));
      dy = 0.52 * handRise;
      dx = 0.06 * Math.sin(handRise * Math.PI);
      break;
    }

    case 'python_trigger': {
      // Smooth curved DA trigger pull (+rz rotates lower shoe rearward -X around [-2.35, -1.05])
      rz = 0.38 * trigPull;
      break;
    }

    case 'python_hammer': {
      // Cocks rearward (+0.72 rad) -> snaps forward (-0.24 rad past rest to strike firing pin) ->
      // cammed back +0.24 rad onto positive rebound safety block!
      rz = 0.72 * hammerCock - 0.96 * hammerFall + 0.24 * hammerRebound;
      break;
    }

    case 'python_hammer_stirrup': {
      // Pulled downward by cocking hammer heel, snaps back up on hammer fall
      const stirrupTension =
        hammerCock - 1.15 * hammerFall + 0.15 * hammerRebound;
      dy = -0.34 * stirrupTension;
      dx = -0.06 * stirrupTension;
      break;
    }

    case 'python_mainspring': {
      // GPU flex deformation (`w = 3`): scaleX ranges 1.00 -> 1.28 -> 0.97 -> 1.00 (delta = 0.31 > 0.08!)
      const leafLoad =
        0.28 * hammerCock - 0.31 * hammerFall + 0.03 * hammerRebound;
      scaleX = 1 + leafLoad;
      break;
    }

    case 'python_rebound_lever': {
      // Depressed slightly during full trigger pull, then cams upward to push hammer to safety block
      const depress = seg(f, 0.04, 0.17) * (1 - seg(f, 0.68, 0.86));
      rz = -0.18 * depress;
      break;
    }

    case 'python_firing_pin': {
      // Struck by hammer at ignitionF = 0.20, darts +0.24 cm forward to indent .357 Boxer primer,
      // then retracts cleanly via concentric return spring over [0.52, 0.66]!
      const strike = seg(f, 0.195, 0.212) * (1 - seg(f, 0.52, 0.66));
      dx = 0.24 * strike;
      break;
    }

    case 'python_extractor_spring': {
      // Helical X-axis spring (`w = 1`, front collar pinned at local +1.35): axial headspace/recoil cushion
      // dipping to 0.88 during lockup & 241 MPa .357 Magnum breech impulse (delta = 0.12 > 0.08!)
      const cushion = seg(f, 0.15, 0.26) * (1 - seg(f, 0.42, 0.56));
      scaleX = 1 - 0.12 * cushion;
      const pinAnchorX = 1.35;
      dx = pinAnchorX * (1 - scaleX);
      break;
    }

    // python_barrel (fixed barrel!), python_frame, sights, crane & grips remain stationary
    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes .357 Magnum (158gr JHP, 241 MPa SAAMI, 385 m/s from 6" barrel) internal & external ballistics:
 *  - Bullet sits in indexed 12 o'clock chamber (`[0.85, 2.35, 0]`), ignites at `f = 0.20`, jumps forcing cone
 *    at `X = 2.21`, accelerates down 6" (`15.24 cm`) barrel, and exits muzzle crown `X = 17.42` at `f = 0.34`!
 *  - `spentCaseVisible: false` across 100% of `f ∈ [0, 1]` (revolvers retain spent brass inside the cylinder!).
 *  - Brief radial cylinder-gap flash (`gasPortFlashIntensity`) at forcing-cone gap `[2.20, 2.35, 0]`.
 *  - `nextRoundPos` & `reserveRoundPos` ride inside the revolving cylinder chambers along `R = 1.18 cm`!
 */
export function computePythonBallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const indexStep = seg(f, 0.03, 0.15);

  // 1. 158gr .357 Magnum Jacketed Hollow-Point Projectile along bore axis (Y = 2.35, Z = 0)
  const bulletVisible = f < 0.48;
  let bulletX = 0.85;
  let streakLength = 0;

  if (f >= 0.205 && f < 0.34) {
    const u = Math.pow(linearSeg(f, 0.205, 0.34), 1.32);
    bulletX = 0.85 + (17.42 - 0.85) * u; // Exits 6" barrel crown at X = +17.42 (`muzzleExitF = 0.34`)
    streakLength = 3.4 * u;
  } else if (f >= 0.34 && f < 0.48) {
    const u = linearSeg(f, 0.34, 0.48);
    bulletX = 17.42 + 48.0 * u;
    streakLength = 8.4 * (1 - u * 0.45);
  }

  // 2. Chamber Flash & Signature Barrel-Cylinder Gap Flash (`[2.20, 2.35, 0]`) + Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.195 && f <= 0.28) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.195, 0.28) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.215 && f <= 0.295) {
    gasPortFlashIntensity =
      Math.sin(linearSeg(f, 0.215, 0.295) * Math.PI) * 0.92;
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.325 && f <= 0.43) {
    const u = linearSeg(f, 0.325, 0.43);
    muzzlePlumeScale = 0.46 + 1.38 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.88;
  }

  // 3. Revolving .357 Magnum Cartridges inside 6-Chamber Cylinder (R = 1.18 cm around [0.10, 1.17, 0])!
  //    Chamber #2 rotates from -60° into top dead center 0° ([0.10, 2.35, 0]) during [0.03, 0.15]!
  const angNext = -Math.PI / 3 + (Math.PI / 3) * indexStep;
  const nextY = 1.17 + Math.cos(angNext) * 1.18;
  const nextZ = Math.sin(angNext) * 1.18;

  const angRes = (-2 * Math.PI) / 3 + (Math.PI / 3) * indexStep;
  const resY = 1.17 + Math.cos(angRes) * 1.18;
  const resZ = Math.sin(angRes) * 1.18;

  return {
    bulletVisible,
    bulletPos: [bulletX, 2.35, 0],
    streakLength,
    spentCaseVisible: false,
    spentCasePos: [0.1, 2.35, 0],
    spentCaseRot: [0, 0, 0],
    spentCaseOpacity: 0,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [2.2, 2.35, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [0.1, nextY, nextZ],
    nextRoundRotZ: 0,
    reserveRoundPos: [0.1, resY, resZ],
  };
}

export const PYTHON_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  python_barrel: {
    albedoFile: 'python_frame_albedo.webp',
    normalFile: 'python_frame_normal.webp',
    roughnessFile: 'python_frame_roughness.webp',
    normalScale: 0.42,
  },
  python_frame: {
    albedoFile: 'python_frame_albedo.webp',
    normalFile: 'python_frame_normal.webp',
    roughnessFile: 'python_frame_roughness.webp',
    normalScale: 0.38,
  },
  python_sideplate: {
    albedoFile: 'python_frame_albedo.webp',
    normalFile: 'python_frame_normal.webp',
    roughnessFile: 'python_frame_roughness.webp',
    normalScale: 0.34,
  },
  python_cylinder: {
    albedoFile: 'python_frame_albedo.webp',
    normalFile: 'python_frame_normal.webp',
    roughnessFile: 'python_frame_roughness.webp',
    normalScale: 0.36,
  },
  python_grip_left: {
    albedoFile: 'python_walnut_albedo.webp',
    normalFile: 'python_walnut_normal.webp',
    roughnessFile: 'python_walnut_roughness.webp',
    normalScale: 0.62,
  },
  python_grip_right: {
    albedoFile: 'python_walnut_albedo.webp',
    normalFile: 'python_walnut_normal.webp',
    roughnessFile: 'python_walnut_roughness.webp',
    normalScale: 0.62,
  },
};

export const PYTHON_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'python_frame',
    weapon: PYTHON_ID,
    titleCn: '科尔特哈特福德皇家烤蓝镜面钢、通风肋条与6发凹槽弹巢贴图组',
    partTag: 'U-01 / F-01 / F-02 / M-02 ROYAL BLUE STEEL',
    resolution: '2048 × 1024 px',
    summary:
      '专为 1955 年哈特福德原厂 Colt Python 6 英寸转轮手枪烘焙的 2K 5 通道 ORM 贴图组：完美复现经多道手工毛毡轮抛光后的深邃普鲁士午夜蓝热盐烤蓝（Colt Royal Blue，粗糙度 G≈0.15，金属度 B≈0.96），与枪管顶部防眩光喷砂横纹肋条（G≈0.56）形成鲜明对比；精准铭刻左管壁「PYTHON .357 / * .357 MAGNUM CTG. *」、右管壁哈特福德厂址滚印、左机匣跃马徽标 + VP 检验戳，以及 6 发凹槽弹巢周向止转拖拽亮环。',
    highlights: [
      '手工镜面抛光哈特福德皇家烤蓝（Royal Blue）与防眩光横纹顶肋物理粗糙度分层',
      '枪管双侧 PYTHON .357 与 HARTFORD, CONN. U.S.A. 原厂衬线滚印及机匣跃马刻印',
      'C6 六重对称弹巢周向止转笋摩擦亮线（Turn Line）与凹槽棱边轻微银白磨损',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'python_frame_albedo.webp',
        note: 'sRGB · 深邃皇家午夜烤蓝镜面钢 / 银亮滚印铭文 / 弹巢止转摩擦环',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'python_frame_normal.webp',
        note: 'Linear · 通风顶肋横向防眩锯齿 + 原厂凹刻滚印斜坡 + 极细手工抛光丝纹',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'python_frame_roughness.webp',
        note: 'Linear · R:凹刻与止转槽AO / G:镜面烤蓝(0.15)-防眩顶肋(0.56) / B:高纯度锻钢金属度(0.96)',
      },
    ],
  },
  {
    id: 'python_walnut',
    weapon: PYTHON_ID,
    titleCn: '北美黑胡桃木树瘤靶把、22线手工菱格纹与24K金跃马圆章贴图组',
    partTag: 'F-04 / F-05 AMERICAN WALNUT & GOLD MEDALLION',
    resolution: '2048 × 1024 px',
    summary:
      '真实还原第一代 Colt Python 宽底靶用护把的温润质感：基底采用亚麻籽油手工浸润的北美黑胡桃木心材树瘤纹理（金属度 B=0.0，缎面油膜粗糙度 G≈0.58），中部雕刻尖盾框 22 LPI 锐利手工菱形防滑金字塔纹（G≈0.72 + 深谷环境光遮蔽），上部精准镶嵌 24K 镀金浮雕跃马徽章（金属度 B=0.92，抛光金面粗糙度 G≈0.24）与黄铜贯通螺母衬套。',
    highlights: [
      '温润亚麻籽油北美黑胡桃木导管棕眼、山纹树瘤与手工双线切边尖盾防滑框',
      '22 LPI 精密手工菱形格纹法线金字塔浮雕与沟槽积分 AO 阴影',
      '镶嵌式 24K 金「COLT 跃马」圆章（B:0.92 金属度 / G:0.24 粗糙度）与木质非金属（B:0.0）硬边界分离',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'python_walnut_albedo.webp',
        note: 'sRGB · 暖棕黑胡桃木心材山纹 + 哑光原木菱格区 + 24K金跃马浮雕圆章',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'python_walnut_normal.webp',
        note: 'Linear · 纵向胡桃木导管气孔 + 22线菱形金字塔防滑齿 + 跃马高浮雕边缘',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'python_walnut_roughness.webp',
        note: 'Linear · R:菱格沟槽AO / G:镀金章(0.24)-油浸胡桃木(0.58)-菱格(0.72) / B:镀金(0.92) vs 胡桃木(0.0)',
      },
    ],
  },
  {
    id: 'python_seamless_detail',
    weapon: PYTHON_ID,
    titleCn: '手工白钢双动钟表火控、折叠V形主簧与快速装弹器无缝细节贴图',
    partTag: '19 DA/SA CLOCKWORK & CYLINDER PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为宽尾靶用击锤、击锤主簧挂耳、科尔特回弹保险杠杆、双阶分度拨轮棘爪、6 齿精密棘轮退壳星、折叠 V 形片状弹簧钢主簧、滚花退壳顶杆以及 HKS 旋转装弹器提供微米级手工油石推磨白钢拉丝与弹簧油膜细节。',
    highlights: [
      '手工油石抛光不锈钢击锤侧面、双阶棘爪与 6 齿退壳星微拉丝光泽',
      '淬火回火折叠 V 形片状主簧与中心螺旋退壳簧枪油保护膜微起伏',
      '覆盖其余全部 19 个转轮精密机械构件',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '精密白钢推磨拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于宽尾靶用击锤/回弹保险杠杆/双阶拨轮棘爪/6齿退壳星/滚花退壳杆等',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝与枪油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 烤蓝钢、白钢与黄铜弹壳表面微粗糙度油膜起伏',
      },
      {
        kind: 'Normal',
        labelCn: '阳极旋钮微细纹理法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于瞄具嵌片与装弹器滚花护圈细部微凹凸',
      },
    ],
  },
];

export const PYTHON_PLUGIN: WeaponRuntimePlugin = {
  id: PYTHON_ID,
  partGroups: PYTHON_PART_GROUPS,
  timelinePresets: PYTHON_TIMELINE_PRESETS,
  parts: PYTHON_PARTS,
  firingPhases: PYTHON_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(PYTHON_FIRING_PHASES, f),
  computeFiringKinematics: computePythonFiringKinematics,
  computeBallisticsState: computePythonBallisticsState,
  pbrBindings: PYTHON_PBR_BINDINGS,
  pbrSuites: PYTHON_PBR_SUITES,
};
