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
  PartKinematicDelta,
  PbrBindingSpec,
  PbrSuiteItem,
  TimelinePresetItem,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';

export const P90_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '光学上机匣与自由枪机总成',
    nameEn: 'Optical Upper Receiver & Straight-Blowback Bolt',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '人机工程拇指孔无托枪身总成',
    nameEn: 'Ergonomic Polymer Thumbhole Bullpup Stock',
    badgeColor: '#94a3b8',
  },
  {
    key: 'fire_control',
    nameZh: '渐进双阶扳机与全塑击锤盒',
    nameEn: 'Progressive Trigger & All-Polymer Hammer Pack',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '顶置50发水平弹匣与90°螺旋坡道',
    nameEn: 'Top 50-Rd Horizontal Mag & 90° Helical Ramp',
    badgeColor: '#fb923c',
  },
];

export const P90_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: 'FN P90 个人防卫武器（PDW）标准待击合拢态：顶置 50 发半透明聚碳酸酯弹匣平铺于枪脊，5.7×28mm 子弹横向排列，Ring Sight MC-10-80 光学瞄具、重型自由枪机与后置全塑击锤包严密啮合。',
  },
  {
    id: 'field_strip',
    label: '一级野战快拆',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '无需任何工具即可在 12 秒内完成 P90 四大模块野战分解：后拉双侧卡笋抬起 50 发水平弹匣，按下快拆锁笋向前滑出铝合金光学上机匣与 10.4 英寸枪管，下滑肩托盖板抽出重型枪机与全塑击锤盒。',
  },
  {
    id: 'sub_assembly',
    label: '二级螺旋与双导杆分解',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '进一步分离弹匣尾部的 90° 螺旋旋转供弹转盘、双滚轮水平推弹器、双联平行复进导杆与螺旋复进簧，直观呈现横向子弹旋转 90° 入膛与底部垂直抛壳道空间耦合。',
  },
  {
    id: 'full_exploded',
    label: '全零件军械爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 25 个核心机械节点完全展开：从斜切消焰防跳器、MC-10-80 棱镜瞄具、同轴浮动击针、跨抛壳道双钢连杆到双滚轮推弹器与全塑回转击锤，零遮挡呈现人类最超前的无托 PDW 工程美学。',
  },
];

