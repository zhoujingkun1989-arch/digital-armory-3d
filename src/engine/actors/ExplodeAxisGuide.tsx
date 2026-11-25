import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  type AppScreen,
  type AppViewMode,
  useAppStore,
} from '../../store/useAppStore';
import { isOrdnanceWeapon } from '../physics/armoryPhysics';
import { getWeaponManifest } from '../../weapons/manifests';
import { useWeaponPlugin } from '../../weapons/registry';
import type {
  WeaponId,
  WeaponPartSpec,
  WeaponScaleProfile,
} from '../../weapons/types';
import type { ArmoryEnvironmentPreset } from '../canvas/GunsmithStageMat';
import { playbackClock } from '../clock/playbackClock';
import {
  getPartLocalCenter,
  useWeaponGeometries,
} from '../geometry/geometryService';
import {
  clamp01,
  createMutablePose,
  evaluatePartPoseInto,
  smoothstep01,
} from '../kinematics/math';

export const EXPLODE_GUIDE_MIN_PROGRESS = 0.06;
export const EXPLODE_GUIDE_RAMP_END = 0.35;

const noopRaycast: THREE.Object3D['raycast'] = () => {};

// Module-pooled Zero-GC scratch objects (never allocate inside useFrame)
const _scratchPose = createMutablePose();
const _baseEuler = new THREE.Euler();
const _poseEuler = new THREE.Euler();
const _anchorVec = new THREE.Vector3();
const _tipVec = new THREE.Vector3();
const _dotPos = new THREE.Vector3();
const _dotQuat = new THREE.Quaternion();
const _dotScale = new THREE.Vector3();
const _dotMatrix = new THREE.Matrix4();
const _hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
const _colorWork = new THREE.Color();
const _visScratch: ExplodeGuideVisibilityState = {
  visible: false,
  ramp01: 0,
  baseOpacity: 0,
  highlightOpacity: 0,
};

export interface ExplodeGuideScaleSpec {
  minDisplacementCm: number;
  dashSize: number;
  gapSize: number;
  anchorDotRadiusCm: number;
}

export interface ExplodeGuidePalette {
  isLight: boolean;
  baseColor: string;
  baseMaxOpacity: number;
  highlightColor: string;
  highlightMaxOpacity: number;
  anchorDotColor: string;
  anchorDotHighlightColor: string;
}

export interface ExplodeGuideVisibilityInput {
  screen: AppScreen;
  mode: AppViewMode;
  fieldStripActive: boolean;
  sectionCut: boolean;
  explodeProgress: number;
  environmentPreset: ArmoryEnvironmentPreset;
}

export interface ExplodeGuideVisibilityState {
  visible: boolean;
  ramp01: number;
  baseOpacity: number;
  highlightOpacity: number;
}

export interface ExplodeGuideSegment {
  partId: string;
  anchor: [number, number, number];
  tip: [number, number, number];
  displacementCm: number;
}

export interface ExplodeGuideMetrics {
  activeCount: number;
  totalParts: number;
  minDisplacementCm: number;
  dashSize: number;
  gapSize: number;
  maxDisplacementCm: number;
  segments: ExplodeGuideSegment[];
}

const DARK_STUDIO_GUIDE_PALETTE: ExplodeGuidePalette = {
  isLight: false,
  baseColor: '#7cc4e8',
  baseMaxOpacity: 0.28,
  highlightColor: '#f59e0b',
  highlightMaxOpacity: 0.78,
  anchorDotColor: '#94a3b8',
  anchorDotHighlightColor: '#fbbf24',
};

const BLUEPRINT_DAYLIGHT_GUIDE_PALETTE: ExplodeGuidePalette = {
  isLight: true,
  baseColor: '#0369a1',
  baseMaxOpacity: 0.42,
  highlightColor: '#b45309',
  highlightMaxOpacity: 0.78,
  anchorDotColor: '#0284c7',
  anchorDotHighlightColor: '#b45309',
};

/**
 * Resolves the technical-illustration color & opacity palette for exploded
 * assembly trajectory lines across Dark Studio and Blueprint Daylight themes.
 */
