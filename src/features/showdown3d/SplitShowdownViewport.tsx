import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { getArmoryEnvironment } from '../../engine/canvas/GunsmithStageMat';
import { loadStudioHdriTexture } from '../../engine/canvas/studioHdriManager';
import { playbackClock } from '../../engine/clock/playbackClock';
import {
  getCachedPartGeometry,
  useWeaponGeometries,
} from '../../engine/geometry/geometryService';
import { MagazineAmmoStack } from '../../engine/actors/MagazineAmmoStack';
import { PartActor } from '../../engine/actors/PartActor';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { useWeaponPlugin } from '../../weapons/registry';
import type { WeaponId, WeaponScaleProfile } from '../../weapons/types';
import {
  computeSplitCameraFraming,
  computeSplitViewportRects,
  SPLIT_CAMERA_FOV_DEG,
  splitShowdownCameraStore,
  type SplitViewportLayout,
} from './splitShowdownCamera';

const SPLIT_FIRING_RATE = 0.42;

/**
 * Generates a soft radial studio floor vignette texture fading cleanly from a subtle
 * architectural pool into full alpha transparency at the rim (zero harsh square borders).
 * Caller owns `.dispose()`.
 */
function createSplitStageVignetteTexture(
  isLightStudio: boolean
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const half = size * 0.5;
  const grad = ctx.createRadialGradient(half, half, 8, half, half, half);
  if (isLightStudio) {
    grad.addColorStop(0, 'rgba(148, 163, 184, 0.34)');
    grad.addColorStop(0.55, 'rgba(203, 213, 225, 0.16)');
    grad.addColorStop(1, 'rgba(226, 232, 240, 0)');
  } else {
    grad.addColorStop(0, 'rgba(30, 58, 95, 0.44)');
    grad.addColorStop(0.52, 'rgba(15, 23, 42, 0.24)');
    grad.addColorStop(1, 'rgba(5, 8, 15, 0)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function applyVirtualSceneEnv(
  targetScene: THREE.Scene,
  bgColor: string,
  envTex: THREE.Texture | null,
  envIntensity: number
): void {
  targetScene.background = new THREE.Color(bgColor);
  if (envTex) {
    targetScene.environment = envTex;
    targetScene.environmentIntensity = envIntensity;
  }
}

function configureSplitCamera(
  cam: THREE.PerspectiveCamera,
  weaponId: WeaponId,
  animT: number,
  aspect: number,
  azimuth: number,
  polar: number,
  zoom: number
): void {
  const frame = computeSplitCameraFraming(
    weaponId,
    animT,
    aspect,
    azimuth,
    polar,
    zoom
  );
  cam.aspect = aspect;
  cam.near = frame.near;
  cam.far = frame.far;
  cam.position.set(...frame.position);
  cam.lookAt(...frame.target);
  cam.updateProjectionMatrix();
}

function syncSplitRendererTone(
  renderer: THREE.WebGLRenderer,
  exposure: number
): void {
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = exposure;
}

function renderSplitScissorFrame(
  renderer: THREE.WebGLRenderer,
  cssW: number,
  cssH: number,
  layout: SplitViewportLayout,
  sceneA: THREE.Scene,
  camA: THREE.PerspectiveCamera,
  sceneB: THREE.Scene,
  camB: THREE.PerspectiveCamera
): void {
  const { rectA, rectB } = layout;
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, cssW, cssH);
  renderer.clear(true, true, true);
  renderer.setScissorTest(true);

  renderer.setViewport(rectA.x, rectA.y, rectA.width, rectA.height);
  renderer.setScissor(rectA.x, rectA.y, rectA.width, rectA.height);
  renderer.clearDepth();
  renderer.clearStencil();
  renderer.render(sceneA, camA);

  renderer.setViewport(rectB.x, rectB.y, rectB.width, rectB.height);
  renderer.setScissor(rectB.x, rectB.y, rectB.width, rectB.height);
  renderer.clearDepth();
  renderer.clearStencil();
  renderer.render(sceneB, camB);

  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, cssW, cssH);
  renderer.autoClear = prevAutoClear;
}

interface SplitSideSceneProps {
  weaponId: WeaponId;
  virtualScene: THREE.Scene;
  envPreset: ReturnType<typeof getArmoryEnvironment>;
  onEnvReady: (
    scene: THREE.Scene,
    bgColor: string,
    tex: THREE.Texture | null,
    intensity: number
  ) => void;
}

