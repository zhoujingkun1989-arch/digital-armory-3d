import { getCaliberBallisticsSpec } from '../../engine/physics/armoryPhysics';
import type { LanguageCode } from '../../narration/types';
import { buildCentennialScaleWallMetrology } from '../../weapons/expansion/centennialProjectors';
import { getWeaponManifest, WEAPON_MANIFESTS } from '../../weapons/manifests';
import type { ArmoryWeaponItem, WeaponId } from '../../weapons/types';

export type ScaleWallCategory = ArmoryWeaponItem['category'];

export type ScaleUnitSystem = 'metric' | 'imperial';
export type ScaleReferenceSilhouette = 'none' | 'human' | 'hand';
export type ScaleBarMode = 'log' | 'linear';
export type ScaleWallPresetId =
  | 'full_spectrum'
  | 'pistols_micro'
  | 'wwii_titans'
  | 'heavy_firepower'
  | 'cold_war_wonders';

export const HUMAN_REFERENCE_MM = 1750;
export const HAND_REFERENCE_MM = 190;
export const SCALE_WALL_MIN_EXHIBITS = 2;
export const SCALE_WALL_MAX_EXHIBITS = 6;

const MM_PER_INCH = 25.4;
const MM_PER_FOOT = 304.8;
const LB_PER_KG = 2.2046226218;
const SHORT_TON_KG = 907.18474;
const FT_LB_PER_JOULE = 0.7375621493;

const CATEGORY_ACCENT: Readonly<Record<ScaleWallCategory, string>> = {
  rifle: '#38bdf8',
  lmg: '#f59e0b',
  smg: '#a78bfa',
  sniper: '#f43f5e',
  shotgun: '#fb923c',
  pistol: '#34d399',
  archery: '#2dd4bf',
  armor: '#eab308',
  ordnance: '#f97316',
};

interface ExactExhibitMetrology {
  oalMm: number;
  secondaryMm?: number;
  massKg: number;
  muzzleEnergyJ?: number;
  eraYear: number;
  caliberEn: string;
  caliberZh: string;
}

/**
 * Authoritative 1:1 metrology across all 34 Digital Armory exhibits,
 * cross-checked against `src/weapons/manifests.ts`, `historyTimelineSpecs.ts`,
 * and `armoryPhysics.ts`.
 */
