import React, { useEffect, useRef, useState } from 'react';
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
import { getLoadedWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type {
  CameraPresetType,
  WeaponCameraMap,
  WeaponScaleProfile,
} from '../../weapons/types';
import { BallisticsSystem } from '../actors/BallisticsSystem';
import { ExhibitionTurntable } from '../actors/ExhibitionTurntable';
import { PartActor } from '../actors/PartActor';
import { updateCalloutOverlay60fps } from '../callout/CalloutOverlay';
import { playbackClock } from '../clock/playbackClock';
import {
  getCachedPartGeometry,
  getPartLocalCenter,
  useWeaponGeometries,
} from '../geometry/geometryService';
import { computePartTransform } from '../kinematics/math';
import {
  computeTurntableFraming,
  evaluateWeaponTurntableEnvelopeInto,
  isShowcaseUserDragging,
  registerTurntableDragHandler,
  subscribeShowcaseDragging,
  subscribeShowcaseWindowBounds,
} from './turntableStageMetrics';

const BASE_FIRING_RATE = 0.42;
const INITIAL_TURNTABLE_AZIMUTH = 0.24;

// Module-pooled scratch math primitives for zero heap churn on camera focus
const _focusWorldCenter = new THREE.Vector3();
const _focusEuler = new THREE.Euler();
const _focusPartPos = new THREE.Vector3();
const _focusCurrentTarget = new THREE.Vector3();
const _focusViewDir = new THREE.Vector3();

function applyWorkbenchFraming(
  cfg: WeaponCameraMap[CameraPresetType],
  scaleProfile: WeaponScaleProfile,
  preset: CameraPresetType,
  t: number,
  aspect: number,
  goalTarget: THREE.Vector3,
  goalPos: THREE.Vector3
): void {
  const isFixedClosePreset =
    preset === 'cutaway_focus' || preset === 'firing_view';
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

  goalTarget.set(
    cfg.target[0] + finalXShift,
    cfg.target[1] + finalYShift,
    cfg.target[2]
  );
  goalPos.set(
    cfg.pos[0] * scale + finalXShift,
    cfg.pos[1] * scale + finalYShift,
    cfg.pos[2] * scale
  );
}

const StageFloorGrid: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const screen = useAppStore((s) => s.screen);
  const workbenchGridY = getWeaponManifest(activeWeaponId).workbenchMeta.gridY;

  useFrame(() => {
    if (!groupRef.current) return;
    const st = useAppStore.getState();
    if (st.screen === 'workbench') {
      groupRef.current.position.y = getWeaponManifest(
        st.activeWeaponId
      ).workbenchMeta.gridY;
    } else {
      const env = evaluateWeaponTurntableEnvelopeInto(
        st.activeWeaponId,
        playbackClock.getState().animatedProgress
      );
      groupRef.current.position.y = env.gridFloorY;
    }
  });

  const initialY =
    screen === 'workbench'
      ? workbenchGridY
      : evaluateWeaponTurntableEnvelopeInto(activeWeaponId, 0).gridFloorY;

  return (
    <group ref={groupRef} position={[0, initialY, 0]}>
      <Grid
        position={[0, 0, 0]}
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
    </group>
  );
};

