import { clamp01, findActiveFiringPhase } from '../../engine/kinematics/math';
import type {
  AssemblyGroupMeta,
  ExtendedBallisticsState,
  FiringPhaseInfo,
  PartKinematicDelta,
  PbrBindingSpec,
  PbrSuiteItem,
  TimelinePresetItem,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';

// ============================================================================
// #5 Barrett M82A1 (.50 BMG / 12.7x99mm NATO, BAY-05)
// Complete Self-Contained Weapon Module:
//   - 4 Major Assemblies ('slide' | 'frame' | 'fire_control' | 'magazine')
//   - 24 Procedural/CSG Parts (`m82a1_*`) spanning X in [-22.0, +34.0] (56 u)
//   - Authentic Ronnie Barrett Short-Recoil + Accelerator + 3-Lug Rotating Bolt
//     Kinematics (entire 29" fluted barrel + 2-chamber arrowhead tank muzzle
//     brake + barrel extension recoils rearward ~2.4 units locked to the bolt!)
// ============================================================================

export const M82A1_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '短后坐枪管、上机匣与光学瞄具总成',
    nameEn: 'Short-Recoil Barrel, Upper Receiver & Optics',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: '冲压钢下机匣、主缓冲簧与两脚架总成',
    nameEn: 'Sheet-Steel Lower Receiver, Buffer & Spiked Bipod',
    badgeColor: '#475569',
  },
  {
    key: 'fire_control',
    nameZh: '线性击铁、阻铁与快慢机火控组件',
    nameEn: 'Linear Striker, Sear & Thumb Selector FCG',
    badgeColor: '#e11d48',
  },
  {
    key: 'magazine',
    nameZh: '10 发 .50 BMG 加强筋钢制盒式弹匣',
    nameEn: '10-Round .50 BMG Ribbed Steel Box Magazine',
    badgeColor: '#d97706',
  },
];

export const M82A1_TIMELINE_PRESETS: TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢',
    subLabel: '0%',
    t: 0,
    desc: '巴雷特 M82A1 战备闭锁状态：29 英寸开槽重枪管在双复进拉簧张力下完全复进到位，三突笋枪机闭锁于枪管延伸节。',
  },
  {
    id: 'field_strip',
    label: '野战分解',
    subLabel: '25%',
    t: 0.25,
    desc: '卸除 10 发 .50 BMG 钢制弹匣，拔出前后机匣快拆横销分离上下冲压钢机匣，向后抽出枪机框与加速子总成。',
  },
  {
    id: 'upper_recoil',
    label: '短后坐枪管与瞄具拆解',
    subLabel: '52%',
    t: 0.52,
    desc: '脱开双联枪管复进拉簧，向前抽出箭头形双室制退器与开槽重枪管，向上分离 Leupold Mark 4 狙击镜及双环镜座。',
  },
  {
    id: 'bolt_fcg',
    label: '枪机/加速子与火控展开',
    subLabel: '78%',
    t: 0.78,
    desc: '分解三突笋回转枪机头、重型阶梯击针、加速子杠杆、尾托主复进簧以及下机匣内的线性击铁/阻铁火控机构。',
  },
  {
    id: 'full_exploded',
    label: '全分解蓝图',
    subLabel: '100%',
    t: 1,
    desc: '全部 24 个核心机械节点按三维正交层级完全展开，清晰呈现反器材步枪短后坐缓冲与闭锁传动链。',
  },
];

// ============================================================================
// 24 High-Precision M82A1 Parts (`m82a1_*`)
// Bore Axis: Y = +1.25, Z = 0.0 | Assembled Total Length: X in [-22.0, +34.0] (56.0 u)
// Note: KeyframeStep `offset` values are INCREMENTAL deltas summed across ranges!
// ============================================================================

