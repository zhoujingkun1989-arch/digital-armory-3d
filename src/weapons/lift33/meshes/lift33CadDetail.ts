import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CURVATURE_ATTRIBUTE,
  SPRING_PARAM_ATTRIBUTE,
} from '../../../engine/geometry/curvatureBuilder';
import { paintGeometry } from '../../../engine/geometry/csgBuilder';

/**
 * Authentic Mathews LIFT 33 SwitchWeight-X palette.
 * Every color stays well above Khronos PBR anti-black-crush luma (>= 0.018 linear).
 */
export const LIFT33_PALETTE = {
  RISER_ANODIZED: '#384352',
  RISER_DARK: '#28303b',
  RISER_MACHINED: '#617085',
  CARBON_LIMB: '#2b323c',
  CARBON_GLASS_EDGE: '#465161',
  CARBON_ROD: '#272d36',
  GRIP_POLYMER: '#303843',
  GRIP_INLAY: '#404a58',
  CAM_BRONZE: '#bc813c',
  CAM_GOLD: '#d49a4e',
  CAM_DARK: '#453528',
  TITANIUM_SILVER: '#cad4e0',
  BRIGHT_STEEL: '#e2e8f0',
  STRING_BCYX: '#6c7988',
  SERVING_DARK: '#2d3540',
  DAMPER_ORANGE: '#e07a22',
  FIBER_GREEN: '#22c55e',
  FIBER_RED: '#ef4444',
  FIBER_AMBER: '#f59e0b',
  BRASS_NOCK: '#d6a44b',
  BROADHEAD_STEEL: '#d4dde8',
  HOOD_FOAM: '#2a303a',
} as const;

export const SPRING_AXIS_MODE_FLEX = 3;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

/**
 * Strips degenerate zero-area CSG sliver triangles, ensures non-indexed attributes,
 * normalizes vertex normals to unit length, and PRESERVES `aCurvature` & `aSpringParam`.
 */
export function sanitizeLift33Mesh(
  geo: THREE.BufferGeometry
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

        cArr[di * 3] = col ? col.getX(si) : 0.5;
        cArr[di * 3 + 1] = col ? col.getY(si) : 0.5;
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.5;

        if (kArr && curv) {
          kArr[di] = curv.getX(si);
        }
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
    if (kArr) out.setAttribute(CURVATURE_ATTRIBUTE, new THREE.BufferAttribute(kArr, 1));
    if (sArr) out.setAttribute(SPRING_PARAM_ATTRIBUTE, new THREE.BufferAttribute(sArr, 4));
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
  return out;
}

/**
 * Attaches `aSpringParam = [dx, dy, dz, 3]` (`SPRING_AXIS_MODE_FLEX`) across ALL vertices
 * of a flexing bow limb, bowstring, yoke cable, or cam axle geometry.
 * Pinned vertices use `[0, 0, 0, 3]` (never `w = 0` so shader never applies X-coil stretch!).
 */
export function attachFlexAttribute(
  geo: THREE.BufferGeometry,
  computeDelta: (x: number, y: number, z: number) => readonly [number, number, number]
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const count = pos.count;
  const arr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const [dx, dy, dz] = computeDelta(pos.getX(i), pos.getY(i), pos.getZ(i));
    const o = i * 4;
    arr[o] = dx;
    arr[o + 1] = dy;
    arr[o + 2] = dz;
    arr[o + 3] = SPRING_AXIS_MODE_FLEX;
  }
  geo.setAttribute(SPRING_PARAM_ATTRIBUTE, new THREE.BufferAttribute(arr, 4));
  return geo;
}

/** Closed solid of revolution around +X from `(r, x)` profile (r >= 0). */
export function latheAlongX(
  profile: ReadonlyArray<readonly [number, number]>,
  segments: number,
  color: string
): THREE.BufferGeometry {
  const pts = profile.map(([r, x]) => new THREE.Vector2(r, x));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.rotateZ(-Math.PI / 2);
  return paintGeometry(geo, color);
}

/** Closed solid of revolution around +Y from `(r, y)` profile (r >= 0). */
export function latheAlongY(
  profile: ReadonlyArray<readonly [number, number]>,
  segments: number,
  color: string
): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, segments);
  return paintGeometry(geo, color);
}

