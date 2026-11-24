import type * as THREE from 'three';
import type {
  MutablePartPose,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';
import { playWorkbenchFoley } from '../audio/mechanicalSoundEngine';

/**
 * WP-10 — 1:1 3D Armorer Vernier Caliper & Envelope Scale Metrology Store
 * ------------------------------------------------------------------------
 * Coordinate invariant (`AGENTS.md` Rule #1):
 *   `1 world unit = 1 cm = 10 mm` (`+X` muzzle, `+Y` up, `+Z` right flank).
 */

export const WORLD_UNIT_TO_MM = 10;
export const MM_PER_INCH = 25.4;

export type CaliperUnitSystem = 'mm' | 'in';

export function convertMmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

export function formatCaliperDistance(
  mm: number,
  unit: CaliperUnitSystem,
  options?: { compact?: boolean }
): string {
  const compact = Boolean(options?.compact);
  if (unit === 'in') {
    return `${convertMmToInches(mm).toFixed(compact ? 1 : 2)} in`;
  }
  return `${mm.toFixed(compact ? 0 : 1)} mm`;
}

export function formatCaliperSignedDelta(
  deltaMm: number,
  unit: CaliperUnitSystem
): string {
  const sign = deltaMm >= 0 ? '+' : '-';
  const absMm = Math.abs(deltaMm);
  if (unit === 'in') {
    return `${sign}${convertMmToInches(absMm).toFixed(2)} in`;
  }
  return `${sign}${absMm.toFixed(1)} mm`;
}

export function formatCaliperPlaceholder(unit: CaliperUnitSystem): string {
  return unit === 'in' ? '--.-- in' : '---.- mm';
}

export type CaliperBenchmarkKind =
  | 'overall_envelope'
  | 'barrel_length'
  | 'bolt_lug_span';

export const CALIPER_BENCHMARK_ORDER: readonly CaliperBenchmarkKind[] = [
  'overall_envelope',
  'barrel_length',
  'bolt_lug_span',
];

export interface CaliperBenchmarkPresetNote {
  kind: CaliperBenchmarkKind;
  labelZh: string;
  labelEn: string;
  nominalMm: number;
}

export const CALIPER_V2_BENCHMARK_NOTES: Readonly<
  Record<WeaponId, readonly CaliperBenchmarkPresetNote[]>
> = {
  ak15: [
    {
      kind: 'overall_envelope',
      labelZh: 'AK-15M1 展开折叠托全枪总长（托底至制退器）',
      labelEn: 'AK-15M1 Stock-Extended Overall Length (Buttpad to Brake)',
      nominalMm: 940,
    },
    {
      kind: 'barrel_length',
      labelZh: '415 mm 7.62×39mm 冷锻镀铬浮置枪管实长',
      labelEn: '415 mm Cold Hammer-Forged Chrome 7.62x39mm Barrel Length',
      nominalMm: 415,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '卡拉什尼科夫双大突笋回转枪机轴向跨度',
      labelEn: 'Kalashnikov Twin-Lug Rotating Bolt Axial Span',
      nominalMm: 78,
    },
  ],
  m4a1: [
    {
      kind: 'overall_envelope',
      labelZh: 'M4A1 卡宾枪伸缩托全展包络总长',
      labelEn: 'M4A1 Carbine Stock-Extended Overall Envelope Length',
      nominalMm: 838,
    },
    {
      kind: 'barrel_length',
      labelZh: '14.5" (368 mm) SOCOM 镀铬 5.56 NATO 枪管实长',
      labelEn: '14.5" (368 mm) SOCOM Chrome-Lined 5.56 NATO Barrel Length',
      nominalMm: 368,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '斯通纳 7 闭锁突笋回转枪机轴向跨度',
      labelEn: 'Stoner 7-Lug Rotating Bolt Axial Span',
      nominalMm: 72,
    },
  ],
  mp5: [
    {
      kind: 'overall_envelope',
      labelZh: 'H&K MP5A3 伸缩金属托展开全枪总长',
      labelEn: 'H&K MP5A3 Retractable-Stock Extended Overall Length',
      nominalMm: 700,
    },
    {
      kind: 'barrel_length',
      labelZh: '8.9" (225 mm) 12 槽浮膛多边形冷锻枪管实长',
      labelEn: '8.9" (225 mm) Fluted-Chamber Polygonal CHF Barrel Length',
      nominalMm: 225,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '对称双滚柱延迟闭锁机头跨度',
      labelEn: 'Twin-Roller Delayed Locking Bolt Head Span',
      nominalMm: 52,
    },
  ],
  g17: [
    {
      kind: 'overall_envelope',
      labelZh: '格洛克 17 Gen5 全枪水平包络长度',
      labelEn: 'Glock 17 Gen5 Overall Horizontal Envelope Length',
      nominalMm: 202,
    },
    {
      kind: 'barrel_length',
      labelZh: '4.49" (114 mm) Marksman 六边形膛线枪管实长',
      labelEn: '4.49" (114 mm) Marksman Hexagonal Polygonal Barrel Length',
      nominalMm: 114,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '改良勃朗宁矩形抛壳窗套筒闭锁跨度',
      labelEn: 'Modified Browning Ejection-Port Slide Lockup Span',
      nominalMm: 186,
    },
  ],
  m82a1: [
    {
      kind: 'overall_envelope',
      labelZh: '巴雷特 M82A1 .50 BMG 含箭头制退器全长',
      labelEn: 'Barrett M82A1 .50 BMG Overall Length (w/ Arrowhead Brake)',
      nominalMm: 1448,
    },
    {
      kind: 'barrel_length',
      labelZh: '29" (737 mm) 纵向开槽短后坐重型枪管实长',
      labelEn: '29" (737 mm) Fluted Short-Recoil Heavy Barrel Length',
      nominalMm: 737,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '三对称大闭锁突笋旋转枪机轴向跨度',
      labelEn: '3-Lug Heavy Rotating Breech Bolt Axial Span',
      nominalMm: 158,
    },
  ],
  awm: [
    {
      kind: 'overall_envelope',
      labelZh: '精密国际 AWM .338 展开枪托全枪总长',
      labelEn: 'Accuracy International AWM .338 Stock-Extended Overall Length',
      nominalMm: 1230,
    },
    {
      kind: 'barrel_length',
      labelZh: '27" (686 mm) 不锈钢凹槽比赛级浮置枪管实长',
      labelEn: '27" (686 mm) Fluted Stainless Match-Grade Barrel Length',
      nominalMm: 686,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '双排 6 突笋 60° 短抬角手动旋转枪机跨度',
      labelEn: '6-Lug 60-Degree Short-Throw Rotating Bolt Body Span',
      nominalMm: 162,
    },
  ],
  scar: [
    {
      kind: 'overall_envelope',
      labelZh: 'FN SCAR-L CQC 展开折叠托全枪包络总长',
      labelEn: 'FN SCAR-L CQC Stock-Extended Overall Envelope Length',
      nominalMm: 889,
    },
    {
      kind: 'barrel_length',
      labelZh: '14" (355 mm) 六螺栓快换冷锻镀铬枪管实长',
      labelEn: '14" (355 mm) Quick-Change Chrome CHF Barrel Length',
      nominalMm: 355,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '短行程活塞驱动多突笋回转枪机跨度',
      labelEn: 'Short-Stroke Piston Multi-Lug Rotating Bolt Span',
      nominalMm: 86,
    },
  ],
  deagle: [
    {
      kind: 'overall_envelope',
      labelZh: '沙漠之鹰 Mark XIX .50 AE 全枪水平包络长度',
      labelEn: 'Desert Eagle Mark XIX .50 AE Overall Envelope Length',
      nominalMm: 273,
    },
    {
      kind: 'barrel_length',
      labelZh: '6" (152 mm) 固定式多边形重型枪管实长',
      labelEn: '6" (152 mm) Fixed Polygonal Heavy Barrel Length',
      nominalMm: 152,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '导气式步枪级 7 突笋回转枪机头跨度',
      labelEn: 'Gas-Operated Rifle-Style 7-Lug Rotating Bolt Span',
      nominalMm: 68,
    },
  ],
  aug: [
    {
      kind: 'overall_envelope',
      labelZh: '斯泰尔 AUG A1 无托步枪全枪包络总长',
      labelEn: 'Steyr AUG A1 Bullpup Rifle Overall Envelope Length',
      nominalMm: 790,
    },
    {
      kind: 'barrel_length',
      labelZh: '20" (508 mm) 旋扣快拆冷锻镀铬枪管实长',
      labelEn: '20" (508 mm) Quick-Detach Chrome CHF Barrel Length',
      nominalMm: 508,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '双导杆机框与 7 闭锁突笋回转枪机跨度',
      labelEn: 'Twin-Guide-Rod Carrier & 7-Lug Rotating Bolt Span',
      nominalMm: 82,
    },
  ],
  p320: [
    {
      kind: 'overall_envelope',
      labelZh: '西格绍尔 P320 M17 全尺寸手枪包络总长',
      labelEn: 'SIG Sauer P320 M17 Full-Size Overall Envelope Length',
      nominalMm: 203,
    },
    {
      kind: 'barrel_length',
      labelZh: '4.7" (119 mm) 碳钢 9×19mm 枪管实长',
      labelEn: '4.7" (119 mm) Carbon-Steel 9x19mm Barrel Length',
      nominalMm: 119,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '不锈钢套筒闭锁窗与模块化火控底座跨度',
      labelEn: 'Stainless Slide Lockup Hood & Modular FCU Span',
      nominalMm: 182,
    },
  ],
  p90: [
    {
      kind: 'overall_envelope',
      labelZh: 'FN P90 无托单兵自卫武器全枪总长',
      labelEn: 'FN P90 Bullpup PDW Overall Envelope Length',
      nominalMm: 504,
    },
    {
      kind: 'barrel_length',
      labelZh: '10.4" (264 mm) 5.7×28mm 八膛线冷锻枪管实长',
      labelEn: '10.4" (264 mm) 8-Groove 5.7x28mm CHF Barrel Length',
      nominalMm: 264,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '闭膛自由枪机配重块与双复进簧跨度',
      labelEn: 'Closed-Bolt Straight-Blowback Breechblock Span',
      nominalMm: 126,
    },
  ],
  python: [
    {
      kind: 'overall_envelope',
      labelZh: '柯尔特蟒蛇 6" 经典皇家烤蓝转轮手枪全长',
      labelEn: 'Colt Python 6" Royal Blue Revolver Overall Length',
      nominalMm: 292,
    },
    {
      kind: 'barrel_length',
      labelZh: '6" (152.4 mm) 散热肋条全长下配重锥度枪管实长',
      labelEn: '6" (152.4 mm) Ventilated-Rib Full-Underlug Barrel Length',
      nominalMm: 152.4,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '手工研配六发 .357 马格南摆出式弹巢跨度',
      labelEn: 'Hand-Fitted 6-Chamber .357 Magnum Swing-Out Cylinder Span',
      nominalMm: 41,
    },
  ],
  benellim4: [
    {
      kind: 'overall_envelope',
      labelZh: '伯奈利 M4 (M1014) 伸缩托展开全枪总长',
      labelEn: 'Benelli M4 (M1014) Collapsible-Stock Extended Length',
      nominalMm: 1010,
    },
    {
      kind: 'barrel_length',
      labelZh: '18.5" (470 mm) 12 号硬铬战术滑膛枪管实长',
      labelEn: '18.5" (470 mm) 12-Gauge Chrome Smoothbore Barrel Length',
      nominalMm: 470,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: 'ARGO 双活塞驱动双突笋回转枪机头跨度',
      labelEn: 'Dual-Piston ARGO Twin-Lug Rotating Bolt Head Span',
      nominalMm: 68,
    },
  ],
  garand: [
    {
      kind: 'overall_envelope',
      labelZh: '美国 M1 加兰德 .30-06 全枪包络总长',
      labelEn: 'U.S. Rifle M1 Garand .30-06 Overall Envelope Length',
      nominalMm: 1105,
    },
    {
      kind: 'barrel_length',
      labelZh: '24" (610 mm) 四右旋军用步枪管实长',
      labelEn: '24" (610 mm) 4-Groove Military Rifle Barrel Length',
      nominalMm: 610,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '长行程操作杆驱动双突笋回转枪机跨度',
      labelEn: 'Long-Stroke Op-Rod Twin-Lug Rotating Bolt Span',
      nominalMm: 94,
    },
  ],
  lift33: [
    {
      kind: 'overall_envelope',
      labelZh: 'Mathews LIFT 33 轮轴距 ATA（33" 标称）',
      labelEn: 'Mathews LIFT 33 Axle-to-Axle Span (33" ATA Nominal)',
      nominalMm: 838,
    },
    {
      kind: 'barrel_length',
      labelZh: '29" 拉距有效做功加速行程（571.5 mm）',
      labelEn: '29" Draw Effective Arrow Power-Stroke Span (571.5 mm)',
      nominalMm: 571.5,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '6.5" (165.1 mm) 弓弦至握把喉点弓档跨度',
      labelEn: '6.5" (165.1 mm) String-to-Grip Throat Brace Height',
      nominalMm: 165.1,
    },
  ],
  r500: [
    {
      kind: 'overall_envelope',
      labelZh: 'Ravin R500 无托螺旋凸轮弩全长（28" 标称）',
      labelEn: 'Ravin R500 Bullpup Crossbow Overall Length (28" Nominal)',
      nominalMm: 711,
    },
    {
      kind: 'barrel_length',
      labelZh: '15" (381 mm) 无导轨浮空箭道做功行程',
      labelEn: '15" (381 mm) Frictionless Flight-Track Power Stroke',
      nominalMm: 381,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '7.6" (193 mm) 未上弦双螺旋凸轮轴距宽度',
      labelEn: '7.6" (193 mm) Uncocked HexCoil Axle-to-Axle Cam Width',
      nominalMm: 193,
    },
  ],
  m249: [
    {
      kind: 'overall_envelope',
      labelZh: 'M249 全枪包络总长 (托底至消焰器)',
      labelEn: 'M249 Overall Envelope Length (Buttpad to Birdcage)',
      nominalMm: 1035,
    },
    {
      kind: 'barrel_length',
      labelZh: '18.3" 快拆镀铬枪管总成跨度',
      labelEn: '18.3" Quick-Change CHF Barrel Assembly Span',
      nominalMm: 465,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '双突笋 30° 回转闭锁枪机轴向跨度',
      labelEn: '2-Lug 30° Rotating Breech Bolt Axial Span',
      nominalMm: 78,
    },
  ],
  p08: [
    {
      kind: 'overall_envelope',
      labelZh: '鲁格 P08 全枪水平包络长度',
      labelEn: 'Luger P08 Overall Horizontal Envelope',
      nominalMm: 222,
    },
    {
      kind: 'barrel_length',
      labelZh: '4" (102mm) 锥形 9×19mm 枪管实长',
      labelEn: '4" (102mm) Tapered 9x19mm Barrel Span',
      nominalMm: 102,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '过死点双连杆肘节与矩形枪机闭锁链跨度',
      labelEn: 'Over-Center Knee-Toggle & Breechblock Lockup Train',
      nominalMm: 118,
    },
  ],
  vector: [
    {
      kind: 'overall_envelope',
      labelZh: 'Vector Gen II 展开全枪总长',
      labelEn: 'KRISS Vector Gen II Stock-Extended Overall Length',
      nominalMm: 617,
    },
    {
      kind: 'barrel_length',
      labelZh: '5.5" (140mm) 低膛轴线 .45 ACP 枪管跨度',
      labelEn: '5.5" (140mm) Low-Bore .45 ACP Barrel Span',
      nominalMm: 140,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: 'Super V -65° 钨钢下潜配重滑块对角包络',
      labelEn: 'Super V -65° Tungsten Counterweight Slider Span',
      nominalMm: 115,
    },
  ],
  g11: [
    {
      kind: 'overall_envelope',
      labelZh: 'G11 K2 无托全枪总长 (托底至消焰器)',
      labelEn: 'H&K G11 K2 Bullpup Overall Envelope Length',
      nominalMm: 750,
    },
    {
      kind: 'barrel_length',
      labelZh: '540mm 浮置冷锻 4.73mm 枪管跨度',
      labelEn: '540mm Floating Cold-Forged 4.73mm Barrel Span',
      nominalMm: 540,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '90° 旋转圆柱弹膛与钟表同步齿轮链跨度',
      labelEn: '90-Degree Rotary Breech & Clockwork Gear Train Span',
      nominalMm: 92,
    },
  ],
  vss: [
    {
      kind: 'overall_envelope',
      labelZh: 'VSS 温托雷兹整体微声步枪全长',
      labelEn: 'VSS Vintorez Integral Suppressed Overall Length',
      nominalMm: 894,
    },
    {
      kind: 'barrel_length',
      labelZh: '200mm 泄压孔线膛枪管跨度',
      labelEn: '200mm Ported Subsonic 9x39mm Barrel Span',
      nominalMm: 200,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '六对称闭锁突笋微声回转枪机轴向跨度',
      labelEn: '6-Lug Symmetric Rotating Bolt Axial Span',
      nominalMm: 76,
    },
  ],
  m134: [
    {
      kind: 'overall_envelope',
      labelZh: 'M134D 六管加特林机枪包络总长',
      labelEn: 'GE M134D Minigun 6-Barrel Overall Envelope Length',
      nominalMm: 804,
    },
    {
      kind: 'barrel_length',
      labelZh: '22" (558mm) 六联旋转冷锻枪管簇跨度',
      labelEn: '22" (558mm) 6-Barrel Rotary Cluster Span',
      nominalMm: 558,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '六槽中央旋转转子闭锁驱动跨度',
      labelEn: '6-Flute Central Rotor & Cam Lockup Span',
      nominalMm: 211,
    },
  ],
  an94: [
    {
      kind: 'overall_envelope',
      labelZh: 'AN-94 阿巴坎展开枪托全枪总长',
      labelEn: 'Nikonov AN-94 Abakan Stock-Extended Overall Length',
      nominalMm: 943,
    },
    {
      kind: 'barrel_length',
      labelZh: '405mm 浮置 5.45×39mm 镀铬枪管跨度',
      labelEn: '405mm Floating Chrome-Lined 5.45x39mm Barrel Span',
      nominalMm: 405,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '双突笋回转枪机与滑轮钢索机框闭锁跨度',
      labelEn: '2-Lug Rotating Bolt & Pulley-Carrier Assembly Span',
      nominalMm: 162,
    },
  ],
  ztz99a: [
    {
      kind: 'overall_envelope',
      labelZh: 'ZTZ-99A 全车包络总长 (车尾至 125mm 炮口)',
      labelEn: 'ZTZ-99A Overall Envelope Length (Rear Hull to 125mm Muzzle)',
      nominalMm: 10900,
    },
    {
      kind: 'barrel_length',
      labelZh: '125mm ZPT-98 L/50 镀铬滑膛主炮管实长',
      labelEn: '125mm ZPT-98 L/50 Smoothbore Main Gun Tube Span',
      nominalMm: 6250,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '立式半自动楔形炮尾闭锁机构跨度',
      labelEn: 'Vertical Sliding-Wedge Main Gun Breech Block Span',
      nominalMm: 780,
    },
  ],
  m1a2: [
    {
      kind: 'overall_envelope',
      labelZh: 'M1A2 SEP v3 全车包络总长 (车尾至 120mm 炮口)',
      labelEn: 'M1A2 SEP v3 Overall Envelope Length (Rear Deck to 120mm Muzzle)',
      nominalMm: 9770,
    },
    {
      kind: 'barrel_length',
      labelZh: '120mm L/44 M256 镀铬滑膛主炮管实长',
      labelEn: '120mm L/44 M256 Smoothbore Main Gun Tube Span',
      nominalMm: 5280,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: 'M256 立式楔形炮闩与膛尾承压块跨度',
      labelEn: 'M256 Vertical Sliding-Wedge Breech Block Span',
      nominalMm: 740,
    },
  ],
  leopard2a7: [
    {
      kind: 'overall_envelope',
      labelZh: '豹 2A7V 全车包络总长 (车尾至 L/55A1 炮口)',
      labelEn: 'Leopard 2A7V Overall Envelope Length (Rear Hull to L/55A1 Muzzle)',
      nominalMm: 10970,
    },
    {
      kind: 'barrel_length',
      labelZh: '120mm Rh-120 L/55A1 高压加长滑膛炮管实长',
      labelEn: '120mm Rh-120 L/55A1 Extended Smoothbore Gun Tube Span',
      nominalMm: 6600,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: 'Rh-120 立楔闭锁炮尾与同轴驻退机构跨度',
      labelEn: 'Rh-120 Vertical Wedge Breech Block Assembly Span',
      nominalMm: 760,
    },
  ],
  tiger1: [
    {
      kind: 'overall_envelope',
      labelZh: '虎式 131 全车包络总长 (车尾至 88mm 制退器)',
      labelEn: 'Tiger 131 Overall Envelope Length (Rear Hull to 88mm Muzzle Brake)',
      nominalMm: 8450,
    },
    {
      kind: 'barrel_length',
      labelZh: '88mm KwK 36 L/56 线膛炮管含双室制退器跨度',
      labelEn: '88mm KwK 36 L/56 Rifled Main Gun Tube Span',
      nominalMm: 4930,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '克虏伯半自动水平楔式炮闩与炮尾环跨度',
      labelEn: 'Krupp Semi-Automatic Horizontal Sliding-Wedge Breech Span',
      nominalMm: 720,
    },
  ],
  winchester1894: [
    {
      kind: 'overall_envelope',
      labelZh: '温彻斯特 M1894 骑兵卡宾枪全长',
      labelEn: 'Winchester 1894 Cavalry Carbine Overall Length',
      nominalMm: 949,
    },
    {
      kind: 'barrel_length',
      labelZh: '20 英寸 .30-30 WCF 锥形枪管实长',
      labelEn: '20" .30-30 WCF Tapered Round Barrel Length',
      nominalMm: 508,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '勃朗宁 H 型垂直升降闭锁块高度跨度',
      labelEn: 'Browning Vertical H-Locking Block Travel Height',
      nominalMm: 34,
    },
  ],
  rem870: [
    {
      kind: 'overall_envelope',
      labelZh: '雷明顿 870 Police Magnum 全枪包络总长',
      labelEn: 'Remington 870 Police Magnum Overall Length',
      nominalMm: 978,
    },
    {
      kind: 'barrel_length',
      labelZh: '18 英寸锰磷化厚壁滑膛枪管实长',
      labelEn: '18" Heavy-Wall Parkerized Smoothbore Barrel Length',
      nominalMm: 457,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: 'Model 870 硬铬枪机与上翘楔形闭锁块跨度',
      labelEn: 'Model 870 Hard-Chrome Bolt & Locking Wedge Span',
      nominalMm: 82,
    },
  ],
  m1911: [
    {
      kind: 'overall_envelope',
      labelZh: '柯尔特 M1911A1 全枪水平包络总长',
      labelEn: 'Colt M1911A1 Overall Horizontal Envelope',
      nominalMm: 216,
    },
    {
      kind: 'barrel_length',
      labelZh: '5.03" (127.8mm) .45 ACP 双闭锁筋枪管实长',
      labelEn: '5.03" (127.8mm) .45 ACP Dual-Rib Barrel Span',
      nominalMm: 128,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '勃朗宁 0.278" 单绞链与套筒闭锁行程跨度',
      labelEn: 'Browning 0.278" Swinging Link & Slide Recoil Span',
      nominalMm: 191,
    },
  ],
  mg42: [
    {
      kind: 'overall_envelope',
      labelZh: 'MG 42 通用机枪含助退器全长',
      labelEn: 'MG 42 Overall Length (w/ Recoil Booster)',
      nominalMm: 1220,
    },
    {
      kind: 'barrel_length',
      labelZh: '530 mm 7.92×57mm 快拆线膛枪管实长',
      labelEn: '530 mm Quick-Change 7.92mm Barrel Length',
      nominalMm: 530,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '对称双滚柱张开闭锁跨度（含滚柱机头）',
      labelEn: 'Symmetric Twin Locking Rollers Span',
      nominalMm: 27,
    },
  ],
  k98k: [
    {
      kind: 'overall_envelope',
      labelZh: '毛瑟 Karabiner 98k 全枪包络总长',
      labelEn: 'Mauser Karabiner 98k Overall Length',
      nominalMm: 1110,
    },
    {
      kind: 'barrel_length',
      labelZh: '600 mm 阶梯四膛线军用枪管实长',
      labelEn: '600 mm Stepped 4-Groove Military Barrel Length',
      nominalMm: 600,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '毛瑟 98 三突笋旋转枪机体全长跨度',
      labelEn: 'Mauser 98 3-Lug Rotating Bolt Body Span',
      nominalMm: 143,
    },
  ],
  thompson: [
    {
      kind: 'overall_envelope',
      labelZh: '汤姆逊 M1928A1 含卡茨防跳器与木托全长',
      labelEn: 'Thompson M1928A1 Overall Length (w/ Cutts & Stock)',
      nominalMm: 852,
    },
    {
      kind: 'barrel_length',
      labelZh: '10.5 英寸 28 道散热鳍枪管实长',
      labelEn: '10.5" 28-Fin Cooled Barrel Length',
      nominalMm: 267,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '50 发 L 型发条螺旋圆鼓外径',
      labelEn: '50-Round Type L Clockwork Drum Outer Diameter',
      nominalMm: 165,
    },
  ],
  gau8: [
    {
      kind: 'overall_envelope',
      labelZh: 'GAU-8/A 全系统总长（螺旋弹鼓尾盖至穿孔炮口箍）',
      labelEn: 'GAU-8/A Complete System Overall Length (Drum Aft to Muzzle Clamp)',
      nominalMm: 6058,
    },
    {
      kind: 'barrel_length',
      labelZh: '七管 90.5" (2,300mm) 冷锻 30mm 旋转炮管簇跨度',
      labelEn: '7-Barrel 90.5" (2,300mm) 30x173mm Rotary Barrel Cluster Span',
      nominalMm: 2300,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '七槽星形中心转子与 360° 螺旋凸轮闭锁核心跨度',
      labelEn: '7-Flute Central Star-Rotor & 360° Cam Track Lockup Span',
      nominalMm: 1118,
    },
  ],
};

export interface CaliperSurfacePoint {
  partId: string;
  pos: readonly [number, number, number];
  normal: readonly [number, number, number];
}

export interface CaliperMeasurement {
  distanceCm: number;
  distanceMm: number;
  dxMm: number;
  dyMm: number;
  dzMm: number;
  midpoint: readonly [number, number, number];
}

export interface WeaponEnvelopeMetrics {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  center: readonly [number, number, number];
  lengthMm: number;
  heightMm: number;
  widthMm: number;
}

export function getCaliperBenchmarkNote(
  weaponId: WeaponId,
  kind: CaliperBenchmarkKind
): CaliperBenchmarkPresetNote {
  const list = CALIPER_V2_BENCHMARK_NOTES[weaponId];
  return list.find((n) => n.kind === kind) ?? list[0];
}

export interface CaliperSnapshot {
  weaponId: WeaponId;
  unitSystem: CaliperUnitSystem;
  pointA: CaliperSurfacePoint | null;
  pointB: CaliperSurfacePoint | null;
  measurement: CaliperMeasurement | null;
  activeBenchmark: CaliperBenchmarkKind | null;
  seq: number;
}

export interface CaliperTransientHover {
  active: boolean;
  partId: string | null;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Pure millimeter metrology computation from two 3D CAD coordinates (`1 unit = 1 cm`).
 */
export function computeCaliperMeasurement(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): CaliperMeasurement {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const distanceCm = Math.hypot(dx, dy, dz);
  return {
    distanceCm,
    distanceMm: distanceCm * WORLD_UNIT_TO_MM,
    dxMm: Math.abs(dx) * WORLD_UNIT_TO_MM,
    dyMm: Math.abs(dy) * WORLD_UNIT_TO_MM,
    dzMm: Math.abs(dz) * WORLD_UNIT_TO_MM,
    midpoint: [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5],
  };
}

function rotateLocalPointEulerXYZ(
  lx: number,
  ly: number,
  lz: number,
  rx: number,
  ry: number,
  rz: number,
  out: [number, number, number]
): void {
  // Three.js default Euler 'XYZ': R = Rx * Ry * Rz
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const x1 = lx * cz - ly * sz;
  const y1 = lx * sz + ly * cz;
  const z1 = lz;

  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x2 = x1 * cy + z1 * sy;
  const y2 = y1;
  const z2 = -x1 * sy + z1 * cy;

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  out[0] = x2;
  out[1] = y2 * cx - z2 * sx;
  out[2] = y2 * sx + z2 * cx;
}

const _cornerPt: [number, number, number] = [0, 0, 0];

function expandBoundsForPart(
  geo: THREE.BufferGeometry,
  pose: Readonly<MutablePartPose>,
  bounds: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
    valid: boolean;
  }
): void {
  if (!geo.boundingBox) {
    geo.computeBoundingBox();
  }
  const bb = geo.boundingBox;
  if (!bb) return;

  const xs = [bb.min.x * pose.sx, bb.max.x * pose.sx];
  const ys = [bb.min.y, bb.max.y];
  const zs = [bb.min.z, bb.max.z];

  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        rotateLocalPointEulerXYZ(
          xs[ix],
          ys[iy],
          zs[iz],
          pose.rx,
          pose.ry,
          pose.rz,
          _cornerPt
        );
        const wx = pose.px + _cornerPt[0];
        const wy = pose.py + _cornerPt[1];
        const wz = pose.pz + _cornerPt[2];
        if (!Number.isFinite(wx) || !Number.isFinite(wy) || !Number.isFinite(wz)) {
          continue;
        }
        if (wx < bounds.minX) bounds.minX = wx;
        if (wy < bounds.minY) bounds.minY = wy;
        if (wz < bounds.minZ) bounds.minZ = wz;
        if (wx > bounds.maxX) bounds.maxX = wx;
        if (wy > bounds.maxY) bounds.maxY = wy;
        if (wz > bounds.maxZ) bounds.maxZ = wz;
        bounds.valid = true;
      }
    }
  }
}

