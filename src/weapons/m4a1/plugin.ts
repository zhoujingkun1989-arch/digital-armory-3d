import { clamp01, findActiveFiringPhase, linearSeg, seg } from '../../engine/kinematics/math';
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

export const M4A1_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '平顶上机匣、气吹枪机框与 KAC 四导轨护木组',
    nameEn: 'Flat-Top Upper, DI Staked BCG & KAC M4 RAS Handguard',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: '14.5吋阶梯枪管、锻造下机匣与六档缓冲尾托组',
    nameEn: '14.5" M203 Barrel, Forged Lower & 6-Pos Buffer Extension',
    badgeColor: '#7c3aed',
  },
  {
    key: 'fire_control',
    nameZh: '军规单连发回转击锤与 SAFE/SEMI/AUTO 快慢机组',
    nameEn: 'USGI Select-Fire Hammer, Trigger & SAFE/SEMI/AUTO Selector',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '30发 5.56mm 北约标准铝合金 STANAG 弹匣组',
    nameEn: '30-Rd USGI Dry-Film Grey Aluminum STANAG Magazine',
    badgeColor: '#e11d48',
  },
];

export const M4A1_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '合拢态',
    subLabel: '0%',
    t: 0.0,
    desc: 'Colt M4A1 14.5" RAS 卡宾枪全枪闭锁状态，展现 7075-T6 硬质阳极氧化铝机匣、M203 挂榴阶梯枪管、三角准星座与 KAC 四导轨护木严丝合缝装配',
  },
  {
    id: 'field_strip',
    label: '野战一级分解',
    subLabel: '30%',
    t: 0.3,
    desc: '美军 TM 9-1005-319-10 标准野战分解：卸下 STANAG 弹匣、拆下可拆式 A2 提把照门与华夫格伸缩托、顶出前后结合销分离上下机匣、抽出枪机框总成与 T 形拉机柄',
  },
  {
    id: 'upper_mag_strip',
    label: '护木/枪机/弹匣细拆',
    subLabel: '65%',
    t: 0.65,
    desc: '压下星形环分解 KAC RAS 上下四导轨护木与隔热罩、从铆固气匙枪机框内拆出七突笋回转枪机与镀铬阶梯击针，并分解 STANAG 弹匣防倾托弹板与底盖',
  },
  {
    id: 'full_explode',
    label: '完全军械级拆解',
    subLabel: '100%',
    t: 1.0,
    desc: '26 个核心零部件全向展开：分离 14.5 吋阶梯枪管、A2 鸟笼消焰器、A 字三角准星座、不锈钢气吹管、六档缓冲管/H2 缓冲器/螺旋复进簧及下机匣全自动火控组件',
  },
];

// Shared Stage-1 trajectories for realistic USGI field-strip separation
const M4A1_URG_LIFT: KeyframeStep[] = [
  { range: [0.08, 0.26], offset: [0, 4.4, 0] },
];

const M4A1_BCG_SLIDE_OUT: KeyframeStep[] = [
  ...M4A1_URG_LIFT,
  { range: [0.18, 0.34], offset: [-7.5, 0, 0] },
];

const M4A1_MAG_DROP: KeyframeStep[] = [
  { range: [0.02, 0.22], offset: [2.4, -4.4, 0] },
];

/**
 * Complete 26-part structural specification for #2 Colt M4A1 Carbine (5.56×45mm NATO).
 * Coaxial inline Stoner bore / BCG / buffer axis at Y = 1.05; length X ∈ [-18.20, +24.10] (~42.3 units).
 */