export const M82A1_PARTS: WeaponPartSpec[] = [
  // ==================== 1. SHORT-RECOIL BARREL, UPPER & OPTICS ('slide' · 12) ====================
  {
    id: 'm82a1_muzzle_brake',
    bomCode: 'U-01',
    nameZh: '双室箭头坦克炮口制退器',
    calloutLabel: '双室箭头制退器',
    nameEn: 'Two-Chamber Arrowhead Tank Muzzle Brake',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [31.6, 1.25, 0],
    explodeSteps: [
      { range: [0.08, 0.25], offset: [0, 4.0, 0] },
      { range: [0.28, 0.54], offset: [8.5, 2.0, 0] },
      { range: [0.68, 0.96], offset: [6.0, 0.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [1.1, 1.1, 0],
    labelAppearAt: 0.28,
    roleTag: '65% 后坐冲量侧喷制退',
    description:
      '巴雷特最具视觉冲击力的双室后掠箭头形坦克炮口制退器：通过两级 60° 大倾角导流隔板将 .50 BMG 发射时的高压燃气向两侧后方剧烈偏转喷射，直接抵消约 65% 的轴向后坐冲量；射击瞬间随短后坐重枪管同步向后短行程后坐约 2.4 单位。',
  },
  {
    id: 'm82a1_barrel',
    bomCode: 'U-02',
    nameZh: '29 英寸纵向开槽短后坐重枪管',
    calloutLabel: '29" 开槽短后坐重枪管',
    nameEn: '29-Inch Longitudinally Fluted Recoiling Heavy Barrel',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 1.25, 0],
    explodeSteps: [
      { range: [0.08, 0.25], offset: [0, 4.0, 0] },
      { range: [0.3, 0.55], offset: [5.6, 2.0, 0] },
      { range: [0.7, 0.96], offset: [3.6, 0.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [21.5, 1.0, 0],
    labelAppearAt: 0.26,
    roleTag: '8 槽减重散热浮动后坐管',
    description:
      '全长 29 英寸（737mm · 1:15 右旋 8 膛线）的冷锻比赛级浮动后坐重枪管：外壁铣有 8 道深纵向减重散热槽（Fluting），射击初期与三突笋枪机刚性闭锁共同在上机匣前后自润滑衬套内向后滑行约 25mm 分摊后坐峰值，开锁后由双联复进拉簧平稳拉回前止点。',
  },
  {
    id: 'm82a1_barrel_extension',
    bomCode: 'U-03',
    nameZh: '枪管延伸节三突笋闭锁节套',
    calloutLabel: '枪管延伸节闭锁套',
    nameEn: 'Three-Lug Locking Barrel Extension',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [5.4, 1.25, 0],
    explodeSteps: [
      { range: [0.08, 0.25], offset: [0, 4.0, 0] },
      { range: [0.32, 0.56], offset: [2.2, 0.2, 1.4] },
      { range: [0.72, 0.96], offset: [1.4, 0, 1.6] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [0, 1.0, 0.5],
    labelAppearAt: 0.42,
    roleTag: '承受 370MPa 膛压闭锁母座',
    description:
      '旋接锁死于重枪管尾端的 4340 渗碳合金钢闭锁节套：内腔车削 120° 均布三突笋闭锁母槽直接承受 .50 BMG 峰值膛压（使冲压薄钢板上机匣免受闭锁拉应力），前端双侧横销挂耳连接双联枪管复进拉簧。',
  },
  {
    id: 'm82a1_barrel_springs',
    bomCode: 'U-04',
    nameZh: '双联枪管复进拉簧组件',
    calloutLabel: '双联枪管复进拉簧',
    nameEn: 'Twin Barrel Return Tension Springs',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [11.5, 1.25, 0],
    explodeSteps: [
      { range: [0.08, 0.25], offset: [0, 4.0, 0] },
      { range: [0.28, 0.54], offset: [4.2, 3.8, 1.8] },
      { range: [0.7, 0.96], offset: [2.3, 2.0, 1.4] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, 0.6, 0.84],
    labelAppearAt: 0.34,
    roleTag: '短后坐受拉储能复位双簧',
    description:
      '对称布置于护木前段枪管左右两侧的两根 17-7 PH 高预紧力密圈拉伸螺旋簧：后端挂钩连接枪管延伸节法兰，前端挂钩锚定于上机匣前衬套座；当枪管向后短后坐时双簧轴向受拉伸长约 29% 吸收能量，枪机开锁脱离后立即将重枪管平稳拉回待击位。',
  },
  {
    id: 'm82a1_upper_receiver',
    bomCode: 'U-05',
    nameZh: '冲压钢散热孔上机匣与 27-MOA 导轨',
    calloutLabel: '散热孔上机匣/27MOA导轨',
    nameEn: 'Ventilated Stamped Sheet-Steel Upper Receiver',
    group: 'slide',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.25], offset: [0, 4.0, 0] },
      { range: [0.35, 0.62], offset: [-0.8, 1.8, 0] },
      { range: [0.72, 0.96], offset: [-0.7, 1.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 56,
    calloutAnchor: [-6.5, 2.7, 0],
    labelAppearAt: 0.18,
    roleTag: '八角冲压机匣 · 28散热长孔',
    description:
      '由 4130 薄钢板精密冲压折弯并塞焊成型的八角截面轻量化上机匣：前护木两侧各冲双排共 28 个跑道形对流散热孔，右侧开巨型 .50 BMG 抛壳窗并配聚合物导壳块，顶部全长焊接自带 27 MOA 远射俯角补偿的 MIL-STD-1913 皮卡汀尼战术导轨与折叠准星/觇孔备用机械瞄具。',
  },
  {
    id: 'm82a1_carry_handle',
    bomCode: 'U-06',
    nameZh: '快拆折叠重型提把组件',
    calloutLabel: '快拆折叠重型提把',
    nameEn: 'Detachable Folding Heavy Carry Handle',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [10.8, 2.74, 0],
    explodeSteps: [
      { range: [0.08, 0.25], offset: [0, 4.0, 0] },
      { range: [0.28, 0.52], offset: [2.4, 4.4, 1.8] },
      { range: [0.68, 0.94], offset: [1.4, 2.4, 1.0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [0.2, 1.2, 1.6],
    labelAppearAt: 0.34,
    roleTag: '质心平衡单手携行提把',
    description:
      '跨装在物镜前方皮卡汀尼导轨质心平衡点上的重型钢制快拆提把：射击时向右侧水平折叠约 52° 避让 50mm 狙击镜视场，携行时竖起以便单手提握重达 14 公斤的整枪，握套刻有防滑隔热沟槽。',
  },
  {
    id: 'm82a1_scope',
    bomCode: 'U-07',
    nameZh: 'Leupold Mark 4 4.5-14×50 狙击瞄准镜',
    calloutLabel: 'Leupold Mark 4 狙击镜',
    nameEn: 'Leupold Mark 4 M1 4.5-14x50mm Sniper Scope',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [1.8, 4.1, 0],
    explodeSteps: [
      { range: [0.08, 0.25], offset: [0, 4.0, 0] },
      { range: [0.26, 0.52], offset: [0.8, 7.2, 0] },
      { range: [0.68, 0.96], offset: [0.7, 3.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 1.5, 0],
    labelAppearAt: 0.22,
    roleTag: '蓝绿镀膜物镜 · 0-15 MIL 手轮',
    description:
      '美军巴雷特标准配发的 Leupold Mark 4 远距离光学瞄准镜：采用 30mm 航空铝合金一体主镜筒与 50mm 多层翡翠蓝绿增透镀膜物镜，顶部高耸 M1 战术外露手轮刻有白色 0–15 MIL 密位分划，左侧设视差调焦轮，可配合 27-MOA 导轨对 1800 米外硬目标精确修正弹道下坠。',
  },
  {
    id: 'm82a1_scope_rings',
    bomCode: 'U-08',
    nameZh: 'Ultra-High 双环重型战术镜座',
    calloutLabel: '双环重型皮卡汀尼镜座',
    nameEn: 'Dual Heavy Tactical 30mm Picatinny Scope Rings',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [1.8, 2.74, 0],
    explodeSteps: [
      { range: [0.08, 0.25], offset: [0, 4.0, 0] },
      { range: [0.28, 0.54], offset: [-1.0, 4.4, -1.4] },
      { range: [0.7, 0.96], offset: [-0.8, 2.2, -0.8] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [-3.35, 1.9, 0],
    labelAppearAt: 0.36,
    roleTag: '抗 .50 BMG 双向冲击抱环',
    description:
      '专为承受 .50 BMG 正向后坐与双复进簧反向急停双向剧烈冲击设计的超重型 30mm 双抱环镜座：每只镜环由顶部四颗内六角螺钉均压锁紧，底部防退横键嵌入 1913 导轨槽并由六角螺母高扭矩锁死。',
  },
  {
    id: 'm82a1_bolt_carrier',
    bomCode: 'U-09',
    nameZh: '重型方截面枪机框与右侧拉机柄',
    calloutLabel: '重型枪机框与拉机柄',
    nameEn: 'Machined Steel Bolt Carrier & Charging Handle',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-1.2, 1.25, 0],
    explodeSteps: [
      { range: [0.12, 0.25], offset: [-5.8, 3.2, 0] },
      { range: [0.42, 0.68], offset: [-4.2, 0.4, 0] },
      { range: [0.72, 0.96], offset: [-2.5, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 1.0, 0],
    labelAppearAt: 0.22,
    roleTag: '螺旋凸轮槽 · 承接加速子推力',
    description:
      '在上机匣内导轨滑行的重型机加工钢制枪机框：顶面加工螺旋闭锁/开锁凸轮导槽驱动枪机头回转，右侧一体伸出滚花圆柱拉机柄，尾部枢接加速子杠杆并承受尾托主复进缓冲簧推力。',
  },
  {
    id: 'm82a1_accelerator',
    bomCode: 'U-10',
    nameZh: '短后坐能量传递加速子',
    calloutLabel: '短后坐能量加速子',
    nameEn: 'Short-Recoil Momentum Transfer Accelerator Arm',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-3.4, 0.52, 0],
    explodeSteps: [
      { range: [0.12, 0.25], offset: [-5.8, 3.2, 0] },
      { range: [0.55, 0.78], offset: [-3.2, -1.0, 2.4] },
      { range: [0.78, 0.98], offset: [-1.8, -0.6, 1.4] },
    ],
    calloutDir: 'up',
    calloutStem: 34,
    calloutAnchor: [0, 1.0, 0.2],
    labelAppearAt: 0.58,
    roleTag: '杠杆放大枪管动量至机框',
    description:
      '罗尼·巴雷特短后坐自动原理的核心灵魂零件：铰接于枪机框后下方的弧形 17-4 PH 不锈钢杠杆；当枪管与枪机共同短后坐至止点时，加速子下端撞击下机匣台阶并急剧后摆，将沉重枪管组件的后坐动量成倍杠杆传递给枪机框。',
  },
  {
    id: 'm82a1_bolt',
    bomCode: 'U-11',
    nameZh: '三突笋回转闭锁枪机头',
    calloutLabel: '三突笋回转闭锁枪机',
    nameEn: 'Three-Lug Rotating Locking Bolt Head',
    group: 'slide',
    material: 'stainless',
    assembledPos: [2.4, 1.25, 0],
    explodeSteps: [
      { range: [0.12, 0.25], offset: [-5.2, 3.2, 0] },
      { range: [0.52, 0.76], offset: [-0.6, 0.4, 1.8] },
      { range: [0.76, 0.98], offset: [-0.4, 0.2, 1.0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [1.0, 0.9, 0.4],
    labelAppearAt: 0.52,
    roleTag: '60° 回转三突笋 · 双抛壳挺',
    description:
      '直接闭锁 .50 BMG 弹底的三突笋重型回转枪机头：前端呈 120° 均布三枚宽厚扇形闭锁突笋，仅需回转 60° 即可与枪管延伸节刚性闭锁；机头端面内嵌重型宽爪拉壳钩与双弹簧柱塞强力抛壳挺。',
  },
  {
    id: 'm82a1_firing_pin',
    bomCode: 'U-12',
    nameZh: '重型阶梯击针与回位簧组件',
    calloutLabel: '重型阶梯击针/回位簧',
    nameEn: 'Stepped Firing Pin & Rebound Spring Assembly',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0.6, 1.25, 0],
    explodeSteps: [
      { range: [0.12, 0.25], offset: [-5.8, 3.2, 0] },
      { range: [0.55, 0.78], offset: [-8.6, 1.4, -1.6] },
      { range: [0.78, 0.98], offset: [-4.1, 0.6, -1.0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [-2.0, 0.5, 0],
    labelAppearAt: 0.56,
    roleTag: 'S7耐冲击击针 · 防惯性走火簧',
    description:
      '贯穿枪机框与三突笋枪机中心孔的全长阶梯轴式 S7 工具钢击针：前段套有防惯性走火回位螺旋簧，尾端圆盘法兰外露于枪机框后端承接下机匣线性击铁打击；不到位安全联锁确保枪机未完全闭锁时击针无法触及底火。',
  },

  // ==================== 2. SHEET-STEEL LOWER, BUFFER & BIPOD ('frame' · 4) ====================
  {
    id: 'm82a1_lower_receiver',
    bomCode: 'F-01',
    nameZh: '冲压钢下机匣与 Sorbothane 缓冲托垫',
    calloutLabel: '冲压钢下机匣与缓冲肩垫',
    nameEn: 'Sheet-Steel Lower Receiver & Sorbothane Buttpad',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.1, 0.25], offset: [0, -0.8, 0] },
      { range: [0.45, 0.75], offset: [0, -0.8, 0] },
      { range: [0.75, 0.98], offset: [0, -0.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [-13.5, -2.6, 0],
    labelAppearAt: 0.18,
    roleTag: '直列枪托下机匣 · 吸能橡胶垫',
    description:
      '兼作直列式枪托与火控机匣的锰磷化冲压钢板下机匣：左侧冲压 BARRETT FIREARMS MFG. INC. MODEL 82A1 .50 CAL 原厂铭文与红白 FIRE/SAFE 档位标记，前部一体焊接菱形加强筋弹匣井与两脚架驻笋座，尾部装有超厚 Sorbothane 黏弹吸能橡胶抵肩垫。',
  },
  {
    id: 'm82a1_recoil_spring',
    bomCode: 'F-02',
    nameZh: '尾托主复进簧与液压缓冲塞组件',
    calloutLabel: '尾托主复进缓冲簧',
    nameEn: 'Main Action Recoil Spring & Rear Buffer Plug',
    group: 'frame',
    material: 'spring_steel',
    assembledPos: [0, 1.25, 0],
    explodeSteps: [
      { range: [0.32, 0.62], offset: [-8.5, 0.5, 0] },
      { range: [0.68, 0.96], offset: [-5.7, 0.3, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [-13.5, 0.9, 0],
    labelAppearAt: 0.45,
    roleTag: '全长直列主复进簧与导杯',
    description:
      '纵贯下机匣尾托全长的大直径主复进螺旋弹簧与前钢导杯/后聚氨酯缓冲塞组件：与枪膛轴线完全重合以消除翻转力矩，吸收经加速子放大后的枪机框后坐剩余动能，并在后坐到底后平稳驱动枪机组件向前推弹闭锁。',
  },
  {
    id: 'm82a1_bipod',
    bomCode: 'F-03',
    nameZh: '前挂折叠高低可调驻锄两脚架',
    calloutLabel: '折叠高低可调驻锄两脚架',
    nameEn: 'Folding Height-Adjustable Spiked Steel Bipod',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [14.7, -0.85, 0],
    explodeSteps: [
      { range: [0.3, 0.6], offset: [4.2, -4.2, 0] },
      { range: [0.68, 0.96], offset: [3.0, -3.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [1.5, -5.2, 2.4],
    labelAppearAt: 0.35,
    roleTag: '独立耳轴隔离枪管谐振 · 破土驻锄',
    description:
      '铰接于下机匣最前端独立耳轴的重型全钢可折叠两脚架（完全不接触浮动短后坐重枪管以保证远射精度）：上腿冲有圆孔减重并配外置定位拉簧，下伸缩内腿设五档高度棘轮锁扣及宽大锯齿破土驻锄脚掌。',
  },
  {
    id: 'm82a1_pistol_grip',
    bomCode: 'F-04',
    nameZh: 'A2 防滑手枪握把与加大护弓',
    calloutLabel: 'A2后掠防滑握把/护弓',
    nameEn: 'Checkered A2 Pistol Grip & Winter Trigger Guard',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-2.4, -1.25, 0],
    explodeSteps: [
      { range: [0.34, 0.64], offset: [-1.8, -5.0, 0] },
      { range: [0.7, 0.96], offset: [-1.4, -3.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-1.3, -3.8, 0],
    labelAppearAt: 0.38,
    roleTag: '22° 后掠握持角 · 寒区手套护弓',
    description:
      '通用 M16A2 接口标准的玻纤增强聚合物后掠式手枪握把与下沉式钢制加大扳机护弓：握把向后倾斜约 22° 并模压指槽与菱形防滑颗粒区，加宽弧形护弓便于射手佩戴厚重战术手套扣动扳机。',
  },

  // ==================== 3. LINEAR STRIKER FIRE CONTROL GROUP ('fire_control' · 4) ====================
  {
    id: 'm82a1_striker',
    bomCode: 'FC-01',
    nameZh: '线性上伸击铁组件与双击发簧',
    calloutLabel: '线性上伸击铁与双主簧',
    nameEn: 'Upright Linear Striker Lever & Dual Mainsprings',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-2.35, -0.35, 0],
    explodeSteps: [
      { range: [0.46, 0.76], offset: [-4.4, -2.6, 2.2] },
      { range: [0.76, 0.98], offset: [-2.4, -1.6, 1.4] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [0, 1.2, 0.3],
    labelAppearAt: 0.56,
    roleTag: '上伸击铁头 · 双联击发螺旋簧',
    description:
      'M82A1 独特的直列上伸式击铁拨杆组件：因枪机框紧贴下机匣底面往复滑行无传统回转击锤空间，采用向上伸入枪机框底部让位槽的淬火钢击铁头，由后方双联高劲度击发主簧向前强力驱动高速敲击击针尾盘。',
  },
  {
    id: 'm82a1_sear',
    bomCode: 'FC-02',
    nameZh: '精密研磨阻铁、传递连杆与断连器',
    calloutLabel: '精密阻铁/连杆与断连器',
    nameEn: 'Precision Ground Sear, Transfer Bar & Disconnector',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-1.45, -0.55, 0],
    explodeSteps: [
      { range: [0.48, 0.76], offset: [-2.0, -3.0, -2.2] },
      { range: [0.76, 0.98], offset: [-1.4, -1.8, -1.4] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -0.6, -0.3],
    labelAppearAt: 0.58,
    roleTag: '双轨传递连杆 · 半自动断连',
    description:
      '控制线性击铁待击与释放的核心半自动阻铁、冲压双轨传递连杆（Transfer Bar）及单发断连组件：工作面经镜面研磨以在双联主簧高载荷下保持干脆利落的二道火释放感，并在枪机后坐复进期间自动断连实现半自动单发循环。',
  },
  {
    id: 'm82a1_trigger',
    bomCode: 'FC-03',
    nameZh: '防滑纵槽弧形扳机与推杆',
    calloutLabel: '纵槽弧形扳机与推杆',
    nameEn: 'Grooved Curved Trigger & Transfer Bow',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-0.45, -1.05, 0],
    explodeSteps: [
      { range: [0.48, 0.76], offset: [0.4, -3.6, 2.0] },
      { range: [0.76, 0.98], offset: [0.2, -2.2, 1.2] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [0.1, -1.1, 0.2],
    labelAppearAt: 0.58,
    roleTag: '纵向防滑指垫 · 顶推阻铁脱钩',
    description:
      '位于加大护弓内的机加工合金钢弧形扳机与后伸传递推杆：指垫正面铣有纵向防滑细沟槽提升射击触感反馈，向后扣动时绕扳机横销顺畅摆动并顶推阻铁下臂释放线性击铁。',
  },
  {
    id: 'm82a1_selector',
    bomCode: 'FC-04',
    nameZh: '左侧拇指 SAFE / FIRE 旋转保险杆',
    calloutLabel: 'SAFE/FIRE 拇指快慢机',
    nameEn: 'Left-Side Thumb Rotary Safety Selector',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-2.95, -0.48, 0],
    explodeSteps: [
      { range: [0.48, 0.76], offset: [-4.8, -3.8, -2.0] },
      { range: [0.76, 0.98], offset: [-2.8, -2.4, -1.4] },
    ],
    calloutDir: 'down',
    calloutStem: 50,
    calloutAnchor: [-0.5, 0, -0.7],
    labelAppearAt: 0.58,
    roleTag: '90° 旋转两档凸轮物理锁死扳机',
    description:
      '与美军 M16 操作习惯一致的 90° 拇指旋转快慢机保险轴：横穿下机匣火控室，中部半月形凸轮在水平 SAFE 档物理阻挡扳机上抬，向下拨转 90° 对准红色 FIRE 刻字即解除保险。',
  },

  // ==================== 4. 10-RD .50 BMG RIBBED BOX MAGAZINE ('magazine' · 4) ====================
  {
    id: 'm82a1_mag_body',
    bomCode: 'M-01',
    nameZh: '10 发 .50 BMG 四筋冲压钢弹匣体',
    calloutLabel: '10发 .50 BMG 四筋钢弹匣',
    nameEn: '10-Round .50 BMG Ribbed Stamped Steel Magazine Body',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [5.3, -2.15, 0],
    explodeSteps: [
      { range: [0.02, 0.22], offset: [0.8, -4.8, 0] },
      { range: [0.48, 0.78], offset: [1.2, -0.5, 2.2] },
      { range: [0.78, 0.98], offset: [0.8, -0.3, 1.4] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [1.6, -2.8, 0.8],
    labelAppearAt: 0.14,
    roleTag: '前挂后卡摇入式 · 四道纵向压筋',
    description:
      '专为全长 138mm 的 12.7×99mm (.50 BMG) 巨型步枪弹设计的双排双进重型冲压钢弹匣壳体：两侧各冲压四道深纵向抗变形加强筋与余弹检视孔，采用前挂钩 + 后卡台摇入式（Rock-and-Lock）全钢锁止接口，底部呈 13.8° 前高后低战术斜切轮廓。',
  },
  {
    id: 'm82a1_mag_follower',
    bomCode: 'M-02',
    nameZh: '双排防倾覆导轨托弹板',
    calloutLabel: '双排防倾覆托弹板',
    nameEn: 'Anti-Tilt Staggered Steel Magazine Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [5.3, -3.7, 0],
    explodeSteps: [
      { range: [0.02, 0.22], offset: [0.8, -4.8, 0] },
      { range: [0.5, 0.8], offset: [0.4, 2.2, -2.0] },
      { range: [0.8, 0.98], offset: [0.2, 0.5, -1.2] },
    ],
    calloutDir: 'down',
    calloutStem: 34,
    calloutAnchor: [0, 0.3, -0.5],
    labelAppearAt: 0.56,
    roleTag: '双排交错导弹棱 · 防俯冲裙边',
    description:
      '沿弹匣内壁四道加强筋导槽平稳升降的防倾覆双排交错台阶托弹板：顶部半圆柱导弹棱确保最末一发沉重的 .50 BMG 弹药仍以恒定仰角对准枪管延伸节进弹坡，杜绝供弹俯冲卡滞。',
  },
  {
    id: 'm82a1_mag_spring',
    bomCode: 'M-03',
    nameZh: '重型矩形多折托弹簧',
    calloutLabel: '重型矩形多折托弹簧',
    nameEn: 'Heavy-Duty Rectangular Zig-Zag Magazine Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [5.3, -5.65, 0],
    explodeSteps: [
      { range: [0.02, 0.22], offset: [0.8, -4.8, 0] },
      { range: [0.5, 0.8], offset: [0.6, -1.6, -1.0] },
      { range: [0.8, 0.98], offset: [0.4, -1.2, -0.8] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [-1.0, -0.8, -0.4],
    labelAppearAt: 0.56,
    roleTag: '克服 1.15kg 实弹重力的六折宽簧',
    description:
      '必须克服 10 发总重超过 1.15 公斤的 .50 BMG 实弹重力以及枪身剧烈后坐惯性的超重型宽幅六折铬钒弹簧钢托弹簧，确保高速半自动连射节奏下供弹毫无迟滞。',
  },
  {
    id: 'm82a1_mag_floorplate',
    bomCode: 'M-04',
    nameZh: '斜切驻锄加强弹匣底盖',
    calloutLabel: '13.8° 斜切驻锄弹匣底盖',
    nameEn: 'Angled Monopod-Lip Stamped Steel Floorplate',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [5.3, -7.8, 0],
    assembledRot: [0, 0, 0.24112],
    explodeSteps: [
      { range: [0.02, 0.22], offset: [0.8, -4.8, 0] },
      { range: [0.5, 0.8], offset: [1.4, -3.2, 0.8] },
      { range: [0.8, 0.98], offset: [1.0, -1.6, 0.4] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [1.2, -0.4, 0.4],
    labelAppearAt: 0.56,
    roleTag: '严丝合缝贴合斜底 · 辅助卧射支点',
    description:
      '沿弹匣底部 13.8° (0.241 rad) 斜切底边滑入锁定的冲压加厚钢制底盖：前端设有防滑辅助驻锄折边，使射手在卧姿射击时可直接将弹匣底盖抵靠掩体充当单脚架支点而不会变形脱底。',
  },
];

// ============================================================================
// 7-Stage Firing Cycle Specification (Short-Recoil + Accelerator + 3-Lug Bolt)
// ============================================================================

export const M82A1_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'm82_battery_ready',
    stepNum: '01',
    shortLabel: '闭锁待击',
    title: '阶段 1 · 三突笋枪机刚性闭锁与双枪管拉簧预紧待击',
    range: [0, 0.08],
    description:
      '29 英寸纵向开槽重枪管在双联复进拉簧牵引下处于最前位，三突笋枪机头回转 60° 刚性闭锁于枪管延伸节内，12.7×99mm (.50 BMG) 实弹在膛，线性上伸击铁被阻铁扣持待发。',
  },
  {
    id: 'm82_striker_ignition',
    stepNum: '02',
    shortLabel: '击铁前摆击发',
    title: '阶段 2 · 扣扳机顶开阻铁与线性击铁高速撞击重型击针',
    range: [0.08, 0.16],
    description:
      '手指扣动弧形扳机向后摆动顶推阻铁下臂脱钩，线性上伸击铁在双联击发主簧驱动下绕下枢轴高速向前摆击枪机框尾端的阶梯击针，刺破 .50 BMG 军规底火引燃发射药。',
  },
  {
    id: 'm82_short_recoil_locked',
    stepNum: '03',
    shortLabel: '枪管闭锁短后坐',
    title: '阶段 3 · 箭头制退器 65% 侧喷泄压与整根重枪管闭锁短后坐',
    range: [0.16, 0.3],
    description:
      '660 格令弹头冲出双室箭头制退器（向左右后方 60° 剧烈喷射火药燃气削减约 65% 后坐冲量），同时整根 29 英寸重枪管、制退器、延伸节与闭锁枪机共同向后短后坐约 2.4 单位并大幅拉伸双联枪管复进簧！',
  },
  {
    id: 'm82_accelerator_unlock',
    stepNum: '04',
    shortLabel: '加速子撬框解锁',
    title: '阶段 4 · 加速子撞击下机匣放大动量与三突笋 60° 回转开锁',
    range: [0.3, 0.39],
    description:
      '短后坐抵达约 25mm 止点瞬间，加速子杠杆下端撞击下机匣止动肩向后猛摆，将沉重枪管的后坐动量成倍撬推传递给枪机框；螺旋凸轮槽迫使三突笋枪机回转 60° 解锁，双拉簧随即牵引重枪管开始向前复进！',
  },
  {
    id: 'm82_extract_eject',
    stepNum: '05',
    shortLabel: '枪管归位与抛壳',
    title: '阶段 5 · 重枪管先行复位与枪机框单独长后坐抽抛巨型铜壳',
    range: [0.39, 0.54],
    description:
      '当重枪管在双拉簧牵引下平稳回到前止点时，枪机框携枪机继续单独向后长行程滑行压缩尾托主复进缓冲簧，拉壳钩抽出 99mm 黄铜空弹壳并由双柱塞抛壳挺从右侧抛壳窗翻滚抛出，同时压倒线性击铁重新挂入待击位。',
  },
  {
    id: 'm82_counter_recoil_feed',
    stepNum: '06',
    shortLabel: '主簧推弹上膛',
    title: '阶段 6 · 尾托主缓冲簧释放势能与剥离次发 .50 BMG 推入弹膛',
    range: [0.54, 0.84],
    description:
      '下机匣尾托内的主复进缓冲簧释放势能推动枪机框高速前冲；三突笋枪机下缘从 10 发四筋钢弹匣双排口推出次发 .50 BMG 实弹，沿枪管延伸节进弹坡顺畅导入弹膛。',
  },
  {
    id: 'm82_cam_lock_reset',
    stepNum: '07',
    shortLabel: '回转闭锁复位',
    title: '阶段 7 · 螺旋凸轮强制三突笋闭锁到位与半自动断连复位',
    range: [0.84, 1.0],
    description:
      '枪机头抵靠枪管延伸节底面，枪机框最后一段前冲行程通过螺旋凸轮槽强制枪机反向回转 60° 锁死三枚闭锁突笋，加速子归位，松开扳机后单发断连器复位，完成半自动远射循环。',
  },
];

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / Math.max(1e-6, b - a));
  return t * t * (3 - 2 * t);
}

const ZERO_DELTA: PartKinematicDelta = {
  pos: [0, 0, 0],
  rot: [0, 0, 0],
  scaleX: 1,
};

/**
 * Shared short-recoil barrel displacement curve (`barrelDx` in `[-2.40, 0]`):
 * - `[0, 0.16)`: `0` (locked in battery under twin barrel return spring preload)
 * - `[0.16, 0.30)`: 29" fluted barrel + arrowhead brake + barrel extension recoil
 *   rearward together (`0 -> -2.40`) locked to the 3-lug bolt head
 * - `[0.30, 0.35)`: brief rear stop & cam-unlock dwell (`-2.40 -> -2.30`) while
 *   accelerator arm trips against the lower receiver stop block
 * - `[0.35, 0.57)`: twin parallel barrel return springs pull barrel smoothly back
 *   to battery (`-2.30 -> 0`) while bolt carrier continues full stroke rearward
 */
function computeBarrelShortRecoilDx(f: number): number {
  if (f < 0.16 || f >= 0.57) return 0;
  if (f < 0.3) {
    const u = clamp01((f - 0.16) / 0.14);
    return -2.4 * Math.sin(u * (Math.PI * 0.5));
  }
  if (f < 0.35) {
    const u = smoothstep(0.3, 0.35, f);
    return -2.4 + 0.1 * u;
  }
  const u = smoothstep(0.35, 0.57, f);
  return -2.3 * (1 - u);
}

/**
 * Bolt carrier stroke (`carrierDx` in `[-7.60, 0]`):
 * - `[0.16, 0.30)`: recoils locked with barrel (`0 -> -2.40`)
 * - `[0.30, 0.50)`: accelerator arm trips against lower receiver stop block,
 *   catapulting carrier rearward (`-2.40 -> -7.60`) into buttstock buffer
 * - `[0.50, 0.54)`: rear Sorbothane buffer dwell at `-7.60`
 * - `[0.54, 0.89)`: main recoil spring drives carrier forward (`-7.60 -> 0`),
 *   stripping next `.50 BMG` cartridge and cam-locking 3-lug bolt over final `0.55u`
 */
function computeCarrierStrokeDx(f: number): number {
  if (f < 0.16 || f >= 0.89) return 0;
  if (f < 0.3) {
    return computeBarrelShortRecoilDx(f);
  }
  if (f < 0.5) {
    const u = clamp01((f - 0.3) / 0.2);
    const kick =
      0.34 * Math.sin(u * (Math.PI * 0.5)) + 0.66 * (u * u * (3 - 2 * u));
    return -2.4 - 5.2 * kick;
  }
  if (f < 0.54) {
    return -7.6;
  }
  const u = smoothstep(0.54, 0.89, f);
  return -7.6 * (1 - u);
}

/**
 * Exact helical cam-track coupling between bolt carrier (`carrierDx`), barrel
 * extension (`barrelDx`), and 3-lug rotating `.50 BMG` bolt (`0.55u` cam slot,
 * `60° = Math.PI / 3` lockup rotation):
 * - While `carrierDx >= barrelDx - 0.55`, bolt lugs remain engaged in the barrel
 *   extension (`boltDx = barrelDx`) and helical cam track rotates `0 <-> 60°`.
 * - Once `carrierDx < barrelDx - 0.55`, bolt is fully unlocked (`60°`) and travels
 *   with the bolt carrier (`boltDx = carrierDx + 0.55`).
 */
function computeBoltCamKinematics(
  barrelDx: number,
  carrierDx: number
): { boltDx: number; boltRx: number } {
  const camSlotStroke = 0.55;
  const fullUnlockRad = Math.PI / 3;
  const relOvertravel = barrelDx - carrierDx;
  if (relOvertravel <= 1e-5) {
    return { boltDx: barrelDx, boltRx: 0 };
  }
  if (relOvertravel < camSlotStroke) {
    const u = clamp01(relOvertravel / camSlotStroke);
    const camBlend = u * u * (3 - 2 * u);
    return {
      boltDx: barrelDx,
      boltRx: fullUnlockRad * camBlend,
    };
  }
  return {
    boltDx: Math.min(0, carrierDx + camSlotStroke),
    boltRx: fullUnlockRad,
  };
}

export function computeM82a1FiringKinematics(
  partId: string,
  firePhase: number
): PartKinematicDelta {
  const f = clamp01(firePhase);
  const barrelDx = computeBarrelShortRecoilDx(f);
  const carrierDx = computeCarrierStrokeDx(f);

  switch (partId) {
    // 1. Entire Short-Recoiling 29" Barrel + Arrowhead Brake + Extension (-2.4u stroke!)
    case 'm82a1_barrel':
    case 'm82a1_muzzle_brake':
    case 'm82a1_barrel_extension': {
      return {
        pos: [barrelDx, 0, 0],
        rot: [0, 0, 0],
        scaleX: 1,
      };
    }

    // 2. Twin Parallel Barrel Return Tension Springs (front pinned at X=15.6, rear tracks 7.4 + barrelDx)
    case 'm82a1_barrel_springs': {
      const sx = (8.2 - barrelDx) / 8.2;
      const dx = barrelDx * 0.5;
      return {
        pos: [dx, 0, 0],
        rot: [0, 0, 0],
        scaleX: sx,
      };
    }

    // 3. Bolt Carrier & Integral Charging Handle
    case 'm82a1_bolt_carrier': {
      return {
        pos: [carrierDx, 0, 0],
        rot: [0, 0, 0],
        scaleX: 1,
      };
    }

    // 4. Accelerator Arm Linkage (trips against lower stop block at f=0.29..0.36, resets on lockup)
    case 'm82a1_accelerator': {
      let rz = 0;
      if (f >= 0.285 && f < 0.36) {
        rz = 0.58 * smoothstep(0.285, 0.35, f);
      } else if (f >= 0.36 && f < 0.81) {
        rz = 0.58;
      } else if (f >= 0.81 && f < 0.89) {
        rz = 0.58 * (1 - smoothstep(0.81, 0.89, f));
      }
      return {
        pos: [carrierDx, 0, 0],
        rot: [0, 0, rz],
        scaleX: 1,
      };
    }

    // 5. Triangular Three-Lug Rotating .50 BMG Bolt Head (full 60° cam-unlock & battery lockup)
    case 'm82a1_bolt': {
      const { boltDx, boltRx } = computeBoltCamKinematics(barrelDx, carrierDx);
      return {
        pos: [boltDx, 0, 0],
        rot: [boltRx, 0, 0],
        scaleX: 1,
      };
    }

    // 6. Two-Piece Stepped S7 Firing Pin (driven forward +0.28 at ignition, then rides carrier)
    case 'm82a1_firing_pin': {
      let strikeBoost = 0;
      if (f >= 0.12 && f < 0.18) {
        const u = (f - 0.12) / 0.06;
        strikeBoost = 0.28 * Math.sin(u * Math.PI);
      }
      return {
        pos: [carrierDx + strikeBoost, 0, 0],
        rot: [0, 0, 0],
        scaleX: 1,
      };
    }

    // 7. Cylindrical Bolt Buffer & Main Recoil Spring (X in [-20.48, -6.60], L0 = 13.88)
    case 'm82a1_recoil_spring': {
      const sx = Math.max(0.35, (13.88 + carrierDx) / 13.88);
      const dx = -20.48 * (1 - sx);
      return {
        pos: [dx, 0, 0],
        rot: [0, 0, 0],
        scaleX: sx,
      };
    }

    // 8. Upright Linear Striker (swings forward +X at [0.10, 0.145], held cammed back rz=+0.26 across [0.32, 0.78] clearing unlocked 60° bolt!)
    case 'm82a1_striker': {
      let rz = 0;
      if (f >= 0.1 && f < 0.145) {
        rz = -0.36 * smoothstep(0.1, 0.145, f);
      } else if (f >= 0.145 && f < 0.23) {
        rz = -0.36 * (1 - 0.3 * smoothstep(0.16, 0.23, f));
      } else if (f >= 0.23 && f < 0.32) {
        const u = smoothstep(0.23, 0.32, f);
        rz = -0.252 * (1 - u) + 0.26 * u;
      } else if (f >= 0.32 && f < 0.78) {
        rz = 0.26;
      } else if (f >= 0.78 && f < 0.92) {
        rz = 0.26 * (1 - smoothstep(0.78, 0.92, f));
      }
      return {
        pos: [0, 0, 0],
        rot: [0, 0, rz],
        scaleX: 1,
      };
    }

    // 9. Primary Sear, Transfer Bar Yoke & Semi-Auto Disconnector
    case 'm82a1_sear': {
      let dx = 0;
      let rz = 0;
      if (f >= 0.04 && f < 0.13) {
        dx = -0.14 * smoothstep(0.04, 0.13, f);
      } else if (f >= 0.13 && f < 0.86) {
        dx = -0.14;
      } else if (f >= 0.86 && f < 0.96) {
        dx = -0.14 * (1 - smoothstep(0.86, 0.96, f));
      }
      if (f >= 0.08 && f < 0.16) {
        rz = -0.18 * Math.sin(((f - 0.08) / 0.08) * Math.PI);
      } else if (f >= 0.36 && f < 0.48) {
        rz = -0.12 * Math.sin(((f - 0.36) / 0.12) * Math.PI);
      }
      return {
        pos: [dx, 0, 0],
        rot: [0, 0, rz],
        scaleX: 1,
      };
    }

    // 10. Curved Trigger Shoe (hanging y < 0: rz < 0 pulls shoe rearward -X!)
    case 'm82a1_trigger': {
      let rz = 0;
      if (f >= 0.04 && f < 0.13) {
        rz = -0.26 * smoothstep(0.04, 0.13, f);
      } else if (f >= 0.13 && f < 0.86) {
        rz = -0.26;
      } else if (f >= 0.86 && f < 0.96) {
        rz = -0.26 * (1 - smoothstep(0.86, 0.96, f));
      }
      return {
        pos: [0, 0, 0],
        rot: [0, 0, rz],
        scaleX: 1,
      };
    }

    // 11. Magazine Follower Smooth Feed Pulse (returns cleanly to 0 before f=1.0, staying <= -2.455 below reserveRound!)
    case 'm82a1_mag_follower': {
      const pulse = smoothstep(0.46, 0.62, f) - smoothstep(0.68, 0.84, f);
      const lift = 0.46 * pulse;
      return {
        pos: [0, lift, 0],
        rot: [0, 0, 0],
        scaleX: 1,
      };
    }

    default:
      return ZERO_DELTA;
  }
}

// ============================================================================
// .50 BMG Ballistics, Arrowhead Brake Side-Blast, Case Extraction & Feeding
// ============================================================================

export function computeM82a1BallisticsState(
  firePhase: number
): ExtendedBallisticsState {
  const f = clamp01(firePhase);
  const barrelDx = computeBarrelShortRecoilDx(f);
  const carrierDx = computeCarrierStrokeDx(f);
  const { boltDx } = computeBoltCamKinematics(barrelDx, carrierDx);

  // 1. Chambered / Extracted / Ejected .50 BMG Brass Case
  // With roundScale = 0.68 and case local X in [-2.25, +2.25] (±1.53u world),
  // X = 5.70 seats the rim at X = 4.17 flush inside the 3-lug recessed bolt face (X = 4.16)
  // and clears the right ejection port X in [2.15, 7.85] during extraction & ejection!
  let spentCaseVisible = true;
  let spentCasePos: [number, number, number] = [5.7, 1.25, 0];
  let spentCaseRot: [number, number, number] = [0, 0, 0];
  let spentCaseOpacity = 1;

  if (f < 0.16) {
    spentCasePos = [5.7, 1.25, 0];
  } else if (f < 0.325) {
    // Recoils rearward locked inside chamber with barrel & 3-lug bolt
    spentCasePos = [5.7 + boltDx, 1.25, 0];
  } else if (f < 0.39) {
    // Extracted out of barrel extension into center of ejection port [2.15, 7.85]
    const u = smoothstep(0.325, 0.39, f);
    const startX =
      5.7 +
      computeBoltCamKinematics(
        computeBarrelShortRecoilDx(0.325),
        computeCarrierStrokeDx(0.325)
      ).boltDx;
    spentCasePos = [startX + (3.85 - startX) * u, 1.25 + 0.08 * u, 0.56 * u];
    spentCaseRot = [0.12 * u, -0.46 * u, 0.1 * u];
  } else if (f < 0.75) {
    // Dual plunger ejectors fling spent .50 BMG brass cleanly out +Z port
    const u = (f - 0.39) / 0.36;
    spentCasePos = [
      3.85 - 3.6 * u,
      1.33 + 4.7 * u - 9.3 * u * u,
      0.56 + 12.2 * u,
    ];
    spentCaseRot = [0.12 + u * 7.4, -0.46 - u * 6.6, 0.1 + u * 9.0];
    spentCaseOpacity = u > 0.72 ? clamp01(1 - (u - 0.72) / 0.28) : 1;
  } else {
    spentCaseVisible = false;
    spentCaseOpacity = 0;
  }

  // 2. 660-grain M33 .50 BMG Boat-Tail Projectile
  // Starts at X = 5.70 + 3.45 * 0.68 = 8.046 in chamber, exits recoiling brake (~33.2) at f = 0.215
  let bulletVisible = false;
  let bulletPos: [number, number, number] = [8.05, 1.25, 0];
  let streakLength = 0;

  if (f < 0.142) {
    bulletVisible = true;
    bulletPos = [8.05, 1.25, 0];
    streakLength = 0;
  } else if (f < 0.215) {
    bulletVisible = true;
    const u = Math.pow((f - 0.142) / 0.073, 1.6);
    bulletPos = [8.05 + 25.95 * u, 1.25, 0];
    streakLength = 3.0 * u;
  } else if (f < 0.38) {
    bulletVisible = true;
    const u = (f - 0.215) / 0.165;
    bulletPos = [34.0 + 82.0 * u, 1.25, 0];
    streakLength =
      4.8 + 11.8 * Math.sin(Math.min(1, u * 1.4) * (Math.PI * 0.5));
  }

  // 3. Chamber Ignition Glow & Colossal Arrowhead Muzzle Brake Twin-Baffle Blast
  let chamberFlashIntensity = 0;
  if (f >= 0.138 && f < 0.24) {
    const u = (f - 0.138) / 0.102;
    chamberFlashIntensity = Math.sin(u * Math.PI) * (1 - 0.35 * u);
  }

  let muzzlePlumeScale = 0;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.195 && f < 0.345) {
    const u = (f - 0.195) / 0.15;
    muzzlePlumeScale = 0.58 + 1.58 * Math.pow(u, 0.5);
    muzzlePlumeOpacity =
      u < 0.22 ? u / 0.22 : Math.pow(1 - (u - 0.22) / 0.78, 1.48);
  }

  // 4. Next .50 BMG Complete Round Stripped from 10-Rd Ribbed Box Magazine into Chamber
  // At X = 5.30 with magLocalShiftX = -1.52 & roundScale = 0.68, spans [2.74, 7.87] inside [2.46, 8.14]
  let nextRoundPos: [number, number, number];
  let nextRoundRotZ: number;
  if (f < 0.52) {
    const lift = f >= 0.45 ? 0.26 * smoothstep(0.45, 0.52, f) : 0;
    nextRoundPos = [5.3, -1.36 + lift, 0];
    nextRoundRotZ = 0.05;
  } else if (f < 0.64) {
    const u = smoothstep(0.52, 0.64, f);
    nextRoundPos = [5.3 + 0.12 * u, -1.1 + 1.05 * u, 0];
    nextRoundRotZ = 0.05 + 0.09 * u;
  } else if (f < 0.77) {
    const u = smoothstep(0.64, 0.77, f);
    nextRoundPos = [5.42 + 0.18 * u, -0.05 + 1.3 * u, 0];
    nextRoundRotZ = 0.14 * (1 - u);
  } else {
    const u = smoothstep(0.77, 0.86, f);
    nextRoundPos = [5.6 + 0.1 * u, 1.25, 0];
    nextRoundRotZ = 0;
  }

  // 5. Reserve .50 BMG Cartridge Inside 10-Rd Magazine Stack (rises smoothly to nextRoundPos(0) = [5.3, -1.36, 0]!)
  const reserveLift = f >= 0.46 ? 1.18 * smoothstep(0.46, 0.72, f) : 0;
  const reserveRoundPos: [number, number, number] = [
    5.3,
    -2.54 + reserveLift,
    0,
  ];

  return {
    spentCaseVisible,
    spentCasePos,
    spentCaseRot,
    spentCaseOpacity,
    bulletVisible,
    bulletPos,
    streakLength,
    chamberFlashIntensity,
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos,
    nextRoundRotZ,
    reserveRoundPos,
    gasPortFlashIntensity: 0,
    gasPortPos: [16.5, 1.25, 0],
  };
}

// ============================================================================
// Camera Presets & Heavy-Sniper Workbench Metadata
// ============================================================================

// ============================================================================
// 2K PBR Texture Bindings & Texture Atlas Inspector Suite
// ============================================================================

const M82A1_BODY_BUNDLE: PbrBindingSpec = {
  albedoFile: 'm82a1_body_albedo.webp',
  normalFile: 'm82a1_body_normal.webp',
  roughnessFile: 'm82a1_body_roughness.webp',
  normalScale: 0.42,
};

export const M82A1_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  m82a1_upper_receiver: { ...M82A1_BODY_BUNDLE, normalScale: 0.38 },
  m82a1_lower_receiver: { ...M82A1_BODY_BUNDLE, normalScale: 0.45 },
  m82a1_scope: { ...M82A1_BODY_BUNDLE, normalScale: 0.36 },
  m82a1_mag_body: { ...M82A1_BODY_BUNDLE, normalScale: 0.46 },
};

export const M82A1_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'm82a1_body',
    weapon: 'm82a1' as const,
    titleCn: '巴雷特锰系磷化冲压钢与 Leupold 密位光学贴图组',
    partTag: 'U-05 / F-01 / U-07 / M-01 PBR',
    resolution: '2048 × 1024 px',
    summary:
      '专为巴雷特 M82A1 反器材步枪烘焙的 2K 物理材质图集：精准还原田纳西州原厂深炭灰锰系磷化（Manganese-Phosphate Parkerized）冲压钢板细晶消光质感、左侧机匣压印铭文与红白 FIRE/SAFE 档位标记、四筋 .50 BMG 钢弹匣，以及 Leupold Mark 4 瞄准镜白色 0–15 MIL 高低密位刻线与蓝绿翡翠多层增透镀膜物镜。',
    highlights: [
      'BARRETT FIREARMS MFG. INC. MURFREESBORO, TN MODEL 82A1 .50 CAL 机匣深冲铭文',
      'Leupold Mark 4 金环徽标、白色 0–15 MIL 密位分划手轮与径向蓝绿增透膜物镜 (Roughness 0.05)',
      '全平面光学平整冲压钢板切线法线 (无波纹噪声) + 磷化钢 (0.55) 与 Sorbothane 橡胶肩垫 (0.86) 粗糙度分层',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm82a1_body_albedo.webp',
        note: 'sRGB · 锰系磷化钢机匣铭文 / 红白快慢机 / 0-15 MIL 手轮 / 蓝绿镀膜镜片',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'm82a1_body_normal.webp',
        note: 'Linear · 光学平整钢板基底 [128,128,255] + 凹刻铭文/密位刻度/手轮滚花微浮雕',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'm82a1_body_roughness.webp',
        note: 'Linear · 镜面镀膜透镜 (0.05) / 阳极氧化镜筒 (0.34) / 锰磷化钢 (0.55) / 吸能橡胶 (0.86)',
      },
    ],
  },
  {
    id: 'm82a1_seamless_detail',
    weapon: 'm82a1',
    titleCn: '双室箭头制退器、29吋开槽重枪管与短后坐内件无缝细节贴图',
    partTag: '20 HEAVY BARREL & BOLT PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为标志性双室箭头形坦克制退器、29 英寸纵向开槽浮动重枪管、三突笋回转枪机、加速子杠杆、双联复进拉簧与折叠驻锄两脚架提供重机加工金属拉丝细节。',
    highlights: [
      '双室箭头坦克制退器与纵向开槽重枪管铣削刀纹法线',
      '三突笋回转枪机、枪管延伸节与加速子磷化油膜粗糙度',
      '覆盖其余全部 20 个短后坐自动机与驻锄两脚架节点',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于箭头制退器/29"开槽枪管/三突笋枪机/加速子/两脚架等',
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
        note: 'Linear · 用于A2纹路握把/提把包胶护套/后坐缓冲吸能垫等',
      },
    ],
  },
];

// ============================================================================
// Unified Self-Contained Weapon Module Export (`M82A1_MODULE`)
// ============================================================================

export const M82A1_PLUGIN: WeaponRuntimePlugin = {
  id: 'm82a1',
  partGroups: M82A1_PART_GROUPS,
  timelinePresets: M82A1_TIMELINE_PRESETS,
  parts: M82A1_PARTS,
  firingPhases: M82A1_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(M82A1_FIRING_PHASES, f),
  computeFiringKinematics: computeM82a1FiringKinematics,
  computeBallisticsState: computeM82a1BallisticsState,
  pbrBindings: M82A1_PBR_BINDINGS,
  pbrSuites: M82A1_PBR_SUITES,
};
