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

export const REM870_ID: WeaponId = 'rem870';
export const REM870_CALIBER: CaliberProfile = '12_gauge';

export const REM870_PART_GROUPS: AssemblyGroupMeta[] = [
  {
    key: 'slide',
    nameZh: '18英寸重枪管、玉米棒前护木、双连杆与下坠闭锁枪机组',
    nameEn: '18" Barrel, Corn-Cob Forend, Twin Action Bars & Bolt',
    badgeColor: '#38bdf8',
  },
  {
    key: 'frame',
    nameZh: '整块锻钢铣削机匣、幽灵环照门与警用胡桃木后托组',
    nameEn: 'Solid Billet Steel Receiver, Sights & Police Walnut Stock',
    badgeColor: '#64748b',
  },
  {
    key: 'fire_control',
    nameZh: '双销快拆铝合金警用扳机座、连杆释放钮与火控弹簧组',
    nameEn: 'Dual-Pin Police Trigger Plate, Slide Release & Springs',
    badgeColor: '#f59e0b',
  },
  {
    key: 'magazine',
    nameZh: '4+1管式弹仓、高可视橙红托弹杯与硬铬升降托弹勺组',
    nameEn: '4+1 Steel Mag Tube, Orange Follower & Chrome Carrier',
    badgeColor: '#fb923c',
  },
];

export const REM870_TIMELINE_PRESETS: readonly TimelinePresetItem[] = [
  {
    id: 'assembled',
    label: '完整合拢态',
    subLabel: '0% Assembled',
    t: 0,
    desc: '雷明顿 870 警用马格南泵动霰弹枪（Remington Model 870 Police Magnum）：整块合金钢铣削机匣搭配防扭曲双拉壳推杆（Twin Action Bars）与硬铬斜楔下坠闭锁枪机，成就全球销量突破 1,100 万支的泵动神话。',
  },
  {
    id: 'field_strip',
    label: '免工具泵动野战分解',
    subLabel: '30% Field Strip',
    t: 0.3,
    desc: '拧下滚花弹仓端盖拆出 18 英寸重壁枪管，拨开弹仓内阻片同步抽出玉米棒前护木、双推杆管与硬铬枪机组合，并顶出双定位销下拉整体扳机盒。',
  },
  {
    id: 'sub_assembly',
    label: '双连杆/闭锁/托弹细拆',
    subLabel: '65% Sub-Assembly',
    t: 0.65,
    desc: '剥离推杆凸轮滑块、倾斜楔形闭锁块与惯性击针，拆下警用胡桃木枪托与长通心拉紧螺栓，取出高可视度橙红导弹杯与硬铬升降托弹板。',
  },
  {
    id: 'full_exploded',
    label: '全枪 24 节点爆炸图',
    subLabel: '100% Full Exploded',
    t: 1,
    desc: '全部 24 个 1:1 精密机械零件零遮挡展开：直观对比军警双推杆防偏磨泵动结构与 12 号重型霰弹从下挂弹仓到升降托弹勺的完整供弹闭锁链路。',
  },
];

