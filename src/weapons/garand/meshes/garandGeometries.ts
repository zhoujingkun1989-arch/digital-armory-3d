import * as THREE from 'three';
import {
  createBeveledCylinder,
  createChamferedBox,
  mergeParts,
} from '../../../engine/geometry/csgBuilder';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  buildGarandBoltGeometry,
  buildGarandBulletGuideGeometry,
  buildGarandClipLatchGeometry,
  buildGarandEnblocClipGeometry,
  buildGarandFiringPinGeometry,
  buildGarandFollowerArmGeometry,
  buildGarandFollowerGeometry,
  buildGarandHammerGeometry,
  buildGarandHammerSpringGeometry,
  buildGarandOpRodCatchGeometry,
  buildGarandOpRodSpringGeometry,
  buildGarandTriggerGeometry,
  buildGarandTriggerGuardGeometry,
  buildGarandTriggerHousingGeometry,
  buildHelicalLands,
  buildRevolvedX,
  buildWatertightTube,
  extrudeShapeX,
  extrudeShapeY,
  extrudeShapeZ,
  GARAND_PALETTE,
  sanitizeGarandMesh,
} from './garandExtraGeometries';

// ============================================================================
// 1. PRECISION 2K UV ATLAS UNWRAPPERS (`garand_walnut_*` & `garand_parkerized_*`)
// ============================================================================

/**
 * Unwraps F-03 American Black Walnut Main Stock onto `garand_walnut_*` (2048 × 1024):
 *  - Left flank  (`v ∈ [0.03, 0.33], u ∈ [0.03, 0.97]`): Springfield `DAS` + Crossed Cannons cartouche!
 *  - Right flank (`v ∈ [0.36, 0.66], u ∈ [0.03, 0.97]`): Circled `[P]` proof on pistol wrist!
 *  - Comb/belly  (`v ∈ [0.72, 0.96], u ∈ [0.03, 0.74]`): Quarter-sawn walnut grain
 *  - Steel hardware (`v ∈ [0.72, 0.96], u ∈ [0.78, 0.97]`): Parkerized sling swivel & forend ferrule
 */
export function applyGarandWalnutStockUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz, cr, cg } = triInfo(pos, col, i, i + 1, i + 2);
    // Neutral parkerized steel has cr ≈ cg, whereas oiled walnut has cr > cg * 1.45
    const isSteel = cr < cg * 1.25;
    let band: 'left' | 'right' | 'top' | 'steel' = 'top';
    if (isSteel) band = 'steel';
    else if (fnz < -0.32 && cz < -0.22) band = 'left';
    else if (fnz > 0.32 && cz > 0.22) band = 'right';

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -46.6) / 77.0);
      const yNorm = clamp01((y - -11.8) / 12.8);
      const zNorm = clamp01((z + 2.05) / 4.1);

      let u: number;
      let v: number;
      if (band === 'left') {
        u = 0.03 + (1.0 - xNorm) * 0.94;
        v = 0.03 + yNorm * 0.3;
      } else if (band === 'right') {
        u = 0.03 + xNorm * 0.94;
        v = 0.36 + yNorm * 0.3;
      } else if (band === 'steel') {
        u = 0.79 + fractPos((x + z) * 0.32) * 0.18;
        v = 0.72 + yNorm * 0.24;
      } else {
        u = 0.03 + xNorm * 0.71;
        v = 0.72 + zNorm * 0.24;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-04 / F-05 Rear & Front Walnut Handguards onto upper strip of `garand_walnut_*`:
 *  - Oiled walnut arch (`u ∈ [0.03, 0.74], v ∈ [0.72, 0.96]`)
 *  - Stamped steel clip / vented ferrule (`u ∈ [0.78, 0.97], v ∈ [0.72, 0.96]`)
 */
export function applyGarandHandguardUVs(
  geo: THREE.BufferGeometry,
  halfSpanX: number
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr, cg } = triInfo(pos, col, i, i + 1, i + 2);
    const isSteel = cr < cg * 1.25;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x + halfSpanX) / (halfSpanX * 2));
      const zNorm = clamp01((z + 1.55) / 3.1);
      const yNorm = clamp01((y + 1.2) / 2.6);

      let u: number;
      let v: number;
      if (isSteel) {
        u = 0.79 + fractPos((x + z) * 0.36) * 0.18;
        v = 0.72 + yNorm * 0.24;
      } else {
        u = 0.03 + xNorm * 0.71;
        v = 0.72 + zNorm * 0.24;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-01 Forged Open-Top Heeled Receiver onto `garand_parkerized_*` (2048 × 1024):
 *  - Top bridge & sloped heel (`v ∈ [0.64, 0.96], u ∈ [0.04, 0.72]`):
 *    `U.S. RIFLE / CAL. .30 M1 / SPRINGFIELD ARMORY / 2841944` on receiver heel!
 *  - Receiver side walls & legs (`v ∈ [0.34, 0.58], u ∈ [0.04, 0.72]`): `D 28291 32` drawing code!
 *  - Bright bolt/op-rod raceway rails (`v ∈ [0.34, 0.58], u ∈ [0.75, 0.97]`)
 */
export function applyGarandReceiverUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cy, fny, cr } = triInfo(pos, col, i, i + 1, i + 2);
    const isBright = cr > 0.22;
    const isTopHeel = !isBright && fny > 0.35 && cy > 0.85;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -8.6) / 15.0);
      const yNorm = clamp01((y - -2.35) / 4.7);
      const zNorm = clamp01((z + 1.48) / 2.96);

      let u: number;
      let v: number;
      if (isTopHeel) {
        u = 0.04 + xNorm * 0.68;
        v = 0.64 + (1.0 - zNorm) * 0.32;
      } else if (isBright) {
        u = 0.75 + xNorm * 0.22;
        v = 0.34 + yNorm * 0.24;
      } else {
        u = 0.04 + xNorm * 0.68;
        v = 0.34 + yNorm * 0.24;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-02 T105 Aperture Peep Sight onto upper-right quadrant of `garand_parkerized_*`:
 *  - `u ∈ [0.75, 0.98], v ∈ [0.64, 0.96]`: Range graduations (`2 4 6 8 10 12`) & windage arrows!
 */
export function applyGarandRearSightUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = 0.75 + clamp01((z + 1.65) / 3.3) * 0.22;
    const v = 0.64 + clamp01((x + y + 1.4) / 2.8) * 0.32;
    uvs[i * 2] = clamp01(u);
    uvs[i * 2 + 1] = clamp01(v);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Parkerized + White-Stainless / Burnished-Lug mechanical assemblies
 * (`garand_op_rod`, `garand_bolt`, `garand_trigger_housing`) onto mid band of `garand_parkerized_*`:
 *  - Manganese-phosphate steel (`u ∈ [0.04, 0.72], v ∈ [0.34, 0.58]`)
 *  - White stainless piston / silver bolt lugs (`u ∈ [0.75, 0.97], v ∈ [0.34, 0.58]`)
 */
export function applyGarandParkerizedPartUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = Math.max(1e-4, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-4, bb.max.y - bb.min.y);

  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr } = triInfo(pos, col, i, i + 1, i + 2);
    const isBright = cr > 0.25;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const xNorm = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const yNorm = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      const u = isBright ? 0.75 + xNorm * 0.22 : 0.04 + xNorm * 0.68;
      const v = 0.34 + yNorm * 0.24;
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps M-01 WWII 8-Round Stamped Spring-Steel En-Bloc Clip onto bottom band of `garand_parkerized_*`:
 *  - `u ∈ [0.04, 0.96], v ∈ [0.04, 0.29]`: Charcoal spring steel, `SA` ordnance stamp, brass rub & silver lips!
 */
