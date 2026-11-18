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
 * Authentic FN Minimi / U.S. M249 SAW (5.56x45mm NATO) ordnance material palette.
 * Every color stays strictly above the Khronos PBR anti-black-crush linear luma floor (>= 0.018).
 */
export const M249_PALETTE = {
  PARKERIZED_STEEL: '#3c4341', // Manganese-phosphate stamped steel receiver & barrel
  PARKERIZED_DARK: '#2d3332', // Deep phosphate recess / heatshield louver
  PARKERIZED_MID: '#4b5351', // Machined trunnion & gas-tube steel
  DIECAST_COVER: '#383f47', // Die-cast alloy hinged top feed cover
  HARD_CHROME: '#cbd5e1', // Chrome-lined barrel extension, piston head & actuation roller
  BURNISHED_STEEL: '#94a3b8', // Silver-worn guide rails, rotating bolt lugs & folding shoulder wire
  SPRING_WIRE: '#8b97a8', // Tempered music-wire driving & sear springs
  POLYMER_CHARCOAL: '#333840', // Glass-filled polyamide M249 buttstock, pistol grip & carry handle
  RUBBER_PAD: '#2b2f36', // Serrated recoil buttpad
  OD_GREEN_BOX: '#48553d', // Olive-drab 200-round polymer SAW assault box
  M27_LINK_BLACK: '#34393c', // Matte phosphate spring-steel M27 disintegrating belt links
  BRASS_556: '#cfa038', // C26000 5.56x45mm NATO cartridge brass
  COPPER_FMJ: '#bf5e36', // Gilding-metal FMJ spitzer bullet jacket
  M855_GREEN_TIP: '#2f7a44', // NATO M855 SS109 green steel-penetrator bullet tip
  SAFETY_RED: '#b91c1c', // Cross-bolt safety FIRE warning ring
} as const;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

/**
 * Normalizes box-projected UVs onto [0.04, 0.96] per triangle dominant normal
 * so every non-atlas part strictly obeys UV in [0, 1] with non-collapsed U/V spans.
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
 * preserves `aCurvature` & `aSpringParam`, and guarantees UV in [0, 1].
 */
