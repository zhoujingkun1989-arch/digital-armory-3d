import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type {
  AssemblyGroupKey,
  MaterialKind,
  WeaponScaleProfile,
} from '../../weapons/types';
import {
  ENGINEERING_ROLE_META,
  type EngineeringRole,
} from '../materials/engineeringRoles';

/**
 * Two-Pass WebGL Stencil Solid Cross-Section Capping
 * ------------------------------------------------------------------
 * For every section-cut part (interleaved per part via unique renderOrder slots):
 *   Pass A  back faces  (clipped) -> stencil IncrementWrap
 *   Pass B  front faces (clipped) -> stencil DecrementWrap
 *   Pass C  cap plane at live `sectionPlaneZ(clippingPlanes[0])` -> drawn where stencil != 0, then stencil -> 0
 *
 * Pass C clears the stencil back to 0 on fail / zfail / zpass, preventing any
 * cross-part bleed across multiple sliced shells. Every helper & cap mesh uses
 * `raycast={() => null}` so `sectionAwareMeshRaycast` internal picking stays 100% unobstructed.
 */

export const SECTION_CAP_RENDER_ORDER_BASE = 1000;

export type SectionCutAxis = 'z' | 'x' | 'y' | 'box';

export const SECTION_CUT_AXES: readonly SectionCutAxis[] = [
  'z',
  'x',
  'y',
  'box',
];

/** Live CT-Scan section cutaway plane range in world units (1 unit = 1 cm = 10 mm). */
export const SECTION_CUT_OFFSET_MIN = -2.5;
export const SECTION_CUT_OFFSET_MAX = 2.5;
export const SECTION_CUT_OFFSET_STEP = 0.05;
export const SECTION_CUT_OFFSET_DEFAULT = 0;

/** Heavy Armor 1:1 Main Battle Tank CT-Scan section plane range (`±180 cm` = `±1,800 mm`). */
export const TANK_SECTION_CUT_OFFSET_MIN = -180;
export const TANK_SECTION_CUT_OFFSET_MAX = 180;
export const TANK_SECTION_CUT_OFFSET_STEP = 2.0;
export const TANK_SECTION_HATCH_SCALE = 18;

export interface SectionCutRangeSpec {
  min: number;
  max: number;
  step: number;
  sweepAmplitude: number;
  hatchScale: number;
  capMargin: number;
}

export interface SectionBoxDefaults {
  center: readonly [number, number, number];
  halfSize: readonly [number, number, number];
  minCenter: readonly [number, number, number];
  maxCenter: readonly [number, number, number];
  minHalf: readonly [number, number, number];
  maxHalf: readonly [number, number, number];
  step: number;
}

const SMALL_ARMS_SECTION_RANGE: SectionCutRangeSpec = {
  min: SECTION_CUT_OFFSET_MIN,
  max: SECTION_CUT_OFFSET_MAX,
  step: SECTION_CUT_OFFSET_STEP,
  sweepAmplitude: 2.15,
  hatchScale: 1,
  capMargin: 0.16,
};

const SMALL_ARMS_X_RANGE: SectionCutRangeSpec = {
  min: -38,
  max: 58,
  step: 0.5,
  sweepAmplitude: 32,
  hatchScale: 1,
  capMargin: 0.16,
};

const SMALL_ARMS_Y_RANGE: SectionCutRangeSpec = {
  min: -18,
  max: 18,
  step: 0.25,
  sweepAmplitude: 14,
  hatchScale: 1,
  capMargin: 0.16,
};

const TANK_SECTION_RANGE: SectionCutRangeSpec = {
  min: TANK_SECTION_CUT_OFFSET_MIN,
  max: TANK_SECTION_CUT_OFFSET_MAX,
  step: TANK_SECTION_CUT_OFFSET_STEP,
  sweepAmplitude: 155,
  hatchScale: TANK_SECTION_HATCH_SCALE,
  capMargin: 1.28,
};

const TANK_X_RANGE: SectionCutRangeSpec = {
  min: -420,
  max: 650,
  step: 8,
  sweepAmplitude: 380,
  hatchScale: TANK_SECTION_HATCH_SCALE,
  capMargin: 1.28,
};

const TANK_Y_RANGE: SectionCutRangeSpec = {
  min: -115,
  max: 145,
  step: 4,
  sweepAmplitude: 95,
  hatchScale: TANK_SECTION_HATCH_SCALE,
  capMargin: 1.28,
};

const SMALL_ARMS_BOX_DEFAULTS: SectionBoxDefaults = {
  center: [8, 0, 0],
  halfSize: [20, 12, 4],
  minCenter: [-35, -16, -8],
  maxCenter: [55, 16, 8],
  minHalf: [3, 2, 0.4],
  maxHalf: [60, 28, 14],
  step: 0.25,
};

const TANK_BOX_DEFAULTS: SectionBoxDefaults = {
  center: [60, 40, 0],
  halfSize: [260, 140, 110],
  minCenter: [-420, -110, -180],
  maxCenter: [620, 190, 180],
  minHalf: [35, 25, 20],
  maxHalf: [650, 240, 220],
  step: 5,
};

/** Returns adaptive CT-Scan section range & ISO 128 hatch scaling for small arms vs 1:1 tanks (Z axis default). */
export function getSectionCutRange(
  scaleProfile?: WeaponScaleProfile | null
): SectionCutRangeSpec {
  return scaleProfile === 'main_battle_tank'
    ? TANK_SECTION_RANGE
    : SMALL_ARMS_SECTION_RANGE;
}

