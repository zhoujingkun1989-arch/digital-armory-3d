import {
  WEAPON_RIFLING_SPECS,
  type RiflingKind,
} from '../../engine/ballistics/riflingSpecs';
import {
  archeryProjectileToLabSpec,
  CARTRIDGE_LAB_SPECS,
  getArcheryProjectileMeta,
} from '../../engine/cartridges/cartridgeSpecs';
import { getGlossaryTermsForWeapon } from '../../engine/encyclopedia/engineeringGlossary';
import {
  computePeakPressureF,
  computeSafeUnlockF,
  createInternalBallisticsSample,
  evaluateInternalBallisticsInto,
  getCaliberBallisticsSpec,
  getWeaponFiringTiming,
  isArcheryWeapon,
} from '../../engine/physics/armoryPhysics';
import {
  type DeepLinkResolveOptions,
  resolveAppDeepLink,
} from '../../engine/utils/assetUrl';
import {
  getLocalizedShortWeaponLabel,
  resolveWeaponDisplayMeta,
} from '../../i18n/weaponFallbacks';
import type {
  LanguageCode,
  WeaponNarrationBundle,
} from '../../narration/types';
import { getWeaponManifest } from '../../weapons/manifests';
import type { WeaponId } from '../../weapons/types';
import { encodeQrMatrix } from '../monograph/qrCodeSvg';
import {
  POSTER_SHARE_STRINGS,
  type PosterArmorerRank,
  type PosterAspectRatio,
  type PosterThemeId,
} from './posterShareStrings';

export interface PosterRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PosterLayoutGeometry {
  aspect: PosterAspectRatio;
  width: number;
  height: number;
  padding: number;
  headerRect: PosterRect;
  stageRect: PosterRect;
  identityRect: PosterRect;
  metrologyRects: [PosterRect, PosterRect, PosterRect, PosterRect];
  curveRect: PosterRect;
  qrRect: PosterRect;
  footerRect: PosterRect;
}

export interface PosterThemePalette {
  id: PosterThemeId;
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  gridColor: string;
  outerBorder: string;
  cardBg: string;
  cardBorder: string;
  stageBgCenter: string;
  stageBgEdge: string;
  stageBorder: string;
  accentPrimary: string;
  accentSecondary: string;
  accentSoftBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  qrLight: string;
  qrDark: string;
  isLight: boolean;
}

export const POSTER_DIMENSIONS: Readonly<
  Record<PosterAspectRatio, { width: number; height: number }>
> = {
  '16:9': { width: 1920, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

export const POSTER_THEMES: Readonly<
  Record<PosterThemeId, PosterThemePalette>
> = {
  obsidian_gold: {
    id: 'obsidian_gold',
    bgTop: '#080c14',
    bgMid: '#0d1422',
    bgBottom: '#06090f',
    gridColor: 'rgba(245, 158, 11, 0.055)',
    outerBorder: 'rgba(245, 158, 11, 0.42)',
    cardBg: 'rgba(15, 22, 34, 0.88)',
    cardBorder: 'rgba(245, 158, 11, 0.24)',
    stageBgCenter: '#151e2e',
    stageBgEdge: '#070b12',
    stageBorder: 'rgba(251, 191, 36, 0.36)',
    accentPrimary: '#fbbf24',
    accentSecondary: '#38bdf8',
    accentSoftBg: 'rgba(245, 158, 11, 0.14)',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    qrLight: '#ffffff',
    qrDark: '#090d16',
    isLight: false,
  },
  blueprint_white: {
    id: 'blueprint_white',
    bgTop: '#f6f9fc',
    bgMid: '#edf3f9',
    bgBottom: '#e5edf6',
    gridColor: 'rgba(2, 132, 199, 0.075)',
    outerBorder: 'rgba(2, 132, 199, 0.36)',
    cardBg: 'rgba(255, 255, 255, 0.94)',
    cardBorder: 'rgba(15, 23, 42, 0.13)',
    stageBgCenter: '#182436',
    stageBgEdge: '#0b121e',
    stageBorder: 'rgba(2, 132, 199, 0.42)',
    accentPrimary: '#0284c7',
    accentSecondary: '#d97706',
    accentSoftBg: 'rgba(2, 132, 199, 0.11)',
    textPrimary: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#64748b',
    qrLight: '#ffffff',
    qrDark: '#0f172a',
    isLight: true,
  },
  cyber_cyan: {
    id: 'cyber_cyan',
    bgTop: '#040b14',
    bgMid: '#071829',
    bgBottom: '#030810',
    gridColor: 'rgba(56, 189, 248, 0.075)',
    outerBorder: 'rgba(56, 189, 248, 0.46)',
    cardBg: 'rgba(8, 22, 38, 0.88)',
    cardBorder: 'rgba(56, 189, 248, 0.26)',
    stageBgCenter: '#0d233a',
    stageBgEdge: '#040b14',
    stageBorder: 'rgba(34, 211, 238, 0.42)',
    accentPrimary: '#38bdf8',
    accentSecondary: '#2dd4bf',
    accentSoftBg: 'rgba(56, 189, 248, 0.14)',
    textPrimary: '#f0f9ff',
    textSecondary: '#bae6fd',
    textMuted: '#7dd3fc',
    qrLight: '#ffffff',
    qrDark: '#040b14',
    isLight: false,
  },
  smithsonian_blueprint: {
    id: 'smithsonian_blueprint',
    bgTop: '#061428',
    bgMid: '#0b2140',
    bgBottom: '#051020',
    gridColor: 'rgba(186, 230, 253, 0.085)',
    outerBorder: 'rgba(212, 175, 55, 0.78)',
    cardBg: 'rgba(8, 25, 48, 0.9)',
    cardBorder: 'rgba(212, 175, 55, 0.36)',
    stageBgCenter: '#0d2647',
    stageBgEdge: '#051122',
    stageBorder: 'rgba(212, 175, 55, 0.58)',
    accentPrimary: '#e5c158',
    accentSecondary: '#7dd3fc',
    accentSoftBg: 'rgba(229, 193, 88, 0.16)',
    textPrimary: '#f8fafc',
    textSecondary: '#dbeafe',
    textMuted: '#93c5fd',
    qrLight: '#f8fafc',
    qrDark: '#061428',
    isLight: false,
  },
};

export interface PosterActiveModes {
  sectionCut: boolean;
  xrayShells: boolean;
  engineeringTint: boolean;
  explodeProgress: number;
  firingMode: boolean;
}

export interface PosterMetrologyCell {
  label: string;
  value: string;
  subValue: string;
}

export interface PosterRiflingMetrology {
  kind: RiflingKind;
  /** Compact bore & rifling (or compound cam) metrology stamp for 3D poster stage & modal header */
  stampLabel: string;
  /** Authoritative bilingual rifling / propulsion specification */
  detailLabel: string;
  /** Concise top engineering principles from the 28-term encyclopedia */
  principlesLabel: string;
}

export interface BallisticCurveSample {
  f: number;
  pressureNorm: number;
  velocityNorm: number;
}

export interface PosterComposedMetadata {
  weaponId: WeaponId;
  bayCode: string;
  serialCode: string;
  modelCode: string;
  shortLabel: string;
  primaryTitle: string;
  secondaryTitle: string;
  originAndMechanismPrimary: string;
  originAndMechanismSecondary: string;
  exhibitCategory: string;
  isArchery: boolean;
  isHeavyScale: boolean;
  riflingMetrology: PosterRiflingMetrology;
  modeBadges: { label: string; highlight: boolean }[];
  metrologyCells: [
    PosterMetrologyCell,
    PosterMetrologyCell,
    PosterMetrologyCell,
    PosterMetrologyCell,
  ];
  curveTitle: string;
  peakPressureMpa: number;
  muzzleVelocityMps: number;
  peakPressureF: number;
  safeUnlockF: number;
  curveSamples: BallisticCurveSample[];
  armorerRank: PosterArmorerRank | null;
  armorerRankTitle: string | null;
  collectorCallsign: string;
  deepLinkUrl: string;
  qrMatrix: boolean[][];
  filename: string;
}

const RANK_PRIORITY: Readonly<Record<PosterArmorerRank, number>> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
};

function isArmorerRank(val: unknown): val is PosterArmorerRank {
  return val === 'S' || val === 'A' || val === 'B' || val === 'C';
}

/**
 * Safely inspects persisted Armorer Qualification Exam records in `localStorage`
 * (`digital-armory-v2-exam-certs`) if present, returning the highest earned rank for `weaponId`.
 */
export function readSavedArmorerRank(
  weaponId: string
): PosterArmorerRank | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem('digital-armory-v2-exam-certs');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const ledger =
      (parsed.certs as Record<string, unknown> | undefined) ??
      (parsed.records as Record<string, unknown> | undefined) ??
      (parsed.weapons as Record<string, unknown> | undefined) ??
      parsed;
    const entry = ledger?.[weaponId] as Record<string, unknown> | undefined;
    if (!entry || typeof entry !== 'object') return null;

    const candidates = [
      entry.fieldStripRank,
      entry.triageRank,
      entry.bestRank,
      entry.rank,
    ].filter(isArmorerRank);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => RANK_PRIORITY[b] - RANK_PRIORITY[a]);
    return candidates[0];
  } catch {
    return null;
  }
}

