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
// U.S. Army M1A2 SEP v3 Abrams Main Battle Tank (120mm L/44 M256)
// Shared 1:1 CAD Metrology Constants (`1 world unit = 1 cm = 10 mm`)
// Coordinate System: +X front/muzzle, +Y up, +Z right flank.
// ============================================================================

export const M1A2_GROUND_Y = -120.0;
export const M1A2_HULL_FLOOR_Y = -72.0;
export const M1A2_HULL_DECK_Y = 12.0;
export const M1A2_TURRET_CENTER_X = 20.0;
export const M1A2_BORE_Y = 44.0;
export const M1A2_CHAMBER_X = 54.0;
export const M1A2_MUZZLE_X = 581.0;

/** Authentic M256 120mm L/44 hydraulic recoil stroke (300 mm = 30.0 cm). */
export const M1A2_RECOIL_STROKE = 30.0;

/** Authentic vertical falling-wedge breechblock drop (150 mm = 15.0 cm). */
export const M1A2_BREECH_DROP = 15.0;

/** Armored rear bustle blast-door lateral slide stroke (340 mm = 34.0 cm). */
export const M1A2_BLAST_DOOR_SLIDE = 34.0;

/** Loader extraction & breech ramming travel of 120mm M829A4 ready round (196 cm). */
export const M1A2_READY_ROUND_RAM = 196.0;

// Physically calibrated U.S. Army Desert CARC Tan & Ordnance Metallic Palette
// (All linear luminances >> 0.018 Khronos anti-crush floor)
export const M1A2_CARC_TAN = '#9e8a66';
export const M1A2_CARC_TAN_DARK = '#867353';
export const M1A2_CARC_TAN_LIGHT = '#b4a07a';
export const M1A2_GUN_SHROUD = '#8f7d5d';
export const M1A2_GUN_STEEL = '#565d68';
export const M1A2_CHROME_STEEL = '#bcc6d4';
export const M1A2_DARK_ARMOR = '#4a525e';
export const M1A2_RUBBER_TRACK = '#42474f';
export const M1A2_TITANIUM = '#aeb8c6';
export const M1A2_COPPER_RECUP = '#c87c44';
export const M1A2_DU_PLATE = '#4d5563';
export const M1A2_CERAMIC_NERA = '#c9bca0';
export const M1A2_AMMO_COMBUSTIBLE = '#7d7a58';
export const M1A2_AMMO_BRASS = '#cf9e44';
export const M1A2_AMMO_SABOT = '#b8c0ca';
export const M1A2_HAZARD_YELLOW = '#eab308';
export const M1A2_OPTICS_EMERALD = '#1fa87a';
export const M1A2_LCD_CYAN = '#22c55e';
export const M1A2_SPRING_STEEL = '#94a3b8';

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
 * generates clean [0.04, 0.96] triplanar-box UVs for CSG fallback parity.
 */
export function sanitizeM1a2Mesh(
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
        cArr[di * 3] = col ? col.getX(si) : 0.52;
        cArr[di * 3 + 1] = col ? col.getY(si) : 0.45;
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.34;
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
  outNorm.needsUpdate = true;

  // Triplanar [0.04, 0.96] UVs so custom-atlas UV contracts always pass cleanly
  out.computeBoundingBox();
  const bb = out.boundingBox!;
  const sx = Math.max(bb.max.x - bb.min.x, 1e-4);
  const sy = Math.max(bb.max.y - bb.min.y, 1e-4);
  const sz = Math.max(bb.max.z - bb.min.z, 1e-4);
  const uvAttr = out.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < nTotal; i++) {
    const x = outPos.getX(i);
    const y = outPos.getY(i);
    const z = outPos.getZ(i);
    const nx = Math.abs(outNorm.getX(i));
    const ny = Math.abs(outNorm.getY(i));
    const nz = Math.abs(outNorm.getZ(i));
    let u: number;
    let v: number;
    if (nz >= nx && nz >= ny) {
      u = (x - bb.min.x) / sx;
      v = (y - bb.min.y) / sy;
    } else if (ny >= nx) {
      u = (x - bb.min.x) / sx;
      v = (z - bb.min.z) / sz;
    } else {
      u = (z - bb.min.z) / sz;
      v = (y - bb.min.y) / sy;
    }
    uvAttr.setXY(i, 0.04 + clamp01(u) * 0.92, 0.04 + clamp01(v) * 0.92);
  }
  uvAttr.needsUpdate = true;
  out.computeBoundingSphere();
  return out;
}

function makeBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  hex: string,
  chamfer = 0.8
): THREE.BufferGeometry {
  const g = createChamferedBox(
    w,
    h,
    d,
    Math.min(chamfer, Math.min(w, h, d) * 0.2),
    hex
  );
  g.translate(x, y, z);
  return g;
}

function makeCylX(
  rTop: number,
  rBot: number,
  len: number,
  x: number,
  y: number,
  z: number,
  hex: string,
  segs = 24,
  bevel = 0.3
): THREE.BufferGeometry {
  const g = createBeveledCylinder(
    rTop,
    rBot,
    len,
    Math.min(bevel, Math.min(rTop, rBot) * 0.25, len * 0.2),
    segs,
    hex
  );
  g.rotateZ(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function makeCylY(
  rTop: number,
  rBot: number,
  len: number,
  x: number,
  y: number,
  z: number,
  hex: string,
  segs = 24,
  bevel = 0.3
): THREE.BufferGeometry {
  const g = createBeveledCylinder(
    rTop,
    rBot,
    len,
    Math.min(bevel, Math.min(rTop, rBot) * 0.25, len * 0.2),
    segs,
    hex
  );
  g.translate(x, y, z);
  return g;
}

function makeCylZ(
  rTop: number,
  rBot: number,
  len: number,
  x: number,
  y: number,
  z: number,
  hex: string,
  segs = 24,
  bevel = 0.3
): THREE.BufferGeometry {
  const g = createBeveledCylinder(
    rTop,
    rBot,
    len,
    Math.min(bevel, Math.min(rTop, rBot) * 0.25, len * 0.2),
    segs,
    hex
  );
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Extrudes a 2D (x, y) CCW polygon symmetrically along Z ∈ [-depth/2, +depth/2]. */
function makeExtrudedXY(
  pts: ReadonlyArray<readonly [number, number]>,
  depthZ: number,
  hex: string,
  centerZ = 0
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();
  const ext = new THREE.ExtrudeGeometry(shape, {
    depth: depthZ,
    bevelEnabled: false,
    steps: 1,
  });
  ext.translate(0, 0, centerZ - depthZ * 0.5);
  const g = ext.index ? ext.toNonIndexed() : ext;
  if (g !== ext) ext.dispose();
  g.computeVertexNormals();
  paintGeometry(g, hex);
  return g;
}

/** Extrudes a 2D (x, z) planform polygon along Y ∈ [yMin, yMax]. */
function makeExtrudedXZ(
  pts: ReadonlyArray<readonly [number, number]>,
  yMin: number,
  yMax: number,
  hex: string
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // Note: ExtrudeGeometry extrudes along +Z; rotateX(-PI/2) maps (sx, sy, sz) -> (sx, sz, -sy)
  shape.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], -pts[i][1]);
  }
  shape.closePath();
  const ext = new THREE.ExtrudeGeometry(shape, {
    depth: yMax - yMin,
    bevelEnabled: false,
    steps: 1,
  });
  ext.rotateX(-Math.PI / 2);
  ext.translate(0, yMin, 0);
  const g = ext.index ? ext.toNonIndexed() : ext;
  if (g !== ext) ext.dispose();
  g.computeVertexNormals();
  paintGeometry(g, hex);
  return g;
}

