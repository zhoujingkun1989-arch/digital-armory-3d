import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { playbackClock } from '../clock/playbackClock';
import { WEAPON_GAS_MANIFOLD_PROFILES } from '../materials/engineeringRoles';
import {
  computeGasPortUncoverF,
  createInternalBallisticsSample,
  evaluateInternalBallisticsInto,
  getWeaponFiringTiming,
} from '../physics/armoryPhysics';

const STREAM_CHEVRON_COUNT = 16;
const noRaycast = (): null => null;

// Module-pooled Zero-GC math & color scratch objects (never allocate in useFrame)
const _sample = createInternalBallisticsSample('556_nato');
const _upAxis = new THREE.Vector3(0, 1, 0);
const _dirVec = new THREE.Vector3();
const _posVec = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scaleVec = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _hiddenMat4 = new THREE.Matrix4().makeScale(0, 0, 0);
const _colorWork = new THREE.Color();

// Calibrated engineering palette (reads cleanly under AgX + half-res Bloom without whiteout)
const COL_PEAK_PLASMA = new THREE.Color('#fde68a');
const COL_HIGH_PRESSURE = new THREE.Color('#f59e0b');
const COL_GAS_TAP_CYAN = new THREE.Color('#22d3ee');
const COL_SAFE_BLOWDOWN = new THREE.Color('#06b6d4');
const COL_SEALED_RING = new THREE.Color('#fbbf24');
const COL_SAFE_UNLOCK = new THREE.Color('#10b981');

function clamp01(x: number): number {
  if (!(x > 0)) return 0;
  return x > 1 ? 1 : x;
}

/**
 * WP-05 — Dynamic Propellant Gas-Flow & Breech Impulse Visualizer (60fps Zero-GC)
 * -------------------------------------------------------------------------------
 * Synchronized 1:1 with `playbackClock.animatedFireProgress` and `armoryPhysics`:
 *  1. Bore propellant expansion core from chamber breech to live bullet base.
 *  2. Gas-port tap riser, manifold stream tube, piston/BCG expansion pulse & exhaust vent
 *     across long-stroke (`ak15`), Stoner DI (`m4a1`), short-stroke (`scar`, `aug`),
 *     and forward under-barrel (`deagle`) operating systems.
 *  3. Breech-thrust / fluted-chamber / locked-recoil pressure rings for `mp5`, `p90`,
 *     `g17`, `p320`, `m82a1`, and `awm`.
 */
