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

export const WINCHESTER1894_ID: WeaponId = 'winchester1894';
export const WINCHESTER1894_CALIBER: CaliberProfile = '30_30_win';

export const WINCHESTER1894_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '20英寸枪管、垂直闭锁块、顶抛机头与D型杠杆组',
    nameEn: '20" Barrel, Rising Locking Block, Bolt & D-Loop Lever',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '顶抛铣削钢机匣、马鞍环与黑胡桃木护木枪托组',
    nameEn: 'Top-Eject Forged Receiver, Saddle Ring & Walnut Furniture',
    badgeColor: '#a16207',
  },
  {
    key: 'fire_control',
    nameZh: '外露滚花击锤、杠杆连杆保险与螺旋主簧组',
    nameEn: 'Exposed Checkered Hammer, Tang Safety & Helical Mainspring',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '全长下挂管式弹仓、金氏侧装弹口与黄铜托弹勺组',
    nameEn: 'Tubular Magazine, King Side Loading Gate & Brass Carrier',
    badgeColor: '#fb923c',
  },
];

export const WINCHESTER1894_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: '温彻斯特 1894 型马鞍环杠杆卡宾枪（Winchester Model 1894 .30-30 WCF）：全长管式弹仓配合金氏侧面弹簧装弹口供弹，H 型垂直升降闭锁块在枪机尾端死锁承受无烟火药高压。',
  },
  {
    id: 'field_strip',
    label: '连杆杠杆核心分解',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '抽出 D 型扳机杠杆与底部铰接连杆，下放垂直 H 型闭锁块，向后抽出顶抛圆柱枪机并卸下美洲黑胡桃木直握把枪托与前护木。',
  },
  {
    id: 'sub_assembly',
    label: '管仓/闭锁/火控细拆',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '拆解全长下挂管式弹仓与黄铜升降托弹勺，分离左侧马鞍铁环、右侧金氏装弹口活门及外露击锤螺旋主簧系统。',
  },
  {
    id: 'full_exploded',
    label: '全枪 24 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 24 个 1:1 机械零件零遮挡展开：完整呈现约翰·摩西·勃朗宁在 1894 年为美国首款无烟火药猎枪设计的升降闭锁与杠杆托弹机构。',
  },
];

