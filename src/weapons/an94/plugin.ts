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
  KeyframeStep,
  PartKinematicDelta,
  PbrBindingSpec,
  PbrSuiteItem,
  TimelinePresetItem,
  WeaponId,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';
import {
  AN94_BORE_Y,
  AN94_FLOORPLATE_WORLD_POS,
  AN94_FOLLOWER_WORLD_POS,
  AN94_GAS_Y,
  AN94_MAG_CANT_RX,
  AN94_MAG_ORIGIN,
} from './meshes/an94Geometries';

export const AN94_ID: WeaponId = 'an94';
export const AN94_CALIBER: CaliberProfile = '545_m74';

export const AN94_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '浮置钢制内机匣、钢索滑轮传动与回转枪机组',
    nameEn: 'Floating Inner Receiver, Pulley-Cable Transmission & Bolt Group',
    badgeColor: '#0ea5e9',
  },
  {
    key: 'frame',
    nameZh: '405mm浮置枪管、8字制退器与聚酰胺外机匣组',
    nameEn: '405mm Floating Barrel, Figure-8 Brake & Polyamide Chassis',
    badgeColor: '#7c3aed',
  },
  {
    key: 'fire_control',
    nameZh: '浮置双发点射火控、独立保险与三档快慢机组',
    nameEn: 'Hyperburst Hammer FCG, Thumb Safety & 3-Mode Selector',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '15°右倾30发5.45×39mm伊热夫斯克弹匣组',
    nameEn: '15° Right-Canted 30-Rd 5.45×39mm Izhmash Magazine',
    badgeColor: '#e11d48',
  },
];

export const AN94_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: '尼科诺夫 AN-94 “阿巴坎”（6П33）标准闭膛待击态：全长 943 mm，405 mm 浮置冷锻枪管连同标志性 8 字双室自清洁制退器蓄势待发，15° 右倾 5.45×39mm 弹匣清晰让出内部滑轮钢索预供弹通道。',
  },
  {
    id: 'field_strip',
    label: '俄军野战勤务快拆',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '标准俄军野战拆解：沿 15° 倾角卸下 5.45mm 弯弹匣，掀开冲压机匣盖，抽出伸缩复进簧导杆与枪机框，并完整露出隐藏在炭黑聚酰胺外壳内的浮置钢制内机匣滑轨架构。',
  },
  {
    id: 'pulley_strip',
    label: '滑轮钢索与浮置枪管细拆',
    subLabel: '65% Pulley & Floating Action',
    t: 0.65,
    desc: '深度揭秘“发条卡拉什尼科夫”核心黑科技：从浮置内机匣右侧展开精密 CNC 钢制滑轮、180° 绕包编织不锈钢传动钢索、青铜二级预供弹拨弹滑块以及下部浮置机匣缓冲簧。',
  },
  {
    id: 'full_exploded',
    label: '全枪 26 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 26 个精密机械节点零遮挡立体展开：从非对称 8 字口哨制退器、405 mm 浮置枪管、星轮五档觇孔照门、滑轮钢索预供弹系统、双突笋回转枪机到 15° 右倾李子黑 5.45mm 弹匣内件。',
  },
];

// Shared initial magazine cant-aligned drop (slides down & right +Z along 15° cant)
const AN94_MAG_STAGE1: KeyframeStep[] = [
  { range: [0.02, 0.24], offset: [3.5, -10.5, 2.5] },
];

