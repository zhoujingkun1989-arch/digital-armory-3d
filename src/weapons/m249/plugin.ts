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

export const M249_ID: WeaponId = 'm249';
export const M249_CALIBER: CaliberProfile = '556_nato';

export const M249_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '18.3"快拆枪管、长行程导气活塞与开膛双笋回转枪机组',
    nameEn: '18.3" Quick-Change Barrel, Long-Stroke Piston & Open-Bolt BCG',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '冲压钢焊接机匣、铰接顶盖、隔热护罩与折叠双脚架枪托组',
    nameEn: 'Stamped Steel Receiver, Hinged Feed Cover, Heatshield & Bipod',
    badgeColor: '#94a3b8',
  },
  {
    key: 'fire_control',
    nameZh: '重型开膛待击阻铁、横闩保险与快拆握把火控盒组',
    nameEn: 'Open-Bolt Sear Catch, Cross-Bolt Safety & Trigger Frame',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '双拨爪横向梭动供弹机、M27可散弹链与200发突击弹箱组',
    nameEn: 'Dual-Pawl Belt Shuttle, Feed Tray, M27 Belt & 200-Rd SAW Box',
    badgeColor: '#4ade80',
  },
];

export const M249_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '开膛待击合拢态',
    subLabel: '0% Open-Bolt Ready',
    t: 0,
    desc: '比利时 FN Minimi / 美军制式 M249 班用自动武器（SAW，全长 1,035 mm）标准开膛待击态：长行程活塞滑块与双突笋回转枪机被重型开膛阻铁锁定在机匣后方，弹膛敞开通风防止持续连发自燃（Cook-Off），M27 可散金属弹链携 M855 绿尖弹横跨受弹器待命。',
  },
  {
    id: 'field_strip',
    label: '一级勤务快拆',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '遵循美军 TM 9-1005-201-10 野战教范免工具快速分解：向上掀开压铸铝合金受弹器顶盖，卸除 M27 弹链与 200 发橄榄绿聚合物弹箱；按压隔热提把锁扣3秒内前抽更换灼热的 18.3 英寸枪管，并后抽取出复进簧与长行程活塞枪机组。',
  },
  {
    id: 'sub_assembly',
    label: '二级供弹与火控细拆',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '分离顶盖内 S 型拨弹曲柄杠杆与内外双级弹簧拨弹滑板，旋下前端导气调节箍，抽出枪托液压后坐缓冲器，并分解快拆握把火控盒内的重型开膛阻铁与螺旋阻铁簧。',
  },
  {
    id: 'full_exploded',
    label: '全枪 26 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 26 个 1:1 军械构件零干涉展开：从 1:7" 缠距冷锻镀铬快拆枪管、长行程活塞顶部供弹滚轮、左斜应急 STANAG 弹匣井冲压机匣、S 槽铰接顶盖到 M27 可散钢链与 200 发突击弹箱，完整呈现现代西方步兵班组持续火力核心。',
  },
];