export const WINCHESTER1894_PARTS: WeaponPartSpec[] = [
  // ==================== 1. BARREL, BOLT, RISING LOCKING BLOCK & LEVER ('slide' · 7 parts) ====================
  {
    id: 'win94_barrel',
    bomCode: 'B-01',
    nameZh: '20英寸 .30-30 WCF 锥形烤蓝圆枪管',
    calloutLabel: '20英寸.30-30锥形枪管',
    nameEn: '20" .30-30 WCF Tapered Blued Round Barrel',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [30.8, 1.45, 0],
    explodeSteps: [{ range: [0.22, 0.56], offset: [8.0, 5.5, 0] }],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [16.0, 0.9, 0],
    labelAppearAt: 0.05,
    roleTag: '508mm 六膛线 1:12缠距 · 世界首款无烟火药民间猎枪枪管',
    description:
      '专为高膛压（290 MPa）无烟火药 .30-30 Winchester（.30 WCF）开发的 20 英寸高强度镍铬合金钢锥形枪管，旋入锻造钢机匣螺纹节套。',
  },
  {
    id: 'win94_front_sight',
    bomCode: 'B-02',
    nameZh: '燕尾座黄铜珠前准星',
    calloutLabel: '黄铜珠前准星',
    nameEn: 'Ramp Dovetail Brass-Bead Front Sight',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [54.2, 2.55, 0],
    explodeSteps: [
      { range: [0.22, 0.56], offset: [8.0, 5.5, 0] },
      { range: [0.56, 0.92], offset: [11.0, 7.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.3,
    roleTag: '燕尾槽风偏微调 · 高对比圆润黄铜反光珠',
    description:
      '燕尾榫嵌入枪口斜坡底座并嵌焊亮黄铜圆珠的经典牛仔骑兵快瞄准星。',
  },
  {
    id: 'win94_breech_bolt',
    bomCode: 'B-03',
    nameZh: '顶抛式圆柱机加工钢枪机',
    calloutLabel: '顶抛圆柱枪机',
    nameEn: 'Top-Eject Machined Steel Cylindrical Breech Bolt',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-0.4, 1.45, 0],
    explodeSteps: [
      { range: [0.1, 0.42], offset: [-1.0, 9.5, 0] },
      { range: [0.52, 0.88], offset: [1.5, 4.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.16,
    roleTag: '88mm 直行后坐行程 · 顶部宽爪抽壳钩竖直向上抛壳',
    description:
      '顶部开槽安装弹簧片式大抓钩抽壳钩的圆柱形精密枪机，在机匣顶部导轨内平直后坐并通过机匣顶窗向上高抛空铜壳。',
  },
  {
    id: 'win94_firing_pin',
    bomCode: 'B-04',
    nameZh: '两段式半闭锁防早发长击针',
    calloutLabel: '两段式防早发击针',
    nameEn: 'Two-Piece Inertia Interlocked Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-0.8, 1.45, 0],
    explodeSteps: [
      { range: [0.1, 0.42], offset: [-1.0, 9.5, 0] },
      { range: [0.54, 0.92], offset: [-12.0, 6.2, 3.8] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.48,
    roleTag: '闭锁块升到位方对齐传递击发冲量 · 机械零早发',
    description:
      '贯穿枪机轴线的分段式钢击针，仅当垂直闭锁块完全顶升锁紧并由杠杆压下握把保险时方能连通前冲点燃底火。',
  },
  {
    id: 'win94_locking_bolt',
    bomCode: 'B-05',
    nameZh: '勃朗宁 H 型垂直升降钢制闭锁块',
    calloutLabel: 'H型垂直升降闭锁块',
    nameEn: 'Browning Vertical Rising H-Locking Block',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-5.9, -0.05, 0],
    explodeSteps: [{ range: [0.18, 0.5], offset: [-6.5, -10.5, 0] }],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.18,
    roleTag: '双上翼直顶机匣垂直卯槽与枪机尾肩 · 承压面积倍增',
    description:
      '约翰·勃朗宁在 1894 型上的天才发明：由杠杆连杆垂直驱动升降的 H 形锻钢闭锁块。合拢闭锁时向上升起 24 mm 死死楔入枪机尾端与机匣闭锁台面之间。',
  },
  {
    id: 'win94_lever',
    bomCode: 'B-06',
    nameZh: '锻造 D 型指环拨动杠杆与连杆凸轮',
    calloutLabel: 'D型指环杠杆',
    nameEn: 'Forged Steel D-Ring Finger Lever & Toggle',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [0.8, -1.65, 0],
    explodeSteps: [{ range: [0.06, 0.38], offset: [2.0, -14.5, 0] }],
    calloutDir: 'down',
    calloutStem: 50,
    labelAppearAt: 0.08,
    roleTag: '单手下压 53° 完成退壳压锤上弹闭锁全流程',
    description:
      '位于下机匣腹部的经典环柄钢制杠杆：手指前推下摆 53° 时，前端双连杆率先下拉垂直闭锁块解脱，随后拉动枪机全行程后坐并压倒外露击锤。',
  },
  {
    id: 'win94_link',
    bomCode: 'B-07',
    nameZh: '底部铰接杠杆护板连杆桥',
    calloutLabel: '底板铰接连杆桥',
    nameEn: 'Hinged Receiver-Bottom Lever Link Bridge',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [-4.6, -1.85, 0],
    explodeSteps: [{ range: [0.12, 0.45], offset: [4.5, -8.5, 3.8] }],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.2,
    roleTag: '随杠杆前摆下拉闭锁块并暴露底部机构导槽',
    description:
      '铰接于扳机底板前端与垂直闭锁块底脚之间的锻钢传动桥，协调杠杆角位移与闭锁块直上直下运动。',
  },

  // ==================== 2. TOP-EJECT RECEIVER, SADDLE RING & WALNUT FURNITURE ('frame' · 7 parts) ====================
  {
    id: 'win94_receiver',
    bomCode: 'F-01',
    nameZh: '开顶抛壳精密铣削锻钢机匣',
    calloutLabel: '开顶锻钢机匣',
    nameEn: 'Top-Eject Forged Alloy Steel Receiver',
    group: 'frame',
    material: 'barrel_steel',
    isShell: true,
    assembledPos: [-1.0, 0.25, 0],
    explodeSteps: [{ range: [0.35, 0.8], offset: [0, 0, 0] }],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.06,
    roleTag: '超窄扁平马鞍贴背身 · 右侧金氏装弹口 + 顶部宽窗',
    description:
      '纤薄紧凑的整体铣削碳钢机匣：顶部全开便于竖直向上抛壳并直接擦拭膛室，右侧开设装弹滑窗，双侧内壁铣有垂直闭锁块升降直导槽。',
  },
  {
    id: 'win94_rear_sight',
    bomCode: 'F-02',
    nameZh: '半鹿角阶梯斜坡表尺照门',
    calloutLabel: '半鹿角阶梯照门',
    nameEn: 'Semi-Buckhorn Rear Sight & Stepped Elevator',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [14.5, 2.35, 0],
    explodeSteps: [
      { range: [0.22, 0.56], offset: [8.0, 5.5, 0] },
      { range: [0.58, 0.92], offset: [0, 7.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.34,
    roleTag: '五档锯齿斜坡快速调校 50-300 码射程',
    description:
      '弹簧片式半鹿角缺口表尺配合带防滑阶梯楔块，推拉滑块即可凭手感快速切换狩猎表尺分划。',
  },
  {
    id: 'win94_saddle_ring',
    bomCode: 'F-03',
    nameZh: '左侧骑兵卡宾枪马鞍铁环',
    calloutLabel: '骑兵马鞍挂环',
    nameEn: 'Left-Flank Cavalry Carbine Saddle Ring',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-3.8, 0.2, -1.62],
    explodeSteps: [{ range: [0.16, 0.52], offset: [0, 0, -6.5] }],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.2,
    roleTag: '19世纪骑兵挂钩 · 一秒快拔马鞍皮套',
    description:
      '铆装在机匣左侧面螺柱上的实心锻钢挂环，供西部骑兵在马上斜挎背带快拔射击，亦成为 1894 型最显著的视觉图腾。',
  },
  {
    id: 'win94_forend',
    bomCode: 'F-04',
    nameZh: '亚麻籽油黑胡桃木前护木',
    calloutLabel: '黑胡桃木前护木',
    nameEn: 'Oiled American Black Walnut Carbine Forend',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [21.5, 0.45, 0],
    explodeSteps: [{ range: [0.18, 0.52], offset: [6.0, -4.5, -5.5] }],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.16,
    roleTag: '全包夹枪管与管式弹仓 · 温润手搓亚麻籽油漆面',
    description:
      '选用美国密苏里直纹黑胡桃木掏空枪管槽与管仓双弧面，由前端钢箍紧固于管仓与枪管之上。',
  },
  {
    id: 'win94_barrel_bands',
    bomCode: 'F-05',
    nameZh: '卡宾枪鼻箍与管仓钢制锁环',
    calloutLabel: '护木鼻箍钢锁环',
    nameEn: 'Carbine Forend Barrel Band & Tube Clamp',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [36.2, 0.55, 0],
    explodeSteps: [{ range: [0.14, 0.46], offset: [18.5, 2.2, 5.2] }],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.18,
    roleTag: '单颗横穿紧固螺钉同步锁死护木、枪管与弹仓管',
    description:
      '环抱护木前端的烤蓝锻钢抱箍，通过底部横穿锁紧螺钉防止连射与颠簸导致木护木前窜松脱。',
  },
  {
    id: 'win94_walnut_stock',
    bomCode: 'F-06',
    nameZh: '经典直握把美洲黑胡桃木枪托',
    calloutLabel: '直握把黑胡桃枪托',
    nameEn: 'Straight-Grip American Black Walnut Buttstock',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-22.5, -2.55, 0],
    explodeSteps: [{ range: [0.22, 0.62], offset: [-26.0, -3.5, 0] }],
    calloutDir: 'down',
    calloutStem: 48,
    labelAppearAt: 0.24,
    roleTag: '上下尾舌夹紧握把 · 无手枪握柄凸显骑兵顺畅操枪',
    description:
      '严格遵照早期牛仔骑兵马背携行规格打造的直握把（Straight-Grip）实木枪托，上下双面对称铣出上/下尾舌安装槽与机匣紧密咬合。',
  },
  {
    id: 'win94_buttplate',
    bomCode: 'F-07',
    nameZh: '防滑弧面烤蓝冲压钢托底板',
    calloutLabel: '弧面钢制托底板',
    nameEn: 'Curved Steel Carbine Buttplate',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [-38.4, -4.15, 0],
    explodeSteps: [
      { range: [0.22, 0.62], offset: [-26.0, -3.5, 0] },
      { range: [0.62, 0.94], offset: [-12.0, -1.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.5,
    roleTag: '深弯贴肩锁位弧度 · 经典西部快射定位抵肩',
    description:
      '冷冲压热烤蓝高碳钢弧形卡宾枪托底板，包裹木托后端防磕碰开裂。',
  },

  // ==================== 3. HAMMER, TANG SAFETY & MAINSPRING ('fire_control' · 5 parts) ====================
  {
    id: 'win94_hammer',
    bomCode: 'FC-01',
    nameZh: '外露网格拇指扳手高脊钢击锤',
    calloutLabel: '外露拇指击锤',
    nameEn: 'External Checkered Spurred Steel Hammer',
    group: 'fire_control',
    material: 'barrel_steel',
    assembledPos: [-6.8, 0.45, 0],
    explodeSteps: [{ range: [0.24, 0.58], offset: [-14.0, 9.2, 0] }],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.26,
    roleTag: '半待击机械保险卡口 + 大面积拇指网格防滑扳手',
    description:
      '暴露在机匣上尾舌上方的大型锻钢击锤：带半待击保险档与全待击档，枪机后坐时将其向后压倒至满待击位，亦可纯靠拇指直观手动控锤。',
  },
  {
    id: 'win94_trigger',
    bomCode: 'FC-02',
    nameZh: '弧形单动火控钢制扳机',
    calloutLabel: '单动火控扳机',
    nameEn: 'Curved Single-Action Steel Trigger Blade',
    group: 'fire_control',
    material: 'barrel_steel',
    assembledPos: [-7.2, -1.65, 0],
    explodeSteps: [{ range: [0.26, 0.6], offset: [-16.0, -6.5, 4.5] }],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.28,
    roleTag: '干脆单动阻铁释放 · 下端配合杠杆压下保险栓方解脱',
    description:
      '安装于下尾舌内侧的高硬度钢制单动扳机，兼顾干脆清晰的一道火击发手感与杠杆保险机械互锁。',
  },
  {
    id: 'win94_mainspring',
    bomCode: 'FC-03',
    nameZh: '下尾舌螺旋击锤驱动主簧',
    calloutLabel: '螺旋击锤驱动主簧',
    nameEn: 'Helical Hammer Strut Mainspring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-12.8, -0.65, 0],
    explodeSteps: [{ range: [0.3, 0.66], offset: [-16.0, 3.8, -4.5] }],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.34,
    roleTag: '高弹性琴钢丝螺旋主簧 · 驱动外露击锤高速前摆',
    description:
      '藏于黑胡桃木握把上下尾舌夹层中的螺旋主簧，压紧顶杆在释放瞬间给予击锤猛烈加速前摆力矩。',
  },
  {
    id: 'win94_tang_safety',
    bomCode: 'FC-04',
    nameZh: '杠杆握紧联锁扳机阻断块',
    calloutLabel: '杠杆握紧联锁保险',
    nameEn: 'Lever-Squeeze Tang Trigger-Block Safety',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-8.4, -0.95, 0],
    explodeSteps: [{ range: [0.32, 0.68], offset: [-18.5, -1.5, -5.2] }],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.36,
    roleTag: '只有手掌紧握并闭合杠杆压入下栓方允许击发',
    description:
      '设在扳机后方下尾舌凹槽内的自动机械安全凸柱：除非杠杆彻底合拢压入下栓柱塞，否则从下方物理锁死扳机使击锤绝无法释放。',
  },
  {
    id: 'win94_sear_spring',
    bomCode: 'FC-05',
    nameZh: '阻铁复位螺旋弹簧',
    calloutLabel: '阻铁复位螺旋簧',
    nameEn: 'Helical Trigger & Sear Return Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-10.2, -1.55, 0],
    explodeSteps: [{ range: [0.34, 0.72], offset: [-18.5, -10.5, -4.8] }],
    calloutDir: 'down',
    calloutStem: 38,
    labelAppearAt: 0.4,
    roleTag: '推动扳机阻铁与杠杆保险柱自动回弹复位',
    description:
      '负责向后抵紧扳机与杠杆安全阻断块的小径螺旋复位压簧。',
  },

  // ==================== 4. TUBULAR MAGAZINE, LOADING GATE & CARRIER ('magazine' · 5 parts) ====================
  {
    id: 'win94_mag_tube',
    bomCode: 'M-01',
    nameZh: '6发全长下挂管式弹仓',
    calloutLabel: '6发下挂管式弹仓',
    nameEn: 'Full-Length 6-Round Underbarrel Tubular Magazine',
    group: 'magazine',
    material: 'barrel_steel',
    isShell: true,
    assembledPos: [30.0, -0.35, 0],
    explodeSteps: [{ range: [0.28, 0.62], offset: [6.0, -7.2, 0] }],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -0.5, 0],
    labelAppearAt: 0.08,
    roleTag: '与20英寸枪管齐平 · 可串装6发圆头/平头.30-30全铜步枪弹',
    description:
      '平行挂接在枪管正下方的无缝烤蓝钢管弹仓，专门适配低爆感平头/圆头弹尖的 6 发 .30-30 步枪弹头尾相接串联存储。',
  },
  {
    id: 'win94_mag_follower',
    bomCode: 'M-02',
    nameZh: '车削黄铜管仓推弹柱塞',
    calloutLabel: '黄铜管仓推弹柱塞',
    nameEn: 'Machined Brass Tubular Magazine Follower',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [25.8, -0.35, 0],
    explodeSteps: [{ range: [0.32, 0.68], offset: [28.0, -11.5, 4.8] }],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.36,
    roleTag: '低摩擦实心黄铜柱塞 · 稳定向后推弹至托弹勺',
    description:
      '实心高精度车削黄铜导柱，自润滑特性避免长期存放锈卡，平顺推送末发实弹进入升降托弹勺。',
  },
  {
    id: 'win94_mag_spring',
    bomCode: 'M-03',
    nameZh: '全长琴钢丝管式弹仓螺旋簧',
    calloutLabel: '全长管式弹仓螺旋簧',
    nameEn: 'Full-Length Helical Tubular Magazine Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [54.0, -0.35, 0],
    explodeSteps: [{ range: [0.36, 0.76], offset: [26.0, -14.8, 0] }],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.4,
    roleTag: '42圈超长等径压簧 · 提供恒定均匀供弹后推力',
    description:
      '前端顶死在弹仓螺塞内的 42 圈高强琴钢丝螺旋弹仓簧，持续将下层平头弹依次顶入机匣托弹勺。',
  },
  {
    id: 'win94_loading_gate',
    bomCode: 'M-04',
    nameZh: '金氏 1866 专利侧面弹簧装弹口活门',
    calloutLabel: '金氏侧面弹簧装弹口',
    nameEn: 'King Improved Spring-Tempered Side Loading Gate',
    group: 'magazine',
    material: 'barrel_steel',
    assembledPos: [0.3, 0.1, 1.44],
    explodeSteps: [{ range: [0.12, 0.46], offset: [0, 1.5, 8.5] }],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.14,
    roleTag: '右腹单指推入实弹随打随补 · 不拆仓不断火力',
    description:
      '温彻斯特赖以成名的 Nelson King 1866 年专利弹簧钢片侧装弹活门：向右拇指直接将整发 .30-30 压入弹仓即可在战火中随时续弹而不必抽出推杆。',
  },
  {
    id: 'win94_carrier',
    bomCode: 'M-05',
    nameZh: '升降黄铜与合金钢托弹勺',
    calloutLabel: '升降托弹勺',
    nameEn: 'Pivoting Brass Shell Carrier & Lifter Block',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [-1.4, -0.75, 0],
    explodeSteps: [{ range: [0.38, 0.74], offset: [1.5, 9.2, 6.2] }],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.42,
    roleTag: '承接下层来弹并向上摆起 22° 送正弹膛口',
    description:
      '在杠杆回拉后半程绕轴向上翘起 22° 的精密黄铜/钢混合托弹勺：负责挡住弹仓第二发弹并把首发待发弹托高对准上层弹膛轴线。',
  },
];

export const WINCHESTER1894_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'phase_1',
    stepNum: '01',
    shortLabel: '合拢握把击锤敲针',
    title: '阶段 1 · 杠杆合拢压下握把保险，扣动扳机释放外露击锤前旋',
    range: [0.0, 0.12],
    description:
      '杠杆完全贴紧下尾舌压入阻断保险后，扣下扳机解脱阻铁，螺旋主簧推动外露击锤向前旋转 +0.92 rad 敲击两段式击针底座。',
  },
  {
    id: 'phase_2',
    stepNum: '02',
    shortLabel: '无烟火药 290 MPa 激燃',
    title: '阶段 2 · .30-30 WCF 底火点燃 (290 MPa)，H 型垂直闭锁块刚性承压',
    range: [0.12, 0.24],
    description:
      '垂直升起到位的勃朗宁 H 型锻钢闭锁块死死撑在圆柱枪机后方与机匣垂直槽壁间，承受无烟火药 290 MPa 峰值膛压推进 170 gr 平头弹加速。',
  },
  {
    id: 'phase_3',
    stepNum: '03',
    shortLabel: '弹头出膛与下压杠杆',
    title: '阶段 3 · .30-30 弹头以 670 m/s 飞离 20" 枪口，手指前推 D 型杠杆解锁',
    range: [0.24, 0.4],
    description:
      '弹头于 f ≈ 0.27 离开 20 英寸枪口并产生标志性火舌；随后手指前推 D 型杠杆下摆至 -0.92 rad，通过连杆桥将垂直闭锁块向下拉降 2.4 cm 解除闭锁！',
  },
  {
    id: 'phase_4',
    stepNum: '04',
    shortLabel: '枪机退壳竖直顶抛',
    title: '阶段 4 · 枪机全行程后坐 8.8 cm 压倒击锤，顶部抽壳钩竖直向上抛出铜壳',
    range: [0.4, 0.58],
    description:
      '闭锁块让开高度后，杠杆带动圆柱枪机平稳后退 8.8 cm 并将外露击锤重新压回满待击槽，滚烫空铜壳从开顶机匣上方高高抛出。',
  },
  {
    id: 'phase_5',
    stepNum: '05',
    shortLabel: '管仓推弹至托弹勺',
    title: '阶段 5 · 全长管式弹仓推动新 .30-30 平头弹滑入底盘托弹勺',
    range: [0.58, 0.72],
    description:
      '42 圈琴钢丝管仓长簧推着黄铜柱塞将下一发圆头/平头 .30-30 实弹平稳向后送入托弹勺槽内，同时托弹勺顺势挡止后方余弹防双进。',
  },
  {
    id: 'phase_6',
    stepNum: '06',
    shortLabel: '回拉杠杆托勺上举',
    title: '阶段 6 · 回拉 D 型杠杆驱动托弹勺上举 +22° 并推新弹顺滑入膛',
    range: [0.72, 0.88],
    description:
      '手腕回拉杠杆上收，托弹勺向上抬起将新弹对准弹膛锥口，前冲的圆柱枪机顺势将其平顺推入膛室并扣合顶部抽壳钩。',
  },
  {
    id: 'phase_7',
    stepNum: '07',
    shortLabel: 'H型闭锁块升起死锁',
    title: '阶段 7 · 杠杆合拢最后瞬间向上顶升 H 型闭锁块 +2.4 cm 恢复待击闭锁',
    range: [0.88, 1.0],
    description:
      '杠杆严密压紧下尾舌的最后 8° 行程内，连杆再次将 H 型闭锁块垂直顶升锁紧在枪机正后方，同时使能两段式击针并压开握把保险，完成完整循环。',
  },
];

export function computeWinchester1894FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  const dz = 0;
  const rx = 0;
  const ry = 0;
  let rz = 0;
  let scaleX = 1;

  // Finger lever manual throw down (-0.92 rad) in [0.30, 0.56], crisp pull-back return [0.68, 0.94]
  const leverOpen = seg(f, 0.3, 0.56) - seg(f, 0.68, 0.94);
  // Locking bolt drops vertically (-2.4 cm) ahead of bolt slide [0.30, 0.42] and rises last [0.85, 0.96]
  const lockDrop = seg(f, 0.3, 0.42) - seg(f, 0.85, 0.96);
  // Breech bolt travels rearward (-8.8 cm) during [0.40, 0.58] and feeds forward [0.68, 0.86]
  const boltStroke = seg(f, 0.4, 0.58) - seg(f, 0.68, 0.86);
  const boltDX = -8.8 * boltStroke;
  // Carrier lifter tilts upward (+0.38 rad = ~22 deg) in [0.58, 0.72] and drops back down [0.76, 0.90]
  const carrierUp = seg(f, 0.58, 0.72) - seg(f, 0.76, 0.9);
  const magFeedPulse = seg(f, 0.56, 0.68) - seg(f, 0.82, 0.94);

  switch (partId) {
    case 'win94_lever': {
      rz = -0.92 * leverOpen;
      break;
    }
    case 'win94_link': {
      rz = 0.56 * leverOpen;
      dy = -0.38 * leverOpen;
      break;
    }
    case 'win94_locking_bolt': {
      dy = -2.4 * lockDrop;
      break;
    }
    case 'win94_breech_bolt': {
      dx = boltDX;
      break;
    }
    case 'win94_firing_pin': {
      const strike = seg(f, 0.08, 0.12) - seg(f, 0.15, 0.22);
      dx = boltDX + 0.36 * strike;
      break;
    }
    case 'win94_carrier': {
      rz = 0.38 * carrierUp;
      break;
    }
    case 'win94_hammer': {
      const fall = seg(f, 0.055, 0.105);
      const recock = seg(f, 0.4, 0.55);
      const searSettle = seg(f, 0.91, 0.975);
      rz = -0.92 * fall + 0.98 * recock - 0.06 * searSettle;
      break;
    }
    case 'win94_trigger': {
      const pull = seg(f, 0.0, 0.075) - seg(f, 0.91, 0.975);
      rz = -0.22 * pull;
      break;
    }
    case 'win94_tang_safety': {
      const blocked = Math.min(1, leverOpen * 1.4);
      dy = 0.18 * (1 - blocked);
      break;
    }
    case 'win94_mainspring': {
      const fall = seg(f, 0.055, 0.105) - seg(f, 0.4, 0.55);
      const overcock = Math.sin(linearSeg(f, 0.44, 0.58) * Math.PI);
      scaleX = 1 + 0.16 * fall - 0.12 * overcock;
      break;
    }
    case 'win94_sear_spring': {
      const pull = seg(f, 0.0, 0.075) - seg(f, 0.91, 0.975);
      scaleX = 1 - 0.14 * pull;
      break;
    }
    case 'win94_mag_spring': {
      scaleX = 1 + 0.085 * magFeedPulse;
      break;
    }
    case 'win94_mag_follower': {
      dx = -3.3 * magFeedPulse;
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

export function computeWinchester1894BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const boltStroke = seg(f, 0.4, 0.58) - seg(f, 0.68, 0.86);
  const boltDX = -8.8 * boltStroke;

  // 1. .30-30 Winchester 170gr Flat-Nose bullet accelerating down 20" barrel (`X ∈ [7.8 -> 56.5]`, exit at `f = 0.27`)
  const bulletVisible = f < 0.42;
  let bulletX = 7.8;
  let streakLength = 0;
  if (f >= 0.13 && f < 0.27) {
    const u = Math.pow(linearSeg(f, 0.13, 0.27), 1.3);
    bulletX = 7.8 + 48.7 * u;
    streakLength = 6.2 * u;
  } else if (f >= 0.27 && f < 0.42) {
    const u = linearSeg(f, 0.27, 0.42);
    bulletX = 56.5 + 62.0 * u;
    streakLength = 12.0 * (1 - u * 0.45);
  }

  // 2. Signature Top-Ejection of spent brass case UPWARD (+Y) out of open top receiver (`ejectF = 0.50`)
  const spentCaseVisible = f < 0.84;
  let caseX = 6.2;
  let caseY = 1.45;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.4 && f < 0.5) {
    caseX = 6.2 + boltDX;
  } else if (f >= 0.5 && f < 0.84) {
    const u = linearSeg(f, 0.5, 0.84);
    const xAtEject = 6.2 - 8.8 * seg(0.5, 0.4, 0.58);
    caseX = xAtEject - 1.5 * u;
    caseY = 1.85 + 11.2 * u - 10.5 * u * u;
    caseZ = 4.5 * u;
    caseRX = u * 9.5;
    caseRY = u * 6.2;
    caseRZ = -u * 12.0;
    if (f > 0.7) spentCaseOpacity = 1 - linearSeg(f, 0.7, 0.84);
  }

  // 3. Chamber flash & 20" bare muzzle plume
  const chamberFlashIntensity =
    f >= 0.12 && f <= 0.23 ? Math.sin(linearSeg(f, 0.12, 0.23) * Math.PI) : 0;
  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.26 && f <= 0.37) {
    const u = linearSeg(f, 0.26, 0.37);
    muzzlePlumeScale = 0.52 + 1.8 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.88;
  }

  // 4. Next .30-30 round: Tubular mag `[9.0, -0.35, 0.045]` -> Brass carrier `[0.5, -0.55, 0]` -> Lifted `[0.8, 1.35, 0]` -> Chamber `[6.2, 1.45, 0]`
  let nextX = 9.0;
  let nextY = -0.35;
  let nextZ = 0.045;
  let nextRZ = 0;
  if (f >= 0.56 && f < 0.65) {
    const u = seg(f, 0.56, 0.65);
    nextX = 9.0 + (0.5 - 9.0) * u;
    nextY = -0.35 + (-0.55 - -0.35) * u;
    nextZ = 0.045 * (1 - u);
  } else if (f >= 0.65 && f < 0.74) {
    const u = seg(f, 0.65, 0.74);
    nextX = 0.5 + (0.8 - 0.5) * u;
    nextY = -0.55 + (1.35 - -0.55) * u;
    nextZ = 0;
    nextRZ = 0.18 * u;
  } else if (f >= 0.74 && f < 0.88) {
    const u = seg(f, 0.74, 0.88);
    nextX = 0.8 + (6.2 - 0.8) * u;
    nextY = 1.35 + (1.45 - 1.35) * u;
    nextZ = 0;
    nextRZ = 0.18 * (1 - u);
  } else if (f >= 0.88) {
    nextX = 6.2;
    nextY = 1.45;
    nextZ = 0;
  }

  const tubeShift = seg(f, 0.56, 0.66);
  const resX = 12.3 + (9.0 - 12.3) * tubeShift;
  const resZ = -0.045 + (0.045 - -0.045) * tubeShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.45, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity: 0,
    gasPortPos: [25.0, 1.45, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, -0.35, resZ],
  };
}

const WIN94_V3_WALNUT_BUNDLE: PbrBindingSpec = {
  albedoFile: 'win94_v3_walnut_albedo.webp',
  normalFile: 'win94_v3_walnut_normal.webp',
  roughnessFile: 'win94_v3_walnut_roughness.webp',
  normalScale: 0.9,
};

const WIN94_V3_RECEIVER_BUNDLE: PbrBindingSpec = {
  albedoFile: 'win94_v3_receiver_albedo.webp',
  normalFile: 'win94_v3_receiver_normal.webp',
  roughnessFile: 'win94_v3_receiver_roughness.webp',
  normalScale: 0.86,
};

const WIN94_V3_METAL_BUNDLE: PbrBindingSpec = {
  albedoFile: 'win94_v3_metal_albedo.webp',
  normalFile: 'win94_v3_metal_normal.webp',
  roughnessFile: 'win94_v3_metal_roughness.webp',
  normalScale: 0.85,
};

export const WINCHESTER1894_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  win94_forend: WIN94_V3_WALNUT_BUNDLE,
  win94_walnut_stock: WIN94_V3_WALNUT_BUNDLE,
  win94_receiver: WIN94_V3_RECEIVER_BUNDLE,
  win94_loading_gate: WIN94_V3_RECEIVER_BUNDLE,
  win94_saddle_ring: WIN94_V3_RECEIVER_BUNDLE,
  win94_lever: WIN94_V3_RECEIVER_BUNDLE,
  win94_link: WIN94_V3_RECEIVER_BUNDLE,
  win94_buttplate: WIN94_V3_RECEIVER_BUNDLE,
  win94_barrel: WIN94_V3_METAL_BUNDLE,
  win94_front_sight: WIN94_V3_METAL_BUNDLE,
  win94_rear_sight: WIN94_V3_METAL_BUNDLE,
  win94_barrel_bands: WIN94_V3_METAL_BUNDLE,
  win94_breech_bolt: WIN94_V3_METAL_BUNDLE,
  win94_firing_pin: WIN94_V3_METAL_BUNDLE,
  win94_locking_bolt: WIN94_V3_METAL_BUNDLE,
  win94_hammer: WIN94_V3_METAL_BUNDLE,
  win94_trigger: WIN94_V3_METAL_BUNDLE,
  win94_tang_safety: WIN94_V3_METAL_BUNDLE,
  win94_mag_tube: WIN94_V3_METAL_BUNDLE,
  win94_mag_follower: WIN94_V3_METAL_BUNDLE,
  win94_carrier: WIN94_V3_METAL_BUNDLE,
};

export const WINCHESTER1894_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'win94_walnut',
    weapon: WINCHESTER1894_ID,
    titleCn: '温彻斯特 1894 美洲黑胡桃木直握把枪托与前护木贴图组',
    partTag: 'F-04 / F-06 BLACK WALNUT FURNITURE',
    resolution: '2048 × 2048 px',
    summary:
      'Cycles 离线烘焙的美洲直纹黑胡桃木 2K 5 通道 ORM 贴图组：保留手工亚麻籽油渗入木孔、微米纤维导槽以及枪托与钢箍咬合边缘自然包浆。',
    highlights: [
      'Quarter-sawn 美洲黑胡桃木直纹与心材色差过渡',
      'F-04 前护木管仓弧面与 F-06 直握把上下尾舌嵌入倒角',
      '亚麻籽油温润缎面粗糙度分布 (0.48–0.64)',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'win94_v3_walnut_albedo.webp',
        note: 'sRGB · 亚麻籽油美洲黑胡桃木实木纹理与边角包浆',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'win94_v3_walnut_normal.webp',
        note: 'Linear · 实木木射线导管凹凸与切角微倒角法线',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'win94_v3_walnut_roughness.webp',
        note: 'Linear · R:Cycles AO / G:实木油膜粗糙度 / B:非金属度',
      },
    ],
  },
  {
    id: 'win94_receiver',
    weapon: WINCHESTER1894_ID,
    titleCn: '开顶热烤蓝锻钢机匣、马鞍挂环与 D 型杠杆贴图组',
    partTag: 'F-01 / F-03 / B-06 / M-04 RECEIVER & LEVER',
    resolution: '2048 × 2048 px',
    summary:
      '专为纽黑文温彻斯特工厂 1894 型打造的深靛烤蓝/彩火淬火 2K 5 通道 ORM 贴图组：再现开顶抛壳槽倒角磨光、马鞍环摩擦亮斑、D 型指环杠杆回火色调及金氏侧面弹簧装弹活门细节。',
    highlights: [
      '热烤蓝碳钢机匣镜面抛光棱角边缘与细微年代包浆',
      '彩色表面淬火（Color Case-Hardened）D 型杠杆与闭锁表面',
      '金氏侧面弹簧装弹盖板高频开关擦痕',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'win94_v3_receiver_albedo.webp',
        note: 'sRGB · 深炭烤蓝机匣、淬火杠杆与金氏装弹窗钢板',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'win94_v3_receiver_normal.webp',
        note: 'Linear · 铣削刀路微纹理与击锤/杠杆轴孔倒角法线',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'win94_v3_receiver_roughness.webp',
        note: 'Linear · R:Cycles 接缝 AO / G:烤蓝镜面(0.24-0.38) / B:高金属度',
      },
    ],
  },
  {
    id: 'win94_metal',
    weapon: WINCHESTER1894_ID,
    titleCn: '20英寸 .30-30 枪管、勃朗宁垂直闭锁块与黄铜托弹勺贴图组',
    partTag: 'B-01 / B-03 / B-05 / M-01 / M-05 BARREL & ACTION',
    resolution: '2048 × 2048 px',
    summary:
      '涵盖 20 英寸高强度无烟火药枪管、抛光圆柱顶抛枪机、垂直 H 型闭锁块、外露滚花击锤及黄铜升降托弹勺/管仓推弹柱塞的多材质金属 2K 图集。',
    highlights: [
      '深炭烤蓝枪管、管式弹仓与准星金属拉丝肌理',
      'H 型垂直闭锁块与抛光圆柱枪机高光耐磨导面',
      '车削实心黄铜托弹勺与管仓推弹塞温润金色反差',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'win94_v3_metal_albedo.webp',
        note: 'sRGB · 烤蓝钢枪管、抛光枪机、黄铜珠与黄铜托弹勺',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'win94_v3_metal_normal.webp',
        note: 'Linear · 车削同心圆纹与枪管刻印凹痕切线法线',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'win94_v3_metal_roughness.webp',
        note: 'Linear · 抛光机芯(0.20) vs 黄铜件(0.26) vs 烤蓝(0.36)',
      },
    ],
  },
  {
    id: 'win94_seamless_springs',
    weapon: WINCHESTER1894_ID,
    titleCn: '三组动态螺旋琴钢丝弹簧无缝金属细节贴图',
    partTag: 'FC-03 / FC-05 / M-03 DYNAMIC HELICAL SPRINGS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为实时 GPU 形变的螺旋击锤主簧、阻铁复位簧与 42 圈管式弹仓弹簧提供高张力冷拔琴钢丝金属油膜拉丝与微粗糙度表现。',
    highlights: [
      '保留 aSpringParam GPU 实时等径伸缩变形能力',
      '高频无缝钢丝表面金属光泽与轻微防锈枪油膜层',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属冷拔拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于 3 组实时压缩/伸长螺旋弹簧',
      },
      {
        kind: 'Roughness',
        labelCn: '金属微粗糙度油膜 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 琴钢丝螺旋表面光泽起伏',
      },
    ],
  },
];

export const WINCHESTER1894_PLUGIN: WeaponRuntimePlugin = {
  id: WINCHESTER1894_ID,
  partGroups: WINCHESTER1894_PART_GROUPS,
  timelinePresets: WINCHESTER1894_TIMELINE_PRESETS,
  parts: WINCHESTER1894_PARTS,
  firingPhases: WINCHESTER1894_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(WINCHESTER1894_FIRING_PHASES, f),
  computeFiringKinematics: computeWinchester1894FiringKinematics,
  computeBallisticsState: computeWinchester1894BallisticsState,
  pbrBindings: WINCHESTER1894_PBR_BINDINGS,
  pbrSuites: WINCHESTER1894_PBR_SUITES,
};
