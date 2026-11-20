import * as THREE from 'three';
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
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import { clampUv01 as clamp01 } from '../../../engine/geometry/uvUnwrap';

// ============================================================================
// Nikonov AN-94 "Abakan" (6P33 · 5.45×39mm 7N6) Exact 1:1 CAD Constants (1u = 1cm)
// ============================================================================
// Overall length: 94.3 cm (X ∈ [-43.0, +51.3]), Barrel: 40.5 cm (X ∈ [+5.2, +45.7])
// Bore axis: Y = +1.65 cm | Upper gas cylinder: Y = +3.55 cm
// Iconic 15°-right-canted 30-round 5.45×39mm magazine: RX = -15° (-0.261799 rad)
// so downward (-Y) magazine spine swings +Z (to shooter's right)!

export const AN94_BORE_Y = 1.65;
export const AN94_GAS_Y = 3.55;
export const AN94_MAG_CANT_RX = -(15 * Math.PI) / 180; // -0.2617993878 rad (bottom tilts +Z right!)
export const AN94_COS_CANT = Math.cos(AN94_MAG_CANT_RX);
export const AN94_SIN_CANT = Math.sin(AN94_MAG_CANT_RX);

// Curved 30-rd 5.45×39mm Izhmash polymer magazine arc constants (in mag local XY before -15° X-cant)
export const AN94_MAG_ORIGIN: readonly [number, number, number] = [7.6, -0.35, 0];
export const AN94_MAG_ARC_CX = 20.5;
export const AN94_MAG_ARC_CY = 0.0;
export const AN94_MAG_R_IN = 17.25; // Front spine (+X side)
export const AN94_MAG_R_OUT = 23.75; // Rear spine (-X side), chord = 6.50 cm
export const AN94_MAG_R_MID = 20.5;
export const AN94_MAG_ANG_START = -0.04;
export const AN94_MAG_ANG_END = 0.92;
export const AN94_MAG_FOLLOWER_ANG = 0.795;

// Calibrated Izhmash AN-94 vertex-color palette (strictly above Khronos 0.018 linear luma floor)
export const AN94_CHARCOAL_POLY = '#444a54';
export const AN94_POLY_DARK = '#393f48';
export const AN94_PLUM_MAG = '#4d3a46';
export const AN94_ENAMEL_STEEL = '#505865';
export const AN94_BARREL_STEEL = '#4b5360';
export const AN94_INNER_STEEL = '#5c6574';
export const AN94_STAINLESS = '#cfd7e3';
export const AN94_CABLE_STEEL = '#d8e0eb';
export const AN94_BRONZE_RAMMER = '#c98a4a';
export const AN94_BRASS_FERRULE = '#d4a648';
export const AN94_SPRING_STEEL = '#94a3b8';
export const AN94_FOLLOWER_ORANGE = '#ea580c';
export const AN94_SAFETY_RED = '#dc2626';
export const AN94_SIGHT_WHITE = '#f1f5f9';

/** Transforms a local point (lx, ly, lz) inside the 15°-canted magazine frame into assembled world space. */
export function magLocalToWorld(
  lx: number,
  ly: number,
  lz = 0
): [number, number, number] {
  const [ox, oy, oz] = AN94_MAG_ORIGIN;
  const wy = oy + ly * AN94_COS_CANT - lz * AN94_SIN_CANT;
  const wz = oz + ly * AN94_SIN_CANT + lz * AN94_COS_CANT;
  return [
    Number((ox + lx).toFixed(4)),
    Number(wy.toFixed(4)),
    Number(wz.toFixed(4)),
  ];
}

/** Centerline point along the 5.45mm banana curve in local magazine XY coordinates. */
export function magArcLocalPoint(
  ang: number,
  radius = AN94_MAG_R_MID
): [number, number] {
  return [
    AN94_MAG_ARC_CX - Math.cos(ang) * radius,
    AN94_MAG_ARC_CY - Math.sin(ang) * radius,
  ];
}

export const AN94_FOLLOWER_WORLD_POS: [number, number, number] = (() => {
  const [lx, ly] = magArcLocalPoint(AN94_MAG_FOLLOWER_ANG);
  return magLocalToWorld(lx, ly, 0);
})();

export const AN94_FLOORPLATE_WORLD_POS: [number, number, number] = (() => {
  const [lx, ly] = magArcLocalPoint(AN94_MAG_ANG_END);
  return magLocalToWorld(lx, ly, 0);
})();

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

