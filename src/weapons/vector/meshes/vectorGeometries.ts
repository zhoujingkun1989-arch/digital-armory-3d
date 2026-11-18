import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  CURVATURE_ATTRIBUTE,
  SPRING_PARAM_ATTRIBUTE,
  attachCurvatureAttribute,
} from '../../../engine/geometry/curvatureBuilder';
import {
  SPRING_AXIS_MODE_X,
  createBeveledCylinder,
  createChamferedBox,
  createHelicalSpring,
  csgSubtract,
  mergeParts,
  paintGeometry,
  type HelicalSpringOptions,
} from '../../../engine/geometry/csgBuilder';

// Authentic KRISS Vector SMG Gen II (.45 ACP) Combat FDE, Matte Charcoal & Tungsten-Steel Palette
// (All vertex colors strictly calibrated well above Khronos 0.018 linear luminance floor)
export const VECTOR_FDE_POLYMER = '#8f7858';
export const VECTOR_FDE_RIB = '#7c674a';
export const VECTOR_CHARCOAL_POLY = '#444952';
export const VECTOR_RAIL_ANODIZED = '#4b525d';
export const VECTOR_RUBBER_PAD = '#3d424b';
export const VECTOR_TUNGSTEN_SLIDER = '#8a9099';
export const VECTOR_CAM_POLISHED = '#cfd6e0';
export const VECTOR_NITRIDE_STEEL = '#58606d';
export const VECTOR_BARREL_STEEL = '#4e5663';
export const VECTOR_INNER_DARK = '#343a44';
export const VECTOR_STAINLESS = '#cbd5e1';
export const VECTOR_SPRING_STEEL = '#94a3b8';
export const VECTOR_BRASS_ACCENT = '#d4a647';
export const VECTOR_FOLLOWER_ORANGE = '#ea580c';
export const VECTOR_SAFETY_RED = '#dc2626';
export const VECTOR_SIGHT_WHITE = '#f1f5f9';

/** Patented KRISS Super V off-axis counterweight chute angle (+65° upward/forward, -65° plunge). */
export const SUPER_V_CHUTE_ANGLE = (65 * Math.PI) / 180;

/** Glock-21 .45 ACP / Kriss MagEx2 forward magazine rake (+66° from +X, 24° forward from vertical). */
export const VECTOR_MAG_ANGLE = (66 * Math.PI) / 180;

/** Low-bore .45 ACP barrel axis Y (-0.95 cm), positioned 15.3 mm BELOW horizontal trigger axis (+0.58 cm)! */
export const VECTOR_BORE_Y = -0.95;
export const VECTOR_TRIGGER_Y = 0.58;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

function computeSignedVolumeRaw(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number {
  let vol = 0;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const ax = pos.getX(i);
    const ay = pos.getY(i);
    const az = pos.getZ(i);
    const bx = pos.getX(i + 1);
    const by = pos.getY(i + 1);
    const bz = pos.getZ(i + 1);
    const cx = pos.getX(i + 2);
    const cy = pos.getY(i + 2);
    const cz = pos.getZ(i + 2);
    vol +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) /
      6;
  }
  return vol;
}

/**
 * Strips any zero-area CSG sliver triangles, enforces positive signed volume (`signedVolume > 0`),
 * preserves `aCurvature` & `aSpringParam`, guarantees unit-length normals (`|n| = 1`),
 * and normalizes UVs strictly into `[0, 1]`.
 */