function buildOne120mmRound(
  cx: number,
  cy: number,
  cz: number
): THREE.BufferGeometry[] {
  // 120x570mm NATO M829A4 APFSDS unitary round (total length 98 cm: local X ∈ [-49, +49])
  return [
    // Aft metallic stub base + rim
    makeCylX(7.9, 7.9, 10.5, cx - 43.75, cy, cz, M1A2_AMMO_BRASS, 16, 0.25),
    makeCylX(8.4, 8.4, 2.0, cx - 48.0, cy, cz, M1A2_CHROME_STEEL, 16, 0.15),
    // Olive-tan combustible propellant cartridge case
    makeCylX(7.6, 7.8, 49.0, cx - 14.0, cy, cz, M1A2_AMMO_COMBUSTIBLE, 16, 0.25),
    // Machined aluminum sabot petal collar
    makeCylX(5.8, 7.2, 13.5, cx + 17.2, cy, cz, M1A2_AMMO_SABOT, 16, 0.2),
    // Depleted-uranium long-rod penetrator dart + windshield tip
    makeCylX(1.6, 2.0, 22.0, cx + 34.0, cy, cz, M1A2_DARK_ARMOR, 14, 0.12),
    makeCylX(0.35, 1.6, 5.0, cx + 46.5, cy, cz, M1A2_CHROME_STEEL, 14, 0.08),
  ];
}

// ============================================================================
// DYNAMIC `aSpringParam` CSG SPRINGS (2 parts — SKIPPED IN `m1a2.glb`)
// ============================================================================

/**
 * 1. `m1a2_recoil_springs` (`slide`, dynamic X-axis helical recuperator coils `w=1`)
 * Twin heavy forged X-axis recuperator springs flanking the M256 breech cradle (`Z = ±26 cm`).
 * Local X ∈ [0, +74], Y ∈ [-7.2, +7.2], Z ∈ [-33.2, +33.2], front anchored at X = +74.
 */
export function buildM1a2RecoilSpringsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sz of [-26.0, 26.0]) {
    const coil = createHelicalSpring({
      axis: 'x',
      start: 74.0,
      end: 0.0,
      centerY: 0.0,
      centerZ: sz,
      coilRadius: 5.4,
      wireRadius: 1.4,
      coils: 9.5,
      radialSegments: 10,
      stepsPerCoil: 18,
    });
    paintGeometry(coil, M1A2_SPRING_STEEL);
    parts.push(coil);
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 4));
}

/**
 * 2. `m1a2_door_spring` (`magazine`, dynamic X-axis pneumatic/spring blast-door return coil `w=1`)
 * Horizontal return spring mounted along the top armored blast-door actuator rail.
 * Local X ∈ [0, +52], Y ∈ [-4.2, +4.2], Z ∈ [-4.2, +4.2], rear anchored at X = 0.
 */
export function buildM1a2DoorSpringGeometry(): THREE.BufferGeometry {
  const coil = createHelicalSpring({
    axis: 'x',
    start: 0.0,
    end: 52.0,
    centerY: 0.0,
    centerZ: 0.0,
    coilRadius: 3.1,
    wireRadius: 0.95,
    coils: 11.0,
    radialSegments: 10,
    stepsPerCoil: 18,
  });
  paintGeometry(coil, M1A2_SPRING_STEEL);
  return sanitizeM1a2Mesh(coil);
}

// ============================================================================
// SUITE 1 — `m1a2_v3_hull_armor` (8 solid parts)
// ============================================================================

/**
 * 3. `m1a2_hull_shell` (`frame`, `isShell: true`)
 * True hollow welded M1A2 SEP v3 armored hull (15–18 cm walls), iconic sharp chisel nose,
 * rear turbine step deck, front headlights & tow shackles.
 * Local Box: X ∈ [-396, +397], Y ∈ [-72, +22], Z ∈ [-173, +173].
 */
export function buildM1a2HullShellGeometry(): THREE.BufferGeometry {
  // Lower hull tub profile (chisel nose to rear exhaust bulkhead)
  const lowerProfile: Array<[number, number]> = [
    [-392, -56],
    [-372, -72],
    [268, -72],
    [397, -22],
    [186, 12],
    [-156, 12],
    [-168, 22],
    [-388, 22],
    [-396, -12],
  ];
  const lowerTub = makeExtrudedXY(lowerProfile, 224, M1A2_CARC_TAN, 0);

  // Upper track sponsons flanking Z ∈ [-173, +173] over road wheels
  const sponsonProfile: Array<[number, number]> = [
    [-392, -16],
    [388, -16],
    [395, -22],
    [340, -10],
    [186, 12],
    [-156, 12],
    [-168, 22],
    [-388, 22],
  ];
  const sponsonOuter = makeExtrudedXY(sponsonProfile, 346, M1A2_CARC_TAN, 0);

  // Hollow interior cavity (crew + engine + turret well) carved via CSG subtract
  const crewAndEngineCavity = makeBox(660, 62, 188, -32, -25, 0, M1A2_CARC_TAN_DARK, 2.0);
  const turretWellCut = makeCylY(102, 102, 48, 20, 12, 0, M1A2_CARC_TAN_DARK, 28, 0.2);
  const engineDeckCut = makeBox(218, 44, 186, -268, 12, 0, M1A2_CARC_TAN_DARK, 1.0);

  const solidHull = mergeParts([lowerTub, sponsonOuter], Math.PI / 5);
  const hollowHull = csgSubtract(
    solidHull,
    [crewAndEngineCavity, turretWellCut, engineDeckCut],
    Math.PI / 5
  );

  // Add front fenders, headlights & front armored tow shackles
  const details: THREE.BufferGeometry[] = [hollowHull];
  for (const sz of [-1, 1]) {
    // Armored headlight brush guard & housing
    details.push(makeBox(26, 16, 22, 346, -6, sz * 144, M1A2_CARC_TAN_DARK, 1.0));
    details.push(makeCylX(5.2, 5.2, 8, 358, -6, sz * 144, M1A2_CHROME_STEEL, 14, 0.2));
    // Heavy steel front tow shackle clevises
    details.push(makeBox(22, 14, 10, 384, -36, sz * 76, M1A2_DARK_ARMOR, 1.0));
    details.push(makeCylZ(4.5, 4.5, 16, 391, -36, sz * 76, M1A2_DARK_ARMOR, 12, 0.2));
  }
  return sanitizeM1a2Mesh(mergeParts(details, Math.PI / 5));
}

/**
 * 4. `m1a2_side_skirts` (`frame`, `isShell: true`)
 * Heavy modular ballistic side skirts (7 hinged panels per side, thicker forward heavy armor panels).
 * AssembledPos: [0, -54, 0]. Local Box: X ∈ [-352, +345], Y ∈ [-36, +34], Z ∈ [-183, +183].
 */