function computeSignedVolumeRaw(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
): number {
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
 * Strips any degenerate CSG slivers, enforces positive signed volume (`signedVolume > 0`),
 * guarantees unit-length finite normals (`|n| = 1`), preserves `aCurvature` & `aSpringParam`,
 * and normalizes UVs cleanly into `[0.04, 0.96] ⊂ [0, 1]`.
 */
export function sanitizeAn94Mesh(
  geo: THREE.BufferGeometry,
  preserveSpring = false
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
    const sArr = sp && preserveSpring ? new Float32Array(nV * 4) : null;

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

  // Enforce outward winding (signedVolume > 0)
  if (computeSignedVolumeRaw(outPos) < 0) {
    const outUv = out.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const outCol = out.getAttribute('color') as THREE.BufferAttribute;
    const outCurv = out.getAttribute(CURVATURE_ATTRIBUTE) as
      | THREE.BufferAttribute
      | undefined;
    const outSp = out.getAttribute(SPRING_PARAM_ATTRIBUTE) as
      | THREE.BufferAttribute
      | undefined;
    for (let i = 0; i + 2 < nTotal; i += 3) {
      const swap3 = (attr: THREE.BufferAttribute) => {
        const x1 = attr.getX(i + 1);
        const y1 = attr.getY(i + 1);
        const z1 = attr.getZ(i + 1);
        attr.setXYZ(
          i + 1,
          attr.getX(i + 2),
          attr.getY(i + 2),
          attr.getZ(i + 2)
        );
        attr.setXYZ(i + 2, x1, y1, z1);
      };
      swap3(outPos);
      swap3(outNorm);
      swap3(outCol);
      if (outUv) {
        const u1 = outUv.getX(i + 1);
        const v1 = outUv.getY(i + 1);
        outUv.setXY(i + 1, outUv.getX(i + 2), outUv.getY(i + 2));
        outUv.setXY(i + 2, u1, v1);
      }
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
        outSp.setXYZW(
          i + 1,
          outSp.getX(i + 2),
          outSp.getY(i + 2),
          outSp.getZ(i + 2),
          outSp.getW(i + 2)
        );
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

  // Triplanar [0.04, 0.96] atlas-safe UV projection
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
  return out;
}

// ============================================================================
// Helper Primitives (100% Watertight CAD Builders)
// ============================================================================

function boxAt(
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  color: string,
  chamfer = 0.04
): THREE.BufferGeometry {
  const g = createChamferedBox(sx, sy, sz, chamfer, color);
  g.translate(x, y, z);
  return g;
}

function cylXAt(
  rTop: number,
  rBot: number,
  len: number,
  x: number,
  y: number,
  z: number,
  color: string,
  segs = 28,
  bevel = 0.025
): THREE.BufferGeometry {
  const g = createBeveledCylinder(rTop, rBot, len, bevel, segs, color);
  g.rotateZ(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function cylZAt(
  rTop: number,
  rBot: number,
  len: number,
  x: number,
  y: number,
  z: number,
  color: string,
  segs = 28,
  bevel = 0.025
): THREE.BufferGeometry {
  const g = createBeveledCylinder(rTop, rBot, len, bevel, segs, color);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function cylYAt(
  rTop: number,
  rBot: number,
  len: number,
  x: number,
  y: number,
  z: number,
  color: string,
  segs = 24,
  bevel = 0.02
): THREE.BufferGeometry {
  const g = createBeveledCylinder(rTop, rBot, len, bevel, segs, color);
  g.translate(x, y, z);
  return g;
}

function extrudeProfileZ(
  pts: ReadonlyArray<readonly [number, number]>,
  depthZ: number,
  color: string,
  bevel = 0.03
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();
  const b = Math.min(bevel, depthZ * 0.2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, depthZ - 2 * b),
    bevelEnabled: b > 1e-4,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    steps: 1,
  });
  g.translate(0, 0, -(depthZ - 2 * b) * 0.5);
  return paintGeometry(g, color);
}

/** Watertight capped tube swept along a 3D polyline (for steel cable & static curved mag spring). */
function buildCappedTube(
  points: THREE.Vector3[],
  radius: number,
  radialSegments: number,
  color: string
): THREE.BufferGeometry {
  const nPts = points.length;
  const rings: THREE.Vector3[][] = [];
  let prevN: THREE.Vector3 | null = null;
  const tang = new THREE.Vector3();
  const bVec = new THREE.Vector3();

  for (let i = 0; i < nPts; i++) {
    if (i === 0) tang.subVectors(points[1], points[0]).normalize();
    else if (i === nPts - 1)
      tang.subVectors(points[nPts - 1], points[nPts - 2]).normalize();
    else tang.subVectors(points[i + 1], points[i - 1]).normalize();

    let nVec: THREE.Vector3;
    if (!prevN) {
      const ref =
        Math.abs(tang.z) < 0.85
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(1, 0, 0);
      nVec = new THREE.Vector3().crossVectors(tang, ref).normalize();
    } else {
      nVec = prevN
        .clone()
        .addScaledVector(tang, -prevN.dot(tang))
        .normalize();
    }
    prevN = nVec;
    bVec.crossVectors(tang, nVec).normalize();

    const ring: THREE.Vector3[] = [];
    for (let s = 0; s < radialSegments; s++) {
      const a = (s / radialSegments) * Math.PI * 2;
      const ca = Math.cos(a) * radius;
      const sa = Math.sin(a) * radius;
      ring.push(
        new THREE.Vector3(
          points[i].x + nVec.x * ca + bVec.x * sa,
          points[i].y + nVec.y * ca + bVec.y * sa,
          points[i].z + nVec.z * ca + bVec.z * sa
        )
      );
    }
    rings.push(ring);
  }

  const tris: number[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  for (let i = 0; i < nPts - 1; i++) {
    for (let s = 0; s < radialSegments; s++) {
      const sn = (s + 1) % radialSegments;
      push(rings[i][s], rings[i + 1][s], rings[i + 1][sn]);
      push(rings[i][s], rings[i + 1][sn], rings[i][sn]);
    }
  }
  const c0 = points[0];
  const c1 = points[nPts - 1];
  for (let s = 0; s < radialSegments; s++) {
    const sn = (s + 1) % radialSegments;
    push(c0, rings[0][sn], rings[0][s]);
    push(c1, rings[nPts - 1][s], rings[nPts - 1][sn]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return paintGeometry(geo, color);
}

/** Builds a watertight hollow curved rectangular box shell along a circular arc in XY. */
function buildCurvedMagBodyRaw(
  rIn: number,
  rOut: number,
  halfZ: number,
  wallR: number,
  wallZ: number,
  ang0: number,
  ang1: number,
  steps: number,
  color: string
): THREE.BufferGeometry {
  const outerShell = (rA: number, rB: number, hz: number, a0: number, a1: number) => {
    const rings: THREE.Vector3[][] = [];
    for (let i = 0; i <= steps; i++) {
      const ang = a0 + ((a1 - a0) * i) / steps;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const xIn = AN94_MAG_ARC_CX - ca * rA;
      const yIn = AN94_MAG_ARC_CY - sa * rA;
      const xOut = AN94_MAG_ARC_CX - ca * rB;
      const yOut = AN94_MAG_ARC_CY - sa * rB;
      rings.push([
        new THREE.Vector3(xIn, yIn, -hz),
        new THREE.Vector3(xOut, yOut, -hz),
        new THREE.Vector3(xOut, yOut, hz),
        new THREE.Vector3(xIn, yIn, hz),
      ]);
    }
    const tris: number[] = [];
    const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    };
    for (let i = 0; i < steps; i++) {
      for (let k = 0; k < 4; k++) {
        const kn = (k + 1) % 4;
        push(rings[i][k], rings[i + 1][k], rings[i + 1][kn]);
        push(rings[i][k], rings[i + 1][kn], rings[i][kn]);
      }
    }
    // Outward end caps: rings[0] normal=+Y, rings[steps] normal=-Y
    push(rings[0][0], rings[0][1], rings[0][2]);
    push(rings[0][0], rings[0][2], rings[0][3]);
    push(rings[steps][0], rings[steps][2], rings[steps][1]);
    push(rings[steps][0], rings[steps][3], rings[steps][2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
    if (computeSignedVolumeRaw(g.getAttribute('position')) < 0) {
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let t = 0; t + 2 < p.count; t += 3) {
        const bx = p.getX(t + 1), by = p.getY(t + 1), bz = p.getZ(t + 1);
        p.setXYZ(t + 1, p.getX(t + 2), p.getY(t + 2), p.getZ(t + 2));
        p.setXYZ(t + 2, bx, by, bz);
      }
    }
    g.computeVertexNormals();
    return paintGeometry(g, color);
  };

  const solid = outerShell(rIn, rOut, halfZ, ang0, ang1);
  const cavity = outerShell(
    rIn + wallR,
    rOut - wallR,
    halfZ - wallZ,
    ang0 - 0.03,
    ang1 + 0.03
  );
  const res = csgSubtract(solid, [cavity], Math.PI / 5.5);
  solid.dispose();
  cavity.dispose();
  return res;
}

// ============================================================================
// SUITE 1: OUTER HOUSING, DUST COVER, STOCK, GRIP, SIGHTS & CONTROLS (7 parts)
// ============================================================================

/** F-01: Izhmash Monocoque Charcoal Polyamide Outer Housing with Welded Trigger Guard & 15° Canted Magwell */
export function buildAn94OuterHousingGeometry(): THREE.BufferGeometry {
  const solids: THREE.BufferGeometry[] = [];

  // Main rear-to-mid monocoque chassis body: X ∈ [-16.8, +11.6], Y ∈ [-1.6, +2.55], Z ∈ [-1.95, +1.95]
  solids.push(boxAt(28.4, 4.15, 3.9, -2.6, 0.475, 0, AN94_CHARCOAL_POLY, 0.14));

  // Tapered ergonomic Izhmash forend handguard: X ∈ [+11.0, +29.0], Y ∈ [-0.85, +3.65], Z ∈ [-1.75, +1.75]
  solids.push(boxAt(18.0, 4.5, 3.5, 20.0, 1.4, 0, AN94_CHARCOAL_POLY, 0.22));
  // Front nose bayonet / GP-25 lug fairing
  solids.push(boxAt(3.4, 1.5, 1.9, 27.3, -1.25, 0, AN94_POLY_DARK, 0.08));

  // Rear stock hinge trunnion boss at X = -16.8
  solids.push(boxAt(1.8, 3.8, 3.6, -15.9, 0.85, 0, AN94_ENAMEL_STEEL, 0.08));

  // Left-flank Russian dovetail optics rail ("Ласточкин хвост", X ∈ [-12.2, -2.2], Z = -2.08)
  solids.push(boxAt(10.0, 1.25, 0.36, -7.2, 0.9, -2.02, AN94_ENAMEL_STEEL, 0.04));

  // 15°-Right-Canted Magazine Well Collar wrapping magazine throat around [7.6, -0.35, 0]
  const magWell = boxAt(7.4, 4.4, 3.6, 0, -1.7, 0, AN94_CHARCOAL_POLY, 0.12);
  magWell.rotateX(AN94_MAG_CANT_RX);
  magWell.translate(7.6, -0.35, 0);
  solids.push(magWell);

  // SOLIDLY WELDED INTEGRAL TRIGGER GUARD LOOP (ZERO air gaps! Front strut welded into magwell at X=+2.2, rear into grip boss at X=-5.4)
  solids.push(boxAt(1.3, 2.8, 1.4, 2.1, -2.85, 0, AN94_CHARCOAL_POLY, 0.06)); // Front strut
  solids.push(boxAt(8.8, 0.55, 1.4, -1.7, -4.15, 0, AN94_CHARCOAL_POLY, 0.06)); // Bottom bar
  solids.push(boxAt(1.4, 2.9, 1.6, -5.5, -2.8, 0, AN94_CHARCOAL_POLY, 0.06)); // Rear strut welded into grip boss
  solids.push(boxAt(4.6, 1.0, 2.8, -7.8, -1.5, 0, AN94_CHARCOAL_POLY, 0.08)); // Grip mounting boss

  // Rear magazine paddle release behind canted magwell
  solids.push(boxAt(0.7, 1.7, 1.1, 3.8, -2.4, 0.35, AN94_ENAMEL_STEEL, 0.04));

  const merged = mergeParts(solids);
  for (const s of solids) s.dispose();

  // Hollow internal floating-receiver channel + barrel/gas-tube front tunnel + canted magwell slot
  const cutters: THREE.BufferGeometry[] = [];
  // Upper internal floating sub-receiver bay: X ∈ [-15.8, +11.6], Y ∈ [-0.85, +3.6], Z ∈ [-1.52, +1.52]
  cutters.push(
    new THREE.BoxGeometry(27.4, 4.45, 3.04).translate(-2.1, 1.375, 0)
  );
  // Lower receiver buffer spring pocket: X ∈ [-15.0, +2.0], Y ∈ [-1.32, -0.55], Z ∈ [-0.62, +0.62]
  // (leaves a solid 2.8 mm polyamide bottom floor Y ∈ [-1.60, -1.32] completely sealing the buffer spring!)
  cutters.push(
    new THREE.BoxGeometry(17.0, 0.77, 1.24).translate(-6.5, -0.935, 0)
  );
  // Crisp trigger-blade passage slot through receiver floor
  cutters.push(
    new THREE.BoxGeometry(1.15, 0.5, 0.64).translate(-2.35, -1.47, 0)
  );
  // Floating barrel & upper gas-tube front clearance tunnel through handguard (X ∈ [+11.0, +30.0])
  cutters.push(
    new THREE.BoxGeometry(19.6, 3.55, 2.35).translate(20.6, 2.35, 0)
  );
  // 15°-canted magazine well hollow throat
  const magHole = new THREE.BoxGeometry(6.7, 6.2, 2.84).translate(0, -1.6, 0);
  magHole.rotateX(AN94_MAG_CANT_RX);
  magHole.translate(7.6, -0.35, 0);
  cutters.push(magHole);

  const hollowed = csgSubtract(merged, cutters, Math.PI / 5.5);
  merged.dispose();
  for (const c of cutters) c.dispose();
  return sanitizeAn94Mesh(hollowed);
}

/** F-02: Stamped Steel Top Dust Cover with Right Ejection / Charging-Handle Port */
export function buildAn94DustCoverGeometry(): THREE.BufferGeometry {
  const outerPts: Array<[number, number]> = [
    [-1.85, 2.25],
    [-1.85, 3.45],
    [-1.25, 4.12],
    [1.25, 4.12],
    [1.85, 3.45],
    [1.85, 2.25],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(outerPts[0][0], outerPts[0][1]);
  for (let i = 1; i < outerPts.length; i++) shape.lineTo(outerPts[i][0], outerPts[i][1]);
  shape.closePath();

  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: 22.0,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  raw.rotateY(Math.PI / 2);
  raw.translate(-16.2, 0, 0);
  paintGeometry(raw, AN94_ENAMEL_STEEL);

  const cutters: THREE.BufferGeometry[] = [
    // Inner hollow cavity
    new THREE.BoxGeometry(21.4, 1.85, 3.22).translate(-5.2, 2.95, 0),
    // Right-side ejection & charging-handle cutout window
    new THREE.BoxGeometry(8.2, 1.35, 1.4).translate(1.5, 2.85, 1.6),
    // Rear star-wheel diopter sight relief cutout
    new THREE.BoxGeometry(2.8, 1.4, 2.1).translate(-13.6, 3.85, 0),
  ];

  const out = csgSubtract(raw, cutters, Math.PI / 5.5);
  raw.dispose();
  for (const c of cutters) c.dispose();
  return sanitizeAn94Mesh(out);
}

/** F-06: Right-Folding Charcoal Polyamide Ribbed Buttstock (`X ∈ [-26.2, 0.0]`) */
export function buildAn94ButtstockGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Steel folding hinge knuckle at local X = 0
  parts.push(boxAt(1.6, 3.4, 3.4, -0.8, 0.0, 0, AN94_ENAMEL_STEEL, 0.08));
  parts.push(cylYAt(0.42, 0.42, 3.6, -0.2, 0.0, 1.65, AN94_ENAMEL_STEEL, 16));

  // Tapered main buttstock body profile (classic angular Izhmash AN-94 silhouette)
  const stockProfile: Array<[number, number]> = [
    [-1.4, 1.45],
    [-25.4, 1.75],
    [-25.4, -5.85],
    [-20.5, -5.05],
    [-1.4, -1.65],
  ];
  parts.push(extrudeProfileZ(stockProfile, 2.85, AN94_CHARCOAL_POLY, 0.14));

  // Ribbed vulcanized rubber buttpad at rear (-26.2 .. -25.4)
  parts.push(boxAt(0.85, 7.8, 3.1, -25.78, -2.05, 0, AN94_POLY_DARK, 0.1));

  // Molded horizontal side stiffening ribs
  for (const ry of [0.55, -0.65, -1.85]) {
    parts.push(boxAt(18.5, 0.36, 3.15, -13.5, ry, 0, AN94_POLY_DARK, 0.04));
  }

  const body = mergeParts(parts);
  for (const p of parts) p.dispose();

  // Rear sling loop window slot + cheek-rest recess cutout
  const cutters = [
    new THREE.BoxGeometry(2.6, 1.45, 4.2).translate(-22.2, -3.55, 0),
    new THREE.BoxGeometry(10.5, 1.55, 4.2).translate(-12.5, -2.65, 0),
  ];
  const out = csgSubtract(body, cutters, Math.PI / 5.5);
  body.dispose();
  for (const c of cutters) c.dispose();
  return sanitizeAn94Mesh(out);
}

/** F-07: Contoured Izhmash Checkered Charcoal Polyamide Pistol Grip */
export function buildAn94PistolGripGeometry(): THREE.BufferGeometry {
  const gripPts: Array<[number, number]> = [
    [-1.7, -0.38],
    [1.9, -0.38],
    [1.1, -3.6],
    [-0.95, -9.8],
    [-4.35, -9.35],
    [-2.55, -2.6],
  ];
  const parts: THREE.BufferGeometry[] = [
    extrudeProfileZ(gripPts, 2.65, AN94_CHARCOAL_POLY, 0.18),
    boxAt(3.4, 0.65, 2.75, -2.55, -9.75, 0, AN94_POLY_DARK, 0.08),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return sanitizeAn94Mesh(merged);
}

/** F-08: Iconic 5-Position Rotary Star-Wheel Diopter Rear Sight (`2 / 3 / 4 / 5 / 7`) */
export function buildAn94RearSightGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Sight mounting base & twin protective angled ears
  parts.push(boxAt(3.2, 0.65, 2.2, 0, 0.15, 0, AN94_ENAMEL_STEEL, 0.05));
  parts.push(boxAt(2.8, 1.65, 0.34, 0, 1.05, -1.05, AN94_ENAMEL_STEEL, 0.04));
  parts.push(boxAt(2.8, 1.65, 0.34, 0, 1.05, 1.05, AN94_ENAMEL_STEEL, 0.04));
  // Central horizontal axle pin
  parts.push(cylZAt(0.24, 0.24, 2.45, 0, 1.12, 0, AN94_STAINLESS, 18));
  // 5-Point Star-Wheel Diopter Drum (iconic Nikonov rotary aperture wheel!)
  parts.push(cylZAt(0.85, 0.85, 0.88, 0, 1.12, 0, AN94_INNER_STEEL, 24));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const tx = Math.cos(a) * 0.92;
    const ty = 1.12 + Math.sin(a) * 0.92;
    const lug = createChamferedBox(0.42, 0.56, 0.62, 0.03, AN94_ENAMEL_STEEL);
    lug.rotateZ(a - Math.PI / 2);
    lug.translate(tx, ty, 0);
    parts.push(lug);
  }
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return sanitizeAn94Mesh(merged);
}

/** FC-03: Dedicated Rear Thumb Safety Switch (separate from 3-mode fire selector!) */
export function buildAn94SafetySwitchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    cylZAt(0.26, 0.26, 4.1, 0, 0, 0, AN94_ENAMEL_STEEL, 18),
    boxAt(1.35, 0.62, 0.36, -0.42, 0.06, -2.08, AN94_ENAMEL_STEEL, 0.04),
    boxAt(1.35, 0.62, 0.36, -0.42, 0.06, 2.08, AN94_ENAMEL_STEEL, 0.04),
    cylZAt(0.14, 0.14, 0.12, -0.78, 0.06, -2.28, AN94_SAFETY_RED, 14, 0.01),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return sanitizeAn94Mesh(merged);
}

/** FC-04: Rear-Left 3-Position Fire Selector Lever (`ОД / 2 / АВ`) */
export function buildAn94FireSelectorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    cylZAt(0.32, 0.32, 3.85, 0, 0, 0, AN94_ENAMEL_STEEL, 20),
    boxAt(0.95, 0.65, 1.4, 0.2, 0.18, 0, AN94_INNER_STEEL, 0.04),
    // Left-flank serrated thumb lever arm pointing toward `2` (hyperburst)
    boxAt(2.15, 0.58, 0.34, 0.78, 0.0, -2.06, AN94_ENAMEL_STEEL, 0.04),
    boxAt(0.55, 0.86, 0.44, 1.68, 0.0, -2.14, AN94_POLY_DARK, 0.04),
    boxAt(0.45, 0.12, 0.08, 1.32, 0.0, -2.26, AN94_SAFETY_RED, 0.01),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return sanitizeAn94Mesh(merged);
}

// ============================================================================
// SUITE 2: PULLEY-CABLE FLOATING ACTION, BOLT & FIRE CONTROL (10 solid parts)
// ============================================================================

/** S-01: Floating CNC Steel Sub-Receiver Carriage (Slides -4.2 cm inside Outer Housing!) */
export function buildAn94InnerReceiverGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // Main CNC steel U-channel carriage: X ∈ [-13.2, +11.2], Y ∈ [-0.55, +2.75], Z ∈ [-1.42, +1.42]
    boxAt(24.4, 3.3, 2.84, -1.0, 1.1, 0, AN94_INNER_STEEL, 0.06),
    // Heavy front barrel trunnion collar (clamps floating 40.5cm barrel rigidly!)
    boxAt(3.4, 3.6, 2.95, 9.5, 1.3, 0, AN94_ENAMEL_STEEL, 0.08),
    // Lower buffer-spring recoil abutment lug at X = -6.75 (mates flush against front of an94_receiver_buffer_spring at X = -7.15!)
    boxAt(0.9, 0.78, 1.0, -6.75, -0.87, 0, AN94_ENAMEL_STEEL, 0.04),
    // Pulley wheel rear axle boss on right flank at X = -9.2, Y = 0.55
    cylZAt(0.42, 0.42, 0.55, -9.2, 0.55, 0.65, AN94_STAINLESS, 20),
  ];
  const solid = mergeParts(parts);
  for (const p of parts) p.dispose();

  const cutters: THREE.BufferGeometry[] = [
    // Upper bolt-carrier runway bore
    new THREE.BoxGeometry(20.6, 2.35, 1.98).translate(-1.8, 1.78, 0),
    // Right-side cutaway showcase window exposing pulley wheel, steel cable & pre-feed shuttle
    new THREE.BoxGeometry(19.2, 1.95, 1.4).translate(-1.2, 0.85, 1.18),
    // Barrel trunnion bore at Y = 1.65
    new THREE.CylinderGeometry(0.95, 0.95, 4.2, 24)
      .rotateZ(Math.PI / 2)
      .translate(9.5, AN94_BORE_Y, 0),
  ];

  const out = csgSubtract(solid, cutters, Math.PI / 5.5);
  solid.dispose();
  for (const c of cutters) c.dispose();
  return sanitizeAn94Mesh(out);
}

/** S-02: Long-Stroke Reciprocating Bolt Carrier with Right Charging Handle & Cam Slot */
export function buildAn94BoltCarrierGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // Main machined carrier block (local X ∈ [-4.5, +4.2], around bore Y = 0)
    boxAt(8.7, 1.65, 1.72, -0.15, 0.18, 0, AN94_INNER_STEEL, 0.06),
    // Upper gas-piston stem boss & long-stroke piston rod reaching forward into gas cylinder (local X ∈ [+3.5, +19.5], Y = +1.90)
    boxAt(2.6, 1.55, 1.25, 3.8, 1.15, 0, AN94_INNER_STEEL, 0.05),
    cylXAt(0.42, 0.42, 15.2, 11.4, 1.9, 0, AN94_STAINLESS, 22),
    // Fluted chrome gas-piston head at local X = +19.2
    cylXAt(0.64, 0.64, 1.35, 19.0, 1.9, 0, AN94_STAINLESS, 24),
    // Iconic right-side upturned charging handle (local X = +1.8, Z ∈ [+0.8, +3.2])
    boxAt(0.85, 0.68, 2.2, 1.85, 0.12, 1.85, AN94_ENAMEL_STEEL, 0.05),
    cylYAt(0.38, 0.44, 1.45, 1.85, 0.55, 2.95, AN94_ENAMEL_STEEL, 18),
    // Rear cable-drive attachment clevis lug on right flank (+Z = +0.62)
    boxAt(1.15, 0.65, 0.48, -3.6, -0.32, 0.62, AN94_BRASS_FERRULE, 0.03),
  ];
  const solid = mergeParts(parts);
  for (const p of parts) p.dispose();

  const cutters: THREE.BufferGeometry[] = [
    // Coaxial bolt stem bore
    new THREE.CylinderGeometry(0.62, 0.62, 5.2, 20)
      .rotateZ(Math.PI / 2)
      .translate(2.6, 0, 0),
    // Helical cam-track cutout on right wall
    new THREE.BoxGeometry(2.6, 0.42, 0.8).translate(1.8, 0.42, 0.72),
  ];

  const out = csgSubtract(solid, cutters, Math.PI / 5.5);
  solid.dispose();
  for (const c of cutters) c.dispose();
  return sanitizeAn94Mesh(out);
}