/** Returns axis-aware (`z` / `x` / `y` / `box`) CT-Scan section range & hatch scaling. */
export function getAxisSectionCutRange(
  axis: SectionCutAxis = 'z',
  scaleProfile?: WeaponScaleProfile | null
): SectionCutRangeSpec {
  const isTank = scaleProfile === 'main_battle_tank';
  if (axis === 'x') return isTank ? TANK_X_RANGE : SMALL_ARMS_X_RANGE;
  if (axis === 'y') return isTank ? TANK_Y_RANGE : SMALL_ARMS_Y_RANGE;
  return isTank ? TANK_SECTION_RANGE : SMALL_ARMS_SECTION_RANGE;
}

/** Returns default & clamp bounds for 3D Cutaway Slice Box center and half-extents (cm). */
export function getDefaultSectionBoxParams(
  scaleProfile?: WeaponScaleProfile | null
): SectionBoxDefaults {
  return scaleProfile === 'main_battle_tank'
    ? TANK_BOX_DEFAULTS
    : SMALL_ARMS_BOX_DEFAULTS;
}

/**
 * Module-pooled live single-axis section-cut plane (zero per-frame allocations).
 * Mutating `SECTION_CUT_PLANES[0]` updates Three.js material clipping uniforms,
 * shadow clipping, `StencilSectionCap` Pass A/B/C, and `sectionAwareMeshRaycast`
 * simultaneously at 60 FPS with zero shader recompilation or React remounts.
 */
export const SECTION_CUT_PLANES: THREE.Plane[] = [
  new THREE.Plane(new THREE.Vector3(0, 0, -1), SECTION_CUT_OFFSET_DEFAULT),
];

/** Module-pooled 6-plane AABB Slice Box volume (`x∈[cx±hx], y∈[cy±hy], z∈[cz±hz]`). */
export const SECTION_CUT_BOX_PLANES: THREE.Plane[] = [
  new THREE.Plane(new THREE.Vector3(1, 0, 0), 12),
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), 28),
  new THREE.Plane(new THREE.Vector3(0, 1, 0), 12),
  new THREE.Plane(new THREE.Vector3(0, -1, 0), 12),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), 4),
  new THREE.Plane(new THREE.Vector3(0, 0, -1), 4),
];

