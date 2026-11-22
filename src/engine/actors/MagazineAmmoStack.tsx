import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { getLoadedWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type { WeaponId, WeaponPartSpec } from '../../weapons/types';
import {
  MAGAZINE_STACK_SPECS,
  MAX_MAGAZINE_STACK_INSTANCES,
  computeMagazineFeedShift,
  computeMagazineReplenishAlpha,
  createMutableMagazineRoundPose,
  evaluateMagazineRoundSlotInto,
} from '../ballistics/magazineStackSpecs';
import { playbackClock } from '../clock/playbackClock';
import { fieldStripStore } from '../fieldstrip/fieldStripStore';
import { isArcheryCaliber } from '../physics/armoryPhysics';
import {
  clamp01,
  createMutablePose,
  evaluatePartPoseInto,
  smoothstep01,
} from '../kinematics/math';
import { malfunctionStore } from '../malfunctions/malfunctionStore';
import {
  CALIBER_VISUAL_SPECS,
  WEAPON_ROUND_FIT,
  getCaliberGeometries,
} from './BallisticsSystem';

// ============================================================================
// Module-Pooled Scratch Math Primitives (Zero GC inside 60fps `useFrame`)
// ============================================================================

const _magPose = createMutablePose();
const _slotPose = createMutableMagazineRoundPose();

const _eAssembled = new THREE.Euler();
const _eLive = new THREE.Euler();
const _eRound = new THREE.Euler();

const _qAssembledInv = new THREE.Quaternion();
const _qLive = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _qRound = new THREE.Quaternion();

const _vAssembled = new THREE.Vector3();
const _vLive = new THREE.Vector3();
const _vDelta = new THREE.Vector3();

const _vShiftCase = new THREE.Vector3();
const _vShiftBullet = new THREE.Vector3();
const _vInstPos = new THREE.Vector3();
const _vScale = new THREE.Vector3();
const _mInst = new THREE.Matrix4();

const NOOP_RAYCAST: THREE.Object3D['raycast'] = () => {
  // Intentionally empty: BOM / Field-Strip / Malfunction clicks pass straight through
  // to `mag_body` / `mag_follower` with zero raycast cost across 30+ lathe instances.
};

function findMagBodyPart(
  parts: readonly WeaponPartSpec[],
  partId: string
): WeaponPartSpec | null {
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].id === partId) return parts[i];
  }
  return null;
}

function writeCartridgeInstanceMatrices(
  instanceIdx: number,
  px: number,
  py: number,
  pz: number,
  rx: number,
  ry: number,
  rz: number,
  uniformScale: number,
  magLocalShiftX: number,
  bulletLocalOffset: number,
  caseMesh: THREE.InstancedMesh,
  primerMesh: THREE.InstancedMesh,
  bulletMesh: THREE.InstancedMesh
): void {
  _eRound.set(rx, ry, rz);
  _qRound.setFromEuler(_eRound);
  _vScale.set(uniformScale, uniformScale, uniformScale);

  // 1. Case & Live Boxer Primer: worldPos = P + S * R * [magLocalShiftX, 0, 0]
  _vShiftCase
    .set(magLocalShiftX * uniformScale, 0, 0)
    .applyQuaternion(_qRound);
  _vInstPos.set(px + _vShiftCase.x, py + _vShiftCase.y, pz + _vShiftCase.z);
  _mInst.compose(_vInstPos, _qRound, _vScale);
  caseMesh.setMatrixAt(instanceIdx, _mInst);
  primerMesh.setMatrixAt(instanceIdx, _mInst);

  // 2. Jacketed Projectile: worldPos = P + S * R * [magLocalShiftX + bulletLocalOffset, 0, 0]
  _vShiftBullet
    .set((magLocalShiftX + bulletLocalOffset) * uniformScale, 0, 0)
    .applyQuaternion(_qRound);
  _vInstPos.set(
    px + _vShiftBullet.x,
    py + _vShiftBullet.y,
    pz + _vShiftBullet.z
  );
  _mInst.compose(_vInstPos, _qRound, _vScale);
  bulletMesh.setMatrixAt(instanceIdx, _mInst);
}

