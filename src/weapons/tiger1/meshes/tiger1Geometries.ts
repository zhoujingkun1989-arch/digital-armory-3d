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
// WWII Panzerkampfwagen VI Tiger I Ausf. E — "Tiger 131" (88mm KwK 36 L/56)
// True 1:1 Real-World CAD Constants (1 world unit = 1 cm = 10 mm)
// +X Front/Muzzle · +Y Up · +Z Right Flank · Ground/Track Contact Y = -120.0 cm
// ============================================================================

export const TIGER_TRACK_GROUND_Y = -120.0;
export const TIGER_TURRET_CENTER_X = 18.0;
export const TIGER_BORE_Y = 102.0;
export const TIGER_MUZZLE_X = 529.0;
export const TIGER_CHAMBER_X = 60.0;
export const TIGER_RECOIL_STROKE = 29.0;
export const TIGER_BREECH_WEDGE_DZ = -16.0;

/** 8 torsion-bar road wheel X stations per side (58 cm pitch < 80 cm wheel OD -> authentic overlapping Schachtellaufwerk!). */
export const TIGER_WHEEL_X_STATIONS = [
  -212, -154, -96, -38, 20, 78, 136, 194,
] as const;

/** Spring wire radii (true 1:1 tank scale, calibrated within csgBuilder MAX_WIRE_HALF_SPAN = 2.5 cm). */
export const TIGER_RECOIL_SPRING_WIRE_R = 1.25;
export const TIGER_BREECH_SPRING_WIRE_R = 0.85;

// Physically calibrated WWII German ordnance palette (linear luminance >> 0.018 Khronos floor)
export const TIGER_DUNKELGELB = '#948259'; // RAL 7028 Dunkelgelb 1943
export const TIGER_OLIVGRUEN = '#5c6644'; // RAL 6003 Olivgruen ambush streak
export const TIGER_ROTBRAUN = '#6e4736'; // RAL 8017 Rotbraun ambush streak
export const TIGER_ELFENBEIN = '#c4bfaa'; // RAL 1001 Interior Ivory Cream
export const TIGER_RED_OXIDE = '#723b31'; // RAL 8012 Red Oxide primer / floor
export const TIGER_GUN_STEEL = '#4b5059'; // Krupp 88mm KwK 36 barrel steel
export const TIGER_MUZZLE_SOOT = '#3a3e45'; // Blast carbon & heat temper
export const TIGER_KRUPP_BREECH = '#7d8691'; // Milled steel Krupp breech ring
export const TIGER_CHROME_ROD = '#cbd5e1'; // Hydraulic recoil rod chrome
export const TIGER_RUBBER_TIRE = '#3b3e42'; // Vulcanized road wheel rubber
export const TIGER_TRACK_STEEL = '#595550'; // Cast Kgs 63/725/130 track steel
export const TIGER_RUST_EXHAUST = '#874a30'; // Heat-oxidized cast-iron exhaust
export const TIGER_MAYBACH_BLOCK = '#575f68'; // Cast-iron Maybach HL230 V12
export const TIGER_ALUM_RAD = '#b8c0c8'; // Aluminum radiator & carburetors
export const TIGER_GEARBOX_CAST = '#747c86'; // Olvar 8-speed gearbox housing
export const TIGER_BRASS_88MM = '#d9ac43'; // 88x571mmR C26000 cartridge brass
export const TIGER_APCBC_BLACK = '#3c4047'; // PzGr. 39 ballistic-cap steel nose
export const TIGER_COPPER_BAND = '#c9743f'; // Driving band / copper fuel line
export const TIGER_SAPPHIRE_LENS = '#248fe0'; // TZF 9b multi-coated optic glass
export const TIGER_SPRING_STEEL = '#94a3b8'; // Forged coil spring steel
export const TIGER_LEATHER_SEAT = '#66402e'; // Crew station leather cushion

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
 * Strips degenerate sliver triangles, enforces outward winding (`signedVolume > 0`),
 * preserves `aCurvature` & `aSpringParam`, guarantees unit-length normals, and
 * generates clean [0.04, 0.96] triplanar-box UVs for CSG fallback & contract parity.
 */
