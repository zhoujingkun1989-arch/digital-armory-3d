import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  Camera,
  Crosshair,
  Eye,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Target,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import { ViewportErrorBoundary } from '../../app/ViewportErrorBoundary';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  computeBuckshotPatternRadiusMm,
  type BallisticSolution,
} from '../../engine/physics/externalBallistics';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';
import { EXTERNAL_BALLISTICS_STRINGS } from './externalBallisticsStrings';
import {
  playBallisticGelThump,
  playDirtBermMiss,
  playRangeMuzzleLaunch,
  playSteelTargetPing,
} from './range3DAudio';
import {
  buildRangeTrajectory3D,
  computeWindFlagStates,
  createMutableCameraPose3D,
  createMutableProjectilePose3D,
  evaluateGelCavityPulse01,
  evaluateRangeCameraPoseInto,
  evaluateSteelPendulumAngle,
  evaluateWindFlagFlutterOffset,
  FIRING_LINE_HEIGHT_M,
  GEL_BLOCK_HEIGHT_CM,
  GEL_BLOCK_LENGTH_CM,
  GEL_BLOCK_WIDTH_CM,
  RANGE_AIM_MODES,
  RANGE_CAMERA_MODES,
  RANGE_SPEED_OPTIONS,
  RANGE_TARGET_TYPES,
  sampleProjectilePoseAtTimeInto,
  writeMachGradientColorRGB,
  type ProjectilePose3D,
  type Range3DPoint,
  type RangeAimMode,
  type RangeCameraMode,
  type RangeSpeedMultiplier,
  type RangeTargetType,
  type RangeTrajectory3D,
  type WindFlagState,
} from './range3DMath';

export interface Range3DSceneProps {
  focusedSolution: BallisticSolution;
  comparisonSolutions: readonly BallisticSolution[];
  slotColors: readonly string[];
  maxRangeM: number;
  targetRangeM: number;
  signedCrosswindMps: number;
  lang: LanguageCode;
  isLightTheme: boolean;
  expanded?: boolean;
}

interface SimClockState {
  simTimeS: number;
  playing: boolean;
  speed: RangeSpeedMultiplier;
  cameraMode: RangeCameraMode;
  flirEnabled: boolean;
  impactTriggered: boolean;
  overviewNeedsFrame: boolean;
  audioMuted: boolean;
  audioTimerId: number | null;
}

interface HudDomRefs {
  scrubber: HTMLInputElement | null;
  timeText: HTMLElement | null;
  rangeText: HTMLElement | null;
  velMachText: HTMLElement | null;
  energyText: HTMLElement | null;
  dropWindText: HTMLElement | null;
  statusText: HTMLElement | null;
  acousticText: HTMLElement | null;
}

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

// Module-level reusable scratch primitives (Zero-GC inside useFrame)
const _poseScratch = createMutableProjectilePose3D();
const _camPoseScratch = createMutableCameraPose3D();
const _camGoalPos = new THREE.Vector3();
const _camGoalLook = new THREE.Vector3();
const _eulerScratch = new THREE.Euler(0, 0, 0, 'YZX');
const _sparkDummy = new THREE.Object3D();
const _tmpColor = new THREE.Color();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);

const SPARK_COUNT_MAX = 48;
const FLAG_SEGMENTS = 10;
const FLAG_LENGTH_M = 2.65;
const FLAG_HEIGHT_M = 0.72;
/** High-visibility proving-ground yardage gates along the 1,000m firing corridor */
const PROVING_GROUND_GATE_MARKERS_M = [100, 300, 600, 1000] as const;

// Deterministic spark burst velocities for AR500 steel impact
interface SparkSeed {
  vx: number;
  vy: number;
  vz: number;
  lifeS: number;
  size: number;
}

const SPARK_SEEDS: readonly SparkSeed[] = (() => {
  const out: SparkSeed[] = [];
  let s = 0x91e10da5;
  const nextRand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = 0; i < SPARK_COUNT_MAX; i++) {
    const theta = nextRand() * Math.PI * 2;
    const speed = 3.2 + nextRand() * 11.5;
    const backBias = -(0.8 + nextRand() * 3.6);
    out.push({
      vx: backBias,
      vy: Math.sin(theta) * speed * 0.72 + 1.5 + nextRand() * 2.0,
      vz: Math.cos(theta) * speed,
      lifeS: 0.22 + nextRand() * 0.48,
      size: 0.007 + nextRand() * 0.009,
    });
  }
  return out;
})();

// 9-pellet 00 Buckshot normalized rosette offsets
const BUCKSHOT_OFFSETS: readonly [number, number][] = [
  [0, 0],
  [0.62, 0],
  [-0.62, 0],
  [0.31, 0.54],
  [-0.31, 0.54],
  [0.31, -0.54],
  [-0.31, -0.54],
  [0.88, 0.42],
  [-0.86, -0.44],
];

function formatCompactEnergy(energyJ: number): string {
  if (energyJ >= 1_000_000) return `${(energyJ / 1_000_000).toFixed(2)} MJ`;
  if (energyJ >= 1000) return `${Math.round(energyJ).toLocaleString('en-US')} J`;
  return `${Math.round(energyJ)} J`;
}

function formatSignedCm(valCm: number): string {
  if (Math.abs(valCm) < 0.05) return '0.0 cm';
  if (Math.abs(valCm) >= 200) {
    return `${valCm > 0 ? '+' : ''}${(valCm / 100).toFixed(2)} m`;
  }
  return `${valCm > 0 ? '+' : ''}${valCm.toFixed(1)} cm`;
}

/** Deterministic high-desert / alpine proving ground terrain heightfield. */
function sampleTerrainHeight(x: number, z: number): number {
  const absZ = Math.abs(z);
  // Keep firing lane flat within |z| <= 17 m up to 1,035 m
  const corridorBlend = THREE.MathUtils.smoothstep(absZ, 16, 46);
  const backBerm = THREE.MathUtils.smoothstep(x, 1028, 1110) * 34;

  const ridgeA =
    Math.sin(x * 0.0082 + 0.6) * Math.cos(z * 0.011) * 14 +
    Math.sin(x * 0.019 - z * 0.014) * 5.2;
  const alpinePeaks =
    Math.pow(THREE.MathUtils.smoothstep(absZ, 55, 290), 1.45) *
    (52 +
      24 * Math.sin(x * 0.0055 + z * 0.004) +
      14 * Math.cos(x * 0.013 - z * 0.009));

  const desertFloor = Math.max(0, ridgeA * 0.5 + 4.8) * corridorBlend;
  const backMountains =
    THREE.MathUtils.smoothstep(x, 1045, 1195) *
    (44 + 18 * Math.sin(z * 0.012 + 0.9) + 9 * Math.cos(z * 0.028));

  return desertFloor + alpinePeaks + backBerm * 0.65 + backMountains;
}

/** Builds a smooth procedural vertex-colored proving ground BufferGeometry. */
function createProvingGroundGeometry(): THREE.BufferGeometry {
  const segX = 96;
  const segZ = 64;
  const widthX = 1280; // X in [-80 .. 1200]
  const widthZ = 680; // Z in [-340 .. +340]
  const geo = new THREE.PlaneGeometry(widthX, widthZ, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + 560;
    const z = pos.getZ(i);
    const y = sampleTerrainHeight(x, z);
    pos.setXYZ(i, x, y, z);

    const absZ = Math.abs(z);
    if (absZ < 14.5 && x >= -18 && x <= 1025) {
      // Compacted proving-ground gravel firing corridor
      const laneEdge = THREE.MathUtils.smoothstep(absZ, 10.5, 14.5);
      c.setRGB(
        0.34 + laneEdge * 0.12,
        0.32 + laneEdge * 0.09,
        0.29 + laneEdge * 0.05
      );
    } else if (y > 46) {
      // High-altitude alpine snow-dusted ridge
      const snowT = THREE.MathUtils.smoothstep(y, 46, 78);
      c.setRGB(
        0.36 + snowT * 0.44,
        0.37 + snowT * 0.45,
        0.4 + snowT * 0.45
      );
    } else if (y > 16) {
      // Stratified desert mesa & granite rock
      const rockT = THREE.MathUtils.smoothstep(y, 16, 46);
      c.setRGB(
        0.48 - rockT * 0.14,
        0.41 - rockT * 0.06,
        0.31 + rockT * 0.08
      );
    } else {
      // Arid ochre sand & sagebrush scrub
      const scrub = 0.5 + 0.5 * Math.sin(x * 0.065) * Math.cos(z * 0.075);
      c.setRGB(
        0.52 - scrub * 0.11,
        0.44 - scrub * 0.04,
        0.32 - scrub * 0.03
      );
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Builds a smooth Mach-gradient colored cylindrical trajectory ribbon along RK4 samples. */
function buildMachTrajectoryTubeGeometry(
  points: readonly Range3DPoint[],
  radius: number,
  radialSegments = 8
): THREE.BufferGeometry {
  const n = points.length;
  const geo = new THREE.BufferGeometry();
  if (n < 2) {
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(0), 3)
    );
    return geo;
  }

  const ringStride = radialSegments + 1;
  const positions = new Float32Array(n * ringStride * 3);
  const normals = new Float32Array(n * ringStride * 3);
  const colors = new Float32Array(n * ringStride * 3);
  const indices: number[] = [];

  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const rgb: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    const pPrev = points[Math.max(0, i - 1)];
    const pNext = points[Math.min(n - 1, i + 1)];
    tangent.set(pNext.x - pPrev.x, pNext.y - pPrev.y, pNext.z - pPrev.z);
    if (tangent.lengthSq() < 1e-10) {
      tangent.set(1, 0, 0);
    } else {
      tangent.normalize();
    }

    binormal.crossVectors(tangent, _upAxis);
    if (binormal.lengthSq() < 1e-6) {
      binormal.set(0, 0, 1);
    } else {
      binormal.normalize();
    }
    normal.crossVectors(binormal, tangent).normalize();

    const pt = points[i];
    writeMachGradientColorRGB(pt.mach, rgb);

    for (let j = 0; j <= radialSegments; j++) {
      const ang = (j / radialSegments) * Math.PI * 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);

      const nx = binormal.x * cosA + normal.x * sinA;
      const ny = binormal.y * cosA + normal.y * sinA;
      const nz = binormal.z * cosA + normal.z * sinA;

      const vIdx = (i * ringStride + j) * 3;
      positions[vIdx] = pt.x + nx * radius;
      positions[vIdx + 1] = pt.y + ny * radius;
      positions[vIdx + 2] = pt.z + nz * radius;

      normals[vIdx] = nx;
      normals[vIdx + 1] = ny;
      normals[vIdx + 2] = nz;

      colors[vIdx] = rgb[0];
      colors[vIdx + 1] = rgb[1];
      colors[vIdx + 2] = rgb[2];
    }
  }

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}

/** Creates a crisp high-contrast CanvasTexture for range yardage boards (e.g. `500m`). */
function createYardageSignTexture(
  label: string,
  accentHex = '#f59e0b'
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 128);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 240, 112);

  ctx.fillStyle = accentHex;
  ctx.fillRect(14, 14, 228, 16);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 54px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 76);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates paired procedural desert gravel-rock albedo (`SRGBColorSpace`) and
 * linear micro-bump (`NoColorSpace`) CanvasTextures for the 1,000m proving ground.
 * Caller owns `.dispose()` for both textures.
 */
function createProvingGroundTerrainTextures(): {
  albedoTex: THREE.CanvasTexture;
  bumpTex: THREE.CanvasTexture;
} | null {
  if (typeof document === 'undefined') return null;
  const size = 512;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  if (!aCtx || !bCtx) return null;

  // Base neutral-warm compacted soil & gravel tone (multiplies smoothly with vertex colors)
  aCtx.fillStyle = '#dcd5ca';
  aCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Deterministic LCG PRNG for reproducible high-contrast gravel, pebbles & stratified sedimentary grain
  let seed = 0x51a7f3c9;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  // Subtle horizontal sedimentary striations & wind-swept dust bands
  for (let i = 0; i < 64; i++) {
    const y = rand() * size;
    const h = 2 + rand() * 8;
    const shade = Math.round(196 + (rand() - 0.5) * 44);
    aCtx.fillStyle = `rgba(${shade}, ${shade - 7}, ${shade - 18}, 0.24)`;
    aCtx.fillRect(0, y, size, h);
    const bShade = Math.round(128 + (rand() - 0.5) * 48);
    bCtx.fillStyle = `rgba(${bShade}, ${bShade}, ${bShade}, 0.22)`;
    bCtx.fillRect(0, y, size, h);
  }

  // Multi-scale desert pebbles & crushed gravel chips
  for (let i = 0; i < 3600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.8 + rand() * 2.8;
    const bright = rand() > 0.45;
    const tone = bright
      ? Math.round(212 + rand() * 38)
      : Math.round(115 + rand() * 58);
    aCtx.fillStyle = `rgba(${tone}, ${Math.max(0, tone - 8)}, ${Math.max(0, tone - 18)}, ${0.28 + rand() * 0.42})`;
    aCtx.beginPath();
    aCtx.arc(x, y, r, 0, Math.PI * 2);
    aCtx.fill();

    const bumpVal = bright
      ? Math.round(165 + rand() * 80)
      : Math.round(45 + rand() * 75);
    bCtx.fillStyle = `rgba(${bumpVal}, ${bumpVal}, ${bumpVal}, 0.55)`;
    bCtx.beginPath();
    bCtx.arc(x, y, r * 1.08, 0, Math.PI * 2);
    bCtx.fill();
  }

  const albedoTex = new THREE.CanvasTexture(albedoCanvas);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.wrapS = THREE.RepeatWrapping;
  albedoTex.wrapT = THREE.RepeatWrapping;
  albedoTex.repeat.set(44, 24);
  albedoTex.anisotropy = 4;
  albedoTex.needsUpdate = true;

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.colorSpace = THREE.NoColorSpace;
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(44, 24);
  bumpTex.anisotropy = 4;
  bumpTex.needsUpdate = true;

  return { albedoTex, bumpTex };
}