const SplitWeaponSidePortal: React.FC<SplitSideSceneProps> = ({
  weaponId,
  virtualScene,
  envPreset,
  onEnvReady,
}) => {
  const { gl } = useThree();
  const plugin = useWeaponPlugin(weaponId);
  useWeaponGeometries(weaponId, plugin?.parts ?? null);

  const manifest = getWeaponManifest(weaponId);
  const scaleProfile: WeaponScaleProfile = manifest.workbenchMeta.scaleProfile;
  const isTank = scaleProfile === 'main_battle_tank';
  const k = isTank ? 10 : 1;
  const isLightStudio = envPreset.id === 'blueprint_daylight';

  const stageVignetteTex = useMemo(
    () => createSplitStageVignetteTexture(isLightStudio),
    [isLightStudio]
  );
  useEffect(() => {
    return () => {
      stageVignetteTex?.dispose();
    };
  }, [stageVignetteTex]);

  const floorY = manifest.workbenchMeta.gridY;
  const floorX = manifest.cameraPresets.iso.target[0];
  const floorZ = manifest.cameraPresets.iso.target[2];
  const gridCenterColor = isLightStudio ? '#64748b' : '#1e3a5f';
  const gridSubColor = isLightStudio ? '#cbd5e1' : '#101d30';

  useEffect(() => {
    let alive = true;
    const intensity = isTank ? 1.26 : 1.2;
    onEnvReady(virtualScene, envPreset.background, null, intensity);
    void loadStudioHdriTexture(gl, envPreset.id, scaleProfile).then((tex) => {
      if (alive && tex) {
        onEnvReady(virtualScene, envPreset.background, tex, intensity);
      }
    });
    return () => {
      alive = false;
    };
  }, [gl, virtualScene, envPreset.id, envPreset.background, scaleProfile, isTank, onEnvReady]);

  const parts = plugin?.parts ?? [];

  return createPortal(
    <>
      <ambientLight
        color={envPreset.ambient.color}
        intensity={envPreset.ambient.intensity * 1.4}
      />
      <hemisphereLight
        args={[
          envPreset.hemisphere.skyColor,
          envPreset.hemisphere.groundColor,
          envPreset.hemisphere.intensity * 1.25,
        ]}
      />
      <directionalLight
        color={envPreset.keyLight.color}
        intensity={envPreset.keyLight.intensity}
        position={[
          envPreset.keyLight.position[0] * k,
          envPreset.keyLight.position[1] * k,
          envPreset.keyLight.position[2] * k,
        ]}
      />
      <directionalLight
        color={envPreset.rimLight.color}
        intensity={envPreset.rimLight.intensity}
        position={[
          envPreset.rimLight.position[0] * k,
          envPreset.rimLight.position[1] * k,
          envPreset.rimLight.position[2] * k,
        ]}
      />
      <directionalLight
        color={envPreset.fillLight.color}
        intensity={envPreset.fillLight.intensity}
        position={[
          envPreset.fillLight.position[0] * k,
          envPreset.fillLight.position[1] * k,
          envPreset.fillLight.position[2] * k,
        ]}
      />

      {/* Subtle Studio Floor Grid & Soft Radial Depth Vignette */}
      <group position={[floorX, floorY, floorZ]}>
        {stageVignetteTex && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05 * k, 0]}>
            <circleGeometry args={[115 * k, 48]} />
            <meshBasicMaterial
              map={stageVignetteTex}
              transparent
              depthWrite={false}
            />
          </mesh>
        )}
        <gridHelper
          args={[160 * k, 24, gridCenterColor, gridSubColor]}
          position={[0, 0, 0]}
        />
      </group>

      {plugin && (
        <>
          {parts.map((part) => (
            <PartActor
              key={`${weaponId}:${part.id}`}
              weaponId={weaponId}
              part={part}
              geometry={getCachedPartGeometry(weaponId, part.id)}
              customPbrBinding={plugin.pbrBindings[part.id]}
              computeKinematics={plugin.computeFiringKinematics}
            />
          ))}
          <MagazineAmmoStack weaponIdOverride={weaponId} />
        </>
      )}
    </>,
    virtualScene
  );
};

interface SplitRig {
  sceneA: THREE.Scene;
  sceneB: THREE.Scene;
  camA: THREE.PerspectiveCamera;
  camB: THREE.PerspectiveCamera;
}

/**
 * Dual-viewport scissor renderer running inside the single persistent WebGL `<Canvas>`.
 * Renders Left (Slot A) and Right (Slot B) exhibits simultaneously at 60 FPS with shared
 * playback timing, synchronized tri-axial CT cutaway, X-Ray, functional tinting & AgX HDR.
 */
