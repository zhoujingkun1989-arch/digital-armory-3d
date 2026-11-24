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

export const K98K_ID = 'k98k' as WeaponId;
export const K98K_CALIBER = '792_mauser' as CaliberProfile;

export const K98K_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '60cm阶梯枪管、毛瑟98三突笋旋转枪机与全长抓钩组',
    nameEn: '60cm Stepped Barrel, Mauser 98 Rotating Bolt & Claw Extractor',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '大环锻钢机匣、层压榉木枪托、弧形表尺与枪箍通条组',
    nameEn: 'Large-Ring Receiver, Laminated Stock, Tangent Sight & Bands',
    badgeColor: '#a16207',
  },
  {
    key: 'fire_control',
    nameZh: '两道火毛瑟扳机、杠杆阻铁、阻铁簧与铣削弹仓护圈组',
    nameEn: 'Two-Stage Mauser Trigger, Sear, Return Spring & Trigger Guard',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '5发双排内置弹仓、阶梯托弹板、底板与黄铜桥夹组',
    nameEn: '5-Rd Staggered Internal Magazine, Follower, Floorplate & Clip',
    badgeColor: '#fb923c',
  },
];

export const K98K_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: '毛瑟 98k 卡宾枪（Mauser Karabiner 98k · 7.92×57mm Mauser）：前双闭锁突笋加后第三保险突笋三点闭锁，配全长不旋转抓钩受控供弹与三档旗式尾套保险。',
  },
  {
    id: 'field_strip',
    label: '枪机与木托勤务分解',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '旗式保险拨至垂直中档并旋出毛瑟 98 旋转枪机总成，抽出下挂钢制通条、卸下前后 H 型枪箍与层压榉木上护木，分离底板清理内置弹仓。',
  },
  {
    id: 'sub_assembly',
    label: '枪机尾套与火控细拆',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '借枪托钢制拆解盘顶压击针尾铁，彻底拆离不旋转全长抓钩、尾套、三档旗式保险、长击针与主簧，并分解两道火扳机与杠杆阻铁。',
  },
  {
    id: 'full_exploded',
    label: '全枪 24 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 24 个 1:1 机械零件零遮挡展开：完整呈现保罗·毛瑟 1898 年奠定的百年栓动步枪工业标准——受控供弹、三突笋泄气防爆与三档旗式保险。',
  },
];

