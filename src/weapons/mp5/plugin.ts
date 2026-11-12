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
  TimelinePresetItem,
  WeaponPartSpec,
  WeaponRuntimePlugin,
} from '../types';

export const MP5_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '滚柱延迟半自由枪机与拉机柄组',
    nameEn: 'Roller-Delayed Bolt Group & Non-Reciprocating Cocking Handle',
    badgeColor: '#0284c7',
  },
  {
    key: 'frame',
    nameZh: '冲压钢上机匣、三突笋枪管与伸缩托组',
    nameEn: 'Stamped Fluted Upper, 3-Lug Navy Barrel & A3 Retractable Stock',
    badgeColor: '#7c3aed',
  },
  {
    key: 'fire_control',
    nameZh: '海军版子弹图标握把座与抽屉火控盒组',
    nameEn: 'Navy Bullet-Pictogram Grip Housing & Modular Trigger Pack',
    badgeColor: '#d97706',
  },
  {
    key: 'magazine',
    nameZh: '9×19mm 30发弯弧冲压钢弹匣组',
    nameEn: '30-Round Curved Stamped-Steel 9×19mm Magazine',
    badgeColor: '#059669',
  },
];

export const MP5_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '合拢态',
    subLabel: '0%',
    t: 0,
    desc: 'HK MP5A3 全枪 26 节点严丝合缝归位，双圆柱滚柱在 45° 闭锁楔顶推下嵌入枪管节套闭锁凹槽。',
  },
  {
    id: 'field_strip',
    label: '野战分解',
    subLabel: '35%',
    t: 0.35,
    desc: '拔出前后连接插销：30 发弯钢弹匣、A3 伸缩钢托、热带宽护木、海军版握把座及滚柱枪机总成按勤务规程分离。',
  },
  {
    id: 'roller_bolt',
    label: '滚柱枪机',
    subLabel: '62%',
    t: 0.62,
    desc: '机头、左右 Ø8mm 圆柱闭锁滚柱、45° 闭锁楔铁、击针与重型枪机框分层悬浮展开，直观呈现 1:4 延迟传动几何。',
  },
  {
    id: 'fcg_detail',
    label: '抽屉火控',
    subLabel: '84%',
    t: 0.84,
    desc: '模块化不锈钢火控盒连同长杠杆抛壳挺、回转击锤、双侧子弹图标快慢机及弯弹匣内件逐级抽出。',
  },
  {
    id: 'full_exploded',
    label: '完全拆解',
    subLabel: '100%',
    t: 1.0,
    desc: '冲压加强筋上机匣、12 槽浮置弹膛三突笋枪管、旋转觇孔鼓照门及全部滚柱闭锁/火控节点完全展开。',
  },
] as const;

function steps(...items: KeyframeStep[]): KeyframeStep[] {
  return items;
}

