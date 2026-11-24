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

export const MG42_ID: WeaponId = 'mg42' as WeaponId;
export const MG42_CALIBER: CaliberProfile = '792_mauser' as CaliberProfile;

export const MG42_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '530mm快拆枪管、枪口助退器与双滚柱短后坐闭锁机组',
    nameEn: '530mm Quick-Change Barrel, Recoil Booster & Twin-Roller BCG',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '冲压多孔散热护筒机匣、铰接顶盖、高射蛛网照门与两脚架枪托组',
    nameEn: 'Stamped Perforated Shroud Receiver, Top Cover, AA Sight & Bipod',
    badgeColor: '#94a3b8',
  },
  {
    key: 'fire_control',
    nameZh: '冲压胶木握把座、全自动连发扳机与重型开膛阻铁组',
    nameEn: 'Stamped Bakelite Grip Frame, Full-Auto Trigger & Open-Bolt Sear',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: 'S型凸轮双向拨弹爪、受弹器、Gurt 34钢链与50发突击弹鼓组',
    nameEn: 'S-Cam Shuttle Feed Pawls, Feed Tray, Gurt 34 Belt & 50-Rd Drum',
    badgeColor: '#4ade80',
  },
];

export const MG42_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '开膛待击合拢态',
    subLabel: '0% Open-Bolt Ready',
    t: 0,
    desc: '二战德制 MG 42 通用机枪（Maschinengewehr 42，全长 1,220 mm，理论射速 1,200 发/分）标准开膛待击态：550 克重型机框与双对称滚柱闭锁机头挂于后方开膛阻铁，枪管节套敞开散热，左侧 50 发 Gurttrommel 34 突击弹鼓携 7.92×57mm 毛瑟弹链待命。',
  },
  {
    id: 'field_strip',
    label: '一级野战快拆换管',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '按德军 H.Dv. 181/2 教范免工具快拆：掀开顶盖卸除 50 发弹鼓与钢链；前推右侧铰接枪管锁门 5 秒侧抽炽热 530 mm 枪管；旋转 90° 卸下胶木枪托与环簧缓冲器，后抽复进簧与滚柱枪机组。',
  },
  {
    id: 'sub_assembly',
    label: '二级滚柱与供弹细拆',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '分解滚柱机头内左右两枚淬火闭锁滚柱与击针开闭锁楔铁，拆离顶盖内 S 型凸轮双级拨弹滑板，旋下枪口锥形助退器，并展开两脚架与握把开膛火控盒。',
  },
  {
    id: 'full_exploded',
    label: '全枪 25 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 25 个 1:1 军械构件零干涉展开：从 530 mm 快拆枪管、锥形枪口助退器、金属冲压多孔散热护筒、维尔纳·格鲁纳双滚柱对称闭锁系统到双向 S 槽高速输弹机，全景诠释现代通用机枪鼻祖。',
  },
];

