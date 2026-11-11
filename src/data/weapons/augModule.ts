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
  buildAugBarrelLockGeometry,
  buildAugButtpadGeometry,
  buildAugChargingHandleGeometry,
  buildAugForegripGeometry,
  buildAugReceiverOpticGeometry,
  buildAugStockGeometry,
  buildAugTakedownPinGeometry,
} from '../../geometry/weapons/augGeometries';
import {
  buildAugBarrelGeometry,
  buildAugBoltCarrierGeometry,
  buildAugBoltGeometry,
  buildAugFiringPinGeometry,
  buildAugFlashHiderGeometry,
  buildAugGasBlockGeometry,
  buildAugGasPistonGeometry,
  buildAugGasRegulatorGeometry,
  buildAugHammerGeometry,
  buildAugHammerPackGeometry,
  buildAugMagBodyGeometry,
  buildAugMagFloorplateGeometry,
  buildAugMagFollowerGeometry,
  buildAugMagSpringGeometry,
  buildAugRecoilSpringsGeometry,
  buildAugSafetyGeometry,
  buildAugTransferBarsGeometry,
  buildAugTriggerGeometry,
} from '../../geometry/weapons/augExtraGeometries';

export const AUG_PART_GROUPS: GroupMeta[] = [
  {
    key: 'slide',
    nameZh: '快拆枪管导气与双导杆枪机总成',
    nameEn: 'Quick-Change Barrel, Gas & Twin-Rod Bolt Group',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: '奥地利军绿无托枪身与 1.5× 光学机匣总成',
    nameEn: 'Olive Bullpup Stock & 1.5× Swarovski Optic Receiver',
    badgeColor: '#7c3aed',
  },
  {
    key: 'fire_control',
    nameZh: '渐进扳机双连杆与后置全塑击锤盒总成',
    nameEn: 'Progressive Trigger, Transfer Bars & Polymer Hammer Pack',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '30发半透明琥珀华夫格弧形弹匣总成',
    nameEn: '30-Rd Translucent Amber Waffle Polymer Magazine',
    badgeColor: '#e11d48',
  },
];

export const AUG_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '合拢态',
    subLabel: '0%',
    t: 0.0,
    desc: 'Steyr AUG A1 (StG 77) 全枪紧凑无托闭合状态，开启 X-Ray 透视可直视后置弹膛、双长导杆与尾托全塑击锤盒',
  },
  {
    id: 'field_strip',
    label: '模块化六大件快拆',
    subLabel: '30%',
    t: 0.3,
    desc: '经典奥地利模块化野战分解：卸下琥珀华夫格弹匣、按下锁钮两秒抽出 20" 快拆枪管、推出尾销取出全塑击锤盒与双导杆枪机组',
  },
  {
    id: 'upper_mag_strip',
    label: '导气/枪机/弹匣细拆',
    subLabel: '65%',
    t: 0.65,
    desc: '分解倾斜导气箍内的三档调节塞与短行程活塞、旋出七突笋枪机与长击针，并展开半透明华夫格弹匣组件',
  },
  {
    id: 'full_explode',
    label: '全枪 25 节点爆炸图',
    subLabel: '100%',
    t: 1.0,
    desc: '完整展开施华洛世奇 1.5× 一体瞄准镜机匣、前置折叠握把、14cm 双联长扳机连杆与后置全工程塑料回转击锤系统',
  },
];

// Shared Stage-1 trajectories for anti-clipping modular bullpup disassembly
const AUG_BARREL_GROUP_STAGE1: KeyframeStep[] = [
  { range: [0.07, 0.17], offset: [8.8, 0, 0] },
  { range: [0.17, 0.28], offset: [1.2, 2.2, 0] },
];

const AUG_RECEIVER_STAGE1: KeyframeStep[] = [
  { range: [0.18, 0.29], offset: [1.8, 5.4, 0] },
];

const AUG_CARRIER_STAGE1: KeyframeStep[] = [
  { range: [0.18, 0.25], offset: [-4.4, 0.3, 0] },
  { range: [0.25, 0.31], offset: [1.4, 3.8, 0] },
];

const AUG_MAG_STAGE1: KeyframeStep[] = [
  { range: [0.01, 0.1], offset: [0.6, -5.2, 0] },
];