export function buildPosterFilename(weaponId: string): string {
  const safeId =
    weaponId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '') || 'exhibit';
  return `Digital-Armory-3D-${safeId}-Poster.png`;
}

export function buildPosterDeepLinkUrl(
  weaponId: string,
  options?: DeepLinkResolveOptions
): string {
  const safeId = encodeURIComponent(weaponId.trim());
  return resolveAppDeepLink(
    `?screen=workbench&weapon=${safeId}&cut=1`,
    options
  );
}

/**
 * Computes strictly non-overlapping pixel rectangles for all poster zones
 * across `1920 × 1080` (16:9 Widescreen) and `1080 × 1350` (4:5 Portrait).
 */
export function computePosterLayout(
  aspect: PosterAspectRatio
): PosterLayoutGeometry {
  if (aspect === '4:5') {
    const width = 1080;
    const height = 1350;
    const pad = 40;
    const innerW = width - pad * 2; // 1000
    const cellGap = 16;
    const cellW = (innerW - cellGap * 3) / 4; // 238

    return {
      aspect,
      width,
      height,
      padding: pad,
      headerRect: { x: pad, y: 40, w: innerW, h: 86 },
      stageRect: { x: pad, y: 140, w: innerW, h: 540 },
      identityRect: { x: pad, y: 698, w: innerW, h: 144 },
      metrologyRects: [
        { x: pad + (cellW + cellGap) * 0, y: 856, w: cellW, h: 142 },
        { x: pad + (cellW + cellGap) * 1, y: 856, w: cellW, h: 142 },
        { x: pad + (cellW + cellGap) * 2, y: 856, w: cellW, h: 142 },
        { x: pad + (cellW + cellGap) * 3, y: 856, w: cellW, h: 142 },
      ],
      curveRect: { x: pad, y: 1014, w: 480, h: 252 },
      qrRect: { x: pad + 496, y: 1014, w: 504, h: 252 },
      footerRect: { x: pad, y: 1278, w: innerW, h: 32 },
    };
  }

  // Default 16:9 Widescreen (`1920 × 1080`)
  const width = 1920;
  const height = 1080;
  const pad = 44;
  const innerW = width - pad * 2; // 1832
  const leftColW = 1040;
  const cellGap = 16;
  const cellW = (leftColW - cellGap * 3) / 4; // 248

  return {
    aspect: '16:9',
    width,
    height,
    padding: pad,
    headerRect: { x: pad, y: 44, w: innerW, h: 68 },
    stageRect: { x: pad, y: 126, w: innerW, h: 584 },
    identityRect: { x: pad, y: 726, w: leftColW, h: 118 },
    metrologyRects: [
      { x: pad + (cellW + cellGap) * 0, y: 856, w: cellW, h: 138 },
      { x: pad + (cellW + cellGap) * 1, y: 856, w: cellW, h: 138 },
      { x: pad + (cellW + cellGap) * 2, y: 856, w: cellW, h: 138 },
      { x: pad + (cellW + cellGap) * 3, y: 856, w: cellW, h: 138 },
    ],
    curveRect: { x: pad + 1060, y: 726, w: 368, h: 268 },
    qrRect: { x: pad + 1448, y: 726, w: 384, h: 268 },
    footerRect: { x: pad, y: 1004, w: innerW, h: 32 },
  };
}

/**
 * Formats an exhibit's authoritative Bore & Rifling specification (from
 * `WEAPON_RIFLING_SPECS`) and core engineering principles (from the 28-term
 * encyclopedia) into concise, zero-CJK-in-EN poster metrology stamps.
 *
 * Non-rifled archery exhibits (`lift33`, `r500`) display their authentic
 * compound/helical cam propulsion spec rather than firearm rifling data.
 */
export function formatPosterRiflingMetrology(
  weaponId: WeaponId,
  lang: LanguageCode
): PosterRiflingMetrology {
  const spec = WEAPON_RIFLING_SPECS[weaponId];
  const isZh = lang === 'zh';
  const detailLabel = isZh ? spec.labelZh : spec.labelEn;

  let stampLabel: string;
  if (spec.kind === 'none') {
    if (weaponId === 'lift33') {
      stampLabel = isZh
        ? '复合弓滑轮 · SwitchWeight-X 凸轮 · 下落式箭台'
        : 'COMPOUND CAM · SWITCHWEIGHT-X · DROP-AWAY REST';
    } else if (weaponId === 'r500') {
      stampLabel = isZh
        ? '螺旋凸轮复合弩 · Versa-Drive 驱动 · 悬浮箭轨'
        : 'HELICAL CAM · VERSA-DRIVE · FRICTIONLESS RAIL';
    } else {
      stampLabel = detailLabel;
    }
  } else if (spec.kind === 'smoothbore') {
    stampLabel = isZh
      ? `内膛 Ø${spec.boreDiameterMm}mm · 滑膛身管${spec.chromeLined ? ' · 镜面硬铬' : ''}`
      : `BORE Ø${spec.boreDiameterMm}mm · SMOOTHBORE${spec.chromeLined ? ' · HARD-CHROME' : ''}`;
  } else if (spec.kind === 'polygonal') {
    const dirZh = spec.direction === 'LH' ? '左旋' : '右旋';
    stampLabel = isZh
      ? `内膛 Ø${spec.boreDiameterMm}mm · ${spec.grooves}边多边形膛线 1:${spec.twistInches}" (${spec.twistMm}mm) ${dirZh}${spec.chromeLined ? ' · 镀铬' : ''}`
      : `BORE Ø${spec.boreDiameterMm}mm · ${spec.grooves}-POLYGONAL 1:${spec.twistInches}" (${spec.twistMm}mm) ${spec.direction}${spec.chromeLined ? ' · CHROME' : ''}`;
  } else {
    const dirZh = spec.direction === 'LH' ? '左旋' : '右旋';
    stampLabel = isZh
      ? `内膛 Ø${spec.boreDiameterMm}mm · ${spec.grooves}条${dirZh}膛线 1:${spec.twistInches}" (${spec.twistMm}mm)${spec.chromeLined ? ' · 镀铬' : ''}`
      : `BORE Ø${spec.boreDiameterMm}mm · ${spec.grooves}G 1:${spec.twistInches}" (${spec.twistMm}mm) ${spec.direction}${spec.chromeLined ? ' · CHROME' : ''}`;
  }

  const principles = getGlossaryTermsForWeapon(weaponId)
    .slice(0, 2)
    .map((term) => (isZh ? term.termZh : term.termEn));
  const principlesLabel =
    principles.length > 0
      ? `${isZh ? '核心原理' : 'PRINCIPLES'} · ${principles.join(' · ')}`
      : '';

  return {
    kind: spec.kind,
    stampLabel,
    detailLabel,
    principlesLabel,
  };
}

export interface AssemblePosterOptions {
  weaponId: WeaponId;
  lang: LanguageCode;
  activeModes: PosterActiveModes;
  armorerRank?: PosterArmorerRank | null;
  collectorCallsign?: string;
  narrationBundle?: WeaponNarrationBundle | null;
  deepLinkOptions?: DeepLinkResolveOptions;
}

