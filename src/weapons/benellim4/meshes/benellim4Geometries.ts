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
  createBeveledCylinder,
  createChamferedBox,
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';

// Authentic Benelli M4 Super 90 / U.S. M1014 palette (all well above Khronos 0.018 linear floor)
export const BM4_RECEIVER_ANODIZED = '#363c46';
export const BM4_RECEIVER_CHAMFER = '#525d6d';
export const BM4_PARKERIZED_STEEL = '#3d4541';
export const BM4_DARK_STEEL = '#434c59';
export const BM4_INNER_DARK = '#252b34';
export const BM4_STAINLESS = '#cbd5e1';
export const BM4_HARD_CHROME = '#e2e8f0';
export const BM4_SPRING_STEEL = '#94a3b8';
export const BM4_POLYMER_BLACK = '#313741';
export const BM4_POLYMER_GRIP = '#2b303a';
export const BM4_RUBBER_PAD = '#262a32';
export const BM4_FOLLOWER_RED = '#ea580c';
export const BM4_SAFETY_CRIMSON = '#dc2626';
export const BM4_TRITIUM_WHITE = '#f1f5f9';
export const BM4_BRASS_ACCENT = '#d4a738';

/** M1014 stock recoil-tube downward drop angle (14.0° = 0.244 rad around +Z). */
export const BENELLIM4_STOCK_ANGLE = 0.244;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

/**
 * Strips any zero-area CSG sliver triangles, preserves `aCurvature` & `aSpringParam`,
 * enforces exact unit-length normals (`|n| = 1`), and normalizes UVs strictly into `[0, 1]`.
 */
export function sanitizeBenelliMesh(
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
        cArr[di * 3] = col ? col.getX(si) : 0.5;
        cArr[di * 3 + 1] = col ? col.getY(si) : 0.5;
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.5;
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

  const outPos = out.getAttribute('position');
  const outNorm = out.getAttribute('normal');
  const nTotal = outPos.count;
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

  // Ensure non-atlas parts ALSO carry finite [0, 1] box-projected UVs with wide island span
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

/**
 * Strictly watertight solid or hollow revolution along `+X` from `(r, x)` profile.
 * Shared trig samples eliminate seam gaps; zero-area pole triangles are automatically skipped.
 */
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
      // Revolve around +X: y = -r*cos(a), z = r*sin(a) (exact rigid -90° Z rotation of +Y lathe)
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
  chamfer = 0.02,
  curveSegments = 8
): THREE.BufferGeometry {
  const c = Math.min(Math.max(chamfer, 0), len * 0.28);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-3, len - 2 * c),
    curveSegments,
    bevelEnabled: c > 1e-4,
    bevelThickness: c,
    bevelSize: c,
    bevelOffset: -c,
    bevelSegments: 1,
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate(x0 + len - c, 0, 0);
  return paintGeometry(geo, color);
}

/** Extrudes an `(X, Y)` profile symmetrically along `Z` around `zCenter`. */
export function extrudeAlongZ(
  shape: THREE.Shape,
  zCenter: number,
  thickness: number,
  color: string,
  chamfer = 0.02,
  curveSegments = 10
): THREE.BufferGeometry {
  const c = Math.min(Math.max(chamfer, 0), thickness * 0.28);
  const depth = Math.max(1e-3, thickness - 2 * c);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments,
    bevelEnabled: c > 1e-4,
    bevelThickness: c,
    bevelSize: c,
    bevelOffset: -c,
    bevelSegments: 1,
  });
  geo.translate(0, 0, zCenter - depth * 0.5);
  return paintGeometry(geo, color);
}

/** Merges non-overlapping cutter solids into ONE brush so `csgSubtract` runs a single pass. */
export function mergeCutters(
  cutters: THREE.BufferGeometry[],
  color: string
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
  return paintGeometry(mergeGeometries(prepared, false), color);
}

// ============================================================================
// 1. PRECISION 2K UV ATLAS UNWRAPPERS (`benellim4_receiver_*` & `benellim4_furniture_*`)
// ============================================================================

/**
 * Unwraps MIL-STD Type-III Anodized Receiver & Trigger Housing onto Band A (`v ∈ [0.04, 0.54]`)
 * of `benellim4_receiver_*` (2048×1024).
 */
