import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clampUv01 as clamp01 } from '../../../engine/geometry/uvUnwrap';
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

// Authentic H&K G11 K2 (4.73×33mm DM11 Caseless) Bundeswehr Olive-Charcoal,
// Brushed Chrome Rotary Breech, Swiss-Watch Brass/Steel Clockwork & Ochre DM11 Palette
// (All vertex colors strictly calibrated well above Khronos 0.018 linear luminance floor)
export const G11_OLIVE_CHARCOAL = '#4b5248';
export const G11_POLYMER_DARK = '#3d433d';
export const G11_RUBBER_PAD = '#3a3f42';
export const G11_OPTIC_LENS = '#2a8f7c';
export const G11_NITRIDE_STEEL = '#565e6a';
export const G11_BARREL_STEEL = '#4c5460';
export const G11_INNER_DARK = '#363c44';
export const G11_CHROME_BREECH = '#d2dae4';
export const G11_STAINLESS = '#c6d0dc';
export const G11_CLOCKWORK_BRASS = '#d4a644';
export const G11_SPRING_STEEL = '#94a3b8';
export const G11_MAG_SMOKED = '#545148';
export const G11_DM11_OCHRE = '#b89458';
export const G11_COPPER_BULLET = '#c97340';
export const G11_FOLLOWER_ORANGE = '#ea580c';
export const G11_SELECTOR_RED = '#dc2626';
export const G11_MARK_WHITE = '#f1f5f9';

/** Central 4.73mm barrel & rotary breech centerline (1 world unit = 1 cm). */
export const G11_BORE_Y = 0.0;
/** Overhead 45-round horizontal 4.73×33mm DM11 caseless magazine centerline Y. */
export const G11_MAG_Y = 3.95;
/** Rotary breech cylinder center X (directly behind 54 cm barrel breech at X = -19.0). */
export const G11_BREECH_X = -21.2;
/** Meshing clockwork primary spur gear center X (pitch-tangent to rotary breech!). */
export const G11_GEAR_X = -16.95;

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
 * Strips any zero-area CSG sliver triangles, enforces positive signed volume (`signedVolume > 0`),
 * preserves `aCurvature` & `aSpringParam`, guarantees unit-length normals (`|n| = 1`),
 * and normalizes UVs strictly into `[0.04, 0.96]` (within `[0, 1]` with span `>= 0.92`).
 */