/**
 * Computes exact 1:1 world-space bounding envelope (`mm`) across the provided weapon parts.
 */
export function computeWeaponEnvelopeMetrics(
  parts: readonly WeaponPartSpec[],
  getGeometry: (partId: string) => THREE.BufferGeometry | null,
  evaluatePose: (part: WeaponPartSpec, out: MutablePartPose) => MutablePartPose,
  scratchPose: MutablePartPose
): WeaponEnvelopeMetrics | null {
  const acc = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
    valid: false,
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const geo = getGeometry(part.id);
    if (!geo) continue;
    evaluatePose(part, scratchPose);
    expandBoundsForPart(geo, scratchPose, acc);
  }

  if (!acc.valid) return null;

  return {
    min: [acc.minX, acc.minY, acc.minZ],
    max: [acc.maxX, acc.maxY, acc.maxZ],
    center: [
      (acc.minX + acc.maxX) * 0.5,
      (acc.minY + acc.maxY) * 0.5,
      (acc.minZ + acc.maxZ) * 0.5,
    ],
    lengthMm: (acc.maxX - acc.minX) * WORLD_UNIT_TO_MM,
    heightMm: (acc.maxY - acc.minY) * WORLD_UNIT_TO_MM,
    widthMm: (acc.maxZ - acc.minZ) * WORLD_UNIT_TO_MM,
  };
}