export function applyBenelliReceiverUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = Math.max(1e-3, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-3, bb.max.y - bb.min.y);
  const spanZ = Math.max(1e-3, bb.max.z - bb.min.z);
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let side: 'left' | 'right' | 'inner' = 'inner';
    if (fnz < -0.34 && cz < -0.2) side = 'left';
    else if (fnz > 0.34 && cz > 0.2) side = 'right';

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const xN = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const yN = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      const zN = clamp01((pos.getZ(vi) - bb.min.z) / spanZ);
      let u: number;
      let v: number;
      if (side === 'left') {
        u = 0.04 + (1.0 - xN) * 0.92;
        v = 0.06 + yN * 0.22;
      } else if (side === 'right') {
        u = 0.04 + xN * 0.92;
        v = 0.31 + yN * 0.22;
      } else {
        u = 0.04 + xN * 0.72;
        v = 0.015 + zN * 0.035;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps MIL-STD-1913 Picatinny Rail & LPA Ghost-Ring Sights onto Band B (`v ∈ [0.56, 0.78]`)
 * of `benellim4_receiver_*`.
 */
export function applyBenelliRailSightUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = Math.max(1e-3, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-3, bb.max.y - bb.min.y);
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr } = triInfo(pos, col, i, i + 1, i + 2);
    const isBright = cr > 0.45;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const xN = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const yN = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      const z = pos.getZ(vi);
      let u: number;
      let v: number;
      if (isBright) {
        u = 0.78 + fractPos((pos.getX(vi) + z) * 0.35) * 0.18;
        v = 0.58 + yN * 0.19;
      } else {
        u = 0.04 + xN * 0.71;
        v = 0.57 + yN * 0.2;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Parkerized 18.5" Barrel, ARGO Manifold/Plugs & Tubular Magazine onto Band C
 * (`v ∈ [0.80, 0.98]`) of `benellim4_receiver_*`.
 */
export function applyBenelliParkerizedUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = Math.max(1e-3, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-3, bb.max.y - bb.min.y);
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr } = triInfo(pos, col, i, i + 1, i + 2);
    const isChrome = cr > 0.48;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const xN = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const yN = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      let u: number;
      const v = 0.8 + yN * 0.175;
      if (isChrome) {
        u = 0.79 + xN * 0.18;
      } else {
        u = 0.04 + xN * 0.72;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Polymer Forend, Pistol-Grip + Recoil Tube, or M1014 Telestock onto `benellim4_furniture_*`.
 */
export function applyBenelliFurnitureUVs(
  geo: THREE.BufferGeometry,
  zone: 'forend' | 'grip_tube' | 'telestock'
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = Math.max(1e-3, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-3, bb.max.y - bb.min.y);
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr, cg, cb } = triInfo(pos, col, i, i + 1, i + 2);
    const isSteelTube = cr > 0.14 && cb > cr;
    const isRubberPad = cr < 0.055 && cg < 0.065;
    const isCrimsonHull = cr > cg * 1.8 && cr > 0.18;
    const isBrass = cr > 0.35 && cg > 0.22 && cb < 0.15;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const xN = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const yN = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      let u: number;
      let v: number;
      if (isCrimsonHull) {
        u = 0.05 + xN * 0.56;
        v = 0.78 + yN * 0.18;
      } else if (isBrass) {
        u = 0.66 + xN * 0.29;
        v = 0.78 + yN * 0.18;
      } else if (zone === 'forend') {
        u = 0.04 + xN * 0.92;
        v = 0.03 + yN * 0.22;
      } else if (zone === 'grip_tube') {
        if (isSteelTube) {
          u = 0.72 + xN * 0.25;
          v = 0.28 + yN * 0.15;
        } else {
          u = 0.05 + xN * 0.62;
          v = 0.28 + yN * 0.15;
        }
      } else {
        if (isRubberPad) {
          u = 0.7 + yN * 0.26;
          v = 0.47 + xN * 0.25;
        } else {
          u = 0.05 + xN * 0.6;
          v = 0.47 + yN * 0.25;
        }
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 2. 'slide' GROUP — 18.5" BARREL, TWIN ARGO PISTONS & ROTATING BOLT (9 PARTS)
// ============================================================================

/**
 * B-01: 18.5" (47.0 cm) Chrome-Lined 12-Gauge Barrel w/ Integral Dual-Cylinder ARGO Gas Manifold
 * (`assembledPos: [0, 1.35, 0]`, fixed barrel!). Spans local `X ∈ [+6.50, +53.50]`.
 */
export function buildBenelliM4BarrelGeometry(): THREE.BufferGeometry {
  // 1. Hollow 18.5" 12-gauge smoothbore barrel (18.5 mm bore = r 0.925, 3" chamber r 1.03)
  const mainBarrel = revolveClosedX(
    [
      [1.06, 6.5],
      [1.38, 6.5], // Hard-chrome barrel extension breech face
      [1.38, 10.18],
      [1.44, 10.22], // Receiver shoulder step
      [1.44, 15.2], // Heavy 3-inch Magnum chamber reinforcement
      [1.26, 17.8], // Taper ahead of chamber
      [1.18, 24.5],
      [1.13, 48.5], // Crio-treated combat contour
      [1.16, 48.6],
      [1.16, 49.8], // Front support collar band
      [1.12, 49.9],
      [1.12, 53.44],
      [1.09, 53.5], // Muzzle outer bevel
      [0.955, 53.5], // Internal Mobilchoke rim
      [0.925, 53.38], // Recessed muzzle crown dish -> Ø18.5mm chrome bore
      [0.925, 15.8], // 18.5mm smoothbore
      [1.03, 14.4], // Lengthened forcing cone into 76mm (3") chamber
      [1.03, 6.56],
      [1.06, 6.5], // Polished chamber mouth bevel (closes loop)
    ],
    32,
    BM4_PARKERIZED_STEEL
  );

  // Hard-chrome barrel extension locking collar & upper/lower 2-lug locking abutments
  const chromeExtension = revolveClosedX(
    [
      [1.375, 6.52],
      [1.405, 6.52],
      [1.405, 9.85],
      [1.375, 9.85],
      [1.375, 6.52],
    ],
    28,
    BM4_HARD_CHROME
  );
  const feedHood = createChamferedBox(1.85, 0.42, 1.35, 0.04, BM4_HARD_CHROME);
  feedHood.translate(7.42, 1.32, 0);

  // 2. Twin Symmetrical ARGO Gas Cylinders mounted side-by-side (`Z = ±1.18, local Y = -1.23`)
  //    immediately forward of the chamber (`X ∈ [14.2, 22.8]`)!
  const buildArgoCylinder = (zSign: -1 | 1): THREE.BufferGeometry => {
    const cyl = revolveClosedX(
      [
        [0.42, 14.2],
        [0.62, 14.2],
        [0.64, 14.45],
        [0.64, 22.55],
        [0.61, 22.8],
        [0.42, 22.8],
        [0.42, 14.2],
      ],
      24,
      BM4_PARKERIZED_STEEL
    );
    cyl.translate(0, -1.23, zSign * 1.18);
    return cyl;
  };
  const argoBridge = createChamferedBox(
    5.6,
    1.05,
    2.65,
    0.08,
    BM4_PARKERIZED_STEEL
  );
  argoBridge.translate(17.8, -0.78, 0);

  // 3. Front barrel support guide ring clamping around underbarrel mag tube (`local Y = -2.60`)
  const frontRing = revolveClosedX(
    [
      [1.29, 48.65],
      [1.52, 48.65],
      [1.52, 49.75],
      [1.29, 49.75],
      [1.29, 48.65],
    ],
    28,
    BM4_PARKERIZED_STEEL
  );
  frontRing.translate(0, -2.6, 0);
  const frontWeb = createChamferedBox(
    1.04,
    0.72,
    0.92,
    0.05,
    BM4_PARKERIZED_STEEL
  );
  frontWeb.translate(49.2, -1.32, 0);

  return sanitizeBenelliMesh(
    applyBenelliParkerizedUVs(
      mergeParts([
        mainBarrel,
        chromeExtension,
        feedHood,
        buildArgoCylinder(-1),
        buildArgoCylinder(1),
        argoBridge,
        frontRing,
        frontWeb,
      ])
    ),
    true
  );
}

/**
 * B-02: Twin Symmetrical Stainless Fluted Short-Stroke ARGO Tappet Pistons
 * (`assembledPos: [15.2, 0.12, 0]`, stroke `-1.50 cm` at `Z = ±1.18`).
 */
export function buildBenelliM4ArgoPistonsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const zSign of [-1, 1] as const) {
    const zOff = zSign * 1.18;
    // Rear tappet actuator stem + fluted gas-seal piston head + front gas cup
    const pistonBody = revolveClosedX(
      [
        [0.0, -8.8],
        [0.21, -8.8], // Rear tappet anvil face contacting bolt carrier shoulder at X = +6.4
        [0.23, -8.72],
        [0.23, -1.4], // Actuator rod passing through receiver bulkhead
        [0.39, -1.15], // Rear stop shoulder
        [0.39, 1.35],
        [0.33, 1.42], // Carbon-scraping relief groove 1
        [0.33, 2.35],
        [0.39, 2.42], // Central gas-seal land
        [0.39, 3.65],
        [0.34, 3.72], // Relief groove 2
        [0.34, 4.45],
        [0.4, 4.52], // Front high-pressure gas piston head
        [0.4, 5.4],
        [0.26, 5.4], // Hollow front gas-expansion cup lip
        [0.22, 4.72],
        [0.0, 4.72], // Cup floor (closes solid revolution)
      ],
      24,
      BM4_STAINLESS
    );
    pistonBody.translate(0, 0, zOff);
    parts.push(pistonBody);

    // 4 longitudinal self-cleaning carbon flutes along the piston head
    for (let f = 0; f < 4; f++) {
      const ang = (f * Math.PI) / 2 + Math.PI / 4;
      const rib = createChamferedBox(2.1, 0.07, 0.07, 0.015, BM4_HARD_CHROME);
      rib.translate(2.5, Math.cos(ang) * 0.37, zOff + Math.sin(ang) * 0.37);
      parts.push(rib);
    }
  }
  return sanitizeBenelliMesh(mergeParts(parts));
}

