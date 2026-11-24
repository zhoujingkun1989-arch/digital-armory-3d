import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { useAppStore } from '../../store/useAppStore';
import type { WeaponScaleProfile } from '../../weapons/types';
import {
  DEFAULT_ARMORY_ENVIRONMENT,
  getArmoryEnvironment,
  type ArmoryEnvironmentPreset,
} from './GunsmithStageMat';
import {
  createFpsWatchdogState,
  stepDownGraphicsQuality,
  updateFpsWatchdog,
} from './graphicsQuality';
import {
  isGpuTelemetryEnabled,
  publishGpuTelemetrySample,
  type GpuTelemetrySampleInput,
} from './gpuTelemetryBus';

// =====================================================================================
// 1. Post-Processing Configuration & Pure Testable Helpers (1 world unit = 1 cm)
// =====================================================================================

export type GtaoQualityMode = 'half' | 'adaptive' | 'full';

export interface ArmoryGtaoParams {
  /** World-space occlusion radius in cm (`1.8` = 18 mm reach around bolts, rails & lugs) */
  radius: number;
  /** > 1 concentrates samples tightly into sub-millimeter contact seams */
  distanceExponent: number;
  /** Max occluder thickness in cm before ignoring background depth jumps */
  thickness: number;
  distanceFallOff: number;
  scale: number;
  samples: number;
  screenSpaceRadius: boolean;
  blendIntensity: number;
  pdLumaPhi: number;
  pdDepthPhi: number;
  pdNormalPhi: number;
  pdRadius: number;
  pdRadiusExponent: number;
  pdRings: number;
  pdSamples: number;
}

export interface ArmoryBloomParams {
  /** Strict HDR luminance cutoff (>= 1.15) so normal lit PBR surfaces never haze */
  threshold: number;
  strength: number;
  radius: number;
}

export interface ArmoryPostProcessingParams {
  preset: ArmoryEnvironmentPreset;
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  gtao: ArmoryGtaoParams;
  bloom: ArmoryBloomParams;
}

export const ARMORY_POSTFX_DEFAULTS = {
  gtao: {
    radius: 1.8,
    distanceExponent: 1.65,
    thickness: 1.35,
    distanceFallOff: 1.0,
    scale: 1.12,
    samples: 16,
    screenSpaceRadius: false,
    pdLumaPhi: 10,
    pdDepthPhi: 2,
    pdNormalPhi: 3.2,
    pdRadius: 6,
    pdRadiusExponent: 1.5,
    pdRings: 2,
    pdSamples: 16,
  },
  bloom: {
    threshold: 3.2,
    strength: 0.32,
    radius: 0.45,
  },
} as const;

export function getGtaoScaleParams(
  baseGtao: ArmoryGtaoParams,
  scaleProfile?: WeaponScaleProfile
): ArmoryGtaoParams {
  if (scaleProfile !== 'main_battle_tank') return baseGtao;
  return {
    ...baseGtao,
    // 1:1 10-meter Main Battle Tank world-space AO reach (28 cm around turret overhangs, ERA & roadwheels)
    radius: 28.0,
    distanceExponent: 1.42,
    thickness: 24.0,
    scale: 1.38,
    pdRadius: 7,
    blendIntensity: Math.min(1.38, baseGtao.blendIntensity * 1.22),
  };
}

export function getPostProcessingPresetParams(
  preset: ArmoryEnvironmentPreset = DEFAULT_ARMORY_ENVIRONMENT,
  scaleProfile?: WeaponScaleProfile
): ArmoryPostProcessingParams {
  const env = getArmoryEnvironment(preset);
  const isTank = scaleProfile === 'main_battle_tank';
  // Raise bloom cutoff slightly for 1:1 MBTs so bright hangar clerestory reflections on optics & wet
  // concrete oil slicks stay razor-crisp while 125mm/120mm/88mm main gun blasts still bloom vividly.
  const bloomThreshold =
    preset === 'blueprint_daylight' ? 3.5 : isTank ? 3.4 : 3.2;
  const bloomStrength =
    isTank && preset !== 'blueprint_daylight'
      ? env.postfx.bloomStrength * 0.92
      : env.postfx.bloomStrength;
  const baseGtao: ArmoryGtaoParams = {
    ...ARMORY_POSTFX_DEFAULTS.gtao,
    blendIntensity: env.postfx.gtaoIntensity,
  };
  return {
    preset: env.id,
    toneMapping: THREE.AgXToneMapping,
    toneMappingExposure: env.toneMappingExposure,
    gtao: getGtaoScaleParams(baseGtao, scaleProfile),
    bloom: {
      threshold: bloomThreshold,
      strength: bloomStrength,
      radius: ARMORY_POSTFX_DEFAULTS.bloom.radius,
    },
  };
}

/**
 * Creates the HDR `WebGLRenderTarget` backing `EffectComposer`.
 *
 * CRITICAL INVARIANT: `stencilBuffer: true` + `depthBuffer: true` + `HalfFloatType`
 * is mandatory so Two-Pass WebGL Stencil Cross-Section Capping (`C`) continues to work
 * seamlessly inside `RenderPass` while keeping linear HDR values unclamped for Bloom & AgX.
 */
export function createArmoryComposerRenderTarget(
  width: number,
  height: number
): THREE.WebGLRenderTarget {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const rt = new THREE.WebGLRenderTarget(safeW, safeH, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: true,
  });
  rt.texture.name = 'ArmoryEffectComposer.HDRStencilRT';
  return rt;
}

