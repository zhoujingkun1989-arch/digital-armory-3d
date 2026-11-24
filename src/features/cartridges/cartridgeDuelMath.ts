import {
  CARTRIDGE_LAB_ORDER,
  CARTRIDGE_LAB_SPECS,
  type CartridgeLabSpec,
  TANK_ORDNANCE_ORDER,
} from '../../engine/cartridges/cartridgeSpecs';
import type { LanguageCode } from '../../narration/types';
import type { CaliberProfile } from '../../weapons/types';

/** Complete 21-round master order (17 small arms + 4 heavy cannon/MBT rounds). */
export const ALL_CARTRIDGE_LAB_ORDER: readonly CaliberProfile[] = [
  ...CARTRIDGE_LAB_ORDER,
  ...TANK_ORDNANCE_ORDER,
];

const GRAMS_PER_POUND = 453.59237;
const MM_PER_INCH = 25.4;

export interface SectionalDensityResult {
  /** Metric sectional density in g/cm^2 (mass_g / diameter_cm^2) */
  metricGCm2: number;
  /** Classic imperial ballistic sectional density in lb/in^2 (mass_lb / diameter_in^2) */
  imperialLbIn2: number;
}

/**
 * Computes projectile sectional density in both metric (`g/cm^2`) and classic
 * imperial (`lb/in^2`) ballistic units.
 */
export function computeSectionalDensity(
  massG: number,
  diameterMm: number
): SectionalDensityResult {
  const safeMassG = Math.max(0, massG);
  const safeDiamMm = Math.max(0.1, diameterMm);
  const diamCm = safeDiamMm / 10;
  const massLb = safeMassG / GRAMS_PER_POUND;
  const diamIn = safeDiamMm / MM_PER_INCH;

  const metricGCm2 = safeMassG / (diamCm * diamCm);
  const imperialLbIn2 = massLb / (diamIn * diamIn);

  return {
    metricGCm2: Number(metricGCm2.toFixed(2)),
    imperialLbIn2: Number(imperialLbIn2.toFixed(3)),
  };
}

/**
 * Computes exact projectile linear momentum p = m * v (N*s).
 */
export function computeCartridgeMomentumNs(
  massG: number,
  velocityMps: number
): number {
  const safeMassKg = Math.max(0, massG) / 1000;
  const safeVel = Math.max(0, velocityMps);
  return Number((safeMassKg * safeVel).toFixed(3));
}

export interface CartridgeDuelMetrics {
  primaryCaliber: CaliberProfile;
  opponentCaliber: CaliberProfile;
  primaryMomentumNs: number;
  opponentMomentumNs: number;
  momentumRatio: number;
  energyRatio: number;
  pressureRatio: number;
  velocityDeltaMps: number;
  oalRatio: number;
  caseCapacityRatio: number;
  primarySd: SectionalDensityResult;
  opponentSd: SectionalDensityResult;
  sdRatio: number;
}

function safeRatio(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator <= 1e-9) return 0;
  return Number((numerator / denominator).toFixed(2));
}

export function computeCartridgeDuelMetrics(
  primary: CartridgeLabSpec,
  opponent: CartridgeLabSpec
): CartridgeDuelMetrics {
  const primaryMomentumNs = computeCartridgeMomentumNs(
    primary.projectileMassG,
    primary.muzzleVelocityMps
  );
  const opponentMomentumNs = computeCartridgeMomentumNs(
    opponent.projectileMassG,
    opponent.muzzleVelocityMps
  );

  const primarySd = computeSectionalDensity(
    primary.projectileMassG,
    primary.bulletDiameterMm
  );
  const opponentSd = computeSectionalDensity(
    opponent.projectileMassG,
    opponent.bulletDiameterMm
  );

  return {
    primaryCaliber: primary.caliber,
    opponentCaliber: opponent.caliber,
    primaryMomentumNs,
    opponentMomentumNs,
    momentumRatio: safeRatio(primaryMomentumNs, opponentMomentumNs),
    energyRatio: safeRatio(primary.muzzleEnergyJ, opponent.muzzleEnergyJ),
    pressureRatio: safeRatio(primary.peakPressureMPa, opponent.peakPressureMPa),
    velocityDeltaMps: Number(
      (primary.muzzleVelocityMps - opponent.muzzleVelocityMps).toFixed(1)
    ),
    oalRatio: safeRatio(primary.oalMm, opponent.oalMm),
    caseCapacityRatio: safeRatio(
      primary.caseCapacityMl,
      opponent.caseCapacityMl
    ),
    primarySd,
    opponentSd,
    sdRatio: safeRatio(primarySd.metricGCm2, opponentSd.metricGCm2),
  };
}

export type CartridgeSortKey =
  | 'default'
  | 'oal'
  | 'charge'
  | 'mass'
  | 'pressure'
  | 'velocity'
  | 'energy'
  | 'sd';

export type CartridgeSortDir = 'asc' | 'desc';

