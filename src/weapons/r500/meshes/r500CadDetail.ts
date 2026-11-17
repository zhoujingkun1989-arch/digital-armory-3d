import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CURVATURE_ATTRIBUTE,
  paintGeometry,
  SPRING_PARAM_ATTRIBUTE,
} from '../../../engine/geometry/csgBuilder';

/** Flex mode flag stored in `aSpringParam.w` (matches `SPRING_AXIS_MODE_FLEX = 3`). */
export const R500_SPRING_MODE_FLEX = 3;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

/**
 * Strips degenerate zero-area CSG triangles, preserves `aCurvature` & `aSpringParam`,
 * enforces unit-length normals (`|n| = 1`), and recomputes bounds.
 */
export function sanitizeR500Mesh(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
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
    const curvArr = curv ? new Float32Array(nV) : null;
    const spArr = sp ? new Float32Array(nV * 4) : null;

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

        if (curvArr && curv) {
          curvArr[di] = curv.getX(si);
        }
        if (spArr && sp) {
          spArr[di * 4] = sp.getX(si);
          spArr[di * 4 + 1] = sp.getY(si);
          spArr[di * 4 + 2] = sp.getZ(si);
          spArr[di * 4 + 3] = sp.getW(si);
        }
      }
    }

    out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nArr, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uArr, 2));
    out.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
    if (curvArr) {
      out.setAttribute(
        CURVATURE_ATTRIBUTE,
        new THREE.BufferAttribute(curvArr, 1)
      );
    }
    if (spArr) {
      out.setAttribute(
        SPRING_PARAM_ATTRIBUTE,
        new THREE.BufferAttribute(spArr, 4)
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
  return out;
}

/** Revolves an `(r, x)` profile around `+X` (axis points along `+X`). */
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

/**
 * Extrudes a cross-section drawn in `(Z, Y)` along `+X` from `x0` to `x0 + len`.
 * `chamfer > 0` bevels corners inward without expanding the outer boundary.
 */
export function extrudeAlongX(
  shape: THREE.Shape,
  x0: number,
  len: number,
  color: string,
  chamfer = 0,
  curveSegments = 8
): THREE.BufferGeometry {
  const c = Math.min(chamfer, len * 0.3);
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

/**
 * Extrudes a cross-section drawn in `(X, Z)` vertically along `+Y` from `y0` to `y0 + height`.
 * Note: `rotateX(-Math.PI/2)` maps `shape.x -> +X`, `shape.y -> +Z`, `extrude +Z -> +Y`.
 */
export function extrudeAlongY(
  shape: THREE.Shape,
  y0: number,
  height: number,
  color: string,
  chamfer = 0,
  curveSegments = 12
): THREE.BufferGeometry {
  const c = Math.min(chamfer, height * 0.3);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * c,
    curveSegments,
    bevelEnabled: c > 0,
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
 * Extrudes a cross-section drawn in `(X, Y)` laterally along `+Z` from `z0` to `z0 + depth`.
 */
export function extrudeAlongZ(
  shape: THREE.Shape,
  z0: number,
  depth: number,
  color: string,
  chamfer = 0,
  curveSegments = 10
): THREE.BufferGeometry {
  const c = Math.min(chamfer, depth * 0.3);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * c,
    curveSegments,
    bevelEnabled: c > 0,
    bevelThickness: c,
    bevelSize: c,
    bevelOffset: -c,
    bevelSegments: 1,
  });
  geo.translate(0, 0, z0 + c);
  return paintGeometry(geo, color);
}

/** Merges multiple non-overlapping CSG cutter solids into a single brush. */
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
  const merged = mergeGeometries(prepared, false);
  for (const g of prepared) g.dispose();
  return paintGeometry(merged, color);
}

/**
 * Attaches uniform `aSpringParam = [dx, dy, dz, 3]` to every vertex of a rigid
 * moving sub-assembly (such as left/right titanium cam axles translating with flexed limb tips).
 */
