import { getCaliberBallisticsSpec } from '../../engine/physics/armoryPhysics';
import { resolveWeaponDisplayMeta } from '../../i18n/weaponFallbacks';
import type { LanguageCode } from '../../narration/types';
import { buildCentennialArmorySortMeta } from '../../weapons/expansion/centennialProjectors';
import {
  getWeaponManifest,
  matchesArmoryCategory,
} from '../../weapons/manifests';
import type {
  ArmoryCategory,
  ArmoryWeaponItem,
  WeaponId,
} from '../../weapons/types';

export type ArmorySortKey =
  | 'curatorial'
  | 'year_asc'
  | 'energy_desc'
  | 'length_desc'
  | 'rpm_desc';

export type ArmoryMechanismFilter =
  | 'all'
  | 'rotating_bolt'
  | 'short_recoil'
  | 'roller_delay'
  | 'manual_action'
  | 'rotary_cannon'
  | 'smoothbore_armor'
  | 'compound_archery';

export type NonAllMechanismFilter = Exclude<ArmoryMechanismFilter, 'all'>;

export const ARMORY_SORT_KEYS: readonly ArmorySortKey[] = [
  'curatorial',
  'year_asc',
  'energy_desc',
  'length_desc',
  'rpm_desc',
];

export const ARMORY_MECHANISM_FILTERS: readonly ArmoryMechanismFilter[] = [
  'all',
  'rotating_bolt',
  'short_recoil',
  'roller_delay',
  'manual_action',
  'rotary_cannon',
  'smoothbore_armor',
  'compound_archery',
];

export interface ArmorySortFilterCopy {
  sortAria: string;
  mechAria: string;
  resetBtn: string;
  resetTitle: string;
  emptyTitle: string;
  emptyAction: string;
  manualSemiBadge: string;
  archeryBadge: string;
  sortOptions: Record<ArmorySortKey, string>;
  mechOptions: Record<ArmoryMechanismFilter, string>;
}

export const ARMORY_SORT_FILTER_STRINGS: Record<
  LanguageCode,
  ArmorySortFilterCopy
> = {
  zh: {
    sortAria: '展柜排序方式',
    mechAria: '按自动原理筛选',
    resetBtn: '重置',
    resetTitle: '重置展柜排序与原理筛选',
    emptyTitle: '当前展厅与原理筛选组合暂无匹配展品',
    emptyAction: '一键重置全部筛选',
    manualSemiBadge: '手动 / 半自动',
    archeryBadge: '弓弩储能',
    sortOptions: {
      curatorial: '排序 · 策展序',
      year_asc: '排序 · 年代 1894→',
      energy_desc: '排序 · 枪口动能 ↓',
      length_desc: '排序 · 全长尺度 ↓',
      rpm_desc: '排序 · 理论射速 ↓',
    },
    mechOptions: {
      all: '原理 · 全流派',
      rotating_bolt: '回转枪机闭锁',
      short_recoil: '枪管短后坐',
      roller_delay: '滚柱 / 延迟反冲',
      manual_action: '手动 / 转轮机构',
      rotary_cannon: '多管外能源转管',
      smoothbore_armor: '重装主炮炮闩',
      compound_archery: '复合凸轮弓弩',
    },
  },
  en: {
    sortAria: 'Sort vault exhibits',
    mechAria: 'Filter by operating mechanism',
    resetBtn: 'Reset',
    resetTitle: 'Reset vault sort and mechanism filter',
    emptyTitle: 'No exhibits match this hall & mechanism filter',
    emptyAction: 'Reset All Filters',
    manualSemiBadge: 'Manual / Semi',
    archeryBadge: 'Cam Archery',
    sortOptions: {
      curatorial: 'Sort · Curatorial',
      year_asc: 'Sort · Year 1894→',
      energy_desc: 'Sort · Energy ↓',
      length_desc: 'Sort · Length ↓',
      rpm_desc: 'Sort · Cyclic Rate ↓',
    },
    mechOptions: {
      all: 'Action · All',
      rotating_bolt: 'Rotating Bolt',
      short_recoil: 'Short-Recoil',
      roller_delay: 'Roller / Blowback',
      manual_action: 'Manual / Revolver',
      rotary_cannon: 'Rotary Cannon',
      smoothbore_armor: 'MBT Cannon Breech',
      compound_archery: 'Compound Archery',
    },
  },
};

