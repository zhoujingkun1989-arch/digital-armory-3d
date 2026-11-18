import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  attachCurvatureAttribute,
} from '../../../engine/geometry/curvatureBuilder';
import {
  createChamferedBox,
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  CURVATURE_ATTRIBUTE,
  mergeParts,
  paintGeometry,
  SPRING_PARAM_ATTRIBUTE,
} from '../../../engine/geometry/csgBuilder';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';

// Authentic 1955 Hartford Colt Python Royal Blue, Walnut & Ordnance Steel Palette
// (All vertex colors calibrated well above Khronos 0.018 linear luminance anti-crush floor)
export const PYTHON_ROYAL_BLUE = '#2a3852';
export const PYTHON_ROYAL_DEEP = '#222e44';
export const PYTHON_RIB_MATTE = '#253146';
export const PYTHON_CHAMFER_BLUE = '#465978';
export const PYTHON_BORE_DARK = '#212733';
export const PYTHON_STAINLESS = '#cbd5e1';
export const PYTHON_MIRROR_STEEL = '#e2e8f0';
export const PYTHON_SPRING_STEEL = '#94a3b8';
export const PYTHON_SIGHT_RED = '#ea580c';
export const PYTHON_SIGHT_WHITE = '#f1f5f9';
export const PYTHON_WALNUT_BURL = '#6b3e23';
export const PYTHON_WALNUT_CHECKER = '#54301b';
export const PYTHON_GOLD_MEDALLION = '#dfb249';
export const PYTHON_BRASS_CASE = '#d4a238';
export const PYTHON_COPPER_JHP = '#b85d38';
export const PYTHON_NICKEL_CASE = '#d8e0e8';
export const PYTHON_ANODIZED_KNOB = '#2c333f';

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

/**
 * Strips any zero-area CSG sliver triangles, preserves `aCurvature` & `aSpringParam`,
 * enforces unit-length normals (`|n| = 1`) with zero NaNs, normalizes UVs into `[0, 1]`,
 * and recomputes bounding volumes.
 */
export function sanitizePythonMesh(
  geo: THREE.BufferGeometry,
  preserveCustomAtlasUVs = false
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

        cArr[di * 3] = col ? col.getX(si) : 0.45;
        cArr[di * 3 + 1] = col ? col.getY(si) : 0.48;
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.54;

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

  // Guarantee valid [0, 1] UVs across all 25 parts (and non-collapsed spans on box-mapped parts)
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
// 1. SHARED CNC-DETAIL PRIMITIVES
// ============================================================================

/** Revolves an `(r, x)` profile around `+X` (pass a closed loop for a solid/hollow wall). */
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

/** Helical rifling lands standing proud inside bore `boreR` along `+X` (centered at `centerY, centerZ`). */
export function twistedRiflingLands(opts: {
  count: number;
  boreR: number;
  depth: number;
  width: number;
  x0: number;
  x1: number;
  twistCm: number;
  color: string;
  centerY?: number;
  centerZ?: number;
  segments?: number;
  phase?: number;
}): THREE.BufferGeometry {
  const {
    count,
    boreR,
    depth,
    width,
    x0,
    x1,
    twistCm,
    color,
    centerY = 0,
    centerZ = 0,
  } = opts;
  const len = x1 - x0;
  const segs =
    opts.segments ??
    Math.max(6, Math.ceil((Math.abs(len / twistCm) * 360) / 16));
  const embed = Math.min(0.01, depth * 0.5);
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
      pos.setXYZ(i, x, centerY + y * ca - z * sa, centerZ + y * sa + z * ca);
    }
    box.computeVertexNormals();
    lands.push(box.toNonIndexed());
    box.dispose();
  }
  const merged = mergeGeometries(lands, false);
  for (const l of lands) l.dispose();
  return paintGeometry(merged, color);
}

/** Straight or helical surface knurling ridges around cylinder radius `r` along `+X`. */
export function surfaceRidges(opts: {
  count: number;
  r: number;
  height: number;
  width: number;
  x0: number;
  x1: number;
  color: string;
  centerY?: number;
  centerZ?: number;
  twistCm?: number;
  segments?: number;
}): THREE.BufferGeometry {
  return twistedRiflingLands({
    count: opts.count,
    boreR: opts.r + opts.height,
    depth: opts.height,
    width: opts.width,
    x0: opts.x0,
    x1: opts.x1,
    twistCm: opts.twistCm ?? 1e9,
    color: opts.color,
    centerY: opts.centerY,
    centerZ: opts.centerZ,
    segments: opts.segments ?? (opts.twistCm ? 6 : 1),
  });
}

/** Merges non-overlapping boolean cutter solids into a single CSG brush. */
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
  return paintGeometry(merged, color);
}

// ============================================================================
// 2. PRECISION 2K UV ATLAS UNWRAPPERS (`python_frame_*` & `python_walnut_*`)
// ============================================================================

