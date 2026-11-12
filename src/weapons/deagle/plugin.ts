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
  KeyframeStep,
  PartKinematicDelta,
  PbrBindingSpec,
  PbrSuiteItem,
  TimelinePresetItem,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';

const DEAGLE_GRIP_ANGLE = (-15 * Math.PI) / 180;

export const DEAGLE_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '固定三角枪管、导气套筒与回转枪机组',
    nameEn: 'Fixed Barrel, Gas Bridge Slide & Rotating Bolt',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: '抛光镀铬机匣、快拆锁件与包覆握把组',
    nameEn: 'Polished Chrome Frame, Controls & Rubber Grip',
    badgeColor: '#7c3aed',
  },
  {
    key: 'fire_control',
    nameZh: '外露单动马刺击锤与双连杆火控组',
    nameEn: 'Single-Action Spur Hammer & Transfer-Bar FCG',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '7发 .50 AE 钢制马格南弹匣总成',
    nameEn: '7-Round .50 Action Express Steel Magazine',
    badgeColor: '#e11d48',
  },
];

export const DEAGLE_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '合拢态',
    subLabel: '0%',
    t: 0.0,
    desc: '沙漠之鹰 Mark XIX (.50 AE) 全枪闭合状态，可开启 X-Ray 透视检视前置导气活塞与四突笋回转枪机闭锁',
  },
  {
    id: 'field_strip',
    label: '野战一级快拆',
    subLabel: '30%',
    t: 0.3,
    desc: '按下快拆钮旋开锁柄：先向前抽下 6 英寸三角形固定枪管，再取下敞顶桥式套筒、双联复进簧组与 .50 AE 弹匣',
  },
  {
    id: 'upper_mag_strip',
    label: '枪机/复进/弹匣细拆',
    subLabel: '65%',
    t: 0.65,
    desc: '拔出凸轮控制销并旋出四突笋枪机、长击针、爪式抽壳钩与水滴形保险，分离双平行导杆与弹匣内件',
  },
  {
    id: 'full_explode',
    label: '全枪 24 节点爆炸图',
    subLabel: '100%',
    t: 1.0,
    desc: '脱出一体包覆橡胶握把，完整展开抛光镀铬钢制下机匣、外露马刺击锤、主击发簧顶杆与双连杆单动阻铁机构',
  },
];

// Stage 1: Fixed 6" triangular barrel unlatches and slides forward-up ahead of slide
const BARREL_STAGE1: KeyframeStep[] = [
  { range: [0.06, 0.14], offset: [5.5, 4.2, 0] },
];

// Stage 1: Open-top bridge slide clears frame rails forward, then lifts into upper sky
const SLIDE_STAGE1: KeyframeStep[] = [
  { range: [0.13, 0.2], offset: [4.2, 0.4, 0] },
  { range: [0.2, 0.28], offset: [-6.6, 6.8, 0] },
];

// Stage 1: Dual parallel recoil assembly lifts cleanly between frame and barrel
const RECOIL_STAGE1: KeyframeStep[] = [
  { range: [0.18, 0.28], offset: [3.2, 3.4, 0] },
];

// Stage 1: 7-round .50 AE steel magazine extracts along -15° grip axis
const MAG_STAGE1: KeyframeStep[] = [
  { range: [0.0, 0.08], offset: [-1.6, -5.8, 0] },
  { range: [0.08, 0.15], offset: [3.2, 1.4, 0] },
];

