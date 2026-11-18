import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createBeveledCylinder,
  createChamferedBox,
  createHelicalSpring,
  type HelicalSpringOptions,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  CURVATURE_ATTRIBUTE,
  SPRING_PARAM_ATTRIBUTE,
} from '../../../engine/geometry/curvatureBuilder';
import { clampUv01 } from '../../../engine/geometry/uvUnwrap';

/**
 * Authentic WWII Springfield Armory U.S. Rifle, Cal. .30, M1 Garand palette.
 * Every color stays well above the Khronos PBR anti-black-crush linear luma floor (>= 0.018).
 */
export const GARAND_PALETTE = {
  PARKERIZED_STEEL: '#3e4541', // WWII manganese-phosphate greenish-slate
  PARKERIZED_DARK: '#2d3330', // Deep oiled phosphate cavity
  PARKERIZED_MID: '#4b534e', // Machined phosphate flat
  STAINLESS_GAS: '#586063', // Matte blackened 410 stainless gas cylinder
  WHITE_PISTON: '#cbd5e1', // Bright centerless-ground stainless op-rod piston & bolt face
  BURNISHED_LUG: '#94a3b8', // Silver-worn rotating bolt lugs & raceways
  SPRING_WIRE: '#8b97a8', // Tempered music-wire / en-bloc spring steel
  ENBLOC_CHARCOAL: '#363b3e', // Stamped spring-steel 8-rd en-bloc clip
  WALNUT_HEART: '#5e3b24', // Linseed-oiled American black walnut heartwood
  WALNUT_DARK: '#472c1a', // Deep walnut end-grain / bedding mortise
  WALNUT_WARM: '#70472c', // Quarter-sawn walnut comb highlight
  BRASS_CARTRIDGE: '#c99a3b', // .30-06 M2 Ball brass case accent
  COPPER_JACKET: '#b85d38', // 150gr gilding-metal spitzer bullet jacket
} as const;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

/**
 * Normalizes box-projected UVs onto [0.04, 0.96] per triangle dominant normal
 * so every non-atlas part strictly obeys UV ∈ [0, 1] with non-collapsed U/V spans.
 */