function syncMagazineStackFrame(
  weaponId: WeaponId,
  group: THREE.Group,
  caseMesh: THREE.InstancedMesh,
  primerMesh: THREE.InstancedMesh,
  bulletMesh: THREE.InstancedMesh
): void {
  const appState = useAppStore.getState();
  if (appState.screen === 'cartridges' || appState.hiddenGroups.magazine) {
    group.visible = false;
    return;
  }

  const plugin = getLoadedWeaponPlugin(weaponId);
  if (!plugin) {
    group.visible = false;
    return;
  }

  const spec = MAGAZINE_STACK_SPECS[weaponId];
  if (!spec || spec.roundCount <= 0 || spec.slots.length === 0) {
    group.visible = false;
    caseMesh.count = 0;
    primerMesh.count = 0;
    bulletMesh.count = 0;
    return;
  }
  if (
    appState.screen === 'workbench' &&
    appState.isolateSelected &&
    appState.selectedPartId !== null &&
    appState.selectedPartId !== spec.magBodyPartId &&
    appState.selectedPartId !== spec.throatPartId
  ) {
    group.visible = false;
    return;
  }

  const magBodyPart = findMagBodyPart(plugin.parts, spec.magBodyPartId);
  if (!magBodyPart) {
    group.visible = false;
    return;
  }

  const clock = playbackClock.getState();
  const explodeT = clock.animatedProgress;
  const fireF = clock.animatedFireProgress;

  const isFiringMode = appState.mode === 'firing';
  const isFieldStrip =
    appState.screen === 'workbench' &&
    appState.fieldStripActive &&
    appState.mode === 'explode';
  const isMalfunction =
    appState.screen === 'workbench' && appState.malfunctionActive;
  const isLiveFiring =
    appState.screen === 'workbench' && isFiringMode && !isMalfunction;

  // Smoothly scale out the cartridge column during internal magazine sub-disassembly
  // (`t > magSubStripStartT`) so exploding follower & compressed spring separate with zero clipping.
  let subStripScale = 1;
  if (
    !isFieldStrip &&
    !isFiringMode &&
    !isMalfunction &&
    explodeT > spec.magSubStripStartT
  ) {
    const subSpan = Math.min(0.11, Math.max(0.06, 0.62 - spec.magSubStripStartT));
    const uSub = smoothstep01((explodeT - spec.magSubStripStartT) / subSpan);
    subStripScale = 1 - uSub;
    if (subStripScale <= 0.005) {
      group.visible = false;
      return;
    }
  }

  // Evaluate live `mag_body` pose identically to `PartActor.tsx` and compute exact SE(3) rigid delta
  if (isFieldStrip) {
    fieldStripStore.evaluatePartPoseInto(weaponId, magBodyPart, _magPose);
  } else {
    evaluatePartPoseInto(
      magBodyPart,
      explodeT,
      isFiringMode,
      fireF,
      plugin.computeFiringKinematics,
      _magPose
    );
    if (isMalfunction) {
      malfunctionStore.applyPartPoseDelta(weaponId, magBodyPart.id, _magPose);
    }
  }

  const baseRot = magBodyPart.assembledRot;
  _eAssembled.set(
    baseRot ? baseRot[0] : 0,
    baseRot ? baseRot[1] : 0,
    baseRot ? baseRot[2] : 0
  );
  _qAssembledInv.setFromEuler(_eAssembled).invert();
  _eLive.set(_magPose.rx, _magPose.ry, _magPose.rz);
  _qLive.setFromEuler(_eLive);

  // qDelta = qLive * qAssembled^-1; vDelta = pLive - qDelta * pAssembled
  _qDelta.multiplyQuaternions(_qLive, _qAssembledInv);
  _vAssembled
    .set(
      magBodyPart.assembledPos[0],
      magBodyPart.assembledPos[1],
      magBodyPart.assembledPos[2]
    )
    .applyQuaternion(_qDelta);
  _vLive.set(_magPose.px, _magPose.py, _magPose.pz);
  _vDelta.subVectors(_vLive, _vAssembled);

  group.position.copy(_vDelta);
  group.quaternion.copy(_qDelta);
  group.scale.set(1, 1, 1);
  group.visible = true;

  const manifest = getWeaponManifest(weaponId);
  const calSpec = CALIBER_VISUAL_SPECS[manifest.caliberProfile];
  const roundFit = WEAPON_ROUND_FIT[weaponId];
  const baseScale = roundFit.roundScale * subStripScale;
  const shiftX = roundFit.magLocalShiftX;
  const bulletOffset = calSpec.bulletLocalOffset;

  let instanceCursor = 0;

  if (isLiveFiring) {
    const feedShift01 = computeMagazineFeedShift(weaponId, fireF);
    const replenish01 = computeMagazineReplenishAlpha(weaponId, fireF);
    const handoffIdx = spec.firingHandoffSlotIndex;

    // 1. Reserve stack rounds (`handoffIdx + 1 .. N - 1`) shifting smoothly into `slot[i - 1]`
    // (`0 .. handoffIdx` omitted in live firing so `nextRoundRef` feeds/spirals freely into chamber!)
    for (let i = handoffIdx + 1; i < spec.roundCount; i++) {
      evaluateMagazineRoundSlotInto(weaponId, i, feedShift01, _slotPose);
      writeCartridgeInstanceMatrices(
        instanceCursor++,
        _slotPose.px,
        _slotPose.py,
        _slotPose.pz,
        _slotPose.rx,
        _slotPose.ry,
        _slotPose.rz,
        baseScale * _slotPose.scaleMult,
        shiftX,
        bulletOffset,
        caseMesh,
        primerMesh,
        bulletMesh
      );
    }

    // 2. Post-retraction bottom replacement round emerging into `slot[N - 1]` so `f = 1.0` == `f = 0.0`
    if (replenish01 > 0.008) {
      evaluateMagazineRoundSlotInto(
        weaponId,
        spec.roundCount,
        replenish01,
        _slotPose
      );
      const repScale = baseScale * clamp01(_slotPose.scaleMult);
      if (repScale > 0.004) {
        writeCartridgeInstanceMatrices(
          instanceCursor++,
          _slotPose.px,
          _slotPose.py,
          _slotPose.pz,
          _slotPose.rx,
          _slotPose.ry,
          _slotPose.rz,
          repScale,
          shiftX,
          bulletOffset,
          caseMesh,
          primerMesh,
          bulletMesh
        );
      }
    }
  } else {
    // Showcase, Armory, Workbench Explode, Field-Strip [G], and Malfunction [J]:
    // Render ALL `0 .. roundCount - 1` cartridges!
    for (let i = 0; i < spec.roundCount; i++) {
      const staggerShrink =
        subStripScale < 0.999
          ? clamp01(subStripScale * 1.25 - (1 - i / spec.roundCount) * 0.25)
          : 1;
      const roundScale = roundFit.roundScale * staggerShrink;
      if (roundScale <= 0.004) continue;
      evaluateMagazineRoundSlotInto(weaponId, i, 0, _slotPose);
      writeCartridgeInstanceMatrices(
        instanceCursor++,
        _slotPose.px,
        _slotPose.py,
        _slotPose.pz,
        _slotPose.rx,
        _slotPose.ry,
        _slotPose.rz,
        roundScale,
        shiftX,
        bulletOffset,
        caseMesh,
        primerMesh,
        bulletMesh
      );
    }
  }

  caseMesh.count = instanceCursor;
  primerMesh.count = instanceCursor;
  bulletMesh.count = instanceCursor;
  caseMesh.instanceMatrix.needsUpdate = true;
  primerMesh.instanceMatrix.needsUpdate = true;
  bulletMesh.instanceMatrix.needsUpdate = true;
}