/** S-03: Gleaming Brushed-Stainless 2-Lug Rotating Bolt */
export function buildAn94BoltGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // Cylindrical bolt stem & breech face (local X ∈ [-2.2, +2.6])
    cylXAt(0.56, 0.56, 4.8, 0.2, 0, 0, AN94_STAINLESS, 28),
    // Symmetric twin heavy locking lugs at front face
    boxAt(0.92, 0.48, 1.62, 1.95, 0, 0, AN94_STAINLESS, 0.03),
    // Top helical cam pin engaging carrier cam track
    boxAt(0.62, 0.56, 0.42, 0.05, 0.62, 0, AN94_STAINLESS, 0.03),
    // Right-side extractor claw
    boxAt(1.85, 0.24, 0.26, 1.45, 0.05, 0.58, AN94_ENAMEL_STEEL, 0.02),
  ];
  const solid = mergeParts(parts);
  for (const p of parts) p.dispose();

  // Recessed 5.45×39mm cartridge breech face pocket & firing-pin channel
  const cutters = [
    new THREE.CylinderGeometry(0.46, 0.46, 0.32, 20)
      .rotateZ(Math.PI / 2)
      .translate(2.52, 0, 0),
    new THREE.CylinderGeometry(0.14, 0.14, 5.2, 14)
      .rotateZ(Math.PI / 2)
      .translate(0.2, 0, 0),
  ];
  const out = csgSubtract(solid, cutters, Math.PI / 5.5);
  solid.dispose();
  for (const c of cutters) c.dispose();
  return sanitizeAn94Mesh(out);
}

