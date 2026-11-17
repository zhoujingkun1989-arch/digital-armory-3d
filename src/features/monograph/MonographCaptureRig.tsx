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
import { computePartTransform } from '../../engine/kinematics/math';
import {
  getPartPbrBundle,
  isTextureLoaded,
} from '../../engine/materials/pbrManager';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { loadWeaponPlugin } from '../../weapons/registry';
import type {
  AssemblyGroupKey,
  WeaponId,
  WeaponPartSpec,
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

const CAPTURE_W = 1920;
const CAPTURE_H = 1200;
const CAPTURE_ASPECT = CAPTURE_W / CAPTURE_H;
const CAPTURE_FOV_DEG = 36;
const SETTLE_FRAMES_PER_SHOT = 3;

interface ShotSpec {
  key: MonographPlateKey;
  explodeT: number;
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
  {
    key: 'cover_hero',
    explodeT: 0,
    showTurntable: true,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 18,
    elevationDeg: 9.5,
    fillX: 0.84,
    fillY: 0.78,
  },
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
  {
    key: 'functional_roles',
    explodeT: 0.34,
    showTurntable: false,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: true,
    azimuthDeg: 22,
    elevationDeg: 15,
    fillX: 0.85,
    fillY: 0.78,
  },
  {
    key: 'exploded_bom',
    explodeT: 1.0,
    showTurntable: false,
    sectionCut: false,
    xrayShells: false,
    engineeringTint: false,
    azimuthDeg: 10,
    elevationDeg: 7.5,
    // Leave 15% top & bottom studio margin for non-overlapping vector BOM callout rails
    fillX: 0.85,
    fillY: 0.67,
  },
];

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

function computeWeaponWorldBounds(
  weaponId: WeaponId,
  parts: readonly WeaponPartSpec[],
  explodeT: number,
  includeTurntable: boolean
): THREE.Box3 {
  const box = new THREE.Box3();
  let hasAny = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const geo = getCachedPartGeometry(weaponId, part.id);
    if (!geo) continue;
    if (!geo.boundingBox) {
      geo.computeBoundingBox();
    }
    const gb = geo.boundingBox;
    if (!gb) continue;

    const { position, rotation } = computePartTransform(part, explodeT);
    _euler.set(rotation[0], rotation[1], rotation[2]);

    for (let mask = 0; mask < 8; mask++) {
      const lx = mask & 1 ? gb.max.x : gb.min.x;
      const ly = mask & 2 ? gb.max.y : gb.min.y;
      const lz = mask & 4 ? gb.max.z : gb.min.z;
      _corner.set(lx, ly, lz).applyEuler(_euler);
      _corner.x += position[0];
      _corner.y += position[1];
      _corner.z += position[2];
      box.expandByPoint(_corner);
      hasAny = true;
    }
  }

  if (!hasAny) {
    box.min.set(-20, -10, -3);
    box.max.set(25, 6, 3);
  }

  if (includeTurntable) {
    const env = evaluateWeaponTurntableEnvelopeInto(weaponId, explodeT);
    const rim = env.radius * 1.06;
    box.expandByPoint(_corner.set(env.cx - rim, env.platterTopY - 0.65, -rim));
    box.expandByPoint(_corner.set(env.cx + rim, env.maxY, rim));
  }

  return box;
}

function positionStudioShotCamera(
  cam: THREE.PerspectiveCamera,
  weaponId: WeaponId,
  parts: readonly WeaponPartSpec[],
  shot: ShotSpec
): void {
  cam.fov = CAPTURE_FOV_DEG;
  cam.aspect = CAPTURE_ASPECT;
  cam.near = 0.1;
  cam.far = 640;
  cam.clearViewOffset();

  if (shot.useManifestCloseFocus) {
    const manifest = getWeaponManifest(weaponId);
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

  const bounds = computeWeaponWorldBounds(
    weaponId,
    parts,
    shot.explodeT,
    shot.showTurntable
  );
  const cx = (bounds.min.x + bounds.max.x) * 0.5;
  const cy = (bounds.min.y + bounds.max.y) * 0.5;
  const cz = (bounds.min.z + bounds.max.z) * 0.5;

  const az = THREE.MathUtils.degToRad(shot.azimuthDeg);
  const el = THREE.MathUtils.degToRad(shot.elevationDeg);
  const viewDir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el)
  ).normalize();

  // Build camera basis right/up vectors to project exact oriented bounding extents
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, viewDir).normalize();
  const up = new THREE.Vector3().crossVectors(viewDir, right).normalize();

  let maxProjX = 2;
  let maxProjY = 2;
  let maxDepthTowardCam = 1;

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
  const dist = Math.max(14, distX, distY);

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
  maxWaitMs = 420
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
    await new Promise<void>((r) => setTimeout(r, 35));
  }
}