/**
 * B-03: Twin Knurled Front ARGO Gas Cylinder End-Caps / Self-Regulating Exhaust Valves
 * (`assembledPos: [23.1, 0.12, 0]`, `Z = ±1.18`).
 */
export function buildBenelliM4ArgoPlugsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const zSign of [-1, 1] as const) {
    const zOff = zSign * 1.18;
    const plug = revolveClosedX(
      [
        [0.0, -1.25],
        [0.36, -1.25], // Rear valve spigot inside ARGO cylinder
        [0.39, -1.18],
        [0.39, -0.25], // Threaded sealing journal
        [0.58, -0.18], // Front flange shoulder
        [0.62, -0.12],
        [0.62, 0.88], // Heavy diamond-knurled grip drum
        [0.48, 0.96],
        [0.48, 1.32], // Hex wrench nose boss
        [0.18, 1.36],
        [0.18, 0.92], // Self-regulating over-pressure exhaust vent bore
        [0.0, 0.92],
      ],
      24,
      BM4_PARKERIZED_STEEL
    );
    plug.translate(0, 0, zOff);
    parts.push(plug);

    // 8 axial grip serration flutes on knurled cap drum
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4;
      const flute = createChamferedBox(
        0.86,
        0.065,
        0.065,
        0.015,
        BM4_RECEIVER_CHAMFER
      );
      flute.translate(0.38, Math.cos(ang) * 0.61, zOff + Math.sin(ang) * 0.61);
      parts.push(flute);
    }
  }
  return sanitizeBenelliMesh(applyBenelliParkerizedUVs(mergeParts(parts)), true);
}