export const MG42_PARTS: WeaponPartSpec[] = [
  // ==================== 1. BARREL, BOOSTER, LATCH & ROLLER-LOCK BCG ('slide' · 12 parts) ====================
  {
    id: 'mg42_barrel',
    bomCode: 'B-01',
    nameZh: '530mm快拆线膛枪管与方形闭锁节套总成',
    calloutLabel: '530mm快拆枪管与节套',
    nameEn: '530mm Quick-Change Rifled Barrel & Forged Locking Extension',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [44.5, 1.5, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [8.5, 4.8, 12.0] },
      { range: [0.35, 0.65], offset: [5.5, 2.2, 5.5] },
      { range: [0.68, 0.96], offset: [3.5, 1.5, 3.0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [6.0, 1.2, 0],
    labelAppearAt: 0.05,
    roleTag: '530mm 7.92×57mm四膛线 · 8.5mm短后坐行程 · 5秒右侧滑抽换热管',
    description:
      '全长 530 mm 铬钼合金钢精锻枪管，尾端刚性旋固方形锻钢闭锁节套（Verriegelungsstück），节套左右内壁精铣双滚柱闭锁凹槽。发射时在枪口助退器推动下与枪机同步短后坐 8.5 mm；连续扫射 250 发过热时可从右侧铰接换管门 5 秒免工具抽换。',
  },
  {
    id: 'mg42_muzzle_booster',
    bomCode: 'B-02',
    nameZh: '锥形枪口反冲助退器与喇叭消焰罩(Rückstoßverstärker)',
    calloutLabel: '锥形枪口反冲助退器',
    nameEn: 'Conical Muzzle Recoil Booster & Flash Suppressor Cone',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [76.5, 1.5, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [16.5, 2.5, 0] },
      { range: [0.36, 0.64], offset: [12.0, 1.5, 0], rotation: [0.8, 0, 0] },
      { range: [0.68, 0.96], offset: [6.0, 0.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.14,
    roleTag: '截留枪口高压尾流猛推枪管后坐 · 成就1,200发/分希特勒电锯射速',
    description:
      '旋锁在冲压护筒最前端的锥形膨气室与消焰喇叭筒：弹头穿出枪口瞬间，内部节流杯截留高压火药燃气反冲枪管端面，为短后坐枪管注入充沛额外后坐动能，确保冰冻泥泞工况下仍维持 1,200 发/分恐怖射速。',
  },
  {
    id: 'mg42_barrel_latch',
    bomCode: 'B-03',
    nameZh: '右侧铰接式快拆换管侧门与弹簧锁柄',
    calloutLabel: '右侧快拆换管铰接门',
    nameEn: 'Right-Flank Hinged Quick-Change Barrel Latch Door',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [21.2, 1.5, 2.35],
    explodeSteps: [
      {
        range: [0.04, 0.22],
        offset: [0.5, 0.5, 6.2],
        rotation: [0, 0.45, 0],
      },
      {
        range: [0.36, 0.64],
        offset: [1.5, -1.2, 5.2],
        rotation: [0, -0.45, 0],
      },
      { range: [0.68, 0.96], offset: [1.0, -0.6, 2.5] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.08,
    roleTag: '前推锁柄侧翻开门同步顶出烫管 · 单人戴防烫垫5秒完成换管',
    description:
      'MG 42 取代 MG 34 复杂旋转机匣的天才工程革新：位于冷却护筒后右侧（+Z）的冲压钢铰接侧门。只需向前按下锁扣向外扳开，门内凸轮自动将炽热枪管尾端向右侧拨出槽口，副射手顺势抽出旧管推入冷管合门即刻恢复倾泻火力。',
  },
  {
    id: 'mg42_bolt_head',
    bomCode: 'B-04',
    nameZh: '滚柱闭锁圆柱机头(含弹簧抽壳钩与纵置抛壳顶杆)',
    calloutLabel: '双滚柱闭锁机头',
    nameEn: 'Twin-Roller Locking Bolt Head w/ Extractor & Plunger Ejector',
    group: 'slide',
    material: 'stainless',
    assembledPos: [10.0, 1.5, 0],
    explodeSteps: [
      { range: [0.14, 0.29], offset: [-16.0, 5.8, 0] },
      { range: [0.36, 0.64], offset: [6.5, 5.4, 0] },
      { range: [0.68, 0.96], offset: [3.2, 2.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.24,
    roleTag: '不旋转直线高速往复 · 两侧开窗容纳对称淬火闭锁滚柱',
    description:
      '采用镍铬合金钢精密铣削的非旋转式直线机头：两侧对称开设矩形滚柱滑窗，前端装有重型弹簧爪抽壳钩，中部贯穿下推式抛壳顶杆——后坐撞击缓冲推杆时垂直向下（-Y）从机匣腹窗猛烈抛出空铜壳。',
  },
  {
    id: 'mg42_locking_rollers',
    bomCode: 'B-05',
    nameZh: '右侧(+Z)对称硬化闭锁滚柱',
    calloutLabel: '右侧对称闭锁滚柱',
    nameEn: 'Right-Side (+Z) Hardened Steel Symmetric Locking Roller',
    group: 'slide',
    material: 'stainless',
    assembledPos: [10.8, 1.5, 0.92],
    explodeSteps: [
      { range: [0.14, 0.29], offset: [-16.0, 5.8, 0] },
      { range: [0.36, 0.64], offset: [6.5, 5.4, 5.8] },
      { range: [0.68, 0.96], offset: [3.2, 2.6, 3.2] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.36,
    roleTag: '高铬轴承钢淬火柱体 · 受击针楔铁外顶死锁节套承压390 MPa',
    description:
      '维尔纳·格鲁纳（Werner Gruner）滚柱刚性闭锁架构的核心右滚柱：由高硬度轴承钢无心磨削成型。枪机抵拢膛口后，中央击针楔铁前冲将其沿 +Z 向外顶入枪管节套闭锁凹槽；短后坐 8.5 mm 后由机匣固定开锁斜面强行挤回机头内开锁。',
  },
  {
    id: 'mg42_locking_roller_left',
    bomCode: 'B-06',
    nameZh: '左侧(-Z)对称硬化闭锁滚柱',
    calloutLabel: '左侧对称闭锁滚柱',
    nameEn: 'Left-Side (-Z) Hardened Steel Symmetric Locking Roller',
    group: 'slide',
    material: 'stainless',
    assembledPos: [10.8, 1.5, -0.92],
    explodeSteps: [
      { range: [0.14, 0.29], offset: [-16.0, 5.8, 0] },
      { range: [0.36, 0.64], offset: [6.5, 5.4, -5.8] },
      { range: [0.68, 0.96], offset: [3.2, 2.6, -3.2] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.36,
    roleTag: '与右滚柱180°对称均衡承力 · 零横向偏心弯矩提升射弹密集度',
    description:
      '与右侧滚柱完全镜像对称的左侧闭锁滚柱：双向同步外撑刚性锁入枪管节套左侧凹槽，将 7.92×57mm 毛瑟全威力弹的 390 MPa 剧烈后坐推力均衡分摊至轴线两侧，消除了传统单侧偏转闭锁的枪管跳动。',
  },
  {
    id: 'mg42_locking_wedge',
    bomCode: 'B-07',
    nameZh: '击针与斜楔闭锁驱动铁总成(Steuerstück)',
    calloutLabel: '击针斜楔闭锁驱动铁',
    nameEn: 'Firing Pin & Beveled Roller-Camming Locking Wedge',
    group: 'slide',
    material: 'stainless',
    assembledPos: [7.8, 1.5, 0],
    explodeSteps: [
      { range: [0.14, 0.29], offset: [-16.0, 5.8, 0] },
      { range: [0.36, 0.64], offset: [-0.5, 7.6, 0] },
      { range: [0.68, 0.96], offset: [-0.8, 3.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.36,
    roleTag: '双斜面楔顶开双滚柱同步刺出击针 · 机械本质零未闭锁早发',
    description:
      '固定于机框前端的一体式斜楔开闭锁件与高韧性击针组件：复进最后 7.5 mm 楔形斜面同时把左右滚柱向外撑入节套闭锁，唯有双滚柱彻底锁死瞬间，楔端击针尖才同步探出机头镜面引燃底火；短后坐开锁时内缩滚柱反向猛推斜面把动能传递给机框！',
  },
  {
    id: 'mg42_bolt_carrier',
    bomCode: 'B-08',
    nameZh: '550克重型往复枪机框(含顶部拨弹滚轮柱与防反弹配重)',
    calloutLabel: '重型机框与顶部拨弹柱',
    nameEn: '550g Reciprocating Bolt Carrier w/ Top S-Cam Feed Stud',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [4.2, 1.5, 0],
    explodeSteps: [
      { range: [0.14, 0.29], offset: [-16.0, 5.8, 0] },
      { range: [0.36, 0.64], offset: [-7.2, 2.2, 0] },
      { range: [0.68, 0.96], offset: [-4.5, 1.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0.4, 1.9, 0],
    labelAppearAt: 0.16,
    roleTag: '顶部竖直钢柱直驱S型输弹槽 · 内部钨钢惯性防反弹块杜绝空击',
    description:
      'MG 42 超高射速的惯性心脏（标准重 550 克，战后改进可配重调速）：顶部竖立硬化钢制驱动滚轮柱直接嵌入顶盖 S 型凸轮槽实现双向不停顿输弹；内部藏有惯性延迟防反弹块，抵消高速闭锁撞击回弹以防击针轻敲哑火。',
  },
  {
    id: 'mg42_charging_handle',
    bomCode: 'B-09',
    nameZh: '右侧滑槽非随动折叠T型拉机柄',
    calloutLabel: '右侧T型折叠拉机柄',
    nameEn: 'Right-Flank Non-Reciprocating Folding T-Handle Charging Slide',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [5.5, 1.5, 2.72],
    explodeSteps: [
      { range: [0.12, 0.26], offset: [2.0, 2.0, 6.4] },
      { range: [0.68, 0.96], offset: [1.2, 1.2, 3.6] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.16,
    roleTag: '冲压T型握把拉栓挂机后推回前卡位 · 1,200发/分扫射全程静止',
    description:
      '沿机匣右侧冲压长槽滑动的折叠式 T 型钢拉机柄：装弹前向后猛拉到底将重型机框挂上开膛阻铁，随后前推回锁位——连发狂飙期间枪机每秒往返 20 次而外部拉机柄纹丝不动。',
  },
  {
    id: 'mg42_recoil_spring',
    bomCode: 'B-10',
    nameZh: '多股绞合高耐疲劳螺旋复进驱动主簧',
    calloutLabel: '多股绞合复进主簧',
    nameEn: 'Multi-Strand Braided High-Endurance Helical Driving Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-5.5, 1.5, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [-26.0, 8.8, 0] },
      { range: [0.36, 0.64], offset: [-10.5, 3.0, 0] },
      { range: [0.68, 0.96], offset: [-6.0, 2.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.16,
    roleTag: '三股钢丝绞合抗共振断裂 · 高速蓄能驱动20Hz往复循环',
    description:
      '经典德军三股细琴钢丝互绞绕制而成的超长复进簧：相比单股簧具有天然内摩擦阻尼，彻底抑制 1,200 发/分高频往复下的弹簧驻波共振断裂，在开膛释放瞬间以凌厉加速推动枪机组剥弹闭锁。',
  },
  {
    id: 'mg42_recoil_buffer',
    bomCode: 'B-11',
    nameZh: '机匣尾座摩擦环簧高速后坐缓冲器总成(Puffer)',
    calloutLabel: '尾座高速回弹缓冲器',
    nameEn: 'Rear Twist-Lock Friction-Ring Recoil Buffer Assembly',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-15.2, 1.5, 0],
    explodeSteps: [
      { range: [0.1, 0.26], offset: [-16.0, 3.6, 0] },
      { range: [0.36, 0.64], offset: [-6.5, 1.6, 0] },
      { range: [0.68, 0.96], offset: [-4.5, 1.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.32,
    roleTag: '高弹性锥环摩擦缓冲柱塞 · 瞬间将机框撞击能量转为前冲回弹',
    description:
      '嵌装在旋锁尾盖内的 MG 42 高速后坐缓冲器：当高速后退的 550 克机框越过阻铁撞击缓冲柱塞时，内部成对锥面钢环在高压下径向胀紧摩擦吸能并迅速反向弹射机框，极大缩短后死点停留时间。',
  },
  {
    id: 'mg42_buffer_spring',
    bomCode: 'B-12',
    nameZh: '尾座重型高刚度回弹缓冲压簧',
    calloutLabel: '尾座高刚度缓冲主簧',
    nameEn: 'Heavy Rear Buffer High-Rate Rebound Coil Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-16.4, 1.5, 0],
    explodeSteps: [
      { range: [0.1, 0.26], offset: [-22.5, 3.6, 0] },
      { range: [0.36, 0.64], offset: [-8.5, 1.6, 0] },
      { range: [0.68, 0.96], offset: [-5.5, 1.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.38,
    roleTag: '超粗线径高刚度缓冲压簧 · 承受每秒20次重机框满载撞击',
    description:
      '配合摩擦环缓冲器工作的高刚度粗线径缓冲压簧：在枪机后坐越程最后 26 mm 区间剧烈压缩 42%，保护冲压钢尾座不开裂的同时将后坐能量高效转化为下一次复进初速度。',
  },

  // ==================== 2. STAMPED SHROUD RECEIVER, TOP COVER, AA SIGHT, BIPOD & STOCK ('frame' · 5 parts) ====================
  {
    id: 'mg42_receiver_shroud',
    bomCode: 'F-01',
    nameZh: '一体冷冲压钢机匣与多孔矩形散热枪管护筒(含折叠前准星)',
    calloutLabel: '冲压多孔散热护筒机匣',
    nameEn: 'Monolithic Stamped-Steel Receiver & Perforated Barrel Cooling Shroud',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [38.0, 3.2, 0],
    labelAppearAt: 0.04,
    roleTag: '冲压钣金取代精密铣削 · 造价工时减半 · 梯形长散热窗标志轮廓',
    description:
      '由金属冲压专家维尔纳·格鲁纳（Grossfuss 公司）首创的整体式 2.5 mm 冷轧钢板冲压折弯点焊机匣与多孔散热护筒：工时由 MG 34 的 150 小时暴降至 75 小时；护筒上壁与双侧密布长圆形通风散热窗，底部开设垂直向下（-Y）抛壳窗并集成防雪防泥滑动防尘盖。',
  },
  {
    id: 'mg42_top_cover',
    bomCode: 'F-02',
    nameZh: '前铰接冲压钢受弹器顶盖(内置S型双向拨弹凸轮槽)',
    calloutLabel: '铰接顶盖与S型凸轮槽',
    nameEn: 'Hinged Stamped Top Feed Cover w/ Internal S-Cam Belt Track',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [16.8, 3.6, 0],
    explodeSteps: [
      {
        range: [0.02, 0.18],
        offset: [0, 6.8, 0],
        rotation: [0, 0, -0.45],
      },
      {
        range: [0.34, 0.64],
        offset: [-6.5, 10.2, 0],
        rotation: [0, 0, 0.45],
      },
      { range: [0.68, 0.96], offset: [-4.5, 5.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-12.0, 1.35, 0],
    labelAppearAt: 0.04,
    roleTag: '现代西方机枪(M60/FN MAG/M249)顶盖输弹共同鼻祖',
    description:
      '前端以横销铰接于机匣中部的冷冲压重型受弹器顶盖：内顶板铆装经典 S 型曲线凸轮轨道（Kurvenbahn），将机框顶部滚轮的纵轴往复丝滑转为横向双向拉链运动——该设计战后被美国 M60、比利时 FN MAG 与 M249 几乎原封不动沿用至今！',
  },
  {
    id: 'mg42_aa_sight',
    bomCode: 'F-03',
    nameZh: '200-2000米弧形表尺与折叠同心高射蛛网照门(Fliegervisier)',
    calloutLabel: '高射蛛网瞄具与表尺',
    nameEn: '200-2,000m Tangent Rear Sight & Flip-Up Anti-Aircraft Spider Sight',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [22.8, 3.95, 0],
    explodeSteps: [
      { range: [0.06, 0.24], offset: [2.0, 9.8, 0] },
      { range: [0.36, 0.64], offset: [2.5, 6.2, 0] },
      { range: [0.68, 0.96], offset: [1.5, 3.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [2.8, 2.8, 0],
    labelAppearAt: 0.14,
    roleTag: '双同心提前量高射蛛网环 · 兼顾2,000m地面压制与低空防空拦截',
    description:
      '集成于受弹器前方的双模式机械瞄具组合：底座带 200 至 2,000 米滑尺缺口表尺供地面点面压制；前方竖立经典可翻折同心双环十字丝防空蛛网瞄具（Fliegervisier），辅助射手在 1,200 发/分弹幕中快速估算低空俯冲战机提前量。',
  },
  {
    id: 'mg42_bipod',
    bomCode: 'F-04',
    nameZh: 'Zweibein 42 折叠冲压槽钢两脚架(带防陷宽铲脚)',
    calloutLabel: '折叠冲压钢两脚架',
    nameEn: 'Zweibein 42 Folding Stamped-Steel Bipod w/ Spade Feet',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [64.5, -1.55, 0],
    explodeSteps: [
      { range: [0.22, 0.56], offset: [8.5, -10.5, 0] },
      { range: [0.68, 0.96], offset: [5.5, -5.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [-8.0, -1.5, 0],
    labelAppearAt: 0.2,
    roleTag: '可快装于护筒前/中双位 · 冲压U型腿配滚花高度限位螺杆',
    description:
      '扣夹于多孔冷却护筒前端（亦可移至中段提升火力扇面）的重型冲压钢两脚架：行军时向后折贴于护筒下腹并由弹性卡扣锁定，展开后宽大铲形脚掌牢牢抓紧泥土雪地抵御 7.92mm 高频连发振动。',
  },
  {
    id: 'mg42_buttstock',
    bomCode: 'F-05',
    nameZh: '旋锁快拆胶木/层压桦木枪托(带左护指凹槽与钢托底板)',
    calloutLabel: '快拆胶木枪托与钢底板',
    nameEn: 'Twist-Lock Marbled Bakelite / Laminated Wood Buttstock & Steel Plate',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-28.8, -0.35, 0],
    explodeSteps: [
      { range: [0.08, 0.25], offset: [-19.5, -1.8, 0], rotation: [0.65, 0, 0] },
      { range: [0.36, 0.64], offset: [-10.0, -1.2, 0] },
      { range: [0.68, 0.96], offset: [-6.0, -0.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [-6.0, -2.5, 0],
    labelAppearAt: 0.1,
    roleTag: '按压卡笋旋转90°秒拆抽出缓冲器 · 左侧镂空供弱手下压控枪',
    description:
      '战时后期广泛采用深红褐大理石纹酚醛树脂胶木（Bakelite）或层压山毛榉木制成的特色空颈枪托：左侧专门铣出宽大握持凹弧便于卧姿射手左手反扣死压枪托抑制上跳；前端锁环按压卡笋顺时针旋转 90° 即可秒拆露出后缓冲器与复进簧。',
  },

  // ==================== 3. BAKELITE GRIP, FULL-AUTO TRIGGER & OPEN-BOLT SEAR ('fire_control' · 4 parts) ====================
  {
    id: 'mg42_grip_frame',
    bomCode: 'FC-01',
    nameZh: '冲压钢握把火控盒、防滑胶木护片、全闭环护圈与横推保险',
    calloutLabel: '胶木握把座与横推保险',
    nameEn: 'Stamped Grip Housing, Ribbed Bakelite Scales & Cross-Bolt Safety',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [-2.2, -3.95, 0],
    explodeSteps: [
      { range: [0.1, 0.26], offset: [-2.0, -9.8, 0] },
      { range: [0.36, 0.64], offset: [-1.5, -4.5, 0] },
      { range: [0.68, 0.96], offset: [-1.0, -2.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [-1.5, -4.2, 0],
    labelAppearAt: 0.12,
    roleTag: '摒弃MG34双月牙单/连发扳机 · 极简纯连发+S/F横栓物理保险',
    description:
      '铆焊于机匣腹下的冷冲压手枪握把火控盒，两侧装配横肋防滑深褐胶木护片与严实焊接闭环防寒大护圈。与精密繁复的 MG 34 不同，MG 42 彻底取消单发机构以降低故障率，仅设“S（安全）/ F（连发）”横向推栓物理锁死开膛阻铁。',
  },
  {
    id: 'mg42_trigger',
    bomCode: 'FC-02',
    nameZh: '纯全自动弧形冲压钢连发扳机',
    calloutLabel: '纯全自动连发扳机',
    nameEn: 'Full-Auto Only Curved Stamped-Steel Trigger & Lever',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-0.2, -3.15, 0],
    explodeSteps: [
      { range: [0.1, 0.26], offset: [-2.0, -9.8, 0] },
      { range: [0.38, 0.66], offset: [5.5, -1.5, 4.0] },
      { range: [0.68, 0.96], offset: [2.5, -0.8, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.38,
    roleTag: '极速短点射全凭食指节奏 · 0.25秒即可倾泻5发7.92mm弹幕',
    description:
      '位于大护圈内的弧形钢制纯连发扳机：扣下即压低开膛阻铁释放重型机框，在 1,200 发/分（每秒 20 发）超高射速下，老练机枪手通过极短瞬间的食指点放打出标志性“撕布声” 3–5 发致命短点射。',
  },
  {
    id: 'mg42_sear',
    bomCode: 'FC-03',
    nameZh: '渗碳淬火重型开膛待击主阻铁',
    calloutLabel: '重型开膛待击阻铁',
    nameEn: 'Case-Hardened Heavy Open-Bolt Sear Catch',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-2.2, -1.1, 0],
    explodeSteps: [
      { range: [0.1, 0.26], offset: [-2.0, -9.8, 0] },
      { range: [0.38, 0.66], offset: [-1.5, 2.0, 4.0] },
      { range: [0.68, 0.96], offset: [-1.0, 0.8, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.38,
    roleTag: '高抗剪挂机鼻瞬间截停550克机框 · 确保松手即停安全通风',
    description:
      '承受高强多股复进簧与重型机框巨大冲击载荷的渗碳淬火钢阻铁：松开扳机后在阻铁簧顶推下疾速抬升咬合机框底槽，令滚烫弹膛始终敞开对流降温杜绝自燃。',
  },
  {
    id: 'mg42_sear_spring',
    bomCode: 'FC-04',
    nameZh: '高刚度螺旋开膛阻铁复位簧',
    calloutLabel: '螺旋开膛阻铁复位簧',
    nameEn: 'High-Tension Helical Open-Bolt Sear Return Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-1.4, -2.25, 0],
    assembledRot: [0, 0, Math.PI / 2],
    explodeSteps: [
      { range: [0.1, 0.26], offset: [-2.0, -9.8, 0] },
      { range: [0.38, 0.66], offset: [-6.5, -1.5, 4.0] },
      { range: [0.68, 0.96], offset: [-3.2, -0.8, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.42,
    roleTag: '毫秒级顶升开膛阻铁 · 精准切断1,200 RPM高速狂飙点射',
    description:
      '垂直顶撑于握把火控盒与开膛阻铁之间的高张力琴钢丝螺旋压簧：保障极高速连发中松手瞬间阻铁毫无迟滞地升起截停自动机。',
  },

  // ==================== 4. SHUTTLE FEED PAWL, FEED TRAY, GURT 34 BELT & 50-RD DRUM ('magazine' · 4 parts) ====================
  {
    id: 'mg42_feed_tray',
    bomCode: 'M-01',
    nameZh: '铰接冲压钢7.92mm弹链受弹器托盘',
    calloutLabel: '冲压钢7.92mm受弹盘',
    nameEn: 'Hinged Stamped-Steel 7.92mm Belt Feed Tray w/ Stop Shoulder',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [11.8, 2.55, 0],
    explodeSteps: [
      { range: [0.06, 0.22], offset: [0, 4.2, -5.8] },
      { range: [0.36, 0.64], offset: [0.5, 3.0, -3.5] },
      { range: [0.68, 0.96], offset: [0.3, 1.8, -2.2] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.1,
    roleTag: '左进右出无卡滞半圆弹槽 · 弹性压弹片防震动脱链',
    description:
      '与顶盖同轴铰接的冷冲压加强筋受弹器托盘：精确引导 7.92×57mm 毛瑟 Gurt 34 金属弹链自左侧滑入中轴待推位，右侧竖直挡肩与底面弹簧止退爪协同防重弹链滑落。',
  },
  {
    id: 'mg42_feed_pawl',
    bomCode: 'M-02',
    nameZh: '顶盖S型凸轮拨弹臂与双级弹簧梭动拨弹爪总成',
    calloutLabel: 'S型凸轮双级拨弹爪',
    nameEn: 'Top-Cover Pivoting Feed Arm & Dual-Stage Shuttle Belt Feed Pawls',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [10.8, 3.3, 0],
    explodeSteps: [
      { range: [0.02, 0.18], offset: [0, 6.8, 0] },
      { range: [0.36, 0.64], offset: [0.8, 6.2, 6.2] },
      { range: [0.68, 0.96], offset: [0.4, 2.8, 3.2] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.36,
    roleTag: '后坐半步+复进半步接力输弹 · 将重链峰值拉力削减一半',
    description:
      'MG 42 得以维持每秒 20 发惊人供弹稳定性的独门绝技：内置滑板配备内外两对弹簧棘爪，后坐行程将弹链向右拉过半个弹距，复进前冲再接力推送后半个弹距，彻底消除高速顿挫断链！',
  },
  {
    id: 'mg42_ammo_belt',
    bomCode: 'M-03',
    nameZh: 'Gurt 34不可散弹簧钢弹链与7.92×57mm毛瑟尖头实弹段',
    calloutLabel: 'Gurt 34钢链与7.92mm弹',
    nameEn: 'Gurt 34 Non-Disintegrating Steel Belt w/ 7.92×57mm Mauser Rounds',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [11.8, 1.35, -3.6],
    explodeSteps: [
      { range: [0.03, 0.18], offset: [0.4, 1.6, -9.2] },
      { range: [0.36, 0.64], offset: [0.4, 0.4, -4.0] },
      { range: [0.68, 0.96], offset: [0.2, 0, -2.5] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, 1.2, 1.8],
    labelAppearAt: 0.05,
    roleTag: '50发一节铰链钢丝串联可无限接续 · 198格令s.S.重尖船尾弹',
    description:
      '德军制式 Gurt 34 烤蓝弹簧钢不可散弹链，装载 7.92×57mm 毛瑟（8mm Mauser）黄铜无底缘瓶颈弹壳与 198 格令重尖船尾（s.S.）被甲弹头：开膛枪机向前直接将实弹推离开口链环入膛，空链则自机匣右侧连续排出。',
  },
  {
    id: 'mg42_ammo_drum',
    bomCode: 'M-04',
    nameZh: 'Gurttrommel 34 左侧快挂式50发冲压钢突击弹鼓',
    calloutLabel: '50发快挂式突击弹鼓',
    nameEn: 'Gurttrommel 34 Side-Hung 50-Round Stamped-Steel Assault Drum',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [11.8, -2.2, -6.4],
    explodeSteps: [
      { range: [0.04, 0.2], offset: [0.8, -6.5, -9.5] },
      { range: [0.36, 0.64], offset: [0.5, -3.5, -4.2] },
      { range: [0.68, 0.96], offset: [0.3, -2.0, -2.5] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -2.0, -2.2],
    labelAppearAt: 0.05,
    roleTag: '单兵行进冲锋核心附件 · 保护50发弹链免受泥沙草木缠绕',
    description:
      '沿用自 MG 34 的经典左侧快挂圆柱蜗壳弹鼓（Gurttrommel 34）：内置单段 50 发盘绕式 Gurt 34 弹链，直接卡扣于机匣左侧供弹耳座上，使重达 11.6 公斤的 MG 42 在步兵班突击冲锋中也能瞬发倾泻 2.5 秒狂暴弹幕！',
  },
];

export const MG42_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'mg42_sear_release',
    stepNum: '01',
    shortLabel: '扣机释阻铁前冲',
    title: '阶段 1 · 扣动纯连发扳机压低开膛阻铁，三股绞合复进簧猛推机框前冲',
    range: [0.0, 0.09],
    description:
      '横推保险置于 F 射击位，食指扣动扳机下拉渗碳开膛阻铁；被锁在机匣后方的 550 克重型机框与滚柱机头在三股绞合复进簧强力推动下启动高速前冲。',
  },
  {
    id: 'mg42_roller_lock_ignite',
    stepNum: '02',
    shortLabel: '推弹楔撑双滚柱击发',
    title: '阶段 2 · 机头推 7.92mm 实弹入膛，斜楔外撑左右双滚柱死锁节套并同步击发',
    range: [0.09, 0.21],
    description:
      '非旋转机头自受弹器推出 7.92×57mm 毛瑟实弹直入弹膛；机头抵拢枪管尾面后机框继续前冲 7.5 mm，驱动击针斜楔将左右两枚淬火闭锁滚柱向外（±Z）死死顶入枪管节套凹槽，同时击针探出点燃底火！',
  },
  {
    id: 'mg42_short_recoil_booster',
    stepNum: '03',
    shortLabel: '枪口助退8.5mm短后坐',
    title: '阶段 3 · 390 MPa 激燃出膛，锥形枪口助退器截气猛推枪管与机头同步短后坐',
    range: [0.21, 0.33],
    description:
      '198 格令重尖弹以 755 m/s 飞离 530 mm 枪口冲入锥形助退器；反冲燃气驱动枪管与闭锁中的机头整体刚性短后坐 8.5 mm，期间双滚柱锁死承受全威力弹峰值高压。',
  },
  {
    id: 'mg42_roller_cam_unlock',
    stepNum: '04',
    shortLabel: '双滚柱内缩极速开锁',
    title: '阶段 4 · 机匣开锁斜面强行挤压双滚柱向中轴内缩，动能加速传递至重机框',
    range: [0.33, 0.44],
    description:
      '短后坐末端，固定在机匣内的开锁导轨将左右两枚闭锁滚柱同步挤向中心（±Z→0）脱离枪管节套；内缩滚柱楔推斜楔铁把枪管剩余后坐冲量倍增传递给重型机框，枪管随即止动回位。',
  },
  {
    id: 'mg42_recoil_bottom_eject',
    stepNum: '05',
    shortLabel: '狂飙后坐下抛壳与拨链',
    title: '阶段 5 · 机框高速越程后坐并向下(-Y)猛抛空壳，顶柱沿S槽驱动双爪输弹',
    range: [0.44, 0.62],
    description:
      '解脱闭锁的枪机组疾速后掠，抛壳顶杆撞击限位将炙热 7.92mm 空铜壳自机匣腹窗垂直向下抛出；同时机框顶柱划过顶盖 S 型轨道驱动双级拨弹爪平稳横拉 Gurt 34 弹链进给一发。',
  },
  {
    id: 'mg42_buffer_rebound',
    stepNum: '06',
    shortLabel: '尾座环簧缓冲疾速反弹',
    title: '阶段 6 · 重机框猛撞尾座摩擦环簧缓冲器，高刚度压簧瞬时蓄能疾速反弹',
    range: [0.62, 0.8],
    description:
      '机框后退越过阻铁 26 mm 撞击尾座摩擦缓冲器，粗线径缓冲压簧剧烈压缩 42% 吸收峰值冲击后立刻高弹性反弹，将 1,200 发/分循环周期压榨至惊人的 50 毫秒！',
  },
  {
    id: 'mg42_open_bolt_catch',
    stepNum: '07',
    shortLabel: '开膛截停散热待命',
    title: '阶段 7 · 松手瞬间重型阻铁弹起截停机框，弹膛敞开散热回归开膛待击态',
    range: [0.8, 1.0],
    description:
      '松开扳机后螺旋阻铁簧瞬时抬升开膛阻铁咬合机框底槽（若持续扣住则无停顿进入每秒 20 发撕布弹幕），炽热弹膛敞开通风散热，随时等待下一次短点射。',
  },
];

// ============================================================================
// OPEN-BOLT SHORT-RECOIL TWIN-ROLLER LOCKING KINEMATICS (f in [0, 1])
// ============================================================================

const MG42_FORWARD_BOLT_STROKE = 7.0; // Cocked face -> Barrel extension breech (+7.00 cm)
const MG42_WEDGE_LOCK_STROKE = 0.75; // Extra carrier/wedge cam stroke driving rollers outward (+7.75 cm)
const MG42_BARREL_SHORT_RECOIL = 0.85; // 8.5 mm muzzle-booster driven barrel short recoil
const MG42_REAR_OVERTRAVEL = 2.6; // Buffer overtravel behind open-bolt sear (-2.60 cm)
const MG42_ROLLER_OUT_Z = 0.28; // Symmetric radial lockup throw (+Z / -Z = ±2.8 mm)

interface Mg42ActionSample {
  barrelDX: number;
  boltHeadDX: number;
  carrierDX: number;
  rollerOut01: number;
  pinRelBoltDX: number;
  bufferDX: number;
}

function sampleMg42Action(f: number): Mg42ActionSample {
  const batteryBolt = MG42_FORWARD_BOLT_STROKE; // +7.00
  const batteryCarrier = MG42_FORWARD_BOLT_STROKE + MG42_WEDGE_LOCK_STROKE; // +7.75

  // 1. Barrel + barrel extension 8.5 mm short recoil boosted at muzzle exit [0.24..0.38], returns [0.40..0.52]
  let barrelDX = 0;
  if (f >= 0.24 && f < 0.37) {
    barrelDX = -MG42_BARREL_SHORT_RECOIL * seg(f, 0.24, 0.37);
  } else if (f >= 0.37 && f < 0.42) {
    barrelDX = -MG42_BARREL_SHORT_RECOIL;
  } else if (f >= 0.42 && f < 0.54) {
    barrelDX = -MG42_BARREL_SHORT_RECOIL * (1 - seg(f, 0.42, 0.54));
  }

  // 2. Twin rollers cam OUTWARD into barrel extension [0.16..0.21], stay LOCKED through short recoil [0.21..0.33],
  //    then squeeze INWARD [0.33..0.41] as stationary receiver cams unlock them!
  let rollerOut01 = 0;
  if (f >= 0.16 && f < 0.21) {
    rollerOut01 = seg(f, 0.16, 0.21);
  } else if (f >= 0.21 && f < 0.33) {
    rollerOut01 = 1.0;
  } else if (f >= 0.33 && f < 0.41) {
    rollerOut01 = 1.0 - seg(f, 0.33, 0.41);
  }

  // 3. Bolt head longitudinal travel
  let boltHeadDX = 0;
  if (f >= 0.03 && f < 0.16) {
    boltHeadDX = batteryBolt * seg(f, 0.03, 0.16);
  } else if (f >= 0.16 && f < 0.33) {
    // Locked rigidly to barrel extension during ignition & initial short recoil
    boltHeadDX = batteryBolt + barrelDX;
  } else if (f >= 0.33 && f < 0.41) {
    // Unlocking transition with barrel deceleration
    const u = seg(f, 0.33, 0.41);
    const startX = batteryBolt + barrelDX;
    boltHeadDX = startX - 0.85 * u;
  } else if (f >= 0.41 && f < 0.62) {
    // Unlocked high-speed recoil to rear buffer overtravel (-2.60 cm)
    const startX = batteryBolt - MG42_BARREL_SHORT_RECOIL - 0.85;
    boltHeadDX =
      startX + (-MG42_REAR_OVERTRAVEL - startX) * seg(f, 0.41, 0.62);
  } else if (f >= 0.62 && f < 0.67) {
    boltHeadDX = -MG42_REAR_OVERTRAVEL;
  } else if (f >= 0.67 && f < 0.84) {
    boltHeadDX = -MG42_REAR_OVERTRAVEL * (1 - seg(f, 0.67, 0.84));
  }

  // 4. Bolt carrier + locking wedge travel (leads bolt head forward by +0.75 cm during lockup,
  //    and accelerates rearward ahead of bolt head during roller cam-in!)
  let carrierDX = boltHeadDX;
  if (f >= 0.16 && f < 0.33) {
    carrierDX = boltHeadDX + MG42_WEDGE_LOCK_STROKE * rollerOut01;
  } else if (f >= 0.33 && f < 0.41) {
    carrierDX = boltHeadDX + MG42_WEDGE_LOCK_STROKE * rollerOut01;
  }
  if (carrierDX > batteryCarrier) carrierDX = batteryCarrier;

  // 5. Firing pin tip protrudes ONLY once rollers are >50% locked outward
  const pinRelBoltDX =
    rollerOut01 > 0.45
      ? 0.34 * smoothstep01((rollerOut01 - 0.45) / 0.55)
      : 0;

  // 6. Rear friction-ring buffer plunger compression during carrier rear overtravel (`carrierDX < -0.5`)
  let bufferDX = 0;
  if (carrierDX < -0.5) {
    const overU = smoothstep01(
      (-carrierDX - 0.5) / (MG42_REAR_OVERTRAVEL - 0.5)
    );
    bufferDX = -0.92 * overU;
  }

  return {
    barrelDX,
    boltHeadDX,
    carrierDX,
    rollerOut01,
    pinRelBoltDX,
    bufferDX,
  };
}

export function computeMg42FiringKinematics(
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

  const {
    barrelDX,
    boltHeadDX,
    carrierDX,
    rollerOut01,
    pinRelBoltDX,
    bufferDX,
  } = sampleMg42Action(f);

  const searPullDrop = seg(f, 0.008, 0.045) - seg(f, 0.58, 0.68);
  const searRatchetBump =
    f > 0.72 && f < 0.82
      ? Math.sin(linearSeg(f, 0.72, 0.82) * Math.PI) * 0.42
      : 0;
  const searDrop01 = clamp01(searPullDrop + searRatchetBump);

  switch (partId) {
    case 'mg42_barrel': {
      dx = barrelDX;
      break;
    }

    case 'mg42_bolt_head': {
      dx = boltHeadDX;
      break;
    }

    case 'mg42_locking_rollers': {
      // Right (+Z) locking roller cams OUTWARD (+Z) into barrel extension recesses on lockup,
      // then cams INWARD (-Z) flush with bolt head during short-recoil unlock!
      dx = boltHeadDX;
      dz = +MG42_ROLLER_OUT_Z * rollerOut01;
      break;
    }

    case 'mg42_locking_roller_left': {
      // Left (-Z) locking roller cams symmetrically OUTWARD (-Z) on lockup and INWARD (+Z) on unlock!
      dx = boltHeadDX;
      dz = -MG42_ROLLER_OUT_Z * rollerOut01;
      break;
    }

    case 'mg42_locking_wedge': {
      dx = carrierDX + pinRelBoltDX * 0.4;
      break;
    }

    case 'mg42_bolt_carrier': {
      dx = carrierDX;
      break;
    }

    case 'mg42_recoil_spring': {
      // Local spring spans [-8.5, +8.5] (L0 = 17.0 cm), rear end pinned at X = -8.5
      const pinAnchorX = -8.5;
      const L0 = 17.0;
      const LNew = Math.max(8.0, L0 + carrierDX);
      scaleX = LNew / L0;
      dx = pinAnchorX * (1 - scaleX);
      break;
    }

    case 'mg42_recoil_buffer': {
      dx = bufferDX;
      break;
    }

    case 'mg42_buffer_spring': {
      // Local spring spans [-2.2, +2.2] (L0 = 4.4 cm), rear end pinned at X = -2.2
      const pinAnchorX = -2.2;
      const L0 = 4.4;
      const compU = Math.min(1, Math.abs(bufferDX) / 0.92);
      const LNew = Math.max(2.2, L0 * (1 - 0.42 * compU));
      scaleX = LNew / L0;
      dx = pinAnchorX * (1 - scaleX);
      break;
    }

    case 'mg42_trigger': {
      const pull = seg(f, 0.0, 0.05) - seg(f, 0.56, 0.66);
      rz = -0.24 * pull;
      break;
    }

    case 'mg42_sear': {
      dy = -0.36 * searDrop01;
      rz = 0.06 * searDrop01;
      break;
    }

    case 'mg42_sear_spring': {
      // Vertical spring (`assembledRot: [0, 0, Math.PI / 2]`, local X in [-0.75, +0.75])
      const pinAnchorX = -0.75;
      scaleX = 1 - 0.26 * searDrop01;
      dy = pinAnchorX * (1 - scaleX);
      break;
    }

    case 'mg42_feed_pawl': {
      // Two-stage MG42 shuttle feed: half-step right on recoil, half-step right on counter-recoil!
      const forwardHalf = seg(f, 0.05, 0.18) - seg(f, 0.42, 0.6);
      const recoilHalf = seg(f, 0.42, 0.6) - seg(f, 0.66, 0.84);
      dz = -0.62 * forwardHalf + 0.52 * recoilHalf;
      ry = -0.14 * forwardHalf + 0.11 * recoilHalf;
      break;
    }

    case 'mg42_ammo_belt': {
      const beltPulse =
        f > 0.38 && f < 0.78 ? Math.sin(linearSeg(f, 0.38, 0.78) * Math.PI) : 0;
      dz = 0.48 * beltPulse;
      dy = 0.08 * beltPulse;
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

/**
 * Authentic Open-Bolt 7.92×57mm Mauser Belt-Fed Ballistics & Bottom Ejection (-Y):
 *  - `f = 0` & `f = 1`: Chamber EMPTY (open bolt); active 7.92mm Mauser round rests on `mg42_feed_tray` (`[11.8, 2.55, 0]`).
 *  - `f in [0.03, 0.205)`: Advancing bolt strips 7.92mm round forward into chamber (`[20.2, 1.50, 0]`).
 *  - `ignitionF = 0.21` -> `muzzleExitF = 0.30`: 198gr s.S. spitzer accelerates down 530mm barrel and exits conical recoil booster (`X = 81.0`).
 *  - `f in [0.38, 0.50]` -> `ejectF = 0.50`: Spent 7.92mm brass extracts & hurls DOWNWARD (`-Y`) out MG 42's iconic bottom ejection port!
 */
export function computeMg42BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const { boltHeadDX } = sampleMg42Action(f);

  // 1. 7.92×57mm Mauser 198gr s.S. Spitzer Boat-Tail bullet (ignition f=0.21 -> muzzle X=81.0 at f=0.30)
  const bulletVisible = f >= 0.205 && f < 0.45;
  let bulletX = 22.8;
  let streakLength = 0;

  if (f >= 0.21 && f < 0.3) {
    const u = Math.pow(linearSeg(f, 0.21, 0.3), 1.42);
    bulletX = 22.8 + (81.0 - 22.8) * u;
    streakLength = 7.4 * u;
  } else if (f >= 0.3 && f < 0.45) {
    const u = linearSeg(f, 0.3, 0.45);
    bulletX = 81.0 + 82.0 * u;
    streakLength = 15.0 * (1 - u * 0.45);
  }

  // 2. Chambered / Extracting 7.92mm Brass Case -> Signature MG 42 BOTTOM EJECTION (-Y)!
  const spentCaseVisible = f >= 0.205 && f < 0.78;
  let caseX = 20.2;
  let caseY = 1.5;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.33 && f < 0.5) {
    caseX = 20.2 + (boltHeadDX - MG42_FORWARD_BOLT_STROKE);
  } else if (f >= 0.5 && f < 0.78) {
    const u = linearSeg(f, 0.5, 0.78);
    const ejectOriginX =
      20.2 + (sampleMg42Action(0.5).boltHeadDX - MG42_FORWARD_BOLT_STROKE);
    caseX = ejectOriginX - 2.2 * u;
    caseY = 1.5 - 15.5 * u - 8.0 * u * u; // Crisp downward -Y ejection out receiver belly!
    caseZ = 1.8 * u;
    caseRX = u * 11.5;
    caseRY = -u * 7.2;
    caseRZ = -u * 13.8;
    if (f > 0.65) {
      spentCaseOpacity = 1 - linearSeg(f, 0.65, 0.78);
    }
  }

  // 3. Chamber Flash, Conical Muzzle Recoil Booster Flash & Plume
  const chamberFlashIntensity =
    f >= 0.208 && f <= 0.285
      ? Math.sin(linearSeg(f, 0.208, 0.285) * Math.PI)
      : 0;

  // Recoil booster cup flashes as bullet clears muzzle cone
  const gasPortFlashIntensity =
    f >= 0.28 && f <= 0.365
      ? Math.sin(linearSeg(f, 0.28, 0.365) * Math.PI) * 0.9
      : 0;

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.295 && f <= 0.39) {
    const u = linearSeg(f, 0.295, 0.39);
    muzzlePlumeScale = 0.62 + 1.95 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.9;
  }

  // 4. Open-Bolt Belt-Fed 7.92mm Round Choreography (zero jump between f=0 and f=1!)
  let nextX = 11.8;
  let nextY = 2.65;
  let nextZ = 0;
  let nextRZ = -0.02;

  if (f >= 0.03 && f < 0.205) {
    const u = seg(f, 0.03, 0.195);
    nextX = 11.8 + (20.2 - 11.8) * u;
    nextY = 2.65 + (1.5 - 2.65) * smoothstep01(u);
    nextZ = 0;
    nextRZ = -0.02 * (1 - u) - 0.05 * Math.sin(u * Math.PI);
  } else if (f >= 0.205 && f < 0.38) {
    nextX = 11.8;
    nextY = 2.65;
    nextZ = -1.45;
    nextRZ = -0.02;
  } else if (f >= 0.38 && f < 0.72) {
    const u = seg(f, 0.38, 0.72);
    nextX = 11.8;
    nextY = 2.65 + 0.04 * Math.sin(u * Math.PI);
    nextZ = -1.45 * (1 - u);
    nextRZ = -0.02;
  }

  // 5. Reserve Linked Cartridge advancing one 14.5mm Gurt 34 pitch
  const beltAdvance = seg(f, 0.38, 0.72);
  const resX = 11.8;
  const resY = 2.48 + (2.65 - 2.48) * beltAdvance;
  const resZ = -2.9 + (-1.45 - -2.9) * beltAdvance;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.5, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [76.5, 1.5, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, resZ],
  };
}

const MG42_V3_SHROUD_BUNDLE: PbrBindingSpec = {
  albedoFile: 'mg42_v3_shroud_albedo.webp',
  normalFile: 'mg42_v3_shroud_normal.webp',
  roughnessFile: 'mg42_v3_shroud_roughness.webp',
  normalScale: 0.88,
};

const MG42_V3_FURNITURE_BUNDLE: PbrBindingSpec = {
  albedoFile: 'mg42_v3_furniture_albedo.webp',
  normalFile: 'mg42_v3_furniture_normal.webp',
  roughnessFile: 'mg42_v3_furniture_roughness.webp',
  normalScale: 0.9,
};

const MG42_V3_METAL_BUNDLE: PbrBindingSpec = {
  albedoFile: 'mg42_v3_metal_albedo.webp',
  normalFile: 'mg42_v3_metal_normal.webp',
  roughnessFile: 'mg42_v3_metal_roughness.webp',
  normalScale: 0.85,
};

export const MG42_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  mg42_receiver_shroud: MG42_V3_SHROUD_BUNDLE,
  mg42_top_cover: MG42_V3_SHROUD_BUNDLE,
  mg42_barrel_latch: MG42_V3_SHROUD_BUNDLE,
  mg42_muzzle_booster: MG42_V3_SHROUD_BUNDLE,
  mg42_aa_sight: MG42_V3_SHROUD_BUNDLE,
  mg42_bipod: MG42_V3_SHROUD_BUNDLE,
  mg42_buttstock: MG42_V3_FURNITURE_BUNDLE,
  mg42_grip_frame: MG42_V3_FURNITURE_BUNDLE,
  mg42_ammo_drum: MG42_V3_FURNITURE_BUNDLE,
  mg42_feed_tray: MG42_V3_FURNITURE_BUNDLE,
  mg42_feed_pawl: MG42_V3_FURNITURE_BUNDLE,
  mg42_barrel: MG42_V3_METAL_BUNDLE,
  mg42_bolt_head: MG42_V3_METAL_BUNDLE,
  mg42_locking_rollers: MG42_V3_METAL_BUNDLE,
  mg42_locking_roller_left: MG42_V3_METAL_BUNDLE,
  mg42_locking_wedge: MG42_V3_METAL_BUNDLE,
  mg42_bolt_carrier: MG42_V3_METAL_BUNDLE,
  mg42_charging_handle: MG42_V3_METAL_BUNDLE,
  mg42_recoil_buffer: MG42_V3_METAL_BUNDLE,
  mg42_trigger: MG42_V3_METAL_BUNDLE,
  mg42_sear: MG42_V3_METAL_BUNDLE,
  mg42_ammo_belt: MG42_V3_METAL_BUNDLE,
};

export const MG42_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'mg42_shroud',
    weapon: MG42_ID,
    titleCn: 'MG 42 冲压多孔散热护筒机匣、cra 1943 铭文与高射蛛网照门贴图组',
    partTag: 'F-01 / F-02 / B-02 / B-03 / F-03 / F-04 STAMPED SHROUD & SIGHTS',
    resolution: '2048 × 2048 px',
    summary:
      'Cycles Metal GPU 烘焙的 2K 5 通道 Packed ORM 贴图组，真实还原 1943 年柏林 Maget 工厂（cra）冷冲压磷化发黑钢机匣与多孔冷却护筒：左侧无畸变 Hero UV 平面钢印刻有「MG 42 · cra 1943 · 4812 d · WaA 749」，冲压加强筋与长椭圆散热孔边缘带金属磨损高光。',
    highlights: [
      'AgX 校准暗缎面磷化冲压钢反照率与冲压边角微磨损金属度过渡',
      '左侧平面 Hero UV 正向无镜像「MG 42 / cra 1943」原厂戳记与序列号',
      '多孔散热窗、锥形枪口助退器、快拆侧门与两脚架真实装配接触 AO',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'mg42_v3_shroud_albedo.webp',
        note: 'sRGB · 冷冲压发黑磷化钢 / cra 1943 原厂铭文 / 加强筋边缘微磨白',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'mg42_v3_shroud_normal.webp',
        note: 'Linear · 冲压折弯微倒角 + 钢印深凹法线 + 枪口助退器滚花纹',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'mg42_v3_shroud_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:缎面磷化(0.30-0.38) / B:钢材金属度(0.88)',
      },
    ],
  },
  {
    id: 'mg42_furniture',
    weapon: MG42_ID,
    titleCn: '大理石纹胶木枪托、防滑握把护片、50发突击弹鼓与S槽拨弹组贴图',
    partTag: 'F-05 / FC-01 / M-01 / M-02 / M-04 BAKELITE & GURTTROMMEL 34',
    resolution: '2048 × 2048 px',
    summary:
      '呈现二战德军战时酚醛树脂大理石纹胶木枪托与握把护片的温润有机质感，以及野战灰绿烤漆 Gurttrommel 34 50 发侧挂突击弹鼓的军火库喷涂字模与冲压翻边磨损。',
    highlights: [
      '深红褐酚醛胶木大理石纹理与绝缘低粗糙度光泽（M=0.0, R=0.34-0.46）',
      'Gurttrommel 34 弹鼓野战灰漆「GURTTROMMEL 34 · 50 PATR. 7,92」喷印标识',
      '冲压受弹器与双级 S 槽拨弹爪磨亮摩擦轨迹反差',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'mg42_v3_furniture_albedo.webp',
        note: 'sRGB · 红褐大理石胶木 / 野战灰50发突击弹鼓 / S/F保险标记',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'mg42_v3_furniture_normal.webp',
        note: 'Linear · 握把防滑横肋 + 胶木微孔 + 弹鼓环形加强筋',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'mg42_v3_furniture_roughness.webp',
        note: 'Linear · R:装配AO / G:胶木与灰漆粗糙度分层 / B:介质与钢壳金属度隔离',
      },
    ],
  },
  {
    id: 'mg42_metal',
    weapon: MG42_ID,
    titleCn: '530mm快拆枪管、双淬火闭锁滚柱、击针斜楔与Gurt 34铜弹链贴图组',
    partTag: 'B-01 / B-04–B-11 / FC-02–03 / M-03 ROLLER-LOCK & 7.92MM BELT',
    resolution: '2048 × 2048 px',
    summary:
      '覆盖全枪内部精密承压自动机与 7.92×57mm 弹链：区分热回火发黑枪管、高光无心磨削双闭锁滚柱（R=0.16, M=0.96）、550 克重型机框，并在右下角设立 >=70px 独立 UV 防火墙零色渗呈现 C26000 黄铜毛瑟弹壳与紫铜尖头弹！',
    highlights: [
      '高光轴承钢对称双闭锁滚柱与击针斜楔精密磨削纹理（R=0.16–0.22）',
      'Gurt 34 弹链与 7.92×57mm 亮黄铜弹壳享有 >=70px 独立 UV 防火墙零渗色',
      '530mm 快拆枪管与方形闭锁节套 CNC 车铣微法线与热氧化过渡',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'mg42_v3_metal_albedo.webp',
        note: 'sRGB · 烤蓝重管 / 亮铬双滚柱与斜楔 / 独立防火墙黄铜毛瑟弹链',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'mg42_v3_metal_normal.webp',
        note: 'Linear · 轴向车铣刀纹 + 滚柱镜面倒角 + Gurt 34 链节卷边',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'mg42_v3_metal_roughness.webp',
        note: 'Linear · R:内部机构AO / G:滚柱镜面(0.16)-磷化机框(0.32) / B:高纯金属(0.92)',
      },
    ],
  },
];

export const MG42_PLUGIN: WeaponRuntimePlugin = {
  id: MG42_ID,
  partGroups: MG42_PART_GROUPS,
  timelinePresets: MG42_TIMELINE_PRESETS,
  parts: MG42_PARTS,
  firingPhases: MG42_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(MG42_FIRING_PHASES, f),
  computeFiringKinematics: computeMg42FiringKinematics,
  computeBallisticsState: computeMg42BallisticsState,
  pbrBindings: MG42_PBR_BINDINGS,
  pbrSuites: MG42_PBR_SUITES,
};
