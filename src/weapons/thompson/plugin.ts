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

export const THOMPSON_ID: WeaponId = 'thompson' as WeaponId;
export const THOMPSON_CALIBER: CaliberProfile = '45_acp';

export const THOMPSON_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '28道散热鳍枪管、卡茨防跳器与青铜H型布利什延迟枪机组',
    nameEn: '28-Fin Barrel, Cutts Compensator & Bronze Blish-Lock Bolt Group',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '整块铣削钢机匣、莱曼表尺与美洲黑胡桃木垂直前握把枪托组',
    nameEn: 'Milled Billet Receiver, Lyman Ladder Sight & Contoured Walnut',
    badgeColor: '#a16207',
  },
  {
    key: 'fire_control',
    nameZh: '开膛单/连发火控、双拨片快慢机与弹鼓卡笋组',
    nameEn: 'Open-Bolt Select-Fire Sear, Twin Paddle Selectors & Mag Catch',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '50发L型发条螺旋弹鼓、四翼转子与.45 ACP螺旋弹柱组',
    nameEn: '50-Round Type L Clockwork Drum, 4-Arm Rotor & .45 ACP Spiral Track',
    badgeColor: '#4ade80',
  },
];

export const THOMPSON_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '开膛待击合拢态',
    subLabel: '0% Open-Bolt Ready',
    t: 0,
    desc: '经典美制汤姆逊 M1928A1 冲锋枪（“芝加哥打字机”，全长 852 mm，.45 ACP）：顶置滚花拉机柄与铣削枪机挂于后方开膛阻铁，50 发 L 型发条螺旋弹鼓横插机匣腹槽，28 道散热鳍枪管与卡茨防跳器尽显黄金年代机械美学。',
  },
  {
    id: 'field_strip',
    label: '一级勤务快拆',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '遵循美军 FM 23-40 教范：横滑卸下 50 发 L 型弹鼓；按下后滑槽卡扣取下快拆黑胡桃木枪托；按压缓冲尾柱分离上下机匣，抽出复进簧、青铜 H 型布利什闭锁块与顶置拉机柄枪机组。',
  },
  {
    id: 'sub_assembly',
    label: '二级布利什锁与弹鼓剖拆',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '分离 H 型青铜布利什块、毛毡润滑油垫、枪机前置惯性击锤与击针，掀开 50 发 L 型弹鼓前盖暴露四翼星轮发条转子与螺旋排列的 .45 ACP 黄铜实弹柱。',
  },
  {
    id: 'full_exploded',
    label: '全枪 25 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 25 个 1:1 军械零件零干涉展开：从 28 道散热环枪管、卡茨防跳器、45° 斜槽青铜布利什粘附延迟机构、莱曼精密梯形照门到发条驱动 50 发大弹鼓，全景呈现二十世纪最具传奇色彩的冲锋枪。',
  },
];

