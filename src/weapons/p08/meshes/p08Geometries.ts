import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { attachCurvatureAttribute } from '../../../engine/geometry/curvatureBuilder';
import {
  createChamferedBox,
  createHelicalSpring,
  createRifledBarrelBoreCutter,
  csgSubtract,
  csgUnion,
  CURVATURE_ATTRIBUTE,
  type HelicalSpringOptions,
  mergeParts,
  paintGeometry,
  SPRING_PARAM_ATTRIBUTE,
} from '../../../engine/geometry/csgBuilder';
import {
  clampUv01 as clamp01,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';

// ============================================================================
// 1:1 DWM 1917 PARABELLUM-PISTOLE 1908 (LUGER P08) METRIC CAD CONSTANTS
// Scale: 1 world unit = 1 cm = 10 mm (+X muzzle, +Y up, +Z right flank)
// OAL = 22.20 cm (X in [-10.00, +12.20]), 4" Barrel = 10.20 cm (X in [+2.00, +12.20]),
// Bore Axis Y = +2.15 cm, Grip Angle = 55 deg from horizontal (-35 deg from vertical).
// ============================================================================

export const P08_BORE_Y = 2.15;
export const P08_GRIP_ANGLE_RAD = (-35 * Math.PI) / 180;
export const P08_GRIP_SPRING_ROT_Z = (55 * Math.PI) / 180;

/** Equal 2-bar toggle link length L1 = L2 = 4.62 cm (46.2 mm) */
export const P08_TOGGLE_LINK_LEN = 4.62;
/** Over-center lock angle below dead-center at battery: 1.5 deg */
export const P08_TOGGLE_OVERCENTER_RAD = (1.5 * Math.PI) / 180;
/** Front breechblock-to-toggle hinge pin X at battery (Y = P08_BORE_Y) */
export const P08_FRONT_PIN_X0 = -0.18;
/** Total horizontal span between P_rear and P_front at battery (~9.2368 cm) */
export const P08_TOGGLE_SPAN_D0 =
  2 * P08_TOGGLE_LINK_LEN * Math.cos(P08_TOGGLE_OVERCENTER_RAD);
/** Rear toggle axle X inside barrel-extension rear ears at battery (~-9.4168 cm) */
export const P08_REAR_AXLE_X0 = P08_FRONT_PIN_X0 - P08_TOGGLE_SPAN_D0;
/** Local knee-joint offset magnitude along X from either pin at battery (~4.6184 cm) */
export const P08_KNEE_LOCAL_DX =
  P08_TOGGLE_LINK_LEN * Math.cos(P08_TOGGLE_OVERCENTER_RAD);
/** Local knee-joint offset along Y from either pin at battery (~-0.1209 cm, below dead-center!) */
export const P08_KNEE_LOCAL_DY =
  -P08_TOGGLE_LINK_LEN * Math.sin(P08_TOGGLE_OVERCENTER_RAD);

// Authentic Imperial German DWM 1917 Rust-Blued, Straw-Tempered & Walnut Palette
// (Every hex color calibrated strictly above Khronos 0.018 linear luminance anti-crush floor)
export const P08_RUST_BLUE = '#394253';
export const P08_RUST_DEEP = '#2f3746';
export const P08_CHAMFER_BLUE = '#546278';
export const P08_BORE_DARK = '#252c38';
export const P08_STRAW_GOLD = '#cfa649';
export const P08_STRAW_WARM = '#bd9238';
export const P08_WHITE_STEEL = '#cbd5e1';
export const P08_MIRROR_STEEL = '#dde5ee';
export const P08_SPRING_STEEL = '#94a3b8';
export const P08_NICKEL_TUBE = '#c2cad4';
export const P08_ALLOY_KNOB = '#b6c0cc';
export const P08_WALNUT_HEART = '#6d4024';
export const P08_WALNUT_DARK = '#55311b';

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

function computeSignedVolumeRaw(pos: THREE.BufferAttribute): number {
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
 * Strips any zero-area CSG sliver triangles, enforces positive signed volume (`> 0`),
 * preserves `aCurvature` & `aSpringParam`, enforces unit-length normals (`|n| = 1`),
 * normalizes UVs into `[0, 1]`, and recomputes bounding volumes.
 */
export function sanitizeP08Mesh(
  geo: THREE.BufferGeometry,
  preserveCustomAtlasUVs = false
): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.getAttribute('position') as THREE.BufferAttribute;
  const norm = src.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const uv = src.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const col = src.getAttribute('color') as THREE.BufferAttribute | undefined;
  const curv = src.getAttribute(CURVATURE_ATTRIBUTE) as
    | THREE.BufferAttribute
    | undefined;
  const sp = src.getAttribute(SPRING_PARAM_ATTRIBUTE) as
    | THREE.BufferAttribute
    | undefined;
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

        cArr[di * 3] = col ? col.getX(si) : 0.42;
        cArr[di * 3 + 1] = col ? col.getY(si) : 0.46;
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.52;

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

  const outPos = out.getAttribute('position') as THREE.BufferAttribute;
  const outNorm = out.getAttribute('normal') as THREE.BufferAttribute;
  const nTotal = outPos.count;

  // Guarantee outward winding (`signedVolume > 0`)
  if (computeSignedVolumeRaw(outPos) < 0) {
    const outUvAttr = out.getAttribute('uv') as THREE.BufferAttribute;
    const outColAttr = out.getAttribute('color') as THREE.BufferAttribute;
    const outCurvAttr = out.getAttribute(CURVATURE_ATTRIBUTE) as
      | THREE.BufferAttribute
      | undefined;
    const outSpAttr = out.getAttribute(SPRING_PARAM_ATTRIBUTE) as
      | THREE.BufferAttribute
      | undefined;
    for (let i = 0; i + 2 < nTotal; i += 3) {
      const a = i + 1;
      const b = i + 2;
      for (const attr of [outPos, outNorm, outUvAttr, outColAttr]) {
        if (!attr) continue;
        for (let c = 0; c < attr.itemSize; c++) {
          const tmp = attr.array[a * attr.itemSize + c];
          (attr.array as Float32Array)[a * attr.itemSize + c] =
            attr.array[b * attr.itemSize + c];
          (attr.array as Float32Array)[b * attr.itemSize + c] = tmp;
        }
      }
      if (outCurvAttr) {
        const tmp = outCurvAttr.getX(a);
        outCurvAttr.setX(a, outCurvAttr.getX(b));
        outCurvAttr.setX(b, tmp);
      }
      if (outSpAttr) {
        for (let c = 0; c < 4; c++) {
          const tmp = outSpAttr.array[a * 4 + c];
          (outSpAttr.array as Float32Array)[a * 4 + c] =
            outSpAttr.array[b * 4 + c];
          (outSpAttr.array as Float32Array)[b * 4 + c] = tmp;
        }
      }
      for (let k = 0; k < 3; k++) {
        const vi = i + k;
        outNorm.setXYZ(
          vi,
          -outNorm.getX(vi),
          -outNorm.getY(vi),
          -outNorm.getZ(vi)
        );
      }
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

  const outUv = out.getAttribute('uv') as THREE.BufferAttribute;
  if (!preserveCustomAtlasUVs && out.boundingBox) {
    const bb = out.boundingBox;
    const sx = Math.max(1e-4, bb.max.x - bb.min.x);
    const sy = Math.max(1e-4, bb.max.y - bb.min.y);
    const sz = Math.max(1e-4, bb.max.z - bb.min.z);
    for (let i = 0; i < nTotal; i++) {
      const x01 = (outPos.getX(i) - bb.min.x) / sx;
      const y01 = (outPos.getY(i) - bb.min.y) / sy;
      const z01 = (outPos.getZ(i) - bb.min.z) / sz;
      const nx = Math.abs(outNorm.getX(i));
      const ny = Math.abs(outNorm.getY(i));
      const nz = Math.abs(outNorm.getZ(i));
      let uVal: number;
      let vVal: number;
      if (nz >= nx && nz >= ny) {
        uVal = 0.04 + x01 * 0.92;
        vVal = 0.04 + y01 * 0.92;
      } else if (ny >= nx) {
        uVal = 0.04 + x01 * 0.92;
        vVal = 0.04 + z01 * 0.92;
      } else {
        uVal = 0.04 + z01 * 0.92;
        vVal = 0.04 + y01 * 0.92;
      }
      outUv.setXY(i, clamp01(uVal), clamp01(vVal));
    }
  } else if (outUv) {
    for (let i = 0; i < nTotal; i++) {
      const uVal = outUv.getX(i);
      const vVal = outUv.getY(i);
      outUv.setXY(
        i,
        Number.isFinite(uVal) ? clamp01(uVal) : 0.5,
        Number.isFinite(vVal) ? clamp01(vVal) : 0.5
      );
    }
  }

  if (!out.getAttribute(CURVATURE_ATTRIBUTE)) {
    attachCurvatureAttribute(out);
  }

  return out;
}

// ============================================================================
// 1. WATERTIGHT CNC-DETAIL PRIMITIVES & CAPPED HELICAL SPRINGS
// ============================================================================

/**
 * Builds a strictly closed, watertight solid of revolution around `+X` from an `(r, x)` loop
 * (either solid axis-to-axis `[0, x0] -> ... -> [0, x1]` or closed hollow wall `[r0, x0] -> ... -> [r0, x0]`).
 * Shared seam trig table (`s % seg`) guarantees 0 open seam edges and skips zero-area pole slivers.
 */
export function revolveClosedAlongX(
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
      const ay = r0 * cosA[s];
      const az = r0 * sinA[s];
      const by = r0 * cosA[s + 1];
      const bz = r0 * sinA[s + 1];
      const cy = r1 * cosA[s + 1];
      const cz = r1 * sinA[s + 1];
      const dy = r1 * cosA[s];
      const dz = r1 * sinA[s];
      pushTri(x0, ay, az, x0, by, bz, x1, cy, cz);
      pushTri(x0, ay, az, x1, cy, cz, x1, dy, dz);
    }
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(new Float32Array(tris), 3);
  geo.setAttribute('position', posAttr);
  if (computeSignedVolumeRaw(posAttr) < 0) {
    for (let i = 0; i + 2 < posAttr.count; i += 3) {
      const bx = posAttr.getX(i + 1);
      const by = posAttr.getY(i + 1);
      const bz = posAttr.getZ(i + 1);
      posAttr.setXYZ(
        i + 1,
        posAttr.getX(i + 2),
        posAttr.getY(i + 2),
        posAttr.getZ(i + 2)
      );
      posAttr.setXYZ(i + 2, bx, by, bz);
    }
  }
  geo.computeVertexNormals();
  geo.setAttribute(
    'uv',
    new THREE.BufferAttribute(new Float32Array(posAttr.count * 2), 2)
  );
  return paintGeometry(geo, color);
}

/** Extrudes a `(Z, Y)` cross-section along `+X` from `x0` to `x0 + len`. */
export function extrudeAlongX(
  shape: THREE.Shape,
  x0: number,
  len: number,
  color: string,
  chamfer = 0,
  curveSegments = 10
): THREE.BufferGeometry {
  const c = Math.min(chamfer, len * 0.28);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: len - 2 * c,
    curveSegments,
    bevelEnabled: c > 0,
    bevelThickness: c,
    bevelSize: c,
    bevelOffset: -c,
    bevelSegments: 2,
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate(x0 + len - c, 0, 0);
  return paintGeometry(geo, color);
}

/** Extrudes an `(X, Y)` profile laterally along `+Z` from `z0` to `z0 + depth`. */
export function extrudeAlongZ(
  shape: THREE.Shape,
  z0: number,
  depth: number,
  color: string,
  chamfer = 0,
  curveSegments = 10
): THREE.BufferGeometry {
  const c = Math.min(chamfer, depth * 0.28);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * c,
    curveSegments,
    bevelEnabled: c > 0,
    bevelThickness: c,
    bevelSize: c,
    bevelOffset: -c,
    bevelSegments: 2,
  });
  geo.translate(0, 0, z0 + c);
  return paintGeometry(geo, color);
}

