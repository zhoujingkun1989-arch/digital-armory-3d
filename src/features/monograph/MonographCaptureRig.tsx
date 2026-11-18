import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import {
  applyRendererToneMapping,
  createArmoryComposerRenderTarget,
  getPostProcessingPresetParams,
  hardenGtaoPassAgainstNaN,
  hardenOutputPassAgainstNaN,
  shouldExcludeFromGtaoPass,
} from '../../engine/canvas/ArmoryPostProcessing';
import type { ArmoryEnvironmentPreset } from '../../engine/canvas/GunsmithStageMat';
import { evaluateWeaponTurntableEnvelopeInto } from '../../engine/canvas/turntableStageMetrics';
import { playbackClock } from '../../engine/clock/playbackClock';
import {
  ensureWeaponGeometries,
  getCachedPartGeometry,
} from '../../engine/geometry/geometryService';
import {
  createMutablePose,
  evaluatePartPoseInto,
} from '../../engine/kinematics/math';
import {
  getPartPbrBundle,
  isTextureLoaded,
} from '../../engine/materials/pbrManager';
import {
  getWeaponFiringTiming,
  isArcheryWeapon,
} from '../../engine/physics/armoryPhysics';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { loadWeaponPlugin } from '../../weapons/registry';
import type {
  AssemblyGroupKey,
  WeaponId,
  WeaponRuntimePlugin,
} from '../../weapons/types';
import {
  type ExplodedPinItem,
  projectExplodedPartAnchors,
  solveExplodedPinLayout,
} from './explodedPinLayout';
import {
  buildMonographCacheKey,
  completeMonographCapture,
  type MonographEdition,
  type MonographPlateKey,
  updateMonographCaptureProgress,
  useMonographCaptureState,
} from './monographCaptureStore';

const CAPTURE_W = 1440;
const CAPTURE_H = 900;
const CAPTURE_ASPECT = CAPTURE_W / CAPTURE_H;
const CAPTURE_FOV_DEG = 36;
const SETTLE_FRAMES_PER_SHOT = 2;

/**
 * Pre-inverted HDR linear-sRGB studio backdrop for `blueprint_daylight` (`toneMappingExposure = 1.16`):
 * Exact IEEE-754 binary16 (`HalfFloat`) values `[3124/1024, 2220/512, 1708/256] = [3.05078125, 4.3359375, 6.671875]`
 * evaluate through Three.js r169 `AgXToneMapping(1.16)` + `sRGBTransferOETF` to `[237.992, 242.992, 248.001] / 255`
 * -> `rgb(238, 243, 248)` (`#eef3f8`), matching `.edition-blueprint_manual` `--m-plate-bg: #eef3f8` within `0/255`.
 *
 * Uploaded via a `1×1` `HalfFloatType` `DataTexture` (`LinearSRGBColorSpace`) rather than `THREE.Color`
 * because WebGL 2 `gl.clearColor` clamps clear arguments to `[0.0, 1.0]` even on `RGBA16F` framebuffers.
 */
export const BRIGHT_PLATE_HDR_LINEAR_RGB = [
  3.05078125,
  4.3359375,
  6.671875,
] as const;