/** S-04: Coaxial Stainless Firing Pin */
export function buildAn94FiringPinGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    cylXAt(0.26, 0.26, 0.85, -2.0, 0, 0, AN94_STAINLESS, 18),
    cylXAt(0.12, 0.15, 3.65, 0.1, 0, 0, AN94_STAINLESS, 16),
    cylXAt(0.05, 0.11, 0.65, 2.22, 0, 0, AN94_STAINLESS, 14, 0.01),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return sanitizeAn94Mesh(merged);
}

/** S-05: THE STAR — Gleaming CNC Machined Grooved Pulley Transmission Wheel (`R = 1.05 cm`) */
export function buildAn94PulleyWheelGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // Left & right precision CNC steel pulley flanges forming deep V-groove for braided cable
    cylZAt(1.06, 0.96, 0.16, 0, 0, -0.22, AN94_STAINLESS, 36, 0.02),
    cylZAt(0.96, 1.06, 0.16, 0, 0, 0.22, AN94_STAINLESS, 36, 0.02),
    // Recessed central V-groove cable drum (`R = 0.78 cm`)
    cylZAt(0.78, 0.78, 0.34, 0, 0, 0, AN94_INNER_STEEL, 32, 0.015),
    // Bronze self-lubricating center bearing bushing & radial index key
    cylZAt(0.38, 0.38, 0.68, 0, 0, 0, AN94_BRONZE_RAMMER, 24, 0.02),
    // Visible machined radial spoke lugs so spin rotation is unmistakably readable in 60fps slow-mo!
    boxAt(1.65, 0.16, 0.56, 0, 0, 0, AN94_STAINLESS, 0.015),
    boxAt(0.16, 1.65, 0.56, 0, 0, 0, AN94_STAINLESS, 0.015),
  ];
  const solid = mergeParts(parts);
  for (const p of parts) p.dispose();

  // 4 machined weight-relief holes at 45° + central axle bore
  const cutters: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(0.18, 0.18, 1.0, 18).rotateX(Math.PI / 2),
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    cutters.push(
      new THREE.CylinderGeometry(0.16, 0.16, 1.0, 14)
        .rotateX(Math.PI / 2)
        .translate(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0)
    );
  }
  const out = csgSubtract(solid, cutters, Math.PI / 5.5);
  solid.dispose();
  for (const c of cutters) c.dispose();
  return sanitizeAn94Mesh(out);
}