function findBenchmarkTargetPart(
  parts: readonly WeaponPartSpec[],
  kind: Exclude<CaliperBenchmarkKind, 'overall_envelope'>
): WeaponPartSpec | null {
  if (kind === 'barrel_length') {
    return (
      parts.find(
        (p) => p.id === 'm134_barrel_cluster' || p.id === 'gau8_barrel_cluster'
      ) ??
      parts.find((p) => /(?:^|_)(?:barrel|main_gun)$/.test(p.id)) ??
      parts.find((p) => /barrel/.test(p.id) && !/spring|lock|cross|clamp/.test(p.id)) ??
      parts.find((p) => p.id === 'lift33_arrow_shaft' || p.id === 'r500_flight_rail') ??
      null
    );
  }
  // bolt_lug_span: prefer rotating/locking bolt head (or tank main gun breech block / revolver cylinder / P08 toggle / Super V slider / M134/GAU-8 rotor), else slide
  return (
    parts.find(
      (p) =>
        p.id === 'python_cylinder' ||
        p.id === 'vector_slider' ||
        p.id === 'm134_rotor_assembly' ||
        p.id === 'gau8_rotor_core'
    ) ??
    parts.find(
      (p) =>
        /(?:^|_)(?:bolt|bolt_head|bolt_body|breechblock|breech_block)$/.test(
          p.id
        ) && !/cylinder_bolt/.test(p.id)
    ) ??
    parts.find((p) => /(?:^|_)slide$/.test(p.id)) ??
    parts.find((p) => p.id === 'lift33_riser' || p.id === 'r500_cam_axles') ??
    parts[0] ??
    null
  );
}

