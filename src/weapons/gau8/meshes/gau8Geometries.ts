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
// General Electric GAU-8/A Avenger (30x173mm 7-Barrel Rotary Autocannon)
// TRUE 1:1 REAL-WORLD CAD METROLOGY (1 world unit = 1 cm = 10 mm)
// +X = Muzzle (+320.0 cm), +Y = Up, +Z = Right Flank
// Complete System Length: 606.0 cm (-286.0 cm drum aft dome -> +320.0 cm muzzle)
// Hangar Concrete Deck Contact: Y = -74.0 cm (gridY = -75.0)
// ============================================================================

export const GAU8_GROUND_Y = -74.0;
export const GAU8_BARREL_COUNT = 7;
export const GAU8_PITCH_RADIUS = 7.4; // 74 mm pitch radius around (Y=0, Z=0)
export const GAU8_BARREL_LENGTH = 230.0; // 2,300 mm fluted 30mm heavy barrels
export const GAU8_MUZZLE_X = 320.0; // Forward tip of perforated muzzle clamp
export const GAU8_CHAMBER_X = 78.0; // 12 o'clock chamber ignition station
export const GAU8_BOLT_X_FWD = 60.0; // 12 o'clock locked forward bolt center
export const GAU8_BOLT_STROKE = 30.0; // 300 mm sinusoidal cam stroke for 290mm OAL 30x173mm round
export const GAU8_BOLT_X_MID = GAU8_BOLT_X_FWD - GAU8_BOLT_STROKE * 0.5; // +45.0 cm
export const GAU8_CAM_CENTER_X = 41.0; // 360-degree elliptical sinusoidal cam center
export const GAU8_DRUM_RADIUS = 43.8; // 876 mm diameter 1,150-round helical drum
export const GAU8_DRUM_LENGTH = 181.6; // 1,816 mm helical drum length
export const GAU8_DRUM_STATIONS = 14; // 14-fold rotational symmetry on drum rotor & rounds

export function gau8BoltPhaseAngle(index0to6: number): number {
  return (index0to6 * Math.PI * 2) / GAU8_BARREL_COUNT;
}

export function gau8BoltAssembledPos(
  index0to6: number
): [number, number, number] {
  const th = gau8BoltPhaseAngle(index0to6);
  const halfStroke = GAU8_BOLT_STROKE * 0.5;
  const x0 = Number(
    (GAU8_BOLT_X_FWD - halfStroke * (1 - Math.cos(th))).toFixed(4)
  );
  const y0 = Number((GAU8_PITCH_RADIUS * Math.cos(th)).toFixed(4));
  const z0 = Number((GAU8_PITCH_RADIUS * Math.sin(th)).toFixed(4));
  return [x0, y0, z0];
}

// Shared assembled positions (world space, 1 world unit = 1 cm)
export const GAU8_POS = {
  // Suite 1: Exterior Gun, Barrels, Mount, Hydraulics & Transfer (8 solid GLB)
  gau8_barrel_cluster: [84.0, 0.0, 0.0] as [number, number, number],
  gau8_barrel_clamps: [195.0, 0.0, 0.0] as [number, number, number],
  gau8_muzzle_clamp: [309.0, 0.0, 0.0] as [number, number, number],
  gau8_gun_housing: [36.0, 0.0, 0.0] as [number, number, number],
  gau8_recoil_mount: [42.0, -37.0, 0.0] as [number, number, number],
  gau8_recoil_buffers: [46.0, -18.5, 0.0] as [number, number, number],
  gau8_hydraulic_motors: [-28.0, 12.0, 0.0] as [number, number, number],
  gau8_transfer_unit: [-12.0, -16.0, 0.0] as [number, number, number],

  // Suite 2: Internal Cam Track, Star-Rotor & 7 Reciprocating Rotary Bolts (9 solid GLB)
  gau8_cam_track: [41.0, 0.0, 0.0] as [number, number, number],
  gau8_rotor_core: [30.0, 0.0, 0.0] as [number, number, number],
  gau8_bolt_1: gau8BoltAssembledPos(0),
  gau8_bolt_2: gau8BoltAssembledPos(1),
  gau8_bolt_3: gau8BoltAssembledPos(2),
  gau8_bolt_4: gau8BoltAssembledPos(3),
  gau8_bolt_5: gau8BoltAssembledPos(4),
  gau8_bolt_6: gau8BoltAssembledPos(5),
  gau8_bolt_7: gau8BoltAssembledPos(6),

  // Suite 3: Helical 1,150-Rd Drum, Drum Rotor, 30x173mm PGU-14/B Stack & Dual Chutes (5 solid GLB)
  gau8_ammo_drum: [-195.0, -12.0, 0.0] as [number, number, number],
  gau8_drum_rotor: [-195.0, -12.0, 0.0] as [number, number, number],
  gau8_ammo_belt_stack: [-195.0, -12.0, 0.0] as [number, number, number],
  gau8_chute_feed: [-66.0, -6.0, -24.0] as [number, number, number],
  gau8_chute_return: [-66.0, -18.0, 24.0] as [number, number, number],

  // Dynamic aSpringParam CSG Helical Springs (3 parts, skipped in gau8.glb)
  gau8_recoil_springs: [46.0, -25.0, 0.0] as [number, number, number],
  gau8_buffer_spring: [-28.0, 1.5, 0.0] as [number, number, number],
  gau8_striker_spring: [56.0, 11.4, 0.0] as [number, number, number],
} as const;