function createBrightPlateBackdropTexture(): THREE.DataTexture {
  const data = new Uint16Array([
    THREE.DataUtils.toHalfFloat(BRIGHT_PLATE_HDR_LINEAR_RGB[0]),
    THREE.DataUtils.toHalfFloat(BRIGHT_PLATE_HDR_LINEAR_RGB[1]),
    THREE.DataUtils.toHalfFloat(BRIGHT_PLATE_HDR_LINEAR_RGB[2]),
    THREE.DataUtils.toHalfFloat(1.0),
  ]);
  const tex = new THREE.DataTexture(
    data,
    1,
    1,
    THREE.RGBAFormat,
    THREE.HalfFloatType
  );
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

interface ShotSpec {
  key: MonographPlateKey;
  explodeT: number;
  firingF?: number;
  isolatedGroup?: AssemblyGroupKey;
  showTurntable: boolean;
  sectionCut: boolean;
  xrayShells: boolean;
  engineeringTint: boolean;
  azimuthDeg: number;
  elevationDeg: number;
  fillX: number;
  fillY: number;
  useManifestCloseFocus?: boolean;
}

const SHOT_PLAN: readonly ShotSpec[] = [
  // 1. Hero Cover 3/4 Turntable Photo
  {
    key: 'cover_hero',
    explodeT: 0,
    showTurntable: true,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 18,
    elevationDeg: 9.5,
    fillX: 0.85,
    fillY: 0.8,
  },
  // 2..4. 360° Three-View Turnaround (Right / Left / Top-Down)
  {
    key: 'ortho_right',
    explodeT: 0,
    showTurntable: false,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 0,
    elevationDeg: 1,
    fillX: 0.88,
    fillY: 0.82,
  },
  {
    key: 'ortho_left',
    explodeT: 0,
    showTurntable: false,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 180,
    elevationDeg: 1,
    fillX: 0.88,
    fillY: 0.82,
  },
  {
    key: 'ortho_top',
    explodeT: 0,
    showTurntable: false,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 0,
    elevationDeg: 83,
    fillX: 0.88,
    fillY: 0.78,
  },
  // 5 & 6. Full-Weapon X-Ray Vision & Laser Half-Cutaway
  {
    key: 'xray_magic',
    explodeT: 0,
    showTurntable: false,
    sectionCut: false,
    xrayShells: true,
    engineeringTint: false,
    azimuthDeg: 11,
    elevationDeg: 7,
    fillX: 0.87,
    fillY: 0.82,
  },
  {
    key: 'stencil_cutaway',
    explodeT: 0,
    showTurntable: false,
    sectionCut: true,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 3.5,
    elevationDeg: 3.5,
    fillX: 0.88,
    fillY: 0.82,
  },
  // 7. Rainbow 6-Role Functional Color Map
  {
    key: 'functional_roles',
    explodeT: 0.34,
    showTurntable: false,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: true,
    azimuthDeg: 22,
    elevationDeg: 15,
    fillX: 0.86,
    fillY: 0.8,
  },
  // 8. Full 100% Exploded LEGO-Style Blueprint Poster
  {
    key: 'exploded_bom',
    explodeT: 1.0,
    showTurntable: false,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 10,
    elevationDeg: 7.5,
    fillX: 0.85,
    fillY: 0.67,
  },
  // 9..12. Four Isolated Sub-Assembly Macro Photo Cards
  {
    key: 'group_slide',
    explodeT: 0.25,
    isolatedGroup: 'slide',
    showTurntable: false,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 20,
    elevationDeg: 14,
    fillX: 0.82,
    fillY: 0.78,
  },
  {
    key: 'group_frame',
    explodeT: 0.2,
    isolatedGroup: 'frame',
    showTurntable: false,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 18,
    elevationDeg: 12,
    fillX: 0.84,
    fillY: 0.78,
  },
  {
    key: 'group_fcg',
    explodeT: 0.28,
    isolatedGroup: 'fire_control',
    showTurntable: false,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 22,
    elevationDeg: 15,
    fillX: 0.8,
    fillY: 0.76,
  },
  {
    key: 'group_mag',
    explodeT: 0.26,
    isolatedGroup: 'magazine',
    showTurntable: false,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 24,
    elevationDeg: 14,
    fillX: 0.8,
    fillY: 0.78,
  },
  // 13..16. 4-Frame 3D Slow-Motion Action Comic Strip
  {
    key: 'comic_1_ready',
    explodeT: 0,
    firingF: 0.02,
    showTurntable: false,
    sectionCut: true,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 8,
    elevationDeg: 5,
    fillX: 0.87,
    fillY: 0.82,
  },
  {
    key: 'comic_2_ignition',
    explodeT: 0,
    firingF: 0.17,
    showTurntable: false,
    sectionCut: true,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 8,
    elevationDeg: 5,
    fillX: 0.87,
    fillY: 0.82,
  },
  {
    key: 'comic_3_eject',
    explodeT: 0,
    firingF: 0.48,
    showTurntable: false,
    sectionCut: true,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 10,
    elevationDeg: 7,
    fillX: 0.87,
    fillY: 0.82,
  },
  {
    key: 'comic_4_reload',
    explodeT: 0,
    firingF: 0.8,
    showTurntable: false,
    sectionCut: false,
    xrayShells: true,
    engineeringTint: false,
    azimuthDeg: 10,
    elevationDeg: 7,
    fillX: 0.87,
    fillY: 0.82,
  },
  // 17. Macro Breech Focus (for Pro Dossier toggle)
  {
    key: 'breech_closeup',
    explodeT: 0,
    showTurntable: false,
    sectionCut: false,
    xrayShells: true,
    engineeringTint: false,
    azimuthDeg: 14,
    elevationDeg: 10,
    fillX: 0.86,
    fillY: 0.8,
    useManifestCloseFocus: true,
  },
];

/**
 * Tailors base studio shot specs to each exhibit's actual firing kinematics
 * and frame architecture (archery cam/arrow milestones vs. per-firearm timings).
 */
export function resolveShotForWeapon(
  shot: ShotSpec,
  weaponId: WeaponId
): ShotSpec {
  if (isArcheryWeapon(weaponId)) {
    switch (shot.key) {
      case 'comic_1_ready':
        return { ...shot, firingF: 0.27, sectionCut: false };
      case 'comic_2_ignition':
        return { ...shot, firingF: 0.36, sectionCut: false };
      case 'comic_3_eject':
        return { ...shot, firingF: 0.5, sectionCut: false };
      case 'comic_4_reload':
        return {
          ...shot,
          firingF: 0.78,
          sectionCut: false,
          xrayShells: weaponId === 'lift33' ? false : shot.xrayShells,
        };
      case 'breech_closeup':
        return weaponId === 'lift33' ? { ...shot, xrayShells: false } : shot;
      default:
        return shot;
    }
  }

  const timing = getWeaponFiringTiming(weaponId);
  switch (shot.key) {
    case 'comic_2_ignition':
      return {
        ...shot,
        firingF: (timing.ignitionF + timing.muzzleExitF) * 0.52,
      };
    case 'comic_3_eject':
      return {
        ...shot,
        firingF: Math.min(0.74, timing.ejectF + 0.02),
      };
    default:
      return shot;
  }
}

interface SavedViewportSnapshot {
  screen: ReturnType<typeof useAppStore.getState>['screen'];
  activeWeaponId: WeaponId;
  mode: ReturnType<typeof useAppStore.getState>['mode'];
  environmentPreset: ArmoryEnvironmentPreset;
  sectionCut: boolean;
  xrayShells: boolean;
  engineeringTint: boolean;
  focusedEngineeringRole: ReturnType<
    typeof useAppStore.getState
  >['focusedEngineeringRole'];
  pbrTexturesEnabled: boolean;
  showEdges: boolean;
  fieldStripActive: boolean;
  malfunctionActive: boolean;
  caliperActive: boolean;
  envelopeRulerVisible: boolean;
  isolateSelected: boolean;
  selectedPartId: string | null;
  isPlaying: boolean;
  isFiringPlaying: boolean;
  armoryAutoRotate: boolean;
  hiddenGroups: Record<AssemblyGroupKey, boolean>;
  targetProgress: number;
  animatedProgress: number;
  fireProgress: number;
  animatedFireProgress: number;
}

const _corner = new THREE.Vector3();
const _euler = new THREE.Euler();
const _pose = createMutablePose();

function computeWeaponWorldBounds(
  weaponId: WeaponId,
  plugin: WeaponRuntimePlugin,
  shot: ShotSpec
): THREE.Box3 {
  const box = new THREE.Box3();
  let hasAny = false;
  const isFiring = shot.firingF !== undefined;
  const fireF = shot.firingF ?? 0;

  for (let i = 0; i < plugin.parts.length; i++) {
    const part = plugin.parts[i];
    if (shot.isolatedGroup && part.group !== shot.isolatedGroup) {
      continue;
    }
    const geo = getCachedPartGeometry(weaponId, part.id);
    if (!geo) continue;
    if (!geo.boundingBox) {
      geo.computeBoundingBox();
    }
    const gb = geo.boundingBox;
    if (!gb) continue;

    evaluatePartPoseInto(
      part,
      shot.explodeT,
      isFiring,
      fireF,
      plugin.computeFiringKinematics,
      _pose
    );
    _euler.set(_pose.rx, _pose.ry, _pose.rz);

    for (let mask = 0; mask < 8; mask++) {
      const lx = (mask & 1 ? gb.max.x : gb.min.x) * _pose.sx;
      const ly = mask & 2 ? gb.max.y : gb.min.y;
      const lz = mask & 4 ? gb.max.z : gb.min.z;
      _corner.set(lx, ly, lz).applyEuler(_euler);
      _corner.x += _pose.px;
      _corner.y += _pose.py;
      _corner.z += _pose.pz;
      box.expandByPoint(_corner);
      hasAny = true;
    }
  }

  if (!hasAny) {
    box.min.set(-20, -10, -3);
    box.max.set(25, 6, 3);
  }

  if (shot.showTurntable) {
    const env = evaluateWeaponTurntableEnvelopeInto(weaponId, shot.explodeT);
    const rim = env.radius * 1.06;
    box.expandByPoint(_corner.set(env.cx - rim, env.platterTopY - 0.65, -rim));
    box.expandByPoint(_corner.set(env.cx + rim, env.platterTopY + 0.05, rim));
  }

  return box;
}

function positionStudioShotCamera(
  cam: THREE.PerspectiveCamera,
  weaponId: WeaponId,
  plugin: WeaponRuntimePlugin,
  shot: ShotSpec
): void {
  cam.fov = CAPTURE_FOV_DEG;
  cam.aspect = CAPTURE_ASPECT;
  cam.near = 0.1;
  cam.far = 680;
  cam.clearViewOffset();

  const manifest = getWeaponManifest(weaponId);
  if (shot.useManifestCloseFocus) {
    const closeCfg = manifest.cameraPresets.cutaway_focus;
    cam.position.set(
      closeCfg.pos[0],
      closeCfg.pos[1],
      closeCfg.pos[2] * 0.92
    );
    cam.lookAt(closeCfg.target[0], closeCfg.target[1], closeCfg.target[2]);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    return;
  }

  const bounds = computeWeaponWorldBounds(weaponId, plugin, shot);
  const cx = (bounds.min.x + bounds.max.x) * 0.5;
  let cy = (bounds.min.y + bounds.max.y) * 0.5;
  const cz = (bounds.min.z + bounds.max.z) * 0.5;

  const az = THREE.MathUtils.degToRad(shot.azimuthDeg);
  const el = THREE.MathUtils.degToRad(shot.elevationDeg);
  const viewDir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el)
  ).normalize();

  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, viewDir).normalize();
  const up = new THREE.Vector3().crossVectors(viewDir, right).normalize();

  let maxProjX = 1.5;
  let maxProjY = 1.5;
  let maxDepthTowardCam = 0.8;

  for (let mask = 0; mask < 8; mask++) {
    const vx = (mask & 1 ? bounds.max.x : bounds.min.x) - cx;
    const vy = (mask & 2 ? bounds.max.y : bounds.min.y) - cy;
    const vz = (mask & 4 ? bounds.max.z : bounds.min.z) - cz;
    _corner.set(vx, vy, vz);
    const px = Math.abs(_corner.dot(right));
    const py = Math.abs(_corner.dot(up));
    const pz = _corner.dot(viewDir);
    if (px > maxProjX) maxProjX = px;
    if (py > maxProjY) maxProjY = py;
    if (pz > maxDepthTowardCam) maxDepthTowardCam = pz;
  }

  const tanHalfV = Math.tan(THREE.MathUtils.degToRad(CAPTURE_FOV_DEG * 0.5));
  const tanHalfH = tanHalfV * CAPTURE_ASPECT;

  const distY = maxProjY / (tanHalfV * shot.fillY) + maxDepthTowardCam;
  const distX = maxProjX / (tanHalfH * shot.fillX) + maxDepthTowardCam;
  const minSafeDist = shot.isolatedGroup ? 8.5 : 14;
  const baseDist = Math.max(minSafeDist, distX, distY);

  // Nudge compact pistols & revolvers upward and slightly closer on cover_hero so they sit centered above the turntable rim
  const wid = weaponId as string;
  const isPistolCover =
    shot.key === 'cover_hero' &&
    (manifest.workbenchMeta.scaleProfile === 'pistol' ||
      wid === 'g17' ||
      wid === 'p320' ||
      wid === 'deagle' ||
      wid === 'python' ||
      wid === 'p08');
  if (isPistolCover) {
    cy -= 1.05;
  }
  const dist = isPistolCover
    ? Math.max(minSafeDist, baseDist * 0.89)
    : baseDist;

  cam.position.set(
    cx + viewDir.x * dist,
    cy + viewDir.y * dist,
    cz + viewDir.z * dist
  );
  cam.lookAt(cx, cy, cz);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