const EXACT_EXHIBIT_METROLOGY: Readonly<Record<WeaponId, ExactExhibitMetrology>> =
  {
    ak15: {
      oalMm: 940,
      secondaryMm: 690,
      massKg: 3.5,
      eraYear: 2023,
      caliberEn: '7.62x39mm M43',
      caliberZh: '7.62×39mm M43',
    },
    m4a1: {
      oalMm: 838,
      secondaryMm: 757,
      massKg: 2.92,
      eraYear: 1994,
      caliberEn: '5.56x45mm NATO',
      caliberZh: '5.56×45mm NATO',
    },
    mp5: {
      oalMm: 700,
      secondaryMm: 550,
      massKg: 3.08,
      eraYear: 1966,
      caliberEn: '9x19mm Parabellum',
      caliberZh: '9×19mm 帕拉贝鲁姆',
    },
    g17: {
      oalMm: 204,
      massKg: 0.625,
      eraYear: 1982,
      caliberEn: '9x19mm Parabellum',
      caliberZh: '9×19mm 帕拉贝鲁姆',
    },
    m82a1: {
      oalMm: 1448,
      massKg: 13.5,
      eraYear: 1982,
      caliberEn: '.50 BMG (12.7x99mm)',
      caliberZh: '.50 BMG (12.7×99mm)',
    },
    awm: {
      oalMm: 1230,
      secondaryMm: 990,
      massKg: 6.9,
      eraYear: 1996,
      caliberEn: '.338 Lapua Magnum',
      caliberZh: '.338 拉普阿马格南',
    },
    scar: {
      oalMm: 889,
      secondaryMm: 635,
      massKg: 3.29,
      eraYear: 2004,
      caliberEn: '5.56x45mm NATO',
      caliberZh: '5.56×45mm NATO',
    },
    deagle: {
      oalMm: 273,
      massKg: 1.998,
      eraYear: 1983,
      caliberEn: '.50 Action Express',
      caliberZh: '.50 AE 马格南',
    },
    aug: {
      oalMm: 790,
      massKg: 3.6,
      eraYear: 1977,
      caliberEn: '5.56x45mm NATO',
      caliberZh: '5.56×45mm NATO',
    },
    p320: {
      oalMm: 203,
      massKg: 0.833,
      eraYear: 2014,
      caliberEn: '9x19mm Parabellum',
      caliberZh: '9×19mm 帕拉贝鲁姆',
    },
    p90: {
      oalMm: 504,
      massKg: 2.6,
      eraYear: 1990,
      caliberEn: '5.7x28mm FN SS190',
      caliberZh: '5.7×28mm FN SS190',
    },
    lift33: {
      oalMm: 838,
      massKg: 1.79,
      muzzleEnergyJ: 145.6,
      eraYear: 2024,
      caliberEn: '400 gr Carbon Arrow (348 FPS)',
      caliberZh: '400 gr 碳纤维猎箭 (348 FPS)',
    },
    r500: {
      oalMm: 711,
      massKg: 3.81,
      muzzleEnergyJ: 301.0,
      eraYear: 2022,
      caliberEn: '400 gr Carbon Bolt (500 FPS)',
      caliberZh: '400 gr 碳素弩箭 (500 FPS)',
    },
    python: {
      oalMm: 292,
      massKg: 1.23,
      eraYear: 1955,
      caliberEn: '.357 Magnum',
      caliberZh: '.357 马格南',
    },
    benellim4: {
      oalMm: 1010,
      secondaryMm: 886,
      massKg: 3.82,
      eraYear: 1999,
      caliberEn: '12 Gauge (18.5x70mm)',
      caliberZh: '12 号霰弹 (18.5×70mm)',
    },
    garand: {
      oalMm: 1105,
      massKg: 4.31,
      eraYear: 1936,
      caliberEn: '.30-06 Springfield',
      caliberZh: '.30-06 斯普林菲尔德',
    },
    m249: {
      oalMm: 1035,
      massKg: 7.5,
      eraYear: 1984,
      caliberEn: '5.56x45mm NATO (M27 Belt)',
      caliberZh: '5.56×45mm NATO (M27 弹链)',
    },
    p08: {
      oalMm: 222,
      massKg: 0.87,
      eraYear: 1900,
      caliberEn: '9x19mm Parabellum',
      caliberZh: '9×19mm 帕拉贝鲁姆',
    },
    vector: {
      oalMm: 617,
      secondaryMm: 406,
      massKg: 2.7,
      eraYear: 2009,
      caliberEn: '.45 ACP (11.43x23mm)',
      caliberZh: '.45 ACP (11.43×23mm)',
    },
    g11: {
      oalMm: 750,
      massKg: 3.6,
      eraYear: 1990,
      caliberEn: '4.73x33mm DM11 Caseless',
      caliberZh: '4.73×33mm DM11 无壳弹',
    },
    vss: {
      oalMm: 894,
      massKg: 2.6,
      eraYear: 1987,
      caliberEn: '9x39mm SP-5 / SP-6 Subsonic',
      caliberZh: '9×39mm SP-5 / SP-6 亚音速弹',
    },
    m134: {
      oalMm: 802,
      massKg: 30.8,
      eraYear: 1963,
      caliberEn: '7.62x51mm NATO (M13 Belt)',
      caliberZh: '7.62×51mm NATO (M13 弹链)',
    },
    an94: {
      oalMm: 943,
      secondaryMm: 728,
      massKg: 3.85,
      eraYear: 1994,
      caliberEn: '5.45x39mm (7N6 / 7N10)',
      caliberZh: '5.45×39mm (7N6 / 7N10)',
    },
    ztz99a: {
      oalMm: 10900,
      secondaryMm: 7600,
      massKg: 55000,
      muzzleEnergyJ: 7604160,
      eraYear: 2011,
      caliberEn: '125mm ZPT-98 (DTC10-125 APFSDS)',
      caliberZh: '125mm ZPT-98 (DTC10-125 穿甲弹)',
    },
    m1a2: {
      oalMm: 9770,
      secondaryMm: 7930,
      massKg: 66800,
      muzzleEnergyJ: 6414470,
      eraYear: 2017,
      caliberEn: '120x570mm NATO (M829A4 APFSDS)',
      caliberZh: '120×570mm NATO (M829A4 贫铀弹)',
    },
    leopard2a7: {
      oalMm: 10970,
      secondaryMm: 7700,
      massKg: 66500,
      muzzleEnergyJ: 7043750,
      eraYear: 2019,
      caliberEn: '120x570mm NATO (DM63A1 APFSDS)',
      caliberZh: '120×570mm NATO (DM63A1 穿甲弹)',
    },
    tiger1: {
      oalMm: 8450,
      secondaryMm: 6316,
      massKg: 57000,
      muzzleEnergyJ: 3047398,
      eraYear: 1942,
      caliberEn: '88x571mmR KwK 36 (PzGr. 39)',
      caliberZh: '88×571mmR KwK 36 (PzGr. 39 穿甲弹)',
    },
    winchester1894: {
      oalMm: 949,
      massKg: 3.1,
      eraYear: 1894,
      caliberEn: '.30-30 Winchester',
      caliberZh: '.30-30 温彻斯特',
    },
    rem870: {
      oalMm: 978,
      massKg: 3.4,
      eraYear: 1950,
      caliberEn: '12 Gauge (2-3/4" / 3" Magnum)',
      caliberZh: '12 号霰弹 (2¾" / 3" 马格南)',
    },
    m1911: {
      oalMm: 216,
      massKg: 1.105,
      eraYear: 1911,
      caliberEn: '.45 ACP (11.43x23mm)',
      caliberZh: '.45 ACP (11.43×23mm)',
    },
    mg42: {
      oalMm: 1220,
      massKg: 11.6,
      eraYear: 1942,
      caliberEn: '7.92x57mm Mauser (s.S.)',
      caliberZh: '7.92×57mm 毛瑟重尖弹',
    },
    k98k: {
      oalMm: 1110,
      massKg: 3.92,
      eraYear: 1935,
      caliberEn: '7.92x57mm Mauser (8x57 IS)',
      caliberZh: '7.92×57mm 毛瑟步枪弹',
    },
    thompson: {
      oalMm: 852,
      massKg: 4.9,
      eraYear: 1928,
      caliberEn: '.45 ACP (50-Rd L-Drum)',
      caliberZh: '.45 ACP (50 发 L 型弹鼓)',
    },
    gau8: {
      oalMm: 6060,
      secondaryMm: 2850,
      massKg: 1828,
      muzzleEnergyJ: 201470,
      eraYear: 1977,
      caliberEn: '30x173mm PGU-14/B API',
      caliberZh: '30×173mm PGU-14/B 贫铀穿甲燃烧弹',
    },
    ...buildCentennialScaleWallMetrology(),
  };

