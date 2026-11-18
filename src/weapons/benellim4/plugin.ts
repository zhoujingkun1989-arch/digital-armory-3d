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
import { BENELLIM4_STOCK_ANGLE } from './meshes/benellim4Geometries';

export const BENELLIM4_ID = 'benellim4' as unknown as WeaponId;
export const BENELLIM4_CALIBER = '12_gauge' as unknown as CaliberProfile;

export const BENELLIM4_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '18.5"枪管、ARGO双短活塞与回转枪机组',
    nameEn: '18.5" Barrel, Twin ARGO Pistons & Rotating Bolt Group',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '硬质阳极氧化机匣、鬼环瞄具与M1014伸缩托组',
    nameEn: 'Hard-Anodized Receiver, Ghost-Ring Sights & M1014 Telestock',
    badgeColor: '#94a3b8',
  },
  {
    key: 'fire_control',
    nameZh: '快拆铝合金火控盒与弹仓止弹释放联动组',
    nameEn: 'Removable Trigger Pack & Shell Release Linkage',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '7发管式弹仓与不锈钢升降托弹板总成',
    nameEn: '7-Rd Underbarrel Tubular Mag & Shell Carrier Elevator',
    badgeColor: '#fb923c',
  },
];

export const BENELLIM4_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: 'Benelli M4 Super 90（美军制式 M1014 联合勤务战斗霰弹枪）标准待击合拢态：18.5 英寸冷锻镀铬滑膛枪管下并列布置双对称不锈钢 ARGO 自调节导气室与 7 发管式弹仓，M1014 镂空伸缩托完全展开（全长 886 mm）。',
  },
  {
    id: 'field_strip',
    label: '一级野战快拆',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '遵循美国海军陆战队 TM 10698A-10/1 教范免工具野战分解：旋下弹仓端盖，前抽拆下带双 ARGO 导气座的 18.5 英寸枪管与两片式防滑护木，拔出右侧滚花拉机柄抽离回转枪机框，并推出横销取下火控盒。',
  },
  {
    id: 'sub_assembly',
    label: '二级ARGO与枪机分解',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '旋开双联自调节导气螺塞抽出两枚不锈钢开槽短行程顶杆活塞（ARGO Tappets），拔出凸轮销分离双突笋硬铬回转枪机头与浮动长击针，并由管式弹仓抽出水平托弹簧与橙红铝合金托弹杯。',
  },
  {
    id: 'full_exploded',
    label: '全枪 26 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 26 个精密军械构件零干涉展开：从双通道 ARGO 短活塞、硬铬双突笋枪机、LPA 护翼鬼环照门、三档刻槽斜置复进尾管、镂空贴腮伸缩托到叉形不锈钢升降托弹舌，完整诠释人类最可靠的半自动战斗霰弹枪架构。',
  },
];