async function waitForWeaponTexturesWarm(
  weaponId: WeaponId,
  plugin: WeaponRuntimePlugin,
  maxWaitMs = 400
): Promise<void> {
  const textures: THREE.Texture[] = [];
  for (const part of plugin.parts) {
    const bundle = getPartPbrBundle(
      weaponId,
      part.material,
      plugin.pbrBindings[part.id]
    );
    if (bundle.map) textures.push(bundle.map);
    if (bundle.normalMap) textures.push(bundle.normalMap);
    if (bundle.roughnessMap) textures.push(bundle.roughnessMap);
  }
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (textures.every((t) => isTextureLoaded(t))) {
      return;
    }
    await new Promise<void>((r) => setTimeout(r, 30));
  }
}

interface ActiveCaptureSession {
  requestId: number;
  weaponId: WeaponId;
  edition: MonographEdition;
  plugin: WeaponRuntimePlugin;
  shots: readonly ShotSpec[];
  saved: SavedViewportSnapshot;
  shotIndex: number;
  settleCounter: number;
  plates: Partial<Record<MonographPlateKey, string>>;
  explodedPins: ExplodedPinItem[];
  composer: EffectComposer;
  renderPass: RenderPass;
  gtaoPass: GTAOPass;
  outputPass: OutputPass;
  smaaPass: SMAAPass;
  copyPass: ShaderPass;
  hdrTarget: THREE.WebGLRenderTarget;
  ldrTarget: THREE.WebGLRenderTarget;
  brightBgTexture: THREE.DataTexture | null;
  captureCam: THREE.PerspectiveCamera;
  rawRgba: Uint8Array;
  canvas2d: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  imageData: ImageData;
}