export const M4A1_PARTS: WeaponPartSpec[] = [
  // ==================== 1. FLAT-TOP UPPER, DI BCG & KAC RAS ('slide' · 10 parts) ====================
  {
    id: 'm4a1_upper_receiver',
    bomCode: 'U-01',
    nameZh: '7075-T6 锻造平顶上机匣（含辅助推机柄/导壳块/星形环）',
    calloutLabel: '平顶锻造上机匣',
    nameEn: '7075-T6 Forged Flat-Top Upper Receiver w/ Forward Assist & Delta Ring',
    group: 'slide',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...M4A1_URG_LIFT,
      { range: [0.62, 0.88], offset: [1.2, 2.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0.45, 2.08, 0],
    labelAppearAt: 0.0,
    roleTag: 'MIL-STD-1913 顶导轨 T2–T12 标号 / M4 双供弹坡 / 右侧辅助推机柄与三角导壳块',
    description:
      '采用航空级 7075-T6 铝合金精密模锻并经 MIL-A-8625 Type III 硬质阳极氧化处理的平顶上机匣：顶部机加工标准皮卡汀尼导轨与白色 T 槽位激光标号，右侧集成防卡滞辅助推机柄（Forward Assist）与保护左撇子射手的三角导壳块（Brass Deflector），前端带星形枪管螺母与锥形弹簧压环（Delta Ring）。',
  },
  {
    id: 'm4a1_carry_handle',
    bomCode: 'U-02',
    nameZh: '美军制式可拆式 A2 提把双觇孔机械照门总成',
    calloutLabel: '可拆式A2提把照门',
    nameEn: 'Detachable USGI A2 Carry Handle Sight Assembly',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-0.55, 2.12, 0],
    explodeSteps: [
      { range: [0.06, 0.26], offset: [-2.8, 6.8, 0] },
      { range: [0.62, 0.88], offset: [-3.2, 3.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [0, 1.4, 0],
    labelAppearAt: 0.08,
    roleTag: '左侧双滚花手拧螺母快拆夹具 / 0-2 近战与远距翻转双觇孔 + 300–600m 高低转轮',
    description:
      '通过左侧两枚大型滚花手拧螺母夹持固定在平顶导轨上的铝合金锻造提把：后端护翼内集成可翻转双孔径觇孔照门（0–200m 大孔径近战觇孔与远距离精密小孔径觇孔），配合方向微调鼓轮与 6/3 射程高低调节盘，瞄准基线与前端三角准星严密共轴（Y = 3.52）。',
  },
  {
    id: 'm4a1_charging_handle',
    bomCode: 'U-03',
    nameZh: '锻造铝合金 T 形拉机柄与左侧战术卡笋',
    calloutLabel: 'T形锻造拉机柄',
    nameEn: 'T-Shaped Forged 7075-T6 Charging Handle & Tactical Latch',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-2.25, 1.66, 0],
    explodeSteps: [
      ...M4A1_URG_LIFT,
      { range: [0.18, 0.34], offset: [-8.5, 0.8, 0] },
      { range: [0.65, 0.9], offset: [-6.8, 3.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [-1.5, 0.2, 0],
    labelAppearAt: 0.2,
    roleTag: '前下端钩头带动枪机框首发装填 / 射击期间锁死在上机匣尾口绝不随动打脸',
    description:
      '安置于上机匣顶部导槽内的非随动 T 形拉机柄：双指捏压左侧弹簧卡笋向后拉动时，前端下折钩扣拉动枪机框完成首发装填或排障；推回闭锁后卡笋自动咬合上机匣缺口，实弹射击期间保持静止不动。',
  },
  {
    id: 'm4a1_dust_cover',
    bomCode: 'U-04',
    nameZh: '冲压钢弹簧抛壳窗防尘盖总成',
    calloutLabel: '抛壳窗弹簧防尘盖',
    nameEn: 'Spring-Loaded Stamped Steel Ejection Port Dust Cover',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [1.72, 0.62, 0.77],
    explodeSteps: [
      ...M4A1_URG_LIFT,
      { range: [0.66, 0.9], offset: [2.8, 1.8, 3.2] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0.4, 0.2, 0],
    labelAppearAt: 0.66,
    roleTag: '平时闭合阻绝沙漠泥尘 / 枪机框后坐或前冲瞬间顶开弹珠卡笋自动弹开',
    description:
      '铰接于抛壳窗下沿细钢轴上的双肋冲压磷化钢盖板，内置扭簧常施向外张力：携行时由弹簧定位珠锁闭抛壳口严防风沙侵入；一旦扣动扳机使枪机框移动，枪机框肩部瞬时顶脱卡珠使防尘盖向下自动翻转弹开。',
  },
  {
    id: 'm4a1_bolt_carrier',
    bomCode: 'U-05',
    nameZh: '全自动构型磷化枪机框与双冲铆气匙 (Staked Gas Key)',
    calloutLabel: '铆固气匙枪机框',
    nameEn: 'M16/M4 Full-Auto Bolt Carrier w/ Staked Chrome-Lined Gas Key',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-0.75, 1.05, 0],
    explodeSteps: [
      ...M4A1_BCG_SLIDE_OUT,
      { range: [0.64, 0.88], offset: [-2.2, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-0.4, 0.55, 0],
    labelAppearAt: 0.2,
    roleTag: '斯通纳内膨胀气缸核心 / 顶部双六角螺钉冲铆气匙 / 右侧斜向辅助推机棘齿',
    description:
      '采用 8620 渗碳合金钢制造、内膛硬镀铬的 M4A1 全自动规格重尾枪机框：顶部双螺钉严密冲铆（Staked）漏斗形导气匙承接不锈钢气吹管燃气，将其导入枪机框内部与枪机气环构成的密闭膨胀腔，从而将枪机框本身变成无活塞连杆的同轴气缸。',
  },
  {
    id: 'm4a1_bolt',
    bomCode: 'U-06',
    nameZh: 'Carpenter 158 七突笋回转枪机（含抽壳钩/抛壳挺/气环/凸轮销）',
    calloutLabel: '七突笋回转枪机',
    nameEn: 'Carpenter 158 7-Lug Rotating Bolt w/ Extractor, Gas Rings & Cam Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [2.45, 1.05, 0],
    explodeSteps: [
      ...M4A1_BCG_SLIDE_OUT,
      { range: [0.4, 0.62], offset: [1.6, 2.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-0.2, 0.35, 0],
    labelAppearAt: 0.4,
    roleTag: '七枚径向闭锁突笋 + 抽壳钩构成八等分花瓣锁头 / 三道不锈钢活塞气环密封',
    description:
      '军规 Carpenter 158 喷丸强化探伤（HPT/MPI）合金钢枪机：前端排布 7 枚径向闭锁突笋与右侧超宽抽壳钩爪、弹性柱塞抛壳挺，中段设三道错口不锈钢密封气环与矩形顶头凸轮销（Cam Pin），在枪机框螺旋槽导引下正反旋转 22.5° 完成刚性闭锁与解锁。',
  },
  {
    id: 'm4a1_firing_pin',
    bomCode: 'U-07',
    nameZh: '硬镀铬阶梯式自由浮动击针与开口销',
    calloutLabel: '镀铬阶梯击针',
    nameEn: 'Hard-Chromed Stepped Free-Floating Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0.15, 1.05, 0],
    explodeSteps: [
      ...M4A1_BCG_SLIDE_OUT,
      { range: [0.42, 0.64], offset: [-6.8, 1.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [-0.8, 0.15, 0],
    labelAppearAt: 0.42,
    roleTag: '贯穿枪机中心孔 / 仅在凸轮销完全旋转闭锁后击锤方能触及尾钮确保不到位不击发',
    description:
      '通体硬镀铬防积碳烧蚀的多阶梯细长击针：由侧面开口销限位在枪机框内，当七突笋枪机尚未完全旋转闭锁时，枪机框底部遮蔽凸缘阻挡击锤敲击击针尾圆盘，从机械几何上彻底杜绝未闭锁早发事故。',
  },
  {
    id: 'm4a1_gas_tube',
    bomCode: 'U-08',
    nameZh: '卡宾枪长度 347 不锈钢气吹式导气管 (DI Gas Tube)',
    calloutLabel: '不锈钢气吹导气管',
    nameEn: 'Carbine-Length 347 Stainless Steel Direct-Impingement Gas Tube',
    group: 'slide',
    material: 'stainless',
    assembledPos: [8.35, 1.67, 0],
    explodeSteps: [
      ...M4A1_URG_LIFT,
      { range: [0.42, 0.66], offset: [0.6, 3.4, 0] },
      { range: [0.7, 0.94], offset: [0.4, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [-0.2, 0.2, 0],
    labelAppearAt: 0.42,
    roleTag: '尤金·斯通纳气吹原理精髓 / 无往复活塞质量实现极低枪口上跳与同轴质心',
    description:
      '耐高温高压腐蚀的 347 奥氏体不锈钢细管：前端横销锁固在 A 字三角准星座导气孔内，中段经精准 S 形折弯穿过星形枪管螺母齿槽伸入上机匣，尾端圆润喷嘴在闭锁时严密插入枪机框气匙漏斗，直接将纯净推进燃气引回枪机框内部做功。',
  },
  {
    id: 'm4a1_ras_upper',
    bomCode: 'U-09',
    nameZh: 'KAC M4 RAS 上半部皮卡汀尼三导轨护木（含铝隔热罩）',
    calloutLabel: 'KAC上四导轨与隔热罩',
    nameEn: 'Knight’s Armament M4 RAS Upper Tri-Rail Handguard w/ Heatshield',
    group: 'slide',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [9.58, 1.05, 0],
    explodeSteps: [
      ...M4A1_URG_LIFT,
      { range: [0.36, 0.6], offset: [4.2, 2.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0.2, 1.0, 0],
    labelAppearAt: 0.36,
    roleTag: 'SOPMOD Block I 标志性四导轨 / 弹簧钩锁紧星形枪管螺母 + 内衬波纹铝反射隔热罩',
    description:
      '美军特种部队与陆军步兵标配的骑士军备公司（Knight’s Armament Co.）M4 RAS 上护木：集成 12 点、3 点与 9 点钟三向 MIL-STD-1913 战术导轨（可挂载 AN/PEQ-15 激光指示器与战术手电）及两排散热圆孔，内壁铆接银白铝合金辐射隔热罩保护射手护木握持手免受气吹管高温灼伤。',
  },
  {
    id: 'm4a1_ras_lower',
    bomCode: 'U-10',
    nameZh: 'KAC M4 RAS 下半部 6 点钟导轨护木与铝隔热罩',
    calloutLabel: 'KAC下导轨护木',
    nameEn: 'Knight’s Armament M4 RAS Lower 6-O’Clock Rail & Heatshield',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [9.58, 1.05, 0],
    explodeSteps: [
      ...M4A1_URG_LIFT,
      { range: [0.36, 0.6], offset: [8.2, -6.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0.8, -0.95, 0],
    labelAppearAt: 0.36,
    roleTag: '6 点钟皮卡汀尼底轨挂载垂直前握把 / 快拆后可直接加挂 M203 40mm 枪挂榴弹发射器',
    description:
      '与 RAS 上护木上下对合锁死在前端三角护木箍与后端 Delta 弹簧压环之间的铝合金下导轨：提供稳固的 6 点钟皮卡汀尼底轨用于安装 KAC 扫把柄垂直前握把；压下 Delta 压环即可徒手拆下下护木，直接利用枪管阶梯口挂载 M203 榴弹发射器。',
  },

  // ==================== 2. LOWER RECEIVER, 14.5" BARREL & BUFFER SYSTEM ('frame' · 9 parts) ====================
  {
    id: 'm4a1_lower_receiver',
    bomCode: 'F-01',
    nameZh: '柯尔特 7075-T6 锻造下机匣（含空仓挂机拍/弹匣卡笋防误触围栏）',
    calloutLabel: '柯尔特锻造下机匣',
    nameEn: 'Colt 7075-T6 Forged Lower Receiver (M4A1 CARBINE CAL. 5.56MM)',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [1.65, -2.15, 0],
    labelAppearAt: 0.24,
    roleTag: '左侧奔马厂徽 PROPERTY OF U.S. GOVT. M4A1 CARBINE 铭文 / 右侧防误触围栏与 IUID 军资码',
    description:
      '全枪序列化核心受管制部件：7075-T6 模锻硬质阳极氧化铝制成，左侧弹匣井精刻柯尔特奔马徽标与「PROPERTY OF U.S. GOVT. M4A1 CARBINE CAL. 5.56 MM.」军产铭文及乒乓球拍式空仓挂机解脱杆，右侧设高耸防误触围栏（Fencing）环护弹匣释放钮并贴有美军国防部 IUID 二维码资产铭牌。',
  },
  {
    id: 'm4a1_barrel',
    bomCode: 'F-02',
    nameZh: '14.5英寸铬钼钒冷锻镀铬枪管（含 M203 榴弹挂架阶梯缩颈）',
    calloutLabel: '14.5吋M203阶梯枪管',
    nameEn: '14.5" 4150 CMV Chrome-Lined M4 Barrel w/ M203 Step-Down Cut',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [0, 1.05, 0],
    explodeSteps: [
      ...M4A1_URG_LIFT,
      { range: [0.66, 0.92], offset: [5.8, -1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [13.2, 0.45, 0],
    labelAppearAt: 0.0,
    roleTag: '1:7 右旋膛线稳定 62gr M855A1 / 准星座前方标志性 M203 阶梯缩径凹槽 / 护木内 SOCOM 重管段',
    description:
      '满足 MIL-B-11595E 军标的高压磁粉探伤 4150 铬钼钒钢 14.5 英寸卡宾枪管：内膛与弹膛全镀硬铬、1:7 英寸缠距精准稳定重弹头，后端旋入带 M4 加宽双供弹坡的枪管节套（Barrel Extension），前端准星座之外车削出极具辨识度的 M203 40mm 榴弹发射器前卡箍阶梯缩颈。',
  },
  {
    id: 'm4a1_flash_hider',
    bomCode: 'F-03',
    nameZh: '美军制式 A2 鸟笼式闭底消焰制退器与压溃垫圈',
    calloutLabel: 'A2鸟笼闭底消焰器',
    nameEn: 'USGI A2 Birdcage Closed-Bottom Flash Suppressor & Crush Washer',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [22.95, 1.05, 0],
    explodeSteps: [
      ...M4A1_URG_LIFT,
      { range: [0.64, 0.92], offset: [8.6, -1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [0.2, 0.35, 0],
    labelAppearAt: 0.64,
    roleTag: '上半周五道纵向泄气槽抑制枪口跳动 / 实心闭底防止卧姿射击扬起沙尘暴露位置',
    description:
      '以 1/2×28 UNEF 螺纹配合锥形压溃垫圈（Crush Washer）定时锁紧于枪口：仅在上半圆周铣削 5 道纵向消焰槽而保留底部完全封闭——既有效打散炽热火药燃气保护夜视仪，又能在向下抑制枪口上跳的同时避免卧姿射击吹起地面尘土。',
  },
  {
    id: 'm4a1_front_sight_base',
    bomCode: 'F-04',
    nameZh: '锻造钢 A 字形三角准星座导气箍（含刺刀卡笋/背带环）',
    calloutLabel: 'A字三角准星座导气箍',
    nameEn: 'Forged "F"-Marked A-Frame Front Sight Base (FSB) w/ Bayonet Lug',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [15.05, 1.05, 0],
    explodeSteps: [
      ...M4A1_URG_LIFT,
      { range: [0.68, 0.94], offset: [9.2, 1.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [0, 2.45, 0],
    labelAppearAt: 0.68,
    roleTag: '平顶专用 F 标高准星座 / 双锥销横穿枪管刚性固定 / 集成导气室、M9 刺刀座与前背带环',
    description:
      'M4 卡宾枪灵魂剪影特征——一体模锻锰磷化钢 A 字形三角准星座（带平顶机匣专用 "F" 高度标记）：以两枚高强度锥形横销死死锁固在枪管上，同时承担高压导气箍、护木前箍限位、可调高低方形准星柱与护翼、底部 M9 刺刀卡笋以及包覆胶层的旋转前背带环五大功能。',
  },
  {
    id: 'm4a1_buffer_tube',
    bomCode: 'F-05',
    nameZh: '军规六档伸缩尾托缓冲管（含齿形城堡螺母与尾端背带板）',
    calloutLabel: '六档伸缩尾托缓冲管',
    nameEn: 'Mil-Spec 6-Position Receiver Extension Buffer Tube & Castle Nut',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-11.35, 1.05, 0],
    explodeSteps: [{ range: [0.62, 0.88], offset: [-5.8, 0, 0] }],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-3.85, -0.85, 0],
    labelAppearAt: 0.62,
    roleTag: '与枪管及枪机框严格同轴直连 / 底部六孔定位导轨调节枪托长度 / 城堡螺母冲铆防松',
    description:
      '旋入下机匣尾塔螺纹并由四缺口城堡螺母（Castle Nut）与尾端定位板紧固的 7075-T6 铝合金圆筒：内部光滑直管直接容纳后坐缓冲器与复进簧，使后坐力沿枪管轴线笔直传导至射手肩窝（斯通纳直托布局），底部铣有 6 个圆形定位盲孔供伸缩枪托快速调节抵肩长度。',
  },
  {
    id: 'm4a1_buffer',
    bomCode: 'F-06',
    nameZh: 'H2 重型防回跳卡宾枪配重缓冲器（内置两钨一钢惯性块）',
    calloutLabel: 'H2重型配重缓冲器',
    nameEn: 'H2 Heavy Carbine Recoil Buffer (2 Tungsten + 1 Steel Weights)',
    group: 'frame',
    material: 'copper_accent',
    assembledPos: [-6.35, 1.05, 0],
    explodeSteps: [
      { range: [0.18, 0.36], offset: [1.8, -2.2, 0] },
      { range: [0.58, 0.86], offset: [-3.4, -2.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-1.4, -0.45, 0],
    labelAppearAt: 0.22,
    roleTag: '随枪机框同步直轴后坐 / 内置滑动钨合金块消除全自动闭锁枪机回跳（Bolt Bounce）',
    description:
      '专为 14.5 英寸高压卡宾导气系统升级的金色阳极氧化 H2 重型缓冲器（重约 4.6 盎司）：前端贴紧枪机框尾面同步后坐，腔内封装两枚高密度钨合金块与一枚钢块及橡胶隔垫，在枪机高速复进撞击闭锁瞬间产生二次滞后冲量以彻底抑制全自动连发枪机回跳，尾端配聚氨酯防撞头。',
  },
  {
    id: 'm4a1_buffer_spring',
    bomCode: 'F-07',
    nameZh: '17-7PH 不锈钢长行程螺旋复进缓冲簧',
    calloutLabel: '螺旋复进缓冲簧',
    nameEn: 'USGI 17-7PH Stainless Helical Action / Buffer Spring',
    group: 'frame',
    material: 'spring_steel',
    assembledPos: [-11.4, 1.05, 0],
    explodeSteps: [
      { range: [0.18, 0.36], offset: [1.2, -2.2, 0] },
      { range: [0.58, 0.86], offset: [-5.0, -2.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-1.0, -0.7, 0],
    labelAppearAt: 0.22,
    roleTag: '射击后坐期间实时压缩蓄能 / 释放势能驱动缓冲器与枪机框平顺复进推弹入膛',
    description:
      '贯穿整根尾托缓冲管的多圈螺旋压缩弹簧：尾端抵死缓冲管封闭底壁，前端套入 H2 缓冲器细颈；当枪机框与缓冲器后坐时沿轴向大幅压缩吸收后坐动能，随后释放储能平稳推回枪机框剥弹闭锁。',
  },
  {
    id: 'm4a1_buttstock',
    bomCode: 'F-08',
    nameZh: '美军制式 M4 加强筋华夫格六档伸缩枪托 (Waffle Stock)',
    calloutLabel: 'M4华夫格伸缩枪托',
    nameEn: 'USGI M4 Reinforced "Waffle" 6-Position Collapsible Buttstock',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-13.95, 1.05, 0],
    explodeSteps: [
      { range: [0.06, 0.26], offset: [-8.5, -1.5, 0] },
      { range: [0.65, 0.9], offset: [-4.8, -1.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [-1.0, -3.2, 0],
    labelAppearAt: 0.0,
    roleTag: '经典网格加强筋聚合物托身 / 捏压底部杠杆调节全长适应防弹插板携行与近战 CQB',
    description:
      '高抗冲玻纤增强尼龙注塑成型的第二代 M4 加强筋“华夫格”伸缩托：套合于六档缓冲管外，手捏下方纹理杠杆拔出垂直定位销即可在 6 个档位间瞬时伸缩枪托长度，尾部配防滑菱纹橡胶抵肩底板与战术背带穿槽及底部旋转背带环。',
  },
  {
    id: 'm4a1_pistol_grip',
    bomCode: 'F-09',
    nameZh: '美军制式 A2 菱形防滑纹指槽手枪握把',
    calloutLabel: 'A2菱纹指槽手枪握把',
    nameEn: 'USGI A2 Checkered Polymer Pistol Grip w/ Finger Shelf',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-3.45, -0.88, 0],
    explodeSteps: [{ range: [0.64, 0.9], offset: [-0.4, -5.8, 0] }],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [-2.0, -4.2, 0],
    labelAppearAt: 0.64,
    roleTag: '经典后掠人体工学倾角 / 前缘中指承托凸台 + 两侧菱形防滑压纹 / 右上托住快慢机定位簧',
    description:
      '以长螺钉向上锁紧于下机匣握把座的黑色热固性高强度聚合物握把：两侧模压细密菱形防滑网格，前缘中部突起标志性 A2 中指分界凸棱以稳固湿滑或戴手套握持，右上端盲孔内压入快慢机定位顶针弹簧确保三档切换手感清脆。',
  },

  // ==================== 3. SELECT-FIRE FCG ('fire_control' · 3 parts) ====================
  {
    id: 'm4a1_hammer',
    bomCode: 'FC-01',
    nameZh: 'M4A1 全自动构型缺口回转击锤与双卷主扭簧',
    calloutLabel: '全自动回转击锤',
    nameEn: 'M4A1 Auto-Sear Hooked Rotary Hammer & Dual-Coil Torsion Spring',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-0.35, -0.05, 0],
    explodeSteps: [{ range: [0.7, 0.94], offset: [-0.4, 3.1, 0] }],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [0, 0.85, 0],
    labelAppearAt: 0.7,
    roleTag: '绕横销顺时针（+X）高速前旋敲击击针 / 背部带全自动不到位阻铁挂钩',
    description:
      '铰接于下机匣火控槽前横销上的精密渗碳钢击锤，含下端待击主卡口、背部全自动阻铁尾钩与左右双卷长腿主扭簧：扣下扳机脱钩后沿 +X 方向高速挥入枪机框底槽撞击击针；枪机框后坐时将其向后压倒复位。',
  },
  {
    id: 'm4a1_trigger',
    bomCode: 'FC-02',
    nameZh: '军规弧形扳机与内置半自动单发阻铁总成',
    calloutLabel: '弧形扳机与单发阻铁',
    nameEn: 'USGI Curved Trigger & Nested Semi-Auto Disconnector',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-1.75, -0.32, 0],
    explodeSteps: [{ range: [0.7, 0.94], offset: [-0.2, -4.2, -1.8] }],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0.4, -1.1, 0],
    labelAppearAt: 0.7,
    roleTag: '前端精磨主阻铁鼻扣住待击击锤 / 中央嵌套单发阻铁实现半自动断路防连发',
    description:
      '安装在下机匣后火控销上的硬化钢弧形扳机组件，内槽铰接弹簧顶升的半自动单发阻铁（Disconnector）：向后扣动扳机（rz < 0）使前主阻铁鼻下沉释放击锤；在 SEMI 半自动档位下由单发阻铁中途接住回压击锤，松开扳机后交接回前主阻铁。',
  },
  {
    id: 'm4a1_selector',
    bomCode: 'FC-03',
    nameZh: '三档旋转式快慢机凸轮轴与左侧拨杆 (SAFE / SEMI / AUTO)',
    calloutLabel: '三档快慢机拨杆',
    nameEn: '3-Position Rotary Fire Selector Lever (SAFE · SEMI · AUTO)',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-3.35, -0.22, 0],
    explodeSteps: [{ range: [0.68, 0.92], offset: [-0.2, -2.6, 3.8] }],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [0, -0.25, 0.6],
    labelAppearAt: 0.68,
    roleTag: 'M4A1 取消三发点射棘轮改为纯正全自动 AUTO / 90° 步进对齐机匣刻字',
    description:
      '贯穿下机匣后部的三档凸轮转轴（M4A1 相比早期 M4 的核心改进之一便是将 BURST 三发点射改为持续全自动 AUTO）：水平指向 SAFE（0° 锁死扳机尾）、垂直向上指向 SEMI（90° 半自动单发）、继续旋转指向前方 AUTO（180° 压下单发阻铁并激活不到位阻铁实现 800 发/分连发）。',
  },

  // ==================== 4. 30-RD USGI STANAG MAGAZINE ('magazine' · 4 parts) ====================
  {
    id: 'm4a1_mag_body',
    bomCode: 'M-01',
    nameZh: '30发美军制式干膜灰铝合金弧形 STANAG 4179 弹匣体',
    calloutLabel: '30发干膜灰STANAG弹匣',
    nameEn: '30-Rd USGI Dry-Film Grey Aluminum Curved STANAG Magazine Body',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [2.4, -1.0, 0],
    explodeSteps: [
      ...M4A1_MAG_DROP,
      { range: [0.34, 0.56], offset: [2.2, -0.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [1.1, -5.8, 0],
    labelAppearAt: 0.0,
    roleTag: 'Perma-Slik 干膜润滑枪灰涂层 / 五道纵向冲压加强筋与弹匣井限位凸棱',
    description:
      '柯尔特（CAGE 33710）制造的北约标准 30 发 6061-T6 铝合金弹匣：上段笔直契合弹匣井、下段沿恒曲率圆弧向前微弯顺应 5.56×45mm 无缘瓶颈弹锥度，侧壁冲压 5 道纵向防瘪加强筋与上端限位横筋，外覆标志性美军灰色固体干膜润滑剂涂层。',
  },
  {
    id: 'm4a1_mag_follower',
    bomCode: 'M-02',
    nameZh: '美军增强型沙色四向防倾侧托弹板',
    calloutLabel: '防倾侧托弹板',
    nameEn: 'USGI Enhanced Tan 4-Way Anti-Tilt Polymer Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [2.4, -1.2, 0],
    explodeSteps: [
      ...M4A1_MAG_DROP,
      { range: [0.34, 0.56], offset: [-0.1, 2.05, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0.1, -0.3, 0],
    labelAppearAt: 0.34,
    roleTag: '前后加长导裙彻底根治卡弹倾覆 / 打光最后一发顶起左侧空仓挂机拍',
    description:
      '美军 M4A1 改进型自润滑沙色聚合物托弹板：顶部双阶凸脊引导 5.56mm 弹药形成精准双排双进交错排列，前后超长防倾导裙防止单侧按压卡死，后端凸舌在射完第 30 发弹后自动顶升下机匣空仓挂机卡笋。',
  },
  {
    id: 'm4a1_mag_spring',
    bomCode: 'M-03',
    nameZh: '17-7PH 不锈钢耐蚀弧形矩形托弹簧',
    calloutLabel: '不锈钢弧形托弹簧',
    nameEn: 'USGI 17-7PH Corrosion-Resistant Curved Magazine Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [2.4, -1.0, 0],
    explodeSteps: [
      ...M4A1_MAG_DROP,
      { range: [0.34, 0.58], offset: [5.4, -3.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [1.1, -6.4, 0],
    labelAppearAt: 0.34,
    roleTag: '贴合 STANAG 弯弧腔体提供恒定供弹张力 / 适应约 850 发/分全自动高射速',
    description:
      '顺应 STANAG 铝合金弹匣弧度绕制的沉淀硬化不锈钢矩形螺旋弹簧，即便长期满弹战备携行并在高射速连发状态下依然能将每一发弹药及时推举至抱弹口。',
  },
  {
    id: 'm4a1_mag_floorplate',
    bomCode: 'M-04',
    nameZh: '冲压铝合金滑入式齐平弹匣底盖（含柯尔特奔马底印）',
    calloutLabel: '齐平冲压铝弹匣底盖',
    nameEn: 'Flush-Fit Stamped Aluminum Slide-On Magazine Floorplate',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [3.554, -8.591, 0],
    assembledRot: [0, 0, 0.36],
    explodeSteps: [
      ...M4A1_MAG_DROP,
      { range: [0.34, 0.58], offset: [7.6, -4.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [0.6, -0.35, 0],
    labelAppearAt: 0.34,
    roleTag: '径向 0.36 rad 倾角与弧形弹匣底口零间隙齐平扣合 / 抽拉拆洗泥沙',
    description:
      '沿弹匣底部两侧折边导轨严丝合缝滑入锁定的冲压铝合金底板，精确贴合弧形匣体末端法平面（零缝隙闭合），撬起舌片向外抽出即可快速倾倒弹匣内积存的泥沙与雨水。',
  },
];

export const M4A1_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'm4a1_trigger_sear',
    stepNum: '01',
    shortLabel: '扣扳机释击锤',
    title: '阶段 1 · 扣动军规扳机前主阻铁脱钩，双扭簧驱动回转击锤前旋',
    range: [0.0, 0.16],
    description:
      '快慢机置于 SEMI 或 AUTO 档，向后扣动弧形扳机使前主阻铁鼻下沉脱离待击卡口；直立蓄能的全自动构型击锤在双卷扭簧驱动下绕横销顺时针（+X）高速挥入枪机框底槽。',
  },
  {
    id: 'm4a1_pin_ignition',
    stepNum: '02',
    shortLabel: '击针刺破底火',
    title: '阶段 2 · 镀铬阶梯击针前冲刺破 5.56×45mm NATO 弹底火',
    range: [0.16, 0.24],
    description:
      'Carpenter 158 七突笋回转枪机已完全锁紧枪管节套，击锤正面敲击镀铬阶梯击针尾圆盘；击针尖瞬时刺破 M855A1 步枪弹底火，引燃瓶形黄铜弹壳内的高能双基球形发射药。',
  },
  {
    id: 'm4a1_di_impingement',
    stepNum: '03',
    shortLabel: '气吹管引燃气',
    title: '阶段 3 · 弹头越过三角准星座导气孔，高压燃气经气吹管直入气匙',
    range: [0.24, 0.34],
    description:
      '5.56mm 弹头沿 14.5 英寸镀铬枪管加速前冲；越过 A 字三角准星座导气孔瞬间，高压火药燃气经不锈钢气吹管（Direct Impingement）向后直吹入枪机框铆固气匙并充入枪机框内腔，弹头随即以约 910m/s 初速射出 A2 鸟笼消焰器。',
  },
  {
    id: 'm4a1_cam_unlock_recoil',
    stepNum: '04',
    shortLabel: '内膨胀旋锁后坐',
    title: '阶段 4 · 枪机框内腔燃气膨胀启动后坐，七突笋旋转开锁并压缩缓冲簧',
    range: [0.34, 0.54],
    description:
      '膨胀腔气压推枪机框向后启动（弹簧抛壳防尘盖瞬时向下翻开！），螺旋槽迫使凸轮销带动七突笋枪机旋转 22.5° 开锁；随后枪机框顶推尾托管内 H2 重型缓冲器同步直轴后坐并大幅压缩螺旋复进缓冲簧，T 形拉机柄保持锁定静止！',
  },
  {
    id: 'm4a1_extract_eject',
    stepNum: '05',
    shortLabel: '抽壳撞块抛壳',
    title: '阶段 5 · 抽壳钩拉出黄铜空壳，柱塞抛壳挺与导壳块将其向右前抛出',
    range: [0.45, 0.72],
    description:
      '枪机右侧宽爪抽壳钩将 5.56mm 空弹壳拔出弹膛，一旦弹壳脱离节套，枪机面左侧高张力柱塞抛壳挺立即将其向右顶出抛壳窗，撞击上机匣三角导壳块折向 2 点至 4 点钟安全方向翻滚飞出。',
  },
  {
    id: 'm4a1_buffer_feed_lock',
    stepNum: '06',
    shortLabel: '缓冲簧推弹闭锁',
    title: '阶段 6 · STANAG 弹匣上托新弹，螺旋缓冲簧与 H2 缓冲器推枪机复进闭锁',
    range: [0.56, 0.86],
    description:
      'STANAG 弹匣防倾侧托弹板将下一发 5.56mm 实弹推升至抱弹口；尾托缓冲管内压紧的不锈钢螺旋缓冲簧释放势能，经 H2 防回跳缓冲器推枪机框平顺前冲经 M4 双供弹坡推弹入膛，凸轮销驱动七突笋反向旋转 22.5° 锁死。',
  },
  {
    id: 'm4a1_sear_reset',
    stepNum: '07',
    shortLabel: '单发阻铁复位',
    title: '阶段 7 · 松开扳机，半自动单发阻铁将待击击锤交接回前主阻铁',
    range: [0.86, 1.0],
    description:
      '后坐枪机框已将击锤重新压倒并由扳机槽内半自动单发阻铁上钩暂扣；射手松开扳机后，单发阻铁退让放行，击锤微幅回抬即被扳机前主阻铁稳稳咬合，全枪恢复待击闭锁态。',
  },
];

/**
 * Real-time Stoner Direct-Impingement (DI) mechanical kinematics for Colt M4A1 at f ∈ [0, 1].
 * - Internal DI gas piston effect: gas from staked carrier key expands between carrier wall & bolt gas rings,
 *   driving BCG + H2 buffer rearward 0.45 units first (f ∈ [0.30, 0.362]) while bolt stays axially stationary (boltDX = 0):
 *     1) Straight cam dwell [0.30, 0.32] drops residual chamber pressure & snaps open ejection port dust cover.
 *     2) Helical cam track [0.32, 0.362] rotates 7-lug Carpenter-158 bolt +22.5° (π/8 rad) to full unlock.
 * - Coaxial recoil [0.362, 0.54]: unlocked bolt + BCG + H2 buffer travel rearward into 6-pos buffer tube,
 *   compressing helical action spring (rear coil pinned at X_world = -16.70) and recocking hammer onto disconnector.
 * - Counter-recoil [0.57, 0.802] strips next 5.56mm round into battery (boltDX -> 0), then carrier completes
 *   final +0.45 forward cam stroke [0.802, 0.855] rotating bolt -22.5° into rigid 7-lug lockup.
 */
export function computeM4a1FiringKinematics(
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

  // 1. Internal DI Piston / Cam-Slot Extension (0 -> 1 during [0.30, 0.362], returns 1 -> 0 during [0.802, 0.855])
  const camOut = seg(f, 0.3, 0.362) - seg(f, 0.802, 0.855);

  // 2. Coaxial Unlocked Bolt Travel: strictly 0 until 7 lugs finish 22.5° unlock at f=0.362, and 0 by f=0.802 before relock!
  //    -3.65 bolt travel (+ -0.45 camOut = -4.10 carrierDX) stops staked gas key at worldX = -4.62 cleanly in front of lower buffer tower (-4.65)!
  const recoilMain = seg(f, 0.362, 0.54) - seg(f, 0.57, 0.802);
  const boltDX = -3.65 * recoilMain;

  // 3. Staked Bolt Carrier + H2 Heavy Buffer coaxial stroke (0 -> -4.10 -> 0)
  const carrierDX = boltDX - 0.45 * camOut;

  // 4. 7-Lug Carpenter-158 Bolt Rotation: +π/8 rad (+22.5°) after 0.02 dwell [0.30..0.32], relocks [0.802..0.852]
  const boltUnlockRot = seg(f, 0.32, 0.362) - seg(f, 0.802, 0.852);
  const boltRX = (Math.PI / 8) * boltUnlockRot;

  switch (partId) {
    case 'm4a1_bolt_carrier':
    case 'm4a1_buffer': {
      // Staked BCG and H2 Carbine Buffer recoil coaxially in 1:1 contact along Y = 1.05!
      dx = carrierDX;
      break;
    }

    case 'm4a1_bolt': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'm4a1_firing_pin': {
      // Hammer strikes firing pin forward (+0.32) at [0.145, 0.188]; carrier cam collar retracts pin behind bolt face by f=0.32
      const pinStrike = seg(f, 0.145, 0.188) - seg(f, 0.235, 0.318);
      const camRetract = -0.18 * camOut;
      dx = boltDX + 0.32 * pinStrike + camRetract;
      break;
    }

    case 'm4a1_buffer_spring': {
      // Assembled spring spans local X ∈ [-5.30, +5.30] (L0 = 10.60) at assembledPos [-11.40, 1.05, 0].
      // Keep rear coil anchored at X_world = -16.70 while front compresses with H2 buffer & BCG!
      const x0Orig = -5.3;
      const L0 = 10.6;
      const LNew = Math.max(5.0, L0 + carrierDX);
      scaleX = LNew / L0;
      dx = x0Orig * (1 - scaleX);
      break;
    }

    case 'm4a1_dust_cover': {
      // Carrier shoulder trips detent plunger immediately at f=0.305, snapping cover open downward (rx > 0) with spring bounce!
      const flipOpen = seg(f, 0.305, 0.375);
      const bounce = Math.sin(linearSeg(f, 0.375, 0.475) * Math.PI) * 0.14;
      rx = 2.65 * flipOpen - bounce;
      break;
    }

    case 'm4a1_hammer': {
      // Cocked-down rearward at rz = 0 (worldY_max <= 0.28) -> swings UP & FORWARD (rz = -1.12 rad) at [0.068, 0.152]
      // to strike firing pin at Y = 1.05 -> cammed back down under recoiling BCG [0.295, 0.385] -> sear handoff [0.89, 0.95]
      const swingForward = seg(f, 0.068, 0.152);
      const recock = seg(f, 0.295, 0.385);
      const overcockDip = Math.sin(linearSeg(f, 0.38, 0.52) * Math.PI) * 0.08;
      const resetHandoff = seg(f, 0.89, 0.95);
      rz =
        -1.12 * swingForward +
        1.19 * recock +
        overcockDip -
        0.07 * resetHandoff;
      break;
    }

    case 'm4a1_trigger': {
      // Pulled rearward (-X) with rz < 0 (-0.24 rad) during [0.00, 0.135], held until [0.87, 0.96] sear reset
      const pull = seg(f, 0.0, 0.135) - seg(f, 0.87, 0.96);
      rz = -0.24 * pull;
      break;
    }

    case 'm4a1_mag_follower': {
      const feedPulse = seg(f, 0.52, 0.63) - seg(f, 0.66, 0.8);
      dy = 0.36 * feedPulse;
      break;
    }

    // Note: m4a1_charging_handle, m4a1_barrel, m4a1_gas_tube remain locked stationary at [0,0,0] during live firing!
    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes 5.56×45mm NATO projectile, FSB/DI gas-tube impulse glow, A2 birdcage muzzle plume & brass ejection.
 */
export function computeM4a1BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const boltBack = seg(f, 0.362, 0.54) - seg(f, 0.57, 0.802);
  const boltDX = -3.65 * boltBack;

  // 1. 5.56×45mm NATO Spitzer Projectile along coaxial bore Y = 1.05:
  // Chamber throat [6.15, 1.05, 0] -> passes A-frame FSB gas port X=14.65 -> exits A2 birdcage X=24.15 at f=0.305!
  const bulletVisible = f < 0.46;
  let bulletX = 6.15;
  let streakLength = 0;

  if (f >= 0.21 && f < 0.305) {
    const u = Math.pow(linearSeg(f, 0.21, 0.305), 1.4);
    bulletX = 6.15 + 18.0 * u;
    streakLength = 4.0 * u;
  } else if (f >= 0.305 && f < 0.46) {
    const u = linearSeg(f, 0.305, 0.46);
    bulletX = 24.15 + 48.0 * u;
    streakLength = 9.0 * (1 - u * 0.45);
  }

  // 2. Spent 5.56×45mm Brass Case: extracted from [4.55, 1.05, 0] -> ejected right & bounced forward-right off M4 brass deflector!
  const spentCaseVisible = f < 0.76;
  let caseX = 4.55;
  let caseY = 1.05;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.362 && f < 0.475) {
    caseX = 4.55 + boltDX;
  } else if (f >= 0.475 && f < 0.76) {
    const u = linearSeg(f, 0.475, 0.76);
    caseX = 2.02 + 4.2 * u; // Deflected toward 2:30 forward-right off upper receiver brass deflector!
    caseY = 1.15 + 7.4 * u - 9.8 * u * u;
    caseZ = 12.4 * u;
    caseRX = u * 9.6;
    caseRY = -u * 14.2;
    caseRZ = -u * 11.4;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.76);
    }
  }

  // 3. Chamber Flash, DI Gas-Tube / FSB Impulse Glow & A2 Birdcage Upper-Fan Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.19 && f <= 0.28) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.19, 0.28) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.265 && f <= 0.36) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.265, 0.36) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.295 && f <= 0.39) {
    const u = linearSeg(f, 0.295, 0.39);
    muzzlePlumeScale = 0.42 + 1.45 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.85;
  }

  // 4. Next 5.56×45mm NATO Cartridge in STANAG Mag -> Stripped up M4 dual feed ramps into Chamber [4.55, 1.05, 0]
  let nextX = 2.4;
  let nextY = 0.25;
  let nextRZ = 0.06;

  if (f >= 0.52 && f < 0.62) {
    const u = seg(f, 0.52, 0.62);
    nextY = 0.25 + 0.38 * u;
    nextRZ = 0.06 + 0.08 * u;
  } else if (f >= 0.62 && f < 0.84) {
    const u = seg(f, 0.62, 0.84);
    const rampArc = Math.sin(u * Math.PI) * 0.18;
    nextX = 2.4 + (4.55 - 2.4) * u;
    nextY = 0.63 + (1.05 - 0.63) * u + rampArc;
    nextRZ = 0.14 * (1 - u);
  } else if (f >= 0.84) {
    nextX = 4.55;
    nextY = 1.05;
    nextRZ = 0;
  }

  // 5. Reserve Cartridge underneath in STANAG Stack
  const magShift = seg(f, 0.52, 0.72);
  const resX = 2.4;
  const resY = -0.62 + (0.25 - -0.62) * magShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.05, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [14.55, 1.78, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0.12],
  };
}

const M4A1_RECEIVER_BUNDLE: PbrBindingSpec = {
  albedoFile: 'm4a1_receiver_albedo.webp',
  normalFile: 'm4a1_receiver_normal.webp',
  roughnessFile: 'm4a1_receiver_roughness.webp',
  normalScale: 0.42,
};

const M4A1_MAG_BUNDLE: PbrBindingSpec = {
  albedoFile: 'm4a1_mag_albedo.webp',
  normalFile: 'm4a1_mag_normal.webp',
  roughnessFile: 'm4a1_mag_roughness.webp',
  normalScale: 0.52,
};

export const M4A1_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  m4a1_upper_receiver: { ...M4A1_RECEIVER_BUNDLE, normalScale: 0.38 },
  m4a1_lower_receiver: { ...M4A1_RECEIVER_BUNDLE, normalScale: 0.44 },
  m4a1_mag_body: M4A1_MAG_BUNDLE,
};

export const M4A1_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'm4a1_receiver',
    weapon: 'm4a1' as const,
    titleCn: '柯尔特 MIL-A-8625 硬质阳极氧化铝上下机匣贴图组',
    partTag: 'U-01 / F-01 COLT RECEIVER',
    resolution: '2048 × 1024 px',
    summary:
      '参考美军原厂柯尔特（Colt Defense Hartford, Conn.）M4A1 卡宾枪实拍：还原 7075-T6 模锻铝合金 MIL-A-8625 Type III 炭灰石板色硬质阳极氧化微喷砂肌理（无任何波浪起伏失真）、左侧弹匣井奔马厂徽与「PROPERTY OF U.S. GOVT. M4A1 CARBINE CAL. 5.56 MM.」凹刻铭文、双侧「SAFE / SEMI / AUTO」三档快慢机圆弧刻字、右侧国防部 IUID CAGE 13629 资产二维码铭牌，以及平顶皮卡汀尼导轨白色 T2–T12 槽位标号。',
    highlights: [
      '左侧柯尔特奔马徽标 + PROPERTY OF U.S. GOVT. M4A1 CARBINE 凹刻',
      '双侧 SAFE / SEMI / AUTO 90° 快慢机档位刻槽与定位坑',
      '右侧 DoD IUID DataMatrix 资产牌与顶轨白色 T 槽位激光标号',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm4a1_receiver_albedo.webp',
        note: 'sRGB · 炭灰阳极氧化铝 / 柯尔特军产凹字 / 白色 T 导轨标号与 IUID 铭牌',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'm4a1_receiver_normal.webp',
        note: 'Linear · 光学平整模锻机匣壁面 + 凹刻滚压铭文与导轨棱边法线',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'm4a1_receiver_roughness.webp',
        note: 'Linear · Type III 硬质阳极氧化半亚光面 vs 高频操作摩擦低粗糙度棱边',
      },
    ],
  },
  {
    id: 'm4a1_mag',
    weapon: 'm4a1' as const,
    titleCn: '美军制式干膜润滑灰铝合金 30 发 STANAG 弹匣贴图组',
    partTag: 'M-01 USGI STANAG MAG',
    resolution: '1024 × 1024 px',
    summary:
      '专为美军公发柯尔特（CAGE 33710）30 发铝合金弧形 STANAG 4179 弹匣打造：真实呈现 Perma-Slik 灰青色固体干膜润滑涂层、上段反复插拔弹匣井留下的金属拉丝摩擦亮带、侧壁五道纵向冲压防瘪加强筋、弹匣井限位横凸筋与前后咬合接缝点焊凹坑。',
    highlights: [
      'Perma-Slik 军规干膜灰涂层与上端弹匣井插拔摩擦亮带',
      '五道纵向冲压加强筋 + 限位横筋平滑高度场法线',
      'CAGE 33710 COLT’S MFG. CO. 5.56 MM 原厂侧底钢印',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm4a1_mag_albedo.webp',
        note: 'sRGB · 军规干膜润滑灰 / 上段插拔摩擦露铝光泽 / CAGE 33710 铭文',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'm4a1_mag_normal.webp',
        note: 'Linear · 五道冲压加强纵筋 + 弹匣井止动横筋 + 点焊凹坑法线',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'm4a1_mag_roughness.webp',
        note: 'Linear · 干膜粉感哑光底面 vs 加强筋脊线与上端插拔抛光区对比',
      },
    ],
  },
  {
    id: 'm4a1_seamless_detail',
    weapon: 'm4a1',
    titleCn: '气吹枪机框、KAC RAS 导轨与六档伸缩托无缝细节贴图',
    partTag: '23 BCG & FURNITURE PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为铆固气匙枪机框、七突笋回转枪机、不锈钢气吹导气管、KAC RAS 四导轨护木、14.5" 阶梯枪管及华夫格六档伸缩托提供无缝 CNC 拉丝与尼龙皮纹细节。',
    highlights: [
      '磷化钢枪机框、七突笋枪机与阶梯枪管精密拉丝法线',
      'KAC M4 RAS 护木与六档华夫格枪托微喷砂注塑皮纹',
      '覆盖其余全部 23 个导气、缓冲与火控内件',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于气匙枪机框/七突笋枪机/导气管/A字准星座/H2缓冲器等',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 金属微表面各向异性枪油光泽起伏',
      },
      {
        kind: 'Normal',
        labelCn: '工程聚酰胺皮纹法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于六档华夫格伸缩托/A2握把/护木隔热片/托弹板等',
      },
    ],
  },
];

export const M4A1_PLUGIN: WeaponRuntimePlugin = {
  id: 'm4a1',
  partGroups: M4A1_PART_GROUPS,
  timelinePresets: M4A1_TIMELINE_PRESETS,
  parts: M4A1_PARTS,
  firingPhases: M4A1_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(M4A1_FIRING_PHASES, f),
  computeFiringKinematics: computeM4a1FiringKinematics,
  computeBallisticsState: computeM4a1BallisticsState,
  pbrBindings: M4A1_PBR_BINDINGS,
  pbrSuites: M4A1_PBR_SUITES,
};
