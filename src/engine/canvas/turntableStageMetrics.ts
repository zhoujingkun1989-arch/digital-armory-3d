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
  p90: {
    cx: 0.0,
    minY: -8.2,
    maxY: 5.8,
    spanX: 33.6,
    explode58: { cx: 1.4, minY: -13.2, maxY: 15.8, spanX: 52.8 },
  },
  lift33: {
    cx: 8.84,
    minY: -44.32,
    maxY: 44.32,
    spanX: 53.82,
    explode58: { cx: 12.44, minY: -52.82, maxY: 52.82, spanX: 82.62 },
  },
  r500: {
    cx: 3.5,
    minY: -11.2,
    maxY: 9.28,
    spanX: 70.98,
    explode58: { cx: 2.18, minY: -17.0, maxY: 15.08, spanX: 87.23 },
  },
  python: {
    cx: 2.85,
    minY: -11.4,
    maxY: 5.2,
    spanX: 30.5,
    explode58: { cx: 2.41, minY: -17.2, maxY: 11.2, spanX: 48.5 },
  },
  benellim4: {
    cx: 9.2,
    minY: -14.8,
    maxY: 6.2,
    spanX: 91.0,
    explode58: { cx: 17.62, minY: -19.5, maxY: 19.5, spanX: 132.0 },
  },
  garand: {
    cx: 7.74,
    minY: -15.5,
    maxY: 6.5,
    spanX: 114.0,
    explode58: { cx: 7.23, minY: -35.5, maxY: 20.5, spanX: 192.0 },
  },
  m249: {
    cx: 5.55,
    minY: -13.25,
    maxY: 5.8,
    spanX: 103.5,
    explode58: { cx: 3.7, minY: -24.5, maxY: 25.1, spanX: 154.0 },
  },
  p08: {
    cx: 0.92,
    minY: -10.25,
    maxY: 3.4,
    spanX: 22.6,
    explode58: { cx: 4.17, minY: -18.5, maxY: 10.7, spanX: 39.6 },
  },
  vector: {
    cx: -4.78,
    minY: -19.7,
    maxY: 6.0,
    spanX: 61.8,
    explode58: { cx: -2.27, minY: -37.6, maxY: 15.2, spanX: 83.0 },
  },
  g11: {
    cx: 1.5,
    minY: -17.0,
    maxY: 12.4,
    spanX: 75.0,
    explode58: { cx: 5.17, minY: -25.31, maxY: 24.9, spanX: 95.35 },
  },
  vss: {
    cx: 2.7,
    minY: -13.01,
    maxY: 8.78,
    spanX: 89.41,
    explode58: { cx: 5.7, minY: -29.16, maxY: 17.27, spanX: 123.41 },
  },
  m134: {
    cx: 10.0,
    minY: -15.39,
    maxY: 14.2,
    spanX: 80.4,
    explode58: { cx: 29.0, minY: -20.28, maxY: 19.43, spanX: 139.1 },
  },
  an94: {
    cx: 4.14,
    minY: -19.36,
    maxY: 6.86,
    spanX: 94.3,
    explode58: { cx: 13.71, minY: -36.39, maxY: 23.92, spanX: 124.95 },
  },
  ztz99a: {
    cx: 110.0,
    minY: -120.0,
    maxY: 117.0,
    spanX: 1090.0,
    explode58: { cx: 135.0, minY: -190.0, maxY: 255.0, spanX: 1410.0 },
  },
  m1a2: {
    cx: 60.0,
    minY: -120.0,
    maxY: 124.0,
    spanX: 977.0,
    explode58: { cx: 80.0, minY: -190.0, maxY: 268.0, spanX: 1290.0 },
  },
  leopard2a7: {
    cx: 110.0,
    minY: -120.0,
    maxY: 144.0,
    spanX: 1097.0,
    explode58: { cx: 135.0, minY: -190.0, maxY: 285.0, spanX: 1430.0 },
  },
  tiger1: {
    cx: 65.0,
    minY: -120.0,
    maxY: 180.0,
    spanX: 845.0,
    explode58: { cx: 85.0, minY: -190.0, maxY: 310.0, spanX: 1140.0 },
  },
  winchester1894: {
    cx: 8.5,
    minY: -9.5,
    maxY: 4.5,
    spanX: 102.0,
    explode58: { cx: 8.5, minY: -24.5, maxY: 20.5, spanX: 158.0 },
  },
  rem870: {
    cx: 8.0,
    minY: -9.8,
    maxY: 4.5,
    spanX: 100.0,
    explode58: { cx: 8.0, minY: -25.5, maxY: 24.5, spanX: 158.0 },
  },
  m1911: {
    cx: 0.86,
    minY: -9.7,
    maxY: 4.07,
    spanX: 21.48,
    explode58: { cx: 1.98, minY: -21.14, maxY: 12.55, spanX: 35.26 },
  },
  mg42: {
    cx: 20.0,
    minY: -10.0,
    maxY: 8.5,
    spanX: 124.0,
    explode58: { cx: 18.0, minY: -26.0, maxY: 25.0, spanX: 178.0 },
  },
  k98k: {
    cx: 10.68,
    minY: -15.5,
    maxY: 8.2,
    spanX: 116.0,
    explode58: { cx: 21.76, minY: -34.5, maxY: 27.0, spanX: 158.0 },
  },
  thompson: {
    cx: 3.6,
    minY: -16.4,
    maxY: 6.5,
    spanX: 88.0,
    explode58: { cx: 3.6, minY: -31.0, maxY: 22.0, spanX: 142.0 },
  },
  gau8: {
    cx: 17.1,
    minY: -74.0,
    maxY: 35.5,
    spanX: 605.8,
    explode58: { cx: 28.34, minY: -74.0, maxY: 88.46, spanX: 740.06 },
  },
};

