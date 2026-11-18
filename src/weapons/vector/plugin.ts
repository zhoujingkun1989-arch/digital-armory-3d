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
import {
  SUPER_V_CHUTE_ANGLE,
  VECTOR_BORE_Y,
  VECTOR_MAG_ANGLE,
  VECTOR_TRIGGER_Y,
} from './meshes/vectorGeometries';

export const VECTOR_ID = 'vector' as unknown as WeaponId;
export const VECTOR_CALIBER = '45_acp' as unknown as CaliberProfile;

const COS_SUPER_V = Math.cos(SUPER_V_CHUTE_ANGLE); // 0.42261826
const SIN_SUPER_V = Math.sin(SUPER_V_CHUTE_ANGLE); // 0.90630779
const COS_MAG = Math.cos(VECTOR_MAG_ANGLE); // 0.40673664
const SIN_MAG = Math.sin(VECTOR_MAG_ANGLE); // 0.91354546

export const VECTOR_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '5.5"低轴线枪管、凸轮耳枪机与Super V下潜滑块组',
    nameEn: '5.5" Low-Bore Barrel, Cam Bolt & Super V Vertical Slider',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '双层聚合物机匣、黄铜折叠拉机柄与Gen II折叠托组',
    nameEn: 'Two-Tier Polymer Chassis, Folding Handle & Gen II Stock',
    badgeColor: '#d97706',
  },
  {
    key: 'fire_control',
    nameZh: '顶置倒装击锤盒与跨膛轴水平扳机火控组',
    nameEn: 'Inverted Top-Mounted Hammer Pack & Horizontal Trigger',
    badgeColor: '#f43f5e',
  },
  {
    key: 'magazine',
    nameZh: '25发Kriss MagEx2加长.45 ACP双排弹匣组',
    nameEn: '25-Round Kriss MagEx2 Extended .45 ACP Magazine',
    badgeColor: '#10b981',
  },
];

export const VECTOR_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: 'KRISS Vector SMG Gen II（.45 ACP）标准闭膛待击态：Gen II 镂空右折枪托展开（全长 617 mm / 折叠 406 mm），5.5 英寸枪管轴线低置于虎口与水平扳机正下方，钨钢 Super V 垂直配重滑块驻留于 -65° 斜向导槽顶端。',
  },
  {
    id: 'field_strip',
    label: '免工具四销快拆',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '遵循 KRISS 原厂免工具野战勤务规程：卸下 25 发 MagEx2 加长弹匣，拔出四枚自锁横推分解销，整体向上分离带倒装火控盒的上机匣壳体，并从下机匣 -65° 导槽直接向上抽出凸轮耳枪机与 Super V 钨钢滑块总成。',
  },
  {
    id: 'sub_assembly',
    label: 'Super V与倒装火控分解',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '解耦枪机横向凸轮耳与 Super V 钨钢滑块变角度导槽，从下潜井抽出 -65° 斜置复进导杆与螺旋复进簧，同时拆解上机匣顶置不锈钢火控框架内的倒装回转击锤、双侧三档快慢机（1/2/A）与水平连杆扳机。',
  },
  {
    id: 'full_exploded',
    label: '全枪 25 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 25 个精密机械节点零遮挡展开：从 5.5 英寸低膛轴线 .45 ACP 枪管、侧凸轮耳延迟枪机、Super V -65° 钨钢下潜配重滑块、顶置倒装击锤组到 25 发 MagEx2 弹匣内件，完整揭示人类最颠覆传统的轴外后坐偏转工程奇迹。',
  },
];