export function assemblePosterMetadata(
  opts: AssemblePosterOptions
): PosterComposedMetadata {
  const {
    weaponId,
    lang,
    activeModes,
    armorerRank = null,
    collectorCallsign = '',
    narrationBundle = null,
    deepLinkOptions,
  } = opts;

  const isZh = lang === 'zh';
  const copy = POSTER_SHARE_STRINGS[lang];
  const manifest = getWeaponManifest(weaponId);
  const catalog = manifest.catalog;

  const metaZh = resolveWeaponDisplayMeta(weaponId, 'zh', narrationBundle);
  const metaEn = resolveWeaponDisplayMeta(weaponId, 'en', narrationBundle);
  const shortLabel = getLocalizedShortWeaponLabel(weaponId, lang);

  const primaryMeta = isZh ? metaZh : metaEn;
  const secondaryMeta = isZh ? metaEn : metaZh;

  const isArchery =
    isArcheryWeapon(weaponId) || catalog.category === 'archery';
  const caliberProfile = manifest.caliberProfile;
  const archMeta = getArcheryProjectileMeta(caliberProfile);
  const labMap = CARTRIDGE_LAB_SPECS as Readonly<
    Record<string, (typeof CARTRIDGE_LAB_SPECS)['556_nato'] | undefined>
  >;
  const cartridgeSpec = archMeta
    ? archeryProjectileToLabSpec(archMeta)
    : labMap[caliberProfile];

  const ballisticsSpec = getCaliberBallisticsSpec(caliberProfile);
  const timing = getWeaponFiringTiming(weaponId);

  const muzzleVelMps =
    cartridgeSpec?.muzzleVelocityMps ?? ballisticsSpec.muzzleVelocityMps;
  const muzzleEnergyJ = Math.round(
    cartridgeSpec?.muzzleEnergyJ ?? ballisticsSpec.muzzleEnergyJ
  );
  const machNumber = (muzzleVelMps / 340).toFixed(2);

  // Active viewport mode badges
  const modeBadges: { label: string; highlight: boolean }[] = [];
  if (activeModes.sectionCut) {
    modeBadges.push({ label: copy.poster.modeSectionCut, highlight: true });
  }
  if (activeModes.xrayShells) {
    modeBadges.push({ label: copy.poster.modeXray, highlight: true });
  }
  if (activeModes.engineeringTint) {
    modeBadges.push({ label: copy.poster.modeRoleTint, highlight: true });
  }
  const explodePct = Math.round(
    Math.max(0, Math.min(1, activeModes.explodeProgress)) * 100
  );
  if (explodePct >= 3) {
    modeBadges.push({
      label: copy.poster.modeExploded(explodePct),
      highlight: true,
    });
  } else if (activeModes.firingMode) {
    modeBadges.push({ label: copy.poster.modeFiring, highlight: true });
  }
  if (modeBadges.length === 0) {
    modeBadges.push({ label: copy.poster.modeBattery, highlight: false });
  }

  // Sample 56-point quantitative internal ballistics signature curve
  const sample = createInternalBallisticsSample();
  const curveSamples: BallisticCurveSample[] = [];
  const sampleCount = 56;
  const maxVel = Math.max(1, ballisticsSpec.muzzleVelocityMps);
  for (let i = 0; i < sampleCount; i++) {
    const f = (i / (sampleCount - 1)) * 0.42; // Active internal-ballistics window [0 .. 0.42]
    evaluateInternalBallisticsInto(caliberProfile, f, sample, timing);
    curveSamples.push({
      f,
      pressureNorm: Math.max(0, Math.min(1, sample.pressure01)),
      velocityNorm: Math.max(0, Math.min(1, sample.velocityMps / maxVel)),
    });
  }

  const serialSlug =
    shortLabel.replace(/[^A-Za-z0-9]/g, '').toUpperCase() ||
    weaponId.toUpperCase();
  const serialCode = `DA-2026-${catalog.bayCode}-${serialSlug}`;

  const standardLabel = cartridgeSpec?.standard ?? ballisticsSpec.standard;
  const compactOal = primaryMeta.overallLengthMm
    .replace(/\s*\(.*?\)/g, '')
    .trim();
  const rawBarrelFirst = primaryMeta.barrelSpec.split('·')[0].trim();
  const compactBarrel =
    rawBarrelFirst.length > 28
      ? rawBarrelFirst.replace(/\s*\(.*?\)/g, '').trim()
      : rawBarrelFirst;
  const rawWeight = primaryMeta.weightKg;
  const compactWeight =
    rawWeight.length > 28 ? rawWeight.split('/')[0].trim() : rawWeight;
  const roundedPeakMpa = Math.round(ballisticsSpec.peakPressureMPa);
  const isArmor = catalog.category === 'armor';
  const isOrdnance = catalog.category === 'ordnance';
  const isHeavyScale = isArmor || isOrdnance;

  const formattedEnergy =
    muzzleEnergyJ >= 1_000_000
      ? `${(muzzleEnergyJ / 1_000_000).toFixed(2)} MJ`
      : muzzleEnergyJ >= 100_000
        ? `${(muzzleEnergyJ / 1000).toFixed(1)} kJ`
        : `${muzzleEnergyJ.toLocaleString('en-US')} J`;

  const metrologyCells: [
    PosterMetrologyCell,
    PosterMetrologyCell,
    PosterMetrologyCell,
    PosterMetrologyCell,
  ] = isArmor
    ? [
        {
          label: copy.poster.metricMainCannon,
          value: primaryMeta.caliber,
          subValue: `${standardLabel} · ${copy.poster.peakPressureTag(roundedPeakMpa)}`,
        },
        {
          label: copy.poster.metricMuzzleEnergy,
          value: formattedEnergy,
          subValue: `${muzzleVelMps} m/s · Mach ${machNumber}`,
        },
        {
          label: copy.poster.metricHullLength,
          value: compactOal,
          subValue: compactBarrel,
        },
        {
          label: copy.poster.metricCombatWeight,
          value: compactWeight,
          subValue: copy.poster.partsUnit(
            catalog.partsCount,
            catalog.assembliesCount
          ),
        },
      ]
    : isOrdnance
      ? [
          {
            label: copy.poster.metricAutocannon,
            value: primaryMeta.caliber,
            subValue: `${standardLabel} · ${copy.poster.peakPressureTag(roundedPeakMpa)}`,
          },
          {
            label: copy.poster.metricMuzzleEnergy,
            value: formattedEnergy,
            subValue: `${muzzleVelMps} m/s · Mach ${machNumber}`,
          },
          {
            label: copy.poster.metricSystemLength,
            value: compactOal,
            subValue: compactBarrel,
          },
          {
            label: copy.poster.metricLoadedMass,
            value: compactWeight,
            subValue: copy.poster.partsUnit(
              catalog.partsCount,
              catalog.assembliesCount
            ),
          },
        ]
      : [
          {
            label: copy.poster.metricCaliber,
            value: primaryMeta.caliber,
            subValue: `${standardLabel} · ${
              isArchery
                ? copy.poster.drawPeakTag(roundedPeakMpa)
                : copy.poster.peakPressureTag(roundedPeakMpa)
            }`,
          },
          {
            label: copy.poster.metricMuzzleVel,
            value: `${muzzleVelMps} m/s`,
            subValue: `${formattedEnergy} · Mach ${machNumber}`,
          },
          {
            label: copy.poster.metricOal,
            value: compactOal,
            subValue: compactBarrel,
          },
          {
            label: copy.poster.metricCadParts,
            value: copy.poster.partsUnit(
              catalog.partsCount,
              catalog.assembliesCount
            ),
            subValue: compactWeight,
          },
        ];

  const deepLinkUrl = buildPosterDeepLinkUrl(weaponId, deepLinkOptions);
  const qrMatrix = encodeQrMatrix(deepLinkUrl);
  const riflingMetrology = formatPosterRiflingMetrology(weaponId, lang);

  return {
    weaponId,
    bayCode: catalog.bayCode,
    serialCode,
    modelCode: catalog.modelCode,
    shortLabel,
    primaryTitle: primaryMeta.name,
    secondaryTitle: secondaryMeta.name,
    originAndMechanismPrimary: `${primaryMeta.originTag} · ${primaryMeta.actionMechanism}`,
    originAndMechanismSecondary: `${secondaryMeta.originTag} · ${secondaryMeta.actionMechanism}`,
    exhibitCategory: catalog.category,
    isArchery,
    isHeavyScale,
    riflingMetrology,
    modeBadges,
    metrologyCells,
    curveTitle: isArchery
      ? copy.poster.curveArcheryTitle
      : isArmor
        ? copy.poster.curveArmorTitle
        : isOrdnance
          ? copy.poster.curveOrdnanceTitle
          : copy.poster.curveFirearmTitle,
    peakPressureMpa: roundedPeakMpa,
    muzzleVelocityMps: muzzleVelMps,
    peakPressureF: computePeakPressureF(caliberProfile, timing),
    safeUnlockF: computeSafeUnlockF(caliberProfile, timing),
    curveSamples,
    armorerRank,
    armorerRankTitle: armorerRank ? copy.rankTitles[armorerRank] : null,
    collectorCallsign: collectorCallsign.trim().slice(0, 32),
    deepLinkUrl,
    qrMatrix,
    filename: buildPosterFilename(weaponId),
  };
}