export const M249_PARTS: WeaponPartSpec[] = [
  // ==================== 1. QUICK-CHANGE BARREL, PISTON & OPEN-BOLT BCG ('slide' · 9 parts) ====================
  {
    id: 'm249_barrel',
    bomCode: 'B-01',
    nameZh: '18.3英寸快拆冷锻镀铬枪管(含节套、导气座与鸟笼消焰器)',
    calloutLabel: '18.3"快拆镀铬枪管',
    nameEn: '18.3" Quick-Change CHF Chrome-Lined Barrel w/ Gas Block & Birdcage',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 1.25, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [18.0, 5.2, 0] },
      { range: [0.35, 0.65], offset: [6.0, 2.5, 0] },
      { range: [0.68, 0.96], offset: [4.0, 1.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [28.0, 1.1, 0],
    labelAppearAt: 0.06,
    roleTag: '465mm 1:7"右旋六膛线 · 3秒免工具热管快拆无需重校闭锁间隙',
    description:
      '全长 465 mm（18.3 英寸）冷精锻内膛镀硬铬重型机枪管，采用 1:7 英寸（178 mm）快缠距右旋六膛线稳定 62 格令 M855 钢芯弹；后端刚性旋锁镀铬双突笋闭锁节套，副射手或射手无需防热手套即可借隔热提把在数秒内抽换过热枪管且闭锁间隙固定免调。',
  },
  {
    id: 'm249_barrel_handle',
    bomCode: 'B-02',
    nameZh: '快拆枪管解锁卡箍与折叠隔热携行提把',
    calloutLabel: '快拆枪管隔热提把',
    nameEn: 'Quick-Change Barrel Latch Yoke & Folding Insulated Carry Handle',
    group: 'slide',
    material: 'polymer_frame',
    assembledPos: [14.8, 3.25, 1.85],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [18.0, 5.2, 0] },
      { range: [0.36, 0.64], offset: [7.2, 6.2, 4.2] },
      { range: [0.68, 0.96], offset: [4.0, 2.8, 2.4] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.34,
    roleTag: '按压弹簧锁舌解锁节套 · 耐高温隔热肋纹护手防灼伤',
    description:
      '铰接在快拆枪管后段重型钢箍上的弹簧卡锁及耐热增强聚酰胺肋纹提把：行军与射击时向右折叠不遮挡瞄准基线；连续倾泻 200 发弹链致枪管暗红发烫时，按压尾端解锁凸耳即可直接提拔抽出热管。',
  },
  {
    id: 'm249_gas_regulator',
    bomCode: 'B-03',
    nameZh: '前导气箍滚花调节环与废气泄放塞',
    calloutLabel: '前导气箍调节泄气塞',
    nameEn: 'Front Gas Block Knurled Regulator Collar & Exhaust Plug',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [37.4, -0.65, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [18.0, 5.2, 0] },
      { range: [0.34, 0.62], offset: [24.0, 2.4, 0], rotation: [0.85, 0, 0] },
      { range: [0.68, 0.96], offset: [12.0, 1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.36,
    roleTag: '早期双档(N正常/A恶劣高射速)与美军PIP恒定节流排气设计',
    description:
      '装于枪管前导气箍前端的滚花导气塞：早期 FN Minimi 设正常（750 RPM）与重度积碳泥沙恶劣环境（1,000 RPM）两档导气孔，美军 M249 PIP 改进型优化为免误调恒压自洁排气口，多余高压火药燃气由此向前下方喷出。',
  },
  {
    id: 'm249_piston_carrier',
    bomCode: 'B-04',
    nameZh: '长行程导气活塞与滑块枪机框一体总成(带顶部拨弹滚轮)',
    calloutLabel: '长行程活塞框与顶滚轮',
    nameEn: 'Long-Stroke Gas Piston & Slide Carrier w/ Top Feed-Cam Roller',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-6.8, -0.65, 0],
    explodeSteps: [
      { range: [0.14, 0.29], offset: [-16.0, 5.8, 0] },
      { range: [0.36, 0.64], offset: [-7.5, 2.2, 0] },
      { range: [0.68, 0.96], offset: [-4.5, 1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-1.8, 3.24, 0],
    labelAppearAt: 0.16,
    roleTag: '下置长活塞耐污驱动 · 底铣开膛待击缺口 · 顶立滚轮驱动弹链',
    description:
      'M249 自动机的动力中枢：下方镀硬铬杯状活塞头带三道刮碳环深入下导气管承受燃气推力；上方高刚性滑块塔座内置螺旋开闭锁凸轮槽，底部镶嵌超硬合金开膛待击卡口，顶端竖立垂直钢滚轮嵌入顶盖拨弹曲柄叉口实现双向同步输弹！',
  },
  {
    id: 'm249_bolt',
    bomCode: 'B-05',
    nameZh: '双突笋30°回转闭锁镀铬枪机(含推弹凸角与抽壳钩)',
    calloutLabel: '双突笋回转闭锁枪机',
    nameEn: 'Hard-Chrome 2-Lug Rotating Breech Bolt & Claw Extractor',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-6.6, 1.25, 0],
    explodeSteps: [
      { range: [0.14, 0.29], offset: [-16.0, 5.8, 0] },
      {
        range: [0.36, 0.64],
        offset: [7.5, 5.6, 0],
        rotation: [0.52, 0, 0],
      },
      { range: [0.68, 0.96], offset: [3.2, 2.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.34,
    roleTag: '前冲推弹脱链入膛 · 双对称重型突笋旋入节套刚性闭锁',
    description:
      '借鉴 AK 卡拉什尼科夫高可靠理念设计的双大截面闭锁突笋镀铬枪机：复进前冲时顶部推弹角同时兼容剥离受弹器 M27 弹链实弹或左侧应急 M16 弹匣抱弹口；进膛到位瞬间由下部滑块凸轮驱动顺时针旋转约 30°（0.52 rad）完成刚性闭锁。',
  },
  {
    id: 'm249_firing_pin',
    bomCode: 'B-06',
    nameZh: '滑块联动机械防早发固定/凸轮击针',
    calloutLabel: '滑块联动防早发击针',
    nameEn: 'Slide-Linked Mechanically Timed Open-Bolt Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-7.25, 1.25, 0],
    explodeSteps: [
      { range: [0.14, 0.29], offset: [-16.0, 5.8, 0] },
      { range: [0.36, 0.64], offset: [-5.5, 5.8, 0] },
      { range: [0.68, 0.96], offset: [-3.5, 2.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.38,
    roleTag: '横销刚性铰连活塞滑块 · 唯当双突笋完全闭锁后方越出镜面击发',
    description:
      '不同于闭膛步枪的独立击锤敲击，M249 的阶梯合金钢击针尾端直接由横销锁连于活塞滑块塔座上：在推弹上膛全过程中击针尖始终缩藏于枪机镜面之后；唯有枪机抵定膛口、滑块继续前冲最后 6.5 mm 驱动双突笋锁死瞬间，击针尖方才同步探出刺破底火！',
  },
  {
    id: 'm249_charging_handle',
    bomCode: 'B-07',
    nameZh: '右侧非随动开槽钢导轨折叠拉机柄',
    calloutLabel: '右侧非随动折叠拉机柄',
    nameEn: 'Right-Side (+Z) Non-Reciprocating Slotted Steel Charging Handle',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-0.8, 1.25, 2.25],
    explodeSteps: [
      { range: [0.12, 0.26], offset: [1.5, 2.0, 5.8] },
      { range: [0.68, 0.96], offset: [1.2, 1.4, 3.6] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.16,
    roleTag: '后拉挂上开膛阻铁后推回前锁位 · 连发射击全程静止不伤手',
    description:
      '位于机匣右侧滑槽内的长条导轨式拉机柄：装填首发前向后拉到底使活塞滑块挂上开膛阻铁，随后必须将拉机柄推回前端卡笋锁死——实弹连发期间活塞滑块独自高速往复，拉机柄完全静止不随动。',
  },
  {
    id: 'm249_recoil_spring',
    bomCode: 'B-08',
    nameZh: '多股绞合高疲劳长行程复进簧与导杆总成',
    calloutLabel: '长行程复进驱动主簧',
    nameEn: 'Captive Multi-Strand Long Helical Driving / Recoil Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-6.1, 0.85, 0],
    explodeSteps: [
      { range: [0.13, 0.28], offset: [-26.0, 9.2, 0] },
      { range: [0.36, 0.64], offset: [-11.5, 3.2, 0] },
      { range: [0.68, 0.96], offset: [-6.5, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.16,
    roleTag: '开膛待击预压蓄能 · 释放瞬间猛推重型自动机剥弹闭锁击发',
    description:
      '套装在系留式导杆上的超长螺旋复进驱动主簧：开膛待击态（f=0）即处于预压缩高势能状态；扣下扳机瞬间释放势能驱动活塞与枪机高速前冲完成剥弹、进膛、闭锁与底火撞击，后坐越程阶段再度压缩吸收剩余动能。',
  },
  {
    id: 'm249_hydraulic_buffer',
    bomCode: 'B-09',
    nameZh: '枪托内置液压阻尼后坐缓冲器总成',
    calloutLabel: '液压阻尼后坐缓冲器',
    nameEn: 'Stock-MountedPIP Hydraulic Recoil Damper & Buffer Plunger',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-16.6, 0.85, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [-16.5, 1.8, 0] },
      { range: [0.36, 0.64], offset: [-6.5, 0.8, 0] },
      { range: [0.68, 0.96], offset: [-4.5, 0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.36,
    roleTag: '美军M249 PIP核心升级 · 油液节流平抑后坐峰值并稳定775发/分射速',
    description:
      '美军 M249 产品改进计划（PIP）取代早期易碎橡胶缓冲块的关键液压阻尼器：当活塞滑块向后越过开膛阻铁约 23.5 mm 撞击缓冲柱塞时，内部硅油经精密节流微孔吸能，显著降低连发散布并防止机匣尾板疲劳开裂。',
  },

  // ==================== 2. STAMPED RECEIVER, TOP COVER, SIGHTS, HEATSHIELD, BIPOD & STOCK ('frame' · 8 parts) ====================
  {
    id: 'm249_receiver',
    bomCode: 'F-01',
    nameZh: '锰系磷化冲压钢点焊机匣(含双路弹链/STANAG弹匣供弹喉)',
    calloutLabel: '冲压钢双路供弹机匣',
    nameEn: 'Stamped Welded Manganese-Phosphate Receiver w/ Dual Belt/STANAG Feed',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-5.5, 2.2, -1.96],
    labelAppearAt: 0.04,
    roleTag: '电阻点焊硬化内导轨 · 左上M27弹链口+左下斜置M16应急弹匣井',
    description:
      '采用重型冷轧合金钢板冲压折弯并经多排电阻点焊镶嵌硬化内导轨与前锻造枪管节套座，表面覆深灰锰系磷化层；左侧独创上下双通道供弹设计——上方进 M27 弹链，左下方倾斜弹匣井在弹链打光时无需任何改装可直接插入步兵 M16/M4 30 发 STANAG 弹匣应急射击！',
  },
  {
    id: 'm249_top_cover',
    bomCode: 'F-02',
    nameZh: '前铰接压铸铝合金受弹器顶盖(内置S型凸轮槽与皮卡汀尼轨)',
    calloutLabel: '铰接顶盖与内S型凸轮槽',
    nameEn: 'Hinged Die-Cast Top Feed Cover w/ Internal S-Cam Slot & M1913 Rail',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [10.2, 2.65, 0],
    explodeSteps: [
      {
        range: [0.02, 0.18],
        offset: [0, 6.2, 0],
        rotation: [0, 0, -0.42],
      },
      {
        range: [0.34, 0.64],
        offset: [-7.5, 9.8, 0],
        rotation: [0, 0, 0.42],
      },
      { range: [0.68, 0.96], offset: [-4.5, 5.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-12.0, 1.5, 0],
    labelAppearAt: 0.04,
    roleTag: '源自MG42经典双向输弹血统 · 顶置M145机枪瞄具MIL-STD-1913导轨',
    description:
      '前端销轴铰接于节套座上方的轻质压铸铝合金顶盖：顶部铆固 MIL-STD-1913 战术导轨供加装 M145 Elcan 机枪光学镜，内壁顶棚精铸 S 形曲线导轨与压弹簧片，将活塞顶滚轮的前后直线往复转化为拨弹杠杆的左右摆动。',
  },
  {
    id: 'm249_rear_sight',
    bomCode: 'F-03',
    nameZh: '双护翼风偏高低全可调觇孔表尺总成',
    calloutLabel: '双护翼鼓轮觇孔照门',
    nameEn: 'Winged Windage / Elevation Drum Peep Rear Sight',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-12.6, 4.35, 0],
    explodeSteps: [
      { range: [0.02, 0.18], offset: [-2.0, 11.5, 0] },
      { range: [0.36, 0.64], offset: [-3.5, 8.8, 0] },
      { range: [0.68, 0.96], offset: [-2.5, 5.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.4,
    roleTag: '200-1000米分划高低鼓轮 · 两侧厚钢护耳抗跌落冲击',
    description:
      '安装在顶盖尾端的军用精密机械觇孔照门：配备带清脆定位咔哒声的左右风偏旋钮与 200 至 1,000 米（每档 100 米）射程装定滚轮，确保未装光学镜时仍具备 800 米压制点面目标精度。',
  },
  {
    id: 'm249_front_sight',
    bomCode: 'F-04',
    nameZh: '圆环护罩柱状机械前准星座',
    calloutLabel: '圆环护罩柱状准星',
    nameEn: 'Hooded Post Front Sight Assembly',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [35.4, 2.75, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [18.0, 5.2, 0] },
      { range: [0.36, 0.64], offset: [8.5, 6.8, 0] },
      { range: [0.68, 0.96], offset: [4.5, 3.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.42,
    roleTag: '燕尾座锁固于前导气箍 · 圆形防眩光防撞钢护圈',
    description:
      '固定在每根快拆枪管前导气箍顶部的独立准星座：由于 M249 每根备用枪管均随管自带独立归零准星，战场紧急换管后无需重新校枪即可立即精准开火。',
  },
  {
    id: 'm249_handguard',
    bomCode: 'F-05',
    nameZh: '下部隔热护木与上部七孔冲压钢枪管防烫罩总成',
    calloutLabel: '下护木与多孔防烫护罩',
    nameEn: 'Lower Polymer Heatshield & Perforated Upper Barrel Shroud',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [21.8, 0.15, 0],
    explodeSteps: [
      { range: [0.32, 0.62], offset: [0, 11.8, -5.5] },
      { range: [0.68, 0.96], offset: [0, 5.8, -3.5] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, 2.15, 0],
    labelAppearAt: 0.34,
    roleTag: 'M249 PIP标志性散热椭圆孔上护罩 · 消除热浪扭曲瞄准视线',
    description:
      '下部玻纤聚合物护木包覆灼热导气管供立姿抵腰扫射握持，上部拱形冲压磷化钢防烫罩两侧冲有 7 对椭圆形通风散热窗——美军 M249 PIP 升级后彻底防止士兵推进时误触数百度高温枪管并抑制热气遮蔽瞄具。',
  },
  {
    id: 'm249_gas_tube',
    bomCode: 'F-06',
    nameZh: '枪管下置长导气筒与前双脚架铰接箍座',
    calloutLabel: '下置长导气筒与脚架座',
    nameEn: 'Underbarrel Steel Gas Cylinder Tube & Front Bipod Yoke',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [23.8, -0.65, 0],
    explodeSteps: [
      { range: [0.34, 0.64], offset: [9.5, -3.6, 0] },
      { range: [0.68, 0.96], offset: [4.8, -1.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.38,
    roleTag: '机匣前伸刚性支撑骨架 · 引导长活塞直线往复并承载两脚架',
    description:
      '刚性锁固于机匣前下壁的重壁无缝合金钢圆筒：内腔容纳长行程导气活塞全程平顺滑行，前端锻造环箍独立悬挂折叠双脚架，从而令上方枪管保持完全自由浮置（不因架枪受力弯曲影响精度）且拆枪管时无需触碰脚架！',
  },
  {
    id: 'm249_bipod',
    bomCode: 'F-07',
    nameZh: '向后折叠三档伸缩冲压钢双脚架(带雪橇防陷驻锄)',
    calloutLabel: '向后折叠伸缩钢双脚架',
    nameEn: 'Rearward-Folding Telescoping Twin Steel Bipod w/ Ski Feet',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [23.5, -2.55, 0],
    explodeSteps: [
      { range: [0.34, 0.64], offset: [9.5, -7.8, 0] },
      { range: [0.68, 0.96], offset: [4.8, -3.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.38,
    roleTag: '高强度U型槽钢双腿 · 泥雪地宽面雪橇脚垫与左右横滚自适应',
    description:
      '铰接于导气筒前端箍座的重型可调高双脚架：携行突击时向后折叠齐平收纳于下护木两侧凹槽内；卧姿阵地展开后允许枪身绕轴小幅横滚调平，内部不锈钢内腿具备三档高度锁定以适应不同掩体胸墙。',
  },
  {
    id: 'm249_buttstock',
    bomCode: 'F-08',
    nameZh: '高强聚合物固定重机枪托(配顶部折叠钢丝贴肩支板)',
    calloutLabel: '聚合物枪托与折叠肩托架',
    nameEn: 'Glass-Filled Polymer M249 Fixed Buttstock w/ Folding Wire Shoulder Rest',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-30.6, -0.45, 0],
    explodeSteps: [
      { range: [0.1, 0.26], offset: [-18.5, -2.2, 0] },
      { range: [0.36, 0.64], offset: [-9.5, -1.2, 0] },
      { range: [0.68, 0.96], offset: [-6.0, -0.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-8.5, -2.2, 0],
    labelAppearAt: 0.12,
    roleTag: 'M249 PIP重型鱼腹托 · 弱手虎口下勾控枪与钢丝披肩翻板',
    description:
      '美军 M249 PIP 换装的玻纤增强聚酰胺实心枪托（内部容纳液压缓冲器与清枪附件棒）：下缘呈鱼腹内凹便于卧姿射击时左手反握死死压住枪托抑制连发跳动，顶脊嵌有经典的翻折式粗钢丝肩部托板以分摊长点射后坐压强。',
  },

  // ==================== 3. OPEN-BOLT SEAR, TRIGGER PACK & SAFETY ('fire_control' · 4 parts) ====================
  {
    id: 'm249_trigger_frame',
    bomCode: 'FC-01',
    nameZh: '双横销快拆火控盒座、防寒大护圈、横闩保险与防滑握把',
    calloutLabel: '快拆火控座与战术握把',
    nameEn: 'Pinned Steel Trigger Frame, Cross-Bolt Safety & Ribbed Pistol Grip',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [-8.2, -4.6, 0],
    explodeSteps: [
      { range: [0.08, 0.24], offset: [-2.0, -9.2, 0] },
      { range: [0.36, 0.64], offset: [-1.5, -4.2, 0] },
      { range: [0.68, 0.96], offset: [-1.0, -2.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-2.5, -4.5, 0],
    labelAppearAt: 0.1,
    roleTag: '零单发档纯粹全自动压制 · 红环横推保险物理死锁开膛阻铁',
    description:
      '由前后两枚防丢系留横销锁固在机匣腹下的模块化火控总成：M249 不设半自动单发档（老射手凭食指点放轻松打出 2-3 发短点射）；握把上方设横向推钮保险——推向右侧隐去红环锁死阻铁，推向左侧露出鲜红警示环即进入全自动临战态。',
  },
  {
    id: 'm249_trigger',
    bomCode: 'FC-02',
    nameZh: '宽弧面钢制轻机枪扳机与前撬动拨叉',
    calloutLabel: '宽弧面钢制连发扳机',
    nameEn: 'Curved Steel LMG Trigger & Sear-Release Yoke',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-6.4, -3.2, 0],
    explodeSteps: [
      { range: [0.08, 0.24], offset: [-2.0, -9.2, 0] },
      { range: [0.38, 0.66], offset: [5.5, -1.2, 3.8] },
      { range: [0.68, 0.96], offset: [2.5, -0.8, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.4,
    roleTag: '杠杆直接下拽开膛阻铁 · 无击锤纯粹连发闭环',
    description:
      '结构极度强悍简练的机枪扳机：由于开膛机枪无需击锤与单发断连器，扣动宽大扳机弧面即通过顶部拨叉杠杆直接压低开膛阻铁前端，只要食指持续扣住不放，自动机便以约 775 发/分恒定节奏连续吞吐弹链。',
  },
  {
    id: 'm249_open_bolt_sear',
    bomCode: 'FC-03',
    nameZh: '渗碳硬化重型开膛待击主阻铁',
    calloutLabel: '重型开膛待击主阻铁',
    nameEn: 'Case-Hardened Heavy Open-Bolt Sear Catch',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-7.8, -1.55, 0],
    explodeSteps: [
      { range: [0.08, 0.24], offset: [-2.0, -9.2, 0] },
      { range: [0.38, 0.66], offset: [-1.5, 1.8, 3.8] },
      { range: [0.68, 0.96], offset: [-1.0, 0.6, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.4,
    roleTag: '高抗剪硬化挂机鼻 · 拦截数公斤活塞枪机组防止跌落走火',
    description:
      '承受整套长行程活塞与枪机复进簧全部预紧冲击力的核心安全件：表面经深层渗碳淬火处理，松开扳机瞬间向上弹起精准咬合活塞滑块底部的待击方槽，使枪机稳停后方实现弹膛自然对流散热。',
  },
  {
    id: 'm249_sear_spring',
    bomCode: 'FC-04',
    nameZh: '高刚度螺旋开膛阻铁复位簧',
    calloutLabel: '螺旋开膛阻铁复位簧',
    nameEn: 'High-Tension Helical Open-Bolt Sear Return Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-7.2, -2.65, 0],
    assembledRot: [0, 0, Math.PI / 2],
    explodeSteps: [
      { range: [0.08, 0.24], offset: [-2.0, -9.2, 0] },
      { range: [0.38, 0.66], offset: [-6.5, -1.2, 3.8] },
      { range: [0.68, 0.96], offset: [-3.2, -0.8, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.42,
    roleTag: '垂直顶升重型阻铁 · 确保松手瞬间零迟滞截停连发循环',
    description:
      '垂直预压在火控盒底板与开膛阻铁下腹之间的重磅琴钢丝螺旋压簧：提供充沛向上的复位扭矩，保证射手在泥泞颠簸中一旦松开扳机，阻铁鼻能在数毫秒内果断升起截停高速回弹的活塞滑块。',
  },

  // ==================== 4. DUAL-PAWL BELT SHUTTLE, FEED TRAY, M27 BELT & 200-RD BOX ('magazine' · 5 parts) ====================
  {
    id: 'm249_feed_tray',
    bomCode: 'M-01',
    nameZh: '冲压钢横向加强筋受弹器托盘(带右挡弹壁与左进链喇叭口)',
    calloutLabel: '冲压钢弹链受弹器托盘',
    nameEn: 'Stamped Steel Ribbed 5.56mm Belt Feed Tray w/ Cartridge Stop',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [-0.8, 1.4, 0],
    explodeSteps: [
      { range: [0.06, 0.22], offset: [0, 3.8, -5.2] },
      { range: [0.36, 0.64], offset: [0.5, 2.8, -3.5] },
      { range: [0.68, 0.96], offset: [0.3, 1.8, -2.2] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.1,
    roleTag: '半圆输弹定位槽与右侧挡弹肩 · 向上掀起即可检查下弹匣井',
    description:
      '横跨机匣上口的锰磷化冲压钢受弹盘：左缘卷制光滑圆弧喇叭口大幅降低从下方弹箱向上提拉 200 发弹链的摩擦阻力，中央半圆凹槽配合右侧垂直挡弹壁将待发 5.56mm 实弹精准锁定在枪机推弹角正前方。',
  },
  {
    id: 'm249_feed_lever',
    bomCode: 'M-02',
    nameZh: '顶盖枢轴S型分叉拨弹曲柄杠杆',
    calloutLabel: 'S型分叉拨弹曲柄杠杆',
    nameEn: 'Pivoting Forked Belt-Feed Cam Lever',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [-1.2, 3.05, 0],
    explodeSteps: [
      { range: [0.02, 0.18], offset: [0, 6.2, 0] },
      { range: [0.36, 0.64], offset: [0, 5.2, 5.5] },
      { range: [0.68, 0.96], offset: [0, 2.5, 3.2] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.38,
    roleTag: '尾叉骑跨活塞顶滚轮 · 纵轴平移毫秒级转换为横向拨链冲程',
    description:
      '铰接在顶盖中央枢轴柱上的高耐磨冲压钢杠杆：后端双叉精准夹持活塞滑块顶部的直立钢滚轮，前端球头嵌入拨弹滑板槽；每当活塞前后冲刺一次，杠杆便如钟摆般左右摆动驱动拨弹爪步进一发弹距（13.6 mm）！',
  },
  {
    id: 'm249_feed_pawls',
    bomCode: 'M-03',
    nameZh: '双级弹簧棘爪横向梭动拨弹滑板组',
    calloutLabel: '双级棘爪横向拨弹滑板',
    nameEn: 'Dual-Stage Spring-Loaded Shuttle Feed Slide & Holding Pawls',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [-0.8, 2.28, -0.65],
    explodeSteps: [
      { range: [0.02, 0.18], offset: [0, 6.2, 0] },
      { range: [0.36, 0.64], offset: [0.8, 5.8, -5.8] },
      { range: [0.68, 0.96], offset: [0.4, 2.5, -3.2] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.38,
    roleTag: '后坐与复进双行程分摊输弹负载 · 提升200发重链爬升可靠性',
    description:
      '传承自二战 MG42 并由 FN 精进的双级接力拨弹机构：内外两组弹簧棘齿拨爪在枪机后坐与复进两个半周内协同工作，既在向左回程时顺畅滑过下一节 M27 链节并防止弹链因重力坠回弹箱，又在向右推程时将实弹稳稳送抵受弹中轴线！',
  },
  {
    id: 'm249_m27_belt',
    bomCode: 'M-04',
    nameZh: 'M27可散金属弹链与5.56mm M855绿尖穿甲普通弹链段',
    calloutLabel: 'M27可散钢链与M855弹段',
    nameEn: 'Linked M27 Disintegrating Metallic Belt w/ M855 Green-Tip Rounds',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [-0.8, 0.2, -2.85],
    explodeSteps: [
      { range: [0.03, 0.18], offset: [0.4, 1.2, -8.5] },
      { range: [0.36, 0.64], offset: [0.4, 0.2, -3.5] },
      { range: [0.68, 0.96], offset: [0.2, 0, -2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, 1.28, 1.5],
    labelAppearAt: 0.05,
    roleTag: '北约STANAG 4172可散弹簧钢链 · 推弹瞬间空链节自动向右下散落',
    description:
      '美军标准 M27 锰磷化高弹弹簧钢可散弹链（串联 C26000 黄铜壳与 62 格令绿尖 M855 钢芯弹）：每发弹本身充当相邻两枚三环链节的铰接销轴！当枪机将首枚实弹向前推出链环入膛后，失去芯轴的空链节便由后续来弹自动向右下方顶出散落，绝无长空链拖挂缠绕之虞。',
  },
  {
    id: 'm249_ammo_box',
    bomCode: 'M-05',
    nameZh: '200发橄榄绿防滑加强筋聚合物下挂突击弹箱',
    calloutLabel: '200发下挂聚合物弹链箱',
    nameEn: '200-Rd OD-Green Ribbed Polymer Under-Receiver SAW Assault Box',
    group: 'magazine',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [1.5, -7.8, -0.65],
    explodeSteps: [
      { range: [0.04, 0.2], offset: [1.0, -7.8, -6.5] },
      { range: [0.36, 0.64], offset: [0.6, -3.8, -3.5] },
      { range: [0.68, 0.96], offset: [0.4, -2.2, -2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [0, -1.5, -4.5],
    labelAppearAt: 0.05,
    roleTag: '机匣底T型燕尾卡笋快挂 · 容纳整条200发M27折叠弹链单兵冲锋',
    description:
      '通过顶部中央弹性 T 形卡笋直接锁挂于机匣底部的橄榄绿（OD Green）抗冲击聚酰胺硬壳弹箱：内部折叠收纳整整 200 发 5.56mm M27 弹链（满载总重约 3.1 kg），赋予单名机枪手等同于近 7 个步枪弹匣的不间断立姿突击压制火力！',
  },
];

export const M249_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'm249_sear_drop',
    stepNum: '01',
    shortLabel: '扣扳机降开膛阻铁',
    title: '阶段 1 · 扣动扳机压下重型开膛阻铁，预压复进簧释放长行程活塞滑块',
    range: [0.0, 0.08],
    description:
      '横闩保险推至红环射击位，食指扣动扳机通过拨叉拉低渗碳开膛阻铁前端；原本被阻铁牢牢锁在后方待击位的重型长行程活塞滑块瞬间脱钩，在预压缩长复进簧强力推顶下启动高速前冲。',
  },
  {
    id: 'm249_strip_lock_ignite',
    stepNum: '02',
    shortLabel: '剥弹脱链闭锁即发',
    title: '阶段 2 · 枪机前冲推出 M27 弹链首弹入膛，双突笋旋转闭锁并同步突伸击针击发',
    range: [0.08, 0.22],
    description:
      '双突笋枪机顶部推弹角自受弹器中央将 5.56×45mm M855 实弹向前直接推出 M27 开口钢链节导入弹膛；枪机抵定膛口后滑块继续前冲最后 6.5 mm，螺旋槽迫使枪机顺时针旋转 30°（0.52 rad）锁入节套，滑块联动击针同步探出镜面瞬时引燃底火！',
  },
  {
    id: 'm249_gas_tap_dwell',
    stepNum: '03',
    shortLabel: '越导气孔引气泄压',
    title: '阶段 3 · M855 弹头越过前导气孔引气入下导气筒，直线自由行程确保安全泄压',
    range: [0.22, 0.33],
    description:
      '430 MPa 高压燃气推动 62 格令绿尖弹沿 18.3 英寸镀铬枪管加速并在 f=0.31 以约 915 m/s 初速射出鸟笼消焰器；弹头越过前导气箍后分流燃气冲入下导气筒杯状活塞头，滑块先行后退直槽自由段确保膛压安全回落。',
  },
  {
    id: 'm249_unlock_extract_eject',
    stepNum: '04',
    shortLabel: '长活塞旋锁抛壳链',
    title: '阶段 4 · 长行程活塞带动双突笋逆旋开锁，向右侧抛出黄铜空壳与散落 M27 链节',
    range: [0.33, 0.5],
    description:
      '活塞滑块螺旋导槽驱动枪机逆时针旋转 30° 解脱节套，宽爪抽壳钩拉出炙热 5.56mm 空弹壳并在 f=0.50 由机匣右侧下抛壳窗猛烈抛出，上一发遗留的空 M27 弹簧钢链节亦同步由右上排链口散落。',
  },
  {
    id: 'm249_shuttle_belt_overtravel',
    stepNum: '05',
    shortLabel: '顶滚轮拨链与缓冲',
    title: '阶段 5 · 滑块顶滚轮驱动 S 型拨弹叉横移弹链一发，尾端撞入枪托液压缓冲器',
    range: [0.5, 0.64],
    description:
      '后坐滑块顶端垂直滚轮滑过顶盖内 S 形曲线槽，撬动分叉拨弹杠杆与双级棘爪滑板向右（+Z）横推 M27 弹链，将下一发 M855 实弹精准送抵受弹器挡弹壁；同时滑块向后越过阻铁约 23.5 mm 压缩枪托液压缓冲柱塞平抑冲击。',
  },
  {
    id: 'm249_buffer_rebound',
    stepNum: '06',
    shortLabel: '液压吸能平顺回弹',
    title: '阶段 6 · 枪托液压阻尼器与压紧复进簧协同推顶活塞滑块向前平顺回弹',
    range: [0.64, 0.82],
    description:
      '液压缓冲器内部硅油经节流孔吸收过剩后坐能量，杜绝刚性撞击反弹；压紧的长螺旋复进簧随即平顺推顶活塞滑块与未闭锁枪机从后极限越程位（-2.35 cm）向前滑回待击挂机区间。',
  },
  {
    id: 'm249_open_bolt_catch',
    stepNum: '07',
    shortLabel: '开膛挂机通风待发',
    title: '阶段 7 · 松开扳机重型开膛阻铁弹起截停滑块，弹膛敞开自然散热恢复待击',
    range: [0.82, 1.0],
    description:
      '射手松开扳机后，高张力阻铁簧将重型开膛阻铁向上顶起，精准卡入回弹滑块底部的硬化待击缺口（若持续扣住扳机则无停顿直接进入下一发前冲循环！）；弹膛保持空置敞开避免高热枪管烤燃弹药。',
  },
];

// ============================================================================
// OPEN-BOLT LONG-STROKE PISTON & DUAL-PAWL BELT SHUTTLE KINEMATICS (f in [0, 1])
// ============================================================================

const M249_FORWARD_BOLT_STROKE = 9.5; // Cocked face (-3.90) -> Chamber breech (+5.60)
const M249_CAM_LOCK_STROKE = 0.65; // Additional slide lockup & firing-pin cam stroke (-> +10.15)
const M249_REAR_OVERTRAVEL = 2.35; // Hydraulic buffer overtravel behind open-bolt sear (-> -2.35 < -2.0!)
const M249_LOCK_RAD = 0.52; // ~29.8° 2-lug rotating bolt lockup (>= 0.45 rad!)

interface M249OperatingGroupSample {
  carrierDX: number;
  boltDX: number;
  boltRX: number;
  pinRelBoltDX: number;
  bufferDX: number;
}

function sampleM249OpenBoltGroup(f: number): M249OperatingGroupSample {
  const fullCarrierForward = M249_FORWARD_BOLT_STROKE + M249_CAM_LOCK_STROKE; // +10.15 cm

  // 1. Carrier longitudinal position relative to Open-Bolt Cocked Sear Datum (0 at f=0 AND f=1!)
  let carrierDX = 0;
  if (f >= 0.03 && f < 0.185) {
    // Forward feed-stripping rush under driving spring: 0 -> +9.50 cm
    carrierDX = M249_FORWARD_BOLT_STROKE * seg(f, 0.03, 0.185);
  } else if (f >= 0.185 && f < 0.22) {
    // Final +0.65 cm cam lockup & slide-linked firing-pin protrusion stroke: +9.50 -> +10.15 cm
    carrierDX =
      M249_FORWARD_BOLT_STROKE + M249_CAM_LOCK_STROKE * seg(f, 0.185, 0.22);
  } else if (f >= 0.22 && f < 0.295) {
    // Locked in battery during peak 5.56 NATO chamber pressure
    carrierDX = fullCarrierForward;
  } else if (f >= 0.295 && f < 0.35) {
    // Initial gas-piston rearward cam-unlock stroke: +10.15 -> +9.50 cm (bolt stays axially locked/unlocking!)
    carrierDX =
      fullCarrierForward - M249_CAM_LOCK_STROKE * seg(f, 0.295, 0.35);
  } else if (f >= 0.35 && f < 0.56) {
    // Full long-stroke gas recoil past sear notch into hydraulic buffer overtravel: +9.50 -> -2.35 cm!
    carrierDX =
      M249_FORWARD_BOLT_STROKE -
      (M249_FORWARD_BOLT_STROKE + M249_REAR_OVERTRAVEL) * seg(f, 0.35, 0.56);
  } else if (f >= 0.56 && f < 0.6) {
    // Hydraulic buffer dwell at rear overtravel limit (-2.35 cm)
    carrierDX = -M249_REAR_OVERTRAVEL;
  } else if (f >= 0.6 && f < 0.79) {
    // Smooth hydraulic buffer & driving-spring rebound onto open-bolt sear catch: -2.35 -> 0.00 cm!
    carrierDX = -M249_REAR_OVERTRAVEL * (1.0 - seg(f, 0.6, 0.79));
  }

  // 2. Bolt axial travel, 2-lug rotation (+0.52 rad in battery), and slide-linked firing-pin protrusion
  let boltDX = carrierDX;
  let boltRX = 0;
  let pinRelBoltDX = 0;

  if (carrierDX > M249_FORWARD_BOLT_STROKE) {
    boltDX = M249_FORWARD_BOLT_STROKE;
    const camU = smoothstep01(
      (carrierDX - M249_FORWARD_BOLT_STROKE) / M249_CAM_LOCK_STROKE
    );
    boltRX = M249_LOCK_RAD * camU;
    // Firing pin only crosses bolt face in the upper half of lockup cam (`camU > 0.45`)!
    pinRelBoltDX = 0.34 * smoothstep01((camU - 0.4) / 0.6);
  }

  // 3. Hydraulic buffer plunger compression during carrier rear overtravel (`carrierDX < -0.60`)
  let bufferDX = 0;
  if (carrierDX < -0.6) {
    const overU = smoothstep01(
      (-carrierDX - 0.6) / (M249_REAR_OVERTRAVEL - 0.6)
    );
    bufferDX = -0.82 * overU;
  }

  return { carrierDX, boltDX, boltRX, pinRelBoltDX, bufferDX };
}

export function computeM249FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let scaleX = 1;

  const { carrierDX, boltDX, boltRX, pinRelBoltDX, bufferDX } =
    sampleM249OpenBoltGroup(f);

  // Open-bolt sear depression profile (drops -Y to release carrier at [0.01..0.05], rises at [0.58..0.66],
  // briefly ratchets down as rebounding carrier cam passes at [0.68..0.77], then locks crisp at 0!)
  const searPullDrop = seg(f, 0.008, 0.045) - seg(f, 0.56, 0.65);
  const searRatchetBump =
    f > 0.68 && f < 0.78 ? Math.sin(linearSeg(f, 0.68, 0.78) * Math.PI) * 0.45 : 0;
  const searDrop01 = clamp01(searPullDrop + searRatchetBump);

  switch (partId) {
    case 'm249_piston_carrier': {
      dx = carrierDX;
      break;
    }

    case 'm249_bolt': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'm249_firing_pin': {
      dx = boltDX + pinRelBoltDX;
      break;
    }

    case 'm249_recoil_spring': {
      // Local spring spans [-8.50, +8.50] (L0 = 17.00 cm), rear end pinned at pinAnchorX = -8.50:
      // Extends to scaleX = 1.597 as open-bolt carrier slams forward (+10.15 cm),
      // then compresses to scaleX = 0.862 during hydraulic buffer overtravel (-2.35 cm)!
      const pinAnchorX = -8.5;
      const L0 = 17.0;
      const LNew = Math.max(8.0, L0 + carrierDX);
      scaleX = LNew / L0;
      dx = pinAnchorX * (1 - scaleX);
      break;
    }

    case 'm249_hydraulic_buffer': {
      dx = bufferDX;
      break;
    }

    case 'm249_trigger': {
      const pull = seg(f, 0.0, 0.05) - seg(f, 0.55, 0.65);
      rz = -0.24 * pull;
      break;
    }

    case 'm249_open_bolt_sear': {
      dy = -0.38 * searDrop01;
      rz = 0.06 * searDrop01;
      break;
    }

    case 'm249_sear_spring': {
      // Vertical helical spring (`assembledRot: [0, 0, +pi/2]`, local X in [-0.75, +0.75], w = 1):
      // Bottom coil pinned at pinAnchorX = -0.75 -> world Y stays stationary via `dy = pinAnchorX * (1 - scaleX)`!
      const pinAnchorX = -0.75;
      scaleX = 1 - 0.24 * searDrop01;
      dy = pinAnchorX * (1 - scaleX);
      break;
    }

    case 'm249_feed_lever': {
      // Driven by carrier's top roller in `m249_top_cover` S-cam channel:
      // Swings one way as carrier rushes forward (`carrierDX > 0`) and opposite way during recoil indexing!
      const forwardSwing = seg(f, 0.05, 0.19) - seg(f, 0.34, 0.54);
      const overtravelSwing = seg(f, 0.42, 0.56) - seg(f, 0.62, 0.78);
      ry = -0.15 * forwardSwing + 0.12 * overtravelSwing;
      break;
    }

    case 'm249_feed_pawls': {
      // Dual-stage shuttle slide: reaches left (-Z = -0.68 cm) during forward bolt stroke to hook next M27 link,
      // then shuttles right (+Z) during recoil [0.36..0.68] to index the M27 belt one 13.6 mm pitch!
      const reachLeft = seg(f, 0.05, 0.19) - seg(f, 0.36, 0.56);
      const indexRight = seg(f, 0.38, 0.56) - seg(f, 0.62, 0.78);
      dz = -0.68 * reachLeft + 0.46 * indexRight;
      break;
    }

    case 'm249_m27_belt': {
      // Subtle belt advance & catenary tension wave as feed pawls pull belt rightward (+Z) across feed tray
      const beltPulse =
        f > 0.36 && f < 0.74 ? Math.sin(linearSeg(f, 0.36, 0.74) * Math.PI) : 0;
      dz = 0.42 * beltPulse;
      dy = 0.08 * beltPulse;
      break;
    }

    // m249_barrel (fixed!), m249_charging_handle (non-reciprocating!), m249_receiver, m249_top_cover stay stationary
    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Authentic Open-Bolt 5.56x45mm NATO M855 Belt-Fed Internal & External Ballistics:
 *  - `f = 0` & `f = 1`: Open-bolt cocked state — chamber is 100% EMPTY (`spentCaseVisible = false`,
 *    `bulletVisible = false`), active linked M855 cartridge rests on `m249_feed_tray` at `[-0.80, 1.56, 0]`!
 *  - `f in [0.04, 0.215)`: Advancing bolt strips active cartridge forward out of M27 link into chamber `[6.82, 1.25, 0]`!
 *  - `ignitionF = 0.22` -> `muzzleExitF = 0.31`: Instant open-bolt primer ignition upon 2-lug lockup;
 *    62gr M855 projectile accelerates past underbarrel gas port `X = 34.80` and exits birdcage `X = 57.30`!
 *  - `f in [0.35, 0.50]` -> `ejectF = 0.50`: Spent 5.56mm brass extracts & hurls out right-lower ejection port (`+Z`),
 *    while `m249_feed_pawls` indexes the next linked M855 round laterally (`Z: -1.36 -> 0.00`) onto the feed tray!
 */
export function computeM249BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const { boltDX } = sampleM249OpenBoltGroup(f);

  // 1. 5.56x45mm NATO 62gr M855 Penetrator Projectile (open-bolt ignition at 0.22 -> exits 18.3" barrel + birdcage X=57.30 at 0.31!)
  const bulletVisible = f >= 0.215 && f < 0.46;
  let bulletX = 8.8;
  let streakLength = 0;

  if (f >= 0.22 && f < 0.31) {
    const u = Math.pow(linearSeg(f, 0.22, 0.31), 1.45);
    bulletX = 8.8 + (57.3 - 8.8) * u;
    streakLength = 6.0 * u;
  } else if (f >= 0.31 && f < 0.46) {
    const u = linearSeg(f, 0.31, 0.46);
    bulletX = 57.3 + 76.0 * u;
    streakLength = 13.5 * (1 - u * 0.45);
  }

  // 2. Chambered / Extracting 5.56x45mm Brass Case (empty chamber at f=0 & f=1; extracts [0.35, 0.50], ejects at ejectF = 0.50!)
  const spentCaseVisible = f >= 0.215 && f < 0.78;
  let caseX = 6.82;
  let caseY = 1.25;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.35 && f < 0.5) {
    // Bolt travels rearward from +9.50 at f=0.35 -> case tracks (boltDX - 9.50) out of chamber!
    caseX = 6.82 + (boltDX - M249_FORWARD_BOLT_STROKE);
  } else if (f >= 0.5 && f < 0.78) {
    const u = linearSeg(f, 0.5, 0.78);
    const ejectOriginX =
      6.82 + (sampleM249OpenBoltGroup(0.5).boltDX - M249_FORWARD_BOLT_STROKE);
    caseX = ejectOriginX + 3.2 * u;
    caseY = 1.25 + 3.8 * u - 12.5 * u * u;
    caseZ = 14.2 * u;
    caseRX = u * 9.4;
    caseRY = -u * 14.2;
    caseRZ = -u * 11.6;
    if (f > 0.65) {
      spentCaseOpacity = 1 - linearSeg(f, 0.65, 0.78);
    }
  }

  // 3. Open-Bolt Chamber Flash, Front Gas Regulator Port Tap & Birdcage Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.218 && f <= 0.295) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.218, 0.295) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.275 && f <= 0.365) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.275, 0.365) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.302 && f <= 0.395) {
    const u = linearSeg(f, 0.302, 0.395);
    muzzlePlumeScale = 0.48 + 1.55 * Math.pow(u, 0.54);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.84;
  }

  // 4. Open-Bolt Belt-Fed Cartridge Choreography:
  //    - [0.00..0.215): Active Round #1 stripped forward off feed tray [-0.80, 1.56, 0] into chamber [6.82, 1.25, 0]!
  //    - [0.215..0.36): Seamless handoff to Round #2 waiting on left feed pawls [-0.80, 1.56, -1.36]!
  //    - [0.36..0.68): Dual-pawl shuttle indexes Round #2 laterally (+Z) from Z = -1.36 onto cartridge stop Z = 0.00!
  //    - [0.68..1.00]: Round #2 rests at [-0.80, 1.56, 0] in front of open-bolt cocked bolt (endpointJump === 0!).
  let nextX = -0.8;
  let nextY = 1.56;
  let nextZ = 0;
  let nextRZ = -0.02;

  if (f >= 0.035 && f < 0.215) {
    const u = seg(f, 0.035, 0.2);
    nextX = -0.8 + (6.82 - -0.8) * u;
    nextY = 1.56 + (1.25 - 1.56) * smoothstep01(u);
    nextZ = 0;
    nextRZ = -0.02 * (1 - u) - 0.05 * Math.sin(u * Math.PI);
  } else if (f >= 0.215 && f < 0.36) {
    nextX = -0.8;
    nextY = 1.56;
    nextZ = -1.36;
    nextRZ = -0.02;
  } else if (f >= 0.36 && f < 0.68) {
    const u = seg(f, 0.36, 0.68);
    nextX = -0.8;
    nextY = 1.56 + 0.04 * Math.sin(u * Math.PI);
    nextZ = -1.36 * (1 - u);
    nextRZ = -0.02;
  }

  // 5. Reserve Linked Cartridge advancing one M27 pitch along the left feed horn (-2.68 -> -1.36)
  const beltAdvance = seg(f, 0.36, 0.68);
  const resX = -0.8;
  const resY = 1.42 + (1.56 - 1.42) * beltAdvance;
  const resZ = -2.68 + (-1.36 - -2.68) * beltAdvance;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.25, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [34.8, 0.35, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, resZ],
  };
}

export const M249_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  m249_receiver: {
    albedoFile: 'm249_receiver_albedo.webp',
    normalFile: 'm249_receiver_normal.webp',
    roughnessFile: 'm249_receiver_roughness.webp',
    normalScale: 0.48,
  },
  m249_top_cover: {
    albedoFile: 'm249_receiver_albedo.webp',
    normalFile: 'm249_receiver_normal.webp',
    roughnessFile: 'm249_receiver_roughness.webp',
    normalScale: 0.42,
  },
  m249_rear_sight: {
    albedoFile: 'm249_receiver_albedo.webp',
    normalFile: 'm249_receiver_normal.webp',
    roughnessFile: 'm249_receiver_roughness.webp',
    normalScale: 0.38,
  },
  m249_handguard: {
    albedoFile: 'm249_receiver_albedo.webp',
    normalFile: 'm249_receiver_normal.webp',
    roughnessFile: 'm249_receiver_roughness.webp',
    normalScale: 0.44,
  },
  m249_barrel: {
    albedoFile: 'm249_receiver_albedo.webp',
    normalFile: 'm249_receiver_normal.webp',
    roughnessFile: 'm249_receiver_roughness.webp',
    normalScale: 0.42,
  },
  m249_piston_carrier: {
    albedoFile: 'm249_receiver_albedo.webp',
    normalFile: 'm249_receiver_normal.webp',
    roughnessFile: 'm249_receiver_roughness.webp',
    normalScale: 0.4,
  },
  m249_ammo_box: {
    albedoFile: 'm249_beltbox_albedo.webp',
    normalFile: 'm249_beltbox_normal.webp',
    roughnessFile: 'm249_beltbox_roughness.webp',
    normalScale: 0.52,
  },
  m249_buttstock: {
    albedoFile: 'm249_beltbox_albedo.webp',
    normalFile: 'm249_beltbox_normal.webp',
    roughnessFile: 'm249_beltbox_roughness.webp',
    normalScale: 0.46,
  },
  m249_trigger_frame: {
    albedoFile: 'm249_beltbox_albedo.webp',
    normalFile: 'm249_beltbox_normal.webp',
    roughnessFile: 'm249_beltbox_roughness.webp',
    normalScale: 0.46,
  },
  m249_barrel_handle: {
    albedoFile: 'm249_beltbox_albedo.webp',
    normalFile: 'm249_beltbox_normal.webp',
    roughnessFile: 'm249_beltbox_roughness.webp',
    normalScale: 0.42,
  },
  m249_m27_belt: {
    albedoFile: 'm249_beltbox_albedo.webp',
    normalFile: 'm249_beltbox_normal.webp',
    roughnessFile: 'm249_beltbox_roughness.webp',
    normalScale: 0.44,
  },
  m249_feed_tray: {
    albedoFile: 'm249_beltbox_albedo.webp',
    normalFile: 'm249_beltbox_normal.webp',
    roughnessFile: 'm249_beltbox_roughness.webp',
    normalScale: 0.42,
  },
};

export const M249_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'm249_receiver',
    weapon: M249_ID,
    titleCn:
      '美军 M249 SAW 锰系磷化冲压点焊机匣、压铸顶盖导轨与热回火快拆枪管贴图组',
    partTag: 'F-01 / F-02 / B-01 / B-04 STAMPED RECEIVER & CHF BARREL',
    resolution: '2048 × 1024 px',
    summary:
      '专为哥伦比亚 FN Manufacturing Inc. 美军制式 M249 班用机枪烘焙的 2K 5 通道 Packed ORM 贴图组：下半幅刻画锰系磷化冲压钢机匣的电阻点焊凹坑法线、内导轨磨亮面与「MACHINE GUN 5.56MM M249 · FN MANUFACTURING INC. COLUMBIA, SC U.S.A.」深镌铭文；中栏呈现压铸铝合金铰接顶盖的 MIL-STD-1913 T2-T12 激光槽位码与内部 S 型拨弹凸轮槽；顶栏还原 18.3 英寸冷锻快拆枪管在持续火力下的微黄紫热回火色带与镀硬铬闭锁节套。',
    highlights: [
      '冲压钢机匣电阻点焊凹坑法线与 FN Manufacturing Columbia SC 原厂钢印',
      '铰接顶盖 MIL-STD-1913 皮卡汀尼导轨 T 槽位标刻与内壁磨亮 S 型凸轮道',
      '18.3" 快拆枪管 5.56 NATO 1/7 钢印、热回火色带与硬铬活塞/滚轮(0.18)反差',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm249_receiver_albedo.webp',
        note: 'sRGB · 锰系磷化冲压钢 / FN哥伦比亚铭文 / 枪管热回火与硬铬节套',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'm249_receiver_normal.webp',
        note: 'Linear · 机匣电阻点焊凹坑 + 冲压加强筋 + 滚花导气环与深凹钢印',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'm249_receiver_roughness.webp',
        note: 'Linear · R:点焊与肋槽AO / G:磷化层(0.47)-磨亮内轨与硬铬(0.18) / B:全金属分层',
      },
    ],
  },
  {
    id: 'm249_beltbox',
    weapon: M249_ID,
    titleCn:
      '200发橄榄绿聚合物弹链箱、M27可散钢链、M855绿尖弹与PIP重枪托贴图组',
    partTag: 'M-04 / M-05 / F-08 / FC-01 200-RD SAW BOX & M27 BELT',
    resolution: '2048 × 1024 px',
    summary:
      '真实还原美军步兵班火力支柱的弹药与人机工程材质对比：下幅呈现橄榄绿（OD Green）玻纤尼龙 200 发下挂弹箱的纵横防瘪加强筋、模具蚀纹与军黄喷涂「200 RD 5.56MM M27 LINK · M855 BALL」军火库字模；中栏分离炭黑聚酰胺 PIP 重枪托、握把防滑点阵与拉丝钢折叠披肩支杆；顶栏精细区分哑光黑锰磷化 M27 弹簧钢链节、退火瓶颈 C26000 黄铜壳与北约标准 M855 绿色钢芯穿甲弹尖！',
    highlights: [
      '200 发橄榄绿突击弹箱纵横加强筋与军黄 200 RD 5.56MM M27 LINK 喷印字模',
      '炭黑玻纤聚酰胺 PIP 鱼腹枪托、防滑握把蚀纹与折叠钢丝肩托物理金属度分离',
      '哑光黑 M27 可散弹簧钢链、退火口部 C26000 黄铜壳与 M855 绿漆穿甲弹尖',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'm249_beltbox_albedo.webp',
        note: 'sRGB · 橄榄绿200发弹箱军黄字模 / 炭黑枪托 / M27黑钢链与M855绿尖铜弹',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'm249_beltbox_normal.webp',
        note: 'Linear · 弹箱纵横凸筋 + 聚酰胺VDI火花纹 + 握把激光防滑点阵 + M27冲压字',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'm249_beltbox_roughness.webp',
        note: 'Linear · 绝缘尼龙弹箱(B=0.03,G=0.60) vs M27磷化钢链(0.82) vs 抛光铜壳(0.94)',
      },
    ],
  },
  {
    id: 'm249_seamless_detail',
    weapon: M249_ID,
    titleCn: '开膛双笋枪机、双级拨弹滑板、液压缓冲器与双脚架无缝金属细节贴图',
    partTag: '14 ORDNANCE INTERNAL & BIPOD PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为镀硬铬双突笋回转枪机、滑块联动防早发长击针、右侧非随动拉机柄、长螺旋复进驱动簧、枪托内置液压缓冲器、渗碳重型开膛阻铁、S 型分叉拨弹杠杆、双级棘爪梭动滑板、下导气筒与折叠伸缩钢双脚架等 14 个核心机械构件提供微米级 CNC 车铣刀纹与驻留枪油光泽细节。',
    highlights: [
      '镀硬铬双突笋回转枪机、液压阻尼柱塞与滑块联动击针精密无心磨削纹',
      'S 型分叉拨弹曲柄、双级弹簧拨爪与重型渗碳开膛阻铁接触面微磨损油膜',
      '覆盖其余全部 14 个高强度持续连发承力、导气、阻尼与阵地依托构件',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 车铣拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于双突笋枪机/联动击针/液压缓冲器/拨弹曲柄/双级拨爪/折叠双脚架等',
      },
      {
        kind: 'Roughness',
        labelCn: '军械金属油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 重机枪 CLP 润滑油膜与高频摩擦面微光泽起伏',
      },
      {
        kind: 'Normal',
        labelCn: '微细颗粒基底法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 辅助微观表面漫反射散射与驻锄/护圈接触面微纹理',
      },
    ],
  },
];

export const M249_PLUGIN: WeaponRuntimePlugin = {
  id: M249_ID,
  partGroups: M249_PART_GROUPS,
  timelinePresets: M249_TIMELINE_PRESETS,
  parts: M249_PARTS,
  firingPhases: M249_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(M249_FIRING_PHASES, f),
  computeFiringKinematics: computeM249FiringKinematics,
  computeBallisticsState: computeM249BallisticsState,
  pbrBindings: M249_PBR_BINDINGS,
  pbrSuites: M249_PBR_SUITES,
};
