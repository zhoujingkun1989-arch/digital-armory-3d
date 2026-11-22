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
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import { clampUv01 as clamp01 } from '../../../engine/geometry/uvUnwrap';

// ============================================================================
// Krauss-Maffei Wegmann Leopard 2A7V (120mm Rh-120 L/55A1) 1:1 CAD Constants
// Coordinate system: 1 world unit = 1 cm, +X front/muzzle, +Y up, +Z right.
// Ground contact: Y = -120.0 cm | Hull X ∈ [-385, +385] | Muzzle X = +712 cm
// Width Z ∈ [-187.5, +187.5] (375 cm) | Height Y ∈ [-120, +144] (264 cm)
// ============================================================================

export const LEO_GROUND_Y = -120.0;
export const LEO_BORE_Y = 74.0;
export const LEO_TURRET_CENTER_X = 32.0;
export const LEO_TRACK_CENTER_Z = 145.75;
export const LEO_RECOIL_STROKE = 34.0; // 340 mm authentic Rh-120 L/55A1 recoil stroke
export const LEO_BREECH_DROP = 16.0; // 160 mm vertical falling-wedge breechblock drop
export const LEO_RECOIL_SPRING_L0 = 94.0;
export const LEO_BREECH_SPRING_L0 = 38.0;

// Calibrated Bundeswehr NATO 3-Tone Camo & Heavy Armor Palette (all linear luma >> 0.018)
export const LEO_NATO_GREEN = '#4e5b44'; // Bronzegrün RAL 6031
export const LEO_NATO_BROWN = '#644a38'; // Lederbraun RAL 8027
export const LEO_NATO_BLACK = '#3c4045'; // Teerschwarz RAL 9021 (AgX safe >= 0.17 sRGB)
export const LEO_ARMOR_STEEL = '#59636e';
export const LEO_BREECH_STEEL = '#8f99a6';
export const LEO_CHROME_ROD = '#d2dae4';
export const LEO_RUBBER_DARK = '#3a3f46';
export const LEO_TRACK_STEEL = '#4b5159';
export const LEO_MTU_ALUMINUM = '#a4aeb9';
export const LEO_RENK_GUNMETAL = '#626c78';
export const LEO_COPPER_PIPE = '#c87c44';
export const LEO_RADIATOR_COPPER = '#b86e3b';
export const LEO_BRASS_STUB = '#cfa248';
export const LEO_CASE_TAN = '#8c7e5e';
export const LEO_TUNGSTEN_DART = '#4c525c';
export const LEO_OPTIC_EMERALD = '#1d8a72';
export const LEO_HAZARD_YELLOW = '#e0a928';
export const LEO_SPRING_STEEL = '#96a2b2';
export const LEO_CREW_SEAT = '#4a5258';
export const LEO_IFIS_CYAN = '#38bdf8';

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
 * Strips degenerate sliver triangles, guarantees outward winding (`signedVolume > 0`),
 * preserves `aCurvature` & `aSpringParam`, enforces unit-length normals, and assigns
 * clean [0.04, 0.96] triplanar-box UVs for offline CSG fallback & contract parity.
 */