export const SplitShowdownViewport: React.FC = () => {
  const { get: getThree, size } = useThree();
  const weaponA = useAppStore((s) => s.splitShowdownWeaponA);
  const weaponB = useAppStore((s) => s.splitShowdownWeaponB);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const envCfg = getArmoryEnvironment(environmentPreset);

  const [rig] = useState<SplitRig>(() => ({
    sceneA: new THREE.Scene(),
    sceneB: new THREE.Scene(),
    camA: new THREE.PerspectiveCamera(SPLIT_CAMERA_FOV_DEG, 1, 0.1, 1200),
    camB: new THREE.PerspectiveCamera(SPLIT_CAMERA_FOV_DEG, 1, 0.1, 1200),
  }));
  const rigRef = useRef<SplitRig>(rig);

  useEffect(() => {
    syncSplitRendererTone(getThree().gl, envCfg.toneMappingExposure);
  }, [getThree, envCfg.toneMappingExposure]);

  // Priority 1 replaces R3F default single-scene render while screen === 'split_showdown'
  useFrame((r3fState, delta) => {
    const dt = Math.min(delta, 0.05);
    const st = useAppStore.getState();

    // Advance shared playback timeline cleanly at 60 FPS
    if (st.mode === 'explode') {
      if (st.isPlaying) {
        const cur = playbackClock.getState().targetProgress;
        let nextT = cur + st.playDirection * st.playSpeed * dt;
        if (nextT >= 1) {
          nextT = 1;
          st.stopPlay();
        } else if (nextT <= 0) {
          nextT = 0;
          st.stopPlay();
        }
        playbackClock.setTargetProgress(nextT);
      }
    } else {
      if (st.isFiringPlaying) {
        const step = SPLIT_FIRING_RATE * st.fireSpeedMultiplier * dt;
        const nextF = playbackClock.getState().fireProgress + step;
        if (nextF >= 1) {
          if (st.fireLoop) {
            playbackClock.setFireProgress(nextF - Math.floor(nextF), true);
          } else {
            playbackClock.setFireProgress(1);
            st.stopFiringPlay();
          }
        } else {
          playbackClock.setFireProgress(nextF);
        }
      }
      const fc = playbackClock.getState();
      if (Math.abs(fc.fireProgress - fc.animatedFireProgress) > 0.5) {
        playbackClock.setAnimatedFireProgress(fc.fireProgress);
      } else {
        playbackClock.setAnimatedFireProgress(
          THREE.MathUtils.damp(
            fc.animatedFireProgress,
            fc.fireProgress,
            st.isFiringPlaying ? 24 : 12,
            dt
          )
        );
      }
    }
    const nextAnimT = THREE.MathUtils.damp(
      playbackClock.getState().animatedProgress,
      playbackClock.getState().targetProgress,
      7.0,
      dt
    );
    playbackClock.setAnimatedProgress(nextAnimT);

    const cssW = Math.max(2, size.width);
    const cssH = Math.max(2, size.height);
    const layout = computeSplitViewportRects(cssW, cssH);
    const activeRig = rigRef.current;

    configureSplitCamera(
      activeRig.camA,
      st.splitShowdownWeaponA,
      nextAnimT,
      layout.rectA.aspect,
      splitShowdownCameraStore.poseA.azimuth,
      splitShowdownCameraStore.poseA.polar,
      splitShowdownCameraStore.poseA.zoom
    );
    configureSplitCamera(
      activeRig.camB,
      st.splitShowdownWeaponB,
      nextAnimT,
      layout.rectB.aspect,
      splitShowdownCameraStore.poseB.azimuth,
      splitShowdownCameraStore.poseB.polar,
      splitShowdownCameraStore.poseB.zoom
    );

    renderSplitScissorFrame(
      r3fState.gl,
      cssW,
      cssH,
      layout,
      activeRig.sceneA,
      activeRig.camA,
      activeRig.sceneB,
      activeRig.camB
    );
  }, 1);

  return (
    <>
      <SplitWeaponSidePortal
        weaponId={weaponA}
        virtualScene={rig.sceneA}
        envPreset={envCfg}
        onEnvReady={applyVirtualSceneEnv}
      />
      <SplitWeaponSidePortal
        weaponId={weaponB}
        virtualScene={rig.sceneB}
        envPreset={envCfg}
        onEnvReady={applyVirtualSceneEnv}
      />
    </>
  );
};
