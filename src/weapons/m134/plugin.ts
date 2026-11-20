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
  M134_BOLT_STROKE,
  M134_BOLT_X_FWD,
  M134_PITCH_RADIUS,
} from './meshes/m134Geometries';

export const M134_ID: WeaponId = 'm134';
export const M134_CALIBER: CaliberProfile = '762_nato';

const TWO_PI = Math.PI * 2;
const BOLT_HALF_STROKE = M134_BOLT_STROKE * 0.5; // 2.30 cm

function boltPhaseAngle(index0to5: number): number {
  return (index0to5 * Math.PI) / 3;
}

function boltAssembledPos(index0to5: number): [number, number, number] {
  const th = boltPhaseAngle(index0to5);
  const x0 = Number(
    (M134_BOLT_X_FWD - BOLT_HALF_STROKE * (1 - Math.cos(th))).toFixed(4)
  );
  const y0 = Number((M134_PITCH_RADIUS * Math.cos(th)).toFixed(4));
  const z0 = Number((M134_PITCH_RADIUS * Math.sin(th)).toFixed(4));
  return [x0, y0, z0];
}

function boltExplodeSteps(index0to5: number): WeaponPartSpec['explodeSteps'] {
  const th = boltPhaseAngle(index0to5);
  const [x0, y0, z0] = boltAssembledPos(index0to5);
  // Real-world M134D armorer rear-extraction: bolts withdraw aft with the star-rotor to X ≈ -38.0 cm
  // and fan radially outward to R_exploded = 9.5 cm at exact 60° star symmetry -> ZERO pairwise overlaps
  // and balanced 1920x1080 exploded framing!
  const targetX = -38.0 + BOLT_HALF_STROKE * Math.cos(th) * 0.8;
  const targetY = 9.5 * Math.cos(th);
  const targetZ = 9.5 * Math.sin(th);
  const totalDx = targetX - x0;
  const totalDy = targetY - y0;
  const totalDz = targetZ - z0;
  return [
    {
      range: [0.32, 0.62],
      offset: [
        Number((totalDx * 0.68).toFixed(3)),
        Number((totalDy * 0.35).toFixed(3)),
        Number((totalDz * 0.35).toFixed(3)),
      ],
    },
    {
      range: [0.62, 0.96],
      offset: [
        Number((totalDx * 0.32).toFixed(3)),
        Number((totalDy * 0.65).toFixed(3)),
        Number((totalDz * 0.65).toFixed(3)),
      ],
    },
  ];
}

export const M134_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '六管22"旋转枪管簇、星形中心转子与6套正弦凸轮枪机组',
    nameEn: '6-Barrel 22" Rotary Cluster, Star-Rotor & 6 Cam-Driven Bolts',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '加强筋圆柱主机匣、360°正弦凸轮套筒、减速箱壳、提把与枢轴架',
    nameEn: 'Ribbed Main Housing, 360° Cam Track, Gearbox, Handle & Pintle',
    badgeColor: '#94a3b8',
  },
  {
    key: 'fire_control',
    nameZh: '28V直流电驱马达、驱动大齿轮、离合簧、安全门与航空双铲握把组',
    nameEn: '28V DC Electric Motor, Spur Gear, Clutch Spring, Safing & Spade Grip',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '迪伦无链脱链供弹器、星轮拨齿、供弹缓冲簧、柔性输弹槽与抛壳口',
    nameEn: 'Dillon Aero Delinker, Star-Wheel, Feeder Spring, Ammo & Eject Chutes',
    badgeColor: '#4ade80',
  },
];

export const M134_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '3,000 RPM 战斗合拢态',
    subLabel: '0% Combat Ready',
    t: 0,
    desc: '美国通用电气 / 迪伦航空（General Electric / Dillon Aero）M134D 7.62×51mm NATO 六管加特林机枪（全长 802 mm）完整战备合拢态：28V 直流电机、360° 正弦凸轮主机匣、六根 22 英寸旋转枪管簇与左侧柔性不锈钢输弹槽严丝合缝，准备以每分钟 3,000 发狂暴弹幕压制战场。',
  },
  {
    id: 'field_strip',
    label: '一级机务勤务快拆',
    subLabel: '30% Crew Field Strip',
    t: 0.3,
    desc: '遵循美军直升机门炮手勤务教范快速分解：卸除左侧柔性不锈钢 M13 输弹槽与右下抛壳滑槽，拔销打开顶部黄红安全门（Safing Sector），前抽卸下六管旋转消焰器与多孔稳定卡箍，并后拆航空双铲握把总成。',
  },
  {
    id: 'sub_assembly',
    label: '二级转子凸轮与电驱拆解',
    subLabel: '65% Rotor & Electric Drive',
    t: 0.65,
    desc: '向上吊离顶部 28V 直流航空驱动马达（露出内部漆包铜电枢绕组）与前提把，向下卸除直升机枢轴支架，向后抽出减速箱与 28 齿大驱动齿轮；同时前抽 360° 正弦螺旋凸轮套筒与六槽中心星形转子，令 6 套镀铬旋转枪机环绕转子辐射状展开。',
  },
  {
    id: 'full_exploded',
    label: '全枪 25 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 25 个 1:1 航空军械构件零干涉展开：从 22 英寸六管开槽枪管簇、六槽 CNC 中心星形转子、6 套按 60° 相位排布的镀铬滚轮枪机、360° 机匣正弦螺旋凸轮槽、28V 直流铜绕组电机到左侧迪伦无链脱链器与 7.62 NATO 黄铜弹链，完整呈现人类外能源旋转自动机的工程巅峰。',
  },
];