export function sanitizeVectorMesh(
  geo: THREE.BufferGeometry,
  preserveCustomUvs = false
): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  if (!src.getAttribute(CURVATURE_ATTRIBUTE)) {
    attachCurvatureAttribute(src);
  }
  const pos = src.getAttribute('position');
  const norm = src.getAttribute('normal');
  const uv = src.getAttribute('uv');
  const col = src.getAttribute('color');
  const curv = src.getAttribute(CURVATURE_ATTRIBUTE);
  const sp = src.getAttribute(SPRING_PARAM_ATTRIBUTE);
  const vCount = pos.count;

  const validTris: number[] = [];
  for (let i = 0; i + 2 < vCount; i += 3) {
    _vA.fromBufferAttribute(pos, i);
    _vB.fromBufferAttribute(pos, i + 1);
    _vC.fromBufferAttribute(pos, i + 2);
    _e1.subVectors(_vB, _vA);
    _e2.subVectors(_vC, _vA);
    _fn.crossVectors(_e1, _e2);
    if (_fn.lengthSq() > 1e-16) {
      validTris.push(i);
    }
  }

  let out = src;
  if (validTris.length * 3 !== vCount) {
    const nV = validTris.length * 3;
    const pArr = new Float32Array(nV * 3);
    const nArr = new Float32Array(nV * 3);
    const uArr = new Float32Array(nV * 2);
    const cArr = new Float32Array(nV * 3);
    const kArr = curv ? new Float32Array(nV) : null;
    const sArr = sp ? new Float32Array(nV * 4) : null;

    for (let t = 0; t < validTris.length; t++) {
      const base = validTris[t];
      for (let k = 0; k < 3; k++) {
        const si = base + k;
        const di = t * 3 + k;
        pArr[di * 3] = pos.getX(si);
        pArr[di * 3 + 1] = pos.getY(si);
        pArr[di * 3 + 2] = pos.getZ(si);
        nArr[di * 3] = norm ? norm.getX(si) : 0;
        nArr[di * 3 + 1] = norm ? norm.getY(si) : 1;
        nArr[di * 3 + 2] = norm ? norm.getZ(si) : 0;
        uArr[di * 2] = uv ? uv.getX(si) : 0;
        uArr[di * 2 + 1] = uv ? uv.getY(si) : 0;
        cArr[di * 3] = col ? col.getX(si) : 0.45;
        cArr[di * 3 + 1] = col ? col.getY(si) : 0.45;
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.48;
        if (kArr && curv) kArr[di] = curv.getX(si);
        if (sArr && sp) {
          sArr[di * 4] = sp.getX(si);
          sArr[di * 4 + 1] = sp.getY(si);
          sArr[di * 4 + 2] = sp.getZ(si);
          sArr[di * 4 + 3] = sp.getW(si);
        }
      }
    }
    out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nArr, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uArr, 2));
    out.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
    if (kArr) {
      out.setAttribute(CURVATURE_ATTRIBUTE, new THREE.BufferAttribute(kArr, 1));
    }
    if (sArr) {
      out.setAttribute(
        SPRING_PARAM_ATTRIBUTE,
        new THREE.BufferAttribute(sArr, 4)
      );
    }
    if (src !== geo) src.dispose();
    geo.dispose();
  } else if (src !== geo) {
    geo.dispose();
  }

  const outPos = out.getAttribute('position') as THREE.BufferAttribute;
  const outNorm = out.getAttribute('normal') as THREE.BufferAttribute;
  const nTotal = outPos.count;

  // Guarantee outward winding (signedVolume > 0)
  if (computeSignedVolumeRaw(outPos) < 0) {
    const outUv = out.getAttribute('uv') as THREE.BufferAttribute;
    const outCol = out.getAttribute('color') as THREE.BufferAttribute;
    const outCurv = out.getAttribute(CURVATURE_ATTRIBUTE) as THREE.BufferAttribute | undefined;
    const outSp = out.getAttribute(SPRING_PARAM_ATTRIBUTE) as THREE.BufferAttribute | undefined;
    for (let i = 0; i + 2 < nTotal; i += 3) {
      const swap3 = (attr: THREE.BufferAttribute) => {
        const x1 = attr.getX(i + 1);
        const y1 = attr.getY(i + 1);
        const z1 = attr.getZ(i + 1);
        attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
        attr.setXYZ(i + 2, x1, y1, z1);
      };
      swap3(outPos);
      swap3(outNorm);
      swap3(outCol);
      const u1 = outUv.getX(i + 1);
      const v1 = outUv.getY(i + 1);
      outUv.setXY(i + 1, outUv.getX(i + 2), outUv.getY(i + 2));
      outUv.setXY(i + 2, u1, v1);
      if (outCurv) {
        const c1 = outCurv.getX(i + 1);
        outCurv.setX(i + 1, outCurv.getX(i + 2));
        outCurv.setX(i + 2, c1);
      }
      if (outSp) {
        const s1x = outSp.getX(i + 1);
        const s1y = outSp.getY(i + 1);
        const s1z = outSp.getZ(i + 1);
        const s1w = outSp.getW(i + 1);
        outSp.setXYZW(i + 1, outSp.getX(i + 2), outSp.getY(i + 2), outSp.getZ(i + 2), outSp.getW(i + 2));
        outSp.setXYZW(i + 2, s1x, s1y, s1z, s1w);
      }
    }
    for (let i = 0; i < nTotal; i++) {
      outNorm.setXYZ(i, -outNorm.getX(i), -outNorm.getY(i), -outNorm.getZ(i));
    }
  }

  for (let i = 0; i + 2 < nTotal; i += 3) {
    let needFace = false;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const nx = outNorm.getX(vi);
      const ny = outNorm.getY(vi);
      const nz = outNorm.getZ(vi);
      const len = Math.hypot(nx, ny, nz);
      if (!Number.isFinite(len) || len < 1e-5) {
        needFace = true;
      } else {
        outNorm.setXYZ(vi, nx / len, ny / len, nz / len);
      }
    }
    if (needFace) {
      _vA.fromBufferAttribute(outPos, i);
      _vB.fromBufferAttribute(outPos, i + 1);
      _vC.fromBufferAttribute(outPos, i + 2);
      _e1.subVectors(_vB, _vA);
      _e2.subVectors(_vC, _vA);
      _fn.crossVectors(_e1, _e2);
      const fl = _fn.length();
      if (fl > 1e-8) _fn.divideScalar(fl);
      else _fn.set(0, 1, 0);
      for (let k = 0; k < 3; k++) {
        outNorm.setXYZ(i + k, _fn.x, _fn.y, _fn.z);
      }
    }
  }

  out.computeBoundingBox();
  out.computeBoundingSphere();

  if (!preserveCustomUvs) {
    const bb = out.boundingBox!;
    const spanX = Math.max(1e-3, bb.max.x - bb.min.x);
    const spanY = Math.max(1e-3, bb.max.y - bb.min.y);
    const spanZ = Math.max(1e-3, bb.max.z - bb.min.z);
    const uvs = new Float32Array(nTotal * 2);
    for (let i = 0; i < nTotal; i++) {
      const xN = clamp01((outPos.getX(i) - bb.min.x) / spanX);
      const yN = clamp01((outPos.getY(i) - bb.min.y) / spanY);
      const zN = clamp01((outPos.getZ(i) - bb.min.z) / spanZ);
      const ax = Math.abs(outNorm.getX(i));
      const ay = Math.abs(outNorm.getY(i));
      const az = Math.abs(outNorm.getZ(i));
      let uVal: number;
      let vVal: number;
      if (az >= ax && az >= ay) {
        uVal = 0.04 + xN * 0.92;
        vVal = 0.04 + yN * 0.92;
      } else if (ay >= ax) {
        uVal = 0.04 + xN * 0.92;
        vVal = 0.04 + zN * 0.92;
      } else {
        uVal = 0.04 + zN * 0.92;
        vVal = 0.04 + yN * 0.92;
      }
      uvs[i * 2] = clamp01(uVal);
      uvs[i * 2 + 1] = clamp01(vVal);
    }
    out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }

  return out;
}

// ============================================================================
// 1. WATERTIGHT CAD SOLID & HELICAL SPRING PRIMITIVES
// ============================================================================

/** Strictly watertight solid or hollow revolution along `+X` from `(r, x)` profile. */
export function revolveClosedX(
  profile: ReadonlyArray<readonly [number, number]>,
  radialSegments: number,
  color: string
): THREE.BufferGeometry {
  const seg = Math.max(6, Math.floor(radialSegments));
  const cosA = new Float64Array(seg + 1);
  const sinA = new Float64Array(seg + 1);
  for (let s = 0; s <= seg; s++) {
    const k = s % seg;
    const a = (k / seg) * Math.PI * 2;
    cosA[s] = Math.cos(a);
    sinA[s] = Math.sin(a);
  }

  const tris: number[] = [];
  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number
  ) => {
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    if (nx * nx + ny * ny + nz * nz < 1e-20) return;
    tris.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  for (let k = 0; k + 1 < profile.length; k++) {
    const [r0, x0] = profile[k];
    const [r1, x1] = profile[k + 1];
    for (let s = 0; s < seg; s++) {
      const ay = -r0 * cosA[s];
      const az = r0 * sinA[s];
      const by = -r0 * cosA[s + 1];
      const bz = r0 * sinA[s + 1];
      const cy = -r1 * cosA[s + 1];
      const cz = r1 * sinA[s + 1];
      const dy = -r1 * cosA[s];
      const dz = r1 * sinA[s];
      pushTri(x0, ay, az, x1, cy, cz, x0, by, bz);
      pushTri(x0, ay, az, x1, dy, dz, x1, cy, cz);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(tris), 3)
  );
  geo.computeVertexNormals();
  return paintGeometry(geo, color);
}

