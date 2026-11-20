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
  createRectangularMagSpring,
  csgSubtract,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';

// Authentic TsNIITochMash / Tula Arsenal (TOZ) VSS Vintorez (6P29 · 9×39mm) Palette
// Every vertex color stays well above the Khronos PBR 0.018 linear luminance anti-crush floor
export const VSS_BLUED_STEEL = '#4b525c';
export const VSS_SUPP_STEEL = '#464d57';
export const VSS_PLUM_POLYMER = '#4b373c';
export const VSS_PLUM_RIB = '#3f2d32';
export const VSS_BIRCH_LAMINATE = '#9e6b3b';
export const VSS_RUBBER_PAD = '#3a3f47';
export const VSS_PSO1_GREY = '#68717a';
export const VSS_LENS_EMERALD = '#1d7a64';
export const VSS_STAINLESS = '#c8d2dc';
export const VSS_BAFFLE_ALLOY = '#b6c1cc';
export const VSS_BARREL_STEEL = '#4e5662';
export const VSS_SPRING_STEEL = '#94a3b8';
export const VSS_FOLLOWER_ORANGE = '#ea580c';

/** 9×39mm SP-5/SP-6 rifled bore centerline height (cm) */
export const VSS_BORE_Y = 1.05;
/** Integral suppressor tube outer cylinder centerline height (cm) */
export const VSS_SUPP_Y = 1.35;
/** Long-stroke gas piston & gas cylinder axis height (cm) */
export const VSS_PISTON_Y = 2.3;

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
 * Strips any zero-area CSG slivers, guarantees outward winding (`signedVolume > 0`),
 * enforces unit-length normals, preserves `aCurvature` & `aSpringParam`, and maps UVs
 * cleanly into `[0.04, 0.96]` so CSG fallback meets custom-atlas UV bounds contracts.
 */
export function sanitizeVssMesh(
  geo: THREE.BufferGeometry
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
  const bb = out.boundingBox!;
  const spanX = Math.max(1e-3, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-3, bb.max.y - bb.min.y);
  const spanZ = Math.max(1e-3, bb.max.z - bb.min.z);
  const uvArr = new Float32Array(nTotal * 2);
  for (let i = 0; i < nTotal; i++) {
    const nx = Math.abs(outNorm.getX(i));
    const ny = Math.abs(outNorm.getY(i));
    const nz = Math.abs(outNorm.getZ(i));
    const ux = (outPos.getX(i) - bb.min.x) / spanX;
    const uy = (outPos.getY(i) - bb.min.y) / spanY;
    const uz = (outPos.getZ(i) - bb.min.z) / spanZ;
    let u: number;
    let v: number;
    if (nz >= nx && nz >= ny) {
      u = ux;
      v = uy;
    } else if (ny >= nx) {
      u = ux;
      v = uz;
    } else {
      u = uz;
      v = uy;
    }
    uvArr[i * 2] = 0.04 + Math.max(0, Math.min(1, u)) * 0.92;
    uvArr[i * 2 + 1] = 0.04 + Math.max(0, Math.min(1, v)) * 0.92;
  }
  out.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  out.computeBoundingSphere();
  return out;
}

function mkBox(
  sx: number,
  sy: number,
  sz: number,
  color: string,
  tx = 0,
  ty = 0,
  tz = 0,
  chamfer = 0.06
): THREE.BufferGeometry {
  const c = Math.min(chamfer, sx * 0.18, sy * 0.18, sz * 0.18);
  const g = createChamferedBox(sx, sy, sz, c);
  if (tx || ty || tz) g.translate(tx, ty, tz);
  return paintGeometry(g, color);
}

function mkCylX(
  rTop: number,
  rBot: number,
  length: number,
  color: string,
  tx = 0,
  ty = 0,
  tz = 0,
  segs = 28
): THREE.BufferGeometry {
  const g = createBeveledCylinder(
    rTop,
    rBot,
    length,
    Math.min(0.035, Math.min(rTop, rBot) * 0.16, length * 0.15),
    segs
  );
  g.rotateZ(-Math.PI / 2);
  if (tx || ty || tz) g.translate(tx, ty, tz);
  return paintGeometry(g, color);
}

