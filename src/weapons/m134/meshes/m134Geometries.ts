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
// GE / Dillon Aero M134D Minigun (7.62×51mm NATO) Shared Metrology Constants
// Coordinate system: 1 world unit = 1 cm, +X muzzle, +Y up, +Z right flank.
// ============================================================================

/** Coaxial pitch circle radius of all 6 rotary barrels & 6 bolts around (Y=0, Z=0). */
export const M134_PITCH_RADIUS = 2.65;

/** Axial forward-most locked position of bolt body at 12 o'clock (θ = 0°). */
export const M134_BOLT_X_FWD = -6.8;

/** Full sinusoidal axial bolt stroke along the 360° elliptical cam track (46.0 mm). */
export const M134_BOLT_STROKE = 4.6;

/** Axial midpoint of the 6-bolt sinusoidal wave (X = -9.10 cm). */
export const M134_BOLT_X_MID = M134_BOLT_X_FWD - M134_BOLT_STROKE * 0.5;

/** Cam roller stud local X offset on each bolt -> world cam wave center X = -9.90 cm. */
export const M134_CAM_CENTER_X = -9.9;

// Physically calibrated ordnance palette (all linear luminance >> 0.018 Khronos floor)
export const M134_PARKERIZED_STEEL = '#525964';
export const M134_CAST_HOUSING = '#4c535e';
export const M134_FLANGE_STEEL = '#5b6370';
export const M134_BARREL_STEEL = '#4b525e';
export const M134_HEAT_BRONZE = '#7a634c';
export const M134_ROTOR_CNC = '#8d96a3';
export const M134_CHROME_BOLT = '#cbd5e1';
export const M134_STAINLESS = '#b8c3d0';
export const M134_MOTOR_ENAMEL = '#454e5a';
export const M134_COPPER_WINDING = '#c6733b';
export const M134_BRASS_762 = '#d4a647';
export const M134_COPPER_FMJ = '#c87240';
export const M134_M13_LINK = '#3f454f';
export const M134_RUBBER_GRIP = '#3d424b';
export const M134_SPRING_STEEL = '#94a3b8';
export const M134_SAFETY_YELLOW = '#eab308';
export const M134_MASTER_RED = '#dc2626';
export const M134_STENCIL_WHITE = '#e2e8f0';

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
export function sanitizeM134Mesh(
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

function cylX(
  rTop: number,
  rBot: number,
  length: number,
  xCenter: number,
  yCenter: number,
  zCenter: number,
  color: string,
  segs = 24,
  bevel = 0.025
): THREE.BufferGeometry {
  const g = createBeveledCylinder(rTop, rBot, length, bevel, segs, color);
  g.rotateZ(-Math.PI / 2);
  g.translate(xCenter, yCenter, zCenter);
  return g;
}

function cylY(
  rTop: number,
  rBot: number,
  length: number,
  xCenter: number,
  yCenter: number,
  zCenter: number,
  color: string,
  segs = 20,
  bevel = 0.02
): THREE.BufferGeometry {
  const g = createBeveledCylinder(rTop, rBot, length, bevel, segs, color);
  g.translate(xCenter, yCenter, zCenter);
  return g;
}

function cylZ(
  rTop: number,
  rBot: number,
  length: number,
  xCenter: number,
  yCenter: number,
  zCenter: number,
  color: string,
  segs = 20,
  bevel = 0.02
): THREE.BufferGeometry {
  const g = createBeveledCylinder(rTop, rBot, length, bevel, segs, color);
  g.rotateX(Math.PI / 2);
  g.translate(xCenter, yCenter, zCenter);
  return g;
}

function boxAt(
  sx: number,
  sy: number,
  sz: number,
  cx: number,
  cy: number,
  cz: number,
  color: string,
  chamfer = 0.04
): THREE.BufferGeometry {
  const g = createChamferedBox(sx, sy, sz, chamfer, color);
  g.translate(cx, cy, cz);
  return g;
}

/** Watertight hollow tube along +X from x0 to x1 with outer/inner radii. */
function hollowTubeX(
  rOut: number,
  rIn: number,
  x0: number,
  x1: number,
  segs: number,
  color: string
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const depth = x1 - x0;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: segs,
    bevelEnabled: false,
    steps: 1,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(x0, 0, 0);
  return paintGeometry(geo, color);
}

/** Builds a watertight 360° hollow cam ring along X with a genuinely sculpted sinusoidal inner groove! */
function buildSinusoidalCamRingMesh(
  xMin: number,
  xMax: number,
  rIn: number,
  rGroove: number,
  rOut: number,
  ampX: number,
  grooveHalfW: number,
  segs: number
): THREE.BufferGeometry {
  const tris: number[] = [];
  const pushQuad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number]
  ) => {
    tris.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    tris.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  };

  // Closed cross-section profile per angle θ:
  // 0: (xMin, rOut) -> 1: (xMax, rOut) -> 2: (xMax, rIn) -> 3: (xG1, rIn)
  // -> 4: (xG1, rGroove) -> 5: (xG0, rGroove) -> 6: (xG0, rIn) -> 7: (xMin, rIn)
  const rings: Array<Array<[number, number, number]>> = [];
  for (let s = 0; s <= segs; s++) {
    const th = ((s % segs) / segs) * Math.PI * 2;
    const cy = Math.cos(th);
    const sz = Math.sin(th);
    const xCam = ampX * cy;
    const xG0 = xCam - grooveHalfW;
    const xG1 = xCam + grooveHalfW;
    const prof: Array<[number, number]> = [
      [xMin, rOut],
      [xMax, rOut],
      [xMax, rIn],
      [xG1, rIn],
      [xG1, rGroove],
      [xG0, rGroove],
      [xG0, rIn],
      [xMin, rIn],
    ];
    rings.push(prof.map(([px, pr]) => [px, pr * cy, pr * sz]));
  }

  const nP = 8;
  for (let s = 0; s < segs; s++) {
    const r0 = rings[s];
    const r1 = rings[s + 1];
    for (let k = 0; k < nP; k++) {
      const kn = (k + 1) % nP;
      pushQuad(r0[k], r0[kn], r1[kn], r1[k]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return paintGeometry(geo, M134_STAINLESS);
}

// ============================================================================
// 1. SUITE 1 — HOUSING, CAM TRACK, 28V MOTOR, GEARBOX, SPADE GRIP, HANDLE, PINTLE
// ============================================================================

/** `m134_main_housing` (assembledPos = [-6.5, 0, 0], world X in [-15.6, +2.6]) */
export function buildM134MainHousingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Main cylindrical ribbed housing shell (hollow inner bore r = 4.88, outer r = 5.82)
  parts.push(hollowTubeX(5.82, 4.88, -8.5, 8.5, 36, M134_CAST_HOUSING));

  // Heavy bolted front & rear mounting flanges (r = 6.62)
  parts.push(hollowTubeX(6.62, 4.88, 7.9, 9.1, 36, M134_FLANGE_STEEL));
  parts.push(hollowTubeX(6.62, 4.88, -9.1, -7.9, 36, M134_FLANGE_STEEL));

  // 8 external longitudinal structural stiffening ribs
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4 + Math.PI / 8;
    const rib = createChamferedBox(16.2, 0.72, 0.62, 0.05, M134_PARKERIZED_STEEL);
    rib.translate(0, 5.92, 0);
    rib.rotateX(ang);
    parts.push(rib);
  }

  // Right (+Z) & Forward-Left (-Z, clear of delinker housing!) flat machined nomenclature stencil plates
  parts.push(boxAt(13.0, 4.1, 0.56, 0.0, 0.75, 5.82, M134_CAST_HOUSING, 0.05));
  parts.push(boxAt(5.4, 3.6, 0.56, 4.9, 0.80, -5.82, M134_CAST_HOUSING, 0.05));

  // Top motor mounting cradle saddles & safing-sector frame boss
  parts.push(boxAt(3.0, 1.4, 4.8, -5.8, 6.0, 0, M134_FLANGE_STEEL, 0.05));
  parts.push(boxAt(2.8, 1.4, 4.8, 0.2, 6.0, 0, M134_FLANGE_STEEL, 0.05));
  parts.push(boxAt(5.0, 1.1, 4.8, 5.9, 5.85, 0, M134_PARKERIZED_STEEL, 0.05));

  // Bottom pintle mounting lug pad
  parts.push(boxAt(9.6, 1.3, 4.6, 0.0, -5.9, 0, M134_FLANGE_STEEL, 0.05));

  // 8 front & 8 rear stainless hex flange bolts
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4;
    const by = 6.2 * Math.cos(ang);
    const bz = 6.2 * Math.sin(ang);
    parts.push(cylX(0.32, 0.32, 0.5, 9.05, by, bz, M134_STAINLESS, 6, 0.02));
    parts.push(cylX(0.32, 0.32, 0.5, -9.05, by, bz, M134_STAINLESS, 6, 0.02));
  }

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_cam_track_ring` (assembledPos = [-9.9, 0, 0], world X in [-14.0, -5.8]) */
export function buildM134CamTrackRingGeometry(): THREE.BufferGeometry {
  const camRing = buildSinusoidalCamRingMesh(
    -4.1,
    4.1,
    3.88,
    4.54,
    4.82,
    M134_BOLT_STROKE * 0.5,
    0.54,
    48
  );
  // Keyway alignment tab at top outer rim
  const key = boxAt(7.6, 0.32, 0.65, 0, 4.72, 0, M134_PARKERIZED_STEEL, 0.03);
  return sanitizeM134Mesh(mergeParts([camRing, key]));
}

/** `m134_drive_motor` (assembledPos = [-9.5, 9.3, 0], world X in [-18.8, -3.3]) */
export function buildM134DriveMotorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Hollow cylindrical motor stator casing (exposing recessed -Z copper windings cleanly in CT cutaway!)
  parts.push(hollowTubeX(3.05, 2.42, -5.9, 5.7, 32, M134_MOTOR_ENAMEL));
  // Thin hollow front & rear end-bells (0.55 cm wall so cutaway interior stays wide open!)
  parts.push(hollowTubeX(3.12, 0.85, 5.35, 6.2, 28, M134_FLANGE_STEEL));
  parts.push(hollowTubeX(3.12, 0.85, -6.2, -5.35, 28, M134_FLANGE_STEEL));

  // 10 circumferential aerospace cooling fins
  for (let i = 0; i < 10; i++) {
    const fx = -4.6 + i * 1.0;
    parts.push(hollowTubeX(3.22, 2.95, fx - 0.16, fx + 0.16, 28, M134_MOTOR_ENAMEL));
  }

  // Internal warm enameled copper armature windings & golden commutator strictly recessed at Z <= -0.22
  // so Z=0 StencilSectionCap NEVER paints blue-grey hatch over the glowing copper armature!
  parts.push(boxAt(8.6, 2.4, 0.9, -0.2, 0, -0.95, M134_ROTOR_CNC, 0.08));
  for (let i = 0; i < 5; i++) {
    const ang = ((210 + i * 30) * Math.PI) / 180;
    const cy = 1.72 * Math.cos(ang);
    const cz = Math.min(-0.62, 1.72 * Math.sin(ang));
    parts.push(boxAt(7.2, 0.66, 0.66, -0.15, cy, cz, M134_COPPER_WINDING, 0.08));
  }
  // Golden brass commutator block recessed at Z <= -0.24
  parts.push(boxAt(1.5, 2.6, 1.15, 4.15, 0, -0.95, M134_BRASS_762, 0.08));

  // Rear motor pinion shaft + pinion gear coupling into gearbox at local X = -8.9 (world X = -18.4)
  parts.push(cylX(0.75, 0.75, 3.4, -7.6, 0, 0, M134_STAINLESS, 18, 0.02));
  parts.push(cylX(1.62, 1.62, 1.4, -8.6, 0, 0, M134_CHROME_BOLT, 16, 0.03));

  // Side flat brushed aluminum nameplate bosses (+Z & -Z)
  parts.push(boxAt(6.6, 2.1, 0.36, 0.2, 0.1, 3.04, M134_STAINLESS, 0.03));
  parts.push(boxAt(6.6, 2.1, 0.36, 0.2, 0.1, -3.04, M134_STAINLESS, 0.03));

  // Rear top Mil-Spec 28V power connector plug
  parts.push(cylY(0.72, 0.8, 1.2, -4.4, 3.35, 0, M134_FLANGE_STEEL, 16, 0.03));
  parts.push(boxAt(1.6, 0.9, 1.6, -4.4, 2.85, 0, M134_PARKERIZED_STEEL, 0.04));

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_gear_housing` (assembledPos = [-18.8, 2.2, 0], world X in [-22.0, -15.6]) */
export function buildM134GearHousingGeometry(): THREE.BufferGeometry {
  // Hollow pear-shaped reduction gearbox shell (~0.55 cm cast wall) around drive gear, clutch spring & pinion!
  const outerParts: THREE.BufferGeometry[] = [
    cylX(6.3, 6.3, 6.4, 0, -2.2, 0, M134_CAST_HOUSING, 32, 0.08),
    boxAt(6.0, 8.8, 7.6, 0, 2.3, 0, M134_CAST_HOUSING, 0.12),
    cylX(3.35, 3.35, 6.2, 0, 6.9, 0, M134_FLANGE_STEEL, 28, 0.06),
    boxAt(1.1, 9.2, 8.4, -2.8, -1.6, 0, M134_FLANGE_STEEL, 0.08),
    boxAt(1.0, 12.2, 11.4, 2.7, -0.5, 0, M134_FLANGE_STEEL, 0.08),
  ];
  const combinedOuter = mergeParts(outerParts);
  const cavities: THREE.BufferGeometry[] = [
    cylX(5.62, 5.62, 5.3, 0.7, -2.2, 0, M134_CAST_HOUSING, 28, 0.0),
    boxAt(5.1, 9.8, 5.6, 0.65, 2.4, 0, M134_CAST_HOUSING, 0.0),
    cylX(2.68, 2.68, 5.3, 0.7, 6.9, 0, M134_CAST_HOUSING, 24, 0.0),
  ];
  const hollowed = csgSubtract(combinedOuter, cavities);
  combinedOuter.dispose();
  for (const c of cavities) c.dispose();
  return sanitizeM134Mesh(hollowed);
}