/**
 * Unwraps U-01 6" Ventilated-Rib & Full-Underlug Barrel onto `python_frame_*` (2048x1024):
 *  - Top anti-glare serrated rib (`fny > 0.65 && cy > 3.45`): v in [0.92, 0.98], u in [0.04, 0.96]
 *  - Left barrel flank (`fnz < -0.25`): v in [0.75, 0.90], u in [0.04, 0.96] ("PYTHON .357")
 *  - Right barrel flank (`fnz > 0.25`): v in [0.51, 0.72], u in [0.04, 0.96] ("HARTFORD, CONN.")
 */
export function applyPythonBarrelUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cy, cz, fny, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let band: 'rib' | 'left' | 'right' = 'right';
    if (fny > 0.65 && cy > 3.42) {
      band = 'rib';
    } else if (fnz < -0.15 || (Math.abs(fnz) <= 0.15 && cz < 0)) {
      band = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - 2.2) / 15.22);
      const yNorm = clamp01((y - 0.96) / 2.7);

      let u: number;
      let v: number;
      if (band === 'rib') {
        u = 0.04 + xNorm * 0.92;
        v = 0.92 + clamp01((z + 0.38) / 0.76) * 0.055;
      } else if (band === 'left') {
        u = 0.04 + (1.0 - xNorm) * 0.92;
        v = 0.75 + yNorm * 0.155;
      } else {
        u = 0.04 + xNorm * 0.92;
        v = 0.51 + yNorm * 0.21;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-01 Forged Colt I-Frame onto `python_frame_*` middle-left band:
 *  - u in [0.04, 0.63], v in [0.25, 0.48] (Rampant Colt + VP proof + serial E 48291)
 */
export function applyPythonFrameUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { fnz } = triInfo(pos, col, i, i + 1, i + 2);
    const isLeft = fnz < -0.25;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const xNorm = clamp01((x + 11.35) / 15.0);
      const yNorm = clamp01((y + 9.45) / 13.15);
      const u = isLeft ? 0.04 + (1.0 - xNorm) * 0.58 : 0.04 + xNorm * 0.58;
      const v = 0.255 + yNorm * 0.22;
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-02 Removable Right Lockwork Sideplate onto `python_frame_*` middle-right band:
 *  - u in [0.66, 0.96], v in [0.26, 0.47] (`uSpan = 0.30 >= 0.18`, `vSpan = 0.21 >= 0.09`!)
 */
export function applyPythonSideplateUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const xNorm = clamp01((pos.getX(i) + 2.15) / 4.3);
    const yNorm = clamp01((pos.getY(i) + 2.55) / 5.1);
    uvs[i * 2] = clamp01(0.66 + xNorm * 0.30);
    uvs[i * 2 + 1] = clamp01(0.26 + yNorm * 0.21);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps M-02 6-Chamber Fluted .357 Cylinder onto `python_frame_*` bottom C_6 band:
 *  - u in [0.02, 0.98] mapped continuously per triangle around cylinder axis,
 *  - v in [0.03, 0.22] mapped along cylinder X length [-2.08, +2.08].
 */
export function applyPythonCylinderUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const baseAng = Math.atan2(cz, cy);

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const r = Math.hypot(y, z);
      const ang = r > 1e-4 ? Math.atan2(z, y) : baseAng;
      // Avoid seam wrap-around distortion across a single triangle
      let dAng = ang - baseAng;
      if (dAng > Math.PI) dAng -= Math.PI * 2;
      if (dAng < -Math.PI) dAng += Math.PI * 2;
      const uRaw = fractPos((baseAng + dAng) / (Math.PI * 2) + 0.5 / 6.0);
      const xNorm = clamp01((x + 2.08) / 4.16);
      uvs[vi * 2] = clamp01(0.02 + uRaw * 0.96);
      uvs[vi * 2 + 1] = clamp01(0.03 + xNorm * 0.19);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-04 / F-05 Checkered American Black Walnut Target Grips onto `python_walnut_*`:
 *  - Left panel:  u in [0.06, 0.45], v in [0.05, 0.95] (medallion centered at u=0.255, v=0.805)
 *  - Right panel: u in [0.55, 0.94], v in [0.05, 0.95] (medallion centered at u=0.745, v=0.805)
 */
export function applyPythonGripUVs(
  geo: THREE.BufferGeometry,
  side: 'left' | 'right'
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  // Local grip bounds span X in [-3.72, +3.20], Y in [-5.20, +5.30] around assembledPos [-8.05, -4.65, +-0.82]
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const yNorm = clamp01((y + 5.2) / 10.5);
    // Compensate grip rake angle (~-24 deg) so u=0.255 / 0.745 runs right up the center spine of the grip!
    const spineCenterX = -1.65 + yNorm * 3.1;
    const across = clamp01((x - spineCenterX + 1.95) / 3.9);
    const uLocal = side === 'left' ? 1.0 - across : across;
    const u =
      side === 'left' ? 0.06 + uLocal * 0.39 : 0.55 + uLocal * 0.39;
    const v = 0.05 + yNorm * 0.9;
    uvs[i * 2] = clamp01(u);
    uvs[i * 2 + 1] = clamp01(v);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 3. BARREL & TARGET SIGHT ASSEMBLY ('slide' · 5 parts: U-01..U-05)
// ============================================================================

/**
 * U-01: 6-Inch (152.4 mm) Ventilated-Rib & Full-Underlug Rifled .357 Magnum Barrel
 * (assembledPos: [0, 0, 0], fixed barrel!)
 * Spans world X in [2.21, 17.42] (6.00" = 15.24 cm from cylinder face X=2.18 to crown X=17.42),
 * bore centerline at (Y = 2.35, Z = 0), cylinder/ejector centerline at (Y = 1.17, Z = 0).
 */
export function buildPythonBarrelGeometry(): THREE.BufferGeometry {
  // 1. Hollow heavy .357 Magnum barrel tube with 11-deg recessed target crown & 11-deg forcing cone!
  const barrelTube = latheAlongX(
    [
      [0.34, 2.21], // Flared 11-deg forcing-cone mouth (0.3mm cylinder gap from X=2.18)
      [0.44, 2.21], // Rear forcing-cone rim
      [0.48, 2.32], // Threaded frame shank OD
      [0.48, 3.55], // Frame front boss shoulder
      [0.56, 3.58], // Heavy breech barrel contour
      [0.55, 11.2],
      [0.53, 17.36], // Subtle Colt Python taper toward muzzle
      [0.49, 17.42], // Outer muzzle bevel
      [0.32, 17.42], // Target crown flat rim
      [0.232, 17.39], // 11-deg recessed target crown dish
      [0.226, 17.37], // .357" (9.07mm -> r=0.4535 / visual thick-wall r=0.226) chrome/blued bore
      [0.226, 2.52], // Rifled bore throat
      [0.34, 2.21], // Flared forcing cone funnel (closes loop)
    ],
    36,
    PYTHON_ROYAL_BLUE
  );
  barrelTube.translate(0, 2.35, 0);

  // 2. Iconic 3-Vent Ventilated Top Rib (X in [3.55, 17.38], Y in [2.78, 3.66], Z in [-0.36, +0.36])
  const ribSideShape = new THREE.Shape();
  ribSideShape.moveTo(3.55, 2.78);
  ribSideShape.lineTo(17.38, 2.78);
  ribSideShape.lineTo(17.38, 3.66);
  ribSideShape.lineTo(3.55, 3.66);
  ribSideShape.closePath();

  // Subtract 3 signature Colt Python 6" rectangular cooling vents through Z
  for (const [vx0, vx1] of [
    [4.95, 7.55],
    [8.75, 11.35],
    [12.55, 15.15],
  ] as const) {
    const hole = new THREE.Path();
    const r = 0.08;
    const y0 = 2.94;
    const y1 = 3.40;
    hole.moveTo(vx0 + r, y0);
    hole.lineTo(vx1 - r, y0);
    hole.quadraticCurveTo(vx1, y0, vx1, y0 + r);
    hole.lineTo(vx1, y1 - r);
    hole.quadraticCurveTo(vx1, y1, vx1 - r, y1);
    hole.lineTo(vx0 + r, y1);
    hole.quadraticCurveTo(vx0, y1, vx0, y1 - r);
    hole.lineTo(vx0, y0 + r);
    hole.quadraticCurveTo(vx0, y0, vx0 + r, y0);
    ribSideShape.holes.push(hole);
  }
  const ventilatedRib = extrudeAlongZ(
    ribSideShape,
    -0.35,
    0.70,
    PYTHON_RIB_MATTE,
    0.035,
    8
  );

  // 3. Full-Length Underlug Ejector-Rod Shroud (X in [3.55, 17.34], Y in [0.96, 1.96])
  const underlugProfile = new THREE.Shape();
  underlugProfile.moveTo(-0.44, 1.96);
  underlugProfile.lineTo(0.44, 1.96);
  underlugProfile.lineTo(0.44, 1.32);
  underlugProfile.absarc(0, 1.32, 0.44, 0, -Math.PI, true);
  underlugProfile.lineTo(-0.44, 1.96);
  const fullUnderlug = extrudeAlongX(
    underlugProfile,
    3.55,
    13.79,
    PYTHON_ROYAL_BLUE,
    0.04,
    12
  );

  // Carve left-open ejector-rod trough (X in [3.50, 7.82] around Y=1.17, Z=0),
  // front detent plunger bore (X in [7.78, 8.85]), and barrel bore clearance cleanly!
  const underlugCutters = mergeCutters(
    [
      new THREE.CylinderGeometry(0.32, 0.32, 4.45, 22)
        .rotateZ(Math.PI / 2)
        .translate(5.68, 1.17, 0),
      new THREE.BoxGeometry(4.45, 0.56, 0.55).translate(5.68, 1.17, -0.26),
      new THREE.CylinderGeometry(0.20, 0.20, 1.15, 18)
        .rotateZ(Math.PI / 2)
        .translate(8.30, 1.17, 0),
      new THREE.BoxGeometry(1.82, 0.22, 0.34).translate(16.35, 3.64, 0),
    ],
    PYTHON_BORE_DARK
  );

  const unitedBarrelShell = csgSubtract(
    csgUnion([barrelTube, ventilatedRib, fullUnderlug]),
    [
      underlugCutters,
      paintGeometry(
        new THREE.CylinderGeometry(0.225, 0.225, 15.6, 24)
          .rotateZ(Math.PI / 2)
          .translate(9.9, 2.35, 0),
        PYTHON_BORE_DARK
      ),
    ]
  );

  // 4. 6 right-hand 1:14" (35.56 cm) Colt target rifling lands + bright forcing-cone/crown rings
  const rifling = twistedRiflingLands({
    count: 6,
    boreR: 0.226,
    depth: 0.018,
    width: 0.042,
    x0: 2.55,
    x1: 17.34,
    twistCm: 35.56,
    color: PYTHON_STAINLESS,
    centerY: 2.35,
    centerZ: 0,
  });
  const crownRing = latheAlongX(
    [
      [0.232, 17.39],
      [0.322, 17.418],
      [0.322, 17.412],
      [0.232, 17.384],
      [0.232, 17.39],
    ],
    32,
    PYTHON_MIRROR_STEEL
  ).translate(0, 2.35, 0);

  return sanitizePythonMesh(
    applyPythonBarrelUVs(mergeParts([unitedBarrelShell, rifling, crownRing])),
    true
  );
}

/**
 * U-02: Pinned Ramped Target Front Sight w/ Red Insert (assembledPos: [16.35, 3.82, 0])
 */
export function buildPythonFrontSightGeometry(): THREE.BufferGeometry {
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.86, -0.22);
  bladeShape.lineTo(0.84, -0.22);
  bladeShape.lineTo(0.76, 0.14);
  bladeShape.lineTo(0.48, 0.33); // World Y = 3.82 + 0.33 = 4.15 cm!
  bladeShape.lineTo(-0.78, -0.04);
  bladeShape.closePath();

  const blade = extrudeAlongZ(
    bladeShape,
    -0.14,
    0.28,
    PYTHON_ROYAL_DEEP,
    0.018,
    6
  );

  // High-visibility orange-red target insert locked into rear sight ramp
  const redInsertShape = new THREE.Shape();
  redInsertShape.moveTo(-0.56, 0.02);
  redInsertShape.lineTo(0.38, 0.29);
  redInsertShape.lineTo(0.32, 0.16);
  redInsertShape.lineTo(-0.48, -0.07);
  redInsertShape.closePath();
  const redInsert = extrudeAlongZ(
    redInsertShape,
    -0.09,
    0.18,
    PYTHON_SIGHT_RED,
    0.008,
    4
  );

  const sightPin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.36, 14)
      .rotateX(Math.PI / 2)
      .translate(0.05, -0.12, 0),
    PYTHON_STAINLESS
  );

  return sanitizePythonMesh(mergeParts([blade, redInsert, sightPin]));
}