const MAX_GTAO_LONG_EDGE = 2160;

/**
 * Computes internal G-buffer / Poisson-denoise dimensions for `GTAOPass` from physical
 * framebuffer pixels (`cssSize * dpr`), balancing sub-millimeter sharpness with 60fps Retina headroom.
 */
export function computeGtaoInternalSize(
  effectiveWidth: number,
  effectiveHeight: number,
  quality: GtaoQualityMode = 'adaptive',
  dpr = 1
): { width: number; height: number; scale: number } {
  const baseW = Math.max(1, Math.floor(effectiveWidth));
  const baseH = Math.max(1, Math.floor(effectiveHeight));

  let scale =
    quality === 'half'
      ? 0.5
      : quality === 'full'
        ? 1.0
        : dpr > 1.35
          ? 0.75
          : 1.0;

  const longEdge = Math.max(baseW, baseH) * scale;
  if (longEdge > MAX_GTAO_LONG_EDGE) {
    scale *= MAX_GTAO_LONG_EDGE / longEdge;
  }

  return {
    width: Math.max(1, Math.round(baseW * scale)),
    height: Math.max(1, Math.round(baseH * scale)),
    scale,
  };
}

/**
 * Softens GTAO blend intensity when X-Ray shell transparency or longitudinal section cut
 * is active so exposed internal fire-control parts remain luminous and free of ghost halos.
 */
export function resolveGtaoBlendIntensity(
  baseIntensity: number,
  xrayShells: boolean,
  sectionCut: boolean
): number {
  if (xrayShells) return baseIntensity * 0.58;
  if (sectionCut) return baseIntensity * 0.88;
  return baseIntensity;
}

/**
 * Resolves effective HDR bloom strength per frame so sliced inner `-Z` steel walls in
 * `Section Cut (C)` and cold metal outside `firing` mode never blow out in white specular haze,
 * while preserving crisp pyrotechnic HDR muzzle-flash & shock-diamond bloom during firing.
 */
export function resolveEffectiveBloomStrength(
  baseStrength: number,
  sectionCut: boolean,
  isFiringMode: boolean
): number {
  if (sectionCut) {
    return isFiringMode ? baseStrength * 0.42 : 0;
  }
  return isFiringMode ? baseStrength : baseStrength * 0.32;
}

export function resolveEffectiveBloomThreshold(
  baseThreshold: number,
  sectionCut: boolean,
  isFiringMode: boolean
): number {
  if (sectionCut) {
    return Math.max(baseThreshold, 4.8);
  }
  return isFiringMode ? baseThreshold : Math.max(baseThreshold, 3.8);
}

function shouldExcludeMaterialFromGtao(
  mat: THREE.Material | undefined
): boolean {
  if (!mat) return true;
  if (!mat.visible) return true;
  // Pass A / Pass B stencil increment-decrement helper meshes write stencil only
  if (mat.colorWrite === false) return true;
  // Pass C stencil cap quads & custom procedural shaders (e.g. infinite Grid XY->XZ swizzle)
  if ((mat as THREE.ShaderMaterial).isShaderMaterial) return true;
  if (mat.stencilWrite && mat.stencilFunc !== THREE.AlwaysStencilFunc) {
    return true;
  }
  // Sliced outer shells in section-cut mode: scene.overrideMaterial ignores per-mesh clippingPlanes,
  // so excluding clipped outer housings prevents their cut-away +Z half from occluding internal parts
  if (mat.clippingPlanes && mat.clippingPlanes.length > 0) {
    return true;
  }
  // Additive muzzle flash / Mach shock diamonds & translucent X-Ray / ghost / smoke / ContactShadows
  if (mat.blending === THREE.AdditiveBlending) return true;
  if (mat.transparent) return true;
  if (mat.depthWrite === false) return true;
  return false;
}

/**
 * Determines whether a scene object must be hidden during `GTAOPass`'s opaque
 * `MeshNormalMaterial` override pass so X-Ray shells, stencil caps, infinite grid shaders,
 * ContactShadows, and additive muzzle VFX never cast dark phantom AO halos.
 */
export function shouldExcludeFromGtaoPass(object: THREE.Object3D): boolean {
  if (
    (object as THREE.Points).isPoints ||
    (object as THREE.Line).isLine ||
    (object as THREE.Sprite).isSprite
  ) {
    return true;
  }
  if (object.userData?.excludeFromGtao === true) {
    return true;
  }
  if ((object as THREE.Mesh).isMesh) {
    const mesh = object as THREE.Mesh;
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      if (mat.length === 0) return true;
      for (let i = 0; i < mat.length; i++) {
        if (shouldExcludeMaterialFromGtao(mat[i])) return true;
      }
      return false;
    }
    return shouldExcludeMaterialFromGtao(mat);
  }
  return false;
}

export function applyRendererToneMapping(
  renderer: THREE.WebGLRenderer,
  toneMapping: THREE.ToneMapping,
  exposure: number,
  outputColorSpace?: THREE.ColorSpace
): void {
  renderer.toneMapping = toneMapping;
  renderer.toneMappingExposure = exposure;
  if (outputColorSpace !== undefined) {
    renderer.outputColorSpace = outputColorSpace;
  }
}