export function sanitizeG11Mesh(
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
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.45;
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

  if (computeSignedVolumeRaw(outPos) < 0) {
    const outUv = out.getAttribute('uv') as THREE.BufferAttribute;
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
// WATERTIGHT CAD SOLID & HELICAL SPRING PRIMITIVES
// ============================================================================

function revolveClosedX(
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

function extrudeAlongZ(
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

function mergeCutters(
  cutters: THREE.BufferGeometry[],
  color = G11_INNER_DARK
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

function createSpurGearZ(
  teeth: number,
  rRoot: number,
  rTip: number,
  widthZ: number,
  zCenter: number,
  boreR: number,
  color: string
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const steps = teeth * 4;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const phase = i % 4;
    const r = phase === 1 || phase === 2 ? rTip : rRoot;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  if (boreR > 0.05) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, boreR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return extrudeAlongZ(shape, zCenter, widthZ, color, 0.025, 4);
}

function createWatertightHelicalSpring(
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
// 1. FLOATING BARRELED ACTION, ROTARY BREECH & RECOIL ('slide' · 7 PARTS)
// ============================================================================

/** S-01 (`g11_barrel`): 54.0 cm (540 mm) CHF chrome-lined floating 4.73mm barrel (`X ∈ [-19.0, +35.0]`). */
export function buildG11BarrelGeometry(): THREE.BufferGeometry {
  const tube = revolveClosedX(
    [
      [0.32, -19.0],
      [0.98, -19.0], // Precision gas-seal breech collar facing rotary cylinder
      [0.98, -11.0], // Heavy trunnion journal
      [0.82, -10.4],
      [0.82, 6.2], // Mid-contour through gas tap block
      [0.72, 6.8],
      [0.72, 16.0],
      [0.68, 16.5],
      [0.68, 34.4],
      [0.64, 34.5], // Flash hider shoulder
      [0.64, 34.95],
      [0.58, 35.0],
      [0.25, 35.0], // 4.73mm target muzzle crown
      [0.25, -18.7], // Chrome-lined rifled bore
      [0.32, -19.0], // Gas-seal forcing cone throat
    ],
    28,
    G11_BARREL_STEEL
  );
  return sanitizeG11Mesh(tube);
}

/** S-02 (`g11_flash_hider`): H&K G11 K2 slotted flash hider + under-slung bayonet lug (`X ∈ [0, +4.5]`). */
export function buildG11FlashHiderGeometry(): THREE.BufferGeometry {
  const body = revolveClosedX(
    [
      [0.64, 0.0],
      [0.92, 0.0],
      [0.92, 1.05],
      [0.96, 1.15],
      [0.96, 1.55], // Grenade retention spring ring
      [0.88, 1.65],
      [0.88, 4.35],
      [0.82, 4.5],
      [0.44, 4.5],
      [0.44, 1.05],
      [0.64, 0.95],
      [0.64, 0.0],
    ],
    24,
    G11_NITRIDE_STEEL
  );
  const cutters: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const slot = createChamferedBox(2.2, 0.24, 1.1, 0.02);
    slot.translate(2.95, 0, 0.65);
    slot.rotateX(a);
    cutters.push(slot);
  }
  const slotted = csgSubtract(body, [mergeCutters(cutters)]);
  const bayoLug = paintGeometry(
    createChamferedBox(2.4, 0.65, 0.62, 0.04).translate(1.45, -1.02, 0),
    G11_NITRIDE_STEEL
  );
  return sanitizeG11Mesh(mergeParts([slotted, bayoLug]));
}

/** S-03 (`g11_inner_receiver`): Floating CNC steel barreled-action chassis (`X ∈ [-28.8, +14.2]`). */
export function buildG11InnerReceiverGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Left & Right CNC skeletonized side frames with generous breech/clockwork viewing windows
  for (const sgn of [-1, 1] as const) {
    const wall = new THREE.Shape();
    wall.moveTo(-28.8, -3.65);
    wall.lineTo(14.2, -2.5);
    wall.lineTo(14.2, 2.0);
    wall.lineTo(-28.8, 2.0);
    wall.closePath();

    // Large window exposing rotary breech cylinder at X = -21.2
    const wBreech = new THREE.Path();
    wBreech.absarc(-21.2, 0.0, 1.65, 0, Math.PI * 2, true);
    wall.holes.push(wBreech);

    // Large window exposing Swiss-watch spur gear train at X = -16.95..-11.5
    const wGears = new THREE.Path();
    wGears.moveTo(-18.2, -1.55);
    wGears.lineTo(-10.5, -1.55);
    wGears.lineTo(-10.5, 1.35);
    wGears.lineTo(-18.2, 1.35);
    wGears.closePath();
    wall.holes.push(wGears);

    parts.push(extrudeAlongZ(wall, sgn * 2.26, 0.32, G11_NITRIDE_STEEL, 0.03));
  }

  // Heavy front barrel trunnion collar (`X ∈ [-19.2, -11.2]`)
  const trunnionOuter = paintGeometry(
    createChamferedBox(7.8, 2.75, 4.4, 0.08).translate(-15.1, 0.0, 0),
    G11_NITRIDE_STEEL
  );
  const trunnionHole = createBeveledCylinder(1.04, 1.04, 8.4, 0.02, 20);
  trunnionHole.rotateZ(Math.PI / 2);
  trunnionHole.translate(-15.1, 0.0, 0);
  const trunnion = csgSubtract(trunnionOuter, [
    paintGeometry(trunnionHole, G11_INNER_DARK),
  ]);
  parts.push(trunnion);

  // Upper overhead-magazine rail bridge (`X ∈ [-24.5, +14.2]`, `Y ∈ [+1.75, +2.20]`)
  const topRail = paintGeometry(
    createChamferedBox(38.7, 0.45, 4.48, 0.04).translate(-5.15, 1.98, 0),
    G11_NITRIDE_STEEL
  );
  const feedSlot = paintGeometry(
    createChamferedBox(2.4, 0.8, 1.8, 0.02).translate(-21.2, 1.98, 0),
    G11_INNER_DARK
  );
  parts.push(csgSubtract(topRail, [feedSlot]));

  // Rear striker bulkhead (`X ∈ [-28.8, -26.8]`) & lower recoil-spring thrust abutment (`X = -18.6, Y = -3.05`)
  parts.push(
    paintGeometry(
      createChamferedBox(2.0, 5.55, 4.44, 0.06).translate(-27.8, -0.78, 0),
      G11_NITRIDE_STEEL
    ),
    paintGeometry(
      createChamferedBox(1.6, 1.45, 3.8, 0.05).translate(-18.6, -3.05, 0),
      G11_STAINLESS
    )
  );

  return sanitizeG11Mesh(mergeParts(parts));
}

/**
 * S-04 (`g11_rotary_breech`): THE STAR — Gleaming brushed-chrome 90° Rotating Cylindrical
 * Breech Block (`R = 2.04 cm`, `Z ∈ [-1.68, +1.48]`) with cutaway-visible transverse rectangular
 * `4.73×33mm DM11` caseless chamber & rear `-Z` meshing spur gear rim!
 */
export function buildG11RotaryBreechGeometry(): THREE.BufferGeometry {
  const cyl = paintGeometry(
    createBeveledCylinder(1.98, 1.98, 2.74, 0.06, 32)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.11),
    G11_CHROME_BREECH
  );
  // Open cutaway transverse rectangular 4.73×33mm DM11 caseless chamber slot visible from +Z!
  const chamberCut = paintGeometry(
    createChamferedBox(4.3, 0.92, 2.1, 0.03).translate(0, 0, 0.65),
    G11_INNER_DARK
  );
  const slottedCyl = csgSubtract(cyl, [chamberCut]);

  // Rear -Z perimeter spur gear rim (`Z ∈ [-1.68, -1.26]`) meshing 1:1 with clockwork!
  const gearL = createSpurGearZ(24, 1.88, 2.04, 0.42, -1.47, 0.65, G11_STAINLESS);

  return sanitizeG11Mesh(mergeParts([slottedCyl, gearL]));
}

/** S-05 (`g11_gas_piston`): Short-stroke gas tap block & chrome annular gas piston beneath barrel. */
export function buildG11GasPistonGeometry(): THREE.BufferGeometry {
  // Gas tap collar wrapping barrel (`local Y = +1.55`)
  const collar = paintGeometry(
    createChamferedBox(2.6, 2.2, 1.84, 0.06).translate(3.1, 0.55, 0),
    G11_NITRIDE_STEEL
  );
  const boreHole = paintGeometry(
    createBeveledCylinder(0.76, 0.76, 3.2, 0.02, 18)
      .rotateZ(Math.PI / 2)
      .translate(3.1, 1.55, 0),
    G11_INNER_DARK
  );
  const gasBlock = csgSubtract(collar, [boreHole]);

  // Chrome gas piston stem + sealing rings at `local Y = 0.0` (`world Y = -1.55`)
  const piston = revolveClosedX(
    [
      [0.0, -3.2],
      [0.36, -3.2],
      [0.36, 0.9],
      [0.62, 1.0],
      [0.62, 1.55],
      [0.48, 1.62],
      [0.62, 1.72],
      [0.62, 2.3],
      [0.48, 2.38],
      [0.62, 2.48],
      [0.62, 3.0],
      [0.0, 3.0],
    ],
    20,
    G11_STAINLESS
  );

  return sanitizeG11Mesh(mergeParts([gasBlock, piston]));
}

/** S-06 (`g11_driving_rod`): Twin toothed stainless rack rails driving the clockwork spur gear train. */
export function buildG11DrivingRodGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Front cross-yoke meeting gas piston (`local X = +8.8`)
  parts.push(
    paintGeometry(
      createChamferedBox(1.2, 0.95, 3.66, 0.04).translate(8.8, 0.1, 0),
      G11_STAINLESS
    )
  );
  // Twin left/right toothed rack bars (`Z = ±1.66`, engaging clockwork gears at `X = -16.95`)
  for (const sgn of [-1, 1] as const) {
    parts.push(
      paintGeometry(
        createChamferedBox(18.8, 0.56, 0.36, 0.03).translate(-0.2, -0.22, sgn * 1.66),
        G11_STAINLESS
      )
    );
    // 14 crisp machined rack teeth along upper face near clockwork gears (`local X ∈ [-9.2, -1.6]`)
    for (let t = 0; t < 14; t++) {
      const tx = -9.1 + t * 0.55;
      parts.push(
        paintGeometry(
          createChamferedBox(0.28, 0.36, 0.34, 0.02).translate(tx, 0.24, sgn * 1.66),
          G11_CLOCKWORK_BRASS
        )
      );
    }
  }
  return sanitizeG11Mesh(mergeParts(parts));
}

/** S-07 (`g11_recoil_spring`): Dynamic X-axis helical recoil coil (`w = 1`, `start = 0, end = +14.2`). */
export function buildG11RecoilSpringGeometry(): THREE.BufferGeometry {
  return createWatertightHelicalSpring(
    {
      axis: 'x',
      start: 0.0,
      end: 14.2,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.52,
      wireRadius: 0.1,
      coils: 19,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    },
    G11_SPRING_STEEL
  );
}

// ============================================================================
// 2. MONOCOQUE POLYMER SHELL, INTEGRAL OPTIC & EXTERIOR CONTROLS ('frame' · 7)
// ============================================================================

/** F-01 (`g11_outer_housing`): Iconic Bundeswehr olive-charcoal monocoque polymer shell (`X ∈ [-34.6, +30.6]`). */
export function buildG11OuterHousingGeometry(): THREE.BufferGeometry {
  // Side profile of the iconic G11 K2 boxy futuristic monolith
  const body = new THREE.Shape();
  body.moveTo(-34.6, -6.8);
  body.lineTo(-8.5, -5.8);
  body.lineTo(-3.2, -5.6);
  body.lineTo(3.5, -3.0);
  body.lineTo(30.6, -2.0);
  body.lineTo(30.6, 6.6);
  body.lineTo(-34.6, 6.6);
  body.closePath();

  const outerSolid = extrudeAlongZ(body, 0, 6.4, G11_OLIVE_CHARCOAL, 0.22, 6);

  // Hollow internal cavities so CT cutaway & X-Ray reveal the entire floating clockwork action!
  const cutters: THREE.BufferGeometry[] = [
    // Floating inner receiver cavity
    createChamferedBox(48.8, 7.6, 5.1, 0.08).translate(-9.7, -1.9, 0),
    // Overhead 45-round caseless magazine tunnel (open at front X = +30.6!)
    createChamferedBox(55.4, 3.92, 3.04, 0.06).translate(4.0, 3.95, 0),
    // Barrel front clearance bore tunnel
    createChamferedBox(18.0, 2.5, 2.5, 0.06).translate(22.5, 0.0, 0),
    // Lower trigger pack cavity
    createChamferedBox(12.2, 3.8, 3.1, 0.06).translate(-1.2, -4.45, 0),
    // Circular left-flank winding-crank recessed bay at (-15.2, -0.8, -3.2)
    createBeveledCylinder(2.55, 2.55, 0.9, 0.04, 24)
      .rotateX(Math.PI / 2)
      .translate(-15.2, -0.8, -3.0),
  ];

  // Forward forend cooling vent louvers on both flanks
  for (let i = 0; i < 6; i++) {
    const vx = 14.5 + i * 1.95;
    cutters.push(
      createChamferedBox(1.15, 0.45, 6.8, 0.03).translate(vx, -0.4, 0)
    );
  }

  const hollowed = csgSubtract(outerSolid, [
    mergeCutters(cutters, G11_INNER_DARK),
  ]);
  return sanitizeG11Mesh(hollowed);
}

/** F-02 (`g11_optic_handle`): Integral carry-handle 1×/3.5× Hensoldt optical housing w/ emerald-sapphire lenses. */
export function buildG11OpticHandleGeometry(): THREE.BufferGeometry {
  const profile = new THREE.Shape();
  profile.moveTo(-14.6, -0.15);
  profile.lineTo(14.6, -0.15);
  profile.lineTo(14.6, 5.65);
  profile.lineTo(-14.6, 5.65);
  profile.closePath();

  // Classic G11 daylight carry-handle tunnel cutout
  const hole = new THREE.Path();
  hole.moveTo(-8.4, 0.45);
  hole.lineTo(8.4, 0.45);
  hole.lineTo(7.4, 2.55);
  hole.lineTo(-7.4, 2.55);
  hole.closePath();
  profile.holes.push(hole);

  const frame = extrudeAlongZ(profile, 0, 3.9, G11_OLIVE_CHARCOAL, 0.14, 6);
  const topRib = paintGeometry(
    createChamferedBox(24.0, 0.42, 1.5, 0.05).translate(0, 5.64, 0),
    G11_POLYMER_DARK
  );
  // Front & rear emerald-sapphire coated optical lenses
  const objLens = paintGeometry(
    createBeveledCylinder(1.05, 1.05, 0.35, 0.03, 22)
      .rotateZ(Math.PI / 2)
      .translate(14.52, 4.1, 0),
    G11_OPTIC_LENS
  );
  const ocuLens = paintGeometry(
    createBeveledCylinder(1.12, 1.12, 0.35, 0.03, 22)
      .rotateZ(Math.PI / 2)
      .translate(-14.52, 4.1, 0),
    G11_OPTIC_LENS
  );
  // Side windage & top elevation turret drums
  const turretR = paintGeometry(
    createBeveledCylinder(0.46, 0.46, 0.55, 0.03, 16)
      .rotateX(Math.PI / 2)
      .translate(1.5, 4.1, 1.98),
    G11_NITRIDE_STEEL
  );

  return sanitizeG11Mesh(mergeParts([frame, topRib, objLens, ocuLens, turretR]));
}

/** F-03 (`g11_pistol_grip`): Contoured ergonomic H&K grip with solidly welded closed winter trigger guard. */
export function buildG11PistolGripGeometry(): THREE.BufferGeometry {
  // Single contiguous closed loop: grip + welded bottom trigger guard + front strut joining housing!
  const shape = new THREE.Shape();
  shape.moveTo(-2.2, 1.1);
  shape.lineTo(2.1, 1.1);
  shape.lineTo(1.7, -3.6);
  shape.lineTo(8.3, -3.6);
  shape.lineTo(8.7, 3.1); // Front winter guard welded cleanly into forend underside (ZERO air gap!)
  shape.lineTo(9.6, 3.1);
  shape.lineTo(9.1, -4.5);
  shape.lineTo(1.5, -4.5);
  shape.lineTo(-0.4, -11.4);
  shape.lineTo(-5.4, -11.0);
  shape.lineTo(-2.4, -1.2);
  shape.closePath();

  const grip = extrudeAlongZ(shape, 0, 3.6, G11_POLYMER_DARK, 0.16, 6);
  // Textured side swell pads on grip palm
  const swell = paintGeometry(
    createChamferedBox(3.4, 7.6, 4.3, 0.18)
      .rotateZ(-0.24)
      .translate(-2.2, -6.4, 0),
    G11_OLIVE_CHARCOAL
  );
  return sanitizeG11Mesh(mergeParts([grip, swell]));
}

/** F-04 (`g11_buttplate`): Ribbed charcoal vulcanized rubber recoil buttpad & rear takedown cap. */
export function buildG11ButtplateGeometry(): THREE.BufferGeometry {
  const pad = paintGeometry(
    createChamferedBox(2.2, 13.3, 6.26, 0.18).translate(-0.25, -0.05, 0),
    G11_RUBBER_PAD
  );
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const ry = -5.2 + i * 1.48;
    ribs.push(
      paintGeometry(
        createChamferedBox(0.32, 0.52, 5.6, 0.04).translate(-1.24, ry, 0),
        G11_POLYMER_DARK
      )
    );
  }
  return sanitizeG11Mesh(mergeParts([pad, ...ribs]));
}

/** F-05 (`g11_winding_knob`): Iconic circular side-mounted pop-out clockwork cocking crank handle. */
export function buildG11WindingKnobGeometry(): THREE.BufferGeometry {
  const disc = paintGeometry(
    createBeveledCylinder(2.42, 2.42, 0.65, 0.06, 28)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.25),
    G11_NITRIDE_STEEL
  );
  const shaft = paintGeometry(
    createBeveledCylinder(0.68, 0.68, 0.85, 0.04, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.22),
    G11_STAINLESS
  );
  // Iconic pop-out crank lever arm & knurled handle tip
  const arm = paintGeometry(
    createChamferedBox(2.8, 0.88, 0.48, 0.06).translate(0.75, 0, -0.76),
    G11_POLYMER_DARK
  );
  const knob = paintGeometry(
    createBeveledCylinder(0.42, 0.42, 0.65, 0.05, 16)
      .rotateX(Math.PI / 2)
      .translate(1.85, 0, -0.82),
    G11_NITRIDE_STEEL
  );
  return sanitizeG11Mesh(mergeParts([disc, shaft, arm, knob]));
}