/**
 * U-03: Colt Accro Micrometric Adjustable Target Rear Sight (assembledPos: [-2.15, 3.76, 0])
 */
export function buildPythonRearSightGeometry(): THREE.BufferGeometry {
  const baseBody = createChamferedBox(2.12, 0.34, 0.94, 0.03, PYTHON_ROYAL_DEEP);
  baseBody.translate(-0.02, -0.04, 0);

  // Protective target ears & square U-notch rear blade
  const rawBlade = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.42, 1.04).translate(-0.82, 0.15, 0),
    PYTHON_ROYAL_DEEP
  );
  const notchCut = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.22, 0.30).translate(-0.82, 0.29, 0),
    PYTHON_BORE_DARK
  );
  const notchedBlade = csgSubtract(rawBlade, [notchCut]);

  // Crisp white U-outline target contrast trim around rear notch
  const whiteLeft = paintGeometry(
    new THREE.BoxGeometry(0.03, 0.18, 0.05).translate(-0.945, 0.26, -0.175),
    PYTHON_SIGHT_WHITE
  );
  const whiteRight = paintGeometry(
    new THREE.BoxGeometry(0.03, 0.18, 0.05).translate(-0.945, 0.26, 0.175),
    PYTHON_SIGHT_WHITE
  );
  const whiteBottom = paintGeometry(
    new THREE.BoxGeometry(0.03, 0.045, 0.40).translate(-0.945, 0.16, 0),
    PYTHON_SIGHT_WHITE
  );

  // Micrometric slotted elevation screw (top) & windage click screw (+Z right)
  const elevScrew = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.14, 18).translate(-0.18, 0.16, 0),
    PYTHON_STAINLESS
  );
  const windScrew = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 0.22, 18)
      .rotateX(Math.PI / 2)
      .translate(-0.76, 0.12, 0.54),
    PYTHON_STAINLESS
  );
  const hingePin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.98, 14)
      .rotateX(Math.PI / 2)
      .translate(0.78, -0.04, 0),
    PYTHON_STAINLESS
  );

  return sanitizePythonMesh(
    mergeParts([
      baseBody,
      notchedBlade,
      whiteLeft,
      whiteRight,
      whiteBottom,
      elevScrew,
      windScrew,
      hingePin,
    ])
  );
}