export function sanitizeTiger1Mesh(
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
        cArr[di * 3 + 1] = col ? col.getY(si) : 0.42;
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.32;
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
// Primitive Helpers
// ============================================================================

function boxAt(
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  color: string,
  chamfer = 0.6
): THREE.BufferGeometry {
  const c = Math.min(chamfer, Math.min(sx, sy, sz) * 0.18);
  const g = createChamferedBox(sx, sy, sz, c, color);
  g.translate(x, y, z);
  return g;
}

function cylX(
  rTop: number,
  rBot: number,
  length: number,
  x: number,
  y: number,
  z: number,
  color: string,
  segs = 20,
  bevel = 0.4
): THREE.BufferGeometry {
  const b = Math.min(bevel, Math.min(rTop, rBot) * 0.25, length * 0.2);
  const g = createBeveledCylinder(rTop, rBot, length, b, segs, color);
  g.rotateZ(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function cylY(
  rTop: number,
  rBot: number,
  length: number,
  x: number,
  y: number,
  z: number,
  color: string,
  segs = 20,
  bevel = 0.4
): THREE.BufferGeometry {
  const b = Math.min(bevel, Math.min(rTop, rBot) * 0.25, length * 0.2);
  const g = createBeveledCylinder(rTop, rBot, length, b, segs, color);
  g.translate(x, y, z);
  return g;
}

function cylZ(
  rTop: number,
  rBot: number,
  length: number,
  x: number,
  y: number,
  z: number,
  color: string,
  segs = 20,
  bevel = 0.4
): THREE.BufferGeometry {
  const b = Math.min(bevel, Math.min(rTop, rBot) * 0.25, length * 0.2);
  const g = createBeveledCylinder(rTop, rBot, length, b, segs, color);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function build88mmCartridge(
  xCenter: number,
  yCenter: number,
  zCenter: number,
  segs = 14
): THREE.BufferGeometry[] {
  // 88x571mmR PzGr. 39 complete round: 92.0 cm total length (local X in [-46, +46])
  return [
    // Flanged rim (11.2 cm dia)
    cylX(5.6, 5.6, 1.8, xCenter - 45.1, yCenter, zCenter, TIGER_BRASS_88MM, segs, 0.2),
    // Tapered C26000 brass case (57.1 cm)
    cylX(4.8, 5.2, 55.4, xCenter - 16.5, yCenter, zCenter, TIGER_BRASS_88MM, segs, 0.25),
    // Copper driving band
    cylX(4.45, 4.45, 2.2, xCenter + 12.2, yCenter, zCenter, TIGER_COPPER_BAND, segs, 0.15),
    // Cylindrical steel APCBC body
    cylX(4.4, 4.4, 15.0, xCenter + 20.8, yCenter, zCenter, TIGER_APCBC_BLACK, segs, 0.2),
    // Ogive ballistic cap nose
    cylX(2.4, 4.4, 11.5, xCenter + 34.0, yCenter, zCenter, TIGER_APCBC_BLACK, segs, 0.2),
    cylX(0.55, 2.4, 6.2, xCenter + 42.9, yCenter, zCenter, TIGER_APCBC_BLACK, segs, 0.15),
  ];
}

// ============================================================================
// DYNAMIC aSpringParam CSG SPRINGS (2 Parts — Kept on CSG Track)
// ============================================================================

/** 1. Twin heavy X-axis helical recuperator coils compressing via scaleX during -29 cm recoil. */
export function buildTigerRecoilSpringsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const yOff of [-15.0, 15.0]) {
    const coil = createHelicalSpring({
      axis: 'x',
      start: -34.0,
      end: 34.0,
      centerY: yOff,
      centerZ: 0.0,
      coilRadius: 5.2,
      wireRadius: TIGER_RECOIL_SPRING_WIRE_R,
      coils: 11,
      radialSegments: 10,
      stepsPerCoil: 16,
    });
    paintGeometry(coil, TIGER_SPRING_STEEL);
    parts.push(coil);
  }
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 2. Heavy X-axis semi-automatic Krupp breech closing spring flexing during sliding-wedge ejection. */
export function buildTigerBreechSpringGeometry(): THREE.BufferGeometry {
  const coil = createHelicalSpring({
    axis: 'x',
    start: -18.0,
    end: 18.0,
    centerY: 0.0,
    centerZ: 0.0,
    coilRadius: 3.3,
    wireRadius: TIGER_BREECH_SPRING_WIRE_R,
    coils: 9,
    radialSegments: 10,
    stepsPerCoil: 16,
  });
  paintGeometry(coil, TIGER_SPRING_STEEL);
  return sanitizeTiger1Mesh(coil);
}

// ============================================================================
// SUITE 1: tiger1_v3_hull_zimmerit (8 Solid Parts)
// ============================================================================

/** 3. True Hollow Iconic Boxy 100mm Vertical-Glacis Tiger I Ausf. E Armored Hull (`isShell: true`). */
export function buildTigerHullBoxGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Bottom belly armor plate (Y in [-73, -67], X in [-302, +264], Z in [-104, +104])
  parts.push(boxAt(566, 6, 208, -19, -70, 0, TIGER_RED_OXIDE, 0.8));

  // Lower hull side walls (left & right, 8 cm thick, Y in [-67, -16], Z = +/-100)
  for (const sz of [-1, 1]) {
    parts.push(boxAt(580, 51, 8, -12, -41.5, sz * 100, TIGER_DUNKELGELB, 0.8));
    // Sponson underside shelf bridging |Z| = 104..162 at Y in [-18, -12]
    parts.push(boxAt(592, 6, 58, -10, -15, sz * 133, TIGER_DUNKELGELB, 0.7));
    // Upper iconic vertical 82mm hull flank armor (10 cm thick, Y in [-12, +52], Z = +/-157)
    parts.push(boxAt(596, 64, 10, -8, 20, sz * 157, TIGER_DUNKELGELB, 1.0));
  }

  // Front lower glacis nose beak (sloped plate from X=+260,Y=-73 up to X=+316,Y=-20)
  const lowGlacis = createChamferedBox(74, 10, 208, 0.8, TIGER_DUNKELGELB);
  lowGlacis.rotateZ(0.74);
  lowGlacis.translate(285, -43.5, 0);
  parts.push(lowGlacis);

  // Sloped upper glacis deck above Olvar transmission (X=+316,Y=-20 back to X=+206,Y=+8)
  const upGlacis = createChamferedBox(112, 10, 322, 0.8, TIGER_DUNKELGELB);
  upGlacis.rotateZ(-0.245);
  upGlacis.translate(259, -6, 0);
  parts.push(upGlacis);

  // Iconic Vertical 100mm Driver's Front Superstructure Plate (X in [+202, +212], Y in [+8, +52], Z in [-162, +162])
  parts.push(boxAt(10, 44, 324, 207, 30, 0, TIGER_DUNKELGELB, 1.0));
  // Driver's armored visor slit hood (left, Z = -58)
  parts.push(boxAt(12, 14, 34, 215, 31, -58, TIGER_DUNKELGELB, 0.8));
  // Kugelblende 80 ball-mount hull MG 34 (right, Z = +58)
  parts.push(cylX(9.5, 11.0, 12, 216, 30, 58, TIGER_GUN_STEEL, 16, 0.5));
  parts.push(cylX(1.8, 2.2, 30, 232, 30, 58, TIGER_GUN_STEEL, 12, 0.2));

  // Rear 82mm hull armored plate (X in [-306, -296], Y in [-68, +52], Z in [-162, +162])
  parts.push(boxAt(10, 120, 324, -301, -8, 0, TIGER_DUNKELGELB, 1.0));
  // Rear internal engine firewall separating fighting compartment from Maybach V12
  parts.push(boxAt(6, 104, 200, -108, -14, 0, TIGER_ELFENBEIN, 0.6));

  // Hull roof plate (hollow around turret ring R=94 at X=+18 and rear engine deck cutout X in [-296,-112])
  // Forward driver/bow roof deck (X in [+116, +210], Y in [+46, +52], Z in [-162, +162])
  parts.push(boxAt(94, 6, 324, 163, 49, 0, TIGER_DUNKELGELB, 0.8));
  // Left & right turret-flank roof strips (X in [-112, +116], |Z| in [96, 162])
  for (const sz of [-1, 1]) {
    parts.push(boxAt(228, 6, 66, 2, 49, sz * 129, TIGER_DUNKELGELB, 0.8));
  }
  // Rear roof cross-beam behind turret ring (X in [-112, -80], Z in [-96, +96])
  parts.push(boxAt(32, 6, 192, -96, 49, 0, TIGER_DUNKELGELB, 0.8));
  // Front Bosch blackout headlights & heavy front tow shackles
  for (const sz of [-1, 1]) {
    parts.push(cylX(6.5, 6.5, 12, 238, 12, sz * 120, TIGER_DUNKELGELB, 14, 0.5));
    parts.push(boxAt(14, 14, 8, 309, -22, sz * 96, TIGER_TRACK_STEEL, 0.5));
  }
  // Rear tow pintle & shackles
  parts.push(boxAt(14, 14, 22, -309, -24, 0, TIGER_TRACK_STEEL, 0.6));

  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 4. Hinged Sheet-Metal Side Track Fenders & Front Armored Mudflaps (`isShell: true`). */
export function buildTigerSideFendersGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sz of [-1, 1]) {
    // 5 hinged outer mudguard skirt panels along |Z| in [162, 178]
    for (let i = 0; i < 5; i++) {
      const xC = -236 + i * 118;
      parts.push(boxAt(114, 4, 16, xC, -2, sz * 170, TIGER_DUNKELGELB, 0.4));
      parts.push(boxAt(114, 14, 3, xC, -8, sz * 176.5, TIGER_DUNKELGELB, 0.3));
    }
    // Iconic angled front armored mudflaps overhanging front drive sprockets
    parts.push(boxAt(38, 18, 72, 287, -2, sz * 141, TIGER_DUNKELGELB, 0.5));
    // Rear mudflaps
    parts.push(boxAt(26, 16, 70, -293, -3, sz * 141, TIGER_DUNKELGELB, 0.5));
  }
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 5. Iconic Overlapping Interleaved Road Wheels (Schachtellaufwerk) + Front Drive Sprockets + Rear Idlers. */
export function buildTigerInterleavedWheelsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (const sz of [-1, 1]) {
    // Massive front toothed drive sprocket (X=+262, Y=+28 local -> world Y=-48, R=42)
    parts.push(cylZ(39, 39, 12, 262, 28, sz * 162, TIGER_DUNKELGELB, 20, 0.8));
    parts.push(cylZ(39, 39, 12, 262, 28, sz * 119, TIGER_DUNKELGELB, 20, 0.8));
    parts.push(cylZ(22, 22, 54, 262, 28, sz * 136, TIGER_TRACK_STEEL, 16, 0.6));
    // Rear idler wheel (X=-278, Y=+24 local -> world Y=-52, R=32)
    parts.push(cylZ(32, 32, 11, -278, 24, sz * 154, TIGER_DUNKELGELB, 20, 0.7));
    parts.push(cylZ(32, 32, 11, -278, 24, sz * 126, TIGER_DUNKELGELB, 20, 0.7));
    parts.push(cylZ(16, 16, 40, -278, 24, sz * 136, TIGER_TRACK_STEEL, 14, 0.5));

    // Authentic 3-row overlapping Schachtellaufwerk road wheels (8 stations, R=40 cm, 58 cm pitch!)
    for (let i = 0; i < TIGER_WHEEL_X_STATIONS.length; i++) {
      const wx = TIGER_WHEEL_X_STATIONS[i];
      const isOuterStation = i % 2 === 1;
      const zRows = isOuterStation ? [162.5, 114.5] : [148.5, 128.5];
      for (const zr of zRows) {
        // Outer vulcanized rubber tire (R = 40.0 cm)
        parts.push(cylZ(40.0, 40.0, 11.0, wx, 0, sz * zr, TIGER_RUBBER_TIRE, 20, 0.7));
        // Dunkelgelb dished steel road wheel disc (R = 33.0 cm)
        parts.push(cylZ(33.0, 33.0, 12.2, wx, 0, sz * zr, TIGER_DUNKELGELB, 18, 0.6));
      }
      // Armored center hub cap
      parts.push(
        cylZ(
          9.5,
          10.5,
          isOuterStation ? 62 : 44,
          wx,
          0,
          sz * (isOuterStation ? 139 : 138.5),
          TIGER_TRACK_STEEL,
          12,
          0.5
        )
      );
    }
  }
  return sanitizeTiger1Mesh(mergeParts(parts));
}

function buildTrackBeltGeometry(): THREE.BufferGeometry {
  // Ultra-wide 725 mm (72.5 cm) Kgs 63/725/130 cast-steel combat track belt
  // Local origin at [0, -63, +/-140.75] -> bottom at Y_local = -57.0 (world Y = -120.0 cm!)
  const parts: THREE.BufferGeometry[] = [];
  const W = 72.5;
  const T = 4.6;

  // Flat ground-contact bottom run (X in [-214, +196], Y_local = -54.7 -> bottom -57.0)
  parts.push(boxAt(416, T, W, -9, -54.7, 0, TIGER_TRACK_STEEL, 0.4));
  // Top sagged return run (X in [-278, +264], Y_local = +51.5 -> top +53.8, world Y = -9.2)
  parts.push(boxAt(544, T, W, -7, 51.5, 0, TIGER_TRACK_STEEL, 0.4));

  // Front wrap around drive sprocket (X=+262, Y_local=+15, R=44 -> reaches X=+309)
  const frontArc = createBeveledCylinder(44.5, 44.5, W, 0.5, 22, TIGER_TRACK_STEEL);
  frontArc.rotateX(Math.PI / 2);
  frontArc.translate(262, 15, 0);
  const frontHole = createBeveledCylinder(38.5, 38.5, W + 4, 0.2, 22, TIGER_TRACK_STEEL);
  frontHole.rotateX(Math.PI / 2);
  frontHole.translate(262, 15, 0);
  const frontCut = boxAt(60, 100, W + 6, 232, 15, 0, TIGER_TRACK_STEEL, 0.2);
  parts.push(csgSubtract(frontArc, [frontHole, frontCut]));
  frontArc.dispose();
  frontHole.dispose();
  frontCut.dispose();

  // Rear wrap around idler (X=-278, Y_local=+11, R=34 -> reaches X=-313)
  const rearArc = createBeveledCylinder(34.5, 34.5, W, 0.5, 20, TIGER_TRACK_STEEL);
  rearArc.rotateX(Math.PI / 2);
  rearArc.translate(-278, 11, 0);
  const rearHole = createBeveledCylinder(28.5, 28.5, W + 4, 0.2, 20, TIGER_TRACK_STEEL);
  rearHole.rotateX(Math.PI / 2);
  rearHole.translate(-278, 11, 0);
  const rearCut = boxAt(55, 90, W + 6, -250, 11, 0, TIGER_TRACK_STEEL, 0.2);
  parts.push(csgSubtract(rearArc, [rearHole, rearCut]));
  rearArc.dispose();
  rearHole.dispose();
  rearCut.dispose();

  // Front angled lower ramp (from [196, -54.7] up to [296, -12])
  const frontSlope = createChamferedBox(108, T, W, 0.4, TIGER_TRACK_STEEL);
  frontSlope.rotateZ(0.41);
  frontSlope.translate(248, -32.2, 0);
  parts.push(frontSlope);

  // Rear angled lower ramp (from [-214, -54.7] up to [-302, -8])
  const rearSlope = createChamferedBox(98, T, W, 0.4, TIGER_TRACK_STEEL);
  rearSlope.rotateZ(-0.49);
  rearSlope.translate(-260, -30.2, 0);
  parts.push(rearSlope);

  // Aggressive grouser cleats along top & bottom runs + central guide horns
  for (let x = -204; x <= 188; x += 28) {
    parts.push(boxAt(6, 2.2, W - 2, x, -55.9, 0, TIGER_TRACK_STEEL, 0.25));
    parts.push(boxAt(6, 2.2, W - 2, x, 54.4, 0, TIGER_TRACK_STEEL, 0.25));
    // Central steel track guide horns straddled by the interleaved wheels
    parts.push(boxAt(8, 7.5, 3.6, x, -48.8, 0, TIGER_TRACK_STEEL, 0.3));
    parts.push(boxAt(8, 7.5, 3.6, x, 45.6, 0, TIGER_TRACK_STEEL, 0.3));
  }

  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 6. Left Ultra-Wide 725 mm Kgs 63/725/130 Cast-Steel Combat Track Belt. */
export function buildTigerTracksLeftGeometry(): THREE.BufferGeometry {
  return buildTrackBeltGeometry();
}

/** 7. Right Ultra-Wide 725 mm Kgs 63/725/130 Combat Track Belt (`isShell: true`). */
export function buildTigerTracksRightGeometry(): THREE.BufferGeometry {
  return buildTrackBeltGeometry();
}

/** 8. Rear Louvered Engine Deck, Twin Feifel Air-Filter Canisters & Dual Armored Rear Exhausts (`isShell: true`). */
export function buildTigerEngineDeckGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [-214, 30, 0] -> world X in [-316, -112], Y in [-22, +62]
  // Central armored Maybach V12 engine access hatch (Y_local = +19 -> world Y = +49)
  parts.push(boxAt(184, 7, 102, 2, 19, 0, TIGER_DUNKELGELB, 0.8));

  // Flanking louvered radiator intake/exhaust grilles (left & right)
  for (const sz of [-1, 1]) {
    parts.push(boxAt(184, 7, 88, 2, 19, sz * 98, TIGER_DUNKELGELB, 0.7));
    for (let lx = -74; lx <= 78; lx += 16) {
      parts.push(boxAt(6, 3.2, 74, lx, 23.2, sz * 98, TIGER_GUN_STEEL, 0.25));
    }
    // Iconic twin rear cylindrical Feifel air-filter canisters (X_local = -94, Y_local = +14, Z = +/-82)
    parts.push(cylY(15.5, 15.5, 34, -92, 14, sz * 82, TIGER_DUNKELGELB, 18, 0.8));
    // Twin corrugated air ducts arching forward into engine deck
    parts.push(cylX(5.2, 5.2, 34, -74, 24, sz * 70, TIGER_GUN_STEEL, 12, 0.3));
    // Dual armored rear exhaust shrouds & rust-heated cast-iron vertical exhaust mufflers (X_local = -94, Z = +/-36)
    parts.push(boxAt(18, 52, 24, -93, -18, sz * 36, TIGER_DUNKELGELB, 0.7));
    parts.push(cylY(8.2, 8.2, 54, -92, -16, sz * 36, TIGER_RUST_EXHAUST, 16, 0.6));
    parts.push(cylY(4.4, 4.4, 16, -92, 16, sz * 36, TIGER_RUST_EXHAUST, 12, 0.3));
  }
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 9. 16 Heavy Transverse Floor Torsion Bars & Swing-Arm Hubs Driving the Schachtellaufwerk. */
export function buildTigerTorsionBarsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [-9, -68, 0] -> world X in [-225, +207], Y in [-84, -52], Z in [-120, +120]
  for (let i = 0; i < TIGER_WHEEL_X_STATIONS.length; i++) {
    const wx = TIGER_WHEEL_X_STATIONS[i] + 9; // local X
    // Twin staggered transverse bars (one anchored left->right, one right->left)
    parts.push(cylZ(2.8, 2.8, 202, wx - 4, 5.5, 0, TIGER_KRUPP_BREECH, 12, 0.2));
    parts.push(cylZ(2.8, 2.8, 202, wx + 4, 5.5, 0, TIGER_KRUPP_BREECH, 12, 0.2));
    for (const sz of [-1, 1]) {
      // Splined external torsion anchor hub & trailing swing-arm crank dropping to Y_local = -8 (world Y = -76)
      parts.push(cylZ(5.5, 5.5, 16, wx, 5.5, sz * 104, TIGER_GUN_STEEL, 12, 0.3));
      const arm = createChamferedBox(18, 6.5, 10, 0.4, TIGER_GUN_STEEL);
      arm.rotateZ(0.68);
      arm.translate(wx - 4, -1.5, sz * 112);
      parts.push(arm);
      parts.push(cylZ(4.8, 4.8, 14, wx - 8, -8, sz * 113, TIGER_CHROME_ROD, 12, 0.3));
    }
  }
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 10. Precision Toothed Steel Turret Traverse Ring & Floor Pinion. */
export function buildTigerTurretRingGeometry(): THREE.BufferGeometry {
  // Local origin [18, 51, 0], outer R = 101, inner R = 90, height = 11
  const outer = createBeveledCylinder(101, 101, 11, 0.8, 36, TIGER_KRUPP_BREECH);
  const inner = createBeveledCylinder(90, 90, 14, 0.3, 36, TIGER_KRUPP_BREECH);
  const ring = csgSubtract(outer, [inner]);
  outer.dispose();
  inner.dispose();

  const parts: THREE.BufferGeometry[] = [ring];
  // 24 internal geared traverse teeth + azimuth drive pinion
  for (let i = 0; i < 24; i++) {
    const th = (i / 24) * Math.PI * 2;
    const tooth = createChamferedBox(5.5, 7.5, 5.5, 0.3, TIGER_CHROME_ROD);
    tooth.rotateY(-th);
    tooth.translate(Math.cos(th) * 89.0, 0, Math.sin(th) * 89.0);
    parts.push(tooth);
  }
  return sanitizeTiger1Mesh(mergeParts(parts));
}

// ============================================================================
// SUITE 2: tiger1_v3_turret_88mm (8 Solid Parts)
// ============================================================================

/** 11. True Hollow Iconic Horseshoe-Curved Tiger I Turret Shell w/ Rommelkiste Stowage Bin (`isShell: true`). */
export function buildTigerTurretShellGeometry(): THREE.BufferGeometry {
  // Local origin [18, 100, 0] -> world X in [-142, +134], Y in [+55, +146], Z in [-116, +116]
  const outerShape = new THREE.Shape();
  outerShape.moveTo(116, -98);
  outerShape.lineTo(116, 98);
  outerShape.lineTo(28, 115);
  outerShape.absarc(-8, 0, 115, Math.PI * 0.42, Math.PI * 1.58, false);
  outerShape.lineTo(28, -115);
  outerShape.closePath();

  const innerHole = new THREE.Path();
  innerHole.moveTo(104, -86);
  innerHole.lineTo(104, 86);
  innerHole.lineTo(24, 103);
  innerHole.absarc(-8, 0, 103, Math.PI * 0.42, Math.PI * 1.58, false);
  innerHole.lineTo(24, -103);
  innerHole.closePath();
  outerShape.holes.push(innerHole);

  const wallRaw = new THREE.ExtrudeGeometry(outerShape, {
    depth: 86,
    bevelEnabled: false,
    curveSegments: 28,
  });
  // Extrude maps shape (x, y) -> local (x, y), depth -> +Z. Rotate -90 deg X so depth -> +Y, shape y -> -Z
  wallRaw.rotateX(-Math.PI / 2);
  wallRaw.translate(0, -45, 0);
  paintGeometry(wallRaw, TIGER_DUNKELGELB);

  // Cut front gun mantlet aperture (X in [+95, +125], Y in [-24, +26], Z in [-64, +64])
  const mantletHole = boxAt(36, 48, 128, 112, 2, 0, TIGER_DUNKELGELB, 0.4);
  const hollowWall = csgSubtract(wallRaw, [mantletHole]);
  wallRaw.dispose();
  mantletHole.dispose();

  // Turret armored roof plate (Y in [+41, +46])
  const roofShape = new THREE.Shape();
  roofShape.moveTo(116, -98);
  roofShape.lineTo(116, 98);
  roofShape.lineTo(28, 115);
  roofShape.absarc(-8, 0, 115, Math.PI * 0.42, Math.PI * 1.58, false);
  roofShape.lineTo(28, -115);
  roofShape.closePath();
  const roofRaw = new THREE.ExtrudeGeometry(roofShape, {
    depth: 5.5,
    bevelEnabled: false,
    curveSegments: 28,
  });
  roofRaw.rotateX(-Math.PI / 2);
  roofRaw.translate(0, 40.5, 0);
  paintGeometry(roofRaw, TIGER_DUNKELGELB);

  const parts: THREE.BufferGeometry[] = [hollowWall, roofRaw];

  // Iconic rear bolted Rommelkiste (Gepäckkasten) stowage bin (X in [-160, -114], Y in [-32, +32], Z in [-82, +82])
  parts.push(boxAt(44, 64, 152, -138, 0, 0, TIGER_DUNKELGELB, 1.0));
  // Left & right pistol ports / spare track link racks on curved flanks
  for (const sz of [-1, 1]) {
    parts.push(cylZ(9, 10, 6, -34, 6, sz * 114, TIGER_DUNKELGELB, 14, 0.5));
  }
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 12. Iconic Cylindrical Commander's Cupola w/ 7 Vision-Block Periscopes, Top Hatch & Loader's Hatch. */
export function buildTigerCupolaHatchesGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [-8, 160, -4] -> world X in [-76, +60], Y in [+146, +180], Z in [-84, +76]
  // Cylindrical commander's cupola (world X=-32, Z=-46 -> local X=-24, Z=-42, R=36, H=34 -> top Y_local=+20 = world +180!)
  parts.push(cylY(36, 38, 28, -24, 0, -42, TIGER_DUNKELGELB, 24, 1.0));
  // Hinged circular commander's hatch lid on top (Y_local = +17 -> top +20)
  parts.push(cylY(32, 33, 6, -24, 17, -42, TIGER_DUNKELGELB, 20, 0.7));
  // 7 armored vision-block periscope hoods radially spaced around cupola
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2;
    const vx = -24 + Math.cos(ang) * 33;
    const vz = -42 + Math.sin(ang) * 33;
    const hood = createChamferedBox(10, 8, 13, 0.5, TIGER_GUN_STEEL);
    hood.rotateY(-ang);
    hood.translate(vx, 8, vz);
    parts.push(hood);
  }
  // Loader's hinged rectangular roof hatch (world X=-14, Z=+42 -> local X=-6, Z=+46)
  parts.push(boxAt(54, 10, 48, -6, -9, 46, TIGER_DUNKELGELB, 0.8));
  // Turret roof armored fume extractor ventilator dome (world X=+42, Z=0 -> local X=+50, Z=+4)
  parts.push(cylY(15, 18, 9, 50, -9.5, 4, TIGER_DUNKELGELB, 16, 0.6));
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 13. Massive Contoured 120mm Cast-Steel External Gun Mantlet w/ Coaxial MG 34 & TZF 9b Apertures. */
export function buildTigerGunMantletGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [134, 102, 0] -> world X in [+122, +172], Y in [+78, +126], Z in [-70, +70]
  // Main 120mm cast armored shield plate
  parts.push(boxAt(18, 46, 138, 0, 0, 0, TIGER_DUNKELGELB, 1.6));
  // Horizontal reinforcement thickened armor rib spanning mantlet
  parts.push(boxAt(22, 18, 136, 6, 0, 0, TIGER_DUNKELGELB, 1.4));
  // Heavy cylindrical outer barrel collar sleeve
  parts.push(cylX(15.5, 18.5, 36, 20, 0, 0, TIGER_DUNKELGELB, 20, 1.0));
  // Coaxial MG 34 armored sleeve & barrel tip (right, Z=+32)
  parts.push(cylX(4.8, 5.8, 22, 16, 0, 32, TIGER_GUN_STEEL, 14, 0.4));
  parts.push(cylX(1.6, 1.8, 18, 29, 0, 32, TIGER_GUN_STEEL, 10, 0.2));
  // Twin recessed TZF 9b binocular sight aperture bosses (left, Z=-32, -43)
  parts.push(cylX(4.5, 5.2, 14, 14, 3, -32, TIGER_GUN_STEEL, 14, 0.3));
  parts.push(cylX(4.5, 5.2, 14, 14, 3, -43, TIGER_GUN_STEEL, 14, 0.3));
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 14. Krupp 88mm KwK 36 L/56 (4.93-Meter) Rifled Cannon Barrel + Twin-Baffle Conical Muzzle Brake. */
export function buildTigerMainGunGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [142, 102, 0] -> X_local in [-40, +387] -> world X in [+102, +529.0 cm]!
  // Stepped rear armored recoil jacket (X_local in [-40, +60])
  parts.push(cylX(11.6, 12.6, 100, 10, 0, 0, TIGER_DUNKELGELB, 24, 0.8));
  // Mid tapered 88mm tube (X_local in [+60, +210])
  parts.push(cylX(8.0, 9.6, 150, 135, 0, 0, TIGER_DUNKELGELB, 24, 0.6));
  // Forward slender 88mm L/56 rifled barrel (X_local in [+210, +350])
  parts.push(cylX(6.4, 8.0, 140, 280, 0, 0, TIGER_GUN_STEEL, 24, 0.5));
  // Locking collar behind muzzle brake (X_local in [+348, +358])
  parts.push(cylX(9.2, 8.6, 10, 353, 0, 0, TIGER_MUZZLE_SOOT, 20, 0.5));

  // Unmistakable Krupp twin-baffle conical muzzle brake (X_local in [+356, +387], max R=13.5)
  const brakeBlank = cylX(12.2, 13.5, 31, 371.5, 0, 0, TIGER_MUZZLE_SOOT, 22, 1.4);
  const boreHole = cylX(4.5, 4.5, 42, 371.5, 0, 0, TIGER_MUZZLE_SOOT, 16, 0.1);
  const slotRear = boxAt(7.5, 13.5, 34, 365.5, 0, 0, TIGER_MUZZLE_SOOT, 0.3);
  const slotFront = boxAt(7.0, 12.5, 34, 377.5, 0, 0, TIGER_MUZZLE_SOOT, 0.3);
  const muzzleBrake = csgSubtract(brakeBlank, [boreHole, slotRear, slotFront]);
  brakeBlank.dispose();
  boreHole.dispose();
  slotRear.dispose();
  slotFront.dispose();
  parts.push(muzzleBrake);

  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 15. Armored Internal Gun Cradle & Gleaming Steel Hydraulic Recoil Brake + Recuperator Cylinders. */
export function buildTigerRecoilCradleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [82, 102, 0] -> X_local in [-42, +52], Y in [-21, +21], Z in [-22, +22]
  // Armored U-trough gun cradle housing
  parts.push(boxAt(90, 8, 34, 5, -15, 0, TIGER_KRUPP_BREECH, 0.7));
  parts.push(boxAt(90, 28, 6, 5, -2, -18, TIGER_KRUPP_BREECH, 0.6));
  parts.push(boxAt(90, 28, 6, 5, -2, 18, TIGER_KRUPP_BREECH, 0.6));
  // Trunnion pivot pins (left & right at X_local = +44)
  parts.push(cylZ(6.5, 6.5, 44, 44, 0, 0, TIGER_CHROME_ROD, 16, 0.5));
  // Gleaming chrome hydraulic recoil brake cylinder (lower-right, Rohrbremse)
  parts.push(cylX(5.6, 5.6, 86, 2, -14.5, 12, TIGER_CHROME_ROD, 18, 0.5));
  // Gleaming hydro-pneumatic recuperator cylinder (upper-right, Vorholer)
  parts.push(cylX(5.8, 5.8, 86, 2, 14.5, 12, TIGER_CHROME_ROD, 18, 0.5));
  // Front & rear clamping collars
  parts.push(boxAt(10, 40, 40, 44, 0, 0, TIGER_GUN_STEEL, 0.7));
  parts.push(boxAt(8, 38, 38, -36, 0, 0, TIGER_GUN_STEEL, 0.6));
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 16. Heavy Krupp Milled Breech Ring + Horizontal Sliding-Wedge Semi-Automatic Breechblock. */
export function buildTigerBreechBlockGeometry(): THREE.BufferGeometry {
  // Local origin [64, 102, 0] -> X_local in [-26, +18], Y in [-16, +16], Z in [-16, +16]
  const block = boxAt(42, 31, 31, -4, 0, 0, TIGER_KRUPP_BREECH, 1.2);
  const bore = cylX(5.4, 5.4, 46, -4, 0, 0, TIGER_GUN_STEEL, 18, 0.1);
  const breechRing = csgSubtract(block, [bore]);
  block.dispose();
  bore.dispose();

  const parts: THREE.BufferGeometry[] = [
    breechRing,
    // Horizontal sliding-wedge steel block seated inside breech mortise
    boxAt(16, 22, 26, -10, 0, -2, TIGER_CHROME_ROD, 0.8),
    // Crank operating handle & semi-automatic cam lever on top-right
    boxAt(14, 5, 12, -16, 15, 8, TIGER_GUN_STEEL, 0.4),
  ];
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 17. Rear Tubular Steel Recoil Guard & Slatted Brass Spent-Shell Deflector Basket. */
export function buildTigerShellGuardGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [8, 92, 0] -> world X in [-24, +36], Y in [+58, +114], Z in [-18, +18]
  // Twin left & right tubular steel recoil guard rails (Abweiser)
  for (const sz of [-1, 1]) {
    parts.push(cylX(2.0, 2.0, 58, -2, 18, sz * 16, TIGER_GUN_STEEL, 10, 0.2));
    parts.push(cylX(2.0, 2.0, 58, -2, -2, sz * 16, TIGER_GUN_STEEL, 10, 0.2));
    parts.push(cylY(2.0, 2.0, 32, -30, 4, sz * 16, TIGER_GUN_STEEL, 10, 0.2));
    parts.push(cylY(2.0, 2.0, 32, 26, 4, sz * 16, TIGER_GUN_STEEL, 10, 0.2));
  }
  // Rear curved steel shoulder hoop
  parts.push(boxAt(4, 24, 34, -30, 8, 0, TIGER_GUN_STEEL, 0.4));
  // Slatted brass spent-shell catcher basket hanging below breech (Y_local in [-34, -6])
  parts.push(boxAt(50, 4, 30, -2, -32, 0, TIGER_BRASS_88MM, 0.4));
  for (let bx = -24; bx <= 22; bx += 11.5) {
    parts.push(boxAt(2.5, 24, 2.5, bx, -19, -14, TIGER_BRASS_88MM, 0.2));
    parts.push(boxAt(2.5, 24, 2.5, bx, -19, 14, TIGER_BRASS_88MM, 0.2));
  }
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 18. Gunner's Iconic Leitz Turmzielfernrohr 9b (TZF 9b) Articulated Binocular Telescopic Sight. */
export function buildTigerOpticsTzf9bGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [84, 106, -38] -> X_local in [-38, +42], Y in [-11, +11], Z in [-11, +11]
  // Twin articulated binocular optical tubes
  for (const zOff of [-5.2, 5.2]) {
    parts.push(cylX(3.8, 4.2, 74, 2, 0, zOff, TIGER_GUN_STEEL, 16, 0.3));
    // Front sapphire-cyan multi-coated objective lens
    parts.push(cylX(3.3, 3.3, 3.0, 40.5, 0, zOff, TIGER_SAPPHIRE_LENS, 16, 0.2));
    // Rear eyepiece cup & rubber brow pad
    parts.push(cylX(4.4, 3.8, 5.0, -35.5, 0, zOff, TIGER_RUBBER_TIRE, 14, 0.3));
  }
  // Articulated linkage bridge, range-stadia illumination drum & elevation knob
  parts.push(boxAt(16, 12, 18, -10, 0, 0, TIGER_KRUPP_BREECH, 0.6));
  parts.push(cylY(5.2, 5.2, 12, -10, 5, 0, TIGER_GUN_STEEL, 14, 0.4));
  return sanitizeTiger1Mesh(mergeParts(parts));
}

// ============================================================================
// SUITE 3: tiger1_v3_drivetrain_int (8 Solid Parts — The Cutaway Masterpiece!)
// ============================================================================

/** 19. Maybach HL230 P45 23.1L 700 HP V12 Gasoline Engine + 4 Solex Carbs + Exhaust Manifolds + Flank Radiators. */
export function buildTigerMaybachV12Geometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [-206, -12, 0] -> world X in [-290, -130], Y in [-58, +38], Z in [-96, +92]
  // Heavy cast-iron V12 crankcase & oil sump
  parts.push(boxAt(146, 36, 62, 0, -24, 0, TIGER_MAYBACH_BLOCK, 1.5));
  // 60-degree twin V12 cylinder banks (6 cylinders per bank) + silver overhead-cam valve covers
  for (const sz of [-1, 1]) {
    const bank = createChamferedBox(138, 34, 26, 1.2, TIGER_MAYBACH_BLOCK);
    bank.rotateX(sz * 0.52);
    bank.translate(0, 6, sz * 24);
    parts.push(bank);

    const cover = createChamferedBox(134, 8, 22, 0.8, TIGER_ALUM_RAD);
    cover.rotateX(sz * 0.52);
    cover.translate(0, 22, sz * 33);
    parts.push(cover);

    // Orange-brown heat-oxidized cast-iron 6-into-1 exhaust manifold hugging cylinder bank
    parts.push(cylX(5.5, 5.5, 134, -2, 10, sz * 40, TIGER_RUST_EXHAUST, 14, 0.4));
    for (let cx = -54; cx <= 54; cx += 21.6) {
      parts.push(cylZ(3.2, 3.2, 12, cx, 10, sz * 35, TIGER_RUST_EXHAUST, 10, 0.2));
    }
  }
  // 4 Iconic Solex 52 JFF II downdraft carburetors + twin cylindrical air cleaner plenums atop the V-valley
  for (const cx of [-42, -14, 14, 42]) {
    parts.push(cylY(6.2, 5.5, 22, cx, 24, 0, TIGER_ALUM_RAD, 14, 0.4));
  }
  parts.push(cylX(12.0, 12.0, 118, 0, 37, 0, TIGER_ALUM_RAD, 18, 0.8));
  // Front cooling PTO pulley & flywheel bellhousing (X_local = +70)
  parts.push(cylX(22, 22, 12, 70, -24, 0, TIGER_GEARBOX_CAST, 18, 0.6));

  // Flanking large aluminum coolant radiators (left full height; right aft-lower for clear cutaway V12 view!)
  parts.push(boxAt(92, 68, 36, -34, 2, -74, TIGER_ALUM_RAD, 1.0));
  parts.push(cylY(24, 24, 10, -34, 40, -74, TIGER_GUN_STEEL, 18, 0.5));
  parts.push(boxAt(60, 40, 34, -52, -24, 73, TIGER_ALUM_RAD, 1.0));

  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 20. Front-Mounted Maybach Olvar 40 12 16 8-Speed Pre-Selector Gearbox + Henschel L600C Differential. */
export function buildTigerTransmissionGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [216, -32, 0] -> world X in [+168, +278], Y in [-58, -6], Z in [-104, +104]
  // Maybach Olvar 8-speed pre-selector main gearbox housing
  parts.push(boxAt(68, 46, 68, -14, 0, 0, TIGER_GEARBOX_CAST, 1.5));
  // Henschel L600C dual-radius regenerative steering differential (forward)
  parts.push(boxAt(44, 44, 88, 38, -2, 0, TIGER_MAYBACH_BLOCK, 1.4));
  // Massive transverse left/right final-drive shafts & steering disc brake drums coupling into front sprockets!
  parts.push(cylZ(9.5, 9.5, 206, 46, -12, 0, TIGER_CHROME_ROD, 18, 0.5));
  for (const sz of [-1, 1]) {
    parts.push(cylZ(21.0, 21.0, 14, 46, -12, sz * 66, TIGER_KRUPP_BREECH, 18, 0.7));
    parts.push(cylZ(16.0, 16.0, 14, 46, -12, sz * 96, TIGER_GEARBOX_CAST, 16, 0.6));
  }
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 21. Central Floor Steel Propeller Driveshaft Coupling Rear Maybach V12 to Front Olvar Gearbox. */
export function buildTigerDriveshaftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [20, -44, 0] -> world X in [-130, +168], Y = -44, Z = 0
  // Central forged steel shaft tube
  parts.push(cylX(5.2, 5.2, 286, -1, 0, 0, TIGER_CHROME_ROD, 18, 0.4));
  // Front & rear heavy bolted universal cardan coupling flanges (visible rotation fins!)
  for (const fx of [-144, -40, 62, 142]) {
    parts.push(cylX(8.8, 8.8, 10, fx, 0, 0, TIGER_KRUPP_BREECH, 16, 0.4));
    parts.push(boxAt(8, 17.5, 4.5, fx, 0, 0, TIGER_GUN_STEEL, 0.3));
    parts.push(boxAt(8, 4.5, 17.5, fx, 0, 0, TIGER_GUN_STEEL, 0.3));
  }
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 22. Suspended Circular Steel Turret Floor Basket + Boehringer-Sturm Hydrostatic Traverse Gearbox. */
export function buildTigerTurretBasketGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [18, 8, 0] -> world Y in [-32, +48], R = 86 cm
  // Suspended circular steel floor disc at Y_local = -37 (world Y = -29..-32, clear above driveshaft!)
  parts.push(cylY(86, 86, 5.5, 0, -37.2, 0, TIGER_ELFENBEIN, 28, 0.5));
  // Upper mounting collar ring under turret ring (Y_local = +37)
  const topO = createBeveledCylinder(85, 85, 5, 0.4, 28, TIGER_KRUPP_BREECH);
  const topI = createBeveledCylinder(76, 76, 8, 0.2, 28, TIGER_KRUPP_BREECH);
  const topRing = csgSubtract(topO, [topI]);
  topRing.translate(0, 37.5, 0);
  topO.dispose();
  topI.dispose();
  parts.push(topRing);

  // 4 vertical steel tubular suspension struts linking floor basket to turret ring
  for (const ang of [0.75, 2.39, 3.9, 5.54]) {
    parts.push(
      cylY(3.4, 3.4, 72, Math.cos(ang) * 78, 0, Math.sin(ang) * 78, TIGER_KRUPP_BREECH, 12, 0.3)
    );
  }
  // Boehringer-Sturm hydrostatic traverse gearbox & manual gunner crank on floor left-front
  parts.push(boxAt(26, 20, 22, 32, -24, -44, TIGER_GEARBOX_CAST, 0.7));
  parts.push(cylY(4.5, 4.5, 38, 32, -4, -44, TIGER_CHROME_ROD, 12, 0.3));
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 23. Side-Sponson Armored Ammo Bins Stacked w/ 24 Gleaming 88x571mmR PzGr. 39 Brass Cartridges. */
export function buildTigerAmmoRacksGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [14, 14, -124] -> world X in [-98, +126], Y in [-14, +42], Z in [-148, -100]
  // Armored sponson rack frame (left-side backplate, top/bottom shelves, divider ribs)
  parts.push(boxAt(222, 4, 46, 0, -25, 0, TIGER_RED_OXIDE, 0.5));
  parts.push(boxAt(222, 4, 46, 0, 25, 0, TIGER_RED_OXIDE, 0.5));
  parts.push(boxAt(222, 52, 4, 0, 0, -21, TIGER_RED_OXIDE, 0.5));
  for (const rx of [-108, -2, 108]) {
    parts.push(boxAt(4, 52, 46, rx, 0, 0, TIGER_RED_OXIDE, 0.4));
  }
  // 2 bays x 3 vertical tiers x 3 depth rows = 18 full-scale 88mm PzGr. 39 rounds (92 cm long!)
  for (const bayX of [-56, 56]) {
    for (const rowY of [-14, 0, 14]) {
      for (const colZ of [-10, 4, 17]) {
        parts.push(...build88mmCartridge(bayX, rowY, colZ, 12));
      }
    }
  }
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 24. Animated Hero Individual Gleaming Brass 88mm PzGr. 39 Complete Cartridge. */
export function buildTigerReadyRoundGeometry(): THREE.BufferGeometry {
  return sanitizeTiger1Mesh(mergeParts(build88mmCartridge(0, 0, 0, 20)));
}

/** 25. Twin Rear Side-Compartment Welded Steel Gasoline Fuel Tanks (540L System). */
export function buildTigerFuelTanksGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [-202, -8, -126] -> world X in [-290, -114], Y in [-42, +26], Z in [-148, -104]
  // Rear & forward welded steel gasoline tanks
  parts.push(boxAt(80, 58, 42, -46, -2, 0, TIGER_RED_OXIDE, 1.4));
  parts.push(boxAt(80, 58, 42, 46, -2, 0, TIGER_RED_OXIDE, 1.4));
  // Brass filler necks & fuel balance cross-feed copper manifold pipe
  parts.push(cylY(6.5, 6.5, 10, -46, 29, 0, TIGER_BRASS_88MM, 14, 0.4));
  parts.push(cylY(6.5, 6.5, 10, 46, 29, 0, TIGER_BRASS_88MM, 14, 0.4));
  parts.push(cylX(3.2, 3.2, 92, 0, 12, 20, TIGER_COPPER_BAND, 12, 0.2));
  return sanitizeTiger1Mesh(mergeParts(parts));
}

/** 26. Front Driver's Steering Wheel & Radio-Operator Station + Turret Commander/Gunner/Loader Seats. */
export function buildTigerCrewStationsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Local origin [86, 12, -10] -> world X in [-40, +178], Y in [-46, +80], Z in [-72, +58]
  // 1. Front-Left Driver's Station (world X=+148, Y=-32, Z=-54 -> local [+62, -44, -44])
  parts.push(boxAt(34, 8, 34, 48, -50, -44, TIGER_LEATHER_SEAT, 0.8)); // seat cushion
  parts.push(boxAt(8, 34, 34, 34, -30, -44, TIGER_LEATHER_SEAT, 0.8)); // backrest
  // Iconic Tiger I automotive steering wheel & angled steering column!
  const col = createBeveledCylinder(3.0, 3.0, 42, 0.3, 12, TIGER_GUN_STEEL);
  col.rotateZ(-0.62);
  col.translate(78, -32, -44);
  parts.push(col);
  const wheel = createBeveledCylinder(15.5, 15.5, 3.8, 0.5, 20, TIGER_RUBBER_TIRE);
  wheel.rotateZ(-0.62);
  wheel.translate(65, -19, -44);
  parts.push(wheel);
  // Instrument dashboard binnacle
  parts.push(boxAt(14, 18, 34, 84, -18, -44, TIGER_KRUPP_BREECH, 0.6));

  // 2. Front-Right Radio Operator / Bow MG 34 Gunner Station (local [+52, -44, +50])
  parts.push(boxAt(32, 8, 32, 48, -50, 50, TIGER_LEATHER_SEAT, 0.8));
  parts.push(boxAt(8, 30, 32, 34, -32, 50, TIGER_LEATHER_SEAT, 0.8));
  // FuG 5 transceiver radio chassis
  parts.push(boxAt(22, 22, 26, 74, -18, 52, TIGER_GUN_STEEL, 0.6));

  // 3. Turret Commander's High Seat (world X=-28, Y=+70, Z=-50 -> local [-114, +58, -40])
  parts.push(boxAt(26, 7, 28, -110, 58, -40, TIGER_LEATHER_SEAT, 0.7));
  parts.push(boxAt(7, 22, 28, -122, 66, -40, TIGER_LEATHER_SEAT, 0.7));
  parts.push(cylY(3.2, 3.2, 52, -110, 30, -40, TIGER_KRUPP_BREECH, 10, 0.2));

  // 4. Turret Gunner's Seat (world X=+36, Y=+52, Z=-54 -> local [-50, +40, -44])
  parts.push(boxAt(26, 7, 28, -50, 40, -44, TIGER_LEATHER_SEAT, 0.7));
  parts.push(cylY(3.2, 3.2, 46, -50, 16, -44, TIGER_KRUPP_BREECH, 10, 0.2));

  // 5. Loader's Compact Folding Stool (world X=+18, Y=+42, Z=+46 -> local [-68, +30, +56])
  parts.push(boxAt(24, 6, 22, -68, 30, 56, TIGER_LEATHER_SEAT, 0.6));
  parts.push(cylY(2.8, 2.8, 38, -68, 10, 56, TIGER_KRUPP_BREECH, 10, 0.2));

  return sanitizeTiger1Mesh(mergeParts(parts));
}
