import { CENTENNIAL_BLUEPRINTS } from '../../weapons/expansion/centennialCatalog';
import type { WeaponId } from '../../weapons/types';

export interface EngineeringGlossaryTerm {
  readonly id: string;
  readonly termZh: string;
  readonly termEn: string;
  readonly summaryZh: string;
  readonly summaryEn: string;
  readonly relatedWeaponIds: readonly WeaponId[];
}

/**
 * Authoritative bilingual mechanical engineering encyclopedia covering all 34
 * exhibits across all 10 halls. Pure leaf module (types-only import) so it
 * adds zero circular-chunk edges to Vite manualChunks.
 */
export const ENGINEERING_GLOSSARY_TERMS: readonly EngineeringGlossaryTerm[] = [
  {
    id: 'rotating_bolt',
    termZh: '回转枪机闭锁',
    termEn: 'Rotating Bolt Locking',
    summaryZh:
      '枪机头围绕枪管轴线旋转（35°–90°），使前端闭锁突笋嵌入机匣节套或枪管延伸部凹槽，将数千大气压的膛底推力直接锁固在刚性钢壁内。',
    summaryEn:
      'The bolt head rotates 35°–90° around the bore axis so radial locking lugs engage hardened barrel-extension or receiver recesses, absorbing peak breech thrust inside a rigid steel lockup.',
    relatedWeaponIds: [
      'ak15',
      'm4a1',
      'scar',
      'aug',
      'deagle',
      'benellim4',
      'garand',
      'm249',
      'vss',
      'an94',
      'm82a1',
      'awm',
      'k98k',
    ],
  },
  {
    id: 'browning_tilting_link',
    termZh: '勃朗宁枪管偏移闭锁',
    termEn: 'Browning Tilting-Barrel Lock',
    summaryZh:
      '击发初期枪管与套筒刚性咬合共同短后坐，随后借单绞链（M1911）或闭锁斜面（G17/P320）拉低枪管尾端，使顶部闭锁筋脱离套筒开锁抽壳。',
    summaryEn:
      'Barrel and slide recoil locked together for several millimeters before a swinging link (M1911) or camming lug (G17/P320) pulls the breech downward, disengaging locking ribs once chamber pressure drops safely.',
    relatedWeaponIds: ['m1911', 'g17', 'p320'],
  },
  {
    id: 'short_recoil_operation',
    termZh: '枪管短后坐自动原理',
    termEn: 'Short-Recoil Operation',
    summaryZh:
      '发射瞬间枪管与枪机/套筒保持闭锁共同向后运动一小段距离（短于全弹长度），待弹头离膛泄压后再分离加速后坐件完成抛壳复进。',
    summaryEn:
      'The barrel and breechblock remain rigidly locked through a brief rearward travel shorter than cartridge length; once the projectile exits and pressure decays, mechanical cams unlock the bolt to complete extraction.',
    relatedWeaponIds: ['m1911', 'g17', 'p320', 'p08', 'm82a1', 'mg42'],
  },
  {
    id: 'roller_delayed_blowback',
    termZh: '滚柱延迟半自由枪机',
    termEn: 'Roller-Delayed Blowback',
    summaryZh:
      '利用对称双钢滚柱卡入机匣斜槽并顶推闭锁楔铁，在几何杠杆比（约 4:1）下迫使枪机框以数倍速度先行加速，从而将枪机头后退延迟至膛压安全区。',
    summaryEn:
      'Twin steel rollers seated in angled trunnion recesses wedge against an inclined locking piece, using roughly a 4:1 mechanical disadvantage to accelerate the bolt carrier first and delay bolt-head opening until bore pressure falls.',
    relatedWeaponIds: ['mp5', 'mg42', 'vector'],
  },
  {
    id: 'roller_locked_short_recoil',
    termZh: '对称双滚柱短后坐闭锁',
    termEn: 'Roller-Locked Short Recoil',
    summaryZh:
      'MG 42 首创的高速刚性闭锁机构：枪管与枪机靠双滚柱完全刚性锁死，枪口助退器助推整体短后坐 8.5 mm 后由机匣定斜坡收拢滚柱瞬间解锁，成就 1,200+ RPM 撕布机射速。',
    summaryEn:
      'Pioneered on the MG 42: twin rollers rigidly lock bolt to barrel extension until muzzle-booster-assisted 8.5 mm short recoil cams the rollers inward—distinct from the MP5 non-recoiling delayed-blowback adaptation.',
    relatedWeaponIds: ['mg42', 'mp5'],
  },
  {
    id: 'blish_bronze_wedge',
    termZh: '布利什青铜斜楔延迟',
    termEn: 'Blish Bronze Wedge Delay',
    summaryZh:
      '汤姆逊 M1928A1 在钢制枪机内嵌入 45° 斜槽 H 型青铜块，利用异种金属在高压下静摩擦阻力骤增的布利什原理延缓开膛反冲动作。',
    summaryEn:
      'The Thompson M1928A1 uses an H-shaped bronze lock riding in 45° receiver slots, relying on high-pressure adhesion between dissimilar metals to briefly retard blowback opening before sliding upward cleanly.',
    relatedWeaponIds: ['thompson', 'vector', 'p90'],
  },
  {
    id: 'long_stroke_piston',
    termZh: '长行程导气活塞',
    termEn: 'Long-Stroke Gas Piston',
    summaryZh:
      '导气活塞与枪机框刚性固联并随其走完全部后坐行程，质量惯性充沛、泥沙耐受度极高，是 AK-15M1、M1 加兰德与 M249 极端可靠性的核心基石。',
    summaryEn:
      'The gas piston is rigidly fixed to the bolt carrier and travels the full reciprocating stroke, delivering high operating momentum and wide fouling tolerance across the AK-15M1, M1 Garand, and M249 SAW.',
    relatedWeaponIds: ['ak15', 'garand', 'm249', 'vss', 'an94'],
  },
  {
    id: 'direct_impingement',
    termZh: '斯通纳气吹式导气 (DI)',
    termEn: 'Stoner Direct Impingement',
    summaryZh:
      '高压火药燃气经细导气管直入枪机框内气室，枪机尾部本身即构成同轴活塞，将往复质量集中于膛轴线上，显著降低连发射击时的质心偏摆。',
    summaryEn:
      'Propellant gas travels down a slender tube directly into an expansion cylinder machined inside the bolt carrier, turning the bolt tail into an inline piston that minimizes off-axis reciprocating mass.',
    relatedWeaponIds: ['m4a1', 'scar', 'ak15'],
  },
  {
    id: 'short_stroke_piston',
    termZh: '短行程导气活塞',
    termEn: 'Short-Stroke Gas Piston',
    summaryZh:
      '独立短活塞仅向后推动数毫米将脉冲动能传递给枪机框后即行复位，既将高温积碳隔绝在机匣外部，又比长行程机构拥有更轻的前端往复惯量。',
    summaryEn:
      'A separate gas piston taps the bolt carrier across a brief impulse stroke and immediately returns under its own spring, keeping hot fouling out of the receiver while cutting forward reciprocating mass.',
    relatedWeaponIds: ['scar', 'aug', 'deagle', 'benellim4', 'g11'],
  },
  {
    id: 'controlled_round_feed',
    termZh: '毛瑟 98 受控供弹',
    termEn: 'Mauser Controlled-Round Feed',
    summaryZh:
      '枪弹刚离开弹仓托弹唇，全长不旋转抓壳钩即咬合弹底沟槽全程夹持推入弹膛，即使倒置或剧烈颠簸推栓也绝不发生双进卡壳。',
    summaryEn:
      'As the cartridge rises from the magazine, a full-length non-rotating claw extractor immediately captures the case rim and guides it smoothly into the chamber—preventing double-feeds even when cycled inverted.',
    relatedWeaponIds: ['k98k', 'awm', 'winchester1894'],
  },
  {
    id: 'toggle_knee_lock',
    termZh: '屈膝肘节过死点闭锁',
    termEn: 'Toggle-Lock Knee Joint',
    summaryZh:
      '鲁格 P08 采用双连杆过下死点伸直抵住膛压，枪管短后坐时肘节滚轮撞击机匣斜坡向上折起如人类膝盖，实现零套筒质量的极低枪口上跳。',
    summaryEn:
      'The Luger P08 straightens a two-link knee joint slightly past dead-center to resist breech thrust; during short recoil, receiver ramps snap the toggle upward like a flexing knee with minimal reciprocating weight.',
    relatedWeaponIds: ['p08', 'm1911', 'g17'],
  },
  {
    id: 'super_v_off_axis',
    termZh: 'Super V 轴外偏转延迟',
    termEn: 'Super V Off-Axis Redirection',
    summaryZh:
      'KRISS Vector 将枪机后坐动量经斜凸轮槽偏转 -65° 导向弹匣井后方的下沉滑道，配合极低膛轴线把水平后坐力转化为抑制枪口上跳的下压扭矩。',
    summaryEn:
      'An angled cam track redirects bolt momentum downward at -65° behind the magazine well, pairing a super-low bore axis with vertical mass travel to counter muzzle climb during 1,200 RPM bursts.',
    relatedWeaponIds: ['vector', 'thompson', 'mp5'],
  },
  {
    id: 'caseless_rotary_breech',
    termZh: '90° 旋转无壳弹膛',
    termEn: '90° Rotary Caseless Breech',
    summaryZh:
      'H&K G11 摒弃黄铜弹壳，使用垂直压块无壳弹与瑞士钟表级齿轮系驱动圆柱弹膛绕横轴 90° 旋转供弹击发，整套内构浮置后坐达成 2,100 RPM 三连发。',
    summaryEn:
      'Eliminating brass cases altogether, the H&K G11 drives a transverse 90° rotating cylinder chamber through precision clockwork gears inside a floating recoil assembly for 2,100 RPM three-round bursts.',
    relatedWeaponIds: ['g11', 'an94', 'p90'],
  },
  {
    id: 'pulley_hyperburst',
    termZh: '钢索滑轮延迟后坐双发',
    termEn: 'Pulley-Driven Hyperburst Recoil',
    summaryZh:
      'AN-94 将整套枪管与自动机浮置在机匣导轨上，击发首弹后借编织钢索与定滑轮在射手尚未感受到后坐冲击前，于 1,800 RPM 极速将第二发推膛击发。',
    summaryEn:
      'The AN-94 floats its barrel and action inside the receiver, using a braided steel cable and pulley to pre-stage and fire a second round at 1,800 RPM before the first recoil impulse reaches the shooter shoulder.',
    relatedWeaponIds: ['an94', 'g11', 'ak15'],
  },
  {
    id: 'integral_ported_suppressor',
    termZh: '整体多孔泄气消音枪管',
    termEn: 'Integral Ported Suppressor Barrel',
    summaryZh:
      'VSS Vintorez 在膛线沟槽钻出多排微孔，使高压燃气在弹头出膛前先行泄入膨胀室降温降速，再经 6 级斜挡板涡流消能，配合 9×39mm 亚音速重弹实现极致静音。',
    summaryEn:
      'Rows of ports drilled through the rifling grooves bleed propellant gas into an expansion sleeve ahead of the muzzle before six slanted baffles scrub residual blast around subsonic 9×39mm heavy bullets.',
    relatedWeaponIds: ['vss', 'mp5', 'ak15'],
  },
  {
    id: 'electric_gatling_cam',
    termZh: '六管电动 360° 螺旋凸轮',
    termEn: 'Electric Gatling 360° Cam Track',
    summaryZh:
      'M134D 依靠 28V 直流外能源电机带动六管星形转子旋转，六个独立枪机沿机匣内壁静止正弦凸轮槽依次完成推弹、闭锁、击发与抽壳，彻底规避单管热过载与哑弹停射。',
    summaryEn:
      'A 28V DC motor spins six barrels and independent bolts along a stationary 360° sinusoidal cam track, continuously cycling feed, lock, fire, and extraction while automatically ejecting misfires without stoppage.',
    relatedWeaponIds: ['m134', 'gau8'],
  },
  {
    id: 'hydraulic_rotary_cannon',
    termZh: '双液压七管重型航空机炮',
    termEn: 'Dual-Hydraulic 7-Barrel Rotary Cannon',
    summaryZh:
      'GAU-8/A 由双 38.5 马力 3,000 PSI 液压马达外驱七管 30mm 枪管束与 1,150 发无链闭环螺旋弹鼓同步运转，以 3,900 RPM 倾泻贫铀穿甲弹并回收全部空弹壳维持飞机重心。',
    summaryEn:
      'Twin 38.5 hp 3,000 PSI hydraulic motors synchronize seven 30mm barrels with a 1,150-round linkless helical drum at 3,900 RPM, returning spent aluminum cases into the drum to preserve aircraft center of gravity.',
    relatedWeaponIds: ['gau8', 'm134', 'ztz99a'],
  },
  {
    id: 'open_bolt_operation',
    termZh: '开膛待击热散热机构',
    termEn: 'Open-Bolt Operation',
    summaryZh:
      '待击状态下枪机被阻铁挂留在后方、弹膛敞开通风，扣动扳机后枪机携弹前冲并一气呵成闭锁击发，有效杜绝机枪与冲锋枪持续连射时的弹膛过热自燃（Cook-Off）。',
    summaryEn:
      'The bolt rests latched to the rear with an open, air-cooled chamber; pulling the trigger releases the bolt to strip, chamber, lock, and fire in one forward stroke—eliminating sustained-fire cook-offs.',
    relatedWeaponIds: ['mg42', 'm249', 'thompson'],
  },
  {
    id: 'en_bloc_clip',
    termZh: '整装漏夹与自动弹夹声',
    termEn: 'En-Bloc Clip & Auto-Ejection',
    summaryZh:
      'M1 加兰德将 8 发 .30-06 枪弹连同弹簧钢漏夹整体压入内置弹仓，打完第 8 发后托弹臂瞬间向上弹出空漏夹，发出响彻二战战场的清脆金属“叮！”声提示装填。',
    summaryEn:
      'Eight .30-06 cartridges load inside a spring-steel clip retained within the magazine; on the eighth shot, the follower arm snaps the empty clip skyward with its signature metallic ping.',
    relatedWeaponIds: ['garand', 'k98k'],
  },
  {
    id: 'argo_dual_piston',
    termZh: 'ARGO 自调双短行程活塞',
    termEn: 'ARGO Auto-Regulating Dual Pistons',
    summaryZh:
      '伯奈利 M4 在紧贴弹膛前方的超高温高压区并列布置两根独立不锈钢短行程活塞，无需手动调节气阀即可自适应轻载靶弹与重装鹿弹的膛压差异。',
    summaryEn:
      'Mounted directly ahead of the chamber where gas is hottest and cleanest, twin stainless short-stroke pistons self-regulate across light target loads and magnum buckshot without manual gas-port adjustments.',
    relatedWeaponIds: ['benellim4', 'rem870'],
  },
  {
    id: 'lever_dropping_block',
    termZh: '指环杠杆垂直升降闭锁块',
    termEn: 'Lever-Action Vertical Locking Block',
    summaryZh:
      '温彻斯特 M1894 下摆 D 型指环杠杆时先垂降实心 H 型钢闭锁块解锁，随后拉退枪机开顶抛壳并抬升托弹板供弹，以纤薄平面机匣容纳高压步枪弹。',
    summaryEn:
      'Cycling the Winchester 1894 finger lever drops a solid vertical steel locking block clear of the bolt rear before retracting the breech, ejecting upward, and lifting the next round from the tubular magazine.',
    relatedWeaponIds: ['winchester1894', 'rem870', 'k98k'],
  },
  {
    id: 'twin_bar_pump_and_revolver',
    termZh: '双平行连杆泵动与转轮分度',
    termEn: 'Twin-Action-Bar Pump & Ratchet Indexing',
    summaryZh:
      '手动机械可靠性的两座丰碑：雷明顿 M870 以对称双钢拉杆彻底消除单杆偏磨卡滞，柯尔特蟒蛇借手工修配棘轮拨齿与 V 型板簧实现丝滑如镜的 6 膛转轮同步闭锁。',
    summaryEn:
      'Two icons of manual reliability: the Remington 870 pairs twin parallel steel action bars to eliminate forend binding, while the Colt Python hand-fitted ratchet and V-mainspring time six chambers with lockwork precision.',
    relatedWeaponIds: ['rem870', 'python', 'winchester1894', 'benellim4'],
  },
  {
    id: 'compound_let_off_cam',
    termZh: '双偏心凸轮 85% 省力谷',
    termEn: 'Dual Eccentric Cam 85% Let-Off',
    summaryZh:
      'Mathews LIFT 33 利用非对称偏心凸轮改变力臂半径，使弓手越过 70 lb 峰值拉力后跌入仅需 10.5 lb 维持的省力谷，却在撒放做功行程完整释放弹性势能。',
    summaryEn:
      'Asymmetric eccentric cams vary effective leverage through the draw cycle, dropping holding weight 85% past peak draw into a calm aiming valley while returning full stored limb energy along the power stroke.',
    relatedWeaponIds: ['lift33', 'r500'],
  },
  {
    id: 'helical_crossbow_cam',
    termZh: '360° 螺旋凸轮零轨悬浮弩',
    termEn: '360° Helical Cam & Frictionless Rail',
    summaryZh:
      'Ravin R500 的 HexCoil 多层螺旋凸轮可绕轴旋转整整 360°，将 300 lb 拉力压缩至极窄轴距并让弩箭悬空离轨直线发射，消除轨道摩擦达成 500 FPS 矢速。',
    summaryEn:
      'Multi-tier HexCoil helical cams rotate a full 360° to package 300 lb of limb energy into an ultra-narrow profile while suspending the bolt clear of the rail for frictionless 500 FPS flight.',
    relatedWeaponIds: ['r500', 'lift33'],
  },
  {
    id: 'apfsds_sabot_dart',
    termZh: '尾翼稳定脱壳穿甲弹 (APFSDS)',
    termEn: 'APFSDS Fin-Stabilized Sabot Dart',
    summaryZh:
      '滑膛主炮利用高膛压推动次口径高长径比钨合金/贫铀长杆弹芯以 1,650–1,750 m/s 飞出，出膛后气动剥离铝制弹托，以超高断面动能密度贯穿现代多层复合装甲。',
    summaryEn:
      'A smoothbore cannon accelerates a sub-caliber tungsten or depleted-uranium rod to 1,650–1,750 m/s; aerodynamic drag strips the lightweight sabot petals at the muzzle, concentrating megajoules of kinetic energy onto a narrow penetrator tip.',
    relatedWeaponIds: ['ztz99a', 'm1a2', 'leopard2a7', 'tiger1', 'gau8'],
  },
  {
    id: 'polygonal_vs_cut_rifling',
    termZh: '多边形膛线 vs 切削膛线',
    termEn: 'Polygonal vs. Cut Land-and-Groove Rifling',
    summaryZh:
      '传统切削/冷锻膛线以锐利阴阳线切入弹头铜被甲施加自旋，而格洛克与沙漠之鹰采用圆弧过渡的多边形内膛，减少气密泄漏与弹头变形并提升枪管寿命与初速。',
    summaryEn:
      'Traditional cut or button rifling engraves sharp lands into the bullet jacket to impart gyroscopic spin, whereas polygonal bores use smooth arched hills and valleys that improve gas seal, velocity, and barrel wear life.',
    relatedWeaponIds: [
      'g17',
      'p320',
      'deagle',
      'm1911',
      'p08',
      'python',
      'ak15',
      'm4a1',
      'mp5',
      'aug',
      'p90',
      'awm',
      'm82a1',
      'winchester1894',
      'tiger1',
    ],
  },
  {
    id: 'carousel_autoloader',
    termZh: '底置转盘自动装弹机',
    termEn: 'Carousel Autoloader vs. Bustle Rack',
    summaryZh:
      'ZTZ-99A 在炮塔下方布置 22 发底置转盘自动装弹机，实现三人车组与低矮正面投影；M1A2 与豹 2A7 则将整装弹药置于带顶置泄压板的隔爆尾舱，由第四名装填手人工爆发装填。',
    summaryEn:
      'The ZTZ-99A houses 22 two-piece rounds in a hull-floor carousel autoloader for a three-crew low silhouette, contrasting with the M1A2 and Leopard 2A7 four-crew isolated turret bustles protected by blow-off panels.',
    relatedWeaponIds: ['ztz99a', 'm1a2', 'leopard2a7'],
  },
  {
    id: 'sliding_wedge_breech',
    termZh: '立楔 / 水平楔式火炮炮闩',
    termEn: 'Vertical & Horizontal Sliding-Wedge Breech',
    summaryZh:
      '主战坦克主炮采用承受 600+ MPa 膛压的整块高强钢楔形炮闩（虎式水平滑动、现代 120/125mm 立式升降），炮管复进末端由半自动开闩凸轮自动退壳并待装下一发。',
    summaryEn:
      'Tank cannons seal 600+ MPa breech pressures with a massive steel sliding wedge—horizontal on the Tiger I KwK 36 and vertical on modern 120/125mm smoothbores—automatically opening during counter-recoil to eject the stub case.',
    relatedWeaponIds: ['tiger1', 'ztz99a', 'm1a2', 'leopard2a7'],
  },
];