/**
 * U-04: Frame-Boss Barrel Retention Cross-Pin (assembledPos: [3.05, 2.92, 0])
 */
export function buildPythonBarrelPinGeometry(): THREE.BufferGeometry {
  const pin = latheAlongX(
    [
      [0.0, -0.62],
      [0.085, -0.60],
      [0.105, -0.56],
      [0.105, 0.56],
      [0.085, 0.60],
      [0.0, 0.62],
    ],
    20,
    PYTHON_STAINLESS
  );
  pin.rotateY(Math.PI / 2); // Align along Z axis across barrel boss
  return sanitizePythonMesh(pin);
}

/**
 * U-05: Underlug Ejector-Rod Locking Detent Plunger & Helical Spring
 * (assembledPos: [8.15, 1.17, 0])
 */
export function buildPythonDetentPlungerGeometry(): THREE.BufferGeometry {
  // Rear concave locking nose cup that snaps over the tip of `python_extractor_rod`
  const plungerBody = latheAlongX(
    [
      [0.05, -0.52], // Concave detent nose socket
      [0.145, -0.56],
      [0.165, -0.50],
      [0.165, -0.05], // Plunger shoulder
      [0.095, -0.02], // Spring guide stem
      [0.095, 0.54],
      [0.0, 0.56],
      [0.0, -0.46],
      [0.05, -0.52],
    ],
    22,
    PYTHON_STAINLESS
  );
  const crossPin = paintGeometry(
    new THREE.CylinderGeometry(0.042, 0.042, 0.44, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.26, 0.08, 0),
    PYTHON_MIRROR_STEEL
  );
  const detentSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.04,
      end: 0.54,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.135,
      wireRadius: 0.022,
      coils: 7,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    PYTHON_SPRING_STEEL
  );

  return sanitizePythonMesh(mergeParts([plungerBody, crossPin, detentSpring]));
}