/**
 * Historical design / adoption year per exhibit — synchronized 1:1 with the
 * 1894–2024 Curated Evolution Timeline without creating a lazy-chunk cycle.
 */
const CENTENNIAL_SORT_META = buildCentennialArmorySortMeta();

export const EXHIBIT_DESIGN_YEAR: Readonly<Record<WeaponId, number>> = {
  winchester1894: 1894,
  p08: 1900,
  m1911: 1911,
  thompson: 1928,
  k98k: 1935,
  garand: 1936,
  tiger1: 1942,
  mg42: 1942,
  rem870: 1950,
  python: 1955,
  m134: 1963,
  mp5: 1966,
  aug: 1977,
  gau8: 1977,
  g17: 1982,
  m82a1: 1982,
  deagle: 1983,
  m249: 1984,
  vss: 1987,
  p90: 1990,
  g11: 1990,
  m4a1: 1994,
  an94: 1994,
  awm: 1996,
  benellim4: 1999,
  scar: 2004,
  vector: 2009,
  ztz99a: 2011,
  p320: 2014,
  m1a2: 2017,
  leopard2a7: 2019,
  r500: 2022,
  ak15: 2023,
  lift33: 2024,
  ...CENTENNIAL_SORT_META.years,
};

/**
 * Engineering operating-mechanism family tags across all 34 exhibits.
 * Exhibits combining two landmark mechanical principles (e.g. Barrett M82A1
 * short-recoil + 3-lug rotating bolt, MG 42 short-recoil + symmetric dual-roller
 * locking) appear accurately under both families.
 */
export const EXHIBIT_MECHANISM_TAGS: Readonly<
  Record<WeaponId, readonly NonAllMechanismFilter[]>
> = {
  ak15: ['rotating_bolt'],
  m4a1: ['rotating_bolt'],
  mp5: ['roller_delay'],
  g17: ['short_recoil'],
  m82a1: ['short_recoil', 'rotating_bolt'],
  awm: ['manual_action'],
  scar: ['rotating_bolt'],
  deagle: ['rotating_bolt'],
  aug: ['rotating_bolt'],
  p320: ['short_recoil'],
  p90: ['roller_delay'],
  lift33: ['compound_archery'],
  r500: ['compound_archery'],
  python: ['manual_action'],
  benellim4: ['rotating_bolt'],
  garand: ['rotating_bolt'],
  m249: ['rotating_bolt'],
  p08: ['short_recoil'],
  vector: ['roller_delay'],
  g11: ['rotating_bolt'],
  vss: ['rotating_bolt'],
  m134: ['rotary_cannon'],
  an94: ['rotating_bolt'],
  ztz99a: ['smoothbore_armor'],
  m1a2: ['smoothbore_armor'],
  leopard2a7: ['smoothbore_armor'],
  tiger1: ['smoothbore_armor'],
  winchester1894: ['manual_action'],
  rem870: ['manual_action'],
  m1911: ['short_recoil'],
  mg42: ['short_recoil', 'roller_delay'],
  k98k: ['manual_action'],
  thompson: ['roller_delay'],
  gau8: ['rotary_cannon'],
  ...(Object.fromEntries(
    Object.entries(CENTENNIAL_SORT_META.filters).map(([id, f]) => [id, [f]])
  ) as unknown as Record<
    keyof typeof CENTENNIAL_SORT_META.filters,
    readonly NonAllMechanismFilter[]
  >),
};

/**
 * Parses the primary extended 1:1 physical length in millimetres directly from
 * `manifest.catalog.specs1To1.overallLengthMm` (e.g. `'880–940 mm (折叠 690 mm)'`
 * -> `940`, `'10,970 mm (含6.6m炮管) / 7,700 mm (车体)'` -> `10970`).
 */