function mkCylY(
  rTop: number,
  rBot: number,
  length: number,
  color: string,
  tx = 0,
  ty = 0,
  tz = 0,
  segs = 24
): THREE.BufferGeometry {
  const g = createBeveledCylinder(
    rTop,
    rBot,
    length,
    Math.min(0.03, Math.min(rTop, rBot) * 0.15, length * 0.15),
    segs
  );
  if (tx || ty || tz) g.translate(tx, ty, tz);
  return paintGeometry(g, color);
}

function mkCylZ(
  rTop: number,
  rBot: number,
  length: number,
  color: string,
  tx = 0,
  ty = 0,
  tz = 0,
  segs = 24
): THREE.BufferGeometry {
  const g = createBeveledCylinder(
    rTop,
    rBot,
    length,
    Math.min(0.03, Math.min(rTop, rBot) * 0.15, length * 0.15),
    segs
  );
  g.rotateX(Math.PI / 2);
  if (tx || ty || tz) g.translate(tx, ty, tz);
  return paintGeometry(g, color);
}

function mkExtrudeZ(
  pts: Array<[number, number]>,
  depth: number,
  zCenter: number,
  color: string,
  bevel = 0.05
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();
  const b = Math.min(bevel, depth * 0.18);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.04, depth - 2 * b),
    bevelEnabled: b > 0.005,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 10,
  });
  g.translate(0, 0, zCenter - (depth - 2 * b) * 0.5);
  return paintGeometry(g, color);
}

// ============================================================================
// 1. SLIDE / INTEGRAL BARREL & BAFFLE CORE GROUP (7 parts)
// ============================================================================

/** S-01: 200mm Perforated 9×39mm Barrel + Integrated Under-Suppressor Gas Tap Collar */
export function buildVssBarrelGeometry(): THREE.BufferGeometry {
  // Local origin at [6.0, 1.05, 0] -> local X in [-1.2, +20.0]
  const outer = mkCylX(0.76, 0.78, 21.2, VSS_BARREL_STEEL, 9.4, 0, 0, 32);
  const breechRing = mkCylX(0.92, 0.92, 2.2, VSS_BLUED_STEEL, -0.1, 0, 0, 28);
  const gasCollar = mkBox(4.4, 1.55, 1.56, VSS_BLUED_STEEL, 11.6, 0.78, 0, 0.08);
  const gasTube = mkCylX(0.48, 0.48, 5.2, VSS_BARREL_STEEL, 10.6, 1.25, 0, 22);
  const body = mergeParts([outer, breechRing, gasCollar, gasTube], 0);

  // Bore channel + 3 rows of radial gas-bleed ports along forward rifling!
  const bore = mkCylX(0.45, 0.45, 22.0, VSS_BARREL_STEEL, 9.4, 0, 0, 20);
  const cutters: THREE.BufferGeometry[] = [bore];
  for (let i = 0; i < 6; i++) {
    const px = 7.6 + i * 1.95;
    // Transverse Z-ports & vertical Y-ports visible in cutaway
    cutters.push(mkCylZ(0.14, 0.14, 2.2, VSS_BARREL_STEEL, px, 0, 0, 10));
    cutters.push(mkCylY(0.14, 0.14, 2.2, VSS_BARREL_STEEL, px + 0.9, 0, 0, 10));
  }
  const res = csgSubtract(body, cutters);
  return sanitizeVssMesh(res);
}

/** S-02: Gleaming CNC 6-Stage Slanted Asymmetric Acoustic Baffle Stack */
export function buildVssBaffleStackGeometry(): THREE.BufferGeometry {
  // Local origin at [36.3, 1.35, 0] -> local X in [-10.1, +10.1], bore centerline at local Y = -0.30!
  const parts: THREE.BufferGeometry[] = [];
  // Rear & front alignment collars
  parts.push(mkCylX(1.62, 1.62, 0.9, VSS_BAFFLE_ALLOY, -9.65, 0, 0, 32));
  parts.push(mkCylX(1.62, 1.62, 0.9, VSS_BAFFLE_ALLOY, 9.65, 0, 0, 32));
  // Upper & lower CNC tie-spine rails (leave Z=0 cutaway crystal clear!)
  parts.push(mkBox(20.0, 0.28, 0.85, VSS_STAINLESS, 0, 1.44, 0, 0.04));
  parts.push(mkBox(20.0, 0.28, 0.85, VSS_STAINLESS, 0, -1.44, 0, 0.04));
  // 6 slanted asymmetric acoustic diffuser baffle plates alternating +28° / -28°
  for (let i = 0; i < 6; i++) {
    const bx = -7.3 + i * 2.92;
    const tilt = i % 2 === 0 ? 0.46 : -0.46;
    const plate = mkCylX(1.56, 1.56, 0.34, VSS_BAFFLE_ALLOY, 0, 0, 0, 28);
    plate.rotateZ(tilt);
    plate.translate(bx, 0, 0);
    parts.push(plate);
  }
  const merged = mergeParts(parts, 0);
  // Concentric 10.5mm bullet flight passage at local Y = -0.30 (world Y = 1.05!)
  const boreHole = mkCylX(0.54, 0.54, 21.6, VSS_BAFFLE_ALLOY, 0, -0.3, 0, 20);
  const res = csgSubtract(merged, [boreHole]);
  return sanitizeVssMesh(res);
}