export const GasFlowVisualizer: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const mode = useAppStore((s) => s.mode);
  const gasFlowVisible = useAppStore((s) => s.gasFlowVisible);

  const rootRef = useRef<THREE.Group>(null);
  const boreOuterRef = useRef<THREE.Mesh>(null);
  const boreOuterMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const boreCoreRef = useRef<THREE.Mesh>(null);
  const boreCoreMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const riserMeshRef = useRef<THREE.Mesh>(null);
  const riserMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const manifoldTubeRef = useRef<THREE.Mesh>(null);
  const manifoldMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const impulseHeadRef = useRef<THREE.Mesh>(null);
  const impulseHeadMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const ventPlumeRef = useRef<THREE.Mesh>(null);
  const ventPlumeMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const breechRingRef = useRef<THREE.Mesh>(null);
  const breechRingMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const chevronsRef = useRef<THREE.InstancedMesh>(null);
  const chevronMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useEffect(() => {
    const inst = chevronsRef.current;
    if (!inst) return;
    for (let i = 0; i < STREAM_CHEVRON_COUNT; i++) {
      inst.setMatrixAt(i, _hiddenMat4);
      inst.setColorAt(i, COL_GAS_TAP_CYAN);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }, [activeWeaponId, mode, gasFlowVisible]);

  useFrame((state) => {
    const root = rootRef.current;
    if (!root) return;

    const appState = useAppStore.getState();
    if (
      appState.mode !== 'firing' ||
      !appState.gasFlowVisible ||
      appState.screen !== 'workbench'
    ) {
      root.visible = false;
      return;
    }

    const weaponId = appState.activeWeaponId;
    const manifest = getWeaponManifest(weaponId);
    const caliber = manifest.caliberProfile;
    const timing = getWeaponFiringTiming(weaponId);
    const manifold = WEAPON_GAS_MANIFOLD_PROFILES[weaponId];
    const f = playbackClock.getState().animatedFireProgress;

    evaluateInternalBallisticsInto(caliber, f, _sample, timing);

    const blowdownEndF = Math.min(0.95, _sample.safeUnlockF + 0.11);
    if (f < timing.ignitionF || f > blowdownEndF) {
      root.visible = false;
      return;
    }
    root.visible = true;

    const boreRadius =
      caliber === '50_bmg' || caliber === '50_ae'
        ? 0.34
        : caliber === '338_lapua' || caliber === '762_m43' || caliber === '9mm_para'
          ? 0.25
          : 0.2;

    // 1. Bore propellant column (chamberX -> live projectile base)
    const boreSpan = Math.max(1.0, manifold.muzzleX - manifold.chamberX);
    const liveTravel = Math.max(0.035, _sample.boreTravelRatio);
    const liveLen = boreSpan * liveTravel;
    const boreMidX = manifold.chamberX + liveLen * 0.5;

    const pNorm = clamp01(_sample.pressure01);
    const postExitFade =
      f <= timing.muzzleExitF
        ? 1
        : 1 - clamp01((f - timing.muzzleExitF) / Math.max(0.03, blowdownEndF - timing.muzzleExitF));
    const boreAlpha = clamp01(Math.pow(pNorm, 0.42) * 0.72 * postExitFade);

    _colorWork
      .copy(COL_SAFE_BLOWDOWN)
      .lerp(COL_HIGH_PRESSURE, clamp01(pNorm * 1.6))
      .lerp(COL_PEAK_PLASMA, clamp01((pNorm - 0.55) * 2.2));

    if (boreOuterRef.current && boreOuterMatRef.current) {
      boreOuterRef.current.visible = boreAlpha > 0.015;
      boreOuterRef.current.position.set(boreMidX, manifold.boreY, 0);
      boreOuterRef.current.scale.set(boreRadius, liveLen, boreRadius);
      boreOuterMatRef.current.color.copy(_colorWork);
      boreOuterMatRef.current.opacity = boreAlpha * 0.52;
    }
    if (boreCoreRef.current && boreCoreMatRef.current) {
      boreCoreRef.current.visible = boreAlpha > 0.02;
      boreCoreRef.current.position.set(boreMidX, manifold.boreY, 0);
      boreCoreRef.current.scale.set(
        boreRadius * 0.46,
        liveLen,
        boreRadius * 0.46
      );
      boreCoreMatRef.current.color
        .copy(_colorWork)
        .lerp(COL_PEAK_PLASMA, 0.55);
      boreCoreMatRef.current.opacity = Math.min(0.82, boreAlpha * 0.88);
    }

    // 2. Gas-tap riser, manifold channel & carrier/piston impulse glow
    const uncoverF = computeGasPortUncoverF(caliber, timing);
    const hasActiveTap =
      manifold.hasGasTap &&
      manifold.gasPortX !== null &&
      uncoverF !== null &&
      f >= uncoverF;

    let gasWave01 = 0;
    let gasAlpha = 0;
    if (hasActiveTap && uncoverF !== null) {
      const fillSpan = Math.max(0.028, timing.muzzleExitF + 0.035 - uncoverF);
      gasWave01 = clamp01((f - uncoverF) / fillSpan);
      const decayStart = timing.muzzleExitF + 0.015;
      const decay =
        f <= decayStart
          ? 1
          : 1 - clamp01((f - decayStart) / Math.max(0.04, blowdownEndF - decayStart));
      gasAlpha = clamp01((0.35 + 0.65 * Math.sqrt(pNorm)) * decay);
    }

    if (riserMeshRef.current && riserMatRef.current) {
      if (hasActiveTap && manifold.gasPortX !== null && gasAlpha > 0.02) {
        const dy = manifold.gasChannelY - manifold.boreY;
        const dz = manifold.gasChannelZ;
        const riserLen = Math.max(0.18, Math.hypot(dy, dz));
        _dirVec.set(0, dy, dz).normalize();
        _quat.setFromUnitVectors(_upAxis, _dirVec);
        riserMeshRef.current.visible = true;
        riserMeshRef.current.position.set(
          manifold.gasPortX,
          manifold.boreY + dy * 0.5,
          dz * 0.5
        );
        riserMeshRef.current.quaternion.copy(_quat);
        riserMeshRef.current.scale.set(0.14, riserLen, 0.14);
        riserMatRef.current.color
          .copy(COL_GAS_TAP_CYAN)
          .lerp(COL_HIGH_PRESSURE, clamp01(pNorm * 1.1));
        riserMatRef.current.opacity = gasAlpha * 0.76;
      } else {
        riserMeshRef.current.visible = false;
      }
    }

    let liveFrontX = manifold.gasPortX ?? manifold.chamberX;
    if (manifoldTubeRef.current && manifoldMatRef.current) {
      if (hasActiveTap && manifold.gasPortX !== null && gasAlpha > 0.02) {
        const portX = manifold.gasPortX;
        const fullDx = manifold.gasTargetX - portX;
        liveFrontX = portX + fullDx * Math.max(0.08, gasWave01);
        const segLen = Math.max(0.2, Math.abs(liveFrontX - portX));
        const midX = (portX + liveFrontX) * 0.5;
        const tubeRadius =
          manifold.family === 'direct_impingement' ? 0.11 : 0.17;

        manifoldTubeRef.current.visible = true;
        manifoldTubeRef.current.position.set(
          midX,
          manifold.gasChannelY,
          manifold.gasChannelZ
        );
        manifoldTubeRef.current.scale.set(tubeRadius, segLen, tubeRadius);
        manifoldMatRef.current.color
          .copy(COL_GAS_TAP_CYAN)
          .lerp(COL_PEAK_PLASMA, clamp01(pNorm * 0.85));
        manifoldMatRef.current.opacity = gasAlpha * 0.68;
      } else {
        manifoldTubeRef.current.visible = false;
      }
    }

    if (impulseHeadRef.current && impulseHeadMatRef.current) {
      if (hasActiveTap && gasWave01 > 0.25 && gasAlpha > 0.02) {
        const pulseR =
          manifold.family === 'direct_impingement'
            ? 0.34 + 0.14 * gasWave01
            : 0.28 + 0.1 * gasWave01;
        impulseHeadRef.current.visible = true;
        impulseHeadRef.current.position.set(
          liveFrontX,
          manifold.gasChannelY,
          manifold.gasChannelZ
        );
        impulseHeadRef.current.scale.set(pulseR, pulseR, pulseR * 1.35);
        impulseHeadMatRef.current.color
          .copy(COL_GAS_TAP_CYAN)
          .lerp(COL_HIGH_PRESSURE, clamp01(pNorm));
        impulseHeadMatRef.current.opacity = gasAlpha * 0.72;
      } else {
        impulseHeadRef.current.visible = false;
      }
    }

    if (ventPlumeRef.current && ventPlumeMatRef.current) {
      if (
        manifold.ventPos &&
        ((hasActiveTap && gasWave01 > 0.55) ||
          (!manifold.hasGasTap && pNorm > 0.15))
      ) {
        const vp = manifold.ventPos;
        const ventStrength = manifold.hasGasTap ? gasAlpha : boreAlpha * 0.65;
        ventPlumeRef.current.visible = ventStrength > 0.03;
        const zSign = vp[2] >= 0 ? 1 : -1;
        _dirVec.set(0.22, 0.36, vp[2] === 0 ? 0.15 : 0.88 * zSign).normalize();
        _quat.setFromUnitVectors(_upAxis, _dirVec);
        const jetLen = 0.75 + 0.85 * ventStrength;
        ventPlumeRef.current.position.set(
          vp[0] + _dirVec.x * jetLen * 0.5,
          vp[1] + _dirVec.y * jetLen * 0.5,
          vp[2] + _dirVec.z * jetLen * 0.5
        );
        ventPlumeRef.current.quaternion.copy(_quat);
        ventPlumeRef.current.scale.set(0.24, jetLen, 0.24);
        ventPlumeMatRef.current.color.copy(COL_GAS_TAP_CYAN);
        ventPlumeMatRef.current.opacity = ventStrength * 0.52;
      } else {
        ventPlumeRef.current.visible = false;
      }
    }

    // 3. Breech pressure / safe-unlock status collar at chamberX
    if (breechRingRef.current && breechRingMatRef.current) {
      const ringAlpha = clamp01(boreAlpha * 1.15);
      breechRingRef.current.visible = ringAlpha > 0.025;
      breechRingRef.current.position.set(manifold.chamberX, manifold.boreY, 0);
      const ringScale = boreRadius * 1.85;
      breechRingRef.current.scale.set(ringScale, ringScale, ringScale);
      breechRingMatRef.current.color.copy(
        _sample.isOverSafeUnlockThreshold ? COL_SEALED_RING : COL_SAFE_UNLOCK
      );
      breechRingMatRef.current.opacity = ringAlpha * 0.68;
    }

    // 4. Instanced directional flow chevrons (Zero-GC matrix updates)
    const inst = chevronsRef.current;
    if (!inst) return;

    const phaseScroll = (state.clock.elapsedTime * 3.4) % 1;
    let cursor = 0;

    // 4a. Bore forward streamlines (+X)
    const boreArrows = 6;
    _dirVec.set(1, 0, 0);
    _quat.setFromUnitVectors(_upAxis, _dirVec);
    for (let i = 0; i < boreArrows && cursor < STREAM_CHEVRON_COUNT; i++) {
      const u = ((i + phaseScroll) / boreArrows) % 1;
      const x = manifold.chamberX + liveLen * u;
      if (boreAlpha > 0.03 && liveLen > 0.9) {
        const s = (0.72 + 0.35 * Math.sin(u * Math.PI)) * (boreRadius / 0.24);
        _posVec.set(x, manifold.boreY, 0);
        _scaleVec.set(s, s, s);
        _mat4.compose(_posVec, _quat, _scaleVec);
        inst.setMatrixAt(cursor, _mat4);
        inst.setColorAt(cursor, _colorWork);
      } else {
        inst.setMatrixAt(cursor, _hiddenMat4);
      }
      cursor++;
    }

    // 4b. Gas manifold OR breech recoil/blowback streamlines
    if (hasActiveTap && manifold.gasPortX !== null && gasAlpha > 0.03) {
      const portX = manifold.gasPortX;
      const span = liveFrontX - portX;
      const dirSign = span >= 0 ? 1 : -1;
      _dirVec.set(dirSign, 0, 0);
      _quat.setFromUnitVectors(_upAxis, _dirVec);
      const gasArrows = 8;
      _colorWork
        .copy(COL_GAS_TAP_CYAN)
        .lerp(COL_PEAK_PLASMA, clamp01(pNorm * 0.7));
      for (let i = 0; i < gasArrows && cursor < STREAM_CHEVRON_COUNT; i++) {
        const u = ((i + phaseScroll) / gasArrows) % 1;
        if (Math.abs(span) > 0.45) {
          _posVec.set(
            portX + span * u,
            manifold.gasChannelY,
            manifold.gasChannelZ
          );
          const s = 0.78 + 0.25 * Math.sin(u * Math.PI);
          _scaleVec.set(s, s, s);
          _mat4.compose(_posVec, _quat, _scaleVec);
          inst.setMatrixAt(cursor, _mat4);
          inst.setColorAt(cursor, _colorWork);
        } else {
          inst.setMatrixAt(cursor, _hiddenMat4);
        }
        cursor++;
      }
    } else if (!manifold.hasGasTap && manifold.family !== 'manual_bolt_action') {
      // Rearward breech-thrust chevrons for blowback / roller-delayed / short-recoil systems
      const thrustSpan = manifold.chamberX - manifold.gasTargetX;
      _dirVec.set(-1, 0, 0);
      _quat.setFromUnitVectors(_upAxis, _dirVec);
      const thrustArrows = 5;
      _colorWork.copy(
        _sample.isOverSafeUnlockThreshold ? COL_HIGH_PRESSURE : COL_GAS_TAP_CYAN
      );
      for (let i = 0; i < thrustArrows && cursor < STREAM_CHEVRON_COUNT; i++) {
        const u = ((i + phaseScroll) / thrustArrows) % 1;
        if (boreAlpha > 0.04 && thrustSpan > 0.4) {
          _posVec.set(
            manifold.chamberX - thrustSpan * u * 0.75,
            manifold.gasChannelY,
            manifold.gasChannelZ
          );
          _scaleVec.set(0.75, 0.75, 0.75);
          _mat4.compose(_posVec, _quat, _scaleVec);
          inst.setMatrixAt(cursor, _mat4);
          inst.setColorAt(cursor, _colorWork);
        } else {
          inst.setMatrixAt(cursor, _hiddenMat4);
        }
        cursor++;
      }
    }

    while (cursor < STREAM_CHEVRON_COUNT) {
      inst.setMatrixAt(cursor, _hiddenMat4);
      cursor++;
    }

    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    if (chevronMatRef.current) {
      chevronMatRef.current.opacity = Math.max(boreAlpha, gasAlpha) * 0.85;
    }
  });

  if (mode !== 'firing' || !gasFlowVisible) {
    return null;
  }

  return (
    <group ref={rootRef} name="WP05GasFlowVisualizer" visible={false}>
      {/* Bore propellant expansion sheath */}
      <mesh
        ref={boreOuterRef}
        rotation={[0, 0, -Math.PI / 2]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={14}
      >
        <cylinderGeometry args={[1, 1, 1, 16, 1, true]} />
        <meshBasicMaterial
          ref={boreOuterMatRef}
          color="#f59e0b"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Bore propellant incandescent plasma core */}
      <mesh
        ref={boreCoreRef}
        rotation={[0, 0, -Math.PI / 2]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={15}
      >
        <cylinderGeometry args={[1, 1, 1, 12, 1, false]} />
        <meshBasicMaterial
          ref={boreCoreMatRef}
          color="#fde68a"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Gas-port tap riser (bore -> gas block / gas cylinder) */}
      <mesh
        ref={riserMeshRef}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={15}
      >
        <cylinderGeometry args={[1, 1, 1, 12, 1, false]} />
        <meshBasicMaterial
          ref={riserMatRef}
          color="#22d3ee"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Gas tube / piston cylinder axial manifold stream */}
      <mesh
        ref={manifoldTubeRef}
        rotation={[0, 0, -Math.PI / 2]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={15}
      >
        <cylinderGeometry args={[1, 1, 1, 14, 1, false]} />
        <meshBasicMaterial
          ref={manifoldMatRef}
          color="#22d3ee"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Piston face / Stoner BCG internal expansion chamber pressure front */}
      <mesh
        ref={impulseHeadRef}
        rotation={[0, Math.PI / 2, 0]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={16}
      >
        <torusGeometry args={[1, 0.32, 12, 24]} />
        <meshBasicMaterial
          ref={impulseHeadMatRef}
          color="#22d3ee"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Secondary gas block / carrier exhaust vent jet */}
      <mesh
        ref={ventPlumeRef}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={14}
      >
        <coneGeometry args={[1, 1, 12, 1, true]} />
        <meshBasicMaterial
          ref={ventPlumeMatRef}
          color="#22d3ee"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Chamber breech lockup / safe-unlock pressure status ring */}
      <mesh
        ref={breechRingRef}
        rotation={[0, Math.PI / 2, 0]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={15}
      >
        <torusGeometry args={[1, 0.16, 10, 28]} />
        <meshBasicMaterial
          ref={breechRingMatRef}
          color="#fbbf24"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* 16 pre-allocated instanced directional flow chevrons */}
      <instancedMesh
        ref={chevronsRef}
        args={[undefined, undefined, STREAM_CHEVRON_COUNT]}
        frustumCulled={false}
        raycast={noRaycast}
        renderOrder={16}
      >
        <coneGeometry args={[0.14, 0.42, 10, 1, true]} />
        <meshBasicMaterial
          ref={chevronMatRef}
          color="#ffffff"
          transparent
          opacity={0.82}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </group>
  );
};

GasFlowVisualizer.displayName = 'GasFlowVisualizer';