function buildHiddenGroupsForShot(
  isolatedGroup?: AssemblyGroupKey
): Record<AssemblyGroupKey, boolean> {
  if (!isolatedGroup) {
    return {
      slide: false,
      frame: false,
      fire_control: false,
      magazine: false,
    };
  }
  return {
    slide: isolatedGroup !== 'slide',
    frame: isolatedGroup !== 'frame',
    fire_control: isolatedGroup !== 'fire_control',
    magazine: isolatedGroup !== 'magazine',
  };
}

function applyShotStateToStore(
  weaponId: WeaponId,
  edition: MonographEdition,
  shot: ShotSpec
): void {
  const envPreset: ArmoryEnvironmentPreset =
    edition === 'blueprint_manual' ? 'blueprint_daylight' : 'tactical_vault';
  const isFiring = shot.firingF !== undefined;
  const fireF = shot.firingF ?? 0;

  playbackClock.setFireProgress(fireF, true);
  playbackClock.setAnimatedFireProgress(fireF);
  playbackClock.setTargetProgress(shot.explodeT, true);
  playbackClock.setAnimatedProgress(shot.explodeT);

  useAppStore.setState({
    activeWeaponId: weaponId,
    screen: shot.showTurntable ? 'armory' : 'workbench',
    mode: isFiring ? 'firing' : 'explode',
    environmentPreset: envPreset,
    sectionCut: shot.sectionCut,
    xrayShells: shot.xrayShells,
    engineeringTint: shot.engineeringTint,
    focusedEngineeringRole: null,
    pbrTexturesEnabled: true,
    showEdges: edition === 'blueprint_manual' && shot.key === 'exploded_bom',
    fieldStripActive: false,
    malfunctionActive: false,
    caliperActive: false,
    envelopeRulerVisible: false,
    isolateSelected: false,
    selectedPartId: null,
    isPlaying: false,
    isFiringPlaying: false,
    armoryAutoRotate: false,
    hiddenGroups: buildHiddenGroupsForShot(shot.isolatedGroup),
  });
}

