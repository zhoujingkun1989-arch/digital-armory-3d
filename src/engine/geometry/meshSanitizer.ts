import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CURVATURE_ATTRIBUTE,
  SPRING_PARAM_ATTRIBUTE,
  attachCurvatureAttribute,
} from './curvatureBuilder';
import { paintGeometry } from './csgBuilder';
import { clampUv01 as clamp01 } from './uvUnwrap';

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
export function sanitizeWeaponMesh(
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
