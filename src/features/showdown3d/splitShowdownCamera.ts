import * as THREE from 'three';
import { getWeaponManifest } from '../../weapons/manifests';
import type { WeaponId } from '../../weapons/types';

export interface SplitOrbitPose {
  azimuth: number;
  polar: number;
  zoom: number;
}

export interface SplitCameraFraming {
  target: [number, number, number];
  position: [number, number, number];
  radius: number;
  near: number;
  far: number;
  /** Fraction of horizontal pane width occupied by the projected exhibit silhouette (<= 0.72 at zoom=1) */
  projectedHorizontalOccupancy: number;
}

export interface SplitViewportRect {
  x: number;
  /** WebGL bottom-left origin Y offset in CSS pixels */
  y: number;
  width: number;
  height: number;
  aspect: number;
}

export interface SplitViewportLayout {
  layout: 'horizontal' | 'vertical';
  /** Slot A viewport: Left pane on desktop (>= 768px), Top pane on mobile (< 768px) */
  rectA: SplitViewportRect;
  /** Slot B viewport: Right pane on desktop (>= 768px), Bottom pane on mobile (< 768px) */
  rectB: SplitViewportRect;
}

export const SPLIT_MOBILE_BREAKPOINT_PX = 768;
export const SPLIT_CAMERA_FOV_DEG = 40;
export const SPLIT_MAX_HORIZONTAL_OCCUPANCY = 0.72;
export const SPLIT_MAX_VERTICAL_OCCUPANCY = 0.74;

export const DEFAULT_SPLIT_AZIMUTH = 0.28;
export const DEFAULT_SPLIT_POLAR = 1.38;
export const DEFAULT_SPLIT_ZOOM = 1.0;

/**
 * Computes responsive dual-scissor viewport rectangles in WebGL bottom-left coordinates:
 * - Desktop (`cssW >= 768`): Left (Slot A) / Right (Slot B) horizontal split
 * - Mobile (`cssW < 768`): Top (Slot A, `y = bottomH`) / Bottom (Slot B, `y = 0`) vertical split
 */
export function computeSplitViewportRects(
  cssW: number,
  cssH: number
): SplitViewportLayout {
  const w = Math.max(2, Math.round(cssW));
  const h = Math.max(2, Math.round(cssH));
  if (w < SPLIT_MOBILE_BREAKPOINT_PX) {
    const topH = Math.floor(h * 0.5);
    const bottomH = h - topH;
    return {
      layout: 'vertical',
      rectA: {
        x: 0,
        y: bottomH,
        width: w,
        height: topH,
        aspect: w / Math.max(1, topH),
      },
      rectB: {
        x: 0,
        y: 0,
        width: w,
        height: bottomH,
        aspect: w / Math.max(1, bottomH),
      },
    };
  }
  const leftW = Math.floor(w * 0.5);
  const rightW = w - leftW;
  return {
    layout: 'horizontal',
    rectA: {
      x: 0,
      y: 0,
      width: leftW,
      height: h,
      aspect: leftW / h,
    },
    rectB: {
      x: leftW,
      y: 0,
      width: rightW,
      height: h,
      aspect: rightW / h,
    },
  };
}

/**
 * Estimates an exhibit's 3D half-extents (world units = cm) around `iso.target`
 * from manifest geometry metadata so long barrels (`m134`, `gau8`, `m82a1`, MBTs)
 * never clip against the split-screen pane borders at any aspect ratio.
 */
function estimateExhibitHalfExtents(
  weaponId: WeaponId,
  baseRadius: number
): { halfX: number; halfY: number; halfZ: number } {
  const manifest = getWeaponManifest(weaponId);
  const scaleProfile = manifest.workbenchMeta.scaleProfile;
  const tx = manifest.cameraPresets.iso.target[0];
  const ty = manifest.cameraPresets.iso.target[1];
  const muzzleX = manifest.workbenchMeta.muzzlePos[0];
  const gridY = manifest.workbenchMeta.gridY;

  const forwardSpanX = Math.abs(muzzleX - tx);
  const halfX = Math.max(forwardSpanX * 1.08, baseRadius * 0.34);

  let halfY: number;
  let halfZ: number;
  if (scaleProfile === 'compound_bow') {
    halfY = Math.max(Math.abs(gridY - ty) * 0.85, baseRadius * 0.38);
    halfZ = Math.max(14, halfX * 0.25);
  } else if (scaleProfile === 'main_battle_tank') {
    halfY = Math.max(Math.abs(gridY - ty) * 1.25, halfX * 0.32);
    halfZ = Math.max(180, halfX * 0.34);
  } else {
    halfY = Math.max(halfX * 0.42, 10);
    halfZ = Math.max(8, halfX * 0.24);
  }

  return { halfX, halfY, halfZ };
}

/**
 * Computes normalized spherical orbit camera placement for one half of the
 * Split-Screen Showdown viewport (`halfAspect = paneW / paneH`), dynamically
 * bounding projected 3D AABB half-extents so every exhibit (including `m134`,
 * `gau8`, `m82a1`, and 1:1 MBTs) maintains >= 14% horizontal margin (`<= 72%` occupancy).
 */
