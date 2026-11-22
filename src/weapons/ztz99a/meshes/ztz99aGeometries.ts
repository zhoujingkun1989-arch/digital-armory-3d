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
// PLA ZTZ-99A Main Battle Tank (125mm ZPT-98 L/50 + Carousel Autoloader)
// TRUE 1:1 REAL-WORLD CAD METROLOGY (1 world unit = 1 cm = 10 mm)
// +X = Forward / Muzzle (+710 cm), +Y = Up (+117 cm), +Z = Right Flank (+175 cm)
// Ground / Track Contact Plane: Y = -120.0 cm (gridY = -121.0)
// ============================================================================

export const ZTZ99A_GROUND_Y = -120.0;
export const ZTZ99A_BORE_Y = 38.0;
export const ZTZ99A_TURRET_CENTER_X = 22.0;
export const ZTZ99A_MUZZLE_X = 710.0;
export const ZTZ99A_RECOIL_STROKE = 32.0;
export const ZTZ99A_BREECH_DROP = 16.0;
export const ZTZ99A_HOIST_LIFT = 68.0;
export const ZTZ99A_RAMMER_STROKE = 54.0;
export const ZTZ99A_CAROUSEL_STATIONS = 22;

export const ZTZ99A_ROAD_WHEEL_XS = [248, 154, 62, -30, -122, -214] as const;
export const ZTZ99A_TRACK_CENTER_Z = 138.0;

// Shared assembled positions (world space, 1u = 1cm)
export const ZTZ99A_POS = {
  // Suite 1: armor_hull (8 solid GLB)
  ztz99a_hull_armor: [0, 0, 0] as [number, number, number],
  ztz99a_glacis_era: [298, -10, 0] as [number, number, number],
  ztz99a_side_skirts: [0, -22, 0] as [number, number, number],
  ztz99a_road_wheels: [0, -76, 0] as [number, number, number],
  ztz99a_tracks_left: [0, -70, -138] as [number, number, number],
  ztz99a_tracks_right: [0, -70, 138] as [number, number, number],
  ztz99a_rear_deck: [-256, 8, 0] as [number, number, number],
  ztz99a_turret_ring: [22, 9.5, 0] as [number, number, number],
  // Suite 2: turret_gun (8 solid GLB)
  ztz99a_turret_shell: [0, 38, 0] as [number, number, number],
  ztz99a_era_wedges: [84, 40, 0] as [number, number, number],
  ztz99a_main_gun: [85, 38, 0] as [number, number, number],
  ztz99a_gun_cradle: [100, 38, 0] as [number, number, number],
  ztz99a_recoil_cylinders: [62, 48, 0] as [number, number, number],
  ztz99a_breech_block: [62, 38, 0] as [number, number, number],
  ztz99a_optics_citv: [18, 78, 0] as [number, number, number],
  ztz99a_roof_armaments: [-10, 82, 0] as [number, number, number],
  // Suite 3: interior_power (8 solid GLB)
  ztz99a_autoloader_carousel: [22, -40, 0] as [number, number, number],
  ztz99a_loading_tray: [-48, -32, 0] as [number, number, number],
  ztz99a_rammer_chain: [-112, 38, 0] as [number, number, number],
  ztz99a_stub_ejector: [-42, 54, 0] as [number, number, number],
  ztz99a_v12_engine: [-216, -24, 0] as [number, number, number],
  ztz99a_transmission: [-314, -28, 0] as [number, number, number],
  ztz99a_torsion_bars: [16, -63, 0] as [number, number, number],
  ztz99a_crew_stations: [100, -8, 0] as [number, number, number],
  // Dynamic aSpringParam CSG Springs (2 parts, skipped in ztz99a.glb)
  ztz99a_recoil_springs: [15, 25, 0] as [number, number, number],
  ztz99a_rammer_spring: [-138, 48, 0] as [number, number, number],
} as const;

// Physically calibrated PLA ZTZ-99A palette (all linear luminance >> 0.018 Khronos floor)
export const ZTZ_PLA_OLIVE = '#4d5d43';
export const ZTZ_PLA_KHAKI = '#8b8464';
export const ZTZ_PLA_FOREST = '#3b4836';
export const ZTZ_ERA_BLOCK = '#536249';
export const ZTZ_SKIRT_RUBBER = '#3c4146';
export const ZTZ_TRACK_STEEL = '#4b5058';
export const ZTZ_WHEEL_TIRE = '#383d42';
export const ZTZ_GUN_SHROUD = '#54614b';
export const ZTZ_ORDNANCE_STEEL = '#59616d';
export const ZTZ_CHROME_ROD = '#cfd8e3';
export const ZTZ_BREECH_STEEL = '#8c96a4';
export const ZTZ_OPTICS_EMERALD = '#1fa882';
export const ZTZ_OPTICS_HOUSING = '#495443';
export const ZTZ_CAROUSEL_STEEL = '#6f7885';
export const ZTZ_APFSDS_SABOT = '#4c535f';
export const ZTZ_TUNGSTEN_PEN = '#9aa4b2';
export const ZTZ_PROPELLANT_AMBER = '#b8823c';
export const ZTZ_BRASS_STUB = '#d4a648';
export const ZTZ_ENGINE_BLOCK = '#6c7582';
export const ZTZ_TURBO_SILVER = '#bcc6d4';
export const ZTZ_EXHAUST_BRONZE = '#8f6242';
export const ZTZ_SAFETY_YELLOW = '#eab308';
export const ZTZ_RADIATOR_COPPER = '#b57445';
export const ZTZ_TORSION_STEEL = '#75808f';
export const ZTZ_CREW_SEAT = '#464d56';
export const ZTZ_MFD_CYAN = '#22c598';
export const ZTZ_SPRING_STEEL = '#94a3b8';

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
 * generates clean [0.04, 0.96] triplanar-box UVs for fallback/contract parity.
 */
