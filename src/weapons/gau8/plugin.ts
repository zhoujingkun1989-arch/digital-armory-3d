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
  GAU8_BARREL_COUNT,
  GAU8_BOLT_STROKE,
  GAU8_CHAMBER_X,
  GAU8_MUZZLE_X,
  GAU8_PITCH_RADIUS,
  GAU8_POS,
  gau8BoltAssembledPos,
  gau8BoltPhaseAngle,
} from './meshes/gau8Geometries';

// Wave 1 standalone typing: Wave 2 registers 'gau8' in WEAPON_IDS & '30x173_gau8' in CaliberProfile
export const GAU8_ID = 'gau8' as unknown as WeaponId;
export const GAU8_CALIBER = '30x173_gau8' as unknown as CaliberProfile;

const TWO_PI = Math.PI * 2;
const BOLT_HALF_STROKE = GAU8_BOLT_STROKE * 0.5; // 15.0 cm (300 mm total cam travel)

function boltExplodeSteps(index0to6: number): WeaponPartSpec['explodeSteps'] {
  const th = gau8BoltPhaseAngle(index0to6);
  const [x0, y0, z0] = gau8BoltAssembledPos(index0to6);
  // Bolts lift upward with the 7-flute star-rotor to (X=36, Y=+134, Z=0) and fan radially to R=28.0 cm
  // at exact 51.43° 7-fold star symmetry -> ZERO pairwise overlap & >= 8.5 cm clear of cam track!
  const targetX = 36.0 + 7.5 * Math.cos(th);
  const targetY = 134.0 + 28.0 * Math.cos(th);
  const targetZ = 28.0 * Math.sin(th);
  const totalDx = targetX - x0;
  const totalDy = targetY - y0;
  const totalDz = targetZ - z0;
  return [
    {
      range: [0.34, 0.66],
      offset: [
        Number((totalDx * 0.55).toFixed(3)),
        Number((totalDy * 0.58).toFixed(3)),
        Number((totalDz * 0.45).toFixed(3)),
      ],
    },
    {
      range: [0.66, 0.98],
      offset: [
        Number((totalDx * 0.45).toFixed(3)),
        Number((totalDy * 0.42).toFixed(3)),
        Number((totalDz * 0.55).toFixed(3)),
      ],
    },
  ];
}

export const GAU8_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '七管2.3米30mm旋转炮管簇、钛合金星形转子与7套正弦凸轮炮闩',
    nameEn: '7-Barrel 2.3m 30mm Rotary Cluster, Star-Rotor & 7 Cam-Driven Bolts',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '椭圆凸轮钢炮匣、360°螺旋凸轮套筒、钛合金反后坐架与双液压缓冲器',
    nameEn: 'Elliptical-Cam Housing, 360° Cam Track, Titanium Recoil Mount & Buffers',
    badgeColor: '#94a3b8',
  },
  {
    key: 'fire_control',
    nameZh: '双38.5马力液压驱动马达、尾部减速箱、无链交接清膛器与击发簧组',
    nameEn: 'Twin 38.5-HP Hydraulic Drive Motors, Transfer Unit & Clearing Sector',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '1,150发螺旋供弹鼓、螺旋拨弹转子、30×173mm PGU-14/B弹药与双通道输弹槽',
    nameEn: '1,150-Rd Helical Ammo Drum, Conveyor Rotor, 30mm API Stack & Dual Chutes',
    badgeColor: '#4ade80',
  },
];

export const GAU8_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '3,900 RPM 航炮战备合拢态',
    subLabel: '0% Combat Ready',
    t: 0,
    desc: '美国通用电气（General Electric）GAU-8/A「复仇者（Avenger）」30×173mm 七管加特林航空机炮 1:1 真实尺度战备合拢态（全长 6,060 mm、口径 30mm、重 1,828 kg 满载）：长达 2.3 米的七管重型炮管簇、双 38.5 马力液压马达与直径 876 mm 的 1,150 发巨型螺旋供弹鼓严密对接，堪称“装在机炮上的 A-10 攻击机”灵魂本体。',
  },
  {
    id: 'field_strip',
    label: '一级机务吊装与输弹槽快拆',
    subLabel: '30% Airframe Strip',
    t: 0.3,
    desc: '遵循美国空军 A-10 雷电 II 军械中队维护教范展开：向左/右侧分离双通道无链进弹与空壳回收滑槽，后移巨型 1,150 发螺旋弹鼓滚离交接法兰，前抽穿孔钛合金炮口箍与中段双稳定箍，并向上吊离双 38.5 马力高压液压驱动马达总成。',
  },
  {
    id: 'sub_assembly',
    label: '二级转子凸轮与螺旋弹鼓剖拆',
    subLabel: '65% Rotor, Cam & Drum',
    t: 0.65,
    desc: '航吊向上抬升椭圆凸轮主炮匣与 2.3 米七管炮管簇脱离地面钛合金反后坐基座，抽离内嵌 360° 淬火螺旋凸轮导轨套筒与七槽中心星形转子，令 7 套往复钛合金旋转炮闩呈七芒星辐射展开；同步向上吊出满载 30×173mm PGU-14/B 穿甲燃烧弹的螺旋弹药阵列。',
  },
  {
    id: 'full_exploded',
    label: '全炮 25 节点 1:1 机库爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全长逾 6 米的 25 个 1:1 航空重武器工程节点零干涉立体展开：涵盖七管 2,300 mm 30mm 重炮管、360° 正弦螺旋凸轮轨道、7 套错相往复钛合金炮闩、双 3,000 PSI 液压马达、双联液气反后坐缓冲筒及 3 组动态压缩螺旋弹簧，完整诠释人类航空直射火力的巅峰工程。',
  },
];

