import * as THREE from 'three';
import type { MaterialKind } from '../../weapons/types';

/**
 * AAA Armory Surface Shader
 * ------------------------------------------------------------------
 * `onBeforeCompile` extension for `MeshPhysicalMaterial` adding:
 *  1. GPU constant-wire-diameter spring compression (`aSpringParam` + `uSpringScale`)
 *  2. Object-space triplanar detail normal blending (eliminates stretched planar UVs on CSG cuts)
 *  3. CNC curvature edge silvering & cavity CLP gun-oil / carbon grime (`aCurvature` + `fwidth`)
 *  4. 60Hz Zero-GC barrel thermal blackbody glow (`uThermalHeat`, 300K -> 920K) & carbon fouling (`uCarbonFouling`)
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
  /barrel|gas_block|gas_tube|gas_cylinder|argo_plug|piston|suppressor|muzzle|flash_hider|compensator/;
export const FOULING_PART_ID_PATTERN =
  /bolt|carrier|breech|chamber|python_cylinder|op_rod|extractor|firing_pin/;
const SPRING_ID_EXCLUSION_PATTERN = /spring/;
const ARCHERY_ID_EXCLUSION_PATTERN =
  /^(?:lift33|r500)_|limb|bowstring|yoke_cable|power_cable|broadhead|quiver/;
/** Parts whose heat follows the chamber -> throat -> muzzle longitudinal profile. */
const BARREL_PROFILE_PATTERN = /barrel/;

export interface ArmoryPartLike {
  id: string;
  material: MaterialKind;
}

export function isThermalBearingPart(part: ArmoryPartLike): boolean {
  if (ARCHERY_ID_EXCLUSION_PATTERN.test(part.id)) return false;
  if (part.material === 'barrel_steel') return true;
  if (
    part.material === 'spring_steel' ||
    part.material === 'polymer_frame' ||
    part.material === 'follower_orange' ||
    SPRING_ID_EXCLUSION_PATTERN.test(part.id)
  ) {
    return false;
  }
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
    edgeWearColor: '#aeb6bf',
    edgeWear: 0.9,
    edgeMetal: 1,
    triplanarScale: 0.14,
    triplanarDetail: 0.045,
    detailGrainMode: 1,
  },
  // Cold-hammer-forged ordnance steel: phosphate satin wears to bright steel
  barrel_steel: {
    edgeWearColor: '#b6bec7',
    edgeWear: 0.78,
    edgeMetal: 1,
    triplanarScale: 0.16,
    triplanarDetail: 0.05,
    detailGrainMode: 1,
  },
  // Brushed 416 / 17-4 PH stainless
  stainless: {
    edgeWearColor: '#e2e8f0',
    edgeWear: 0.36,
    edgeMetal: 1,
    triplanarScale: 0.18,
    triplanarDetail: 0.032,
    detailGrainMode: 1,
  },
  // Glass-filled nylon 6: scuffed edges lighten slightly without turning metallic
  polymer_frame: {
    edgeWearColor: '#64748b',
    edgeWear: 0.42,
    edgeMetal: 0,
    triplanarScale: 0.24,
    triplanarDetail: 0.065,
    detailGrainMode: -1,
  },
  // Tempered oil-quenched music wire
  spring_steel: {
    edgeWearColor: '#cbd5e1',
    edgeWear: 0.38,
    edgeMetal: 1,
    triplanarScale: 0.2,
    triplanarDetail: 0.02,
    detailGrainMode: 1,
  },
  // Injection-moulded high-visibility follower polymer
  follower_orange: {
    edgeWearColor: '#fdba74',
    edgeWear: 0.28,
    edgeMetal: 0,
    triplanarScale: 0.22,
    triplanarDetail: 0.035,
    detailGrainMode: -1,
  },
  // C26000 cartridge brass / copper
  copper_accent: {
    edgeWearColor: '#f3c98b',
    edgeWear: 0.5,
    edgeMetal: 1,
    triplanarScale: 0.16,
    triplanarDetail: 0.03,
    detailGrainMode: 1,
  },
};

export function syncArmoryUniformProfile(
  uniforms: ArmoryShaderUniforms,
  kind: MaterialKind
): ArmoryShaderUniforms {
  const prof = ARMORY_SURFACE_PROFILES[kind];
  uniforms.uEdgeWear.value = prof.edgeWear;
  uniforms.uEdgeMetal.value = prof.edgeMetal;
  uniforms.uEdgeWearColor.value.set(prof.edgeWearColor);
  uniforms.uTriplanarScale.value = prof.triplanarScale;
  uniforms.uTriplanarDetail.value = prof.triplanarDetail;
  uniforms.uDetailGrainMode.value = prof.detailGrainMode;
  return uniforms;
}

