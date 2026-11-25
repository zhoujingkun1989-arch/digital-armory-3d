import * as THREE from 'three';
import {
  createBeveledCylinder,
  createChamferedBox,
  createHelicalSpring,
  createMilStdPicatinnyRail,
  mergeParts,
  paintGeometry,
  SPRING_AXIS_MODE_FLEX,
  SPRING_PARAM_ATTRIBUTE,
} from '../../engine/geometry/csgBuilder';

/**
 * Pure Three.js Parametric CAD Geometry Library for the 66 Centennial Exhibits
 * ---------------------------------------------------------------------------
 * Coordinate contract (matches `PartActor.tsx` & `geometry.worker.ts`):
 *  - 1 world unit = 1 cm
 *  - +X = muzzle / forward, +Y = up, +Z = right flank
 *  - Every exported primitive returns a non-indexed, outward-normal `THREE.BufferGeometry`
 *    carrying valid finite `position`, `normal` (unit-length), `uv`, `color`, and `aCurvature`
 *    (plus `aSpringParam` on dynamic springs, flexing bow limbs, and bowstrings).
 */

export type CentennialFinishPaletteName =
  | 'blued_steel'
  | 'parkerized'
  | 'stainless'
  | 'fde'
  | 'od_green'
  | 'bakelite_ak'
  | 'walnut_classic'
  | 'tactical_black'
  | 'desert_carc'
  | 'nato_camo'
  | 'russian_green'
  | 'wwii_soviet'
  | 'titanium_matte'
  | 'yew_wood'
  | 'carbon_camo';

export interface CentennialFinishColorSet {
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly furniture: string;
  readonly barrel: string;
  readonly bolt: string;
  readonly brass: string;
  readonly optic: string;
}

/**
 * AgX-calibrated museum finish palettes calibrated for multiplicative 1024×1024
 * `centennial_mat_*_albedo.webp` detail textures (~0.88 mean albedo): steels sit cleanly
 * in sRGB 0.22–0.38, oiled walnut & birch laminate in warm museum wood tones, and matte
 * anodized dark gunmetal optics — anti-reflective glass sheen is restricted strictly
 * to tiny recessed scope lens faces inside `buildOpticAndSightGeo`.
 */
export const CENTENNIAL_FINISH_COLORS: Record<
  CentennialFinishPaletteName,
  CentennialFinishColorSet
> = {
  blued_steel: {
    primary: '#3c4756',
    secondary: '#4c596b',
    accent: '#788494',
    furniture: '#58331e',
    barrel: '#374252',
    bolt: '#c2cad6',
    brass: '#d8ab4c',
    optic: '#2c323c',
  },
  parkerized: {
    primary: '#464e58',
    secondary: '#555e69',
    accent: '#808a98',
    furniture: '#603720',
    barrel: '#404852',
    bolt: '#b6beca',
    brass: '#d9ac4d',
    optic: '#313944',
  },
  stainless: {
    primary: '#b6bfcc',
    secondary: '#96a0af',
    accent: '#545e6c',
    furniture: '#3e4551',
    barrel: '#c0c9d5',
    bolt: '#d4dbe5',
    brass: '#ddb053',
    optic: '#313944',
  },
  fde: {
    primary: '#aa8f66',
    secondary: '#897251',
    accent: '#50565f',
    furniture: '#967d58',
    barrel: '#434b55',
    bolt: '#a8b0bc',
    brass: '#daae50',
    optic: '#363532',
  },
  od_green: {
    primary: '#516048',
    secondary: '#42503c',
    accent: '#6d7884',
    furniture: '#58694d',
    barrel: '#404953',
    bolt: '#b2bac5',
    brass: '#d7a94c',
    optic: '#303736',
  },
  bakelite_ak: {
    primary: '#3e4752',
    secondary: '#4c5560',
    accent: '#636e7b',
    furniture: '#6c361c',
    barrel: '#38414c',
    bolt: '#bfc7d3',
    brass: '#d4a446',
    optic: '#2c323c',
  },
  walnut_classic: {
    primary: '#3d4755',
    secondary: '#4f5a69',
    accent: '#6e7987',
    furniture: '#59321e',
    barrel: '#374150',
    bolt: '#c7ced9',
    brass: '#dcaf51',
    optic: '#2c323c',
  },
  tactical_black: {
    primary: '#3c4450',
    secondary: '#4c5664',
    accent: '#768090',
    furniture: '#404854',
    barrel: '#363e4a',
    bolt: '#bbc3cf',
    brass: '#d8aa4e',
    optic: '#2c323c',
  },
  desert_carc: {
    primary: '#9b8867',
    secondary: '#827154',
    accent: '#595b57',
    furniture: '#877557',
    barrel: '#8c7b5d',
    bolt: '#a7afb9',
    brass: '#d7a94b',
    optic: '#373531',
  },
  nato_camo: {
    primary: '#4c5840',
    secondary: '#5f513e',
    accent: '#3f474e',
    furniture: '#4a553f',
    barrel: '#45503a',
    bolt: '#a4acb7',
    brass: '#d6a84c',
    optic: '#2f3635',
  },
  russian_green: {
    primary: '#45543a',
    secondary: '#384530',
    accent: '#54604c',
    furniture: '#4c5c41',
    barrel: '#3e4c35',
    bolt: '#acb4bf',
    brass: '#d5a84b',
    optic: '#2f3734',
  },
  wwii_soviet: {
    primary: '#49573b',
    secondary: '#3c4931',
    accent: '#59644d',
    furniture: '#5a341f',
    barrel: '#425036',
    bolt: '#a6aeb9',
    brass: '#d1a347',
    optic: '#313834',
  },
  titanium_matte: {
    primary: '#717d8c',
    secondary: '#5b6673',
    accent: '#a6b0be',
    furniture: '#4c5664',
    barrel: '#65707f',
    bolt: '#cbd3df',
    brass: '#dbae52',
    optic: '#333b44',
  },
  yew_wood: {
    primary: '#7a4524',
    secondary: '#60341b',
    accent: '#d7c8a6',
    furniture: '#522c17',
    barrel: '#86532d',
    bolt: '#c2b292',
    brass: '#d7aa4f',
    optic: '#37322c',
  },
  carbon_camo: {
    primary: '#434c58',
    secondary: '#56606c',
    accent: '#cf6429',
    furniture: '#3b434d',
    barrel: '#4b5561',
    bolt: '#c0c9d5',
    brass: '#d29e46',
    optic: '#2d343e',
  },
};

export type BarrelMuzzleStyle =
  | 'bare'
  | 'flash_hider'
  | 'brake'
  | 'suppressor'
  | 'shroud'
  | 'rotary_clamp'
  | 'tank_evacuator'
  | 'artillery_brake';

export interface ReceiverGeoOptions {
  topRail?: boolean;
  magwellCollar?: boolean;
  ejectionPort?: boolean;
  roundedTop?: boolean;
  accentColorHex?: string;
  railLengthRatio?: number;
  /** Stamped/milled AK dust-cover stiffening ribs, side rivets & rear takedown button. */
  akStyle?: boolean;
  /** Classic Colt M16A1 teardrop forward assist & upper forging contours. */
  arA1Style?: boolean;
  /** Warsaw Pact left-flank dovetail side-mount rail bar (authentic pre-1990 optic rail). */
  dovetailSideRail?: boolean;
}

export interface BarrelGeoOptions {
  flutes?: boolean;
  coolingFins?: boolean;
  frontSightTower?: boolean;
  gasBlock?: boolean;
  muzzleStyle?: BarrelMuzzleStyle;
  accentColorHex?: string;
  /** Authentic AK-47 45-degree slanted gas block + hooded front sight post. */
  akGasBlock45?: boolean;
  /** Authentic Colt M16A1 triangular forged A-frame front sight tower + bayonet lug. */
  m16AFrameSight?: boolean;
  /** Authentic modern MBT ribbed thermal barrel shroud sleeve bands. */
  thermalSleeve?: boolean;
}

export type BoltCarrierStyle =
  | 'rotating'
  | 'straight_pull'
  | 'slide'
  | 'slide_open_top'
  | 'falling_block'
  | 'revolver_cylinder';

export type HandguardStyle =
  | 'ventilated_tube'
  | 'quad_rail'
  | 'ribbed_historical'
  | 'triangular_retro'
  | 'walnut_forend'
  | 'polymer_bullpup';

export type StockGripStyle =
  | 'walnut_rifle'
  | 'straight_walnut'
  | 'ppsh_one_piece'
  | 'm16a1_fixed'
  | 'dragunov_thumbhole'
  | 'spas12_top_fold'
  | 'folding_skeleton'
  | 'telescoping_ar'
  | 'bullpup_stock'
  | 'crossbow_thumbhole'
  | 'pistol_grip'
  | 'lever_loop'
  | 'broomhandle_grip'
  | 'plowhandle_grip'
  | 'spade_grips';

export type MagazineStyle =
  | 'curved_banana'
  | 'straight_box'
  | 'drum_71'
  | 'pan_47'
  | 'helical_64'
  | 'belt_tray'
  | 'tubular'
  | 'top_clip';

export type OpticSightStyle =
  | 'tactical_scope'
  | 'pso1_soviet'
  | 'carry_handle'
  | 'folding_tangent';

export type HeavyArmorPartKind =
  | 'hull'
  | 'turret'
  | 'era_skirts'
  | 'suspension_tracks'
  | 'engine_block'
  | 'autoloader';

export type HeavyArmorStyle = 'mbt_modern' | 'mbt_wwii';

export type HeavyArmorVariant = 't90m' | 'challenger2' | 'merkava4' | 't34_85';

export type RotaryArtilleryPartKind =
  | 'vulcan_barrels'
  | 'bofors_carriage'
  | 'm777_carriage'
  | 'breech_block';

export type ArcheryPartKind =
  | 'riser'
  | 'limbs'
  | 'cams'
  | 'projectile'
  | 'bowstring';

export type ArcheryStyle =
  | 'bow_compound'
  | 'crossbow_recurve'
  | 'bow_longbow';

// =============================================================================
// Internal Watertight Geometry & Normal Hygiene Helpers
// =============================================================================

function clampPos(v: number, fallback: number): number {
  return Number.isFinite(v) && v > 1e-4 ? v : fallback;
}

function shadeHex(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return `#${c.getHexString()}`;
}

/**
 * Repairs any zero-length / non-finite vertex normal (e.g., from micro-beveled
 * ExtrudeGeometry corners) to a finite unit-length triangle face normal.
 */
function ensureUnitNormals(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  let norm = geo.getAttribute('normal');
  if (!norm || norm.count !== pos.count) {
    geo.computeVertexNormals();
    norm = geo.getAttribute('normal');
  }
  const nArr = norm.array as Float32Array;
  const pArr = pos.array as Float32Array;
  let dirty = false;

  for (let i = 0; i < pos.count; i++) {
    const o = i * 3;
    const nx = nArr[o];
    const ny = nArr[o + 1];
    const nz = nArr[o + 2];
    const len = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(len) || Math.abs(len - 1) > 1e-4) {
      dirty = true;
      if (Number.isFinite(len) && len > 1e-6) {
        nArr[o] = nx / len;
        nArr[o + 1] = ny / len;
        nArr[o + 2] = nz / len;
      } else {
        const triBase = Math.floor(i / 3) * 9;
        const ax = pArr[triBase];
        const ay = pArr[triBase + 1];
        const az = pArr[triBase + 2];
        const bx = pArr[triBase + 3];
        const by = pArr[triBase + 4];
        const bz = pArr[triBase + 5];
        const cx = pArr[triBase + 6];
        const cy = pArr[triBase + 7];
        const cz = pArr[triBase + 8];
        const fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        const fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        const fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const fLen = Math.hypot(fx, fy, fz);
        if (Number.isFinite(fLen) && fLen > 1e-10) {
          nArr[o] = fx / fLen;
          nArr[o + 1] = fy / fLen;
          nArr[o + 2] = fz / fLen;
        } else {
          nArr[o] = 0;
          nArr[o + 1] = 1;
          nArr[o + 2] = 0;
        }
      }
    }
  }
  if (dirty) norm.needsUpdate = true;
  return geo;
}

/**
 * Projects razor-sharp physical metric tri-planar Box-Projection UVs onto any
 * non-indexed geometry (`1 world unit = 1 cm`) with primary `U` strictly aligned
 * along the barrel `+X` axis (longitudinal wood grain, brushed CNC steel streaks,
 * and 20-LPI grip checkering map with zero stretching across shared 1024×1024
 * seamless PBR textures).
 */
export function applyMetricBoxUVs(
  geo: THREE.BufferGeometry,
  tileSizeCm = 10
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  if (!pos) return geo;
  const invTile = 1 / Math.max(0.5, Number.isFinite(tileSizeCm) ? tileSizeCm : 10);
  const count = pos.count;
  const uvArr = new Float32Array(count * 2);
  const pArr = pos.array as ArrayLike<number>;

  for (let i = 0; i + 2 < count; i += 3) {
    const i0 = i * 3;
    const i1 = (i + 1) * 3;
    const i2 = (i + 2) * 3;
    const ax = pArr[i0];
    const ay = pArr[i0 + 1];
    const az = pArr[i0 + 2];
    const bx = pArr[i1];
    const by = pArr[i1 + 1];
    const bz = pArr[i1 + 2];
    const cx = pArr[i2];
    const cy = pArr[i2 + 1];
    const cz = pArr[i2 + 2];

    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;

    const nx = Math.abs(e1y * e2z - e1z * e2y);
    const ny = Math.abs(e1z * e2x - e1x * e2z);
    const nz = Math.abs(e1x * e2y - e1y * e2x);

    // Choose dominant face axis per triangle so no triangle straddles a projection seam
    if (nz >= nx && nz >= ny) {
      // Side flanks (+Z / -Z): U along barrel +X, V along vertical +Y
      uvArr[i * 2] = ax * invTile;
      uvArr[i * 2 + 1] = ay * invTile;
      uvArr[(i + 1) * 2] = bx * invTile;
      uvArr[(i + 1) * 2 + 1] = by * invTile;
      uvArr[(i + 2) * 2] = cx * invTile;
      uvArr[(i + 2) * 2 + 1] = cy * invTile;
    } else if (ny >= nx) {
      // Top / bottom surfaces (+Y / -Y): U along barrel +X, V along flank +Z
      uvArr[i * 2] = ax * invTile;
      uvArr[i * 2 + 1] = az * invTile;
      uvArr[(i + 1) * 2] = bx * invTile;
      uvArr[(i + 1) * 2 + 1] = bz * invTile;
      uvArr[(i + 2) * 2] = cx * invTile;
      uvArr[(i + 2) * 2 + 1] = cz * invTile;
    } else {
      // Front / rear faces (+X / -X): U along flank +Z, V along vertical +Y
      uvArr[i * 2] = az * invTile;
      uvArr[i * 2 + 1] = ay * invTile;
      uvArr[(i + 1) * 2] = bz * invTile;
      uvArr[(i + 1) * 2 + 1] = by * invTile;
      uvArr[(i + 2) * 2] = cz * invTile;
      uvArr[(i + 2) * 2 + 1] = cy * invTile;
    }
  }

  const uvAttr = new THREE.BufferAttribute(uvArr, 2);
  geo.setAttribute('uv', uvAttr);
  // Three.js r151+ `aoMap` samples channel 1 (`uv1`) — duplicate metric UVs so
  // packed 5-channel ORM `R = AO` maps cleanly at full physical resolution!
  geo.setAttribute('uv1', uvAttr.clone());
  return geo;
}

function finalizeClean(
  parts: THREE.BufferGeometry[],
  creaseRad = Math.PI / 5.2,
  uvTileCm = 10
): THREE.BufferGeometry {
  const merged = mergeParts(parts, creaseRad);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  ensureUnitNormals(merged);
  applyMetricBoxUVs(merged, uvTileCm);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Watertight revolved solid around +X from `(r, x)` profile running from rear axis
 * point `(0, x0)` -> outer contour -> front axis point `(0, x1)` (or closed hollow tube).
 * Skips degenerate zero-area pole triangles so every normal is strictly finite and unit-length.
 */
function buildRevolvedAlongX(
  profile: ReadonlyArray<readonly [number, number]>,
  radialSegments: number,
  colorHex: string
): THREE.BufferGeometry {
  const seg = Math.max(6, Math.floor(radialSegments));
  const cosA = new Float64Array(seg + 1);
  const sinA = new Float64Array(seg + 1);
  for (let s = 0; s <= seg; s++) {
    const a = ((s % seg) / seg) * Math.PI * 2;
    cosA[s] = Math.cos(a);
    sinA[s] = Math.sin(a);
  }
  const verts: number[] = [];
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
    if (nx * nx + ny * ny + nz * nz < 1e-18) return;
    verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
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
      // Outward winding for +X profile running rear->front along outer surface
      pushTri(x0, ay, az, x0, by, bz, x1, cy, cz);
      pushTri(x0, ay, az, x1, cy, cz, x1, dy, dz);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.computeVertexNormals();
  paintGeometry(geo, colorHex);
  return geo;
}

/**
 * Watertight beveled 2D profile extruded along Z (centered at z = 0) in XY plane.
 */
function extrudeProfileXY(
  pts: ReadonlyArray<readonly [number, number]>,
  thicknessZ: number,
  bevel: number,
  colorHex: string,
  bevelSegments = 2
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();

  const b = Math.min(Math.max(bevel, 0), thicknessZ * 0.35);
  const depth = Math.max(thicknessZ - 2 * b, 0.02);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: b > 1e-4,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments,
    curveSegments: 10,
    steps: 1,
  });
  geo.translate(0, 0, -depth * 0.5);
  const nonIdx = geo.index ? geo.toNonIndexed() : geo;
  if (nonIdx !== geo) geo.dispose();
  nonIdx.computeVertexNormals();
  paintGeometry(nonIdx, colorHex);
  return nonIdx;
}

/**
 * Watertight beveled 2D cross-section in (Z, Y) extruded along +X (centered at x = 0).
 */