/** Merges non-overlapping boolean cutter solids into a single CSG brush. */
export function mergeCutters(
  cutters: THREE.BufferGeometry[],
  color = P08_BORE_DARK
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
 * Builds a helical X-axis spring via `createHelicalSpring` (`aSpringParam` `w = 1`) and
 * caps both open wire ends (`u = 0` and `u = 1`) with matching `aSpringParam` & `aCurvature = 0`
 * so the resulting coil mesh is 100% closed watertight (`0` open edges, `signedVolume > 0`).
 */
export function createWatertightHelicalSpring(
  opts: HelicalSpringOptions,
  color: string
): THREE.BufferGeometry {
  const raw = paintGeometry(createHelicalSpring(opts), color);
  const pos = raw.getAttribute('position') as THREE.BufferAttribute;
  const norm = raw.getAttribute('normal') as THREE.BufferAttribute;
  const uv = raw.getAttribute('uv') as THREE.BufferAttribute;
  const col = raw.getAttribute('color') as THREE.BufferAttribute;
  const sp = raw.getAttribute(SPRING_PARAM_ATTRIBUTE) as THREE.BufferAttribute;
  const vCount = pos.count;

  const qKey = (i: number) =>
    `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(
      pos.getZ(i) * 1e5
    )}`;

  const edgeMap = new Map<string, [number, number]>();
  const edgeCounts = new Map<string, number>();
  for (let t = 0; t + 2 < vCount; t += 3) {
    for (let e = 0; e < 3; e++) {
      const ia = t + e;
      const ib = t + ((e + 1) % 3);
      const ka = qKey(ia);
      const kb = qKey(ib);
      if (ka === kb) continue;
      const k = `${ka}|${kb}`;
      edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1);
      edgeMap.set(k, [ia, ib]);
    }
  }

  // Group unmatched boundary edges into the u=0 end ring and u=1 end ring via sp.getX(ia)
  const capGroups: { edges: Array<[number, number]> }[] = [
    { edges: [] },
    { edges: [] },
  ];
  edgeCounts.forEach((cnt, k) => {
    const [ka, kb] = k.split('|');
    if (cnt === 1 && (edgeCounts.get(`${kb}|${ka}`) ?? 0) === 0) {
      const pair = edgeMap.get(k)!;
      const uVal = sp.getX(pair[0]);
      capGroups[uVal < 0.5 ? 0 : 1].edges.push(pair);
    }
  });

  const extraTrisCount = capGroups[0].edges.length + capGroups[1].edges.length;
  if (extraTrisCount === 0) return raw;

  const totalV = vCount + extraTrisCount * 3;
  const pOut = new Float32Array(totalV * 3);
  const nOut = new Float32Array(totalV * 3);
  const uOut = new Float32Array(totalV * 2);
  const cOut = new Float32Array(totalV * 3);
  const spOut = new Float32Array(totalV * 4);

  pOut.set(pos.array as Float32Array);
  nOut.set(norm.array as Float32Array);
  uOut.set(uv.array as Float32Array);
  cOut.set(col.array as Float32Array);
  spOut.set(sp.array as Float32Array);

  let writeV = vCount;
  for (const grp of capGroups) {
    if (grp.edges.length === 0) continue;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const [ia] of grp.edges) {
      cx += pos.getX(ia);
      cy += pos.getY(ia);
      cz += pos.getZ(ia);
    }
    cx /= grp.edges.length;
    cy /= grp.edges.length;
    cz /= grp.edges.length;

    const refIdx = grp.edges[0][0];
    const spU = sp.getX(refIdx);
    const spCenter = sp.getY(refIdx);
    const spAnchor = sp.getZ(refIdx);
    const spMode = sp.getW(refIdx);
    const cr = col.getX(refIdx);
    const cg = col.getY(refIdx);
    const cb = col.getZ(refIdx);

    for (const [ia, ib] of grp.edges) {
      // Emit (ib, ia, center) so directed edge ib->ia cancels boundary edge ia->ib
      const ax = pos.getX(ib);
      const ay = pos.getY(ib);
      const az = pos.getZ(ib);
      const bx = pos.getX(ia);
      const by = pos.getY(ia);
      const bz = pos.getZ(ia);

      _e1.set(bx - ax, by - ay, bz - az);
      _e2.set(cx - ax, cy - ay, cz - az);
      _fn.crossVectors(_e1, _e2);
      const fl = _fn.length();
      if (fl > 1e-9) _fn.divideScalar(fl);
      else _fn.set(spU < 0.5 ? -1 : 1, 0, 0);

      const pts: ReadonlyArray<readonly [number, number, number]> = [
        [ax, ay, az],
        [bx, by, bz],
        [cx, cy, cz],
      ];
      for (let k = 0; k < 3; k++) {
        const vi = writeV++;
        pOut[vi * 3] = pts[k][0];
        pOut[vi * 3 + 1] = pts[k][1];
        pOut[vi * 3 + 2] = pts[k][2];
        nOut[vi * 3] = _fn.x;
        nOut[vi * 3 + 1] = _fn.y;
        nOut[vi * 3 + 2] = _fn.z;
        uOut[vi * 2] = 0.5;
        uOut[vi * 2 + 1] = 0.5;
        cOut[vi * 3] = cr;
        cOut[vi * 3 + 1] = cg;
        cOut[vi * 3 + 2] = cb;
        spOut[vi * 4] = spU;
        spOut[vi * 4 + 1] = spCenter;
        spOut[vi * 4 + 2] = spAnchor;
        spOut[vi * 4 + 3] = spMode;
      }
    }
  }

  const capped = new THREE.BufferGeometry();
  capped.setAttribute('position', new THREE.BufferAttribute(pOut, 3));
  capped.setAttribute('normal', new THREE.BufferAttribute(nOut, 3));
  capped.setAttribute('uv', new THREE.BufferAttribute(uOut, 2));
  capped.setAttribute('color', new THREE.BufferAttribute(cOut, 3));
  capped.setAttribute(
    SPRING_PARAM_ATTRIBUTE,
    new THREE.BufferAttribute(spOut, 4)
  );
  capped.setAttribute(
    CURVATURE_ATTRIBUTE,
    new THREE.BufferAttribute(new Float32Array(totalV), 1)
  );
  raw.dispose();
  capped.computeBoundingBox();
  capped.computeBoundingSphere();
  return capped;
}

