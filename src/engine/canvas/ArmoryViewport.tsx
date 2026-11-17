import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { getLoadedWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type {
  CameraPresetType,
  WeaponCameraMap,
  WeaponScaleProfile,
} from '../../weapons/types';
import {
  ArmoryWorldFx,
  BallisticsSystem,
  WeaponRecoilGroup,
} from '../actors/BallisticsSystem';
import {
  CARTRIDGE_STAGE_DATUM_Y,
  CartridgeCutawayStage,
} from '../actors/CartridgeCutawayStage';
import { ExhibitionTurntable } from '../actors/ExhibitionTurntable';
import { MagazineAmmoStack } from '../actors/MagazineAmmoStack';
import { MalfunctionActor } from '../actors/MalfunctionActor';
import { PartActor } from '../actors/PartActor';
import { playBrassCasingBounceSound } from '../audio/mechanicalSoundEngine';
import { updateCalloutOverlay60fps } from '../callout/CalloutOverlay';
import { CARTRIDGE_LAB_SPECS } from '../cartridges/cartridgeSpecs';
import { playbackClock } from '../clock/playbackClock';
import { fieldStripStore } from '../fieldstrip/fieldStripStore';
import {
  getCachedPartGeometry,
  getPartLocalCenter,
  useWeaponGeometries,
} from '../geometry/geometryService';
import { InteractiveActionController } from '../interaction/InteractiveActionController';
import { computePartTransform, createMutablePose } from '../kinematics/math';
import { malfunctionStore } from '../malfunctions/malfunctionStore';
import {
  type ArmoryThermalVisualState,
  setArmoryThermalVisualState,
} from '../materials/armoryShader';
import {
  getArmoryPhysicsState,
  setBrassFloorImpactListener,
} from '../physics/armoryPhysics';
import { ArmoryPostProcessing } from './ArmoryPostProcessing';
import { CaliperActor } from './CaliperActor';
import { MonographCaptureRig } from '../../features/monograph/MonographCaptureRig';
import {
  ArmoryStudioEnvironment,
  GunsmithStageMat,
  getArmoryEnvironment,
} from './GunsmithStageMat';
import {
  computeTurntableFraming,
  isShowcaseUserDragging,
  registerTurntableDragHandler,
  subscribeShowcaseDragging,
  subscribeShowcaseWindowBounds,
} from './turntableStageMetrics';

const BASE_FIRING_RATE = 0.42;
const INITIAL_TURNTABLE_AZIMUTH = 0.24;

// Module-pooled scratch math primitives for zero heap churn on camera focus & 60Hz thermal sync
const _focusWorldCenter = new THREE.Vector3();
const _focusEuler = new THREE.Euler();
const _focusPartPos = new THREE.Vector3();
const _focusCurrentTarget = new THREE.Vector3();
const _focusViewDir = new THREE.Vector3();
const _focusFieldStripPose = createMutablePose();
const _thermalSync: ArmoryThermalVisualState = {
  weaponId: 'ak15',
  barrelHeat01: 0,
  carbonFouling01: 0,
};

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
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const hudHidden = useAppStore((s) => s.hudHidden);
  const activeCartridgeCaliber = useAppStore((s) => s.activeCartridgeCaliber);
  const cartridgeLineupOverview = useAppStore(
    (s) => s.cartridgeLineupOverview
  );
  const cartridgeCameraSeq = useAppStore((s) => s.cartridgeCameraSeq);

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

  // Frame 1:1 SAAMI Cartridge Cutaway Lab (full 7-caliber lineup vs single specimen closeup)
  useEffect(() => {
    if (screen !== 'cartridges' || size.width <= 0 || size.height <= 0) return;

    const perspCam = camera as THREE.PerspectiveCamera;
    perspCam.clearViewOffset();
    turntableRigRef.current.active = false;
    userOrbitedRef.current = false;

    const aspect = Math.max(0.45, size.width / Math.max(1, size.height));
    if (cartridgeLineupOverview) {
      const distZ = Math.max(29.5, 36.0 / aspect);
      flyRef.current.goalTarget.set(1.6, CARTRIDGE_STAGE_DATUM_Y + 5.8, 0);
      flyRef.current.goalPos.set(1.6, CARTRIDGE_STAGE_DATUM_Y + 7.2, distZ);
    } else {
      const spec = CARTRIDGE_LAB_SPECS[activeCartridgeCaliber];
      const oalCm = spec.oalMm / 10;
      const midY = CARTRIDGE_STAGE_DATUM_Y + oalCm * 0.52;
      const closeupZ =
        Math.max(8.2, oalCm * 1.72) * Math.max(1, 0.92 / aspect);
      flyRef.current.goalTarget.set(spec.lineupXCm, midY, 0);
      flyRef.current.goalPos.set(
        spec.lineupXCm + 1.05,
        midY + oalCm * 0.14,
        closeupZ
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
  }, [
    screen,
    activeCartridgeCaliber,
    cartridgeLineupOverview,
    cartridgeCameraSeq,
    size.width,
    size.height,
    camera,
  ]);

  // Respond to explicit camera preset buttons, weapon switches, screen transitions & viewport/window rect changes
  useEffect(() => {
    if (screen === 'cartridges') return;
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
        size.height,
        useAppStore.getState().hudHidden
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

  // Smoothly re-center or restore turntable view-offset when Clean View (`hudHidden`) toggles on Showcase / Armory
  useEffect(() => {
    if (
      screen === 'workbench' ||
      screen === 'cartridges' ||
      cameraCommand.preset !== 'armory_showcase' ||
      size.width <= 0 ||
      size.height <= 0
    ) {
      return;
    }
    const manifest = getWeaponManifest(activeWeaponId);
    const t = playbackClock.getState().targetProgress;
    const tf = computeTurntableFraming(
      activeWeaponId,
      manifest.workbenchMeta.scaleProfile,
      t,
      screen,
      size.width,
      size.height,
      hudHidden
    );
    const perspCam = camera as THREE.PerspectiveCamera;
    perspCam.setViewOffset(
      size.width,
      size.height,
      tf.viewOffsetX,
      tf.viewOffsetY,
      size.width,
      size.height
    );
    turntableRigRef.current.goalTarget.set(tf.targetX, tf.targetY, tf.targetZ);
    turntableRigRef.current.goalHorizRadius = tf.horizRadius;
    turntableRigRef.current.goalOffsetY = tf.offsetY;
    turntableRigRef.current.active = true;
  }, [
    hudHidden,
    screen,
    activeWeaponId,
    cameraCommand.preset,
    size.width,
    size.height,
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

    const localCenter = getPartLocalCenter(state.activeWeaponId, spec.id);

    if (state.fieldStripActive && state.mode === 'explode') {
      fieldStripStore.evaluatePartPoseInto(
        state.activeWeaponId,
        spec,
        _focusFieldStripPose
      );
      _focusEuler.set(
        _focusFieldStripPose.rx,
        _focusFieldStripPose.ry,
        _focusFieldStripPose.rz
      );
      _focusPartPos.set(
        _focusFieldStripPose.px,
        _focusFieldStripPose.py,
        _focusFieldStripPose.pz
      );
    } else {
      const { position, rotation } = computePartTransform(
        spec,
        clock.targetProgress
      );
      _focusEuler.set(rotation[0], rotation[1], rotation[2]);
      _focusPartPos.set(position[0], position[1], position[2]);
    }
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

    // 2b. Step 60fps per-part Field-Strip DAG & Malfunction Clearing trajectories (Zero-GC)
    if (state.fieldStripActive && state.mode === 'explode') {
      fieldStripStore.stepAnimations(dt);
    }
    if (state.malfunctionActive && state.screen === 'workbench') {
      malfunctionStore.stepAnimations(dt);
    }

    if (
      state.screen !== 'workbench' &&
      state.screen !== 'cartridges' &&
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
        size.height,
        state.hudHidden
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
      if (
        state.isFiringPlaying &&
        !state.malfunctionActive &&
        nextAnimatedT < 0.02
      ) {
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

      if (!state.malfunctionActive) {
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
      }
    } else {
      playbackClock.setAnimatedFireProgress(0);
    }

    // 4. Initial snap + smooth cylindrical turntable framing (Showcase/Armory) or Cartesian fly-to (Workbench / Cartridge Lab)
    const onTurntable =
      state.screen === 'showcase' || state.screen === 'armory';
    if (!hasSnappedInitialRef.current && controlsRef.current) {
      if (onTurntable) {
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
      onTurntable
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

    // 5. Pipe 60Hz barrel thermal glow & carbon fouling into AAA Armory surface shader (Zero-GC)
    const phys = getArmoryPhysicsState();
    _thermalSync.weaponId = state.activeWeaponId;
    _thermalSync.barrelHeat01 = phys.barrelHeat01;
    _thermalSync.carbonFouling01 = phys.carbonFouling01;
    setArmoryThermalVisualState(_thermalSync);

    // 6. Project 3D anchors -> 2D vertical hairline leader callouts at 60fps
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
  const isTurntableScreen = screen === 'showcase' || screen === 'armory';

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.07}
        enableZoom={screen !== 'showcase' || hudHidden}
        enablePan={!isTurntableScreen}
        minPolarAngle={isTurntableScreen ? Math.PI * 0.3 : 0}
        maxPolarAngle={isTurntableScreen ? Math.PI * 0.58 : Math.PI}
        autoRotate={isTurntableScreen && armoryAutoRotate && !showcaseDragging}
        autoRotateSpeed={1.65}
        minDistance={3}
        maxDistance={280}
        onStart={() => {
          flyRef.current.active = false;
          turntableRigRef.current.active = false;
          userOrbitedRef.current = true;
        }}
      />

      {screen === 'cartridges' ? (
        <CartridgeCutawayStage />
      ) : (
        <>
          <ExhibitionTurntable
            weaponId={activeWeaponId}
            environmentPreset={environmentPreset}
          />

          {plugin && (
            <>
              <WeaponRecoilGroup>
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
                <MagazineAmmoStack />
                <BallisticsSystem worldFx={false} />
                <MalfunctionActor />
              </WeaponRecoilGroup>
              <CaliperActor />
              <ArmoryWorldFx />
            </>
          )}
        </>
      )}
    </>
  );
};

export const ArmoryViewport: React.FC = () => {
  const selectPart = useAppStore((s) => s.selectPart);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const postFxEnabled = useAppStore((s) => s.postFxEnabled);

  const envCfg = getArmoryEnvironment(environmentPreset);
  const workbenchMeta = getWeaponManifest(activeWeaponId).workbenchMeta;

  useEffect(() => {
    setBrassFloorImpactListener((caliber, speed) => {
      if (!useAppStore.getState().sfxMuted) {
        playBrassCasingBounceSound(caliber, speed);
      }
    });
    return () => {
      setBrassFloorImpactListener(null);
    };
  }, []);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{
        localClippingEnabled: true,
        stencil: true,
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.AgXToneMapping,
        toneMappingExposure: envCfg.toneMappingExposure,
      }}
      camera={{ position: [14.5, 2.2, 54.0], fov: 41, near: 0.1, far: 560 }}
      onPointerMissed={() => {
        if (useAppStore.getState().screen === 'workbench') {
          selectPart(null);
        }
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <ArmoryStudioEnvironment preset={environmentPreset} />

      <GunsmithStageMat
        preset={environmentPreset}
        centerX={workbenchMeta.chamberGlowPos[0]}
      />

      <DisassemblyRig />

      <InteractiveActionController />

      <ArmoryPostProcessing
        enabled={postFxEnabled}
        environmentPreset={environmentPreset}
      />

      <MonographCaptureRig />
    </Canvas>
  );
};