/** Extrudes a `(Z, Y)` cross-section along `+X` from `x0` to `x0 + len`. */
export function extrudeAlongX(
  shape: THREE.Shape,
  x0: number,
  len: number,
  color: string,
  chamfer = 0.03,
  curveSegments = 8
): THREE.BufferGeometry {
  const c = Math.min(chamfer, len * 0.28);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: len - 2 * c,
    curveSegments,
    bevelEnabled: c > 0,
    bevelThickness: c,
    bevelSize: c,
    bevelOffset: -c,
    bevelSegments: 1,
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate(x0 + len - c, 0, 0);
  return paintGeometry(geo, color);
}

/** Extrudes an `(X, Y)` side-profile shape symmetrically across `Z` centered at `zCenter`. */
export function extrudeAlongZ(
  shape: THREE.Shape,
  zCenter: number,
  widthZ: number,
  color: string,
  chamfer = 0.04,
  curveSegments = 8
): THREE.BufferGeometry {
  const c = Math.min(chamfer, widthZ * 0.28);
  const depth = widthZ - 2 * c;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments,
    bevelEnabled: c > 0,
    bevelThickness: c,
    bevelSize: c,
    bevelOffset: -c,
    bevelSegments: 1,
  });
  geo.translate(0, 0, zCenter - depth / 2);
  return paintGeometry(geo, color);
}

/** Merges non-overlapping cutter solids into a single brush for fast single-pass CSG subtraction. */
export function mergeCutters(
  cutters: THREE.BufferGeometry[],
  color = VECTOR_INNER_DARK
): THREE.BufferGeometry {
  const prepared = cutters.map((c) => {
    const g = c.index ? c.toNonIndexed() : c;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', g.getAttribute('position'));
    clean.setAttribute('normal', g.getAttribute('normal'));
    const uv = g.getAttribute('uv');
    clean.setAttribute(
      'uv',
      uv ??
        new THREE.BufferAttribute(
          new Float32Array(g.getAttribute('position').count * 2),
          2
        )
    );
    return clean;
  });
  const merged = mergeGeometries(prepared, false);
  return paintGeometry(merged, color);
}

/**
 * Builds a helical spring via `createHelicalSpring` (`aSpringParam.w = 1` for X-axis!) and
 * caps both open wire cross-section circles with exact manifold triangle fans carrying
 * matching `aSpringParam` so `openEdges === 0` AND `signedVolume > 0`!
 */
export function createWatertightHelicalSpring(
  opts: HelicalSpringOptions,
  color: string
): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({ ...opts, axis: 'x' }),
    color
  );
  const pos = spring.getAttribute('position') as THREE.BufferAttribute;
  const norm = spring.getAttribute('normal') as THREE.BufferAttribute;
  const uv = spring.getAttribute('uv') as THREE.BufferAttribute;
  const col = spring.getAttribute('color') as THREE.BufferAttribute;
  const sp = spring.getAttribute(SPRING_PARAM_ATTRIBUTE) as THREE.BufferAttribute;

  const keyOf = (vi: number) =>
    `${Math.round(pos.getX(vi) * 1e5)},${Math.round(pos.getY(vi) * 1e5)},${Math.round(pos.getZ(vi) * 1e5)}`;

  interface BoundaryEdge {
    a: number;
    b: number;
    ka: string;
    kb: string;
    uEnd: number;
  }

  const edgeMap = new Map<string, BoundaryEdge>();
  const allKeys = new Set<string>();
  for (let t = 0; t + 2 < pos.count; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = t + e;
      const b = t + ((e + 1) % 3);
      const ka = keyOf(a);
      const kb = keyOf(b);
      const dirKey = `${ka}|${kb}`;
      allKeys.add(dirKey);
      edgeMap.set(dirKey, { a, b, ka, kb, uEnd: sp.getX(a) });
    }
  }

  const startEdges: BoundaryEdge[] = [];
  const endEdges: BoundaryEdge[] = [];
  edgeMap.forEach((edge) => {
    if (!allKeys.has(`${edge.kb}|${edge.ka}`)) {
      if (edge.uEnd < 0.5) startEdges.push(edge);
      else endEdges.push(edge);
    }
  });

  const capTrisPos: number[] = [];
  const capTrisNorm: number[] = [];
  const capTrisUv: number[] = [];
  const capTrisCol: number[] = [];
  const capTrisSp: number[] = [];

  const emitCap = (edges: BoundaryEdge[]) => {
    if (edges.length < 3) return;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const e of edges) {
      cx += pos.getX(e.a);
      cy += pos.getY(e.a);
      cz += pos.getZ(e.a);
    }
    cx /= edges.length;
    cy /= edges.length;
    cz /= edges.length;

    const sampleVi = edges[0].a;
    const su = sp.getX(sampleVi);
    const sc = sp.getY(sampleVi);
    const sa = sp.getZ(sampleVi);
    const sw = sp.getW(sampleVi) || SPRING_AXIS_MODE_X;
    const cr = col.getX(sampleVi);
    const cg = col.getY(sampleVi);
    const cb = col.getZ(sampleVi);

    for (const e of edges) {
      // Boundary edge is (a -> b), so cap triangle must traverse (b -> a -> center) to cancel (a -> b)!
      const bx = pos.getX(e.b);
      const by = pos.getY(e.b);
      const bz = pos.getZ(e.b);
      const ax = pos.getX(e.a);
      const ay = pos.getY(e.a);
      const az = pos.getZ(e.a);

      _vA.set(bx, by, bz);
      _vB.set(ax, ay, az);
      _vC.set(cx, cy, cz);
      _e1.subVectors(_vB, _vA);
      _e2.subVectors(_vC, _vA);
      _fn.crossVectors(_e1, _e2);
      const fl = _fn.length();
      if (fl <= 1e-12) continue;
      _fn.divideScalar(fl);

      capTrisPos.push(bx, by, bz, ax, ay, az, cx, cy, cz);
      for (let k = 0; k < 3; k++) {
        capTrisNorm.push(_fn.x, _fn.y, _fn.z);
        capTrisUv.push(0.5, 0.5);
        capTrisCol.push(cr, cg, cb);
        capTrisSp.push(su, sc, sa, sw);
      }
    }
  };

  emitCap(startEdges);
  emitCap(endEdges);

  if (capTrisPos.length === 0) return spring;

  const nOld = pos.count;
  const nAdd = capTrisPos.length / 3;
  const nNew = nOld + nAdd;

  const pNew = new Float32Array(nNew * 3);
  pNew.set(pos.array as Float32Array, 0);
  pNew.set(capTrisPos, nOld * 3);

  const nrmNew = new Float32Array(nNew * 3);
  nrmNew.set(norm.array as Float32Array, 0);
  nrmNew.set(capTrisNorm, nOld * 3);

  const uvNew = new Float32Array(nNew * 2);
  uvNew.set(uv.array as Float32Array, 0);
  uvNew.set(capTrisUv, nOld * 2);

  const colNew = new Float32Array(nNew * 3);
  colNew.set(col.array as Float32Array, 0);
  colNew.set(capTrisCol, nOld * 3);

  const spNew = new Float32Array(nNew * 4);
  spNew.set(sp.array as Float32Array, 0);
  spNew.set(capTrisSp, nOld * 4);

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pNew, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrmNew, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvNew, 2));
  out.setAttribute('color', new THREE.BufferAttribute(colNew, 3));
  out.setAttribute(SPRING_PARAM_ATTRIBUTE, new THREE.BufferAttribute(spNew, 4));
  out.setAttribute(
    CURVATURE_ATTRIBUTE,
    new THREE.BufferAttribute(new Float32Array(nNew), 1)
  );
  spring.dispose();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// ============================================================================