export const P90_PARTS: WeaponPartSpec[] = [
  // ==================== 1. UPPER OPTICAL RECEIVER & BLOWBACK BOLT ('slide' · 9 parts) ====================
  {
    id: 'p90_upper_receiver',
    bomCode: 'U-01',
    nameZh: '一体铝合金光学桥上机匣',
    calloutLabel: '光学桥上机匣',
    nameEn: 'Modular Alloy Optical Upper Receiver',
    group: 'slide',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [8.8, 2.2, 0] },
      { range: [0.65, 1.0], offset: [4.2, 3.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [10.2, 5.65, 0],
    labelAppearAt: 0.05,
    roleTag: '枪管承力桥架 · 光学瞄具座与侧导轨',
    description:
      '高压压铸/挤压硬质阳极氧化铝合金模块化上机匣，前拱桥体内置 Ring Sight 反射瞄具窗与顶部应急机械瞄准沟槽，右侧集成 MIL-STD-1913 皮卡汀尼战术导轨，后拱下方精准承托 50 发水平弹匣前端。',
  },
  {
    id: 'p90_barrel',
    bomCode: 'U-02',
    nameZh: '10.4英寸冷锻镀铬枪管',
    calloutLabel: '10.4"冷锻枪管',
    nameEn: '10.4" Cold-Hammer-Forged 5.7×28mm Barrel',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 0.85, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [8.8, 2.2, 0] },
      { range: [0.35, 0.65], offset: [5.6, -0.8, 0] },
      { range: [0.65, 1.0], offset: [4.8, -0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [8.5, 0.42, 0],
    labelAppearAt: 0.22,
    roleTag: '264mm 固定枪管 · 8右旋膛线与微锥弹膛',
    description:
      '全长 264 mm（10.4 英寸）冷精锻内膛镀硬铬高强合金钢枪管，赋予 31 格令 SS190 穿甲弹 715 m/s 高初速；得益于无托后置与顶置水平供弹，全枪长仅 504 mm 却拥有卡宾枪级内弹道加速行程。',
  },
  {
    id: 'p90_flash_hider',
    bomCode: 'U-03',
    nameZh: '斜切鸟笼消焰防跳器',
    calloutLabel: '斜切消焰防跳器',
    nameEn: 'Slanted Birdcage Flash Suppressor',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [15.85, 0.85, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [8.8, 2.2, 0] },
      { range: [0.35, 0.65], offset: [8.2, -0.8, 0] },
      { range: [0.65, 1.0], offset: [8.0, -0.6, 0], rotation: [0.85, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 34,
    labelAppearAt: 0.32,
    roleTag: '枪口消焰 · 斜面燃气下压防跳',
    description:
      '标志性的 32° 下斜切端面鸟笼式消焰兼防跳补偿器：既作为枪管前端锁紧螺母将枪管固定于铝合金上机匣，又引导高压火药燃气向上偏折，显著抑制 900 发/分连发时的枪口上跳。',
  },
  {
    id: 'p90_ring_sight',
    bomCode: 'U-04',
    nameZh: 'Ring Sight MC-10-80 反射瞄具',
    calloutLabel: 'MC-10-80反射瞄具',
    nameEn: 'FN Ring Sight MC-10-80 Optical Sight',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [9.6, 4.32, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [8.8, 2.2, 0] },
      { range: [0.55, 1.0], offset: [4.2, 6.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    labelAppearAt: 0.45,
    roleTag: '无倍率准直分划 · 日间集光棱镜/夜间氚光',
    description:
      '英国 Ring Sights 专为早期型 P90 研制的 MC-10-80 紧凑型固装光学准直瞄具：日间通过前上方集光棱镜投射高对比黑环分划，暗光环境由内置氚光源点亮 T 型十字，实现无视差快速双眼瞄准。',
  },
  {
    id: 'p90_charging_handles',
    bomCode: 'U-05',
    nameZh: '双侧非随动前拉机柄',
    calloutLabel: '双侧非随动拉机柄',
    nameEn: 'Ambidextrous Non-Reciprocating Charging Handles',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [9.4, 1.48, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [8.8, 2.2, 0] },
      { range: [0.45, 0.78], offset: [4.4, 1.2, -2.4] },
      { range: [0.78, 1.0], offset: [3.2, 0.8, -1.2] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    labelAppearAt: 0.42,
    roleTag: '左右手全对称待击 · 射击零随动不打手',
    description:
      '位于上机匣两侧滑槽内的全对称翼状拉机柄：向后拉动时通过推杆顶推自由枪机待击，松手即由独立回位簧归位锁停，实弹射击过程中保持绝对静止，杜绝狭小车舱内勾挂装具或撞伤辅手。',
  },
  {
    id: 'p90_bolt',
    bomCode: 'U-06',
    nameZh: '重型自由枪机闭锁体',
    calloutLabel: '重型自由枪机',
    nameEn: 'Heavy Straight-Blowback Breech Bolt',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-5.15, 0.72, 0],
    explodeSteps: [
      { range: [0.14, 0.32], offset: [-7.5, 2.8, 0] },
      { range: [0.35, 0.65], offset: [-4.2, 2.2, 0] },
      { range: [0.65, 1.0], offset: [-3.2, 1.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.16,
    roleTag: '惯性质量闭锁 · 推弹入膛与抓弹抽壳',
    description:
      '精密铣削大质量合金钢自由枪机（Straight Blowback）：无旋转突笋或导气活塞，纯粹依靠精确配比的质量惯性与 5.7×28mm 特氟龙/聚合物干膜覆层弹壳受控微退完成安全闭锁，上设双导杆孔与窄推弹突笋。',
  },
  {
    id: 'p90_firing_pin',
    bomCode: 'U-07',
    nameZh: '同轴浮动击针与回位簧',
    calloutLabel: '同轴击针与簧',
    nameEn: 'Coaxial Floating Firing Pin & Spring',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-5.25, 0.85, 0],
    explodeSteps: [
      { range: [0.14, 0.32], offset: [-7.5, 2.8, 0] },
      { range: [0.35, 0.65], offset: [-4.2, 2.2, 0] },
      { range: [0.65, 1.0], offset: [-8.6, 3.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    labelAppearAt: 0.68,
    roleTag: '轴向传递击锤动能 · 防止惯性走火',
    description:
      '贯穿重型枪机中心孔的阶梯形硬化工具钢击针，外套装配高劲度回位螺旋簧，仅在后置全塑击锤正面敲击瞬间刺出镜面点燃底火，枪机猛烈闭锁复进时杜绝惯性偶发击发。',
  },
  {
    id: 'p90_guide_rods',
    bomCode: 'U-08',
    nameZh: '双联平行复进导杆与缓冲座',
    calloutLabel: '双复进导杆与缓冲垫',
    nameEn: 'Dual Parallel Guide Rods & Rear Buffer',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-8.85, 1.24, 0],
    explodeSteps: [
      { range: [0.14, 0.32], offset: [-7.5, 2.8, 0] },
      { range: [0.35, 0.65], offset: [-9.2, 3.8, 0] },
      { range: [0.65, 1.0], offset: [-6.4, 2.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.38,
    roleTag: '平行抗扭导向 · 尾端弹性体吸能防震',
    description:
      '左右对称贯穿枪机上部的两根无心磨削不锈钢精密导杆，尾端锚定在合成聚氨酯缓冲块（Elastomer Buffer）上：保证枪机直线往复零偏摆，并在后坐终点柔和吸收冲击能量，造就 P90 极度平顺的连发指向性。',
  },
  {
    id: 'p90_recoil_springs',
    bomCode: 'U-09',
    nameZh: '双联平行螺旋复进簧',
    calloutLabel: '双联螺旋复进簧',
    nameEn: 'Dual Parallel Helical Recoil Springs',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-14.25, 1.24, 0],
    explodeSteps: [
      { range: [0.14, 0.32], offset: [-7.5, 2.8, 0] },
      { range: [0.35, 0.65], offset: [-9.2, 3.8, 0] },
      { range: [0.65, 1.0], offset: [-10.8, 5.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 56,
    labelAppearAt: 0.68,
    roleTag: '双路蓄能缓冲 · 驱动剥弹复进闭锁',
    description:
      '套装于双联平行导杆外侧的高疲劳多股琴钢丝螺旋复进簧：射击时随自由枪机后退同步压缩蓄能，回程时推顶枪机从 90° 螺旋供弹口剥离下一发 5.7×28mm 实弹精准送入弹膛。',
  },

  // ==================== 2. BULLPUP ERGONOMIC THUMBHOLE STOCK ('frame' · 6 parts) ====================
  {
    id: 'p90_stock',
    bomCode: 'F-01',
    nameZh: '玻纤增强拇指孔无托枪身壳体',
    calloutLabel: '拇指孔无托枪身',
    nameEn: 'Polymer Ergonomic Thumbhole Bullpup Stock',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [{ range: [0.65, 1.0], offset: [0, -1.6, 0] }],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [3.2, -7.6, 0],
    labelAppearAt: 0.06,
    roleTag: '流线人机工程 · 垂直向下抛壳通道',
    description:
      '勒内·普雷达齐（René Predazzi）主导造型设计的标志性玻纤增强聚酰胺一体无托枪身：全圆弧流线无突出勾挂点，集成前置防滑护手钩、贴合手掌的椭圆拇指孔握把、超大冬季扳机护圈以及握把后方垂直向下的中央抛壳井，实现 100% 左右手无差别抵肩射击。',
  },
  {
    id: 'p90_buttplate',
    bomCode: 'F-02',
    nameZh: '滑锁防滑棱纹肩托盖板',
    calloutLabel: '滑锁肩托盖板',
    nameEn: 'Sliding Ribbed Polymer Buttplate & Latch',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-16.35, -1.95, 0],
    explodeSteps: [
      { range: [0.06, 0.24], offset: [-4.6, -3.2, 0] },
      { range: [0.65, 1.0], offset: [-6.8, -3.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.14,
    roleTag: '封闭尾托机匣腔 · 下滑快拆锁扣',
    description:
      '带横向防滑条纹的弧面尾托盖板：平时与枪身尾部锁笋扣合，牢牢挡住内部复进缓冲座与全塑击锤包；野战维护时只需按压顶部锁片向下滑出，即可打开枪托后门。',
  },
  {
    id: 'p90_takedown_lock',
    bomCode: 'F-03',
    nameZh: '上机匣横向快拆锁笋',
    calloutLabel: '上机匣快拆锁笋',
    nameEn: 'Spring-Loaded Receiver Takedown Plunger',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [1.55, 1.38, 0],
    explodeSteps: [
      { range: [0.42, 0.75], offset: [0.5, 1.6, -3.2] },
      { range: [0.75, 1.0], offset: [0.5, 1.2, -1.8] },
    ],
    calloutDir: 'up',
    calloutStem: 36,
    labelAppearAt: 0.48,
    roleTag: '一键解锁上机匣 · 弹簧自动复定位',
    description:
      '位于水平弹匣床前下方的横置弹簧锁柱：卸下弹匣后向内按压此锁笋，即可解除对铝合金光学上机匣尾耳的轴向锁定，令整套上机匣与枪管总成顺滑前推分离。',
  },
  {
    id: 'p90_mag_catches',
    bomCode: 'F-04',
    nameZh: '双侧对称顶置弹匣卡笋',
    calloutLabel: '双侧弹匣卡笋',
    nameEn: 'Ambidextrous Sliding Top-Magazine Latches',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-4.95, 1.98, 0],
    explodeSteps: [
      { range: [0.44, 0.76], offset: [-1.4, 2.4, 2.8] },
      { range: [0.76, 1.0], offset: [-1.0, 1.4, 1.6] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.48,
    roleTag: '双翼后拉解锁 · 锁紧90°供弹转盘颈部',
    description:
      '跨骑在枪身顶部供弹口后方的双侧防滑滑块卡笋：无论左手或右手操作，只需食指与拇指捏住双翼向后轻拉，锁钩即脱离 50 发水平弹匣尾端转盘环槽并向上弹起弹匣。',
  },
  {
    id: 'p90_ejection_cover',
    bomCode: 'F-05',
    nameZh: '底部抛壳道弹簧防尘活门',
    calloutLabel: '底部抛壳防尘门',
    nameEn: 'Bottom Ejection Chute Spring Dust Cover',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-3.9, -4.18, 0],
    explodeSteps: [
      { range: [0.42, 0.75], offset: [-0.8, -3.6, 0], rotation: [0, 0, 0.45] },
      { range: [0.75, 1.0], offset: [-0.8, -2.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.46,
    roleTag: '平时密封防泥沙 · 射击自动下翻排壳',
    description:
      '铰接于无托枪身腹部的扭簧防尘盖板：携行状态下自动闭合封闭垂直抛壳井防止泥沙侵入，扣动扳机与空弹壳下落时顺势向下弹开，让炽热黄铜弹壳笔直落向射手脚前地面。',
  },
  {
    id: 'p90_sling_mount',
    bomCode: 'F-06',
    nameZh: '前后战术背带挂环组件',
    calloutLabel: '战术背带挂环',
    nameEn: 'Front Loop & Rear Slot Tactical Sling Mounts',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-8.5, -0.45, 0],
    explodeSteps: [{ range: [0.65, 1.0], offset: [-2.8, -4.8, -2.2] }],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [-5.35, -3.35, 0],
    labelAppearAt: 0.68,
    roleTag: '贴身隐蔽携行 · 车组/要员护卫快拔挂点',
    description:
      '由枪托后下方嵌铸钢制穿带槽衬套与前机匣侧向旋转挂环组成，专为装甲车乘员、炮兵与要员贴身警卫（如美国特勤局）单点/三点式战术背带隐蔽携行与瞬间出枪设计。',
  },

  // ==================== 3. PROGRESSIVE TRIGGER & POLYMER HAMMER PACK ('fire_control' · 5 parts) ====================
  {
    id: 'p90_trigger',
    bomCode: 'FC-01',
    nameZh: '双阶渐进平移聚合物扳机',
    calloutLabel: '双阶渐进扳机',
    nameEn: 'Two-Stage Progressive Sliding Trigger',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [6.65, -2.35, 0],
    explodeSteps: [
      { range: [0.38, 0.7], offset: [3.2, -3.6, 0] },
      { range: [0.7, 1.0], offset: [3.6, -2.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.42,
    roleTag: '水平导轨直拉 · 半扣单发 / 到底连发',
    description:
      '传承斯太尔 AUG 理念的水平直线滑动工程塑料扳机：在快慢机拨至「A」（全自动）档位时，轻扣第一段行程触发精准半自动单发，继续向后扣到底部止点即无缝切入 900 发/分全自动齐射。',
  },
  {
    id: 'p90_selector',
    bomCode: 'FC-02',
    nameZh: '双侧同轴旋盘快慢机 (S/1/A)',
    calloutLabel: '同轴旋盘快慢机',
    nameEn: 'Ambidextrous Rotary Dial Selector (S/1/A)',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [5.95, -3.38, 0],
    explodeSteps: [
      { range: [0.42, 0.75], offset: [2.2, -5.2, 1.8] },
      { range: [0.75, 1.0], offset: [2.4, -3.2, 1.2] },
    ],
    calloutDir: 'down',
    calloutStem: 48,
    labelAppearAt: 0.46,
    roleTag: '食指下缘拨盘 · 机械限位扳机行程',
    description:
      '巧妙布置在扳机正下方的全对称齿纹旋转拨盘，左右手食指或拇指无需移开握把即可拨动：「S」档锁死扳机滑块，「1」档通过凸轮限制扳机仅能走完半自动行程，「A」档开放全行程渐进连发。',
  },
  {
    id: 'p90_transfer_bars',
    bomCode: 'FC-03',
    nameZh: '跨抛壳道双联钢制扳机连杆',
    calloutLabel: '双联钢制扳机连杆',
    nameEn: 'Twin Steel Trigger Transfer Bars',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-3.1, -1.08, 0],
    explodeSteps: [
      { range: [0.42, 0.75], offset: [0, -4.6, 0] },
      { range: [0.75, 1.0], offset: [0, -3.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.46,
    roleTag: '绕过中央抛壳井 · 零挠度双路拉杆',
    description:
      '一左一右贴枪身内壁跨过中央垂直抛壳井的平行高刚性不锈钢拉杆：将前置渐进扳机的水平位移无弹性迟滞地同步传递至 180 mm 外的枪托尾部击锤盒，兼顾底部顺畅排壳与清脆扳机感。',
  },
  {
    id: 'p90_hammer_pack',
    bomCode: 'FC-04',
    nameZh: '可快拆全聚合物模块化击锤盒',
    calloutLabel: '全聚合物击锤盒',
    nameEn: 'Removable All-Polymer Hammer Pack Housing',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [-12.65, -0.68, 0],
    explodeSteps: [
      { range: [0.12, 0.3], offset: [-7.2, -1.8, 0] },
      { range: [0.35, 0.65], offset: [-4.6, -2.6, 0] },
      { range: [0.65, 1.0], offset: [-3.8, -2.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.16,
    roleTag: '全塑自润滑火控模块 · 免工具后抽快拆',
    description:
      '安装于枪托最尾端的灰绿色高强自润滑工程塑料火控盒，内部集成主阻铁、渐进连发阻铁、不到位保险（闭锁前阻断击锤）与跌落保险，无需任何销钉工具即可整盒向后抽出保养。',
  },
  {
    id: 'p90_hammer',
    bomCode: 'FC-05',
    nameZh: '超轻高强聚合物回转击锤与扭簧',
    calloutLabel: '全塑回转击锤',
    nameEn: 'Lightweight Polymer Rotary Hammer & Spring',
    group: 'fire_control',
    material: 'follower_orange',
    assembledPos: [-11.35, -0.35, 0],
    explodeSteps: [
      { range: [0.12, 0.3], offset: [-7.2, -1.8, 0] },
      { range: [0.35, 0.65], offset: [-4.6, -2.6, 0] },
      { range: [0.65, 1.0], offset: [-5.8, 1.6, 0], rotation: [0, 0, -0.65] },
    ],
    calloutDir: 'down',
    calloutStem: 54,
    labelAppearAt: 0.68,
    roleTag: '极低转动惯量 · 毫秒级锁时与耐寒耐蚀',
    description:
      '采用特种耐冲击工程聚合物模压成型并嵌有钢制打击面的超轻回转击锤：相比传统锻钢击锤减重逾 60%，大幅缩短扣下扳机至底火点燃的锁时（Lock Time），且无需枪油即可在极寒沙尘环境顺畅运转。',
  },

  // ==================== 4. TOP-MOUNTED 50-RD HORIZONTAL MAGAZINE & 90° RAMP ('magazine' · 5 parts) ====================
  {
    id: 'p90_mag_body',
    bomCode: 'M-01',
    nameZh: '50发顶置水平半透明聚碳酸酯弹匣体',
    calloutLabel: '50发水平透明弹匣',
    nameEn: '50-Round Top-Mounted Translucent Polycarbonate Magazine',
    group: 'magazine',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-3.8, 2.66, 0],
    explodeSteps: [
      { range: [0.04, 0.26], offset: [0, 5.2, 0] },
      { range: [0.35, 0.65], offset: [0, 3.2, 0] },
      { range: [0.65, 1.0], offset: [0, 2.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-1.5, 0.72, 0],
    labelAppearAt: 0.04,
    roleTag: '烟熏半透明匣体 · 50发横向双排零突出装弹',
    description:
      '平卧贴合于枪身脊线上的烟熏茶色高抗冲聚碳酸酯（Polycarbonate）弹匣壳体：50 发 5.7×28mm 实弹与枪管呈 90° 垂直横向双排叠置（弹尖统一朝左），既彻底消除下挂长弹匣匍匐/乘车障碍，又可通过 50/25/10 刻度一眼确认余弹。',
  },
  {
    id: 'p90_helical_ramp',
    bomCode: 'M-02',
    nameZh: '90°螺旋旋转供弹坡道转盘',
    calloutLabel: '90°螺旋供弹坡道',
    nameEn: '90° Helical Cartridge-Rotating Feed Ramp Turret',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [-3.45, 2.18, 0],
    explodeSteps: [
      { range: [0.04, 0.26], offset: [0, 5.2, 0] },
      { range: [0.35, 0.65], offset: [-1.6, 0.6, 0] },
      { range: [0.65, 1.0], offset: [-2.8, -0.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.36,
    roleTag: 'FN 核心专利 · 横向子弹顺时针旋转90°入膛',
    description:
      'FN P90 最具传奇色彩的核心专利机构（美国专利 US 4,905,394）：弹匣尾端圆柱形螺旋曲面导槽在托弹簧推力下，将横向朝左（-Z）的 5.7×28mm 实弹沿三维阿基米德螺旋滑道顺时针连续旋转 90° 并下沉至双抱弹口，使其精准转正朝向枪口（+X）待枪机推入弹膛！',
  },
  {
    id: 'p90_mag_follower',
    bomCode: 'M-03',
    nameZh: '双滚轮水平推弹器',
    calloutLabel: '双滚轮水平推弹器',
    nameEn: 'Twin-Roller Horizontal Polymer Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [-1.85, 2.66, 0],
    explodeSteps: [
      { range: [0.04, 0.26], offset: [0, 5.2, 0] },
      { range: [0.35, 0.65], offset: [3.2, 3.2, 0] },
      { range: [0.65, 1.0], offset: [4.6, 4.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.42,
    roleTag: '模拟实弹双圆柱滚轮 · 保送末发过90°弯道',
    description:
      '前端装有两枚错位自由旋转聚合物滚轮的水平推弹滑块：两枚滚轮的外径恰好模拟两发并排的 5.7×28mm 弹体，使托弹器能够顺畅探入 90° 螺旋坡道颈部，将第 50 发末弹彻底推至抱弹口而绝不卡滞。',
  },
  {
    id: 'p90_mag_spring',
    bomCode: 'M-04',
    nameZh: '长行程水平推进扁簧',
    calloutLabel: '水平推进弹匣簧',
    nameEn: 'Horizontal Magazine Drive Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [2.25, 2.66, 0],
    explodeSteps: [
      { range: [0.04, 0.26], offset: [0, 5.2, 0] },
      { range: [0.35, 0.65], offset: [6.8, 3.2, 0] },
      { range: [0.65, 1.0], offset: [8.4, 5.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    labelAppearAt: 0.48,
    roleTag: '恒压水平后推 · 克服90°螺旋转向摩擦',
    description:
      '由弹匣前端底盖向枪尾方向（-X）水平施力的矩形截面多圈琴钢丝弹簧：具备恒定渐进推力曲线，确保在 900 发/分高射速与倒置射击姿态下，50 发横向弹列均能毫无迟滞地旋过 90° 坡道。',
  },
  {
    id: 'p90_mag_floorplate',
    bomCode: 'M-05',
    nameZh: '前端可拆卸弹匣底盖板与锁扣',
    calloutLabel: '弹匣前端底盖',
    nameEn: 'Front Detachable Magazine Locking End-Plate',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [6.52, 2.66, 0],
    explodeSteps: [
      { range: [0.04, 0.26], offset: [0, 5.2, 0] },
      { range: [0.35, 0.65], offset: [10.4, 3.2, 0] },
      { range: [0.65, 1.0], offset: [12.6, 5.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.48,
    roleTag: '前端卡扣封闭 · 快速清沙拆洗弹匣内腔',
    description:
      '封锁于顶置水平弹匣最前端（靠近光学桥后拱窝）的卡扣式工程塑料端盖：按压中心钢制锁柱即可滑脱端盖，抽出水平推进簧与双滚轮推弹器清理聚碳酸酯内壁。',
  },
];

export const P90_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'phase_1',
    stepNum: '01',
    shortLabel: '扣压双阶扳机',
    title: '食指后拉渐进式水平扳机，跨抛壳井双钢连杆联动后置阻铁',
    range: [0.0, 0.14],
    description:
      '射手食指穿过流线型前护圈扣压水平滑动扳机，左右两根不锈钢连杆绕过中央垂直抛壳井同步后移，牵引枪托尾端全塑击锤盒内的主阻铁向后滑脱。',
  },
  {
    id: 'phase_2',
    stepNum: '02',
    shortLabel: '全塑击锤击发',
    title: '超轻全聚合物回转击锤高速前摆，撞击同轴击针点燃 5.7×28mm 底火',
    range: [0.14, 0.23],
    description:
      '主阻铁释放瞬间，极低惯量的耐冲击全工程塑料击锤在扭簧驱动下高速向上前摆，精准敲击重型枪机尾端的浮动击针，刺破 5.7×28mm 实弹底火引燃双基球形发射药。',
  },
  {
    id: 'phase_3',
    stepNum: '03',
    shortLabel: '出膛与惯性闭锁',
    title: 'SS190 尖头弹 715 m/s 高速出膛，重型枪机惯性驻留安全闭锁',
    range: [0.23, 0.33],
    description:
      '31 格令钢铝复合芯尖头弹沿 264 mm 冷锻镀铬枪管加速至 715 m/s 掠过斜切防跳消焰器；重型自由枪机凭借大质量惯性在膛压峰值期仅微退不足 1.8 mm，干膜覆层直壁瓶颈弹壳始终严密闭气。',
  },
  {
    id: 'phase_4',
    stepNum: '04',
    shortLabel: '自由枪机直退',
    title: '余压推动自由枪机沿双平行导杆直线后坐，压倒全塑击锤并压缩双复进簧',
    range: [0.33, 0.44],
    description:
      '弹头出膛泄压后，残余膛压推动重型自由枪机沿双联不锈钢平行导杆无旋转笔直后退（零回转突笋开锁），同步对称压缩双螺旋复进簧并将全塑击锤重新压回待击阻铁。',
  },
  {
    id: 'phase_5',
    stepNum: '05',
    shortLabel: '底部垂直抛壳',
    title: '枪机触碰尾部缓冲块，空弹壳经中央垂直抛壳井推开防尘门笔直下落',
    range: [0.44, 0.57],
    description:
      '拉壳钩抓持 5.7×28mm 空弹壳随枪机后退撞击固定抛壳挺，弹壳不再向侧面飞溅，而是顺着握把后方的中央垂直抛壳道向下冲开底部弹簧防尘门直接落向地面，彻底实现左右手零干扰射击！',
  },
  {
    id: 'phase_6',
    stepNum: '06',
    shortLabel: '90°螺旋旋转推弹',
    title: '顶置水平弹匣次发实弹经 90° 螺旋坡道顺时针旋转转正，枪机复进推弹入膛',
    range: [0.57, 0.86],
    description:
      '双滚轮推弹器将横向朝左（-Z）的次发 5.7×28mm 实弹推入尾端 90° 螺旋供弹坡道，子弹沿螺旋导槽顺时针平滑旋转 90° 转为朝向枪口（+X）并落至抱弹口，复进枪机剥弹直推入膛合拢。',
  },
  {
    id: 'phase_7',
    stepNum: '07',
    shortLabel: '渐进阻铁复位',
    title: '底部防尘活门回弹闭合，渐进扳机与双连杆前移完成单发断路复位',
    range: [0.86, 1.0],
    description:
      '抛壳道防尘门在扭簧作用下自动闭合防尘；松开双阶渐进扳机，双联钢连杆前移复位，全塑击锤盒内的单发断路器平顺将击锤交接回主阻铁台面，进入下一发待击状态。',
  },
];

/**
 * Real-time 60fps mechanical kinematics for FN P90 (`p90`) across f ∈ [0, 1].
 * Models progressive sliding trigger + twin transfer bars -> lightweight polymer hammer strike ->
 * heavy straight-blowback inertial dwell & non-rotating linear recoil (`rx = 0`) ->
 * dual parallel recoil spring compression against stationary rear buffer -> bottom dust-cover swing ->
 * twin-roller horizontal magazine follower feed pulse.
 */
export function computeP90FiringKinematics(
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

  // 1. Heavy Straight-Blowback Bolt Motion:
  //    Safe inertial micro-dwell (-0.18u = 1.8mm) during [0.23, 0.32] while bullet clears 264mm barrel ->
  //    brisk linear straight-blowback stroke to -4.15 against rear elastomer buffer [0.32, 0.51] ->
  //    smooth stripping & chambering return [0.55, 0.84]. Zero axial rotation (`rx = 0`)!
  const boltDwell = seg(f, 0.23, 0.32);
  const boltMainBack = seg(f, 0.32, 0.51);
  const boltReturn = seg(f, 0.55, 0.84);
  const boltDX = (-0.18 * boltDwell - 3.97 * boltMainBack) * (1 - boltReturn);

  // 2. Two-Stage Progressive Sliding Polymer Trigger & Twin Transfer Bars
  const trigPull1 = seg(f, 0.0, 0.08);
  const trigPull2 = seg(f, 0.08, 0.14);
  const trigRelease = seg(f, 0.87, 0.96);
  const triggerDX = (-0.28 * trigPull1 - 0.24 * trigPull2) * (1 - trigRelease);

  switch (partId) {
    case 'p90_bolt': {
      dx = boltDX;
      break;
    }

    case 'p90_firing_pin': {
      const strike = seg(f, 0.16, 0.19) - seg(f, 0.22, 0.29);
      dx = boltDX + 0.32 * strike;
      break;
    }

    case 'p90_recoil_springs': {
      // Local spring spans [0.06, 6.55] (L0 = 6.55) anchored at rear buffer [-14.25, 1.24, 0]
      const L0 = 6.55;
      const LNew = Math.max(2.4, L0 + boltDX);
      scaleX = LNew / L0;
      break;
    }

    case 'p90_trigger':
    case 'p90_transfer_bars': {
      dx = triggerDX;
      break;
    }

    case 'p90_hammer': {
      // Cocked rearward (rz = 0) -> swings forward/upward (rz = -1.18 rad) at [0.14, 0.185] ->
      // cammed back down by recoiling bolt [0.33, 0.42] -> sear handoff [0.89, 0.95]
      const swing = seg(f, 0.14, 0.185);
      const recock = seg(f, 0.33, 0.42);
      const searHandoff = seg(f, 0.89, 0.95);
      rz = -1.18 * swing + 1.24 * recock - 0.06 * searHandoff;
      break;
    }

    case 'p90_ejection_cover': {
      // Bottom ejection chute dust flap hinges open (`rx = +0.62 rad`) during downward brass ejection [0.44, 0.72]
      const flapOpen = seg(f, 0.44, 0.5) - seg(f, 0.68, 0.78);
      rx = 0.62 * flapOpen;
      dy = -0.18 * flapOpen;
      break;
    }

    case 'p90_mag_follower': {
      // Twin-roller follower pushes horizontally rearward (-X) to advance horizontal stack into 90° ramp
      const push = seg(f, 0.53, 0.66) - seg(f, 0.69, 0.84);
      dx = -0.62 * push;
      break;
    }

    case 'p90_mag_spring': {
      // Horizontal magazine spring anchored near front floorplate expands slightly as follower advances
      const push = seg(f, 0.53, 0.66) - seg(f, 0.69, 0.84);
      scaleX = 1 + 0.06 * push;
      dx = -0.22 * push;
      break;
    }

    // p90_barrel, p90_charging_handles (non-reciprocating!), p90_guide_rods remain stationary
    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes 5.7×28mm FN SS190 PDW internal & external ballistics for FN P90:
 *  1. Supersonic 715 m/s 31gr spitzer accelerating down 264mm barrel [-1.90 -> +16.85]
 *  2. Straight-blowback extraction [-1.90 -> -3.95] followed by **vertical downward ejection (-Y)**
 *     straight through the bottom bullpup stock chute (`X ≈ -3.90, Z ≈ 0`)!
 *  3. **Signature 90° Helical Feed Ramp Rotation (`nextRoundRotY: +π/2 -> 0`)**:
 *     Cartridge starts horizontally sideways (`nextRoundRotY = +π/2`, pointing `-Z` Left) inside
 *     the top-mounted magazine (`[-3.85, 2.66, 0]`), spirals clockwise `90°` around `+Y` while
 *     descending through `p90_helical_ramp` (`Y: 2.66 -> 1.42 -> 0.85`), and chambers axially
 *     (`nextRoundRotY = 0`, pointing `+X`) at `[-1.90, 0.85, 0]`!
 */
export function computeP90BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);

  const boltDwell = seg(f, 0.23, 0.32);
  const boltMainBack = seg(f, 0.32, 0.51);
  const boltReturn = seg(f, 0.55, 0.84);
  const boltDX = (-0.18 * boltDwell - 3.97 * boltMainBack) * (1 - boltReturn);

  // 1. 5.7×28mm SS190 Spitzer Projectile
  const bulletVisible = f < 0.44;
  let bulletX = -1.9;
  let streakLength = 0;

  if (f >= 0.185 && f < 0.285) {
    const u = Math.pow(linearSeg(f, 0.185, 0.285), 1.35);
    bulletX = -1.9 + 18.75 * u; // Exits slanted flash hider at X = +16.85
    streakLength = 3.8 * u;
  } else if (f >= 0.285 && f < 0.44) {
    const u = linearSeg(f, 0.285, 0.44);
    bulletX = 16.85 + 54.0 * u;
    streakLength = 9.2 * (1 - u * 0.45);
  }

  // 2. Polymer-Lacquered 5.7×28mm Brass Case — Straight-Blowback Extraction & VERTICAL DOWNWARD EJECTION!
  const spentCaseVisible = f < 0.76;
  let caseX = -1.9;
  let caseY = 0.85;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.23 && f < 0.46) {
    caseX = -1.9 + boltDX;
  } else if (f >= 0.46 && f < 0.76) {
    const u = linearSeg(f, 0.46, 0.76);
    // Fixed ejector kicks case straight DOWNWARD (-Y) through vertical stock chute X ≈ -3.90!
    caseX = -3.92 - 0.55 * u;
    caseY = 0.85 - 4.2 * u - 10.5 * u * u;
    caseZ = 0.18 * Math.sin(u * Math.PI);
    caseRX = u * 4.2;
    caseRY = u * 2.6;
    caseRZ = -u * 8.4;
    if (f > 0.63) {
      spentCaseOpacity = 1 - linearSeg(f, 0.63, 0.76);
    }
  }

  // 3. Chamber Glow & Slanted Compensator Muzzle Plume (Zero gas port bleed — pure blowback!)
  let chamberFlashIntensity = 0;
  if (f >= 0.18 && f <= 0.265) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.18, 0.265) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.275 && f <= 0.365) {
    const u = linearSeg(f, 0.275, 0.365);
    muzzlePlumeScale = 0.38 + 1.18 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.78;
  }

  // 4. Next 5.7×28mm Round — Top Horizontal Stack (ry = +π/2) -> 90° Helical Ramp -> Axial Chamber (ry = 0)!
  let nextX = -3.65;
  let nextY = 2.66;
  let nextRY = Math.PI * 0.5;
  let nextRZ = 0;

  if (f >= 0.52 && f < 0.68) {
    // Spirals 90° clockwise through `p90_helical_ramp` while descending from Y=2.66 to feed lips Y=1.22!
    const u = seg(f, 0.52, 0.68);
    nextX = -3.65 + (-3.45 - -3.65) * u;
    nextY = 2.66 + (1.22 - 2.66) * u;
    nextRY = Math.PI * 0.5 * (1 - u);
    nextRZ = -0.1 * Math.sin(u * Math.PI);
  } else if (f >= 0.68 && f < 0.84) {
    // Stripped forward by returning bolt horn from feed lips [-3.45, 1.22, 0] straight into chamber [-1.90, 0.85, 0]!
    const u = seg(f, 0.68, 0.84);
    nextX = -3.45 + (-1.9 - -3.45) * u;
    nextY = 1.22 + (0.85 - 1.22) * u;
    nextRY = 0;
    nextRZ = -0.06 * Math.sin(u * Math.PI);
  } else if (f >= 0.84) {
    nextX = -1.9;
    nextY = 0.85;
    nextRY = 0;
    nextRZ = 0;
  }

  // 5. Reserve Horizontal Cartridge in Top Magazine advancing rearward (-X) toward the 90° helical throat
  const magAdvance = seg(f, 0.52, 0.72);
  const resX = -2.65 + (-3.65 - -2.65) * magAdvance;
  const resY = 2.66;

  return {
    bulletVisible,
    bulletPos: [bulletX, 0.85, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity: 0,
    gasPortPos: [0, 0.85, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotY: nextRY,
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0],
    reserveRoundRotY: Math.PI * 0.5,
  };
}

export const P90_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  p90_stock: {
    albedoFile: 'p90_stock_albedo.webp',
    normalFile: 'p90_stock_normal.webp',
    roughnessFile: 'p90_stock_roughness.webp',
    normalScale: 0.46,
  },
  p90_upper_receiver: {
    albedoFile: 'p90_stock_albedo.webp',
    normalFile: 'p90_stock_normal.webp',
    roughnessFile: 'p90_stock_roughness.webp',
    normalScale: 0.36,
  },
  p90_ring_sight: {
    albedoFile: 'p90_stock_albedo.webp',
    normalFile: 'p90_stock_normal.webp',
    roughnessFile: 'p90_stock_roughness.webp',
    normalScale: 0.32,
  },
  p90_mag_body: {
    albedoFile: 'p90_mag_albedo.webp',
    normalFile: 'p90_mag_normal.webp',
    roughnessFile: 'p90_mag_roughness.webp',
    normalScale: 0.58,
  },
  p90_helical_ramp: {
    albedoFile: 'p90_mag_albedo.webp',
    normalFile: 'p90_mag_normal.webp',
    roughnessFile: 'p90_mag_roughness.webp',
    normalScale: 0.52,
  },
};

export const P90_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'p90_stock',
    weapon: 'p90' as const,
    titleCn: '比利时 FN 拇指孔无托聚合物枪身、铝合金光学桥与 MC-10-80 瞄具贴图组',
    partTag: 'F-01 / U-01 / U-04 BULLPUP & RING SIGHT',
    resolution: '2048 × 1024 px',
    summary:
      '专为 FN Herstal P90 标志性流线无托结构烘焙的 2K 5 通道 ORM 贴图组：下半幅呈现炭黑玻纤增强聚酰胺枪身的 EDM 火花蚀纹握把区、双侧「FN HERSTAL BELGIUM · P90 CAL 5.7×28」与序列号「FN084912」凹刻铭牌；上半幅分离深灰硬质阳极氧化铝合金光学桥机匣、CNC 皮卡汀尼侧轨齿顶高光、Ring Sight MC-10-80 准直镜激光铭文与蓝宝石青多层增透物镜。',
    highlights: [
      '枪身双侧 FN HERSTAL BELGIUM · P90 CAL 5.7×28 原厂模具压印与 EDM 防滑纹',
      '硬质阳极氧化铝合金光学桥、CNC 导轨齿倒角与 5.7×28 NATO 激光标刻',
      'Ring Sight MC-10-80 光学镜体与蓝宝石青增透镀膜镜片 (0.07) 高反差物理分层',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'p90_stock_albedo.webp',
        note: 'sRGB · 炭黑玻纤聚酰胺枪身 / 深灰阳极氧化铝光学桥 / 蓝宝石青镀膜物镜',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'p90_stock_normal.webp',
        note: 'Linear · VDI-27 握把微火花纹 + 原厂凹刻滚印 + 导轨与瞄具铣削边缘',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'p90_stock_roughness.webp',
        note: 'Linear · R:高度积分AO / G:镜片(0.07)-阳极铝(0.39)-聚合物(0.68) / B:逐纹素金属度',
      },
    ],
  },
  {
    id: 'p90_mag',
    weapon: 'p90' as const,
    titleCn: '顶置 50 发烟熏半透明水平弹匣与 90° 螺旋供弹转盘贴图组',
    partTag: 'M-01 / M-02 50-RD HORIZONTAL MAG & 90° RAMP',
    resolution: '2048 × 1024 px',
    summary:
      '真实还原 FN P90 独步全球的顶置水平 50 发烟熏茶色聚碳酸酯（Polycarbonate）弹匣与尾部 90° 螺旋旋转供弹转盘：在半透明烟熏滤光层下清晰透出与枪管垂直横向双排叠列的 5.7×28mm SS190 黄铜瓶颈弹壳与紫铜尖头弹，表层模压横向防滑凸筋与「50 / 25 / 10」余弹观察刻度；底栏刻画 90° 螺旋滑道上的黄铜摩擦亮带与硬化钢抱弹口。',
    highlights: [
      '半透明烟熏茶色聚碳酸酯透视 50 发横向双排 5.7×28mm 实弹列阵',
      '原厂模压「50 · 25 · 10」余弹观察窗刻度与横向加强肋法线凹凸',
      '尾部 90° 螺旋供弹转盘自润滑聚合物基体与黄铜旋滑摩擦轨迹',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'p90_mag_albedo.webp',
        note: 'sRGB · 烟熏茶色透明匣顶透视横向 5.7×28mm 黄铜弹列 + 90° 螺旋滑道',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'p90_mag_normal.webp',
        note: 'Linear · 聚碳酸酯横向防滑肋 + 50/25/10 浮雕数字 + 90° 螺旋导槽斜坡',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'p90_mag_roughness.webp',
        note: 'Linear · 透明观察窗高光清漆感 (0.18) vs 螺旋滑道钢制抱弹口金属反光',
      },
    ],
  },
  {
    id: 'p90_seamless_detail',
    weapon: 'p90',
    titleCn: '10.4吋冷锻枪管、自由枪机双导杆与全塑击锤包无缝细节贴图',
    partTag: '20 PDW INTERNAL PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为 264mm 冷锻镀铬枪管、斜切防跳消焰器、重型自由枪机、双联平行复进导杆、跨抛壳井双钢连杆以及后置全工程塑料击锤盒提供微米级 CNC 车削金属拉丝与自润滑聚合物纹理细节。',
    highlights: [
      '重型自由枪机铣削平面、双平行无心磨削导杆与斜切消焰器金属拉丝',
      '后置全工程塑料击锤盒、双阶渐进扳机与双滚轮推弹器注塑皮纹',
      '覆盖其余全部 20 个无托 PDW 核心内部运动构件',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于10.4"冷锻枪管/斜切消焰器/重型自由枪机/双导杆/双连杆等',
      },
      {
        kind: 'Roughness',
        labelCn: '金属拉丝油膜粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 磷化钢与硬铬表面微粗糙度枪油起伏',
      },
      {
        kind: 'Normal',
        labelCn: '工程聚酰胺皮纹法线 (Seamless)',
        fileName: 'polymer_detail_normal.webp',
        note: 'Linear · 用于全塑击锤盒/渐进扳机/同轴旋盘快慢机/滑锁肩托等',
      },
    ],
  },
];

export const P90_PLUGIN: WeaponRuntimePlugin = {
  id: 'p90',
  partGroups: P90_PART_GROUPS,
  timelinePresets: P90_TIMELINE_PRESETS,
  parts: P90_PARTS,
  firingPhases: P90_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(P90_FIRING_PHASES, f),
  computeFiringKinematics: computeP90FiringKinematics,
  computeBallisticsState: computeP90BallisticsState,
  pbrBindings: P90_PBR_BINDINGS,
  pbrSuites: P90_PBR_SUITES,
};