// ============================================================================
// Live WebGL 2.0 Viewport Capture (Safe when `preserveDrawingBuffer` is false)
// ============================================================================

function hasNonBlankPixels(canvas: HTMLCanvasElement): boolean {
  try {
    const probe = document.createElement('canvas');
    probe.width = 24;
    probe.height = 24;
    const ctx = probe.getContext('2d');
    if (!ctx) return true;
    ctx.drawImage(canvas, 0, 0, 24, 24);
    const data = ctx.getImageData(0, 0, 24, 24).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 8 && (data[i] > 2 || data[i + 1] > 2 || data[i + 2] > 2)) {
        return true;
      }
      if (data[i + 3] > 200) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Captures the live R3F `<canvas>` inside a `requestAnimationFrame` callback
 * immediately after R3F renders its frame (before the browser swaps/clears the
 * WebGL drawing buffer), retrying up to 3 animation frames if needed so the
 * captured 2D snapshot is never blank black.
 */
export function captureLiveViewportCanvas(
  selector = '.canvas-container canvas, canvas'
): Promise<HTMLCanvasElement | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  const target = document.querySelector<HTMLCanvasElement>(selector);
  if (!target || target.width <= 0 || target.height <= 0) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 3;

    const tryCaptureOnFrame = () => {
      attempts += 1;
      try {
        const snap = document.createElement('canvas');
        snap.width = target.width;
        snap.height = target.height;
        const ctx = snap.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(target, 0, 0);
        if (hasNonBlankPixels(snap) || attempts >= maxAttempts) {
          resolve(snap);
          return;
        }
      } catch {
        if (attempts >= maxAttempts) {
          resolve(null);
          return;
        }
      }
      window.requestAnimationFrame(tryCaptureOnFrame);
    };

    window.requestAnimationFrame(tryCaptureOnFrame);
  });
}

// ============================================================================
// High-DPI Vector-Sharp Canvas 2D Poster Renderer
// ============================================================================

const SANS_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function fitFontToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number | string,
  maxPx: number,
  minPx: number,
  family: string
): number {
  let px = maxPx;
  ctx.font = `${weight} ${px}px ${family}`;
  if (maxWidth <= 0 || !text) return px;
  while (px > minPx && ctx.measureText(text).width > maxWidth) {
    px = Math.max(minPx, Number((px - 0.5).toFixed(1)));
    ctx.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

function truncateTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) {
    end -= 1;
  }
  return `${text.slice(0, end).trim()}…`;
}

function createEdgeStripCanvas(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  stripW: number,
  stripH: number
): HTMLCanvasElement | null {
  try {
    if (typeof document === 'undefined') return null;
    const strip = document.createElement('canvas');
    strip.width = stripW;
    strip.height = stripH;
    const sCtx = strip.getContext('2d');
    if (!sCtx) return null;
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(source, sx, sy, sw, sh, 0, 0, stripW, stripH);
    const probe = sCtx.getImageData(0, 0, stripW, stripH).data;
    let hasOpaque = false;
    for (let i = 3; i < probe.length; i += 4) {
      if (probe[i] > 32) {
        hasOpaque = true;
        break;
      }
    }
    return hasOpaque ? strip : null;
  } catch {
    return null;
  }
}

function drawFeatheredEdgeStrip(
  ctx: CanvasRenderingContext2D,
  strip: HTMLCanvasElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  direction: 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'
): boolean {
  try {
    if (typeof document === 'undefined' || dw <= 0 || dh <= 0) return false;
    const isHoriz =
      direction === 'left-to-right' || direction === 'right-to-left';
    const bufW = isHoriz ? Math.max(4, Math.round(dw)) : strip.width;
    const bufH = isHoriz ? strip.height : Math.max(4, Math.round(dh));
    const buf = document.createElement('canvas');
    buf.width = bufW;
    buf.height = bufH;
    const bCtx = buf.getContext('2d');
    if (!bCtx) return false;
    bCtx.imageSmoothingEnabled = true;
    bCtx.imageSmoothingQuality = 'high';
    bCtx.drawImage(strip, 0, 0, bufW, bufH);
    bCtx.globalCompositeOperation = 'destination-in';
    const grad =
      direction === 'left-to-right'
        ? bCtx.createLinearGradient(0, 0, bufW, 0)
        : direction === 'right-to-left'
          ? bCtx.createLinearGradient(bufW, 0, 0, 0)
          : direction === 'top-to-bottom'
            ? bCtx.createLinearGradient(0, 0, 0, bufH)
            : bCtx.createLinearGradient(0, bufH, 0, 0);
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.48)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    bCtx.fillStyle = grad;
    bCtx.fillRect(0, 0, bufW, bufH);
    bCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(buf, dx, dy, dw, dh);
    return true;
  } catch {
    return false;
  }
}

function sampleImageCornerRgb(
  source: CanvasImageSource,
  srcW: number,
  srcH: number
): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const probe = document.createElement('canvas');
    probe.width = 8;
    probe.height = 8;
    const pCtx = probe.getContext('2d');
    if (!pCtx) return null;
    pCtx.drawImage(source, 0, 0, srcW, srcH, 0, 0, 8, 8);
    const d = pCtx.getImageData(0, 0, 8, 8).data;
    const corners = [0, 7 * 4, 7 * 8 * 4, (7 * 8 + 7) * 4];
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (const idx of corners) {
      if (d[idx + 3] > 60) {
        r += d[idx];
        g += d[idx + 1];
        b += d[idx + 2];
        count += 1;
      }
    }
    if (count === 0) return null;
    return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
  } catch {
    return null;
  }
}

function resolveImageDimensions(
  source: HTMLCanvasElement | HTMLImageElement | ImageBitmap
): { width: number; height: number } {
  if ('naturalWidth' in source && source.naturalWidth > 0) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function drawRankSeal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rank: PosterArmorerRank,
  rankTitle: string,
  headerLabel: string
): void {
  const rankPalette: Record<
    PosterArmorerRank,
    { border: string; glow: string; bg: string; letter: string; stars: string }
  > = {
    S: {
      border: '#fbbf24',
      glow: 'rgba(251, 191, 36, 0.28)',
      bg: 'rgba(24, 18, 8, 0.90)',
      letter: '#fde68a',
      stars: '★★★',
    },
    A: {
      border: '#34d399',
      glow: 'rgba(52, 211, 153, 0.25)',
      bg: 'rgba(8, 26, 22, 0.90)',
      letter: '#6ee7b7',
      stars: '★★☆',
    },
    B: {
      border: '#38bdf8',
      glow: 'rgba(56, 189, 248, 0.25)',
      bg: 'rgba(8, 22, 36, 0.90)',
      letter: '#7dd3fc',
      stars: '★☆☆',
    },
    C: {
      border: '#cbd5e1',
      glow: 'rgba(148, 163, 184, 0.22)',
      bg: 'rgba(15, 23, 36, 0.90)',
      letter: '#e2e8f0',
      stars: '☆☆☆',
    },
  };
  const pal = rankPalette[rank];
  const w = 248;
  const h = 74;
  const maxTextW = w - 80;

  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = pal.bg;
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = pal.border;
  ctx.stroke();

  // Inner double hairline
  drawRoundedRect(ctx, x + 4, y + 4, w - 8, h - 8, 9);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = pal.glow;
  ctx.stroke();

  // Left circular rank emblem
  const cx = x + 38;
  const cy = y + h * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 23, 0, Math.PI * 2);
  ctx.fillStyle = pal.glow;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = pal.border;
  ctx.stroke();

  ctx.font = `900 28px ${MONO_STACK}`;
  ctx.fillStyle = pal.letter;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rank, cx, cy + 1);

  // Right seal text (auto-fitted so neither headerLabel nor rankTitle ever truncates)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  fitFontToWidth(ctx, headerLabel, maxTextW, 800, 10, 8, MONO_STACK);
  ctx.fillStyle = pal.border;
  ctx.fillText(truncateTextToWidth(ctx, headerLabel, maxTextW), x + 70, y + 24);

  fitFontToWidth(ctx, rankTitle, maxTextW, 800, 16, 11, SANS_STACK);
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(truncateTextToWidth(ctx, rankTitle, maxTextW), x + 70, y + 46);

  const gradeLine = `GRADE ${rank} · ${pal.stars}`;
  fitFontToWidth(ctx, gradeLine, maxTextW, 700, 11, 9, MONO_STACK);
  ctx.fillStyle = pal.letter;
  ctx.fillText(gradeLine, x + 70, y + 63);
  ctx.restore();
}