// 2. PRECISION 2K UV ATLAS UNWRAPPERS (`vector_housing_*` & `vector_internals_*`)
// ============================================================================

export type VectorHousingUvZone = 'lower' | 'upper' | 'stock' | 'sight';
export type VectorInternalsUvZone =
  | 'slider'
  | 'bolt'
  | 'barrel'
  | 'brass_accent'
  | 'mag';

/**
 * Unwraps housing, folding stock & sight parts onto `vector_housing_{albedo,normal,roughness}.webp` (2048×1024):
 *  - `lower`: Left flank v ∈ [0.04, 0.27], Right flank v ∈ [0.29, 0.52], inner walls v ∈ [0.01, 0.04]
 *  - `upper`: Upper FDE/Charcoal housing w/ `1/2/A` & `S/F` markings u ∈ [0.04, 0.71], v ∈ [0.56, 0.78];
 *             Top MIL-STD-1913 Picatinny rail (`ny > 0.35` or rail tag) u ∈ [0.75, 0.97], v ∈ [0.56, 0.78]
 *  - `stock`: Skeletonized Gen II FDE stock u ∈ [0.04, 0.70], v ∈ [0.82, 0.97];
 *             Ribbed charcoal rubber buttpad u ∈ [0.75, 0.97], v ∈ [0.82, 0.97]
 *  - `sight`: Low-profile Defiance flip-up iron sights u ∈ [0.74, 0.97], v ∈ [0.56, 0.78]
 */
export function applyVectorHousingUVs(
  geo: THREE.BufferGeometry,
  zone: VectorHousingUvZone
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = Math.max(1e-3, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-3, bb.max.y - bb.min.y);
  const spanZ = Math.max(1e-3, bb.max.z - bb.min.z);

  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz, cr, cb } = triInfo(pos, col, i, i + 1, i + 2);
    // Charcoal/anodized vertices have lower red & slightly cooler blue than warm FDE
    const isCharcoalOrRail = cb >= cr * 0.95;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const xN = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const yN = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      const zN = clamp01((pos.getZ(vi) - bb.min.z) / spanZ);

      let u: number;
      let v: number;

      if (zone === 'lower') {
        if (fnz < -0.34 && cz < -0.22) {
          u = 0.04 + xN * 0.92;
          v = 0.04 + yN * 0.23;
        } else if (fnz > 0.34 && cz > 0.22) {
          u = 0.04 + xN * 0.92;
          v = 0.295 + yN * 0.23;
        } else {
          u = 0.3 + xN * 0.62;
          v = 0.012 + zN * 0.024;
        }
      } else if (zone === 'upper') {
        if (isCharcoalOrRail) {
          u = 0.75 + xN * 0.22;
          v = 0.56 + (0.65 * yN + 0.35 * zN) * 0.22;
        } else {
          u = 0.04 + xN * 0.67;
          v = 0.56 + yN * 0.22;
        }
      } else if (zone === 'stock') {
        if (isCharcoalOrRail) {
          u = 0.75 + zN * 0.22;
          v = 0.82 + yN * 0.155;
        } else {
          u = 0.05 + xN * 0.65;
          v = 0.82 + yN * 0.155;
        }
      } else {
        u = 0.74 + xN * 0.23;
        v = 0.56 + (0.7 * yN + 0.3 * fractPos(zN)) * 0.22;
      }

      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps precision internal metal & magazine parts onto `vector_internals_{albedo,normal,roughness}.webp`:
 *  - `slider`: Tungsten-gray slider u ∈ [0.04, 0.61], v ∈ [0.55, 0.96];
 *              Mirror-polished cam slot (`B=0.92, G=0.22`!) u ∈ [0.65, 0.96], v ∈ [0.55, 0.96]
 *  - `bolt`:   Black-nitride cam bolt u ∈ [0.04, 0.65], v ∈ [0.28, 0.50];
 *              Gold/brass extractor & cam trunnion accent u ∈ [0.69, 0.96], v ∈ [0.28, 0.50]
 *  - `barrel`: 5.5" .45 ACP barrel & muzzle protector u ∈ [0.04, 0.65], v ∈ [0.28, 0.50]
 *  - `brass_accent`: Non-reciprocating charging handle w/ KRISS brass pivot u ∈ [0.05, 0.96], v ∈ [0.28, 0.50]
 *  - `mag`:    Extended 25-rd Kriss MagEx2 .45 ACP body & witness markings u ∈ [0.04, 0.96], v ∈ [0.03, 0.24]
 */