export function computeSplitCameraFraming(
  weaponId: WeaponId,
  explodeProgress: number,
  halfAspect: number,
  azimuth: number,
  polar: number,
  zoom: number
): SplitCameraFraming {
  const manifest = getWeaponManifest(weaponId);
  const scaleProfile = manifest.workbenchMeta.scaleProfile;
  const iso = manifest.cameraPresets.iso;
  const tx = iso.target[0];
  const ty = iso.target[1];
  const tz = iso.target[2];

  const dx = iso.pos[0] - tx;
  const dy = iso.pos[1] - ty;
  const dz = iso.pos[2] - tz;
  const baseRadius = Math.max(8, Math.hypot(dx, dy, dz));

  const safeAspect = Math.max(0.4, halfAspect);
  const tCam = Math.pow(Math.max(0, Math.min(1, explodeProgress)), 0.55);
  const explodeExpand =
    scaleProfile === 'main_battle_tank' ? 1 + tCam * 0.42 : 1 + tCam * 0.52;
  const aspectPad = Math.max(1.0, 1.12 / safeAspect);
  const clampedZoom = Math.max(0.45, Math.min(2.4, zoom));
  const clampedPolar = Math.max(0.18, Math.min(Math.PI - 0.18, polar));
  const sinP = Math.sin(clampedPolar);
  const cosP = Math.cos(clampedPolar);

  // Exact projected half-extents vs camera horizontal/vertical frustum tangents
  const { halfX, halfY, halfZ } = estimateExhibitHalfExtents(
    weaponId,
    baseRadius
  );
  const absCosA = Math.abs(Math.cos(azimuth));
  const absSinA = Math.abs(Math.sin(azimuth));
  const projHalfW = (halfX * absCosA + halfZ * absSinA) * explodeExpand;
  const projDepth = (halfX * absSinA + halfZ * absCosA) * explodeExpand;
  const projHalfH =
    (halfY * sinP + projDepth * Math.abs(cosP) * 0.55) *
    (explodeExpand > 1 ? 1 + (explodeExpand - 1) * 0.7 : 1);

  const tanHalfV = Math.tan(THREE.MathUtils.degToRad(SPLIT_CAMERA_FOV_DEG * 0.5));
  const tanHalfH = tanHalfV * safeAspect;

  const fitRadiusH =
    projHalfW / (SPLIT_MAX_HORIZONTAL_OCCUPANCY * tanHalfH) + projDepth * 0.5;
  const fitRadiusV =
    projHalfH / (SPLIT_MAX_VERTICAL_OCCUPANCY * tanHalfV) + projDepth * 0.35;
  const minSafeRadius = Math.max(fitRadiusH, fitRadiusV);

  const radius =
    Math.max(baseRadius * explodeExpand * aspectPad, minSafeRadius) *
    clampedZoom;

  // Compute exact horizontal silhouette occupancy at the front-conservative plane
  const effectiveDist = Math.max(1, radius - projDepth * 0.5);
  const visibleHalfW = effectiveDist * tanHalfH;
  const projectedHorizontalOccupancy = projHalfW / Math.max(1e-4, visibleHalfW);

  const px = tx + radius * sinP * Math.sin(azimuth);
  const py = ty + radius * cosP;
  const pz = tz + radius * sinP * Math.cos(azimuth);

  const isTank = scaleProfile === 'main_battle_tank';
  return {
    target: [tx, ty, tz],
    position: [px, py, pz],
    radius,
    near: isTank ? 2.0 : 0.1,
    far: isTank ? 9000 : 1200,
    projectedHorizontalOccupancy,
  };
}

class SplitShowdownCameraRuntime {
  public linkCameras = true;
  public poseA: SplitOrbitPose = {
    azimuth: DEFAULT_SPLIT_AZIMUTH,
    polar: DEFAULT_SPLIT_POLAR,
    zoom: DEFAULT_SPLIT_ZOOM,
  };
  public poseB: SplitOrbitPose = {
    azimuth: DEFAULT_SPLIT_AZIMUTH,
    polar: DEFAULT_SPLIT_POLAR,
    zoom: DEFAULT_SPLIT_ZOOM,
  };
  private listeners = new Set<() => void>();

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  public setLinked(linked: boolean): void {
    this.linkCameras = linked;
    if (linked) {
      this.poseB.azimuth = this.poseA.azimuth;
      this.poseB.polar = this.poseA.polar;
      this.poseB.zoom = this.poseA.zoom;
    }
    this.emit();
  }

  public resetPoses(): void {
    this.poseA = {
      azimuth: DEFAULT_SPLIT_AZIMUTH,
      polar: DEFAULT_SPLIT_POLAR,
      zoom: DEFAULT_SPLIT_ZOOM,
    };
    this.poseB = {
      azimuth: DEFAULT_SPLIT_AZIMUTH,
      polar: DEFAULT_SPLIT_POLAR,
      zoom: DEFAULT_SPLIT_ZOOM,
    };
    this.emit();
  }

  public orbit(side: 'A' | 'B', dAzimuth: number, dPolar: number): void {
    const apply = (pose: SplitOrbitPose) => {
      pose.azimuth += dAzimuth;
      pose.polar = THREE.MathUtils.clamp(pose.polar + dPolar, 0.2, Math.PI - 0.2);
    };
    if (this.linkCameras) {
      apply(this.poseA);
      apply(this.poseB);
    } else if (side === 'A') {
      apply(this.poseA);
    } else {
      apply(this.poseB);
    }
  }

  public zoomBy(side: 'A' | 'B', factor: number): void {
    const apply = (pose: SplitOrbitPose) => {
      pose.zoom = THREE.MathUtils.clamp(pose.zoom * factor, 0.45, 2.35);
    };
    if (this.linkCameras) {
      apply(this.poseA);
      apply(this.poseB);
    } else if (side === 'A') {
      apply(this.poseA);
    } else {
      apply(this.poseB);
    }
  }
}

export const splitShowdownCameraStore = new SplitShowdownCameraRuntime();