// Physically calibrated USAF aerospace palette (linear luminance >> 0.018 AgX floor)
export const GAU8_TITANIUM_GREY = '#636d78';
export const GAU8_BARREL_STEEL = '#4b535f';
export const GAU8_MUZZLE_BRONZE = '#7a634c';
export const GAU8_HOUSING_PRIMER = '#475249';
export const GAU8_DRUM_OLIVE = '#4d5b49';
export const GAU8_CHROME_BOLT = '#cdd7e3';
export const GAU8_ROTOR_CNC = '#8e98a6';
export const GAU8_HYDRAULIC_BLUE = '#3f5a75';
export const GAU8_HAZARD_YELLOW = '#e8b923';
export const GAU8_API_RED = '#cf2e2a';
export const GAU8_API_BLACK = '#323740';
export const GAU8_ALU_CASE = '#c5ced9';
export const GAU8_COPPER_BAND = '#c4743f';
export const GAU8_SPRING_STEEL = '#94a3b8';

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
 * generates clean [0.04, 0.96] triplanar-box UVs for offline CSG fallback parity.
 */
export function sanitizeGau8Mesh(
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
        cArr[di * 3 + 1] = col ? col.getY(si) : 0.48;
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
// Watertight CSG Primitive Helpers
// ============================================================================

function boxAt(
  sx: number,
  sy: number,
  sz: number,
  cx: number,
  cy: number,
  cz: number,
  color: string,
  chamfer = 0.35
): THREE.BufferGeometry {
  const c = Math.min(chamfer, sx * 0.22, sy * 0.22, sz * 0.22);
  const g = createChamferedBox(sx, sy, sz, c, color);
  g.translate(cx, cy, cz);
  return g;
}

function cylX(
  rTop: number,
  rBot: number,
  length: number,
  cx: number,
  cy: number,
  cz: number,
  color: string,
  segs = 22,
  bevel = 0.25
): THREE.BufferGeometry {
  const g = createBeveledCylinder(
    rTop,
    rBot,
    length,
    Math.min(bevel, length * 0.22, Math.min(rTop, rBot) * 0.28),
    segs,
    color
  );
  g.rotateZ(-Math.PI / 2);
  g.translate(cx, cy, cz);
  return g;
}

function cylY(
  rTop: number,
  rBot: number,
  length: number,
  cx: number,
  cy: number,
  cz: number,
  color: string,
  segs = 20,
  bevel = 0.25
): THREE.BufferGeometry {
  const g = createBeveledCylinder(
    rTop,
    rBot,
    length,
    Math.min(bevel, length * 0.22, Math.min(rTop, rBot) * 0.28),
    segs,
    color
  );
  g.translate(cx, cy, cz);
  return g;
}

function hollowTubeX(
  rOut: number,
  rIn: number,
  length: number,
  cx: number,
  cy: number,
  cz: number,
  color: string,
  segs = 32
): THREE.BufferGeometry {
  const outer = new THREE.CylinderGeometry(rOut, rOut, length, segs);
  const inner = new THREE.CylinderGeometry(rIn, rIn, length + 4, segs);
  paintGeometry(outer, color);
  paintGeometry(inner, color);
  const tube = csgSubtract(outer, [inner]);
  outer.dispose();
  inner.dispose();
  tube.rotateZ(-Math.PI / 2);
  tube.translate(cx, cy, cz);
  return tube;
}

// ============================================================================
// SUITE 1 — EXTERIOR BARRELS, HOUSING, MOUNT, HYDRAULICS & TRANSFER (8 Parts)
// ============================================================================

/** 1. `gau8_barrel_cluster` (assembledPos = [84, 0, 0], local X in [0, 230]) */
export function buildGau8BarrelClusterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < GAU8_BARREL_COUNT; i++) {
    const th = gau8BoltPhaseAngle(i);
    const cy = GAU8_PITCH_RADIUS * Math.cos(th);
    const cz = GAU8_PITCH_RADIUS * Math.sin(th);
    // Rear heavy breech chamber section + locking collar
    parts.push(cylX(3.05, 3.05, 8.0, 4.0, cy, cz, GAU8_TITANIUM_GREY, 16, 0.2));
    parts.push(cylX(2.75, 2.85, 34.0, 25.0, cy, cz, GAU8_BARREL_STEEL, 16, 0.2));
    // Tapered fluted mid section
    parts.push(cylX(2.35, 2.75, 138.0, 111.0, cy, cz, GAU8_BARREL_STEEL, 16, 0.2));
    // Forward muzzle section with hollow 30mm bore mouth
    parts.push(hollowTubeX(2.25, 1.5, 50.0, 205.0, cy, cz, GAU8_BARREL_STEEL, 16));
  }
  // Rear integral breech alignment hub
  parts.push(cylX(4.4, 4.4, 10.0, 5.0, 0, 0, GAU8_TITANIUM_GREY, 20, 0.25));
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 2. `gau8_barrel_clamps` (assembledPos = [195, 0, 0], local X in [-46, +46]) */
export function buildGau8BarrelClampsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const cx of [-42.0, 42.0]) {
    const disc = new THREE.CylinderGeometry(11.8, 11.8, 8.0, 28);
    paintGeometry(disc, GAU8_TITANIUM_GREY);
    disc.rotateZ(-Math.PI / 2);
    const cutters: THREE.BufferGeometry[] = [];
    for (let i = 0; i < GAU8_BARREL_COUNT; i++) {
      const th = gau8BoltPhaseAngle(i);
      const hole = new THREE.CylinderGeometry(2.55, 2.55, 12.0, 14);
      hole.rotateZ(-Math.PI / 2);
      hole.translate(0, GAU8_PITCH_RADIUS * Math.cos(th), GAU8_PITCH_RADIUS * Math.sin(th));
      cutters.push(hole);
    }
    const spider = csgSubtract(disc, cutters);
    disc.dispose();
    cutters.forEach((c) => c.dispose());
    spider.translate(cx, 0, 0);
    parts.push(spider);
  }
  // Central hollow aerospace spacer tube connecting both titanium spider discs
  parts.push(hollowTubeX(3.8, 2.6, 84.0, 0, 0, 0, GAU8_TITANIUM_GREY, 20));
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 3. `gau8_muzzle_clamp` (assembledPos = [309, 0, 0], local X in [-9, +11]) */
export function buildGau8MuzzleClampGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const drum = new THREE.CylinderGeometry(12.0, 11.8, 20.0, 28);
  paintGeometry(drum, GAU8_MUZZLE_BRONZE);
  drum.rotateZ(-Math.PI / 2);
  const cutters: THREE.BufferGeometry[] = [];
  for (let i = 0; i < GAU8_BARREL_COUNT; i++) {
    const th = gau8BoltPhaseAngle(i);
    const hole = new THREE.CylinderGeometry(2.3, 2.3, 26.0, 14);
    hole.rotateZ(-Math.PI / 2);
    hole.translate(0, GAU8_PITCH_RADIUS * Math.cos(th), GAU8_PITCH_RADIUS * Math.sin(th));
    cutters.push(hole);
  }
  const cage = csgSubtract(drum, cutters);
  drum.dispose();
  cutters.forEach((c) => c.dispose());
  cage.translate(1.0, 0, 0);
  parts.push(cage);
  // Central perforated blast spinner nose cap
  parts.push(cylX(3.6, 4.0, 18.0, 1.0, 0, 0, GAU8_TITANIUM_GREY, 18, 0.3));
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 4. `gau8_gun_housing` (assembledPos = [36, 0, 0], local X in [-54, +52], isShell: true) */
export function buildGau8GunHousingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Hollow ribbed cylindrical forged steel gun housing (inner R=14.8, outer R=17.6)
  parts.push(hollowTubeX(17.6, 14.8, 102.0, -1.0, 0, 0, GAU8_HOUSING_PRIMER, 32));
  // Front & rear heavy bolted mounting flanges
  parts.push(hollowTubeX(20.6, 14.8, 8.0, 48.0, 0, 0, GAU8_TITANIUM_GREY, 32));
  parts.push(hollowTubeX(20.6, 14.8, 8.0, -50.0, 0, 0, GAU8_TITANIUM_GREY, 32));
  // 8 longitudinal external stiffening ribs
  for (let i = 0; i < 8; i++) {
    const th = (i * Math.PI) / 4;
    const rib = createChamferedBox(92.0, 2.4, 2.2, 0.3, GAU8_HOUSING_PRIMER);
    rib.translate(-1.0, 18.2, 0);
    rib.rotateX(th);
    parts.push(rib);
  }
  // Left & Right flat machined USAF nomenclature plates (Z = ±18.4)
  parts.push(boxAt(72.0, 15.0, 1.6, 0.0, 1.0, 18.4, GAU8_HOUSING_PRIMER, 0.2));
  parts.push(boxAt(72.0, 15.0, 1.6, 0.0, 1.0, -18.4, GAU8_HOUSING_PRIMER, 0.2));
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 5. `gau8_recoil_mount` (assembledPos = [42, -37, 0], feet flush at local Y = -37 -> world Y = -74.0 cm) */
export function buildGau8RecoilMountGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Upper titanium A-10 fuselage recoil cradle saddles wrapping beneath housing (local Y = +14..+42)
  for (const sx of [-42.0, 42.0]) {
    parts.push(boxAt(14.0, 14.0, 48.0, sx, 20.0, 0, GAU8_TITANIUM_GREY, 0.5));
    for (const sz of [-22.0, 22.0]) {
      parts.push(boxAt(14.0, 22.0, 7.0, sx, 31.0, sz, GAU8_TITANIUM_GREY, 0.4));
    }
  }
  // Twin longitudinal titanium frame rails connecting front & rear saddles
  for (const sz of [-22.0, 22.0]) {
    parts.push(boxAt(106.0, 8.0, 7.5, 0, 18.0, sz, GAU8_TITANIUM_GREY, 0.4));
  }
  // Heavy hangar A-frame maintenance stand legs descending to concrete deck (local Y = -37.0 exact)
  for (const sx of [-40.0, 40.0]) {
    for (const sz of [-24.0, 24.0]) {
      const leg = createChamferedBox(9.0, 50.0, 7.5, 0.4, GAU8_HAZARD_YELLOW);
      leg.rotateX(sz > 0 ? -0.14 : 0.14);
      leg.translate(sx, -10.0, sz * 1.12);
      parts.push(leg);
    }
    // Cross tie-beam
    parts.push(boxAt(8.0, 7.0, 58.0, sx, -24.0, 0, GAU8_TITANIUM_GREY, 0.4));
  }
  // Wide longitudinal floor skids resting flush at local Y = -37.0 -> world Y = -74.0 cm!
  for (const sz of [-30.0, 30.0]) {
    parts.push(boxAt(110.0, 6.0, 9.0, 0, -34.0, sz, GAU8_API_BLACK, 0.4));
  }
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 6. `gau8_recoil_buffers` (assembledPos = [46, -18.5, 0], twin hydro-pneumatic cylinders at Z = ±21.5) */
export function buildGau8RecoilBuffersGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sz of [-21.5, 21.5]) {
    // Outer anodized titanium hydraulic cylinder barrel
    parts.push(cylX(4.2, 4.2, 54.0, -8.0, 0, sz, GAU8_TITANIUM_GREY, 20, 0.3));
    // Rear & forward hydraulic end manifolds
    parts.push(boxAt(8.0, 9.8, 9.8, -36.0, 0, sz, GAU8_HYDRAULIC_BLUE, 0.4));
    parts.push(boxAt(8.0, 9.8, 9.8, 20.0, 0, sz, GAU8_HYDRAULIC_BLUE, 0.4));
    // Mirror-chrome telescoping piston rod extending forward to gun front flange
    parts.push(cylX(2.2, 2.2, 28.0, 26.0, 0, sz, GAU8_CHROME_BOLT, 18, 0.2));
    parts.push(boxAt(5.5, 8.5, 8.5, 39.0, 0, sz, GAU8_TITANIUM_GREY, 0.3));
  }
  // Cross-equalizer hydraulic balance manifold pipe
  parts.push(boxAt(5.0, 4.0, 44.0, -36.0, 0, 0, GAU8_CHROME_BOLT, 0.3));
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 7. `gau8_hydraulic_motors` (assembledPos = [-28, 12, 0], twin 38.5-HP drive motors + rear gearbox) */
export function buildGau8HydraulicMotorsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Rear pear-shaped reduction gearbox casing enclosing rotor rear drive gear
  parts.push(boxAt(26.0, 34.0, 34.0, 0, -4.0, 0, GAU8_HOUSING_PRIMER, 0.8));
  parts.push(cylX(15.5, 15.5, 18.0, 4.0, -12.0, 0, GAU8_TITANIUM_GREY, 26, 0.4));
  // Twin 38.5-HP 3,000 PSI hydraulic drive motor barrels (left & right at Z = ±14.5, local Y = +13)
  for (const sz of [-14.5, 14.5]) {
    parts.push(cylX(8.8, 8.8, 30.0, -2.0, 13.0, sz, GAU8_HYDRAULIC_BLUE, 22, 0.4));
    // End cap & high-pressure hydraulic manifold block
    parts.push(cylX(9.6, 9.6, 5.0, -16.5, 13.0, sz, GAU8_TITANIUM_GREY, 22, 0.3));
    parts.push(boxAt(10.0, 7.0, 6.5, 6.0, 20.0, sz, GAU8_CHROME_BOLT, 0.3));
  }
  // Top flat USAF high-pressure hydraulics warning placard
  parts.push(boxAt(24.0, 1.5, 22.0, -2.0, 22.5, 0, GAU8_HAZARD_YELLOW, 0.15));
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 8. `gau8_transfer_unit` (assembledPos = [-12, -16, 0], breech transfer & clearing sector gate) */
export function buildGau8TransferUnitGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Main machined transfer gearbox housing beneath rear of gun housing
  parts.push(boxAt(46.0, 22.0, 40.0, 0, 0, 0, GAU8_HOUSING_PRIMER, 0.6));
  // Left & right chute docking collars (-Z live feed intake, +Z spent return port)
  parts.push(boxAt(28.0, 15.0, 8.0, -4.0, 3.0, -21.0, GAU8_TITANIUM_GREY, 0.4));
  parts.push(boxAt(28.0, 15.0, 8.0, -4.0, -3.0, 21.0, GAU8_TITANIUM_GREY, 0.4));
  // Internal transfer sprocket hub visible from front/rear
  parts.push(cylX(9.5, 9.5, 38.0, 0, 1.0, 0, GAU8_ROTOR_CNC, 22, 0.3));
  // Quick-release clearing sector gate & high-visibility SAFE/ARMED plate on +Z face
  parts.push(boxAt(24.0, 12.0, 2.2, 6.0, 4.0, 20.6, GAU8_HAZARD_YELLOW, 0.2));
  parts.push(boxAt(5.5, 5.5, 3.2, 14.0, 4.0, 21.2, GAU8_API_RED, 0.2));
  return sanitizeGau8Mesh(mergeParts(parts));
}

