import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
} from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { computePartTransform } from '../data/g17PartsSpec';
import {
  getWeaponCameraPresets,
  getWeaponParts,
  getWeaponWorkbenchMeta,
  WeaponScaleProfile,
} from '../data/weaponRegistry';
import { getPartLocalCenter } from '../geometry/partGeometryRegistry';
import { useExplodeStore } from '../store/useExplodeStore';
import { ExplodablePart } from './ExplodablePart';
import { FiringBallistics } from './FiringBallistics';
import { updateCalloutOverlay60fps } from './CalloutOverlay';

const BASE_FIRING_RATE = 0.42;

function resolveScaleProfile(
  weaponId: string,
  profile?: WeaponScaleProfile
): WeaponScaleProfile {
  if (profile) return profile;
  if (weaponId === 'm82a1' || weaponId === 'awm') return 'heavy_sniper';
  if (
    weaponId === 'ak15' ||
    weaponId === 'm4a1' ||
    weaponId === 'mp5' ||
    weaponId === 'scar' ||
    weaponId === 'aug'
  ) {
    return 'rifle';
  }
  return 'pistol';
}

const DisassemblyRig: React.FC = () => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();

  const animatedProgressRef = useRef<number>(
    useExplodeStore.getState().targetProgress
  );
  const animatedFirePhaseRef = useRef<number>(
    useExplodeStore.getState().fireProgress
  );

  const hasSnappedInitialRef = useRef<boolean>(false);
  const flyRef = useRef<{
    active: boolean;
    goalPos: THREE.Vector3;
    goalTarget: THREE.Vector3;
  }>({
    active: false,
    goalPos: new THREE.Vector3(14.5, 2.2, 54.0),
    goalTarget: new THREE.Vector3(3.2, -5.2, 0),
  });

  const screen = useExplodeStore((s) => s.screen);
  const activeWeaponId = useExplodeStore((s) => s.activeWeaponId);
  const armoryAutoRotate = useExplodeStore((s) => s.armoryAutoRotate);
  const selectedPartId = useExplodeStore((s) => s.selectedPartId);
  const cameraCommand = useExplodeStore((s) => s.cameraCommand);
  const weaponParts = getWeaponParts(activeWeaponId);

  // Respond to explicit camera preset buttons, weapon switches & viewport aspect ratio changes
  useEffect(() => {
    const presets = getWeaponCameraPresets(activeWeaponId);
    const meta = getWeaponWorkbenchMeta(activeWeaponId);
    const scaleProfile = resolveScaleProfile(activeWeaponId, meta.scaleProfile);
    const cfg = presets[cameraCommand.preset];
    if (!cfg || size.width <= 0 || size.height <= 0) return;
    const t = useExplodeStore.getState().targetProgress;
    const aspect = Math.max(0.42, size.width / Math.max(1, size.height));

    if (cameraCommand.preset === 'armory_showcase') {
      const baseMinScale =
        scaleProfile === 'heavy_sniper'
          ? 1.08
          : scaleProfile === 'rifle'
            ? 1.05
            : 1.0;
      const aspectRef = scaleProfile === 'heavy_sniper' ? 1.28 : 1.18;
      const armoryScale = Math.max(baseMinScale, aspectRef / aspect);
      const origTx = cfg.target[0];
      const tx = scaleProfile !== 'pistol' ? origTx - 2.6 : origTx;
      const ty = cfg.target[1];
      const tz = cfg.target[2];
      flyRef.current.goalTarget.set(tx, ty, tz);
      flyRef.current.goalPos.set(
        tx + (cfg.pos[0] - origTx) * armoryScale,
        ty + (cfg.pos[1] - ty) * armoryScale,
        tz + (cfg.pos[2] - tz) * armoryScale
      );
    } else {
      const isFixedClosePreset =
        cameraCommand.preset === 'safe_action' ||
        cameraCommand.preset === 'firing_view';
      const tCam = Math.pow(Math.max(0, t), 0.52);

      let vertScale: number;
      let horizScale: number;
      let xShift: number;
      let yShift: number;

      if (scaleProfile === 'heavy_sniper') {
        vertScale = 1.18 + tCam * 0.68;
        horizScale = (0.92 + tCam * 0.64) / aspect;
        xShift = 2.2 * tCam;
        yShift = -1.6 - (3.1 + (aspect < 0.85 ? 2.6 : 0)) * tCam;
      } else if (scaleProfile === 'rifle') {
        vertScale = 1.16 + tCam * 0.62;
        horizScale = (0.88 + tCam * 0.56) / aspect;
        xShift = 1.8 * tCam;
        yShift = -1.4 - (2.8 + (aspect < 0.85 ? 2.4 : 0)) * tCam;
      } else {
        vertScale = 1.16 + tCam * 1.18;
        horizScale = (0.88 + tCam * 0.88) / aspect;
        xShift = -1.4 * tCam;
        yShift = -1.3 - (2.1 + (aspect < 0.85 ? 2.4 : 0)) * tCam;
      }

      const scale = isFixedClosePreset
        ? Math.max(1, 1.08 / aspect)
        : Math.max(vertScale, horizScale);

      const finalXShift = isFixedClosePreset ? 0 : xShift;
      const finalYShift = isFixedClosePreset ? 0 : yShift;

      flyRef.current.goalTarget.set(
        cfg.target[0] + finalXShift,
        cfg.target[1] + finalYShift,
        cfg.target[2]
      );
      flyRef.current.goalPos.set(
        cfg.pos[0] * scale + finalXShift,
        cfg.pos[1] * scale + finalYShift,
        cfg.pos[2] * scale
      );
    }

    if (!hasSnappedInitialRef.current && controlsRef.current) {
      camera.position.copy(flyRef.current.goalPos);
      controlsRef.current.target.copy(flyRef.current.goalTarget);
      controlsRef.current.update();
      flyRef.current.active = false;
      hasSnappedInitialRef.current = true;
    } else {
      flyRef.current.active = true;
    }
  }, [cameraCommand, activeWeaponId, size.width, size.height, camera]);

  // Smoothly focus camera when user selects a part
  useEffect(() => {
    if (!selectedPartId) return;
    const state = useExplodeStore.getState();
    const meta = getWeaponWorkbenchMeta(state.activeWeaponId);
    if (
      state.cameraCommand.preset === 'safe_action' &&
      selectedPartId === meta.cutawayFocusPartId &&
      state.targetProgress === 0
    ) {
      return;
    }

    const spec = getWeaponParts(state.activeWeaponId).find(
      (p) => p.id === selectedPartId
    );
    if (!spec) return;

    const t = state.targetProgress;
    const { position, rotation } = computePartTransform(spec, t);
    const localCenter = getPartLocalCenter(spec.id);

    const worldCenter = new THREE.Vector3(...localCenter);
    worldCenter.applyEuler(new THREE.Euler(...rotation));
    worldCenter.add(new THREE.Vector3(...position));

    const currentTarget = controlsRef.current
      ? controlsRef.current.target.clone()
      : new THREE.Vector3(0, 0, 0);
    const viewDir = camera.position.clone().sub(currentTarget);
    if (viewDir.lengthSq() < 0.01) viewDir.set(0.3, 0.2, 1);
    viewDir.normalize();

    const scaleProfile = resolveScaleProfile(
      state.activeWeaponId,
      meta.scaleProfile
    );
    const focusDist =
      scaleProfile === 'heavy_sniper'
        ? spec.isShell
          ? 34
          : 19.5
        : scaleProfile === 'rifle'
          ? spec.isShell
            ? 27
            : 16.5
          : spec.isShell
            ? 20
            : 14.5;

    flyRef.current.goalTarget.copy(worldCenter);
    flyRef.current.goalPos
      .copy(worldCenter)
      .addScaledVector(viewDir, focusDist);
    flyRef.current.active = true;
  }, [selectedPartId, activeWeaponId, camera]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const state = useExplodeStore.getState();

    // 1. Disassembly auto-playback
    if (state.mode === 'explode' && state.isPlaying) {
      const next =
        state.targetProgress + state.playDirection * state.playSpeed * dt;
      if (next >= 1) {
        state.setTargetProgress(1);
        state.stopPlay();
      } else if (next <= 0) {
        state.setTargetProgress(0);
        state.stopPlay();
      } else {
        state.setTargetProgress(next);
      }
    }

    // 2. Smoothly damp disassembly scalar t
    animatedProgressRef.current = THREE.MathUtils.damp(
      animatedProgressRef.current,
      useExplodeStore.getState().targetProgress,
      7.0,
      dt
    );

    // 3. Firing cycle simulation playback
    if (state.mode === 'firing') {
      if (state.isFiringPlaying && animatedProgressRef.current < 0.02) {
        const step = BASE_FIRING_RATE * state.fireSpeedMultiplier * dt;
        const nextF = state.fireProgress + step;
        if (nextF >= 1) {
          if (state.fireLoop) {
            const wrapped = nextF - Math.floor(nextF);
            state.setFireProgress(wrapped);
            animatedFirePhaseRef.current = wrapped;
          } else {
            state.setFireProgress(1);
            state.stopFiringPlay();
          }
        } else {
          state.setFireProgress(nextF);
        }
      }

      const targetF = useExplodeStore.getState().fireProgress;
      if (Math.abs(targetF - animatedFirePhaseRef.current) > 0.5) {
        animatedFirePhaseRef.current = targetF;
      } else {
        animatedFirePhaseRef.current = THREE.MathUtils.damp(
          animatedFirePhaseRef.current,
          targetF,
          state.isFiringPlaying ? 24 : 12,
          dt
        );
      }
    } else {
      animatedFirePhaseRef.current = 0;
    }

    // 4. Initial snap once OrbitControls mounts + non-intrusive smooth camera fly-to
    if (!hasSnappedInitialRef.current && controlsRef.current) {
      camera.position.copy(flyRef.current.goalPos);
      controlsRef.current.target.copy(flyRef.current.goalTarget);
      controlsRef.current.update();
      flyRef.current.active = false;
      hasSnappedInitialRef.current = true;
    } else if (flyRef.current.active && controlsRef.current) {
      camera.position.lerp(flyRef.current.goalPos, 1 - Math.exp(-6.0 * dt));
      controlsRef.current.target.lerp(
        flyRef.current.goalTarget,
        1 - Math.exp(-6.5 * dt)
      );
      controlsRef.current.update();

      if (
        camera.position.distanceTo(flyRef.current.goalPos) < 0.08 &&
        controlsRef.current.target.distanceTo(flyRef.current.goalTarget) < 0.05
      ) {
        flyRef.current.active = false;
      }
    }

    // 5. Project 3D anchors -> 2D vertical hairline leader callouts at 60fps
    updateCalloutOverlay60fps(
      camera,
      size.width,
      size.height,
      animatedProgressRef.current,
      animatedFirePhaseRef.current
    );
  });

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.07}
        autoRotate={screen === 'armory' && armoryAutoRotate}
        autoRotateSpeed={1.15}
        minDistance={4}
        maxDistance={280}
        onStart={() => {
          flyRef.current.active = false;
        }}
      />

      <group>
        {weaponParts.map((part) => (
          <ExplodablePart
            key={part.id}
            part={part}
            animatedProgressRef={animatedProgressRef}
            animatedFirePhaseRef={animatedFirePhaseRef}
          />
        ))}
        <FiringBallistics animatedFirePhaseRef={animatedFirePhaseRef} />
      </group>
    </>
  );
};

