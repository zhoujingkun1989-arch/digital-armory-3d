import * as THREE from 'three';
import {
  createBeveledCylinder,
  createChamferedBox,
  mergeParts,
} from '../../../engine/geometry/csgBuilder';
import {
  clampUv01 as clamp01,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  buildHelicalLands,
  buildM249AmmoBoxGeometry,
  buildM249BoltGeometry,
  buildM249ChargingHandleGeometry,
  buildM249FeedLeverGeometry,
  buildM249FeedPawlsGeometry,
  buildM249FeedTrayGeometry,
  buildM249FiringPinGeometry,
  buildM249HydraulicBufferGeometry,
  buildM249M27BeltGeometry,
  buildM249OpenBoltSearGeometry,
  buildM249RecoilSpringGeometry,
  buildM249SearSpringGeometry,
  buildM249TriggerFrameGeometry,
  buildM249TriggerGeometry,
  buildRevolvedX,
  buildWatertightTube,
  extrudeShapeX,
  extrudeShapeZ,
  M249_PALETTE,
  sanitizeM249Mesh,
} from './m249ExtraGeometries';

// ============================================================================
// 1. PRECISION 2K UV ATLAS UNWRAPPERS (`m249_receiver_*` & `m249_beltbox_*`)
// ============================================================================

/**
 * Unwraps F-01 Stamped Steel Receiver onto `m249_receiver_*` (2048 x 1024):
 *  - Left flank (-Z, `v in [0.03, 0.25], u in [0.04, 0.75]`): `MACHINE GUN 5.56MM M249 · FN MANUFACTURING INC.` + spot welds!
 *  - Right flank & belly (`v in [0.27, 0.49], u in [0.04, 0.75]`): `U.S. PROPERTY · SER. M249-084219` + spot welds!
 *  - Bright internal guide rails & trunnion (`v in [0.04, 0.48], u in [0.78, 0.97]`)
 */
