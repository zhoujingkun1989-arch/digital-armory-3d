import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { useWeaponPlugin } from '../../weapons/registry';
import {
  type CaliperUnitSystem,
  MM_PER_INCH,
  WORLD_UNIT_TO_MM,
  caliperStore,
  computeWeaponEnvelopeMetrics,
  formatCaliperDistance,
} from '../caliper/caliperStore';
import { playbackClock } from '../clock/playbackClock';
import { fieldStripStore } from '../fieldstrip/fieldStripStore';
import {
  getCachedPartGeometry,
  useWeaponGeometries,
} from '../geometry/geometryService';
import { createMutablePose, evaluatePartPoseInto } from '../kinematics/math';
import type { ArmoryEnvironmentPreset } from './GunsmithStageMat';

const PROBE_SPHERE_GEO = new THREE.SphereGeometry(0.16, 18, 18);
const PROBE_RING_GEO = new THREE.RingGeometry(0.24, 0.36, 28);
const BEAM_CYLINDER_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.038, 0.038, 1, 10);
  // Shift so cylinder spans y in [0, 1] for effortless A -> B orientation
  g.translate(0, 0.5, 0);
  return g;
})();

const noopRaycast: THREE.Object3D['raycast'] = () => {};

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _quat = new THREE.Quaternion();
const _normVec = new THREE.Vector3();
const _scratchPose = createMutablePose();

export const CALIPER_METRIC_TICK_CM = 1.0;
export const CALIPER_IMPERIAL_TICK_CM = MM_PER_INCH / WORLD_UNIT_TO_MM; // 2.54 cm = 1 in
export const CALIPER_SPRITE_WIDTH = 512;
export const CALIPER_SPRITE_HEIGHT = 148;

/**
 * Resolves the perpendicular vernier tick spacing in world units (cm):
 * - Metric (`'mm'`): `1.0 cm` (10 mm) small arms / `10.0 cm` (100 mm) 1:1 MBTs
 * - Imperial (`'in'`): `2.54 cm` (1 in) small arms / `25.4 cm` (10 in) 1:1 MBTs
 */
export function computeCaliperTickStepCm(
  isTank: boolean,
  unitSystem: CaliperUnitSystem = 'mm'
): number {
  const baseCm =
    unitSystem === 'in' ? CALIPER_IMPERIAL_TICK_CM : CALIPER_METRIC_TICK_CM;
  return isTank ? baseCm * 10 : baseCm;
}

export interface CaliperThemePalette {
  isLight: boolean;
  envelopeColor: string;
  envelopeOpacity: number;
  jawACore: string;
  jawARing: string;
  jawBCore: string;
  jawBRing: string;
  beamColor: string;
  tickColor: string;
  tickOpacity: number;
  hoverCore: string;
  hoverRing: string;
  previewBeam: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  pillSubtext: string;
  pillAccentDot: string;
}

const DARK_STUDIO_CALIPER_PALETTE: CaliperThemePalette = {
  isLight: false,
  envelopeColor: '#38bdf8',
  envelopeOpacity: 0.58,
  jawACore: '#06b6d4',
  jawARing: '#22d3ee',
  jawBCore: '#f59e0b',
  jawBRing: '#fbbf24',
  beamColor: '#38bdf8',
  tickColor: '#fbbf24',
  tickOpacity: 0.68,
  hoverCore: '#e2e8f0',
  hoverRing: '#38bdf8',
  previewBeam: '#22d3ee',
  pillBg: 'rgba(9, 14, 24, 0.92)',
  pillBorder: '#38bdf8',
  pillText: '#f8fafc',
  pillSubtext: '#fbbf24',
  pillAccentDot: '#22d3ee',
};