interface ActiveCaptureSession {
  requestId: number;
  weaponId: WeaponId;
  edition: MonographEdition;
  plugin: WeaponRuntimePlugin;
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
  captureCam: THREE.PerspectiveCamera;
  rawRgba: Uint8Array;
  canvas2d: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  imageData: ImageData;
}

function applyShotStateToStore(
  weaponId: WeaponId,
  edition: MonographEdition,
  shot: ShotSpec
): void {
  const envPreset: ArmoryEnvironmentPreset =
    edition === 'blueprint_manual' ? 'blueprint_daylight' : 'tactical_vault';

  playbackClock.setFireProgress(0, true);
  playbackClock.setAnimatedFireProgress(0);
  playbackClock.setTargetProgress(shot.explodeT, true);
  playbackClock.setAnimatedProgress(shot.explodeT);

  useAppStore.setState({
    activeWeaponId: weaponId,
    screen: shot.showTurntable ? 'armory' : 'workbench',
    mode: 'explode',
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
    hiddenGroups: {
      slide: false,
      frame: false,
      fire_control: false,
      magazine: false,
    },
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
        640
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

      const canvas2d = document.createElement('canvas');
      canvas2d.width = CAPTURE_W;
      canvas2d.height = CAPTURE_H;
      const ctx2d = canvas2d.getContext('2d')!;
      const imageData = ctx2d.createImageData(CAPTURE_W, CAPTURE_H);
      const rawRgba = new Uint8Array(CAPTURE_W * CAPTURE_H * 4);

      applyShotStateToStore(weaponId, edition, SHOT_PLAN[0]);
      updateMonographCaptureProgress(requestId, 0, SHOT_PLAN[0].key);

      sessionRef.current = {
        requestId,
        weaponId,
        edition,
        plugin,
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

  useFrame(() => {
    const s = sessionRef.current;
    if (!s) return;

    const shot = SHOT_PLAN[s.shotIndex];
    if (!shot) return;

    // Reinforce exact non-damped explode scalar while waiting for PartActor/Environment commit
    playbackClock.setTargetProgress(shot.explodeT, true);
    playbackClock.setAnimatedProgress(shot.explodeT);

    s.settleCounter += 1;
    if (s.settleCounter < SETTLE_FRAMES_PER_SHOT) {
      return;
    }

    // Position camera & render 1920x1200 offscreen studio plate
    scene.updateMatrixWorld(true);
    positionStudioShotCamera(
      s.captureCam,
      s.weaponId,
      s.plugin.parts,
      shot
    );

    // Disable GTAO on pure X-Ray or Stencil cutaway if needed for crisp interior steel clarity
    s.gtaoPass.enabled = !shot.xrayShells;

    const envPreset: ArmoryEnvironmentPreset =
      s.edition === 'blueprint_manual'
        ? 'blueprint_daylight'
        : 'tactical_vault';
    const postParams = getPostProcessingPresetParams(envPreset);
    const prevExposure = gl.toneMappingExposure;
    const prevToneMapping = gl.toneMapping;

    applyRendererToneMapping(
      gl,
      postParams.toneMapping,
      postParams.toneMappingExposure,
      THREE.SRGBColorSpace
    );

    const prevRenderTarget = gl.getRenderTarget();
    try {
      s.composer.render(0.016);
      s.copyPass.render(gl, s.ldrTarget, s.composer.readBuffer, 0, false);
      gl.readRenderTargetPixels(
        s.ldrTarget,
        0,
        0,
        CAPTURE_W,
        CAPTURE_H,
        s.rawRgba
      );
    } finally {
      gl.setRenderTarget(prevRenderTarget);
      applyRendererToneMapping(gl, prevToneMapping, prevExposure);
    }

    // Flip WebGL bottom-up rows into top-down 2D Canvas ImageData (fast typed-array row copy)
    const rowBytes = CAPTURE_W * 4;
    const dst = s.imageData.data;
    for (let y = 0; y < CAPTURE_H; y++) {
      const srcOffset = (CAPTURE_H - 1 - y) * rowBytes;
      const dstOffset = y * rowBytes;
      dst.set(s.rawRgba.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
    }
    s.ctx2d.putImageData(s.imageData, 0, 0);
    s.plates[shot.key] = s.canvas2d.toDataURL('image/jpeg', 0.92);

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
    if (completedCount < SHOT_PLAN.length) {
      const nextShot = SHOT_PLAN[completedCount];
      s.shotIndex = completedCount;
      s.settleCounter = 0;
      applyShotStateToStore(s.weaponId, s.edition, nextShot);
      updateMonographCaptureProgress(s.requestId, completedCount, nextShot.key);
      return;
    }

    // All 5 high-DPI plates captured: clean up GPU targets, restore user state & publish bundle
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