export const DEAGLE_PARTS: WeaponPartSpec[] = [
  // ============================================================================
  // 1. FIXED BARREL, GAS BRIDGE SLIDE, ROTATING BOLT & DUAL RECOIL ('slide' · 11)
  // ============================================================================
  {
    id: 'deagle_barrel',
    bomCode: 'B-01',
    nameZh: '6英寸三角形固定枪管 (含皮卡汀尼槽与导气室)',
    calloutLabel: '三角形镀铬固定枪管',
    nameEn: '6" Fixed Triangular Barrel w/ Integral Scope Rail & Gas Port',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...BARREL_STAGE1,
      { range: [0.68, 0.84], offset: [3.2, 2.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [9.4, 4.12, 0],
    labelAppearAt: 0.0,
    roleTag: '刚性固定枪管 / 膛底导气引流',
    description:
      'Mark XIX 标志性重型三角形截面 6 英寸多边形膛线枪管，射击时与机匣刚性锁定绝不后坐偏移；顶部一体铣削 8 槽皮卡汀尼瞄具导轨，弹膛前下方开有倾斜导气孔将高压燃气引至前端气室杯。',
  },
  {
    id: 'deagle_slide',
    bomCode: 'B-02',
    nameZh: '敞顶桥式套筒与一体前置导气活塞杆',
    calloutLabel: '敞顶桥式导气套筒',
    nameEn: 'Open-Top Bridge Slide w/ Integrated Gas Piston Rod',
    group: 'slide',
    material: 'stainless',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      { range: [0.68, 0.84], offset: [-1.4, 2.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-3.6, 4.12, 0],
    labelAppearAt: 0.0,
    roleTag: '导气活塞驱动自动机 / 螺旋凸轮母座',
    description:
      '兼顾手枪套筒与步枪枪机框双重职能：前段敞顶双侧桥臂绕过固定枪管连接前下横桥，前端悬伸不锈钢短行程导气活塞向前伸入枪口下导气室；后段闭锁体内部铣有驱动四突笋枪机旋转的螺旋导槽。',
  },
  {
    id: 'deagle_bolt',
    bomCode: 'B-03',
    nameZh: '四突笋回转闭锁枪机头 (含弹性抛壳柱塞)',
    calloutLabel: '四突笋回转枪机',
    nameEn: '4-Lug Rotating Bolt Head w/ Ejector Plunger',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-1.45, 2.6, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      {
        range: [0.34, 0.5],
        offset: [4.6, -2.2, 0],
        rotation: [0.68, 0, 0],
      },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [0.25, 0.55, 0],
    labelAppearAt: 0.3,
    roleTag: '步枪级马格南高膛压刚性闭锁',
    description:
      '直接移植现代自动步枪的多突笋回转闭锁枪机：前端均布 4 枚粗壮径向闭锁突笋，推弹入膛后旋转约 39° 咬死枪管尾端闭锁节套，正面集成弹簧抛壳柱塞以承受 .50 AE 狂暴膛压。',
  },
  {
    id: 'deagle_cam_pin',
    bomCode: 'B-04',
    nameZh: '枪机螺旋凸轮控制导销',
    calloutLabel: '枪机回转凸轮销',
    nameEn: 'Bolt Helical Cam Control Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-2.25, 2.6, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      { range: [0.32, 0.46], offset: [1.8, 0.6, -2.6] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [0, 0.68, 0],
    labelAppearAt: 0.34,
    roleTag: '套筒直线运动转枪机旋转枢纽',
    description:
      '垂直穿过四突笋枪机尾端并嵌入套筒内壁螺旋凸轮曲线槽的钢制导销：套筒受燃气推动后退初期，凸轮槽先迫使导销带动枪机旋转解锁，随后携枪机共同后坐抽壳。',
  },
  {
    id: 'deagle_firing_pin',
    bomCode: 'B-05',
    nameZh: '三角形防粘连惯性长击针与回位簧',
    calloutLabel: '惯性长击针与回位簧',
    nameEn: 'Floating Inertia Firing Pin & Return Spring',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-4.55, 2.6, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      { range: [0.35, 0.5], offset: [-8.8, -1.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-0.4, 0.25, 0],
    labelAppearAt: 0.36,
    roleTag: '贯穿枪机与保险鼓中心击发件',
    description:
      '贯穿套筒后座、手动保险转鼓与回转枪机中心孔的重型不锈钢长击针，外套装配强力螺旋回位簧；尾端承击帽仅在保险转鼓处于红点射击位时才允许被外露马刺击锤敲击前冲。',
  },
  {
    id: 'deagle_extractor',
    bomCode: 'B-06',
    nameZh: '枪机头爪式抽壳钩与顶簧组',
    calloutLabel: '枪机爪式抽壳钩',
    nameEn: 'Bolt-Face Claw Extractor & Plunger Spring',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-0.85, 2.6, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      { range: [0.38, 0.52], offset: [5.8, -1.4, 3.2] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0.2, 0.2, 0.52],
    labelAppearAt: 0.4,
    roleTag: '咬合 .50 AE 缩缘弹底抽壳',
    description:
      '铰接镶嵌在四突笋枪机头右侧槽内的重型钩爪，随枪机同步旋转开闭锁；前端锐利钩齿死死咬住 .50 AE 特有的缩缘式 (Rebated Rim) 弹壳底槽（与 .44 Magnum 同底径）。',
  },
  {
    id: 'deagle_safety',
    bomCode: 'B-07',
    nameZh: '套筒双侧水滴形手动保险杆与阻铁鼓',
    calloutLabel: '双侧水滴形手动保险',
    nameEn: 'Slide-Mounted Ambidextrous Tear-Drop Safety Levers',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-7.35, 2.68, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      { range: [0.44, 0.56], offset: [-2.2, 0.8, 3.2] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0.5, 0.28, 1.45],
    labelAppearAt: 0.44,
    roleTag: '锁死击针转鼓 / 左右手通用操控',
    description:
      '横穿套筒尾部的圆柱形保险转鼓及左右对称水滴形拨杆：向下拨动遮盖红点即物理旋转转鼓切面锁死长击针并断开击锤传力面，向上推露红点即进入待击发射状态。',
  },
  {
    id: 'deagle_front_sight',
    bomCode: 'B-08',
    nameZh: '燕尾槽斜坡片状战斗准星',
    calloutLabel: '燕尾槽战斗准星',
    nameEn: 'Dovetail Combat Ramp Front Sight',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [15.05, 4.16, 0],
    explodeSteps: [
      ...BARREL_STAGE1,
      { range: [0.42, 0.54], offset: [1.2, 2.2, 0] },
      { range: [0.68, 0.84], offset: [3.2, 2.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 34,
    calloutAnchor: [0, 0.45, 0],
    labelAppearAt: 0.0,
    roleTag: '固定枪管前端稳固瞄准基准',
    description:
      '横向燕尾槽嵌装于固定枪管最前端顶面（射击时随枪管完全静止不跳动，利于快速再次瞄准），后向斜面镶嵌高对比白色瞄准点。',
  },
  {
    id: 'deagle_rear_sight',
    bomCode: 'B-09',
    nameZh: '燕尾槽方缺口战斗照门',
    calloutLabel: '燕尾槽方缺口照门',
    nameEn: 'Dovetail Combat Square-Notch Rear Sight',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-7.85, 4.16, 0],
    explodeSteps: [
      ...SLIDE_STAGE1,
      { range: [0.42, 0.54], offset: [-1.6, 2.4, 0] },
      { range: [0.68, 0.84], offset: [-1.4, 2.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 36,
    calloutAnchor: [0, 0.45, 0],
    labelAppearAt: 0.0,
    roleTag: '套筒后桥抗冲击风偏可调照门',
    description:
      '燕尾槽嵌装于套筒后桥顶部的低矮抗勾挂方缺口机械照门，缺口两侧嵌有双白点夜间辅助对正标。',
  },
  {
    id: 'deagle_recoil_rods',
    bomCode: 'B-10',
    nameZh: '双联平行复进导杆与8字形尾座挡板',
    calloutLabel: '双平行导杆与尾座板',
    nameEn: 'Dual Parallel Recoil Guide Rods & Figure-8 Retainer Plate',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...RECOIL_STAGE1,
      { range: [0.46, 0.58], offset: [7.2, -0.4, -1.8] },
    ],
    calloutDir: 'down',
    calloutStem: 56,
    calloutAnchor: [9.6, 1.18, 0],
    labelAppearAt: 0.24,
    roleTag: '双路对称导向 / 一体8字尾板定位',
    description:
      '沙漠之鹰独树一帜的并列双导杆结构：两根精密磨削不锈钢导杆对称穿入 8 字形钢制尾座挡板，后端抵住机匣中桥面，前端插入套筒前下孔确保重型套筒平稳直线往复。',
  },
  {
    id: 'deagle_recoil_springs',
    bomCode: 'B-11',
    nameZh: '双联并列螺旋复进簧组',
    calloutLabel: '双联并列复进簧组',
    nameEn: 'Twin Parallel Helical Recoil Springs',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...RECOIL_STAGE1,
      { range: [0.46, 0.58], offset: [-1.2, 0.6, 1.8] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [7.5, 1.4, 0],
    labelAppearAt: 0.24,
    roleTag: '驯服 .50 AE 巨量后坐冲量',
    description:
      '左右对称套在双平行导杆上的两根高刚度多圈螺旋弹簧，合力分担 .50 AE 导气活塞传递的猛烈后坐动能，以低矮空间高度实现超长压缩寿命与充沛推弹复进力。',
  },

  // ============================================================================
  // 2. POLISHED CHROME FRAME, CONTROLS & RUBBER GRIP ('frame' · 5)
  // ============================================================================
  {
    id: 'deagle_frame',
    bomCode: 'F-01',
    nameZh: '抛光拉丝镀铬精锻钢下机匣',
    calloutLabel: '镀铬精锻钢下机匣',
    nameEn: 'Polished & Brushed Chrome Forged Steel Frame',
    group: 'frame',
    material: 'stainless',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [11.5, -0.15, 0],
    labelAppearAt: 0.0,
    roleTag: '全枪零位承载骨架 / 全长套筒导轨',
    description:
      '整块高强度合金钢精密锻造铣削并施以镜面/拉丝双质感硬铬电镀：配备全长防尘盖、反曲指钩大护圈、防咬手超长海狸尾护唐及全通精密套筒导轨，在拆解视图中作为零位基准件。',
  },
  {
    id: 'deagle_takedown_lever',
    bomCode: 'F-02',
    nameZh: '枪管快拆旋转锁柄与半月凸轮横销',
    calloutLabel: '枪管快拆旋转锁柄',
    nameEn: 'Rotating Barrel Takedown Lever & Cam Pin',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [3.15, 0.36, 0],
    explodeSteps: [{ range: [0.66, 0.78], offset: [2.8, -1.6, 3.8] }],
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [-0.4, 0, 1.35],
    labelAppearAt: 0.68,
    roleTag: '固定枪管下凸耳刚性锁死凸轮',
    description:
      '按压机匣左侧防滑锁销同时将右侧水滴形快拆柄向下旋转 90°，即可使横轴半月形切面让开枪管底部锁耳槽，实现无工具数秒快速拆换不同口径枪管（Mark XIX 模块化核心）。',
  },
  {
    id: 'deagle_slide_stop',
    bomCode: 'F-03',
    nameZh: '加长型空仓挂机解脱杆',
    calloutLabel: '空仓挂机解脱杆',
    nameEn: 'Extended Slide Stop Release Lever',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-0.85, 0.42, -1.38],
    explodeSteps: [{ range: [0.68, 0.8], offset: [-1.6, 2.2, -3.2] }],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-1.8, 0.25, 0],
    labelAppearAt: 0.7,
    roleTag: '7发打空锁止套筒 / 拇指快放复进',
    description:
      '铰接于机匣左侧的超长杠杆：当 7 发 .50 AE 打空后，橙色托弹板左前凸台将其内侧挑耳顶入套筒左壁挂机缺口使套筒停留在后方敞开位；装入新弹匣后压下尾部防滑台即可释放推弹上膛。',
  },
  {
    id: 'deagle_mag_catch',
    bomCode: 'F-04',
    nameZh: '格纹弹匣卡榫按钮与锁簧',
    calloutLabel: '弹匣卡榫与锁簧',
    nameEn: 'Checkered Magazine Catch & Coil Spring',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-2.48, -2.18, 0],
    explodeSteps: [{ range: [0.68, 0.8], offset: [1.8, -2.2, 3.8] }],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, 0, -1.3],
    labelAppearAt: 0.7,
    roleTag: '重型钢弹匣横向锁止与快卸',
    description:
      '位于扳机护圈根部后方的横向钢制锁栓，左侧带精细防滑圆按钮；按压时克服内部压簧将锁齿推出 .50 AE 钢弹匣左前锁窗使弹匣顺畅滑落。',
  },
  {
    id: 'deagle_grip',
    bomCode: 'F-05',
    nameZh: '一体包覆式 IMI/MR 防滑纹橡胶握把',
    calloutLabel: '包覆式防滑橡胶握把',
    nameEn: 'Wrap-Around Textured Black IMI/MR Rubber Grip',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [0, 0, 0],
    explodeSteps: [{ range: [0.7, 0.88], offset: [-6.6, -1.8, 0] }],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-7.4, -6.4, 0],
    labelAppearAt: 0.0,
    roleTag: '缓冲马格南后坐掌击 / 人机贴合防滑',
    description:
      '专为握持超宽 .50 AE 弹匣井设计的 U 形后包覆热塑弹性橡胶握把：正面露出镀铬机匣防滑横纹前缘，两侧与背脊采用高摩擦细颗粒皮纹并模压 IMI / MRI 原厂圆徽，大幅柔化掌心冲击。',
  },

  // ============================================================================
  // 3. SINGLE-ACTION SPUR HAMMER & TRANSFER-BAR FCG ('fire_control' · 4)
  // ============================================================================
  {
    id: 'deagle_hammer',
    bomCode: 'T-01',
    nameZh: '外露式镂空单动马刺击锤',
    calloutLabel: '外露单动马刺击锤',
    nameEn: 'Exposed Skeletonized Single-Action Spur Hammer',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-7.55, 0.62, 0],
    explodeSteps: [{ range: [0.74, 0.9], offset: [-4.2, 3.6, 0] }],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-1.4, 1.65, 0],
    labelAppearAt: 0.0,
    roleTag: '高速回转敲击长击针 / 手动待击控制',
    description:
      '带有防滑横纹平直马刺与椭圆减重孔的单动外露击锤：底部设有全待击齿与防走火半待击安全齿；释放瞬间绕横销高速向前挥击 (+X)，重重敲击套筒尾部外露的长击针帽。',
  },
  {
    id: 'deagle_hammer_strut',
    bomCode: 'T-02',
    nameZh: '击锤传力顶杆与握把主击发簧座组',
    calloutLabel: '击锤顶杆与主击发簧',
    nameEn: 'Hammer Strut & Coil Mainspring Plunger Assembly',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-8.15, -3.85, 0],
    assembledRot: [0, 0, DEAGLE_GRIP_ANGLE],
    explodeSteps: [{ range: [0.74, 0.92], offset: [-6.2, -2.2, 2.2] }],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, -1.2, 0],
    labelAppearAt: 0.76,
    roleTag: '纵置蓄能主簧 / 驱动击锤高速挥击',
    description:
      '纵向隐藏在握把后背脊腔内的不锈钢传力顶杆与强力螺旋主击发簧：套筒后坐压倒马刺击锤时顶杆向下猛压主簧蓄能，扣动扳机脱钩瞬间向上爆发释放击发能量。',
  },
  {
    id: 'deagle_trigger',
    bomCode: 'T-03',
    nameZh: '弧形单动扳机与双侧环抱传力连杆',
    calloutLabel: '单动扳机与双侧连杆',
    nameEn: 'Curved Single-Action Trigger & Dual Transfer Bar',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [0.35, -0.35, 0],
    explodeSteps: [{ range: [0.76, 0.94], offset: [3.4, -3.2, -2.2] }],
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [0.1, -1.5, 0],
    labelAppearAt: 0.78,
    roleTag: '干脆两道火单动击发 / 绕弹匣井传力',
    description:
      '宽体防滑弧形单动扳机通过双侧冲压不锈钢连杆从 .50 AE 宽大弹匣井左右两侧向后延伸连接阻铁，造就清脆利落的两道火约 4 磅单动扳机力感。',
  },
  {
    id: 'deagle_sear',
    bomCode: 'T-04',
    nameZh: '精密单动阻铁与半自动断路器座',
    calloutLabel: '单动阻铁与断路器',
    nameEn: 'CNC Single-Action Sear & Semi-Auto Disconnector',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-6.68, 0.45, 0],
    explodeSteps: [{ range: [0.76, 0.94], offset: [-2.2, 3.4, 2.4] }],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [0, 0.25, 0],
    labelAppearAt: 0.78,
    roleTag: '待击挂机锁止 / 套筒不到位半自动断路',
    description:
      '精密研磨钢制阻铁鼻稳稳挂住马刺击锤待击槽；右侧立式断路器在套筒未完全闭锁或后坐期间压下连杆脱开啮合，彻底杜绝不到位击发与意外连发。',
  },

  // ============================================================================
  // 4. 7-ROUND .50 AE STEEL MAGAZINE ASSEMBLY ('magazine' · 4)
  // ============================================================================
  {
    id: 'deagle_mag_body',
    bomCode: 'M-01',
    nameZh: '7发 .50 AE 发蓝钢制单排弹匣体',
    calloutLabel: '7发 .50 AE 钢弹匣体',
    nameEn: '7-Round .50 Action Express Blued Steel Magazine Body',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-5.35, -4.65, 0],
    assembledRot: [0, 0, DEAGLE_GRIP_ANGLE],
    explodeSteps: [
      ...MAG_STAGE1,
      { range: [0.5, 0.62], offset: [0.4, 0.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -2.5, 0],
    labelAppearAt: 0.08,
    roleTag: '容纳 12.7×32.6mm 巨型马格南手枪弹',
    description:
      '冷轧高碳钢板折弯焊接并发蓝防锈处理的重型单排供弹盒，前后内腔长达 38mm 以容纳全长 40mm 的 .50 AE 巨弹，侧壁整齐冲有 7 枚余弹观察圆孔。',
  },
  {
    id: 'deagle_mag_follower',
    bomCode: 'M-02',
    nameZh: '.50 AE 半圆鞍面高可视托弹板',
    calloutLabel: '.50 AE 鞍面托弹板',
    nameEn: '.50 AE Concave Cartridge-Saddle Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [-4.66, -2.09, 0],
    assembledRot: [0, 0, DEAGLE_GRIP_ANGLE],
    explodeSteps: [
      ...MAG_STAGE1,
      { range: [0.52, 0.64], offset: [4.6, 1.2, 2.6] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, 0, 0],
    labelAppearAt: 0.5,
    roleTag: '稳定承托 .500" 粗径弹体 / 触发空仓挂机',
    description:
      '匹配 .50 AE 粗壮筒形弹壳的橙色鞍面托弹板，保证大质量弹药高速上托绝不俯仰卡滞；左前缘阶梯凸台在打空第 7 发后精准顶起空仓挂机杆。',
  },
  {
    id: 'deagle_mag_spring',
    bomCode: 'M-03',
    nameZh: '.50 AE 宽幅矩形螺旋弹匣托弹簧',
    calloutLabel: '宽幅矩形弹匣托弹簧',
    nameEn: 'Heavy-Duty .50 AE Rectangular Magazine Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [-5.67, -5.86, 0],
    assembledRot: [0, 0, DEAGLE_GRIP_ANGLE],
    explodeSteps: [
      ...MAG_STAGE1,
      { range: [0.52, 0.64], offset: [-2.8, -1.6, 2.6] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [0, -2.0, 0],
    labelAppearAt: 0.52,
    roleTag: '高推力克服套筒极速往复供弹间隙',
    description:
      '加粗琴钢丝绕制的超宽矩形截面弹匣簧，在套筒极速后坐复进的短短数毫秒内将沉重的 300 格令 .50 AE 实弹稳准顶升至单进抱弹口。',
  },
  {
    id: 'deagle_mag_baseplate',
    bomCode: 'M-04',
    nameZh: '平齐式指托弹匣底盖与钢锁片',
    calloutLabel: '平齐指托弹匣底盖',
    nameEn: 'Flush-Fit Finger-Rest Magazine Floorplate & Insert',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [-6.769, -9.947, 0],
    assembledRot: [0, 0, DEAGLE_GRIP_ANGLE],
    explodeSteps: [
      ...MAG_STAGE1,
      { range: [0.5, 0.64], offset: [4.8, -1.4, -2.0] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [0.2, -0.1, 0],
    labelAppearAt: 0.5,
    roleTag: '严丝合缝贴合握把底缘 / 前伸小指托唇',
    description:
      '上沿按 -15° 握把底角精密斜切与镀铬机匣及橡胶握把底面 0 缝隙平齐贴合，前端带经典沙漠之鹰微翘指托唇，内置中心圆凸钢制防脱锁片。',
  },
];

export const DEAGLE_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'deagle_sa_trigger',
    stepNum: '01',
    shortLabel: '单动扣扳机释阻铁',
    title: '阶段 1 · 扣动弧形单动扳机与双连杆拉脱阻铁',
    range: [0.0, 0.15],
    description:
      '套筒手动保险处于红点射击位；手指扣动弧形单动扳机，双侧不锈钢传力连杆绕过宽大 .50 AE 弹匣井向后拉动单动阻铁，使阻铁鼻干脆脱离外露马刺击锤底部待击卡槽。',
  },
  {
    id: 'deagle_hammer_ignition',
    stepNum: '02',
    shortLabel: '马刺击锤挥击点火',
    title: '阶段 2 · 主击发簧顶杆推动马刺击锤敲击长击针',
    range: [0.15, 0.23],
    description:
      '握把背脊内的强力螺旋主簧经顶杆向上猛推，驱动外露马刺击锤绕横销高速向前挥击 (+X)，重重敲击长击针尾帽；击针尖瞬间刺破 .50 AE 大号手枪底火引燃马格南装药。',
  },
  {
    id: 'deagle_gas_port_blast',
    stepNum: '03',
    shortLabel: '膛底导气与枪口烈焰',
    title: '阶段 3 · 300格令弹头出膛与膛底导气道前置充气',
    range: [0.23, 0.34],
    description:
      '12.7mm (.500") 覆铜空尖弹头沿 6 英寸固定多边形枪管加速冲出枪口，爆发出震撼环形冲击波火球；同时部分高压火药燃气经弹膛前下方导气孔流入枪管前下气室，猛烈冲击套筒前置导气活塞！',
  },
  {
    id: 'deagle_piston_bolt_unlock',
    stepNum: '04',
    shortLabel: '活塞推套筒旋栓开锁',
    title: '阶段 4 · 固定枪管不动、导气活塞推套筒驱动四突笋旋锁',
    range: [0.34, 0.54],
    description:
      '6 英寸三角形枪管与准星全程纹丝不动！高压燃气推动敞顶桥式套筒先行后退自由行程，内壁螺旋槽拨动凸轮销强制四突笋枪机旋转约 39° 脱离弹膛节套，随后携枪机高速后坐到底并压倒击锤、压缩双联复进簧。',
  },
  {
    id: 'deagle_extract_eject',
    stepNum: '05',
    shortLabel: '爪钩拉壳柱塞抛壳',
    title: '阶段 5 · 枪机爪式抽壳钩拉壳与弹性柱塞右上抛壳',
    range: [0.46, 0.72],
    description:
      '枪机右侧重型抽壳钩死死咬住 .50 AE 缩缘黄铜弹壳将其抽出固定弹膛；一旦弹壳前口退出节套，枪机面左下方的弹簧抛壳柱塞瞬间发力，将硕大空弹壳从敞顶套筒右上方猛烈翻滚弹出。',
  },
  {
    id: 'deagle_twin_return_lock',
    stepNum: '06',
    shortLabel: '双簧推弹回转闭锁',
    title: '阶段 6 · 双联并列复进簧推弹上坡与四突笋逆旋锁死',
    range: [0.56, 0.86],
    description:
      '钢弹匣托弹簧将下一发 .50 AE 巨弹顶至抱弹口；并列双复进簧释放能量推桥式套筒与枪机前冲，推新弹顺镜面供弹坡滑入固定弹膛，终段螺旋槽驱动四突笋枪机反向旋转 39° 重新刚性锁死。',
  },
  {
    id: 'deagle_sa_reset',
    stepNum: '07',
    shortLabel: '断路交接单动复位',
    title: '阶段 7 · 松开扳机，断路器复位重新啮合单动阻铁',
    range: [0.86, 1.0],
    description:
      '射手松开单动扳机，双侧传力连杆前移并在断路器弹回后重新卡入单动阻铁工作台面，外露马刺击锤保持全待击昂首姿态，随时准备下一发 .50 AE 雷霆击发。',
  },
];

/**
 * Real-time mechanical kinematics for all 24 Desert Eagle Mark XIX parts at firing progress f ∈ [0, 1].
 * Authentic Gas-Operated Rotating-Bolt Pistol Physics:
 *  - deagle_barrel & deagle_front_sight stay 100% FIXED (dx=0, rot=[0,0,0])!
 *  - deagle_slide (w/ integrated gas piston), deagle_safety & deagle_rear_sight stroke rearward (-4.95).
 *  - deagle_bolt & deagle_extractor dwell near X=0 while rotating rx = +0.68 rad (~39°), then stroke back (-4.35).
 *  - deagle_recoil_springs compress dynamically via scaleX against stationary deagle_recoil_rods.
 *  - Upright deagle_hammer swings forward (rz < 0 -> +X) at ignition, then gets cammed back down by recoiling slide!
 */
export function computeDeagleFiringKinematics(
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

  // 1. Gas-Operated Open-Top Bridge Slide + Short-Stroke Piston Stroke (0 -> -4.95 cm at f=0.54 -> 0 at f=0.855)
  const slideBack = seg(f, 0.315, 0.54);
  const slideReturn = seg(f, 0.57, 0.855);
  const slideDX = -4.95 * (slideBack - slideReturn);
  const slideTravel = -slideDX; // >= 0

  // 2. True Helical Cam-Pin 4-Lug Rotating Bolt Law:
  // Over the first 6.0 mm of carrier travel (slideTravel in [0, 0.60] cm), the slide's helical cam slot
  // rotates the bolt & cam pin by +0.68 rad (~39°) while holding zero initial longitudinal velocity;
  // once unlocked, bolt & carrier stroke rearward together to -4.35 cm, reversing cleanly into 4-lug lockup on return!
  const camLinear = clamp01(slideTravel / 0.6);
  const camSmooth = camLinear * camLinear * (3 - 2 * camLinear);
  const boltRX = 0.68 * camSmooth;
  const camDwell = 0.6 * (1 - Math.exp(-slideTravel / 0.6));
  const boltDX = -(slideTravel - camDwell);

  switch (partId) {
    // Fixed triangular barrel, barrel-mounted front sight & dual recoil guide rods/yoke stay 100% stationary!
    case 'deagle_barrel':
    case 'deagle_front_sight':
    case 'deagle_recoil_rods': {
      break;
    }

    case 'deagle_slide':
    case 'deagle_safety':
    case 'deagle_rear_sight': {
      dx = slideDX;
      break;
    }

    case 'deagle_bolt': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'deagle_cam_pin': {
      // Radially seated in bolt cam bore on bore centerline (Y=2.60, Z=0): translates & rotates coaxially with bolt!
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'deagle_extractor': {
      dx = boltDX;
      rx = boltRX;
      const rimSnap = Math.sin(linearSeg(f, 0.77, 0.845) * Math.PI);
      dz = 0.08 * rimSnap;
      break;
    }

    case 'deagle_firing_pin': {
      const strike = seg(f, 0.145, 0.19) - seg(f, 0.23, 0.31);
      dx = boltDX + 0.44 * strike;
      break;
    }

    case 'deagle_recoil_springs': {
      // Twin parallel springs span local X in [2.46, 12.50] (L0 = 10.04)
      // Rear end (2.46) seats on stationary figure-8 retainer plate; front end (12.50) compresses with slideDX!
      const x0Orig = 2.46;
      const L0 = 10.04;
      const x1New = 12.5 + slideDX;
      const LNew = Math.max(4.5, x1New - x0Orig);
      scaleX = LNew / L0;
      dx = x0Orig - x0Orig * scaleX;
      break;
    }

    case 'deagle_hammer': {
      // Cocked back at rz = 0 (worldY_max = +1.74 below bolt/safety) -> crisp SA forward strike (rz = -0.62) in [0.085, 0.155]
      // hitting exposed firing pin at Y = 2.50 -> cammed down early [0.295, 0.355] before safety drum sweeps past -> settles onto sear (rz = 0)
      const swingForward = seg(f, 0.085, 0.155);
      const recock = seg(f, 0.295, 0.355);
      const overcock = Math.sin(linearSeg(f, 0.355, 0.56) * Math.PI) * 0.08;
      const settle = seg(f, 0.86, 0.94);
      rz = -0.62 * swingForward + 0.68 * recock + overcock - 0.06 * settle;
      break;
    }

    case 'deagle_hammer_strut': {
      // Expands upward along -15° grip axis when hammer falls; compresses mainspring when slide recocks hammer
      const swingForward = seg(f, 0.085, 0.155);
      const recock = seg(f, 0.295, 0.355);
      const overcock = Math.sin(linearSeg(f, 0.355, 0.56) * Math.PI) * 0.14;
      const rise = swingForward - recock - overcock;
      dx = 0.09 * rise;
      dy = 0.34 * rise;
      break;
    }

    case 'deagle_trigger': {
      // Curved SA trigger shoe pulls rearward (-X via rz < 0) in [0.00, 0.14], audible reset in [0.87, 0.955]
      const pull = seg(f, 0.0, 0.14) - seg(f, 0.87, 0.955);
      const disconnectDip = seg(f, 0.35, 0.43) - seg(f, 0.88, 0.945);
      rz = -0.19 * pull;
      dy = -0.05 * disconnectDip;
      break;
    }

    case 'deagle_sear': {
      // Sear nose rotates clear of full-cock hammer hook on pull, snaps back under torsion spring to catch recocked hammer
      const trip = seg(f, 0.06, 0.14) - seg(f, 0.37, 0.44);
      rz = -0.16 * trip;
      break;
    }

    case 'deagle_mag_follower': {
      const feedPulse = seg(f, 0.52, 0.63) - seg(f, 0.66, 0.8);
      dx = 0.11 * feedPulse;
      dy = 0.42 * feedPulse;
      break;
    }

    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes .50 Action Express (300gr JHP) ballistics, forward gas-cylinder tap flash,
 * massive magnum ring muzzle blast, and spent .50 AE brass case ejection.
 */
export function computeDeagleBallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);

  const slideBack = seg(f, 0.315, 0.54);
  const slideReturn = seg(f, 0.57, 0.855);
  const slideTravel = 4.95 * (slideBack - slideReturn);
  const camDwell = 0.6 * (1 - Math.exp(-slideTravel / 0.6));
  const boltDX = -(slideTravel - camDwell);

  // 1. .50 AE 300gr JHP Projectile (seated at [2.53, 2.60, 0] matching caseX=0.95 + bulletLocalOffset=1.58!)
  const bulletVisible = f < 0.47;
  let bulletX = 2.53;
  let streakLength = 0;

  if (f >= 0.205 && f < 0.305) {
    const u = Math.pow(linearSeg(f, 0.205, 0.305), 1.45);
    bulletX = 2.53 + 13.52 * u; // Exits 6" polygonal barrel muzzle X = 16.05 at f = 0.305
    streakLength = 3.6 * u;
  } else if (f >= 0.305 && f < 0.47) {
    const u = linearSeg(f, 0.305, 0.47);
    bulletX = 16.05 + 42.0 * u;
    streakLength = 8.4 * (1 - u * 0.45);
  }

  // 2. Spent .50 AE Rebated-Rim Brass Case:
  // Seated in stationary chamber at [0.95, 2.60, 0] -> extracted rearward by boltDX [0.32, 0.48] ->
  // kicked out open top-right bridge slide by bolt ejector plunger [0.48, 0.76]!
  const spentCaseVisible = f < 0.76;
  let caseX = 0.95;
  let caseY = 2.6;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.32 && f < 0.48) {
    caseX = 0.95 + boltDX;
  } else if (f >= 0.48 && f < 0.76) {
    const u = linearSeg(f, 0.48, 0.76);
    const travelAtEject = 4.95 * seg(0.48, 0.315, 0.54);
    const boltAtEject = -(
      travelAtEject -
      0.6 * (1 - Math.exp(-travelAtEject / 0.6))
    );
    const ejectStartX = 0.95 + boltAtEject;
    caseX = ejectStartX - 3.6 * u;
    caseY = 2.65 + 8.2 * u - 9.8 * u * u;
    caseZ = 11.4 * u;
    caseRX = u * 8.2;
    caseRY = u * 11.5;
    caseRZ = -u * 9.6;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.76);
    }
  }

  // 3. Chamber Ignition Flash, Forward Under-Bore Gas Cylinder Impulse & Legendary .50 AE Muzzle Fireball!
  let chamberFlashIntensity = 0;
  if (f >= 0.185 && f <= 0.285) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.185, 0.285) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.255 && f <= 0.355) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.255, 0.355) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.295 && f <= 0.4) {
    const u = linearSeg(f, 0.295, 0.4);
    muzzlePlumeScale = 0.55 + 1.65 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.9;
  }

  // 4. Next .50 AE Cartridge in Steel Mag -> Stripped up Polished Feed Ramp into Chamber [0.95, 2.60, 0]
  let nextX = -4.25;
  let nextY = 0.85;
  let nextRZ = 0.1;

  if (f >= 0.52 && f < 0.62) {
    const u = seg(f, 0.52, 0.62);
    nextX = -4.25 + 0.28 * u;
    nextY = 0.85 + 0.55 * u;
    nextRZ = 0.1 + 0.08 * u;
  } else if (f >= 0.62 && f < 0.845) {
    const u = seg(f, 0.62, 0.845);
    const rampArc = Math.sin(u * Math.PI) * 0.26;
    nextX = -3.97 + (0.95 - -3.97) * u;
    nextY = 1.4 + (2.6 - 1.4) * u + rampArc;
    nextRZ = 0.18 * (1 - u);
  } else if (f >= 0.845) {
    nextX = 0.95;
    nextY = 2.6;
    nextRZ = 0;
  }

  // 5. Reserve .50 AE Cartridge below in Magazine Stack
  const magRise = seg(f, 0.52, 0.72);
  const resX = -4.54 + (-4.25 - -4.54) * magRise;
  const resY = -0.24 + (0.85 - -0.24) * magRise;

  return {
    bulletVisible,
    bulletPos: [bulletX, 2.6, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [15.1, 1.48, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0],
  };
}