// ============================================================================
// 4. FORGED COLT I-FRAME, REMOVABLE SIDEPLATE & WALNUT GRIPS ('frame' · 6 parts)
// ============================================================================

/**
 * F-01: Forged Colt I-Frame w/ Cylinder Window, Recoil Shield, Trigger Guard & Grip Tang
 * (assembledPos: [0, 0, 0], stationary datum skeleton)
 * Spans X in [-11.35, +3.65], Y in [-9.45, +3.66], Z in [-0.70, +0.70].
 */
export function buildPythonFrameGeometry(): THREE.BufferGeometry {
  // 1. Main forged I-frame silhouette in (X, Y)
  const frameShape = new THREE.Shape();
  frameShape.moveTo(3.65, 3.66); // Front top-strap nose
  frameShape.lineTo(-2.95, 3.66); // Rear sight seat
  frameShape.lineTo(-4.15, 3.28); // Hammer shroud arch
  frameShape.quadraticCurveTo(-5.65, 2.55, -5.85, 1.15); // Upper backstrap tang
  frameShape.quadraticCurveTo(-6.35, -0.85, -8.35, -4.85); // Swept backstrap curve
  frameShape.quadraticCurveTo(-9.75, -7.65, -11.25, -9.15); // Flared grip butt heel
  frameShape.lineTo(-9.15, -9.45); // Bottom butt strap
  frameShape.quadraticCurveTo(-7.25, -7.25, -5.65, -3.72); // Frontstrap lower curve
  frameShape.lineTo(-3.85, -2.35); // Trigger guard rear root
  frameShape.quadraticCurveTo(-3.95, -3.72, -1.55, -3.72); // Oval trigger guard bottom
  frameShape.quadraticCurveTo(0.85, -3.72, 0.92, -1.35); // Trigger guard front bow
  frameShape.lineTo(2.32, -1.22); // Lower crane boss chin
  frameShape.lineTo(3.65, -0.86); // Front crane lug nose
  frameShape.closePath();

  // Rectangular cylinder window hole (X in [-2.24, +2.26], Y in [-0.86, +3.22])
  const cylWin = new THREE.Path();
  cylWin.moveTo(-2.24, -0.86);
  cylWin.lineTo(2.26, -0.86);
  cylWin.lineTo(2.26, 3.22);
  cylWin.lineTo(-2.24, 3.22);
  cylWin.closePath();
  frameShape.holes.push(cylWin);

  // Trigger guard interior bow opening
  const tgHole = new THREE.Path();
  tgHole.moveTo(-3.35, -1.32);
  tgHole.lineTo(0.36, -1.32);
  tgHole.quadraticCurveTo(0.42, -3.26, -1.52, -3.26);
  tgHole.quadraticCurveTo(-3.42, -3.26, -3.35, -1.32);
  frameShape.holes.push(tgHole);

  // Open grip-tang mainspring window so X-Ray / Section-Cut exposes V-mainspring!
  const tangHole = new THREE.Path();
  tangHole.moveTo(-5.85, -1.15);
  tangHole.lineTo(-5.15, -1.45);
  tangHole.lineTo(-8.65, -8.65);
  tangHole.lineTo(-10.25, -8.55);
  tangHole.closePath();
  frameShape.holes.push(tangHole);

  const baseForging = extrudeAlongZ(
    frameShape,
    -0.66,
    1.32,
    PYTHON_ROYAL_BLUE,
    0.04,
    12
  );

  // 2. Sculpted hemispherical Recoil Shield behind cylinder (X in [-2.68, -2.24], R = 1.92 around [1.17, 0])
  const shieldDisc = paintGeometry(
    new THREE.CylinderGeometry(1.92, 1.92, 0.44, 32)
      .rotateZ(Math.PI / 2)
      .translate(-2.46, 1.17, 0),
    PYTHON_ROYAL_BLUE
  );
  const rawFrame = csgUnion([baseForging, shieldDisc]);

  // 3. Mill internal +Z right-side lockwork cavity (Z in [-0.26, +0.75], closed by `python_sideplate`),
  //    hammer/trigger/bolt/hand slots, barrel thread bore, crane pivot bore & firing-pin tunnel!
  const frameCutters = mergeCutters(
    [
      // Right-side milled clockwork pocket (leaves solid left wall Z in [-0.66, -0.26])
      new THREE.BoxGeometry(4.12, 4.78, 1.04).translate(-4.42, 0.56, 0.28),
      // Top hammer spur & nose slot
      new THREE.BoxGeometry(2.65, 2.25, 0.52).translate(-4.35, 2.45, 0),
      // Firing-pin bushing aperture through recoil shield at (Y=2.35, Z=0)
      new THREE.CylinderGeometry(0.18, 0.18, 1.2, 18)
        .rotateZ(Math.PI / 2)
        .translate(-2.55, 2.35, 0),
      // Hand pawl slot on recoil shield face
      new THREE.BoxGeometry(0.65, 1.15, 0.24).translate(-2.36, 0.62, -0.14),
      // Lower cylinder-bolt window slot at 6 o'clock (X = +0.10, Y = -1.02)
      new THREE.BoxGeometry(0.76, 0.52, 0.34).translate(0.1, -1.02, 0),
      // Trigger slot into trigger guard
      new THREE.BoxGeometry(1.18, 0.56, 0.38).translate(-2.15, -1.24, 0),
      // Front barrel mounting bore (Y = 2.35) & lower crane hinge bore (Y = -0.58, Z = -0.58)
      new THREE.CylinderGeometry(0.485, 0.485, 1.65, 24)
        .rotateZ(Math.PI / 2)
        .translate(2.96, 2.35, 0),
      new THREE.CylinderGeometry(0.28, 0.28, 1.55, 20)
        .rotateZ(Math.PI / 2)
        .translate(2.98, -0.48, -0.32),
      // Slimmer grip tang Z thickness (steps in from +-0.66 to +-0.38 below Y = -1.4)
      new THREE.BoxGeometry(7.2, 8.8, 0.42).translate(-8.4, -5.4, 0.58),
      new THREE.BoxGeometry(7.2, 8.8, 0.42).translate(-8.4, -5.4, -0.58),
      // Trim recoil shield Z flanks to authentic Colt I-frame contour (Z in [-0.96, +0.66])
      new THREE.BoxGeometry(1.2, 4.4, 1.6).translate(-2.46, 1.17, 1.46),
      new THREE.BoxGeometry(1.2, 4.4, 1.4).translate(-2.46, 1.17, -1.66),
    ],
    PYTHON_BORE_DARK
  );

  const milledFrame = csgSubtract(rawFrame, [frameCutters]);

  // Internal hardened stainless lockwork pivot studs anchored on left wall (Z = -0.26..+0.34)
  const hammerStud = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 0.62, 16)
      .rotateX(Math.PI / 2)
      .translate(-4.35, 0.58, 0.04),
    PYTHON_STAINLESS
  );
  const triggerStud = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.60, 16)
      .rotateX(Math.PI / 2)
      .translate(-2.35, -1.05, 0.04),
    PYTHON_STAINLESS
  );
  const reboundStud = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.58, 16)
      .rotateX(Math.PI / 2)
      .translate(-5.55, -1.72, 0.02),
    PYTHON_STAINLESS
  );
  const mainspringAnchorPin = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.74, 16)
      .rotateX(Math.PI / 2)
      .translate(-9.75, -8.45, 0),
    PYTHON_STAINLESS
  );

  return sanitizePythonMesh(
    applyPythonFrameUVs(
      mergeParts([
        milledFrame,
        hammerStud,
        triggerStud,
        reboundStud,
        mainspringAnchorPin,
      ])
    ),
    true
  );
}