export const MP5_PARTS: WeaponPartSpec[] = [
  // =========================================================================
  // 1. 滚柱延迟半自由枪机与拉机柄组 ('slide' · 9 parts)
  // =========================================================================
  {
    id: 'mp5_charging_handle',
    bomCode: 'B-01',
    nameZh: '非随动拉机柄与支撑套管',
    calloutLabel: '非随动 HK-Slap 拉机柄',
    nameEn: 'Non-Reciprocating Left HK-Slap Charging Handle',
    group: 'slide',
    material: 'nitride_steel',
    isShell: false,
    assembledPos: [12.45, 2.08, 0],
    explodeSteps: steps(
      { range: [0.35, 0.68], offset: [1.8, 3.2, -2.4] },
      { range: [0.68, 1.0], offset: [0.8, 1.4, -1.0] }
    ),
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [0, 0.55, -0.95],
    labelAppearAt: 0.36,
    roleTag: '前管解耦非随动上膛机构',
    description:
      '位于前拉机柄管左侧 L 形卡槽内的聚合物旋钮拉机柄，射击时与枪机框解耦保持完全静止（非随动）；换弹后可向下拍击脱离卡槽复进上膛（经典 HK Slap）。',
  },
  {
    id: 'mp5_bolt_carrier',
    bomCode: 'B-02',
    nameZh: '滚柱枪机框与上部复进簧套管',
    calloutLabel: '重型滚柱枪机框',
    nameEn: 'Heavy Steel Bolt Carrier & Recoil Spring Tube',
    group: 'slide',
    material: 'nitride_steel',
    isShell: false,
    assembledPos: [-1.15, 1.0, 0],
    explodeSteps: steps(
      { range: [0.22, 0.48], offset: [-4.8, 3.6, 0] },
      { range: [0.48, 0.78], offset: [0.6, 4.2, 0] },
      { range: [0.78, 1.0], offset: [0, 0.4, 0] }
    ),
    calloutDir: 'up',
    calloutStem: 68,
    calloutAnchor: [-0.4, 1.25, 0],
    labelAppearAt: 0.24,
    roleTag: '4倍质量惯性储能核心',
    description:
      '与上部细长复进簧支撑管钎焊为一体的重型机加工枪机框：质量约为机头的 4 倍，在 45° 闭锁楔放大加速下吸收后坐冲量，实现闭膛延迟开锁。',
  },
  {
    id: 'mp5_bolt_head',
    bomCode: 'B-03',
    nameZh: '滚柱闭锁机头与铜簧抽壳钩',
    calloutLabel: '滚柱闭锁机头',
    nameEn: 'Roller-Delayed Bolt Head & Copper-Spring Extractor',
    group: 'slide',
    material: 'stainless',
    isShell: false,
    assembledPos: [1.75, 1.0, 0],
    explodeSteps: steps(
      { range: [0.22, 0.48], offset: [-3.2, 3.6, 0] },
      { range: [0.48, 0.78], offset: [6.6, 4.2, 0] },
      { range: [0.78, 1.0], offset: [0.4, 0.4, 0] }
    ),
    calloutDir: 'up',
    calloutStem: 74,
    calloutAnchor: [0.1, 0.52, 0],
    labelAppearAt: 0.48,
    roleTag: '推弹闭锁与铜簧抽壳',
    description:
      '传承自 G3 步枪的紧凑钢制机头：两侧铣有精密矩形滚柱窗口，右侧镶嵌铜铍片簧抽壳钩，左下方开有贯通纵向窄槽供固定杠杆式抛壳挺穿过顶出弹壳。',
  },
  {
    id: 'mp5_locking_rollers',
    bomCode: 'B-04R',
    nameZh: '右侧圆柱闭锁滚柱 (Ø8mm)',
    calloutLabel: '右侧闭锁滚柱 (Ø8mm)',
    nameEn: 'Right Cylindrical Locking Roller (8mm Hardened Steel)',
    group: 'slide',
    material: 'stainless',
    isShell: false,
    assembledPos: [2.15, 1.0, 0.4],
    explodeSteps: steps(
      { range: [0.22, 0.48], offset: [-3.2, 3.6, 0] },
      { range: [0.48, 0.78], offset: [7.0, 4.2, 3.2] },
      { range: [0.78, 1.0], offset: [0.4, 0.4, 0.4] }
    ),
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 0.35, 0.2],
    labelAppearAt: 0.5,
    roleTag: '1:4 滚柱延迟闭锁核心',
    description:
      'HK 滚柱延迟自动机的核心闭锁元件（右滚柱）：闭膛时外凸卡入枪管节套凹槽；击发瞬间受节套斜面反推向内缩回（-Z），迫使 45° 闭锁楔以 4 倍行程差后退实现延迟开锁。',
  },
  {
    id: 'mp5_locking_roller_left',
    bomCode: 'B-04L',
    nameZh: '左侧圆柱闭锁滚柱 (Ø8mm)',
    calloutLabel: '左侧闭锁滚柱 (Ø8mm)',
    nameEn: 'Left Cylindrical Locking Roller (8mm Hardened Steel)',
    group: 'slide',
    material: 'stainless',
    isShell: false,
    assembledPos: [2.15, 1.0, -0.4],
    explodeSteps: steps(
      { range: [0.22, 0.48], offset: [-3.2, 3.6, 0] },
      { range: [0.48, 0.78], offset: [7.0, 4.2, -3.2] },
      { range: [0.78, 1.0], offset: [0.4, 0.4, -0.4] }
    ),
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 0.35, -0.2],
    labelAppearAt: 0.5,
    roleTag: '对称向内缩回延迟闭锁',
    description:
      '与右滚柱对称布置的淬火精密轴承钢左闭锁滚柱：开锁时沿 +Z 向枪机中轴线同步内缩，复进到位时被 45° 闭锁楔重新向外顶入节套闭锁槽。',
  },
  {
    id: 'mp5_locking_piece',
    bomCode: 'B-05',
    nameZh: '100°/45° 闭锁楔铁 (No.17 标准楔)',
    calloutLabel: '45° 闭锁楔铁',
    nameEn: '45-Degree Angled Locking Piece Wedge',
    group: 'slide',
    material: 'barrel_steel',
    isShell: false,
    assembledPos: [1.15, 1.0, 0],
    explodeSteps: steps(
      { range: [0.22, 0.48], offset: [-3.8, 3.6, 0] },
      { range: [0.48, 0.78], offset: [5.2, 2.2, 2.5] },
      { range: [0.78, 1.0], offset: [0.2, 0.4, 0.3] }
    ),
    calloutDir: 'up',
    calloutStem: 56,
    calloutAnchor: [0, 0.42, 0.25],
    labelAppearAt: 0.52,
    roleTag: '斜面变速比转换枢机',
    description:
      '插于机头与枪机框之间的高强度楔形斜面零件：前部双侧精密研磨角度决定双滚柱内缩阻力与机框/机头 4:1 位移传动比，中轴钻有贯通击针孔。',
  },
  {
    id: 'mp5_firing_pin',
    bomCode: 'B-06',
    nameZh: '浮动阶梯击针与回位簧',
    calloutLabel: '阶梯击针与击针簧',
    nameEn: 'Captive Stepped Firing Pin & Return Spring',
    group: 'slide',
    material: 'stainless',
    isShell: false,
    assembledPos: [0.55, 1.0, 0],
    explodeSteps: steps(
      { range: [0.22, 0.48], offset: [-4.2, 3.6, 0] },
      { range: [0.48, 0.78], offset: [3.2, 2.2, -2.5] },
      { range: [0.78, 1.0], offset: [-0.2, 0.4, -0.3] }
    ),
    calloutDir: 'up',
    calloutStem: 54,
    calloutAnchor: [0, 0.35, -0.2],
    labelAppearAt: 0.54,
    roleTag: '不到位防偶发保险击针',
    description:
      '贯穿枪机框与闭锁楔中心通道的阶梯式不锈钢击针及外圈击针回位簧；仅在闭锁楔完全前推到位（双滚柱完全闭锁）时击针尖方可探出机头底窝击发底火。',
  },
  {
    id: 'mp5_recoil_rod',
    bomCode: 'B-07',
    nameZh: '一体导杆式复进簧尾座组件',
    calloutLabel: '复进簧长导杆',
    nameEn: 'Captive Telescoping Recoil Spring Guide Rod',
    group: 'slide',
    material: 'barrel_steel',
    isShell: false,
    assembledPos: [-5.35, 2.08, 0],
    explodeSteps: steps(
      { range: [0.2, 0.5], offset: [-6.4, 3.2, -1.5] },
      { range: [0.5, 1.0], offset: [-1.4, 1.8, -0.5] }
    ),
    calloutDir: 'up',
    calloutStem: 50,
    calloutAnchor: [3.2, 0.3, 0],
    labelAppearAt: 0.3,
    roleTag: '上部复进同轴直线导向',
    description:
      '尾端铆接于上机匣后端口环形定位箍内的细长钢制复进导杆，深入枪机框上部空心长管内为复进簧提供全行程直线导向，防止高射速连发时弹簧屈曲。',
  },
  {
    id: 'mp5_recoil_spring',
    bomCode: 'B-08',
    nameZh: '长行程多圈螺旋复进簧',
    calloutLabel: '长行程螺旋复进簧',
    nameEn: 'Captive Helical Recoil Spring',
    group: 'slide',
    material: 'spring_steel',
    isShell: false,
    assembledPos: [0, 2.08, 0],
    explodeSteps: steps(
      { range: [0.2, 0.5], offset: [-5.2, 3.2, 1.5] },
      { range: [0.5, 1.0], offset: [-0.8, 1.8, 0.5] }
    ),
    calloutDir: 'up',
    calloutStem: 46,
    calloutAnchor: [0, 0.35, 0.2],
    labelAppearAt: 0.3,
    roleTag: '后坐缓冲与复进闭锁动力',
    description:
      '套装于复进导杆外圈的高疲劳强度琴钢丝螺旋弹簧：吸收滚柱开锁后的枪机后坐动能，并在回程中稳定推弹越过坡道入膛及顶推闭锁楔复位。',
  },

  // =========================================================================
  // 2. 冲压钢上机匣、三突笋枪管与伸缩托组 ('frame' · 8 parts)
  // =========================================================================
  {
    id: 'mp5_upper_receiver',
    bomCode: 'R-01',
    nameZh: '冲压钢纵向加强槽上机匣与弹匣井',
    calloutLabel: '冲压加强槽上机匣',
    nameEn: 'Stamped Sheet-Steel Fluted Upper Receiver & Claw Mount Bosses',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0, 0, 0],
    explodeSteps: steps({ range: [0.5, 1.0], offset: [0, 0.4, 0] }),
    calloutDir: 'up',
    calloutStem: 62,
    calloutAnchor: [-1.2, 2.65, 0],
    labelAppearAt: 0.55,
    roleTag: '全枪主承力薄钢板壳体',
    description:
      '由 1.2mm 冷轧特种薄钢板精密液压折弯焊接而成的圆截面主承力上机匣：两侧压有纵向加强凹槽与 A3 伸缩托导槽，顶部设四个 HK 爪式镜桥卡座，下焊前倾弹匣井与桨式/按钮双释放机构。',
  },
  {
    id: 'mp5_cocking_tube',
    bomCode: 'R-02',
    nameZh: '前伸拉机柄导向管与护木挂耳',
    calloutLabel: '前伸拉机柄管',
    nameEn: 'Forward Welded Cocking Tube & L-Notch Detent Slot',
    group: 'frame',
    material: 'nitride_steel',
    isShell: false,
    assembledPos: [10.35, 2.08, 0],
    explodeSteps: steps(
      { range: [0.55, 0.85], offset: [2.8, 1.8, 0] },
      { range: [0.85, 1.0], offset: [1.4, 1.0, 0] }
    ),
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0.5, 0.55, 0],
    labelAppearAt: 0.62,
    roleTag: 'L形卡槽挂机与前导向管',
    description:
      '焊接于上机匣前上方的圆筒形导向管：左侧铣有带向上挂机缺口的 L 形长槽，前端由带防松棘齿的端盖封口。',
  },
  {
    id: 'mp5_barrel',
    bomCode: 'R-03',
    nameZh: '8.85寸冷锻三突笋海军型枪管与节套',
    calloutLabel: '三突笋枪管与12槽节套',
    nameEn: '8.85" CHF 3-Lug Navy Threaded Barrel & 12-Flute Chamber Trunnion',
    group: 'frame',
    material: 'barrel_steel',
    isShell: false,
    assembledPos: [0, 1.0, 0],
    explodeSteps: steps(
      { range: [0.6, 0.88], offset: [5.4, 0.2, 0] },
      { range: [0.88, 1.0], offset: [2.8, 0, 0] }
    ),
    calloutDir: 'up',
    calloutStem: 56,
    calloutAnchor: [16.8, 0.42, 0],
    labelAppearAt: 0.64,
    roleTag: '燃气浮置弹膛与快拆三突笋',
    description:
      '奥伯多夫原厂冷锻 6 右旋膛线重型枪管，压入锻钢闭锁节套并点焊于机匣前端：弹膛内壁刻有 12 条纵向燃气浮置槽防止高速抽壳断壳，枪口带标志性 HK 三突笋快拆消音器接口与滚花护帽。',
  },
  {
    id: 'mp5_front_sight',
    bomCode: 'R-04',
    nameZh: '全包护圈柱状准星座与背带环',
    calloutLabel: '全包圆护圈准星座',
    nameEn: 'Classic HK Hooded Circular Ring Front Sight Tower',
    group: 'frame',
    material: 'nitride_steel',
    isShell: false,
    assembledPos: [15.4, 1.0, 0],
    explodeSteps: steps(
      { range: [0.62, 0.9], offset: [7.5, 1.6, 1.8] },
      { range: [0.9, 1.0], offset: [2.9, 0.6, 0.4] }
    ),
    calloutDir: 'up',
    calloutStem: 52,
    calloutAnchor: [0, 2.55, 0],
    labelAppearAt: 0.66,
    roleTag: '经典圈套圈快速同心瞄准',
    description:
      '骑跨于枪管与前拉机柄管之间的三角形铸钢准星座：顶部圆形全包护圈与旋转觇孔外廓形成著名“圈套圈 (Circle-in-Circle)”快速同心瞄准视野，下方集成护木插销孔与前背带环。',
  },
  {
    id: 'mp5_rear_sight',
    bomCode: 'R-05',
    nameZh: '倾斜式四孔旋转鼓形觇孔照门',
    calloutLabel: '倾斜旋转鼓形照门',
    nameEn: 'Tilted Rotary 4-Aperture Diopter Drum Rear Sight',
    group: 'frame',
    material: 'nitride_steel',
    isShell: false,
    assembledPos: [-4.25, 2.62, 0],
    explodeSteps: steps(
      { range: [0.55, 0.85], offset: [-1.2, 2.4, 0] },
      { range: [0.85, 1.0], offset: [-0.6, 1.2, 0] }
    ),
    calloutDir: 'up',
    calloutStem: 58,
    calloutAnchor: [0, 0.65, 0],
    labelAppearAt: 0.58,
    roleTag: '四孔径照度自适应觇孔鼓',
    description:
      '后倾安装的 HK 经典旋转鼓式觇孔照门：圆周分布四个不同孔径的精密同心圆孔（均校准于 9mm 弹道但适配不同环境照度），支持高低与风偏微调。',
  },
  {
    id: 'mp5_forearm',
    bomCode: 'R-06',
    nameZh: '热带加宽聚合物隔热护木',
    calloutLabel: '热带加宽隔热护木',
    nameEn: 'Wide Tropical Fiberglass-Reinforced Polymer Forearm',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [10.25, 0.72, 0],
    explodeSteps: steps(
      { range: [0.06, 0.32], offset: [2.8, -2.8, 0] },
      { range: [0.32, 1.0], offset: [2.6, -1.6, 0] }
    ),
    calloutDir: 'down',
    calloutStem: 54,
    calloutAnchor: [0.5, -1.1, 0],
    labelAppearAt: 0.14,
    roleTag: '单销快拆玻纤聚酰胺护木',
    description:
      '玻璃纤维增强哑光黑聚酰胺宽体“热带型 (Tropical)”护木：前窄后宽的饱满倒梯形握持截面有效隔绝连发枪管高温，通过前端单枚横插锁销即可秒拆。',
  },
  {
    id: 'mp5_stock_endcap',
    bomCode: 'R-07',
    nameZh: 'A3 枪托尾盖、H缓冲垫与锁定拨杆',
    calloutLabel: 'A3 尾盖与H缓冲垫',
    nameEn: 'MP5A3 Steel Stock Endcap, H-Buffer & Release Lever',
    group: 'frame',
    material: 'nitride_steel',
    isShell: false,
    assembledPos: [-5.95, 1.05, 0],
    explodeSteps: steps(
      { range: [0.08, 0.35], offset: [-3.4, 0.6, 0] },
      { range: [0.35, 1.0], offset: [-2.0, 1.0, 0] }
    ),
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [0, 1.35, 0],
    labelAppearAt: 0.16,
    roleTag: '枪机后坐缓冲与钢轨锁卡',
    description:
      '套接于上机匣尾部并由后横销锁定的钢制承力端盖：内侧镶嵌聚氨酯缓冲块吸收枪机框后坐撞击，两侧带伸缩托钢轨导孔与弹簧锁卡拨杆。',
  },
  {
    id: 'mp5_buttstock',
    bomCode: 'R-08',
    nameZh: 'MP5A3 双钢轨伸缩枪托与防滑橡胶托底',
    calloutLabel: 'MP5A3 双轨伸缩枪托',
    nameEn: 'MP5A3 Twin-Rail Retractable Steel Buttstock & Curved Pad',
    group: 'frame',
    material: 'nitride_steel',
    isShell: false,
    assembledPos: [-14.45, 0.35, 0],
    explodeSteps: steps(
      { range: [0.02, 0.3], offset: [-6.2, 0.2, 0] },
      { range: [0.3, 1.0], offset: [-3.0, 0.4, 0] }
    ),
    calloutDir: 'up',
    calloutStem: 56,
    calloutAnchor: [-0.4, 1.4, 0],
    labelAppearAt: 0.08,
    roleTag: '双侧铣槽伸缩钢轨肩托',
    description:
      'MP5A3 标志性紧凑战术枪托：两条铣有定位卡槽的刚性弹簧钢导轨可顺畅推入上机匣两侧凹槽内缩至最短携行尺寸，尾部配内弧包覆硬橡胶抵肩垫。',
  },

  // =========================================================================
  // 3. 海军版子弹图标握把座与抽屉火控盒组 ('fire_control' · 5 parts)
  // =========================================================================
  {
    id: 'mp5_grip_housing',
    bomCode: 'FC-01',
    nameZh: '海军版红白子弹图标聚合物握把座',
    calloutLabel: '海军版子弹图标握把座',
    nameEn: 'HK Navy Bullet-Pictogram Ambidextrous Polymer Grip Housing',
    group: 'fire_control',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-2.15, -0.35, 0],
    explodeSteps: steps(
      { range: [0.16, 0.45], offset: [-1.2, -4.2, 0] },
      { range: [0.45, 0.78], offset: [-0.6, -2.6, 0] },
      { range: [0.78, 1.0], offset: [-0.4, -1.4, 0] }
    ),
    calloutDir: 'down',
    calloutStem: 62,
    calloutAnchor: [-2.8, -4.6, 0],
    labelAppearAt: 0.22,
    roleTag: '红白三档子弹图标下机匣',
    description:
      'HK Navy 经典一体化聚合物下机匣握把座：握把呈人体工学后掠倾角并带宽大冬季手套扳机护圈，左右双侧注塑热压白底叉号保险、红框单发（1弹）与红框全自动（连发）国际通用子弹图标。',
  },
  {
    id: 'mp5_trigger_pack',
    bomCode: 'FC-02',
    nameZh: '模块化不锈钢火控盒与长杠杆抛壳挺',
    calloutLabel: '抽屉式火控盒与抛壳挺',
    nameEn: 'Removable Sheet-Steel Trigger Box, Sear & Pivoted Ejector Lever',
    group: 'fire_control',
    material: 'stainless',
    isShell: false,
    assembledPos: [-1.85, -0.25, 0],
    explodeSteps: steps(
      { range: [0.16, 0.45], offset: [-1.2, -4.2, 0] },
      { range: [0.65, 1.0], offset: [-0.4, 0, 0] }
    ),
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [1.8, 0.85, 0],
    labelAppearAt: 0.66,
    roleTag: '独立不锈钢盒式击发模块',
    description:
      '整体装入握把座槽内的独立冲压不锈钢盒式火控模块：集成阻铁、不到位保险与单连发断连器，前左上缘铰接标志性长摇臂杠杆抛壳挺，枪机后坐时上抬探入机头槽将空弹壳猛力踢向右外侧。',
  },
  {
    id: 'mp5_hammer',
    bomCode: 'FC-03',
    nameZh: '回转钢击锤与击锤簧顶杆',
    calloutLabel: '回转击锤与主簧顶杆',
    nameEn: 'Rotary Hardened Steel Hammer & Strut Assembly',
    group: 'fire_control',
    material: 'barrel_steel',
    isShell: false,
    assembledPos: [-0.85, -0.05, 0],
    explodeSteps: steps(
      { range: [0.16, 0.45], offset: [-1.2, -4.2, 0] },
      { range: [0.7, 1.0], offset: [0.8, 1.8, 2.6] }
    ),
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, 0.85, 0.2],
    labelAppearAt: 0.72,
    roleTag: '闭膛首发精准回转击发',
    description:
      '铰接于火控盒主轴上的淬火合金钢回转击锤及后部导杆螺旋主簧：扣动扳机脱钩后绕轴高速前旋（+X），穿过枪机框尾部开口精准敲击浮动击针尾端。',
  },
  {
    id: 'mp5_trigger',
    bomCode: 'FC-04',
    nameZh: '弧形钢扳机与滚轮阻铁连杆',
    calloutLabel: '弧形钢制扳机',
    nameEn: 'Curved Steel Trigger Shoe & Transfer Bow',
    group: 'fire_control',
    material: 'nitride_steel',
    isShell: false,
    assembledPos: [-1.75, -0.95, 0],
    explodeSteps: steps(
      { range: [0.16, 0.45], offset: [-1.2, -4.2, 0] },
      { range: [0.72, 1.0], offset: [-0.2, -1.4, 2.6] }
    ),
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [0, -0.95, 0.2],
    labelAppearAt: 0.72,
    roleTag: '一级传递臂释锤控制',
    description:
      '穿过握把座底槽的宽弧面钢制扳机组件：向后扣动时抬起前端传递臂释放阻铁，行程干脆利落，助力 MP5 在半自动与短点射下保持卓越首发散布精度。',
  },
  {
    id: 'mp5_selector',
    bomCode: 'FC-05',
    nameZh: '双侧联动拇指快慢机轴与拨杆',
    calloutLabel: '双侧联动快慢机拨杆',
    nameEn: 'Ambidextrous Navy Selector Drum Axle & Dual Levers',
    group: 'fire_control',
    material: 'nitride_steel',
    isShell: false,
    assembledPos: [-3.15, -0.55, 0],
    explodeSteps: steps(
      { range: [0.16, 0.45], offset: [-1.2, -4.2, 0] },
      { range: [0.68, 1.0], offset: [-1.0, -4.0, -3.6] }
    ),
    calloutDir: 'down',
    calloutStem: 56,
    calloutAnchor: [0.5, -0.25, -0.8],
    labelAppearAt: 0.68,
    roleTag: '保险 / 单发 / 800发全自动切换',
    description:
      '横穿聚合物握把座与不锈钢火控盒的凸轮锁轴：不仅将火控盒锁固在握把座内，左右双侧带白线指示槽的拨杆更支持左右手射手拇指快速切换保险、半自动与 800 发/分全自动模式。',
  },

  // =========================================================================
  // 4. 9×19mm 30发弯弧冲压钢弹匣组 ('magazine' · 4 parts)
  // =========================================================================
  {
    id: 'mp5_mag_body',
    bomCode: 'M-01',
    nameZh: '30发弯弧冲压钢弹匣体 (9mm×19)',
    calloutLabel: '30发弯弧冲压钢弹匣',
    nameEn: '30-Round Curved Stamped-Steel Magazine Body',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [2.9, -0.45, 0],
    explodeSteps: steps(
      { range: [0.0, 0.25], offset: [1.2, -3.8, 0] },
      { range: [0.25, 1.0], offset: [1.0, -1.0, 0] }
    ),
    calloutDir: 'down',
    calloutStem: 58,
    calloutAnchor: [1.2, -4.2, 0],
    labelAppearAt: 0.1,
    roleTag: '双排双进圆弧锥度弹匣',
    description:
      '1977 年定型的标志性前弯圆弧钢制双排双进 30 发弹匣：精准贴合 9×19mm 帕拉贝鲁姆锥度弹壳几何，彻底消除早期直弹匣空尖弹供弹卡滞，侧壁冲压减重防滑凹槽。',
  },
  {
    id: 'mp5_mag_follower',
    bomCode: 'M-02',
    nameZh: '双排阶梯防倾托弹板',
    calloutLabel: '双排阶梯托弹板',
    nameEn: 'Staggered Double-Column Anti-Tilt Follower',
    group: 'magazine',
    material: 'follower_orange',
    isShell: false,
    assembledPos: [3.04, -1.52, 0],
    explodeSteps: steps(
      { range: [0.0, 0.25], offset: [1.2, -3.8, 0] },
      { range: [0.64, 0.98], offset: [0.6, 1.4, -2.6] }
    ),
    calloutDir: 'down',
    calloutStem: 46,
    calloutAnchor: [0, 0.35, -0.3],
    labelAppearAt: 0.66,
    roleTag: '圆弧双排交替导向托弹',
    description:
      '沿弹匣内壁圆弧导轨顺滑升降的双排交错高可视度托弹板，保证 800 发/分高射速连发时最末发弹药仍以准确迎角推入节套坡道。',
  },
  {
    id: 'mp5_mag_spring',
    bomCode: 'M-03',
    nameZh: '弯弧矩形盘簧托弹簧',
    calloutLabel: '弯弧矩形托弹簧',
    nameEn: 'Curved Rectangular-Coil Magazine Spring',
    group: 'magazine',
    material: 'spring_steel',
    isShell: false,
    assembledPos: [2.9, -0.45, 0],
    explodeSteps: steps(
      { range: [0.0, 0.25], offset: [1.2, -3.8, 0] },
      { range: [0.6, 0.95], offset: [1.8, -4.0, 2.8] }
    ),
    calloutDir: 'down',
    calloutStem: 52,
    calloutAnchor: [1.1, -4.0, 0.3],
    labelAppearAt: 0.64,
    roleTag: '恒力高速连发供弹储能',
    description:
      '顺应弹匣圆弧曲率绕制的耐腐蚀弹簧钢矩形托弹簧，在满载 30 发至打空全行程提供恒定供弹上托力。',
  },
  {
    id: 'mp5_mag_floorplate',
    bomCode: 'M-04',
    nameZh: '平齐滑入式冲压钢弹匣底板',
    calloutLabel: '滑入式钢弹匣底板',
    nameEn: 'Flush Slide-On Stamped Steel Magazine Floorplate',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: false,
    assembledPos: [5.18, -8.23, 0],
    explodeSteps: steps(
      { range: [0.0, 0.25], offset: [1.2, -3.8, 0] },
      { range: [0.55, 0.88], offset: [2.2, -3.4, 0] }
    ),
    calloutDir: 'down',
    calloutStem: 48,
    calloutAnchor: [0, -0.35, 0],
    labelAppearAt: 0.6,
    roleTag: '翻边滑轨快拆封闭底盖',
    description:
      '扣合于弯弹匣底缘翻边导轨并由弹簧锁片定位的冲压钢底盖，按压中心圆孔锁扣即可滑出清沙保养。',
  },
];

