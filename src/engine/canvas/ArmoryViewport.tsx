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
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import {
  getLoadedWeaponPlugin,
  useWeaponPlugin,
} from '../../weapons/registry';
import { BallisticsSystem } from '../actors/BallisticsSystem';
import { PartActor } from '../actors/PartActor';
import { updateCalloutOverlay60fps } from '../callout/CalloutOverlay';
import { playbackClock } from '../clock/playbackClock';
import {
  getCachedPartGeometry,
  getPartLocalCenter,
  useWeaponGeometries,
} from '../geometry/geometryService';
import { computePartTransform } from '../kinematics/math';

const BASE_FIRING_RATE = 0.42;

// Module-pooled scratch math primitives for zero heap churn on camera focus
const _focusWorldCenter = new THREE.Vector3();
const _focusEuler = new THREE.Euler();
const _focusPartPos = new THREE.Vector3();
const _focusCurrentTarget = new THREE.Vector3();
const _focusViewDir = new THREE.Vector3();

const DisassemblyRig: React.FC = () => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();

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

  const screen = useAppStore((s) => s.screen);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const armoryAutoRotate = useAppStore((s) => s.armoryAutoRotate);
  const selectedPartId = useAppStore((s) => s.selectedPartId);
  const cameraCommand = useAppStore((s) => s.cameraCommand);

  const plugin = useWeaponPlugin(activeWeaponId);
  // Triggers background Web Worker CSG build & re-renders as part batches stream in
  useWeaponGeometries(activeWeaponId, plugin?.parts ?? null);

  // Respond to explicit camera preset buttons, weapon switches & viewport aspect ratio changes
  useEffect(() => {
    const manifest = getWeaponManifest(activeWeaponId);
    const presets = manifest.cameraPresets;
    const meta = manifest.workbenchMeta;
    const scaleProfile = meta.scaleProfile;
    const cfg = presets[cameraCommand.preset];
    if (!cfg || size.width <= 0 || size.height <= 0) return;

    const t = playbackClock.getState().targetProgress;
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
      const tx =
        screen === 'armory' && scaleProfile !== 'pistol'
          ? origTx - 2.6
          : origTx;
      const ty = screen === 'showcase' ? cfg.target[1] + 1.15 : cfg.target[1];
      const tz = cfg.target[2];
      flyRef.current.goalTarget.set(tx, ty, tz);
      flyRef.current.goalPos.set(
        tx + (cfg.pos[0] - origTx) * armoryScale,
        ty + (cfg.pos[1] - cfg.target[1]) * armoryScale,
        tz + (cfg.pos[2] - tz) * armoryScale
      );
    } else {
      const isFixedClosePreset =
        cameraCommand.preset === 'cutaway_focus' ||
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
  }, [cameraCommand, activeWeaponId, screen, size.width, size.height, camera]);

  // Smoothly focus camera when user selects a part
  useEffect(() => {
    if (!selectedPartId) return;
    const state = useAppStore.getState();
    const manifest = getWeaponManifest(state.activeWeaponId);
    const meta = manifest.workbenchMeta;
    const clock = playbackClock.getState();

    if (
      state.cameraCommand.preset === 'cutaway_focus' &&
      selectedPartId === meta.cutawayFocusPartId &&
      clock.targetProgress === 0
    ) {
      return;
    }

    const loadedPlugin = getLoadedWeaponPlugin(state.activeWeaponId);
    const spec = loadedPlugin?.parts.find((p) => p.id === selectedPartId);
    if (!spec) return;

    const { position, rotation } = computePartTransform(
      spec,
      clock.targetProgress
    );
    const localCenter = getPartLocalCenter(state.activeWeaponId, spec.id);

    _focusEuler.set(rotation[0], rotation[1], rotation[2]);
    _focusPartPos.set(position[0], position[1], position[2]);
    _focusWorldCenter
      .set(localCenter[0], localCenter[1], localCenter[2])
      .applyEuler(_focusEuler)
      .add(_focusPartPos);

    if (controlsRef.current) {
      _focusCurrentTarget.copy(controlsRef.current.target);
    } else {
      _focusCurrentTarget.set(0, 0, 0);
    }
    _focusViewDir.copy(camera.position).sub(_focusCurrentTarget);
    if (_focusViewDir.lengthSq() < 0.01) _focusViewDir.set(0.3, 0.2, 1);
    _focusViewDir.normalize();

    const scaleProfile = meta.scaleProfile;
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

    flyRef.current.goalTarget.copy(_focusWorldCenter);
    flyRef.current.goalPos
      .copy(_focusWorldCenter)
      .addScaledVector(_focusViewDir, focusDist);
    flyRef.current.active = true;
  }, [selectedPartId, activeWeaponId, camera]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const state = useAppStore.getState();
    const clock = playbackClock.getState();

    // 1. Disassembly auto-playback (updates non-reactive playbackClock, zero React re-renders!)
    if (state.mode === 'explode' && state.isPlaying) {
      const next =
        clock.targetProgress + state.playDirection * state.playSpeed * dt;
      if (next >= 1) {
        playbackClock.setTargetProgress(1);
        state.stopPlay();
      } else if (next <= 0) {
        playbackClock.setTargetProgress(0);
        state.stopPlay();
      } else {
        playbackClock.setTargetProgress(next);
      }
    }

    // 2. Smoothly damp disassembly scalar t
    const nextAnimatedT = THREE.MathUtils.damp(
      clock.animatedProgress,
      playbackClock.getState().targetProgress,
      7.0,
      dt
    );
    playbackClock.setAnimatedProgress(nextAnimatedT);

    // 3. Firing cycle simulation playback
    if (state.mode === 'firing') {
      if (state.isFiringPlaying && nextAnimatedT < 0.02) {
        const step = BASE_FIRING_RATE * state.fireSpeedMultiplier * dt;
        const nextF = playbackClock.getState().fireProgress + step;
        if (nextF >= 1) {
          if (state.fireLoop) {
            const wrapped = nextF - Math.floor(nextF);
            playbackClock.setFireProgress(wrapped, true);
          } else {
            playbackClock.setFireProgress(1);
            state.stopFiringPlay();
          }
        } else {
          playbackClock.setFireProgress(nextF);
        }
      }

      const curClock = playbackClock.getState();
      const targetF = curClock.fireProgress;
      if (Math.abs(targetF - curClock.animatedFireProgress) > 0.5) {
        playbackClock.setAnimatedFireProgress(targetF);
      } else {
        playbackClock.setAnimatedFireProgress(
          THREE.MathUtils.damp(
            curClock.animatedFireProgress,
            targetF,
            state.isFiringPlaying ? 24 : 12,
            dt
          )
        );
      }
    } else {
      playbackClock.setAnimatedFireProgress(0);
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
    const finalClock = playbackClock.getState();
    updateCalloutOverlay60fps(
      camera,
      size.width,
      size.height,
      finalClock.animatedProgress,
      finalClock.animatedFireProgress
    );
  });

  const weaponParts = plugin?.parts ?? [];

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.07}
        enableZoom={screen !== 'showcase'}
        autoRotate={screen !== 'workbench' && armoryAutoRotate}
        autoRotateSpeed={1.15}
        minDistance={4}
        maxDistance={280}
        onStart={() => {
          flyRef.current.active = false;
        }}
      />

      {plugin && (
        <group>
          {weaponParts.map((part) => (
            <PartActor
              key={part.id}
              weaponId={activeWeaponId}
              part={part}
              geometry={getCachedPartGeometry(activeWeaponId, part.id)}
              customPbrBinding={plugin.pbrBindings[part.id]}
              computeKinematics={plugin.computeFiringKinematics}
            />
          ))}
          <BallisticsSystem />
        </group>
      )}
    </>
  );
};