/** S-06: Braided Gleaming Stainless-Steel Transmission Cable Loop Wrapping 180° Around Pulley */
export function buildAn94SteelCableGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const rWrap = 0.84;
  // Upper straight leg from bolt carrier clevis (+7.2, +0.84) back to pulley top (0, +0.84)
  for (let i = 0; i <= 8; i++) {
    pts.push(new THREE.Vector3(7.2 * (1 - i / 8), rWrap, 0));
  }
  // 180° wrap around rear of pulley wheel (angle π/2 -> 3π/2)
  const arcSegs = 20;
  for (let i = 1; i <= arcSegs; i++) {
    const a = Math.PI * 0.5 + (Math.PI * i) / arcSegs;
    pts.push(new THREE.Vector3(Math.cos(a) * rWrap, Math.sin(a) * rWrap, 0));
  }
  // Lower straight leg running forward from pulley bottom (0, -0.84) to pre-feed rammer (+12.8, -0.84)
  for (let i = 1; i <= 12; i++) {
    pts.push(new THREE.Vector3((12.8 * i) / 12, -rWrap, 0));
  }

  const parts: THREE.BufferGeometry[] = [
    buildCappedTube(pts, 0.11, 10, AN94_CABLE_STEEL),
    // Twin crimped brass/bronze cable end ferrules
    cylXAt(0.22, 0.22, 0.85, 7.2, rWrap, 0, AN94_BRASS_FERRULE, 16, 0.02),
    cylXAt(0.22, 0.22, 0.85, 12.8, -rWrap, 0, AN94_BRASS_FERRULE, 16, 0.02),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return sanitizeAn94Mesh(merged);
}