export function attachRigidFlexParam(
  geo: THREE.BufferGeometry,
  dx: number,
  dy: number,
  dz: number
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const count = g.getAttribute('position').count;
  const arr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    arr[o] = dx;
    arr[o + 1] = dy;
    arr[o + 2] = dz;
    arr[o + 3] = R500_SPRING_MODE_FLEX;
  }
  g.setAttribute(SPRING_PARAM_ATTRIBUTE, new THREE.BufferAttribute(arr, 4));
  return g;
}

/**
 * Builds a watertight, capped, non-indexed variable-radius tube along a polyline `pts`
 * using a twist-free parallel-transport frame, tagging every vertex with `aSpringParam`
 * mode `w = 3` (`[dx, dy, dz, 3]`) driven by `flexAt(u01, centerPt)`.
 */
export function createFlexTube(opts: {
  points: readonly THREE.Vector3[];
  radiusAt: (u: number) => number;
  flexAt: (u: number, pt: THREE.Vector3) => readonly [number, number, number];
  radialSegments?: number;
  color: string;
}): THREE.BufferGeometry {
  const { points, radiusAt, flexAt, radialSegments = 10, color } = opts;
  const nRings = points.length;
  const seg = Math.max(6, radialSegments);

  // Parallel-transport orthonormal frames (T, N, B) along polyline
  const tangents: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];

  for (let i = 0; i < nRings; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(nRings - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(next, prev);
    if (t.lengthSq() < 1e-10) t.set(0, 0, 1);
    else t.normalize();
    tangents.push(t);
  }

  const refUp =
    Math.abs(tangents[0].y) < 0.85
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const n0 = new THREE.Vector3().crossVectors(refUp, tangents[0]).normalize();
  const b0 = new THREE.Vector3().crossVectors(tangents[0], n0).normalize();
  normals.push(n0);
  binormals.push(b0);

  for (let i = 1; i < nRings; i++) {
    const prevT = tangents[i - 1];
    const curT = tangents[i];
    const rotAxis = new THREE.Vector3().crossVectors(prevT, curT);
    const nPrev = normals[i - 1].clone();
    if (rotAxis.lengthSq() > 1e-10) {
      rotAxis.normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(prevT.dot(curT), -1, 1));
      nPrev.applyAxisAngle(rotAxis, angle);
    }
    nPrev.sub(curT.clone().multiplyScalar(nPrev.dot(curT))).normalize();
    const bCur = new THREE.Vector3().crossVectors(curT, nPrev).normalize();
    normals.push(nPrev);
    binormals.push(bCur);
  }

  const ringVerts: THREE.Vector3[][] = [];
  const ringFlex: Array<readonly [number, number, number]> = [];
  for (let i = 0; i < nRings; i++) {
    const u = nRings > 1 ? i / (nRings - 1) : 0;
    const r = radiusAt(u);
    const c = points[i];
    const n = normals[i];
    const b = binormals[i];
    ringFlex.push(flexAt(u, c));
    const verts: THREE.Vector3[] = [];
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const ca = Math.cos(a) * r;
      const sa = Math.sin(a) * r;
      verts.push(
        new THREE.Vector3(
          c.x + n.x * ca + b.x * sa,
          c.y + n.y * ca + b.y * sa,
          c.z + n.z * ca + b.z * sa
        )
      );
    }
    ringVerts.push(verts);
  }

  const posOut: number[] = [];
  const spOut: number[] = [];
  const pushV = (v: THREE.Vector3, fl: readonly [number, number, number]) => {
    posOut.push(v.x, v.y, v.z);
    spOut.push(fl[0], fl[1], fl[2], R500_SPRING_MODE_FLEX);
  };

  // Note: (T, N, B) is right-handed (`B = T x N`, so `N x B = T`).
  // Outer ring angle `a` increases from `N` toward `B` (CCW looking from `+T` back toward `-T`).
  for (let i = 0; i + 1 < nRings; i++) {
    const r0 = ringVerts[i];
    const r1 = ringVerts[i + 1];
    const f0 = ringFlex[i];
    const f1 = ringFlex[i + 1];
    for (let s = 0; s < seg; s++) {
      const s1 = (s + 1) % seg;
      // Outward CCW winding: (r0[s], r0[s1], r1[s1]) and (r0[s], r1[s1], r1[s])
      pushV(r0[s], f0);
      pushV(r0[s1], f0);
      pushV(r1[s1], f1);

      pushV(r0[s], f0);
      pushV(r1[s1], f1);
      pushV(r1[s], f1);
    }
  }

  // Start cap (normal -T) & End cap (normal +T)
  const pStart = points[0];
  const fStart = ringFlex[0];
  const rStart = ringVerts[0];
  for (let s = 0; s < seg; s++) {
    const s1 = (s + 1) % seg;
    pushV(pStart, fStart);
    pushV(rStart[s1], fStart);
    pushV(rStart[s], fStart);
  }

  const pEnd = points[nRings - 1];
  const fEnd = ringFlex[nRings - 1];
  const rEnd = ringVerts[nRings - 1];
  for (let s = 0; s < seg; s++) {
    const s1 = (s + 1) % seg;
    pushV(pEnd, fEnd);
    pushV(rEnd[s], fEnd);
    pushV(rEnd[s1], fEnd);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(posOut), 3)
  );
  geo.setAttribute(
    SPRING_PARAM_ATTRIBUTE,
    new THREE.BufferAttribute(new Float32Array(spOut), 4)
  );
  geo.computeVertexNormals();
  return paintGeometry(geo, color);
}