/** S-03: Long-Stroke Gas Piston Bolt Carrier & Right Charging Handle */
export function buildVssBoltCarrierGeometry(): THREE.BufferGeometry {
  // Local origin at [-0.5, 1.75, 0] -> local X in [-8.2, +14.8]
  const body = mkBox(12.2, 1.85, 2.28, VSS_BLUED_STEEL, -2.1, -0.15, 0, 0.08);
  // Long-stroke gas piston stem + grooved stainless piston head at local Y = +0.55 (world Y = 2.30)
  const rod = mkCylX(0.32, 0.34, 10.8, VSS_STAINLESS, 8.2, 0.55, 0, 20);
  const head = mkCylX(0.42, 0.42, 1.9, VSS_STAINLESS, 13.85, 0.55, 0, 24);
  // Right-side ergonomic swept charging handle (+Z)
  const stem = mkBox(1.55, 0.62, 2.25, VSS_BLUED_STEEL, 3.1, -0.1, 2.15, 0.06);
  const knob = mkCylY(0.42, 0.36, 0.95, VSS_BLUED_STEEL, 3.1, -0.1, 3.15, 16);
  const merged = mergeParts([body, rod, head, stem, knob], 0);
  // Hollow underside bolt track
  const boltCut = mkCylX(0.68, 0.68, 12.6, VSS_BLUED_STEEL, -2.1, -0.7, 0, 18);
  const res = csgSubtract(merged, [boltCut]);
  return sanitizeVssMesh(res);
}

/** S-04: Brushed-Stainless 6-Lug Cylindrical Rotating Bolt */
export function buildVssBoltGeometry(): THREE.BufferGeometry {
  // Local origin at [1.8, 1.05, 0] -> local X in [-4.4, +3.4]
  const parts: THREE.BufferGeometry[] = [];
  parts.push(mkCylX(0.62, 0.6, 7.6, VSS_STAINLESS, -0.5, 0, 0, 28));
  // 6 symmetric radial locking lugs every 60° around front head
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    const lug = mkBox(1.05, 0.36, 0.34, VSS_STAINLESS, 2.7, 0, 0, 0.04);
    lug.translate(0, 0.68, 0);
    lug.rotateX(ang);
    parts.push(lug);
  }
  // Top cam lug engaging bolt carrier helical cam track
  parts.push(mkBox(0.75, 0.52, 0.42, VSS_STAINLESS, -0.8, 0.78, 0, 0.05));
  const merged = mergeParts(parts, 0);
  // Coaxial firing pin channel + recessed 9×39mm bolt face
  const pinHole = mkCylX(0.2, 0.2, 8.4, VSS_STAINLESS, -0.5, 0, 0, 14);
  const res = csgSubtract(merged, [pinHole]);
  return sanitizeVssMesh(res);
}

/** S-05: Coaxial Hardened Stainless Firing Pin */
export function buildVssFiringPinGeometry(): THREE.BufferGeometry {
  // Local origin at [1.4, 1.05, 0] -> local X in [-4.3, +3.85]
  const rear = mkCylX(0.22, 0.22, 1.2, VSS_STAINLESS, -3.7, 0, 0, 18);
  const shaft = mkCylX(0.14, 0.16, 6.2, VSS_STAINLESS, -0.1, 0, 0, 18);
  const tip = mkCylX(0.06, 0.14, 0.95, VSS_STAINLESS, 3.35, 0, 0, 16);
  return sanitizeVssMesh(mergeParts([rear, shaft, tip]));
}