/**
 * Hardens `GTAOPass` against upstream Three.js r169 `NaN` hazards on Apple Metal / ANGLE:
 * 1. Switches internal `[0, 1]` AO targets (`gtaoRenderTarget`, `pdRenderTarget`) from `HalfFloatType`
 *    to `UnsignedByteType` (`RGBA8` UNORM) so GPU ROP hardware physically flushes `NaN` -> 0 and clamps `[0, 1]`.
 * 2. Patches `GTAOShader` & `PoissonDenoiseShader` to guard `normalize(vec3(0.0))` when same-texel
 *    depth samples produce `viewDelta == 0`, clamp `cosHorizons` inside `[-0.99999, 0.99999]` before
 *    `acos()` / `sqrt(1 - c^2)`, and guard `pow(0.0, y)` `log2(0)` evaluations.
 */
export function hardenGtaoPassAgainstNaN(gtaoPass: GTAOPass): void {
  gtaoPass.gtaoRenderTarget.texture.type = THREE.UnsignedByteType;
  gtaoPass.pdRenderTarget.texture.type = THREE.UnsignedByteType;

  gtaoPass.gtaoMaterial.fragmentShader = gtaoPass.gtaoMaterial.fragmentShader
    .replace(
      'vec3 normalInSlice = normalize(viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent));',
      'vec3 rawNormalInSlice = viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent); vec3 normalInSlice = dot(rawNormalInSlice, rawNormalInSlice) > 1e-8 ? rawNormalInSlice * inversesqrt(dot(rawNormalInSlice, rawNormalInSlice)) : viewDir;'
    )
    .split('if (abs(viewDelta.z) < thickness) {')
    .join(
      'if (abs(viewDelta.z) < thickness && dot(viewDelta, viewDelta) > 1e-8) {'
    )
    .replace(
      'vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);',
      'cosHorizons = clamp(cosHorizons, vec2(-0.99999), vec2(0.99999)); vec2 sinHorizons = sqrt(max(vec2(0.0), 1. - cosHorizons * cosHorizons));'
    )
    .replace('ao = pow(ao, scale);', 'ao = pow(max(ao, 1e-5), scale);');
  gtaoPass.gtaoMaterial.needsUpdate = true;

  gtaoPass.pdMaterial.fragmentShader =
    gtaoPass.pdMaterial.fragmentShader.replace(
      'float normalSimilarity = pow(max(normalDiff, 0.), normalPhi);',
      'float normalSimilarity = pow(max(normalDiff, 1e-5), normalPhi);'
    );
  gtaoPass.pdMaterial.needsUpdate = true;
}

const SAFE_BLOOM_HIGHPASS_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 defaultColor;
uniform float defaultOpacity;
uniform float luminosityThreshold;
uniform float smoothWidth;

varying vec2 vUv;

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
  vec4 texel = texture2D( tDiffuse, vUv );
  vec3 safeRgb = armorySanitizeHdrRgb( texel.rgb );
  float v = luminance( safeRgb );
  vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );
  float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );
  gl_FragColor = mix( outputColor, vec4( safeRgb, 1.0 ), alpha );
}
`;

/**
 * Installs an IEEE-754 integer bitmask (`floatBitsToUint`) `NaN` / `Infinity` / `fp16`-overflow
 * firewall at the entrance of `UnrealBloomPass` (`materialHighPassFilter`) so a rogue non-finite
 * HDR pixel can NEVER expand across the 5-mip separable Gaussian pyramid into a ~516×516 black square.
 */
export function hardenBloomPassAgainstNaN(bloomPass: UnrealBloomPass): void {
  bloomPass.materialHighPassFilter.fragmentShader =
    SAFE_BLOOM_HIGHPASS_FRAGMENT;
  bloomPass.materialHighPassFilter.needsUpdate = true;
}

const SAFE_OUTPUT_VERTEX = /* glsl */ `
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

const SAFE_OUTPUT_FRAGMENT = /* glsl */ `
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
  float safeA = ( ( floatBitsToUint( texel.a ) & 0x7f800000u ) == 0x7f800000u )
    ? 1.0
    : clamp( texel.a, 0.0, 1.0 );
  vec4 outColor = vec4( armorySanitizeHdrRgb( texel.rgb ), safeA );

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

  pc_fragColor = outColor;
}
`;

/**
 * Upgrades `OutputPass` (`RawShaderMaterial`) to GLSL ES 3.00 (`THREE.GLSL3`) and applies an
 * IEEE-754 `floatBitsToUint` `NaN` / `Infinity` sanitizer prior to `AgXToneMapping`.
 */
export function hardenOutputPassAgainstNaN(outputPass: OutputPass): void {
  outputPass.material.glslVersion = THREE.GLSL3;
  outputPass.material.vertexShader = SAFE_OUTPUT_VERTEX;
  outputPass.material.fragmentShader = SAFE_OUTPUT_FRAGMENT;
  outputPass.material.needsUpdate = true;
}

// =====================================================================================
// 1b. Macro Depth-of-Field (Bokeh) & Photographic Filmic Lens Finish
// =====================================================================================

export interface MacroBokehParams {
  enabled: boolean;
  focus: number;
  aperture: number;
  maxblur: number;
}

/**
 * Computes physically restrained 85mm macro lens Bokeh parameters from the camera's
 * distance to the active OrbitControls focus target (`1 unit = 1 cm`).
 *
 * - Full-weapon framing (`>= 44 cm`): automatically disabled (`aperture = 0`) for 100% tack-sharp detail.
 * - Close-up macro inspection (`< 44 cm`): smoothly increases subtle circular bokeh so the foreground/
 *   background mat and far extremities fall gently out of focus like an 85mm f/2.8 studio macro lens.
 * - Always suppressed during Section Cut (`[C]`), X-Ray (`[X]`), or Vernier Caliper (`[K]`).
 */
