export type TimelineLineageId =
  | 'toggle_short_recoil'
  | 'gas_rotating_bolt'
  | 'roller_blowback_delayed'
  | 'manual_revolver_lever'
  | 'compound_archery'
  | 'heavy_armor_mbt';

export type TimelineTourId =
  | 'cold_war_rifles'
  | 'german_precision'
  | 'heavy_armor_evolution'
  | 'unconventional_actions';

export interface HistoryTimelineLineageSpec {
  id: TimelineLineageId;
  colorHex: string;
  labelZh: string;
  labelEn: string;
  summaryZh: string;
  summaryEn: string;
}

export interface HistoryTimelineNodeSpec {
  weaponId: string;
  year: number;
  lineageId: TimelineLineageId;
  lane: number;
  ancestors: readonly string[];
  designerZh: string;
  designerEn: string;
  innovationZh: string;
  innovationEn: string;
}

export interface HistoryTimelineTourSpec {
  id: TimelineTourId;
  titleZh: string;
  titleEn: string;
  subtitleZh: string;
  subtitleEn: string;
  weaponIds: readonly string[];
}

export const TIMELINE_LINEAGES: readonly HistoryTimelineLineageSpec[] = [
  {
    id: 'toggle_short_recoil',
    colorHex: '#38bdf8',
    labelZh: '短后坐 / 摆动闭锁脉系',
    labelEn: 'Short-Recoil & Tilting-Barrel Lineage',
    summaryZh: '从鲁格双连杆肘节演进至现代无击锤勃朗宁闭锁手枪与大口径反器材连发系统',
    summaryEn:
      'Tracing mechanical recoil locking from toggle-links to modern modular striker pistols and .50 BMG anti-materiel platforms',
  },
  {
    id: 'gas_rotating_bolt',
    colorHex: '#f59e0b',
    labelZh: '导气式与回转闭锁突笋脉系',
    labelEn: 'Gas-Operated Rotating-Bolt Lineage',
    summaryZh: '从加兰德长行程导气起步，分叉为苏俄 AK 活塞系、美欧气吹 DI、短行程模块化步枪及高射速延迟机械',
    summaryEn:
      'Descending from the M1 Garand through Kalashnikov long-stroke pistons, Stoner DI, short-stroke battle rifles, and dual-piston actions',
  },
  {
    id: 'roller_blowback_delayed',
    colorHex: '#a855f7',
    labelZh: '半自由 / 凸轮延迟 & 转管电驱脉系',
    labelEn: 'Delayed Blowback, Caseless & Rotary Drive',
    summaryZh: '以滚柱延迟闭锁、非对称轴外 V 形凸轮、90°无壳旋转弹膛与外能源加特林展现几何分力极限',
    summaryEn:
      'Pushing non-rigid locking limits with roller-delayed blowback, Super V off-axis cams, caseless rotary breeches, and electric Gatling cams',
  },
  {
    id: 'manual_revolver_lever',
    colorHex: '#10b981',
    labelZh: '精密手动旋转弹巢与圆柱栓动脉系',
    labelEn: 'Precision Revolver & Bolt-Action Lineage',
    summaryZh: '专注亚角分刚性闭锁公差与精密双动V簧棘爪正时几何的机械工艺巅峰',
    summaryEn:
      'Pure mechanical timing and rigid three-lug lockup tolerances tuned for match-grade precision',
  },
  {
    id: 'compound_archery',
    colorHex: '#22d3ee',
    labelZh: '现代分体双凸轮高能量弓弩脉系',
    labelEn: 'Binary & Helical Cam Compound Archery',
    summaryZh: '冷兵器机械能量储存的当代复兴：80% 省力谷双同步凸轮与 360° 螺旋滑梭弩',
    summaryEn:
      'Contemporary mechanical energy storage achieving 80% let-off valleys and 500 FPS helical cam synchronization',
  },
  {
    id: 'heavy_armor_mbt',
    colorHex: '#84cc16',
    labelZh: '重装甲主炮与自动装弹机演化脉系',
    labelEn: '1:1 Heavy Armor Tank Main Gun Lineage',
    summaryZh: '从二战 88mm KwK 36 立楔重炮跨越至现代 120mm 尾舱隔爆与 125mm 底置转盘自动装弹机',
    summaryEn:
      'Spanning WWII 88mm vertical-wedge heavy armor to modern 120mm blow-off bustles and 125mm floor-carousel autoloaders',
  },
];