export const VECTOR_PARTS: WeaponPartSpec[] = [
  // ==================== 1. 5.5" LOW-BORE BARREL, CAM BOLT & SUPER V SLIDER ('slide' · 7 parts) ====================
  {
    id: 'vector_barrel',
    bomCode: 'S-01',
    nameZh: '5.5英寸低膛轴线.45 ACP冷锻枪管与节套',
    calloutLabel: '5.5"低轴线.45枪管',
    nameEn: '5.5" Low-Bore .45 ACP CHF Barrel & Chamber Trunnion',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, VECTOR_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [11.5, 0, 0] },
      { range: [0.66, 1.0], offset: [8.5, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [18.5, -0.85, 0],
    labelAppearAt: 0.36,
    roleTag: '140mm 固定冷锻枪管 · 膛轴低于扳机与虎口支点',
    description:
      '全长 140 mm（5.5 英寸）4140 铬钼钒钢冷精锻盐浴氮化枪管（16 英寸左旋导程适配 230 格令 .45 ACP 重弹头），后端刚性压入锻钢闭锁节套并集成宽大抛光供弹坡；最颠覆传统的是其枪管中心线低置在扳机轴线下方 15.3 mm 处，正好穿过射手握持手掌虎口支点，从静力学源头消弭连发翻转力矩。',
  },
  {
    id: 'vector_muzzle_device',
    bomCode: 'S-02',
    nameZh: 'M16×1左旋开槽消焰膛口护套',
    calloutLabel: '四槽消焰膛口护套',
    nameEn: 'M16×1 LH Threaded Fluted Flash Suppressor',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [24.2, VECTOR_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.66], offset: [15.5, 0, 0] },
      { range: [0.66, 1.0], offset: [11.5, 0, 0], rotation: [0.65, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.38,
    roleTag: 'M16×1 LH 反牙接口 · 抑制亚音速大口径膛口焰',
    description:
      '旋锁于枪管前端 M16×1 左旋公制螺纹（沿袭欧洲军警战术消音器标准，快拆兼容 Osprey 45 偏心消音器）的氮化钢四开槽消焰兼膛口冠保护器，有效打散 .45 ACP 未燃双基发射药微粒闪光。',
  },
  {
    id: 'vector_bolt',
    bomCode: 'S-03',
    nameZh: '横向双凸轮耳延迟半自由枪机与抓弹钩',
    calloutLabel: '双凸轮耳.45枪机',
    nameEn: 'Lateral Cam-Trunnion .45 ACP Delayed-Blowback Bolt',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [7.25, VECTOR_BORE_Y, 0],
    explodeSteps: [
      { range: [0.14, 0.32], offset: [0, 4.6, 0] },
      { range: [0.35, 0.65], offset: [4.2, 0.4, 0] },
      { range: [0.65, 1.0], offset: [3.2, 0.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.16,
    roleTag: '紧凑低质量闭锁体 · 双侧圆柱凸轮耳啮合滑块斜槽',
    description:
      '相比传统 .45 ACP 自由枪机（如汤姆逊或 UMP45）减重逾 50% 的紧凑渗碳硬化钢枪机：前端设 .45 ACP 沉底镜面与重型黄铜衬垫抽壳钩，尾部左右两侧伸出粗壮淬火圆柱凸轮耳（Cam Trunnions），直接嵌合在 Super V 钨钢滑块上端的变角度凸轮槽中。',
  },
  {
    id: 'vector_firing_pin',
    bomCode: 'S-04',
    nameZh: '阶梯式防惯性浮动击针与回位簧',
    calloutLabel: '浮动击针与回位簧',
    nameEn: 'Stepped Inertial Firing Pin & Return Spring',
    group: 'slide',
    material: 'stainless',
    assembledPos: [7.1, VECTOR_BORE_Y, 0],
    explodeSteps: [
      { range: [0.14, 0.32], offset: [0, 4.6, 0] },
      { range: [0.35, 0.65], offset: [-1.8, 0.4, 0] },
      { range: [0.65, 1.0], offset: [-1.4, 0.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    labelAppearAt: 0.42,
    roleTag: '高劲度击针回位簧 · 承接顶置倒装击锤下摆敲击',
    description:
      '贯穿枪机中心孔的 17-4PH 不锈钢阶梯形惯性击针与琴钢丝防走火回位簧：尾端打击钮略微凸出于枪机后壁，在闭膛到位瞬间精准对准上方倒装击锤的下摆轨迹；若枪机未完全闭锁，滑块顶面将物理遮蔽击针尾钮构成不到位保险。',
  },
  {
    id: 'vector_slider',
    bomCode: 'S-05',
    nameZh: 'Super V 专利钨钢垂直下潜配重滑块',
    calloutLabel: 'Super V 钨钢下潜滑块',
    nameEn: 'Patented KRISS Super V Off-Axis Counterweight Slider',
    group: 'slide',
    material: 'stainless',
    assembledPos: [3.85, -2.35, 0],
    explodeSteps: [
      { range: [0.14, 0.32], offset: [-2.8, 5.4, 0] },
      { range: [0.35, 0.65], offset: [-3.4, 0.6, 0] },
      { range: [0.65, 1.0], offset: [-2.4, 0.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    labelAppearAt: 0.16,
    roleTag: 'US 7,201,094 核心专利 · 水平后坐偏转 -65° 向下冲量',
    description:
      '法国工程师雷诺·克尔布拉（Renaud Kerbrat）发明的 KRISS Super V 轴外延迟自动机灵魂构件：上部双颊铣削镜面抛光变角度凸轮导槽——击发初段以陡峭不利杠杆比迫使枪机延迟开锁，开锁后则驱动高密度钨钢配重块沿握把前方的 -65° 导轨高速向下猛潜 64 mm，产生向下的动量反冲主动抵消枪口上跳！',
  },
  {
    id: 'vector_guide_rod',
    bomCode: 'S-06',
    nameZh: '-65°斜置无心磨削复进导杆与底缓冲垫',
    calloutLabel: '-65°斜置复进导杆',
    nameEn: 'Inclined -65° Steel Recoil Guide Rod & Buffer Pad',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-2.45, -12.15, 0],
    assembledRot: [0, 0, SUPER_V_CHUTE_ANGLE],
    explodeSteps: [
      { range: [0.35, 0.66], offset: [-7.5, -10.5, 0] },
      { range: [0.66, 1.0], offset: [-5.5, -6.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.4,
    roleTag: '贯穿钨钢滑块内孔 · 聚氨酯底垫柔和吸收下潜终点冲击',
    description:
      '以 -65° 倾角锚定在下机匣垂直井底部的无心磨削不锈钢精密导杆，根部套接高阻尼聚氨酯吸能缓冲环：全行程约束 Super V 钨钢滑块沿 65° 轴线零偏摆高速升降，并在 1,200 发/分极限射速下柔和吸收滑块触底动能。',
  },
  {
    id: 'vector_recoil_spring',
    bomCode: 'S-07',
    nameZh: '-65°斜置高疲劳螺旋复进簧与承推杯',
    calloutLabel: '-65°斜置螺旋复进簧',
    nameEn: 'Inclined -65° Helical Super V Recoil Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-2.45, -12.15, 0],
    assembledRot: [0, 0, SUPER_V_CHUTE_ANGLE],
    explodeSteps: [
      { range: [0.35, 0.66], offset: [-14.5, -10.5, 0] },
      { range: [0.66, 1.0], offset: [-9.5, -6.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    labelAppearAt: 0.42,
    roleTag: '64mm 下潜压缩蓄能 · +65° 上推滑块经凸轮闭膛推弹',
    description:
      '套装于 -65° 斜置导杆外圈并深入钨钢滑块中心弹簧腔的多圈琴钢丝螺旋复进簧：滑块下潜时由自由长压缩至 56% 蓄能；回程时沿 +65° 猛力向上顶升钨钢滑块，通过上部凸轮槽将枪机向前水平推回弹膛剥弹闭锁。',
  },

  // ==================== 2. TWO-TIER POLYMER HOUSING, SIGHTS & GEN II STOCK ('frame' · 8 parts) ====================
  {
    id: 'vector_upper_housing',
    bomCode: 'F-01',
    nameZh: '双色FDE上机匣壳体与全长皮卡汀尼导轨',
    calloutLabel: '上机匣与全长导轨',
    nameEn: 'Two-Tone Upper Polymer Housing & MIL-STD-1913 Top Rail',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [0, 9.2, 0] },
      { range: [0.65, 1.0], offset: [0, 8.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [3.5, 4.1, 0],
    labelAppearAt: 0.06,
    roleTag: '高瞄准基线平台 · 内置顶层火控舱与1/2/A快慢机座',
    description:
      'KRISS 标志性上下分体式架构的上半部承力壳体：采用战斗沙色（Combat FDE）35% 玻纤增强聚酰胺注塑包覆硬质阳极氧化铝合金全长 36 槽 MIL-STD-1913 战术导轨，内腔倒悬容纳整套顶置火控模块，双侧精刻「1 / 2 / A」与「S / F」射控标识。',
  },
  {
    id: 'vector_lower_chassis',
    bomCode: 'F-02',
    nameZh: 'Super V 下机匣总成、-65°导槽井与防滑握把',
    calloutLabel: 'Super V 下机匣壳体',
    nameEn: 'Super V Polymer Lower Chassis, Magwell & Stippled Grip',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [{ range: [0.65, 1.0], offset: [0, -2.6, 0] }],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [6.0, -11.5, 0],
    labelAppearAt: 0.06,
    roleTag: '并联 66° 弹匣井与 -65° 下潜井 · 一体横桥护圈握把',
    description:
      '造就 KRISS Vector 极具未来感方正轮廓的一体化高强聚合物下机匣：前段包覆低轴线枪管并成型止手钩，中段以坚固隔板并联布置前倾 66° 的 Glock-21 弹匣井与 -65° Super V 垂直滑块导轨腔，后段通过水平护腕横桥连接带激光蚀纹炭黑防滑贴片的人体工学握把。',
  },
  {
    id: 'vector_charging_handle',
    bomCode: 'F-03',
    nameZh: '左侧非随动折叠拉机柄与黄铜铰链座',
    calloutLabel: '黄铜铰链折叠拉机柄',
    nameEn: 'Left Folding Non-Reciprocating Charging Handle & Brass Pivot',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [11.8, 0.25, -1.68],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [3.2, 2.8, -3.6] },
      { range: [0.68, 1.0], offset: [2.4, 2.2, -2.4] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.4,
    roleTag: '高辨识度自润滑黄铜转轴 · 贴合折叠零勾挂且射击静止',
    description:
      '布置于下机匣左前侧滑槽内的非随动折叠拉机柄：平时向前平贴于机匣侧壁防止勾挂战术背心，向外扳开 90° 后拉即可借由高精度自润滑 C26000 黄铜铰链滑块顶推枪机上膛，实弹射击循环中全程保持静止不打手。',
  },
  {
    id: 'vector_front_sight',
    bomCode: 'F-04',
    nameZh: 'KRISS Defiance 超薄折叠机械前准星',
    calloutLabel: 'Defiance 折叠前准星',
    nameEn: 'KRISS Defiance Low-Profile Flip-Up Front Sight',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [20.6, 4.1, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [0, 9.2, 0] },
      { range: [0.65, 1.0], offset: [4.8, 12.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.68,
    roleTag: '高瞄准基线补偿低膛轴差 · 免工具快翻锁定',
    description:
      '锁固于全长顶导轨最前端的硬质阳极氧化铝合金折叠准星座：由于 Vector 枪管轴线极低，高耸导轨面与折叠机械瞄具提供了自然舒适的直立贴腮瞄准高度（Sight-over-Bore 约 64 mm）。',
  },
  {
    id: 'vector_rear_sight',
    bomCode: 'F-05',
    nameZh: 'KRISS Defiance 双孔径折叠觇孔后照门',
    calloutLabel: 'Defiance 折叠后照门',
    nameEn: 'KRISS Defiance Dual-Aperture Flip-Up Rear Sight',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-11.4, 4.1, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [0, 9.2, 0] },
      { range: [0.65, 1.0], offset: [-4.8, 12.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.68,
    roleTag: '0.5 MOA 风偏鼓轮 · 近战大孔与精确小孔快切',
    description:
      '锁固于顶导轨尾端的超薄折叠觇孔照门：折倒后完全低于全息红点瞄准镜视野基线，弹起锁定后提供室内近战快速捕捉大觇孔与 100 米精确射击小觇孔。',
  },
  {
    id: 'vector_takedown_pins',
    bomCode: 'F-06',
    nameZh: '四枚免工具快推自锁机匣分解横销',
    calloutLabel: '四枚免工具快拆横销',
    nameEn: '4 Tool-Free Quick-Push Captive Receiver Takedown Pins',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.02, 0.2], offset: [0, -0.4, -4.6] },
      { range: [0.65, 1.0], offset: [0, -0.4, -3.4] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [1.2, 0.95, -1.8],
    labelAppearAt: 0.08,
    roleTag: '弹簧钢珠防丢卡笋 · 10秒内徒手分离上下机匣',
    description:
      '横穿上下机匣结合耳与前节套座的四枚带拔销环槽淬火钢快拆销（上部三枚连接上下机匣与顶置火控架，前下一枚锁定节套护木）：内置防脱落定位钢珠，可用实弹弹尖轻顶推出，实现零工具野战维护。',
  },
  {
    id: 'vector_stock_hinge',
    bomCode: 'F-07',
    nameZh: 'Gen II 按压式右侧折叠枪托钢制铰链座',
    calloutLabel: 'Gen II 右折枪托铰链',
    nameEn: 'Push-Button Right-Folding Gen II Stock Hinge Knuckle',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-14.15, 1.55, 0],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-5.2, 0.8, 0] },
      { range: [0.68, 1.0], offset: [-3.8, 0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.42,
    roleTag: '折叠全长缩至 406 mm · 折叠态仍可正常射击抛壳',
    description:
      '嵌装于上机匣最尾端的锻造氮化钢右侧折叠铰链节与弹簧解锁按钮：一键按压即可将枪托向右翻转 180° 贴合枪身（巧妙避开下方抛壳窗，折叠状态仍可顺畅射击），全枪长度由 617 mm 瞬间缩短至 406 mm。',
  },
  {
    id: 'vector_folding_stock',
    bomCode: 'F-08',
    nameZh: 'Gen II 镂空聚合物折叠枪托与防滑橡胶肩垫',
    calloutLabel: 'Gen II 镂空折叠枪托',
    nameEn: 'Skeletonized Gen II Polymer Folding Stock & Ribbed Pad',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-14.5, 1.55, 0],
    explodeSteps: [
      { range: [0.36, 0.68], offset: [-10.5, 0.8, 0] },
      { range: [0.68, 1.0], offset: [-8.5, 0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-11.0, 1.1, 0],
    labelAppearAt: 0.38,
    roleTag: '高置直列抵肩轴线 · 三角桁架减重与横槽硫化橡胶托底',
    description:
      'KRISS Vector Gen II 经典三角形镂空玻纤聚合物折叠枪托：上梁与上机匣保持笔直同轴以稳固承接高瞄准基线贴腮，尾部包覆加厚横向防滑槽硫化橡胶缓冲垫，彻底驯服 .45 ACP 剩余水平后坐感。',
  },

  // ==================== 3. INVERTED TOP-MOUNTED HAMMER PACK & HORIZONTAL TRIGGER ('fire_control' · 6 parts) ====================
  {
    id: 'vector_fcu_chassis',
    bomCode: 'FC-01',
    nameZh: '顶置不锈钢模块化火控副车架',
    calloutLabel: '顶置不锈钢火控架',
    nameEn: 'Top-Deck CNC Stainless Fire-Control Sub-Frame',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [0.4, 2.15, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [0, 9.2, 0] },
      { range: [0.35, 0.65], offset: [0, -0.4, 0] },
      { range: [0.65, 1.0], offset: [0, 3.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.38,
    roleTag: '悬架于枪管与滑块正上方 · 集成单发/两连发棘轮凸轮',
    description:
      '倒悬锁固在上机匣顶舱内的精密不锈钢双侧板火控盒：由于下方空间完全让位给低轴线枪管与 -65° Super V 下潜滑块，Vector 将主阻铁、单发断连器以及 2 发点射棘轮计数器全部上移至枪身顶层！',
  },
  {
    id: 'vector_trigger',
    bomCode: 'FC-02',
    nameZh: '高置水平行程摆动扳机与双联传递拉杆',
    calloutLabel: '高置水平行程扳机',
    nameEn: 'Horizontal-Travel Pivoting Trigger & Twin Transfer Bars',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-5.4, VECTOR_TRIGGER_Y, 0],
    explodeSteps: [
      { range: [0.38, 0.7], offset: [-7.5, 4.2, 0] },
      { range: [0.7, 1.0], offset: [-4.5, 1.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.44,
    roleTag: '位于枪管轴线上方 15.3 mm · 近乎纯水平干脆扣压行程',
    description:
      '悬吊铰接于枪管中心线正上方（Y = +0.58 cm > 枪管 Y = -0.95 cm）的标志性高置扳机：上枢轴配合左右双平行不锈钢推拉连杆，将食指向后的水平扣压无死区传递至顶层阻铁，扳机力恒定清脆。',
  },
  {
    id: 'vector_hammer',
    bomCode: 'FC-03',
    nameZh: '顶置倒装下摆硬化钢击锤',
    calloutLabel: '顶置倒装回转击锤',
    nameEn: 'Inverted Top-Mounted Downward-Swinging Steel Hammer',
    group: 'fire_control',
    material: 'barrel_steel',
    assembledPos: [3.95, 1.85, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [0, 9.2, 0] },
      { range: [0.38, 0.7], offset: [5.5, -2.6, 0] },
      { range: [0.7, 1.0], offset: [3.2, 0.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.44,
    roleTag: '自上而下挥击底置击针 · 后坐枪机顶背自动压回待击',
    description:
      '倒挂铰接在顶层火控架前端的渗碳合金钢回转击锤：待击时向后上方收起贴合上机匣顶壁；阻铁释放瞬间自上而下高速向前挥摆（+47°），跨过上下机匣分界精准敲击下方低轴线枪机尾部的浮动击针！',
  },
  {
    id: 'vector_hammer_spring',
    bomCode: 'FC-04',
    nameZh: '顶置水平螺旋击锤主簧与导向顶杆',
    calloutLabel: '顶置螺旋击锤主簧',
    nameEn: 'Top-Deck Helical Hammer Strut & Drive Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-0.85, 2.42, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [0, 9.2, 0] },
      { range: [0.38, 0.7], offset: [-5.5, -2.6, 0] },
      { range: [0.7, 1.0], offset: [-2.8, 0.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.46,
    roleTag: '水平储能顶推击锤上耳 · 极短击发锁时',
    description:
      '平卧于顶置火控副车架上层的琴钢丝螺旋主簧与不锈钢导向顶杆：前端顶在倒装击锤上凸耳上，在 1,200 发/分（每发循环仅 50 毫秒）超高射速下仍赋予击锤充沛可靠的底火穿刺能量。',
  },
  {
    id: 'vector_fire_selector',
    bomCode: 'FC-05',
    nameZh: '上置双侧联动三档快慢机拨杆 (1 / 2 / A)',
    calloutLabel: '上置三档快慢机(1/2/A)',
    nameEn: 'Upper Ambidextrous 3-Mode Fire Selector (Semi / 2-Burst / Auto)',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-2.85, 2.55, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [0, 9.2, 0] },
      { range: [0.42, 0.75], offset: [-2.5, 1.8, 3.8] },
      { range: [0.75, 1.0], offset: [-1.5, 0.8, 2.6] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.48,
    roleTag: '独立射控解耦设计 · 单发 / 高精度两连发 / 1200RPM全自动',
    description:
      '横穿上机匣中部的独立射击模式选择凸轮轴：将保险功能完全剥离给下方拇指保险杆，专注切换「1」半自动单发、「2」独门高命中率两发超高速点射（双发同落一点）与「A」1,200 发/分暴风全自动齐射。',
  },
  {
    id: 'vector_thumb_safety',
    bomCode: 'FC-06',
    nameZh: '下置双侧人体工学拇指手动保险杆 (S / F)',
    calloutLabel: '双侧拇指手动保险(S/F)',
    nameEn: 'Lower Ambidextrous Ergonomic Thumb Safety Lever (Safe / Fire)',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-8.35, 1.25, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [0, 9.2, 0] },
      { range: [0.42, 0.75], offset: [-5.5, -1.8, 3.8] },
      { range: [0.75, 1.0], offset: [-2.5, -0.6, 2.6] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.48,
    roleTag: '紧贴握把拇指自然扫拨 · 刚性锁死扳机连杆与阻铁',
    description:
      '布置于握把虎口正上方黄金人机位置的双侧对称宽翼手动保险杆：射手无需改变任何快慢机连发/点射预设档位，仅凭拇指上下轻拨即可瞬间解除或锁死扳机传递连杆。',
  },

  // ==================== 4. EXTENDED 25-RD KRISS MAGEX2 .45 ACP MAGAZINE ('magazine' · 4 parts) ====================
  {
    id: 'vector_mag_body',
    bomCode: 'M-01',
    nameZh: '25发Glock-21兼容Kriss MagEx2加长弹匣体',
    calloutLabel: '25发MagEx2 .45弹匣体',
    nameEn: '25-Round Glock-21 Pattern Kriss MagEx2 .45 ACP Magazine Body',
    group: 'magazine',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [4.95, -9.85, 0],
    assembledRot: [0, 0, VECTOR_MAG_ANGLE],
    explodeSteps: [
      { range: [0.02, 0.24], offset: [-4.2, -9.4, 0] },
      { range: [0.35, 0.65], offset: [-2.8, -6.2, 0] },
      { range: [0.65, 1.0], offset: [-1.6, -3.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, 0, 0],
    labelAppearAt: 0.05,
    roleTag: '66° 大倾角前掠双排单进 · 全钢内衬与FDE防滑加长套筒',
    description:
      '100% 通用标准 Glock 21（.45 ACP）手枪弹匣抱弹口与卡笋规格的原厂加长战术弹匣：上半段为全钢内衬炭黑聚合物匣身，下半段卡接沙色防滑凸肋 Kriss MagEx2 扩容护套将容弹量由 13 发倍增至 25 发，背面设 6~25 发余弹观察孔。',
  },
  {
    id: 'vector_mag_follower',
    bomCode: 'M-02',
    nameZh: '高可视橙色阶梯防倾.45 ACP托弹板',
    calloutLabel: '橙色.45防倾托弹板',
    nameEn: 'High-Visibility Orange Anti-Tilt .45 ACP Polymer Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [7.65, -3.78, 0],
    assembledRot: [0, 0, VECTOR_MAG_ANGLE],
    explodeSteps: [
      { range: [0.02, 0.24], offset: [-4.2, -9.4, 0] },
      { range: [0.38, 0.72], offset: [7.2, -5.2, 0] },
      { range: [0.72, 1.0], offset: [3.2, -2.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.44,
    roleTag: '匹配 12.1mm 粗壮弹壳双排交错 · 末发顶起空仓挂机杆',
    description:
      '采用高润滑聚甲醛模压成型的鲜橙色双排阶梯托弹板：左侧前缘设有空仓挂机顶起凸台，打空第 25 发 .45 ACP 弹药后自动向上顶起机匣左侧挂机杆锁停枪机，并发出鲜明空膛视觉提示。',
  },
  {
    id: 'vector_mag_spring',
    bomCode: 'M-03',
    nameZh: '66°斜置加长高劲度螺旋托弹簧',
    calloutLabel: '66°加长弹匣托弹簧',
    nameEn: 'Extended 66° Helical MagEx2 Magazine Drive Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [1.45, -17.7, 0],
    assembledRot: [0, 0, VECTOR_MAG_ANGLE],
    explodeSteps: [
      { range: [0.02, 0.24], offset: [-4.2, -9.4, 0] },
      { range: [0.38, 0.72], offset: [7.8, -15.5, 0] },
      { range: [0.72, 1.0], offset: [3.6, -6.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.46,
    roleTag: '克服 25 发 230gr 重弹柱重力 · 匹配 1200 发/分供弹节拍',
    description:
      '专为 25 发沉重 .45 ACP 弹药柱（满载弹重逾 0.52 kg！）定制的加粗琴钢丝长行程托弹簧：确保在 1,200 发/分极速连发（每 50 毫秒剥离一发粗短圆头大口径实弹）时绝不发生供弹迟滞。',
  },
  {
    id: 'vector_mag_baseplate',
    bomCode: 'M-04',
    nameZh: 'Kriss MagEx2 加厚防摔缓冲弹匣底盖',
    calloutLabel: 'MagEx2 防摔缓冲底板',
    nameEn: 'Extended Kriss MagEx2 Ribbed Impact Bumper Baseplate',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [1.25, -18.15, 0],
    assembledRot: [0, 0, VECTOR_MAG_ANGLE],
    explodeSteps: [
      { range: [0.02, 0.24], offset: [-4.2, -9.4, 0] },
      { range: [0.38, 0.72], offset: [-5.8, -13.5, 0] },
      { range: [0.72, 1.0], offset: [-3.2, -6.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.44,
    roleTag: '抗水泥地战术快换冲击 · 按压锁销秒拆清沙',
    description:
      '卡锁于 MagEx2 扩容护套底缘的加厚耐冲击工程塑料防摔底座：在室内 CQB 快速换弹自由落体砸向坚硬混凝土地面时提供可靠缓冲保护，中心不锈钢弹簧锁柱支持免工具滑拆保养。',
  },
];

// ============================================================================
// 7-Phase KRISS Super V Off-Axis Delayed-Blowback Firing Cycle
// ============================================================================

export const VECTOR_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'vector_phase_1_trigger_hammer',
    stepNum: '01',
    shortLabel: '水平扣机下摆释锤',
    title: '阶段 1 · 高置水平扳机后移，顶置倒装击锤自上而下挥击底置击针',
    range: [0.0, 0.1],
    description:
      '食指扣压位于枪管轴线上方 15.3 mm 的水平行程扳机，双联不锈钢传递连杆牵引顶层阻铁脱钩，倒挂于上机匣内的硬化钢击锤在顶置主簧驱动下高速向下前摆，跨过分界敲击下方浮动击针尾钮。',
  },
  {
    id: 'vector_phase_2_lowbore_ignition',
    stepNum: '02',
    shortLabel: '低膛轴线击发出膛',
    title: '阶段 2 · .45 ACP 230gr 重弹 145 MPa 点火，沿虎口同轴低枪管出膛',
    range: [0.1, 0.2],
    description:
      '底火于 f = 0.11 引燃发射药产生 145 MPa 峰值膛压，推动 230 格令 .45 ACP 全金属被甲弹沿 5.5 英寸低轴线冷锻枪管加速，于 f = 0.19 冲出消焰器——后坐推力线直穿手掌虎口支点，翻转力臂趋近于零！',
  },
  {
    id: 'vector_phase_3_cam_delay',
    stepNum: '03',
    shortLabel: '变角凸轮杠杆延迟',
    title: '阶段 3 · 滑块顶端陡角凸轮槽制造机械劣势，延迟枪机初段开锁',
    range: [0.2, 0.34],
    description:
      '膛底余压向后推压紧凑枪机，枪机两侧圆柱凸轮耳顶入 Super V 钨钢滑块上端陡峭的初始延迟斜面：枪机每后退 1 mm 必须强行将沉重的钨钢配重块向下加速逾 2.6 mm，凭借高机械劣势安全驻留泄压。',
  },
  {
    id: 'vector_phase_4_superv_plunge',
    stepNum: '04',
    shortLabel: '-65°垂直下潜与抛壳',
    title: '阶段 4 · 钨钢滑块沿 -65° 导槽猛潜 64 mm 抵消上跳，胖黄铜壳右抛',
    range: [0.34, 0.54],
    description:
      '越过凸轮拐点后，枪机向后抽壳约 36 mm 并顺弯轨微倾下沉，驱动 Super V 钨钢滑块沿 -65° 垂直井高速向下猛潜 64 mm（ΔX ≈ -27 mm, ΔY ≈ -58 mm），将 -65° 复进簧压缩至 56% 并在 f = 0.44 将 .45 ACP 胖弹壳向右（+Z）抛出！',
  },
  {
    id: 'vector_phase_5_buffer_advance',
    stepNum: '05',
    shortLabel: '井底缓冲与25发托弹',
    title: '阶段 5 · 钨钢滑块触碰井底聚氨酯缓冲垫换向，MagEx2 弹匣上推新弹',
    range: [0.54, 0.66],
    description:
      'Super V 钨钢滑块下潜至垂直导槽最低点平稳触碰聚氨酯吸能缓冲垫止动；与此同时 66° 大倾角 Kriss MagEx2 弹匣内的加长托弹簧将下一发 .45 ACP 实弹推升至抱弹口待命。',
  },
  {
    id: 'vector_phase_6_upward_return',
    stepNum: '06',
    shortLabel: '+65°上推凸轮进弹',
    title: '阶段 6 · 斜置复进簧沿 +65° 顶升钨钢滑块，凸轮反推枪机剥弹入膛',
    range: [0.66, 0.86],
    description:
      '-65° 螺旋复进簧释放蓄能沿 +65° 猛力向上顶升钨钢滑块，上部镜面凸轮槽反向抬升并向前驱动枪机回归水平膛轴线，机头剥离抱弹口首枚 .45 ACP 实弹顺抛光坡道平顺推入弹膛。',
  },
  {
    id: 'vector_phase_7_lockup_reset',
    stepNum: '07',
    shortLabel: '闭膛凸轮锁死复位',
    title: '阶段 7 · 滑块升至死点楔紧枪机闭膛，顶层单发断连器交接复位',
    range: [0.86, 1.0],
    description:
      '钨钢滑块上升归位至 -65° 导槽最高死点，陡角凸轮斜面重新将枪机楔紧抵死于枪管尾端面；松开高置水平扳机后，顶层火控盒单发断连器将倒装击锤平顺交接回主阻铁，完成零跳变闭环待击。',
  },
];

interface SuperVCamSample {
  /** Normalized 0..1 downward plunge of `vector_slider` along `-65°` chute */
  sliderPlunge01: number;
  /** World X translation of `vector_slider` (`-2.705 cm` at full plunge) */
  sliderDX: number;
  /** World Y translation of `vector_slider` (`-5.800 cm` at full plunge) */
  sliderDY: number;
  /** World X translation of `vector_bolt` (`-3.62 cm` at full stroke) */
  boltDX: number;
  /** World Y dip of `vector_bolt` into the curved Super V transition elbow (`-1.16 cm`) */
  boltDY: number;
  /** Pitch rotation of `vector_bolt` (`+0.30 rad`) following the Super V chute elbow */
  boltRZ: number;
}

/**
 * Exact coupled Renaud Kerbrat KRISS Super V variable-angle cam kinematics across `f ∈ [0, 1]`:
 *  - Phase 3 (`[0.20, 0.34]`): Steep upper cam-slot angle enforces ~2.68:1 mechanical-disadvantage
 *    leverage (`boltDX: 0 -> -0.52 cm` vs `sliderDY: 0 -> -1.39 cm`) while chamber pressure drops.
 *  - Phase 4 (`[0.34, 0.54]`): Off-axis `-65°` Super V plunge drives `vector_slider` `6.40 cm`
 *    steeply downward (`ΔX = -2.705 cm, ΔY = -5.800 cm`) while `vector_bolt` strokes `-3.62 cm`
 *    rearward and pitches downward (`boltDY = -1.16 cm, boltRZ = +0.30 rad`) into the chute throat.
 *  - Phase 5–7 (`[0.54, 0.91]`): `vector_recoil_spring` drives `vector_slider` upward `+65°` back
 *    to top dead center (`0.91`), camming `vector_bolt` up onto `boreY` and into battery (`endpointJump === 0`!).
 */
function sampleSuperVCamSystem(f: number): SuperVCamSample {
  // 1. Two-slope variable-leverage cam drive & upward return
  const delayRamp = seg(f, 0.2, 0.34);
  const mainPlunge = seg(f, 0.34, 0.54);
  const upwardMain = seg(f, 0.58, 0.82);
  const finalCamLock = seg(f, 0.82, 0.91);

  const sliderPlunge01 = Math.max(
    0,
    0.24 * delayRamp + 0.76 * mainPlunge - 0.76 * upwardMain - 0.24 * finalCamLock
  );
  const sliderStrokeCm = 6.4 * sliderPlunge01;
  const sliderDX = -sliderStrokeCm * COS_SUPER_V; // -2.705 cm at peak
  const sliderDY = -sliderStrokeCm * SIN_SUPER_V; // -5.800 cm at peak

  // 2. Coupled Cam-Trunnion Bolt horizontal stroke + transition-elbow downward pitch
  const boltDX =
    -0.52 * (delayRamp - finalCamLock) - 3.1 * (mainPlunge - upwardMain);
  const elbowDip01 = Math.max(0, seg(f, 0.39, 0.54) - seg(f, 0.58, 0.74));
  const boltDY = -1.16 * elbowDip01;
  const boltRZ = 0.3 * elbowDip01;

  return {
    sliderPlunge01,
    sliderDX,
    sliderDY,
    boltDX,
    boltDY,
    boltRZ,
  };
}

export function computeVectorFiringKinematics(
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

  const cam = sampleSuperVCamSystem(f);

  // Horizontal-travel pivoting trigger (`triggerY = +0.58`, above `boreY = -0.95`!)
  const trigPull = seg(f, 0.0, 0.085) - seg(f, 0.9, 0.965);
  // 25-rd MagEx2 .45 ACP upward feed pulse along +66°
  const magPulse = seg(f, 0.53, 0.65) - seg(f, 0.8, 0.93);

  switch (partId) {
    case 'vector_bolt': {
      dx = cam.boltDX;
      dy = cam.boltDY;
      rz = cam.boltRZ;
      break;
    }

    case 'vector_firing_pin': {
      // Inertial forward primer strike (+0.34 cm) at [0.075, 0.11] before tracking bolt stroke
      const strike = seg(f, 0.075, 0.11) - seg(f, 0.145, 0.2);
      dx = cam.boltDX + 0.34 * strike;
      dy = cam.boltDY;
      rz = cam.boltRZ;
      break;
    }

    case 'vector_slider': {
      // Patented -65° Super V downward counterweight plunge: ΔX = -2.705 cm, ΔY = -5.800 cm!
      dx = cam.sliderDX;
      dy = cam.sliderDY;
      break;
    }

    case 'vector_recoil_spring': {
      // Local X-axis spring [0, 14.55] angled at +65°, bottom pinned at local x = 0:
      // 6.40 cm plunge compresses 14.55 -> 8.15 cm (`scaleX: 1.000 -> 0.560`!)
      const L0 = 14.55;
      scaleX = (L0 - 6.4 * cam.sliderPlunge01) / L0;
      break;
    }

    case 'vector_trigger': {
      dx = -0.48 * trigPull;
      rz = -0.14 * trigPull;
      break;
    }

    case 'vector_hammer': {
      // Inverted top-mounted hammer swings DOWNWARD & FORWARD (`rz = +0.82 rad`) onto firing pin
      // at [0.055, 0.102], then recoiling bolt roof cams it back UPWARD [0.34, 0.46] onto sear!
      const swingDown = seg(f, 0.055, 0.102);
      const recockUp = seg(f, 0.34, 0.46);
      const searSettle = seg(f, 0.91, 0.965);
      rz = 0.82 * swingDown - 0.88 * recockUp + 0.06 * searSettle;
      break;
    }

    case 'vector_hammer_spring': {
      // Pinned at rear FCU seat (local x = 0): extends on hammer drop (1.16) & compresses on recock (0.86)
      const drop = seg(f, 0.055, 0.102) - seg(f, 0.34, 0.46);
      const overcock = Math.sin(linearSeg(f, 0.38, 0.54) * Math.PI);
      scaleX = 1 + 0.16 * drop - 0.14 * overcock;
      break;
    }

    case 'vector_mag_follower': {
      // Advances one .45 ACP pitch (+0.62 cm) up along +66° magazine channel
      dx = 0.62 * COS_MAG * magPulse;
      dy = 0.62 * SIN_MAG * magPulse;
      break;
    }

    case 'vector_mag_spring': {
      // Angled 66° helical spring (`w = 1`, pinned at baseplate `start = 0`): expands `1.0 -> 1.095`
      scaleX = 1 + 0.095 * magPulse;
      break;
    }

    // Fixed 5.5" barrel, muzzle device, non-reciprocating charging handle, guide rod, shells & stock stay stationary
    default:
      break;
  }

  const snap0 = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  return {
    pos: [snap0(dx), snap0(dy), dz],
    rot: [rx, ry, snap0(rz)],
    scaleX: Math.abs(scaleX - 1) < 1e-9 ? 1 : scaleX,
  };
}

/**
 * Computes `.45 ACP` (230 gr FMJ, 145 MPa SAAMI) low-bore internal & external ballistics for KRISS Vector:
 *  - `ignitionF = 0.11`, `muzzleExitF = 0.19` along low bore `Y = -0.95` (`X: +11.35 -> +26.10`)
 *  - Delayed-blowback extraction + fat `.45 ACP` brass `+Z` right-flank ejection at `ejectF = 0.44`
 *  - Steep `66°` Glock-21 / MagEx2 magazine presentation (`[+7.95, -2.15, 0]`) -> low-bore chambering!
 */
export function computeVectorBallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const cam = sampleSuperVCamSystem(f);

  // 1. 230gr .45 ACP FMJ Projectile along low bore axis Y = -0.95 (ignitionF = 0.11, muzzleExitF = 0.19!)
  const bulletVisible = f < 0.38;
  let bulletX = 11.35;
  let streakLength = 0;

  if (f >= 0.11 && f < 0.19) {
    const u = Math.pow(linearSeg(f, 0.11, 0.19), 1.28);
    bulletX = 11.35 + 14.75 * u; // Exits flash suppressor tip X = +26.10 at f = 0.19!
    streakLength = 3.6 * u;
  } else if (f >= 0.19 && f < 0.38) {
    const u = linearSeg(f, 0.19, 0.38);
    bulletX = 26.1 + 52.0 * u;
    streakLength = 7.8 * (1 - u * 0.45);
  }

  // 2. Fat .45 ACP Brass Case — Delayed Extraction & +Z Right-Flank Ejection (`ejectF = 0.44`!)
  const spentCaseVisible = f < 0.78;
  let caseX = 10.85;
  let caseY = VECTOR_BORE_Y;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.2 && f < 0.44) {
    caseX = 10.85 + cam.boltDX;
    caseY = VECTOR_BORE_Y + cam.boltDY * 0.35;
    caseRZ = cam.boltRZ * 0.4;
  } else if (f >= 0.44 && f < 0.78) {
    const u = linearSeg(f, 0.44, 0.78);
    const camAtEject = sampleSuperVCamSystem(0.44);
    const xAtEject = 10.85 + camAtEject.boltDX;
    caseX = xAtEject + 2.2 * u;
    caseY = VECTOR_BORE_Y + 5.6 * u - 11.4 * u * u;
    caseZ = 13.6 * u;
    caseRX = u * 6.8;
    caseRY = -u * 9.6;
    caseRZ = -u * 8.2;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.78);
    }
  }

  // 3. Low-Bore Chamber Ignition Flash & .45 ACP Muzzle Plume (zero gas tap — off-axis delayed blowback!)
  let chamberFlashIntensity = 0;
  if (f >= 0.105 && f <= 0.185) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.105, 0.185) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.185 && f <= 0.275) {
    const u = linearSeg(f, 0.185, 0.275);
    muzzlePlumeScale = 0.44 + 1.32 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.82;
  }

  // 4. Next .45 ACP Cartridge: 66° MagEx2 Feed Lips [7.95, -2.15, 0] -> Low-Bore Chamber [10.85, -0.95, 0]!
  let nextX = 7.95;
  let nextY = -2.15;
  let nextRZ = 0.18;

  if (f >= 0.54 && f < 0.66) {
    const u = seg(f, 0.54, 0.66);
    nextX = 7.95 + (8.12 - 7.95) * u;
    nextY = -2.15 + (-1.72 - -2.15) * u;
    nextRZ = 0.18 + 0.04 * u;
  } else if (f >= 0.66 && f < 0.88) {
    const u = seg(f, 0.66, 0.88);
    nextX = 8.12 + (10.85 - 8.12) * u;
    nextY = -1.72 + (VECTOR_BORE_Y - -1.72) * u;
    nextRZ = 0.22 * (1 - u);
  } else if (f >= 0.88) {
    nextX = 10.85;
    nextY = VECTOR_BORE_Y;
    nextRZ = 0;
  }

  // 5. Reserve .45 ACP Cartridge advancing up 66° MagEx2 stack
  const magShift = seg(f, 0.54, 0.68);
  const resX = 7.42 + (7.95 - 7.42) * magShift;
  const resY = -3.32 + (-2.15 - -3.32) * magShift;
  const resZ = 0.08 * (1 - magShift);

  return {
    bulletVisible,
    bulletPos: [bulletX, VECTOR_BORE_Y, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity: 0,
    gasPortPos: [10.85, VECTOR_BORE_Y, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, resZ],
  };
}

const VECTOR_HOUSING_BUNDLE: PbrBindingSpec = {
  albedoFile: 'vector_housing_albedo.webp',
  normalFile: 'vector_housing_normal.webp',
  roughnessFile: 'vector_housing_roughness.webp',
  normalScale: 0.46,
};

const VECTOR_INTERNALS_BUNDLE: PbrBindingSpec = {
  albedoFile: 'vector_internals_albedo.webp',
  normalFile: 'vector_internals_normal.webp',
  roughnessFile: 'vector_internals_roughness.webp',
  normalScale: 0.42,
};

export const VECTOR_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  vector_lower_chassis: { ...VECTOR_HOUSING_BUNDLE, normalScale: 0.52 },
  vector_upper_housing: { ...VECTOR_HOUSING_BUNDLE, normalScale: 0.44 },
  vector_folding_stock: { ...VECTOR_HOUSING_BUNDLE, normalScale: 0.48 },
  vector_front_sight: { ...VECTOR_HOUSING_BUNDLE, normalScale: 0.36 },
  vector_rear_sight: { ...VECTOR_HOUSING_BUNDLE, normalScale: 0.36 },
  vector_slider: { ...VECTOR_INTERNALS_BUNDLE, normalScale: 0.46 },
  vector_bolt: { ...VECTOR_INTERNALS_BUNDLE, normalScale: 0.42 },
  vector_barrel: { ...VECTOR_INTERNALS_BUNDLE, normalScale: 0.4 },
  vector_muzzle_device: { ...VECTOR_INTERNALS_BUNDLE, normalScale: 0.42 },
  vector_charging_handle: { ...VECTOR_INTERNALS_BUNDLE, normalScale: 0.44 },
  vector_mag_body: { ...VECTOR_INTERNALS_BUNDLE, normalScale: 0.5 },
  vector_mag_baseplate: { ...VECTOR_INTERNALS_BUNDLE, normalScale: 0.48 },
};

export const VECTOR_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'vector_housing',
    weapon: VECTOR_ID,
    titleCn: '战斗沙色/哑光炭黑双色Super V聚合物机匣、全长导轨与Gen II折叠托贴图组',
    partTag: 'F-01 / F-02 / F-08 SUPER V CHASSIS & GEN II STOCK',
    resolution: '2048 × 1024 px',
    summary:
      '专为 KRISS Vector SMG Gen II 标志性分体未来主义构型烘焙的 2K 5 通道 Packed ORM 贴图组：下半幅呈现双色战斗沙色（Combat FDE）与哑光炭黑（Matte Charcoal）35% 玻纤聚酰胺下机匣、-65° 模压几何加强肋、握把高摩擦激光微点蚀纹以及「KRISS USA INC · VIRGINIA BEACH, VA · VECTOR SMG .45 ACP · SUPER V RECOIL MITIGATION」原厂凹刻铭牌；中上幅分离上机匣红白「1 / 2 / A」三档射控图标、「S / F」保险标识、MIL-STD-1913 导轨 T 槽编码与 Gen II 横槽硫化橡胶抵肩垫。',
    highlights: [
      '双色 Combat FDE / Matte Charcoal 玻纤聚合物、-65° 结构加强肋与弗吉尼亚海滩原厂铭印',
      '上机匣「1 / 2 / A」（单发/两连发/1200RPM连发）红白射控图标与全长导轨 CNC 棱边磨损',
      'Gen II 镂空折叠枪托 PA66-GF35 皮纹与横槽硫化橡胶肩垫 (0.78) 物理粗糙度分离',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'vector_housing_albedo.webp',
        note: 'sRGB · 双色战斗沙色 FDE 与炭黑玻纤聚合物机匣 / 1-2-A 红白射控填漆',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'vector_housing_normal.webp',
        note: 'Linear · -65° 模压加强肋 + 激光微点握把防滑纹 + 原厂凹刻铭文',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'vector_housing_roughness.webp',
        note: 'Linear · R:高度积分AO / G:阳极铝导轨(0.38)-FDE聚合物(0.60)-橡胶垫(0.78) / B:金属度',
      },
    ],
  },
  {
    id: 'vector_internals',
    weapon: VECTOR_ID,
    titleCn: '钨钢Super V下潜滑块镜面凸轮槽、氮化凸轮耳枪机与MagEx2弹匣贴图组',
    partTag: 'S-05 / S-03 / S-01 / M-01 SUPER V SLIDER & MAGEX2',
    resolution: '2048 × 1024 px',
    summary:
      '真实还原 KRISS Super V 轴外延迟自动机精密内件的 2K 5 通道 ORM 贴图组：上半幅刻画五轴 CNC 铣削钨灰色配重滑块基体与镜面研磨变角度凸轮槽（严格标定金属度 B=0.92、粗糙度 G=0.22 高反光轴承轨道）；中栏呈现 QPQ 盐浴黑氮化 .45 ACP 凸轮耳枪机、5.5 英寸冷锻枪管与 C26000 黄铜折叠拉机柄铰链；底栏刻画 25 发 Kriss MagEx2 加长弹匣肋套及透出黄铜弹壳的「6 · 10 · 13 · 18 · 25」余弹观察窗。',
    highlights: [
      '五轴 CNC 钨钢下潜配重滑块与镜面抛光变角凸轮槽 (B=0.92, G=0.22) 物理反差',
      'QPQ 黑氮化 .45 ACP 凸轮耳枪机/5.5" 枪管与 C26000 黄铜折叠拉机柄转轴高光',
      '25 发 Kriss MagEx2 扩容弹匣余弹观察孔透视 .45 ACP 黄铜弹壳与刻度标识',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'vector_internals_albedo.webp',
        note: 'sRGB · 钨灰CNC下潜滑块 / 镜面凸轮槽 / 黑氮化枪机 / 黄铜铰链与MagEx2余弹孔',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'vector_internals_normal.webp',
        note: 'Linear · 五轴端铣刀痕 + -65° 凸轮滑动微擦痕 + MagEx2 观察孔与防滑肋凹凸',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'vector_internals_roughness.webp',
        note: 'Linear · 镜面凸轮槽精准标定 (G=0.22, B=0.92) vs 钨钢基体(0.31) vs 匣套(0.56)',
      },
    ],
  },
  {
    id: 'vector_seamless_detail',
    weapon: VECTOR_ID,
    titleCn: '顶置不锈钢火控架、倒装回转击锤与三组螺旋弹簧无缝细节贴图',
    partTag: '13 TOP-DECK FCG & SPRING PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为顶置不锈钢模块化火控副车架、倒装回转击锤、高置水平行程扳机、双侧快慢机/拇指保险、四枚快拆横销、-65° 斜置导杆及三组琴钢丝螺旋弹簧提供微米级 CNC 金属拉丝与橙色托弹板注塑皮纹。',
    highlights: [
      '顶置不锈钢火控副车架、倒装击锤与 -65° 无心磨削导杆精细金属拉丝',
      '双侧三档快慢机拨杆、拇指保险与右折铰链座 CLP 枪油光泽起伏',
      '覆盖其余全部 13 个核心运动内件与高可视橙色防倾托弹板',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于顶置不锈钢火控架/倒装击锤/水平扳机/-65°导杆/快拆销等',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 硬化钢、不锈钢与弹簧钢表面微粗糙度油膜变化',
      },
      {
        kind: 'Normal',
        labelCn: '工程聚合物皮纹法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于高可视橙色阶梯防倾托弹板微表面纹理',
      },
    ],
  },
];

export const VECTOR_PLUGIN: WeaponRuntimePlugin = {
  id: VECTOR_ID,
  partGroups: VECTOR_PART_GROUPS,
  timelinePresets: VECTOR_TIMELINE_PRESETS,
  parts: VECTOR_PARTS,
  firingPhases: VECTOR_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(VECTOR_FIRING_PHASES, f),
  computeFiringKinematics: computeVectorFiringKinematics,
  computeBallisticsState: computeVectorBallisticsState,
  pbrBindings: VECTOR_PBR_BINDINGS,
  pbrSuites: VECTOR_PBR_SUITES,
};