export function sanitizeZtz99aMesh(
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
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.42;
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
// Primitive Builders (All Watertight & Positive Volume)
// ============================================================================

function boxAt(
  sx: number,
  sy: number,
  sz: number,
  cx: number,
  cy: number,
  cz: number,
  color: string,
  chamfer = 0.6
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
  segs = 24,
  bevel = 0.35
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
  segs = 24,
  bevel = 0.35
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

function cylZ(
  rTop: number,
  rBot: number,
  length: number,
  cx: number,
  cy: number,
  cz: number,
  color: string,
  segs = 24,
  bevel = 0.35
): THREE.BufferGeometry {
  const g = createBeveledCylinder(
    rTop,
    rBot,
    length,
    Math.min(bevel, length * 0.22, Math.min(rTop, rBot) * 0.28),
    segs,
    color
  );
  g.rotateX(Math.PI / 2);
  g.translate(cx, cy, cz);
  return g;
}

function hollowRingY(
  rOut: number,
  rIn: number,
  height: number,
  cx: number,
  cy: number,
  cz: number,
  color: string,
  segs = 36
): THREE.BufferGeometry {
  const outer = new THREE.CylinderGeometry(rOut, rOut, height, segs);
  const inner = new THREE.CylinderGeometry(rIn, rIn, height + 4, segs);
  paintGeometry(outer, color);
  paintGeometry(inner, color);
  const ring = csgSubtract(outer, [inner]);
  outer.dispose();
  inner.dispose();
  ring.translate(cx, cy, cz);
  return ring;
}

// ============================================================================
// SUITE 1 — `ztz99a_v3_armor_hull` (8 Solid GLB Parts)
// ============================================================================

/**
 * 1. `ztz99a_hull_armor` (assembledPos = [0, 0, 0], isShell = true)
 * TRUE HOLLOW WELDED COMPOSITE ARMOR HULL TUB (~14–16 cm wall thickness):
 * Slices cleanly along Z=0 in cutaway mode to showcase the entire spinning floor
 * carousel autoloader, transverse torsion bars, driver station & 150HB V12 diesel!
 */
export function buildZtz99aHullArmorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Bottom belly armor plate (Y in [-74, -60], X in [-354, +314], Z in [-112, +112])
  parts.push(boxAt(668, 14, 224, -20, -67, 0, ZTZ_PLA_OLIVE, 1.2));

  // Left & Right vertical armored hull sidewalls (Z in [±98, ±112], Y in [-60, +8])
  for (const s of [-1, 1]) {
    parts.push(boxAt(620, 68, 14, -44, -26, s * 105, ZTZ_PLA_OLIVE, 1.0));
    // Raised rear powerpack side cowling walls (X in [-354, -138], Y in [+4, +14])
    parts.push(boxAt(216, 10, 14, -246, 9, s * 105, ZTZ_PLA_OLIVE, 0.8));
    // Forward tapered cheek extensions closing hull nose sides (X in [+266, +340])
    const cheek = createChamferedBox(82, 46, 14, 1.0, ZTZ_PLA_OLIVE);
    cheek.rotateZ(-0.34);
    cheek.translate(306, -38, s * 105);
    parts.push(cheek);
  }

  // Sloped upper front glacis composite armor plate (16 cm wall thickness, 68° from vertical)
  const upperGlacis = createChamferedBox(166, 16, 224, 1.2, ZTZ_PLA_OLIVE);
  upperGlacis.rotateZ(-0.265);
  upperGlacis.translate(298, -14, 0);
  parts.push(upperGlacis);

  // Sloped lower front glacis armor plate (14 cm thick, closing nose beak at X=+378 to belly Y=-74)
  const lowerGlacis = createChamferedBox(72, 14, 224, 1.2, ZTZ_PLA_FOREST);
  lowerGlacis.rotateZ(0.54);
  lowerGlacis.translate(343, -49.5, 0);
  parts.push(lowerGlacis);

  // Rear vertical armored transom plate (X in [-354, -340])
  parts.push(boxAt(14, 88, 224, -347, -30, 0, ZTZ_PLA_OLIVE, 1.2));

  // Internal engine-bay firewall bulkhead separating fighting compartment & powerpack (X in [-144, -136])
  parts.push(boxAt(8, 66, 196, -140, -27, 0, ZTZ_ORDNANCE_STEEL, 0.5));

  // Front hull roof deck ahead of turret ring opening (X in [+126, +226], Y in [-6, +8])
  parts.push(boxAt(100, 14, 224, 176, 1, 0, ZTZ_PLA_OLIVE, 1.0));
  // Narrow rear deck sill between turret ring & engine bay (X in [-138, -82], Y in [-6, +8])
  parts.push(boxAt(56, 14, 224, -110, 1, 0, ZTZ_PLA_OLIVE, 1.0));
  // Left & right turret-ring deck side aprons (X in [-84, +128], Z in [±98, ±112])
  for (const s of [-1, 1]) {
    parts.push(boxAt(212, 14, 14, 22, 1, s * 105, ZTZ_PLA_OLIVE, 0.8));
  }

  // Center-front driver armored hatch cover + 3 forward armored vision periscopes
  parts.push(boxAt(46, 5, 52, 206, 10.5, 0, ZTZ_PLA_KHAKI, 0.6));
  for (const pz of [-15, 0, 15]) {
    parts.push(boxAt(12, 7, 10, 232, 10.5, pz, ZTZ_OPTICS_HOUSING, 0.4));
  }

  // Cantilevered upper track fenders (Z in [±112, ±170], X in [-346, +350], Y in [-6, +6])
  for (const s of [-1, 1]) {
    parts.push(boxAt(696, 12, 58, 2, 0, s * 141, ZTZ_PLA_OLIVE, 1.0));
    // Front angled mudguard flaps & twin armored headlight guards
    const mud = createChamferedBox(36, 10, 56, 0.8, ZTZ_PLA_FOREST);
    mud.rotateZ(-0.55);
    mud.translate(358, -10, s * 141);
    parts.push(mud);
    parts.push(boxAt(22, 14, 20, 324, 12, s * 138, ZTZ_ORDNANCE_STEEL, 0.6));
    // Side fender stowage bins (leaving front flank Hero ID plate unobstructed!)
    parts.push(boxAt(190, 16, 44, -220, 12, s * 140, ZTZ_PLA_KHAKI, 0.8));
    parts.push(boxAt(140, 14, 42, 48, 11, s * 140, ZTZ_PLA_OLIVE, 0.8));
    // Front lower tow hooks
    parts.push(boxAt(18, 12, 14, 370, -40, s * 78, ZTZ_ORDNANCE_STEEL, 0.6));
  }

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 2. `ztz99a_glacis_era` (assembledPos = [298, -10, 0], isShell = true)
 * Upper-front glacis FY-4 Explosive Reactive Armor brick array + V-shaped splash guard.
 */
export function buildZtz99aGlacisEraGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const slopeRad = -0.265;

  // 2 staggered rows × 6 columns of bolted rectangular FY-4 composite ERA bricks
  for (let row = 0; row < 2; row++) {
    const localU = row === 0 ? -24 : 24;
    for (let col = 0; col < 6; col++) {
      const cz = -85 + col * 34;
      const brick = createChamferedBox(42, 10.5, 31, 0.9, ZTZ_ERA_BLOCK);
      brick.translate(localU, 13.5, cz);
      brick.rotateZ(slopeRad);
      parts.push(brick);
    }
  }
  // Forward V-shaped ballistic splash wave-breaker bar across glacis toe
  for (const s of [-1, 1]) {
    const bar = createChamferedBox(10, 9, 102, 0.6, ZTZ_PLA_KHAKI);
    bar.rotateY(s * 0.14);
    bar.translate(58, -16, s * 51);
    parts.push(bar);
  }
  // Driver-slot center armored ERA riser plates
  parts.push(boxAt(26, 9, 64, -50, 17, 0, ZTZ_PLA_KHAKI, 0.7));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 3. `ztz99a_side_skirts` (assembledPos = [0, -22, 0], isShell = true)
 * Segmented ballistic rubber-steel side skirts + thickened front composite armor skirt panels.
 */
export function buildZtz99aSideSkirtsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const panelXs = [290, 178, 66, -46, -158, -270];

  for (const s of [-1, 1]) {
    for (let i = 0; i < panelXs.length; i++) {
      const px = panelXs[i];
      const isHeavyFront = i < 2;
      const thickZ = isHeavyFront ? 8.0 : 4.2;
      const col = isHeavyFront ? ZTZ_PLA_OLIVE : ZTZ_SKIRT_RUBBER;
      parts.push(boxAt(106, 62, thickZ, px, 2, s * 171, col, 0.6));
      // Steel mounting hinge clamp along top skirt lip
      parts.push(boxAt(98, 7, 5.5, px, 31, s * 169, ZTZ_ORDNANCE_STEEL, 0.4));
    }
    // Lower flexible rubber dust mud-flap strip running full length
    parts.push(boxAt(676, 12, 3.2, 10, -30, s * 172, ZTZ_WHEEL_TIRE, 0.4));
  }

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 4. `ztz99a_road_wheels` (assembledPos = [0, -76, 0], isShell = true)
 * 6 pairs of twin-rim 670mm stamped road wheels + front idlers + 14-tooth rear drive sprockets + return rollers.
 */
export function buildZtz99aRoadWheelsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (const s of [-1, 1]) {
    const zc = s * ZTZ99A_TRACK_CENTER_Z;
    // 6 pairs of twin-rim stamped road wheels (world Y = -79.5 -> local Y = -3.5, R = 33.5 -> bottom at world -113)
    for (const wx of ZTZ99A_ROAD_WHEEL_XS) {
      for (const dz of [-15.5, 15.5]) {
        parts.push(cylZ(33.5, 33.5, 17, wx, -3.5, zc + dz, ZTZ_WHEEL_TIRE, 28, 1.4));
        parts.push(cylZ(25.5, 25.5, 18.2, wx, -3.5, zc + dz, ZTZ_PLA_OLIVE, 24, 1.0));
      }
      // Central hub cap + 6 bolt bosses + suspension swing arm stub
      parts.push(cylZ(10.5, 11.5, 44, wx, -3.5, zc, ZTZ_ORDNANCE_STEEL, 16, 0.8));
      parts.push(boxAt(22, 12, 18, wx - 10, 4, s * 116, ZTZ_ORDNANCE_STEEL, 0.6));
    }

    // Front idler wheel (X = +332, world Y = -50 -> local Y = +26, R = 29)
    for (const dz of [-14, 14]) {
      parts.push(cylZ(29, 29, 15, 332, 26, zc + dz, ZTZ_PLA_FOREST, 24, 1.2));
    }
    parts.push(cylZ(12, 12, 42, 332, 26, zc, ZTZ_ORDNANCE_STEEL, 16, 0.6));

    // Rear 14-tooth twin drive sprocket (X = -326, world Y = -50 -> local Y = +26, R = 31)
    for (const dz of [-16, 16]) {
      parts.push(cylZ(30, 30, 12, -326, 26, zc + dz, ZTZ_TRACK_STEEL, 24, 0.9));
    }
    parts.push(cylZ(17, 17, 46, -326, 26, zc, ZTZ_ORDNANCE_STEEL, 20, 0.8));

    // 3 upper return rollers (world Y = -22 -> local Y = +54, R = 9.5)
    for (const rx of [195, 15, -165]) {
      parts.push(cylZ(9.5, 9.5, 38, rx, 54, zc, ZTZ_WHEEL_TIRE, 16, 0.6));
    }
  }

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/** Shared builder for articulated rubber-padded track belt (left `-Z` or right `+Z`). */
function buildSingleTrackBelt(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // World center Y = -70 -> Ground contact at local Y = -50 (world Y = -120.0 cm!)
  // Bottom ground run (X in [-226, +260], local Y in [-50, -43], width Z = 58 cm)
  parts.push(boxAt(486, 7.0, 58, 17, -46.5, 0, ZTZ_TRACK_STEEL, 0.5));
  // Rubber road pads & steel grousers along bottom run
  for (let x = -218; x <= 252; x += 24) {
    parts.push(boxAt(15, 3.2, 46, x, -48.4, 0, ZTZ_WHEEL_TIRE, 0.3));
    parts.push(boxAt(6, 7.2, 6.0, x, -40.0, 0, ZTZ_ORDNANCE_STEEL, 0.3));
  }

  // Top return run (X in [-326, +332], local Y in [+53, +60])
  parts.push(boxAt(658, 7.0, 58, 3, 56.5, 0, ZTZ_TRACK_STEEL, 0.5));
  for (let x = -310; x <= 320; x += 28) {
    parts.push(boxAt(15, 2.8, 46, x, 58.6, 0, ZTZ_WHEEL_TIRE, 0.3));
  }

  // Front angled climb run (from ground X=+260,Y=-46.5 up to idler X=+360,Y=+20)
  const frontRun = createChamferedBox(122, 7.0, 58, 0.5, ZTZ_TRACK_STEEL);
  frontRun.rotateZ(0.62);
  frontRun.translate(309, -10.5, 0);
  parts.push(frontRun);
  // Front wrap around idler
  parts.push(boxAt(10, 44, 58, 359, 36, 0, ZTZ_TRACK_STEEL, 0.5));

  // Rear angled climb run (from ground X=-226,Y=-46.5 up to drive sprocket X=-355,Y=+20)
  const rearRun = createChamferedBox(144, 7.0, 58, 0.5, ZTZ_TRACK_STEEL);
  rearRun.rotateZ(-0.51);
  rearRun.translate(-290, -10.5, 0);
  parts.push(rearRun);
  // Rear wrap around sprocket
  parts.push(boxAt(10, 44, 58, -356, 36, 0, ZTZ_TRACK_STEEL, 0.5));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/** 5. `ztz99a_tracks_left` (assembledPos = [0, -70, -138]) */
export function buildZtz99aTracksLeftGeometry(): THREE.BufferGeometry {
  return buildSingleTrackBelt();
}

/** 6. `ztz99a_tracks_right` (assembledPos = [0, -70, +138], isShell = true) */
export function buildZtz99aTracksRightGeometry(): THREE.BufferGeometry {
  return buildSingleTrackBelt();
}

/**
 * 7. `ztz99a_rear_deck` (assembledPos = [-256, 8, 0], isShell = true)
 * Raised ZTZ-99A louvered rear engine deck grilles, exhaust manifold vent & twin external 200L cylindrical fuel drums.
 */
export function buildZtz99aRearDeckGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Raised engine deck armor cover slab (world X in [-354, -138], Y in [+8, +18])
  parts.push(boxAt(216, 10, 206, 10, 5, 0, ZTZ_PLA_OLIVE, 1.0));
  // 8 louvered steel radiator intake cooling slats across top deck
  for (let i = 0; i < 8; i++) {
    const lx = -72 + i * 20;
    parts.push(boxAt(11, 3.5, 168, lx, 11.2, 0, ZTZ_ORDNANCE_STEEL, 0.4));
  }
  // Left-flank heavy armored exhaust manifold deflector housing
  parts.push(boxAt(68, 12, 26, 26, 4, -102, ZTZ_EXHAUST_BRONZE, 0.6));

  // Twin rear external 200L cylindrical diesel fuel drums (world X = -366 -> local X = -110, R = 14 -> reaches world -380!)
  for (const s of [-1, 1]) {
    parts.push(cylZ(14, 14, 84, -110, -16, s * 56, ZTZ_PLA_KHAKI, 24, 1.2));
    // Twin cradle brackets anchoring each drum to rear hull transom
    for (const dz of [-24, 24]) {
      parts.push(boxAt(24, 14, 6, -98, -16, s * 56 + dz, ZTZ_ORDNANCE_STEEL, 0.4));
    }
  }
  // Rear wooden unditching log tucked below fuel drums
  parts.push(cylZ(6.5, 6.5, 198, -104, -34, 0, ZTZ_PROPELLANT_AMBER, 16, 0.6));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 8. `ztz99a_turret_ring` (assembledPos = [22, 9.5, 0])
 * Precision-toothed steel turret traverse ring gear & ball-bearing raceway seated on hull roof.
 */
export function buildZtz99aTurretRingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Main outer bearing raceway ring (R_out = 108, R_in = 96, height = 9 cm)
  parts.push(hollowRingY(108, 96, 8.5, 0, 0, 0, ZTZ_BREECH_STEEL, 40));
  // 24 internal precision traverse gear teeth lugs around inner race
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const tooth = createChamferedBox(4.5, 6.0, 5.2, 0.3, ZTZ_CHROME_ROD);
    tooth.translate(95.5, 0, 0);
    tooth.rotateY(a);
    parts.push(tooth);
  }

  return sanitizeZtz99aMesh(mergeParts(parts));
}

// ============================================================================
// SUITE 2 — `ztz99a_v3_turret_gun` (8 Solid GLB Parts)
// ============================================================================

/**
 * 9. `ztz99a_turret_shell` (assembledPos = [0, 38, 0], isShell = true)
 * TRUE HOLLOW WELDED LOW-PROFILE ZTZ-99A TURRET HOUSING (~14–16 cm wall thickness):
 * Opens cleanly along Z=0 in cutaway mode exposing breech, recoil system, rammer & crew!
 */
export function buildZtz99aTurretShellGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Turret roof plate (local Y in [+14, +28] -> world Y in [+52, +66], X in [-162, +124], Z in [-118, +118])
  parts.push(boxAt(284, 14, 232, -19, 21, 0, ZTZ_PLA_OLIVE, 1.4));

  // Left & Right hollow armored turret side walls (Z in [±98, ±122], local Y in [-24, +24])
  for (const s of [-1, 1]) {
    parts.push(boxAt(226, 48, 22, -24, 0, s * 110, ZTZ_PLA_OLIVE, 1.2));
    // Front angled welded composite cheek walls flanking gun mantlet opening (Z in [±34, ±118])
    const cheek = createChamferedBox(108, 48, 22, 1.2, ZTZ_PLA_OLIVE);
    cheek.rotateY(s * 0.66);
    cheek.translate(92, 0, s * 74);
    parts.push(cheek);
    // Flat unobstructed rear-flank tactical stencil armor panels (world X in [-160, -82], Z = ±124 -> ZTZ-99A / 108 + PLA star!)
    parts.push(boxAt(78, 36, 6, -121, 4, s * 124, ZTZ_PLA_KHAKI, 0.5));
  }

  // Rear turret bustle backplate (local X in [-166, -146], local Y in [-18, +24], Z in [-100, +100])
  parts.push(boxAt(20, 44, 200, -156, 3, 0, ZTZ_PLA_OLIVE, 1.2));
  // Rear bustle floor tray (local X in [-164, -108], local Y in [-22, -12])
  parts.push(boxAt(56, 10, 196, -136, -17, 0, ZTZ_PLA_FOREST, 0.8));

  // Commander's right cupola ring (+Z) & Gunner's left hatch ring (-Z) atop turret roof
  parts.push(cylY(28, 30, 7, 14, 30, 56, ZTZ_PLA_KHAKI, 22, 0.6));
  parts.push(cylY(26, 28, 6, 12, 29.5, -56, ZTZ_PLA_OLIVE, 22, 0.6));

  // Iconic Rear Turret Tubular Stowage Bustle Basket (local X in [-206, -166], Z in [-102, +102])
  parts.push(boxAt(40, 5, 198, -186, -10, 0, ZTZ_ORDNANCE_STEEL, 0.4));
  parts.push(boxAt(6, 34, 198, -203, 7, 0, ZTZ_ORDNANCE_STEEL, 0.4));
  for (const s of [-1, 1]) {
    parts.push(boxAt(40, 34, 6, -186, 7, s * 98, ZTZ_ORDNANCE_STEEL, 0.4));
  }

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 10. `ztz99a_era_wedges` (assembledPos = [84, 40, 0], isShell = true)
 * Iconic ZTZ-99A razor-sharp ARROWHEAD FY-4 ERA composite wedge cheek armor modules!
 */
export function buildZtz99aEraWedgesGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (const s of [-1, 1]) {
    // 4 heavy forward-swept arrowhead FY-4 ERA wedge blocks per cheek (world X in [+64, +172])
    for (let k = 0; k < 4; k++) {
      const u = k / 3;
      const lx = 68 - u * 62;
      const lz = s * (48 + u * 84);
      // Upper slanted arrowhead wedge facet
      const upWedge = createChamferedBox(36, 24, 30, 0.9, ZTZ_ERA_BLOCK);
      upWedge.rotateX(s * 0.16);
      upWedge.rotateZ(0.24);
      upWedge.rotateY(s * 0.68);
      upWedge.translate(lx, 11, lz);
      parts.push(upWedge);
      // Lower reverse-slanted arrowhead wedge facet forming crisp razor apex!
      const loWedge = createChamferedBox(36, 24, 30, 0.9, ZTZ_PLA_KHAKI);
      loWedge.rotateX(-s * 0.16);
      loWedge.rotateZ(-0.24);
      loWedge.rotateY(s * 0.68);
      loWedge.translate(lx, -11, lz);
      parts.push(loWedge);
    }
    // 3 side turret FY-4 ERA armor brick panels strictly forward of rear flank stencil plate (world X in [-72, +56])
    for (let i = 0; i < 3; i++) {
      const sx = -46 - i * 44;
      parts.push(boxAt(40, 34, 12, sx, 2, s * 136, ZTZ_ERA_BLOCK, 0.8));
    }
  }

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 11. `ztz99a_main_gun` (assembledPos = [85, 38, 0])
 * 125mm ZPT-98 L/50 6.25-meter smoothbore cannon barrel (local X in [0, +625] -> muzzle at world +710 cm!).
 */
export function buildZtz99aMainGunGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Rear heavy breech-collar & jacket section (local X in [0, 155], R = 11.8 -> 10.6)
  parts.push(cylX(10.6, 11.8, 155, 77.5, 0, 0, ZTZ_ORDNANCE_STEEL, 28, 0.5));
  // Mid thermal shroud segment (local X in [155, 252], R = 10.2)
  parts.push(cylX(10.0, 10.4, 97, 203.5, 0, 0, ZTZ_GUN_SHROUD, 28, 0.4));
  // Prominent mid-barrel cylindrical Bore Evacuator / Fume Extractor (local X in [250, 334], R = 14.8)
  parts.push(cylX(14.8, 14.8, 84, 292, 0, 0, ZTZ_GUN_SHROUD, 32, 1.4));
  parts.push(cylX(11.8, 14.8, 12, 338, 0, 0, ZTZ_ORDNANCE_STEEL, 28, 0.4));
  parts.push(cylX(14.8, 11.8, 12, 246, 0, 0, ZTZ_ORDNANCE_STEEL, 28, 0.4));
  // Forward thermal-shrouded smoothbore barrel (local X in [342, 608], R = 9.4 -> 8.2)
  parts.push(cylX(8.2, 9.4, 266, 475, 0, 0, ZTZ_GUN_SHROUD, 28, 0.4));
  // Stainless thermal shroud clamp rings
  for (const cx of [158, 210, 382, 468, 554]) {
    parts.push(cylX(10.8, 10.8, 4.5, cx, 0, 0, ZTZ_CHROME_ROD, 24, 0.3));
  }
  // Hollow 125mm smoothbore muzzle crown (local X in [606, 625], R_out = 8.4, R_bore = 6.25!)
  const mOut = new THREE.CylinderGeometry(8.4, 8.4, 20, 28);
  const mIn = new THREE.CylinderGeometry(6.25, 6.25, 24, 24);
  paintGeometry(mOut, ZTZ_ORDNANCE_STEEL);
  paintGeometry(mIn, ZTZ_ORDNANCE_STEEL);
  const crown = csgSubtract(mOut, [mIn]);
  mOut.dispose();
  mIn.dispose();
  crown.rotateZ(-Math.PI / 2);
  crown.translate(615, 0, 0);
  parts.push(crown);

  // Muzzle Reference System (MRS) collimator mast perched on top of muzzle (local X = 616, Y = +11)
  parts.push(boxAt(8, 10, 5.5, 616, 11.5, 0, ZTZ_ORDNANCE_STEEL, 0.4));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 12. `ztz99a_gun_cradle` (assembledPos = [100, 38, 0])
 * Heavy armored external gun mantlet + internal U-shaped cast-steel trunnion cradle.
 */
export function buildZtz99aGunCradleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Heavy external armored mantlet shield (local X in [+6, +46] -> world [+106, +146], Z in [-33, +33])
  parts.push(boxAt(40, 32, 66, 26, 0, 0, ZTZ_PLA_OLIVE, 1.4));
  // Coaxial 7.62mm Type 86 MG armored port sleeve on right mantlet (+Z = 22)
  parts.push(cylX(3.2, 3.6, 22, 46, 2, 22, ZTZ_ORDNANCE_STEEL, 16, 0.3));
  // Internal heavy U-cradle trough rails extending aft to support recoiling breech (local X in [-64, +12])
  for (const s of [-1, 1]) {
    parts.push(boxAt(76, 22, 7.5, -26, -2, s * 24, ZTZ_BREECH_STEEL, 0.6));
    // Trunnion pivot pins engaging turret cheek bearings
    parts.push(cylZ(7.5, 7.5, 14, -8, 0, s * 30, ZTZ_CHROME_ROD, 20, 0.5));
  }
  parts.push(boxAt(72, 7, 54, -26, -12, 0, ZTZ_ORDNANCE_STEEL, 0.6));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 13. `ztz99a_recoil_cylinders` (assembledPos = [62, 48, 0])
 * Twin gleaming chrome hydraulic recoil brake & hydro-pneumatic recuperator cylinders beside breech.
 */
export function buildZtz99aRecoilCylindersGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (const s of [-1, 1]) {
    const cz = s * 15.5;
    // Heavy outer pressure cylinder jacket
    parts.push(cylX(5.8, 5.8, 72, -14, 0, cz, ZTZ_ORDNANCE_STEEL, 24, 0.5));
    // Gleaming mirror-chrome hydraulic piston rod extending forward into cradle yoke
    parts.push(cylX(3.6, 3.6, 44, 30, 0, cz, ZTZ_CHROME_ROD, 24, 0.4));
    // Front/rear hydraulic mounting yokes & pressure accumulator end-caps
    parts.push(cylX(6.8, 6.8, 6, -49, 0, cz, ZTZ_BREECH_STEEL, 20, 0.4));
    parts.push(cylX(6.6, 6.6, 6, 21, 0, cz, ZTZ_BREECH_STEEL, 20, 0.4));
  }
  // Cross-brace yoke tying twin recuperator cylinders together
  parts.push(boxAt(10, 9, 42, 46, 0, 0, ZTZ_BREECH_STEEL, 0.5));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 14. `ztz99a_breech_block` (assembledPos = [62, 38, 0])
 * Heavy machined steel ZPT-98 breech ring + vertical sliding wedge breechblock dropping open -16 cm!
 */
export function buildZtz99aBreechBlockGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Heavy forged steel breech ring body (local X in [-24, +24], Y in [-17, +17], Z in [-18, +18])
  const outer = boxAt(46, 34, 36, 0, 0, 0, ZTZ_BREECH_STEEL, 1.2);
  const bore = new THREE.CylinderGeometry(7.2, 7.2, 54, 24);
  bore.rotateZ(-Math.PI / 2);
  paintGeometry(bore, ZTZ_BREECH_STEEL);
  const ring = csgSubtract(outer, [bore]);
  outer.dispose();
  bore.dispose();
  parts.push(ring);

  // Vertical sliding wedge breechblock core (machined steel + brass firing solenoid cap)
  parts.push(boxAt(18, 26, 22, -6, -1, 0, ZTZ_CHROME_ROD, 0.8));
  parts.push(cylX(4.8, 4.8, 7, -18, 0, 0, ZTZ_BRASS_STUB, 16, 0.4));
  // Breech operating crank lever on left side
  parts.push(boxAt(18, 5, 6, -8, 12, -20, ZTZ_ORDNANCE_STEEL, 0.4));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 15. `ztz99a_optics_citv` (assembledPos = [18, 78, 0])
 * Commander's panoramic CITV, Gunner's primary thermal sight & iconic JD-3 Laser Active Defense Dazzler.
 */
export function buildZtz99aOpticsCitvGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Gunner's primary stabilized thermal sight box (local X = +58, Y = -4, Z = -52)
  parts.push(boxAt(32, 22, 26, 58, -4, -52, ZTZ_OPTICS_HOUSING, 0.9));
  parts.push(boxAt(4, 14, 18, 74, -4, -52, ZTZ_OPTICS_EMERALD, 0.3));

  // 2. Commander's panoramic hunter-killer CITV turret (local X = -2, Y = +8, Z = +42)
  parts.push(cylY(14, 16, 16, -2, -2, 42, ZTZ_PLA_OLIVE, 24, 0.8));
  parts.push(boxAt(26, 18, 22, 0, 12, 42, ZTZ_OPTICS_HOUSING, 0.8));
  parts.push(boxAt(4, 11, 15, 13, 12, 42, ZTZ_OPTICS_EMERALD, 0.3));

  // 3. Iconic ZTZ-99A JD-3 Laser Active Defense System (laser warning receiver + active dazzler turret!)
  // Warning receiver dome (local X = -48, Y = +4, Z = -18)
  parts.push(cylY(7.5, 9, 14, -48, 0, -18, ZTZ_ORDNANCE_STEEL, 20, 0.6));
  parts.push(cylY(8.5, 8.5, 5, -48, 9, -18, ZTZ_OPTICS_EMERALD, 20, 0.4));
  // Elevated JD-3 Active Laser Dazzler mast & projector head (local X = -68, Y = +18, Z = -56 -> world Y up to +112!)
  parts.push(cylY(9, 11, 18, -68, -4, -56, ZTZ_PLA_OLIVE, 20, 0.6));
  parts.push(boxAt(30, 24, 24, -66, 18, -56, ZTZ_OPTICS_HOUSING, 0.9));
  parts.push(boxAt(4.5, 16, 16, -50, 18, -56, ZTZ_OPTICS_EMERALD, 0.3));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 16. `ztz99a_roof_armaments` (assembledPos = [-10, 82, 0])
 * Twin 6-barrel 81mm smoke grenade discharger banks + roof-mounted QJC-88 12.7mm heavy AA machine gun.
 */
export function buildZtz99aRoofArmamentsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Twin banks of 6× 81mm smoke grenade discharger tubes flanking turret cheeks (world Y ~ +56 -> local Y = -26)
  for (const s of [-1, 1]) {
    parts.push(boxAt(24, 10, 12, 38, -28, s * 120, ZTZ_ORDNANCE_STEEL, 0.5));
    for (let i = 0; i < 6; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const tube = createBeveledCylinder(4.1, 4.1, 30, 0.3, 16, ZTZ_PLA_OLIVE);
      tube.rotateZ(-Math.PI / 2 + 0.38);
      tube.rotateY(s * (0.22 + col * 0.14));
      tube.translate(46 + col * 4, -22 + row * 9, s * (118 + col * 4));
      parts.push(tube);
    }
  }

  // Roof-mounted QJC-88 12.7x108mm Heavy Anti-Aircraft Machine Gun on commander's right pintle (local Z = +54)
  // Pintle pedestal stanchion
  parts.push(cylY(4.5, 5.5, 22, -26, -6, 54, ZTZ_ORDNANCE_STEEL, 16, 0.4));
  // QJC-88 receiver & spade-grip butt
  parts.push(boxAt(56, 11, 10, -14, 12, 54, ZTZ_ORDNANCE_STEEL, 0.6));
  parts.push(boxAt(16, 10, 14, -46, 11, 54, ZTZ_SKIRT_RUBBER, 0.4));
  // 12.7mm heavy barrel + conical flash hider
  parts.push(cylX(2.1, 2.8, 86, 54, 13, 54, ZTZ_ORDNANCE_STEEL, 16, 0.25));
  parts.push(cylX(3.6, 2.2, 12, 99, 13, 54, ZTZ_ORDNANCE_STEEL, 16, 0.2));
  // Side green 12.7mm ammo box
  parts.push(boxAt(22, 18, 13, -12, 9, 67, ZTZ_PLA_FOREST, 0.5));
  // Rear cross-wind sensor mast (local X = -82, Y = +14, Z = -20)
  parts.push(cylY(2.2, 3.0, 40, -80, 14, -20, ZTZ_ORDNANCE_STEEL, 14, 0.3));
  parts.push(cylY(5.0, 5.0, 4, -80, 33, -20, ZTZ_CHROME_ROD, 16, 0.3));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

// ============================================================================
// SUITE 3 — `ztz99a_v3_interior_power` (8 Solid GLB Parts — Cutaway Masterpiece!)
// ============================================================================

/**
 * 17. `ztz99a_autoloader_carousel` (assembledPos = [22, -40, 0])
 * THE STAR: Circular 22-cassette floor Carousel Autoloader packed radially with 125mm APFSDS
 * fin-stabilized sabots & semi-combustible propellant charges — spins dynamically around Y!
 */
export function buildZtz99aAutoloaderCarouselGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Armored outer circular carousel conveyor tub ring (R_out = 91, R_in = 85, height = 28)
  parts.push(hollowRingY(91, 85, 28, 0, 0, 0, ZTZ_CAROUSEL_STEEL, 44));
  // Lower rotating turntable steel base floor ring (R_out = 90, R_in = 22, height = 5)
  parts.push(hollowRingY(90, 22, 5, 0, -13.5, 0, ZTZ_ORDNANCE_STEEL, 36));
  // Central electric azimuth indexing drive hub + planetary spur gear collar
  parts.push(cylY(21, 23, 22, 0, -4, 0, ZTZ_BREECH_STEEL, 24, 0.8));
  parts.push(cylY(13, 13, 8, 0, 10, 0, ZTZ_CHROME_ROD, 20, 0.5));

  // 22 radial 2-piece 125mm ammunition cassettes (lower tier: APFSDS sabot, upper tier: propellant charge!)
  for (let i = 0; i < ZTZ99A_CAROUSEL_STATIONS; i++) {
    const a = (i / ZTZ99A_CAROUSEL_STATIONS) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const rMid = 55;

    // Lower cassette: 125mm DTC10-125 APFSDS projectile (black sabot body + tungsten dart)
    const proj = createBeveledCylinder(4.6, 5.2, 52, 0.3, 14, ZTZ_APFSDS_SABOT);
    proj.rotateZ(-Math.PI / 2);
    proj.rotateY(a);
    proj.translate(cosA * rMid, -5.5, -sinA * rMid);
    parts.push(proj);

    // Upper cassette: semi-combustible amber propellant cylinder + gleaming C26000 brass stub base!
    const chg = createBeveledCylinder(5.4, 5.4, 38, 0.3, 14, ZTZ_PROPELLANT_AMBER);
    chg.rotateZ(-Math.PI / 2);
    chg.rotateY(a);
    chg.translate(cosA * (rMid - 4), 7.5, -sinA * (rMid - 4));
    parts.push(chg);

    const stub = createBeveledCylinder(5.8, 5.8, 7.5, 0.3, 14, ZTZ_BRASS_STUB);
    stub.rotateZ(-Math.PI / 2);
    stub.rotateY(a);
    stub.translate(cosA * (rMid + 19), 7.5, -sinA * (rMid + 19));
    parts.push(stub);
  }

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 18. `ztz99a_loading_tray` (assembledPos = [-48, -32, 0])
 * Vertical articulated Cassette Elevator Hoist Arm lifting a 2-piece 125mm APFSDS round up +68 cm to breech!
 */
export function buildZtz99aLoadingTrayGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Twin vertical articulated hoist guide arms & lower roller saddle
  for (const s of [-1, 1]) {
    parts.push(boxAt(10, 52, 5.5, -24, 10, s * 14, ZTZ_BREECH_STEEL, 0.5));
    parts.push(boxAt(58, 5, 4.5, 4, -8, s * 11, ZTZ_ORDNANCE_STEEL, 0.4));
  }
  // Dual-deck steel cassette cradle holding a staged fresh 2-piece 125mm APFSDS round!
  parts.push(boxAt(66, 4.5, 22, 4, -14, 0, ZTZ_CAROUSEL_STEEL, 0.5));
  parts.push(boxAt(66, 3.5, 22, 4, 2, 0, ZTZ_CAROUSEL_STEEL, 0.4));

  // Lower staged 125mm APFSDS penetrator dart + finned sabot (pointing +X toward breech!)
  parts.push(cylX(5.2, 5.4, 34, -4, -6, 0, ZTZ_APFSDS_SABOT, 18, 0.4));
  parts.push(cylX(1.6, 2.2, 34, 21, -6, 0, ZTZ_TUNGSTEN_PEN, 16, 0.3));
  // Upper staged 125mm semi-combustible propellant charge + shining brass stub base
  parts.push(cylX(5.8, 5.8, 42, 6, 10, 0, ZTZ_PROPELLANT_AMBER, 18, 0.4));
  parts.push(cylX(6.2, 6.2, 8.5, -18, 10, 0, ZTZ_BRASS_STUB, 18, 0.4));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 19. `ztz99a_rammer_chain` (assembledPos = [-112, 38, 0])
 * Overhead electro-mechanical Chain Rammer thrusting +54 cm forward to seat projectile + charge into breech!
 */
export function buildZtz99aRammerChainGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Heavy motorized chain-rammer guide box inside rear turret bustle
  parts.push(boxAt(54, 16, 22, -4, 0, 0, ZTZ_ORDNANCE_STEEL, 0.8));
  // Articulated push-chain links & electric sprocket drum
  parts.push(cylZ(7.5, 7.5, 26, -18, 0, 0, ZTZ_BREECH_STEEL, 20, 0.5));
  for (let i = 0; i < 6; i++) {
    parts.push(boxAt(8.5, 7.5, 11, -12 + i * 8.5, 0, 0, ZTZ_CHROME_ROD, 0.4));
  }
  // Forward cushioned brass-faced rammer pusher head
  parts.push(cylX(6.8, 7.2, 7.5, 29, 0, 0, ZTZ_BRASS_STUB, 20, 0.5));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 20. `ztz99a_stub_ejector` (assembledPos = [-42, 54, 0])
 * Rear stub-case catcher arm & spring-loaded turret roof stub ejection hatch flipping open after firing!
 */
export function buildZtz99aStubEjectorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Hinged armored roof stub-ejection port hatch lid
  parts.push(boxAt(34, 6.5, 32, 0, 8, 0, ZTZ_PLA_OLIVE, 0.7));
  // Pivot hinge barrel at rear of hatch
  parts.push(cylZ(3.2, 3.2, 34, -17, 7, 0, ZTZ_CHROME_ROD, 16, 0.3));
  // Twin curved steel catcher fork arms descending beneath hatch to grab spent 125mm brass stub base
  for (const s of [-1, 1]) {
    parts.push(boxAt(8, 18, 4.5, 6, -3, s * 11, ZTZ_BREECH_STEEL, 0.4));
  }
  parts.push(boxAt(22, 4.5, 24, 6, -10, 0, ZTZ_BRASS_STUB, 0.4));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 21. `ztz99a_v12_engine` (assembledPos = [-216, -24, 0])
 * Massive 1,500 HP 150HB 12-cylinder twin-turbo liquid-cooled diesel engine!
 */
export function buildZtz99aV12EngineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Heavy cast-aluminum/iron V12 crankcase & oil pan sump (local X in [-58, +58], Y in [-32, +6], Z in [-54, +54])
  parts.push(boxAt(114, 34, 88, 0, -14, 0, ZTZ_ENGINE_BLOCK, 1.4));

  // Two 60° V-banks × 6 distinct cylinder heads + ribbed valve covers + stainless fuel injector rails!
  for (const s of [-1, 1]) {
    const bank = createChamferedBox(106, 22, 30, 1.0, ZTZ_ENGINE_BLOCK);
    bank.rotateX(s * 0.48);
    bank.translate(0, 8, s * 36);
    parts.push(bank);

    for (let c = 0; c < 6; c++) {
      const cx = -42 + c * 16.8;
      // Individual cylinder head rocker cover
      const head = createChamferedBox(13.5, 9, 24, 0.6, ZTZ_BREECH_STEEL);
      head.rotateX(s * 0.48);
      head.translate(cx, 20, s * 42);
      parts.push(head);
      // Bronze cast-iron exhaust header stub
      parts.push(cylZ(4.2, 4.2, 16, cx, 10, s * 58, ZTZ_EXHAUST_BRONZE, 14, 0.3));
    }
    // Longitudinal bronze exhaust collector manifold
    parts.push(cylX(6.5, 6.5, 108, 0, 10, s * 66, ZTZ_EXHAUST_BRONZE, 18, 0.5));
  }

  // Twin gleaming silver-aluminum turbocharger snails + ribbed charge-air intercooler plenum atop engine V
  for (const s of [-1, 1]) {
    parts.push(cylX(12.5, 12.5, 20, -34, 20, s * 22, ZTZ_TURBO_SILVER, 24, 0.8));
    parts.push(cylX(9.5, 9.5, 14, -48, 20, s * 22, ZTZ_EXHAUST_BRONZE, 20, 0.6));
  }
  parts.push(boxAt(62, 14, 34, 16, 23, 0, ZTZ_TURBO_SILVER, 0.8));

  // High-visibility safety-yellow oil-fill & coolant maintenance caps
  parts.push(cylY(5.2, 5.2, 6, 48, 28, 16, ZTZ_SAFETY_YELLOW, 16, 0.4));
  parts.push(cylY(5.2, 5.2, 6, 48, 28, -16, ZTZ_SAFETY_YELLOW, 16, 0.4));
  // Rear flywheel coupling drum mating to CH-1000 transmission
  parts.push(cylX(22, 22, 10, -56, -10, 0, ZTZ_ORDNANCE_STEEL, 24, 0.6));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 22. `ztz99a_transmission` (assembledPos = [-314, -28, 0])
 * Rear CH-1000 hydro-mechanical planetary transmission + twin cooling radiators & final drive shafts!
 */
export function buildZtz99aTransmissionGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Central transverse CH-1000 hydro-mechanical planetary gearbox housing
  parts.push(boxAt(56, 36, 126, 4, -10, 0, ZTZ_ENGINE_BLOCK, 1.4));
  // Heavy planetary brake drums & lateral final-drive output shafts coupling to rear sprockets
  for (const s of [-1, 1]) {
    parts.push(cylZ(16, 16, 26, -8, -16, s * 74, ZTZ_BREECH_STEEL, 22, 0.8));
  }
  // Twin bronze-finned cooling radiator cores perched above transmission
  for (const s of [-1, 1]) {
    parts.push(boxAt(64, 18, 56, 0, 22, s * 46, ZTZ_RADIATOR_COPPER, 0.8));
    // Twin circular cooling impeller shrouds
    parts.push(cylY(20, 20, 6, 0, 32, s * 46, ZTZ_TURBO_SILVER, 22, 0.5));
  }

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 23. `ztz99a_torsion_bars` (assembledPos = [16, -63, 0])
 * Full-width hull floor array of 12 hardened steel transverse torsion bars + 6 hydraulic shock absorbers.
 */
export function buildZtz99aTorsionBarsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 12 staggered full-width hardened steel torsion bars (6 left + 6 right, X stations relative to +16)
  for (let i = 0; i < ZTZ99A_ROAD_WHEEL_XS.length; i++) {
    const lx = ZTZ99A_ROAD_WHEEL_XS[i] - 16;
    // Left wheel torsion bar (slightly forward)
    parts.push(cylZ(3.2, 3.2, 212, lx + 5.5, -1.5, 0, ZTZ_TORSION_STEEL, 14, 0.3));
    // Right wheel torsion bar (slightly aft)
    parts.push(cylZ(3.2, 3.2, 212, lx - 5.5, -1.5, 0, ZTZ_BREECH_STEEL, 14, 0.3));
    // Splined end anchor housings at hull sidewalls (Z = ±108)
    for (const s of [-1, 1]) {
      parts.push(boxAt(16, 11, 12, lx, -1.5, s * 108, ZTZ_ORDNANCE_STEEL, 0.5));
    }
    // Hydraulic rotary shock absorbers on stations 0, 1, and 5
    if (i === 0 || i === 1 || i === 5) {
      for (const s of [-1, 1]) {
        parts.push(cylX(5.5, 5.5, 28, lx - 14, 4, s * 114, ZTZ_CHROME_ROD, 16, 0.4));
      }
    }
  }

  return sanitizeZtz99aMesh(mergeParts(parts));
}