/**
 * Curated per-exhibit ordering of 2–3 signature engineering principles so the
 * most iconic mechanism for every exhibit always leads the inspector chip row.
 */
const EXHIBIT_SIGNATURE_TERMS: Readonly<Record<WeaponId, readonly string[]>> = {
  ak15: ['long_stroke_piston', 'rotating_bolt', 'polygonal_vs_cut_rifling'],
  m4a1: ['direct_impingement', 'rotating_bolt', 'polygonal_vs_cut_rifling'],
  mp5: [
    'roller_delayed_blowback',
    'roller_locked_short_recoil',
    'polygonal_vs_cut_rifling',
  ],
  g17: ['browning_tilting_link', 'polygonal_vs_cut_rifling', 'short_recoil_operation'],
  m82a1: ['short_recoil_operation', 'rotating_bolt', 'polygonal_vs_cut_rifling'],
  awm: ['rotating_bolt', 'controlled_round_feed', 'polygonal_vs_cut_rifling'],
  scar: ['short_stroke_piston', 'rotating_bolt', 'direct_impingement'],
  deagle: ['short_stroke_piston', 'rotating_bolt', 'polygonal_vs_cut_rifling'],
  aug: ['short_stroke_piston', 'rotating_bolt', 'polygonal_vs_cut_rifling'],
  p320: ['browning_tilting_link', 'short_recoil_operation', 'polygonal_vs_cut_rifling'],
  p90: ['blish_bronze_wedge', 'caseless_rotary_breech', 'polygonal_vs_cut_rifling'],
  lift33: ['compound_let_off_cam', 'helical_crossbow_cam'],
  r500: ['helical_crossbow_cam', 'compound_let_off_cam'],
  python: ['twin_bar_pump_and_revolver', 'polygonal_vs_cut_rifling'],
  benellim4: ['argo_dual_piston', 'short_stroke_piston', 'rotating_bolt'],
  garand: ['en_bloc_clip', 'long_stroke_piston', 'rotating_bolt'],
  m249: ['open_bolt_operation', 'long_stroke_piston', 'rotating_bolt'],
  p08: ['toggle_knee_lock', 'short_recoil_operation', 'polygonal_vs_cut_rifling'],
  vector: ['super_v_off_axis', 'blish_bronze_wedge', 'roller_delayed_blowback'],
  g11: ['caseless_rotary_breech', 'pulley_hyperburst', 'short_stroke_piston'],
  vss: ['integral_ported_suppressor', 'long_stroke_piston', 'rotating_bolt'],
  m134: ['electric_gatling_cam', 'hydraulic_rotary_cannon'],
  an94: ['pulley_hyperburst', 'long_stroke_piston', 'rotating_bolt'],
  ztz99a: ['carousel_autoloader', 'apfsds_sabot_dart', 'sliding_wedge_breech'],
  m1a2: ['apfsds_sabot_dart', 'sliding_wedge_breech', 'carousel_autoloader'],
  leopard2a7: ['apfsds_sabot_dart', 'sliding_wedge_breech', 'carousel_autoloader'],
  tiger1: ['sliding_wedge_breech', 'polygonal_vs_cut_rifling', 'apfsds_sabot_dart'],
  winchester1894: [
    'lever_dropping_block',
    'twin_bar_pump_and_revolver',
    'polygonal_vs_cut_rifling',
  ],
  rem870: ['twin_bar_pump_and_revolver', 'argo_dual_piston'],
  m1911: ['browning_tilting_link', 'short_recoil_operation', 'polygonal_vs_cut_rifling'],
  mg42: [
    'roller_locked_short_recoil',
    'open_bolt_operation',
    'roller_delayed_blowback',
  ],
  k98k: ['controlled_round_feed', 'rotating_bolt', 'en_bloc_clip'],
  thompson: ['blish_bronze_wedge', 'open_bolt_operation', 'super_v_off_axis'],
  gau8: ['hydraulic_rotary_cannon', 'electric_gatling_cam', 'apfsds_sabot_dart'],
  ...(Object.fromEntries(
    CENTENNIAL_BLUEPRINTS.map((bp) => [bp.id, bp.glossaryTermIds])
  ) as unknown as Record<
    (typeof CENTENNIAL_BLUEPRINTS)[number]['id'],
    readonly string[]
  >),
};

const TERM_BY_ID = new Map<string, EngineeringGlossaryTerm>(
  ENGINEERING_GLOSSARY_TERMS.map((t) => [t.id, t])
);

export function getGlossaryTermById(
  termId: string
): EngineeringGlossaryTerm | undefined {
  return TERM_BY_ID.get(termId);
}

/**
 * Returns 2–4 authoritative engineering glossary terms for any exhibit,
 * ordered with that exhibit's signature mechanism first.
 */
export function getGlossaryTermsForWeapon(
  weaponId: WeaponId
): readonly EngineeringGlossaryTerm[] {
  const orderedIds = EXHIBIT_SIGNATURE_TERMS[weaponId];
  const resolved: EngineeringGlossaryTerm[] = [];
  if (orderedIds) {
    for (const id of orderedIds) {
      const term = TERM_BY_ID.get(id);
      if (term) resolved.push(term);
    }
  }
  if (resolved.length >= 2) {
    return resolved;
  }
  for (const term of ENGINEERING_GLOSSARY_TERMS) {
    if (
      term.relatedWeaponIds.includes(weaponId) &&
      !resolved.some((r) => r.id === term.id)
    ) {
      resolved.push(term);
      if (resolved.length >= 3) break;
    }
  }
  return resolved;
}