export function getExplodeGuidePalette(
  preset: ArmoryEnvironmentPreset
): ExplodeGuidePalette {
  return preset === 'blueprint_daylight'
    ? BLUEPRINT_DAYLIGHT_GUIDE_PALETTE
    : DARK_STUDIO_GUIDE_PALETTE;
}

/**
 * Resolves scale-calibrated dash pitch, anchor dot radius & minimum visible
 * displacement threshold for small arms, `gau8`, and 1:1 Main Battle Tanks.
 */
export function getExplodeGuideScaleSpec(
  scaleProfile: WeaponScaleProfile,
  weaponId?: WeaponId | string,
  parts?: readonly WeaponPartSpec[]
): ExplodeGuideScaleSpec {
  const isOrdnance =
    isOrdnanceWeapon(weaponId) ||
    Boolean(parts && parts.some((p) => p.id.startsWith('gau8_')));
  if (isOrdnance) {
    return {
      minDisplacementCm: 4.0,
      dashSize: 3.6,
      gapSize: 2.2,
      anchorDotRadiusCm: 0.85,
    };
  }
  if (scaleProfile === 'main_battle_tank') {
    return {
      minDisplacementCm: 12.0,
      dashSize: 10.5,
      gapSize: 6.5,
      anchorDotRadiusCm: 2.4,
    };
  }
  return {
    minDisplacementCm: 0.6,
    dashSize: 0.55,
    gapSize: 0.35,
    anchorDotRadiusCm: 0.14,
  };
}

/**
 * Zero-GC visibility & opacity evaluator writing directly into `out`.
 */
export function writeExplodeGuideVisibilityInto(
  screen: AppScreen,
  mode: AppViewMode,
  fieldStripActive: boolean,
  sectionCut: boolean,
  explodeProgress: number,
  environmentPreset: ArmoryEnvironmentPreset,
  out: ExplodeGuideVisibilityState
): ExplodeGuideVisibilityState {
  if (
    screen !== 'workbench' ||
    mode !== 'explode' ||
    fieldStripActive ||
    sectionCut ||
    !Number.isFinite(explodeProgress) ||
    explodeProgress <= EXPLODE_GUIDE_MIN_PROGRESS
  ) {
    out.visible = false;
    out.ramp01 = 0;
    out.baseOpacity = 0;
    out.highlightOpacity = 0;
    return out;
  }

  const palette = getExplodeGuidePalette(environmentPreset);
  const u = smoothstep01(
    (explodeProgress - EXPLODE_GUIDE_MIN_PROGRESS) /
      (EXPLODE_GUIDE_RAMP_END - EXPLODE_GUIDE_MIN_PROGRESS)
  );
  out.visible = u > 0;
  out.ramp01 = u;
  out.baseOpacity = palette.baseMaxOpacity * u;
  out.highlightOpacity = palette.highlightMaxOpacity * clamp01(u * 1.25);
  return out;
}

/**
 * Evaluates strict visibility gating and smooth opacity ramp (`[0.06..0.35]`)
 * for exploded assembly axis guides.
 */
export function computeExplodeGuideVisibility(
  input: ExplodeGuideVisibilityInput
): ExplodeGuideVisibilityState {
  return writeExplodeGuideVisibilityInto(
    input.screen,
    input.mode,
    input.fieldStripActive,
    input.sectionCut,
    input.explodeProgress,
    input.environmentPreset,
    { visible: false, ramp01: 0, baseOpacity: 0, highlightOpacity: 0 }
  );
}

/**
 * Pure helper evaluating all active exploded assembly axis vectors for a
 * weapon plugin at normalized `explodeProgress in [0, 1]`.
 */