/** S-06: Telescoping Steel Recoil Guide Rod & Dust-Cover Latch Block */
export function buildVssRecoilGuideGeometry(): THREE.BufferGeometry {
  // Local origin at [-6.8, 2.28, 0] -> local X in [-5.1, +4.8]
  const rearLug = mkBox(1.1, 0.96, 1.02, VSS_BLUED_STEEL, -4.55, 0.02, 0, 0.06);
  const rod = mkCylX(0.2, 0.22, 9.2, VSS_STAINLESS, 0.1, 0, 0, 18);
  const collar = mkCylX(0.38, 0.38, 0.45, VSS_BLUED_STEEL, 4.55, 0, 0, 18);
  return sanitizeVssMesh(mergeParts([rearLug, rod, collar]));
}

/** S-07: Dynamic Helical X-Axis Recoil Return Spring (`aSpringParam` w=1!) */
export function buildVssRecoilSpringGeometry(): THREE.BufferGeometry {
  // Local origin at [-6.4, 2.28, 0], pinned at start = -5.0 (world X = -11.4), front at +6.2 (world X = -0.2)
  const spring = createHelicalSpring({
    axis: 'x',
    start: -5.0,
    end: 6.2,
    coilRadius: 0.3,
    wireRadius: 0.062,
    coils: 22,
    radialSegments: 8,
    stepsPerCoil: 14,
  });
  paintGeometry(spring, VSS_SPRING_STEEL);
  return sanitizeVssMesh(spring);
}

// ============================================================================
// 2. FRAME, INTEGRAL SUPPRESSOR, LAMINATED STOCK & PSO-1 OPTIC (7 parts)
// ============================================================================

/** F-01: CNC-Milled Blued-Steel Receiver, Dovetail Rail & Solid Welded Trigger Guard */
export function buildVssReceiverGeometry(): THREE.BufferGeometry {
  // World/local origin at [0, 0, 0] -> X in [-12.2, +6.2], Y in [-5.15, +1.95], Z in [-2.18, +1.68]
  const mainBody = mkBox(18.4, 4.05, 3.24, VSS_BLUED_STEEL, -3.0, -0.075, 0, 0.1);
  // Left-side Warsaw Pact dovetail optic rail
  const doveRail = mkBox(11.0, 1.5, 0.62, VSS_BLUED_STEEL, -5.1, 0.6, -1.87, 0.06);
  // Solid welded closed-loop trigger guard (ZERO air gaps front & rear!)
  const tgFront = mkBox(0.85, 3.1, 1.32, VSS_BLUED_STEEL, -2.35, -3.55, 0, 0.06);
  const tgBottom = mkBox(8.4, 0.48, 1.32, VSS_BLUED_STEEL, -6.35, -4.91, 0, 0.06);
  const tgRear = mkBox(0.9, 3.1, 1.32, VSS_BLUED_STEEL, -10.15, -3.55, 0, 0.06);
  // Mag release paddle
  const magLatch = mkBox(0.6, 1.75, 1.15, VSS_BLUED_STEEL, -2.0, -2.95, 0, 0.05);
  const merged = mergeParts(
    [mainBody, doveRail, tgFront, tgBottom, tgRear, magLatch],
    0
  );

  // Hollow interior bolt/FCG cavity + bottom magwell + front bore port
  const cavity = mkBox(16.8, 3.6, 2.48, VSS_BLUED_STEEL, -3.0, 0.25, 0, 0.04);
  const magwell = mkBox(6.1, 2.4, 2.46, VSS_BLUED_STEEL, 1.2, -1.6, 0, 0.04);
  const boreHole = mkCylX(0.82, 0.82, 3.0, VSS_BLUED_STEEL, 5.4, VSS_BORE_Y, 0, 20);
  const res = csgSubtract(merged, [cavity, magwell, boreHole]);
  return sanitizeVssMesh(res);
}

/** F-02: Stamped Ribbed Blued-Steel Top Dust Cover */
export function buildVssDustCoverGeometry(): THREE.BufferGeometry {
  // Local origin at [-3.0, 2.25, 0] -> X in [-9.15, +9.05], Y in [-0.85, +0.96], Z in [-1.62, +1.62]
  const arch = mkBox(18.2, 1.8, 3.24, VSS_BLUED_STEEL, -0.05, 0.05, 0, 0.24);
  const rib1 = mkBox(0.65, 0.22, 3.3, VSS_BLUED_STEEL, -6.2, 0.82, 0, 0.04);
  const rib2 = mkBox(0.65, 0.22, 3.3, VSS_BLUED_STEEL, -4.4, 0.82, 0, 0.04);
  const rib3 = mkBox(0.65, 0.22, 3.3, VSS_BLUED_STEEL, -2.6, 0.82, 0, 0.04);
  const shell = mergeParts([arch, rib1, rib2, rib3], 0);
  const inner = mkBox(17.6, 1.68, 2.86, VSS_BLUED_STEEL, -0.05, -0.14, 0, 0.16);
  const ejectPort = mkBox(5.8, 1.2, 1.4, VSS_BLUED_STEEL, 4.6, -0.25, 1.2, 0.04);
  const res = csgSubtract(shell, [inner, ejectPort]);
  return sanitizeVssMesh(res);
}