export interface ScaleWallExhibitSpec {
  weaponId: WeaponId;
  bayCode: string;
  category: ScaleWallCategory;
  oalMm: number;
  secondaryMm?: number;
  massKg: number;
  muzzleEnergyJ: number;
  caliberLabel: string;
  caliberLabelZh: string;
  eraYear: number;
  accentColor: string;
}

function computeMuzzleEnergyFallback(weaponId: WeaponId): number {
  const manifest = getWeaponManifest(weaponId);
  return getCaliberBallisticsSpec(manifest.caliberProfile).muzzleEnergyJ;
}

export const SCALE_WALL_EXHIBITS: readonly ScaleWallExhibitSpec[] =
  WEAPON_MANIFESTS.map((manifest) => {
    const exact = EXACT_EXHIBIT_METROLOGY[manifest.id];
    const muzzleEnergyJ =
      exact.muzzleEnergyJ ?? computeMuzzleEnergyFallback(manifest.id);
    return {
      weaponId: manifest.id,
      bayCode: manifest.catalog.bayCode,
      category: manifest.catalog.category,
      oalMm: exact.oalMm,
      secondaryMm: exact.secondaryMm,
      massKg: exact.massKg,
      muzzleEnergyJ,
      caliberLabel: exact.caliberEn,
      caliberLabelZh: exact.caliberZh,
      eraYear: exact.eraYear,
      accentColor: CATEGORY_ACCENT[manifest.catalog.category],
    };
  });