/**
 * B-04: Heavy Machined Steel Bolt Carrier w/ Dual Forward ARGO Impact Shoulders & Helical Cam Slot
 * (`assembledPos: [1.2, 1.35, 0]`). Local `X ∈ [-8.85, +5.15]` -> World `X ∈ [-7.65, +6.35]`.
 */
export function buildBenelliM4BoltCarrierGeometry(): THREE.BufferGeometry {
  const mainSlab = createChamferedBox(9.6, 1.56, 2.18, 0.08, BM4_DARK_STEEL);
  mainSlab.translate(-0.2, 0.08, 0);

  // Dual forward ARGO piston impact towers (`Z = ±1.18, local Y = -1.23, front at X = +5.15`)
  const impactTowerL = createChamferedBox(
    2.45,
    1.18,
    0.66,
    0.05,
    BM4_RECEIVER_CHAMFER
  );
  impactTowerL.translate(3.92, -0.82, -1.06);
  const impactTowerR = createChamferedBox(
    2.45,
    1.18,
    0.66,
    0.05,
    BM4_RECEIVER_CHAMFER
  );
  impactTowerR.translate(3.92, -0.82, 1.06);
  const anvilPadL = createBeveledCylinder(0.26, 0.26, 0.36, 0.03, 18, BM4_STAINLESS)
    .rotateZ(Math.PI / 2)
    .translate(5.02, -1.23, -1.18);
  const anvilPadR = createBeveledCylinder(0.26, 0.26, 0.36, 0.03, 18, BM4_STAINLESS)
    .rotateZ(Math.PI / 2)
    .translate(5.02, -1.23, 1.18);

  const carrierSolid = csgUnion([
    mainSlab,
    impactTowerL,
    impactTowerR,
  ]);

  // Bore axial bolt-stem tunnel + angled 38° helical cam slot + bottom hammer channel
  const cutters = mergeCutters(
    [
      new THREE.CylinderGeometry(0.68, 0.68, 10.6, 24)
        .rotateZ(Math.PI / 2)
        .translate(0, 0, 0),
      // Angled helical cam track on upper carrier roof (`X ∈ [1.1, 2.7]`)
      new THREE.BoxGeometry(1.75, 0.65, 0.78)
        .rotateY(0.46)
        .translate(1.95, 0.68, 0.08),
      // Right-hand charging-handle mortise
      new THREE.CylinderGeometry(0.28, 0.28, 0.95, 16)
        .rotateX(Math.PI / 2)
        .translate(2.4, 0.15, 0.85),
      // Bottom hammer-cocking & shell clearance trough
      new THREE.BoxGeometry(7.2, 0.56, 1.06).translate(-0.8, -0.58, 0),
    ],
    BM4_INNER_DARK
  );

  const machinedCarrier = csgSubtract(carrierSolid, [cutters]);

  // Hinged rear recoil link rod ("rat-tail") angling into stock recoil tube
  const linkFork = createChamferedBox(1.1, 0.44, 0.64, 0.04, BM4_DARK_STEEL);
  linkFork.translate(-5.15, -0.22, 0);
  const linkPin = createBeveledCylinder(0.11, 0.11, 0.82, 0.02, 14, BM4_STAINLESS)
    .rotateX(Math.PI / 2)
    .translate(-5.1, -0.22, 0);
  const linkRod = createBeveledCylinder(0.18, 0.21, 3.85, 0.03, 16, BM4_STAINLESS)
    .rotateZ(Math.PI / 2 + BENELLIM4_STOCK_ANGLE)
    .translate(-6.95, -0.68, 0);

  return sanitizeBenelliMesh(
    mergeParts([
      machinedCarrier,
      anvilPadL,
      anvilPadR,
      linkFork,
      linkPin,
      linkRod,
    ])
  );
}

