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
  G11_BORE_Y,
  G11_BREECH_X,
  G11_GEAR_X,
  G11_MAG_Y,
} from './meshes/g11Geometries';

export const G11_ID: WeaponId = 'g11';
export const G11_CALIBER: CaliberProfile = '473_caseless';

export const G11_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '浮置枪管机匣、90°旋转圆柱弹膛与导气齿条组',
    nameEn: 'Floating Barreled Action, 90-Deg Rotary Breech & Gas Rack',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '德军橄榄炭黑单体外壳、集成提把光学镜与上膛摇柄组',
    nameEn: 'Monocoque Polymer Casing, Integral Optic & Winding Crank',
    badgeColor: '#d97706',
  },
  {
    key: 'fire_control',
    nameZh: '钟表级齿轮棘爪、垂直压弹冲头与三发超高速火控组',
    nameEn: 'Clockwork Gear Train, Vertical Rammer & 3-Rd Burst FCU',
    badgeColor: '#f43f5e',
  },
  {
    key: 'magazine',
    nameZh: '置顶水平45发4.73×33mm DM11无壳弹匣组',
    nameEn: 'Overhead 45-Round 4.73x33mm DM11 Caseless Magazine',
    badgeColor: '#10b981',
  },
];

export const G11_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: '黑克勒-科赫 H&K G11 K2（4.73×33mm DM11 无壳弹）标准待击态：全长 750 mm 未来派单体聚合物方盒机身，540 mm 浮置冷锻枪管内藏于外壳之中，45 发无壳弹匣卧置于枪管正上方，内部 90° 旋转圆柱弹膛处于水平闭锁对正状态。',
  },
  {
    id: 'field_strip',
    label: '野战外壳抽离态',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '按联邦国防军（Bundeswehr）野战勤务规程：向前拔出置顶 45 发 DM11 无壳弹匣，拆下尾托缓冲盖与集成 1×/3.5× 光学提把，并将整套浮置钢制内机匣与钟表机芯从单体聚合物外壳中分离。',
  },
  {
    id: 'sub_assembly',
    label: '钟表机芯深度分解',
    subLabel: '65% Clockwork Strip',
    t: 0.65,
    desc: '完全敞开“德式太空黑科技（Kraut Space Magic）”机械心脏：分离 90° 旋转镀铬圆柱弹膛、不锈钢/黄铜行星齿轮系、短行程导气齿条拉杆、垂直压弹冲头、同轴击针及 2,100 发/分三连发计数器火控盒。',
  },
  {
    id: 'full_exploded',
    label: '全枪 24 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 24 个精密机械节点零穿模展开：从 540 mm 浮置枪管、90° 旋转圆柱弹膛、瑞士钟表级啮合齿轮系、垂直无壳弹压弹冲头到 45 发置顶无壳弹匣与双备弹夹，完整呈现人类轻武器工程史最疯狂的机械巅峰。',
  },
];