export const M134_PARTS: WeaponPartSpec[] = [
  // ==================== 1. 6-BARREL CLUSTER, STAR-ROTOR & 6 BOLTS ('slide' · 10 parts) ====================
  {
    id: 'm134_barrel_cluster',
    bomCode: 'B-01',
    nameZh: '六管22英寸冷锻重型7.62×51mm旋转枪管簇',
    calloutLabel: '六管22"旋转枪管簇',
    nameEn: '6-Barrel 22" Heavy Fluted 7.62x51mm NATO Rotary Barrel Cluster',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.16, 0.34], offset: [4.2, 0, 0] },
      { range: [0.36, 0.66], offset: [3.2, 0, 0] },
      { range: [0.66, 0.96], offset: [1.6, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [24.0, 3.2, 0],
    labelAppearAt: 0.08,
    roleTag: '559mm 6×60°同轴阵列 · 分担热负荷实现 3,000 RPM 持续火力',
    description:
      '六根全长 559 mm（22 英寸）铬钼钒钢冷精锻 7.62×51mm NATO 重型枪管以精确 60° 间隔环绕中央转子轴线（节圆半径 26.5 mm）排布：电机驱动整束枪管以 500 转/分高速旋回，每根枪管实际仅承担 500 发/分热负荷并在 300° 非击发弧段强迫风冷，彻底突破单管机枪热熔极限。',
  },
  {
    id: 'm134_barrel_clamp',
    bomCode: 'B-02',
    nameZh: '双级多孔轻量化航空枪管稳定卡箍总成',
    calloutLabel: '双级通风枪管稳定箍',
    nameEn: 'Dual-Station Ventilated Rotary Barrel Clamp & Spider Assembly',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [28.0, 0, 0],
    explodeSteps: [
      { range: [0.1, 0.3], offset: [15.5, 0, 0] },
      { range: [0.36, 0.66], offset: [14.5, 0, 0] },
      { range: [0.66, 0.96], offset: [8.5, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [1.5, 4.1, 0],
    labelAppearAt: 0.12,
    roleTag: '中前双盘抑制高速离心甩动 · 锁紧六管保持精准散布锥',
    description:
      '由中段与前段两片精铣多孔合金钢圆盘及中心空心联轴管构成的稳定卡箍总成：采用 6 枚不锈钢内六角高强螺栓夹紧六根枪管，在 500 RPM 高速自转与强气流冲击下消除枪管离心外张与谐振鞭动，可微调弹道散布密集度。',
  },
  {
    id: 'm134_flash_suppressor',
    bomCode: 'B-03',
    nameZh: '六筒笼式热回火旋转膛口消焰器',
    calloutLabel: '六筒热回火旋转消焰器',
    nameEn: 'Six-Tube Heat-Tempered Rotary Muzzle Flash Suppressor Cage',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [47.2, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [14.0, 0, 0] },
      { range: [0.36, 0.66], offset: [12.5, 0, 0] },
      { range: [0.66, 0.96], offset: [7.5, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [1.0, 4.2, 0],
    labelAppearAt: 0.1,
    roleTag: '迪伦改进型六筒防炫笼 · 持续扫射蓝紫金铜热回火与积碳',
    description:
      '锁固于六根枪管最前端的标志性迪伦航空（Dillon Aero）六筒多孔笼式消焰器：不仅显著抑制夜间直升机低空突袭时致盲夜视仪的炽烈膛口火球，更作为前支点刚性箍紧六管口部，其表面因数百度高温燃气冲刷呈现迷人的金铜至蓝紫热回火色带。',
  },
  {
    id: 'm134_rotor_assembly',
    bomCode: 'B-04',
    nameZh: '六槽CNC星形中心转子与枪管闭锁盘总成',
    calloutLabel: '六槽CNC星形中心转子',
    nameEn: 'Six-Flute CNC Machined Central Star-Rotor & Barrel Lock Head',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-6.8, 0, 0],
    explodeSteps: [
      { range: [0.32, 0.62], offset: [-19.5, 0, 0] },
      { range: [0.62, 0.96], offset: [-10.5, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    calloutAnchor: [0, 3.8, 0],
    labelAppearAt: 0.34,
    roleTag: 'M134D动力与导向心脏 · 六条轴向T型导轨引导六套枪机同步旋转',
    description:
      'M134D 内部最震撼的机械核心：整块航空锻钢五轴 CNC 精铣而成的星形中心转子——尾端花键轴承接减速大齿轮扭矩，中段铣出六条均布 60° 的硬化 T 形导轨引导全部六套枪机随动旋转与前后滑移，前端重型圆盘开设六个精密膛口卡槽将六根枪管刚性旋锁成一体！',
  },
  {
    id: 'm134_bolt_1',
    bomCode: 'B-05',
    nameZh: '1号镀铬旋转滚轮枪机(12点位闭锁击发相)',
    calloutLabel: '1号旋转枪机(12点击发)',
    nameEn: 'No.1 Hard-Chrome Rotary Bolt Assembly (12-O-Clock Firing Phase)',
    group: 'slide',
    material: 'stainless',
    assembledPos: boltAssembledPos(0),
    assembledRot: [boltPhaseAngle(0), 0, 0],
    explodeSteps: boltExplodeSteps(0),
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.38,
    roleTag: '0° 12点最高前止点 · 双突笋旋锁击发 7.62×51mm NATO 实弹',
    description:
      '六套独立往复旋转枪机中的 1 号基准枪机（初始相位 0° 位于 12 点钟正上方）：顶部滚轮导柱嵌于 360° 正弦凸轮槽最前端死点，枪机头前推到位并由凸轮驱动旋转闭锁，随转子越过顶部击发凸轮瞬间释放同轴击针引燃底火。',
  },
  {
    id: 'm134_bolt_2',
    bomCode: 'B-06',
    nameZh: '2号镀铬旋转滚轮枪机(2点位开锁初抽相)',
    calloutLabel: '2号旋转枪机(2点开锁)',
    nameEn: 'No.2 Hard-Chrome Rotary Bolt Assembly (2-O-Clock Unlock Phase)',
    group: 'slide',
    material: 'stainless',
    assembledPos: boltAssembledPos(1),
    assembledRot: [boltPhaseAngle(1), 0, 0],
    explodeSteps: boltExplodeSteps(1),
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.42,
    roleTag: '60° 2点位下降凸轮段 · 旋松闭锁突笋并启动重负荷初次抽壳',
    description:
      '滞后 1 号枪机 60° 相位的 2 号镀铬滚轮枪机：滚轮导柱沿机匣内壁正弦凸轮斜坡开始向后回撤，先强制枪机头回转解脱闭锁，随即依靠宽大弹簧钢抽壳钩将发射后紧贴膛壁的 7.62mm 黄铜弹壳平稳拔松。',
  },
  {
    id: 'm134_bolt_3',
    bomCode: 'B-07',
    nameZh: '3号镀铬旋转滚轮枪机(4点位全抽抛壳相)',
    calloutLabel: '3号旋转枪机(4点抛壳)',
    nameEn: 'No.3 Hard-Chrome Rotary Bolt Assembly (4-O-Clock Ejection Phase)',
    group: 'slide',
    material: 'stainless',
    assembledPos: boltAssembledPos(2),
    assembledRot: [boltPhaseAngle(2), 0, 0],
    explodeSteps: boltExplodeSteps(2),
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.44,
    roleTag: '120° 4点位右下抛壳窗 · 高速甩出灼热 7.62mm 空黄铜壳',
    description:
      '位于 120°（4 点钟右下方）的 3 号旋转枪机：正弦凸轮槽已将其向后拉过近四分之三总行程（约 34.5 mm），彻底将空弹壳拖离弹膛并在正对右下抛壳滑槽的黄金瞬间将其向右下方干脆抛出。',
  },
  {
    id: 'm134_bolt_4',
    bomCode: 'B-08',
    nameZh: '4号镀铬旋转滚轮枪机(6点位后止点换向相)',
    calloutLabel: '4号旋转枪机(6点后止点)',
    nameEn: 'No.4 Hard-Chrome Rotary Bolt Assembly (6-O-Clock Rear Dead Center)',
    group: 'slide',
    material: 'stainless',
    assembledPos: boltAssembledPos(3),
    assembledRot: [boltPhaseAngle(3), 0, 0],
    explodeSteps: boltExplodeSteps(3),
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.46,
    roleTag: '180° 6点正下方最尾端 · 满行程 46mm 后退为新弹腾出供弹窗',
    description:
      '位于 180°（6 点钟正下方）的 4 号旋转枪机：滚轮抵达 360° 椭圆形正弦凸轮槽最尾端波谷（向后满行程 46.0 mm），在转子沟槽前端彻底让出超过 71.1 mm 的充裕装填空间，准备迎接迪伦无链脱链器送来的下一发实弹。',
  },
  {
    id: 'm134_bolt_5',
    bomCode: 'B-09',
    nameZh: '5号镀铬旋转滚轮枪机(8点位无链接弹相)',
    calloutLabel: '5号旋转枪机(8点接弹)',
    nameEn: 'No.5 Hard-Chrome Rotary Bolt Assembly (8-O-Clock Delinker Feed Phase)',
    group: 'slide',
    material: 'stainless',
    assembledPos: boltAssembledPos(4),
    assembledRot: [boltPhaseAngle(4), 0, 0],
    explodeSteps: boltExplodeSteps(4),
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.48,
    roleTag: '240° 8点位左侧供弹口 · 承接星轮脱链实弹启动正弦前推',
    description:
      '位于 240°（8 点钟左下方）的 5 号旋转枪机：滚轮驶上正弦凸轮前推上升斜坡，枪机镜面精准托住由左侧迪伦无链供弹器星轮拨入转子沟槽的新鲜 7.62×51mm NATO 实弹底缘，启动高速平顺推弹上膛。',
  },
  {
    id: 'm134_bolt_6',
    bomCode: 'B-10',
    nameZh: '6号镀铬旋转滚轮枪机(10点位进膛闭锁相)',
    calloutLabel: '6号旋转枪机(10点进膛)',
    nameEn: 'No.6 Hard-Chrome Rotary Bolt Assembly (10-O-Clock Chambering Phase)',
    group: 'slide',
    material: 'stainless',
    assembledPos: boltAssembledPos(5),
    assembledRot: [boltPhaseAngle(5), 0, 0],
    explodeSteps: boltExplodeSteps(5),
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.5,
    roleTag: '300° 10点位上升末段 · 推弹完全入膛并旋入闭锁节套待发',
    description:
      '位于 300°（10 点钟左上方）的 6 号旋转枪机：在正弦凸轮最后一段前推冲程中将 7.62mm 实弹完全推入对应枪管弹膛并开始旋转闭锁，紧随 1 号枪机之后仅隔 20 毫秒（3,000 RPM = 50 发/秒！）即可在 12 点钟位置完成下一次击发！',
  },

  // ==================== 2. HOUSING, 360° CAM TRACK, GEARBOX, HANDLE & PINTLE ('frame' · 5 parts) ====================
  {
    id: 'm134_main_housing',
    bomCode: 'F-01',
    nameZh: '重型加强筋铸造圆柱主机匣(带军标铭牌与UID码)',
    calloutLabel: '加强筋圆柱主机匣',
    nameEn: 'Heavy Ribbed Cylindrical Mainframe Housing w/ Military Stencil & UID',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-6.5, 0, 0],
    explodeSteps: [],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 3.8, 5.8],
    labelAppearAt: 0.04,
    roleTag: '全枪承力圆筒骨架 · 内嵌360°正弦凸轮套筒与军标白色喷涂铭文',
    description:
      'M134D 最具工业力量感的核心圆筒承力机匣：采用航空级高强锻造合金一体精加工，外壁环布 8 条纵向抗扭加强筋与前后 8 螺栓重型法兰盘，左右两侧精铣平面铭牌喷印白色军标「GUN, AUTOMATIC, 7.62MM, M134D · DILLON AERO · GENERAL ELECTRIC · CAGE 1U2T4 · 3,000 RPM」与 MIL-STD-130 二维资产码；开启 CT 纵剖面（[C]）即可直接洞穿其内嵌的 360° 正弦波浪凸轮槽！',
  },
  {
    id: 'm134_cam_track_ring',
    bomCode: 'F-02',
    nameZh: '内嵌式360°硬化钢正弦螺旋凸轮导轨套筒',
    calloutLabel: '360°正弦螺旋凸轮套筒',
    nameEn: 'Internal 360-Degree Elliptical Sinusoidal Hardened Cam Track Sleeve',
    group: 'frame',
    material: 'stainless',
    isShell: true,
    assembledPos: [-9.9, 0, 0],
    explodeSteps: [
      { range: [0.34, 0.64], offset: [-7.5, 0, 0] },
      { range: [0.64, 0.96], offset: [-4.0, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, -4.6, 0],
    labelAppearAt: 0.34,
    roleTag: '加特林原理灵魂 · 静止内壁正弦波浪槽同步驱动六套枪机往复',
    description:
      '嵌装于主机匣内腔的深层渗碳淬火工具钢圆筒导轨（高耐磨磨光内槽）：其内圆柱面经五轴数控铣削出一道首尾闭合的 360° 椭圆形正弦波浪轨道（总行程 46.0 mm）！当中心星形转子带动六套枪机高速圆周公转时，六枚枪机滚轮被迫沿此静止正弦槽同步划出进弹—闭锁—击发—开锁—抽壳—抛壳的完美机械波！',
  },
  {
    id: 'm134_gear_housing',
    bomCode: 'F-03',
    nameZh: '梨形后置行星减速齿轮箱壳体',
    calloutLabel: '后置减速齿轮箱壳',
    nameEn: 'Rear Pear-Shaped Reduction Gearbox Casing',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-18.8, 2.2, 0],
    explodeSteps: [
      { range: [0.22, 0.44], offset: [-16.5, 0, 0] },
      { range: [0.46, 0.78], offset: [-24.0, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, 5.2, 0],
    labelAppearAt: 0.24,
    roleTag: '耦合28V顶部小齿轮与转子大齿 · 封闭飞溅油浴高速传动',
    description:
      '通过后法兰螺栓刚性对接主机匣尾部的梨形航空铝合金/硬化钢减速箱壳体：下腔精密包络转子尾端 28 齿大驱动直齿轮，上塔精准承托顶部 28V 直流电机输出小齿轮，将 9,000 RPM 高速电机转速平稳减速增扭为 500 RPM 六管转子转速（对应 3,000 发/分射速）。',
  },
  {
    id: 'm134_carry_handle',
    bomCode: 'F-04',
    nameZh: '前部油锯式重型钢制稳定与携行提把',
    calloutLabel: '前部油锯式重型提把',
    nameEn: 'Forward Chainsaw-Style Heavy Tubular Steel Carry & Stabilizer Handle',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [3.2, 7.6, 0],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [2.5, 6.2, 0] },
      { range: [0.66, 0.96], offset: [2.0, 4.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [5.2, 5.6, 0],
    labelAppearAt: 0.36,
    roleTag: '前法兰双梁龙门架 · 方便勤务吊装拆换与近距腰射平衡',
    description:
      '锁固于主机匣前重型法兰上方、形似重型油锯提把的标志性钢制龙门握把：采用双侧斜撑加强梁与防滑橡胶滚花横杆，既供航空军械员两人快速将重达 18.8 kg 的机枪本体抬离直升机挂架检修，也赋予经典影视作品中标志性的轮廓张力。',
  },
  {
    id: 'm134_mount_pintle',
    bomCode: 'F-05',
    nameZh: '下置军用直升机/车载迪伦枢轴缓冲支架',
    calloutLabel: '下置军用枢轴缓冲架',
    nameEn: 'Under-Receiver Military Helicopter / Vehicular Pintle Recoil Mount',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-6.5, -8.8, 0],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [0, -4.0, 0] },
      { range: [0.66, 0.96], offset: [0, -2.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -3.5, 0],
    labelAppearAt: 0.36,
    roleTag: '高强双颊鞍座与青铜衬套立柱 · 吸收 650N 持续稳态后坐推力',
    description:
      '螺栓锁固在主机匣腹部的重型航空级万向枢轴安装架：内置高耐磨青铜回转轴套与快拆 T 形锁定销，直接插入 UH-60 黑鹰直升机舱门支臂、悍马车顶炮塔或快艇枪架，稳定吸收 3,000 RPM 持续连发产生的逾 650 牛顿稳态后坐推力。',
  },

  // ==================== 3. 28V MOTOR, DRIVE GEAR, CLUTCH SPRING, SAFING & SPADE GRIP ('fire_control' · 5 parts) ====================
  {
    id: 'm134_drive_motor',
    bomCode: 'FC-01',
    nameZh: '顶置28V直流3.2马力航空电驱马达(含漆包铜电枢绕组)',
    calloutLabel: '28V航空电驱马达与铜绕组',
    nameEn: 'Top-Mounted 28V DC 3.2-HP Aerospace Electric Motor w/ Copper Windings',
    group: 'fire_control',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-9.5, 9.3, 0],
    explodeSteps: [
      { range: [0.32, 0.64], offset: [0, 5.2, 0] },
      { range: [0.64, 0.96], offset: [0, 3.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 3.1, 0],
    labelAppearAt: 0.32,
    roleTag: '外能源驱动核心 · 零哑弹停射风险 · 剖视清晰呈现暖铜电枢线圈',
    description:
      '彻底改写重机枪可靠性历史的 28V 直流（3.2 马力）航空外能源驱动马达：外壳周身精加工 10 道散热环翅并铆固金属铭牌「28V DC · 3.2 HP · 3000 RPM」及军规航空插头，内藏密绕暖红漆包铜电枢线圈与黄铜换向器；即便弹链中混入哑弹，电机也会毫不迟疑地将其直接抛出继续全速扫射！',
  },
  {
    id: 'm134_drive_gear',
    bomCode: 'FC-02',
    nameZh: '28齿渐开线渗碳硬化转子主驱动大齿轮',
    calloutLabel: '28齿转子主驱动大齿轮',
    nameEn: '28-Tooth Precision-Hobbed Alloy Steel Rotor Main Spur Drive Gear',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-18.4, 0, 0],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-20.5, 0, 0] },
      { range: [0.68, 0.96], offset: [-13.0, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.38,
    roleTag: '花键刚性锁连转子尾轴 · 与顶部电机小齿轮啮合输出 500 RPM',
    description:
      '套装在星形转子尾端花键轴上的大直径 28 齿渗碳硬化直齿轮（节圆直径 99 mm）：直接与上方 28V 直流电机尾端淬火小齿轮精密啮合，以高降速比输出充沛启动扭矩，在不到 0.35 秒内将沉重的六管枪管簇与六套枪机加速至满速 3,000 发/分！',
  },
  {
    id: 'm134_clutch_spring',
    bomCode: 'FC-03',
    nameZh: '减速箱防过载扭力离合与背隙缓冲螺旋簧',
    calloutLabel: '电驱离合缓冲螺旋簧',
    nameEn: 'Gearbox Drive-Clutch & Torque-Limiting Helical Buffer Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-18.4, 3.85, 0],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-20.5, 2.8, 0] },
      { range: [0.68, 0.96], offset: [-13.0, 2.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.42,
    roleTag: '高刚度琴钢丝轴向压簧 · 平抑电机瞬时启动冲击保护齿面',
    description:
      '嵌套于后置减速箱驱动轴腔内的重型高疲劳琴钢丝螺旋缓冲压簧：当射手按下铲把火控开关、28V 直流电机瞬间释放百安级启动电流的毫秒间，该弹簧动态压缩缓冲齿轮啮合冲击并抑制突发停射时的惯性反冲齿隙。',
  },
  {
    id: 'm134_safing_sector',
    bomCode: 'FC-04',
    nameZh: '顶置快拆安全门总成(配黄红SAFE/ARMED警示牌)',
    calloutLabel: '顶置SAFE/ARMED安全门',
    nameEn: 'Top Quick-Release Safing Sector Gate w/ Yellow-Red Armed Plate',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-0.6, 6.15, 0],
    explodeSteps: [
      { range: [0.06, 0.24], offset: [1.5, 2.8, 0] },
      { range: [0.46, 0.78], offset: [1.3, 2.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.1,
    roleTag: '物理阻断12点凸轮击发轨迹 · 鲜明黄红警示牌确保机舱验枪安全',
    description:
      '位于 28V 电机正前方主机匣顶窗上的快拆式安全门（Safing Sector）：机身醒目喷涂军黄底黑字与绯红「SAFE / ARMED」警示标牌；扳起快拆拉环取出或切至安全挡时，可机械隔离 12 点位击发凸轮，使门炮手安全执行空转清膛而不误击实弹。',
  },
  {
    id: 'm134_spade_grip',
    bomCode: 'FC-05',
    nameZh: '直升机双铲式握把总成(含双蝴蝶拇指电门与绯红主武装开关)',
    calloutLabel: '双铲式握把与蝴蝶电门',
    nameEn: 'Dual-Handle Helicopter Spade Grip w/ Butterfly Paddles & Master Arm',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [-25.8, 0.2, 0],
    explodeSteps: [
      { range: [0.12, 0.3], offset: [-17.5, 0, 0] },
      { range: [0.46, 0.78], offset: [-25.0, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [-2.4, 2.5, 0],
    labelAppearAt: 0.14,
    roleTag: '双手掌稳控 650N 推力 · 顶置绯红主保险开关与双侧拇指电控扳机',
    description:
      '安装在减速箱尾端的标志性航空双铲式（Spade Grip）操纵握把：两侧加粗防滑橡胶立握把供门炮手戴飞行手套稳控枪身，中央电控桥内置双侧铝合金蝴蝶式拇指按压火控开关、防误触护圈以及醒目的绯红色主武装拨动开关（Master Arm Toggle）。',
  },

  // ==================== 4. DILLON DELINKER, SPROCKET, FEEDER SPRING, AMMO & EJECT CHUTES ('magazine' · 5 parts) ====================
  {
    id: 'm134_delinker_housing',
    bomCode: 'M-01',
    nameZh: '左侧迪伦航空(Dillon Aero)无链脱链供弹器箱体',
    calloutLabel: '迪伦无链脱链供弹箱',
    nameEn: 'Side-Mounted Dillon Aero Stainless / Anodized Delinker Feeder Housing',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-9.2, -1.6, -8.2],
    explodeSteps: [
      { range: [0.1, 0.28], offset: [0, 0, -6.5] },
      { range: [0.46, 0.78], offset: [0, 0, -5.5] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, 1.8, -3.0],
    labelAppearAt: 0.12,
    roleTag: '解决早期卡弹顽疾的迪伦传奇革新 · 强力将 M13 钢链剥离为无链实弹',
    description:
      '螺栓锁固于主机匣左侧（-Z）的迪伦航空改进型脱链供弹机箱体（激光蚀刻「DILLON AERO DELINKER FEEDER · 7.62MM NATO」铭文）：通过与主转子刚性齿轮同步的强制脱链道，将随 M13 金属弹链进入的 7.62×51mm 实弹以每秒 50 发极速精准剥离链环并平稳导入转子 8 点位枪机槽，将 M134D 平均故障间隔从 3 万发飙升至逾 10 万发！',
  },
  {
    id: 'm134_delinker_sprocket',
    bomCode: 'M-02',
    nameZh: '六瓣不锈钢星轮脱链拨弹转轴',
    calloutLabel: '六瓣不锈钢脱链星轮轴',
    nameEn: 'Six-Pocket Stainless Star-Wheel Belt-Stripping Delinker Sprocket',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [-9.2, -1.4, -7.8],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [0, 0, -2.5] },
      { range: [0.68, 0.96], offset: [0, 0, -2.0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.4,
    roleTag: '与主转子 1:1 反向同步齿轮啮合 · 毫秒级剥链无卡顿',
    description:
      '位于迪伦脱链供弹器箱体内部的高硬度不锈钢六瓣星轮拨弹轴：尾端齿轮与主转子 1:1 反向同步啮合旋转，六个圆弧半槽精准扣住每一发 7.62mm 弹壳躯干，在固定剥链楔配合下将实弹推出 M13 开口链节并分毫不差地交接给主转子 6 套枪机。',
  },
  {
    id: 'm134_feeder_spring',
    bomCode: 'M-03',
    nameZh: '脱链器输弹棘爪张紧缓冲螺旋簧',
    calloutLabel: '脱链输弹张紧螺旋簧',
    nameEn: 'Delinker Belt-Tension & Feed-Pawl Helical Buffer Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [-9.2, 1.35, -7.8],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [0, 2.2, -2.5] },
      { range: [0.68, 0.96], offset: [0, 1.6, -2.0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.42,
    roleTag: '高弹性耐疲劳压簧 · 实时稳压 50 发/秒高速跳动弹链张力',
    description:
      '布置于脱链器上导槽内的琴钢丝螺旋张紧缓冲簧：当重达数十公斤的 4,000 发弹链经柔性输弹槽剧烈抖动涌入脱链口时，该弹簧以每秒 50 次的高频微幅脉动持续顶紧止退棘爪，杜绝弹链坠滑与错齿卡弹。',
  },
  {
    id: 'm134_ammo_chute',
    bomCode: 'M-04',
    nameZh: '不锈钢柔性波纹输弹槽与7.62×51mm M13黄铜实弹链',
    calloutLabel: '柔性不锈钢输弹槽与7.62弹链',
    nameEn: 'Flexible Ribbed Stainless Feed Chute w/ Linked 7.62x51mm M13 Brass Belt',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [-9.2, -9.2, -10.8],
    explodeSteps: [
      { range: [0.04, 0.22], offset: [0, -4.0, -6.5] },
      { range: [0.46, 0.78], offset: [0, -2.8, -5.5] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -2.5, -1.2],
    labelAppearAt: 0.06,
    roleTag: '铰接不锈钢蛇形导槽 · 满载退火C26000黄铜壳、红铜弹头与M13黑钢链',
    description:
      '将直升机舱内 4,000 发巨型弹药箱与旋转俯仰机枪本体柔性连通的标志性不锈钢波纹节段输弹槽：敞开式观察窗内清晰排列 8 发 1:1 比例 7.62×51mm NATO（M80 147 格令）全威力实弹——经退火处理的金黄 C26000 黄铜弹壳、红铜被甲尖头弹与深灰锰磷化 M13 可散弹簧钢链节泾渭分明！',
  },
  {
    id: 'm134_ejection_chute',
    bomCode: 'M-05',
    nameZh: '右下侧黄铜空壳与散落M13链节排壳滑槽',
    calloutLabel: '右下侧抛壳与排链滑槽',
    nameEn: 'Lower-Right Brass Casing & Disintegrated M13 Link Ejection Chute Port',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-9.8, -4.4, 7.2],
    explodeSteps: [
      { range: [0.06, 0.24], offset: [0, -1.5, 3.8] },
      { range: [0.46, 0.78], offset: [0, -1.0, 2.7] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -1.2, 1.4],
    labelAppearAt: 0.08,
    roleTag: '4点位高速定向排壳口 · 防止炽热铜雨飞溅入直升机涡轴进气道',
    description:
      '铆接在主机匣右下方（+Z, -Y）4 点钟抛壳窗外的重型加厚防磨损导流滑槽：以每秒 50 发的瀑布流量将灼热 7.62mm 黄铜空弹壳与脱链后的 M13 钢链节向机腹右下方定向安全导离，避免滚烫弹壳打伤机组或被吸入直升机旋翼尾桨。',
  },
];

// ============================================================================
// 7-Phase Electrically Driven 3,000 RPM Rotary Gatling Firing Cycle (f in [0, 1])
// ============================================================================

export const M134_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'm134_phase_1_motor_arm',
    stepNum: '01',
    shortLabel: '28V电驱启动闭锁',
    title: '阶段 1 · 按下铲把双蝴蝶电门，28V 直流电机驱动六管转子与 1 号枪机抵临 12 点闭锁',
    range: [0.0, 0.08],
    description:
      '拨开绯红主武装开关并压下双铲握把蝴蝶拇指电门，28V 直流航空马达经离合缓冲簧与 28 齿大齿轮驱动六槽中心转子、六根 22 英寸枪管与六套滚轮枪机高速旋转，1 号枪机抵达 12 点钟正弦凸轮最前止点完成刚性闭锁。',
  },
  {
    id: 'm134_phase_2_ignition_bore',
    stepNum: '02',
    shortLabel: '12点击发7.62出膛',
    title: '阶段 2 · 12 点位击发凸轮释放击针，7.62×51mm NATO 以 415 MPa 膛压射出消焰笼',
    range: [0.08, 0.22],
    description:
      'f = 0.09 时 1 号枪机同轴击针击发底火，415 MPa 高压火药燃气推动 147 格令 M80 全金属被甲弹沿 12 点位 22 英寸枪管疾驰加速，于 f = 0.19 以 853 m/s 强劲初速冲出热回火六筒消焰器；此时整束六管保持 500 RPM 丝滑自转。',
  },
  {
    id: 'm134_phase_3_cam_unlock',
    stepNum: '03',
    shortLabel: '正弦凸轮开锁初抽',
    title: '阶段 3 · 枪机越过 2 点位驶入 360° 正弦凸轮回程斜坡，旋松突笋强力拔松弹壳',
    range: [0.22, 0.36],
    description:
      '转过 2 点钟弧段（60°–120°），1 号枪机滚轮沿主机匣内嵌 360° 硬化钢正弦凸轮槽向后滑移，驱动旋转枪机头回转解锁，宽爪抽壳钩将发射后膨胀贴壁的 7.62mm 黄铜弹壳强力向后抽离弹膛。',
  },
  {
    id: 'm134_phase_4_extract_eject',
    stepNum: '04',
    shortLabel: '4点全抽右下抛壳',
    title: '阶段 4 · 4 点位完成 46 mm 深行程抽壳，灼热黄铜空壳经右下抛壳滑槽高速甩出',
    range: [0.36, 0.52],
    description:
      '旋转至 4 点钟右下方位（120°–180°），正弦凸轮槽将枪机向后拖出逾 38 mm 彻底抽空弹膛；于 f = 0.44 经过机匣右下抛壳窗瞬间，固定抛壳挺将炙热黄铜壳干脆甩出右下排壳滑槽。',
  },
  {
    id: 'm134_phase_5_delinker_strip',
    stepNum: '05',
    shortLabel: '6点后止与星轮脱链',
    title: '阶段 5 · 6 点位抵达正弦波谷，左侧迪伦六瓣星轮同步剥离 M13 钢链导入新鲜实弹',
    range: [0.52, 0.68],
    description:
      '1 号枪机抵达 6 点钟正下方最尾端后死点（ΔX = -46.0 mm）腾出完整装填窗；与此同时左侧反向啮合旋转的迪伦六瓣星轮脉动压缩供弹缓冲簧，将 7.62×51mm NATO 实弹强力剥离 M13 钢链并平稳馈入 8 点位转子沟槽。',
  },
  {
    id: 'm134_phase_6_cam_chamber',
    stepNum: '06',
    shortLabel: '8-10点凸轮推弹入膛',
    title: '阶段 6 · 枪机滚轮攀升正弦凸轮上升坡，高速前推 7.62 NATO 新弹平顺入膛',
    range: [0.68, 0.86],
    description:
      '跨越 8–10 点钟左侧弧段（240°–310°），1 号枪机滚轮沿 360° 椭圆形正弦凸轮前推斜坡急剧前冲，推动刚接手的 7.62×51mm NATO 实弹笔直滑入 1 号枪管弹膛。',
  },
  {
    id: 'm134_phase_7_lock_cycle',
    stepNum: '07',
    shortLabel: '12点闭锁3000RPM续射',
    title: '阶段 7 · 10–12 点旋锁归位，六枪机 60° 相位波浪接力实现 50 发/秒持续火风暴',
    range: [0.86, 1.0],
    description:
      '回到 12 点钟顶端前止点，1 号枪机完成旋转闭锁无缝衔接下一轮 360° 循环；其余五套枪机严格以 60° 错相排布在同一道正弦波浪槽内同步完成供弹、闭锁、击发、抽壳与抛壳，在 3,000 RPM 下每 20 毫秒倾泻一发全威力步枪弹！',
  },
];

// ============================================================================
// Coupled 6-Barrel Rotary Gatling & 6-Bolt Sinusoidal Cam Kinematics (f ∈ [0, 1])
// ============================================================================

const BOLT_INDEX_BY_ID: Readonly<Record<string, number>> = {
  m134_bolt_1: 0,
  m134_bolt_2: 1,
  m134_bolt_3: 2,
  m134_bolt_4: 3,
  m134_bolt_5: 4,
  m134_bolt_6: 5,
};

export function computeM134FiringKinematics(
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

  const boltIdx = BOLT_INDEX_BY_ID[partId];
  if (boltIdx !== undefined) {
    const th0 = boltPhaseAngle(boltIdx);
    const th = th0 + spin;
    // Exact 360° coaxial orbit around (Y=0, Z=0) coupled to exact 46.0 mm sinusoidal cam reciprocation!
    dx = BOLT_HALF_STROKE * (Math.cos(th) - Math.cos(th0));
    dy = M134_PITCH_RADIUS * (Math.cos(th) - Math.cos(th0));
    dz = M134_PITCH_RADIUS * (Math.sin(th) - Math.sin(th0));
    rx = spin;
  } else {
    switch (partId) {
      case 'm134_barrel_cluster':
      case 'm134_barrel_clamp':
      case 'm134_flash_suppressor':
      case 'm134_rotor_assembly':
      case 'm134_drive_gear': {
        // Coaxial 360° continuous Gatling rotor & 6-barrel cluster rotation
        rx = spin;
        break;
      }

      case 'm134_delinker_sprocket': {
        // 1:1 counter-rotating 6-pocket star-wheel stripping M13 links into rotor pockets
        rx = -spin;
        break;
      }

      case 'm134_clutch_spring': {
        // Heavy X-axis drive-clutch buffer spring (local x in [-2.2, +2.2], rear pinned at -2.2):
        // Smooth spin-up torque load + 6-per-rev firing impulse ripple (scaleX in [0.78, 1.00])
        const pinAnchorX = -2.2;
        const torqueLoad =
          0.14 * Math.sin(f * Math.PI) +
          0.08 * (0.5 - 0.5 * Math.cos(f * 12 * Math.PI));
        scaleX = 1 - torqueLoad;
        dx = pinAnchorX * (1 - scaleX);
        break;
      }

      case 'm134_feeder_spring': {
        // Helical X-axis delinker tension buffer spring (local x in [-2.4, +2.4], rear pinned at -2.4):
        // 6-per-rev M13 belt-stripping tension pulses (scaleX in [0.78, 1.00])
        const pinAnchorX = -2.4;
        const feedPulse =
          0.12 * Math.sin(f * Math.PI) +
          0.1 * (0.5 - 0.5 * Math.cos(f * 12 * Math.PI));
        scaleX = 1 - feedPulse;
        dx = pinAnchorX * (1 - scaleX);
        break;
      }

      // Stationary mainframe housing, 360° cam track sleeve, 28V motor stator, gearbox,
      // spade grip, carry handle, pintle, safing sector, delinker housing & chutes stay anchored
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
 * 7.62×51mm NATO (M80 147gr FMJ, 415 MPa) 12-O'Clock Rotary Gatling Ballistics Choreography:
 *  - `ignitionF = 0.09` -> `muzzleExitF = 0.19` along the 12 o'clock barrel (`Y = +2.65, Z = 0`, `X: -3.2 -> +50.2`)
 *  - `f in [0.22, 0.44)` -> `ejectF = 0.44`: Spent 7.62mm brass tracks Bolt #1 down the right side (`+Z`)
 *    and exits cleanly through `m134_ejection_chute` (`Y < -4.0, Z > +7.0`)!
 *  - `f in [0.52, 0.88)`: Fresh delinked 7.62mm NATO round transfers from left Dillon delinker (`Z = -7.8`)
 *    up the 8–12 o'clock rotor chambering arc to `[-3.2, 2.65, 0]` (`endpointJump === 0`!).
 */
export function computeM134BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);

  // 1. 7.62×51mm NATO M80 147gr Projectile along 12 o'clock barrel (Y = +2.65, Z = 0)
  const bulletVisible = f < 0.38;
  let bulletX = -3.2;
  let streakLength = 0;

  if (f >= 0.09 && f < 0.19) {
    const u = Math.pow(linearSeg(f, 0.09, 0.19), 1.42);
    bulletX = -3.2 + (50.2 - -3.2) * u; // Exits 6-tube rotary flash suppressor tip X = +50.2 at f = 0.19!
    streakLength = 6.2 * u;
  } else if (f >= 0.19 && f < 0.38) {
    const u = linearSeg(f, 0.19, 0.38);
    bulletX = 50.2 + 82.0 * u;
    streakLength = 14.5 * (1 - u * 0.42);
  }

  // 2. Spent 7.62×51mm Brass Casing: orbits down right flank (+Z) with Bolt #1 & ejects at f = 0.44 out lower-right chute!
  const spentCaseVisible = f < 0.78;
  let caseX = -3.2;
  let caseY = M134_PITCH_RADIUS;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.14 && f < 0.44) {
    const th = TWO_PI * f;
    caseX = -3.2 - BOLT_HALF_STROKE * (1 - Math.cos(th));
    caseY = M134_PITCH_RADIUS * Math.cos(th);
    caseZ = M134_PITCH_RADIUS * Math.sin(th);
    caseRX = th;
  } else if (f >= 0.44 && f < 0.78) {
    const u = linearSeg(f, 0.44, 0.78);
    const thE = TWO_PI * 0.44;
    const xE = -3.2 - BOLT_HALF_STROKE * (1 - Math.cos(thE));
    const yE = M134_PITCH_RADIUS * Math.cos(thE);
    const zE = M134_PITCH_RADIUS * Math.sin(thE);
    caseX = xE - 2.4 * u;
    caseY = yE - 3.6 * u - 11.2 * u * u;
    caseZ = zE + 15.8 * u;
    caseRX = thE + u * 9.6;
    caseRY = -u * 13.4;
    caseRZ = -u * 10.8;
    if (f > 0.65) {
      spentCaseOpacity = 1 - linearSeg(f, 0.65, 0.78);
    }
  }

  // 3. 12-O'Clock Chamber Ignition Flash & Rotary Flash Suppressor Muzzle Plume (externally driven -> 0 gas port!)
  let chamberFlashIntensity = 0;
  if (f >= 0.088 && f <= 0.17) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.088, 0.17) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.185 && f <= 0.285) {
    const u = linearSeg(f, 0.185, 0.285);
    muzzlePlumeScale = 0.56 + 1.72 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.88;
  }

  // 4. Next Live 7.62×51mm NATO Cartridge: stripped from left Dillon Delinker -> 8-12 o'clock chambering arc!
  let nextX = -9.2;
  let nextY = -1.6;
  let nextZ = -7.6;
  let nextRZ = 0;

  if (f >= 0.52 && f < 0.68) {
    // Delinker star-wheel strips round laterally from Z=-7.6 into 8 o'clock rotor pocket
    const u = seg(f, 0.52, 0.68);
    nextX = -9.2 + (-8.8 - -9.2) * u;
    nextY = -1.6 + (-1.325 - -1.6) * u;
    nextZ = -7.6 + (-2.295 - -7.6) * u;
    nextRZ = 0.05 * Math.sin(u * Math.PI);
  } else if (f >= 0.68 && f < 0.88) {
    // 8 -> 12 o'clock sinusoidal cam ramming arc straight into 12 o'clock chamber [-3.2, +2.65, 0]!
    const u = seg(f, 0.68, 0.88);
    const th = (4 * Math.PI) / 3 + ((2 * Math.PI) / 3) * u;
    nextX = -8.8 + (-3.2 - -8.8) * u;
    nextY = M134_PITCH_RADIUS * Math.cos(th);
    nextZ = M134_PITCH_RADIUS * Math.sin(th);
    nextRZ = 0.03 * (1 - u);
  } else if (f >= 0.88) {
    nextX = -3.2;
    nextY = M134_PITCH_RADIUS;
    nextZ = 0;
    nextRZ = 0;
  }

  // 5. Reserve 7.62×51mm NATO Cartridge rising up left flexible stainless ammo chute toward delinker star-wheel
  const chuteShift = seg(f, 0.52, 0.72);
  const resX = -9.2;
  const resY = -5.6 + (-1.6 - -5.6) * chuteShift;
  const resZ = -9.6 + (-7.6 - -9.6) * chuteShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, M134_PITCH_RADIUS, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity: 0,
    gasPortPos: [-3.2, M134_PITCH_RADIUS, 0],
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

const M134_HOUSING_MOTOR_PBR: PbrBindingSpec = {
  albedoFile: 'm134_v3_housing_motor_albedo.webp',
  normalFile: 'm134_v3_housing_motor_normal.webp',
  roughnessFile: 'm134_v3_housing_motor_roughness.webp',
  normalScale: 0.88,
};

const M134_BARRELS_ROTOR_PBR: PbrBindingSpec = {
  albedoFile: 'm134_v3_barrels_rotor_albedo.webp',
  normalFile: 'm134_v3_barrels_rotor_normal.webp',
  roughnessFile: 'm134_v3_barrels_rotor_roughness.webp',
  normalScale: 0.85,
};

const M134_DELINKER_BOLTS_PBR: PbrBindingSpec = {
  albedoFile: 'm134_v3_delinker_bolts_albedo.webp',
  normalFile: 'm134_v3_delinker_bolts_normal.webp',
  roughnessFile: 'm134_v3_delinker_bolts_roughness.webp',
  normalScale: 0.86,
};

export const M134_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  // Suite 1: m134_v3_housing_motor (7 solid parts)
  m134_main_housing: M134_HOUSING_MOTOR_PBR,
  m134_cam_track_ring: M134_HOUSING_MOTOR_PBR,
  m134_drive_motor: M134_HOUSING_MOTOR_PBR,
  m134_gear_housing: M134_HOUSING_MOTOR_PBR,
  m134_spade_grip: M134_HOUSING_MOTOR_PBR,
  m134_carry_handle: M134_HOUSING_MOTOR_PBR,
  m134_mount_pintle: M134_HOUSING_MOTOR_PBR,

  // Suite 2: m134_v3_barrels_rotor (6 solid parts)
  m134_barrel_cluster: M134_BARRELS_ROTOR_PBR,
  m134_barrel_clamp: M134_BARRELS_ROTOR_PBR,
  m134_flash_suppressor: M134_BARRELS_ROTOR_PBR,
  m134_rotor_assembly: M134_BARRELS_ROTOR_PBR,
  m134_drive_gear: M134_BARRELS_ROTOR_PBR,
  m134_safing_sector: M134_BARRELS_ROTOR_PBR,

  // Suite 3: m134_v3_delinker_bolts (10 solid parts)
  m134_bolt_1: M134_DELINKER_BOLTS_PBR,
  m134_bolt_2: M134_DELINKER_BOLTS_PBR,
  m134_bolt_3: M134_DELINKER_BOLTS_PBR,
  m134_bolt_4: M134_DELINKER_BOLTS_PBR,
  m134_bolt_5: M134_DELINKER_BOLTS_PBR,
  m134_bolt_6: M134_DELINKER_BOLTS_PBR,
  m134_delinker_housing: M134_DELINKER_BOLTS_PBR,
  m134_delinker_sprocket: M134_DELINKER_BOLTS_PBR,
  m134_ammo_chute: M134_DELINKER_BOLTS_PBR,
  m134_ejection_chute: M134_DELINKER_BOLTS_PBR,
};

export const M134_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'm134_v3_housing_motor',
    weapon: M134_ID,
    titleCn:
      'M134D 加强筋主机匣军标喷印、360°正弦凸轮套筒、28V铜绕组电机与航空铲把贴图组',
    partTag: 'F-01 / F-02 / FC-01 / FC-05 HOUSING, CAM TRACK & 28V MOTOR',
    resolution: '2048 × 2048 px',
    summary:
      '由 Blender 5.2 Cycles GPU 烘焙的 M134D 主机体与电驱系统 2K 5 通道 Packed ORM 贴图组：精细刻画重型铸造加强筋圆柱主机匣两侧的军用白色喷涂铭文「GUN, AUTOMATIC, 7.62MM, M134D · DILLON AERO · GENERAL ELECTRIC · CAGE 1U2T4 · 3,000 RPM」及 16×16 ECC200 MIL-STD-130 二维码、内嵌 360° 正弦凸轮套筒磨亮钢轨、顶置 28V DC 3.2 HP 电机拉丝铝铭牌与暖红漆包铜电枢绕组，以及双铲握把绯红主武装开关隔离防火区。',
    highlights: [
      '主机匣左右双侧高清 1:1 军标白色喷涂铭文与 16×16 MIL-STD-130 UID 二维码',
      '28V DC 3.2 HP 航空马达散热翅片、拉丝铭牌与剖视暖铜漆包电枢线圈',
      '360° 淬火正弦凸轮槽磨光轨迹与双铲握把绯红主开关（>=50px UV防火墙）',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm134_v3_housing_motor_albedo.webp',
        note: 'sRGB · 锰磷化主机匣白色军标与UID / 暖红铜绕组 / 绯红主武装开关',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'm134_v3_housing_motor_normal.webp',
        note: 'Linear · 铸造微砂纹 + 散热翅片倒角 + 凸轮轨迹磨痕 + 握把滚花',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'm134_v3_housing_motor_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:磨光凸轮轨(0.18)-磷化钢(0.35)-橡胶握把(0.76) / B:金属度',
      },
    ],
  },
  {
    id: 'm134_v3_barrels_rotor',
    weapon: M134_ID,
    titleCn:
      '六管22英寸开槽枪管簇、热回火六筒消焰笼、星形中心转子与安全门贴图组',
    partTag: 'B-01 / B-02 / B-03 / B-04 / FC-02 / FC-04 BARRELS & ROTOR',
    resolution: '2048 × 2048 px',
    summary:
      '专为 M134D 旋转火控核心与六管枪管簇烘焙的 2K 5 通道 Packed ORM 贴图组：呈现六根 22 英寸开槽重型枪管的车铣刀纹与口径钢印、持续 3,000 RPM 扫射后在六筒消焰笼上留下的金铜—蓝紫热回火色带与深绒积碳、五轴 CNC 精铣六槽星形中心转子与 28 齿大齿轮拉丝金属光泽，以及顶部安全门严格 UV 隔离的高对比黄红「SAFE / ARMED」警示标牌。',
    highlights: [
      '六筒旋转消焰器持续连发金铜—蓝紫热回火过渡带与膛口亚光积碳',
      '六槽 CNC 中心星形转子与 28 齿渐开线大齿轮各向异性车铣金属高光',
      '顶置安全门高对比军黄/绯红「SAFE / ARMED」激光警示铭牌零色渗',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm134_v3_barrels_rotor_albedo.webp',
        note: 'sRGB · 开槽枪管钢 / 消焰器蓝紫金铜回火 / CNC转子 / 黄红安全门牌',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'm134_v3_barrels_rotor_normal.webp',
        note: 'Linear · 枪管车削环纹 + 星形转子CNC刀痕 + 28齿齿轮倒角与压印',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'm134_v3_barrels_rotor_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:星形转子(0.20)-枪管(0.32)-积碳(0.84) / B:金属度',
      },
    ],
  },
  {
    id: 'm134_v3_delinker_bolts',
    weapon: M134_ID,
    titleCn:
      '六套镀铬旋转滚轮枪机、迪伦无链脱链器、不锈钢输弹槽与7.62 NATO弹链贴图组',
    partTag: 'B-05..10 / M-01 / M-02 / M-04 / M-05 BOLTS & DELINKER BELT',
    resolution: '2048 × 2048 px',
    summary:
      '聚焦 M134D 标志性六枪机正弦波与迪伦供弹系统的 2K 5 通道 Packed ORM 贴图组：六套镀硬铬滚轮枪机与六瓣不锈钢星轮呈现镜面拉丝工业质感，左侧迪伦无链脱链器箱体精刻白色激光铭文，柔性不锈钢波纹输弹槽内 8 发 7.62×51mm NATO 实弹实行四重严格 UV 防火墙——退火瓶颈 C26000 黄铜弹壳、红铜被甲尖头弹、银色博克瑟底火与深黑磷化 M13 弹簧钢链零色渗分离，右下排壳滑槽内壁点缀真实弹壳撞击黄铜蹭痕。',
    highlights: [
      '全部 6 套硬铬滚轮枪机与迪伦六瓣星轮高光拉丝精密轴承质感',
      '7.62×51mm 退火黄铜壳、红铜弹头、银底火与黑磷化 M13 钢链 4 重 UV 防火墙',
      '迪伦脱链器白色激光铭牌与右下抛壳滑槽内壁真实黄铜蹭痕（Brass Kiss）',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm134_v3_delinker_bolts_albedo.webp',
        note: 'sRGB · 硬铬六枪机 / 迪伦铭文 / 退火黄铜7.62弹链与红铜FMJ弹头',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'm134_v3_delinker_bolts_normal.webp',
        note: 'Linear · 枪机CNC磨削纹 + 不锈钢输弹槽波纹 + M13链节与激光铭文',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'm134_v3_delinker_bolts_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:硬铬枪机与黄铜(0.18)-磷化M13链(0.40) / B:全金属分层',
      },
    ],
  },
];

export const M134_PLUGIN: WeaponRuntimePlugin = {
  id: M134_ID,
  partGroups: M134_PART_GROUPS,
  timelinePresets: M134_TIMELINE_PRESETS,
  parts: M134_PARTS,
  firingPhases: M134_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(M134_FIRING_PHASES, f),
  computeFiringKinematics: computeM134FiringKinematics,
  computeBallisticsState: computeM134BallisticsState,
  pbrBindings: M134_PBR_BINDINGS,
  pbrSuites: M134_PBR_SUITES,
};
