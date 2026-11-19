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
  computeGtaoInternalSize,
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
  type DkMasterPlateEntry,
  getWeaponMasterPlates,
  loadDkMasterPlateManifest,
  resolveMasterPlateUrl,
} from './dkMasterPlates';
import {
  type DkCalloutItem,
  type ExplodedPinItem,
  projectExplodedPartAnchors,
  projectLoupeAnchors,
  solveDkAnnotatedCallouts,
  solveExplodedPinLayout,
} from './explodedPinLayout';
import {
  buildMonographCacheKey,
  completeMonographCapture,
  type MonographCaptureQuality,
  type MonographEdition,
  type MonographLoupeAnchor,
  type MonographLoupeKey,
  type MonographPlateKey,
  type MonographPlateSource,
  updateMonographCaptureProgress,
  useMonographCaptureState,
} from './monographCaptureStore';

const STANDARD_CAPTURE_W = 1440;
const STANDARD_CAPTURE_H = 900;
const PRINT_CAPTURE_W = 2880;
const PRINT_CAPTURE_H = 1800;
const CAPTURE_FOV_DEG = 36;
const SETTLE_FRAMES_PER_SHOT = 2;

/**
 * Resolves offscreen capture dimensions for `standard_1440` (`1440×900`) or
 * `print_2880` (`2880×1800`, 300 DPI print target), safely clamping to the GPU's
 * `maxTextureSize` while preserving the exact 16:10 plate aspect ratio.
 */
export function resolveCaptureDimensions(
  quality: MonographCaptureQuality,
  maxTextureSize?: number
): { width: number; height: number } {
  const targetW =
    quality === 'print_2880' ? PRINT_CAPTURE_W : STANDARD_CAPTURE_W;
  const targetH =
    quality === 'print_2880' ? PRINT_CAPTURE_H : STANDARD_CAPTURE_H;
  const safeMax =
    typeof maxTextureSize === 'number' &&
    Number.isFinite(maxTextureSize) &&
    maxTextureSize > 0
      ? Math.floor(maxTextureSize)
      : 4096;

  if (targetW <= safeMax && targetH <= safeMax) {
    return { width: targetW, height: targetH };
  }

  const scale = Math.min(safeMax / targetW, safeMax / targetH);
  const width = Math.max(16, Math.floor((targetW * scale) / 2) * 2);
  const height = Math.max(16, Math.floor((targetH * scale) / 2) * 2);
  return { width, height };
}

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
  3.05078125, 4.3359375, 6.671875,
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

// =====================================================================================
// DK Transparent Alpha Cutout Shader Upgrades & Pure CPU Matting / Soft Shadow Helpers
// =====================================================================================

const DK_TRANSPARENT_OUTPUT_VERTEX = /* glsl */ `
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;
in vec2 uv;

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const DK_TRANSPARENT_OUTPUT_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;

#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>

in vec2 vUv;
layout(location = 0) out highp vec4 pc_fragColor;

vec3 armorySanitizeHdrRgb( vec3 c ) {
  uvec3 bits = floatBitsToUint( c );
  bvec3 bad = greaterThanEqual( bits & uvec3( 0x7f800000u ), uvec3( 0x7f800000u ) );
  vec3 safe = vec3(
    bad.r ? 0.0 : c.r,
    bad.g ? 0.0 : c.g,
    bad.b ? 0.0 : c.b
  );
  return clamp( safe, vec3( 0.0 ), vec3( 64.0 ) );
}

void main() {
  vec4 texel = texture( tDiffuse, vUv );
  vec3 safeRgb = armorySanitizeHdrRgb( texel.rgb );
  float safeA = ( ( floatBitsToUint( texel.a ) & 0x7f800000u ) == 0x7f800000u )
    ? 1.0
    : clamp( texel.a, 0.0, 1.0 );
  float peakRgb = max( safeRgb.r, max( safeRgb.g, safeRgb.b ) );
  float effectiveA = max( safeA, clamp( peakRgb * 0.85, 0.0, 1.0 ) );

  if ( effectiveA <= 0.0015 ) {
    pc_fragColor = vec4( 0.0, 0.0, 0.0, 0.0 );
    return;
  }

  // Unpremultiply translucent X-Ray / additive HDR fragments prior to AgX so edges never darken on white paper
  vec3 straightHdr = effectiveA < 0.999
    ? clamp( safeRgb / max( effectiveA, 0.02 ), vec3( 0.0 ), vec3( 64.0 ) )
    : safeRgb;
  vec4 outColor = vec4( straightHdr, effectiveA );

  #ifdef LINEAR_TONE_MAPPING
    outColor.rgb = LinearToneMapping( outColor.rgb );
  #elif defined( REINHARD_TONE_MAPPING )
    outColor.rgb = ReinhardToneMapping( outColor.rgb );
  #elif defined( CINEON_TONE_MAPPING )
    outColor.rgb = CineonToneMapping( outColor.rgb );
  #elif defined( ACES_FILMIC_TONE_MAPPING )
    outColor.rgb = ACESFilmicToneMapping( outColor.rgb );
  #elif defined( AGX_TONE_MAPPING )
    outColor.rgb = AgXToneMapping( outColor.rgb );
  #elif defined( NEUTRAL_TONE_MAPPING )
    outColor.rgb = NeutralToneMapping( outColor.rgb );
  #endif

  #ifdef SRGB_TRANSFER
    outColor = sRGBTransferOETF( outColor );
  #endif

  pc_fragColor = vec4( outColor.rgb, effectiveA );
}
`;

