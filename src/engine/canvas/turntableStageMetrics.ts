import * as THREE from 'three';
import type { WeaponId, WeaponScaleProfile } from '../../weapons/types';

export interface TurntableBoundsSpec {
  cx: number;
  minY: number;
  maxY: number;
  spanX: number;
  explode58: {
    cx: number;
    minY: number;
    maxY: number;
    spanX: number;
  };
}

/**
 * Exact 3D CSG world-space bounding envelopes across all 10 firearms at assembled (t=0)
 * and 58% semi-exploded preview (t=0.58), used to center the 3D exhibition turntable
 * and guarantee zero HUD/typography overlap on every viewport aspect ratio.
 */
export const WEAPON_TURNTABLE_BOUNDS: Readonly<
  Record<WeaponId, TurntableBoundsSpec>
> = {
  ak15: {
    cx: 3.65,
    minY: -10.7,
    maxY: 3.9,
    spanX: 44.5,
    explode58: { cx: 5.52, minY: -21.2, maxY: 12.1, spanX: 51.5 },
  },
  m4a1: {
    cx: 2.92,
    minY: -9.3,
    maxY: 3.8,
    spanX: 42.4,
    explode58: { cx: -1.33, minY: -18.3, maxY: 10.6, spanX: 50.9 },
  },
  mp5: {
    cx: 2.09,
    minY: -8.9,
    maxY: 3.5,
    spanX: 35.3,
    explode58: { cx: -1.54, minY: -13.0, maxY: 7.1, spanX: 42.6 },
  },
  g17: {
    cx: 1.38,
    minY: -9.9,
    maxY: 3.9,
    spanX: 19.9,
    explode58: { cx: -2.1, minY: -15.6, maxY: 13.3, spanX: 37.4 },
  },
  m82a1: {
    cx: 6.03,
    minY: -8.9,
    maxY: 5.7,
    spanX: 56.0,
    explode58: { cx: 6.98, minY: -14.3, maxY: 16.9, spanX: 71.1 },
  },
  awm: {
    cx: 5.0,
    minY: -5.2,
    maxY: 5.3,
    spanX: 52.0,
    explode58: { cx: 4.3, minY: -15.7, maxY: 11.5, spanX: 61.8 },
  },
  scar: {
    cx: 2.97,
    minY: -10.8,
    maxY: 4.2,
    spanX: 43.1,
    explode58: { cx: 3.77, minY: -20.8, maxY: 8.8, spanX: 51.1 },
  },
  deagle: {
    cx: 2.76,
    minY: -11.5,
    maxY: 4.7,
    spanX: 26.5,
    explode58: { cx: 2.05, minY: -16.7, maxY: 14.3, spanX: 44.1 },
  },
  aug: {
    cx: 0.98,
    minY: -8.8,
    maxY: 4.8,
    spanX: 39.0,
    explode58: { cx: 5.14, minY: -18.5, maxY: 10.2, spanX: 60.3 },
  },
  p320: {
    cx: 1.37,
    minY: -10.2,
    maxY: 4.1,
    spanX: 20.9,
    explode58: { cx: -1.54, minY: -16.6, maxY: 16.4, spanX: 32.3 },
  },
};

export function getTurntableRadius(weaponId: WeaponId): number {
  const b = WEAPON_TURNTABLE_BOUNDS[weaponId];
  return THREE.MathUtils.clamp(b.spanX * 0.3, 8.8, 16.2);
}

export interface EvaluatedTurntableEnvelope {
  cx: number;
  minY: number;
  maxY: number;
  spanX: number;
  radius: number;
  platterTopY: number;
  gridFloorY: number;
}

const _envScratch: EvaluatedTurntableEnvelope = {
  cx: 0,
  minY: -10,
  maxY: 4,
  spanX: 44,
  radius: 13.5,
  platterTopY: -10.85,
  gridFloorY: -11.45,
};

export function evaluateWeaponTurntableEnvelopeInto(
  weaponId: WeaponId,
  explodeT: number,
  out: EvaluatedTurntableEnvelope = _envScratch
): EvaluatedTurntableEnvelope {
  const b = WEAPON_TURNTABLE_BOUNDS[weaponId];
  const u = THREE.MathUtils.clamp(explodeT / 0.58, 0, 1);
  const cx = THREE.MathUtils.lerp(b.cx, b.explode58.cx, u);
  const minY = THREE.MathUtils.lerp(b.minY, b.explode58.minY, u);
  const maxY = THREE.MathUtils.lerp(b.maxY, b.explode58.maxY, u);
  const spanX = THREE.MathUtils.lerp(b.spanX, b.explode58.spanX, u);
  const radius = getTurntableRadius(weaponId);
  const platterTopY = minY - 0.85;
  const gridFloorY = platterTopY - 0.6;

  out.cx = cx;
  out.minY = minY;
  out.maxY = maxY;
  out.spanX = spanX;
  out.radius = radius;
  out.platterTopY = platterTopY;
  out.gridFloorY = gridFloorY;
  return out;
}

// ==================== Unscrolled Showcase Stage Window Rect Cache ====================
interface ShowcaseWindowRect {
  topPx: number;
  bottomPx: number;
}

let showcaseWindowRect: ShowcaseWindowRect | null = null;
const windowListeners = new Set<() => void>();

export function setShowcaseWindowBounds(rect: ShowcaseWindowRect | null): void {
  if (rect === null && showcaseWindowRect === null) {
    return;
  }
  if (
    rect &&
    showcaseWindowRect &&
    Math.abs(rect.topPx - showcaseWindowRect.topPx) < 0.5 &&
    Math.abs(rect.bottomPx - showcaseWindowRect.bottomPx) < 0.5
  ) {
    return;
  }
  showcaseWindowRect = rect;
  for (const fn of windowListeners) {
    fn();
  }
}

