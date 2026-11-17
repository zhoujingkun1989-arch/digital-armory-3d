import React, { useEffect, useRef, useState } from 'react';
import {
  getArcheryProjectileMeta,
  type ArcheryProjectileSpec,
} from '../../engine/cartridges/cartridgeSpecs';
import { playbackClock } from '../../engine/clock/playbackClock';
import {
  computeGasPortUncoverF,
  computeSafeUnlockF,
  createInternalBallisticsSample,
  evaluateInternalBallisticsInto,
  getArmoryPhysicsState,
  getCaliberBallisticsSpec,
  getWeaponFiringTiming,
  type BallisticPhaseId,
  type InternalBallisticsSample,
  type WeaponFiringTiming,
} from '../../engine/physics/armoryPhysics';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import type { CaliberProfile, WeaponId } from '../../weapons/types';

// ============================================================================
// WP-04 · Real-Time Internal Ballistics Telemetry Oscilloscope
// 60fps Canvas2D trace driven by `requestAnimationFrame` + `playbackClock`
// (ZERO 60Hz React state updates — digital readouts are written imperatively).
// ============================================================================

export const TELEMETRY_HUD_STRINGS = {
  zh: {
    title: '内弹道实时遥测示波器',
    subtitle: 'SAAMI / CIP 膛压 P(t) · 弹头膛内速度 V(t)',
    pressure: '膛压',
    velocity: '弹速',
    energy: '动能',
    barrelTemp: '枪管温度',
    shots: '射弹数',
    fouling: '积碳',
    peak: '峰值膛压',
    muzzleVelocity: '初速',
    muzzleEnergy: '枪口动能',
    safeUnlock: '安全开锁窗口',
    pressureLocked: '高压闭锁区',
    gasPort: '导气孔',
    ignition: '击发点火',
    muzzleExit: '弹头出膛',
    eject: '抛壳',
    battery: '复进闭锁',
    scrubHint: '拖拽曲线可逐帧控制击发进度',
    overPressure: '膛压未泄 · 禁止开锁',
    safeToUnlock: '残压安全 · 允许开锁',
    phaseCocked: '待击',
    phasePressureRise: '点火升压',
    phaseBoreTravel: '膛内加速',
    phaseBlowdown: '出膛泄压',
    phaseExtraction: '开锁抽壳',
    phaseEjectionFeed: '抛壳供弹',
    phaseLockup: '复进闭锁',
    zoomBore: '膛内放大',
    fullCycle: '全周期 0–100%',
    archeryTitle: '复合弓弩拉距力与弹速遥测仪',
    archerySubtitle: 'ATA / IBO 拉力曲线 F(x) · 矢箭做功速度 V(t)',
    archeryForce: '瞬时拉力',
    archeryVelocity: '箭速',
    archeryPeakDraw: '峰值拉力',
    archeryLetOff: '省力比',
    archeryBrace: '弓档距',
    archeryPowerStroke: '做功行程',
    archeryKinetic: '矢箭动能',
    archeryValley: '省力谷',
    archeryRelease: '撒放离弦',
    archeryLaunch: '脱轨飞出',
    archeryReNock: '复位待箭',
    archeryDrawBand: '拉弓凸轮储能',
    archeryStrokeBand: '做功加速段',
    archeryZoomStroke: '做功段放大',
    archeryChargedAlert: '弓臂储能拉满 · 严禁空放',
    archerySafeAlert: '抗干射保护待命 · 弓弦正常',
    archeryPhaseReady: '搭箭待拉',
    archeryPhaseDraw: '凸轮储能拉弓',
    archeryPhaseValley: '省力谷稳瞄',
    archeryPhaseLaunch: '弦推加速离弦',
    archeryPhaseClear: '弓臂阻尼回稳',
    archeryPhaseReNock: '箭壶补箭归位',
  },
  en: {
    title: 'Internal Ballistics Telemetry Scope',
    subtitle: 'SAAMI / CIP Chamber Pressure P(t) · Bore Velocity V(t)',
    pressure: 'Pressure',
    velocity: 'Velocity',
    energy: 'Energy',
    barrelTemp: 'Barrel',
    shots: 'Shots',
    fouling: 'Fouling',
    peak: 'Peak P',
    muzzleVelocity: 'V₀',
    muzzleEnergy: 'E₀',
    safeUnlock: 'Safe Unlock Window',
    pressureLocked: 'Pressure-Locked',
    gasPort: 'Gas Port',
    ignition: 'Ignition',
    muzzleExit: 'Muzzle Exit',
    eject: 'Eject',
    battery: 'Battery',
    scrubHint: 'Drag the trace to scrub the firing cycle',
    overPressure: 'Chamber pressurised · unlock inhibited',
    safeToUnlock: 'Residual pressure safe · unlock permitted',
    phaseCocked: 'Cocked',
    phasePressureRise: 'Ignition / Pressure Rise',
    phaseBoreTravel: 'In-Bore Acceleration',
    phaseBlowdown: 'Muzzle Blowdown',
    phaseExtraction: 'Unlock / Extraction',
    phaseEjectionFeed: 'Ejection / Feed',
    phaseLockup: 'Lockup',
    zoomBore: 'Bore Zoom',
    fullCycle: 'Full Cycle 0–100%',
    archeryTitle: 'Archery Draw-Force & Launch Telemetry Scope',
    archerySubtitle: 'ATA / IBO Draw-Force Curve F(x) · Power-Stroke Velocity V(t)',
    archeryForce: 'Draw Force',
    archeryVelocity: 'Arrow V',
    archeryPeakDraw: 'Peak Draw',
    archeryLetOff: 'Let-Off',
    archeryBrace: 'Brace Ht',
    archeryPowerStroke: 'Stroke',
    archeryKinetic: 'KE',
    archeryValley: 'Valley',
    archeryRelease: 'Release',
    archeryLaunch: 'Arrow Exit',
    archeryReNock: 'Re-Nock',
    archeryDrawBand: 'Cam Draw / Store',
    archeryStrokeBand: 'Power-Stroke Thrust',
    archeryZoomStroke: 'Power Zoom',
    archeryChargedAlert: 'Limbs fully loaded · never dry-fire',
    archerySafeAlert: 'Anti-dry-fire ready · string clear',
    archeryPhaseReady: 'Nocked / Ready',
    archeryPhaseDraw: 'Cam Draw & Storage',
    archeryPhaseValley: 'Full-Draw Let-Off',
    archeryPhaseLaunch: 'Power-Stroke Launch',
    archeryPhaseClear: 'Limb / Vane Damping',
    archeryPhaseReNock: 'Quiver Re-Nock',
  },
} as const;