export const G17Scene: React.FC = () => {
  const selectPart = useExplodeStore((s) => s.selectPart);
  const activeWeaponId = useExplodeStore((s) => s.activeWeaponId);
  const meta = getWeaponWorkbenchMeta(activeWeaponId);
  const scaleProfile = resolveScaleProfile(activeWeaponId, meta.scaleProfile);
  const gridY =
    meta.gridY ??
    (scaleProfile === 'heavy_sniper'
      ? -26.5
      : scaleProfile === 'rifle'
        ? -24.5
        : -18.5);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [14.5, 2.2, 54.0], fov: 41, near: 0.1, far: 560 }}
      onPointerMissed={() => {
        if (useExplodeStore.getState().screen === 'workbench') {
          selectPart(null);
        }
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#eef2f6']} />
      <fog attach="fog" args={['#eef2f6', 250, 460]} />

      <ambientLight intensity={0.88} color="#f8fafc" />
      <hemisphereLight
        args={['#ffffff', '#94a3b8', 0.78]}
        position={[0, 30, 0]}
      />
      <directionalLight
        position={[18, 24, 26]}
        intensity={2.45}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight
        position={[-22, 14, 18]}
        intensity={1.45}
        color="#e0f2fe"
      />
      <directionalLight
        position={[10, -16, 22]}
        intensity={0.9}
        color="#f1f5f9"
      />
      <directionalLight
        position={[-12, 18, -24]}
        intensity={1.35}
        color="#dbeafe"
      />

      <Environment resolution={512}>
        <color attach="background" args={['#64748b']} />
        <group rotation={[-Math.PI / 5, -0.25, 0]}>
          {/* Overhead studio softbox */}
          <Lightformer
            intensity={1.65}
            rotation-x={Math.PI / 2}
            position={[2, 10, 2]}
            scale={[42, 22, 1]}
            color="#ffffff"
          />
          {/* Wide front-upper specular gradient softbox for chrome/PVD receiver & slide bevels */}
          <Lightformer
            intensity={1.45}
            rotation-x={Math.PI / 4}
            position={[4, 7, 12]}
            scale={[44, 18, 1]}
            color="#ffffff"
          />
          {/* Cool rim light strip on left */}
          <Lightformer
            intensity={1.15}
            rotation-y={Math.PI / 2}
            position={[-20, 3, 2]}
            scale={[26, 14, 1]}
            color="#e0f2fe"
          />
          {/* Warm-neutral fill strip on right */}
          <Lightformer
            intensity={1.1}
            rotation-y={-Math.PI / 2}
            position={[24, 2, 4]}
            scale={[26, 14, 1]}
            color="#f8fafc"
          />
          {/* Subtle slate bottom bounce card so chrome/stainless undersides keep rich metallic midtone contrast */}
          <Lightformer
            intensity={0.55}
            rotation-x={-Math.PI / 2}
            position={[2, -10, 4]}
            scale={[40, 24, 1]}
            color="#64748b"
          />
        </group>
      </Environment>

      <Grid
        position={[0, gridY, 0]}
        args={[160, 160]}
        cellSize={2}
        cellThickness={0.6}
        cellColor="#cbd5e1"
        sectionSize={10}
        sectionThickness={1.1}
        sectionColor="#94a3b8"
        fadeDistance={130}
        fadeStrength={1.3}
      />

      <DisassemblyRig />
    </Canvas>
  );
};