/** S-07: Gleaming Bronze/Chrome 2-Stage Secondary Pre-Feed Rammer & Tilted Loading Tray */
export function buildAn94FeedRammerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // Main bronze shuttle slide bar driven forward by lower cable leg
    boxAt(5.6, 0.65, 0.72, 0.4, -0.42, 0.12, AN94_BRONZE_RAMMER, 0.04),
    // Tilted 5.45mm cartridge pre-staging tray cradle (receives 2nd round from 15° canted mag!)
    boxAt(4.8, 0.34, 1.25, 1.3, 0.18, -0.25, AN94_STAINLESS, 0.04),
    // Rear cartridge pusher dog rising behind pre-staged 5.45mm case rim
    boxAt(0.55, 1.05, 0.95, -1.25, 0.42, -0.2, AN94_BRONZE_RAMMER, 0.04),
    // Cable attachment anchor hook at rear right
    boxAt(0.85, 0.62, 0.45, -1.6, -0.58, 0.25, AN94_BRASS_FERRULE, 0.03),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return sanitizeAn94Mesh(merged);
}

/** S-08: Telescoping Dual Recoil Guide Rod & Rear Trunnion Buffer Frame */
export function buildAn94RecoilGuideGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // Rear steel anchor block seated in floating inner receiver
    boxAt(1.3, 1.35, 1.25, -5.85, -0.1, 0, AN94_ENAMEL_STEEL, 0.05),
    // Rear guide rod section
    cylXAt(0.24, 0.24, 7.6, -1.8, 0, 0, AN94_STAINLESS, 18),
    // Front telescoping tube section
    cylXAt(0.18, 0.18, 5.2, 4.0, 0, 0, AN94_INNER_STEEL, 16),
    // Polymer shock buffer pad
    boxAt(0.55, 1.15, 1.1, -4.95, -0.1, 0, AN94_POLY_DARK, 0.04),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return sanitizeAn94Mesh(merged);
}

