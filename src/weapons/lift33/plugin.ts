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
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';
import {
  LIFT33_NOCK_DRAW_DX,
  LIFT33_TIP_FLEX_DX,
  LIFT33_TIP_FLEX_DY,
} from './meshes/lift33Geometries';

const DEG = Math.PI / 180;
const CAM_MAX_ROT_RAD = 95 * DEG;

export const LIFT33_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'frame',
    nameZh: 'Bridge-Lock 桁架弓把与减震稳定总成',
    nameEn: 'Bridge-Lock Truss Riser, Pockets & Stabilizer',
    badgeColor: '#94a3b8',
  },
  {
    key: 'slide',
    nameZh: '四分弓片、SwitchWeight-X 双偏心轮与弦索系',
    nameEn: 'Split Quad Limbs, SwitchWeight-X Binary Cams & Cables',
    badgeColor: '#38bdf8',
  },
  {
    key: 'fire_control',
    nameZh: '联动落箭台、五针微调瞄与 D 环窥孔总成',
    nameEn: 'Integrate Drop-Away Rest, 5-Pin Sight & D-Loop',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: 'LowPro 五箭快拆箭壶与三刃猎箭总成',
    nameEn: 'LowPro 5-Arrow Quiver & Match Broadhead Arrow',
    badgeColor: '#fb923c',
  },
];

export const LIFT33_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '满弦待发合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: 'Mathews LIFT 33 复合弓标准 6.5 英寸弓档（16.5 cm）合拢待击态：33 英寸轴距双 SwitchWeight-X 偏心轮与四分碳玻复合弓片保持预紧平衡，400 格令碳素猎箭已搭扣于 Dyneema D 环与 QAD 落箭台之上。',
  },
  {
    id: 'field_strip',
    label: '一级附件快拆态',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '沿 Bridge-Lock 内嵌燕尾槽与 Integrate 导轨快速拆离 LowPro 五箭壶、10 英寸碳纤维前减震杆、五针光纤瞄具、分弦杆滚轮、Engage 握把及三刃机械猎箭。',
  },
  {
    id: 'sub_assembly',
    label: '二级轮轴与弓片解体',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '卸除四分碳玻抛物线弓片、上下弓片袋与拉重调节螺栓，分离钛合金轮轴、ABEC-7 轴承与 SwitchWeight-X 85% 减力模块，全面揭示双偏心轮同步卷绕几何。',
  },
  {
    id: 'full_exploded',
    label: '全零件军械爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 24 个精密节点空间展开：从 7075-T6 CNC 镂空桁架弓把、分叉副弦、QAD 落箭台 V 型叉到三刃机械箭头与 0.019 吋光纤瞄针，毫厘毕现现代二进制滑轮复合弓工程极限。',
  },
];