/**
 * B-05: Hard-Chrome 2-Lug Rotating Bolt Head w/ Heavy Claw Extractor
 * (`assembledPos: [5.4, 1.35, 0]`, rotates `+0.66 rad` around `+X` on unlock!).
 */
export function buildBenelliM4BoltHeadGeometry(): THREE.BufferGeometry {
  // Hollow bolt stem + 12-gauge recessed breech face (`rFace = 1.04`, axial firing-pin channel `r = 0.13`)
  const boltCore = revolveClosedX(
    [
      [0.13, -4.15],
      [0.61, -4.15], // Cylindrical tail stem inside carrier
      [0.61, -0.05],
      [1.02, 0.08], // Bolt head collar step
      [1.02, 1.42],
      [0.98, 1.46], // Outer front chamfer
      [0.84, 1.46], // Bolt rim ring
      [0.82, 1.32], // Recessed 12ga headstamp cup
      [0.13, 1.32], // Firing pin aperture
      [0.13, -4.15],
    ],
    28,
    BM4_HARD_CHROME
  );

  // Two opposing massive radial Benelli rotating locking lugs (top & bottom at X ∈ [0.32, 1.26])
  const lugTop = createChamferedBox(0.94, 0.44, 0.88, 0.05, BM4_HARD_CHROME);
  lugTop.translate(0.79, 1.14, 0);
  const lugBot = createChamferedBox(0.94, 0.44, 0.88, 0.05, BM4_HARD_CHROME);
  lugBot.translate(0.79, -1.14, 0);

  // Right-side (+Z) heavy tempered spring-steel claw extractor
  const extractor = createChamferedBox(1.28, 0.34, 0.24, 0.03, BM4_DARK_STEEL);
  extractor.translate(0.84, 0.12, 0.96);
  const extractorHook = createChamferedBox(0.18, 0.36, 0.28, 0.02, BM4_STAINLESS);
  extractorHook.translate(1.42, 0.12, 0.88);

  return sanitizeBenelliMesh(
    mergeParts([boltCore, lugTop, lugBot, extractor, extractorHook])
  );
}