// ============================================================================
// 2. PRECISION 2K UV ATLAS UNWRAPPERS (`p08_blued_*` & `p08_walnut_*`)
// ============================================================================

/** Unwraps `p08_barrel` onto `p08_blued_*` top barrel band (`u in [0.06, 0.95], v in [0.75, 0.96]`). */
export function applyP08BarrelUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const xNorm = clamp01((pos.getX(i) - 1.65) / 10.55);
    const yNorm = clamp01((pos.getY(i) - 1.2) / 2.15);
    uvs[i * 2] = clamp01(0.06 + xNorm * 0.89);
    uvs[i * 2 + 1] = clamp01(0.75 + yNorm * 0.21);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps `p08_barrel_extension` onto `p08_blued_*`:
 *  - Top chamber bridge (`X > 1.3 && fny > 0.45`): `u in [0.10, 0.34], v in [0.76, 0.96]` ("1917" date!)
 *  - Right/left forked flanks: `u in [0.46, 0.74], v in [0.50, 0.72]` (Imperial Crowned Eagle proofs!)
 */
export function applyP08ExtensionUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx, fny } = triInfo(pos, col, i, i + 1, i + 2);
    const isChamberCrown = cx > 1.35 && fny > 0.5;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      if (isChamberCrown) {
        const z01 = clamp01((z + 0.95) / 1.9);
        const x01 = clamp01((x - 1.4) / 2.15);
        uvs[vi * 2] = clamp01(0.11 + z01 * 0.22);
        uvs[vi * 2 + 1] = clamp01(0.77 + x01 * 0.18);
      } else {
        const x01 = clamp01((x + 9.95) / 13.5);
        const y01 = clamp01((y - 0.88) / 2.25);
        uvs[vi * 2] = clamp01(0.46 + x01 * 0.28);
        uvs[vi * 2 + 1] = clamp01(0.5 + y01 * 0.215);
      }
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/** Unwraps `p08_extractor` onto `p08_blued_*` `GELADEN` region (`u in [0.34, 0.58], v in [0.76, 0.95]`). */
export function applyP08ExtractorUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x01 = clamp01((pos.getX(i) + 1.05) / 2.15);
    const y01 = clamp01((pos.getY(i) + 0.16) / 0.38);
    uvs[i * 2] = clamp01(0.34 + x01 * 0.24);
    uvs[i * 2 + 1] = clamp01(0.76 + y01 * 0.19);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/** Unwraps `p08_front_toggle` onto `p08_blued_*` `DWM` scroll cipher deck (`u in [0.07, 0.42], v in [0.51, 0.71]`). */