/** `m134_spade_grip` (assembledPos = [-25.8, 0.2, 0], world X in [-30.0, -22.0]) */
export function buildM134SpadeGripGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Heavy rear buffer mounting plate bolted to gearbox at local X = +3.8 (world X = -22.0)
  parts.push(boxAt(1.4, 7.2, 7.8, 3.1, 0, 0, M134_PARKERIZED_STEEL, 0.08));

  // Twin upper & lower horizontal arm yokes flaring to Z = ±6.2
  for (const s of [-1, 1]) {
    parts.push(boxAt(5.6, 1.35, 1.45, 0.2, 3.2, s * 3.8, M134_PARKERIZED_STEEL, 0.06));
    parts.push(boxAt(5.2, 1.35, 1.45, 0.3, -4.1, s * 3.8, M134_PARKERIZED_STEEL, 0.06));
    // Vertical textured hand grips (Z = ±6.2, Y in [-5.2, +4.2])
    parts.push(cylY(1.08, 1.12, 9.2, -2.3, -0.5, s * 6.2, M134_RUBBER_GRIP, 20, 0.08));
    // Upper & lower steel grip caps
    parts.push(cylY(1.22, 1.22, 0.65, -2.3, 4.15, s * 6.2, M134_FLANGE_STEEL, 18, 0.04));
    parts.push(cylY(1.22, 1.22, 0.65, -2.3, -5.15, s * 6.2, M134_FLANGE_STEEL, 18, 0.04));
    // Twin aluminum butterfly thumb fire paddles
    parts.push(boxAt(1.2, 2.2, 2.5, -2.9, 2.1, s * 3.2, M134_STAINLESS, 0.05));
  }

  // Central trigger control box & safety guard bridge
  parts.push(boxAt(3.4, 3.8, 4.6, -1.6, 2.3, 0, M134_CAST_HOUSING, 0.08));
  // Protective top thumb-guard hoop
  parts.push(boxAt(1.4, 0.55, 6.2, -3.5, 4.2, 0, M134_FLANGE_STEEL, 0.04));
  // Vivid Crimson Master Arm Toggle Switch & Guard!
  parts.push(boxAt(1.1, 1.5, 1.1, -3.55, 2.6, 0, M134_MASTER_RED, 0.05));
  parts.push(cylX(0.28, 0.34, 1.1, -3.85, 2.75, 0, M134_MASTER_RED, 12, 0.02));

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_carry_handle` (assembledPos = [3.2, 7.6, 0], world X in [+1.6, +14.4], Y in [+5.2, +14.2]) */
export function buildM134CarryHandleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Rear clamp collar base mounting onto front housing flange (world X = +2.2)
  parts.push(boxAt(2.2, 2.4, 7.2, -0.5, -1.3, 0, M134_FLANGE_STEEL, 0.06));
  // Left & right angled vertical steel uprights
  for (const s of [-1, 1]) {
    const strutRear = createChamferedBox(1.4, 6.6, 0.85, 0.06, M134_PARKERIZED_STEEL);
    strutRear.rotateZ(-0.26);
    strutRear.translate(0.5, 2.2, s * 3.2);
    parts.push(strutRear);

    const strutFront = createChamferedBox(1.3, 5.2, 0.85, 0.06, M134_PARKERIZED_STEEL);
    strutFront.rotateZ(0.24);
    strutFront.translate(9.6, 2.6, s * 3.2);
    parts.push(strutFront);

    // Longitudinal top side-rails connecting rear & front struts
    parts.push(boxAt(9.8, 0.95, 0.85, 5.0, 5.3, s * 3.2, M134_PARKERIZED_STEEL, 0.06));
  }
  // Forward cross-brace
  parts.push(boxAt(1.8, 1.1, 7.2, 10.2, 0.4, 0, M134_FLANGE_STEEL, 0.06));
  // Heavy knurled cylindrical chainsaw grip crossbar at top
  parts.push(cylZ(1.05, 1.05, 8.2, 5.2, 5.55, 0, M134_RUBBER_GRIP, 20, 0.08));

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_mount_pintle` (assembledPos = [-6.5, -8.8, 0], world X in [-11.7, -1.3], Y in [-14.2, -5.4]) */
export function buildM134MountPintleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Upper twin saddle cheeks embracing underside of main housing
  parts.push(boxAt(10.0, 1.4, 6.8, 0, 2.6, 0, M134_CAST_HOUSING, 0.08));
  for (const s of [-1, 1]) {
    parts.push(boxAt(8.8, 3.6, 1.2, 0, 0.8, s * 2.8, M134_PARKERIZED_STEEL, 0.06));
  }
  // Heavy machined recoil absorber cross-yoke
  parts.push(boxAt(6.4, 2.6, 5.8, 0, -0.7, 0, M134_FLANGE_STEEL, 0.08));
  // Helicopter/vehicular vertical cylindrical pintle post & bronze bushing ring
  parts.push(cylY(1.68, 1.56, 4.8, 0, -3.0, 0, M134_PARKERIZED_STEEL, 24, 0.06));
  parts.push(cylY(1.92, 1.92, 0.95, 0, -1.8, 0, M134_HEAT_BRONZE, 24, 0.04));
  // Quick-release T-lock pin
  parts.push(cylZ(0.52, 0.52, 7.8, 2.8, 0.6, 0, M134_STAINLESS, 14, 0.03));

  return sanitizeM134Mesh(mergeParts(parts));
}