/** F-06 (`g11_spare_clips`): Side-mounted twin spare 45-rd caseless magazine holding clips. */
export function buildG11SpareClipsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const xOff of [-7.8, 7.8] as const) {
    // Top saddle strap bridging cleanly across the forend roof (zero floating geometry!)
    parts.push(
      paintGeometry(
        createChamferedBox(2.4, 0.42, 6.2, 0.04).translate(xOff, 1.12, 0),
        G11_POLYMER_DARK
      )
    );
    // Left & right U-clip magazine brackets hugging the flanks
    for (const sgn of [-1, 1] as const) {
      parts.push(
        paintGeometry(
          createChamferedBox(2.6, 2.65, 1.35, 0.06).translate(xOff, 0.0, sgn * 3.56),
          G11_OLIVE_CHARCOAL
        )
      );
    }
  }
  // Longitudinal tie rails linking forward and rear spare-mag brackets
  for (const sgn of [-1, 1] as const) {
    parts.push(
      paintGeometry(
        createChamferedBox(18.6, 0.85, 0.55, 0.05).translate(0, 0.0, sgn * 3.25),
        G11_POLYMER_DARK
      )
    );
  }
  return sanitizeG11Mesh(mergeParts(parts));
}

/** F-07 (`g11_buffer_assembly`): Rear hydraulic/elastomer floating-action recoil buffer. */
export function buildG11BufferAssemblyGeometry(): THREE.BufferGeometry {
  const block = paintGeometry(
    createChamferedBox(2.2, 5.6, 4.2, 0.08).translate(0.05, -0.3, 0),
    G11_NITRIDE_STEEL
  );
  const padFront = paintGeometry(
    createChamferedBox(0.55, 4.4, 3.6, 0.06).translate(0.95, 0.1, 0),
    G11_RUBBER_PAD
  );
  const springSeat = paintGeometry(
    createBeveledCylinder(0.68, 0.68, 0.9, 0.04, 18)
      .rotateZ(Math.PI / 2)
      .translate(0.8, -1.45, 0),
    G11_STAINLESS
  );
  return sanitizeG11Mesh(mergeParts([block, padFront, springSeat]));
}