// ============================================================================
// SUITE 2 — INTERNAL 360° HELICAL CAM TRACK, STAR-ROTOR & 7 BOLTS (9 Parts)
// ============================================================================

/** 9. `gau8_cam_track` (assembledPos = [41, 0, 0], local X in [-28, +28], isShell: true) */
export function buildGau8CamTrackGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Outer hardened tool-steel cam cylinder sleeve (R_in=12.4, R_out=14.6)
  parts.push(hollowTubeX(14.6, 12.4, 56.0, 0, 0, 0, GAU8_BARREL_STEEL, 36));
  // Sculpted 360-degree twin raised sinusoidal chrome cam guide rails along inner bore!
  const segs = 42;
  for (let i = 0; i < segs; i++) {
    const th = (i * Math.PI * 2) / segs;
    const xCam = 15.0 * Math.cos(th);
    for (const dxRail of [-2.4, 2.4]) {
      const pad = createChamferedBox(2.0, 1.6, 2.6, 0.15, GAU8_CHROME_BOLT);
      pad.translate(xCam + dxRail, 12.0, 0);
      pad.rotateX(th);
      parts.push(pad);
    }
  }
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 10. `gau8_rotor_core` (assembledPos = [30, 0, 0], local X in [-54, +58]) */
export function buildGau8RotorCoreGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Central CNC titanium-steel core shaft
  parts.push(cylX(4.8, 4.8, 108.0, 2.0, 0, 0, GAU8_ROTOR_CNC, 28, 0.35));
  // 7 axial star-flute T-guide rails evenly spaced at 51.4286°
  for (let i = 0; i < GAU8_BARREL_COUNT; i++) {
    const th = gau8BoltPhaseAngle(i) + Math.PI / GAU8_BARREL_COUNT;
    const fin = createChamferedBox(86.0, 5.8, 2.2, 0.25, GAU8_ROTOR_CNC);
    fin.translate(4.0, 7.6, 0);
    fin.rotateX(th);
    parts.push(fin);
  }
  // Front heavy 7-bore barrel lock head disc (local X = +46..+58)
  const head = new THREE.CylinderGeometry(11.4, 11.4, 12.0, 28);
  paintGeometry(head, GAU8_TITANIUM_GREY);
  head.rotateZ(-Math.PI / 2);
  const cutters: THREE.BufferGeometry[] = [];
  for (let i = 0; i < GAU8_BARREL_COUNT; i++) {
    const th = gau8BoltPhaseAngle(i);
    const hole = new THREE.CylinderGeometry(3.0, 3.0, 16.0, 14);
    hole.rotateZ(-Math.PI / 2);
    hole.translate(0, GAU8_PITCH_RADIUS * Math.cos(th), GAU8_PITCH_RADIUS * Math.sin(th));
    cutters.push(hole);
  }
  const lockHead = csgSubtract(head, cutters);
  head.dispose();
  cutters.forEach((c) => c.dispose());
  lockHead.translate(52.0, 0, 0);
  parts.push(lockHead);
  // Rear 28-tooth main rotor spur drive gear (local X = -54..-44)
  parts.push(cylX(11.2, 11.2, 9.5, -49.0, 0, 0, GAU8_CHROME_BOLT, 28, 0.3));
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 11..17. Shared local geometry for `gau8_bolt_1` .. `gau8_bolt_7` (local X in [-11, +13]) */
export function buildGau8RotaryBoltGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Main titanium-chrome reciprocating bolt carrier body
  parts.push(boxAt(18.5, 3.8, 3.6, -1.2, 0, 0, GAU8_CHROME_BOLT, 0.25));
  parts.push(cylX(2.05, 2.05, 18.0, -1.2, 0, 0, GAU8_CHROME_BOLT, 18, 0.2));
  // Forward 3-lug rotating locking bolt head (local X = +7.5..+13.0)
  parts.push(cylX(2.2, 2.2, 5.5, 10.2, 0, 0, GAU8_ROTOR_CNC, 18, 0.2));
  parts.push(boxAt(3.2, 4.8, 1.8, 10.5, 0, 0, GAU8_ROTOR_CNC, 0.15));
  parts.push(boxAt(3.2, 1.8, 4.8, 10.5, 0, 0, GAU8_ROTOR_CNC, 0.15));
  // Rear firing-pin striker tang (local X = -11..-9)
  parts.push(cylX(0.9, 0.9, 2.8, -10.0, 0, 0, GAU8_TITANIUM_GREY, 12, 0.1));
  // Radial cam-follower roller stud pointing along local +Y into the 360° helical cam track!
  parts.push(cylY(1.2, 1.35, 2.4, -4.0, 2.5, 0, GAU8_ROTOR_CNC, 16, 0.12));
  parts.push(cylY(1.75, 1.75, 2.1, -4.0, 4.35, 0, GAU8_CHROME_BOLT, 18, 0.15));
  return sanitizeGau8Mesh(mergeParts(parts));
}