export const K98K_PARTS: WeaponPartSpec[] = [
  // ==================== 1. BARREL & MAUSER 98 BOLT ACTION ('slide' · 8 parts) ====================
  {
    id: 'k98k_barrel',
    bomCode: 'B-01',
    nameZh: '600mm 7.92×57mm 阶梯军用四膛线枪管',
    calloutLabel: '60cm阶梯四膛线枪管',
    nameEn: '600mm 7.92×57mm Stepped 4-Groove Military Barrel',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [36.2, 1.5, 0],
    explodeSteps: [{ range: [0.22, 0.56], offset: [22.0, 9.5, 0] }],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [16.0, 0.9, 0],
    labelAppearAt: 0.05,
    roleTag: '600mm 四膛线 1:240mm 缠距 · 双阶梯减重军用烤蓝钢枪管',
    description:
      '全长 600 毫米的经典德国毛瑟阶梯外轮廓军用枪管，尾端粗螺纹旋入大环锻钢机匣，内部拉削 4 条 1:240 毫米右旋深膛线以稳定 198 格令重尖弹（s.S. Patrone）。',
  },
  {
    id: 'k98k_front_sight',
    bomCode: 'B-02',
    nameZh: '带防眩光弹性护罩的大麦粒前准星',
    calloutLabel: '护罩大麦粒前准星',
    nameEn: 'Hooded Inverted-V Barleycorn Front Sight',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [63.8, 2.75, 0],
    explodeSteps: [
      { range: [0.22, 0.56], offset: [22.0, 9.5, 0] },
      { range: [0.56, 0.9], offset: [8.0, 8.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.28,
    roleTag: '燕尾座横调归零 · 弹簧钢圆拱护罩抗撞防反光',
    description:
      '安装在枪口斜坡燕尾槽内的倒 V 形大麦粒准星片，外扣自 1939 年起成为标配的 C 形烤蓝弹簧钢圆拱准星护罩，在逆光与战壕磕碰中保护准星尖端。',
  },
  {
    id: 'k98k_bolt_body',
    bomCode: 'B-03',
    nameZh: '毛瑟 98 三突笋旋转枪机体与下弯球头拉机柄',
    calloutLabel: '三突笋弯柄枪机体',
    nameEn: 'Mauser 98 3-Lug Rotating Bolt Body & Bent Handle',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-0.2, 1.5, 0],
    explodeSteps: [
      { range: [0.06, 0.36], offset: [-16.0, 11.0, 0] },
      { range: [0.46, 0.8], offset: [0, 3.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.12,
    roleTag: '前双主突笋 + 后第三保险突笋 · 90°上抬开锁待击与双泄气孔',
    description:
      '整体模锻抛光白钢枪机体：前端配备对称双闭锁主突笋，后根部增设防断栓的第三保险突笋；90° 上抬下弯球头拉机柄时同步驱动预抽壳斜面与击针螺旋待击斜面，腹部开有双椭圆形防炸膛高压燃气泄放孔。',
  },
  {
    id: 'k98k_claw_extractor',
    bomCode: 'B-04',
    nameZh: '毛瑟全长不旋转受控供弹大抓钩抽壳钩',
    calloutLabel: '全长不旋转抓钩抽壳钩',
    nameEn: 'Non-Rotating Full-Length Mauser Claw Extractor',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-0.2, 1.5, 0],
    explodeSteps: [
      { range: [0.06, 0.36], offset: [-16.0, 11.0, 0] },
      { range: [0.48, 0.84], offset: [4.5, 4.0, 9.5] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.18,
    roleTag: '套环游动不随栓旋转 · 全程咬死底缘实现零双进受控供弹',
    description:
      '毛瑟 98 称霸百年的核心发明：通过游动卡环套于枪机体颈槽外侧，枪机旋转 90° 开闭锁时抽壳钩始终保持水平不转（rx = 0），仅随枪机直线往复。新弹离匣瞬间底缘即滑入宽爪内侧，即使倒持步枪亦绝不跌弹或双进。',
  },
  {
    id: 'k98k_bolt_shroud',
    bomCode: 'B-05',
    nameZh: '防燃气倒灌毛瑟 98 不旋转枪机尾套',
    calloutLabel: '防气倒灌枪机尾套',
    nameEn: 'Non-Rotating Gas-Deflecting Mauser Bolt Shroud',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [-8.3, 1.5, 0],
    explodeSteps: [
      { range: [0.06, 0.36], offset: [-16.0, 11.0, 0] },
      { range: [0.46, 0.82], offset: [-10.0, 3.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.24,
    roleTag: '左翼导气挡板护眼 · 承载三档旗式保险与机尾定位卡笋',
    description:
      '旋入枪机体尾端内螺纹的钢制尾套，由导槽限定全程不随枪机旋转；左侧宽大护翼可在底火穿孔漏气时偏转高压炽热火药燃气保护射手双目。',
  },
  {
    id: 'k98k_flag_safety',
    bomCode: 'B-06',
    nameZh: '经典毛瑟三档翼形旗式机械保险',
    calloutLabel: '三档翼形旗式保险',
    nameEn: '3-Position Mauser Wing Flag Safety',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-9.0, 2.35, 0],
    explodeSteps: [
      { range: [0.06, 0.36], offset: [-16.0, 11.0, 0] },
      { range: [0.46, 0.82], offset: [-10.0, 3.0, 0] },
      { range: [0.64, 0.96], offset: [-3.5, 7.5, -4.5] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.3,
    roleTag: '左档射击 / 中档竖立锁针可拉栓 / 右档死锁击针与枪机',
    description:
      '毛瑟 98 最具辨识度的三档翼形旗式保险：向左平放为击发档；竖直向上遮挡视线并物理顶退击针但允许拉栓退弹与无工具分解枪机；向右翻倒同时锁死击针与旋转枪机。',
  },
  {
    id: 'k98k_firing_pin',
    bomCode: 'B-07',
    nameZh: '带阻气双翼与待击尾铁的毛瑟长击针',
    calloutLabel: '双翼长击针与尾铁',
    nameEn: 'Full-Length Mauser Firing Pin & Cocking Piece',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-1.5, 1.5, 0],
    explodeSteps: [
      { range: [0.06, 0.36], offset: [-16.0, 11.0, 0] },
      { range: [0.5, 0.88], offset: [-26.0, -3.5, -6.5] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.38,
    roleTag: '12.5mm 刚劲行程 · 尾铁下耳挂接阻铁并兼作待击状态指示',
    description:
      '整体工具钢车削的 171 毫米超长一体击针，前段配有防漏气双凸耳导翼，尾端通过卡槽锁装带下挂待击齿的圆柱尾铁（Schlagbolzenmutter）；枪机 90° 上抬时螺旋斜面直接将其向后顶回满待击。',
  },
  {
    id: 'k98k_firing_pin_spring',
    bomCode: 'B-08',
    nameZh: '毛瑟 98 螺旋高张力击针驱动主簧',
    calloutLabel: '击针驱动螺旋主簧',
    nameEn: 'Helical Mauser 98 Firing Pin Mainspring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-6.8, 1.5, 0],
    explodeSteps: [
      { range: [0.06, 0.36], offset: [-16.0, 11.0, 0] },
      { range: [0.54, 0.92], offset: [-10.0, 9.5, -8.5] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.44,
    roleTag: '24圈琴钢丝高能主簧 · 极寒战壕仍强力击穿硬底火',
    description:
      '套装在长击针杆身与尾套前肩之间的 24 圈高张力冷拔琴钢丝螺旋主簧，在开锁上抬 90° 时被压缩蓄能 12.5 毫米，扣发瞬间爆发强大动能击穿军用铜帽底火。',
  },

  // ==================== 2. RECEIVER, LAMINATED STOCK, SIGHTS & BANDS ('frame' · 8 parts) ====================
  {
    id: 'k98k_receiver',
    bomCode: 'F-01',
    nameZh: '毛瑟 98 大环锻钢机匣（含拇指槽与桥夹导槽）',
    calloutLabel: '大环锻钢机匣',
    nameEn: 'Forged Mauser 98 Large-Ring Receiver & Clip Bridge',
    group: 'frame',
    material: 'barrel_steel',
    isShell: true,
    assembledPos: [-0.5, 1.1, 0],
    explodeSteps: [{ range: [0.35, 0.78], offset: [0, 0, 0] }],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.06,
    roleTag: 'Ø35.8mm大前环 + 左侧压弹拇指缺口 + C形后桥夹导槽',
    description:
      '奥伯恩多夫毛瑟工厂（byf 43）整块铬钼钢模锻铣削的大环机匣：前环内设双主闭锁支承面与防爆泄气孔，左侧铣出标志性压弹拇指弧槽与“Mod. 98”铭文，后 C 形桥顶开 5 发桥夹导槽，左侧尾端装有铰链式枪机止动卡笋。',
  },
  {
    id: 'k98k_rear_sight',
    bomCode: 'F-02',
    nameZh: '100–2000米弧形曲线表尺照门与基座套',
    calloutLabel: '2000米弧形表尺',
    nameEn: '100–2000m Graduated Tangent Leaf Rear Sight',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [16.8, 2.75, 0],
    explodeSteps: [
      { range: [0.22, 0.56], offset: [22.0, 9.5, 0] },
      { range: [0.58, 0.92], offset: [-6.0, 9.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.32,
    roleTag: '1至20百米刻度雕刻 · 双侧压钮滑块精密微调弹道仰角',
    description:
      '套焊于枪管第一阶梯段的毛瑟弧形切线表尺座与可抬升表尺板，正面清晰冲印 100 至 2000 米分划，捏压双侧滚花卡钮前后推动游标即可按 7.92mm s.S. 重尖弹道曲线设定射程。',
  },
  {
    id: 'k98k_stock',
    bomCode: 'F-03',
    nameZh: '层压榉木半手枪握把枪托（含背带孔与钢制拆解盘）',
    calloutLabel: '层压榉木枪托',
    nameEn: 'Laminated Beechwood Stock w/ Sling Slot & Takedown Disk',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [4.0, -2.1, 0],
    explodeSteps: [{ range: [0.18, 0.56], offset: [-10.0, -14.5, 0] }],
    calloutDir: 'down',
    calloutStem: 50,
    calloutAnchor: [-18.0, -2.5, 0],
    labelAppearAt: 0.14,
    roleTag: '酚醛胶压多层榉木板 · 枪托穿孔侧背带槽 + 中央钢制枪机拆解圆盘',
    description:
      '1937 年后全面换装的高强度酚醛树脂热压层压榉木一体式全长军用枪托：呈现出鲜明深浅交替的水平层压木纹，具备防变形、耐潮湿优势；托身右侧配有镂空皮背带穿槽及用以抵压分解击针的环形钢制拆解圆盘（Zerlegescheibe），前护木两侧铣有手指抓槽与横贯后坐钢栓。',
  },
  {
    id: 'k98k_handguard',
    bomCode: 'F-04',
    nameZh: '层压榉木枪管隔热上护木',
    calloutLabel: '层压榉木上护木',
    nameEn: 'Laminated Beechwood Upper Barrel Handguard',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [31.5, 2.25, 0],
    explodeSteps: [{ range: [0.14, 0.48], offset: [18.0, 23.0, -5.0] }],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.2,
    roleTag: '包覆烫手枪管上方 · 避让弧形表尺座并由前后双钢箍卡紧',
    description:
      '采用与主枪托同批次酚醛层压榉木成型的半圆瓦状上护木，自机匣前环跨越表尺基座延伸至前 H 型枪箍，保护士兵白刃格斗与快速齐射时免受炙热枪管烫伤。',
  },
  {
    id: 'k98k_front_band',
    bomCode: 'F-05',
    nameZh: 'H型前枪箍与 S84/98 一体式刺刀卡座',
    calloutLabel: 'H型前枪箍与刺刀座',
    nameEn: 'H-Pattern Front Barrel Band & Bayonet Lug',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [51.6, 0.85, 0],
    explodeSteps: [{ range: [0.1, 0.42], offset: [32.0, 1.5, 0] }],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.16,
    roleTag: 'H形双翼锁紧上下护木 · 前端T形导轨适配 S84/98 军刺',
    description:
      '横截面呈 H 形的冷轧烤蓝钢制前箍总成，前端下挂带纵槽的 T 形钢制刺刀挂耳以锁固 S84/98 III 型军用刺刀，内孔兼作下置通条的导向通道。',
  },
  {
    id: 'k98k_rear_band',
    bomCode: 'F-06',
    nameZh: '中后钢制枪箍与左侧卡宾背带环',
    calloutLabel: '后枪箍与左侧背带环',
    nameEn: 'Rear Barrel Band & Left-Side Cavalry Sling Bar',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [33.0, 0.9, 0],
    explodeSteps: [{ range: [0.12, 0.44], offset: [28.0, 1.5, -9.5] }],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.22,
    roleTag: '左侧直立背带铁环 · 与枪托穿孔构成平贴后背的卡宾式挎枪法',
    description:
      '环抱中段护木与枪管的烤蓝钢箍，左侧焊装坚固的立式皮背带挂耳，取代传统下挂背带环使步枪背负于胸前或马背时完全平贴身侧不硌肩。',
  },
  {
    id: 'k98k_cleaning_rod',
    bomCode: 'F-07',
    nameZh: '下挂螺纹联接式钢制枪膛通条',
    calloutLabel: '下挂钢制通条',
    nameEn: 'Underbarrel Threaded Steel Cleaning Rod',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [45.0, -0.35, 0],
    explodeSteps: [{ range: [0.06, 0.36], offset: [38.0, -7.5, 0] }],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.14,
    roleTag: '31.5cm 随枪收纳 · 双枪通条尾端对拧即可刷通600mm全膛',
    description:
      '旋入护木内嵌螺母并沿刺刀座下方隐蔽收纳的实心烤蓝钢通条，头部带有长圆擦布穿眼与防滑滚花，实战中两名士兵将两根通条螺纹对接即可组成全长擦膛杆。',
  },
  {
    id: 'k98k_buttplate',
    bomCode: 'F-08',
    nameZh: '杯状包边冲压钢制军用枪托底板',
    calloutLabel: '杯状钢制托底板',
    nameEn: 'Cupped Stamped Steel Military Buttplate',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-43.8, -5.65, 0],
    explodeSteps: [
      { range: [0.18, 0.56], offset: [-10.0, -14.5, 0] },
      { range: [0.56, 0.9], offset: [-14.0, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.42,
    roleTag: '1940年标准升级 · 深冲翻边紧裹层压木尾防战壕开裂',
    description:
      '自 1940 年全面普及的深度冲压杯状烤蓝/磷化钢托底板，翻边结构如同铁鞋般严密包裹层压榉木托踵与托趾，抵御剧烈立枪顿地、严寒湿胀及近战格斗冲击。',
  },

  // ==================== 3. TWO-STAGE TRIGGER, SEAR & TRIGGER GUARD ('fire_control' · 4 parts) ====================
  {
    id: 'k98k_trigger',
    bomCode: 'FC-01',
    nameZh: '毛瑟 98 双支点两道火军用弧形扳机',
    calloutLabel: '两道火毛瑟扳机',
    nameEn: 'Two-Stage Twin-Fulcrum Mauser Military Trigger',
    group: 'fire_control',
    material: 'barrel_steel',
    assembledPos: [-8.2, -1.95, 0],
    explodeSteps: [{ range: [0.26, 0.62], offset: [-10.0, -6.5, 8.5] }],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.28,
    roleTag: '顶部前后双杠杆凸肩 · 一道火柔和预压 + 二道火清晰硬墙击发',
    description:
      '毛瑟 98 堪称典范的极简两道火弧形扳机：上方铣出高低错落的前后两处圆弧支点凸肩，扣压前期以前凸肩贴靠机匣实现轻柔预行程，触达后凸肩杠杆比突变形成清晰二道火硬墙。',
  },
  {
    id: 'k98k_sear',
    bomCode: 'FC-02',
    nameZh: '毛瑟 98 枢轴杠杆阻铁与待击挂钩',
    calloutLabel: '枢轴杠杆阻铁',
    nameEn: 'Mauser 98 Pivoting Sear Bar',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-7.9, -0.35, 0],
    explodeSteps: [{ range: [0.28, 0.64], offset: [-16.0, -2.0, 8.5] }],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.34,
    roleTag: '穿槽直挂击针尾铁 · 下摆脱钩释放高张力击针主簧',
    description:
      '铰接于机匣底面纵槽内的淬火合金钢阻铁杠，后端上齿伸入机匣内膛牢牢挂住待击尾铁下耳；当两道火扳机下拽其尾部时，前端压缩阻铁簧、后端下沉干脆解脱击针。',
  },
  {
    id: 'k98k_sear_spring',
    bomCode: 'FC-03',
    nameZh: '立式螺旋阻铁与扳机复位压簧',
    calloutLabel: '阻铁复位螺旋簧',
    nameEn: 'Helical Sear & Trigger Return Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-6.55, 0.35, 0],
    assembledRot: [0, 0, -Math.PI / 2],
    explodeSteps: [{ range: [0.3, 0.68], offset: [-6.0, -4.0, 12.0] }],
    calloutDir: 'down',
    calloutStem: 38,
    labelAppearAt: 0.4,
    roleTag: '嵌装于机匣盲孔与阻铁前鼻之间 · 提供稳定两道火回弹力',
    description:
      '垂直顶撑在机匣前盲孔与杠杆阻铁前鼻之间的 8 圈高碳钢螺旋压簧，在扣动两道火扳机时轴向压缩并在击发后迅速将阻铁推回待击啮合高位。',
  },
  {
    id: 'k98k_trigger_guard',
    bomCode: 'FC-04',
    nameZh: '整块铣削钢制扳机护圈与一体式内置弹仓框',
    calloutLabel: '铣削护圈与弹仓框',
    nameEn: 'Milled Trigger Guard & Integral Internal Magazine Box',
    group: 'fire_control',
    material: 'barrel_steel',
    isShell: true,
    assembledPos: [-1.8, -3.2, 0],
    explodeSteps: [{ range: [0.22, 0.58], offset: [8.0, -28.0, 0] }],
    calloutDir: 'down',
    calloutStem: 48,
    labelAppearAt: 0.22,
    roleTag: '与枪托下缘完全齐平不突出 · 双螺钉联锁机匣构建高刚度底盘',
    description:
      '由整块锻钢精密铣削而成的全封闭扳机护圈与双排 5 发内置弹仓框一体构件，整体隐入层压木托腹部与木托底缘平齐，彻底消除传统外凸弹仓在匍匐前进时的钩挂弊端。',
  },

  // ==================== 4. 5-RD STAGGERED INTERNAL MAGAZINE & BRASS CLIP ('magazine' · 4 parts) ====================
  {
    id: 'k98k_mag_follower',
    bomCode: 'M-01',
    nameZh: '双排交错阶梯钢制托弹板（含空仓顶栓台肩）',
    calloutLabel: '阶梯空仓顶栓托弹板',
    nameEn: 'Staggered Stepped Steel Follower w/ Bolt-Stop Shoulder',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [1.1, -3.1, 0],
    explodeSteps: [{ range: [0.26, 0.64], offset: [22.0, -22.0, 6.5] }],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.36,
    roleTag: '左右错层引导双排5发交错 · 末发射空自动上顶阻挡枪机前推',
    description:
      '表面经镜面抛光的毛瑟 98 阶梯状机加工托弹板：左高右低的错层平面引导 5 发 7.92×57mm 无底缘步枪弹紧密双排交错排布；当第 5 发弹打空后，托弹板后端凸肩自动顶升卡住枪机面，触觉警示射手立即装填新桥夹。',
  },
  {
    id: 'k98k_mag_spring',
    bomCode: 'M-02',
    nameZh: '内置 5 发弹仓强力托弹压簧',
    calloutLabel: '弹仓强力托弹簧',
    nameEn: 'Internal 5-Round Magazine Follower Drive Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [1.1, -4.35, 0],
    assembledRot: [0, 0, Math.PI / 2],
    explodeSteps: [{ range: [0.28, 0.68], offset: [22.0, -28.0, 6.5] }],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.42,
    roleTag: '支承于可拆底板与阶梯托弹板间 · 持续向上推送 5 发交错弹柱',
    description:
      '底端稳固锚定在可拆弹仓底板卡槽内的强力琴钢丝托弹压簧，在枪机后拉让出窗口瞬间迅速顶升双排 7.92×57mm 弹柱至受控供弹高度。',
  },
  {
    id: 'k98k_mag_floorplate',
    bomCode: 'M-03',
    nameZh: '带枪弹尖解脱孔的可拆式钢制弹仓底板',
    calloutLabel: '可拆式弹仓底板',
    nameEn: 'Removable Locking Magazine Floorplate',
    group: 'magazine',
    material: 'barrel_steel',
    assembledPos: [1.1, -4.45, 0],
    explodeSteps: [
      { range: [0.22, 0.58], offset: [8.0, -28.0, 0] },
      { range: [0.6, 0.94], offset: [0, -7.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.48,
    roleTag: '用 7.92mm 弹尖顶压解脱钮即可前推滑出 · 野战免工具清泥卸弹',
    description:
      '通过前端榫舌与后端弹簧卡笋锁入弹仓框底部的冲压/铣削钢底板：野战条件下只需用一发步枪弹尖顶入护圈前缘小孔，即可无工具滑出底板快速倾倒未发弹药或清除淤泥。',
  },
  {
    id: 'k98k_stripper_clip',
    bomCode: 'M-04',
    nameZh: '毛瑟 98 五发冲压黄铜桥夹（Ladestreifen）',
    calloutLabel: '5发黄铜桥夹',
    nameEn: 'Mauser 98 5-Round Brass Charger Stripper Clip',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [-4.1, 5.5, 0],
    explodeSteps: [{ range: [0.02, 0.3], offset: [5.0, 14.5, 4.5] }],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.08,
    roleTag: '插入后桥导槽单拇指一压即齐装5发 · 推栓自动弹飞空桥夹',
    description:
      '由高延展性黄铜带冷冲弯折并内嵌波形弹性压片的经典毛瑟 98 五发桥夹：装填时直接插立于机匣 C 形后桥导槽内，右手拇指借左侧拇指弧槽一次下压即可瞬间将 5 发 7.92×57mm 弹压入内置双排弹仓，向前推闭枪机时枪机面会自动将空桥夹顶弹出槽。',
  },
];

export const K98K_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'phase_1',
    stepNum: '01',
    shortLabel: '两道火预压脱钩',
    title: '阶段 1 · 两道火毛瑟扳机走过预行程突破硬墙，阻铁下沉脱钩',
    range: [0.0, 0.12],
    description:
      '射手食指扣动两道火弧形扳机，先以前凸肩贴靠机匣走过轻柔一道火预行程，随即后凸肩接力提供清晰二道火硬墙；阻铁后端下沉、前端上翘压缩阻铁簧，干脆释放待击尾铁。',
  },
  {
    id: 'phase_2',
    stepNum: '02',
    shortLabel: '击针激燃 390 MPa',
    title: '阶段 2 · 长击针前冲 12.5mm 引燃 7.92×57mm 底火，三突笋刚性承压',
    range: [0.12, 0.22],
    description:
      '24 圈高张力主簧推动毛瑟长击针前冲 12.5 毫米刺破军用铜帽底火，7.92×57mm 重尖弹发射药瞬燃飙升至 390 MPa 峰值膛压；前双主突笋与后第三保险突笋将后坐推力严密锁定于大环锻钢机匣内。',
  },
  {
    id: 'phase_3',
    stepNum: '03',
    shortLabel: '198gr重尖弹离膛',
    title: '阶段 3 · 198 格令重尖弹以 760 m/s 飞离 600mm 阶梯枪口',
    range: [0.22, 0.34],
    description:
      '12.8 克 s.S. 船尾重尖弹头经 4 条 1:240mm 右旋深膛线高速旋转稳定，于 f ≈ 0.26 破空飞出 600 毫米阶梯枪口并绽放强烈枪口焰，手动栓动枪机全程刚性锁死零晃动。',
  },
  {
    id: 'phase_4',
    stepNum: '04',
    shortLabel: '抬柄90°开锁待击',
    title: '阶段 4 · 90° 上抬弯拉机柄解锁三突笋、预抽壳并螺旋顶回击针待击',
    range: [0.34, 0.48],
    description:
      '射手右手向上翻转下弯球头拉机柄 90°（rx = -π/2）：前双主突笋旋出闭锁槽，螺旋斜面同时撬动弹壳产生 3.5 毫米大扭矩预抽壳并强制将击针向后顶回满待击位；全长抓钩抽壳钩与尾套全程保持水平不转（rx = 0）！',
  },
  {
    id: 'phase_5',
    stepNum: '05',
    shortLabel: '后拉11cm抽壳抛壳',
    title: '阶段 5 · 直拉枪机后退 11.0cm 抽出 57mm 铜壳并撞击固定抛壳挺',
    range: [0.48, 0.66],
    description:
      '全长毛瑟抓钩牢牢咬住 57 毫米长的 7.92×57mm 空铜壳随枪机直线后拉 110 毫米；退至后桥窗口瞬间，空壳左后缘重撞机匣左侧枪机止动座内的固定片状抛壳挺，利落向右上方翻滚抛飞！',
  },
  {
    id: 'phase_6',
    stepNum: '06',
    shortLabel: '受控供弹推弹入膛',
    title: '阶段 6 · 双排交错托弹板托升新弹，受控供弹滑入抓钩稳步入膛',
    range: [0.66, 0.88],
    description:
      '弹仓压簧推动阶梯托弹板将下一发交错排布的 7.92×57mm 实弹上举到位；推栓前送时，新弹底缘在离开弹仓唇的瞬间直接向上滑入不旋转毛瑟大抓钩内侧，全程受控平顺推进弹膛绝不双进。',
  },
  {
    id: 'phase_7',
    stepNum: '07',
    shortLabel: '压柄90°三突笋死锁',
    title: '阶段 7 · 下压弯拉机柄 90° 闭锁三突笋并交接待击尾铁回阻铁',
    range: [0.88, 1.0],
    description:
      '右手向下按平球头拉机柄 90° 归位：前双闭锁突笋旋入大环前桥锁死、第三保险突笋就位后桥保险槽，同时将弹壳顶紧最后 3.5 毫米闭锁间隙并将待击尾铁平稳交接给杠杆阻铁，完成一次毛瑟 98 经典循环。',
  },
];

/**
 * Real-time manual Mauser 98 bolt-action kinematics for all 24 K98k parts at progress f ∈ [0, 1].
 * Right-hand rule verification:
 *  - Around +X: bent bolt handle extends to +Z (right) and -Y (down).
 *    y' = y*cos(rx) - z*sin(rx), z' = y*sin(rx) + z*cos(rx).
 *    Setting rx = -Math.PI/2 (-90°) swings the right-side handle UPWARD (+Y) by 90°!
 *  - Signature Mauser 98 Controlled-Round Feed invariant:
 *    `k98k_bolt_body` rotates `rx = -Math.PI/2` while `k98k_claw_extractor`, `k98k_bolt_shroud`,
 *    and `k98k_flag_safety` remain strictly non-rotating (`rx === 0`) and translate linearly by `boltDX`!
 */
export function computeK98kFiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let rx = 0;
  const ry = 0;
  let rz = 0;
  let scaleX = 1;

  // 1. Manual 90-degree Bolt Handle Lift (Phase 4 [0.35..0.48] -> held upright -> Phase 7 lock-down [0.88..0.975])
  const boltLiftFactor = seg(f, 0.35, 0.48) - seg(f, 0.88, 0.975);
  const boltRX = -(Math.PI / 2) * boltLiftFactor;

  // 2. Primary Extraction Helical Cam Creep (-0.35 cm during lift [0.40..0.48]) +
  //    Full Mauser 98 Manual Bolt Draw (-10.65 cm in Phase 5 [0.48..0.64], push forward [0.72..0.88] -> -11.00 cm total!)
  const primaryExtract = seg(f, 0.4, 0.48) - seg(f, 0.88, 0.96);
  const mainDraw = seg(f, 0.48, 0.64) - seg(f, 0.72, 0.88);
  const boltDX = -0.35 * primaryExtract - 10.65 * mainDraw;

  // 3. Firing pin relative travel: snaps +1.25 cm forward on 2nd-stage break [0.11..0.14],
  //    cocked back -1.25 cm by helical bolt cam during 90° lift [0.36..0.47], tiny sear handoff [0.90..0.96]
  const strikerForward = seg(f, 0.11, 0.14) - seg(f, 0.36, 0.47);
  const cockHandoff = -0.06 * Math.sin(linearSeg(f, 0.9, 0.96) * Math.PI);
  const strikerRelDX = 1.25 * strikerForward + cockHandoff;

  // 4. Two-stage Mauser trigger & sear kinematics
  const trigStage1 = seg(f, 0.0, 0.06);
  const trigStage2 = seg(f, 0.06, 0.11);
  const trigRelease = seg(f, 0.28, 0.36);
  const triggerPull = (0.42 * trigStage1 + 0.58 * trigStage2) * (1 - trigRelease);
  const handoffDip = Math.sin(linearSeg(f, 0.9, 0.96) * Math.PI) * 0.28;
  const searActuation = clamp01(triggerPull + handoffDip);

  // 5. Internal staggered 5-round box magazine follower feed pulse
  const magFeedPulse = seg(f, 0.62, 0.72) - seg(f, 0.78, 0.88);

  switch (partId) {
    case 'k98k_bolt_body': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'k98k_claw_extractor': {
      // Non-rotating full-length Mauser claw extractor: stays strictly horizontal (rx = 0)!
      dx = boltDX;
      // Subtle outward spring flex (+Z) only if snapping over rim edge during final battery seating
      const clawFlex = Math.sin(linearSeg(f, 0.72, 0.78) * Math.PI);
      dz = 0.045 * clawFlex;
      break;
    }

    case 'k98k_bolt_shroud': {
      // Non-rotating Mauser bolt shroud tracks boltDX with rx = 0
      dx = boltDX;
      break;
    }

    case 'k98k_flag_safety': {
      // Rides on rear of bolt shroud (rx = 0, dx = boltDX) in FIRE (left) position
      dx = boltDX;
      break;
    }

    case 'k98k_firing_pin': {
      // Non-rotating firing pin + cocking piece rides with boltDX + axial strike/cock travel
      dx = boltDX + strikerRelDX;
      break;
    }

    case 'k98k_firing_pin_spring': {
      // Local coil spans X ∈ [0.0, +8.80] (L0 = 8.80 cm), anchored at rear shroud (local x = 0 -> moves with boltDX).
      // Front collar extends by +strikerRelDX (+1.25 cm -> scaleX = 1.142, delta = 0.142 > 0.08)!
      const L0 = 8.8;
      const LNew = Math.max(6.2, L0 + strikerRelDX);
      scaleX = LNew / L0;
      dx = boltDX;
      break;
    }

    case 'k98k_trigger': {
      rz = -0.24 * triggerPull;
      break;
    }

    case 'k98k_sear': {
      dy = -0.16 * searActuation;
      rz = 0.18 * searActuation;
      break;
    }

    case 'k98k_sear_spring': {
      // Vertical coil pinned at stationary receiver underside (local x = 0, assembledRot = [0, 0, -PI/2]).
      // Compresses cleanly as sear front nose pivots upward (scaleX: 1.00 -> 0.72 -> 1.00, delta = 0.28 > 0.08)!
      scaleX = 1 - 0.28 * searActuation;
      break;
    }

    case 'k98k_mag_follower': {
      dy = 0.37 * magFeedPulse;
      break;
    }

    case 'k98k_mag_spring': {
      // Vertical coil anchored at floorplate (local x = 0, assembledRot = [0, 0, +PI/2]).
      // Extends cleanly upward under rising follower (scaleX: 1.00 -> 1.24 -> 1.00, delta = 0.24 > 0.08)!
      scaleX = 1 + 0.24 * magFeedPulse;
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
 * Computes 7.92×57mm Mauser (8×57 IS, 198gr s.S. Spitzer @ 760 m/s, 390 MPa CIP)
 * internal & external ballistics synchronized with the 600mm stepped barrel & Mauser 98 bolt cycle.
 */
export function computeK98kBallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const primaryExtract = seg(f, 0.4, 0.48) - seg(f, 0.88, 0.96);
  const mainDraw = seg(f, 0.48, 0.64) - seg(f, 0.72, 0.88);
  const boltDX = -0.35 * primaryExtract - 10.65 * mainDraw;

  // 1. 198gr s.S. 7.92mm Boat-Tail Spitzer:
  // Seated in chamber throat [10.45, 1.50, 0] until ignition f = 0.14 ->
  // accelerates down 600mm stepped barrel to muzzle crown X = 66.20 at f = 0.26 -> supersonic flight [0.26..0.40]!
  const bulletVisible = f < 0.4;
  let bulletX = 10.45;
  let streakLength = 0;
  if (f >= 0.14 && f < 0.26) {
    const u = Math.pow(linearSeg(f, 0.14, 0.26), 1.4);
    bulletX = 10.45 + (66.2 - 10.45) * u;
    streakLength = 6.8 * u;
  } else if (f >= 0.26 && f < 0.4) {
    const u = linearSeg(f, 0.26, 0.4);
    bulletX = 66.2 + 78.0 * u;
    streakLength = 14.2 * (1 - u * 0.42);
  }

  // 2. Spent 57mm 7.92×57mm Mauser Brass Case:
  // Chambered at [8.60, 1.50, 0] -> cammed loose by primary extraction [0.40..0.48] ->
  // pulled straight rearward gripped by non-rotating claw extractor [0.48..0.61] ->
  // struck by fixed left-side ejector blade at f = 0.61, tumbling right-upward out of port [0.61..0.86]!
  const spentCaseVisible = f < 0.86;
  let caseX = 8.6;
  let caseY = 1.5;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.4 && f < 0.61) {
    caseX = 8.6 + boltDX;
  } else if (f >= 0.61 && f < 0.86) {
    const u = linearSeg(f, 0.61, 0.86);
    const dxAtEject =
      -0.35 * seg(0.61, 0.4, 0.48) - 10.65 * seg(0.61, 0.48, 0.64);
    const ejectStartX = 8.6 + dxAtEject;
    caseX = ejectStartX - 2.4 * u;
    caseY = 1.65 + 7.2 * u - 10.4 * u * u;
    caseZ = 14.5 * u;
    caseRX = u * 8.2;
    caseRY = -u * 10.8;
    caseRZ = -u * 9.4;
    if (f > 0.74) {
      spentCaseOpacity = 1 - linearSeg(f, 0.74, 0.86);
    }
  }

  // 3. Chamber ignition flash & 600mm bare muzzle plume (bolt-action: zero gas port!)
  const chamberFlashIntensity =
    f >= 0.135 && f <= 0.23
      ? Math.sin(linearSeg(f, 0.135, 0.23) * Math.PI)
      : 0;

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.25 && f <= 0.36) {
    const u = linearSeg(f, 0.25, 0.36);
    muzzlePlumeScale = 0.58 + 1.95 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.9;
  }

  // 4. Next 7.92×57mm round in staggered 5-rd internal box magazine [1.05, 0.05, 0] ->
  //    Controlled-Round Feed under claw extractor -> Chamber [8.60, 1.50, 0]
  let nextX = 1.05;
  let nextY = 0.05;
  let nextRZ = 0.06;

  if (f >= 0.62 && f < 0.72) {
    const u = seg(f, 0.62, 0.72);
    nextX = 1.05 + 0.15 * u;
    nextY = 0.05 + 0.62 * u;
    nextRZ = 0.06 + 0.08 * u;
  } else if (f >= 0.72 && f < 0.88) {
    const u = seg(f, 0.72, 0.88);
    const rampLift = Math.sin(u * Math.PI) * 0.24;
    nextX = 1.2 + (8.25 - 1.2) * u;
    nextY = 0.67 + (1.5 - 0.67) * u + rampLift;
    nextRZ = 0.14 * (1 - u);
  } else if (f >= 0.88 && f < 0.96) {
    // Final +0.35 cm cam-in into tight headspace as bent bolt handle turns down 90°!
    const u = seg(f, 0.88, 0.96);
    nextX = 8.25 + 0.35 * u;
    nextY = 1.5;
    nextRZ = 0;
  } else if (f >= 0.96) {
    nextX = 8.6;
    nextY = 1.5;
    nextRZ = 0;
  }

  // 5. Reserve staggered cartridge rising inside internal box magazine
  const magShift = seg(f, 0.62, 0.78);
  const resX = 1.05;
  const resY = -0.52 + (0.05 - -0.52) * magShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.5, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity: 0,
    gasPortPos: [0, 0, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0.26],
  };
}

const K98K_V3_STOCK_BUNDLE: PbrBindingSpec = {
  albedoFile: 'k98k_v3_stock_albedo.webp',
  normalFile: 'k98k_v3_stock_normal.webp',
  roughnessFile: 'k98k_v3_stock_roughness.webp',
  normalScale: 0.92,
};

const K98K_V3_RECEIVER_BUNDLE: PbrBindingSpec = {
  albedoFile: 'k98k_v3_receiver_albedo.webp',
  normalFile: 'k98k_v3_receiver_normal.webp',
  roughnessFile: 'k98k_v3_receiver_roughness.webp',
  normalScale: 0.88,
};

const K98K_V3_METAL_BUNDLE: PbrBindingSpec = {
  albedoFile: 'k98k_v3_metal_albedo.webp',
  normalFile: 'k98k_v3_metal_normal.webp',
  roughnessFile: 'k98k_v3_metal_roughness.webp',
  normalScale: 0.86,
};

export const K98K_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  // Suite 1: Laminated beechwood stock & upper handguard (2 parts)
  k98k_stock: K98K_V3_STOCK_BUNDLE,
  k98k_handguard: K98K_V3_STOCK_BUNDLE,
  // Suite 2: Large-ring receiver, trigger guard, floorplate, buttplate & barrel bands (6 parts)
  k98k_receiver: K98K_V3_RECEIVER_BUNDLE,
  k98k_trigger_guard: K98K_V3_RECEIVER_BUNDLE,
  k98k_mag_floorplate: K98K_V3_RECEIVER_BUNDLE,
  k98k_buttplate: K98K_V3_RECEIVER_BUNDLE,
  k98k_front_band: K98K_V3_RECEIVER_BUNDLE,
  k98k_rear_band: K98K_V3_RECEIVER_BUNDLE,
  // Suite 3: Barrel, sights, cleaning rod, Mauser 98 bolt action, FCG, follower & brass clip (13 parts)
  k98k_barrel: K98K_V3_METAL_BUNDLE,
  k98k_front_sight: K98K_V3_METAL_BUNDLE,
  k98k_rear_sight: K98K_V3_METAL_BUNDLE,
  k98k_cleaning_rod: K98K_V3_METAL_BUNDLE,
  k98k_bolt_body: K98K_V3_METAL_BUNDLE,
  k98k_claw_extractor: K98K_V3_METAL_BUNDLE,
  k98k_bolt_shroud: K98K_V3_METAL_BUNDLE,
  k98k_flag_safety: K98K_V3_METAL_BUNDLE,
  k98k_firing_pin: K98K_V3_METAL_BUNDLE,
  k98k_trigger: K98K_V3_METAL_BUNDLE,
  k98k_sear: K98K_V3_METAL_BUNDLE,
  k98k_mag_follower: K98K_V3_METAL_BUNDLE,
  k98k_stripper_clip: K98K_V3_METAL_BUNDLE,
};

export const K98K_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'k98k_stock',
    weapon: K98K_ID,
    titleCn: '毛瑟 K98k 酚醛热压层压榉木枪托与上护木贴图组',
    partTag: 'F-03 / F-04 LAMINATED BEECHWOOD FURNITURE',
    resolution: '2048 × 2048 px',
    summary:
      'Cycles 离线烘焙的德军战时热压层压榉木（Schichtholz）2K 5 通道 ORM 贴图组：清晰呈现深浅交错的水平酚醛胶合木层纹路、枪托穿孔背带槽包浆与钢制拆解盘/后坐横栓接缝阴影。',
    highlights: [
      '标志性多层水平交错榉木层压板纹理（暗褐酚醛胶层 + 浅琥珀榉木芯）',
      'F-03 枪托背带穿槽、钢制拆解圆盘与手指抓槽真实接触 AO',
      '半哑光军用油漆粗糙度分布（0.46–0.66）与细微木导管微法线',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'k98k_v3_stock_albedo.webp',
        note: 'sRGB · 多层热压层压榉木水平纹路与军械检验戳记',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'k98k_v3_stock_normal.webp',
        note: 'Linear · 层压胶缝微起伏、木纹导管与倒角法线',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'k98k_v3_stock_roughness.webp',
        note: 'Linear · R:Cycles AO / G:军用木面粗糙度 / B:非金属度',
      },
    ],
  },
  {
    id: 'k98k_receiver',
    weapon: K98K_ID,
    titleCn: '奥伯恩多夫 byf 43 大环锻钢机匣、护圈与钢箍贴图组',
    partTag: 'F-01 / F-05 / F-06 / F-08 / FC-04 RECEIVER & HARDWARE',
    resolution: '2048 × 2048 px',
    summary:
      '专为 1943 年毛瑟奥伯恩多夫工厂（byf 43）打造的深德式烤蓝锻钢 2K 5 通道 ORM 贴图组：无畸变 Hero UV 精准呈现左侧壁“Mod. 98”、前环“byf / 43”、序列号“6842 b”及“WaA135”检验戳记。',
    highlights: [
      'AgX 校准德式深烤蓝锻钢（sRGB 0.18–0.28，R = 0.25–0.38）零压黑质感',
      '1:1 正向无镜像“Mod. 98”、“byf 43”、“6842 b”及“WaA135”兵工厂铭文',
      'H 型前箍刺刀座、杯状托底板与铣削护圈真实棱边磨损亮银',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'k98k_v3_receiver_albedo.webp',
        note: 'sRGB · 德式深烤蓝钢机匣、枪箍、托底板与冲压铭文',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'k98k_v3_receiver_normal.webp',
        note: 'Linear · 机加工铣痕、Mod. 98 / byf 43 凹刻法线与倒角',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'k98k_v3_receiver_roughness.webp',
        note: 'Linear · R:Cycles 接缝 AO / G:烤蓝缎面(0.25-0.38) / B:高金属度',
      },
    ],
  },
  {
    id: 'k98k_metal',
    weapon: K98K_ID,
    titleCn: '60cm阶梯枪管、2000m表尺、抛光毛瑟枪机与黄铜桥夹贴图组',
    partTag: 'B-01..B-07 / F-02 / M-01 / M-04 BARREL, BOLT & BRASS CLIP',
    resolution: '2048 × 2048 px',
    summary:
      '集成 600mm 阶梯烤蓝枪管、100–2000m 刻度弧形表尺、抛光白钢三突笋枪机体、全长蓝黑弹簧钢抓钩及 ≥50px UV 隔离防火墙保护的 5 发冲压黄铜桥夹。',
    highlights: [
      '无畸变表尺板正面清晰雕刻 1–20 百米弧形弹道分划刻度',
      '白钢枪机体/旗式保险/托弹板与深蓝抓钩抽壳钩鲜明材质分层',
      '5 发黄铜桥夹独立 ≥50px UV 隔离带实现零色渗温润金属反光',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'k98k_v3_metal_albedo.webp',
        note: 'sRGB · 烤蓝阶梯枪管、白钢三突笋枪机、2000m表尺与黄铜桥夹',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'k98k_v3_metal_normal.webp',
        note: 'Linear · 表尺分划凹刻、拉丝车削纹路与滚花细节法线',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'k98k_v3_metal_roughness.webp',
        note: 'Linear · 抛光白钢(0.18) vs 黄铜桥夹(0.24) vs 烤蓝钢(0.32)',
      },
    ],
  },
  {
    id: 'k98k_seamless_springs',
    weapon: K98K_ID,
    titleCn: '三组动态螺旋琴钢丝弹簧无缝金属细节贴图',
    partTag: 'B-08 / FC-03 / M-02 DYNAMIC HELICAL SPRINGS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为实时 GPU 形变的 24 圈击针驱动主簧、立式阻铁复位簧与 5 发弹仓托弹簧提供冷拔琴钢丝无缝拉丝法线与防锈枪油微粗糙度贴图。',
    highlights: [
      '保留 aSpringParam (w = 1) GPU 恒定丝径实时伸缩变形能力',
      '无缝高频金属拉丝与军用防锈油膜光泽变化',
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

export const K98K_PLUGIN: WeaponRuntimePlugin = {
  id: K98K_ID,
  partGroups: K98K_PART_GROUPS,
  timelinePresets: K98K_TIMELINE_PRESETS,
  parts: K98K_PARTS,
  firingPhases: K98K_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(K98K_FIRING_PHASES, f),
  computeFiringKinematics: computeK98kFiringKinematics,
  computeBallisticsState: computeK98kBallisticsState,
  pbrBindings: K98K_PBR_BINDINGS,
  pbrSuites: K98K_PBR_SUITES,
};