function extrudeProfileZYAlongX(
  ptsZY: ReadonlyArray<readonly [number, number]>,
  lengthX: number,
  bevel: number,
  colorHex: string,
  bevelSegments = 2
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(ptsZY[0][0], ptsZY[0][1]);
  for (let i = 1; i < ptsZY.length; i++) {
    shape.lineTo(ptsZY[i][0], ptsZY[i][1]);
  }
  shape.closePath();

  const b = Math.min(Math.max(bevel, 0), lengthX * 0.25);
  const depth = Math.max(lengthX - 2 * b, 0.02);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: b > 1e-4,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments,
    curveSegments: 10,
    steps: 1,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.rotateY(Math.PI / 2);
  const nonIdx = geo.index ? geo.toNonIndexed() : geo;
  if (nonIdx !== geo) geo.dispose();
  nonIdx.computeVertexNormals();
  paintGeometry(nonIdx, colorHex);
  return nonIdx;
}

/**
 * Exported reusable beveled 2D profile extruder in XY plane (zero harsh sharp boxes).
 */
export function buildBeveledProfile(
  pts: ReadonlyArray<readonly [number, number]>,
  thicknessZ: number,
  bevel: number,
  colorHex: string,
  bevelSegments = 2
): THREE.BufferGeometry {
  return extrudeProfileXY(pts, thicknessZ, bevel, colorHex, bevelSegments);
}

/**
 * Exported reusable chamfered 3D slab via beveled 8-corner octagonal cross-section
 * extruded cleanly along +X (eliminating sharp 90-degree raw slabs).
 */
export function buildChamferedSlab(
  lenX: number,
  heightY: number,
  widthZ: number,
  bevel: number,
  colorHex: string
): THREE.BufferGeometry {
  const L = clampPos(lenX, 2);
  const H = clampPos(heightY, 1);
  const W = clampPos(widthZ, 1);
  const hw = W * 0.5;
  const hh = H * 0.5;
  const c = Math.min(Math.max(bevel, Math.min(W, H) * 0.1), hw * 0.42, hh * 0.42);
  const prof: Array<[number, number]> = [
    [-hw + c, -hh],
    [hw - c, -hh],
    [hw, -hh + c],
    [hw, hh - c],
    [hw - c, hh],
    [-hw + c, hh],
    [-hw, hh - c],
    [-hw, -hh + c],
  ];
  return extrudeProfileZYAlongX(prof, L, Math.min(c * 0.6, L * 0.18), colorHex, 2);
}

/** Beveled cylinder oriented along +X, centered at origin. */
function cylAlongX(
  rRear: number,
  rFront: number,
  length: number,
  bevel: number,
  segs: number,
  colorHex: string
): THREE.BufferGeometry {
  const g = createBeveledCylinder(rFront, rRear, length, bevel, segs, colorHex);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Beveled cylinder oriented along +Z, centered at origin. */
function cylAlongZ(
  rBack: number,
  rFront: number,
  length: number,
  bevel: number,
  segs: number,
  colorHex: string
): THREE.BufferGeometry {
  const g = createBeveledCylinder(rFront, rBack, length, bevel, segs, colorHex);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Attaches GPU `SPRING_AXIS_MODE_FLEX` (`w = 3`) displacement vectors to every vertex. */
function attachFlexParam(
  geo: THREE.BufferGeometry,
  computeDelta: (x: number, y: number, z: number) => readonly [number, number, number]
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const arr = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const [dx, dy, dz] = computeDelta(pos.getX(i), pos.getY(i), pos.getZ(i));
    const o = i * 4;
    arr[o] = dx;
    arr[o + 1] = dy;
    arr[o + 2] = dz;
    arr[o + 3] = SPRING_AXIS_MODE_FLEX;
  }
  geo.setAttribute(SPRING_PARAM_ATTRIBUTE, new THREE.BufferAttribute(arr, 4));
  return geo;
}

// =============================================================================
// 1. Chamfered Receiver Builder
// =============================================================================

export function buildChamferedReceiverGeo(
  len: number,
  height: number,
  width: number,
  colorHex: string,
  opts: ReceiverGeoOptions = {}
): THREE.BufferGeometry {
  const L = clampPos(len, 22);
  const H = clampPos(height, 4.8);
  const W = clampPos(width, 3.4);
  const hw = W * 0.5;
  const hh = H * 0.5;
  const chamfer = Math.min(W, H) * 0.14;
  const darkHex = shadeHex(colorHex, 0.72);
  const accentHex = opts.accentColorHex ?? shadeHex(colorHex, 1.18);

  const parts: THREE.BufferGeometry[] = [];

  // Octagonal / rounded-crown multi-chamfered main receiver body extruded along +X
  const profileZY: Array<[number, number]> = opts.roundedTop
    ? [
        [-hw + chamfer, -hh],
        [hw - chamfer, -hh],
        [hw, -hh + chamfer],
        [hw, hh * 0.35],
        [hw * 0.84, hh * 0.76],
        [hw * 0.45, hh * 0.96],
        [-hw * 0.45, hh * 0.96],
        [-hw * 0.84, hh * 0.76],
        [-hw, hh * 0.35],
        [-hw, -hh + chamfer],
      ]
    : [
        [-hw + chamfer, -hh],
        [hw - chamfer, -hh],
        [hw, -hh + chamfer],
        [hw, hh * 0.42],
        [hw - chamfer * 1.15, hh],
        [-hw + chamfer * 1.15, hh],
        [-hw, hh * 0.42],
        [-hw, -hh + chamfer],
      ];

  parts.push(extrudeProfileZYAlongX(profileZY, L, Math.min(0.14, chamfer * 0.5), colorHex, 2));

  // Front trunnion / barrel-extension collar & rear end-plate flange
  const frontCollar = createChamferedBox(
    Math.min(L * 0.14, 2.8),
    H * 0.86,
    W * 1.04,
    chamfer * 0.45,
    accentHex
  );
  frontCollar.translate(L * 0.43, 0, 0);
  parts.push(frontCollar);

  // Flank lightening & structural side-rib relief
  for (const side of [-1, 1] as const) {
    const rib = createChamferedBox(
      L * 0.68,
      H * 0.18,
      W * 0.08,
      chamfer * 0.2,
      accentHex
    );
    rib.translate(-L * 0.04, -hh * 0.28, side * (hw + W * 0.025));
    parts.push(rib);
  }

  // Milled ejection port recess framing + brass deflector boss on right (+Z) flank
  if (opts.ejectionPort !== false) {
    const portLen = Math.min(L * 0.28, 6.2);
    const portH = H * 0.36;
    const portRecess = createChamferedBox(portLen, portH, W * 0.12, 0.04, darkHex);
    portRecess.translate(L * 0.08, hh * 0.24, hw - W * 0.02);
    parts.push(portRecess);

    const deflector = createChamferedBox(
      portLen * 0.22,
      portH * 0.85,
      W * 0.2,
      0.06,
      accentHex
    );
    deflector.translate(L * 0.08 - portLen * 0.58, hh * 0.22, hw + W * 0.06);
    parts.push(deflector);
  }

  // Optional MIL-STD-1913 top Picatinny rail teeth
  if (opts.topRail) {
    const ratio = Math.min(0.95, Math.max(0.35, opts.railLengthRatio ?? 0.82));
    const railLen = L * ratio;
    const railW = Math.min(2.12, W * 0.72);
    const rail = createMilStdPicatinnyRail(
      railLen,
      -railLen * 0.5,
      hh + 0.72,
      railW,
      accentHex
    );
    parts.push(rail);
  }

  // Optional beveled lower magwell collar + pivot takedown pins
  if (opts.magwellCollar !== false) {
    const mwLen = Math.min(L * 0.28, 6.4);
    const mwH = H * 0.42;
    const mwW = W * 0.94;
    const magwell = createChamferedBox(mwLen, mwH, mwW, chamfer * 0.45, colorHex);
    magwell.translate(L * 0.12, -hh - mwH * 0.42, 0);
    parts.push(magwell);

    const flare = createChamferedBox(
      mwLen * 1.08,
      mwH * 0.22,
      mwW * 1.08,
      chamfer * 0.3,
      accentHex
    );
    flare.translate(L * 0.12, -hh - mwH * 0.84, 0);
    parts.push(flare);
  }

  // Cross-pin bosses along lower receiver skirt
  for (const px of [-L * 0.34, L * 0.32]) {
    const pin = cylAlongZ(0.24, 0.24, W * 1.06, 0.04, 16, accentHex);
    pin.translate(px, -hh * 0.56, 0);
    parts.push(pin);
  }

  // Authentic AK stamped/milled dust-cover longitudinal stiffening ribs, side rivets & rear button
  if (opts.akStyle) {
    for (const rz of [-hw * 0.46, 0, hw * 0.46]) {
      const dustRib = createChamferedBox(L * 0.66, H * 0.08, W * 0.12, 0.03, accentHex);
      dustRib.translate(-L * 0.06, hh * 0.94, rz);
      parts.push(dustRib);
    }
    for (const side of [-1, 1] as const) {
      for (const rx of [-L * 0.42, -L * 0.36, L * 0.35, L * 0.41]) {
        const rivet = cylAlongZ(0.18, 0.14, W * 0.14, 0.03, 12, accentHex);
        rivet.translate(rx, hh * 0.04, side * (hw + 0.02));
        parts.push(rivet);
      }
    }
    const rearBtn = createChamferedBox(0.95, H * 0.24, W * 0.32, 0.04, accentHex);
    rearBtn.translate(-L * 0.51, hh * 0.24, 0);
    parts.push(rearBtn);
  }

  // Iconic Colt M16A1 teardrop forward assist & upper forging housing boss on right flank (+Z)
  if (opts.arA1Style) {
    const faHousing = cylAlongX(H * 0.2, H * 0.16, L * 0.22, 0.05, 18, colorHex);
    faHousing.rotateY(-0.34);
    faHousing.translate(-L * 0.18, hh * 0.26, hw + W * 0.16);
    parts.push(faHousing);
    const faPlunger = createChamferedBox(L * 0.08, H * 0.22, W * 0.28, 0.05, accentHex);
    faPlunger.translate(-L * 0.29, hh * 0.26, hw + W * 0.24);
    parts.push(faPlunger);
  }

  // Authentic Warsaw Pact left-flank (-Z) dovetail side-mount optic plate (zero Picatinny!)
  if (opts.dovetailSideRail) {
    const doveBar = createChamferedBox(L * 0.44, H * 0.34, W * 0.14, 0.04, accentHex);
    doveBar.translate(-L * 0.06, -hh * 0.06, -(hw + W * 0.07));
    parts.push(doveBar);
    const doveRidge = createChamferedBox(L * 0.38, H * 0.12, W * 0.18, 0.03, darkHex);
    doveRidge.translate(-L * 0.06, hh * 0.08, -(hw + W * 0.09));
    parts.push(doveRidge);
  }

  return finalizeClean(parts, Math.PI / 5.2);
}

// =============================================================================
// 2. Stepped Lathe Barrel & Muzzle Device Builder
// =============================================================================

export function buildSteppedBarrelGeo(
  len: number,
  breechR: number,
  muzzleR: number,
  colorHex: string,
  opts: BarrelGeoOptions = {}
): THREE.BufferGeometry {
  const L = clampPos(len, 40);
  const rB = clampPos(breechR, 1.25);
  const rM = clampPos(muzzleR, 0.82);
  const rMid = rM + (rB - rM) * 0.42;
  const boreR = Math.min(rM * 0.48, Math.max(0.22, rM * 0.42));
  const halfL = L * 0.5;
  const accentHex = opts.accentColorHex ?? shadeHex(colorHex, 1.15);
  const darkHex = shadeHex(colorHex, 0.65);

  const parts: THREE.BufferGeometry[] = [];

  // Stepped chamber-reinforce -> mid-taper -> muzzle profile with recessed bore crown
  const profile: Array<[number, number]> = [
    [0, -halfL],
    [rB * 0.94, -halfL],
    [rB * 1.04, -halfL + L * 0.02],
    [rB * 1.04, -halfL + L * 0.14],
    [rMid * 1.06, -halfL + L * 0.2],
    [rMid, -halfL + L * 0.52],
    [rM * 1.04, -halfL + L * 0.64],
    [rM, halfL - Math.min(0.6, L * 0.02)],
    [rM * 0.88, halfL],
    [boreR, halfL],
    [boreR, halfL - Math.min(2.2, L * 0.08)],
    [0, halfL - Math.min(2.2, L * 0.08)],
  ];
  parts.push(buildRevolvedAlongX(profile, 28, colorHex));

  // Optional longitudinal precision barrel flutes (raised ribs framing 6 recessed channels)
  if (opts.flutes) {
    const fluteLen = L * 0.52;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rib = createChamferedBox(fluteLen, rM * 0.18, rM * 0.24, 0.03, accentHex);
      rib.translate(0, rMid * 0.96, 0);
      rib.rotateX(a);
      parts.push(rib);
    }
  }

  // Optional radial barrel cooling fins (Thompson / MG-style)
  if (opts.coolingFins) {
    const finCount = Math.min(18, Math.max(8, Math.floor(L / 1.8)));
    const startX = -halfL + L * 0.18;
    const span = L * 0.52;
    for (let i = 0; i < finCount; i++) {
      const fx = startX + (i / (finCount - 1)) * span;
      const fin = cylAlongX(rB * 1.18, rB * 1.18, span / (finCount * 2.2), 0.03, 24, accentHex);
      fin.translate(fx, 0, 0);
      parts.push(fin);
    }
  }

  // Optional gas block & upper gas-tube boss
  if (opts.gasBlock) {
    const gx = -halfL + L * 0.66;
    if (opts.akGasBlock45) {
      // Iconic AK-47 45-degree slanted forged gas block + exposed upper steel gas tube
      const slantPts: Array<[number, number]> = [
        [-1.4, -rM * 0.6],
        [1.1, -rM * 0.6],
        [0.45, rM * 2.2],
        [-0.95, rM * 2.2],
      ];
      const block = extrudeProfileXY(slantPts, rM * 1.85, 0.07, accentHex, 2);
      block.translate(gx, rM * 0.35, 0);
      parts.push(block);
    } else {
      const block = createChamferedBox(
        Math.min(3.0, L * 0.09),
        rM * 2.95,
        rM * 2.0,
        0.08,
        accentHex
      );
      block.translate(gx, rM * 0.55, 0);
      parts.push(block);
    }

    const tubeLen = L * 0.52;
    const tube = cylAlongX(rM * 0.38, rM * 0.38, tubeLen, 0.03, 18, accentHex);
    tube.translate(gx - tubeLen * 0.5, rM * 1.55, 0);
    parts.push(tube);
  }

  // Optional forged A-frame front sight tower (M16A1 iconic open A-frame or AK hooded front post)
  if (opts.m16AFrameSight) {
    const sx = halfL - Math.min(5.2, L * 0.18);
    const towerH = Math.max(2.9, rM * 4.1);
    const rearLeg = createChamferedBox(0.72, towerH, rM * 0.92, 0.05, accentHex);
    rearLeg.rotateZ(-0.24);
    rearLeg.translate(sx - 0.95, rM * 0.7 + towerH * 0.45, 0);
    parts.push(rearLeg);
    const frontLeg = createChamferedBox(0.72, towerH, rM * 0.92, 0.05, accentHex);
    frontLeg.rotateZ(0.2);
    frontLeg.translate(sx + 0.85, rM * 0.7 + towerH * 0.45, 0);
    parts.push(frontLeg);
    const topBridge = createChamferedBox(1.45, 0.65, rM * 1.15, 0.05, accentHex);
    topBridge.translate(sx, rM * 0.7 + towerH * 0.96, 0);
    parts.push(topBridge);
    const bayoLug = createChamferedBox(1.5, rM * 1.15, rM * 0.95, 0.05, darkHex);
    bayoLug.translate(sx + 0.5, -rM * 1.15, 0);
    parts.push(bayoLug);
    for (const side of [-1, 1] as const) {
      const ear = createChamferedBox(0.85, towerH * 0.36, 0.22, 0.03, accentHex);
      ear.translate(sx, rM * 0.7 + towerH * 1.16, side * (rM * 0.54));
      parts.push(ear);
    }
  } else if (opts.frontSightTower) {
    const sx = halfL - Math.min(4.2, L * 0.14);
    const towerH = Math.max(2.2, rM * 3.2);
    const towerPts: Array<[number, number]> = [
      [-1.3, 0],
      [1.3, 0],
      [0.65, towerH],
      [-0.65, towerH],
    ];
    const tower = extrudeProfileXY(towerPts, rM * 1.15, 0.06, accentHex, 2);
    tower.translate(sx, rM * 0.6, 0);
    parts.push(tower);

    // Protective front sight hood / ears
    if (opts.akGasBlock45) {
      const hood = new THREE.TorusGeometry(rM * 0.68, rM * 0.16, 10, 20);
      paintGeometry(hood, accentHex);
      hood.rotateY(Math.PI / 2);
      hood.translate(sx, rM * 0.6 + towerH * 1.02, 0);
      parts.push(hood);
    } else {
      for (const side of [-1, 1] as const) {
        const ear = createChamferedBox(0.9, towerH * 0.42, 0.24, 0.04, accentHex);
        ear.translate(sx, rM * 0.6 + towerH * 1.05, side * (rM * 0.55));
        parts.push(ear);
      }
    }
  }

  // Optional modern MBT ribbed thermal barrel shroud bands
  if (opts.thermalSleeve) {
    for (const frac of [-0.34, -0.18, -0.02, 0.16, 0.34]) {
      const bandR = frac < 0 ? rMid * 1.14 : rM * 1.16;
      const band = cylAlongX(bandR, bandR, L * 0.018, bandR * 0.06, 24, accentHex);
      band.translate(L * frac, 0, 0);
      parts.push(band);
    }
  }

  // Muzzle device variations
  const muzzleStyle = opts.muzzleStyle ?? 'bare';
  const mLen = Math.min(6.4, Math.max(2.2, rM * 4.4));
  if (muzzleStyle === 'flash_hider') {
    const base = cylAlongX(rM * 1.28, rM * 1.24, mLen * 0.38, 0.05, 24, darkHex);
    base.translate(halfL + mLen * 0.18, 0, 0);
    parts.push(base);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const prong = createChamferedBox(mLen * 0.72, rM * 0.34, rM * 0.34, 0.03, darkHex);
      prong.translate(halfL + mLen * 0.64, rM * 0.96, 0);
      prong.rotateX(a);
      parts.push(prong);
    }
  } else if (muzzleStyle === 'brake') {
    const body = createChamferedBox(mLen * 1.05, rM * 2.55, rM * 2.8, 0.1, darkHex);
    body.translate(halfL + mLen * 0.5, 0, 0);
    parts.push(body);
    for (const dx of [-mLen * 0.18, mLen * 0.24]) {
      const baffle = createChamferedBox(mLen * 0.22, rM * 2.7, rM * 2.95, 0.06, accentHex);
      baffle.translate(halfL + mLen * 0.5 + dx, 0, 0);
      parts.push(baffle);
    }
  } else if (muzzleStyle === 'suppressor') {
    const canLen = Math.max(mLen * 2.4, L * 0.3);
    const canR = rM * 1.88;
    const canProfile: Array<[number, number]> = [
      [0, halfL - 0.5],
      [rM * 1.2, halfL - 0.5],
      [canR, halfL + 0.4],
      [canR, halfL + canLen - 0.4],
      [canR * 0.86, halfL + canLen],
      [boreR * 1.15, halfL + canLen],
      [boreR * 1.15, halfL + canLen - 0.9],
      [0, halfL + canLen - 0.9],
    ];
    parts.push(buildRevolvedAlongX(canProfile, 28, darkHex));
  } else if (muzzleStyle === 'shroud') {
    const shroud = cylAlongX(rM * 1.55, rM * 1.5, mLen * 1.4, 0.06, 24, accentHex);
    shroud.translate(halfL - mLen * 0.35, 0, 0);
    parts.push(shroud);
  } else if (muzzleStyle === 'rotary_clamp') {
    const clamp = cylAlongX(rM * 2.4, rM * 2.4, Math.min(2.6, mLen * 0.55), 0.08, 28, accentHex);
    clamp.translate(halfL - mLen * 0.35, 0, 0);
    parts.push(clamp);
  } else if (muzzleStyle === 'tank_evacuator') {
    // Eccentric 1:1 tank fume extractor drum + muzzle reference sensor
    const evacR = rMid * 1.65;
    const evacLen = L * 0.16;
    const evac = cylAlongX(evacR * 0.96, evacR, evacLen, evacR * 0.12, 28, accentHex);
    evac.translate(-halfL + L * 0.48, evacR * 0.12, 0);
    parts.push(evac);
    const mrs = createChamferedBox(rM * 1.4, rM * 1.9, rM * 0.9, rM * 0.12, accentHex);
    mrs.translate(halfL - rM * 0.8, rM * 1.35, 0);
    parts.push(mrs);
  } else if (muzzleStyle === 'artillery_brake') {
    const brkLen = Math.max(mLen * 1.6, L * 0.14);
    const main = createChamferedBox(brkLen, rM * 3.1, rM * 3.8, rM * 0.22, darkHex);
    main.translate(halfL + brkLen * 0.48, 0, 0);
    parts.push(main);
    for (const f of [-0.28, 0.16]) {
      const flange = createChamferedBox(brkLen * 0.18, rM * 3.5, rM * 4.2, rM * 0.14, accentHex);
      flange.translate(halfL + brkLen * (0.5 + f), 0, 0);
      parts.push(flange);
    }
  }

  return finalizeClean(parts, Math.PI / 5.2);
}