// ============================================================================
// 2. SUITE 2 — 6-BARREL CLUSTER, BARREL CLAMP, FLASH SUPPRESSOR, STAR-ROTOR, DRIVE GEAR, SAFING SECTOR
// ============================================================================

/** `m134_barrel_cluster` (assembledPos = [0, 0, 0], world X in [-4.6, +48.4]) */
export function buildM134BarrelClusterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < 6; i++) {
    const th = (i * Math.PI) / 3;
    const by = M134_PITCH_RADIUS * Math.cos(th);
    const bz = M134_PITCH_RADIUS * Math.sin(th);

    // Breech locking collar (-4.6 .. +3.2)
    const breech = hollowTubeX(1.02, 0.39, -4.6, 3.2, 18, M134_BARREL_STEEL);
    breech.translate(0, by, bz);
    parts.push(breech);

    // Tapered chamber reinforcement step (+3.2 .. +9.0)
    const chamber = hollowTubeX(0.94, 0.39, 3.2, 9.0, 18, M134_BARREL_STEEL);
    chamber.translate(0, by, bz);
    parts.push(chamber);

    // Main 22-inch fluted ordnance barrel tube (+9.0 .. +45.6)
    const tube = hollowTubeX(0.84, 0.38, 9.0, 45.6, 18, M134_BARREL_STEEL);
    tube.translate(0, by, bz);
    parts.push(tube);

    // Muzzle heat-tempered tip (+45.6 .. +48.4)
    const tip = hollowTubeX(0.80, 0.38, 45.6, 48.4, 18, M134_HEAT_BRONZE);
    tip.translate(0, by, bz);
    parts.push(tip);
  }

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_barrel_clamp` (assembledPos = [28.0, 0, 0], world X in [+20.5, +38.5]) */
export function buildM134BarrelClampGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Twin ventilated circular barrel stabilization discs (mid at local x=-6.4 -> +21.6, front at local x=+9.4 -> +37.4)
  for (const cx of [-6.4, 9.4]) {
    const disc = cylX(4.18, 4.18, 2.0, cx, 0, 0, M134_PARKERIZED_STEEL, 36, 0.06);
    const cutters: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const th = (i * Math.PI) / 3;
      const by = M134_PITCH_RADIUS * Math.cos(th);
      const bz = M134_PITCH_RADIUS * Math.sin(th);
      cutters.push(cylX(0.88, 0.88, 2.8, cx, by, bz, M134_PARKERIZED_STEEL, 16, 0));
      // 6 outer lightening holes between barrels
      const thM = th + Math.PI / 6;
      cutters.push(
        cylX(
          0.52,
          0.52,
          2.8,
          cx,
          3.35 * Math.cos(thM),
          3.35 * Math.sin(thM),
          M134_PARKERIZED_STEEL,
          12,
          0
        )
      );
    }
    const clamped = csgSubtract(disc, cutters);
    disc.dispose();
    for (const c of cutters) c.dispose();
    parts.push(clamped);

    // 6 perimeter stainless clamping hex bolts
    for (let i = 0; i < 6; i++) {
      const th = (i * Math.PI) / 3 + Math.PI / 6;
      parts.push(
        cylX(
          0.26,
          0.26,
          2.35,
          cx,
          2.05 * Math.cos(th),
          2.05 * Math.sin(th),
          M134_STAINLESS,
          6,
          0.02
        )
      );
    }
  }

  // Central hollow aerospace spider spine linking mid & front clamp discs into one rigid assembly
  parts.push(hollowTubeX(0.95, 0.55, -6.4, 9.4, 20, M134_FLANGE_STEEL));

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_flash_suppressor` (assembledPos = [47.2, 0, 0], world X in [+44.8, +50.2]) */
export function buildM134FlashSuppressorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Rear heavy clamp ring locking onto all 6 barrel muzzles (local x in [-2.4, -0.4])
  const rearRing = cylX(4.28, 4.22, 2.0, -1.4, 0, 0, M134_HEAT_BRONZE, 36, 0.06);
  const frontRing = hollowTubeX(4.32, 3.65, 2.0, 3.0, 36, M134_HEAT_BRONZE);
  const cutters: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const th = (i * Math.PI) / 3;
    const by = M134_PITCH_RADIUS * Math.cos(th);
    const bz = M134_PITCH_RADIUS * Math.sin(th);
    cutters.push(cylX(0.84, 0.84, 2.8, -1.4, by, bz, M134_HEAT_BRONZE, 16, 0));
  }
  const drilledRear = csgSubtract(rearRing, cutters);
  rearRing.dispose();
  for (const c of cutters) c.dispose();
  parts.push(drilledRear);
  parts.push(frontRing);

  // 6 individual hollow heat-tempered flash suppressor muzzle cones + outer stabilizing cage struts
  for (let i = 0; i < 6; i++) {
    const th = (i * Math.PI) / 3;
    const by = M134_PITCH_RADIUS * Math.cos(th);
    const bz = M134_PITCH_RADIUS * Math.sin(th);
    const cone = hollowTubeX(1.06, 0.66, -0.5, 2.95, 16, M134_HEAT_BRONZE);
    cone.translate(0, by, bz);
    parts.push(cone);

    const thS = th + Math.PI / 6;
    const strut = createChamferedBox(4.8, 0.42, 0.56, 0.03, M134_PARKERIZED_STEEL);
    strut.translate(0.3, 3.96, 0);
    strut.rotateX(thS);
    parts.push(strut);
  }

  // Central hub cap
  parts.push(cylX(1.12, 1.12, 5.2, 0.25, 0, 0, M134_PARKERIZED_STEEL, 18, 0.04));

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_rotor_assembly` (assembledPos = [-6.8, 0, 0], world X in [-18.6, +2.6]) */
export function buildM134RotorAssemblyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Rear splined drive shaft engaging `m134_drive_gear` (local x in [-11.8, -7.8])
  parts.push(cylX(1.32, 1.32, 4.2, -9.7, 0, 0, M134_STAINLESS, 24, 0.04));
  for (let i = 0; i < 8; i++) {
    const sp = createChamferedBox(3.4, 0.28, 0.26, 0.02, M134_CHROME_BOLT);
    sp.translate(-9.8, 1.36, 0);
    sp.rotateX((i * Math.PI) / 4);
    parts.push(sp);
  }

  // Central 6-flute CNC star-rotor core (local x in [-7.8, +2.2])
  parts.push(cylX(1.72, 1.72, 10.2, -2.8, 0, 0, M134_ROTOR_CNC, 28, 0.04));
  // 6 precision-milled radial star T-ribs between the 6 bolt channels (at 30°, 90°, 150°, 210°, 270°, 330°)
  for (let i = 0; i < 6; i++) {
    const th = (i + 0.5) * (Math.PI / 3);
    const fin = createChamferedBox(9.8, 1.88, 0.56, 0.04, M134_ROTOR_CNC);
    fin.translate(-2.8, 2.58, 0);
    fin.rotateX(th);
    parts.push(fin);
    // Outer T-flange bolt guide rail cap
    const cap = createChamferedBox(9.6, 0.36, 1.05, 0.03, M134_CHROME_BOLT);
    cap.translate(-2.8, 3.42, 0);
    cap.rotateX(th);
    parts.push(cap);
  }

  // Heavy front circular rotor head & 6 barrel-lock sockets (local x in [+2.2, +9.4])
  const head = cylX(3.92, 3.92, 7.0, 5.8, 0, 0, M134_ROTOR_CNC, 36, 0.06);
  const cutters: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const th = (i * Math.PI) / 3;
    const by = M134_PITCH_RADIUS * Math.cos(th);
    const bz = M134_PITCH_RADIUS * Math.sin(th);
    cutters.push(cylX(1.06, 1.06, 7.6, 5.8, by, bz, M134_ROTOR_CNC, 16, 0));
  }
  const drilledHead = csgSubtract(head, cutters);
  head.dispose();
  for (const c of cutters) c.dispose();
  parts.push(drilledHead);

  // Front bearing journal collar
  parts.push(hollowTubeX(4.16, 3.85, 7.4, 9.3, 32, M134_CHROME_BOLT));

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_drive_gear` (assembledPos = [-18.4, 0, 0], world X in [-19.6, -17.2]) */
export function buildM134DriveGearGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Central splined hub + webbed gear disc
  parts.push(hollowTubeX(2.1, 1.32, -1.15, 1.15, 24, M134_CHROME_BOLT));
  parts.push(hollowTubeX(4.92, 2.05, -0.68, 0.68, 36, M134_STAINLESS));
  parts.push(hollowTubeX(4.98, 4.15, -1.05, 1.05, 36, M134_CHROME_BOLT));

  // 28 precision-hobbed involute spur gear teeth around outer rim
  const toothCount = 28;
  for (let i = 0; i < toothCount; i++) {
    const th = (i / toothCount) * Math.PI * 2;
    const tooth = createChamferedBox(1.95, 0.62, 0.48, 0.03, M134_CHROME_BOLT);
    tooth.translate(0, 5.12, 0);
    tooth.rotateX(th);
    parts.push(tooth);
  }

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_safing_sector` (assembledPos = [-0.6, 6.15, 0], world X in [-3.1, +1.8]) */
export function buildM134SafingSectorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Curved-bottom hardened steel safing-sector gate block
  parts.push(boxAt(4.8, 1.15, 4.6, 0, 0, 0, M134_PARKERIZED_STEEL, 0.06));
  // High-contrast SAFE / ARMED ordnance hazard plate on top & right bevel
  parts.push(boxAt(4.0, 0.24, 3.6, 0, 0.65, 0, M134_SAFETY_YELLOW, 0.03));
  // Quick-release pull-bail latch & knurled red/steel detent plunger
  parts.push(boxAt(1.1, 0.45, 2.8, 1.7, 0.82, 0, M134_STAINLESS, 0.03));
  parts.push(cylY(0.42, 0.42, 0.55, -1.5, 0.78, 0, M134_MASTER_RED, 16, 0.03));

  return sanitizeM134Mesh(mergeParts(parts));
}

// ============================================================================
// 3. SUITE 3 — ALL 6 ROTARY BOLTS + DILLON DELINKER + AMMO CHUTE + EJECTION CHUTE
// ============================================================================

/**
 * Shared local geometry for `m134_bolt_1` .. `m134_bolt_6`:
 * - Local X in [-2.80, +2.20] (length 5.0 cm)
 * - Radial +Y points OUTWARD from rotor axis into `m134_cam_track_ring`!
 * - Cam roller stud sits at local `(-0.80, +1.48, 0)`, reaching `local y = +1.82` -> world `r = 2.65 + 1.82 = 4.47 cm`!
 */
export function buildM134RotaryBoltGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Main brushed-chrome cylindrical/T-slotted bolt body (local x in [-2.75, +1.25])
  parts.push(boxAt(3.9, 1.38, 1.24, -0.8, 0, 0, M134_CHROME_BOLT, 0.05));
  parts.push(cylX(0.74, 0.74, 3.8, -0.85, 0, 0, M134_CHROME_BOLT, 20, 0.03));

  // Forward rotating dual-lug locking bolt head (local x in [+1.05, +2.20])
  parts.push(cylX(0.76, 0.76, 1.15, 1.62, 0, 0, M134_STAINLESS, 20, 0.03));
  parts.push(boxAt(0.68, 0.44, 1.44, 1.75, 0, 0, M134_STAINLESS, 0.03));
  // Spring-loaded extractor claw on side of bolt head
  parts.push(boxAt(1.35, 0.34, 0.28, 1.35, 0.48, 0.62, M134_PARKERIZED_STEEL, 0.02));

  // Coaxial firing-pin striker tail protruding slightly at rear (-2.80)
  parts.push(cylX(0.24, 0.24, 0.55, -2.55, 0, 0, M134_FLANGE_STEEL, 12, 0.02));

  // Iconic Radial Cam Follower Roller Stud pointing along local +Y into the 360° sinusoidal cam track!
  parts.push(cylY(0.32, 0.36, 0.68, -0.8, 0.92, 0, M134_ROTOR_CNC, 16, 0.02));
  parts.push(cylY(0.43, 0.43, 0.62, -0.8, 1.50, 0, M134_CHROME_BOLT, 20, 0.03));

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_delinker_housing` (assembledPos = [-9.2, -1.6, -8.2], left `-Z` flank!) */
export function buildM134DelinkerHousingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Hollow cast-alloy / stainless delinker gearbox shell enclosing `m134_delinker_sprocket`
  const outer = boxAt(9.2, 7.6, 5.8, -0.1, 0.2, -0.1, M134_CAST_HOUSING, 0.12);
  const inner = boxAt(7.6, 5.6, 4.4, 0.0, 0.1, 0.5, M134_CAST_HOUSING, 0.0);
  const shell = csgSubtract(outer, [inner]);
  outer.dispose();
  inner.dispose();
  parts.push(shell);

  // Curved intake throat flange mating with `m134_ammo_chute` at bottom
  parts.push(boxAt(7.8, 1.6, 4.8, 0, -3.4, -0.6, M134_FLANGE_STEEL, 0.06));
  // Right-side (+Z) transfer collar mating flush with `m134_main_housing`
  parts.push(boxAt(7.4, 5.4, 1.2, 0, 0.4, 2.4, M134_STAINLESS, 0.05));
  // Left-side (-Z) flat laser-etched Dillon Aero faceplate + 2 quick-release cam latches
  parts.push(boxAt(7.8, 5.6, 0.38, -0.1, 0.3, -3.02, M134_FLANGE_STEEL, 0.04));
  for (const lx of [-3.4, 3.2]) {
    parts.push(boxAt(0.75, 2.2, 0.65, lx, 2.2, -2.95, M134_STAINLESS, 0.03));
  }

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_delinker_sprocket` (assembledPos = [-9.2, -1.4, -7.8]) */
export function buildM134DelinkerSprocketGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Central hardened drive axle shaft
  parts.push(cylX(0.95, 0.95, 7.6, 0, 0, 0, M134_CHROME_BOLT, 20, 0.03));
  // 6-lobe star-wheel belt-stripping rotor fingers
  for (let i = 0; i < 6; i++) {
    const th = (i * Math.PI) / 3;
    const lobe = createChamferedBox(5.6, 1.35, 0.58, 0.04, M134_STAINLESS);
    lobe.translate(0, 1.48, 0);
    lobe.rotateX(th);
    parts.push(lobe);
  }
  // Rear feeder drive spur gear meshing with main housing drive
  parts.push(cylX(1.95, 1.95, 0.9, -3.15, 0, 0, M134_ROTOR_CNC, 22, 0.03));

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_ammo_chute` (assembledPos = [-9.2, -9.2, -10.8], flexible ribbed chute + 8 × 7.62×51mm NATO rounds!) */
export function buildM134AmmoChuteGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Upper quick-lock chute adapter flange mating to delinker intake
  parts.push(boxAt(8.2, 1.3, 4.2, 0, 3.85, 1.1, M134_STAINLESS, 0.05));

  // 8 flexible articulated stainless chute rib segments curving downward & left (-Y, -Z)
  for (let i = 0; i < 8; i++) {
    const u = i / 7;
    const cy = 2.8 - u * 8.1;
    const cz = 0.9 - u * 3.8 - Math.sin(u * Math.PI) * 0.45;
    const rotX = -0.35 - u * 0.18;

    // Open-windowed ribbed stainless chute saddle so gleaming 7.62mm brass belt is dramatically visible!
    const segFrame = createChamferedBox(7.8, 0.82, 2.2, 0.04, M134_STAINLESS);
    segFrame.rotateX(rotX);
    segFrame.translate(0, cy, cz + 0.55);
    parts.push(segFrame);

    // Individual gleaming 7.62×51mm NATO cartridge (71.1 mm OAL = 7.11 cm!):
    // C26000 Brass case (x in [-3.4, +1.7]) + Copper FMJ spitzer bullet (x in [+1.7, +3.7])
    const brassCase = cylX(0.56, 0.59, 5.1, -0.85, cy, cz - 0.55, M134_BRASS_762, 14, 0.02);
    parts.push(brassCase);
    const bullet = cylX(0.08, 0.39, 2.05, 2.68, cy, cz - 0.55, M134_COPPER_FMJ, 14, 0.01);
    parts.push(bullet);
    // Dark Parkerized M13 disintegrating steel belt link wrapping each cartridge waist
    const link = createChamferedBox(1.55, 0.88, 1.34, 0.03, M134_M13_LINK);
    link.translate(-0.7, cy, cz - 0.55);
    parts.push(link);
  }

  return sanitizeM134Mesh(mergeParts(parts));
}