const SCALE_WALL_BY_ID: ReadonlyMap<WeaponId, ScaleWallExhibitSpec> = new Map(
  SCALE_WALL_EXHIBITS.map((entry) => [entry.weaponId, entry])
);

export function getScaleWallExhibit(weaponId: WeaponId): ScaleWallExhibitSpec {
  return SCALE_WALL_BY_ID.get(weaponId) ?? SCALE_WALL_EXHIBITS[0];
}

export interface ScaleWallPresetSpec {
  id: ScaleWallPresetId;
  weaponIds: readonly WeaponId[];
  defaultReference: ScaleReferenceSilhouette;
  titleZh: string;
  titleEn: string;
  rangeNoteZh: string;
  rangeNoteEn: string;
}

export const SCALE_WALL_PRESETS: readonly ScaleWallPresetSpec[] = [
  {
    id: 'full_spectrum',
    weaponIds: ['m1911', 'ak15', 'm82a1', 'gau8', 'ztz99a'],
    defaultReference: 'human',
    titleZh: '全谱系 1:1 尺度跨度',
    titleEn: 'Full 1:1 Spectrum',
    rangeNoteZh: '216 mm → 10,900 mm (50.5×)',
    rangeNoteEn: '216 mm -> 10,900 mm (50.5x)',
  },
  {
    id: 'pistols_micro',
    weaponIds: ['g17', 'm1911', 'p08', 'deagle', 'python'],
    defaultReference: 'hand',
    titleZh: '传奇手枪 1:1 微距',
    titleEn: 'Legendary Sidearms 1:1',
    rangeNoteZh: '204 mm → 292 mm',
    rangeNoteEn: '204 mm -> 292 mm',
  },
  {
    id: 'wwii_titans',
    weaponIds: ['thompson', 'k98k', 'garand', 'mg42', 'tiger1'],
    defaultReference: 'human',
    titleZh: '二战机械传奇 1:1',
    titleEn: 'WWII Mechanical Titans 1:1',
    rangeNoteZh: '852 mm → 8,450 mm',
    rangeNoteEn: '852 mm -> 8,450 mm',
  },
  {
    id: 'heavy_firepower',
    weaponIds: ['m82a1', 'm134', 'gau8', 'm1a2', 'leopard2a7'],
    defaultReference: 'human',
    titleZh: '重火力·转管·主战坦克 1:1',
    titleEn: 'Anti-Materiel, Rotary & MBTs 1:1',
    rangeNoteZh: '802 mm → 10,970 mm',
    rangeNoteEn: '802 mm -> 10,970 mm',
  },
  {
    id: 'cold_war_wonders',
    weaponIds: ['p90', 'g11', 'vss', 'an94', 'vector'],
    defaultReference: 'human',
    titleZh: '冷战/现代奇观 1:1',
    titleEn: 'Mechanical Wonders 1:1',
    rangeNoteZh: '504 mm → 943 mm',
    rangeNoteEn: '504 mm -> 943 mm',
  },
] as const;

export const SCALE_WALL_GRID_INTERVALS_MM = [
  50, 100, 250, 500, 1000, 2000,
] as const;

export function chooseGridTickStepMm(maxMm: number): number {
  const safeMax = Math.max(50, maxMm);
  for (const step of SCALE_WALL_GRID_INTERVALS_MM) {
    if (safeMax / step <= 8) {
      return step;
    }
  }
  return 2000;
}

export interface ScaleWallGridTick {
  mm: number;
  xPx: number;
  xPct: number;
}

export interface ScaleWallRowLayout {
  exhibit: ScaleWallExhibitSpec;
  widthPx: number;
  widthPct: number;
  ratioToWidest: number;
}

export interface ScaleWallReferenceLayout {
  kind: Exclude<ScaleReferenceSilhouette, 'none'>;
  lengthMm: number;
  widthPx: number;
  widthPct: number;
}

export interface ScaleWallLayoutResult {
  stageWidthPx: number;
  maxExhibitMm: number;
  minExhibitMm: number;
  spanRatio: number;
  domainMaxMm: number;
  tickStepMm: number;
  pxPerMm: number;
  ticks: readonly ScaleWallGridTick[];
  reference: ScaleWallReferenceLayout | null;
  rows: readonly ScaleWallRowLayout[];
}