// =============================================================================
// 3. Machined Bolt, Carrier, Slide & Fluted Revolver Cylinder Builder
// =============================================================================

export function buildBoltAndCarrierGeo(
  len: number,
  radius: number,
  colorHex: string,
  style: BoltCarrierStyle
): THREE.BufferGeometry {
  const L = clampPos(len, 12);
  const R = clampPos(radius, 0.95);
  const darkHex = shadeHex(colorHex, 0.72);
  const brightHex = shadeHex(colorHex, 1.18);
  const parts: THREE.BufferGeometry[] = [];

  if (style === 'revolver_cylinder') {
    // True fluted 6-chamber revolver cylinder centered at origin, axis +X
    const cylR = Math.max(R, 1.4);
    const cylL = Math.max(L, 3.2);
    parts.push(cylAlongX(cylR, cylR, cylL, cylR * 0.08, 36, colorHex));

    // Central fluted ejector star & stainless arbor rod
    const rod = cylAlongX(cylR * 0.24, cylR * 0.24, cylL * 1.38, 0.03, 18, brightHex);
    parts.push(rod);

    // 6 charge-hole rims + 6 exterior flute separator ribs + locking notches
    const chamberPitch = cylR * 0.58;
    const chamberR = cylR * 0.26;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rim = cylAlongX(chamberR, chamberR, cylL * 1.02, 0.02, 16, darkHex);
      rim.translate(0, Math.cos(a) * chamberPitch, Math.sin(a) * chamberPitch);
      parts.push(rim);

      const fluteAngle = a + Math.PI / 6;
      const rib = createChamferedBox(cylL * 0.72, cylR * 0.16, cylR * 0.22, 0.03, brightHex);
      rib.translate(cylL * 0.04, cylR * 0.96, 0);
      rib.rotateX(fluteAngle);
      parts.push(rib);
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'slide_open_top') {
    // Iconic Beretta 92FS / M9 OPEN-TOP cut-out pistol slide exposing cylindrical barrel & locking block!
    const slideH = R * 2.75;
    const slideW = R * 2.52;
    const hw = slideW * 0.5;
    const hh = slideH * 0.5;
    const wallT = slideW * 0.25;

    // Rear solid sculpted breech bridge (back 34% of slide) w/ rounded bevel crown
    const rearLen = L * 0.34;
    const rearProf: Array<[number, number]> = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh * 0.38],
      [hw * 0.82, hh * 0.82],
      [hw * 0.45, hh],
      [-hw * 0.45, hh],
      [-hw * 0.82, hh * 0.82],
      [-hw, hh * 0.38],
    ];
    const rearBridge = extrudeProfileZYAlongX(rearProf, rearLen, Math.min(0.1, R * 0.12), colorHex, 2);
    rearBridge.translate(-L * 0.5 + rearLen * 0.5, 0, 0);
    parts.push(rearBridge);

    // Sculpted left & right open-top slide side rails framing the wide open barrel cutout (center 50%)
    const midLen = L * 0.54;
    for (const side of [-1, 1] as const) {
      const sideRail = buildChamferedSlab(midLen, slideH * 0.72, wallT, 0.06, colorHex);
      sideRail.translate(-L * 0.5 + rearLen + midLen * 0.48, -hh * 0.16, side * (hw - wallT * 0.5));
      parts.push(sideRail);
    }

    // Front sculpted barrel-bushing muzzle bridge (front 16% of slide) w/ beveled nose
    const frontLen = L * 0.17;
    const frontBridge = extrudeProfileZYAlongX(rearProf, frontLen, Math.min(0.1, R * 0.12), colorHex, 2);
    frontBridge.translate(L * 0.5 - frontLen * 0.5, 0, 0);
    parts.push(frontBridge);

    // 8 angled rear slide cocking serration ribs + slide-mounted ambidextrous safety/decocker wings
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < 8; i++) {
        const sx = -L * 0.44 + i * (L * 0.028);
        const rib = createChamferedBox(L * 0.015, slideH * 0.64, slideW * 0.07, 0.015, brightHex);
        rib.rotateZ(-0.24);
        rib.translate(sx, -hh * 0.08, side * (hw + slideW * 0.015));
        parts.push(rib);
      }
      const safetyWing = createChamferedBox(L * 0.095, slideH * 0.24, slideW * 0.14, 0.03, darkHex);
      safetyWing.rotateZ(-0.22);
      safetyWing.translate(-L * 0.34, hh * 0.42, side * (hw + slideW * 0.06));
      parts.push(safetyWing);
    }

    // Integral low dovetail rear notch & swept front blade sight
    const rearSight = createChamferedBox(L * 0.07, slideH * 0.28, slideW * 0.62, 0.04, darkHex);
    rearSight.translate(-L * 0.42, hh + slideH * 0.1, 0);
    parts.push(rearSight);
    const frontSight = createChamferedBox(L * 0.065, slideH * 0.28, slideW * 0.2, 0.03, darkHex);
    frontSight.translate(L * 0.44, hh + slideH * 0.1, 0);
    parts.push(frontSight);
    return finalizeClean(parts, Math.PI / 5.0);
  }

  if (style === 'slide') {
    // Chamfered pistol top slide with multi-faceted beveled crown, cocking serrations, ejection step & iron sights
    const slideH = R * 2.75;
    const slideW = R * 2.52;
    const hw = slideW * 0.5;
    const hh = slideH * 0.5;
    const slideProf: Array<[number, number]> = [
      [-hw + R * 0.18, -hh],
      [hw - R * 0.18, -hh],
      [hw, -hh + R * 0.18],
      [hw, hh * 0.42],
      [hw * 0.84, hh * 0.84],
      [hw * 0.52, hh],
      [-hw * 0.52, hh],
      [-hw * 0.84, hh * 0.84],
      [-hw, hh * 0.42],
      [-hw, -hh + R * 0.18],
    ];
    parts.push(extrudeProfileZYAlongX(slideProf, L, Math.min(0.11, R * 0.13), colorHex, 2));

    // Recessed ejection port cutout step + external extractor claw bar on right (+Z) upper crown
    const port = createChamferedBox(L * 0.27, slideH * 0.44, slideW * 0.14, 0.03, darkHex);
    port.translate(L * 0.05, hh * 0.48, hw - slideW * 0.02);
    parts.push(port);
    const extractor = createChamferedBox(L * 0.14, slideH * 0.16, slideW * 0.08, 0.02, brightHex);
    extractor.translate(-L * 0.13, hh * 0.34, hw + slideW * 0.015);
    parts.push(extractor);

    // 7 angled rear slide cocking serration ribs on both flanks
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < 7; i++) {
        const sx = -L * 0.42 + i * (L * 0.032);
        const rib = createChamferedBox(L * 0.016, slideH * 0.66, slideW * 0.08, 0.015, brightHex);
        rib.rotateZ(-0.2);
        rib.translate(sx, -hh * 0.06, side * (hw + slideW * 0.015));
        parts.push(rib);
      }
    }

    // Sleek dovetail rear notch sight & front blade sight
    const rearSight = createChamferedBox(L * 0.075, slideH * 0.28, slideW * 0.64, 0.04, darkHex);
    rearSight.translate(-L * 0.41, hh + slideH * 0.11, 0);
    parts.push(rearSight);

    const frontSight = createChamferedBox(L * 0.065, slideH * 0.28, slideW * 0.2, 0.03, darkHex);
    frontSight.translate(L * 0.43, hh + slideH * 0.11, 0);
    parts.push(frontSight);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'falling_block') {
    // Heavy chamfered falling/sliding breech block with locking wedge ribs & side lever boss
    const block = createChamferedBox(L, R * 2.5, R * 2.2, R * 0.16, colorHex);
    parts.push(block);
    const guide = createChamferedBox(L * 0.82, R * 0.5, R * 2.55, R * 0.08, brightHex);
    guide.translate(0, -R * 0.45, 0);
    parts.push(guide);
    const handle = cylAlongZ(R * 0.32, R * 0.38, R * 1.9, 0.04, 18, darkHex);
    handle.translate(-L * 0.22, R * 0.4, R * 1.4);
    parts.push(handle);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  // 'rotating' & 'straight_pull': Cylindrical precision bolt body + radial locking lugs + bolt handle
  parts.push(cylAlongX(R, R, L * 0.86, R * 0.08, 26, colorHex));

  // Rear cocking shroud & visible machined firing-pin striker tail (for `?cut=1` breech richness!)
  const shroud = cylAlongX(R * 1.18, R * 1.1, L * 0.18, R * 0.08, 24, darkHex);
  shroud.translate(-L * 0.44, 0, 0);
  parts.push(shroud);

  const firingPinTail = cylAlongX(R * 0.24, R * 0.2, L * 0.26, 0.02, 14, brightHex);
  firingPinTail.translate(-L * 0.56, 0, 0);
  parts.push(firingPinTail);

  // Carrier top gas-key / op-rod boss + machined cam-pin boss for rotating gas bolts
  if (style === 'rotating') {
    const key = createChamferedBox(L * 0.56, R * 0.9, R * 1.15, R * 0.1, darkHex);
    key.translate(L * 0.04, R * 0.95, 0);
    parts.push(key);
    const camPin = createBeveledCylinder(R * 0.26, R * 0.26, R * 0.72, 0.03, 14, brightHex);
    camPin.translate(L * 0.22, R * 0.88, 0);
    parts.push(camPin);
  }

  // Multi-lug machined bolt head (6 lugs for rotating, 2 heavy lugs for straight_pull)
  const lugCount = style === 'rotating' ? 6 : 2;
  const headX = L * 0.45;
  const head = cylAlongX(R * 0.88, R * 0.88, L * 0.16, R * 0.06, 24, brightHex);
  head.translate(headX, 0, 0);
  parts.push(head);
  for (let i = 0; i < lugCount; i++) {
    const a = (i / lugCount) * Math.PI * 2;
    const lug = createChamferedBox(L * 0.1, R * 0.38, R * 0.34, 0.025, brightHex);
    lug.translate(headX, R * 0.98, 0);
    lug.rotateX(a);
    parts.push(lug);
  }

  // Swept charging handle stem + spherical tactical knob on right (+Z) side
  const stem = cylAlongZ(R * 0.26, R * 0.32, R * 2.1, 0.04, 16, darkHex);
  stem.rotateX(style === 'straight_pull' ? 0.32 : 0.08);
  stem.translate(-L * 0.24, -R * 0.12, R * 1.55);
  parts.push(stem);

  const knob = new THREE.SphereGeometry(R * 0.56, 18, 12);
  paintGeometry(knob, darkHex);
  knob.translate(-L * 0.24, style === 'straight_pull' ? -R * 0.46 : -R * 0.18, R * 2.65);
  parts.push(knob);

  return finalizeClean(parts, Math.PI / 5.2);
}

// =============================================================================
// 4. Sculpted Handguard & Shroud Builder
// =============================================================================