function restoreSavedSnapshot(saved: SavedViewportSnapshot): void {
  playbackClock.setTargetProgress(saved.targetProgress, true);
  playbackClock.setAnimatedProgress(saved.animatedProgress);
  playbackClock.setFireProgress(saved.fireProgress, true);
  playbackClock.setAnimatedFireProgress(saved.animatedFireProgress);

  useAppStore.setState({
    screen: saved.screen,
    activeWeaponId: saved.activeWeaponId,
    mode: saved.mode,
    environmentPreset: saved.environmentPreset,
    sectionCut: saved.sectionCut,
    xrayShells: saved.xrayShells,
    engineeringTint: saved.engineeringTint,
    focusedEngineeringRole: saved.focusedEngineeringRole,
    pbrTexturesEnabled: saved.pbrTexturesEnabled,
    showEdges: saved.showEdges,
    fieldStripActive: saved.fieldStripActive,
    malfunctionActive: saved.malfunctionActive,
    caliperActive: saved.caliperActive,
    envelopeRulerVisible: saved.envelopeRulerVisible,
    isolateSelected: saved.isolateSelected,
    selectedPartId: saved.selectedPartId,
    isPlaying: saved.isPlaying,
    isFiringPlaying: saved.isFiringPlaying,
    armoryAutoRotate: saved.armoryAutoRotate,
    hiddenGroups: { ...saved.hiddenGroups },
  });
}

function disposeSessionGpuResources(session: ActiveCaptureSession): void {
  session.gtaoPass.dispose();
  session.outputPass.dispose();
  session.smaaPass.dispose();
  session.copyPass.dispose();
  session.composer.renderTarget1.dispose();
  session.composer.renderTarget2.dispose();
  session.ldrTarget.dispose();
  session.brightBgTexture?.dispose();
}