export function applyVectorInternalsUVs(
  geo: THREE.BufferGeometry,
  zone: VectorInternalsUvZone
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = Math.max(1e-3, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-3, bb.max.y - bb.min.y);
  const spanZ = Math.max(1e-3, bb.max.z - bb.min.z);

  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr, cg, cb } = triInfo(pos, col, i, i + 1, i + 2);
    const isPolishedCam = cr > 0.52 && cb > 0.55;
    const isBrass = cr > 0.42 && cg > 0.28 && cb < 0.18;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const xN = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const yN = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      const zN = clamp01((pos.getZ(vi) - bb.min.z) / spanZ);

      let u: number;
      let v: number;

      if (zone === 'slider') {
        if (isPolishedCam) {
          u = 0.65 + xN * 0.31;
          v = 0.55 + yN * 0.41;
        } else {
          u = 0.04 + xN * 0.57;
          v = 0.55 + yN * 0.41;
        }
      } else if (zone === 'bolt') {
        if (isBrass || isPolishedCam) {
          u = 0.69 + xN * 0.27;
          v = 0.28 + (0.65 * yN + 0.35 * zN) * 0.22;
        } else {
          u = 0.04 + xN * 0.61;
          v = 0.28 + yN * 0.22;
        }
      } else if (zone === 'barrel') {
        u = 0.04 + xN * 0.61;
        v = 0.28 + (0.65 * yN + 0.35 * zN) * 0.22;
      } else if (zone === 'brass_accent') {
        if (isBrass) {
          u = 0.69 + xN * 0.27;
          v = 0.28 + (0.65 * yN + 0.35 * zN) * 0.22;
        } else {
          u = 0.05 + xN * 0.59;
          v = 0.28 + (0.65 * yN + 0.35 * zN) * 0.22;
        }
      } else {
        u = 0.04 + xN * 0.92;
        v = 0.03 + (0.75 * yN + 0.25 * zN) * 0.21;
      }

      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 3. 'slide' GROUP — 5.5" LOW-BORE BARREL, CAM BOLT & SUPER V SLIDER (7 PARTS)
// ============================================================================

/**
 * S-01 (`vector_barrel`): Fixed 5.5" (14.0 cm) .45 ACP Low-Bore CHF Barrel & Forged Chamber Trunnion
 * (`assembledPos: [0, -0.95, 0]`). Spans local `X ∈ [+10.20, +24.20]` (exact 140 mm = 5.5"!).
 */
export function buildVectorBarrelGeometry(): THREE.BufferGeometry {
  // .45 ACP (11.43×23mm): bore r = 0.5715 cm, chamber r = 0.606 cm, M16×1 LH muzzle threads!
  const barrelTube = revolveClosedX(
    [
      [0.64, 10.2],
      [0.98, 10.2], // Heavy breech face at X = +10.20
      [0.98, 13.45],
      [0.86, 13.55], // Trunnion journal step
      [0.86, 16.8],
      [0.82, 17.2], // Heavy combat .45 ACP contour
      [0.82, 23.35],
      [0.74, 23.42], // M16×1 LH thread-relief shoulder
      [0.76, 23.48],
      [0.76, 24.16], // Muzzle thread spigot
      [0.72, 24.2], // 45° outer crown bevel
      [0.61, 24.2], // Target crown rim
      [0.572, 24.12], // 11° recessed target crown dish
      [0.572, 12.65], // Ø11.43mm (.45 ACP) chrome/nitride bore
      [0.606, 12.48], // .45 ACP headspacing case-mouth step!
      [0.612, 10.26], // .45 ACP straight-wall chamber (22.8mm)
      [0.64, 10.2], // Polished chamber throat bevel (closes loop)
    ],
    32,
    VECTOR_BARREL_STEEL
  );

  // Forged CNC square barrel-trunnion block pinned into lower chassis (`X ∈ [10.35, 13.35]`)
  const trunnionShape = new THREE.Shape();
  const th = 1.08;
  const tc = 0.14;
  trunnionShape.moveTo(-th + tc, -th);
  trunnionShape.lineTo(th - tc, -th);
  trunnionShape.quadraticCurveTo(th, -th, th, -th + tc);
  trunnionShape.lineTo(th, th - tc);
  trunnionShape.quadraticCurveTo(th, th, th - tc, th);
  trunnionShape.lineTo(-th + tc, th);
  trunnionShape.quadraticCurveTo(-th, th, -th, th - tc);
  trunnionShape.lineTo(-th, -th + tc);
  trunnionShape.quadraticCurveTo(-th, -th, -th + tc, -th);
  const trunnionBore = new THREE.Path();
  trunnionBore.absarc(0, 0, 0.96, 0, Math.PI * 2, true);
  trunnionShape.holes.push(trunnionBore);

  const trunnionBlock = extrudeAlongX(
    trunnionShape,
    10.35,
    3.0,
    VECTOR_NITRIDE_STEEL,
    0.045,
    8
  );

  // Wide polished .45 ACP feed-ramp tongue beneath chamber mouth (`X = +10.05, local Y = -0.68`)
  const feedRamp = createChamferedBox(0.68, 0.28, 0.92, 0.04, VECTOR_CAM_POLISHED)
    .rotateZ(0.46)
    .translate(10.08, -0.74, 0);

  // Top trunnion cross-pin locking lug
  const topLug = createChamferedBox(1.85, 0.42, 1.16, 0.04, VECTOR_NITRIDE_STEEL);
  topLug.translate(11.85, 1.18, 0);

  return sanitizeVectorMesh(
    applyVectorInternalsUVs(
      mergeParts([barrelTube, trunnionBlock, feedRamp, topLug]),
      'barrel'
    ),
    true
  );
}

/**
 * S-02 (`vector_muzzle_device`): Threaded M16×1 LH Fluted Flash Hider / Thread Protector
 * (`assembledPos: [24.20, -0.95, 0]`). Spans local `X ∈ [-0.72, +1.90]` -> world tip `+26.10 cm`!
 */
export function buildVectorMuzzleDeviceGeometry(): THREE.BufferGeometry {
  const body = revolveClosedX(
    [
      [0.77, -0.72],
      [0.96, -0.72], // Rear shoulder
      [0.99, -0.64],
      [0.99, 0.35], // Knurled/fluted protector collar
      [0.93, 0.42],
      [0.96, 0.5],
      [0.96, 1.82], // Forward 4-prong shroud
      [0.9, 1.9],
      [0.7, 1.9], // Exit cone lip
      [0.63, 0.45], // Internal .45 ACP expansion chamber
      [0.77, 0.35],
      [0.77, -0.72],
    ],
    28,
    VECTOR_NITRIDE_STEEL
  );

  // 4 longitudinal flash-suppression slots + 2 wrench flats (non-overlapping sequential CSG passes)
  const slotHorizontal = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.24, 2.3).translate(1.22, 0, 0),
    VECTOR_INNER_DARK
  );
  const slotVertical = paintGeometry(
    new THREE.BoxGeometry(1.18, 2.3, 0.24).translate(1.22, 0, 0),
    VECTOR_INNER_DARK
  );
  const wrenchFlats = mergeCutters([
    new THREE.BoxGeometry(0.52, 0.22, 2.1).translate(-0.28, 0.98, 0),
    new THREE.BoxGeometry(0.52, 0.22, 2.1).translate(-0.28, -0.98, 0),
  ]);
  const slotted = csgSubtract(body, [slotHorizontal, slotVertical, wrenchFlats]);

  return sanitizeVectorMesh(
    applyVectorInternalsUVs(slotted, 'barrel'),
    true
  );
}