export function applyGarandEnblocClipUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const xNorm = clamp01((pos.getX(i) + 3.2) / 5.5);
    const yNorm = clamp01((pos.getY(i) + 1.52) / 3.04);
    uvs[i * 2] = clamp01(0.04 + xNorm * 0.92);
    uvs[i * 2 + 1] = clamp01(0.04 + yNorm * 0.25);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 2. 24" .30-06 BARREL, MUZZLE GAS CYLINDER & LONG-STROKE OP-ROD ('slide' B-01..05)
// ============================================================================

/**
 * B-01: 24-Inch (61.0 cm / 610 mm) .30-06 Springfield Stepped Rifled Barrel
 * (assembledPos: [0, 1.15, 0] — Stationary fixed barrel!)
 * Spans local/world X ∈ [+2.00, +63.00] (exact 61.00 cm = 24.01" length!):
 *  - Hollow .30-06 bottleneck chamber (X ∈ [2.00, 8.33]), 4-groove 1:10" right-hand rifled bore
 *  - Stepped Springfield profile w/ lower-band journal at X ≈ 30.65
 *  - Muzzle 3-spline gas-cylinder lands (X ∈ [55.50, 61.45]) + bottom gas port at X = 59.60!
 */
export function buildGarandBarrelGeometry(): THREE.BufferGeometry {
  const crownRim = 0.56;
  const crownBore = 0.39;
  const crownDepth = 0.045;

  const barrelHollow = buildRevolvedX(
    [
      [0.62, 2.0], // Chamfered .30-06 chamber mouth
      [1.12, 2.0], // Heavy breech face inside receiver ring
      [1.12, 6.25], // Receiver thread shank
      [1.06, 6.4], // Receiver shoulder step
      [1.04, 10.8], // Heavy chamber reinforce cylinder
      [0.95, 11.4], // Rear taper step
      [0.86, 29.85], // Tapered rear contour under rear handguard
      [0.81, 30.0], // Lower-band step journal
      [0.81, 31.35],
      [0.78, 31.5], // Forward contour under front handguard
      [0.72, 54.6],
      [0.68, 54.75], // 3-spline gas-cylinder seat journal
      [0.68, 61.42],
      [0.62, 61.48], // Threaded muzzle lock spigot
      [0.62, 62.94],
      [crownRim, 63.0], // Target crown outer bevel
      [crownBore, 63.0 - crownDepth], // Recessed 11° target crown dish
      [0.381, 62.92], // Ø7.62mm (.308") rifled bore
      [0.381, 8.45], // Rifled bore throat
      [0.425, 8.33], // .30-06 case neck (Ø8.6mm)
      [0.425, 7.65],
      [0.575, 7.15], // 17°30' .30-06 bottleneck shoulder!
      [0.6, 2.08], // 63.3mm .30-06 case body wall
      [0.62, 2.0], // Closes watertight loop
    ],
    32,
    GARAND_PALETTE.PARKERIZED_STEEL
  );

  // 4 right-hand 1:10" (25.4 cm) Springfield Armory rifling lands inside the Ø7.62mm bore
  const rifling = buildHelicalLands({
    count: 4,
    boreR: 0.381,
    depth: 0.018,
    width: 0.065,
    x0: 8.55,
    x1: 62.88,
    twistCm: 25.4,
    color: GARAND_PALETTE.WHITE_PISTON,
  });

  // 3 longitudinal barrel splines at muzzle (X ∈ [55.20, 61.35]) keying garand_gas_cylinder!
  const gasSplines = buildHelicalLands({
    count: 3,
    boreR: 0.725,
    depth: 0.045,
    width: 0.14,
    x0: 55.2,
    x1: 61.35,
    twistCm: 1e9,
    segments: 2,
    color: GARAND_PALETTE.BURNISHED_LUG,
  });

  // Breech extractor-cut collar & bottom muzzle gas-port collar (X = 59.60, local Y = -0.72)
  const breechIndexRing = createChamferedBox(
    0.58,
    0.34,
    0.48,
    0.025,
    GARAND_PALETTE.WHITE_PISTON
  ).translate(2.32, 0.88, 0.56);

  const gasPortTransferCollar = createBeveledCylinder(
    0.22,
    0.22,
    0.28,
    0.02,
    16,
    GARAND_PALETTE.PARKERIZED_DARK
  ).translate(59.6, -0.72, 0);

  return sanitizeGarandMesh(
    mergeParts([
      barrelHollow,
      rifling,
      gasSplines,
      breechIndexRing,
      gasPortTransferCollar,
    ])
  );
}