function withStudioCaptureBackdrop(
  targetScene: THREE.Scene,
  brightBgTexture: THREE.DataTexture | null,
  renderFn: () => void
): void {
  if (!brightBgTexture) {
    renderFn();
    return;
  }

  const prevSceneBg = targetScene.background;
  const fogColor = (targetScene.fog as THREE.Fog | null)?.color ?? null;
  const prevFogR = fogColor ? fogColor.r : 0;
  const prevFogG = fogColor ? fogColor.g : 0;
  const prevFogB = fogColor ? fogColor.b : 0;

  const cycFloor = targetScene.getObjectByName('studio-cyclorama-floor') as
    | THREE.Mesh
    | undefined;
  const cycUniform =
    cycFloor && (cycFloor.material as THREE.ShaderMaterial).isShaderMaterial
      ? (((cycFloor.material as THREE.ShaderMaterial).uniforms
          .uCycloramaColor?.value as THREE.Color | undefined) ?? null)
      : null;
  const prevCycR = cycUniform ? cycUniform.r : 0;
  const prevCycG = cycUniform ? cycUniform.g : 0;
  const prevCycB = cycUniform ? cycUniform.b : 0;

  targetScene.background = brightBgTexture;
  if (fogColor) {
    fogColor.setRGB(
      BRIGHT_PLATE_HDR_LINEAR_RGB[0],
      BRIGHT_PLATE_HDR_LINEAR_RGB[1],
      BRIGHT_PLATE_HDR_LINEAR_RGB[2],
      THREE.LinearSRGBColorSpace
    );
  }
  if (cycUniform) {
    cycUniform.setRGB(
      BRIGHT_PLATE_HDR_LINEAR_RGB[0],
      BRIGHT_PLATE_HDR_LINEAR_RGB[1],
      BRIGHT_PLATE_HDR_LINEAR_RGB[2],
      THREE.LinearSRGBColorSpace
    );
  }

  try {
    renderFn();
  } finally {
    targetScene.background = prevSceneBg;
    if (fogColor) {
      fogColor.setRGB(prevFogR, prevFogG, prevFogB, THREE.LinearSRGBColorSpace);
    }
    if (cycUniform) {
      cycUniform.setRGB(
        prevCycR,
        prevCycG,
        prevCycB,
        THREE.LinearSRGBColorSpace
      );
    }
  }
}