/** `m134_ejection_chute` (assembledPos = [-9.8, -4.4, 7.2], lower-right `+Z` brass & M13 link port!) */
export function buildM134EjectionChuteGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Bolted upper mounting flange against lower-right main housing wall
  parts.push(boxAt(7.2, 2.6, 1.2, 0, 1.4, -1.6, M134_FLANGE_STEEL, 0.06));

  // Hollow angled deflector chute box directing spent 7.62mm brass & links downward-rightward
  const chuteOuter = createChamferedBox(6.8, 4.6, 4.2, 0.08, M134_PARKERIZED_STEEL);
  const chuteInner = createChamferedBox(5.6, 3.6, 5.2, 0.0, M134_PARKERIZED_STEEL);
  const chuteHollow = csgSubtract(chuteOuter, [chuteInner]);
  chuteOuter.dispose();
  chuteInner.dispose();
  chuteHollow.rotateX(0.52);
  chuteHollow.translate(0, -0.6, 0.35);
  parts.push(chuteHollow);

  // Lower flared brass-deflector apron lip
  const lip = createChamferedBox(6.6, 0.45, 2.6, 0.03, M134_FLANGE_STEEL);
  lip.rotateX(0.65);
  lip.translate(0, -2.55, 1.45);
  parts.push(lip);

  return sanitizeM134Mesh(mergeParts(parts));
}