export function applyP08FrontToggleUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x01 = clamp01((pos.getX(i) + 5.1) / 5.56);
    const z01 = clamp01((pos.getZ(i) + 0.56) / 1.12);
    uvs[i * 2] = clamp01(0.07 + x01 * 0.35);
    uvs[i * 2 + 1] = clamp01(0.51 + z01 * 0.2);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps `p08_rear_toggle` onto `p08_blued_*`:
 *  - Outer circular toggle ears (`|z| > 0.68`): `u in [0.76, 0.96], v in [0.50, 0.72]` (24-LPI diamond knurl!)
 *  - Central toggle bridge & sight: `u in [0.48, 0.73], v in [0.51, 0.70]`
 */
export function applyP08RearToggleUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz } = triInfo(pos, col, i, i + 1, i + 2);
    const isKnurlEar = Math.abs(cz) > 0.66;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      if (isKnurlEar) {
        const dx = clamp01((x - 2.38) / 1.84);
        const dy = clamp01((y + 0.64) / 1.84);
        uvs[vi * 2] = clamp01(0.76 + dx * 0.2);
        uvs[vi * 2 + 1] = clamp01(0.5 + dy * 0.22);
      } else {
        const x01 = clamp01((x + 0.55) / 5.65);
        const y01 = clamp01((y + 0.62) / 1.78);
        uvs[vi * 2] = clamp01(0.48 + x01 * 0.25);
        uvs[vi * 2 + 1] = clamp01(0.51 + y01 * 0.19);
      }
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/** Unwraps `p08_frame` onto `p08_blued_*` frame band (`u in [0.06, 0.62], v in [0.25, 0.46]`). */
export function applyP08FrameUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x01 = clamp01((pos.getX(i) + 10.0) / 13.1);
    const y01 = clamp01((pos.getY(i) + 9.55) / 12.15);
    uvs[i * 2] = clamp01(0.06 + x01 * 0.56);
    uvs[i * 2 + 1] = clamp01(0.255 + y01 * 0.205);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/** Unwraps `p08_sideplate` onto `p08_blued_*` sideplate island (`u in [0.67, 0.95], v in [0.26, 0.45]`). */
export function applyP08SideplateUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x01 = clamp01((pos.getX(i) + 1.45) / 2.9);
    const y01 = clamp01((pos.getY(i) + 0.68) / 1.36);
    uvs[i * 2] = clamp01(0.67 + x01 * 0.28);
    uvs[i * 2 + 1] = clamp01(0.26 + y01 * 0.19);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Straw-Tempered (`Gelbangelassen`) parts onto `p08_blued_*` bottom band (`v in [0.03, 0.21]`):
 *  - `'trigger'`: `u in [0.05, 0.33]`
 *  - `'lever'`:   `u in [0.36, 0.64]` (serrated takedown lever & thumb safety!)
 *  - `'ejector'`: `u in [0.68, 0.95]`
 */
