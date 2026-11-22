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
}

export const DEFAULT_SPLIT_AZIMUTH = 0.28;
export const DEFAULT_SPLIT_POLAR = 1.38;
export const DEFAULT_SPLIT_ZOOM = 1.24;

/**
 * Computes normalized spherical orbit camera placement for one half of the
 * Split-Screen Showdown viewport (`halfAspect = (fullW / 2) / fullH`), scaling
 * smoothly for small arms, archery bows, and 1:1 10-meter Main Battle Tanks.
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
  const radius = baseRadius * explodeExpand * aspectPad * clampedZoom;

  const clampedPolar = Math.max(0.18, Math.min(Math.PI - 0.18, polar));
  const sinP = Math.sin(clampedPolar);
  const cosP = Math.cos(clampedPolar);
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
