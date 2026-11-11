import * as THREE from 'three';
import { G17PartSpec, GroupMeta, KeyframeStep } from '../g17PartsSpec';
import { FiringPhaseInfo, PartKinematicDelta } from '../firingCycleSpec';
import { ExtendedBallisticsState } from '../ak15FiringSpec';
import type {
  CaliberProfile,
  TimelinePresetItem,
  WeaponCameraMap,
  WeaponWorkbenchMeta,
} from '../weaponRegistry';
import {
  buildScarBarrelCrossboltsGeometry,
  buildScarBarrelGeometry,
  buildScarBoltCarrierGeometry,
  buildScarBoltGeometry,
  buildScarChargingHandleGeometry,
  buildScarFiringPinGeometry,
  buildScarFlashSuppressorGeometry,
  buildScarGasBlockGeometry,
  buildScarGasPistonGeometry,
  buildScarRearSightGeometry,
  buildScarRecoilRodGeometry,
  buildScarRecoilSpringGeometry,
  buildScarUpperReceiverGeometry,
} from '../../geometry/weapons/scarGeometries';
import {
  buildScarButtpadGeometry,
  buildScarButtstockGeometry,
  buildScarCheekRiserGeometry,
  buildScarDisconnectorGeometry,
  buildScarHammerGeometry,
  buildScarLowerReceiverGeometry,
  buildScarMagBodyGeometry,
  buildScarMagFloorplateGeometry,
  buildScarMagFollowerGeometry,
  buildScarMagSpringGeometry,
  buildScarPistolGripGeometry,
  buildScarSelectorGeometry,
  buildScarTriggerGeometry,
} from '../../geometry/weapons/scarExtraGeometries';

export const SCAR_PART_GROUPS: GroupMeta[] = [
  {
    key: 'slide',
    nameZh: '一体铝挤上机匣、短行程活塞与枪机组',
    nameEn: 'Monolithic FDE Upper, Short-Stroke Piston & BCG',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: '快拆枪管、聚合物下机匣与靴形折叠托组',
    nameEn: 'Quick-Change CHF Barrel, Polymer Lower & Ugg-Boot Stock',
    badgeColor: '#7c3aed',
  },
  {
    key: 'fire_control',
    nameZh: '回转击锤火控与 S-1-A 双侧快慢机组',
    nameEn: 'Rotary Hammer FCG & Ambi S-1-A Selector',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '30发 5.56mm FDE 沙色 STANAG 弹匣组',
    nameEn: '30-Rd FDE STANAG Magazine w/ Ranger Plate',
    badgeColor: '#e11d48',
  },
];

export const SCAR_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '合拢态',
    subLabel: '0%',
    t: 0.0,
    desc: 'FN SCAR-L Mk 16 Mod 0 全枪闭合状态，展现标志性比利时“五十度沙色 (50 Shades of FDE)”阳极氧化与工程塑料色差',
  },
  {
    id: 'field_strip',
    label: '野战一级快拆',
    subLabel: '30%',
    t: 0.3,
    desc: '美军特种部队标准野战分解：卸下 STANAG 弹匣、滑下靴形枪托组件与尾板复进簧杆、拔出拉机柄并抽出重型矩形枪机框',
  },
  {
    id: 'upper_mag_strip',
    label: '活塞/枪机/弹匣细拆',
    subLabel: '65%',
    t: 0.65,
    desc: '旋出导气箍调节器抽出不锈钢短行程导气活塞顶杆、分解七突笋回转枪机与长击针，并拆解带快拔拉环的 FDE 弹匣',
  },
  {
    id: 'full_explode',
    label: '全枪 26 节点爆炸图',
    subLabel: '100%',
    t: 1.0,
    desc: '松开六枚星形横栓抽出 14 英寸冷锻快拆枪管与三叉消焰器，全面展开靴形伸缩枪托、可调贴腮板与双侧火控组',
  },
] as const;

// Shared stage-1 bolt carrier rearward field-strip extraction
const SCAR_BCG_STAGE1: KeyframeStep[] = [
  { range: [0.16, 0.24], offset: [-9.2, 0.2, 0] },
  { range: [0.24, 0.3], offset: [-1.2, 4.6, 0] },
];

// Shared stage-1 vertical STANAG magazine drop
const SCAR_MAG_STAGE1: KeyframeStep[] = [
  { range: [0.02, 0.1], offset: [0.3, -5.2, 0] },
];