/** F-03: Full-Length Cylindrical Integral Suppressor Tube + Front Sight Hood */
export function buildVssSuppressorTubeGeometry(): THREE.BufferGeometry {
  // Local origin at [26.7, 1.35, 0] -> local X in [-20.7, +20.7]
  const tube = mkCylX(1.86, 1.86, 41.4, VSS_SUPP_STEEL, 0, 0, 0, 36);
  const lockCollar = mkCylX(1.98, 1.98, 1.6, VSS_BLUED_STEEL, -19.9, 0, 0, 32);
  // Rear tangent sight mounting pedestal on suppressor top
  const rearBase = mkBox(5.6, 0.72, 1.45, VSS_BLUED_STEEL, -10.5, 2.02, 0, 0.06);
  // Welded hooded front sight tower near muzzle
  const fsBase = mkBox(2.0, 1.2, 1.22, VSS_BLUED_STEEL, 18.4, 2.25, 0, 0.06);
  const fsHoodL = mkBox(1.4, 1.05, 0.22, VSS_BLUED_STEEL, 18.4, 3.02, -0.52, 0.04);
  const fsHoodR = mkBox(1.4, 1.05, 0.22, VSS_BLUED_STEEL, 18.4, 3.02, 0.52, 0.04);
  const fsPost = mkCylY(0.09, 0.11, 0.92, VSS_BLUED_STEEL, 18.4, 2.95, 0, 12);
  const merged = mergeParts(
    [tube, lockCollar, rearBase, fsBase, fsHoodL, fsHoodR, fsPost],
    0
  );
  // Hollow expansion cylinder + concentric muzzle bullet aperture
  const innerTube = mkCylX(1.68, 1.68, 40.6, VSS_SUPP_STEEL, -0.4, 0, 0, 28);
  const exitHole = mkCylX(0.56, 0.56, 2.2, VSS_SUPP_STEEL, 20.3, -0.3, 0, 18);
  const res = csgSubtract(merged, [innerTube, exitHole]);
  return sanitizeVssMesh(res);
}

/** F-04: 400m Tangent Leaf Rear Sight Mounted on Integral Suppressor */
export function buildVssRearSightGeometry(): THREE.BufferGeometry {
  // Local origin at [16.2, 3.65, 0]
  const base = mkBox(6.2, 0.55, 1.38, VSS_BLUED_STEEL, 0, -0.14, 0, 0.05);
  const leaf = mkBox(5.4, 0.36, 1.05, VSS_BLUED_STEEL, -0.2, 0.32, 0, 0.04);
  const slider = mkBox(1.15, 0.56, 1.62, VSS_BLUED_STEEL, 0.6, 0.34, 0, 0.05);
  return sanitizeVssMesh(mergeParts([base, leaf, slider]));
}

/** F-05: Dark Plum-Brown Ribbed Polymer Lower Forend / Handguard */
export function buildVssForendGeometry(): THREE.BufferGeometry {
  // Local origin at [12.6, -0.35, 0] -> local X in [-6.6, +6.6]
  const body = mkBox(13.2, 2.95, 3.96, VSS_PLUM_POLYMER, 0, -0.1, 0, 0.24);
  const ribs: THREE.BufferGeometry[] = [body];
  for (let i = 0; i < 6; i++) {
    const rx = -4.5 + i * 1.8;
    ribs.push(mkBox(0.42, 2.1, 4.04, VSS_PLUM_RIB, rx, -0.32, 0, 0.04));
  }
  const merged = mergeParts(ribs, 0);
  // Saddle cutout cradling suppressor tube centered at world Y = 1.35 (local Y = +1.70)
  const saddle = mkCylX(1.89, 1.89, 14.2, VSS_PLUM_POLYMER, 0, 1.7, 0, 28);
  const res = csgSubtract(merged, [saddle]);
  return sanitizeVssMesh(res);
}