// ============================================================================
// 7-Stage Closed-Bolt Roller-Delayed Blowback Firing Cycle
// ============================================================================

export const MP5_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'mp5_trigger_release',
    stepNum: '01',
    shortLabel: '闭膛扣机释锤',
    title: '阶段 1 · 闭膛滚柱锁死状态下扣动扳机释放回转击锤',
    range: [0.0, 0.12],
    description:
      'MP5 采用闭膛待击（Closed-Bolt）：双圆柱滚柱外张锁死于枪管节套闭锁槽内；手指扣动弧形扳机向后摆动，抬起传递连杆压下阻铁，释放处于待击位的回转击锤。',
  },
  {
    id: 'mp5_hammer_ignition',
    stepNum: '02',
    shortLabel: '击锤敲针击发',
    title: '阶段 2 · 回转击锤挥击浮动击针引燃 9×19mm 底火出膛',
    range: [0.12, 0.22],
    description:
      '回转击锤高速前摆穿过枪机框尾口敲击浮动击针，击针穿过 45° 闭锁楔刺破 9×19mm 底火；弹头沿 8.85 寸 6 右旋冷锻枪管加速冲出三突笋枪口。',
  },
  {
    id: 'mp5_roller_delay_unlock',
    stepNum: '03',
    shortLabel: '双滚柱内缩延迟',
    title: '阶段 3 · 两侧 Ø8mm 滚柱向内缩回驱动 45° 楔铁 1:4 延迟开锁',
    range: [0.22, 0.36],
    description:
      '膛内火药燃气经 12 条浮置槽托住弹壳向后推压机头：左右闭锁滚柱受节套斜面挤压同步向中轴内缩（±Z→0），顶推 45° 闭锁楔与重型枪机框以 4 倍行程差先行后退，延迟至膛压安全下降后方才完全开锁。',
  },
  {
    id: 'mp5_blowback_ejection',
    stepNum: '04',
    shortLabel: '后坐撞挺抛壳',
    title: '阶段 4 · 枪机高速后坐蓄能与杠杆抛壳挺踢出空弹壳（拉机柄静止）',
    range: [0.36, 0.56],
    description:
      '双滚柱完全缩入机头窗口后，枪机总成惯性高速后坐并压蓄上部复进簧、下压击锤挂入单发断连器；左下方长杠杆抛壳挺探入机头窄槽，配合右抽壳钩将空弹壳从右侧抛壳窗猛力踢出（拉机柄全程静止不随动！）。',
  },
  {
    id: 'mp5_buffer_reversal',
    stepNum: '05',
    shortLabel: 'H缓冲止动供弹',
    title: '阶段 5 · 枪机框撞击尾盖聚氨酯 H 缓冲垫止动与弯弹匣托弹上升',
    range: [0.56, 0.68],
    description:
      '枪机框尾端平稳撞击 A3 枪托端盖内侧聚氨酯 H 缓冲垫止动回弹；与此同时 30 发弯弧钢弹匣托弹簧将下一发 9×19mm 实弹推升至抱弹口待命。',
  },
  {
    id: 'mp5_counter_recoil_feed',
    stepNum: '06',
    shortLabel: '复进推弹入膛',
    title: '阶段 6 · 长行程复进簧驱动枪机前冲剥离新弹顺坡道入膛',
    range: [0.68, 0.86],
    description:
      '长行程复进簧释放势能驱动枪机总成急速前冲，机头下缘剥离弯弹匣首枚 9×19mm 实弹顺节套导引坡推入带浮置槽的弹膛内，滑行期间双滚柱保持内缩。',
  },
  {
    id: 'mp5_roller_cam_lock',
    stepNum: '07',
    shortLabel: '楔铁顶出滚柱闭锁',
    title: '阶段 7 · 45° 闭锁楔最后前推将双滚柱向外顶入节套闭锁复位',
    range: [0.86, 1.0],
    description:
      '机头抵拢枪管尾端面止动，枪机框继续前冲最后 4mm 行程将 45° 闭锁楔楔入两枚滚柱之间，把左右闭锁滚柱重新向外（±Z）死死顶入节套闭锁凹槽，扳机断路交接完成闭膛循环。',
  },
];