/**
 * B-02: Muzzle-Mounted Stainless Gas Cylinder w/ Integral Stacking Swivel & M1 Bayonet Lug
 * (assembledPos: [58.40, 0.25, 0])
 * World X ∈ [+54.60, +61.45]:
 *  - Upper barrel spline ring (local Y = +0.90 -> world Y = +1.15)
 *  - Lower stainless gas expansion tube (local Y = -0.60 -> world Y = -0.35)
 *  - Integral M1 bayonet lug + hinged 3-rifle stacking swivel!
 */
export function buildGarandGasCylinderGeometry(): THREE.BufferGeometry {
  const upperBarrelRing = buildRevolvedX(
    [
      [0.72, -3.15],
      [0.95, -3.15],
      [0.95, 3.02],
      [0.72, 3.02],
      [0.72, -3.15],
    ],
    28,
    GARAND_PALETTE.STAINLESS_GAS
  ).translate(0, 0.9, 0);

  const rearBarrelRing = buildRevolvedX(
    [
      [0.73, -3.8],
      [0.94, -3.8],
      [0.94, -3.35],
      [0.73, -3.35],
      [0.73, -3.8],
    ],
    26,
    GARAND_PALETTE.STAINLESS_GAS
  ).translate(0, 0.9, 0);

  const lowerGasTube = buildRevolvedX(
    [
      [0.67, -3.8],
      [0.92, -3.8],
      [0.94, -2.2],
      [0.94, 3.05],
      [0.67, 3.05],
      [0.67, -3.8],
    ],
    28,
    GARAND_PALETTE.STAINLESS_GAS
  ).translate(0, -0.6, 0);

  // Vertical gas-transfer bridge web + top front-sight dovetail base
  const midBridgeWeb = createChamferedBox(
    5.8,
    0.86,
    0.96,
    0.04,
    GARAND_PALETTE.STAINLESS_GAS
  ).translate(-0.15, 0.15, 0);

  const sightDovetailBoss = createChamferedBox(
    1.85,
    0.42,
    0.92,
    0.03,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(1.15, 1.92, 0);

  // Integral rear M1 / M1905 bayonet T-lug (local X ∈ [-2.85, -1.45], Y = -1.62)
  const bayonetStem = createChamferedBox(
    1.38,
    0.34,
    0.42,
    0.025,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(-2.15, -1.56, 0);

  const bayonetTLug = createChamferedBox(
    1.42,
    0.22,
    0.68,
    0.025,
    GARAND_PALETTE.WHITE_PISTON
  ).translate(-2.15, -1.74, 0);

  // Forward stacking-swivel ears & U-shaped stacking swivel loop!
  const swivelEars = createChamferedBox(
    1.05,
    0.58,
    0.76,
    0.03,
    GARAND_PALETTE.STAINLESS_GAS
  ).translate(0.75, -1.65, 0);

  const swivelScrew = createBeveledCylinder(
    0.13,
    0.13,
    0.88,
    0.02,
    14,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateX(Math.PI / 2)
    .translate(0.75, -1.78, 0);

  const stackingSwivelLoop = buildWatertightTube(
    [
      new THREE.Vector3(0.75, -1.78, -0.44),
      new THREE.Vector3(0.55, -2.42, -0.52),
      new THREE.Vector3(0.35, -2.85, -0.32),
      new THREE.Vector3(0.35, -2.85, 0.32),
      new THREE.Vector3(0.55, -2.42, 0.52),
      new THREE.Vector3(0.75, -1.78, 0.44),
    ],
    0.085,
    10,
    GARAND_PALETTE.BURNISHED_LUG
  );

  return sanitizeGarandMesh(
    mergeParts([
      upperBarrelRing,
      rearBarrelRing,
      lowerGasTube,
      midBridgeWeb,
      sightDovetailBoss,
      bayonetStem,
      bayonetTLug,
      swivelEars,
      swivelScrew,
      stackingSwivelLoop,
    ])
  );
}

/**
 * B-03: Figure-8 Gas Cylinder Lock & Slotted Cross-Valve Lock Screw
 * (assembledPos: [61.85, 0.38, 0])
 * Locks gas cylinder onto barrel muzzle threads and seals front of gas tube w/ grenade valve!
 */
export function buildGarandGasLockScrewGeometry(): THREE.BufferGeometry {
  // Figure-8 gas cylinder lock: upper barrel-muzzle thread collar + lower gas-plug collar + waist web
  const upperLockCollar = buildRevolvedX(
    [
      [0.63, -0.42],
      [0.89, -0.42],
      [0.89, 0.24],
      [0.63, 0.24],
      [0.63, -0.42],
    ],
    26,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(0, 0.77, 0);

  const lowerLockCollar = buildRevolvedX(
    [
      [0.52, -0.42],
      [0.86, -0.42],
      [0.86, 0.24],
      [0.52, 0.24],
      [0.52, -0.42],
    ],
    26,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(0, -0.73, 0);

  const figure8Waist = createChamferedBox(
    0.64,
    0.86,
    1.18,
    0.03,
    GARAND_PALETTE.PARKERIZED_MID
  ).translate(-0.09, 0.02, 0);

  // Stainless cross-slotted gas cylinder lock plug screw w/ poppet grenade valve center
  const plugBody = buildRevolvedX(
    [
      [0, -0.55],
      [0.51, -0.52],
      [0.51, 0.24],
      [0.68, 0.28],
      [0.68, 0.54],
      [0.62, 0.58],
      [0.24, 0.58],
      [0.24, 0.46],
      [0, 0.46],
    ],
    24,
    GARAND_PALETTE.WHITE_PISTON
  ).translate(0, -0.73, 0);

  // Raised quarter-quadrant screwdriver lugs forming crisp WWII cross-slot on front face!
  const quadOffsets: ReadonlyArray<readonly [number, number]> = [
    [0.34, 0.34],
    [0.34, -0.34],
    [-0.34, 0.34],
    [-0.34, -0.34],
  ];
  const lugs = quadOffsets.map(([dy, dz]) =>
    createChamferedBox(
      0.12,
      0.26,
      0.26,
      0.015,
      GARAND_PALETTE.BURNISHED_LUG
    ).translate(0.58, -0.73 + dy, dz)
  );

  return sanitizeGarandMesh(
    mergeParts([upperLockCollar, lowerLockCollar, figure8Waist, plugBody, ...lugs])
  );
}

/**
 * B-04: Winged Blade Front Sight on Gas Cylinder Dovetail
 * (assembledPos: [59.55, 2.38, 0])
 */
export function buildGarandFrontSightGeometry(): THREE.BufferGeometry {
  // Cross-section in (Z, Y) extruded along +X: dovetail base + central blade + flared protective wings!
  const sightProfile = new THREE.Shape();
  sightProfile.moveTo(-0.48, -0.32);
  sightProfile.lineTo(0.48, -0.32);
  sightProfile.lineTo(0.42, -0.06);
  sightProfile.lineTo(0.64, 0.36); // Right protective ear outer flare
  sightProfile.lineTo(0.56, 0.54);
  sightProfile.lineTo(0.44, 0.52);
  sightProfile.lineTo(0.32, 0.02);
  sightProfile.lineTo(0.06, 0.02);
  sightProfile.lineTo(0.045, 0.48); // Central .062" front sight post!
  sightProfile.lineTo(-0.045, 0.48);
  sightProfile.lineTo(-0.06, 0.02);
  sightProfile.lineTo(-0.32, 0.02);
  sightProfile.lineTo(-0.44, 0.52);
  sightProfile.lineTo(-0.56, 0.54);
  sightProfile.lineTo(-0.64, 0.36); // Left protective ear outer flare
  sightProfile.lineTo(-0.42, -0.06);
  sightProfile.closePath();

  const sightBlock = extrudeShapeX(
    sightProfile,
    -0.68,
    1.36,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.02,
    8
  );

  const clampScrew = createBeveledCylinder(
    0.12,
    0.12,
    1.08,
    0.015,
    14,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateX(Math.PI / 2)
    .translate(0.15, -0.18, 0);

  return sanitizeGarandMesh(mergeParts([sightBlock, clampScrew]));
}

/**
 * B-05: Full-Length Curved Long-Stroke Operating Rod (`garand_op_rod`)
 * (assembledPos: [28.00, 0.15, 0])
 * World X ∈ [+0.35, +59.25] (58.9 cm full length!):
 *  - Front white 410 stainless piston head (world X = +59.25, Y = -0.35, Z = 0)
 *  - Hollow parkerized tube + authentic 3D S-bend sweeping out to +Z = +1.15, Y = +0.90
 *  - Curved cam hump housing the 4mm free-travel + 32° helical cam slot + integral charging handle!
 */
export function buildGarandOpRodGeometry(): THREE.BufferGeometry {
  // 1. Front centerless-ground white stainless gas piston head & gas-seal grooves (local Y = -0.50)
  const pistonHead = buildRevolvedX(
    [
      [0, 29.5],
      [0.44, 29.55],
      [0.44, 30.25],
      [0.65, 30.32], // Rear piston land
      [0.65, 30.58],
      [0.59, 30.61], // Labyrinth gas-seal groove 1
      [0.59, 30.71],
      [0.65, 30.74], // Mid piston land
      [0.65, 30.94],
      [0.59, 30.97], // Labyrinth gas-seal groove 2
      [0.59, 31.06],
      [0.65, 31.09], // Front piston face land
      [0.65, 31.25],
      [0.28, 31.25], // Concave gas-cup face
      [0, 31.14],
    ],
    26,
    GARAND_PALETTE.WHITE_PISTON
  ).translate(0, -0.5, 0);

  // 2. Straight hollow forward op-rod tube (local X ∈ [-11.2, +29.55], Y = -0.50, Z = 0)
  const forwardTube = buildRevolvedX(
    [
      [0.41, -11.2],
      [0.54, -11.2],
      [0.54, 24.5],
      [0.48, 25.2],
      [0.48, 29.55],
      [0.41, 29.55],
      [0.41, -11.2],
    ],
    24,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(0, -0.5, 0);

  // 3. Signature Garand 3D S-bend sweeping from [X=-11.2, Y=-0.50, Z=0] around barrel breech
  //    out to right receiver raceway [X=-22.4, Y=+0.78, Z=+1.16]!
  const sBendPts: THREE.Vector3[] = [];
  const bendSteps = 16;
  for (let i = 0; i <= bendSteps; i++) {
    const u = i / bendSteps;
    const s = u * u * (3 - 2 * u);
    const x = -11.1 - u * 11.4;
    const y = -0.5 + s * 1.28;
    const z = s * 1.16;
    sBendPts.push(new THREE.Vector3(x, y, z));
  }
  const sBendArm = buildWatertightTube(
    sBendPts,
    (u) => 0.48 - u * 0.08,
    18,
    GARAND_PALETTE.PARKERIZED_STEEL
  );

  // Bottom op-rod catch engagement shoulder on underside of tube (local X ≈ -22.2)
  const catchNotchLug = createChamferedBox(
    1.15,
    0.42,
    0.44,
    0.025,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(-22.15, 0.36, 0.96);

  // 4. Iconic Curved Cam Hump riding over garand_bolt's right operating lug (local X ∈ [-27.65, -22.20])
  const humpShape = new THREE.Shape();
  humpShape.moveTo(-27.65, 0.48);
  humpShape.lineTo(-22.15, 0.48);
  humpShape.lineTo(-22.15, 1.18);
  humpShape.quadraticCurveTo(-24.2, 1.78, -25.85, 1.72); // Arched cam hump roof!
  humpShape.lineTo(-27.65, 1.15);
  humpShape.closePath();

  // Helical cam track slot hole (4mm straight dwell + 32° angled cam slot!)
  const camSlot = new THREE.Path();
  camSlot.moveTo(-26.85, 0.76);
  camSlot.lineTo(-25.95, 0.76);
  camSlot.lineTo(-24.35, 1.26);
  camSlot.lineTo(-23.65, 1.26);
  camSlot.lineTo(-23.65, 0.98);
  camSlot.lineTo(-24.45, 0.98);
  camSlot.lineTo(-25.85, 0.58);
  camSlot.lineTo(-26.85, 0.58);
  camSlot.closePath();
  humpShape.holes.push(camSlot);

  const camHump = extrudeShapeZ(
    humpShape,
    1.22,
    0.54,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.03,
    10
  );

  // Integral curved right-hand Garand charging handle wing (extending to Z = +2.22)!
  const handleNeck = createChamferedBox(
    1.45,
    0.34,
    0.68,
    0.03,
    GARAND_PALETTE.PARKERIZED_MID
  ).translate(-26.45, 0.98, 1.65);

  const handleWing = createChamferedBox(
    1.75,
    0.72,
    0.38,
    0.04,
    GARAND_PALETTE.BURNISHED_LUG
  )
    .rotateX(-0.22)
    .translate(-26.65, 1.08, 2.04);

  return sanitizeGarandMesh(
    applyGarandParkerizedPartUVs(
      mergeParts([
        pistonHead,
        forwardTube,
        sBendArm,
        catchNotchLug,
        camHump,
        handleNeck,
        handleWing,
      ])
    ),
    true
  );
}

// ============================================================================
// 3. FORGED OPEN-TOP RECEIVER, T105 SIGHT & BLACK WALNUT STOCK ('frame' F-01..07)
// ============================================================================

/**
 * F-01: Iconic WWII Forged Open-Top Heeled Receiver (`isShell: true`, assembledPos: [0, 0, 0])
 * Spans world X ∈ [-8.60, +6.40], Y ∈ [-2.35, +2.35], Z ∈ [-1.42, +1.48]:
 *  - Front cylindrical barrel ring (X ∈ [+3.45, +6.40])
 *  - Open-top 8-round en-bloc clip cavity (X ∈ [-4.40, +2.85]) w/ left clip-latch window
 *  - Right-side bolt & op-rod raceway track (+Z)
 *  - Rear safety bridge, serrated sight ears & Springfield Armory sloped receiver heel!
 */
export function buildGarandReceiverGeometry(): THREE.BufferGeometry {
  // 1. Front forged barrel-mounting receiver ring (X ∈ [3.40, 6.40], centered at bore Y = 1.15)
  const frontRing = buildRevolvedX(
    [
      [1.08, 3.4],
      [1.42, 3.4],
      [1.42, 6.32],
      [1.34, 6.4],
      [1.08, 6.4],
      [1.08, 3.4],
    ],
    28,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(0, 1.15, 0);

  // 2. Left receiver wall & lower trigger-housing locking leg (Z ≈ -1.16)
  const leftSideShape = new THREE.Shape();
  leftSideShape.moveTo(-8.55, -0.85);
  leftSideShape.lineTo(-6.2, -2.28); // Rear trigger-housing lug leg
  leftSideShape.lineTo(3.85, -2.28); // Front trigger-housing lug leg
  leftSideShape.lineTo(5.85, -0.45);
  leftSideShape.lineTo(5.85, 1.98);
  leftSideShape.lineTo(-4.45, 1.98); // Open-top clip-loading rim
  leftSideShape.lineTo(-5.65, 2.32); // Elevated rear sight ear!
  leftSideShape.lineTo(-7.35, 2.32);
  leftSideShape.lineTo(-8.6, 1.48); // Iconic sloped M1 Garand receiver heel!
  leftSideShape.closePath();

  // Left-wall window for garand_clip_latch!
  const latchSlot = new THREE.Path();
  latchSlot.moveTo(-2.85, 0.12);
  latchSlot.lineTo(0.55, 0.12);
  latchSlot.lineTo(0.55, 0.82);
  latchSlot.lineTo(-2.85, 0.82);
  latchSlot.closePath();
  leftSideShape.holes.push(latchSlot);

  const leftReceiverWall = extrudeShapeZ(
    leftSideShape,
    -1.14,
    0.52,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.03,
    10
  );

  // 3. Right receiver wall w/ lowered ejection & bolt/op-rod raceway cut (Z ≈ +1.14)
  const rightSideShape = new THREE.Shape();
  rightSideShape.moveTo(-8.55, -0.85);
  rightSideShape.lineTo(-6.2, -2.28);
  rightSideShape.lineTo(3.85, -2.28);
  rightSideShape.lineTo(5.85, -0.45);
  rightSideShape.lineTo(5.85, 0.72); // Lowered right op-rod & brass-ejection port!
  rightSideShape.lineTo(-4.35, 0.72);
  rightSideShape.lineTo(-5.65, 2.32); // Right rear sight ear
  rightSideShape.lineTo(-7.35, 2.32);
  rightSideShape.lineTo(-8.6, 1.48);
  rightSideShape.closePath();

  const rightReceiverWall = extrudeShapeZ(
    rightSideShape,
    1.14,
    0.52,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.03,
    10
  );

  // Right outer op-rod guide ledge (Z = +1.42)
  const rightOpRodRail = createChamferedBox(
    9.8,
    0.42,
    0.26,
    0.025,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(0.65, 0.56, 1.42);

  // 4. Sloped Springfield Armory Receiver Heel Deck & Rear Safety Bridge (X ∈ [-8.60, -4.45])
  //    (Carries `U.S. RIFLE / CAL. .30 M1 / SPRINGFIELD ARMORY / 2841944`!)
  const heelDeck = createChamferedBox(
    3.15,
    0.48,
    2.48,
    0.03,
    GARAND_PALETTE.PARKERIZED_STEEL
  )
    .rotateZ(0.24)
    .translate(-7.05, 1.62, 0);

  const safetyBridge = createChamferedBox(
    1.25,
    0.52,
    2.32,
    0.03,
    GARAND_PALETTE.PARKERIZED_MID
  ).translate(-5.02, 1.86, 0);

  // Internal vertical en-bloc clip guideways inside magazine cavity (X = -0.95, Z = ±0.82)
  const clipGuideL = createChamferedBox(
    0.46,
    2.85,
    0.18,
    0.02,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(-0.95, -0.15, -0.82);

  const clipGuideR = createChamferedBox(
    0.46,
    2.85,
    0.18,
    0.02,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(-0.95, -0.15, 0.82);

  return sanitizeGarandMesh(
    applyGarandReceiverUVs(
      mergeParts([
        frontRing,
        leftReceiverWall,
        rightReceiverWall,
        rightOpRodRail,
        heelDeck,
        safetyBridge,
        clipGuideL,
        clipGuideR,
      ])
    ),
    true
  );
}

/**
 * F-02: T105 Micrometric Aperture Peep Rear Sight w/ Dual Knurled Elevation & Windage Drums
 * (assembledPos: [-6.85, 2.48, 0])
 */
export function buildGarandRearSightGeometry(): THREE.BufferGeometry {
  const sightBase = createChamferedBox(
    1.68,
    0.56,
    1.76,
    0.03,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(0, -0.18, 0);

  // Hooded aperture peep bar w/ true .070" peep hole!
  const peepShape = new THREE.Shape();
  peepShape.moveTo(-0.46, -0.1);
  peepShape.lineTo(0.46, -0.1);
  peepShape.lineTo(0.42, 0.56);
  peepShape.absarc(0, 0.56, 0.42, 0, Math.PI, false);
  peepShape.lineTo(-0.46, -0.1);
  peepShape.closePath();

  const peepHole = new THREE.Path();
  peepHole.absarc(0, 0.56, 0.14, 0, Math.PI * 2, true);
  peepShape.holes.push(peepHole);

  const apertureStem = extrudeShapeX(
    peepShape,
    -0.28,
    0.56,
    GARAND_PALETTE.PARKERIZED_MID,
    0.02,
    14
  );

  // Left elevation drum (-Z) & Right windage knob (+Z) + cross pinion shaft
  const crossPinion = createBeveledCylinder(
    0.22,
    0.22,
    3.12,
    0.02,
    18,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateX(Math.PI / 2)
    .translate(0, -0.12, 0);

  const elevationDrumL = createBeveledCylinder(
    0.56,
    0.56,
    0.44,
    0.03,
    24,
    GARAND_PALETTE.PARKERIZED_STEEL
  )
    .rotateX(Math.PI / 2)
    .translate(0, -0.12, -1.28);

  const windageKnobR = createBeveledCylinder(
    0.54,
    0.54,
    0.42,
    0.03,
    24,
    GARAND_PALETTE.PARKERIZED_STEEL
  )
    .rotateX(Math.PI / 2)
    .translate(0, -0.12, 1.28);

  return sanitizeGarandMesh(
    applyGarandRearSightUVs(
      mergeParts([
        sightBase,
        apertureStem,
        crossPinion,
        elevationDrumL,
        windageKnobR,
      ])
    ),
    true
  );
}

/**
 * F-03: Full-Length Linseed-Oiled American Black Walnut Rifle Stock
 * (`isShell: true`, assembledPos: [0, 0, 0])
 * Spans world X ∈ [-46.60, +30.40] (77.0 cm!), Y ∈ [-11.80, +0.92], Z ∈ [-2.02, +2.02]:
 *  - Solid buttstock w/ comb, heel, toe & sculpted semi-pistol grip wrist
 *  - Hollowed central receiver & trigger-housing bedding mortise (X ∈ [-9.20, +6.80])
 *  - U-channel walnut forend cradling barrel & op-rod (X ∈ [+6.80, +30.40])
 *  - Steel rear sling swivel & front stock ferrule!
 */
export function buildGarandWalnutStockGeometry(): THREE.BufferGeometry {
  // 1. Rear solid buttstock & semi-pistol grip wrist (X ∈ [-46.60, -8.80])
  const buttShape = new THREE.Shape();
  buttShape.moveTo(-46.6, -11.75); // Buttstock toe
  buttShape.lineTo(-46.45, -0.45); // Buttstock heel
  buttShape.lineTo(-22.5, -0.42); // Straight comb line
  buttShape.quadraticCurveTo(-18.5, -0.48, -16.2, -1.45); // Comb nose drop
  buttShape.lineTo(-8.8, -0.25); // Tang neck joining receiver cheeks
  buttShape.lineTo(-8.8, -4.45); // Behind trigger guard
  buttShape.quadraticCurveTo(-10.8, -4.65, -12.4, -6.75); // Semi-pistol grip front curve (stamped [P]!)
  buttShape.quadraticCurveTo(-13.4, -7.15, -14.8, -6.65); // Pistol grip cap
  buttShape.quadraticCurveTo(-16.8, -5.85, -19.5, -6.45); // Belly behind grip
  buttShape.lineTo(-46.6, -11.75); // Straight classic Garand toe line!
  buttShape.closePath();

  const rearButtstock = extrudeShapeZ(
    buttShape,
    0,
    3.86,
    GARAND_PALETTE.WALNUT_HEART,
    0.16,
    12
  );

  // 2. Left & Right Receiver / Magazine Bedding Cheeks (X ∈ [-9.10, +7.10]) leaving open central mortise!
  const cheekShape = new THREE.Shape();
  cheekShape.moveTo(-9.1, -4.45);
  cheekShape.lineTo(6.4, -4.15);
  cheekShape.lineTo(7.1, -1.85);
  cheekShape.lineTo(7.1, 0.88);
  cheekShape.lineTo(-9.1, 0.88);
  cheekShape.closePath();

  const leftCheek = extrudeShapeZ(
    cheekShape,
    -1.64,
    0.76,
    GARAND_PALETTE.WALNUT_HEART,
    0.05,
    8
  );
  const rightCheek = extrudeShapeZ(
    cheekShape,
    1.64,
    0.76,
    GARAND_PALETTE.WALNUT_HEART,
    0.05,
    8
  );

  // 3. U-Channel Forend (X ∈ [+6.85, +30.25]) extruded along +X with barrel & op-rod clearance trough!
  const forendCross = new THREE.Shape();
  forendCross.moveTo(-1.72, 0.82);
  forendCross.lineTo(-1.72, -1.15);
  forendCross.quadraticCurveTo(-1.68, -1.95, 0, -2.02);
  forendCross.quadraticCurveTo(1.68, -1.95, 1.72, -1.15);
  forendCross.lineTo(1.72, 0.82);
  forendCross.lineTo(1.24, 0.82);
  forendCross.lineTo(1.18, -0.88);
  forendCross.quadraticCurveTo(0, -1.28, -1.18, -0.88);
  forendCross.lineTo(-1.24, 0.82);
  forendCross.closePath();

  const walnutForend = extrudeShapeX(
    forendCross,
    6.85,
    23.35,
    GARAND_PALETTE.WALNUT_HEART,
    0.04,
    10
  );

  // 4. Stamped parkerized steel front stock ferrule (X ∈ [30.05, 30.45]) & rear butt sling swivel!
  const stockFerrule = extrudeShapeX(
    forendCross,
    30.05,
    0.42,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.02,
    10
  );

  const rearSwivelBracket = createChamferedBox(
    2.15,
    0.48,
    0.96,
    0.03,
    GARAND_PALETTE.PARKERIZED_STEEL
  )
    .rotateZ(0.19)
    .translate(-38.6, -10.15, 0);

  const rearSwivelLoop = buildWatertightTube(
    [
      new THREE.Vector3(-38.6, -10.35, -0.52),
      new THREE.Vector3(-39.1, -11.05, -0.62),
      new THREE.Vector3(-39.3, -11.35, 0),
      new THREE.Vector3(-39.1, -11.05, 0.62),
      new THREE.Vector3(-38.6, -10.35, 0.52),
    ],
    0.09,
    10,
    GARAND_PALETTE.BURNISHED_LUG
  );

  return sanitizeGarandMesh(
    applyGarandWalnutStockUVs(
      mergeParts([
        rearButtstock,
        leftCheek,
        rightCheek,
        walnutForend,
        stockFerrule,
        rearSwivelBracket,
        rearSwivelLoop,
      ])
    ),
    true
  );
}

/**
 * F-04: Upper Rear Walnut Barrel Handguard & Stamped Spring Clip
 * (`isShell: true`, assembledPos: [18.40, 1.45, 0])
 * World X ∈ [+6.65, +30.15] (23.5 cm long), arching cleanly over `garand_barrel`!
 */
export function buildGarandRearHandguardGeometry(): THREE.BufferGeometry {
  const archCross = new THREE.Shape();
  archCross.absarc(0, -0.25, 1.46, 0.05, Math.PI - 0.05, false);
  archCross.absarc(0, -0.25, 1.06, Math.PI - 0.05, 0.05, true);
  archCross.closePath();

  const woodShell = extrudeShapeX(
    archCross,
    -11.75,
    23.5,
    GARAND_PALETTE.WALNUT_WARM,
    0.035,
    16
  );

  // Stamped parkerized spring-steel rear handguard band clip
  const clipCross = new THREE.Shape();
  clipCross.absarc(0, -0.25, 1.52, -0.1, Math.PI + 0.1, false);
  clipCross.absarc(0, -0.25, 1.42, Math.PI + 0.1, -0.1, true);
  clipCross.closePath();

  const rearBandClip = extrudeShapeX(
    clipCross,
    -11.78,
    1.15,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.015,
    16
  );

  return sanitizeGarandMesh(
    applyGarandHandguardUVs(mergeParts([woodShell, rearBandClip]), 11.8),
    true
  );
}

/**
 * F-05: Front Walnut Handguard + Stamped Ferrule & Lower Liner
 * (`isShell: true`, assembledPos: [42.85, 0.95, 0])
 * World X ∈ [+31.35, +54.45] (23.1 cm long), enclosing barrel & forward op-rod tube!
 */
export function buildGarandFrontHandguardGeometry(): THREE.BufferGeometry {
  const frontCross = new THREE.Shape();
  frontCross.moveTo(-1.38, -0.95);
  frontCross.lineTo(-1.42, 0.35);
  frontCross.absarc(0, 0.35, 1.42, Math.PI, 0, true);
  frontCross.lineTo(1.38, -0.95);
  frontCross.lineTo(1.02, -0.95);
  frontCross.lineTo(1.02, 0.32);
  frontCross.absarc(0, 0.32, 1.02, 0, Math.PI, false);
  frontCross.lineTo(-1.02, -0.95);
  frontCross.closePath();

  const woodBody = extrudeShapeX(
    frontCross,
    -11.45,
    22.35,
    GARAND_PALETTE.WALNUT_HEART,
    0.035,
    16
  );

  // Stamped steel front handguard ferrule cap (locks into rear of garand_gas_cylinder!)
  const ferruleCap = extrudeShapeX(
    frontCross,
    10.85,
    0.82,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.02,
    16
  );

  const rearSpacerLip = extrudeShapeX(
    frontCross,
    -11.55,
    0.45,
    GARAND_PALETTE.PARKERIZED_MID,
    0.015,
    16
  );

  return sanitizeGarandMesh(
    applyGarandHandguardUVs(
      mergeParts([woodBody, ferruleCap, rearSpacerLip]),
      11.6
    ),
    true
  );
}

/**
 * F-06: Lower Barrel/Handguard Retaining Band & Front Sling Swivel
 * (assembledPos: [30.65, 0.45, 0])
 */
export function buildGarandLowerBandGeometry(): THREE.BufferGeometry {
  const upperClampRing = buildRevolvedX(
    [
      [0.84, -0.68],
      [1.26, -0.68],
      [1.26, 0.68],
      [0.84, 0.68],
      [0.84, -0.68],
    ],
    26,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(0, 0.7, 0);

  const lowerOpRodGuide = buildRevolvedX(
    [
      [0.58, -0.68],
      [0.98, -0.68],
      [0.98, 0.68],
      [0.58, 0.68],
      [0.58, -0.68],
    ],
    24,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(0, -0.8, 0);

  const leftStrap = createChamferedBox(
    1.34,
    1.92,
    0.34,
    0.025,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(0, -0.15, -1.28);

  const rightStrap = createChamferedBox(
    1.34,
    1.92,
    0.34,
    0.025,
    GARAND_PALETTE.PARKERIZED_STEEL
  ).translate(0, -0.15, 1.28);

  const swivelEars = createChamferedBox(
    1.28,
    0.52,
    1.46,
    0.025,
    GARAND_PALETTE.PARKERIZED_MID
  ).translate(0, -1.56, 0);

  const retainingRollPin = createBeveledCylinder(
    0.11,
    0.11,
    3.08,
    0.015,
    14,
    GARAND_PALETTE.WHITE_PISTON
  )
    .rotateX(Math.PI / 2)
    .translate(0, -0.05, 0);

  const frontSlingLoop = buildWatertightTube(
    [
      new THREE.Vector3(0, -1.62, -0.62),
      new THREE.Vector3(-0.25, -2.35, -0.72),
      new THREE.Vector3(-0.35, -2.68, 0),
      new THREE.Vector3(-0.25, -2.35, 0.72),
      new THREE.Vector3(0, -1.62, 0.62),
    ],
    0.09,
    10,
    GARAND_PALETTE.BURNISHED_LUG
  );

  return sanitizeGarandMesh(
    mergeParts([
      upperClampRing,
      lowerOpRodGuide,
      leftStrap,
      rightStrap,
      swivelEars,
      retainingRollPin,
      frontSlingLoop,
    ])
  );
}

/**
 * F-07: Checkered WWII Parkerized Steel Buttplate w/ Hinged Cleaning-Kit Trapdoor
 * (assembledPos: [-46.95, -6.10, 0])
 * World X ∈ [-47.50, -46.35], Y ∈ [-11.85, -0.40] (completes exact 1,105 mm = 110.5 cm OAL!).
 */
export function buildGarandButtplateGeometry(): THREE.BufferGeometry {
  // Curved shoulder plate w/ top heel tang & bottom toe lip
  const plateProfile = new THREE.Shape();
  plateProfile.moveTo(-0.55, -5.72);
  plateProfile.lineTo(0.58, -5.65);
  plateProfile.lineTo(0.58, -5.25);
  plateProfile.lineTo(-0.12, -5.28);
  plateProfile.quadraticCurveTo(0.18, 0, -0.04, 5.25);
  plateProfile.lineTo(0.62, 5.32); // Upper heel tang wrap
  plateProfile.lineTo(0.58, 5.68);
  plateProfile.lineTo(-0.48, 5.62);
  plateProfile.quadraticCurveTo(-0.22, 0, -0.55, -5.72);
  plateProfile.closePath();

  const plateBody = extrudeShapeZ(
    plateProfile,
    0,
    3.88,
    GARAND_PALETTE.PARKERIZED_STEEL,
    0.06,
    12
  );

  // Hinged circular M10 cleaning-kit / oiler trapdoor on upper-mid buttplate!
  const trapdoorDisc = createBeveledCylinder(
    1.08,
    1.08,
    0.26,
    0.03,
    22,
    GARAND_PALETTE.PARKERIZED_MID
  )
    .rotateZ(Math.PI / 2)
    .translate(-0.34, 1.35, 0);

  const trapdoorHinge = createChamferedBox(
    0.24,
    0.36,
    1.15,
    0.025,
    GARAND_PALETTE.BURNISHED_LUG
  ).translate(-0.42, 2.45, 0);

  const thumbNotchLip = createChamferedBox(
    0.22,
    0.28,
    0.66,
    0.02,
    GARAND_PALETTE.WHITE_PISTON
  ).translate(-0.46, 0.25, 0);

  // Anti-slip horizontal checkering ribs + upper/lower slotted buttplate screws
  const checkeringRibs: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 8; r++) {
    const ry = -4.35 + r * 0.52;
    checkeringRibs.push(
      createChamferedBox(
        0.14,
        0.18,
        3.25,
        0.015,
        GARAND_PALETTE.PARKERIZED_DARK
      ).translate(-0.38 - r * 0.015, ry, 0)
    );
  }

  const topScrew = createBeveledCylinder(
    0.34,
    0.34,
    0.24,
    0.02,
    16,
    GARAND_PALETTE.BURNISHED_LUG
  )
    .rotateZ(Math.PI / 2)
    .translate(-0.35, 4.35, 0);

  const botScrew = createBeveledCylinder(
    0.34,
    0.34,
    0.24,
    0.02,
    16,
    GARAND_PALETTE.BURNISHED_LUG
  )
    .rotateZ(Math.PI / 2)
    .translate(-0.46, -4.85, 0);

  // Unused helper reference guard (`extrudeShapeY` exported for completeness)
  void extrudeShapeY;

  return sanitizeGarandMesh(
    mergeParts([
      plateBody,
      trapdoorDisc,
      trapdoorHinge,
      thumbNotchLip,
      ...checkeringRibs,
      topScrew,
      botScrew,
    ])
  );
}

// ============================================================================
// 4. SANITIZED & UV-UNWRAPPED EXPORTS FOR ALL 14 EXTRA GEOMETRY BUILDERS
// ============================================================================

export function buildGarandBoltSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(
    applyGarandParkerizedPartUVs(buildGarandBoltGeometry()),
    true
  );
}

export function buildGarandFiringPinSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(buildGarandFiringPinGeometry());
}

export function buildGarandOpRodSpringSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(buildGarandOpRodSpringGeometry());
}

export function buildGarandOpRodCatchSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(buildGarandOpRodCatchGeometry());
}

export function buildGarandTriggerHousingSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(
    applyGarandParkerizedPartUVs(buildGarandTriggerHousingGeometry()),
    true
  );
}

export function buildGarandTriggerGuardSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(buildGarandTriggerGuardGeometry());
}

export function buildGarandTriggerSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(buildGarandTriggerGeometry());
}

export function buildGarandHammerSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(buildGarandHammerGeometry());
}

export function buildGarandHammerSpringSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(buildGarandHammerSpringGeometry());
}

export function buildGarandEnblocClipSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(
    applyGarandEnblocClipUVs(buildGarandEnblocClipGeometry()),
    true
  );
}

export function buildGarandFollowerSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(buildGarandFollowerGeometry());
}

export function buildGarandFollowerArmSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(buildGarandFollowerArmGeometry());
}

export function buildGarandBulletGuideSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(buildGarandBulletGuideGeometry());
}

export function buildGarandClipLatchSanitized(): THREE.BufferGeometry {
  return sanitizeGarandMesh(buildGarandClipLatchGeometry());
}