export const AUG_PARTS: G17PartSpec[] = [
  // ==================== 1. QUICK-CHANGE BARREL, GAS & TWIN-ROD BOLT ('slide' · 9 parts) ====================
  {
    id: 'aug_barrel',
    bomCode: 'U-01',
    nameZh: '20" 冷锻快拆枪管 (含八齿闭锁环)',
    calloutLabel: '20"冷锻快拆枪管',
    nameEn: '20" Quick-Change CHF Chrome-Lined Barrel',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [0, 1.05, 0],
    explodeSteps: [
      ...AUG_BARREL_GROUP_STAGE1,
      { range: [0.66, 0.9], offset: [2.4, 0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    calloutAnchor: [14.2, 0.42, 0],
    labelAppearAt: 0.0,
    roleTag: '508mm 全尺寸步枪弹道 / 两秒免工具快拆换管',
    description:
      '得益于无托后置构型，AUG A1 在仅 790mm 的冲锋枪级全长内装入了完整的 20 英寸（508mm）精密旋转冷精锻镀铬枪管；管身中段车有八组断隔式闭锁齿环，按下机匣锁钮旋转 45° 即可在两秒内更换轻机枪重管或卡宾短管。',
  },
  {
    id: 'aug_flash_hider',
    bomCode: 'U-02',
    nameZh: '郁金香型闭口三槽消焰器',
    calloutLabel: '郁金香闭口消焰器',
    nameEn: 'Tulip Closed-Prong Flash Suppressor & Grenade Ring',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [19.4, 1.05, 0],
    explodeSteps: [
      ...AUG_BARREL_GROUP_STAGE1,
      { range: [0.36, 0.56], offset: [4.8, 0, 0] },
      { range: [0.66, 0.9], offset: [3.2, 0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 36,
    calloutAnchor: [0.2, 0.48, 0],
    labelAppearAt: 0.0,
    roleTag: '抑制 5.56mm 膛口焰 / 兼作枪榴弹发射导环',
    description:
      '斯太尔 AUG A1 标志性的流线郁金香轮廓闭口三开槽消焰器：前端闭环结构彻底杜绝丛林灌木勾挂，后部滚花弹簧卡环可直接套装发射 22mm 北约制式尾管枪榴弹。',
  },
  {
    id: 'aug_gas_block',
    bomCode: 'U-03',
    nameZh: '右偏置倾斜导气箍座 (含前握把枢轴)',
    calloutLabel: '倾斜导气箍座',
    nameEn: 'Offset Tilted Gas Block & Foregrip Hinge Lug',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [8.85, 1.05, 0],
    explodeSteps: [
      ...AUG_BARREL_GROUP_STAGE1,
      { range: [0.68, 0.92], offset: [3.2, 3.2, 0.6] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-0.4, 0.85, 0.52],
    labelAppearAt: 0.18,
    roleTag: '右偏置气室直驱右导杆 / 充当快拆换管隔热手柄底座',
    description:
      '压装固定于枪管中前段的复合导气箍：气室向右上呈 45° 偏置，正好与枪机框右侧空心长导杆同轴对齐；底部伸出铰接耳座悬挂折叠垂直前握把，热管快拆时射手直接握持前握把即可免烫手拧下枪管。',
  },
  {
    id: 'aug_gas_regulator',
    bomCode: 'U-04',
    nameZh: '三档双翼导气调节塞',
    calloutLabel: '三档导气调节塞',
    nameEn: '3-Position Winged Gas Regulator Plug',
    group: 'slide',
    material: 'stainless',
    assembledPos: [10.05, 1.52, 0.52],
    explodeSteps: [
      ...AUG_BARREL_GROUP_STAGE1,
      { range: [0.36, 0.56], offset: [4.2, 1.6, 0.4] },
      { range: [0.68, 0.92], offset: [3.6, 3.6, 0.4] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [0.2, 0.45, 0],
    labelAppearAt: 0.36,
    roleTag: '标准 / 重积碳大进气 / 枪榴弹闭气三档切换',
    description:
      '旋入倾斜导气箍前端的三档气体调节塞，前端设有耐热工程塑料拨翼，严寒戴手套或高热射击后亦可徒手在「正常射击、严酷泥沙增大进气、发射枪榴弹完全闭气」三档间切换。',
  },
  {
    id: 'aug_gas_piston',
    bomCode: 'U-05',
    nameZh: '镀铬短行程导气活塞与复位簧',
    calloutLabel: '短行程导气活塞',
    nameEn: 'Chrome-Plated Short-Stroke Gas Piston & Return Spring',
    group: 'slide',
    material: 'stainless',
    assembledPos: [7.85, 1.52, 0.52],
    explodeSteps: [
      ...AUG_BARREL_GROUP_STAGE1,
      { range: [0.36, 0.58], offset: [-5.4, 2.2, 0.5] },
      { range: [0.68, 0.92], offset: [1.6, 3.8, 0.4] },
    ],
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [0.5, 0.32, 0],
    labelAppearAt: 0.36,
    roleTag: '隔离火药燃气热量 / 瞬时撞击枪机框右长导杆',
    description:
      '内置于偏置导气室内的硬铬不锈钢短行程活塞与独立复位簧：击发后仅向后急促冲击约 18mm 推动枪机框右侧空心长导杆，随即由自身活塞簧复位并将废气前排，确保后置贴腮机匣内清洁低温。',
  },
  {
    id: 'aug_bolt_carrier',
    bomCode: 'U-06',
    nameZh: '双长管导杆紧凑型枪机框',
    calloutLabel: '双长导杆枪机框',
    nameEn: 'Compact Bolt Carrier with Twin Long Tubular Guide Rods',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [-9.2, 1.18, 0],
    explodeSteps: [
      ...AUG_CARRIER_STAGE1,
      { range: [0.66, 0.9], offset: [-0.2, 1.3, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 44,
    calloutAnchor: [-0.2, 0.62, 0],
    labelAppearAt: 0.18,
    roleTag: '双导杆精密平衡往复 / 螺旋导槽驱动回转开闭锁',
    description:
      '斯太尔极具巧思的自动机核心：紧凑机框两侧向前延伸出两根等长镀铬空心钢导杆——右导杆直接承受短行程活塞推力，左导杆联动非随动拉机柄，两根导杆后腔同时容纳双联复进簧，彻底消除无托步枪枪机偏载卡滞。',
  },
  {
    id: 'aug_bolt',
    bomCode: 'U-07',
    nameZh: '七突笋回转枪机头与导套组件',
    calloutLabel: '七突笋回转枪机',
    nameEn: '7-Lug Rotating Bolt Head, Claw Extractor & Cam Sleeve',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-8.05, 1.05, 0],
    explodeSteps: [
      ...AUG_CARRIER_STAGE1,
      {
        range: [0.36, 0.58],
        offset: [5.6, -0.9, 0],
        rotation: [0.48, 0, 0],
      },
      { range: [0.68, 0.92], offset: [1.4, 0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [0.3, 0.42, 0],
    labelAppearAt: 0.34,
    roleTag: '七突笋刚性咬合枪管节套 / 换装左旋枪机可改左抛壳',
    description:
      '前端均布七枚闭锁突笋，第八齿位安装宽爪抽壳钩与柱塞式弹性抛壳挺；通过开闭锁凸轮销在枪机框螺旋槽内往复旋转约 25° 锁入枪管尾节套。更换反向凸轮枪机头并换装左防尘盖即可改为纯左撇子左抛壳！',
  },
  {
    id: 'aug_firing_pin',
    bomCode: 'U-08',
    nameZh: '贯穿式阶梯不锈钢长击针',
    calloutLabel: '阶梯式长击针',
    nameEn: 'Stepped Stainless Steel Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [-9.45, 1.05, 0],
    explodeSteps: [
      ...AUG_CARRIER_STAGE1,
      { range: [0.38, 0.58], offset: [-5.6, -0.8, 0] },
      { range: [0.68, 0.92], offset: [-2.2, 0.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [-0.8, 0.2, 0],
    labelAppearAt: 0.38,
    roleTag: '承接后置全塑击锤打击 / 闭锁到位保险约束',
    description:
      '贯穿七突笋枪机与导套轴心的精密车削不锈钢长击针，由枪机横锁销限制行程；唯有枪机框完全推弹复进并使七突笋旋转闭锁到位后，击针尾端方能被后置击锤正面敲击引燃底火。',
  },
  {
    id: 'aug_recoil_springs',
    bomCode: 'U-09',
    nameZh: '双联平行螺旋复进簧与尾导杆组',
    calloutLabel: '双联平行复进簧',
    nameEn: 'Dual Parallel Helical Recoil Springs & Guide Rods',
    group: 'slide',
    material: 'spring_steel',
    assembledPos: [-13.2, 1.52, 0],
    explodeSteps: [
      { range: [0.2, 0.31], offset: [-7.2, 4.4, 0] },
      { range: [0.66, 0.9], offset: [-4.8, 3.6, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [-0.8, 0.3, 0.52],
    labelAppearAt: 0.22,
    roleTag: '左右对称吸收后坐冲量 / 驱动枪机平顺复进',
    description:
      '并列布置于后枪托上腔并穿入枪机框左右两根空心长导杆内部的对称双螺旋复进簧组：双簧冗余设计大幅降低了单根弹簧疲劳应力，赋予 AUG 极为柔和线性的后坐手感。',
  },

  // ==================== 2. OLIVE BULLPUP STOCK & 1.5x OPTIC RECEIVER ('frame' · 7 parts) ====================
  {
    id: 'aug_stock',
    bomCode: 'F-01',
    nameZh: '奥地利军绿玻纤聚酰胺无托枪身 (含全手大护弓与后置弹匣井)',
    calloutLabel: '军绿聚酰胺无托枪身',
    nameEn: 'Austrian Olive-Green Polyamide 66 Bullpup Stock Housing',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [-5.2, -2.08, 0],
    labelAppearAt: 0.0,
    roleTag: '跨时代无托人机工程外壳 / 后置弹匣井与全手护弓一体成型',
    description:
      '1977 年惊艳世界的经典奥地利橄榄绿（RAL 7013）玻纤增强聚酰胺 66 一体注塑无托枪托：前部集成后掠式防滑握把与标志性连指手套大护弓，握把后方设有双侧拨片弹匣井、贴腮平台及可左右互换的左抛壳口防尘盖。',
  },
  {
    id: 'aug_buttpad',
    bomCode: 'F-02',
    nameZh: '黑色防滑橡胶抵肩底板 (含附件盒活门)',
    calloutLabel: '防滑橡胶抵肩底板',
    nameEn: 'Ribbed Black Elastomer Buttpad & Cleaning Trapdoor',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-17.9, -1.12, 0],
    explodeSteps: [
      { range: [0.14, 0.24], offset: [-5.2, -0.6, 0] },
      { range: [0.68, 0.92], offset: [-4.4, -0.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [0, -2.8, 0],
    labelAppearAt: 0.0,
    roleTag: '封闭枪托尾腔固定击锤盒 / 缓冲抵肩后坐与储藏擦枪工具',
    description:
      '带横向防滑齿纹与微凹贴肩曲面的合成橡胶尾托底板，由尾部横插背带销锁定以封闭后枪托尾腔，中央设有向内按压开启的擦枪油壶与通条储物活门。',
  },
  {
    id: 'aug_takedown_pin',
    bomCode: 'F-03',
    nameZh: '尾托击锤盒闭锁横销兼椭圆背带环',
    calloutLabel: '尾托闭锁背带销',
    nameEn: 'Rear Captive Takedown Cross-Pin & Swivel Sling Loop',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-15.85, -2.45, 0],
    explodeSteps: [
      { range: [0.11, 0.19], offset: [-3.4, -3.6, -1.8] },
      { range: [0.68, 0.92], offset: [-4.2, -3.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [-0.2, -0.35, -1.1],
    labelAppearAt: 0.14,
    roleTag: '一键解锁橡胶底板与全塑击锤盒 / 后战术背带挂点',
    description:
      '横穿后枪托底部的防丢失闭锁钢销，左侧一体铆接大型椭圆形战术背带转环：向内按压右侧销头即可向左侧拔出半截，瞬间解锁橡胶托底板与后置全塑击锤盒。',
  },
  {
    id: 'aug_receiver_optic',
    bomCode: 'F-04',
    nameZh: '压铸铝合金机匣与一体式 1.5× 施华洛世奇瞄准镜提把',
    calloutLabel: '铝机匣与1.5×瞄准镜',
    nameEn: 'Die-Cast Aluminum Receiver w/ Integrated 1.5× Swarovski Optic',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: [
      ...AUG_RECEIVER_STAGE1,
      { range: [0.66, 0.92], offset: [0.8, 4.4, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 36,
    calloutAnchor: [1.2, 4.55, 0],
    labelAppearAt: 0.0,
    roleTag: '镶钢衬承力机匣 / 1.5倍施华洛世奇环形分划白光镜兼提把',
    description:
      '深灰硬质阳极氧化铝合金精密压铸机匣，内部压入高强度钢制闭锁节套；顶部通过前倾双立柱一体融合奥地利 Swarovski Optik 1.5×14 镀膜光学瞄准镜（内设经典“甜甜圈”测距圆环分划，终身免校零）并兼作战术提把，镜筒脊背模制应急机械准星照门。',
  },
  {
    id: 'aug_barrel_lock',
    bomCode: 'F-05',
    nameZh: '枪管快拆斜纹横插锁止钮与压簧',
    calloutLabel: '枪管快拆锁止钮',
    nameEn: 'Quick-Change Barrel Cross-Lock Latch & Spring',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [3.65, 0.52, 0],
    explodeSteps: [
      ...AUG_RECEIVER_STAGE1,
      { range: [0.42, 0.62], offset: [3.8, -2.4, 1.4] },
      { range: [0.68, 0.92], offset: [2.2, 1.8, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [0, 0.25, 0.95],
    labelAppearAt: 0.42,
    roleTag: '径向锁死快拆枪管法兰 / 一指按压快速解锁',
    description:
      '横向安装于铝合金机匣前下座内的斜纹防滑锁止栓：平时在强力弹簧推顶下卡入枪管闭锁齿槽消除间隙；压下按钮即可旋转拔出炙热枪管。',
  },
  {
    id: 'aug_charging_handle',
    bomCode: 'F-06',
    nameZh: '左侧非随动可折叠拉机柄组件',
    calloutLabel: '左侧非随动折叠拉机柄',
    nameEn: 'Left Non-Reciprocating Folding Charging Handle',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [3.45, 1.62, -0.92],
    explodeSteps: [
      ...AUG_RECEIVER_STAGE1,
      { range: [0.38, 0.58], offset: [-4.6, 2.2, -2.2] },
      { range: [0.68, 0.92], offset: [-1.2, 3.8, -0.6] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [-0.2, 0.35, -0.45],
    labelAppearAt: 0.2,
    roleTag: '射击时不随动防打手 / 上翻卡入机匣缺口实现空仓挂机待命',
    description:
      '位于机匣左侧导槽的军绿工程塑料折叠握柄：射击时保持静止不随枪机往复运动；向后拉到底上抬即可卡入机匣锁槽形成手动挂机（支持经典掌击解锁上膛），平时可向内折叠紧贴机匣壁。',
  },
  {
    id: 'aug_foregrip',
    bomCode: 'F-07',
    nameZh: '前置可折叠军绿垂直握把与定位簧',
    calloutLabel: '前置折叠垂直握把',
    nameEn: 'Folding Vertical Polymer Foregrip & Pivot Spring',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [8.85, -0.18, 0],
    explodeSteps: [
      ...AUG_BARREL_GROUP_STAGE1,
      {
        range: [0.4, 0.62],
        offset: [1.8, -5.8, 0],
        rotation: [0, 0, 0.24],
      },
      { range: [0.68, 0.92], offset: [2.2, -2.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 36,
    calloutAnchor: [-0.3, -4.6, 0],
    labelAppearAt: 0.0,
    roleTag: '紧凑全自动控枪支点 / 向下拉出即可向前 90° 折叠收纳',
    description:
      '铰接于倾斜导气箍下耳座的斯太尔标志性垂直前握把：大幅提升紧凑无托步枪全自动连发射击稳定性；握柄向下克服内簧拉力即可向前平折贴合枪管下方，同时也是野战快拆热枪管的隔热把手。',
  },

  // ==================== 3. PROGRESSIVE TRIGGER, TRANSFER BARS & REAR POLYMER HAMMER PACK ('fire_control' · 5 parts) ====================
  {
    id: 'aug_trigger',
    bomCode: 'FC-01',
    nameZh: '渐进式单连发合一线性滑动扳机',
    calloutLabel: '渐进式滑动扳机',
    nameEn: 'Progressive Two-Stage Sliding Polymer Trigger',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [0.55, -2.35, 0],
    explodeSteps: [
      { range: [0.66, 0.92], offset: [4.2, -5.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 36,
    calloutAnchor: [0.1, -0.95, 0],
    labelAppearAt: 0.66,
    roleTag: '无快慢机设计：轻扣至第一道行程半自动单发 · 扣到底全自动连发',
    description:
      'AUG 取消了传统单连发转换拨杆，采用纵向直线滑移的工程塑料渐进扳机：向后扣动约 4mm 至清晰阻力点触发精确半自动单发；继续用力扣到底越过阻点即无缝进入 680 发/分全自动扫射。',
  },
  {
    id: 'aug_safety',
    bomCode: 'FC-02',
    nameZh: '横穿式红点方柱按压保险钮',
    calloutLabel: '横穿式方柱保险钮',
    nameEn: 'Cross-Bolt Push-Button Safety w/ Red Warning Band',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [-0.65, -1.42, 0],
    explodeSteps: [
      { range: [0.66, 0.92], offset: [0.8, -5.8, -1.8] },
    ],
    calloutDir: 'down',
    calloutStem: 42,
    calloutAnchor: [0, -0.2, -0.95],
    labelAppearAt: 0.66,
    roleTag: '刚性横锁扳机与双连杆 / 左侧显露红圈即待击预警',
    description:
      '位于手枪握把正上方的方形横插按压保险：向右推入锁死扳机滑块（白点安全态）；用射击手食指或拇指向左推出露出鲜明红圈色带即可瞬间解除保险射击。',
  },
  {
    id: 'aug_transfer_bars',
    bomCode: 'FC-03',
    nameZh: '贯通式双联平行长扳机连杆',
    calloutLabel: '贯通式双联扳机连杆',
    nameEn: 'Long Dual Parallel Steel Trigger Transfer Bars',
    group: 'fire_control',
    material: 'stainless',
    assembledPos: [-6.6, -1.25, 0],
    explodeSteps: [
      { range: [0.68, 0.94], offset: [-1.2, -5.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [1.5, -0.35, 0.58],
    labelAppearAt: 0.68,
    roleTag: '跨过握把与后置弹匣井 / 将前置扳机拉力无框量传至尾托击锤盒',
    description:
      '无托步枪火控传动的核心桥梁：两根刚性平行扁钢连杆前端夹固于滑动扳机上座，沿枪托内壁左右两侧绕过手枪握把与后置弹匣井直达枪托最尾端，精准驱动全塑击锤盒阻铁。',
  },
  {
    id: 'aug_hammer_pack',
    bomCode: 'FC-04',
    nameZh: '后置全工程塑料模块化击锤盒框架',
    calloutLabel: '后置全塑击锤盒',
    nameEn: 'Rear All-Polymer Modular Hammer Pack Housing',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [-14.65, -0.65, 0],
    explodeSteps: [
      { range: [0.16, 0.26], offset: [-8.2, -2.4, 0] },
      { range: [0.68, 0.94], offset: [-5.6, -3.4, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    calloutAnchor: [0, -1.15, 0],
    labelAppearAt: 0.18,
    roleTag: '全枪免润滑自润滑尼龙火控总成 / 集成单连发渐进阻铁与防跌落保险',
    description:
      '世界轻武器史上革命性的全工程塑料火控模块（除弹簧与销轴外几乎全部由高耐磨玻纤聚酰胺注塑成型）：坐落于枪托最后方，无需涂抹枪油即可在极寒沙尘环境下免维护可靠工作数万发。',
  },
  {
    id: 'aug_hammer',
    bomCode: 'FC-05',
    nameZh: '后置工程塑料回转击锤与双扭簧',
    calloutLabel: '全塑回转击锤与扭簧',
    nameEn: 'All-Polymer Rotary Hammer & Dual Steel Torsion Springs',
    group: 'fire_control',
    material: 'polymer_frame',
    assembledPos: [-12.85, -0.05, 0],
    explodeSteps: [
      { range: [0.16, 0.26], offset: [-8.2, -2.4, 0] },
      { range: [0.42, 0.62], offset: [0.8, 3.4, 0] },
      { range: [0.68, 0.94], offset: [-4.6, -1.2, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    calloutAnchor: [0.1, 1.15, 0],
    labelAppearAt: 0.42,
    roleTag: '超轻质量极速前旋打击击针 / 极短闭锁延迟提升首发精度',
    description:
      '由高冲击强度工程塑料模压而成的轻量化回转击锤，由左右双联琴钢丝扭簧驱动：相比传统钢制击锤惯量大幅降低，击发回转时间极短，显著减小射手扣发瞬间的瞄准微晃。',
  },

  // ==================== 4. 30-RD TRANSLUCENT AMBER WAFFLE MAGAZINE ('magazine' · 4 parts) ====================
  {
    id: 'aug_mag_body',
    bomCode: 'M-01',
    nameZh: '30发半透明琥珀色华夫格弧形聚合物弹匣体',
    calloutLabel: '30发半透明华夫格弹匣',
    nameEn: '30-Rd Translucent Amber Waffle-Grid Polymer Magazine',
    group: 'magazine',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-9.95, 0.45, 0],
    explodeSteps: [
      ...AUG_MAG_STAGE1,
      { range: [0.36, 0.58], offset: [0, -1.0, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 34,
    calloutAnchor: [1.2, -5.8, 0],
    labelAppearAt: 0.0,
    roleTag: '经典琥珀半透明全视角检视余弹 / 纵横华夫凸格抗碾压防滑',
    description:
      '斯太尔 AUG 最具视觉辨识度的经典符号——采用高韧性琥珀色半透明聚碳酸酯（Makrolon）注塑成型，外壁遍布纵横交错的华夫饼干式加强凸筋，士兵低头一眼即可透过琥珀匣壁清点内部金黄色的 5.56×45mm 实弹余量。',
  },
  {
    id: 'aug_mag_follower',
    bomCode: 'M-02',
    nameZh: '防倾斜双排聚合物托弹板',
    calloutLabel: '防倾斜聚合物托弹板',
    nameEn: 'Anti-Tilt Polymer Magazine Follower',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [-9.88, -0.65, 0],
    explodeSteps: [
      ...AUG_MAG_STAGE1,
      { range: [0.36, 0.58], offset: [-0.4, 2.8, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -0.2, 0],
    labelAppearAt: 0.36,
    roleTag: '双排双进平顺导引 5.56mm 北约弹',
    description:
      '自润滑黑色/军绿工程塑料托弹板，顶部设有左右错位导弹凸脊与前后防俯仰长裙边，确保 30 发 5.56×45mm 步枪弹沿弧形匣道零卡滞高速上供。',
  },
  {
    id: 'aug_mag_spring',
    bomCode: 'M-03',
    nameZh: '耐腐蚀弧形矩形截面托弹簧',
    calloutLabel: '弧形弹匣托弹簧',
    nameEn: 'Curved Corrosion-Resistant Magazine Coil Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [-9.95, 0.45, 0],
    explodeSteps: [
      ...AUG_MAG_STAGE1,
      { range: [0.36, 0.6], offset: [2.2, -3.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 34,
    calloutAnchor: [1.8, -7.2, 0],
    labelAppearAt: 0.36,
    roleTag: '满载长期储存抗松弛 / 恒力推弹上供',
    description:
      '按 5.56×45mm 弧形弹道精确热定型的不锈钢矩形螺旋托弹簧，透过半透明琥珀弹匣壁清晰可见，即便满弹长期战备存放亦不衰减弹力。',
  },
  {
    id: 'aug_mag_floorplate',
    bomCode: 'M-04',
    nameZh: '快拆卡扣式聚合物弹匣底盖',
    calloutLabel: '快拆聚合物弹匣底盖',
    nameEn: 'Quick-Release Polymer Magazine Floorplate & Lock',
    group: 'magazine',
    material: 'polymer_frame',
    assembledPos: [-7.84, -8.0, 0],
    explodeSteps: [
      ...AUG_MAG_STAGE1,
      { range: [0.36, 0.6], offset: [2.6, -4.6, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 34,
    calloutAnchor: [0.1, -0.2, 0],
    labelAppearAt: 0.36,
    roleTag: '严丝合缝封闭弹匣底端 / 免工具按压滑出清沙',
    description:
      '带防摔护翼与底部中央圆锁钮的耐冲击聚合物底盖，与弧形琥珀弹匣底口成 0.48 rad 斜角齐平咬合，野战进水进沙时用弹尖一顶锁钮即可滑开清理。',
  },
];

export const AUG_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'aug_progressive_trigger',
    stepNum: '01',
    shortLabel: '滑扳机传连杆',
    title: '阶段 1 · 线性扣动渐进式扳机与双长连杆后移释阻',
    range: [0.0, 0.16],
    description:
      '横穿式保险推至红圈击发位，手指线性向后扣动渐进式滑动扳机，夹固于扳机上座的左右双联 14cm 长扳机连杆同步向后平动，跨越握把与后置弹匣井拉动尾托全塑击锤盒内的阻铁滑块。',
  },
  {
    id: 'aug_hammer_ignition',
    stepNum: '02',
    shortLabel: '塑锤敲针击发',
    title: '阶段 2 · 后置全塑击锤高速前旋敲击长击针刺破底火',
    range: [0.16, 0.24],
    description:
      '尾托击锤盒阻铁脱钩瞬间，超轻量化工程塑料回转击锤在双扭簧驱动下绕横轴极速前旋（rz < 0），正面敲击闭锁到位的阶梯长击针尾端，引燃后置弹膛内 5.56×45mm NATO 步枪弹底火。',
  },
  {
    id: 'aug_barrel_gas_tap',
    stepNum: '03',
    shortLabel: '长管引气出膛',
    title: '阶段 3 · 弹头沿 20" 冷锻枪管加速并经右偏置导气箍分流燃气',
    range: [0.24, 0.34],
    description:
      '5.56mm 覆铜钢芯尖头弹沿全长 508mm 镀铬膛线加速至 970m/s 高初速；越过枪管中段导气孔瞬间，高压火药燃气涌入右上 45° 倾斜导气箍气室，弹头随即冲出郁金香闭口三槽消焰器。',
  },
  {
    id: 'aug_short_stroke_unlock',
    stepNum: '04',
    shortLabel: '短活塞推双杆',
    title: '阶段 4 · 短行程活塞瞬时撞击右导杆与七突笋枪机 25° 回转开锁',
    range: [0.34, 0.54],
    description:
      '镀铬短行程导气活塞向后急冲约 18mm 猛推枪机框右侧空心长导杆（随即由自身弹簧复位阻隔废气），双导杆枪机框后退自由行程后由螺旋槽带动七突笋枪机旋转开锁，并向后压倒全塑击锤！左侧拉机柄全程静止不随动。',
  },
  {
    id: 'aug_bullpup_eject',
    stepNum: '05',
    shortLabel: '后置窗口抛壳',
    title: '阶段 5 · 爪式抽壳钩拉出黄铜弹壳并由弹性抛壳挺向右抛出',
    range: [0.45, 0.72],
    description:
      '七突笋枪机右侧抽壳钩将 5.56×45mm 空黄铜弹壳拉出后置弹膛；越过贴腮区右侧抛壳窗瞬间，枪机端面内置柱塞抛壳挺强力弹出，将空弹壳干净利落地向右前方翻滚弹出无托枪托。',
  },
  {
    id: 'aug_waffle_feed_lock',
    stepNum: '06',
    shortLabel: '双簧推弹旋闭',
    title: '阶段 6 · 琥珀华夫格弹匣托弹上升与双联复进簧推弹回转闭锁',
    range: [0.56, 0.86],
    description:
      '后置半透明琥珀华夫格弹匣内下一发金黄 5.56mm 步枪弹上托至抱弹口；尾腔双联平行螺旋复进簧释放能量，经左右双长导杆平稳推枪机框复进推弹入膛，驱动七突笋反向旋转 25° 刚性闭锁。',
  },
  {
    id: 'aug_progressive_reset',
    stepNum: '07',
    shortLabel: '渐进阻铁复位',
    title: '阶段 7 · 松开滑动扳机，双连杆前移使全塑击锤盒完成单发复位',
    range: [0.86, 1.0],
    description:
      '松开渐进式滑动扳机，扳机与双联长连杆同步向前归位；后置全塑击锤盒内的单发断路器前倾脱钩，将待击状态的全塑回转击锤平顺交接回主阻铁台面，准备下一发精准射击。',
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

export function getActiveAugFiringPhase(f: number): FiringPhaseInfo {
  for (let i = AUG_FIRING_PHASES.length - 1; i >= 0; i--) {
    if (f >= AUG_FIRING_PHASES[i].range[0]) {
      return AUG_FIRING_PHASES[i];
    }
  }
  return AUG_FIRING_PHASES[0];
}

/**
 * Real-time bullpup mechanical kinematics for Steyr AUG A1 across f ∈ [0, 1].
 */
export function computeAugFiringKinematics(
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

  // 1. Twin-Rod Bolt Carrier Recoil Stroke inside rear bullpup buttstock (0 -> -4.65 -> 0)
  const carrierBack = seg(f, 0.31, 0.54);
  const carrierReturn = seg(f, 0.57, 0.85);
  const carrierDX = -4.65 * (carrierBack - carrierReturn);

  // 2. 7-Lug Rotating Bolt: cam unlocks rx = +0.46 rad (~26°) during [0.33, 0.39], strokes back -4.15, locks [0.78, 0.85]
  const boltUnlock = seg(f, 0.33, 0.39) - seg(f, 0.78, 0.85);
  const boltBack = seg(f, 0.35, 0.54) - seg(f, 0.57, 0.82);
  const boltDX = -4.15 * boltBack;
  const boltRX = 0.46 * boltUnlock;

  // 3. Linear Sliding Trigger + Dual Long Transfer Bars (pull straight rearward -0.52 along X!)
  const triggerPull = seg(f, 0.0, 0.14) - seg(f, 0.87, 0.96);

  switch (partId) {
    case 'aug_gas_piston': {
      // Short-stroke piston impulses rearward -1.35 onto right carrier rod [0.285, 0.35] & immediately snaps home [0.36, 0.45]!
      const impulse = seg(f, 0.285, 0.345) - seg(f, 0.36, 0.455);
      dx = -1.35 * impulse;
      break;
    }

    case 'aug_bolt_carrier': {
      dx = carrierDX;
      break;
    }

    case 'aug_bolt': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'aug_firing_pin': {
      const pinStrike = seg(f, 0.145, 0.19) - seg(f, 0.24, 0.33);
      dx = boltDX + 0.34 * pinStrike;
      break;
    }

    case 'aug_recoil_springs': {
      // Dual parallel springs span local X ∈ [-3.82, +3.75] (L0 = 7.57)
      // Rear bridge (-3.82) stays anchored in rear buttstock; front (+3.75) compresses with carrierDX!
      const xRear = -3.82;
      const L0 = 7.57;
      const xFrontNew = 3.75 + carrierDX;
      const LNew = Math.max(2.75, xFrontNew - xRear);
      scaleX = LNew / L0;
      dx = xRear - xRear * scaleX;
      break;
    }

    case 'aug_trigger':
    case 'aug_transfer_bars': {
      dx = -0.52 * triggerPull;
      break;
    }

    case 'aug_hammer': {
      // Cocked at rz = 0 in rear buttstock -> swings forward (+X) via rz = -0.92 at [0.07, 0.155] ->
      // recocked by rearward-stroking bolt carrier [0.36, 0.48] onto disconnector (rz = +0.08) -> resets [0.89, 0.95]!
      const swingStrike = seg(f, 0.07, 0.155);
      const recock = seg(f, 0.36, 0.475);
      const overcockDip = Math.sin(linearSeg(f, 0.43, 0.56) * Math.PI) * 0.09;
      const searReset = seg(f, 0.89, 0.95);

      rz = -0.92 * swingStrike + 1.0 * recock + overcockDip - 0.08 * searReset;
      break;
    }

    case 'aug_mag_follower': {
      const pulse = seg(f, 0.52, 0.63) - seg(f, 0.66, 0.81);
      dx = -0.05 * pulse;
      dy = 0.36 * pulse;
      break;
    }

    // aug_charging_handle is authentically non-reciprocating during firing!
    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes 5.56×45mm NATO bullpup ballistics: rear-stock chamber ignition [-7.10, 1.05, 0],
 * 20" barrel travel past tilted gas block [8.85, 1.52, 0.52], tulip muzzle flash [20.50, 1.05, 0],
 * and rear cheekpiece ejection port brass throw!
 */
export function computeAugBallisticsState(fRaw: number): ExtendedBallisticsState {
  const f = clamp01(fRaw);

  const boltBack = seg(f, 0.35, 0.54) - seg(f, 0.57, 0.82);
  const boltDX = -4.15 * boltBack;

  // 1. 5.56×45mm NATO Spitzer Projectile:
  // Seated in rear bullpup chamber neck at X = -5.65, Y = 1.05 until f = 0.21 ->
  // accelerates 26.15 units down the full 20" bullpup barrel to muzzle X = 20.50 at f = 0.305 -> supersonic flight!
  const bulletVisible = f < 0.46;
  let bulletX = -5.65;
  let streakLength = 0;

  if (f >= 0.21 && f < 0.305) {
    const u = Math.pow(linearSeg(f, 0.21, 0.305), 1.4);
    bulletX = -5.65 + 26.15 * u; // Exits tulip flash hider X = 20.50 at f = 0.305
    streakLength = 4.6 * u;
  } else if (f >= 0.305 && f < 0.46) {
    const u = linearSeg(f, 0.305, 0.46);
    bulletX = 20.5 + 52.0 * u;
    streakLength = 9.8 * (1 - u * 0.45);
  }

  // 2. Spent 5.56×45mm Brass Case (extracts in rear buttstock [-7.10 -> -9.65] & ejects out right stock port X ≈ -8.2!)
  const spentCaseVisible = f < 0.76;
  let caseX = -7.1;
  let caseY = 1.05;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.35 && f < 0.475) {
    caseX = -7.1 + boltDX;
  } else if (f >= 0.475 && f < 0.76) {
    const u = linearSeg(f, 0.475, 0.76);
    caseX = -8.65 + 2.6 * u; // Plunger ejector throws brass briskly forward-right out stock port!
    caseY = 1.12 + 7.6 * u - 9.8 * u * u;
    caseZ = 12.2 * u;
    caseRX = u * 10.5;
    caseRY = -u * 14.5;
    caseRZ = -u * 12.0;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.76);
    }
  }

  // 3. Rear Bullpup Chamber Flash, Offset Tilted Gas-Block Flash & Tulip Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.19 && f <= 0.28) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.19, 0.28) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.265 && f <= 0.35) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.265, 0.35) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.295 && f <= 0.385) {
    const u = linearSeg(f, 0.295, 0.385);
    muzzlePlumeScale = 0.4 + 1.32 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.8;
  }

  // 4. Next 5.56×45mm Round in Rear Bullpup Waffle Mag [-9.85, 0.25, 0] -> Chamber [-7.10, 1.05, 0]
  let nextX = -9.85;
  let nextY = 0.25;
  let nextRZ = 0.08;

  if (f >= 0.52 && f < 0.62) {
    const u = seg(f, 0.52, 0.62);
    nextY = 0.25 + 0.4 * u;
    nextRZ = 0.08 + 0.07 * u;
  } else if (f >= 0.62 && f < 0.84) {
    const u = seg(f, 0.62, 0.84);
    const rampArc = Math.sin(u * Math.PI) * 0.16;
    nextX = -9.85 + (-7.1 - -9.85) * u;
    nextY = 0.65 + (1.05 - 0.65) * u + rampArc;
    nextRZ = 0.15 * (1 - u);
  } else if (f >= 0.84) {
    nextX = -7.1;
    nextY = 1.05;
    nextRZ = 0;
  }

  // 5. Reserve Cartridge underneath in Rear Waffle Magazine Stack
  const magShift = seg(f, 0.52, 0.72);
  const resX = -9.85;
  const resY = -0.58 + (0.25 - -0.58) * magShift;

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
    gasPortPos: [8.85, 1.52, 0.52],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0.1],
  };
}

export const AUG_CAMERA_PRESETS: WeaponCameraMap = {
  armory_showcase: { pos: [14.2, 2.0, 53.0], target: [0.6, -6.0, 0] },
  iso: { pos: [13.5, 8.0, 42.5], target: [1.2, -0.8, 0] },
  right: { pos: [1.2, -0.4, 42.0], target: [1.2, -0.8, 0] },
  left: { pos: [1.2, -0.4, -42.0], target: [1.2, -0.8, 0] },
  top: { pos: [1.2, 44.0, 4.5], target: [1.2, 0, 0] },
  safe_action: { pos: [-4.5, 2.6, 17.5], target: [-7.5, 0.5, 0.2] },
  firing_view: { pos: [8.5, 4.0, 40.5], target: [2.5, 0.2, 0] },
};

export const AUG_WORKBENCH_META: WeaponWorkbenchMeta = {
  badge: 'STG 77 · BULLPUP',
  title: 'Steyr AUG 内部3D拆解与击发演示',
  subtitle:
    '4 大总成 · 25 核心节点 · 无托后置全塑击锤盒 & 5.56×45mm 短活塞双导杆模拟',
  cutawayLabel: '后置全塑击锤盒特写',
  cutawayTitle:
    '切换至合拢透视状态并聚焦无托后置弹膛、双长导杆枪机框与全塑击锤盒啮合特写',
  cutawayFocusPartId: 'aug_bolt_carrier',
  searchPlaceholder: '搜索零件名 / 编号 (如 瞄准镜, 华夫格, 击锤盒, U-06)...',
  muzzlePos: [20.5, 1.05, 0],
  chamberGlowPos: [-7.1, 1.05, 0],
  scaleProfile: 'rifle',
  gridY: -24.0,
};

export const AUG_GEOMETRY_BUILDERS: Record<
  string,
  () => THREE.BufferGeometry
> = {
  // 1. Quick-Change 20" Barrel, Gas & Twin-Rod Bolt Group ('slide' · 9)
  aug_barrel: buildAugBarrelGeometry,
  aug_flash_hider: buildAugFlashHiderGeometry,
  aug_gas_block: buildAugGasBlockGeometry,
  aug_gas_regulator: buildAugGasRegulatorGeometry,
  aug_gas_piston: buildAugGasPistonGeometry,
  aug_bolt_carrier: buildAugBoltCarrierGeometry,
  aug_bolt: buildAugBoltGeometry,
  aug_firing_pin: buildAugFiringPinGeometry,
  aug_recoil_springs: buildAugRecoilSpringsGeometry,

  // 2. Olive Bullpup Stock & 1.5x Swarovski Optic Receiver ('frame' · 7)
  aug_stock: buildAugStockGeometry,
  aug_buttpad: buildAugButtpadGeometry,
  aug_takedown_pin: buildAugTakedownPinGeometry,
  aug_receiver_optic: buildAugReceiverOpticGeometry,
  aug_barrel_lock: buildAugBarrelLockGeometry,
  aug_charging_handle: buildAugChargingHandleGeometry,
  aug_foregrip: buildAugForegripGeometry,

  // 3. Progressive Trigger, Transfer Bars & Polymer Hammer Pack ('fire_control' · 5)
  aug_trigger: buildAugTriggerGeometry,
  aug_safety: buildAugSafetyGeometry,
  aug_transfer_bars: buildAugTransferBarsGeometry,
  aug_hammer_pack: buildAugHammerPackGeometry,
  aug_hammer: buildAugHammerGeometry,

  // 4. 30-Rd Translucent Amber Waffle Polymer Magazine ('magazine' · 4)
  aug_mag_body: buildAugMagBodyGeometry,
  aug_mag_follower: buildAugMagFollowerGeometry,
  aug_mag_spring: buildAugMagSpringGeometry,
  aug_mag_floorplate: buildAugMagFloorplateGeometry,
};

export interface AugPbrBindingSpec {
  albedoUrl: string;
  normalUrl: string;
  roughnessUrl: string;
  normalScale: number;
}

export const AUG_PBR_BINDINGS: Record<string, AugPbrBindingSpec> = {
  aug_stock: {
    albedoUrl: '/textures/aug_stock_albedo.png',
    normalUrl: '/textures/aug_stock_normal.png',
    roughnessUrl: '/textures/aug_stock_roughness.png',
    normalScale: 0.44,
  },
  aug_receiver_optic: {
    albedoUrl: '/textures/aug_stock_albedo.png',
    normalUrl: '/textures/aug_stock_normal.png',
    roughnessUrl: '/textures/aug_stock_roughness.png',
    normalScale: 0.34,
  },
  aug_mag_body: {
    albedoUrl: '/textures/aug_mag_albedo.png',
    normalUrl: '/textures/aug_mag_normal.png',
    roughnessUrl: '/textures/aug_mag_roughness.png',
    normalScale: 0.66,
  },
};

export const AUG_PBR_SUITES = [
  {
    id: 'aug_stock',
    weapon: 'aug' as const,
    titleCn: '奥地利军绿聚酰胺无托枪托与施华洛世奇瞄准镜机匣贴图组',
    partTag: 'F-01 / F-04 BULLPUP & OPTIC',
    resolution: '2048 × 1024 px',
    summary:
      '真实还原奥地利陆军制式 StG 77（Steyr AUG A1）标志性的 RAL 7013 橄榄军绿（#4b5841）玻纤聚酰胺注塑皮纹与原厂靶环徽标铭文，下半幅集成深炭灰阳极氧化铝合金机匣、Swarovski Optik Tirol 1.5×14 光学镜筒激光刻字与青翠多层增透镀膜物镜。',
    highlights: [
      '军绿无托枪身双侧 STEYR MANNLICHER AUSTRIA · StG 77 靶环压印',
      '光学平整深灰阳极氧化铝机匣与 SWAROVSKI OPTIK TIROL 1.5× 铭文',
      '施华洛世奇青蓝多层镀膜镜片高光 (0.06) 与聚酰胺亚光皮纹对比',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        url: '/textures/aug_stock_albedo.png',
        fileName: 'aug_stock_albedo.png',
        note: 'sRGB · 奥地利橄榄军绿枪身 / 深炭灰光学机匣 / 青蓝镀膜镜片',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        url: '/textures/aug_stock_normal.png',
        fileName: 'aug_stock_normal.png',
        note: 'Linear · 模具 EDM 微皮纹 + 原厂凹刻铭牌 + 光学平整金属法线',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度',
        url: '/textures/aug_stock_roughness.png',
        fileName: 'aug_stock_roughness.png',
        note: 'Linear · 镜片镜面 (0.06) / 阳极氧化铝 (0.41) / 握把防滑纹 (0.70)',
      },
    ],
  },
  {
    id: 'aug_mag',
    weapon: 'aug' as const,
    titleCn: '30发半透明琥珀色华夫格聚碳酸酯弹匣贴图组',
    partTag: 'M-01 WAFFLE MAGAZINE',
    resolution: '1024 × 1024 px',
    summary:
      '专为斯太尔 AUG 经典的 30 发半透明蜂蜜琥珀色聚碳酸酯（Makrolon）弧形弹匣打造：在半透明琥珀滤光层下清晰呈现成排叠置的 5.56×45mm NATO 黄铜瓶颈弹壳、退火弹颈与紫铜被甲尖头弹，表层覆盖高立体感纵横华夫饼干防滑加强筋与 10/20/30 余弹刻度。',
    highlights: [
      '半透明蜂蜜琥珀聚碳酸酯透出内部金黄色 5.56×45mm 实弹列阵',
      '纵横交错高浮雕华夫饼干式（Waffle-Grid）加强凸筋法线',
      '透明观察格高光镜面 (0.15) vs 华夫加强筋半哑光 (0.54) 质感分层',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        url: '/textures/aug_mag_albedo.png',
        fileName: 'aug_mag_albedo.png',
        note: 'sRGB · 半透明蜂蜜琥珀色匣壁 / 内部黄铜 5.56mm 步枪弹叠层',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        url: '/textures/aug_mag_normal.png',
        fileName: 'aug_mag_normal.png',
        note: 'Linear · 纵横华夫格立体凸筋斜坡 + STEYR 5.56×45 与余弹刻度',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度',
        url: '/textures/aug_mag_roughness.png',
        fileName: 'aug_mag_roughness.png',
        note: 'Linear · 聚碳酸酯透光窗格 (0.15) 与注塑凸筋亚光粗糙度反差',
      },
    ],
  },
];

export const AUG_MODULE = {
  id: 'aug' as const,
  orderIndex: 9,
  catalog: {
    id: 'aug',
    bayCode: 'BAY-09',
    modelCode: 'STEYR AUG A1 · STG 77 BULLPUP',
    nameCn: '斯太尔 AUG A1 无托步枪',
    subtitleEn: '5.56×45mm Bullpup Assault Rifle w/ Integrated 1.5× Optic',
    originCountryCn: '奥地利',
    weaponTypeCn: '无托式步枪',
    category: 'rifle' as const,
    categoryCn: '无托式步枪',
    caliber: '5.56×45mm NATO',
    actionMechanism: '无托后置弹匣 · 短行程活塞双导杆回转闭锁',
    assembliesCount: 4,
    partsCount: AUG_PARTS.length,
    firingStagesCount: 7,
    available: true,
    statusLabel: '已入库 · 可拆解',
    description:
      '奥地利斯太尔-曼利夏（Steyr Mannlicher）于 1977 年定型的跨时代模块化无托步枪（军用代号 StG 77）：在冲锋枪级的紧凑全长内装入全尺寸 20 英寸快拆冷锻枪管，融合经典橄榄军绿聚酰胺一体式全手大护弓枪身、1.5 倍施华洛世奇一体光学瞄准镜提把、前置折叠垂直握把、短行程活塞双长导杆七突笋回转闭锁、渐进式双连杆扳机、后置全工程塑料击锤盒及标志性的半透明琥珀色华夫格弹匣。',
    highlights: [
      '一体式 1.5× 施华洛世奇镀膜瞄准镜提把',
      '20" 两秒快拆枪管 + 前置折叠垂直握把',
      '双长导杆枪机 + 后置全工程塑料击锤盒',
      '30发半透明琥珀华夫格 5.56mm 聚合物弹匣',
    ],
  },
  partGroups: AUG_PART_GROUPS,
  timelinePresets: AUG_TIMELINE_PRESETS,
  parts: AUG_PARTS,
  firingPhases: AUG_FIRING_PHASES,
  getActiveFiringPhase: getActiveAugFiringPhase,
  computeFiringKinematics: computeAugFiringKinematics,
  computeBallisticsState: computeAugBallisticsState,
  caliberProfile: '556_nato' as CaliberProfile,
  cameraPresets: AUG_CAMERA_PRESETS,
  workbenchMeta: AUG_WORKBENCH_META,
  geometryBuilders: AUG_GEOMETRY_BUILDERS,
  pbrBindings: AUG_PBR_BINDINGS,
  pbrSuites: AUG_PBR_SUITES,
};