/** FC-01: Pivoting Steel Hyperburst Hammer & 2-Round Ratchet Pawl */
export function buildAn94HammerGeometry(): THREE.BufferGeometry {
  const hammerPts: Array<[number, number]> = [
    [-0.55, -0.45],
    [0.55, -0.45],
    [0.75, 0.45],
    [0.35, 1.65],
    [-0.38, 1.65],
    [-0.62, 0.55],
  ];
  const parts: THREE.BufferGeometry[] = [
    extrudeProfileZ(hammerPts, 0.72, AN94_STAINLESS, 0.04),
    cylZAt(0.28, 0.28, 1.65, 0, 0, 0, AN94_ENAMEL_STEEL, 18),
    // 2-round hyperburst ratchet escapement arm
    boxAt(1.65, 0.42, 0.28, -0.95, 0.25, -0.52, AN94_BRONZE_RAMMER, 0.03),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return sanitizeAn94Mesh(merged);
}

/** FC-02: Curved Steel Trigger & Articulated Floating-Action Disconnector Bar */
export function buildAn94TriggerGeometry(): THREE.BufferGeometry {
  const trigPts: Array<[number, number]> = [
    [-0.45, 0.45],
    [0.55, 0.45],
    [0.38, -0.35],
    [0.05, -1.35],
    [0.55, -2.05],
    [0.12, -2.25],
    [-0.48, -1.38],
    [-0.32, -0.35],
  ];
  const parts: THREE.BufferGeometry[] = [
    extrudeProfileZ(trigPts, 0.54, AN94_ENAMEL_STEEL, 0.03),
    cylZAt(0.22, 0.22, 1.45, 0, 0.15, 0, AN94_STAINLESS, 16),
    // Articulated floating-action disconnector transfer linkage
    boxAt(3.4, 0.45, 0.32, -1.35, 0.65, -0.36, AN94_INNER_STEEL, 0.03),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return sanitizeAn94Mesh(merged);
}

// ============================================================================
// SUITE 3: 40.5cm FLOATING BARREL, GAS TUBE, FIGURE-8 BRAKE & 15° MAG (7 parts)
// ============================================================================

/** F-03: 40.5 cm Floating Cold-Hammer-Forged 5.45×39mm Barrel (`local X ∈ [0.0, 40.5]`) */
export function buildAn94BarrelGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // Reinforced chamber breech sleeve (X ∈ [0.0, 7.2])
    cylXAt(0.92, 0.92, 7.2, 3.6, 0, 0, AN94_BARREL_STEEL, 32, 0.03),
    // Mid barrel stepped taper (X ∈ [7.0, 26.0])
    cylXAt(0.76, 0.86, 19.0, 16.5, 0, 0, AN94_BARREL_STEEL, 28, 0.02),
    // Forward slim profile to muzzle crown (X ∈ [25.8, 40.5])
    cylXAt(0.72, 0.75, 14.7, 33.15, 0, 0, AN94_BARREL_STEEL, 28, 0.02),
    // Mid-barrel vertical gas-block manifold collar at local X = 25.5 (world X = 30.7)
    boxAt(2.8, 2.5, 1.85, 25.5, 0.9, 0, AN94_ENAMEL_STEEL, 0.06),
    // Underside bayonet/accessory lug collar
    boxAt(2.4, 0.85, 1.15, 34.8, -0.82, 0, AN94_ENAMEL_STEEL, 0.04),
  ];
  const solid = mergeParts(parts);
  for (const p of parts) p.dispose();

  // Through-bore 5.45mm rifled cavity
  const bore = new THREE.CylinderGeometry(0.285, 0.285, 41.2, 18)
    .rotateZ(Math.PI / 2)
    .translate(20.25, 0, 0);
  const out = csgSubtract(solid, [bore], Math.PI / 5.5);
  solid.dispose();
  bore.dispose();
  return sanitizeAn94Mesh(out);
}

/** F-04: Upper High-Pressure Gas Cylinder & Tall Hooded Front Sight Post (`assembledPos: [21.5, 3.55, 0]`) */
export function buildAn94GasTubeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // High-pressure upper steel gas cylinder tube (local X ∈ [-10.5, +10.2], world X ∈ [+11.0, +31.7])
    cylXAt(0.68, 0.68, 20.7, -0.15, 0, 0, AN94_ENAMEL_STEEL, 28, 0.025),
    // Front gas plug cap & collar at local X = +10.4
    cylXAt(0.84, 0.84, 1.45, 9.7, 0, 0, AN94_INNER_STEEL, 24, 0.03),
    // Tall iconic AN-94 front sight tower rising directly off the front gas block (local X = +9.2, Y ∈ [0.4, +2.8])
    boxAt(2.2, 2.35, 1.45, 9.2, 1.45, 0, AN94_ENAMEL_STEEL, 0.05),
    // Protective cylindrical front sight hood
    cylXAt(0.76, 0.76, 1.75, 9.2, 2.55, 0, AN94_ENAMEL_STEEL, 24, 0.02),
    // Front sight blade post inside hood
    boxAt(0.26, 0.92, 0.16, 9.2, 2.38, 0, AN94_SIGHT_WHITE, 0.015),
  ];
  const solid = mergeParts(parts);
  for (const p of parts) p.dispose();

  const cutters = [
    // Hollow interior of gas tube
    new THREE.CylinderGeometry(0.46, 0.46, 20.0, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.6, 0, 0),
    // Sight hood open window
    new THREE.CylinderGeometry(0.56, 0.56, 2.1, 20)
      .rotateZ(Math.PI / 2)
      .translate(9.2, 2.55, 0),
  ];
  const out = csgSubtract(solid, cutters, Math.PI / 5.5);
  solid.dispose();
  for (const c of cutters) c.dispose();
  return sanitizeAn94Mesh(out);
}