/**
 * Builds a watertight chamfered parabolic carbon-fiber limb blade sweeping along `spinePts`
 * with rectangular-chamfered cross-section (`8` vertices per ring), attaching `aSpringParam` (`w = 3`).
 */
export function createFlexLimbBlade(opts: {
  spinePts: readonly THREE.Vector3[];
  halfWidthXAt: (u: number) => number;
  halfThickYAt: (u: number) => number;
  flexAt: (u: number) => readonly [number, number, number];
  color: string;
}): THREE.BufferGeometry {
  const { spinePts, halfWidthXAt, halfThickYAt, flexAt, color } = opts;
  const n = spinePts.length;
  // Cross-section around spine in (X, Y) plane: 8-point chamfered rectangle
  const rings: THREE.Vector3[][] = [];
  const flexes: Array<readonly [number, number, number]> = [];

  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    const c = spinePts[i];
    const hw = halfWidthXAt(u);
    const ht = halfThickYAt(u);
    const ch = Math.min(hw, ht) * 0.28;
    // Direction sign along Z determines outward winding
    const ring: THREE.Vector3[] = [
      new THREE.Vector3(c.x + hw - ch, c.y + ht, c.z),
      new THREE.Vector3(c.x - hw + ch, c.y + ht, c.z),
      new THREE.Vector3(c.x - hw, c.y + ht - ch, c.z),
      new THREE.Vector3(c.x - hw, c.y - ht + ch, c.z),
      new THREE.Vector3(c.x - hw + ch, c.y - ht, c.z),
      new THREE.Vector3(c.x + hw - ch, c.y - ht, c.z),
      new THREE.Vector3(c.x + hw, c.y - ht + ch, c.z),
      new THREE.Vector3(c.x + hw, c.y + ht - ch, c.z),
    ];
    rings.push(ring);
    flexes.push(flexAt(u));
  }

  // Flip ring index order if spine runs toward -Z so outward normals always point out
  const runsNegZ = spinePts[n - 1].z < spinePts[0].z;
  const posOut: number[] = [];
  const spOut: number[] = [];
  const pushV = (v: THREE.Vector3, fl: readonly [number, number, number]) => {
    posOut.push(v.x, v.y, v.z);
    spOut.push(fl[0], fl[1], fl[2], R500_SPRING_MODE_FLEX);
  };

  const kLen = 8;
  for (let i = 0; i + 1 < n; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    const f0 = flexes[i];
    const f1 = flexes[i + 1];
    for (let s = 0; s < kLen; s++) {
      const s1 = (s + 1) % kLen;
      if (!runsNegZ) {
        // Spine goes +Z; ring vertices go CCW in (X, Y) around +Z -> outward normal is (r0[s1]-r0[s]) x (r1[s1]-r0[s])
        pushV(r0[s], f0);
        pushV(r0[s1], f0);
        pushV(r1[s1], f1);

        pushV(r0[s], f0);
        pushV(r1[s1], f1);
        pushV(r1[s], f1);
      } else {
        // Spine goes -Z; flip winding so outward normals face outward
        pushV(r0[s], f0);
        pushV(r1[s], f1);
        pushV(r1[s1], f1);

        pushV(r0[s], f0);
        pushV(r1[s1], f1);
        pushV(r0[s1], f0);
      }
    }
  }

  // End caps
  const c0 = spinePts[0];
  const f0 = flexes[0];
  const rStart = rings[0];
  for (let s = 0; s < kLen; s++) {
    const s1 = (s + 1) % kLen;
    if (!runsNegZ) {
      pushV(c0, f0);
      pushV(rStart[s1], f0);
      pushV(rStart[s], f0);
    } else {
      pushV(c0, f0);
      pushV(rStart[s], f0);
      pushV(rStart[s1], f0);
    }
  }

  const c1 = spinePts[n - 1];
  const f1 = flexes[n - 1];
  const rEnd = rings[n - 1];
  for (let s = 0; s < kLen; s++) {
    const s1 = (s + 1) % kLen;
    if (!runsNegZ) {
      pushV(c1, f1);
      pushV(rEnd[s], f1);
      pushV(rEnd[s1], f1);
    } else {
      pushV(c1, f1);
      pushV(rEnd[s1], f1);
      pushV(rEnd[s], f1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(posOut), 3)
  );
  geo.setAttribute(
    SPRING_PARAM_ATTRIBUTE,
    new THREE.BufferAttribute(new Float32Array(spOut), 4)
  );
  geo.computeVertexNormals();
  return paintGeometry(geo, color);
}

