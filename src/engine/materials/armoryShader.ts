import * as THREE from 'three';
import type { MaterialKind } from '../../weapons/types';

/**
 * AAA Armory Surface Shader
 * ------------------------------------------------------------------
 * `onBeforeCompile` extension for `MeshPhysicalMaterial` adding:
 *  1. GPU constant-wire-diameter spring compression (`aSpringParam` + `uSpringScale`)
 *  2. Object-space triplanar detail normal & roughness blending via RNM (seamless 512x512 RHA/CARC maps)
 *  3. CNC curvature edge silvering & cavity CLP gun-oil / carbon grime (`aCurvature` + `fwidth`)
 *  4. 60Hz Zero-GC barrel thermal blackbody glow (`uThermalHeat`, 300K -> 920K) & carbon fouling (`uCarbonFouling`)
 *  5. Baked-AO Direct Light Micro-Shadowing, Multi-Bounce Diffuse AO & Lagarde Specular Occlusion
 *  6. Broadband Optical AR Multi-Coating Thin-Film Fresnel Iridescence on armored sights & rifle scopes
 *
 * Every optional feature is gated by a `#define` that is also folded into a deterministic
 * `customProgramCacheKey`, so geometries lacking `aSpringParam` / `aCurvature` never read
 * disabled generic vertex attributes (WebGL defaults disabled vec4 attributes to `(0,0,0,1)`).
 */

// ------------------------------------------------------------------
// 1. Zero-GC shared barrel thermal / fouling visual state
// ------------------------------------------------------------------

export interface ArmoryThermalVisualState {
  weaponId: string;
  barrelHeat01: number;
  carbonFouling01: number;
}

const thermalState: ArmoryThermalVisualState = {
  weaponId: '',
  barrelHeat01: 0,
  carbonFouling01: 0,
};

function clamp01(v: number): number {
  if (!(v > 0)) return 0; // also maps NaN -> 0
  return v > 1 ? 1 : v;
}

/** Zero-allocation in-place update (safe to call from 60Hz physics loops). */
export function setArmoryThermalVisualState(
  next: Partial<ArmoryThermalVisualState>
): void {
  if (next.weaponId !== undefined) thermalState.weaponId = next.weaponId;
  if (next.barrelHeat01 !== undefined) {
    thermalState.barrelHeat01 = clamp01(next.barrelHeat01);
  }
  if (next.carbonFouling01 !== undefined) {
    thermalState.carbonFouling01 = clamp01(next.carbonFouling01);
  }
}

/** Alias kept for cross-module physics callers. */
export const setArmoryThermalState = setArmoryThermalVisualState;

/** Returns the live (pooled) state object — zero allocation per frame. */
export function getArmoryThermalVisualState(): Readonly<ArmoryThermalVisualState> {
  return thermalState;
}

export function resetArmoryThermalVisualState(): void {
  thermalState.weaponId = '';
  thermalState.barrelHeat01 = 0;
  thermalState.carbonFouling01 = 0;
}

// ------------------------------------------------------------------
// 1b. Zero-GC shared service-wear / handling-patina visual state
// ------------------------------------------------------------------

export type ArmoryWearPreset = 'factory_new' | 'field_oiled' | 'battle_worn';

export const ARMORY_WEAR_PRESETS: readonly ArmoryWearPreset[] = [
  'factory_new',
  'field_oiled',
  'battle_worn',
];

export const ARMORY_WEAR_PRESET_LEVELS: Readonly<
  Record<ArmoryWearPreset, number>
> = {
  factory_new: 0.0,
  field_oiled: 0.35,
  battle_worn: 0.95,
};

export const DEFAULT_ARMORY_WEAR_LEVEL = ARMORY_WEAR_PRESET_LEVELS.field_oiled;

let globalWearLevel = DEFAULT_ARMORY_WEAR_LEVEL;

/** Zero-allocation in-place wear level setter (`0` factory mint -> `0.35` field oiled -> `1` battle worn). */
export function setArmoryWearLevel(level: number): number {
  globalWearLevel = clamp01(level);
  return globalWearLevel;
}

export function getArmoryWearLevel(): number {
  return globalWearLevel;
}

export function resetArmoryWearLevel(): void {
  globalWearLevel = DEFAULT_ARMORY_WEAR_LEVEL;
}

export function resolveWearPresetFromLevel(level: number): ArmoryWearPreset {
  const c = clamp01(level);
  if (c < 0.16) return 'factory_new';
  if (c > 0.68) return 'battle_worn';
  return 'field_oiled';
}

const _resolved = { heat: 0, fouling: 0 };

/**
 * Resolves the heat / fouling that applies to `weaponId` this frame.
 * An empty `weaponId` in the shared state broadcasts to the active weapon.
 */
export function resolveThermalForWeapon(weaponId: string): {
  heat: number;
  fouling: number;
} {
  const s = thermalState;
  const match = s.weaponId === '' || s.weaponId === weaponId;
  _resolved.heat = match ? s.barrelHeat01 : 0;
  _resolved.fouling = match ? s.carbonFouling01 : 0;
  return _resolved;
}

// ------------------------------------------------------------------
// 2. Part classification
// ------------------------------------------------------------------

export const THERMAL_PART_ID_PATTERN =
  /barrel|main_gun|gas_block|gas_tube|gas_cylinder|gas_regulator|argo_plug|piston|suppressor|baffle|muzzle|flash_hider|compensator/;
export const FOULING_PART_ID_PATTERN =
  /bolt|carrier|breech|chamber|python_cylinder|op_rod|extractor|firing_pin|striker|slider|toggle/;
const SPRING_ID_EXCLUSION_PATTERN = /spring|hammer|striker|trigger/;
const ARCHERY_ID_EXCLUSION_PATTERN =
  /^(?:lift33|r500)_|limb|bowstring|yoke_cable|power_cable|broadhead|quiver/;
/** Parts whose heat follows the chamber -> throat -> muzzle longitudinal profile. */
const BARREL_PROFILE_PATTERN = /barrel|main_gun/;

export interface ArmoryPartLike {
  id: string;
  material: MaterialKind;
}

export function isThermalBearingPart(part: ArmoryPartLike): boolean {
  if (ARCHERY_ID_EXCLUSION_PATTERN.test(part.id)) return false;
  if (
    part.material === 'spring_steel' ||
    part.material === 'polymer_frame' ||
    part.material === 'follower_orange' ||
    SPRING_ID_EXCLUSION_PATTERN.test(part.id)
  ) {
    return false;
  }
  if (part.material === 'barrel_steel') return true;
  return THERMAL_PART_ID_PATTERN.test(part.id);
}

export function isCarbonFoulingPart(part: ArmoryPartLike): boolean {
  if (ARCHERY_ID_EXCLUSION_PATTERN.test(part.id)) return false;
  return isThermalBearingPart(part) || FOULING_PART_ID_PATTERN.test(part.id);
}

export function usesBarrelThermalProfile(part: ArmoryPartLike): boolean {
  return isThermalBearingPart(part) && BARREL_PROFILE_PATTERN.test(part.id);
}

// ------------------------------------------------------------------
// 3. Spring compression math (CPU mirror of the vertex shader)
// ------------------------------------------------------------------

export const SPRING_AXIS_NONE = 0;
export const SPRING_AXIS_X = 1;
export const SPRING_AXIS_Y = 2;
export const SPRING_AXIS_FLEX = 3;

/**
 * Constant-wire-diameter compression: only the coil centreline is scaled about the
 * stationary anchor; the vertex's offset from its own ring centre (wire radius) is preserved.
 */
export function computeSpringCompressedCoord(
  coord: number,
  coilCenterCoord: number,
  anchorStartCoord: number,
  springScale: number
): number {
  const wireOffset = coord - coilCenterCoord;
  return (
    anchorStartCoord +
    (coilCenterCoord - anchorStartCoord) * springScale +
    wireOffset
  );
}

/**
 * Applies `aSpringParam` semantics `(u01, center, anchor, axisMode)` to a vertex in place
 * (exact CPU mirror of `VERTEX_SPRING` when `ARMORY_SPRING` is enabled):
 * - X-axis coils (`0.5 < w < 1.5`): every weapon `plugin.ts` already bakes `dx = anchor * (1 - sx)`
 *   into `p.px`, so scaling coil centers around local `0` (`center * springScale + wireDx`) matches
 *   `p.px + center * sx` 100% identically across rear- and front-pinned springs while keeping
 *   round wire diameter (`wireDx`) strictly invariant.
 * - Y-axis coils (`1.5 <= w < 2.5`): scales coil centers around `aSpringParam.z` (`anchorStartCoord`)
 *   while preserving `wireDy`.
 * - Flex deformation (`w >= 2.5`): adds parametric displacement `(dx, dy, dz) * (springScale - 1)`
 *   for compound bow/crossbow limbs, bowstrings & cables.
 * - Merged `w < 0.5` sub-parts inside a spring geometry (cups, sleeves, hook-eyes): scales `x`
 *   around `0` (`x *= springScale`) so end-fittings track `p.px + x * sx` in lockstep.
 */
export function applySpringCompressionInto(
  out: { x: number; y: number; z: number },
  springParam: readonly [number, number, number, number] | ArrayLike<number>,
  springScale: number
): void {
  const mode = springParam[3];
  if (mode > 0.5 && mode < 1.5) {
    const wireDx = out.x - springParam[1];
    out.x = springParam[1] * springScale + wireDx;
  } else if (mode >= 1.5 && mode < 2.5) {
    out.y = computeSpringCompressedCoord(
      out.y,
      springParam[1],
      springParam[2],
      springScale
    );
  } else if (mode >= 2.5) {
    const flexAmt = springScale - 1.0;
    out.x += springParam[0] * flexAmt;
    out.y += springParam[1] * flexAmt;
    out.z += springParam[2] * flexAmt;
  } else if (mode < 0.5) {
    out.x *= springScale;
  }
}