/** Clamps a section-cut offset cleanly into the active axis range (`[-2.5, +2.5]` cm Z default). */
export function clampSectionCutOffset(
  offset: number,
  scaleProfile?: WeaponScaleProfile | null,
  axis: SectionCutAxis = 'z'
): number {
  if (!Number.isFinite(offset)) return SECTION_CUT_OFFSET_DEFAULT;
  const range = getAxisSectionCutRange(axis, scaleProfile);
  const clamped = Math.max(range.min, Math.min(range.max, offset));
  const rounded = Math.round(clamped * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Synchronizes the shared live clipping plane in place along `'z'`, `'x'`, or `'y'`.
 * - `'z'` (`flip = false`): keeps `z <= offset` (+Z right flank open)
 * - `'x'` (`flip = false`): keeps `x <= offset` (+X muzzle slice open)
 * - `'y'` (`flip = false`): keeps `y <= offset` (+Y top-down cutaway open)
 */
export function syncLiveSectionCutPlane(
  offset: number,
  flip = false,
  scaleProfile?: WeaponScaleProfile | null,
  axis: SectionCutAxis = 'z'
): THREE.Plane {
  const effectiveAxis: 'z' | 'x' | 'y' = axis === 'box' ? 'z' : axis;
  const clamped = clampSectionCutOffset(offset, scaleProfile, effectiveAxis);
  const plane = SECTION_CUT_PLANES[0];
  const dir = flip ? 1 : -1;
  if (effectiveAxis === 'x') {
    plane.normal.set(dir, 0, 0);
  } else if (effectiveAxis === 'y') {
    plane.normal.set(0, dir, 0);
  } else {
    plane.normal.set(0, 0, dir);
  }
  plane.constant = flip ? (clamped === 0 ? 0 : -clamped) : clamped;
  return plane;
}

/** Synchronizes the 6 inward-facing clipping planes of `SECTION_CUT_BOX_PLANES`. */
export function syncLiveSectionBoxPlanes(
  center: readonly [number, number, number],
  halfSize: readonly [number, number, number],
  scaleProfile?: WeaponScaleProfile | null
): THREE.Plane[] {
  const bounds = getDefaultSectionBoxParams(scaleProfile);
  const cx = Math.max(
    bounds.minCenter[0],
    Math.min(bounds.maxCenter[0], Number.isFinite(center[0]) ? center[0] : bounds.center[0])
  );
  const cy = Math.max(
    bounds.minCenter[1],
    Math.min(bounds.maxCenter[1], Number.isFinite(center[1]) ? center[1] : bounds.center[1])
  );
  const cz = Math.max(
    bounds.minCenter[2],
    Math.min(bounds.maxCenter[2], Number.isFinite(center[2]) ? center[2] : bounds.center[2])
  );
  const hx = Math.max(
    bounds.minHalf[0],
    Math.min(bounds.maxHalf[0], Number.isFinite(halfSize[0]) ? halfSize[0] : bounds.halfSize[0])
  );
  const hy = Math.max(
    bounds.minHalf[1],
    Math.min(bounds.maxHalf[1], Number.isFinite(halfSize[1]) ? halfSize[1] : bounds.halfSize[1])
  );
  const hz = Math.max(
    bounds.minHalf[2],
    Math.min(bounds.maxHalf[2], Number.isFinite(halfSize[2]) ? halfSize[2] : bounds.halfSize[2])
  );

  SECTION_CUT_BOX_PLANES[0].setFromNormalAndCoplanarPoint(
    SECTION_CUT_BOX_PLANES[0].normal.set(1, 0, 0),
    _boxScratchPt.set(cx - hx, cy, cz)
  );
  SECTION_CUT_BOX_PLANES[1].setFromNormalAndCoplanarPoint(
    SECTION_CUT_BOX_PLANES[1].normal.set(-1, 0, 0),
    _boxScratchPt.set(cx + hx, cy, cz)
  );
  SECTION_CUT_BOX_PLANES[2].setFromNormalAndCoplanarPoint(
    SECTION_CUT_BOX_PLANES[2].normal.set(0, 1, 0),
    _boxScratchPt.set(cx, cy - hy, cz)
  );
  SECTION_CUT_BOX_PLANES[3].setFromNormalAndCoplanarPoint(
    SECTION_CUT_BOX_PLANES[3].normal.set(0, -1, 0),
    _boxScratchPt.set(cx, cy + hy, cz)
  );
  SECTION_CUT_BOX_PLANES[4].setFromNormalAndCoplanarPoint(
    SECTION_CUT_BOX_PLANES[4].normal.set(0, 0, 1),
    _boxScratchPt.set(cx, cy, cz - hz)
  );
  SECTION_CUT_BOX_PLANES[5].setFromNormalAndCoplanarPoint(
    SECTION_CUT_BOX_PLANES[5].normal.set(0, 0, -1),
    _boxScratchPt.set(cx, cy, cz + hz)
  );
  return SECTION_CUT_BOX_PLANES;
}

const _boxScratchPt = new THREE.Vector3();

/** Returns the live world-space Z coordinate (cm) of `SECTION_CUT_PLANES[0]`. */
export function getLiveSectionCutZ(): number {
  return sectionPlaneZ(SECTION_CUT_PLANES[0]);
}

/** Returns live world-space coordinate (cm) along the active single axis. */
export function getLiveSectionPlaneCoord(
  plane: THREE.Plane,
  axis: 'z' | 'x' | 'y' = 'z'
): number {
  const nComp =
    axis === 'x'
      ? plane.normal.x
      : axis === 'y'
        ? plane.normal.y
        : plane.normal.z;
  return Math.abs(nComp) > 1e-6 ? -plane.constant / nComp : 0;
}

/** Formats a world-unit cm section offset into signed millimeter telemetry (e.g. `+0.0 mm`, `-12.5 mm`, `+1,240 mm`). */
export function formatSectionOffsetMm(
  offsetCm: number,
  scaleProfile?: WeaponScaleProfile | null,
  axis: SectionCutAxis = 'z'
): string {
  const mm = clampSectionCutOffset(offsetCm, scaleProfile, axis) * 10;
  if (scaleProfile === 'main_battle_tank') {
    const normalized = Math.abs(mm) < 0.5 ? 0 : Math.round(mm);
    const sign = normalized < 0 ? '-' : '+';
    return `${sign}${Math.abs(normalized).toLocaleString('en-US')} mm`;
  }
  const normalized = Math.abs(mm) < 0.05 ? 0 : mm;
  const sign = normalized < 0 ? '-' : '+';
  return `${sign}${Math.abs(normalized).toFixed(1)} mm`;
}

/** No-op raycast helper exported for unit verification. */
export const noRaycast = (): null => null;

// ------------------------------------------------------------------
// CNC engineering cross-section style
// ------------------------------------------------------------------

export type SectionCapMaterialVariant = 'standard' | 'wood_stock' | 'bakelite';

/**
 * Wood furniture parts (`polymer_frame` non-metallic substrate) that render with
 * warm cross-cut walnut / laminated beechwood organic grain caps instead of CAD steel-blue.
 */
export const WOOD_SECTION_CAP_PART_IDS: ReadonlySet<string> = new Set([
  'k98k_stock',
  'k98k_handguard',
  'garand_walnut_stock',
  'garand_rear_handguard',
  'garand_front_handguard',
  'thompson_buttstock',
  'thompson_pistol_grip',
  'thompson_foregrip',
  'win94_walnut_stock',
  'win94_forend',
  'rem870_walnut_stock',
  'rem870_forend',
  'vss_wood_stock',
  'm1911_grip_left',
  'm1911_grip_right',
  'p08_grip_left',
  'p08_grip_right',
  'python_grip_left',
  'python_grip_right',
]);

/**
 * Phenolic resin / wartime bakelite furniture parts routed to warm marbled chestnut-amber
 * organic cross-section caps instead of cold nylon-slate CAD hatching.
 */
export const BAKELITE_SECTION_CAP_PART_IDS: ReadonlySet<string> = new Set([
  'mg42_buttstock',
  'mg42_grip_frame',
]);

/**
 * Resolves whether a part should use organic walnut/beech wood or marbled bakelite
 * cross-section hatching instead of default synthetic polymer/steel CAD hatching.
 */
export function resolveSectionCapMaterialVariant(
  partId?: string | null,
  kind?: MaterialKind
): SectionCapMaterialVariant {
  if (!partId) return 'standard';
  if (kind !== undefined && kind !== 'polymer_frame') return 'standard';
  if (WOOD_SECTION_CAP_PART_IDS.has(partId)) return 'wood_stock';
  if (BAKELITE_SECTION_CAP_PART_IDS.has(partId)) return 'bakelite';
  if (/walnut|beech|birch|wood/i.test(partId)) return 'wood_stock';
  if (/bakelite/i.test(partId)) return 'bakelite';
  return 'standard';
}

export interface SectionCapStyle {
  /** Solid cross-section albedo (sRGB hex) */
  base: string;
  /** Hatch line colour (sRGB hex) */
  hatch: string;
  /** +1 => ISO +45° hatch, -1 => -45° hatch */
  hatchDir: 1 | -1;
  /** Hatch pitch in world units (1 unit = 1 cm) */
  hatchSpacing: number;
  /** Specular highlight strength */
  spec: number;
  /** 1 = longitudinal brushed-steel grain, 0 = matte polymer/wood */
  brushed: number;
  /** 0 = crisp ISO 128 CAD hatch, 1 = organic cross-cut wood grain, 0.55 = marbled bakelite */
  organicGrain: number;
  /** Resolved semantic material variant for cutaway styling & telemetry */
  variant: SectionCapMaterialVariant;
}

const GROUP_HATCH: Record<AssemblyGroupKey, { dir: 1 | -1; spacing: number }> = {
  // Mating assemblies alternate +45° vs -45° so adjacent walls stay visually distinct
  slide: { dir: 1, spacing: 0.38 },
  frame: { dir: -1, spacing: 0.38 },
  fire_control: { dir: 1, spacing: 0.22 },
  magazine: { dir: -1, spacing: 0.48 },
};

export function getSectionCapStyle(
  kind: MaterialKind,
  group: AssemblyGroupKey,
  engineeringRole?: EngineeringRole | null,
  hatchScale = 1,
  partId?: string | null
): SectionCapStyle {
  const h = GROUP_HATCH[group] ?? GROUP_HATCH.frame;
  const scaledSpacing = h.spacing * (hatchScale > 0 ? hatchScale : 1);
  const variant = resolveSectionCapMaterialVariant(partId, kind);
  let style: SectionCapStyle;
  switch (kind) {
    case 'polymer_frame':
      if (variant === 'wood_stock') {
        // Warm cross-cut oiled walnut / laminated beechwood organic wood-grain hatch
        style = {
          base: '#8b5a34',
          hatch: '#5c371c',
          hatchDir: h.dir,
          hatchSpacing: scaledSpacing * 1.18,
          spec: 0.06,
          brushed: 0,
          organicGrain: 1,
          variant: 'wood_stock',
        };
      } else if (variant === 'bakelite') {
        // Wartime marbled phenolic bakelite amber-chestnut cross-section
        style = {
          base: '#7a3f24',
          hatch: '#4a2110',
          hatchDir: h.dir,
          hatchSpacing: scaledSpacing * 1.08,
          spec: 0.14,
          brushed: 0,
          organicGrain: 0.55,
          variant: 'bakelite',
        };
      } else {
        // Dark fibreglass-reinforced nylon / synthetic rubber
        style = {
          base: '#334155',
          hatch: '#64748b',
          hatchDir: h.dir,
          hatchSpacing: scaledSpacing,
          spec: 0.08,
          brushed: 0,
          organicGrain: 0,
          variant: 'standard',
        };
      }
      break;
    case 'follower_orange':
      style = {
        base: '#f97316',
        hatch: '#9a3412',
        hatchDir: h.dir,
        hatchSpacing: scaledSpacing,
        spec: 0.12,
        brushed: 0,
        organicGrain: 0,
        variant: 'standard',
      };
      break;
    case 'copper_accent':
      // Warm phosphor-bronze / cartridge brass
      style = {
        base: '#c2853f',
        hatch: '#7c2d12',
        hatchDir: h.dir,
        hatchSpacing: scaledSpacing,
        spec: 0.42,
        brushed: 1,
        organicGrain: 0,
        variant: 'standard',
      };
      break;
    case 'nitride_steel':
    case 'barrel_steel':
    case 'stainless':
    case 'spring_steel':
    default:
      // Bright machined / brushed steel
      style = {
        base: '#94a3b8',
        hatch: '#475569',
        hatchDir: h.dir,
        hatchSpacing: scaledSpacing,
        spec: 0.36,
        brushed: 1,
        organicGrain: 0,
        variant: 'standard',
      };
      break;
  }
  if (engineeringRole) {
    const roleMeta = ENGINEERING_ROLE_META[engineeringRole];
    return {
      ...style,
      base: roleMeta.capBaseHex,
      hatch: roleMeta.capHatchHex,
      organicGrain: 0,
    };
  }
  return style;
}

const CAP_VERTEX = /* glsl */ `
varying vec3 vCapWorldPos;
varying vec2 vCapPlaneCoord;
varying vec3 vCapWorldNormal;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vCapWorldPos = wp.xyz;
  vec3 rawU = vec3( modelMatrix[0][0], modelMatrix[0][1], modelMatrix[0][2] );
  vec3 rawV = vec3( modelMatrix[1][0], modelMatrix[1][1], modelMatrix[1][2] );
  vec3 axisU = dot( rawU, rawU ) > 1e-10 ? normalize( rawU ) : vec3( 1.0, 0.0, 0.0 );
  vec3 axisV = dot( rawV, rawV ) > 1e-10 ? normalize( rawV ) : vec3( 0.0, 1.0, 0.0 );
  vCapPlaneCoord = vec2( dot( wp.xyz, axisU ), dot( wp.xyz, axisV ) );
  vCapWorldNormal = normalize( mat3( modelMatrix ) * vec3( 0.0, 0.0, 1.0 ) );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const CAP_FRAGMENT = /* glsl */ `
uniform vec3 uBaseColor;
uniform vec3 uHatchColor;
uniform float uHatchDir;
uniform float uHatchSpacing;
uniform float uSpec;
uniform float uBrushed;
uniform float uGrainScale;
uniform float uOrganicGrain;
varying vec3 vCapWorldPos;
varying vec2 vCapPlaneCoord;
varying vec3 vCapWorldNormal;

float capHash11( float p ) {
  p = fract( p * 0.1031 );
  p *= p + 33.33;
  p *= p + p;
  return fract( p );
}

void main() {
  vec2 p = vCapPlaneCoord;
  float gScale = max( uGrainScale, 0.05 );

  // ISO 128 ±45° section hatching, anti-aliased with screen-space derivatives
  float d = ( p.x * uHatchDir + p.y ) * 0.70710678 / uHatchSpacing;
  float fw = max( fwidth( d ), 1e-4 );
  float distToLine = abs( fract( d ) - 0.5 );
  float halfWidth = 0.1;
  float line = 1.0 - smoothstep( halfWidth - fw, halfWidth + fw, distToLine );
  // Fade hatching smoothly when zoomed out to prevent moire aliasing
  line *= 1.0 - smoothstep( 0.25, 0.5, fw );

  // Organic cross-cut wood & marbled bakelite grain streams (longitudinal fiber waves + fine pores)
  float wave = sin( p.x * 0.22 * gScale ) * 0.42
             + sin( p.x * 0.53 * gScale + p.y * 0.31 * gScale ) * 0.18
             + cos( p.y * 0.44 * gScale - p.x * 0.14 * gScale ) * 0.14;
  float fiberCoord = ( p.y * 1.15 + wave ) / max( uHatchSpacing * 0.95, 0.12 );
  float fwWood = max( fwidth( fiberCoord ), 1e-4 );
  float woodRing = 0.5 + 0.5 * sin( fiberCoord * 6.2831853 );
  float woodBand = smoothstep( 0.32, 0.86, woodRing );
  float fineVessels = capHash11( floor( p.x * 9.0 * gScale ) * 3.17 + floor( ( p.y + wave * 0.35 ) * 24.0 * gScale ) );
  float organicPattern = clamp( woodBand * 0.68 + fineVessels * 0.18 + line * 0.22, 0.0, 1.0 );
  organicPattern *= 1.0 - smoothstep( 0.45, 0.95, fwWood ) * 0.45;

  // Machined surface grain: brushed steel streaks along tangent U, or polymer/wood micro-texture
  float grainBrushed = 0.88 + 0.12 * capHash11( floor( p.y * 140.0 * gScale ) );
  float grainStipple = 0.94 + 0.06 * capHash11( floor( p.x * 60.0 * gScale ) * 7.13 + floor( p.y * 60.0 * gScale ) );
  float grainWood = 0.90 + 0.10 * capHash11( floor( p.x * 16.0 * gScale ) + floor( p.y * 42.0 * gScale ) * 11.3 );
  float baseMod = mix( mix( grainStipple, grainBrushed, uBrushed ), grainWood, clamp( uOrganicGrain, 0.0, 1.0 ) );
  vec3 base = uBaseColor * baseMod;

  vec3 N = normalize( vCapWorldNormal );
  vec3 rawV = cameraPosition - vCapWorldPos;
  float lenVSq = dot( rawV, rawV );
  vec3 V = lenVSq > 1e-8 ? ( rawV * inversesqrt( lenVSq ) ) : vec3( 0.0, 0.0, 1.0 );
  if ( dot( N, V ) < 0.0 ) N = -N;
  vec3 L = normalize( vec3( 0.35, 0.62, 0.70 ) );
  vec3 rawH = L + V;
  float lenHSq = dot( rawH, rawH );
  vec3 H = lenHSq > 1e-8 ? ( rawH * inversesqrt( lenHSq ) ) : N;
  float ndl = max( dot( N, L ), 0.0 );
  vec3 col = base * ( 0.6 + 0.4 * ndl );
  float hatchWeight = mix( line * 0.85, organicPattern * 0.78, clamp( uOrganicGrain, 0.0, 1.0 ) );
  col = mix( col, uHatchColor, hatchWeight );

  // Anisotropic brushed specular streak + soft isotropic lobe
  float nh = max( dot( N, H ), 1e-5 );
  float aniso = pow( max( 1.0 - abs( H.y ), 1e-5 ), 18.0 ) * uBrushed;
  float spec = ( pow( nh, 48.0 ) + 0.35 * aniso ) * uSpec;
  col = clamp( col + vec3( spec ), vec3( 0.0 ), vec3( 16.0 ) );

  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const capMaterialCache = new Map<string, THREE.ShaderMaterial>();

/** Builds the CNC cross-section cap material (cached per material kind × variant × assembly group × role × scale). */
export function getSectionCapMaterial(
  kind: MaterialKind,
  group: AssemblyGroupKey,
  engineeringRole?: EngineeringRole | null,
  hatchScale = 1,
  partId?: string | null
): THREE.ShaderMaterial {
  const safeScale = hatchScale > 0 ? hatchScale : 1;
  const variant = resolveSectionCapMaterialVariant(partId, kind);
  const variantSuffix = variant === 'standard' ? '' : `|${variant}`;
  const key =
    safeScale === 1
      ? `${kind}${variantSuffix}|${group}|${engineeringRole ?? 'none'}`
      : `${kind}${variantSuffix}|${group}|${engineeringRole ?? 'none'}|x${safeScale}`;
  const cached = capMaterialCache.get(key);
  if (cached) return cached;
  const style = getSectionCapStyle(
    kind,
    group,
    engineeringRole,
    safeScale,
    partId
  );
  const mat = new THREE.ShaderMaterial({
    name: `SectionCap:${key}`,
    uniforms: {
      uBaseColor: { value: new THREE.Color(style.base) },
      uHatchColor: { value: new THREE.Color(style.hatch) },
      uHatchDir: { value: style.hatchDir },
      uHatchSpacing: { value: style.hatchSpacing },
      uSpec: { value: style.spec },
      uBrushed: { value: style.brushed },
      uGrainScale: { value: 1 / safeScale },
      uOrganicGrain: { value: style.organicGrain },
    },
    vertexShader: CAP_VERTEX,
    fragmentShader: CAP_FRAGMENT,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ZeroStencilOp,
    stencilZFail: THREE.ZeroStencilOp,
    stencilZPass: THREE.ZeroStencilOp,
  });
  capMaterialCache.set(key, mat);
  return mat;
}

function createStencilPassMaterial(
  side: THREE.Side,
  op: THREE.StencilOp,
  planes: THREE.Plane[]
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    name: side === THREE.BackSide ? 'SectionStencilBack' : 'SectionStencilFront',
    side,
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    clippingPlanes: planes,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: op,
    stencilZFail: op,
    stencilZPass: op,
  });
}

const passMaterialCache = new Map<
  THREE.Plane[],
  { back: THREE.MeshBasicMaterial; front: THREE.MeshBasicMaterial }
>();

/** Shared Pass A / Pass B materials for a given clipping-plane set. */
export function getSectionStencilPassMaterials(planes: THREE.Plane[]): {
  back: THREE.MeshBasicMaterial;
  front: THREE.MeshBasicMaterial;
} {
  let rec = passMaterialCache.get(planes);
  if (!rec) {
    rec = {
      back: createStencilPassMaterial(
        THREE.BackSide,
        THREE.IncrementWrapStencilOp,
        planes
      ),
      front: createStencilPassMaterial(
        THREE.FrontSide,
        THREE.DecrementWrapStencilOp,
        planes
      ),
    };
    passMaterialCache.set(planes, rec);
  }
  return rec;
}

/** Disposes cached Pass A/B stencil materials for an unmounted per-part tilted clip-plane array. */
export function disposeSectionStencilPassMaterials(
  planes: THREE.Plane[]
): void {
  if (planes === SECTION_CUT_PLANES) return;
  const rec = passMaterialCache.get(planes);
  if (!rec) return;
  rec.back.dispose();
  rec.front.dispose();
  passMaterialCache.delete(planes);
}

// ------------------------------------------------------------------
// Per-part render-order slots (Pass A, B, C must stay contiguous per part)
// ------------------------------------------------------------------

const slotTaken: boolean[] = [];

export function acquireSectionCapSlot(): number {
  let i = 0;
  while (slotTaken[i]) i++;
  slotTaken[i] = true;
  return i;
}

export function releaseSectionCapSlot(slot: number): void {
  if (slot >= 0) slotTaken[slot] = false;
}

export function sectionCapRenderOrders(slot: number): {
  back: number;
  front: number;
  cap: number;
} {
  const base = SECTION_CAP_RENDER_ORDER_BASE + slot * 3;
  return { back: base, front: base + 1, cap: base + 2 };
}

// ------------------------------------------------------------------
// Cap rectangle math (zero allocation)
// ------------------------------------------------------------------

export interface SectionCapRect {
  visible: boolean;
  cx: number;
  cy: number;
  width: number;
  height: number;
  z: number;
}

const _corner = new THREE.Vector3();
const _cantedNormal = new THREE.Vector3();
const _cantedOrigin = new THREE.Vector3();
const _capAxisN = new THREE.Vector3();
const _capAxisU = new THREE.Vector3();
const _capAxisV = new THREE.Vector3();
const _capScaledU = new THREE.Vector3();
const _capScaledV = new THREE.Vector3();
const _capCenter = new THREE.Vector3();
const _capRectScratch: SectionCapRect = {
  visible: true,
  cx: 0,
  cy: 0,
  width: 1,
  height: 1,
  z: 0,
};

/** World z of a clipping plane whose normal lies on ±Z (n·p + c = 0). */
export function sectionPlaneZ(plane: THREE.Plane): number {
  const nz = plane.normal.z;
  return Math.abs(nz) > 1e-6 ? -plane.constant / nz : 0;
}

/**
 * Per-part local-Z section plane base offset (cm) for left-flank side-hung drum/magazine
 * shells whose entire assembled bounding box sits behind the global Z = 0 centerline plane
 * (e.g. MG 42 Gurttrommel 34 drum at Z = -6.4 cm cradling the 8-round Gurt 34 belt at Z ∈ [-6.89, -0.20]).
 */
export const SIDE_MOUNTED_SHELL_LOCAL_Z_OFFSETS: Readonly<
  Record<string, number>
> = {
  mg42_ammo_drum: -0.8,
};

export function getSideMountedShellLocalZOffset(partId: string): number | null {
  const offset = SIDE_MOUNTED_SHELL_LOCAL_Z_OFFSETS[partId];
  return typeof offset === 'number' ? offset : null;
}

/**
 * Stamped sheet-metal hollow drum shells modeled as closed outer hulls: clipping them
 * cleanly with `DoubleSide` without a solid stencil fill exposes the realistic concave
 * hollow interior cavity rather than painting a solid metal ingot across the drum face.
 */
export const THIN_WALL_CUTAWAY_SHELL_PART_IDS: ReadonlySet<string> = new Set([
  'mg42_ammo_drum',
]);

export function isThinWallCutawayShell(partId: string): boolean {
  return THIN_WALL_CUTAWAY_SHELL_PART_IDS.has(partId);
}

/**
 * Synchronizes a per-part local-Z clipping plane shifted by `localZBaseOffset`
 * plus the live global `sectionCutOffset` & `flip` so both canted shells (e.g. AN-94
 * 15° magazine) and left-flank side-hung drums (e.g. MG 42 Gurttrommel 34) slice
 * cleanly right across their internal mechanism / belted ammunition!
 */
export function syncLocalZOffsetSectionPlane(
  partMatrixWorld: THREE.Matrix4,
  referencePlane: THREE.Plane,
  localZBaseOffset: number,
  outPlane: THREE.Plane
): THREE.Plane {
  const flip = referencePlane.normal.z > 0;
  const offset = localZBaseOffset + sectionPlaneZ(referencePlane);
  _cantedNormal
    .set(0, 0, flip ? 1 : -1)
    .transformDirection(partMatrixWorld)
    .normalize();
  _cantedOrigin.set(0, 0, offset).applyMatrix4(partMatrixWorld);
  return outPlane.setFromNormalAndCoplanarPoint(_cantedNormal, _cantedOrigin);
}

/**
 * Synchronizes a per-part local-Z clipping plane for canted shell parts
 * (e.g. `an94_mag_body` canted 15° around X) so the section slice follows the
 * part's own curved symmetry centerplane plus live `sectionCutOffset` & `flip`!
 */
export function syncCantedLocalZSectionPlane(
  partMatrixWorld: THREE.Matrix4,
  referencePlane: THREE.Plane,
  outPlane: THREE.Plane
): THREE.Plane {
  return syncLocalZOffsetSectionPlane(partMatrixWorld, referencePlane, 0, outPlane);
}

/**
 * Projects a part's local AABB through `matrixWorld` onto ANY oriented clipping plane
 * (both global ±Z planes and tilted canted-shell planes) and writes the exact world
 * transform for Pass C's unit quad into `outMatrix`. Returns `true` if straddling.
 */
export function computeSectionCapTransformInto(
  localBox: THREE.Box3,
  matrixWorld: THREE.Matrix4,
  plane: THREE.Plane | undefined,
  margin: number,
  outMatrix: THREE.Matrix4
): boolean {
  if (
    !plane ||
    (Math.abs(plane.normal.x) < 1e-5 && Math.abs(plane.normal.y) < 1e-5)
  ) {
    const planeZ = plane ? sectionPlaneZ(plane) : 0;
    computeSectionCapRectInto(
      localBox,
      matrixWorld,
      planeZ,
      margin,
      _capRectScratch
    );
    if (!_capRectScratch.visible) return false;
    outMatrix
      .makeScale(_capRectScratch.width, _capRectScratch.height, 1)
      .setPosition(_capRectScratch.cx, _capRectScratch.cy, _capRectScratch.z);
    return true;
  }

  if (localBox.isEmpty()) return false;

  const n = _capAxisN.copy(plane.normal).normalize();
  if (Math.abs(n.x) < 0.9) {
    _capAxisU.set(1 - n.x * n.x, -n.x * n.y, -n.x * n.z).normalize();
  } else {
    _capAxisU.set(0, 1, 0).cross(n).normalize();
  }
  _capAxisV.crossVectors(n, _capAxisU).normalize();

  let minD = Infinity;
  let maxD = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (let i = 0; i < 8; i++) {
    _corner
      .set(
        i & 1 ? localBox.max.x : localBox.min.x,
        i & 2 ? localBox.max.y : localBox.min.y,
        i & 4 ? localBox.max.z : localBox.min.z
      )
      .applyMatrix4(matrixWorld);
    const d = plane.distanceToPoint(_corner);
    const pu = _corner.dot(_capAxisU);
    const pv = _corner.dot(_capAxisV);
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
    if (pu < minU) minU = pu;
    if (pu > maxU) maxU = pu;
    if (pv < minV) minV = pv;
    if (pv > maxV) maxV = pv;
  }

  if (!(minD < 0 && maxD > 0)) return false;

  const width = Math.max(1e-3, maxU - minU + margin * 2);
  const height = Math.max(1e-3, maxV - minV + margin * 2);
  const cu = (minU + maxU) * 0.5;
  const cv = (minV + maxV) * 0.5;
  const cn = -plane.constant;

  _capCenter
    .set(0, 0, 0)
    .addScaledVector(_capAxisU, cu)
    .addScaledVector(_capAxisV, cv)
    .addScaledVector(n, cn);
  _capScaledU.copy(_capAxisU).multiplyScalar(width);
  _capScaledV.copy(_capAxisV).multiplyScalar(height);

  outMatrix.makeBasis(_capScaledU, _capScaledV, n).setPosition(_capCenter);
  return true;
}

/**
 * Projects a part's local AABB through `matrixWorld` and returns the world-space XY
 * rectangle the cap must cover on the plane z = `planeZ` (hidden if not straddling).
 */
export function computeSectionCapRectInto(
  localBox: THREE.Box3,
  matrixWorld: THREE.Matrix4,
  planeZ: number,
  margin: number,
  out: SectionCapRect
): SectionCapRect {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < 8; i++) {
    _corner
      .set(
        i & 1 ? localBox.max.x : localBox.min.x,
        i & 2 ? localBox.max.y : localBox.min.y,
        i & 4 ? localBox.max.z : localBox.min.z
      )
      .applyMatrix4(matrixWorld);
    if (_corner.x < minX) minX = _corner.x;
    if (_corner.y < minY) minY = _corner.y;
    if (_corner.z < minZ) minZ = _corner.z;
    if (_corner.x > maxX) maxX = _corner.x;
    if (_corner.y > maxY) maxY = _corner.y;
    if (_corner.z > maxZ) maxZ = _corner.z;
  }
  out.visible = localBox.isEmpty() ? false : minZ < planeZ && maxZ > planeZ;
  out.cx = (minX + maxX) * 0.5;
  out.cy = (minY + maxY) * 0.5;
  out.width = Math.max(1e-3, maxX - minX + margin * 2);
  out.height = Math.max(1e-3, maxY - minY + margin * 2);
  out.z = planeZ;
  return out;
}