const DK_SMAA_RGBA_EDGES_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;

varying vec2 vUv;
varying vec4 vOffset[ 3 ];

vec4 SMAARgbaEdgeDetectionPS( vec2 texcoord, vec4 offset[3], sampler2D colorTex ) {
  vec2 threshold = vec2( SMAA_THRESHOLD, SMAA_THRESHOLD );

  vec4 delta;
  vec4 C = texture2D( colorTex, texcoord );

  vec4 Cleft = texture2D( colorTex, offset[0].xy );
  vec4 t = abs( C - Cleft );
  delta.x = max( max( t.r, t.g ), max( t.b, t.a ) );

  vec4 Ctop = texture2D( colorTex, offset[0].zw );
  t = abs( C - Ctop );
  delta.y = max( max( t.r, t.g ), max( t.b, t.a ) );

  vec2 edges = step( threshold, delta.xy );
  if ( dot( edges, vec2( 1.0, 1.0 ) ) == 0.0 )
    discard;

  vec4 Cright = texture2D( colorTex, offset[1].xy );
  t = abs( C - Cright );
  delta.z = max( max( t.r, t.g ), max( t.b, t.a ) );

  vec4 Cbottom = texture2D( colorTex, offset[1].zw );
  t = abs( C - Cbottom );
  delta.w = max( max( t.r, t.g ), max( t.b, t.a ) );

  float maxDelta = max( max( max( delta.x, delta.y ), delta.z ), delta.w );

  vec4 Cleftleft = texture2D( colorTex, offset[2].xy );
  t = abs( C - Cleftleft );
  delta.z = max( max( t.r, t.g ), max( t.b, t.a ) );

  vec4 Ctoptop = texture2D( colorTex, offset[2].zw );
  t = abs( C - Ctoptop );
  delta.w = max( max( t.r, t.g ), max( t.b, t.a ) );

  maxDelta = max( max( maxDelta, delta.z ), delta.w );
  edges.xy *= step( 0.5 * maxDelta, delta.xy );

  return vec4( edges, 0.0, 0.0 );
}

void main() {
  gl_FragColor = SMAARgbaEdgeDetectionPS( vUv, vOffset, tDiffuse );
}
`;

const DK_SMAA_STRAIGHT_ALPHA_BLEND_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tColor;
uniform vec2 resolution;

varying vec2 vUv;
varying vec4 vOffset[ 2 ];

vec4 SMAAStraightAlphaBlendingPS( vec2 texcoord, vec4 offset[ 2 ], sampler2D colorTex, sampler2D blendTex ) {
  vec4 a;
  a.xz = texture2D( blendTex, texcoord ).xz;
  a.y = texture2D( blendTex, offset[ 1 ].zw ).g;
  a.w = texture2D( blendTex, offset[ 1 ].xy ).a;

  if ( dot( a, vec4( 1.0, 1.0, 1.0, 1.0 ) ) < 1e-5 ) {
    return texture2D( colorTex, texcoord, 0.0 );
  } else {
    vec2 dirOffset;
    dirOffset.x = a.a > a.b ? a.a : -a.b;
    dirOffset.y = a.g > a.r ? -a.g : a.r;

    if ( abs( dirOffset.x ) > abs( dirOffset.y ) ) {
      dirOffset.y = 0.0;
    } else {
      dirOffset.x = 0.0;
    }

    vec4 C = texture2D( colorTex, texcoord, 0.0 );
    texcoord += sign( dirOffset ) * resolution;
    vec4 Cop = texture2D( colorTex, texcoord, 0.0 );
    float s = abs( dirOffset.x ) > abs( dirOffset.y ) ? abs( dirOffset.x ) : abs( dirOffset.y );

    float outA = mix( C.a, Cop.a, s );
    if ( outA <= 1e-4 ) {
      return vec4( 0.0 );
    }

    vec3 cLin = pow( clamp( C.rgb, 0.0, 1.0 ), vec3( 2.2 ) ) * C.a;
    vec3 copLin = pow( clamp( Cop.rgb, 0.0, 1.0 ), vec3( 2.2 ) ) * Cop.a;
    vec3 mixedLin = clamp( mix( cLin, copLin, s ) / outA, 0.0, 1.0 );

    return vec4( pow( mixedLin, vec3( 1.0 / 2.2 ) ), outA );
  }
}

void main() {
  gl_FragColor = SMAAStraightAlphaBlendingPS( vUv, vOffset, tColor, tDiffuse );
}
`;