/** F-05: THE SILHOUETTE ICON — Nikonov Asymmetrical Figure-8 Twin-Chamber Whistling Muzzle Compensator (`local X ∈ [0.0, 5.6]`) */
export function buildAn94MuzzleBrakeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // Rear bayonet-mount locking collar & detent ring (local X ∈ [0.0, 1.35])
    cylXAt(0.95, 0.95, 1.35, 0.675, 0, 0, AN94_ENAMEL_STEEL, 28, 0.03),
    // UPPER expansion lobe of iconic Figure-8 profile (offset +Y = +0.58)
    cylXAt(0.92, 0.96, 4.35, 3.42, 0.58, 0, AN94_BARREL_STEEL, 28, 0.03),
    // LOWER expansion lobe of iconic Figure-8 profile (offset -Y = -0.52)
    cylXAt(0.88, 0.92, 4.35, 3.42, -0.52, 0, AN94_BARREL_STEEL, 28, 0.03),
    // Central waist web connecting the twin offset chambers
    boxAt(4.35, 1.25, 1.28, 3.42, 0.03, 0, AN94_BARREL_STEEL, 0.04),
  ];
  const solid = mergeParts(parts);
  for (const p of parts) p.dispose();

  const cutters: THREE.BufferGeometry[] = [
    // Central 5.45mm bullet flight bore
    new THREE.CylinderGeometry(0.36, 0.36, 6.2, 18)
      .rotateZ(Math.PI / 2)
      .translate(2.8, 0, 0),
    // Upper chamber lateral gas-whistle expansion cut
    new THREE.BoxGeometry(2.6, 0.92, 2.4).translate(3.4, 0.62, 0),
    // Lower chamber lateral gas-whistle expansion cut
    new THREE.BoxGeometry(2.6, 0.85, 2.4).translate(3.4, -0.54, 0),
  ];
  const out = csgSubtract(solid, cutters, Math.PI / 5.5);
  solid.dispose();
  for (const c of cutters) c.dispose();
  return sanitizeAn94Mesh(out);
}

/** M-01: Iconic 15°-Right-Canted 30-Round Dark Plum-Black Izhmash 5.45×39mm Polymer Magazine Body */
export function buildAn94MagBodyGeometry(): THREE.BufferGeometry {
  const hollow = buildCurvedMagBodyRaw(
    AN94_MAG_R_IN,
    AN94_MAG_R_OUT,
    1.35,
    0.34,
    0.27,
    AN94_MAG_ANG_START,
    AN94_MAG_ANG_END,
    18,
    AN94_PLUM_MAG
  );

  // Add front steel locking lug & rear steel catch lip at top throat
  const [fx, fy] = magArcLocalPoint(0.02, AN94_MAG_R_IN - 0.12);
  const [rx, ry] = magArcLocalPoint(0.04, AN94_MAG_R_OUT + 0.14);
  const parts: THREE.BufferGeometry[] = [
    hollow,
    boxAt(0.55, 0.72, 1.65, fx, fy, 0, AN94_ENAMEL_STEEL, 0.03),
    boxAt(0.62, 0.95, 1.55, rx, ry, 0, AN94_ENAMEL_STEEL, 0.03),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return sanitizeAn94Mesh(merged);
}

/** M-02: Strictly Firewalled Vivid Safety-Orange Anti-Tilt 5.45mm Follower (pre-pitched in local XY!) */
export function buildAn94MagFollowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    boxAt(5.2, 0.42, 1.88, 0, 0.12, 0, AN94_FOLLOWER_ORANGE, 0.05),
    cylXAt(0.24, 0.24, 4.9, 0, 0.38, -0.36, AN94_FOLLOWER_ORANGE, 18, 0.02),
    boxAt(0.55, 1.15, 1.76, 2.25, -0.45, 0, AN94_FOLLOWER_ORANGE, 0.04),
    boxAt(0.55, 1.15, 1.76, -2.25, -0.45, 0, AN94_FOLLOWER_ORANGE, 0.04),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  // Pre-pitch in local XY to match banana arc tangent at AN94_MAG_FOLLOWER_ANG
  merged.rotateZ(AN94_MAG_FOLLOWER_ANG);
  return sanitizeAn94Mesh(merged);
}

/** M-03: Solid Static Curved Rectangular Magazine Spring (sits cleanly below follower at bottom of curve!) */
export function buildAn94MagSpringGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const coils = 5;
  const steps = coils * 16;
  const angA = 0.828;
  const angB = 0.908;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const ang = angA + (angB - angA) * u;
    const theta = u * coils * Math.PI * 2;
    const radialOff = Math.cos(theta) * 2.15;
    const zOff = Math.sin(theta) * 0.78;
    const [lx, ly] = magArcLocalPoint(ang, AN94_MAG_R_MID + radialOff);
    pts.push(new THREE.Vector3(lx, ly, zOff));
  }
  const tube = buildCappedTube(pts, 0.095, 8, AN94_SPRING_STEEL);
  return sanitizeAn94Mesh(tube);
}

/** M-04: Stamped Steel Magazine Floorplate & Retention Button (pre-pitched at bottom of curve!) */
export function buildAn94MagFloorplateGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    boxAt(6.9, 0.55, 2.86, 0, -0.22, 0, AN94_ENAMEL_STEEL, 0.06),
    cylYAt(0.32, 0.32, 0.25, 0, -0.52, 0, AN94_INNER_STEEL, 16, 0.02),
  ];
  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  merged.rotateZ(AN94_MAG_ANG_END);
  return sanitizeAn94Mesh(merged);
}

// ============================================================================
// DYNAMIC GPU-COMPRESSED `aSpringParam` CSG SPRINGS (SKIP IN `an94.glb` · 2 parts)
// ============================================================================

/** S-09: Dynamic Helical Bolt-Carrier Recoil Spring (`aSpringParam` w=1, local X ∈ [0.0, 12.2]) */
export function buildAn94RecoilSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: 0.0,
    end: 12.2,
    centerY: 0.0,
    centerZ: 0.0,
    coilRadius: 0.44,
    wireRadius: 0.082,
    coils: 22,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  paintGeometry(spring, AN94_SPRING_STEEL);
  return sanitizeAn94Mesh(spring, true);
}

/** F-09: Dynamic Heavy Lower Floating-Receiver Buffer/Return Spring (`aSpringParam` w=1, local X ∈ [0.0, 7.8]) */
export function buildAn94ReceiverBufferSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: 0.0,
    end: 7.8,
    centerY: 0.0,
    centerZ: 0.0,
    coilRadius: 0.27,
    wireRadius: 0.068,
    coils: 16,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  paintGeometry(spring, AN94_SPRING_STEEL);
  return sanitizeAn94Mesh(spring, true);
}