/** F-06: Russian Laminated Birchwood Skeleton Thumbhole Buttstock + Rubber Buttpad */
export function buildVssWoodStockGeometry(): THREE.BufferGeometry {
  // Local origin at [-26.8, -4.6, 0] -> local X in [-15.2, +15.2], Y in [-5.9, +5.45]
  // Build authentic open thumbhole skeleton profile via outer beams + buttpad + steel QD lug!
  const upperComb = mkExtrudeZ(
    [
      [-13.8, 3.55],
      [14.6, 3.25],
      [14.6, 5.05],
      [11.0, 5.1],
      [-13.8, 5.15],
    ],
    3.1,
    0,
    VSS_BIRCH_LAMINATE,
    0.16
  );
  const lowerBeam = mkExtrudeZ(
    [
      [-13.8, -5.75],
      [9.4, -5.45],
      [8.8, -3.95],
      [-13.8, -3.95],
    ],
    3.0,
    0,
    VSS_BIRCH_LAMINATE,
    0.16
  );
  const pistolGrip = mkExtrudeZ(
    [
      [8.6, -5.45],
      [12.2, -5.45],
      [14.6, 3.6],
      [10.8, 3.6],
    ],
    3.05,
    0,
    VSS_BIRCH_LAMINATE,
    0.18
  );
  const rearButtColumn = mkBox(
    4.2,
    10.85,
    3.25,
    VSS_BIRCH_LAMINATE,
    -11.7,
    -0.3,
    0,
    0.18
  );
  // Ribbed black rubber recoil buttpad
  const buttpad = mkBox(1.45, 11.2, 3.56, VSS_RUBBER_PAD, -14.48, -0.32, 0, 0.14);
  // Steel QD receiver locking lug mating flush into receiver rear
  const qdLug = mkBox(1.15, 2.95, 2.75, VSS_BLUED_STEEL, 14.62, 3.92, 0, 0.08);
  return sanitizeVssMesh(
    mergeParts([
      upperComb,
      lowerBeam,
      pistolGrip,
      rearButtColumn,
      buttpad,
      qdLug,
    ])
  );
}

/** F-07: Soviet PSO-1M2-1 4×24 Illuminated Side-Mount Sniper Scope */
export function buildVssPso1ScopeGeometry(): THREE.BufferGeometry {
  // Local origin at [-4.5, 6.15, -0.35] -> X in [-17.0, +17.0], Y in [-6.45, +2.65], Z in [-2.25, +2.65]
  const mainTube = mkCylX(1.22, 1.22, 18.0, VSS_PSO1_GREY, 0.5, 0, 0, 28);
  const objBell = mkCylX(1.62, 1.28, 7.6, VSS_PSO1_GREY, 13.2, 0, 0, 28);
  const ocular = mkCylX(1.26, 1.46, 4.4, VSS_PSO1_GREY, -6.9, 0, 0, 28);
  // Accordion rubber eyecup (-X)
  const eyecup = mkCylX(1.36, 1.55, 7.8, VSS_RUBBER_PAD, -13.0, 0, 0, 24);
  // Emerald-sapphire objective & ocular lenses
  const objLens = mkCylX(1.44, 1.44, 0.25, VSS_LENS_EMERALD, 15.2, 0, 0, 24);
  const ocLens = mkCylX(1.24, 1.24, 0.25, VSS_LENS_EMERALD, -9.05, 0, 0, 24);
  // Top BDC 1..4 elevation drum + right windage turret
  const elevDrum = mkCylY(0.95, 0.98, 1.45, VSS_PSO1_GREY, 0.3, 1.9, 0, 24);
  const windDrum = mkCylZ(0.75, 0.78, 1.35, VSS_PSO1_GREY, 0.3, 0, 1.85, 20);
  // Left AA battery tube
  const battTube = mkCylY(0.52, 0.52, 2.2, VSS_PSO1_GREY, 3.8, -1.6, -1.15, 16);
  // Integral Warsaw Pact side-mount stanchion + bottom dovetail clamp arm reaching world Y=-0.25, Z=-2.18
  const upperBridge = mkBox(9.8, 1.45, 2.35, VSS_PSO1_GREY, -0.6, -1.5, -0.75, 0.08);
  const sideArm = mkBox(9.6, 4.9, 0.85, VSS_PSO1_GREY, -0.6, -3.9, -1.78, 0.08);
  const clampJaw = mkBox(10.6, 1.65, 1.12, VSS_BLUED_STEEL, -0.6, -5.6, -1.68, 0.06);
  return sanitizeVssMesh(
    mergeParts([
      mainTube,
      objBell,
      ocular,
      eyecup,
      objLens,
      ocLens,
      elevDrum,
      windDrum,
      battTube,
      upperBridge,
      sideArm,
      clampJaw,
    ])
  );
}