export const G11_PARTS: WeaponPartSpec[] = [
  // ==================== 1. FLOATING BARRELED ACTION & ROTARY BREECH ('slide' · 7 parts) ====================
  {
    id: 'g11_barrel',
    bomCode: 'S-01',
    nameZh: '540mm冷锻镀铬浮置4.73mm枪管',
    calloutLabel: '540mm浮置4.73枪管',
    nameEn: '540mm Chrome-Lined Free-Floating 4.73mm CHF Barrel',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, G11_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [15.0, 0, 0] },
      { range: [0.68, 1.0], offset: [11.0, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [24.0, -0.75, 0],
    labelAppearAt: 0.36,
    roleTag: '540mm 浮置长管 · 随内机匣三连发整体后坐 -42mm',
    description:
      '全长 540 mm 的 4.73 mm 铬钼钢冷精锻镀铬枪管，后端压入浮置钢制内机匣节套并与 90° 旋转圆柱弹膛端面气密对接；在 2,100 发/分三连发超高速点射期间，整根枪管随内机匣在外壳内自由后坐 42 mm，确保三发弹头悉数出膛后后坐力才传递至射手肩部！',
  },
  {
    id: 'g11_flash_hider',
    bomCode: 'S-02',
    nameZh: 'H&K G11六槽消焰器与下挂刺刀座',
    calloutLabel: '六槽消焰器与刺刀座',
    nameEn: 'H&K G11 Slotted Flash Hider & Bayonet Lug',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [34.5, G11_BORE_Y, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [17.5, 0, 0] },
      { range: [0.68, 1.0], offset: [12.5, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.38,
    roleTag: '六开槽鸟笼消焰 · 兼容枪榴弹卡环与下置刺刀座',
    description:
      '旋装于 540 mm 浮置枪管前端的氮化钢六槽鸟笼消焰器，外圈集成北约标准 22 mm 枪榴弹固定簧环与下置刺刀锁座，随浮置枪管同步后坐缓冲，有效抑制高初速（930 m/s）4.73×33mm 无壳发射药的膛口闪光。',
  },
  {
    id: 'g11_inner_receiver',
    bomCode: 'S-03',
    nameZh: '浮置数控钢制内机匣导轨总成',
    calloutLabel: '浮置钢制内机匣',
    nameEn: 'Floating CNC Machined Steel Inner Barreled-Action Chassis',
    group: 'slide',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.16, 0.36], offset: [0, 1.8, 4.8] },
      { range: [0.66, 1.0], offset: [0, 1.7, 3.7] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-10.0, 2.1, 2.2],
    labelAppearAt: 0.18,
    roleTag: '全枪浮置后坐核心 · 承载枪管、旋转弹膛与钟表齿轮系',
    description:
      'G11 实现「延迟后坐（Delayed Impulse）」奇迹的钢铁骨架：将枪管、90° 旋转弹膛、钟表齿轮组、导气齿条与置顶弹匣刚性整合为单一浮置单元，悬浮于外部聚合物方盒内的精密纵向导轨上，可在三发 2,100 RPM 连发期间平滑后退 42 mm。',
  },
  {
    id: 'g11_rotary_breech',
    bomCode: 'S-04',
    nameZh: '90°旋转镀铬圆柱弹膛（无壳闭锁核心）',
    calloutLabel: '90°旋转圆柱弹膛',
    nameEn: '90-Degree Rotating Cylindrical Breech Block',
    group: 'slide',
    material: 'stainless',
    assembledPos: [G11_BREECH_X, G11_BORE_Y, 0],
    explodeSteps: [
      { range: [0.36, 0.7], offset: [-1.2, 0, 0] },
      { range: [0.7, 1.0], offset: [-0.8, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    labelAppearAt: 0.16,
    roleTag: '无壳弹颠覆性闭锁 · 旋转90°垂直吞弹再转平击发',
    description:
      '人类轻武器史上最令人拍案叫绝的机构：硬铬精密研磨圆柱体横向贯穿一条 4.73×33mm 矩形无壳弹膛，两侧周缘精铣驱动齿轮。装填时绕 Z 轴旋转 90° 将弹膛口朝正上方接住垂直压入的新无壳弹，随后旋回 0° 水平与枪管紧密气密对接击发——全程无抽壳、无抛壳！',
  },
  {
    id: 'g11_gas_piston',
    bomCode: 'S-05',
    nameZh: '枪管下置短行程导气箍与镀铬活塞',
    calloutLabel: '短行程导气活塞',
    nameEn: 'Under-Barrel Short-Stroke Gas Tap Block & Chrome Piston',
    group: 'slide',
    material: 'stainless',
    assembledPos: [3.2, -1.55, 0],
    explodeSteps: [
      { range: [0.36, 0.7], offset: [8.0, -2.5, 0] },
      { range: [0.7, 1.0], offset: [6.0, -2.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.4,
    roleTag: '高能燃气取气口 · 短行程猛击钟表齿条启动循环',
    description:
      '紧固于 540 mm 枪管中段下方的精密导气箍与双气密环镀铬短行程活塞：弹头越过取气孔瞬间，高压火药燃气推动活塞向后猛击 13.5 mm，将澎湃脉冲精确注入下方双齿条驱动杆，点燃整套钟表齿轮系的超高速机械节拍。',
  },
  {
    id: 'g11_driving_rod',
    bomCode: 'S-06',
    nameZh: '双联不锈钢导气齿条驱动杆（Zahnstange）',
    calloutLabel: '双联导气齿条杆',
    nameEn: 'Twin Stainless Gas-Actuated Toothed Rack Driving Rod',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-9.2, -2.15, 0],
    explodeSteps: [
      { range: [0.36, 0.7], offset: [1.8, -4.2, 0] },
      { range: [0.7, 1.0], offset: [1.2, -3.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.42,
    roleTag: '直线脉冲转旋转力矩 · 14齿精密齿条啮合钟表主轮',
    description:
      '横跨浮置内机匣底部的双列 CNC 不锈钢齿条连杆（德语 Zahnstange）：前端横轭承接导气活塞短行程冲击，后段左右双列 14 枚高强度青铜/钢齿条直接咬合主齿轮底部节圆，将直线后坐脉冲无打滑地转化为 90° 圆柱弹膛的精确往复旋转。',
  },
  {
    id: 'g11_recoil_spring',
    bomCode: 'S-07',
    nameZh: '浮置机匣长行程螺旋复进主簧',
    calloutLabel: '浮置机匣复进主簧',
    nameEn: 'Floating-Action Long-Stroke Helical Recoil Spring',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-32.8, -3.05, 0],
    explodeSteps: [
      { range: [0.36, 0.7], offset: [-6.0, -3.0, 0] },
      { range: [0.7, 1.0], offset: [-4.0, -2.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.42,
    roleTag: '锚定尾缓冲座 · 吸收42mm浮置冲程并平稳推回待击位',
    description:
      '沿枪身纵轴安置在内机匣后下方的 19 圈琴钢丝长行程螺旋复进簧：后端锚固于外壳尾部的静止液压缓冲座，前端顶推浮置内机匣；在 2,100 RPM 三连发期间柔和压缩 30% 吸收全部冲量，随后将浮置枪管与钟表机匣平顺送回前沿基准位。',
  },

  // ==================== 2. MONOCOQUE POLYMER SHELL, OPTIC & CONTROLS ('frame' · 7 parts) ====================
  {
    id: 'g11_outer_housing',
    bomCode: 'F-01',
    nameZh: '联邦国防军橄榄炭黑单体玻纤聚合物外壳',
    calloutLabel: 'G11单体聚合物外壳',
    nameEn: 'Bundeswehr Olive-Charcoal Monocoque Polymer Outer Casing',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      { range: [0.08, 0.3], offset: [0, 5.0, -6.0] },
      { range: [0.66, 1.0], offset: [0, 4.0, -4.5] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [-16.0, 6.5, -3.2],
    labelAppearAt: 0.06,
    roleTag: '全封闭防泥沙方盒机身 · 无侧面抛壳窗 · 左侧铭文与旋柄槽',
    description:
      '赋予 H&K G11 K2 极具科幻辨识度的整块式玻纤增强聚酰胺方盒外壳：彻底取消传统步枪侧面抛壳窗（仅底面设哑弹紧急清理盖），将精密钟表内机匣与置顶弹匣严密防尘密封；前段设双侧散热百叶窗，左侧压刻「HK G11 K2 · CAL. 4.73×33 DM11」与乌尔姆鹿角试枪章。',
  },
  {
    id: 'g11_optic_handle',
    bomCode: 'F-02',
    nameZh: '集成提把式Hensoldt 1×/3.5×双倍光学瞄准镜',
    calloutLabel: '集成1×/3.5×光学提把',
    nameEn: 'Integral Carry-Handle Hensoldt 1x/3.5x Optical Sight',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-0.5, 6.55, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [0, 12.5, 0] },
      { range: [0.66, 1.0], offset: [0, 9.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 5.6, 0],
    labelAppearAt: 0.08,
    roleTag: '祖母绿-蓝宝石多层镀膜物镜 · 兼备应急机械瞄具与提把',
    description:
      '德国 Hensoldt 光学公司为 G11 K2 量身定制的集成提把式光学组件：内部封装 1 倍近战 / 3.5 倍中距反射式光学镜组（前后配防眩多层绿蓝镀膜镜片），顶部融合 STANAG 战术导轨肋与应急机械缺口准星，下方镂空走廊充当平衡重心提把。',
  },
  {
    id: 'g11_pistol_grip',
    bomCode: 'F-03',
    nameZh: '人体工学H&K倾斜握把与全封闭冬季护圈',
    calloutLabel: 'H&K握把与冬季护圈',
    nameEn: 'Ergonomic H&K Contoured Pistol Grip & Welded Winter Guard',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-1.8, -5.6, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [0, -10.5, 0] },
      { range: [0.68, 1.0], offset: [0, -8.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [-1.8, -8.5, 0],
    labelAppearAt: 0.36,
    roleTag: '前后实心焊接闭环护圈 · 适配寒带厚手套操作',
    description:
      '沿袭黑克勒-科赫经典指槽与手掌贴合曲线的无托前置聚合物握把，前端一体注塑延伸出宽大封闭式冬季扳机护圈并刚性焊入前护木下缘（前后零悬空），严寒战场佩戴厚重防寒手套亦可精准扣动扳机。',
  },
  {
    id: 'g11_buttplate',
    bomCode: 'F-04',
    nameZh: '横肋硫化橡胶缓冲托底板与尾部快拆盖',
    calloutLabel: '缓冲托底与快拆尾盖',
    nameEn: 'Ribbed Charcoal Rubber Buttplate & Rear Takedown Cap',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-34.6, -0.1, 0],
    explodeSteps: [
      { range: [0.06, 0.28], offset: [-6.5, 5.0, -6.0] },
      { range: [0.66, 1.0], offset: [-5.0, 4.0, -4.5] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.1,
    roleTag: '双尾销快速解锁 · 高摩擦横向防滑抵肩缓冲',
    description:
      '封闭单体聚合物机匣尾部的炭黑硫化橡胶减震托底板兼勤务尾盖：表面模压八道高摩擦横向防滑肋条稳固贴合防弹衣肩窝，拔出两枚尾部自锁横销即可取下尾盖并向后整体抽出内部缓冲器与浮置钢机匣。',
  },
  {
    id: 'g11_winding_knob',
    bomCode: 'F-05',
    nameZh: '左侧弹出式圆形钟表发条上膛摇柄',
    calloutLabel: '弹出式钟表上膛摇柄',
    nameEn: 'Side-Mounted Pop-Out Circular Clockwork Winding Crank',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-15.2, -0.8, -3.22],
    explodeSteps: [
      { range: [0.1, 0.32], offset: [0, 5.0, -8.5] },
      { range: [0.66, 1.0], offset: [0, 4.0, -6.3] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.14,
    roleTag: '顺时针手摇360°上膛 · 无常规拉机柄的钟表仪式感',
    description:
      'H&K G11 机身左侧最具传奇色彩的控制件——取消了传统前后拉动式拉机柄，改用嵌入侧壁凹槽的圆形折叠摇柄（Spannkurbel）：弹开摇臂顺时针旋拧一圈，即可手动驱转内部齿轮系令圆柱弹膛翻转吞入首发 DM11 无壳弹并挂起击针，亦可手摇退出哑弹！',
  },
  {
    id: 'g11_spare_clips',
    bomCode: 'F-06',
    nameZh: 'K2型前护木双侧备用45发弹匣卡具',
    calloutLabel: '双侧45发备弹匣卡具',
    nameEn: 'K2 Forend Twin Side-Mounted Spare 45-Rd Magazine Clips',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [15.5, 3.6, 0],
    explodeSteps: [
      { range: [0.12, 0.34], offset: [6.0, 13.5, 0] },
      { range: [0.66, 1.0], offset: [6.0, 10.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.16,
    roleTag: '单枪随身135发火力 · G11 K2定型版标志性外观',
    description:
      'G11 K2 最终军用定型版增配的前护木马鞍式左右双备弹匣快挂支架：允许步兵在主弹匣两侧直接并行挂装两支满载 45 发 DM11 无壳弹匣，无需取用胸挂弹袋即可随枪携带惊人的 135 发立即可用基数！',
  },
  {
    id: 'g11_buffer_assembly',
    bomCode: 'F-07',
    nameZh: '尾部液压-弹性体浮置后坐缓冲器总成',
    calloutLabel: '尾部浮置后坐缓冲器',
    nameEn: 'Rear Hydraulic-Elastomer Floating-Action Buffer Assembly',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-32.8, -1.6, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [-10.0, 0, 0] },
      { range: [0.68, 1.0], offset: [-7.0, 0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.38,
    roleTag: '承接三连发末发总冲量 · 兼具复进主簧静止尾座',
    description:
      '安装于外壳尾腔最底端的钢制阻尼缓冲基座与高弹聚氨酯止撞垫：在 2,100 RPM 三连发点射第三发弹头已脱离枪口后，温柔截停向后滑行 42 mm 的浮置钢制内机匣，把原本剧烈分散的三次跳动融合成单次柔和直推感。',
  },

  // ==================== 3. CLOCKWORK GEAR TRAIN, RAMMER & BURST FCU ('fire_control' · 6 parts) ====================
  {
    id: 'g11_clockwork_gears',
    bomCode: 'FC-01',
    nameZh: '瑞士钟表级不锈钢/黄铜行星齿轮与凸轮系',
    calloutLabel: '钟表级齿轮与凸轮系',
    nameEn: 'Swiss-Watch CNC Stainless & Brass Spur Gear Train',
    group: 'fire_control',
    material: 'copper_accent',
    assembledPos: [G11_GEAR_X, G11_BORE_Y, 0],
    explodeSteps: [
      { range: [0.38, 0.7], offset: [3.0, 0, 0] },
      { range: [0.7, 1.0], offset: [2.0, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    labelAppearAt: 0.16,
    roleTag: '“德式太空黑科技”灵魂 · 1:1节圆啮合驱动旋转弹膛',
    description:
      '令美军 ACR 计划评估专家惊呼“仿佛拆开了一块布谷鸟挂钟（Kraut Space Magic）”的核心传动系：由双侧 26 齿精密 CNC 不锈钢主齿轮、内嵌 C36000 自润滑黄铜棘轮凸轮盘及下置连杆轴构成，下方咬合导气齿条、后方精确 1:1 节圆啮合 90° 圆柱弹膛并同步时序驱动压弹冲头与击针！',
  },
  {
    id: 'g11_loading_rammer',
    bomCode: 'FC-02',
    nameZh: '顶部垂直弹簧凸轮无壳弹压弹冲头',
    calloutLabel: '垂直无壳弹压弹冲头',
    nameEn: 'Vertical Spring-Cam Overhead Caseless Loading Rammer',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [G11_BREECH_X, 5.25, 0],
    explodeSteps: [
      { range: [0.34, 0.68], offset: [-3.5, 7.5, 0] },
      { range: [0.68, 1.0], offset: [-2.5, 5.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.36,
    roleTag: '弹膛转至90°瞬间垂直下压 26.5mm · 精准推入DM11药块',
    description:
      '架设于置顶弹匣后端供弹口正上方的黄铜端头垂直推弹冲头（Zuführstößel）：当圆柱弹膛旋转至 90° 垂直张口时，由钟表凸轮释放向下垂直疾刺 26.5 mm，将一发棱角分明的 4.73×33mm DM11 方形无壳弹稳准压入圆柱弹膛底部，随即抽回让位闭锁。',
  },
  {
    id: 'g11_firing_pin',
    bomCode: 'FC-03',
    nameZh: '后置同轴硬化不锈钢击针与待击耳',
    calloutLabel: '后置同轴击针杆',
    nameEn: 'Coaxial Hardened Stainless Striker Rod & Cocking Lug',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-24.4, G11_BORE_Y, 0],
    explodeSteps: [
      { range: [0.36, 0.7], offset: [-4.5, 0, 0] },
      { range: [0.7, 1.0], offset: [-3.5, 0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.4,
    roleTag: '仅在0°水平完全对正时穿刺DM11底火 · 机械互锁防走火',
    description:
      '沿枪管中心线布置于圆柱弹膛正后方的 17-4PH 不锈钢同轴击针杆：内置严格机械互锁——唯有当旋转弹膛精确归零至 0° 水平闭锁位时，击针前冲 4.5 mm 才可穿入后气密孔撞击 DM11 无壳弹底部的无锈蚀火帽；开锁旋转前自动回缩确保绝对安全。',
  },
  {
    id: 'g11_trigger_pack',
    bomCode: 'FC-04',
    nameZh: '内部钟表三发点射计数器与阻铁火控盒',
    calloutLabel: '三发超高速火控盒',
    nameEn: 'Internal Clockwork 3-Round Hyperburst Counter & Sear Pack',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-2.2, -4.45, 0],
    explodeSteps: [
      { range: [0.36, 0.7], offset: [-2.5, -6.0, 0] },
      { range: [0.7, 1.0], offset: [-1.5, -4.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.4,
    roleTag: '2,100 RPM三发棘轮计数 · 460 RPM可控全自动降速器',
    description:
      '安置于浮置内机匣下方的前置模块化钢制火控盒：内藏黄铜三发点射棘轮计数器与浮置后坐脱钩连杆——在「3」档以惊人的 2,100 发/分（三发总耗时仅 85 毫秒）全速爆射并在第三发强制截停，而在「A」全自动档则等待浮置机匣回位再发射，将连发射速优雅压低至极其可控的 460 发/分！',
  },
  {
    id: 'g11_trigger',
    bomCode: 'FC-05',
    nameZh: '弧面钢制扳机与长行程联动拉杆',
    calloutLabel: '弧面扳机与传递杆',
    nameEn: 'Curved Steel Trigger Shoe & Transfer Linkage Bar',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [3.2, -6.55, 0],
    explodeSteps: [
      { range: [0.36, 0.7], offset: [3.5, -6.0, 0] },
      { range: [0.7, 1.0], offset: [2.5, -4.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.42,
    roleTag: '无托前置干脆击发感 · 刚性拉杆直联三发计数阻铁',
    description:
      '居中悬置于全封闭冬季护圈内的弧面氮化钢扳机与双侧不锈钢刚性传递杆：通过精密低摩擦导槽将射手食指扣压精准传递至后方的钟表火控盒，攻克了传统无托步枪扳机绵软拖泥带水的顽疾。',
  },
  {
    id: 'g11_selector',
    bomCode: 'FC-06',
    nameZh: '双侧联动四档快慢机拨杆 (S / 1 / 3 / A)',
    calloutLabel: '四档快慢机(S/1/3/A)',
    nameEn: 'Ambidextrous 4-Position Fire Selector Lever (S / 1 / 3 / A)',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-1.5, -3.8, 0],
    explodeSteps: [
      { range: [0.36, 0.7], offset: [-2.5, -6.0, 4.0] },
      { range: [0.7, 1.0], offset: [-1.5, -4.5, 2.5] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.42,
    roleTag: '安全 / 单发 / 2100RPM三连发 / 460RPM全自动四态速切',
    description:
      '贯穿单体聚合物外壳握把上方的双侧对称四档快慢机轴与醒目红尖指拨杆：左右手拇指均可快速拨选「S」保险、「1」半自动单发、「3」2,100 发/分三发超高速延迟后坐点射与「A」460 发/分慢速精准全自动模式。',
  },

  // ==================== 4. OVERHEAD 45-RD 4.73×33mm DM11 CASELESS MAGAZINE ('magazine' · 4 parts) ====================
  {
    id: 'g11_mag_tube',
    bomCode: 'M-01',
    nameZh: '置顶水平45发4.73×33mm DM11无壳弹匣管',
    calloutLabel: '45发置顶无壳弹匣管',
    nameEn: 'Overhead 45-Round 4.73x33mm DM11 Caseless Magazine Tube',
    group: 'magazine',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [3.6, G11_MAG_Y, 0],
    explodeSteps: [
      { range: [0.04, 0.28], offset: [8.0, 9.5, 0] },
      { range: [0.64, 1.0], offset: [6.0, 7.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [10.0, 1.8, 0],
    labelAppearAt: 0.06,
    roleTag: '枪管正上方前插式装填 · 纵排45枚方形DM11棕黄无壳药块',
    description:
      '全长 522 mm、从枪口上方前插滑入浮置内机匣导轨的革命性置顶水平弹匣：半透明烟熏强化聚合/铝质匣体内单列直立紧密排布 45 发 4.73×33mm DM11 方形高能无壳弹（赭黄色 HITP 成型发射药块内嵌平齐铜被甲尖弹头），侧壁印有「15 / 30 / 45」余弹刻度。',
  },
  {
    id: 'g11_mag_follower',
    bomCode: 'M-02',
    nameZh: '高可视安全橙水平防倾无壳弹推弹块',
    calloutLabel: '安全橙无壳推弹块',
    nameEn: 'High-Visibility Safety-Orange Horizontal Caseless Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [19.4, G11_MAG_Y, 0],
    explodeSteps: [
      { range: [0.04, 0.28], offset: [15.5, 9.5, 0] },
      { range: [0.64, 1.0], offset: [12.0, 7.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.38,
    roleTag: '鲜明安全橙空仓辨识 · 平推45枚方形DM11药块防碎裂',
    description:
      '采用低摩擦聚甲醛注塑的高可视安全橙色防倾滑块：紧贴第 45 发方形无壳药块前端，在水平托弹簧推力下均匀施压防止脆性发射药块受偏心剪切碎裂；打空 45 发滑至尾端观察窗时发出醒目橙色空弹警示。',
  },
  {
    id: 'g11_mag_spring',
    bomCode: 'M-03',
    nameZh: '置顶水平长行程恒力螺旋供弹簧',
    calloutLabel: '水平置顶供弹螺旋簧',
    nameEn: 'Overhead Horizontal Helical Caseless Magazine Feed Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [29.6, G11_MAG_Y, 0],
    explodeSteps: [
      { range: [0.04, 0.28], offset: [16.5, 9.5, 0] },
      { range: [0.64, 1.0], offset: [13.0, 7.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.4,
    roleTag: '前端锚固向后恒力推送 · 支撑2,100 RPM三连发供弹节拍',
    description:
      '前端顶靠弹匣前卡口盖、沿枪管上方纵轴向后推送橙色托弹块的 16 圈高疲劳琴钢丝水平螺旋簧：赋予 45 发轻量化无壳弹柱（整支满载弹匣仅重约 0.34 kg！）充沛平稳的后推加速度，完美追赶 2,100 发/分的惊人循环节奏。',
  },
  {
    id: 'g11_mag_endcap',
    bomCode: 'M-04',
    nameZh: '前端旋锁刺刀式无壳弹匣防潮封盖',
    calloutLabel: '前旋锁弹匣防潮盖',
    nameEn: 'Front Twist-Lock Bayonet Caseless Magazine Endcap',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [29.6, G11_MAG_Y, 0],
    explodeSteps: [
      { range: [0.04, 0.28], offset: [18.5, 9.5, 0] },
      { range: [0.64, 1.0], offset: [14.0, 7.0, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.38,
    roleTag: '旋锁密封防潮护药 · 兼作前插换弹抓握提耳',
    description:
      '位于置顶无壳弹匣最前端的滚花翼耳旋锁封盖：内侧带弹簧承座锚固水平供弹簧，外部包覆密封唇口隔绝雨水湿气保护裸露 HITP 无壳发射药块，轻旋解锁即可向前极速抽换整支 45 发弹匣。',
  },
];

// ============================================================================
// 7-Phase H&K G11 K2 "Kraut Space Magic" Caseless Rotary-Breech Firing Cycle
// ============================================================================

export const G11_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'g11_phase_1_trigger_strike',
    stepNum: '01',
    shortLabel: '扣机脱钩同轴击发',
    title: '阶段 1 · 扣动前置扳机释放钟表阻铁，同轴击针穿刺水平旋转弹膛',
    range: [0.0, 0.1],
    description:
      '射手扣压全封闭冬季护圈内的弧面扳机，传递拉杆拨动三发计数火控盒阻铁脱钩；经机械互锁确认 90° 圆柱弹膛已精确处于 0° 水平闭锁位后，后置同轴不锈钢击针前刺 4.5 mm 撞击 DM11 无壳弹底火。',
  },
  {
    id: 'g11_phase_2_caseless_ignition',
    stepNum: '02',
    shortLabel: '无壳爆燃与短距取气',
    title: '阶段 2 · 4.73×33mm DM11 无壳药块 380 MPa 全燃，930 m/s 弹头出膛无壳抛',
    range: [0.1, 0.22],
    description:
      '耐高温 HITP 方形无壳发射药块在密闭圆柱弹膛内瞬间完全燃烧产生 380 MPa 峰值膛压（零黄铜弹壳残留！），推动 3.4 克 4.73 mm 尖头弹以 930 m/s 沿 540 mm 浮置枪管出膛，同时中段取气孔高压燃气猛推短行程导气活塞。',
  },
  {
    id: 'g11_phase_3_floating_recoil_clockwork',
    stepNum: '03',
    shortLabel: '浮置后坐与90°旋膛',
    title: '阶段 3 · 浮置枪管机匣整体后坐 -42mm，双齿条驱转钟表齿轮将弹膛旋至 90°',
    range: [0.22, 0.38],
    description:
      'G11 延迟后坐精髓尽显：整个内机匣、540 mm 枪管、旋转弹膛与置顶弹匣在外壳内整体平滑后坐 -42 mm 压缩主复进簧；同时击针回缩，双联齿条拉杆后移 24.5 mm 驱转不锈钢/黄铜钟表齿轮系，将镀铬圆柱弹膛精准旋转整整 90°（+π/2 rad）使空弹膛垂直朝上对准弹匣供弹口！',
  },
  {
    id: 'g11_phase_4_rammer_plunge',
    stepNum: '04',
    shortLabel: '垂直压弹与45发进给',
    title: '阶段 4 · 垂直压弹冲头下刺 26.5mm 压入新 DM11 无壳药块，水平弹匣补位',
    range: [0.38, 0.56],
    description:
      '当浮置内机匣在 -42 mm 后止点轻触尾部液压缓冲器、圆柱弹膛稳定停留于 90° 垂直开口态瞬间，上方压弹冲头由凸轮驱使垂直下冲 26.5 mm，将一发崭新的方形 4.73×33mm DM11 无壳弹直接压入圆柱弹膛，橙色托弹块在水平弹簧推动下顺势后移一格补弹。',
  },
  {
    id: 'g11_phase_5_rammer_retract_rotate_back',
    stepNum: '05',
    shortLabel: '冲头抽回与弹膛归平',
    title: '阶段 5 · 压弹冲头迅速回撤，钟表齿轮反旋将载弹圆柱弹膛转回 0° 水平位',
    range: [0.56, 0.74],
    description:
      '垂直压弹冲头迅速向上抽出清出弹膛旋转通道；双联齿条回位驱动瑞士钟表级齿轮系反向回转，将装填完毕的 90° 圆柱弹膛顺滑旋回 0° 水平轴线，使方形 DM11 无壳弹的铜被甲尖头严丝合缝对准 540 mm 枪管尾端坡膛！',
  },
  {
    id: 'g11_phase_6_floating_runout',
    stepNum: '06',
    shortLabel: '浮置总成平稳复进',
    title: '阶段 6 · 压缩复进主簧释放蓄能，推动整套浮置枪管与钟表机匣滑回前止点',
    range: [0.74, 0.9],
    description:
      '三连发脉冲结束后，尾部蓄能的 19 圈长行程螺旋复进主簧平稳舒张（压缩比 70.4% → 100%），将浮置钢制内机匣、540 mm 枪管、消焰器、旋转弹膛与置顶 45 发无壳弹匣整体向前推送 42 mm 回归静止前基准位。',
  },
  {
    id: 'g11_phase_7_sealed_battery_reset',
    stepNum: '07',
    shortLabel: '气密闭锁与棘轮复位',
    title: '阶段 7 · 圆柱弹膛与枪管气密锁死，三发点射计数器与扳机阻铁无跳变复位',
    range: [0.9, 1.0],
    description:
      '圆柱弹膛前端气密环与枪管尾面精密压合形成高压密封；松开弧面扳机后，三发超高速点射棘轮计数器归零复位、击针重新挂靠主阻铁，整套无壳钟表自动机以零跳变闭环重回待击状态。',
  },
];

interface G11ClockworkSample {
  /** Floating barreled-action rearward recoil displacement (`0 -> -4.20 cm -> 0`) */
  floatDx: number;
  /** 90° rotary breech cylinder Z-rotation (`0 -> +π/2 -> 0`) */
  breechRotZ: number;
  /** Meshing Swiss-watch spur gear Z-rotation (`0 -> -1.80 rad -> 0`) */
  gearRotZ: number;
  /** Short-stroke gas piston rearward stroke relative to inner receiver (`0 -> -1.35 cm -> 0`) */
  pistonRelDx: number;
  /** Toothed rack driving rod rearward stroke relative to inner receiver (`0 -> -2.45 cm -> 0`) */
  rackRelDx: number;
  /** Vertical loading rammer downward plunge (`0 -> -2.65 cm -> 0`) */
  rammerDy: number;
  /** Coaxial firing pin forward strike (`0 -> +0.45 cm -> 0`) */
  pinStrikeDx: number;
  /** Overhead magazine follower & spring surge (`[-0.5, +1.0]`) */
  magSpringScaleX: number;
  magFollowerRelDx: number;
  /** Trigger pull `[0, 1]` */
  trigPull: number;
}

/**
 * Exact coupled H&K G11 K2 floating-action + 90° rotary-breech clockwork kinematics across `f ∈ [0, 1]`.
 * Every channel settles smoothly to exact rest (`0` / `scaleX = 1`) by `f = 0.96` so `f = 0.995 -> 1.0`
 * has strictly zero discontinuity (`endpointJump === 0`).
 */
function sampleG11Clockwork(f: number): G11ClockworkSample {
  // 1. Trigger squeeze & release
  const trigPull = seg(f, 0.0, 0.08) - seg(f, 0.9, 0.96);

  // 2. Coaxial firing pin forward strike at ignition [0.055..0.105], retracting cleanly before breech turns at 0.22!
  const pinStrikeDx = 0.45 * (seg(f, 0.055, 0.105) - seg(f, 0.14, 0.2));

  // 3. Short-stroke under-barrel gas piston impulse at [0.16..0.24], returning cleanly [0.28..0.38]
  const pistonRelDx = -1.35 * (seg(f, 0.16, 0.23) - seg(f, 0.28, 0.38));

  // 4. Floating barreled-action assembly recoils -4.20 cm rearward [0.20..0.38], cushions on rear buffer,
  //    then smoothly runs back forward to 0.00 cm across [0.74..0.90]!
  const floatRecoil01 = Math.max(0, seg(f, 0.2, 0.38) - seg(f, 0.74, 0.9));
  const floatDx = -4.2 * floatRecoil01;

  // 5. Toothed rack driving rod & 90° rotating cylindrical breech + meshing clockwork gear train:
  //    Turns 0 -> +90° (+π/2 rad) over [0.22..0.38], dwells locked vertically at 90° over [0.38..0.58]
  //    while vertical rammer seats the DM11 caseless block, then rotates smoothly back 90° -> 0 over [0.58..0.74]!
  const rotCycle01 = Math.max(0, seg(f, 0.22, 0.38) - seg(f, 0.58, 0.74));
  const breechRotZ = (Math.PI * 0.5) * rotCycle01;
  const gearRotZ = -1.8 * rotCycle01;
  const rackRelDx = -2.45 * rotCycle01;

  // 6. Vertical loading rammer plunges -2.65 cm down into vertical breech cylinder during [0.40..0.56]!
  const rammerPlunge01 = Math.max(0, seg(f, 0.4, 0.48) - seg(f, 0.49, 0.565));
  const rammerDy = -2.65 * rammerPlunge01;

  // 7. Overhead horizontal magazine spring (`L0 = 9.2 cm`, front-pinned at local x = 0):
  //    Slightly compresses (`scaleX -> 0.93`) under recoil acceleration [0.22..0.38], then expands (`scaleX -> 1.12`)
  //    as it pushes the 45-round DM11 caseless column rearward -1.10 cm during feed [0.44..0.64], settling to 1.0 by 0.88!
  const recoilSurge = Math.sin(linearSeg(f, 0.22, 0.38) * Math.PI);
  const feedAdvance = Math.max(0, seg(f, 0.44, 0.56) - seg(f, 0.72, 0.88));
  const magSpringScaleX = 1.0 - 0.07 * recoilSurge + 0.12 * feedAdvance;
  const magFollowerRelDx = -9.2 * (magSpringScaleX - 1.0);

  return {
    floatDx,
    breechRotZ,
    gearRotZ,
    pistonRelDx,
    rackRelDx,
    rammerDy,
    pinStrikeDx,
    magSpringScaleX,
    magFollowerRelDx,
    trigPull,
  };
}

export function computeG11FiringKinematics(
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

  const cw = sampleG11Clockwork(f);

  switch (partId) {
    // Floating barreled-action rigid core (-4.20 cm rearward recoil inside stationary outer monolith!)
    case 'g11_inner_receiver':
    case 'g11_barrel':
    case 'g11_flash_hider':
    case 'g11_mag_tube':
    case 'g11_mag_endcap': {
      dx = cw.floatDx;
      break;
    }

    case 'g11_rotary_breech': {
      dx = cw.floatDx;
      rz = cw.breechRotZ; // Exact 0 -> +π/2 (+1.5708 rad) -> 0!
      break;
    }

    case 'g11_clockwork_gears': {
      dx = cw.floatDx;
      rz = cw.gearRotZ; // Meshing counter-rotation 0 -> -1.80 rad -> 0!
      break;
    }

    case 'g11_gas_piston': {
      dx = cw.floatDx + cw.pistonRelDx;
      break;
    }

    case 'g11_driving_rod': {
      dx = cw.floatDx + cw.rackRelDx;
      break;
    }

    case 'g11_loading_rammer': {
      dx = cw.floatDx;
      dy = cw.rammerDy; // Vertical -2.65 cm feed plunge!
      break;
    }

    case 'g11_firing_pin': {
      dx = cw.floatDx + cw.pinStrikeDx;
      break;
    }

    case 'g11_recoil_spring': {
      // Rear-pinned at stationary rear buffer (local x = 0, rest length 14.2 cm):
      // Compresses cleanly from 14.2 cm -> 10.0 cm (`scaleX: 1.000 -> 0.704`) matching floatDx = -4.20 cm!
      const L0 = 14.2;
      scaleX = (L0 + cw.floatDx) / L0;
      break;
    }

    case 'g11_mag_spring': {
      // Front-pinned at g11_mag_endcap (rides with floatDx), extends/compresses `0.93 -> 1.12`!
      dx = cw.floatDx;
      scaleX = cw.magSpringScaleX;
      break;
    }

    case 'g11_mag_follower': {
      // Rides inside overhead mag tube & advances rearward with magSpring expansion!
      dx = cw.floatDx + cw.magFollowerRelDx;
      break;
    }

    case 'g11_trigger': {
      dx = -0.32 * cw.trigPull;
      rz = 0.24 * cw.trigPull;
      break;
    }

    // Stationary outer polymer monolith, optic handle, grip, buttplate, winding knob, spare clips, buffer, trigger pack & selector
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
 * Computes `4.73×33mm DM11` Caseless internal & external ballistics for H&K G11 K2:
 *  - `ignitionF = 0.11`, `muzzleExitF = 0.20` along 540 mm floating barrel `Y = 0.0` (`X: -19.5 -> +39.0`)
 *  - **100% Caseless**: `spentCaseVisible = false` across ALL `f` (zero brass case ejection!)
 *  - Overhead vertical DM11 caseless block descends `-Y` from mag throat (`Y = +3.95`) into 90° vertical
 *    rotary breech (`Y = 0.0`), then rotates 90° (`-π/2 -> 0`) into horizontal firing alignment!
 */
export function computeG11BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const cw = sampleG11Clockwork(f);

  // 1. 4.73mm (3.4g / 52gr) DM11 High-Velocity Spitzer Projectile (930 m/s)
  const bulletVisible = f < 0.36;
  let bulletX = G11_BREECH_X + 1.4;
  let streakLength = 0;

  if (f >= 0.11 && f < 0.2) {
    const u = Math.pow(linearSeg(f, 0.11, 0.2), 1.32);
    bulletX = G11_BREECH_X + 1.4 + (39.0 - (G11_BREECH_X + 1.4)) * u;
    streakLength = 5.2 * u;
  } else if (f >= 0.2 && f < 0.36) {
    const u = linearSeg(f, 0.2, 0.36);
    bulletX = 39.0 + 78.0 * u;
    streakLength = 11.5 * (1 - u * 0.4);
  }

  // 2. Chamber Ignition Flash, Under-Barrel Gas Tap Flash & Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.105 && f <= 0.19) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.105, 0.19) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.155 && f <= 0.235) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.155, 0.235) * Math.PI) * 0.88;
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.195 && f <= 0.285) {
    const u = linearSeg(f, 0.195, 0.285);
    muzzlePlumeScale = 0.42 + 1.45 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.86;
  }

  // 3. Next 4.73×33mm DM11 Caseless Round:
  //    Stands vertically (-π/2) inside overhead mag feed mouth [G11_BREECH_X + floatDx, +3.95, 0],
  //    plunges straight down into 90° rotary breech during [0.40..0.52], then rotates smoothly
  //    from vertical (-π/2) to horizontal (0) inside the breech across [0.58..0.74]!
  const nextX = G11_BREECH_X + cw.floatDx;
  let nextY = G11_MAG_Y;
  let nextRZ = -Math.PI * 0.5;

  if (f >= 0.4 && f < 0.54) {
    const u = seg(f, 0.4, 0.52);
    nextY = G11_MAG_Y * (1 - u);
    nextRZ = -Math.PI * 0.5;
  } else if (f >= 0.54 && f < 0.74) {
    const u = seg(f, 0.58, 0.74);
    nextY = G11_BORE_Y;
    nextRZ = -Math.PI * 0.5 * (1 - u);
  } else if (f >= 0.74) {
    nextY = G11_BORE_Y;
    nextRZ = 0;
  }

  // 4. Reserve DM11 Caseless Round advancing rearward by one pitch (0.88 cm) along overhead magazine
  const magShift = seg(f, 0.46, 0.62);
  const resX = G11_BREECH_X + cw.floatDx + 0.88 * (1 - magShift);
  const resY = G11_MAG_Y;

  return {
    bulletVisible,
    bulletPos: [bulletX, G11_BORE_Y, 0],
    streakLength,
    // 100% Caseless 4.73×33mm DM11 propellant block — ZERO spent brass case!
    spentCaseVisible: false,
    spentCasePos: [G11_BREECH_X, G11_BORE_Y, 0],
    spentCaseRot: [0, 0, 0],
    spentCaseOpacity: 0,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [6.2 + cw.floatDx, -0.75, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0],
  };
}

// ============================================================================
// 3×2K 5-Channel Packed ORM WebP PBR Bindings (Exact Match with g11.glb!)
// ============================================================================

const G11_V3_HOUSING_PBR: PbrBindingSpec = {
  albedoFile: 'g11_v3_housing_albedo.webp',
  normalFile: 'g11_v3_housing_normal.webp',
  roughnessFile: 'g11_v3_housing_roughness.webp',
  normalScale: 0.88,
};

const G11_V3_CLOCKWORK_PBR: PbrBindingSpec = {
  albedoFile: 'g11_v3_clockwork_albedo.webp',
  normalFile: 'g11_v3_clockwork_normal.webp',
  roughnessFile: 'g11_v3_clockwork_roughness.webp',
  normalScale: 0.85,
};

const G11_V3_BARREL_MAG_PBR: PbrBindingSpec = {
  albedoFile: 'g11_v3_barrel_mag_albedo.webp',
  normalFile: 'g11_v3_barrel_mag_normal.webp',
  roughnessFile: 'g11_v3_barrel_mag_roughness.webp',
  normalScale: 0.86,
};

export const G11_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  // Suite 1 — g11_v3_housing (7 solid parts)
  g11_outer_housing: G11_V3_HOUSING_PBR,
  g11_optic_handle: G11_V3_HOUSING_PBR,
  g11_pistol_grip: G11_V3_HOUSING_PBR,
  g11_buttplate: G11_V3_HOUSING_PBR,
  g11_winding_knob: G11_V3_HOUSING_PBR,
  g11_selector: G11_V3_HOUSING_PBR,
  g11_spare_clips: G11_V3_HOUSING_PBR,

  // Suite 2 — g11_v3_clockwork (9 solid parts)
  g11_inner_receiver: G11_V3_CLOCKWORK_PBR,
  g11_rotary_breech: G11_V3_CLOCKWORK_PBR,
  g11_clockwork_gears: G11_V3_CLOCKWORK_PBR,
  g11_driving_rod: G11_V3_CLOCKWORK_PBR,
  g11_gas_piston: G11_V3_CLOCKWORK_PBR,
  g11_loading_rammer: G11_V3_CLOCKWORK_PBR,
  g11_firing_pin: G11_V3_CLOCKWORK_PBR,
  g11_buffer_assembly: G11_V3_CLOCKWORK_PBR,
  g11_trigger_pack: G11_V3_CLOCKWORK_PBR,

  // Suite 3 — g11_v3_barrel_mag (6 solid parts)
  g11_barrel: G11_V3_BARREL_MAG_PBR,
  g11_flash_hider: G11_V3_BARREL_MAG_PBR,
  g11_trigger: G11_V3_BARREL_MAG_PBR,
  g11_mag_tube: G11_V3_BARREL_MAG_PBR,
  g11_mag_follower: G11_V3_BARREL_MAG_PBR,
  g11_mag_endcap: G11_V3_BARREL_MAG_PBR,
};

export const G11_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'g11_v3_housing',
    weapon: G11_ID,
    titleCn: '德军橄榄炭黑单体外壳、Hensoldt 1×/3.5×光学提把与四档射控贴图组',
    partTag: 'F-01~F-06 / FC-06 MONOCOQUE CASING & HENSOLDT OPTIC',
    resolution: '2048 × 2048 px',
    summary:
      '由 Blender 5.2 Cycles GPU 烘焙的 H&K G11 K2 主体外壳 2K 5 通道 Packed ORM 贴图组：精细刻画西德联邦国防军橄榄炭黑（Olive-Charcoal）玻纤聚合物单体外壳、奥伯恩多夫红框「[HK] G11 K2 · CAL. 4.73×33 DM11 / HECKLER & KOCH GMBH OBERNDORF」铭印、乌尔姆（Ulm）鹿角联邦鹰试枪戳记、双侧红白「S / 1 / 3 / A」四档射控图标、弹出式上膛摇柄刻度以及 UV 严密隔离的祖母绿-蓝宝石多层镀膜 Hensoldt 光学镜片。',
    highlights: [
      '联邦国防军橄榄炭黑玻纤聚合物皮纹、奥伯恩多夫红框 [HK] 铭牌与乌尔姆鹿角试枪章',
      '双侧高反差红白「S / 1 / 3 / A」四档射控图标（2,100 RPM 三连发 / 460 RPM 全自动）',
      'UV 防火墙严格隔离的祖母绿-蓝宝石 Hensoldt 1×/3.5× 多层镀膜物镜与目镜',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'g11_v3_housing_albedo.webp',
        note: 'sRGB · 橄榄炭黑聚合物外壳 / 红白 S-1-3-A 铭印 / 乌尔姆试枪章 / 绿蓝镀膜镜片',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'g11_v3_housing_normal.webp',
        note: 'Linear · 模压加强肋 + 散热百叶 + 凹刻奥伯恩多夫铭文与握把防滑皮纹',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'g11_v3_housing_roughness.webp',
        note: 'Linear · R:Cycles接触AO / G:光学镀膜(0.08)-氮化件(0.30)-聚合物(0.60)-橡胶托底(0.78) / B:金属度',
      },
    ],
  },
  {
    id: 'g11_v3_clockwork',
    weapon: G11_ID,
    titleCn: '90°旋转镀铬圆柱弹膛、瑞士钟表齿轮系与浮置钢制内机匣贴图组',
    partTag: 'S-03~S-06 / FC-01~FC-04 / F-07 KRAUT SPACE MAGIC CLOCKWORK',
    resolution: '2048 × 2048 px',
    summary:
      '专为 H&K G11 K2 剖视核心打造的钟表机械 2K 5 通道 Packed ORM 贴图组：呈现硬铬径向拉丝 90° 旋转圆柱弹膛（含矩形无壳弹膛腔与试枪蚀刻）、高反差 CNC 不锈钢与 C36000 自润滑黄铜行星齿轮系、14 齿导气齿条连杆、垂直压弹冲头、同轴击针及三发点射计数器棘轮盒，各向异性车铣刀痕与金属润油光泽层次分明。',
    highlights: [
      '硬铬镜面拉丝 90° 旋转圆柱弹膛、径向车削纹与矩形 4.73×33mm 无壳弹膛积碳过渡',
      'CNC 不锈钢 26 齿主轮与 C36000 黄金黄铜行星凸轮盘/三发棘轮的瑞士钟表金属反差',
      '浮置钢制内机匣镂空导轨磨损划痕、氮化钢基体与聚氨酯液压缓冲垫材质分离',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'g11_v3_clockwork_albedo.webp',
        note: 'sRGB · 硬铬旋转圆柱弹膛 / 不锈钢与C36000黄铜钟表齿轮 / 浮置钢机匣',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'g11_v3_clockwork_normal.webp',
        note: 'Linear · 径向车床刀痕 + 齿轮啮合微磨痕 + 浮置机匣激光编码蚀刻',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'g11_v3_clockwork_roughness.webp',
        note: 'Linear · R:Cycles AO / G:镀铬弹膛(0.16)-黄铜齿轮(0.22)-氮化内机匣(0.32) / B:高纯金属度',
      },
    ],
  },
  {
    id: 'g11_v3_barrel_mag',
    weapon: G11_ID,
    titleCn: '540mm冷锻枪管、45发置顶DM11无壳弹匣与安全橙推弹块贴图组',
    partTag: 'S-01 / S-02 / FC-05 / M-01 / M-02 / M-04 BARREL & DM11 MAG',
    resolution: '2048 × 2048 px',
    summary:
      '完整覆盖 540 mm 浮置冷锻镀铬枪管（带连续三连发热回火色与六槽消焰器膛口积碳）与 45 发置顶无壳弹匣的 2K 5 通道 ORM 贴图组：烟熏半透明匣体侧壁精确还原紧密纵排的 45 枚赭黄色 4.73×33mm DM11 方形无壳发射药块、平齐铜被甲尖弹头与清晰白色「15 / 30 / 45」余弹标尺；高可视安全橙水平推弹块享有 >= 50 px 独立 UV 防火墙零色渗。',
    highlights: [
      '置顶烟熏弹匣侧壁清晰透视 45 发赭黄方形 DM11 无壳药块、铜弹尖与「15/30/45」刻度',
      '540 mm 浮置冷锻枪管「4.73×33 DM11」激光枪管铭文与六槽消焰器高温蓝铜回火色',
      '高可视安全橙水平防倾推弹块（M-02）严格 UV 防火墙隔离，零色彩串扰',
    ],
    channels: [
      {
        kind: 'Albedo',
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'g11_v3_barrel_mag_albedo.webp',
        note: 'sRGB · 45发赭黄方形DM11无壳弹列 / 15-30-45标尺 / 安全橙推弹块 / 热回火消焰器',
      },
      {
        kind: 'Normal',
        labelCn: 'Normal 切线空间法线',
        fileName: 'g11_v3_barrel_mag_normal.webp',
        note: 'Linear · 枪管旋锻微纹 + 弹匣模压肋与刻度 + 消焰器积碳微粗糙凹凸',
      },
      {
        kind: 'Roughness',
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'g11_v3_barrel_mag_roughness.webp',
        note: 'Linear · R:Cycles AO / G:烟熏透窗(0.26)-镀氮枪管(0.28)-DM11药块(0.68) / B:金属度分离',
      },
    ],
  },
  {
    id: 'g11_seamless_springs',
    weapon: G11_ID,
    titleCn: '浮置机匣主复进簧与水平供弹螺旋簧动态无缝细节贴图',
    partTag: 'S-07 / M-03 DYNAMIC GPU-COMPRESSED HELICAL SPRINGS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '专为保留顶点属性 aSpringParam 的两组 GPU 实时压缩螺旋弹簧（浮置内机匣长行程复进主簧与置顶 45 发无壳弹匣水平供弹簧）提供高疲劳琴钢丝金属拉丝与润油微粗糙起伏。',
    highlights: [
      '保留 aSpringParam GPU 实时等径压缩形变，42 mm 浮置冲程零丝径压扁失真',
      '高疲劳琴钢丝微拉丝法线与润油粗糙度变化',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '弹簧钢拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于 g11_recoil_spring 与 g11_mag_spring 琴钢丝表面微纹理',
      },
      {
        kind: 'Roughness',
        labelCn: '弹簧钢润油粗糙度 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 弹簧钢润油与微观光泽起伏',
      },
    ],
  },
];

export const G11_PLUGIN: WeaponRuntimePlugin = {
  id: G11_ID,
  partGroups: G11_PART_GROUPS,
  timelinePresets: G11_TIMELINE_PRESETS,
  parts: G11_PARTS,
  firingPhases: G11_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(G11_FIRING_PHASES, f),
  computeFiringKinematics: computeG11FiringKinematics,
  computeBallisticsState: computeG11BallisticsState,
  pbrBindings: G11_PBR_BINDINGS,
  pbrSuites: G11_PBR_SUITES,
};