export function applyP08StrawPartUVs(
  geo: THREE.BufferGeometry,
  zone: 'trigger' | 'lever' | 'ejector'
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const sx = Math.max(1e-4, bb.max.x - bb.min.x);
  const sy = Math.max(1e-4, bb.max.y - bb.min.y);
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  const [u0, uSpan] =
    zone === 'trigger'
      ? [0.05, 0.28]
      : zone === 'lever'
        ? [0.36, 0.28]
        : [0.68, 0.27];
  for (let i = 0; i < count; i++) {
    const x01 = (pos.getX(i) - bb.min.x) / sx;
    const y01 = (pos.getY(i) - bb.min.y) / sy;
    uvs[i * 2] = clamp01(u0 + x01 * uSpan);
    uvs[i * 2 + 1] = clamp01(0.03 + y01 * 0.18);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/** Unwraps `p08_grip_left` / `p08_grip_right` onto `p08_walnut_*` 20-LPI European walnut islands. */
export function applyP08WalnutGripUVs(
  geo: THREE.BufferGeometry,
  side: 'left' | 'right'
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  const uBase = side === 'left' ? 0.045 : 0.385;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const yNorm = clamp01((y + 4.65) / 9.3);
    // Track 55 deg Luger grip spine so checkering runs parallel to frontstrap/backstrap
    const spineCenterX = -2.55 + yNorm * 5.1;
    const across = clamp01((x - spineCenterX + 1.48) / 2.96);
    const uLocal = side === 'left' ? 1.0 - across : across;
    uvs[i * 2] = clamp01(uBase + uLocal * 0.3);
    uvs[i * 2 + 1] = clamp01(0.05 + yNorm * 0.9);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/** Unwraps `p08_mag_body` onto `p08_walnut_*` brushed-nickel sheet-steel island (`u in [0.73, 0.97], v in [0.37, 0.95]`). */
export function applyP08MagTubeUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x01 = clamp01((pos.getX(i) + 1.28) / 2.56);
    const y01 = clamp01((pos.getY(i) + 5.65) / 11.3);
    uvs[i * 2] = clamp01(0.73 + x01 * 0.24);
    uvs[i * 2 + 1] = clamp01(0.37 + y01 * 0.58);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/** Unwraps `p08_mag_base` onto `p08_walnut_*` concentric-grooved alloy pull-knob island (`u in [0.73, 0.97], v in [0.04, 0.32]`). */
export function applyP08MagKnobUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const sx = Math.max(1e-4, bb.max.x - bb.min.x);
  const sy = Math.max(1e-4, bb.max.y - bb.min.y);
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x01 = (pos.getX(i) - bb.min.x) / sx;
    const y01 = (pos.getY(i) - bb.min.y) / sy;
    uvs[i * 2] = clamp01(0.73 + x01 * 0.24);
    uvs[i * 2 + 1] = clamp01(0.04 + y01 * 0.28);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 3. SLIDE / TOGGLE-LOCK TRAIN ('slide' · 9 parts: U-01..U-09)
// ============================================================================

/**
 * U-01: 4-Inch (`10.20 cm`) Tapered Rifled `9x19mm` Parabellum Barrel w/ Dovetailed Barleycorn Front Sight
 * (`assembledPos: [0, 0, 0]`, recoils `-0.65 cm` in short-recoil locked with `p08_barrel_extension`!).
 * Breech face at `X = +2.00 cm`, recessed muzzle crown at `X = +12.20 cm` (exact 102.0 mm barrel!).
 */
export function buildP08BarrelGeometry(): THREE.BufferGeometry {
  // 1. Classic DWM tapered barrel contour w/ rear threaded shank, witness ring & front sight band
  const barrelBlank = revolveClosedAlongX(
    [
      [0.0, 1.72],
      [0.74, 1.72], // Threaded shank rear face inside chamber ring
      [0.78, 1.78],
      [0.78, 3.35], // Threaded shoulder inside barrel extension
      [0.88, 3.42], // Stepped DWM barrel witness collar
      [0.88, 3.82],
      [0.74, 4.15], // Graceful Parabellum taper transition
      [0.66, 6.2],
      [0.59, 11.25], // Slender 4" pencil contour
      [0.67, 11.35], // Integral front-sight band (Kornsattel)
      [0.67, 12.14],
      [0.61, 12.2], // Muzzle crown outer chamfer (exact X_max = +12.20 cm!)
      [0.0, 12.2],
    ],
    36,
    P08_RUST_BLUE
  );
  barrelBlank.translate(0, P08_BORE_Y, 0);

  // 2. Dovetailed front sight base & classic triangular barleycorn blade (Dachkorn)
  const sightBase = createChamferedBox(0.76, 0.34, 0.52, 0.03, P08_RUST_BLUE);
  sightBase.translate(11.72, P08_BORE_Y + 0.72, 0);

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.34, 0.0);
  bladeShape.lineTo(0.32, 0.0);
  bladeShape.lineTo(0.18, 0.32); // Sight tip at Y = 2.15 + 0.85 + 0.32 = 3.32 cm
  bladeShape.lineTo(-0.28, 0.12);
  bladeShape.closePath();
  const sightBlade = extrudeAlongZ(
    bladeShape,
    -0.11,
    0.22,
    P08_RUST_DEEP,
    0.015,
    6
  );
  sightBlade.translate(11.72, P08_BORE_Y + 0.85, 0);

  // 3. Subtract 6-groove 1:250mm right-hand 9x19mm rifled bore, 19.15mm tapered chamber & feed ramp
  const rifledBore = createRifledBarrelBoreCutter(
    10.8,
    0.44,
    0.016,
    6,
    10.2 / 25.0
  );
  rifledBore.translate(7.05, P08_BORE_Y, 0);

  const chamberAndRampCutters = mergeCutters([
    // 9x19mm Parabellum tapered chamber (X in [1.65, 3.92], r = 0.498)
    new THREE.CylinderGeometry(0.47, 0.5, 2.32, 28)
      .rotateZ(Math.PI / 2)
      .translate(2.8, P08_BORE_Y, 0),
    // Polished lower cartridge feed throat (Zufuehrrampe) at breech mouth
    new THREE.BoxGeometry(0.56, 0.42, 0.56)
      .rotateZ(0.46)
      .translate(1.92, P08_BORE_Y - 0.42, 0),
    // Top extractor claw clearance cut at 12 o'clock on breech face
    new THREE.BoxGeometry(0.42, 0.28, 0.26).translate(
      1.92,
      P08_BORE_Y + 0.52,
      0
    ),
    // Recessed muzzle target dish
    new THREE.CylinderGeometry(0.52, 0.44, 0.14, 28)
      .rotateZ(Math.PI / 2)
      .translate(12.18, P08_BORE_Y, 0),
  ]);

  const finishedBarrel = csgSubtract(
    csgUnion([barrelBlank, sightBase, sightBlade]),
    [rifledBore, chamberAndRampCutters]
  );

  return sanitizeP08Mesh(applyP08BarrelUVs(finishedBarrel), true);
}

/**
 * U-02: Forked U-Channel Barrel Extension (`Gabelgehaeuse`, `isShell: true`, `assembledPos: [0, 0, 0]`)
 * Threads onto `p08_barrel` at the front `"1917"` chamber ring and carries the sliding `p08_breechblock`
 * and rear toggle axle bearings (`X = P08_REAR_AXLE_X0 = -9.4168, Y = 2.15`). Recoils `-0.65 cm`!
 */
export function buildP08BarrelExtensionGeometry(): THREE.BufferGeometry {
  // 1. Side silhouette of forked upper receiver w/ circular rear toggle axle ears
  const extSide = new THREE.Shape();
  extSide.moveTo(3.48, 1.28); // Lower front chamber ring chin
  extSide.lineTo(3.48, 3.08); // Chamber ring top ("1917" crown)
  extSide.lineTo(1.55, 3.08);
  extSide.lineTo(1.25, 2.82); // Step down to forked breechblock rails
  extSide.lineTo(-8.82, 2.82);
  extSide.quadraticCurveTo(-9.94, 2.82, -9.94, 2.15); // Rear circular toggle axle bearing ear
  extSide.quadraticCurveTo(-9.94, 1.38, -9.15, 1.38);
  extSide.lineTo(-1.85, 1.38);
  extSide.lineTo(-1.45, 1.02); // Lower frame guide rail step
  extSide.lineTo(2.45, 1.02);
  extSide.lineTo(2.85, 1.28);
  extSide.closePath();

  const rawBlock = extrudeAlongZ(
    extSide,
    -1.02,
    2.04,
    P08_RUST_BLUE,
    0.04,
    12
  );

  // Left-flank external sear-bar boss housing `p08_sear_bar`
  const searHousing = createChamferedBox(4.55, 0.56, 0.32, 0.03, P08_RUST_BLUE);
  searHousing.translate(-1.85, 2.08, -1.04);

  // Lower recoil-lug / takedown-cam foot beneath chamber ring
  const recoilFoot = createChamferedBox(1.55, 0.44, 0.72, 0.03, P08_RUST_DEEP);
  recoilFoot.translate(2.15, 1.04, 0);

  // 2. Subtract open top U-channel raceway (`Z in [-0.62, +0.62], X in [-10.1, +1.68]`),
  //    front barrel thread bore, rear toggle axle holes, ejector slot & sear plunger window!
  const extCutters = mergeCutters([
    // Main open-top U-channel fork for breechblock & buckling toggle train
    new THREE.BoxGeometry(11.82, 1.95, 1.26).translate(-4.22, 2.42, 0),
    // Lower magazine feed-lip clearance through floor of fork
    new THREE.BoxGeometry(3.85, 0.85, 1.12).translate(-0.75, 1.22, 0),
    // Front chamber ring bore accommodating `p08_barrel` threaded shank (r = 0.79)
    new THREE.CylinderGeometry(0.79, 0.79, 2.2, 28)
      .rotateZ(Math.PI / 2)
      .translate(2.58, P08_BORE_Y, 0),
    // Coaxial rear toggle cross-axle bearing bores at (P08_REAR_AXLE_X0, P08_BORE_Y)
    new THREE.CylinderGeometry(0.24, 0.24, 2.4, 20)
      .rotateX(Math.PI / 2)
      .translate(P08_REAR_AXLE_X0, P08_BORE_Y, 0),
    // Left-flank longitudinal sear-bar milled groove
    new THREE.BoxGeometry(4.48, 0.34, 0.28).translate(-1.85, 2.08, -1.08),
    // Right-flank ejector mortise slot
    new THREE.BoxGeometry(3.15, 0.32, 0.26).translate(-1.15, 2.02, 0.74),
  ]);

  const milledExt = csgSubtract(
    csgUnion([rawBlock, searHousing, recoilFoot]),
    [extCutters]
  );

  return sanitizeP08Mesh(applyP08ExtensionUVs(milledExt), true);
}

/**
 * U-03: Rectangular Sliding Breechblock (`Verschlussstueck`, `assembledPos: [0, 0, 0]`)
 * Slides axially inside `p08_barrel_extension` (`-4.20 cm` stroke!), housing `p08_striker`,
 * `p08_striker_spring`, and `p08_extractor`, and pinned at `(P08_FRONT_PIN_X0, P08_BORE_Y)`
 * to `p08_front_toggle`!
 */
export function buildP08BreechblockGeometry(): THREE.BufferGeometry {
  const mainBody = createChamferedBox(2.68, 1.22, 1.16, 0.045, P08_RUST_DEEP);
  mainBody.translate(0.66, P08_BORE_Y, 0);

  // Lower cartridge-stripping center rib (Zufuehrleiste)
  const stripRib = createChamferedBox(2.15, 0.26, 0.42, 0.025, P08_MIRROR_STEEL);
  stripRib.translate(0.88, P08_BORE_Y - 0.66, 0);

  // Integral front toggle cross-pin journals at (P08_FRONT_PIN_X0, P08_BORE_Y)
  const frontPinBoss = revolveClosedAlongX(
    [
      [0.0, -0.58],
      [0.16, -0.58],
      [0.16, 0.58],
      [0.0, 0.58],
    ],
    18,
    P08_WHITE_STEEL
  );
  frontPinBoss.rotateY(Math.PI / 2);
  frontPinBoss.translate(P08_FRONT_PIN_X0, P08_BORE_Y, 0);

  const breechCutters = mergeCutters([
    // Rear clevis slot receiving front tongue of `p08_front_toggle`
    new THREE.BoxGeometry(1.05, 0.92, 0.56).translate(-0.22, P08_BORE_Y, 0),
    // Top center longitudinal slot for `p08_extractor`
    new THREE.BoxGeometry(2.28, 0.36, 0.36).translate(
      0.92,
      P08_BORE_Y + 0.52,
      0
    ),
    // Internal cylindrical striker & striker-spring bore (X in [-0.62, +1.82])
    new THREE.CylinderGeometry(0.25, 0.25, 2.48, 20)
      .rotateZ(Math.PI / 2)
      .translate(0.58, P08_BORE_Y, 0),
    // Firing-pin needle hole & recessed 9x19mm breech face (Stossboden) at X = +2.00
    new THREE.CylinderGeometry(0.09, 0.09, 0.45, 14)
      .rotateZ(Math.PI / 2)
      .translate(1.88, P08_BORE_Y, 0),
    new THREE.CylinderGeometry(0.51, 0.51, 0.12, 24)
      .rotateZ(Math.PI / 2)
      .translate(1.98, P08_BORE_Y, 0),
    // Right-flank ejector clearance groove & left-flank striker-sear window
    new THREE.BoxGeometry(2.75, 0.24, 0.22).translate(
      0.66,
      P08_BORE_Y - 0.12,
      0.52
    ),
    new THREE.BoxGeometry(1.35, 0.26, 0.28).translate(
      0.22,
      P08_BORE_Y - 0.06,
      -0.48
    ),
  ]);

  const milledBreech = csgSubtract(csgUnion([mainBody, stripRib]), [
    breechCutters,
  ]);
  return sanitizeP08Mesh(mergeParts([milledBreech, frontPinBoss]));
}

/**
 * U-04: Top-Pivoting Extractor & `"GELADEN"` Loaded-Chamber Indicator (`Auszieher`)
 * (`assembledPos: [0.95, 2.72, 0]`).
 * Pops upward slightly when a cartridge rim is seated on the breech face, exposing `"GELADEN"`!
 */
export function buildP08ExtractorGeometry(): THREE.BufferGeometry {
  const extShape = new THREE.Shape();
  extShape.moveTo(-1.02, -0.1); // Rear spring tail
  extShape.lineTo(1.06, -0.1);
  extShape.lineTo(1.08, -0.24); // Sharp front extractor rim claw!
  extShape.lineTo(0.92, -0.24);
  extShape.lineTo(0.84, -0.06);
  extShape.lineTo(1.04, 0.08);
  extShape.lineTo(0.38, 0.18); // Raised tactile "GELADEN" indicator step!
  extShape.lineTo(-0.35, 0.18);
  extShape.lineTo(-0.52, 0.06);
  extShape.lineTo(-1.02, 0.04);
  extShape.closePath();

  const bar = extrudeAlongZ(extShape, -0.15, 0.3, P08_RUST_BLUE, 0.018, 6);
  const pivotPin = revolveClosedAlongX(
    [
      [0.0, -0.2],
      [0.065, -0.2],
      [0.065, 0.2],
      [0.0, 0.2],
    ],
    14,
    P08_WHITE_STEEL
  );
  pivotPin.rotateY(Math.PI / 2);
  pivotPin.translate(-0.12, -0.04, 0);

  return sanitizeP08Mesh(
    applyP08ExtractorUVs(mergeParts([bar, pivotPin])),
    true
  );
}

/**
 * U-05: Articulated Front Toggle Link (`Vordergelenk`, `assembledPos: [P08_FRONT_PIN_X0, P08_BORE_Y, 0]`)
 * Local `(0, 0, 0)` is the Front Breechblock Pin; rear knee-joint knuckle sits at exact
 * `(-P08_KNEE_LOCAL_DX, P08_KNEE_LOCAL_DY, 0) = (-4.6184, -0.1209, 0)`!
 * Top flat deck carries the engraved `"DWM"` scroll monogram; underside toe cocks `p08_striker`!
 */
export function buildP08FrontToggleGeometry(): THREE.BufferGeometry {
  const kx = -P08_KNEE_LOCAL_DX;
  const ky = P08_KNEE_LOCAL_DY;

  // Sculpted side profile from front tongue (0, 0) to knee knuckle (kx, ky)
  const linkShape = new THREE.Shape();
  linkShape.moveTo(0.42, -0.32); // Front striker-cocking cam toe (Spannnase)
  linkShape.lineTo(0.44, 0.28);
  linkShape.quadraticCurveTo(0.22, 0.56, -0.28, 0.58); // DWM top deck front shoulder
  linkShape.lineTo(kx + 0.48, 0.58); // Flat top deck engraved with "DWM"
  linkShape.quadraticCurveTo(kx - 0.52, 0.54, kx - 0.52, ky);
  linkShape.quadraticCurveTo(kx - 0.52, ky - 0.48, kx + 0.35, ky - 0.46);
  linkShape.lineTo(-0.55, -0.36);
  linkShape.lineTo(-0.18, -0.52); // Cocking cam lobe underneath!
  linkShape.closePath();

  const rawBody = extrudeAlongZ(
    linkShape,
    -0.54,
    1.08,
    P08_RUST_BLUE,
    0.032,
    10
  );

  // Trim front tongue narrower (`Z in [-0.26, +0.26]`) to nest inside `p08_breechblock` rear fork,
  // and slot rear knee fork (`Z in [-0.24, +0.24]`) to interleave with `p08_rear_toggle` center tongue!
  const toggleCutters = mergeCutters([
    new THREE.BoxGeometry(1.15, 1.3, 0.34).translate(0.05, 0.0, 0.44),
    new THREE.BoxGeometry(1.15, 1.3, 0.34).translate(0.05, 0.0, -0.44),
    new THREE.BoxGeometry(1.25, 1.3, 0.5).translate(kx - 0.05, ky, 0),
    // Front pin bore at (0, 0) & Knee-joint pin bore at (kx, ky)
    new THREE.CylinderGeometry(0.165, 0.165, 1.4, 18).rotateX(Math.PI / 2),
    new THREE.CylinderGeometry(0.21, 0.21, 1.4, 20)
      .rotateX(Math.PI / 2)
      .translate(kx, ky, 0),
  ]);

  const milledLink = csgSubtract(rawBody, [toggleCutters]);
  return sanitizeP08Mesh(applyP08FrontToggleUVs(milledLink), true);
}

/**
 * U-06: Articulated Rear Toggle Link (`Hintergelenk`, `assembledPos: [P08_REAR_AXLE_X0, P08_BORE_Y, 0]`)
 * Local `(0, 0, 0)` is the Rear Toggle Axle; front knee-joint tongue sits at exact
 * `(+P08_KNEE_LOCAL_DX, P08_KNEE_LOCAL_DY, 0) = (+4.6184, -0.1209, 0)`!
 * Features the world-famous **twin circular diamond-knurled toggle gripping drums (`Spannstuecke`)**,
 * integral V-notch rear sight (`Kimme`), rear frame-ramp cam rollers, and S-link hook!
 */
export function buildP08RearToggleGeometry(): THREE.BufferGeometry {
  const kx = P08_KNEE_LOCAL_DX;
  const ky = P08_KNEE_LOCAL_DY;

  const rearShape = new THREE.Shape();
  rearShape.moveTo(-0.5, -0.44); // Rear cam roller & S-link hook heel!
  rearShape.quadraticCurveTo(-0.54, 0.52, -0.05, 0.72);
  rearShape.lineTo(0.22, 1.06); // Integral V-notch rear sight bridge!
  rearShape.lineTo(0.58, 1.06);
  rearShape.lineTo(0.88, 0.62);
  rearShape.lineTo(kx - 0.45, 0.56);
  rearShape.quadraticCurveTo(kx + 0.48, 0.52, kx + 0.48, ky);
  rearShape.quadraticCurveTo(kx + 0.48, ky - 0.46, kx - 0.35, ky - 0.44);
  rearShape.lineTo(0.35, -0.42);
  rearShape.lineTo(-0.12, -0.58); // Lower S-coupling link hook lug
  rearShape.closePath();

  const bridgeBody = extrudeAlongZ(
    rearShape,
    -0.56,
    1.12,
    P08_RUST_BLUE,
    0.032,
    10
  );

  // Iconic twin circular knurled toggle gripping drums (Spannstuecke) at X_local = +3.30, Y_local = +0.26
  const leftDrum = revolveClosedAlongX(
    [
      [0.0, -1.48],
      [0.78, -1.48],
      [0.86, -1.38],
      [0.86, -0.68],
      [0.64, -0.52],
      [0.0, -0.52],
    ],
    28,
    P08_RUST_DEEP
  );
  leftDrum.rotateY(Math.PI / 2); // Revolve axis -> Z!
  leftDrum.translate(3.3, 0.26, 0);

  const rightDrum = revolveClosedAlongX(
    [
      [0.0, 0.52],
      [0.64, 0.52],
      [0.86, 0.68],
      [0.86, 1.38],
      [0.78, 1.48],
      [0.0, 1.48],
    ],
    28,
    P08_RUST_DEEP
  );
  rightDrum.rotateY(Math.PI / 2);
  rightDrum.translate(3.3, 0.26, 0);

  const rearCutters = mergeCutters([
    // Trim front tongue (`Z in [-0.23, +0.23]`) to interleave cleanly inside `p08_front_toggle` clevis!
    new THREE.BoxGeometry(1.3, 1.3, 0.42).translate(kx + 0.02, ky, 0.45),
    new THREE.BoxGeometry(1.3, 1.3, 0.42).translate(kx + 0.02, ky, -0.45),
    // Classic crisp V-notch sight cut on top of rear sight bridge
    new THREE.BoxGeometry(0.65, 0.28, 0.28)
      .rotateX(Math.PI / 4)
      .translate(0.4, 1.12, 0),
    // Concave finger-dish scoops on outer faces of both circular toggle ears!
    new THREE.CylinderGeometry(0.56, 0.48, 0.18, 24)
      .rotateX(Math.PI / 2)
      .translate(3.3, 0.26, -1.46),
    new THREE.CylinderGeometry(0.48, 0.56, 0.18, 24)
      .rotateX(Math.PI / 2)
      .translate(3.3, 0.26, 1.46),
    // Rear axle bore (0, 0) & Front knee-joint bore (kx, ky)
    new THREE.CylinderGeometry(0.24, 0.24, 1.5, 20).rotateX(Math.PI / 2),
    new THREE.CylinderGeometry(0.21, 0.21, 1.5, 20)
      .rotateX(Math.PI / 2)
      .translate(kx, ky, 0),
  ]);

  const unitedToggle = csgSubtract(
    csgUnion([bridgeBody, leftDrum, rightDrum]),
    [rearCutters]
  );

  // Add 16 crisp 3D peripheral gripping ribs around both circular toggle drums
  const ribs: THREE.BufferGeometry[] = [unitedToggle];
  for (let r = 0; r < 16; r++) {
    const ang = (r / 16) * Math.PI * 2;
    const rx = 3.3 + Math.cos(ang) * 0.855;
    const ry = 0.26 + Math.sin(ang) * 0.855;
    for (const zCenter of [-1.04, 1.04]) {
      const rib = createChamferedBox(
        0.065,
        0.065,
        0.64,
        0.012,
        P08_CHAMFER_BLUE
      );
      rib.rotateZ(ang);
      rib.translate(rx, ry, zCenter);
      ribs.push(rib);
    }
  }

  return sanitizeP08Mesh(applyP08RearToggleUVs(mergeParts(ribs)), true);
}

/**
 * U-07: Knee-Joint Center Hinge Pin & Rear Toggle Cross-Axle Pin (`Gelenkbolzen-Satz`)
 * (`assembledPos: [P08_REAR_AXLE_X0, P08_BORE_Y, 0]`).
 * Shares the exact rigid-body transform of `p08_rear_toggle`, keeping the Rear Cross-Axle Pin `(0, 0, 0)`
 * coaxial with `p08_barrel_extension` and the Knee-Joint Pin `(+4.6184, -0.1209, 0)` coaxial with
 * both toggle links across 100% of `f in [0, 1]`!
 */
export function buildP08TogglePinsGeometry(): THREE.BufferGeometry {
  const kx = P08_KNEE_LOCAL_DX;
  const ky = P08_KNEE_LOCAL_DY;

  // 1. Stepped T-head Rear Toggle Cross-Axle Pin (Hintergelenkbolzen) at (0, 0, 0)
  const rearAxlePin = revolveClosedAlongX(
    [
      [0.0, -1.08],
      [0.32, -1.08], // Stepped left knurled cap flange
      [0.32, -0.96],
      [0.235, -0.95],
      [0.235, 1.02],
      [0.19, 1.06],
      [0.0, 1.06],
    ],
    24,
    P08_WHITE_STEEL
  );
  rearAxlePin.rotateY(Math.PI / 2);

  // 2. Stepped Flanged Knee-Joint Center Hinge Pin (Mittelgelenkbolzen) at (kx, ky, 0)
  const kneeCenterPin = revolveClosedAlongX(
    [
      [0.08, -0.62], // Hollow oil-relief center pin
      [0.28, -0.62],
      [0.28, -0.53],
      [0.205, -0.52],
      [0.205, 0.56],
      [0.175, 0.59],
      [0.08, 0.59],
      [0.08, -0.62],
    ],
    24,
    P08_MIRROR_STEEL
  );
  kneeCenterPin.rotateY(Math.PI / 2);
  kneeCenterPin.translate(kx, ky, 0);

  return sanitizeP08Mesh(mergeParts([rearAxlePin, kneeCenterPin]));
}

/**
 * U-08: Fluted Internal Cylindrical Firing Striker (`Schlagbolzen`, `assembledPos: [0.35, P08_BORE_Y, 0]`)
 * Iconic DWM gas-fluted hollow steel striker w/ tapered firing needle & left sear lug (`Rastnase`).
 */
export function buildP08StrikerGeometry(): THREE.BufferGeometry {
  const strikerTube = revolveClosedAlongX(
    [
      [0.145, -0.92], // Hollow rear skirt receiving `p08_striker_spring`
      [0.225, -0.92],
      [0.225, 0.68], // Main cylindrical guide body
      [0.16, 0.82],
      [0.072, 1.38], // Tapered firing-pin cone
      [0.052, 1.6], // Hemispherical primer-striking tip (X_world = +1.95 -> darts to +2.15!)
      [0.0, 1.62],
      [0.0, 0.55],
      [0.145, 0.48],
      [0.145, -0.92],
    ],
    24,
    P08_WHITE_STEEL
  );

  // Carve 3 signature DWM longitudinal primer-rupture gas relief flutes!
  const fluteCutters: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3 + 0.35;
    fluteCutters.push(
      new THREE.BoxGeometry(1.28, 0.085, 0.085)
        .rotateX(a)
        .translate(-0.08, Math.cos(a) * 0.21, Math.sin(a) * 0.21)
    );
  }
  const flutedBody = csgSubtract(strikerTube, [mergeCutters(fluteCutters)]);

  // Projecting left-flank sear & cocking lug (`Rastnase`)
  const searLug = createChamferedBox(0.36, 0.22, 0.24, 0.025, P08_MIRROR_STEEL);
  searLug.translate(-0.22, -0.05, -0.28);

  return sanitizeP08Mesh(mergeParts([flutedBody, searLug]));
}

/**
 * U-09: Helical Striker Mainspring & Bayonet Guide Retainer (`Schlagbolzenfeder`)
 * (`assembledPos: [-0.58, P08_BORE_Y, 0]`).
 * Built along local `axis: 'x'` (`start: 0.06, end: 1.48`, `w = 1` `SPRING_AXIS_MODE_X`) with
 * rear bayonet retainer anchored at local `x = 0`!
 */
export function buildP08StrikerSpringGeometry(): THREE.BufferGeometry {
  const springCoils = createWatertightHelicalSpring(
    {
      axis: 'x',
      start: 0.06,
      end: 1.48,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.132,
      wireRadius: 0.025,
      coils: 11,
      radialSegments: 10,
      tubularSegmentsPerCoil: 16,
    },
    P08_SPRING_STEEL
  );

  // Bayonet-locked rear striker spring guide & retainer plug anchored near local x = 0
  const rearGuide = revolveClosedAlongX(
    [
      [0.0, -0.08],
      [0.22, -0.08],
      [0.22, 0.04],
      [0.088, 0.05],
      [0.088, 0.72],
      [0.0, 0.74],
    ],
    18,
    P08_WHITE_STEEL
  );

  return sanitizeP08Mesh(mergeParts([springCoils, rearGuide]));
}