/**
 * S-03 (`vector_bolt`): Compact Hardened .45 ACP Delayed-Blowback Breech Bolt w/ Lateral Cam Trunnions
 * (`assembledPos: [7.25, -0.95, 0]`). Spans local `X ∈ [-2.95, +2.95]` -> world `X ∈ [+4.30, +10.20]`.
 * Features twin cylindrical lateral cam trunnions (`Z = ±0.94` at local `X = -2.15`) that ride inside
 * the angled variable-leverage cam slot of `vector_slider`!
 */
export function buildVectorBoltGeometry(): THREE.BufferGeometry {
  const coreBlock = createChamferedBox(
    5.9,
    1.54,
    1.46,
    0.09,
    VECTOR_NITRIDE_STEEL
  );

  // Carve recessed .45 ACP bolt face, axial firing-pin tunnel, bottom feed-lip relief & left ejector slot
  const boltFaceCup = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.62, 0.38, 24)
      .rotateZ(Math.PI / 2)
      .translate(2.86, 0, 0),
    VECTOR_INNER_DARK
  );
  const firingPinChannel = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 6.4, 18)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    VECTOR_INNER_DARK
  );
  const lowerSlots = mergeCutters([
    new THREE.BoxGeometry(3.8, 0.34, 0.52).translate(0.95, -0.68, 0),
    new THREE.BoxGeometry(4.2, 0.24, 0.24).translate(0.95, -0.18, -0.66),
  ]);
  const machinedBolt = csgSubtract(coreBlock, [
    boltFaceCup,
    firingPinChannel,
    lowerSlots,
  ]);

  // Twin hardened cylindrical lateral cam trunnions (`Z = ±0.94`, local X = -2.15 -> world X = +5.10!)
  const camTrunnionAxle = createBeveledCylinder(
    0.34,
    0.34,
    2.24,
    0.04,
    22,
    VECTOR_CAM_POLISHED
  )
    .rotateX(Math.PI / 2)
    .translate(-2.15, -0.08, 0);

  // Horizontal upper receiver guide-rail shoes along both flanks
  const railShoeL = createChamferedBox(3.4, 0.28, 0.22, 0.03, VECTOR_CAM_POLISHED);
  railShoeL.translate(0.65, 0.42, -0.8);
  const railShoeR = createChamferedBox(3.4, 0.28, 0.22, 0.03, VECTOR_CAM_POLISHED);
  railShoeR.translate(0.65, 0.42, 0.8);

  // Heavy right-side (+Z) spring-steel .45 ACP claw extractor w/ brass rim wear pad
  const extractor = createChamferedBox(1.85, 0.32, 0.22, 0.03, VECTOR_BRASS_ACCENT);
  extractor.translate(1.88, 0.06, 0.76);

  // Bottom cartridge-stripping lug horn
  const stripHorn = createChamferedBox(1.45, 0.36, 0.42, 0.04, VECTOR_NITRIDE_STEEL);
  stripHorn.translate(2.1, -0.82, 0);

  return sanitizeVectorMesh(
    applyVectorInternalsUVs(
      mergeParts([
        machinedBolt,
        camTrunnionAxle,
        railShoeL,
        railShoeR,
        extractor,
        stripHorn,
      ]),
      'bolt'
    ),
    true
  );
}

/**
 * S-04 (`vector_firing_pin`): Stepped Inertial Tool-Steel Firing Pin & Captive Return Spring
 * (`assembledPos: [7.10, -0.95, 0]`). Spans local `X ∈ [-3.18, +3.04]`.
 */
export function buildVectorFiringPinGeometry(): THREE.BufferGeometry {
  const pinShaft = revolveClosedX(
    [
      [0.0, -3.18],
      [0.24, -3.18], // Rear hammer-strike button exposed behind bolt tail
      [0.27, -3.1],
      [0.27, -2.55],
      [0.13, -2.48], // Rear stem
      [0.13, 0.2],
      [0.23, 0.26], // Return-spring stop collar
      [0.23, 0.52],
      [0.11, 0.58], // Forward shaft
      [0.11, 2.35],
      [0.058, 2.96], // Tapered .45 ACP primer needle
      [0.038, 3.04],
      [0.0, 3.05], // Hemispherical tip
    ],
    20,
    VECTOR_STAINLESS
  );

  const returnSpring = createWatertightHelicalSpring(
    {
      axis: 'x',
      start: 0.56,
      end: 2.28,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.165,
      wireRadius: 0.024,
      coils: 9,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    },
    VECTOR_SPRING_STEEL
  );

  return sanitizeVectorMesh(mergeParts([pinShaft, returnSpring]));
}

/**
 * S-05 (`vector_slider`): Patented KRISS Super V Tungsten-Steel Off-Axis Vertical Counterweight Slider
 * (`assembledPos: [3.85, -2.35, 0]`).
 * Twin CNC-milled side cheeks (`Z = ±0.92`) with **angled variable-leverage upper cam slots**
 * (`B = 0.92, G = 0.22` polished cam track!) joined by a massive lower tungsten counterweight block
 * inclined along the `-65°` Super V chute!
 */