export function subscribeShowcaseWindowBounds(
  listener: () => void
): () => void {
  windowListeners.add(listener);
  return () => {
    windowListeners.delete(listener);
  };
}

// ==================== Showcase Live Window Manual Turntable Drag Bridge ====================
type TurntableDragFn = (dxPx: number, dyPx: number) => void;

let registeredDragFn: TurntableDragFn | null = null;
let showcaseDragging = false;
const dragStateListeners = new Set<(dragging: boolean) => void>();

export function registerTurntableDragHandler(
  fn: TurntableDragFn | null
): () => void {
  registeredDragFn = fn;
  return () => {
    if (registeredDragFn === fn) {
      registeredDragFn = null;
    }
  };
}

export function dragTurntableBy(dxPx: number, dyPx: number): void {
  registeredDragFn?.(dxPx, dyPx);
}

export function setShowcaseUserDragging(dragging: boolean): void {
  if (showcaseDragging === dragging) return;
  showcaseDragging = dragging;
  for (const fn of dragStateListeners) {
    fn(dragging);
  }
}

export function isShowcaseUserDragging(): boolean {
  return showcaseDragging;
}

export function subscribeShowcaseDragging(
  fn: (dragging: boolean) => void
): () => void {
  dragStateListeners.add(fn);
  return () => {
    dragStateListeners.delete(fn);
  };
}

// ==================== Camera View-Offset & Cylindrical Turntable Framing ====================
export interface TurntableFramingResult {
  viewOffsetX: number;
  viewOffsetY: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  horizRadius: number;
  offsetY: number;
}

const TAN_HALF_FOV_41 = Math.tan(THREE.MathUtils.degToRad(41 * 0.5));
const TURNTABLE_ELEV_RAD = THREE.MathUtils.degToRad(8.5);
const SIN_ELEV = Math.sin(TURNTABLE_ELEV_RAD);
const COS_ELEV = Math.cos(TURNTABLE_ELEV_RAD);

export function computeTurntableFraming(
  weaponId: WeaponId,
  scaleProfile: WeaponScaleProfile,
  explodeT: number,
  screen: 'showcase' | 'armory',
  viewportW: number,
  viewportH: number
): TurntableFramingResult {
  const env = evaluateWeaponTurntableEnvelopeInto(weaponId, explodeT);

  let winCx: number;
  let winCy: number;
  let availW: number;
  let availH: number;

  if (screen === 'showcase') {
    const fallbackTop = Math.min(viewportH * 0.34, 240);
    const fallbackBottom = Math.max(fallbackTop + 160, viewportH - 98);
    const rawTop = showcaseWindowRect ? showcaseWindowRect.topPx : fallbackTop;
    const rawBottom =
      showcaseWindowRect && showcaseWindowRect.bottomPx > rawTop + 80
        ? showcaseWindowRect.bottomPx
        : fallbackBottom;

    const visTop = Math.max(0, Math.min(viewportH - 140, rawTop));
    const visBottom = Math.max(visTop + 140, Math.min(viewportH, rawBottom));

    winCx = viewportW * 0.5;
    winCy = (visTop + visBottom) * 0.5;
    availW = Math.max(240, viewportW - 32);
    availH = Math.max(150, visBottom - visTop);
  } else {
    const topPx = 68;
    const bottomPx = Math.max(220, viewportH - 200);
    const leftPx = viewportW > 1120 ? 372 : 16;
    const rightPx =
      viewportW > 1120
        ? Math.max(leftPx + 240, viewportW - 192)
        : Math.max(leftPx + 180, viewportW - 16);

    winCx = (leftPx + rightPx) * 0.5;
    winCy = (topPx + bottomPx) * 0.5;
    availW = rightPx - leftPx;
    availH = Math.max(160, bottomPx - topPx);
  }

  const rimR = env.radius * 1.05;
  const bottomVisualY = env.platterTopY - 0.55 - rimR * SIN_ELEV;
  const topVisualY = env.maxY + rimR * SIN_ELEV * 0.5;
  const targetY = (topVisualY + bottomVisualY) * 0.5;
  const spanY = Math.max(8, topVisualY - bottomVisualY);
  const effectiveSpanX = Math.max(env.spanX, rimR * 2.04);

  const fillY = screen === 'showcase' ? 0.74 : 0.78;
  const fillX = screen === 'showcase' ? 0.76 : 0.82;

  const baseDist =
    scaleProfile === 'heavy_sniper' ? 66 : scaleProfile === 'rifle' ? 54 : 35;

  const aspect = Math.max(0.35, viewportW / Math.max(1, viewportH));
  const dVert =
    (spanY * 0.5) /
      (TAN_HALF_FOV_41 *
        Math.max(0.14, (availH * fillY) / Math.max(1, viewportH))) +
    rimR * COS_ELEV;
  const dHoriz =
    (effectiveSpanX * 0.5) /
    (TAN_HALF_FOV_41 *
      aspect *
      Math.max(0.18, (availW * fillX) / Math.max(1, viewportW)));
  const dMuzzleClearance = env.spanX * 0.5 + 22;

  const dist = Math.max(baseDist, dVert, dHoriz, dMuzzleClearance);

  return {
    viewOffsetX: viewportW * 0.5 - winCx,
    viewOffsetY: viewportH * 0.5 - winCy,
    targetX: env.cx,
    targetY,
    targetZ: 0,
    horizRadius: dist * COS_ELEV,
    offsetY: dist * SIN_ELEV,
  };
}