export interface ComputeScaleWallLayoutOptions {
  reference?: ScaleReferenceSilhouette;
}

/**
 * Pure 1:1 Smithsonian drafting layout solver:
 * Guarantees strict millimeter proportionality (`row.widthPx === row.exhibit.oalMm * pxPerMm`)
 * across all selected exhibits and optional Human (1,750 mm) / Hand (190 mm) references.
 */
export function computeScaleWallLayout(
  selectedIds: readonly WeaponId[],
  stageWidthPx: number,
  options: ComputeScaleWallLayoutOptions = {}
): ScaleWallLayoutResult {
  const safeStageWidth = Math.max(200, Number.isFinite(stageWidthPx) ? stageWidthPx : 800);
  const uniqueIds = Array.from(new Set(selectedIds)).slice(0, SCALE_WALL_MAX_EXHIBITS);
  const exhibits =
    uniqueIds.length > 0
      ? uniqueIds.map((id) => getScaleWallExhibit(id))
      : SCALE_WALL_PRESETS[0].weaponIds.map((id) => getScaleWallExhibit(id));

  const maxExhibitMm = Math.max(...exhibits.map((e) => e.oalMm));
  const minExhibitMm = Math.min(...exhibits.map((e) => e.oalMm));
  const spanRatio = Number((maxExhibitMm / Math.max(1, minExhibitMm)).toFixed(2));

  const refKind = options.reference ?? 'none';
  const refMm =
    refKind === 'human'
      ? HUMAN_REFERENCE_MM
      : refKind === 'hand'
        ? HAND_REFERENCE_MM
        : 0;

  const rawMaxMm = Math.max(maxExhibitMm, refMm, 100);
  const tickStepMm = chooseGridTickStepMm(rawMaxMm);
  const domainMaxMm = Math.ceil(rawMaxMm / tickStepMm) * tickStepMm;
  const pxPerMm = safeStageWidth / domainMaxMm;

  const ticks: ScaleWallGridTick[] = [];
  for (let mm = 0; mm <= domainMaxMm; mm += tickStepMm) {
    ticks.push({
      mm,
      xPx: Number((mm * pxPerMm).toFixed(2)),
      xPct: Number(((mm / domainMaxMm) * 100).toFixed(4)),
    });
  }

  const reference: ScaleWallReferenceLayout | null =
    refKind === 'none'
      ? null
      : {
          kind: refKind,
          lengthMm: refMm,
          widthPx: Number((refMm * pxPerMm).toFixed(2)),
          widthPct: Number(((refMm / domainMaxMm) * 100).toFixed(4)),
        };

  const rows: ScaleWallRowLayout[] = exhibits.map((exhibit) => ({
    exhibit,
    widthPx: Number((exhibit.oalMm * pxPerMm).toFixed(2)),
    widthPct: Number(((exhibit.oalMm / domainMaxMm) * 100).toFixed(4)),
    ratioToWidest: Number((exhibit.oalMm / maxExhibitMm).toFixed(4)),
  }));

  return {
    stageWidthPx: safeStageWidth,
    maxExhibitMm,
    minExhibitMm,
    spanRatio,
    domainMaxMm,
    tickStepMm,
    pxPerMm,
    ticks,
    reference,
    rows,
  };
}

export function formatScaleLength(
  mm: number,
  unit: ScaleUnitSystem
): string {
  if (unit === 'imperial') {
    const inches = mm / MM_PER_INCH;
    if (mm >= MM_PER_FOOT * 3) {
      const feet = mm / MM_PER_FOOT;
      return `${feet.toFixed(1)} ft (${inches.toFixed(0)} in)`;
    }
    return `${inches.toFixed(1)} in`;
  }
  if (mm >= 2000) {
    return `${(mm / 1000).toFixed(2)} m (${mm.toLocaleString('en-US')} mm)`;
  }
  return `${mm.toLocaleString('en-US')} mm`;
}