export function normalizeBoxUVs01(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = Math.max(1e-4, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-4, bb.max.y - bb.min.y);
  const spanZ = Math.max(1e-4, bb.max.z - bb.min.z);

  const pos = geo.getAttribute('position');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    _vA.fromBufferAttribute(pos, i);
    _vB.fromBufferAttribute(pos, i + 1);
    _vC.fromBufferAttribute(pos, i + 2);
    _e1.subVectors(_vB, _vA);
    _e2.subVectors(_vC, _vA);
    _fn.crossVectors(_e1, _e2);
    const ax = Math.abs(_fn.x);
    const ay = Math.abs(_fn.y);
    const az = Math.abs(_fn.z);

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x01 = (pos.getX(vi) - bb.min.x) / spanX;
      const y01 = (pos.getY(vi) - bb.min.y) / spanY;
      const z01 = (pos.getZ(vi) - bb.min.z) / spanZ;
      let u: number;
      let v: number;
      if (az >= ax && az >= ay) {
        u = 0.04 + x01 * 0.92;
        v = 0.04 + y01 * 0.92;
      } else if (ay >= ax) {
        u = 0.04 + x01 * 0.92;
        v = 0.04 + z01 * 0.92;
      } else {
        u = 0.04 + z01 * 0.92;
        v = 0.04 + y01 * 0.92;
      }
      uvs[vi * 2] = clampUv01(u);
      uvs[vi * 2 + 1] = clampUv01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Strips any zero-area sliver triangles, enforces exact unit-length normals (|n| = 1),
 * preserves `aCurvature` & `aSpringParam`, and guarantees UV ∈ [0, 1].
 */
export function sanitizeGarandMesh(
  geo: THREE.BufferGeometry,
  hasCustomAtlasUVs = false
): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.getAttribute('position');
  const norm = src.getAttribute('normal');
  const uv = src.getAttribute('uv');
  const col = src.getAttribute('color');
  const curv = src.getAttribute(CURVATURE_ATTRIBUTE);
  const spring = src.getAttribute(SPRING_PARAM_ATTRIBUTE);
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
    const sArr = spring ? new Float32Array(nV * 4) : null;

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

        cArr[di * 3] = col ? col.getX(si) : 0.4;
        cArr[di * 3 + 1] = col ? col.getY(si) : 0.4;
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.4;

        if (kArr && curv) kArr[di] = curv.getX(si);
        if (sArr && spring) {
          sArr[di * 4] = spring.getX(si);
          sArr[di * 4 + 1] = spring.getY(si);
          sArr[di * 4 + 2] = spring.getZ(si);
          sArr[di * 4 + 3] = spring.getW(si);
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

  if (!hasCustomAtlasUVs) {
    normalizeBoxUVs01(out);
  }

  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// ============================================================================
// STRICTLY WATERTIGHT CAD KERNEL (ZERO OPEN EDGES, POSITIVE VOLUME)
// ============================================================================

/**
 * Revolves an `(r, x)` profile around `+X` with shared exact seam trig samples and
 * zero-area pole suppression. Supports both solid profiles (`(0, x0) -> ... -> (0, x1)`)
 * and closed hollow loops (`profile[0]` === `profile[last]`).
 */
export function buildRevolvedX(
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

  const data: number[] = [];
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
    data.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  for (let k = 0; k + 1 < profile.length; k++) {
    const [r0, x0] = profile[k];
    const [r1, x1] = profile[k + 1];
    for (let s = 0; s < seg; s++) {
      const p00y = r0 * cosA[s];
      const p00z = r0 * sinA[s];
      const p01y = r0 * cosA[s + 1];
      const p01z = r0 * sinA[s + 1];
      const p11y = r1 * cosA[s + 1];
      const p11z = r1 * sinA[s + 1];
      const p10y = r1 * cosA[s];
      const p10z = r1 * sinA[s];
      // Outward winding around +X: (+Z) x (+X) = +Y
      pushTri(x0, p00y, p00z, x0, p01y, p01z, x1, p11y, p11z);
      pushTri(x0, p00y, p00z, x1, p11y, p11z, x1, p10y, p10z);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(data), 3)
  );
  geo.computeVertexNormals();
  return paintGeometry(geo, color);
}

/** Extrudes an `(X, Y)` Shape symmetrically along `Z` centered at `zCenter`. */
export function extrudeShapeZ(
  shape: THREE.Shape,
  zCenter: number,
  thickness: number,
  color: string,
  chamfer = 0.02,
  curveSegments = 10
): THREE.BufferGeometry {
  const c = Math.min(Math.max(chamfer, 0), thickness * 0.28);
  const depth = Math.max(2e-3, thickness - 2 * c);
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

/** Extrudes a `(Z, Y)` cross-section along `+X` from `x0` to `x0 + len`. */
export function extrudeShapeX(
  shape: THREE.Shape,
  x0: number,
  len: number,
  color: string,
  chamfer = 0.02,
  curveSegments = 10
): THREE.BufferGeometry {
  const c = Math.min(Math.max(chamfer, 0), len * 0.28);
  const depth = Math.max(2e-3, len - 2 * c);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
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

/** Extrudes an `(X, Z)` footprint vertically along `+Y` from `y0` to `y0 + height`. */
export function extrudeShapeY(
  shape: THREE.Shape,
  y0: number,
  height: number,
  color: string,
  chamfer = 0.02,
  curveSegments = 10
): THREE.BufferGeometry {
  const c = Math.min(Math.max(chamfer, 0), height * 0.28);
  const depth = Math.max(2e-3, height - 2 * c);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments,
    bevelEnabled: c > 1e-4,
    bevelThickness: c,
    bevelSize: c,
    bevelOffset: -c,
    bevelSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0 + c, 0);
  return paintGeometry(geo, color);
}

/**
 * Strictly watertight Bishop-frame swept circular tube with planar end caps.
 */
export function buildWatertightTube(
  points: readonly THREE.Vector3[],
  radius: number | ((u: number) => number),
  radialSegments: number,
  color: string,
  closedLoop = false
): THREE.BufferGeometry {
  const nPts = points.length;
  const rSeg = Math.max(6, Math.floor(radialSegments));
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < nPts; i++) {
    const t = new THREE.Vector3();
    if (closedLoop) {
      t.subVectors(points[(i + 1) % nPts], points[(i - 1 + nPts) % nPts]);
    } else if (i === 0) {
      t.subVectors(points[1], points[0]);
    } else if (i === nPts - 1) {
      t.subVectors(points[nPts - 1], points[nPts - 2]);
    } else {
      t.subVectors(points[i + 1], points[i - 1]);
    }
    if (t.lengthSq() < 1e-12) t.set(1, 0, 0);
    else t.normalize();
    tangents.push(t);
  }

  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];
  const firstT = tangents[0];
  const ref =
    Math.abs(firstT.z) < 0.85
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0);
  const n0 = new THREE.Vector3().crossVectors(ref, firstT).normalize();
  const b0 = new THREE.Vector3().crossVectors(firstT, n0).normalize();
  normals.push(n0);
  binormals.push(b0);

  const rotAxis = new THREE.Vector3();
  for (let i = 1; i < nPts; i++) {
    const prevT = tangents[i - 1];
    const currT = tangents[i];
    const nPrev = normals[i - 1].clone();
    rotAxis.crossVectors(prevT, currT);
    const sinA = rotAxis.length();
    if (sinA > 1e-6) {
      rotAxis.divideScalar(sinA);
      const angle = Math.atan2(
        sinA,
        THREE.MathUtils.clamp(prevT.dot(currT), -1, 1)
      );
      nPrev.applyAxisAngle(rotAxis, angle);
    }
    nPrev.sub(currT.clone().multiplyScalar(nPrev.dot(currT))).normalize();
    const bCurr = new THREE.Vector3().crossVectors(currT, nPrev).normalize();
    normals.push(nPrev);
    binormals.push(bCurr);
  }

  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i < nPts; i++) {
    const u = nPts > 1 ? i / (nPts - 1) : 0;
    const rad = typeof radius === 'function' ? radius(u) : radius;
    const ring: THREE.Vector3[] = [];
    for (let s = 0; s < rSeg; s++) {
      const a = (s / rSeg) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      ring.push(
        new THREE.Vector3(
          points[i].x + (normals[i].x * ca + binormals[i].x * sa) * rad,
          points[i].y + (normals[i].y * ca + binormals[i].y * sa) * rad,
          points[i].z + (normals[i].z * ca + binormals[i].z * sa) * rad
        )
      );
    }
    rings.push(ring);
  }

  const data: number[] = [];
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    data.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  const segLimit = closedLoop ? nPts : nPts - 1;
  for (let i = 0; i < segLimit; i++) {
    const r0 = rings[i];
    const r1 = rings[(i + 1) % nPts];
    for (let s = 0; s < rSeg; s++) {
      const sNext = (s + 1) % rSeg;
      pushTri(r0[s], r0[sNext], r1[sNext]);
      pushTri(r0[s], r1[sNext], r1[s]);
    }
  }

  if (!closedLoop) {
    const pStart = points[0];
    const rStart = rings[0];
    for (let s = 0; s < rSeg; s++) {
      const sNext = (s + 1) % rSeg;
      pushTri(pStart, rStart[sNext], rStart[s]);
    }
    const pEnd = points[nPts - 1];
    const rEnd = rings[nPts - 1];
    for (let s = 0; s < rSeg; s++) {
      const sNext = (s + 1) % rSeg;
      pushTri(pEnd, rEnd[s], rEnd[sNext]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(data), 3)
  );
  geo.computeVertexNormals();
  return paintGeometry(geo, color);
}

/**
 * Helical rifling lands or longitudinal barrel splines along `+X` (strictly watertight).
 */
export function buildHelicalLands(opts: {
  count: number;
  boreR: number;
  depth: number;
  width: number;
  x0: number;
  x1: number;
  twistCm: number;
  color: string;
  segments?: number;
  phase?: number;
}): THREE.BufferGeometry {
  const { count, boreR, depth, width, x0, x1, twistCm, color } = opts;
  const len = x1 - x0;
  const segs =
    opts.segments ??
    Math.max(4, Math.ceil((Math.abs(len / twistCm) * 360) / 16));
  const embed = Math.min(0.012, depth * 0.5);
  const lands: THREE.BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const base = (opts.phase ?? 0) + (k * Math.PI * 2) / count;
    const box = new THREE.BoxGeometry(len, depth + embed, width, segs, 1, 1);
    box.translate((x0 + x1) / 2, boreR - depth / 2 + embed / 2, 0);
    const pos = box.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = base + ((x - x0) / twistCm) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      pos.setXYZ(i, x, y * ca - z * sa, y * sa + z * ca);
    }
    box.computeVertexNormals();
    lands.push(box.toNonIndexed());
    box.dispose();
  }
  const merged = mergeGeometries(lands, false);
  for (const l of lands) l.dispose();
  return paintGeometry(merged, color);
}