const BLUEPRINT_DAYLIGHT_CALIPER_PALETTE: CaliperThemePalette = {
  isLight: true,
  envelopeColor: '#0369a1',
  envelopeOpacity: 0.74,
  jawACore: '#0284c7',
  jawARing: '#0369a1',
  jawBCore: '#b45309',
  jawBRing: '#d97706',
  beamColor: '#0284c7',
  tickColor: '#b45309',
  tickOpacity: 0.84,
  hoverCore: '#0f172a',
  hoverRing: '#0284c7',
  previewBeam: '#0284c7',
  pillBg: 'rgba(248, 250, 252, 0.96)',
  pillBorder: '#0284c7',
  pillText: '#0f172a',
  pillSubtext: '#b45309',
  pillAccentDot: '#0284c7',
};

/**
 * Resolves theme-aware caliper wire, probe, and floating CAD dimension sprite
 * colors (deep engineering cobalt `#0284c7` & ordnance amber `#b45309` on
 * Blueprint Daylight so measurements pop crisply on bright drafting paper).
 */
export function getCaliperThemePalette(
  preset: ArmoryEnvironmentPreset
): CaliperThemePalette {
  return preset === 'blueprint_daylight'
    ? BLUEPRINT_DAYLIGHT_CALIPER_PALETTE
    : DARK_STUDIO_CALIPER_PALETTE;
}

/**
 * Paints the high-DPI floating CAD midpoint dimension readout pill onto a 2D
 * canvas context (pure Canvas2D helper, headless-testable with mock contexts).
 */
export function paintCaliperDimensionPill(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  primaryText: string,
  secondaryText: string,
  palette: CaliperThemePalette
): void {
  const pad = 10;
  const r = 24;
  const x0 = pad;
  const y0 = pad;
  const rw = width - pad * 2;
  const rh = height - pad * 2;

  ctx.clearRect(0, 0, width, height);
  ctx.save();

  // Rounded CAD badge background
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x0 + rw - r, y0);
  ctx.quadraticCurveTo(x0 + rw, y0, x0 + rw, y0 + r);
  ctx.lineTo(x0 + rw, y0 + rh - r);
  ctx.quadraticCurveTo(x0 + rw, y0 + rh, x0 + rw - r, y0 + rh);
  ctx.lineTo(x0 + r, y0 + rh);
  ctx.quadraticCurveTo(x0, y0 + rh, x0, y0 + rh - r);
  ctx.lineTo(x0, y0 + r);
  ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
  ctx.closePath();

  ctx.fillStyle = palette.pillBg;
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = palette.pillBorder;
  ctx.stroke();

  // Subtle corner CAD registration ticks
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = palette.pillSubtext;
  ctx.beginPath();
  ctx.moveTo(x0 + 22, y0 + 18);
  ctx.lineTo(x0 + 36, y0 + 18);
  ctx.moveTo(x0 + rw - 36, y0 + 18);
  ctx.lineTo(x0 + rw - 22, y0 + 18);
  ctx.stroke();

  // Jaw A -> Jaw B color dots flanking primary dimension
  ctx.fillStyle = palette.pillAccentDot;
  ctx.beginPath();
  ctx.arc(x0 + 38, y0 + rh * 0.43, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.pillSubtext;
  ctx.beginPath();
  ctx.arc(x0 + rw - 38, y0 + rh * 0.43, 8, 0, Math.PI * 2);
  ctx.fill();

  // Primary bold monospace measurement readout
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.pillText;
  ctx.font =
    '700 50px "JetBrains Mono", "SF Mono", "Fira Code", ui-monospace, monospace';
  ctx.fillText(primaryText, width * 0.5, y0 + rh * 0.42);

  // Secondary cross-unit / CAD vector sub-readout
  ctx.fillStyle = palette.pillSubtext;
  ctx.font =
    '600 26px "JetBrains Mono", "SF Mono", "Fira Code", ui-monospace, monospace';
  ctx.fillText(secondaryText, width * 0.5, y0 + rh * 0.77);

  ctx.restore();
}