export function formatScaleTickLabel(
  mm: number,
  unit: ScaleUnitSystem
): string {
  if (mm === 0) return '0';
  if (unit === 'imperial') {
    if (mm >= MM_PER_FOOT * 2) {
      return `${(mm / MM_PER_FOOT).toFixed(1)} ft`;
    }
    return `${(mm / MM_PER_INCH).toFixed(1)} in`;
  }
  if (mm >= 1000) {
    const meters = mm / 1000;
    return Number.isInteger(meters) ? `${meters} m` : `${meters.toFixed(1)} m`;
  }
  return `${mm} mm`;
}

export function formatScaleMass(
  kg: number,
  unit: ScaleUnitSystem,
  lang: LanguageCode
): string {
  if (unit === 'imperial') {
    if (kg >= 1000) {
      const shortTons = kg / SHORT_TON_KG;
      return `${shortTons.toFixed(1)} ${lang === 'zh' ? '短吨' : 'short tons'}`;
    }
    const lb = kg * LB_PER_KG;
    return lb >= 100 ? `${Math.round(lb).toLocaleString('en-US')} lb` : `${lb.toFixed(2)} lb`;
  }
  if (kg >= 1000) {
    const tonnes = kg / 1000;
    return `${tonnes.toFixed(tonnes >= 10 ? 1 : 2)} ${lang === 'zh' ? '吨' : 't'}`;
  }
  if (kg < 1) {
    return `${Math.round(kg * 1000)} g`;
  }
  return `${kg >= 100 ? kg.toFixed(0) : kg.toFixed(2)} kg`;
}

export function formatScaleEnergy(
  joules: number,
  unit: ScaleUnitSystem
): string {
  if (unit === 'imperial') {
    const ftLb = joules * FT_LB_PER_JOULE;
    if (ftLb >= 1_000_000) {
      return `${(ftLb / 1_000_000).toFixed(2)}M ft-lb`;
    }
    if (ftLb >= 10_000) {
      return `${(ftLb / 1_000).toFixed(1)}k ft-lb`;
    }
    return `${Math.round(ftLb).toLocaleString('en-US')} ft-lb`;
  }
  if (joules >= 1_000_000) {
    return `${(joules / 1_000_000).toFixed(2)} MJ`;
  }
  if (joules >= 10_000) {
    return `${(joules / 1_000).toFixed(1)} kJ`;
  }
  return `${Math.round(joules).toLocaleString('en-US')} J`;
}

export function computeBarFillPct(
  value: number,
  maxValue: number,
  mode: ScaleBarMode
): number {
  const safeVal = Math.max(0, value);
  const safeMax = Math.max(1e-6, maxValue);
  if (safeVal === 0) return 0;
  if (mode === 'log') {
    const ratio = Math.log10(1 + safeVal) / Math.log10(1 + safeMax);
    return Number(Math.max(4, Math.min(100, ratio * 100)).toFixed(2));
  }
  return Number(Math.max(2, Math.min(100, (safeVal / safeMax) * 100)).toFixed(2));
}

export const SCALE_WALL_STRINGS: Readonly<
  Record<
    LanguageCode,
    {
      kicker: string;
      title: string;
      subtitle: string;
      closeAria: string;
      spanPill: (ratio: number, minLabel: string, maxLabel: string) => string;
      metricLabel: string;
      imperialLabel: string;
      refOff: string;
      refHuman: string;
      refHand: string;
      refHumanCaption: string;
      refHandCaption: string;
      presetsLabel: string;
      splitTop2Btn: string;
      inspect3dBtn: string;
      removeExhibitAria: (name: string) => string;
      ofWidestLabel: (pct: number) => string;
      metricsHeading: string;
      barModeLog: string;
      barModeLinear: string;
      colLength: string;
      colMass: string;
      colEnergy: string;
      pickerHeading: (selected: number, max: number) => string;
      pickerHint: string;
      rulerCaption: (tickLabel: string) => string;
      maxReachedNote: string;
    }
  >
