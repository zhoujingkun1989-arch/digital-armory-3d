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

/** Live CT-Scan section cutaway plane range in world units (1 unit = 1 cm = 10 mm). */
export const SECTION_CUT_OFFSET_MIN = -2.5;
export const SECTION_CUT_OFFSET_MAX = 2.5;
export const SECTION_CUT_OFFSET_STEP = 0.05;
export const SECTION_CUT_OFFSET_DEFAULT = 0;

/** Heavy Armor 1:1 Main Battle Tank CT-Scan section plane range (`±180 cm` = `±1,800 mm`). */
export const TANK_SECTION_CUT_OFFSET_MIN = -180;
export const TANK_SECTION_CUT_OFFSET_MAX = 180;
export const TANK_SECTION_CUT_OFFSET_STEP = 2.0;
export const TANK_SECTION_HATCH_SCALE = 8;

export interface SectionCutRangeSpec {
  min: number;
  max: number;
  step: number;
  sweepAmplitude: number;
  hatchScale: number;
  capMargin: number;
}

const SMALL_ARMS_SECTION_RANGE: SectionCutRangeSpec = {
  min: SECTION_CUT_OFFSET_MIN,
  max: SECTION_CUT_OFFSET_MAX,
  step: SECTION_CUT_OFFSET_STEP,
  sweepAmplitude: 2.15,
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

/** Returns adaptive CT-Scan section range & ISO 128 hatch scaling for small arms vs 1:1 tanks. */
export function getSectionCutRange(
  scaleProfile?: WeaponScaleProfile | null
): SectionCutRangeSpec {
  return scaleProfile === 'main_battle_tank'
    ? TANK_SECTION_RANGE
    : SMALL_ARMS_SECTION_RANGE;
}

/**
 * Module-pooled live longitudinal section-cut plane (zero per-frame allocations).
 * Mutating `SECTION_CUT_PLANES[0]` updates Three.js material clipping uniforms,
 * shadow clipping, `StencilSectionCap` Pass A/B/C, and `sectionAwareMeshRaycast`
 * simultaneously at 60 FPS with zero shader recompilation or React remounts.
 */
export const SECTION_CUT_PLANES: THREE.Plane[] = [
  new THREE.Plane(new THREE.Vector3(0, 0, -1), SECTION_CUT_OFFSET_DEFAULT),
];

/** Clamps a section-cut Z offset cleanly into `[-2.5, +2.5]` cm (or `[-180, +180]` cm for 1:1 MBTs). */
export function clampSectionCutOffset(
  offset: number,
  scaleProfile?: WeaponScaleProfile | null
): number {
  if (!Number.isFinite(offset)) return SECTION_CUT_OFFSET_DEFAULT;
  const range = getSectionCutRange(scaleProfile);
  const clamped = Math.max(range.min, Math.min(range.max, offset));
  const rounded = Math.round(clamped * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Synchronizes the shared live clipping plane in place.
 * - Default (`flip = false`): normal `(0, 0, -1)`, `constant = offset` -> keeps `z <= offset` (+Z right flank open).
 * - Flipped (`flip = true`):  normal `(0, 0, +1)`, `constant = -offset` -> keeps `z >= offset` (-Z left flank open).
 * In both orientations, `sectionPlaneZ(SECTION_CUT_PLANES[0]) === offset`.
 */
export function syncLiveSectionCutPlane(
  offset: number,
  flip = false,
  scaleProfile?: WeaponScaleProfile | null
): THREE.Plane {
  const clamped = clampSectionCutOffset(offset, scaleProfile);
  const plane = SECTION_CUT_PLANES[0];
  if (flip) {
    plane.normal.set(0, 0, 1);
    plane.constant = clamped === 0 ? 0 : -clamped;
  } else {
    plane.normal.set(0, 0, -1);
    plane.constant = clamped;
  }
  return plane;
}

/** Returns the live world-space Z coordinate (cm) of `SECTION_CUT_PLANES[0]`. */
export function getLiveSectionCutZ(): number {
  return sectionPlaneZ(SECTION_CUT_PLANES[0]);
}

/** Formats a world-unit cm section offset into signed millimeter telemetry (e.g. `+0.0 mm`, `-12.5 mm`, `+1,240 mm`). */
export function formatSectionOffsetMm(
  offsetCm: number,
  scaleProfile?: WeaponScaleProfile | null
): string {
  const mm = clampSectionCutOffset(offsetCm, scaleProfile) * 10;
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
  /** 1 = longitudinal brushed-steel grain, 0 = matte polymer stipple */
  brushed: number;
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
  hatchScale = 1
): SectionCapStyle {
  const h = GROUP_HATCH[group] ?? GROUP_HATCH.frame;
  const scaledSpacing = h.spacing * (hatchScale > 0 ? hatchScale : 1);
  let style: SectionCapStyle;
  switch (kind) {
    case 'polymer_frame':
      // Dark fibreglass-reinforced nylon
      style = {
        base: '#334155',
        hatch: '#64748b',
        hatchDir: h.dir,
        hatchSpacing: scaledSpacing,
        spec: 0.08,
        brushed: 0,
      };
      break;
    case 'follower_orange':
      style = {
        base: '#f97316',
        hatch: '#9a3412',
        hatchDir: h.dir,
        hatchSpacing: scaledSpacing,
        spec: 0.12,
        brushed: 0,
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
      };
      break;
  }
  if (engineeringRole) {
    const roleMeta = ENGINEERING_ROLE_META[engineeringRole];
    return {
      ...style,
      base: roleMeta.capBaseHex,
      hatch: roleMeta.capHatchHex,
    };
  }
  return style;
}

const CAP_VERTEX = /* glsl */ `
varying vec3 vCapWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vCapWorldPos = wp.xyz;
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
varying vec3 vCapWorldPos;

float capHash11( float p ) {
  p = fract( p * 0.1031 );
  p *= p + 33.33;
  p *= p + p;
  return fract( p );
}

void main() {
  vec2 p = vCapWorldPos.xy;

  // ISO 128 ±45° section hatching, anti-aliased with screen-space derivatives
  float d = ( p.x * uHatchDir + p.y ) * 0.70710678 / uHatchSpacing;
  float fw = max( fwidth( d ), 1e-4 );
  float distToLine = abs( fract( d ) - 0.5 );
  float halfWidth = 0.1;
  float line = 1.0 - smoothstep( halfWidth - fw, halfWidth + fw, distToLine );
  // Fade hatching smoothly when zoomed out to prevent moire aliasing
  line *= 1.0 - smoothstep( 0.25, 0.5, fw );

  // Machined surface grain: brushed steel streaks along +X, or polymer stipple
  float gScale = max( uGrainScale, 0.05 );
  float grainBrushed = 0.88 + 0.12 * capHash11( floor( vCapWorldPos.y * 140.0 * gScale ) );
  float grainStipple = 0.94 + 0.06 * capHash11( floor( vCapWorldPos.x * 60.0 * gScale ) * 7.13 + floor( vCapWorldPos.y * 60.0 * gScale ) );
  vec3 base = uBaseColor * mix( grainStipple, grainBrushed, uBrushed );

  vec3 N = vec3( 0.0, 0.0, 1.0 );
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
  col = mix( col, uHatchColor, line * 0.85 );

  // Anisotropic brushed specular streak (stretched along X) + soft isotropic lobe
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

/** Builds the CNC cross-section cap material (cached per material kind × assembly group × role × scale). */
export function getSectionCapMaterial(
  kind: MaterialKind,
  group: AssemblyGroupKey,
  engineeringRole?: EngineeringRole | null,
  hatchScale = 1
): THREE.ShaderMaterial {
  const safeScale = hatchScale > 0 ? hatchScale : 1;
  const key =
    safeScale === 1
      ? `${kind}|${group}|${engineeringRole ?? 'none'}`
      : `${kind}|${group}|${engineeringRole ?? 'none'}|x${safeScale}`;
  const cached = capMaterialCache.get(key);
  if (cached) return cached;
  const style = getSectionCapStyle(kind, group, engineeringRole, safeScale);
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
 * Synchronizes a per-part local-Z clipping plane for canted shell parts
 * (e.g. `an94_mag_body` canted 15° around X) so the section slice follows the
 * part's own curved symmetry centerplane plus live `sectionCutOffset` & `flip`!
 */
export function syncCantedLocalZSectionPlane(
  partMatrixWorld: THREE.Matrix4,
  referencePlane: THREE.Plane,
  outPlane: THREE.Plane
): THREE.Plane {
  const flip = referencePlane.normal.z > 0;
  const offset = sectionPlaneZ(referencePlane);
  _cantedNormal
    .set(0, 0, flip ? 1 : -1)
    .transformDirection(partMatrixWorld)
    .normalize();
  _cantedOrigin.set(0, 0, offset).applyMatrix4(partMatrixWorld);
  return outPlane.setFromNormalAndCoplanarPoint(_cantedNormal, _cantedOrigin);
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
    range.hatchScale
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