/**
 * F-02: Hand-Fitted Removable Right Lockwork Sideplate (`isShell: true`)
 * (assembledPos: [-4.42, 0.56, 0.54])
 * Sits on `+Z` (`Z in [0.40, 0.67] > 0.06`), so both X-Ray [X] and Section-Cut [C]
 * immediately expose the entire Colt DA/SA clockwork inside `python_frame`!
 */
export function buildPythonSideplateGeometry(): THREE.BufferGeometry {
  const plateShape = new THREE.Shape();
  plateShape.moveTo(2.04, -2.42);
  plateShape.lineTo(2.04, 2.42);
  plateShape.lineTo(0.45, 2.42);
  plateShape.quadraticCurveTo(-1.35, 1.95, -1.52, 0.55);
  plateShape.quadraticCurveTo(-1.82, -1.15, -2.06, -2.42);
  plateShape.closePath();

  const outerPlate = extrudeAlongZ(
    plateShape,
    -0.06,
    0.19,
    PYTHON_ROYAL_BLUE,
    0.022,
    10
  );
  const innerStepShape = new THREE.Shape();
  innerStepShape.moveTo(1.88, -2.22);
  innerStepShape.lineTo(1.88, 2.22);
  innerStepShape.lineTo(0.38, 2.22);
  innerStepShape.quadraticCurveTo(-1.18, 1.78, -1.34, 0.48);
  innerStepShape.lineTo(-1.82, -2.22);
  innerStepShape.closePath();
  const innerLip = extrudeAlongZ(
    innerStepShape,
    -0.14,
    0.09,
    PYTHON_CHAMFER_BLUE,
    0.01,
    8
  );

  // Two countersunk screw bores matching `python_sideplate_screws`
  const screwCuts = mergeCutters(
    [
      new THREE.CylinderGeometry(0.18, 0.12, 0.38, 18)
        .rotateX(Math.PI / 2)
        .translate(-1.05, 1.22, 0.02),
      new THREE.CylinderGeometry(0.18, 0.12, 0.38, 18)
        .rotateX(Math.PI / 2)
        .translate(1.38, -1.42, 0.02),
    ],
    PYTHON_BORE_DARK
  );

  const milledPlate = csgSubtract(csgUnion([outerPlate, innerLip]), [screwCuts]);
  return sanitizePythonMesh(applyPythonSideplateUVs(milledPlate), true);
}

