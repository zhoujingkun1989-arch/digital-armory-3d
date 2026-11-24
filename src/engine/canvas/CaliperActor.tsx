import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { useWeaponPlugin } from '../../weapons/registry';
import {
  caliperStore,
  computeWeaponEnvelopeMetrics,
} from '../caliper/caliperStore';
import { playbackClock } from '../clock/playbackClock';
import { fieldStripStore } from '../fieldstrip/fieldStripStore';
import {
  getCachedPartGeometry,
  useWeaponGeometries,
} from '../geometry/geometryService';
import { createMutablePose, evaluatePartPoseInto } from '../kinematics/math';

const PROBE_SPHERE_GEO = new THREE.SphereGeometry(0.16, 18, 18);
const PROBE_RING_GEO = new THREE.RingGeometry(0.24, 0.36, 28);
const BEAM_CYLINDER_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.038, 0.038, 1, 10);
  // Shift so cylinder spans y in [0, 1] for effortless A -> B orientation
  g.translate(0, 0.5, 0);
  return g;
})();

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _quat = new THREE.Quaternion();
const _normVec = new THREE.Vector3();
const _scratchPose = createMutablePose();

function buildSpanAndProjectionLines(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  isTank = false
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

  // Precision vernier ticks perpendicular to span vector A -> B (10 mm for small arms, 100 mm for 1:1 MBTs)
  const tickStepCm = isTank ? 10 : 1;
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

function buildEnvelopeRulerGeometry(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  isTank = false
): THREE.BufferGeometry {
  const verts: number[] = [];
  const scale = isTank ? 8 : 1;
  const tickStepCm = isTank ? 10 : 1;
  const pad = 1.35 * scale;
  const x0 = min[0];
  const x1 = max[0];
  const y0 = min[1];
  const y1 = max[1];
  const z0 = min[2];
  const z1 = max[2];

  const rulerY = y0 - pad;
  const rulerZ = z1 + pad;

  // 1. Longitudinal X-axis overall length ruler (`10/50/100 mm` small arms, `100/500/1,000 mm` tanks)
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
 * Renders millimeter-accurate surface probes (`1 world unit = 1 cm = 10 mm`),
 * live 60fps hover rubber-band span preview, orthogonal `ΔX / ΔY / ΔZ` CAD
 * projections, and a toggleable 3D weapon bounding ruler.
 */
export const CaliperActor: React.FC = () => {
  const screen = useAppStore((s) => s.screen);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const caliperActive = useAppStore((s) => s.caliperActive);
  const envelopeRulerVisible = useAppStore((s) => s.envelopeRulerVisible);
  const mode = useAppStore((s) => s.mode);
  const fieldStripActive = useAppStore((s) => s.fieldStripActive);

  const snap = useSyncExternalStore(
    caliperStore.subscribe,
    caliperStore.getSnapshot,
    caliperStore.getSnapshot
  );

  const plugin = useWeaponPlugin(activeWeaponId);
  const geoStatus = useWeaponGeometries(activeWeaponId, plugin?.parts ?? null);
  const isTank =
    getWeaponManifest(activeWeaponId).workbenchMeta.scaleProfile ===
    'main_battle_tank';
  const markerScale = isTank ? 8.0 : 1.0;

  const hoverGroupRef = useRef<THREE.Group>(null);
  const hoverRingRef = useRef<THREE.Mesh>(null);
  const liveBeamRef = useRef<THREE.Mesh>(null);

  // Locked A -> B tick & orthogonal projection lines
  const lockedSpanGeo = useMemo(() => {
    if (!snap.pointA || !snap.pointB) return null;
    return buildSpanAndProjectionLines(snap.pointA.pos, snap.pointB.pos, isTank);
  }, [snap.pointA, snap.pointB, isTank]);

  useEffect(() => {
    return () => {
      lockedSpanGeo?.dispose();
    };
  }, [lockedSpanGeo]);

  // Locked solid A -> B cylinder transform
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
    return {
      pos: [a[0], a[1], a[2]] as [number, number, number],
      rot: new THREE.Euler().setFromQuaternion(_quat),
      len,
    };
  }, [snap.pointA, snap.pointB]);

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
    return buildEnvelopeRulerGeometry(metrics.min, metrics.max, isTank);
  }, [
    envelopeRulerVisible,
    plugin,
    geoStatus.readyCount,
    geoStatus.version,
    activeWeaponId,
    mode,
    fieldStripActive,
    isTank,
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
        <lineSegments geometry={envelopeGeo} renderOrder={14}>
          <lineBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.58}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* 2. Vernier Probe Jaw A (Cyan) */}
      {caliperActive && snap.pointA && (
        <group
          position={[snap.pointA.pos[0], snap.pointA.pos[1], snap.pointA.pos[2]]}
          scale={markerScale}
        >
          <mesh geometry={PROBE_SPHERE_GEO} renderOrder={16}>
            <meshBasicMaterial color="#06b6d4" depthTest={false} />
          </mesh>
          <mesh geometry={PROBE_RING_GEO} renderOrder={16}>
            <meshBasicMaterial
              color="#22d3ee"
              side={THREE.DoubleSide}
              transparent
              opacity={0.85}
              depthTest={false}
            />
          </mesh>
        </group>
      )}

      {/* 3. Vernier Probe Jaw B (Amber) */}
      {caliperActive && snap.pointB && (
        <group
          position={[snap.pointB.pos[0], snap.pointB.pos[1], snap.pointB.pos[2]]}
          scale={markerScale}
        >
          <mesh geometry={PROBE_SPHERE_GEO} renderOrder={16}>
            <meshBasicMaterial color="#f59e0b" depthTest={false} />
          </mesh>
          <mesh geometry={PROBE_RING_GEO} renderOrder={16}>
            <meshBasicMaterial
              color="#fbbf24"
              side={THREE.DoubleSide}
              transparent
              opacity={0.85}
              depthTest={false}
            />
          </mesh>
        </group>
      )}

      {/* 4. Locked Vernier Measurement Rod + 10mm/100mm Scale Ticks + Orthogonal ΔX/ΔY/ΔZ Projections */}
      {caliperActive && lockedBeamTransform && (
        <mesh
          geometry={BEAM_CYLINDER_GEO}
          position={lockedBeamTransform.pos}
          rotation={lockedBeamTransform.rot}
          scale={[markerScale, lockedBeamTransform.len, markerScale]}
          renderOrder={15}
        >
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.92}
            depthTest={false}
          />
        </mesh>
      )}

      {caliperActive && lockedSpanGeo && (
        <lineSegments geometry={lockedSpanGeo} renderOrder={15}>
          <lineBasicMaterial
            color="#fbbf24"
            transparent
            opacity={0.68}
            depthTest={false}
          />
        </lineSegments>
      )}

      {/* 5. Live 60fps Surface Hover Crosshair & Rubber-Band Preview Beam */}
      <group ref={hoverGroupRef} visible={false}>
        <mesh geometry={PROBE_SPHERE_GEO} scale={0.68} renderOrder={16}>
          <meshBasicMaterial
            color="#e2e8f0"
            transparent
            opacity={0.9}
            depthTest={false}
          />
        </mesh>
        <mesh ref={hoverRingRef} geometry={PROBE_RING_GEO} renderOrder={16}>
          <meshBasicMaterial
            color="#38bdf8"
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
      >
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.58}
          depthTest={false}
        />
      </mesh>
    </group>
  );
};

CaliperActor.displayName = 'CaliperActor';