export const LIFT33_PARTS: WeaponPartSpec[] = [
  // ==================== 1. RISER, GRIP, POCKETS, CABLE GUARD & STABILIZER ('frame' · 6 parts) ====================
  {
    id: 'lift33_riser',
    bomCode: 'R-01',
    nameZh: 'CNC 7075-T6 桥接桁架弓把',
    calloutLabel: '7075-T6 桁架弓把',
    nameEn: 'CNC 7075-T6 Bridged Truss Riser',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [1.5, 22.0, 0],
    labelAppearAt: 0.04,
    roleTag: '核心承力结构 · Bridge-Lock 内嵌槽与 Centergy 低重心窗',
    description:
      '整块航空级 7075-T6 铝合金经五轴 CNC 精铣而成的双桥接桁架弓把：上下双平行抗扭桁架与多级三角形减重镂空窗大幅削减自重至 1.93 kg；内置贯通式 Bridge-Lock 瞄具/稳定杆燕尾槽与 Integrate 落箭台锁轨，右侧非对称开阔射箭窗确保三刃箭头零干涉通过。',
  },
  {
    id: 'lift33_grip',
    bomCode: 'R-02',
    nameZh: 'Engage 人机工程包胶握把',
    calloutLabel: 'Engage 包胶握把',
    nameEn: 'Engage Ergonomic Overmolded Grip',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-0.25, -3.5, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [-5.5, -1.2, 0] },
      { range: [0.6, 0.95], offset: [-2.5, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.12,
    roleTag: '低扭矩推弓基准 · 虎口贴合包胶',
    description:
      '包覆于 Centergy 窄颈弓把芯上的 Mathews Engage 复合材质握把：狭窄的腕部接触脊线将射手手掌推力精准汇聚于弓把重心垂线，消除满弓撒放瞬间左右偏扭矩。',
  },
  {
    id: 'lift33_upper_pocket',
    bomCode: 'R-03',
    nameZh: 'CNC 枢转上弓片袋与拉重螺栓',
    calloutLabel: '上弓片袋与螺栓',
    nameEn: 'CNC Pivoting Upper Limb Pocket & Weight Bolt',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-1.4, 32.4, 0],
    explodeSteps: [
      { range: [0.14, 0.42], offset: [-2.8, 4.2, 0] },
      { range: [0.65, 1.0], offset: [-1.8, 2.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.24,
    roleTag: '刚性铰接上弓片 · 6角钛合金调磅主螺栓',
    description:
      'CNC 精密加工双槽分叉上弓片袋，以零间隙公差包夹左右四分碳玻弓片根部；顶部高强六角调磅螺栓支持微调弓片预弯角与峰值拉力。',
  },
  {
    id: 'lift33_lower_pocket',
    bomCode: 'R-04',
    nameZh: 'CNC 枢转下弓片袋与拉重螺栓',
    calloutLabel: '下弓片袋与螺栓',
    nameEn: 'CNC Pivoting Lower Limb Pocket & Weight Bolt',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-1.4, -32.4, 0],
    explodeSteps: [
      { range: [0.14, 0.42], offset: [-2.8, -4.2, 0] },
      { range: [0.65, 1.0], offset: [-1.8, -2.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.24,
    roleTag: '对称铰接下弓片 · 上下同步调磅基准',
    description:
      '与上弓片袋呈镜像匹配的锻铣铝合金下弓片袋，配合底部六角预载调磅螺栓锁定下弓片根部摆角，保证 33 英寸轴距对称形变。',
  },
  {
    id: 'lift33_cable_guard',
    bomCode: 'R-05',
    nameZh: 'Bridge-Lock 碳纤维分弦杆与双滚轮',
    calloutLabel: '分弦杆与双滚轮',
    nameEn: 'Bridge-Lock Carbon Cable Guard & Twin Rollers',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-1.8, -11.5, 0.95],
    explodeSteps: [
      { range: [0.22, 0.54], offset: [-6.5, -1.5, 4.2] },
      { range: [0.68, 1.0], offset: [-3.5, 0, 2.0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.34,
    roleTag: '侧向拨离副弦 · 双密封轴承低阻导槽',
    description:
      '直插弓把下段的 Ø8.5 mm 高模量碳纤维分弦杆，尾端装配两颗精密带槽不锈钢滚轮轴承，将副弦与控制弦平稳拨离箭矢通道中心线 1.7 cm，杜绝羽片刮擦同时降低拉弓摩擦损耗。',
  },
  {
    id: 'lift33_stabilizer',
    bomCode: 'R-06',
    nameZh: 'Bridge-Lock 10吋碳纤维前减震杆',
    calloutLabel: '10"碳纤维稳定杆',
    nameEn: 'Bridge-Lock 10" Carbon Stabilizer & Damper',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [3.2, -8.5, 0],
    explodeSteps: [
      { range: [0.08, 0.34], offset: [12.5, -1.0, 0] },
      { range: [0.6, 0.96], offset: [7.5, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.14,
    roleTag: '前移重心抑跳 · 谐波橡胶吸能配重',
    description:
      '通过 Bridge-Lock 贯穿夹槽内嵌锁紧于下弓把的 10 英寸 3K 编织碳纤维稳定杆：前端集成 Mathews 谐波弹性体阻尼环与三片式可拆不锈钢配重块，显著提升瞄准惯性矩并吸收撒放余振。',
  },

  // ==================== 2. SPLIT LIMBS, SWITCHWEIGHT-X CAMS & CABLES ('slide' · 8 parts) ====================
  {
    id: 'lift33_upper_limbs',
    bomCode: 'C-01',
    nameZh: '四分碳玻抛物线上弓片组',
    calloutLabel: '四分碳玻上弓片',
    nameEn: 'Split Quad Carbon-Glass Upper Limbs',
    group: 'slide',
    material: 'polymer_frame',
    assembledPos: [-1.4, 32.4, 0],
    explodeSteps: [
      { range: [0.16, 0.48], offset: [-4.5, 6.8, 0] },
      { range: [0.68, 1.0], offset: [-2.0, 3.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [-6.5, 6.2, 0],
    labelAppearAt: 0.2,
    roleTag: '超平行弹性储能体 · 左右双分叉四片叠层',
    description:
      '由高压单向玻璃纤维与 3K 碳布共固化成型的四片分叉式上弓片（左右各一对上下叠层叶片），呈 Mathews 标志性超平行（Beyond-Parallel）后掠弧线：拉弓时弓片向内向下弯曲蓄能，撒放时上下反作用力相互抵消震动。',
  },
  {
    id: 'lift33_lower_limbs',
    bomCode: 'C-02',
    nameZh: '四分碳玻抛物线下弓片组',
    calloutLabel: '四分碳玻下弓片',
    nameEn: 'Split Quad Carbon-Glass Lower Limbs',
    group: 'slide',
    material: 'polymer_frame',
    assembledPos: [-1.4, -32.4, 0],
    explodeSteps: [
      { range: [0.16, 0.48], offset: [-4.5, -6.8, 0] },
      { range: [0.68, 1.0], offset: [-2.0, -3.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [-6.5, -6.2, 0],
    labelAppearAt: 0.2,
    roleTag: '镜像同步弹性储能 · 抗扭四片宽幅跨距',
    description:
      '与上弓片严格配对刚度的四片分叉下弓片组，根部卡入下弓片袋、梢部由钛合金轮轴横贯，将 70 磅巅峰拉力转化为 145.6 焦耳箭矢动能。',
  },
  {
    id: 'lift33_upper_cam',
    bomCode: 'C-03',
    nameZh: '上 SwitchWeight-X 双偏心滑轮与减力模块',
    calloutLabel: '上 SwitchWeight-X 轮',
    nameEn: 'Upper SwitchWeight-X Binary Cam & Let-Off Module',
    group: 'slide',
    material: 'copper_accent',
    assembledPos: [-12.6, 41.5, 0],
    explodeSteps: [
      { range: [0.22, 0.56], offset: [-7.5, 8.5, 2.6] },
      { range: [0.7, 1.0], offset: [-3.5, 4.0, 1.8] },
    ],
    calloutDir: 'up',
    calloutStem: 54,
    labelAppearAt: 0.26,
    roleTag: '二进制主从同步凸轮 · 85%减力模块与硬止点柱',
    description:
      'CNC 7075 铜金硬质阳极氧化 SwitchWeight-X 偏心二进制滑轮：主弦槽、双分叉副弦槽与可快速更换的 85% 减力模块一体化集成，侧边凸出的钛合金拉距止点柱（Draw-Stop Peg）在满弓瞬间精准抵靠副弦，造就如墙面般稳固的持弓手感。',
  },
  {
    id: 'lift33_lower_cam',
    bomCode: 'C-04',
    nameZh: '下 SwitchWeight-X 同步偏心滑轮与模块',
    calloutLabel: '下 SwitchWeight-X 轮',
    nameEn: 'Lower SwitchWeight-X Synchronized Binary Cam',
    group: 'slide',
    material: 'copper_accent',
    assembledPos: [-12.6, -41.5, 0],
    explodeSteps: [
      { range: [0.22, 0.56], offset: [-7.5, -8.5, 2.6] },
      { range: [0.7, 1.0], offset: [-3.5, -4.0, 1.8] },
    ],
    calloutDir: 'down',
    calloutStem: 54,
    labelAppearAt: 0.26,
    roleTag: '互锁镜像同步凸轮 · 消除垂直箭尾偏摆',
    description:
      '与上滑轮通过控制弦与副弦互相机械奴役同步的下 SwitchWeight-X 偏心轮：拉弓全程上下滑轮以精确相反角速度同步旋转 95°，确保箭尾水平直线推进（Zero Nock Travel）。',
  },
  {
    id: 'lift33_cam_axles',
    bomCode: 'C-05',
    nameZh: '钛合金上下轮轴与 ABEC-7 轴承组',
    calloutLabel: '钛合金轮轴与轴承',
    nameEn: 'Titanium Cam Axles & ABEC-7 Bearing Races',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-12.6, 0, 0],
    explodeSteps: [
      { range: [0.24, 0.58], offset: [-7.5, 0, -4.8] },
      { range: [0.72, 1.0], offset: [-3.5, 0, -3.2] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, 41.5, 0],
    labelAppearAt: 0.36,
    roleTag: '高刚性零偏摆主轴 · 双侧高速滚珠轴承',
    description:
      '贯穿上下四分弓片梢耳与 SwitchWeight-X 滑轮中心的精密无心磨削 Ti-6Al-4V 钛合金主轴，配 ABEC-7 高速密封滚珠轴承、阶梯垫圈与弹性 E 型卡簧，令轮组在 348 FPS 极速回转下保持丝滑零框量。',
  },
  {
    id: 'lift33_bowstring',
    bomCode: 'C-06',
    nameZh: 'BCY-X 编织主弓弦、中央护弦线与加速豆',
    calloutLabel: 'BCY-X 编织主弓弦',
    nameEn: 'Braided BCY-X Bowstring & Speed Nocks',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-16.5, 0, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [-8.5, 0, 0] },
      { range: [0.58, 0.94], offset: [-4.5, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 14.0, 0],
    labelAppearAt: 0.08,
    roleTag: '超低蠕变聚乙烯主弦 · 能量传递末端',
    description:
      '采用 BCY-X 高模量 HMPE 与 Vectran 混编而成的零蠕变主弓弦，两端挂接上下滑轮弦柱，中央缠绕高耐磨护弦线并对称压接上下双加速阻尼豆（Speed Nocks），将弓片弹性势能高效耦合至箭尾。',
  },
  {
    id: 'lift33_yoke_cables',
    bomCode: 'C-07',
    nameZh: '分叉式 Y 型副弦与控制弦组',
    calloutLabel: '分叉副弦与控制弦',
    nameEn: 'Split-Yoke Buss & Control Cables',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-13.2, 0, 0],
    explodeSteps: [
      { range: [0.12, 0.42], offset: [-6.0, 0, 4.5] },
      { range: [0.64, 0.98], offset: [-3.2, 0, 2.6] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -20.0, 1.5],
    labelAppearAt: 0.18,
    roleTag: '二进制滑轮力矩耦合 · Y 型双叉抗轮倾控制',
    description:
      '二进制滑轮复合弓的心脏传动索系：上 Y 型分叉副弦（Buss Cable）跨接上轮轴两侧再汇入分弦滚轮并绕入下滑轮槽；下 Y 型控制弦（Control Cable）则将下轮角位移实时反馈至上轮，强迫双轮 100% 同步做功并调校轮倾角。',
  },
  {
    id: 'lift33_limb_dampeners',
    bomCode: 'C-08',
    nameZh: '桥接弹性体弓片减震块与止弦器',
    calloutLabel: '弓片减震块与止弦器',
    nameEn: 'Bridged Elastomer Limb & String-Stop Dampeners',
    group: 'slide',
    material: 'follower_orange',
    assembledPos: [-6.5, 0, 0],
    explodeSteps: [
      { range: [0.1, 0.36], offset: [-4.5, 0, -3.5] },
      { range: [0.62, 0.94], offset: [-2.8, 0, -2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-8.2, -17.2, 0],
    labelAppearAt: 0.15,
    roleTag: '高频余振阻尼吸收 · 止弦杯瞬态刹停',
    description:
      '横跨四分上下弓片间的 Mathews 桥接谐波减震块与后置碳杆橡胶止弦杯：在箭矢离弦的毫秒之间迅速刹停弓弦余振，降低击发声响至隐蔽狩猎级水准。',
  },

  // ==================== 3. SIGHT, DROP-AWAY REST & D-LOOP ('fire_control' · 5 parts) ====================
  {
    id: 'lift33_drop_away_rest',
    bomCode: 'F-01',
    nameZh: 'QAD Integrate MX 联动落箭台底座',
    calloutLabel: 'Integrate 落箭台',
    nameEn: 'QAD Integrate MX Drop-Away Rest Housing',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [0.45, 1.45, 1.15],
    explodeSteps: [
      { range: [0.18, 0.48], offset: [2.5, 1.2, 5.2] },
      { range: [0.66, 0.98], offset: [1.8, 0.8, 3.2] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    labelAppearAt: 0.26,
    roleTag: '直装燕尾阻尼离合仓 · 全包裹防脱箭护弓',
    description:
      '直锁于弓把背部 Integrate MX 导轨的低剖面高精度落箭台：内置双微调风偏/高低游标鼓轮、扭簧离合阻尼腔与顶部全封闭防脱箭护栏，确保登山行进中箭矢稳妥待命。',
  },
  {
    id: 'lift33_launcher_fork',
    bomCode: 'F-02',
    nameZh: '弹簧驱动 V 型落箭拨叉',
    calloutLabel: 'V 型落箭拨叉',
    nameEn: 'Spring-Loaded V-Launcher Fork',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [1.4, 1.85, 0],
    explodeSteps: [
      { range: [0.22, 0.54], offset: [3.2, 2.6, 5.2] },
      { range: [0.68, 1.0], offset: [2.2, 1.8, 3.6] },
    ],
    calloutDir: 'up',
    calloutStem: 36,
    labelAppearAt: 0.3,
    roleTag: '拉弓上扬托箭 · 撒放毫秒级下弹让位',
    description:
      '高强不锈钢枢轴与植绒消音 V 型箭叉：拉弓阶段由控制弦牵引上扬稳稳托住碳箭中段；撒放后约 4 毫秒内被内部强力扭簧瞬间向下弹落至弓台底面，使三片螺旋箭羽 100% 凌空无接触飞过射箭窗。',
  },
  {
    id: 'lift33_sight_housing',
    bomCode: 'F-03',
    nameZh: 'Bridge-Lock 五针微调瞄具架与水平仪',
    calloutLabel: 'Bridge-Lock 瞄具架',
    nameEn: 'Bridge-Lock 5-Pin Dovetail Sight Housing',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [4.2, 6.4, 1.25],
    explodeSteps: [
      { range: [0.12, 0.4], offset: [6.2, 3.8, 4.4] },
      { range: [0.64, 0.98], offset: [3.4, 2.2, 2.8] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.18,
    roleTag: '中轴内嵌燕尾导轨 · 齿轮微调与防斜倾水泡',
    description:
      '长臂燕尾杆直接贯穿弓把中部 Bridge-Lock 通道的精密光学机械瞄具座：配备滚花高低/风偏微调齿轮、荧光绿快速对齐窥环与防侧倾荧光水平仪，重心完美居中。',
  },
  {
    id: 'lift33_sight_pins',
    bomCode: 'F-04',
    nameZh: '0.019吋多色光纤防撞瞄准针组',
    calloutLabel: '0.019"光纤瞄针组',
    nameEn: '0.019" Guarded Multi-Color Fiber-Optic Pins',
    group: 'fire_control',
    material: 'follower_orange',
    assembledPos: [4.6, 5.6, 1.45],
    explodeSteps: [
      { range: [0.18, 0.5], offset: [6.2, 3.8, 4.4] },
      { range: [0.66, 1.0], offset: [5.4, 3.0, 4.2] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.28,
    roleTag: '20–60码分层弹道标定 · 高聚光光纤点',
    description:
      '按 20 / 30 / 40 / 50 / 60 码抛物线弹道落差垂直排列的五枚 0.019 英寸超细钢片瞄针，顶部环绕盘卷高集光彩色导光光纤，在黎明与林间微光下无需电池即可清晰自发光指示着箭点。',
  },
  {
    id: 'lift33_d_loop',
    bomCode: 'F-05',
    nameZh: 'Dyneema 撒放 D 环、铜箭扣与窥孔',
    calloutLabel: 'D 环与铜箭扣/窥孔',
    nameEn: 'Dyneema Release D-Loop, Nock Collars & Peep Sight',
    group: 'fire_control',
    material: 'copper_accent',
    assembledPos: [-16.5, 2.4, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [-10.8, 0, 0] },
      { range: [0.58, 0.94], offset: [-6.0, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.1,
    roleTag: '零侧扭力撒放接口 · 1/4吋斜切防眩窥孔',
    description:
      '替代扳机火控的复合弓核心界面组件：上下黄铜卷边箭扣精准定位搭箭点；高强 Dyneema 编织 D 环供腕式/拇指撒放器钳口咬合实现无偏摆瞬间解脱；上方 1/4 英寸铝合金斜切窥孔在满弓时与前瞄准环同轴套圈，构建两点一线狙击级瞄准基线。',
  },

  // ==================== 4. 5-ARROW QUIVER & MATCH CARBON ARROW ('magazine' · 5 parts) ====================
  {
    id: 'lift33_quiver_frame',
    bomCode: 'Q-01',
    nameZh: 'LowPro 五箭贴身快拆箭壶架',
    calloutLabel: '五箭快拆箭壶架',
    nameEn: 'LowPro 5-Arrow Quick-Detach Quiver Spine',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [0.6, 2.0, 4.2],
    explodeSteps: [
      { range: [0.08, 0.34], offset: [0, 0, 7.2] },
      { range: [0.62, 0.96], offset: [0, -1.5, 3.8] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.14,
    roleTag: '超贴身右侧快拆携行架 · 五槽弹性夹持梳',
    description:
      '紧贴弓把右侧轮廓布置的 Mathews LowPro 5 箭快拆携行骨架：双碳纤维立柱连接上下五槽弹性橡胶卡扣与底部箭尾护托，将 5 支备用狩猎箭的重心拉近弓身中轴线，大幅降低侧倾风阻。',
  },
  {
    id: 'lift33_quiver_hood',
    bomCode: 'Q-02',
    nameZh: '消音吸能泡沫三刃箭头罩',
    calloutLabel: '消音泡沫箭头罩',
    nameEn: 'Acoustic Foam Broadhead Hood & Upper Gripper',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [0.6, 22.5, 4.85],
    explodeSteps: [
      { range: [0.08, 0.34], offset: [0, 0, 7.2] },
      { range: [0.62, 0.96], offset: [0, 6.2, 4.2] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.22,
    roleTag: '宽幅猎刃物理隔离仓 · 零刀刃磨损',
    description:
      '加宽型耐冲击聚合物箭头防护罩：内衬高密度微孔消音吸能泡棉，在不接触三刃机械刀片锋利刃口的前提下稳固包裹 5 枚猎箭头，避免行军磕碰发出金属声响。',
  },
  {
    id: 'lift33_quiver_latch',
    bomCode: 'Q-03',
    nameZh: '弹簧定位箭壶快拆拨锁',
    calloutLabel: '箭壶快拆锁扣',
    nameEn: 'Spring-Detent Quiver Release Latch',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [0.6, 3.5, 2.45],
    explodeSteps: [
      { range: [0.08, 0.34], offset: [0, 0, 5.2] },
      { range: [0.62, 0.96], offset: [0, 1.5, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 36,
    labelAppearAt: 0.28,
    roleTag: '单手盲操偏心锁紧 · 零虚位抗震锁定',
    description:
      '高醒目度阳极橙色凸轮快拆锁柄，配合不锈钢弹簧定位销将箭壶支架死死压紧在弓把燕尾座上，单手拨开即可在 1 秒内无声卸除整座五箭壶。',
  },
  {
    id: 'lift33_arrow_shaft',
    bomCode: 'Q-04',
    nameZh: '29吋微径高模量碳素箭杆与发光箭尾',
    calloutLabel: '29"碳箭杆与发光尾',
    nameEn: '29" Carbon Arrow Shaft, Insert & Illuminated Nock',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [-16.5, 2.4, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [18.0, 2.8, 0] },
      { range: [0.6, 0.94], offset: [12.0, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [16.0, 0, 0],
    labelAppearAt: 0.1,
    roleTag: '400格令竞赛狩猎配重 · 3片螺旋尾羽稳流',
    description:
      '直线度公差 ±0.001 英寸的 Ø6.2 mm 微径高模量碳纤维猎箭杆：尾部装配绿色发光聚碳酸酯箭尾与铝合金防爆环，后段贴附三片呈螺旋偏角布置的 2 英寸强旋稳流箭羽，前端压配不锈钢半外径（Half-Out）螺纹衬套。',
  },
  {
    id: 'lift33_broadhead',
    bomCode: 'Q-05',
    nameZh: 'CNC 三刃机械狩猎箭头',
    calloutLabel: '三刃机械箭头',
    nameEn: 'CNC 3-Blade Mechanical Broadhead',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [31.3, 2.4, 0],
    explodeSteps: [
      { range: [0.06, 0.3], offset: [18.0, 2.8, 0] },
      { range: [0.6, 0.94], offset: [22.0, 2.2, 0], rotation: [1.2, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.18,
    roleTag: '100格令硬化钢破甲凿尖 · 三刃扩创杀伤',
    description:
      '旋拧于半外径螺纹衬套前端的 100 格令 CNC 硬化不锈钢三刃机械猎箭头：前部采用穿甲棱形凿尖（Trocar Tip），后方三片 120° 均布后掠刀片由橙色阻尼领圈稳固收拢并在高速命中瞬间扩创切割。',
  },
];

export const LIFT33_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'phase_1',
    stepNum: '01',
    shortLabel: '拉弓卷轮储能',
    title: '拉动 D 环与 BCY-X 主弦后移 27.5 cm，SwitchWeight-X 双轮同步旋转 95° 压缩四分碳片',
    range: [0.0, 0.24],
    description:
      '撒放器钳口拉动 D 环后退 27.5 cm（满弓至 X = -44.0 cm）：副弦与控制弦带动上下 SwitchWeight-X 二进制偏心轮同步旋转 95°，四分碳玻抛物线弓片向内向下深弯蓄积 145.6 J 弹性势能，QAD V 型落箭叉上扬稳妥托住碳箭。',
  },
  {
    id: 'phase_2',
    stepNum: '02',
    shortLabel: '85% 减力谷悬停',
    title: '偏心轮越过峰值力矩进入 85% 减力谷，钛合金止点柱抵死副弦实现岩壁级稳固瞄准',
    range: [0.24, 0.32],
    description:
      '双偏心轮滚过最大力臂切换至小曲率省力凸轮面，持弓拉力由 70 磅骤降 85% 至仅 10.5 磅（47 N）；凸出的钛合金 Draw-Stop 硬止点柱抵靠副弦，射手透过 1/4 吋窥孔对齐 0.019 吋光纤瞄针精确锁定目标。',
  },
  {
    id: 'phase_3',
    stepNum: '03',
    shortLabel: '撒放器解脱击发',
    title: '撒放器精密阻铁释放 D 环，满蓄能弓片与双偏心轮瞬时解除静力平衡',
    range: [0.32, 0.36],
    description:
      '拇指轻压撒放器扳机，钳口以零横向搓动释放 Dyneema D 环，BCY-X 主弦瞬间摆脱握持约束向前猛烈回弹，机械储能释放脉冲就此打响。',
  },
  {
    id: 'phase_4',
    stepNum: '04',
    shortLabel: '双轮做功与箭出弓',
    title: '四分弓片高速回弹带动双轮回转做功，QAD 落箭叉毫秒下弹让位，400 格令碳箭加速至 348 FPS',
    range: [0.36, 0.52],
    description:
      '上下四分弓片高速回弹驱动双 SwitchWeight-X 滑轮同步反向回转，将 145.6 焦耳势能倾泻至 400 格令猎箭；撒放约 4 ms 后 QAD V 型落箭叉瞬间向下折叠让道，三片螺旋箭羽以 106 m/s（348 FPS）零擦碰掠过弓把射箭窗。',
  },
  {
    id: 'phase_5',
    stepNum: '05',
    shortLabel: '离弓飞行与弦振',
    title: '三刃猎箭带螺旋尾流离弓远飞，主弦掠过 6.5 吋弓档与止弦杯发生阻尼微振',
    range: [0.52, 0.68],
    description:
      '猎箭在螺旋尾羽稳定扭矩下高速飞向靶心；失去箭体质量阻尼的主弓弦冲过 X = -16.5 cm 平衡位置后轻触后置碳杆止弦杯，与弓片产生衰减快速的微幅双向弹性回弹。',
  },
  {
    id: 'phase_6',
    stepNum: '06',
    shortLabel: '谐振衰减与再搭箭',
    title: '桥接弹性体与稳定杆吸收残余谐波震动，新一支备用猎箭预备搭弦',
    range: [0.68, 0.86],
    description:
      '弓片间桥接弹性体减震块与 10 英寸前稳定杆彻底耗散残余高频应力波；V 型落箭叉预复位并迎接下一支匹配狩猎箭重新扣入 D 环中央箭扣位。',
  },
  {
    id: 'phase_7',
    stepNum: '07',
    shortLabel: '弓档平衡复位',
    title: '弓弦、滑轮与四分弓片完全静定于 6.5 吋标准弓档，恢复完整待击周期起点',
    range: [0.86, 1.0],
    description:
      '上下 SwitchWeight-X 偏心轮与分叉副弦完全回归初始预紧角度，弓档精准停驻 X = -16.5 cm，四分弓片、落箭台与碳箭闭环归零准备下一轮精准发射。',
  },
];

/** Evaluates synchronized flex factor (`0` = brace height, `1` = full draw, `-0.05` = post-release overshoot). */
function computeLift33Flex(f: number): number {
  const drawRamp = seg(f, 0.0, 0.24);
  const powerUnwind = seg(f, 0.32, 0.5);
  const baseFlex = drawRamp * (1 - powerUnwind);
  let osc = 0;
  if (f > 0.46 && f < 0.84) {
    const u = linearSeg(f, 0.46, 0.84);
    osc = -0.05 * Math.sin(u * Math.PI * 3.0) * Math.sin(u * Math.PI);
  }
  return baseFlex + osc;
}

/** Evaluates hero nocked arrow axial displacement dx, renock arc [dy, dz], and flight spin rx. */
function computeHeroArrowMotion(f: number): {
  dx: number;
  dy: number;
  dz: number;
  rx: number;
} {
  const flex = computeLift33Flex(f);
  if (f <= 0.32) {
    return { dx: LIFT33_NOCK_DRAW_DX * flex, dy: 0, dz: 0, rx: 0 };
  }
  if (f <= 0.6) {
    const uFlight = Math.pow(linearSeg(f, 0.32, 0.6), 1.45);
    return {
      dx: LIFT33_NOCK_DRAW_DX + (74.5 - LIFT33_NOCK_DRAW_DX) * uFlight,
      dy: 0,
      dz: 0,
      rx: Math.PI * 2 * linearSeg(f, 0.32, 0.6),
    };
  }
  if (f <= 0.68) {
    return { dx: 74.5, dy: 0, dz: 0, rx: Math.PI * 2 };
  }
  if (f <= 0.95) {
    const uRe = seg(f, 0.68, 0.95);
    const arc = Math.sin(uRe * Math.PI);
    return {
      dx: 74.5 * (1 - uRe),
      dy: 7.5 * arc,
      dz: 4.5 * arc,
      rx: Math.PI * 2 * (1 - uRe),
    };
  }
  return { dx: 0, dy: 0, dz: 0, rx: 0 };
}

/**
 * Real-time 60fps mechanical kinematics for Mathews LIFT 33 (`lift33`) across f ∈ [0, 1].
 */
export function computeLift33FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  const flex01 = computeLift33Flex(f);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let rx = 0;
  const ry = 0;
  let rz = 0;
  let scaleX = 1;

  switch (partId) {
    case 'lift33_upper_limbs':
    case 'lift33_lower_limbs':
    case 'lift33_cam_axles':
    case 'lift33_bowstring':
    case 'lift33_yoke_cables': {
      scaleX = 1 + flex01;
      break;
    }

    case 'lift33_upper_cam': {
      dx = LIFT33_TIP_FLEX_DX * flex01;
      dy = -LIFT33_TIP_FLEX_DY * flex01;
      rz = CAM_MAX_ROT_RAD * flex01;
      break;
    }

    case 'lift33_lower_cam': {
      dx = LIFT33_TIP_FLEX_DX * flex01;
      dy = LIFT33_TIP_FLEX_DY * flex01;
      rz = -CAM_MAX_ROT_RAD * flex01;
      break;
    }

    case 'lift33_d_loop': {
      dx = LIFT33_NOCK_DRAW_DX * flex01;
      break;
    }

    case 'lift33_launcher_fork': {
      // Cradles arrow during draw & full-draw hold (0..0.34), snaps down -1.05 rad for 100% vane clearance,
      // then springs smoothly back up across 0.78..0.94 for next arrow.
      const dropDown = seg(f, 0.34, 0.41);
      const liftBack = seg(f, 0.78, 0.94);
      rz = -1.05 * dropDown * (1 - liftBack);
      break;
    }

    case 'lift33_arrow_shaft':
    case 'lift33_broadhead': {
      const m = computeHeroArrowMotion(f);
      dx = m.dx;
      dy = m.dy;
      dz = m.dz;
      rx = m.rx;
      break;
    }

    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes internal/external archery ballistics & quiver feed state for Mathews LIFT 33.
 * Zero gunpowder flashes, zero Mach diamonds, zero spent brass!
 */
export function computeLift33BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const arrow = computeHeroArrowMotion(f);
  const bulletVisible = f >= 0.32 && f <= 0.62;
  const bulletX = 35.75 + arrow.dx;
  const streakLength = bulletVisible
    ? 5.6 * Math.sin(linearSeg(f, 0.34, 0.62) * Math.PI)
    : 0;

  // Quiver Slot 0 rests at [-1.80, +1.00, +4.95] vertical (+PI/2).
  // Phase A (0.40..0.49): translate strictly -Z (4.95 -> 0.85) & -X (-1.80 -> -3.80) BEFORE tilting,
  // guaranteeing zero broadhead sweep across Slot 1..4 while inside the quiver!
  // Phase B (0.49..0.60): rotate +PI/2 -> 0 and position at rest [-11.50, +2.40, +0.85] through f = 1.0.
  const zClear = seg(f, 0.4, 0.49);
  const rotT = seg(f, 0.49, 0.6);
  const nextX = -1.8 - 2.0 * zClear + (-11.5 - -3.8) * rotT;
  const nextY = 1.0 + (2.4 - 1.0) * rotT;
  const nextZ = 4.95 + (0.85 - 4.95) * zClear;
  const nextRZ = Math.PI * 0.5 * (1 - rotT);

  return {
    bulletVisible,
    bulletPos: [bulletX, 2.4 + arrow.dy, arrow.dz],
    streakLength,
    spentCaseVisible: false,
    spentCasePos: [0, 0, 0],
    spentCaseRot: [0, 0, 0],
    spentCaseOpacity: 0,
    chamberFlashIntensity: 0,
    gasPortFlashIntensity: 0,
    gasPortPos: [0, 2.4, 0],
    muzzlePlumeScale: 0.01,
    muzzlePlumeOpacity: 0,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotY: 0,
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [-0.6, 1.0, 4.95],
    reserveRoundRotY: 0,
  };
}

export const LIFT33_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  lift33_riser: {
    albedoFile: 'lift33_riser_albedo.webp',
    normalFile: 'lift33_riser_normal.webp',
    roughnessFile: 'lift33_riser_roughness.webp',
    normalScale: 0.44,
  },
  lift33_upper_pocket: {
    albedoFile: 'lift33_riser_albedo.webp',
    normalFile: 'lift33_riser_normal.webp',
    roughnessFile: 'lift33_riser_roughness.webp',
    normalScale: 0.38,
  },
  lift33_lower_pocket: {
    albedoFile: 'lift33_riser_albedo.webp',
    normalFile: 'lift33_riser_normal.webp',
    roughnessFile: 'lift33_riser_roughness.webp',
    normalScale: 0.38,
  },
  lift33_drop_away_rest: {
    albedoFile: 'lift33_riser_albedo.webp',
    normalFile: 'lift33_riser_normal.webp',
    roughnessFile: 'lift33_riser_roughness.webp',
    normalScale: 0.36,
  },
  lift33_sight_housing: {
    albedoFile: 'lift33_riser_albedo.webp',
    normalFile: 'lift33_riser_normal.webp',
    roughnessFile: 'lift33_riser_roughness.webp',
    normalScale: 0.36,
  },
  lift33_upper_limbs: {
    albedoFile: 'lift33_limbs_albedo.webp',
    normalFile: 'lift33_limbs_normal.webp',
    roughnessFile: 'lift33_limbs_roughness.webp',
    normalScale: 0.48,
  },
  lift33_lower_limbs: {
    albedoFile: 'lift33_limbs_albedo.webp',
    normalFile: 'lift33_limbs_normal.webp',
    roughnessFile: 'lift33_limbs_roughness.webp',
    normalScale: 0.48,
  },
  lift33_upper_cam: {
    albedoFile: 'lift33_limbs_albedo.webp',
    normalFile: 'lift33_limbs_normal.webp',
    roughnessFile: 'lift33_limbs_roughness.webp',
    normalScale: 0.42,
  },
  lift33_lower_cam: {
    albedoFile: 'lift33_limbs_albedo.webp',
    normalFile: 'lift33_limbs_normal.webp',
    roughnessFile: 'lift33_limbs_roughness.webp',
    normalScale: 0.42,
  },
  lift33_stabilizer: {
    albedoFile: 'lift33_limbs_albedo.webp',
    normalFile: 'lift33_limbs_normal.webp',
    roughnessFile: 'lift33_limbs_roughness.webp',
    normalScale: 0.44,
  },
  lift33_bowstring: {
    albedoFile: 'lift33_limbs_albedo.webp',
    normalFile: 'lift33_limbs_normal.webp',
    roughnessFile: 'lift33_limbs_roughness.webp',
    normalScale: 0.56,
  },
  lift33_quiver_frame: {
    albedoFile: 'lift33_limbs_albedo.webp',
    normalFile: 'lift33_limbs_normal.webp',
    roughnessFile: 'lift33_limbs_roughness.webp',
    normalScale: 0.42,
  },
  lift33_quiver_hood: {
    albedoFile: 'lift33_limbs_albedo.webp',
    normalFile: 'lift33_limbs_normal.webp',
    roughnessFile: 'lift33_limbs_roughness.webp',
    normalScale: 0.48,
  },
};

export const LIFT33_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'lift33_riser',
    weapon: 'lift33' as WeaponRuntimePlugin['id'],
    titleCn: 'CNC 7075-T6 桥接桁架弓把、弓片袋与 Bridge-Lock 瞄具贴图组',
    partTag: 'R-01 / R-03 / R-04 / F-01 / F-03 RISER & SIGHT',
    resolution: '2048 × 1024 px',
    summary:
      '专为 Mathews LIFT 33 五轴精铣 7075-T6 铝合金桁架弓把与 Bridge-Lock 光学机械总成烘焙的 2K 5 通道 ORM 贴图组：上栏还原钛灰硬质阳极氧化表面细密球头刀 CNC 加工纹、倒角亮银露白磨损及「MATHEWS LIFT 33 · BRIDGE-LOCK · SWITCHWEIGHT-X」原厂激光标刻；中下栏分层呈现上下枢转弓片袋、17-4 PH 不锈钢调磅螺栓、QAD Integrate MX 落箭台及五针瞄具码数刻度。',
    highlights: [
      '7075-T6 硬质阳极氧化花岗灰 + 5 轴球头 CNC 刀路各向异性高光',
      '双侧 MATHEWS LIFT 33 · 33" ATA / 6.5" BH 激光雕刻与 Bridge-Lock 燕尾刻度',
      'QAD Integrate MX 落箭台与五针瞄具微调游标刻度精确分层',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'lift33_riser_albedo.webp',
        note: 'sRGB · 花岗岩钛灰阳极氧化铝 / 亮银 CNC 棱边磨损 / 银白激光铭文',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'lift33_riser_normal.webp',
        note: 'Linear · 5 轴铣削刀路微起伏 + 凹刻品牌印记 + 游标刻度凹槽',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'lift33_riser_roughness.webp',
        note: 'Linear · R:高度积分AO / G:亮银螺栓(0.20)-阳极铝(0.38)-消光槽(0.62) / B:金属度',
      },
    ],
  },
  {
    id: 'lift33_limbs',
    weapon: 'lift33' as WeaponRuntimePlugin['id'],
    titleCn: '3K 斜纹碳纤维四分弓片、SwitchWeight-X 铜金双轮与 BCY-X 编织弦贴图组',
    partTag: 'C-01 / C-02 / C-03 / C-04 / C-06 / R-06 / Q-01',
    resolution: '2048 × 1024 px',
    summary:
      '真实刻画 Mathews LIFT 33 复合材质与编织传动机构的 2K 5 通道 ORM 贴图组：上栏高密度绘制 2×2 3K 斜纹碳纤维复合材料编织各向异性光泽；中栏还原标志性古铜金阳极氧化 SwitchWeight-X 偏心二进制滑轮「85% LET-OFF · MOD-F」径向车削环纹与 10 英寸碳纤维稳定杆；下栏细密编制双色 BCY-X 螺旋拧弦绞股、护弦缠线、LowPro 箭壶碳骨架与微孔消音泡棉罩。',
    highlights: [
      '2×2 3K 碳纤维斜纹编织法线与各向异性树脂清漆光泽梯度',
      'SwitchWeight-X 古铜金硬质阳极氧化偏心轮径向车削与 85% 减力标牌',
      'BCY-X 双色螺旋绞股主弦、中央护弦缠线及消音微孔泡棉箭罩质感',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'lift33_limbs_albedo.webp',
        note: 'sRGB · 3K 碳纤维斜纹 / 古铜金 SwitchWeight-X 滑轮 / 双色 BCY-X 弓弦',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'lift33_limbs_normal.webp',
        note: 'Linear · 碳纤维经纬束凹凸 + 偏心轮车削同心纹 + 螺旋拧弦绞股与消音泡棉',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'lift33_limbs_roughness.webp',
        note: 'Linear · R:高度AO / G:碳纤环氧(0.28)-铜金轮(0.24)-泡棉(0.84) / B:金属度分层',
      },
    ],
  },
  {
    id: 'lift33_seamless_detail',
    weapon: 'lift33' as WeaponRuntimePlugin['id'],
    titleCn: '钛合金轮轴、机械三刃猎箭头与碳素箭杆无缝细节贴图',
    partTag: '11 COMPOUND BOW SUB-ASSEMBLIES',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为 Ti-6Al-4V 钛合金轮轴、ABEC-7 轴承、CNC 三刃机械狩猎箭头、V 型落箭拨叉、碳素分弦杆以及 Engage 包胶握把提供微米级拉丝金属与弹性体防滑细节。',
    highlights: [
      '钛合金主轴与三刃机械箭头精密车削拉丝高光法线',
      'Engage 握把、QAD V 型叉垫与弹性体减震块微细磨砂纹',
      '覆盖其余全部 11 个精密运动与携行节点',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于钛合金轮轴 / V 型落箭叉 / 三刃箭头 / 分弦滚轮等',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 硬化不锈钢与钛合金微粗糙度起伏',
      },
      {
        kind: 'Normal',
        labelCn: '复合弹性体皮纹法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于 Engage 握把 / 分叉碳箭杆 / 弓片减震块等',
      },
    ],
  },
];

export const LIFT33_PLUGIN: WeaponRuntimePlugin = {
  id: 'lift33' as WeaponRuntimePlugin['id'],
  partGroups: LIFT33_PART_GROUPS,
  timelinePresets: LIFT33_TIMELINE_PRESETS,
  parts: LIFT33_PARTS,
  firingPhases: LIFT33_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(LIFT33_FIRING_PHASES, f),
  computeFiringKinematics: computeLift33FiringKinematics,
  computeBallisticsState: computeLift33BallisticsState,
  pbrBindings: LIFT33_PBR_BINDINGS,
  pbrSuites: LIFT33_PBR_SUITES,
};