/**
 * F-03: Pair of Blued Gunsmith-Slotted Sideplate Retention Screws
 * (assembledPos: [-4.42, 0.56, 0.64])
 */
export function buildPythonSideplateScrewsGeometry(): THREE.BufferGeometry {
  const screws: THREE.BufferGeometry[] = [];
  for (const [sx, sy] of [
    [-1.05, 1.22],
    [1.38, -1.42],
  ] as const) {
    const screwBody = latheAlongX(
      [
        [0.0, -0.52],
        [0.085, -0.49],
        [0.095, -0.08],
        [0.175, -0.04],
        [0.175, 0.04],
        [0.145, 0.06],
        [0.0, 0.06],
      ],
      20,
      PYTHON_ROYAL_DEEP
    );
    screwBody.rotateY(Math.PI / 2); // +X lathe -> +Z head outward
    const slotCut = paintGeometry(
      new THREE.BoxGeometry(0.38, 0.042, 0.06).translate(0, 0, 0.05),
      PYTHON_CHAMFER_BLUE
    );
    const slotted = csgSubtract(screwBody, [slotCut]);
    slotted.translate(sx, sy, 0);
    screws.push(slotted);
  }
  return sanitizePythonMesh(mergeParts(screws));
}

/**
 * Shared builder for F-04 (`left`) & F-05 (`right`) Checkered American Black Walnut
 * Target Grip Panels w/ Raised 24K Gold Rampant Colt Medallions (`isShell: true`).
 * Assembled at `[-8.05, -4.65, +-0.82]` -> spans world X in [-11.78, -4.85], Y in [-9.85, +0.65].
 */