// ============================================================================
// 3. CLOCKWORK GEAR TRAIN, RAMMER, BURST PACK & SELECTOR ('fire_control' · 6)
// ============================================================================

/** FC-01 (`g11_clockwork_gears`): Gleaming CNC stainless & golden-brass Swiss-watch spur gear train. */
export function buildG11ClockworkGearsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Rear -Z stainless spur gear (`Z = -1.48`, meshing 1:1 with rotary breech!) + front +Z skeletonized golden brass gear
  parts.push(
    createSpurGearZ(26, 1.94, 2.18, 0.44, -1.48, 0.72, G11_STAINLESS),
    createSpurGearZ(22, 1.92, 2.18, 0.36, 1.4, 1.48, G11_CLOCKWORK_BRASS)
  );
  // 5 radial watchmaker spokes on the +Z brass gear ring
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(
      paintGeometry(
        createChamferedBox(1.55, 0.24, 0.26, 0.02)
          .translate(0.85, 0, 1.4)
          .rotateZ(a),
        G11_CLOCKWORK_BRASS
      )
    );
  }
  // Lower eccentric bridge tie-pin below barrel clearance (`local Y = -1.55`) linking both gear flanks!
  parts.push(
    paintGeometry(
      createBeveledCylinder(0.3, 0.3, 3.55, 0.03, 16)
        .rotateX(Math.PI / 2)
        .translate(0, -1.55, 0),
      G11_CHROME_BREECH
    ),
    paintGeometry(
      createBeveledCylinder(0.45, 0.45, 0.56, 0.03, 16)
        .rotateX(Math.PI / 2)
        .translate(0, 0, -1.58),
      G11_CLOCKWORK_BRASS
    ),
    paintGeometry(
      createBeveledCylinder(0.48, 0.48, 0.52, 0.03, 16)
        .rotateX(Math.PI / 2)
        .translate(0, 0, 1.42),
      G11_CHROME_BREECH
    )
  );
  return sanitizeG11Mesh(mergeParts(parts));
}