export const HISTORY_TIMELINE_NODES: readonly HistoryTimelineNodeSpec[] = [
  {
    weaponId: 'winchester1894',
    year: 1894,
    lineageId: 'manual_revolver_lever',
    lane: 3,
    ancestors: [],
    designerZh: '约翰·摩西·勃朗宁 (John M. Browning)',
    designerEn: 'John M. Browning / Winchester',
    innovationZh: '首款为 .30-30 无烟火药诞生的杠杆卡宾枪：H型垂直闭锁块 + 金氏侧装弹口',
    innovationEn:
      'First smokeless .30-30 sporting lever rifle: vertical H-locking bolt, top-eject & King gate',
  },
  {
    weaponId: 'p08',
    year: 1900,
    lineageId: 'toggle_short_recoil',
    lane: 0,
    ancestors: [],
    designerZh: '格奥尔格·鲁格 (Georg Luger)',
    designerEn: 'Georg Luger / DWM',
    innovationZh: '死点自锁双连杆屈膝肘节机构与 9×19mm Parabellum 弹药诞生',
    innovationEn:
      'Over-center articulated knee-joint toggle lock and birth of 9x19mm Parabellum',
  },
  {
    weaponId: 'm1911',
    year: 1911,
    lineageId: 'toggle_short_recoil',
    lane: 0,
    ancestors: ['p08'],
    designerZh: '约翰·摩西·勃朗宁 (John M. Browning)',
    designerEn: 'John Moses Browning / Colt',
    innovationZh:
      '0.278" 单绞链偏移枪管闭锁、纯直推单动扳机框与一簧三用三叉钢板簧，奠定现代手枪百年范式',
    innovationEn:
      '0.278" swinging barrel link, straight-pull single-action stirrup trigger & screwless 3-leaf sear spring',
  },
  {
    weaponId: 'thompson',
    year: 1928,
    lineageId: 'roller_blowback_delayed',
    lane: 2,
    ancestors: [],
    designerZh: '约翰·汤姆逊 & 奥斯卡·佩恩 (Auto-Ordnance)',
    designerEn: 'John T. Thompson & Oscar Payne / Auto-Ordnance',
    innovationZh:
      '45° 青铜布利什延迟锁、28 道散热鳍卡茨防跳器与 50 发阿基米德螺旋发条大弹鼓',
    innovationEn:
      '45° bronze Blish delayed lock, 28-fin Cutts comp barrel & 50-rd clockwork spiral drum',
  },
  {
    weaponId: 'k98k',
    year: 1935,
    lineageId: 'manual_revolver_lever',
    lane: 3,
    ancestors: ['winchester1894'],
    designerZh: '保罗·毛瑟 / 奥伯恩多夫毛瑟工厂',
    designerEn: 'Paul Mauser / Mauser-Werke Oberndorf',
    innovationZh:
      '90° 前双主突笋加第三保险突笋 + 全长不旋转抓钩受控供弹 + 三档翼形旗式保险与层压榉木枪托',
    innovationEn:
      '90° dual front + rear safety lugs, non-rotating claw controlled-round feed, 3-position flag safety & laminated stock',
  },
  {
    weaponId: 'garand',
    year: 1936,
    lineageId: 'gas_rotating_bolt',
    lane: 1,
    ancestors: [],
    designerZh: '约翰·加兰德 (John Garand)',
    designerEn: 'John C. Garand / Springfield Armory',
    innovationZh: '首款大规模列装的长行程活塞回转闭锁半自动制式步枪',
    innovationEn:
      'First mass-issued semi-automatic rotating-bolt service rifle with en-bloc ping',
  },
  {
    weaponId: 'mg42',
    year: 1942,
    lineageId: 'roller_blowback_delayed',
    lane: 2,
    ancestors: ['p08'],
    designerZh: '维尔纳·格鲁纳 (Werner Gruner / Grossfuss)',
    designerEn: 'Werner Gruner / Grossfuss',
    innovationZh:
      '冷冲压多孔散热护筒、对称双滚柱短后坐 1,200 RPM 与顶盖 S 槽双向供弹',
    innovationEn:
      'Stamped perforated shroud, symmetric twin-roller 1,200 RPM short recoil & S-cam shuttle belt feed',
  },
  {
    weaponId: 'tiger1',
    year: 1942,
    lineageId: 'heavy_armor_mbt',
    lane: 5,
    ancestors: [],
    designerZh: '亨舍尔 & 克虏伯 (Henschel / Krupp)',
    designerEn: 'Henschel & Krupp',
    innovationZh: '88mm KwK 36 L/56 重炮与交错大直径负重轮扭杆悬挂',
    innovationEn:
      '88mm KwK 36 vertical-wedge gun and Schachtellaufwerk interleaved torsion-bar suspension',
  },
  {
    weaponId: 'rem870',
    year: 1950,
    lineageId: 'manual_revolver_lever',
    lane: 3,
    ancestors: ['winchester1894'],
    designerZh: '雷·克里滕登团队 (L. Ray Crittendon / Remington)',
    designerEn: 'L. Ray Crittendon / Remington Arms',
    innovationZh: '整块锻钢机匣配左右双平行钢推杆泵动与倾斜楔块闭锁',
    innovationEn:
      'Solid billet steel receiver with dual zero-bind action bars & tilting wedge bolt lockup',
  },
  {
    weaponId: 'python',
    year: 1955,
    lineageId: 'manual_revolver_lever',
    lane: 3,
    ancestors: [],
    designerZh: '柯尔特皇家枪匠团队 (Colt)',
    designerEn: 'Colt Custom Shop',
    innovationZh: '单一片状V形主簧同时驱动阻铁与棘轮的精密锁死正时',
    innovationEn:
      'Single V-mainspring synchronizing cylinder hand lift and rigid lockup at hammer fall',
  },
  {
    weaponId: 'm134',
    year: 1963,
    lineageId: 'roller_blowback_delayed',
    lane: 2,
    ancestors: [],
    designerZh: '通用电气军械部 (General Electric)',
    designerEn: 'General Electric Armament Dept.',
    innovationZh: '28V 直流电机驱动六管旋转凸轮椭圆槽实现每分钟 3,000 发闭锁供给',
    innovationEn:
      'Externally powered 28V DC 6-barrel rotary cam track sustaining 3,000 RPM firing',
  },
  {
    weaponId: 'mp5',
    year: 1966,
    lineageId: 'roller_blowback_delayed',
    lane: 2,
    ancestors: ['p08'],
    designerZh: '黑克勒-科赫 (Heckler & Koch)',
    designerEn: 'Heckler & Koch (Tilo Moller et al.)',
    innovationZh: '双对称圆柱滚柱利用 45° 斜面机械杠杆比实现闭膛高精度连发',
    innovationEn:
      'Closed-bolt roller-delayed blowback leveraging geometric mechanical advantage',
  },
  {
    weaponId: 'aug',
    year: 1977,
    lineageId: 'gas_rotating_bolt',
    lane: 1,
    ancestors: ['garand'],
    designerZh: '斯太尔-戴姆勒-普赫 (Steyr Mannlicher)',
    designerEn: 'Steyr / Horst Wesp',
    innovationZh: '无托聚合材质机匣与快拆枪管一体化短行程导气系统',
    innovationEn:
      'Modular bullpup chassis uniting polymer housings, optic carry handle, and quick-change barrel',
  },
  {
    weaponId: 'gau8',
    year: 1977,
    lineageId: 'roller_blowback_delayed',
    lane: 2,
    ancestors: ['m134'],
    designerZh: '通用电气军械部 (General Electric Armament Systems)',
    designerEn: 'General Electric Armament Systems (Burlington, VT)',
    innovationZh:
      '围绕 6.06m 30×173mm 七管液压航炮造就 A-10 攻击机：铝壳贫铀穿甲弹 + 1,150 发闭环空壳返鼓弹鼓',
    innovationEn:
      '6.06 m 30x173mm 7-barrel hydraulic cannon around which the A-10 was built: aluminum DU-core rounds & closed-loop 1,150-rd drum',
  },
  {
    weaponId: 'g17',
    year: 1982,
    lineageId: 'toggle_short_recoil',
    lane: 0,
    ancestors: ['p08'],
    designerZh: '加斯顿·格洛克 (Gaston Glock)',
    designerEn: 'Gaston Glock',
    innovationZh: 'Safe Action 半预压平移击针与一体化矩形闭锁方块聚合物套筒座',
    innovationEn:
      'Safe Action partial-cock striker safety trilogy with square breechblock lockup',
  },
  {
    weaponId: 'm82a1',
    year: 1982,
    lineageId: 'toggle_short_recoil',
    lane: 0,
    ancestors: ['p08'],
    designerZh: '朗尼·巴雷特 (Ronnie Barrett)',
    designerEn: 'Ronnie Barrett',
    innovationZh: '.50 BMG 全枪管后坐吸收巨额动量并经双侧矢形制退器泄压',
    innovationEn:
      'Long-travel barrel short-recoil assembly taming 18,000 J .50 BMG shoulder impulse',
  },
  {
    weaponId: 'deagle',
    year: 1983,
    lineageId: 'gas_rotating_bolt',
    lane: 1,
    ancestors: ['garand'],
    designerZh: 'Magnum Research / IMI',
    designerEn: 'Magnum Research / IMI',
    innovationZh: '将步枪级底部导气管与多突笋回转闭锁枪机引入 .50 AE 大威力手枪',
    innovationEn:
      'Fixed-barrel gas piston driving a rifle-style 3-lug rotating bolt in .50 AE',
  },
  {
    weaponId: 'm249',
    year: 1984,
    lineageId: 'gas_rotating_bolt',
    lane: 1,
    ancestors: ['garand'],
    designerZh: 'FN Herstal',
    designerEn: 'FN Herstal (Ernest Vervier)',
    innovationZh: 'M27 可散弹链顶推棘爪供弹与紧急 STANAG 弹匣双栖开膛待击',
    innovationEn:
      'Open-bolt long-stroke piston accepting both M27 disintegrating links and STANAG mags',
  },
  {
    weaponId: 'vss',
    year: 1987,
    lineageId: 'gas_rotating_bolt',
    lane: 1,
    ancestors: ['garand'],
    designerZh: '彼得·谢尔久科夫 / TsNIITochMash',
    designerEn: 'Pyotr Serdyukov / TsNIITochMash',
    innovationZh: '48 孔泄压消音筒配平移击针闭锁与亚音速 9×39mm 重弹头',
    innovationEn:
      '48-port integral expansion suppressor paired with heavy 9x39mm subsonic striker lockup',
  },
  {
    weaponId: 'g11',
    year: 1990,
    lineageId: 'roller_blowback_delayed',
    lane: 2,
    ancestors: ['mp5'],
    designerZh: 'H&K / Dynamit Nobel',
    designerEn: 'Heckler & Koch / Dynamit Nobel',
    innovationZh: '4.73×33mm 无壳弹 90° 旋转弹膛与 2,100 RPM 后坐抵消三连发时钟齿轮机匣',
    innovationEn:
      'Caseless DM11 90-deg rotary breech cylinder delivering 2,100 RPM hyperburst clockwork',
  },
  {
    weaponId: 'p90',
    year: 1990,
    lineageId: 'roller_blowback_delayed',
    lane: 2,
    ancestors: ['mp5'],
    designerZh: 'FN Herstal',
    designerEn: 'FN Herstal',
    innovationZh: '透明顶置 50 发 90° 螺旋滑道转正供弹与向下居中抛壳无托 PDW',
    innovationEn:
      'Top-mounted 50-rd helical ramp magazine rotating 5.7x28mm rounds downward through grip',
  },
  {
    weaponId: 'm4a1',
    year: 1994,
    lineageId: 'gas_rotating_bolt',
    lane: 1,
    ancestors: ['garand'],
    designerZh: '柯尔特 /尤金·斯通纳脉系',
    designerEn: 'Colt / Stoner Direct-Impingement Lineage',
    innovationZh: '机框内部自建同轴膨胀气室直接后吹七突笋枪机旋转开锁',
    innovationEn:
      'Internal Stoner coaxial expansion chamber keeping reciprocating mass along bore axis',
  },
  {
    weaponId: 'an94',
    year: 1994,
    lineageId: 'gas_rotating_bolt',
    lane: 1,
    ancestors: ['garand'],
    designerZh: '根纳季·尼科诺夫 (Gennadiy Nikonov)',
    designerEn: 'Gennadiy Nikonov / Izhmash',
    innovationZh: '动量延迟 1,800 RPM 钢索滑轮与 15° 右倾双层预供弹托弹槽',
    innovationEn:
      'Shifted-pulse barrel/receiver assembly with braided steel pulley accelerating 2-rd 1,800 RPM bursts',
  },
  {
    weaponId: 'awm',
    year: 1996,
    lineageId: 'manual_revolver_lever',
    lane: 3,
    ancestors: ['python'],
    designerZh: '精密国际 (Accuracy International)',
    designerEn: 'Accuracy International / Malcolm Cooper',
    innovationZh: '7075 铝合金全长刚性底盘与防结冰双排三闭锁突笋 60° 短拉栓',
    innovationEn:
      'Bonded billet chassis with 6-lug anti-icing bolt body chambered in .338 Lapua Magnum',
  },
  {
    weaponId: 'benellim4',
    year: 1999,
    lineageId: 'gas_rotating_bolt',
    lane: 1,
    ancestors: ['m4a1'],
    designerZh: '伯奈利军工 (Benelli Armi)',
    designerEn: 'Benelli Armi',
    innovationZh: 'ARGO 双置对称短行程不锈钢活塞自动泄压适应轻重装药霰弹',
    innovationEn:
      'Dual self-regulating stainless ARGO pistons directly below chamber eliminating O-rings',
  },
  {
    weaponId: 'scar',
    year: 2004,
    lineageId: 'gas_rotating_bolt',
    lane: 1,
    ancestors: ['m4a1'],
    designerZh: 'FN America / USSOCOM',
    designerEn: 'FN Herstal / FN America',
    innovationZh: '挤压成型一体铝上机匣与三档可调短行程冷活塞',
    innovationEn:
      'Monolithic extruded upper receiver with quick-adjustable short-stroke piston regulator',
  },
  {
    weaponId: 'vector',
    year: 2009,
    lineageId: 'roller_blowback_delayed',
    lane: 2,
    ancestors: ['mp5'],
    designerZh: 'KRISS USA (Renaud Kerbrat)',
    designerEn: 'KRISS USA / Renaud Kerbrat',
    innovationZh: 'Super V 轴外 75° 垂直导向滑块把 .45 ACP 后坐冲量转为向下分力',
    innovationEn:
      'Super V off-axis downward cam slider redirecting .45 ACP recoil away from muzzle flip',
  },
  {
    weaponId: 'ztz99a',
    year: 2011,
    lineageId: 'heavy_armor_mbt',
    lane: 5,
    ancestors: ['tiger1'],
    designerZh: '中国北方工业 / 内蒙古一机',
    designerEn: 'NORINCO / Inner Mongolia First Machinery',
    innovationZh: '22 发底置转盘分装自动装弹机、箭头 FY-4 双防爆反与 JD-3 激光压制',
    innovationEn:
      '22-round floor carousel autoloader paired with arrowhead FY-4 ERA and dual-axis FCS',
  },
  {
    weaponId: 'p320',
    year: 2014,
    lineageId: 'toggle_short_recoil',
    lane: 0,
    ancestors: ['g17'],
    designerZh: '西格绍尔 (SIG Sauer)',
    designerEn: 'SIG Sauer',
    innovationZh: '把整套火控连同序列号集中进单一不锈钢可抽出模块 FCU',
    innovationEn:
      'Serialized removable stainless Fire Control Unit (FCU) enabling toolless frame swaps',
  },
  {
    weaponId: 'm1a2',
    year: 2017,
    lineageId: 'heavy_armor_mbt',
    lane: 5,
    ancestors: ['tiger1'],
    designerZh: '通用动力地面系统 (GDLS)',
    designerEn: 'General Dynamics Land Systems',
    innovationZh: '尾舱泄压防爆面板兼防爆滑动隔舱门配 AGT1500 1,500 马力燃气轮机',
    innovationEn:
      'Isolated bustle ammunition compartment with automated blast doors and AGT1500 gas turbine',
  },
  {
    weaponId: 'leopard2a7',
    year: 2019,
    lineageId: 'heavy_armor_mbt',
    lane: 5,
    ancestors: ['tiger1'],
    designerZh: 'KMW / 莱茵金属',
    designerEn: 'Krauss-Maffei Wegmann & Rheinmetall',
    innovationZh: '120mm L/55A1 高膛压加长滑膛炮配楔形空心复合附加主装甲模块',
    innovationEn:
      'High-pressure 120mm L/55A1 smoothbore barrel and hollow composite arrowhead turret wedges',
  },
  {
    weaponId: 'r500',
    year: 2022,
    lineageId: 'compound_archery',
    lane: 4,
    ancestors: [],
    designerZh: 'Ravin Crossbows',
    designerEn: 'Ravin Crossbows',
    innovationZh: '360° HexCoil 螺旋绕线凸轮实现无导轨阻力悬空箭矢与 500 FPS 初速',
    innovationEn:
      '360-degree HexCoil helical cams eliminating rail friction to deliver 500 FPS bolt speed',
  },
  {
    weaponId: 'ak15',
    year: 2023,
    lineageId: 'gas_rotating_bolt',
    lane: 1,
    ancestors: ['garand', 'an94'],
    designerZh: '卡拉什尼科夫集团 (Kalashnikov Concern)',
    designerEn: 'Kalashnikov Concern (6П71М Obr.2023)',
    innovationZh: '保留传统长行程高可靠活塞同时整合双侧快慢机、浮动护木与通体导轨盖',
    innovationEn:
      '5th-gen Kalashnikov long-stroke reliability enhanced with free-float rail top cover and ambi safety',
  },
  {
    weaponId: 'lift33',
    year: 2024,
    lineageId: 'compound_archery',
    lane: 4,
    ancestors: ['r500'],
    designerZh: 'Mathews Archery',
    designerEn: 'Mathews Archery',
    innovationZh: 'SwitchWeight-X 同步双凸轮四片式分体碳纤维弓臂与超轻镁合金桥架',
    innovationEn:
      'SwitchWeight-X binary synchronized cams coupled with quad split carbon limbs & magnesium riser',
  },
];