// ============================================================================
// 4. DYNAMIC `aSpringParam` CSG HELICAL SPRINGS (2 Parts — SKIPPED in `m134.glb`!)
// ============================================================================

/**
 * `m134_clutch_spring` (assembledPos = [-18.4, 3.85, 0], local X in [-2.2, +2.2], w = 1)
 * Heavy X-axis electric drive-clutch / torque-limiting helical spring inside rear gearbox.
 */
export function buildM134ClutchSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: -2.2,
    end: 2.2,
    centerY: 0,
    centerZ: 0,
    coilRadius: 0.72,
    wireRadius: 0.13,
    coils: 10,
    radialSegments: 10,
    tubularSegmentsPerCoil: 18,
  });
  paintGeometry(spring, M134_SPRING_STEEL);
  return sanitizeM134Mesh(spring);
}

/**
 * `m134_feeder_spring` (assembledPos = [-9.2, 1.35, -7.8], local X in [-2.4, +2.4], w = 1)
 * Helical X-axis delinker tension / feed-pawl buffer spring inside Dillon delinker gearbox.
 */
export function buildM134FeederSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: -2.4,
    end: 2.4,
    centerY: 0,
    centerZ: 0,
    coilRadius: 0.56,
    wireRadius: 0.11,
    coils: 12,
    radialSegments: 10,
    tubularSegmentsPerCoil: 18,
  });
  paintGeometry(spring, M134_SPRING_STEEL);
  return sanitizeM134Mesh(spring);
}