/** FC-02 (`g11_loading_rammer`): Vertical spring-cam feed rammer plunging `-Y` into rotary breech. */
export function buildG11LoadingRammerGeometry(): THREE.BufferGeometry {
  const yoke = paintGeometry(
    createChamferedBox(2.2, 0.95, 2.15, 0.06).translate(0, 0.52, 0),
    G11_STAINLESS
  );
  const plunger = paintGeometry(
    createChamferedBox(1.15, 1.85, 0.96, 0.04).translate(0, -0.42, 0),
    G11_CLOCKWORK_BRASS
  );
  return sanitizeG11Mesh(mergeParts([yoke, plunger]));
}

/** FC-03 (`g11_firing_pin`): Axial striker rod & sear collar piercing breech center (`Y = 0`). */
export function buildG11FiringPinGeometry(): THREE.BufferGeometry {
  const rod = revolveClosedX(
    [
      [0.0, -2.85],
      [0.44, -2.85],
      [0.44, -1.6],
      [0.28, -1.45],
      [0.28, 0.65],
      [0.14, 0.95],
      [0.12, 1.35],
      [0.0, 1.35],
    ],
    18,
    G11_STAINLESS
  );
  const lug = paintGeometry(
    createChamferedBox(0.95, 0.95, 0.72, 0.04).translate(-2.0, -0.05, 0),
    G11_NITRIDE_STEEL
  );
  return sanitizeG11Mesh(mergeParts([rod, lug]));
}