export function parseOverallLengthMm(overallLengthMm: string): number {
  const primaryClause = overallLengthMm.split(/[/(（]/)[0] ?? overallLengthMm;
  const matches = primaryClause.match(/\d[\d,]*(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return 0;
  const nums = matches
    .map((token) => Number(token.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return 0;
  return Math.max(...nums);
}

/**
 * Parses peak cyclic / practical firing rate in RPM from `specs1To1.rateOfFire`,
 * strictly ignoring archery draw weights (`lb`) or cylinder capacities (`6发转轮`).
 */
export function parseCyclicRateRpm(rateOfFire: string): number {
  const matches = [
    ...rateOfFire.matchAll(
      /(\d[\d,]*)(?:\s*[–—-]\s*(\d[\d,]*))?\s*(?:发\/分|rpm)/gi
    ),
  ];
  if (matches.length === 0) return 0;
  let peak = 0;
  for (const m of matches) {
    const first = Number((m[1] ?? '0').replace(/,/g, ''));
    const second = Number((m[2] ?? '0').replace(/,/g, ''));
    if (Number.isFinite(first) && first > peak) peak = first;
    if (Number.isFinite(second) && second > peak) peak = second;
  }
  return peak;
}

export interface ArmoryExhibitSortMetrics {
  weaponId: WeaponId;
  orderIndex: number;
  year: number;
  energyJ: number;
  lengthMm: number;
  cyclicRateRpm: number;
  mechanisms: readonly NonAllMechanismFilter[];
}

const METRICS_CACHE = new Map<WeaponId, ArmoryExhibitSortMetrics>();

export function getArmoryExhibitSortMetrics(
  weaponId: WeaponId
): ArmoryExhibitSortMetrics {
  const cached = METRICS_CACHE.get(weaponId);
  if (cached) return cached;
  const manifest = getWeaponManifest(weaponId);
  const ballistics = getCaliberBallisticsSpec(manifest.caliberProfile);
  const metrics: ArmoryExhibitSortMetrics = {
    weaponId,
    orderIndex: manifest.orderIndex,
    year: EXHIBIT_DESIGN_YEAR[weaponId],
    energyJ: ballistics.muzzleEnergyJ,
    lengthMm: parseOverallLengthMm(manifest.catalog.specs1To1.overallLengthMm),
    cyclicRateRpm: parseCyclicRateRpm(manifest.catalog.specs1To1.rateOfFire),
    mechanisms: EXHIBIT_MECHANISM_TAGS[weaponId],
  };
  METRICS_CACHE.set(weaponId, metrics);
  return metrics;
}

export function matchesArmoryMechanismFilter(
  item: Pick<ArmoryWeaponItem, 'id'>,
  mechFilter: ArmoryMechanismFilter
): boolean {
  if (mechFilter === 'all') return true;
  return EXHIBIT_MECHANISM_TAGS[item.id].includes(mechFilter);
}

/**
 * Pure non-mutating curatorial sort & operating-mechanism filter over Armory
 * catalog items. Tie-breaks deterministically by manifest `orderIndex`.
 */
export function sortAndFilterArmoryWeapons(
  items: readonly ArmoryWeaponItem[],
  sortKey: ArmorySortKey,
  mechFilter: ArmoryMechanismFilter
): ArmoryWeaponItem[] {
  const filtered =
    mechFilter === 'all'
      ? [...items]
      : items.filter((item) => matchesArmoryMechanismFilter(item, mechFilter));

  if (sortKey === 'curatorial') {
    return filtered;
  }

  filtered.sort((a, b) => {
    const ma = getArmoryExhibitSortMetrics(a.id);
    const mb = getArmoryExhibitSortMetrics(b.id);
    let diff = 0;
    switch (sortKey) {
      case 'year_asc':
        diff = ma.year - mb.year;
        break;
      case 'energy_desc':
        diff = mb.energyJ - ma.energyJ;
        break;
      case 'length_desc':
        diff = mb.lengthMm - ma.lengthMm;
        break;
      case 'rpm_desc':
        diff = mb.cyclicRateRpm - ma.cyclicRateRpm;
        break;
    }
    return diff !== 0 ? diff : ma.orderIndex - mb.orderIndex;
  });

  return filtered;
}

/**
 * Formats a concise live telemetry chip for Armory rack cards whenever a
 * non-default sort order is active (e.g. `1894`, `7.60 MJ`, `6,060 mm`, `3,900 RPM`).
 * Returns `null` in default `'curatorial'` mode so baseline cards stay clean.
 */
export function formatArmorySortChipMetric(
  item: Pick<ArmoryWeaponItem, 'id' | 'category'>,
  sortKey: ArmorySortKey,
  lang: LanguageCode
): string | null {
  if (sortKey === 'curatorial') return null;
  const m = getArmoryExhibitSortMetrics(item.id);
  const copy = ARMORY_SORT_FILTER_STRINGS[lang];

  switch (sortKey) {
    case 'year_asc':
      return String(m.year);
    case 'energy_desc':
      if (m.energyJ >= 1_000_000) {
        return `${(m.energyJ / 1_000_000).toFixed(2)} MJ`;
      }
      if (m.energyJ >= 10_000) {
        return `${(m.energyJ / 1000).toFixed(1)} kJ`;
      }
      return `${Math.round(m.energyJ).toLocaleString('en-US')} J`;
    case 'length_desc':
      return `${Math.round(m.lengthMm).toLocaleString('en-US')} mm`;
    case 'rpm_desc':
      if (m.cyclicRateRpm > 0) {
        return `${Math.round(m.cyclicRateRpm).toLocaleString('en-US')} RPM`;
      }
      return item.category === 'archery'
        ? copy.archeryBadge
        : copy.manualSemiBadge;
  }
}

export type ArmoryFilterKey = ArmoryCategory | 'lmg';

/**
 * Partitions Armory exhibits across all 10 halls (`all`, `assault`, `lmg`,
 * `smg`, `sniper`, `shotgun`, `pistol`, `archery`, `armor`, `ordnance`) with
 * zero cross-hall leakage — explicitly guarding `category === 'ordnance'` so
 * aviation/artillery pieces never leak into `lmg` or `assault`.
 */
export function matchesCategoryWithLmg(
  item: ArmoryWeaponItem,
  filter: ArmoryFilterKey
): boolean {
  if (filter === 'all') return true;
  if (item.category === 'ordnance') {
    if (filter === 'lmg' || filter === 'assault') return false;
    return matchesArmoryCategory(item, filter as ArmoryCategory);
  }
  const typeTag = `${item.weaponTypeCn ?? ''} ${item.categoryCn}`;
  const isLmg =
    (item.id as string) === 'm249' ||
    (item.category as string) === 'lmg' ||
    typeTag.includes('机枪');
  if (filter === 'lmg') return isLmg;
  if (filter === 'assault' && isLmg) return false;
  return matchesArmoryCategory(item, filter as ArmoryCategory);
}

function normalizeQuickSearchText(raw: string): string {
  return raw.toLowerCase().replace(/×/g, 'x');
}

function safeResolveEnglishDisplayMeta(weaponId: WeaponId): {
  shortLabel?: string;
  name?: string;
  originTag?: string;
  actionMechanism?: string;
  caliber?: string;
} | null {
  try {
    return resolveWeaponDisplayMeta(weaponId, 'en', null);
  } catch {
    return null;
  }
}

/**
 * Pure bilingual quick-search filter for the Armory Vault rack.
 * Performs case-insensitive multi-token AND matching across ID, bay code,
 * model code, Chinese/English display names, caliber (normalizing `×` -> `x`),
 * origin country, design year, action mechanism, weapon type, and category.
 */
export function filterArmoryWeaponsByQuery(
  weapons: readonly ArmoryWeaponItem[],
  query: string
): ArmoryWeaponItem[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [...weapons];
  }

  const tokens = normalizeQuickSearchText(trimmed).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return [...weapons];
  }

  return weapons.filter((w) => {
    const enMeta = safeResolveEnglishDisplayMeta(w.id);
    const designYear =
      EXHIBIT_DESIGN_YEAR[w.id] ??
      (w as ArmoryWeaponItem & { year?: number }).year;
    const countryAlias =
      w.originCountryCn ??
      (w as ArmoryWeaponItem & { countryCn?: string }).countryCn ??
      '';
    const actionAlias =
      w.actionMechanism ??
      (w as ArmoryWeaponItem & { actionTypeCn?: string }).actionTypeCn ??
      '';

    const haystack = normalizeQuickSearchText(
      [
        w.id,
        w.bayCode,
        w.modelCode,
        w.nameCn,
        w.subtitleEn,
        w.caliber,
        countryAlias,
        designYear !== undefined ? String(designYear) : '',
        actionAlias,
        w.weaponTypeCn ?? '',
        w.category,
        w.categoryCn,
        enMeta?.name ?? '',
        enMeta?.shortLabel ?? '',
        enMeta?.originTag ?? '',
        enMeta?.actionMechanism ?? '',
        enMeta?.caliber ?? '',
      ].join(' ')
    );

    return tokens.every((tok) => haystack.includes(tok));
  });
}