export function applyM249ReceiverUVs(
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
    const { cz, fnz, cr } = triInfo(pos, col, i, i + 1, i + 2);
    const isBright = cr > 0.22;
    const isLeftFlank = !isBright && fnz < -0.35 && cz < -0.5;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x01 = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const y01 = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      let u: number;
      let v: number;
      if (isBright) {
        u = 0.78 + x01 * 0.19;
        v = 0.04 + y01 * 0.44;
      } else if (isLeftFlank) {
        u = 0.04 + (1.0 - x01) * 0.71;
        v = 0.03 + y01 * 0.22;
      } else {
        u = 0.04 + x01 * 0.71;
        v = 0.27 + y01 * 0.22;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-05 Lower Heatshield & Perforated Upper Shroud onto `m249_receiver_*` (`v in [0.27, 0.49]`):
 */
export function applyM249HandguardUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = Math.max(1e-4, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-4, bb.max.y - bb.min.y);

  const pos = geo.getAttribute('position');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x01 = clamp01((pos.getX(i) - bb.min.x) / spanX);
    const y01 = clamp01((pos.getY(i) - bb.min.y) / spanY);
    uvs[i * 2] = clamp01(0.04 + x01 * 0.71);
    uvs[i * 2 + 1] = clamp01(0.28 + y01 * 0.2);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-02 Hinged Die-Cast Top Feed Cover & F-03 Rear Peep Sight onto `m249_receiver_*` (`v in [0.52, 0.75]`):
 *  - Die-cast top cover & MIL-STD-1913 T-slot numbers (`u in [0.04, 0.75], v in [0.52, 0.75]`)
 *  - Internal S-curved feed-lever cam track & latch (`u in [0.78, 0.97], v in [0.52, 0.75]`)
 */
export function applyM249TopCoverUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = Math.max(1e-4, bb.max.x - bb.min.x);
  const spanZ = Math.max(1e-4, bb.max.z - bb.min.z);

  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr } = triInfo(pos, col, i, i + 1, i + 2);
    const isCamSteel = cr > 0.22;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x01 = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const z01 = clamp01((pos.getZ(vi) - bb.min.z) / spanZ);
      const u = isCamSteel ? 0.78 + x01 * 0.19 : 0.04 + x01 * 0.71;
      const v = 0.52 + z01 * 0.23;
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

export function applyM249RearSightUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanZ = Math.max(1e-4, bb.max.z - bb.min.z);
  const spanY = Math.max(1e-4, bb.max.y - bb.min.y);

  const pos = geo.getAttribute('position');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const z01 = clamp01((pos.getZ(i) - bb.min.z) / spanZ);
    const y01 = clamp01((pos.getY(i) - bb.min.y) / spanY);
    uvs[i * 2] = clamp01(0.46 + z01 * 0.28);
    uvs[i * 2 + 1] = clamp01(0.53 + y01 * 0.21);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps B-01 Quick-Change 18.3" Barrel & B-04 Long-Stroke Piston Carrier onto `m249_receiver_*` (`v in [0.79, 0.98]`):
 *  - Heat-tinted manganese-phosphate barrel & carrier steel (`u in [0.04, 0.75]`)
 *  - Hard-chrome barrel extension, piston cup & top actuation roller (`u in [0.78, 0.97]`)
 */
export function applyM249BarrelPistonUVs(
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
    const isChrome = cr > 0.22;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x01 = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const y01 = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      const u = isChrome ? 0.78 + x01 * 0.19 : 0.04 + x01 * 0.71;
      const v = 0.79 + y01 * 0.19;
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps M-05 Ribbed OD-Green 200-Round Polymer SAW Box onto `m249_beltbox_*` (`v in [0.04, 0.53]`):
 *  - Left/front OD-green walls (`v in [0.04, 0.27], u in [0.04, 0.72]`): `200 RD 5.56MM M27 LINK` stencil!
 *  - Right/rear OD-green walls (`v in [0.29, 0.53], u in [0.04, 0.72]`): `MAGAZINE, CARTRIDGE, 200 ROUND`!
 *  - Charcoal locking lid & belt-chute neck (`v in [0.04, 0.53], u in [0.75, 0.97]`)
 */
export function applyM249AmmoBoxUVs(
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
    const { fnx, fnz, cg, cb } = triInfo(pos, col, i, i + 1, i + 2);
    const isCharcoalLid = cb > cg * 0.92;
    const isPrimaryStencilFace = !isCharcoalLid && (fnz < -0.25 || fnx > 0.35);

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x01 = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const y01 = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      let u: number;
      let v: number;
      if (isCharcoalLid) {
        u = 0.75 + x01 * 0.22;
        v = 0.04 + y01 * 0.49;
      } else if (isPrimaryStencilFace) {
        u = 0.04 + x01 * 0.68;
        v = 0.04 + y01 * 0.23;
      } else {
        u = 0.04 + x01 * 0.68;
        v = 0.29 + y01 * 0.24;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Polymer Furniture + Steel Wire/Hardware (`m249_buttstock`, `m249_trigger_frame`, `m249_barrel_handle`)
 * onto `m249_beltbox_*` (`v in [0.58, 0.78]`):
 *  - Matte charcoal polyamide & stippled grip (`u in [0.04, 0.72]`)
 *  - Brushed steel shoulder-rest wire & latch hardware (`u in [0.75, 0.97]`)
 */
export function applyM249FurnitureUVs(
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
    const { cr, cg } = triInfo(pos, col, i, i + 1, i + 2);
    const isSteelHardware = cr > 0.16 && cg > 0.16;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x01 = clamp01((pos.getX(vi) - bb.min.x) / spanX);
      const y01 = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      const u = isSteelHardware ? 0.75 + x01 * 0.22 : 0.04 + x01 * 0.68;
      const v = 0.58 + y01 * 0.2;
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps M-04 Linked M27 Disintegrating Belt onto `m249_beltbox_*` (`v in [0.82, 0.98]`):
 *  - Matte black M27 steel links (`u in [0.05, 0.45]`)
 *  - C26000 cartridge brass w/ annealed neck (`u in [0.48, 0.78]`)
 *  - Copper FMJ ogive (`u in [0.80, 0.89]`)
 *  - NATO M855 green penetrator tip (`u in [0.91, 0.97]`)
 */
export function applyM249BeltUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanY = Math.max(1e-4, bb.max.y - bb.min.y);

  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr, cg } = triInfo(pos, col, i, i + 1, i + 2);
    const isGreenTip = cg > cr * 2.0;
    const isBrass = !isGreenTip && cr > 0.3 && cg > 0.22;
    const isCopper = !isGreenTip && !isBrass && cr > 0.25;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y01 = clamp01((pos.getY(vi) - bb.min.y) / spanY);
      let u: number;
      if (isGreenTip) {
        u = 0.91 + clamp01((x - 2.38) / 0.54) * 0.06;
      } else if (isCopper) {
        u = 0.8 + clamp01((x - 1.54) / 0.92) * 0.09;
      } else if (isBrass) {
        u = 0.48 + clamp01((x + 2.86) / 4.5) * 0.3;
      } else {
        u = 0.05 + clamp01((x + 1.8) / 2.6) * 0.4;
      }
      const v = 0.82 + y01 * 0.16;
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

export function applyM249FeedTrayUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = Math.max(1e-4, bb.max.x - bb.min.x);
  const spanZ = Math.max(1e-4, bb.max.z - bb.min.z);

  const pos = geo.getAttribute('position');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x01 = clamp01((pos.getX(i) - bb.min.x) / spanX);
    const z01 = clamp01((pos.getZ(i) - bb.min.z) / spanZ);
    uvs[i * 2] = clamp01(0.05 + x01 * 0.4);
    uvs[i * 2 + 1] = clamp01(0.82 + z01 * 0.16);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 2. QUICK-CHANGE 18.3" BARREL, GAS BLOCK & PISTON CARRIER ('slide' B-01..04)
// ============================================================================

/**
 * B-01: 18.3-Inch (46.5 cm) Quick-Change Cold-Hammer-Forged 5.56x45mm Barrel
 * w/ Barrel Extension, Front Gas Block & Slotted NATO A2 Birdcage Flash Hider
 * (assembledPos: [0, 1.25, 0] — Stationary fixed barrel, world X in [+4.20, +57.30]!)
 */
export function buildM249BarrelGeometry(): THREE.BufferGeometry {
  const barrelHollow = buildRevolvedX(
    [
      [0.52, 4.2], // Chromed barrel extension rear face
      [1.14, 4.2],
      [1.14, 6.55], // Heavy barrel extension inside receiver trunnion
      [1.02, 6.7],
      [1.24, 9.8], // Quick-change carry-handle collar seat
      [1.24, 15.6],
      [1.06, 16.4], // Heavy sustained-fire SAW chamber contour
      [0.92, 32.8],
      [0.98, 33.1], // Front gas block journal
      [0.98, 37.0],
      [0.84, 37.25], // Forward barrel profile
      [0.78, 51.8],
      [0.92, 52.05], // Birdcage flash-hider wrench flats
      [0.92, 57.15],
      [0.84, 57.3], // Flash-hider muzzle crown (exact +57.30 cm!)
      [0.44, 57.22], // Flash-hider expansion cone
      [0.285, 52.0], // Ø5.56mm (.219") chrome-lined bore crown
      [0.285, 10.15], // Rifled bore throat
      [0.325, 10.07], // 5.56x45mm case neck
      [0.485, 9.25], // 23° STANAG shoulder
      [0.495, 5.65], // 44.7mm 5.56mm chamber wall (breech at X = +5.60!)
      [0.52, 4.2], // Closes watertight loop
    ],
    32,
    M249_PALETTE.PARKERIZED_STEEL
  );

  // 6 right-hand 1:7" (17.78 cm) NATO SS109/M855 rifling lands inside bore
  const rifling = buildHelicalLands({
    count: 6,
    boreR: 0.285,
    depth: 0.014,
    width: 0.048,
    x0: 10.3,
    x1: 51.85,
    twistCm: 17.78,
    color: M249_PALETTE.HARD_CHROME,
  });

  // Chromed barrel extension indexing collar & feed ramp lip
  const extensionCollar = createChamferedBox(
    1.95,
    0.42,
    1.62,
    0.03,
    M249_PALETTE.HARD_CHROME
  ).translate(5.25, -0.96, 0);

  // Slanted front forged gas block connecting barrel (local Y=0) down to gas cylinder (local Y=-1.90)
  const gasBlockShape = new THREE.Shape();
  gasBlockShape.moveTo(33.2, 0.65);
  gasBlockShape.lineTo(36.9, 0.65);
  gasBlockShape.lineTo(36.6, -2.55);
  gasBlockShape.lineTo(33.6, -2.55);
  gasBlockShape.closePath();
  const gasBlockBody = extrudeShapeZ(
    gasBlockShape,
    0,
    1.56,
    M249_PALETTE.PARKERIZED_DARK,
    0.04
  );

  // Birdcage flash-hider external compensator ribs
  const flashRibTop = createChamferedBox(
    2.65,
    0.16,
    0.54,
    0.02,
    M249_PALETTE.PARKERIZED_DARK
  ).translate(54.85, 0.88, 0);

  return sanitizeM249Mesh(
    applyM249BarrelPistonUVs(
      mergeParts([
        barrelHollow,
        rifling,
        extensionCollar,
        gasBlockBody,
        flashRibTop,
      ])
    ),
    true
  );
}

/**
 * B-02: Folding Insulated Quick-Change Barrel Carry & Latch Handle
 * (assembledPos: [14.80, 3.25, 1.85])
 */
export function buildM249BarrelHandleGeometry(): THREE.BufferGeometry {
  // Barrel locking yoke & spring release lever around barrel collar
  const barrelYoke = createChamferedBox(
    1.65,
    1.75,
    1.45,
    0.04,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-2.45, -0.82, -1.25);

  const quickReleaseTab = createChamferedBox(
    1.85,
    0.38,
    0.92,
    0.03,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-3.15, -0.15, -0.65);

  // Heavy bent steel carry bail stem sweeping up and right (+Y/+Z)
  const wireBail = buildWatertightTube(
    [
      new THREE.Vector3(-2.35, -0.35, -0.95),
      new THREE.Vector3(-2.05, 0.55, -0.15),
      new THREE.Vector3(-1.15, 0.95, 0.65),
      new THREE.Vector3(4.85, 0.95, 0.85),
    ],
    0.22,
    14,
    M249_PALETTE.BURNISHED_STEEL
  );

  // Ribbed heat-insulated composite rotating carry grip
  const insulatedGrip = buildRevolvedX(
    [
      [0, -0.85],
      [0.68, -0.85],
      [0.74, -0.65],
      [0.7, 0.5],
      [0.76, 1.2],
      [0.7, 1.9],
      [0.76, 2.6],
      [0.7, 3.3],
      [0.74, 4.35],
      [0.64, 4.65],
      [0, 4.65],
    ],
    22,
    M249_PALETTE.POLYMER_CHARCOAL
  )
    .rotateY(-0.04)
    .translate(0.1, 0.95, 0.76);

  return sanitizeM249Mesh(
    applyM249FurnitureUVs(
      mergeParts([barrelYoke, quickReleaseTab, wireBail, insulatedGrip])
    ),
    true
  );
}

/**
 * B-03: Front Gas Block Regulator Collar & Exhaust Port Plug
 * (assembledPos: [37.40, -0.65, 0])
 */
export function buildM249GasRegulatorGeometry(): THREE.BufferGeometry {
  const plugBody = buildRevolvedX(
    [
      [0, -1.05],
      [0.58, -1.05],
      [0.58, -0.15],
      [0.82, -0.05], // Knurled gas-setting collar
      [0.82, 0.85],
      [0.64, 0.95],
      [0.64, 1.65],
      [0.52, 1.78],
      [0, 1.78],
    ],
    24,
    M249_PALETTE.PARKERIZED_STEEL
  );

  const detentClip = createChamferedBox(
    0.92,
    0.34,
    1.62,
    0.025,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(0.38, 0.62, 0);

  return sanitizeM249Mesh(mergeParts([plugBody, detentClip]));
}

/**
 * B-04: Long-Stroke Gas Piston & Slide / Bolt Carrier w/ Top Feed-Cam Actuation Roller
 * (assembledPos: [-6.80, -0.65, 0] — Open-Bolt Cocked-Rearward Datum!)
 *  - Stainless cupped long-stroke piston head at local X = +30.80 (world X = +24.00 cocked -> +34.15 in battery)
 *  - Hardened bottom open-bolt sear notch at local X = -0.40, Y = -0.42 (world X = -7.20, Y = -1.07)
 *  - Vertical top feed-cam actuation roller at local X = -1.80, Y = +3.24 (drives `m249_feed_lever`!)
 */
export function buildM249PistonCarrierGeometry(): THREE.BufferGeometry {
  // Long-stroke gas piston rod + front 3-ring stainless gas obturator head (coaxial along local Y = 0)
  const pistonRod = buildRevolvedX(
    [
      [0, -4.75],
      [0.54, -4.75],
      [0.56, 3.4],
      [0.44, 3.6],
      [0.44, 27.6],
      [0.66, 27.85], // Gas fouling scraper ring #1
      [0.66, 28.35],
      [0.54, 28.45],
      [0.54, 28.85],
      [0.67, 28.95], // Gas obturator ring #2
      [0.67, 29.45],
      [0.55, 29.55],
      [0.68, 29.95], // Cupped stainless piston head!
      [0.68, 30.8],
      [0.46, 30.8],
      [0.42, 30.42],
      [0, 30.42],
    ],
    26,
    M249_PALETTE.HARD_CHROME
  );

  // Upper slide / bolt-carrier tower (local X in [-4.55, +3.15], Y in [+0.35, +2.65])
  const slideTower = createChamferedBox(
    7.65,
    2.25,
    1.76,
    0.05,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(-0.7, 1.48, 0);

  // Side guide-rail wings riding stamped receiver tracks
  const railWings = createChamferedBox(
    7.2,
    0.42,
    2.48,
    0.03,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-0.75, 1.22, 0);

  // Bottom hardened open-bolt sear catch lug (`world X = -7.20` catches `m249_open_bolt_sear`!)
  const searCatchLug = createChamferedBox(
    1.65,
    0.48,
    1.12,
    0.03,
    M249_PALETTE.HARD_CHROME
  ).translate(-1.22, -0.44, 0);

  // Top vertical feed-cam actuation roller & spindle (rides top-cover S-cam & swings `m249_feed_lever`!)
  const rollerPedestal = createBeveledCylinder(
    0.26,
    0.34,
    0.52,
    0.025,
    18,
    M249_PALETTE.PARKERIZED_MID
  ).translate(-1.8, 2.82, 0);

  const feedActuationRoller = createBeveledCylinder(
    0.46,
    0.46,
    0.42,
    0.035,
    22,
    M249_PALETTE.HARD_CHROME
  ).translate(-1.8, 3.24, 0);

  return sanitizeM249Mesh(
    applyM249BarrelPistonUVs(
      mergeParts([
        pistonRod,
        slideTower,
        railWings,
        searCatchLug,
        rollerPedestal,
        feedActuationRoller,
      ])
    ),
    true
  );
}

// ============================================================================
// 3. STAMPED RECEIVER, TOP COVER, SIGHTS, HANDGUARD, GAS TUBE, BIPOD & STOCK ('frame')
// ============================================================================

/**
 * F-01: Stamped Welded Manganese-Phosphate Receiver (`isShell: true`)
 * (assembledPos: [0, 0, 0] — Stationary datum, X in [-15.20, +10.80])
 * Features internal welded guide rails, left M27 belt throat + angled STANAG M16 emergency magwell,
 * and right (+Z) dual link/brass ejection ports!
 */
export function buildM249ReceiverGeometry(): THREE.BufferGeometry {
  // Left wall (-Z = -1.96) with cutout between belt feed throat & front trunnion
  const leftShape = new THREE.Shape();
  leftShape.moveTo(-15.1, -1.95);
  leftShape.lineTo(10.7, -1.95);
  leftShape.lineTo(10.7, 2.55);
  leftShape.lineTo(3.45, 2.55);
  leftShape.lineTo(3.15, 0.95); // Belt feed port opening (-3.75..+3.15)!
  leftShape.lineTo(-3.75, 0.95);
  leftShape.lineTo(-4.05, 2.55);
  leftShape.lineTo(-15.1, 2.55);
  leftShape.closePath();
  const leftWall = extrudeShapeZ(
    leftShape,
    -1.96,
    0.34,
    M249_PALETTE.PARKERIZED_STEEL,
    0.03
  );

  // Right wall (+Z = +1.96) with wide spent-brass & M27-link ejection window (-3.20..+4.10)
  const rightShape = new THREE.Shape();
  rightShape.moveTo(-15.1, -1.95);
  rightShape.lineTo(10.7, -1.95);
  rightShape.lineTo(10.7, 2.55);
  rightShape.lineTo(4.35, 2.55);
  rightShape.lineTo(4.05, -0.35); // Ejection port cutout!
  rightShape.lineTo(-3.15, -0.35);
  rightShape.lineTo(-3.45, 2.55);
  rightShape.lineTo(-15.1, 2.55);
  rightShape.closePath();
  const rightWall = extrudeShapeZ(
    rightShape,
    1.96,
    0.34,
    M249_PALETTE.PARKERIZED_STEEL,
    0.03
  );

  // Receiver U-channel floor & rear backplate tower
  const receiverFloor = createChamferedBox(
    25.8,
    0.36,
    3.62,
    0.03,
    M249_PALETTE.PARKERIZED_DARK
  ).translate(-2.2, -1.82, 0);

  const rearBackplate = createChamferedBox(
    0.85,
    4.52,
    4.18,
    0.04,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(-14.78, 0.32, 0);

  // Forged front barrel-trunnion block & quick-change barrel clamp bridge
  const frontTrunnion = createChamferedBox(
    4.25,
    4.45,
    4.24,
    0.05,
    M249_PALETTE.PARKERIZED_MID
  ).translate(8.62, 0.34, 0);

  const trunnionChromedRing = buildRevolvedX(
    [
      [1.16, 6.42],
      [1.48, 6.42],
      [1.48, 10.82],
      [1.16, 10.82],
      [1.16, 6.42],
    ],
    28,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(0, 1.25, 0);

  // Internal spot-welded burnished steel carrier guide rails
  const internalRailLeft = createChamferedBox(
    18.8,
    0.32,
    0.34,
    0.02,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-4.2, 0.56, -1.62);

  const internalRailRight = createChamferedBox(
    18.8,
    0.32,
    0.34,
    0.02,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-4.2, 0.56, 1.62);

  // Signature FN Minimi / M249 Left-Angled Emergency STANAG M16 Magazine Well (-Z)!
  const stanagMagwell = createChamferedBox(
    6.45,
    3.45,
    1.62,
    0.05,
    M249_PALETTE.PARKERIZED_STEEL
  )
    .rotateX(0.48)
    .translate(-0.25, -1.85, -2.55);

  return sanitizeM249Mesh(
    applyM249ReceiverUVs(
      mergeParts([
        leftWall,
        rightWall,
        receiverFloor,
        rearBackplate,
        frontTrunnion,
        trunnionChromedRing,
        internalRailLeft,
        internalRailRight,
        stanagMagwell,
      ])
    ),
    true
  );
}

/**
 * F-02: Hinged Die-Cast Alloy Top Feed Cover w/ Internal S-Cam Slot & MIL-STD-1913 Rail (`isShell: true`)
 * (assembledPos: [10.20, 2.65, 0] — Pivots at front hinge pin [10.20, 2.65, 0]!)
 */
export function buildM249TopCoverGeometry(): THREE.BufferGeometry {
  // Inverted U-arch die-cast cover shell spanning local X in [-24.40, +0.42] (world X in [-14.20, +10.62])
  const archShape = new THREE.Shape();
  archShape.moveTo(-2.18, -0.08);
  archShape.lineTo(-2.12, 0.92);
  archShape.quadraticCurveTo(-1.88, 1.32, -1.15, 1.34);
  archShape.lineTo(1.15, 1.34);
  archShape.quadraticCurveTo(1.88, 1.32, 2.12, 0.92);
  archShape.lineTo(2.18, -0.08);
  archShape.lineTo(1.86, -0.08);
  archShape.lineTo(1.8, 0.82);
  archShape.lineTo(-1.8, 0.82);
  archShape.lineTo(-1.86, -0.08);
  archShape.closePath();

  const coverShell = extrudeShapeX(
    archShape,
    -24.4,
    24.82,
    M249_PALETTE.DIECAST_COVER,
    0.035
  );

  // Top MIL-STD-1913 Picatinny optic rail (strictly watertight base spine + 16 45°-dovetail recoil lugs, crown Y = +1.70!)
  const railBaseShape = new THREE.Shape();
  railBaseShape.moveTo(-0.82, 1.26);
  railBaseShape.lineTo(0.82, 1.26);
  railBaseShape.lineTo(0.92, 1.44);
  railBaseShape.lineTo(-0.92, 1.44);
  railBaseShape.closePath();
  const railBase = extrudeShapeX(
    railBaseShape,
    -20.8,
    16.8,
    M249_PALETTE.DIECAST_COVER,
    0.02
  );

  const lugShape = new THREE.Shape();
  lugShape.moveTo(-0.86, 1.4);
  lugShape.lineTo(-1.06, 1.54);
  lugShape.lineTo(-0.88, 1.7);
  lugShape.lineTo(0.88, 1.7);
  lugShape.lineTo(1.06, 1.54);
  lugShape.lineTo(0.86, 1.4);
  lugShape.closePath();

  const railLugs: THREE.BufferGeometry[] = [railBase];
  for (let slot = 0; slot < 16; slot++) {
    const lx = -20.55 + slot * 1.04;
    railLugs.push(
      extrudeShapeX(lugShape, lx, 0.52, M249_PALETTE.DIECAST_COVER, 0.018)
    );
  }
  const opticRail = mergeParts(railLugs);

  // Internal S-curved cam-track guide ribs driving `m249_feed_lever`!
  const sCamTrackLeft = buildWatertightTube(
    [
      new THREE.Vector3(-21.6, 0.68, -0.52),
      new THREE.Vector3(-18.8, 0.68, -0.44),
      new THREE.Vector3(-15.8, 0.68, -0.12),
      new THREE.Vector3(-12.6, 0.68, 0.16),
    ],
    0.13,
    10,
    M249_PALETTE.BURNISHED_STEEL
  );

  const sCamTrackRight = buildWatertightTube(
    [
      new THREE.Vector3(-21.6, 0.68, 0.16),
      new THREE.Vector3(-18.8, 0.68, 0.24),
      new THREE.Vector3(-15.8, 0.68, 0.56),
      new THREE.Vector3(-12.6, 0.68, 0.84),
    ],
    0.13,
    10,
    M249_PALETTE.BURNISHED_STEEL
  );

  // Front hinge pin knuckle & rear dual squeeze-latch ears
  const frontHingePin = createBeveledCylinder(
    0.28,
    0.28,
    4.56,
    0.03,
    18,
    M249_PALETTE.BURNISHED_STEEL
  ).rotateX(Math.PI / 2);

  const rearLatchEars = createChamferedBox(
    1.25,
    0.62,
    4.64,
    0.035,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-23.65, 0.34, 0);

  return sanitizeM249Mesh(
    applyM249TopCoverUVs(
      mergeParts([
        coverShell,
        opticRail,
        sCamTrackLeft,
        sCamTrackRight,
        frontHingePin,
        rearLatchEars,
      ])
    ),
    true
  );
}

/**
 * F-03: Peep Windage / Elevation Drum Rear Sight Assembly
 * (assembledPos: [-12.60, 4.35, 0])
 */
export function buildM249RearSightGeometry(): THREE.BufferGeometry {
  const sightBase = createChamferedBox(
    2.65,
    0.58,
    2.45,
    0.035,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(0, 0.12, 0);

  const leftWing = createChamferedBox(
    1.45,
    1.28,
    0.26,
    0.025,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(-0.15, 0.78, -0.88);

  const rightWing = createChamferedBox(
    1.45,
    1.28,
    0.26,
    0.025,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(-0.15, 0.78, 0.88);

  // Peep aperture ring
  const peepRing = buildRevolvedX(
    [
      [0.14, -0.18],
      [0.44, -0.18],
      [0.44, 0.18],
      [0.14, 0.18],
      [0.14, -0.18],
    ],
    22,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(-0.15, 0.92, 0);

  // Knurled windage & elevation drums
  const windageDrum = createBeveledCylinder(
    0.42,
    0.42,
    3.52,
    0.035,
    20,
    M249_PALETTE.PARKERIZED_MID
  )
    .rotateX(Math.PI / 2)
    .translate(-0.15, 0.48, 0);

  return sanitizeM249Mesh(
    applyM249RearSightUVs(
      mergeParts([sightBase, leftWing, rightWing, peepRing, windageDrum])
    ),
    true
  );
}

/**
 * F-04: Hooded Post Front Sight Assembly
 * (assembledPos: [35.40, 2.75, 0])
 */
export function buildM249FrontSightGeometry(): THREE.BufferGeometry {
  const dovetailBase = createChamferedBox(
    2.15,
    0.52,
    1.38,
    0.03,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(0, -0.15, 0);

  // Protective circular steel sight hood around post
  const sightHood = buildRevolvedX(
    [
      [0.54, -0.78],
      [0.68, -0.78],
      [0.68, 0.78],
      [0.54, 0.78],
      [0.54, -0.78],
    ],
    24,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(0, 0.68, 0);

  const sightPost = createBeveledCylinder(
    0.065,
    0.11,
    0.72,
    0.015,
    14,
    M249_PALETTE.HARD_CHROME
  ).translate(0, 0.42, 0);

  return sanitizeM249Mesh(mergeParts([dovetailBase, sightHood, sightPost]));
}

/**
 * F-05: Lower Ribbed Heatshield Handguard & Perforated Upper Barrel Shroud (`isShell: true`)
 * (assembledPos: [21.80, 0.15, 0])
 */
export function buildM249HandguardGeometry(): THREE.BufferGeometry {
  // Lower U-trough polymer/alloy heatshield cradling gas cylinder (`local X in [-10.5, +10.5]`)
  const lowerShape = new THREE.Shape();
  lowerShape.moveTo(-2.28, 0.45);
  lowerShape.lineTo(-2.15, -1.65);
  lowerShape.quadraticCurveTo(-1.85, -2.18, -1.15, -2.22);
  lowerShape.lineTo(1.15, -2.22);
  lowerShape.quadraticCurveTo(1.85, -2.18, 2.15, -1.65);
  lowerShape.lineTo(2.28, 0.45);
  lowerShape.lineTo(1.94, 0.45);
  lowerShape.lineTo(1.82, -1.52);
  lowerShape.lineTo(-1.82, -1.52);
  lowerShape.lineTo(-1.94, 0.45);
  lowerShape.closePath();

  const lowerTrough = extrudeShapeX(
    lowerShape,
    -10.5,
    21.0,
    M249_PALETTE.POLYMER_CHARCOAL,
    0.04
  );

  // Upper perforated stamped-steel M249 barrel heatshield shroud (`local Y in [+0.65, +2.32]`)
  const shroudFlankShape = new THREE.Shape();
  shroudFlankShape.moveTo(-10.1, 0.65);
  shroudFlankShape.lineTo(10.1, 0.65);
  shroudFlankShape.lineTo(9.8, 2.15);
  shroudFlankShape.lineTo(-9.8, 2.15);
  shroudFlankShape.closePath();

  // 7 authentic oval cooling slots punched through upper barrel shroud!
  for (let s = 0; s < 7; s++) {
    const cx = -7.8 + s * 2.6;
    const slotHole = new THREE.Path();
    slotHole.absellipse(cx, 1.42, 0.78, 0.36, 0, Math.PI * 2, true, 0);
    shroudFlankShape.holes.push(slotHole);
  }

  const shroudLeft = extrudeShapeZ(
    shroudFlankShape,
    -1.68,
    0.22,
    M249_PALETTE.PARKERIZED_STEEL,
    0.02
  );
  const shroudRight = extrudeShapeZ(
    shroudFlankShape,
    1.68,
    0.22,
    M249_PALETTE.PARKERIZED_STEEL,
    0.02
  );

  const shroudRoofBridge = createChamferedBox(
    19.4,
    0.2,
    3.42,
    0.025,
    M249_PALETTE.PARKERIZED_DARK
  ).translate(0, 2.18, 0);

  return sanitizeM249Mesh(
    applyM249HandguardUVs(
      mergeParts([lowerTrough, shroudLeft, shroudRight, shroudRoofBridge])
    ),
    true
  );
}

/**
 * F-06: Hollow Underbarrel Gas Cylinder Tube & Front Bipod Yoke
 * (assembledPos: [23.80, -0.65, 0] — coaxial w/ `m249_piston_carrier` along Y = -0.65!)
 */
export function buildM249GasTubeGeometry(): THREE.BufferGeometry {
  const cylinderTube = buildRevolvedX(
    [
      [0.72, -12.75],
      [0.94, -12.75],
      [0.94, 12.75],
      [0.72, 12.75],
      [0.72, -12.75],
    ],
    28,
    M249_PALETTE.PARKERIZED_MID
  );

  // Front forged bipod mounting collar & downward pivot yoke
  const bipodCollar = createChamferedBox(
    2.35,
    2.42,
    2.38,
    0.04,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(10.85, -0.32, 0);

  return sanitizeM249Mesh(mergeParts([cylinderTube, bipodCollar]));
}

/**
 * F-07: Folded Telescoping Twin Steel Bipod Assembly
 * (assembledPos: [23.50, -2.55, 0] — folded rearward neatly beneath handguard!)
 */
export function buildM249BipodGeometry(): THREE.BufferGeometry {
  // Front folding hinge block
  const pivotHead = createChamferedBox(
    2.25,
    1.35,
    4.95,
    0.04,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(10.45, 0.35, 0);

  // Left & right folded stamped-channel telescoping steel legs (±Z = ±2.38)
  const legLeft = createChamferedBox(
    21.8,
    0.88,
    0.68,
    0.035,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(-0.65, 0.05, -2.38);

  const legRight = createChamferedBox(
    21.8,
    0.88,
    0.68,
    0.035,
    M249_PALETTE.PARKERIZED_STEEL
  ).translate(-0.65, 0.05, 2.38);

  // Inner telescoping stainless leg extensions & serrated ski feet at rear (-X)
  const innerExtLeft = createBeveledCylinder(
    0.28,
    0.28,
    3.2,
    0.025,
    16,
    M249_PALETTE.BURNISHED_STEEL
  )
    .rotateZ(Math.PI / 2)
    .translate(-10.4, 0.05, -2.38);

  const innerExtRight = createBeveledCylinder(
    0.28,
    0.28,
    3.2,
    0.025,
    16,
    M249_PALETTE.BURNISHED_STEEL
  )
    .rotateZ(Math.PI / 2)
    .translate(-10.4, 0.05, 2.38);

  const skiFootLeft = createChamferedBox(
    0.62,
    1.65,
    1.35,
    0.03,
    M249_PALETTE.PARKERIZED_DARK
  ).translate(-11.85, -0.25, -2.42);

  const skiFootRight = createChamferedBox(
    0.62,
    1.65,
    1.35,
    0.03,
    M249_PALETTE.PARKERIZED_DARK
  ).translate(-11.85, -0.25, 2.42);

  return sanitizeM249Mesh(
    mergeParts([
      pivotHead,
      legLeft,
      legRight,
      innerExtLeft,
      innerExtRight,
      skiFootLeft,
      skiFootRight,
    ])
  );
}

/**
 * F-08: Polymer M249 Fixed SAW Buttstock w/ Folding Wire Shoulder Rest
 * (assembledPos: [-30.60, -0.45, 0] -> rear buttpad at exact world X = -46.20 cm -> 103.50 cm OAL!)
 */
export function buildM249ButtstockGeometry(): THREE.BufferGeometry {
  // Iconic heavy fish-belly M249 SAW polymer buttstock silhouette
  const stockShape = new THREE.Shape();
  stockShape.moveTo(15.35, 2.55); // Upper receiver clevis interface
  stockShape.lineTo(-14.65, 2.25); // Straight cheek comb
  stockShape.lineTo(-14.95, -6.65); // Tall SAW buttplate rear
  stockShape.quadraticCurveTo(-11.2, -6.95, -7.8, -5.45); // Off-hand prone hook!
  stockShape.quadraticCurveTo(-3.2, -3.35, 4.5, -2.45);
  stockShape.lineTo(15.35, -1.65);
  stockShape.closePath();

  const stockBody = extrudeShapeZ(
    stockShape,
    0,
    3.68,
    M249_PALETTE.POLYMER_CHARCOAL,
    0.22
  );

  // Serrated vulcanized rubber recoil pad (`local X in [-15.60, -14.62]` -> exact world minX = -46.20!)
  const buttpad = createChamferedBox(
    0.98,
    9.05,
    3.86,
    0.08,
    M249_PALETTE.RUBBER_PAD
  ).translate(-15.11, -2.18, 0);

  // Signature M249 hinged steel folding wire shoulder rest along top comb!
  const shoulderRestWire = buildWatertightTube(
    [
      new THREE.Vector3(-14.75, 2.48, -1.55),
      new THREE.Vector3(-4.2, 2.68, -1.55),
      new THREE.Vector3(-3.6, 2.72, 0),
      new THREE.Vector3(-4.2, 2.68, 1.55),
      new THREE.Vector3(-14.75, 2.48, 1.55),
    ],
    0.18,
    12,
    M249_PALETTE.BURNISHED_STEEL
  );

  // Front steel clevis pin collar
  const clevisCollar = createChamferedBox(
    1.45,
    4.18,
    3.92,
    0.04,
    M249_PALETTE.BURNISHED_STEEL
  ).translate(14.65, 0.45, 0);

  return sanitizeM249Mesh(
    applyM249FurnitureUVs(
      mergeParts([stockBody, buttpad, shoulderRestWire, clevisCollar])
    ),
    true
  );
}

// ============================================================================
// 4. SANITIZED & UV-BOUND EXPORTS FOR REMAINING 14 PARTS
// ============================================================================

export const buildM249BoltSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(buildM249BoltGeometry());

export const buildM249FiringPinSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(buildM249FiringPinGeometry());

export const buildM249ChargingHandleSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(buildM249ChargingHandleGeometry());

export const buildM249RecoilSpringSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(buildM249RecoilSpringGeometry());

export const buildM249HydraulicBufferSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(buildM249HydraulicBufferGeometry());

export const buildM249TriggerFrameSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(
    applyM249FurnitureUVs(buildM249TriggerFrameGeometry()),
    true
  );

export const buildM249TriggerSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(buildM249TriggerGeometry());

export const buildM249OpenBoltSearSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(buildM249OpenBoltSearGeometry());

export const buildM249SearSpringSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(buildM249SearSpringGeometry());

export const buildM249FeedTraySanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(applyM249FeedTrayUVs(buildM249FeedTrayGeometry()), true);

export const buildM249FeedLeverSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(buildM249FeedLeverGeometry());

export const buildM249FeedPawlsSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(buildM249FeedPawlsGeometry());

export const buildM249M27BeltSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(applyM249BeltUVs(buildM249M27BeltGeometry()), true);

export const buildM249AmmoBoxSanitized = (): THREE.BufferGeometry =>
  sanitizeM249Mesh(applyM249AmmoBoxUVs(buildM249AmmoBoxGeometry()), true);