type HudStrings = (typeof TELEMETRY_HUD_STRINGS)[LanguageCode];

const PHASE_LABEL_KEY: Record<BallisticPhaseId, keyof HudStrings> = {
  cocked: 'phaseCocked',
  pressure_rise: 'phasePressureRise',
  bore_travel: 'phaseBoreTravel',
  blowdown: 'phaseBlowdown',
  extraction: 'phaseExtraction',
  ejection_feed: 'phaseEjectionFeed',
  lockup: 'phaseLockup',
};

const TRACE_SAMPLES = 320;
const PLOT_PAD_L = 44;
const PLOT_PAD_R = 46;
const PLOT_PAD_T = 14;
const STRIP_H = 10;
const STRIP_GAP = 18;
const HUD_HEIGHT = 168;

const C_BG = 'rgba(6, 10, 16, 0.86)';
const C_GRID = 'rgba(148, 163, 184, 0.12)';
const C_GRID_MAJOR = 'rgba(148, 163, 184, 0.24)';
const C_PRESSURE = '#f59e0b';
const C_PRESSURE_HOT = '#dc2626';
const C_VELOCITY = '#22d3ee';
const C_SAFE = 'rgba(34, 197, 94, 0.13)';
const C_LOCKED = 'rgba(220, 38, 38, 0.10)';
const C_TEXT = 'rgba(203, 213, 225, 0.82)';
const C_MUTED = 'rgba(148, 163, 184, 0.62)';
const C_CURSOR = '#f8fafc';

const ROOT_STYLE: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  borderRadius: 10,
  border: '1px solid rgba(148, 163, 184, 0.22)',
  background: 'linear-gradient(180deg, rgba(8,12,20,0.94), rgba(4,7,12,0.94))',
  boxShadow: '0 8px 28px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.04)',
  color: '#cbd5e1',
  fontFamily:
    "'JetBrains Mono', 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace",
  padding: '8px 10px 8px',
  boxSizing: 'border-box',
  userSelect: 'none',
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 4,
  flexWrap: 'wrap',
};

const TITLE_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#fbbf24',
};

const SUB_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: 'rgba(148,163,184,0.78)',
};

const READOUT_ROW_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 6,
  marginTop: 6,
};

const CELL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '3.5px 7px',
  borderRadius: 6,
  background: 'rgba(15, 23, 42, 0.72)',
  border: '1px solid rgba(51, 65, 85, 0.6)',
  minWidth: 0,
};

const CELL_LABEL_STYLE: React.CSSProperties = {
  fontSize: 9.5,
  color: 'rgba(148,163,184,0.86)',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const CELL_VALUE_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

const STATUS_STYLE: React.CSSProperties = {
  fontSize: 10,
  marginTop: 5,
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  color: 'rgba(148,163,184,0.85)',
};

const CANVAS_STYLE: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: HUD_HEIGHT,
  cursor: 'ew-resize',
  touchAction: 'none',
};

interface TraceCache {
  key: string;
  caliber: CaliberProfile;
  isArchery: boolean;
  archeryMeta: ArcheryProjectileSpec | null;
  hasNativeArcherySpec: boolean;
  peakValue: number;
  timing: Readonly<WeaponFiringTiming>;
  fMin: number;
  fMax: number;
  pAxisMax: number;
  vAxisMax: number;
  safeF: number;
  gasF: number | null;
  peakF: number;
  pressure: Float32Array;
  velocity: Float32Array;
  background: HTMLCanvasElement | null;
  cssW: number;
  dpr: number;
}

