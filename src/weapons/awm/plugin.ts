import {
  clamp01,
  findActiveFiringPhase,
  linearSeg,
  seg,
} from '../../engine/kinematics/math';
import type {
  AssemblyGroupMeta,
  ExtendedBallisticsState,
  FiringPhaseInfo,
  KeyframeStep,
  PartKinematicDelta,
  PbrBindingSpec,
  PbrSuiteItem,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';

export const AWM_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '60° 六突笋栓动枪机与 S&B 瞄具组',
    nameEn: '60° 6-Lug Turn-Bolt & S&B PM II Optic Group',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: '军绿拇指孔底盘、CNC 主梁与开槽枪管组',
    nameEn: 'OD-Green Thumbhole Chassis, CNC Beam & Fluted Barrel',
    badgeColor: '#4d7c0f',
  },
  {
    key: 'fire_control',
    nameZh: '两道火精密比赛扳机与弹匣卡笋组',
    nameEn: 'Two-Stage Match Trigger Pack & Mag Catch',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '5发 .338 Lapua Magnum 钢制盒式弹匣组',
    nameEn: '5-Rd .338 Lapua Magnum Steel Box Magazine',
    badgeColor: '#e11d48',
  },
];

export const AWM_TIMELINE_PRESETS = [
  {
    id: 'assembled',
    label: '合拢态',
    subLabel: '0%',
    t: 0.0,
    desc: '精密国际 AWM (英军 L115A3) 全枪闭锁待击态，开启 X-Ray 透视可检视内部 CNC 铝合金贯穿主梁与六突笋枪机咬合',
  },
  {
    id: 'field_strip',
    label: '野战一级勤务快拆',
    subLabel: '30%',
    t: 0.3,
    desc: '卸下 5 发 .338LM 钢制盒式弹匣、抬柄向后抽出 60° 六突笋防冰槽枪机总成、快拆 S&B PM II 瞄准镜桥与前插栓两脚架',
  },
  {
    id: 'upper_mag_strip',
    label: '枪机/护壳/弹匣细拆',
    subLabel: '65%',
    t: 0.65,
    desc: '旋下枪机尾罩分解平移击针与击针簧、分离英军橄榄绿两片式玻纤拇指孔护壳露出内部 CNC 铝主梁，并拆解 .338LM 弹匣',
  },
  {
    id: 'full_explode',
    label: '全枪 24 节点爆炸图',
    subLabel: '100%',
    t: 1.0,
    desc: '完整展开 27 英寸纵向六槽不锈钢浮置枪管、双室制退器、平侧壁钢机匣、折叠后托贴腮板及模块化两道火比赛扳机盒',
  },
] as const;

// Shared stage-1 bolt assembly rearward extraction out of steel action receiver, then upward lift
const BOLT_EXTRACT_STAGE1: KeyframeStep[] = [
  { range: [0.08, 0.17], offset: [-7.2, 0.0, 0] },
  { range: [0.17, 0.28], offset: [-1.4, 5.2, 0] },
];

// Shared stage-1 .338 LM steel box magazine straight downward drop
const AWM_MAG_STAGE1: KeyframeStep[] = [
  { range: [0.02, 0.12], offset: [0, -6.2, 0] },
];