function drawStageCornerFiducials(
  ctx: CanvasRenderingContext2D,
  rect: PosterRect,
  color: string
): void {
  const inset = 14;
  const arm = 22;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const corners: [number, number, number, number][] = [
    [rect.x + inset, rect.y + inset, 1, 1],
    [rect.x + rect.w - inset, rect.y + inset, -1, 1],
    [rect.x + inset, rect.y + rect.h - inset, 1, -1],
    [rect.x + rect.w - inset, rect.y + rect.h - inset, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * arm);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * arm, cy);
    ctx.stroke();
  }

  // Subtle CAD millimeter scale ticks along bottom inner bezel
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.42;
  const tickStart = rect.x + 64;
  const tickEnd = rect.x + rect.w - 64;
  const baseY = rect.y + rect.h - 10;
  for (let tx = tickStart, idx = 0; tx <= tickEnd; tx += 16, idx++) {
    const tickH = idx % 5 === 0 ? 8 : 4;
    ctx.beginPath();
    ctx.moveTo(tx, baseY);
    ctx.lineTo(tx, baseY - tickH);
    ctx.stroke();
  }
  ctx.restore();
}

export interface RenderPosterOptions {
  canvas: HTMLCanvasElement;
  aspect: PosterAspectRatio;
  themeId: PosterThemeId;
  lang: LanguageCode;
  metadata: PosterComposedMetadata;
  viewportImage?: HTMLCanvasElement | HTMLImageElement | ImageBitmap | null;
}

/**
 * Renders the complete museum-grade HD 3D Cutaway Social Poster onto `canvas`
 * at exact `1920 × 1080` or `1080 × 1350` native pixel resolution.
 */