// ============================================================================
// 3. LINEAR STRIKER FIRE CONTROL GROUP (6 parts)
// ============================================================================

/** FC-01: Linear Rear Spring-Driven Firing Striker (Signature Hammerless Design!) */
export function buildVssStrikerGeometry(): THREE.BufferGeometry {
  // Local origin at [-6.4, 0.95, 0] -> local X in [-3.2, +3.3]
  const sleeve = mkCylX(0.56, 0.58, 6.4, VSS_STAINLESS, 0.05, 0, 0, 24);
  const searLug = mkBox(1.7, 0.62, 0.68, VSS_STAINLESS, -0.3, -0.61, 0, 0.05);
  const guideRail = mkBox(4.8, 0.34, 1.2, VSS_BLUED_STEEL, -0.2, 0.1, 0, 0.04);
  return sanitizeVssMesh(mergeParts([sleeve, searLug, guideRail]));
}

/** FC-02: Dynamic Helical X-Axis Linear Striker Main Spring (`aSpringParam` w=1!) */
export function buildVssStrikerSpringGeometry(): THREE.BufferGeometry {
  // Local origin at [-9.2, 0.95, 0], pinned at start = -2.4 (world X = -11.6), front at +2.4 (world X = -6.8)
  const spring = createHelicalSpring({
    axis: 'x',
    start: -2.4,
    end: 2.4,
    coilRadius: 0.28,
    wireRadius: 0.06,
    coils: 12,
    radialSegments: 8,
    stepsPerCoil: 14,
  });
  paintGeometry(spring, VSS_SPRING_STEEL);
  return sanitizeVssMesh(spring);
}

/** FC-03: Curved Steel Trigger & Transfer Linkage */
export function buildVssTriggerGeometry(): THREE.BufferGeometry {
  // Local origin at [-5.6, -2.55, 0]
  const yoke = mkBox(3.4, 1.25, 0.98, VSS_BLUED_STEEL, 0.15, 0.98, 0, 0.06);
  const shoe = mkExtrudeZ(
    [
      [-0.4, 0.45],
      [0.45, 0.45],
      [0.15, -1.05],
      [0.75, -2.02],
      [0.25, -2.05],
      [-0.55, -1.05],
    ],
    0.58,
    0,
    VSS_BLUED_STEEL,
    0.05
  );
  return sanitizeVssMesh(mergeParts([yoke, shoe]));
}

/** FC-04: Linear Striker Catch Sear & Disconnector */
export function buildVssSearGeometry(): THREE.BufferGeometry {
  // Local origin at [-6.4, -0.75, 0]
  const bar = mkBox(4.9, 0.82, 1.18, VSS_STAINLESS, -0.1, -0.12, 0, 0.06);
  const catchHook = mkBox(1.15, 0.85, 0.85, VSS_STAINLESS, -0.3, 0.42, 0, 0.05);
  const autoTrip = mkBox(0.9, 0.72, 0.56, VSS_BLUED_STEEL, 1.75, 0.35, 0.32, 0.04);
  return sanitizeVssMesh(mergeParts([bar, catchHook, autoTrip]));
}

/** FC-05: AK-Style Stamped Right-Side Dust-Cover Safety Flap */
export function buildVssSafetyLeverGeometry(): THREE.BufferGeometry {
  // Local origin at [-5.0, 0.85, 1.82]
  const pivot = mkCylZ(0.62, 0.62, 0.52, VSS_BLUED_STEEL, -3.7, -0.05, -0.02, 20);
  const bar = mkBox(11.6, 1.12, 0.24, VSS_BLUED_STEEL, 1.3, 0.12, 0.06, 0.04);
  const fingerTab = mkBox(1.5, 0.72, 0.56, VSS_BLUED_STEEL, 6.65, 0.15, 0.16, 0.05);
  return sanitizeVssMesh(mergeParts([pivot, bar, fingerTab]));
}