export const HISTORY_TIMELINE_TOURS: readonly HistoryTimelineTourSpec[] = [
  {
    id: 'cold_war_rifles',
    titleZh: '冷战自动原理分流巡礼',
    titleEn: 'Cold War Automatic Action Divergence',
    subtitleZh: '对比长行程活塞、直接气吹、滚柱延迟与无壳时钟齿轮如何解答相同战术课题',
    subtitleEn:
      'Compare long-stroke piston, DI gas, roller-delayed blowback, and caseless clockwork solutions',
    weaponIds: ['garand', 'mp5', 'm4a1', 'g11', 'an94', 'ak15'],
  },
  {
    id: 'german_precision',
    titleZh: '百年德系精密机构路线图',
    titleEn: 'Century of German Mechanical Precision',
    subtitleZh: '从 1900 鲁格 P08 与 1942 虎式 88mm 炮一路追踪至豹 2A7V 与 G11',
    subtitleEn:
      'From 1900 Luger P08 & 1942 Tiger I 88mm through HK MP5, G11 K2, and Leopard 2A7V',
    weaponIds: ['p08', 'tiger1', 'mp5', 'g11', 'leopard2a7'],
  },
  {
    id: 'heavy_armor_evolution',
    titleZh: '1:1 重装主战坦克八十年进化史',
    titleEn: '80 Years of 1:1 Heavy Armor & Main Guns',
    subtitleZh: '剖析虎式立楔人工装填如何走向中/美/德三代现代主战坦克自动火控格局',
    subtitleEn:
      'Contrast WWII manual 88mm torsion-bar armor with modern ZTZ-99A, M1A2 SEP v3, and Leopard 2A7V',
    weaponIds: ['tiger1', 'ztz99a', 'm1a2', 'leopard2a7'],
  },
  {
    id: 'unconventional_actions',
    titleZh: '非常规几何延迟与能源奇观',
    titleEn: 'Unconventional Locking & Propulsion',
    subtitleZh: '聚焦最反直觉的机械解法：轴外 V 型、钢索滑轮、无壳旋转与六管电驱',
    subtitleEn:
      'Focus on non-traditional mechanisms: off-axis Super V, pulley-cable, caseless drum, and 6-barrel Gatling',
    weaponIds: ['m134', 'g11', 'p90', 'an94', 'vector', 'r500'],
  },
];