// ============================================================================
// SUITE 3 — 1,150-RD HELICAL DRUM, ROTOR, 30x173MM STACK & CHUTES (5 Parts)
// ============================================================================

/** 18. `gau8_ammo_drum` (assembledPos = [-195, -12, 0], Ø87.6 cm x 181.6 cm, cradle feet at world Y = -74.0 cm) */
export function buildGau8AmmoDrumGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Hollow aerospace aluminum cylindrical drum shell (R_out=43.8, R_in=41.2, L=176)
  parts.push(hollowTubeX(43.8, 41.2, 174.0, 0, 0, 0, GAU8_DRUM_OLIVE, 40));
  // Bolted front & rear reinforced end bulkheads (total X in [-90.8, +90.8] -> 181.6 cm!)
  parts.push(hollowTubeX(44.2, 12.0, 4.2, -88.7, 0, 0, GAU8_TITANIUM_GREY, 40));
  parts.push(hollowTubeX(44.2, 12.0, 4.2, 88.7, 0, 0, GAU8_TITANIUM_GREY, 40));
  // 5 circumferential structural stiffening rings along drum shell
  for (const rx of [-66.0, -33.0, 0.0, 33.0, 66.0]) {
    parts.push(hollowTubeX(45.0, 43.4, 3.6, rx, 0, 0, GAU8_TITANIUM_GREY, 40));
  }
  // Left & Right flat USAF stenciled nomenclature plaques (Z = ±44.6)
  parts.push(boxAt(114.0, 30.0, 1.8, 0, 2.0, 44.6, GAU8_DRUM_OLIVE, 0.25));
  parts.push(boxAt(114.0, 30.0, 1.8, 0, 2.0, -44.6, GAU8_DRUM_OLIVE, 0.25));
  // Twin heavy structural floor support saddles descending to local Y = -62.0 -> world Y = -74.0 cm exact!
  for (const sx of [-58.0, 58.0]) {
    parts.push(boxAt(16.0, 22.0, 64.0, sx, -48.0, 0, GAU8_HAZARD_YELLOW, 0.5));
    parts.push(boxAt(20.0, 6.0, 74.0, sx, -59.0, 0, GAU8_API_BLACK, 0.4));
  }
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 19. `gau8_drum_rotor` (assembledPos = [-195, -12, 0], concentric internal helical scoop-disk rotor) */
export function buildGau8DrumRotorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Central stainless steel main conveyor torque shaft
  parts.push(cylX(10.5, 10.5, 168.0, 0, 0, 0, GAU8_ROTOR_CNC, 28, 0.4));
  // Front & rear 7-spoke spider bulkheads
  for (const sx of [-78.0, 78.0]) {
    parts.push(cylX(22.0, 22.0, 4.5, sx, 0, 0, GAU8_TITANIUM_GREY, 28, 0.3));
  }
  // 14 radial cartridge-divider vanes (exact 14-fold rotational symmetry!)
  for (let i = 0; i < GAU8_DRUM_STATIONS; i++) {
    const th = (i * Math.PI * 2) / GAU8_DRUM_STATIONS;
    const vane = createChamferedBox(152.0, 12.0, 1.6, 0.2, GAU8_ROTOR_CNC);
    vane.translate(0, 16.0, 0);
    vane.rotateX(th);
    parts.push(vane);
  }
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 20. `gau8_ammo_belt_stack` (assembledPos = [-195, -12, 0], 5 tiers x 14 = 70 full 1:1 30x173mm PGU-14/B rounds!) */
export function buildGau8AmmoBeltStackGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tierXs = [-62.0, -31.0, 0.0, 31.0, 62.0];
  const rOrbit = 31.8; // Cleanly inside drum inner bore (41.2) and outside drum rotor vanes (22.0)!
  for (let t = 0; t < tierXs.length; t++) {
    const cx = tierXs[t];
    for (let i = 0; i < GAU8_DRUM_STATIONS; i++) {
      const th = (i * Math.PI * 2) / GAU8_DRUM_STATIONS;
      const cy = rOrbit * Math.cos(th);
      const cz = rOrbit * Math.sin(th);
      // 30x173mm Brushed Aluminum Cartridge Case (17.3 cm long, Ø4.26 cm base -> Ø3.4 cm neck)
      parts.push(cylX(1.72, 2.12, 17.3, cx - 5.2, cy, cz, GAU8_ALU_CASE, 10, 0.12));
      // Black-Anodized PGU-14/B API Projectile Body + Crimson Nose Band (11.7 cm long -> 29.0 cm OAL!)
      parts.push(cylX(1.38, 1.54, 6.2, cx + 6.5, cy, cz, GAU8_API_BLACK, 10, 0.08));
      parts.push(cylX(0.32, 1.38, 5.5, cx + 12.2, cy, cz, GAU8_API_RED, 10, 0.06));
    }
  }
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 21. `gau8_chute_feed` (assembledPos = [-66, -6, -24], upper-left live 30mm feed chute bridging drum to transfer) */
export function buildGau8ChuteFeedGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Angled reinforced aerospace aluminum conveyor duct (local X in [-42, +42])
  parts.push(boxAt(82.0, 14.0, 16.0, 0, 0, 0, GAU8_TITANIUM_GREY, 0.5));
  // 7 structural stiffening ribs along chute span
  for (let i = -3; i <= 3; i++) {
    parts.push(boxAt(3.2, 17.2, 19.0, i * 11.5, 0, 0, GAU8_HOUSING_PRIMER, 0.25));
  }
  // Visible live 30x173mm PGU-14/B rounds through side inspection window
  for (let i = -1; i <= 1; i++) {
    parts.push(cylX(1.85, 2.1, 17.3, i * 26.0 - 4.0, 0, -8.8, GAU8_ALU_CASE, 10, 0.1));
    parts.push(cylX(0.35, 1.5, 11.0, i * 26.0 + 10.0, 0, -8.8, GAU8_API_RED, 10, 0.08));
  }
  return sanitizeGau8Mesh(mergeParts(parts));
}