/**
 * Builds a watertight trapezoidal Acme screw thread helix wrapping around +X
 * from `x0` to `x1` (core shaft + helical thread ribbon merged cleanly).
 */
export function createAcmeThreadHelix(opts: {
  x0: number;
  x1: number;
  rootRadius: number;
  crestRadius: number;
  pitchCm: number;
  color: string;
}): THREE.BufferGeometry {
  const { x0, x1, rootRadius, crestRadius, pitchCm, color } = opts;
  const len = x1 - x0;
  const turns = len / pitchCm;
  const segsPerTurn = 12;
  const totalSteps = Math.max(24, Math.round(turns * segsPerTurn));
  const halfRootAxial = pitchCm * 0.34;
  const halfCrestAxial = pitchCm * 0.16;

  // For each step i, build 4 cross-section points of the trapezoidal thread tooth
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const x = x0 + len * u;
    const theta = u * turns * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const r0 = rootRadius * 0.96;
    const r1 = crestRadius;
    rings.push([
      new THREE.Vector3(x - halfRootAxial, r0 * ct, r0 * st),
      new THREE.Vector3(x - halfCrestAxial, r1 * ct, r1 * st),
      new THREE.Vector3(x + halfCrestAxial, r1 * ct, r1 * st),
      new THREE.Vector3(x + halfRootAxial, r0 * ct, r0 * st),
    ]);
  }

  const posOut: number[] = [];
  const pushT = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    posOut.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  for (let i = 0; i < totalSteps; i++) {
    const rA = rings[i];
    const rB = rings[i + 1];
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      pushT(rA[k], rB[k], rB[k1]);
      pushT(rA[k], rB[k1], rA[k1]);
    }
  }

  // End caps of thread helix (rStart opposes rA[k1]->rA[k]; rEnd opposes rB[k]->rB[k1])
  const rStart = rings[0];
  pushT(rStart[0], rStart[1], rStart[2]);
  pushT(rStart[0], rStart[2], rStart[3]);

  const rEnd = rings[totalSteps];
  pushT(rEnd[0], rEnd[2], rEnd[1]);
  pushT(rEnd[0], rEnd[3], rEnd[2]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(posOut), 3)
  );
  geo.computeVertexNormals();
  return paintGeometry(geo, color);
}