const ZERO_DELTA: PartKinematicDelta = {
  pos: [0, 0, 0],
  rot: [0, 0, 0],
  scaleX: 1,
};

/**
 * Mechanically coupled Oberndorf HK MP5A3 1:4 Roller-Delayed Blowback solver:
 *  - Stage 3 [0.22, 0.36] (Roller-Delayed Dwell & Unlock):
 *      Chamber gas pressure floats the 9×19mm case via the 12 chamber flutes and pushes the bolt head back -0.18 (1.8mm).
 *      Trunnion locking ramps cam both Ø8mm rollers inward by 0.165 (flush with ±0.42 bolt head walls) against the
 *      45°/50° Steuerstück locking piece, forcing the locking piece & heavy bolt carrier rearward by an additional
 *      carrierGapDx = -0.54 -> carrierDx = -0.18 + (-0.54) = -0.72 (true 4:1 mechanical velocity/displacement ratio!).
 *  - Stage 4 [0.36, 0.56] (Synchronized Blowback Recoil & Ejection):
 *      With rollers retracted flush inside bolt head windows (rollerRetract = 1.0, carrierGapDx = -0.54),
 *      boltHeadDx recoils -0.18 -> -2.05 and carrierDx recoils -0.72 -> -2.59, stopping carrier rear (-3.00 - 2.59 = -5.59)
 *      flush against the polyurethane H-buffer (-5.59) and retracting bolt face (+0.60) behind mag feed lips & ejector!
 *  - Stage 5 [0.56, 0.68] (Polyurethane H-Buffer Cushion & Reversal):
 *      Carrier impacts the stock endcap H-buffer and rebounds smoothly (-2.05 -> -1.85 boltHeadDx) while magazine feeds.
 *  - Stage 6 [0.68, 0.86] (Counter-Recoil & Cartridge Strip):
 *      Recoil spring drives bolt group forward (boltHeadDx: -1.85 -> 0.0) while rollers stay retracted (carrierGapDx = -0.54),
 *      stripping the fresh 9×19mm cartridge up the trunnion feed ramp into the fluted chamber.
 *  - Stage 7 [0.86, 0.94] (Final 45° Wedge Lockup):
 *      Bolt head stops at battery (boltHeadDx = 0.0) while recoil spring drives carrier & 45° locking piece forward
 *      through the final 5.4mm (carrierGapDx: -0.54 -> 0.0), camming both Ø8mm rollers outward into trunnion recesses!
 */