const ActiveMonographCaptureWorker: React.FC<{
  requestId: number;
  weaponId: WeaponId;
  edition: MonographEdition;
}> = ({ requestId, weaponId, edition }) => {
  const { gl, scene } = useThree();
  const sessionRef = useRef<ActiveCaptureSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    const cur = useAppStore.getState();
    const clk = playbackClock.getState();
    const saved: SavedViewportSnapshot = {
      screen: cur.screen,
      activeWeaponId: cur.activeWeaponId,
      mode: cur.mode,
      environmentPreset: cur.environmentPreset,
      sectionCut: cur.sectionCut,
      xrayShells: cur.xrayShells,
      engineeringTint: cur.engineeringTint,
      focusedEngineeringRole: cur.focusedEngineeringRole,
      pbrTexturesEnabled: cur.pbrTexturesEnabled,
      showEdges: cur.showEdges,
      fieldStripActive: cur.fieldStripActive,
      malfunctionActive: cur.malfunctionActive,
      caliperActive: cur.caliperActive,
      envelopeRulerVisible: cur.envelopeRulerVisible,
      isolateSelected: cur.isolateSelected,
      selectedPartId: cur.selectedPartId,
      isPlaying: cur.isPlaying,
      isFiringPlaying: cur.isFiringPlaying,
      armoryAutoRotate: cur.armoryAutoRotate,
      hiddenGroups: { ...cur.hiddenGroups },
      targetProgress: clk.targetProgress,
      animatedProgress: clk.animatedProgress,
      fireProgress: clk.fireProgress,
      animatedFireProgress: clk.animatedFireProgress,
    };

    void (async () => {
      const plugin = await loadWeaponPlugin(weaponId);
      await ensureWeaponGeometries(
        weaponId,
        plugin.parts.map((p) => p.id)
      );
      await waitForWeaponTexturesWarm(weaponId, plugin);
      if (cancelled) return;

      const envPreset: ArmoryEnvironmentPreset =
        edition === 'blueprint_manual'
          ? 'blueprint_daylight'
          : 'tactical_vault';
      const postParams = getPostProcessingPresetParams(envPreset);

      const captureCam = new THREE.PerspectiveCamera(
        CAPTURE_FOV_DEG,
        CAPTURE_ASPECT,
        0.1,
        680
      );
      const hdrTarget = createArmoryComposerRenderTarget(CAPTURE_W, CAPTURE_H);
      const composer = new EffectComposer(gl, hdrTarget);
      composer.setPixelRatio(1);
      composer.setSize(CAPTURE_W, CAPTURE_H);
      composer.renderToScreen = false;

      const renderPass = new RenderPass(scene, captureCam);
      const gtaoPass = new GTAOPass(scene, captureCam, CAPTURE_W, CAPTURE_H);
      hardenGtaoPassAgainstNaN(gtaoPass);
      gtaoPass.output = GTAOPass.OUTPUT.Default;
      gtaoPass.blendIntensity = postParams.gtao.blendIntensity;
      gtaoPass.updateGtaoMaterial({
        radius: postParams.gtao.radius,
        distanceExponent: postParams.gtao.distanceExponent,
        thickness: postParams.gtao.thickness,
        distanceFallOff: postParams.gtao.distanceFallOff,
        scale: postParams.gtao.scale,
        samples: postParams.gtao.samples,
        screenSpaceRadius: postParams.gtao.screenSpaceRadius,
      });
      gtaoPass.updatePdMaterial({
        lumaPhi: postParams.gtao.pdLumaPhi,
        depthPhi: postParams.gtao.pdDepthPhi,
        normalPhi: postParams.gtao.pdNormalPhi,
        radius: postParams.gtao.pdRadius,
        radiusExponent: postParams.gtao.pdRadiusExponent,
        rings: postParams.gtao.pdRings,
        samples: postParams.gtao.pdSamples,
      });

      const origGtaoRender = gtaoPass.render.bind(gtaoPass);
      const hiddenForGtao: THREE.Object3D[] = [];
      gtaoPass.render = (
        renderer,
        writeBuffer,
        readBuffer,
        deltaTime,
        maskActive
      ) => {
        const prevSceneBg = scene.background;
        scene.background = null;
        hiddenForGtao.length = 0;
        scene.traverseVisible((obj) => {
          if (shouldExcludeFromGtaoPass(obj)) {
            obj.visible = false;
            hiddenForGtao.push(obj);
          }
        });
        try {
          origGtaoRender(
            renderer,
            writeBuffer,
            readBuffer,
            deltaTime,
            maskActive
          );
        } finally {
          scene.background = prevSceneBg;
          for (let i = 0; i < hiddenForGtao.length; i++) {
            hiddenForGtao[i].visible = true;
          }
          hiddenForGtao.length = 0;
        }
      };

      const outputPass = new OutputPass();
      hardenOutputPassAgainstNaN(outputPass);
      const smaaPass = new SMAAPass(CAPTURE_W, CAPTURE_H);

      composer.addPass(renderPass);
      composer.addPass(gtaoPass);
      composer.addPass(outputPass);
      composer.addPass(smaaPass);

      const copyPass = new ShaderPass(CopyShader);
      copyPass.renderToScreen = false;

      const ldrTarget = new THREE.WebGLRenderTarget(CAPTURE_W, CAPTURE_H, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        depthBuffer: false,
        stencilBuffer: false,
      });

      const brightBgTexture =
        edition === 'blueprint_manual'
          ? createBrightPlateBackdropTexture()
          : null;

      const canvas2d = document.createElement('canvas');
      canvas2d.width = CAPTURE_W;
      canvas2d.height = CAPTURE_H;
      const ctx2d = canvas2d.getContext('2d')!;
      const imageData = ctx2d.createImageData(CAPTURE_W, CAPTURE_H);
      const rawRgba = new Uint8Array(CAPTURE_W * CAPTURE_H * 4);

      const shots = SHOT_PLAN.map((shot) =>
        resolveShotForWeapon(shot, weaponId)
      );
      applyShotStateToStore(weaponId, edition, shots[0]);
      updateMonographCaptureProgress(requestId, 0, shots[0].key);

      sessionRef.current = {
        requestId,
        weaponId,
        edition,
        plugin,
        shots,
        saved,
        shotIndex: 0,
        settleCounter: 0,
        plates: {},
        explodedPins: [],
        composer,
        renderPass,
        gtaoPass,
        outputPass,
        smaaPass,
        copyPass,
        hdrTarget,
        ldrTarget,
        brightBgTexture,
        captureCam,
        rawRgba,
        canvas2d,
        ctx2d,
        imageData,
      };
    })();

    return () => {
      cancelled = true;
      if (sessionRef.current) {
        const s = sessionRef.current;
        sessionRef.current = null;
        disposeSessionGpuResources(s);
        restoreSavedSnapshot(s.saved);
      }
    };
  }, [requestId, weaponId, edition, gl, scene]);

  useFrame(({ gl: frameGl, scene: frameScene }) => {
    const s = sessionRef.current;
    if (!s) return;

    const shot = s.shots[s.shotIndex];
    if (!shot) return;

    const fireF = shot.firingF ?? 0;
    playbackClock.setFireProgress(fireF, true);
    playbackClock.setAnimatedFireProgress(fireF);
    playbackClock.setTargetProgress(shot.explodeT, true);
    playbackClock.setAnimatedProgress(shot.explodeT);

    // Extra settle guard when transitioning out of CartridgeCutawayStage so DisassemblyRig / PartActor finish mounting
    const requiredSettleFrames =
      s.shotIndex === 0 && s.saved.screen === 'cartridges'
        ? SETTLE_FRAMES_PER_SHOT + 2
        : SETTLE_FRAMES_PER_SHOT;
    s.settleCounter += 1;
    if (s.settleCounter < requiredSettleFrames) {
      return;
    }

    frameScene.updateMatrixWorld(true);
    positionStudioShotCamera(s.captureCam, s.weaponId, s.plugin, shot);

    s.gtaoPass.enabled = !shot.xrayShells;

    const envPreset: ArmoryEnvironmentPreset =
      s.edition === 'blueprint_manual'
        ? 'blueprint_daylight'
        : 'tactical_vault';
    const postParams = getPostProcessingPresetParams(envPreset);
    const prevExposure = frameGl.toneMappingExposure;
    const prevToneMapping = frameGl.toneMapping;

    applyRendererToneMapping(
      frameGl,
      postParams.toneMapping,
      postParams.toneMappingExposure,
      THREE.SRGBColorSpace
    );

    const prevRenderTarget = frameGl.getRenderTarget();
    try {
      withStudioCaptureBackdrop(frameScene, s.brightBgTexture, () => {
        s.composer.render(0.016);
      });
      s.copyPass.render(
        frameGl,
        s.ldrTarget,
        s.composer.readBuffer,
        0,
        false
      );
      frameGl.readRenderTargetPixels(
        s.ldrTarget,
        0,
        0,
        CAPTURE_W,
        CAPTURE_H,
        s.rawRgba
      );
    } finally {
      frameGl.setRenderTarget(prevRenderTarget);
      applyRendererToneMapping(frameGl, prevToneMapping, prevExposure);
    }

    const rowBytes = CAPTURE_W * 4;
    const dst = s.imageData.data;
    for (let y = 0; y < CAPTURE_H; y++) {
      const srcOffset = (CAPTURE_H - 1 - y) * rowBytes;
      const dstOffset = y * rowBytes;
      dst.set(s.rawRgba.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
    }
    s.ctx2d.putImageData(s.imageData, 0, 0);
    s.plates[shot.key] = s.canvas2d.toDataURL('image/png');

    if (shot.key === 'exploded_bom') {
      const anchors = projectExplodedPartAnchors(
        s.weaponId,
        s.plugin.parts,
        s.captureCam,
        shot.explodeT
      );
      s.explodedPins = solveExplodedPinLayout(anchors);
    }

    const completedCount = s.shotIndex + 1;
    if (completedCount < s.shots.length) {
      const nextShot = s.shots[completedCount];
      s.shotIndex = completedCount;
      s.settleCounter = 0;
      applyShotStateToStore(s.weaponId, s.edition, nextShot);
      updateMonographCaptureProgress(s.requestId, completedCount, nextShot.key);
      return;
    }

    sessionRef.current = null;
    disposeSessionGpuResources(s);
    restoreSavedSnapshot(s.saved);

    completeMonographCapture(s.requestId, {
      cacheKey: buildMonographCacheKey(s.weaponId, s.edition),
      weaponId: s.weaponId,
      edition: s.edition,
      capturedAtIso: new Date().toISOString(),
      plates: s.plates as Record<MonographPlateKey, string>,
      explodedPins: s.explodedPins,
    });
  }, 2);

  return null;
};

export const MonographCaptureRig: React.FC = () => {
  const { activeRequest } = useMonographCaptureState();
  if (!activeRequest) return null;
  return (
    <ActiveMonographCaptureWorker
      key={`${activeRequest.requestId}:${activeRequest.weaponId}:${activeRequest.edition}`}
      requestId={activeRequest.requestId}
      weaponId={activeRequest.weaponId}
      edition={activeRequest.edition}
    />
  );
};