export const AN94_PARTS: WeaponPartSpec[] = [
  // ==================== 1. FLOATING INNER RECEIVER, PULLEY-CABLE & BOLT GROUP ('slide' · 9 parts) ====================
  {
    id: 'an94_inner_receiver',
    bomCode: 'S-01',
    nameZh: '浮置数控钢制内机匣滑轨车架',
    calloutLabel: '浮置钢制内机匣',
    nameEn: 'Floating CNC Steel Barreled-Action Sub-Receiver Carriage',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.28, 0.62], offset: [0, 5.2, 0] },
      { range: [0.62, 1.0], offset: [0, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0.5, 2.75, 0],
    labelAppearAt: 0.28,
    roleTag: '整体延迟后坐滑架 · 携枪管在聚酰胺外壳内自由后滑 42 mm',
    description:
      '尼科诺夫延迟后坐（Blowback-Shifted Pulse）机制的结构核心：将 405 mm 冷锻枪管、导气管、旋转枪机以及滑轮钢索全部刚性集成在这一高强 CNC 钢制滑车上，发射 2 发 1,800 发/分极速点射期间整个机匣组件在炭黑聚酰胺外机匣导轨内自由后滑 42 mm，直至第 2 发弹头离膛后才触碰尾端缓冲，令射手仅感知到一次叠加后坐！',
  },
  {
    id: 'an94_bolt_carrier',
    bomCode: 'S-02',
    nameZh: '长行程导气活塞枪机框与拉机柄',
    calloutLabel: '活塞枪机框与拉机柄',
    nameEn: 'Long-Stroke Reciprocating Bolt Carrier & Charging Handle',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [1.5, AN94_BORE_Y, 0],
    explodeSteps: [
      { range: [0.14, 0.3], offset: [1.5, 9.8, 0] },
      { range: [0.62, 1.0], offset: [1.5, 2.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [5.5, 1.6, 0],
    labelAppearAt: 0.16,
    roleTag: '双级动力主动件 · 后坐牵引钢索驱动滑轮与旋转开锁',
    description:
      '既保留卡拉什尼科夫标志性的长行程硬铬导气活塞杆与右侧上翘拉机柄，又在后右颊铣有专用钢索驱动挂耳：击发后枪机框不仅在浮置内机匣内后坐 50 mm 完成 35.5° 螺旋开锁，更同时猛拽编织不锈钢钢索带动滑轮高速飞转！',
  },
  {
    id: 'an94_bolt',
    bomCode: 'S-03',
    nameZh: '精磨不锈钢双突笋回转闭锁枪机',
    calloutLabel: '双突笋回转枪机',
    nameEn: 'Brushed-Stainless 2-Lug Rotating Bolt Head',
    group: 'slide',
    material: 'stainless',
    assembledPos: [5.4, AN94_BORE_Y, 0],
    explodeSteps: [
      { range: [0.14, 0.3], offset: [1.5, 9.8, 0] },
      { range: [0.34, 0.65], offset: [19.5, -1.6, 0], rotation: [0.62, 0, 0] },
      { range: [0.65, 1.0], offset: [2.5, -0.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [1.2, 0.65, 0],
    labelAppearAt: 0.34,
    roleTag: '35.5° 同轴回转闭锁 · 承受 5.45×39mm 300 MPa 膛压',
    description:
      '前端对称布置双闭锁突笋、沉底弹膛镜面与强力右侧爪式抽壳钩；枪机框先行自由行程后由螺旋导槽强制旋转 35.5° 开锁，并在 1,800 RPM 高速复进循环中从二级预供弹托盘直接将第二发 5.45×39mm 7N6 尖头弹推入弹膛闭锁。',
  },
  {
    id: 'an94_firing_pin',
    bomCode: 'S-04',
    nameZh: '同轴浮动式不锈钢撞击击针',
    calloutLabel: '同轴浮动击针',
    nameEn: 'Coaxial Free-Floating Stainless Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [5.1, AN94_BORE_Y, 0],
    explodeSteps: [
      { range: [0.14, 0.3], offset: [1.5, 9.8, 0] },
      { range: [0.36, 0.68], offset: [20.5, 4.4, 0] },
      { range: [0.68, 1.0], offset: [2.5, 1.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 0.28, 0],
    labelAppearAt: 0.38,
    roleTag: '低惯性中心刺穿底火 · 物理闭锁不到位防走火',
    description:
      '贯穿双突笋旋转枪机中心通孔的高强度不锈钢阶梯击针：极轻的往复质量确保在每分钟 1,800 发（两发间隔仅 33 毫秒）的极限连发节拍下依然干脆利落地刺破俄制伯丹底火。',
  },
  {
    id: 'an94_pulley_wheel',
    bomCode: 'S-05',
    nameZh: 'CNC 精密 V 槽钢制传动滑轮',
    calloutLabel: '精密V槽传动滑轮',
    nameEn: 'CNC Machined Steel V-Groove Transmission Pulley Wheel',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-9.2, 0.55, 0.62],
    explodeSteps: [
      { range: [0.32, 0.65], offset: [-4.5, 4.5, 5.2] },
      { range: [0.65, 1.0], offset: [-1.5, 2.0, 2.0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [0, 1.05, 0.3],
    labelAppearAt: 0.32,
    roleTag: '“发条 AK”灵魂奇观 · 定滑轮变向增速传动核心',
    description:
      '令全世界轻武器工程师叹为观止的 AN-94 机械图腾——销装于浮置内机匣后右侧的 CNC 精密淬火钢 V 槽定滑轮，内置自润滑青铜轴套与 4 枚减重孔：枪机框向后高速抽拉钢索上股时，滑轮瞬间高速旋转 275°，将向后的后坐动量 180° 反向转化为推动二级预供弹滑块向前狂飙的机械动力！',
  },
  {
    id: 'an94_steel_cable',
    bomCode: 'S-06',
    nameZh: '180° 绕包编织不锈钢传动钢索',
    calloutLabel: '编织不锈钢传动钢索',
    nameEn: 'Braided Stainless-Steel Pulley Drive Cable Loop',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-9.2, 0.55, 0.62],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [0.5, 4.5, 9.2] },
      { range: [0.66, 1.0], offset: [1.5, 2.0, 3.2] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    calloutAnchor: [4.5, 0.9, 0.15],
    labelAppearAt: 0.36,
    roleTag: '多股高疲劳航空钢缆 · 串联枪机框与二级预供弹滑块',
    description:
      '绕行于传动滑轮 V 形槽内、两端压接黄铜强化套筒的高抗拉多股编织不锈钢传动钢索：上端锚定于枪机框尾耳，下端牵引二级预供弹拨弹滑块；在高达数万发的军用寿命期内无惧高温燃气与粉尘，将枪机后坐行程实时 1:1 反向传递给供弹机构。',
  },
  {
    id: 'an94_feed_rammer',
    bomCode: 'S-07',
    nameZh: '青铜二级预供弹拨弹滑块与斜置托弹盘',
    calloutLabel: '二级预供弹滑块托盘',
    nameEn: '2-Stage Bronze Pre-Feed Rammer Shuttle & Loading Tray',
    group: 'slide',
    material: 'copper_accent',
    assembledPos: [4.8, 0.35, 0.45],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [8.5, 4.8, 6.2] },
      { range: [0.66, 1.0], offset: [3.0, 2.0, 2.4] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [1.0, 0.6, 0],
    labelAppearAt: 0.36,
    roleTag: '1,800 RPM 供弹密钥 · 枪机后坐同时提前将第2发弹推上待发位',
    description:
      '解决常规弹匣托弹簧无法跟上 1,800 发/分（每发仅 33 ms）供弹物理极限的绝世巧思：当枪机框受燃气推动高速后坐时，滑轮钢索反向将这套青铜/镀铬二级预供弹滑块猛力向前拉出，预先从 15° 右倾弹匣中拨出第二发 5.45×39mm 实弹并平托于枪机轴线正下方，使复进枪机无需等待弹匣托弹即可瞬间完成高速进弹！',
  },
  {
    id: 'an94_recoil_guide',
    bomCode: 'S-08',
    nameZh: '双套管伸缩枪机复进导杆与尾缓冲座',
    calloutLabel: '伸缩复进导杆与缓冲座',
    nameEn: 'Telescoping Dual Recoil Guide Rod & Buffer Block',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-6.5, 2.35, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [-14.0, 9.2, 0] },
      { range: [0.64, 1.0], offset: [-4.5, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-1.5, 0.4, 0],
    labelAppearAt: 0.14,
    roleTag: '防高速屈曲双节导杆 · 锚定于浮置内机匣尾壁',
    description:
      '插装于浮置钢制内机匣后壁的伸缩式双套管不锈钢复进导杆与聚氨酯缓冲块：约束高速螺旋复进簧在 1,800 RPM 极速往复下绝不横向失稳屈曲，并随整个浮置内机匣一同在外壳内往复滑动。',
  },
  {
    id: 'an94_recoil_spring',
    bomCode: 'S-09',
    nameZh: '高劲度螺旋枪机主复进簧',
    calloutLabel: '螺旋枪机复进簧',
    nameEn: 'High-Rate Helical Bolt-Carrier Return Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-12.2, 2.35, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [-2.5, 13.5, 0] },
      { range: [0.64, 1.0], offset: [-1.5, 3.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [6.0, 0.45, 0],
    labelAppearAt: 0.16,
    roleTag: '驱动 1,800 RPM 极速复进 · 后端随浮置内机匣同步滑移',
    description:
      '套装于伸缩导杆上的琴钢丝高疲劳螺旋复进簧：击发瞬间在浮置内机匣内部被枪机框急剧压缩至 59% 自由长，随即以极高弹射速度驱动枪机前冲剥取预供弹盘上的第二发 5.45mm 枪弹，缔造双发同孔神迹。',
  },

  // ==================== 2. OUTER HOUSING, 405mm FLOATING BARREL, FIGURE-8 BRAKE & FURNITURE ('frame' · 9 parts) ====================
  {
    id: 'an94_outer_housing',
    bomCode: 'F-01',
    nameZh: '伊热夫斯克一体炭黑聚酰胺外机匣壳体',
    calloutLabel: '聚酰胺一体外机匣',
    nameEn: 'Izhmash Monocoque Glass-Filled Polyamide Outer Housing',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 56,
    calloutAnchor: [16.5, -0.9, 0],
    labelAppearAt: 0.0,
    roleTag: '全枪静止承力外壳 · 集成燕尾镜轨、实心护圈与 15° 弹匣井',
    description:
      '令 AN-94 拥有科幻流线外观的 35% 玻纤增强炭黑聚酰胺（ПА66-ГФ）整体外机匣壳体：全枪射击期间外壳在射手双手中保持纹丝不动，内部以精密硬化钢轨包裹整体后滑 42 mm 的浮置枪管/内机匣总成；左侧整合俄制燕尾瞄具导轨与「АН-94 «АБАКАН» · ИЖМАШ」铭印，前下集成实心闭环扳机护圈与向右偏转 15° 的弹匣井。',
  },
  {
    id: 'an94_dust_cover',
    bomCode: 'F-02',
    nameZh: '加强肋冲压黑烤漆钢制防尘顶盖',
    calloutLabel: '冲压钢防尘机匣盖',
    nameEn: 'Ribbed Stamped Black-Enamel Steel Top Dust Cover',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.06, 0.24], offset: [0, 17.5, 0] },
      { range: [0.64, 1.0], offset: [0, 4.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [-4.5, 4.12, 0],
    labelAppearAt: 0.0,
    roleTag: '封闭浮置导轨顶腔 · 右侧长抛壳与拉机柄让位窗',
    description:
      '严密扣合于炭黑聚酰胺外机匣顶部的磷化黑烤漆冲压钢防尘罩：左侧与顶部阻隔战地泥沙侵入精密滑轮钢索腔，右侧开有加长抛壳兼拉机柄往复滑槽，尾端预留弧口以完美托出标志性星轮五档觇孔照门。',
  },
  {
    id: 'an94_barrel',
    bomCode: 'F-03',
    nameZh: '405mm 浮置冷锻镀铬 5.45×39mm 枪管',
    calloutLabel: '405mm浮置冷锻枪管',
    nameEn: '405mm Floating Cold-Hammer-Forged Chrome-Lined Barrel',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [5.2, AN94_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [22.0, 0, 0] },
      { range: [0.66, 1.0], offset: [7.5, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [24.0, -0.85, 0],
    labelAppearAt: 0.0,
    roleTag: '整管随内机匣后坐 42 mm · 1:195mm 四右旋镀铬膛线',
    description:
      '全长 405 mm、内膛全镀硬铬的精密旋转冷精锻 5.45×39mm 枪管：后端刚性压装于浮置钢制内机匣前节套，前段从炭黑聚酰胺前护木隧道中完全自由浮置穿出，开火瞬间随整套内机匣同步向后长行程滑移 42 mm，赋予 7N6 轻尖弹 900 m/s 高初速与惊人的双发点射重合散布。',
  },
  {
    id: 'an94_gas_tube',
    bomCode: 'F-04',
    nameZh: '高压短导气筒与高护圈前准星座',
    calloutLabel: '上置导气筒与护圈准星',
    nameEn: 'Upper High-Pressure Gas Cylinder & Hooded Front Sight Tower',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [21.5, AN94_GAS_Y, 0],
    explodeSteps: [
      { range: [0.32, 0.64], offset: [7.5, 13.5, 0] },
      { range: [0.64, 1.0], offset: [2.5, 4.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [9.2, 3.3, 0],
    labelAppearAt: 0.0,
    roleTag: '随枪管整体往复后坐 · 高置环翼护罩夜间准星',
    description:
      '刚性联接于 405 mm 浮置枪管中前部导气箍上方的厚壁钢制高压导气筒与高耸环罩式准星座：射击时随枪管与内机匣同步向后滑动 42 mm，内部精确引导长行程镀铬活塞杆高速启动枪机循环。',
  },
  {
    id: 'an94_muzzle_brake',
    bomCode: 'F-05',
    nameZh: '尼科诺夫非对称 8 字双室自清洁口哨制退器',
    calloutLabel: '8字双室口哨制退器',
    nameEn: 'Asymmetrical Figure-8 Dual-Chamber Whistling Muzzle Brake',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [45.7, AN94_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [29.5, 0, 0] },
      { range: [0.66, 1.0], offset: [11.5, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [3.2, 1.5, 0],
    labelAppearAt: 0.0,
    roleTag: '全球独一无二 8 字轮廓 · 超音速涡流自清洁除碳与高频哨声',
    description:
      'AN-94 最具辨识度的外观图腾！根纳季·尼科诺夫专利设计的非对称上下偏心双圆柱（正面呈完美阿拉伯数字“8”轮廓）无死角膨胀制退补偿器：利用超音速高压燃气在上下双室形成对冲涡流，不仅高效削减后坐与枪口上跳、自动吹扫室内积碳实现免清刷自清洁，更会在 1,800 RPM 连发时发出震慑战场的独特金属呼啸哨声。',
  },
  {
    id: 'an94_buttstock',
    bomCode: 'F-06',
    nameZh: '伊热夫斯克右侧折叠加强肋聚酰胺枪托',
    calloutLabel: '右折加强肋聚酰胺托',
    nameEn: 'Izhmash Right-Folding Ribbed Polyamide Buttstock',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-16.8, 1.05, 0],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-7.5, 0, 0] },
      { range: [0.68, 1.0], offset: [-4.5, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-13.5, -4.2, 0],
    labelAppearAt: 0.0,
    roleTag: '避让左侧燕尾瞄轨向右折叠 · 折叠全长缩至 728 mm',
    description:
      '与传统 AK-74M 向左折叠不同，AN-94 的加强筋玻纤聚酰胺枪托巧妙改为向右侧（+Z）180° 折叠锁定，从而在安装俄制 PSO/1P29 侧轨光学瞄准镜时依然可以完整折托携行；直列高抵肩线配合深槽硫化橡胶底板平顺承接双发点射合冲量。',
  },
  {
    id: 'an94_pistol_grip',
    bomCode: 'F-07',
    nameZh: '人体工学菱格纹聚酰胺手枪握把',
    calloutLabel: '菱格纹聚酰胺握把',
    nameEn: 'Ergonomic Checkered Izhmash Polymer Pistol Grip',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-8.2, -1.35, 0],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-6.5, -7.2, 0] },
      { range: [0.68, 1.0], offset: [-3.5, -4.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [-2.2, -9.8, 0],
    labelAppearAt: 0.0,
    roleTag: '饱满掌心指槽支撑 · 防滑菱格模压皮纹',
    description:
      '伊热夫斯克军械厂为 AN-94 专门塑形的加宽倾角玻纤聚酰胺握把：顶部无缝贴合外机匣底台面，双侧模压细腻防滑菱格纹，在严寒戴防寒手套或单手控枪实施 1,800 RPM 高速点射时提供稳固握持支点。',
  },
  {
    id: 'an94_rear_sight',
    bomCode: 'F-08',
    nameZh: '五档旋转星轮式觇孔机械后照门 (2–7)',
    calloutLabel: '星轮五档觇孔照门',
    nameEn: '5-Position Rotary Star-Wheel Diopter Rear Sight',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-13.6, 4.1, 0],
    explodeSteps: [
      { range: [0.06, 0.24], offset: [0, 17.5, 0] },
      { range: [0.64, 1.0], offset: [-6.5, 7.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [0, 1.9, 0],
    labelAppearAt: 0.0,
    roleTag: '200–700m 五芒星轮快切 · 超长瞄准基线与护耳',
    description:
      '摒弃 AK 传统弧形表尺、改采欧洲化后置超长瞄准基线的尼科诺夫独门“五芒星轮”旋转觇孔照门：五枚放射状星齿分别对应 200 至 700 米射程孔径与夜间氚光瞄槽，拇指轻拨星轮即可盲操清脆换档。',
  },
  {
    id: 'an94_receiver_buffer_spring',
    bomCode: 'F-09',
    nameZh: '下置浮置机匣重型螺旋复进缓冲簧',
    calloutLabel: '浮置机匣下复进簧',
    nameEn: 'Lower Floating-Receiver Heavy Helical Return & Buffer Spring',
    group: 'frame',
    material: 'spring_steel',
    assembledPos: [-14.95, -0.92, 0],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [-20.0, -5.8, 0] },
      { range: [0.66, 1.0], offset: [-7.5, -2.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [3.9, -0.35, 0],
    labelAppearAt: 0.34,
    roleTag: '承接整组 405mm 枪管/内机匣 42 mm 后坐并柔顺复位',
    description:
      '安置于炭黑聚酰胺外机匣底部隧道内的粗丝重型螺旋缓冲主簧：后端锚固于静止外机匣尾壁，前端顶抵在浮置钢制内机匣底部凸耳上；两发 1,800 RPM 极速点射期间压缩至 70% 温柔吸收整体动量，发射完毕后再将枪管与内机匣平稳推回待发原点。',
  },

  // ==================== 3. HYPERBURST HAMMER FCG, THUMB SAFETY & 3-MODE SELECTOR ('fire_control' · 4 parts) ====================
  {
    id: 'an94_hammer',
    bomCode: 'FC-01',
    nameZh: '回转击锤与两发 1,800 RPM 点射棘轮组件',
    calloutLabel: '击锤与两发点射棘轮',
    nameEn: 'Pivoting Steel Hammer & 2-Round Hyperburst Ratchet',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-2.8, 0.25, 0],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [0.5, -5.8, 4.8] },
      { range: [0.68, 1.0], offset: [0.5, -2.8, 2.2] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, 1.65, 0],
    labelAppearAt: 0.38,
    roleTag: '机械双发计数器 · 自动在 1,800 RPM 后无缝降频至 600 RPM',
    description:
      '隐藏于浮置火控总成内的精密钢制回转击锤与青铜两发点射棘轮擒纵机构：在「2」档双发点射时仅放行两发极速连击便强制锁停；在「АВ」全自动档下，前两发同样以惊人的 1,800 发/分脱膛，第 3 发起自动切入 600 发/分平稳压制射速！',
  },
  {
    id: 'an94_trigger',
    bomCode: 'FC-02',
    nameZh: '弧形钢制扳机与浮置随动单发断连杆',
    calloutLabel: '弧形扳机与随动连杆',
    nameEn: 'Curved Steel Trigger & Floating-Action Disconnector Bar',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-2.4, -1.75, 0],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [0, -7.8, 0] },
      { range: [0.68, 1.0], offset: [0, -4.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -2.2, 0],
    labelAppearAt: 0.38,
    roleTag: '跨静止外壳-浮置内机匣联动 · 消除浮置滑移扳机打手',
    description:
      '居中悬置于外机匣实心闭环扳机护圈内的弧形发黑钢扳机与长行程随动传递拉杆：其巧妙的脱耦滑槽结构确保即使内部浮置机匣以极速向后狂飙 42 mm，射手食指扣压的扳机依然丝毫不随枪管震动打手。',
  },
  {
    id: 'an94_safety_switch',
    bomCode: 'FC-03',
    nameZh: '扳机上方独立双侧拇指手动保险钮 (ПР/ОГ)',
    calloutLabel: '独立双侧手动保险',
    nameEn: 'Dedicated Rear Thumb Safety Latch (Safe / Fire)',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-5.8, -0.95, 0],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-4.0, -4.5, -5.2] },
      { range: [0.68, 1.0], offset: [-2.0, -2.0, -2.5] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-0.4, 0, -2.1],
    labelAppearAt: 0.4,
    roleTag: '彻底解耦保险与射控 · 虎口上方无声横推锁止',
    description:
      'AN-94 打破传统 AK 右侧大拨片的一项标志性人机革新：将手动保险彻底从快慢机剥离，独立布置在握把虎口正前方与扳机护圈根部交界处，横推即可无声锁死扳机阻铁，避免接敌前拨动传统 AK 铁片发出金属脆响。',
  },
  {
    id: 'an94_fire_selector',
    bomCode: 'FC-04',
    nameZh: '后置左侧三档射控快慢机拨杆 (ОД / 2 / АВ)',
    calloutLabel: '三档射控快慢机(ОД/2/АВ)',
    nameEn: 'Rear-Left 3-Position Fire Selector (Semi / 2-Hyperburst / Auto)',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-12.2, 0.75, 0],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-6.0, 2.2, -5.8] },
      { range: [0.68, 1.0], offset: [-3.0, 1.0, -2.8] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0.8, 0.3, -2.1],
    labelAppearAt: 0.4,
    roleTag: '单发 ОД · 1,800 RPM 双发 2 · 变射速全自动 АВ',
    description:
      '位于机匣左后侧的独立旋转式三档射击模式选择器：清晰刻标单发「ОД」、标志性 1,800 发/分超高速双发点射「2」以及先快后稳的「АВ」全自动档位，使射手无需动保险即可提前预置作战模式。',
  },

  // ==================== 4. 15° RIGHT-CANTED 30-RD 5.45×39mm MAGAZINE ('magazine' · 4 parts) ====================
  {
    id: 'an94_mag_body',
    bomCode: 'M-01',
    nameZh: '15° 右倾 30 发 5.45×39mm 李子黑聚酰胺弹匣体',
    calloutLabel: '15°右倾5.45mm弹匣体',
    nameEn: '15° Right-Canted 30-Rd 5.45×39mm Plum-Black Polymer Mag',
    group: 'magazine',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [AN94_MAG_ORIGIN[0], AN94_MAG_ORIGIN[1], AN94_MAG_ORIGIN[2]],
    assembledRot: [AN94_MAG_CANT_RX, 0, 0],
    explodeSteps: [
      ...AN94_MAG_STAGE1,
      { range: [0.36, 0.66], offset: [0.5, -2.2, 0.8] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [4.2, -9.2, 1.4],
    labelAppearAt: 0.0,
    roleTag: '向右倾斜 15° 避让滑轮钢索 · 100% 通用 AK-74 标准弹匣',
    description:
      'AN-94 另一大一眼可辨的传奇基因：整具标准 30 发伊热夫斯克李子黑（Plum-Black）玻纤聚酰胺 5.45×39mm 弧形弹匣（100% 兼容 AK-74 制式弹匣及 60 发四排弹匣）刻意向右（+Z）倾斜 15° 插入机匣井，从而在机匣中轴下方为滑轮钢索与青铜二级预供弹拨弹轨腾出宝贵的并行通道！',
  },
  {
    id: 'an94_mag_follower',
    bomCode: 'M-02',
    nameZh: '高辨识安全橙防倾 5.45mm 双排托弹板',
    calloutLabel: '安全橙5.45防倾托弹板',
    nameEn: 'High-Visibility Safety-Orange Anti-Tilt 5.45mm Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [
      AN94_FOLLOWER_WORLD_POS[0],
      AN94_FOLLOWER_WORLD_POS[1],
      AN94_FOLLOWER_WORLD_POS[2],
    ],
    assembledRot: [AN94_MAG_CANT_RX, 0, 0],
    explodeSteps: [
      ...AN94_MAG_STAGE1,
      { range: [0.36, 0.68], offset: [11.5, 4.0, 3.2] },
      { range: [0.68, 1.0], offset: [5.5, 1.5, 1.6] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, 0.4, 0],
    labelAppearAt: 0.36,
    roleTag: '贴合 5.45×39mm 缓弧双排交错 · 高可视空仓识别',
    description:
      '贴合 5.45×39mm 弹匣优雅弧线成型的安全橙高自润滑聚甲醛防倾托弹板：前后加长稳定裙边彻底杜绝 15° 倾斜状态下的卡弹倾覆，为二级预供弹滑块稳定托举双排 30 发轻尖步枪弹。',
  },
  {
    id: 'an94_mag_spring',
    bomCode: 'M-03',
    nameZh: '弧形高弹力 5.45mm 矩形截面弹匣托弹簧',
    calloutLabel: '弧形5.45弹匣托弹簧',
    nameEn: 'Curved Rectangular 5.45×39mm Magazine Drive Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [AN94_MAG_ORIGIN[0], AN94_MAG_ORIGIN[1], AN94_MAG_ORIGIN[2]],
    assembledRot: [AN94_MAG_CANT_RX, 0, 0],
    explodeSteps: [
      ...AN94_MAG_STAGE1,
      { range: [0.36, 0.68], offset: [11.5, -5.5, 3.2] },
      { range: [0.68, 1.0], offset: [5.5, -2.5, 1.6] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [7.2, -15.4, 0],
    labelAppearAt: 0.38,
    roleTag: '沿 15° 斜弧恒压托举 30 发 5.45×39mm 实弹柱',
    description:
      '沿 5.45×39mm 弹匣弧线预热定型的磷化矩形截面高碳弹簧钢丝：即使弹匣以 15° 倾角高速向右倾斜安装，依旧以稳定均匀的托弹力持续向二级预供弹托盘补充弹药。',
  },
  {
    id: 'an94_mag_floorplate',
    bomCode: 'M-04',
    nameZh: '冲压黑烤漆钢制弹匣底盖与锁扣',
    calloutLabel: '冲压钢弹匣底盖',
    nameEn: 'Stamped Steel Magazine Floorplate & Retention Lock',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [
      AN94_FLOORPLATE_WORLD_POS[0],
      AN94_FLOORPLATE_WORLD_POS[1],
      AN94_FLOORPLATE_WORLD_POS[2],
    ],
    assembledRot: [AN94_MAG_CANT_RX, 0, 0],
    explodeSteps: [
      ...AN94_MAG_STAGE1,
      { range: [0.36, 0.68], offset: [2.5, -8.5, 2.2] },
      { range: [0.68, 1.0], offset: [1.5, -4.5, 1.0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [0, -0.4, 0],
    labelAppearAt: 0.36,
    roleTag: '封闭 30 发弹匣底口 · 按压中心钢扣免工具滑拆清沙',
    description:
      '伊热夫斯克军用级冲压黑烤漆钢制滑入式底板与中心弹扣：顶住矩形托弹簧底座，按压底心圆柱锁钮即可徒手滑出快速清理战地泥沙与冻雪。',
  },
];

// ============================================================================
// 7-Phase Nikonov AN-94 Blowback-Shifted Pulley-Cable 1,800 RPM Firing Cycle
// ============================================================================

export const AN94_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'an94_phase_1_trigger_hammer',
    stepNum: '01',
    shortLabel: '扣机释锤击发',
    title: '阶段 1 · 扣动随动扳机，击锤释能敲击同轴击针引燃 5.45×39mm 底火',
    range: [0.0, 0.1],
    description:
      '快慢机置于「2」（1,800 发/分两发极速点射）档位，食指扣动外机匣护圈内的弧形扳机，随动传递连杆释放回转击锤前旋，同轴浮动击针瞬间刺破弹膛内第一发 5.45×39mm 7N6 步枪弹底火。',
  },
  {
    id: 'an94_phase_2_ignition_float',
    stepNum: '02',
    shortLabel: '浮置整管后滑',
    title: '阶段 2 · 300 MPa 点火，405mm 枪管/内机匣整组开始在聚酰胺外壳内自由后滑',
    range: [0.1, 0.2],
    description:
      '发射药爆燃产生 300 MPa 峰值膛压，5.45mm 轻尖弹头加速穿越 405 mm 浮置冷锻枪管并于 f = 0.195 冲出 8 字双室口哨制退器（900 m/s）。与此同时，整套枪管、导气管、制退器与钢制内机匣已开始在静止炭黑外壳导轨上同步无阻力向后滑移——射手肩部此刻几乎感受不到任何后坐！',
  },
  {
    id: 'an94_phase_3_pulley_unlock',
    stepNum: '03',
    shortLabel: '导气旋锁转滑轮',
    title: '阶段 3 · 高压导气推框 35.5° 旋转开锁，编织钢索猛拽 V 槽滑轮飞转',
    range: [0.2, 0.34],
    description:
      '高压火药燃气经导气箍涌入上置气室冲击长行程镀铬活塞杆，驱动枪机框在正高速后滑的内机匣中以更高相对速度向后猛冲：走完自由行程泄压后，螺旋槽强制双突笋不锈钢枪机旋转 35.5°（0.62 rad）开锁，同时枪机框尾耳狠拽钢索上股令 CNC 传动滑轮高速狂转！',
  },
  {
    id: 'an94_phase_4_hyperburst_rammer',
    stepNum: '04',
    shortLabel: '2×预供弹与抛壳',
    title: '阶段 4 · 浮置机匣后滑 42 mm，滑轮钢索猛拉青铜二级预供弹滑块前冲备弹',
    range: [0.34, 0.54],
    description:
      '全枪最震撼的机械交响高潮：浮置枪管与钢制内机匣后滑至极限 -42 mm（压缩下置缓冲主簧至 70%），枪机框总行程达 -92 mm（压缩主复进簧至 59%）并于 f = 0.44 将 5.45mm 空弹壳向右抛出！同一毫秒，高速旋转 275° 的定滑轮通过钢索下股将青铜二级预供弹滑块反向猛拉前冲 +26 mm，提前从 15° 右倾弹匣将第 2 发实弹送至枪机正下方！',
  },
  {
    id: 'an94_phase_5_second_feed',
    stepNum: '05',
    shortLabel: '千八瞬推闭锁',
    title: '阶段 5 · 浮置机匣尚未触底之际，枪机 1,800 RPM 极速复进推第 2 发弹入膛闭锁',
    range: [0.54, 0.68],
    description:
      '趁浮置内机匣仍停留在外壳后段悬空滑行、后坐冲击尚未传抵射手抵肩的宝贵 33 毫秒窗口，高劲度主复进簧驱动枪机框与双突笋枪机高速前冲，直接从青铜二级预供弹盘上剥走早已就位的第 2 发 5.45×39mm 实弹推入弹膛并逆旋 35.5° 锁死，击锤在棘轮控制下即刻完成超高速第二击！',
  },
  {
    id: 'an94_phase_6_action_return',
    stepNum: '06',
    shortLabel: '浮置枪管整组复进',
    title: '阶段 6 · 下置重型缓冲簧推回 405mm 浮置枪管/内机匣整组 42 mm 归位',
    range: [0.68, 0.86],
    description:
      '当两发 1,800 RPM 极速点射弹头均已飞离 8 字制退器、浮置内机匣将合并后坐一次性传递至尾座后，下置重型螺旋缓冲簧释放储能，平稳推动整套 405 mm 枪管、导气管、8 字制退器与闭膛锁死的钢制内机匣向前滑动 42 mm 回到外机匣初始位置，青铜预供弹滑块同步退回待命。',
  },
  {
    id: 'an94_phase_7_lockup_reset',
    stepNum: '07',
    shortLabel: '双发棘轮复位待击',
    title: '阶段 7 · 两发点射棘轮截停交接，松开扳机完成零跳变待击闭环',
    range: [0.86, 1.0],
    description:
      '两发点射计数器精准锁定击锤阻止第三发击发；射手松开弧形扳机后，随动断连杆与棘轮平顺将击锤交回主阻铁，滑轮、钢索与两套螺旋弹簧全部归零静止，准备下一次双发同孔精准点射。',
  },
];

const AN94_FLOAT_STROKE = 4.2; // 42 mm authentic floating barreled-action recoil travel inside outer housing!
const AN94_CARRIER_REL_MAX = 5.0; // 50 mm relative bolt-carrier travel inside inner receiver -> -9.20 cm world!
const AN94_FREE_DWELL = 0.55; // 5.5 mm initial carrier free travel before helical bolt cam engagement
const AN94_CAM_STROKE = 0.75; // 7.5 mm helical cam rotation stroke
const AN94_UNLOCK_RAD = 0.62; // ~35.5° 2-lug rotating bolt unlock (>= 0.50 rad)

interface An94CoupledActionSample {
  /** World X translation of entire floating barreled action (`0 -> -4.20 cm`) */
  innerDX: number;
  /** Relative carrier rearward stroke inside inner receiver (`0 -> 5.00 cm`) */
  relCarrierS: number;
  /** World X translation of bolt carrier (`0 -> -9.20 cm`) */
  carrierDX: number;
  /** World X translation of 2-lug rotating bolt (`0 -> -8.45 cm`) */
  boltDX: number;
  /** Coaxial roll rotation of 2-lug bolt (`0 -> +0.62 rad`) */
  boltRX: number;
  /** Rapid pulley spin angle around Z (`0 -> +4.80 rad`) */
  pulleyRZ: number;
  /** World X translation of bronze pre-feed rammer shuttle (`0 -> +2.60 cm` forward lunge!) */
  rammerDX: number;
}

/**
 * Exact coupled Nikonov AN-94 Blowback-Shifted Pulley-Cable kinematics across `f ∈ [0, 1]`:
 *  - Floating barreled action (`an94_inner_receiver`, `an94_barrel`, `an94_gas_tube`, `an94_muzzle_brake`)
 *    glides smoothly `-4.20 cm` rearward inside stationary `an94_outer_housing` across `[0.11, 0.42]`,
 *    holds rearward during the 1,800 RPM 2nd-round feed `[0.42, 0.68]`, and returns forward `[0.68, 0.88]`.
 *  - Inside `an94_inner_receiver`, `an94_bolt_carrier` strokes `-5.00 cm` relative (`-9.20 cm` world),
 *    rotating `an94_bolt` by `+0.62 rad` (35.5°), spinning `an94_pulley_wheel` `+4.80 rad` (~275°),
 *    and driving `an94_feed_rammer` `+6.80 cm` relative (`+2.60 cm` net world forward lunge!).
 */
function sampleAn94CoupledAction(f: number): An94CoupledActionSample {
  // 1. Entire floating barreled action recoil (`0 -> 1 -> 0`)
  const innerFloat01 = Math.max(0, seg(f, 0.11, 0.42) - seg(f, 0.68, 0.88));
  const innerDX = -AN94_FLOAT_STROKE * innerFloat01;

  // 2. Bolt-carrier relative stroke inside floating inner receiver (`0 -> 5.00 cm -> 0`)
  let s = 0;
  if (f >= 0.2 && f < 0.25) {
    s = AN94_FREE_DWELL * seg(f, 0.2, 0.25);
  } else if (f >= 0.25 && f < 0.34) {
    s = AN94_FREE_DWELL + AN94_CAM_STROKE * seg(f, 0.25, 0.34);
  } else if (f >= 0.34 && f < 0.48) {
    s =
      AN94_FREE_DWELL +
      AN94_CAM_STROKE +
      (AN94_CARRIER_REL_MAX - (AN94_FREE_DWELL + AN94_CAM_STROKE)) *
        seg(f, 0.34, 0.48);
  } else if (f >= 0.48 && f < 0.53) {
    s = AN94_CARRIER_REL_MAX;
  } else if (f >= 0.53 && f < 0.62) {
    s =
      AN94_CARRIER_REL_MAX -
      (AN94_CARRIER_REL_MAX - (AN94_FREE_DWELL + AN94_CAM_STROKE)) *
        seg(f, 0.53, 0.62);
  } else if (f >= 0.62 && f < 0.66) {
    s = AN94_FREE_DWELL + AN94_CAM_STROKE * (1.0 - seg(f, 0.62, 0.66));
  } else if (f >= 0.66 && f < 0.69) {
    s = AN94_FREE_DWELL * (1.0 - seg(f, 0.66, 0.69));
  }

  const carrierDX = innerDX - s;

  // 3. Coupled 2-lug rotating bolt head (locked during free dwell, 35.5° cam unlock, 1:1 recoil)
  let relBoltDX = 0;
  let boltRX = 0;
  if (s > AN94_FREE_DWELL + 1e-7) {
    if (s <= AN94_FREE_DWELL + AN94_CAM_STROKE) {
      const camU = smoothstep01((s - AN94_FREE_DWELL) / AN94_CAM_STROKE);
      relBoltDX = -0.15 * camU;
      boltRX = AN94_UNLOCK_RAD * camU;
    } else {
      relBoltDX = -0.15 - (s - (AN94_FREE_DWELL + AN94_CAM_STROKE));
      boltRX = AN94_UNLOCK_RAD;
    }
  }
  const boltDX = innerDX + relBoltDX;

  // 4. Grooved CNC transmission pulley wheel spin (`0 -> +4.80 rad`)
  const pulleyRZ = s * 0.96;

  // 5. 2-Stage bronze pre-feed rammer forward lunge (+6.80 cm relative -> +2.60 cm net world forward!)
  const rammerLunge01 = Math.max(0, seg(f, 0.24, 0.48) - seg(f, 0.64, 0.85));
  const rammerDX = innerDX + 6.8 * rammerLunge01;

  return {
    innerDX,
    relCarrierS: s,
    carrierDX,
    boltDX,
    boltRX,
    pulleyRZ,
    rammerDX,
  };
}

export function computeAn94FiringKinematics(
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

  const act = sampleAn94CoupledAction(f);

  switch (partId) {
    // Entire floating barreled action slides rigidly -4.20 cm inside stationary an94_outer_housing!
    case 'an94_inner_receiver':
    case 'an94_barrel':
    case 'an94_gas_tube':
    case 'an94_muzzle_brake':
    case 'an94_recoil_guide': {
      dx = act.innerDX;
      break;
    }

    case 'an94_pulley_wheel': {
      dx = act.innerDX;
      rz = act.pulleyRZ;
      break;
    }

    case 'an94_steel_cable': {
      dx = act.innerDX;
      break;
    }

    case 'an94_feed_rammer': {
      // Driven forward by the steel cable around the pulley at 1.36× carrier velocity (+2.60 cm net world lunge!)
      dx = act.rammerDX;
      break;
    }

    case 'an94_bolt_carrier': {
      dx = act.carrierDX;
      break;
    }

    case 'an94_bolt': {
      dx = act.boltDX;
      rx = act.boltRX;
      break;
    }

    case 'an94_firing_pin': {
      // Strikes forward +0.36 cm on Round 1 [0.065, 0.11] and rapid 2nd-round hyperburst tap [0.66, 0.70]
      const strike1 = seg(f, 0.065, 0.1) - seg(f, 0.13, 0.19);
      const strike2 = seg(f, 0.655, 0.68) - seg(f, 0.695, 0.74);
      dx = act.boltDX + 0.36 * Math.max(0, strike1 + 0.85 * strike2);
      break;
    }

    case 'an94_recoil_spring': {
      // Dynamic CSG Spring #1 (local X ∈ [0, 12.2], anchor=0 at rear of floating inner receiver):
      // Rear follows innerDX; front compresses with relCarrierS (0 -> 5.00 cm -> scaleX 1.000 -> 0.590)!
      const L0 = 12.2;
      dx = act.innerDX;
      scaleX = (L0 - act.relCarrierS) / L0;
      break;
    }

    case 'an94_receiver_buffer_spring': {
      // Dynamic CSG Spring #2 (local X ∈ [0, 7.8], anchor=0 pinned flush against rear trunnion wall at X=-15.0):
      // Compresses cleanly with floating barreled action (-4.20 cm -> scaleX 1.000 -> 0.462), staying flush with ir_lug!
      const L0 = 7.8;
      scaleX = (L0 + act.innerDX) / L0;
      break;
    }

    case 'an94_hammer': {
      // Pivots forward to strike firing pin on Round 1 [0.04, 0.09], recocked by carrier [0.31, 0.43],
      // executes 1,800 RPM 2nd-round hyperburst flutter [0.65, 0.72] and resets onto primary sear [0.89, 0.95]!
      const strike1 = seg(f, 0.04, 0.09);
      const recock1 = seg(f, 0.31, 0.43);
      const tap2 = Math.sin(linearSeg(f, 0.65, 0.73) * Math.PI);
      const reset = seg(f, 0.89, 0.95);
      rz = -1.35 * strike1 + 1.42 * recock1 - 0.85 * tap2 - 0.07 * reset;
      break;
    }

    case 'an94_trigger': {
      const pull = seg(f, 0.0, 0.08) - seg(f, 0.88, 0.95);
      rz = -0.24 * pull;
      break;
    }

    case 'an94_mag_follower': {
      // Subtle feed lift along the 15°-canted 5.45mm banana curve tangent
      const pulse = seg(f, 0.48, 0.62) - seg(f, 0.66, 0.8);
      dx = -0.24 * pulse;
      dy = 0.25 * pulse;
      dz = -0.07 * pulse;
      break;
    }

    default:
      break;
  }

  const snap0 = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  return {
    pos: [snap0(dx), snap0(dy), snap0(dz)],
    rot: [snap0(rx), ry, snap0(rz)],
    scaleX: Math.abs(scaleX - 1) < 1e-9 ? 1 : scaleX,
  };
}

/**
 * Computes `5.45×39mm 7N6` (300 MPa, 900 m/s) internal & external ballistics for Nikonov AN-94:
 *  - Ignition at chamber `X = +8.60, Y = +1.65`, passes gas port `X = +30.7` at `f = 0.165`,
 *    exits figure-8 whistling muzzle brake `X = +51.3` at `f = 0.195`.
 *  - Spent steel 5.45mm case extracts with `boltDX` and ejects right-upward (`+Z`) at `f = 0.44`.
 *  - Next 5.45mm cartridge is pre-staged from 15°-canted magazine throat onto `an94_feed_rammer`
 *    and stripped straight into the recoiling chamber during the 1,800 RPM hyperburst window!
 */
export function computeAn94BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const act = sampleAn94CoupledAction(f);

  // 1. 5.45×39mm 7N6 Spitzer Projectile along bore Y = +1.65 (ignition f=0.105, muzzle exit f=0.195)
  const bulletVisible = f < 0.42;
  let bulletX = 8.6;
  let streakLength = 0;

  if (f >= 0.105 && f < 0.195) {
    const u = Math.pow(linearSeg(f, 0.105, 0.195), 1.38);
    bulletX = 8.6 + (51.3 + act.innerDX - 8.6) * u;
    streakLength = 5.4 * u;
  } else if (f >= 0.195 && f < 0.42) {
    const u = linearSeg(f, 0.195, 0.42);
    const exitX = 51.3 + sampleAn94CoupledAction(0.195).innerDX;
    bulletX = exitX + 68.0 * u;
    streakLength = 11.2 * (1 - u * 0.45);
  }

  // 2. Spent 5.45×39mm Lacquered Steel Case — Extracts with boltDX, ejects +Z at f = 0.44
  const spentCaseVisible = f < 0.78;
  let caseX = 7.45 + act.innerDX;
  let caseY = AN94_BORE_Y;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.25 && f < 0.44) {
    caseX = 7.45 + act.boltDX;
  } else if (f >= 0.44 && f < 0.78) {
    const u = linearSeg(f, 0.44, 0.78);
    const xAtEject = 7.45 + sampleAn94CoupledAction(0.44).boltDX;
    caseX = xAtEject + 3.4 * u;
    caseY = AN94_BORE_Y + 8.4 * u - 11.2 * u * u;
    caseZ = 14.5 * u;
    caseRX = u * 9.8;
    caseRY = -u * 13.5;
    caseRZ = -u * 10.6;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.78);
    }
  }

  // 3. Chamber Flash, Moving Gas-Block Tap Flash & Figure-8 Whistling Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.1 && f <= 0.19) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.1, 0.19) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.16 && f <= 0.26) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.16, 0.26) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.19 && f <= 0.29) {
    const u = linearSeg(f, 0.19, 0.29);
    muzzlePlumeScale = 0.48 + 1.52 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.86;
  }

  // 4. Next 5.45mm Cartridge: 15°-canted mag lips [7.6, -0.05, 0.12] -> pre-feed rammer tray -> chamber [7.45 + innerDX, 1.65, 0]
  let nextX = 7.6;
  let nextY = -0.05;
  let nextZ = 0.12;
  let nextRZ = 0.15;

  if (f >= 0.36 && f < 0.52) {
    // Pulley-cable pre-feed shuttle lifts & stages 2nd round onto central loading tray!
    const u = seg(f, 0.36, 0.52);
    nextX = 7.6 + (5.2 - 7.6) * u;
    nextY = -0.05 + (0.72 - -0.05) * u;
    nextZ = 0.12 * (1 - u);
    nextRZ = 0.15 + 0.06 * u;
  } else if (f >= 0.52 && f < 0.68) {
    // 1,800 RPM bolt return strips staged 2nd round straight into recoiling chamber!
    const u = seg(f, 0.52, 0.68);
    const targetChamberX = 7.45 + act.innerDX;
    nextX = 5.2 + (targetChamberX - 5.2) * u;
    nextY = 0.72 + (AN94_BORE_Y - 0.72) * u;
    nextZ = 0;
    nextRZ = 0.21 * (1 - u);
  } else if (f >= 0.68) {
    // Rides smoothly forward inside the returning floating barrel chamber back to battery!
    nextX = 7.45 + act.innerDX;
    nextY = AN94_BORE_Y;
    nextZ = 0;
    nextRZ = 0;
  }

  // 5. Reserve 5.45mm Cartridge advancing up 15°-right-canted magazine stack
  const magShift = seg(f, 0.44, 0.66);
  const resX = 7.75 + (7.6 - 7.75) * magShift;
  const resY = -1.15 + (-0.05 - -1.15) * magShift;
  const resZ = 0.42 + (0.12 - 0.42) * magShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, AN94_BORE_Y, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [30.7 + act.innerDX, AN94_GAS_Y, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, resZ],
  };
}

// ============================================================================
// 3 × 2K 5-Channel Packed ORM WebP Texture Suites (Blender 5.2 Cycles GPU)
// ============================================================================

export const AN94_V3_RECEIVER_STOCK_PBR: PbrBindingSpec = {
  albedoFile: 'an94_v3_receiver_stock_albedo.webp',
  normalFile: 'an94_v3_receiver_stock_normal.webp',
  roughnessFile: 'an94_v3_receiver_stock_roughness.webp',
  normalScale: 0.9,
};

export const AN94_V3_PULLEY_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'an94_v3_pulley_metal_albedo.webp',
  normalFile: 'an94_v3_pulley_metal_normal.webp',
  roughnessFile: 'an94_v3_pulley_metal_roughness.webp',
  normalScale: 0.85,
};

export const AN94_V3_BARREL_MAG_PBR: PbrBindingSpec = {
  albedoFile: 'an94_v3_barrel_mag_albedo.webp',
  normalFile: 'an94_v3_barrel_mag_normal.webp',
  roughnessFile: 'an94_v3_barrel_mag_roughness.webp',
  normalScale: 0.88,
};

export const AN94_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  // Suite 1: Outer Polyamide Monocoque Housing, Dust Cover, Right-Folding Stock, Grip, Star-Wheel Sight & Controls (7 parts)
  an94_outer_housing: AN94_V3_RECEIVER_STOCK_PBR,
  an94_dust_cover: AN94_V3_RECEIVER_STOCK_PBR,
  an94_buttstock: AN94_V3_RECEIVER_STOCK_PBR,
  an94_pistol_grip: AN94_V3_RECEIVER_STOCK_PBR,
  an94_rear_sight: AN94_V3_RECEIVER_STOCK_PBR,
  an94_safety_switch: AN94_V3_RECEIVER_STOCK_PBR,
  an94_fire_selector: AN94_V3_RECEIVER_STOCK_PBR,

  // Suite 2: Floating Inner Steel Sub-Receiver, Pulley-Cable Heart, Pre-Feed Rammer, BCG, Bolt & FCG (10 parts)
  an94_inner_receiver: AN94_V3_PULLEY_METAL_PBR,
  an94_pulley_wheel: AN94_V3_PULLEY_METAL_PBR,
  an94_steel_cable: AN94_V3_PULLEY_METAL_PBR,
  an94_feed_rammer: AN94_V3_PULLEY_METAL_PBR,
  an94_bolt_carrier: AN94_V3_PULLEY_METAL_PBR,
  an94_bolt: AN94_V3_PULLEY_METAL_PBR,
  an94_firing_pin: AN94_V3_PULLEY_METAL_PBR,
  an94_hammer: AN94_V3_PULLEY_METAL_PBR,
  an94_trigger: AN94_V3_PULLEY_METAL_PBR,
  an94_recoil_guide: AN94_V3_PULLEY_METAL_PBR,

  // Suite 3: 405mm Floating CHF Barrel, Gas Tube/FSB, Figure-8 Whistling Brake & 15° Canted 5.45mm Magazine (7 parts)
  an94_barrel: AN94_V3_BARREL_MAG_PBR,
  an94_gas_tube: AN94_V3_BARREL_MAG_PBR,
  an94_muzzle_brake: AN94_V3_BARREL_MAG_PBR,
  an94_mag_body: AN94_V3_BARREL_MAG_PBR,
  an94_mag_follower: AN94_V3_BARREL_MAG_PBR,
  an94_mag_spring: AN94_V3_BARREL_MAG_PBR,
  an94_mag_floorplate: AN94_V3_BARREL_MAG_PBR,
};

export const AN94_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'an94_v3_receiver_stock',
    weapon: AN94_ID,
    titleCn: '伊热夫斯克炭黑聚酰胺外机匣、星轮照门与右折枪托贴图组 (V3)',
    partTag: 'F-01 / F-02 / F-06 / F-08 RECEIVER & STOCK',
    resolution: '2048 × 2048 px',
    summary:
      '基于 Blender 5.2 Cycles GPU 烘焙的 AN-94 外部壳体 2K 5 通道 Packed ORM 贴图套件：精确还原伊热夫斯克军械厂 35% 玻纤增强炭黑聚酰胺哑光微粒皮纹（sRGB 0.17–0.22, M=0.0, R=0.60），左侧高分辨率无畸变 Hero UV 翼面精刻伊热夫斯克箭羽三角厂徽、西里尔铭文「АН-94 «АБАКАН» · 5,45×39 · ИЖМАШ · № 940218」、ГИС 试枪章及红白「ПР / ОД / 2 / АВ」射控标识，右侧刻画「6П33 · 1997 · СДЕЛАНО В РОССИИ」与抛壳窗黄铜擦痕。',
    highlights: [
      '左侧 Hero 翼面伊热夫斯克箭羽厂徽与「АН-94 «АБАКАН» · 5,45×39 · № 940218」铭印',
      '鲜明红白「ПР / ОД / 2 / АВ」独立保险与三档快慢机填漆与握把菱格防滑皮纹',
      '五档旋转星轮觇孔照门钢质棱边露白、右折加强肋枪托与硫化橡胶肩垫物理粗糙度分离',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'an94_v3_receiver_stock_albedo.webp',
        note: 'sRGB · 炭黑玻纤聚酰胺外机匣 / 伊热夫斯克西里尔白字铭文 / 红白射控点标',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'an94_v3_receiver_stock_normal.webp',
        note: 'Linear · Cycles 高模倒角法线 + RNM 铭文凹刻 + 握把菱格皮纹与护木散热筋',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'an94_v3_receiver_stock_roughness.webp',
        note: 'Linear · R:Cycles 接触阴影AO / G:烤漆钢盖(0.28)-聚酰胺外壳(0.62)-橡胶托底(0.84) / B:金属度',
      },
    ],
  },
  {
    id: 'an94_v3_pulley_metal',
    weapon: AN94_ID,
    titleCn: '浮置钢制内机匣、CNC 钢索滑轮与二级预供弹滑块贴图组 (V3)',
    partTag: 'S-01 / S-05 / S-06 / S-07 PULLEY-CABLE HEART',
    resolution: '2048 × 2048 px',
    summary:
      '专为“发条卡拉什尼科夫”核心延迟后坐机械心脏定制的 2K 5 通道 ORM 贴图组：突出展示浮置 CNC 磷化钢内机匣的高频滑轨亮带磨损、镜面拉丝钢制 V 槽传动滑轮与青铜轴套、多股高反光编织不锈钢传动钢索与黄铜压接套筒、青铜/镀铬二级预供弹拨弹滑块，以及双突笋不锈钢旋转枪机与击锤棘轮细节。',
    highlights: [
      'CNC 精密 V 槽钢制滑轮、青铜自润滑轴套与多股编织不锈钢传动钢索高光材质对比',
      '青铜二级预供弹拨弹滑块与不锈钢双突笋旋转枪机各向异性 CNC 刀痕微法线',
      '浮置钢制内机匣 42 mm 高速往复导轨亮银摩擦带与击锤两发点射棘轮细节',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'an94_v3_pulley_metal_albedo.webp',
        note: 'sRGB · 磷化钢内机匣 / 亮钢滑轮与编织钢索 / 青铜预供弹滑块与不锈钢枪机',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'an94_v3_pulley_metal_normal.webp',
        note: 'Linear · 车削环形刀纹 + 钢索螺旋绞股法线 + 滑轨纵向拉丝凹凸',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'an94_v3_pulley_metal_roughness.webp',
        note: 'Linear · R:机械腔内自阴影AO / G:亮铬钢索(0.16)-青铜滑块(0.24)-磷化内匣(0.32) / B:高金属度',
      },
    ],
  },
  {
    id: 'an94_v3_barrel_mag',
    weapon: AN94_ID,
    titleCn: '405mm 浮置枪管、8 字口哨制退器与 15° 右倾李子黑弹匣贴图组 (V3)',
    partTag: 'F-03 / F-05 / M-01 BARREL, FIGURE-8 BRAKE & 15° MAG',
    resolution: '2048 × 2048 px',
    summary:
      '刻画 AN-94 两大视觉图腾的 2K 5 通道 ORM 贴图套件：前半域呈现 405 mm 浮置冷锻镀铬枪管、高压导气筒与标志性非对称 8 字双室自清洁口哨制退器（含真实高温金褐/钢蓝回火色渐变与膛口火药积碳）；后半域为 15° 右倾 30 发伊热夫斯克李子黑（Plum-Black）5.45×39mm 弹匣双侧 Hero 展板（含「5,45×39 · ИЖМАШ」模压铭印）与独立 `>=50 px` 防火墙隔离的安全橙防倾托弹板。',
    highlights: [
      '非对称 8 字双室口哨制退器高温金褐/钢蓝回火渐变与室内真实火药积碳层',
      '15° 右倾伊热夫斯克李子黑（Plum-Black）5.45×39mm 聚合物弹匣与厂徽模印',
      '严格 >=50 px UV 防火墙隔离的高辨识安全橙防倾托弹板（零色渗）',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'an94_v3_barrel_mag_albedo.webp',
        note: 'sRGB · 8字制退器热回火积碳 / 405mm枪管 / 李子黑 5.45 弹匣与安全橙托弹板',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'an94_v3_barrel_mag_normal.webp',
        note: 'Linear · 枪管车削环纹 + 8字涡流室倒角 + 弹匣模压铭文与钢底板凹凸',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'an94_v3_barrel_mag_roughness.webp',
        note: 'Linear · R:接触阴影AO / G:烤蓝枪管(0.28)-积碳膛口(0.84)-李子黑弹匣(0.56) / B:金属度分离',
      },
    ],
  },
];

export const AN94_PLUGIN: WeaponRuntimePlugin = {
  id: AN94_ID,
  partGroups: AN94_PART_GROUPS,
  timelinePresets: AN94_TIMELINE_PRESETS,
  parts: AN94_PARTS,
  firingPhases: AN94_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(AN94_FIRING_PHASES, f),
  computeFiringKinematics: computeAn94FiringKinematics,
  computeBallisticsState: computeAn94BallisticsState,
  pbrBindings: AN94_PBR_BINDINGS,
  pbrSuites: AN94_PBR_SUITES,
};