export function renderPosterToCanvas(opts: RenderPosterOptions): void {
  const { canvas, aspect, themeId, lang, metadata, viewportImage } = opts;
  const layout = computePosterLayout(aspect);
  const theme = POSTER_THEMES[themeId];
  const copy = POSTER_SHARE_STRINGS[lang];

  if (canvas.width !== layout.width) canvas.width = layout.width;
  if (canvas.height !== layout.height) canvas.height = layout.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Studio Backdrop Gradient + Precision CAD Grid
  const bgGrad = ctx.createLinearGradient(0, 0, 0, layout.height);
  bgGrad.addColorStop(0, theme.bgTop);
  bgGrad.addColorStop(0.52, theme.bgMid);
  bgGrad.addColorStop(1, theme.bgBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.strokeStyle = theme.gridColor;
  ctx.lineWidth = 1;
  const gridStep = 32;
  for (let gx = 0; gx <= layout.width; gx += gridStep) {
    ctx.beginPath();
    ctx.moveTo(gx + 0.5, 0);
    ctx.lineTo(gx + 0.5, layout.height);
    ctx.stroke();
  }
  for (let gy = 0; gy <= layout.height; gy += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, gy + 0.5);
    ctx.lineTo(layout.width, gy + 0.5);
    ctx.stroke();
  }

  // Outer Curatorial Frame Hairline (Double-rule museum brass frame for Smithsonian Blueprint)
  const isSmithsonian = themeId === 'smithsonian_blueprint';
  if (isSmithsonian) {
    // Major archival blueprint gridlines every 128px
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.14)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= layout.width; gx += 128) {
      ctx.beginPath();
      ctx.moveTo(gx + 0.5, 0);
      ctx.lineTo(gx + 0.5, layout.height);
      ctx.stroke();
    }
    for (let gy = 0; gy <= layout.height; gy += 128) {
      ctx.beginPath();
      ctx.moveTo(0, gy + 0.5);
      ctx.lineTo(layout.width, gy + 0.5);
      ctx.stroke();
    }

    // Outer brass rule + inner archival hairline
    drawRoundedRect(ctx, 14, 14, layout.width - 28, layout.height - 28, 18);
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = theme.outerBorder;
    ctx.stroke();

    drawRoundedRect(ctx, 22, 22, layout.width - 44, layout.height - 44, 14);
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = 'rgba(229, 193, 88, 0.42)';
    ctx.stroke();
  } else {
    drawRoundedRect(
      ctx,
      18,
      18,
      layout.width - 36,
      layout.height - 36,
      20
    );
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = theme.outerBorder;
    ctx.stroke();
  }

  // 2. Top Curatorial Header
  const hr = layout.headerRect;
  // Bay Code Pill
  ctx.font = `900 15px ${MONO_STACK}`;
  const bayText = metadata.bayCode;
  const bayW = Math.max(82, ctx.measureText(bayText).width + 28);
  drawRoundedRect(ctx, hr.x, hr.y + 4, bayW, 32, 8);
  ctx.fillStyle = theme.accentPrimary;
  ctx.fill();
  ctx.fillStyle = theme.isLight ? '#ffffff' : '#090d16';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bayText, hr.x + bayW * 0.5, hr.y + 20.5);

  // Museum Kicker + Serial / Model Code
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 14px ${SANS_STACK}`;
  ctx.fillStyle = theme.textPrimary;
  ctx.fillText(copy.poster.museumKicker, hr.x + bayW + 14, hr.y + 19);

  ctx.font = `600 12px ${MONO_STACK}`;
  ctx.fillStyle = theme.textMuted;
  ctx.fillText(
    isSmithsonian
      ? `${copy.poster.smithsonianAccession} · ${metadata.serialCode} · ${metadata.modelCode}`
      : `${metadata.serialCode} · ${metadata.modelCode}`,
    hr.x + bayW + 14,
    hr.y + 37
  );

  // Active Mode Badges (right-aligned on 16:9, second row on 4:5)
  ctx.font = `800 11.5px ${MONO_STACK}`;
  if (aspect === '16:9') {
    let cursorRight = hr.x + hr.w;
    for (let i = metadata.modeBadges.length - 1; i >= 0; i--) {
      const b = metadata.modeBadges[i];
      const bw = ctx.measureText(b.label).width + 24;
      cursorRight -= bw;
      drawRoundedRect(ctx, cursorRight, hr.y + 10, bw, 30, 7);
      ctx.fillStyle = b.highlight ? theme.accentSoftBg : theme.cardBg;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = b.highlight ? theme.accentPrimary : theme.cardBorder;
      ctx.stroke();
      ctx.fillStyle = b.highlight ? theme.accentPrimary : theme.textSecondary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, cursorRight + bw * 0.5, hr.y + 25.5);
      cursorRight -= 8;
    }
  } else {
    let cursorLeft = hr.x;
    const badgeY = hr.y + 52;
    for (const b of metadata.modeBadges) {
      const bw = ctx.measureText(b.label).width + 22;
      if (cursorLeft + bw > hr.x + hr.w) break;
      drawRoundedRect(ctx, cursorLeft, badgeY, bw, 28, 7);
      ctx.fillStyle = b.highlight ? theme.accentSoftBg : theme.cardBg;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = b.highlight ? theme.accentPrimary : theme.cardBorder;
      ctx.stroke();
      ctx.fillStyle = b.highlight ? theme.accentPrimary : theme.textSecondary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, cursorLeft + bw * 0.5, badgeY + 14.5);
      cursorLeft += bw + 8;
    }
  }

  // 3. Hero Live 3D Viewport Stage Frame
  const sr = layout.stageRect;
  ctx.save();
  drawRoundedRect(ctx, sr.x, sr.y, sr.w, sr.h, 16);
  ctx.clip();

  let sampledEdgeColor: string | null = null;
  if (viewportImage) {
    const dims = resolveImageDimensions(viewportImage);
    if (dims.width > 0 && dims.height > 0) {
      sampledEdgeColor = sampleImageCornerRgb(
        viewportImage,
        dims.width,
        dims.height
      );
    }
  }

  const stageGrad = ctx.createRadialGradient(
    sr.x + sr.w * 0.5,
    sr.y + sr.h * 0.5,
    sr.h * 0.08,
    sr.x + sr.w * 0.5,
    sr.y + sr.h * 0.5,
    Math.max(sr.w, sr.h) * 0.65
  );
  stageGrad.addColorStop(0, sampledEdgeColor ?? theme.stageBgCenter);
  stageGrad.addColorStop(1, sampledEdgeColor ?? theme.stageBgEdge);
  ctx.fillStyle = stageGrad;
  ctx.fillRect(sr.x, sr.y, sr.w, sr.h);

  if (viewportImage) {
    const { width: srcW, height: srcH } = resolveImageDimensions(viewportImage);
    if (srcW > 0 && srcH > 0) {
      const srcAspect = srcW / srcH;
      const stageAspect = sr.w / sr.h;

      // Smart hybrid center-cover crop: trim up to 17% top/bottom empty HUD studio margin
      // on horizontal viewports so wide 16:9 / 4:5 stages fill cleanly without clipping muzzle/stock.
      let srcCropX = 0;
      let srcCropY = 0;
      let srcCropW = srcW;
      let srcCropH = srcH;
      let drawX: number;
      let drawY: number;
      let drawW: number;
      let drawH: number;

      if (srcAspect < stageAspect) {
        const maxVertCropEach =
          srcAspect >= 1.05 ? (metadata.isArchery ? 0.06 : 0.17) : 0;
        const neededCropEach = (1 - srcW / stageAspect / srcH) * 0.5;
        const cropEach = Math.max(0, Math.min(maxVertCropEach, neededCropEach));
        srcCropY = srcH * cropEach;
        srcCropH = srcH * (1 - 2 * cropEach);
        const scale = sr.h / srcCropH;
        drawW = Math.min(sr.w, srcCropW * scale);
        drawH = sr.h;
        drawX = sr.x + (sr.w - drawW) * 0.5;
        drawY = sr.y;
      } else {
        const maxHorizCropEach = 0.08;
        const neededHorizEach = (1 - (srcH * stageAspect) / srcW) * 0.5;
        const hCrop = Math.max(0, Math.min(maxHorizCropEach, neededHorizEach));
        srcCropX = srcW * hCrop;
        srcCropW = srcW * (1 - 2 * hCrop);
        const scale = sr.w / srcCropW;
        drawW = sr.w;
        drawH = Math.min(sr.h, srcCropH * scale);
        drawX = sr.x;
        drawY = sr.y + (sr.h - drawH) * 0.5;
      }

      ctx.drawImage(
        viewportImage,
        srcCropX,
        srcCropY,
        srcCropW,
        srcCropH,
        drawX,
        drawY,
        drawW,
        drawH
      );

      // Seamless side-wing edge-column extension + inward feather blend (zero vertical seam)
      const leftWingW = drawX - sr.x;
      const rightWingW = sr.x + sr.w - (drawX + drawW);
      if (leftWingW > 0.5 || rightWingW > 0.5) {
        const sampleW = Math.max(1, Math.min(6, Math.round(srcCropW * 0.008)));
        const featherW = Math.min(112, Math.max(24, Math.round(drawW * 0.095)));
        const fallbackWingRgb = sampledEdgeColor ?? theme.stageBgEdge;

        if (leftWingW > 0.5) {
          const leftStrip = createEdgeStripCanvas(
            viewportImage,
            srcCropX,
            srcCropY,
            sampleW,
            srcCropH,
            1,
            48
          );
          if (leftStrip) {
            ctx.drawImage(
              leftStrip,
              sr.x,
              sr.y,
              Math.ceil(leftWingW) + 2,
              sr.h
            );
            drawFeatheredEdgeStrip(
              ctx,
              leftStrip,
              drawX - 1,
              sr.y,
              featherW + 1,
              sr.h,
              'left-to-right'
            );
          } else {
            ctx.fillStyle = fallbackWingRgb;
            ctx.fillRect(sr.x, sr.y, Math.ceil(leftWingW) + 1, sr.h);
            const lg = ctx.createLinearGradient(
              drawX,
              sr.y,
              drawX + featherW,
              sr.y
            );
            lg.addColorStop(0, fallbackWingRgb);
            lg.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = lg;
            ctx.fillRect(drawX - 1, sr.y, featherW + 1, sr.h);
          }
        }

        if (rightWingW > 0.5) {
          const rightEdgeX = drawX + drawW;
          const rightStrip = createEdgeStripCanvas(
            viewportImage,
            Math.max(0, srcCropX + srcCropW - sampleW),
            srcCropY,
            sampleW,
            srcCropH,
            1,
            48
          );
          if (rightStrip) {
            ctx.drawImage(
              rightStrip,
              Math.floor(rightEdgeX) - 2,
              sr.y,
              Math.ceil(rightWingW) + 3,
              sr.h
            );
            drawFeatheredEdgeStrip(
              ctx,
              rightStrip,
              rightEdgeX - featherW,
              sr.y,
              featherW + 1,
              sr.h,
              'right-to-left'
            );
          } else {
            ctx.fillStyle = fallbackWingRgb;
            ctx.fillRect(
              Math.floor(rightEdgeX) - 1,
              sr.y,
              Math.ceil(rightWingW) + 2,
              sr.h
            );
            const rg = ctx.createLinearGradient(
              rightEdgeX,
              sr.y,
              rightEdgeX - featherW,
              sr.y
            );
            rg.addColorStop(0, fallbackWingRgb);
            rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = rg;
            ctx.fillRect(rightEdgeX - featherW, sr.y, featherW + 1, sr.h);
          }
        }
      }

      // Symmetric top/bottom edge-row extension + feather blend if source is ultra-wide
      const topWingH = drawY - sr.y;
      const botWingH = sr.y + sr.h - (drawY + drawH);
      if (topWingH > 0.5 || botWingH > 0.5) {
        const sampleH = Math.max(1, Math.min(6, Math.round(srcCropH * 0.01)));
        const featherH = Math.min(72, Math.max(18, Math.round(drawH * 0.1)));
        if (topWingH > 0.5) {
          const topStrip = createEdgeStripCanvas(
            viewportImage,
            srcCropX,
            srcCropY,
            srcCropW,
            sampleH,
            48,
            1
          );
          if (topStrip) {
            ctx.drawImage(topStrip, sr.x, sr.y, sr.w, Math.ceil(topWingH) + 2);
            drawFeatheredEdgeStrip(
              ctx,
              topStrip,
              sr.x,
              drawY - 1,
              sr.w,
              featherH + 1,
              'top-to-bottom'
            );
          }
        }
        if (botWingH > 0.5) {
          const botEdgeY = drawY + drawH;
          const botStrip = createEdgeStripCanvas(
            viewportImage,
            srcCropX,
            Math.max(0, srcCropY + srcCropH - sampleH),
            srcCropW,
            sampleH,
            48,
            1
          );
          if (botStrip) {
            ctx.drawImage(
              botStrip,
              sr.x,
              Math.floor(botEdgeY) - 2,
              sr.w,
              Math.ceil(botWingH) + 3
            );
            drawFeatheredEdgeStrip(
              ctx,
              botStrip,
              sr.x,
              botEdgeY - featherH,
              sr.w,
              featherH + 1,
              'bottom-to-top'
            );
          }
        }
      }
    }
  } else {
    // Clean CAD schematic fallback when rendered in headless environments without WebGL
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(sr.x + 48, sr.y + sr.h * 0.5);
    ctx.lineTo(sr.x + sr.w - 48, sr.y + sr.h * 0.5);
    ctx.moveTo(sr.x + sr.w * 0.5, sr.y + 36);
    ctx.lineTo(sr.x + sr.w * 0.5, sr.y + sr.h - 36);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(sr.x + sr.w * 0.5, sr.y + sr.h * 0.5, 96, 0, Math.PI * 2);
    ctx.strokeStyle = theme.accentPrimary;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.font = `800 22px ${MONO_STACK}`;
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `${metadata.bayCode} · ${metadata.shortLabel}`,
      sr.x + sr.w * 0.5,
      sr.y + sr.h * 0.5 - 10
    );
    ctx.font = `500 13px ${SANS_STACK}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(
      copy.fallbackStageNote,
      sr.x + sr.w * 0.5,
      sr.y + sr.h * 0.5 + 18
    );
  }

  // Subtle Museum Vignette inside Stage
  const vig = ctx.createRadialGradient(
    sr.x + sr.w * 0.5,
    sr.y + sr.h * 0.5,
    Math.min(sr.w, sr.h) * 0.34,
    sr.x + sr.w * 0.5,
    sr.y + sr.h * 0.5,
    Math.max(sr.w, sr.h) * 0.68
  );
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(2, 6, 14, 0.36)');
  ctx.fillStyle = vig;
  ctx.fillRect(sr.x, sr.y, sr.w, sr.h);

  // CAD Corner Fiducial Brackets & Scale Ticks
  drawStageCornerFiducials(ctx, sr, theme.accentPrimary);

  // Scale Watermark Tag inside Top-Left of Stage
  ctx.font = `700 11px ${MONO_STACK}`;
  const scaleTag = copy.poster.scaleTag;
  const stW = ctx.measureText(scaleTag).width + 22;
  drawRoundedRect(ctx, sr.x + 24, sr.y + 22, stW, 26, 6);
  ctx.fillStyle = 'rgba(8, 13, 22, 0.72)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(scaleTag, sr.x + 35, sr.y + 35.5);

  // Bore & Rifling (or Compound Cam) Metrology Stamp + Core Engineering Principles below Scale Tag
  const maxStageStampW = Math.max(240, sr.w - 316);
  const boreStampText = metadata.riflingMetrology.stampLabel;
  if (boreStampText) {
    fitFontToWidth(
      ctx,
      boreStampText,
      maxStageStampW - 24,
      700,
      11,
      7.5,
      MONO_STACK
    );
    const boreW = Math.min(
      maxStageStampW,
      ctx.measureText(boreStampText).width + 22
    );
    drawRoundedRect(ctx, sr.x + 24, sr.y + 54, boreW, 25, 6);
    ctx.fillStyle = isSmithsonian
      ? 'rgba(6, 20, 40, 0.84)'
      : 'rgba(8, 13, 22, 0.78)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.accentPrimary;
    ctx.stroke();
    ctx.fillStyle = isSmithsonian ? '#e5c158' : '#fde68a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(boreStampText, sr.x + 35, sr.y + 66.8);
  }

  const principlesStampText = metadata.riflingMetrology.principlesLabel;
  if (principlesStampText) {
    fitFontToWidth(
      ctx,
      principlesStampText,
      maxStageStampW - 24,
      600,
      10.5,
      7.0,
      SANS_STACK
    );
    const prinW = Math.min(
      maxStageStampW,
      ctx.measureText(principlesStampText).width + 22
    );
    drawRoundedRect(ctx, sr.x + 24, sr.y + 84, prinW, 23, 6);
    ctx.fillStyle = 'rgba(8, 13, 22, 0.72)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(principlesStampText, sr.x + 35, sr.y + 95.8);
  }

  // Optional Armorer Qualification Rank Seal (`S / A / B / C`) in Top-Right of Stage
  if (metadata.armorerRank && metadata.armorerRankTitle) {
    drawRankSeal(
      ctx,
      sr.x + sr.w - 272,
      sr.y + 22,
      metadata.armorerRank,
      metadata.armorerRankTitle,
      copy.rankStampHeader
    );
  }

  // Optional Collector Callsign Engraved Plate in Bottom-Left of Stage
  if (metadata.collectorCallsign) {
    const csLabel = `${copy.poster.curatedBy}: ${metadata.collectorCallsign}`;
    ctx.font = `800 12.5px ${MONO_STACK}`;
    const csW = Math.min(sr.w - 56, ctx.measureText(csLabel).width + 28);
    const csX = sr.x + 24;
    const csY = sr.y + sr.h - 54;
    drawRoundedRect(ctx, csX, csY, csW, 32, 8);
    ctx.fillStyle = 'rgba(9, 14, 24, 0.84)';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = theme.accentPrimary;
    ctx.stroke();
    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      truncateTextToWidth(ctx, csLabel, csW - 24),
      csX + 14,
      csY + 16.5
    );
  }

  // Calibrated Millimeter Scale Bar for Smithsonian Exhibition Blueprint Theme (Bottom-Right of Stage)
  if (isSmithsonian) {
    const barW = 240;
    const barH = 44;
    const barX = sr.x + sr.w - barW - 24;
    const barY = sr.y + sr.h - barH - 18;
    drawRoundedRect(ctx, barX, barY, barW, barH, 8);
    ctx.fillStyle = 'rgba(6, 20, 40, 0.86)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(229, 193, 88, 0.58)';
    ctx.stroke();

    ctx.font = `700 9.5px ${MONO_STACK}`;
    ctx.fillStyle = '#e5c158';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(copy.poster.scaleBarCaption, barX + 12, barY + 14);

    // Alternating 4-segment precision scale strip
    const segX = barX + 12;
    const segY = barY + 20;
    const segTotalW = barW - 24;
    const segW = segTotalW / 4;
    for (let s = 0; s < 4; s++) {
      ctx.fillStyle = s % 2 === 0 ? '#e5c158' : '#dbeafe';
      ctx.fillRect(segX + s * segW, segY, segW, 6);
    }
    ctx.strokeStyle = 'rgba(229, 193, 88, 0.72)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(segX, segY, segTotalW, 6);

    const scaleMarks = metadata.isHeavyScale
      ? ['0', '1000', '2000 mm']
      : ['0', '100', '200 mm'];
    ctx.font = `700 9px ${MONO_STACK}`;
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'left';
    ctx.fillText(scaleMarks[0], segX, barY + 38);
    ctx.textAlign = 'center';
    ctx.fillText(scaleMarks[1], segX + segTotalW * 0.5, barY + 38);
    ctx.textAlign = 'right';
    ctx.fillText(scaleMarks[2], segX + segTotalW, barY + 38);
  }

  ctx.restore();

  // Outer Stage Bezel Stroke
  drawRoundedRect(ctx, sr.x, sr.y, sr.w, sr.h, 16);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = theme.stageBorder;
  ctx.stroke();

  // 4. Bilingual Title & Operating Mechanism Card
  const ir = layout.identityRect;
  drawRoundedRect(ctx, ir.x, ir.y, ir.w, ir.h, 14);
  ctx.fillStyle = theme.cardBg;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = theme.cardBorder;
  ctx.stroke();

  // Left Accent Bar
  drawRoundedRect(ctx, ir.x + 14, ir.y + 16, 5, ir.h - 32, 2.5);
  ctx.fillStyle = theme.accentPrimary;
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const titleMaxW = ir.w - 48;

  fitFontToWidth(
    ctx,
    metadata.primaryTitle,
    titleMaxW,
    900,
    aspect === '16:9' ? 30 : 32,
    20,
    SANS_STACK
  );
  ctx.fillStyle = theme.textPrimary;
  ctx.fillText(
    truncateTextToWidth(ctx, metadata.primaryTitle, titleMaxW),
    ir.x + 30,
    ir.y + (aspect === '16:9' ? 43 : 48)
  );

  fitFontToWidth(
    ctx,
    metadata.secondaryTitle,
    titleMaxW,
    600,
    aspect === '16:9' ? 15.5 : 16.5,
    12,
    SANS_STACK
  );
  ctx.fillStyle = theme.accentPrimary;
  ctx.fillText(
    truncateTextToWidth(ctx, metadata.secondaryTitle, titleMaxW),
    ir.x + 30,
    ir.y + (aspect === '16:9' ? 68 : 77)
  );

  fitFontToWidth(
    ctx,
    metadata.originAndMechanismPrimary,
    titleMaxW,
    600,
    14,
    9,
    SANS_STACK
  );
  ctx.fillStyle = theme.textSecondary;
  ctx.fillText(
    truncateTextToWidth(ctx, metadata.originAndMechanismPrimary, titleMaxW),
    ir.x + 30,
    ir.y + (aspect === '16:9' ? 95 : 107)
  );

  if (aspect === '4:5') {
    fitFontToWidth(
      ctx,
      metadata.originAndMechanismSecondary,
      titleMaxW,
      500,
      12.5,
      10,
      SANS_STACK
    );
    ctx.fillStyle = theme.textMuted;
    ctx.fillText(
      truncateTextToWidth(
        ctx,
        metadata.originAndMechanismSecondary,
        titleMaxW
      ),
      ir.x + 30,
      ir.y + 129
    );
  }

  // 5. 4-Cell `1:1` Metrology Strip
  for (let i = 0; i < 4; i++) {
    const mr = layout.metrologyRects[i];
    const cell = metadata.metrologyCells[i];
    const cellMaxW = mr.w - 28;

    drawRoundedRect(ctx, mr.x, mr.y, mr.w, mr.h, 13);
    ctx.fillStyle = theme.cardBg;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = theme.cardBorder;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    fitFontToWidth(ctx, cell.label, cellMaxW, 800, 11, 8.5, MONO_STACK);
    ctx.fillStyle = theme.accentPrimary;
    ctx.fillText(
      truncateTextToWidth(ctx, cell.label, cellMaxW),
      mr.x + 16,
      mr.y + 28
    );

    fitFontToWidth(ctx, cell.value, cellMaxW, 900, 20, 9, MONO_STACK);
    ctx.fillStyle = theme.textPrimary;
    ctx.fillText(
      truncateTextToWidth(ctx, cell.value, cellMaxW),
      mr.x + 16,
      mr.y + 68
    );

    // Subtle divider line
    ctx.beginPath();
    ctx.moveTo(mr.x + 16, mr.y + 86);
    ctx.lineTo(mr.x + mr.w - 16, mr.y + 86);
    ctx.strokeStyle = theme.cardBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    fitFontToWidth(ctx, cell.subValue, cellMaxW, 600, 12, 8.5, SANS_STACK);
    ctx.fillStyle = theme.textMuted;
    ctx.fillText(
      truncateTextToWidth(ctx, cell.subValue, cellMaxW),
      mr.x + 16,
      mr.y + 114
    );
  }

  // 6. Quantitative Internal Ballistics Curve Card
  const cr = layout.curveRect;
  drawRoundedRect(ctx, cr.x, cr.y, cr.w, cr.h, 14);
  ctx.fillStyle = theme.cardBg;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = theme.cardBorder;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 11px ${MONO_STACK}`;
  ctx.fillStyle = theme.accentPrimary;
  ctx.fillText(
    truncateTextToWidth(ctx, metadata.curveTitle, cr.w - 32),
    cr.x + 16,
    cr.y + 26
  );

  ctx.font = `700 12px ${MONO_STACK}`;
  ctx.fillStyle = theme.textSecondary;
  const peakReadout = `Pmax ${metadata.peakPressureMpa} MPa  ·  V0 ${metadata.muzzleVelocityMps} m/s`;
  ctx.fillText(
    truncateTextToWidth(ctx, peakReadout, cr.w - 32),
    cr.x + 16,
    cr.y + 46
  );

  const plotX = cr.x + 18;
  const plotY = cr.y + 64;
  const plotW = cr.w - 36;
  const plotH = cr.h - 86;

  // Plot frame & horizontal gridlines
  drawRoundedRect(ctx, plotX, plotY, plotW, plotH, 8);
  ctx.fillStyle = theme.isLight
    ? 'rgba(241, 245, 249, 0.9)'
    : 'rgba(6, 10, 18, 0.62)';
  ctx.fill();
  ctx.strokeStyle = theme.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  for (let g = 1; g <= 3; g++) {
    const gy = plotY + (plotH * g) / 4;
    ctx.beginPath();
    ctx.moveTo(plotX + 6, gy);
    ctx.lineTo(plotX + plotW - 6, gy);
    ctx.strokeStyle = theme.gridColor;
    ctx.stroke();
  }

  // Pressure P(t) filled area & stroke
  const samples = metadata.curveSamples;
  if (samples.length > 1) {
    const padIn = 10;
    const innerPW = plotW - padIn * 2;
    const innerPH = plotH - padIn * 2;

    ctx.beginPath();
    samples.forEach((pt, idx) => {
      const px = plotX + padIn + (idx / (samples.length - 1)) * innerPW;
      const py = plotY + padIn + (1 - pt.pressureNorm) * innerPH;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    const lastX = plotX + padIn + innerPW;
    const baseLineY = plotY + padIn + innerPH;
    ctx.lineTo(lastX, baseLineY);
    ctx.lineTo(plotX + padIn, baseLineY);
    ctx.closePath();

    const pGrad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
    pGrad.addColorStop(0, theme.accentSoftBg);
    pGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pGrad;
    ctx.fill();

    // P(t) solid line
    ctx.beginPath();
    samples.forEach((pt, idx) => {
      const px = plotX + padIn + (idx / (samples.length - 1)) * innerPW;
      const py = plotY + padIn + (1 - pt.pressureNorm) * innerPH;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = theme.accentPrimary;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // V(t) dashed velocity curve
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    samples.forEach((pt, idx) => {
      const px = plotX + padIn + (idx / (samples.length - 1)) * innerPW;
      const py = plotY + padIn + (1 - pt.velocityNorm) * innerPH;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = theme.accentSecondary;
    ctx.lineWidth = 2.0;
    ctx.stroke();
    ctx.restore();
  }

  // 7. Scannable ISO 18004 QR Deep-Link Card
  const qr = layout.qrRect;
  drawRoundedRect(ctx, qr.x, qr.y, qr.w, qr.h, 14);
  ctx.fillStyle = theme.cardBg;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = theme.accentPrimary;
  ctx.stroke();

  const matrix = metadata.qrMatrix;
  const n = matrix.length;
  const quietModules = 3;
  const totalModules = n + quietModules * 2;
  const maxQrBox = Math.min(qr.h - 32, aspect === '16:9' ? 196 : 206);
  const modPx = Math.max(2, Math.floor(maxQrBox / totalModules));
  const qrBoxSize = modPx * totalModules;
  const qrBoxX = Math.round(qr.x + 16);
  const qrBoxY = Math.round(qr.y + (qr.h - qrBoxSize) * 0.5);

  drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 10);
  ctx.fillStyle = theme.qrLight;
  ctx.fill();

  ctx.fillStyle = theme.qrDark;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(
          qrBoxX + (c + quietModules) * modPx,
          qrBoxY + (r + quietModules) * modPx,
          modPx,
          modPx
        );
      }
    }
  }

  // QR Right Caption Block
  const capX = qrBoxX + qrBoxSize + 16;
  const capW = Math.max(80, qr.x + qr.w - capX - 14);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `900 12px ${MONO_STACK}`;
  ctx.fillStyle = theme.accentPrimary;
  ctx.fillText(metadata.bayCode, capX, qr.y + 42);

  // Multi-line wrap for QR Title & Sub
  const drawWrappedLines = (
    text: string,
    startX: number,
    startY: number,
    maxW: number,
    lineH: number,
    maxLines: number
  ): number => {
    const chars = Array.from(text);
    const isSpaceSeparated = text.includes(' ') && !/[\u4e00-\u9fff]/.test(text);
    const tokens = isSpaceSeparated ? text.split(/\s+/) : chars;
    let cur = '';
    let yPos = startY;
    let linesDrawn = 0;

    for (let i = 0; i < tokens.length; i++) {
      const sep = isSpaceSeparated && cur ? ' ' : '';
      const candidate = `${cur}${sep}${tokens[i]}`;
      if (ctx.measureText(candidate).width > maxW && cur) {
        linesDrawn += 1;
        if (linesDrawn >= maxLines) {
          ctx.fillText(truncateTextToWidth(ctx, candidate, maxW), startX, yPos);
          return yPos + lineH;
        }
        ctx.fillText(cur, startX, yPos);
        cur = tokens[i];
        yPos += lineH;
      } else {
        cur = candidate;
      }
    }
    if (cur) {
      ctx.fillText(truncateTextToWidth(ctx, cur, maxW), startX, yPos);
      yPos += lineH;
    }
    return yPos;
  };

  ctx.font = `800 16px ${SANS_STACK}`;
  ctx.fillStyle = theme.textPrimary;
  let nextCapY = drawWrappedLines(
    copy.poster.qrTitle,
    capX,
    qr.y + 72,
    capW,
    22,
    3
  );

  ctx.font = `500 ${aspect === '16:9' ? 11.5 : 12.5}px ${SANS_STACK}`;
  ctx.fillStyle = theme.textSecondary;
  nextCapY = drawWrappedLines(
    copy.poster.qrSub,
    capX,
    nextCapY + 8,
    capW,
    aspect === '16:9' ? 16 : 18,
    4
  );

  ctx.font = `700 10px ${MONO_STACK}`;
  ctx.fillStyle = theme.textMuted;
  drawWrappedLines(
    copy.poster.qrCutawayHint,
    capX,
    Math.min(qr.y + qr.h - 22, nextCapY + 10),
    capW,
    14,
    2
  );

  // 8. Micro Colophon Footer
  const fr = layout.footerRect;
  ctx.fillStyle = theme.textMuted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  fitFontToWidth(ctx, copy.poster.colophon, fr.w * 0.52, 700, 11, 7.5, MONO_STACK);
  ctx.fillText(
    truncateTextToWidth(ctx, copy.poster.colophon, fr.w * 0.52),
    fr.x,
    fr.y + fr.h * 0.5
  );

  ctx.textAlign = 'right';
  const cleanDisplayUrl = metadata.deepLinkUrl.replace(/^https?:\/\//i, '');
  fitFontToWidth(ctx, cleanDisplayUrl, fr.w * 0.46, 700, 11, 7.2, MONO_STACK);
  ctx.fillText(
    truncateTextToWidth(ctx, cleanDisplayUrl, fr.w * 0.46),
    fr.x + fr.w,
    fr.y + fr.h * 0.5
  );

  ctx.restore();
}