/**
 * B-06: Cylindrical Hardened Steel Bolt Cam Pin (`assembledPos: [3.2, 2.08, 0]`).
 */
export function buildBenelliM4CamPinGeometry(): THREE.BufferGeometry {
  const shaft = revolveClosedX(
    [
      [0.0, 0.0],
      [0.28, 0.0],
      [0.31, 0.04],
      [0.31, 1.02],
      [0.44, 1.06], // Upper cam-track roller collar
      [0.44, 1.42],
      [0.39, 1.47],
      [0.0, 1.47],
    ],
    24,
    BM4_DARK_STEEL
  );
  // Rotate shaft from +X to +Y so pin stands vertically (`local Y ∈ [-0.85, +0.62]`)
  shaft.rotateZ(Math.PI / 2);
  shaft.translate(0, -0.85, 0);

  const indexFlat = createChamferedBox(0.62, 0.28, 0.56, 0.03, BM4_STAINLESS);
  indexFlat.translate(0, 0.48, 0);

  return sanitizeBenelliMesh(mergeParts([shaft, indexFlat]));
}

/**
 * B-07: Long Floating Steel Firing Pin (`assembledPos: [0.95, 1.35, 0]`).
 */
export function buildBenelliM4FiringPinGeometry(): THREE.BufferGeometry {
  const pin = revolveClosedX(
    [
      [0.0, -5.92],
      [0.21, -5.92], // Rear hammer-strike button
      [0.24, -5.86],
      [0.24, -5.15],
      [0.12, -5.08], // Rear shaft inside carrier
      [0.12, 0.85],
      [0.22, 0.92], // Anti-inertia return-spring stop collar
      [0.22, 1.24],
      [0.105, 1.32], // Mid shaft through cam pin & bolt stem
      [0.105, 4.45],
      [0.055, 5.78], // Tapered striker needle
      [0.035, 5.9],
      [0.0, 5.92], // Hemispherical primer tip
    ],
    20,
    BM4_STAINLESS
  );
  return sanitizeBenelliMesh(pin);
}

/**
 * B-08: Knurled Rotating Tactical `+Z` Combat Bolt Handle (`assembledPos: [3.6, 1.50, 1.65]`).
 */
export function buildBenelliM4ChargingHandleGeometry(): THREE.BufferGeometry {
  // Built along +X then rotated +90° around Y so handle projects outward along +Z
  const handle = revolveClosedX(
    [
      [0.0, -0.88],
      [0.22, -0.88], // Detent locking shank inside bolt carrier
      [0.25, -0.82],
      [0.25, -0.05],
      [0.44, 0.08], // Flared combat drum shoulder
      [0.48, 0.16],
      [0.48, 0.42],
      [0.43, 0.46], // Tactile circumferential groove 1
      [0.48, 0.5],
      [0.48, 0.78],
      [0.43, 0.82], // Groove 2
      [0.48, 0.86],
      [0.48, 1.18],
      [0.42, 1.26],
      [0.0, 1.28],
    ],
    24,
    BM4_DARK_STEEL
  );
  handle.rotateY(-Math.PI / 2);

  const detentRing = createChamferedBox(0.32, 0.14, 0.32, 0.02, BM4_STAINLESS);
  detentRing.translate(0, 0, -0.62);

  return sanitizeBenelliMesh(mergeParts([handle, detentRing]));
}

/**
 * B-09: Angled Stock-Tube Helical Recoil Spring (`assembledPos: [-29.8, -4.48, 0]`,
 * `assembledRot: [0, 0, BENELLIM4_STOCK_ANGLE]`).
 * Pure X-axis `createHelicalSpring` (`start: 0.0` rear pinned plug -> `end: 21.6` front plunger)
 * preserving 100% constant wire diameter and `aSpringParam`!
 */
export function buildBenelliM4RecoilSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 21.6,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.56,
      wireRadius: 0.075,
      coils: 28,
      radialSegments: 9,
      tubularSegmentsPerCoil: 16,
    }),
    BM4_SPRING_STEEL
  );
  const plungerCup = revolveClosedX(
    [
      [0.24, 21.35],
      [0.62, 21.35],
      [0.62, 21.85],
      [0.42, 22.05],
      [0.24, 22.05],
      [0.24, 21.35],
    ],
    20,
    BM4_STAINLESS
  );
  return sanitizeBenelliMesh(mergeParts([spring, plungerCup]));
}