function sampleMp5RollerBoltGroup(f: number): {
  rollerRetract: number;
  boltHeadDx: number;
  carrierGapDx: number;
  carrierDx: number;
} {
  let rollerRetract = 0;
  if (f >= 0.22 && f < 0.36) {
    rollerRetract = seg(f, 0.22, 0.36);
  } else if (f >= 0.36 && f < 0.86) {
    rollerRetract = 1.0;
  } else if (f >= 0.86 && f < 0.94) {
    rollerRetract = 1.0 - seg(f, 0.86, 0.94);
  }

  let boltHeadDx = 0;
  if (f >= 0.22 && f < 0.36) {
    boltHeadDx = -0.18 * seg(f, 0.22, 0.36);
  } else if (f >= 0.36 && f < 0.56) {
    boltHeadDx = -0.18 - 1.87 * seg(f, 0.36, 0.56);
  } else if (f >= 0.56 && f < 0.68) {
    boltHeadDx = -2.05 + 0.2 * seg(f, 0.56, 0.68);
  } else if (f >= 0.68 && f < 0.86) {
    boltHeadDx = -1.85 * (1.0 - seg(f, 0.68, 0.86));
  }

  const carrierGapDx = -0.54 * rollerRetract;
  const carrierDx = boltHeadDx + carrierGapDx;

  return { rollerRetract, boltHeadDx, carrierGapDx, carrierDx };
}