export const REM870_PARTS: WeaponPartSpec[] = [
  // ==================== 1. BARREL, PUMP FOREND, TWIN ACTION BARS & BOLT ('slide' · 8 parts) ====================
  {
    id: 'rem870_barrel',
    bomCode: 'B-01',
    nameZh: '18英寸改良圆柱喉缩磷化厚壁滑膛枪管',
    calloutLabel: '18英寸磷化厚壁枪管',
    nameEn: '18" Heavy-Wall Parkerized Improved-Cylinder Barrel',
    group: 'slide',
    material: 'barrel_steel',
    assembledPos: [30.75, 1.35, 0],
    explodeSteps: [{ range: [0.22, 0.56], offset: [10.0, 5.8, 0] }],
    calloutDir: 'up',
    calloutStem: 48,
    calloutAnchor: [14.0, 1.1, 0],
    labelAppearAt: 0.05,
    roleTag: '457mm 重型军警锰磷化管壁 · 尾部闭锁块顶部契合卯口',
    description:
      '按照 Remington Police Magnum 军规重壁规格车削并经深灰锰磷化处理的 18 英寸 12 号滑膛枪管，底部硬钎焊弹仓导环且管尾开有倾斜闭锁卯槽。',
  },
  {
    id: 'rem870_front_sight',
    bomCode: 'B-02',
    nameZh: '斜坡防勾挂氚光白点前准星',
    calloutLabel: '氚光白点前准星',
    nameEn: 'Ramped White-Dot Tritium Bead Front Sight',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [51.8, 2.55, 0],
    explodeSteps: [
      { range: [0.22, 0.56], offset: [10.0, 5.8, 0] },
      { range: [0.56, 0.92], offset: [8.0, 6.5, 0] },
    ],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.3,
    roleTag: '高对比夜光白点 · 警用近战速瞄与破门防钩挂斜坡',
    description:
      '牢固镶嵌于枪口斜坡底座的高可视大白点警用战斗前准星。',
  },
  {
    id: 'rem870_forend',
    bomCode: 'P-01',
    nameZh: '深环槽玉米棒核桃木警用泵动前护木',
    calloutLabel: '玉米棒胡桃木泵动护木',
    nameEn: 'Corn-Cob Grooved Walnut Police Pump Forend',
    group: 'slide',
    material: 'polymer_frame',
    assembledPos: [23.2, -1.25, 0],
    explodeSteps: [{ range: [0.16, 0.5], offset: [8.5, -5.8, -6.2] }],
    calloutDir: 'down',
    calloutStem: 48,
    labelAppearAt: 0.08,
    roleTag: '12道深凹防滑指槽 · 湿手/戴战术手套急推拉零打滑',
    description:
      'Model 870 警察巡逻型标志性的「玉米棒（Corn-Cob）」十二环深槽胡桃木泵动前护木，套装在钢制护木管与前端滚花螺母之外。',
  },
  {
    id: 'rem870_action_bars',
    bomCode: 'P-02',
    nameZh: 'Model 870 双侧平行合金钢推拉连杆组',
    calloutLabel: '双侧平行钢推拉连杆',
    nameEn: 'Model 870 Twin Parallel Steel Action Bars & Tube',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [14.2, -0.25, 0],
    explodeSteps: [{ range: [0.26, 0.62], offset: [8.5, -1.8, 6.2] }],
    calloutDir: 'up',
    calloutStem: 44,
    labelAppearAt: 0.2,
    roleTag: '1950划时代对称双钢杆 · 彻底消除单连杆偏心卡滞',
    description:
      'L. Ray Crittendon 与团队在 1950 年创造性地将原本单侧泵杆升级为左右对称双扁钢连杆：在快速暴力泵动上膛时左右受力完全均衡，极难因扭力卡死。',
  },
  {
    id: 'rem870_slide_block',
    bomCode: 'P-03',
    nameZh: '梯形凸轮导轨驱动滑块',
    calloutLabel: '凸轮驱动滑块',
    nameEn: 'Camming Action-Bar Slide Block',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [2.2, 0.35, 0],
    explodeSteps: [{ range: [0.28, 0.64], offset: [2.5, 11.2, 5.2] }],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.28,
    roleTag: '前导自由滑行 7mm · 斜面强拉倾斜闭锁块下行开锁',
    description:
      '搭接在左右双连杆尾耳上的重型钢制滑块，利用斜面凸轮将护木后拉力量转化为先下压闭锁块开锁、再带动硬铬枪机退壳的双级时序。',
  },
  {
    id: 'rem870_breech_bolt',
    bomCode: 'P-04',
    nameZh: '抛光硬铬警用圆柱弧顶枪机',
    calloutLabel: '抛光硬铬枪机',
    nameEn: 'Polished Hard-Chrome Billet Breech Bolt',
    group: 'slide',
    material: 'stainless',
    assembledPos: [3.6, 1.35, 0],
    explodeSteps: [{ range: [0.26, 0.62], offset: [4.0, 14.5, 0] }],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.22,
    roleTag: '79mm 泵动长行程 + 大爪侧抽壳钩抛壳窗口视觉反差',
    description:
      'Model 870 极具辨识度的亮银硬铬枪机主体：封闭机匣内耐泥沙防锈蚀，顶部镂空容纳倾斜式闭锁楔块。',
  },
  {
    id: 'rem870_locking_block',
    bomCode: 'P-05',
    nameZh: '锻钢上翘楔形闭锁块',
    calloutLabel: '上翘楔形闭锁块',
    nameEn: 'Tilting Steel Wedge Locking Block',
    group: 'slide',
    material: 'nitride_steel',
    assembledPos: [6.4, 1.52, 0],
    explodeSteps: [{ range: [0.34, 0.72], offset: [9.5, 20.5, 0] }],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.34,
    roleTag: '顶入枪管延长段闭锁肩 · 承受 3 英寸马格南重弹高压',
    description:
      '坐落于枪机顶槽内的重型淬火合金钢倾斜楔块：推前合拢瞬间由驱动滑块斜坡顶起嵌入枪管闭锁卯口，构筑钢-钢直接锁闭防线。',
  },
  {
    id: 'rem870_firing_pin',
    bomCode: 'P-06',
    nameZh: '不锈钢惯性前冲回弹长击针',
    calloutLabel: '不锈钢惯性击针',
    nameEn: 'Stainless Inertia Firing Pin',
    group: 'slide',
    material: 'stainless',
    assembledPos: [3.2, 1.35, 0],
    explodeSteps: [{ range: [0.3, 0.68], offset: [-10.0, 16.5, -4.8] }],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.44,
    roleTag: '尾部击锤档 + 弹簧复位防猛推护木惯性走火',
    description:
      '穿装于硬铬枪机中心孔道内的长杆惯性击针，依赖前段螺旋复位簧拉住以防剧烈推拉护木时发生震动偶发。',
  },

  // ==================== 2. SOLID BILLET RECEIVER, SIGHTS & WALNUT STOCK ('frame' · 5 parts) ====================
  {
    id: 'rem870_receiver',
    bomCode: 'F-01',
    nameZh: '整块锻钢数控掏铣刚性机匣',
    calloutLabel: '整块锻钢机匣',
    nameEn: 'Machined Solid Billet Steel Model 870 Receiver',
    group: 'frame',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [0.5, 0.15, 0],
    explodeSteps: [{ range: [0.35, 0.8], offset: [0, 0, 0] }],
    calloutDir: 'up',
    calloutStem: 46,
    labelAppearAt: 0.06,
    roleTag: '全钢实心锻坯掏空 · 与铝合金机匣竞争中独步半个世纪',
    description:
      'Remington 870 警用型长盛不衰的脊梁：整块高碳锻钢掏铣加工并经深灰锰磷化处理，底部大装弹窗配合右侧抛壳窗提供极高结构刚度与车门破拆耐撞性。',
  },
  {
    id: 'rem870_rear_sight',
    bomCode: 'F-02',
    nameZh: '鬼环 / 警用步枪式燕尾照门',
    calloutLabel: '警用鬼环照门',
    nameEn: 'Police Ghost-Ring Steel Rear Sight',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-4.5, 2.7, 0],
    explodeSteps: [{ range: [0.22, 0.56], offset: [-3.5, 7.5, -4.5] }],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.28,
    roleTag: '双护翼防撞击钢座 · 兼顾 00 鹿弹快瞄与百米独头弹精度',
    description:
      '铆锁于钢制机匣顶部的防撞双翼警用鬼环/矩形照门，使全长 12 号独头弹亦可精准命中 100 米目标。',
  },
  {
    id: 'rem870_walnut_stock',
    bomCode: 'F-03',
    nameZh: '标准警用涂油美洲黑胡桃木后托',
    calloutLabel: '警用胡桃木枪托',
    nameEn: 'Police Oiled American Walnut Buttstock',
    group: 'frame',
    material: 'polymer_frame',
    isShell: true,
    assembledPos: [-22.8, -2.55, 0],
    explodeSteps: [{ range: [0.2, 0.6], offset: [-24.0, -2.8, 0] }],
    calloutDir: 'down',
    calloutStem: 48,
    labelAppearAt: 0.22,
    roleTag: '半手枪握把控枪弧度 · 中空长通孔穿装拉紧螺栓',
    description:
      '经久耐用的实心黑胡桃木后枪托：半手枪握把造型符合双手据枪人机工程，内部钻有通心沉头螺栓孔直抵机匣尾壁。',
  },
  {
    id: 'rem870_buttplate',
    bomCode: 'F-04',
    nameZh: '警用通气多孔硫化橡胶缓冲肩垫',
    calloutLabel: '硫化橡胶缓冲肩垫',
    nameEn: 'Vented Solid Rubber Police Recoil Pad',
    group: 'frame',
    material: 'polymer_frame',
    assembledPos: [-38.8, -3.95, 0],
    explodeSteps: [
      { range: [0.2, 0.6], offset: [-24.0, -2.8, 0] },
      { range: [0.6, 0.94], offset: [-12.5, -1.2, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.5,
    roleTag: '大幅吸收 12ga 3 英寸马格南鹿弹重后坐脉冲',
    description:
      '加厚模压硫化橡胶缓冲垫，靠两颗长木螺钉固定在胡桃木托后端并留出中间螺丝刀通孔供拆卸拉紧螺栓。',
  },
  {
    id: 'rem870_stock_bolt',
    bomCode: 'F-05',
    nameZh: '枪托贯通长六角拉紧钢螺栓',
    calloutLabel: '枪托通心拉紧螺栓',
    nameEn: 'Through-Stock Long Steel Draw-Bolt & Washer',
    group: 'frame',
    material: 'nitride_steel',
    assembledPos: [-22.5, -1.85, 0],
    explodeSteps: [{ range: [0.28, 0.72], offset: [-42.0, 6.2, 0] }],
    calloutDir: 'up',
    calloutStem: 42,
    labelAppearAt: 0.36,
    roleTag: '单颗大螺栓将重木托与全钢机匣死死拉紧为一体',
    description:
      '贯穿整个胡桃木后枪托中心的 25 cm 加长高强六角螺栓与厚防松垫圈，拧入钢机匣后螺母座锁死。',
  },

  // ==================== 3. DUAL-PIN POLICE TRIGGER PLATE, RELEASE & SPRINGS ('fire_control' · 6 parts) ====================
  {
    id: 'rem870_trigger_plate',
    bomCode: 'FC-01',
    nameZh: 'Police Magnum 铝合金双销快拆火控盒座',
    calloutLabel: '双销铝合金火控座',
    nameEn: 'Dual-Pin Anodized Aluminum Police Trigger Plate',
    group: 'fire_control',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [-2.2, -2.65, 0],
    explodeSteps: [{ range: [0.12, 0.44], offset: [-1.5, -9.8, 0] }],
    calloutDir: 'down',
    calloutStem: 46,
    labelAppearAt: 0.14,
    roleTag: '顶出前/后双机匣横销 · 整个火控/托弹总成整体向下抽出',
    description:
      'Police Magnum 专属精密压铸 CNC 精修阳极氧化铝合金扳机底座（区别于普通民营型号的聚合物底座），内集成击锤、阻铁、互锁拨片与托弹板枢纽。',
  },
  {
    id: 'rem870_trigger',
    bomCode: 'FC-02',
    nameZh: '防滑纵纹战斗扳机与护圈横栓保险',
    calloutLabel: '纵纹扳机与横栓保险',
    nameEn: 'Grooved Steel Trigger & Crossbolt Safety',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-5.4, -3.15, 0],
    explodeSteps: [
      { range: [0.12, 0.44], offset: [-1.5, -9.8, 0] },
      { range: [0.48, 0.84], offset: [-8.5, -5.2, 4.5] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.36,
    roleTag: '干净清脆两磅级战斗阻力 · 后置大横推保险防止误触',
    description:
      '表面拉制防滑纵纹的合金钢战斗扳机与扳机护圈后方大号横穿推栓保险。',
  },
  {
    id: 'rem870_hammer',
    bomCode: 'FC-03',
    nameZh: '模锻内置高惯量钢制击锤',
    calloutLabel: '内置锻钢击锤',
    nameEn: 'Forged Internal Alloy-Steel Hammer',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-1.4, -1.65, 0],
    explodeSteps: [
      { range: [0.12, 0.44], offset: [-1.5, -9.8, 0] },
      { range: [0.5, 0.86], offset: [-5.5, 4.5, -5.2] },
    ],
    calloutDir: 'up',
    calloutStem: 40,
    labelAppearAt: 0.38,
    roleTag: '击锤降落瞬间同步解脱左侧推杆锁 · 允许自动快速泵动退壳',
    description:
      '封闭藏身于机匣内部的全行程模锻击锤，兼备击发撞击长击针与压下推杆联锁机构的双重使命。',
  },
  {
    id: 'rem870_action_release',
    bomCode: 'FC-04',
    nameZh: '左侧扳机护圈前推杆解锁拨片',
    calloutLabel: '左侧推杆解锁拨片',
    nameEn: 'Left Trigger-Guard Action-Bar Lock Release Lever',
    group: 'fire_control',
    material: 'nitride_steel',
    assembledPos: [-4.6, -2.55, -1.25],
    explodeSteps: [
      { range: [0.12, 0.44], offset: [-1.5, -9.8, 0] },
      { range: [0.52, 0.88], offset: [0, 0, -6.5] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.4,
    roleTag: '未击发状态物理死锁双推杆 · 手动按压方允许退实弹验膛',
    description:
      '位于扳机护圈左前方斜突出的标志性保险拨片：闭锁待击时它死死咬住左侧推杆防意外半开膛走火；仅在实弹击发瞬间或射手食指手动按压此片后方允许向后拉动护木。',
  },
  {
    id: 'rem870_hammer_spring',
    bomCode: 'FC-05',
    nameZh: 'Police 重磅级螺旋击锤主簧',
    calloutLabel: '警用重磅击锤簧',
    nameEn: 'Police-Spec Extra-Power Helical Hammer Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [-2.4, -1.35, 0],
    explodeSteps: [
      { range: [0.12, 0.44], offset: [-1.5, -9.8, 0] },
      { range: [0.54, 0.9], offset: [-14.0, -3.5, -5.0] },
    ],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.44,
    roleTag: '警用加强 20% 弹力 · 确保坚硬军规 00 鹿弹底火百分百击穿',
    description:
      'Police Magnum 相比普通民用 870 Express 特别强化的高劲度琴钢丝螺旋压簧。',
  },
  {
    id: 'rem870_firing_pin_spring',
    bomCode: 'FC-06',
    nameZh: '枪机内置击针防走火复位簧',
    calloutLabel: '击针防走火复位簧',
    nameEn: 'Internal Firing Pin Return Helical Spring',
    group: 'fire_control',
    material: 'spring_steel',
    assembledPos: [4.2, 1.35, 0],
    explodeSteps: [{ range: [0.34, 0.72], offset: [-15.5, 11.2, 4.8] }],
    calloutDir: 'up',
    calloutStem: 38,
    labelAppearAt: 0.44,
    roleTag: '紧拉惯性击针回缩入槽 · 严防暴力推泵闭锁惯性打底火',
    description:
      '套在惯性击针轴肩前方的精密小径螺旋回弹弹簧。',
  },

  // ==================== 4. TUBULAR MAG, ORANGE FOLLOWER & CHROME CARRIER ('magazine' · 5 parts) ====================
  {
    id: 'rem870_mag_tube',
    bomCode: 'M-01',
    nameZh: '4+1 发磷化无缝下挂管式弹仓',
    calloutLabel: '4+1磷化钢制管式弹仓',
    nameEn: '4+1 Heavy Parkerized Steel Tubular Magazine',
    group: 'magazine',
    material: 'nitride_steel',
    isShell: true,
    assembledPos: [29.2, -1.25, 0],
    explodeSteps: [{ range: [0.24, 0.6], offset: [8.0, -7.5, 0] }],
    calloutDir: 'down',
    calloutStem: 44,
    calloutAnchor: [0, -1.25, 0],
    labelAppearAt: 0.08,
    roleTag: '全钢焊紧于机匣 · 兼容两片式阻弹双片可靠限位',
    description:
      '重壁锰磷化钢制管状弹仓，容纳 4 发 70mm 12 号重装霰弹加膛内 1 发（可扩展延长管至 6+1/7+1）。',
  },
  {
    id: 'rem870_mag_cap',
    bomCode: 'M-02',
    nameZh: '定位弹珠滚花弹仓前端锁紧盖',
    calloutLabel: '滚花定位弹仓端盖',
    nameEn: 'Knurled Detent-Ball Steel Magazine Cap',
    group: 'magazine',
    material: 'nitride_steel',
    assembledPos: [50.4, -1.25, 0],
    explodeSteps: [
      { range: [0.02, 0.18], offset: [14.0, 0, 0], rotation: [2.2, 0, 0] },
      { range: [0.3, 0.68], offset: [16.0, -7.5, 0] },
    ],
    calloutDir: 'down',
    calloutStem: 38,
    labelAppearAt: 0.08,
    roleTag: '免工具拆枪第一步 · 顶紧枪管导环弹珠卡槽防震松',
    description:
      '通过前端钢珠定位销与枪管下导环内缘齿面锁死的粗齿防滑端盖，徒手拧下即可抽出整根枪管进行清理或换装不同长短枪管。',
  },
  {
    id: 'rem870_mag_follower',
    bomCode: 'M-03',
    nameZh: '高可视度鲜橙色聚合物托弹杯',
    calloutLabel: '高可视橙红托弹杯',
    nameEn: 'High-Visibility Orange Police Magazine Follower',
    group: 'magazine',
    material: 'follower_orange',
    assembledPos: [17.8, -1.25, 0],
    explodeSteps: [{ range: [0.28, 0.68], offset: [38.0, -12.8, 5.2] }],
    calloutDir: 'down',
    calloutStem: 40,
    labelAppearAt: 0.32,
    roleTag: '一眼辨空仓余弹 · 自润滑抗膨胀耐寒聚合物柱塞',
    description:
      '明亮警示橙色自润滑工程聚合物杯状推弹柱塞，让警员在黑暗走廊或快速摸仓时一眼即知弹仓已经打空。',
  },
  {
    id: 'rem870_mag_spring',
    bomCode: 'M-04',
    nameZh: '34圈长寿命防锈弹仓螺旋弹簧',
    calloutLabel: '弹仓长螺旋托弹簧',
    nameEn: 'Heavy-Duty Helical Tubular Magazine Spring',
    group: 'magazine',
    material: 'spring_steel',
    assembledPos: [50.0, -1.25, 0],
    explodeSteps: [{ range: [0.32, 0.72], offset: [24.0, -15.5, 0] }],
    calloutDir: 'down',
    calloutStem: 42,
    labelAppearAt: 0.36,
    roleTag: '等径不锈钢丝绕制 · 长期满压存放不衰弹力',
    description:
      '延伸至弹仓端盖的 34 圈长寿命重型托弹簧，在高速连续泵动时稳健将 12 号鹿弹推上托弹勺。',
  },
  {
    id: 'rem870_shell_carrier',
    bomCode: 'M-05',
    nameZh: '硬铬防夹手升降托弹勺（Lifter）',
    calloutLabel: '硬铬升降托弹勺',
    nameEn: 'Hard-Chrome Pivoting Flexitab Shell Carrier Lifter',
    group: 'magazine',
    material: 'stainless',
    assembledPos: [-1.5, -1.52, 0],
    explodeSteps: [{ range: [0.36, 0.76], offset: [3.5, 5.2, -5.5] }],
    calloutDir: 'down',
    calloutStem: 44,
    labelAppearAt: 0.4,
    roleTag: 'Flexitab 防双进纠错槽设计 · 向上摆起 20° 喂正弹膛',
    description:
      'Remington Flexitab 专利抛光硬铬钢托弹勺：承接从弹仓退出的 12 号实弹并随前推双推杆向上抬起 +20°，哪怕发生卡弹亦可强力推杆摆脱故障而不锁死。',
  },
];

export const REM870_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'phase_1',
    stepNum: '01',
    shortLabel: '击锤释推杆锁',
    title: '阶段 1 · 扣动纵纹扳机解脱内置击锤，敲击击针并同步释放双推杆互锁',
    range: [0.0, 0.11],
    description:
      '重磅击锤簧驱动内置击锤向上敲击惯性击针；击锤落到底位瞬间拨开左侧推杆释放锁片，解禁全人工泵动循环。',
  },
  {
    id: 'phase_2',
    stepNum: '02',
    shortLabel: '12ga 79 MPa 激燃',
    title: '阶段 2 · 12 号 00 鹿弹底火激发 (79 MPa)，倾斜钢楔紧锁枪管卯口',
    range: [0.11, 0.22],
    description:
      '倾斜闭锁块死死顶住 18 英寸重壁枪管顶部闭锁肩，零泄气承受 79 MPa 高压推进 9 颗 8.4mm 铅弹丸。',
  },
  {
    id: 'phase_3',
    stepNum: '03',
    shortLabel: '手动后拉护木开锁',
    title: '阶段 3 · 弹群飞离 18" 枪口后，射手大力后拉玉米棒护木 7mm 降锁开锁',
    range: [0.22, 0.36],
    description:
      '鹿弹弹群于 f ≈ 0.27 出膛后，射手左手抓紧玉米棒护木向后猛拉；双平行钢推杆先带动凸轮滑块将倾斜闭锁块向下压落 5.2 mm 脱离枪管闭锁槽！',
  },
  {
    id: 'phase_4',
    stepNum: '04',
    shortLabel: '全行程抽壳右抛',
    title: '阶段 4 · 硬铬枪机随双推杆后坐 7.9 cm 压倒击锤，左侧弹射空 12ga 红壳',
    range: [0.36, 0.54],
    description:
      '随着双推杆拉到位，硬铬枪机携带空 12 号红壳后退至机匣左侧铆接弹射器，将空壳干净利落甩出右侧抛壳窗并压缩内置击锤簧压倒击锤。',
  },
  {
    id: 'phase_5',
    stepNum: '05',
    shortLabel: '管仓推新弹上托勺',
    title: '阶段 5 · 弹仓双挡片放行一发 12 号新弹，滑上硬铬托弹勺',
    range: [0.54, 0.68],
    description:
      '推杆后退尾部凸台自动切换左右双挡弹片（Left/Right Shell Latches），精准只放出一发新 12 号鹿弹向后滑上硬铬托弹勺。',
  },
  {
    id: 'phase_6',
    stepNum: '06',
    shortLabel: '前推泵动推弹入膛',
    title: '阶段 6 · 左手大力前推护木 8.6 cm，托弹勺向上抬起 +20° 推弹入膛',
    range: [0.68, 0.87],
    description:
      '左手由后向前干脆推合玉米棒护木，双推杆推着凸轮滑块与托弹勺凸轮向上抬起 +20°，让硬铬枪机把新弹笔直推入 76mm 弹膛。',
  },
  {
    id: 'phase_7',
    stepNum: '07',
    shortLabel: '楔形闭锁块复位上锁',
    title: '阶段 7 · 推合最后 7 mm 凸轮斜坡顶起倾斜闭锁块咬合枪管，推杆锁恢复锁定',
    range: [0.87, 1.0],
    description:
      '枪机抵实枪管尾端后，双推杆最后 7 mm 前冲依靠滑块斜坡再次将钢制闭锁楔块向上顶入枪管顶部卯口死锁，同时锁定推杆拨片完成闭锁待击。',
  },
];

export function computeRem870FiringKinematics(
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

  // Dual action bars + corn-cob pump forend cam-lead (-0.70 cm) then rearward stroke (-7.90 cm) -> -8.60 cm total
  const camLead = seg(f, 0.24, 0.34) - seg(f, 0.87, 0.96);
  const boltStroke = seg(f, 0.34, 0.52) - seg(f, 0.69, 0.87);
  const boltDX = -7.9 * boltStroke;
  const pumpDX = boltDX - 0.7 * camLead;

  // Tilting locking wedge drops down during unlock cam-lead & stays down while bolt travels back
  const lockDropped = seg(f, 0.25, 0.34) - seg(f, 0.875, 0.955);
  const magFeedPulse = seg(f, 0.52, 0.64) - seg(f, 0.82, 0.94);
  const carrierUp = seg(f, 0.56, 0.67) - seg(f, 0.74, 0.85);

  switch (partId) {
    case 'rem870_forend':
    case 'rem870_action_bars':
    case 'rem870_slide_block': {
      dx = pumpDX;
      break;
    }
    case 'rem870_breech_bolt': {
      dx = boltDX;
      break;
    }
    case 'rem870_locking_block': {
      dx = boltDX;
      dy = -0.52 * lockDropped;
      rz = 0.28 * lockDropped;
      break;
    }
    case 'rem870_firing_pin': {
      const strike = seg(f, 0.075, 0.11) - seg(f, 0.145, 0.21);
      dx = boltDX + 0.38 * strike;
      break;
    }
    case 'rem870_firing_pin_spring': {
      const strike = seg(f, 0.075, 0.11) - seg(f, 0.145, 0.21);
      dx = boltDX;
      scaleX = 1 - 0.12 * strike;
      break;
    }
    case 'rem870_trigger': {
      const pull = seg(f, 0.0, 0.085) - seg(f, 0.91, 0.975);
      rz = -0.22 * pull;
      break;
    }
    case 'rem870_hammer': {
      const swing = seg(f, 0.055, 0.1);
      const recock = seg(f, 0.34, 0.45);
      const settle = seg(f, 0.91, 0.975);
      rz = -1.08 * swing + 1.14 * recock - 0.06 * settle;
      break;
    }
    case 'rem870_hammer_spring': {
      const swing = seg(f, 0.055, 0.1) - seg(f, 0.34, 0.45);
      const overcock = Math.sin(linearSeg(f, 0.38, 0.52) * Math.PI);
      scaleX = 1 + 0.17 * swing - 0.14 * overcock;
      break;
    }
    case 'rem870_action_release': {
      const released = seg(f, 0.18, 0.26) - seg(f, 0.9, 0.97);
      rz = 0.18 * released;
      break;
    }
    case 'rem870_mag_spring': {
      scaleX = 1 + 0.095 * magFeedPulse;
      break;
    }
    case 'rem870_mag_follower': {
      dx = -1.7 * magFeedPulse;
      break;
    }
    case 'rem870_shell_carrier': {
      rz = 0.34 * carrierUp;
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

export function computeRem870BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);
  const boltStroke = seg(f, 0.34, 0.52) - seg(f, 0.69, 0.87);
  const boltDX = -7.9 * boltStroke;

  // 1. 12 Gauge 00 Buckshot accelerating down 18" bore (`[10.8 -> 53.5]`, exit `f = 0.27`)
  const bulletVisible = f < 0.43;
  let bulletX = 10.8;
  let streakLength = 0;
  if (f >= 0.12 && f < 0.27) {
    const u = Math.pow(linearSeg(f, 0.12, 0.27), 1.32);
    bulletX = 10.8 + 42.7 * u;
    streakLength = 5.4 * u;
  } else if (f >= 0.27 && f < 0.43) {
    const u = linearSeg(f, 0.27, 0.43);
    bulletX = 53.5 + 56.0 * u;
    streakLength = 10.8 * (1 - u * 0.45);
  }

  // 2. Spent crimson 12ga hull extracted and ejected right (`+Z`) at `f = 0.45`
  const spentCaseVisible = f < 0.8;
  let caseX = 9.0;
  let caseY = 1.35;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.34 && f < 0.45) {
    caseX = 9.0 + boltDX;
  } else if (f >= 0.45 && f < 0.8) {
    const u = linearSeg(f, 0.45, 0.8);
    const xAtEject = 9.0 - 7.9 * seg(0.45, 0.34, 0.52);
    caseX = xAtEject + 2.6 * u;
    caseY = 1.48 + 7.0 * u - 11.2 * u * u;
    caseZ = 13.8 * u;
    caseRX = u * 8.0;
    caseRY = -u * 10.8;
    caseRZ = -u * 9.2;
    if (f > 0.66) spentCaseOpacity = 1 - linearSeg(f, 0.66, 0.8);
  }

  const chamberFlashIntensity =
    f >= 0.11 && f <= 0.21 ? Math.sin(linearSeg(f, 0.11, 0.21) * Math.PI) : 0;
  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.26 && f <= 0.37) {
    const u = linearSeg(f, 0.26, 0.37);
    muzzlePlumeScale = 0.58 + 1.9 * Math.pow(u, 0.52);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.92;
  }

  // 4. Next 12ga shell from mag tube `[10.6, -1.25, 0.045]` -> carrier `[1.8, -1.25, 0]` -> lift `[3.2, 1.08, 0]` -> chamber `[9.0, 1.35, 0]`
  let nextX = 10.6;
  let nextY = -1.25;
  let nextZ = 0.045;
  let nextRZ = 0;
  if (f >= 0.52 && f < 0.6) {
    const u = seg(f, 0.52, 0.6);
    nextX = 10.6 + (1.8 - 10.6) * u;
    nextZ = 0.045 * (1 - u);
  } else if (f >= 0.6 && f < 0.7) {
    const u = seg(f, 0.6, 0.7);
    nextX = 1.8 + (3.2 - 1.8) * u;
    nextY = -1.25 + (1.08 - -1.25) * u;
    nextZ = 0;
    nextRZ = 0.2 * u;
  } else if (f >= 0.7 && f < 0.87) {
    const u = seg(f, 0.7, 0.87);
    nextX = 3.2 + (9.0 - 3.2) * u;
    nextY = 1.08 + (1.35 - 1.08) * u;
    nextZ = 0;
    nextRZ = 0.2 * (1 - u);
  } else if (f >= 0.87) {
    nextX = 9.0;
    nextY = 1.35;
    nextZ = 0;
  }

  const tubeShift = seg(f, 0.52, 0.63);
  const resX = 11.8 + (10.6 - 11.8) * tubeShift;
  const resZ = -0.045 + (0.045 - -0.045) * tubeShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.35, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity: 0,
    gasPortPos: [20.0, 1.35, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, nextZ],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, -1.25, resZ],
  };
}