/**
 * Generates an atmospheric horizon sky dome CanvasTexture (`SRGBColorSpace`)
 * adapting seamlessly across Daylight, Tactical Dusk, and FLIR Thermal modes.
 * Caller owns `.dispose()`.
 */
function createAtmosphericSkyTexture(
  isLightTheme: boolean,
  flirActive: boolean
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  if (flirActive) {
    grad.addColorStop(0.0, '#0a1019');
    grad.addColorStop(0.38, '#131d2b');
    grad.addColorStop(0.51, '#26364b');
    grad.addColorStop(0.56, '#1b2636');
    grad.addColorStop(1.0, '#0d141f');
  } else if (isLightTheme) {
    grad.addColorStop(0.0, '#1d5696');
    grad.addColorStop(0.28, '#5394cc');
    grad.addColorStop(0.45, '#a8cde9');
    grad.addColorStop(0.5, '#ead8c0');
    grad.addColorStop(0.54, '#cbb190');
    grad.addColorStop(1.0, '#8d755a');
  } else {
    grad.addColorStop(0.0, '#070e1c');
    grad.addColorStop(0.28, '#10203a');
    grad.addColorStop(0.45, '#243a59');
    grad.addColorStop(0.5, '#4c5163');
    grad.addColorStop(0.54, '#2a3344');
    grad.addColorStop(1.0, '#121826');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle solar / twilight atmospheric scatter glow above the downrange horizon
  if (!flirActive) {
    const sunGrad = ctx.createRadialGradient(340, 232, 6, 340, 232, 118);
    if (isLightTheme) {
      sunGrad.addColorStop(0, 'rgba(255, 251, 235, 0.72)');
      sunGrad.addColorStop(0.35, 'rgba(254, 240, 200, 0.28)');
      sunGrad.addColorStop(1, 'rgba(254, 240, 200, 0)');
    } else {
      sunGrad.addColorStop(0, 'rgba(251, 191, 36, 0.34)');
      sunGrad.addColorStop(0.4, 'rgba(245, 158, 11, 0.12)');
      sunGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    }
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, 512, 512);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Creates a high-vis painted AR500 steel gong plate face texture with rings & center bullseye. */
function createSteelGongFaceTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Slightly weathered high-vis off-white painted AR500 steel
  const grad = ctx.createRadialGradient(256, 256, 12, 256, 256, 256);
  grad.addColorStop(0, '#f8fafc');
  grad.addColorStop(0.78, '#e2e8f0');
  grad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle concentric scoring rings
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(256, 256, 185, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(256, 256, 125, 0, Math.PI * 2);
  ctx.stroke();

  // High-vis orange-red bullseye center (32% radius)
  ctx.fillStyle = '#ea580c';
  ctx.beginPath();
  ctx.arc(256, 256, 78, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff7ed';
  ctx.beginPath();
  ctx.arc(256, 256, 22, 0, Math.PI * 2);
  ctx.fill();

  // Stenciled crosshair ticks
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(256, 24);
  ctx.lineTo(256, 86);
  ctx.moveTo(256, 426);
  ctx.lineTo(256, 488);
  ctx.moveTo(24, 256);
  ctx.lineTo(86, 256);
  ctx.moveTo(426, 256);
  ctx.lineTo(488, 256);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ============================================================================
// Sub-component: Yardage Marker Board (cleanly disposes its CanvasTexture)
// ============================================================================
const YardageMarkerBoard: React.FC<{
  rangeM: number;
  isTargetMarker?: boolean;
  flirActive: boolean;
}> = ({ rangeM, isTargetMarker = false, flirActive }) => {
  const texture = useMemo(
    () =>
      createYardageSignTexture(
        `${Math.round(rangeM)}m`,
        isTargetMarker ? '#22d3ee' : '#f59e0b'
      ),
    [rangeM, isTargetMarker]
  );

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  const zSide = isTargetMarker ? 8.8 : -12.2;
  const mirrorZ = isTargetMarker ? -12.2 : 12.2;
  const beaconColor = flirActive
    ? isTargetMarker
      ? '#f8fafc'
      : '#94a3b8'
    : isTargetMarker
      ? '#22d3ee'
      : '#f59e0b';

  return (
    <group position={[rangeM, 0, 0]}>
      {/* Painted range distance transverse stripe across compacted gravel corridor */}
      <mesh
        position={[0, 0.045, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[isTargetMarker ? 0.62 : 0.36, 23.6]} />
        <meshBasicMaterial
          color={
            flirActive
              ? isTargetMarker
                ? '#e2e8f0'
                : '#475569'
              : isTargetMarker
                ? '#38bdf8'
                : '#f8fafc'
          }
          transparent
          opacity={isTargetMarker ? 0.78 : 0.42}
        />
      </mesh>

      {/* Opposite Flanking Proving-Ground Gate Pylon with High-Vis Range Beacon */}
      <group position={[0, 0, mirrorZ]}>
        <mesh position={[0, 1.85, 0]}>
          <boxGeometry args={[0.24, 3.7, 0.24]} />
          <meshStandardMaterial
            color={flirActive ? '#3b4d63' : '#334155'}
            metalness={0.55}
            roughness={0.48}
          />
        </mesh>
        <mesh position={[0, 3.45, 0]}>
          <boxGeometry args={[0.3, 0.62, 0.3]} />
          <meshStandardMaterial
            color={beaconColor}
            emissive={beaconColor}
            emissiveIntensity={flirActive ? 0.55 : 0.42}
            roughness={0.35}
          />
        </mesh>
      </group>

      {/* Primary High-Visibility Yardage Gate Signboard angled toward shooter & overview cam */}
      <group position={[0, 0, zSide]} rotation={[0, -Math.PI * 0.34, 0]}>
        <mesh position={[-1.35, 1.75, 0]}>
          <cylinderGeometry args={[0.085, 0.1, 3.5, 8]} />
          <meshStandardMaterial
            color={flirActive ? '#334155' : '#475569'}
            metalness={0.6}
            roughness={0.5}
          />
        </mesh>
        <mesh position={[1.35, 1.75, 0]}>
          <cylinderGeometry args={[0.085, 0.1, 3.5, 8]} />
          <meshStandardMaterial
            color={flirActive ? '#334155' : '#475569'}
            metalness={0.6}
            roughness={0.5}
          />
        </mesh>
        <mesh position={[0, 3.05, 0]}>
          <boxGeometry args={[3.6, 1.8, 0.16]} />
          <meshStandardMaterial
            color={flirActive ? '#334155' : '#ffffff'}
            map={flirActive ? null : texture ?? undefined}
            emissive={
              flirActive
                ? isTargetMarker
                  ? '#cbd5e1'
                  : '#475569'
                : '#1e293b'
            }
            emissiveIntensity={flirActive ? 0.5 : 0.28}
            roughness={0.45}
            metalness={0.12}
          />
        </mesh>
      </group>
    </group>
  );
};

// ============================================================================
// Sub-component: Animated Range Wind Flags (Zero-GC cloth wave in useFrame)
// ============================================================================
const AnimatedWindFlags: React.FC<{
  flags: readonly WindFlagState[];
  flirActive: boolean;
}> = ({ flags, flirActive }) => {
  const clothMeshesRef = useRef<(THREE.Mesh | null)[]>([]);

  const flagGeometries = useMemo(() => {
    return flags.map(() => {
      // Plane initially extending along +Z (len) and Y (height)
      const geo = new THREE.PlaneGeometry(
        FLAG_LENGTH_M,
        FLAG_HEIGHT_M,
        FLAG_SEGMENTS,
        1
      );
      // Shift X from [-L/2..L/2] -> [0..L], then map X -> +Z
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const localU = pos.getX(i) + FLAG_LENGTH_M * 0.5;
        const localY = pos.getY(i);
        // Taper tail slightly like a military range windsock streamer
        const taper = 1 - (localU / FLAG_LENGTH_M) * 0.36;
        pos.setXYZ(i, 0, localY * taper, localU);
      }
      geo.computeVertexNormals();
      return geo;
    });
  }, [flags]);

  useEffect(() => {
    return () => {
      for (const g of flagGeometries) {
        g.dispose();
      }
    };
  }, [flagGeometries]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let fIdx = 0; fIdx < flags.length; fIdx++) {
      const mesh = clothMeshesRef.current[fIdx];
      if (!mesh) continue;
      const flag = flags[fIdx];
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
      const cols = FLAG_SEGMENTS + 1;
      const cosDroop = Math.cos(flag.droopRad);
      const sinDroop = Math.sin(flag.droopRad);
      const phase = fIdx * 1.37;

      for (let col = 0; col < cols; col++) {
        const u = col / FLAG_SEGMENTS;
        const dist = u * FLAG_LENGTH_M;
        const zExt = dist * cosDroop;
        const yDrop = -dist * sinDroop;
        const flutter = evaluateWindFlagFlutterOffset(flag, u, t, phase);
        const halfH = FLAG_HEIGHT_M * 0.5 * (1 - u * 0.36);

        // Top row index = col, bottom row index = cols + col
        pos.setXYZ(col, flutter, yDrop + halfH, zExt);
        pos.setXYZ(cols + col, flutter * 1.06, yDrop - halfH, zExt);
      }
      pos.needsUpdate = true;
    }
  });

  return (
    <group>
      {flags.map((flag, idx) => (
        <group key={flag.rangeM} position={[flag.rangeM, 0, flag.lateralZ]}>
          {/* Galvanized range pole */}
          <mesh position={[0, 2.75, 0]}>
            <cylinderGeometry args={[0.055, 0.075, 5.5, 8]} />
            <meshStandardMaterial
              color={flirActive ? '#334155' : '#94a3b8'}
              metalness={0.75}
              roughness={0.35}
            />
          </mesh>
          {/* Pole cap */}
          <mesh position={[0, 5.55, 0]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial
              color={flirActive ? '#64748b' : '#f97316'}
              roughness={0.4}
            />
          </mesh>
          {/* Pennant pivoted around pole top by wind yaw */}
          <group position={[0, 5.12, 0]} rotation={[0, flag.yawRad, 0]}>
            <mesh
              ref={(el) => {
                clothMeshesRef.current[idx] = el;
              }}
              geometry={flagGeometries[idx]}
            >
              <meshStandardMaterial
                color={flirActive ? '#cbd5e1' : '#f97316'}
                emissive={flirActive ? '#64748b' : '#ea580c'}
                emissiveIntensity={flirActive ? 0.35 : 0.28}
                side={THREE.DoubleSide}
                roughness={0.72}
              />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
};

// ============================================================================
// Sub-component: Animated 3D Projectile Mesh + Bow Shock Cone + Tracer Wake
// ============================================================================
const ProjectileVisualMesh: React.FC<{
  traj: RangeTrajectory3D;
  flirActive: boolean;
  simRef: React.MutableRefObject<SimClockState>;
}> = ({ traj, flirActive, simRef }) => {
  const rootRef = useRef<THREE.Group>(null);
  const spinGroupRef = useRef<THREE.Group>(null);
  const bowShockRef = useRef<THREE.Mesh>(null);
  const tracerRef = useRef<THREE.Mesh>(null);
  const buckRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Lathe-turned spitzer boat-tail bullet geometry (nose oriented along +X)
  const spitzerGeo = useMemo(() => {
    const pts: THREE.Vector2[] = [
      new THREE.Vector2(0.0, -0.055),
      new THREE.Vector2(0.011, -0.055), // Boat-tail base
      new THREE.Vector2(0.0155, -0.036), // Bearing shank
      new THREE.Vector2(0.0155, -0.012),
      new THREE.Vector2(0.0144, -0.008), // Cannelure groove
      new THREE.Vector2(0.0155, -0.004),
      new THREE.Vector2(0.0155, 0.014), // Ogive start
      new THREE.Vector2(0.0132, 0.032),
      new THREE.Vector2(0.0088, 0.049),
      new THREE.Vector2(0.0036, 0.064),
      new THREE.Vector2(0.0, 0.072), // Meplat nose tip
    ];
    const g = new THREE.LatheGeometry(pts, 20);
    g.rotateZ(-Math.PI / 2); // Map +Y -> +X
    g.computeVertexNormals();
    return g;
  }, []);

  // Round-nose pistol bullet geometry (nose oriented along +X)
  const pistolGeo = useMemo(() => {
    const pts: THREE.Vector2[] = [
      new THREE.Vector2(0.0, -0.036),
      new THREE.Vector2(0.017, -0.036),
      new THREE.Vector2(0.0175, -0.005),
      new THREE.Vector2(0.016, 0.012),
      new THREE.Vector2(0.0115, 0.025),
      new THREE.Vector2(0.005, 0.032),
      new THREE.Vector2(0.0, 0.034),
    ];
    const g = new THREE.LatheGeometry(pts, 20);
    g.rotateZ(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, []);

  // 88mm APCBC heavy tank shell geometry
  const apcbcGeo = useMemo(() => {
    const pts: THREE.Vector2[] = [
      new THREE.Vector2(0.0, -0.22),
      new THREE.Vector2(0.044, -0.22),
      new THREE.Vector2(0.046, -0.17), // Copper driving band swell
      new THREE.Vector2(0.044, -0.14),
      new THREE.Vector2(0.044, 0.04),
      new THREE.Vector2(0.036, 0.14),
      new THREE.Vector2(0.019, 0.23),
      new THREE.Vector2(0.0, 0.28),
    ];
    const g = new THREE.LatheGeometry(pts, 20);
    g.rotateZ(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, []);

  useEffect(() => {
    return () => {
      spitzerGeo.dispose();
      pistolGeo.dispose();
      apcbcGeo.dispose();
    };
  }, [spitzerGeo, pistolGeo, apcbcGeo]);

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    const st = simRef.current;
    sampleProjectilePoseAtTimeInto(traj, st.simTimeS, _poseScratch);

    // Hide projectile after steel gong hit (shattered/splashed into sparks), keep visible in gel block
    const hideAfterSteelImpact =
      _poseScratch.hasImpacted &&
      traj.targetType === 'steel_gong' &&
      traj.steelImpact.hit &&
      _poseScratch.postImpactTimeS > 0.012;
    root.visible = !hideAfterSteelImpact;

    root.position.set(_poseScratch.x, _poseScratch.y, _poseScratch.z);
    _eulerScratch.set(
      _poseScratch.rollRad,
      _poseScratch.yawRad,
      _poseScratch.pitchRad,
      'YZX'
    );
    root.quaternion.setFromEuler(_eulerScratch);

    // Scale projectile cleanly per camera mode so it's cinematic in Bullet-Cam & visible in Overview
    const style = traj.visualStyle;
    let s: number;
    if (st.cameraMode === 'bullet_cam') {
      if (style === 'apfsds_tungsten' || style === 'apcbc_shell') s = 1.45;
      else if (style === 'carbon_arrow') s = 1.15;
      else s = 2.6;
    } else if (st.cameraMode === 'spotter_flir') {
      if (style === 'apfsds_tungsten' || style === 'apcbc_shell') s = 1.6;
      else if (style === 'carbon_arrow') s = 1.3;
      else s = 3.6;
    } else {
      // Overview: visible glowing beacon proportional to range span
      const spanScale = Math.max(1, traj.targetRangeM / 220);
      if (style === 'apfsds_tungsten' || style === 'apcbc_shell') {
        s = 2.6 * spanScale;
      } else if (style === 'carbon_arrow') {
        s = 2.0 * spanScale;
      } else {
        s = 9.0 * spanScale;
      }
    }
    root.scale.setScalar(s);

    // Update 12ga 9-pellet buckshot dispersion cluster
    if (style === 'buckshot_cluster') {
      const spreadM =
        computeBuckshotPatternRadiusMm(traj.spec, _poseScratch.rangeM) / 1000;
      const localSpread = spreadM / Math.max(1, s);
      for (let i = 0; i < BUCKSHOT_OFFSETS.length; i++) {
        const pellet = buckRefs.current[i];
        if (!pellet) continue;
        pellet.position.set(
          (i % 3 - 1) * 0.015,
          BUCKSHOT_OFFSETS[i][1] * localSpread,
          BUCKSHOT_OFFSETS[i][0] * localSpread
        );
      }
    }

    // Supersonic bow shock vapor cone visible while Mach >= 1.0
    if (bowShockRef.current) {
      const isSup = _poseScratch.mach >= 0.98 && !_poseScratch.hasImpacted;
      bowShockRef.current.visible = isSup;
      if (isSup) {
        const machHalfAngle = Math.asin(
          Math.min(0.95, 1 / Math.max(1.04, _poseScratch.mach))
        );
        const radialScale = Math.max(0.35, Math.tan(machHalfAngle) * 1.15);
        bowShockRef.current.scale.set(1, radialScale, radialScale);
      }
    }

    // Tracer wake streak fades on impact
    if (tracerRef.current) {
      tracerRef.current.visible = !_poseScratch.hasImpacted;
    }
  });

  const style = traj.visualStyle;
  const hotColor = flirActive ? '#ffffff' : '#fb923c';
  const bodyColor = flirActive
    ? '#f8fafc'
    : style === 'apfsds_tungsten'
      ? '#4b5563'
      : style === 'apcbc_shell'
        ? '#334155'
        : style === 'carbon_arrow'
          ? '#1e293b'
          : '#d99046';

  return (
    <group ref={rootRef}>
      <group ref={spinGroupRef}>
        {style === 'spitzer_brass' && (
          <>
            <mesh geometry={spitzerGeo}>
              <meshStandardMaterial
                color={bodyColor}
                emissive={flirActive ? '#ffffff' : '#9a3412'}
                emissiveIntensity={flirActive ? 1.15 : 0.14}
                metalness={flirActive ? 0.1 : 0.88}
                roughness={flirActive ? 0.2 : 0.22}
              />
            </mesh>
            {/* Rifling spin-witness longitudinal copper stripe so Bullet-Cam rotation pops */}
            <mesh position={[-0.01, 0.0158, 0]}>
              <boxGeometry args={[0.048, 0.0022, 0.0042]} />
              <meshStandardMaterial
                color={flirActive ? '#cbd5e1' : '#fef3c7'}
                emissive={flirActive ? '#e2e8f0' : '#f59e0b'}
                emissiveIntensity={flirActive ? 0.6 : 0.45}
                metalness={0.85}
                roughness={0.2}
              />
            </mesh>
          </>
        )}

        {style === 'pistol_copper' && (
          <>
            <mesh geometry={pistolGeo}>
              <meshStandardMaterial
                color={bodyColor}
                emissive={flirActive ? '#ffffff' : '#9a3412'}
                emissiveIntensity={flirActive ? 1.1 : 0.12}
                metalness={flirActive ? 0.1 : 0.86}
                roughness={flirActive ? 0.25 : 0.25}
              />
            </mesh>
            <mesh position={[-0.008, 0.0176, 0]}>
              <boxGeometry args={[0.032, 0.0025, 0.005]} />
              <meshStandardMaterial
                color="#fef08a"
                emissive="#f59e0b"
                emissiveIntensity={0.45}
              />
            </mesh>
          </>
        )}

        {style === 'apfsds_tungsten' && (
          <group>
            {/* Long-rod tungsten dart core */}
            <mesh rotation={[0, 0, -Math.PI / 2]}>
              <cylinderGeometry args={[0.014, 0.016, 0.68, 14]} />
              <meshStandardMaterial
                color={bodyColor}
                emissive={flirActive ? '#ffffff' : '#ea580c'}
                emissiveIntensity={flirActive ? 1.3 : 0.24}
                metalness={flirActive ? 0.1 : 0.92}
                roughness={0.24}
              />
            </mesh>
            {/* Ballistic tip */}
            <mesh position={[0.39, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[0.014, 0.11, 14]} />
              <meshStandardMaterial
                color={flirActive ? '#ffffff' : '#cbd5e1'}
                emissive={flirActive ? '#ffffff' : '#fb923c'}
                emissiveIntensity={flirActive ? 1.5 : 0.55}
                metalness={0.85}
                roughness={0.18}
              />
            </mesh>
            {/* 6 Cruciform stabilizing tail fins */}
            {[0, 1, 2, 3, 4, 5].map((finIdx) => (
              <mesh
                key={finIdx}
                position={[-0.29, 0, 0]}
                rotation={[(finIdx * Math.PI) / 3, 0, 0]}
              >
                <boxGeometry args={[0.14, 0.11, 0.004]} />
                <meshStandardMaterial
                  color={flirActive ? '#e2e8f0' : '#94a3b8'}
                  emissive={flirActive ? '#94a3b8' : '#000000'}
                  emissiveIntensity={flirActive ? 0.8 : 0}
                  metalness={0.88}
                  roughness={0.28}
                />
              </mesh>
            ))}
          </group>
        )}

        {style === 'apcbc_shell' && (
          <group>
            <mesh geometry={apcbcGeo}>
              <meshStandardMaterial
                color={bodyColor}
                emissive={flirActive ? '#ffffff' : '#b45309'}
                emissiveIntensity={flirActive ? 1.2 : 0.16}
                metalness={flirActive ? 0.1 : 0.82}
                roughness={0.32}
              />
            </mesh>
            {/* Copper driving band */}
            <mesh position={[-0.16, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <cylinderGeometry args={[0.0475, 0.0475, 0.036, 20]} />
              <meshStandardMaterial
                color={flirActive ? '#f1f5f9' : '#d97706'}
                metalness={0.88}
                roughness={0.24}
              />
            </mesh>
          </group>
        )}

        {style === 'carbon_arrow' && (
          <group>
            {/* Carbon shaft */}
            <mesh rotation={[0, 0, -Math.PI / 2]}>
              <cylinderGeometry args={[0.0055, 0.0055, 0.72, 10]} />
              <meshStandardMaterial
                color={flirActive ? '#e2e8f0' : '#1e293b'}
                roughness={0.45}
                metalness={0.2}
              />
            </mesh>
            {/* 3-blade steel broadhead */}
            <mesh position={[0.39, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[0.022, 0.08, 3]} />
              <meshStandardMaterial
                color={flirActive ? '#ffffff' : '#e2e8f0'}
                metalness={0.9}
                roughness={0.2}
              />
            </mesh>
            {/* 3 Helical polymer fletching vanes */}
            {[0, 1, 2].map((vIdx) => (
              <mesh
                key={vIdx}
                position={[-0.29, 0, 0]}
                rotation={[(vIdx * Math.PI * 2) / 3, 0.08, 0]}
              >
                <boxGeometry args={[0.095, 0.038, 0.003]} />
                <meshStandardMaterial
                  color={flirActive ? '#ffffff' : '#f97316'}
                  emissive={flirActive ? '#f8fafc' : '#ea580c'}
                  emissiveIntensity={flirActive ? 0.9 : 0.4}
                />
              </mesh>
            ))}
          </group>
        )}

        {style === 'buckshot_cluster' && (
          <group>
            {BUCKSHOT_OFFSETS.map((_, idx) => (
              <mesh
                key={idx}
                ref={(el) => {
                  buckRefs.current[idx] = el;
                }}
              >
                <sphereGeometry args={[0.011, 10, 10]} />
                <meshStandardMaterial
                  color={flirActive ? '#ffffff' : '#94a3b8'}
                  emissive={flirActive ? '#ffffff' : '#f59e0b'}
                  emissiveIntensity={flirActive ? 1.25 : 0.3}
                  metalness={0.85}
                  roughness={0.3}
                />
              </mesh>
            ))}
          </group>
        )}

        {/* Glowing tracer base plug */}
        <mesh
          position={[
            style === 'apfsds_tungsten' || style === 'carbon_arrow'
              ? -0.36
              : style === 'apcbc_shell'
                ? -0.23
                : -0.056,
            0,
            0,
          ]}
        >
          <sphereGeometry
            args={[
              style === 'apcbc_shell'
                ? 0.034
                : style === 'apfsds_tungsten'
                  ? 0.02
                  : 0.014,
              10,
              10,
            ]}
          />
          <meshBasicMaterial color={hotColor} />
        </mesh>
      </group>

      {/* Luminous Tracer Wake Streak */}
      <mesh
        ref={tracerRef}
        position={[
          style === 'apfsds_tungsten' || style === 'carbon_arrow'
            ? -0.92
            : -0.45,
          0,
          0,
        ]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <coneGeometry
          args={[
            style === 'apcbc_shell' ? 0.045 : 0.022,
            style === 'apfsds_tungsten' ? 1.2 : 0.82,
            10,
            1,
            true,
          ]}
        />
        <meshBasicMaterial
          color={flirActive ? '#ffffff' : '#fb923c'}
          transparent
          opacity={flirActive ? 0.82 : 0.55}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Supersonic Mach Bow Shock Vapor Cone */}
      <mesh
        ref={bowShockRef}
        position={[style === 'apfsds_tungsten' ? 0.14 : -0.02, 0, 0]}
        rotation={[0, 0, -Math.PI / 2]}
      >
        <coneGeometry
          args={[
            style === 'apfsds_tungsten' ? 0.16 : 0.068,
            style === 'apfsds_tungsten' ? 0.58 : 0.24,
            18,
            1,
            true,
          ]}
        />
        <meshBasicMaterial
          color={flirActive ? '#e2e8f0' : '#bae6fd'}
          transparent
          opacity={flirActive ? 0.24 : 0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

// ============================================================================
// Sub-component: Target Array (AR500 Steel Gong Pendulum OR Ballistic Gel)
// ============================================================================
const TargetArrayRig: React.FC<{
  traj: RangeTrajectory3D;
  flirActive: boolean;
  simRef: React.MutableRefObject<SimClockState>;
}> = ({ traj, flirActive, simRef }) => {
  const pendulumRef = useRef<THREE.Group>(null);
  const impactHotspotRef = useRef<THREE.Mesh>(null);
  const sparksMeshRef = useRef<THREE.InstancedMesh>(null);
  const acousticRingRef = useRef<THREE.Mesh>(null);
  const gelStretchRef = useRef<THREE.Mesh>(null);
  const gelTrackRef = useRef<THREE.Mesh>(null);

  const gongFaceTex = useMemo(() => createSteelGongFaceTexture(), []);
  useEffect(() => {
    return () => {
      gongFaceTex?.dispose();
    };
  }, [gongFaceTex]);

  const isArmor = traj.spec.category === 'armor';
  const plateR = traj.steelImpact.plateRadiusM;
  const chainL = isArmor ? 1.55 : 0.65;
  // Align A-frame crossbar centerline flush with pendulum pivot Y (zero air gap!)
  const gantryHeight = traj.targetCenterY + chainL;
  const gantryHalfW = plateR + (isArmor ? 0.75 : 0.45);
  const legSpread = isArmor ? 0.72 : 0.42;
  const legLen = Math.hypot(legSpread, gantryHeight);
  const legTilt = Math.atan2(legSpread, gantryHeight);

  // Ensure pendulum rotation resets cleanly whenever target array type changes
  useEffect(() => {
    if (pendulumRef.current) {
      pendulumRef.current.rotation.set(0, 0, 0);
    }
  }, [traj.targetType, traj.projectileId]);

  const impactOffsetYM = traj.steelImpact.impactOffsetYCm / 100;
  const impactOffsetZM = traj.steelImpact.impactOffsetZCm / 100;

  // Ballistic gel visual scale (1.4x small arms, 2.2x armor for legibility)
  const gelVisualScale = isArmor ? 2.2 : 1.4;
  const gelLenM = (GEL_BLOCK_LENGTH_CM / 100) * gelVisualScale;
  const gelHM = (GEL_BLOCK_HEIGHT_CM / 100) * gelVisualScale;
  const gelWM = (GEL_BLOCK_WIDTH_CM / 100) * gelVisualScale;

  useFrame(() => {
    const st = simRef.current;
    const postT = Math.max(0, st.simTimeS - traj.totalFlightTimeS);
    const hasHitTime = st.simTimeS >= traj.totalFlightTimeS;

    // 1. AR500 Steel Gong Pendulum Swing
    if (pendulumRef.current && traj.targetType === 'steel_gong') {
      const swingRad = evaluateSteelPendulumAngle(traj.steelImpact, postT);
      // Positive Z rotation swings hanging (0, -chainL, 0) backward downrange (+X)
      pendulumRef.current.rotation.z = swingRad;
    }

    // 2. Impact Thermal / Lead Splatter Hotspot on Steel Face
    if (impactHotspotRef.current && traj.targetType === 'steel_gong') {
      const showHotspot = hasHitTime && traj.steelImpact.hit;
      impactHotspotRef.current.visible = showHotspot;
      if (showHotspot) {
        const cool01 = Math.exp(-postT / (flirActive ? 2.4 : 0.42));
        const pulseScale = 1 + 1.3 * Math.exp(-postT / 0.045);
        impactHotspotRef.current.scale.setScalar(pulseScale);
        const mat = impactHotspotRef.current
          .material as THREE.MeshBasicMaterial;
        if (flirActive) {
          _tmpColor.setRGB(
            0.35 + 0.65 * cool01,
            0.35 + 0.65 * cool01,
            0.38 + 0.62 * cool01
          );
        } else {
          _tmpColor.setRGB(
            0.22 + 0.78 * cool01,
            0.22 + 0.52 * cool01,
            0.24 + 0.14 * cool01
          );
        }
        mat.color.copy(_tmpColor);
      }
    }

    // 3. Incandescent Steel Impact Sparks Burst (Zero-GC InstancedMesh)
    if (sparksMeshRef.current) {
      const activeSparks =
        hasHitTime && traj.targetType === 'steel_gong' && traj.steelImpact.hit
          ? traj.steelImpact.sparkCount
          : 0;
      const hitBaseY = traj.targetCenterY + impactOffsetYM;
      const hitBaseZ = traj.targetCenterZ + impactOffsetZM;

      for (let i = 0; i < SPARK_COUNT_MAX; i++) {
        if (i >= activeSparks || postT > SPARK_SEEDS[i].lifeS) {
          _sparkDummy.position.set(0, -50, 0);
          _sparkDummy.scale.setScalar(0.0001);
          _sparkDummy.updateMatrix();
          sparksMeshRef.current.setMatrixAt(i, _sparkDummy.matrix);
          continue;
        }
        const seed = SPARK_SEEDS[i];
        const ageNorm = postT / seed.lifeS;
        const drag = 1 - ageNorm * 0.35;
        const sx = traj.targetCenterX - 0.06 + seed.vx * postT * drag;
        const sy = Math.max(
          0.05,
          hitBaseY + seed.vy * postT - 0.5 * 9.81 * postT * postT
        );
        const sz = hitBaseZ + seed.vz * postT * drag;
        const szScale = seed.size * (1 - ageNorm * 0.75) * (isArmor ? 2.4 : 1);

        _sparkDummy.position.set(sx, sy, sz);
        _sparkDummy.scale.set(szScale * 8.5, szScale, szScale);
        _sparkDummy.rotation.set(0, 0, Math.atan2(seed.vy - 9.81 * postT, seed.vx));
        _sparkDummy.updateMatrix();
        sparksMeshRef.current.setMatrixAt(i, _sparkDummy.matrix);
      }
      sparksMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // 4. Acoustic Sound-Return Wavefront Ring Racing Back at 343 m/s
    if (acousticRingRef.current) {
      const soundDelay = traj.steelImpact.acousticReturnDelayS;
      const waveActive =
        hasHitTime &&
        traj.steelImpact.hit &&
        traj.targetType === 'steel_gong' &&
        postT > 0.005 &&
        postT <= soundDelay + 0.15;
      acousticRingRef.current.visible = waveActive;
      if (waveActive) {
        const travelFrac = Math.min(1, postT / Math.max(0.05, soundDelay));
        const waveX = traj.targetCenterX * (1 - travelFrac);
        acousticRingRef.current.position.set(waveX, traj.targetCenterY, 0);
        const ringRadius = 0.8 + travelFrac * Math.min(11, traj.targetRangeM * 0.018);
        acousticRingRef.current.scale.setScalar(ringRadius);
        const mat = acousticRingRef.current
          .material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0.05, (1 - travelFrac * 0.72) * 0.55);
      }
    }

    // 5. Translucent Ballistic Gel Hydrodynamic Temporary Stretch Cavity
    if (traj.targetType === 'ballistic_gel') {
      const pulse = evaluateGelCavityPulse01(traj.gelCavity, postT);
      const penFrac =
        traj.gelCavity.penetrationDepthCm / Math.max(1, GEL_BLOCK_LENGTH_CM);
      const cavLen = Math.max(0.04, gelLenM * penFrac);
      const maxRad =
        Math.min(gelHM * 0.44, (traj.gelCavity.tempStretchRadiusCm / 100) * gelVisualScale);

      if (gelStretchRef.current) {
        gelStretchRef.current.visible = hasHitTime && traj.gelCavity.hit && pulse > 0.01;
        const radScale = Math.max(0.012, maxRad * pulse);
        gelStretchRef.current.position.set(cavLen * 0.5, 0, 0);
        gelStretchRef.current.scale.set(cavLen * 0.5, radScale, radScale);
      }
      if (gelTrackRef.current) {
        gelTrackRef.current.visible = hasHitTime && traj.gelCavity.hit;
        const permR = Math.max(
          0.008,
          (traj.gelCavity.permanentCavityRadiusCm / 100) * gelVisualScale * 0.55
        );
        gelTrackRef.current.position.set(cavLen * 0.5, 0, 0);
        gelTrackRef.current.scale.set(permR, cavLen, permR);
      }
    }
  });

  return (
    <group>
      {/* Acoustic return sonar ring */}
      <mesh
        ref={acousticRingRef}
        visible={false}
        rotation={[0, Math.PI / 2, 0]}
      >
        <ringGeometry args={[0.88, 1.0, 32]} />
        <meshBasicMaterial
          color={flirActive ? '#e2e8f0' : '#38bdf8'}
          transparent
          opacity={0.45}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Sparks InstancedMesh (World-space positioned) */}
      <instancedMesh
        ref={sparksMeshRef}
        args={[undefined, undefined, SPARK_COUNT_MAX]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={flirActive ? '#ffffff' : '#fde047'} />
      </instancedMesh>

      {/* Main Target Array Positioned at (targetCenterX, 0, 0) */}
      <group position={[traj.targetCenterX, 0, 0]}>
        {traj.targetType === 'steel_gong' ? (
          <group key="steel-gong-target">
            {/* Heavy A-frame Gantry Stand (Crossbar flush at Y = gantryHeight = pendulum pivot) */}
            <mesh position={[0, gantryHeight, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.045, 0.045, gantryHalfW * 2.2, 10]} />
              <meshStandardMaterial
                color={flirActive ? '#52657e' : '#334155'}
                emissive={flirActive ? '#2d3b4e' : '#000000'}
                emissiveIntensity={flirActive ? 0.55 : 0}
                metalness={flirActive ? 0.25 : 0.78}
                roughness={flirActive ? 0.6 : 0.4}
              />
            </mesh>
            {/* Left & Right A-frame legs welded flush into crossbar apex */}
            {[-1, 1].map((side) => (
              <group key={side} position={[0, 0, side * gantryHalfW]}>
                <mesh
                  position={[-legSpread * 0.5, gantryHeight * 0.5, 0]}
                  rotation={[0, 0, -legTilt]}
                >
                  <cylinderGeometry args={[0.038, 0.042, legLen, 8]} />
                  <meshStandardMaterial
                    color={flirActive ? '#475a73' : '#475569'}
                    emissive={flirActive ? '#263447' : '#000000'}
                    emissiveIntensity={flirActive ? 0.5 : 0}
                    metalness={flirActive ? 0.25 : 0.75}
                    roughness={flirActive ? 0.65 : 0.45}
                  />
                </mesh>
                <mesh
                  position={[legSpread * 0.5, gantryHeight * 0.5, 0]}
                  rotation={[0, 0, legTilt]}
                >
                  <cylinderGeometry args={[0.038, 0.042, legLen, 8]} />
                  <meshStandardMaterial
                    color={flirActive ? '#475a73' : '#475569'}
                    emissive={flirActive ? '#263447' : '#000000'}
                    emissiveIntensity={flirActive ? 0.5 : 0}
                    metalness={flirActive ? 0.25 : 0.75}
                    roughness={flirActive ? 0.65 : 0.45}
                  />
                </mesh>
              </group>
            ))}

            {/* Pivoted Hanging Chains + AR500 Steel Gong Plate (pivoted directly on crossbar at Y = gantryHeight) */}
            <group
              key="steel-pendulum-rig"
              ref={pendulumRef}
              position={[0, gantryHeight, 0]}
            >
              {/* Shackle collars around crossbar + full-length twin hanging chains */}
              {[-plateR * 0.52, plateR * 0.52].map((cz, i) => (
                <group key={i} position={[0, 0, cz]}>
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.062, 0.062, 0.06, 10]} />
                    <meshStandardMaterial
                      color={flirActive ? '#5b6f8a' : '#475569'}
                      emissive={flirActive ? '#304056' : '#000000'}
                      emissiveIntensity={flirActive ? 0.5 : 0}
                      metalness={flirActive ? 0.25 : 0.8}
                      roughness={0.45}
                    />
                  </mesh>
                  <mesh position={[0, -chainL * 0.5, 0]}>
                    <cylinderGeometry args={[0.015, 0.015, chainL, 8]} />
                    <meshStandardMaterial
                      color={flirActive ? '#607490' : '#64748b'}
                      emissive={flirActive ? '#34455d' : '#000000'}
                      emissiveIntensity={flirActive ? 0.55 : 0}
                      metalness={flirActive ? 0.25 : 0.85}
                      roughness={0.38}
                    />
                  </mesh>
                </group>
              ))}

              {/* AR500 Steel Gong Disc facing shooter (-X) */}
              <group position={[0, -chainL, 0]}>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry
                    args={[plateR, plateR, isArmor ? 0.14 : 0.032, 32]}
                  />
                  <meshStandardMaterial
                    color={flirActive ? '#6b809c' : '#64748b'}
                    emissive={flirActive ? '#3e5068' : '#000000'}
                    emissiveIntensity={flirActive ? 0.62 : 0}
                    metalness={flirActive ? 0.2 : 0.84}
                    roughness={flirActive ? 0.55 : 0.34}
                  />
                </mesh>
                {/* Painted front face facing -X */}
                <mesh
                  position={[-(isArmor ? 0.072 : 0.018), 0, 0]}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  <circleGeometry args={[plateR * 0.98, 32]} />
                  <meshStandardMaterial
                    color={flirActive ? '#7d93b0' : '#ffffff'}
                    map={flirActive ? null : gongFaceTex ?? undefined}
                    emissive={flirActive ? '#4a5f7a' : '#0f172a'}
                    emissiveIntensity={flirActive ? 0.72 : 0.06}
                    roughness={0.55}
                    metalness={0.18}
                  />
                </mesh>
                {/* Exact Impact Hotspot Decal at (impactOffsetZM, impactOffsetYM) */}
                <mesh
                  ref={impactHotspotRef}
                  visible={false}
                  position={[
                    -(isArmor ? 0.078 : 0.022),
                    impactOffsetYM,
                    impactOffsetZM,
                  ]}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  <circleGeometry args={[isArmor ? 0.14 : 0.036, 16]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </group>
            </group>

            {/* Flanking Range Witness Plate for visual depth in Spotter Scope */}
            <group position={[1.4, 0, -gantryHalfW - (isArmor ? 2.4 : 1.35)]}>
              <mesh position={[0, 0.85, 0]}>
                <boxGeometry args={[0.04, 1.7, 0.08]} />
                <meshStandardMaterial
                  color={flirActive ? '#445770' : '#475569'}
                  emissive={flirActive ? '#243142' : '#000000'}
                  emissiveIntensity={flirActive ? 0.45 : 0}
                  metalness={flirActive ? 0.25 : 0.7}
                />
              </mesh>
              <mesh position={[0, 1.55, 0]}>
                <boxGeometry args={[0.03, 0.72, 0.44]} />
                <meshStandardMaterial
                  color={flirActive ? '#5a708c' : '#cbd5e1'}
                  emissive={flirActive ? '#33445c' : '#000000'}
                  emissiveIntensity={flirActive ? 0.55 : 0}
                  roughness={0.6}
                />
              </mesh>
            </group>
          </group>
        ) : (
          /* Mode B: Translucent 10% FBI Ordnance Ballistic Gel Block on Test Bench */
          <group key="ballistic-gel-target" position={[0, traj.targetCenterY, 0]}>
            {/* Heavy Test Stand Table beneath Gel Block */}
            <mesh position={[gelLenM * 0.5, -gelHM * 0.5 - 0.05, 0]}>
              <boxGeometry args={[gelLenM + 0.36, 0.08, gelWM + 0.32]} />
              <meshStandardMaterial
                color={flirActive ? '#4a5d76' : '#475569'}
                emissive={flirActive ? '#283649' : '#000000'}
                emissiveIntensity={flirActive ? 0.5 : 0}
                metalness={flirActive ? 0.25 : 0.65}
                roughness={0.45}
              />
            </mesh>
            {[-1, 1].map((sx) =>
              [-1, 1].map((sz) => (
                <mesh
                  key={`${sx}_${sz}`}
                  position={[
                    gelLenM * 0.5 + sx * (gelLenM * 0.45),
                    -traj.targetCenterY * 0.5 - gelHM * 0.25,
                    sz * (gelWM * 0.45),
                  ]}
                >
                  <cylinderGeometry
                    args={[0.025, 0.028, traj.targetCenterY - gelHM * 0.5, 8]}
                  />
                  <meshStandardMaterial
                    color={flirActive ? '#3f5169' : '#334155'}
                    emissive={flirActive ? '#222f40' : '#000000'}
                    emissiveIntensity={flirActive ? 0.45 : 0}
                    metalness={flirActive ? 0.25 : 0.7}
                  />
                </mesh>
              ))
            )}

            {/* Translucent Amber Ballistic Gelatin Block (explicit key + zeroed rotation) */}
            <group key="ballistic-gel-block" position={[0, 0, 0]} rotation={[0, 0, 0]}>
              <mesh position={[gelLenM * 0.5, 0, 0]}>
                <boxGeometry args={[gelLenM, gelHM, gelWM]} />
                <meshPhysicalMaterial
                  color={flirActive ? '#475569' : '#f59e0b'}
                  emissive={flirActive ? '#1e293b' : '#b45309'}
                  emissiveIntensity={flirActive ? 0.3 : 0.14}
                  transparent
                  opacity={flirActive ? 0.42 : 0.36}
                  roughness={0.12}
                  metalness={0.02}
                  transmission={0.35}
                  depthWrite={false}
                />
              </mesh>
              {/* Crisp Calibration Wireframe */}
              <mesh position={[gelLenM * 0.5, 0, 0]}>
                <boxGeometry args={[gelLenM, gelHM, gelWM]} />
                <meshBasicMaterial
                  color={flirActive ? '#94a3b8' : '#fde68a'}
                  wireframe
                  transparent
                  opacity={0.32}
                />
              </mesh>

              {/* Dynamic Hydrodynamic Temporary Stretch Cavity (pulses in useFrame) */}
              <mesh ref={gelStretchRef} visible={false}>
                <sphereGeometry args={[1, 20, 14]} />
                <meshBasicMaterial
                  color={flirActive ? '#ffffff' : '#fef08a'}
                  transparent
                  opacity={flirActive ? 0.78 : 0.58}
                  depthWrite={false}
                />
              </mesh>

              {/* Permanent Wound Channel Core */}
              <mesh
                ref={gelTrackRef}
                visible={false}
                rotation={[0, 0, -Math.PI / 2]}
              >
                <cylinderGeometry args={[0.7, 1.0, 1, 12]} />
                <meshBasicMaterial
                  color={flirActive ? '#e2e8f0' : '#ef4444'}
                  transparent
                  opacity={0.82}
                />
              </mesh>
            </group>
          </group>
        )}
      </group>
    </group>
  );
};

function syncPerspectiveCameraClip(
  cam: THREE.Camera,
  near: number,
  far: number,
  fov: number
): void {
  const persp = cam as THREE.PerspectiveCamera;
  if (
    Math.abs(persp.fov - fov) > 0.1 ||
    persp.near !== near ||
    persp.far !== far
  ) {
    persp.near = near;
    persp.far = far;
    persp.fov = fov;
    persp.updateProjectionMatrix();
  }
}

/**
 * Mounted FIRST inside Range3DWorld so `simTimeS` always advances BEFORE
 * child projectile, target, and camera rigs read it in the same frame (zero 1-frame lag!).
 */
const SimulationClockDriver: React.FC<{
  traj: RangeTrajectory3D;
  simRef: React.MutableRefObject<SimClockState>;
  onImpactReached: () => void;
  onPlaybackFinished: () => void;
  onFrameTelemetry: (simTimeS: number, pose: ProjectilePose3D) => void;
}> = ({
  traj,
  simRef,
  onImpactReached,
  onPlaybackFinished,
  onFrameTelemetry,
}) => {
  useFrame((_, delta) => {
    const st = simRef.current;
    const clampedDelta = Math.min(delta, 0.05);

    if (st.playing) {
      st.simTimeS += clampedDelta * st.speed;
      if (st.simTimeS >= traj.totalFlightTimeS && !st.impactTriggered) {
        st.impactTriggered = true;
        onImpactReached();
      }
      if (st.simTimeS >= traj.totalTimelineS) {
        st.simTimeS = traj.totalTimelineS;
        st.playing = false;
        onPlaybackFinished();
      }
    }

    sampleProjectilePoseAtTimeInto(traj, st.simTimeS, _poseScratch);
    onFrameTelemetry(st.simTimeS, _poseScratch);
  });
  return null;
};

// ============================================================================
// Sub-component: 3D World Scene Inside R3F Canvas
// ============================================================================
const Range3DWorld: React.FC<{
  traj: RangeTrajectory3D;
  comparisonTrajs: readonly { traj: RangeTrajectory3D; color: string }[];
  maxRangeM: number;
  signedCrosswindMps: number;
  isLightTheme: boolean;
  cameraMode: RangeCameraMode;
  flirActive: boolean;
  simRef: React.MutableRefObject<SimClockState>;
  onFrameTelemetry: (simTimeS: number, pose: ProjectilePose3D) => void;
  onImpactReached: () => void;
  onPlaybackFinished: () => void;
}> = ({
  traj,
  comparisonTrajs,
  maxRangeM,
  signedCrosswindMps,
  isLightTheme,
  cameraMode,
  flirActive,
  simRef,
  onFrameTelemetry,
  onImpactReached,
  onPlaybackFinished,
}) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const machRingGroupRef = useRef<THREE.Group>(null);

  // 1. Proving Ground Terrain
  const terrainGeo = useMemo(() => createProvingGroundGeometry(), []);
  useEffect(() => () => terrainGeo.dispose(), [terrainGeo]);

  // 2. Main Mach-Gradient 3D Trajectory Ribbon (thick panoramic tube in Overview, razor-thin guide thread in Bullet-Cam / Spotter!)
  const mainRibbonGeo = useMemo(() => {
    const ribbonRadius =
      cameraMode === 'overview'
        ? Math.max(0.06, traj.targetRangeM * 0.00046)
        : cameraMode === 'bullet_cam'
          ? 0.0032
          : 0.008;
    return buildMachTrajectoryTubeGeometry(traj.points, ribbonRadius, 8);
  }, [traj, cameraMode]);
  useEffect(() => () => mainRibbonGeo.dispose(), [mainRibbonGeo]);

  // 3. Secondary Comparison Caliber Trajectory Lines (THREE.Line primitives)
  const comparisonLineObjects = useMemo(() => {
    return comparisonTrajs.map(({ traj: cTraj, color }) => {
      const verts = new Float32Array(cTraj.points.length * 3);
      for (let i = 0; i < cTraj.points.length; i++) {
        verts[i * 3] = cTraj.points[i].x;
        verts[i * 3 + 1] = cTraj.points[i].y;
        verts[i * 3 + 2] = cTraj.points[i].z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.45,
      });
      return new THREE.Line(geo, mat);
    });
  }, [comparisonTrajs]);

  useEffect(() => {
    return () => {
      for (const line of comparisonLineObjects) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    };
  }, [comparisonLineObjects]);

  // 4. Straight Optical Line-of-Sight Reference Beam
  const losLineObject = useMemo(() => {
    const verts = new Float32Array([
      0,
      FIRING_LINE_HEIGHT_M,
      0,
      traj.targetCenterX,
      traj.targetCenterY,
      0,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: '#94a3b8',
      transparent: true,
      opacity: 0.34,
    });
    return new THREE.Line(geo, mat);
  }, [traj.targetCenterX, traj.targetCenterY]);

  useEffect(() => {
    return () => {
      losLineObject.geometry.dispose();
      (losLineObject.material as THREE.Material).dispose();
    };
  }, [losLineObject]);

  // 5. Mach 1.0 Shock Ring Quaternion aligned perpendicular to velocity tangent
  const machRingQuat = useMemo(() => {
    const q = new THREE.Quaternion();
    if (traj.machRing.visible) {
      const dir = new THREE.Vector3(
        traj.machRing.tangentX,
        traj.machRing.tangentY,
        traj.machRing.tangentZ
      ).normalize();
      q.setFromUnitVectors(_xAxis, dir);
    }
    return q;
  }, [traj.machRing]);

  // 6. Proving-ground yardage gates (100m / 300m / 600m / 1000m) & animated wind flags
  const yardageMarkers = useMemo(
    () => PROVING_GROUND_GATE_MARKERS_M.filter((m) => m <= maxRangeM),
    [maxRangeM]
  );

  // 7. Procedural desert gravel-rock albedo/bump textures & atmospheric sky gradient dome
  const terrainTextures = useMemo(() => createProvingGroundTerrainTextures(), []);
  useEffect(() => {
    return () => {
      terrainTextures?.albedoTex.dispose();
      terrainTextures?.bumpTex.dispose();
    };
  }, [terrainTextures]);

  const skyDomeTex = useMemo(
    () => createAtmosphericSkyTexture(isLightTheme, flirActive),
    [isLightTheme, flirActive]
  );
  useEffect(() => {
    return () => {
      skyDomeTex?.dispose();
    };
  }, [skyDomeTex]);

  const windFlags = useMemo(
    () => computeWindFlagStates(maxRangeM, signedCrosswindMps),
    [maxRangeM, signedCrosswindMps]
  );

  // Camera & Mach-ring loop (runs AFTER SimulationClockDriver + ProjectileVisualMesh so pose & camera are 100% locked)
  useFrame((state) => {
    const st = simRef.current;
    sampleProjectilePoseAtTimeInto(traj, st.simTimeS, _poseScratch);

    // Subtle Mach 1.0 shock ring pulse
    if (machRingGroupRef.current && traj.machRing.visible) {
      const pulse = 1 + 0.065 * Math.sin(state.clock.elapsedTime * 4.2);
      machRingGroupRef.current.scale.setScalar(pulse);
    }

    // Camera Mode Controller
    const cam = state.camera;
    if (st.cameraMode === 'overview') {
      syncPerspectiveCameraClip(cam, 0.6, 2600, 44);
      if (st.overviewNeedsFrame) {
        evaluateRangeCameraPoseInto(
          'overview',
          traj,
          _poseScratch,
          _camPoseScratch
        );
        cam.position.set(
          _camPoseScratch.posX,
          _camPoseScratch.posY,
          _camPoseScratch.posZ
        );
        if (controlsRef.current) {
          controlsRef.current.target.set(
            _camPoseScratch.lookX,
            _camPoseScratch.lookY,
            _camPoseScratch.lookZ
          );
          controlsRef.current.update();
        } else {
          cam.lookAt(
            _camPoseScratch.lookX,
            _camPoseScratch.lookY,
            _camPoseScratch.lookZ
          );
        }
        st.overviewNeedsFrame = false;
      }
    } else {
      evaluateRangeCameraPoseInto(
        st.cameraMode,
        traj,
        _poseScratch,
        _camPoseScratch
      );
      _camGoalPos.set(
        _camPoseScratch.posX,
        _camPoseScratch.posY,
        _camPoseScratch.posZ
      );
      _camGoalLook.set(
        _camPoseScratch.lookX,
        _camPoseScratch.lookY,
        _camPoseScratch.lookZ
      );

      // Lock chase camera cleanly to the smooth RK4 pose (zero velocity-proportional chase lag!)
      cam.position.copy(_camGoalPos);
      cam.lookAt(_camGoalLook);
      syncPerspectiveCameraClip(cam, 0.05, 2600, _camPoseScratch.fovDeg);
    }
  });

  const skyHex = flirActive
    ? '#161f2c'
    : isLightTheme
      ? '#c7dff2'
      : '#162033';
  const fogHex = flirActive
    ? '#1b2636'
    : isLightTheme
      ? '#d9e7f3'
      : '#26344a';

  return (
    <>
      <SimulationClockDriver
        traj={traj}
        simRef={simRef}
        onImpactReached={onImpactReached}
        onPlaybackFinished={onPlaybackFinished}
        onFrameTelemetry={onFrameTelemetry}
      />
      <color attach="background" args={[skyHex]} />
      <fog attach="fog" args={[fogHex, 480, 1620]} />

      {/* Atmospheric Horizon Sky Gradient Dome */}
      {skyDomeTex && (
        <mesh position={[500, 0, 0]} renderOrder={-10}>
          <sphereGeometry args={[1850, 32, 20]} />
          <meshBasicMaterial
            map={skyDomeTex}
            side={THREE.BackSide}
            depthWrite={false}
            fog={false}
          />
        </mesh>
      )}

      {/* Proving Ground Desert / Alpine Lighting */}
      <hemisphereLight
        args={[
          flirActive ? '#7488a3' : isLightTheme ? '#e0f2fe' : '#94a3b8',
          flirActive ? '#263447' : '#8c6947',
          flirActive ? 1.15 : isLightTheme ? 1.15 : 0.92,
        ]}
      />
      <directionalLight
        position={[240, 260, 180]}
        intensity={flirActive ? 0.95 : isLightTheme ? 1.85 : 1.75}
        color={flirActive ? '#e2e8f0' : '#fff7ed'}
      />
      <directionalLight
        position={[-120, 95, -140]}
        intensity={flirActive ? 0.55 : 0.55}
        color={flirActive ? '#8da1bc' : '#bae6fd'}
      />

      {/* Free OrbitControls (active strictly in Range Overview mode) */}
      <OrbitControls
        ref={controlsRef}
        enabled={cameraMode === 'overview'}
        enableDamping
        dampingFactor={0.07}
        minDistance={6}
        maxDistance={1350}
        maxPolarAngle={Math.PI * 0.486}
      />

      {/* Contoured 1,000m Desert / Alpine Terrain with Procedural Gravel-Rock Albedo & Bump Maps */}
      <mesh geometry={terrainGeo} receiveShadow>
        <meshStandardMaterial
          vertexColors={!flirActive}
          color={flirActive ? '#2b394d' : '#ffffff'}
          map={flirActive ? null : terrainTextures?.albedoTex ?? undefined}
          bumpMap={terrainTextures?.bumpTex ?? undefined}
          bumpScale={flirActive ? 0.25 : 0.62}
          emissive={flirActive ? '#17212f' : '#000000'}
          emissiveIntensity={flirActive ? 0.55 : 0}
          roughness={0.94}
          metalness={0.03}
        />
      </mesh>

      {/* Flanking Proving-Ground Lane Boundary Curbs running from x = 0 to maxRangeM */}
      {[-11.8, 11.8].map((laneZ) => (
        <mesh
          key={laneZ}
          position={[maxRangeM * 0.5, 0.05, laneZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[maxRangeM + 20, 0.28]} />
          <meshBasicMaterial
            color={flirActive ? '#475569' : '#f59e0b'}
            transparent
            opacity={flirActive ? 0.35 : 0.42}
          />
        </mesh>
      ))}

      {/* Weathered Concrete Firing Line Pad, 4-Legged Shooting Bench & Canvas Sandbag Rests */}
      <group position={[0, 0, 0]}>
        {/* Main Concrete Pad */}
        <mesh position={[-1.4, 0.09, 0]} receiveShadow>
          <boxGeometry args={[6.8, 0.18, 9.2]} />
          <meshStandardMaterial
            color={flirActive ? '#223044' : '#787e87'}
            bumpMap={terrainTextures?.bumpTex ?? undefined}
            bumpScale={0.08}
            roughness={0.9}
          />
        </mesh>
        {/* Painted Safety Firing-Line Stripe at x = 1.85 */}
        <mesh position={[1.82, 0.186, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.18, 9.0]} />
          <meshBasicMaterial
            color={flirActive ? '#cbd5e1' : '#f59e0b'}
            transparent
            opacity={0.85}
          />
        </mesh>
        {/* Heavy Reinforced Shooting Bench Tabletop + 4 Anchored Steel/Concrete Legs */}
        <mesh position={[-0.78, 0.92, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.62, 0.1, 1.05]} />
          <meshStandardMaterial
            color={flirActive ? '#2c3b50' : '#57534e'}
            roughness={0.78}
            metalness={0.12}
          />
        </mesh>
        {[
          [-1.42, -0.4],
          [-1.42, 0.4],
          [-0.14, -0.4],
          [-0.14, 0.4],
        ].map(([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.54, lz]}>
            <boxGeometry args={[0.1, 0.72, 0.1]} />
            <meshStandardMaterial
              color={flirActive ? '#1e293b' : '#334155'}
              metalness={0.62}
              roughness={0.48}
            />
          </mesh>
        ))}
        {/* Stacked Tan Ballistic Canvas Front Sandbag Rest + Rear Squeeze Bag */}
        <group position={[-0.36, 1.05, 0]}>
          <mesh scale={[1.15, 0.65, 1.4]} rotation={[0, 0.08, 0]}>
            <sphereGeometry args={[0.18, 16, 12]} />
            <meshStandardMaterial
              color={flirActive ? '#475c77' : '#a88c64'}
              roughness={0.95}
              metalness={0.02}
            />
          </mesh>
          <mesh position={[0.04, 0.14, 0]} scale={[1.05, 0.62, 1.2]}>
            <sphereGeometry args={[0.16, 16, 12]} />
            <meshStandardMaterial
              color={flirActive ? '#526884' : '#b79b72'}
              roughness={0.95}
              metalness={0.02}
            />
          </mesh>
          {/* Side sandbag ears cradling the barrel/forend */}
          {[-0.12, 0.12].map((ez, ei) => (
            <mesh key={ei} position={[0.04, 0.25, ez]} scale={[0.9, 0.9, 0.58]}>
              <sphereGeometry args={[0.1, 12, 10]} />
              <meshStandardMaterial
                color={flirActive ? '#5a7290' : '#c0a67f'}
                roughness={0.95}
              />
            </mesh>
          ))}
        </group>
        {/* Rear Canvas Squeeze Bag */}
        <mesh position={[-1.12, 1.04, 0]} scale={[0.92, 0.62, 0.85]}>
          <sphereGeometry args={[0.14, 14, 10]} />
          <meshStandardMaterial
            color={flirActive ? '#4a5f7a' : '#9c805a'}
            roughness={0.95}
          />
        </mesh>
        {/* Adjustable Elevation Bipod / Shooting Rest Post */}
        <mesh position={[-0.32, 1.38, 0]}>
          <cylinderGeometry args={[0.022, 0.028, 0.52, 10]} />
          <meshStandardMaterial
            color={flirActive ? '#64748b' : '#1e293b'}
            metalness={0.8}
            roughness={0.32}
          />
        </mesh>
        {/* Stylized Barrel Aligned to Solved Bore Elevation & Wind Lead */}
        <group
          position={[0, FIRING_LINE_HEIGHT_M, 0]}
          rotation={[0, traj.windDialRad, traj.elevDialRad]}
        >
          <mesh position={[-0.52, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry
              args={[
                traj.spec.category === 'armor' ? 0.085 : 0.018,
                traj.spec.category === 'armor' ? 0.11 : 0.024,
                traj.spec.category === 'armor' ? 4.4 : 1.05,
                12,
              ]}
            />
            <meshStandardMaterial
              color={flirActive ? '#cbd5e1' : '#334155'}
              emissive={flirActive ? '#94a3b8' : '#000000'}
              emissiveIntensity={flirActive ? 0.55 : 0}
              metalness={0.82}
              roughness={0.32}
            />
          </mesh>
        </group>
      </group>

      {/* Yardage Distance Markers (100m, 300m, 500m, 800m, 1000m + Target Marker) */}
      {yardageMarkers.map((m) => (
        <YardageMarkerBoard
          key={m}
          rangeM={m}
          isTargetMarker={Math.abs(m - traj.targetRangeM) < 6}
          flirActive={flirActive}
        />
      ))}
      {yardageMarkers.every((m) => Math.abs(m - traj.targetRangeM) >= 6) && (
        <YardageMarkerBoard
          rangeM={traj.targetRangeM}
          isTargetMarker
          flirActive={flirActive}
        />
      )}

      {/* Animated Wind Flags Reacting Live to Crosswind Speed & Clock Direction */}
      <AnimatedWindFlags flags={windFlags} flirActive={flirActive} />

      {/* Straight Optical LOS Reference Beam */}
      <primitive object={losLineObject} />

      {/* Secondary Comparison Caliber Arcs */}
      {comparisonLineObjects.map((lineObj, idx) => (
        <primitive key={idx} object={lineObj} />
      ))}

      {/* Focused Caliber 3D Mach-Gradient Trajectory Ribbon */}
      <mesh geometry={mainRibbonGeo}>
        <meshBasicMaterial
          vertexColors={!flirActive}
          color={flirActive ? '#cbd5e1' : '#ffffff'}
          transparent
          opacity={
            cameraMode === 'overview'
              ? flirActive
                ? 0.48
                : 0.88
              : flirActive
                ? 0.24
                : 0.34
          }
        />
      </mesh>

      {/* Glowing Mach 1.0 Transonic Shock Ring */}
      {traj.machRing.visible && (
        <group
          ref={machRingGroupRef}
          position={[traj.machRing.x, traj.machRing.y, traj.machRing.z]}
          quaternion={machRingQuat}
        >
          {/* Outer Luminous Transonic Shock Torus */}
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[1.65, 0.085, 12, 36]} />
            <meshBasicMaterial
              color={flirActive ? '#ffffff' : '#f43f5e'}
              transparent
              opacity={0.92}
            />
          </mesh>
          {/* Inner Amber Shock Ring */}
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[1.15, 0.045, 10, 32]} />
            <meshBasicMaterial
              color={flirActive ? '#e2e8f0' : '#fbbf24'}
              transparent
              opacity={0.85}
            />
          </mesh>
          {/* Prandtl-Glauert Vapor Disc */}
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[1.58, 28]} />
            <meshBasicMaterial
              color={flirActive ? '#cbd5e1' : '#fda4af'}
              transparent
              opacity={0.14}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* Target Array (AR500 Steel Gong OR Translucent Ballistic Gel Block) */}
      <TargetArrayRig traj={traj} flirActive={flirActive} simRef={simRef} />

      {/* Animated Spinning 3D Projectile / Arrow / APFSDS Dart */}
      <ProjectileVisualMesh
        traj={traj}
        flirActive={flirActive}
        simRef={simRef}
      />
    </>
  );
};

// ============================================================================
// Public Component: Interactive 3D 1,000m Firing Range & Slow-Motion Bullet-Cam
// ============================================================================
export const Range3DScene: React.FC<Range3DSceneProps> = ({
  focusedSolution,
  comparisonSolutions,
  slotColors,
  maxRangeM,
  targetRangeM,
  signedCrosswindMps,
  lang,
  isLightTheme,
  expanded = false,
}) => {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot
  );

  const globalSfxMuted = useAppStore((s) => s.sfxMuted);
  const ui = EXTERNAL_BALLISTICS_STRINGS[lang];
  const isZh = lang === 'zh';

  const [cameraMode, setCameraMode] = useState<RangeCameraMode>('overview');
  const [speedMultiplier, setSpeedMultiplier] =
    useState<RangeSpeedMultiplier>(0.2);
  const [targetType, setTargetType] = useState<RangeTargetType>('steel_gong');
  const [aimMode, setAimMode] = useState<RangeAimMode>('dope_dial');
  const [flirEnabled, setFlirEnabled] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [localAudioMuted, setLocalAudioMuted] = useState<boolean>(false);

  const effectiveMuted = globalSfxMuted || localAudioMuted;

  // Build focused 3D trajectory strictly from RK4 solution
  const traj = useMemo(
    () =>
      buildRangeTrajectory3D(
        focusedSolution,
        targetRangeM,
        aimMode,
        targetType
      ),
    [focusedSolution, targetRangeM, aimMode, targetType]
  );

  // Build secondary comparison trajectories
  const comparisonTrajs = useMemo(() => {
    const list: { traj: RangeTrajectory3D; color: string }[] = [];
    for (let i = 0; i < comparisonSolutions.length; i++) {
      const sol = comparisonSolutions[i];
      if (sol.projectileId === focusedSolution.projectileId) continue;
      list.push({
        traj: buildRangeTrajectory3D(sol, targetRangeM, aimMode, targetType),
        color: slotColors[i % slotColors.length],
      });
    }
    return list;
  }, [
    comparisonSolutions,
    focusedSolution.projectileId,
    slotColors,
    targetRangeM,
    aimMode,
    targetType,
  ]);

  const simRef = useRef<SimClockState>({
    simTimeS: 0,
    playing: false,
    speed: 0.2,
    cameraMode: 'overview',
    flirEnabled: false,
    impactTriggered: false,
    overviewNeedsFrame: true,
    audioMuted: false,
    audioTimerId: null,
  });

  const hudRefs = useRef<HudDomRefs>({
    scrubber: null,
    timeText: null,
    rangeText: null,
    velMachText: null,
    energyText: null,
    dropWindText: null,
    statusText: null,
    acousticText: null,
  });

  const clearScheduledAudio = useCallback(() => {
    if (simRef.current.audioTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(simRef.current.audioTimerId);
      simRef.current.audioTimerId = null;
    }
  }, []);

  // Keep non-rendering simulation refs synced cleanly with user controls
  useEffect(() => {
    simRef.current.speed = speedMultiplier;
    simRef.current.cameraMode = cameraMode;
    simRef.current.flirEnabled = flirEnabled;
    simRef.current.audioMuted = effectiveMuted;
    if (effectiveMuted) {
      clearScheduledAudio();
    }
  }, [
    speedMultiplier,
    cameraMode,
    flirEnabled,
    effectiveMuted,
    clearScheduledAudio,
  ]);

  // Reframe overview camera smoothly when target range or trajectory updates
  useEffect(() => {
    simRef.current.overviewNeedsFrame = true;
    // Clamp simTimeS within new trajectory timeline cleanly
    if (simRef.current.simTimeS > traj.totalTimelineS) {
      simRef.current.simTimeS = traj.totalFlightTimeS;
    }
  }, [traj]);

  // Cleanup pending acoustic audio timer on unmount
  useEffect(() => {
    return () => {
      clearScheduledAudio();
    };
  }, [clearScheduledAudio]);

  // Triggered once when simulation crosses impact moment
  const handleImpactReached = useCallback(() => {
    const st = simRef.current;
    if (st.audioMuted) return;

    const isArmor = traj.spec.category === 'armor';
    if (traj.targetType === 'ballistic_gel') {
      if (traj.gelCavity.hit) {
        playBallisticGelThump(traj.gelCavity.impactEnergyJ, false);
      } else {
        playDirtBermMiss(false);
      }
      return;
    }

    if (!traj.steelImpact.hit) {
      playDirtBermMiss(false);
      return;
    }

    // Authentic speed-of-sound acoustic return delay (`distance / 343`)!
    // In Spotter scope (target-side camera), sound arrives near-instantly (~40ms).
    // In slow-motion Bullet-Cam, cap wall-clock wait so user hears crisp ping clearly.
    const rawDelayMs = traj.steelImpact.acousticReturnDelayS * 1000;
    const delayMs =
      st.cameraMode === 'spotter_flir'
        ? 45
        : st.speed < 1.0
          ? Math.min(rawDelayMs, 1250)
          : rawDelayMs;

    clearScheduledAudio();
    if (typeof window !== 'undefined') {
      st.audioTimerId = window.setTimeout(() => {
        st.audioTimerId = null;
        if (!simRef.current.audioMuted) {
          playSteelTargetPing(traj.steelImpact.impactEnergyJ, isArmor, false);
        }
      }, delayMs);
    }
  }, [traj, clearScheduledAudio]);

  const handlePlaybackFinished = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleFrameTelemetry = useCallback(
    (simTimeS: number, pose: ProjectilePose3D) => {
      const h = hudRefs.current;
      if (h.scrubber) {
        const sliderVal = Math.round(
          (simTimeS / Math.max(0.01, traj.totalTimelineS)) * 1000
        );
        if (Number(h.scrubber.value) !== sliderVal) {
          h.scrubber.value = String(sliderVal);
        }
      }
      if (h.timeText) {
        h.timeText.textContent = `${(pose.timeOfFlightS * 1000).toFixed(0)} ms`;
      }
      if (h.rangeText) {
        h.rangeText.textContent = `${Math.round(pose.rangeM)} / ${Math.round(traj.targetRangeM)} m`;
      }
      if (h.velMachText) {
        h.velMachText.textContent = `${Math.round(pose.velocityMps)} m/s · M${pose.mach.toFixed(2)}`;
      }
      if (h.energyText) {
        h.energyText.textContent = formatCompactEnergy(pose.energyJ);
      }
      if (h.dropWindText) {
        h.dropWindText.textContent = `${formatSignedCm(pose.dropCm)} / ${formatSignedCm(pose.windDriftCm)}`;
      }
      if (h.statusText) {
        if (!pose.hasImpacted) {
          h.statusText.textContent = ui.regimeLabels[pose.flightRegime];
        } else if (traj.targetType === 'ballistic_gel') {
          h.statusText.textContent = traj.gelCavity.hit
            ? ui.range3dGelImpactStatus(
                traj.gelCavity.penetrationDepthCm.toFixed(1),
                traj.gelCavity.passesThrough
              )
            : ui.range3dMissStatus;
        } else {
          h.statusText.textContent = traj.steelImpact.hit
            ? ui.range3dHitStatus(traj.steelImpact.hitZone)
            : ui.range3dMissStatus;
        }
      }
      if (h.acousticText) {
        h.acousticText.textContent = `${traj.steelImpact.acousticReturnDelayS.toFixed(2)} s`;
      }
    },
    [traj, ui]
  );

  const handleFireShot = () => {
    clearScheduledAudio();
    const isArchery = traj.spec.dragModel === 'ARROW';
    const isArmor = traj.spec.category === 'armor';
    playRangeMuzzleLaunch(
      traj.spec.muzzleEnergyJ,
      isArchery,
      isArmor,
      effectiveMuted
    );

    simRef.current.simTimeS = 0;
    simRef.current.impactTriggered = false;
    simRef.current.playing = true;
    setIsPlaying(true);
  };

  const handleTogglePlayPause = () => {
    playWorkbenchFoley('toggle_switch');
    if (simRef.current.playing) {
      simRef.current.playing = false;
      clearScheduledAudio();
      setIsPlaying(false);
    } else {
      if (simRef.current.simTimeS >= traj.totalTimelineS - 0.01) {
        simRef.current.simTimeS = 0;
        simRef.current.impactTriggered = false;
      }
      simRef.current.playing = true;
      setIsPlaying(true);
    }
  };

  const handleResetShot = () => {
    playWorkbenchFoley('preset_detent');
    clearScheduledAudio();
    simRef.current.simTimeS = 0;
    simRef.current.impactTriggered = false;
    simRef.current.playing = false;
    simRef.current.overviewNeedsFrame = true;
    setIsPlaying(false);
  };

  const handleScrubTimeline = (rawSliderVal: number) => {
    clearScheduledAudio();
    const frac = Math.max(0, Math.min(1, rawSliderVal / 1000));
    const nextT = frac * traj.totalTimelineS;
    simRef.current.simTimeS = nextT;
    simRef.current.impactTriggered = nextT >= traj.totalFlightTimeS;
    simRef.current.playing = false;
    setIsPlaying(false);
  };

  const handleSelectCameraMode = (mode: RangeCameraMode) => {
    playWorkbenchFoley('toggle_switch');
    setCameraMode(mode);
    if (mode === 'overview') {
      simRef.current.overviewNeedsFrame = true;
      setFlirEnabled(false);
    } else if (mode === 'spotter_flir') {
      setFlirEnabled(true);
    } else {
      setFlirEnabled(false);
    }
  };

  const flirActive = flirEnabled;
  const mach1Summary = traj.machRing.visible
    ? `${Math.round(traj.machRing.rangeM)} m`
    : focusedSolution.isInitiallySubsonic
      ? ui.subsonicMuzzleText
      : ui.supersonicBeyondText(
          focusedSolution.transonicRangeM ?? traj.targetRangeM
        );

  return (
    <section
      className={`eb-panel-card eb-range3d-card ${expanded ? 'is-expanded' : ''}`}
      data-testid="range-3d-section"
    >
      {/* Header & Top Mode Switchers */}
      <div className="eb-panel-head">
        <div className="eb-panel-title-group">
          <span className="eb-panel-kicker">{ui.range3dBadge}</span>
          <h2 className="eb-panel-title">{ui.range3dTitle}</h2>
          <p className="eb-panel-sub">
            {ui.range3dSubtitle(
              traj.spec.code,
              Math.round(traj.targetRangeM),
              traj.steelImpact.acousticReturnDelayS.toFixed(2)
            )}
          </p>
        </div>

        <div className="eb-range3d-top-controls">
          {/* 3 Camera Modes */}
          <div
            className="eb-seg-row"
            role="group"
            aria-label={ui.range3dCamGroupAria}
          >
            {RANGE_CAMERA_MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={`eb-seg-btn ${cameraMode === m ? 'is-active' : ''}`}
                aria-pressed={cameraMode === m}
                onClick={() => handleSelectCameraMode(m)}
              >
                <Camera size={11} aria-hidden="true" />
                <span>{ui.range3dCameraLabels[m]}</span>
              </button>
            ))}
          </div>

          {/* FLIR White-Hot Thermal Toggle */}
          <button
            type="button"
            className={`eb-tab-btn ${flirActive ? 'is-active is-flir-on' : ''}`}
            aria-pressed={flirActive}
            title={ui.range3dFlirTitle}
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              setFlirEnabled((prev) => !prev);
            }}
          >
            <Eye size={12} aria-hidden="true" />
            <span>{ui.range3dFlirBtn}</span>
          </button>

          {/* Range Impact Audio Mute Toggle */}
          <button
            type="button"
            className={`eb-reset-btn ${effectiveMuted ? 'is-muted' : ''}`}
            aria-pressed={!effectiveMuted}
            title={ui.range3dAudioTitle}
            onClick={() => setLocalAudioMuted((prev) => !prev)}
          >
            {effectiveMuted ? (
              <VolumeX size={12} aria-hidden="true" />
            ) : (
              <Volume2 size={12} aria-hidden="true" />
            )}
            <span>
              {effectiveMuted ? ui.range3dAudioMuted : ui.range3dAudioOn}
            </span>
          </button>
        </div>
      </div>

      {/* 3D Viewport Container */}
      <div
        className={`eb-range3d-viewport ${flirActive ? 'is-flir-mode' : ''} ${
          expanded ? 'is-expanded' : ''
        }`}
      >
        {isClient ? (
          <ViewportErrorBoundary>
            <Canvas
              dpr={[1, 1.75]}
              camera={{
                fov: 44,
                near: 0.6,
                far: 2600,
                position: [-60, 48, 110],
              }}
              gl={{
                antialias: true,
                powerPreference: 'high-performance',
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: flirActive ? 1.15 : 1.04,
              }}
            >
              <Range3DWorld
                traj={traj}
                comparisonTrajs={comparisonTrajs}
                maxRangeM={maxRangeM}
                signedCrosswindMps={signedCrosswindMps}
                isLightTheme={isLightTheme}
                cameraMode={cameraMode}
                flirActive={flirActive}
                simRef={simRef}
                onFrameTelemetry={handleFrameTelemetry}
                onImpactReached={handleImpactReached}
                onPlaybackFinished={handlePlaybackFinished}
              />
            </Canvas>
          </ViewportErrorBoundary>
        ) : (
          <div className="eb-range3d-ssr-fallback">
            <span>{ui.range3dTitle}</span>
          </div>
        )}

        {/* Optional FLIR White-Hot Thermal Optic Reticle Overlay */}
        {flirActive && (
          <div className="eb-range3d-flir-overlay" aria-hidden="true">
            <div className="eb-flir-scanlines" />
            <svg
              className="eb-flir-reticle-svg"
              viewBox="0 0 400 220"
              preserveAspectRatio="xMidYMid meet"
            >
              <line
                x1="150"
                y1="110"
                x2="192"
                y2="110"
                stroke="rgba(241, 245, 249, 0.72)"
                strokeWidth="1"
              />
              <line
                x1="208"
                y1="110"
                x2="250"
                y2="110"
                stroke="rgba(241, 245, 249, 0.72)"
                strokeWidth="1"
              />
              <line
                x1="200"
                y1="68"
                x2="200"
                y2="102"
                stroke="rgba(241, 245, 249, 0.72)"
                strokeWidth="1"
              />
              <line
                x1="200"
                y1="118"
                x2="200"
                y2="152"
                stroke="rgba(241, 245, 249, 0.72)"
                strokeWidth="1"
              />
              <rect
                x="184"
                y="94"
                width="32"
                height="32"
                fill="none"
                stroke="rgba(241, 245, 249, 0.45)"
                strokeDasharray="6 6"
                strokeWidth="1"
              />
              <text
                x="14"
                y="42"
                fill="rgba(241, 245, 249, 0.82)"
                fontSize="8.5"
                fontFamily="ui-monospace, monospace"
              >
                FLIR · WHOT · 12-BIT THERMAL
              </text>
              <text
                x="386"
                y="42"
                textAnchor="end"
                fill="rgba(241, 245, 249, 0.82)"
                fontSize="8.5"
                fontFamily="ui-monospace, monospace"
              >
                LRF {Math.round(traj.targetRangeM)}m
              </text>
            </svg>
          </div>
        )}

        {/* Floating Live 60fps Ballistic HUD Overlay (Zero React Re-renders) */}
        <div className="eb-range3d-hud-top">
          <div className="eb-range3d-hud-chip">
            <span className="eb-hud-k">{ui.range3dHudRange}</span>
            <strong
              className="eb-hud-v"
              ref={(el) => {
                hudRefs.current.rangeText = el;
              }}
            >
              0 / {Math.round(traj.targetRangeM)} m
            </strong>
          </div>
          <div className="eb-range3d-hud-chip">
            <span className="eb-hud-k">{ui.range3dHudVelMach}</span>
            <strong
              className="eb-hud-v"
              ref={(el) => {
                hudRefs.current.velMachText = el;
              }}
            >
              {Math.round(traj.spec.muzzleVelocityMps)} m/s
            </strong>
          </div>
          <div className="eb-range3d-hud-chip">
            <span className="eb-hud-k">{ui.range3dHudTof}</span>
            <strong
              className="eb-hud-v"
              ref={(el) => {
                hudRefs.current.timeText = el;
              }}
            >
              0 ms
            </strong>
          </div>
          <div className="eb-range3d-hud-chip">
            <span className="eb-hud-k">{ui.range3dHudEnergy}</span>
            <strong
              className="eb-hud-v"
              ref={(el) => {
                hudRefs.current.energyText = el;
              }}
            >
              {formatCompactEnergy(traj.spec.muzzleEnergyJ)}
            </strong>
          </div>
          <div className="eb-range3d-hud-chip">
            <span className="eb-hud-k">{ui.range3dHudDropWind}</span>
            <strong
              className="eb-hud-v"
              ref={(el) => {
                hudRefs.current.dropWindText = el;
              }}
            >
              0.0 cm / 0.0 cm
            </strong>
          </div>
          <div className="eb-range3d-hud-chip is-status">
            <span className="eb-hud-k">{ui.range3dHudStatus}</span>
            <strong
              className="eb-hud-v"
              ref={(el) => {
                hudRefs.current.statusText = el;
              }}
            >
              {ui.regimeLabels[traj.points[0]?.flightRegime ?? 'supersonic']}
            </strong>
          </div>
        </div>

        {/* Mach Gradient Legend + Wind / Acoustic Badge */}
        <div className="eb-range3d-hud-bottom-strip">
          <div className="eb-range3d-mach-legend">
            <span className="eb-mach-swatch is-sup" />
            <span>{ui.regimeLabels.supersonic}</span>
            <span className="eb-mach-swatch is-trans" />
            <span>
              M1.0 ({mach1Summary})
            </span>
            <span className="eb-mach-swatch is-sub" />
            <span>{ui.regimeLabels.subsonic}</span>
          </div>

          <div className="eb-range3d-meta-pills">
            <span className="eb-range3d-meta-pill">
              <Wind size={11} aria-hidden="true" />
              <span>
                {signedCrosswindMps >= 0 ? '+' : ''}
                {signedCrosswindMps.toFixed(1)} m/s
              </span>
            </span>
            <span className="eb-range3d-meta-pill">
              <Volume2 size={11} aria-hidden="true" />
              <span>
                {ui.range3dAcousticLabel}:{' '}
                <strong
                  ref={(el) => {
                    hudRefs.current.acousticText = el;
                  }}
                >
                  {traj.steelImpact.acousticReturnDelayS.toFixed(2)} s
                </strong>
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Interactive Trigger, Timeline Scrubber, Speed, Target & Aim Controls */}
      <div className="eb-range3d-dock">
        <div className="eb-range3d-transport">
          <button
            type="button"
            className="eb-range3d-fire-btn"
            onClick={handleFireShot}
            data-testid="range3d-fire-btn"
          >
            <Flame size={14} aria-hidden="true" />
            <span>{ui.range3dFireBtn}</span>
          </button>

          <button
            type="button"
            className="eb-reset-btn"
            onClick={handleTogglePlayPause}
            aria-label={isPlaying ? ui.range3dPauseBtn : ui.range3dPlayBtn}
          >
            {isPlaying ? (
              <Pause size={12} aria-hidden="true" />
            ) : (
              <Play size={12} aria-hidden="true" />
            )}
            <span>{isPlaying ? ui.range3dPauseBtn : ui.range3dPlayBtn}</span>
          </button>

          <button
            type="button"
            className="eb-reset-btn"
            onClick={handleResetShot}
            title={ui.range3dResetBtn}
          >
            <RotateCcw size={12} aria-hidden="true" />
          </button>

          {/* Slow-Motion Speed Selector (0.05x / 0.2x / 1.0x) */}
          <div
            className="eb-seg-row eb-range3d-speed-seg"
            role="group"
            aria-label={ui.range3dSpeedLabel}
          >
            {RANGE_SPEED_OPTIONS.map((spd) => (
              <button
                key={spd}
                type="button"
                className={`eb-seg-btn ${speedMultiplier === spd ? 'is-active' : ''}`}
                aria-pressed={speedMultiplier === spd}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setSpeedMultiplier(spd);
                }}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* 60fps Imperative Timeline Scrubber */}
        <div className="eb-range3d-scrubber-wrap">
          <span className="eb-range3d-scrub-label">{ui.range3dTimelineLabel}</span>
          <input
            ref={(el) => {
              hudRefs.current.scrubber = el;
            }}
            type="range"
            className="eb-range-input"
            aria-label={ui.range3dTimelineLabel}
            min={0}
            max={1000}
            step={1}
            defaultValue={0}
            onChange={(e) => handleScrubTimeline(Number(e.target.value))}
          />
        </div>

        {/* Target Type & Aim Mode Selectors */}
        <div className="eb-range3d-target-controls">
          <div
            className="eb-seg-row"
            role="group"
            aria-label={ui.range3dTargetTypeLabel}
          >
            {RANGE_TARGET_TYPES.map((tType) => (
              <button
                key={tType}
                type="button"
                className={`eb-seg-btn ${targetType === tType ? 'is-active' : ''}`}
                aria-pressed={targetType === tType}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setTargetType(tType);
                }}
              >
                <Target size={11} aria-hidden="true" />
                <span>{ui.range3dTargetLabels[tType]}</span>
              </button>
            ))}
          </div>

          <div
            className="eb-seg-row"
            role="group"
            aria-label={ui.range3dAimModeLabel}
          >
            {RANGE_AIM_MODES.map((aMode) => (
              <button
                key={aMode}
                type="button"
                className={`eb-seg-btn ${aimMode === aMode ? 'is-active' : ''}`}
                aria-pressed={aimMode === aMode}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setAimMode(aMode);
                }}
              >
                <Crosshair size={11} aria-hidden="true" />
                <span>{ui.range3dAimLabels[aMode]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal Impact Quantitative Summary Bar */}
      <div className="eb-range3d-terminal-strip">
        <span className="eb-range3d-term-item">
          {ui.range3dTermImpactVel}:{' '}
          <strong>
            {Math.round(traj.impactSample.velocityMps)} m/s (M
            {traj.impactSample.mach.toFixed(2)})
          </strong>
        </span>
        <span className="eb-range3d-term-item">
          {ui.range3dTermTof}:{' '}
          <strong>{traj.totalFlightTimeS.toFixed(3)} s</strong>
        </span>
        {targetType === 'steel_gong' ? (
          <>
            <span className="eb-range3d-term-item">
              {ui.range3dTermGongResult}:{' '}
              <strong>
                {traj.steelImpact.hit
                  ? `${ui.range3dHitStatus(traj.steelImpact.hitZone)} (${traj.steelImpact.radialErrorCm.toFixed(1)} cm)`
                  : `${ui.range3dMissStatus} (${traj.steelImpact.radialErrorCm.toFixed(1)} cm)`}
              </strong>
            </span>
            <span className="eb-range3d-term-item">
              {ui.range3dTermSwing}:{' '}
              <strong>
                {((traj.steelImpact.swingPeakAngleRad * 180) / Math.PI).toFixed(
                  1
                )}
                ° · {traj.steelImpact.impactMomentumNs.toFixed(1)} N·s
              </strong>
            </span>
          </>
        ) : (
          <>
            <span className="eb-range3d-term-item">
              {ui.range3dTermGelDepth}:{' '}
              <strong>
                {traj.gelCavity.penetrationDepthCm.toFixed(1)} cm
                {traj.gelCavity.passesThrough
                  ? isZh
                    ? ' (贯穿)'
                    : ' (Pass-Through)'
                  : ''}
              </strong>
            </span>
            <span className="eb-range3d-term-item">
              {ui.range3dTermGelCavity}:{' '}
              <strong>
                Ø{(traj.gelCavity.tempStretchRadiusCm * 2).toFixed(1)} cm
              </strong>
            </span>
          </>
        )}
      </div>
    </section>
  );
};

Range3DScene.displayName = 'Range3DScene';
export default Range3DScene;