/** FC-04 (`g11_trigger_pack`): Internal clockwork 3-round burst counter & sear housing. */
export function buildG11TriggerPackGeometry(): THREE.BufferGeometry {
  const housing = paintGeometry(
    createChamferedBox(8.6, 2.75, 2.66, 0.08).translate(0, -0.1, 0),
    G11_NITRIDE_STEEL
  );
  // Exposed brass 3-round hyperburst counter ratchet protruding cleanly atop pack
  const ratchet = createSpurGearZ(12, 0.92, 1.12, 0.55, 0, 0.25, G11_CLOCKWORK_BRASS);
  ratchet.translate(-1.2, 0.22, 0);
  return sanitizeG11Mesh(mergeParts([housing, ratchet]));
}

/** FC-05 (`g11_trigger`): Curved H&K steel trigger + rearward transfer link. */
export function buildG11TriggerGeometry(): THREE.BufferGeometry {
  const shoe = new THREE.Shape();
  shoe.moveTo(-0.3, 1.25);
  shoe.lineTo(0.85, 1.25);
  shoe.quadraticCurveTo(0.45, -0.4, 1.05, -1.85);
  shoe.lineTo(0.32, -1.92);
  shoe.quadraticCurveTo(-0.35, -0.45, -0.3, 1.25);
  const triggerShoe = extrudeAlongZ(shoe, 0, 0.82, G11_NITRIDE_STEEL, 0.04, 8);
  const bar = paintGeometry(
    createChamferedBox(5.6, 0.45, 1.18, 0.03).translate(-2.35, 1.1, 0),
    G11_STAINLESS
  );
  return sanitizeG11Mesh(mergeParts([triggerShoe, bar]));
}