class CaliperRuntimeController {
  private weaponId: WeaponId = 'ak15';
  private unitSystem: CaliperUnitSystem = 'mm';
  private pointA: CaliperSurfacePoint | null = null;
  private pointB: CaliperSurfacePoint | null = null;
  private activeBenchmark: CaliperBenchmarkKind | null = null;
  private seq = 0;

  private readonly hoverState: CaliperTransientHover = {
    active: false,
    partId: null,
    x: 0,
    y: 0,
    z: 0,
    nx: 0,
    ny: 1,
    nz: 0,
  };

  private snapshot: CaliperSnapshot;
  private listeners = new Set<() => void>();

  constructor() {
    this.snapshot = this.buildSnapshot();
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): CaliperSnapshot => this.snapshot;

  private emit(): void {
    this.seq += 1;
    this.snapshot = this.buildSnapshot();
    for (const fn of this.listeners) {
      fn();
    }
  }

  private buildSnapshot(): CaliperSnapshot {
    const measurement =
      this.pointA && this.pointB
        ? computeCaliperMeasurement(this.pointA.pos, this.pointB.pos)
        : null;
    return {
      weaponId: this.weaponId,
      unitSystem: this.unitSystem,
      pointA: this.pointA,
      pointB: this.pointB,
      measurement,
      activeBenchmark: this.activeBenchmark,
      seq: this.seq,
    };
  }