export function buildM1a2SideSkirtsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const panelXs = [-302, -206, -110, -14, 82, 178, 284];
  const panelWs = [94, 92, 92, 92, 92, 96, 118];
  for (const side of [-1, 1]) {
    const zPos = side * 178.0;
    for (let i = 0; i < panelXs.length; i++) {
      const thick = i >= 5 ? 9.5 : 7.5;
      const h = i === 0 ? 58 : i === 6 ? 68 : 66;
      parts.push(
        makeBox(panelWs[i], h, thick, panelXs[i], -1, zPos, M1A2_CARC_TAN, 0.9)
      );
      // Top hinge bracket
      parts.push(
        makeBox(16, 8, 9, panelXs[i] - 24, 30, zPos - side * 1.5, M1A2_CARC_TAN_DARK, 0.6)
      );
      parts.push(
        makeBox(16, 8, 9, panelXs[i] + 24, 30, zPos - side * 1.5, M1A2_CARC_TAN_DARK, 0.6)
      );
    }
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 5. `m1a2_road_wheels` (`frame`)
 * 7 pairs of dual-disc heavy Abrams road wheels + rear toothed drive sprockets + front idlers + return rollers.
 * AssembledPos: [0, -84, 0]. Local Box: X ∈ [-346, +342], Y ∈ [-32, +34], Z ∈ [-174, +174].
 */
export function buildM1a2RoadWheelsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wheelXs = [-240, -162, -84, -6, 72, 150, 228];

  for (const side of [-1, 1]) {
    const zCenter = side * 146.0;
    // 7 dual road wheels with rubber tires & heavy central hubs (rest flush on inner track Y=-113.5)
    for (const wx of wheelXs) {
      for (const dz of [-15.0, 15.0]) {
        parts.push(makeCylZ(30.2, 30.2, 12.5, wx, 1.0, zCenter + dz, M1A2_RUBBER_TRACK, 22, 0.8));
        parts.push(makeCylZ(23.5, 23.5, 13.8, wx, 1.0, zCenter + dz, M1A2_CARC_TAN, 20, 0.6));
      }
      // Hub cap + torsion swingarm boss
      parts.push(makeCylZ(10.8, 10.8, 48.0, wx, 1.0, zCenter, M1A2_DARK_ARMOR, 14, 0.5));
      parts.push(makeBox(18, 12, 34, wx - 10, 7.0, side * 116, M1A2_CARC_TAN_DARK, 0.8));
    }

    // Rear toothed drive sprocket (X = -316, Y = +11 -> world Y = -73, R = 25 -> top -48 inside track!)
    for (const dz of [-16.0, 16.0]) {
      parts.push(makeCylZ(25.0, 25.0, 9.0, -316, 11.0, zCenter + dz, M1A2_DARK_ARMOR, 18, 0.5));
    }
    parts.push(makeCylZ(16.0, 16.0, 50.0, -316, 11.0, zCenter, M1A2_CARC_TAN_DARK, 16, 0.6));

    // Front tensioning idler wheel (X = +314, Y = +11 -> world Y = -73, R = 24 -> top -49 inside track!)
    for (const dz of [-14.0, 14.0]) {
      parts.push(makeCylZ(24.0, 24.0, 11.0, 314, 11.0, zCenter + dz, M1A2_CARC_TAN, 20, 0.6));
    }
    parts.push(makeCylZ(12.5, 12.5, 44.0, 314, 11.0, zCenter, M1A2_DARK_ARMOR, 14, 0.5));

    // Upper track support return rollers (Y = +29 -> world Y = -55, R = 7 -> top -48!)
    for (const rx of [-195, -45, 110]) {
      parts.push(makeCylZ(7.0, 7.0, 36.0, rx, 29.0, zCenter, M1A2_DARK_ARMOR, 12, 0.4));
    }
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

function buildTrackBeltSide(): THREE.BufferGeometry {
  // Continuous T158 Bigfoot double-pin rubber-padded track loop
  // Local Box: X ∈ [-356, +352], Y ∈ [-38, +38], Z ∈ [-32, +32]
  // AssembledPos: [0, -82, ±146] -> ground contact at Y = -82 - 38 = -120.0 cm!
  const outerPts: Array<[number, number]> = [
    [-356, 16],
    [-316, 40],
    [314, 40],
    [352, 16],
    [336, -6],
    [248, -38],
    [-258, -38],
    [-344, -8],
  ];
  const innerPts: Array<[number, number]> = [
    [-346, 15],
    [-312, 34],
    [310, 34],
    [342, 15],
    [327, -2],
    [244, -31.5],
    [-254, -31.5],
    [-335, -4],
  ];
  const outer = makeExtrudedXY(outerPts, 63.0, M1A2_RUBBER_TRACK, 0);
  const inner = makeExtrudedXY(innerPts, 70.0, M1A2_RUBBER_TRACK, 0);
  const belt = csgSubtract(outer, [inner], Math.PI / 5);

  const parts: THREE.BufferGeometry[] = [belt];
  // Bottom ground-contact rubber shoe pads & end-connector steel blocks
  for (let x = -244; x <= 238; x += 28) {
    parts.push(makeBox(20, 3.0, 56, x, -36.5, 0, M1A2_RUBBER_TRACK, 0.4));
    parts.push(makeBox(10, 5.0, 64, x, -34.0, 0, M1A2_DARK_ARMOR, 0.4));
  }
  // Top track run cleats
  for (let x = -296; x <= 296; x += 32) {
    parts.push(makeBox(20, 3.0, 56, x, 38.5, 0, M1A2_RUBBER_TRACK, 0.4));
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/** 6. `m1a2_tracks_left` (`frame`) */
export function buildM1a2TracksLeftGeometry(): THREE.BufferGeometry {
  return buildTrackBeltSide();
}

/** 7. `m1a2_tracks_right` (`frame`, `isShell: true`) */
export function buildM1a2TracksRightGeometry(): THREE.BufferGeometry {
  return buildTrackBeltSide();
}

/**
 * 8. `m1a2_engine_deck` (`frame`, `isShell: true`)
 * Iconic slatted rear AGT1500 turbine intake & exhaust deck armor with louvers.
 * AssembledPos: [-268, +20, 0]. Local Box: X ∈ [-122, +114], Y ∈ [-14, +10], Z ∈ [-118, +118].
 */
export function buildM1a2EngineDeckGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Main deck frame rails
  parts.push(makeBox(234, 8, 22, -4, 4, -106, M1A2_CARC_TAN, 0.8));
  parts.push(makeBox(234, 8, 22, -4, 4, 106, M1A2_CARC_TAN, 0.8));
  parts.push(makeBox(36, 9, 234, 96, 4, 0, M1A2_CARC_TAN, 0.8));
  parts.push(makeBox(28, 9, 234, -108, 4, 0, M1A2_CARC_TAN, 0.8));
  // Center armored access spine
  parts.push(makeBox(184, 9, 32, -8, 4.5, 0, M1A2_CARC_TAN, 0.8));
  // Slatted intake & cooling louver fins across left & right grilles
  for (let x = -88; x <= 68; x += 14) {
    parts.push(makeBox(6, 7, 74, x, 5, -56, M1A2_DARK_ARMOR, 0.4));
    parts.push(makeBox(6, 7, 74, x, 5, 56, M1A2_DARK_ARMOR, 0.4));
  }
  // Rear vertical jet-blast exhaust louver box
  parts.push(makeBox(14, 22, 164, -115, -3, 0, M1A2_DARK_ARMOR, 0.6));
  for (let y = -11; y <= 5; y += 5) {
    parts.push(makeBox(16, 2.2, 152, -116, y, 0, M1A2_CARC_TAN_DARK, 0.3));
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 9. `m1a2_torsion_bars` (`frame`)
 * 14 high-strength steel transverse torsion bars + splined end anchors & rotary shock dampers.
 * AssembledPos: [0, -64, 0]. Local Box: X ∈ [-275, +265], Y ∈ [-6, +6], Z ∈ [-118, +118].
 */
export function buildM1a2TorsionBarsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wheelXs = [-240, -162, -84, -6, 72, 150, 228];
  for (const wx of wheelXs) {
    // Paired offset left/right torsion shafts spanning full lower hull width
    parts.push(makeCylZ(2.6, 2.6, 232, wx - 5.5, -1.5, 0, M1A2_GUN_STEEL, 12, 0.2));
    parts.push(makeCylZ(2.6, 2.6, 232, wx + 5.5, 1.5, 0, M1A2_CHROME_STEEL, 12, 0.2));
    // Splined anchor sockets at hull sidewalls
    parts.push(makeBox(18, 9, 10, wx, 0, -112, M1A2_DARK_ARMOR, 0.5));
    parts.push(makeBox(18, 9, 10, wx, 0, 112, M1A2_DARK_ARMOR, 0.5));
  }
  // Front & rear rotary hydraulic shock damper housings (Stations 1, 2, 7)
  for (const dx of [-258, 162, 248]) {
    for (const side of [-1, 1]) {
      parts.push(makeCylZ(5.5, 5.5, 16, dx, 0, side * 108, M1A2_CARC_TAN_DARK, 12, 0.4));
    }
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 10. `m1a2_turret_ring` (`frame`)
 * Precision geared steel turret race ring, ball-bearing flange & hydraulic azimuth drive pinion.
 * AssembledPos: [+20, +12, 0]. Local Box: X ∈ [-108, +108], Y ∈ [-10, +10], Z ∈ [-108, +108].
 */
export function buildM1a2TurretRingGeometry(): THREE.BufferGeometry {
  const outer = makeCylY(108, 108, 14, 0, 0, 0, M1A2_CHROME_STEEL, 36, 0.6);
  const inner = makeCylY(94, 94, 22, 0, 0, 0, M1A2_DARK_ARMOR, 36, 0.2);
  const ring = csgSubtract(outer, [inner], Math.PI / 5);

  const parts: THREE.BufferGeometry[] = [ring];
  // Internal geared ring teeth segments (24 precision gear lugs around inner perimeter)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const gx = Math.cos(a) * 93.0;
    const gz = Math.sin(a) * 93.0;
    const tooth = createChamferedBox(5.5, 9.0, 5.5, 0.4, M1A2_GUN_STEEL);
    tooth.rotateY(-a);
    tooth.translate(gx, 0, gz);
    parts.push(tooth);
  }
  // Hydraulic azimuth traverse motor & drive pinion on inner left-rear wall
  parts.push(makeCylY(10.5, 10.5, 19.5, -72, 0, -48, M1A2_DARK_ARMOR, 16, 0.5));
  parts.push(makeCylY(6.0, 6.0, 12.0, -82, 0, -48, M1A2_COPPER_RECUP, 14, 0.3));
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

// ============================================================================
// SUITE 2 — `m1a2_v3_turret_gun` (8 solid parts)
// ============================================================================

/**
 * 11. `m1a2_turret_shell` (`frame`, `isShell: true`)
 * True hollow angular faceted Abrams turret with extended rear ammo bustle, interior blast bulkhead,
 * cheek armor cavities, rear bustle stowage rack & CIP panels.
 * AssembledPos: [0, 0, 0]. Local Box: X ∈ [-258, +228], Y ∈ [+12, +76], Z ∈ [-166, +166].
 */
export function buildM1a2TurretShellGeometry(): THREE.BufferGeometry {
  // Iconic angular Abrams turret planform
  const outerPlan: Array<[number, number]> = [
    [228, -94],
    [228, 94],
    [76, 164],
    [-254, 140],
    [-254, -140],
    [76, -164],
  ];
  const outerSolid = makeExtrudedXZ(outerPlan, 12, 76, M1A2_CARC_TAN);

  // Hollow crew cavity + tapered front cheek NERA pockets (strictly >=16 cm inside outer cheek skin!)
  // + rear bustle ammo bay + snug mantlet aperture
  const crewCav = makeBox(190, 52, 196, 18, 42, 0, M1A2_CARC_TAN_DARK, 1.5);
  const bustleCav = makeBox(152, 48, 246, -168, 43, 0, M1A2_CARC_TAN_DARK, 1.5);
  const doorPass = makeBox(32, 44, 92, -84, 43, 0, M1A2_CARC_TAN_DARK, 1.0);
  const mantletCut = makeBox(124, 40, 88, 178, 44, 0, M1A2_CARC_TAN_DARK, 1.0);
  const cheekRPlan: Array<[number, number]> = [
    [90, 50],
    [210, 50],
    [210, 84],
    [90, 138],
  ];
  const cheekLPlan: Array<[number, number]> = [
    [90, -138],
    [210, -84],
    [210, -50],
    [90, -50],
  ];
  const cheekR = makeExtrudedXZ(cheekRPlan, 22, 66, M1A2_CARC_TAN_DARK);
  const cheekL = makeExtrudedXZ(cheekLPlan, 22, 66, M1A2_CARC_TAN_DARK);
  const roofBlowoffCut = makeBox(138, 16, 222, -166, 74, 0, M1A2_CARC_TAN_DARK, 0.5);

  const hollowTurret = csgSubtract(
    outerSolid,
    [crewCav, bustleCav, doorPass, mantletCut, cheekL, cheekR, roofBlowoffCut],
    Math.PI / 5
  );

  const parts: THREE.BufferGeometry[] = [hollowTurret];
  // Side CIP (Combat Identification Panels) louvered thermal plates
  for (const side of [-1, 1]) {
    parts.push(makeBox(56, 36, 5, -148, 44, side * 150, M1A2_CARC_TAN_LIGHT, 0.6));
    // Side bustle rail bars
    parts.push(makeBox(150, 4, 4, -152, 66, side * 156, M1A2_DARK_ARMOR, 0.4));
    parts.push(makeBox(150, 4, 4, -152, 26, side * 156, M1A2_DARK_ARMOR, 0.4));
  }
  // Rear bustle stowage rack frame
  parts.push(makeBox(8, 34, 220, -254, 46, 0, M1A2_DARK_ARMOR, 0.5));
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 12. `m1a2_blowoff_panels` (`frame`, `isShell: true`)
 * Roof-mounted armored ammunition compartment blow-off vent panels designed to vent sympathetic
 * ammunition cook-off blast upward away from the crew!
 * AssembledPos: [-166, +73, 0]. Local Box: X ∈ [-70, +70], Y ∈ [-4, +5], Z ∈ [-112, +112].
 */
export function buildM1a2BlowoffPanelsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // 3 segmented heavy blow-off armor roof plates w/ shear bolts & lift handles
  for (const sz of [-72, 0, 72]) {
    parts.push(makeBox(136, 6.2, 68, 0, 0.5, sz, M1A2_CARC_TAN, 0.8));
    parts.push(makeBox(124, 2.2, 56, 0, 3.8, sz, M1A2_CARC_TAN_DARK, 0.5));
    // Shear retention bolts around perimeter
    for (const bx of [-56, 0, 56]) {
      parts.push(makeCylY(1.8, 1.8, 2.5, bx, 3.6, sz - 26, M1A2_DARK_ARMOR, 10, 0.2));
      parts.push(makeCylY(1.8, 1.8, 2.5, bx, 3.6, sz + 26, M1A2_DARK_ARMOR, 10, 0.2));
    }
  }
  // Longitudinal armored seal straps
  parts.push(makeBox(138, 4.0, 5.5, 0, 1.2, -36, M1A2_DARK_ARMOR, 0.4));
  parts.push(makeBox(138, 4.0, 5.5, 0, 1.2, 36, M1A2_DARK_ARMOR, 0.4));
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 13. `m1a2_composite_armor` (`frame`)
 * THE PROTECTION SHOWPIECE: Multi-layer angled Chobham / Depleted-Uranium (DU) NERA sandwich
 * cheek armor arrays seated visibly inside the hollow turret front cheeks!
 * AssembledPos: [+148, +44, 0]. Local Box: X ∈ [-52, +52], Y ∈ [-20, +20], Z ∈ [-134, +134].
 */
export function buildM1a2CompositeArmorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const layerColors = [
    M1A2_DARK_ARMOR, // Outer high-hardness RHA faceplate
    M1A2_CERAMIC_NERA, // Sintered alumina/SiC ceramic tile bank
    M1A2_DU_PLATE, // Heavy depleted-uranium mesh encased plate
    M1A2_COPPER_RECUP, // Elastomeric / copper-alloy shock-attenuation liner
    M1A2_CERAMIC_NERA, // Secondary NERA flyer plate bank
    M1A2_DU_PLATE, // Inner DU spall-arrest plate
    M1A2_CHROME_STEEL, // Interior crew-side spall backing plate
  ];

  // Tapered 7-layer Chobham/DU array seated strictly >=16 cm inside the sealed outer turret cheeks!
  // Cavity span: world X ∈ [90, 210] (local [-58, +62]), inner Z = 50, outer Z(X) = 138 - 0.45*(X-90).
  const layerSpecs: ReadonlyArray<readonly [number, number, number]> = [
    [-46, 52, 86], // rear-most widest NERA plate (world X=102, Z ∈ [60, 112])
    [-31, 48, 84],
    [-16, 44, 82],
    [-1, 40, 79],
    [14, 35, 76],
    [29, 30, 73],
    [44, 24, 68], // forward-most nose plate (world X=192, Z ∈ [56, 80] << Z_outer(192)=110.6!)
  ];

  for (const side of [-1, 1]) {
    for (let i = 0; i < layerColors.length; i++) {
      const [lx, spanZ, cz] = layerSpecs[i];
      const plate = createChamferedBox(7.2, 36.0, spanZ, 0.55, layerColors[i]);
      plate.rotateY(side * -0.4);
      plate.translate(lx, 0, side * cz);
      parts.push(plate);
    }
    // Top & bottom titanium cassette retaining rails tucked cleanly inside the tapered cavity
    const railTop = createChamferedBox(94, 3.0, 9.0, 0.4, M1A2_TITANIUM);
    railTop.rotateY(side * -0.4);
    railTop.translate(-4, 17.5, side * 78.0);
    parts.push(railTop);
    const railBot = createChamferedBox(94, 3.0, 9.0, 0.4, M1A2_TITANIUM);
    railBot.rotateY(side * -0.4);
    railBot.translate(-4, -17.5, side * 78.0);
    parts.push(railBot);
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 14. `m1a2_main_gun` (`slide`)
 * 120mm L/44 M256 smoothbore cannon barrel with Desert CARC Tan/charcoal thermal shroud,
 * concentric bore evacuator fume extractor & Muzzle Reference Sensor (MRS) collimator mast!
 * AssembledPos: [+68, +44, 0]. Local Box: X ∈ [0, +513], Y ∈ [-14, +15], Z ∈ [-14, +14].
 */
export function buildM1a2MainGunGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Rear chamber swell & recoil sleigh interface (X ∈ [0, 105])
  parts.push(makeCylX(11.4, 12.6, 105, 52.5, 0, 0, M1A2_GUN_STEEL, 24, 0.5));
  // Rear thermal shroud jacket (X ∈ [105, 212])
  parts.push(makeCylX(10.0, 10.6, 107, 158.5, 0, 0, M1A2_GUN_SHROUD, 24, 0.4));
  // Iconic concentric bore evacuator / fume extractor (X ∈ [212, 282], R = 13.4 cm)
  parts.push(makeCylX(13.4, 13.4, 56, 247, 0, 0, M1A2_GUN_SHROUD, 28, 0.8));
  parts.push(makeCylX(13.4, 10.2, 8, 215, 0, 0, M1A2_DARK_ARMOR, 24, 0.3));
  parts.push(makeCylX(9.4, 13.4, 8, 279, 0, 0, M1A2_DARK_ARMOR, 24, 0.3));
  // Forward thermal shroud jacket (X ∈ [282, 492])
  parts.push(makeCylX(8.4, 9.4, 210, 387, 0, 0, M1A2_GUN_SHROUD, 24, 0.4));
  // Thermal shroud clamp bands
  for (const bx of [136, 184, 316, 378, 442, 488]) {
    parts.push(makeCylX(9.8, 9.8, 3.8, bx, 0, 0, M1A2_DARK_ARMOR, 20, 0.2));
  }
  // Exposed forged chrome-moly muzzle tip (X ∈ [492, 513] -> World X = +581 cm!)
  const muzzleBlank = makeCylX(8.6, 8.8, 21, 502.5, 0, 0, M1A2_GUN_STEEL, 24, 0.4);
  const boreHole = makeCylX(6.0, 6.0, 26, 504.0, 0, 0, M1A2_DARK_ARMOR, 20, 0.1);
  parts.push(csgSubtract(muzzleBlank, [boreHole], Math.PI / 5));

  // Muzzle Reference Sensor (MRS) optical collimator mast atop muzzle crown
  parts.push(makeBox(5.5, 7.2, 4.2, 504.5, 11.4, 0, M1A2_DARK_ARMOR, 0.4));
  parts.push(makeCylX(2.4, 2.4, 4.5, 504.5, 13.0, 0, M1A2_CHROME_STEEL, 12, 0.2));
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 15. `m1a2_gun_mantlet` (`slide`)
 * Heavy armored gun rotor shield flush-sealing turret front aperture, trunnion mount,
 * coaxial M240 port & twin hydraulic recoil brake cylinders.
 * AssembledPos: [+148, +44, 0]. Local Box: X ∈ [-42, +86], Y ∈ [-21, +21], Z ∈ [-46, +46].
 */
export function buildM1a2GunMantletGeometry(): THREE.BufferGeometry {
  // Deep armored rotor mask spanning flush to turret front nose (world X ∈ [158, 226]) with zero side gap!
  const shield = makeBox(68, 42, 92, 44, 0, 0, M1A2_CARC_TAN, 1.4);
  const boreClear = makeCylX(13.0, 13.0, 78, 44, 0, 0, M1A2_DARK_ARMOR, 20, 0.2);
  const shieldOpen = csgSubtract(shield, [boreClear], Math.PI / 5);

  const parts: THREE.BufferGeometry[] = [shieldOpen];
  // Armored barrel collar bezel protruding cleanly forward of rotor mask (local X ∈ [72, 86])
  const collar = makeCylX(16.6, 18.4, 14, 79, 0, 0, M1A2_CARC_TAN_DARK, 24, 0.6);
  const collarHole = makeCylX(12.8, 12.8, 20, 79, 0, 0, M1A2_DARK_ARMOR, 20, 0.2);
  parts.push(csgSubtract(collar, [collarHole], Math.PI / 5));

  // Internal trunnion cradle cheeks & twin hydraulic recoil brake cylinders
  for (const sz of [-26.0, 26.0]) {
    parts.push(makeBox(54, 18, 12, -14, 0, sz * 1.35, M1A2_DARK_ARMOR, 0.8));
    // Twin hydraulic brake pistons above/below spring line
    parts.push(makeCylX(4.4, 4.4, 62, -11, 13.5, sz * 0.72, M1A2_CHROME_STEEL, 16, 0.3));
    parts.push(makeCylX(4.4, 4.4, 62, -11, -13.5, sz * 0.72, M1A2_GUN_STEEL, 16, 0.3));
  }
  // Coaxial M240 7.62mm machine gun barrel aperture (right side of flush mantlet face)
  parts.push(makeCylX(2.6, 2.8, 22, 74, 4, 28, M1A2_GUN_STEEL, 12, 0.2));
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 16. `m1a2_breech_block` (`fire_control`)
 * Massive machined steel M256 breech ring + vertical falling-wedge breechblock & electric firing solenoid.
 * AssembledPos: [+42, +44, 0]. Local Box: X ∈ [-26, +26], Y ∈ [-22, +19], Z ∈ [-22, +22].
 */
export function buildM1a2BreechBlockGeometry(): THREE.BufferGeometry {
  const ring = makeBox(48, 36, 42, 2, -1, 0, M1A2_GUN_STEEL, 1.4);
  const chamberCavity = makeCylX(8.6, 8.6, 54, 2, 0, 0, M1A2_DARK_ARMOR, 18, 0.2);
  const breechRing = csgSubtract(ring, [chamberCavity], Math.PI / 5);

  const parts: THREE.BufferGeometry[] = [breechRing];
  // Vertical falling-wedge machined steel block seated in rear slot
  parts.push(makeBox(16, 30, 24, -10, -5, 0, M1A2_CHROME_STEEL, 0.8));
  // Breech operating crank lever & semi-automatic cam roller on right flank
  parts.push(makeBox(18, 6, 8, -4, -12, 18, M1A2_DARK_ARMOR, 0.5));
  parts.push(makeCylZ(4.2, 4.2, 10, 8, -14, 17, M1A2_CHROME_STEEL, 12, 0.3));
  // Top firing solenoid housing & safety interlock bar
  parts.push(makeBox(22, 6, 16, 4, 16, 0, M1A2_DARK_ARMOR, 0.5));
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 17. `m1a2_crows_optics` (`fire_control`)
 * Roof-mounted CROWS-LP remote weapon station w/ M2HB .50 cal, commander's CITV thermal viewer &
 * gunner's armored doghouse GPS sight with multi-coated emerald-sapphire lenses!
 * AssembledPos: [+48, +98, 0]. Local Box: X ∈ [-78, +86], Y ∈ [-22, +26], Z ∈ [-96, +96].
 */
export function buildM1a2CrowsOpticsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // 1. Gunner's Primary Sight (GPS) armored doghouse on right turret roof (Z = +62)
  parts.push(makeBox(54, 26, 42, 44, -9, 62, M1A2_CARC_TAN, 1.2));
  parts.push(makeBox(8, 18, 28, 72, -9, 62, M1A2_DARK_ARMOR, 0.4));
  // Firewalled emerald-sapphire GPS primary objective lens
  parts.push(makeBox(4, 14, 22, 75, -9, 62, M1A2_OPTICS_EMERALD, 0.3));

  // 2. Commander's Independent Thermal Viewer (CITV) rotating turret on left roof (Z = -62)
  parts.push(makeCylY(18, 21, 14, 26, -14, -62, M1A2_CARC_TAN, 18, 0.6));
  parts.push(makeCylY(16, 16, 20, 26, 2, -62, M1A2_CARC_TAN_DARK, 18, 0.6));
  parts.push(makeBox(10, 12, 16, 40, 3, -62, M1A2_OPTICS_EMERALD, 0.4));

  // 3. Commander's Cupola ring & CROWS-LP Remote Weapon Station w/ M2HB .50 cal (Z = +46, rear)
  parts.push(makeCylY(34, 36, 11, -38, -16, 46, M1A2_CARC_TAN, 20, 0.6));
  // CROWS-LP gimbal yoke & sensor ball
  parts.push(makeBox(22, 24, 30, -34, 2, 46, M1A2_CARC_TAN_DARK, 0.8));
  parts.push(makeBox(16, 14, 14, -22, 6, 26, M1A2_DARK_ARMOR, 0.5));
  parts.push(makeCylX(4.2, 4.2, 6, -13, 6, 26, M1A2_OPTICS_EMERALD, 12, 0.2));
  // M2HB .50 cal receiver, ammo box & heavy barrel reaching exact top height Y = +124 (local +26)
  parts.push(makeBox(46, 12, 11, -24, 20, 46, M1A2_GUN_STEEL, 0.6));
  parts.push(makeCylX(2.4, 2.8, 86, 42, 21, 46, M1A2_GUN_STEEL, 14, 0.2));
  parts.push(makeBox(26, 16, 12, -26, 15, 60, M1A2_CARC_TAN, 0.5));

  // 4. Loader's armored hatch ring & pintle mount (Z = -58, rear)
  parts.push(makeCylY(26, 28, 8, -46, -17, -58, M1A2_CARC_TAN, 18, 0.5));
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 18. `m1a2_smoke_launchers` (`frame`)
 * Twin 4-barrel M250 smoke grenade discharger banks + dual flexible whip communications antennas.
 * AssembledPos: [+40, +58, 0]. Local Box: X ∈ [-145, +70], Y ∈ [-16, +62], Z ∈ [-174, +174].
 */
export function buildM1a2SmokeLaunchersGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    // Mounting plate welded to turret cheek shoulder
    parts.push(makeBox(28, 18, 8, 44, -4, side * 158, M1A2_CARC_TAN_DARK, 0.6));
    // 4 splayed 66mm M250 smoke grenade discharger tubes per bank
    for (let i = 0; i < 4; i++) {
      const tube = createBeveledCylinder(3.6, 3.8, 28, 0.3, 14, M1A2_GUN_STEEL);
      tube.rotateZ(-Math.PI / 2 + 0.45 + i * 0.05);
      tube.rotateY(side * (-0.18 - i * 0.07));
      tube.translate(54 + (i % 2) * 3, 2 + Math.floor(i / 2) * 7, side * (163 + i * 2.2));
      parts.push(tube);
    }
    // Rear flexible SINCGARS whip antenna base & mast
    parts.push(makeCylY(3.8, 4.5, 10, -138, 22, side * 96, M1A2_DARK_ARMOR, 12, 0.3));
    parts.push(makeCylY(0.8, 1.5, 42, -138, 41, side * 96, M1A2_GUN_STEEL, 10, 0.1));
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

// ============================================================================
// SUITE 3 — `m1a2_v3_turbine_bustle` (8 solid parts — THE CUTAWAY MASTERPIECE!)
// ============================================================================

/**
 * 19. `m1a2_blast_doors` (`magazine`)
 * THE STAR: Heavy twin sliding armored ammunition compartment blast doors separating the crew
 * from the rear bustle 120mm ammunition rack — slides open/closed smoothly in `computeFiringKinematics`!
 * AssembledPos: [-84, +43, 0]. Local Box: X ∈ [-7, +7], Y ∈ [-22, +22], Z ∈ [-46, +46].
 */
export function buildM1a2BlastDoorsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Twin armored sliding door leaves meeting along central tongue-and-groove seam
  for (const side of [-1, 1]) {
    parts.push(makeBox(9.5, 42, 43, 0, 0, side * 22.5, M1A2_CHROME_STEEL, 0.7));
    // Vertical yellow/black hazard caution band frame
    parts.push(makeBox(10.8, 36, 6, 0, 0, side * 4.5, M1A2_HAZARD_YELLOW, 0.4));
    // Recessed heavy steel grab handle & hydraulic roller shoe
    parts.push(makeBox(3.2, 14, 3.0, 6.0, 0, side * 14, M1A2_DARK_ARMOR, 0.3));
    parts.push(makeBox(11.0, 4.5, 14, 0, 19.5, side * 24, M1A2_GUN_STEEL, 0.4));
    parts.push(makeBox(11.0, 4.5, 14, 0, -19.5, side * 24, M1A2_GUN_STEEL, 0.4));
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 20. `m1a2_ammo_bustle` (`magazine`)
 * Honeycombed rear bustle 36-round storage rack loaded with gleaming 120mm M829A4 APFSDS rounds
 * (leaving the ready extraction slot open at Z = -14, Y = 0 for `m1a2_ready_round`!).
 * AssembledPos: [-168, +44, 0]. Local Box: X ∈ [-58, +58], Y ∈ [-21, +21], Z ∈ [-116, +116].
 */
export function buildM1a2AmmoBustleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Rear & side honeycomb armored rack framework
  parts.push(makeBox(10, 42, 232, -52, 0, 0, M1A2_DARK_ARMOR, 0.6));
  parts.push(makeBox(108, 4.0, 232, 0, -19, 0, M1A2_DARK_ARMOR, 0.5));
  parts.push(makeBox(108, 4.0, 232, 0, 19, 0, M1A2_DARK_ARMOR, 0.5));
  parts.push(makeBox(108, 42, 6, 0, 0, -113, M1A2_DARK_ARMOR, 0.5));
  parts.push(makeBox(108, 42, 6, 0, 0, 113, M1A2_DARK_ARMOR, 0.5));
  // Front honeycomb retention plate frame bars
  parts.push(makeBox(6, 4.5, 230, 46, 0, 0, M1A2_GUN_STEEL, 0.4));

  // Two tiers × 11 columns of gleaming 120mm M829A4 APFSDS unitary rounds (skipping ready-round slot)
  const zSlots = [-98, -78, -58, -38, -14, 14, 38, 58, 78, 98];
  const ySlots = [-9.5, 9.5];
  for (const ry of ySlots) {
    for (const rz of zSlots) {
      // Leave slot closest to `m1a2_ready_round` open (rz = -14, ry = +9.5)
      if (rz === -14 && ry > 0) continue;
      // Simplified tubular honeycomb cell collar + full 120mm unitary round
      parts.push(makeCylX(8.4, 8.4, 24, 34, ry, rz, M1A2_GUN_STEEL, 14, 0.2));
      parts.push(...buildOne120mmRound(4, ry, rz));
    }
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 21. `m1a2_ready_round` (`magazine`)
 * Animated individual 120mm M829A4 APFSDS unitary round extracted forward through the open
 * blast door and rammed cleanly into the M256 breech!
 * AssembledPos: [-150, +44, -14]. Local Box: X ∈ [-49, +49], Y ∈ [-8.4, +8.4], Z ∈ [-8.4, +8.4].
 */
export function buildM1a2ReadyRoundGeometry(): THREE.BufferGeometry {
  return sanitizeM1a2Mesh(mergeParts(buildOne120mmRound(0, 0, 0), Math.PI / 5));
}

/**
 * 22. `m1a2_stub_deflector` (`slide`)
 * Heavy steel breech recoil guard & metallic spent stub-case deflector basket/chute.
 * AssembledPos: [-16, +42, 0]. Local Box: X ∈ [-30, +30], Y ∈ [-22, +14], Z ∈ [-20, +20].
 */
export function buildM1a2StubDeflectorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Left & right armored breech safety recoil guard rails
  for (const side of [-1, 1]) {
    parts.push(makeBox(58, 22, 3.2, 0, -2, side * 18.2, M1A2_GUN_STEEL, 0.4));
    parts.push(makeBox(58, 3.5, 5.0, 0, 11.5, side * 17.5, M1A2_CHROME_STEEL, 0.4));
  }
  // Curved lower metallic stub-base deflector chute floor & rear catch basket
  parts.push(makeBox(54, 3.5, 34, -2, -16, 0, M1A2_CHROME_STEEL, 0.5));
  parts.push(makeBox(14, 14, 34, -23, -15, 0, M1A2_DARK_ARMOR, 0.5));
  // Slatted brass-catcher crossbars
  for (let x = -18; x <= 22; x += 10) {
    parts.push(makeBox(2.8, 3.0, 36, x, -19.5, 0, M1A2_GUN_STEEL, 0.3));
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 23. `m1a2_agt1500_turbine` (`fire_control`)
 * THE ENGINE SHOWPIECE: Honeywell AGT1500 1,500 SHP Multi-Fuel Gas Turbine with sculpted
 * multi-stage gleaming titanium axial compressor blades & warm copper-bronze annular recuperator!
 * AssembledPos: [-212, -24, 0]. Local Box: X ∈ [-78, +72], Y ∈ [-34, +34], Z ∈ [-64, +64].
 */
export function buildM1a2Agt1500TurbineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // 1. Forward intake plenum & titanium low/high-pressure axial compressor spool (X ∈ [+12, +70])
  parts.push(makeCylX(24, 26, 22, 58, 2, 0, M1A2_DARK_ARMOR, 24, 0.6));
  // Central gleaming titanium rotor shaft
  parts.push(makeCylX(7.5, 7.5, 136, -6, 2, 0, M1A2_TITANIUM, 20, 0.3));
  // 5-stage multi-blade gleaming titanium axial compressor wheels (visible directly in cutaway!)
  for (let st = 0; st < 5; st++) {
    const sx = 46 - st * 10.5;
    const rad = 22.5 - st * 1.1;
    parts.push(makeCylX(rad * 0.52, rad * 0.52, 4.6, sx, 2, 0, M1A2_TITANIUM, 18, 0.25));
    for (let b = 0; b < 12; b++) {
      const a = (b / 12) * Math.PI * 2 + st * 0.22;
      const blade = createChamferedBox(4.0, rad * 0.55, 1.4, 0.15, M1A2_TITANIUM);
      blade.rotateY(0.32);
      blade.rotateX(a);
      blade.translate(sx, 2 + Math.cos(a) * rad * 0.72, Math.sin(a) * rad * 0.72);
      parts.push(blade);
    }
  }
  // Upper-left compressor stator half-shroud (leaving +Z cutaway flank wide open!)
  parts.push(makeBox(54, 14, 24, 24, 20, -16, M1A2_GUN_STEEL, 0.8));

  // 2. Central tangential single-can combustor & fuel nozzle ring (X ∈ [-20, +6])
  parts.push(makeCylX(18, 18, 26, -8, 16, -24, M1A2_CHROME_STEEL, 20, 0.5));
  parts.push(makeCylX(22, 22, 34, -10, 2, 0, M1A2_GUN_STEEL, 22, 0.5));

  // 3. ICONIC WARM COPPER-BRONZE ANNULAR CYLINDRICAL RECUPERATOR HEAT-EXCHANGER (X ∈ [-76, -24])
  parts.push(makeCylX(31.5, 31.5, 50, -50, 0, 0, M1A2_COPPER_RECUP, 28, 0.8));
  // Pleated copper-bronze annular heat-exchanger cooling rings
  for (let rx = -72; rx <= -28; rx += 7.2) {
    parts.push(makeCylX(33.2, 33.2, 2.4, rx, 0, 0, M1A2_AMMO_BRASS, 24, 0.2));
  }
  // Twin side air-filter / oil-cooler accessory housings (Z ∈ [-64, +64])
  for (const side of [-1, 1]) {
    parts.push(makeBox(118, 30, 18, -6, -8, side * 54, M1A2_DARK_ARMOR, 1.0));
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 24. `m1a2_x1100_transmission` (`fire_control`)
 * Allison X1100-3B hydro-kinetic cross-drive transmission coupled to AGT1500 rear & final drives.
 * AssembledPos: [-330, -28, 0]. Local Box: X ∈ [-42, +36], Y ∈ [-28, +28], Z ∈ [-98, +98].
 */
export function buildM1a2X1100TransmissionGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Central hydro-kinetic torque converter & planetary gearbox casing
  parts.push(makeBox(74, 52, 118, -3, 0, 0, M1A2_GUN_STEEL, 1.5));
  // Heavy finned transmission oil cooler top housing
  parts.push(makeBox(62, 10, 106, -3, 22, 0, M1A2_DARK_ARMOR, 0.8));
  // Left & right regenerative steering brake housings & final-drive output shafts
  for (const side of [-1, 1]) {
    parts.push(makeCylZ(22, 24, 38, -2, -2, side * 76, M1A2_CHROME_STEEL, 20, 0.8));
    parts.push(makeCylZ(12, 12, 14, -2, -2, side * 91, M1A2_DARK_ARMOR, 16, 0.4));
  }
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 25. `m1a2_fuel_cells` (`frame`)
 * Armored forward hull twin JP-8 turbine fuel tanks flanking the reclined driver's compartment.
 * AssembledPos: [+205, -28, 0]. Local Box: X ∈ [-62, +68], Y ∈ [-28, +24], Z ∈ [-104, +104].
 */
export function buildM1a2FuelCellsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    // Tapered armored JP-8 fuel cell tank flanking driver corridor
    parts.push(makeBox(126, 48, 56, 3, -2, side * 74, M1A2_CARC_TAN_DARK, 1.5));
    // Stainless filler neck & pressure relief valve atop each fuel cell
    parts.push(makeCylY(6.5, 7.0, 7.0, -24, 20.5, side * 74, M1A2_CHROME_STEEL, 14, 0.3));
    parts.push(makeBox(36, 4.0, 26, 18, 21.5, side * 74, M1A2_DARK_ARMOR, 0.4));
  }
  // Armored cross-feed JP-8 transfer manifold pipe under driver floor
  parts.push(makeCylZ(4.2, 4.2, 152, -46, -22, 0, M1A2_COPPER_RECUP, 12, 0.2));
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}

/**
 * 26. `m1a2_crew_stations` (`fire_control`)
 * Reclined front driver's couch + steering T-bar & SEP v3 commander/gunner dual tactical LCD
 * battle-management consoles, turret floor basket & loader's standing platform!
 * AssembledPos: [+95, -20, 0]. Local Box: X ∈ [-135, +155], Y ∈ [-42, +68], Z ∈ [-86, +86].
 */
export function buildM1a2CrewStationsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // 1. Forward reclined driver's contoured seat couch & motorcycle-style T-bar yoke (X ∈ [+55, +155])
  parts.push(makeBox(68, 8, 44, 108, -36, 0, M1A2_DARK_ARMOR, 0.8));
  const backRest = createChamferedBox(52, 8, 42, 0.8, M1A2_RUBBER_TRACK);
  backRest.rotateZ(0.46);
  backRest.translate(72, -24, 0);
  parts.push(backRest);
  // Driver T-bar steering yoke & digital gauge cluster
  parts.push(makeBox(10, 14, 34, 146, -16, 0, M1A2_DARK_ARMOR, 0.6));
  parts.push(makeBox(4, 10, 26, 140, -16, 0, M1A2_LCD_CYAN, 0.3));

  // 2. Turret basket floor deck & structural hanger struts (X ∈ [-134, +12])
  parts.push(makeCylY(84, 84, 5.5, -52, -39, 0, M1A2_DARK_ARMOR, 24, 0.5));
  for (const a of [0.4, 2.5, -0.5, -2.5]) {
    parts.push(
      makeCylY(2.6, 2.6, 52, -52 + Math.cos(a) * 76, -12, Math.sin(a) * 76, M1A2_GUN_STEEL, 10, 0.2)
    );
  }

  // 3. Gunner's seat & SEP v3 Dual Tactical LCD Battle-Management Consoles (right side Z = +48)
  parts.push(makeBox(36, 8, 34, -46, -18, 48, M1A2_RUBBER_TRACK, 0.6));
  parts.push(makeBox(8, 34, 32, -64, 0, 48, M1A2_RUBBER_TRACK, 0.6));
  parts.push(makeBox(16, 20, 28, -6, 14, 54, M1A2_DARK_ARMOR, 0.6));
  parts.push(makeBox(3, 14, 22, -15, 14, 54, M1A2_LCD_CYAN, 0.2));

  // 4. Commander's elevated seat & FBCB2/BFT tactical LCD battle display (rear-right Z = +50)
  parts.push(makeBox(34, 8, 34, -96, 12, 48, M1A2_RUBBER_TRACK, 0.6));
  parts.push(makeBox(8, 34, 32, -112, 30, 48, M1A2_RUBBER_TRACK, 0.6));
  parts.push(makeBox(14, 18, 26, -68, 48, 52, M1A2_DARK_ARMOR, 0.6));
  parts.push(makeBox(3, 13, 21, -76, 48, 52, M1A2_LCD_CYAN, 0.2));

  // 5. Loader's left-side jump seat & knee-switch pedestal (Z = -52)
  parts.push(makeBox(32, 7, 30, -86, -8, -54, M1A2_RUBBER_TRACK, 0.6));
  parts.push(makeBox(12, 16, 12, -116, 24, -52, M1A2_HAZARD_YELLOW, 0.5));
  return sanitizeM1a2Mesh(mergeParts(parts, Math.PI / 5));
}