/** FC-06: Cross-Bolt Semi/Full-Auto Fire Selector Button (`1 / АВ`) */
export function buildVssSelectorSwitchGeometry(): THREE.BufferGeometry {
  // Local origin at [-8.2, -2.55, 0] -> spans trigger guard behind trigger
  const shaft = mkCylZ(0.38, 0.38, 2.8, VSS_BLUED_STEEL, 0, 0, 0, 18);
  const btnL = mkCylZ(0.54, 0.54, 0.45, VSS_STAINLESS, 0, 0, -1.52, 20);
  const btnR = mkCylZ(0.54, 0.54, 0.45, VSS_STAINLESS, 0, 0, 1.52, 20);
  return sanitizeVssMesh(mergeParts([shaft, btnL, btnR]));
}

// ============================================================================
// 4. 10-ROUND 9×39mm PLUM WAFFLE MAGAZINE GROUP (4 parts)
// ============================================================================

/** M-01: 10-Round Dark Plum-Brown Waffle-Ribbed Polymer Curved Magazine Body */
export function buildVssMagBodyGeometry(): THREE.BufferGeometry {
  // Local origin at [1.4, -6.8, 0] -> gently curved forward (+7°)
  const outerShell = mkExtrudeZ(
    [
      [-2.85, 5.82],
      [3.12, 5.82],
      [3.42, -5.72],
      [-2.48, -5.72],
    ],
    2.36,
    0,
    VSS_PLUM_POLYMER,
    0.1
  );
  const ribs: THREE.BufferGeometry[] = [outerShell];
  // Raised Soviet waffle ribs along magazine sides
  for (let i = 0; i < 4; i++) {
    const ry = -3.8 + i * 2.35;
    ribs.push(mkBox(5.55, 0.24, 2.44, VSS_PLUM_RIB, 0.35, ry, 0, 0.03));
  }
  const merged = mergeParts(ribs, 0);
  const cavity = mkExtrudeZ(
    [
      [-2.42, 6.0],
      [2.68, 6.0],
      [2.98, -5.9],
      [-2.05, -5.9],
    ],
    1.88,
    0,
    VSS_PLUM_POLYMER,
    0.04
  );
  const res = csgSubtract(merged, [cavity]);
  return sanitizeVssMesh(res);
}

/** M-02: High-Visibility Safety-Orange Anti-Tilt 9×39mm Follower */
export function buildVssMagFollowerGeometry(): THREE.BufferGeometry {
  // Local origin at [1.55, -8.95, 0] -> top deck sits at world Y = -8.45 cleanly below 10th round!
  const skirt = mkBox(4.7, 0.85, 1.72, VSS_FOLLOWER_ORANGE, 0.05, -0.1, 0, 0.08);
  const step = mkBox(4.45, 0.35, 0.82, VSS_FOLLOWER_ORANGE, 0.08, 0.32, -0.42, 0.06);
  return sanitizeVssMesh(mergeParts([skirt, step]));
}

/** M-03: Static Zig-Zag Steel Magazine Drive Spring (in `vss_v3_metal` GLB!) */
export function buildVssMagSpringGeometry(): THREE.BufferGeometry {
  // Local origin at [1.78, -10.90, 0] -> spans world Y in [-12.32, -9.48] cleanly between floorplate & follower!
  const spring = createRectangularMagSpring({
    height: 2.72,
    widthX: 3.9,
    depthZ: 1.24,
    wireRadius: 0.065,
    coils: 6,
  });
  paintGeometry(spring, VSS_SPRING_STEEL);
  // Static solid spring (NOT in dynamicSpringParts) — remove dynamic attribute so it renders rigidly!
  if (spring.getAttribute(SPRING_PARAM_ATTRIBUTE)) {
    spring.deleteAttribute(SPRING_PARAM_ATTRIBUTE);
  }
  return sanitizeVssMesh(spring);
}

/** M-04: Stamped Blued-Steel Magazine Floorplate */
export function buildVssMagFloorplateGeometry(): THREE.BufferGeometry {
  // Local origin at [1.92, -12.60, 0]
  const plate = mkBox(6.2, 0.62, 2.6, VSS_BLUED_STEEL, 0.12, -0.05, 0, 0.08);
  const detent = mkCylY(0.32, 0.32, 0.25, VSS_STAINLESS, 0.2, -0.28, 0, 14);
  return sanitizeVssMesh(mergeParts([plate, detent]));
}