const DEAGLE_CHROME_ATLAS = {
  albedoFile: 'deagle_chrome_albedo.webp',
  normalFile: 'deagle_chrome_normal.webp',
  roughnessFile: 'deagle_chrome_roughness.webp',
};

export const DEAGLE_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  deagle_barrel: {
    ...DEAGLE_CHROME_ATLAS,
    normalScale: 0.1,
    metalness: 0.82,
    roughness: 0.2,
  },
  deagle_slide: {
    ...DEAGLE_CHROME_ATLAS,
    normalScale: 0.1,
    metalness: 0.82,
    roughness: 0.2,
  },
  deagle_frame: {
    ...DEAGLE_CHROME_ATLAS,
    normalScale: 0.1,
    metalness: 0.82,
    roughness: 0.2,
  },
  deagle_grip: {
    ...DEAGLE_CHROME_ATLAS,
    normalScale: 0.56,
    metalness: 0.05,
    roughness: 0.72,
  },
};

export const DEAGLE_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'deagle_chrome',
    weapon: 'deagle',
    titleCn: 'Mark XIX 镜面拉丝银铬与橡胶握把贴图组',
    partTag: 'B-01 / B-02 / F-01 / F-05',
    resolution: '2048 × 1024 px',
    summary:
      '专为沙漠之鹰 Mark XIX .50 AE 定制的 2K 铂银硬铬与握把复合图集：还原铂银拉丝镀铬 (#b4c0ce, Metalness 0.82, Roughness 0.20) 与倒角边缘 AO 轮廓阴影、双侧深凹刻原厂铭文 DESERT EAGLE PISTOL / MAGNUM RESEARCH INC. / IMI MADE IN ISRAEL .50 AE、鲜红保险射击指示圆点，以及哑光黑细皮纹 IMI/MRI 橡胶握把色块。',
    highlights: [
      '铂银拉丝硬铬 (#b4c0ce, Metalness 0.82 / Roughness 0.20) + 边缘倒角 AO',
      '凹刻 DESERT EAGLE PISTOL / IMI MADE IN ISRAEL .50 AE',
      '红点保险指示釉色 + 哑光黑 IMI/MRI 徽章防滑橡胶层',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'deagle_chrome_albedo.webp',
        note: 'sRGB · 镜面拉丝银铬 / 深灰凹刻铭文 / 红保险点 / 黑橡胶握把',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'deagle_chrome_normal.webp',
        note: 'Linear · 平整 CNC 拉丝微纹 + 凹刻钢印斜坡 + 橡胶防滑皮纹',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'deagle_chrome_roughness.webp',
        note: 'Linear · 镜面银铬极低粗糙度 (0.14) vs 哑光橡胶握把 (0.73)',
      },
    ],
  },
  {
    id: 'deagle_detail',
    weapon: 'deagle',
    titleCn: '四突笋回转枪机、双复进组与单动火控无缝贴图',
    partTag: '20 INTERNAL & MAG PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为四突笋回转枪机、凸轮导销、长击针、双侧水滴形保险、双联并列复进簧组、外露马刺击锤及 7 发 .50 AE 发蓝钢弹匣提供无缝平铺的 CNC 精密刀纹法线与油膜粗糙度细节。',
    highlights: [
      '四突笋枪机与双导杆精密磨削金属拉丝法线',
      '外露马刺击锤、单动阻铁与发蓝钢弹匣微晶油膜',
      '覆盖其余全部 20 个导气内件、火控与弹匣节点',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于四突笋枪机/击锤/双导杆/保险/钢弹匣等',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 金属微表面各向异性枪油光泽变化',
      },
      {
        kind: 'Normal',
        labelCn: '工程弹性体皮纹法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于平齐指托弹匣底盖与鞍面托弹板',
      },
    ],
  },
];

export const DEAGLE_PLUGIN: WeaponRuntimePlugin = {
  id: 'deagle',
  partGroups: DEAGLE_PART_GROUPS,
  timelinePresets: DEAGLE_TIMELINE_PRESETS,
  parts: DEAGLE_PARTS,
  firingPhases: DEAGLE_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(DEAGLE_FIRING_PHASES, f),
  computeFiringKinematics: computeDeagleFiringKinematics,
  computeBallisticsState: computeDeagleBallisticsState,
  pbrBindings: DEAGLE_PBR_BINDINGS,
  pbrSuites: DEAGLE_PBR_SUITES,
};