/**
 * Museum-Grade Zero-GC 3D Full-Magazine Cartridge Stack Actor
 * -----------------------------------------------------------
 * Renders a completely loaded staggered/single/helical column of 1:1 SAAMI/CIP
 * brass cases, nickel Boxer primers, and copper-jacketed projectiles inside every
 * weapon's magazine across Showcase, Armory, and Workbench views (`renderOrder={2}`).
 */
export const MagazineAmmoStack: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const isMagHidden = useAppStore((s) => s.hiddenGroups.magazine);
  // Subscribe to plugin readiness so initial turntable render populates immediately once plugin loads
  const plugin = useWeaponPlugin(activeWeaponId);

  const manifest = getWeaponManifest(activeWeaponId);
  const caliberProfile = manifest.caliberProfile;
  const calSpec = CALIBER_VISUAL_SPECS[caliberProfile];
  const isArchery = isArcheryCaliber(caliberProfile);

  const { caseGeo, livePrimerGeo, bulletGeo } = useMemo(
    () => getCaliberGeometries(caliberProfile),
    [caliberProfile]
  );

  const groupRef = useRef<THREE.Group>(null);
  const caseMeshRef = useRef<THREE.InstancedMesh>(null);
  const primerMeshRef = useRef<THREE.InstancedMesh>(null);
  const bulletMeshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const grp = groupRef.current;
    const cm = caseMeshRef.current;
    const pm = primerMeshRef.current;
    const bm = bulletMeshRef.current;
    if (!grp || !cm || !pm || !bm) return;
    syncMagazineStackFrame(activeWeaponId, grp, cm, pm, bm);
  }, [activeWeaponId, caliberProfile, isMagHidden, plugin]);

  useFrame(() => {
    const grp = groupRef.current;
    const cm = caseMeshRef.current;
    const pm = primerMeshRef.current;
    const bm = bulletMeshRef.current;
    if (!grp || !cm || !pm || !bm) return;
    syncMagazineStackFrame(
      useAppStore.getState().activeWeaponId,
      grp,
      cm,
      pm,
      bm
    );
  });

  const activeSpec = MAGAZINE_STACK_SPECS[activeWeaponId];
  if (isMagHidden || !activeSpec || activeSpec.roundCount <= 0) return null;

  return (
    <group ref={groupRef}>
      <instancedMesh
        key={`mag-case-${caliberProfile}`}
        ref={caseMeshRef}
        args={[caseGeo, undefined, MAX_MAGAZINE_STACK_INSTANCES]}
        frustumCulled={false}
        raycast={NOOP_RAYCAST}
        renderOrder={2}
      >
        <meshStandardMaterial
          color={isArchery ? '#ffffff' : calSpec.caseColor}
          vertexColors={isArchery}
          metalness={
            isArchery
              ? 0.24
              : caliberProfile === '473_caseless'
                ? 0.08
                : caliberProfile === '12_gauge'
                  ? 0.35
                  : 0.86
          }
          roughness={
            isArchery
              ? 0.44
              : caliberProfile === '473_caseless'
                ? 0.72
                : caliberProfile === '12_gauge'
                  ? 0.42
                  : 0.22
          }
        />
      </instancedMesh>

      <instancedMesh
        key={`mag-primer-${caliberProfile}`}
        ref={primerMeshRef}
        args={[livePrimerGeo, undefined, MAX_MAGAZINE_STACK_INSTANCES]}
        frustumCulled={false}
        raycast={NOOP_RAYCAST}
        renderOrder={2}
      >
        <meshStandardMaterial
          color={calSpec.primerColor}
          metalness={isArchery ? 0.42 : 0.92}
          roughness={isArchery ? 0.28 : 0.18}
        />
      </instancedMesh>

      <instancedMesh
        key={`mag-bullet-${caliberProfile}`}
        ref={bulletMeshRef}
        args={[bulletGeo, undefined, MAX_MAGAZINE_STACK_INSTANCES]}
        frustumCulled={false}
        raycast={NOOP_RAYCAST}
        renderOrder={2}
      >
        <meshStandardMaterial
          color={isArchery ? '#ffffff' : calSpec.bulletColor}
          vertexColors={isArchery}
          metalness={0.82}
          roughness={0.22}
        />
      </instancedMesh>
    </group>
  );
};

MagazineAmmoStack.displayName = 'MagazineAmmoStack';