export function buildVectorSliderGeometry(): THREE.BufferGeometry {
  // Side cheek profile in (X, Y): upper cam-slot head around (X=+1.25, Y=+1.40 -> world [+5.10, -0.95]!)
  // sweeping down at 65° to heavy counterweight base (X=-1.45, Y=-3.35 -> world [+2.40, -5.70])!
  const cheekShape = new THREE.Shape();
  cheekShape.moveTo(-0.35, 2.15);
  cheekShape.lineTo(2.15, 2.15);
  cheekShape.lineTo(2.35, 1.35);
  cheekShape.lineTo(0.45, -3.45);
  cheekShape.lineTo(-1.85, -3.45);
  cheekShape.lineTo(-2.05, -2.45);
  cheekShape.closePath();

  // Variable-angle KRISS Super V cam slot hole (steep upper delay ramp -> angled off-axis drive track!)
  const camSlotHole = new THREE.Path();
  camSlotHole.moveTo(0.55, 1.72);
  camSlotHole.lineTo(1.75, 1.52);
  camSlotHole.lineTo(1.15, 0.35);
  camSlotHole.lineTo(0.05, 0.65);
  camSlotHole.closePath();
  cheekShape.holes.push(camSlotHole);

  const cheekLeft = extrudeAlongZ(
    cheekShape,
    -0.92,
    0.44,
    VECTOR_TUNGSTEN_SLIDER,
    0.04,
    8
  );
  const cheekRight = extrudeAlongZ(
    cheekShape,
    0.92,
    0.44,
    VECTOR_TUNGSTEN_SLIDER,
    0.04,
    8
  );

  // Heavy lower tungsten counterweight mass bridging left & right cheeks (with central 65° spring tunnel!)
  const massRaw = createChamferedBox(
    2.25,
    3.65,
    2.12,
    0.09,
    VECTOR_TUNGSTEN_SLIDER
  )
    .rotateZ(SUPER_V_CHUTE_ANGLE - Math.PI / 2)
    .translate(-0.55, -1.65, 0);

  const springBoreCutter = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 5.2, 22)
      .rotateZ(SUPER_V_CHUTE_ANGLE - Math.PI / 2)
      .translate(-0.55, -1.65, 0),
    VECTOR_INNER_DARK
  );
  const hollowCounterweight = csgSubtract(massRaw, [springBoreCutter]);

  // Mirror-polished hardened bearing liner rings & 65° chute guide rails (`B=0.92, G=0.22` UV island!)
  const buildCamLiner = (zCenter: number): THREE.BufferGeometry => {
    const linerBarTop = createChamferedBox(1.38, 0.14, 0.48, 0.02, VECTOR_CAM_POLISHED)
      .rotateZ(-0.52)
      .translate(1.12, 1.58, zCenter);
    const linerBarBot = createChamferedBox(1.38, 0.14, 0.48, 0.02, VECTOR_CAM_POLISHED)
      .rotateZ(-0.52)
      .translate(0.68, 0.58, zCenter);
    const chuteRail = createChamferedBox(0.32, 4.45, 0.22, 0.03, VECTOR_CAM_POLISHED)
      .rotateZ(SUPER_V_CHUTE_ANGLE - Math.PI / 2)
      .translate(-0.62, -1.15, zCenter + Math.sign(zCenter) * 0.24);
    return mergeParts([linerBarTop, linerBarBot, chuteRail]);
  };

  return sanitizeVectorMesh(
    applyVectorInternalsUVs(
      mergeParts([
        cheekLeft,
        cheekRight,
        hollowCounterweight,
        buildCamLiner(-0.92),
        buildCamLiner(0.92),
      ]),
      'slider'
    ),
    true
  );
}

/**
 * S-06 (`vector_guide_rod`): Inclined `-65°` Centerless-Ground Steel Recoil Guide Rod & Elastomer Buffer
 * (`assembledPos: [-2.45, -12.15, 0]`, `assembledRot: [0, 0, SUPER_V_CHUTE_ANGLE]`).
 * Built along local `+X` (`[-0.45, +14.65]`) so `+65°` rotation aligns it coaxially up the Super V chute!
 */
export function buildVectorGuideRodGeometry(): THREE.BufferGeometry {
  const rodAndBase = revolveClosedX(
    [
      [0.0, -0.45],
      [0.72, -0.45], // Lower chute anchor flange
      [0.76, -0.38],
      [0.76, 0.0],
      [0.64, 0.05], // Polyurethane shock buffer pad
      [0.64, 0.65],
      [0.24, 0.72], // Centerless-ground steel guide shaft (`r = 0.24 < spring coil 0.44`)
      [0.24, 14.48],
      [0.18, 14.65], // Rounded top guide nose
      [0.0, 14.68],
    ],
    22,
    VECTOR_STAINLESS
  );

  const bufferCollar = revolveClosedX(
    [
      [0.635, 0.06],
      [0.68, 0.06],
      [0.68, 0.62],
      [0.635, 0.62],
      [0.635, 0.06],
    ],
    22,
    VECTOR_RUBBER_PAD
  );

  return sanitizeVectorMesh(mergeParts([rodAndBase, bufferCollar]));
}

/**
 * S-07 (`vector_recoil_spring`): Inclined `-65°` Helical Super V Recoil Spring
 * (`assembledPos: [-2.45, -12.15, 0]`, `assembledRot: [0, 0, SUPER_V_CHUTE_ANGLE]`).
 * Pure X-axis `createWatertightHelicalSpring` (`start: 0.0` bottom buffer -> `end: 14.55` slider seat)
 * carrying valid `aSpringParam` `w = 1` (`scaleX: 1.0 -> 0.56` during the 6.4 cm Super V plunge!).
 */
export function buildVectorRecoilSpringGeometry(): THREE.BufferGeometry {
  const spring = createWatertightHelicalSpring(
    {
      axis: 'x',
      start: 0.0,
      end: 14.55,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.44,
      wireRadius: 0.064,
      coils: 22,
      radialSegments: 9,
      tubularSegmentsPerCoil: 16,
    },
    VECTOR_SPRING_STEEL
  );

  const topPlungerSeat = revolveClosedX(
    [
      [0.26, 14.32],
      [0.54, 14.32],
      [0.54, 14.68],
      [0.36, 14.82],
      [0.26, 14.82],
      [0.26, 14.32],
    ],
    20,
    VECTOR_STAINLESS
  );

  return sanitizeVectorMesh(mergeParts([spring, topPlungerSeat]));
}

// ============================================================================
// 4. 'magazine' GROUP — EXTENDED 25-RD KRISS MAGEX2 .45 ACP MAGAZINE (4 PARTS)
// ============================================================================

/**
 * M-01 (`vector_mag_body`): Steeply Angled 25-Round Glock-21 / Kriss MagEx2 .45 ACP Magazine Body
 * (`assembledPos: [4.95, -9.85, 0]`, `assembledRot: [0, 0, VECTOR_MAG_ANGLE]`, `isShell: true`).
 * Built along local `+X` (`[-8.10, +8.45]`) so `+66°` rotation places feed lips at `[+8.38, -2.13, 0]`!
 */
