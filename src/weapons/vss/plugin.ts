import {
  clamp01,
  findActiveFiringPhase,
  linearSeg,
  seg,
  smoothstep01,
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
import { VSS_BORE_Y, VSS_PISTON_Y, VSS_SUPP_Y } from './meshes/vssGeometries';

export const VSS_ID: WeaponId = 'vss';
export const VSS_CALIBER: CaliberProfile = '9x39_subsonic';

export const VSS_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '多孔泄气枪管、6级斜挡板消音芯与6突笋枪机组',
    nameEn: 'Perforated Barrel, 6-Stage Baffle Stack & 6-Lug Bolt',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '铣削钢机匣、整体消音筒、镂空桦木托与PSO-1瞄具组',
    nameEn: 'Milled Receiver, Integral Suppressor, Birch Stock & PSO-1',
    badgeColor: '#d97706',
  },
  {
    key: 'fire_control',
    nameZh: '无击锤直线平移击铁、阻铁与横推快慢机火控组',
    nameEn: 'Hammerless Linear Striker, Sear & Cross-Bolt Selector',
    badgeColor: '#f43f5e',
  },
  {
    key: 'magazine',
    nameZh: '10发9×39mm俄制李子褐华夫纹聚合物弹匣组',
    nameEn: '10-Round 9×39mm Soviet Plum Waffle Polymer Magazine',
    badgeColor: '#10b981',
  },
];

export const VSS_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: '苏联图拉兵工厂 VSS「螺纹切割机」（6P29 · 9×39mm SP-5/SP-6 亚音速微声狙击步枪）标准待击态：全长 894 mm，整体式圆柱消音筒完整包裹 200 mm 多孔泄气枪管与 6 级斜挡板消音芯，左侧燕尾槽锁装 PSO-1M2-1 4×24 光学瞄准镜。',
  },
  {
    id: 'field_strip',
    label: '野战隐蔽箱装快拆',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '遵循特种部队隐蔽公文箱携行与勤务规程：卸下 10 发李子褐华夫弹匣，向左滑拆 PSO-1M2-1 瞄准镜，按压卡笋向下脱卸快拆镂空桦木层压枪托，并向前旋抽整体消音外筒暴露内部多孔枪管与 6 级斜挡板。',
  },
  {
    id: 'sub_assembly',
    label: '消音芯与无击锤自动机拆解',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '从 200 mm 多孔枪管前端抽出 6 级不对称斜挡板声学消音芯，掀开冲压加强肋机匣盖，取出长行程导气枪机框、6 闭锁突笋旋转枪机、双螺旋主簧及 VSS 独门无击锤直线平移击铁总成。',
  },
  {
    id: 'full_exploded',
    label: '全枪 24 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 24 个精密军械节点零遮挡展开：从 3 排径向泄气孔冷锻枪管、6 级斜挡板膨胀消音芯、6 突笋精密回转枪机、静音直线平移击铁、PSO-1M2-1 侧装光学镜到俄制桦木层压镂空枪托，全景揭示冷战特种微声狙击工程巅峰。',
  },
];