export function computeMacroBokehParams(
  cameraDistanceCm: number,
  macroDofEnabled: boolean,
  suppressed: boolean
): MacroBokehParams {
  if (!macroDofEnabled || suppressed || !Number.isFinite(cameraDistanceCm)) {
    return { enabled: false, focus: 30, aperture: 0, maxblur: 0.005 };
  }
  const dist = Math.max(3, cameraDistanceCm);
  // Smooth ramp from 0 at >= 44 cm up to full macro depth-of-field around <= 18 cm
  const rawT = (44 - dist) / (44 - 18);
  const t = Math.max(0, Math.min(1, rawT));
  const smooth = t * t * (3 - 2 * t);
  if (smooth <= 0.005) {
    return { enabled: false, focus: dist, aperture: 0, maxblur: 0.005 };
  }
  return {
    enabled: true,
    focus: dist,
    aperture: 0.00014 * smooth,
    maxblur: 0.0052 * smooth,
  };
}

export interface FilmicLensPresetParams {
  vignetteStrength: number;
  grainStrength: number;
  contrast: number;
}

export function getFilmicLensPresetParams(
  preset: ArmoryEnvironmentPreset,
  scaleProfile?: WeaponScaleProfile
): FilmicLensPresetParams {
  if (preset === 'blueprint_daylight') {
    return { vignetteStrength: 0.0, grainStrength: 0.0, contrast: 1.0 };
  }
  const isTank = scaleProfile === 'main_battle_tank';
  if (preset === 'gunsmith_bench') {
    return isTank
      ? { vignetteStrength: 0.21, grainStrength: 0.008, contrast: 1.032 }
      : { vignetteStrength: 0.16, grainStrength: 0.0075, contrast: 1.025 };
  }
  return isTank
    ? { vignetteStrength: 0.25, grainStrength: 0.009, contrast: 1.038 }
    : { vignetteStrength: 0.2, grainStrength: 0.0085, contrast: 1.03 };
}