> = {
  zh: {
    kicker: '史密森尼级 · 1:1 真实尺度对比墙',
    title: `全馆 ${WEAPON_MANIFESTS.length} 款馆藏 1:1 毫米级工程尺度对比墙`,
    subtitle:
      '在同一张 1:1 建筑蓝图网格上按真实毫米长度同框对比 204 mm 随身手枪、6.06 m 七管航炮与 10.97 m 主战坦克，量化呈现跨越 50 倍的几何、质量与炮口动能跨度',
    closeAria: '关闭 1:1 真实尺度对比墙',
    spanPill: (ratio, minLabel, maxLabel) =>
      `${ratio}× 尺度跨度 · ${minLabel} → ${maxLabel}`,
    metricLabel: '公制 (mm / kg / J)',
    imperialLabel: '英制 (in / lb / ft-lb)',
    refOff: '无人体标尺',
    refHuman: '成人 1.75 m',
    refHand: '成人手掌 190 mm',
    refHumanCaption: '参考标尺 · 标准成年人身高 (1,750 mm / 5 ft 9 in)',
    refHandCaption: '参考标尺 · 标准成年人手掌长度 (190 mm / 7.5 in)',
    presetsLabel: '史密森尼策展预设',
    splitTop2Btn: '双屏 3D 剖视对比前 2 项',
    inspect3dBtn: '3D 拆解',
    removeExhibitAria: (name) => `从对比墙移除 ${name}`,
    ofWidestLabel: (pct) => `占最长项 ${pct}%`,
    metricsHeading: '同步定量工程柱状图（长度 · 系统总重 · 炮口动能）',
    barModeLog: '对数刻度 (log₁₀)',
    barModeLinear: '线性真值',
    colLength: '全长 (1:1)',
    colMass: '系统 / 战斗质量',
    colEnergy: '单发炮口动能',
    pickerHeading: (selected, max) =>
      `从全馆 ${WEAPON_MANIFESTS.length} 款馆藏自由增减对比项（已选 ${selected} / ${max}）`,
    pickerHint: '点击展品标签即可实时加入或移出 1:1 蓝图墙（支持 2–6 款同框）',
    rulerCaption: (tickLabel) => `1:1 精密蓝图主网格 · 每格 ${tickLabel}`,
    maxReachedNote: '已达同框上限 (6 款)，取消任意展品后可替换',
  },
  en: {
    kicker: 'SMITHSONIAN 1:1 TRUE-SCALE WALL',
    title: `${WEAPON_MANIFESTS.length}-Exhibit 1:1 Millimeter Engineering Scale Wall`,
    subtitle:
      'Compare 204 mm sidearms, the 6.06 m 7-barrel rotary cannon, and 10.97 m main battle tanks side-by-side at strict 1:1 scale on an architectural blueprint grid with synchronized mass and kinetic energy bars',
    closeAria: 'Close 1:1 True-Scale Museum Wall',
    spanPill: (ratio, minLabel, maxLabel) =>
      `${ratio}x Span · ${minLabel} -> ${maxLabel}`,
    metricLabel: 'Metric (mm / kg / J)',
    imperialLabel: 'Imperial (in / lb / ft-lb)',
    refOff: 'No Reference',
    refHuman: 'Human 1.75 m',
    refHand: 'Hand 190 mm',
    refHumanCaption: 'Reference Scale · Adult Human Stature (1,750 mm / 5 ft 9 in)',
    refHandCaption: 'Reference Scale · Adult Human Hand Length (190 mm / 7.5 in)',
    presetsLabel: 'Curated 1:1 Presets',
    splitTop2Btn: 'Compare Top 2 in Split 3D',
    inspect3dBtn: 'Inspect in 3D',
    removeExhibitAria: (name) => `Remove ${name} from Scale Wall`,
    ofWidestLabel: (pct) => `${pct}% of widest`,
    metricsHeading: 'Synchronized Quantitative Comparison (Length · Mass · Muzzle Energy)',
    barModeLog: 'Logarithmic (log10)',
    barModeLinear: 'Linear True',
    colLength: 'Overall Length',
    colMass: 'System / Combat Mass',
    colEnergy: 'Muzzle Kinetic Energy',
    pickerHeading: (selected, max) =>
      `Add or Remove Across All ${WEAPON_MANIFESTS.length} Exhibits (${selected} / ${max} Active)`,
    pickerHint: 'Click any exhibit chip to add or remove from the 1:1 blueprint wall (2-6 exhibits)',
    rulerCaption: (tickLabel) => `1:1 Blueprint Drafting Grid · ${tickLabel} per division`,
    maxReachedNote: 'Maximum 6 exhibits staged — deselect one to add another',
  },
};