function hardenOutputPassForTransparentCutout(outputPass: OutputPass): void {
  outputPass.material.glslVersion = THREE.GLSL3;
  outputPass.material.vertexShader = DK_TRANSPARENT_OUTPUT_VERTEX;
  outputPass.material.fragmentShader = DK_TRANSPARENT_OUTPUT_FRAGMENT;
  outputPass.material.blending = THREE.NoBlending;
  outputPass.material.needsUpdate = true;
}

function hardenSmaaPassForTransparentCutout(smaaPass: SMAAPass): void {
  smaaPass.materialEdges.fragmentShader = DK_SMAA_RGBA_EDGES_FRAGMENT;
  smaaPass.materialBlend.fragmentShader = DK_SMAA_STRAIGHT_ALPHA_BLEND_FRAGMENT;
  smaaPass.materialEdges.blending = THREE.NoBlending;
  smaaPass.materialWeights.blending = THREE.NoBlending;
  smaaPass.materialBlend.blending = THREE.NoBlending;
  smaaPass.materialEdges.toneMapped = false;
  smaaPass.materialWeights.toneMapped = false;
  smaaPass.materialBlend.toneMapped = false;
  smaaPass.materialEdges.needsUpdate = true;
  smaaPass.materialBlend.needsUpdate = true;
}

export interface AlphaSilhouetteBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  opaqueCount: number;
}

export interface DkContactShadowOptions {
  /** Peak alpha of the grounded studio shadow directly beneath the weapon (`[0..1]`). */
  peakOpacity?: number;
  /** Neutral cool museum slate RGB color (`[0..255]`) for soft paper-friendly shadows. */
  shadowRgb?: readonly [number, number, number];
}

const DK_SHADOW_SHOT_KEYS = new Set<MonographPlateKey>([
  'cover_hero',
  'ortho_right',
  'ortho_left',
  'group_slide',
  'group_frame',
  'group_fcg',
  'group_mag',
]);

/**
 * Determines which DK encyclopedia plates receive a subtle grounded tabletop contact
 * shadow beneath the transparent cutout (floating cutaways, X-Ray, exploded BOM, and
 * firing comics stay pure floating cutouts).
 */
export function shouldApplyDkContactShadow(
  shotKey: MonographPlateKey
): boolean {
  return DK_SHADOW_SHOT_KEYS.has(shotKey);
}

/**
 * Vertically flips bottom-up WebGL `readRenderTargetPixels` RGBA data into top-down
 * Canvas 2D `ImageData` rows.
 */
export function flipRgbaRowsVertical(
  srcBottomUp: Uint8Array,
  dstTopDown: Uint8ClampedArray,
  width: number,
  height: number
): void {
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    const srcOffset = (height - 1 - y) * rowBytes;
    const dstOffset = y * rowBytes;
    dstTopDown.set(
      srcBottomUp.subarray(srcOffset, srcOffset + rowBytes),
      dstOffset
    );
  }
}

/**
 * Zeroes negligible sub-threshold alpha noise (`alpha <= alphaCutoff`) so transparent
 * margins outside the firearm silhouette export as exact `rgba(0, 0, 0, 0)`.
 */
export function cleanTransparentAlphaEdge(
  rgbaTopDown: Uint8ClampedArray,
  alphaCutoff = 2
): void {
  for (let i = 0; i < rgbaTopDown.length; i += 4) {
    if (rgbaTopDown[i + 3] <= alphaCutoff) {
      rgbaTopDown[i] = 0;
      rgbaTopDown[i + 1] = 0;
      rgbaTopDown[i + 2] = 0;
      rgbaTopDown[i + 3] = 0;
    }
  }
}

/**
 * Scans a top-down RGBA pixel buffer to locate the tight screen-space bounding box of
 * non-transparent weapon pixels (`alpha >= alphaThreshold`).
 */
export function computeAlphaSilhouetteBounds(
  rgbaTopDown: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 12
): AlphaSilhouetteBounds | null {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let opaqueCount = 0;

  for (let y = 0; y < height; y++) {
    const rowBase = y * width * 4;
    for (let x = 0; x < width; x++) {
      const a = rgbaTopDown[rowBase + x * 4 + 3];
      if (a >= alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        opaqueCount += 1;
      }
    }
  }

  if (opaqueCount === 0 || maxX < minX || maxY < minY) {
    return null;
  }

  return { minX, maxX, minY, maxY, opaqueCount };
}

/**
 * Composites a physically subtle, soft elliptical DK studio tabletop contact shadow
 * strictly UNDERNEATH the firearm silhouette using exact straight-alpha Porter-Duff
 * `foreground OVER shadow` compositing. Leaves solid weapon pixels 100% untouched and
 * keeps outer paper margins genuinely transparent (`rgba(0, 0, 0, 0)`).
 */
