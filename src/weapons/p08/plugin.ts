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
  P08_BORE_Y,
  P08_FRONT_PIN_X0,
  P08_GRIP_ANGLE_RAD,
  P08_GRIP_SPRING_ROT_Z,
  P08_REAR_AXLE_X0,
  P08_TOGGLE_LINK_LEN,
  P08_TOGGLE_OVERCENTER_RAD,
  P08_TOGGLE_SPAN_D0,
} from './meshes/p08Geometries';

export const P08_ID = 'p08' as unknown as WeaponId;
export const P08_CALIBER: CaliberProfile = '9mm_para';

/** Peak signed knee-joint angle above bore centerline (+0.90784 rad = +52.02 deg -> -4.20 cm breech stroke!) */
const P08_KNEE_PEAK_ALPHA_RAD = Math.acos(
  (P08_TOGGLE_SPAN_D0 - (4.2 - 0.65)) / (2 * P08_TOGGLE_LINK_LEN)
);

export const P08_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '4英寸锥形枪管、叉形节套与肘节闭锁自动机',
    nameEn: '4" Tapered Barrel, Forked Extension & Knee-Joint Toggle Train',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: '锻造曲坡下机匣、侧锁板与欧洲胡桃木握把',
    nameEn: 'Forged Curved-Ramp Frame, Sideplate & Walnut Grips',
    badgeColor: '#64748b',
  },
  {
    key: 'fire_control',
    nameZh: 'L形横向传导阻铁、月牙扳机与S连杆复进组',
    nameEn: 'Lateral Bellcrank Sear, Crescent Trigger & S-Link Recoil',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '8发55°斜置钢板弹匣与同心圆纹双耳拉柄底座',
    nameEn: '8-Rd 55° Sheet-Steel Magazine & Concentric Pull-Knob Base',
    badgeColor: '#e11d48',
  },
];

export const P08_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: '1917 年柏林 DWM 兵工厂原厂 Parabellum-Pistole 1908（鲁格 P08）标准合拢闭锁态：4 英寸锥形 9×19mm 枪管、刻印「1917」叉形枪管节套、「DWM」花体肘节连杆与麦秆黄（Gelbangelassen）扳机/拆解杆严丝合缝，双连杆肘节停靠于死点下方 1.5° 实现刚性过中心闭锁。',
  },
  {
    id: 'field_strip',
    label: '一级野战快拆',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '按德军《Pistole 08》军械教范执行无工具快拆：抽出 55° 镀镍钢板弹匣，下旋 90° 麦秆黄拆解杆（Zerlegehebel）取下左侧扳机杠杆盖板，将枪管、叉形节套与肘节枪机总成整体沿导轨向前滑脱。',
  },
  {
    id: 'sub_assembly',
    label: '肘节与弹匣细拆',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '抽出后肘节横轴销与中铰链销，将方形枪机、DWM 前肘节、双圆耳滚花后肘节、三槽泄气击针及刺刀卡口击针簧逐级分离；同步拆解两侧 20 线欧洲胡桃木护把与握把内螺旋复进簧总成。',
  },
  {
    id: 'full_exploded',
    label: '全零件军械爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 25 个精密锻造与车铣构件在三维空间零干涉展开：从带「GELADEN」有弹指示的顶部抽壳钩、侧盖板 L 形换向杠杆、横向阻铁条、「GESICHERT」拇指保险到双耳同心圆纹弹匣底座，完整呈现乔治·鲁格巅峰机械美学。',
  },
];