export function sanitizeM249Mesh(
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
// STRICTLY WATERTIGHT CAD KERNEL (ZERO OPEN EDGES, POSITIVE SIGNED VOLUME)
// ============================================================================

/**
 * Revolves an `(r, x)` profile around `+X` with shared exact seam trig samples and
 * zero-area pole suppression. Supports solid profiles (`(0, x0) -> ... -> (0, x1)`)
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
 * Helical rifling lands along `+X` (strictly watertight).
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
 * Wraps `createHelicalSpring` and seals both open `TubeGeometry` wire end-rings with
 * exact `aSpringParam`-matching planar caps so the spring is 100% manifold watertight
 * (`openEdges === 0`) AND preserves constant-wire-diameter GPU `aSpringParam` (`w = 1`)!
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

  const startRingA: number[] = [];
  const startRingD: number[] = [];
  for (let j = 0; j < radialSeg; j++) {
    const triBase = j * 6;
    startRingA.push(triBase);
    startRingD.push(triBase + 2);
  }

  const lastSegBase = (totalSteps - 1) * radialSeg * 6;
  const endRingB: number[] = [];
  const endRingC: number[] = [];
  for (let j = 0; j < radialSeg; j++) {
    const triBase = lastSegBase + j * 6;
    endRingB.push(triBase + 3);
    endRingC.push(triBase + 4);
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
// 1. ROTATING BOLT, FIRING PIN, CHARGING HANDLE, SPRING & BUFFER ('slide' B-05..09)
// ============================================================================

/**
 * B-05: FN Minimi / M249 2-Lug Rotating Bolt
 * (assembledPos: [-6.60, 1.25, 0] — coaxial w/ boreY = +1.25, Z = 0)
 * Cocked open-bolt face at local X = +2.70 (world X = -3.90);
 * slams +9.50 cm forward to chamber breech X = +5.60 and rotates +0.52 rad (~30°) locked!
 */
export function buildM249BoltGeometry(): THREE.BufferGeometry {
  const boltBody = buildRevolvedX(
    [
      [0.16, -2.75],
      [0.64, -2.75],
      [0.68, -2.55],
      [0.68, 1.82],
      [0.62, 1.9],
      [0.62, 2.66],
      [0.58, 2.7],
      [0.49, 2.7], // Recessed 5.56mm bolt face rim
      [0.49, 2.54], // Cartridge base pocket (Ø9.8mm)
      [0.16, 2.54],
      [0.16, -2.75], // Coaxial firing-pin tunnel
    ],
    28,
    M249_PALETTE.HARD_CHROME
  );

  // Dual heavy opposing locking lugs (±Z at front bolt head)
  const lugLeft = createChamferedBox(
    0.74,
    0.58,
    0.44,
    0.035,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(2.22, 0.02, -0.74);

  const lugRight = createChamferedBox(
    0.74,
    0.58,
    0.44,
    0.035,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(2.22, 0.02, 0.74);

  // Top belt-stripping feed horn (pushes 5.56mm cartridge out of M27 link!)
  const feedHorn = createChamferedBox(
    1.15,
    0.34,
    0.38,
    0.03,
    M249_PALETTE.HARD_CHROME
  ).translate(2.08, 0.74, 0);

  // Right spring-loaded claw extractor
  const extractorClaw = createChamferedBox(
    1.62,
    0.26,
    0.24,
    0.025,
    M249_PALETTE.PARKERIZED_DARK
  ).translate(1.52, 0.36, 0.64);

  // Bottom helical cam-pin lug riding inside `m249_piston_carrier` slide cam slot
  const camFollowerPin = createBeveledCylinder(
    0.24,
    0.24,
    0.66,
    0.03,
    18,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-1.35, -0.78, 0);

  return mergeParts([
    boltBody,
    lugLeft,
    lugRight,
    feedHorn,
    extractorClaw,
    camFollowerPin,
  ]);
}

/**
 * B-06: Slide-Linked Cammed Firing Pin
 * (assembledPos: [-7.25, 1.25, 0] — coaxial inside `m249_bolt` & `m249_piston_carrier`)
 * Protrudes past bolt face ONLY when `m249_piston_carrier` completes final +0.65 cm lockup stroke!
 */
export function buildM249FiringPinGeometry(): THREE.BufferGeometry {
  const shaft = buildRevolvedX(
    [
      [0, -2.75],
      [0.34, -2.75],
      [0.36, -2.35],
      [0.24, -2.28],
      [0.24, -0.45],
      [0.32, -0.38],
      [0.32, 0.12],
      [0.145, 0.24],
      [0.145, 2.72],
      [0.085, 3.08],
      [0.045, 3.16],
      [0, 3.18],
    ],
    22,
    M249_PALETTE.HARD_CHROME
  );

  // Slide cross-pin retention lug locking firing pin to piston carrier tower
  const carrierLinkLug = createChamferedBox(
    0.56,
    0.64,
    0.42,
    0.03,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-1.95, -0.38, 0);

  return mergeParts([shaft, carrierLinkLug]);
}

/**
 * B-07: Right-Side (+Z) Non-Reciprocating Slotted Steel Charging Handle
 * (assembledPos: [-0.80, 1.25, 2.25])
 */
export function buildM249ChargingHandleGeometry(): THREE.BufferGeometry {
  // Slotted longitudinal guide bar riding right receiver track
  const guideRail = createChamferedBox(
    8.6,
    0.66,
    0.42,
    0.035,
    M249_PALETTE.PARKERIZED_STEEL
  );

  const internalCarrierDog = createChamferedBox(
    0.72,
    0.48,
    0.62,
    0.03,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-3.65, -0.04, -0.38);

  const frontDetentLatch = createChamferedBox(
    0.95,
    0.78,
    0.48,
    0.03,
    M249_PALETTE.PARKERIZED_MID
  ).translate(3.75, 0.06, 0.08);

  // Folding knurled cylindrical pull knob (+Z)
  const knobStem = createChamferedBox(
    0.88,
    0.56,
    0.68,
    0.03,
    M249_PALETTE.PARKERIZED_DARK
  ).translate(2.65, 0, 0.42);

  const knurledHandle = createBeveledCylinder(
    0.38,
    0.34,
    1.15,
    0.04,
    20,
    M249_PALETTE.PARKERIZED_STEEL
  )
    .rotateX(Math.PI / 2)
    .translate(2.65, 0, 1.05);

  return mergeParts([
    guideRail,
    internalCarrierDog,
    frontDetentLatch,
    knobStem,
    knurledHandle,
  ]);
}

/**
 * B-08: Long Helical Driving / Recoil Spring & Captive Guide Rod
 * (assembledPos: [-6.10, 0.85, 0] — local X in [-8.50, +8.50], L0 = 17.00 cm)
 * Carries valid X-axis `aSpringParam` (`w = 1`) via `createWatertightHelicalSpring`!
 */
export function buildM249RecoilSpringGeometry(): THREE.BufferGeometry {
  const springCoils = createWatertightHelicalSpring(
    {
      axis: 'x',
      start: -8.5,
      end: 8.5,
      coilRadius: 0.42,
      wireRadius: 0.068,
      coils: 28,
      radialSegments: 10,
      tubularSegmentsPerCoil: 18,
    },
    M249_PALETTE.SPRING_WIRE
  );

  // Rear receiver anchor plate & front captive plunger nose (`w = 0` end fittings)
  const rearAnchorBase = createBeveledCylinder(
    0.58,
    0.58,
    0.34,
    0.03,
    20,
    M249_PALETTE.BURNISHED_STEEL
  )
    .rotateZ(Math.PI / 2)
    .translate(-8.72, 0, 0);

  const frontPlungerNose = createBeveledCylinder(
    0.26,
    0.34,
    0.44,
    0.03,
    18,
    M249_PALETTE.HARD_CHROME
  )
    .rotateZ(Math.PI / 2)
    .translate(8.76, 0, 0);

  return mergeParts([springCoils, rearAnchorBase, frontPlungerNose]);
}

/**
 * B-09: Rear Stock-Mounted Hydraulic Recoil Buffer Assembly
 * (assembledPos: [-16.60, 0.85, 0])
 */
export function buildM249HydraulicBufferGeometry(): THREE.BufferGeometry {
  const damperCylinder = buildRevolvedX(
    [
      [0, -3.15],
      [0.64, -3.15],
      [0.68, -2.95],
      [0.68, -0.35],
      [0.78, -0.25], // Receiver backplate mounting flange
      [0.78, 0.35],
      [0.58, 0.45],
      [0.58, 1.45], // Metered orifice seal housing
      [0.38, 1.52], // Protruding hardened hydraulic plunger piston!
      [0.38, 2.48],
      [0.32, 2.58],
      [0, 2.58],
    ],
    26,
    M249_PALETTE.HARD_CHROME
  );

  const receiverBackplateBlock = createChamferedBox(
    0.72,
    1.58,
    1.46,
    0.04,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(0.05, -0.06, 0);

  return mergeParts([damperCylinder, receiverBackplateBlock]);
}

// ============================================================================
// 2. OPEN-BOLT SEAR, TRIGGER PACK & SAFETY ('fire_control' FC-01..04)
// ============================================================================

/**
 * FC-01: Pinned Trigger Mechanism Frame, Ergonomic Pistol Grip & Cross-Bolt Safety
 * (assembledPos: [-8.20, -4.60, 0])
 */
export function buildM249TriggerFrameGeometry(): THREE.BufferGeometry {
  // Upper steel trigger housing walls & mounting lugs (X in [-5.8, +3.9], Y in [+0.8, +2.45])
  const leftWall = createChamferedBox(
    9.4,
    1.55,
    0.26,
    0.025,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(-0.95, 1.62, -0.92);

  const rightWall = createChamferedBox(
    9.4,
    1.55,
    0.26,
    0.025,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(-0.95, 1.62, 0.92);

  const housingFloor = createChamferedBox(
    8.8,
    0.34,
    1.62,
    0.025,
    M249_PALETTE.PARKERIZED_DARK
  ).translate(-0.95, 0.92, 0);

  // Front & rear captive receiver takedown pin bosses
  const frontPinBoss = createBeveledCylinder(
    0.34,
    0.34,
    2.28,
    0.03,
    18,
    M249_PALETTE.BURNISHED_STEEL
  )
    .rotateX(Math.PI / 2)
    .translate(3.35, 2.05, 0);

  const rearPinBoss = createBeveledCylinder(
    0.34,
    0.34,
    2.28,
    0.03,
    18,
    M249_PALETTE.BURNISHED_STEEL
  )
    .rotateX(Math.PI / 2)
    .translate(-5.25, 2.05, 0);

  // Push-button cross-bolt safety w/ crimson FIRE band
  const safetyBolt = createBeveledCylinder(
    0.26,
    0.26,
    2.48,
    0.025,
    18,
    M249_PALETTE.PARKERIZED_MID
  )
    .rotateX(Math.PI / 2)
    .translate(0.45, 1.38, 0);

  const safetyRedRing = createBeveledCylinder(
    0.275,
    0.275,
    0.28,
    0.015,
    18,
    M249_PALETTE.SAFETY_RED
  )
    .rotateX(Math.PI / 2)
    .translate(0.45, 1.38, -1.06);

  // Oversized arctic/winter trigger guard bow (world X stays <= -4.25 to clear ammo box!)
  const guardShape = new THREE.Shape();
  guardShape.moveTo(3.85, 0.85);
  guardShape.lineTo(3.95, -1.65);
  guardShape.quadraticCurveTo(3.65, -2.55, 1.85, -2.62);
  guardShape.lineTo(-0.35, -2.52);
  guardShape.lineTo(-0.55, -1.95);
  guardShape.lineTo(1.75, -2.18);
  guardShape.quadraticCurveTo(3.28, -2.12, 3.48, -1.45);
  guardShape.lineTo(3.38, 0.85);
  guardShape.closePath();
  const triggerGuard = extrudeShapeZ(
    guardShape,
    0,
    0.88,
    M249_PALETTE.POLYMER_CHARCOAL,
    0.035
  );

  // Raked ribbed M249 polymer pistol grip
  const gripShape = new THREE.Shape();
  gripShape.moveTo(-0.35, 0.95);
  gripShape.lineTo(-3.45, 0.95);
  gripShape.quadraticCurveTo(-4.15, -0.4, -5.35, -6.15);
  gripShape.quadraticCurveTo(-5.45, -6.65, -4.75, -6.72);
  gripShape.lineTo(-2.05, -6.58);
  gripShape.quadraticCurveTo(-1.55, -6.45, -1.42, -5.85);
  gripShape.quadraticCurveTo(-0.75, -2.85, -0.25, -1.35);
  gripShape.closePath();
  const pistolGrip = extrudeShapeZ(
    gripShape,
    0,
    2.68,
    M249_PALETTE.POLYMER_CHARCOAL,
    0.18
  );

  // Grip trapdoor basecap
  const gripBase = createChamferedBox(
    3.15,
    0.42,
    2.76,
    0.05,
    M249_PALETTE.RUBBER_PAD
  )
    .rotateZ(0.06)
    .translate(-3.42, -6.62, 0);

  return mergeParts([
    leftWall,
    rightWall,
    housingFloor,
    frontPinBoss,
    rearPinBoss,
    safetyBolt,
    safetyRedRing,
    triggerGuard,
    pistolGrip,
    gripBase,
  ]);
}

/**
 * FC-02: Curved Steel LMG Trigger & Sear Linkage
 * (assembledPos: [-6.40, -3.20, 0])
 */
export function buildM249TriggerGeometry(): THREE.BufferGeometry {
  const shoeShape = new THREE.Shape();
  shoeShape.moveTo(-0.28, 1.15);
  shoeShape.lineTo(0.42, 1.15);
  shoeShape.lineTo(0.56, 0.15);
  shoeShape.quadraticCurveTo(0.28, -1.15, 0.78, -2.18);
  shoeShape.quadraticCurveTo(0.86, -2.38, 0.56, -2.42);
  shoeShape.quadraticCurveTo(-0.18, -1.25, 0.02, 0.12);
  shoeShape.closePath();

  const triggerShoe = extrudeShapeZ(
    shoeShape,
    0,
    0.66,
    M249_PALETTE.PARKERIZED_STEEL,
    0.04
  );

  const searTripArm = createChamferedBox(
    1.85,
    0.42,
    0.78,
    0.03,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-0.35, 1.02, 0);

  const pivotPin = createBeveledCylinder(
    0.18,
    0.18,
    1.12,
    0.02,
    16,
    M249_PALETTE.HARD_CHROME
  )
    .rotateX(Math.PI / 2)
    .translate(0.12, 0.92, 0);

  return mergeParts([triggerShoe, searTripArm, pivotPin]);
}

/**
 * FC-03: Heavy Hardened Open-Bolt Sear Catch
 * (assembledPos: [-7.80, -1.55, 0])
 * Upward hardened sear nose at local X = +0.60, Y = +0.56 catches `m249_piston_carrier`!
 */
export function buildM249OpenBoltSearGeometry(): THREE.BufferGeometry {
  const searShape = new THREE.Shape();
  searShape.moveTo(-1.95, -0.36);
  searShape.lineTo(1.92, -0.36);
  searShape.lineTo(1.98, 0.08);
  searShape.lineTo(0.95, 0.16);
  searShape.lineTo(0.82, 0.58); // Hardened vertical open-bolt sear catch face!
  searShape.lineTo(0.32, 0.58);
  searShape.lineTo(-0.15, 0.18);
  searShape.lineTo(-1.95, 0.14);
  searShape.closePath();

  const searBody = extrudeShapeZ(
    searShape,
    0,
    1.04,
    M249_PALETTE.BURNISHED_STEEL,
    0.035
  );

  const searAxle = createBeveledCylinder(
    0.2,
    0.2,
    1.48,
    0.02,
    16,
    M249_PALETTE.HARD_CHROME
  )
    .rotateX(Math.PI / 2)
    .translate(-1.42, -0.1, 0);

  return mergeParts([searBody, searAxle]);
}

/**
 * FC-04: Helical Open-Bolt Sear Return Spring
 * (assembledPos: [-7.20, -2.65, 0], assembledRot: [0, 0, Math.PI / 2])
 * Uses `createWatertightHelicalSpring({ axis: 'x', ... })` so `aSpringParam` has `w = 1`!
 */
export function buildM249SearSpringGeometry(): THREE.BufferGeometry {
  const coils = createWatertightHelicalSpring(
    {
      axis: 'x',
      start: -0.75,
      end: 0.75,
      coilRadius: 0.23,
      wireRadius: 0.042,
      coils: 8,
      radialSegments: 10,
      tubularSegmentsPerCoil: 18,
    },
    M249_PALETTE.SPRING_WIRE
  );

  const bottomSeatCup = createBeveledCylinder(
    0.29,
    0.29,
    0.16,
    0.02,
    16,
    M249_PALETTE.PARKERIZED_MID
  )
    .rotateZ(Math.PI / 2)
    .translate(-0.85, 0, 0);

  return mergeParts([coils, bottomSeatCup]);
}

// ============================================================================
// 3. DUAL-PAWL BELT SHUTTLE, FEED TRAY, M27 BELT & 200-RD BOX ('magazine' M-01..05)
// ============================================================================

/**
 * M-01: Stamped Steel Ribbed 5.56mm Belt Feed Tray w/ Cartridge Stop
 * (assembledPos: [-0.80, 1.40, 0])
 */
export function buildM249FeedTrayGeometry(): THREE.BufferGeometry {
  // Cross-section in (Z, Y) extruded along X in [-3.55, +3.55]:
  // Left smooth rolled belt-entry horn (Z = -3.10) -> central semicylindrical cartridge trough (Z = 0) -> right stop (Z = +1.95)
  const trayShape = new THREE.Shape();
  trayShape.moveTo(-3.1, -0.34);
  trayShape.quadraticCurveTo(-2.65, 0.12, -1.85, 0.14);
  trayShape.lineTo(-0.45, 0.14);
  trayShape.quadraticCurveTo(0, -0.18, 0.45, 0.14); // Central 5.56mm cartridge cradle!
  trayShape.lineTo(1.55, 0.14);
  trayShape.lineTo(1.75, 0.38); // Right-side positive cartridge stop wall!
  trayShape.lineTo(1.98, 0.38);
  trayShape.lineTo(1.98, -0.12);
  trayShape.lineTo(-2.35, -0.16);
  trayShape.quadraticCurveTo(-2.75, -0.18, -2.92, -0.44);
  trayShape.closePath();

  const trayDeck = extrudeShapeX(
    trayShape,
    -3.55,
    7.1,
    M249_PALETTE.PARKERIZED_STEEL,
    0.025
  );

  // Stamped transverse anti-friction stiffening ribs
  const ribParts: THREE.BufferGeometry[] = [trayDeck];
  for (const rx of [-2.4, -0.8, 0.8, 2.4]) {
    ribParts.push(
      createChamferedBox(
        0.38,
        0.14,
        3.65,
        0.02,
        M249_PALETTE.BURNISHED_STEEL
      ).translate(rx, 0.12, -0.42)
    );
  }

  // Front pivot hinge ears
  const hingePin = createBeveledCylinder(
    0.2,
    0.2,
    3.6,
    0.02,
    16,
    M249_PALETTE.PARKERIZED_MID
  )
    .rotateX(Math.PI / 2)
    .translate(3.45, -0.05, -0.2);

  ribParts.push(hingePin);
  return mergeParts(ribParts);
}

/**
 * M-02: Pivoting S-Forked Belt Feed Cam Lever
 * (assembledPos: [-1.20, 3.05, 0])
 * Rear fork straddles `m249_piston_carrier`'s top roller; front tongue drives `m249_feed_pawls`!
 */
export function buildM249FeedLeverGeometry(): THREE.BufferGeometry {
  const leverSpine = createChamferedBox(
    7.8,
    0.28,
    0.72,
    0.03,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-2.1, 0, 0);

  // Rear roller-cam fork (X in [-7.95, -5.65])
  const rearForkLeft = createChamferedBox(
    2.45,
    0.34,
    0.28,
    0.025,
    M249_PALETTE.HARD_CHROME
  ).translate(-6.75, -0.12, -0.46);

  const rearForkRight = createChamferedBox(
    2.45,
    0.34,
    0.28,
    0.025,
    M249_PALETTE.HARD_CHROME
  ).translate(-6.75, -0.12, 0.46);

  // Top-cover central vertical pivot stud
  const coverPivotStud = createBeveledCylinder(
    0.42,
    0.42,
    0.64,
    0.03,
    20,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(-1.45, 0.12, 0);

  // Front shuttle-actuating tongue engaging `m249_feed_pawls`
  const frontShuttleTongue = createChamferedBox(
    1.85,
    0.38,
    0.52,
    0.03,
    M249_PALETTE.HARD_CHROME
  ).translate(2.15, -0.18, -0.15);

  return mergeParts([
    leverSpine,
    rearForkLeft,
    rearForkRight,
    coverPivotStud,
    frontShuttleTongue,
  ]);
}

/**
 * M-03: Dual-Stage Shuttle Feed Slide & Holding Pawls
 * (assembledPos: [-0.80, 2.28, -0.65] — sits cleanly above M27 belt cartridges!)
 */
export function buildM249FeedPawlsGeometry(): THREE.BufferGeometry {
  // Lateral shuttle slide carrier bar
  const shuttleSlide = createChamferedBox(
    4.5,
    0.34,
    3.15,
    0.03,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(0, 0.14, 0);

  const leverSlotBoss = createChamferedBox(
    1.25,
    0.32,
    0.95,
    0.025,
    M249_PALETTE.HARD_CHROME
  ).translate(0.95, 0.34, 0.42);

  // Outer & inner spring-loaded ratcheting feed pawls (angled teeth hooking M27 links!)
  const pawlOuterA = createChamferedBox(
    0.72,
    0.32,
    0.62,
    0.025,
    M249_PALETTE.BURNISHED_STEEL
  )
    .rotateX(0.24)
    .translate(-1.25, -0.14, -1.18);

  const pawlOuterB = createChamferedBox(
    0.72,
    0.32,
    0.62,
    0.025,
    M249_PALETTE.BURNISHED_STEEL
  )
    .rotateX(0.24)
    .translate(1.25, -0.14, -1.18);

  const pawlInnerA = createChamferedBox(
    0.72,
    0.32,
    0.62,
    0.025,
    M249_PALETTE.BURNISHED_STEEL
  )
    .rotateX(0.22)
    .translate(-1.25, -0.14, 0.18);

  const pawlInnerB = createChamferedBox(
    0.72,
    0.32,
    0.62,
    0.025,
    M249_PALETTE.BURNISHED_STEEL
  )
    .rotateX(0.22)
    .translate(1.25, -0.14, 0.18);

  return mergeParts([
    shuttleSlide,
    leverSlotBoss,
    pawlOuterA,
    pawlOuterB,
    pawlInnerA,
    pawlInnerB,
  ]);
}

/**
 * Helper building one 1:1 5.56x45mm NATO M855 cartridge + M27 disintegrating steel link
 * centered around `x = 0` (`X in [-2.85, +2.89]`, exact 57.4mm NATO OAL!).
 */
function buildSingleLinkedM855Round(
  includeRightBridgeLoop: boolean
): THREE.BufferGeometry {
  // 1. C26000 5.56x45mm brass case (X in [-2.85, +1.62])
  const brassCase = buildRevolvedX(
    [
      [0, -2.85],
      [0.47, -2.85],
      [0.48, -2.74],
      [0.42, -2.68], // Extractor groove
      [0.42, -2.54],
      [0.48, -2.46], // Case head web
      [0.46, 0.68], // Tapered body
      [0.33, 1.04], // 23° STANAG shoulder
      [0.32, 1.62], // Case neck
      [0, 1.62],
    ],
    18,
    M249_PALETTE.BRASS_556
  );

  // 2. Copper FMJ ogive body (X in [+1.56, +2.44])
  const copperOgive = buildRevolvedX(
    [
      [0, 1.56],
      [0.285, 1.56],
      [0.282, 1.88],
      [0.235, 2.18],
      [0.155, 2.44],
      [0, 2.44],
    ],
    16,
    M249_PALETTE.COPPER_FMJ
  );

  // 3. NATO M855 SS109 Green Penetrator Tip (X in [+2.40, +2.89])
  const greenTip = buildRevolvedX(
    [
      [0, 2.4],
      [0.16, 2.4],
      [0.095, 2.68],
      [0.032, 2.86],
      [0, 2.89],
    ],
    16,
    M249_PALETTE.M855_GREEN_TIP
  );

  // 4. Stamped black-phosphate M27 disintegrating steel double-loop link!
  const rearClip = buildRevolvedX(
    [
      [0.465, -1.65],
      [0.545, -1.65],
      [0.545, -0.85],
      [0.465, -0.85],
      [0.465, -1.65],
    ],
    18,
    M249_PALETTE.M27_LINK_BLACK
  );

  const frontClip = buildRevolvedX(
    [
      [0.455, -0.15],
      [0.535, -0.15],
      [0.535, 0.58],
      [0.455, 0.58],
      [0.455, -0.15],
    ],
    18,
    M249_PALETTE.M27_LINK_BLACK
  );

  const spineTab = createChamferedBox(
    2.35,
    0.16,
    0.48,
    0.02,
    M249_PALETTE.M27_LINK_BLACK
  ).translate(-0.52, 0.54, 0);

  const parts = [
    brassCase,
    copperOgive,
    greenTip,
    rearClip,
    frontClip,
    spineTab,
  ];

  if (includeRightBridgeLoop) {
    const hingeEar = createChamferedBox(
      0.72,
      0.22,
      0.86,
      0.02,
      M249_PALETTE.M27_LINK_BLACK
    ).translate(-0.52, 0.48, 0.68);
    parts.push(hingeEar);
  }

  return mergeParts(parts);
}

/**
 * M-04: Linked M27 Disintegrating Metallic Belt Segment (7 Rounds)
 * (assembledPos: [-0.80, 0.20, -2.85])
 * Bridges in a realistic catenary drape from inside the 200-rd SAW box feed throat
 * (`world Y ≈ -3.3, Z ≈ -3.6`) up over the left feed horn onto `m249_feed_tray`!
 */
export function buildM249M27BeltGeometry(): THREE.BufferGeometry {
  // 7 linked M855 rounds curving smoothly from feed tray (local Y=+1.28, Z=+1.50) down into box (local Y=-3.35, Z=-0.85)
  const stations: ReadonlyArray<readonly [number, number, number]> = [
    // [localY, localZ, rollRx]
    [1.28, 1.5, 0.02], // On feed tray (Slot 1 position, Z_world = -1.35!)
    [1.24, 0.24, 0.16], // Feed horn crest (Z_world = -2.61)
    [0.82, -0.82, 0.58], // Entering left feed throat (Z_world = -3.67)
    [-0.12, -1.32, 1.05], // Upper drape
    [-1.18, -1.42, 1.38], // Mid drape
    [-2.26, -1.24, 1.48], // Entering SAW box feed neck
    [-3.32, -0.96, 1.52], // Inside upper 200-rd SAW box!
  ];

  const beltParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < stations.length; i++) {
    const [ly, lz, rx] = stations[i];
    const round = buildSingleLinkedM855Round(i > 0);
    round.rotateX(rx);
    round.translate(0, ly, lz);
    beltParts.push(round);
  }

  return mergeParts(beltParts);
}

/**
 * M-05: 200-Round Ribbed OD-Green Polymer SAW Assault Box (`isShell: true`)
 * (assembledPos: [1.50, -7.80, -0.65] -> world X in [-3.90, +6.90], clears trigger guard!)
 */
export function buildM249AmmoBoxGeometry(): THREE.BufferGeometry {
  // Hollow-top ribbed polymer box body extruded vertically along Y in [-5.45, +4.35]
  const outerFootprint = new THREE.Shape();
  outerFootprint.moveTo(-4.85, -4.55);
  outerFootprint.lineTo(4.85, -4.55);
  outerFootprint.quadraticCurveTo(5.32, -4.55, 5.32, -4.05);
  outerFootprint.lineTo(5.32, 3.85);
  outerFootprint.quadraticCurveTo(5.32, 4.35, 4.85, 4.35);
  outerFootprint.lineTo(-4.85, 4.35);
  outerFootprint.quadraticCurveTo(-5.32, 4.35, -5.32, 3.85);
  outerFootprint.lineTo(-5.32, -4.05);
  outerFootprint.quadraticCurveTo(-5.32, -4.55, -4.85, -4.55);
  outerFootprint.closePath();

  const mainBox = extrudeShapeY(
    outerFootprint,
    -5.45,
    9.65,
    M249_PALETTE.OD_GREEN_BOX,
    0.16
  );

  // Molded external vertical reinforcing ribs on front/rear/flanks
  const ribs: THREE.BufferGeometry[] = [mainBox];
  for (const rx of [-3.4, -1.15, 1.15, 3.4]) {
    ribs.push(
      createChamferedBox(
        0.42,
        8.4,
        9.18,
        0.05,
        M249_PALETTE.OD_GREEN_BOX
      ).translate(rx, -0.62, -0.1)
    );
  }

  // Charcoal polymer snap-on top lid & central T-slot receiver mounting bracket
  const topLid = createChamferedBox(
    10.82,
    0.72,
    9.12,
    0.06,
    M249_PALETTE.POLYMER_CHARCOAL
  ).translate(0, 4.48, -0.1);

  const receiverDovetailBracket = createChamferedBox(
    6.4,
    0.92,
    2.45,
    0.04,
    M249_PALETTE.POLYMER_CHARCOAL
  ).translate(-0.65, 5.18, 0.65);

  // Left-side angled M27 belt feed-chute neck leading toward receiver feed throat!
  const feedChuteNeck = createChamferedBox(
    6.6,
    1.85,
    1.95,
    0.06,
    M249_PALETTE.POLYMER_CHARCOAL
  )
    .rotateX(-0.22)
    .translate(-1.85, 5.15, -3.55);

  ribs.push(topLid, receiverDovetailBracket, feedChuteNeck);
  return mergeParts(ribs);
}