  public getUnitSystem(): CaliperUnitSystem {
    return this.unitSystem;
  }

  public setUnitSystem(unit: CaliperUnitSystem): void {
    if (this.unitSystem === unit) return;
    this.unitSystem = unit;
    playWorkbenchFoley('toggle_switch');
    this.emit();
  }

  public toggleUnitSystem(): void {
    this.setUnitSystem(this.unitSystem === 'mm' ? 'in' : 'mm');
  }

  public syncWeapon(weaponId: WeaponId, clearOnSwitch = true): void {
    if (this.weaponId === weaponId) return;
    this.weaponId = weaponId;
    if (clearOnSwitch) {
      this.pointA = null;
      this.pointB = null;
      this.activeBenchmark = null;
      this.clearTransientHover();
    }
    this.emit();
  }

  public clearPoints(): void {
    if (
      this.pointA === null &&
      this.pointB === null &&
      this.activeBenchmark === null
    ) {
      return;
    }
    this.pointA = null;
    this.pointB = null;
    this.activeBenchmark = null;
    playWorkbenchFoley('toggle_switch');
    this.emit();
  }

  /**
   * Zero-GC 60fps surface hover update (never triggers React state re-renders).
   */
  public setTransientHover(
    partId: string,
    x: number,
    y: number,
    z: number,
    nx = 0,
    ny = 1,
    nz = 0
  ): void {
    this.hoverState.active = true;
    this.hoverState.partId = partId;
    this.hoverState.x = x;
    this.hoverState.y = y;
    this.hoverState.z = z;
    this.hoverState.nx = nx;
    this.hoverState.ny = ny;
    this.hoverState.nz = nz;
  }