/** Extrudes an (X, Y) Shape symmetrically along Z around `zCenter`. */
export function extrudeShapeZ(
  shape: THREE.Shape,
  zCenter: number,
  thickness: number,
  color: string,
  chamfer = 0.025,
  curveSegments = 12
): THREE.BufferGeometry {
  const c = Math.min(Math.max(chamfer, 0), thickness * 0.32);
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

/** Extrudes a cross-section drawn in (Z, Y) along +X from `x0` to `x0 + len`. */
export function extrudeShapeX(
  shape: THREE.Shape,
  x0: number,
  len: number,
  color: string,
  chamfer = 0.02,
  curveSegments = 10
): THREE.BufferGeometry {
  const c = Math.min(Math.max(chamfer, 0), len * 0.3);
  const depth = Math.max(1e-3, len - 2 * c);
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

/** Extrudes an (X, Z) footprint vertically along +Y from `y0` to `y0 + height`. */
export function extrudeShapeY(
  shape: THREE.Shape,
  y0: number,
  height: number,
  color: string,
  chamfer = 0.02,
  curveSegments = 10
): THREE.BufferGeometry {
  const c = Math.min(Math.max(chamfer, 0), height * 0.3);
  const depth = Math.max(1e-3, height - 2 * c);
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
 * Builds a strictly watertight, positive-volume closed tube swept along a polyline `points`
 * using parallel-transport Bishop frames and clean capped end faces.
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
  if (nPts < 2) {
    throw new Error('buildWatertightTube requires at least 2 points');
  }

  // Compute tangents & parallel-transport normals along polyline
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < nPts; i++) {
    const t = new THREE.Vector3();
    if (closedLoop) {
      const prev = points[(i - 1 + nPts) % nPts];
      const next = points[(i + 1) % nPts];
      t.subVectors(next, prev);
    } else if (i === 0) {
      t.subVectors(points[1], points[0]);
    } else if (i === nPts - 1) {
      t.subVectors(points[nPts - 1], points[nPts - 2]);
    } else {
      t.subVectors(points[i + 1], points[i - 1]);
    }
    if (t.lengthSq() < 1e-12) t.set(0, 1, 0);
    else t.normalize();
    tangents.push(t);
  }

  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];
  const firstT = tangents[0];
  const ref = Math.abs(firstT.z) < 0.85 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
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
      const angle = Math.atan2(sinA, THREE.MathUtils.clamp(prevT.dot(currT), -1, 1));
      nPrev.applyAxisAngle(rotAxis, angle);
    }
    nPrev.sub(currT.clone().multiplyScalar(nPrev.dot(currT))).normalize();
    const bCurr = new THREE.Vector3().crossVectors(currT, nPrev).normalize();
    normals.push(nPrev);
    binormals.push(bCurr);
  }

  const ringCount = closedLoop ? nPts : nPts;
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i < ringCount; i++) {
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
      const a = r0[s];
      const b = r0[sNext];
      const c = r1[sNext];
      const d = r1[s];
      // Outward winding around tangent: (n x b) = -t? Let's verify:
      // cross(t, n) = b, so cross(n, b) = t (tangent direction).
      // As s increases from n (a=0) toward b (a=pi/2), vector goes in +b, next ring is +t.
      // Cross((d-a)=+t, (b-a)=+b) = -n (inward!). So outward is (a, b, c) + (a, c, d)!
      // Wait: (b-a) x (d-a) = (+b) x (+t) = +n (OUTWARD!).
      pushTri(a, b, c);
      pushTri(a, c, d);
    }
  }

  if (!closedLoop) {
    // Start cap: normal points -tangent[0]
    const pStart = points[0];
    const rStart = rings[0];
    for (let s = 0; s < rSeg; s++) {
      const sNext = (s + 1) % rSeg;
      pushTri(pStart, rStart[sNext], rStart[s]);
    }
    // End cap: normal points +tangent[n-1]
    const pEnd = points[nPts - 1];
    const rEnd = rings[nPts - 1];
    for (let s = 0; s < rSeg; s++) {
      const sNext = (s + 1) % rSeg;
      pushTri(pEnd, rEnd[s], rEnd[sNext]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data), 3));
  geo.computeVertexNormals();
  return paintGeometry(geo, color);
}

/**
 * Builds a watertight chamfered parabolic bow limb blade along a 2D (x, y) centerline spine
 * centered at `zCenter`, with smoothly tapered height-thickness `halfThick(u)` and width `halfZ(u)`.
 */