/**
 * Computes closed-bolt roller-delayed blowback kinematics for every MP5A3 part:
 *  - mp5_charging_handle stays strictly stationary (pos = [0, 0, 0]) during firing!
 *  - mp5_locking_rollers (Z = +0.40) cams INWARD (dz = -0.165) & mp5_locking_roller_left (Z = -0.40) cams INWARD (dz = +0.165)
 *  - mp5_locking_piece & mp5_bolt_carrier lead mp5_bolt_head 4:1 during [0.22, 0.36] roller unlock and close last during [0.86, 0.94] cam lock!
 *  - mp5_recoil_spring compresses dynamically with rear end pinned at X = -5.20
 */
export function computeMp5FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);

  // 1. Non-reciprocating HK-Slap charging handle NEVER moves during firing!
  if (partId === 'mp5_charging_handle') {
    return ZERO_DELTA;
  }

  const { rollerRetract, boltHeadDx, carrierDx } = sampleMp5RollerBoltGroup(f);

  switch (partId) {
    case 'mp5_bolt_carrier':
      return { pos: [carrierDx, 0, 0], rot: [0, 0, 0], scaleX: 1 };

    case 'mp5_locking_piece':
      return { pos: [carrierDx, 0, 0], rot: [0, 0, 0], scaleX: 1 };

    case 'mp5_bolt_head':
      return { pos: [boltHeadDx, 0, 0], rot: [0, 0, 0], scaleX: 1 };

    case 'mp5_locking_rollers':
      // Right (+Z = +0.40, r = 0.185) roller cams INWARD (-Z) by -0.165 flush into bolt head window!
      return {
        pos: [boltHeadDx, 0, -0.165 * rollerRetract],
        rot: [0, 0, 0],
        scaleX: 1,
      };

    case 'mp5_locking_roller_left':
      // Left (-Z = -0.40, r = 0.185) roller cams INWARD (+Z) by +0.165 flush into bolt head window!
      return {
        pos: [boltHeadDx, 0, +0.165 * rollerRetract],
        rot: [0, 0, 0],
        scaleX: 1,
      };

    case 'mp5_firing_pin': {
      // Surges forward +0.26 through fully-seated 45° locking piece only while rollers are locked in battery [0.135, 0.22]
      const pinPoke = 0.26 * (seg(f, 0.135, 0.175) - seg(f, 0.185, 0.26));
      return { pos: [carrierDx + pinPoke, 0, 0], rot: [0, 0, 0], scaleX: 1 };
    }

    case 'mp5_recoil_spring': {
      // Local X spans [-5.20, +5.80] (L0 = 11.0). Pin rear end at X = -5.20 while front tracks carrierDx!
      const L0 = 11.0;
      const rearAnchorLocal = -5.2;
      const scaleX = Math.max(0.38, (L0 + carrierDx) / L0);
      const dx = rearAnchorLocal * (1.0 - scaleX);
      return { pos: [dx, 0, 0], rot: [0, 0, 0], scaleX };
    }

    case 'mp5_trigger': {
      // Hangs below pivot (0,0,0) -> rz < 0 pulls trigger shoe rearward (-X), resets cleanly over [0.89, 0.97]
      const pull = seg(f, 0.0, 0.1) - seg(f, 0.89, 0.97);
      return { pos: [0, 0, 0], rot: [0, 0, -0.3 * pull], scaleX: 1 };
    }

    case 'mp5_hammer': {
      // Geometry bakes hammerHead.rotateZ(1.26) cocked-down rearward (worldY_max <= +0.45 below carrier & bolt):
      //  - Released at sear break [0.085, 0.15] -> swings UP & FORWARD through hammerSlot to strike firing pin (rz = -1.30)
      //  - Cammed back down by recoiling bolt carrier ramp [0.23, 0.36] past overcock (rz = +0.08) before carrier sweeps X = -0.85
      //  - Caught on semi-auto disconnector [0.52, 0.62] (rz = +0.04)
      //  - Handed back to primary roller sear during trigger reset [0.90, 0.98] -> rz = 0
      const swingStrike = seg(f, 0.085, 0.15);
      const recockOver = seg(f, 0.23, 0.36);
      const catchDisconnector = seg(f, 0.52, 0.62);
      const searHandoff = seg(f, 0.9, 0.98);
      const rz =
        -1.3 * swingStrike +
        1.38 * recockOver -
        0.04 * catchDisconnector -
        0.04 * searHandoff;
      return { pos: [0, 0, 0], rot: [0, 0, rz], scaleX: 1 };
    }

    case 'mp5_mag_follower': {
      const lift = seg(f, 0.54, 0.67) - seg(f, 0.69, 0.83);
      return {
        pos: [-0.05 * lift, 0.28 * lift, 0],
        rot: [0, 0, 0],
        scaleX: 1,
      };
    }

    case 'mp5_mag_spring': {
      const lift = seg(f, 0.54, 0.67) - seg(f, 0.69, 0.83);
      return {
        pos: [0, 0.13 * lift, 0],
        rot: [0, 0, 0],
        scaleX: 1,
      };
    }

    default:
      return ZERO_DELTA;
  }
}

