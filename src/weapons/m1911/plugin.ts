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
  M1911_BARREL_LUG_PIN_X0,
  M1911_BARREL_LUG_PIN_Y0,
  M1911_BORE_Y,
  M1911_GRIP_ANGLE_RAD,
  M1911_GRIP_SPRING_ROT_Z,
  M1911_LINK_ALPHA0,
  M1911_LINK_LEN,
  M1911_LINK_PIVOT_X,
  M1911_LINK_PIVOT_Y,
} from './meshes/m1911Geometries';

export const M1911_ID = 'm1911' as WeaponId;
export const M1911_CALIBER: CaliberProfile = '45_acp';

export const M1911_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '5英寸枪管、单绞链闭锁、枪口衬套与磷化钢套筒组',
    nameEn: '5" Barrel, Swinging Link, Bushing & Parkerized Slide',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: '锻钢底把、空仓挂机杆、弧背簧壳与双菱格胡桃木护片',
    nameEn: 'Forged Steel Frame, Controls & Double-Diamond Walnut Grips',
    badgeColor: '#64748b',
  },
  {
    key: 'fire_control',
    nameZh: '外露长尾击锤、握把保险、直推扳机与三叉板簧组',
    nameEn: 'Spur Hammer, Grip Safety, Sliding Trigger & 3-Leaf Spring',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '7发 .45 ACP 单排钢制弹匣、凸点托板与托弹簧组',
    nameEn: '7-Rd Single-Stack .45 ACP Magazine & Dimpled Follower',
    badgeColor: '#e11d48',
  },
];

export const M1911_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: '1943 年柯尔特哈特福德兵工厂原厂 Colt M1911A1 U.S. Army（.45 ACP）标准合拢闭锁态：枪管顶部双半圆闭锁筋死锁于套筒顶槽，勃朗宁单绞链直立支撑枪膛，外露击锤待击。',
  },
  {
    id: 'field_strip',
    label: '美军 FM 23-35 野战快拆',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '按美军标准野战教范无工具快拆：卸下 7 发单排弹匣，压入复进簧帽并顺时针旋转枪口衬套 45° 释放复进簧，对齐套筒缺口推出空仓挂机横销，前推套筒滑脱底把。',
  },
  {
    id: 'sub_assembly',
    label: '套筒火控二级细拆',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '从套筒前端抽出 5 英寸双闭锁筋枪管与单绞链，下推击针止动板抽出惯性击针与内置管状抽壳钩；分离双菱格美洲黑胡桃木护片、拇指保险、弧形主簧壳与握把保险。',
  },
  {
    id: 'full_exploded',
    label: '全枪 24 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 24 个 1:1 精密机械零件在三维空间零干涉展开：完整呈现约翰·摩西·勃朗宁在 1911 年奠定百年现代自动手枪黄金标准的单绞链偏移闭锁与直推单动火控体系。',
  },
];