export const AWM_PARTS: WeaponPartSpec[] = [
  // ==================== 1. OPTIC & 60° 6-LUG TURN-BOLT GROUP ('slide' · 7 parts) ====================
  {
    id: 'awm_scope',
    bomCode: 'S-01',
    nameZh: 'Schmidt & Bender PM II 5-25×56 狙击瞄准镜',
    calloutLabel: 'S&B PM II 5-25×56 狙击镜',
    nameEn: 'Schmidt & Bender PM II 5-25×56 L/P Sniper Scope',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [1.7, 3.42, 0],
    explodeSteps: [
      { range: [0.1, 0.24], offset: [0.4, 6.2, 0] },
      { range: [0.58, 0.86], offset: [0.8, 4.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 34,
    calloutAnchor: [3.2, 1.15, 0],
    labelAppearAt: 0.0,
    roleTag: '5-25倍第一焦平面 / 双圈高耸高低旋钮',
    description:
      '英军 L115A3 标配的德国施密特-本德 PM II 5-25×56 顶级军用远射程白光瞄准镜：采用 34mm 加粗一体镜管、56mm 多层翠绿增透镀膜大物镜，配备带黄标提示的双圈（Double-Turn）0.1 MRAD 密位高低调节塔、右侧风偏塔及左侧视差/分划照明复合旋钮。',
  },
  {
    id: 'awm_scope_mount',
    bomCode: 'S-02',
    nameZh: 'AI 一体式 34mm 重型双环倾角镜桥座',
    calloutLabel: 'AI 一体式重型镜桥座',
    nameEn: 'AI One-Piece 34mm Tactical Cantilever Scope Mount',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-0.4, 2.82, 0],
    explodeSteps: [
      { range: [0.1, 0.24], offset: [0.4, 6.2, 0] },
      { range: [0.58, 0.86], offset: [0.2, 0.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [2.2, 0.85, 0],
    labelAppearAt: 0.22,
    roleTag: '自带前倾俯角补偿 / 承受 .338LM 猛烈后坐',
    description:
      '专为 .338 Lapua Magnum 极远距离弹道下坠设计的精密国际原厂一体式 CNC 铝合金/钢制双环镜座：底座通过三枚六角横栓刚性锁死机匣顶部导轨，预置 28~45 MOA 俯角以充分释放瞄准镜超远距仰角调节行程。',
  },
  {
    id: 'awm_bolt_body',
    bomCode: 'S-03',
    nameZh: '60° 六突笋防冰槽旋转枪机体与后掠球头拉机柄',
    calloutLabel: '60° 六突笋防冰槽枪机',
    nameEn: '60° 6-Lug Anti-Icing Fluted Bolt Body & Bent Spherical Handle',
    group: 'slide',
    material: 'stainless',
    assembledPos: [0, 1.05, 0],
    explodeSteps: [
      ...BOLT_EXTRACT_STAGE1,
      {
        range: [0.34, 0.56],
        offset: [2.8, 1.2, 0],
        rotation: [-0.52, 0, 0],
      },
      { range: [0.68, 0.88], offset: [0.8, 1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    calloutAnchor: [-0.5, 0.48, 0],
    labelAppearAt: 0.14,
    roleTag: '双排六突笋 60° 短行程闭锁 / 北极防冻结冰槽',
    description:
      'Arctic Warfare“北极作战”血统精髓：枪机头前端分前后两排布置共 6 枚粗壮闭锁突笋，仅需上抬 60°（传统步枪为 90°）即可快速开锁且绝不磕碰大目镜；圆柱机身上铣有 6 道纵向防冰排泥槽，配标志性后掠折弯球头拉机柄，在零下 40°C 严寒结霜工况下仍能顺畅拉栓。',
  },
  {
    id: 'awm_bolt_shroud',
    bomCode: 'S-04',
    nameZh: '枪机尾罩与三档旗式保险组',
    calloutLabel: '枪机尾罩与三档旗式保险',
    nameEn: 'Bolt Shroud with 3-Position Flag Safety',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-5.18, 1.05, 0],
    explodeSteps: [
      ...BOLT_EXTRACT_STAGE1,
      { range: [0.36, 0.58], offset: [-9.2, 0.4, 0] },
      { range: [0.68, 0.9], offset: [-2.2, 0.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 36,
    calloutAnchor: [-0.4, 0.52, 0],
    labelAppearAt: 0.36,
    roleTag: '挡气护目屏障 / 击发-安全退弹-全锁死三档保险',
    description:
      '旋接于枪机体尾端并遮蔽高压燃气外泄通道的棱柱形钢制尾罩，左侧设有精密三档拨片保险：后档红点露出为「待击发射」，中档锁死击针但允许正常拉栓安全退弹，前档同时刚性锁死击针与枪机柄防止携行意外开启。',
  },
  {
    id: 'awm_striker',
    bomCode: 'S-05',
    nameZh: '内部长行程击针与待击挂机尾杆',
    calloutLabel: '内部击针与待击尾杆',
    nameEn: 'Internal Fluted Striker & Cocking Piece Assembly',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-1.15, 1.05, 0],
    explodeSteps: [
      ...BOLT_EXTRACT_STAGE1,
      { range: [0.36, 0.58], offset: [-5.4, 2.2, 0] },
      { range: [0.68, 0.9], offset: [-1.2, 1.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 58,
    calloutAnchor: [-1.2, 0.25, 0],
    labelAppearAt: 0.38,
    roleTag: '抬柄凸轮强制待击 / 4ms 极短击发锁时',
    description:
      '贯穿于中空枪机体内的轻量化高强度合金钢击针：下部待击凸笋穿过机匣尾槽与两道火扳机上阻铁精密啮合，尾端探出尾罩充当夜间盲摸可见/可触的待击指示杆；仅约 4 毫秒的超短击发锁时最大限度消除射手微颤误差。',
  },
  {
    id: 'awm_firing_pin_spring',
    bomCode: 'S-06',
    nameZh: '高劲度螺旋琴钢丝击针簧',
    calloutLabel: '高劲度螺旋击针簧',
    nameEn: 'Heavy-Duty Helical Firing Pin Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-1.45, 1.05, 0],
    explodeSteps: [
      ...BOLT_EXTRACT_STAGE1,
      { range: [0.36, 0.58], offset: [-1.6, 3.4, 0] },
      { range: [0.68, 0.9], offset: [-0.4, 1.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [0, 0.25, 0],
    labelAppearAt: 0.38,
    roleTag: '抬柄旋转蓄能 / 破冰可靠击穿马格南底火',
    description:
      '套装于击针中段的高张力耐低温螺旋压簧：在射手向上抬起拉机柄 60° 的开锁瞬间由尾罩螺旋斜面压缩蓄能，释放时提供充沛动能可靠引燃厚杯壁的 .338 Lapua Magnum 大型步枪马格南底火。',
  },
  {
    id: 'awm_extractor',
    bomCode: 'S-07',
    nameZh: '外置宽爪弹性钢片抽壳钩',
    calloutLabel: '宽爪弹性抽壳钩',
    nameEn: 'Heavy External Leaf-Spring Claw Extractor',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [0, 1.05, 0],
    explodeSteps: [
      ...BOLT_EXTRACT_STAGE1,
      { range: [0.38, 0.58], offset: [8.6, 0.6, 0.8] },
      { range: [0.68, 0.9], offset: [2.2, 1.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [2.2, 0.22, 0.4],
    labelAppearAt: 0.4,
    roleTag: '高膛压涨壳强力预抽壳 / 冰沙免卡滞',
    description:
      '嵌装于枪机头右上方突笋导槽内的重型长片簧式外抽壳钩：钩爪宽厚坚固，配合枪机开锁时的螺旋初抽增力效应，即使 .338LM 铜壳在超过 420 MPa 峰值膛压下轻微贴膛也能稳健拔出。',
  },

  // ==================== 2. CHASSIS, CNC BEAM, ACTION & FLUTED BARREL ('frame' · 9 parts) ====================
  {
    id: 'awm_chassis_skins',
    bomCode: 'F-01',
    nameZh: '英军橄榄绿两片式玻纤聚合物拇指孔护壳',
    calloutLabel: '橄榄绿拇指孔护壳',
    nameEn: 'British Olive-Drab Polymer Thumbhole Chassis Skins',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.42, 0.65], offset: [0, -3.2, 1.8] },
      { range: [0.68, 0.92], offset: [0, -1.2, 0.6] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [-6.2, -4.5, 0],
    labelAppearAt: 0.0,
    roleTag: '标志性拇指孔人机工学 / 隔绝严寒金属冻手',
    description:
      '缔造 AWM 全球传奇剪影的标志性英国军用橄榄绿（British Olive Drab）高强度玻纤尼龙左右两片式枪托护壳：通过内六角沉头螺栓锁附在铝合金主梁两侧，一体集成后掠握把、封闭式椭圆拇指孔（Thumbhole）与连指手套超大扳机护圈，严寒贴腮与握持不冻伤皮肤且受潮绝不变形。',
  },
  {
    id: 'awm_chassis_beam',
    bomCode: 'F-02',
    nameZh: '全长 CNC 7075-T6 航空铝合金刚性底盘主梁',
    calloutLabel: 'CNC 铝合金底盘主梁',
    nameEn: 'Full-Length CNC Billet Aluminum Chassis Spine Beam',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [0, 0, 0],
    explodeSteps: [{ range: [0.68, 0.92], offset: [0, -0.4, 0] }],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [8.8, -0.65, 0],
    labelAppearAt: 0.44,
    roleTag: '现代模块化底盘狙击枪鼻祖 / 零归零漂移骨架',
    description:
      '奥运射击冠军、精密国际创始人马尔科姆·库珀革命性的结构创举：以整块航空铝合金 CNC 铣削出贯穿全枪的刚性箱形脊梁（前段铣有减重桁架窗与两脚架插栓套，中段设 V 形座床承托钢机匣），使木质/全塑枪托彻底告别温湿度膨胀导致的弹着点漂移。',
  },
  {
    id: 'awm_action_receiver',
    bomCode: 'F-03',
    nameZh: '平侧壁厚壁钢制马格南闭锁机匣',
    calloutLabel: '平侧壁钢制闭锁机匣',
    nameEn: 'Flat-Sided Machined Steel Magnum Action Receiver',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 1.05, 0],
    explodeSteps: [{ range: [0.66, 0.92], offset: [0.2, 2.8, 0] }],
    calloutDir: 'up',
    calloutStem: 36,
    calloutAnchor: [-2.4, 1.15, 0],
    labelAppearAt: 0.48,
    roleTag: '高抗扭平壁厚钢机匣 / 环氧胶合加螺栓双重座床',
    description:
      '不同于传统圆管形猎枪机匣，AWM 采用厚壁实心合金钢块铣削出极具辨识度的八角平侧壁超刚性封闭机匣，右侧仅开紧凑抛壳窗以最大化抗弯抗扭刚度，底部通过高强度环氧树脂胶合与螺栓双重固定于铝合金主梁座床之上。',
  },
  {
    id: 'awm_barrel',
    bomCode: 'F-04',
    nameZh: '27英寸纵向六槽不锈钢自由浮置比赛枪管',
    calloutLabel: '27" 纵向开槽不锈钢枪管',
    nameEn: '27" Longitudinally Fluted Stainless Match Barrel',
    group: 'frame',
    material: 'stainless',
    assembledPos: [0, 1.05, 0],
    explodeSteps: [{ range: [0.68, 0.94], offset: [5.8, 2.8, 0] }],
    calloutDir: 'up',
    calloutStem: 36,
    calloutAnchor: [18.5, 0.65, 0],
    labelAppearAt: 0.0,
    roleTag: '全程自由浮置谐振一致 / 六道散热减重直槽',
    description:
      '长达 686mm（27 英寸）、缠距 1:10" 的比赛级冷锻/拉削不锈钢重型狙击枪管：自机匣节套向前全程与护木保持充裕间隙（100% 自由浮置），外壁精密铣出 6 道深纵向凹槽，在减轻枪口下坠重量的同时显著提升截面刚度与连续射击散热面积，赋予 .338LM 弹药超过 1,500 米的亚角分精度（曾创下 2,475 米实战命中世界纪录）。',
  },
  {
    id: 'awm_muzzle_brake',
    bomCode: 'F-05',
    nameZh: 'AI 双室平板战术膛口制退器 (含消音器外螺纹)',
    calloutLabel: 'AI 双室战术制退器',
    nameEn: 'AI Two-Chamber Tactical Muzzle Brake & Suppressor Mount',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [29.5, 1.05, 0],
    explodeSteps: [
      { range: [0.34, 0.56], offset: [4.2, 0, 0] },
      { range: [0.68, 0.96], offset: [6.8, 2.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0.3, 0.65, 0],
    labelAppearAt: 0.0,
    roleTag: '大幅削减 .338LM 猛烈后坐 / 抑制扬尘方便自观弹着',
    description:
      'L115A3 标志性的扁平双气室高效钢制膛口制退器：左右两侧对称布置两道大型斜向导气隔板，将高压火药燃气向侧后方喷射以抵消近 45% 的马格南后坐冲量；上下封闭平板结构杜绝卧姿射击吹起地面尘土暴露阵地，后颈部设有快装战术消音器外螺纹与护圈。',
  },
  {
    id: 'awm_folding_stock',
    bomCode: 'F-06',
    nameZh: '左侧重型铰链折叠后枪托段 (带战术钩槽)',
    calloutLabel: '左侧铰接折叠后枪托',
    nameEn: 'Left-Side Hinged Folding Rear Buttstock Section',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-9.2, 0, 0],
    explodeSteps: [
      { range: [0.32, 0.54], offset: [-3.4, -0.4, 0] },
      { range: [0.68, 0.94], offset: [-2.8, -0.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [-5.2, -3.2, 0],
    labelAppearAt: 0.3,
    roleTag: '向左 180° 折叠缩短携行长度 260mm / 尾部沙袋抓握钩',
    description:
      'AWM-F / L115A3 伞降与狙击携行升级结构：通过左侧硬化不锈钢无间隙转轴铰链连接主底盘，按下卡笋即可向左贴合机匣折叠并遮护拉机柄；下缘设有经典的战术内凹手托钩槽（Bag Rider Hook），便于射手副手配合后沙袋精细微调高低射角。',
  },
  {
    id: 'awm_cheekpiece',
    bomCode: 'F-07',
    nameZh: '双立柱高低/偏置可调哑光黑贴腮板',
    calloutLabel: '可调双柱黑色贴腮板',
    nameEn: 'Adjustable Saddle Cheekpiece with Twin Guide Posts',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-14.1, 1.35, 0],
    explodeSteps: [
      { range: [0.32, 0.54], offset: [-3.4, 2.6, 0] },
      { range: [0.68, 0.94], offset: [-2.8, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 34,
    calloutAnchor: [0, 0.65, 0],
    labelAppearAt: 0.0,
    roleTag: '精准对齐 56mm 高瞄准基线 / 无应力稳定贴腮',
    description:
      '马鞍形黑色低导热聚合物贴腮板，依靠下方两根精密不锈钢垂直导柱插入后枪托脊部，松开右侧滚花锁紧螺钉即可无级调节高度与轻微侧倾，确保射手颧骨稳固贴合时瞳孔自然正对 S&B 5-25×56 狙击镜出瞳中心。',
  },
  {
    id: 'awm_buttpad_spacers',
    bomCode: 'F-08',
    nameZh: '厚索博坦吸能橡胶抵肩垫与拉距调节垫片组',
    calloutLabel: '吸能橡胶抵肩垫与垫片',
    nameEn: 'Sorbothane Recoil Buttpad & Length-of-Pull Spacers',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-19.5, -1.76, 0],
    explodeSteps: [
      { range: [0.32, 0.54], offset: [-5.6, -0.4, 0] },
      { range: [0.68, 0.96], offset: [-5.2, -1.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 36,
    calloutAnchor: [-0.8, -1.2, 0],
    labelAppearAt: 0.34,
    roleTag: '增减垫片适配防弹衣厚度 / 吸收马格南肩部冲击',
    description:
      '由两片可快拆增减的聚合物拉距垫片（LOP Spacers）与带横向防滑齿的加厚高阻尼橡胶缓冲垫组成：可根据射手体型或是否穿着重型防寒服/防弹背心定制抵肩长度，显著柔化 .338LM 近 6,800 焦耳枪口动能带来的后坐峰值。',
  },
  {
    id: 'awm_bipod',
    bomCode: 'F-09',
    nameZh: '前插栓悬挂式 Parker-Hale 折叠伸缩两脚架',
    calloutLabel: 'Parker-Hale 前插栓两脚架',
    nameEn: 'Front-Spigot Folding Parker-Hale Telescoping Ski-Foot Bipod',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [14.4, -0.35, 0],
    explodeSteps: [
      { range: [0.12, 0.26], offset: [5.4, -2.4, 0] },
      { range: [0.66, 0.92], offset: [3.2, -3.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 36,
    calloutAnchor: [1.4, -4.4, 0],
    labelAppearAt: 0.0,
    roleTag: '重心悬挂于插栓轴下方自动归正 / 雪橇脚垫顺滑后坐',
    description:
      '英国帕克-黑尔经典前插栓（Spigot）悬挂式重型钢制折叠两脚架：直接插入铝合金底盘前端钢套管内，使全枪重心自然垂挂于横滚枢轴下方，在不平山地无需人工扳平即可快速保持瞄准镜水平；配外置拉簧、棘齿伸缩内腿与弧形雪橇脚板，射击时允许枪身沿地面平滑直线后坐。',
  },

  // ==================== 3. TWO-STAGE MATCH TRIGGER PACK ('fire_control' · 4 parts) ====================
  {
    id: 'awm_trigger_box',
    bomCode: 'FC-01',
    nameZh: '模块化两道火精密比赛级扳机盒壳体',
    calloutLabel: '两道火模块化扳机盒',
    nameEn: 'Modular Two-Stage Match Trigger Box Cassette',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-3.05, -0.65, 0],
    explodeSteps: [{ range: [0.68, 0.94], offset: [-2.8, -6.2, 0] }],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, -0.45, 0],
    labelAppearAt: 0.68,
    roleTag: '全封闭防尘防沙盒式火控 / 1.5~2.0kg 可调扳机力',
    description:
      '直接吊装于钢制机匣底部的独立阳极氧化铝/钢模块化盒式扳机组件：预留侧向检视孔与排沙缝，底部嵌有黄铜色第一道火行程与第二道火击发力微调螺钉（军标出厂设定 1.5–2.0 kg），即便浸水结冰仍具备跌落绝对安全性。',
  },
  {
    id: 'awm_sear',
    bomCode: 'FC-02',
    nameZh: '高硬度工具钢上阻铁与传递杠杆组',
    calloutLabel: '精密上阻铁与传递杆',
    nameEn: 'Hardened Tool-Steel Top Sear & First-Stage Transfer Lever',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-3.15, 0.18, 0],
    explodeSteps: [{ range: [0.7, 0.96], offset: [-5.8, -4.8, 0] }],
    calloutDir: 'down',
    calloutStem: 34,
    calloutAnchor: [0, 0.15, 0],
    labelAppearAt: 0.7,
    roleTag: '镜面研磨阻铁啮合面 / 玻璃折断般干脆释放',
    description:
      '经精密线切割与镜面抛光热处理的工具钢双杠杆阻铁：待击时顶部阻铁齿稳稳托住击针下挂机凸笋；扣完第一道火预行程后到达清晰硬墙，微增指力瞬间阻铁后端果断下沉，实现“折断玻璃棒”般零拖泥带水的精确击发。',
  },
  {
    id: 'awm_trigger_shoe',
    bomCode: 'FC-03',
    nameZh: '前后位置可调纵向防滑槽弧形扳机舌',
    calloutLabel: '可调防滑弧形扳机舌',
    nameEn: 'Position-Adjustable Grooved Curved Match Trigger Shoe',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-2.95, -1.25, 0],
    explodeSteps: [{ range: [0.7, 0.96], offset: [-0.8, -8.4, 0] }],
    calloutDir: 'down',
    calloutStem: 56,
    calloutAnchor: [0, -0.85, 0],
    labelAppearAt: 0.7,
    roleTag: '前后滑轨调节指腹触点 / 戴防寒手套清晰感知两道火',
    description:
      '通过夹紧滑座固定于扳机下摇臂的宽弧面狙击扳机舌：允许沿纵向微调前后距离达 13mm 以完美贴合不同射手食指长度，表面铣有纵向防滑细槽，即便佩戴北极厚战术手套也能敏锐感知两道火临界点。',
  },
  {
    id: 'awm_mag_catch',
    bomCode: 'FC-04',
    nameZh: '护圈前缘加长拨片式双侧弹匣卡笋',
    calloutLabel: '加长拨片弹匣卡笋',
    nameEn: 'Extended Ambidextrous Paddle Magazine Catch',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-1.92, -1.95, 0],
    explodeSteps: [{ range: [0.68, 0.94], offset: [1.4, -5.8, 0] }],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [0, -0.35, 0],
    labelAppearAt: 0.68,
    roleTag: '食指或拇指前推即卸弹匣 / 严寒手套盲操作',
    description:
      '铰接于扳机护圈正前方与弹匣井后壁交界处的宽大防滑钢制拨片卡笋：上部锁钩紧紧咬合 5 发钢弹匣后挂齿消除供弹晃动，换弹时射手左右手均可用大拇指或食指轻松前推拨片快速卸匣。',
  },

  // ==================== 4. 5-RD .338 LAPUA MAGNUM MAGAZINE ('magazine' · 4 parts) ====================
  {
    id: 'awm_mag_body',
    bomCode: 'M-01',
    nameZh: '5发 .338 Lapua Magnum 磷化钢制盒式弹匣体',
    calloutLabel: '5发 .338LM 钢制盒式弹匣',
    nameEn: '5-Round .338 Lapua Magnum Steel Box Magazine Body',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [1.35, -1.85, 0],
    explodeSteps: [
      ...AWM_MAG_STAGE1,
      { range: [0.36, 0.58], offset: [0.2, -1.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 36,
    calloutAnchor: [0, -1.8, 0],
    labelAppearAt: 0.0,
    roleTag: '容纳全长 93.5mm 巨型马格南狙击弹 / 压筋抗冲击钢壳',
    description:
      '专为全弹长高达 93.5mm 的 .338 Lapua Magnum（8.6×70mm）超远距狙击弹打造的超宽重型冲压磷化钢盒式弹匣：两侧压制 5 道纵向加强筋防止磕碰变形，采用高可靠性单排/交错中置抱弹口（Center-Feed），确保长弹头直线对准枪管坡道零刮擦入膛。',
  },
  {
    id: 'awm_mag_follower',
    bomCode: 'M-02',
    nameZh: '防倾侧长裙边高辨识托弹板',
    calloutLabel: '防倾侧长裙边托弹板',
    nameEn: 'Anti-Tilt Contoured .338 LM Magazine Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [1.35, -2.35, 0],
    explodeSteps: [
      ...AWM_MAG_STAGE1,
      { range: [0.36, 0.6], offset: [-3.4, 2.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, 0, 0],
    labelAppearAt: 0.36,
    roleTag: '超长前后导裙杜绝马格南大锥度弹壳俯仰卡弹',
    description:
      '针对 .338LM 粗大黄铜弹壳设计的全长防倾侧托弹板，前后两端延伸垂直导向裙边贴合弹匣内壁，高对比橙红色表面便于狙击手从右侧大型抛壳窗一眼确认空仓状态。',
  },
  {
    id: 'awm_mag_spring',
    bomCode: 'M-03',
    nameZh: '宽椭圆高张力不锈钢弹匣托弹簧',
    calloutLabel: '宽椭圆弹匣托弹簧',
    nameEn: 'Heavy Wide-Oval Stainless Magazine Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [1.35, -3.28, 0],
    explodeSteps: [
      ...AWM_MAG_STAGE1,
      { range: [0.36, 0.62], offset: [3.8, -3.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    calloutAnchor: [0, -0.4, 0],
    labelAppearAt: 0.36,
    roleTag: '耐腐蚀不锈钢簧丝 / 极寒恒力托举重型铜壳弹',
    description:
      '采用大长径比宽椭圆盘绕的耐腐蚀不锈钢托弹簧，即便在北极冰水浸泡或长期满弹战备储存条件下，仍能平稳有力地将单发重达 47 克的 .338LM 实弹托举至抱弹口定位。',
  },
  {
    id: 'awm_mag_floorplate',
    bomCode: 'M-04',
    nameZh: '外折边快拔防滑钢制弹匣底盖与锁扣',
    calloutLabel: '外折边快拆钢制底盖',
    nameEn: 'Flared-Lip Detachable Steel Magazine Floorplate',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [1.35, -4.2, 0],
    explodeSteps: [
      ...AWM_MAG_STAGE1,
      { range: [0.36, 0.64], offset: [7.2, -5.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 36,
    calloutAnchor: [0, -0.15, 0],
    labelAppearAt: 0.36,
    roleTag: '前后外扩快拔唇边 / 免工具滑出野外排沙保养',
    description:
      '与弹匣体底部严丝合缝平齐咬合的冲压钢底盖：前后两端专门设计外扩折边唇口，方便狙击手从紧身胸挂弹匣袋中戴手套盲抓抽出；按压底部中心圆锁钮即可滑脱底盖快速清理泥沙。',
  },
];

// ============================================================================
// MANUAL BOLT-ACTION 7-STAGE FIRING & CYCLING DEMO (.338 LAPUA MAGNUM)
// ============================================================================

export const AWM_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'awm_cocked_ready',
    stepNum: '01',
    shortLabel: '待击瞄准闭锁',
    title: '阶段 1 · 双排六突笋完全闭锁与击针满蓄能待击准备',
    range: [0.0, 0.12],
    description:
      '枪机头前端双排 6 枚闭锁突笋已旋转 60° 严密锁入平侧壁钢制机匣闭锁环内，全长 93.5mm 的 .338 Lapua Magnum 狙击弹稳居比赛级浮置枪管弹膛；内部击针被两道火扳机盒的上阻铁齿牢牢挂住，尾端待击指示杆探出尾罩。',
  },
  {
    id: 'awm_two_stage_trigger',
    stepNum: '02',
    shortLabel: '两道火扳机击发',
    title: '阶段 2 · 扣过一道火预行程与二道火“折玻璃”干脆断路',
    range: [0.12, 0.23],
    description:
      '狙击手食指平稳向后预压弧形扳机舌走完柔和的第一道火行程，触达清晰硬墙后微增指力突破约 1.6kg 第二道火临界点；模块化扳机盒内的工具钢上阻铁瞬间下沉脱钩，实现零扰动精确释放。',
  },
  {
    id: 'awm_striker_ignition',
    stepNum: '03',
    shortLabel: '击针释能引燃',
    title: '阶段 3 · 螺旋击针簧高速推击针刺破 .338LM 马格南底火',
    range: [0.23, 0.31],
    description:
      '脱钩后的内部击针在高劲度螺旋击针簧驱动下于 4 毫秒超短锁时内极速前冲，尖端穿过凹陷枪机镜面重重撞击 .338 Lapua Magnum 弹壳底火，瞬间引燃壳内近 5.9 克双基缓燃发射药，膛压飙升至 420 MPa！',
  },
  {
    id: 'awm_supersonic_exit',
    stepNum: '04',
    shortLabel: '弹头出膛制退',
    title: '阶段 4 · 250格令船尾弹头超音速离膛与双室制退器侧喷',
    range: [0.31, 0.45],
    description:
      '8.6mm (.338) 低阻船尾空尖比赛弹头（VLD Boat-Tail）沿 27 英寸纵向六槽不锈钢枪管加速至约 910 m/s（2.7 马赫）破空出膛！AI 双室平板制退器将狂暴燃气向左右两侧偏转喷射，大幅抵消马格南后坐力，而手动栓动枪机全程刚性锁死不动以压榨极致远射精度。',
  },
  {
    id: 'awm_bolt_lift_60',
    stepNum: '05',
    shortLabel: '抬柄60°开锁待击',
    title: '阶段 5 · 手动上抬球头拉机柄 60° 解锁六突笋并压缩击针待击',
    range: [0.45, 0.58],
    description:
      '弹头远去后，狙击手右手握持折弯球头拉机柄向上快抬 60°（短行程设计留出充裕间隙绝不擦碰 S&B 56mm 瞄准镜目镜）：双排六突笋旋出机匣闭锁支承面完成开锁，同时枪机尾罩内的螺旋待击斜面强制将击针向后顶回并重新压缩击针簧蓄能！',
  },
  {
    id: 'awm_bolt_pull_eject',
    stepNum: '06',
    shortLabel: '后拉抽壳抛壳',
    title: '阶段 6 · 沿防冰导槽直拉枪机后退，抽出并抛出 .338LM 空铜壳',
    range: [0.58, 0.78],
    description:
      '射手保持拉机柄 60° 抬起状态将长行程枪机顺滑拉向后方到底：外置宽爪抽壳钩死死咬住 70mm 长的 .338LM 黄铜空弹壳拉出弹膛，当弹壳清出膛口瞬间，枪机面弹性柱塞式抛壳挺猛烈向右上方将滚烫铜壳踢出大型抛壳窗；5 发钢弹匣将下一发新弹托升到位。',
  },
  {
    id: 'awm_bolt_feed_close',
    stepNum: '07',
    shortLabel: '推弹压柄60°闭锁',
    title: '阶段 7 · 推栓剥取新弹平稳入膛，下压拉机柄 60° 归位闭锁',
    range: [0.78, 1.0],
    description:
      '射手向前平推枪机，下突笋从中心供弹抱弹口顺畅剥离下一发 .338 Lapua Magnum 实弹经抛光坡道直推入膛，抽壳钩越过底缘卡入弹底槽；随后向下压平球头拉机柄 60°，六突笋重新刚性咬合闭锁，击针待击齿平顺交接回扳机上阻铁，准备下一发千米精确狙击！',
  },
];

/**
 * Real-time manual bolt-action sniper kinematics for all 24 AWM parts at progress f ∈ [0, 1].
 * Right-hand rule verification:
 *  - Around +Z: awm_trigger_shoe (blade y < 0) with rz < 0 swings rearward (-X).
 *  - Around +X: awm_bolt_body (right-side bolt handle at z = +1.85, y = -0.85) has
 *    y' = y*cos(rx) - z*sin(rx), so rx = -Math.PI/3 (-60°) LIFTS the right bolt handle UPWARD (+60° toward +Y)
 *    and rotates +60° back down to rx = 0 when closing into battery!
 */
export function computeAwmFiringKinematics(
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

  // 1. Manual 60-degree Bolt Handle Lift (Stage 05 [0.45..0.57] -> held at 60° during stroke -> Stage 07 lock-down [0.91..0.985])
  const boltLiftFactor = seg(f, 0.45, 0.57) - seg(f, 0.91, 0.985);
  const boltRX = -(Math.PI / 3) * boltLiftFactor; // 60° upward bolt-handle lift around coaxial X bore axis

  // 2. Primary Extraction Helical Cam Creep (-0.14 during 60° lift [0.50..0.575]) +
  //    Long-Action Manual Bolt Draw (-4.71 along -X in Stage 06 [0.58..0.73] = -4.85 total, clearing .338LM magwell & cheekpiece!)
  const primaryExtract = seg(f, 0.5, 0.575) - seg(f, 0.91, 0.965);
  const mainDraw = seg(f, 0.58, 0.73) - seg(f, 0.78, 0.91);
  const boltDX = -0.14 * primaryExtract - 4.71 * mainDraw;

  // 3. Striker relative axial travel: snaps +0.52 forward on 2nd-stage sear break [0.228..0.260] (4ms lock time),
  //    cammed back -0.52 by cock-on-opening shroud ramp during 60° bolt lift [0.46..0.57], plus subtle sear handoff [0.91..0.985]!
  const strikerForwardFactor = seg(f, 0.228, 0.26) - seg(f, 0.46, 0.57);
  const cockHandoff = -0.04 * Math.sin(linearSeg(f, 0.91, 0.985) * Math.PI);
  const strikerRelDX = 0.52 * strikerForwardFactor + cockHandoff;

  switch (partId) {
    case 'awm_bolt_body': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'awm_extractor': {
      dx = boltDX;
      rx = boltRX;
      // Outward leaf-spring claw flex (+Z) snapping over the 14.9mm .338 Lapua Magnum rim as round chambers!
      const rimSnap = Math.sin(linearSeg(f, 0.885, 0.935) * Math.PI);
      dz = 0.085 * rimSnap;
      break;
    }

    case 'awm_bolt_shroud': {
      // Shroud stays upright (rx = 0) guided in receiver tang slot during 60° bolt lift, then strokes -X/+X with bolt!
      dx = boltDX;
      break;
    }

    case 'awm_striker': {
      dx = boltDX + strikerRelDX;
      break;
    }

    case 'awm_firing_pin_spring': {
      // Assembled spring spans local X ∈ [-2.15, +2.15] (L0 = 4.30) inside bolt body (assembledPos X = -1.45).
      // Rear end (-2.15) moves with boltDX; front collar (+2.15) extends by +strikerRelDX on firing & re-compresses on 60° bolt lift!
      const x0Orig = -2.15;
      const L0 = 4.3;
      const x0New = x0Orig + boltDX;
      const x1New = 2.15 + boltDX + strikerRelDX;
      const LNew = Math.max(2.6, x1New - x0New);
      scaleX = LNew / L0;
      dx = x0New - x0Orig * scaleX;
      break;
    }

    case 'awm_trigger_shoe': {
      // Two-stage sniper trigger pull: 1st-stage take-up [0.11..0.18], tactile wall, 2nd-stage crisp glass-rod break [0.192..0.228], release [0.41..0.49]
      const stage1 = seg(f, 0.11, 0.18);
      const stage2 = seg(f, 0.192, 0.228);
      const release = seg(f, 0.41, 0.49);
      rz = (-0.11 * stage1 - 0.12 * stage2) * (1 - release);
      break;
    }

    case 'awm_sear': {
      // Slight 1st-stage engagement creep [0.11..0.18], crisp drop at 2nd-stage break [0.192..0.228], springs back [0.43..0.50]
      const searCreep = 0.16 * seg(f, 0.11, 0.18);
      const searBreak = 0.84 * seg(f, 0.192, 0.228);
      const searReset = seg(f, 0.43, 0.5);
      // Slight cam dip when cocked striker lug glides back onto top sear tooth during 60° bolt lock-down [0.90..0.96]
      const handoffDip = Math.sin(linearSeg(f, 0.9, 0.96) * Math.PI) * 0.32;
      const total = clamp01(
        (searCreep + searBreak) * (1 - searReset) + handoffDip
      );
      dy = -0.15 * total;
      rz = 0.17 * total;
      break;
    }

    case 'awm_mag_follower': {
      // Upward feed pulse inside 5-rd .338LM box magazine once bolt face clears rearward behind -1.81
      const rise = seg(f, 0.67, 0.76) - seg(f, 0.8, 0.9);
      dy = 0.38 * rise;
      break;
    }

    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes .338 Lapua Magnum (8.6×70mm) match projectile, dual-baffle brake blast, manual extraction/ejection & center-feed chambering.
 */
export function computeAwmBallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);

  const primaryExtract = seg(f, 0.5, 0.575) - seg(f, 0.91, 0.965);
  const mainDraw = seg(f, 0.58, 0.73) - seg(f, 0.78, 0.91);
  const boltDX = -0.14 * primaryExtract - 4.71 * mainDraw;

  // 1. 250gr .338 Lapua Magnum VLD Boat-Tail Projectile:
  // Seated in chamber throat at [7.30, 1.05, 0] (= caseX 4.55 + bulletLocalOffset 2.75) until ignition f = 0.260 ->
  // accelerates down 27" fluted barrel to AI brake crown X = 31.0 at f = 0.355 -> supersonic flight [0.355, 0.48]!
  const bulletVisible = f < 0.48;
  let bulletX = 7.3;
  let streakLength = 0;

  if (f >= 0.26 && f < 0.355) {
    const u = Math.pow(linearSeg(f, 0.26, 0.355), 1.45);
    bulletX = 7.3 + (31.0 - 7.3) * u;
    streakLength = 5.4 * u;
  } else if (f >= 0.355 && f < 0.48) {
    const u = linearSeg(f, 0.355, 0.48);
    bulletX = 31.0 + 62.0 * u;
    streakLength = 12.5 * (1 - u * 0.42);
  }

  // 2. Spent .338 Lapua Magnum 70mm Brass Case:
  // Seated in chamber at [4.55, 1.05, 0] during firing -> primary extraction cam unseats case [0.50..0.575] ->
  // manually extracted rearward with boltDX [0.575..0.695] ->
  // kicked out the right-side ejection port by plunger ejector in a crisp tumbling arc [0.695..0.91]!
  const spentCaseVisible = f < 0.91;
  let caseX = 4.55;
  let caseY = 1.05;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.5 && f < 0.695) {
    caseX = 4.55 + boltDX;
  } else if (f >= 0.695 && f < 0.91) {
    const u = linearSeg(f, 0.695, 0.91);
    const ejectStartX = 4.55 - 3.92; // +0.63 centered inside right-side .338LM ejection port!
    caseX = ejectStartX - 2.2 * u;
    caseY = 1.12 + 6.4 * u - 9.8 * u * u;
    caseZ = 13.5 * u;
    caseRX = u * 7.5;
    caseRY = -u * 11.2;
    caseRZ = -u * 8.8;
    if (f > 0.8) {
      spentCaseOpacity = 1 - linearSeg(f, 0.8, 0.91);
    }
  }

  // 3. Chamber Primer/Propellant Glow & AI Two-Chamber Muzzle Brake Blast (Bolt-action: zero gas port!)
  let chamberFlashIntensity = 0;
  if (f >= 0.252 && f <= 0.345) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.252, 0.345) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.345 && f <= 0.445) {
    const u = linearSeg(f, 0.345, 0.445);
    muzzlePlumeScale = 0.55 + 1.45 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.9;
  }

  // 4. Next .338 Lapua Magnum Round in 5-Rd Box Magazine (enclosed inside [-1.81, +4.51]) -> Fed into Chamber [4.55, 1.05, 0]
  let nextX = 0.02;
  let nextY = -0.35;
  let nextRZ = 0.05;

  if (f >= 0.68 && f < 0.78) {
    // Rises to center-feed lips once bolt face strokes behind X = -1.81
    const u = seg(f, 0.68, 0.78);
    nextX = 0.02 + 0.1 * u;
    nextY = -0.35 + 0.68 * u;
    nextRZ = 0.05 + 0.05 * u;
  } else if (f >= 0.78 && f < 0.91) {
    // Pushed smoothly forward by bolt face up polished chamber ramp to X = 4.41
    const u = seg(f, 0.78, 0.91);
    const rampLift = Math.sin(u * Math.PI) * 0.18;
    nextX = 0.12 + (4.41 - 0.12) * u;
    nextY = 0.33 + (1.05 - 0.33) * u + rampLift;
    nextRZ = 0.1 * (1 - u);
  } else if (f >= 0.91 && f < 0.965) {
    // Cams final +0.14 into tight headspace lockup as 6-lug bolt turns down 60° into battery!
    const u = seg(f, 0.91, 0.965);
    nextX = 4.41 + 0.14 * u;
    nextY = 1.05;
    nextRZ = 0;
  } else if (f >= 0.965) {
    // Seated in chamber — matches f = 0.00 (caseX=4.55, bulletX=7.30) to 0.000 units!
    nextX = 4.55;
    nextY = 1.05;
    nextRZ = 0;
  }

  // 5. Reserve .338 LM Cartridge below in 5-Rd Steel Box Magazine
  const magShift = seg(f, 0.68, 0.84);
  const resX = 0.02;
  const resY = -1.28 + (-0.35 - -1.28) * magShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.05, 0],
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
    reserveRoundPos: [resX, resY, 0],
  };
}

const AWM_CHASSIS_ATLAS: PbrBindingSpec = {
  albedoFile: 'awm_chassis_albedo.webp',
  normalFile: 'awm_chassis_normal.webp',
  roughnessFile: 'awm_chassis_roughness.webp',
  normalScale: 0.45,
};

export const AWM_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  awm_chassis_skins: { ...AWM_CHASSIS_ATLAS, normalScale: 0.52 },
  awm_folding_stock: { ...AWM_CHASSIS_ATLAS, normalScale: 0.48 },
  awm_action_receiver: { ...AWM_CHASSIS_ATLAS, normalScale: 0.34 },
  awm_scope: { ...AWM_CHASSIS_ATLAS, normalScale: 0.38 },
  awm_mag_body: { ...AWM_CHASSIS_ATLAS, normalScale: 0.44 },
};

export const AWM_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'awm_chassis',
    weapon: 'awm' as const,
    titleCn: '英军橄榄绿玻纤底盘、平壁钢机匣与 S&B 密位塔贴图组',
    partTag: 'F-01 / F-03 / S-01 / M-01',
    resolution: '2048 × 1024 px',
    summary:
      '参考英国精密国际（Accuracy International）L115A3 / AWM 原厂实枪打造：上半幅还原标志性英军橄榄绿（British Olive Drab #3f4e35）高强度玻纤尼龙拇指孔护壳细皮纹与内六角沉头锁紧螺栓；下半幅呈现全平面锰系磷化钢机匣原厂英文铭文、5发 .338LM 冲压加强筋弹匣，以及施密特-本德 PM II 5-25×56 狙击镜双圈白字 0–14 MIL 密位分划与翠绿多层镀膜物镜。',
    highlights: [
      '正统英军橄榄绿 (#3f4e35) 玻纤细皮纹与内六角沉头螺孔法线',
      '左侧钢机匣 ACCURACY INTERNATIONAL ENGLAND AW .338 LM 原厂激光铭文',
      'S&B PM II 双圈黄标高低塔 0–14 MIL 精密白字刻度与翠绿镜片低粗糙度 (0.06)',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'awm_chassis_albedo.webp',
        note: 'sRGB · 英军橄榄绿底盘 / 黑磷化钢机匣铭文 / S&B 白字密位刻度 / 镀膜镜片',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'awm_chassis_normal.webp',
        note: 'Linear · 玻纤尼龙微皮纹 + 内六角沉孔 + 光学平整钢机匣 + 旋钮滚花',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'awm_chassis_roughness.webp',
        note: 'Linear · 哑光橄榄绿护壳 (0.64) vs 磷化机匣 (0.42) vs 多层镀膜镜片 (0.06)',
      },
    ],
  },
  {
    id: 'awm_seamless_detail',
    weapon: 'awm',
    titleCn: '27吋不锈钢开槽比赛管、60°六突笋枪机与铝主梁无缝贴图',
    partTag: '19 MATCH BARREL & ACTION PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为全长 CNC 航空铝底盘大梁、27 英寸纵向六槽不锈钢浮置比赛枪管、双室平板制退器、防冰槽六突笋枪机及两道火扳机组件提供精密车削金属与尼龙细节。',
    highlights: [
      '27" 不锈钢开槽比赛枪管与防冰槽六突笋枪机精细拉丝',
      'CNC 航空铝合金全长底盘主梁与前插栓两脚架阳极氧化质感',
      '覆盖其余全部 19 个栓动枪机、制退器与两道火火控节点',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于不锈钢开槽枪管/六突笋枪机/铝主梁/两道火阻铁等',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 金属微表面各向异性枪油光泽起伏',
      },
      {
        kind: 'Normal',
        labelCn: '工程聚酰胺皮纹法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于高低可调贴腮板/尾托橡胶垫/球形拉机柄头等',
      },
    ],
  },
];

export const AWM_PLUGIN: WeaponRuntimePlugin = {
  id: 'awm',
  partGroups: AWM_PART_GROUPS,
  timelinePresets: AWM_TIMELINE_PRESETS,
  parts: AWM_PARTS,
  firingPhases: AWM_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(AWM_FIRING_PHASES, f),
  computeFiringKinematics: computeAwmFiringKinematics,
  computeBallisticsState: computeAwmBallisticsState,
  pbrBindings: AWM_PBR_BINDINGS,
  pbrSuites: AWM_PBR_SUITES,
};