/** FC-06 (`g11_selector`): Ambidextrous `S / 1 / 3 / A` cross-shaft & dual fire selector paddles. */
export function buildG11SelectorGeometry(): THREE.BufferGeometry {
  const shaft = paintGeometry(
    createBeveledCylinder(0.42, 0.42, 6.85, 0.03, 18).rotateX(Math.PI / 2),
    G11_NITRIDE_STEEL
  );
  const parts: THREE.BufferGeometry[] = [shaft];
  for (const sgn of [-1, 1] as const) {
    parts.push(
      paintGeometry(
        createChamferedBox(2.55, 0.88, 0.44, 0.05).translate(0.5, 0, sgn * 3.45),
        G11_NITRIDE_STEEL
      ),
      paintGeometry(
        createChamferedBox(0.55, 0.24, 0.48, 0.02).translate(1.42, 0, sgn * 3.45),
        G11_SELECTOR_RED
      )
    );
  }
  return sanitizeG11Mesh(mergeParts(parts));
}

// ============================================================================
// 4. OVERHEAD 45-ROUND 4.73×33mm DM11 CASELESS MAGAZINE ('magazine' · 4 PARTS)
// ============================================================================

/**
 * M-01 (`g11_mag_tube`): Top-mounted 45-round horizontal smoked-polymer/aluminum caseless
 * magazine housing seated above barrel, displaying stacked rectangular tan-ochre DM11 blocks!
 */