const DisassemblyRig: React.FC = () => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();

  const [showcaseDragging, setShowcaseDragging] = useState<boolean>(
    isShowcaseUserDragging
  );
  const [showcaseWindowVer, setShowcaseWindowVer] = useState<number>(0);

  const hasSnappedInitialRef = useRef<boolean>(false);
  const userOrbitedRef = useRef<boolean>(false);
  const lastFramedTRef = useRef<number>(0);

  // Cartesian fly-to state for Workbench presets & part inspection focus
  const flyRef = useRef<{
    active: boolean;
    goalPos: THREE.Vector3;
    goalTarget: THREE.Vector3;
  }>({
    active: false,
    goalPos: new THREE.Vector3(14.5, 2.2, 54.0),
    goalTarget: new THREE.Vector3(3.2, -5.2, 0),
  });

  // Cylindrical turntable state for Showcase & Armory (preserves live azimuth angle so 360° rotation never freezes)
  const turntableRigRef = useRef<{
    active: boolean;
    goalTarget: THREE.Vector3;
    goalHorizRadius: number;
    goalOffsetY: number;
  }>({
    active: false,
    goalTarget: new THREE.Vector3(3.65, -4.5, 0),
    goalHorizRadius: 64.0,
    goalOffsetY: 9.6,
  });

  const screen = useAppStore((s) => s.screen);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const armoryAutoRotate = useAppStore((s) => s.armoryAutoRotate);
  const selectedPartId = useAppStore((s) => s.selectedPartId);
  const cameraCommand = useAppStore((s) => s.cameraCommand);

  const plugin = useWeaponPlugin(activeWeaponId);
  // Triggers background Web Worker CSG build & re-renders as part batches stream in
  useWeaponGeometries(activeWeaponId, plugin?.parts ?? null);

  useEffect(() => subscribeShowcaseDragging(setShowcaseDragging), []);

  useEffect(
    () =>
      subscribeShowcaseWindowBounds(() => {
        setShowcaseWindowVer((v) => v + 1);
      }),
    []
  );

  // Connect manual pointer drag from ShowcaseView's unobstructed live stage window directly to OrbitControls
  useEffect(() => {
    return registerTurntableDragHandler((dxPx, dyPx) => {
      const ctrl = controlsRef.current;
      if (!ctrl) return;
      turntableRigRef.current.active = false;
      ctrl.setAzimuthalAngle(ctrl.getAzimuthalAngle() - dxPx * 0.0052);
      const nextPolar = THREE.MathUtils.clamp(
        ctrl.getPolarAngle() - dyPx * 0.0032,
        Math.PI * 0.34,
        Math.PI * 0.56
      );
      ctrl.setPolarAngle(nextPolar);
    });
  }, []);

  // Respond to explicit camera preset buttons, weapon switches, screen transitions & viewport/window rect changes
  useEffect(() => {
    const manifest = getWeaponManifest(activeWeaponId);
    const presets = manifest.cameraPresets;
    const meta = manifest.workbenchMeta;
    const scaleProfile = meta.scaleProfile;
    const cfg = presets[cameraCommand.preset];
    if (!cfg || size.width <= 0 || size.height <= 0) return;

    userOrbitedRef.current = false;
    const t = playbackClock.getState().targetProgress;
    lastFramedTRef.current = t;
    const aspect = Math.max(0.42, size.width / Math.max(1, size.height));
    const perspCam = camera as THREE.PerspectiveCamera;

    if (cameraCommand.preset === 'armory_showcase' && screen !== 'workbench') {
      const tf = computeTurntableFraming(
        activeWeaponId,
        scaleProfile,
        t,
        screen,
        size.width,
        size.height
      );
      perspCam.setViewOffset(
        size.width,
        size.height,
        tf.viewOffsetX,
        tf.viewOffsetY,
        size.width,
        size.height
      );

      turntableRigRef.current.goalTarget.set(
        tf.targetX,
        tf.targetY,
        tf.targetZ
      );
      turntableRigRef.current.goalHorizRadius = tf.horizRadius;
      turntableRigRef.current.goalOffsetY = tf.offsetY;
      flyRef.current.active = false;

      if (!hasSnappedInitialRef.current && controlsRef.current) {
        controlsRef.current.target.copy(turntableRigRef.current.goalTarget);
        camera.position.set(
          tf.targetX + Math.sin(INITIAL_TURNTABLE_AZIMUTH) * tf.horizRadius,
          tf.targetY + tf.offsetY,
          tf.targetZ + Math.cos(INITIAL_TURNTABLE_AZIMUTH) * tf.horizRadius
        );
        controlsRef.current.update();
        turntableRigRef.current.active = false;
        hasSnappedInitialRef.current = true;
      } else {
        turntableRigRef.current.active = true;
      }
    } else {
      perspCam.clearViewOffset();
      turntableRigRef.current.active = false;

      applyWorkbenchFraming(
        cfg,
        scaleProfile,
        cameraCommand.preset,
        t,
        aspect,
        flyRef.current.goalTarget,
        flyRef.current.goalPos
      );

      if (!hasSnappedInitialRef.current && controlsRef.current) {
        camera.position.copy(flyRef.current.goalPos);
        controlsRef.current.target.copy(flyRef.current.goalTarget);
        controlsRef.current.update();
        flyRef.current.active = false;
        hasSnappedInitialRef.current = true;
      } else {
        flyRef.current.active = true;
      }
    }
  }, [
    cameraCommand,
    activeWeaponId,
    screen,
    size.width,
    size.height,
    showcaseWindowVer,
    camera,
  ]);

  // Smoothly focus camera when user selects a part in Workbench
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
    if (state.sectionCut && _focusViewDir.z < 0.45) {
      _focusViewDir.set(0.22, 0.16, 0.96);
    }
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

    turntableRigRef.current.active = false;
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

    // 2. Smoothly damp disassembly scalar t & keep camera framed with explosion
    const nextAnimatedT = THREE.MathUtils.damp(
      clock.animatedProgress,
      playbackClock.getState().targetProgress,
      7.0,
      dt
    );
    playbackClock.setAnimatedProgress(nextAnimatedT);

    if (
      state.screen !== 'workbench' &&
      state.cameraCommand.preset === 'armory_showcase' &&
      Math.abs(nextAnimatedT - lastFramedTRef.current) > 0.002 &&
      size.width > 0 &&
      size.height > 0
    ) {
      const manifest = getWeaponManifest(state.activeWeaponId);
      const tf = computeTurntableFraming(
        state.activeWeaponId,
        manifest.workbenchMeta.scaleProfile,
        nextAnimatedT,
        state.screen,
        size.width,
        size.height
      );
      turntableRigRef.current.goalTarget.set(
        tf.targetX,
        tf.targetY,
        tf.targetZ
      );
      turntableRigRef.current.goalHorizRadius = tf.horizRadius;
      turntableRigRef.current.goalOffsetY = tf.offsetY;
      lastFramedTRef.current = nextAnimatedT;
      turntableRigRef.current.active = true;
    } else if (
      state.screen === 'workbench' &&
      state.mode === 'explode' &&
      !state.selectedPartId &&
      !userOrbitedRef.current &&
      state.cameraCommand.preset !== 'armory_showcase' &&
      state.cameraCommand.preset !== 'cutaway_focus' &&
      state.cameraCommand.preset !== 'firing_view' &&
      Math.abs(nextAnimatedT - lastFramedTRef.current) > 0.002
    ) {
      const manifest = getWeaponManifest(state.activeWeaponId);
      const cfg = manifest.cameraPresets[state.cameraCommand.preset];
      if (cfg && size.width > 0 && size.height > 0) {
        const aspect = Math.max(0.42, size.width / Math.max(1, size.height));
        applyWorkbenchFraming(
          cfg,
          manifest.workbenchMeta.scaleProfile,
          state.cameraCommand.preset,
          nextAnimatedT,
          aspect,
          flyRef.current.goalTarget,
          flyRef.current.goalPos
        );
        lastFramedTRef.current = nextAnimatedT;
        flyRef.current.active = true;
      }
    }

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

    // 4. Initial snap + smooth cylindrical turntable framing (Showcase/Armory) or Cartesian fly-to (Workbench)
    if (!hasSnappedInitialRef.current && controlsRef.current) {
      if (state.screen !== 'workbench') {
        const gt = turntableRigRef.current.goalTarget;
        const gr = turntableRigRef.current.goalHorizRadius;
        const gy = turntableRigRef.current.goalOffsetY;
        controlsRef.current.target.copy(gt);
        camera.position.set(
          gt.x + Math.sin(INITIAL_TURNTABLE_AZIMUTH) * gr,
          gt.y + gy,
          gt.z + Math.cos(INITIAL_TURNTABLE_AZIMUTH) * gr
        );
        controlsRef.current.update();
        turntableRigRef.current.active = false;
      } else {
        camera.position.copy(flyRef.current.goalPos);
        controlsRef.current.target.copy(flyRef.current.goalTarget);
        controlsRef.current.update();
        flyRef.current.active = false;
      }
      hasSnappedInitialRef.current = true;
    } else if (
      turntableRigRef.current.active &&
      controlsRef.current &&
      state.screen !== 'workbench'
    ) {
      const ctrl = controlsRef.current;
      const gt = turntableRigRef.current.goalTarget;
      const gr = turntableRigRef.current.goalHorizRadius;
      const gy = turntableRigRef.current.goalOffsetY;

      const dx = camera.position.x - ctrl.target.x;
      const dz = camera.position.z - ctrl.target.z;
      const curRadius = Math.max(0.1, Math.hypot(dx, dz));
      const theta =
        curRadius > 0.2 ? Math.atan2(dx, dz) : INITIAL_TURNTABLE_AZIMUTH;
      const curOffsetY = camera.position.y - ctrl.target.y;

      const k = 1 - Math.exp(-7.5 * dt);
      ctrl.target.lerp(gt, k);
      const nextRadius = THREE.MathUtils.lerp(curRadius, gr, k);
      const nextOffsetY = THREE.MathUtils.lerp(curOffsetY, gy, k);

      camera.position.set(
        ctrl.target.x + Math.sin(theta) * nextRadius,
        ctrl.target.y + nextOffsetY,
        ctrl.target.z + Math.cos(theta) * nextRadius
      );
      camera.lookAt(ctrl.target);

      if (
        ctrl.target.distanceTo(gt) < 0.04 &&
        Math.abs(nextRadius - gr) < 0.06 &&
        Math.abs(nextOffsetY - gy) < 0.04
      ) {
        turntableRigRef.current.active = false;
      }
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
  const isTurntableScreen = screen !== 'workbench';

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.07}
        enableZoom={screen !== 'showcase'}
        enablePan={!isTurntableScreen}
        minPolarAngle={isTurntableScreen ? Math.PI * 0.3 : 0}
        maxPolarAngle={isTurntableScreen ? Math.PI * 0.58 : Math.PI}
        autoRotate={isTurntableScreen && armoryAutoRotate && !showcaseDragging}
        autoRotateSpeed={1.65}
        minDistance={4}
        maxDistance={280}
        onStart={() => {
          flyRef.current.active = false;
          turntableRigRef.current.active = false;
          userOrbitedRef.current = true;
        }}
      />

      <ExhibitionTurntable weaponId={activeWeaponId} />

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
        shadow-camera-left={-38}
        shadow-camera-right={38}
        shadow-camera-top={24}
        shadow-camera-bottom={-28}
        shadow-camera-near={1}
        shadow-camera-far={110}
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

      <StageFloorGrid />

      <DisassemblyRig />
    </Canvas>
  );
};