/**
 * 24. `ztz99a_crew_stations` (assembledPos = [100, -8, 0])
 * Front center driver's station (seat, steering yoke, digital dash) + turret gunner/commander MFD consoles.
 */
export function buildZtz99aCrewStationsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Front-Center Driver's Station (world X ~ +205 -> local X = +105, world Y ~ -38 -> local Y = -30)
  parts.push(boxAt(34, 10, 42, 98, -42, 0, ZTZ_CREW_SEAT, 0.8)); // Driver seat cushion
  const drvBack = createChamferedBox(10, 42, 40, 0.8, ZTZ_CREW_SEAT);
  drvBack.rotateZ(0.28);
  drvBack.translate(80, -24, 0);
  parts.push(drvBack);
  // Driver's steering yoke column & butterfly steering wheel + digital instrument cluster
  parts.push(cylX(3.2, 3.2, 24, 128, -22, 0, ZTZ_ORDNANCE_STEEL, 14, 0.3));
  parts.push(boxAt(5, 16, 32, 118, -18, 0, ZTZ_SKIRT_RUBBER, 0.5));
  parts.push(boxAt(14, 14, 46, 138, -14, 0, ZTZ_ORDNANCE_STEEL, 0.6));
  parts.push(boxAt(2.5, 10, 36, 130.5, -14, 0, ZTZ_MFD_CYAN, 0.2));

  // 2. Left Turret Gunner's Station (world X ~ +25 -> local X = -75, local Z = -58)
  parts.push(boxAt(34, 9, 36, -86, 4, -58, ZTZ_CREW_SEAT, 0.8));
  parts.push(boxAt(9, 38, 36, -104, 24, -58, ZTZ_CREW_SEAT, 0.8));
  // Gunner's ballistic fire-control computer & glowing cyan-green tactical MFD screen
  parts.push(boxAt(18, 22, 32, -46, 30, -58, ZTZ_ORDNANCE_STEEL, 0.6));
  parts.push(boxAt(2.5, 16, 26, -55.5, 30, -58, ZTZ_MFD_CYAN, 0.2));

  // 3. Right Turret Commander's Station (world X ~ +20 -> local X = -80, local Z = +58)
  parts.push(boxAt(34, 9, 36, -88, 6, 58, ZTZ_CREW_SEAT, 0.8));
  parts.push(boxAt(9, 38, 36, -106, 26, 58, ZTZ_CREW_SEAT, 0.8));
  // Commander's hunter-killer CITV tactical battle-management display
  parts.push(boxAt(18, 22, 32, -48, 34, 58, ZTZ_ORDNANCE_STEEL, 0.6));
  parts.push(boxAt(2.5, 16, 26, -57.5, 34, 58, ZTZ_MFD_CYAN, 0.2));

  return sanitizeZtz99aMesh(mergeParts(parts));
}