const FILMIC_LENS_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignetteStrength: { value: 0.2 },
    uGrainStrength: { value: 0.0085 },
    uContrast: { value: 1.03 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignetteStrength;
    uniform float uGrainStrength;
    uniform float uContrast;
    varying vec2 vUv;

    float filmicHash( vec2 p ) {
      vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
      p3 += dot( p3, p3.yzx + 33.33 );
      return fract( ( p3.x + p3.y ) * p3.z );
    }

    void main() {
      vec4 tex = texture2D( tDiffuse, vUv );
      vec3 col = clamp( tex.rgb, 0.0, 1.0 );

      // Gentle optical micro-contrast curve preserving deep shadows & bright metallic highlights
      col = clamp( ( col - 0.5 ) * uContrast + 0.5, 0.0, 1.0 );

      // Restrained 85mm studio lens elliptical vignette (0 in daylight blueprint mode)
      if ( uVignetteStrength > 0.0001 ) {
        vec2 centered = ( vUv - 0.5 ) * vec2( 1.08, 1.0 );
        float distSq = dot( centered, centered );
        float vig = 1.0 - smoothstep( 0.18, 0.72, distSq ) * uVignetteStrength;
        col *= vig;
      }

      // Perceptual sensor micro-dither (eliminates 8-bit dark studio backdrop banding)
      if ( uGrainStrength > 0.0001 ) {
        float n = filmicHash( gl_FragCoord.xy ) - 0.5;
        float shadowWeight = mix( 1.0, 0.35, clamp( dot( col, vec3( 0.299, 0.587, 0.114 ) ) * 2.0, 0.0, 1.0 ) );
        col = clamp( col + vec3( n * uGrainStrength * shadowWeight ), 0.0, 1.0 );
      }

      gl_FragColor = vec4( col, tex.a );
    }
  `,
};

export function createFilmicLensPass(
  preset: ArmoryEnvironmentPreset = DEFAULT_ARMORY_ENVIRONMENT,
  scaleProfile?: WeaponScaleProfile
): ShaderPass {
  const pass = new ShaderPass(FILMIC_LENS_SHADER);
  const cfg = getFilmicLensPresetParams(preset, scaleProfile);
  pass.uniforms.uVignetteStrength.value = cfg.vignetteStrength;
  pass.uniforms.uGrainStrength.value = cfg.grainStrength;
  pass.uniforms.uContrast.value = cfg.contrast;
  return pass;
}

// =====================================================================================
// 2. Active EffectComposer Pipeline (mounted only when `enabled === true`)
// =====================================================================================

interface ActiveComposerProps {
  environmentPreset: ArmoryEnvironmentPreset;
  scaleProfile?: WeaponScaleProfile;
  gtaoQuality: GtaoQualityMode;
  enableGtao: boolean;
  enableBloom: boolean;
  enableSmaa: boolean;
  enableMacroDof: boolean;
  enableFilmicLens: boolean;
  contextEpoch: number;
}

interface ComposerRig {
  composer: EffectComposer;
  renderPass: RenderPass;
  gtaoPass: GTAOPass;
  bloomPass: UnrealBloomPass;
  bokehPass: BokehPass;
  outputPass: OutputPass;
  filmicLensPass: ShaderPass;
  smaaPass: SMAAPass | null;
  lastCssW: number;
  lastCssH: number;
  lastDpr: number;
  lastQuality: GtaoQualityMode;
}

const _bokehOrigin = new THREE.Vector3();

// Pre-allocated mutable sample payload so telemetry sampling performs zero GC in `useFrame`
const _gpuTelemetrySample: GpuTelemetrySampleInput = {
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
};

/**
 * Zero-overhead WebGL renderer telemetry sampler invoked at the end of each rendered frame.
 * Strictly gated behind `isGpuTelemetryEnabled()` (single boolean check when HUD is closed;
 * zero `gl.info` reads and zero heap allocations).
 */
export function sampleRendererGpuTelemetry(
  gl: Pick<THREE.WebGLRenderer, 'info'>,
  deltaSec: number
): boolean {
  if (!isGpuTelemetryEnabled()) {
    return false;
  }
  const safeMs =
    deltaSec > 0 && Number.isFinite(deltaSec)
      ? Math.min(1000, deltaSec * 1000)
      : 16.67;
  _gpuTelemetrySample.frameMs = safeMs;
  _gpuTelemetrySample.drawCalls = gl.info.render.calls;
  _gpuTelemetrySample.triangles = gl.info.render.triangles;
  _gpuTelemetrySample.geometries = gl.info.memory.geometries;
  _gpuTelemetrySample.textures = gl.info.memory.textures;
  _gpuTelemetrySample.programs = gl.info.programs?.length ?? 0;
  return publishGpuTelemetrySample(_gpuTelemetrySample);
}

/**
 * Renders one `EffectComposer` frame while preserving real accumulated scene
 * draw-call & triangle counts whenever the GPU telemetry HUD is enabled.
 * Without temporarily disabling `gl.info.autoReset`, each fullscreen post-processing
 * pass (`OutputPass` / `SMAAPass`) wipes `gl.info.render` down to `1 call / 1 tri`.
 * Zero-GC inside `useFrame`; always restores `gl.info.autoReset = true` in `finally`.
 */
export function renderComposerWithTelemetry(
  composer: { render: (delta?: number) => void },
  gl: Pick<THREE.WebGLRenderer, 'info'>,
  deltaSec: number
): boolean {
  const clampedDelta = Math.min(deltaSec, 0.1);
  if (!isGpuTelemetryEnabled()) {
    if (!gl.info.autoReset) {
      gl.info.autoReset = true;
    }
    composer.render(clampedDelta);
    return false;
  }

  gl.info.autoReset = false;
  gl.info.reset();
  try {
    composer.render(clampedDelta);
    return sampleRendererGpuTelemetry(gl, deltaSec);
  } finally {
    gl.info.autoReset = true;
  }
}

/**
 * Complete GPU teardown for Three.js r169 `GTAOPass`, disposing internal materials & cached
 * object maps that upstream `GTAOPass.dispose()` omits (`gtaoMaterial`, `blendMaterial`,
 * `depthTexture`, `_visibilityCache`).
 */
export function disposeGtaoPassResources(gtaoPass: GTAOPass): void {
  gtaoPass.dispose();
  const ext = gtaoPass as unknown as {
    gtaoMaterial?: THREE.Material;
    blendMaterial?: THREE.Material;
    depthTexture?: THREE.Texture | null;
    _visibilityCache?: Map<THREE.Object3D, boolean>;
  };
  ext.gtaoMaterial?.dispose();
  ext.blendMaterial?.dispose();
  if (ext.depthTexture && typeof ext.depthTexture.dispose === 'function') {
    ext.depthTexture.dispose();
  }
  ext._visibilityCache?.clear();
}

/**
 * Minimal zero-overhead telemetry sampler active only when `EffectComposer` is bypassed (e.g. Eco tier),
 * guaranteeing live GPU metrics across all three quality profiles while costing 1 boolean check when closed.
 */
const PassiveGpuTelemetrySampler: React.FC = () => {
  const { gl } = useThree();
  useFrame((_, delta) => {
    if (isGpuTelemetryEnabled()) {
      sampleRendererGpuTelemetry(gl, delta);
    }
  });
  return null;
};

const ActiveArmoryComposer: React.FC<ActiveComposerProps> = ({
  environmentPreset,
  scaleProfile,
  gtaoQuality,
  enableGtao,
  enableBloom,
  enableSmaa,
  enableMacroDof,
  enableFilmicLens,
  contextEpoch,
}) => {
  const { gl, scene, camera, size } = useThree();
  const dpr = gl.getPixelRatio();

  const rigRef = useRef<ComposerRig | null>(null);
  const qualityRef = useRef<GtaoQualityMode>(gtaoQuality);
  const baseGtaoIntensityRef = useRef<number>(
    getPostProcessingPresetParams(environmentPreset, scaleProfile).gtao
      .blendIntensity
  );
  const baseBloomStrengthRef = useRef<number>(
    getPostProcessingPresetParams(environmentPreset, scaleProfile).bloom
      .strength
  );
  const baseBloomThresholdRef = useRef<number>(
    getPostProcessingPresetParams(environmentPreset, scaleProfile).bloom
      .threshold
  );
  const enableGtaoRef = useRef<boolean>(enableGtao);
  const enableBloomRef = useRef<boolean>(enableBloom);
  const enableMacroDofRef = useRef<boolean>(enableMacroDof);
  const enableFilmicLensRef = useRef<boolean>(enableFilmicLens);
  const scaleProfileRef = useRef<WeaponScaleProfile | undefined>(scaleProfile);
  const watchdogRef = useRef(createFpsWatchdogState());

  // Build EffectComposer + passes once per (gl, scene, camera, contextEpoch) lifecycle
  useEffect(() => {
    const cssW = Math.max(1, size.width);
    const cssH = Math.max(1, size.height);
    const curDpr = gl.getPixelRatio();
    const effW = Math.max(1, Math.floor(cssW * curDpr));
    const effH = Math.max(1, Math.floor(cssH * curDpr));

    const initialParams = getPostProcessingPresetParams(
      environmentPreset,
      scaleProfile
    );

    const renderTarget = createArmoryComposerRenderTarget(effW, effH);
    const composer = new EffectComposer(gl, renderTarget);
    // Normalize EffectComposer internal CSS size & pixelRatio immediately so passes never scale by dpr^2
    composer.setPixelRatio(curDpr);
    composer.setSize(cssW, cssH);

    // 1. HDR Linear Scene RenderPass (Three.js r169 automatically disables inline toneMapping when rendering to RT)
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // 2. Metric Ground-Truth Ambient Occlusion (1 unit = 1 cm)
    const gtaoSize = computeGtaoInternalSize(
      effW,
      effH,
      qualityRef.current,
      curDpr
    );
    const gtaoPass = new GTAOPass(
      scene,
      camera,
      gtaoSize.width,
      gtaoSize.height
    );
    const rawGtaoSetSize = gtaoPass.setSize.bind(gtaoPass);
    gtaoPass.setSize = (w: number, h: number): void => {
      const scaled = computeGtaoInternalSize(
        w,
        h,
        qualityRef.current,
        gl.getPixelRatio()
      );
      rawGtaoSetSize(scaled.width, scaled.height);
    };

    // Zero-GC visibility filter so X-Ray shells, StencilSectionCap planes, Grid & VFX never ghost in AO
    const visibilityCache = (
      gtaoPass as unknown as { _visibilityCache: Map<THREE.Object3D, boolean> }
    )._visibilityCache;
    const visitForGtao = (obj: THREE.Object3D): void => {
      visibilityCache.set(obj, obj.visible);
      if (obj.visible && shouldExcludeFromGtaoPass(obj)) {
        obj.visible = false;
      }
    };
    gtaoPass.overrideVisibility = (): void => {
      gtaoPass.scene.traverse(visitForGtao);
    };

    gtaoPass.updateGtaoMaterial({
      radius: initialParams.gtao.radius,
      distanceExponent: initialParams.gtao.distanceExponent,
      thickness: initialParams.gtao.thickness,
      distanceFallOff: initialParams.gtao.distanceFallOff,
      scale: initialParams.gtao.scale,
      samples: initialParams.gtao.samples,
      screenSpaceRadius: initialParams.gtao.screenSpaceRadius,
    });
    gtaoPass.updatePdMaterial({
      lumaPhi: initialParams.gtao.pdLumaPhi,
      depthPhi: initialParams.gtao.pdDepthPhi,
      normalPhi: initialParams.gtao.pdNormalPhi,
      radius: initialParams.gtao.pdRadius,
      radiusExponent: initialParams.gtao.pdRadiusExponent,
      rings: initialParams.gtao.pdRings,
      samples: initialParams.gtao.pdSamples,
    });
    gtaoPass.blendIntensity = initialParams.gtao.blendIntensity;
    hardenGtaoPassAgainstNaN(gtaoPass);
    composer.addPass(gtaoPass);

    // 3. Selective HDR Emissive UnrealBloomPass (threshold = 3.2+ with IEEE-754 NaN/Inf firewall)
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(effW, effH),
      initialParams.bloom.strength,
      initialParams.bloom.radius,
      initialParams.bloom.threshold
    );
    hardenBloomPassAgainstNaN(bloomPass);
    composer.addPass(bloomPass);

    // 4. Adaptive Close-Up Macro Bokeh Depth-of-Field (runs in HDR prior to OutputPass NaN firewall;
    //    auto-disabled at full-weapon distance and during Section Cut / X-Ray / Caliper)
    const bokehPass = new BokehPass(scene, camera, {
      focus: 28,
      aperture: 0.0001,
      maxblur: 0.005,
    });
    bokehPass.enabled = false;
    const rawBokehRender = bokehPass.render.bind(bokehPass);
    const bokehHidden: THREE.Object3D[] = [];
    bokehPass.render = (renderer, writeBuffer, readBuffer, dt, maskActive) => {
      bokehHidden.length = 0;
      scene.traverse((obj) => {
        if (obj.visible && shouldExcludeFromGtaoPass(obj)) {
          obj.visible = false;
          bokehHidden.push(obj);
        }
      });
      try {
        rawBokehRender(renderer, writeBuffer, readBuffer, dt, maskActive);
      } finally {
        for (let i = 0; i < bokehHidden.length; i++) {
          bokehHidden[i].visible = true;
        }
        bokehHidden.length = 0;
      }
    };
    composer.addPass(bokehPass);

    // 5. Single AgX Tone-Mapping + Linear->sRGB OutputPass (reads gl.toneMapping & gl.toneMappingExposure)
    const outputPass = new OutputPass();
    hardenOutputPassAgainstNaN(outputPass);
    composer.addPass(outputPass);

    // 6. Photographic Filmic Lens Finish (subtle studio/hangar vignette + anti-banding sensor micro-dither)
    const filmicLensPass = createFilmicLensPass(environmentPreset, scaleProfile);
    filmicLensPass.enabled = enableFilmicLensRef.current;
    composer.addPass(filmicLensPass);

    // 7. Perceptual LDR Subpixel Morphological Anti-Aliasing (SMAAPass)
    let smaaPass: SMAAPass | null = null;
    if (typeof Image !== 'undefined') {
      smaaPass = new SMAAPass(effW, effH);
      smaaPass.materialEdges.toneMapped = false;
      smaaPass.materialWeights.toneMapped = false;
      smaaPass.materialBlend.toneMapped = false;
      composer.addPass(smaaPass);
    }

    rigRef.current = {
      composer,
      renderPass,
      gtaoPass,
      bloomPass,
      bokehPass,
      outputPass,
      filmicLensPass,
      smaaPass,
      lastCssW: cssW,
      lastCssH: cssH,
      lastDpr: curDpr,
      lastQuality: qualityRef.current,
    };

    return () => {
      rigRef.current = null;
      gl.info.autoReset = true;
      renderPass.dispose();
      disposeGtaoPassResources(gtaoPass);
      bloomPass.dispose();
      bokehPass.dispose();
      outputPass.dispose();
      filmicLensPass.dispose();
      smaaPass?.dispose();
      composer.dispose();
    };
    // Viewport size & preset updates are handled without reallocating passes in the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, contextEpoch]);

  // Handle window / canvas / DPR resize cleanly without redundant RT reallocations
  useEffect(() => {
    qualityRef.current = gtaoQuality;
    const rig = rigRef.current;
    if (!rig) return;
    const cssW = Math.max(1, size.width);
    const cssH = Math.max(1, size.height);
    const curDpr = gl.getPixelRatio();
    const sizeChanged = rig.lastCssW !== cssW || rig.lastCssH !== cssH;
    const dprChanged = rig.lastDpr !== curDpr;
    const qualityChanged = rig.lastQuality !== gtaoQuality;
    if (!sizeChanged && !dprChanged && !qualityChanged) return;

    rig.lastCssW = cssW;
    rig.lastCssH = cssH;
    rig.lastDpr = curDpr;
    rig.lastQuality = gtaoQuality;

    if (dprChanged) {
      // `setPixelRatio` updates internal pixelRatio and triggers a resize; only call setSize after if CSS dims changed too
      rig.composer.setPixelRatio(curDpr);
    }
    if (sizeChanged || qualityChanged || !dprChanged) {
      rig.composer.setSize(cssW, cssH);
    }
  }, [gl, size.width, size.height, dpr, gtaoQuality]);

  // Sync preset, scale-aware GTAO reach & pass toggles without tearing down GPU targets
  useEffect(() => {
    enableGtaoRef.current = enableGtao;
    enableBloomRef.current = enableBloom;
    enableMacroDofRef.current = enableMacroDof;
    enableFilmicLensRef.current = enableFilmicLens;
    scaleProfileRef.current = scaleProfile;
    const rig = rigRef.current;
    if (!rig) return;
    const params = getPostProcessingPresetParams(
      environmentPreset,
      scaleProfile
    );
    baseGtaoIntensityRef.current = params.gtao.blendIntensity;
    baseBloomStrengthRef.current = params.bloom.strength;
    baseBloomThresholdRef.current = params.bloom.threshold;

    rig.gtaoPass.updateGtaoMaterial({
      radius: params.gtao.radius,
      distanceExponent: params.gtao.distanceExponent,
      thickness: params.gtao.thickness,
      distanceFallOff: params.gtao.distanceFallOff,
      scale: params.gtao.scale,
      samples: params.gtao.samples,
      screenSpaceRadius: params.gtao.screenSpaceRadius,
    });
    rig.gtaoPass.updatePdMaterial({
      lumaPhi: params.gtao.pdLumaPhi,
      depthPhi: params.gtao.pdDepthPhi,
      normalPhi: params.gtao.pdNormalPhi,
      radius: params.gtao.pdRadius,
      radiusExponent: params.gtao.pdRadiusExponent,
      rings: params.gtao.pdRings,
      samples: params.gtao.pdSamples,
    });
    rig.gtaoPass.enabled = enableGtao;
    rig.gtaoPass.blendIntensity = params.gtao.blendIntensity;

    rig.bloomPass.enabled = enableBloom && params.bloom.strength > 0.001;
    rig.bloomPass.threshold = params.bloom.threshold;
    rig.bloomPass.strength = params.bloom.strength;
    rig.bloomPass.radius = params.bloom.radius;

    const lensCfg = getFilmicLensPresetParams(environmentPreset, scaleProfile);
    rig.filmicLensPass.uniforms.uVignetteStrength.value =
      lensCfg.vignetteStrength;
    rig.filmicLensPass.uniforms.uGrainStrength.value = lensCfg.grainStrength;
    rig.filmicLensPass.uniforms.uContrast.value = lensCfg.contrast;
    rig.filmicLensPass.enabled =
      enableFilmicLens &&
      (lensCfg.vignetteStrength > 0.0001 || lensCfg.grainStrength > 0.0001);

    if (rig.smaaPass) {
      rig.smaaPass.enabled = enableSmaa;
    }
  }, [
    environmentPreset,
    scaleProfile,
    enableGtao,
    enableBloom,
    enableSmaa,
    enableMacroDof,
    enableFilmicLens,
  ]);

  // Priority 1 takes over R3F's default render; Zero-GC per-frame execution
  useFrame((r3fState, delta) => {
    const rig = rigRef.current;
    if (!rig) return;

    const st = useAppStore.getState();

    // Adaptive FPS watchdog: smoothly steps down quality tier on sustained GPU strain (<22 FPS)
    if (!st.qualityLockedByUser && updateFpsWatchdog(watchdogRef.current, delta)) {
      const nextTier = stepDownGraphicsQuality(st.graphicsQuality);
      if (nextTier) {
        st.setGraphicsQuality(nextTier, false);
      }
    }

    if (enableGtaoRef.current) {
      const targetBlend = resolveGtaoBlendIntensity(
        baseGtaoIntensityRef.current,
        st.xrayShells,
        st.sectionCut
      );
      rig.gtaoPass.enabled = targetBlend > 0.01;
      rig.gtaoPass.blendIntensity = targetBlend;
    } else {
      rig.gtaoPass.enabled = false;
    }

    if (enableBloomRef.current) {
      const isFiringMode = st.screen === 'workbench' && st.mode === 'firing';
      const targetStrength = resolveEffectiveBloomStrength(
        baseBloomStrengthRef.current,
        st.sectionCut,
        isFiringMode
      );
      rig.bloomPass.enabled = targetStrength > 0.001;
      if (rig.bloomPass.enabled) {
        rig.bloomPass.strength = targetStrength;
        rig.bloomPass.threshold = resolveEffectiveBloomThreshold(
          baseBloomThresholdRef.current,
          st.sectionCut,
          isFiringMode
        );
      }
    } else {
      rig.bloomPass.enabled = false;
    }

    // Macro Bokeh Depth-of-Field: auto-focus on OrbitControls target, active only during close-ups
    const ctrl = r3fState.controls as
      | (THREE.EventDispatcher & { target?: THREE.Vector3 })
      | null;
    const focusPoint = ctrl?.target ?? _bokehOrigin.set(0, 0, 0);
    const camDist = camera.position.distanceTo(focusPoint);
    const suppressed =
      st.screen !== 'workbench' ||
      st.sectionCut ||
      st.xrayShells ||
      st.caliperActive ||
      scaleProfileRef.current === 'main_battle_tank';
    const bokeh = computeMacroBokehParams(
      camDist,
      enableMacroDofRef.current && st.macroDofEnabled,
      suppressed
    );
    rig.bokehPass.enabled = bokeh.enabled;
    if (bokeh.enabled) {
      const u = rig.bokehPass.uniforms as Record<string, THREE.IUniform>;
      u.focus.value = bokeh.focus;
      u.aperture.value = bokeh.aperture;
      u.maxblur.value = bokeh.maxblur;
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const persp = camera as THREE.PerspectiveCamera;
        if (u.nearClip) u.nearClip.value = persp.near;
        if (u.farClip) u.farClip.value = persp.far;
      }
    }

    // Zero-overhead GPU telemetry hook: preserves real scene draw calls & triangles across EffectComposer passes
    renderComposerWithTelemetry(rig.composer, gl, delta);
  }, 1);

  return null;
};

// =====================================================================================
// 3. Public Component (<ArmoryPostProcessing />)
// =====================================================================================

export interface ArmoryPostProcessingProps {
  enabled?: boolean;
  environmentPreset?: ArmoryEnvironmentPreset;
  scaleProfile?: WeaponScaleProfile;
  gtaoQuality?: GtaoQualityMode;
  enableGtao?: boolean;
  enableBloom?: boolean;
  enableSmaa?: boolean;
  enableMacroDof?: boolean;
  enableFilmicLens?: boolean;
  contextEpoch?: number;
}

/**
 * Native Three.js r169 Post-Processing Pipeline:
 * `RenderPass` (HalfFloat + 8-bit Stencil) → `GTAOPass` (1.8 cm small-arms / 28 cm MBT world radius) →
 * selective HDR `UnrealBloomPass` → adaptive close-up `BokehPass` →
 * `OutputPass` (`AgXToneMapping`) → `FilmicLensPass` → `SMAAPass`.
 */
export const ArmoryPostProcessing: React.FC<ArmoryPostProcessingProps> =
  React.memo(
    ({
      enabled = true,
      environmentPreset = DEFAULT_ARMORY_ENVIRONMENT,
      scaleProfile,
      gtaoQuality = 'adaptive',
      enableGtao = true,
      enableBloom = true,
      enableSmaa = true,
      enableMacroDof = true,
      enableFilmicLens = true,
      contextEpoch = 0,
    }) => {
      const { gl } = useThree();
      const presetParams = useMemo(
        () => getPostProcessingPresetParams(environmentPreset, scaleProfile),
        [environmentPreset, scaleProfile]
      );

      // Preserve & restore previous renderer tone-mapping state on unmount
      useEffect(() => {
        const prevToneMapping = gl.toneMapping;
        const prevExposure = gl.toneMappingExposure;
        const prevColorSpace = gl.outputColorSpace;

        applyRendererToneMapping(
          gl,
          THREE.AgXToneMapping,
          prevExposure,
          THREE.SRGBColorSpace
        );

        return () => {
          applyRendererToneMapping(
            gl,
            prevToneMapping,
            prevExposure,
            prevColorSpace
          );
        };
      }, [gl]);

      useEffect(() => {
        applyRendererToneMapping(
          gl,
          presetParams.toneMapping,
          presetParams.toneMappingExposure
        );
      }, [gl, presetParams]);

      if (!enabled) return <PassiveGpuTelemetrySampler />;

      return (
        <ActiveArmoryComposer
          environmentPreset={environmentPreset}
          scaleProfile={scaleProfile}
          gtaoQuality={gtaoQuality}
          enableGtao={enableGtao}
          enableBloom={enableBloom}
          enableSmaa={enableSmaa}
          enableMacroDof={enableMacroDof}
          enableFilmicLens={enableFilmicLens}
          contextEpoch={contextEpoch}
        />
      );
    }
  );

ArmoryPostProcessing.displayName = 'ArmoryPostProcessing';