export function createArmoryShaderUniforms(
  kind: MaterialKind = 'nitride_steel'
): ArmoryShaderUniforms {
  const prof = ARMORY_SURFACE_PROFILES[kind];
  return {
    uSpringScale: { value: 1 },
    uThermalHeat: { value: 0 },
    uCarbonFouling: { value: 0 },
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

export const ARMORY_SHADER_VERSION = 5;

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

// 2D tangent-plane micro-slope for CNC brushed toolmarks (+1) vs EDM polymer stipple (-1)
vec2 armoryMicroSlope2D( vec2 uv, float mode ) {
  if ( mode > 0.0 ) {
    // Fine anisotropic CNC lathe / surface-grinder toolmarks
    float g1 = armoryValueNoise2( vec2( uv.x * 9.0, uv.y * 52.0 ) ) - 0.5;
    float g2 = armoryValueNoise2( vec2( uv.x * 26.0, uv.y * 110.0 ) ) - 0.5;
    return vec2( g1 * 0.25, g1 * 0.85 + g2 * 0.45 );
  }
  // Isotropic glass-filled nylon EDM mould stipple
  float s1 = armoryValueNoise2( uv * 42.0 ) - 0.5;
  float s2 = armoryValueNoise2( uv * 42.0 + vec2( 0.37, 0.71 ) ) - 0.5;
  return vec2( s1, s2 );
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
`;

const FRAGMENT_SURFACE = /* glsl */ `
#ifdef ARMORY_SHADER
{
  // --- WP-05: Engineering functional role tint (zero shader recompilation) ---
  if ( uFunctionalTintMix > 0.0001 ) {
    diffuseColor.rgb = mix( diffuseColor.rgb, uFunctionalTint, clamp( uFunctionalTintMix, 0.0, 1.0 ) );
  }

  // --- CNC curvature edge silvering & cavity CLP gun-oil / grime ---
  float armoryEdge = smoothstep( 0.25, 0.85, vArmoryCurvature );
  float armoryCavity = smoothstep( 0.25, 0.85, -vArmoryCurvature );
  #ifndef FLAT_SHADED
    // Screen-space normal derivative micro-edge detector (hard CNC breaks between facets)
    float armoryDeriv = clamp( length( fwidth( vNormal ) ) * 2.2 - 0.18, 0.0, 1.0 );
    armoryEdge = max( armoryEdge, armoryDeriv * 0.55 );
  #endif
  armoryEdge *= uEdgeWear;
  diffuseColor.rgb = mix( diffuseColor.rgb, uEdgeWearColor, armoryEdge * 0.62 );
  roughnessFactor *= mix( 1.0, 0.68, armoryEdge );
  metalnessFactor = mix( metalnessFactor, max( metalnessFactor, 0.92 ), armoryEdge * uEdgeMetal );

  // Concave recesses: darkened crevices with subtle CLP gun-oil sheen in clean state
  diffuseColor.rgb *= mix( 1.0, 0.76, armoryCavity );
  roughnessFactor *= mix( 1.0, 0.84, armoryCavity );

  #ifdef ARMORY_FOULING
    // --- Gunpowder carbon fouling (soot): blotchy, concentrated toward muzzle / gas exits ---
    float armoryT = armoryAxialT();
    float armoryThroatD = ( armoryT - 0.14 ) / 0.12;
    float armorySootBias = mix( 1.0, 0.35 + 0.65 * smoothstep( 0.55, 1.0, armoryT ) + 0.4 * exp( -armoryThroatD * armoryThroatD ), uThermalProfileMix );
    float armorySootNoise = armoryValueNoise( vArmoryObjPos * 1.7 ) * 0.65 + armoryValueNoise( vArmoryObjPos * 6.3 ) * 0.35;
    float armorySoot = clamp( uCarbonFouling * armorySootBias * smoothstep( 0.22, 0.78, armorySootNoise + 0.18 * armoryCavity ), 0.0, 1.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.032, 0.029, 0.026 ), armorySoot * 0.78 );
    roughnessFactor = mix( roughnessFactor, 0.93, armorySoot * 0.85 );
    metalnessFactor *= 1.0 - armorySoot * 0.6;
  #endif

  roughnessFactor = clamp( roughnessFactor, 0.04, 1.0 );
  metalnessFactor = clamp( metalnessFactor, 0.0, 1.0 );
}
#endif
`;

const FRAGMENT_NORMAL_TRIPLANAR = /* glsl */ `
#ifdef ARMORY_SHADER
{
  // --- Sanitize interpolated normals & object-space triplanar detail normal blending ---
  // Guards against zero-length interpolated vNormal across sharp 180° CSG creases and
  // eliminates planar-UV sidewall stretching on CSG boolean cuts, flutes, and stippled grips.
  nonPerturbedNormal = armorySafeNormalize( nonPerturbedNormal, vec3( 0.0, 0.0, 1.0 ) );
  normal = armorySafeNormalize( normal, nonPerturbedNormal );

  vec3 armoryObjN = armorySafeNormalize( vArmoryObjNormal, vec3( 0.0, 1.0, 0.0 ) );
  vec3 armoryN2 = armoryObjN * armoryObjN;
  vec3 armoryTriW = armoryN2 * armoryN2;
  armoryTriW /= max( armoryTriW.x + armoryTriW.y + armoryTriW.z, 1e-5 );

  // Fade high-frequency grain with pixel footprint AND suppress mould stipple on optically smooth glass/chrome
  float armoryPixSpan = max( length( fwidth( vArmoryObjPos ) ), 1e-4 );
  float armoryGrainFade = ( 1.0 - smoothstep( 0.06, 0.28, armoryPixSpan ) ) * smoothstep( 0.12, 0.30, roughnessFactor );

  vec2 sX = armoryMicroSlope2D( vArmoryObjPos.zy, uDetailGrainMode );
  vec2 sY = armoryMicroSlope2D( vArmoryObjPos.xz, uDetailGrainMode );
  vec2 sZ = armoryMicroSlope2D( vArmoryObjPos.xy, uDetailGrainMode );
  vec3 armoryObjPerturb = (
    vec3( 0.0, sX.y, sX.x ) * armoryTriW.x +
    vec3( sY.x, 0.0, sY.y ) * armoryTriW.y +
    vec3( sZ.x, sZ.y, 0.0 ) * armoryTriW.z
  ) * ( uTriplanarDetail * armoryGrainFade );

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