// ------------------------------------------------------------------
// Stencil availability (degrade to legacy hollow cut when missing)
// ------------------------------------------------------------------

const contextStencilCache = new WeakMap<
  WebGL2RenderingContext | WebGLRenderingContext,
  boolean
>();

export function rendererHasStencil(renderer: THREE.WebGLRenderer): boolean {
  const rt = renderer.getRenderTarget();
  if (rt) return rt.stencilBuffer;
  const ctx = renderer.getContext();
  let has = contextStencilCache.get(ctx);
  if (has === undefined) {
    has = !!ctx.getContextAttributes()?.stencil;
    contextStencilCache.set(ctx, has);
  }
  return has;
}

// ------------------------------------------------------------------
// React component
// ------------------------------------------------------------------

export type SectionCapSyncFn = (partGroup: THREE.Object3D) => void;

export interface StencilSectionCapProps {
  geometry: THREE.BufferGeometry;
  material: MaterialKind;
  group: AssemblyGroupKey;
  partId?: string;
  clippingPlanes: THREE.Plane[];
  engineeringRole?: EngineeringRole | null;
  scaleProfile?: WeaponScaleProfile;
  /**
   * Optional zero-GC visibility/bounds sync hook called by PartActor in `useFrame`.
   */
  syncRef: React.MutableRefObject<SectionCapSyncFn | null>;
}