export const BENELLIM4_PARTS: WeaponPartSpec[] = [
  // ==================== 1. 18.5" BARREL, TWIN ARGO PISTONS & ROTATING BOLT ('slide' · 9 parts) ====================
  {
    id: 'benellim4_barrel',
    bomCode: 'B-01',
    nameZh: '18.5英寸镀铬枪管与双ARGO导气箍总成',
    calloutLabel: '18.5"镀铬枪管与ARGO座',
    nameEn: '18.5" Chrome-Lined 12ga Barrel w/ Dual ARGO Gas Block',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 1.35, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [15.5, 6.2, 0] },
      { range: [0.35, 0.65], offset: [5.5, 3.2, 0] },
      { range: [0.65, 1.0], offset: [4.5, 2.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [28.0, 1.2, 0],
    labelAppearAt: 0.05,
    roleTag: '470mm Crio深冷镀铬滑膛 · 弹膛前双对称ARGO高压引气',
    description:
      '全长 470 mm（18.5 英寸）深冷处理（Crio）内膛镀硬铬锰磷化合金钢枪管（内径 18.5 mm，兼容 70 mm / 76 mm 马格南霰弹与内置收束器），后端刚性旋装硬铬双突笋闭锁节套；弹膛正前方枪管腹下并联精铸左右对称双不锈钢导气室，直接截取高温纯净火药燃气，无需任何手动调节即可通吃轻装战术弹与重装独头弹。',
  },
  {
    id: 'benellim4_argo_pistons',
    bomCode: 'B-02',
    nameZh: '双联对称不锈钢开槽短行程活塞',
    calloutLabel: '双ARGO短行程活塞',
    nameEn: 'Twin Symmetrical Stainless Fluted ARGO Tappet Pistons',
    group: 'slide',
    material: 'stainless',
    assembledPos: [15.2, 0.12, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [15.5, 6.2, 0] },
      { range: [0.34, 0.62], offset: [-7.0, -1.4, 0] },
      { range: [0.65, 1.0], offset: [1.5, 1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [1.5, 0.4, 1.18],
    labelAppearAt: 0.34,
    roleTag: '15mm 短行程双路同步冲击 · 纵向刮碳槽免维护自洁',
    description:
      'Benelli M4 独步天下的 A.R.G.O.（Auto-Regulating Gas-Operated，美国专利 US 5,827,992）核心：左右并列的两枚 17-4PH 耐蚀不锈钢短行程顶杆活塞，射击时仅向后急促冲撞约 15 mm，尾杆穿过机匣前隔板平衡撞击枪机框双肩台面，彻底消除单活塞偏心翻转力矩与机匣积碳。',
  },
  {
    id: 'benellim4_argo_plugs',
    bomCode: 'B-03',
    nameZh: '双联滚花ARGO导气室端盖与自调泄压阀',
    calloutLabel: '双ARGO自调泄压塞',
    nameEn: 'Twin Knurled ARGO Gas Cylinder End-Caps & Exhaust Valves',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [23.1, 0.12, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [15.5, 6.2, 0] },
      { range: [0.32, 0.58], offset: [14.5, -1.8, 0], rotation: [1.2, 0, 0] },
      { range: [0.65, 1.0], offset: [6.0, -0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [0.4, 0.62, 1.18],
    labelAppearAt: 0.34,
    roleTag: '弹簧定压自动泄流 · 轻重装药恒定后坐冲量',
    description:
      '旋锁于双联 ARGO 导气筒前端的菱形滚花螺塞，内置精密预紧碟簧排气阀：发射高膛压 3 英寸马格南鹿弹时提前开启前泄气孔排走多余燃气，发射低威力警用橡胶弹/轻装弹时保持全压做功，实现全自动气压稳压。',
  },
  {
    id: 'benellim4_bolt_carrier',
    bomCode: 'B-04',
    nameZh: '重型机加工钢枪机框与铰接复进连杆',
    calloutLabel: '重型枪机框与尾连杆',
    nameEn: 'Heavy Machined Steel Bolt Carrier & Hinged Recoil Link',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [1.2, 1.35, 0],
    explodeSteps: [
      { range: [0.16, 0.3], offset: [0, 6.8, 0] },
      { range: [0.35, 0.65], offset: [-1.8, 2.2, 0] },
      { range: [0.65, 1.0], offset: [-1.2, 1.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0.5, 0.85, 0],
    labelAppearAt: 0.18,
    roleTag: '双前肩承受ARGO冲击 · 螺旋凸轮槽解锁与鼠尾连杆压缩复进簧',
    description:
      '高刚性铣削合金钢枪机框：前下方伸出左右对称双承撞柱正对双 ARGO 活塞尾杆，顶部铣有 38° 螺旋导槽（含安全自由行程段）驱动枪机头回转开闭锁，尾部铰接斜向下方的不锈钢复进连杆（Rat-Tail Link）将水平后坐力导入枪托斜置复进管。',
  },
  {
    id: 'benellim4_bolt_head',
    bomCode: 'B-05',
    nameZh: '硬铬双突笋回转闭锁枪机头与抽壳钩',
    calloutLabel: '硬铬双突笋回转枪机',
    nameEn: 'Hard-Chrome 2-Lug Rotating Bolt Head & Claw Extractor',
    group: 'slide',
    material: 'stainless',
    assembledPos: [5.4, 1.35, 0],
    explodeSteps: [
      { range: [0.16, 0.3], offset: [0, 6.8, 0] },
      {
        range: [0.36, 0.64],
        offset: [8.8, 2.4, 0],
        rotation: [0.66, 0, 0],
      },
      { range: [0.65, 1.0], offset: [3.2, 1.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [0.8, 1.15, 0],
    labelAppearAt: 0.36,
    roleTag: '38° 刚性双突笋咬合节套 · 宽爪抽壳钩强力拔壳',
    description:
      '通体镀硬铬自润滑的双突笋回转闭锁枪机头：闭锁时上下两枚大截面闭锁突笋旋入枪管节套闭锁槽刚性承受 12 号霰弹膛压；开锁期间绕轴旋转约 38°（0.66 rad）脱离节套，右侧宽大弹簧抽壳钩死死扣住黄铜底缘拉出空弹壳。',
  },
  {
    id: 'benellim4_cam_pin',
    bomCode: 'B-06',
    nameZh: '圆柱形硬化钢枪机开闭锁凸轮销',
    calloutLabel: '枪机开闭锁凸轮销',
    nameEn: 'Hardened Cylindrical Bolt Cam Pin',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [3.2, 2.08, 0],
    explodeSteps: [
      { range: [0.16, 0.3], offset: [0, 6.8, 0] },
      { range: [0.35, 0.62], offset: [3.2, 6.4, 0] },
      { range: [0.65, 1.0], offset: [1.2, 3.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    labelAppearAt: 0.38,
    roleTag: '螺旋轨迹平移转回转 · 机械阻断未闭锁击针通路',
    description:
      '垂直穿入枪机头尾柄并滑动于枪机框螺旋凸轮槽内的精密硬化钢横销：不仅将枪机框直线运动转化为枪机头 38° 回转，销轴中段通孔更构成物理不到位保险——枪机未完全旋转闭锁前直接挡死击针前冲。',
  },
  {
    id: 'benellim4_firing_pin',
    bomCode: 'B-07',
    nameZh: '浮动式高强工具钢长击针',
    calloutLabel: '浮动式钢制长击针',
    nameEn: 'Floating Tool-Steel Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0.95, 1.35, 0],
    explodeSteps: [
      { range: [0.16, 0.3], offset: [0, 6.8, 0] },
      { range: [0.36, 0.64], offset: [-14.2, 2.4, 0] },
      { range: [0.65, 1.0], offset: [-6.4, 1.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 50,
    labelAppearAt: 0.38,
    roleTag: '轴向贯穿枪机框 · 防惯性走火限位环',
    description:
      '贯穿重型枪机框与双突笋枪机头中轴孔的阶梯形耐冲击工具钢长击针：中段设有防惯性走火回位簧止挡环，确保猛烈推弹上膛闭锁瞬间击针尖不越出镜面误触底火。',
  },
  {
    id: 'benellim4_charging_handle',
    bomCode: 'B-08',
    nameZh: '右侧防滑滚花自转战术拉机柄',
    calloutLabel: '滚花自转战术拉机柄',
    nameEn: 'Knurled Rotating Tactical Bolt Handle (+Z)',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [3.6, 1.5, 1.65],
    explodeSteps: [
      { range: [0.1, 0.24], offset: [0, 1.4, 5.2] },
      { range: [0.65, 1.0], offset: [1.6, 2.2, 2.8] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.14,
    roleTag: '戴厚手套顺畅拉栓 · 弹簧钢珠卡锁免工具旋转拔出',
    description:
      'M1014 标志性的粗壮圆柱滚花右侧拉机柄：外套筒可在戴防寒/战术手套拉栓时自由自转减少磨手；野战快拆只需克服内部弹簧定位珠向外旋转轻拔即可取出，从而释放枪机框。',
  },
  {
    id: 'benellim4_recoil_spring',
    bomCode: 'B-09',
    nameZh: '斜置枪托尾管螺旋复进簧与顶杯',
    calloutLabel: '斜置尾管螺旋复进簧',
    nameEn: 'Angled Stock-Tube Helical Recoil Spring & Plunger',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-29.8, -4.48, 0],
    assembledRot: [0, 0, BENELLIM4_STOCK_ANGLE],
    explodeSteps: [
      { range: [0.36, 0.64], offset: [-11.5, 8.8, 0] },
      { range: [0.65, 1.0], offset: [-7.5, 6.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [10.8, 0.56, 0],
    labelAppearAt: 0.4,
    roleTag: '14° 下倾尾管长行程蓄能 · 驱动剥弹上膛与回转闭锁',
    description:
      '收纳于 14° 下倾机匣延伸尾管内的多圈高疲劳琴钢丝螺旋复进簧及前端不锈钢承推顶杯：后坐时经枪机框鼠尾连杆推动沿尾管轴线压缩蓄能，复进时平顺推顶自动机剥离托弹板上的 12 号新弹入膛闭锁。',
  },

  // ==================== 2. HARD-ANODIZED RECEIVER, SIGHTS & M1014 STOCK ('frame' · 7 parts) ====================
  {
    id: 'benellim4_receiver',
    bomCode: 'F-01',
    nameZh: 'MIL-STD硬质阳极氧化7075铝合金机匣',
    calloutLabel: '硬质阳极氧化铝机匣',
    nameEn: 'MIL-STD Type-III Anodized 7075-T6 Aluminum Receiver',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-1.5, 2.75, 0],
    labelAppearAt: 0.04,
    roleTag: '全枪拆解零位基准 · 3英寸宽大右抛壳窗与喇叭装弹口',
    description:
      '整块航空级 7075-T6 铝合金锻坯 CNC 铣削并经军规 MIL-STD-8625 Type-III 哑光深炭灰硬质阳极氧化处理（耐海水盐雾腐蚀）：右侧开设带导壳凸块的 3 英寸马格南大抛壳窗，腹下设倒角喇叭口快速塞弹通道，左壁激光精刻意大利乌尔比诺原厂铭文，右壁标刻美军 U.S. M1014 联合勤务验收码。',
  },
  {
    id: 'benellim4_picatinny_rail',
    bomCode: 'F-02',
    nameZh: '机匣顶置MIL-STD-1913皮卡汀尼导轨',
    calloutLabel: '顶置MIL-STD-1913导轨',
    nameEn: 'Top MIL-STD-1913 Picatinny Optic Rail',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [{ range: [0.66, 0.96], offset: [1.2, 5.2, 0] }],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [2.2, 3.32, 0],
    labelAppearAt: 0.68,
    roleTag: 'T2-T14 激光槽位编号 · 兼容红点全息镜且不挡鬼环瞄具',
    description:
      '由四枚沉头不锈钢螺钉锁固在机匣顶桥上的军标 MIL-STD-1913 皮卡汀尼光学导轨，纵向开有中央让位瞄准沟槽，可在加装 Aimpoint / EOTech 战术红点镜底座的同时保留原厂机械鬼环应急视野。',
  },
  {
    id: 'benellim4_front_sight',
    bomCode: 'F-03',
    nameZh: '双护翼氚光白点鬼环机械准星座',
    calloutLabel: '双护翼氚光前准星',
    nameEn: 'Protective-Wing Tritium Ghost-Ring Front Sight',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [51.6, 2.55, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [15.5, 6.2, 0] },
      { range: [0.35, 0.65], offset: [5.5, 3.2, 0] },
      { range: [0.68, 0.98], offset: [5.5, 6.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.7,
    roleTag: '外扩防撞钢护耳 · 昼夜高对比氚光柱状准星',
    description:
      '银焊固定于 18.5 英寸枪管近膛口上方的高耸军用准星座：左右对称外倾加厚锰磷化钢护翼可抵御破门巷战剧烈磕碰，中央准星柱镶嵌白圈氚光管并由防松螺母允许风偏微调。',
  },
  {
    id: 'benellim4_rear_sight',
    bomCode: 'F-04',
    nameZh: '意大利LPA护翼全可调鬼环觇孔照门',
    calloutLabel: 'LPA全可调鬼环照门',
    nameEn: 'LPA Winged Adjustable Ghost-Ring Aperture Sight',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-7.8, 2.82, 0],
    explodeSteps: [{ range: [0.68, 0.98], offset: [-4.8, 6.8, 0] }],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.7,
    roleTag: '大孔径近战秒瞄鬼环 · 弹尖即可调节风偏高低鼓轮',
    description:
      '意大利名厂 LPA 专为 Benelli M4 定制的重型护翼鬼环（Ghost-Ring）觇孔后照门：宽大薄壁圆环贴近射手瞳孔时自然虚化为“幽灵光环”，令双眼瞬间将前氚光白点套入目标，高低与风偏调节螺盘无需专用工具仅凭实弹底缘即可旋拧归零。',
  },
  {
    id: 'benellim4_forend',
    bomCode: 'F-05',
    nameZh: '两片式玻纤增强防滑肋纹战术护木',
    calloutLabel: '两片式防滑肋纹护木',
    nameEn: '2-Piece Glass-Reinforced Ribbed Polymer Forend',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [21.5, -0.35, 0],
    explodeSteps: [
      { range: [0.08, 0.28], offset: [11.5, -7.8, 0] },
      { range: [0.65, 1.0], offset: [4.2, -6.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -2.4, 0],
    labelAppearAt: 0.1,
    roleTag: '全包覆隔热保护双ARGO气室 · 横向深防滑肋与底排气百叶',
    description:
      '左右对合卡接于枪管导气箍与机匣前壁之间的高耐热玻纤增强尼龙战术护木：内腔精准包裹左右双联 ARGO 不锈钢导气筒隔绝高温烫手，底部开设两排散热泄气百叶槽，外侧密布横向防滑凸肋确保泥水血污环境下稳固控枪。',
  },
  {
    id: 'benellim4_recoil_tube',
    bomCode: 'F-06',
    nameZh: '三档刻槽斜置复进尾管与防滑手枪握把',
    calloutLabel: '三档复进管与战术握把',
    nameEn: '3-Position Notched Recoil Tube & Stippled M1014 Pistol Grip',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-10.4, 0.35, 0],
    explodeSteps: [{ range: [0.66, 0.96], offset: [-6.8, -3.2, 0] }],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [-2.8, -9.8, 0],
    labelAppearAt: 0.68,
    roleTag: '旋转滑移三档锁槽 · 包胶菱纹独立手枪握把',
    description:
      '旋入机匣尾壁的高强合金钢 14° 下倾复进延伸管与直接旋锁其前端的包胶工程塑料独立手枪握把：尾管外壁精密铣出展开、防弹衣中档与全缩携行三道螺旋定位槽（早期民用限缩版无槽，军用 M1014 标配三槽），握把表面覆以高摩擦激光微点防滑层。',
  },
  {
    id: 'benellim4_telestock',
    bomCode: 'F-07',
    nameZh: 'M1014镂空伸缩枪托、弹性贴腮板与橡胶肩垫',
    calloutLabel: 'M1014镂空贴腮伸缩托',
    nameEn: 'M1014 Skeletonized Collapsible Buttstock & Cheekpiece',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-27.6, -3.95, 0],
    explodeSteps: [
      { range: [0.08, 0.26], offset: [-10.5, -2.4, 0] },
      { range: [0.65, 1.0], offset: [-14.2, -3.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-1.5, 2.8, 0],
    labelAppearAt: 0.1,
    roleTag: '按键旋滑瞬缩114mm · 抬高贴腮鞍座与厚重吸能胶垫',
    description:
      '美军海军陆战队 M1014 最具视觉冲击力的标志性镂空伸缩尾托：按压右侧大圆锁钮顺时针微旋 45° 即可将全枪长由 886 mm 瞬缩至 772 mm 适应装甲车舱与狭窄室内破门；顶部集成柔韧弹性体高贴腮鞍座对齐鬼环瞄线，尾端厚实横纹硫化橡胶垫大幅缓冲 12 号重装鹿弹猛烈后坐。',
  },

  // ==================== 3. REMOVABLE TRIGGER PACK & SHELL RELEASE ('fire_control' · 5 parts) ====================
  {
    id: 'benellim4_trigger_housing',
    bomCode: 'FC-01',
    nameZh: '可快拆阳极氧化铝扳机护圈盒与横销',
    calloutLabel: '快拆铝合金火控盒',
    nameEn: 'Removable Anodized Alloy Trigger Housing & Pin',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-6.1, -2.15, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [0, -7.2, 0] },
      { range: [0.65, 1.0], offset: [-0.8, -2.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [0, -2.4, 0],
    labelAppearAt: 0.16,
    roleTag: '单销免工具整盒下拆 · 集成冬季大护圈与右侧止弹笋',
    description:
      '仅靠一枚带卡簧横销与前定位耳嵌锁在机匣腹下的模块化铝合金火控底座（可用拉机柄尖直接顶出横销整盒取下清沙！），集成戴厚手套可操作的宽大扳机护圈及右侧管式弹仓止弹卡笋杆（Shell Stop Latch）。',
  },
  {
    id: 'benellim4_trigger',
    bomCode: 'FC-02',
    nameZh: '弧形战斗扳机与半自动单发断连器',
    calloutLabel: '弧形扳机与单发断连器',
    nameEn: 'Curved Combat Trigger & Semi-Auto Disconnector',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-6.2, -2.65, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [0, -7.2, 0] },
      { range: [0.68, 0.98], offset: [1.8, -7.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.72,
    roleTag: '干脆一段式军用扳机力 · 单发截获防偶发连发',
    description:
      '硬化钢弧形战斗扳机与铰接其顶槽的不锈钢单发断连钩：扣下扳机解脱主阻铁释放击锤后，高速后坐的枪机框将击锤重新压倒由断连钩先行锁住，唯有松开扳机才平顺交接回前主阻铁，支持极高半自动速射节奏。',
  },
  {
    id: 'benellim4_hammer',
    bomCode: 'FC-03',
    nameZh: '锻造不锈钢回转式内藏击锤',
    calloutLabel: '锻造不锈钢回转击锤',
    nameEn: 'Forged Stainless Internal Rotating Hammer',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-5.15, -1.55, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [0, -7.2, 0] },
      {
        range: [0.68, 0.98],
        offset: [-1.8, 3.6, 0],
        rotation: [0, 0, -0.45],
      },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.72,
    roleTag: '高动能前旋敲击长击针 · 联动释放托弹板抱弹锁',
    description:
      '精密模锻 17-4PH 不锈钢回转击锤：脱离阻铁瞬间在顶杆压簧驱动下向上前旋近 64° 猛烈敲击枪机框尾端长击针点燃 12 号底火，同时底部凸轮触发放弹杆允许下一发霰弹滑上升降托弹板。',
  },
  {
    id: 'benellim4_hammer_spring',
    bomCode: 'FC-04',
    nameZh: '击锤顶杆螺旋驱动压簧',
    calloutLabel: '击锤顶杆螺旋压簧',
    nameEn: 'Helical Hammer Plunger Drive Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-8.95, -2.05, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [0, -7.2, 0] },
      { range: [0.68, 0.98], offset: [-6.8, -2.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.72,
    roleTag: '封闭导柱高劲度蓄能 · 严寒防军规硬底火拒发',
    description:
      '平置收纳于火控盒后腔盲孔内的螺旋琴钢丝击锤压簧与不锈钢传力顶柱：相比扭簧具备更高抗疲劳寿命与稳定击发能量，确保在零下 40°C 极寒条件下可靠击穿军规高硬度霰弹底火。',
  },
  {
    id: 'benellim4_safety_button',
    bomCode: 'FC-05',
    nameZh: '护圈三角横栓保险钮与红点放弹拨片',
    calloutLabel: '横栓保险与红点放弹片',
    nameEn: 'Cross-Bolt Triangular Safety & Cartridge Drop Lever',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-8.35, -3.15, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [0, -7.2, 0] },
      { range: [0.68, 0.98], offset: [-0.8, -2.2, 4.8] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.72,
    roleTag: '左露鲜红火圈视觉/触觉确认 · 支持Benelli幽灵第9发上膛',
    description:
      '位于扳机护圈后上方的加大三角形横推保险栓（向左推出露出鲜红警示环即为射击状态）以及护圈前右侧带红点的放弹拨片（Cartridge Drop Lever）：手动按压放弹片即可将弹仓内待发弹释放至托弹板上，既支持战术快速换弹种（鹿弹换破门独头弹），更造就著名的“7+1+1 = 9 发幽灵装填（Ghost Loading）”绝技！',
  },

  // ==================== 4. 7-ROUND TUBULAR MAGAZINE & SHELL ELEVATOR ('magazine' · 5 parts) ====================
  {
    id: 'benellim4_mag_tube',
    bomCode: 'M-01',
    nameZh: '18.5英寸全长钢制7发下挂管式弹仓',
    calloutLabel: '7发钢制下挂管式弹仓',
    nameEn: 'Full-Length 7-Round Steel Underbarrel Tubular Magazine',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [30.9, -1.25, 0],
    explodeSteps: [
      { range: [0.38, 0.65], offset: [3.2, -2.4, 0] },
      { range: [0.65, 1.0], offset: [1.4, -1.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -1.25, 0],
    labelAppearAt: 0.06,
    roleTag: '同轴下挂7发70mm鹿弹 · 前端双侧可翻转战术背带环',
    description:
      '旋入机匣前下方螺纹座并与 18.5 英寸枪管齐平延伸的锰磷化无缝高强钢管弹仓：满载可串联容纳 7 发 70 mm（2¾ 英寸）00 号军用鹿弹（或 6 发 76 mm 3 英寸马格南弹），前端卡簧固定可左右翻转安装的钢制侧向战术背带挂环。',
  },
  {
    id: 'benellim4_mag_cap',
    bomCode: 'M-02',
    nameZh: '防松棘齿滚花弹仓前端螺盖',
    calloutLabel: '防松棘齿弹仓端盖',
    nameEn: 'Knurled Ratcheting Magazine Tube End-Cap',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [52.35, -1.25, 0],
    explodeSteps: [
      { range: [0.02, 0.16], offset: [11.5, 0, 0], rotation: [2.4, 0, 0] },
      { range: [0.35, 0.65], offset: [18.5, -2.6, 0] },
      { range: [0.65, 1.0], offset: [8.5, -1.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    labelAppearAt: 0.08,
    roleTag: '全枪唯一免工具拆解锁母 · 弹簧棘齿抗连发射击松脱',
    description:
      '旋紧在管式弹仓最前端、压住枪管前导环的粗齿防滑钢盖：内端面铣有放射状止退棘齿槽，与枪管导环上的弹簧定位销逐格咔哒啮合，连续射击数百发重装霰弹绝不震松，徒手拧下即可启动全枪野战分解。',
  },
  {
    id: 'benellim4_mag_spring',
    bomCode: 'M-03',
    nameZh: '长行程水平推进螺旋管仓托弹簧',
    calloutLabel: '水平螺旋管仓托弹簧',
    nameEn: 'Horizontal Helical Tubular Magazine Drive Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [51.1, -1.25, 0],
    explodeSteps: [
      { range: [0.36, 0.64], offset: [12.5, -5.8, 0] },
      { range: [0.65, 1.0], offset: [4.5, -2.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [-15.0, -0.84, 0],
    labelAppearAt: 0.4,
    roleTag: '恒压水平向后推弹 · 瞬间将次发霰弹送入升降托弹板',
    description:
      '锚定于弹仓前端弹簧卡塞、向机匣方向（-X）水平施力的超长琴钢丝螺旋弹簧：每次击发释放止弹笋瞬间，以充沛推力克服串联 7 发重型霰弹的惯性，将最末一发迅速推上机匣底部的升降托弹板。',
  },
  {
    id: 'benellim4_mag_follower',
    bomCode: 'M-04',
    nameZh: '高可视橙红阳极氧化排沙槽托弹杯',
    calloutLabel: '橙红排沙槽托弹杯',
    nameEn: 'High-Visibility Anodized Orange/Red Fluted Cup Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [19.6, -1.25, 0],
    explodeSteps: [
      { range: [0.36, 0.64], offset: [8.5, -5.8, 0] },
      { range: [0.65, 1.0], offset: [2.5, -2.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.4,
    roleTag: '一眼与盲摸双重空仓确认 · 六道纵向排沙防卡肋',
    description:
      '在管式弹仓内壁沿 +X/-X 顺滑往复的鲜艳橙红色阳极氧化铝合金杯形推弹器：外壁铣有六道纵向排沙减摩凹槽，前端面中央车有触觉凹坑——黑暗交战中手指探入装弹口一摸凹坑即可瞬间感知弹仓已打空。',
  },
  {
    id: 'benellim4_shell_elevator',
    bomCode: 'M-05',
    nameZh: '铰接冲压不锈钢叉口升降托弹板',
    calloutLabel: '叉口不锈钢升降托弹板',
    nameEn: 'Pivoting Stamped Stainless Forked Shell Carrier / Elevator',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [-3.65, -1.68, 0],
    explodeSteps: [
      { range: [0.12, 0.28], offset: [0, -7.2, 0] },
      {
        range: [0.36, 0.64],
        offset: [9.5, -1.6, 0],
        rotation: [0, 0, 0.28],
      },
      { range: [0.65, 1.0], offset: [3.2, -1.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [5.2, 0.1, 0],
    labelAppearAt: 0.38,
    roleTag: '管式供弹灵魂桥梁 · 承接下层霰弹向上摆起精准对准弹膛',
    description:
      '管式弹仓霰弹枪最精妙的空间转换机构：平时平卧封闭机匣底装弹口（叉形U口设计绝不夹伤塞弹拇指！）；射击循环第 5 阶段承接从下层弹仓（Y = -1.25）滑出的 12 号新弹后，由枪机框底部触发器驱动绕后销轴猛然向上仰起约 20°，如机械升降机般将粗壮霰弹精准托举对准上层枪管弹膛（Y = +1.35）待枪机推入！',
  },
];

export const BENELLIM4_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'phase_1',
    stepNum: '01',
    shortLabel: '扣扳机释击锤',
    title: '阶段 1 · 扣动战斗扳机解脱阻铁，顶杆压簧驱动不锈钢击锤高速前旋',
    range: [0.0, 0.1],
    description:
      '横栓保险处于红圈激发位，食指扣压弧形扳机使主阻铁下沉脱钩；火控盒内螺旋压簧推动锻造不锈钢回转击锤绕横轴高速向前上方挥起，直击枪机框尾端浮动长击针。',
  },
  {
    id: 'phase_2',
    stepNum: '02',
    shortLabel: '鹿弹击发引气',
    title: '阶段 2 · 12号 00 鹿弹底火点燃 (79 MPa)，弹膛前双导气孔截取纯净高温燃气',
    range: [0.1, 0.2],
    description:
      '双突笋枪机头严密锁死节套，击针刺破 70mm 12 号鹿弹底火产生 79 MPa 峰值膛压；不同于传统霰弹枪在枪管中前段引气，Benelli M4 在弹膛正前方经双斜孔将高能洁净燃气同步导入左右对称双 ARGO 不锈钢气室！',
  },
  {
    id: 'phase_3',
    stepNum: '03',
    shortLabel: '双ARGO撞框开锁',
    title: '阶段 3 · 双不锈钢活塞短行程急冲 15mm 撞框，弹群出膛且枪机头回转 38° 开锁',
    range: [0.2, 0.34],
    description:
      '双联 ARGO 不锈钢开槽活塞同步向后急冲约 1.5 cm 猛击枪机框双前肩台面；9 颗 8.4mm 铅鹿弹丸群与弹托冲出 18.5 英寸镀铬枪口（f ≈ 0.29），枪机框走完安全自由行程后经螺旋凸轮槽驱动枪机头旋转 38°（0.66 rad）解锁！',
  },
  {
    id: 'phase_4',
    stepNum: '04',
    shortLabel: '后坐抛红壳蓄能',
    title: '阶段 4 · 枪机组全行程后坐压锤并压缩斜置复进簧，鲜红空弹壳向右抛出，双活塞归位',
    range: [0.34, 0.52],
    description:
      '双 ARGO 短活塞先行回弹复位隔绝废气；重型枪机框与拉机柄携枪机头惯性全行程后坐，鼠尾连杆压缩枪托 14° 斜置复进簧并将击锤压回单发断连钩，高黄铜底鲜红塑料空壳于 f ≈ 0.44 翻滚飞出右侧大抛壳窗！',
  },
  {
    id: 'phase_5',
    stepNum: '05',
    shortLabel: '管仓推弹与托板上抬',
    title: '阶段 5 · 下挂管式弹仓推次发 12ga 实弹滑上升降托弹板，托弹舌向上摆起对准弹膛',
    range: [0.52, 0.72],
    description:
      '止弹笋瞬时放行，管式弹仓螺旋托弹簧与橙红托弹杯将下一发 12 号鹿弹向后推上底部不锈钢托弹板；随即托弹板绕后销轴向上摆起约 20°（+0.34 rad），将下层霰弹精准托举抬升至上层枪管弹膛轴线！',
  },
  {
    id: 'phase_6',
    stepNum: '06',
    shortLabel: '复进剥弹入膛',
    title: '阶段 6 · 斜置复进簧释放能量推枪机框前冲，剥离抬升霰弹送入镀铬弹膛，托弹板回落',
    range: [0.72, 0.88],
    description:
      '枪托尾管内的螺旋复进簧推动鼠尾连杆与重型枪机框强劲复进，枪机头下缘顺着仰起的叉口托弹舌将 12 号新弹笔直推入 76mm 镀铬弹膛，同时压迫不锈钢升降托弹板平滑回落归位封闭底口。',
  },
  {
    id: 'phase_7',
    stepNum: '07',
    shortLabel: '双突笋旋闭复位',
    title: '阶段 7 · 枪机头到位反向旋转 38° 刚性闭锁，松开扳机完成单发阻铁交接',
    range: [0.88, 1.0],
    description:
      '枪机头抵实枪管节套端面后，枪机框最后一段前冲行程经凸轮销驱动双闭锁突笋反向旋转 38°（-0.66 rad）锁死节套并打通击针保险孔；松开扳机，击锤由单发断连器交接回主阻铁，恢复待击合拢态。',
  },
];

/**
 * Real-time 60fps 1:1 mechanical kinematics for Benelli M4 Super 90 / M1014 across f ∈ [0, 1]:
 *  - Fixed 18.5" barrel (`dx = 0, dy = 0, rz = 0`)
 *  - Twin symmetrical stainless ARGO short-stroke pistons (`-1.50 cm` throw `[0.19, 0.27]`, snap return `[0.35, 0.47]`)
 *  - Bolt carrier free-travel cam lead (`-0.65 cm`) + `0.66 rad` (`~37.8°`) 2-lug rotating bolt unlock/lock
 *  - Full rearward BCG stroke (`-8.40 cm` carrier / `-7.75 cm` bolt) compressing angled `benellim4_recoil_spring`
 *  - Tubular magazine spring/follower feed pulse + upward-pivoting `benellim4_shell_elevator` (`rz = +0.34 rad`)!
 */
export function computeBenelliM4FiringKinematics(
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

  // 1. Twin ARGO short-stroke tappet pistons: crisp -1.50 cm rearward impulse [0.19, 0.27],
  //    brief shoulder dwell, and clean captive return [0.35, 0.47] ahead of BCG return!
  const argoThrow = seg(f, 0.19, 0.27) - seg(f, 0.35, 0.47);
  const argoDX = -1.5 * argoThrow;

  // 2. Carrier cam-track free-travel lead (-0.65 cm) before bolt translates axially:
  //    0 -> 1 during unlock [0.22, 0.33], 1 -> 0 during in-battery lockup [0.85, 0.92]
  const camLead = seg(f, 0.22, 0.33) - seg(f, 0.85, 0.92);

  // 3. Coaxial unlocked BCG travel: -7.75 cm rearward [0.33, 0.50], forward feed return [0.68, 0.85]
  const bcgMain = seg(f, 0.33, 0.5) - seg(f, 0.68, 0.85);
  const boltDX = -7.75 * bcgMain;
  const carrierDX = boltDX - 0.65 * camLead;

  // 4. Hard-chrome 2-lug rotating bolt head: +0.66 rad (~37.8° >= 0.35 rad!) unlock [0.24, 0.33],
  //    held unlocked throughout extraction & feed, then -0.66 rad relock in battery [0.855, 0.92]!
  const boltRot01 = seg(f, 0.24, 0.33) - seg(f, 0.855, 0.92);
  const boltRX = 0.66 * boltRot01;

  // 5. Tubular magazine horizontal feed advance & shell-elevator upward pivot
  const magFeedPulse = seg(f, 0.52, 0.64) - seg(f, 0.82, 0.94);
  const elevatorUp = seg(f, 0.55, 0.65) - seg(f, 0.74, 0.85);

  switch (partId) {
    case 'benellim4_argo_pistons': {
      dx = argoDX;
      break;
    }

    case 'benellim4_bolt_carrier':
    case 'benellim4_charging_handle': {
      dx = carrierDX;
      break;
    }

    case 'benellim4_bolt_head': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'benellim4_cam_pin': {
      dx = boltDX;
      // Cam pin swings laterally/vertically slightly with the 38° rotating bolt stem
      dy = -0.08 * boltRot01;
      break;
    }

    case 'benellim4_firing_pin': {
      // Mechanically blocked unless bolt is locked; driven +0.38 cm forward at primer strike [0.065, 0.10]
      const strike = seg(f, 0.065, 0.1) - seg(f, 0.14, 0.21);
      dx = boltDX + 0.38 * strike;
      break;
    }

    case 'benellim4_recoil_spring': {
      // Local X-axis spring [0, 21.6] angled at 14° inside recoil tube, rear end pinned at local x = 0!
      // Compresses cleanly down to scaleX ≈ 0.52 as carrier rat-tail pushes plunger rearward.
      const L0 = 21.6;
      const axialCompress = -carrierDX * 1.23; // ~10.35 cm spring compression
      scaleX = Math.max(0.45, (L0 - axialCompress) / L0);
      break;
    }

    case 'benellim4_trigger': {
      const pull = seg(f, 0.0, 0.085) - seg(f, 0.91, 0.975);
      rz = -0.24 * pull;
      break;
    }

    case 'benellim4_hammer': {
      // Cocked rearward (rz = 0) -> swings forward/upward (-1.12 rad) at [0.055, 0.098] ->
      // cammed back down by recoiling bolt carrier [0.33, 0.43] -> sear handoff [0.92, 0.975]
      const swing = seg(f, 0.055, 0.098);
      const recock = seg(f, 0.33, 0.43);
      const handoff = seg(f, 0.92, 0.975);
      rz = -1.12 * swing + 1.18 * recock - 0.06 * handoff;
      break;
    }

    case 'benellim4_hammer_spring': {
      // Rear end pinned at local x = 0; extends as hammer swings forward (1.18) & compresses on overcock (0.86)
      const swing = seg(f, 0.055, 0.098) - seg(f, 0.33, 0.43);
      const overcock = Math.sin(linearSeg(f, 0.38, 0.52) * Math.PI);
      scaleX = 1 + 0.18 * swing - 0.14 * overcock;
      break;
    }

    case 'benellim4_mag_spring': {
      // Front end pinned at local x = 0 inside mag cap; rear coil (-30.6) expands rearward (scaleX: 1.0 -> 1.16)
      scaleX = 1 + 0.16 * magFeedPulse;
      break;
    }

    case 'benellim4_mag_follower': {
      // Slides rearward (-X) along tubular magazine axis Y = -1.25 tracking mag_spring expansion (-30.6 * 0.16 = -4.90)
      dx = -4.9 * magFeedPulse;
      break;
    }

    case 'benellim4_shell_elevator': {
      // Pivots UPWARD (+0.34 rad around rear hinge [-3.65, -1.68, 0]) in Phase 5 to lift 12ga shell to bore line!
      rz = 0.34 * elevatorUp;
      break;
    }

    // benellim4_barrel (fixed!), receiver, forend, sights, rail, recoil_tube, telestock, argo_plugs stay stationary
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
 * Computes 12 Gauge 70mm (2¾") 00 Buckshot internal & external ballistics for Benelli M4 (M1014):
 *  1. 9-pellet 00 Buckshot column accelerating down 18.5" smoothbore (`[10.8 -> 53.5]`, `muzzleExitF = 0.29`)
 *  2. Dual ARGO chamber-forward high-pressure gas tap flash (`gasPortPos: [16.2, 0.12, 1.18]`)
 *  3. Spent crimson `12ga` hull extracted with bolt & ejected `+Z` (`ejectF = 0.44`)
 *  4. Signature **Tubular-Magazine -> Upward-Pivoting Shell-Elevator -> Chamber** 12ga feeding trajectory!
 */
export function computeBenelliM4BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const bcgMain = seg(f, 0.33, 0.5) - seg(f, 0.68, 0.85);
  const boltDX = -7.75 * bcgMain;

  // 1. 12 Gauge 00 Buckshot Column along 18.5" bore Y = +1.35 (exits X = +53.5 at muzzleExitF = 0.29!)
  const bulletVisible = f < 0.44;
  let bulletX = 10.8;
  let streakLength = 0;

  if (f >= 0.14 && f < 0.29) {
    const u = Math.pow(linearSeg(f, 0.14, 0.29), 1.32);
    bulletX = 10.8 + 42.7 * u; // Exits 18.5" muzzle crown at X = +53.50 when f = 0.29!
    streakLength = 5.4 * u;
  } else if (f >= 0.29 && f < 0.44) {
    const u = linearSeg(f, 0.29, 0.44);
    bulletX = 53.5 + 56.0 * u;
    streakLength = 10.8 * (1 - u * 0.45);
  }

  // 2. Spent Crimson 12ga High-Brass Hull: extracted from chamber [9.2, 1.35, 0] -> +Z ejection at f = 0.44!
  const spentCaseVisible = f < 0.78;
  let caseX = 9.2;
  let caseY = 1.35;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.33 && f < 0.44) {
    caseX = 9.2 + boltDX;
  } else if (f >= 0.44 && f < 0.78) {
    const u = linearSeg(f, 0.44, 0.78);
    const xAtEject = 9.2 - 7.75 * seg(0.44, 0.33, 0.5);
    caseX = xAtEject + 2.8 * u;
    caseY = 1.48 + 7.2 * u - 11.4 * u * u;
    caseZ = 13.5 * u;
    caseRX = u * 7.8;
    caseRY = -u * 11.2;
    caseRZ = -u * 9.4;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.78);
    }
  }

  // 3. Chamber Ignition Glow, Dual ARGO Gas Tap Flash & 12-Gauge Muzzle Blast Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.11 && f <= 0.22) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.11, 0.22) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.15 && f <= 0.28) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.15, 0.28) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.28 && f <= 0.385) {
    const u = linearSeg(f, 0.28, 0.385);
    muzzlePlumeScale = 0.55 + 1.85 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.9;
  }

  // 4. Next 12ga Shell: Underbarrel Mag Tube [13.8, -1.25, 0] -> Shell Elevator [2.2, -1.28, 0] ->
  //    Elevator Upward Lift [3.4, +1.08, 0] -> Bolt Chambers into [9.2, 1.35, 0]!
  let nextX = 13.8;
  let nextY = -1.25;
  let nextRZ = 0;

  if (f >= 0.51 && f < 0.59) {
    // Ejected rearward from tubular magazine onto pivoting stainless shell elevator
    const u = seg(f, 0.51, 0.59);
    nextX = 13.8 + (2.2 - 13.8) * u;
    nextY = -1.25 + (-1.28 - -1.25) * u;
    nextRZ = 0.03 * u;
  } else if (f >= 0.59 && f < 0.7) {
    // Lifted UPWARD by `benellim4_shell_elevator` (`rz = +0.34 rad`) to bore centerline!
    const u = seg(f, 0.59, 0.7);
    nextX = 2.2 + (3.4 - 2.2) * u;
    nextY = -1.28 + (1.08 - -1.28) * u;
    nextRZ = 0.03 + 0.19 * u;
  } else if (f >= 0.7 && f < 0.87) {
    // Stripped forward off the elevator spoon straight into the 12ga chamber [9.2, 1.35, 0]!
    const u = seg(f, 0.7, 0.87);
    nextX = 3.4 + (9.2 - 3.4) * u;
    nextY = 1.08 + (1.35 - 1.08) * u;
    nextRZ = 0.22 * (1 - u);
  } else if (f >= 0.87) {
    nextX = 9.2;
    nextY = 1.35;
    nextRZ = 0;
  }

  // 5. Reserve 12ga Shell advancing rearward (-X) inside underbarrel tubular magazine (`Y = -1.25`)
  const tubeShift = seg(f, 0.51, 0.7);
  const resX = 20.8 + (13.8 - 20.8) * tubeShift;
  const resY = -1.25;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.35, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [16.2, 0.12, 1.18],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0],
  };
}

const BENELLIM4_RECEIVER_BUNDLE: PbrBindingSpec = {
  albedoFile: 'benellim4_receiver_albedo.webp',
  normalFile: 'benellim4_receiver_normal.webp',
  roughnessFile: 'benellim4_receiver_roughness.webp',
  normalScale: 0.42,
};

const BENELLIM4_FURNITURE_BUNDLE: PbrBindingSpec = {
  albedoFile: 'benellim4_furniture_albedo.webp',
  normalFile: 'benellim4_furniture_normal.webp',
  roughnessFile: 'benellim4_furniture_roughness.webp',
  normalScale: 0.5,
};

export const BENELLIM4_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  benellim4_receiver: { ...BENELLIM4_RECEIVER_BUNDLE, normalScale: 0.4 },
  benellim4_trigger_housing: { ...BENELLIM4_RECEIVER_BUNDLE, normalScale: 0.38 },
  benellim4_picatinny_rail: { ...BENELLIM4_RECEIVER_BUNDLE, normalScale: 0.36 },
  benellim4_rear_sight: { ...BENELLIM4_RECEIVER_BUNDLE, normalScale: 0.34 },
  benellim4_front_sight: { ...BENELLIM4_RECEIVER_BUNDLE, normalScale: 0.36 },
  benellim4_barrel: { ...BENELLIM4_RECEIVER_BUNDLE, normalScale: 0.44 },
  benellim4_argo_plugs: { ...BENELLIM4_RECEIVER_BUNDLE, normalScale: 0.52 },
  benellim4_mag_tube: { ...BENELLIM4_RECEIVER_BUNDLE, normalScale: 0.42 },
  benellim4_mag_cap: { ...BENELLIM4_RECEIVER_BUNDLE, normalScale: 0.54 },
  benellim4_forend: { ...BENELLIM4_FURNITURE_BUNDLE, normalScale: 0.56 },
  benellim4_recoil_tube: { ...BENELLIM4_FURNITURE_BUNDLE, normalScale: 0.52 },
  benellim4_telestock: { ...BENELLIM4_FURNITURE_BUNDLE, normalScale: 0.48 },
};

export const BENELLIM4_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'benellim4_receiver',
    weapon: BENELLIM4_ID,
    titleCn: '意大利乌尔比诺硬质阳极氧化机匣、皮卡汀尼导轨与锰磷化ARGO枪管贴图组',
    partTag: 'F-01 / F-02 / B-01 / M-01 RECEIVER & ARGO BARREL',
    resolution: '2048 × 1024 px',
    summary:
      '专为 Benelli M4 Super 90（美军制式 M1014）烘焙的 2K 5 通道 Packed ORM 贴图组：下半幅刻画哑光深炭灰 MIL-STD-8625 Type-III 硬质阳极氧化 7075-T6 机匣双侧「BENELLI ARMI S.P.A. URBINO MADE IN ITALY · M4 SUPER 90」与「U.S. M1014 JOINT SERVICE COMBAT SHOTGUN」高反差银白激光铭文及棱边银白磨损；中栏分层呈现 MIL-STD-1913 导轨 T2-T14 槽位编号与 LPA 鬼环刻度；顶栏还原灰绿锰磷化 18.5 英寸枪管、双联 ARGO 导气座结晶质感与硬铬节套高光。',
    highlights: [
      '机匣双侧意大利乌尔比诺原厂与美军 U.S. M1014 激光标刻及 CNC 棱边磨损',
      'MIL-STD-1913 光学导轨 T2..T14 槽位编码与 LPA 鬼环照门风偏刻度',
      '灰绿锰磷化 18.5 英寸枪管/双 ARGO 气室 (0.48) 与硬铬闭锁节套 (0.18) 物理反差',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'benellim4_receiver_albedo.webp',
        note: 'sRGB · 深炭灰硬质阳极氧化铝机匣 / 灰绿锰磷化枪管与弹仓 / 硬铬节套',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'benellim4_receiver_normal.webp',
        note: 'Linear · 阳极微喷砂晶体 + 激光蚀刻凹痕 + ARGO 螺塞菱形滚花',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'benellim4_receiver_roughness.webp',
        note: 'Linear · R:多尺度高度AO / G:硬铬(0.18)-阳极铝(0.42)-磷化钢(0.48) / B:金属度',
      },
    ],
  },
  {
    id: 'benellim4_furniture',
    weapon: BENELLIM4_ID,
    titleCn: '玻纤肋纹护木、M1014镂空贴腮伸缩托与12号鲜红鹿弹高黄铜底缘贴图组',
    partTag: 'F-05 / F-06 / F-07 / 12GA 00 BUCK FURNITURE & HULL',
    resolution: '2048 × 1024 px',
    summary:
      '融合战术工程塑料人机组件与经典 12 号军用霰弹质感的 2K 5 通道 ORM 贴图组：底栏塑造两片式玻纤尼龙护木横向止滑肋、M1014 包胶手枪握把高摩擦激光微点防滑区及三档刻槽钢制复进尾管；中栏还原镂空伸缩托聚酰胺基体、柔韧贴腮鞍座与横槽硫化橡胶抵肩垫；顶栏刻画鲜红挤压聚乙烯纵向细肋「12 GA 70mm 00 BUCK」弹壳与 C26000 高黄铜冲压底缘铭印。',
    highlights: [
      '两片式隔热护木横向防滑凸肋与 M1014 手枪握把高密度激光蚀纹颗粒',
      '镂空伸缩托弹性贴腮板、硫化橡胶横槽肩垫与三档定位槽钢制复进管分离',
      '鲜红纵向细肋 12 GA 70mm 00 BUCK 霰弹壳体 (0.04 金属度) 与 C26000 黄铜底杯 (0.94)',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'benellim4_furniture_albedo.webp',
        note: 'sRGB · 哑光黑玻纤护木与伸缩托 / 鲜红 12ga 00 鹿弹壳 / C26000 高黄铜底缘',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'benellim4_furniture_normal.webp',
        note: 'Linear · VDI-27 注塑皮纹 + 护木防滑肋 + 握把微坑 + 霰弹壳纵向挤塑条纹',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'benellim4_furniture_roughness.webp',
        note: 'Linear · 橡胶肩垫(0.80) / 玻纤护木(0.64) / 聚乙烯红壳(0.35) / 黄铜底杯(0.23)',
      },
    ],
  },
  {
    id: 'benellim4_seamless_detail',
    weapon: BENELLIM4_ID,
    titleCn: '双联不锈钢ARGO活塞、硬铬回转枪机与叉口升降托弹板无缝细节贴图',
    partTag: '14 ARGO & ACTION INTERNAL PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为双对称 17-4PH 不锈钢开槽短行程活塞、重型机加工枪机框、硬铬双突笋回转枪机头、浮动长击针、锻造回转击锤、三组琴钢丝螺旋弹簧与冲压不锈钢叉口升降托弹舌提供微米级 CNC 车铣刀痕与金属油膜光泽起伏。',
    highlights: [
      '双联不锈钢 ARGO 短行程活塞与硬铬双突笋枪机头精密车磨拉丝法线',
      '冲压不锈钢升降托弹板、重型枪机框与滚花拉机柄 CLP 枪油微表面粗糙度',
      '覆盖其余全部 14 个半自动霰弹枪核心内件与高可视橙红排沙槽托弹杯',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于双ARGO不锈钢活塞/重型枪机框/双突笋枪机头/升降托弹板等',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 不锈钢、硬铬与弹簧钢微表面枪油光泽变化',
      },
      {
        kind: 'Normal',
        labelCn: '工程聚合物微皮纹法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于高可视度橙红托弹杯微表面细节',
      },
    ],
  },
];

export const BENELLIM4_PLUGIN: WeaponRuntimePlugin = {
  id: BENELLIM4_ID,
  partGroups: BENELLIM4_PART_GROUPS,
  timelinePresets: BENELLIM4_TIMELINE_PRESETS,
  parts: BENELLIM4_PARTS,
  firingPhases: BENELLIM4_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(BENELLIM4_FIRING_PHASES, f),
  computeFiringKinematics: computeBenelliM4FiringKinematics,
  computeBallisticsState: computeBenelliM4BallisticsState,
  pbrBindings: BENELLIM4_PBR_BINDINGS,
  pbrSuites: BENELLIM4_PBR_SUITES,
};