export const P08_PARTS: WeaponPartSpec[] = [
  // ==================== 1. 4" BARREL, FORKED EXTENSION & TOGGLE TRAIN ('slide' · 9 parts) ====================
  {
    id: 'p08_barrel',
    bomCode: 'U-01',
    nameZh: '4英寸锥形膛线枪管 (含燕尾麦粒准星)',
    calloutLabel: '4"锥形枪管与准星',
    nameEn: '4" Tapered Rifled 9×19mm Barrel w/ Barleycorn Front Sight',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [7.5, 2.2, 0] },
      { range: [0.34, 0.66], offset: [5.0, 1.2, 0] },
      { range: [0.68, 1.0], offset: [3.5, 0.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [8.6, 2.82, 0],
    labelAppearAt: 0.04,
    roleTag: '102mm 6条右旋膛线 · 管退式短后坐 (-6.5mm)',
    description:
      '鲁格 P08 经典的 4 英寸（102 mm）冷锻精车锥形枪管，正是乔治·鲁格专为该枪研制的 9×19mm Parabellum（「汝欲和平，必先备战」）手枪弹的母体平台：尾端以精密细牙螺纹加定位台阶旋入叉形枪管节套，射击时随节套与闭锁肘节共同刚性短后坐 6.5 mm 泄压；前端一体箍座横向燕尾槽镶嵌三角形防反光麦粒准星（Dachkorn）。',
  },
  {
    id: 'p08_barrel_extension',
    bomCode: 'U-02',
    nameZh: '叉形枪管节套 (含1917膛环与后肘节轴耳)',
    calloutLabel: '叉形枪管节套',
    nameEn: 'Forked U-Channel Barrel Extension (Gabelgehäuse)',
    group: 'slide',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [4.2, 2.2, 0] },
      { range: [0.34, 0.66], offset: [-1.5, 1.2, 0] },
      { range: [0.68, 1.0], offset: [-1.2, 0.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [2.4, 3.06, 0],
    labelAppearAt: 0.06,
    roleTag: '承载方形枪机与后肘节支点 · 顶刻 1917 年份钢印',
    description:
      '鲁格自动机最核心的 U 形双叉滑轨上机匣（Gabelgehäuse）：前端圆筒形节套顶部深压「1917」出厂年份，右侧打有德意志帝国皇冠鹰检验戳；中部敞开宽大顶窗供肘节向上屈曲与向上抛壳；左外壁铣有容纳横向阻铁条的导槽，尾端双圆轴耳铰接后肘节主轴。',
  },
  {
    id: 'p08_breechblock',
    bomCode: 'U-03',
    nameZh: '矩形滑动枪机 (Verschlussstück)',
    calloutLabel: '矩形滑动枪机',
    nameEn: 'Rectangular Sliding Breechblock',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [4.2, 2.2, 0] },
      { range: [0.34, 0.64], offset: [2.8, 4.2, 0] },
      { range: [0.66, 1.0], offset: [2.2, 2.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0.85, 2.75, 0],
    labelAppearAt: 0.28,
    roleTag: '纯直线往复闭锁机头 · 行程 42mm 推弹闭膛',
    description:
      '精密铣削的矩形截面直线滑动枪机：始终严格限制在叉形节套水平导轨内作一维轴向运动（绝不随肘节上翘偏转），前镜面（Stoßboden）沉孔包覆 9×19mm 弹底，底部凸起推弹筋条将新弹推入弹膛，尾部双叉铰耳通过前铰销与前肘节刚性铰接。',
  },
  {
    id: 'p08_extractor',
    bomCode: 'U-04',
    nameZh: '顶部抽壳钩与「GELADEN」膛内有弹指示器',
    calloutLabel: 'GELADEN抽壳钩',
    nameEn: 'Top-Pivoting Extractor & "GELADEN" Loaded-Chamber Indicator',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [0.95, 2.72, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [4.2, 2.2, 0] },
      { range: [0.34, 0.64], offset: [2.8, 6.2, 0] },
      { range: [0.66, 1.0], offset: [2.2, 3.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.36,
    roleTag: '12点钟顶置抓弹钩 · 翘起显露德文 GELADEN 警示',
    description:
      '世界轻武器史上最早且最著名的机械式膛内有弹指示器：镶嵌于枪机正上方槽内，当 9×19mm 实弹入膛后，弹底缘将前端钩爪顶起，使抽壳钩顶背显著翘出枪机平面并露出左侧醒目的德文「GELADEN」（已装填），射手在全黑夜间仅凭拇指触摸即可确认膛内状态。',
  },
  {
    id: 'p08_front_toggle',
    bomCode: 'U-05',
    nameZh: '前肘节连杆 (精刻 DWM 花体铭文)',
    calloutLabel: 'DWM前肘节连杆',
    nameEn: 'Articulated Front Toggle Link w/ DWM Scroll Monogram',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [P08_FRONT_PIN_X0, P08_BORE_Y, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [4.2, 2.2, 0] },
      { range: [0.34, 0.64], offset: [-1.2, 4.4, 0] },
      { range: [0.66, 1.0], offset: [-0.4, 2.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-2.2, 0.56, 0],
    labelAppearAt: 0.12,
    roleTag: '二连杆肘节前臂 · 下压待击凸轮自动压倒击针',
    description:
      '连接方形枪机与中央膝关节的前肘节臂（Vordergelenk），平坦顶面精雕细刻德国武器弹药制造厂「DWM」交织花体字母徽章；其前下方隐藏着精妙的击针待击凸趾（Spannnase）——当膝关节在开锁瞬间向上屈曲折起时，凸趾顺势向后顶推击针挂耳压缩击针簧完成自动待击！',
  },
  {
    id: 'p08_rear_toggle',
    bomCode: 'U-06',
    nameZh: '后肘节连杆 (含双侧菱格圆耳拉柄与V形照门)',
    calloutLabel: '双圆耳后肘节连杆',
    nameEn: 'Articulated Rear Toggle Link w/ Knurled Toggle Ears & V-Sight',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [P08_REAR_AXLE_X0, P08_BORE_Y, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [4.2, 2.2, 0] },
      { range: [0.34, 0.64], offset: [-3.2, 4.4, 0] },
      { range: [0.66, 1.0], offset: [-0.8, 2.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [3.3, 0.92, 0],
    labelAppearAt: 0.05,
    roleTag: '标志性滚花双圆耳 · 尾部凸轮撞击机匣曲坡触发屈膝开锁',
    description:
      '鲁格 P08 极具辨识度的灵魂构件（Hintergelenk）：两侧突出一对车有 24 线防滑菱格滚花与内凹指窝的圆盘形拉机耳（Spannstücke），后桥顶端一体铣出精密 V 形缺口照门；当上机匣短后坐 6.5 mm 时，其下方凸轮滚子猛烈撞击下机匣尾部的弧形导坡，瞬间将膝关节向上掀起约 53.5°（抬升 ~3.8 cm）完成肘节开锁！',
  },
  {
    id: 'p08_toggle_pins',
    bomCode: 'U-07',
    nameZh: '肘节中央膝铰销与尾部横轴销组',
    calloutLabel: '肘节膝铰与尾轴销',
    nameEn: 'Knee-Joint Center Hinge Pin & Rear Toggle Cross-Axle Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [P08_REAR_AXLE_X0, P08_BORE_Y, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [4.2, 2.2, 0] },
      { range: [0.34, 0.64], offset: [-3.2, 4.4, -2.6] },
      { range: [0.66, 1.0], offset: [-0.8, 2.8, -1.8] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [4.62, -0.12, 0],
    labelAppearAt: 0.42,
    roleTag: '高强铬镍钢双阶铰销 · 承受千次高速屈膝剪切冲击',
    description:
      '由带中空储油孔的阶梯形中央膝关节铰销（Mittelgelenkbolzen）与尾部 T 形大帽后肘节主轴销（Hintergelenkbolzen）组成，以微米级公差将前后肘节连杆与叉形枪管节套耦合为高刚性平面四杆滑块机构。',
  },
  {
    id: 'p08_striker',
    bomCode: 'U-08',
    nameZh: '三槽泄气空心圆柱击针 (Schlagbolzen)',
    calloutLabel: '三槽泄气圆柱击针',
    nameEn: 'Fluted Cylindrical Internal Firing Striker',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0.35, P08_BORE_Y, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [4.2, 2.2, 0] },
      { range: [0.36, 0.66], offset: [-5.2, 2.4, 2.2] },
      { range: [0.68, 1.0], offset: [-2.4, 1.8, 1.2] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.4,
    roleTag: '三道纵向防炸底火导气槽 · 左侧一体挂机凸笋',
    description:
      '鲁格后期改进型（「Neue Art」）标志性的三槽泄气空心击针：圆柱外壁铣有 3 道深纵向导气槽，一旦遇到劣质弹药底火击穿，高压火药燃气可顺槽安全排入弹匣井而不致崩裂枪机或伤及射手双目；左侧凸起方形挂机齿与横向阻铁条精准咬合。',
  },
  {
    id: 'p08_striker_spring',
    bomCode: 'U-09',
    nameZh: '螺旋击针主簧与刺刀卡口尾座',
    calloutLabel: '螺旋击针簧与尾座',
    nameEn: 'Helical Striker Mainspring & Bayonet Spring Guide',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-0.58, P08_BORE_Y, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [4.2, 2.2, 0] },
      { range: [0.36, 0.66], offset: [-8.8, 2.4, 2.2] },
      { range: [0.68, 1.0], offset: [-3.2, 1.8, 1.2] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.44,
    roleTag: '内置琴钢丝压簧 (w=1) · 旋转90°刺刀锁止尾塞',
    description:
      '深藏于空心击针内腔的高劲度螺旋击针簧与后端钢制导向尾塞：尾塞采用免螺钉刺刀式旋转卡笋锁定在枪机尾部（推入后逆时针旋转 90° 即可解锁弹出），在极紧凑空间内赋予击针迅猛短促的刺火冲量。',
  },

  // ==================== 2. FORGED CURVED-RAMP FRAME, SIDEPLATE & GRIPS ('frame' · 7 parts) ====================
  {
    id: 'p08_frame',
    bomCode: 'F-01',
    nameZh: '锻造曲坡下机匣 (含55°握把框与开锁曲坡)',
    calloutLabel: '锻造曲坡下机匣',
    nameEn: 'Forged Curved-Ramp Frame w/ 55° Grip Strap (Griffstück)',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [-8.8, 1.85, 0],
    labelAppearAt: 0.04,
    roleTag: '55°传奇指向握把角 · 尾部双弧面肘节开锁导坡',
    description:
      '由整块特种铬镍锻钢经数十道精密立铣工序雕琢而成的全枪基准骨架（零位不动件）：1) 握把与枪管轴线呈举世闻名的 55°（125°）黄金人机工程学倾角，抬手自然指向目标；2) 机匣尾端高耸一对精密淬火弧形开锁导坡（Kurvenstücke），负责在短后坐末段向上踢起后肘节完成解锁；3) 背脊下方保留德军制式枪托T形卡座。',
  },
  {
    id: 'p08_sideplate',
    bomCode: 'F-02',
    nameZh: '可拆式左侧扳机杠杆盖板 (Abzugsblech)',
    calloutLabel: '左侧火控锁盖板',
    nameEn: 'Detachable Left Trigger-Lever Sideplate',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [1.35, 0.92, -0.96],
    explodeSteps: [
      { range: [0.04, 0.24], offset: [0.8, 0.4, -2.8] },
      { range: [0.34, 0.68], offset: [1.4, 0.1, -1.2] },
      { range: [0.7, 1.0], offset: [1.0, 0.1, -0.8] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.14,
    roleTag: '承载 L 形换向杠杆 · 开启 X-Ray 即刻透视侧向火控',
    description:
      '严丝合缝嵌装于下机匣左前窗的精密异形锁盖板（打有与全枪尾号一致的「21」装配钢印）：内腔精密铣槽容纳 L 形扳机换向杠杆（Abzugshebel），前端钩舌卡入机匣槽，下沿半圆缺口由麦秆黄拆解杆偏心凸轮一键锁死。',
  },
  {
    id: 'p08_takedown_lever',
    bomCode: 'F-03',
    nameZh: '麦秆黄回火旋转拆解锁定杆 (Zerlegehebel)',
    calloutLabel: '麦秆黄快拆锁杆',
    nameEn: 'Straw-Tempered Rotating Takedown Locking Lever',
    group: 'frame',
    material: 'copper_accent',
    assembledPos: [2.55, 0.48, -0.95],
    explodeSteps: [
      { range: [0.02, 0.12], offset: [0, 0, 0], rotation: [0, 0, 1.48] },
      { range: [0.14, 0.3], offset: [2.8, -0.6, -2.8] },
      { range: [0.34, 0.72], offset: [2.4, -0.4, -1.2] },
      { range: [0.74, 1.0], offset: [1.6, -0.2, -0.8] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.16,
    roleTag: '240°C 金色麦秆回火 · 向下旋 90° 一秒解锁全枪',
    description:
      '位于扳机护圈左前方的标志性金色麦秆回火（Gelbangelassen，240°C 氧化干涉金黄色膜）快拆杆：野战分解时微拉肘节卸除张力，将防滑拇指拨片向下旋转 90°，其偏心轴即释放左侧盖板并让开枪管节套前滑通道。',
  },
  {
    id: 'p08_ejector',
    bomCode: 'F-04',
    nameZh: '右侧弹性片状麦秆黄抛壳挺 (Auswerfer)',
    calloutLabel: '右侧片簧抛壳挺',
    nameEn: 'Right-Flank Straw-Tempered Leaf-Spring Ejector Blade',
    group: 'frame',
    material: 'copper_accent',
    assembledPos: [-1.15, 2.02, 0.72],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [4.2, 2.2, 0] },
      { range: [0.36, 0.68], offset: [-1.5, 1.2, 2.6] },
      { range: [0.7, 1.0], offset: [-1.2, 0.8, 1.6] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.38,
    roleTag: '镶嵌于右节套壁 · 撞击9mm弹壳底缘向上猛烈踢出',
    description:
      '纵向嵌装在叉形枪管节套右侧壁槽内的麦秆黄回火弹簧钢片：前端弯钩向内探入枪机滑道，当肘节上折带动枪机拉出空弹壳后退时，抛壳挺钩尖猛烈撞击弹壳右侧底缘，配合顶部抽壳钩将空弹壳从敞开的机匣顶窗向上方清脆弹射。',
  },
  {
    id: 'p08_hold_open',
    bomCode: 'F-05',
    nameZh: '末发空仓挂机卡笋与板簧 (Verschlussfang)',
    calloutLabel: '空仓挂机卡笋',
    nameEn: 'Internal Last-Round Toggle Hold-Open Latch & Spring',
    group: 'frame',
    material: 'stainless',
    assembledPos: [-0.85, 1.28, 0.36],
    explodeSteps: [
      { range: [0.38, 0.7], offset: [3.4, 1.2, 2.6] },
      { range: [0.72, 1.0], offset: [2.2, 0.6, 1.6] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.46,
    roleTag: '托弹板拇指钮联动 · 末发打空将屈曲肘节高高挂起',
    description:
      '隐藏在下机匣右侧导轨内壁的精密杠杆与复位片簧：当 8 发弹匣打空最后一发时，弹匣托弹板侧面的滚花装弹钮向上挑起挂机卡笋前端齿尖，死死抵住后退到底的方形枪机前下沿，使鲁格双连杆肘节保持壮观的高耸屈曲空仓挂机姿态！',
  },
  {
    id: 'p08_grip_left',
    bomCode: 'F-06',
    nameZh: '欧洲胡桃木20线菱格纹左护把',
    calloutLabel: '左胡桃木菱格护把',
    nameEn: 'Left 20-LPI Diamond-Checkered European Walnut Grip Panel',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-5.65, -4.45, -0.92],
    explodeSteps: [
      { range: [0.22, 0.52], offset: [-0.8, -0.6, -3.2] },
      { range: [0.54, 1.0], offset: [-0.7, -0.6, -2.0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.24,
    roleTag: '甄选欧洲胡桃木心材 · 满铺20线手工菱形金字塔纹',
    description:
      '选用陈年风干欧洲核桃木（Juglans regia）按 55° 握把框精密贴合削制的左侧护把：外表面满铺锐利的每英寸 20 线（20 LPI）手工菱形防滑格纹，左上方削有半月形拇指保险让位弧口，内壁铣有让开弹匣装弹钮的纵向通道。',
  },
  {
    id: 'p08_grip_right',
    bomCode: 'F-07',
    nameZh: '欧洲胡桃木20线菱格纹右护把',
    calloutLabel: '右胡桃木菱格护把',
    nameEn: 'Right 20-LPI Diamond-Checkered European Walnut Grip Panel',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-5.65, -4.45, 0.92],
    explodeSteps: [
      { range: [0.22, 0.52], offset: [-0.8, -0.6, 3.2] },
      { range: [0.54, 1.0], offset: [-0.7, -0.6, 2.0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.24,
    roleTag: '亚麻籽油浸润防潮 · 纵剖视图展现胡桃木实心壁厚',
    description:
      '与左护把同木对纹切割的欧洲胡桃木右护把，上端设弹匣卡榫防误触半月凹弧，底部以单枚烤蓝一字槽螺钉锁入握把框底座；开启军械纵剖视图 [C] 时沿中轴切开，直观呈现木质护把与握把内螺旋复进簧、斜置弹匣的紧凑包络。',
  },

  // ==================== 3. LATERAL BELLCRANK SEAR, TRIGGER & S-LINK RECOIL ('fire_control' · 5 parts) ====================
  {
    id: 'p08_trigger',
    bomCode: 'FC-01',
    nameZh: '麦秆黄回火宽弧月牙形扳机 (Abzug)',
    calloutLabel: '麦秆黄月牙扳机',
    nameEn: 'Straw-Tempered Wide Crescent Trigger',
    group: 'fire_control',
    material: 'copper_accent',
    assembledPos: [0.55, -0.15, 0],
    explodeSteps: [
      { range: [0.42, 0.72], offset: [4.2, -2.6, 0] },
      { range: [0.74, 1.0], offset: [2.6, -1.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.44,
    roleTag: '饱满新月形指腹弧面 · 上鼻顶推侧盖板 L 形换向杠杆',
    description:
      '经精细抛光与 240°C 金色麦秆回火处理的宽幅新月形扳机：由于待击的击针与阻铁均位于随枪管后坐的上机匣内，扣动扳机时其上端凸轮鼻向上后方顶起侧盖板内的 L 形换向杠杆，将纵向扣力精巧转化为横向侧推动作。',
  },
  {
    id: 'p08_trigger_lever',
    bomCode: 'FC-02',
    nameZh: '侧盖板L形直角换向扳机杠杆 (Abzugshebel)',
    calloutLabel: 'L形直角换向杠杆',
    nameEn: 'Sideplate L-Shaped Bellcrank Trigger Transfer Lever',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [1.15, 0.92, -0.82],
    explodeSteps: [
      { range: [0.06, 0.26], offset: [0.8, -0.8, -1.8] },
      { range: [0.36, 0.72], offset: [1.4, -1.0, -0.8] },
      { range: [0.74, 1.0], offset: [1.0, -0.8, -0.6] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.34,
    roleTag: '后拉变侧推 90° 换向钟表机构 · 兼作天然半自动断连器',
    description:
      '镶嵌在左侧盖板内腔的立轴 L 形直角杠杆（鲁格火控最巧妙的发明）：下臂接受月牙扳机后推，绕竖销摆动使上臂向内挤压上机匣阻铁条前端的弹簧柱塞；上机匣一旦后坐，阻铁柱塞即滑离杠杆端面自动实现半自动断路（Disconnector）！',
  },
  {
    id: 'p08_sear_bar',
    bomCode: 'FC-03',
    nameZh: '左外侧水平阻铁条与断连柱塞 (Abzugsstange)',
    calloutLabel: '水平阻铁条与柱塞',
    nameEn: 'Horizontal Left-Flank Sear Bar & Disconnector Plunger',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-1.85, 2.08, -1.04],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [4.2, 2.2, 0] },
      { range: [0.36, 0.68], offset: [-1.5, 1.2, -2.8] },
      { range: [0.7, 1.0], offset: [-1.2, 0.8, -1.8] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.38,
    roleTag: '天平式跷跷板侧向阻铁 · 前压柱塞使尾齿外摆释放击针',
    description:
      '水平卧于叉形枪管节套左侧槽内的跷跷板式长条阻铁：前端装有弹性断连柱塞，当 L 形杠杆向内顶压前端柱塞时，阻铁条绕中支点像天平一样撬动后端挂机齿向外侧（-Z）摆出，瞬间放行空心击针高速刺火！',
  },
  {
    id: 'p08_thumb_safety',
    bomCode: 'FC-04',
    nameZh: '麦秆黄滚花拇指保险杆与锁止条 (GESICHERT)',
    calloutLabel: 'GESICHERT拇指保险',
    nameEn: 'Straw-Tempered Knurled Thumb Safety Lever & Blocking Bar',
    group: 'fire_control',
    material: 'copper_accent',
    assembledPos: [-7.35, 0.45, -0.96],
    explodeSteps: [
      { range: [0.38, 0.7], offset: [-4.2, 0.5, -2.8] },
      { range: [0.72, 1.0], offset: [-2.6, 0.3, -1.8] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.42,
    roleTag: '拨下显露白字 GESICHERT · 推出刚性钢条锁死阻铁与节套',
    description:
      '位于下机匣左后方的麦秆黄回火滚花圆头保险杆：向后下方拨动时，不仅露出机匣凹槽内醒目的白色德文「GESICHERT」（安全），更同步将一根坚固的扁钢锁止条（Sicherungsstange）向前推入阻铁条外侧，从物理上彻底锁死阻铁外摆与上机匣后退。',
  },
  {
    id: 'p08_recoil_spring',
    bomCode: 'FC-05',
    nameZh: '握把内置螺旋复进簧、导杆与S形肘节挂钩连杆',
    calloutLabel: '握把螺旋复进簧与S钩',
    nameEn: 'Grip-Housed Helical Recoil Spring, Guide & S-Coupling Link',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-8.95, -7.1, 0],
    assembledRot: [0, 0, P08_GRIP_SPRING_ROT_Z],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-6.8, -3.2, 0] },
      { range: [0.7, 1.0], offset: [-4.8, -2.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 50,
    calloutAnchor: [2.8, 0, 0],
    labelAppearAt: 0.36,
    roleTag: '1908型握把背脊螺旋压簧 (w=1) · S形连杆下拽拉平肘节',
    description:
      '1908 年定型版鲁格手枪取代早期片簧的关键进化：18 圈琴钢丝螺旋复进簧斜置隐藏于 55° 握把框背脊盲孔内，顶端通过传力摇臂与标志性的 S 形双弯挂钩连杆（Kupplungsglied）勾住后肘节下挂耳；肘节上折时将其大幅压缩蓄能，随后强劲回弹拉扯 S 连杆将肘节迅猛拍平闭锁！',
  },

  // ==================== 4. 8-ROUND 55° SHEET-STEEL MAGAZINE ('magazine' · 4 parts) ====================
  {
    id: 'p08_mag_body',
    bomCode: 'M-01',
    nameZh: '8发55°斜置镀镍钢板弹匣体 (带侧向装弹槽)',
    calloutLabel: '8发55°镀镍弹匣体',
    nameEn: '8-Round 55° Brushed-Nickel Sheet-Steel Magazine Body',
    group: 'magazine',
    material: 'stainless',
    isShell: true,
    assembledPos: [-4.45, -3.3, 0],
    assembledRot: [0, 0, P08_GRIP_ANGLE_RAD],
    explodeSteps: [
      { range: [0.0, 0.14], offset: [-2.8, -5.8, 0] },
      { range: [0.34, 0.66], offset: [-0.8, -4.4, 0] },
      { range: [0.68, 1.0], offset: [-0.6, -3.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -2.5, 0],
    labelAppearAt: 0.08,
    roleTag: '55° 大倾角单排供弹盒 · 防锈镀镍钢板冲压折弯',
    description:
      '严格顺应 55° 握把倾角冲压折弯并经哑光镀镍防锈处理的 8 发单排钢板弹匣：顶部精密收口抱弹唇将锥壳 9×19mm 弹头以完美迎角托举对准枪管坡道，左侧壁贯通铣出长条滑槽供托弹板拇指助装钮上下运行。',
  },
  {
    id: 'p08_mag_follower',
    bomCode: 'M-02',
    nameZh: '机加工阶梯托弹板与外部滚花拇指助装钮',
    calloutLabel: '托弹板与拇指装弹钮',
    nameEn: 'Machined Steel Follower w/ External Knurled Thumb Button',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [-6.58, -6.34, 0],
    assembledRot: [0, 0, P08_GRIP_ANGLE_RAD],
    explodeSteps: [
      { range: [0.0, 0.14], offset: [-2.8, -5.8, 0] },
      { range: [0.46, 0.74], offset: [3.8, -1.4, -2.0] },
      { range: [0.76, 1.0], offset: [2.8, -1.2, -1.2] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.48,
    roleTag: '下压侧钮轻松装弹 · 末发顶起空仓挂机卡笋',
    description:
      '车铣一体钢制托弹板，侧面伸出一枚带防滑滚花的圆形拇指助装钮（Zubringerknopf）：射手装填时可用拇指直接拉下侧钮克服弹簧阻力，轻松投入 8 发 9×19mm 手枪弹；打空最后一发时，正是这枚侧钮向上顶起机匣内的空仓挂机卡笋。',
  },
  {
    id: 'p08_mag_spring',
    bomCode: 'M-03',
    nameZh: '55°斜置螺旋托弹簧 (Zubringerfeder)',
    calloutLabel: '斜置螺旋托弹簧',
    nameEn: '55°-Angled Helical Magazine Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [-7.78, -8.06, 0],
    assembledRot: [0, 0, P08_GRIP_SPRING_ROT_Z],
    explodeSteps: [
      { range: [0.0, 0.14], offset: [-2.8, -5.8, 0] },
      { range: [0.46, 0.74], offset: [4.0, -4.2, 2.0] },
      { range: [0.76, 1.0], offset: [2.6, -2.8, 1.2] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.5,
    roleTag: '高弹限琴钢丝螺旋簧 (w=1) · 克服高速肘节复进供弹时窗',
    description:
      '针对鲁格肘节机构极高的往复速度（瞬时循环射速超 650 发/分）专门匹配的强力螺旋托弹簧，确保在方形枪机高速回扑前的毫秒级窗口内将下一发 9×19mm 实弹稳准顶抵抱弹口。',
  },
  {
    id: 'p08_mag_base',
    bomCode: 'M-04',
    nameZh: '机加工同心圆纹双耳拔匣拉柄底座 (Magazinboden)',
    calloutLabel: '同心圆纹双耳底座',
    nameEn: 'Machined Concentric-Grooved Twin-Ear Pull-Knob Floorplate',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [-8.18, -8.62, 0],
    assembledRot: [0, 0, P08_GRIP_ANGLE_RAD],
    explodeSteps: [
      { range: [0.0, 0.14], offset: [-2.8, -5.8, 0] },
      { range: [0.46, 0.74], offset: [-2.4, -6.2, 0] },
      { range: [0.76, 1.0], offset: [-1.8, -4.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.48,
    roleTag: '硬铝/胡桃木双圆耳车削同心防滑环 · 泥泞壕沟强力拔匣',
    description:
      '一战后期德军专为泥泞堑壕战改良的机加工杜拉铝/核桃木复合弹匣底座：两侧对称凸出车有精密同心圆防滑环纹的圆耳拉柄（底面打有与枪身同号的「4821 a」钢印），即使戴厚皮手套或弹匣沾满泥浆也能用食指与拇指强力拔出弹匣。',
  },
];

export const P08_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'phase_1',
    stepNum: '01',
    shortLabel: 'L杆换向释针',
    title: '阶段 1 · 月牙扳机推动侧盖板 L 形杠杆，横向撬开阻铁条释放击针',
    range: [0.0, 0.1],
    description:
      '食指扣压麦秆黄月牙扳机：扳机上鼻顶转左侧盖板内的 L 形直角换向杠杆，使其上臂向内推压水平阻铁条前端的断连柱塞；阻铁条像天平般绕支点撬动尾齿向外侧（-Z）脱钩，击针主簧瞬时伸展驱动三槽空心击针高速前冲刺向底火！',
  },
  {
    id: 'phase_2',
    stepNum: '02',
    shortLabel: '过死点短后坐',
    title: '阶段 2 · 9×19mm 235 MPa 燃爆出膛，肘节锁死于死点下 1.5° 共同短后坐 6.5mm',
    range: [0.1, 0.2],
    description:
      '9×19mm Parabellum 发射药猛烈燃爆产生 235 MPa 峰值膛压，推动 124 格令被甲弹头在 f=0.19 呼啸冲出 4 英寸枪口；在最高膛压期间，中央膝铰链稳稳抵靠在死点线下方 1.5° 的过中心自锁位，枪管、叉形节套与平直肘节作为刚性整体安全后退 6.5 mm 泄压。',
  },
  {
    id: 'phase_3',
    stepNum: '03',
    shortLabel: '撞击曲坡屈膝',
    title: '阶段 3 · 后肘节滚子撞击下机匣弧形导坡，膝关节越过死点向上猛烈折起',
    range: [0.2, 0.35],
    description:
      '膛压降至安全阈值瞬间，后肘节尾端的凸轮滚子猛烈撞上下机匣尾部的双弧形开锁导坡（Kurvenstücke）！导坡向上的反作用力瞬间将肘节膝关节向上踢过死点线，叉形节套撞上机匣止点停下，而前、后肘节开始像人膝弯曲一样向机匣上方剧烈折叠开锁。',
  },
  {
    id: 'phase_4',
    stepNum: '04',
    shortLabel: '高耸抛壳压簧',
    title: '阶段 4 · 膝铰链向上高高跃起 ~3.8 cm，拉动枪机直退 4.2 cm 顶窗抛壳并压紧握把簧',
    range: [0.35, 0.52],
    description:
      '后肘节绕尾轴仰起达 53.5°（+0.934 rad），中央膝铰链高高跃升约 3.76 cm，牵引方形枪机沿水平导轨直退 4.20 cm！顶部抽壳钩拉出的空黄铜弹壳在 f=0.40 撞击右侧麦秆黄抛壳挺向上方翻滚飞出；同时前肘节凸趾压倒击针待击，S 形连杆大幅压缩 55° 握把内的螺旋复进簧。',
  },
  {
    id: 'phase_5',
    stepNum: '05',
    shortLabel: '55°托弹推膛',
    title: '阶段 5 · 斜置弹匣托举新弹，握把复进簧拉拽 S 形连杆驱动肘节下扑推弹',
    range: [0.52, 0.72],
    description:
      '55° 镀镍钢板弹匣内的螺旋托弹簧伸展，托弹板将下一发 9×19mm 实弹推抵抱弹唇；蓄满势能的握把复进簧通过 S 形挂钩连杆向下猛拽后肘节尾钩，驱使高耸的双连杆肘节凌厉向下拍合，推动方形枪机高速前冲将新弹顺坡推入弹膛！',
  },
  {
    id: 'phase_6',
    stepNum: '06',
    shortLabel: '拍平过心死锁',
    title: '阶段 6 · 双肘节拍平沉入死点下 1.5° 自锁，带动枪管与节套前移 6.5mm 归位',
    range: [0.72, 0.88],
    description:
      '随着新弹完全入膛、顶部抽壳钩咔哒扣入弹底缘并重新翘起「GELADEN」有弹警示，前后肘节连杆彻底拍平沉入中心线下方 1.5° 的刚性过死点（Over-Center）锁死位，并顺势推动叉形节套与 4 英寸枪管向前复进 +6.5 mm 回到闭锁零位。',
  },
  {
    id: 'phase_7',
    stepNum: '07',
    shortLabel: '侧板断连复位',
    title: '阶段 7 · 松开月牙扳机，侧盖板 L 形换向杠杆回摆重新对正阻铁柱塞',
    range: [0.88, 1.0],
    description:
      '射手松开月牙扳机，左侧盖板内的 L 形换向杠杆回摆退让，使刚刚随枪管节套复进归位的阻铁断连柱塞重新清脆弹回杠杆上臂正内侧完成半自动复位，击针稳稳挂于阻铁尾齿待命下一发击发。',
  },
];

/**
 * Exact 2-Bar Articulated Knee-Joint Toggle-Lock (`Kniegelenkverschluss`) Kinematics (`f in [0, 1]`):
 *  - Parameterized by smooth signed knee angle `alpha(f)` (`-1.5 deg` at battery -> `+52.02 deg` at peak
 *    recoil -> `-1.5 deg` at battery) and short-recoil barrel/extension displacement `extDX(f)` (`0 -> -0.65 cm -> 0`).
 *  - Guarantees **exact 0.000000 cm analytical hinge-pin coupling** at:
 *      1) Rear Axle (`p08_barrel_extension` <-> `p08_rear_toggle` <-> `p08_toggle_pins` rear pin)
 *      2) Knee Joint (`p08_rear_toggle` <-> `p08_front_toggle` <-> `p08_toggle_pins` center pin)
 *      3) Front Breech Pin (`p08_front_toggle` <-> `p08_breechblock`)
 *    across 100% of `f in [0, 1]`, with `endpointJump === 0`!
 */
export function computeP08FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  const rx = 0;
  let ry = 0;
  let rz = 0;
  let scaleX = 1;

  // 1. Short-recoil locked stroke of Barrel + Forked Barrel Extension: -0.65 cm [0.125, 0.205],
  //    held against frame stop until returning toggle pushes upper assembly into battery [0.76, 0.88]!
  const extRecoil01 = seg(f, 0.125, 0.205) - seg(f, 0.76, 0.88);
  const extDX = -0.65 * extRecoil01;

  // 2. Articulated 2-Bar Knee-Joint Toggle Buckle:
  //    Stays locked flat at `-1.5 deg` (`buckle01 = 0`) through Phase 1 & Phase 2 (`f <= 0.20`)!
  //    Buckles sharply upward [0.20, 0.43] as rear toggle rollers ride curved frame ramps,
  //    then snaps back down into over-center lockup [0.52, 0.82]!
  const buckle01 = seg(f, 0.2, 0.43) - seg(f, 0.52, 0.82);
  const deltaTheta =
    (P08_KNEE_PEAK_ALPHA_RAD + P08_TOGGLE_OVERCENTER_RAD) * buckle01;
  const alphaRad = -P08_TOGGLE_OVERCENTER_RAD + deltaTheta;

  // Exact horizontal toggle chord span D(f) = 2 * L * cos(alpha) -> exact straight-line breechblock stroke!
  const spanD = 2 * P08_TOGGLE_LINK_LEN * Math.cos(alphaRad);
  const breechDX = extDX + (spanD - P08_TOGGLE_SPAN_D0);

  // 3. Fire-control, striker & magazine feed envelopes (all 0 at f=0, f=0.995, and f=1.0!)
  const trigPull = seg(f, 0.0, 0.095) - seg(f, 0.885, 0.97);
  const searBreak = seg(f, 0.055, 0.095) - seg(f, 0.22, 0.3);
  const strikerForward = seg(f, 0.088, 0.118) - seg(f, 0.24, 0.36);
  const strikerOvercock = Math.sin(linearSeg(f, 0.28, 0.54) * Math.PI);
  const localStrikerDX = 0.22 * strikerForward - 0.32 * strikerOvercock;
  const magFeedPulse = seg(f, 0.5, 0.62) - seg(f, 0.72, 0.85);

  switch (partId) {
    case 'p08_barrel':
    case 'p08_barrel_extension':
    case 'p08_ejector': {
      dx = extDX;
      break;
    }

    case 'p08_rear_toggle':
    case 'p08_toggle_pins': {
      // Rear axle tracks `extDX`; `+deltaTheta` (+0.934 rad) swings front knee joint UPWARD (+Y ~ +3.76 cm)!
      dx = extDX;
      rz = deltaTheta;
      break;
    }

    case 'p08_front_toggle': {
      // Front pin tracks `breechDX` along Y = BORE_Y; `-deltaTheta` (-0.934 rad) swings rear knee joint
      // to the EXACT same world (xKnee, yKnee) coordinate as `p08_rear_toggle`!
      dx = breechDX;
      rz = -deltaTheta;
      break;
    }

    case 'p08_breechblock': {
      // Pure axial translation inside forked barrel extension (-4.20 cm at peak buckle!)
      dx = breechDX;
      break;
    }

    case 'p08_extractor': {
      // Rides on top of breechblock; dips slightly while chamber is empty [0.40, 0.78] and snaps
      // over incoming 9x19mm rim at [0.77, 0.84] to raise "GELADEN" tactile step!
      const emptyDip = seg(f, 0.4, 0.46) - seg(f, 0.78, 0.84);
      const rimSnap = Math.sin(linearSeg(f, 0.76, 0.84) * Math.PI);
      dx = breechDX;
      dy = -0.035 * emptyDip + 0.045 * rimSnap;
      rz = 0.045 * emptyDip - 0.06 * rimSnap;
      break;
    }

    case 'p08_striker': {
      dx = breechDX + localStrikerDX;
      break;
    }

    case 'p08_striker_spring': {
      // Rear retainer pinned at local x = 0 inside breechblock (`dx = breechDX`);
      // expands on release (scaleX -> 1.16) & compresses on front-toggle cam recock (scaleX -> 0.78)!
      dx = breechDX;
      const L0 = 1.42;
      scaleX = Math.max(0.55, (L0 + localStrikerDX) / L0);
      break;
    }

    case 'p08_trigger': {
      // Crescent trigger pivots around upper pin (+rz swings lower shoe rearward -X)
      rz = 0.28 * trigPull;
      break;
    }

    case 'p08_trigger_lever': {
      // Sideplate L-bellcrank rocks laterally around vertical pin to press sear-bar plunger inward
      ry = -0.22 * trigPull;
      dz = 0.04 * trigPull;
      break;
    }

    case 'p08_sear_bar': {
      // Rides in left groove of `p08_barrel_extension` (`dx = extDX`), rear tooth rocks outward (-Z) at sear break
      dx = extDX;
      dz = -0.095 * searBreak;
      ry = 0.05 * searBreak;
      break;
    }

    case 'p08_recoil_spring': {
      // Stationary heel anchor at local x = 0 inside 55 deg grip (`dx = 0, dy = 0`);
      // compresses cleanly (`scaleX: 1.00 -> 0.64 -> 1.00`, delta = 0.36 > 0.08!) as toggle buckles!
      scaleX = 1 - 0.36 * buckle01;
      break;
    }

    case 'p08_mag_follower': {
      // Rises briefly along +55 deg grip axis `(cos 55 deg, sin 55 deg)` to lift next 9x19mm round
      dx = 0.24 * magFeedPulse;
      dy = 0.34 * magFeedPulse;
      break;
    }

    case 'p08_mag_spring': {
      // Stationary floorplate anchor at local x = 0; extends `scaleX: 1.00 -> 1.12 -> 1.00` (delta = 0.12 > 0.08!)
      scaleX = 1 + 0.12 * magFeedPulse;
      break;
    }

    // p08_frame, p08_sideplate, p08_takedown_lever, p08_hold_open, p08_thumb_safety, grips, mag_body/base stay stationary
    default:
      break;
  }

  const snap0 = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  return {
    pos: [snap0(dx), snap0(dy), snap0(dz)],
    rot: [snap0(rx), snap0(ry), snap0(rz)],
    scaleX: Math.abs(scaleX - 1) < 1e-9 ? 1 : scaleX,
  };
}

/**
 * Computes `9x19mm Parabellum` (`235 MPa`, `ignitionF = 0.12`, `muzzleExitF = 0.19`, `ejectF = 0.40`)
 * internal & external ballistics synchronized with the 4" Luger P08 toggle-lock cycle:
 *  - Projectile seated in chamber `[3.10, 2.15, 0]`, ignites at `f = 0.12`, exits 4" muzzle `X = +12.20` at `f = 0.19`!
 *  - Spent 9mm brass pulled straight back with `p08_breechblock` until striking `p08_ejector` at `f = 0.40`,
 *    tumbling upward and right (`+Y / +Z`) clear of the buckled knee joint!
 *  - Next 9mm round rises up the `55 deg` magazine and feeds smoothly into chamber `[2.78, 2.15, 0]`!
 */
export function computeP08BallisticsState(fRaw: number): ExtendedBallisticsState {
  const f = clamp01(fRaw);

  const extRecoil01 = seg(f, 0.125, 0.205) - seg(f, 0.76, 0.88);
  const extDX = -0.65 * extRecoil01;
  const buckle01 = seg(f, 0.2, 0.43) - seg(f, 0.52, 0.82);
  const alphaRad =
    -P08_TOGGLE_OVERCENTER_RAD +
    (P08_KNEE_PEAK_ALPHA_RAD + P08_TOGGLE_OVERCENTER_RAD) * buckle01;
  const breechDX =
    extDX + (2 * P08_TOGGLE_LINK_LEN * Math.cos(alphaRad) - P08_TOGGLE_SPAN_D0);

  // 1. 9x19mm 124gr FMJ Projectile (`ignitionF = 0.12`, `muzzleExitF = 0.19` at X = +12.20!)
  const bulletVisible = f < 0.35;
  let bulletX = 3.1;
  let streakLength = 0;

  if (f >= 0.12 && f < 0.19) {
    const u = Math.pow(linearSeg(f, 0.12, 0.19), 1.38);
    bulletX = 3.1 + (12.2 - 3.1) * u;
    streakLength = 2.6 * u;
  } else if (f >= 0.19 && f < 0.35) {
    const u = linearSeg(f, 0.19, 0.35);
    bulletX = 12.2 + 36.0 * u;
    streakLength = 6.8 * (1 - u * 0.5);
  }

  // 2. Spent 9x19mm Brass Case: extracted from [2.78, 2.15, 0] -> upward/right ejection at `ejectF = 0.40`!
  const spentCaseVisible = f < 0.74;
  let caseX = 2.78;
  let caseY = P08_BORE_Y;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.125 && f < 0.4) {
    caseX = 2.78 + breechDX;
  } else if (f >= 0.4 && f < 0.74) {
    const u = linearSeg(f, 0.4, 0.74);
    const alphaAtEject =
      -P08_TOGGLE_OVERCENTER_RAD +
      (P08_KNEE_PEAK_ALPHA_RAD + P08_TOGGLE_OVERCENTER_RAD) *
        seg(0.4, 0.2, 0.43);
    const breechAtEject =
      -0.65 * seg(0.4, 0.125, 0.205) +
      (2 * P08_TOGGLE_LINK_LEN * Math.cos(alphaAtEject) - P08_TOGGLE_SPAN_D0);
    const xAtEject = 2.78 + breechAtEject;
    // Signature Luger P08 high-angle upward + right ejection trajectory!
    caseX = xAtEject - 2.6 * u;
    caseY = P08_BORE_Y + 9.4 * u - 9.8 * u * u;
    caseZ = 5.8 * u;
    caseRX = u * 9.2;
    caseRY = u * 11.4;
    caseRZ = -u * 12.6;
    if (f > 0.62) {
      spentCaseOpacity = 1 - linearSeg(f, 0.62, 0.74);
    }
  }

  // 3. Chamber Flash & Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.115 && f <= 0.21) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.115, 0.21) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.185 && f <= 0.28) {
    const u = linearSeg(f, 0.185, 0.28);
    muzzlePlumeScale = 0.38 + 1.28 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.84;
  }

  // 4. Next 9x19mm Cartridge in 55 deg Magazine -> Stripped up Feed Ramp into Chamber [2.78, 2.15, 0]
  let nextX = -0.95;
  let nextY = 1.38;
  let nextRZ = 0.14;

  if (f >= 0.5 && f < 0.6) {
    const u = seg(f, 0.5, 0.6);
    nextX = -0.95 + 0.28 * u;
    nextY = 1.38 + 0.38 * u;
    nextRZ = 0.14 + 0.06 * u;
  } else if (f >= 0.6 && f < 0.85) {
    const u = seg(f, 0.6, 0.85);
    const rampArc = Math.sin(u * Math.PI) * 0.18;
    nextX = -0.67 + (2.78 - -0.67) * u;
    nextY = 1.76 + (P08_BORE_Y - 1.76) * u + rampArc;
    nextRZ = 0.2 * (1 - u);
  } else if (f >= 0.85) {
    nextX = 2.78;
    nextY = P08_BORE_Y;
    nextRZ = 0;
  }

  // 5. Reserve 9x19mm Cartridge advancing one pitch along 55 deg magazine axis
  const magShift = seg(f, 0.5, 0.7);
  const resX = -1.52 + (-0.95 - -1.52) * magShift;
  const resY = 0.56 + (1.38 - 0.56) * magShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, P08_BORE_Y, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity: 0,
    gasPortPos: [2.78, P08_BORE_Y, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0],
  };
}

export const P08_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  p08_barrel: {
    albedoFile: 'p08_blued_albedo.webp',
    normalFile: 'p08_blued_normal.webp',
    roughnessFile: 'p08_blued_roughness.webp',
    normalScale: 0.42,
  },
  p08_barrel_extension: {
    albedoFile: 'p08_blued_albedo.webp',
    normalFile: 'p08_blued_normal.webp',
    roughnessFile: 'p08_blued_roughness.webp',
    normalScale: 0.45,
  },
  p08_extractor: {
    albedoFile: 'p08_blued_albedo.webp',
    normalFile: 'p08_blued_normal.webp',
    roughnessFile: 'p08_blued_roughness.webp',
    normalScale: 0.38,
  },
  p08_front_toggle: {
    albedoFile: 'p08_blued_albedo.webp',
    normalFile: 'p08_blued_normal.webp',
    roughnessFile: 'p08_blued_roughness.webp',
    normalScale: 0.48,
  },
  p08_rear_toggle: {
    albedoFile: 'p08_blued_albedo.webp',
    normalFile: 'p08_blued_normal.webp',
    roughnessFile: 'p08_blued_roughness.webp',
    normalScale: 0.56,
  },
  p08_frame: {
    albedoFile: 'p08_blued_albedo.webp',
    normalFile: 'p08_blued_normal.webp',
    roughnessFile: 'p08_blued_roughness.webp',
    normalScale: 0.4,
  },
  p08_sideplate: {
    albedoFile: 'p08_blued_albedo.webp',
    normalFile: 'p08_blued_normal.webp',
    roughnessFile: 'p08_blued_roughness.webp',
    normalScale: 0.36,
  },
  p08_takedown_lever: {
    albedoFile: 'p08_blued_albedo.webp',
    normalFile: 'p08_blued_normal.webp',
    roughnessFile: 'p08_blued_roughness.webp',
    normalScale: 0.44,
  },
  p08_ejector: {
    albedoFile: 'p08_blued_albedo.webp',
    normalFile: 'p08_blued_normal.webp',
    roughnessFile: 'p08_blued_roughness.webp',
    normalScale: 0.32,
  },
  p08_trigger: {
    albedoFile: 'p08_blued_albedo.webp',
    normalFile: 'p08_blued_normal.webp',
    roughnessFile: 'p08_blued_roughness.webp',
    normalScale: 0.34,
  },
  p08_thumb_safety: {
    albedoFile: 'p08_blued_albedo.webp',
    normalFile: 'p08_blued_normal.webp',
    roughnessFile: 'p08_blued_roughness.webp',
    normalScale: 0.44,
  },
  p08_grip_left: {
    albedoFile: 'p08_walnut_albedo.webp',
    normalFile: 'p08_walnut_normal.webp',
    roughnessFile: 'p08_walnut_roughness.webp',
    normalScale: 0.64,
  },
  p08_grip_right: {
    albedoFile: 'p08_walnut_albedo.webp',
    normalFile: 'p08_walnut_normal.webp',
    roughnessFile: 'p08_walnut_roughness.webp',
    normalScale: 0.64,
  },
  p08_mag_body: {
    albedoFile: 'p08_walnut_albedo.webp',
    normalFile: 'p08_walnut_normal.webp',
    roughnessFile: 'p08_walnut_roughness.webp',
    normalScale: 0.42,
  },
  p08_mag_base: {
    albedoFile: 'p08_walnut_albedo.webp',
    normalFile: 'p08_walnut_normal.webp',
    roughnessFile: 'p08_walnut_roughness.webp',
    normalScale: 0.52,
  },
};

export const P08_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'p08_blued',
    weapon: P08_ID,
    titleCn: '德意志帝国DWM锈蚀烤蓝锻钢、240°C麦秆黄回火件与花体铭文贴图组',
    partTag: 'U-01..U-06 / F-01..F-04 / FC-01..FC-04 RUST BLUE & STRAW',
    resolution: '2048 × 1024 px',
    summary:
      '专为 1917 年柏林 DWM 原厂鲁格 P08 烘焙的 2K 5 通道 Packed ORM 贴图组：上半幅还原经多遍手工酸蚀涂锈与钢丝轮抛光的深邃帝国锈蚀烤蓝（Streichbrünierung，金属度 B≈0.94，缎面光泽 G≈0.19），精细雕刻前肘节「DWM」交织花体徽章、节套顶环「1917」出厂年份、抽壳钩「GELADEN」白漆警示、机匣「GESICHERT」安全槽及后肘节圆耳 24 线菱形滚花；底幅精准复现 240°C 氧化干涉金色麦秆回火（Gelbangelassen，金属度 B=0.90，抛光粗糙度 G=0.22），赋予月牙扳机、快拆杆、拇指保险与抛壳挺独一无二的古典金蓝撞色美学！',
    highlights: [
      '深邃帝国手工锈蚀烤蓝（luma >= 0.19）与 240°C 黄金麦秆回火（Gelbangelassen, B=0.90/G=0.22）双金属分层',
      '前肘节 DWM 交织花体徽章、1917 膛环钢印、德意志皇冠鹰检验戳及白字 GESICHERT / GELADEN 警示',
      '后肘节双圆盘拉机耳（Spannstücke）24 LPI 锐利菱形金字塔滚花法线与指尖磨亮细节',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'p08_blued_albedo.webp',
        note: 'sRGB · 帝国锈蚀烤蓝锻钢 + 金色麦秆回火小件 + 银亮花体刻印与白漆警示',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'p08_blued_normal.webp',
        note: 'Linear · DWM花体凹刻斜坡 + 双圆耳24线菱格滚花浮雕 + 手工顺纹推锉丝痕',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'p08_blued_roughness.webp',
        note: 'Linear · R:刻印与滚花沟槽AO / G:烤蓝(0.19)-麦秆黄(0.22)-滚花(0.36) / B:高纯度锻钢金属度(0.90-0.94)',
      },
    ],
  },
  {
    id: 'p08_walnut',
    weapon: P08_ID,
    titleCn: '欧洲胡桃木20线菱格护把、镀镍钢板弹匣与双耳同心圆纹底座贴图组',
    partTag: 'F-06 / F-07 / M-01 / M-04 EUROPEAN WALNUT & NICKEL MAG',
    resolution: '2048 × 1024 px',
    summary:
      '在同一张 2K 5 通道 ORM 图集中融合鲁格 P08 握把与供弹系统的三种经典材质：左中两岛还原亚麻籽油浸润的欧洲核桃木（Juglans regia）山纹心材与满铺 20 LPI 锐利手工菱形格纹（非金属 B=0.0，粗糙度 G≈0.56-0.70）；右上岛呈现哑光镀镍冲压钢板弹匣管（B=0.92，G≈0.23）与纵向插拔擦痕；右下岛精准雕刻双耳硬铝拔匣底座的同心圆车削防滑环纹（B=0.88，G≈0.25）及同号「4821 a」钢印。',
    highlights: [
      '温润欧洲胡桃木棕眼山纹与满铺 20 LPI 手工菱形防滑金字塔格纹及双线切边框',
      '哑光拉丝镀镍折弯钢板弹匣壳体、「P.08 / 9 m/m」钢印与装弹钮滑槽压边',
      '双圆耳硬铝弹匣底座精密车削同心圆防滑沟槽法线与积分环境光遮蔽',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'p08_walnut_albedo.webp',
        note: 'sRGB · 暖棕欧洲胡桃木菱格护把 + 银亮镀镍弹匣体 + 杜拉铝双耳同心圆底座',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'p08_walnut_normal.webp',
        note: 'Linear · 20线胡桃木菱格金字塔 + 弹匣纵向拉丝 + 双耳底座同心圆车削防滑环',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'p08_walnut_roughness.webp',
        note: 'Linear · R:菱格与车削环沟AO / G:镀镍(0.23)-硬铝(0.25)-胡桃木(0.56-0.70) / B:金属(0.92) vs 胡桃木(0.0)',
      },
    ],
  },
  {
    id: 'p08_seamless_detail',
    weapon: P08_ID,
    titleCn: '精密白钢铰链销、三槽泄气击针与琴钢丝螺旋簧无缝细节贴图',
    partTag: '10 PRECISION INTERNAL PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为方形滑动枪机、肘节膝铰与尾轴销组、三槽泄气空心击针、L 形换向扳机杠杆、水平阻铁条、空仓挂机卡笋、托弹板滚花拇指钮以及三组琴钢丝螺旋弹簧提供可无缝平铺的微米级手工推磨白钢拉丝法线与枪油膜粗糙度细节。',
    highlights: [
      '精密车磨铬镍白钢铰链销、三槽击针与托弹板拇指钮微拉丝法线',
      '油淬火琴钢丝击针簧、握把复进簧与斜置弹匣簧表面保护油膜起伏',
      '覆盖其余全部 10 个核心闭锁、火控与供弹内件',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '精密机加工金属拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于方形枪机/膝铰销/三槽击针/L形换向杠杆/托弹板等精密内件',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝与枪油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 白钢、烤蓝钢与琴钢丝弹簧微表面光泽起伏',
      },
      {
        kind: 'Normal',
        labelCn: '微细纹理法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于护把内衬与底座过渡面细部微凹凸',
      },
    ],
  },
];

export const P08_PLUGIN: WeaponRuntimePlugin = {
  id: P08_ID,
  partGroups: P08_PART_GROUPS,
  timelinePresets: P08_TIMELINE_PRESETS,
  parts: P08_PARTS,
  firingPhases: P08_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(P08_FIRING_PHASES, f),
  computeFiringKinematics: computeP08FiringKinematics,
  computeBallisticsState: computeP08BallisticsState,
  pbrBindings: P08_PBR_BINDINGS,
  pbrSuites: P08_PBR_SUITES,
};