export function buildChamferedLimbBlade(
  spineXY: ReadonlyArray<readonly [number, number]>,
  zCenter: number,
  halfThickFn: (u: number) => number,
  halfZFn: (u: number) => number,
  chamferFrac: number,
  color: string
): THREE.BufferGeometry {
  const n = spineXY.length;
  const rings: THREE.Vector3[][] = [];

  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const [x, y] = spineXY[i];
    const iPrev = Math.max(0, i - 1);
    const iNext = Math.min(n - 1, i + 1);
    const tx = spineXY[iNext][0] - spineXY[iPrev][0];
    const ty = spineXY[iNext][1] - spineXY[iPrev][1];
    const len = Math.max(1e-8, Math.hypot(tx, ty));
    // Planar normal in XY perpendicular to tangent (pointing roughly +Y / -X)
    const nx = -ty / len;
    const ny = tx / len;

    const ht = halfThickFn(u);
    const hz = halfZFn(u);
    const ch = Math.min(ht, hz) * chamferFrac;

    // 8-point octagon profile CCW in (normal_XY, Z) plane when viewed from +tangent!
    // Wait: tangent points roughly (-X, +Y). Let's check cross(normal_XY, +Z):
    // If t = (tx, ty, 0), n = (-ty, tx, 0), z = (0, 0, 1):
    // n x z = (tx, ty, 0) = +t!
    // So CCW around +t goes from +n -> -z -> -n -> +z? Wait: n x (-z) = -t, z x n = -t, n x z = +t.
    // Right-hand rule around +t: (+n) x (+z) = +t, so (+z) -> (+n) -> (-z) -> (-n) is CCW around +t?
    // Let's check: (+z) cross (+n) = -t (Wait: i x j = k. Let e1 = +n, e2 = +z, then e1 x e2 = +t!
    // For CCW around +t = e1 x e2, angle increases from e1 (+n) toward e2 (+z)!)
    const prof: Array<[number, number]> = [
      [ht, hz - ch],
      [ht - ch, hz],
      [-(ht - ch), hz],
      [-ht, hz - ch],
      [-ht, -(hz - ch)],
      [-(ht - ch), -hz],
      [ht - ch, -hz],
      [ht, -(hz - ch)],
    ];

    const ring: THREE.Vector3[] = [];
    for (const [dn, dz] of prof) {
      ring.push(new THREE.Vector3(x + nx * dn, y + ny * dn, zCenter + dz));
    }
    rings.push(ring);
  }

  const data: number[] = [];
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    data.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  for (let i = 0; i < n - 1; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    for (let s = 0; s < 8; s++) {
      const sNext = (s + 1) % 8;
      // r0[s] -> r0[sNext] moves in +CCW around +t; r0[s] -> r1[s] moves in +t
      // Outward normal around +t: (r0[sNext] - r0[s]) x (r1[s] - r0[s]) = (+theta) x (+t) = +radial outward!
      pushTri(r0[s], r0[sNext], r1[sNext]);
      pushTri(r0[s], r1[sNext], r1[s]);
    }
  }

  // Start cap (-tangent)
  const c0 = new THREE.Vector3(spineXY[0][0], spineXY[0][1], zCenter);
  for (let s = 0; s < 8; s++) {
    const sNext = (s + 1) % 8;
    pushTri(c0, rings[0][sNext], rings[0][s]);
  }
  // End cap (+tangent)
  const c1 = new THREE.Vector3(spineXY[n - 1][0], spineXY[n - 1][1], zCenter);
  for (let s = 0; s < 8; s++) {
    const sNext = (s + 1) % 8;
    pushTri(c1, rings[n - 1][s], rings[n - 1][sNext]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data), 3));
  geo.computeVertexNormals();
  return paintGeometry(geo, color);
}

/** Merges multiple CSG cutter solids into a single attribute-normalized brush. */
export function mergeCutters(
  cutters: THREE.BufferGeometry[],
  color = '#1e293b'
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
      uv ?? new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2)
    );
    return clean;
  });
  const merged = mergeGeometries(prepared, false);
  for (const p of prepared) p.dispose();
  for (const c of cutters) c.dispose();
  return paintGeometry(merged, color);
}

/** Creates a closed 6-point hex-head socket bolt oriented along X, Y, or Z. */
export function buildHexBolt(
  headR: number,
  headH: number,
  shaftR: number,
  shaftL: number,
  color: string
): THREE.BufferGeometry {
  const head = paintGeometry(new THREE.CylinderGeometry(headR, headR, headH, 6), color);
  head.translate(0, headH * 0.5, 0);
  const flange = paintGeometry(
    new THREE.CylinderGeometry(headR * 1.18, headR * 1.18, headH * 0.25, 16),
    color
  );
  flange.translate(0, headH * 0.125, 0);
  const shaft = paintGeometry(
    new THREE.CylinderGeometry(shaftR, shaftR, shaftL, 14),
    color
  );
  shaft.translate(0, -shaftL * 0.5, 0);
  const merged = mergeGeometries(
    [head.toNonIndexed(), flange.toNonIndexed(), shaft.toNonIndexed()],
    false
  );
  head.dispose();
  flange.dispose();
  shaft.dispose();
  return paintGeometry(merged, color);
}