function isArcheryWeaponId(id: WeaponId | string): boolean {
  return id === 'lift33' || id === 'r500';
}

function resolveArcheryMetaForWeapon(
  weaponId: WeaponId | string,
  caliber: string
): ArcheryProjectileSpec | null {
  if (caliber === 'arrow_400gr' || caliber === 'bolt_400gr') {
    return getArcheryProjectileMeta(caliber);
  }
  if (weaponId === 'lift33') return getArcheryProjectileMeta('arrow_400gr');
  if (weaponId === 'r500') return getArcheryProjectileMeta('bolt_400gr');
  return null;
}

function clamp01Archery(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function evaluateArcherySample(
  meta: ArcheryProjectileSpec,
  f: number,
  out: InternalBallisticsSample,
  timing: Readonly<WeaponFiringTiming>,
  hasNativeSpec: boolean,
  caliber: CaliberProfile
): void {
  if (hasNativeSpec) {
    evaluateInternalBallisticsInto(caliber, f, out, timing);
    return;
  }
  const exitF = meta.caliber === 'arrow_400gr' ? 0.5 : 0.48;
  const peakN = meta.peakDrawForceN;
  const holdN = peakN * (1 - meta.letOffPercent / 100);
  let forceN = 0;
  let velMps = 0;

  if (f > 0.01 && f < 0.24) {
    const u = (f - 0.01) / 0.23;
    if (u < 0.65) {
      forceN = peakN * Math.sin((u / 0.65) * (Math.PI * 0.5));
    } else {
      const d = (u - 0.65) / 0.35;
      const smooth = d * d * (3 - 2 * d);
      forceN = peakN - (peakN - holdN) * smooth;
    }
  } else if (f >= 0.24 && f < 0.32) {
    forceN = holdN;
  } else if (f >= 0.32 && f <= exitF) {
    const u = clamp01Archery((f - 0.32) / Math.max(0.01, exitF - 0.32));
    // Reverse of draw force-draw profile: surges to cam peak near mid-stroke then tapers at brace
    const hump = Math.sin(u * Math.PI);
    forceN = holdN * (1 - u) + peakN * 0.94 * Math.pow(hump, 0.85);
    velMps = meta.muzzleVelocityMps * Math.pow(Math.sin(u * Math.PI * 0.5), 0.78);
  }

  out.pressureMPa = forceN;
  out.velocityMps = velMps;
  out.energyJ = 0.5 * (meta.projectileMassG / 1000) * velMps * velMps;
  out.isOverSafeUnlockThreshold = f >= 0.06 && f < 0.32;
  out.phase =
    f < 0.01
      ? 'cocked'
      : f < 0.24
        ? 'pressure_rise'
        : f < exitF
          ? 'bore_travel'
          : f < 0.62
            ? 'blowdown'
            : f < 0.78
              ? 'extraction'
              : f < 0.94
                ? 'ejection_feed'
                : 'lockup';
}

function getArcheryPhaseLabelKey(
  f: number,
  exitF: number
): keyof HudStrings {
  if (f < 0.015 || f >= 0.985) return 'archeryPhaseReady';
  if (f < 0.24) return 'archeryPhaseDraw';
  if (f < 0.32) return 'archeryPhaseValley';
  if (f <= exitF) return 'archeryPhaseLaunch';
  if (f < 0.66) return 'archeryPhaseClear';
  return 'archeryPhaseReNock';
}

function niceCeil(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

function buildTraceCache(
  weaponId: WeaponId,
  lang: LanguageCode,
  cssW: number,
  dpr: number,
  zoomBore: boolean
): TraceCache {
  const caliber = getWeaponManifest(weaponId).caliberProfile;
  const spec = getCaliberBallisticsSpec(caliber);
  const isArchery = isArcheryWeaponId(weaponId);
  const archeryMeta = isArchery
    ? resolveArcheryMetaForWeapon(weaponId, caliber as string)
    : null;
  const hasNativeArcherySpec =
    isArchery && (spec.caliber as string) === (caliber as string);
  const timing = getWeaponFiringTiming(weaponId);
  const effectiveExitF = isArchery && archeryMeta
    ? archeryMeta.caliber === 'arrow_400gr'
      ? 0.5
      : 0.48
    : timing.muzzleExitF;
  const fMin = zoomBore
    ? isArchery
      ? 0
      : Math.max(0, timing.ignitionF - 0.06)
    : 0;
  const fMax = zoomBore
    ? isArchery
      ? Math.min(1, effectiveExitF + 0.14)
      : Math.min(1, timing.ejectF + 0.12)
    : 1;
  const sample = createInternalBallisticsSample(caliber);
  const pressure = new Float32Array(TRACE_SAMPLES + 1);
  const velocity = new Float32Array(TRACE_SAMPLES + 1);
  for (let i = 0; i <= TRACE_SAMPLES; i++) {
    const f = fMin + ((fMax - fMin) * i) / TRACE_SAMPLES;
    if (isArchery && archeryMeta) {
      evaluateArcherySample(
        archeryMeta,
        f,
        sample,
        timing,
        hasNativeArcherySpec,
        caliber
      );
    } else {
      evaluateInternalBallisticsInto(caliber, f, sample, timing);
    }
    pressure[i] = sample.pressureMPa;
    velocity[i] = sample.velocityMps;
  }
  const peakValue =
    isArchery && archeryMeta
      ? hasNativeArcherySpec
        ? spec.peakPressureMPa
        : archeryMeta.peakDrawForceN
      : spec.peakPressureMPa;
  const topV =
    isArchery && archeryMeta
      ? hasNativeArcherySpec
        ? spec.muzzleVelocityMps
        : archeryMeta.muzzleVelocityMps
      : spec.muzzleVelocityMps;

  const cache: TraceCache = {
    key: `${weaponId}|${lang}|${cssW}|${dpr}|${zoomBore ? 1 : 0}`,
    caliber,
    isArchery,
    archeryMeta,
    hasNativeArcherySpec,
    peakValue,
    timing: isArchery && !hasNativeArcherySpec
      ? { ...timing, ignitionF: 0.32, muzzleExitF: effectiveExitF }
      : timing,
    fMin,
    fMax,
    pAxisMax: niceCeil(
      peakValue * 1.15,
      isArchery ? (peakValue > 500 ? 200 : 50) : 50
    ),
    vAxisMax: niceCeil(topV * 1.15, isArchery ? 25 : 100),
    safeF: isArchery ? 0.32 : computeSafeUnlockF(caliber, timing),
    gasF: isArchery ? null : computeGasPortUncoverF(caliber, timing),
    peakF: isArchery
      ? 0.16
      : timing.ignitionF + spec.peakU * (timing.muzzleExitF - timing.ignitionF),
    pressure,
    velocity,
    background: null,
    cssW,
    dpr,
  };
  cache.background = renderBackground(cache, TELEMETRY_HUD_STRINGS[lang]);
  return cache;
}

interface PlotRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  stripY: number;
}

function plotRect(cssW: number): PlotRect {
  const y1 = HUD_HEIGHT - STRIP_H - STRIP_GAP;
  return {
    x0: PLOT_PAD_L,
    x1: Math.max(PLOT_PAD_L + 40, cssW - PLOT_PAD_R),
    y0: PLOT_PAD_T,
    y1,
    stripY: HUD_HEIGHT - STRIP_H - 2,
  };
}

function fToX(c: TraceCache, r: PlotRect, f: number): number {
  return r.x0 + ((f - c.fMin) / (c.fMax - c.fMin)) * (r.x1 - r.x0);
}

function renderBackground(
  c: TraceCache,
  s: HudStrings
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(c.cssW * c.dpr));
  canvas.height = Math.round(HUD_HEIGHT * c.dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(c.dpr, c.dpr);
  const r = plotRect(c.cssW);
  const pw = r.x1 - r.x0;
  const ph = r.y1 - r.y0;

  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, c.cssW, HUD_HEIGHT);

  // Pressure-locked (red) and safe-unlock (green) windows — or Archery Draw & Power-Stroke bands
  if (c.isArchery) {
    const xDraw0 = fToX(c, r, 0.02);
    const xRel = fToX(c, r, 0.32);
    const xExit = fToX(c, r, c.timing.muzzleExitF);
    ctx.fillStyle = C_LOCKED;
    ctx.fillRect(xDraw0, r.y0, Math.max(0, xRel - xDraw0), ph);
    ctx.fillStyle = C_SAFE;
    ctx.fillRect(xRel, r.y0, Math.max(0, Math.min(r.x1, xExit) - xRel), ph);
    ctx.font = '600 9px ui-monospace, Menlo, monospace';
    if (xRel - Math.max(r.x0, xDraw0) >= 84) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.textAlign = 'center';
      ctx.fillText(s.archeryDrawBand, (Math.max(r.x0, xDraw0) + xRel) * 0.5, r.y0 + 10);
    }
    if (Math.min(r.x1, xExit) - xRel >= 76) {
      ctx.fillStyle = 'rgba(74, 222, 128, 0.85)';
      ctx.textAlign = 'left';
      ctx.fillText(s.archeryStrokeBand, xRel + 4, r.y0 + 10);
    }
  } else {
    const xIgn = fToX(c, r, c.timing.ignitionF);
    const xSafe = fToX(c, r, c.safeF);
    const xUnlockEnd = fToX(c, r, c.timing.batteryF);
    ctx.fillStyle = C_LOCKED;
    ctx.fillRect(xIgn, r.y0, xSafe - xIgn, ph);
    ctx.fillStyle = C_SAFE;
    ctx.fillRect(xSafe, r.y0, Math.max(0, Math.min(r.x1, xUnlockEnd) - xSafe), ph);
    ctx.font = '600 9px ui-monospace, Menlo, monospace';
    if (r.x1 - xSafe >= 76) {
      ctx.fillStyle = 'rgba(74, 222, 128, 0.85)';
      ctx.textAlign = 'left';
      ctx.fillText(s.safeUnlock, Math.max(r.x0 + 4, xSafe + 4), r.y0 + 10);
    }
    if (xSafe - Math.max(r.x0, xIgn) >= 88) {
      ctx.fillStyle = 'rgba(248, 113, 113, 0.75)';
      ctx.textAlign = 'right';
      ctx.fillText(s.pressureLocked, xSafe - 4, r.y0 + 10);
    }
  }

  // Graticule: 10 × 4 divisions
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = Math.round(r.x0 + (pw * i) / 10) + 0.5;
    ctx.strokeStyle = i % 5 === 0 ? C_GRID_MAJOR : C_GRID;
    ctx.beginPath();
    ctx.moveTo(x, r.y0);
    ctx.lineTo(x, r.y1);
    ctx.stroke();
  }
  ctx.font = '9px ui-monospace, Menlo, monospace';
  for (let j = 0; j <= 4; j++) {
    const y = Math.round(r.y1 - (ph * j) / 4) + 0.5;
    ctx.strokeStyle = j === 0 ? C_GRID_MAJOR : C_GRID;
    ctx.beginPath();
    ctx.moveTo(r.x0, y);
    ctx.lineTo(r.x1, y);
    ctx.stroke();
    ctx.fillStyle = C_PRESSURE;
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round((c.pAxisMax * j) / 4)), r.x0 - 5, y + 3);
    ctx.fillStyle = C_VELOCITY;
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.round((c.vAxisMax * j) / 4)), r.x1 + 5, y + 3);
  }
  ctx.fillStyle = C_PRESSURE;
  ctx.textAlign = 'left';
  ctx.fillText(c.isArchery ? 'N' : 'MPa', 4, r.y0 + 2);
  ctx.fillStyle = C_VELOCITY;
  ctx.textAlign = 'right';
  ctx.fillText('m/s', c.cssW - 4, r.y0 + 2);

  // Event markers (sorted & label-decollided so full-cycle 0..1 never overlaps)
  const markers: [number, string][] = c.isArchery
    ? [
        [0.16, s.archeryPeakDraw],
        [0.24, s.archeryValley],
        [0.32, s.archeryRelease],
        [c.timing.muzzleExitF, s.archeryLaunch],
      ]
    : [
        [c.timing.ignitionF, s.ignition],
        [c.timing.muzzleExitF, s.muzzleExit],
        [c.timing.ejectF, s.eject],
      ];
  if (!c.isArchery && c.gasF !== null) markers.push([c.gasF, s.gasPort]);
  markers.sort((a, b) => a[0] - b[0]);
  ctx.setLineDash([3, 3]);
  let lastLabelRight = -Infinity;
  for (let i = 0; i < markers.length; i++) {
    const [f, label] = markers[i];
    if (f < c.fMin || f > c.fMax) continue;
    const x = Math.round(fToX(c, r, f)) + 0.5;
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.28)';
    ctx.beginPath();
    ctx.moveTo(x, r.y0);
    ctx.lineTo(x, r.y1);
    ctx.stroke();

    const estW = Math.max(ctx.measureText(label).width, label.length * 6.5);
    const halfW = estW * 0.5 + 3;
    const lx = Math.max(r.x0 + halfW, Math.min(r.x1 - halfW, x));
    if (lx - halfW >= lastLabelRight + 8) {
      ctx.fillStyle = C_MUTED;
      ctx.textAlign = 'center';
      ctx.fillText(label, lx, r.y1 + 11);
      lastLabelRight = lx + halfW;
    }
  }
  ctx.setLineDash([]);

  // Pressure trace (amber → crimson gradient, filled)
  const grad = ctx.createLinearGradient(0, r.y1, 0, r.y0);
  grad.addColorStop(0, C_PRESSURE);
  grad.addColorStop(1, C_PRESSURE_HOT);
  ctx.beginPath();
  for (let i = 0; i <= TRACE_SAMPLES; i++) {
    const x = r.x0 + (pw * i) / TRACE_SAMPLES;
    const y = r.y1 - (c.pressure[i] / c.pAxisMax) * ph;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(r.x1, r.y1);
  ctx.lineTo(r.x0, r.y1);
  ctx.closePath();
  ctx.fillStyle = 'rgba(245, 158, 11, 0.10)';
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i <= TRACE_SAMPLES; i++) {
    const x = r.x0 + (pw * i) / TRACE_SAMPLES;
    const y = r.y1 - (c.pressure[i] / c.pAxisMax) * ph;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.8;
  ctx.shadowColor = 'rgba(245, 158, 11, 0.55)';
  ctx.shadowBlur = 6;
  ctx.stroke();

  // Velocity trace (cyan)
  ctx.beginPath();
  for (let i = 0; i <= TRACE_SAMPLES; i++) {
    const x = r.x0 + (pw * i) / TRACE_SAMPLES;
    const y = r.y1 - (c.velocity[i] / c.vAxisMax) * ph;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = C_VELOCITY;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = 'rgba(34, 211, 238, 0.55)';
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Peak pressure/force tag (clamped clear of top window header row)
  const xPeak = fToX(c, r, c.peakF);
  const yPeak = r.y1 - (c.peakValue / c.pAxisMax) * ph;
  ctx.fillStyle = C_PRESSURE_HOT;
  ctx.beginPath();
  ctx.arc(xPeak, yPeak, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fca5a5';
  ctx.textAlign = 'left';
  const peakTag = c.isArchery
    ? `${Math.round(c.peakValue)} N`
    : `${c.peakValue} MPa`;
  const peakY = Math.max(r.y0 + 21, yPeak + 4);
  ctx.fillText(peakTag, Math.min(r.x1 - 54, xPeak + 6), peakY);

  // Full-cycle strip (0..1) with zoom window + battery/re-nock marker
  ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
  ctx.fillRect(r.x0, r.stripY, pw, STRIP_H);
  const sx0 = r.x0 + c.fMin * pw;
  const sx1 = r.x0 + c.fMax * pw;
  ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
  ctx.fillRect(sx0, r.stripY, sx1 - sx0, STRIP_H);
  ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
  const bx = r.x0 + c.timing.batteryF * pw;
  ctx.fillRect(bx - 1, r.stripY, 2, STRIP_H);
  ctx.fillStyle = C_MUTED;
  ctx.textAlign = 'right';
  ctx.fillText(c.isArchery ? s.archeryReNock : s.battery, bx - 3, r.stripY + 8);
  ctx.textAlign = 'left';
  ctx.fillStyle = C_TEXT;
  ctx.fillText('0', r.x0 - 10, r.stripY + 8);
  ctx.textAlign = 'right';
  ctx.fillText('1', r.x1 + 12, r.stripY + 8);

  return canvas;
}

function formatFixed(v: number, digits: number): string {
  return v.toFixed(digits);
}

export interface BallisticsTelemetryHudProps {
  /** Override the active weapon (defaults to the store's `activeWeaponId`) */
  weaponId?: WeaponId;
  className?: string;
  style?: React.CSSProperties;
  /** Render even when the Workbench is not in firing mode */
  alwaysVisible?: boolean;
}

/**
 * Military-grade precision 60fps internal-ballistics oscilloscope:
 * Chamber Pressure P(t) (MPa, amber/crimson) + Bore Velocity V(t) (m/s, cyan),
 * shaded Safe-Unlock Window, live playhead and pointer-drag scrubbing that
 * drives `playbackClock.setFireProgress(f, true)` while pausing auto-fire.
 */
export const BallisticsTelemetryHud: React.FC<BallisticsTelemetryHudProps> = ({
  weaponId,
  className,
  style,
  alwaysVisible = false,
}) => {
  const storeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const mode = useAppStore((s) => s.mode);
  const activeWeaponId = weaponId ?? storeWeaponId;
  const s = TELEMETRY_HUD_STRINGS[lang];
  const [zoomBore, setZoomBore] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pRef = useRef<HTMLSpanElement>(null);
  const vRef = useRef<HTMLSpanElement>(null);
  const eRef = useRef<HTMLSpanElement>(null);
  const tRef = useRef<HTMLSpanElement>(null);
  const nRef = useRef<HTMLSpanElement>(null);
  const foulRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);

  const visible = alwaysVisible || mode === 'firing';
  const caliber = getWeaponManifest(activeWeaponId).caliberProfile;
  const spec = getCaliberBallisticsSpec(caliber);
  const isArchery = isArcheryWeaponId(activeWeaponId);
  const archeryMeta = isArchery
    ? resolveArcheryMetaForWeapon(activeWeaponId, caliber as string)
    : null;

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const strings = TELEMETRY_HUD_STRINGS[lang];
    const sample = createInternalBallisticsSample(caliber);
    let cache: TraceCache | null = null;
    let raf = 0;
    let lastText = -1;
    let lastPhaseKey: keyof HudStrings | null = null;
    let lastLocked: boolean | null = null;
    let dragMode: 0 | 1 | 2 = 0; // 0 idle, 1 scope zoom window, 2 full-cycle strip

    const ensureCache = (): TraceCache | null => {
      const cssW = Math.max(120, Math.round(canvas.clientWidth));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const key = `${activeWeaponId}|${lang}|${cssW}|${dpr}|${zoomBore ? 1 : 0}`;
      if (!cache || cache.key !== key) {
        cache = buildTraceCache(activeWeaponId, lang, cssW, dpr, zoomBore);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(HUD_HEIGHT * dpr);
      }
      return cache;
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ensureCache();
      if (!c) return;
      const r = plotRect(c.cssW);
      const pw = r.x1 - r.x0;
      const ph = r.y1 - r.y0;
      const f = playbackClock.getState().animatedFireProgress;
      if (c.isArchery && c.archeryMeta) {
        evaluateArcherySample(
          c.archeryMeta,
          f,
          sample,
          c.timing,
          c.hasNativeArcherySpec,
          c.caliber
        );
      } else {
        evaluateInternalBallisticsInto(c.caliber, f, sample, c.timing);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (c.background) ctx.drawImage(c.background, 0, 0);
      ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);

      // Live playhead inside the zoomed scope window
      if (f >= c.fMin && f <= c.fMax) {
        const x = fToX(c, r, f);
        ctx.strokeStyle = C_CURSOR;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, r.y0);
        ctx.lineTo(x, r.y1);
        ctx.stroke();
        ctx.globalAlpha = 1;
        const yP = r.y1 - (sample.pressureMPa / c.pAxisMax) * ph;
        const yV = r.y1 - (sample.velocityMps / c.vAxisMax) * ph;
        ctx.fillStyle = sample.isOverSafeUnlockThreshold
          ? C_PRESSURE_HOT
          : C_PRESSURE;
        ctx.beginPath();
        ctx.arc(x, yP, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C_VELOCITY;
        ctx.beginPath();
        ctx.arc(x, yV, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Full-cycle strip head
      const sx = r.x0 + f * pw;
      ctx.fillStyle = C_CURSOR;
      ctx.fillRect(sx - 1, r.stripY - 2, 2, STRIP_H + 4);

      // Imperative digital readouts (~20 Hz text refresh, zero React renders)
      const phys = getArmoryPhysicsState();
      const now = performance.now();
      if (now - lastText > 48) {
        lastText = now;
        if (c.isArchery && c.archeryMeta) {
          if (pRef.current)
            pRef.current.textContent = formatFixed(sample.pressureMPa, 0);
          if (vRef.current)
            vRef.current.textContent = formatFixed(sample.velocityMps, 1);
          if (eRef.current)
            eRef.current.textContent = formatFixed(sample.energyJ, 1);
          if (tRef.current)
            tRef.current.textContent = String(c.archeryMeta.letOffPercent);
          if (foulRef.current)
            foulRef.current.textContent = String(c.archeryMeta.braceHeightMm);
          if (nRef.current) nRef.current.textContent = String(phys.shotCount);
        } else {
          if (pRef.current)
            pRef.current.textContent = formatFixed(sample.pressureMPa, 1);
          if (vRef.current)
            vRef.current.textContent = formatFixed(sample.velocityMps, 0);
          if (eRef.current)
            eRef.current.textContent = formatFixed(sample.energyJ, 0);
          if (tRef.current)
            tRef.current.textContent = formatFixed(phys.barrelTempC, 1);
          if (foulRef.current)
            foulRef.current.textContent = formatFixed(phys.carbonFouling01 * 100, 0);
          if (nRef.current) nRef.current.textContent = String(phys.shotCount);
        }
      }
      const nextPhaseKey: keyof HudStrings = c.isArchery
        ? getArcheryPhaseLabelKey(f, c.timing.muzzleExitF)
        : PHASE_LABEL_KEY[sample.phase];
      if (nextPhaseKey !== lastPhaseKey && phaseRef.current) {
        lastPhaseKey = nextPhaseKey;
        phaseRef.current.textContent = strings[nextPhaseKey];
      }
      if (sample.isOverSafeUnlockThreshold !== lastLocked && statusRef.current) {
        lastLocked = sample.isOverSafeUnlockThreshold;
        statusRef.current.textContent = c.isArchery
          ? lastLocked
            ? strings.archeryChargedAlert
            : strings.archerySafeAlert
          : lastLocked
            ? strings.overPressure
            : strings.safeToUnlock;
        statusRef.current.style.color = lastLocked ? '#f87171' : '#4ade80';
      }
    };

    const pointerToF = (clientX: number): number => {
      const c = cache;
      if (!c) return 0;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const r = plotRect(c.cssW);
      const u = Math.min(1, Math.max(0, (x - r.x0) / (r.x1 - r.x0)));
      return dragMode === 2 ? u : c.fMin + u * (c.fMax - c.fMin);
    };

    const scrubTo = (clientX: number) => {
      playbackClock.setFireProgress(pointerToF(clientX), true);
    };

    const onPointerDown = (e: PointerEvent) => {
      const c = cache;
      if (!c) return;
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const r = plotRect(c.cssW);
      dragMode = y >= r.stripY - 6 ? 2 : 1;
      const st = useAppStore.getState();
      if (st.isFiringPlaying) st.stopFiringPlay();
      canvas.setPointerCapture(e.pointerId);
      scrubTo(e.clientX);
      e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (dragMode === 0) return;
      scrubTo(e.clientX);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (dragMode === 0) return;
      dragMode = 0;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, [visible, activeWeaponId, caliber, lang, zoomBore]);

  if (!visible) return null;

  const caliberLabel =
    isArchery && archeryMeta
      ? lang === 'zh'
        ? archeryMeta.nameZh
        : archeryMeta.nameEn
      : lang === 'zh'
        ? spec.labelZh
        : spec.labelEn;
  const headerTitle = isArchery ? s.archeryTitle : s.title;
  const headerSummary =
    isArchery && archeryMeta
      ? `${caliberLabel} · ATA/IBO · ${s.archeryPeakDraw} ${archeryMeta.peakDrawForceLb} lb (${archeryMeta.peakDrawForceN} N) · ${s.muzzleVelocity} ${archeryMeta.velocityFps} FPS (${archeryMeta.muzzleVelocityMps} m/s) · ${s.archeryKinetic} ${archeryMeta.muzzleEnergyJ.toFixed(1)} J`
      : `${caliberLabel} · ${spec.standard} · ${s.peak} ${spec.peakPressureMPa} MPa · ${s.muzzleVelocity} ${spec.muzzleVelocityMps} m/s · ${s.muzzleEnergy} ${Math.round(spec.muzzleEnergyJ).toLocaleString('en-US')} J`;

  return (
    <div
      className={className}
      style={style ? { ...ROOT_STYLE, ...style } : ROOT_STYLE}
      data-testid="ballistics-telemetry-hud"
    >
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>{headerTitle}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={SUB_STYLE}>{headerSummary}</span>
          <button
            type="button"
            onClick={() => setZoomBore((z) => !z)}
            style={{
              fontSize: 9,
              fontFamily: 'inherit',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid rgba(251, 191, 36, 0.35)',
              background: zoomBore
                ? 'rgba(245, 158, 11, 0.24)'
                : 'rgba(15, 23, 42, 0.85)',
              color: zoomBore ? '#fde68a' : '#cbd5e1',
              cursor: 'pointer',
            }}
          >
            {zoomBore ? s.fullCycle : isArchery ? s.archeryZoomStroke : s.zoomBore}
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        style={CANVAS_STYLE}
        title={s.scrubHint}
        aria-label={`${headerTitle} — ${s.scrubHint}`}
        role="img"
      />

      <div style={READOUT_ROW_STYLE}>
        <div style={CELL_STYLE}>
          <span style={CELL_LABEL_STYLE}>
            {isArchery ? `${s.archeryForce} · N` : `${s.pressure} · MPa`}
          </span>
          <span ref={pRef} style={{ ...CELL_VALUE_STYLE, color: C_PRESSURE }}>
            {isArchery ? '0' : '0.0'}
          </span>
        </div>
        <div style={CELL_STYLE}>
          <span style={CELL_LABEL_STYLE}>
            {isArchery ? `${s.archeryVelocity} · m/s` : `${s.velocity} · m/s`}
          </span>
          <span ref={vRef} style={{ ...CELL_VALUE_STYLE, color: C_VELOCITY }}>
            {isArchery ? '0.0' : '0'}
          </span>
        </div>
        <div style={CELL_STYLE}>
          <span style={CELL_LABEL_STYLE}>{s.energy} · J</span>
          <span ref={eRef} style={{ ...CELL_VALUE_STYLE, color: '#e2e8f0' }}>
            {isArchery ? '0.0' : '0'}
          </span>
        </div>
        <div style={CELL_STYLE}>
          <span style={CELL_LABEL_STYLE}>
            {isArchery ? `${s.archeryLetOff} · %` : `${s.barrelTemp} · °C`}
          </span>
          <span
            ref={tRef}
            style={{
              ...CELL_VALUE_STYLE,
              color: isArchery ? '#38bdf8' : '#fb923c',
            }}
          >
            {isArchery && archeryMeta ? String(archeryMeta.letOffPercent) : '22.0'}
          </span>
        </div>
        <div style={CELL_STYLE}>
          <span style={CELL_LABEL_STYLE}>
            {isArchery ? `${s.archeryBrace} · mm` : `${s.fouling} · %`}
          </span>
          <span ref={foulRef} style={{ ...CELL_VALUE_STYLE, color: '#a8a29e' }}>
            {isArchery && archeryMeta ? String(archeryMeta.braceHeightMm) : '0'}
          </span>
        </div>
        <div style={CELL_STYLE}>
          <span style={CELL_LABEL_STYLE}>{s.shots}</span>
          <span ref={nRef} style={{ ...CELL_VALUE_STYLE, color: '#e2e8f0' }}>
            0
          </span>
        </div>
      </div>

      <div style={STATUS_STYLE}>
        <span ref={phaseRef} style={{ color: '#fbbf24' }}>
          {isArchery ? s.archeryPhaseReady : s.phaseCocked}
        </span>
        <span ref={statusRef} style={{ color: '#4ade80' }}>
          {isArchery ? s.archerySafeAlert : s.safeToUnlock}
        </span>
      </div>
    </div>
  );
};

export default BallisticsTelemetryHud;