export const VSS_PARTS: WeaponPartSpec[] = [
  // ==================== 1. PERFORATED BARREL, 6-STAGE BAFFLE STACK & 6-LUG BOLT ('slide' · 7 parts) ====================
  {
    id: 'vss_barrel',
    bomCode: 'S-01',
    nameZh: '200mm 多孔径向泄气 9×39mm 精密枪管与导气箍',
    calloutLabel: '200mm多孔泄气枪管',
    nameEn: '200mm Radial-Ported 9×39mm Barrel & Integral Gas Tap',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [6.0, VSS_BORE_Y, 0],
    explodeSteps: [
      { range: [0.38, 0.68], offset: [8.0, 0, 0] },
      { range: [0.68, 1.0], offset: [6.0, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [10.5, -0.78, 0],
    labelAppearAt: 0.32,
    roleTag: '3 排径向泄气孔 · 210mm 急缠距稳定 16.2g 亚音速重弹',
    description:
      '全长 200 mm 镀铬冷锻精密枪管，采用 1:210 mm 高速右旋膛线稳定沉重的 9×39mm SP-5/SP-6（250 格令）亚音速穿甲弹；前段膛线阴线槽内精准钻有三排径向高压泄气孔，弹头尚在膛内即将部分燃气分流泄入后方整体消音筒膨胀室，上方一体集成紧凑短导气箍驱动长行程活塞。',
  },
  {
    id: 'vss_baffle_stack',
    bomCode: 'S-02',
    nameZh: '6 级不对称斜挡板 CNC 声学膨胀消音芯',
    calloutLabel: '6级斜挡板声学消音芯',
    nameEn: '6-Stage Asymmetric Slanted CNC Acoustic Baffle Stack',
    group: 'slide',
    material: 'stainless',
    assembledPos: [36.3, VSS_SUPP_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [22.0, -2.0, 0] },
      { range: [0.66, 1.0], offset: [14.0, -1.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, -1.55, 0],
    labelAppearAt: 0.28,
    roleTag: '纵剖视觉核心 · 交替 ±28° 湍流反射彻底消除枪口音爆',
    description:
      '中央精密机械研究所（TsNIITochMash）独步天下的微声心脏：由耐烧蚀合金钢数控一体加工的 6 级交替 ±28° 倾斜不对称挡板组直接套装于多孔枪管口部前方，利用偏心导流通道迫使火药燃气在相邻腔室间剧烈撞击涡旋降温降压，使 9×39mm 实弹枪口声压骤降至约 130 dB 且实现零膛口焰！',
  },
  {
    id: 'vss_bolt_carrier',
    bomCode: 'S-03',
    nameZh: '长行程导气活塞枪机框与右侧拉机柄',
    calloutLabel: '长行程活塞枪机框',
    nameEn: 'Long-Stroke Gas-Piston Bolt Carrier & Charging Handle',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-0.5, 1.75, 0],
    explodeSteps: [
      { range: [0.22, 0.42], offset: [-2.5, 5.2, 0] },
      { range: [0.64, 1.0], offset: [-2.0, 4.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [3.2, 0.85, 1.2],
    labelAppearAt: 0.24,
    roleTag: '螺旋开锁凸轮槽 · 74mm 长行程平稳压缩复进簧并压回击铁',
    description:
      '兼具低噪音刚度与严寒防污可靠性的长行程导气主动件：前端细长镀铬不锈钢活塞杆直探入消音筒内部枪管导气箍；后段铣削精密螺旋凸轮导槽驱动 6 突笋枪机旋转 32° 开闭锁，后坐同时向后推送直线击铁重新待击。',
  },
  {
    id: 'vss_bolt',
    bomCode: 'S-04',
    nameZh: '拉丝不锈钢 6 闭锁突笋精密旋转枪机',
    calloutLabel: '6突笋精密旋转枪机',
    nameEn: 'Brushed-Stainless 6-Lug Precision Rotating Bolt',
    group: 'slide',
    material: 'stainless',
    assembledPos: [1.8, VSS_BORE_Y, 0],
    explodeSteps: [
      { range: [0.22, 0.42], offset: [3.5, 2.4, 3.0] },
      { range: [0.64, 1.0], offset: [4.0, 1.8, 2.8], rotation: [0.56, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [2.2, 0.85, 0],
    labelAppearAt: 0.28,
    roleTag: '60° 等分 6 突笋对称闭锁 · 媲美栓动狙击步枪同轴刚性',
    description:
      '打破传统 AK 双突笋结构，由谢尔久科夫团队专为高精度微声狙击设计的 6 突笋圆柱旋转枪机：前端每 60° 均布 6 枚对称闭锁突笋，旋转 32°（0.56 rad）即可与铣削机匣前节套达成极高同轴度刚性闭锁，消除不对称应力偏摆，赋予亚音速重弹卓越的 400 米精密散布。',
  },
  {
    id: 'vss_firing_pin',
    bomCode: 'S-05',
    nameZh: '同轴淬火不锈钢浮动长击针',
    calloutLabel: '同轴淬火浮动击针',
    nameEn: 'Coaxial Hardened-Stainless Floating Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [1.4, VSS_BORE_Y, 0],
    explodeSteps: [
      { range: [0.22, 0.42], offset: [-1.0, 2.6, 5.0] },
      { range: [0.64, 1.0], offset: [-1.0, 1.8, 4.5] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    labelAppearAt: 0.36,
    roleTag: '承接后方直线平移击铁轴向撞击 · 精准击发 9×39 底火',
    description:
      '贯穿 6 突笋旋转枪机中心轴线的精磨淬火合金钢击针：尾端设加粗打击法兰正面承接直线击铁沿膛轴方向的平移撞击，确保极短闭锁击发时滞（Lock Time）且彻底隔绝未闭锁走火风险。',
  },
  {
    id: 'vss_recoil_guide',
    bomCode: 'S-06',
    nameZh: '伸缩式钢制复进导杆与机匣盖尾锁',
    calloutLabel: '伸缩式复进导杆',
    nameEn: 'Telescoping Steel Recoil Guide Rod & Cover Latch',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-6.8, 2.28, 0],
    explodeSteps: [
      { range: [0.2, 0.4], offset: [-12.0, 5.5, 0] },
      { range: [0.64, 1.0], offset: [-8.0, 4.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.24,
    roleTag: '独立于下方直线击铁轴线 · 兼作冲压机匣盖尾锁按钮',
    description:
      '高置布置于直线平移击铁正上方的钢制伸缩复进导杆：尾端集成机匣盖解锁按钮嵌卡于机匣后桥槽内，全行程精确约束复进簧防止高速往复屈曲。',
  },
  {
    id: 'vss_recoil_spring',
    bomCode: 'S-07',
    nameZh: '高寿命螺旋复进簧 (动态压缩)',
    calloutLabel: '螺旋复进簧',
    nameEn: 'High-Fatigue Helical Recoil Return Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-6.4, 2.28, 0],
    explodeSteps: [
      { range: [0.2, 0.4], offset: [-13.0, 9.0, 0] },
      { range: [0.64, 1.0], offset: [-9.0, 6.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.28,
    roleTag: '吸收 74mm 活塞后坐冲量 · 柔和复位减少微声射击撞击噪声',
    description:
      '套装于复进导杆外周的高疲劳琴钢丝螺旋复进簧：击发循环中随枪机框后坐 74 mm 由 112 mm 压缩至 38 mm 蓄能，随后平顺推送自动机复进剥弹并完成 6 突笋旋转闭锁。',
  },

  // ==================== 2. MILLED RECEIVER, INTEGRAL SUPPRESSOR, BIRCH STOCK & PSO-1 ('frame' · 7 parts) ====================
  {
    id: 'vss_receiver',
    bomCode: 'F-01',
    nameZh: '图拉兵工厂 CNC 铣削烤蓝钢机匣(含燕尾轨与实心护圈)',
    calloutLabel: 'CNC铣削烤蓝钢机匣',
    nameEn: 'Tula Arsenal CNC-Milled Blued Steel Receiver & Side Rail',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [-3.5, -2.05, 0],
    labelAppearAt: 0.04,
    roleTag: '整体锻坯数控铣削 · 左侧华约瞄具燕尾轨与 TOZ 厂徽铭文',
    description:
      '摒弃冲压工艺、由整块高强合金钢锻坯 CNC 精密铣削而成的缎面烤蓝钢机匣：高刚度箱体显著降低击发机械谐振并承受 6 突笋闭锁推力；左侧一体铆接苏联标准华约燕尾瞄具导轨，侧壁深镌图拉兵工厂（ТОЗ）星三角试枪章与「ВСС «ВИНТОРЕЗ» · 9×39 · № 87412」西里尔铭文，底部无缝实心焊装闭环扳机护圈。',
  },
  {
    id: 'vss_dust_cover',
    bomCode: 'F-02',
    nameZh: '冲压三道加强肋烤蓝钢机匣防尘盖',
    calloutLabel: '加强肋冲压机匣盖',
    nameEn: 'Stamped 3-Rib Blued-Steel Receiver Top Dust Cover',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-3.0, 2.25, 0],
    explodeSteps: [
      { range: [0.1, 0.28], offset: [-1.2, 9.5, 0] },
      { range: [0.64, 1.0], offset: [-0.8, 6.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [-2.0, 0.92, 0],
    labelAppearAt: 0.1,
    roleTag: '标志性弧顶三加强肋 · 严密隔绝泥沙并降低自动机外泄机械声',
    description:
      '冷冲压成型的流线型弧顶钢制防尘机匣盖，后上弧面压印三道高刚度横向加强筋，右侧开设紧凑抛壳与拉机柄让位窗，按下尾部复进导杆尾锁即可瞬间掀盖检修自动机与直线击铁。',
  },
  {
    id: 'vss_suppressor_tube',
    bomCode: 'F-03',
    nameZh: '414mm 全长圆柱整体式消音外筒(含前护翼准星)',
    calloutLabel: '全长整体式消音外筒',
    nameEn: '414mm Full-Length Integral Suppressor Tube & Front Sight',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [26.7, VSS_SUPP_Y, 0],
    explodeSteps: [
      { range: [0.12, 0.3], offset: [20.0, 4.5, 0] },
      { range: [0.64, 1.0], offset: [16.0, 4.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [2.0, 1.86, 0],
    labelAppearAt: 0.06,
    roleTag: '后部膨胀降压舱 + 前部 6 级挡板壳 · 旋转 90° 免工具快拆清碳',
    description:
      '铸就 VSS「螺纹切割机」一眼万年轮廓的 414 mm 一体式哑光烤蓝无缝钢管消音外筒（外径 37.2 mm）：后半段包覆多孔枪管构成大容积初段泄压膨胀舱，前半段紧固 6 级斜挡板声学芯，顶部直接焊装后表尺座与筒口护翼柱状准星；按压护木前锁钮旋转 90° 即可徒手前抽拆洗积碳。',
  },
  {
    id: 'vss_rear_sight',
    bomCode: 'F-04',
    nameZh: '100–400m 亚音速弹道标尺弧形后照门',
    calloutLabel: '400m弧形标尺后照门',
    nameEn: '100–400m Subsonic Tangent Leaf Rear Sight',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [16.2, 3.65, 0],
    explodeSteps: [
      { range: [0.12, 0.3], offset: [16.0, 9.5, 0] },
      { range: [0.64, 1.0], offset: [10.0, 6.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.32,
    roleTag: '直接焊装于消音筒顶 · 「1–4」适配 9×39mm 大弧度亚音速弹道',
    description:
      '独具一格地直接布置在整体消音外筒上方的紧凑弧形切线表尺：标尺刻画「1 · 2 · 3 · 4」（对应 100 至 400 米），针对初速 290 m/s 的 9×39mm 亚音速重弹大下坠弧线专门标定倾角，在 PSO-1 光学镜卸除或受损时提供可靠应急瞄准。',
  },
  {
    id: 'vss_forend',
    bomCode: 'F-05',
    nameZh: '俄制深李子褐防滑肋玻纤聚合物下护木',
    calloutLabel: '李子褐防滑下护木',
    nameEn: 'Soviet Dark-Plum Ribbed Fiberglass-Polymer Forend',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [12.6, -0.35, 0],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [8.0, -6.5, 0] },
      { range: [0.66, 1.0], offset: [6.0, -4.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.36,
    roleTag: 'AG-4S 玻纤酚醛聚合物 · 隔绝整体消音筒连续射击烫手热传导',
    description:
      '采用苏联冷战后期标志性深李子褐色（Plum）玻纤增强聚酰胺模压成型的纤薄托槽式下护木：圆弧鞍面紧密抱合整体消音筒下壁，双侧压制竖向高摩擦防滑散热肋条，确保特种兵在连续点射微声压制时弱手绝不烫伤打滑。',
  },
  {
    id: 'vss_wood_stock',
    bomCode: 'F-06',
    nameZh: '俄制桦木层压镂空拇指孔快拆枪托(带橡胶缓冲垫)',
    calloutLabel: '桦木层压镂空枪托',
    nameEn: 'Russian Laminated Birchwood Skeleton Thumbhole QD Stock',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-26.8, -4.6, 0],
    explodeSteps: [
      { range: [0.06, 0.24], offset: [-14.0, -3.5, 0] },
      { range: [0.64, 1.0], offset: [-10.0, -2.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [-4.0, -5.2, 0],
    labelAppearAt: 0.06,
    roleTag: '温润琥珀层压桦木纹 · 3 秒快拆折叠装入特种隐蔽公文箱',
    description:
      'VSS 极具苏联美学辨识度的手擦琥珀蜜色层压胶合桦木（Russian Laminated Birch）骨架式拇指孔狙击枪托：斜向交替显现浅金与深棕胶合层纹，前端自然融合人体工学握把并配置钢制垂直燕尾快拆锁榫——按压释放钮向下滑动即可在 3 秒内卸离枪托，令全枪分解收纳进 450×370 mm 便携密箱！尾部配有横向防滑槽硫化橡胶缓冲托垫。',
  },
  {
    id: 'vss_pso1_scope',
    bomCode: 'F-07',
    nameZh: '苏联 PSO-1M2-1 4×24 发光分划侧装狙击瞄准镜',
    calloutLabel: 'PSO-1M2-1 4×24瞄准镜',
    nameEn: 'Soviet PSO-1M2-1 4×24 Illuminated Side-Mount Scope',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-4.5, 6.15, -0.35],
    explodeSteps: [
      { range: [0.04, 0.22], offset: [-2.5, 8.5, -8.0] },
      { range: [0.64, 1.0], offset: [-1.5, 5.5, -5.0] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    calloutAnchor: [2.0, 2.55, 0],
    labelAppearAt: 0.04,
    roleTag: '锤纹灰烤漆镁铝合金 · 9×39 专用 BDC 弹道鼓轮与手风琴橡胶眼罩',
    description:
      '专为 VSS 9×39mm 亚音速重弹大弧度弹道量身定制的苏联原厂 PSO-1M2-1（ПСО-1М2-1）4×24 侧装光学狙击镜：铸造镁铝合金镜体喷涂经典冷战锤纹灰烤漆，左侧自带一体式偏心凸轮锁紧燕尾支架（拆装零归零偏移），顶部配置「1–4」（100–400m）专用弹道补偿高低手轮，后端套接褶皱手风琴橡胶遮光眼罩，物镜与目镜采用绿宝石-蓝宝石多层增透光学镀膜。',
  },

  // ==================== 3. HAMMERLESS LINEAR STRIKER FIRE CONTROL ('fire_control' · 6 parts) ====================
  {
    id: 'vss_striker',
    bomCode: 'FC-01',
    nameZh: '无击锤直线平移式超静音击铁总成',
    calloutLabel: '静音直线平移击铁',
    nameEn: 'Hammerless Linear Spring-Driven Striker Assembly',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-6.4, 0.95, 0],
    explodeSteps: [
      { range: [0.24, 0.44], offset: [-8.5, 3.0, 3.0] },
      { range: [0.64, 1.0], offset: [-6.0, 2.0, 2.2] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.34,
    roleTag: '摒弃传统回转击锤 · 极低声学特征与极速线性击发锁时',
    description:
      'VSS 区别于几乎所有卡拉什尼科夫步枪的隐藏工程绝技：谢尔久科夫彻底弃用摆动惯量大、金属撞击响声清脆的 AK 旋转击锤，改用沿枪管同轴直线平移滑动的轻量化圆柱击铁，配合独立后置主簧轴向释放撞击击针，大幅消除了微声暗杀射击中暴露射手位置的“咔哒”击锤回弹声并缩短击发锁时。',
  },
  {
    id: 'vss_striker_spring',
    bomCode: 'FC-02',
    nameZh: '直线击铁同轴螺旋主簧 (动态伸缩)',
    calloutLabel: '直线击铁螺旋主簧',
    nameEn: 'Coaxial Helical Linear Striker Mainspring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-9.2, 0.95, 0],
    explodeSteps: [
      { range: [0.24, 0.44], offset: [-14.5, 3.0, 3.0] },
      { range: [0.64, 1.0], offset: [-10.0, 2.0, 2.2] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.38,
    roleTag: '锚定机匣后壁 · 轴向蓄能释放推动直线击铁击穿军用底火',
    description:
      '嵌套于直线平移击铁后端空腔与机匣后隔板之间的高刚度琴钢丝螺旋压簧：阻铁脱钩瞬间沿 +X 轴伸展加速推送击铁前冲；枪机框后坐时则反向压缩蓄能直至击铁下凸耳重新挂入主阻铁待击。',
  },
  {
    id: 'vss_trigger',
    bomCode: 'FC-03',
    nameZh: '弧形钢制精密扳机与传递连杆',
    calloutLabel: '精密弧形钢扳机',
    nameEn: 'Curved Steel Precision Trigger & Transfer Bar',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-5.6, -2.55, 0],
    explodeSteps: [
      { range: [0.36, 0.66], offset: [-3.5, -8.0, 0] },
      { range: [0.66, 1.0], offset: [-2.0, -5.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.4,
    roleTag: '干脆狙击手感 · 与后方横推单连发快慢机精准限位互锁',
    description:
      '铰接于铣削机匣底部的弧形热处理碳钢扳机与水平阻铁传动臂：行程短促干脆，适配特种狙击远距精确点射，同时在护圈内侧与后置横推式单/连发选择钮紧密配合控制行程限位。',
  },
  {
    id: 'vss_sear',
    bomCode: 'FC-04',
    nameZh: '直线击铁主阻铁、单发断连器与不到位保险杆',
    calloutLabel: '直线击铁主阻铁组',
    nameEn: 'Linear Striker Catch Sear, Disconnector & Auto Safety',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-6.4, -0.75, 0],
    explodeSteps: [
      { range: [0.36, 0.66], offset: [-7.0, -5.0, 3.0] },
      { range: [0.66, 1.0], offset: [-4.5, -3.5, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.42,
    roleTag: '咬合直线击铁下凸耳 · 保障 6 突笋完全闭锁后方可解脱击发',
    description:
      '集成主待击阻铁钩、单发半自动断连器以及全自动不到位保险脱扣臂的精密不锈钢联动机构：单发模式每发精准截获复位的直线击铁，紧急全自动模式（900 发/分）则等待 6 突笋枪机彻底旋转闭锁才由自动机顶开释放击铁。',
  },
  {
    id: 'vss_safety_lever',
    bomCode: 'FC-05',
    nameZh: '右侧冲压防尘式手动保险拨片',
    calloutLabel: '右侧防尘手动保险片',
    nameEn: 'Right-Side Stamped AK-Pattern Dust-Shield Safety Lever',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-5.0, 0.85, 1.82],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [-2.5, -0.8, 6.0] },
      { range: [0.66, 1.0], offset: [-1.5, -0.7, 4.5] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.36,
    roleTag: '纯保险解耦 · 向上关闭防尘窗锁死拉机柄与扳机连杆',
    description:
      '延续苏联经典 AK 右侧大拨片人机习惯但经过功能解耦的冲压钢手动保险杆：在 VSS 上仅专职「保险 / 开火」两档切换——向上扳起时同时封盖机匣盖拉机柄导槽防泥尘并刚性锁死扳机，向下拨开即可无声进入待发状态。',
  },
  {
    id: 'vss_selector_switch',
    bomCode: 'FC-06',
    nameZh: '扳机后方横推式单/连发快慢机按钮 (1 / АВ)',
    calloutLabel: '横推单连发快慢机钮',
    nameEn: 'Cross-Bolt Semi/Full-Auto Fire Selector Button (1 / АВ)',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-8.2, -2.55, 0],
    explodeSteps: [
      { range: [0.36, 0.66], offset: [-8.5, -8.0, 3.8] },
      { range: [0.66, 1.0], offset: [-6.0, -5.5, 2.7] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.42,
    roleTag: 'VSS 独门横推键 · 左推单发精确狙击 / 右推 900 RPM 应急连发',
    description:
      '隐藏在扳机护圈内侧、紧贴扳机正后方的 VSS 标志性横推柱塞式快慢机：将其与右侧防尘保险完全分离后，射手无需移开握枪手或发出响亮拨片敲击声，仅凭食指侧推即可静音在「1（单发精确狙击）」与「АВ（900 发/分近战应急全自动）」间切换。',
  },

  // ==================== 4. 10-ROUND 9×39mm PLUM WAFFLE MAGAZINE ('magazine' · 4 parts) ====================
  {
    id: 'vss_mag_body',
    bomCode: 'M-01',
    nameZh: '10 发 9×39mm 俄制深李子褐华夫纹聚合物弧形弹匣体',
    calloutLabel: '10发9×39华夫纹弹匣体',
    nameEn: '10-Round 9×39mm Soviet Plum Waffle Polymer Magazine Body',
    group: 'magazine',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [1.4, -6.8, 0],
    explodeSteps: [
      { range: [0.02, 0.22], offset: [2.0, -7.5, 0] },
      { range: [0.64, 1.0], offset: [1.5, -5.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0.4, -2.2, 0],
    labelAppearAt: 0.04,
    roleTag: '低轮廓卧姿隐蔽狙击 · 双排双进华夫网格加强筋',
    description:
      '专为卧姿隐蔽微声狙击设计的紧凑 10 发双排双进微弧形弹匣（亦完全通用于 AS Val 的 20 发加长弹匣）：采用高强抗冲击深李子褐玻纤聚合物注塑成型，外壁压铸标志性网格华夫纹加强肋，抱弹口内嵌耐磨冷轧钢衬片。',
  },
  {
    id: 'vss_mag_follower',
    bomCode: 'M-02',
    nameZh: '高可视安全橙色双排交错防倾 9×39mm 托弹板',
    calloutLabel: '安全橙9×39防倾托弹板',
    nameEn: 'High-Visibility Safety-Orange Anti-Tilt 9×39mm Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [1.55, -8.95, 0],
    explodeSteps: [
      { range: [0.02, 0.22], offset: [2.0, -7.5, 0] },
      { range: [0.36, 0.66], offset: [8.0, -2.5, 0] },
      { range: [0.66, 1.0], offset: [4.5, -1.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.4,
    roleTag: '阶梯双排托举 16.2g 重弹柱 · 纵剖下精准承托最底发实弹',
    description:
      '高自润滑聚甲醛模压成型的鲜艳安全橙色双排防倾托弹板：宽大导向裙边与阶梯顶面平稳承托粗壮的 9×39mm SP-5/SP-6 重弹柱，确保在 900 发/分全自动应急齐射下仍实现零俯仰顺畅供弹。',
  },
  {
    id: 'vss_mag_spring',
    bomCode: 'M-03',
    nameZh: '矩形折弯高弹性钢制弹匣托弹簧',
    calloutLabel: '矩形钢制弹匣托弹簧',
    nameEn: 'Rectangular Zig-Zag Steel Magazine Drive Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [1.78, -10.9, 0],
    explodeSteps: [
      { range: [0.02, 0.22], offset: [2.0, -7.5, 0] },
      { range: [0.36, 0.66], offset: [8.0, -7.0, 0] },
      { range: [0.66, 1.0], offset: [4.5, -4.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.42,
    roleTag: '稳定托举 10 发重型亚音速穿甲弹 · 耐长期满弹压仓蠕变',
    description:
      '适配 10 发短匣腔的磷化矩形钢丝折弯托弹簧，即便在长期潜伏执勤满压 10 发 250 格令重弹的状态下依然保持持久回弹刚度。',
  },
  {
    id: 'vss_mag_floorplate',
    bomCode: 'M-04',
    nameZh: '冲压烤蓝钢制滑拆弹匣底盖',
    calloutLabel: '冲压钢滑拆弹匣底盖',
    nameEn: 'Stamped Blued-Steel Quick-Slide Magazine Floorplate',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [1.92, -12.6, 0],
    explodeSteps: [
      { range: [0.02, 0.22], offset: [2.0, -7.5, 0] },
      { range: [0.36, 0.66], offset: [1.0, -10.5, 0] },
      { range: [0.66, 1.0], offset: [0.5, -6.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.4,
    roleTag: '中心圆孔防脱锁柱 · 弹尖轻压即可滑盖清沙保养',
    description:
      '卡装于李子褐聚合物弹匣底轨的冷冲压烤蓝钢底座，中部设有托弹簧锁柱圆孔，野战时用一发 9×39mm 弹尖顶入锁孔即可免工具前滑拆解全匣清洁。',
  },
];

// ============================================================================
// 7-Phase VSS Vintorez Integral-Suppressed Linear-Striker Firing Cycle
// ============================================================================

export const VSS_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'vss_phase_1_linear_striker',
    stepNum: '01',
    shortLabel: '静音直线击铁前冲',
    title: '阶段 1 · 扣机释放阻铁，无击锤直线平移击铁轴向前冲敲击击针',
    range: [0.0, 0.1],
    description:
      '食指扣压弧形扳机拉低主阻铁，VSS 标志性的无击锤直线平移击铁在同轴主簧伸展驱动下沿膛轴直线前冲 8.5 mm，几乎零回弹噪声地干脆撞击 6 突笋枪机内的浮动长击针。',
  },
  {
    id: 'vss_phase_2_subsonic_bleed',
    stepNum: '02',
    shortLabel: '多孔泄气与6级消音',
    title: '阶段 2 · 9×39mm SP-5 亚音速重弹沿 200mm 多孔管泄压并穿越 6 级斜挡板',
    range: [0.1, 0.22],
    description:
      '底火于 f = 0.105 点燃发射药（275 MPa），推动 16.2 克（250 格令）重弹头沿 200 mm 枪管加速至 290 m/s 亚音速；掠过前段 3 排径向泄气孔时部分燃气率先泄入后膨胀舱，出管后又经 6 级 ±28° 不对称斜挡板涡旋消能，于 f = 0.22 悄然离口！',
  },
  {
    id: 'vss_phase_3_gas_unlock',
    stepNum: '03',
    shortLabel: '导气后推与6突笋旋锁',
    title: '阶段 3 · 消音筒内导气箍推动长行程活塞，4.5mm 自由行程后旋开 6 突笋枪机 32°',
    range: [0.22, 0.36],
    description:
      '膛内分流燃气冲击藏于消音筒上方的不锈钢导气活塞头，推动枪机框先行退过 4.5 mm 安全自由行程泄压，随后机框螺旋凸轮槽拨动枪机凸耳逆时针旋转 32°（0.56 rad），令 6 枚对称闭锁突笋脱离铣削机匣前节套并完成预抽壳。',
  },
  {
    id: 'vss_phase_4_recoil_recock_eject',
    stepNum: '04',
    shortLabel: '74mm后坐压铁抛壳',
    title: '阶段 4 · 自动机满行程后坐 74mm 压缩复进簧、同步压回直线击铁并右抛钢壳',
    range: [0.36, 0.56],
    description:
      '长行程枪机框携 6 突笋枪机同步高速后坐 74 mm，大幅压缩上方螺旋复进簧（压缩率达 66%），同时向后顶推直线平移击铁压缩主簧重新挂入主阻铁；f = 0.45 时机匣左侧固定抛壳挺将 9×39mm 涂漆钢壳向右（+Z）干脆抛出。',
  },
  {
    id: 'vss_phase_5_rear_dwell_lift',
    stepNum: '05',
    shortLabel: '尾端缓冲与托弹升位',
    title: '阶段 5 · 自动机于机匣尾壁柔和换向，10 发李子褐华夫弹匣上推新弹',
    range: [0.56, 0.66],
    description:
      '枪机框抵达机匣后端平稳换向减少撞击噪声；10 发双排聚合物弹匣内的安全橙色防倾托弹板在矩形托弹簧推动下将下一发 9×39mm 亚音速重弹顶升至钢衬抱弹口待命。',
  },
  {
    id: 'vss_phase_6_return_feed',
    stepNum: '06',
    shortLabel: '复进推弹入膛',
    title: '阶段 6 · 复进簧驱动枪机框前冲，6 突笋枪机剥离新弹平顺推入弹膛',
    range: [0.66, 0.84],
    description:
      '压缩蓄能的高寿命螺旋复进簧平稳伸展，驱动长行程枪机框与 6 突笋枪机凌厉前冲，枪机下缘剥离弹匣首枚 9×39mm SP-5 实弹沿供弹坡道顺滑推入 200 mm 冷锻枪管弹膛。',
  },
  {
    id: 'vss_phase_7_6lug_lock_reset',
    stepNum: '07',
    shortLabel: '6突笋旋闭与阻铁复位',
    title: '阶段 7 · 6 突笋正旋 32° 对称刚性闭锁，直线击铁与单发断连器精准复位',
    range: [0.84, 1.0],
    description:
      '新弹完全贴合膛底后，继续前行的枪机框经螺旋凸轮强制枪机顺时针回转 32°（-0.56 rad），6 枚闭锁突笋严密锁死于机匣承力面；松开弧形扳机，单发断连器将直线平移击铁稳稳交接回主阻铁完成待击闭环。',
  },
];

const VSS_UNLOCK_RAD = 0.56; // 32.1° 6-lug symmetric bolt rotation (>= 0.50 rad!)
const VSS_FREE_DWELL = 0.45; // 4.5 mm carrier free-travel safety dwell
const VSS_CAM_STROKE = 1.05; // 10.5 mm helical cam rotation stroke
const VSS_MAX_STROKE = 7.4; // 74 mm (7.4 cm) full bolt carrier rearward stroke (<= -6.5 cm!)

interface VssActionSample {
  carrierDX: number;
  boltDX: number;
  boltRX: number;
}

function sampleVssOperatingGroup(f: number): VssActionSample {
  let s = 0;
  if (f >= 0.22 && f < 0.26) {
    s = VSS_FREE_DWELL * seg(f, 0.22, 0.26);
  } else if (f >= 0.26 && f < 0.36) {
    s = VSS_FREE_DWELL + VSS_CAM_STROKE * seg(f, 0.26, 0.36);
  } else if (f >= 0.36 && f < 0.54) {
    s =
      VSS_FREE_DWELL +
      VSS_CAM_STROKE +
      (VSS_MAX_STROKE - (VSS_FREE_DWELL + VSS_CAM_STROKE)) * seg(f, 0.36, 0.54);
  } else if (f >= 0.54 && f < 0.64) {
    s = VSS_MAX_STROKE;
  } else if (f >= 0.64 && f < 0.82) {
    s =
      VSS_MAX_STROKE -
      (VSS_MAX_STROKE - (VSS_FREE_DWELL + VSS_CAM_STROKE)) * seg(f, 0.64, 0.82);
  } else if (f >= 0.82 && f < 0.89) {
    s = VSS_FREE_DWELL + VSS_CAM_STROKE * (1.0 - seg(f, 0.82, 0.89));
  } else if (f >= 0.89 && f < 0.93) {
    s = VSS_FREE_DWELL * (1.0 - seg(f, 0.89, 0.93));
  }

  const carrierDX = -s;
  if (s <= VSS_FREE_DWELL + 1e-7) {
    return { carrierDX, boltDX: 0, boltRX: 0 };
  }
  if (s <= VSS_FREE_DWELL + VSS_CAM_STROKE) {
    const u = smoothstep01((s - VSS_FREE_DWELL) / VSS_CAM_STROKE);
    return {
      carrierDX,
      boltDX: -0.18 * u,
      boltRX: VSS_UNLOCK_RAD * u,
    };
  }
  return {
    carrierDX,
    boltDX: -0.18 - (s - (VSS_FREE_DWELL + VSS_CAM_STROKE)),
    boltRX: VSS_UNLOCK_RAD,
  };
}

/**
 * Computes linear striker forward slam (+0.85 cm), recoil re-cock compression (-1.45 cm),
 * and gentle sear handoff reset back to 0.0 cm!
 */
function sampleVssLinearStrikerDX(f: number): number {
  const slamFwd = seg(f, 0.045, 0.095);
  const recockBack = seg(f, 0.34, 0.54);
  const catchReturn = seg(f, 0.66, 0.84);
  const searSettle = seg(f, 0.91, 0.97);
  // Rest/cocked = 0 -> slams forward to +0.85 -> pushed back to -1.45 at full recoil ->
  // stops on disconnector at -0.15 -> settles smoothly back onto primary sear at 0.0!
  return (
    0.85 * slamFwd -
    2.3 * recockBack +
    1.3 * catchReturn +
    0.15 * searSettle
  );
}

export function computeVssFiringKinematics(
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

  const { carrierDX, boltDX, boltRX } = sampleVssOperatingGroup(f);
  const strikerDX = sampleVssLinearStrikerDX(f);

  switch (partId) {
    case 'vss_bolt_carrier': {
      dx = carrierDX;
      break;
    }

    case 'vss_bolt': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'vss_firing_pin': {
      const strike = seg(f, 0.075, 0.105) - seg(f, 0.145, 0.21);
      dx = boltDX + 0.34 * strike;
      break;
    }

    case 'vss_recoil_spring': {
      // Local spring spans [-5.0, +6.2] (L0 = 11.2 cm), rear end pinned at x = -5.0 (world X = -11.4):
      // Compresses cleanly from 11.2 -> 3.8 cm (`scaleX: 1.000 -> 0.339`) as carrier strokes -7.4 cm!
      const pinAnchorX = -5.0;
      const L0 = 11.2;
      const LNew = Math.max(3.4, L0 + carrierDX);
      scaleX = LNew / L0;
      dx = pinAnchorX * (1 - scaleX);
      break;
    }

    case 'vss_striker': {
      // Signature hammerless LINEAR striker forward slam (+0.85 cm) & rearward recoil re-cock (-1.45 cm)!
      dx = strikerDX;
      break;
    }

    case 'vss_striker_spring': {
      // Local spring spans [-2.4, +2.4] (L0 = 4.8 cm), rear end pinned at x = -2.4 (world X = -11.6):
      // Expands to 1.177 on forward slam, compresses to 0.698 during recoil re-cock!
      const pinAnchorX = -2.4;
      const L0 = 4.8;
      const LNew = Math.max(2.6, L0 + strikerDX);
      scaleX = LNew / L0;
      dx = pinAnchorX * (1 - scaleX);
      break;
    }

    case 'vss_trigger': {
      const pull = seg(f, 0.0, 0.075) - seg(f, 0.9, 0.97);
      rz = -0.22 * pull;
      break;
    }

    case 'vss_sear': {
      // Sear drops downward (-0.28 cm) to release linear striker, then rises to catch recocked striker
      const drop = seg(f, 0.025, 0.07) - seg(f, 0.38, 0.5);
      const resetPulse = Math.sin(linearSeg(f, 0.89, 0.97) * Math.PI);
      dy = -0.28 * drop - 0.06 * resetPulse;
      rz = 0.08 * drop;
      break;
    }

    case 'vss_mag_follower': {
      const lift = seg(f, 0.62, 0.75) - seg(f, 0.78, 0.86);
      dy = 0.42 * lift;
      break;
    }

    // Fixed 200mm ported barrel, 6-stage baffle stack, suppressor tube, milled receiver,
    // laminated birch stock, PSO-1 scope, guide rod, and static mag components stay stationary!
    default:
      break;
  }

  const snap0 = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  return {
    pos: [snap0(dx), snap0(dy), dz],
    rot: [snap0(rx), ry, snap0(rz)],
    scaleX: Math.abs(scaleX - 1) < 1e-9 ? 1 : scaleX,
  };
}

/**
 * Computes `9×39mm SP-5/SP-6` (250 gr / 16.2 g subsonic, 290 m/s, 275 MPa) integral-suppressed ballistics:
 *  - Ignition at `f = 0.105` inside chamber `[6.2, 1.05, 0]`;
 *  - Projectile travels down 200 mm radial-ported barrel (`X: 6.2 -> 26.0`) bleeding gas into suppressor
 *    expansion chamber (`gasPortFlashIntensity` active across `[0.15, 0.25]` at `X = 17.6, Y = 2.30`),
 *    then passes through the 6-stage slanted baffle core (`X: 26.0 -> 47.4`, exiting silently at `f = 0.22`);
 *  - Spent 39 mm lacquered-steel case extracts with `boltDX` `[0.26, 0.45]` & ejects right `+Z` at `f = 0.45`;
 *  - Next 9×39mm cartridge lifts from 10-round plum waffle magazine `[2.15, -0.75, 0]` into chamber `[6.2, 1.05, 0]`.
 */
export function computeVssBallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const { boltDX } = sampleVssOperatingGroup(f);

  // 1. 9×39mm SP-5 250gr Subsonic Projectile along bore Y = +1.05 (exits integral suppressor X = 47.4 at f = 0.22!)
  const bulletVisible = f < 0.42;
  let bulletX = 7.4;
  let streakLength = 0;

  if (f >= 0.105 && f < 0.22) {
    const u = Math.pow(linearSeg(f, 0.105, 0.22), 1.3);
    bulletX = 7.4 + (47.4 - 7.4) * u;
    streakLength = 3.2 * u;
  } else if (f >= 0.22 && f < 0.42) {
    const u = linearSeg(f, 0.22, 0.42);
    bulletX = 47.4 + 44.0 * u; // Subsonic 290 m/s dignified heavy-bullet trail
    streakLength = 5.4 * (1 - u * 0.45);
  }

  // 2. Spent 9×39mm Steel-Lacquered Case — Extracted [0.26, 0.45] & Ejected Right (+Z) at f = 0.45!
  const spentCaseVisible = f < 0.78;
  let caseX = 6.2;
  let caseY = VSS_BORE_Y;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.26 && f < 0.45) {
    caseX = 6.2 + boltDX;
  } else if (f >= 0.45 && f < 0.78) {
    const u = linearSeg(f, 0.45, 0.78);
    const xAtEject = 6.2 + sampleVssOperatingGroup(0.45).boltDX;
    caseX = xAtEject + 3.4 * u;
    caseY = VSS_BORE_Y + 6.8 * u - 11.6 * u * u;
    caseZ = 13.8 * u;
    caseRX = u * 7.4;
    caseRY = -u * 10.8;
    caseRZ = -u * 8.6;
    if (f > 0.65) {
      spentCaseOpacity = 1 - linearSeg(f, 0.65, 0.78);
    }
  }

  // 3. Chamber Flash, Integral Barrel Gas-Port Bleed Flash & Heavily Suppressed Minimal Muzzle Plume!
  let chamberFlashIntensity = 0;
  if (f >= 0.1 && f <= 0.175) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.1, 0.175) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.15 && f <= 0.255) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.15, 0.255) * Math.PI);
  }

  // Integral 6-stage baffle suppressor suppresses nearly all flash — only a soft whisper of low-pressure gas!
  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.215 && f <= 0.29) {
    const u = linearSeg(f, 0.215, 0.29);
    muzzlePlumeScale = 0.18 + 0.42 * Math.pow(u, 0.6);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.28;
  }

  // 4. Next 9×39mm Cartridge from 10-Rd Plum Waffle Magazine [1.95, -0.75, 0] -> Chamber [6.2, 1.05, 0]
  let nextX = 1.95;
  let nextY = -0.75;
  let nextRZ = 0.12;

  if (f >= 0.56 && f < 0.66) {
    const u = seg(f, 0.56, 0.66);
    nextX = 1.95 + 0.35 * u;
    nextY = -0.75 + 0.55 * u;
    nextRZ = 0.12 + 0.06 * u;
  } else if (f >= 0.66 && f < 0.84) {
    const u = seg(f, 0.66, 0.84);
    nextX = 2.3 + (6.2 - 2.3) * u;
    nextY = -0.2 + (VSS_BORE_Y - -0.2) * u;
    nextRZ = 0.18 * (1 - u);
  } else if (f >= 0.84) {
    nextX = 6.2;
    nextY = VSS_BORE_Y;
    nextRZ = 0;
  }

  // 5. Reserve 9×39mm Cartridge advancing cleanly inside 10-Rd Plum Magazine
  const magShift = seg(f, 0.62, 0.76);
  const resX = 1.88 + (1.95 - 1.88) * magShift;
  const resY = -1.52 + (-0.75 - -1.52) * magShift;
  const resZ = 0.18 * (1 - magShift);

  return {
    bulletVisible,
    bulletPos: [bulletX, VSS_BORE_Y, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [17.6, VSS_PISTON_Y, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, resZ],
  };
}

// ============================================================================
// Direct V3.0 Cycles-Baked 2K 5-Channel Packed ORM PBR Suites (9 WebP Textures)
// ============================================================================

const VSS_V3_RECEIVER_SUPP_PBR: PbrBindingSpec = {
  albedoFile: 'vss_v3_receiver_supp_albedo.webp',
  normalFile: 'vss_v3_receiver_supp_normal.webp',
  roughnessFile: 'vss_v3_receiver_supp_roughness.webp',
  normalScale: 0.88,
};

const VSS_V3_WOOD_OPTIC_PBR: PbrBindingSpec = {
  albedoFile: 'vss_v3_wood_optic_albedo.webp',
  normalFile: 'vss_v3_wood_optic_normal.webp',
  roughnessFile: 'vss_v3_wood_optic_roughness.webp',
  normalScale: 0.9,
};

const VSS_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'vss_v3_metal_albedo.webp',
  normalFile: 'vss_v3_metal_normal.webp',
  roughnessFile: 'vss_v3_metal_roughness.webp',
  normalScale: 0.84,
};

export const VSS_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  // Suite 1 — Receiver, Suppressor Tube, Dust Cover, Sight, Safety, Selector & Plum Forend (7 parts)
  vss_receiver: VSS_V3_RECEIVER_SUPP_PBR,
  vss_dust_cover: VSS_V3_RECEIVER_SUPP_PBR,
  vss_suppressor_tube: VSS_V3_RECEIVER_SUPP_PBR,
  vss_rear_sight: VSS_V3_RECEIVER_SUPP_PBR,
  vss_safety_lever: VSS_V3_RECEIVER_SUPP_PBR,
  vss_selector_switch: VSS_V3_RECEIVER_SUPP_PBR,
  vss_forend: VSS_V3_RECEIVER_SUPP_PBR,

  // Suite 2 — Laminated Birch Stock, PSO-1M2-1 Scope (Firewalled Lenses), Plum Mag & Orange Follower (4 parts)
  vss_wood_stock: VSS_V3_WOOD_OPTIC_PBR,
  vss_pso1_scope: VSS_V3_WOOD_OPTIC_PBR,
  vss_mag_body: VSS_V3_WOOD_OPTIC_PBR,
  vss_mag_follower: VSS_V3_WOOD_OPTIC_PBR,

  // Suite 3 — Perforated Barrel, 6-Stage CNC Baffle Stack, 6-Lug Bolt, Linear Striker & Internals (11 parts)
  vss_barrel: VSS_V3_METAL_PBR,
  vss_baffle_stack: VSS_V3_METAL_PBR,
  vss_bolt_carrier: VSS_V3_METAL_PBR,
  vss_bolt: VSS_V3_METAL_PBR,
  vss_striker: VSS_V3_METAL_PBR,
  vss_firing_pin: VSS_V3_METAL_PBR,
  vss_recoil_guide: VSS_V3_METAL_PBR,
  vss_trigger: VSS_V3_METAL_PBR,
  vss_sear: VSS_V3_METAL_PBR,
  vss_mag_spring: VSS_V3_METAL_PBR,
  vss_mag_floorplate: VSS_V3_METAL_PBR,
};

export const VSS_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'vss_v3_receiver_supp',
    weapon: VSS_ID,
    titleCn:
      '图拉兵工厂 CNC 铣削烤蓝钢机匣、414mm 整体消音外筒与深李子褐护木贴图组',
    partTag: 'F-01 / F-02 / F-03 / F-04 / F-05 / FC-05 / FC-06',
    resolution: '2048 × 2048 px (Cycles V3)',
    summary:
      '通过 Blender 5.2 Cycles GPU 离线烘焙的 2K 5 通道 Packed ORM 贴图组：精细呈现苏联图拉兵工厂（ТОЗ）CNC 铣削锻钢机匣缎面烤蓝光泽与边角露白、清晰西里尔钢印「ВСС «ВИНТОРЕЗ» · 9×39 · № 87412」与三角五角星厂徽、414 mm 整体消音外筒哑光烤蓝与 100–400m 标尺数字、三加强肋冲压机匣盖以及深李子褐（Plum）玻纤聚合物下护木防滑纹。',
    highlights: [
      '图拉兵工厂 TOZ 三角星徽与西里尔铭文「ВСС «ВИНТОРЕЗ» · 9×39 · № 87412」无畸变 Hero UV',
      'AgX 真铁校准缎面烤蓝钢（sRGB 0.21–0.27, M=0.86, R=0.30–0.38）与深李子褐玻纤护木分层',
      '400m 弧形标尺数字「1 · 2 · 3 · 4」与右侧防尘保险/横推快慢机「ОД / АВ」精细标识',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'vss_v3_receiver_supp_albedo.webp',
        note: 'sRGB · 缎面苏联烤蓝钢机匣 / 整体消音筒 / TOZ西里尔钢印 / 深李子褐防滑护木',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'vss_v3_receiver_supp_normal.webp',
        note: 'Linear · Cycles 高模倒角 + CNC 刀痕 + 凹刻西里尔铭文与 400m 标尺刻度',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'vss_v3_receiver_supp_roughness.webp',
        note: 'Linear · R:Cycles 接触阴影AO / G:烤蓝钢(0.32)-哑光消音筒(0.38)-聚合物(0.62) / B:金属度',
      },
    ],
  },
  {
    id: 'vss_v3_wood_optic',
    weapon: VSS_ID,
    titleCn:
      '俄制桦木层压镂空枪托、PSO-1M2-1 4×24 光学瞄准镜与李子褐华夫弹匣贴图组',
    partTag: 'F-06 / F-07 / M-01 / M-02 LAMINATED BIRCH & PSO-1',
    resolution: '2048 × 2048 px (Cycles V3)',
    summary:
      '集结 VSS 最具辨识度的视觉地标：采用 3D 空间程序化多层胶合木纹烘焙手擦琥珀蜜色俄罗斯桦木层压镂空枪托（清晰呈现交替深浅层压线条、实木导管微孔与橡胶缓冲垫）；锤纹灰烤漆 PSO-1M2-1 侧装瞄准镜镌刻西里尔「ПСО-1М2-1 · 9×39」铭文、1–4 弹道补偿手轮，并配备 >= 50 px UV 防火墙隔离的绿宝石-蓝宝石多层镀膜镜片与高可视安全橙色托弹板。',
    highlights: [
      '琥珀蜜色俄罗斯桦木层压镂空枪托交替斜纹、亚麻油温润包浆与橡胶缓冲托垫',
      'PSO-1M2-1 锤纹灰烤漆镜体、西里尔铭文「ПСО-1М2-1 9×39」及 1–4 亚音速弹道鼓轮',
      '>= 50 px UV 防火墙零渗色隔离：绿宝石-蓝宝石增透镀膜镜片 + 鲜橙色防倾托弹板',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'vss_v3_wood_optic_albedo.webp',
        note: 'sRGB · 琥珀层压桦木枪托 / 锤纹灰PSO-1瞄准镜 / 绿宝石镜片 / 李子褐华夫弹匣与安全橙托弹板',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'vss_v3_wood_optic_normal.webp',
        note: 'Linear · 桦木层压纤维毛孔 + 锤纹灰漆面微颗粒 + 华夫弹匣网格肋与橡胶眼罩褶皱',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'vss_v3_wood_optic_roughness.webp',
        note: 'Linear · R:Cycles AO / G:光学镀膜(0.05)-油润桦木(0.42)-橡胶(0.84) / B:金属度分层',
      },
    ],
  },
  {
    id: 'vss_v3_metal',
    weapon: VSS_ID,
    titleCn:
      '6 级斜挡板声学消音芯、200mm 多孔泄气枪管、6 突笋旋转枪机与直线击铁贴图组',
    partTag: '11 INTERNAL CUTAWAY ORDNANCE & ACOUSTIC PARTS',
    resolution: '2048 × 2048 px (Cycles V3)',
    summary:
      '专为 CT 实时纵剖（[C]）与爆炸图打造的内部机械与声学精密件 2K 5 通道 ORM 贴图组：展现闪亮 CNC 拉丝不锈钢 6 级斜挡板声学消音芯（叠加柔和发射药燃气热渍与碳烟渐变）、3 排径向泄气孔冷锻镀铬枪管、6 突笋精密旋转枪机、长行程镀铬活塞、无击锤直线平移击铁、阻铁以及弹匣矩形钢簧与钢底盖。',
    highlights: [
      'CNC 拉丝不锈钢 6 级不对称斜挡板声学消音芯与真实微声燃气碳烟热渍渐变',
      '200mm 径向多孔泄气枪管镀铬内膛、车削刀纹与拉丝亮白 6 突笋精密旋转枪机',
      '无击锤直线平移击铁、同轴击针、阻铁连杆与钢制弹匣组件高光反差',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'vss_v3_metal_albedo.webp',
        note: 'sRGB · 拉丝不锈钢6级消音芯 / 碳烟渐变 / 6突笋亮白枪机 / 烤蓝枪机框与多孔枪管',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'vss_v3_metal_normal.webp',
        note: 'Linear · 车削环纹 + CNC 铣削刀痕 + 6 级斜挡板高模倒角与拉丝纹理',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'vss_v3_metal_roughness.webp',
        note: 'Linear · R:Cycles AO / G:精磨6突笋枪机(0.18)-消音芯(0.24)-碳烟(0.76) / B:高纯金属度',
      },
    ],
  },
];

export const VSS_PLUGIN: WeaponRuntimePlugin = {
  id: VSS_ID,
  partGroups: VSS_PART_GROUPS,
  timelinePresets: VSS_TIMELINE_PRESETS,
  parts: VSS_PARTS,
  firingPhases: VSS_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(VSS_FIRING_PHASES, f),
  computeFiringKinematics: computeVssFiringKinematics,
  computeBallisticsState: computeVssBallisticsState,
  pbrBindings: VSS_PBR_BINDINGS,
  pbrSuites: VSS_PBR_SUITES,
};
