import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { type AppScreen, useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { getLoadedWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type {
  CameraPresetType,
  WeaponCameraMap,
  WeaponId,
  WeaponScaleProfile,
} from '../../weapons/types';
import {
  ArmoryWorldFx,
  BallisticsSystem,
  WeaponRecoilGroup,
} from '../actors/BallisticsSystem';
import { AttachmentActor } from '../actors/AttachmentActor';
import {
  CARTRIDGE_STAGE_DATUM_Y,
  CartridgeCutawayStage,
} from '../actors/CartridgeCutawayStage';
import { ExhibitionTurntable } from '../actors/ExhibitionTurntable';
import { MagazineAmmoStack } from '../actors/MagazineAmmoStack';
import { MalfunctionActor } from '../actors/MalfunctionActor';
import { PartActor } from '../actors/PartActor';
import { RiflingBoreActor } from '../actors/RiflingBoreActor';
import type { SectionCutAxis } from '../actors/StencilSectionCap';
import { playBrassCasingBounceSound } from '../audio/mechanicalSoundEngine';
import { updateCalloutOverlay60fps } from '../callout/CalloutOverlay';
import {
  CARTRIDGE_LAB_SPECS,
  isTankOrdnanceProfile,
} from '../cartridges/cartridgeSpecs';
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
import { initKtx2Support } from '../materials/ktx2Support';
import {
  getArmoryPhysicsState,
  isTankWeapon,
  setBrassFloorImpactListener,
} from '../physics/armoryPhysics';
import {
  getCachedCausalityEvaluation,
  useCausalitySandboxStore,
} from '../physics/causalitySandbox';
import {
  computeTankGunnerCameraPose,
  getTankCrewSpec,
  useTankCrewStore,
} from '../tank/tankCrewStore';
import { ArmoryPostProcessing } from './ArmoryPostProcessing';
import { CaliperActor } from './CaliperActor';
import { MonographCaptureRig } from '../../features/monograph/MonographCaptureRig';
import { SplitShowdownViewport } from '../../features/showdown3d/SplitShowdownViewport';
import { SectionBoxGuide } from '../actors/SectionBoxGuide';
import {
  ArmoryStudioEnvironment,
  GunsmithStageMat,
  getArmoryEnvironment,
} from './GunsmithStageMat';
import { getGraphicsQualityProfile } from './graphicsQuality';
import { invalidateStudioHdriCache } from './studioHdriManager';
import {
  computeTurntableFraming,
  isShowcaseUserDragging,
  registerTurntableDragHandler,
  subscribeShowcaseDragging,
  subscribeShowcaseWindowBounds,
} from './turntableStageMetrics';

const BASE_FIRING_RATE = 0.42;
const INITIAL_TURNTABLE_AZIMUTH = 0.24;
export const ARMORY_AUTO_ROTATE_SPEED = 1.65;
export const WORKBENCH_AUTO_ORBIT_SPEED = 0.65;

export interface EffectiveOrbitAutoRotateParams {
  screen: AppScreen;
  armoryAutoRotate: boolean;
  workbenchAutoOrbit: boolean;
  showcaseDragging: boolean;
  fieldStripActive: boolean;
  caliperActive: boolean;
}

/**
 * Pure camera orbit resolver separating Showcase/Armory turntable spin (`1.65`)
 * from slow cinematic Workbench museum orbit (`0.65`, automatically inhibited
 * while hands-on Field-Strip or 3D Caliper precision picking is active).
 */
export function computeEffectiveOrbitAutoRotate({
  screen,
  armoryAutoRotate,
  workbenchAutoOrbit,
  showcaseDragging,
  fieldStripActive,
  caliperActive,
}: EffectiveOrbitAutoRotateParams): {
  autoRotate: boolean;
  autoRotateSpeed: number;
} {
  if (screen === 'showcase' || screen === 'armory') {
    return {
      autoRotate: armoryAutoRotate && !showcaseDragging,
      autoRotateSpeed: ARMORY_AUTO_ROTATE_SPEED,
    };
  }
  if (screen === 'workbench') {
    return {
      autoRotate: workbenchAutoOrbit && !fieldStripActive && !caliperActive,
      autoRotateSpeed: WORKBENCH_AUTO_ORBIT_SPEED,
    };
  }
  return {
    autoRotate: false,
    autoRotateSpeed: ARMORY_AUTO_ROTATE_SPEED,
  };
}

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

export const TALL_GRIP_PISTOL_IDS: ReadonlySet<WeaponId> = new Set<WeaponId>([
  'p08',
  'deagle',
  'm1911',
  'g17',
  'p320',
  'python',
]);
export const TALL_GRIP_CT_EXTRA_CLEARANCE_CM = 1.4;
export const TALL_GRIP_FIRING_CT_EXTRA_CLEARANCE_CM = 1.0;
export const PORTRAIT_PHONE_ASPECT_MAX = 0.65;
export const PORTRAIT_PHONE_DISTANCE_MULT = 1.12;
export const WORKBENCH_ENTRY_EASE_DURATION_S = 0.55;

/**
 * Widens default Workbench camera distance by +12% on narrow portrait phones
 * (`aspect < 0.65`, e.g. 390×844) so long rifles like AK-15M1 never graze screen edges.
 */
export function computePortraitPhoneDistanceMultiplier(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 1.0;
  return aspect < PORTRAIT_PHONE_ASPECT_MAX ? PORTRAIT_PHONE_DISTANCE_MULT : 1.0;
}

/**
 * Deterministic cubic ease-out (`1 - (1 - u)^3`) for smooth ~0.55s
 * Armory / Showcase -> Workbench camera and perspective view-offset easing.
 */
export function evaluateCameraEaseProgress(
  elapsedS: number,
  durationS = WORKBENCH_ENTRY_EASE_DURATION_S
): number {
  if (durationS <= 0) return 1;
  const u = Math.min(1, Math.max(0, elapsedS / durationS));
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}

/**
 * Computes a scale-aware negative camera/target Y shift when Workbench live CT
 * `.live-section-bar` is visible above `TimelineDock`, lifting the exhibit (~11%
 * of visible frame height, plus `+1.4 cm` extra clearance for tall-grip pistols
 * and an additional `+1.0 cm` when `mode === 'firing' && sectionCut`)
 * so P08/M1911/G17/Deagle/P320/Python grips retain >= 24px air above the CT bar.
 */
export function computeWorkbenchSectionBarOffsetY(
  scaleProfile: WeaponScaleProfile,
  preset: CameraPresetType,
  sectionCutActive: boolean,
  weaponId?: WeaponId | string | null,
  isFiringMode = false
): number {
  if (!sectionCutActive || preset === 'top' || preset === 'armory_showcase') {
    return 0;
  }
  const isClose = preset === 'cutaway_focus' || preset === 'firing_view';
  if (scaleProfile === 'main_battle_tank') {
    return isClose ? -18 : -28;
  }
  if (scaleProfile === 'heavy_sniper') {
    return isClose ? -1.8 : -3.4;
  }
  if (scaleProfile === 'compound_bow' || scaleProfile === 'rifle') {
    return isClose ? -1.7 : -2.8;
  }
  // Pistols, revolvers, SMGs & compact platforms (p08, m1911, g17, deagle, p320, python)
  const baseLift = isClose ? -1.65 : -2.35;
  const isTallGrip = Boolean(
    weaponId && TALL_GRIP_PISTOL_IDS.has(weaponId as WeaponId)
  );
  const tallGripExtra = isTallGrip ? -TALL_GRIP_CT_EXTRA_CLEARANCE_CM : 0;
  const firingTallGripExtra =
    isTallGrip && isFiringMode ? -TALL_GRIP_FIRING_CT_EXTRA_CLEARANCE_CM : 0;
  return baseLift + tallGripExtra + firingTallGripExtra;
}

export interface CutawayCameraPose {
  pos: readonly [number, number, number];
  target: readonly [number, number, number];
}

export interface RefinedCutawayCameraPose {
  pos: [number, number, number];
  target: [number, number, number];
  mirroredZ: boolean;
}

/**
 * Refines a cutaway focus camera pose for Z-axis longitudinal CT inspection:
 * - When `!sectionCut` or `sectionCutAxis !== 'z'`, preserves `baseCam` verbatim.
 * - When `sectionCut && sectionCutAxis === 'z'`:
 *   - Clamps lateral Z standoff cleanly per weapon scale (small arms, `gau8`, 1:1 MBTs)
 *     and bounds grazing X obliquity so the rifled bore & breech remain squarely visible.
 *   - When `sectionCutFlip === true` (`-Z` flank exposed), mirrors the camera across the
 *     midplane onto the open `-Z` side instead of staring at the uncut `+Z` back wall.
 */
export function computeCutawayFocusRefinement(
  baseCam: CutawayCameraPose,
  weaponId: WeaponId,
  sectionCut: boolean,
  sectionCutAxis: SectionCutAxis,
  sectionCutFlip: boolean
): RefinedCutawayCameraPose {
  if (!sectionCut || sectionCutAxis !== 'z') {
    return {
      pos: [baseCam.pos[0], baseCam.pos[1], baseCam.pos[2]],
      target: [baseCam.target[0], baseCam.target[1], baseCam.target[2]],
      mirroredZ: false,
    };
  }

  const scaleProfile = getWeaponManifest(weaponId).workbenchMeta.scaleProfile;
  const isGau8 = weaponId === 'gau8';
  const isMbt = scaleProfile === 'main_battle_tank' && !isGau8;

  const minZ = isMbt ? 340 : isGau8 ? 180 : 9.5;
  const maxZ = isMbt ? 900 : isGau8 ? 520 : 85;

  const targetX = baseCam.target[0];
  const targetY = baseCam.target[1];
  const targetZ = sectionCutFlip ? -baseCam.target[2] : baseCam.target[2];

  const rawDz = baseCam.pos[2] - baseCam.target[2];
  const clampedAbsDz = THREE.MathUtils.clamp(Math.abs(rawDz), minZ, maxZ);
  const signedDz = sectionCutFlip ? -clampedAbsDz : clampedAbsDz;

  const maxObliqueDx = clampedAbsDz * 0.78;
  const clampedDx = THREE.MathUtils.clamp(
    baseCam.pos[0] - baseCam.target[0],
    -maxObliqueDx,
    maxObliqueDx
  );

  return {
    pos: [targetX + clampedDx, baseCam.pos[1], targetZ + signedDz],
    target: [targetX, targetY, targetZ],
    mirroredZ: sectionCutFlip,
  };
}

function applyWorkbenchFraming(
  cfg: WeaponCameraMap[CameraPresetType],
  scaleProfile: WeaponScaleProfile,
  preset: CameraPresetType,
  t: number,
  aspect: number,
  goalTarget: THREE.Vector3,
  goalPos: THREE.Vector3,
  sectionCutActive = false,
  weaponId?: WeaponId,
  isFiringMode = false,
  mirrorZ = false
): void {
  const isFixedClosePreset =
    preset === 'cutaway_focus' || preset === 'firing_view';
  const tCam = Math.pow(Math.max(0, t), 0.52);

  let vertScale: number;
  let horizScale: number;
  let xShift: number;
  let yShift: number;

  if (scaleProfile === 'main_battle_tank') {
    vertScale = 1.06 + tCam * 0.56;
    horizScale = (0.86 + tCam * 0.52) / aspect;
    xShift = 18 * tCam;
    yShift = -12 - (24 + (aspect < 0.85 ? 24 : 0)) * tCam;
  } else if (scaleProfile === 'heavy_sniper') {
    vertScale = 1.18 + tCam * 0.68;
    horizScale = (0.92 + tCam * 0.64) / aspect;
    xShift = 2.2 * tCam;
    yShift = -1.6 - (3.1 + (aspect < 0.85 ? 2.6 : 0)) * tCam;
  } else if (scaleProfile === 'compound_bow') {
    vertScale = 1.24 + tCam * 0.72;
    horizScale = (0.94 + tCam * 0.66) / aspect;
    xShift = 0.8 * tCam;
    yShift = -1.5 - (2.8 + (aspect < 0.85 ? 2.8 : 0)) * tCam;
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

  const baseScale = isFixedClosePreset
    ? Math.max(1, 1.08 / aspect)
    : Math.max(vertScale, horizScale);
  const scale = baseScale * computePortraitPhoneDistanceMultiplier(aspect);

  const sectionBarOffsetY = computeWorkbenchSectionBarOffsetY(
    scaleProfile,
    preset,
    sectionCutActive,
    weaponId,
    isFiringMode
  );
  const finalXShift = isFixedClosePreset ? 0 : xShift;
  const finalYShift =
    (isFixedClosePreset ? 0 : yShift) + sectionBarOffsetY;
  const zSign = mirrorZ ? -1 : 1;

  goalTarget.set(
    cfg.target[0] + finalXShift,
    cfg.target[1] + finalYShift,
    cfg.target[2] * zSign
  );
  goalPos.set(
    cfg.pos[0] * scale + finalXShift,
    cfg.pos[1] * scale + finalYShift,
    cfg.pos[2] * scale * zSign
  );
}

const DisassemblyRig: React.FC = () => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, size, get: getThree } = useThree();

  const [showcaseDragging, setShowcaseDragging] = useState<boolean>(
    isShowcaseUserDragging
  );
  const [showcaseWindowVer, setShowcaseWindowVer] = useState<number>(0);

  const hasSnappedInitialRef = useRef<boolean>(false);
  const userOrbitedRef = useRef<boolean>(false);
  const lastFramedTRef = useRef<number>(0);
  const prevScreenRef = useRef<AppScreen>(useAppStore.getState().screen);

  // Zero-GC perspective view-offset easing (smoothly dissolves Armory plaque offset on Workbench entry)
  const viewOffsetRef = useRef<{
    active: boolean;
    curX: number;
    curY: number;
    startX: number;
    startY: number;
    goalX: number;
    goalY: number;
    elapsed: number;
    duration: number;
  }>({
    active: false,
    curX: 0,
    curY: 0,
    startX: 0,
    startY: 0,
    goalX: 0,
    goalY: 0,
    elapsed: 0,
    duration: WORKBENCH_ENTRY_EASE_DURATION_S,
  });

  // Cartesian fly-to state for Workbench presets, smooth 0.55s Armory->Workbench hero ease & part focus
  const flyRef = useRef<{
    active: boolean;
    timed: boolean;
    elapsed: number;
    duration: number;
    startPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    goalPos: THREE.Vector3;
    goalTarget: THREE.Vector3;
  }>({
    active: false,
    timed: false,
    elapsed: 0,
    duration: WORKBENCH_ENTRY_EASE_DURATION_S,
    startPos: new THREE.Vector3(14.5, 2.2, 54.0),
    startTarget: new THREE.Vector3(3.2, -5.2, 0),
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
  const mode = useAppStore((s) => s.mode);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const armoryAutoRotate = useAppStore((s) => s.armoryAutoRotate);
  const workbenchAutoOrbit = useAppStore((s) => s.workbenchAutoOrbit);
  const fieldStripActive = useAppStore((s) => s.fieldStripActive);
  const caliperActive = useAppStore((s) => s.caliperActive);
  const selectedPartId = useAppStore((s) => s.selectedPartId);
  const cameraCommand = useAppStore((s) => s.cameraCommand);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const sectionCutAxis = useAppStore((s) => s.sectionCutAxis);
  const sectionCutFlip = useAppStore((s) => s.sectionCutFlip);
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

  const isTankScale =
    screen !== 'cartridges' &&
    getWeaponManifest(activeWeaponId).workbenchMeta.scaleProfile ===
      'main_battle_tank';
  const isTankOrdnanceGallery =
    screen === 'cartridges' && isTankOrdnanceProfile(activeCartridgeCaliber);

  // Dynamically adapt perspective clip planes for 1:1 10-meter Main Battle Tanks & 1m tank cannon rounds
  useEffect(() => {
    const perspCam = getThree().camera as THREE.PerspectiveCamera;
    const nextNear = isTankScale ? 2.0 : isTankOrdnanceGallery ? 0.5 : 0.1;
    const nextFar = isTankScale ? 9000 : isTankOrdnanceGallery ? 3600 : 1200;
    if (perspCam.near !== nextNear || perspCam.far !== nextFar) {
      perspCam.near = nextNear;
      perspCam.far = nextFar;
      perspCam.updateProjectionMatrix();
    }
  }, [getThree, isTankScale, isTankOrdnanceGallery]);

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
    viewOffsetRef.current.active = false;
    viewOffsetRef.current.curX = 0;
    viewOffsetRef.current.curY = 0;
    prevScreenRef.current = 'cartridges';
    turntableRigRef.current.active = false;
    flyRef.current.timed = false;
    userOrbitedRef.current = false;

    const aspect = Math.max(0.45, size.width / Math.max(1, size.height));
    const tankOrdnance = isTankOrdnanceProfile(activeCartridgeCaliber);
    if (cartridgeLineupOverview) {
      if (tankOrdnance) {
        const distZ = Math.max(198, 228 / aspect);
        flyRef.current.goalTarget.set(0, CARTRIDGE_STAGE_DATUM_Y + 56, 0);
        flyRef.current.goalPos.set(0, CARTRIDGE_STAGE_DATUM_Y + 62, distZ);
      } else {
        const distZ = Math.max(29.5, 36.0 / aspect);
        flyRef.current.goalTarget.set(1.6, CARTRIDGE_STAGE_DATUM_Y + 5.8, 0);
        flyRef.current.goalPos.set(1.6, CARTRIDGE_STAGE_DATUM_Y + 7.2, distZ);
      }
    } else {
      const spec = CARTRIDGE_LAB_SPECS[activeCartridgeCaliber];
      const oalCm = spec.oalMm / 10;
      const midY = CARTRIDGE_STAGE_DATUM_Y + oalCm * (tankOrdnance ? 0.5 : 0.52);
      const closeupZ =
        Math.max(
          tankOrdnance ? 95 : 8.2,
          oalCm * (tankOrdnance ? 1.65 : 1.72)
        ) * Math.max(1, 0.92 / aspect);
      flyRef.current.goalTarget.set(spec.lineupXCm, midY, 0);
      flyRef.current.goalPos.set(
        spec.lineupXCm + (tankOrdnance ? 6.0 : 1.05),
        midY + oalCm * (tankOrdnance ? 0.1 : 0.14),
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

  // Subscribe to Tank Crew Station viewpoint switches for 1:1 MBTs
  const tankCrewActive = useTankCrewStore((s) => s.active);
  const tankCrewStation = useTankCrewStore((s) => s.station);

  // Respond to explicit camera preset buttons, weapon switches, screen transitions & viewport/window rect changes
  useEffect(() => {
    if (
      screen !== 'showcase' &&
      screen !== 'armory' &&
      screen !== 'workbench'
    ) {
      prevScreenRef.current = screen;
      return;
    }
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

    if (
      cameraCommand.preset === 'armory_showcase' &&
      (screen === 'showcase' || screen === 'armory')
    ) {
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
      viewOffsetRef.current.active = false;
      viewOffsetRef.current.curX = tf.viewOffsetX;
      viewOffsetRef.current.curY = tf.viewOffsetY;
      viewOffsetRef.current.goalX = tf.viewOffsetX;
      viewOffsetRef.current.goalY = tf.viewOffsetY;

      turntableRigRef.current.goalTarget.set(
        tf.targetX,
        tf.targetY,
        tf.targetZ
      );
      turntableRigRef.current.goalHorizRadius = tf.horizRadius;
      turntableRigRef.current.goalOffsetY = tf.offsetY;
      flyRef.current.active = false;
      flyRef.current.timed = false;

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
      prevScreenRef.current = screen;
    } else {
      const enteringFromHero =
        screen === 'workbench' &&
        (prevScreenRef.current === 'armory' ||
          prevScreenRef.current === 'showcase');
      prevScreenRef.current = screen;
      turntableRigRef.current.active = false;

      const useCutawayRefinement =
        screen === 'workbench' &&
        sectionCut &&
        sectionCutAxis === 'z' &&
        cameraCommand.preset === 'cutaway_focus';
      const effectiveCfg = useCutawayRefinement
        ? computeCutawayFocusRefinement(
            cfg,
            activeWeaponId,
            true,
            sectionCutAxis,
            sectionCutFlip
          )
        : cfg;
      const mirrorNonCutawayZ =
        !useCutawayRefinement &&
        screen === 'workbench' &&
        sectionCut &&
        sectionCutAxis === 'z' &&
        sectionCutFlip;

      applyWorkbenchFraming(
        effectiveCfg,
        scaleProfile,
        cameraCommand.preset,
        t,
        aspect,
        flyRef.current.goalTarget,
        flyRef.current.goalPos,
        screen === 'workbench' && sectionCut,
        activeWeaponId,
        screen === 'workbench' && mode === 'firing',
        mirrorNonCutawayZ
      );

      if (!hasSnappedInitialRef.current && controlsRef.current) {
        perspCam.clearViewOffset();
        viewOffsetRef.current.active = false;
        viewOffsetRef.current.curX = 0;
        viewOffsetRef.current.curY = 0;
        camera.position.copy(flyRef.current.goalPos);
        controlsRef.current.target.copy(flyRef.current.goalTarget);
        controlsRef.current.update();
        flyRef.current.active = false;
        flyRef.current.timed = false;
        hasSnappedInitialRef.current = true;
      } else if (enteringFromHero && controlsRef.current) {
        // Smooth ~0.55s cubic ease-out for both camera orbit & Armory plaque view-offset
        const vo = viewOffsetRef.current;
        if (Math.abs(vo.curX) > 0.25 || Math.abs(vo.curY) > 0.25) {
          vo.startX = vo.curX;
          vo.startY = vo.curY;
          vo.goalX = 0;
          vo.goalY = 0;
          vo.elapsed = 0;
          vo.duration = WORKBENCH_ENTRY_EASE_DURATION_S;
          vo.active = true;
        } else {
          vo.curX = 0;
          vo.curY = 0;
          vo.active = false;
          perspCam.clearViewOffset();
        }
        flyRef.current.startPos.copy(camera.position);
        flyRef.current.startTarget.copy(controlsRef.current.target);
        flyRef.current.elapsed = 0;
        flyRef.current.duration = WORKBENCH_ENTRY_EASE_DURATION_S;
        flyRef.current.timed = true;
        flyRef.current.active = true;
      } else {
        if (!viewOffsetRef.current.active) {
          perspCam.clearViewOffset();
          viewOffsetRef.current.curX = 0;
          viewOffsetRef.current.curY = 0;
        }
        flyRef.current.timed = false;
        flyRef.current.active = true;
      }
    }
  }, [
    cameraCommand,
    activeWeaponId,
    screen,
    mode,
    sectionCut,
    sectionCutAxis,
    sectionCutFlip,
    size.width,
    size.height,
    showcaseWindowVer,
    camera,
  ]);

  useEffect(() => {
    if (
      screen !== 'workbench' ||
      !tankCrewActive ||
      !isTankWeapon(activeWeaponId)
    ) {
      return;
    }
    const spec = getTankCrewSpec(activeWeaponId);
    if (!spec) return;
    const st = useTankCrewStore.getState();
    const yawRad = (st.turretYawDeg * Math.PI) / 180;
    const dirX = Math.cos(-yawRad);
    const dirZ = Math.sin(-yawRad);
    const [rx, ry, rz] = spec.turretRingPivot;
    const [, ty] = spec.trunnionPivot;

    if (tankCrewStation === 'gunner') {
      const gunnerPose = computeTankGunnerCameraPose(
        activeWeaponId,
        st.turretYawDeg
      );
      if (!gunnerPose) return;
      flyRef.current.goalPos.set(
        gunnerPose.eye[0],
        gunnerPose.eye[1],
        gunnerPose.eye[2]
      );
      flyRef.current.goalTarget.set(
        gunnerPose.target[0],
        gunnerPose.target[1],
        gunnerPose.target[2]
      );
      flyRef.current.timed = false;
      flyRef.current.active = true;
    } else if (tankCrewStation === 'interior') {
      flyRef.current.goalPos.set(
        rx - dirX * 140,
        ry + 135,
        rz - dirZ * 140 + 68
      );
      flyRef.current.goalTarget.set(rx + dirX * 65, ty - 5, rz + dirZ * 65);
      flyRef.current.timed = false;
      flyRef.current.active = true;
    }
  }, [screen, tankCrewActive, tankCrewStation, activeWeaponId]);

  // Smoothly re-center or restore turntable view-offset when Clean View (`hudHidden`) toggles on Showcase / Armory
  useEffect(() => {
    if (
      (screen !== 'showcase' && screen !== 'armory') ||
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
    viewOffsetRef.current.active = false;
    viewOffsetRef.current.curX = tf.viewOffsetX;
    viewOffsetRef.current.curY = tf.viewOffsetY;
    viewOffsetRef.current.goalX = tf.viewOffsetX;
    viewOffsetRef.current.goalY = tf.viewOffsetY;
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
    if (state.sectionCut && state.sectionCutAxis === 'z') {
      if (state.sectionCutFlip && _focusViewDir.z > -0.45) {
        _focusViewDir.set(0.22, 0.16, -0.96);
      } else if (!state.sectionCutFlip && _focusViewDir.z < 0.45) {
        _focusViewDir.set(0.22, 0.16, 0.96);
      }
    }
    _focusViewDir.normalize();

    const scaleProfile = meta.scaleProfile;
    const focusDist =
      scaleProfile === 'main_battle_tank'
        ? spec.isShell
          ? 460
          : 235
        : scaleProfile === 'heavy_sniper'
          ? spec.isShell
            ? 34
            : 19.5
          : scaleProfile === 'compound_bow'
            ? spec.isShell
              ? 38
              : 20
            : scaleProfile === 'rifle'
              ? spec.isShell
                ? 27
                : 16.5
              : spec.isShell
                ? 20
                : 14.5;

    turntableRigRef.current.active = false;
    flyRef.current.timed = false;
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
      (state.screen === 'showcase' || state.screen === 'armory') &&
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
          flyRef.current.goalPos,
          state.sectionCut,
          state.activeWeaponId,
          false,
          state.sectionCut &&
            state.sectionCutAxis === 'z' &&
            state.sectionCutFlip
        );
        lastFramedTRef.current = nextAnimatedT;
        flyRef.current.timed = false;
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
        let cadenceMultiplier = 1;
        const causality = useCausalitySandboxStore.getState();
        if (state.screen === 'workbench' && causality.enabled) {
          const ev = getCachedCausalityEvaluation(
            state.activeWeaponId,
            causality
          );
          cadenceMultiplier = Math.max(
            0.35,
            Math.min(2.2, ev.modifiedRpm / Math.max(1, ev.baselineRpm))
          );
        }
        const step =
          BASE_FIRING_RATE * state.fireSpeedMultiplier * cadenceMultiplier * dt;
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

    // 4a. Smoothly dissolve Armory plaque view-offset over ~0.55s on Workbench entry (Zero-GC)
    if (viewOffsetRef.current.active) {
      const vo = viewOffsetRef.current;
      vo.elapsed += dt;
      const eased = evaluateCameraEaseProgress(vo.elapsed, vo.duration);
      vo.curX = THREE.MathUtils.lerp(vo.startX, vo.goalX, eased);
      vo.curY = THREE.MathUtils.lerp(vo.startY, vo.goalY, eased);
      const perspCam = camera as THREE.PerspectiveCamera;
      if (
        eased >= 1 ||
        (Math.abs(vo.curX) < 0.25 && Math.abs(vo.curY) < 0.25)
      ) {
        vo.curX = 0;
        vo.curY = 0;
        vo.active = false;
        perspCam.clearViewOffset();
      } else if (size.width > 0 && size.height > 0) {
        perspCam.setViewOffset(
          size.width,
          size.height,
          vo.curX,
          vo.curY,
          size.width,
          size.height
        );
      }
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
        flyRef.current.timed = false;
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
      if (flyRef.current.timed) {
        flyRef.current.elapsed += dt;
        const eased = evaluateCameraEaseProgress(
          flyRef.current.elapsed,
          flyRef.current.duration
        );
        camera.position.lerpVectors(
          flyRef.current.startPos,
          flyRef.current.goalPos,
          eased
        );
        controlsRef.current.target.lerpVectors(
          flyRef.current.startTarget,
          flyRef.current.goalTarget,
          eased
        );
        controlsRef.current.update();
        if (eased >= 1) {
          flyRef.current.active = false;
          flyRef.current.timed = false;
        }
      } else {
        camera.position.lerp(flyRef.current.goalPos, 1 - Math.exp(-6.0 * dt));
        controlsRef.current.target.lerp(
          flyRef.current.goalTarget,
          1 - Math.exp(-6.5 * dt)
        );
        controlsRef.current.update();

        if (
          camera.position.distanceTo(flyRef.current.goalPos) <
            (isTankScale ? 0.6 : 0.08) &&
          controlsRef.current.target.distanceTo(flyRef.current.goalTarget) <
            (isTankScale ? 0.4 : 0.05)
        ) {
          flyRef.current.active = false;
        }
      }
    }

    // 4b. Bound OrbitControls pan target cleanly inside the 1:1 Heavy Armor hangar envelope (`maxPan: 900 cm`)
    if (isTankScale && controlsRef.current && state.screen === 'workbench') {
      const tgt = controlsRef.current.target;
      const panDx = tgt.x - 80;
      const panDy = tgt.y;
      const panDz = tgt.z;
      const panLen = Math.hypot(panDx, panDy, panDz);
      if (panLen > 900) {
        const s = 900 / panLen;
        const clampedX = 80 + panDx * s;
        const clampedY = panDy * s;
        const clampedZ = panDz * s;
        camera.position.set(
          camera.position.x + (clampedX - tgt.x),
          camera.position.y + (clampedY - tgt.y),
          camera.position.z + (clampedZ - tgt.z)
        );
        tgt.set(clampedX, clampedY, clampedZ);
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
  const orbitBehavior = computeEffectiveOrbitAutoRotate({
    screen,
    armoryAutoRotate,
    workbenchAutoOrbit,
    showcaseDragging,
    fieldStripActive,
    caliperActive,
  });

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
        autoRotate={orbitBehavior.autoRotate}
        autoRotateSpeed={orbitBehavior.autoRotateSpeed}
        minDistance={isTankScale ? 85 : isTankOrdnanceGallery ? 24 : 3}
        maxDistance={isTankScale ? 3200 : isTankOrdnanceGallery ? 950 : 520}
        onStart={() => {
          flyRef.current.active = false;
          flyRef.current.timed = false;
          turntableRigRef.current.active = false;
          userOrbitedRef.current = true;
          const st = useAppStore.getState();
          if (st.screen === 'workbench' && st.workbenchAutoOrbit) {
            st.setWorkbenchAutoOrbit(false);
          }
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
                <RiflingBoreActor />
                <AttachmentActor />
                <BallisticsSystem worldFx={false} />
                <MalfunctionActor />
              </WeaponRecoilGroup>
              <CaliperActor />
              <SectionBoxGuide />
              <ArmoryWorldFx />
            </>
          )}
        </>
      )}
    </>
  );
};

export const ArmoryViewport: React.FC = () => {
  const screen = useAppStore((s) => s.screen);
  const selectPart = useAppStore((s) => s.selectPart);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const postFxEnabled = useAppStore((s) => s.postFxEnabled);
  const graphicsQuality = useAppStore((s) => s.graphicsQuality);
  const macroDofEnabled = useAppStore((s) => s.macroDofEnabled);
  const lang = useAppStore((s) => s.lang);

  const [contextLost, setContextLost] = useState(false);
  const [contextEpoch, setContextEpoch] = useState(0);
  const canvasCleanupRef = useRef<(() => void) | null>(null);

  const envCfg = getArmoryEnvironment(environmentPreset);
  const qualityProfile = getGraphicsQualityProfile(graphicsQuality);
  const workbenchMeta = getWeaponManifest(activeWeaponId).workbenchMeta;
  const activeScaleProfile: WeaponScaleProfile =
    screen === 'cartridges' ? 'rifle' : workbenchMeta.scaleProfile;

  useEffect(() => {
    setBrassFloorImpactListener((caliber, speed) => {
      if (!useAppStore.getState().sfxMuted) {
        playBrassCasingBounceSound(caliber, speed);
      }
    });
    return () => {
      setBrassFloorImpactListener(null);
      canvasCleanupRef.current?.();
      canvasCleanupRef.current = null;
    };
  }, []);

  return (
    <>
      <Canvas
        shadows="soft"
        dpr={[1, qualityProfile.maxDpr]}
        gl={{
          localClippingEnabled: true,
          stencil: true,
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.AgXToneMapping,
          toneMappingExposure: envCfg.toneMappingExposure,
        }}
        camera={{ position: [14.5, 2.2, 54.0], fov: 41, near: 0.1, far: 1200 }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          initKtx2Support(gl);
          canvasCleanupRef.current?.();
          const dom = gl.domElement;
          const onLost = (ev: Event) => {
            ev.preventDefault();
            invalidateStudioHdriCache(gl);
            setContextLost(true);
          };
          const onRestored = () => {
            invalidateStudioHdriCache(gl);
            setContextLost(false);
            setContextEpoch((e) => e + 1);
          };
          dom.addEventListener('webglcontextlost', onLost, false);
          dom.addEventListener('webglcontextrestored', onRestored, false);
          canvasCleanupRef.current = () => {
            dom.removeEventListener('webglcontextlost', onLost, false);
            dom.removeEventListener('webglcontextrestored', onRestored, false);
          };
        }}
        onPointerMissed={() => {
          if (useAppStore.getState().screen === 'workbench') {
            selectPart(null);
          }
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {screen === 'split_showdown' ? (
          <SplitShowdownViewport />
        ) : (
          <>
            <ArmoryStudioEnvironment
              preset={environmentPreset}
              scaleProfile={activeScaleProfile}
              graphicsQuality={graphicsQuality}
              shadowMapSize={qualityProfile.shadowMapSize}
              contextEpoch={contextEpoch}
            />

            <GunsmithStageMat
              preset={environmentPreset}
              scaleProfile={activeScaleProfile}
              centerX={workbenchMeta.chamberGlowPos[0]}
              contactShadows={qualityProfile.contactShadowsEnabled}
              contactShadowResolution={qualityProfile.contactShadowResolution}
            />

            <DisassemblyRig />

            <InteractiveActionController />

            <ArmoryPostProcessing
              enabled={postFxEnabled && !contextLost}
              environmentPreset={environmentPreset}
              scaleProfile={activeScaleProfile}
              gtaoQuality={qualityProfile.gtaoQuality}
              enableGtao={qualityProfile.gtaoEnabled}
              enableBloom={qualityProfile.bloomEnabled}
              enableSmaa={qualityProfile.smaaEnabled}
              enableMacroDof={qualityProfile.macroDofCapable && macroDofEnabled}
              enableFilmicLens={qualityProfile.filmicLensEnabled}
              contextEpoch={contextEpoch}
            />

            <MonographCaptureRig />
          </>
        )}
      </Canvas>

      {contextLost && (
        <div className="viewport-error-fallback" role="alert">
          <div className="viewport-error-card">
            <span className="viewport-error-badge">WEBGL CONTEXT RECOVERY</span>
            <h2 className="viewport-error-title">
              {lang === 'en'
                ? 'Restoring 3D GPU Viewport…'
                : '正在自动恢复 3D 显卡渲染上下文…'}
            </h2>
            <p className="viewport-error-desc">
              {lang === 'en'
                ? 'Your browser temporarily paused the WebGL GPU context (sleep or driver reset). Your active firearm and disassembly progress are preserved and will resume automatically.'
                : '浏览器或系统休眠暂时回收了 WebGL 显卡上下文。当前枪型与拆解状态已完整保留，上下文恢复后将自动重建影棚光影与贴图。'}
            </p>
          </div>
        </div>
      )}
    </>
  );
};