const REM870_V3_WALNUT_BUNDLE: PbrBindingSpec = {
  albedoFile: 'rem870_v3_walnut_albedo.webp',
  normalFile: 'rem870_v3_walnut_normal.webp',
  roughnessFile: 'rem870_v3_walnut_roughness.webp',
  normalScale: 0.9,
};

const REM870_V3_RECEIVER_BUNDLE: PbrBindingSpec = {
  albedoFile: 'rem870_v3_receiver_albedo.webp',
  normalFile: 'rem870_v3_receiver_normal.webp',
  roughnessFile: 'rem870_v3_receiver_roughness.webp',
  normalScale: 0.88,
};

const REM870_V3_METAL_BUNDLE: PbrBindingSpec = {
  albedoFile: 'rem870_v3_metal_albedo.webp',
  normalFile: 'rem870_v3_metal_normal.webp',
  roughnessFile: 'rem870_v3_metal_roughness.webp',
  normalScale: 0.86,
};

export const REM870_PBR_BINDINGS: Record<string, PbrBindingSpec> = {
  rem870_forend: REM870_V3_WALNUT_BUNDLE,
  rem870_walnut_stock: REM870_V3_WALNUT_BUNDLE,
  rem870_buttplate: REM870_V3_WALNUT_BUNDLE,
  rem870_receiver: REM870_V3_RECEIVER_BUNDLE,
  rem870_trigger_plate: REM870_V3_RECEIVER_BUNDLE,
  rem870_trigger: REM870_V3_RECEIVER_BUNDLE,
  rem870_action_release: REM870_V3_RECEIVER_BUNDLE,
  rem870_action_bars: REM870_V3_RECEIVER_BUNDLE,
  rem870_mag_tube: REM870_V3_RECEIVER_BUNDLE,
  rem870_mag_cap: REM870_V3_RECEIVER_BUNDLE,
  rem870_barrel: REM870_V3_METAL_BUNDLE,
  rem870_front_sight: REM870_V3_METAL_BUNDLE,
  rem870_rear_sight: REM870_V3_METAL_BUNDLE,
  rem870_slide_block: REM870_V3_METAL_BUNDLE,
  rem870_breech_bolt: REM870_V3_METAL_BUNDLE,
  rem870_locking_block: REM870_V3_METAL_BUNDLE,
  rem870_firing_pin: REM870_V3_METAL_BUNDLE,
  rem870_hammer: REM870_V3_METAL_BUNDLE,
  rem870_stock_bolt: REM870_V3_METAL_BUNDLE,
  rem870_mag_follower: REM870_V3_METAL_BUNDLE,
  rem870_shell_carrier: REM870_V3_METAL_BUNDLE,
};