export const GAU8_PARTS: WeaponPartSpec[] = [
  // ==================== 1. 7-BARREL ROTARY CLUSTER, CLAMPS, STAR-ROTOR & 7 BOLTS ('slide' · 11) ====================
  {
    id: 'gau8_barrel_cluster',
    bomCode: 'B-01',
    nameZh: '七管 2,300mm 重型冷锻 30×173mm 旋转炮管簇',
    calloutLabel: '七管2.3米30mm旋转炮管簇',
    nameEn: '7-Barrel 2,300mm Heavy Fluted 30x173mm Rotary Barrel Cluster',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [...GAU8_POS.gau8_barrel_cluster],
    explodeSteps: [
      { range: [0.16, 0.36], offset: [24.0, 14.0, 0] },
      { range: [0.36, 0.66], offset: [20.0, 12.0, 0] },
      { range: [0.66, 0.98], offset: [14.0, 8.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [118.0, 10.2, 0],
    labelAppearAt: 0.02,
    roleTag: '2.3 米 7×51.4°同轴炮管阵列 · 单管仅承 557 发/分热负荷',
    description:
      '七根单管全长 2,300 mm（90.5 英寸）、发射 30×173mm 巨型航炮弹的铬钼钒高强合金钢冷精锻炮管，以精确 51.43° 夹角环绕 74 mm 节圆半径排布：在双液压马达驱动下以 557 转/分狂暴旋回，每秒倾泻 65 发 30mm 穿甲燃烧弹（3,900 RPM），每根炮管在击发后整整享有 308° 非击发弧段强迫空冷，膛管寿命逾 20,000 发。',
  },
  {
    id: 'gau8_barrel_clamps',
    bomCode: 'B-02',
    nameZh: '中段双级轻量化航空钛合金七孔炮管稳定箍',
    calloutLabel: '中段双级钛合金稳定箍',
    nameEn: 'Mid-Span Dual Ventilated Aerospace Titanium Barrel Clamp Spiders',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [...GAU8_POS.gau8_barrel_clamps],
    explodeSteps: [
      { range: [0.1, 0.34], offset: [48.0, 32.0, 0] },
      { range: [0.36, 0.68], offset: [38.0, 26.0, 0] },
      { range: [0.68, 0.98], offset: [22.0, 14.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 12.0, 0],
    labelAppearAt: 0.08,
    roleTag: '高比强度 Ti-6Al-4V 双盘支撑 · 消除 557 RPM 离心鞭动与气动颤振',
    description:
      '由前后两片多孔减重航空钛合金七孔圆盘与中心空心联轴管构成的旋转稳定卡箍总成：在 557 RPM 高速离心载荷、A-10 攻击机 600 km/h 迎面气流及 44.5 kN 恐怖后坐冲击下刚性约束七根 2.3 米长炮管的平行度，将 1,220 米外 80% 弹着点紧缩于仅 12.4 米的致命散布圆内（5 密位精度）！',
  },
  {
    id: 'gau8_muzzle_clamp',
    bomCode: 'B-03',
    nameZh: '前段穿孔热回火钛合金旋转炮口箍与燃气冠',
    calloutLabel: '穿孔热回火旋转炮口箍',
    nameEn: 'Perforated Heat-Tempered Titanium Rotary Muzzle Clamp & Blast Crown',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [...GAU8_POS.gau8_muzzle_clamp],
    explodeSteps: [
      { range: [0.08, 0.32], offset: [48.0, 14.0, 0] },
      { range: [0.34, 0.66], offset: [36.0, 12.0, 0] },
      { range: [0.66, 0.98], offset: [22.0, 8.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [1.0, 12.2, 0],
    labelAppearAt: 0.04,
    roleTag: '炮口调校同轴散布圆 · 持续连射呈现金铜至蓝紫高温氧化色带',
    description:
      '紧锁于七根 30mm 炮管最前端（X = +320 cm）的穿孔重型钛合金旋转炮口箍：兼具调校炮管汇聚角、导出部分超音速炮口激波及抵御高温烧蚀三重职责；连续两秒百发级点射后，其前缘因炽烈 30mm 发射药燃气冲刷形成标志性的金铜、蓝紫热回火氧化层与深黑火药积碳。',
  },
  {
    id: 'gau8_rotor_core',
    bomCode: 'B-04',
    nameZh: '七槽五轴 CNC 钛钢星形中心转子与炮管闭锁盘',
    calloutLabel: '七槽CNC星形中心转子',
    nameEn: 'Seven-Flute 5-Axis CNC Titanium-Steel Central Star-Rotor & Lock Head',
    group: 'slide',
    material: 'stainless',
    assembledPos: [...GAU8_POS.gau8_rotor_core],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [0, 76.0, 0] },
      { range: [0.66, 0.98], offset: [0, 58.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    calloutAnchor: [4.0, 11.4, 0],
    labelAppearAt: 0.34,
    roleTag: 'GAU-8/A 动力心脏 · 七条轴向 T 形导轨同步承载 77 HP 液压扭矩',
    description:
      'GAU-8/A 内部最雄浑的精密旋转骨架：整块航空合金锻钢五轴 CNC 铣削而成的七槽星形中心转子——尾端 28 齿硬化大齿轮承接双 38.5 马力液压马达的狂暴启动扭矩，中段七条均布 51.43° 的硬质导轨精密引导七套大型钛合金炮闩往复滑移，前端重型七孔闭锁盘将七根 2.3 米炮管刚性旋锁成一体！',
  },
  {
    id: 'gau8_bolt_1',
    bomCode: 'B-05',
    nameZh: '1号钛合金旋转滚轮炮闩（0° 12点位闭锁击发相）',
    calloutLabel: '1号旋转炮闩(12点击发)',
    nameEn: 'No.1 Titanium Rotary Cam Bolt Assembly (0° Firing Phase)',
    group: 'slide',
    material: 'stainless',
    assembledPos: [...GAU8_POS.gau8_bolt_1],
    assembledRot: [gau8BoltPhaseAngle(0), 0, 0],
    explodeSteps: boltExplodeSteps(0),
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.38,
    roleTag: '0° 12点最前死点 · 三突笋刚性闭锁击发 30×173mm PGU-14/B',
    description:
      '七套独立往复旋转炮闩中的 1 号基准炮闩（初始相位 0° 位于 12 点钟正上方）：顶部大型淬火滚轮抵达 360° 正弦凸轮槽最前波峰，三突笋旋转机头刚性锁死炮膛，撞针释放瞬间引燃 430 MPa 高压火药推动重达 395 克的贫铀/钨合金穿甲弹冲出炮口。',
  },
  {
    id: 'gau8_bolt_2',
    bomCode: 'B-06',
    nameZh: '2号钛合金旋转滚轮炮闩（51.4° 开锁初抽相）',
    calloutLabel: '2号旋转炮闩(开锁初抽)',
    nameEn: 'No.2 Titanium Rotary Cam Bolt Assembly (51.4° Unlock & Extract)',
    group: 'slide',
    material: 'stainless',
    assembledPos: [...GAU8_POS.gau8_bolt_2],
    assembledRot: [gau8BoltPhaseAngle(1), 0, 0],
    explodeSteps: boltExplodeSteps(1),
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.4,
    roleTag: '51.4° 凸轮回程初段 · 旋松三突笋拔松 173mm 铝弹壳',
    description:
      '滞后 1 号炮闩 51.43° 的 2 号钛合金旋转炮闩：滚轮导柱驶入 360° 螺旋凸轮下降斜坡，强制炮闩机头回转解锁，宽爪抓壳钩平稳拔松发射后紧贴膛壁的 30×173mm 轻质航空铝合金弹壳。',
  },
  {
    id: 'gau8_bolt_3',
    bomCode: 'B-07',
    nameZh: '3号钛合金旋转滚轮炮闩（102.9° 全抽交接回收相）',
    calloutLabel: '3号旋转炮闩(全抽回收)',
    nameEn: 'No.3 Titanium Rotary Cam Bolt Assembly (102.9° Return Extraction)',
    group: 'slide',
    material: 'stainless',
    assembledPos: [...GAU8_POS.gau8_bolt_3],
    assembledRot: [gau8BoltPhaseAngle(2), 0, 0],
    explodeSteps: boltExplodeSteps(2),
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.42,
    roleTag: '102.9° 右侧回程段 · 将空铝壳交接至右侧闭环回收槽',
    description:
      '位于 102.9° 右侧回程段的 3 号旋转炮闩：正弦凸轮已将其向后拖行逾 180 mm，彻底将灼热 30×173mm 空铝弹壳抽离炮膛并精准交接给下方无链交接星轮，经右侧回收滑槽送回弹鼓以保持 A-10 飞机重心稳定。',
  },
  {
    id: 'gau8_bolt_4',
    bomCode: 'B-08',
    nameZh: '4号钛合金旋转滚轮炮闩（154.3° 后止点腾空相）',
    calloutLabel: '4号旋转炮闩(后止点)',
    nameEn: 'No.4 Titanium Rotary Cam Bolt Assembly (154.3° Rear Dwell)',
    group: 'slide',
    material: 'stainless',
    assembledPos: [...GAU8_POS.gau8_bolt_4],
    assembledRot: [gau8BoltPhaseAngle(3), 0, 0],
    explodeSteps: boltExplodeSteps(3),
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.44,
    roleTag: '154.3° 临近 300mm 满后退波谷 · 彻底腾出 290mm 长弹窗',
    description:
      '运行至 154.3° 的 4 号旋转炮闩：凸轮滚轮接近 360° 椭圆形正弦导轨最尾端波谷（总轴向行程整整 300 mm），为长达 290 mm 的 30×173mm 巨型炮弹腾出充裕的无链装填空间。',
  },
  {
    id: 'gau8_bolt_5',
    bomCode: 'B-09',
    nameZh: '5号钛合金旋转滚轮炮闩（205.7° 无链接弹相）',
    calloutLabel: '5号旋转炮闩(无链接弹)',
    nameEn: 'No.5 Titanium Rotary Cam Bolt Assembly (205.7° Linkless Pickup)',
    group: 'slide',
    material: 'stainless',
    assembledPos: [...GAU8_POS.gau8_bolt_5],
    assembledRot: [gau8BoltPhaseAngle(4), 0, 0],
    explodeSteps: boltExplodeSteps(4),
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.46,
    roleTag: '205.7° 底部供弹窗 · 承接无链交接单元送入的 PGU-14/B 实弹',
    description:
      '位于 205.7° 左下方位的 5 号旋转炮闩：刚越过 180° 后止点并驶上上升凸轮坡，炮闩镜面精准托住由无链交接星轮送入转子槽的新鲜 30×173mm PGU-14/B 穿甲燃烧实弹底缘，启动高速平稳前推。',
  },
  {
    id: 'gau8_bolt_6',
    bomCode: 'B-10',
    nameZh: '6号钛合金旋转滚轮炮闩（257.1° 凸轮高速推弹相）',
    calloutLabel: '6号旋转炮闩(凸轮推弹)',
    nameEn: 'No.6 Titanium Rotary Cam Bolt Assembly (257.1° Cam Ramming)',
    group: 'slide',
    material: 'stainless',
    assembledPos: [...GAU8_POS.gau8_bolt_6],
    assembledRot: [gau8BoltPhaseAngle(5), 0, 0],
    explodeSteps: boltExplodeSteps(5),
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.48,
    roleTag: '257.1° 左侧陡升凸轮段 · 平顺加速推送重达 695g 整弹入膛',
    description:
      '位于 257.1° 左侧的 6 号旋转炮闩：在静止螺旋凸轮槽强劲的轴向分力推动下，将单发总重高达 695 克（近一瓶矿泉水重量！）的 30×173mm 巨型航炮弹笔直推入对应炮管弹膛。',
  },
  {
    id: 'gau8_bolt_7',
    bomCode: 'B-11',
    nameZh: '7号钛合金旋转滚轮炮闩（308.6° 终段进膛闭锁相）',
    calloutLabel: '7号旋转炮闩(进膛闭锁)',
    nameEn: 'No.7 Titanium Rotary Cam Bolt Assembly (308.6° Final Lockup)',
    group: 'slide',
    material: 'stainless',
    assembledPos: [...GAU8_POS.gau8_bolt_7],
    assembledRot: [gau8BoltPhaseAngle(6), 0, 0],
    explodeSteps: boltExplodeSteps(6),
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.5,
    roleTag: '308.6° 闭锁前夜 · 仅隔 15.4 毫秒接力 1 号炮闩完成下次雷霆击发',
    description:
      '紧随 1 号炮闩之后仅隔 51.43° 的 7 号旋转炮闩：完成最后一段推弹进膛并旋转三突笋闭锁节套，在 3,900 RPM 满射速下仅需 15.4 毫秒（每秒 65 发！）便会接力抵达 12 点钟位置喷吐下一道 30mm 穿甲火流！',
  },

  // ==================== 2. HOUSING, 360° CAM TRACK, TITANIUM MOUNT, BUFFERS & SPRINGS ('frame' · 5) ====================
  {
    id: 'gau8_gun_housing',
    bomCode: 'F-01',
    nameZh: '椭圆凸轮重型锻钢主炮匣（USAF 军标铭牌与 UID 码）',
    calloutLabel: '椭圆凸轮重型钢炮匣',
    nameEn: 'Elliptical-Cam Heavy Forged Steel Gun Housing w/ USAF Stencil & UID',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [...GAU8_POS.gau8_gun_housing],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [0, 20.0, 0] },
      { range: [0.68, 0.98], offset: [0, 14.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 18.0, 18.4],
    labelAppearAt: 0.02,
    roleTag: '承力航空圆筒主炮匣 · 左右平面精印 GAU-8/A AVENGER 30MM 军标',
    description:
      '全长 1,060 mm、外径 352 mm 的重型加强筋航空锻钢主炮匣：外壁均布八道抗扭纵向加强筋与前后重型法兰环，左右两侧平面铭牌清晰喷印美国空军军标「GAU-8/A AVENGER 30MM · GENERAL ELECTRIC · 3,900 RPM · CAGE 05606」与 MIL-STD-130 二维资产码；开启 CT 纵剖面（[C]）即可直接切开右壁，直击内嵌 360° 正弦凸轮导轨与七炮闩机械波！',
  },
  {
    id: 'gau8_cam_track',
    bomCode: 'F-02',
    nameZh: '内嵌式 360° 渗碳淬火正弦螺旋凸轮导轨套筒',
    calloutLabel: '360°螺旋正弦凸轮套筒',
    nameEn: 'Internal 360-Degree Hardened Helical Sinusoidal Cam Track Sleeve',
    group: 'frame',
    material: 'stainless',
    isShell: true,
    assembledPos: [...GAU8_POS.gau8_cam_track],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [0, 46.0, 0] },
      { range: [0.68, 0.98], offset: [0, 34.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 14.6, 0],
    labelAppearAt: 0.34,
    roleTag: '300 mm 轴向正弦波浪槽 · 零气动依赖驱动七套 30mm 炮闩同步往复',
    description:
      '深嵌于主炮匣内膛的深层渗碳硬化工具钢 360° 椭圆形螺旋凸轮套筒（总行程高达 300 mm）：内壁精磨出两条镜面高耐磨正弦波浪凸轮导轨，迫使绕轴公转的七套钛合金炮闩滚轮同步划出完美的机械正弦波——单圈 360° 旋转即并行完成进弹、闭锁、12 点位击发、开锁、300 mm 深行程抽壳与空壳回收交接！',
  },
  {
    id: 'gau8_recoil_mount',
    bomCode: 'F-03',
    nameZh: 'A-10 机身钛合金反后坐适配器与重型机库维护支架',
    calloutLabel: '钛合金反后坐基座与支架',
    nameEn: 'Heavy Titanium A-10 Recoil Adapter Mount & Hangar Maintenance Cradle',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [...GAU8_POS.gau8_recoil_mount],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, -28.0, 30.0],
    labelAppearAt: 0.04,
    roleTag: '直连 A-10 钛合金浴盆前机身大梁 · 承载 44.5 kN 持续狂暴后坐力',
    description:
      'GAU-8/A 与 A-10 雷电 II 攻击机前机身承力钛合金纵梁对接的重型反后坐适配器及航空黄黑警示涂装机库维护滚轮架：连射时 3,900 RPM 产生的平均后坐推力高达 44.5 千牛（10,000 磅力——甚至超过 A-10 单台 TF34 涡扇发动机的最大推力！），全赖这座刚性钛合金基座与双液气缓冲筒将冲击平稳导散至机身主结构。',
  },
  {
    id: 'gau8_recoil_buffers',
    bomCode: 'F-04',
    nameZh: '左右对称双联液气反后坐节流缓冲筒总成',
    calloutLabel: '双联液气反后坐缓冲筒',
    nameEn: 'Twin Hydro-Pneumatic Recoil Absorber Cylinders & Chrome Yoke Rods',
    group: 'frame',
    material: 'stainless',
    assembledPos: [...GAU8_POS.gau8_recoil_buffers],
    explodeSteps: [
      { range: [0.16, 0.44], offset: [68.0, -10.0, 0] },
      { range: [0.46, 0.96], offset: [56.0, -8.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -5.0, 21.5],
    labelAppearAt: 0.24,
    roleTag: '双向节流液压阻尼 · 平抑每秒 65 发 30mm 炮弹的高频冲击脉动',
    description:
      '对称并联安装于主炮匣左右两侧（Z = ±215 mm）的重型航空液气反后坐缓冲筒：镜面镀铬活塞杆前端锁接主炮匣前法兰、后端锚固钛合金反后坐支架，利用高压氮气室与液压节流孔吸收每秒 65 次高能击发脉冲，防止剧烈共振撕裂机载航电与前机身铆缝。',
  },
  {
    id: 'gau8_recoil_springs',
    bomCode: 'F-05',
    nameZh: '双联重型锻钢反后坐复进螺旋弹簧组',
    calloutLabel: '双联重型反后坐复进簧',
    nameEn: 'Twin Heavy Forged Titanium-Steel Helical Recoil Recuperator Springs',
    group: 'frame',
    material: 'spring_steel',
    assembledPos: [...GAU8_POS.gau8_recoil_springs],
    explodeSteps: [
      { range: [0.22, 0.5], offset: [68.0, -20.0, 0] },
      { range: [0.52, 0.96], offset: [56.0, -16.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -3.5, 21.5],
    labelAppearAt: 0.28,
    roleTag: '17 mm 粗航空弹簧钢丝 · 保留恒线径 GPU 实时动态压缩形变',
    description:
      '对称并列布置于液气缓冲筒下方的双联高刚度硅锰航空弹簧钢螺旋复进簧（钢丝直径 17 mm、自由长度 640 mm）：在 3,900 RPM 连发期间随 44.5 kN 后坐脉动以恒线径实时动态压缩至 74% 长度并迅速复位，与液气缓冲筒合力稳定整炮轴向基准。',
  },

  // ==================== 3. TWIN HYDRAULIC MOTORS, TRANSFER UNIT & SPRINGS ('fire_control' · 4) ====================
  {
    id: 'gau8_hydraulic_motors',
    bomCode: 'FC-01',
    nameZh: '双联 38.5 马力 3,000 PSI 航空液压驱动马达与减速箱',
    calloutLabel: '双38.5马力液压驱动马达',
    nameEn: 'Twin 38.5-HP 3,000 PSI Hydraulic Drive Motors & Reduction Gearbox',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [...GAU8_POS.gau8_hydraulic_motors],
    explodeSteps: [
      { range: [0.12, 0.36], offset: [-26.0, 32.0, 0] },
      { range: [0.38, 0.96], offset: [-28.0, 30.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-2.0, 22.5, 0],
    labelAppearAt: 0.06,
    roleTag: '总功率 77 马力双余度机载液压 · 0.5 秒加速至 3,900 RPM 零哑弹停射',
    description:
      '彻底超越小型电驱机枪的航空级动力源——并列安装于尾部减速齿轮箱上方的两台 38.5 马力（总输出高达 77 马力！）3,000 PSI 航空高压液压马达，分别接入 A-10 攻击机双套独立冗余液压回路，顶置黄黑警示牌醒目标注「DANGER HIGH PRESSURE HYDRAULICS · 3000 PSI」。即便单侧液压受战损失效仍可半速持续射击，且外能源强驱令哑弹直接随转子退回弹鼓绝不卡炮！',
  },
  {
    id: 'gau8_transfer_unit',
    bomCode: 'FC-02',
    nameZh: '炮尾无链供弹交接单元与清膛安全门总成',
    calloutLabel: '无链交接单元与清膛门',
    nameEn: 'Breech Linkless Transfer Unit, Star-Sprocket & Clearing Sector Gate',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [...GAU8_POS.gau8_transfer_unit],
    explodeSteps: [
      { range: [0.16, 0.44], offset: [-16.0, -14.0, 0] },
      { range: [0.46, 0.96], offset: [-16.0, -12.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [6.0, 4.0, 20.6],
    labelAppearAt: 0.14,
    roleTag: '同步完成进实弹与退空壳双向换向 · 右侧黄红 SAFE/ARMED 清膛安全门',
    description:
      '紧扣于主炮匣尾腹部的精密双路无链交接单元（Transfer Unit）：内置与主转子刚性齿轮同步的双向拨弹星轮，一侧将左侧进弹槽送来的新鲜 30×173mm PGU-14/B 实弹精准推入转子 6–8 点位槽道，另一侧同步接管 4 点位抽出的灼热空铝弹壳并导入右侧回收滑槽；右侧集成醒目黄红「SAFE / ARMED」机械清膛安全门（Clearing Sector），停射末段自动空转清除膛内余弹防止高温烤燃自发！',
  },
  {
    id: 'gau8_buffer_spring',
    bomCode: 'FC-03',
    nameZh: '液压减速箱扭力离合与交接同步缓冲螺旋簧',
    calloutLabel: '液压离合同步缓冲簧',
    nameEn: 'Hydraulic Drive-Clutch & Transfer Sync Helical Shock Buffer Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [...GAU8_POS.gau8_buffer_spring],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [-28.0, 18.0, 0] },
      { range: [0.66, 0.98], offset: [-26.0, 14.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [0, 2.8, 0],
    labelAppearAt: 0.36,
    roleTag: '平抑 77 HP 液压马达瞬时启停冲击 · 保护 28 齿主驱动齿轮与星轮正时',
    description:
      '内置于尾部减速箱与交接传动轴之间的高疲劳琴钢丝扭力缓冲螺旋簧：当飞行员压下操纵杆二段扳机、双 3,000 PSI 液压马达瞬间释放 77 马力澎湃扭矩将数百公斤旋转组件在半秒内推上满速时，该弹簧以每秒 65 次的高频脉动动态压缩吸收齿隙冲击。',
  },
  {
    id: 'gau8_striker_spring',
    bomCode: 'FC-04',
    nameZh: '12点位击发凸轮重型撞针储能螺旋簧',
    calloutLabel: '12点位击发撞针储能簧',
    nameEn: '12-O-Clock Firing-Cam Heavy Helical Percussion Striker Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [...GAU8_POS.gau8_striker_spring],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [32.0, 42.0, 0] },
      { range: [0.66, 0.98], offset: [26.0, 30.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [0, 2.0, 0],
    labelAppearAt: 0.36,
    roleTag: '高响应击发储能压簧 · 12 点位闭锁瞬间高速释放引燃 30mm 底火',
    description:
      '布置于 12 点钟炮匣顶膛击发凸轮区内的重型螺旋击发储能压簧：每当一套旋转炮闩携实弹攀升至 10–12 点位完成三突笋闭锁时被强制压紧蓄能至 68% 长度，随即在越过释放凸肩的微秒间高速弹射撞针，可靠引燃 30×173mm M52A3B1 强装底火。',
  },

  // ==================== 4. 1,150-RD HELICAL DRUM, ROTOR, 30MM PGU-14/B STACK & CHUTES ('magazine' · 5) ====================
  {
    id: 'gau8_ammo_drum',
    bomCode: 'M-01',
    nameZh: '1,150 发巨型无链螺旋供弹鼓与机库承重底座（Ø876×1,816mm）',
    calloutLabel: '1,150发巨型螺旋供弹鼓',
    nameEn: '1,150-Round Helical Linkless Ammunition Drum (Ø876x1,816mm) & Cradle',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [...GAU8_POS.gau8_ammo_drum],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [-46.0, 0, 0] },
      { range: [0.38, 0.96], offset: [-36.0, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    calloutAnchor: [0, 34.0, 44.6],
    labelAppearAt: 0.02,
    roleTag: '直径 87.6 cm × 长 181.6 cm 航空铝巨鼓 · 满载重逾 1.1 吨可装 1,150 发 30mm 炮弹',
    description:
      '堪称航空军械史上最震撼的供弹工程奇观——直径 876 mm、全长 1,816 mm（体积堪比一辆微型轿车！）的 GAU-8/A 闭环无链螺旋弹药鼓：采用航空级高强铝合金圆筒叠加五道外置加强箍环与前后螺栓端盖，外壁左右平面清晰喷涂 USAF 军标「GAU-8/A HELICAL AMMO DRUM · 1,150 RDS · 30×173MM PGU-14/B API」与危险警示斜纹。底部滚轮承重架稳稳贴地，开启 CT 纵剖（[C]）即可直接洞穿铝壁俯瞰内部螺旋转子与满鼓 30mm 炮弹！',
  },
  {
    id: 'gau8_drum_rotor',
    bomCode: 'M-02',
    nameZh: '弹鼓内嵌十四翼螺旋拨弹转子与中央不锈钢驱动轴',
    calloutLabel: '十四翼螺旋拨弹转子',
    nameEn: 'Internal 14-Vane Helical Drum Conveyor Rotor & Stainless Drive Shaft',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [...GAU8_POS.gau8_drum_rotor],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [10.0, 92.0, 0] },
      { range: [0.68, 0.98], offset: [10.0, 68.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 22.0, 0],
    labelAppearAt: 0.36,
    roleTag: '与炮身液压系统机械硬同步 · 螺旋推进实弹并腾空后槽收纳空壳',
    description:
      '贯穿巨型弹鼓中轴的十四翼精密螺旋拨弹转子与中央重载不锈钢传动轴：经万向传动轴与主炮液压驱动系统严格同步旋转，将呈螺旋轨迹排列于弹鼓内的 1,150 发重型 30×173mm 炮弹以每秒 65 发的高速平稳推入前出口滑槽，同时腾出对应空槽无缝接纳经右侧回收槽返鼓的空铝弹壳！',
  },
  {
    id: 'gau8_ammo_belt_stack',
    bomCode: 'M-03',
    nameZh: '1:1 螺旋阵列 30×173mm PGU-14/B 贫铀/钨合金穿甲燃烧弹群',
    calloutLabel: '30×173mm PGU-14/B 弹药阵',
    nameEn: '1:1 Helical Array of 30x173mm PGU-14/B API Aluminum-Cased Rounds',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [...GAU8_POS.gau8_ammo_belt_stack],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [0, 56.0, 0] },
      { range: [0.68, 0.98], offset: [0, 38.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 39.5, 0],
    labelAppearAt: 0.18,
    roleTag: '全长 290 mm 巨型航炮弹 · 拉丝航空铝弹壳减重 30% + 绯红穿甲燃烧弹带',
    description:
      '按 1:1 真实尺度密集排布于螺旋弹鼓内圈的 70 发可视化 30×173mm PGU-14/B 穿甲燃烧弹（API）群：每一发全长高达 290 mm（相当于普通 5.56mm 步枪弹的 5 倍长！），率先大规模改用轻质高强拉丝铝合金弹壳替代传统黄铜壳从而为 A-10 狂减逾 30% 弹药死重，配炭黑轻合金风帽被甲、醒目绯红燃烧识别带与内置重达 300 克的超高密度贫铀/钨合金穿甲芯！',
  },
  {
    id: 'gau8_chute_feed',
    bomCode: 'M-04',
    nameZh: '左侧双端无链实弹高速输送滑槽总成',
    calloutLabel: '左侧无链实弹输送滑槽',
    nameEn: 'Left-Flank Double-Ended Linkless Live-Round Feed Conveyor Chute',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [...GAU8_POS.gau8_chute_feed],
    explodeSteps: [
      { range: [0.08, 0.34], offset: [-24.0, -2.0, -32.0] },
      { range: [0.36, 0.96], offset: [-18.0, -2.0, -24.0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 8.5, -9.5],
    labelAppearAt: 0.06,
    roleTag: '全封闭无金属弹链导向通道 · 杜绝 3,900 RPM 脱链卡滞与过载故障',
    description:
      '架设于巨型弹鼓左前方与炮尾无链交接单元之间的加筋航空铝合金实弹输送通道：彻底摒弃在高过载空战与每秒 65 发极端加速度下极易撕裂卡弹的传统可散金属弹链，改以刚性无链导轨与同步推送链节引导 30×173mm PGU-14/B 实弹高速奔向炮膛，侧面观察窗清晰展露银亮铝壳与绯红弹头。',
  },
  {
    id: 'gau8_chute_return',
    bomCode: 'M-05',
    nameZh: '右侧闭环空铝弹壳返鼓回收滑槽总成',
    calloutLabel: '右侧闭环空壳返鼓回收槽',
    nameEn: 'Right-Flank Closed-Loop Spent Aluminum Case Return Conveyor Chute',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [...GAU8_POS.gau8_chute_return],
    explodeSteps: [
      { range: [0.08, 0.34], offset: [-24.0, -6.0, 32.0] },
      { range: [0.36, 0.96], offset: [-18.0, -4.0, 24.0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -8.5, 9.5],
    labelAppearAt: 0.06,
    roleTag: 'A-10 重心守恒关键设计 · 100% 回收空壳严防涡扇进气道吸入异物',
    description:
      'GAU-8/A 与普通地面机枪最根本的航空工程分野——对称布置于右侧（+Z）的闭环空弹壳回收滑槽：射击后所有长达 173 mm 的灼热空铝弹壳绝不向机外抛撒，而是经交接单元全部压回右侧通道送返弹鼓空位！此举一方面避免数百公斤弹壳流失导致 A-10 机头剧烈失重偏离重心包线，另一方面彻底杜绝高速空壳撞击尾翼或被双发 TF34 涡扇发动机吸入引发空中停车！',
  },
];

// ============================================================================
// 7-PHASE HYDRAULIC 3,900 RPM 7-BARREL ROTARY GATLING FIRING CYCLE (f ∈ [0, 1])
// ============================================================================

export const GAU8_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'gau8_phase_1_hydraulic_spinup',
    stepNum: '01',
    shortLabel: '77HP液压驱动闭锁',
    title: '阶段 1 · 双 38.5 马力 3,000 PSI 液压马达加速七管转子，1 号炮闩抵临 12 点闭锁',
    range: [0.0, 0.08],
    description:
      '飞行员压下操纵杆二段火控扳机，双余度 3,000 PSI 航空液压回路向尾部双马达爆发 77 马力澎湃扭矩，经离合缓冲簧驱动七槽中心星形转子与 2.3 米七管炮管簇高速旋回，1 号钛合金炮闩抵达 12 点位凸轮波峰完成三突笋刚性闭锁。',
  },
  {
    id: 'gau8_phase_2_du_ignition_bore',
    stepNum: '02',
    shortLabel: '30mm 1010m/s 出膛',
    title: '阶段 2 · 12 点撞针引燃 430 MPa 高压膛压，PGU-14/B 穿甲弹以 1,010 m/s 呼啸出膛',
    range: [0.08, 0.21],
    description:
      'f = 0.08 时 12 点位击发储能簧高速释放撞针击发底火，430 MPa 高压发射药燃气推动 395 克贫铀/钨芯穿甲燃烧弹沿 2,300 mm 线膛身管疾驰加速，于 f = 0.19 以 1,010 m/s（201 kJ 惊世动能！）破膛冲出穿孔炮口箍，同时激发标志性“BRRRT!”超音速音爆。',
  },
  {
    id: 'gau8_phase_3_cam_unlock_recoil',
    stepNum: '03',
    shortLabel: '正弦开锁与44.5kN缓冲',
    title: '阶段 3 · 1 号炮闩越过 51.4° 沿 360° 螺旋凸轮解锁，双液气筒吸收 44.5 kN 后坐冲击',
    range: [0.21, 0.36],
    description:
      '转过 2 点钟弧段，1 号炮闩滚轮驶入静止 360° 淬火螺旋凸轮槽下降段，强制三突笋机头回转解锁并初抽 173 mm 铝合金弹壳；与此同时双联液气反后坐缓冲筒与双锻钢螺旋复进簧同步压缩吸收高达 44.5 千牛的平均后坐推力。',
  },
  {
    id: 'gau8_phase_4_closed_loop_return',
    stepNum: '04',
    shortLabel: '300mm抽壳闭环返鼓',
    title: '阶段 4 · 4 点位完成 300 mm 深行程抽壳，空铝壳经交接星轮压入右侧返鼓回收槽',
    range: [0.36, 0.52],
    description:
      '旋至 103°–154° 右下弧段，360° 正弦凸轮将炮闩向后拉出整整 300 mm 彻底抽空炮膛；于 f = 0.44 经过交接单元出口时，灼热空铝弹壳绝不抛向机外，而是被精准压入右侧闭环回收滑槽送返螺旋弹鼓以维持 A-10 飞行重心！',
  },
  {
    id: 'gau8_phase_5_drum_helical_feed',
    stepNum: '05',
    shortLabel: '螺旋弹鼓同步供弹',
    title: '阶段 5 · 1,150 发螺旋弹鼓十四翼转子同步分度，左侧无链槽输送新鲜 PGU-14/B',
    range: [0.52, 0.68],
    description:
      '1 号炮闩抵达 6 点钟最尾端波谷腾出 290 mm 装填窗；与此同时直径 876 mm 的巨型弹鼓内部十四翼螺旋转子与主炮硬同步旋转，经左侧无链进弹滑槽与交接星轮将下一发重达 695 克的 30×173mm 铝壳实弹稳健导入转子槽道。',
  },
  {
    id: 'gau8_phase_6_cam_chamber_ram',
    stepNum: '06',
    shortLabel: '8-10点凸轮高速上膛',
    title: '阶段 6 · 炮闩攀升 360° 螺旋凸轮前推斜坡，平滑推送 30×173mm 巨弹入膛',
    range: [0.68, 0.86],
    description:
      '跨越 206°–309° 左侧上升弧段，1 号炮闩滚轮沿淬火正弦凸轮槽陡升坡高速前冲，将 290 mm 长的 30×173mm PGU-14/B 穿甲燃烧弹笔直推入 1 号炮管线膛药室。',
  },
  {
    id: 'gau8_phase_7_lock_3900rpm',
    stepNum: '07',
    shortLabel: '12点旋锁3900RPM续射',
    title: '阶段 7 · 12 点位闭锁衔接下圈循环，七炮闩 51.4° 错相波浪输出每秒 65 发金属风暴',
    range: [0.86, 1.0],
    description:
      '回归 12 点钟前止点，1 号炮闩锁死炮膛并压紧击发储能簧准备下一击；其余六套钛合金炮闩以精确 51.43° 错相排布在同一道 360° 正弦螺旋轨道内并行运作，织就每分钟 3,900 发、撕裂主战坦克顶甲的航空机炮神话！',
  },
];

// ============================================================================
// Coupled 7-Barrel Rotary, 7-Bolt Sinusoidal Wave & Helical Drum Kinematics
// ============================================================================

const BOLT_INDEX_BY_ID: Readonly<Record<string, number>> = {
  gau8_bolt_1: 0,
  gau8_bolt_2: 1,
  gau8_bolt_3: 2,
  gau8_bolt_4: 3,
  gau8_bolt_5: 4,
  gau8_bolt_6: 5,
  gau8_bolt_7: 6,
};

export function computeGau8FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let rx = 0;
  const ry = 0;
  const rz = 0;
  let scaleX = 1;

  const spin = TWO_PI * f;

  // Sustained 3,900 RPM 7-impulse recoil envelope (smoothly 0 at f=0 and f=1!)
  const recoilRipple =
    0.58 * Math.sin(f * Math.PI) +
    0.42 * (0.5 - 0.5 * Math.cos(f * GAU8_BARREL_COUNT * TWO_PI)) * Math.sin(f * Math.PI);

  const boltIdx = BOLT_INDEX_BY_ID[partId];
  if (boltIdx !== undefined) {
    const th0 = gau8BoltPhaseAngle(boltIdx);
    const th = th0 + spin;
    // Exact 360° coaxial 7-fold orbit around (Y=0, Z=0) coupled to exact 300 mm sinusoidal cam stroke!
    dx = BOLT_HALF_STROKE * (Math.cos(th) - Math.cos(th0));
    dy = GAU8_PITCH_RADIUS * (Math.cos(th) - Math.cos(th0));
    dz = GAU8_PITCH_RADIUS * (Math.sin(th) - Math.sin(th0));
    rx = spin;
  } else {
    switch (partId) {
      case 'gau8_barrel_cluster':
      case 'gau8_barrel_clamps':
      case 'gau8_muzzle_clamp':
      case 'gau8_rotor_core': {
        // Coaxial 360° continuous 7-barrel rotary cluster & central star-rotor spin
        rx = spin;
        break;
      }

      case 'gau8_drum_rotor':
      case 'gau8_ammo_belt_stack': {
        // Synchronous counter-rotation of 14-fold helical drum rotor & 70 visible 30x173mm API rounds
        // Steps exactly 2 of 14 stations (-2π/7 = -0.8976 rad) per full 7-barrel firing cycle!
        rx = -(TWO_PI / GAU8_BARREL_COUNT) * f;
        break;
      }

      case 'gau8_recoil_buffers': {
        // Twin hydro-pneumatic recoil absorber cylinders compress smoothly rearward under 44.5 kN recoil
        dx = -7.2 * recoilRipple;
        break;
      }

      case 'gau8_recoil_springs': {
        // Dynamic CSG Spring #1 (local X in [-32, +32], rear pinned at -32):
        // Compresses dynamically from 1.000 -> 0.740 under 44.5 kN sustained recoil ripple!
        const pinAnchorX = -32.0;
        const comp = 0.26 * recoilRipple;
        scaleX = 1 - comp;
        dx = pinAnchorX * (1 - scaleX);
        break;
      }

      case 'gau8_buffer_spring': {
        // Dynamic CSG Spring #2 (local X in [-11, +11], rear pinned at -11):
        // 7-per-rev hydraulic torque-clutch & transfer star-wheel shock pulses (scaleX in [0.76, 1.00])
        const pinAnchorX = -11.0;
        const torquePulse =
          0.14 * Math.sin(f * Math.PI) +
          0.1 * (0.5 - 0.5 * Math.cos(f * GAU8_BARREL_COUNT * TWO_PI));
        scaleX = 1 - torquePulse;
        dx = pinAnchorX * (1 - scaleX);
        break;
      }

      case 'gau8_striker_spring': {
        // Dynamic CSG Spring #3 (local X in [-9, +9], rear pinned at -9):
        // Cocked by firing cam prior to ignition & snaps forward sharply at f = 0.08 + 7-per-rev ripples!
        const pinAnchorX = -9.0;
        const cockCycle =
          0.2 * Math.sin(f * Math.PI) +
          0.12 * (0.5 - 0.5 * Math.cos(f * GAU8_BARREL_COUNT * TWO_PI));
        scaleX = 1 - cockCycle;
        dx = pinAnchorX * (1 - scaleX);
        break;
      }

      default:
        break;
    }
  }

  const snap0 = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  return {
    pos: [snap0(dx), snap0(dy), snap0(dz)],
    rot: [snap0(rx), ry, rz],
    scaleX: Math.abs(scaleX - 1) < 1e-9 ? 1 : scaleX,
  };
}

/**
 * 30×173mm PGU-14/B API (430 MPa, 1,010 m/s, 201 kJ) 12-O'Clock Rotary Ballistics
 * & Closed-Loop Linkless Spent-Case Return Choreography (`f ∈ [0, 1]`):
 *  - `ignitionF = 0.08` -> `muzzleExitF = 0.19` along 12 o'clock barrel (`Y = +7.40, Z = 0`, `X: +78 -> +320`)
 *  - `f in [0.14, 0.44)`: Spent 30mm aluminum case tracks Bolt #1 down right flank (+Z) to transfer exit
 *  - `f in [0.44, 0.78)`: Closed-loop return! Spent aluminum case travels AFT through `gau8_chute_return`
 *    (`Y = -18.0, Z = +24.0`, `X: -12 -> -108`) back into the helical drum to preserve A-10 CG balance!
 *  - `f in [0.50, 0.88)`: Live 30×173mm PGU-14/B round transfers from `gau8_chute_feed` (`Z = -24.0`)
 *    through transfer unit up the 8–12 o'clock rotor chambering arc to `[+78.0, +7.40, 0]`.
 */
export function computeGau8BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);

  // 1. 30x173mm PGU-14/B API Projectile accelerating down 2.3m 12 o'clock barrel (Y = +7.40, Z = 0)
  const bulletVisible = f < 0.38;
  let bulletX = GAU8_CHAMBER_X;
  let streakLength = 0;

  if (f >= 0.08 && f < 0.19) {
    const u = Math.pow(linearSeg(f, 0.08, 0.19), 1.38);
    bulletX = GAU8_CHAMBER_X + (GAU8_MUZZLE_X - GAU8_CHAMBER_X) * u;
    streakLength = 34.0 * u;
  } else if (f >= 0.19 && f < 0.38) {
    const u = linearSeg(f, 0.19, 0.38);
    bulletX = GAU8_MUZZLE_X + 460.0 * u;
    streakLength = 82.0 * (1 - u * 0.42);
  }

  // 2. Spent 30x173mm Aluminum Case: orbits with Bolt #1 then enters CLOSED-LOOP return chute back to drum!
  const spentCaseVisible = f < 0.82;
  let caseX = GAU8_CHAMBER_X;
  let caseY = GAU8_PITCH_RADIUS;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.14 && f < 0.44) {
    const th = TWO_PI * f;
    caseX = GAU8_CHAMBER_X - BOLT_HALF_STROKE * (1 - Math.cos(th));
    caseY = GAU8_PITCH_RADIUS * Math.cos(th);
    caseZ = GAU8_PITCH_RADIUS * Math.sin(th);
    caseRX = th;
  } else if (f >= 0.44 && f < 0.82) {
    const u = seg(f, 0.44, 0.82);
    const thE = TWO_PI * 0.44;
    const xE = GAU8_CHAMBER_X - BOLT_HALF_STROKE * (1 - Math.cos(thE));
    const yE = GAU8_PITCH_RADIUS * Math.cos(thE);
    const zE = GAU8_PITCH_RADIUS * Math.sin(thE);
    // Smooth linkless return conveyor curve back toward helical drum return port [-108, -18, +24]
    caseX = xE + (-108.0 - xE) * u;
    caseY = yE + (-18.0 - yE) * u;
    caseZ = zE + (24.0 - zE) * u;
    caseRX = thE * (1 - u);
    caseRY = 0.08 * Math.sin(u * Math.PI);
    caseRZ = -0.06 * Math.sin(u * Math.PI);
    if (f > 0.72) {
      spentCaseOpacity = 1 - linearSeg(f, 0.72, 0.82);
    }
  }

  // 3. 12-O'Clock Chamber Flash & Dramatic 30mm Autocannon Muzzle Plume (hydraulic drive -> 0 gas port!)
  let chamberFlashIntensity = 0;
  if (f >= 0.078 && f <= 0.175) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.078, 0.175) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.185 && f <= 0.305) {
    const u = linearSeg(f, 0.185, 0.305);
    muzzlePlumeScale = 1.45 + 5.2 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.92;
  }

  // 4. Next Live 30x173mm PGU-14/B Round: advances from left feed chute [-28, -10, -22] -> 8-12 o'clock chamber!
  let nextX = -28.0;
  let nextY = -10.0;
  let nextZ = -22.0;
  let nextRZ = 0;

  if (f >= 0.5 && f < 0.68) {
    const u = seg(f, 0.5, 0.68);
    nextX = -28.0 + (36.0 - -28.0) * u;
    nextY = -10.0 + (-3.7 - -10.0) * u;
    nextZ = -22.0 + (-6.41 - -22.0) * u;
    nextRZ = 0.05 * Math.sin(u * Math.PI);
  } else if (f >= 0.68 && f < 0.88) {
    const u = seg(f, 0.68, 0.88);
    const th = (4 * Math.PI) / 3 + ((2 * Math.PI) / 3) * u;
    nextX = 36.0 + (GAU8_CHAMBER_X - 36.0) * u;
    nextY = GAU8_PITCH_RADIUS * Math.cos(th);
    nextZ = GAU8_PITCH_RADIUS * Math.sin(th);
    nextRZ = 0.03 * (1 - u);
  } else if (f >= 0.88) {
    nextX = GAU8_CHAMBER_X;
    nextY = GAU8_PITCH_RADIUS;
    nextZ = 0;
    nextRZ = 0;
  }

  // 5. Reserve 30x173mm PGU-14/B Round advancing forward along left linkless feed chute from drum
  const chuteShift = seg(f, 0.5, 0.74);
  const resX = -104.0 + (-28.0 - -104.0) * chuteShift;
  const resY = -6.0 + (-10.0 - -6.0) * chuteShift;
  const resZ = -26.0 + (-22.0 - -26.0) * chuteShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, GAU8_PITCH_RADIUS, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity: 0,
    gasPortPos: [GAU8_CHAMBER_X, GAU8_PITCH_RADIUS, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, resZ],
  };
}

// ============================================================================
// Direct v3 Cycles-Baked 3 x 2K (2048x2048) 5-Channel Packed ORM WebP Suites
// ============================================================================

export const GAU8_V3_EXTERIOR_PBR: PbrBindingSpec = {
  albedoFile: 'gau8_v3_exterior_albedo.webp',
  normalFile: 'gau8_v3_exterior_normal.webp',
  roughnessFile: 'gau8_v3_exterior_roughness.webp',
  normalScale: 0.92,
};

export const GAU8_V3_INTERNAL_PBR: PbrBindingSpec = {
  albedoFile: 'gau8_v3_internal_albedo.webp',
  normalFile: 'gau8_v3_internal_normal.webp',
  roughnessFile: 'gau8_v3_internal_roughness.webp',
  normalScale: 0.86,
};

export const GAU8_V3_DRUM_PBR: PbrBindingSpec = {
  albedoFile: 'gau8_v3_drum_albedo.webp',
  normalFile: 'gau8_v3_drum_normal.webp',
  roughnessFile: 'gau8_v3_drum_roughness.webp',
  normalScale: 0.9,
};

export const GAU8_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  // Suite 1: gau8_v3_exterior (8 solid GLB parts)
  gau8_barrel_cluster: GAU8_V3_EXTERIOR_PBR,
  gau8_barrel_clamps: GAU8_V3_EXTERIOR_PBR,
  gau8_muzzle_clamp: GAU8_V3_EXTERIOR_PBR,
  gau8_gun_housing: GAU8_V3_EXTERIOR_PBR,
  gau8_recoil_mount: GAU8_V3_EXTERIOR_PBR,
  gau8_recoil_buffers: GAU8_V3_EXTERIOR_PBR,
  gau8_hydraulic_motors: GAU8_V3_EXTERIOR_PBR,
  gau8_transfer_unit: GAU8_V3_EXTERIOR_PBR,

  // Suite 2: gau8_v3_internal (9 solid GLB parts)
  gau8_cam_track: GAU8_V3_INTERNAL_PBR,
  gau8_rotor_core: GAU8_V3_INTERNAL_PBR,
  gau8_bolt_1: GAU8_V3_INTERNAL_PBR,
  gau8_bolt_2: GAU8_V3_INTERNAL_PBR,
  gau8_bolt_3: GAU8_V3_INTERNAL_PBR,
  gau8_bolt_4: GAU8_V3_INTERNAL_PBR,
  gau8_bolt_5: GAU8_V3_INTERNAL_PBR,
  gau8_bolt_6: GAU8_V3_INTERNAL_PBR,
  gau8_bolt_7: GAU8_V3_INTERNAL_PBR,

  // Suite 3: gau8_v3_drum (5 solid GLB parts)
  gau8_ammo_drum: GAU8_V3_DRUM_PBR,
  gau8_drum_rotor: GAU8_V3_DRUM_PBR,
  gau8_ammo_belt_stack: GAU8_V3_DRUM_PBR,
  gau8_chute_feed: GAU8_V3_DRUM_PBR,
  gau8_chute_return: GAU8_V3_DRUM_PBR,
};

export const GAU8_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'gau8_v3_exterior',
    weapon: GAU8_ID,
    titleCn:
      'GAU-8/A 七管炮管簇、热回火炮口箍、USAF 铭牌主炮匣与双液压马达贴图组 (V3)',
    partTag: 'B-01..03 / F-01 / F-03..04 / FC-01..02 EXTERIOR & HYDRAULICS',
    resolution: '2048 × 2048 px',
    summary:
      '由 Blender 5.2 Cycles Metal GPU 烘焙的 GAU-8/A 外部航空军械 2K 5 通道 Packed ORM 贴图组：精细刻画 2.3 米七管冷锻炮管簇、持续 3,900 RPM 扫射留下的金铜—蓝紫热回火穿孔炮口箍、锻钢主炮匣左右双侧高清无镜像 USAF 军标「GAU-8/A AVENGER 30MM / CAGE 05606 / MIL-STD-130 UID」、双 38.5 马力液压马达「DANGER HIGH PRESSURE HYDRAULICS 3000 PSI」黄黑警示铭牌及清膛安全门黄红「SAFE / ARMED」隔离防火区。',
    highlights: [
      '主炮匣左右平面高清 1:1 USAF 军标喷涂铭文与 16×16 MIL-STD-130 UID 二维码',
      '双 3,000 PSI 液压马达高对比黄黑高压警示牌与 SAFE/ARMED 清膛安全门（>=50px 防火墙）',
      '穿孔钛合金炮口箍 3,900 RPM 金铜—蓝紫热回火过渡带与钛合金反后坐基座机加刀纹',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'gau8_v3_exterior_albedo.webp',
        note: 'sRGB · 航空底漆炮匣 USAF 军标 / 热回火炮口箍 / 阳极钛蓝液压马达与黄黑警示牌',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'gau8_v3_exterior_normal.webp',
        note: 'Linear · 加强筋铸造微纹 + 炮管车铣环纹 + 螺栓倒角与铭牌凸凹微法线',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'gau8_v3_exterior_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:镀铬活塞(0.16)-磷化炮管(0.32)-底漆(0.46) / B:金属度',
      },
    ],
  },
  {
    id: 'gau8_v3_internal',
    weapon: GAU8_ID,
    titleCn:
      '360° 淬火螺旋凸轮导轨套筒、七槽 CNC 中心星形转子与七套钛合金旋转炮闩贴图组 (V3)',
    partTag: 'F-02 / B-04..11 360° HELICAL CAM TRACK, STAR-ROTOR & 7 BOLTS',
    resolution: '2048 × 2048 px',
    summary:
      '专为 CT 纵剖面（[C]）打造的 GAU-8/A 核心精密内构 2K 5 通道 Packed ORM 贴图组：呈现 360° 渗碳淬火正弦凸轮套筒内壁经百万次滚轮碾压抛亮的镜面铬导轨槽（经内腔 AO 提亮确保纵剖高光夺目）、七槽五轴 CNC 精铣星形中心转子各向异性车铣刀痕与 28 齿大驱动齿轮，以及全部 7 套镀硬铬钛合金旋转滚轮炮闩的拉丝精密轴承光泽。',
    highlights: [
      '360° 椭圆形螺旋凸轮导轨镜面磨亮滑道 + 内腔 AO 精准提亮，CT 纵剖质感惊艳',
      '七槽五轴 CNC 中心星形转子与 28 齿硬化驱动齿轮各向异性车铣高光',
      '全部 7 套镀硬铬钛合金滚轮炮闩统一高精度润滑油膜微糙度校准',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'gau8_v3_internal_albedo.webp',
        note: 'sRGB · 镜面正弦凸轮槽 / CNC 七槽星形转子 / 七套硬铬钛合金旋转炮闩',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'gau8_v3_internal_normal.webp',
        note: 'Linear · 凸轮轨高频滑动磨痕 + 星形转子 CNC 刀纹 + 炮闩三突笋倒角',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'gau8_v3_internal_roughness.webp',
        note: 'Linear · R:内腔提亮AO / G:镜铬凸轮与炮闩(0.17)-渗碳套筒(0.34) / B:高金属度',
      },
    ],
  },
  {
    id: 'gau8_v3_drum',
    weapon: GAU8_ID,
    titleCn:
      '1,150 发巨型螺旋供弹鼓、十四翼转子、30×173mm PGU-14/B 弹药阵与双滑槽贴图组 (V3)',
    partTag: 'M-01..05 HELICAL AMMO DRUM, 30MM PGU-14/B API & LINKLESS CHUTES',
    resolution: '2048 × 2048 px',
    summary:
      '面向 GAU-8/A 震撼供弹巨兽的 2K 5 通道 Packed ORM 贴图组：航空橄榄底漆 Ø876 mm 巨型弹鼓左右双侧精印高清 USAF 军标「GAU-8/A HELICAL AMMUNITION DRUM · 1,150 RDS · PGU-14/B API · DANGER EXPLOSIVES」与航空黄黑斜纹警示带；70 发 1:1 30×173mm PGU-14/B 穿甲燃烧弹实行四重严格 >=50 px UV 防火墙——拉丝轻质铝合金弹壳、炭黑穿甲弹体、绯红燃烧识别带与红铜导带零色渗分明！',
    highlights: [
      '巨型螺旋弹鼓双侧高清 USAF 白色与军黄军标喷涂铭牌 + 黄黑危险警示带',
      '30×173mm PGU-14/B 拉丝铝壳、炭黑弹体、绯红燃烧环与红铜导带四重 UV 防火墙',
      '双通道无链铝滑槽加强筋铆钉微法线与十四翼不锈钢螺旋拨弹转子拉丝光泽',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'gau8_v3_drum_albedo.webp',
        note: 'sRGB · 航空橄榄弹鼓军标与黄黑警示 / 拉丝铝壳 30mm PGU-14/B 与绯红燃烧环',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'gau8_v3_drum_normal.webp',
        note: 'Linear · 弹鼓加强箍铆钉 + 铝弹壳旋压纹 + 无链滑槽肋条与军标漆层微厚度',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'gau8_v3_drum_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:拉丝铝壳(0.20)-橄榄航空底漆(0.50)-黑胶垫(0.80) / B:金属度',
      },
    ],
  },
];

export const GAU8_PLUGIN: WeaponRuntimePlugin = {
  id: GAU8_ID,
  partGroups: GAU8_PART_GROUPS,
  timelinePresets: GAU8_TIMELINE_PRESETS,
  parts: GAU8_PARTS,
  firingPhases: GAU8_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(GAU8_FIRING_PHASES, f),
  computeFiringKinematics: computeGau8FiringKinematics,
  computeBallisticsState: computeGau8BallisticsState,
  pbrBindings: GAU8_PBR_BINDINGS,
  pbrSuites: GAU8_PBR_SUITES,
};