export function compositeDkSoftContactShadow(
  rgbaTopDown: Uint8ClampedArray,
  width: number,
  height: number,
  options?: DkContactShadowOptions
): AlphaSilhouetteBounds | null {
  cleanTransparentAlphaEdge(rgbaTopDown, 2);
  const bounds = computeAlphaSilhouetteBounds(rgbaTopDown, width, height, 12);
  if (!bounds) return null;

  const peakOpacity = THREE.MathUtils.clamp(
    options?.peakOpacity ?? 0.21,
    0,
    0.6
  );
  if (peakOpacity <= 0.001) return bounds;

  const [shR, shG, shB] = options?.shadowRgb ?? [15, 23, 42];
  const spanX = Math.max(1, bounds.maxX - bounds.minX + 1);
  const spanY = Math.max(1, bounds.maxY - bounds.minY + 1);

  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const rx = Math.max(6, Math.min(width * 0.46, spanX * 0.52));
  const ry = Math.max(3, Math.min(height * 0.055, spanY * 0.085));
  const cy = Math.min(
    height - 1 - ry * 0.25,
    bounds.maxY + Math.max(1.5, spanY * 0.018)
  );

  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(width - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(height - 1, Math.ceil(cy + ry));

  const invRx = 1 / rx;
  const invRy = 1 / ry;

  for (let y = y0; y <= y1; y++) {
    const ny = (y - cy) * invRy;
    const ny2 = ny * ny;
    if (ny2 >= 1) continue;

    const rowBase = y * width * 4;
    for (let x = x0; x <= x1; x++) {
      const nx = (x - cx) * invRx;
      const d2 = nx * nx + ny2;
      if (d2 >= 1) continue;

      const oneMinusD2 = 1 - d2;
      const outer = Math.pow(oneMinusD2, 2.2);
      const core = Math.exp(-d2 * 4.5) * oneMinusD2;
      const shA = peakOpacity * (0.68 * outer + 0.32 * core);
      if (shA <= 0.002) continue;

      const idx = rowBase + x * 4;
      const fgAInt = rgbaTopDown[idx + 3];
      if (fgAInt >= 254) {
        // Solid opaque firearm pixel completely occludes contact shadow beneath it
        continue;
      }

      if (fgAInt <= 1) {
        rgbaTopDown[idx] = shR;
        rgbaTopDown[idx + 1] = shG;
        rgbaTopDown[idx + 2] = shB;
        rgbaTopDown[idx + 3] = Math.round(shA * 255);
      } else {
        const fgA = fgAInt / 255;
        const underFactor = shA * (1 - fgA);
        const outA = fgA + underFactor;
        const invOutA = 1 / outA;
        rgbaTopDown[idx] = Math.round(
          (rgbaTopDown[idx] * fgA + shR * underFactor) * invOutA
        );
        rgbaTopDown[idx + 1] = Math.round(
          (rgbaTopDown[idx + 1] * fgA + shG * underFactor) * invOutA
        );
        rgbaTopDown[idx + 2] = Math.round(
          (rgbaTopDown[idx + 2] * fgA + shB * underFactor) * invOutA
        );
        rgbaTopDown[idx + 3] = Math.min(255, Math.round(outA * 255));
      }
    }
  }

  return bounds;
}

// =====================================================================================
// Shot Plan & Camera Framing (Pixel-Aligned with Offline Blender Cycles Master Plates)
// =====================================================================================

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

interface ShotCameraOverride {
  azimuthDeg?: number;
  elevationDeg?: number;
  fovDeg?: number;
  aspect?: number;
  skipTurntableBounds?: boolean;
}

const SHOT_PLAN: readonly ShotSpec[] = [
  // 1. Hero Cover 3/4 Turntable Photo (floating DK cutout without pedestal in `dk_encyclopedia`)
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
  // 17. Macro Breech Focus (for Pro Dossier & DK Magnification Loupe)
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
 * Tailors base studio shot specs to each exhibit's actual firing kinematics,
 * frame architecture (archery cam/arrow milestones vs. per-firearm timings),
 * and edition presentation (`dk_encyclopedia` skips the dark turntable pedestal).
 */
export function resolveShotForWeapon(
  shot: ShotSpec,
  weaponId: WeaponId,
  edition?: MonographEdition
): ShotSpec {
  const baseShot: ShotSpec =
    edition === 'dk_encyclopedia' && shot.showTurntable
      ? { ...shot, showTurntable: false }
      : shot;

  if (isArcheryWeapon(weaponId)) {
    switch (baseShot.key) {
      case 'comic_1_ready':
        return { ...baseShot, firingF: 0.27, sectionCut: false };
      case 'comic_2_ignition':
        return { ...baseShot, firingF: 0.36, sectionCut: false };
      case 'comic_3_eject':
        return { ...baseShot, firingF: 0.5, sectionCut: false };
      case 'comic_4_reload':
        return {
          ...baseShot,
          firingF: 0.78,
          sectionCut: false,
          xrayShells: weaponId === 'lift33' ? false : baseShot.xrayShells,
        };
      case 'breech_closeup':
        return weaponId === 'lift33'
          ? { ...baseShot, xrayShells: false }
          : baseShot;
      default:
        return baseShot;
    }
  }

  const timing = getWeaponFiringTiming(weaponId);
  switch (baseShot.key) {
    case 'comic_2_ignition':
      return {
        ...baseShot,
        firingF: (timing.ignitionF + timing.muzzleExitF) * 0.52,
      };
    case 'comic_3_eject':
      return {
        ...baseShot,
        firingF: Math.min(0.74, timing.ejectF + 0.02),
      };
    default:
      return baseShot;
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
  shot: ShotSpec,
  includeTurntable: boolean
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

  if (includeTurntable) {
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
  shot: ShotSpec,
  captureAspect: number,
  override?: ShotCameraOverride
): void {
  const fovDeg =
    override?.fovDeg !== undefined &&
    Number.isFinite(override.fovDeg) &&
    override.fovDeg > 0
      ? override.fovDeg
      : CAPTURE_FOV_DEG;
  const aspect =
    override?.aspect !== undefined &&
    Number.isFinite(override.aspect) &&
    override.aspect > 0
      ? override.aspect
      : captureAspect;
  const azimuthDeg =
    override?.azimuthDeg !== undefined && Number.isFinite(override.azimuthDeg)
      ? override.azimuthDeg
      : shot.azimuthDeg;
  const elevationDeg =
    override?.elevationDeg !== undefined &&
    Number.isFinite(override.elevationDeg)
      ? override.elevationDeg
      : shot.elevationDeg;
  const includeTurntable = shot.showTurntable && !override?.skipTurntableBounds;

  cam.fov = fovDeg;
  cam.aspect = aspect;
  cam.near = 0.1;
  cam.far = 680;
  cam.clearViewOffset();

  const manifest = getWeaponManifest(weaponId);
  if (shot.useManifestCloseFocus) {
    const closeCfg = manifest.cameraPresets.cutaway_focus;
    cam.position.set(closeCfg.pos[0], closeCfg.pos[1], closeCfg.pos[2] * 0.92);
    cam.lookAt(closeCfg.target[0], closeCfg.target[1], closeCfg.target[2]);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    return;
  }

  const bounds = computeWeaponWorldBounds(
    weaponId,
    plugin,
    shot,
    includeTurntable
  );
  const cx = (bounds.min.x + bounds.max.x) * 0.5;
  let cy = (bounds.min.y + bounds.max.y) * 0.5;
  const cz = (bounds.min.z + bounds.max.z) * 0.5;

  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
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

  const tanHalfV = Math.tan(THREE.MathUtils.degToRad(fovDeg * 0.5));
  const tanHalfH = tanHalfV * aspect;

  const distY = maxProjY / (tanHalfV * shot.fillY) + maxDepthTowardCam;
  const distX = maxProjX / (tanHalfH * shot.fillX) + maxDepthTowardCam;
  const minSafeDist = shot.isolatedGroup ? 8.5 : 14;
  const baseDist = Math.max(minSafeDist, distX, distY);

  // Nudge compact pistols & revolvers only when framed over the circular turntable rim
  const wid = weaponId as string;
  const isPistolTurntableCover =
    includeTurntable &&
    shot.key === 'cover_hero' &&
    (manifest.workbenchMeta.scaleProfile === 'pistol' ||
      wid === 'g17' ||
      wid === 'p320' ||
      wid === 'deagle' ||
      wid === 'python' ||
      wid === 'p08');
  if (isPistolTurntableCover) {
    cy -= 1.05;
  }
  const dist = isPistolTurntableCover
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

function verifyImageLoads(url: string, timeoutMs = 4500): Promise<boolean> {
  if (typeof Image === 'undefined') {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

interface VerifiedCyclesPlate {
  url: string;
  entry: DkMasterPlateEntry;
}

interface ActiveCaptureSession {
  requestId: number;
  weaponId: WeaponId;
  edition: MonographEdition;
  quality: MonographCaptureQuality;
  captureWidth: number;
  captureHeight: number;
  plugin: WeaponRuntimePlugin;
  shots: readonly ShotSpec[];
  saved: SavedViewportSnapshot;
  shotIndex: number;
  settleCounter: number;
  hasSettledFirstWebglShot: boolean;
  verifiedCyclesPlates: Partial<Record<MonographPlateKey, VerifiedCyclesPlate>>;
  plates: Partial<Record<MonographPlateKey, string>>;
  plateSources: Partial<Record<MonographPlateKey, MonographPlateSource>>;
  explodedPins: ExplodedPinItem[];
  dkHeroCallouts: DkCalloutItem[];
  dkCutawayCallouts: DkCalloutItem[];
  dkExplodedCallouts: DkCalloutItem[];
  loupeAnchors: Partial<Record<MonographLoupeKey, MonographLoupeAnchor>>;
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

function resolveEnvironmentPresetForEdition(
  edition: MonographEdition
): ArmoryEnvironmentPreset {
  return edition === 'obsidian_folio' ? 'tactical_vault' : 'blueprint_daylight';
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
  const envPreset = resolveEnvironmentPresetForEdition(edition);
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
  session.renderPass.dispose();
  session.gtaoPass.dispose();
  session.outputPass.dispose();
  session.smaaPass.dispose();
  session.copyPass.dispose();
  session.composer.renderTarget1.dispose();
  session.composer.renderTarget2.dispose();
  session.composer.dispose();
  session.ldrTarget.dispose();
  session.brightBgTexture?.dispose();
}

const DK_STAGE_OBJECT_NAMES: readonly string[] = [
  'studio-cyclorama-backdrop',
  'studio-cyclorama-floor',
  'gunsmith-mat-slab',
  'gunsmith-mat-lip',
  'gunsmith-mat-tray',
];

function withTransparentStudioIsolation(
  targetScene: THREE.Scene,
  renderFn: () => void
): void {
  const prevSceneBg = targetScene.background;
  const prevSceneFog = targetScene.fog;
  const hiddenObjects: THREE.Object3D[] = [];

  const hideIfVisible = (obj: THREE.Object3D | null | undefined) => {
    if (!obj || !obj.visible) return;
    obj.visible = false;
    hiddenObjects.push(obj);
  };

  // Hide the full GunsmithStageMat root group (floor grid, takedown mat, tray & ContactShadows)
  const floorMesh = targetScene.getObjectByName('studio-cyclorama-floor');
  if (floorMesh?.parent && floorMesh.parent !== targetScene) {
    hideIfVisible(floorMesh.parent);
  }
  const matSlab = targetScene.getObjectByName('gunsmith-mat-slab');
  if (matSlab?.parent && matSlab.parent !== targetScene) {
    hideIfVisible(matSlab.parent);
  }
  for (let i = 0; i < DK_STAGE_OBJECT_NAMES.length; i++) {
    hideIfVisible(targetScene.getObjectByName(DK_STAGE_OBJECT_NAMES[i]));
  }

  targetScene.background = null;
  targetScene.fog = null;

  try {
    renderFn();
  } finally {
    targetScene.background = prevSceneBg;
    targetScene.fog = prevSceneFog;
    for (let i = 0; i < hiddenObjects.length; i++) {
      hiddenObjects[i].visible = true;
    }
  }
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
    THREE.Mesh | undefined;
  const cycUniform =
    cycFloor && (cycFloor.material as THREE.ShaderMaterial).isShaderMaterial
      ? (((cycFloor.material as THREE.ShaderMaterial).uniforms.uCycloramaColor
          ?.value as THREE.Color | undefined) ?? null)
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
  quality: MonographCaptureQuality;
}> = ({ requestId, weaponId, edition, quality }) => {
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

      // Load offline Blender Cycles 4K master plates manifest if applicable
      const verifiedCyclesPlates: Partial<
        Record<MonographPlateKey, VerifiedCyclesPlate>
      > = {};
      if (edition === 'dk_encyclopedia' || edition === 'blueprint_manual') {
        await loadDkMasterPlateManifest();
        if (cancelled) return;
        const weaponMaster = getWeaponMasterPlates(weaponId);
        if (weaponMaster) {
          const entries = Object.entries(weaponMaster.plates) as Array<
            [MonographPlateKey, DkMasterPlateEntry]
          >;
          await Promise.all(
            entries.map(async ([plateKey, entry]) => {
              const url = resolveMasterPlateUrl(entry);
              const loaded = await verifyImageLoads(url);
              if (loaded) {
                verifiedCyclesPlates[plateKey] = { url, entry };
              }
            })
          );
          if (cancelled) return;
        }
      }

      const { width: captureWidth, height: captureHeight } =
        resolveCaptureDimensions(quality, gl.capabilities?.maxTextureSize);
      const captureAspect = captureWidth / captureHeight;

      const envPreset = resolveEnvironmentPresetForEdition(edition);
      const postParams = getPostProcessingPresetParams(envPreset);
      const isDkTransparent = edition === 'dk_encyclopedia';

      const captureCam = new THREE.PerspectiveCamera(
        CAPTURE_FOV_DEG,
        captureAspect,
        0.1,
        680
      );
      const hdrTarget = createArmoryComposerRenderTarget(
        captureWidth,
        captureHeight
      );
      const composer = new EffectComposer(gl, hdrTarget);
      composer.setPixelRatio(1);
      composer.setSize(captureWidth, captureHeight);
      composer.renderToScreen = false;

      const renderPass = new RenderPass(
        scene,
        captureCam,
        null,
        isDkTransparent ? new THREE.Color(0x000000) : null,
        isDkTransparent ? 0 : null
      );

      const gtaoSize = computeGtaoInternalSize(
        captureWidth,
        captureHeight,
        'full',
        1
      );
      const gtaoPass = new GTAOPass(
        scene,
        captureCam,
        gtaoSize.width,
        gtaoSize.height
      );
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
      if (isDkTransparent) {
        hardenOutputPassForTransparentCutout(outputPass);
      } else {
        hardenOutputPassAgainstNaN(outputPass);
        outputPass.material.blending = THREE.NoBlending;
      }

      const smaaPass = new SMAAPass(captureWidth, captureHeight);
      smaaPass.clear = true;
      if (isDkTransparent) {
        hardenSmaaPassForTransparentCutout(smaaPass);
      } else {
        smaaPass.materialEdges.toneMapped = false;
        smaaPass.materialWeights.toneMapped = false;
        smaaPass.materialBlend.toneMapped = false;
      }

      composer.addPass(renderPass);
      composer.addPass(gtaoPass);
      composer.addPass(outputPass);
      composer.addPass(smaaPass);

      const copyPass = new ShaderPass(CopyShader);
      copyPass.renderToScreen = false;
      copyPass.material.blending = THREE.NoBlending;
      copyPass.material.transparent = false;

      const ldrTarget = new THREE.WebGLRenderTarget(
        captureWidth,
        captureHeight,
        {
          type: THREE.UnsignedByteType,
          format: THREE.RGBAFormat,
          depthBuffer: false,
          stencilBuffer: false,
        }
      );

      const brightBgTexture =
        edition === 'blueprint_manual'
          ? createBrightPlateBackdropTexture()
          : null;

      const canvas2d = document.createElement('canvas');
      canvas2d.width = captureWidth;
      canvas2d.height = captureHeight;
      const ctx2d = canvas2d.getContext('2d')!;
      const imageData = ctx2d.createImageData(captureWidth, captureHeight);
      const rawRgba = new Uint8Array(captureWidth * captureHeight * 4);

      const shots = SHOT_PLAN.map((shot) =>
        resolveShotForWeapon(shot, weaponId, edition)
      );
      applyShotStateToStore(weaponId, edition, shots[0]);
      updateMonographCaptureProgress(requestId, 0, shots[0].key);

      sessionRef.current = {
        requestId,
        weaponId,
        edition,
        quality,
        captureWidth,
        captureHeight,
        plugin,
        shots,
        saved,
        shotIndex: 0,
        settleCounter: 0,
        hasSettledFirstWebglShot: false,
        verifiedCyclesPlates,
        plates: {},
        plateSources: {},
        explodedPins: [],
        dkHeroCallouts: [],
        dkCutawayCallouts: [],
        dkExplodedCallouts: [],
        loupeAnchors: {},
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
  }, [requestId, weaponId, edition, quality, gl, scene]);

  useFrame(({ gl: frameGl, scene: frameScene }) => {
    const s = sessionRef.current;
    if (!s) return;

    const shot = s.shots[s.shotIndex];
    if (!shot) return;

    const verifiedCycles = s.verifiedCyclesPlates[shot.key];
    const fireF = shot.firingF ?? 0;
    playbackClock.setFireProgress(fireF, true);
    playbackClock.setAnimatedFireProgress(fireF);
    playbackClock.setTargetProgress(shot.explodeT, true);
    playbackClock.setAnimatedProgress(shot.explodeT);

    // Cycles master plates don't need GPU settle frames; WebGL captures settle PartActor matrices/materials
    if (!verifiedCycles) {
      const needsExtraInitialSettle =
        !s.hasSettledFirstWebglShot &&
        (s.saved.screen === 'cartridges' ||
          s.saved.environmentPreset !==
            resolveEnvironmentPresetForEdition(s.edition));
      const requiredSettleFrames = needsExtraInitialSettle
        ? SETTLE_FRAMES_PER_SHOT + 2
        : SETTLE_FRAMES_PER_SHOT;
      s.settleCounter += 1;
      if (s.settleCounter < requiredSettleFrames) {
        return;
      }
      s.hasSettledFirstWebglShot = true;
    }

    frameScene.updateMatrixWorld(true);

    const captureAspect = s.captureWidth / s.captureHeight;
    const camOverride: ShotCameraOverride | undefined = verifiedCycles
      ? {
          azimuthDeg: verifiedCycles.entry.azimuthDeg,
          elevationDeg: verifiedCycles.entry.elevationDeg,
          fovDeg: verifiedCycles.entry.fovDeg,
          aspect:
            verifiedCycles.entry.width > 0 && verifiedCycles.entry.height > 0
              ? verifiedCycles.entry.width / verifiedCycles.entry.height
              : captureAspect,
          skipTurntableBounds: true,
        }
      : undefined;

    positionStudioShotCamera(
      s.captureCam,
      s.weaponId,
      s.plugin,
      shot,
      captureAspect,
      camOverride
    );

    if (verifiedCycles) {
      s.plates[shot.key] = verifiedCycles.url;
      s.plateSources[shot.key] = 'cycles_4k';
    } else {
      s.gtaoPass.enabled = !shot.xrayShells;

      const envPreset = resolveEnvironmentPresetForEdition(s.edition);
      const postParams = getPostProcessingPresetParams(envPreset);
      const prevExposure = frameGl.toneMappingExposure;
      const prevToneMapping = frameGl.toneMapping;
      const prevClearAlpha = frameGl.getClearAlpha();

      applyRendererToneMapping(
        frameGl,
        postParams.toneMapping,
        postParams.toneMappingExposure,
        THREE.SRGBColorSpace
      );

      const prevRenderTarget = frameGl.getRenderTarget();
      try {
        if (s.edition === 'dk_encyclopedia') {
          withTransparentStudioIsolation(frameScene, () => {
            s.composer.render(0.016);
          });
        } else {
          withStudioCaptureBackdrop(frameScene, s.brightBgTexture, () => {
            s.composer.render(0.016);
          });
        }

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
          s.captureWidth,
          s.captureHeight,
          s.rawRgba
        );
      } finally {
        frameGl.setRenderTarget(prevRenderTarget);
        frameGl.setClearAlpha(prevClearAlpha);
        applyRendererToneMapping(frameGl, prevToneMapping, prevExposure);
      }

      flipRgbaRowsVertical(
        s.rawRgba,
        s.imageData.data,
        s.captureWidth,
        s.captureHeight
      );

      if (s.edition === 'dk_encyclopedia') {
        if (shouldApplyDkContactShadow(shot.key)) {
          compositeDkSoftContactShadow(
            s.imageData.data,
            s.captureWidth,
            s.captureHeight,
            {
              peakOpacity: shot.isolatedGroup ? 0.14 : 0.21,
            }
          );
        } else {
          cleanTransparentAlphaEdge(s.imageData.data, 2);
        }
      }

      s.ctx2d.clearRect(0, 0, s.captureWidth, s.captureHeight);
      s.ctx2d.putImageData(s.imageData, 0, 0);
      s.plates[shot.key] = s.canvas2d.toDataURL('image/png');
      s.plateSources[shot.key] =
        s.quality === 'print_2880' ? 'webgl_2880' : 'webgl_1440';
    }

    // Project DK callouts & circular magnification loupe anchors for both Cycles and WebGL plates
    if (shot.key === 'cover_hero') {
      const heroAnchors = projectExplodedPartAnchors(
        s.weaponId,
        s.plugin.parts,
        s.captureCam,
        shot.explodeT
      );
      s.dkHeroCallouts = solveDkAnnotatedCallouts(heroAnchors, 10);
      s.loupeAnchors = projectLoupeAnchors(
        s.weaponId,
        s.plugin.parts,
        s.captureCam
      );
    } else if (shot.key === 'stencil_cutaway') {
      const internalParts = s.plugin.parts.filter((p) => !p.isShell);
      const cutawayPool =
        internalParts.length >= 6 ? internalParts : s.plugin.parts;
      const cutawayAnchors = projectExplodedPartAnchors(
        s.weaponId,
        cutawayPool,
        s.captureCam,
        shot.explodeT
      );
      s.dkCutawayCallouts = solveDkAnnotatedCallouts(cutawayAnchors, 9);
    } else if (shot.key === 'exploded_bom') {
      const explodedAnchors = projectExplodedPartAnchors(
        s.weaponId,
        s.plugin.parts,
        s.captureCam,
        shot.explodeT
      );
      s.explodedPins = solveExplodedPinLayout(explodedAnchors);
      s.dkExplodedCallouts = solveDkAnnotatedCallouts(explodedAnchors, 12);
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
      cacheKey: buildMonographCacheKey(s.weaponId, s.edition, s.quality),
      weaponId: s.weaponId,
      edition: s.edition,
      quality: s.quality,
      capturedAtIso: new Date().toISOString(),
      plates: s.plates as Record<MonographPlateKey, string>,
      plateSources: s.plateSources,
      explodedPins: s.explodedPins,
      dkHeroCallouts: s.dkHeroCallouts,
      dkCutawayCallouts: s.dkCutawayCallouts,
      dkExplodedCallouts: s.dkExplodedCallouts,
      loupeAnchors: s.loupeAnchors,
    });
  }, 2);

  return null;
};

export const MonographCaptureRig: React.FC = () => {
  const { activeRequest } = useMonographCaptureState();
  if (!activeRequest) return null;
  return (
    <ActiveMonographCaptureWorker
      key={`${activeRequest.requestId}:${activeRequest.weaponId}:${activeRequest.edition}:${activeRequest.quality}`}
      requestId={activeRequest.requestId}
      weaponId={activeRequest.weaponId}
      edition={activeRequest.edition}
      quality={activeRequest.quality}
    />
  );
};