export const ArmoryViewport: React.FC = () => {
  const selectPart = useAppStore((s) => s.selectPart);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const meta = getWeaponManifest(activeWeaponId).workbenchMeta;
  const gridY = meta.gridY;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{
        localClippingEnabled: true,
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.06,
      }}
      camera={{ position: [14.5, 2.2, 54.0], fov: 41, near: 0.1, far: 560 }}
      onPointerMissed={() => {
        if (useAppStore.getState().screen === 'workbench') {
          selectPart(null);
        }
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#e2e8f0']} />
      <fog attach="fog" args={['#e2e8f0', 250, 460]} />

      <ambientLight intensity={0.42} color="#f8fafc" />
      <hemisphereLight
        args={['#f8fafc', '#64748b', 0.68]}
        position={[0, 30, 0]}
      />
      {/* Bilateral direct key, top-edge rim & low under-fill lights for symmetric 360° structural definition */}
      <directionalLight
        position={[18, 24, 24]}
        intensity={2.15}
        color="#fffaf2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
      />
      <directionalLight
        position={[-18, 22, -24]}
        intensity={1.95}
        color="#f8fafc"
      />
      <directionalLight
        position={[-4, 28, 4]}
        intensity={1.15}
        color="#ffffff"
      />
      <directionalLight
        position={[10, -12, 22]}
        intensity={0.62}
        color="#e2e8f0"
      />
      <directionalLight
        position={[-10, -12, -22]}
        intensity={0.58}
        color="#dbeafe"
      />

      {/* Bilateral Gunsmith Studio reflection dome (#384454 base + +Z/-Z camera-side grazing softboxes + bottom bounce) */}
      <Environment resolution={512}>
        <color attach="background" args={['#384454']} />
        {/* Overhead main softbox strip aligned along barrel X-axis */}
        <Lightformer
          intensity={3.1}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 15, 0]}
          scale={[48, 10, 1]}
          color="#ffffff"
        />
        {/* +Z right-flank bilateral camera-facing grazing softboxes */}
        <Lightformer
          intensity={2.6}
          position={[12, 8, 24]}
          target={[0, 0, 0]}
          scale={[28, 12, 1]}
          color="#fffcf5"
        />
        <Lightformer
          intensity={2.15}
          position={[-14, 5, 22]}
          target={[0, 0, 0]}
          scale={[26, 11, 1]}
          color="#f1f5f9"
        />
        {/* -Z left-flank bilateral camera-facing grazing softboxes */}
        <Lightformer
          intensity={2.6}
          position={[-12, 8, -24]}
          target={[0, 0, 0]}
          scale={[28, 12, 1]}
          color="#fffcf5"
        />
        <Lightformer
          intensity={2.15}
          position={[14, 5, -22]}
          target={[0, 0, 0]}
          scale={[26, 11, 1]}
          color="#f1f5f9"
        />
        {/* Axial muzzle & buttstock wrap-around rim softboxes */}
        <Lightformer
          intensity={1.75}
          position={[28, 4, 0]}
          target={[0, 0, 0]}
          scale={[24, 9, 1]}
          color="#f8fafc"
        />
        <Lightformer
          intensity={1.75}
          position={[-28, 4, 0]}
          target={[0, 0, 0]}
          scale={[24, 9, 1]}
          color="#e0f2fe"
        />
        {/* Wide bottom bounce cyclorama illuminating trigger guards, magwells & handguard undersides */}
        <Lightformer
          intensity={1.25}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -12, 0]}
          scale={[52, 28, 1]}
          color="#64748b"
        />
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
