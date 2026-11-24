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
 * AgX-calibrated finish palettes (no crushed `#000` black; steels sit cleanly in
 * sRGB 0.18–0.34, oiled woods in warm rich walnut/yew/bakelite, optics emerald-teal).
 */
export const CENTENNIAL_FINISH_COLORS: Record<
  CentennialFinishPaletteName,
  CentennialFinishColorSet
> = {
  blued_steel: {
    primary: '#323c4a',
    secondary: '#435061',
    accent: '#9aa4b2',
    furniture: '#6b4226',
    barrel: '#2d3746',
    bolt: '#b8c0cc',
    brass: '#cfa244',
    optic: '#1a6b62',
  },
  parkerized: {
    primary: '#3d444d',
    secondary: '#4c545e',
    accent: '#8d96a3',
    furniture: '#634329',
    barrel: '#373e47',
    bolt: '#adb5c0',
    brass: '#d1a345',
    optic: '#1c6f65',
  },
  stainless: {
    primary: '#aeb7c4',
    secondary: '#8d97a6',
    accent: '#4a5360',
    furniture: '#343a44',
    barrel: '#b8c1cd',
    bolt: '#cfd6e0',
    brass: '#d5a84b',
    optic: '#1d7569',
  },
  fde: {
    primary: '#a58a61',
    secondary: '#846d4c',
    accent: '#464b52',
    furniture: '#957b55',
    barrel: '#3a414a',
    bolt: '#9ea6b2',
    brass: '#d2a547',
    optic: '#1b6e64',
  },
  od_green: {
    primary: '#4b5a42',
    secondary: '#3c4936',
    accent: '#68737f',
    furniture: '#556649',
    barrel: '#373f48',
    bolt: '#a9b1bc',
    brass: '#cfa144',
    optic: '#1c7066',
  },
  bakelite_ak: {
    primary: '#38404a',
    secondary: '#4a525d',
    accent: '#9a542d',
    furniture: '#a84d24',
    barrel: '#333b44',
    bolt: '#b6beca',
    brass: '#cc9c3e',
    optic: '#206b5f',
  },
  walnut_classic: {
    primary: '#363f4c',
    secondary: '#495361',
    accent: '#b8964e',
    furniture: '#734525',
    barrel: '#313a47',
    bolt: '#bfc6d1',
    brass: '#d4a648',
    optic: '#1c6d63',
  },
  tactical_black: {
    primary: '#343b45',
    secondary: '#454e5b',
    accent: '#7c8694',
    furniture: '#39404a',
    barrel: '#2f3640',
    bolt: '#b2bac6',
    brass: '#d0a246',
    optic: '#1e766b',
  },
  desert_carc: {
    primary: '#b69c72',
    secondary: '#9c835d',
    accent: '#565a5e',
    furniture: '#8e7754',
    barrel: '#a48d67',
    bolt: '#9da5b0',
    brass: '#cfa143',
    optic: '#207268',
  },
  nato_camo: {
    primary: '#515d43',
    secondary: '#695842',
    accent: '#3d444c',
    furniture: '#4c5740',
    barrel: '#48523d',
    bolt: '#9aa2ad',
    brass: '#cea044',
    optic: '#1e7065',
  },
  russian_green: {
    primary: '#46543c',
    secondary: '#3a4633',
    accent: '#5b6357',
    furniture: '#4e5b43',
    barrel: '#3e4a37',
    bolt: '#a2aab5',
    brass: '#cda043',
    optic: '#217165',
  },
  wwii_soviet: {
    primary: '#4d5b3b',
    secondary: '#3f4c32',
    accent: '#6a5640',
    furniture: '#6d4728',
    barrel: '#455136',
    bolt: '#9ca4af',
    brass: '#c99b3f',
    optic: '#20685e',
  },
  titanium_matte: {
    primary: '#6d7886',
    secondary: '#56606d',
    accent: '#a9b3c0',
    furniture: '#464f5b',
    barrel: '#606a78',
    bolt: '#c2cad6',
    brass: '#d3a64a',
    optic: '#1d766b',
  },
  yew_wood: {
    primary: '#9e6f3d',
    secondary: '#7d5228',
    accent: '#d4c4a2',
    furniture: '#6d4224',
    barrel: '#8b6034',
    bolt: '#b9a888',
    brass: '#cfa247',
    optic: '#3c5a45',
  },
  carbon_camo: {
    primary: '#3d454f',
    secondary: '#525b66',
    accent: '#d46224',
    furniture: '#343b44',
    barrel: '#464f5a',
    bolt: '#b7c0cc',
    brass: '#c9953e',
    optic: '#1f7a6c',
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
  | 'folding_skeleton'
  | 'telescoping_ar'
  | 'bullpup_stock'
  | 'pistol_grip'
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
    const r = Math.min(hw, hh);
    parts.push(cylAlongX(r, r * 0.94, L, r * 0.08, 28, colorHex));
    const slotRings = Math.min(10, Math.max(4, Math.floor(L / 2.6)));
    for (let i = 0; i < slotRings; i++) {
      const rx = -L * 0.4 + (i / Math.max(1, slotRings - 1)) * (L * 0.8);
      const band = cylAlongX(r * 1.06, r * 1.06, 0.36, 0.04, 24, accentHex);
      band.translate(rx, 0, 0);
      parts.push(band);
      for (const side of [-1, 1] as const) {
        const vent = createChamferedBox(1.1, r * 0.36, r * 0.22, 0.03, shadeHex(colorHex, 0.42));
        vent.translate(rx, 0, side * (r * 0.94));
        parts.push(vent);
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
    // Iconic Colt SAA 1873 swept Single-Action plowhandle grip with curved brass/steel backstrap
    const pts: Array<[number, number]> = [
      [-L * 0.52, -H * 0.5],
      [L * 0.08, -H * 0.5],
      [L * 0.28, -H * 0.05],
      [L * 0.46, H * 0.48],
      [-L * 0.08, H * 0.48],
      [-L * 0.36, H * 0.04],
    ];
    parts.push(extrudeProfileXY(pts, W * 0.92, Math.min(0.24, W * 0.18), colorHex, 3));
    const strap = extrudeProfileXY(
      [
        [-L * 0.56, -H * 0.52],
        [-L * 0.42, -H * 0.52],
        [-L * 0.24, H * 0.02],
        [-L * 0.04, H * 0.48],
        [-L * 0.18, H * 0.48],
        [-L * 0.42, H * 0.04],
      ],
      W * 0.62,
      0.06,
      brassHex,
      2
    );
    parts.push(strap);
    return finalizeClean(parts, Math.PI / 4.5);
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
    // Iconic PP-19 Bizon under-barrel cylindrical 64-round helical magazine
    const tubeL = Math.max(H, W, 18);
    const tubeR = Math.max(T, 2.1) * 0.9;
    parts.push(cylAlongX(tubeR, tubeR * 0.96, tubeL, tubeR * 0.1, 28, colorHex));
    for (let i = 0; i < 6; i++) {
      const rx = -tubeL * 0.38 + (i / 5) * (tubeL * 0.76);
      const ring = cylAlongX(tubeR * 1.05, tubeR * 1.05, 0.34, 0.04, 24, accentHex);
      ring.translate(rx, 0, 0);
      parts.push(ring);
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'belt_tray') {
    // Belt feed tray + gleaming row of 8 linked brass cartridges with copper FMJ spitzer bullets
    const tray = createChamferedBox(W * 1.15, H * 0.22, T * 1.85, 0.08, colorHex);
    tray.translate(0, H * 0.12, 0);
    parts.push(tray);

    const roundCount = 8;
    const roundR = Math.max(0.45, Math.min(0.85, H * 0.075));
    const spacing = roundR * 2.55;
    for (let i = 0; i < roundCount; i++) {
      const rz = -((roundCount - 1) * spacing) * 0.5 + i * spacing;
      const ry = -Math.abs(rz) * 0.18;
      const casing = cylAlongX(roundR, roundR * 0.82, W * 0.68, 0.03, 14, brassHex);
      casing.translate(-W * 0.12, ry, rz);
      parts.push(casing);
      const bullet = cylAlongX(roundR * 0.72, 0.06, W * 0.36, 0.02, 14, copperHex);
      bullet.translate(W * 0.38, ry, rz);
      parts.push(bullet);
      const link = cylAlongX(roundR * 1.12, roundR * 1.12, W * 0.24, 0.02, 12, '#3a424c');
      link.translate(-W * 0.08, ry, rz);
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
    // Multi-station swept curved banana magazine w/ reinforcing spine ribs & flared floorplate
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

    // Flared floorplate at curved toe
    const base = createChamferedBox(W * 1.12, Math.min(1.1, H * 0.07), T * 1.14, 0.06, accentHex);
    base.rotateZ(0.28);
    base.translate(sweepX, -H * 0.5, 0);
    parts.push(base);

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
  const accentHex = shadeHex(colorHex, 1.18);
  const lensHex = '#1c8a78';
  const parts: THREE.BufferGeometry[] = [];

  if (style === 'carry_handle') {
    // Elevated arched iron carry handle (M16A1 / FAMAS) w/ open tunnel & rear peep drum
    const h = Math.max(3.6, L * 0.2);
    const w = 2.4;
    const topBar = createChamferedBox(L, 0.95, w, 0.1, colorHex);
    topBar.translate(0, h, 0);
    parts.push(topBar);

    const rearPost = createChamferedBox(L * 0.18, h, w * 0.92, 0.08, colorHex);
    rearPost.translate(-L * 0.41, h * 0.5, 0);
    parts.push(rearPost);

    const frontPost = createChamferedBox(L * 0.16, h, w * 0.88, 0.08, colorHex);
    frontPost.translate(L * 0.42, h * 0.5, 0);
    parts.push(frontPost);

    const base = createChamferedBox(L * 0.96, 0.65, w * 0.96, 0.06, accentHex);
    parts.push(base);

    const windageDrum = cylAlongZ(0.55, 0.55, 0.7, 0.05, 18, accentHex);
    windageDrum.translate(-L * 0.4, h + 0.15, w * 0.58);
    parts.push(windageDrum);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (style === 'folding_tangent') {
    // Graduated iron tangent rear sight leaf + protective side ears
    const base = createChamferedBox(L, 0.85, 2.2, 0.07, colorHex);
    parts.push(base);
    const leaf = createChamferedBox(L * 0.78, 0.48, 1.45, 0.05, accentHex);
    leaf.rotateZ(0.14);
    leaf.translate(-L * 0.04, 0.68, 0);
    parts.push(leaf);
    const slider = createChamferedBox(L * 0.2, 0.76, 1.88, 0.05, '#8e97a4');
    slider.translate(L * 0.08, 0.72, 0);
    parts.push(slider);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  // 'tactical_scope' & 'pso1_soviet'
  const rMain = Math.max(1.25, L * 0.058);
  const rObj = rMain * (style === 'pso1_soviet' ? 1.24 : 1.52);
  const rOc = rMain * 1.32;
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

  // Emerald-teal coated convex objective & ocular lenses
  const objLens = cylAlongX(rObj * 0.82, rObj * 0.78, 0.36, 0.06, 24, lensHex);
  objLens.translate(halfL - 0.72, 0, 0);
  parts.push(objLens);
  const ocLens = cylAlongX(rOc * 0.76, rOc * 0.8, 0.28, 0.05, 22, lensHex);
  ocLens.translate(-halfL + 0.36, 0, 0);
  parts.push(ocLens);

  // Center turret saddle + elevation & windage graduated knobs
  const saddle = createChamferedBox(rMain * 2.1, rMain * 2.3, rMain * 2.3, 0.14, colorHex);
  parts.push(saddle);
  const elevTurret = createBeveledCylinder(rMain * 0.62, rMain * 0.66, rMain * 1.15, 0.07, 22, accentHex);
  elevTurret.translate(0, rMain * 1.62, 0);
  parts.push(elevTurret);
  const windTurret = cylAlongZ(rMain * 0.56, rMain * 0.6, rMain * 1.05, 0.07, 20, accentHex);
  windTurret.translate(0, 0, rMain * 1.55);
  parts.push(windTurret);

  // Scope rings or Soviet PSO-1 offset side-dovetail mount bracket
  if (style === 'pso1_soviet') {
    const arm = createChamferedBox(L * 0.42, rMain * 2.6, 1.1, 0.08, accentHex);
    arm.translate(-L * 0.06, -rMain * 1.85, -rMain * 0.45);
    parts.push(arm);
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
  style: HeavyArmorStyle
): THREE.BufferGeometry {
  const s = clampPos(scale, 100); // nominal 100 cm = 1 m scale factor (tank hull ~700 cm)
  const darkHex = shadeHex(colorHex, 0.68);
  const accentHex = shadeHex(colorHex, 1.14);
  const steelHex = '#4b5563';
  const brassHex = '#cfa247';
  const parts: THREE.BufferGeometry[] = [];

  if (partKind === 'hull') {
    // 1:1 sloped composite glacis hull (modern MBT or classic WWII sloped T-34-85)
    const hullL = s * 6.8;
    const hullH = s * 1.15;
    const hullW = s * 3.35;
    const pts: Array<[number, number]> =
      style === 'mbt_wwii'
        ? [
            [-hullL * 0.5, -hullH * 0.46],
            [hullL * 0.34, -hullH * 0.5],
            [hullL * 0.52, -hullH * 0.05],
            [hullL * 0.24, hullH * 0.5],
            [-hullL * 0.44, hullH * 0.46],
            [-hullL * 0.52, hullH * 0.08],
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

    // Rear engine deck louvered radiator grilles + driver hatch hood
    const deck = createChamferedBox(hullL * 0.34, hullH * 0.12, hullW * 0.78, s * 0.03, darkHex);
    deck.translate(-hullL * 0.28, hullH * 0.52, 0);
    parts.push(deck);
    const driverHood = createChamferedBox(s * 0.72, s * 0.24, s * 0.76, s * 0.05, accentHex);
    driverHood.translate(hullL * 0.22, hullH * 0.52, style === 'mbt_wwii' ? -s * 0.55 : 0);
    parts.push(driverHood);
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (partKind === 'turret') {
    if (style === 'mbt_wwii') {
      // Iconic T-34-85 rounded cast-steel domed turret + stepped gun mantlet + commander cupola
      const rTur = s * 1.24;
      const domeProf: Array<[number, number]> = [
        [0, -s * 0.42],
        [rTur * 1.04, -s * 0.42],
        [rTur * 1.08, -s * 0.08],
        [rTur * 0.96, s * 0.32],
        [rTur * 0.72, s * 0.52],
        [0, s * 0.56],
      ];
      const dome = buildRevolvedAlongX(domeProf, 32, colorHex);
      dome.rotateZ(Math.PI / 2);
      dome.scale(1.22, 1.0, 1.0);
      parts.push(dome);

      const mantlet = createChamferedBox(s * 0.75, s * 0.62, s * 0.95, s * 0.09, accentHex);
      mantlet.translate(rTur * 1.22, 0, 0);
      parts.push(mantlet);

      const cupola = createBeveledCylinder(s * 0.4, s * 0.44, s * 0.34, s * 0.05, 24, accentHex);
      cupola.translate(-s * 0.38, s * 0.64, -s * 0.28);
      parts.push(cupola);
      return finalizeClean(parts, Math.PI / 4.2);
    }

    // Modern angular wedge composite MBT turret (T-90M / Challenger 2 / Merkava Mk 4M)
    const turL = s * 3.8;
    const turH = s * 0.88;
    const turW = s * 2.85;
    const planPts: Array<[number, number]> = [
      [-turL * 0.52, -turW * 0.42],
      [turL * 0.14, -turW * 0.5],
      [turL * 0.52, -turW * 0.2],
      [turL * 0.52, turW * 0.2],
      [turL * 0.14, turW * 0.5],
      [-turL * 0.52, turW * 0.42],
    ];
    // Extrude turret plan vertically (+Y)
    const turGeo = extrudeProfileXY(planPts, turH, s * 0.08, colorHex, 2);
    turGeo.rotateX(Math.PI / 2);
    parts.push(turGeo);

    // Armored gun mantlet + commander CITV thermal sight pod + smoke grenade launchers
    const mantlet = createChamferedBox(s * 0.72, turH * 0.74, s * 0.92, s * 0.06, accentHex);
    mantlet.translate(turL * 0.52, 0, 0);
    parts.push(mantlet);

    const citv = createBeveledCylinder(s * 0.24, s * 0.28, s * 0.48, s * 0.04, 20, darkHex);
    citv.translate(-s * 0.28, turH * 0.68, -s * 0.58);
    parts.push(citv);

    for (const side of [-1, 1] as const) {
      const smokePod = createChamferedBox(s * 0.48, s * 0.26, s * 0.32, s * 0.03, steelHex);
      smokePod.rotateZ(0.32);
      smokePod.translate(turL * 0.18, turH * 0.12, side * (turW * 0.48));
      parts.push(smokePod);
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (partKind === 'era_skirts') {
    const skirtL = s * 6.2;
    const tileCount = 8;
    const tileL = (skirtL / tileCount) * 0.92;
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < tileCount; i++) {
        const tx = -skirtL * 0.44 + (i / (tileCount - 1)) * (skirtL * 0.88);
        const tile = createChamferedBox(
          tileL,
          s * 0.72,
          s * 0.18,
          s * 0.04,
          i % 2 === 0 ? colorHex : accentHex
        );
        tile.translate(tx, 0, side * s * 1.76);
        parts.push(tile);
      }
    }
    return finalizeClean(parts, Math.PI / 5.2);
  }

  if (partKind === 'suspension_tracks') {
    const trackL = s * 6.3;
    const trackH = s * 0.94;
    const wheelCount = style === 'mbt_wwii' ? 5 : 6;
    const wheelR = s * (style === 'mbt_wwii' ? 0.42 : 0.36);

    for (const side of [-1, 1] as const) {
      const zPos = side * s * 1.48;
      // Top & bottom continuous track runs
      const topRun = createChamferedBox(trackL, s * 0.14, s * 0.62, s * 0.03, darkHex);
      topRun.translate(0, trackH * 0.44, zPos);
      parts.push(topRun);
      const botRun = createChamferedBox(trackL * 0.84, s * 0.14, s * 0.62, s * 0.03, darkHex);
      botRun.translate(0, -trackH * 0.44, zPos);
      parts.push(botRun);

      // Roadwheels along suspension run
      for (let i = 0; i < wheelCount; i++) {
        const wx = -trackL * 0.36 + (i / (wheelCount - 1)) * (trackL * 0.72);
        const wheel = cylAlongZ(wheelR, wheelR, s * 0.52, s * 0.05, 22, steelHex);
        wheel.translate(wx, -trackH * 0.14, zPos);
        parts.push(wheel);
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
    const serving = isCrossbow
      ? cylAlongZ(r * 1.45, r * 1.45, L * 0.12, 0.01, 14, '#d46224')
      : createBeveledCylinder(r * 1.45, r * 1.45, L * 0.12, 0.01, 14, '#d46224');
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
      // Leather-wrapped center handle grip for medieval English yew warbow
      const grip = createBeveledCylinder(1.65, 1.72, Math.max(12, L * 0.2), 0.15, 22, colorHex);
      parts.push(grip);
      return finalizeClean(parts, Math.PI / 4.5);
    }
    if (style === 'crossbow_recurve') {
      // Tactical crossbow rail + front riser bridge + stirrup
      const rail = createChamferedBox(L * 0.85, 3.6, 3.2, 0.16, colorHex);
      parts.push(rail);
      const riserBridge = createChamferedBox(4.8, 3.4, L * 0.28, 0.14, accentHex);
      riserBridge.translate(L * 0.42, 0.3, 0);
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
      // Graceful curved D-section medieval English yew warbow stave w/ horn tip nocks
      const halfL = L * 0.5;
      const segs = 18;
      const curvePts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const u = (i / segs) * 2 - 1; // -1 .. +1
        const y = u * halfL;
        const x = -Math.pow(Math.abs(u), 1.85) * (L * 0.14);
        curvePts.push(new THREE.Vector3(x, y, 0));
      }
      const curve = new THREE.CatmullRomCurve3(curvePts);
      const stave = new THREE.TubeGeometry(curve, 36, Math.max(1.15, L * 0.0095), 14, false);
      const staveNonIdx = stave.toNonIndexed();
      stave.dispose();
      paintGeometry(staveNonIdx, colorHex);
      parts.push(staveNonIdx);

      // Horn tip nocks at upper & lower stave tips
      for (const sgn of [-1, 1] as const) {
        const tip = createBeveledCylinder(0.65, 1.05, 3.2, 0.08, 16, '#d6c5a1');
        tip.translate(-L * 0.14, sgn * (halfL + 0.8), 0);
        parts.push(tip);
      }
      const finalized = finalizeClean(parts, Math.PI / 4.2);
      attachFlexParam(finalized, (_x, y) => {
        const frac = Math.min(1, Math.abs(y) / Math.max(halfL, 1e-4));
        return [-L * 0.1 * frac * frac, -Math.sign(y) * L * 0.03 * frac, 0];
      });
      return finalized;
    }

    if (style === 'crossbow_recurve') {
      // Swept recurve horizontal prod limbs along Z with flex displacement
      const halfSpan = L * 0.5;
      for (const side of [-1, 1] as const) {
        const pts: THREE.Vector3[] = [
          new THREE.Vector3(0, 0, side * 2.0),
          new THREE.Vector3(-L * 0.06, 0, side * halfSpan * 0.45),
          new THREE.Vector3(-L * 0.16, 0, side * halfSpan * 0.82),
          new THREE.Vector3(-L * 0.1, 0, side * halfSpan),
        ];
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.TubeGeometry(curve, 22, 1.05, 12, false);
        const nonIdx = tube.toNonIndexed();
        tube.dispose();
        paintGeometry(nonIdx, colorHex);
        parts.push(nonIdx);
      }
      const finalized = finalizeClean(parts, Math.PI / 4.5);
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
  const head = cylAlongX(shaftR * 1.45, 0.04, L * 0.11, 0.02, 16, '#b8c2cf');
  head.translate(L * 0.49, 0, 0);
  parts.push(head);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const vane = createChamferedBox(
      L * 0.14,
      shaftR * 2.4,
      0.09,
      0.015,
      i === 0 ? '#d46224' : '#e5e7eb'
    );
    vane.translate(-L * 0.36, shaftR * 1.4, 0);
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