function buildPythonWalnutGripPanel(
  side: 'left' | 'right'
): THREE.BufferGeometry {
  const signZ = side === 'right' ? 1 : -1;

  const gripOutline = new THREE.Shape();
  gripOutline.moveTo(3.15, 5.25); // Upper-front horn near frame window
  gripOutline.quadraticCurveTo(2.45, 5.32, 1.65, 4.85); // Curved upper collar
  gripOutline.quadraticCurveTo(1.15, 2.85, -0.15, 0.25); // Backstrap curve
  gripOutline.quadraticCurveTo(-1.85, -2.95, -3.68, -4.72); // Flared Colt target heel (-8.05 - 3.68 = -11.73 -> bevel -11.78!)
  gripOutline.lineTo(-1.12, -5.18); // Flat checkered butt base (-4.65 - 5.18 = -9.83 -> bevel -9.85!)
  gripOutline.quadraticCurveTo(0.45, -2.55, 1.92, 0.85); // Ergonomic front finger swell
  gripOutline.quadraticCurveTo(2.65, 2.75, 3.15, 5.25);
  gripOutline.closePath();

  // Contoured walnut slab: inner bedding face reaches Z = +-0.02 (straddles section plane z=0.06 on right!)
  const zMin = side === 'right' ? -0.78 : -0.62;
  const slab = extrudeAlongZ(
    gripOutline,
    zMin,
    1.40,
    PYTHON_WALNUT_BURL,
    0.16,
    14
  );

  // Carve inner grip-tang bedding mortise so left & right panels hug `python_frame` tang without clipping
  const tangMortise = paintGeometry(
    new THREE.BoxGeometry(5.6, 9.6, 0.78)
      .rotateZ(0.42)
      .translate(-0.15, -0.15, side === 'right' ? -0.46 : 0.46),
    PYTHON_WALNUT_CHECKER
  );
  const sculptedPanel = csgSubtract(slab, [tangMortise]);

  // Raised 3D inlaid 24K Gold Rampant Colt Medallion at upper boss (maps to v ~ 0.805 in UV!)
  const medallion = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.62, 0.08, 28)
      .rotateX(Math.PI / 2)
      .translate(1.62, 3.45, signZ * 0.60),
    PYTHON_GOLD_MEDALLION
  );
  // Brass grip escutcheon screw ferrule at mid-grip (maps to v ~ 0.455 in UV!)
  const escutcheon = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.26, 0.10, 20)
      .rotateX(Math.PI / 2)
      .translate(0.18, -0.35, signZ * 0.59),
    PYTHON_GOLD_MEDALLION
  );

  return sanitizePythonMesh(
    applyPythonGripUVs(
      mergeParts([sculptedPanel, medallion, escutcheon]),
      side
    ),
    true
  );
}

export function buildPythonGripLeftGeometry(): THREE.BufferGeometry {
  return buildPythonWalnutGripPanel('left');
}

export function buildPythonGripRightGeometry(): THREE.BufferGeometry {
  return buildPythonWalnutGripPanel('right');
}

/**
 * F-06: Colt Signature Pull-Back Teardrop Checkered Cylinder Release Latch
 * (assembledPos: [-3.35, 1.48, -0.74])
 */
export function buildPythonCylinderLatchGeometry(): THREE.BufferGeometry {
  const thumbShape = new THREE.Shape();
  thumbShape.moveTo(-0.68, -0.18);
  thumbShape.quadraticCurveTo(-0.78, 0.28, -0.22, 0.36);
  thumbShape.quadraticCurveTo(0.58, 0.34, 0.72, 0.02);
  thumbShape.quadraticCurveTo(0.56, -0.32, -0.18, -0.34);
  thumbShape.quadraticCurveTo(-0.62, -0.32, -0.68, -0.18);
  thumbShape.closePath();

  const thumbPiece = extrudeAlongZ(
    thumbShape,
    -0.14,
    0.24,
    PYTHON_ROYAL_BLUE,
    0.03,
    10
  );
  // Tactile vertical serration ribs on thumbpiece face
  const ribs: THREE.BufferGeometry[] = [thumbPiece];
  for (let i = -3; i <= 3; i++) {
    ribs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.045, 0.46, 0.05).translate(
          i * 0.12,
          0.01,
          -0.15
        ),
        PYTHON_CHAMFER_BLUE
      )
    );
  }
  // Internal latch guide pin extending +Z into frame recoil shield
  ribs.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.11, 0.11, 0.48, 16)
        .rotateX(Math.PI / 2)
        .translate(0.18, 0, 0.28),
      PYTHON_STAINLESS
    )
  );

  return sanitizePythonMesh(mergeParts(ribs));
}