  public clearTransientHover(matchingPartId?: string): void {
    if (matchingPartId && this.hoverState.partId !== matchingPartId) {
      return;
    }
    this.hoverState.active = false;
    this.hoverState.partId = null;
  }

  public getTransientHover(): Readonly<CaliperTransientHover> {
    return this.hoverState;
  }

  /**
   * Records a 3D surface click:
   * - 1st click sets Jaw A
   * - 2nd click locks Jaw B and computes exact millimeter span
   * - 3rd click starts a fresh Jaw A measurement
   */
  public recordSurfacePoint(
    weaponId: WeaponId,
    partId: string,
    pos: readonly [number, number, number],
    normal: readonly [number, number, number] = [0, 1, 0]
  ): void {
    if (this.weaponId !== weaponId) {
      this.weaponId = weaponId;
      this.pointA = null;
      this.pointB = null;
    }

    const pt: CaliperSurfacePoint = {
      partId,
      pos: [pos[0], pos[1], pos[2]],
      normal: [normal[0], normal[1], normal[2]],
    };

    this.activeBenchmark = null;
    if (this.pointA === null || this.pointB !== null) {
      this.pointA = pt;
      this.pointB = null;
      playWorkbenchFoley('part_select');
    } else {
      this.pointB = pt;
      playWorkbenchFoley('preset_detent');
    }
    this.emit();
  }