export function getTurntableRadius(weaponId: WeaponId): number {
  const b = WEAPON_TURNTABLE_BOUNDS[weaponId];
  if (b.spanX > 300) {
    // 1:1 Heavy Armor steel turntable pit ring (Ø 9.6 m -> radius 480 cm)
    return 480;
  }
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
  const isTank = b.spanX > 300;
  const u = THREE.MathUtils.clamp(explodeT / 0.58, 0, 1);
  const cx = THREE.MathUtils.lerp(b.cx, b.explode58.cx, u);
  const minY = THREE.MathUtils.lerp(b.minY, b.explode58.minY, u);
  const maxY = THREE.MathUtils.lerp(b.maxY, b.explode58.maxY, u);
  const spanX = THREE.MathUtils.lerp(b.spanX, b.explode58.spanX, u);
  const radius = getTurntableRadius(weaponId);
  const platterTopY = isTank ? minY - 1.0 : minY - 0.85;
  const gridFloorY = isTank ? platterTopY - 9.0 : platterTopY - 0.6;

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
  screen: 'showcase' | 'armory' | 'ballistics',
  viewportW: number,
  viewportH: number,
  hudHidden = false
): TurntableFramingResult {
  const env = evaluateWeaponTurntableEnvelopeInto(weaponId, explodeT);

  let winCx: number;
  let winCy: number;
  let availW: number;
  let availH: number;

  if (hudHidden) {
    winCx = viewportW * 0.5;
    winCy = viewportH * 0.5;
    availW = Math.max(240, viewportW - 48);
    availH = Math.max(180, viewportH - 48);
  } else if (screen === 'showcase') {
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

  const isTank = scaleProfile === 'main_battle_tank';
  const rimR = env.radius * 1.05;
  const bottomVisualY =
    env.platterTopY - (isTank ? 9.0 : 0.55) - rimR * SIN_ELEV;
  const topVisualY = env.maxY + rimR * SIN_ELEV * 0.5;
  const targetY = (topVisualY + bottomVisualY) * 0.5;
  const spanY = Math.max(8, topVisualY - bottomVisualY);
  const effectiveSpanX = Math.max(env.spanX, rimR * 2.04);

  const fillY = hudHidden ? 0.8 : screen === 'showcase' ? 0.74 : 0.78;
  const fillX = hudHidden ? 0.84 : screen === 'showcase' ? 0.76 : 0.82;

  const baseDist =
    scaleProfile === 'main_battle_tank'
      ? 1180
      : scaleProfile === 'heavy_sniper'
        ? 66
        : scaleProfile === 'compound_bow'
          ? 72
          : scaleProfile === 'rifle'
            ? 54
            : 35;

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
  const dMuzzleClearance = env.spanX * 0.5 + (isTank ? 260 : 22);

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