export const THOMPSON_PARTS: WeaponPartSpec[] = [
  // ==================== 1. FINNED BARREL, CUTTS COMP & BLISH-LOCK BOLT GROUP ('slide' · 9 parts) ====================
  {
    id: 'thompson_barrel',
    bomCode: 'B-01',
    nameZh: '10.5英寸28道径向散热鳍烤蓝精钢枪管',
    calloutLabel: '28道散热鳍精钢枪管',
    nameEn: '10.5" Deeply Finned Blued Alloy Steel Barrel (28 Cooling Fins)',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [25.8, 1.6, 0],
    explodeSteps: [
      { range: [0.2, 0.56], offset: [11.5, 4.8, 0] },
      { range: [0.68, 0.96], offset: [5.5, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [2.0, 1.25, 0],
    labelAppearAt: 0.05,
    roleTag: '267mm 1:16"六膛线 · 车削28道深散热环显著增大对流散热面积',
    description:
      '全长 267 mm（10.5 英寸）高强度烤蓝钢枪管，外圆精车 28 道标志性深槽径向冷却散热鳍（Cooling Fins）：不仅大幅提高连续扫射 50 发大弹鼓时的空气自然散热效率，更塑造了 M1928A1 不可替代的工业雕塑轮廓。',
  },
  {
    id: 'thompson_cutts_comp',
    bomCode: 'B-02',
    nameZh: '卡茨四槽防跳制退器与圆环片状前准星(Cutts Compensator)',
    calloutLabel: '卡茨四槽防跳制退器',
    nameEn: '4-Slot Cutts Muzzle Compensator w/ Ring Front Sight Blade',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [42.6, 1.6, 0],
    explodeSteps: [
      { range: [0.2, 0.56], offset: [19.5, 4.8, 0], rotation: [0.75, 0, 0] },
      { range: [0.68, 0.96], offset: [8.5, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.14,
    roleTag: '顶部四道高压排气槽向下反压枪口 · 有效驯服750发/分连发上跳',
    description:
      '由美国海军陆战队理查德·卡茨上校研制的经典枪口防跳补偿器：顶部开设四道大尺寸倾斜排气槽，将出膛 .45 ACP 燃气向上前方高速喷出，产生向下压制力矩显著平抑 700–800 发/分连发时的枪口上扬，前端一体钎焊圆环前准星。',
  },
  {
    id: 'thompson_bolt',
    bomCode: 'B-03',
    nameZh: '整块铣削开膛枪机(含72°布利什导槽与弹簧抽壳钩)',
    calloutLabel: '铣削开膛枪机与斜导槽',
    nameEn: 'Milled Open-Bolt Breechblock w/ 72° Blish Cam Slots & Extractor',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0.2, 1.6, 0],
    explodeSteps: [
      { range: [0.14, 0.3], offset: [-14.0, 5.2, 0] },
      { range: [0.38, 0.66], offset: [-4.5, 2.4, 0] },
      { range: [0.68, 0.96], offset: [-3.0, 1.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.18,
    roleTag: '内铣72°斜槽啮合青铜布利什块 · 前下缘直接从50发弹鼓口推弹',
    description:
      '重型整块合金钢立铣成型的开膛枪机：两侧精铣 72° 倾斜导槽精准承托青铜布利什 H 锁块，前端装有弹簧钢抽壳钩与铰接式前冲惯性击锤；开膛待击时被底部阻铁锁于后方，扣动扳机瞬间前冲 68 mm 推弹入膛并闭锁击发。',
  },
  {
    id: 'thompson_blish_lock',
    bomCode: 'B-04',
    nameZh: '约翰·布利什专利青铜H型异质金属粘附延迟锁块',
    calloutLabel: '青铜H型布利什延迟锁',
    nameEn: 'Patent Cast-Bronze H-Piece Blish Adhesion-Delayed Blowback Lock',
    group: 'slide',
    material: 'copper_accent',
    assembledPos: [1.6, 1.75, 0],
    explodeSteps: [
      { range: [0.14, 0.3], offset: [-14.0, 5.2, 0] },
      { range: [0.38, 0.66], offset: [4.2, 7.6, 0] },
      { range: [0.68, 0.96], offset: [2.2, 3.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.28,
    roleTag: '沿机匣45°斜槽上下滑移 · 利用青铜/钢摩擦原理实现半自由延迟闭锁',
    description:
      '海军军官约翰·布利什（John Blish）的传奇专利：整块铸造磷青铜铣削成极具辨识度的 H 形双耳滑块。枪机闭锁到位时，它沿机匣两侧 45° 倾斜轨道向前下方落入锁位；击发瞬间 .45 ACP 高膛压令青铜双耳紧压钢槽壁产生阻滞延迟，待膛压回落后方沿 72° 枪机斜面向上滑脱解锁！',
  },
  {
    id: 'thompson_actuator',
    bomCode: 'B-05',
    nameZh: '机匣顶置滚花开膛拉机柄与瞄准豁口滑块',
    calloutLabel: '顶置滚花开膛拉机柄',
    nameEn: 'Top-Mounted Knurled Open-Bolt Actuator Knob & Sight-Slot Bar',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0.2, 3.35, 0],
    explodeSteps: [
      { range: [0.14, 0.3], offset: [-14.0, 5.2, 0] },
      { range: [0.38, 0.66], offset: [-3.0, 8.8, 0] },
      { range: [0.68, 0.96], offset: [-2.0, 3.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.16,
    roleTag: 'M1928A1标志性顶置球形拉柄 · 中央开V型通槽不遮挡莱曼瞄准线',
    description:
      '垂直穿出机匣顶部长槽的汤姆逊 M1928 标志性圆盘滚花拉机柄（区别于战时简化侧置拉柄的 M1A1）：顶部圆盘中央特意铣出一道宽阔 V 形透光凹槽，保证射手透过后方莱曼照门瞄准时视线畅通无阻；击发全程随枪机与布利什块高速往复。',
  },
  {
    id: 'thompson_hammer_pin',
    bomCode: 'B-06',
    nameZh: '枪机前置杠杆惯性击锤与防早发浮动击针组',
    calloutLabel: '机头前置击锤与击针',
    nameEn: 'Bolt-Mounted Pivoting Inertia Hammer & Floating Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [3.8, 1.6, 0],
    explodeSteps: [
      { range: [0.14, 0.3], offset: [-14.0, 5.2, 0] },
      { range: [0.38, 0.66], offset: [8.8, 4.6, 4.2] },
      { range: [0.68, 0.96], offset: [4.2, 2.2, 2.2] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.4,
    roleTag: '闭锁瞬间撞击机匣前壁翻转敲针 · 替代固定击针杜绝未闭锁早发',
    description:
      '不同于粗糙廉价冲锋枪的固定死击针，M1928A1 在枪机前端暗藏一枚小型铰接杠杆击锤与浮动击针：唯有当枪机彻底闭拢、青铜布利什块落入 45° 斜槽后，击锤下脚才撞上机匣前壁凸台向前挥击，把浮动击针敲出镜面引燃 .45 ACP 底火！',
  },
  {
    id: 'thompson_buffer_pilot',
    bomCode: 'B-07',
    nameZh: '复进簧钢制导杆与硫化纤维后坐缓冲垫盘',
    calloutLabel: '复进簧导杆与纤维缓冲盘',
    nameEn: 'Steel Recoil Spring Guide Pilot & Vulcanized Fiber Buffer Disc',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-8.8, 1.6, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [-16.0, 2.8, 0] },
      { range: [0.38, 0.66], offset: [-6.5, 1.2, 0] },
      { range: [0.68, 0.96], offset: [-4.0, 0.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.34,
    roleTag: '尾柱穿出机匣后壁兼作上下机匣快拆卡销 · 纤维盘缓冲后坐撞击',
    description:
      '集双重职能于一身的精密导杆尾柱组件：前杆引导长螺旋复进簧平稳伸缩，中盘嵌装暗红硫化纤维缓冲垫柔和吸收重枪机后坐撞击，尾端圆柱按钮穿出机匣尾板兼作上下机匣的免工具分解锁销。',
  },
  {
    id: 'thompson_recoil_spring',
    bomCode: 'B-08',
    nameZh: '高弹钢琴钢丝长行程开膛复进驱动主簧',
    calloutLabel: '开膛复进驱动螺旋主簧',
    nameEn: 'High-Tensile Piano-Wire Open-Bolt Helical Driving Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-4.4, 1.6, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [-22.5, 6.8, 0] },
      { range: [0.38, 0.66], offset: [-9.5, 2.6, 0] },
      { range: [0.68, 0.96], offset: [-5.5, 1.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.16,
    roleTag: '开膛预压蓄能 · 驱动重枪机以750发/分节奏稳定剥弹连发',
    description:
      '穿套于导杆之上、深嵌于枪机尾孔内的细密螺旋复进主簧：开膛待击时处于高度压缩储能态，扣下扳机瞬间迅猛伸展推动枪机前冲 68 mm 完成供弹与布利什闭锁，后坐越程时再度压缩至缓冲垫。',
  },
  {
    id: 'thompson_oiler',
    bomCode: 'B-09',
    nameZh: '机匣内嵌黄铜背板毛毡布利什滑道自动润滑油垫',
    calloutLabel: '毛毡黄铜自动润滑油垫',
    nameEn: 'Brass-Backed Felt Blish-Lock Lubricating Oiler Pads',
    group: 'slide',
    material: 'copper_accent',
    assembledPos: [1.8, 1.6, 0],
    explodeSteps: [
      { range: [0.34, 0.64], offset: [5.5, 6.8, -6.5] },
      { range: [0.68, 0.96], offset: [2.5, 2.8, -3.2] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.42,
    roleTag: 'M1928A1独有考究细节 · 吸满枪油在往复中持续润泽青铜滑槽',
    description:
      '仅见于早期精密版本 M1928 与 M1928A1 的奢侈军工细节：镶嵌在机匣内壁前侧的黄铜架浸油毛毡双垫片，每当枪机与青铜布利什块高速擦过，毛毡自动涂敷微米级枪油膜确保 45° 斜槽滑动顺畅不咬死。',
  },

  // ==================== 2. MILLED RECEIVER, LYMAN SIGHT, LOWER FRAME & WALNUT FURNITURE ('frame' · 7 parts) ====================
  {
    id: 'thompson_receiver',
    bomCode: 'F-01',
    nameZh: '整块锻钢立铣上机匣(含45°布利什斜槽与L型弹鼓T型滑轨)',
    calloutLabel: '整块铣削钢上机匣',
    nameEn: 'Solid Milled Billet Steel Upper Receiver w/ 45° Blish & Drum Slots',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [1.0, 1.5, 0],
    explodeSteps: [],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-1.0, 1.9, 0],
    labelAppearAt: 0.04,
    roleTag: '高成本整块合金钢铣削 · 经典烤蓝拉丝面镌刻Auto-Ordnance原厂铭文',
    description:
      '铸造自实心优质合金钢坯、历经数十道精密立铣工序打造的传奇上机匣：顶部开设长条拉机柄滑槽，右侧开窗抛出 .45 ACP 空壳，双侧内壁精铣 45° 布利什倾斜锁槽，底部横向铣有供 50 发 L 型大弹鼓左右滑入锁死的 T 型燕尾滑轨！',
  },
  {
    id: 'thompson_lyman_sight',
    bomCode: 'F-02',
    nameZh: '莱曼精密可调觇孔梯形立式表尺照门(带双护翼)',
    calloutLabel: '莱曼精密梯形表尺照门',
    nameEn: 'Lyman Adjustable Aperture Ladder Rear Sight w/ Protective Wings',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-8.6, 3.85, 0],
    explodeSteps: [
      { range: [0.18, 0.5], offset: [-5.5, 9.2, 0] },
      { range: [0.68, 0.96], offset: [-2.8, 4.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.16,
    roleTag: '600码精密高低风偏游标尺 · 1920年代工艺巅峰的象征配置',
    description:
      '铆装于上机匣尾顶的著名莱曼（Lyman）精密可调梯形机械表尺：放倒为近战快速缺口，竖起可借风偏与高低滚花微调旋钮标定至 600 码，两侧加装厚钢防撞护耳——后世战时简化型 M1A1 被迫取消该昂贵照门，使其成为 M1928A1 身价象征。',
  },
  {
    id: 'thompson_lower_frame',
    bomCode: 'F-03',
    nameZh: '整块铣削下机匣火控盒、闭环护圈与枪托滑槽座',
    calloutLabel: '铣削下机匣与闭环护圈',
    nameEn: 'Milled Lower Trigger Frame, Welded Guard & Buttstock Slide Track',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-4.2, -1.25, 0],
    explodeSteps: [
      { range: [0.1, 0.28], offset: [-2.0, -7.8, 0] },
      { range: [0.38, 0.66], offset: [-1.5, -3.5, 0] },
      { range: [0.68, 0.96], offset: [-1.0, -2.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, -1.8, 0],
    labelAppearAt: 0.12,
    roleTag: '上下燕尾长滑轨精密扣合 · 尾部自带燕尾快拆枪托导轨',
    description:
      '沿长条燕尾滑轨与上机匣严密拼合的整块铣削下机匣：一体铣出前后严实闭环扳机护圈，容纳全部单连发火控杠杆与双拨片快慢机，后端集成独特快拆滑轨使木枪托一按即卸变身紧凑近战冲锋枪。',
  },
  {
    id: 'thompson_foregrip',
    bomCode: 'F-04',
    nameZh: '经典指槽雕刻美洲黑胡桃木垂直前握把与钢制固定梁',
    calloutLabel: '黑胡桃木垂直前握把',
    nameEn: 'Contoured Finger-Grooved American Black Walnut Vertical Foregrip',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [23.5, -3.2, 0],
    explodeSteps: [
      { range: [0.16, 0.5], offset: [5.5, -9.8, 0] },
      { range: [0.68, 0.96], offset: [2.8, -4.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0.5, -3.5, 0],
    labelAppearAt: 0.1,
    roleTag: '“芝加哥打字机”灵魂剪影 · 贴合四指弧槽实现抵腰强力控枪',
    description:
      '经由前端重型钢制悬梁锁固在机匣鼻端下的经典垂直手枪式前握把：精选美洲直纹黑胡桃木车铣出流畅贴手的四指防滑指槽，令射手在挂装重达 2.2 公斤的满载 50 发大弹鼓时仍能稳健控枪快速指向扫射。',
  },
  {
    id: 'thompson_pistol_grip',
    bomCode: 'F-05',
    nameZh: '后置指槽雕塑美洲黑胡桃木手枪握把',
    calloutLabel: '黑胡桃木后手枪握把',
    nameEn: 'Contoured American Black Walnut Rear Pistol Grip',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-8.4, -5.85, 0],
    explodeSteps: [
      { range: [0.1, 0.28], offset: [-2.0, -7.8, 0] },
      { range: [0.36, 0.64], offset: [-3.5, -7.5, 0] },
      { range: [0.68, 0.96], offset: [-2.0, -3.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.18,
    roleTag: '宽大后倾倾角与手搓亚麻籽油抛光 · 与前握把构成完美对称人机学',
    description:
      '通过纵向通孔长螺钉固装于下机匣腹部的实心美洲黑胡桃木后握把，表面采用传统手工亚麻籽油反复擦拭出温润栗褐绸缎光泽，前缘雕琢契合手掌的三指指槽。',
  },
  {
    id: 'thompson_buttstock',
    bomCode: 'F-06',
    nameZh: '燕尾滑轨快拆式美洲黑胡桃木实心枪托(带背带环)',
    calloutLabel: '快拆黑胡桃木实木枪托',
    nameEn: 'Quick-Detach Slide-On American Black Walnut Buttstock',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-25.4, -2.85, 0],
    explodeSteps: [
      { range: [0.06, 0.24], offset: [-18.5, -1.8, 0] },
      { range: [0.38, 0.66], offset: [-9.5, -1.0, 0] },
      { range: [0.68, 0.96], offset: [-5.5, -0.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [-4.0, -2.2, 0],
    labelAppearAt: 0.08,
    roleTag: '下倾弧度贴腮舒适 · 一键向后滑脱迅速缩短全枪长度至60厘米',
    description:
      '带有优雅大下倾角度的整块美洲黑胡桃木快拆枪托，配以顶部钢制滑槽卡扣与下腹背带环：常规抵肩射击提供极佳自然瞄准贴腮感，乘车或狭小空间突击时按下解锁按钮即可向后抽出整根枪托！',
  },
  {
    id: 'thompson_buttplate',
    bomCode: 'F-07',
    nameZh: '烤蓝钢制带油壶暗门托底板与前快拆燕尾滑锁',
    calloutLabel: '暗门钢托底板与快拆滑锁',
    nameEn: 'Blued Steel Trapdoor Buttplate & Front Slide-Latch Hardware',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-38.4, -4.15, 0],
    explodeSteps: [
      { range: [0.06, 0.24], offset: [-18.5, -1.8, 0] },
      { range: [0.38, 0.66], offset: [-15.0, -1.6, 0] },
      { range: [0.68, 0.96], offset: [-7.5, -0.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.42,
    roleTag: '中央弹簧活门暗藏随枪油壶 · 防滑网纹弧面抵肩稳固',
    description:
      '包覆胡桃木托尾端的冲压烤蓝钢弧形托底板：表面轧制细密防滑棱纹并设弹簧开合小暗门，内藏随枪保养油壶，与前端钢制滑锁共同加固木托受力两端。',
  },

  // ==================== 3. SELECT-FIRE SEAR, TWIN PADDLE SELECTORS & MAG CATCH ('fire_control' · 5 parts) ====================
  {
    id: 'thompson_trigger',
    bomCode: 'FC-01',
    nameZh: '弧形铣削钢制扳机与单发断连摇臂',
    calloutLabel: '弧形钢扳机与断连摇臂',
    nameEn: 'Milled Curved Steel Trigger & Disconnector Trip Lever',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-2.8, -2.55, 0],
    explodeSteps: [
      { range: [0.1, 0.28], offset: [-2.0, -7.8, 0] },
      { range: [0.4, 0.68], offset: [5.5, -1.8, 4.2] },
      { range: [0.68, 0.96], offset: [2.5, -1.0, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.36,
    roleTag: '协同前端摇臂切换单/连发 · 干脆利落一道火开膛释放',
    description:
      '安装在闭环钢护圈内的精铣弧形扳机，顶部铰接单发断连器：在 SINGLE 半自动档位下每发后自动脱钩复位，推至 FULL AUTO 档位则被快慢机顶住直通阻铁实现绵密全自动连发。',
  },
  {
    id: 'thompson_sear',
    bomCode: 'FC-02',
    nameZh: '双模式开膛待击主阻铁与摇臂组(Sear & Rocker)',
    calloutLabel: '开膛待击主阻铁与摇臂',
    nameEn: 'Select-Fire Open-Bolt Primary Sear & Rocker Pivot',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-3.2, -0.55, 0],
    explodeSteps: [
      { range: [0.1, 0.28], offset: [-2.0, -7.8, 0] },
      { range: [0.4, 0.68], offset: [-1.5, 2.2, 4.2] },
      { range: [0.68, 0.96], offset: [-1.0, 1.0, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.36,
    roleTag: '精密渗碳挂机鼻锁定重型铣削枪机 · 支持精确半自动点射与连发',
    description:
      '由主阻铁、阻铁杠杆与半自动摇臂组成的考究开膛火控核心：松开扳机或单发截获时向上探入机匣稳稳挂住后坐的枪机底槽，令汤姆逊在冲锋枪中拥有罕见的单发精准度。',
  },
  {
    id: 'thompson_selector_levers',
    bomCode: 'FC-03',
    nameZh: '左侧双独立桨式拨片：火控快慢机与手动保险',
    calloutLabel: '左侧双拨片快慢机与保险',
    nameEn: 'Left-Side Twin Paddle Levers: Fire Selector & Manual Safety',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-5.2, -1.05, -1.78],
    explodeSteps: [
      { range: [0.1, 0.28], offset: [-2.0, -7.8, 0] },
      { range: [0.36, 0.64], offset: [-1.5, -0.5, -6.2] },
      { range: [0.68, 0.96], offset: [-1.0, -0.3, -3.2] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.2,
    roleTag: '前拨片切换FULL AUTO/SINGLE · 后拨片切换FIRE/SAFE物理锁阻铁',
    description:
      '汤姆逊下机匣左侧极具辨识度的双桨式独立拨片：前方拨片旋转 180° 在 FULL AUTO（全自动）与 SINGLE（半自动）间切换，后方拨片控制 FIRE（击发）与 SAFE（保险），大拇指无需离握即可直观盲辨档位。',
  },
  {
    id: 'thompson_mag_catch',
    bomCode: 'FC-04',
    nameZh: '左侧拇指按压式通用弹匣与50发弹鼓锁止卡笋',
    calloutLabel: '左侧弹匣与弹鼓通用卡笋',
    nameEn: 'Thumb-Operated Left-Side Box Magazine & Type L Drum Catch',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [4.2, -0.85, -1.72],
    explodeSteps: [
      { range: [0.1, 0.28], offset: [-2.0, -7.8, 0] },
      { range: [0.38, 0.66], offset: [3.2, -0.6, -5.8] },
      { range: [0.68, 0.96], offset: [1.5, -0.3, -2.8] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.24,
    roleTag: '向上拨动即解锁横滑50发弹鼓或下抽20/30发双排直弹匣',
    description:
      '位于扳机前左侧的带滚花指垫旋转卡笋：单手向上拨起即可释放下挂的 20/30 发直弹匣，或在枪机拉至后方待击位后横推卸出 50 发 L 型圆形大弹鼓。',
  },
  {
    id: 'thompson_sear_spring',
    bomCode: 'FC-05',
    nameZh: '下机匣阻铁与扳机螺旋复位弹簧',
    calloutLabel: '阻铁与扳机螺旋复位簧',
    nameEn: 'Helical Trigger & Open-Bolt Sear Return Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-3.8, -1.65, 0],
    assembledRot: [0, 0, Math.PI / 2],
    explodeSteps: [
      { range: [0.1, 0.28], offset: [-2.0, -7.8, 0] },
      { range: [0.4, 0.68], offset: [-5.5, -1.8, 4.2] },
      { range: [0.68, 0.96], offset: [-2.5, -1.0, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.44,
    roleTag: '提供利落阻铁回弹与扳机复位阻尼',
    description:
      '垂直安装于下机匣火控腔内的弹簧钢螺旋压簧，为开膛主阻铁与扳机提供可靠向上的回位力矩。',
  },

  // ==================== 4. 50-ROUND TYPE L CLOCKWORK DRUM, ROTOR & SPIRAL ROUNDS ('magazine' · 4 parts) ====================
  {
    id: 'thompson_drum_mag',
    bomCode: 'M-01',
    nameZh: '50发L型发条螺旋冲压钢大弹鼓外壳(含阿基米德螺旋导轨)',
    calloutLabel: '50发L型螺旋大弹鼓',
    nameEn: '50-Round Type L Clockwork Drum Magazine Housing & Spiral Track',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [7.8, -7.8, 0],
    explodeSteps: [
      { range: [0.04, 0.22], offset: [0, -8.5, -7.2] },
      { range: [0.36, 0.64], offset: [0, -4.5, -3.5] },
      { range: [0.68, 0.96], offset: [0, -2.5, -2.0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [2.2, -3.5, 0],
    labelAppearAt: 0.04,
    roleTag: '直径165mm经典“圆鼓”剪影 · 透视/剖视直击内部阿基米德螺旋弹道',
    description:
      '汤姆逊最深入人心的传奇标志——50 发 L 型（Type L）冲压烤蓝钢发条圆鼓：外壳前后冲压精密阿基米德螺旋导轨沟槽，顶部带横向 T 形燕尾滑块插入机匣腹槽；开启 X-Ray 或 CT 纵剖可穿透外壳直观观察内部螺旋弹道与发条转子！',
  },
  {
    id: 'thompson_drum_rotor',
    bomCode: 'M-02',
    nameZh: '发条弹鼓四翼星轮供弹转子与前置折叠上弦钥匙',
    calloutLabel: '四翼发条转子与上弦钥匙',
    nameEn: 'Central 4-Arm Clockwork Rotor Spider & Front Folding Winding Key',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [7.8, -7.8, 0],
    explodeSteps: [
      { range: [0.04, 0.22], offset: [0, -8.5, -7.2] },
      { range: [0.36, 0.64], offset: [5.5, -4.5, 11.2] },
      { range: [0.68, 0.96], offset: [3.2, -2.5, 4.8] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [2.4, 0, 0],
    labelAppearAt: 0.34,
    roleTag: '上弦9响蓄满发条势能 · 每击发一弹绕X轴步进旋转推送整列弹柱',
    description:
      '位于 50 发圆鼓轴心的四翼星形钢制供弹转子与外部可折叠钢片上弦钥匙（Winding Key）：装满 50 发 .45 ACP 实弹并扣紧前盖后，顺时针拧动上弦钥匙听到清脆“9 声咔哒”蓄满发条扭矩，击发循环中转子同步绕膛轴（X 轴）旋转推动螺旋弹列向上供弹！',
  },
  {
    id: 'thompson_drum_rounds',
    bomCode: 'M-03',
    nameZh: '阿基米德螺旋轨道内50发 .45 ACP 230格令黄铜实弹阵',
    calloutLabel: '.45 ACP 螺旋排列实弹阵',
    nameEn: 'Radial Spiral Array of .45 ACP 230gr Brass Cartridges in Drum Track',
    group: 'magazine',
    material: 'copper_accent',
    assembledPos: [7.8, -7.8, 0],
    explodeSteps: [
      { range: [0.04, 0.22], offset: [0, -8.5, -7.2] },
      { range: [0.36, 0.64], offset: [4.2, -4.5, 0.8] },
      { range: [0.68, 0.96], offset: [2.2, -2.5, 0.5] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.36,
    roleTag: '双圈阿基米德螺线径向密排 · 14.9克重型圆头弹蓄势待发',
    description:
      '沿 Type L 弹鼓内外双圈阿基米德螺旋沟槽紧密排列的 .45 ACP（11.43×23mm）黄铜弹壳与紫铜全被甲圆头重弹阵：在四翼转子旋推下沿螺旋轨道首尾相接顺滑攀升至顶颈抱弹口，为 750 发/分连发提供充沛弹药储备。',
  },
  {
    id: 'thompson_drum_spring',
    bomCode: 'M-04',
    nameZh: 'L型圆鼓中心发条驱动储能盘簧',
    calloutLabel: '圆鼓中心发条储能盘簧',
    nameEn: 'Type L Drum Central Clockwork Tension Mainspring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [7.8, -7.8, 0],
    explodeSteps: [
      { range: [0.04, 0.22], offset: [0, -8.5, -7.2] },
      { range: [0.36, 0.64], offset: [-5.8, -4.5, 5.2] },
      { range: [0.68, 0.96], offset: [-3.2, -2.5, 2.8] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.4,
    roleTag: '高疲劳发条弹簧钢 · 为50发大质量.45 ACP弹阵提供恒定供弹扭矩',
    description:
      '密闭封装在弹鼓转子轴心内的重型发条储能弹簧：由前置上弦钥匙旋紧蓄能，在实弹射击过程中随转子每步进一发精准释放脉冲扭矩，确保沉重的 50 发大口径 .45 ACP 弹阵高速供弹绝不掉链。',
  },
];

export const THOMPSON_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'thompson_sear_drop',
    stepNum: '01',
    shortLabel: '扣机降开膛阻铁',
    title: '阶段 1 · 拨片置 FIRE/FULL AUTO，扣动扳机压低开膛阻铁释放重型铣削枪机',
    range: [0.0, 0.09],
    description:
      '左侧手动保险置于 FIRE、快慢机置于 FULL AUTO，食指扣下弧形扳机压低开膛主阻铁；在预压缩复进主簧强力推顶下，重型铣削枪机、青铜布利什块与顶置拉机柄同步向前疾冲。',
  },
  {
    id: 'thompson_feed_blish_lock',
    stepNum: '02',
    shortLabel: '推弹入膛与45°布利什落锁',
    title: '阶段 2 · 枪机剥离弹鼓顶发 .45 ACP 入膛，青铜H块沿45°斜槽落位并触发机头击锤',
    range: [0.09, 0.23],
    description:
      '枪机前冲 68 mm 将圆头 .45 ACP 实弹推入 10.5 英寸散热鳍枪管弹膛；抵定膛口瞬间，青铜 H 型布利什块沿机匣 45° 斜槽前下沉入延迟锁位，同时机头前置杠杆击锤撞击前壁翻转敲出浮动击针引燃底火！',
  },
  {
    id: 'thompson_blish_delay',
    stepNum: '03',
    shortLabel: '145 MPa 激燃与布利什阻滞',
    title: '阶段 3 · 230 gr 重弹加速出膛，青铜/钢异质界面在 145 MPa 高压下提供瞬态延迟',
    range: [0.23, 0.34],
    description:
      '14.9 克重型 .45 ACP 弹头沿 28 道散热鳍枪管加速，并于 f=0.32 穿出四槽卡茨防跳器（高压尾流向上喷出压低枪口）；高压峰值期青铜 H 锁块紧抵 45° 钢槽斜面延迟枪机过早开启。',
  },
  {
    id: 'thompson_blish_cam_out',
    stepNum: '04',
    shortLabel: '青铜H块沿72°斜面上滑解锁',
    title: '阶段 4 · 膛压安全回落，枪机 72° 斜槽将青铜布利什块向上抬离机匣 45° 锁槽',
    range: [0.34, 0.44],
    description:
      '随着弹头出膛、膛压迅速泄放，枪机后坐惯性经由 72° 倾斜导槽迫使青铜 H 型布利什锁块向上（+Y）抬升 5.5 mm 彻底脱离机匣 45° 斜耳，解锁整套重型自动机向后自由滑行。',
  },
  {
    id: 'thompson_recoil_drum_wind',
    stepNum: '05',
    shortLabel: '右抛铜壳与弹鼓四翼转子步进',
    title: '阶段 5 · 枪机与顶置拉机柄高速后坐右抛 .45 空壳，50发发条转子旋转推送新弹',
    range: [0.44, 0.64],
    description:
      '枪机、青铜 H 块与顶置滚花拉机柄同步后掠越程 21 mm 压紧复进簧，右侧抽壳钩在 f=0.52 将宽大 .45 ACP 黄铜空壳向右上方优雅抛出；与此同时，L 型圆鼓四翼发条转子绕 X 轴顺时针旋转推进整列螺旋弹阵！',
  },
  {
    id: 'thompson_fiber_rebound',
    stepNum: '06',
    shortLabel: '硫化纤维缓冲盘柔顺回弹',
    title: '阶段 6 · 枪机尾端撞击红褐硫化纤维缓冲垫止动，复进簧推顶自动机平顺回弹',
    range: [0.64, 0.82],
    description:
      '重型铣削枪机抵住后导杆上的暗红硫化纤维缓冲盘柔和卸力，杜绝钢铁硬碰损伤机匣尾壁；满载储能的长螺旋复进簧随即推顶枪机从 -21 mm 越程位平稳滑回阻铁挂机区。',
  },
  {
    id: 'thompson_open_bolt_ready',
    stepNum: '07',
    shortLabel: '开膛挂机待击循环闭环',
    title: '阶段 7 · 阻铁在弹簧推动下弹起截停枪机，敞开膛室通风散热回归待击',
    range: [0.82, 1.0],
    description:
      '松开扳机（或处于 SINGLE 半自动档位由断连器自动释放）后，阻铁迅速上弹咬合枪机底槽，新的一发 .45 ACP 实弹已在弹鼓顶颈抱弹口就位，随时响应下一轮点射或绵密扫射。',
  },
];

// ============================================================================
// OPEN-BOLT BLISH ADHESION-DELAYED BLOWBACK & CLOCKWORK DRUM KINEMATICS (f in [0, 1])
// ============================================================================

const THOMPSON_FORWARD_BOLT_STROKE = 6.8; // Open-bolt sear -> battery breech (+6.80 cm)
const THOMPSON_REAR_OVERTRAVEL = 2.1; // Rear fiber-buffer overtravel (-2.10 cm)
const THOMPSON_BLISH_DROP = 0.55; // 5.5 mm vertical & axial 45° Blish lock drop into receiver inclined slots!

interface ThompsonActionSample {
  boltDX: number;
  blishLock01: number;
  hammerTrip01: number;
  bufferDX: number;
  drumStep01: number;
}

function sampleThompsonAction(f: number): ThompsonActionSample {
  // 1. Open-bolt breechblock longitudinal position (0 at f=0 AND f=1!)
  let boltDX = 0;
  if (f >= 0.03 && f < 0.19) {
    boltDX = THOMPSON_FORWARD_BOLT_STROKE * seg(f, 0.03, 0.19);
  } else if (f >= 0.19 && f < 0.34) {
    // Dwell in battery under Blish bronze adhesion delay during 145 MPa peak pressure
    boltDX = THOMPSON_FORWARD_BOLT_STROKE;
  } else if (f >= 0.34 && f < 0.43) {
    // Initial slow opening as Blish H-piece cams upward out of 45° receiver slots
    boltDX = THOMPSON_FORWARD_BOLT_STROKE - 0.65 * seg(f, 0.34, 0.43);
  } else if (f >= 0.43 && f < 0.64) {
    // Full blowback recoil past open-bolt sear into fiber buffer overtravel (-2.10 cm)
    const startX = THOMPSON_FORWARD_BOLT_STROKE - 0.65;
    boltDX =
      startX + (-THOMPSON_REAR_OVERTRAVEL - startX) * seg(f, 0.43, 0.64);
  } else if (f >= 0.64 && f < 0.68) {
    boltDX = -THOMPSON_REAR_OVERTRAVEL;
  } else if (f >= 0.68 && f < 0.85) {
    boltDX = -THOMPSON_REAR_OVERTRAVEL * (1 - seg(f, 0.68, 0.85));
  }

  // 2. Bronze Blish H-piece drops DOWN & FORWARD along 45° receiver inclined slots [0.17..0.23],
  //    holds during peak pressure [0.23..0.34], then cams UPWARD out of 45° slots [0.34..0.43]!
  let blishLock01 = 0;
  if (f >= 0.17 && f < 0.23) {
    blishLock01 = seg(f, 0.17, 0.23);
  } else if (f >= 0.23 && f < 0.34) {
    blishLock01 = 1.0;
  } else if (f >= 0.34 && f < 0.43) {
    blishLock01 = 1.0 - seg(f, 0.34, 0.43);
  }

  // 3. Bolt-mounted pivoting inertia hammer trips forward at final battery [0.21..0.27]
  const hammerTrip01 = seg(f, 0.205, 0.235) - seg(f, 0.255, 0.32);

  // 4. Vulcanized fiber rear buffer compression when bolt overtravels behind sear (`boltDX < -0.5`)
  let bufferDX = 0;
  if (boltDX < -0.5) {
    const overU = smoothstep01(
      (-boltDX - 0.5) / (THOMPSON_REAR_OVERTRAVEL - 0.5)
    );
    bufferDX = -0.35 * overU;
  }

  // 5. Clockwork 50-rd Type L drum rotor smooth indexing pulse during recoil/feed [0.46..0.78]
  const drumStep01 =
    f > 0.46 && f < 0.82 ? Math.sin(linearSeg(f, 0.46, 0.82) * Math.PI) : 0;

  return { boltDX, blishLock01, hammerTrip01, bufferDX, drumStep01 };
}

export function computeThompsonFiringKinematics(
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

  const { boltDX, blishLock01, hammerTrip01, bufferDX, drumStep01 } =
    sampleThompsonAction(f);

  const searPullDrop = seg(f, 0.008, 0.045) - seg(f, 0.58, 0.68);
  const searRatchetBump =
    f > 0.72 && f < 0.83
      ? Math.sin(linearSeg(f, 0.72, 0.83) * Math.PI) * 0.4
      : 0;
  const searDrop01 = clamp01(searPullDrop + searRatchetBump);

  switch (partId) {
    case 'thompson_bolt': {
      dx = boltDX;
      break;
    }

    case 'thompson_blish_lock': {
      // Moves longitudinally with bolt PLUS slides 45° downward (-Y) & forward (+X) into receiver inclined lock slots!
      dx = boltDX + THOMPSON_BLISH_DROP * 0.55 * blishLock01;
      dy = -THOMPSON_BLISH_DROP * blishLock01;
      break;
    }

    case 'thompson_actuator': {
      // Classic M1928A1 top-mounted actuator knob reciprocates 1:1 with the bolt & Blish H-piece!
      dx = boltDX + THOMPSON_BLISH_DROP * 0.25 * blishLock01;
      break;
    }

    case 'thompson_hammer_pin': {
      dx = boltDX + 0.28 * hammerTrip01;
      rz = -0.35 * hammerTrip01;
      break;
    }

    case 'thompson_buffer_pilot': {
      dx = bufferDX;
      break;
    }

    case 'thompson_recoil_spring': {
      // Local spring spans [-5.2, +5.2] (L0 = 10.4 cm), rear end pinned at X = -5.2
      const pinAnchorX = -5.2;
      const L0 = 10.4;
      const LNew = Math.max(5.5, L0 + boltDX);
      scaleX = LNew / L0;
      dx = pinAnchorX * (1 - scaleX);
      break;
    }

    case 'thompson_trigger': {
      const pull = seg(f, 0.0, 0.055) - seg(f, 0.56, 0.66);
      rz = -0.24 * pull;
      break;
    }

    case 'thompson_sear': {
      dy = -0.32 * searDrop01;
      rz = 0.12 * searDrop01;
      break;
    }

    case 'thompson_sear_spring': {
      // Vertical spring (`assembledRot: [0, 0, Math.PI / 2]`, local X in [-0.72, +0.72])
      const pinAnchorX = -0.72;
      scaleX = 1 - 0.25 * searDrop01;
      dy = pinAnchorX * (1 - scaleX);
      break;
    }

    case 'thompson_drum_rotor': {
      // Central 4-arm clockwork rotor & winding key rotates around X axis to advance spiral .45 ACP feed track!
      rx = 0.34 * drumStep01;
      break;
    }

    case 'thompson_drum_rounds': {
      // Spiral .45 ACP cartridge array advances subtly in angular lockstep with the 4-arm rotor!
      rx = 0.14 * drumStep01;
      break;
    }

    case 'thompson_drum_spring': {
      // Clockwork drum tension spring dynamically flexes/pulses during rotor feed indexing!
      scaleX = 1 - 0.18 * drumStep01;
      rx = 0.34 * drumStep01;
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
 * Authentic Open-Bolt .45 ACP (230 gr FMJ-RN) Clockwork Drum-Fed Ballistics:
 *  - `f = 0` & `f = 1`: Chamber EMPTY (open bolt); next .45 ACP round staged at Type L drum feed lips `[7.8, 0.55, 0]`.
 *  - `f in [0.03, 0.22)`: Advancing milled bolt strips round forward into 10.5" finned barrel chamber `[12.5, 1.60, 0]`.
 *  - `ignitionF = 0.23` -> `muzzleExitF = 0.32`: 230gr subsonic heavy round accelerates past Cutts compensator (`X = 46.2`, upward gas vent!).
 *  - `f in [0.36, 0.52]` -> `ejectF = 0.52`: Spent .45 ACP brass arcs briskly out the right (`+Z`) ejection window!
 */
export function computeThompsonBallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const { boltDX } = sampleThompsonAction(f);

  // 1. .45 ACP 230gr FMJ-RN Projectile (ignition f=0.23 -> Cutts muzzle X=46.2 at f=0.32)
  const bulletVisible = f >= 0.225 && f < 0.48;
  let bulletX = 14.2;
  let streakLength = 0;

  if (f >= 0.23 && f < 0.32) {
    const u = Math.pow(linearSeg(f, 0.23, 0.32), 1.35);
    bulletX = 14.2 + (46.2 - 14.2) * u;
    streakLength = 3.8 * u;
  } else if (f >= 0.32 && f < 0.48) {
    const u = linearSeg(f, 0.32, 0.48);
    bulletX = 46.2 + 38.0 * u;
    streakLength = 6.2 * (1 - u * 0.45);
  }

  // 2. Chambered / Extracting .45 ACP Brass Case -> Right-Flank (+Z) Ejection at f = 0.52
  const spentCaseVisible = f >= 0.225 && f < 0.8;
  let caseX = 12.5;
  let caseY = 1.6;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.34 && f < 0.52) {
    caseX = 12.5 + (boltDX - THOMPSON_FORWARD_BOLT_STROKE);
  } else if (f >= 0.52 && f < 0.8) {
    const u = linearSeg(f, 0.52, 0.8);
    const ejectOriginX =
      12.5 + (sampleThompsonAction(0.52).boltDX - THOMPSON_FORWARD_BOLT_STROKE);
    caseX = ejectOriginX + 1.8 * u;
    caseY = 1.6 + 5.2 * u - 11.5 * u * u;
    caseZ = 12.5 * u;
    caseRX = u * 8.8;
    caseRY = -u * 12.6;
    caseRZ = -u * 10.4;
    if (f > 0.68) {
      spentCaseOpacity = 1 - linearSeg(f, 0.68, 0.8);
    }
  }

  // 3. Chamber Flash, Cutts Compensator Upward Vent Flash & Muzzle Plume
  const chamberFlashIntensity =
    f >= 0.225 && f <= 0.3
      ? Math.sin(linearSeg(f, 0.225, 0.3) * Math.PI)
      : 0;

  // Cutts Compensator 4 upward gas slots flash cleanly at muzzle exit!
  const gasPortFlashIntensity =
    f >= 0.305 && f <= 0.395
      ? Math.sin(linearSeg(f, 0.305, 0.395) * Math.PI) * 0.85
      : 0;

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.312 && f <= 0.405) {
    const u = linearSeg(f, 0.312, 0.405);
    muzzlePlumeScale = 0.42 + 1.35 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.82;
  }

  // 4. Open-Bolt Type L Drum Feed Choreography (zero jump between f=0 and f=1!)
  let nextX = 7.8;
  let nextY = 0.55;
  const nextZ = 0;
  let nextRZ = 0.14;

  if (f >= 0.035 && f < 0.225) {
    const u = seg(f, 0.035, 0.21);
    nextX = 7.8 + (12.5 - 7.8) * u;
    nextY = 0.55 + (1.6 - 0.55) * smoothstep01(u);
    nextRZ = 0.14 * (1 - u);
  } else if (f >= 0.225 && f < 0.46) {
    nextX = 7.8;
    nextY = -0.65;
    nextRZ = 0.12;
  } else if (f >= 0.46 && f < 0.78) {
    const u = seg(f, 0.46, 0.78);
    nextX = 7.8;
    nextY = -0.65 + (0.55 - -0.65) * u;
    nextRZ = 0.12 + 0.02 * u;
  }

  // 5. Reserve .45 ACP round rising out of drum neck behind active round
  const feedShift = seg(f, 0.46, 0.78);
  const resX = 7.8;
  const resY = -1.85 + (-0.65 - -1.85) * feedShift;
  const resZ = 0.22 * (1 - feedShift);

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.6, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [42.6, 2.75, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, resZ],
  };
}

const THOMPSON_V3_WALNUT_BUNDLE: PbrBindingSpec = {
  albedoFile: 'thompson_v3_walnut_albedo.webp',
  normalFile: 'thompson_v3_walnut_normal.webp',
  roughnessFile: 'thompson_v3_walnut_roughness.webp',
  normalScale: 0.9,
};

const THOMPSON_V3_RECEIVER_BUNDLE: PbrBindingSpec = {
  albedoFile: 'thompson_v3_receiver_albedo.webp',
  normalFile: 'thompson_v3_receiver_normal.webp',
  roughnessFile: 'thompson_v3_receiver_roughness.webp',
  normalScale: 0.88,
};

const THOMPSON_V3_METAL_BUNDLE: PbrBindingSpec = {
  albedoFile: 'thompson_v3_metal_albedo.webp',
  normalFile: 'thompson_v3_metal_normal.webp',
  roughnessFile: 'thompson_v3_metal_roughness.webp',
  normalScale: 0.86,
};

export const THOMPSON_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  thompson_foregrip: THOMPSON_V3_WALNUT_BUNDLE,
  thompson_pistol_grip: THOMPSON_V3_WALNUT_BUNDLE,
  thompson_buttstock: THOMPSON_V3_WALNUT_BUNDLE,
  thompson_receiver: THOMPSON_V3_RECEIVER_BUNDLE,
  thompson_lyman_sight: THOMPSON_V3_RECEIVER_BUNDLE,
  thompson_lower_frame: THOMPSON_V3_RECEIVER_BUNDLE,
  thompson_buttplate: THOMPSON_V3_RECEIVER_BUNDLE,
  thompson_trigger: THOMPSON_V3_RECEIVER_BUNDLE,
  thompson_sear: THOMPSON_V3_RECEIVER_BUNDLE,
  thompson_selector_levers: THOMPSON_V3_RECEIVER_BUNDLE,
  thompson_mag_catch: THOMPSON_V3_RECEIVER_BUNDLE,
  thompson_barrel: THOMPSON_V3_METAL_BUNDLE,
  thompson_cutts_comp: THOMPSON_V3_METAL_BUNDLE,
  thompson_bolt: THOMPSON_V3_METAL_BUNDLE,
  thompson_blish_lock: THOMPSON_V3_METAL_BUNDLE,
  thompson_actuator: THOMPSON_V3_METAL_BUNDLE,
  thompson_hammer_pin: THOMPSON_V3_METAL_BUNDLE,
  thompson_buffer_pilot: THOMPSON_V3_METAL_BUNDLE,
  thompson_oiler: THOMPSON_V3_METAL_BUNDLE,
  thompson_drum_mag: THOMPSON_V3_METAL_BUNDLE,
  thompson_drum_rotor: THOMPSON_V3_METAL_BUNDLE,
  thompson_drum_rounds: THOMPSON_V3_METAL_BUNDLE,
};

export const THOMPSON_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'thompson_walnut',
    weapon: THOMPSON_ID,
    titleCn: '汤姆逊 M1928A1 垂直指槽前握把、后握把与快拆美洲黑胡桃木托贴图组',
    partTag: 'F-04 / F-05 / F-06 CONTOURED AMERICAN BLACK WALNUT',
    resolution: '2048 × 2048 px',
    summary:
      'Cycles Metal GPU 烘焙的 2K 5 通道 Packed ORM 实木贴图套件：细腻还原 1920s–WWII 经典手搓亚麻籽油美洲黑胡桃木年轮肌理、自然木孔法线与托身右侧 GEG 军检印章。',
    highlights: [
      '直纹美洲黑胡桃木深棕栗褐渐变年轮与自然开孔木纹法线',
      '手搓亚麻籽油缎面粗糙度起伏（R=0.34–0.52, M=0.0）零塑料感',
      '垂直前握把四指弧槽与枪托钢锁接缝处精准 Cycles 接触阴影 AO',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'thompson_v3_walnut_albedo.webp',
        note: 'sRGB · 亚麻籽油黑胡桃实木年轮 / GEG 军械厂检戳记',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'thompson_v3_walnut_normal.webp',
        note: 'Linear · 真实木孔纤维微起伏 + 倒角边缘与军检凹印',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'thompson_v3_walnut_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:手搓木油光泽(0.36-0.50) / B:纯绝缘木质',
      },
    ],
  },
  {
    id: 'thompson_receiver',
    weapon: THOMPSON_ID,
    titleCn: '整块立铣深烤蓝上机匣、Auto-Ordnance 原厂铭文与莱曼照门贴图组',
    partTag: 'F-01 / F-02 / F-03 / F-07 / FC-01–04 MILLED RECEIVER & FCG',
    resolution: '2048 × 2048 px',
    summary:
      '还原二战早期康涅狄格州布里奇波特 Auto-Ordnance 厂精铣 Du-Lite 深烤蓝钢机匣：左右无畸变平面 Hero UV 带刻有正向清晰「THOMPSON SUBMACHINE GUN / CALIBER .45 AUTOMATIC / MODEL OF 1928」原厂铭文与专利号。',
    highlights: [
      'AgX 校准 Du-Lite 深烤蓝锻钢微蓝黑绸缎光泽（sRGB 0.18–0.26, R=0.24–0.32）',
      '双侧平面 Hero UV 正向无镜像原厂深凹钢印与 FULL AUTO / SINGLE 标刻',
      '莱曼梯形表尺、双桨式快慢机与闭环护圈精铣刀痕与金属边角磨损',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'thompson_v3_receiver_albedo.webp',
        note: 'sRGB · Du-Lite 深烤蓝锻钢 / THOMPSON 原厂深镌钢印',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'thompson_v3_receiver_normal.webp',
        note: 'Linear · 立铣横向拉丝 + 深凹铭文法线 + 拨片防滑刻槽',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'thompson_v3_receiver_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:烤蓝缎面(0.25-0.33) / B:高纯钢(0.90)',
      },
    ],
  },
  {
    id: 'thompson_metal',
    weapon: THOMPSON_ID,
    titleCn: '28道散热鳍枪管、青铜布利什H锁块与50发L型螺旋弹鼓贴图组',
    partTag: 'B-01–09 / M-01–03 FINNED BARREL, BRONZE BLISH & 50-RD DRUM',
    resolution: '2048 × 2048 px',
    summary:
      '集结 M1928A1 全部标志性金属精密构件：28 道散热鳍烤蓝枪管、卡茨防跳器、亮钢铣削枪机、L 型 50 发弹鼓正面环形铭文，并为磷青铜 H 型布利什锁块与 50 发螺旋 .45 ACP 黄铜实弹阵分别划设 >=75px 独立 UV 防火墙彻底零色渗！',
    highlights: [
      '磷青铜 H 型布利什锁块享有 >=75px 专属 UV 防火墙，呈现温润赤金青铜光泽',
      '50 发 Type L 弹鼓平面环形铭文「MAGAZINE TYPE L · 50 CARTRIDGES CAL. .45」清晰锐利',
      '螺旋轨道内 .45 ACP 黄铜弹壳与紫铜圆头弹独立 UV 隔离零渗色',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'thompson_v3_metal_albedo.webp',
        note: 'sRGB · 烤蓝散热鳍枪管 / 磷青铜布利什锁 / 亮钢枪机 / 50发圆鼓与黄铜弹',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'thompson_v3_metal_normal.webp',
        note: 'Linear · 散热环车纹 + 滚花拉机柄 + L型弹鼓冲压螺线与环形刻字',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'thompson_v3_metal_roughness.webp',
        note: 'Linear · R:内部机构AO / G:亮钢(0.18)-青铜(0.24)-烤蓝(0.28) / B:全金属分层',
      },
    ],
  },
];

export const THOMPSON_PLUGIN: WeaponRuntimePlugin = {
  id: THOMPSON_ID,
  partGroups: THOMPSON_PART_GROUPS,
  timelinePresets: THOMPSON_TIMELINE_PRESETS,
  parts: THOMPSON_PARTS,
  firingPhases: THOMPSON_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(THOMPSON_FIRING_PHASES, f),
  computeFiringKinematics: computeThompsonFiringKinematics,
  computeBallisticsState: computeThompsonBallisticsState,
  pbrBindings: THOMPSON_PBR_BINDINGS,
  pbrSuites: THOMPSON_PBR_SUITES,
};