const _partInv = new THREE.Matrix4();
const _capWorld = new THREE.Matrix4();

/**
 * Mounted INSIDE the part's `<group ref={groupRef}>` so Pass A/B meshes automatically
 * inherit the exact local + parent recoil world transform, while Pass C locks onto
 * the live world section plane `z = sectionPlaneZ(clippingPlanes[0])` right before WebGL draw.
 */
export const StencilSectionCap: React.FC<StencilSectionCapProps> = ({
  geometry,
  material,
  group,
  partId,
  clippingPlanes,
  engineeringRole = null,
  scaleProfile,
  syncRef,
}) => {
  const backRef = useRef<THREE.Mesh>(null);
  const frontRef = useRef<THREE.Mesh>(null);
  const capRef = useRef<THREE.Mesh>(null);

  const range = getSectionCutRange(scaleProfile);
  const passMats = getSectionStencilPassMaterials(clippingPlanes);
  const capMat = getSectionCapMaterial(
    material,
    group,
    engineeringRole,
    range.hatchScale,
    partId
  );

  useEffect(() => {
    const slot = acquireSectionCapSlot();
    const orders = sectionCapRenderOrders(slot);
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const localBox = geometry.boundingBox ?? new THREE.Box3();
    const activePlane = clippingPlanes[0];
    const capMargin = range.capMargin;

    const back = backRef.current;
    const front = frontRef.current;
    const cap = capRef.current;
    if (back) back.renderOrder = orders.back;
    if (front) front.renderOrder = orders.front;
    if (cap) {
      cap.renderOrder = orders.cap;
      cap.onBeforeRender = ((renderer: THREE.WebGLRenderer) => {
        const mat = cap.material as THREE.ShaderMaterial;
        const refObj = back ?? cap;
        const visible = computeSectionCapTransformInto(
          localBox,
          refObj.matrixWorld,
          activePlane,
          capMargin,
          _capWorld
        );
        const ok = visible && rendererHasStencil(renderer);
        mat.colorWrite = ok;
        mat.depthWrite = ok;
        if (visible) {
          cap.matrixWorld.copy(_capWorld);
        }
      }) as THREE.Object3D['onBeforeRender'];
    }

    syncRef.current = (partGroup) => {
      if (!back || !front || !cap) return;
      const visible = computeSectionCapTransformInto(
        localBox,
        partGroup.matrixWorld,
        activePlane,
        capMargin,
        _capWorld
      );
      back.visible = visible;
      front.visible = visible;
      cap.visible = visible;
      if (!visible) return;
      _partInv.copy(partGroup.matrixWorld).invert();
      cap.matrix.multiplyMatrices(_partInv, _capWorld);
      cap.matrixWorldNeedsUpdate = true;
    };

    return () => {
      syncRef.current = null;
      releaseSectionCapSlot(slot);
    };
  }, [geometry, clippingPlanes, syncRef, range.capMargin]);

  return (
    <>
      <mesh
        ref={backRef}
        geometry={geometry}
        material={passMats.back}
        frustumCulled={false}
        castShadow={false}
        receiveShadow={false}
        raycast={() => null}
      />
      <mesh
        ref={frontRef}
        geometry={geometry}
        material={passMats.front}
        frustumCulled={false}
        castShadow={false}
        receiveShadow={false}
        raycast={() => null}
      />
      <mesh
        ref={capRef}
        material={capMat}
        matrixAutoUpdate={false}
        frustumCulled={false}
        castShadow={false}
        receiveShadow={false}
        raycast={() => null}
      >
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
};

StencilSectionCap.displayName = 'StencilSectionCap';