/**
 * Wraps `createHelicalSpring` and seals the 2 open `TubeGeometry` wire end-rings with
 * exact `aSpringParam`-matching end caps so the spring is BOTH 100% manifold watertight
 * (`openEdges === 0`) AND preserves constant-wire-diameter GPU `aSpringParam` compression!
 */
export function createWatertightHelicalSpring(
  opts: HelicalSpringOptions,
  color: string
): THREE.BufferGeometry {
  const base = paintGeometry(createHelicalSpring(opts), color);
  const radialSeg = opts.radialSegments ?? 10;
  const totalSteps = Math.max(
    28,
    Math.round(opts.coils * (opts.tubularSegmentsPerCoil ?? 20))
  );

  const pos = base.getAttribute('position');
  const sp = base.getAttribute(SPRING_PARAM_ATTRIBUTE);
  const col = base.getAttribute('color');

  // In non-indexed TubeGeometry, each tubular segment i in [0, totalSteps-1] emits radialSeg * 6 vertices:
  // For each j in [0, radialSeg-1]:
  //   tri 1: (a=(i,j), b=(i+1,j), d=(i,j+1))
  //   tri 2: (b=(i+1,j), c=(i+1,j+1), d=(i,j+1))
  // Thus at i = 0, edge (a -> d) has directed edge (a, d) inside tri 1, so the cap needs (center0, d, a)!
  // At i = totalSteps (last segment i = totalSteps-1), edge (b -> c) has directed edge (b, c) inside tri 2,
  // so the end cap needs (centerEnd, c, b)? Wait: tri 2 has (b, c, d), which contains directed edge (b -> c),
  // so the opposite cap edge is (c -> b), i.e., triangle (centerEnd, c, b)!
  const startRingA: number[] = [];
  const startRingD: number[] = [];
  for (let j = 0; j < radialSeg; j++) {
    const triBase = j * 6;
    startRingA.push(triBase); // (0, j)
    startRingD.push(triBase + 2); // (0, j+1)
  }

  const lastSegBase = (totalSteps - 1) * radialSeg * 6;
  const endRingB: number[] = [];
  const endRingC: number[] = [];
  for (let j = 0; j < radialSeg; j++) {
    const triBase = lastSegBase + j * 6;
    endRingB.push(triBase + 3); // (totalSteps, j)
    endRingC.push(triBase + 4); // (totalSteps, j+1)
  }

  const c0 = new THREE.Vector3();
  for (const idx of startRingA) {
    c0.x += pos.getX(idx);
    c0.y += pos.getY(idx);
    c0.z += pos.getZ(idx);
  }
  c0.multiplyScalar(1 / radialSeg);

  const cEnd = new THREE.Vector3();
  for (const idx of endRingB) {
    cEnd.x += pos.getX(idx);
    cEnd.y += pos.getY(idx);
    cEnd.z += pos.getZ(idx);
  }
  cEnd.multiplyScalar(1 / radialSeg);

  const capVerts = radialSeg * 6;
  const totalV = pos.count + capVerts;
  const pArr = new Float32Array(totalV * 3);
  const nArr = new Float32Array(totalV * 3);
  const uArr = new Float32Array(totalV * 2);
  const cArr = new Float32Array(totalV * 3);
  const sArr = new Float32Array(totalV * 4);
  const kArr = new Float32Array(totalV);

  pArr.set(pos.array as Float32Array);
  nArr.set(base.getAttribute('normal').array as Float32Array);
  uArr.set(base.getAttribute('uv').array as Float32Array);
  cArr.set(col.array as Float32Array);
  sArr.set(sp.array as Float32Array);

  const rCol = col.getX(0);
  const gCol = col.getY(0);
  const bCol = col.getZ(0);

  let cursor = pos.count;
  const emitCapTri = (
    pCenter: THREE.Vector3,
    spCenter: readonly [number, number, number, number],
    idx1: number,
    idx2: number
  ) => {
    _vA.copy(pCenter);
    _vB.fromBufferAttribute(pos, idx1);
    _vC.fromBufferAttribute(pos, idx2);
    _e1.subVectors(_vB, _vA);
    _e2.subVectors(_vC, _vA);
    _fn.crossVectors(_e1, _e2).normalize();

    const pts = [_vA, _vB, _vC];
    const sps: Array<readonly [number, number, number, number]> = [
      spCenter,
      [sp.getX(idx1), sp.getY(idx1), sp.getZ(idx1), sp.getW(idx1)],
      [sp.getX(idx2), sp.getY(idx2), sp.getZ(idx2), sp.getW(idx2)],
    ];

    for (let k = 0; k < 3; k++) {
      const vi = cursor++;
      pArr[vi * 3] = pts[k].x;
      pArr[vi * 3 + 1] = pts[k].y;
      pArr[vi * 3 + 2] = pts[k].z;
      nArr[vi * 3] = _fn.x;
      nArr[vi * 3 + 1] = _fn.y;
      nArr[vi * 3 + 2] = _fn.z;
      uArr[vi * 2] = 0.5;
      uArr[vi * 2 + 1] = 0.5;
      cArr[vi * 3] = rCol;
      cArr[vi * 3 + 1] = gCol;
      cArr[vi * 3 + 2] = bCol;
      sArr[vi * 4] = sps[k][0];
      sArr[vi * 4 + 1] = sps[k][1];
      sArr[vi * 4 + 2] = sps[k][2];
      sArr[vi * 4 + 3] = sps[k][3];
    }
  };

  const sp0: readonly [number, number, number, number] = [
    sp.getX(startRingA[0]),
    sp.getY(startRingA[0]),
    sp.getZ(startRingA[0]),
    sp.getW(startRingA[0]),
  ];
  for (let j = 0; j < radialSeg; j++) {
    emitCapTri(c0, sp0, startRingA[j], startRingD[j]);
  }

  const spEnd: readonly [number, number, number, number] = [
    sp.getX(endRingB[0]),
    sp.getY(endRingB[0]),
    sp.getZ(endRingB[0]),
    sp.getW(endRingB[0]),
  ];
  for (let j = 0; j < radialSeg; j++) {
    emitCapTri(cEnd, spEnd, endRingC[j], endRingB[j]);
  }

  base.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nArr, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uArr, 2));
  out.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
  out.setAttribute(SPRING_PARAM_ATTRIBUTE, new THREE.BufferAttribute(sArr, 4));
  out.setAttribute(CURVATURE_ATTRIBUTE, new THREE.BufferAttribute(kArr, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// ============================================================================
// 1. ROTATING BOLT, FIRING PIN & OP-ROD RECOIL SPRING ('slide' B-06..B-08)
// ============================================================================

/**
 * B-06: Forged 2-Lug Rotating Bolt w/ Right Operating Cam Lug
 * (assembledPos: [-0.65, 1.15, 0] -> coaxial with bore Y = +1.15, Z = 0)
 * Local X ∈ [-3.80, +2.65] -> World X ∈ [-4.45, +2.00].
 * Rotates +0.56 rad (~32.1°) around X during op-rod cam hump unlock/lock!
 */
export function buildGarandBoltGeometry(): THREE.BufferGeometry {
  // Hollow stepped cylindrical bolt body w/ recessed .30-06 bolt face & firing-pin bore
  const boltBody = buildRevolvedX(
    [
      [0.14, -3.8],
      [0.68, -3.8],
      [0.71, -3.65],
      [0.71, 1.82],
      [0.66, 1.88],
      [0.66, 2.62],
      [0.62, 2.65],
      [0.54, 2.65], // Bolt face rim
      [0.54, 2.48], // Recessed .30-06 cartridge head cup (Ø12.0mm)
      [0.14, 2.48],
      [0.14, -3.8], // Coaxial firing-pin channel
    ],
    28,
    GARAND_PALETTE.PARKERIZED_STEEL
  );

  // Left (-Z) and Right (+Z) heavy forged locking lugs (local X ∈ [1.84, 2.60])
  const leftLug = createChamferedBox(
    0.76,
    0.66,
    0.46,
    0.04,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(2.22, 0.04, -0.78);

  const rightLug = createChamferedBox(
    0.76,
    0.66,
    0.52,
    0.04,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(2.22, 0.04, 0.81);

  // Cylindrical operating lug extending from right locking lug into garand_op_rod cam hump!
  const operatingLug = createBeveledCylinder(
    0.22,
    0.22,
    0.54,
    0.03,
    18,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateX(Math.PI / 2)
    .translate(2.28, 0.08, 1.16);

  // Bottom cartridge-stripping lug & rear hammer-cam / tang lug
  const strippingRib = createChamferedBox(
    4.6,
    0.34,
    0.44,
    0.03,
    GARAND_PALETTE.PARKERIZED_MID
  ).translate(0.15, -0.72, 0);

  const topRacewayPad = createChamferedBox(
    2.4,
    0.18,
    0.76,
    0.025,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(-1.85, 0.68, 0);

  const rearTangCollar = createChamferedBox(
    0.72,
    0.84,
    0.82,
    0.03,
    GARAND_PALETTE.PARKERIZED_DARK
  ).translate(-3.42, -0.18, 0);

  return mergeParts([
    boltBody,
    leftLug,
    rightLug,
    operatingLug,
    strippingRib,
    topRacewayPad,
    rearTangCollar,
  ]);
}

/**
 * B-07: Long Tang-Blocked Firing Pin + Bolt-Face Extractor & Ejector Plunger
 * (assembledPos: [-0.85, 1.15, 0] -> coaxial inside garand_bolt)
 * Features hemispherical striker tip, fluted shaft, receiver-bridge safety tang (-Y),
 * right claw extractor, and left spring-loaded .30-06 brass ejector plunger!
 */
export function buildGarandFiringPinGeometry(): THREE.BufferGeometry {
  const pinShaft = buildRevolvedX(
    [
      [0, -3.65],
      [0.13, -3.62],
      [0.13, -1.2],
      [0.11, -1.15],
      [0.11, 2.15],
      [0.075, 2.45],
      [0.042, 2.82],
      [0, 2.86],
    ],
    18,
    GARAND_PALETTE.WHITE_PISTON
  );

  // Iconic M1 Garand rear safety tang: drops -Y to ride through receiver bridge tang slot ONLY when bolt is locked!
  const safetyTang = createChamferedBox(
    0.56,
    0.92,
    0.24,
    0.025,
    GARAND_PALETTE.WHITE_PISTON
  ).translate(-3.48, -0.44, 0);

  const strikerAnvilPad = createChamferedBox(
    0.28,
    0.64,
    0.34,
    0.025,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(-3.68, -0.32, 0);

  // Forged claw extractor & plunger seated on right side of bolt face (+Z)
  const extractorClaw = createChamferedBox(
    1.28,
    0.24,
    0.18,
    0.02,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(2.15, 0.04, 0.52);

  const extractorHook = createChamferedBox(
    0.18,
    0.28,
    0.22,
    0.02,
    GARAND_PALETTE.WHITE_PISTON
  ).translate(2.78, 0.04, 0.45);

  // Left-upper spring-loaded cylindrical ejector plunger (kicks .30-06 brass to 1-2 o'clock!)
  const ejectorRod = createBeveledCylinder(
    0.065,
    0.065,
    1.18,
    0.015,
    14,
    GARAND_PALETTE.BURNISHED_LUG
  )
    .rotateZ(Math.PI / 2)
    .translate(2.26, 0.16, -0.26);

  return mergeParts([
    pinShaft,
    safetyTang,
    strikerAnvilPad,
    extractorClaw,
    extractorHook,
    ejectorRod,
  ]);
}

/**
 * B-08: Long Helical Operating-Rod Recoil Spring
 * (assembledPos: [26.50, -0.35, 0])
 * Spans local X ∈ [-16.70, +16.70] (L0 = 33.40 cm):
 *  - Rear anchor (-16.70 -> world X = +9.80) seats on garand_follower_arm fork!
 *  - Front end (+16.70 -> world X = +43.20) compresses dynamically inside garand_op_rod tube!
 */
export function buildGarandOpRodSpringGeometry(): THREE.BufferGeometry {
  return createWatertightHelicalSpring(
    {
      axis: 'x',
      start: -16.7,
      end: 16.7,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.36,
      wireRadius: 0.056,
      coils: 40,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    },
    GARAND_PALETTE.SPRING_WIRE
  );
}

/**
 * F-08: Internal Operating-Rod Catch & Accelerator Linkage
 * (assembledPos: [4.85, -0.35, 0.55])
 * Holds op-rod open after 8th round & releases bolt when fresh en-bloc clip is pressed home!
 */
export function buildGarandOpRodCatchGeometry(): THREE.BufferGeometry {
  const catchBodyShape = new THREE.Shape();
  catchBodyShape.moveTo(-1.85, -0.38);
  catchBodyShape.lineTo(1.65, -0.38);
  catchBodyShape.lineTo(1.82, 0.24);
  catchBodyShape.lineTo(1.15, 0.68);
  catchBodyShape.lineTo(0.45, 0.68);
  catchBodyShape.lineTo(0.18, 0.26);
  catchBodyShape.lineTo(-1.45, 0.26);
  catchBodyShape.lineTo(-1.85, -0.05);
  catchBodyShape.closePath();

  const pivotHole = new THREE.Path();
  pivotHole.absarc(0.85, -0.04, 0.14, 0, Math.PI * 2, true);
  catchBodyShape.holes.push(pivotHole);

  const leverBody = extrudeShapeZ(
    catchBodyShape,
    0,
    0.34,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.025,
    8
  );

  // Pivoting accelerator pawl & cross-axle pin
  const acceleratorPawl = createChamferedBox(
    0.86,
    0.42,
    0.26,
    0.025,
    GARAND_PALETTE.BURNISHED_LUG
  )
    .rotateZ(0.28)
    .translate(1.22, -0.32, -0.24);

  const crossPin = createBeveledCylinder(
    0.13,
    0.13,
    1.16,
    0.02,
    14,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateX(Math.PI / 2)
    .translate(0.85, -0.04, -0.22);

  const clipLatchLinkArm = createChamferedBox(
    1.62,
    0.2,
    0.22,
    0.02,
    GARAND_PALETTE.PARKERIZED_MID
  ).translate(-1.35, -0.18, -0.32);

  return mergeParts([leverBody, acceleratorPawl, crossPin, clipLatchLinkArm]);
}

// ============================================================================
// 2. QUICK-DETACH MILLED TRIGGER GROUP & WINTER SAFETY ('fire_control' FC-01..05)
// ============================================================================

/**
 * FC-01: Quick-Detach Milled Steel Trigger Housing + Iconic Winter Safety Lever
 * (assembledPos: [-4.60, -2.55, 0])
 * World X ∈ [-8.40, -0.60], Y ∈ [-4.25, -1.15], Z ∈ [-0.88, +0.88].
 */
export function buildGarandTriggerHousingGeometry(): THREE.BufferGeometry {
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-3.75, -1.55);
  plateShape.lineTo(3.85, -1.55);
  plateShape.lineTo(3.98, 0.65);
  plateShape.lineTo(3.25, 1.38);
  plateShape.lineTo(1.65, 1.38);
  plateShape.lineTo(1.15, 0.55);
  plateShape.lineTo(-1.85, 0.55);
  plateShape.lineTo(-2.45, 1.28);
  plateShape.lineTo(-3.75, 1.15);
  plateShape.closePath();

  const cutWindow = new THREE.Path();
  cutWindow.moveTo(-1.35, -0.95);
  cutWindow.lineTo(0.95, -0.95);
  cutWindow.lineTo(0.95, 0.15);
  cutWindow.lineTo(-1.35, 0.15);
  cutWindow.closePath();
  plateShape.holes.push(cutWindow);

  const leftWall = extrudeShapeZ(
    plateShape,
    -0.68,
    0.26,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.02,
    8
  );
  const rightWall = extrudeShapeZ(
    plateShape,
    0.68,
    0.26,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.02,
    8
  );

  // Bottom bridge deck & receiver locking lugs
  const bottomBridgeFront = createChamferedBox(
    1.85,
    0.34,
    1.48,
    0.025,
    GARAND_PALETTE.PARKERIZED_MID
  ).translate(2.65, -1.38, 0);

  const bottomBridgeRear = createChamferedBox(
    1.55,
    0.34,
    1.48,
    0.025,
    GARAND_PALETTE.PARKERIZED_MID
  ).translate(-2.92, -1.38, 0);

  const receiverLockPinL = createBeveledCylinder(
    0.22,
    0.22,
    0.24,
    0.02,
    16,
    GARAND_PALETTE.BURNISHED_LUG
  )
    .rotateX(Math.PI / 2)
    .translate(2.55, 0.92, -0.88);

  const receiverLockPinR = createBeveledCylinder(
    0.22,
    0.22,
    0.24,
    0.02,
    16,
    GARAND_PALETTE.BURNISHED_LUG
  )
    .rotateX(Math.PI / 2)
    .translate(2.55, 0.92, 0.88);

  // Iconic M1 Garand pivoting thumb/finger safety at front of trigger guard!
  const safetyShape = new THREE.Shape();
  safetyShape.moveTo(-0.22, 0.35);
  safetyShape.lineTo(0.32, 0.35);
  safetyShape.lineTo(0.55, -0.85);
  safetyShape.quadraticCurveTo(0.58, -1.35, 0.15, -1.42);
  safetyShape.lineTo(-0.18, -1.25);
  safetyShape.lineTo(-0.22, 0.35);
  safetyShape.closePath();

  const safetyLever = extrudeShapeZ(
    safetyShape,
    0,
    0.38,
    GARAND_PALETTE.BURNISHED_LUG,
    0.025,
    8
  ).translate(2.05, -1.15, 0);

  const hammerCrossPin = createBeveledCylinder(
    0.16,
    0.16,
    1.76,
    0.02,
    16,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateX(Math.PI / 2)
    .translate(-0.35, 0.88, 0);

  const triggerCrossPin = createBeveledCylinder(
    0.14,
    0.14,
    1.76,
    0.02,
    16,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateX(Math.PI / 2)
    .translate(-0.95, -0.68, 0);

  return mergeParts([
    leftWall,
    rightWall,
    bottomBridgeFront,
    bottomBridgeRear,
    receiverLockPinL,
    receiverLockPinR,
    safetyLever,
    hammerCrossPin,
    triggerCrossPin,
  ]);
}

/**
 * FC-02: Pivoting WWII Milled Trigger Guard w/ Camming Takedown Lugs
 * (assembledPos: [-4.50, -4.35, 0])
 * Pulling rear finger hook downward cams the entire trigger group out of the rifle!
 */
export function buildGarandTriggerGuardGeometry(): THREE.BufferGeometry {
  // Upper milled trigger-guard plate & rear WWII takedown finger hook
  const upperBar = createChamferedBox(
    5.45,
    0.34,
    0.86,
    0.03,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(-0.08, 0.22, 0);

  // Sculpted curved winter trigger guard bow + rear takedown finger hook!
  const bowTube = buildWatertightTube(
    [
      new THREE.Vector3(-3.32, 0.32, 0),
      new THREE.Vector3(-3.12, 0.02, 0),
      new THREE.Vector3(-2.15, 0.08, 0),
      new THREE.Vector3(-1.75, -0.82, 0),
      new THREE.Vector3(-0.95, -1.32, 0),
      new THREE.Vector3(0.15, -1.36, 0),
      new THREE.Vector3(1.18, -1.24, 0),
      new THREE.Vector3(1.88, -0.68, 0),
      new THREE.Vector3(2.22, 0.18, 0),
    ],
    0.21,
    14,
    GARAND_PALETTE.PARKERIZED_STEEL
  );

  // Twin upper camming locking lugs that cam into receiver lower legs
  const lugL = createChamferedBox(
    0.64,
    1.18,
    0.26,
    0.025,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(2.42, 0.82, -0.48);

  const lugR = createChamferedBox(
    0.64,
    1.18,
    0.26,
    0.025,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(2.42, 0.82, 0.48);

  return mergeParts([upperBar, bowTube, lugL, lugR]);
}

/**
 * FC-03: Forged Two-Stage Service Trigger & Spring-Loaded Disconnector Sear
 * (assembledPos: [-5.55, -3.45, 0])
 */
export function buildGarandTriggerGeometry(): THREE.BufferGeometry {
  // Strictly CCW outer contour + CW pivot hole
  const trigShape = new THREE.Shape();
  trigShape.moveTo(-0.42, 1.48); // Primary sear nose
  trigShape.lineTo(-0.56, 0.65);
  trigShape.lineTo(-0.22, 0.18);
  trigShape.quadraticCurveTo(-0.28, -0.72, 0.06, -1.62);
  trigShape.quadraticCurveTo(0.4, -1.68, 0.52, -1.42); // Curved finger shoe
  trigShape.quadraticCurveTo(0.28, -0.62, 0.56, 0.25);
  trigShape.lineTo(0.45, 1.48);
  trigShape.closePath();

  const pivotHole = new THREE.Path();
  pivotHole.absarc(0.12, 0.35, 0.13, 0, Math.PI * 2, true);
  trigShape.holes.push(pivotHole);

  const triggerBlade = extrudeShapeZ(
    trigShape,
    0,
    0.44,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.02,
    10
  );

  // Pinned semi-auto secondary sear (disconnector) & sear pin
  const secondarySear = createChamferedBox(
    0.66,
    0.68,
    0.58,
    0.025,
    GARAND_PALETTE.WHITE_PISTON
  ).translate(-0.28, 1.28, 0);

  const searPin = createBeveledCylinder(
    0.09,
    0.09,
    0.72,
    0.015,
    12,
    GARAND_PALETTE.BURNISHED_LUG
  )
    .rotateX(Math.PI / 2)
    .translate(-0.24, 0.92, 0);

  return mergeParts([triggerBlade, secondarySear, searPin]);
}

/**
 * FC-04: Forged Internal Rotating Hammer w/ Dual Sear Hooks & Tang Alignment Slot
 * (assembledPos: [-4.95, -1.65, 0])
 * Pivots around local [0, 0, 0]: cocked rearward (rz = 0), swings forward (rz = -1.32 rad)
 * to strike garand_firing_pin at [-3.80, +1.15, 0]!
 */
export function buildGarandHammerGeometry(): THREE.BufferGeometry {
  // Cocked rearward posture (at rz = 0, hammer lies nearly horizontal rearward along -X,
  // and rotating rz = -1.32 rad (~75.6° CW around Z) swings the strike face up to [+0.95, +2.45]!)
  const hamShape = new THREE.Shape();
  hamShape.moveTo(-0.42, -0.45); // Front primary sear hook
  hamShape.lineTo(0.46, -0.35);
  hamShape.lineTo(0.55, 0.35);
  hamShape.lineTo(-1.85, 0.88); // Cocked hammer spine pointing rearward-up
  hamShape.lineTo(-2.45, 0.65); // Hammer strike head (swings up/forward when rz < 0!)
  hamShape.lineTo(-2.35, 0.05);
  hamShape.lineTo(-0.92, -0.22); // Rear disconnector hook shelf
  hamShape.closePath();

  const pivotHole = new THREE.Path();
  pivotHole.absarc(0, 0, 0.17, 0, Math.PI * 2, true);
  hamShape.holes.push(pivotHole);

  const hammerBody = extrudeShapeZ(
    hamShape,
    0,
    0.56,
    GARAND_PALETTE.BURNISHED_LUG,
    0.03,
    10
  );

  // Hardened strike nose & plunger cam ears
  const strikeHead = createChamferedBox(
    0.52,
    0.64,
    0.64,
    0.03,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateZ(-0.22)
    .translate(-2.22, 0.48, 0);

  const plungerSeatCup = createBeveledCylinder(
    0.18,
    0.18,
    0.66,
    0.02,
    14,
    GARAND_PALETTE.PARKERIZED_DARK
  )
    .rotateX(Math.PI / 2)
    .translate(-0.52, -0.32, 0);

  return mergeParts([hammerBody, strikeHead, plungerSeatCup]);
}

/**
 * FC-05: Helical Hammer Compression Spring, Guide Rod & Plunger Tube
 * (assembledPos: [-6.35, -2.65, 0])
 * Built with watertight `createWatertightHelicalSpring` (`aSpringParam` `w = 1`)!
 */
export function buildGarandHammerSpringGeometry(): THREE.BufferGeometry {
  const mainSpring = createWatertightHelicalSpring(
    {
      axis: 'x',
      start: -1.55,
      end: 1.45,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.24,
      wireRadius: 0.044,
      coils: 14,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    },
    GARAND_PALETTE.SPRING_WIRE
  );

  // Rear guide collar & front winged hammer-spring plunger tip (w = 0 merged fittings scale in lockstep!)
  const rearCup = createBeveledCylinder(
    0.28,
    0.28,
    0.24,
    0.02,
    16,
    GARAND_PALETTE.PARKERIZED_STEEL
  )
    .rotateZ(Math.PI / 2)
    .translate(-1.62, 0, 0);

  const plungerTip = createBeveledCylinder(
    0.14,
    0.22,
    0.42,
    0.02,
    16,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateZ(Math.PI / 2)
    .translate(1.58, 0, 0);

  return mergeParts([mainSpring, rearCup, plungerTip]);
}

// ============================================================================
// 3. 8-ROUND EN-BLOC CLIP, FOLLOWER ARM & CLIP LATCH ('magazine' M-01..M-05)
// ============================================================================

/**
 * M-01: Iconic WWII Stamped Manganese-Phosphate Spring-Steel 8-Round En-Bloc Clip
 * (assembledPos: [-0.95, -0.15, 0])
 * World X ∈ [-4.15, +2.25], Y ∈ [-1.65, +1.35], Z ∈ [-0.72, +0.72].
 * U-channel spring-steel body w/ curled retaining lips, lateral clip-latch notches & stamped ribs!
 */
export function buildGarandEnblocClipGeometry(): THREE.BufferGeometry {
  // Cross-section in (Z, Y) extruded along +X for the stamped spring-steel U-clip walls & top retaining lips
  const clipCross = new THREE.Shape();
  // Outer profile (Z in [-0.70, +0.70], Y in [-1.48, +1.48])
  clipCross.moveTo(-0.42, -1.48);
  clipCross.lineTo(-0.68, -1.36);
  clipCross.lineTo(-0.7, 1.24);
  clipCross.lineTo(-0.46, 1.48); // Curled top-left cartridge retaining lip!
  clipCross.lineTo(-0.36, 1.42);
  clipCross.lineTo(-0.58, 1.18);
  clipCross.lineTo(-0.58, -1.28);
  clipCross.lineTo(-0.34, -1.36); // Open bottom follower slot Z ∈ [-0.34, +0.34]
  clipCross.lineTo(-0.34, -1.48);
  clipCross.closePath();

  const leftClipWall = extrudeShapeX(
    clipCross,
    -3.15,
    5.4,
    GARAND_PALETTE.ENBLOC_CHARCOAL,
    0.012,
    6
  );

  const clipCrossR = new THREE.Shape();
  clipCrossR.moveTo(0.34, -1.48);
  clipCrossR.lineTo(0.34, -1.36);
  clipCrossR.lineTo(0.58, -1.28);
  clipCrossR.lineTo(0.58, 1.18);
  clipCrossR.lineTo(0.36, 1.42);
  clipCrossR.lineTo(0.46, 1.48); // Curled top-right cartridge retaining lip!
  clipCrossR.lineTo(0.7, 1.24);
  clipCrossR.lineTo(0.68, -1.36);
  clipCrossR.lineTo(0.42, -1.48);
  clipCrossR.closePath();

  const rightClipWall = extrudeShapeX(
    clipCrossR,
    -3.15,
    5.4,
    GARAND_PALETTE.ENBLOC_CHARCOAL,
    0.012,
    6
  );

  // Closed stamped rear back-wall tying left & right walls together + Borg-Warner/SA base ribs
  const rearBackWall = createChamferedBox(
    0.16,
    2.86,
    1.36,
    0.015,
    GARAND_PALETTE.ENBLOC_CHARCOAL
  ).translate(-3.12, -0.02, 0);

  // Iconic stamped external vertical clip-latch boss & positioning ribs on ±Z flanks!
  const latchBossL = createChamferedBox(
    0.64,
    0.72,
    0.09,
    0.015,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(-0.22, 0.42, -0.73);

  const latchBossR = createChamferedBox(
    0.64,
    0.72,
    0.09,
    0.015,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(-0.22, 0.42, 0.73);

  const rearRimRibL = createChamferedBox(
    0.26,
    2.64,
    0.08,
    0.015,
    GARAND_PALETTE.PARKERIZED_MID
  ).translate(-2.65, -0.04, -0.72);

  const rearRimRibR = createChamferedBox(
    0.26,
    2.64,
    0.08,
    0.015,
    GARAND_PALETTE.PARKERIZED_MID
  ).translate(-2.65, -0.04, 0.72);

  return mergeParts([
    leftClipWall,
    rightClipWall,
    rearBackWall,
    latchBossL,
    latchBossR,
    rearRimRibL,
    rearRimRibR,
  ]);
}

/**
 * M-02: Reversible Machined 8-Round Staggered Follower & Follower Slide
 * (assembledPos: [-0.95, -0.95, 0])
 * Rides smoothly inside garand_enbloc_clip; reversible staggered steps accept either-way clip insertion!
 */
export function buildGarandFollowerGeometry(): THREE.BufferGeometry {
  const mainBlock = createChamferedBox(
    5.05,
    0.46,
    0.98,
    0.03,
    GARAND_PALETTE.BURNISHED_LUG
  );

  // Reversible staggered cartridge step ridge (raises one side by half-cartridge diameter!)
  const staggeredStepTop = createChamferedBox(
    4.85,
    0.26,
    0.44,
    0.025,
    GARAND_PALETTE.WHITE_PISTON
  ).translate(0.05, 0.32, -0.24);

  const staggeredStepBot = createChamferedBox(
    4.85,
    0.22,
    0.44,
    0.025,
    GARAND_PALETTE.PARKERIZED_MID
  ).translate(0.05, -0.3, 0.24);

  // Sliding follower-arm cam lug underneath
  const followerSlide = createChamferedBox(
    1.65,
    0.48,
    0.46,
    0.025,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(0.45, -0.44, 0);

  return mergeParts([
    mainBlock,
    staggeredStepTop,
    staggeredStepBot,
    followerSlide,
  ]);
}

/**
 * M-03: Pivoting Follower Arm & Forked Follower Rod
 * (assembledPos: [3.85, -1.25, 0])
 * Transmits rearward compression force of `garand_op_rod_spring` (at world X = +9.80, Y = -0.35)
 * into upward cartridge-feeding torque on `garand_follower`!
 */
export function buildGarandFollowerArmGeometry(): THREE.BufferGeometry {
  // Twin forged follower arms reaching rearward under garand_follower (local X ∈ [-4.75, +0.35])
  const armL = createChamferedBox(
    5.1,
    0.34,
    0.2,
    0.02,
    GARAND_PALETTE.PARKERIZED_STEEL
  )
    .rotateZ(-0.08)
    .translate(-2.2, 0.08, -0.36);

  const armR = createChamferedBox(
    5.1,
    0.34,
    0.2,
    0.02,
    GARAND_PALETTE.PARKERIZED_STEEL
  )
    .rotateZ(-0.08)
    .translate(-2.2, 0.08, 0.36);

  const pivotBoss = createBeveledCylinder(
    0.24,
    0.24,
    1.04,
    0.02,
    16,
    GARAND_PALETTE.BURNISHED_LUG
  )
    .rotateX(Math.PI / 2)
    .translate(-0.35, 0.28, 0);

  // Long stamped/forged follower rod extending forward to world X = +9.80, Y = -0.35 (local [+5.95, +0.90])
  const rodSpine = buildWatertightTube(
    [
      new THREE.Vector3(-0.25, 0.28, 0),
      new THREE.Vector3(1.85, 0.56, 0),
      new THREE.Vector3(4.25, 0.86, 0),
      new THREE.Vector3(5.95, 0.9, 0),
    ],
    0.14,
    14,
    GARAND_PALETTE.PARKERIZED_MID
  );

  // Op-rod spring seating collar & guide tail at local X = +5.95 (world X = +9.80, Y = -0.35)
  const springWasher = createBeveledCylinder(
    0.44,
    0.44,
    0.22,
    0.02,
    20,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateZ(Math.PI / 2)
    .translate(5.95, 0.9, 0);

  const springGuideSpigot = createBeveledCylinder(
    0.22,
    0.24,
    1.25,
    0.02,
    16,
    GARAND_PALETTE.BURNISHED_LUG
  )
    .rotateZ(Math.PI / 2)
    .translate(6.62, 0.9, 0);

  return mergeParts([
    armL,
    armR,
    pivotBoss,
    rodSpine,
    springWasher,
    springGuideSpigot,
  ]);
}

/**
 * M-04: Forged Internal Bullet Guide Ramp & Accelerator Seat Block
 * (assembledPos: [3.35, -0.45, 0])
 * Guides staggered .30-06 spitzer rounds cleanly out of the en-bloc clip into the barrel chamber!
 */
export function buildGarandBulletGuideGeometry(): THREE.BufferGeometry {
  const blockShape = new THREE.Shape();
  blockShape.moveTo(-1.28, -0.88);
  blockShape.lineTo(1.28, -0.88);
  blockShape.lineTo(1.35, 0.42);
  blockShape.lineTo(0.55, 0.95); // Angled twin bullet feed ramp!
  blockShape.lineTo(-0.95, 0.35);
  blockShape.lineTo(-1.28, -0.15);
  blockShape.closePath();

  const pinHole = new THREE.Path();
  pinHole.absarc(0.15, -0.48, 0.14, 0, Math.PI * 2, true);
  blockShape.holes.push(pinHole);

  const guideBody = extrudeShapeZ(
    blockShape,
    0,
    1.34,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.03,
    8
  );

  // Polished twin feed-ramp flutes on top face
  const rampPadL = createChamferedBox(
    1.42,
    0.16,
    0.46,
    0.02,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateZ(0.36)
    .translate(-0.18, 0.66, -0.32);

  const rampPadR = createChamferedBox(
    1.42,
    0.16,
    0.46,
    0.02,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateZ(0.36)
    .translate(-0.18, 0.66, 0.32);

  return mergeParts([guideBody, rampPadL, rampPadR]);
}

/**
 * M-05: Left-Receiver Thumb Clip Latch + Helical Latch Spring & V-Wire Clip Ejector
 * (assembledPos: [-1.15, 0.45, -1.48])
 * Holds the 8-round en-bloc clip down against the powerful clip-ejector V-spring until the 8th round fires,
 * then trips to launch the empty clip out of the open receiver with the legendary "PING!"!
 */
export function buildGarandClipLatchGeometry(): THREE.BufferGeometry {
  // Checkered external left-flank thumb bar
  const thumbBar = createChamferedBox(
    3.65,
    0.66,
    0.26,
    0.025,
    GARAND_PALETTE.PARKERIZED_STEEL
  );

  const thumbButton = createBeveledCylinder(
    0.36,
    0.36,
    0.18,
    0.02,
    18,
    GARAND_PALETTE.BURNISHED_LUG
  )
    .rotateX(Math.PI / 2)
    .translate(-1.15, 0.04, -0.16);

  // Internal hook reaching +Z into receiver clip well
  const clipHook = createChamferedBox(
    0.58,
    0.48,
    0.84,
    0.025,
    GARAND_PALETTE.WHITE_PISTON
  ).translate(0.18, -0.02, 0.48);

  // Helical clip-latch compression spring (`aSpringParam` `w = 1`!)
  const latchSpring = createWatertightHelicalSpring(
    {
      axis: 'x',
      start: 0.72,
      end: 1.78,
      centerY: -0.04,
      centerZ: 0.24,
      coilRadius: 0.14,
      wireRadius: 0.026,
      coils: 8,
      radialSegments: 8,
      tubularSegmentsPerCoil: 12,
    },
    GARAND_PALETTE.SPRING_WIRE
  );

  // Iconic stamped V-wire clip ejector spring reaching under the en-bloc clip floor!
  const vEjectorWire = buildWatertightTube(
    [
      new THREE.Vector3(-2.15, -1.95, 0.95),
      new THREE.Vector3(-1.45, -2.05, 1.38),
      new THREE.Vector3(0.25, -1.88, 1.48), // Upward spring tip pressing under en-bloc clip!
      new THREE.Vector3(1.15, -1.96, 1.25),
    ],
    0.055,
    10,
    GARAND_PALETTE.SPRING_WIRE
  );

  return mergeParts([
    thumbBar,
    thumbButton,
    clipHook,
    latchSpring,
    vEjectorWire,
  ]);
}