export function computeExplodeGuideMetrics(
  parts: readonly WeaponPartSpec[],
  explodeProgress: number,
  scaleProfile: WeaponScaleProfile,
  weaponId?: WeaponId,
  resolveLocalCenter?: (partId: string) => readonly [number, number, number]
): ExplodeGuideMetrics {
  const scaleSpec = getExplodeGuideScaleSpec(scaleProfile, weaponId, parts);
  const t = Number.isFinite(explodeProgress) ? clamp01(explodeProgress) : 0;
  const segments: ExplodeGuideSegment[] = [];
  let maxDisplacementCm = 0;

  if (t > 0) {
    const pose = createMutablePose();
    const baseEul = new THREE.Euler();
    const tipEul = new THREE.Euler();
    const aVec = new THREE.Vector3();
    const tVec = new THREE.Vector3();

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const lc = resolveLocalCenter ? resolveLocalCenter(part.id) : null;
      const lcx = lc ? lc[0] : 0;
      const lcy = lc ? lc[1] : 0;
      const lcz = lc ? lc[2] : 0;

      aVec.set(lcx, lcy, lcz);
      if (part.assembledRot) {
        baseEul.set(
          part.assembledRot[0],
          part.assembledRot[1],
          part.assembledRot[2]
        );
        aVec.applyEuler(baseEul);
      }
      aVec.x += part.assembledPos[0];
      aVec.y += part.assembledPos[1];
      aVec.z += part.assembledPos[2];

      evaluatePartPoseInto(part, t, false, 0, null, pose);
      tVec.set(lcx, lcy, lcz);
      if (pose.rx !== 0 || pose.ry !== 0 || pose.rz !== 0) {
        tipEul.set(pose.rx, pose.ry, pose.rz);
        tVec.applyEuler(tipEul);
      }
      tVec.x += pose.px;
      tVec.y += pose.py;
      tVec.z += pose.pz;

      const dist = aVec.distanceTo(tVec);
      if (Number.isFinite(dist) && dist > scaleSpec.minDisplacementCm) {
        if (dist > maxDisplacementCm) maxDisplacementCm = dist;
        segments.push({
          partId: part.id,
          anchor: [aVec.x, aVec.y, aVec.z],
          tip: [tVec.x, tVec.y, tVec.z],
          displacementCm: dist,
        });
      }
    }
  }

  return {
    activeCount: segments.length,
    totalParts: parts.length,
    minDisplacementCm: scaleSpec.minDisplacementCm,
    dashSize: scaleSpec.dashSize,
    gapSize: scaleSpec.gapSize,
    maxDisplacementCm,
    segments,
  };
}

/**
 * Cycle 11B — DK Encyclopedia / Apple-Keynote 3D Exploded Assembly Axis Guides
 * ----------------------------------------------------------------------------
 * Renders fine dashed trajectory lines from each displaced part's assembled
 * mating center to its live exploded position, with subtle assembled anchor
 * dots and warm amber highlight on the selected/hovered part's mating axis.
 * 100% Zero-GC inside `useFrame` with dirty-checked buffer updates.
 */