/**
 * 9×19mm Parabellum closed-bolt ballistics state aligned to MP5A3 bore Y = 1.00,
 * fluted chamber X = 3.65, 3-lug muzzle X = 19.55, and right ejection port (+Z).
 * (Zero gas port flash — pure roller-delayed blowback!)
 */
export function computeMp5BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const { boltHeadDx } = sampleMp5RollerBoltGroup(f);
  const boreY = 1.0;
  const chamberX = 3.65;
  const muzzleX = 19.55;

  // 1. 9x19mm FMJ Bullet: seated in chamber [0, 0.155], accelerates down 8.85" barrel [0.155, 0.215], supersonic flight [0.215, 0.36]
  const bulletVisible = f < 0.36;
  let bulletX = chamberX + 0.72;
  let streakLength = 0;
  if (f >= 0.155 && f < 0.215) {
    const p = Math.pow(linearSeg(f, 0.155, 0.215), 1.4);
    bulletX = chamberX + 0.72 + (muzzleX - (chamberX + 0.72)) * p;
    streakLength = 1.4 * p;
  } else if (f >= 0.215 && f < 0.36) {
    const p = linearSeg(f, 0.215, 0.36);
    bulletX = muzzleX + p * 26.0;
    streakLength = 2.6 * (1 - 0.55 * p);
  }

  // 2. Spent 9x19mm Brass Case:
  // [0, 0.22]: in 12-flute gas-floated chamber at [3.65, 1.00, 0]
  // [0.22, 0.44]: extracted rearward 1:1 with boltHeadDx by copper-spring extractor claw along bore
  // [0.44, 0.68]: kicked cleanly out right ejection port [1.44, 3.86] (+Z, +Y) by pivoted ejector lever!
  const spentCaseVisible = f < 0.68;
  let caseX = chamberX;
  let caseY = boreY;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.22 && f < 0.44) {
    caseX = chamberX + boltHeadDx;
    caseZ = 0.03 * seg(f, 0.22, 0.44);
  } else if (f >= 0.44 && f < 0.68) {
    const u = linearSeg(f, 0.44, 0.68);
    const ejectOriginX = chamberX + sampleMp5RollerBoltGroup(0.44).boltHeadDx;
    caseX = ejectOriginX - 0.65 * u;
    caseY = boreY + 4.8 * u - 6.8 * u * u;
    caseZ = 0.03 + 8.8 * u;
    caseRX = u * 9.2;
    caseRY = u * 11.4;
    caseRZ = -u * 12.6;
    if (f > 0.56) {
      spentCaseOpacity = 1 - linearSeg(f, 0.56, 0.68);
    }
  }

  // 3. Fluted Chamber Flash & 3-Lug Muzzle Plume (zero gas-block port flash!)
  let chamberFlashIntensity = 0;
  if (f >= 0.15 && f <= 0.24) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.15, 0.24) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.205 && f <= 0.3) {
    const u = linearSeg(f, 0.205, 0.3);
    muzzlePlumeScale = 0.38 + 1.28 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.82;
  }

  // 4. Next 9x19mm Cartridge in Curved 30-Rd Mag -> Stripped up Trunnion Feed Ramp into Chamber [3.65, 1.00, 0]
  let nextX = 2.68;
  let nextY = -0.18;
  let nextRZ = 0.15;

  if (f >= 0.54 && f < 0.66) {
    const u = seg(f, 0.54, 0.66);
    nextX = 2.68 - 0.05 * u;
    nextY = -0.18 + 0.52 * u;
    nextRZ = 0.15 + 0.05 * u;
  } else if (f >= 0.66 && f < 0.86) {
    const u = seg(f, 0.66, 0.86);
    const rampArc = Math.sin(u * Math.PI) * 0.18;
    nextX = 2.63 + (chamberX - 2.63) * u;
    nextY = 0.34 + (boreY - 0.34) * u + rampArc;
    nextRZ = 0.2 * (1 - u);
  } else if (f >= 0.86) {
    nextX = chamberX;
    nextY = boreY;
    nextRZ = 0;
  }

  // 5. Reserve Cartridge underneath in Curved 30-Rd Mag (sits cleanly between nextRound -0.18 and follower -1.07!)
  const magShift = seg(f, 0.54, 0.72);
  const resX = 2.8 + (2.68 - 2.8) * magShift;
  const resY = -0.82 + (-0.18 - -0.82) * magShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, boreY, 0],
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
    reserveRoundPos: [resX, resY, 0.12],
  };
}