export function buildVectorMagBodyGeometry(): THREE.BufferGeometry {
  // Hollow double-stack .45 ACP cross-section drawn in `(Z, Y)` extruded along `+X`
  const magCross = new THREE.Shape();
  const hz = 1.24; // 24.8mm Glock-21 .45 ACP width
  const hy = 1.62; // 32.4mm .45 ACP front-to-back depth
  const r = 0.24;
  magCross.moveTo(-hz + r, -hy);
  magCross.lineTo(hz - r, -hy);
  magCross.quadraticCurveTo(hz, -hy, hz, -hy + r);
  magCross.lineTo(hz, hy - r);
  magCross.quadraticCurveTo(hz, hy, hz - r, hy);
  magCross.lineTo(-hz + r, hy);
  magCross.quadraticCurveTo(-hz, hy, -hz, hy - r);
  magCross.lineTo(-hz, -hy + r);
  magCross.quadraticCurveTo(-hz, -hy, -hz + r, -hy);

  const magCavity = new THREE.Path();
  const iz = 0.98;
  const iy = 1.34;
  magCavity.moveTo(-iz, -iy);
  magCavity.lineTo(-iz, iy);
  magCavity.lineTo(iz, iy);
  magCavity.lineTo(iz, -iy);
  magCavity.closePath();
  magCross.holes.push(magCavity);

  const upperTube = extrudeAlongX(
    magCross,
    -8.1,
    16.55,
    VECTOR_CHARCOAL_POLY,
    0.04,
    6
  );

  // Flared Kriss MagEx2 Combat FDE lower polymer extension sleeve (`local X ∈ [-8.10, -1.20]`)
  const sleeveShape = new THREE.Shape();
  const sz = 1.42;
  const sy = 1.82;
  sleeveShape.moveTo(-sz + 0.25, -sy);
  sleeveShape.lineTo(sz - 0.25, -sy);
  sleeveShape.quadraticCurveTo(sz, -sy, sz, -sy + 0.25);
  sleeveShape.lineTo(sz, sy - 0.25);
  sleeveShape.quadraticCurveTo(sz, sy, sz - 0.25, sy);
  sleeveShape.lineTo(-sz + 0.25, sy);
  sleeveShape.quadraticCurveTo(-sz, sy, -sz, sy - 0.25);
  sleeveShape.lineTo(-sz, -sy + 0.25);
  sleeveShape.quadraticCurveTo(-sz, -sy, -sz + 0.25, -sy);

  const sleeveHole = new THREE.Path();
  sleeveHole.moveTo(-1.2, -1.58);
  sleeveHole.lineTo(-1.2, 1.58);
  sleeveHole.lineTo(1.2, 1.58);
  sleeveHole.lineTo(1.2, -1.58);
  sleeveHole.closePath();
  sleeveShape.holes.push(sleeveHole);

  const magExSleeve = extrudeAlongX(
    sleeveShape,
    -8.05,
    6.85,
    VECTOR_FDE_POLYMER,
    0.05,
    6
  );

  // Hardened steel feed-lip inserts at top mouth (`local X = +8.35`) + MagEx2 grip ribs
  const parts: THREE.BufferGeometry[] = [upperTube, magExSleeve];
  parts.push(
    createChamferedBox(0.85, 2.35, 0.24, 0.03, VECTOR_STAINLESS).translate(
      8.15,
      -0.1,
      -1.08
    ),
    createChamferedBox(0.85, 2.35, 0.24, 0.03, VECTOR_STAINLESS).translate(
      8.15,
      -0.1,
      1.08
    )
  );
  for (let rIdx = 0; rIdx < 4; rIdx++) {
    const rx = -7.1 + rIdx * 1.55;
    parts.push(
      createChamferedBox(0.42, 3.74, 0.16, 0.03, VECTOR_FDE_RIB).translate(
        rx,
        0,
        -1.44
      ),
      createChamferedBox(0.42, 3.74, 0.16, 0.03, VECTOR_FDE_RIB).translate(
        rx,
        0,
        1.44
      )
    );
  }

  return sanitizeVectorMesh(
    applyVectorInternalsUVs(mergeParts(parts), 'mag'),
    true
  );
}

/**
 * M-02 (`vector_mag_follower`): High-Visibility Orange Stepped .45 ACP Anti-Tilt Polymer Follower
 * (`assembledPos: [7.65, -3.78, 0]`, `assembledRot: [0, 0, VECTOR_MAG_ANGLE]`).
 */
export function buildVectorMagFollowerGeometry(): THREE.BufferGeometry {
  const baseBlock = createChamferedBox(
    1.45,
    2.48,
    1.78,
    0.06,
    VECTOR_FOLLOWER_ORANGE
  );
  const stepRidge = createChamferedBox(
    0.46,
    2.32,
    0.82,
    0.04,
    VECTOR_FOLLOWER_ORANGE
  );
  stepRidge.translate(0.84, 0.04, -0.38);

  const slideStopTab = createChamferedBox(
    0.44,
    0.48,
    0.34,
    0.03,
    VECTOR_FOLLOWER_ORANGE
  );
  slideStopTab.translate(0.72, 1.12, -0.78);

  return sanitizeVectorMesh(mergeParts([baseBlock, stepRidge, slideStopTab]));
}

/**
 * M-03 (`vector_mag_spring`): Angled `66°` Helical Magazine Drive Spring
 * (`assembledPos: [1.45, -17.70, 0]`, `assembledRot: [0, 0, VECTOR_MAG_ANGLE]`).
 * Pure X-axis `createWatertightHelicalSpring` (`start: 0.0` at baseplate -> `end: 14.80` at follower)
 * carrying valid `aSpringParam` `w = 1`!
 */
export function buildVectorMagSpringGeometry(): THREE.BufferGeometry {
  const spring = createWatertightHelicalSpring(
    {
      axis: 'x',
      start: 0.0,
      end: 14.8,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.68,
      wireRadius: 0.058,
      coils: 16,
      radialSegments: 8,
      tubularSegmentsPerCoil: 16,
    },
    VECTOR_SPRING_STEEL
  );

  const floorLockPlate = createChamferedBox(
    0.26,
    2.18,
    1.56,
    0.03,
    VECTOR_NITRIDE_STEEL
  );
  floorLockPlate.translate(0.08, 0, 0);

  return sanitizeVectorMesh(mergeParts([spring, floorLockPlate]));
}

/**
 * M-04 (`vector_mag_baseplate`): Extended Kriss MagEx2 Ribbed Impact Bumper Baseplate
 * (`assembledPos: [1.25, -18.15, 0]`, `assembledRot: [0, 0, VECTOR_MAG_ANGLE]`).
 */
export function buildVectorMagBaseplateGeometry(): THREE.BufferGeometry {
  const bumperShoe = createChamferedBox(
    1.32,
    3.96,
    3.02,
    0.1,
    VECTOR_CHARCOAL_POLY
  );
  const toeLip = createChamferedBox(
    0.58,
    0.68,
    2.88,
    0.06,
    VECTOR_FDE_POLYMER
  );
  toeLip.translate(0.68, -1.78, 0);

  const lockDetentPin = createBeveledCylinder(
    0.22,
    0.22,
    0.34,
    0.02,
    16,
    VECTOR_STAINLESS
  )
    .rotateZ(Math.PI / 2)
    .translate(-0.56, 0, 0);

  return sanitizeVectorMesh(
    applyVectorInternalsUVs(
      mergeParts([bumperShoe, toeLip, lockDetentPin]),
      'mag'
    ),
    true
  );
}