export const ExplodeAxisGuide: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const screen = useAppStore((s) => s.screen);
  const mode = useAppStore((s) => s.mode);
  const fieldStripActive = useAppStore((s) => s.fieldStripActive);
  const sectionCut = useAppStore((s) => s.sectionCut);

  const plugin = useWeaponPlugin(activeWeaponId);
  const parts = plugin?.parts ?? null;
  const geoStatus = useWeaponGeometries(activeWeaponId, parts);
  const scaleProfile =
    getWeaponManifest(activeWeaponId).workbenchMeta.scaleProfile;
  const scaleSpec = useMemo(
    () => getExplodeGuideScaleSpec(scaleProfile, activeWeaponId, parts ?? undefined),
    [scaleProfile, activeWeaponId, parts]
  );

  const maxParts = Math.max(1, parts?.length ?? 1);

  const rootRef = useRef<THREE.Group>(null);
  const baseLinesRef = useRef<THREE.LineSegments>(null);
  const highlightLineRef = useRef<THREE.LineSegments>(null);
  const anchorDotsRef = useRef<THREE.InstancedMesh>(null);

  const lastProgressRef = useRef<number>(-1);
  const lastFocusIdRef = useRef<string | null | undefined>(undefined);
  const lastSelectedIdRef = useRef<string | null | undefined>(undefined);
  const lastGeoVersionRef = useRef<number>(-1);
  const lastEnvRef = useRef<ArmoryEnvironmentPreset | null>(null);
  const lastHiddenMaskRef = useRef<number>(-1);
  const lastDotsMeshRef = useRef<THREE.InstancedMesh | null>(null);

  // Pre-allocate base & highlight line geometries + anchor dot sphere once per weapon plugin
  const resources = useMemo(() => {
    const basePositions = new Float32Array(maxParts * 2 * 3);
    const baseDistances = new Float32Array(maxParts * 2);
    const baseGeo = new THREE.BufferGeometry();
    baseGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(basePositions, 3)
    );
    baseGeo.setAttribute(
      'lineDistance',
      new THREE.BufferAttribute(baseDistances, 1)
    );
    baseGeo.setDrawRange(0, 0);

    const hlPositions = new Float32Array(2 * 3);
    const hlDistances = new Float32Array(2);
    const hlGeo = new THREE.BufferGeometry();
    hlGeo.setAttribute('position', new THREE.BufferAttribute(hlPositions, 3));
    hlGeo.setAttribute(
      'lineDistance',
      new THREE.BufferAttribute(hlDistances, 1)
    );
    hlGeo.setDrawRange(0, 0);

    const dotGeo = new THREE.SphereGeometry(1, 10, 8);

    const baseMat = new THREE.LineDashedMaterial({
      color: '#7cc4e8',
      dashSize: 0.55,
      gapSize: 0.35,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    const hlMat = new THREE.LineDashedMaterial({
      color: '#f59e0b',
      dashSize: 0.55,
      gapSize: 0.35,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });

    const dotMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    return {
      baseGeo,
      hlGeo,
      dotGeo,
      baseMat,
      hlMat,
      dotMat,
    };
  }, [maxParts]);

  useEffect(() => {
    lastProgressRef.current = -1;
    lastFocusIdRef.current = undefined;
    lastSelectedIdRef.current = undefined;
    lastGeoVersionRef.current = -1;
    lastEnvRef.current = null;
    lastHiddenMaskRef.current = -1;
    lastDotsMeshRef.current = null;
  }, [activeWeaponId, maxParts, screen, mode, fieldStripActive, sectionCut]);

  useEffect(() => {
    return () => {
      resources.baseGeo.dispose();
      resources.hlGeo.dispose();
      resources.dotGeo.dispose();
      resources.baseMat.dispose();
      resources.hlMat.dispose();
      resources.dotMat.dispose();
    };
  }, [resources]);

  useFrame(() => {
    const root = rootRef.current;
    if (!root || !parts || parts.length === 0) {
      if (root) root.visible = false;
      return;
    }

    const st = useAppStore.getState();
    const p = playbackClock.getState().animatedProgress;
    const vis = writeExplodeGuideVisibilityInto(
      st.screen,
      st.mode,
      st.fieldStripActive,
      st.sectionCut,
      p,
      st.environmentPreset,
      _visScratch
    );

    if (!vis.visible) {
      root.visible = false;
      return;
    }
    root.visible = true;

    const focusPartId = st.hoveredPartId ?? st.selectedPartId;
    const hg = st.hiddenGroups;
    const hiddenMask =
      (hg.frame ? 1 : 0) |
      (hg.slide ? 2 : 0) |
      (hg.fire_control ? 4 : 0) |
      (hg.magazine ? 8 : 0) |
      (st.isolateSelected ? 16 : 0);

    const baseLines = baseLinesRef.current;
    const hlLines = highlightLineRef.current;
    const dots = anchorDotsRef.current;
    if (!baseLines || !hlLines || !dots) return;

    const meshRemounted = dots !== lastDotsMeshRef.current;
    const progressChanged = Math.abs(p - lastProgressRef.current) > 1e-4;
    const focusChanged = focusPartId !== lastFocusIdRef.current;
    const selectedChanged = st.selectedPartId !== lastSelectedIdRef.current;
    const geoChanged = geoStatus.version !== lastGeoVersionRef.current;
    const envChanged = st.environmentPreset !== lastEnvRef.current;
    const hiddenChanged = hiddenMask !== lastHiddenMaskRef.current;

    const baseMat = baseLines.material as THREE.LineDashedMaterial;
    const hlMat = hlLines.material as THREE.LineDashedMaterial;
    const dotMat = dots.material as THREE.MeshBasicMaterial;

    const pal = getExplodeGuidePalette(st.environmentPreset);
    if (meshRemounted || envChanged || progressChanged) {
      baseMat.color.set(pal.baseColor);
      baseMat.opacity = vis.baseOpacity;
      baseMat.dashSize = scaleSpec.dashSize;
      baseMat.gapSize = scaleSpec.gapSize;

      hlMat.color.set(pal.highlightColor);
      hlMat.opacity = vis.highlightOpacity;
      hlMat.dashSize = scaleSpec.dashSize * 0.85;
      hlMat.gapSize = scaleSpec.gapSize * 0.72;

      dotMat.opacity = Math.min(0.85, vis.baseOpacity * 1.65);
    }

    if (
      !meshRemounted &&
      !progressChanged &&
      !focusChanged &&
      !selectedChanged &&
      !geoChanged &&
      !envChanged &&
      !hiddenChanged
    ) {
      return;
    }

    lastDotsMeshRef.current = dots;
    lastProgressRef.current = p;
    lastFocusIdRef.current = focusPartId;
    lastSelectedIdRef.current = st.selectedPartId;
    lastGeoVersionRef.current = geoStatus.version;
    lastEnvRef.current = st.environmentPreset;
    lastHiddenMaskRef.current = hiddenMask;

    const basePosAttr = baseLines.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const baseDistAttr = baseLines.geometry.getAttribute(
      'lineDistance'
    ) as THREE.BufferAttribute;
    const basePosArr = basePosAttr.array as Float32Array;
    const baseDistArr = baseDistAttr.array as Float32Array;

    const hlPosAttr = hlLines.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const hlDistAttr = hlLines.geometry.getAttribute(
      'lineDistance'
    ) as THREE.BufferAttribute;
    const hlPosArr = hlPosAttr.array as Float32Array;
    const hlDistArr = hlDistAttr.array as Float32Array;

    const minDisp = scaleSpec.minDisplacementCm;
    const dotR = scaleSpec.anchorDotRadiusCm;
    let baseVertCursor = 0;
    let hlActive = false;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const partHidden =
        Boolean(hg[part.group]) ||
        (st.isolateSelected &&
          st.selectedPartId !== null &&
          st.selectedPartId !== part.id);

      if (partHidden) {
        dots.setMatrixAt(i, _hiddenMatrix);
        continue;
      }

      const lc = getPartLocalCenter(st.activeWeaponId, part.id);
      _anchorVec.set(lc[0], lc[1], lc[2]);
      if (part.assembledRot) {
        _baseEuler.set(
          part.assembledRot[0],
          part.assembledRot[1],
          part.assembledRot[2]
        );
        _anchorVec.applyEuler(_baseEuler);
      }
      _anchorVec.x += part.assembledPos[0];
      _anchorVec.y += part.assembledPos[1];
      _anchorVec.z += part.assembledPos[2];

      evaluatePartPoseInto(part, p, false, 0, null, _scratchPose);
      _tipVec.set(lc[0], lc[1], lc[2]);
      if (
        _scratchPose.rx !== 0 ||
        _scratchPose.ry !== 0 ||
        _scratchPose.rz !== 0
      ) {
        _poseEuler.set(_scratchPose.rx, _scratchPose.ry, _scratchPose.rz);
        _tipVec.applyEuler(_poseEuler);
      }
      _tipVec.x += _scratchPose.px;
      _tipVec.y += _scratchPose.py;
      _tipVec.z += _scratchPose.pz;

      const dist = _anchorVec.distanceTo(_tipVec);
      if (!Number.isFinite(dist) || dist <= minDisp) {
        dots.setMatrixAt(i, _hiddenMatrix);
        continue;
      }

      const isHighlighted = focusPartId !== null && part.id === focusPartId;
      if (isHighlighted) {
        hlPosArr[0] = _anchorVec.x;
        hlPosArr[1] = _anchorVec.y;
        hlPosArr[2] = _anchorVec.z;
        hlPosArr[3] = _tipVec.x;
        hlPosArr[4] = _tipVec.y;
        hlPosArr[5] = _tipVec.z;
        hlDistArr[0] = 0;
        hlDistArr[1] = dist;
        hlActive = true;
      } else {
        const off = baseVertCursor * 3;
        basePosArr[off] = _anchorVec.x;
        basePosArr[off + 1] = _anchorVec.y;
        basePosArr[off + 2] = _anchorVec.z;
        basePosArr[off + 3] = _tipVec.x;
        basePosArr[off + 4] = _tipVec.y;
        basePosArr[off + 5] = _tipVec.z;
        baseDistArr[baseVertCursor] = 0;
        baseDistArr[baseVertCursor + 1] = dist;
        baseVertCursor += 2;
      }

      // Subtle mating anchor dot at assembled origin
      const r = isHighlighted ? dotR * 1.45 : dotR;
      _dotPos.copy(_anchorVec);
      _dotScale.set(r, r, r);
      _dotMatrix.compose(_dotPos, _dotQuat, _dotScale);
      dots.setMatrixAt(i, _dotMatrix);
      _colorWork.set(
        isHighlighted ? pal.anchorDotHighlightColor : pal.anchorDotColor
      );
      dots.setColorAt(i, _colorWork);
    }

    for (let i = parts.length; i < maxParts; i++) {
      dots.setMatrixAt(i, _hiddenMatrix);
    }

    baseLines.geometry.setDrawRange(0, baseVertCursor);
    basePosAttr.needsUpdate = true;
    baseDistAttr.needsUpdate = true;
    baseLines.visible = baseVertCursor > 0;

    hlLines.geometry.setDrawRange(0, hlActive ? 2 : 0);
    hlPosAttr.needsUpdate = true;
    hlDistAttr.needsUpdate = true;
    hlLines.visible = hlActive;

    dots.instanceMatrix.needsUpdate = true;
    if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
    dots.visible = baseVertCursor > 0 || hlActive;
  });

  if (
    screen !== 'workbench' ||
    mode !== 'explode' ||
    fieldStripActive ||
    sectionCut ||
    !parts
  ) {
    return null;
  }

  return (
    <group
      ref={rootRef}
      name="ExplodeAxisGuideGroup"
      visible={false}
      userData={{ excludeFromGtao: true }}
    >
      {/* Muted drafting dashed assembly trajectory lines for displaced parts */}
      <lineSegments
        ref={baseLinesRef}
        geometry={resources.baseGeo}
        material={resources.baseMat}
        visible={false}
        frustumCulled={false}
        raycast={noopRaycast}
        renderOrder={9}
        userData={{ excludeFromGtao: true }}
        name="explode-axis-guides-base"
      />
      {/* Warm amber highlighted mating axis for selected/hovered part */}
      <lineSegments
        ref={highlightLineRef}
        geometry={resources.hlGeo}
        material={resources.hlMat}
        visible={false}
        frustumCulled={false}
        raycast={noopRaycast}
        renderOrder={13}
        userData={{ excludeFromGtao: true }}
        name="explode-axis-guide-highlight"
      />
      {/* Subtle assembled-origin mating anchor dots */}
      <instancedMesh
        key={`${activeWeaponId}-${maxParts}`}
        ref={anchorDotsRef}
        args={[resources.dotGeo, resources.dotMat, maxParts]}
        visible={false}
        frustumCulled={false}
        raycast={noopRaycast}
        renderOrder={10}
        userData={{ excludeFromGtao: true }}
        name="explode-axis-anchor-dots"
      />
    </group>
  );
};

ExplodeAxisGuide.displayName = 'ExplodeAxisGuide';