// ============================================================================
// DYNAMIC `aSpringParam` CSG HELICAL SPRINGS (2 Parts — SKIPPED in `ztz99a.glb`!)
// Uses authentic 1:1 tank-scale forged wire radii (0.95–1.25 cm <= 2.5 cm limit)
// ============================================================================

/**
 * 25. `ztz99a_recoil_springs` (assembledPos = [15, 25, 0], local X in [0, 82], w = 1)
 * Twin heavy forged X-axis helical recuperator coils compressing smoothly as ZPT-98 recoils -32 cm!
 */
export function buildZtz99aRecoilSpringsGeometry(): THREE.BufferGeometry {
  const leftCoil = createHelicalSpring({
    axis: 'x',
    start: 0,
    end: 82,
    centerY: 0,
    centerZ: -16.5,
    coilRadius: 5.2,
    wireRadius: 1.25,
    coils: 13,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  const rightCoil = createHelicalSpring({
    axis: 'x',
    start: 0,
    end: 82,
    centerY: 0,
    centerZ: 16.5,
    coilRadius: 5.2,
    wireRadius: 1.25,
    coils: 13,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  paintGeometry(leftCoil, ZTZ_SPRING_STEEL);
  paintGeometry(rightCoil, ZTZ_SPRING_STEEL);
  return sanitizeZtz99aMesh(mergeParts([leftCoil, rightCoil]));
}

/**
 * 26. `ztz99a_rammer_spring` (assembledPos = [-138, 48, 0], local X in [0, 56], w = 1)
 * Horizontal X-axis chain-rammer return coil flexing smoothly via `scaleX` during autoloader ram cycle!
 */
export function buildZtz99aRammerSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: 0,
    end: 56,
    centerY: 0,
    centerZ: 0,
    coilRadius: 3.8,
    wireRadius: 0.95,
    coils: 14,
    radialSegments: 10,
    tubularSegmentsPerCoil: 16,
  });
  paintGeometry(spring, ZTZ_SPRING_STEEL);
  return sanitizeZtz99aMesh(spring);
}