export function buildHandguardGeo(
  len: number,
  height: number,
  width: number,
  colorHex: string,
  style: HandguardStyle
): THREE.BufferGeometry {
  const L = clampPos(len, 22);
  const H = clampPos(height, 4.2);
  const W = clampPos(width, 3.8);
  const hw = W * 0.5;
  const hh = H * 0.5;
  const accentHex = shadeHex(colorHex, 0.78);
  const brightHex = shadeHex(colorHex, 1.15);
  const parts: THREE.BufferGeometry[] = [];

  if (style === 'ventilated_tube') {
    // Perforated blued/parkerized dark steel barrel cooling jacket (PPSh-41 / DP-28 / M2HB / SPAS-12)
    const r = Math.min(hw, hh);
    const ventDark = '#222730';
    parts.push(cylAlongX(r, r * 0.94, L, r * 0.08, 28, colorHex));
    // Rear receiver mounting collar & reinforced muzzle shroud ring
    const rearCollar = cylAlongX(r * 1.1, r * 1.06, Math.min(1.6, L * 0.1), 0.05, 24, accentHex);
    rearCollar.translate(-L * 0.45, 0, 0);
    parts.push(rearCollar);
    const frontCollar = cylAlongX(r * 1.08, r * 1.02, Math.min(1.5, L * 0.09), 0.05, 24, accentHex);
    frontCollar.translate(L * 0.46, 0, 0);
    parts.push(frontCollar);

    const slotCols = Math.min(10, Math.max(5, Math.floor(L / 2.3)));
    for (let i = 0; i < slotCols; i++) {
      const rx = -L * 0.36 + (i / Math.max(1, slotCols - 1)) * (L * 0.72);
      // Side oval/rectangular cooling perforation recesses + upper staggered slots
      for (const side of [-1, 1] as const) {
        const sideVent = createChamferedBox(
          Math.min(1.25, (L * 0.54) / slotCols),
          r * 0.42,
          r * 0.2,
          0.03,
          ventDark
        );
        sideVent.translate(rx, 0, side * (r * 0.94));
        parts.push(sideVent);

        const upperVent = createChamferedBox(
          Math.min(1.05, (L * 0.46) / slotCols),
          r * 0.24,
          r * 0.34,
          0.025,
          ventDark
        );
        upperVent.translate(rx, r * 0.74, side * (r * 0.56));
        upperVent.rotateX(side * 0.65);
        parts.push(upperVent);
      }
      if (i % 2 === 0) {
        const ribBand = cylAlongX(r * 1.03, r * 1.03, 0.28, 0.03, 22, accentHex);
        ribBand.translate(rx + (L * 0.36) / slotCols, 0, 0);
        parts.push(ribBand);
      }
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'quad_rail') {
    const oct: Array<[number, number]> = [
      [-hw * 0.62, -hh],
      [hw * 0.62, -hh],
      [hw, -hh * 0.58],
      [hw, hh * 0.58],
      [hw * 0.62, hh],
      [-hw * 0.62, hh],
      [-hw, hh * 0.58],
      [-hw, -hh * 0.58],
    ];
    parts.push(extrudeProfileZYAlongX(oct, L, 0.1, colorHex, 2));
    // Top & bottom Picatinny rail crests + side tactical rail strips
    const topRail = createMilStdPicatinnyRail(
      L * 0.94,
      -L * 0.47,
      hh + 0.58,
      Math.min(2.12, W * 0.62),
      accentHex
    );
    parts.push(topRail);
    const botRail = createChamferedBox(L * 0.88, 0.42, W * 0.44, 0.05, accentHex);
    botRail.translate(0, -hh - 0.16, 0);
    parts.push(botRail);
    for (const side of [-1, 1] as const) {
      const sideRail = createChamferedBox(L * 0.84, H * 0.28, 0.32, 0.05, brightHex);
      sideRail.translate(0, 0, side * (hw + 0.1));
      parts.push(sideRail);
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'ribbed_historical') {
    // Sleek pre-1990 contoured historical composite/steel forend w/ horizontal heat vents (ZERO Picatinny!)
    const prof: Array<[number, number]> = [
      [-hw * 0.68, hh * 0.88],
      [hw * 0.68, hh * 0.88],
      [hw, hh * 0.28],
      [hw * 0.94, -hh * 0.56],
      [hw * 0.54, -hh],
      [-hw * 0.54, -hh],
      [-hw * 0.94, -hh * 0.56],
      [-hw, hh * 0.28],
    ];
    parts.push(extrudeProfileZYAlongX(prof, L, 0.15, colorHex, 3));
    const ventCols = Math.min(7, Math.max(4, Math.floor(L / 3.0)));
    for (let i = 0; i < ventCols; i++) {
      const vx = -L * 0.34 + (i / Math.max(1, ventCols - 1)) * (L * 0.68);
      for (const side of [-1, 1] as const) {
        const rib = createChamferedBox(
          Math.min(1.15, (L * 0.46) / ventCols),
          H * 0.2,
          0.18,
          0.03,
          accentHex
        );
        rib.translate(vx, H * 0.18, side * (hw + 0.04));
        parts.push(rib);
      }
    }
    const frontCap = createChamferedBox(1.1, H * 0.96, W * 0.94, 0.06, accentHex);
    frontCap.translate(L * 0.47, 0, 0);
    parts.push(frontCap);
    return finalizeClean(parts, Math.PI / 4.8);
  }

  if (style === 'triangular_retro') {
    // Classic Colt M16A1 triangular tapered handguard w/ longitudinal cooling ribs & delta slip ring
    const tri: Array<[number, number]> = [
      [-hw * 0.42, hh],
      [hw * 0.42, hh],
      [hw, -hh * 0.45],
      [hw * 0.68, -hh],
      [-hw * 0.68, -hh],
      [-hw, -hh * 0.45],
    ];
    parts.push(extrudeProfileZYAlongX(tri, L, 0.14, colorHex, 3));
    // Sculpted longitudinal grip flutes + upper cooling vent strip along M16A1 triangular flanks
    const ventDark = '#2b313c';
    for (const side of [-1, 1] as const) {
      const rib = createChamferedBox(L * 0.78, H * 0.14, 0.16, 0.03, accentHex);
      rib.translate(0, -hh * 0.22, side * (hw * 0.88));
      parts.push(rib);
      for (let i = 0; i < 6; i++) {
        const vx = -L * 0.34 + (i / 5) * (L * 0.68);
        const vent = createChamferedBox(L * 0.065, H * 0.12, 0.22, 0.02, ventDark);
        vent.translate(vx, hh * 0.56, side * (hw * 0.56));
        parts.push(vent);
      }
    }
    const delta = cylAlongX(hh * 1.12, hh * 0.96, Math.min(2.4, L * 0.14), 0.08, 26, accentHex);
    delta.translate(-L * 0.46, 0, 0);
    parts.push(delta);
    const cap = createChamferedBox(0.95, H * 0.92, W * 0.88, 0.06, accentHex);
    cap.translate(L * 0.48, 0, 0);
    parts.push(cap);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'walnut_forend') {
    // Contoured classic walnut wood forend w/ curved belly, finger ridges & steel barrel band
    const woodZY: Array<[number, number]> = [
      [-hw * 0.72, hh * 0.85],
      [hw * 0.72, hh * 0.85],
      [hw, hh * 0.22],
      [hw * 0.92, -hh * 0.55],
      [hw * 0.48, -hh],
      [-hw * 0.48, -hh],
      [-hw * 0.92, -hh * 0.55],
      [-hw, hh * 0.22],
    ];
    parts.push(extrudeProfileZYAlongX(woodZY, L, 0.18, colorHex, 3));
    for (const bx of [-L * 0.34, L * 0.36]) {
      const band = createChamferedBox(1.15, H * 1.06, W * 1.06, 0.07, '#434d5b');
      band.translate(bx, 0, 0);
      parts.push(band);
    }
    return finalizeClean(parts, Math.PI / 4.5);
  }

  // 'polymer_bullpup': sleek chamfered polymer bullpup shroud w/ angled lower chin & thumb rest
  const polyZY: Array<[number, number]> = [
    [-hw * 0.75, hh],
    [hw * 0.75, hh],
    [hw, hh * 0.35],
    [hw * 0.88, -hh * 0.65],
    [hw * 0.55, -hh],
    [-hw * 0.55, -hh],
    [-hw * 0.88, -hh * 0.65],
    [-hw, hh * 0.35],
  ];
  parts.push(extrudeProfileZYAlongX(polyZY, L, 0.14, colorHex, 3));
  const chin = createChamferedBox(L * 0.78, H * 0.22, W * 0.64, 0.06, accentHex);
  chin.translate(0, -hh - H * 0.08, 0);
  parts.push(chin);
  return finalizeClean(parts, Math.PI / 5.2);
}

// =============================================================================
// 5. Ergonomic Buttstock & Pistol/Spade Grip Builder
// =============================================================================

export function buildStockAndGripGeo(
  len: number,
  height: number,
  width: number,
  colorHex: string,
  style: StockGripStyle
): THREE.BufferGeometry {
  const L = clampPos(len, 22);
  const H = clampPos(height, 11);
  const W = clampPos(width, 3.6);
  const steelHex = '#434c59';
  const rubberHex = '#323842';
  const brassHex = '#cfa247';
  const parts: THREE.BufferGeometry[] = [];

  if (style === 'walnut_rifle') {
    // Ergonomic sculpted walnut buttstock w/ smooth curved cheek comb, wrist neck & curved buttplate
    const pts: Array<[number, number]> = [
      [-L * 0.5, -H * 0.52],
      [-L * 0.12, -H * 0.34],
      [L * 0.18, -H * 0.2],
      [L * 0.38, -H * 0.34],
      [L * 0.5, -H * 0.22],
      [L * 0.5, H * 0.24],
      [L * 0.24, H * 0.28],
      [L * 0.02, H * 0.38],
      [-L * 0.44, H * 0.46],
      [-L * 0.5, H * 0.4],
    ];
    parts.push(extrudeProfileXY(pts, W, Math.min(0.36, W * 0.2), colorHex, 3));
    const buttplate = createChamferedBox(0.85, H * 0.92, W * 0.94, 0.12, steelHex);
    buttplate.translate(-L * 0.5 - 0.24, -H * 0.05, 0);
    parts.push(buttplate);
    const swivel = new THREE.TorusGeometry(0.48, 0.11, 8, 16);
    paintGeometry(swivel, steelHex);
    swivel.translate(-L * 0.36, -H * 0.46, 0);
    parts.push(swivel);
    return finalizeClean(parts, Math.PI / 4.2, 14);
  }

  if (style === 'ppsh_one_piece') {
    // Iconic 1941 PPSh-41 continuous one-piece contoured Russian birch rifle stock flowing seamlessly
    // forward right under the receiver & trigger tang (ZERO separate AK pistol grip!)
    const pts: Array<[number, number]> = [
      [-L * 0.5, -H * 0.5],
      [-L * 0.1, -H * 0.32],
      [L * 0.24, -H * 0.24],
      [L * 0.46, -H * 0.42],
      [L * 0.72, -H * 0.22],
      [L * 0.96, -H * 0.04],
      [L * 0.96, H * 0.24],
      [L * 0.52, H * 0.22],
      [L * 0.24, H * 0.24],
      [-L * 0.46, H * 0.42],
      [-L * 0.5, H * 0.38],
    ];
    parts.push(extrudeProfileXY(pts, W * 0.96, Math.min(0.36, W * 0.2), colorHex, 3));
    const buttplate = createChamferedBox(0.8, H * 0.9, W * 0.94, 0.1, steelHex);
    buttplate.translate(-L * 0.5 - 0.24, -H * 0.05, 0);
    parts.push(buttplate);
    const slingLoop = new THREE.TorusGeometry(0.46, 0.1, 8, 16);
    paintGeometry(slingLoop, steelHex);
    slingLoop.translate(-L * 0.38, -H * 0.44, 0);
    parts.push(slingLoop);
    return finalizeClean(parts, Math.PI / 4.2, 14);
  }

  if (style === 'm16a1_fixed') {
    // Iconic 1967 Colt M16A1 solid triangular fixed polymer buttstock w/ flat upper comb & sling swivel
    const pts: Array<[number, number]> = [
      [-L * 0.5, -H * 0.5],
      [L * 0.48, -H * 0.04],
      [L * 0.5, H * 0.34],
      [-L * 0.5, H * 0.38],
    ];
    parts.push(extrudeProfileXY(pts, W * 0.96, Math.min(0.28, W * 0.16), colorHex, 3));
    const pad = createChamferedBox(0.9, H * 0.9, W * 0.98, 0.12, rubberHex);
    pad.translate(-L * 0.52, -H * 0.06, 0);
    parts.push(pad);
    const swivel = new THREE.TorusGeometry(0.45, 0.1, 8, 16);
    paintGeometry(swivel, steelHex);
    swivel.translate(-L * 0.36, -H * 0.46, 0);
    parts.push(swivel);
    return finalizeClean(parts, Math.PI / 4.8);
  }

  if (style === 'straight_walnut') {
    // Classic straight-wrist American walnut shotgun/lever-action buttstock (Winchester 1887)
    const pts: Array<[number, number]> = [
      [-L * 0.5, -H * 0.5],
      [L * 0.12, -H * 0.18],
      [L * 0.5, -H * 0.12],
      [L * 0.5, H * 0.2],
      [L * 0.18, H * 0.22],
      [-L * 0.46, H * 0.38],
      [-L * 0.5, H * 0.34],
    ];
    parts.push(extrudeProfileXY(pts, W * 0.92, Math.min(0.32, W * 0.18), colorHex, 3));
    const buttplate = createChamferedBox(0.75, H * 0.88, W * 0.9, 0.1, steelHex);
    buttplate.translate(-L * 0.5 - 0.22, -H * 0.06, 0);
    parts.push(buttplate);
    return finalizeClean(parts, Math.PI / 4.2);
  }

  if (style === 'dragunov_thumbhole') {
    // Iconic SVD Dragunov open skeletonized laminated-birch thumbhole stock + snap-on leather cheek pad
    const topStrut = createChamferedBox(L * 0.96, H * 0.19, W * 0.82, 0.12, colorHex);
    topStrut.rotateZ(-0.04);
    topStrut.translate(0, H * 0.32, 0);
    parts.push(topStrut);

    // Lower diagonal tension bar sweeping cleanly from buttplate toe to pistol grip heel
    const botLen = Math.hypot(L * 0.88, H * 0.26);
    const botAngle = Math.atan2(H * 0.18, L * 0.88);
    const botStrut = createChamferedBox(botLen, H * 0.17, W * 0.78, 0.1, colorHex);
    botStrut.rotateZ(botAngle);
    botStrut.translate(0.15, -H * 0.32, 0);
    parts.push(botStrut);

    // Rear solid vertical buttstock pillar framing the wide open thumbhole cutout
    const rearPillar = createChamferedBox(L * 0.19, H * 0.88, W * 0.9, 0.12, colorHex);
    rearPillar.translate(-L * 0.4, -H * 0.02, 0);
    parts.push(rearPillar);

    // Forward receiver wrist pillar & integrated thumbhole bridge
    const frontBridge = createChamferedBox(L * 0.2, H * 0.78, W * 0.86, 0.1, colorHex);
    frontBridge.rotateZ(0.2);
    frontBridge.translate(L * 0.4, -H * 0.08, 0);
    parts.push(frontBridge);

    // Snap-on SVD leather & steel cheek rest perched atop the upper comb
    const cheekPad = createChamferedBox(L * 0.44, H * 0.22, W * 0.98, 0.16, '#2b2420');
    cheekPad.translate(-L * 0.04, H * 0.48, 0);
    parts.push(cheekPad);

    const buttplate = createChamferedBox(0.85, H * 0.92, W * 0.94, 0.1, steelHex);
    buttplate.translate(-L * 0.51, -H * 0.02, 0);
    parts.push(buttplate);
    return finalizeClean(parts, Math.PI / 4.4);
  }

  if (style === 'spas12_top_fold') {
    // Iconic Franchi SPAS-12 perforated stamped-steel top-folding buttstock + J-shaped arm hook
    const darkSteel = '#2d343e';
    const holeDark = '#222730';
    // Rear receiver folding hinge mount
    const hinge = createChamferedBox(1.8, H * 0.38, W * 0.86, 0.08, steelHex);
    hinge.translate(L * 0.45, H * 0.22, 0);
    parts.push(hinge);

    // Main perforated stamped-steel U-channel arm sloping slightly down to buttpad
    const strutLen = L * 0.92;
    const strut = createChamferedBox(strutLen, H * 0.19, W * 0.72, 0.07, darkSteel);
    strut.rotateZ(0.08);
    strut.translate(0, H * 0.18, 0);
    parts.push(strut);

    // 7 iconic SPAS-12 circular lightening perforations along the steel strut flanks
    for (let i = 0; i < 7; i++) {
      const hx = -L * 0.34 + (i / 6) * (L * 0.68);
      const hy = H * 0.18 + hx * Math.sin(0.08);
      const hole = cylAlongZ(H * 0.06, H * 0.06, W * 0.76, 0.015, 14, holeDark);
      hole.translate(hx, hy, 0);
      parts.push(hole);
    }

    // Folding steel buttplate vertical bar + ribbed rubber recoil pad
    const plate = createChamferedBox(1.05, H * 0.88, W * 0.84, 0.1, darkSteel);
    plate.translate(-L * 0.45, -H * 0.12, 0);
    parts.push(plate);
    const pad = createChamferedBox(0.7, H * 0.82, W * 0.88, 0.08, rubberHex);
    pad.translate(-L * 0.51, -H * 0.12, 0);
    parts.push(pad);

    // Signature curved J-shaped rotating steel arm-hook extending forward from lower buttplate
    const hookArm = createChamferedBox(L * 0.34, H * 0.12, W * 0.32, 0.05, steelHex);
    hookArm.translate(-L * 0.28, -H * 0.5, 0);
    parts.push(hookArm);
    const hookCurve = createChamferedBox(L * 0.14, H * 0.22, W * 0.32, 0.05, steelHex);
    hookCurve.rotateZ(0.45);
    hookCurve.translate(-L * 0.1, -H * 0.44, 0);
    parts.push(hookCurve);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'crossbow_thumbhole') {
    // Sleek sculpted tactical thumbhole crossbow buttstock (Excalibur Assassin)
    const upperComb = createChamferedBox(L * 0.94, H * 0.24, W * 0.94, 0.14, colorHex);
    upperComb.translate(0, H * 0.28, 0);
    parts.push(upperComb);
    const cheek = createChamferedBox(L * 0.48, H * 0.16, W * 1.0, 0.12, rubberHex);
    cheek.translate(-L * 0.06, H * 0.44, 0);
    parts.push(cheek);
    const lowerStrut = createChamferedBox(L * 0.82, H * 0.18, W * 0.78, 0.1, colorHex);
    lowerStrut.rotateZ(0.16);
    lowerStrut.translate(-L * 0.04, -H * 0.32, 0);
    parts.push(lowerStrut);
    const rearCol = createChamferedBox(L * 0.22, H * 0.86, W * 0.94, 0.12, colorHex);
    rearCol.translate(-L * 0.38, -H * 0.04, 0);
    parts.push(rearCol);
    const pad = createChamferedBox(1.1, H * 0.92, W * 1.02, 0.12, rubberHex);
    pad.translate(-L * 0.5, -H * 0.04, 0);
    parts.push(pad);
    return finalizeClean(parts, Math.PI / 5.0);
  }

  if (style === 'lever_loop') {
    // Iconic Winchester 1887 / lever-action curved blued-steel finger-loop lever (NO vertical pistol grip!)
    const loopL = Math.max(L * 2.15, 7.6);
    const loopH = Math.max(H * 0.42, 3.0);
    const barT = Math.max(0.46, W * 0.18);
    // Shift upward so the loop hugs the underside of the straight walnut wrist cleanly
    const yShift = H * 0.28;

    const topTang = createChamferedBox(loopL * 0.92, barT, W * 0.56, 0.06, colorHex);
    topTang.rotateZ(0.08);
    topTang.translate(-loopL * 0.1, yShift + loopH * 0.46, 0);
    parts.push(topTang);

    const botBow = createChamferedBox(loopL * 0.86, barT * 1.05, W * 0.58, 0.07, colorHex);
    botBow.rotateZ(0.06);
    botBow.translate(-loopL * 0.12, yShift - loopH * 0.44, 0);
    parts.push(botBow);

    const frontPivot = createChamferedBox(barT * 1.15, loopH * 0.96, W * 0.58, 0.06, steelHex);
    frontPivot.rotateZ(-0.22);
    frontPivot.translate(loopL * 0.32, yShift, 0);
    parts.push(frontPivot);

    const rearCurve = createChamferedBox(barT * 1.15, loopH * 0.92, W * 0.56, 0.08, colorHex);
    rearCurve.rotateZ(0.24);
    rearCurve.translate(-loopL * 0.52, yShift - loopH * 0.04, 0);
    parts.push(rearCurve);

    const tailSpur = createChamferedBox(loopL * 0.26, barT * 0.85, W * 0.48, 0.05, steelHex);
    tailSpur.rotateZ(0.16);
    tailSpur.translate(-loopL * 0.66, yShift + loopH * 0.28, 0);
    parts.push(tailSpur);

    return finalizeClean(parts, Math.PI / 5.0);
  }

  if (style === 'folding_skeleton') {
    const topStrut = createChamferedBox(L * 0.94, H * 0.16, W * 0.55, 0.06, colorHex);
    topStrut.translate(0, H * 0.32, 0);
    parts.push(topStrut);

    const botLen = Math.hypot(L * 0.92, H * 0.58);
    const botAngle = Math.atan2(H * 0.58, L * 0.92);
    const botStrut = createChamferedBox(botLen, H * 0.15, W * 0.52, 0.06, colorHex);
    botStrut.rotateZ(botAngle);
    botStrut.translate(0, -H * 0.06, 0);
    parts.push(botStrut);

    const pad = createChamferedBox(1.2, H * 0.88, W * 0.85, 0.1, rubberHex);
    pad.translate(-L * 0.46, -H * 0.02, 0);
    parts.push(pad);

    const hinge = cylAlongX(H * 0.2, H * 0.2, 1.8, 0.06, 20, steelHex);
    hinge.rotateZ(Math.PI / 2);
    hinge.translate(L * 0.46, H * 0.22, 0);
    parts.push(hinge);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'telescoping_ar') {
    const buffer = cylAlongX(W * 0.42, W * 0.42, L * 0.92, 0.06, 24, steelHex);
    buffer.translate(L * 0.04, H * 0.22, 0);
    parts.push(buffer);

    const pts: Array<[number, number]> = [
      [-L * 0.48, -H * 0.48],
      [L * 0.18, -H * 0.28],
      [L * 0.32, H * 0.06],
      [L * 0.32, H * 0.44],
      [-L * 0.48, H * 0.44],
    ];
    parts.push(extrudeProfileXY(pts, W * 0.96, 0.16, colorHex, 2));

    const pad = createChamferedBox(1.1, H * 0.94, W * 0.98, 0.12, rubberHex);
    pad.translate(-L * 0.5, -H * 0.02, 0);
    parts.push(pad);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'bullpup_stock') {
    const pts: Array<[number, number]> = [
      [-L * 0.5, -H * 0.48],
      [L * 0.46, -H * 0.36],
      [L * 0.5, H * 0.38],
      [-L * 0.5, H * 0.48],
    ];
    parts.push(extrudeProfileXY(pts, W, Math.min(0.24, W * 0.14), colorHex, 3));
    const cheek = createChamferedBox(L * 0.62, H * 0.18, W * 0.92, 0.12, shadeHex(colorHex, 1.12));
    cheek.translate(-L * 0.08, H * 0.46, 0);
    parts.push(cheek);
    const pad = createChamferedBox(1.3, H * 0.96, W * 1.02, 0.14, rubberHex);
    pad.translate(-L * 0.52, 0, 0);
    parts.push(pad);
    return finalizeClean(parts, Math.PI / 4.8);
  }

  if (style === 'broomhandle_grip') {
    // Iconic Mauser C96 rounded ribbed wooden broomhandle grip (10 carved grip grooves) + lanyard ring pommel
    const gripL = Math.max(H, 9.2);
    const rTop = Math.min(L, W) * 0.44;
    const rBot = rTop * 1.2;
    const prof: Array<[number, number]> = [
      [0, -gripL * 0.5],
      [rBot * 0.85, -gripL * 0.5],
      [rBot, -gripL * 0.42],
    ];
    // 10 distinct horizontal broomhandle wooden grip grooves sculpted into the revolved lathe profile
    const grooves = 10;
    for (let i = 0; i < grooves; i++) {
      const t0 = i / grooves;
      const tMid = (i + 0.5) / grooves;
      const y0 = -gripL * 0.36 + t0 * (gripL * 0.72);
      const yMid = -gripL * 0.36 + tMid * (gripL * 0.72);
      const rOuter = rBot * (1 - t0) + rTop * t0;
      const rIn = (rBot * (1 - tMid) + rTop * tMid) * 0.89;
      prof.push([rOuter, y0], [rIn, yMid]);
    }
    prof.push([rTop, gripL * 0.44], [rTop * 0.82, gripL * 0.5], [0, gripL * 0.5]);
    const body = buildRevolvedAlongX(prof, 24, colorHex);
    body.rotateZ(Math.PI / 2 - 0.24);
    parts.push(body);

    const ferrule = createBeveledCylinder(rBot * 0.94, rBot * 0.86, 0.75, 0.08, 22, steelHex);
    ferrule.rotateZ(-0.24);
    ferrule.translate(-Math.sin(0.24) * gripL * 0.47, -Math.cos(0.24) * gripL * 0.47, 0);
    parts.push(ferrule);

    const ring = new THREE.TorusGeometry(rBot * 0.42, rBot * 0.1, 12, 20);
    paintGeometry(ring, steelHex);
    ring.translate(-Math.sin(0.24) * gripL * 0.55, -Math.cos(0.24) * gripL * 0.57, 0);
    parts.push(ring);
    return finalizeClean(parts, Math.PI / 4.2, 8);
  }

  if (style === 'plowhandle_grip') {
    // Iconic Colt SAA 1873 swept Single-Action curved plowhandle walnut grip w/ brass/steel backstrap
    const pts: Array<[number, number]> = [
      [-L * 0.72, -H * 0.5],
      [-L * 0.06, -H * 0.46],
      [L * 0.16, -H * 0.1],
      [L * 0.44, H * 0.48],
      [-L * 0.04, H * 0.48],
      [-L * 0.34, H * 0.14],
      [-L * 0.62, -H * 0.16],
    ];
    parts.push(extrudeProfileXY(pts, W * 0.88, Math.min(0.28, W * 0.2), colorHex, 3));
    const strap = extrudeProfileXY(
      [
        [-L * 0.76, -H * 0.52],
        [-L * 0.64, -H * 0.52],
        [-L * 0.54, -H * 0.14],
        [-L * 0.28, H * 0.14],
        [0, H * 0.48],
        [-L * 0.12, H * 0.48],
        [-L * 0.4, H * 0.14],
        [-L * 0.66, -H * 0.16],
      ],
      W * 0.56,
      0.06,
      steelHex,
      2
    );
    parts.push(strap);
    return finalizeClean(parts, Math.PI / 4.2);
  }

  if (style === 'spade_grips') {
    // Heavy twin-grip M2HB / rotary backplate + twin knurled rubber vertical handles + butterfly trigger
    const backplate = createChamferedBox(Math.max(1.4, L * 0.22), H * 0.82, W * 0.96, 0.12, steelHex);
    backplate.translate(L * 0.36, 0, 0);
    parts.push(backplate);

    const handleSpanZ = Math.max(W * 0.72, 4.8);
    for (const side of [-1, 1] as const) {
      const armTop = createChamferedBox(L * 0.66, H * 0.14, W * 0.18, 0.06, steelHex);
      armTop.translate(0, H * 0.34, side * handleSpanZ * 0.45);
      parts.push(armTop);
      const armBot = createChamferedBox(L * 0.62, H * 0.14, W * 0.18, 0.06, steelHex);
      armBot.translate(0, -H * 0.34, side * handleSpanZ * 0.45);
      parts.push(armBot);
      const handle = createBeveledCylinder(
        Math.max(0.85, W * 0.14),
        Math.max(0.92, W * 0.15),
        H * 0.84,
        0.1,
        24,
        rubberHex
      );
      handle.translate(-L * 0.34, 0, side * handleSpanZ * 0.56);
      parts.push(handle);
    }
    const triggerPaddle = createChamferedBox(L * 0.16, H * 0.26, W * 0.42, 0.05, brassHex);
    triggerPaddle.translate(-L * 0.36, H * 0.18, 0);
    parts.push(triggerPaddle);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  // 'pistol_grip': contoured ergonomic angled pistol grip w/ palm-swell backstrap,
  // sweeping beavertail tang, curved front finger-grooves & flared base cap
  const pts: Array<[number, number]> = [
    [-L * 0.52, -H * 0.5],
    [L * 0.14, -H * 0.48],
    [L * 0.24, -H * 0.22],
    [L * 0.36, 0],
    [L * 0.34, H * 0.24],
    [L * 0.46, H * 0.48],
    [-L * 0.36, H * 0.5],
    [-L * 0.24, H * 0.3],
    [-L * 0.38, H * 0.04],
    [-L * 0.48, -H * 0.22],
  ];
  parts.push(extrudeProfileXY(pts, W, Math.min(0.28, W * 0.2), colorHex, 3));
  // Subtle recessed checkered grip side panels on both flanks
  for (const side of [-1, 1] as const) {
    const panel = extrudeProfileXY(
      [
        [-L * 0.38, -H * 0.38],
        [L * 0.08, -H * 0.36],
        [L * 0.24, H * 0.28],
        [-L * 0.18, H * 0.32],
      ],
      W * 0.12,
      0.04,
      shadeHex(colorHex, 0.9),
      2
    );
    panel.translate(0, 0, side * (W * 0.48));
    parts.push(panel);
  }
  const baseCap = createChamferedBox(L * 0.7, H * 0.09, W * 1.04, 0.06, steelHex);
  baseCap.translate(-L * 0.19, -H * 0.49, 0);
  parts.push(baseCap);
  return finalizeClean(parts, Math.PI / 4.2, 4.5);
}

// =============================================================================
// 6. Magazine, Drum, Pan, Helical Tube, Belt Tray & Stripper Clip Builder
// =============================================================================

export function buildMagazineGeo(
  style: MagazineStyle,
  height: number,
  width: number,
  thickness: number,
  colorHex: string
): THREE.BufferGeometry {
  const H = clampPos(height, 16);
  const W = clampPos(width, 6.2);
  const T = clampPos(thickness, 2.4);
  const accentHex = shadeHex(colorHex, 0.8);
  const brassHex = '#d4a648';
  const copperHex = '#c86c36';
  const parts: THREE.BufferGeometry[] = [];

  if (style === 'drum_71') {
    // Iconic PPSh-41 71-round circular drum magazine w/ central winding key & top feed tower
    const r = Math.max(H, W) * 0.46;
    const drum = cylAlongX(r, r, T * 1.15, Math.min(0.18, T * 0.12), 36, colorHex);
    parts.push(drum);
    const lip = cylAlongX(r * 0.9, r * 0.9, T * 1.24, 0.08, 32, accentHex);
    parts.push(lip);
    const key = createChamferedBox(T * 1.45, r * 0.42, r * 0.18, 0.04, '#8d96a3');
    parts.push(key);
    const tower = createChamferedBox(T * 0.85, r * 0.56, r * 0.42, 0.06, accentHex);
    tower.translate(0, r * 0.92, 0);
    parts.push(tower);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'pan_47') {
    // Iconic DP-28 flat top 47-round horizontal pan magazine
    const r = Math.max(W, H) * 0.55;
    const panH = Math.max(T, 2.6);
    parts.push(createBeveledCylinder(r * 0.95, r, panH, panH * 0.12, 36, colorHex));
    const hub = createBeveledCylinder(r * 0.28, r * 0.34, panH * 1.38, 0.08, 24, accentHex);
    parts.push(hub);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const flute = createChamferedBox(r * 0.62, panH * 0.18, r * 0.08, 0.03, accentHex);
      flute.translate(r * 0.55, panH * 0.48, 0);
      flute.rotateY(a);
      parts.push(flute);
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'helical_64') {
    // Iconic PP-19 Bizon under-barrel compact cylindrical 64-round helical magazine
    const tubeL = Math.max(H, W, 15.5);
    const tubeR = Math.min(1.52, Math.max(1.18, T * 0.42));
    const yDrop = -0.28;
    const body = cylAlongX(tubeR, tubeR * 0.96, tubeL, tubeR * 0.1, 28, colorHex);
    body.translate(0, yDrop, 0);
    parts.push(body);
    for (let i = 0; i < 6; i++) {
      const rx = -tubeL * 0.38 + (i / 5) * (tubeL * 0.76);
      const ring = cylAlongX(tubeR * 1.05, tubeR * 1.05, 0.28, 0.035, 24, accentHex);
      ring.translate(rx, yDrop, 0);
      parts.push(ring);
    }
    const rearCollar = cylAlongX(tubeR * 1.08, tubeR * 1.04, 0.9, 0.05, 24, accentHex);
    rearCollar.translate(-tubeL * 0.48, yDrop, 0);
    parts.push(rearCollar);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'belt_tray') {
    // Heavy belt feed tray + prominent cascading row of 10 linked brass cartridges draped outward
    const tray = createChamferedBox(W * 1.05, H * 0.24, T * 1.45, 0.08, colorHex);
    tray.translate(0, H * 0.16, 0);
    parts.push(tray);

    const roundCount = 10;
    const roundR = Math.max(0.42, Math.min(0.76, H * 0.095));
    const spacing = roundR * 2.38;
    for (let i = 0; i < roundCount; i++) {
      // Drape belt outward along -Z (visible on both ISO & feed side) with gravity catenary drop
      const u = i / (roundCount - 1);
      const rz = T * 0.45 - i * spacing * 0.86;
      const ry = -Math.pow(u, 1.55) * (H * 1.45);
      const roll = u * 0.48;
      const casing = cylAlongX(roundR, roundR * 0.8, W * 0.72, 0.03, 14, brassHex);
      casing.rotateX(roll);
      casing.translate(-W * 0.1, ry, rz);
      parts.push(casing);
      const bullet = cylAlongX(roundR * 0.72, 0.06, W * 0.38, 0.02, 14, copperHex);
      bullet.rotateX(roll);
      bullet.translate(W * 0.42, ry, rz);
      parts.push(bullet);
      const link = cylAlongX(roundR * 1.12, roundR * 1.12, W * 0.26, 0.02, 12, '#343c46');
      link.rotateX(roll);
      link.translate(-W * 0.06, ry, rz);
      parts.push(link);
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'tubular') {
    // Horizontal under-barrel tubular shotgun/lever-gun magazine
    const tubeL = Math.max(H, W, 24);
    const tubeR = Math.max(0.85, T * 0.48);
    parts.push(cylAlongX(tubeR, tubeR, tubeL, 0.05, 24, colorHex));
    const cap = cylAlongX(tubeR * 1.18, tubeR * 1.12, 1.4, 0.06, 22, accentHex);
    cap.translate(tubeL * 0.5, 0, 0);
    parts.push(cap);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'top_clip') {
    // Stripper / Bofors 40mm 4-round charger clip holding gleaming brass cartridges
    const clipBar = createChamferedBox(W * 0.36, H * 0.88, T * 0.52, 0.05, colorHex);
    clipBar.translate(-W * 0.38, 0, 0);
    parts.push(clipBar);
    const rCount = 4;
    const roundR = Math.max(0.42, (H * 0.72) / (rCount * 2.4));
    for (let i = 0; i < rCount; i++) {
      const ry = -H * 0.32 + (i / (rCount - 1)) * (H * 0.64);
      const shell = cylAlongX(roundR, roundR * 0.82, W * 0.72, 0.03, 16, brassHex);
      shell.translate(-W * 0.04, ry, 0);
      parts.push(shell);
      const tip = cylAlongX(roundR * 0.76, 0.08, W * 0.36, 0.02, 16, copperHex);
      tip.translate(W * 0.48, ry, 0);
      parts.push(tip);
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'curved_banana') {
    // Multi-station swept curved banana magazine w/ stamped steel vertical reinforcing ribs
    // (Dedicated flush toe floorplate is supplied by the `mag_base` BOM slot!)
    const segs = 6;
    const sweepX = H * 0.24;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = H * 0.5 - t * H;
      const cx = t * t * sweepX;
      pts.push([cx + W * 0.5, y]);
    }
    for (let i = segs; i >= 0; i--) {
      const t = i / segs;
      const y = H * 0.5 - t * H;
      const cx = t * t * sweepX;
      pts.push([cx - W * 0.5, y]);
    }
    parts.push(extrudeProfileXY(pts, T, Math.min(0.14, T * 0.1), colorHex, 2));

    // Stamped steel longitudinal reinforcing spine & side flank ribs (iconic AK-47 / StG 44 detail)
    const ribOffsets = [-W * 0.24, 0, W * 0.24];
    for (const side of [-1, 1] as const) {
      for (const rxOff of ribOffsets) {
        for (let i = 0; i < 3; i++) {
          const tMid = 0.22 + i * 0.26;
          const yMid = H * 0.5 - tMid * H;
          const cxMid = tMid * tMid * sweepX;
          const slopeAngle = Math.atan2(2 * tMid * sweepX, H);
          const rib = createChamferedBox(
            Math.max(0.24, W * 0.08),
            H * 0.22,
            T * 0.08,
            0.02,
            accentHex
          );
          rib.rotateZ(slopeAngle);
          rib.translate(cxMid + rxOff, yMid, side * (T * 0.5));
          parts.push(rib);
        }
      }
    }

    // Rear locking lug & front magazine catch boss at upper feed lip
    const rearLug = createChamferedBox(W * 0.24, H * 0.08, T * 0.72, 0.03, accentHex);
    rearLug.translate(-W * 0.52, H * 0.36, 0);
    parts.push(rearLug);

    // Top visible brass cartridge crown
    const topRd = cylAlongX(T * 0.26, T * 0.22, W * 0.82, 0.02, 14, brassHex);
    topRd.translate(0, H * 0.5 + T * 0.14, 0);
    parts.push(topRd);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  // 'straight_box': chamfered straight double-stack box magazine w/ ribs & floorplate
  const body = createChamferedBox(W, H, T, Math.min(0.12, T * 0.09), colorHex);
  parts.push(body);
  for (const side of [-1, 1] as const) {
    const rib = createChamferedBox(W * 0.24, H * 0.74, T * 0.12, 0.03, accentHex);
    rib.translate(0, -H * 0.04, side * (T * 0.5));
    parts.push(rib);
  }
  const floor = createChamferedBox(W * 1.12, Math.min(1.0, H * 0.07), T * 1.14, 0.06, accentHex);
  floor.translate(0, -H * 0.5, 0);
  parts.push(floor);
  const topRd = cylAlongX(T * 0.24, T * 0.2, W * 0.8, 0.02, 14, brassHex);
  topRd.translate(0, H * 0.5 + T * 0.12, 0);
  parts.push(topRd);
  return finalizeClean(parts, Math.PI / 5.2);
}

// =============================================================================
// 7. Tactical Scope, PSO-1, Carry Handle & Folding Tangent Sight Builder
// =============================================================================

export function buildOpticAndSightGeo(
  style: OpticSightStyle,
  len: number,
  colorHex: string
): THREE.BufferGeometry {
  const L = clampPos(len, 24);
  const accentHex = shadeHex(colorHex, 1.22);
  // Subtle dark multi-coated anti-reflective lens sheen strictly on recessed glass faces
  const lensHex = '#16332c';
  const parts: THREE.BufferGeometry[] = [];

  if (style === 'carry_handle') {
    // Elevated arched iron carry handle (M16A1 / FAMAS) w/ open tunnel & rear peep drum
    const h = Math.max(3.6, L * 0.2);
    const w = 2.4;
    const topBar = createChamferedBox(L, 0.92, w, 0.1, colorHex);
    topBar.translate(0, h, 0);
    parts.push(topBar);

    const rearPost = createChamferedBox(L * 0.18, h, w * 0.92, 0.08, colorHex);
    rearPost.translate(-L * 0.41, h * 0.5, 0);
    parts.push(rearPost);

    const frontPost = createChamferedBox(L * 0.16, h, w * 0.88, 0.08, colorHex);
    frontPost.translate(L * 0.42, h * 0.5, 0);
    parts.push(frontPost);

    const base = createChamferedBox(L * 0.96, 0.6, w * 0.96, 0.06, accentHex);
    parts.push(base);

    const windageDrum = cylAlongZ(0.55, 0.55, 0.7, 0.05, 18, accentHex);
    windageDrum.translate(-L * 0.4, h + 0.15, w * 0.58);
    parts.push(windageDrum);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'folding_tangent') {
    // Graduated blued/parkerized iron tangent rear sight leaf + protective side ears
    const base = createChamferedBox(L, 0.72, 2.0, 0.07, colorHex);
    parts.push(base);
    const leaf = createChamferedBox(L * 0.76, 0.42, 1.32, 0.05, accentHex);
    leaf.rotateZ(0.14);
    leaf.translate(-L * 0.04, 0.58, 0);
    parts.push(leaf);
    const slider = createChamferedBox(L * 0.2, 0.68, 1.72, 0.05, '#68717e');
    slider.translate(L * 0.08, 0.62, 0);
    parts.push(slider);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  // 'tactical_scope' & 'pso1_soviet'
  const rMain = Math.max(1.22, L * 0.056);
  const rObj = rMain * (style === 'pso1_soviet' ? 1.24 : 1.5);
  const rOc = rMain * 1.3;
  const halfL = L * 0.5;

  const tubeProf: Array<[number, number]> = [
    [0, -halfL + 0.3],
    [rOc * 0.84, -halfL + 0.3],
    [rOc * 0.84, -halfL],
    [rOc, -halfL],
    [rOc, -halfL * 0.55],
    [rMain * 1.12, -halfL * 0.4],
    [rMain, -halfL * 0.34],
    [rMain, halfL * 0.32],
    [rObj, halfL * 0.56],
    [rObj, halfL],
    [rObj * 0.86, halfL],
    [rObj * 0.86, halfL - 0.8],
    [0, halfL - 0.8],
  ];
  parts.push(buildRevolvedAlongX(tubeProf, 28, colorHex));

  // Subtle dark-teal multi-coated convex objective & ocular lenses recessed deep inside scope bells
  const objLens = cylAlongX(rObj * 0.8, rObj * 0.76, 0.3, 0.05, 24, lensHex);
  objLens.translate(halfL - 0.74, 0, 0);
  parts.push(objLens);
  const ocLens = cylAlongX(rOc * 0.74, rOc * 0.78, 0.24, 0.04, 22, lensHex);
  ocLens.translate(-halfL + 0.38, 0, 0);
  parts.push(ocLens);

  // Center turret saddle + elevation & windage graduated knobs
  const saddle = createChamferedBox(rMain * 2.05, rMain * 2.25, rMain * 2.25, 0.14, colorHex);
  parts.push(saddle);
  const elevTurret = createBeveledCylinder(rMain * 0.6, rMain * 0.64, rMain * 1.12, 0.07, 22, accentHex);
  elevTurret.translate(0, rMain * 1.58, 0);
  parts.push(elevTurret);
  const windTurret = cylAlongZ(rMain * 0.54, rMain * 0.58, rMain * 1.02, 0.07, 20, accentHex);
  windTurret.translate(0, 0, rMain * 1.5);
  parts.push(windTurret);

  // Scope rings or Soviet PSO-1 offset side-dovetail mount bracket + rubber accordion eyecup
  if (style === 'pso1_soviet') {
    const arm = createChamferedBox(L * 0.44, rMain * 2.55, 1.05, 0.08, accentHex);
    arm.translate(-L * 0.06, -rMain * 1.82, -rMain * 0.42);
    parts.push(arm);
    const eyecup = cylAlongX(rOc * 0.88, rOc * 1.04, L * 0.18, 0.08, 22, '#252a32');
    eyecup.translate(-halfL - L * 0.08, 0, 0);
    parts.push(eyecup);
    const sunshade = cylAlongX(rObj * 1.02, rObj * 1.04, L * 0.12, 0.05, 24, accentHex);
    sunshade.translate(halfL + L * 0.04, 0, 0);
    parts.push(sunshade);
  } else {
    for (const rx of [-L * 0.22, L * 0.22]) {
      const ring = cylAlongX(rMain * 1.24, rMain * 1.24, 1.4, 0.06, 24, accentHex);
      ring.translate(rx, 0, 0);
      parts.push(ring);
      const foot = createChamferedBox(1.5, rMain * 1.45, 2.2, 0.08, accentHex);
      foot.translate(rx, -rMain * 1.35, 0);
      parts.push(foot);
    }
  }

  return finalizeClean(parts, Math.PI / 5.2);
}

// =============================================================================
// 8. 1:1 Main Battle Tank Heavy Armor Hull, Turret, ERA, Suspension & Autoloader
// =============================================================================

export function buildHeavyArmorHullAndTurretGeo(
  partKind: HeavyArmorPartKind,
  scale: number,
  colorHex: string,
  style: HeavyArmorStyle,
  variant?: HeavyArmorVariant
): THREE.BufferGeometry {
  const s = clampPos(scale, 100); // nominal 100 cm = 1 m scale factor (tank hull ~700 cm)
  const darkHex = shadeHex(colorHex, 0.68);
  const accentHex = shadeHex(colorHex, 1.12);
  const steelHex = '#464f5b';
  const brassHex = '#cfa247';
  const resolvedVariant: HeavyArmorVariant =
    variant ?? (style === 'mbt_wwii' ? 't34_85' : 't90m');
  const parts: THREE.BufferGeometry[] = [];

  if (partKind === 'hull') {
    // 1:1 sloped composite glacis hull tailored per MBT doctrine
    const hullL = s * 6.8;
    const hullH = s * 1.15;
    const hullW = s * 3.35;
    const pts: Array<[number, number]> =
      resolvedVariant === 't34_85'
        ? [
            [-hullL * 0.5, -hullH * 0.46],
            [hullL * 0.34, -hullH * 0.5],
            [hullL * 0.52, -hullH * 0.05],
            [hullL * 0.24, hullH * 0.5],
            [-hullL * 0.44, hullH * 0.46],
            [-hullL * 0.52, hullH * 0.08],
          ]
        : resolvedVariant === 'merkava4'
          ? [
              [-hullL * 0.5, -hullH * 0.48],
              [hullL * 0.38, -hullH * 0.5],
              [hullL * 0.54, -hullH * 0.06],
              [hullL * 0.28, hullH * 0.52],
              [-hullL * 0.48, hullH * 0.48],
              [-hullL * 0.52, hullH * 0.14],
            ]
          : [
              [-hullL * 0.5, -hullH * 0.48],
              [hullL * 0.36, -hullH * 0.5],
              [hullL * 0.52, -hullH * 0.02],
              [hullL * 0.16, hullH * 0.5],
              [-hullL * 0.48, hullH * 0.5],
              [-hullL * 0.52, hullH * 0.12],
            ];
    parts.push(extrudeProfileXY(pts, hullW, s * 0.08, colorHex, 2));

    if (resolvedVariant === 'merkava4') {
      // Signature Merkava Mk 4M FRONT-ENGINE armored radiator louvre grilles on front-right glacis
      for (let i = 0; i < 6; i++) {
        const lx = hullL * 0.08 + i * (s * 0.28);
        const slat = createChamferedBox(s * 0.14, s * 0.12, hullW * 0.42, s * 0.02, darkHex);
        slat.rotateZ(-0.18);
        slat.translate(lx, hullH * 0.52, s * 0.56);
        parts.push(slat);
      }
      // Front-left armored driver's periscope fairing
      const driverHood = createChamferedBox(s * 0.78, s * 0.26, s * 0.78, s * 0.05, accentHex);
      driverHood.translate(hullL * 0.22, hullH * 0.52, -s * 0.82);
      parts.push(driverHood);
      // Iconic rear armored twin crew egress clamshell doors
      for (const doorY of [-s * 0.16, s * 0.2]) {
        const door = createChamferedBox(s * 0.14, s * 0.32, s * 1.15, s * 0.03, darkHex);
        door.translate(-hullL * 0.51, doorY, 0);
        parts.push(door);
      }
    } else if (resolvedVariant === 't90m') {
      // T-90M Relikt glacis ERA brick arrays along sloped upper glacis
      for (let row = 0; row < 2; row++) {
        for (let col = -2; col <= 2; col++) {
          const tile = createChamferedBox(s * 0.52, s * 0.14, s * 0.54, s * 0.03, accentHex);
          tile.rotateZ(-0.56);
          tile.translate(hullL * 0.3 + row * (s * 0.42), hullH * 0.28 - row * (s * 0.24), col * (s * 0.6));
          parts.push(tile);
        }
      }
      const deck = createChamferedBox(hullL * 0.34, hullH * 0.12, hullW * 0.78, s * 0.03, darkHex);
      deck.translate(-hullL * 0.28, hullH * 0.52, 0);
      parts.push(deck);
      const driverHood = createChamferedBox(s * 0.7, s * 0.22, s * 0.72, s * 0.05, accentHex);
      driverHood.translate(hullL * 0.18, hullH * 0.52, 0);
      parts.push(driverHood);
    } else {
      // Rear engine deck louvered radiator grilles + driver hatch hood (T-34-85 / Challenger 2)
      const deck = createChamferedBox(hullL * 0.34, hullH * 0.12, hullW * 0.78, s * 0.03, darkHex);
      deck.translate(-hullL * 0.28, hullH * 0.52, 0);
      parts.push(deck);
      const driverHood = createChamferedBox(s * 0.72, s * 0.24, s * 0.76, s * 0.05, accentHex);
      driverHood.translate(
        hullL * 0.22,
        hullH * 0.52,
        resolvedVariant === 't34_85' ? -s * 0.55 : 0
      );
      parts.push(driverHood);
      if (resolvedVariant === 't34_85') {
        // WWII bow hull-mounted DT-29 coaxial ball machine-gun mantlet on right glacis
        const bowMg = createBeveledCylinder(s * 0.22, s * 0.26, s * 0.26, s * 0.04, 18, steelHex);
        bowMg.rotateZ(-Math.PI / 2 - 0.55);
        bowMg.translate(hullL * 0.36, hullH * 0.18, s * 0.65);
        parts.push(bowMg);
      }
    }
    // Front & rear forged steel tow shackles + armored blackout headlamps on hull glacis
    for (const side of [-1, 1] as const) {
      const shackleF = new THREE.TorusGeometry(s * 0.12, s * 0.032, 8, 16);
      paintGeometry(shackleF, steelHex);
      shackleF.rotateY(Math.PI / 2);
      shackleF.translate(hullL * 0.52, -hullH * 0.1, side * s * 1.08);
      parts.push(shackleF);

      const shackleR = new THREE.TorusGeometry(s * 0.12, s * 0.032, 8, 16);
      paintGeometry(shackleR, steelHex);
      shackleR.rotateY(Math.PI / 2);
      shackleR.translate(-hullL * 0.52, -hullH * 0.06, side * s * 1.05);
      parts.push(shackleR);

      const lamp = cylAlongX(s * 0.11, s * 0.12, s * 0.22, s * 0.02, 14, darkHex);
      lamp.translate(hullL * 0.34, hullH * 0.44, side * s * 1.24);
      parts.push(lamp);
    }
    return finalizeClean(parts, Math.PI / 5.2, 75);
  }

  if (partKind === 'turret') {
    if (resolvedVariant === 't34_85') {
      // Iconic 1944 T-34-85 cast rounded 3-man domed turret + stepped gun mantlet + twin vents + bustle
      const rTur = s * 1.22;
      const domeProf: Array<[number, number]> = [
        [0, -s * 0.42],
        [rTur * 1.04, -s * 0.42],
        [rTur * 1.08, -s * 0.08],
        [rTur * 0.96, s * 0.3],
        [rTur * 0.74, s * 0.5],
        [0, s * 0.55],
      ];
      const dome = buildRevolvedAlongX(domeProf, 32, colorHex);
      dome.rotateZ(Math.PI / 2);
      dome.scale(1.26, 1.0, 1.0);
      parts.push(dome);

      // Cast rear turret bustle overhang housing 85mm ready ammo
      const bustle = createChamferedBox(s * 0.92, s * 0.68, s * 1.48, s * 0.14, colorHex);
      bustle.translate(-rTur * 0.92, s * 0.02, 0);
      parts.push(bustle);

      const mantlet = createChamferedBox(s * 0.78, s * 0.62, s * 0.96, s * 0.1, accentHex);
      mantlet.translate(rTur * 1.24, 0, 0);
      parts.push(mantlet);

      // Twin classic T-34-85 cast roof ventilator mushroom domes
      for (const vz of [-s * 0.32, s * 0.32]) {
        const vent = createBeveledCylinder(s * 0.18, s * 0.22, s * 0.14, s * 0.03, 16, darkHex);
        vent.translate(s * 0.22, s * 0.58, vz);
        parts.push(vent);
      }

      const cupola = createBeveledCylinder(s * 0.4, s * 0.44, s * 0.3, s * 0.05, 24, accentHex);
      cupola.translate(-s * 0.42, s * 0.62, -s * 0.28);
      parts.push(cupola);
      // Loader armored roof hatch + dual rear radio whip antennas
      const loaderHatch = createBeveledCylinder(s * 0.34, s * 0.36, s * 0.12, s * 0.03, 20, darkHex);
      loaderHatch.translate(-s * 0.28, s * 0.56, s * 0.38);
      parts.push(loaderHatch);
      const whip = createBeveledCylinder(s * 0.018, s * 0.03, s * 1.65, s * 0.005, 8, steelHex);
      whip.rotateZ(0.08);
      whip.translate(-rTur * 0.95, s * 1.15, s * 0.52);
      parts.push(whip);
      return finalizeClean(parts, Math.PI / 4.2, 75);
    }

    if (resolvedVariant === 'merkava4') {
      // Unmistakable Merkava Mk 4M razor-sharp wide arrowhead wedge turret + 4 Trophy APS radar panels
      const turL = s * 4.35;
      const turH = s * 0.78;
      const turW = s * 3.18;
      const planPts: Array<[number, number]> = [
        [-turL * 0.5, -turW * 0.28],
        [-turL * 0.08, -turW * 0.52],
        [turL * 0.54, -turW * 0.14],
        [turL * 0.54, turW * 0.14],
        [-turL * 0.08, turW * 0.52],
        [-turL * 0.5, turW * 0.28],
      ];
      const turGeo = extrudeProfileXY(planPts, turH, s * 0.09, colorHex, 2);
      turGeo.rotateX(Math.PI / 2);
      parts.push(turGeo);

      // Modular low-angle upper composite roof slab + armored hatches & dual whip antennas
      const roofPlate = createChamferedBox(turL * 0.62, s * 0.16, turW * 0.56, s * 0.05, accentHex);
      roofPlate.translate(-turL * 0.06, turH * 0.5, 0);
      parts.push(roofPlate);
      for (const hz of [-s * 0.48, s * 0.48]) {
        const hatch = createBeveledCylinder(s * 0.32, s * 0.35, s * 0.12, s * 0.03, 20, darkHex);
        hatch.translate(-turL * 0.12, turH * 0.62, hz);
        parts.push(hatch);
      }

      // Sloped narrow mantlet slot
      const mantlet = createChamferedBox(s * 0.65, turH * 0.66, s * 0.78, s * 0.06, darkHex);
      mantlet.translate(turL * 0.54, 0, 0);
      parts.push(mantlet);

      // Rear turret bustle stowage basket + iconic Merkava ball-and-chain RPG curtain rim
      const basket = createChamferedBox(s * 0.85, turH * 0.62, turW * 0.52, s * 0.06, darkHex);
      basket.translate(-turL * 0.54, turH * 0.06, 0);
      parts.push(basket);

      // 4 Flat Angled Trophy (Meil Ruach) Elta EL/M-2133 APS radar array panels + twin interceptor pods + whip antennas
      for (const side of [-1, 1] as const) {
        const frontRadar = createChamferedBox(s * 0.52, s * 0.42, s * 0.14, s * 0.03, steelHex);
        frontRadar.rotateY(side * -0.44);
        frontRadar.rotateX(side * -0.22);
        frontRadar.translate(turL * 0.12, turH * 0.22, side * (turW * 0.44));
        parts.push(frontRadar);

        const rearRadar = createChamferedBox(s * 0.48, s * 0.4, s * 0.14, s * 0.03, steelHex);
        rearRadar.rotateY(side * 0.48);
        rearRadar.translate(-turL * 0.32, turH * 0.22, side * (turW * 0.42));
        parts.push(rearRadar);

        // Twin hard-kill Trophy MEFP launcher boxes perched on rear turret flanks
        const launcher = createChamferedBox(s * 0.54, s * 0.36, s * 0.42, s * 0.04, darkHex);
        launcher.translate(-turL * 0.12, turH * 0.52, side * (turW * 0.38));
        parts.push(launcher);

        const whip = createBeveledCylinder(s * 0.018, s * 0.032, s * 1.75, s * 0.005, 8, steelHex);
        whip.rotateZ(0.1);
        whip.translate(-turL * 0.46, turH * 1.35, side * s * 0.72);
        parts.push(whip);
      }
      return finalizeClean(parts, Math.PI / 5.2, 75);
    }

    if (resolvedVariant === 'challenger2') {
      // Unmistakable British FV4034 Challenger 2 tall angular Dorchester Chobham wedge turret + TOGS II box
      const turL = s * 4.15;
      const turH = s * 0.98;
      const turW = s * 2.95;
      const planPts: Array<[number, number]> = [
        [-turL * 0.52, -turW * 0.44],
        [turL * 0.1, -turW * 0.5],
        [turL * 0.5, -turW * 0.24],
        [turL * 0.5, turW * 0.24],
        [turL * 0.1, turW * 0.5],
        [-turL * 0.52, turW * 0.44],
      ];
      const turGeo = extrudeProfileXY(planPts, turH, s * 0.07, colorHex, 2);
      turGeo.rotateX(Math.PI / 2);
      parts.push(turGeo);

      // Heavy Dorchester armored gun mantlet shroud
      const mantlet = createChamferedBox(s * 0.82, turH * 0.78, s * 1.02, s * 0.06, accentHex);
      mantlet.translate(turL * 0.5, 0, 0);
      parts.push(mantlet);

      // Iconic Challenger 2 armored TOGS II thermal sight barbette directly ABOVE the gun mantlet
      const togsBox = createChamferedBox(s * 0.68, s * 0.42, s * 0.72, s * 0.04, darkHex);
      togsBox.translate(turL * 0.44, turH * 0.62, 0);
      parts.push(togsBox);

      // Deep armored rear turret stowage bin + twin roof hatches & whip antennas
      const rearBin = createChamferedBox(s * 0.78, turH * 0.74, turW * 0.78, s * 0.06, darkHex);
      rearBin.translate(-turL * 0.58, turH * 0.04, 0);
      parts.push(rearBin);

      for (const side of [-1, 1] as const) {
        const hatch = createBeveledCylinder(s * 0.34, s * 0.38, s * 0.14, s * 0.03, 20, accentHex);
        hatch.translate(-turL * 0.14, turH * 0.56, side * s * 0.55);
        parts.push(hatch);
        const whip = createBeveledCylinder(s * 0.018, s * 0.032, s * 1.85, s * 0.005, 8, steelHex);
        whip.rotateZ(0.08);
        whip.translate(-turL * 0.46, turH * 1.35, side * s * 0.92);
        parts.push(whip);
        // Twin 5-barrel British L8 forward smoke grenade discharger banks
        for (let b = 0; b < 5; b++) {
          const tube = cylAlongX(s * 0.055, s * 0.055, s * 0.36, s * 0.01, 10, steelHex);
          tube.rotateZ(0.35);
          tube.translate(turL * 0.34, turH * 0.18 + (b % 2) * s * 0.12, side * (turW * 0.36 + b * s * 0.065));
          parts.push(tube);
        }
      }
      return finalizeClean(parts, Math.PI / 5.2, 75);
    }

    // 't90m' (default modern): Low-profile Russian welded turret clad in V-angled Relikt ERA arrowhead cheeks
    const turL = s * 3.65;
    const turH = s * 0.8;
    const turW = s * 2.8;
    const planPts: Array<[number, number]> = [
      [-turL * 0.48, -turW * 0.4],
      [turL * 0.12, -turW * 0.48],
      [turL * 0.48, -turW * 0.22],
      [turL * 0.48, turW * 0.22],
      [turL * 0.12, turW * 0.48],
      [-turL * 0.48, turW * 0.4],
    ];
    const turGeo = extrudeProfileXY(planPts, turH, s * 0.07, colorHex, 2);
    turGeo.rotateX(Math.PI / 2);
    parts.push(turGeo);

    // Signature twin V-angled Relikt ERA arrowhead cheek wedges framing the gun mantlet
    for (const side of [-1, 1] as const) {
      const wedge = createChamferedBox(s * 1.18, turH * 0.88, s * 0.42, s * 0.05, accentHex);
      wedge.rotateY(side * -0.46);
      wedge.translate(turL * 0.34, 0, side * (turW * 0.33));
      parts.push(wedge);

      // Roof crew hatches + dual slender whip antennas
      const hatch = createBeveledCylinder(s * 0.32, s * 0.35, s * 0.12, s * 0.03, 20, darkHex);
      hatch.translate(-turL * 0.1, turH * 0.56, side * s * 0.52);
      parts.push(hatch);
      const whip = createBeveledCylinder(s * 0.018, s * 0.03, s * 1.75, s * 0.005, 8, steelHex);
      whip.rotateZ(0.08);
      whip.translate(-turL * 0.44, turH * 1.32, side * s * 0.82);
      parts.push(whip);

      // Twin 6-tube 81mm Tucha smoke-grenade discharger clusters on turret cheeks
      for (let t = 0; t < 6; t++) {
        const col = t % 3;
        const row = Math.floor(t / 3);
        const tube = cylAlongX(s * 0.055, s * 0.055, s * 0.42, s * 0.01, 10, steelHex);
        tube.rotateZ(0.38);
        tube.rotateY(side * -0.22);
        tube.translate(
          turL * 0.02 + col * s * 0.14,
          turH * 0.16 + row * s * 0.16,
          side * (turW * 0.5 + row * s * 0.06)
        );
        parts.push(tube);
      }
    }

    // T-90M isolated external rear turret bustle ammo box
    const bustleBox = createChamferedBox(s * 0.86, turH * 0.72, turW * 0.64, s * 0.06, darkHex);
    bustleBox.translate(-turL * 0.56, turH * 0.04, 0);
    parts.push(bustleBox);

    // Armored gun mantlet + Sosna-U gunner thermal hood + roof RWS cradle
    const mantlet = createChamferedBox(s * 0.68, turH * 0.72, s * 0.86, s * 0.06, darkHex);
    mantlet.translate(turL * 0.5, 0, 0);
    parts.push(mantlet);

    const sosna = createChamferedBox(s * 0.48, s * 0.34, s * 0.42, s * 0.04, darkHex);
    sosna.translate(turL * 0.14, turH * 0.58, s * 0.56);
    parts.push(sosna);

    return finalizeClean(parts, Math.PI / 5.2, 75);
  }

  if (partKind === 'era_skirts') {
    if (resolvedVariant === 't34_85') {
      // 1944 T-34-85: ZERO modern ERA side skirts! Slim WWII arched stamped-steel track fenders
      // mounted HIGH above tracks + tubular infantry handrails + upper deck stowage box,
      // leaving all 5 large Christie roadwheels 100% EXPOSED!
      const fenderL = s * 6.35;
      for (const side of [-1, 1] as const) {
        const zFender = side * s * 1.56;
        // Slim flat upper track fender plate seated strictly ABOVE tracks (y = +0.44*s)
        const deckFender = createChamferedBox(fenderL, s * 0.08, s * 0.66, s * 0.02, colorHex);
        deckFender.translate(0, s * 0.44, zFender);
        parts.push(deckFender);

        // Angled WWII front & rear mudguard flaps
        const frontFlap = createChamferedBox(s * 0.56, s * 0.08, s * 0.66, s * 0.02, darkHex);
        frontFlap.rotateZ(-0.46);
        frontFlap.translate(fenderL * 0.5 + s * 0.18, s * 0.3, zFender);
        parts.push(frontFlap);

        const rearFlap = createChamferedBox(s * 0.48, s * 0.08, s * 0.66, s * 0.02, darkHex);
        rearFlap.rotateZ(0.42);
        rearFlap.translate(-fenderL * 0.5 - s * 0.14, s * 0.32, zFender);
        parts.push(rearFlap);

        // WWII hull side tubular grab handrail + steel spare-parts stowage box on upper fender
        const rail = cylAlongX(s * 0.045, s * 0.045, s * 2.2, s * 0.01, 12, steelHex);
        rail.translate(-s * 0.25, s * 0.66, side * s * 1.72);
        parts.push(rail);

        const toolBox = createChamferedBox(s * 0.88, s * 0.26, s * 0.42, s * 0.03, darkHex);
        toolBox.translate(s * 1.35, s * 0.6, zFender);
        parts.push(toolBox);
      }
      return finalizeClean(parts, Math.PI / 5.2);
    }

    if (resolvedVariant === 'challenger2') {
      // British continuous heavy Dorchester composite side skirt panels
      const skirtL = s * 6.2;
      const panelCount = 6;
      const panelL = (skirtL / panelCount) * 0.96;
      for (const side of [-1, 1] as const) {
        for (let i = 0; i < panelCount; i++) {
          const tx = -skirtL * 0.42 + (i / (panelCount - 1)) * (skirtL * 0.84);
          const panel = createChamferedBox(panelL, s * 0.64, s * 0.18, s * 0.03, colorHex);
          panel.translate(tx, s * 0.06, side * s * 1.76);
          parts.push(panel);
        }
      }
      return finalizeClean(parts, Math.PI / 5.2);
    }

    if (resolvedVariant === 'merkava4') {
      // Israeli Merkava corrugated spring-mounted modular ballistic side skirts
      const skirtL = s * 6.3;
      const panelCount = 6;
      const panelL = (skirtL / panelCount) * 0.94;
      for (const side of [-1, 1] as const) {
        for (let i = 0; i < panelCount; i++) {
          const tx = -skirtL * 0.42 + (i / (panelCount - 1)) * (skirtL * 0.84);
          const panel = createChamferedBox(
            panelL,
            s * 0.68,
            s * 0.16,
            s * 0.04,
            i % 2 === 0 ? colorHex : accentHex
          );
          panel.translate(tx, s * 0.02, side * s * 1.76);
          parts.push(panel);
          const lowerLip = createChamferedBox(panelL * 0.92, s * 0.16, s * 0.12, s * 0.02, darkHex);
          lowerLip.rotateX(side * 0.25);
          lowerLip.translate(tx, -s * 0.36, side * s * 1.74);
          parts.push(lowerLip);
        }
      }
      return finalizeClean(parts, Math.PI / 5.2);
    }

    // 't90m': Modular Relikt ERA heavy side panels + rear slat cage bars protecting engine bay
    const skirtL = s * 6.2;
    const tileCount = 7;
    const tileL = (skirtL / tileCount) * 0.92;
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < tileCount; i++) {
        const tx = -skirtL * 0.44 + (i / (tileCount - 1)) * (skirtL * 0.88);
        if (i < 2) {
          // Rear engine slat-cage grille bars on T-90M rear flanks
          for (let b = -2; b <= 2; b++) {
            const bar = createChamferedBox(tileL * 1.02, s * 0.06, s * 0.14, s * 0.015, steelHex);
            bar.translate(tx, b * s * 0.15, side * s * 1.78);
            parts.push(bar);
          }
        } else {
          const tile = createChamferedBox(
            tileL,
            s * 0.72,
            s * 0.2,
            s * 0.04,
            i % 2 === 0 ? colorHex : accentHex
          );
          tile.translate(tx, 0, side * s * 1.76);
          parts.push(tile);
        }
      }
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (partKind === 'suspension_tracks') {
    // Constitutional Rule 10.3: ARTICULATED INDIVIDUAL TRACK LINK BELTS + TOOTHED DRIVE SPROCKETS +
    // BOLTED/SPOKED RUBBER-RIMMED ROADWHEELS + RETURN ROLLERS (ZERO smooth flat track boxes!)
    const trackL = s * 6.3;
    const trackH = s * 0.94;
    const trackW = s * 0.62;
    const wheelCount = style === 'mbt_wwii' ? 5 : 6;
    const wheelR = s * (style === 'mbt_wwii' ? 0.43 : 0.36);
    const padHex = '#323840';
    const cleatHex = '#48505a';

    const pushLinkShoe = (
      x: number,
      y: number,
      z: number,
      pitchRad: number,
      linkLen: number
    ) => {
      const shoe = createChamferedBox(linkLen * 0.82, s * 0.11, trackW, s * 0.018, padHex);
      shoe.rotateZ(pitchRad);
      shoe.translate(x, y, z);
      parts.push(shoe);
      const cleat = createChamferedBox(linkLen * 0.28, s * 0.045, trackW * 0.94, s * 0.01, cleatHex);
      cleat.rotateZ(pitchRad);
      cleat.translate(
        x - Math.sin(pitchRad) * s * 0.06,
        y + Math.cos(pitchRad) * s * 0.06,
        z
      );
      parts.push(cleat);
    };

    for (const side of [-1, 1] as const) {
      const zPos = side * s * 1.48;
      // 1. Top return track run: 22 articulated individual track link shoes
      const topCount = 22;
      const topPitch = (trackL * 0.92) / topCount;
      for (let i = 0; i < topCount; i++) {
        const lx = -trackL * 0.46 + (i + 0.5) * topPitch;
        pushLinkShoe(lx, trackH * 0.44, zPos, 0, topPitch);
      }

      // 2. Bottom ground-contact track run: 18 articulated individual track shoes w/ cleats
      const botCount = 18;
      const botSpan = trackL * 0.8;
      const botPitch = botSpan / botCount;
      for (let i = 0; i < botCount; i++) {
        const lx = -botSpan * 0.5 + (i + 0.5) * botPitch;
        pushLinkShoe(lx, -trackH * 0.44, zPos, Math.PI, botPitch);
      }

      // 3. Angled front idler & rear drive-sprocket articulated track wrap segments (4 links each)
      for (const endSign of [-1, 1] as const) {
        const x0 = endSign * botSpan * 0.5;
        const y0 = -trackH * 0.42;
        const x1 = endSign * trackL * 0.48;
        const y1 = trackH * 0.28;
        const rampAngle = Math.atan2(y1 - y0, x1 - x0);
        const rampLen = Math.hypot(x1 - x0, y1 - y0);
        const rampLinks = 4;
        for (let k = 0; k < rampLinks; k++) {
          const u = (k + 0.5) / rampLinks;
          pushLinkShoe(
            x0 + (x1 - x0) * u,
            y0 + (y1 - y0) * u,
            zPos,
            rampAngle,
            rampLen / rampLinks
          );
        }
      }

      // 4. Bolted / spoked dual-flange roadwheels w/ dark rubber road-tire rings & radial lug bolts
      for (let i = 0; i < wheelCount; i++) {
        const wx = -trackL * 0.36 + (i / (wheelCount - 1)) * (trackL * 0.72);
        const wy = -trackH * 0.14;
        // Matte black rubber outer roadwheel tire
        const tire = cylAlongZ(wheelR, wheelR, s * 0.5, s * 0.04, 22, padHex);
        tire.translate(wx, wy, zPos);
        parts.push(tire);
        // Painted / steel inner dished wheel rim
        const rim = cylAlongZ(wheelR * 0.76, wheelR * 0.76, s * 0.54, s * 0.03, 20, steelHex);
        rim.translate(wx, wy, zPos);
        parts.push(rim);
        // Central armored bearing hubcap + 6 radial steel wheel-lug bolts
        const hub = cylAlongZ(wheelR * 0.26, wheelR * 0.26, s * 0.6, s * 0.025, 14, accentHex);
        hub.translate(wx, wy, zPos);
        parts.push(hub);
        for (let b = 0; b < 6; b++) {
          const ba = (b / 6) * Math.PI * 2;
          const bolt = cylAlongZ(wheelR * 0.08, wheelR * 0.08, s * 0.58, s * 0.01, 8, cleatHex);
          bolt.translate(
            wx + Math.cos(ba) * wheelR * 0.5,
            wy + Math.sin(ba) * wheelR * 0.5,
            zPos
          );
          parts.push(bolt);
        }
      }

      // 5. Modern MBT steel top return rollers supporting the upper articulated track belt
      if (style === 'mbt_modern') {
        for (const frac of [-0.26, 0, 0.26]) {
          const roller = cylAlongZ(s * 0.12, s * 0.12, s * 0.44, s * 0.02, 14, cleatHex);
          roller.translate(trackL * frac, trackH * 0.28, zPos);
          parts.push(roller);
        }
      }

      // 6. Toothed rear drive sprocket (10 radial drive teeth!) & smooth front tension idler
      const rearX = -trackL * 0.46;
      const frontX = trackL * 0.46;
      const sprockY = trackH * 0.16;
      const sprockR = wheelR * 0.9;
      const driveDrum = cylAlongZ(sprockR * 0.86, sprockR * 0.86, s * 0.56, s * 0.04, 20, accentHex);
      driveDrum.translate(rearX, sprockY, zPos);
      parts.push(driveDrum);
      for (let t = 0; t < 10; t++) {
        const ta = (t / 10) * Math.PI * 2;
        const tooth = createChamferedBox(s * 0.1, s * 0.14, s * 0.62, s * 0.015, cleatHex);
        tooth.rotateZ(ta);
        tooth.translate(
          rearX + Math.cos(ta) * sprockR * 0.94,
          sprockY + Math.sin(ta) * sprockR * 0.94,
          zPos
        );
        parts.push(tooth);
      }
      const idler = cylAlongZ(sprockR * 0.9, sprockR * 0.9, s * 0.54, s * 0.04, 20, accentHex);
      idler.translate(frontX, sprockY, zPos);
      parts.push(idler);
    }
    return finalizeClean(parts, Math.PI / 5.2, 75);
  }

  if (partKind === 'engine_block') {
    const block = createChamferedBox(s * 1.65, s * 0.78, s * 1.15, s * 0.07, steelHex);
    parts.push(block);
    // Twin V12 angled cylinder banks
    for (const side of [-1, 1] as const) {
      const bank = createChamferedBox(s * 1.42, s * 0.42, s * 0.44, s * 0.05, accentHex);
      bank.rotateX(side * 0.52);
      bank.translate(0, s * 0.38, side * s * 0.42);
      parts.push(bank);
    }
    const turbo = cylAlongX(s * 0.24, s * 0.24, s * 0.48, s * 0.03, 20, brassHex);
    turbo.translate(-s * 0.68, s * 0.52, 0);
    parts.push(turbo);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  // 'autoloader': circular 22-round carousel / bustle cassette tray
  const ringR = s * 0.95;
  parts.push(createBeveledCylinder(ringR, ringR, s * 0.32, s * 0.04, 32, steelHex));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rd = cylAlongX(s * 0.065, s * 0.055, s * 0.82, s * 0.015, 12, brassHex);
    rd.translate(ringR * 0.52, s * 0.22, 0);
    rd.rotateY(a);
    parts.push(rd);
  }
  return finalizeClean(parts, Math.PI / 5.2);
}

// =============================================================================
// 9. Rotary Autocannon & Heavy Artillery Carriage / Breech Builder
// =============================================================================

export function buildRotaryAndArtilleryGeo(
  partKind: RotaryArtilleryPartKind,
  len: number,
  colorHex: string
): THREE.BufferGeometry {
  const L = clampPos(len, 120);
  const accentHex = shadeHex(colorHex, 1.18);
  const darkHex = shadeHex(colorHex, 0.72);
  const brassHex = '#cfa247';
  const parts: THREE.BufferGeometry[] = [];

  if (partKind === 'vulcan_barrels') {
    // 6-barrel M61A1 Vulcan 20mm rotary cluster around pitch circle + mid/muzzle clamp collars
    const pitchR = Math.max(3.6, L * 0.038);
    const bR = pitchR * 0.32;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const barrel = cylAlongX(bR * 1.15, bR * 0.88, L, bR * 0.08, 20, colorHex);
      barrel.translate(0, Math.cos(a) * pitchR, Math.sin(a) * pitchR);
      parts.push(barrel);
    }
    for (const cx of [-L * 0.44, 0, L * 0.44]) {
      const clamp = cylAlongX(pitchR * 1.48, pitchR * 1.48, Math.max(2.4, L * 0.03), 0.14, 32, accentHex);
      clamp.translate(cx, 0, 0);
      parts.push(clamp);
    }
    const shaft = cylAlongX(pitchR * 0.36, pitchR * 0.36, L * 0.96, 0.06, 20, darkHex);
    parts.push(shaft);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (partKind === 'bofors_carriage') {
    // Bofors 40mm L/60 twin-trunnion pedestal, curved elevation rack, recoil shield & handwheels
    const base = createBeveledCylinder(L * 0.24, L * 0.3, L * 0.12, L * 0.015, 32, colorHex);
    base.translate(0, -L * 0.28, 0);
    parts.push(base);

    for (const side of [-1, 1] as const) {
      const trunnion = createChamferedBox(L * 0.22, L * 0.44, L * 0.06, L * 0.012, accentHex);
      trunnion.translate(0, -L * 0.02, side * L * 0.16);
      parts.push(trunnion);
      const wheel = new THREE.TorusGeometry(L * 0.09, L * 0.014, 10, 22);
      paintGeometry(wheel, brassHex);
      wheel.translate(-L * 0.08, -L * 0.06, side * L * 0.23);
      parts.push(wheel);
    }
    // Sloped armored gun shield
    const shield = createChamferedBox(L * 0.04, L * 0.48, L * 0.56, L * 0.01, darkHex);
    shield.rotateZ(-0.26);
    shield.translate(L * 0.18, L * 0.06, 0);
    parts.push(shield);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (partKind === 'm777_carriage') {
    // BAE M777A2 titanium split-trail legs + spades + twin hydro-pneumatic recoil cradle tubes
    const cradle = createChamferedBox(L * 0.36, L * 0.14, L * 0.24, L * 0.02, accentHex);
    cradle.translate(L * 0.04, L * 0.06, 0);
    parts.push(cradle);

    for (const side of [-1, 1] as const) {
      // Rear split-trail leg sweeping outward & down to ground spade
      const leg = createChamferedBox(L * 0.62, L * 0.07, L * 0.08, L * 0.014, colorHex);
      leg.rotateY(side * 0.32);
      leg.rotateZ(0.22);
      leg.translate(-L * 0.26, -L * 0.1, side * L * 0.18);
      parts.push(leg);

      const spade = createChamferedBox(L * 0.14, L * 0.12, L * 0.18, L * 0.014, darkHex);
      spade.translate(-L * 0.54, -L * 0.2, side * L * 0.28);
      parts.push(spade);

      // Twin hydro-pneumatic recoil / recuperator tubes
      const recTube = cylAlongX(L * 0.036, L * 0.036, L * 0.42, L * 0.008, 18, brassHex);
      recTube.translate(L * 0.12, L * 0.14, side * L * 0.09);
      parts.push(recTube);
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  // 'breech_block': massive artillery / heavy autocannon breech ring + interrupted screw block
  const ring = createChamferedBox(L * 0.42, L * 0.32, L * 0.32, L * 0.03, colorHex);
  parts.push(ring);
  const block = createChamferedBox(L * 0.26, L * 0.24, L * 0.22, L * 0.02, accentHex);
  block.translate(-L * 0.18, 0, 0);
  parts.push(block);
  const lever = cylAlongZ(L * 0.028, L * 0.034, L * 0.28, L * 0.008, 16, brassHex);
  lever.translate(-L * 0.14, L * 0.06, L * 0.24);
  parts.push(lever);
  return finalizeClean(parts, Math.PI / 5.2);
}

// =============================================================================
// 10. Compound Bow, Recurve Crossbow & Medieval English Longbow Builder
// =============================================================================

export function buildArcheryGeo(
  partKind: ArcheryPartKind,
  len: number,
  colorHex: string,
  style: ArcheryStyle
): THREE.BufferGeometry {
  const L = clampPos(len, 60);
  const accentHex = shadeHex(colorHex, 1.18);
  const darkHex = shadeHex(colorHex, 0.7);
  const parts: THREE.BufferGeometry[] = [];

  if (partKind === 'bowstring') {
    // Taut bowstring carrying `SPRING_AXIS_MODE_FLEX` (w = 3) GPU draw displacement!
    const r = Math.max(0.14, L * 0.004);
    const isCrossbow = style === 'crossbow_recurve';
    const strGeo = isCrossbow
      ? cylAlongZ(r, r, L, 0.01, 14, colorHex)
      : createBeveledCylinder(r, r, L, 0.01, 14, colorHex);

    // Served nocking point sleeve at center
    const servingHex = style === 'bow_longbow' ? '#3a2515' : '#c45822';
    const serving = isCrossbow
      ? cylAlongZ(r * 1.45, r * 1.45, L * 0.12, 0.01, 14, servingHex)
      : createBeveledCylinder(r * 1.45, r * 1.45, L * 0.12, 0.01, 14, servingHex);
    parts.push(strGeo, serving);

    const finalized = finalizeClean(parts, Math.PI / 5.2);
    const halfL = L * 0.5;
    const drawAmp = L * 0.22;
    attachFlexParam(finalized, (_x, y, z) => {
      const coord = isCrossbow ? z : y;
      const t = Math.max(0, 1 - Math.abs(coord) / Math.max(halfL, 1e-4));
      return [-drawAmp * t, 0, 0];
    });
    return finalized;
  }

  if (partKind === 'riser') {
    if (style === 'bow_longbow') {
      // Slim hand-stitched dark saddle-leather central waist wrap hugging the yew stave
      const gripH = Math.max(12.5, L * 0.72);
      const wrap = createBeveledCylinder(1.38, 1.44, gripH, 0.14, 24, colorHex);
      parts.push(wrap);
      for (const cy of [-gripH * 0.46, gripH * 0.46]) {
        const cord = createBeveledCylinder(1.48, 1.48, 0.65, 0.08, 22, darkHex);
        cord.translate(0, cy, 0);
        parts.push(cord);
      }
      return finalizeClean(parts, Math.PI / 4.5);
    }
    if (style === 'crossbow_recurve') {
      // Sleek CNC-machined anodized crossbow flight rail + sloped recurve limb-pocket riser bridge
      const rail = createChamferedBox(L * 0.92, 3.1, 2.9, 0.16, colorHex);
      parts.push(rail);
      // Recessed upper anodized arrow flight deck channel
      const deck = createChamferedBox(L * 0.88, 0.52, 2.2, 0.06, darkHex);
      deck.translate(0, 1.72, 0);
      parts.push(deck);
      // Sloped front CNC riser bridge holding twin recurve limb pockets
      const riserBridge = createChamferedBox(4.4, 3.0, L * 0.24, 0.14, accentHex);
      riserBridge.translate(L * 0.42, 0.35, 0);
      parts.push(riserBridge);
      return finalizeClean(parts, Math.PI / 5.2);
    }
    // 'bow_compound': hollow CNC truss vertical riser with sight-window bridge
    const spine = createChamferedBox(3.4, L, 2.2, 0.18, colorHex);
    parts.push(spine);
    const bridge = createChamferedBox(2.2, L * 0.46, 1.4, 0.12, accentHex);
    bridge.translate(2.4, L * 0.08, 0);
    parts.push(bridge);
    for (const sy of [-L * 0.42, L * 0.42]) {
      const pocket = createChamferedBox(5.2, 3.4, 3.2, 0.16, darkHex);
      pocket.translate(-1.2, sy, 0);
      parts.push(pocket);
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (partKind === 'limbs') {
    if (style === 'bow_longbow') {
      // True tapered bi-layer D-section medieval English yew warbow stave:
      // flatter pale tension sapwood back (+X) + rounded reddish-brown heartwood belly (-X)
      const halfL = L * 0.5;
      const stations = 26;
      const ringSegs = 12;
      const sapColor = new THREE.Color('#b68c5a');
      const heartColor = new THREE.Color(colorHex);
      const posList: number[] = [];
      const colList: number[] = [];

      const rings: Array<Array<[number, number, number]>> = [];
      const centers: Array<[number, number, number]> = [];
      for (let i = 0; i <= stations; i++) {
        const u = (i / stations) * 2 - 1; // -1 .. +1
        const absU = Math.abs(u);
        const y = u * halfL;
        const cx = -Math.pow(absU, 1.85) * (L * 0.145);
        // Authentic warbow taper: thick 1.38 cm waist tapering smoothly to 0.64 cm tips
        const taper = 1 - 0.52 * Math.pow(absU, 1.35);
        const rBase = Math.max(1.22, L * 0.0155) * taper;
        centers.push([cx, y, 0]);
        const ring: Array<[number, number, number]> = [];
        for (let s = 0; s < ringSegs; s++) {
          const theta = (s / ringSegs) * Math.PI * 2;
          const ct = Math.cos(theta);
          const st = Math.sin(theta);
          // D-section: slightly flatter +X sapwood back, fuller rounded -X heartwood belly
          const rx = ct >= 0 ? rBase * 0.72 * ct : rBase * 1.12 * ct;
          const rz = rBase * 0.96 * st;
          ring.push([cx + rx, y, rz]);
        }
        rings.push(ring);
      }

      const pushOrientedTri = (
        a: [number, number, number],
        b: [number, number, number],
        c: [number, number, number],
        outDir: [number, number, number],
        col: THREE.Color
      ) => {
        const e1x = b[0] - a[0];
        const e1y = b[1] - a[1];
        const e1z = b[2] - a[2];
        const e2x = c[0] - a[0];
        const e2y = c[1] - a[1];
        const e2z = c[2] - a[2];
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        if (nx * nx + ny * ny + nz * nz < 1e-16) return;
        const dot = nx * outDir[0] + ny * outDir[1] + nz * outDir[2];
        const p1 = a;
        const p2 = dot >= 0 ? b : c;
        const p3 = dot >= 0 ? c : b;
        posList.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
        for (let k = 0; k < 3; k++) {
          colList.push(col.r, col.g, col.b);
        }
      };

      for (let i = 0; i < stations; i++) {
        const r0 = rings[i];
        const r1 = rings[i + 1];
        const cMidX = (centers[i][0] + centers[i + 1][0]) * 0.5;
        const cMidY = (centers[i][1] + centers[i + 1][1]) * 0.5;
        for (let s = 0; s < ringSegs; s++) {
          const sn = (s + 1) % ringSegs;
          const a = r0[s];
          const b = r0[sn];
          const c = r1[sn];
          const d = r1[s];
          const mx = (a[0] + b[0] + c[0] + d[0]) * 0.25 - cMidX;
          const my = (a[1] + b[1] + c[1] + d[1]) * 0.25 - cMidY;
          const mz = (a[2] + b[2] + c[2] + d[2]) * 0.25;
          const faceCol = mx > 0.15 ? sapColor : heartColor;
          pushOrientedTri(a, b, c, [mx, my, mz], faceCol);
          pushOrientedTri(a, c, d, [mx, my, mz], faceCol);
        }
      }
      // Watertight bottom & top stave end-caps
      for (const endIdx of [0, stations] as const) {
        const capSign = endIdx === 0 ? -1 : 1;
        const ctr = centers[endIdx];
        const ring = rings[endIdx];
        for (let s = 0; s < ringSegs; s++) {
          const sn = (s + 1) % ringSegs;
          pushOrientedTri(ctr, ring[s], ring[sn], [0, capSign, 0], heartColor);
        }
      }

      const staveGeo = new THREE.BufferGeometry();
      staveGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posList), 3));
      staveGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colList), 3));
      staveGeo.computeVertexNormals();
      parts.push(staveGeo);

      const finalized = finalizeClean(parts, Math.PI / 4.2);
      attachFlexParam(finalized, (_x, y) => {
        const frac = Math.min(1, Math.abs(y) / Math.max(halfL, 1e-4));
        return [-L * 0.1 * frac * frac, -Math.sign(y) * L * 0.03 * frac, 0];
      });
      return finalized;
    }

    if (style === 'crossbow_recurve') {
      // Swept tapered flat rectangular recurve fiberglass crossbow limbs meeting bowstring tip-to-tip!
      const halfSpan = L * 0.5;
      const tipZ = halfSpan * 0.92;
      const segs = 12;
      for (const side of [-1, 1] as const) {
        const pts: THREE.Vector3[] = [
          new THREE.Vector3(0.4, 0.25, side * 2.1),
          new THREE.Vector3(-L * 0.05, 0.85, side * tipZ * 0.42),
          new THREE.Vector3(-L * 0.145, 1.55, side * tipZ * 0.78),
          new THREE.Vector3(-L * 0.14, 1.8, side * tipZ),
        ];
        const curve = new THREE.CatmullRomCurve3(pts);
        for (let i = 0; i < segs; i++) {
          const t0 = i / segs;
          const t1 = (i + 1) / segs;
          const p0 = curve.getPoint(t0);
          const p1 = curve.getPoint(t1);
          const mid = p0.clone().add(p1).multiplyScalar(0.5);
          const delta = p1.clone().sub(p0);
          const segLen = Math.max(delta.length() * 1.08, 0.4);
          const taper = 1 - 0.36 * ((t0 + t1) * 0.5);
          // Flat rectangular crossbow limb blade (tall in Y, slim flex-thickness in X)
          const blade = createChamferedBox(
            0.95 * taper,
            2.15 * taper,
            segLen,
            0.08,
            i === segs - 1 ? darkHex : colorHex
          );
          const yaw = Math.atan2(delta.x, delta.z);
          const pitch = -Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
          blade.rotateX(pitch);
          blade.rotateY(yaw);
          blade.translate(mid.x, mid.y, mid.z);
          parts.push(blade);
        }
        // Molded recurve limb-tip string cap
        const tipCap = createChamferedBox(1.25, 1.65, 1.35, 0.1, darkHex);
        tipCap.translate(-L * 0.14, 1.8, side * tipZ);
        parts.push(tipCap);
      }
      const finalized = finalizeClean(parts, Math.PI / 4.8);
      attachFlexParam(finalized, (_x, _y, z) => {
        const frac = Math.min(1, Math.abs(z) / Math.max(halfSpan, 1e-4));
        return [-L * 0.14 * frac * frac, 0, -Math.sign(z) * L * 0.04 * frac];
      });
      return finalized;
    }

    // 'bow_compound': twin upper & lower split carbon quad limbs
    const limbL = L * 0.42;
    for (const sy of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const blade = createChamferedBox(limbL, 0.95, 1.35, 0.08, colorHex);
        blade.rotateZ(sy * -0.46);
        blade.translate(-limbL * 0.35, sy * L * 0.36, sz * 1.15);
        parts.push(blade);
      }
    }
    const finalized = finalizeClean(parts, Math.PI / 5.2);
    attachFlexParam(finalized, (_x, y) => {
      const frac = Math.min(1, Math.abs(y) / Math.max(L * 0.5, 1e-4));
      return [-L * 0.06 * frac, -Math.sign(y) * L * 0.04 * frac, 0];
    });
    return finalized;
  }

  if (partKind === 'cams') {
    // Precision-machined elliptical compound cam wheel w/ stepped cable track & axle hub
    const r = Math.max(3.6, L * 0.14);
    const pts: Array<[number, number]> = [];
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rad = r * (1 + 0.24 * Math.cos(a) + 0.08 * Math.sin(2 * a));
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    parts.push(extrudeProfileXY(pts, 1.15, 0.08, colorHex, 2));
    const hub = cylAlongZ(r * 0.32, r * 0.32, 1.65, 0.06, 20, darkHex);
    parts.push(hub);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  // 'projectile': carbon arrow / bolt or medieval bodkin war-arrow w/ 3 vanes & steel point
  const shaftR = Math.max(0.32, L * 0.0065);
  parts.push(cylAlongX(shaftR, shaftR, L * 0.9, 0.02, 18, colorHex));
  const head = cylAlongX(
    shaftR * (style === 'bow_longbow' ? 1.65 : 1.45),
    0.04,
    L * (style === 'bow_longbow' ? 0.13 : 0.11),
    0.02,
    style === 'bow_longbow' ? 4 : 16,
    '#aeb8c5'
  );
  head.translate(L * 0.49, 0, 0);
  parts.push(head);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const vaneHex =
      style === 'bow_longbow'
        ? i === 0
          ? '#8a2b22'
          : '#e2dac8'
        : i === 0
          ? '#c45822'
          : '#d8dde4';
    const vane = createChamferedBox(
      L * (style === 'bow_longbow' ? 0.17 : 0.14),
      shaftR * 2.5,
      0.09,
      0.015,
      vaneHex
    );
    vane.translate(-L * 0.36, shaftR * 1.45, 0);
    vane.rotateX(a);
    parts.push(vane);
  }
  return finalizeClean(parts, Math.PI / 5.2);
}

// =============================================================================
// 11. Dynamic GPU-Deforming Helical Spring Builder (`aSpringParam`)
// =============================================================================

export function buildDynamicHelicalSpringGeo(
  len: number,
  radius: number,
  wireR: number,
  coils: number,
  colorHex: string,
  axis: 'x' | 'y' = 'x'
): THREE.BufferGeometry {
  const L = clampPos(len, 10);
  const coilRadius = clampPos(radius, 0.65);
  const wireRadius = Math.min(clampPos(wireR, 0.1), coilRadius * 0.48);
  const safeCoils = Math.max(3, Math.round(coils));
  const halfL = L * 0.5;

  const geo = createHelicalSpring({
    axis,
    start: -halfL,
    end: halfL,
    coilRadius,
    wireRadius,
    coils: safeCoils,
    radialSegments: 8,
    tubularSegmentsPerCoil: 14,
  });
  paintGeometry(geo, colorHex);
  ensureUnitNormals(geo);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