  /**
   * Snaps caliper jaws onto exact CAD datum extremes for 1-click verification
   * (overall weapon length, barrel bore length, or bolt/slide longitudinal span).
   */
  public applyBenchmarkPreset(
    weaponId: WeaponId,
    kind: CaliperBenchmarkKind,
    parts: readonly WeaponPartSpec[],
    getGeometry: (partId: string) => THREE.BufferGeometry | null,
    evaluatePose: (
      part: WeaponPartSpec,
      out: MutablePartPose
    ) => MutablePartPose,
    scratchPose: MutablePartPose
  ): boolean {
    this.weaponId = weaponId;

    // Dedicated 1:1 archery benchmarks:
    // - lift33: Axle-to-Axle (830mm Y), Power-Stroke/Arrow Span (X), Brace Height (string->grip X)
    // - r500: Overall Length (X), Flight Track Power Stroke (X), Axle-to-Axle Cam Width (Z)
    if ((weaponId as string) === 'lift33') {
      const findPart = (id: string) => parts.find((p) => p.id === id);
      if (kind === 'overall_envelope') {
        const up = findPart('lift33_upper_cam');
        const lo = findPart('lift33_lower_cam');
        if (up && lo) {
          const uEnv = computeWeaponEnvelopeMetrics([up], getGeometry, evaluatePose, scratchPose);
          const lEnv = computeWeaponEnvelopeMetrics([lo], getGeometry, evaluatePose, scratchPose);
          if (uEnv && lEnv) {
            this.pointA = {
              partId: lo.id,
              pos: [lEnv.center[0], lEnv.center[1], lEnv.center[2]],
              normal: [0, -1, 0],
            };
            this.pointB = {
              partId: up.id,
              pos: [uEnv.center[0], uEnv.center[1], uEnv.center[2]],
              normal: [0, 1, 0],
            };
            this.activeBenchmark = kind;
            playWorkbenchFoley('preset_detent');
            this.emit();
            return true;
          }
        }
      } else if (kind === 'bolt_lug_span') {
        const str = findPart('lift33_bowstring');
        const grip = findPart('lift33_grip');
        if (str && grip) {
          const sEnv = computeWeaponEnvelopeMetrics([str], getGeometry, evaluatePose, scratchPose);
          const gEnv = computeWeaponEnvelopeMetrics([grip], getGeometry, evaluatePose, scratchPose);
          if (sEnv && gEnv) {
            this.pointA = {
              partId: str.id,
              pos: [sEnv.center[0], gEnv.center[1], 0],
              normal: [-1, 0, 0],
            };
            this.pointB = {
              partId: grip.id,
              pos: [gEnv.center[0], gEnv.center[1], 0],
              normal: [1, 0, 0],
            };
            this.activeBenchmark = kind;
            playWorkbenchFoley('preset_detent');
            this.emit();
            return true;
          }
        }
      }
    } else if ((weaponId as string) === 'r500') {
      const findPart = (id: string) => parts.find((p) => p.id === id);
      if (kind === 'bolt_lug_span') {
        const lc = findPart('r500_left_cam');
        const rc = findPart('r500_right_cam');
        if (lc && rc) {
          const lEnv = computeWeaponEnvelopeMetrics([lc], getGeometry, evaluatePose, scratchPose);
          const rEnv = computeWeaponEnvelopeMetrics([rc], getGeometry, evaluatePose, scratchPose);
          if (lEnv && rEnv) {
            this.pointA = {
              partId: lc.id,
              pos: [lEnv.center[0], lEnv.center[1], lEnv.center[2]],
              normal: [0, 0, -1],
            };
            this.pointB = {
              partId: rc.id,
              pos: [rEnv.center[0], rEnv.center[1], rEnv.center[2]],
              normal: [0, 0, 1],
            };
            this.activeBenchmark = kind;
            playWorkbenchFoley('preset_detent');
            this.emit();
            return true;
          }
        }
      }
    } else if (weaponId === 'p08' && kind === 'bolt_lug_span') {
      const toggleParts = parts.filter(
        (p) =>
          p.id === 'p08_breechblock' ||
          p.id === 'p08_front_toggle' ||
          p.id === 'p08_rear_toggle'
      );
      if (toggleParts.length >= 2) {
        const tEnv = computeWeaponEnvelopeMetrics(
          toggleParts,
          getGeometry,
          evaluatePose,
          scratchPose
        );
        if (tEnv) {
          this.pointA = {
            partId: 'p08_rear_toggle',
            pos: [tEnv.min[0], tEnv.center[1], 0],
            normal: [-1, 0, 0],
          };
          this.pointB = {
            partId: 'p08_breechblock',
            pos: [tEnv.max[0], tEnv.center[1], 0],
            normal: [1, 0, 0],
          };
          this.activeBenchmark = kind;
          playWorkbenchFoley('preset_detent');
          this.emit();
          return true;
        }
      }
    } else if (weaponId === 'vector' && kind === 'bolt_lug_span') {
      const sliderPart = parts.find((p) => p.id === 'vector_slider');
      if (sliderPart) {
        const sEnv = computeWeaponEnvelopeMetrics(
          [sliderPart],
          getGeometry,
          evaluatePose,
          scratchPose
        );
        if (sEnv) {
          this.pointA = {
            partId: sliderPart.id,
            pos: [sEnv.min[0], sEnv.min[1], 0],
            normal: [-0.4226, -0.9063, 0],
          };
          this.pointB = {
            partId: sliderPart.id,
            pos: [sEnv.max[0], sEnv.max[1], 0],
            normal: [0.4226, 0.9063, 0],
          };
          this.activeBenchmark = kind;
          playWorkbenchFoley('preset_detent');
          this.emit();
          return true;
        }
      }
    } else if (weaponId === 'g11' && kind === 'bolt_lug_span') {
      const clockworkParts = parts.filter(
        (p) => p.id === 'g11_rotary_breech' || p.id === 'g11_clockwork_gears'
      );
      if (clockworkParts.length >= 2) {
        const cEnv = computeWeaponEnvelopeMetrics(
          clockworkParts,
          getGeometry,
          evaluatePose,
          scratchPose
        );
        if (cEnv) {
          this.pointA = {
            partId: 'g11_rotary_breech',
            pos: [cEnv.min[0], cEnv.center[1], 0],
            normal: [-1, 0, 0],
          };
          this.pointB = {
            partId: 'g11_clockwork_gears',
            pos: [cEnv.max[0], cEnv.center[1], 0],
            normal: [1, 0, 0],
          };
          this.activeBenchmark = kind;
          playWorkbenchFoley('preset_detent');
          this.emit();
          return true;
        }
      }
    } else if (weaponId === 'an94' && kind === 'bolt_lug_span') {
      const anBoltParts = parts.filter(
        (p) => p.id === 'an94_bolt_carrier' || p.id === 'an94_bolt'
      );
      if (anBoltParts.length >= 2) {
        const aEnv = computeWeaponEnvelopeMetrics(
          anBoltParts,
          getGeometry,
          evaluatePose,
          scratchPose
        );
        if (aEnv) {
          this.pointA = {
            partId: 'an94_bolt_carrier',
            pos: [aEnv.min[0], aEnv.center[1], 0],
            normal: [-1, 0, 0],
          };
          this.pointB = {
            partId: 'an94_bolt',
            pos: [aEnv.max[0], aEnv.center[1], 0],
            normal: [1, 0, 0],
          };
          this.activeBenchmark = kind;
          playWorkbenchFoley('preset_detent');
          this.emit();
          return true;
        }
      }
    }

    if (kind === 'overall_envelope') {
      const env = computeWeaponEnvelopeMetrics(
        parts,
        getGeometry,
        evaluatePose,
        scratchPose
      );
      if (!env) return false;
      const rearPart =
        parts.find(
          (p) =>
            p.id === 'm249_buttstock' ||
            p.id === 'p08_frame' ||
            p.id === 'vector_folding_stock' ||
            p.id === 'm134_spade_grip' ||
            /(?:buttstock|buttplate|walnut_stock|wood_stock|stock)$/.test(p.id)
        )?.id ??
        parts[parts.length - 1]?.id ??
        'receiver';
      const frontPart =
        parts.find(
          (p) =>
            p.id === 'vector_muzzle_device' ||
            p.id === 'g11_flash_hider' ||
            p.id === 'vss_suppressor_tube' ||
            p.id === 'm134_flash_suppressor' ||
            p.id === 'an94_muzzle_brake'
        )?.id ??
        findBenchmarkTargetPart(parts, 'barrel_length')?.id ??
        parts[0]?.id ??
        'muzzle';
      this.pointA = {
        partId: rearPart,
        pos: [env.min[0], env.center[1], 0],
        normal: [-1, 0, 0],
      };
      this.pointB = {
        partId: frontPart,
        pos: [env.max[0], env.center[1], 0],
        normal: [1, 0, 0],
      };
      this.activeBenchmark = kind;
      playWorkbenchFoley('preset_detent');
      this.emit();
      return true;
    }

    const targetPart = findBenchmarkTargetPart(parts, kind);
    if (!targetPart) return false;
    const geo = getGeometry(targetPart.id);
    if (!geo) return false;

    const singleEnv = computeWeaponEnvelopeMetrics(
      [targetPart],
      getGeometry,
      evaluatePose,
      scratchPose
    );
    if (!singleEnv) return false;

    this.pointA = {
      partId: targetPart.id,
      pos: [singleEnv.min[0], singleEnv.center[1], singleEnv.center[2]],
      normal: [-1, 0, 0],
    };
    this.pointB = {
      partId: targetPart.id,
      pos: [singleEnv.max[0], singleEnv.center[1], singleEnv.center[2]],
      normal: [1, 0, 0],
    };
    this.activeBenchmark = kind;
    playWorkbenchFoley('preset_detent');
    this.emit();
    return true;
  }
}

export const caliperStore = new CaliperRuntimeController();