export function sanitizeLeopardMesh(
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
    if (_fn.lengthSq() > 1e-14) {
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
// Primitive Builders (1:1 cm scale)
// ============================================================================

function boxAt(
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  color: string,
  chamfer = 0.6,
  rot?: [number, number, number]
): THREE.BufferGeometry {
  const g = createChamferedBox(sx, sy, sz, chamfer, color);
  if (rot) {
    if (rot[0]) g.rotateX(rot[0]);
    if (rot[1]) g.rotateY(rot[1]);
    if (rot[2]) g.rotateZ(rot[2]);
  }
  g.translate(x, y, z);
  return g;
}

function cylX(
  rTop: number,
  rBot: number,
  len: number,
  x: number,
  y: number,
  z: number,
  color: string,
  segs = 24,
  bevel = 0.35
): THREE.BufferGeometry {
  const g = createBeveledCylinder(rTop, rBot, len, bevel, segs, color);
  g.rotateZ(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function cylY(
  rTop: number,
  rBot: number,
  len: number,
  x: number,
  y: number,
  z: number,
  color: string,
  segs = 24,
  bevel = 0.35
): THREE.BufferGeometry {
  const g = createBeveledCylinder(rTop, rBot, len, bevel, segs, color);
  g.translate(x, y, z);
  return g;
}

function cylZ(
  rTop: number,
  rBot: number,
  len: number,
  x: number,
  y: number,
  z: number,
  color: string,
  segs = 24,
  bevel = 0.35
): THREE.BufferGeometry {
  const g = createBeveledCylinder(rTop, rBot, len, bevel, segs, color);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function hollowRingY(
  rOut: number,
  rIn: number,
  height: number,
  x: number,
  y: number,
  z: number,
  color: string,
  segs = 48
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: segs,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(x, y - height * 0.5, z);
  paintGeometry(g, color);
  return g;
}

function hollowTubeX(
  rOut: number,
  rIn: number,
  x0: number,
  x1: number,
  y: number,
  z: number,
  color: string,
  segs = 32
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: x1 - x0,
    bevelEnabled: false,
    curveSegments: segs,
  });
  g.rotateY(Math.PI / 2);
  g.translate(x0, y, z);
  paintGeometry(g, color);
  return g;
}

function extrudeXY(
  pts: Array<[number, number]>,
  z0: number,
  z1: number,
  color: string
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: z1 - z0,
    bevelEnabled: false,
    steps: 1,
  });
  g.translate(0, 0, z0);
  paintGeometry(g, color);
  return g;
}

function buildSingle120mmRound(
  x: number,
  y: number,
  z: number
): THREE.BufferGeometry[] {
  // Exact 120×570mm NATO DM63A1 APFSDS (total length 98.4 cm, X ∈ [-49.2, +49.2])
  return [
    // Metallic stub base rim (154 mm OD, 11 cm long)
    cylX(7.7, 7.7, 11.0, x - 43.7, y, z, LEO_BRASS_STUB, 16, 0.25),
    // Combustible olive-tan propellant cartridge body (56 cm long)
    cylX(7.1, 7.35, 55.0, x - 10.7, y, z, LEO_CASE_TAN, 16, 0.2),
    // Aluminum discard sabot flange & forward petals
    cylX(5.9, 6.2, 11.0, x + 21.5, y, z, LEO_BREECH_STEEL, 16, 0.2),
    // Tungsten long-rod APFSDS penetrator dart + ballistic tip
    cylX(1.35, 1.45, 22.0, x + 35.5, y, z, LEO_TUNGSTEN_DART, 12, 0.12),
    cylX(0.32, 1.35, 6.0, x + 46.2, y, z, LEO_CHROME_ROD, 12, 0.08),
  ];
}

// ============================================================================
// SUITE 1 — HULL, SIDE SKIRTS, RUNNING GEAR, ENGINE DECK, TORSION & RING (8)
// ============================================================================

/** F-01: Hollow welded Leopard 2A7V armored hull w/ heavy front glacis add-on block. */
export function buildLeoHullShellGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // Lower armored belly floor plate (Y ∈ [-72, -58], X ∈ [-376, +310], Z ∈ [-112, +112])
    boxAt(686, 14, 224, -33, -65, 0, LEO_NATO_GREEN, 1.0),
    // Sloped lower glacis chin armor plate (X ∈ [+305, +385], Y ∈ [-70, -6])
    extrudeXY(
      [
        [305, -72],
        [385, -8],
        [372, 2],
        [295, -56],
      ],
      -114,
      114,
      LEO_NATO_GREEN
    ),
    // Heavy sloped upper front glacis base armor + 2A7V thick add-on composite wedge module
    extrudeXY(
      [
        [232, 48],
        [385, -6],
        [385, 16],
        [262, 52],
        [232, 48],
      ],
      -148,
      148,
      LEO_NATO_GREEN
    ),
    // 2A7V bolt-on thick composite glacis add-on armor block (distinctive stepped nose)
    extrudeXY(
      [
        [268, 47],
        [385, 11],
        [385, -7],
        [366, -11],
        [260, 29],
      ],
      -128,
      128,
      LEO_NATO_BROWN
    ),
    // Hollow left & right lower hull tub walls (~16 cm armored wall thickness)
    boxAt(698, 96, 16, -24, -14, -104, LEO_NATO_GREEN, 0.8),
    boxAt(698, 96, 16, -24, -14, 104, LEO_NATO_GREEN, 0.8),
    // Upper armored sponsons overhanging the tracks (Y ∈ [+14, +48], Z ∈ [±112..±176])
    boxAt(710, 34, 64, -18, 31, -144, LEO_NATO_GREEN, 1.2),
    boxAt(710, 34, 64, -18, 31, 144, LEO_NATO_GREEN, 1.2),
    // Forward hull roof deck (X ∈ [+136, +268], Y ∈ [+34, +48], Z ∈ [-112, +112])
    boxAt(132, 14, 224, 202, 41, 0, LEO_NATO_GREEN, 0.8),
    // Turret ring surround deck collar (left & right deck bridges around R=104 ring at X=+32)
    boxAt(252, 14, 48, 32, 41, -124, LEO_NATO_GREEN, 0.8),
    boxAt(252, 14, 48, 32, 41, 124, LEO_NATO_GREEN, 0.8),
    // Internal engine firewall armored bulkhead at X = -114 (separates crew & MTU V12)
    boxAt(12, 100, 204, -114, -6, 0, LEO_ARMOR_STEEL, 0.6),
    // Elevated rear engine bay side rim coamings (X ∈ [-376, -114], Y ∈ [+36, +54])
    boxAt(262, 18, 34, -245, 45, -128, LEO_NATO_BLACK, 0.8),
    boxAt(262, 18, 34, -245, 45, 128, LEO_NATO_BLACK, 0.8),
    // Heavy rear armored transom plate (X ∈ [-385, -369], Y ∈ [-68, +52], Z ∈ [-166, +166])
    boxAt(16, 120, 332, -377, -8, 0, LEO_NATO_GREEN, 1.0),
    // Front armored LED headlight clusters & tow shackles
    boxAt(24, 16, 22, 358, 32, -138, LEO_NATO_BLACK, 0.5),
    boxAt(24, 16, 22, 358, 32, 138, LEO_NATO_BLACK, 0.5),
    boxAt(18, 12, 14, 376, -18, -88, LEO_ARMOR_STEEL, 0.5),
    boxAt(18, 12, 14, 376, -18, 88, LEO_ARMOR_STEEL, 0.5),
    // Driver's raised front-right armored periscope brow (X=+226, Z=+58)
    boxAt(46, 12, 58, 226, 48, 58, LEO_NATO_BLACK, 0.6),
  ];
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** F-02: Heavy front modular composite side skirts + serrated rear rubber skirts. */
export function buildLeoSideSkirtsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const zHeavy = side * 183.25; // outer Z = ±187.5 cm (exact 375 cm width!)
    const zRear = side * 182.25;
    // Front 3 thick composite ballistic skirt panels (X ∈ [+120, +360], local Y ∈ [-52, +54])
    for (let i = 0; i < 3; i++) {
      const cx = 160 + i * 80;
      const col = i === 1 ? LEO_NATO_BROWN : LEO_NATO_GREEN;
      parts.push(boxAt(78, 106, 8.5, cx, 1, zHeavy, col, 0.7));
    }
    // Rear 6 modular steel/rubber skirt panels (X ∈ [-360, +120], local Y ∈ [-38, +54])
    for (let i = 0; i < 6; i++) {
      const cx = -320 + i * 80;
      const col =
        i % 3 === 0
          ? LEO_NATO_BLACK
          : i % 3 === 1
            ? LEO_NATO_GREEN
            : LEO_NATO_BROWN;
      parts.push(boxAt(78, 92, 4.8, cx, 8, zRear, col, 0.5));
    }
  }
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** F-03: 7 pairs of Leopard 2 dished steel road wheels + rear drive sprockets + front idlers + return rollers. */
export function buildLeoRoadWheelsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wheelXs = [-248, -168, -88, -8, 72, 152, 232];
  const rollerXs = [-208, -78, 52, 182];

  for (const side of [-1, 1]) {
    const zMid = side * LEO_TRACK_CENTER_Z;
    // 7 dual-disk dished road wheels (R = 35 cm, world Y = -80 -> bottom Y = -115)
    for (const wx of wheelXs) {
      parts.push(cylZ(35, 35, 16, wx, 0, zMid - 15, LEO_RUBBER_DARK, 24, 0.8));
      parts.push(cylZ(35, 35, 16, wx, 0, zMid + 15, LEO_RUBBER_DARK, 24, 0.8));
      parts.push(cylZ(27, 27, 44, wx, 0, zMid, LEO_NATO_GREEN, 20, 0.6));
      parts.push(cylZ(11, 11, 56, wx, 0, zMid, LEO_ARMOR_STEEL, 16, 0.4));
      // Swing arm connecting wheel hub to lower hull tub
      parts.push(
        boxAt(22, 12, 26, wx - 10, 6, side * 116, LEO_ARMOR_STEEL, 0.5)
      );
    }
    // Rear toothed drive sprocket (X = -326, local Y = +18 -> world Y = -62)
    parts.push(cylZ(34, 34, 14, -326, 18, zMid - 16, LEO_TRACK_STEEL, 24, 0.6));
    parts.push(cylZ(34, 34, 14, -326, 18, zMid + 16, LEO_TRACK_STEEL, 24, 0.6));
    parts.push(cylZ(22, 22, 48, -326, 18, zMid, LEO_NATO_BLACK, 20, 0.5));
    // Front tensioning idler wheel (X = +316, local Y = +16 -> world Y = -64)
    parts.push(cylZ(31, 31, 14, 316, 16, zMid - 15, LEO_NATO_GREEN, 24, 0.6));
    parts.push(cylZ(31, 31, 14, 316, 16, zMid + 15, LEO_NATO_GREEN, 24, 0.6));
    parts.push(cylZ(14, 14, 46, 316, 16, zMid, LEO_ARMOR_STEEL, 16, 0.4));
    // 4 upper track return rollers (local Y = +52 -> world Y = -28)
    for (const rx of rollerXs) {
      parts.push(cylZ(11, 11, 44, rx, 52, zMid, LEO_RUBBER_DARK, 16, 0.4));
    }
  }
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** Shared continuous Diehl 570FT double-pin rubber-padded track belt builder (local Y ∈ [-48, +60]). */
function buildDiehlTrackBelt(): THREE.BufferGeometry {
  // Ground contact at local Y = -48.0 (world Y = -72 - 48 = -120.0 cm!)
  const outerPts: Array<[number, number]> = [
    [-254, -48],
    [244, -48],
    [352, -16],
    [356, 14],
    [324, 54],
    [-334, 58],
    [-368, 22],
    [-362, -12],
  ];
  const innerPts: Array<[number, number]> = [
    [-248, -43],
    [238, -43],
    [342, -14],
    [346, 12],
    [318, 47],
    [-328, 51],
    [-358, 20],
    [-352, -10],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(outerPts[0][0], outerPts[0][1]);
  for (let i = 1; i < outerPts.length; i++)
    shape.lineTo(outerPts[i][0], outerPts[i][1]);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(innerPts[0][0], innerPts[0][1]);
  for (let i = innerPts.length - 1; i >= 0; i--)
    hole.lineTo(innerPts[i][0], innerPts[i][1]);
  hole.closePath();
  shape.holes.push(hole);

  const belt = new THREE.ExtrudeGeometry(shape, {
    depth: 62,
    bevelEnabled: false,
    steps: 1,
  });
  belt.translate(0, 0, -31);
  paintGeometry(belt, LEO_TRACK_STEEL);

  const parts: THREE.BufferGeometry[] = [belt];
  // Sculpted Diehl 570FT twin rubber road pads & central guide horns along bottom & top runs
  for (let px = -240; px <= 228; px += 26) {
    parts.push(boxAt(18, 3.0, 22, px, -46.5, -14, LEO_RUBBER_DARK, 0.3));
    parts.push(boxAt(18, 3.0, 22, px, -46.5, 14, LEO_RUBBER_DARK, 0.3));
    parts.push(boxAt(12, 8.0, 6.0, px, -39.5, 0, LEO_ARMOR_STEEL, 0.3));
    parts.push(boxAt(18, 3.0, 22, px, 56.5, -14, LEO_RUBBER_DARK, 0.3));
    parts.push(boxAt(18, 3.0, 22, px, 56.5, 14, LEO_RUBBER_DARK, 0.3));
  }
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** F-04: Diehl 570FT double-pin rubber-padded left track belt. */
export function buildLeoTracksLeftGeometry(): THREE.BufferGeometry {
  return buildDiehlTrackBelt();
}

/** F-05: Diehl 570FT double-pin rubber-padded right track belt (shell cutaway). */
export function buildLeoTracksRightGeometry(): THREE.BufferGeometry {
  return buildDiehlTrackBelt();
}

/** F-06: Elevated iconic Leopard 2 twin-fan rear engine deck w/ round fan grilles & lifting lugs. */
export function buildLeoEngineDeckGeometry(): THREE.BufferGeometry {
  // Assembled at [-244, +54, 0] -> world X ∈ [-374, -114], Y ∈ [+46, +62], Z ∈ [-112, +112]
  const parts: THREE.BufferGeometry[] = [
    // Forward engine access deck plate (local X ∈ [-8, +130])
    boxAt(138, 10, 224, 61, -3, 0, LEO_NATO_GREEN, 0.7),
    // Elevated rear cooling-fan grille deck housing (local X ∈ [-130, -8])
    boxAt(122, 14, 224, -69, 1, 0, LEO_NATO_BROWN, 0.8),
    // Twin iconic circular radial fan grille rings (at local X = -72, Z = ±46 -> world X = -316)
    hollowRingY(46, 38, 8, -72, 6, -46, LEO_NATO_BLACK, 32),
    hollowRingY(46, 38, 8, -72, 6, 46, LEO_NATO_BLACK, 32),
    // Protective radial cross-bars & hubs over both circular grilles
    boxAt(82, 3, 5, -72, 7.5, -46, LEO_ARMOR_STEEL, 0.3),
    boxAt(5, 3, 82, -72, 7.5, -46, LEO_ARMOR_STEEL, 0.3),
    boxAt(82, 3, 5, -72, 7.5, 46, LEO_ARMOR_STEEL, 0.3),
    boxAt(5, 3, 82, -72, 7.5, 46, LEO_ARMOR_STEEL, 0.3),
    // Transverse intake louver slats across forward access deck
    ...[-4, 18, 40, 62, 84, 106].map((lx) =>
      boxAt(10, 4, 176, lx, 3, 0, LEO_NATO_BLACK, 0.3)
    ),
    // 4 heavy forged quick-swap EuroPowerpack lifting lugs
    boxAt(14, 9, 10, -116, 6, -94, LEO_ARMOR_STEEL, 0.4),
    boxAt(14, 9, 10, -116, 6, 94, LEO_ARMOR_STEEL, 0.4),
    boxAt(14, 9, 10, 114, 4, -94, LEO_ARMOR_STEEL, 0.4),
    boxAt(14, 9, 10, 114, 4, 94, LEO_ARMOR_STEEL, 0.4),
  ];
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** F-07: 14 transverse forged steel torsion bars + hydraulic friction dampers along hull floor. */
export function buildLeoTorsionBarsGeometry(): THREE.BufferGeometry {
  // Assembled at [-8, -64, 0] -> world X ∈ [-260, +244], Y ∈ [-70, -56], Z ∈ [-108, +108]
  const parts: THREE.BufferGeometry[] = [];
  const stations = [-240, -160, -80, 0, 80, 160, 240];
  for (let i = 0; i < stations.length; i++) {
    const sx = stations[i];
    // Twin fore/aft staggered transverse torsion bars for left & right swing arms
    parts.push(cylZ(3.2, 3.2, 212, sx - 6, 0, 0, LEO_BREECH_STEEL, 14, 0.3));
    parts.push(cylZ(3.2, 3.2, 212, sx + 6, 0, 0, LEO_ARMOR_STEEL, 14, 0.3));
    // Splined end anchor bushings
    parts.push(boxAt(18, 10, 14, sx, 0, -101, LEO_NATO_BLACK, 0.4));
    parts.push(boxAt(18, 10, 14, sx, 0, 101, LEO_NATO_BLACK, 0.4));
  }
  // Central torsion-bar floor longitudinal keel stiffener
  parts.push(boxAt(504, 8, 16, 0, -2, 0, LEO_ARMOR_STEEL, 0.5));
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** F-08: Precision geared steel turret race ring & all-electric ESW-Extel azimuth traverse drive. */
export function buildLeoTurretRingGeometry(): THREE.BufferGeometry {
  // Assembled at [32, +46, 0] -> local X ∈ [-106, +106], Y ∈ [-14, +8], Z ∈ [-106, +106]
  const parts: THREE.BufferGeometry[] = [
    hollowRingY(105, 92, 12, 0, 2, 0, LEO_BREECH_STEEL, 48),
    hollowRingY(106, 98, 4, 0, -5, 0, LEO_ARMOR_STEEL, 48),
    // All-electric azimuth traverse drive motor & spur pinion gearbox (rear-left)
    cylY(14, 14, 22, -68, -3, -62, LEO_RENK_GUNMETAL, 20, 0.5),
    cylY(10, 10, 12, -78, 0, -72, LEO_COPPER_PIPE, 16, 0.4),
  ];
  // 24 internal ring gear teeth accents
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    parts.push(
      boxAt(
        4.5,
        8,
        4.5,
        Math.cos(a) * 90.5,
        2,
        Math.sin(a) * 90.5,
        LEO_CHROME_ROD,
        0.2,
        [0, -a, 0]
      )
    );
  }
  return sanitizeLeopardMesh(mergeParts(parts));
}

// ============================================================================
// SUITE 2 — TURRET, ARROWHEAD WEDGES, L/55A1 GUN, MANTLET, RECOIL, BREECH, OPTICS, SMOKE (8)
// ============================================================================

/** F-09: True hollow welded Leopard 2A7V armored turret shell w/ bustle stowage bins & roof hatches. */
export function buildLeoTurretShellGeometry(): THREE.BufferGeometry {
  // Assembled at [32, +82, 0] -> world X ∈ [-186, +124], Y ∈ [+50, +120], Z ∈ [-162, +162]
  const parts: THREE.BufferGeometry[] = [
    // Hollow composite turret roof armor slab (~16 cm thick)
    boxAt(296, 14, 248, -62, 27, 0, LEO_NATO_GREEN, 1.0),
    // Forward turret floor ring collar (open central turret ring)
    boxAt(166, 10, 256, -135, -27, 0, LEO_NATO_GREEN, 0.8),
    boxAt(130, 10, 62, 25, -27, -108, LEO_NATO_GREEN, 0.8),
    boxAt(130, 10, 62, 25, -27, 108, LEO_NATO_GREEN, 0.8),
    // Hollow left & right heavy armored turret side walls (~20 cm thick composite cheeks!)
    boxAt(298, 62, 22, -60, -1, -132, LEO_NATO_GREEN, 1.2),
    boxAt(298, 62, 22, -60, -1, 132, LEO_NATO_GREEN, 1.2),
    // Front composite turret cheek bulkheads flanking open gun mantlet bay (Z ∈ [-38, +38])
    boxAt(22, 62, 106, 81, -1, -92, LEO_NATO_BROWN, 1.0),
    boxAt(22, 62, 106, 81, -1, 92, LEO_NATO_BROWN, 1.0),
    // Rear turret bustle armored wall (X_local = -208)
    boxAt(18, 56, 260, -209, 0, 0, LEO_NATO_GREEN, 1.0),
    // Iconic Leopard 2A7V angled flank bustle stowage bins (Staukästen, Z ∈ [±143, ±162])
    boxAt(210, 44, 19, -98, 4, -152.5, LEO_NATO_BROWN, 0.8),
    boxAt(210, 44, 19, -98, 4, 152.5, LEO_NATO_BROWN, 0.8),
    // Roof ammunition compartment blow-off vent panels over bustle
    boxAt(108, 6, 180, -148, 35, 0, LEO_NATO_BLACK, 0.5),
    // Commander's (right) & Loader's (left) circular armored roof hatches
    cylY(30, 32, 8, -22, 34, 62, LEO_NATO_GREEN, 24, 0.5),
    cylY(28, 30, 8, -26, 34, -60, LEO_NATO_BLACK, 24, 0.5),
    // Rear bustle auxiliary storage basket frame
    boxAt(20, 26, 210, -208, 12, 0, LEO_NATO_BLACK, 0.5),
  ];
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** F-10: THE SILHOUETTE ICON — Hollow spaced Arrowhead Composite Wedge Cheek Armor Modules. */
export function buildLeoArrowheadWedgesGeometry(): THREE.BufferGeometry {
  // Assembled at [168, +78, 0] -> world X ∈ [+114, +242], Y ∈ [+48, +116], Z ∈ [-160, +160]
  const parts: THREE.BufferGeometry[] = [];
  // Sculpt razor-sharp hollow triangular arrowhead cheeks on BOTH flanks (Z ∈ [-160,-38] & [+38,+160])
  for (const side of [-1, 1]) {
    const z0 = side > 0 ? 38 : -160;
    const z1 = side > 0 ? 160 : -38;
    const colOuter = side > 0 ? LEO_NATO_GREEN : LEO_NATO_BROWN;
    // Upper sloped arrowhead outer plate (14 cm armored skin meeting prow at X_local=+74, Y_local=+2)
    parts.push(
      extrudeXY(
        [
          [-54, 38],
          [74, 2],
          [56, 2],
          [-54, 26],
        ],
        z0,
        z1,
        colOuter
      )
    );
    // Lower sloped arrowhead outer plate (meeting prow at X_local=+74, Y_local=+2)
    parts.push(
      extrudeXY(
        [
          [-54, -30],
          [74, 2],
          [56, 2],
          [-54, -18],
        ],
        z0,
        z1,
        LEO_NATO_GREEN
      )
    );
    // Side outer cheek closing plates
    const zOuter = side > 0 ? 150 : -150;
    parts.push(
      extrudeXY(
        [
          [-54, -30],
          [74, 2],
          [-54, 38],
        ],
        zOuter - 5,
        zOuter + 5,
        LEO_NATO_BLACK
      )
    );
    // Visible internal spaced multi-layer NERA composite steel/elastomer sandwich plates inside cavity!
    for (const offX of [-30, -8, 14]) {
      parts.push(
        boxAt(
          5.5,
          36,
          104,
          offX,
          2,
          side * 98,
          offX === -8 ? LEO_COPPER_PIPE : LEO_ARMOR_STEEL,
          0.35,
          [0, 0, -0.34]
        )
      );
    }
  }
  // Hollow upper spaced composite mantlet brow bridge spanning Z ∈ [-42, +42] (slices right at Z=0!)
  parts.push(
    extrudeXY(
      [
        [-54, 38],
        [18, 28],
        [18, 20],
        [-54, 28],
      ],
      -42,
      42,
      LEO_NATO_GREEN
    )
  );
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** S-01: Rheinmetall Rh-120 L/55A1 6.6-meter (55-caliber) smoothbore gun barrel w/ bore evacuator & MRS. */
export function buildLeoMainGunGeometry(): THREE.BufferGeometry {
  // Assembled at [148, +74, 0] -> world X ∈ [+52, +712] (660 cm exact L/55A1 length!)
  const parts: THREE.BufferGeometry[] = [
    // Heavy rear barrel breech forging (hollow 120mm smoothbore, local X ∈ [-96, +50])
    hollowTubeX(11.8, 6.0, -96, 50, 0, 0, LEO_ARMOR_STEEL, 28),
    // Mid thermal-shrouded barrel tube (local X ∈ [+50, +190])
    hollowTubeX(10.8, 6.0, 50, 190, 0, 0, LEO_NATO_GREEN, 28),
    // Iconic cylindrical Bore Evacuator / Fume Extractor (local X ∈ [+190, +266] -> world [+338, +414])
    hollowTubeX(13.8, 6.0, 190, 266, 0, 0, LEO_NATO_BROWN, 28),
    // Forward ultra-long L/55A1 thermal-shrouded barrel (local X ∈ [+266, +550])
    hollowTubeX(9.6, 6.0, 266, 550, 0, 0, LEO_NATO_GREEN, 28),
    // Unshrouded chrome-lined muzzle tip crown (local X ∈ [+550, +564] -> world X = +712 cm!)
    hollowTubeX(8.8, 6.0, 550, 564, 0, 0, LEO_BREECH_STEEL, 28),
    // 7 gleaming stainless thermal-shroud clamping bands
    ...[68, 128, 188, 268, 348, 434, 520].map((bx) =>
      hollowTubeX(11.2, 9.4, bx - 2.5, bx + 2.5, 0, 0, LEO_CHROME_ROD, 24)
    ),
    // Iconic top-mounted Muzzle Reference Sensor (MRS) collimator mast (local X = +557, Y = +13)
    boxAt(8, 10, 5, 557, 13, 0, LEO_ARMOR_STEEL, 0.3),
    cylX(2.6, 2.6, 5, 556, 15.5, 0, LEO_CHROME_ROD, 14, 0.2),
  ];
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** S-02: Heavy armored recessed gun mantlet & trunnion cradle. */
export function buildLeoGunMantletGeometry(): THREE.BufferGeometry {
  // Assembled at [138, +74, 0] -> local X ∈ [-40, +50], Y ∈ [-22, +26], Z ∈ [-36, +36]
  const parts: THREE.BufferGeometry[] = [
    // Heavy front armored mantlet shield w/ central barrel sleeve
    boxAt(34, 46, 70, 33, 2, 0, LEO_NATO_BLACK, 1.2),
    hollowTubeX(16.5, 12.6, -40, 46, 0, 0, LEO_ARMOR_STEEL, 24),
    // Side trunnion cradle cheek plates & bearing journals
    boxAt(76, 36, 10, -2, 0, -30, LEO_ARMOR_STEEL, 0.8),
    boxAt(76, 36, 10, -2, 0, 30, LEO_ARMOR_STEEL, 0.8),
    cylZ(10, 10, 72, 0, 0, 0, LEO_BREECH_STEEL, 20, 0.4),
    // Coaxial MG3 7.62mm armored barrel aperture on left cheek
    cylX(3.2, 3.2, 42, 26, 6, -24, LEO_TRACK_STEEL, 14, 0.25),
  ];
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** S-03: Twin gleaming chrome hydraulic recoil brakes & hydro-pneumatic recuperators. */
export function buildLeoRecoilSystemGeometry(): THREE.BufferGeometry {
  // Assembled at [82, +74, 0] -> local X ∈ [-56, +56], Y ∈ [-18, +20], Z ∈ [-32, +32]
  const parts: THREE.BufferGeometry[] = [
    // Upper-left & upper-right gleaming hard-chrome hydraulic recoil brake cylinders
    cylX(6.4, 6.4, 106, 0, 13.5, -18.5, LEO_CHROME_ROD, 20, 0.4),
    cylX(6.4, 6.4, 106, 0, 13.5, 18.5, LEO_CHROME_ROD, 20, 0.4),
    // Outer hydraulic stator sleeves
    cylX(7.8, 7.8, 56, 20, 13.5, -18.5, LEO_RENK_GUNMETAL, 20, 0.4),
    cylX(7.8, 7.8, 56, 20, 13.5, 18.5, LEO_RENK_GUNMETAL, 20, 0.4),
    // Lower recuperator guide rods (inside `leo_recoil_springs` at Y_local = -11.5, Z = ±19.5)
    cylX(3.0, 3.0, 108, 0, -11.5, -19.5, LEO_CHROME_ROD, 16, 0.3),
    cylX(3.0, 3.0, 108, 0, -11.5, 19.5, LEO_CHROME_ROD, 16, 0.3),
    // Heavy forged front & rear hydraulic yoke collars
    boxAt(12, 38, 62, 50, 1, 0, LEO_ARMOR_STEEL, 0.6),
    boxAt(12, 36, 58, -50, 1, 0, LEO_ARMOR_STEEL, 0.6),
    // Brass hydraulic pressure relief valves
    cylY(2.8, 2.8, 7, -34, 18, -18.5, LEO_BRASS_STUB, 12, 0.2),
    cylY(2.8, 2.8, 7, -34, 18, 18.5, LEO_BRASS_STUB, 12, 0.2),
  ];
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** S-04: Dynamic CSG Spring #1 — Twin heavy X-axis helical recuperator coils (`aSpringParam` w=1!). */
export function buildLeoRecoilSpringsGeometry(): THREE.BufferGeometry {
  // Assembled at [30, +74, 0] -> spans X_local ∈ [0, +94] (world X ∈ [+30, +124])
  // Rear anchor at X_local = 0; front compresses -34 cm -> scaleX = 0.6383!
  const leftCoil = createHelicalSpring({
    axis: 'x',
    start: 0,
    end: LEO_RECOIL_SPRING_L0,
    centerY: -11.5,
    centerZ: -19.5,
    coilRadius: 5.4,
    wireRadius: 1.35,
    coils: 14,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  paintGeometry(leftCoil, LEO_SPRING_STEEL);

  const rightCoil = createHelicalSpring({
    axis: 'x',
    start: 0,
    end: LEO_RECOIL_SPRING_L0,
    centerY: -11.5,
    centerZ: 19.5,
    coilRadius: 5.4,
    wireRadius: 1.35,
    coils: 14,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  paintGeometry(rightCoil, LEO_SPRING_STEEL);

  return sanitizeLeopardMesh(mergeParts([leftCoil, rightCoil]));
}

/** FC-01: Precision-milled Rheinmetall 120mm breech ring & vertical falling-wedge breechblock. */
export function buildLeoBreechBlockGeometry(): THREE.BufferGeometry {
  // Assembled at [36, +74, 0] -> local X ∈ [-20, +20], Y ∈ [-20, +20], Z ∈ [-22, +22]
  const parts: THREE.BufferGeometry[] = [
    // Heavy milled steel breechblock body & vertical wedge face
    boxAt(34, 36, 40, 2, 0, 0, LEO_BREECH_STEEL, 1.0),
    // Top & side breech guide shoulders
    boxAt(38, 8, 44, 0, 16, 0, LEO_ARMOR_STEEL, 0.6),
    boxAt(38, 8, 44, 0, -16, 0, LEO_ARMOR_STEEL, 0.6),
    // Twin curved rear spent stub-base extractor forks & semi-auto operating crank lever
    boxAt(10, 24, 5, -15, 0, -14, LEO_CHROME_ROD, 0.4),
    boxAt(10, 24, 5, -15, 0, 14, LEO_CHROME_ROD, 0.4),
    cylZ(4.5, 4.5, 44, -6, -13, 0, LEO_COPPER_PIPE, 16, 0.3),
    // Electric primer firing-pin contact block at center rear
    cylX(5.5, 5.5, 6, -16, 0, 0, LEO_BRASS_STUB, 16, 0.25),
  ];
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** FC-02: Dynamic CSG Spring #2 — Heavy X-axis breech closing helical spring (`aSpringParam` w=1!). */
export function buildLeoBreechSpringGeometry(): THREE.BufferGeometry {
  // Assembled at [20, +52, -16] -> spans X_local ∈ [0, +38] (L0 = 38 cm)
  const spring = createHelicalSpring({
    axis: 'x',
    start: 0,
    end: LEO_BREECH_SPRING_L0,
    centerY: 0,
    centerZ: 0,
    coilRadius: 3.8,
    wireRadius: 0.95,
    coils: 11,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  paintGeometry(spring, LEO_SPRING_STEEL);
  return sanitizeLeopardMesh(spring);
}

/** FC-03: Commander's elevated PERI R17A3 panoramic thermal periscope + Gunner's EMES-15 primary sight. */
export function buildLeoOpticsPeriGeometry(): THREE.BufferGeometry {
  // Assembled at [64, +116, +58] -> local X ∈ [-44, +54], Y ∈ [-20, +28] (world Y_max = +144 cm!), Z ∈ [-18, +32]
  const parts: THREE.BufferGeometry[] = [
    // 1. Commander's elevated PERI R17A3 stabilized panoramic thermal periscope (local X=-28, Z=+4)
    cylY(15, 16, 12, -28, 6, 4, LEO_NATO_GREEN, 24, 0.5),
    boxAt(26, 18, 28, -28, 19, 4, LEO_NATO_BLACK, 0.8),
    // PERI multi-coated emerald-sapphire optical head window
    boxAt(5, 12, 18, -14, 19, 4, LEO_OPTIC_EMERALD, 0.3),
    // 2. Gunner's recessed front-right EMES-15 armored primary sight doghouse (local X=+28, Y=-6, Z=+10)
    boxAt(52, 26, 44, 28, -6, 10, LEO_NATO_GREEN, 1.0),
    // Armored vertical shutter doors framing twin EMES-15 lenses
    boxAt(8, 22, 6, 50, -6, -9, LEO_NATO_BLACK, 0.4),
    boxAt(8, 22, 6, 50, -6, 29, LEO_NATO_BLACK, 0.4),
    // Twin emerald-sapphire multi-coated EMES-15 laser/thermal objective lenses
    boxAt(4, 16, 14, 52, -6, 1, LEO_OPTIC_EMERALD, 0.25),
    boxAt(4, 16, 14, 52, -6, 19, LEO_OPTIC_EMERALD, 0.25),
  ];
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** F-11: Twin 8-barrel Wegmann 76mm smoke discharger banks angled off the turret flanks. */
export function buildLeoSmokeDischargersGeometry(): THREE.BufferGeometry {
  // Assembled at [14, +86, 0] -> local X ∈ [-30, +30], Y ∈ [-18, +18], Z ∈ [-186, +186]
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    // Armored standoff mounting bracket bolted to turret cheek
    parts.push(boxAt(34, 14, 16, 0, -4, side * 165, LEO_NATO_BLACK, 0.5));
    // 2 staggered rows × 4 barrels = 8 Wegmann 76mm smoke tubes per side (16 total)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const bx = -14 + col * 9.5;
        const by = -2 + row * 9.5;
        const bz = side * (173 + row * 4.5);
        const tube = createBeveledCylinder(
          3.9,
          3.9,
          28,
          0.3,
          14,
          LEO_NATO_GREEN
        );
        tube.rotateZ(-Math.PI / 2 + 0.48); // Elevated +27.5° upward
        tube.rotateY(side * (-0.28 + col * 0.14)); // Fanned dispersion arc
        tube.translate(bx + 6, by + 4, bz);
        parts.push(tube);
      }
    }
  }
  return sanitizeLeopardMesh(mergeParts(parts));
}

// ============================================================================
// SUITE 3 — MTU V12, RENK TRANSMISSION, COOLING FANS, BLAST DOOR, AMMO & CREW (8)
// ============================================================================

/** FC-04: THE ENGINE SHOWPIECE — MTU MB 873 Ka-501 47.6L 1,500 HP Twin-Turbo V12 Diesel Engine. */
export function buildLeoMtuV12Geometry(): THREE.BufferGeometry {
  // Assembled at [-198, -8, 0] -> local X ∈ [-76, +76], Y ∈ [-46, +52], Z ∈ [-86, +86]
  const parts: THREE.BufferGeometry[] = [
    // Deep finned aluminum oil sump & 90° V-crankcase block
    boxAt(146, 30, 88, 0, -31, 0, LEO_RENK_GUNMETAL, 1.0),
    boxAt(144, 34, 114, 0, -6, 0, LEO_MTU_ALUMINUM, 1.2),
    // Twin angled 90° V12 cylinder banks (6 cylinders per bank = 12 distinct heads!)
    ...[-1, 1].flatMap((side) => {
      const bank: THREE.BufferGeometry[] = [
        // Main V-bank cylinder head rail
        boxAt(136, 26, 46, 0, 16, side * 56, LEO_MTU_ALUMINUM, 1.0, [
          side * 0.42,
          0,
          0,
        ]),
        // Warm copper-bronze charge-air intercooler crossover pipe along bank crown
        cylX(7.5, 7.5, 132, 0, 38, side * 52, LEO_COPPER_PIPE, 18, 0.4),
        // Exhaust header manifold along inner V
        cylX(6.0, 6.0, 126, -4, 24, side * 24, LEO_RADIATOR_COPPER, 16, 0.35),
      ];
      for (let c = 0; c < 6; c++) {
        const cx = -55 + c * 22;
        bank.push(
          boxAt(17, 14, 28, cx, 30, side * 62, LEO_BREECH_STEEL, 0.6, [
            side * 0.42,
            0,
            0,
          ])
        );
      }
      return bank;
    }),
    // Twin gleaming snail-housing exhaust turbochargers atop rear V-valley
    cylZ(16, 16, 20, -48, 36, -24, LEO_CHROME_ROD, 20, 0.6),
    cylZ(16, 16, 20, -48, 36, 24, LEO_CHROME_ROD, 20, 0.6),
    cylZ(13, 13, 16, -48, 36, -38, LEO_COPPER_PIPE, 18, 0.5),
    cylZ(13, 13, 16, -48, 36, 38, LEO_COPPER_PIPE, 18, 0.5),
    // Central V-valley injection pump & front pulley stack
    boxAt(76, 18, 30, 14, 24, 0, LEO_RENK_GUNMETAL, 0.6),
    cylX(15, 15, 12, 70, -14, 0, LEO_ARMOR_STEEL, 20, 0.4),
  ];
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** FC-05: RENK HSWL 354 4-forward/2-reverse hydro-mechanical gearbox + copper radiator banks + left sister fan. */
export function buildLeoRenkTransmissionGeometry(): THREE.BufferGeometry {
  // Assembled at [-320, -16, 0] -> local X ∈ [-46, +46], Y ∈ [-40, +42], Z ∈ [-104, +104]
  const parts: THREE.BufferGeometry[] = [
    // Central RENK HSWL 354 ribbed gearbox & hydro-dynamic torque converter housing
    boxAt(84, 62, 132, 0, -8, 0, LEO_RENK_GUNMETAL, 1.2),
    cylX(28, 28, 36, 28, -6, 0, LEO_MTU_ALUMINUM, 24, 0.6),
    // Twin lateral final-drive output shafts & ventilated disc brakes aligned above hull belly
    cylZ(12, 12, 208, -6, -18, 0, LEO_BREECH_STEEL, 20, 0.5),
    cylZ(21, 21, 10, -6, -18, -84, LEO_CHROME_ROD, 20, 0.4),
    cylZ(21, 21, 10, -6, -18, 84, LEO_CHROME_ROD, 20, 0.4),
    // Twin flanking copper-fin cross-flow radiator cores
    boxAt(78, 32, 18, 0, 14, -88, LEO_RADIATOR_COPPER, 0.6),
    boxAt(78, 32, 18, 0, 14, 88, LEO_RADIATOR_COPPER, 0.6),
    // Static sister left-side radial cooling fan impeller under left deck grille (Z_local = -46, Y_local = +34 -> world Y=+18..+42)
    cylY(12, 12, 12, 2, 34, -46, LEO_BRASS_STUB, 16, 0.3),
    hollowRingY(39, 34, 10, 2, 34, -46, LEO_COPPER_PIPE, 28),
  ];
  for (let b = 0; b < 10; b++) {
    const a = (b / 10) * Math.PI * 2;
    parts.push(
      boxAt(
        26,
        7,
        4.5,
        2 + Math.cos(a) * 22,
        34,
        -46 + Math.sin(a) * 22,
        LEO_MTU_ALUMINUM,
        0.2,
        [0.45, -a, 0]
      )
    );
  }
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** FC-06: Spinning right-side high-output radial cooling fan impeller & coaxial copper-fin shroud (`ry = 2π*f`). */
export function buildLeoCoolingFansGeometry(): THREE.BufferGeometry {
  // Assembled at [-318, +36, +46] -> local X ∈ [-42, +42], Y ∈ [-7, +7], Z ∈ [-42, +42]
  const parts: THREE.BufferGeometry[] = [
    // Central machined steel/brass impeller spinner hub
    cylY(12, 13, 14, 0, 0, 0, LEO_BRASS_STUB, 24, 0.4),
    // Outer coaxial copper-fin heat exchanger shroud ring
    hollowRingY(42, 37, 12, 0, 0, 0, LEO_RADIATOR_COPPER, 36),
  ];
  // 14 swept high-output aluminum radial cooling turbine blades
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    parts.push(
      boxAt(
        25,
        9.5,
        3.6,
        Math.cos(a) * 23,
        0,
        Math.sin(a) * 23,
        LEO_CHROME_ROD,
        0.25,
        [0.48, -a, 0]
      )
    );
  }
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** M-01: Armored sliding turret bustle ammunition blast door (slides laterally -34 cm during reload!). */
export function buildLeoBlastDoorGeometry(): THREE.BufferGeometry {
  // Assembled at [-58, +84, 0] -> local X ∈ [-6, +6], Y ∈ [-24, +24], Z ∈ [-54, +54]
  const parts: THREE.BufferGeometry[] = [
    // Heavy armored blast leaf plate
    boxAt(9, 44, 102, 0, 0, 0, LEO_ARMOR_STEEL, 0.7),
    // Upper & lower sliding guide rails
    boxAt(12, 4, 108, 0, 22, 0, LEO_BREECH_STEEL, 0.4),
    boxAt(12, 4, 108, 0, -22, 0, LEO_BREECH_STEEL, 0.4),
    // High-contrast German yellow hazard caution band & armored grab handle
    boxAt(2, 10, 88, 5, 10, 0, LEO_HAZARD_YELLOW, 0.2),
    boxAt(3, 14, 5, 5, -4, 34, LEO_CHROME_ROD, 0.2),
  ];
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** M-02: 15-round turret bustle ready rack holding 14 static 120mm DM63A1 APFSDS rounds (1 slot open for `leo_ready_round`). */
export function buildLeoAmmoBustleGeometry(): THREE.BufferGeometry {
  // Assembled at [-120, +84, 0] -> local X ∈ [-52, +52], Y ∈ [-24, +24], Z ∈ [-108, +108]
  const parts: THREE.BufferGeometry[] = [
    // Armored honeycomb frame plates (front & rear retention plates)
    boxAt(6, 48, 216, -49, 0, 0, LEO_ARMOR_STEEL, 0.6),
    boxAt(6, 48, 216, 49, 0, 0, LEO_ARMOR_STEEL, 0.6),
    boxAt(104, 4, 216, 0, -22, 0, LEO_NATO_BLACK, 0.4),
    boxAt(104, 4, 216, 0, 22, 0, LEO_NATO_BLACK, 0.4),
  ];
  // 3 rows × 5 columns = 15 ready slots; skip (row=0, col=3 -> Y_world=+74, Z_world=+20) for animated `leo_ready_round`!
  const rowYs = [-10, 3, 15];
  const colZs = [-76, -44, -12, 20, 52];
  for (let r = 0; r < rowYs.length; r++) {
    for (let c = 0; c < colZs.length; c++) {
      if (r === 0 && c === 3) continue; // Animated ready-round slot!
      parts.push(...buildSingle120mmRound(0, rowYs[r], colZs[c]));
    }
  }
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** M-03: Forward-left hull 27-round horizontal armored ammunition bunker. */
export function buildLeoHullAmmoRackGeometry(): THREE.BufferGeometry {
  // Assembled at [195, -24, -58] -> local X ∈ [-57, +57], Y ∈ [-30, +38], Z ∈ [-44, +44]
  const parts: THREE.BufferGeometry[] = [
    // Armored bunker frame housing (3 tiers × 4 visible columns representing 27-rd rack)
    boxAt(114, 6, 88, 0, -27, 0, LEO_ARMOR_STEEL, 0.6),
    boxAt(114, 6, 88, 0, 35, 0, LEO_ARMOR_STEEL, 0.6),
    boxAt(114, 62, 6, 0, 4, -41, LEO_ARMOR_STEEL, 0.6),
    boxAt(114, 62, 6, 0, 4, 41, LEO_ARMOR_STEEL, 0.6),
    boxAt(6, 62, 82, 54, 4, 0, LEO_NATO_BLACK, 0.5),
  ];
  // 3 rows × 4 columns of gleaming 120mm DM63A1 rounds stacked inside the bunker
  for (const ry of [-14, 4, 22]) {
    for (const rz of [-27, -9, 9, 27]) {
      parts.push(...buildSingle120mmRound(2, ry, rz));
    }
  }
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** M-04: Animated individual 120mm DM63A1 APFSDS unitary round sliding from bustle into the L/55A1 breech. */
export function buildLeoReadyRoundGeometry(): THREE.BufferGeometry {
  // Assembled at [-118, +74, +20] -> local X ∈ [-49.2, +49.2], Y/Z ∈ [-7.7, +7.7]
  const parts = buildSingle120mmRound(0, 0, 0);
  // Add 6 precision cruciform tail fins near dart tail
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    parts.push(
      boxAt(10, 5.2, 0.6, 27, 0, 0, LEO_TUNGSTEN_DART, 0.1, [a, 0, 0])
    );
  }
  return sanitizeLeopardMesh(mergeParts(parts));
}

/** FC-07: Front-right driver's station + stepped gunner/commander/loader seats & IFIS digital terminals. */
export function buildLeoCrewStationsGeometry(): THREE.BufferGeometry {
  // Assembled at [108, +20, +34] -> local X ∈ [-130, +156], Y ∈ [-74, +66], Z ∈ [-120, +64]
  const parts: THREE.BufferGeometry[] = [
    // 1. Front-right Driver's station (local X ∈ [+54, +156], Y ∈ [-74, +12], Z ∈ [-20, +62])
    boxAt(46, 12, 44, 92, -68, 22, LEO_CREW_SEAT, 0.8),
    boxAt(14, 52, 44, 68, -42, 22, LEO_CREW_SEAT, 0.8, [0, 0, 0.25]),
    // Leopard 2 yoke steering wheel & driver's instrument panel
    boxAt(18, 22, 54, 146, -24, 22, LEO_NATO_BLACK, 0.6),
    cylX(15, 15, 4, 132, -24, 22, LEO_CHROME_ROD, 18, 0.3),
    boxAt(12, 10, 42, 124, 6, 22, LEO_IFIS_CYAN, 0.4),

    // 2. Stepped Gunner's station (lower right turret, local X ∈ [-64, -14], Y ∈ [-44, +18], Z ∈ [+12, +60])
    boxAt(42, 10, 40, -40, -39, 36, LEO_CREW_SEAT, 0.8),
    boxAt(12, 46, 40, -58, -16, 36, LEO_CREW_SEAT, 0.8),
    // Dual EMES-15 gunner control handles & display terminal
    boxAt(14, 18, 28, -18, 4, 38, LEO_IFIS_CYAN, 0.4),

    // 3. Commander's elevated station (rear-upper right, local X ∈ [-124, -76], Y ∈ [-10, +66], Z ∈ [+14, +62])
    boxAt(40, 10, 40, -100, -5, 38, LEO_CREW_SEAT, 0.8),
    boxAt(12, 48, 40, -118, 19, 38, LEO_CREW_SEAT, 0.8),
    // IFIS digital tactical battle-management LCD display
    boxAt(10, 22, 32, -80, 52, 36, LEO_IFIS_CYAN, 0.4),

    // 4. Loader's folding bucket seat & breech guard rail (left turret, local X ∈ [-130, -60], Y ∈ [-40, +38], Z ∈ [-120, -76])
    boxAt(40, 10, 38, -96, -35, -98, LEO_CREW_SEAT, 0.8),
    boxAt(10, 42, 38, -116, -14, -98, LEO_CREW_SEAT, 0.8),
    boxAt(68, 4, 4, -94, 34, -78, LEO_HAZARD_YELLOW, 0.3),
  ];
  return sanitizeLeopardMesh(mergeParts(parts));
}