// ------------------------------------------------------------------
// 4. Ordnance-steel blackbody ramp (CPU mirror of the fragment shader)
// ------------------------------------------------------------------

export const THERMAL_AMBIENT_K = 300;
export const THERMAL_MAX_K = 920;

export function thermalHeatToKelvin(heat01: number): number {
  return (
    THERMAL_AMBIENT_K + (THERMAL_MAX_K - THERMAL_AMBIENT_K) * clamp01(heat01)
  );
}

const HEAT_CHERRY = new THREE.Color('#7f1d1d');
const HEAT_ORANGE = new THREE.Color('#ea580c');
const HEAT_AMBER = new THREE.Color('#f59e0b');

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Deep cherry (#7f1d1d) -> dull red-orange (#ea580c) -> hot amber (#f59e0b) ramp. */
export function computeBlackbodyColorInto(
  heat01: number,
  out: THREE.Color
): THREE.Color {
  const h = clamp01(heat01);
  out.copy(HEAT_CHERRY).lerp(HEAT_ORANGE, smoothstep(0.2, 0.68, h));
  out.lerp(HEAT_AMBER, smoothstep(0.68, 1.0, h));
  return out;
}

/**
 * HDR emissive gain following Stefan-Boltzmann-like T^4 scaling above visible glow onset.
 */
export function computeThermalEmissiveGain(heat01: number): number {
  const h = clamp01(heat01);
  const onset = smoothstep(0.28, 1.0, h);
  const t = thermalHeatToKelvin(h) / THERMAL_MAX_K;
  return onset * onset * t * t * t * t * 7.5;
}

// ------------------------------------------------------------------
// 5. Uniforms & per-material surface metallurgy profiles
// ------------------------------------------------------------------

export interface ArmoryShaderUniforms {
  uSpringScale: { value: number };
  uThermalHeat: { value: number };
  uCarbonFouling: { value: number };
  uWearLevel: { value: number };
  uSurfaceScale: { value: number };
  uThermalSpan: { value: THREE.Vector2 };
  uThermalProfileMix: { value: number };
  uEdgeWear: { value: number };
  uEdgeMetal: { value: number };
  uEdgeWearColor: { value: THREE.Color };
  uTriplanarScale: { value: number };
  uTriplanarDetail: { value: number };
  uDetailGrainMode: { value: number };
  uFunctionalTint: { value: THREE.Color };
  uFunctionalTintMix: { value: number };
  uArmorDetailNormal: { value: THREE.Texture | null };
  uArmorDetailRoughness: { value: THREE.Texture | null };
  uHasArmorDetail: { value: number };
  uCuratorSpot: { value: number };
  uCuratorDim: { value: number };
  uCuratorRimColor: { value: THREE.Color };
}

/** Module-shared constant uniforms (identical across every armory material). */
const SHARED_HEAT_UNIFORMS = {
  uHeatCherry: { value: HEAT_CHERRY },
  uHeatOrange: { value: HEAT_ORANGE },
  uHeatAmber: { value: HEAT_AMBER },
};

export interface ArmorySurfaceProfile {
  edgeWearColor: string;
  edgeWear: number;
  edgeMetal: number;
  triplanarScale: number;
  triplanarDetail: number;
  /** +1 = anisotropic CNC machined steel grain, -1 = isotropic EDM polymer stipple */
  detailGrainMode: number;
}

export const ARMORY_SURFACE_PROFILES: Record<MaterialKind, ArmorySurfaceProfile> = {
  // QPQ / Tenifer / Parkerized gunmetal wears along sharp CNC edges to bright bare steel
  nitride_steel: {
    edgeWearColor: '#c2c8d0',
    edgeWear: 0.92,
    edgeMetal: 1,
    triplanarScale: 0.14,
    triplanarDetail: 0.068,
    detailGrainMode: 1,
  },
  // Cold-hammer-forged ordnance steel: phosphate satin wears to bright steel
  barrel_steel: {
    edgeWearColor: '#c6ccd4',
    edgeWear: 0.84,
    edgeMetal: 1,
    triplanarScale: 0.16,
    triplanarDetail: 0.074,
    detailGrainMode: 1,
  },
  // Brushed 416 / 17-4 PH stainless
  stainless: {
    edgeWearColor: '#e5e9f0',
    edgeWear: 0.38,
    edgeMetal: 1,
    triplanarScale: 0.18,
    triplanarDetail: 0.044,
    detailGrainMode: 1,
  },
  // Glass-filled nylon 6: deep matte charcoal polyamide with crisp tactile EDM mould micro-stipple
  polymer_frame: {
    edgeWearColor: '#3f444d',
    edgeWear: 0.28,
    edgeMetal: 0,
    triplanarScale: 0.24,
    triplanarDetail: 0.125,
    detailGrainMode: -1,
  },
  // Tempered oil-quenched music wire
  spring_steel: {
    edgeWearColor: '#cbd5e1',
    edgeWear: 0.36,
    edgeMetal: 1,
    triplanarScale: 0.2,
    triplanarDetail: 0.02,
    detailGrainMode: 1,
  },
  // Injection-moulded high-visibility follower polymer
  follower_orange: {
    edgeWearColor: '#fdba74',
    edgeWear: 0.26,
    edgeMetal: 0,
    triplanarScale: 0.22,
    triplanarDetail: 0.035,
    detailGrainMode: -1,
  },
  // C26000 cartridge brass / copper
  copper_accent: {
    edgeWearColor: '#f3c98b',
    edgeWear: 0.46,
    edgeMetal: 1,
    triplanarScale: 0.16,
    triplanarDetail: 0.026,
    detailGrainMode: 1,
  },
};

export function syncArmoryUniformProfile(
  uniforms: ArmoryShaderUniforms,
  kind: MaterialKind,
  surfaceScale?: number
): ArmoryShaderUniforms {
  const prof = ARMORY_SURFACE_PROFILES[kind];
  uniforms.uEdgeWear.value = prof.edgeWear;
  uniforms.uEdgeMetal.value = prof.edgeMetal;
  uniforms.uEdgeWearColor.value.set(prof.edgeWearColor);
  uniforms.uTriplanarScale.value = prof.triplanarScale;
  uniforms.uTriplanarDetail.value = prof.triplanarDetail;
  uniforms.uDetailGrainMode.value = prof.detailGrainMode;
  if (surfaceScale !== undefined) {
    uniforms.uSurfaceScale.value = Math.max(1, surfaceScale);
  }
  return uniforms;
}

export function createArmoryShaderUniforms(
  kind: MaterialKind = 'nitride_steel',
  surfaceScale = 1
): ArmoryShaderUniforms {
  const prof = ARMORY_SURFACE_PROFILES[kind];
  return {
    uSpringScale: { value: 1 },
    uThermalHeat: { value: 0 },
    uCarbonFouling: { value: 0 },
    uWearLevel: { value: globalWearLevel },
    uSurfaceScale: { value: Math.max(1, surfaceScale) },
    uThermalSpan: { value: new THREE.Vector2(-1, 1) },
    uThermalProfileMix: { value: 0 },
    uEdgeWear: { value: prof.edgeWear },
    uEdgeMetal: { value: prof.edgeMetal },
    uEdgeWearColor: { value: new THREE.Color(prof.edgeWearColor) },
    uTriplanarScale: { value: prof.triplanarScale },
    uTriplanarDetail: { value: prof.triplanarDetail },
    uDetailGrainMode: { value: prof.detailGrainMode },
    uFunctionalTint: { value: new THREE.Color('#ffffff') },
    uFunctionalTintMix: { value: 0 },
    uArmorDetailNormal: { value: null },
    uArmorDetailRoughness: { value: null },
    uHasArmorDetail: { value: 0 },
    uCuratorSpot: { value: 0 },
    uCuratorDim: { value: 1 },
    uCuratorRimColor: { value: new THREE.Color(CURATOR_SPOTLIGHT_RIM_DARK) },
  };
}

export interface ArmoryShaderFeatures {
  /** Geometry carries `aSpringParam` (vec4) */
  spring: boolean;
  /** Geometry carries `aCurvature` (float) */
  curvature: boolean;
  /** Part receives barrel blackbody glow */
  thermal: boolean;
  /** Part receives carbon fouling soot */
  fouling: boolean;
  /** Blend repeatable detail normalMap triplanarly in object space (off for baked UV atlases) */
  triplanarMap?: boolean;
}

export const ARMORY_SHADER_VERSION = 10;
export const ARMORY_CNC_BEVEL_GLINT_MARKER = 'armoryCncBevelGlint';
export const ARMORY_CURATOR_SPOT_MARKER = 'armoryCuratorSpot';
export const CURATOR_SPOTLIGHT_RIM_DARK = '#ffe8c2';
export const CURATOR_SPOTLIGHT_RIM_DAYLIGHT = '#0284c7';
export const CURATOR_SPOTLIGHT_DIM_MIN = 0.55;

/** Metallic ordnance-steel materials that receive CNC machined-edge bevel rim glint. */
export const CNC_BEVEL_GLINT_MATERIALS: ReadonlySet<MaterialKind> = new Set<MaterialKind>([
  'nitride_steel',
  'barrel_steel',
  'stainless',
  'spring_steel',
]);

export function isCncBevelGlintMaterial(kind: MaterialKind): boolean {
  return CNC_BEVEL_GLINT_MATERIALS.has(kind);
}

export function getArmoryProgramCacheKey(f: ArmoryShaderFeatures): string {
  return `armory-v${ARMORY_SHADER_VERSION}|s${f.spring ? 1 : 0}|c${f.curvature ? 1 : 0}|t${f.thermal ? 1 : 0}|f${f.fouling ? 1 : 0}|tm${f.triplanarMap ? 1 : 0}`;
}

export function resolveArmoryShaderFeatures(
  part: ArmoryPartLike,
  geometry: THREE.BufferGeometry | null,
  hasCustomAtlas = false
): ArmoryShaderFeatures {
  return {
    spring: !!geometry && geometry.hasAttribute('aSpringParam'),
    curvature: !!geometry && geometry.hasAttribute('aCurvature'),
    thermal: isThermalBearingPart(part),
    fouling: isCarbonFoulingPart(part),
    triplanarMap: !hasCustomAtlas,
  };
}

// ------------------------------------------------------------------
// 6. GLSL chunks & injection
// ------------------------------------------------------------------

function buildDefines(f: ArmoryShaderFeatures): string {
  let s = '#define ARMORY_SHADER\n';
  if (f.spring) s += '#define ARMORY_SPRING\n';
  if (f.curvature) s += '#define ARMORY_CURVATURE\n';
  if (f.thermal) s += '#define ARMORY_THERMAL\n';
  if (f.fouling) s += '#define ARMORY_FOULING\n';
  if (f.triplanarMap) s += '#define ARMORY_TRIPLANAR_MAP\n';
  return s;
}

const VERTEX_PARS = /* glsl */ `
#ifdef ARMORY_SPRING
  attribute vec4 aSpringParam;
  uniform float uSpringScale;
#endif
#ifdef ARMORY_CURVATURE
  attribute float aCurvature;
#endif
#ifndef ARMORY_DEPTH_ONLY
  varying float vArmoryCurvature;
  varying vec3 vArmoryObjPos;
  varying vec3 vArmoryObjNormal;
#endif
`;

const VERTEX_SPRING = /* glsl */ `
#ifdef ARMORY_SPRING
  // Constant-wire-diameter compression & parametric flex:
  // - X-axis coils (0.5 < w < 1.5): scale coil centreline around local 0 so p.px + center * uSpringScale
  //   matches every weapon plugin dx = anchor * (1 - scaleX) identically (both rear- and front-pinned)
  //   while preserving exact wire cross-section offset wireDx.
  // - Y-axis coils (1.5 <= w < 2.5): scale coil centreline around aSpringParam.z (anchor).
  // - Parametric flex (w >= 2.5): displace along aSpringParam.xyz * (uSpringScale - 1.0).
  // - Merged w < 0.5 end-fittings (cups, sleeves, hook-eyes): scale transformed.x around 0 so they
  //   remain welded to p.px + x * uSpringScale.
  if ( aSpringParam.w > 0.5 && aSpringParam.w < 1.5 ) {
    float wireDx = transformed.x - aSpringParam.y;
    transformed.x = aSpringParam.y * uSpringScale + wireDx;
  } else if ( aSpringParam.w >= 1.5 && aSpringParam.w < 2.5 ) {
    float wireDy = transformed.y - aSpringParam.y;
    transformed.y = aSpringParam.z + ( aSpringParam.y - aSpringParam.z ) * uSpringScale + wireDy;
  } else if ( aSpringParam.w >= 2.5 ) {
    transformed += aSpringParam.xyz * ( uSpringScale - 1.0 );
  } else if ( aSpringParam.w < 0.5 ) {
    transformed.x *= uSpringScale;
  }
#endif
#ifndef ARMORY_DEPTH_ONLY
  vArmoryObjPos = transformed;
  vArmoryObjNormal = objectNormal;
  #ifdef ARMORY_CURVATURE
    vArmoryCurvature = aCurvature;
  #else
    vArmoryCurvature = 0.0;
  #endif
#endif
`;

const FRAGMENT_PARS = /* glsl */ `
#ifndef USE_NORMALMAP_OBJECTSPACE
  uniform mat3 normalMatrix;
#endif
uniform float uThermalHeat;
uniform float uCarbonFouling;
uniform float uWearLevel;
uniform float uSurfaceScale;
uniform vec2 uThermalSpan;
uniform float uThermalProfileMix;
uniform float uEdgeWear;
uniform float uEdgeMetal;
uniform vec3 uEdgeWearColor;
uniform float uTriplanarScale;
uniform float uTriplanarDetail;
uniform float uDetailGrainMode;
uniform vec3 uFunctionalTint;
uniform float uFunctionalTintMix;
uniform vec3 uHeatCherry;
uniform vec3 uHeatOrange;
uniform vec3 uHeatAmber;
uniform sampler2D uArmorDetailNormal;
uniform sampler2D uArmorDetailRoughness;
uniform float uHasArmorDetail;
uniform float uCuratorSpot;
uniform float uCuratorDim;
uniform vec3 uCuratorRimColor;
varying float vArmoryCurvature;
varying vec3 vArmoryObjPos;
varying vec3 vArmoryObjNormal;

float armoryHash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

float armoryHash13( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.zyx + 31.32 );
  return fract( ( p.x + p.y ) * p.z );
}

float armoryValueNoise2( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = armoryHash12( i );
  float b = armoryHash12( i + vec2( 1.0, 0.0 ) );
  float c = armoryHash12( i + vec2( 0.0, 1.0 ) );
  float d = armoryHash12( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}

float armoryValueNoise( vec3 p ) {
  vec3 i = floor( p );
  vec3 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float n000 = armoryHash13( i );
  float n100 = armoryHash13( i + vec3( 1.0, 0.0, 0.0 ) );
  float n010 = armoryHash13( i + vec3( 0.0, 1.0, 0.0 ) );
  float n110 = armoryHash13( i + vec3( 1.0, 1.0, 0.0 ) );
  float n001 = armoryHash13( i + vec3( 0.0, 0.0, 1.0 ) );
  float n101 = armoryHash13( i + vec3( 1.0, 0.0, 1.0 ) );
  float n011 = armoryHash13( i + vec3( 0.0, 1.0, 1.0 ) );
  float n111 = armoryHash13( i + vec3( 1.0, 1.0, 1.0 ) );
  return mix(
    mix( mix( n000, n100, f.x ), mix( n010, n110, f.x ), f.y ),
    mix( mix( n001, n101, f.x ), mix( n011, n111, f.x ), f.y ),
    f.z
  );
}

// 2D tangent-plane micro-slope for CNC brushed/phosphated steel (+1) vs glass-filled nylon EDM pebble (-1)
vec2 armoryMicroSlope2D( vec2 uv, float mode ) {
  if ( mode > 0.0 ) {
    // 3-octave anisotropic brushed CNC toolmarks + fine manganese-phosphate crystalline micro-grain
    float g1 = armoryValueNoise2( vec2( uv.x * 11.0, uv.y * 64.0 ) ) - 0.5;
    float g2 = armoryValueNoise2( vec2( uv.x * 32.0, uv.y * 140.0 ) ) - 0.5;
    float pX = armoryValueNoise2( uv * 95.0 ) - 0.5;
    float pY = armoryValueNoise2( uv * 95.0 + vec2( 1.73, 2.41 ) ) - 0.5;
    return vec2( g1 * 0.24 + pX * 0.58, g1 * 0.80 + g2 * 0.45 + pY * 0.58 );
  }
  // 3-octave glass-filled polyamide injection-mould EDM pebble grain (tactile matte polymer)
  float s1x = armoryValueNoise2( uv * 48.0 ) - 0.5;
  float s1y = armoryValueNoise2( uv * 48.0 + vec2( 0.37, 0.71 ) ) - 0.5;
  float s2x = armoryValueNoise2( uv * 118.0 + vec2( 2.13, 0.89 ) ) - 0.5;
  float s2y = armoryValueNoise2( uv * 118.0 + vec2( 3.47, 1.93 ) ) - 0.5;
  return vec2( s1x * 0.72 + s2x * 0.48, s1y * 0.72 + s2y * 0.48 );
}

// Heavy-armor rolled homogeneous steel (RHA) mill-scale pitting + coarse matte CARC silica grit
// Evaluated in decimeter space (vArmoryObjPos / uSurfaceScale, 1 unit = 10 cm on 1:1 MBTs)
vec2 armoryArmorMicroSlope2D( vec2 p ) {
  float m1x = armoryValueNoise2( p * 0.72 ) - 0.5;
  float m1y = armoryValueNoise2( p * 0.72 + vec2( 4.13, 1.87 ) ) - 0.5;
  float m2x = armoryValueNoise2( p * 2.65 + vec2( 1.91, 3.27 ) ) - 0.5;
  float m2y = armoryValueNoise2( p * 2.65 + vec2( 5.37, 2.61 ) ) - 0.5;
  float m3x = armoryValueNoise2( p * 8.80 + vec2( 2.71, 6.13 ) ) - 0.5;
  float m3y = armoryValueNoise2( p * 8.80 + vec2( 7.43, 3.89 ) ) - 0.5;
  return vec2(
    m1x * 0.36 + m2x * 0.48 + m3x * 0.54,
    m1y * 0.36 + m2y * 0.48 + m3y * 0.54
  );
}

// Normalised position along the part's longitudinal (+X muzzle) span
float armoryAxialT() {
  return clamp( ( vArmoryObjPos.x - uThermalSpan.x ) / max( uThermalSpan.y - uThermalSpan.x, 1e-3 ), 0.0, 1.0 );
}

vec3 armoryBlackbody( float h ) {
  vec3 c = mix( uHeatCherry, uHeatOrange, smoothstep( 0.2, 0.68, h ) );
  return mix( c, uHeatAmber, smoothstep( 0.68, 1.0, h ) );
}

// IEEE-754 integer bitmask check (immune to Apple Metal / ANGLE -ffast-math NaN elision)
bool armoryIsFiniteVec3( vec3 v ) {
  uvec3 bits = floatBitsToUint( v );
  return all( lessThan( bits & uvec3( 0x7f800000u ), uvec3( 0x7f800000u ) ) );
}

vec3 armorySafeNormalize( vec3 v, vec3 fallback ) {
  if ( !armoryIsFiniteVec3( v ) ) return fallback;
  float lenSq = dot( v, v );
  return ( lenSq > 1e-8 ) ? ( v * inversesqrt( lenSq ) ) : fallback;
}

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

// Barre-Brisebois & Hill (2012) tangent-space Reoriented Normal Mapping (RNM)
vec3 armoryBlendRNM( vec3 n1, vec3 n2 ) {
  vec3 t = n1 + vec3( 0.0, 0.0, 1.0 );
  vec3 u = n2 * vec3( -1.0, -1.0, 1.0 );
  float denom = max( t.z, 1e-4 );
  return armorySafeNormalize( t * ( dot( t, u ) / denom ) - u, vec3( 0.0, 0.0, 1.0 ) );
}

// Exact 3D SO(3) Reoriented Normal Mapping carrying unit a -> unit b applied to unit v
vec3 armoryReorientNormal3D( vec3 a, vec3 b, vec3 v ) {
  vec3 t = a + b;
  float denom = dot( t, t );
  if ( denom < 1e-5 ) return b;
  vec3 vRefl = v - 2.0 * dot( a, v ) * a;
  return armorySafeNormalize( vRefl - ( 2.0 * dot( t, vRefl ) / denom ) * t, b );
}

// Jimenez et al. (2016) colored multi-bounce diffuse AO preserves warm saturation in tight crevices
vec3 armoryMultiBounceAO( float visibility, vec3 albedo ) {
  vec3 a = 2.0404 * albedo - 0.3324;
  vec3 b = -4.7951 * albedo + 0.6417;
  vec3 c = 2.7552 * albedo + 0.6903;
  vec3 mb = ( ( visibility * a + b ) * visibility + c ) * visibility;
  return clamp( max( vec3( visibility ), mb ), vec3( 0.0 ), vec3( 1.0 ) );
}

// Broadband multi-coated optical anti-reflection (AR) thin-film interference spectrum:
// obsidian normal incidence -> emerald / sapphire / blue-violet / ruby-magenta grazing reflection
vec3 armoryOpticalArTint( vec3 baseRgb, float fresnel1 ) {
  float maxC = max( baseRgb.r, max( baseRgb.g, baseRgb.b ) );
  float invMax = 1.0 / max( maxC, 1e-4 );
  float isRuby = smoothstep( 0.05, 0.45, ( baseRgb.r - max( baseRgb.g, baseRgb.b ) ) * invMax );
  float isSapphire = ( 1.0 - isRuby ) * smoothstep( 0.05, 0.40, ( baseRgb.b - baseRgb.g ) * invMax );

  // Emerald broadband AR (CITV / EMES / GPS / AWM / VSS / AUG / G11): emerald -> cobalt-sapphire -> violet-magenta
  vec3 emMid = mix( vec3( 0.03, 0.30, 0.24 ), vec3( 0.08, 0.24, 0.48 ), smoothstep( 0.22, 0.64, fresnel1 ) );
  vec3 emTint = mix( emMid, vec3( 0.34, 0.11, 0.46 ), smoothstep( 0.62, 0.96, fresnel1 ) );

  // Sapphire AR (Tiger 131 TZF 9b / M82A1): deep sapphire -> cyan-blue -> indigo-violet
  vec3 sapMid = mix( vec3( 0.04, 0.18, 0.40 ), vec3( 0.07, 0.34, 0.50 ), smoothstep( 0.24, 0.64, fresnel1 ) );
  vec3 sapTint = mix( sapMid, vec3( 0.28, 0.13, 0.52 ), smoothstep( 0.64, 0.96, fresnel1 ) );

  // Ruby / IR laser window AR (ZTZ-99A JD-3 dazzler & LWR): deep ruby -> crimson-magenta -> rose-violet
  vec3 rubMid = mix( vec3( 0.36, 0.03, 0.08 ), vec3( 0.52, 0.07, 0.28 ), smoothstep( 0.24, 0.66, fresnel1 ) );
  vec3 rubTint = mix( rubMid, vec3( 0.46, 0.16, 0.42 ), smoothstep( 0.66, 0.96, fresnel1 ) );

  return mix( mix( emTint, sapTint, isSapphire ), rubTint, isRuby );
}
`;

const FRAGMENT_SURFACE = /* glsl */ `
#ifdef ARMORY_SHADER
float armoryOpticMask = 0.0;
vec3 armoryOpticBaseRgb = vec3( 0.0 );
float armoryCncBevelMask = 0.0;
{
  // --- Optical AR multi-coated lens detector (tanks: CITV/EMES/GPS/JD-3/TZF 9b; rifles: AWM/VSS/M82A1/AUG/G11) ---
  // Evaluated on pristine material channels before procedural patina/wear, matching low roughness (< 0.14),
  // non-chrome metalness (< 0.72), dark-to-mid luminance & vivid emerald/sapphire/ruby chroma.
  {
    float optMax = max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) );
    float optMin = min( diffuseColor.r, min( diffuseColor.g, diffuseColor.b ) );
    float optSat = ( optMax - optMin ) / max( optMax, 1e-4 );
    float optSmooth = 1.0 - smoothstep( 0.085, 0.14, roughnessFactor );
    float optNonChrome = 1.0 - smoothstep( 0.62, 0.74, metalnessFactor );
    float optChroma =
      smoothstep( 0.32, 0.62, optSat ) *
      smoothstep( 0.0025, 0.009, optMax ) *
      ( 1.0 - smoothstep( 0.28, 0.45, optMax ) );
    float optNoTint = 1.0 - smoothstep( 0.02, 0.15, uFunctionalTintMix );
    armoryOpticMask = clamp( optSmooth * optNonChrome * optChroma * optNoTint, 0.0, 1.0 );
    armoryOpticBaseRgb = diffuseColor.rgb;
  }

  // --- WP-05: Engineering functional role tint (zero shader recompilation) ---
  if ( uFunctionalTintMix > 0.0001 ) {
    diffuseColor.rgb = mix( diffuseColor.rgb, uFunctionalTint, clamp( uFunctionalTintMix, 0.0, 1.0 ) );
  }

  float armoryWear = clamp( uWearLevel, 0.0, 1.0 );
  float armoryScale = max( uSurfaceScale, 1.0 );
  bool armoryIsHeavyArmor = armoryScale > 2.0;
  vec3 armoryScaledPos = vArmoryObjPos / armoryScale;

  // --- Crease-gated CNC / armor bevel curvature detector ---
  float armoryCurvConvex = smoothstep( 0.64, 0.96, vArmoryCurvature );
  float armoryCurvConcave = smoothstep( 0.52, 0.95, -vArmoryCurvature );
  float armoryDeriv = 0.0;
  float armoryCurvGrad = clamp( fwidth( vArmoryCurvature ) * 9.0, 0.0, 1.0 );
  #ifndef FLAT_SHADED
    // Screen-space normal derivative micro-edge detector (true geometric bevels & crisp creases only)
    armoryDeriv = clamp( length( fwidth( vNormal ) ) * 2.35 - 0.16, 0.0, 1.0 );
  #endif

  // Gate vertex curvature so large flat box/extrude faces NEVER smear grey diagonal triangles
  float armoryLocalizedConvex = armoryCurvConvex * clamp( armoryDeriv * 2.4 + armoryCurvGrad * 0.85, 0.0, 1.0 );
  float armoryCavity = armoryCurvConcave * clamp( armoryDeriv * 1.8 + armoryCurvGrad * 0.9 + 0.25, 0.0, 1.0 );

  if ( armoryIsHeavyArmor ) {
    // --- 1:1 Main Battle Tank heavy armor weathering: RHA patina, vertical rain streaks, dust & steel chipping ---
    vec3 armorySurfN = armorySafeNormalize( vArmoryObjNormal, vec3( 0.0, 1.0, 0.0 ) );
    float armoryMacro = armoryValueNoise( armoryScaledPos * 0.19 + vec3( 1.7, 3.1, 0.9 ) );
    float armoryMid = armoryValueNoise( armoryScaledPos * 0.78 + vec3( 4.3, 0.7, 2.5 ) );
    float armoryFine = armoryValueNoise( armoryScaledPos * 2.95 + vec3( 0.8, 5.2, 3.4 ) );
    float armoryPatina = ( armoryMacro * 0.55 + armoryMid * 0.30 + armoryFine * 0.15 ) - 0.5;

    // Distinguish matte painted CARC/Dunkelgelb armor (low metalness) from bare machined steel/chrome/brass
    float armoryIsPainted = 1.0 - smoothstep( 0.20, 0.52, metalnessFactor );
    // Preserve mirror-smooth optical lenses (low roughness + low metalness) from dust/grime frosting
    float armoryIsOpticGlass = max(
      ( 1.0 - smoothstep( 0.12, 0.24, roughnessFactor ) ) * ( 1.0 - smoothstep( 0.55, 0.82, metalnessFactor ) ),
      armoryOpticMask
    );
    float armoryPaintMask = armoryIsPainted * ( 1.0 - armoryIsOpticGlass );

    // Meter-scale tonal paint fade & grime modulation so giant armor plates never read as uniform cardboard
    float armoryToneMod = armoryPatina * mix( 0.14, 0.26, armoryWear ) * armoryPaintMask;
    diffuseColor.rgb *= 1.0 + armoryToneMod;

    // Vertical gravity rain & diesel-oil streaks down sloped/vertical armor cheeks & side skirts
    float armoryWallW = 1.0 - smoothstep( 0.50, 0.86, abs( armorySurfN.y ) );
    float armoryStreakN = armoryValueNoise( vec3( armoryScaledPos.x * 1.35, armoryScaledPos.y * 0.16, armoryScaledPos.z * 1.35 ) + vec3( 2.3, 0.4, 5.1 ) );
    float armoryStreak = smoothstep( 0.56, 0.88, armoryStreakN ) * armoryWallW * mix( 0.07, 0.20, armoryWear ) * armoryPaintMask;
    diffuseColor.rgb *= 1.0 - armoryStreak;

    // Subtle upward-facing mineral dust on horizontal decks & darker underside road grime
    float armoryTopDust = smoothstep( 0.56, 0.96, armorySurfN.y ) * smoothstep( 0.32, 0.78, armoryMacro * 0.7 + armoryMid * 0.3 ) * mix( 0.04, 0.14, armoryWear ) * armoryPaintMask;
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.32, 0.29, 0.23 ), armoryTopDust );
    float armoryUnderDark = smoothstep( 0.32, 0.88, -armorySurfN.y ) * mix( 0.14, 0.28, armoryWear ) * ( 1.0 - armoryIsOpticGlass );
    diffuseColor.rgb *= 1.0 - armoryUnderDark;

    // Chipped welded armor plate edges exposing dark rubbed gunmetal RHA steel underneath military paint
    float armoryChipBreak = smoothstep( 0.28, 0.76, armoryValueNoise( armoryScaledPos * 1.85 ) * 0.58 + armoryValueNoise( armoryScaledPos * 5.4 ) * 0.42 );
    float armoryArmorEdge = max( armoryLocalizedConvex, armoryDeriv * 0.46 ) * mix( 0.45, 1.25, armoryChipBreak );
    float armoryChipStrength = clamp( armoryArmorEdge * uEdgeWear * ( 0.16 + armoryWear * 0.94 ), 0.0, 1.0 ) * ( 1.0 - armoryIsOpticGlass );
    float armoryChipExpose = clamp( armoryChipStrength * 0.64, 0.0, 0.78 );
    vec3 armorySteelChipCol = mix( vec3( 0.14, 0.15, 0.17 ), uEdgeWearColor, 0.38 );
    diffuseColor.rgb = mix( diffuseColor.rgb, armorySteelChipCol, armoryChipExpose );
    roughnessFactor = mix( roughnessFactor, 0.32, armoryChipExpose * 0.82 );
    metalnessFactor = mix( metalnessFactor, max( metalnessFactor, 0.86 ), armoryChipExpose * uEdgeMetal );

    // Authentic matte CARC roughness modulation (zero plastic specular sheen on painted armor; crisp metal on steel)
    roughnessFactor += armoryPatina * mix( 0.11, 0.18, armoryWear ) * ( 1.0 - armoryIsOpticGlass );
    roughnessFactor -= armoryStreak * 0.16;
    roughnessFactor += armoryTopDust * 0.22;
    // Enforce military flat-matte floor on painted non-metallic armor so broad hull decks never gleam like wet vinyl
    float armoryMatteFloor = mix( 0.58, 0.72, armoryPaintMask * ( 1.0 - armoryChipExpose ) );
    roughnessFactor = mix( roughnessFactor, max( roughnessFactor, armoryMatteFloor ), armoryPaintMask * ( 1.0 - armoryChipExpose ) );

    // Deepened concave weld-seam, louver & bolt-recess grease/dirt
    diffuseColor.rgb *= mix( 1.0, mix( 0.70, 0.44, armoryWear ), armoryCavity * ( 1.0 - armoryIsOpticGlass ) );
    roughnessFactor = mix( roughnessFactor, min( 0.96, roughnessFactor + 0.14 ), armoryCavity * ( 1.0 - armoryIsOpticGlass ) );
  } else {
    // --- Organic macro/micro CLP gun-oil & handling patina roughness breakup (all small arms & archery) ---
    float armoryNotOptic = 1.0 - armoryOpticMask;
    float armoryOilMacro = armoryValueNoise( vArmoryObjPos * 0.62 + vec3( 1.7, 3.1, 0.9 ) );
    float armoryOilMicro = armoryValueNoise( vArmoryObjPos * 2.85 + vec3( 4.3, 0.7, 2.5 ) );
    float armoryPatina = ( armoryOilMacro * 0.65 + armoryOilMicro * 0.35 ) - 0.5;

    float armoryWearBreakup = smoothstep( 0.24, 0.82, armoryValueNoise( vArmoryObjPos * 3.6 ) * 0.65 + armoryValueNoise( vArmoryObjPos * 11.5 ) * 0.35 );
    float armoryEdge = max( armoryLocalizedConvex, armoryDeriv * 0.42 ) * mix( 0.55, 1.15, armoryWearBreakup );

    // Service wear scales edge exposure cleanly: Factory New (0.0) -> Field Oiled (0.35) -> Battle Worn (1.0)
    float armoryWearGain = 0.08 + armoryWear * 0.92;
    float armoryEdgeStrength = clamp( armoryEdge * uEdgeWear * armoryWearGain, 0.0, 1.0 ) * armoryNotOptic;

    // Fine directional holster / field handling micro-scratches (only noticeable on oiled/battle-worn metal)
    float armoryScratch = 0.0;
    if ( armoryWear > 0.12 && uEdgeMetal > 0.5 ) {
      float sBandA = armoryValueNoise( vec3( vArmoryObjPos.x * 0.95, vArmoryObjPos.y * 19.0, vArmoryObjPos.z * 19.0 ) );
      float sBandB = armoryValueNoise( vec3( vArmoryObjPos.x * 2.2 + vArmoryObjPos.y * 5.5, vArmoryObjPos.y * 14.0, vArmoryObjPos.z * 11.0 ) );
      float sMask = smoothstep( 0.78, 0.93, sBandA ) * smoothstep( 0.62, 0.86, sBandB );
      armoryScratch = sMask * smoothstep( 0.12, 1.0, armoryWear ) * 0.38 * armoryNotOptic;
    }

    float armoryMetalExpose = clamp( armoryEdgeStrength * 0.52 + armoryScratch, 0.0, 0.75 );
    diffuseColor.rgb = mix( diffuseColor.rgb, uEdgeWearColor, armoryMetalExpose );
    roughnessFactor *= mix( 1.0, 0.64, clamp( armoryEdgeStrength + armoryScratch * 1.2, 0.0, 1.0 ) );
    metalnessFactor = mix( metalnessFactor, max( metalnessFactor, 0.94 ), clamp( armoryMetalExpose * 1.15, 0.0, 1.0 ) * uEdgeMetal );

    // Apply organic CLP gun-oil micro-roughness variation & subtle handling burnishing
    float armoryOilShift = armoryPatina * ( uEdgeMetal > 0.5 ? 0.14 : 0.10 );
    float armoryHandPolish = ( uEdgeMetal < 0.5 ) ? ( -armoryWear * 0.09 * smoothstep( -0.1, 0.4, armoryPatina ) ) : 0.0;
    roughnessFactor += ( armoryOilShift + armoryHandPolish ) * armoryNotOptic;

    // Concave recesses: localized darkened crevices with CLP gun-oil & ambient service grime
    float armoryGrimeDark = mix( 0.84, 0.62, armoryWear );
    diffuseColor.rgb *= mix( 1.0, armoryGrimeDark, armoryCavity * armoryNotOptic );
    roughnessFactor *= mix( 1.0, mix( 0.86, 1.08, armoryWear ), armoryCavity * armoryNotOptic );
  }

  #ifdef ARMORY_FOULING
    // --- Gunpowder carbon fouling (soot): blotchy, concentrated toward muzzle / gas exits ---
    float armoryT = armoryAxialT();
    float armoryThroatD = ( armoryT - 0.14 ) / 0.12;
    float armorySootBias = mix( 1.0, 0.35 + 0.65 * smoothstep( 0.55, 1.0, armoryT ) + 0.4 * exp( -armoryThroatD * armoryThroatD ), uThermalProfileMix );
    float armorySootNoise = armoryValueNoise( armoryScaledPos * 1.7 ) * 0.65 + armoryValueNoise( armoryScaledPos * 6.3 ) * 0.35;
    float armoryEffectiveFouling = clamp( uCarbonFouling + smoothstep( 0.45, 1.0, armoryWear ) * 0.28, 0.0, 1.0 );
    float armorySoot = clamp( armoryEffectiveFouling * armorySootBias * smoothstep( 0.22, 0.78, armorySootNoise + 0.18 * armoryCavity ), 0.0, 1.0 ) * ( 1.0 - armoryOpticMask );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.032, 0.029, 0.026 ), armorySoot * 0.78 );
    roughnessFactor = mix( roughnessFactor, 0.93, armorySoot * 0.85 );
    metalnessFactor *= 1.0 - armorySoot * 0.6;
  #endif

  // Preserve mirror-smooth precision-ground optical glass roughness on AR-coated lenses
  roughnessFactor = mix( roughnessFactor, min( roughnessFactor, 0.055 ), armoryOpticMask );
  roughnessFactor = clamp( roughnessFactor, 0.04, 1.0 );
  metalnessFactor = clamp( metalnessFactor, 0.0, 1.0 );

  // --- CNC machined-steel edge bevel glint mask (strictly 0 on flat faces, polymer, brass & optics) ---
  // Activates only on convex aCurvature bevels (milled receiver chamfers, Picatinny teeth, bolt flutes,
  // welded steel armor seams) while keeping flat dark steel base luminance strictly unchanged.
  {
    float armoryIsCoolSteel = 1.0 - smoothstep( 0.08, 0.25, uEdgeWearColor.r - uEdgeWearColor.b );
    float armoryIsSteelEdge =
      uEdgeMetal *
      armoryIsCoolSteel *
      smoothstep( 0.45, 0.82, metalnessFactor ) *
      ( 1.0 - armoryOpticMask ) *
      ( 1.0 - smoothstep( 0.05, 0.25, uFunctionalTintMix ) );
    float armoryConvexEdge = max(
      armoryLocalizedConvex,
      smoothstep( 0.35, 0.88, vArmoryCurvature ) * smoothstep( 0.22, 0.78, armoryDeriv ) * 0.75
    );
    float armorySatinGate = 1.0 - smoothstep( 0.62, 0.90, roughnessFactor );
    armoryCncBevelMask = clamp( armoryConvexEdge * armoryIsSteelEdge * armorySatinGate, 0.0, 1.0 );
  }
}
#endif
`;

const FRAGMENT_NORMAL_TRIPLANAR = /* glsl */ `
#ifdef ARMORY_SHADER
{
  // --- Sanitize interpolated normals & object-space triplanar detail normal blending ---
  // Guards against zero-length interpolated vNormal across sharp 180 deg CSG creases and
  // eliminates planar-UV sidewall stretching on CSG boolean cuts, flutes, and stippled grips.
  nonPerturbedNormal = armorySafeNormalize( nonPerturbedNormal, vec3( 0.0, 0.0, 1.0 ) );
  normal = armorySafeNormalize( normal, nonPerturbedNormal );

  vec3 armoryObjN = armorySafeNormalize( vArmoryObjNormal, vec3( 0.0, 1.0, 0.0 ) );
  vec3 armoryN2 = armoryObjN * armoryObjN;
  vec3 armoryTriW = armoryN2 * armoryN2;
  armoryTriW /= max( armoryTriW.x + armoryTriW.y + armoryTriW.z, 1e-5 );

  // Fade high-frequency grain with scale-aware pixel footprint AND suppress stipple on optically smooth glass/chrome
  float armoryNormScale = max( uSurfaceScale, 1.0 );
  bool armoryNormIsTank = armoryNormScale > 2.0;
  vec3 armoryNormPos = vArmoryObjPos / armoryNormScale;
  float armoryPixSpan = max( length( fwidth( vArmoryObjPos ) ), 1e-4 ) / armoryNormScale;

  vec3 armoryObjPerturb;
  if ( armoryNormIsTank ) {
    float armoryArmorGrainFade =
      ( 1.0 - smoothstep( 0.22, 1.15, armoryPixSpan ) ) *
      smoothstep( 0.18, 0.38, roughnessFactor ) *
      ( 1.0 - armoryOpticMask );
    float armoryProcWeight = mix( 0.185, 0.065, step( 0.5, uHasArmorDetail ) );
    vec2 aX = armoryArmorMicroSlope2D( armoryNormPos.zy );
    vec2 aY = armoryArmorMicroSlope2D( armoryNormPos.xz );
    vec2 aZ = armoryArmorMicroSlope2D( armoryNormPos.xy );
    armoryObjPerturb = (
      vec3( 0.0, aX.y, aX.x ) * armoryTriW.x +
      vec3( aY.x, 0.0, aY.y ) * armoryTriW.y +
      vec3( aZ.x, aZ.y, 0.0 ) * armoryTriW.z
    ) * ( armoryProcWeight * armoryArmorGrainFade );
  } else {
    float armoryGrainFade =
      ( 1.0 - smoothstep( 0.12, 0.52, armoryPixSpan ) ) *
      smoothstep( 0.10, 0.26, roughnessFactor ) *
      ( 1.0 - armoryOpticMask );
    vec2 sX = armoryMicroSlope2D( vArmoryObjPos.zy, uDetailGrainMode );
    vec2 sY = armoryMicroSlope2D( vArmoryObjPos.xz, uDetailGrainMode );
    vec2 sZ = armoryMicroSlope2D( vArmoryObjPos.xy, uDetailGrainMode );
    armoryObjPerturb = (
      vec3( 0.0, sX.y, sX.x ) * armoryTriW.x +
      vec3( sY.x, 0.0, sY.y ) * armoryTriW.y +
      vec3( sZ.x, sZ.y, 0.0 ) * armoryTriW.z
    ) * ( uTriplanarDetail * armoryGrainFade );
  }

  #if defined( USE_NORMALMAP_TANGENTSPACE ) && defined( ARMORY_TRIPLANAR_MAP )
    vec2 mX = ( texture2D( normalMap, vArmoryObjPos.zy * uTriplanarScale ).xy * 2.0 - 1.0 ) * normalScale;
    vec2 mY = ( texture2D( normalMap, vArmoryObjPos.xz * uTriplanarScale ).xy * 2.0 - 1.0 ) * normalScale;
    vec2 mZ = ( texture2D( normalMap, vArmoryObjPos.xy * uTriplanarScale ).xy * 2.0 - 1.0 ) * normalScale;
    vec3 armoryTriMapObj =
      vec3( 0.0, mX.y, mX.x ) * armoryTriW.x +
      vec3( mY.x, 0.0, mY.y ) * armoryTriW.y +
      vec3( mZ.x, mZ.y, 0.0 ) * armoryTriW.z;
    vec3 armoryTriView = normalMatrix * armoryTriMapObj;
    armoryTriView -= nonPerturbedNormal * dot( armoryTriView, nonPerturbedNormal );
    vec3 armoryTriNormal = armorySafeNormalize( nonPerturbedNormal + armoryTriView * faceDirection, nonPerturbedNormal );
    normal = armorySafeNormalize( mix( normal, armoryTriNormal, 0.55 ), nonPerturbedNormal );
  #endif

  vec3 armoryViewPerturb = normalMatrix * armoryObjPerturb;
  armoryViewPerturb -= normal * dot( armoryViewPerturb, normal );
  normal = armorySafeNormalize( normal + armoryViewPerturb * faceDirection, nonPerturbedNormal );

  // --- Seamless 512x512 Triplanar Detail Normal (RNM) + Micro-Roughness (RHA pitting + CARC mineral grit) ---
  if ( uHasArmorDetail > 0.5 ) {
    // 28 cm physical tile repeat on 1:1 heavy armor; 5.5 cm ultra-fine machined grain on small arms
    vec3 armoryDetailPos = armoryNormIsTank ? ( vArmoryObjPos / 28.0 ) : ( vArmoryObjPos / 5.5 );
    float armoryDetailSpan = max( length( fwidth( armoryDetailPos ) ), 1e-5 );
    // Distance / Nyquist anti-shimmer fade: razor-sharp up close, smooth fade at far pullback
    float armoryNyquistFade = armoryNormIsTank
      ? ( 1.0 - smoothstep( 0.038, 0.145, armoryDetailSpan ) )
      : ( 1.0 - smoothstep( 0.032, 0.120, armoryDetailSpan ) );
    float armoryDetailSurfaceGate = armoryNormIsTank
      ? smoothstep( 0.14, 0.34, roughnessFactor )
      : smoothstep( 0.18, 0.42, roughnessFactor );
    float armoryDetailFade = armoryNyquistFade * armoryDetailSurfaceGate * ( 1.0 - armoryOpticMask );

    if ( armoryDetailFade > 0.002 ) {
      vec2 dUvX = armoryDetailPos.zy;
      vec2 dUvY = armoryDetailPos.xz + vec2( 0.37, 0.61 );
      vec2 dUvZ = armoryDetailPos.xy + vec2( 0.73, 0.19 );

      float armoryPaintWeight = 1.0 - smoothstep( 0.25, 0.65, metalnessFactor );
      float armoryDetailNormGain = armoryNormIsTank
        ? mix( 0.34, 0.58, armoryPaintWeight ) * armoryDetailFade
        : 0.14 * armoryDetailFade;

      vec3 tX = texture2D( uArmorDetailNormal, dUvX ).xyz * 2.0 - 1.0;
      vec3 tY = texture2D( uArmorDetailNormal, dUvY ).xyz * 2.0 - 1.0;
      vec3 tZ = texture2D( uArmorDetailNormal, dUvZ ).xyz * 2.0 - 1.0;
      tX = armorySafeNormalize( vec3( tX.xy * armoryDetailNormGain, max( tX.z, 0.1 ) ), vec3( 0.0, 0.0, 1.0 ) );
      tY = armorySafeNormalize( vec3( tY.xy * armoryDetailNormGain, max( tY.z, 0.1 ) ), vec3( 0.0, 0.0, 1.0 ) );
      tZ = armorySafeNormalize( vec3( tZ.xy * armoryDetailNormGain, max( tZ.z, 0.1 ) ), vec3( 0.0, 0.0, 1.0 ) );

      // Triplanar Reoriented Normal Mapping (RNM) in object space, then exact SO(3) reorientation onto baked normal
      float signX = armoryObjN.x < 0.0 ? -1.0 : 1.0;
      float signY = armoryObjN.y < 0.0 ? -1.0 : 1.0;
      float signZ = armoryObjN.z < 0.0 ? -1.0 : 1.0;
      vec3 nX = armoryBlendRNM( vec3( armoryObjN.zy, abs( armoryObjN.x ) ), tX );
      vec3 nY = armoryBlendRNM( vec3( armoryObjN.xz, abs( armoryObjN.y ) ), tY );
      vec3 nZ = armoryBlendRNM( vec3( armoryObjN.xy, abs( armoryObjN.z ) ), tZ );

      vec3 armoryTriObjN = armorySafeNormalize(
        vec3( nX.z * signX, nX.y, nX.x ) * armoryTriW.x +
        vec3( nY.x, nY.z * signY, nY.y ) * armoryTriW.y +
        vec3( nZ.x, nZ.y, nZ.z * signZ ) * armoryTriW.z,
        armoryObjN
      );

      vec3 armoryBaseViewN = armorySafeNormalize( ( normalMatrix * armoryObjN ) * faceDirection, nonPerturbedNormal );
      vec3 armoryDetailViewN = armorySafeNormalize( ( normalMatrix * armoryTriObjN ) * faceDirection, armoryBaseViewN );
      normal = armoryReorientNormal3D( armoryBaseViewN, normal, armoryDetailViewN );

      // Triplanar micro-roughness modulation centered at 0.5
      float rX = texture2D( uArmorDetailRoughness, dUvX ).r;
      float rY = texture2D( uArmorDetailRoughness, dUvY ).r;
      float rZ = texture2D( uArmorDetailRoughness, dUvZ ).r;
      float armoryDetailRghDelta = ( rX * armoryTriW.x + rY * armoryTriW.y + rZ * armoryTriW.z ) - 0.5;
      float armoryDetailRghGain = armoryNormIsTank
        ? mix( 0.11, 0.17, armoryPaintWeight ) * armoryDetailFade
        : 0.055 * armoryDetailFade;
      roughnessFactor = clamp( roughnessFactor + armoryDetailRghDelta * armoryDetailRghGain, 0.04, 1.0 );
    }
  }

  // --- Toksvig / Kaplanyan geometric specular anti-aliasing (eliminates metallic edge shimmer) ---
  vec3 armoryDnDx = dFdx( normal );
  vec3 armoryDnDy = dFdy( normal );
  float armoryGeomVar = clamp( dot( armoryDnDx, armoryDnDx ) + dot( armoryDnDy, armoryDnDy ), 0.0, 1.0 );
  float armorySpecAA = clamp( sqrt( armoryGeomVar ) * 0.34, 0.0, 0.22 );
  roughnessFactor = clamp( sqrt( roughnessFactor * roughnessFactor + armorySpecAA * armorySpecAA ), 0.04, 1.0 );
}
#endif
`;

const FRAGMENT_THERMAL = /* glsl */ `
#ifdef ARMORY_THERMAL
{
  // --- Ordnance steel blackbody glow (300 K -> 920 K) peaking at chamber throat / gas port ---
  float armoryT = armoryAxialT();
  float armoryThroatD = ( armoryT - 0.14 ) / 0.22;
  float armoryThroat = exp( -armoryThroatD * armoryThroatD );
  float armoryProfile = clamp( 0.3 + 0.7 * armoryThroat + 0.2 * ( 1.0 - armoryT ), 0.0, 1.0 );
  armoryProfile = mix( 1.0, armoryProfile, uThermalProfileMix );
  float armoryH = clamp( uThermalHeat * armoryProfile, 0.0, 1.0 );
  float armoryKelvinN = ( 300.0 + 620.0 * armoryH ) / 920.0;
  float armoryOnset = smoothstep( 0.28, 1.0, armoryH );
  float armoryK2 = armoryKelvinN * armoryKelvinN;
  float armoryGain = armoryOnset * armoryOnset * armoryK2 * armoryK2 * 7.5;
  totalEmissiveRadiance += armoryBlackbody( armoryH ) * armoryGain;
}
#endif
`;

const FRAGMENT_LIGHTING_MICRO_AO = /* glsl */ `
#ifdef ARMORY_SHADER
{
  #ifdef USE_AOMAP
    float armoryAoRaw = clamp( texture2D( aoMap, vAoMapUv ).r, 0.0, 1.0 );
    float armoryAoScale = max( uSurfaceScale, 1.0 );
    bool armoryAoIsTank = armoryAoScale > 2.0;

    // Strictly clamped baked AO prevents negative values & pow(neg, frac) NaNs when aoMapIntensity > 1.0 on heavy armor
    float armoryAo = clamp( ( armoryAoRaw - 1.0 ) * aoMapIntensity + 1.0, 0.04, 1.0 );
    float armoryDotNV = saturate( dot( geometryNormal, geometryViewDir ) );

    // Lagarde & de Rousiers (2014) Specular Occlusion applied directly to IBL radiance & clearcoatRadiance:
    // Subtle protective floor on small arms/archery (preserves royal bluing, walnut & stainless);
    // authoritative physical depth on heavy armor (ERA tile gaps, road wheels & turret rings).
    float armorySpecAoInput = armoryAoIsTank
      ? clamp( mix( armoryAoRaw, armoryAo, 0.85 ), 0.06, 1.0 )
      : clamp( mix( 1.0, armoryAo, 0.78 ), 0.22, 1.0 );
    float armorySpecOcc = computeSpecularOcclusion( armoryDotNV, armorySpecAoInput, material.roughness );

    #if defined( RE_IndirectDiffuse )
      vec3 armoryMultiAo = armoryMultiBounceAO( armoryAo, material.diffuseColor );
      vec3 armoryDiffAo = armoryAoIsTank ? mix( vec3( armoryAo ), armoryMultiAo, 0.45 ) : armoryMultiAo;
      irradiance *= armoryDiffAo;
      iblIrradiance *= mix( armoryDiffAo, vec3( armorySpecOcc ), metalnessFactor * 0.65 );
    #endif

    #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
      radiance *= armorySpecOcc;
      #ifdef USE_CLEARCOAT
        float armoryDotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
        clearcoatRadiance *= computeSpecularOcclusion( armoryDotNVcc, armorySpecAoInput, material.clearcoatRoughness );
      #endif
    #endif

    // Direct Light Micro-Shadowing: open faces stay at 100% key-light punch while tight baked crevices
    // attenuate direct diffuse & direct specular so seams never glow flatly under directional key light.
    float armoryMicroDiff = armoryAoIsTank
      ? mix( 0.28, 1.0, smoothstep( 0.08, 0.78, armoryAoRaw ) )
      : mix( 0.66, 1.0, smoothstep( 0.05, 0.64, armoryAoRaw ) );
    float armorySpecCrevice = armoryAoIsTank
      ? smoothstep( 0.14, 0.84, armoryAoRaw )
      : smoothstep( 0.10, 0.72, armoryAoRaw );
    float armoryMicroSpec = armoryAoIsTank
      ? mix( 0.12, 1.0, armorySpecCrevice * armorySpecCrevice )
      : mix( 0.42, 1.0, armorySpecCrevice * armorySpecCrevice );

    reflectedLight.directDiffuse *= armoryMicroDiff;
    reflectedLight.directSpecular *= armoryMicroSpec;
    #ifdef USE_CLEARCOAT
      clearcoatSpecularDirect *= armoryMicroSpec;
    #endif
    #ifdef USE_SHEEN
      sheenSpecularDirect *= armoryMicroDiff;
    #endif
  #endif
}
#endif
`;

const FRAGMENT_AOMAP_AND_OPTICAL_AR = /* glsl */ `
#ifdef ARMORY_SHADER
{
  // Baked AO, Lagarde Specular Occlusion & Direct Light Micro-Shadowing were already applied cleanly
  // prior to lights_fragment_end (eliminating double-occlusion & unclamped negative-AO NaN hazard).

  // --- Optical AR Multi-Coating Thin-Film Fresnel Iridescence ---
  // Deep obsidian anti-reflective cavity at normal incidence -> emerald / sapphire / blue-violet / ruby-magenta grazing sheen
  if ( armoryOpticMask > 0.001 ) {
    float armoryOptDotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    float armoryOptF1 = clamp( 1.0 - armoryOptDotNV, 0.0, 1.0 );
    float armoryOptF2 = armoryOptF1 * armoryOptF1;
    float armoryOptF5 = armoryOptF2 * armoryOptF2 * armoryOptF1;
    float armoryOptGrazing = smoothstep( 0.08, 0.88, armoryOptF1 );

    vec3 armoryArTint = armoryOpticalArTint( armoryOpticBaseRgb, armoryOptF1 );
    vec3 armoryArEnv = vec3( 0.28 );
    #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
      armoryArEnv = clamp( radiance, vec3( 0.14 ), vec3( 3.2 ) );
    #endif

    // Suppress flat diffuse bounce at normal incidence so lenses read as deep obsidian optical glass
    float armoryObsidianAtten = mix( 1.0, mix( 0.28, 0.72, armoryOptF2 ), armoryOpticMask );
    reflectedLight.directDiffuse *= armoryObsidianAtten;
    reflectedLight.indirectDiffuse *= armoryObsidianAtten;

    // Multi-coated thin-film reflection sheen coupled to studio HDRI radiance & grazing Fresnel angle
    vec3 armoryArSheen = armoryArTint * armoryArEnv * ( 0.10 + 0.85 * armoryOptF2 + 0.55 * armoryOptF5 );
    reflectedLight.indirectSpecular = mix(
      reflectedLight.indirectSpecular,
      reflectedLight.indirectSpecular * mix( vec3( 0.68 ), armoryArTint * 2.1, armoryOptGrazing ) + armoryArSheen,
      armoryOpticMask
    );
    reflectedLight.directSpecular +=
      reflectedLight.directSpecular * armoryArTint * ( 0.45 * armoryOptGrazing ) * armoryOpticMask;
  }

  // --- CNC Machined-Edge Bevel Glint (Fresnel-weighted studio specular highlight along steel bevels) ---
  if ( armoryCncBevelMask > 0.001 ) {
    float armoryBevelDotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    float armoryBevelF1 = clamp( 1.0 - armoryBevelDotNV, 0.0, 1.0 );
    float armoryBevelF = armoryBevelF1 * armoryBevelF1 * ( 0.35 + 0.65 * armoryBevelF1 );
    vec3 armoryBevelEnv = vec3( 0.30 );
    #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
      armoryBevelEnv = clamp( radiance, vec3( 0.12 ), vec3( 2.8 ) );
    #endif
    vec3 armoryBevelTint = mix( vec3( 0.86, 0.90, 0.96 ), uEdgeWearColor, 0.55 );
    float armoryBevelRim = armoryCncBevelMask * ( 0.14 + 0.86 * armoryBevelF );
    vec3 armoryCncBevelGlint = armoryBevelTint * armoryBevelEnv * ( 0.22 * armoryBevelRim );
    reflectedLight.indirectSpecular += armoryCncBevelGlint;
    reflectedLight.directSpecular +=
      reflectedLight.directSpecular * armoryBevelTint * ( 0.24 * armoryBevelRim );
  }

  // --- Smithsonian Museum Pin-Spot Fresnel Rim & Documentary Depth Emphasis ---
  // Both branches short-circuit at rest (uCuratorDim == 1.0 && uCuratorSpot == 0.0) for zero baseline drift.
  if ( uCuratorDim < 0.999 ) {
    float armoryCuratorDim = clamp( uCuratorDim, 0.55, 1.0 );
    float armoryCuratorSpecDim = mix( 1.0, armoryCuratorDim, 0.55 );
    reflectedLight.directDiffuse *= armoryCuratorDim;
    reflectedLight.indirectDiffuse *= armoryCuratorDim;
    reflectedLight.directSpecular *= armoryCuratorSpecDim;
    reflectedLight.indirectSpecular *= armoryCuratorSpecDim;
  }
  if ( uCuratorSpot > 0.001 ) {
    float armoryCuratorDotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    float armoryCuratorF1 = clamp( 1.0 - armoryCuratorDotNV, 0.0, 1.0 );
    float armoryCuratorRim = smoothstep( 0.18, 0.92, armoryCuratorF1 ) * ( armoryCuratorF1 * armoryCuratorF1 * armoryCuratorF1 );
    float armoryCuratorWeight = clamp( uCuratorSpot, 0.0, 1.0 );
    vec3 armoryCuratorSpot = uCuratorRimColor * ( armoryCuratorRim * armoryCuratorWeight * 0.46 );
    reflectedLight.indirectSpecular += armoryCuratorSpot;
    reflectedLight.directSpecular +=
      reflectedLight.directSpecular * uCuratorRimColor * ( 0.14 * armoryCuratorRim * armoryCuratorWeight );
  }
}
#endif
`;

const FRAGMENT_OUTPUT_SANITIZE = /* glsl */ `
#ifdef ARMORY_SHADER
  gl_FragColor.rgb = armorySanitizeHdrRgb( gl_FragColor.rgb );
#endif
`;

export const ARMORY_VERTEX_ANCHOR = '#include <begin_vertex>';
export const ARMORY_COMMON_ANCHOR = '#include <common>';
export const ARMORY_SURFACE_ANCHOR = '#include <metalnessmap_fragment>';
export const ARMORY_NORMAL_ANCHOR = '#include <normal_fragment_maps>';
export const ARMORY_EMISSIVE_ANCHOR = '#include <emissivemap_fragment>';
export const ARMORY_LIGHTS_MAPS_ANCHOR = '#include <lights_fragment_maps>';
export const ARMORY_AOMAP_ANCHOR = '#include <aomap_fragment>';
export const ARMORY_OPAQUE_ANCHOR = '#include <opaque_fragment>';

function injectAfter(src: string, anchor: string, chunk: string): string {
  if (!src.includes(anchor)) return src;
  return src.replace(anchor, `${anchor}\n${chunk}`);
}

/** Injects the vertex-only spring deformation & object-space attributes. */
export function injectArmoryVertexShader(
  vertexShader: string,
  features: ArmoryShaderFeatures,
  depthOnly = false
): string {
  let v = vertexShader;
  const header =
    buildDefines(features) + (depthOnly ? '#define ARMORY_DEPTH_ONLY\n' : '');
  v = injectAfter(v, ARMORY_COMMON_ANCHOR, VERTEX_PARS);
  v = injectAfter(v, ARMORY_VERTEX_ANCHOR, VERTEX_SPRING);
  return header + v;
}

export function injectArmoryFragmentShader(
  fragmentShader: string,
  features: ArmoryShaderFeatures
): string {
  let f = fragmentShader;
  f = injectAfter(f, ARMORY_COMMON_ANCHOR, FRAGMENT_PARS);
  f = injectAfter(f, ARMORY_SURFACE_ANCHOR, FRAGMENT_SURFACE);
  f = injectAfter(f, ARMORY_NORMAL_ANCHOR, FRAGMENT_NORMAL_TRIPLANAR);
  f = injectAfter(f, ARMORY_EMISSIVE_ANCHOR, FRAGMENT_THERMAL);
  if (f.includes(ARMORY_LIGHTS_MAPS_ANCHOR)) {
    f = injectAfter(f, ARMORY_LIGHTS_MAPS_ANCHOR, FRAGMENT_LIGHTING_MICRO_AO);
    if (f.includes(ARMORY_AOMAP_ANCHOR)) {
      f = f.replace(ARMORY_AOMAP_ANCHOR, FRAGMENT_AOMAP_AND_OPTICAL_AR);
    }
  } else {
    f = injectAfter(f, ARMORY_AOMAP_ANCHOR, FRAGMENT_AOMAP_AND_OPTICAL_AR);
  }
  f = injectAfter(f, ARMORY_OPAQUE_ANCHOR, FRAGMENT_OUTPUT_SANITIZE);
  return buildDefines(features) + f;
}

/** Minimal structural shape of Three.js `WebGLProgramParametersWithUniforms`. */
export interface ArmoryShaderLike {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
}

export interface ArmoryMaterialHooks {
  onBeforeCompile: (shader: ArmoryShaderLike) => void;
  customProgramCacheKey: () => string;
}

/**
 * Builds stable `onBeforeCompile` / `customProgramCacheKey` hooks. Uniform objects are
 * shared by reference, so per-frame updates in `useFrame` are plain `.value` writes (zero GC).
 */
export function createArmoryMaterialHooks(
  features: ArmoryShaderFeatures,
  uniforms: ArmoryShaderUniforms
): ArmoryMaterialHooks {
  const key = getArmoryProgramCacheKey(features);
  return {
    onBeforeCompile(shader) {
      Object.assign(shader.uniforms, uniforms, SHARED_HEAT_UNIFORMS);
      shader.vertexShader = injectArmoryVertexShader(
        shader.vertexShader,
        features
      );
      shader.fragmentShader = injectArmoryFragmentShader(
        shader.fragmentShader,
        features
      );
    },
    customProgramCacheKey: () => key,
  };
}

/** Attaches the armory hooks + uniform refs (`userData.armoryUniforms`) to a material instance. */
export function applyArmoryShader(
  material: THREE.MeshPhysicalMaterial,
  features: ArmoryShaderFeatures,
  uniforms: ArmoryShaderUniforms
): THREE.MeshPhysicalMaterial {
  const hooks = createArmoryMaterialHooks(features, uniforms);
  material.onBeforeCompile =
    hooks.onBeforeCompile as THREE.Material['onBeforeCompile'];
  material.customProgramCacheKey = hooks.customProgramCacheKey;
  material.userData.armoryUniforms = uniforms;
  material.userData.armoryFeatures = features;
  material.needsUpdate = true;
  return material;
}

/**
 * Depth material for shadow casting so compressed springs cast matching compressed shadows.
 * Only the spring vertex chunk is injected (zero fragment overhead).
 */
export function createArmorySpringDepthMaterial(
  uniforms: ArmoryShaderUniforms
): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  const features: ArmoryShaderFeatures = {
    spring: true,
    curvature: false,
    thermal: false,
    fouling: false,
    triplanarMap: false,
  };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSpringScale = uniforms.uSpringScale;
    shader.vertexShader = injectArmoryVertexShader(
      shader.vertexShader,
      features,
      true
    );
  };
  mat.customProgramCacheKey = () =>
    `armory-spring-depth-v${ARMORY_SHADER_VERSION}`;
  mat.userData.armoryUniforms = uniforms;
  return mat;
}

/** Computes the longitudinal (+X) heat span from a geometry's local bounding box. */
export function computeThermalSpanInto(
  geometry: THREE.BufferGeometry,
  out: THREE.Vector2
): THREE.Vector2 {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  if (!bb || bb.isEmpty()) return out.set(-1, 1);
  return out.set(bb.min.x, bb.max.x > bb.min.x ? bb.max.x : bb.min.x + 1e-3);
}