export const REM870_PBR_SUITES: PbrSuiteItem[] = [
  {
    id: 'rem870_walnut',
    weapon: REM870_ID,
    titleCn: '玉米棒深槽核桃木护木、警用后托与硫化橡胶缓冲垫贴图组',
    partTag: 'P-01 / F-03 / F-04 CORN-COB & POLICE WALNUT',
    resolution: '2048 × 2048 px',
    summary:
      'Cycles 离线烘焙的美洲核桃木与警用缓冲橡胶 2K 5 通道 ORM 贴图组：重点还原 12 道玉米棒泵动护木防滑环槽指垢磨光与通气橡胶垫微孔。',
    highlights: [
      '玉米棒 12 环深槽泵动前护木高光磨亮峰顶与微污凹槽对比',
      '半手枪握把警用胡桃木枪托直纹与油润包浆',
      '多孔硫化橡胶肩垫高粗糙度消光质感 (0.78–0.85)',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'rem870_v3_walnut_albedo.webp',
        note: 'sRGB · 核桃木玉米棒护木、警用后托与黑色硫化橡胶垫',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'rem870_v3_walnut_normal.webp',
        note: 'Linear · 护木深防滑凹肋与通气橡胶肩垫微颗粒',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'rem870_v3_walnut_roughness.webp',
        note: 'Linear · R:AO / G:核桃木(0.54) vs 橡胶肩垫(0.82) / B:非金属度',
      },
    ],
  },
  {
    id: 'rem870_receiver',
    weapon: REM870_ID,
    titleCn: '整块锻钢锰磷化机匣、双推杆与铝合金警用扳机座贴图组',
    partTag: 'F-01 / P-02 / FC-01 / M-01 BILLET RECEIVER',
    resolution: '2048 × 2048 px',
    summary:
      'Remington Ilion 原厂军警锰磷化（Parkerized）粗糙磷酸盐结晶金属层与阳极氧化 Police Magnum 扳机座 2K 图集。',
    highlights: [
      '深炭灰锰磷化微晶颗粒质感吸油亚光保护层',
      '双侧平行推杆与滑块导轨摩擦露底白钢高光痕',
      '铝合金警用双销扳机座深炭氧化表面对比',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'rem870_v3_receiver_albedo.webp',
        note: 'sRGB · 锰磷化整块铣削钢机匣、管仓端盖与警用扳机座',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'rem870_v3_receiver_normal.webp',
        note: 'Linear · 磷酸盐晶体微麻点与滚花弹仓帽菱形纹',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'rem870_v3_receiver_roughness.webp',
        note: 'Linear · R:Cycles AO / G:磷化亚光(0.46-0.54) / B:高金属度',
      },
    ],
  },
  {
    id: 'rem870_metal',
    weapon: REM870_ID,
    titleCn: '18英寸重壁枪管、亮银硬铬枪机、斜楔闭锁块与高可视托弹杯贴图组',
    partTag: 'B-01 / P-04 / P-05 / M-03 / M-05 CHROME ACTION & BARREL',
    resolution: '2048 × 2048 px',
    summary:
      '兼顾 18 英寸军规磷化重壁枪管、抛光镜面硬铬枪机/升降托弹勺，以及高可视鲜橙色自润滑聚合物托弹杯的物理多质 2K 图集。',
    highlights: [
      '硬铬抛光圆柱枪机与 Flexitab 托弹勺镜面反光 (0.16)',
      '军警厚壁枪管深磷化抗刮擦金属肌理',
      '安全橙高可视空仓提醒聚合物托弹杯低金属度区隔 (0.04)',
    ],
    channels: [
      {
        kind: 'Albedo' as const,
        labelCn: 'Albedo 漫反射基础色',
        fileName: 'rem870_v3_metal_albedo.webp',
        note: 'sRGB · 磷化厚壁枪管、亮银硬铬枪机与鲜橙聚合物托弹杯',
      },
      {
        kind: 'Normal' as const,
        labelCn: 'Normal 切线空间法线',
        fileName: 'rem870_v3_metal_normal.webp',
        note: 'Linear · 车削拉丝刀痕与氚光准星镶座法线',
      },
      {
        kind: 'Roughness' as const,
        labelCn: 'Roughness 物理粗糙度 (Packed ORM)',
        fileName: 'rem870_v3_metal_roughness.webp',
        note: 'Linear · 硬铬(0.16) vs 磷化管壁(0.46) vs 橙色塑料(0.38)',
      },
    ],
  },
  {
    id: 'rem870_seamless_springs',
    weapon: REM870_ID,
    titleCn: '三组警用螺旋机构弹簧无缝细节贴图',
    partTag: 'FC-05 / FC-06 / M-04 DYNAMIC HELICAL SPRINGS',
    resolution: '512 × 512 px (Seamless)',
    summary:
      '为警用加强型击锤主簧、惯性击针复位簧及 34 圈长寿命管式弹仓螺旋弹簧提供实时形变金属微法线与枪油光泽贴图。',
    highlights: [
      '保留 aSpringParam GPU 实时等径伸缩变形能力',
      '高频防锈高强钢丝微表面质感',
    ],
    channels: [
      {
        kind: 'Normal',
        labelCn: '金属拉丝微法线 (Seamless)',
        fileName: 'metal_detail_normal.webp',
        note: 'Linear · 用于 3 组泵动火控与管仓螺旋弹簧',
      },
      {
        kind: 'Roughness',
        labelCn: '金属微粗糙度油膜 (Seamless)',
        fileName: 'metal_detail_roughness.webp',
        note: 'Linear · 螺旋弹簧防锈油膜光泽变化',
      },
    ],
  },
];

export const REM870_PLUGIN: WeaponRuntimePlugin = {
  id: REM870_ID,
  partGroups: REM870_PART_GROUPS,
  timelinePresets: REM870_TIMELINE_PRESETS,
  parts: REM870_PARTS,
  firingPhases: REM870_FIRING_PHASES,
  getActiveFiringPhase: (f: number) =>
    findActiveFiringPhase(REM870_FIRING_PHASES, f),
  computeFiringKinematics: computeRem870FiringKinematics,
  computeBallisticsState: computeRem870BallisticsState,
  pbrBindings: REM870_PBR_BINDINGS,
  pbrSuites: REM870_PBR_SUITES,
};