function extractSortValue(
  caliber: CaliberProfile,
  sortKey: Exclude<CartridgeSortKey, 'default'>
): number {
  const spec = CARTRIDGE_LAB_SPECS[caliber];
  switch (sortKey) {
    case 'oal':
      return spec.oalMm;
    case 'charge':
      return spec.propellantMassG;
    case 'mass':
      return spec.projectileMassG;
    case 'pressure':
      return spec.peakPressureMPa;
    case 'velocity':
      return spec.muzzleVelocityMps;
    case 'energy':
      return spec.muzzleEnergyJ;
    case 'sd':
      return computeSectionalDensity(
        spec.projectileMassG,
        spec.bulletDiameterMm
      ).metricGCm2;
  }
}

export function sortCartridgeOrder(
  order: readonly CaliberProfile[],
  sortKey: CartridgeSortKey,
  dir: CartridgeSortDir = 'desc'
): CaliberProfile[] {
  const copy = [...order];
  if (sortKey === 'default') {
    return copy;
  }
  const factor = dir === 'asc' ? 1 : -1;
  copy.sort((a, b) => {
    const va = extractSortValue(a, sortKey);
    const vb = extractSortValue(b, sortKey);
    if (va !== vb) return (va - vb) * factor;
    return order.indexOf(a) - order.indexOf(b);
  });
  return copy;
}

const SUGGESTED_DUEL_OPPONENTS: Partial<Record<CaliberProfile, CaliberProfile>> =
  {
    '9mm_para': '45_acp',
    '45_acp': '9mm_para',
    '57_28': '9mm_para',
    '357_magnum': '50_ae',
    '50_ae': '357_magnum',
    '556_nato': '762_m43',
    '545_m74': '556_nato',
    '473_caseless': '556_nato',
    '762_m43': '556_nato',
    '9x39_subsonic': '762_m43',
    '30_30_win': '30_06',
    '762_nato': '792_mauser',
    '792_mauser': '30_06',
    '30_06': '792_mauser',
    '12_gauge': '50_ae',
    '338_lapua': '50_bmg',
    '50_bmg': '125mm_apfsds',
    '30x173_gau8': '50_bmg',
    '88mm_pzgr39': '120mm_apfsds',
    '120mm_apfsds': '125mm_apfsds',
    '125mm_apfsds': '50_bmg',
  };

export function getSuggestedDuelOpponent(
  caliber: CaliberProfile
): CaliberProfile {
  const suggested = SUGGESTED_DUEL_OPPONENTS[caliber];
  if (suggested && suggested !== caliber) return suggested;
  return caliber === '50_bmg' ? '125mm_apfsds' : '50_bmg';
}

export function formatRatioLabel(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '—';
  if (ratio >= 100) return `${Math.round(ratio).toLocaleString('en-US')}x`;
  if (ratio >= 10) return `${ratio.toFixed(1)}x`;
  return `${ratio.toFixed(2)}x`;
}

export function formatMomentumNs(ns: number): string {
  if (ns >= 1000) return `${(ns / 1000).toFixed(2)} kN·s`;
  if (ns >= 100) return `${ns.toFixed(1)} N·s`;
  return `${ns.toFixed(2)} N·s`;
}

export const CARTRIDGE_DUEL_STRINGS: Readonly<
  Record<
    LanguageCode,
    {
      anatomyInteractiveHint: string;
      anatomyActivePill: string;
      duelToggleLabel: string;
      duelOpponentLabel: string;
      duelGroupSmallArms: string;
      duelGroupHeavyOrdnance: string;
      duelEnergyRatio: string;
      duelMomentum: string;
      duelSectionalDensity: string;
      duelPressureVelocity: string;
      duelOalScale: string;
      colSd: string;
      sortColTitle: (label: string) => string;
    }
  >
> = {
  zh: {
    anatomyInteractiveHint: '点击或悬停下方结构层，实时高亮 3D 剖视对应部件',
    anatomyActivePill: '3D 高亮',
    duelToggleLabel: '对照弹药 · 跨口径 1v1 弹道对决',
    duelOpponentLabel: '选择对手弹药（全馆 21 口径）',
    duelGroupSmallArms: '轻武器实弹 (17 口径)',
    duelGroupHeavyOrdnance: '航炮与主战坦克炮弹 (4 口径)',
    duelEnergyRatio: '枪口动能倍率',
    duelMomentum: '弹头动量 p (N·s)',
    duelSectionalDensity: '截面密度 SD',
    duelPressureVelocity: '膛压比 / 初速差',
    duelOalScale: '全弹长 (OAL) 比例对照',
    colSd: '截面密度 SD',
    sortColTitle: (label) => `按「${label}」排序`,
  },
  en: {
    anatomyInteractiveHint: 'Click or hover any anatomy layer below to highlight it on the 3D cutaway',
    anatomyActivePill: '3D Highlight',
    duelToggleLabel: 'Compare vs... (1v1 Cross-Caliber Duel)',
    duelOpponentLabel: 'Select opponent round (all 21 calibers)',
    duelGroupSmallArms: 'Small Arms Cartridges (17)',
    duelGroupHeavyOrdnance: 'Aero Cannon & Tank Shells (4)',
    duelEnergyRatio: 'Muzzle Energy Ratio',
    duelMomentum: 'Momentum p (N*s)',
    duelSectionalDensity: 'Sectional Density (SD)',
    duelPressureVelocity: 'Pressure Ratio / Vel Delta',
    duelOalScale: 'Overall Length (OAL) Ratio',
    colSd: 'SD (g/cm2)',
    sortColTitle: (label) => `Sort by ${label}`,
  },
};
