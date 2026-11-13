import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { AssemblyGroupKey, MaterialKind } from '../../weapons/types';

/**
 * Two-Pass WebGL Stencil Solid Cross-Section Capping
 * ------------------------------------------------------------------
 * For every section-cut part (interleaved per part via unique renderOrder slots):
 *   Pass A  back faces  (clipped) -> stencil IncrementWrap
 *   Pass B  front faces (clipped) -> stencil DecrementWrap
 *   Pass C  cap plane at z = 0.06 -> drawn where stencil != 0, then stencil -> 0
 *
 * Pass C clears the stencil back to 0 on fail / zfail / zpass, preventing any
 * cross-part bleed across multiple sliced shells. Every helper & cap mesh uses
 * `raycast={() => null}` so `sectionAwareMeshRaycast` internal picking stays 100% unobstructed.
 */

export const SECTION_CAP_RENDER_ORDER_BASE = 1000;

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
  group: AssemblyGroupKey
): SectionCapStyle {
  const h = GROUP_HATCH[group] ?? GROUP_HATCH.frame;
  switch (kind) {
    case 'polymer_frame':
      // Dark fibreglass-reinforced nylon
      return {
        base: '#334155',
        hatch: '#64748b',
        hatchDir: h.dir,
        hatchSpacing: h.spacing,
        spec: 0.08,
        brushed: 0,
      };
    case 'follower_orange':
      return {
        base: '#f97316',
        hatch: '#9a3412',
        hatchDir: h.dir,
        hatchSpacing: h.spacing,
        spec: 0.12,
        brushed: 0,
      };
    case 'copper_accent':
      // Warm phosphor-bronze / cartridge brass
      return {
        base: '#c2853f',
        hatch: '#7c2d12',
        hatchDir: h.dir,
        hatchSpacing: h.spacing,
        spec: 0.42,
        brushed: 1,
      };
    case 'nitride_steel':
    case 'barrel_steel':
    case 'stainless':
    case 'spring_steel':
    default:
      // Bright machined / brushed steel
      return {
        base: '#94a3b8',
        hatch: '#475569',
        hatchDir: h.dir,
        hatchSpacing: h.spacing,
        spec: 0.36,
        brushed: 1,
      };
  }
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
  float grainBrushed = 0.88 + 0.12 * capHash11( floor( vCapWorldPos.y * 140.0 ) );
  float grainStipple = 0.94 + 0.06 * capHash11( floor( vCapWorldPos.x * 60.0 ) * 7.13 + floor( vCapWorldPos.y * 60.0 ) );
  vec3 base = uBaseColor * mix( grainStipple, grainBrushed, uBrushed );

  vec3 N = vec3( 0.0, 0.0, 1.0 );
  vec3 V = normalize( cameraPosition - vCapWorldPos );
  if ( dot( N, V ) < 0.0 ) N = -N;
  vec3 L = normalize( vec3( 0.35, 0.62, 0.70 ) );
  vec3 H = normalize( L + V );
  float ndl = max( dot( N, L ), 0.0 );
  vec3 col = base * ( 0.6 + 0.4 * ndl );
  col = mix( col, uHatchColor, line * 0.85 );

  // Anisotropic brushed specular streak (stretched along X) + soft isotropic lobe
  float nh = max( dot( N, H ), 0.0 );
  float aniso = pow( max( 1.0 - abs( H.y ), 0.0 ), 18.0 ) * uBrushed;
  float spec = ( pow( nh, 48.0 ) + 0.35 * aniso ) * uSpec;
  col += vec3( spec );

  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const capMaterialCache = new Map<string, THREE.ShaderMaterial>();

/** Builds the CNC cross-section cap material (cached per material kind × assembly group). */
export function getSectionCapMaterial(
  kind: MaterialKind,
  group: AssemblyGroupKey
): THREE.ShaderMaterial {
  const key = `${kind}|${group}`;
  const cached = capMaterialCache.get(key);
  if (cached) return cached;
  const style = getSectionCapStyle(kind, group);
  const mat = new THREE.ShaderMaterial({
    name: `SectionCap:${key}`,
    uniforms: {
      uBaseColor: { value: new THREE.Color(style.base) },
      uHatchColor: { value: new THREE.Color(style.hatch) },
      uHatchDir: { value: style.hatchDir },
      uHatchSpacing: { value: style.hatchSpacing },
      uSpec: { value: style.spec },
      uBrushed: { value: style.brushed },
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

/** World z of a clipping plane whose normal lies on ±Z (n·p + c = 0). */
export function sectionPlaneZ(plane: THREE.Plane): number {
  const nz = plane.normal.z;
  return Math.abs(nz) > 1e-6 ? -plane.constant / nz : 0;
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
 * the world section plane `z = 0.06` right before WebGL draw.
 */
export const StencilSectionCap: React.FC<StencilSectionCapProps> = ({
  geometry,
  material,
  group,
  clippingPlanes,
  syncRef,
}) => {
  const backRef = useRef<THREE.Mesh>(null);
  const frontRef = useRef<THREE.Mesh>(null);
  const capRef = useRef<THREE.Mesh>(null);

  const passMats = getSectionStencilPassMaterials(clippingPlanes);
  const capMat = getSectionCapMaterial(material, group);

  useEffect(() => {
    const slot = acquireSectionCapSlot();
    const orders = sectionCapRenderOrders(slot);
    const rect: SectionCapRect = {
      visible: true,
      cx: 0,
      cy: 0,
      width: 1,
      height: 1,
      z: 0,
    };
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const localBox = geometry.boundingBox ?? new THREE.Box3();
    const planeZ = sectionPlaneZ(clippingPlanes[0]);

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
        computeSectionCapRectInto(
          localBox,
          refObj.matrixWorld,
          planeZ,
          0.16,
          rect
        );
        const ok = rect.visible && rendererHasStencil(renderer);
        mat.colorWrite = ok;
        mat.depthWrite = ok;
        if (rect.visible) {
          cap.matrixWorld
            .makeScale(rect.width, rect.height, 1)
            .setPosition(rect.cx, rect.cy, rect.z);
        }
      }) as THREE.Object3D['onBeforeRender'];
    }

    syncRef.current = (partGroup) => {
      if (!back || !front || !cap) return;
      computeSectionCapRectInto(
        localBox,
        partGroup.matrixWorld,
        planeZ,
        0.16,
        rect
      );
      back.visible = rect.visible;
      front.visible = rect.visible;
      cap.visible = rect.visible;
      if (!rect.visible) return;
      _capWorld
        .makeScale(rect.width, rect.height, 1)
        .setPosition(rect.cx, rect.cy, rect.z);
      _partInv.copy(partGroup.matrixWorld).invert();
      cap.matrix.multiplyMatrices(_partInv, _capWorld);
      cap.matrixWorldNeedsUpdate = true;
    };

    return () => {
      syncRef.current = null;
      releaseSectionCapSlot(slot);
    };
  }, [geometry, clippingPlanes, syncRef]);

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