/** 22. `gau8_chute_return` (assembledPos = [-66, -18, +24], lower-right spent-case return chute to drum!) */
export function buildGau8ChuteReturnGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Symmetrical spent aluminum-case return tunnel returning brass/alu cases back into drum
  parts.push(boxAt(82.0, 14.0, 16.0, 0, 0, 0, GAU8_TITANIUM_GREY, 0.5));
  for (let i = -3; i <= 3; i++) {
    parts.push(boxAt(3.2, 17.2, 19.0, i * 11.5, 0, 0, GAU8_HOUSING_PRIMER, 0.25));
  }
  // Visible spent 173mm aluminum cases riding back into the drum (headless fired cases!)
  for (let i = -1; i <= 1; i++) {
    parts.push(cylX(1.7, 2.1, 17.3, i * 26.0, 0, 8.8, GAU8_ALU_CASE, 10, 0.1));
  }
  return sanitizeGau8Mesh(mergeParts(parts));
}

// ============================================================================
// DYNAMIC `aSpringParam` CSG HELICAL SPRINGS (3 Parts — SKIPPED in `gau8.glb`!)
// ============================================================================

/**
 * 23. `gau8_recoil_springs` (assembledPos = [46, -25, 0], local X in [-32, +32], Z = ±21.5)
 * Twin heavy forged titanium-steel helical recoil recuperator springs compressing dynamically!
 */