// ============================================================================
// Camera Presets, Workbench Meta, PBR Bindings & Exported MP5_MODULE
// ============================================================================

export const MP5_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  mp5_upper_receiver: {
    albedoFile: 'mp5_receiver_albedo.webp',
    normalFile: 'mp5_receiver_normal.webp',
    roughnessFile: 'mp5_receiver_roughness.webp',
    normalScale: 0.34,
  },
  mp5_grip_housing: {
    albedoFile: 'mp5_lower_albedo.webp',
    normalFile: 'mp5_lower_normal.webp',
    roughnessFile: 'mp5_lower_roughness.webp',
    normalScale: 0.44,
  },
};

export const MP5_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'mp5_receiver',
    weapon: 'mp5' as const,
    titleCn: '德国奥伯多夫半光黑烤漆冲压钢上机匣贴图组',
    partTag: 'R-01 FLUTED RECEIVER',
    resolution: '2048 × 1024 px',
    summary:
      '真实还原德国黑克勒-科赫（Heckler & Koch Oberndorf）原厂锰系磷化底漆与半光黑烤漆工艺：呈现冲压薄钢板机匣平整无波纹法线、两侧纵向加强凹槽与伸缩托导轨银灰摩擦亮带、左侧弹匣井上方 HK MP5 9mm×19 原厂滚印铭文、乌尔姆鹿角检验戳及枪管节套电阻点焊凹痕。',
    highlights: [
      '左侧弹匣井 HK MP5 9mm×19 激光白字铭文与 62- 序列号',
      '纵向冲压加强槽明暗过渡与 A3 伸缩钢托导槽往复摩擦亮痕',
      '无高频噪波光学平整钢面法线 + 节套环形点焊压痕细节',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'mp5_receiver_albedo.webp',
        note: 'sRGB · 德式半光深黑烤漆 / HK MP5 9mm×19 白字铭文 / 导槽磨损金属色',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'mp5_receiver_normal.webp',
        note: 'Linear · 平整冲压钢板法线 + 加强槽折边斜坡 + 点焊与凹刻钢印',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'mp5_receiver_roughness.webp',
        note: 'Linear · 半光烤漆底面 (0.37) vs 伸缩托钢轨往复抛光带 (0.20)',
      },
    ],
  },
  {
    id: 'mp5_lower',
    weapon: 'mp5' as const,
    titleCn: 'HK Navy 海军版红白子弹图标聚合物握把座贴图组',
    partTag: 'FC-01 NAVY GRIP HOUSING',
    resolution: '1024 × 1024 px',
    summary:
      '专为 MP5A3 标志性“海军版 (Navy Trigger Group)”双侧联动聚合物下机匣制作：在细腻微喷砂哑光炭黑聚酰胺基体双侧，精准热压填充白框叉号保险（Safe）、鲜红方框 1 发实弹（Semi）与开口红框 5 发虚线连发（800 RPM Auto）国际通用子弹图标及定位圆点。',
    highlights: [
      '左右双侧镜像对齐的白/信号红三档 HK 子弹图标（Safe / 1 / Auto）',
      '快慢机旋转定位圆点与轻微扇形拨动摩擦光泽轨迹',
      '细腻玻纤聚酰胺哑光颗粒 (0.71) vs 热压色漆光泽度 (0.38) 反差',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'mp5_lower_albedo.webp',
        note: 'sRGB · 哑光炭黑聚酰胺 / 信号红与纯白 HK 海军版子弹档位图标',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'mp5_lower_normal.webp',
        note: 'Linear · 细腻注塑微喷砂皮纹 + 子弹图标热压凹槽边缘法线',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度',
        fileName: 'mp5_lower_roughness.webp',
        note: 'Linear · 聚合物高哑光握持面 vs 档位色漆与拇指摩擦低粗糙度对比',
      },
    ],
  },
  {
    id: 'mp5_seamless_detail',
    weapon: 'mp5',
    titleCn: '双滚柱闭锁枪机、三突笋枪管与伸缩钢托无缝细节贴图',
    partTag: '24 ROLLER-BOLT & STOCK PARTS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为双圆柱闭锁滚柱、45° 闭锁楔铁、机头、非随动拉机柄、旋转鼓式照门、双导轨伸缩钢托与热带宽护木提供微米级金属磨削与聚酰胺注塑法线细节。',
    highlights: [
      '双闭锁滚柱与 45° 楔铁高精度磨削金属拉丝法线',
      'MP5A3 双钢轨伸缩托与 30 发弯弧钢弹匣油膜光泽',
      '覆盖其余全部 24 个滚柱枪机、瞄具与火控内件',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属 CNC 拉丝法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于双闭锁滚柱/45°闭锁楔/枪机框/三突笋枪管/弯钢弹匣等',
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
        note: 'Linear · 用于热带宽体前护木/拉机柄拍柄/伸缩托橡胶缓冲垫等',
      },
    ],
  },
];

export const MP5_PLUGIN: WeaponRuntimePlugin = {
  id: 'mp5',
  partGroups: MP5_PART_GROUPS,
  timelinePresets: MP5_TIMELINE_PRESETS,
  parts: MP5_PARTS,
  firingPhases: MP5_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(MP5_FIRING_PHASES, f),
  computeFiringKinematics: computeMp5FiringKinematics,
  computeBallisticsState: computeMp5BallisticsState,
  pbrBindings: MP5_PBR_BINDINGS,
  pbrSuites: MP5_PBR_SUITES,
};