export const M1911_PARTS: WeaponPartSpec[] = [
  // ==================== 1. SLIDE, BARREL, LINK & RECOIL GROUP ('slide' · 9 parts) ====================
  {
    id: 'm1911_slide',
    bomCode: 'U-01',
    nameZh: '磷化锻钢圆顶套筒 (含14道后防滑纹与机械准星照门)',
    calloutLabel: '磷化钢圆顶套筒',
    nameEn: 'Parkerized Forged Steel Slide w/ Rear Serrations & GI Sights',
    group: 'slide',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [3.2, 4.6, 0] },
      { range: [0.34, 0.72], offset: [-2.2, 5.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [3.6, 3.72, 0],
    labelAppearAt: 0.04,
    roleTag: '顶内双半圆闭锁槽 · 45.5mm 直线后坐行程',
    description:
      '柯尔特 M1911A1 标志性的圆拱顶、平侧壁整块锻钢套筒：内顶壁精密车削两道与枪管完全互补的半圆形闭锁凹槽，尾部两侧铣出 14 道垂直防滑拉槽，左侧深压勃朗宁历代专利年份与哈特福德厂铭，右侧开阔抛壳窗并压印「MODEL OF 1911. U.S. ARMY」。',
  },
  {
    id: 'm1911_barrel',
    bomCode: 'U-02',
    nameZh: '5英寸 .45 ACP 六膛线枪管 (含顶部双闭锁筋与下绞链耳)',
    calloutLabel: '5"双闭锁筋枪管',
    nameEn: '5" .45 ACP Rifled Barrel w/ Dual Top Locking Ribs',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [3.2, 4.6, 0] },
      { range: [0.34, 0.72], offset: [-1.0, 0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [5.5, 3.35, 0],
    labelAppearAt: 0.08,
    roleTag: '127.8mm 1:16左旋六膛线 · 双顶筋与单绞链下沉偏移闭锁',
    description:
      '全长 127.8 mm（5.03 英寸）冷锻精车 .45 ACP 枪管：膛室前段顶部一体加工两道高强度半圆闭锁凸筋与套筒顶槽咬合承压，下方双耳支座通过横销与单绞链铰接；射击短后坐 3 mm 后由绞链向下拉降尾部 2.7 mm，令枪管轻微仰起 +2.1° 彻底脱离闭锁。',
  },
  {
    id: 'm1911_barrel_link',
    bomCode: 'U-03',
    nameZh: '勃朗宁 0.278英寸单绞链闭锁摇臂与铰销',
    calloutLabel: '勃朗宁单绞链摇臂',
    nameEn: 'Browning 0.278" Swinging Barrel Link & Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [M1911_LINK_PIVOT_X, M1911_LINK_PIVOT_Y, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [3.2, 2.2, 0] },
      { range: [0.36, 0.76], offset: [-1.46, 0.55, 2.4] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0.05, 0.35, 0],
    labelAppearAt: 0.16,
    roleTag: '7.06mm 孔距圆弧摆动 · 短后坐精准拉降枪管开锁',
    description:
      '约翰·勃朗宁在 1911 年取代早期双绞链平行下沉设计的灵魂发明：这枚两孔中心距仅 7.06 mm（0.278 英寸）的“8”字形锻钢单绞链，下孔套在底把静止的空仓挂机横销上，上孔铰接枪管下耳；枪管后退时绞链绕下销向后旋转 53°，强制枪管尾部沿精确圆弧向下脱锁！',
  },
  {
    id: 'm1911_barrel_bushing',
    bomCode: 'U-04',
    nameZh: '枪口快拆旋转衬套 (Barrel Bushing)',
    calloutLabel: '枪口旋转定位衬套',
    nameEn: 'Quarter-Turn Removable Muzzle Barrel Bushing',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [10.65, M1911_BORE_Y, 0],
    explodeSteps: [
      { range: [0.04, 0.18], offset: [3.8, 0, 0], rotation: [0.78, 0, 0] },
      { range: [0.22, 0.58], offset: [3.75, 7.25, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [0.3, 0.85, 0],
    labelAppearAt: 0.12,
    roleTag: '顺时针旋45°释放复进簧帽 · 枪口微米同心支承',
    description:
      '嵌锁在套筒最前端的精密钢制环形衬套，下方垂挂半月形挡裙牢牢压住复进簧帽；不仅确保枪管前端在每次闭锁时精准归中复原精度，野战分解时只需压下弹簧帽并将衬套旋转 45° 即可免工具拆出整套复进机构。',
  },
  {
    id: 'm1911_recoil_plug',
    bomCode: 'U-05',
    nameZh: '滚花空心钢制复进簧帽 (Recoil Spring Plug)',
    calloutLabel: '滚花复进簧帽',
    nameEn: 'Checkered Hollow Steel Recoil Spring Plug',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [9.75, 1.3, 0],
    explodeSteps: [
      { range: [0.04, 0.18], offset: [4.8, 0, 0] },
      { range: [0.24, 0.62], offset: [3.65, 2.9, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [0.8, 0, 0],
    labelAppearAt: 0.18,
    roleTag: '套筒前下孔顶帽 · 承压 16 磅复进簧前推反力',
    description:
      '前端车有防滑菱格纹的深筒形钢帽，包裹复进簧前端并由枪口衬套下挡裙阻挡限位，野战分解时需以拇指按压释力防止弹簧高速弹出。',
  },
  {
    id: 'm1911_recoil_guide',
    bomCode: 'U-06',
    nameZh: '半圆法兰短复进簧导杆',
    calloutLabel: '短复进簧导杆',
    nameEn: 'Flanged Short Recoil Spring Guide Rod',
    group: 'slide',
    material: 'stainless',
    assembledPos: [1.95, 1.3, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [0.5, 2.3, 0] },
      { range: [0.32, 0.68], offset: [-6.65, 0.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [1.8, -0.35, 0],
    labelAppearAt: 0.3,
    roleTag: '后法兰抵靠底把冲击面 · 防止压簧弯曲失稳',
    description:
      '经典美军制式短导杆，后端弧形宽法兰紧贴底把前冲击台面承接套筒猛烈后坐撞击，同时支撑复进簧后段防止高速压缩时扭曲卡滞。',
  },
  {
    id: 'm1911_recoil_spring',
    bomCode: 'U-07',
    nameZh: '16磅高碳琴钢丝螺旋复进簧',
    calloutLabel: '16磅螺旋复进簧',
    nameEn: '16-lb Helical Music-Wire Recoil Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [1.95, 1.3, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [2.4, 2.3, 0] },
      { range: [0.32, 0.68], offset: [1.85, 0.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [4.5, 0.4, 0],
    labelAppearAt: 0.22,
    roleTag: '22圈动态压缩蓄能 · 驱动套筒高速复进闭锁',
    description:
      '标准 16 磅级军用规格螺旋复进压簧，套于短导杆与空心簧帽之间，在击发后坐行程内吸收 .45 ACP 重弹反冲能量并精准推动套筒复位推弹入膛。',
  },
  {
    id: 'm1911_firing_pin',
    bomCode: 'U-08',
    nameZh: '惯性浮动击针与矩形尾止动板',
    calloutLabel: '惯性击针与止动板',
    nameEn: 'Inertia Firing Pin & Rectangular Firing Pin Stop',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-4.45, M1911_BORE_Y, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [3.2, 4.6, 0] },
      { range: [0.36, 0.76], offset: [-12.25, 5.45, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [-1.2, 0.25, 0],
    labelAppearAt: 0.38,
    roleTag: '短于通道惯性防跌落走火 · 单片尾挡板双锁击针与抽壳钩',
    description:
      '勃朗宁独创的短尺寸惯性击针：全长短于套筒击针孔，平时在内置小簧作用下完全退缩不接触底火，即使击锤贴靠尾端跌落亦不会误击；仅受击锤高速敲击借惯性前飞点燃底火，由尾部垂直插入的钢制止动板同步锁住击针与抽壳钩。',
  },
  {
    id: 'm1911_extractor',
    bomCode: 'U-09',
    nameZh: '内置弹簧钢片管状抽壳钩',
    calloutLabel: '内置管状抽壳钩',
    nameEn: 'Internal Spring-Tempered Tubular Claw Extractor',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [-4.1, M1911_BORE_Y, 0.56],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [3.2, 4.6, 0] },
      { range: [0.36, 0.76], offset: [-11.3, 3.05, 2.64] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [1.0, 0.2, 0],
    labelAppearAt: 0.42,
    roleTag: '受控供弹 (Controlled Feed) 弹性抓爪 · 全藏套筒防尘泥',
    description:
      '深埋于套筒右侧纵孔内的细长弹性合金钢抽壳钩：无需额外小簧，全靠自身预弯弹性夹紧弹底缘；新弹自弹匣托升瞬间即滑入抓爪下方实现可靠的“受控供弹”，并在退壳时牢牢拽出 230 格令 .45 ACP 铜壳。',
  },

  // ==================== 2. FORGED FRAME, CONTROLS & WALNUT GRIPS ('frame' · 6 parts) ====================
  {
    id: 'm1911_frame',
    bomCode: 'F-01',
    nameZh: '整块锻钢 M1911A1 军用底把 (18°经典指向握把角)',
    calloutLabel: '锻钢底把骨架',
    nameEn: 'Forged Alloy Steel M1911A1 Frame w/ 18° Grip Angle',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [3.2, 0.65, 0],
    labelAppearAt: 0.04,
    roleTag: '全枪刚性基准骨架 · 1924 A1 扳机护圈后指槽减薄',
    description:
      '由整块碳锰合金钢锻坯经数十道铣削成型的全枪基准底座（零位不动件）：采用举世赞誉的 18°（108°夹角）自然指向握把倾角，1924 年 A1 改型新增扳机护圈后方双侧凹槽指窝与加长尾舌，右前侧深压「UNITED STATES PROPERTY」及美军军械序列号。',
  },
  {
    id: 'm1911_slide_stop',
    bomCode: 'F-02',
    nameZh: '左侧空仓挂机杆与枪管绞链横销',
    calloutLabel: '空仓挂机与绞链销',
    nameEn: 'Left-Side Slide Stop Lever & Barrel Link Cross-Pin',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [M1911_LINK_PIVOT_X, M1911_LINK_PIVOT_Y, 0],
    explodeSteps: [{ range: [0.06, 0.28], offset: [0, 0, -4.6] }],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [-1.8, 0.25, -1.2],
    labelAppearAt: 0.14,
    roleTag: '一身兼三职：绞链定轴 + 空仓挂机 + 全枪分解主销',
    description:
      'M1911 精简工程哲学的巅峰构件：其横贯底把的圆柱轴既充当枪管单绞链的静止支承枢轴，又将上套筒与底把锁为一体；末发弹打空时由弹匣托弹板左耳向上顶起外杆卡入套筒缺口实现空仓挂机。',
  },
  {
    id: 'm1911_thumb_safety',
    bomCode: 'F-03',
    nameZh: '左置滚花拨片拇指手动保险 (Condition 1 锁止)',
    calloutLabel: '左置拇指手动保险',
    nameEn: 'Checkered Frame-Mounted Thumb Safety Lock',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [-6.85, 0.72, -1.2],
    explodeSteps: [{ range: [0.28, 0.62], offset: [0, 0.78, -3.8] }],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [-0.3, 0.35, -0.15],
    labelAppearAt: 0.34,
    roleTag: '待击上锁 (Cocked & Locked) · 同步机械死锁阻铁与套筒',
    description:
      '置于底把左后方由右手拇指自然操控的滚花拨片保险：当击锤处于满待击位时向上拨起，保险内凸耳即卡死阻铁防止其转动，同时外护翼嵌进套筒左下方半圆缺口锁死套筒，成就经典的“上膛待击上保险（Condition 1）”快速出枪携行状态。',
  },
  {
    id: 'm1911_mainspring_housing',
    bomCode: 'F-04',
    nameZh: 'A1 型弧背防滑直纹主簧壳与系枪环',
    calloutLabel: 'A1弧背主簧壳',
    nameEn: 'Arched Serrated M1911A1 Mainspring Housing w/ Lanyard Loop',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-8.4, -4.6, 0],
    explodeSteps: [{ range: [0.24, 0.6], offset: [-4.4, -1.6, 0] }],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [-0.5, -1.5, 0],
    labelAppearAt: 0.28,
    roleTag: '1924 M1911A1 标志性弧背掌托 · 内藏 23 磅螺旋主簧',
    description:
      '区分一战 M1911（直背）与二战 M1911A1（弧背）最直观的外观特征：沿底把后燕尾槽向上滑入的弧形隆起钢壳，外背铣满防滑纵纹并在底部铆接骑兵/伞兵系枪铁环，内部中空筒腔严密包裹击锤螺旋主簧并兼作三叉板簧压块。',
  },
  {
    id: 'm1911_grip_left',
    bomCode: 'F-05',
    nameZh: '左侧双菱格美洲黑胡桃木握把护片',
    calloutLabel: '左双菱格胡桃木护片',
    nameEn: 'Left Double-Diamond Checkered Walnut Grip Panel',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-5.05, -4.25, -1.24],
    explodeSteps: [{ range: [0.18, 0.54], offset: [0, 0, -6.36] }],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -1.2, -0.24],
    labelAppearAt: 0.22,
    roleTag: '20线手工滚花双菱格纹 · 黄铜螺套精装配',
    description:
      '经典柯尔特双菱格（Double-Diamond）20 LPI 滚花美洲黑胡桃木左侧护片，围绕上下两枚一字槽钢螺钉保留菱形光面岛区，赋予手掌在泥水与汗渍环境下的牢固抓握摩擦力。',
  },
  {
    id: 'm1911_grip_right',
    bomCode: 'F-06',
    nameZh: '右侧双菱格美洲黑胡桃木握把护片',
    calloutLabel: '右双菱格胡桃木护片',
    nameEn: 'Right Double-Diamond Checkered Walnut Grip Panel',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-5.05, -4.25, 1.24],
    explodeSteps: [{ range: [0.18, 0.54], offset: [0, 0, 5.36] }],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -1.2, 0.24],
    labelAppearAt: 0.22,
    roleTag: '亚麻籽油温润手搓漆面 · 贴合单排纤薄握径',
    description:
      '与左侧对称配对的美洲黑胡桃木右侧双菱格滚花护片，包裹单排弹匣井右壁，使 .45 ACP 重口径手枪仍保有极其纤薄顺手的握持周长。',
  },

  // ==================== 3. SINGLE-ACTION FIRE CONTROL ('fire_control' · 6 parts) ====================
  {
    id: 'm1911_hammer',
    bomCode: 'FC-01',
    nameZh: '外露宽尾滚花击锤与铰接传力挺杆',
    calloutLabel: '外露长尾击锤与挺杆',
    nameEn: 'Exposed Checkered Spur Hammer & Articulated Strut',
    group: 'fire_control',
    material: 'barrel_steel',
    assembledPos: [-7.25, 1.15, 0],
    explodeSteps: [{ range: [0.3, 0.68], offset: [-5.35, 5.05, 0] }],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-0.9, 1.35, 0],
    labelAppearAt: 0.3,
    roleTag: '双面拉丝钢体 + 半待击防滑脱保险齿',
    description:
      '经典宽尾滚花外露式锻钢单动击锤，底部开有满待击钩与深槽半待击防误落保险钩；后下方铰接一根细长钢制击锤挺杆，向下顶入弧背主簧壳内的弹簧顶帽传递 23 磅强力驱动力矩。',
  },
  {
    id: 'm1911_trigger',
    bomCode: 'FC-02',
    nameZh: 'A1 短型滚花直推扳机与环抱式扳机框',
    calloutLabel: '直推短扳机与扳机框',
    nameEn: 'Short Checkered Straight-Pull Trigger & Stirrup Bow',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-1.55, -0.35, 0],
    explodeSteps: [{ range: [0.34, 0.72], offset: [-10.95, 1.55, 3.6] }],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [1.5, -0.5, 0],
    labelAppearAt: 0.36,
    roleTag: '纯水平直线后滑无旋转弧度 · 铸就手枪界玻璃棒击发手感',
    description:
      '令 1911 在百年靶场与实战中无可匹敌的核心秘密：区别于绝大多数铰接摆动扳机，勃朗宁设计了环抱弹匣井两侧的 U 形钢框，让滚花短扳机在底把水平滑槽内作纯直线后退（约 4.2 mm）直接顶推单动阻铁，成就如折断玻璃棒般干脆利落的传奇一道火手感！',
  },
  {
    id: 'm1911_sear_disconnector',
    bomCode: 'FC-03',
    nameZh: '精密单动阻铁与套筒联动单发断连器',
    calloutLabel: '单动阻铁与断连器',
    nameEn: 'Single-Action Sear & Slide-Actuated Disconnector',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-5.75, 0.25, 0],
    explodeSteps: [{ range: [0.36, 0.74], offset: [-4.45, 3.55, -3.2] }],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [0.1, 1.1, 0],
    labelAppearAt: 0.4,
    roleTag: '套筒未完全闭锁即下压断连 · 严防早发与失控连发',
    description:
      '共轴装配于底把内的精密淬火阻铁与垂直桨状单发断连器：唯有当套筒完全前冲闭锁，断连器顶端圆头才能弹入套筒底部半月凹槽连通扳机框与阻铁；射击瞬间套筒一旦后退便立刻压下断连器切断传动，强制射手松指复位才能发射下一发。',
  },
  {
    id: 'm1911_grip_safety',
    bomCode: 'FC-04',
    nameZh: 'A1 加长护手尾舌自动握把保险',
    calloutLabel: '自动握把尾舌保险',
    nameEn: 'Tang Beavertail Automatic Grip Safety',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-7.65, 0.35, 0],
    explodeSteps: [{ range: [0.28, 0.66], offset: [-7.55, 1.25, 0] }],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-0.8, 0.65, 0],
    labelAppearAt: 0.3,
    roleTag: '美国骑兵部要求增设 · 虎口紧握下压方可解脱扳机框',
    description:
      '1910 年应美国陆军骑兵部防止马背跌落走火需求增设的被动安全机构：平时由三叉板簧右翼顶出，内舌直接顶死在直推扳机框正后方阻止扳机后移；只有射手虎口稳固握持压入约 8° 后内舌上抬让位，A1 型特别加长上尾舌以防击锤夹伤手掌虎口。',
  },
  {
    id: 'm1911_leaf_spring',
    bomCode: 'FC-05',
    nameZh: '勃朗宁三叉一体式弹簧钢片 (Sear Spring)',
    calloutLabel: '三叉一体钢板簧',
    nameEn: 'Browning Three-Prong Flat Sear Leaf Spring',
    group: 'fire_control',
    material: 'barrel_steel',
    assembledPos: [-7.35, -2.55, 0],
    explodeSteps: [{ range: [0.34, 0.72], offset: [-7.15, 0.05, 3.2] }],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [0, 0.8, 0],
    labelAppearAt: 0.42,
    roleTag: '一簧三用极简奇迹：左压阻铁、中顶断连器与扳机、右推握把保险',
    description:
      '枪械工程史上最受赞誉的多功能冲压弹簧钢片：底部插脚卡入底把槽并由主簧壳压死，上端分叉出三片独立弹臂——左臂赋予阻铁复位力、中臂顶升断连器与扳机框复位、右臂则将自动握把保险推回锁定态，无需一颗螺钉！',
  },
  {
    id: 'm1911_mainspring',
    bomCode: 'FC-06',
    nameZh: '23磅螺旋击锤主簧 (Mainspring)',
    calloutLabel: '23磅螺旋击锤主簧',
    nameEn: '23-lb Helical Hammer Mainspring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-9.25, -6.68, 0],
    assembledRot: [0, 0, M1911_GRIP_SPRING_ROT_Z],
    explodeSteps: [{ range: [0.32, 0.72], offset: [-6.55, -1.82, -2.6] }],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [2.6, 0, 0],
    labelAppearAt: 0.4,
    roleTag: '藏于弧背主簧壳内 · 压缩蓄能驱动击锤猛击惯性击针',
    description:
      '垂直安置在弧背主簧壳中空筒内的 23 磅螺旋琴钢丝主簧：枪机后坐压倒击锤时，击锤挺杆向下压缩弹簧储能；阻铁解脱瞬间，主簧迅猛弹伸推动击锤高速敲打惯性击针。',
  },

  // ==================== 4. 7-ROUND SINGLE-STACK .45 ACP MAGAZINE ('magazine' · 3 parts) ====================
  {
    id: 'm1911_mag_body',
    bomCode: 'M-01',
    nameZh: '7发 .45 ACP 单排钢制弹匣壳与焊底板',
    calloutLabel: '7发单排钢弹匣壳',
    nameEn: '7-Round Single-Stack .45 ACP Steel Magazine Body',
    group: 'magazine',
    material: 'barrel_steel',
    isShell: true,
    assembledPos: [-4.65, -3.55, 0],
    assembledRot: [0, 0, M1911_GRIP_ANGLE_RAD],
    explodeSteps: [
      { range: [0.0, 0.14], offset: [-2.4, -7.8, 0] },
      { range: [0.38, 0.74], offset: [-1.35, -4.65, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -3.8, 0],
    labelAppearAt: 0.06,
    roleTag: '13.8mm 纤薄单排钢匣 · 渐进释放锥形抱弹唇 + 侧检弹孔',
    description:
      '专为 11.43 mm 重型 .45 ACP 弹药打造的单排冲压折叠钢制弹匣，顶部抱弹唇经过精确淬火与渐进张口几何修形以保证受控供弹顺滑入膛，侧壁冲有 5 个余弹观察孔，底部焊接加强托底板。',
  },
  {
    id: 'm1911_mag_follower',
    bomCode: 'M-02',
    nameZh: '勃朗宁防前窜凸点单排钢制托弹板',
    calloutLabel: '凸点单排托弹板',
    nameEn: 'Browning Dimpled Single-Stack Steel Follower',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [-5.87, -7.31, 0],
    assembledRot: [0, 0, M1911_GRIP_ANGLE_RAD],
    explodeSteps: [
      { range: [0.0, 0.14], offset: [-2.4, -7.4, 0] },
      { range: [0.42, 0.78], offset: [4.27, -0.09, 3.6] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [0, 0.15, 0],
    labelAppearAt: 0.44,
    roleTag: '中部凸点防末发惯性前滑 · 左耳触发空仓挂机',
    description:
      '冲压折弯硬钢托弹板，顶面中央冲有一枚看似微小却至关重要的圆形“勃朗宁凸点”——专门用于卡住末发 .45 ACP 弹底沟槽防止手枪猛烈后坐时最后一发弹因惯性脱出抱弹唇导致卡壳；左前凸耳负责打空后顶起空仓挂机杆。',
  },
  {
    id: 'm1911_mag_spring',
    bomCode: 'M-03',
    nameZh: '单排弹匣螺旋托弹压簧',
    calloutLabel: '单排弹匣螺旋压簧',
    nameEn: 'Single-Stack Helical Magazine Follower Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [-6.33, -8.73, 0],
    assembledRot: [0, 0, M1911_GRIP_SPRING_ROT_Z],
    explodeSteps: [
      { range: [0.0, 0.14], offset: [-2.4, -7.4, 0] },
      { range: [0.44, 0.8], offset: [4.33, -2.37, -3.2] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [0.85, 0, 0],
    labelAppearAt: 0.48,
    roleTag: '18° 握把同轴压缩供弹 · CT 剖视严密顶托末发弹柱',
    description:
      '沿 18° 握把倾角精密排布于单排弹匣底部的高韧性冷拔弹簧钢托弹压簧，稳定托举 7 发沉重的 230 格令 .45 ACP 弹柱向上供弹并在末发耗尽时提供足够推力抬起空仓挂机杆。',
  },
];

export const M1911_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'm1911_phase_1',
    stepNum: '01',
    shortLabel: '压握保直推击发',
    title: '阶段 1 · 压下握把保险，直推短扳机释放单动击锤敲击惯性击针',
    range: [0.0, 0.15],
    description:
      '手掌虎口压入自动握把保险解除扳机框阻断；食指将短扳机纯水平直线后推 4.2 mm 拨开单动阻铁，23 磅主簧驱动外露长尾击锤高速前摆敲飞短惯性击针。',
  },
  {
    id: 'm1911_phase_2',
    stepNum: '02',
    shortLabel: '.45 ACP 145 MPa 激燃',
    title: '阶段 2 · 230格令 .45 ACP 底火点燃，顶部双闭锁筋死锁承压',
    range: [0.15, 0.25],
    description:
      '惯性击针点燃大号手枪底火，膛压迅速攀升至 145 MPa 峰值；枪管顶部两道半圆闭锁筋与套筒顶槽刚性死锁，驱动沉重的 230 格令（14.9 克）全被甲圆头弹头加速旋转前进。',
  },
  {
    id: 'm1911_phase_3',
    stepNum: '03',
    shortLabel: '出膛与 3mm 共同短后坐',
    title: '阶段 3 · 弹头以 255 m/s 出膛，枪管与套筒闭锁共同短后坐 3 mm',
    range: [0.25, 0.34],
    description:
      '重弹头于 f ≈ 0.29 脱离 5 英寸枪口并喷出橙色火球；在反冲力作用下，枪管与套筒仍保持闭锁状态共同向后滑行约 3 mm，待膛压安全跌落后单绞链越过上死点。',
  },
  {
    id: 'm1911_phase_4',
    stepNum: '04',
    shortLabel: '单绞链摆动拉降开锁',
    title: '阶段 4 · 勃朗宁单绞链绕横销向后摆动 53°，拉降枪管尾部 2.7 mm 脱锁',
    range: [0.34, 0.46],
    description:
      '单绞链绕静止的空仓挂机横销向后旋转，将枪管下耳沿精确圆弧向下拉降 2.7 mm，使枪管仰起 +2.1° 令顶部双闭锁筋彻底退出套筒顶槽，枪管停靠在底把冲击床上终止后退！',
  },
  {
    id: 'm1911_phase_5',
    stepNum: '05',
    shortLabel: '套筒压锤与右侧抛壳',
    title: '阶段 5 · 套筒独自全行程后坐 45.5 mm 压倒击锤、压下断连器并抛壳',
    range: [0.46, 0.62],
    description:
      '解锁后的套筒独自向后高速冲刺 45.5 mm 压缩 16 磅复进簧，下沿压下桨状断连器切断火控并重新压倒外露击锤至满待击位；内置管状抽壳钩拽出 .45 ACP 铜壳撞击底把抛壳挺向右上方翻飞。',
  },
  {
    id: 'm1911_phase_6',
    stepNum: '06',
    shortLabel: '受控供弹滑入膛室',
    title: '阶段 6 · 16磅复进簧推套筒前冲，单排弹匣受控托弹滑入抽壳钩下',
    range: [0.62, 0.84],
    description:
      '单排弹匣托弹簧将下一发 .45 ACP 实弹推至锥形抱弹口，复进套筒推弹底缘沿底把供弹坡道滑入抽壳钩抓爪下方，顺畅推入倾斜的 5 英寸枪管弹膛。',
  },
  {
    id: 'm1911_phase_7',
    stepNum: '07',
    shortLabel: '绞链顶升闭锁与断连复位',
    title: '阶段 7 · 绞链反向摆正顶升枪管死锁，松指释放断连器恢复单动待击',
    range: [0.84, 1.0],
    description:
      '套筒前冲最后 6.5 mm 顶推枪管复原，单绞链反向摆回近垂直位将枪管尾部顶升归位重新锁入双顶槽；松开直推扳机后三叉板簧顶升断连器弹入套筒凹槽，恢复清脆单动待击。',
  },
];

/**
 * Exact 1:1 John Browning M1911A1 Single-Link Tilting-Barrel Short-Recoil Kinematics.
 * - Zero-slip circular arc coupling between `m1911_barrel_link` (pivoted at fixed slide-stop pin
 *   `[0.46, 0.65]`) and `m1911_barrel` underlug pin (`[0.55, 1.35]` at battery).
 * - Authentic straight-pull sliding trigger (`dx < 0`), exposed spur hammer fall/recock,
 *   grip safety squeeze (`rz`), disconnector drop (`dy`), and 3 dynamic `aSpringParam` springs.
 */
export function computeM1911FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  const rx = 0;
  const ry = 0;
  let rz = 0;
  let scaleX = 1;

  // 1. Grip safety palm squeeze & Straight-pull trigger stroke
  const gripSqueeze = seg(f, 0.0, 0.06) - seg(f, 0.9, 0.98);
  const triggerPull = seg(f, 0.03, 0.1) - seg(f, 0.86, 0.95);

  // 2. Exposed spur hammer fall forward (rz < 0) -> recocked rearward by recoiling slide -> sear settle
  const hammerFall = seg(f, 0.095, 0.145);
  const hammerRecock = seg(f, 0.34, 0.54);
  const hammerOvercock = Math.sin(linearSeg(f, 0.5, 0.64) * Math.PI);
  const hammerSettle = seg(f, 0.82, 0.92);
  const hammerRZ =
    -0.88 * hammerFall +
    0.92 * hammerRecock +
    0.08 * hammerOvercock -
    0.04 * hammerSettle;

  // 3. Master Slide Recoil Stroke (`0 -> -4.55 cm` at `f = 0.57`, returns to `0` at `f = 0.87`)
  const slideRecoilIn = seg(f, 0.27, 0.57);
  const slideReturn = seg(f, 0.61, 0.87);
  const slideDX = -4.55 * (slideRecoilIn - slideReturn);
  const slideTravel = -slideDX; // >= 0

  // 4. Exact Browning Single-Swinging-Link Circular-Arc Coupling (`L = 0.7058 cm`):
  //    - For first 3.0 mm of slide recoil, link swings past top-dead-center (+0.13 -> +0.30 rad);
  //    - From slideTravel 0.30..1.05 cm, link completes full rearward swing to alphaMax = +0.92 rad,
  //      pulling barrel underlug rearward -0.651 cm and DOWN -0.272 cm to clear dual top locking ribs!
  const linkProgress = clamp01(slideTravel / 1.08);
  const linkSmooth = linkProgress * linkProgress * (3 - 2 * linkProgress);
  const alphaMax = 0.92; // +52.7 deg rearward from +Y
  const linkRZ = (alphaMax - M1911_LINK_ALPHA0) * linkSmooth; // 0 -> +1.048 rad (+Z swings top rearward!)
  const alphaCur = M1911_LINK_ALPHA0 + linkRZ;

  // Exact upper-pin displacement along the link's circular arc around fixed (M1911_LINK_PIVOT_X, Y)
  const upperPinX = M1911_LINK_PIVOT_X - M1911_LINK_LEN * Math.sin(alphaCur);
  const upperPinY = M1911_LINK_PIVOT_Y + M1911_LINK_LEN * Math.cos(alphaCur);
  const lugDX = upperPinX - M1911_BARREL_LUG_PIN_X0;
  const lugDY = upperPinY - M1911_BARREL_LUG_PIN_Y0;

  // Barrel tilts upward (barrelRZ > 0) while front rides concentrically through moving barrel bushing
  const bushingX = 10.65 + slideDX;
  const effectiveSpan = Math.max(5.2, bushingX - upperPinX);
  const bushingDrop = -0.015 * linkSmooth;
  const barrelRZ = Math.asin(
    clamp01((bushingDrop - lugDY) / effectiveSpan) * 0.98
  );

  // Magazine feed pulse along 18° grip axis
  const magFeedPulse = seg(f, 0.54, 0.66) - seg(f, 0.72, 0.85);
  const gripUX = Math.cos(M1911_GRIP_SPRING_ROT_Z);
  const gripUY = Math.sin(M1911_GRIP_SPRING_ROT_Z);

  switch (partId) {
    case 'm1911_slide':
    case 'm1911_barrel_bushing':
    case 'm1911_recoil_plug': {
      dx = slideDX;
      break;
    }

    case 'm1911_extractor': {
      const rimSnap = Math.sin(linearSeg(f, 0.72, 0.84) * Math.PI);
      dx = slideDX;
      dz = 0.045 * rimSnap;
      break;
    }

    case 'm1911_firing_pin': {
      const inertiaFly =
        seg(f, 0.135, 0.165) - seg(f, 0.175, 0.23);
      dx = slideDX + 0.38 * inertiaFly;
      break;
    }

    case 'm1911_barrel_link': {
      // Pivots purely around fixed slide-stop cross-pin at assembledPos [0.46, 0.65, 0]
      rz = linkRZ;
      break;
    }

    case 'm1911_barrel': {
      // Exact rigid-body transform locking barrel underlug pin onto swinging link upper pin!
      const cosT = Math.cos(barrelRZ);
      const sinT = Math.sin(barrelRZ);
      dx =
        lugDX +
        M1911_BARREL_LUG_PIN_X0 * (1 - cosT) +
        M1911_BARREL_LUG_PIN_Y0 * sinT;
      dy =
        lugDY -
        M1911_BARREL_LUG_PIN_X0 * sinT +
        M1911_BARREL_LUG_PIN_Y0 * (1 - cosT);
      rz = barrelRZ;
      break;
    }

    case 'm1911_recoil_spring': {
      // Local spring spans X in [0.0, 8.95] anchored at fixed rear guide flange X = 1.95
      const L0 = 8.95;
      const LNew = Math.max(3.6, L0 + slideDX);
      scaleX = LNew / L0;
      break;
    }

    case 'm1911_hammer': {
      rz = hammerRZ;
      break;
    }

    case 'm1911_trigger': {
      // Iconic pure straight-line horizontal sliding trigger
      dx = -0.42 * triggerPull;
      break;
    }

    case 'm1911_grip_safety': {
      // Pivots inward when gripped (-rz moves lower palm swell forward into frame)
      rz = 0.14 * gripSqueeze;
      break;
    }

    case 'm1911_sear_disconnector': {
      const searRotate = seg(f, 0.08, 0.12) - seg(f, 0.85, 0.93);
      const disconnDrop = seg(f, 0.31, 0.39) - seg(f, 0.83, 0.9);
      dy = -0.18 * disconnDrop;
      rz = -0.16 * searRotate;
      break;
    }

    case 'm1911_mainspring': {
      // Anchored at bottom of arched mainspring housing; extends when hammer falls, compresses on recock!
      const fallExtend = seg(f, 0.095, 0.145) - seg(f, 0.34, 0.54);
      const overCompress = Math.sin(linearSeg(f, 0.46, 0.66) * Math.PI);
      scaleX = 1 + 0.18 * fallExtend - 0.14 * overCompress;
      break;
    }

    case 'm1911_mag_follower': {
      dx = 0.52 * gripUX * magFeedPulse;
      dy = 0.52 * gripUY * magFeedPulse;
      break;
    }

    case 'm1911_mag_spring': {
      // Anchored at floorplate; expands smoothly as follower rises to feed next .45 ACP round
      scaleX = 1 + 0.28 * magFeedPulse;
      break;
    }

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

export function computeM1911BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const slideRecoilIn = seg(f, 0.27, 0.57);
  const slideReturn = seg(f, 0.61, 0.87);
  const slideDX = -4.55 * (slideRecoilIn - slideReturn);

  // 1. 230gr .45 ACP FMJ Round-Nose bullet: chamber [1.15, 2.55] -> 5" muzzle crown [11.60, 2.55] at f = 0.29
  const bulletVisible = f < 0.45;
  let bulletX = 1.15;
  let streakLength = 0;
  if (f >= 0.18 && f < 0.29) {
    const u = Math.pow(linearSeg(f, 0.18, 0.29), 1.38);
    bulletX = 1.15 + (11.6 - 1.15) * u;
    streakLength = 2.8 * u;
  } else if (f >= 0.29 && f < 0.45) {
    const u = linearSeg(f, 0.29, 0.45);
    bulletX = 11.6 + 26.0 * u;
    streakLength = 6.2 * (1 - u * 0.45);
  }

  // 2. Spent .45 ACP Brass Case: extracted by internal claw extractor -> strikes left ejector -> tumbles right-up
  const spentCaseVisible = f < 0.8;
  let caseX = -0.15;
  let caseY = M1911_BORE_Y;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.27 && f < 0.49) {
    caseX = -0.15 + slideDX;
    const drop = Math.sin(linearSeg(f, 0.32, 0.46) * Math.PI) * -0.14;
    caseY = M1911_BORE_Y + drop;
  } else if (f >= 0.49 && f < 0.8) {
    const u = linearSeg(f, 0.49, 0.8);
    const slideAtEject = -4.55 * seg(0.49, 0.27, 0.57);
    const baseAtEject = -0.15 + slideAtEject;
    caseX = baseAtEject - 3.6 * u;
    caseY = M1911_BORE_Y + 7.2 * u - 8.8 * u * u;
    caseZ = 10.2 * u;
    caseRX = u * 9.0;
    caseRY = u * 11.5;
    caseRZ = -u * 10.0;
    if (f > 0.67) {
      spentCaseOpacity = 1 - linearSeg(f, 0.67, 0.8);
    }
  }

  // 3. Chamber Primer Flash & .45 ACP Muzzle Plume (Short-recoil: zero gas port)
  const chamberFlashIntensity =
    f >= 0.16 && f <= 0.27
      ? Math.sin(linearSeg(f, 0.16, 0.27) * Math.PI)
      : 0;
  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.28 && f <= 0.38) {
    const u = linearSeg(f, 0.28, 0.38);
    muzzlePlumeScale = 0.42 + 1.35 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.84;
  }

  // 4. Next .45 ACP cartridge in 7-rd single-stack mag Slot 0 [-3.27, 0.68, 0] -> Chamber [-0.15, 2.55, 0]
  let nextX = -3.27;
  let nextY = 0.68;
  let nextRZ = 0.16;

  if (f >= 0.54 && f < 0.64) {
    const u = seg(f, 0.54, 0.64);
    nextX = -3.27 + 0.16 * u;
    nextY = 0.68 + 0.54 * u;
    nextRZ = 0.16 + 0.08 * u;
  } else if (f >= 0.64 && f < 0.86) {
    const u = seg(f, 0.64, 0.86);
    const rampArc = Math.sin(u * Math.PI) * 0.26;
    nextX = -3.11 + (-0.15 - -3.11) * u;
    nextY = 1.22 + (M1911_BORE_Y - 1.22) * u + rampArc;
    nextRZ = 0.24 * (1 - u);
  } else if (f >= 0.86) {
    nextX = -0.15;
    nextY = M1911_BORE_Y;
    nextRZ = 0;
  }

  // Reserve round (Slot 1 -> Slot 0)
  const shift = seg(f, 0.54, 0.72);
  const resX = -3.66 + (-3.27 - -3.66) * shift;
  const resY = -0.51 + (0.68 - -0.51) * shift;

  return {
    bulletVisible,
    bulletPos: [bulletX, M1911_BORE_Y, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity: 0,
    gasPortPos: [5.5, M1911_BORE_Y, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0],
  };
}

const M1911_V3_WALNUT_BUNDLE: PbrBindingSpec = {
  albedoFile: 'm1911_v3_walnut_albedo.webp',
  normalFile: 'm1911_v3_walnut_normal.webp',
  roughnessFile: 'm1911_v3_walnut_roughness.webp',
  normalScale: 0.92,
};

const M1911_V3_SLIDE_BUNDLE: PbrBindingSpec = {
  albedoFile: 'm1911_v3_slide_albedo.webp',
  normalFile: 'm1911_v3_slide_normal.webp',
  roughnessFile: 'm1911_v3_slide_roughness.webp',
  normalScale: 0.88,
};

const M1911_V3_METAL_BUNDLE: PbrBindingSpec = {
  albedoFile: 'm1911_v3_metal_albedo.webp',
  normalFile: 'm1911_v3_metal_normal.webp',
  roughnessFile: 'm1911_v3_metal_roughness.webp',
  normalScale: 0.84,
};

export const M1911_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  m1911_grip_left: M1911_V3_WALNUT_BUNDLE,
  m1911_grip_right: M1911_V3_WALNUT_BUNDLE,
  m1911_slide: M1911_V3_SLIDE_BUNDLE,
  m1911_frame: M1911_V3_SLIDE_BUNDLE,
  m1911_mainspring_housing: M1911_V3_SLIDE_BUNDLE,
  m1911_grip_safety: M1911_V3_SLIDE_BUNDLE,
  m1911_barrel: M1911_V3_METAL_BUNDLE,
  m1911_barrel_link: M1911_V3_METAL_BUNDLE,
  m1911_barrel_bushing: M1911_V3_METAL_BUNDLE,
  m1911_recoil_plug: M1911_V3_METAL_BUNDLE,
  m1911_recoil_guide: M1911_V3_METAL_BUNDLE,
  m1911_firing_pin: M1911_V3_METAL_BUNDLE,
  m1911_extractor: M1911_V3_METAL_BUNDLE,
  m1911_slide_stop: M1911_V3_METAL_BUNDLE,
  m1911_thumb_safety: M1911_V3_METAL_BUNDLE,
  m1911_hammer: M1911_V3_METAL_BUNDLE,
  m1911_trigger: M1911_V3_METAL_BUNDLE,
  m1911_sear_disconnector: M1911_V3_METAL_BUNDLE,
  m1911_leaf_spring: M1911_V3_METAL_BUNDLE,
  m1911_mag_body: M1911_V3_METAL_BUNDLE,
  m1911_mag_follower: M1911_V3_METAL_BUNDLE,
};

export const M1911_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'm1911_walnut',
    weapon: M1911_ID,
    titleCn: '柯尔特 M1911A1 双菱格 20 线美洲黑胡桃木护片贴图组',
    partTag: 'F-05 / F-06 DOUBLE-DIAMOND WALNUT GRIPS',
    resolution: '2048 × 2048 px',
    summary:
      'Cycles 离线烘焙的美洲黑胡桃木双菱格滚花护片 2K 5 通道 ORM 贴图组：再现 20 LPI 锋利菱格金字塔滚花、上下螺钉双菱形光面岛、边缘手搓亚麻籽油温润包浆与黄铜螺套反差。',
    highlights: [
      '左右护片独立 Hero UV 高清 20 LPI 双菱格滚花切线法线',
      '美洲黑胡桃木导管纹理与边缘自然手掌磨光粗糙度渐变',
      '独立 UV 防火墙隔离黄铜/蓝钢一字槽紧固螺钉套',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm1911_v3_walnut_albedo.webp',
        note: 'sRGB · 亚麻籽油美洲黑胡桃木与双菱格高光脊线',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'm1911_v3_walnut_normal.webp',
        note: 'Linear · 20 LPI 菱格金字塔滚花与一字螺槽深度法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'm1911_v3_walnut_roughness.webp',
        note: 'Linear · R:Cycles AO / G:滚花漫反射与边沿油膜 / B:非金属与螺钉金属度',
      },
    ],
  },
  {
    id: 'm1911_slide',
    weapon: M1911_ID,
    titleCn: '二战军械磷化钢套筒、锻钢底把与美军铭文贴图组',
    partTag: 'U-01 / F-01 / F-04 / FC-04 PARKERIZED SLIDE & FRAME',
    resolution: '2048 × 2048 px',
    summary:
      '面向 1943 年哈特福德军用批次 M1911A1 打造的锰系磷化钢（Parkerized）2K 5 通道 ORM 贴图组：在平面无畸变 Hero UV 带上精刻勃朗宁专利铭文、COLT 厂标、UNITED STATES PROPERTY 及 G.H.D. 军检戳记。',
    highlights: [
      'AgX 物理校准军械磷化钢基底（sRGB 0.21–0.25，缎面 R = 0.32–0.44 零压黑）',
      '双侧套筒与底把平面 Hero UV 正向无镜像钢印凹刻法线与银灰棱边磨损',
      'A1 弧背主簧壳防滑竖纹与尾舌握把保险边缘真实接触 AO',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm1911_v3_slide_albedo.webp',
        note: 'sRGB · 1943 军用磷化灰钢、机加工亮边磨损与美军铭文',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'm1911_v3_slide_normal.webp',
        note: 'Linear · 套筒铭文凹刻、防滑纹与微米磷化结晶法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'm1911_v3_slide_roughness.webp',
        note: 'Linear · R:Cycles 装配接触 AO / G:磷化缎面粗糙度 / B:高金属度',
      },
    ],
  },
  {
    id: 'm1911_metal',
    weapon: M1911_ID,
    titleCn: '5英寸枪管、单绞链、火控精密钢件与单排弹匣贴图组',
    partTag: 'U-02~09 / F-02~03 / FC-01~05 / M-01~02 ACTION & MAG',
    resolution: '2048 × 2048 px',
    summary:
      '覆盖 5 英寸抛光膛顶双闭锁筋枪管（刻「COLT .45 AUTO」）、勃朗宁单绞链、两色拉丝外露击锤、直推扳机框、三叉板簧与 7 发单排双色淬火钢弹匣的 2K 5 通道 ORM 金属图集。',
    highlights: [
      '枪管膛顶 Hero UV 清晰压印 COLT .45 AUTO 钢印与抛光高光导面',
      '热烤蓝控制件 vs 镜面拉丝枪管/击针/单绞链 >= 50px UV 防火墙零色渗',
      '经典二战双色（两段热处理）7 发单排钢弹匣与凸点托弹板细节',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm1911_v3_metal_albedo.webp',
        note: 'sRGB · 烤蓝钢控制件、抛光不锈钢内件与双色热处理弹匣',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'm1911_v3_metal_normal.webp',
        note: 'Linear · 车削拉丝刀纹、滚花扳机面与膛顶铭文法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'm1911_v3_metal_roughness.webp',
        note: 'Linear · 抛光钢(0.18) vs 烤蓝(0.30) vs 磷化(0.38) 分区映射',
      },
    ],
  },
  {
    id: 'm1911_seamless_springs',
    weapon: M1911_ID,
    titleCn: '三组动态螺旋琴钢丝弹簧无缝金属细节贴图',
    partTag: 'U-07 / FC-06 / M-03 DYNAMIC HELICAL SPRINGS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为实时 GPU 形变的 16 磅复进簧、23 磅击锤主簧与单排弹匣托弹簧提供冷拔琴钢丝无缝拉丝法线与防锈油膜微粗糙度表现。',
    highlights: [
      '保留 aSpringParam GPU 实时等径压缩/伸展物理形变',
      '高光防锈油膜起伏与冷拔高碳钢丝细微纹理',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属冷拔拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 驱动 3 组实时动态螺旋弹簧',
      },
      {
        kind: 'Roughness',
        labelCn: '金属微粗糙度油膜 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 冷拔高碳钢丝油膜光泽变化',
      },
    ],
  },
];

export const M1911_PLUGIN: WeaponRuntimePlugin = {
  id: M1911_ID,
  partGroups: M1911_PART_GROUPS,
  timelinePresets: M1911_TIMELINE_PRESETS,
  parts: M1911_PARTS,
  firingPhases: M1911_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(M1911_FIRING_PHASES, f),
  computeFiringKinematics: computeM1911FiringKinematics,
  computeBallisticsState: computeM1911BallisticsState,
  pbrBindings: M1911_PBR_BINDINGS,
  pbrSuites: M1911_PBR_SUITES,
};
