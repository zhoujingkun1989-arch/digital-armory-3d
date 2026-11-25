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
 * AgX-calibrated museum finish palettes (no crushed `#000` black; steels sit cleanly in
 * sRGB 0.18–0.34, oiled walnut & birch laminate in deep museum wood tones, and matte
 * anodized dark gunmetal optics — anti-reflective glass sheen is restricted strictly
 * to tiny recessed scope lens faces inside `buildOpticAndSightGeo`).
 */
export const CENTENNIAL_FINISH_COLORS: Record<
  CentennialFinishPaletteName,
  CentennialFinishColorSet
> = {
  blued_steel: {
    primary: '#323c4a',
    secondary: '#435061',
    accent: '#6f7a88',
    furniture: '#4a2916',
    barrel: '#2d3746',
    bolt: '#b8c0cc',
    brass: '#cfa244',
    optic: '#232830',
  },
  parkerized: {
    primary: '#3d444d',
    secondary: '#4c545e',
    accent: '#767f8c',
    furniture: '#522e19',
    barrel: '#373e47',
    bolt: '#adb5c0',
    brass: '#d1a345',
    optic: '#282f38',
  },
  stainless: {
    primary: '#aeb7c4',
    secondary: '#8d97a6',
    accent: '#4a5360',
    furniture: '#343a44',
    barrel: '#b8c1cd',
    bolt: '#cfd6e0',
    brass: '#d5a84b',
    optic: '#282f38',
  },
  fde: {
    primary: '#9e845c',
    secondary: '#7d6748',
    accent: '#464b52',
    furniture: '#8a724e',
    barrel: '#3a414a',
    bolt: '#9ea6b2',
    brass: '#d2a547',
    optic: '#2c2b29',
  },
  od_green: {
    primary: '#46543e',
    secondary: '#374432',
    accent: '#636d78',
    furniture: '#4c5c42',
    barrel: '#373f48',
    bolt: '#a9b1bc',
    brass: '#cfa144',
    optic: '#272d2c',
  },
  bakelite_ak: {
    primary: '#343c46',
    secondary: '#424a54',
    accent: '#58626e',
    furniture: '#5e2c14',
    barrel: '#2f3740',
    bolt: '#b6beca',
    brass: '#cc9c3e',
    optic: '#232830',
  },
  walnut_classic: {
    primary: '#333c48',
    secondary: '#454f5d',
    accent: '#636d7a',
    furniture: '#4c2817',
    barrel: '#2e3744',
    bolt: '#bfc6d1',
    brass: '#d4a648',
    optic: '#232830',
  },
  tactical_black: {
    primary: '#323943',
    secondary: '#424b58',
    accent: '#6b7584',
    furniture: '#363d47',
    barrel: '#2d343e',
    bolt: '#b2bac6',
    brass: '#d0a246',
    optic: '#232830',
  },
  desert_carc: {
    primary: '#8f7d5d',
    secondary: '#76664b',
    accent: '#4f514d',
    furniture: '#7b6a4e',
    barrel: '#807053',
    bolt: '#9da5b0',
    brass: '#cfa143',
    optic: '#2d2b28',
  },
  nato_camo: {
    primary: '#434e38',
    secondary: '#544736',
    accent: '#353c42',
    furniture: '#404a36',
    barrel: '#3c4632',
    bolt: '#9aa2ad',
    brass: '#cea044',
    optic: '#262c2b',
  },
  russian_green: {
    primary: '#3c4932',
    secondary: '#2f3a28',
    accent: '#4a5543',
    furniture: '#425038',
    barrel: '#35412d',
    bolt: '#a2aab5',
    brass: '#cda043',
    optic: '#262d2a',
  },
  wwii_soviet: {
    primary: '#3f4c32',
    secondary: '#333e29',
    accent: '#4f5944',
    furniture: '#4e2b18',
    barrel: '#39452e',
    bolt: '#9ca4af',
    brass: '#c99b3f',
    optic: '#282e2a',
  },
  titanium_matte: {
    primary: '#66717f',
    secondary: '#505a66',
    accent: '#9ca6b4',
    furniture: '#424b57',
    barrel: '#5a6472',
    bolt: '#c2cad6',
    brass: '#d3a64a',
    optic: '#293038',
  },
  yew_wood: {
    primary: '#6e3c1e',
    secondary: '#542c16',
    accent: '#cfc09e',
    furniture: '#452412',
    barrel: '#7a4926',
    bolt: '#b9a888',
    brass: '#cfa247',
    optic: '#2e2a25',
  },
  carbon_camo: {
    primary: '#39414b',
    secondary: '#4c5560',
    accent: '#c45b22',
    furniture: '#313841',
    barrel: '#414a55',
    bolt: '#b7c0cc',
    brass: '#c9953e',
    optic: '#242a32',
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
}

export interface BarrelGeoOptions {
  flutes?: boolean;
  coolingFins?: boolean;
  frontSightTower?: boolean;
  gasBlock?: boolean;
  muzzleStyle?: BarrelMuzzleStyle;
  accentColorHex?: string;
}

export type BoltCarrierStyle =
  | 'rotating'
  | 'straight_pull'
  | 'slide'
  | 'falling_block'
  | 'revolver_cylinder';

export type HandguardStyle =
  | 'ventilated_tube'
  | 'quad_rail'
  | 'triangular_retro'
  | 'walnut_forend'
  | 'polymer_bullpup';

export type StockGripStyle =
  | 'walnut_rifle'
  | 'straight_walnut'
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

function finalizeClean(
  parts: THREE.BufferGeometry[],
  creaseRad = Math.PI / 5.2
): THREE.BufferGeometry {
  const merged = mergeParts(parts, creaseRad);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  ensureUnitNormals(merged);
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
    const block = createChamferedBox(
      Math.min(3.2, L * 0.09),
      rM * 3.1,
      rM * 2.1,
      0.08,
      accentHex
    );
    block.translate(gx, rM * 0.55, 0);
    parts.push(block);

    const tubeLen = L * 0.52;
    const tube = cylAlongX(rM * 0.38, rM * 0.38, tubeLen, 0.03, 18, accentHex);
    tube.translate(gx - tubeLen * 0.5, rM * 1.55, 0);
    parts.push(tube);
  }

  // Optional forged A-frame front sight tower
  if (opts.frontSightTower) {
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

    // Protective front sight ears
    for (const side of [-1, 1] as const) {
      const ear = createChamferedBox(0.9, towerH * 0.42, 0.24, 0.04, accentHex);
      ear.translate(sx, rM * 0.6 + towerH * 1.05, side * (rM * 0.55));
      parts.push(ear);
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

  if (style === 'slide') {
    // Chamfered pistol top slide with rounded crown, cocking serrations, ejection step & iron sights
    const slideH = R * 2.8;
    const slideW = R * 2.55;
    const hw = slideW * 0.5;
    const hh = slideH * 0.5;
    const slideProf: Array<[number, number]> = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh * 0.46],
      [hw * 0.72, hh],
      [-hw * 0.72, hh],
      [-hw, hh * 0.46],
    ];
    parts.push(extrudeProfileZYAlongX(slideProf, L, Math.min(0.1, R * 0.12), colorHex, 2));

    // Ejection port accent step on right (+Z) upper crown
    const port = createChamferedBox(L * 0.26, slideH * 0.44, slideW * 0.14, 0.03, darkHex);
    port.translate(L * 0.05, hh * 0.48, hw - slideW * 0.02);
    parts.push(port);

    // 7 angled rear slide cocking serration ribs on both flanks
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < 7; i++) {
        const sx = -L * 0.42 + i * (L * 0.032);
        const rib = createChamferedBox(L * 0.016, slideH * 0.68, slideW * 0.08, 0.015, brightHex);
        rib.rotateZ(-0.2);
        rib.translate(sx, -hh * 0.06, side * (hw + slideW * 0.015));
        parts.push(rib);
      }
    }

    // Dovetail rear notch sight & front blade sight
    const rearSight = createChamferedBox(L * 0.08, slideH * 0.34, slideW * 0.68, 0.04, darkHex);
    rearSight.translate(-L * 0.41, hh + slideH * 0.14, 0);
    parts.push(rearSight);

    const frontSight = createChamferedBox(L * 0.07, slideH * 0.32, slideW * 0.22, 0.03, darkHex);
    frontSight.translate(L * 0.43, hh + slideH * 0.14, 0);
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

  // Rear cocking shroud
  const shroud = cylAlongX(R * 1.18, R * 1.1, L * 0.18, R * 0.08, 24, darkHex);
  shroud.translate(-L * 0.44, 0, 0);
  parts.push(shroud);

  // Carrier top gas-key / op-rod boss for rotating gas bolts
  if (style === 'rotating') {
    const key = createChamferedBox(L * 0.56, R * 0.9, R * 1.15, R * 0.1, darkHex);
    key.translate(L * 0.04, R * 0.95, 0);
    parts.push(key);
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

  if (style === 'triangular_retro') {
    // Classic M16A1 triangular tapered handguard + rear delta slip ring
    const tri: Array<[number, number]> = [
      [-hw * 0.42, hh],
      [hw * 0.42, hh],
      [hw, -hh * 0.45],
      [hw * 0.68, -hh],
      [-hw * 0.68, -hh],
      [-hw, -hh * 0.45],
    ];
    parts.push(extrudeProfileZYAlongX(tri, L, 0.14, colorHex, 3));
    const delta = cylAlongX(hh * 1.12, hh * 0.96, Math.min(2.4, L * 0.14), 0.08, 26, accentHex);
    delta.translate(-L * 0.46, 0, 0);
    parts.push(delta);
    const cap = createChamferedBox(0.9, H * 0.92, W * 0.88, 0.06, accentHex);
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
    const pts: Array<[number, number]> = [
      [-L * 0.5, -H * 0.52],
      [L * 0.15, -H * 0.22],
      [L * 0.36, -H * 0.42],
      [L * 0.5, -H * 0.26],
      [L * 0.5, H * 0.24],
      [L * 0.16, H * 0.34],
      [-L * 0.46, H * 0.46],
      [-L * 0.5, H * 0.42],
    ];
    parts.push(extrudeProfileXY(pts, W, Math.min(0.32, W * 0.16), colorHex, 3));
    const buttplate = createChamferedBox(0.85, H * 0.96, W * 0.96, 0.1, steelHex);
    buttplate.translate(-L * 0.5 - 0.25, -H * 0.04, 0);
    parts.push(buttplate);
    return finalizeClean(parts, Math.PI / 4.2);
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
    // Iconic Mauser C96 rounded ribbed wooden broomhandle grip + lanyard ring pommel
    const gripL = Math.max(H, 9.2);
    const rTop = Math.min(L, W) * 0.46;
    const rBot = rTop * 1.18;
    const prof: Array<[number, number]> = [
      [0, -gripL * 0.5],
      [rBot * 0.85, -gripL * 0.5],
      [rBot, -gripL * 0.42],
      [rBot * 0.94, -gripL * 0.12],
      [rTop * 1.04, gripL * 0.18],
      [rTop, gripL * 0.46],
      [rTop * 0.82, gripL * 0.5],
      [0, gripL * 0.5],
    ];
    const body = buildRevolvedAlongX(prof, 24, colorHex);
    body.rotateZ(Math.PI / 2 - 0.24);
    parts.push(body);

    const ring = new THREE.TorusGeometry(rBot * 0.42, rBot * 0.1, 12, 20);
    paintGeometry(ring, steelHex);
    ring.translate(-Math.sin(0.24) * gripL * 0.52, -Math.cos(0.24) * gripL * 0.54, 0);
    parts.push(ring);
    return finalizeClean(parts, Math.PI / 4.5);
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

  // 'pistol_grip': contoured ergonomic angled pistol grip w/ finger-swell & flared base cap
  const pts: Array<[number, number]> = [
    [-L * 0.48, -H * 0.5],
    [L * 0.12, -H * 0.48],
    [L * 0.34, -H * 0.05],
    [L * 0.48, H * 0.48],
    [-L * 0.16, H * 0.48],
    [-L * 0.38, H * 0.04],
  ];
  parts.push(extrudeProfileXY(pts, W, Math.min(0.22, W * 0.16), colorHex, 3));
  const baseCap = createChamferedBox(L * 0.66, H * 0.09, W * 1.06, 0.05, steelHex);
  baseCap.translate(-L * 0.18, -H * 0.49, 0);
  parts.push(baseCap);
  return finalizeClean(parts, Math.PI / 4.5);
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
    return finalizeClean(parts, Math.PI / 5.2);
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
      return finalizeClean(parts, Math.PI / 4.2);
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

      // Modular low-angle upper composite roof slab
      const roofPlate = createChamferedBox(turL * 0.62, s * 0.16, turW * 0.56, s * 0.05, accentHex);
      roofPlate.translate(-turL * 0.06, turH * 0.5, 0);
      parts.push(roofPlate);

      // Sloped narrow mantlet slot
      const mantlet = createChamferedBox(s * 0.65, turH * 0.66, s * 0.78, s * 0.06, darkHex);
      mantlet.translate(turL * 0.54, 0, 0);
      parts.push(mantlet);

      // Rear turret bustle stowage basket + iconic Merkava ball-and-chain RPG curtain rim
      const basket = createChamferedBox(s * 0.85, turH * 0.62, turW * 0.52, s * 0.06, darkHex);
      basket.translate(-turL * 0.54, turH * 0.06, 0);
      parts.push(basket);

      // 4 Flat Angled Trophy (Meil Ruach) Elta EL/M-2133 APS radar array panels + twin interceptor pods
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
      }
      return finalizeClean(parts, Math.PI / 5.2);
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

      // Deep armored rear turret stowage bin + NBC pack
      const rearBin = createChamferedBox(s * 0.78, turH * 0.74, turW * 0.78, s * 0.06, darkHex);
      rearBin.translate(-turL * 0.58, turH * 0.04, 0);
      parts.push(rearBin);

      // Twin 5-barrel British L8 forward smoke grenade discharger banks
      for (const side of [-1, 1] as const) {
        for (let b = 0; b < 5; b++) {
          const tube = cylAlongX(s * 0.055, s * 0.055, s * 0.36, s * 0.01, 10, steelHex);
          tube.rotateZ(0.35);
          tube.translate(turL * 0.34, turH * 0.18 + (b % 2) * s * 0.12, side * (turW * 0.36 + b * s * 0.065));
          parts.push(tube);
        }
      }
      return finalizeClean(parts, Math.PI / 5.2);
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

    return finalizeClean(parts, Math.PI / 5.2);
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
    const trackL = s * 6.3;
    const trackH = s * 0.94;
    const wheelCount = style === 'mbt_wwii' ? 5 : 6;
    const wheelR = s * (style === 'mbt_wwii' ? 0.43 : 0.36);

    for (const side of [-1, 1] as const) {
      const zPos = side * s * 1.48;
      // Top & bottom continuous track runs
      const topRun = createChamferedBox(trackL, s * 0.14, s * 0.62, s * 0.03, darkHex);
      topRun.translate(0, trackH * 0.44, zPos);
      parts.push(topRun);
      const botRun = createChamferedBox(trackL * 0.84, s * 0.14, s * 0.62, s * 0.03, darkHex);
      botRun.translate(0, -trackH * 0.44, zPos);
      parts.push(botRun);

      // Roadwheels along suspension run (with crisp steel hubcaps)
      for (let i = 0; i < wheelCount; i++) {
        const wx = -trackL * 0.36 + (i / (wheelCount - 1)) * (trackL * 0.72);
        const wheel = cylAlongZ(wheelR, wheelR, s * 0.52, s * 0.05, 22, steelHex);
        wheel.translate(wx, -trackH * 0.14, zPos);
        parts.push(wheel);
        const hub = cylAlongZ(wheelR * 0.34, wheelR * 0.34, s * 0.58, s * 0.03, 14, accentHex);
        hub.translate(wx, -trackH * 0.14, zPos);
        parts.push(hub);
      }

      // Rear toothed drive sprocket & front tension idler
      for (const sx of [-trackL * 0.46, trackL * 0.46]) {
        const sprocket = cylAlongZ(wheelR * 0.92, wheelR * 0.92, s * 0.56, s * 0.05, 20, accentHex);
        sprocket.translate(sx, trackH * 0.16, zPos);
        parts.push(sprocket);
      }
    }
    return finalizeClean(parts, Math.PI / 5.2);
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