export const SCAR_PARTS: G17PartSpec[] = [
  // ==================== 1. MONOLITHIC UPPER, PISTON & BCG ('slide' · 10 parts) ====================
  {
    id: 'scar_upper_receiver',
    bomCode: 'U-01',
    nameZh: '一体挤压成型香槟沙色铝上机匣',
    calloutLabel: '一体铝挤FDE上机匣',
    nameEn: 'Monolithic Extruded Aluminum FDE Upper Receiver',
    group: 'slide',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.22, 0.3], offset: [0, 4.8, 0] },
      { range: [0.66, 0.88], offset: [0.6, 3.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [3.2, 3.12, 0],
    labelAppearAt: 0.0,
    roleTag: '全通一体皮卡汀尼导轨 / 全枪高精度刚性梁',
    description:
      'FN SCAR 最具辨识度的核心工程设计：由高强度航空铝合金一体挤压并经硬质阳极氧化呈金属香槟沙色（#a78b62），顶部集成无间断全通 MIL-STD-1913 导轨，前段一体铣出侧/底导轨与双排椭圆散热窗。',
  },
  {
    id: 'scar_rear_sight',
    bomCode: 'U-02',
    nameZh: '折叠式双觇孔机械后照门',
    calloutLabel: '折叠双觇孔后照门',
    nameEn: 'Folding Dual-Aperture Diopter Rear Sight',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-5.15, 3.12, 0],
    explodeSteps: [
      { range: [0.22, 0.3], offset: [0, 4.8, 0] },
      { range: [0.66, 0.9], offset: [-2.4, 6.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 36,
    calloutAnchor: [-0.18, 0.72, 0],
    labelAppearAt: 0.0,
    roleTag: '高低风偏微调 / 使用光学镜时向后平折收纳',
    description:
      '锁固于一体上机匣尾端导轨槽的精密可折叠觇孔照门，配有带刻度锁止鼓轮的风偏/射程调节机构；加装高倍率瞄准镜或全息镜时可一键放倒平贴导轨。',
  },
  {
    id: 'scar_gas_block',
    bomCode: 'U-03',
    nameZh: '导气箍兼折叠护圈准星座与两档调节塞',
    calloutLabel: '导气箍与折叠准星',
    nameEn: 'Gas Block w/ Folding Hooded Front Sight & 2-Pos Regulator',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [14.7, 1.05, 0],
    explodeSteps: [
      { range: [0.36, 0.56], offset: [4.2, 2.2, 0] },
      { range: [0.68, 0.92], offset: [5.4, 2.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [-0.12, 2.85, 0],
    labelAppearAt: 0.0,
    roleTag: '常规/消音两档进气调节 / 折叠圆形护翼准星',
    description:
      '紧贴一体护木前缘套装在冷锻枪管上：上部前端装有可免工具旋拧的两档导气调节阀（标准档与消音器减气档，抑制过量燃气倒灌抛壳窗），顶部铰接圆形护圈折叠机械准星。',
  },
  {
    id: 'scar_gas_piston',
    bomCode: 'U-04',
    nameZh: '不锈钢短行程导气活塞顶杆 (Tappet)',
    calloutLabel: '短行程导气活塞顶杆',
    nameEn: 'Stainless Short-Stroke Gas Piston Tappet',
    group: 'slide',
    material: 'stainless',
    assembledPos: [12.35, 2.12, 0],
    explodeSteps: [
      { range: [0.34, 0.56], offset: [7.8, 4.4, 0] },
      { range: [0.68, 0.9], offset: [3.6, 2.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0.8, 0.35, 0],
    labelAppearAt: 0.32,
    roleTag: '短行程瞬态冲击传力 / 隔离火药燃气积碳与热量',
    description:
      'SCAR 高可靠与高精度秘诀：不同于 AR-15 燃气直吹或 AK 长行程连体活塞，SCAR 短行程活塞头仅向后急促冲撞约 14mm 即撞肩止动，通过惯性驱动枪机框后坐，彻底杜绝重质量偏心移动与机匣积碳发热。',
  },
  {
    id: 'scar_bolt_carrier',
    bomCode: 'U-05',
    nameZh: '重型矩形截面枪机框与前活塞承撞座',
    calloutLabel: '重型矩形枪机框',
    nameEn: 'Heavy Rectangular SCAR Bolt Carrier',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [2.45, 1.58, 0],
    explodeSteps: [
      ...SCAR_BCG_STAGE1,
      { range: [0.34, 0.54], offset: [0.4, 1.2, 0] },
      { range: [0.68, 0.9], offset: [-0.8, 1.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-1.0, 0.82, 0],
    labelAppearAt: 0.18,
    roleTag: '低射频平稳后坐质量块 / 螺旋凸轮槽驱动枪机开闭锁',
    description:
      '厚重刚硬的 CNC 方砖式合金钢枪机框，沿铝挤上机匣长导轨顺滑往复，赋予 SCAR-L 极其温顺可控的约 625 发/分连发射速；前上方延伸管直抵短行程活塞尾端承受冲击。',
  },
  {
    id: 'scar_charging_handle',
    bomCode: 'U-06',
    nameZh: '左右可互换随动滚花拉机柄',
    calloutLabel: '可互换随动拉机柄',
    nameEn: 'Reversible Reciprocating Side Charging Handle',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [4.1, 2.12, 0],
    explodeSteps: [
      { range: [0.12, 0.16], offset: [-6.05, 0, 0] },
      { range: [0.16, 0.24], offset: [0, 1.8, 3.6] },
      { range: [0.68, 0.9], offset: [1.2, 2.2, 1.4] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [0, 0.24, 1.45],
    labelAppearAt: 0.16,
    roleTag: '直接插锁枪机框 / 兼具强行推机助推器功能',
    description:
      'Mk 16 经典随动圆柱滚花拉机柄：横隼直接穿锁枪机框前上槽，可依射手左右手习惯双向安装，射击时随枪机高速往复并可直接充当故障强推助推器；野战拆解需先拉至后圆孔拔出。',
  },
  {
    id: 'scar_bolt',
    bomCode: 'U-07',
    nameZh: '七突笋回转闭锁枪机头、抽壳钩与凸轮销',
    calloutLabel: '七突笋回转枪机',
    nameEn: '7-Lug Rotating Bolt Head, Extractor & Cam Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [2.95, 1.05, 0],
    explodeSteps: [
      ...SCAR_BCG_STAGE1,
      {
        range: [0.34, 0.56],
        offset: [6.8, -1.2, 0],
        rotation: [0.48, 0, 0],
      },
      { range: [0.68, 0.9], offset: [1.8, 1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [1.1, 0.42, 0],
    labelAppearAt: 0.34,
    roleTag: '22.5° 小转角多突笋均载闭锁 / 宽爪强力抽壳',
    description:
      '环绕枪机端面均布 7 枚高强度闭锁突笋（第 8 槽位容置超宽爪式抽壳钩），推弹入膛后由矩形头凸轮销驱动旋转 22.5° 与枪管节套刚性咬合，寿命远超传统气吹式步枪枪机。',
  },
  {
    id: 'scar_firing_pin',
    bomCode: 'U-08',
    nameZh: '不锈钢长击针',
    calloutLabel: '不锈钢长击针',
    nameEn: 'Full-Length Stainless Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [1.55, 1.05, 0],
    explodeSteps: [
      ...SCAR_BCG_STAGE1,
      { range: [0.36, 0.58], offset: [-5.6, -1.1, 0] },
      { range: [0.68, 0.9], offset: [-1.8, 1.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    calloutAnchor: [-0.8, 0.2, 0],
    labelAppearAt: 0.36,
    roleTag: '传递回转击锤打击动能 / 引燃 5.56mm NATO 底火',
    description:
      '贯穿七突笋枪机与矩形枪机框轴孔的精密车削不锈钢击针，尾端凸缘外露于机框下方槽口，唯有枪机完全旋转闭锁后方允许击锤正面撞击引燃底火。',
  },
  {
    id: 'scar_recoil_rod',
    bomCode: 'U-09',
    nameZh: '一体尾盖缓冲块与俘获式复进簧导杆',
    calloutLabel: '尾盖与复进簧导杆',
    nameEn: 'Receiver End-Plate Buffer & Captive Recoil Guide Rod',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-6.15, 2.15, 0],
    explodeSteps: [
      { range: [0.1, 0.2], offset: [-6.2, 2.6, 0] },
      { range: [0.36, 0.56], offset: [-4.6, 1.2, 0] },
      { range: [0.68, 0.9], offset: [-3.2, 1.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [2.4, 0.25, 0],
    labelAppearAt: 0.14,
    roleTag: '封闭上机匣尾腔 / 无缓冲管折叠托架构核心',
    description:
      '将复进机构高置集成于上机匣顶部通道内，彻底省去 AR/M4 伸入枪托的尾管（从而允许枪托向左侧 180° 折叠并正常射击！），尾盖内嵌抗冲击缓冲垫保护机匣尾壁。',
  },
  {
    id: 'scar_recoil_spring',
    bomCode: 'U-10',
    nameZh: '高寿命俘获式螺旋复进簧',
    calloutLabel: '俘获式螺旋复进簧',
    nameEn: 'Captive Helical Recoil Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-1.85, 2.28, 0],
    explodeSteps: [
      { range: [0.1, 0.2], offset: [-6.2, 2.6, 0] },
      { range: [0.36, 0.58], offset: [2.4, 2.2, 0] },
      { range: [0.68, 0.9], offset: [-1.2, 1.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 54,
    calloutAnchor: [0, 0.28, 0],
    labelAppearAt: 0.36,
    roleTag: '吸收矩形枪机框后坐能量 / 恒力驱动推弹闭锁',
    description:
      '预压缩套装在细长不锈钢复进导杆上并伸入枪机框顶部盲孔，射击时随枪机框后坐同步压缩储能，回程时平顺推动枪机剥弹上膛。',
  },

  // ==================== 2. BARREL, LOWER & UGG-BOOT STOCK ('frame' · 8 parts) ====================
  {
    id: 'scar_lower_receiver',
    bomCode: 'F-01',
    nameZh: '哑光狼棕聚合物下机匣 (含双侧弹匣/空挂释放钮)',
    calloutLabel: '狼棕聚合物下机匣',
    nameEn: 'Matte Coyote-Tan Polymer Lower Receiver',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 68,
    calloutAnchor: [2.5, -2.2, 0],
    labelAppearAt: 0.0,
    roleTag: '全枪拆解零位基准 / 集成冬季大护圈与双侧人机工效键',
    description:
      '采用高抗冲玻纤增强聚酰胺注塑成型，呈哑光狼棕色（#8f7654，与香槟金铝上机匣形成经典比利时双色差），双侧压印鲜明黑/红「S - 1 - A」射击档位，配备喇叭口垂直 STANAG 弹匣井、左右联动弹匣卡笋及左侧乒乓球拍式空仓挂机杆。',
  },
  {
    id: 'scar_barrel',
    bomCode: 'F-02',
    nameZh: '14英寸冷锻镀铬快拆枪管与闭锁节套',
    calloutLabel: '14"冷锻镀铬快拆枪管',
    nameEn: '14" Cold-Hammer-Forged Chrome-Lined Quick-Change Barrel',
    group: 'frame',
    material: 'barrel_steel',
    assembledPos: [0, 1.05, 0],
    explodeSteps: [{ range: [0.68, 0.92], offset: [6.6, 1.2, 0] }],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [18.5, -0.35, 0],
    labelAppearAt: 0.0,
    roleTag: '模块化几分钟切换 CQC/标准/狙击管长且保持归零',
    description:
      '比利时埃斯塔勒冷精锻内膛镀硬铬枪管（缠距 1:7 英寸适配 SS109/Mk262 重弹头），后端刚性旋装七突笋枪管节套，全段悬臂自由浮置于一体铝上机匣内，支持单兵使用扭矩扳手在数分钟内更换不同长度枪管。',
  },
  {
    id: 'scar_flash_suppressor',
    bomCode: 'F-03',
    nameZh: '三叉音叉式消焰器 (含快拆消音器棘齿座)',
    calloutLabel: '三叉快拆消焰器',
    nameEn: '3-Prong Open-Tine Flash Suppressor w/ Suppressor Ratchet',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [22.95, 1.05, 0],
    explodeSteps: [
      {
        range: [0.36, 0.56],
        offset: [4.8, 0, 0],
        rotation: [2.4, 0, 0],
      },
      { range: [0.68, 0.92], offset: [6.4, 1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 36,
    calloutAnchor: [0.7, 0.5, 0],
    labelAppearAt: 0.0,
    roleTag: '彻底消除微光夜视眩光 / AAC 快拆消音器闭锁棘轮',
    description:
      '美军 Mk 16 标志性的开放式三叉消焰器，能破坏膛口未燃燃气涡环、消除 99% 夜间枪口焰以保护夜视仪，根部车有精密止退棘齿圈供特种作战消音器快速旋锁。',
  },
  {
    id: 'scar_barrel_crossbolts',
    bomCode: 'F-04',
    nameZh: '快拆枪管钢制承力鞍座与六枚 T25 星形锁紧横栓',
    calloutLabel: '枪管快拆星形横栓组',
    nameEn: 'Quick-Change Barrel Steel Yoke & 6 Torx Retention Cross-Bolts',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [5.1, 0.92, 0],
    explodeSteps: [{ range: [0.64, 0.88], offset: [2.2, 4.4, 3.2] }],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 0.2, 0.9],
    labelAppearAt: 0.65,
    roleTag: '62 英寸·磅定扭矩夹紧枪管节套 / 换管重复归零保证',
    description:
      '镶嵌在铝上机匣前下部的硬化钢 U 形承力块及左右对称布置的高强度星形防脱横栓，按规定扭矩锁紧即可将冷锻枪管抱死在同一基准轴线上，换管后弹着点偏移小于 1 MOA。',
  },
  {
    id: 'scar_pistol_grip',
    bomCode: 'F-05',
    nameZh: '后掠人体工学防滑纹 FDE 握把',
    calloutLabel: '后掠防滑FDE握把',
    nameEn: 'Swept Ergonomic Stippled FDE Pistol Grip',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-3.05, -0.88, 0],
    explodeSteps: [{ range: [0.68, 0.92], offset: [-3.4, -5.6, 0] }],
    calloutDir: 'down',
    calloutStem: 36,
    calloutAnchor: [-2.2, -4.4, 0],
    labelAppearAt: 0.0,
    roleTag: '24° 后掠舒适握持角 / 菱形防滑纹与海狸尾护翼',
    description:
      '兼容美式步枪接口的深沙色工程聚合物握把，呈经典约 24° 向后倾斜，前缘设中指承托凸棱、后上沿带贴合虎口的海狸尾弧面，两侧压制高摩擦力细密菱形防滑颗粒。',
  },
  {
    id: 'scar_buttstock',
    bomCode: 'F-06',
    nameZh: '标志性“雪地靴 (Ugg-Boot)”侧折叠六档伸缩枪托',
    calloutLabel: '“Ugg靴形”折叠伸缩托',
    nameEn: '"Ugg-Boot" Side-Folding 6-Position Telescoping FDE Buttstock',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-12.2, 0.85, 0],
    explodeSteps: [
      { range: [0.08, 0.16], offset: [-3.2, -0.4, 0] },
      { range: [0.66, 0.9], offset: [-4.8, -0.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [-2.4, -2.6, 0],
    labelAppearAt: 0.0,
    roleTag: '6 档托长快调 + 右侧折叠卡扣 / 全球玩家昵称“Ugg 雪地靴”',
    description:
      '因宽大上翘的尾靴轮廓与暖沙配色酷似澳洲雪地靴而被军迷亲切称为“Ugg-Boot”枪托：集成了高强度侧折叠铰链、大圆钮六档长度伸缩套筒以及三道纵向加强肋槽，兼顾防弹衣抵肩稳定性与车内狭小空间携行。',
  },
  {
    id: 'scar_cheek_riser',
    bomCode: 'F-07',
    nameZh: '前铰接两档抬升可调 FDE 贴腮板',
    calloutLabel: '两档可调FDE贴腮板',
    nameEn: 'Tilt-Up 2-Position Adjustable FDE Cheek Riser',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-12.15, 2.48, 0],
    explodeSteps: [
      { range: [0.08, 0.16], offset: [-3.2, -0.4, 0] },
      { range: [0.68, 0.94], offset: [-4.8, 3.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [-1.0, 0.48, 0],
    labelAppearAt: 0.0,
    roleTag: '机械瞄具平放 / ELCAN 或全息瞄具一键抬高贴腮线',
    description:
      '浅沙色倒 U 形鞍式贴腮板（构成“五十度沙色”中的亮沙色层次），前端销轴铰接于靴形枪托脊背上；按下侧边横锁钮即可将后端向上掀高一档锁死，完美匹配高基线光学瞄准镜。',
  },
  {
    id: 'scar_buttpad',
    bomCode: 'F-08',
    nameZh: '弧面横纹黑色吸能橡胶托底板',
    calloutLabel: '黑色横纹橡胶托底板',
    nameEn: 'Contoured Ribbed Black Rubber Recoil Buttpad',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-17.95, 0.05, 0],
    explodeSteps: [
      { range: [0.08, 0.16], offset: [-3.2, -0.4, 0] },
      { range: [0.68, 0.94], offset: [-7.8, -1.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [-0.4, -1.8, 0],
    labelAppearAt: 0.68,
    roleTag: '防滑贴合防弹插板肩窝 / 缓冲后坐冲击',
    description:
      '包覆于靴形枪托尾端宽大端面的黑色高阻尼橡胶抵肩垫，微凹弧面配合八道横向止滑槽，确保射手身着重型战术背心快速出枪时枪托绝不打滑。',
  },

  // ==================== 3. FIRE CONTROL GROUP ('fire_control' · 4 parts) ====================
  {
    id: 'scar_hammer',
    bomCode: 'FC-01',
    nameZh: '回转式不锈钢击锤与双翼扭簧',
    calloutLabel: '回转击锤与双扭簧',
    nameEn: 'Rotary Hammer & Dual-Coil Torsion Mainspring',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-0.35, -0.08, 0],
    explodeSteps: [{ range: [0.7, 0.94], offset: [0.4, 3.4, 0] }],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-0.15, 0.95, 0],
    labelAppearAt: 0.7,
    roleTag: '绕横轴高速前旋敲击击针 / 枪机框后坐自动压倒待击',
    description:
      '安装在聚合物下机匣火控槽前轴的精密机加工回转击锤，由左右对称双卷扭簧驱动；扣动扳机脱钩后沿顺时针（+X 方向）高速挥入矩形枪机框底部让位槽内撞击击针。',
  },
  {
    id: 'scar_trigger',
    bomCode: 'FC-02',
    nameZh: '弧形军用扳机与前主阻铁一体件',
    calloutLabel: '弧形扳机与主阻铁',
    nameEn: 'Curved Military Trigger & Primary Sear Nose',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-1.75, -0.42, 0],
    explodeSteps: [{ range: [0.7, 0.94], offset: [-0.8, -4.4, 0] }],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0.1, -1.25, 0],
    labelAppearAt: 0.7,
    roleTag: '扣住待击击锤下缺口 / 干脆解脱击发',
    description:
      '硬化合金钢弧形扳机，前端鼻尖为精磨主阻铁面；当手指克服扳机力向后扣动时，前阻铁鼻下沉脱离击锤待击卡口瞬间释放击锤。',
  },
  {
    id: 'scar_disconnector',
    bomCode: 'FC-03',
    nameZh: '半自动单发阻铁与复位压簧',
    calloutLabel: '半自动单发阻铁',
    nameEn: 'Semi-Auto Disconnector & Coil Spring',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-1.85, -0.24, 0],
    explodeSteps: [{ range: [0.72, 0.96], offset: [-2.8, 2.2, -1.8] }],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [0.2, 0.45, 0],
    labelAppearAt: 0.72,
    roleTag: '单发档 (1) 中途捕获回压击锤 / 松扳机交接复位',
    description:
      '嵌套在扳机中央凹槽内的钩状阻铁片：半自动射击时若手指尚未松开扳机，后坐枪机框压倒的击锤会被单发阻铁上钩先行拦截，松开扳机后平顺交接回前主阻铁。',
  },
  {
    id: 'scar_selector',
    bomCode: 'FC-04',
    nameZh: '双侧短行程 45°/90° 快慢机拨杆组 (S-1-A)',
    calloutLabel: '双侧S-1-A快慢机',
    nameEn: 'Ambidextrous S-1-A Fire Selector Drum & Twin Levers',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-3.45, -0.35, 0],
    explodeSteps: [{ range: [0.68, 0.92], offset: [-2.2, 0.6, 3.6] }],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-0.2, 0.18, 0.9],
    labelAppearAt: 0.68,
    roleTag: '左右对称水滴形拨杆 / 对齐黑红 S(保险)-1(半自动)-A(全自动)',
    description:
      '贯穿下机匣的凸轮轴与左右双侧符合人体工学的防滑水滴形拨杆，大拇指无需改变握姿即可在 S（Safe 保险）、1（单发半自动）与 A（Auto 全自动）三档间清脆切换。',
  },

  // ==================== 4. 30-RD FDE STANAG MAGAZINE ('magazine' · 4 parts) ====================
  {
    id: 'scar_mag_body',
    bomCode: 'M-01',
    nameZh: '30发 FDE 沙色北约标准 STANAG 金属弹匣体',
    calloutLabel: '30发FDE沙色STANAG弹匣',
    nameEn: '30-Rd FDE Tan STANAG 4179 Steel Magazine Body',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [2.45, -1.8, 0],
    explodeSteps: [
      ...SCAR_MAG_STAGE1,
      { range: [0.34, 0.54], offset: [0.4, -1.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 36,
    calloutAnchor: [0.6, -5.8, 0],
    labelAppearAt: 0.0,
    roleTag: '北约通用 STANAG 接口 / 干膜润滑沙色涂层与四道横向加强筋',
    description:
      'FN 原厂不锈钢冲压成型的 30 发 5.56×45mm 北约制式弹匣，上段垂直插入下机匣弹匣井、下段呈平缓微弯角以顺应无缘瓶颈弹锥度，表面喷涂耐磨干膜沙色涂层并压有四道防挤压横筋。',
  },
  {
    id: 'scar_mag_follower',
    bomCode: 'M-02',
    nameZh: '四向防倾侧高可视度托弹板',
    calloutLabel: '四向防倾侧托弹板',
    nameEn: '4-Way Anti-Tilt High-Visibility Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [2.45, -1.35, 0],
    explodeSteps: [
      ...SCAR_MAG_STAGE1,
      { range: [0.34, 0.56], offset: [-0.3, 2.9, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, 0.2, 0],
    labelAppearAt: 0.34,
    roleTag: '消除双排供弹卡滞 / 打空末发顶起左侧空仓挂机杆',
    description:
      '采用前后长导裙防倾侧自润滑聚合物制造（SCAR 原厂改进重点之一），确保双排交错 5.56mm 枪弹平顺上托，并在最后一发弹射尽后顶起左侧乒乓球拍空挂卡笋挂住枪机。',
  },
  {
    id: 'scar_mag_spring',
    bomCode: 'M-03',
    nameZh: '不锈钢耐腐蚀矩形螺旋托弹簧',
    calloutLabel: '不锈钢弹匣托弹簧',
    nameEn: 'Corrosion-Resistant Rectangular Magazine Coil Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [2.45, -1.8, 0],
    explodeSteps: [
      ...SCAR_MAG_STAGE1,
      { range: [0.34, 0.58], offset: [1.2, -3.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 36,
    calloutAnchor: [0.5, -6.5, 0],
    labelAppearAt: 0.34,
    roleTag: '满载长期储存不衰减 / 稳定推升 30 发 5.56mm NATO 弹药',
    description:
      '贴合 STANAG 弹匣微弧内腔的 17-7PH 沉淀硬化不锈钢矩形螺旋弹簧，在涉水两栖与风沙泥泞作战环境下依然保持充沛均匀的供弹推力。',
  },
  {
    id: 'scar_mag_floorplate',
    bomCode: 'M-04',
    nameZh: '战术快拔拉环 FDE 弹匣底盖 (Ranger Plate)',
    calloutLabel: '战术快拔环FDE底盖',
    nameEn: 'FDE Tactical Ranger Pull-Loop Floorplate',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [3.17, -9.4, 0],
    assembledRot: [0, 0, 0.15],
    explodeSteps: [
      ...SCAR_MAG_STAGE1,
      { range: [0.34, 0.58], offset: [2.4, -4.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 36,
    calloutAnchor: [0, -0.75, 0],
    labelAppearAt: 0.34,
    roleTag: '严丝合缝抱合弹匣底口 / 胸挂弹匣袋单指快速抽拔防摔缓冲',
    description:
      '美军游骑兵与特种部队广泛配装的沙色包胶战术快拔底盖：上沿卡槽与 STANAG 弹匣底口零间隙齐平扣合，下方一体成型宽大手指拉环与防摔橡胶护垫。',
  },
];

export const SCAR_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'scar_trigger_hammer',
    stepNum: '01',
    shortLabel: '扣扳机释击锤',
    title: '阶段 1 · 扣动扳机解脱阻铁，双扭簧驱动回转击锤前旋',
    range: [0.0, 0.16],
    description:
      '快慢机拨至红字「1」或「A」档，扣动弧形扳机使前主阻铁下沉脱钩；待击状态的回转击锤在双翼扭簧驱动下绕横轴高速向前上方（+X）挥入矩形枪机框底槽。',
  },
  {
    id: 'scar_pin_ignition',
    stepNum: '02',
    shortLabel: '击针刺破底火',
    title: '阶段 2 · 不锈钢长击针前冲撞击 5.56×45mm NATO 弹底火',
    range: [0.16, 0.24],
    description:
      '七突笋回转枪机已完全锁死枪管节套，回转击锤正面敲击长击针尾端；击针尖瞬时刺破 M855/SS109 步枪弹底火，引燃瓶形黄铜弹壳内的双基球形发射药。',
  },
  {
    id: 'scar_gas_tap',
    stepNum: '03',
    shortLabel: '过导气箍引气',
    title: '阶段 3 · 弹头越过导气孔，高压燃气经调节塞涌入气室并冲出三叉消焰器',
    range: [0.24, 0.34],
    description:
      '5.56mm 覆铜钢芯弹头沿 14 英寸冷锻镀铬枪管高速加速；越过前导气孔瞬间，高压火药燃气经两档导气调节阀分流进入上气室，弹头随即以约 870m/s 初速射出三叉音叉消焰器。',
  },
  {
    id: 'scar_tappet_unlock',
    stepNum: '04',
    shortLabel: '短活塞撞框旋锁',
    title: '阶段 4 · 短行程活塞顶杆急促冲撞 14mm 止动，枪机框惯性后坐解锁',
    range: [0.34, 0.54],
    description:
      '高压燃气推动不锈钢短行程活塞顶杆向后猛烈敲击矩形枪机框前承撞座后立即撞肩止动并复位（燃气被隔绝在护木前端！）；重型枪机框与随动拉机柄惯性后坐，螺旋槽带动七突笋枪机旋转 22.5° 开锁并压倒击锤。',
  },
  {
    id: 'scar_extract_eject',
    stepNum: '05',
    shortLabel: '拉壳撞块抛壳',
    title: '阶段 5 · 宽爪抽壳钩拉出黄铜弹壳，经导壳块向右前方干净抛出',
    range: [0.45, 0.72],
    description:
      '枪机右侧超宽抽壳钩死死咬住 5.56mm 弹壳底槽拉出弹膛，空弹壳向右侧翻滚飞出上机匣矩形抛壳窗，撞击后缘黑色三角导壳块（Brass Deflector）折向右前安全扇面，绝不打脸左撇子射手。',
  },
  {
    id: 'scar_feed_lock',
    stepNum: '06',
    shortLabel: '复进推弹旋闭',
    title: '阶段 6 · STANAG 弹匣托弹上升，俘获复进簧推枪机框复进闭锁',
    range: [0.56, 0.86],
    description:
      'FDE 沙色 STANAG 弹匣内防倾侧托弹板将下一发 5.56mm 新弹推升至抱弹口；高置俘获式螺旋复进簧释放能量，驱动重型矩形枪机框与拉机柄平顺前冲推弹入膛，凸轮销驱动七突笋反向旋转 22.5° 刚性闭锁。',
  },
  {
    id: 'scar_sear_reset',
    stepNum: '07',
    shortLabel: '单发断路复位',
    title: '阶段 7 · 松开扳机，半自动单发阻铁将击锤交接回前主阻铁',
    range: [0.86, 1.0],
    description:
      '后坐期间被压倒的击锤暂由中央单发阻铁上钩拦截；射手松开扳机后，单发阻铁退让脱钩，击锤微幅前抬即被扳机前主阻铁稳稳接住，完成半自动循环待击复位。',
  },
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function seg(f: number, start: number, end: number): number {
  if (f <= start) return 0;
  if (f >= end) return 1;
  const u = (f - start) / (end - start);
  return u * u * (3 - 2 * u);
}

function linearSeg(f: number, start: number, end: number): number {
  if (f <= start) return 0;
  if (f >= end) return 1;
  return (f - start) / (end - start);
}

export function getActiveScarFiringPhase(f: number): FiringPhaseInfo {
  for (let i = SCAR_FIRING_PHASES.length - 1; i >= 0; i--) {
    if (f >= SCAR_FIRING_PHASES[i].range[0]) {
      return SCAR_FIRING_PHASES[i];
    }
  }
  return SCAR_FIRING_PHASES[0];
}

/**
 * Real-time mechanical kinematics for FN SCAR-L Mk 16 Mod 0 at firing progress f ∈ [0, 1].
 */
export function computeScarFiringKinematics(
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

  // 1. Short-Stroke Gas Piston Tappet: sharp -1.35 impulse [0.29, 0.36], stops & returns [0.38, 0.50]!
  const tappetStroke = seg(f, 0.29, 0.36) - seg(f, 0.38, 0.5);
  const tappetDX = -1.35 * tappetStroke;

  // 2. Heavy Rectangular Bolt Carrier + Reciprocating Charging Handle (X: 0 -> -5.45 at f=0.54 -> 0 at f=0.85)
  const carrierBack = seg(f, 0.31, 0.54);
  const carrierReturn = seg(f, 0.57, 0.85);
  const carrierDX = -5.45 * (carrierBack - carrierReturn);

  // 3. 7-Lug Rotating Bolt: unlocks by rotating +0.40 rad (22.5°) during [0.335, 0.39], travels -4.95 with carrier, relocks [0.78, 0.85]
  const boltUnlockRot = seg(f, 0.335, 0.39) - seg(f, 0.78, 0.85);
  const boltBack = seg(f, 0.35, 0.54) - seg(f, 0.57, 0.82);
  const boltDX = -4.95 * boltBack;
  const boltRX = 0.4 * boltUnlockRot;

  switch (partId) {
    case 'scar_gas_piston': {
      dx = tappetDX;
      break;
    }

    case 'scar_bolt_carrier':
    case 'scar_charging_handle': {
      dx = carrierDX;
      break;
    }

    case 'scar_bolt': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'scar_firing_pin': {
      const pinStrike = seg(f, 0.145, 0.19) - seg(f, 0.24, 0.33);
      dx = boltDX + 0.34 * pinStrike;
      break;
    }

    case 'scar_recoil_spring': {
      // Assembled spring spans local X ∈ [-4.0, +4.0] (L0 = 8.0); rear end (-4.0) stays anchored at backplate!
      const x0Orig = -4.0;
      const L0 = 8.0;
      const x1New = 4.0 + carrierDX;
      const LNew = Math.max(2.65, x1New - x0Orig);
      scaleX = LNew / L0;
      dx = x0Orig - x0Orig * scaleX;
      break;
    }

    case 'scar_hammer': {
      // Upright cocked at rz = 0 -> swings FORWARD (+X) with rz < 0 (-0.94 rad) at [0.07, 0.155] ->
      // recocked by recoiling rectangular carrier [0.36, 0.47] -> handoff from disconnector to primary sear [0.89, 0.95]
      const swingForward = seg(f, 0.07, 0.155);
      const recock = seg(f, 0.36, 0.47);
      const overcockDip = Math.sin(linearSeg(f, 0.43, 0.55) * Math.PI) * 0.09;
      const resetHandoff = seg(f, 0.89, 0.95);
      rz =
        -0.94 * swingForward +
        1.01 * recock +
        overcockDip -
        0.07 * resetHandoff;
      break;
    }

    case 'scar_trigger': {
      // Pulled rearward (-X) with rz < 0 (-0.24 rad) during [0.00, 0.14], held until [0.87, 0.96]
      const pull = seg(f, 0.0, 0.14) - seg(f, 0.87, 0.96);
      rz = -0.24 * pull;
      break;
    }

    case 'scar_disconnector': {
      const pull = seg(f, 0.0, 0.14) - seg(f, 0.87, 0.96);
      const camSnap = Math.sin(linearSeg(f, 0.41, 0.49) * Math.PI) * 0.15;
      rz = -0.16 * pull + camSnap;
      break;
    }

    case 'scar_mag_follower': {
      const feedPulse = seg(f, 0.52, 0.63) - seg(f, 0.66, 0.8);
      dy = 0.38 * feedPulse;
      break;
    }

    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes 5.56×45mm NATO cartridge, spitzer projectile, SCAR gas-regulator tap glow, 3-prong flash & brass ejection.
 */
export function computeScarBallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const boltBack = seg(f, 0.35, 0.54) - seg(f, 0.57, 0.82);
  const boltDX = -4.95 * boltBack;

  // 1. 5.56×45mm NATO Spitzer Projectile along bore Y = 1.05:
  // Chamber neck [6.85, 1.05, 0] -> passes gas block X=14.7 -> exits 3-prong flash suppressor X=24.5 at f=0.305!
  const bulletVisible = f < 0.46;
  let bulletX = 6.85;
  let streakLength = 0;

  if (f >= 0.21 && f < 0.305) {
    const u = Math.pow(linearSeg(f, 0.21, 0.305), 1.42);
    bulletX = 6.85 + 17.65 * u;
    streakLength = 4.0 * u;
  } else if (f >= 0.305 && f < 0.46) {
    const u = linearSeg(f, 0.305, 0.46);
    bulletX = 24.5 + 49.0 * u;
    streakLength = 9.2 * (1 - u * 0.45);
  }

  // 2. Spent 5.56×45mm Brass Case: extracted from [5.15, 1.05, 0] -> deflected forward-right off SCAR brass deflector!
  const spentCaseVisible = f < 0.76;
  let caseX = 5.15;
  let caseY = 1.05;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.35 && f < 0.475) {
    caseX = 5.15 + boltDX;
  } else if (f >= 0.475 && f < 0.76) {
    const u = linearSeg(f, 0.475, 0.76);
    caseX = 1.95 + 4.4 * u; // Deflected cleanly toward 2-o'clock forward-right by SCAR brass deflector!
    caseY = 1.18 + 7.8 * u - 10.2 * u * u;
    caseZ = 12.6 * u;
    caseRX = u * 9.2;
    caseRY = -u * 13.5;
    caseRZ = -u * 10.8;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.76);
    }
  }

  // 3. Chamber Flash, Gas-Regulator Impulse Glow & Suppressed 3-Prong Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.19 && f <= 0.28) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.19, 0.28) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.265 && f <= 0.355) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.265, 0.355) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.295 && f <= 0.385) {
    const u = linearSeg(f, 0.295, 0.385);
    // 3-prong flash suppressor keeps flash compact & tight!
    muzzlePlumeScale = 0.38 + 1.25 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.78;
  }

  // 4. Next 5.56×45mm NATO Cartridge in STANAG Mag -> Stripped up feed ramp into Chamber [5.15, 1.05, 0]
  let nextX = 2.45;
  let nextY = 0.28;
  let nextRZ = 0.06;

  if (f >= 0.52 && f < 0.62) {
    const u = seg(f, 0.52, 0.62);
    nextY = 0.28 + 0.38 * u;
    nextRZ = 0.06 + 0.08 * u;
  } else if (f >= 0.62 && f < 0.84) {
    const u = seg(f, 0.62, 0.84);
    const rampArc = Math.sin(u * Math.PI) * 0.18;
    nextX = 2.45 + (5.15 - 2.45) * u;
    nextY = 0.66 + (1.05 - 0.66) * u + rampArc;
    nextRZ = 0.14 * (1 - u);
  } else if (f >= 0.84) {
    nextX = 5.15;
    nextY = 1.05;
    nextRZ = 0;
  }

  // 5. Reserve Cartridge underneath in STANAG Stack
  const magShift = seg(f, 0.52, 0.72);
  const resX = 2.45;
  const resY = -0.62 + (0.28 - -0.62) * magShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.05, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [14.7, 2.12, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0.12],
  };
}

export const SCAR_CAMERA_PRESETS: WeaponCameraMap = {
  armory_showcase: { pos: [15.8, 2.2, 60.0], target: [1.5, -6.4, 0] },
  iso: { pos: [14.5, 8.2, 45.0], target: [3.0, -1.0, 0] },
  right: { pos: [3.2, -0.5, 44.5], target: [3.2, -1.0, 0] },
  left: { pos: [3.2, -0.5, -44.5], target: [3.2, -1.0, 0] },
  top: { pos: [3.2, 47.0, 4.5], target: [3.2, 0, 0] },
  safe_action: { pos: [2.8, 2.8, 18.0], target: [0.8, 1.0, 0.2] },
  firing_view: { pos: [10.5, 4.4, 43.5], target: [4.8, 0.2, 0] },
};

export const SCAR_WORKBENCH_META: WeaponWorkbenchMeta = {
  badge: 'FN HERSTAL · MK16 FDE',
  title: 'FN SCAR 内部结构3D拆解与击发演示',
  subtitle:
    '4 大总成 · 26 核心节点 · 短行程导气活塞回转闭锁 & 5.56×45mm 动态射击模拟',
  cutawayLabel: '短行程活塞/枪机特写',
  cutawayTitle:
    '切换至合拢透视状态并聚焦不锈钢短行程导气活塞顶杆与重型矩形枪机框啮合特写',
  cutawayFocusPartId: 'scar_gas_piston',
  searchPlaceholder: '搜索零件名 / 编号 (如 活塞, 枪机, 靴形托, U-04)...',
  muzzlePos: [24.5, 1.05, 0],
  chamberGlowPos: [5.35, 1.05, 0],
  scaleProfile: 'rifle',
  gridY: -24.5,
};

export const SCAR_GEOMETRY_BUILDERS: Record<
  string,
  () => THREE.BufferGeometry
> = {
  // 1. Monolithic Upper, Short-Stroke Piston & BCG ('slide' · 10)
  scar_upper_receiver: buildScarUpperReceiverGeometry,
  scar_rear_sight: buildScarRearSightGeometry,
  scar_gas_block: buildScarGasBlockGeometry,
  scar_gas_piston: buildScarGasPistonGeometry,
  scar_bolt_carrier: buildScarBoltCarrierGeometry,
  scar_charging_handle: buildScarChargingHandleGeometry,
  scar_bolt: buildScarBoltGeometry,
  scar_firing_pin: buildScarFiringPinGeometry,
  scar_recoil_rod: buildScarRecoilRodGeometry,
  scar_recoil_spring: buildScarRecoilSpringGeometry,

  // 2. CHF Barrel, Polymer Lower & Ugg-Boot Stock ('frame' · 8)
  scar_lower_receiver: buildScarLowerReceiverGeometry,
  scar_barrel: buildScarBarrelGeometry,
  scar_flash_suppressor: buildScarFlashSuppressorGeometry,
  scar_barrel_crossbolts: buildScarBarrelCrossboltsGeometry,
  scar_pistol_grip: buildScarPistolGripGeometry,
  scar_buttstock: buildScarButtstockGeometry,
  scar_cheek_riser: buildScarCheekRiserGeometry,
  scar_buttpad: buildScarButtpadGeometry,

  // 3. Rotary Hammer FCG & Ambi S-1-A Selector ('fire_control' · 4)
  scar_hammer: buildScarHammerGeometry,
  scar_trigger: buildScarTriggerGeometry,
  scar_disconnector: buildScarDisconnectorGeometry,
  scar_selector: buildScarSelectorGeometry,

  // 4. 30-Rd FDE Tan STANAG Magazine ('magazine' · 4)
  scar_mag_body: buildScarMagBodyGeometry,
  scar_mag_follower: buildScarMagFollowerGeometry,
  scar_mag_spring: buildScarMagSpringGeometry,
  scar_mag_floorplate: buildScarMagFloorplateGeometry,
};

export interface ScarPbrBindingSpec {
  albedoUrl: string;
  normalUrl: string;
  roughnessUrl: string;
  normalScale: number;
}

const SCAR_FDE_BUNDLE: ScarPbrBindingSpec = {
  albedoUrl: '/textures/scar_fde_albedo.png',
  normalUrl: '/textures/scar_fde_normal.png',
  roughnessUrl: '/textures/scar_fde_roughness.png',
  normalScale: 0.42,
};

export const SCAR_PBR_BINDINGS: Record<string, ScarPbrBindingSpec> = {
  scar_upper_receiver: { ...SCAR_FDE_BUNDLE, normalScale: 0.36 },
  scar_lower_receiver: { ...SCAR_FDE_BUNDLE, normalScale: 0.48 },
  scar_buttstock: { ...SCAR_FDE_BUNDLE, normalScale: 0.44 },
  scar_cheek_riser: { ...SCAR_FDE_BUNDLE, normalScale: 0.4 },
  scar_pistol_grip: { ...SCAR_FDE_BUNDLE, normalScale: 0.56 },
  scar_mag_body: { ...SCAR_FDE_BUNDLE, normalScale: 0.46 },
  scar_mag_floorplate: { ...SCAR_FDE_BUNDLE, normalScale: 0.42 },
};

export const SCAR_PBR_SUITES = [
  {
    id: 'scar_fde',
    weapon: 'scar' as const,
    titleCn: '比利时 FN“五十度沙色 (50 Shades of FDE)”全枪贴图组',
    partTag: 'U-01 / F-01 / F-06 / M-01 FDE',
    resolution: '2048 × 2048 px',
    summary:
      '真实还原比利时 FN Herstal 埃斯塔勒原厂因多种异质材料（硬质阳极氧化挤压铝上机匣、哑光玻纤聚酰胺下机匣、暖沙靴形折叠托、亮沙可调贴腮板与干膜沙色 STANAG 弹匣）同场装配而闻名的经典“50 Shades of FDE”多层次沙色美学，采用全平面无波纹阳极氧化法线。',
    highlights: [
      '左侧 [FN] FN HERSTAL BELGIUM SCAR-L CAL. 5.56MM 铭文与导轨 T 标号',
      '哑光狼棕下机匣双侧鲜明黑/红 S - 1 - A 快慢机档位压印',
      '金属香槟金上机匣 (0.33) vs 哑光聚合物下机匣/靴形托 (0.69) 粗糙度反差',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        url: '/textures/scar_fde_albedo.png',
        fileName: 'scar_fde_albedo.png',
        note: 'sRGB · 香槟金阳极氧化铝 / 狼棕下机匣 / 红黑 S-1-A / 沙色肋纹弹匣',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        url: '/textures/scar_fde_normal.png',
        fileName: 'scar_fde_normal.png',
        note: 'Linear · 光学平整铝挤平面 + 凹刻铭文 + 聚合物皮纹与弹匣横筋',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度',
        url: '/textures/scar_fde_roughness.png',
        fileName: 'scar_fde_roughness.png',
        note: 'Linear · 半光香槟铝氧化面 vs 哑光注塑与防滑菱纹对比',
      },
    ],
  },
];

export const SCAR_MODULE = {
  id: 'scar' as const,
  orderIndex: 7,
  catalog: {
    id: 'scar',
    bayCode: 'BAY-07',
    modelCode: 'FN SCAR-L MK 16 MOD 0 · FDE',
    nameCn: 'FN SCAR-L 模块化步枪',
    subtitleEn: '5.56×45mm Short-Stroke Piston Modular Assault Rifle',
    originCountryCn: '比利时',
    weaponTypeCn: '模块化步枪',
    category: 'rifle' as const,
    categoryCn: '模块化步枪',
    caliber: '5.56×45mm NATO',
    actionMechanism: '短行程导气活塞 · 七突笋回转枪机闭锁',
    assembliesCount: 4,
    partsCount: SCAR_PARTS.length,
    firingStagesCount: 7,
    available: true,
    statusLabel: '已入库 · 可拆解',
    description:
      '比利时 FN Herstal 专为美军特种作战司令部（USSOCOM）研制的 5.56×45mm 模块化突击步枪（Mk 16 Mod 0）：以全通一体挤压香槟金阳极氧化铝上机匣、隔离积碳与热量的不锈钢短行程导气活塞顶杆、方砖式重型枪机框与随动拉机柄、六栓快拆冷锻枪管，以及极具辨识度的“Ugg 雪地靴”可调贴腮折叠伸缩托和“五十度沙色 (50 Shades of FDE)”多材质配色享誉全球。',
    highlights: [
      '一体铝挤上机匣 + 短行程导气活塞顶杆',
      '标志性“Ugg 雪地靴”折叠伸缩贴腮枪托',
      '比利时原厂多材质“五十度沙色”2K 贴图',
      '快拆冷锻枪管 + 30 发快拔环 STANAG 弹匣',
    ],
  },
  partGroups: SCAR_PART_GROUPS,
  timelinePresets: SCAR_TIMELINE_PRESETS,
  parts: SCAR_PARTS,
  firingPhases: SCAR_FIRING_PHASES,
  getActiveFiringPhase: getActiveScarFiringPhase,
  computeFiringKinematics: computeScarFiringKinematics,
  computeBallisticsState: computeScarBallisticsState,
  caliberProfile: '556_nato' as CaliberProfile,
  cameraPresets: SCAR_CAMERA_PRESETS,
  workbenchMeta: SCAR_WORKBENCH_META,
  geometryBuilders: SCAR_GEOMETRY_BUILDERS,
  pbrBindings: SCAR_PBR_BINDINGS,
  pbrSuites: SCAR_PBR_SUITES,
};