export function buildGau8RecoilSpringsGeometry(): THREE.BufferGeometry {
  const leftCoil = createHelicalSpring({
    axis: 'x',
    start: -32.0,
    end: 32.0,
    centerY: 0,
    centerZ: -21.5,
    coilRadius: 3.1,
    wireRadius: 0.85,
    coils: 14,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  const rightCoil = createHelicalSpring({
    axis: 'x',
    start: -32.0,
    end: 32.0,
    centerY: 0,
    centerZ: 21.5,
    coilRadius: 3.1,
    wireRadius: 0.85,
    coils: 14,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  paintGeometry(leftCoil, GAU8_SPRING_STEEL);
  paintGeometry(rightCoil, GAU8_SPRING_STEEL);
  return sanitizeGau8Mesh(mergeParts([leftCoil, rightCoil]));
}

/**
 * 24. `gau8_buffer_spring` (assembledPos = [-28, 1.5, 0], local X in [-11, +11])
 * Hydraulic drive-clutch & transfer torque-limiting shock buffer helical spring.
 */
export function buildGau8BufferSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: -11.0,
    end: 11.0,
    centerY: 0,
    centerZ: 0,
    coilRadius: 2.35,
    wireRadius: 0.55,
    coils: 11,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  paintGeometry(spring, GAU8_SPRING_STEEL);
  return sanitizeGau8Mesh(spring);
}

/**
 * 25. `gau8_striker_spring` (assembledPos = [56, 11.4, 0], local X in [-9, +9])
 * 12 o'clock firing-cam heavy helical striker spring snapping on each 30mm ignition pulse.
 */
export function buildGau8StrikerSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: -9.0,
    end: 9.0,
    centerY: 0,
    centerZ: 0,
    coilRadius: 1.55,
    wireRadius: 0.42,
    coils: 12,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  paintGeometry(spring, GAU8_SPRING_STEEL);
  return sanitizeGau8Mesh(spring);
}