function createCaliperDimensionSpriteTexture(
  primaryText: string,
  secondaryText: string,
  palette: CaliperThemePalette
): THREE.CanvasTexture | null {
  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function'
  ) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = CALIPER_SPRITE_WIDTH;
  canvas.height = CALIPER_SPRITE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  paintCaliperDimensionPill(
    ctx,
    CALIPER_SPRITE_WIDTH,
    CALIPER_SPRITE_HEIGHT,
    primaryText,
    secondaryText,
    palette
  );

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function buildSpanAndProjectionLines(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  isTank = false,
  unitSystem: CaliperUnitSystem = 'mm'
): THREE.BufferGeometry {
  const verts: number[] = [];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const distCm = Math.hypot(dx, dy, dz);

  // Orthogonal ΔX -> ΔY -> ΔZ CAD projection cornerlegs
  const corner1: [number, number, number] = [b[0], a[1], a[2]];
  const corner2: [number, number, number] = [b[0], b[1], a[2]];
  verts.push(a[0], a[1], a[2], corner1[0], corner1[1], corner1[2]);
  verts.push(corner1[0], corner1[1], corner1[2], corner2[0], corner2[1], corner2[2]);
  verts.push(corner2[0], corner2[1], corner2[2], b[0], b[1], b[2]);

  // Precision vernier ticks perpendicular to span vector A -> B
  // Metric: 1 cm (10 mm) small arms / 10 cm (100 mm) MBTs
  // Imperial: 2.54 cm (1 in) small arms / 25.4 cm (10 in) MBTs
  const tickStepCm = computeCaliperTickStepCm(isTank, unitSystem);
  const tickScale = isTank ? 8 : 1;
  if (distCm > 0.2 * tickStepCm) {
    const ux = dx / distCm;
    const uy = dy / distCm;
    const uz = dz / distCm;
    // Choose perpendicular tick direction
    let px = -uy;
    let py = ux;
    let pz = 0;
    const plen = Math.hypot(px, py, pz);
    if (plen < 0.15) {
      px = 0;
      py = 1;
      pz = 0;
    } else {
      px /= plen;
      py /= plen;
    }

    const maxTicks = Math.min(220, Math.floor(distCm / tickStepCm));
    for (let idx = 1; idx <= maxTicks; idx++) {
      const dist = idx * tickStepCm;
      const isMajor = idx % 5 === 0;
      const tickHalf = (isMajor ? 0.28 : 0.14) * tickScale;
      const cx = a[0] + ux * dist;
      const cy = a[1] + uy * dist;
      const cz = a[2] + uz * dist;
      verts.push(
        cx - px * tickHalf,
        cy - py * tickHalf,
        cz - pz * tickHalf,
        cx + px * tickHalf,
        cy + py * tickHalf,
        cz + pz * tickHalf
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return geo;
}

export function buildEnvelopeRulerGeometry(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  isTank = false,
  unitSystem: CaliperUnitSystem = 'mm'
): THREE.BufferGeometry {
  const verts: number[] = [];
  const scale = isTank ? 8 : 1;
  const tickStepCm = computeCaliperTickStepCm(isTank, unitSystem);
  const pad = 1.35 * scale;
  const x0 = min[0];
  const x1 = max[0];
  const y0 = min[1];
  const y1 = max[1];
  const z0 = min[2];
  const z1 = max[2];

  const rulerY = y0 - pad;
  const rulerZ = z1 + pad;

  // 1. Longitudinal X-axis overall length ruler (metric 10/50/100mm or imperial 1/5/10 in)
  verts.push(x0, rulerY, rulerZ, x1, rulerY, rulerZ);
  // Datum extension drop-lines to weapon nose & buttplate
  verts.push(x0, y0, z1, x0, rulerY - 0.45 * scale, rulerZ);
  verts.push(x1, y0, z1, x1, rulerY - 0.45 * scale, rulerZ);

  const lenCm = Math.max(0, x1 - x0);
  const xTicks = Math.min(220, Math.floor(lenCm / tickStepCm));
  for (let idx = 0; idx <= xTicks; idx++) {
    const x = x0 + idx * tickStepCm;
    const h = (idx % 10 === 0 ? 0.56 : idx % 5 === 0 ? 0.36 : 0.18) * scale;
    verts.push(x, rulerY, rulerZ, x, rulerY - h, rulerZ);
  }

  // 2. Vertical Y-axis overall height ruler at rear datum `x0 - pad`
  const vX = x0 - pad;
  verts.push(vX, y0, rulerZ, vX, y1, rulerZ);
  verts.push(x0, y0, z1, vX - 0.4 * scale, y0, rulerZ);
  verts.push(x0, y1, z1, vX - 0.4 * scale, y1, rulerZ);

  const heightCm = Math.max(0, y1 - y0);
  const yTicks = Math.min(120, Math.floor(heightCm / tickStepCm));
  for (let idx = 0; idx <= yTicks; idx++) {
    const y = y0 + idx * tickStepCm;
    const w = (idx % 10 === 0 ? 0.52 : idx % 5 === 0 ? 0.34 : 0.16) * scale;
    verts.push(vX, y, rulerZ, vX - w, y, rulerZ);
  }

  // 3. Lateral Z-axis width ruler at rear-bottom corner
  verts.push(vX, rulerY, z0, vX, rulerY, z1);
  verts.push(vX - 0.28 * scale, rulerY, z0, vX + 0.28 * scale, rulerY, z0);
  verts.push(vX - 0.28 * scale, rulerY, z1, vX + 0.28 * scale, rulerY, z1);

  // Subtle top-front CAD bounding corner brackets
  const brk = 1.4 * scale;
  verts.push(x1, y1, z1, x1 - brk, y1, z1);
  verts.push(x1, y1, z1, x1, y1 - brk, z1);
  verts.push(x1, y1, z1, x1, y1, z1 - brk);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return geo;
}

/**
 * WP-10 — 1:1 3D Armorer Vernier Caliper & Full-Weapon Envelope Scale Ruler
 * -------------------------------------------------------------------------
 * Renders millimeter/inch-accurate surface probes (`1 world unit = 1 cm = 10 mm`),
 * live 60fps hover rubber-band span preview, orthogonal `ΔX / ΔY / ΔZ` CAD
 * projections, a floating camera-facing midpoint dimension readout sprite,
 * and a toggleable 3D weapon bounding ruler with Blueprint Daylight parity.
 */
export const CaliperActor: React.FC = () => {
  const screen = useAppStore((s) => s.screen);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const caliperActive = useAppStore((s) => s.caliperActive);
  const envelopeRulerVisible = useAppStore((s) => s.envelopeRulerVisible);
  const mode = useAppStore((s) => s.mode);
  const fieldStripActive = useAppStore((s) => s.fieldStripActive);
  const environmentPreset = useAppStore((s) => s.environmentPreset);

  const snap = useSyncExternalStore(
    caliperStore.subscribe,
    caliperStore.getSnapshot,
    caliperStore.getSnapshot
  );

  const unitSystem = snap.unitSystem;
  const palette = getCaliperThemePalette(environmentPreset);

  const plugin = useWeaponPlugin(activeWeaponId);
  const geoStatus = useWeaponGeometries(activeWeaponId, plugin?.parts ?? null);
  const isTank =
    getWeaponManifest(activeWeaponId).workbenchMeta.scaleProfile ===
    'main_battle_tank';
  const markerScale = isTank ? 8.0 : 1.0;

  const hoverGroupRef = useRef<THREE.Group>(null);
  const hoverRingRef = useRef<THREE.Mesh>(null);
  const liveBeamRef = useRef<THREE.Mesh>(null);

  // Locked A -> B tick & orthogonal projection lines (metric or imperial step)
  const lockedSpanGeo = useMemo(() => {
    if (!snap.pointA || !snap.pointB) return null;
    return buildSpanAndProjectionLines(
      snap.pointA.pos,
      snap.pointB.pos,
      isTank,
      unitSystem
    );
  }, [snap.pointA, snap.pointB, isTank, unitSystem]);

  useEffect(() => {
    return () => {
      lockedSpanGeo?.dispose();
    };
  }, [lockedSpanGeo]);

  // Locked solid A -> B cylinder transform & midpoint CAD dimension sprite data
  const lockedBeamTransform = useMemo(() => {
    if (!snap.pointA || !snap.pointB) return null;
    const a = snap.pointA.pos;
    const b = snap.pointB.pos;
    _vecA.set(a[0], a[1], a[2]);
    _vecB.set(b[0], b[1], b[2]);
    _dir.subVectors(_vecB, _vecA);
    const len = _dir.length();
    if (len < 1e-4) return null;
    _dir.divideScalar(len);
    _quat.setFromUnitVectors(_upAxis, _dir);

    const distMm = len * WORLD_UNIT_TO_MM;
    const primaryLabel = formatCaliperDistance(distMm, unitSystem);
    const altUnit: CaliperUnitSystem = unitSystem === 'in' ? 'mm' : 'in';
    const secondaryLabel = `A ↔ B · ${formatCaliperDistance(distMm, altUnit)}`;
    const spriteLiftY = isTank ? 24.0 : 2.15;
    const spriteLiftZ = isTank ? 8.0 : 0.65;
    const spriteHeight = isTank ? 18.0 : 1.75;
    const spriteWidth =
      spriteHeight * (CALIPER_SPRITE_WIDTH / CALIPER_SPRITE_HEIGHT);

    return {
      pos: [a[0], a[1], a[2]] as [number, number, number],
      rot: new THREE.Euler().setFromQuaternion(_quat),
      len,
      midpoint: [
        (a[0] + b[0]) * 0.5,
        (a[1] + b[1]) * 0.5 + spriteLiftY,
        (a[2] + b[2]) * 0.5 + spriteLiftZ,
      ] as [number, number, number],
      spriteScale: [spriteWidth, spriteHeight, 1] as [number, number, number],
      primaryLabel,
      secondaryLabel,
    };
  }, [snap.pointA, snap.pointB, isTank, unitSystem]);

  const primaryDimensionLabel = lockedBeamTransform?.primaryLabel ?? null;
  const secondaryDimensionLabel = lockedBeamTransform?.secondaryLabel ?? null;

  const dimensionSpriteTex = useMemo(() => {
    if (!primaryDimensionLabel || !secondaryDimensionLabel) return null;
    return createCaliperDimensionSpriteTexture(
      primaryDimensionLabel,
      secondaryDimensionLabel,
      palette
    );
  }, [primaryDimensionLabel, secondaryDimensionLabel, palette]);

  useEffect(() => {
    return () => {
      dimensionSpriteTex?.dispose();
    };
  }, [dimensionSpriteTex]);

  // Full-weapon 3D CAD envelope ruler (assembled datum when at rest)
  const envelopeGeo = useMemo(() => {
    if (
      !envelopeRulerVisible ||
      !plugin ||
      geoStatus.readyCount === 0 ||
      geoStatus.version < 0
    ) {
      return null;
    }
    const clock = playbackClock.getState();
    const isFs = fieldStripActive && mode === 'explode';
    const isFiring = mode === 'firing';
    const metrics = computeWeaponEnvelopeMetrics(
      plugin.parts,
      (partId) => getCachedPartGeometry(activeWeaponId, partId),
      (part, out) => {
        if (isFs) {
          return fieldStripStore.evaluatePartPoseInto(
            activeWeaponId,
            part,
            out
          );
        }
        return evaluatePartPoseInto(
          part,
          clock.targetProgress,
          isFiring,
          clock.fireProgress,
          plugin.computeFiringKinematics,
          out
        );
      },
      _scratchPose
    );
    if (!metrics) return null;
    return buildEnvelopeRulerGeometry(
      metrics.min,
      metrics.max,
      isTank,
      unitSystem
    );
  }, [
    envelopeRulerVisible,
    plugin,
    geoStatus.readyCount,
    geoStatus.version,
    activeWeaponId,
    mode,
    fieldStripActive,
    isTank,
    unitSystem,
  ]);

  useEffect(() => {
    return () => {
      envelopeGeo?.dispose();
    };
  }, [envelopeGeo]);

  // 60fps Zero-GC hover reticle & rubber-band beam from Point A -> live surface cursor
  useFrame(() => {
    const st = useAppStore.getState();
    const active = st.screen === 'workbench' && st.caliperActive;
    const hover = caliperStore.getTransientHover();
    const curScale =
      getWeaponManifest(st.activeWeaponId).workbenchMeta.scaleProfile ===
      'main_battle_tank'
        ? 8.0
        : 1.0;

    const hGrp = hoverGroupRef.current;
    if (hGrp) {
      const showHover = active && hover.active;
      hGrp.visible = showHover;
      if (showHover) {
        hGrp.position.set(hover.x, hover.y, hover.z);
        hGrp.scale.setScalar(curScale);
        const hRing = hoverRingRef.current;
        if (hRing) {
          _normVec.set(hover.nx, hover.ny, hover.nz);
          if (_normVec.lengthSq() < 1e-4) _normVec.set(0, 0, 1);
          else _normVec.normalize();
          // RingGeometry faces +Z by default; orient its Z axis along surface normal
          hRing.quaternion.setFromUnitVectors(_zAxis, _normVec);
        }
      }
    }

    const beam = liveBeamRef.current;
    if (beam) {
      const curSnap = caliperStore.getSnapshot();
      const showPreviewBeam =
        active &&
        hover.active &&
        curSnap.pointA !== null &&
        curSnap.pointB === null;
      beam.visible = showPreviewBeam;
      if (showPreviewBeam && curSnap.pointA) {
        const a = curSnap.pointA.pos;
        _vecA.set(a[0], a[1], a[2]);
        _vecB.set(hover.x, hover.y, hover.z);
        _dir.subVectors(_vecB, _vecA);
        const len = _dir.length();
        if (len > 0.005) {
          _dir.divideScalar(len);
          beam.position.copy(_vecA);
          beam.quaternion.setFromUnitVectors(_upAxis, _dir);
          beam.scale.set(0.8 * curScale, len, 0.8 * curScale);
        } else {
          beam.visible = false;
        }
      }
    }
  });

  if (screen !== 'workbench' || (!caliperActive && !envelopeRulerVisible)) {
    return null;
  }

  return (
    <group>
      {/* 1. Full-Weapon 3D CAD Envelope Bounding Ruler */}
      {envelopeRulerVisible && envelopeGeo && (
        <lineSegments
          geometry={envelopeGeo}
          renderOrder={14}
          userData={{ excludeFromGtao: true }}
        >
          <lineBasicMaterial
            color={palette.envelopeColor}
            transparent
            opacity={palette.envelopeOpacity}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* 2. Vernier Probe Jaw A */}
      {caliperActive && snap.pointA && (
        <group
          position={[snap.pointA.pos[0], snap.pointA.pos[1], snap.pointA.pos[2]]}
          scale={markerScale}
        >
          <mesh
            geometry={PROBE_SPHERE_GEO}
            renderOrder={16}
            userData={{ excludeFromGtao: true }}
          >
            <meshBasicMaterial color={palette.jawACore} depthTest={false} />
          </mesh>
          <mesh
            geometry={PROBE_RING_GEO}
            renderOrder={16}
            userData={{ excludeFromGtao: true }}
          >
            <meshBasicMaterial
              color={palette.jawARing}
              side={THREE.DoubleSide}
              transparent
              opacity={0.85}
              depthTest={false}
            />
          </mesh>
        </group>
      )}

      {/* 3. Vernier Probe Jaw B */}
      {caliperActive && snap.pointB && (
        <group
          position={[snap.pointB.pos[0], snap.pointB.pos[1], snap.pointB.pos[2]]}
          scale={markerScale}
        >
          <mesh
            geometry={PROBE_SPHERE_GEO}
            renderOrder={16}
            userData={{ excludeFromGtao: true }}
          >
            <meshBasicMaterial color={palette.jawBCore} depthTest={false} />
          </mesh>
          <mesh
            geometry={PROBE_RING_GEO}
            renderOrder={16}
            userData={{ excludeFromGtao: true }}
          >
            <meshBasicMaterial
              color={palette.jawBRing}
              side={THREE.DoubleSide}
              transparent
              opacity={0.85}
              depthTest={false}
            />
          </mesh>
        </group>
      )}

      {/* 4. Locked Vernier Measurement Rod + Metric/Imperial Scale Ticks + Orthogonal ΔX/ΔY/ΔZ Projections */}
      {caliperActive && lockedBeamTransform && (
        <mesh
          geometry={BEAM_CYLINDER_GEO}
          position={lockedBeamTransform.pos}
          rotation={lockedBeamTransform.rot}
          scale={[markerScale, lockedBeamTransform.len, markerScale]}
          renderOrder={15}
          userData={{ excludeFromGtao: true }}
        >
          <meshBasicMaterial
            color={palette.beamColor}
            transparent
            opacity={0.92}
            depthTest={false}
          />
        </mesh>
      )}

      {caliperActive && lockedSpanGeo && (
        <lineSegments
          geometry={lockedSpanGeo}
          renderOrder={15}
          userData={{ excludeFromGtao: true }}
        >
          <lineBasicMaterial
            color={palette.tickColor}
            transparent
            opacity={palette.tickOpacity}
            depthTest={false}
          />
        </lineSegments>
      )}

      {/* 4b. Floating Camera-Facing 3D Midpoint Dimension Readout Sprite (`mm / in` + Daylight Parity) */}
      {caliperActive && lockedBeamTransform && dimensionSpriteTex && (
        <sprite
          position={lockedBeamTransform.midpoint}
          scale={lockedBeamTransform.spriteScale}
          renderOrder={17}
          raycast={noopRaycast}
          userData={{ excludeFromGtao: true }}
          name="caliper-midpoint-readout-sprite"
        >
          <spriteMaterial
            map={dimensionSpriteTex}
            transparent
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
      )}

      {/* 5. Live 60fps Surface Hover Crosshair & Rubber-Band Preview Beam */}
      <group ref={hoverGroupRef} visible={false}>
        <mesh
          geometry={PROBE_SPHERE_GEO}
          scale={0.68}
          renderOrder={16}
          userData={{ excludeFromGtao: true }}
        >
          <meshBasicMaterial
            color={palette.hoverCore}
            transparent
            opacity={0.9}
            depthTest={false}
          />
        </mesh>
        <mesh
          ref={hoverRingRef}
          geometry={PROBE_RING_GEO}
          renderOrder={16}
          userData={{ excludeFromGtao: true }}
        >
          <meshBasicMaterial
            color={palette.hoverRing}
            side={THREE.DoubleSide}
            transparent
            opacity={0.78}
            depthTest={false}
          />
        </mesh>
      </group>

      <mesh
        ref={liveBeamRef}
        geometry={BEAM_CYLINDER_GEO}
        visible={false}
        renderOrder={15}
        userData={{ excludeFromGtao: true }}
      >
        <meshBasicMaterial
          color={palette.previewBeam}
          transparent
          opacity={0.58}
          depthTest={false}
        />
      </mesh>
    </group>
  );
};

CaliperActor.displayName = 'CaliperActor';