export function buildG11MagTubeGeometry(): THREE.BufferGeometry {
  const outer = paintGeometry(
    createChamferedBox(52.1, 3.58, 2.62, 0.08).translate(-0.1, 0, 0),
    G11_MAG_SMOKED
  );
  const cavity = paintGeometry(
    createChamferedBox(51.4, 3.04, 2.02, 0.04).translate(0.25, 0, 0),
    G11_INNER_DARK
  );
  const feedMouth = paintGeometry(
    createChamferedBox(2.2, 1.2, 1.85, 0.02).translate(-24.8, -1.55, 0),
    G11_INNER_DARK
  );
  const shell = csgSubtract(outer, [mergeCutters([cavity, feedMouth])]);
  return sanitizeG11Mesh(shell);
}

/** M-02 (`g11_mag_follower`): Strictly firewalled vivid Safety-Orange horizontal pusher follower. */
export function buildG11MagFollowerGeometry(): THREE.BufferGeometry {
  const body = paintGeometry(
    createChamferedBox(1.96, 2.68, 1.92, 0.07),
    G11_FOLLOWER_ORANGE
  );
  return sanitizeG11Mesh(body);
}

/** M-03 (`g11_mag_spring`): Dynamic horizontal X-axis overhead magazine feed coil (`w = 1`, front-pinned at `0`). */
export function buildG11MagSpringGeometry(): THREE.BufferGeometry {
  return createWatertightHelicalSpring(
    {
      axis: 'x',
      start: -9.2,
      end: 0.0,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.56,
      wireRadius: 0.09,
      coils: 16,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    },
    G11_SPRING_STEEL
  );
}

/** M-04 (`g11_mag_endcap`): Front bayonet-mount magazine cap closing overhead tube nose. */
export function buildG11MagEndcapGeometry(): THREE.BufferGeometry {
  const cap = paintGeometry(
    createChamferedBox(2.2, 3.54, 2.68, 0.09).translate(0.85, 0, 0),
    G11_POLYMER_DARK
  );
  const spigot = paintGeometry(
    createChamferedBox(0.6, 2.7, 1.9, 0.05).translate(-0.05, 0, 0),
    G11_NITRIDE_STEEL
  );
  return sanitizeG11Mesh(mergeParts([cap, spigot]));
}
