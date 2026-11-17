import * as THREE from 'three';
import {
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  LIFT33_PALETTE,
  attachFlexAttribute,
  buildChamferedLimbBlade,
  buildHexBolt,
  buildWatertightTube,
  extrudeShapeX,
  extrudeShapeY,
  extrudeShapeZ,
  latheAlongX,
  latheAlongY,
  sanitizeLift33Mesh,
} from './lift33CadDetail';

// Shared limb-tip full-draw deflection vector (1 world unit = 1 cm)
export const LIFT33_TIP_FLEX_DX = -1.2;
export const LIFT33_TIP_FLEX_DY = 2.4;
export const LIFT33_NOCK_DRAW_DX = -27.5;
export const LIFT33_NOCK_Y = 2.4;

function limbFlexWeight(u01: number): number {
  const u = clamp01(u01);
  return Math.pow(u, 1.55);
}

// ============================================================================
// 1. PRECISION 2K UV ATLAS UNWRAPPERS (`lift33_riser_*` & `lift33_limbs_*`)
// ============================================================================

/**
 * Unwraps R-01 Bridged Truss Riser onto Band A (v ∈ [0.56, 0.96]) & Band B (v ∈ [0.32, 0.52])
 * of `lift33_riser_*` (2048 × 1024):
 *  - Left flank:  u ∈ [0.04, 0.96], v ∈ [0.77, 0.96]
 *  - Right flank: u ∈ [0.04, 0.96], v ∈ [0.56, 0.75]
 *  - Milled inner pockets / bosses: u ∈ [0.04, 0.72], v ∈ [0.32, 0.52]
 */
export function applyLift33RiserUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz, cr } = triInfo(pos, col, i, i + 1, i + 2);
    let band: 'left' | 'right' | 'inner' = 'inner';
    if (fnz < -0.35 && cz < -0.25 && cr < 0.34) band = 'left';
    else if (fnz > 0.35 && cz > 0.25 && cr < 0.34) band = 'right';

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const yNorm = clamp01((y + 33.2) / 66.4);
      const xNorm = clamp01((x + 2.6) / 6.4);

      let u: number;
      let v: number;
      if (band === 'left') {
        u = 0.04 + yNorm * 0.92;
        v = 0.77 + xNorm * 0.19;
      } else if (band === 'right') {
        u = 0.04 + (1 - yNorm) * 0.92;
        v = 0.56 + xNorm * 0.19;
      } else {
        u = 0.04 + yNorm * 0.66;
        v = 0.32 + xNorm * 0.2;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps R-03/R-04 Pivoting Limb Pockets onto Band B of `lift33_riser_*`:
 *  - Anodized pocket housing: u ∈ [0.04, 0.70], v ∈ [0.32, 0.52]
 *  - Stainless weight bolt & pin: u ∈ [0.74, 0.96], v ∈ [0.32, 0.52]
 */
export function applyLift33PocketUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr } = triInfo(pos, col, i, i + 1, i + 2);
    const isBright = cr > 0.45;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x + 2.6) / 5.2);
      const yNorm = clamp01((y + 2.6) / 5.2);

      let u: number;
      let v: number;
      if (isBright) {
        u = 0.74 + fractPos((x + z) * 0.35) * 0.22;
        v = 0.32 + yNorm * 0.2;
      } else {
        u = 0.04 + xNorm * 0.66;
        v = 0.32 + clamp01((z + 2.4) / 4.8) * 0.2;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps C-01/C-02 Split Quad Carbon Limbs onto Band A of `lift33_limbs_*`:
 *  - 3K carbon-fiber twill weave: u ∈ [0.04, 0.96], v ∈ [0.64, 0.96]
 */
export function applyLift33LimbsUVs(
  geo: THREE.BufferGeometry,
  isUpper: boolean
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const span = clamp01(-x / 11.8);
    const yAbs = clamp01(Math.abs(y) / 10.0);
    const u = 0.04 + (0.65 * span + 0.35 * yAbs) * 0.92;
    const baseV = isUpper ? 0.8 : 0.64;
    const v = baseV + clamp01((z + 2.3) / 4.6) * 0.15;
    uvs[i * 2] = clamp01(u);
    uvs[i * 2 + 1] = clamp01(v);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps C-03/C-04 SwitchWeight-X Binary Cams onto Band B Left of `lift33_limbs_*`:
 *  - Radial bronze-gold cam disk & module: u ∈ [0.04, 0.52], v ∈ [0.34, 0.61]
 */
export function applyLift33CamUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const xNorm = clamp01((x + 4.8) / 8.2);
    const yNorm = clamp01((y + 4.4) / 8.8);
    uvs[i * 2] = clamp01(0.04 + xNorm * 0.48);
    uvs[i * 2 + 1] = clamp01(0.34 + yNorm * 0.27);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps R-06 Bridge-Lock Stabilizer onto Band B Right of `lift33_limbs_*`:
 *  - u ∈ [0.55, 0.96], v ∈ [0.34, 0.61]
 */
export function applyLift33StabilizerUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const xNorm = clamp01((x + 3.0) / 30.0);
    const radial = clamp01(Math.atan2(z, y) / (Math.PI * 2) + 0.5);
    uvs[i * 2] = clamp01(0.55 + xNorm * 0.41);
    uvs[i * 2 + 1] = clamp01(0.34 + radial * 0.27);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps C-06 BCY-X Bowstring onto Band C Left of `lift33_limbs_*`:
 *  - u ∈ [0.04, 0.44], v ∈ [0.04, 0.31]
 */
export function applyLift33BowstringUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const yNorm = clamp01((y + 40.5) / 81.0);
    const zNorm = clamp01((z + 0.25) / 0.5);
    uvs[i * 2] = clamp01(0.04 + yNorm * 0.4);
    uvs[i * 2 + 1] = clamp01(0.04 + zNorm * 0.27);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 2. 'frame' GROUP (R-01 .. R-06 · 6 PARTS)
// ============================================================================

function addTrussCutoutHole(
  shape: THREE.Shape,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  chamfer = 0.22
): void {
  const hole = new THREE.Path();
  hole.moveTo(x0 + chamfer, y0);
  hole.lineTo(x1 - chamfer, y0);
  hole.lineTo(x1, y0 + chamfer);
  hole.lineTo(x1, y1 - chamfer);
  hole.lineTo(x1 - chamfer, y1);
  hole.lineTo(x0 + chamfer, y1);
  hole.lineTo(x0, y1 - chamfer);
  hole.lineTo(x0, y0 + chamfer);
  hole.closePath();
  shape.holes.push(hole);
}

/**
 * R-01: CNC 7075-T6 Bridged Truss Riser (`assembledPos: [0, 0, 0]`, `isShell: true`)
 * Spans y ∈ [-33.0, +33.0], x ∈ [-2.40, +3.60], z ∈ [-1.52, +1.52].
 * Features:
 *  - Upper & lower skeletonized dual-beam bridged trusses with machined CNC cutouts
 *  - Asymmetric open sight window (y ∈ [+1.35, +11.40], z ∈ [-0.42, +1.55] completely open!)
 *  - Bridge-Lock inline sight channel + Integrate rest dovetail + Bridge-Lock stabilizer socket
 */
export function buildLift33RiserGeometry(): THREE.BufferGeometry {
  // 1. Upper Bridged Truss (y ∈ [11.2, 32.8])
  const upperShape = new THREE.Shape();
  upperShape.moveTo(-2.35, 11.2);
  upperShape.lineTo(3.45, 11.2);
  upperShape.lineTo(3.55, 14.0);
  upperShape.lineTo(2.45, 21.5);
  upperShape.lineTo(0.85, 28.5);
  upperShape.lineTo(0.15, 32.7);
  upperShape.lineTo(-2.25, 32.7);
  upperShape.lineTo(-2.35, 27.0);
  upperShape.closePath();

  addTrussCutoutHole(upperShape, -1.5, 12.6, 2.35, 15.8, 0.25);
  addTrussCutoutHole(upperShape, -1.5, 16.9, 1.75, 20.6, 0.25);
  addTrussCutoutHole(upperShape, -1.45, 21.7, 1.05, 25.4, 0.22);
  addTrussCutoutHole(upperShape, -1.4, 26.4, 0.35, 29.8, 0.2);

  const upperTruss = extrudeShapeZ(upperShape, 0, 2.86, LIFT33_PALETTE.RISER_ANODIZED, 0.03, 8);

  // 2. Lower Bridged Truss (y ∈ [-32.8, -6.8])
  const lowerShape = new THREE.Shape();
  lowerShape.moveTo(-2.3, -32.7);
  lowerShape.lineTo(0.15, -32.7);
  lowerShape.lineTo(1.25, -26.5);
  lowerShape.lineTo(3.55, -13.5);
  lowerShape.lineTo(3.55, -6.8);
  lowerShape.lineTo(-1.85, -6.8);
  lowerShape.lineTo(-2.35, -16.0);
  lowerShape.closePath();

  addTrussCutoutHole(lowerShape, -1.4, -29.8, 0.35, -26.2, 0.2);
  addTrussCutoutHole(lowerShape, -1.45, -25.2, 1.15, -21.2, 0.22);
  addTrussCutoutHole(lowerShape, -1.5, -20.1, 1.95, -15.8, 0.25);
  addTrussCutoutHole(lowerShape, -1.5, -14.7, 2.45, -10.6, 0.25);

  const lowerTruss = extrudeShapeZ(lowerShape, 0, 2.86, LIFT33_PALETTE.RISER_ANODIZED, 0.03, 8);

  // 3. Centergy Grip Neck + Arrow Shelf Base (y ∈ [-7.2, +1.55])
  const gripNeckShape = new THREE.Shape();
  gripNeckShape.moveTo(-1.42, -7.2);
  gripNeckShape.lineTo(1.18, -7.2);
  gripNeckShape.lineTo(1.38, -2.0);
  gripNeckShape.lineTo(2.95, 0.35);
  gripNeckShape.lineTo(3.35, 1.5);
  gripNeckShape.lineTo(-2.35, 1.5);
  gripNeckShape.lineTo(-2.2, -2.6);
  gripNeckShape.closePath();
  const gripTang = extrudeShapeZ(gripNeckShape, 0, 1.72, LIFT33_PALETTE.RISER_DARK, 0.025, 8);

  // Arrow shelf floor (y ∈ [0.85, 1.55], z ∈ [-1.42, +1.25])
  const shelfPlate = paintGeometry(
    new THREE.BoxGeometry(5.1, 0.72, 2.66).translate(0.55, 1.2, -0.08),
    LIFT33_PALETTE.RISER_ANODIZED
  );

  // 4. Sight Window Asymmetric Cage (y ∈ [1.1, 11.5])
  // Rear structural bridge spans full Z; forward bridge sits on -Z side (z ∈ [-1.45, -0.45])
  // leaving z ∈ [-0.45, +1.55] completely open for arrow, drop-away launcher & sight pins!
  const rearSightSpine = paintGeometry(
    new THREE.BoxGeometry(1.78, 10.4, 2.86).translate(-1.46, 6.3, 0),
    LIFT33_PALETTE.RISER_ANODIZED
  );
  const frontLeftSightBridge = paintGeometry(
    new THREE.BoxGeometry(1.65, 10.4, 1.02).translate(2.55, 6.3, -0.94),
    LIFT33_PALETTE.RISER_ANODIZED
  );

  // Cross-truss diagonal reinforcement ribs flanking upper & lower trusses
  const ribUpperFront = paintGeometry(
    new THREE.BoxGeometry(0.42, 16.5, 3.04)
      .rotateZ(0.145)
      .translate(1.9, 21.8, 0),
    LIFT33_PALETTE.RISER_MACHINED
  );
  const ribLowerFront = paintGeometry(
    new THREE.BoxGeometry(0.42, 16.5, 3.04)
      .rotateZ(-0.155)
      .translate(1.95, -21.2, 0),
    LIFT33_PALETTE.RISER_MACHINED
  );

  // Bridge-Lock sight mount block (hollow extruded X profile with rectangular 0.72 x 1.25 through-channel)
  const sightBossShape = new THREE.Shape();
  sightBossShape.moveTo(-1.42, -0.82);
  sightBossShape.lineTo(0.92, -0.82);
  sightBossShape.lineTo(0.92, 0.82);
  sightBossShape.lineTo(-1.42, 0.82);
  sightBossShape.closePath();
  const sightSlotHole = new THREE.Path();
  sightSlotHole.moveTo(-0.38, -0.36);
  sightSlotHole.lineTo(-0.38, 0.36);
  sightSlotHole.lineTo(0.86, 0.36);
  sightSlotHole.lineTo(0.86, -0.36);
  sightSlotHole.closePath();
  sightBossShape.holes.push(sightSlotHole);
  const bridgeLockSightBoss = extrudeShapeX(
    sightBossShape,
    -0.45,
    3.4,
    LIFT33_PALETTE.RISER_MACHINED,
    0.02,
    8
  ).translate(0, 6.4, 0);

  const restDovetailPad = paintGeometry(
    new THREE.BoxGeometry(2.2, 1.1, 0.45).translate(0.35, 1.45, 1.15),
    LIFT33_PALETTE.RISER_MACHINED
  );

  // Bridge-Lock lower hollow stabilizer boss, cable guard socket & string-stop socket (watertight lathes!)
  const stabilizerBoss = latheAlongX(
    [
      [0.48, -0.05],
      [0.86, -0.05],
      [0.86, 3.75],
      [0.48, 3.75],
      [0.48, -0.05],
    ],
    20,
    LIFT33_PALETTE.RISER_MACHINED
  ).translate(0, -8.5, 0);
  const cableGuardBoss = latheAlongX(
    [
      [0.36, -2.85],
      [0.66, -2.85],
      [0.66, -0.25],
      [0.36, -0.25],
      [0.36, -2.85],
    ],
    18,
    LIFT33_PALETTE.RISER_MACHINED
  ).translate(0, -11.5, 0.95);
  const stringStopBoss = latheAlongX(
    [
      [0.32, -2.95],
      [0.58, -2.95],
      [0.58, -0.15],
      [0.32, -0.15],
      [0.32, -2.95],
    ],
    18,
    LIFT33_PALETTE.RISER_MACHINED
  ).translate(0, -17.5, 0);

  // Upper & lower limb-pocket clevis mounts
  const upperClevis = paintGeometry(
    new THREE.BoxGeometry(2.8, 1.8, 3.1).translate(-1.25, 32.0, 0),
    LIFT33_PALETTE.RISER_ANODIZED
  );
  const lowerClevis = paintGeometry(
    new THREE.BoxGeometry(2.8, 1.8, 3.1).translate(-1.25, -32.0, 0),
    LIFT33_PALETTE.RISER_ANODIZED
  );

  const machined = mergeParts([
    upperTruss,
    lowerTruss,
    gripTang,
    shelfPlate,
    rearSightSpine,
    frontLeftSightBridge,
    ribUpperFront,
    ribLowerFront,
    bridgeLockSightBoss,
    restDovetailPad,
    stabilizerBoss,
    cableGuardBoss,
    stringStopBoss,
    upperClevis,
    lowerClevis,
  ]);

  return sanitizeLift33Mesh(applyLift33RiserUVs(machined));
}

/**
 * R-02: Mathews Engage Ergonomic Overmolded Grip (`assembledPos: [-0.25, -3.50, 0]`)
 * Built as a watertight hollow extruded shell wrapping the Centergy tang!
 */
export function buildLift33GripGeometry(): THREE.BufferGeometry {
  // Hollow XZ wraparound collar extruded vertically along Y (y ∈ [-3.55, +3.45])
  const wrapShape = new THREE.Shape();
  wrapShape.moveTo(-1.45, -0.95);
  wrapShape.quadraticCurveTo(0, -1.24, 1.45, -0.95);
  wrapShape.quadraticCurveTo(1.62, 0, 1.45, 0.95);
  wrapShape.quadraticCurveTo(0, 1.24, -1.45, 0.95);
  wrapShape.quadraticCurveTo(-1.62, 0, -1.45, -0.95);
  wrapShape.closePath();

  const tangHole = new THREE.Path();
  tangHole.moveTo(-1.18, -0.89);
  tangHole.lineTo(-1.18, 0.89);
  tangHole.lineTo(1.18, 0.89);
  tangHole.lineTo(1.18, -0.89);
  tangHole.closePath();
  wrapShape.holes.push(tangHole);

  const wrapShell = extrudeShapeY(
    wrapShape,
    -3.55,
    7.0,
    LIFT33_PALETTE.GRIP_POLYMER,
    0.05,
    12
  );
  const sideInlayL = paintGeometry(
    new THREE.BoxGeometry(1.75, 4.8, 0.14).translate(-0.08, -0.1, -1.16),
    LIFT33_PALETTE.GRIP_INLAY
  );
  const sideInlayR = paintGeometry(
    new THREE.BoxGeometry(1.75, 4.8, 0.14).translate(-0.08, -0.1, 1.16),
    LIFT33_PALETTE.GRIP_INLAY
  );
  const frontRidge = paintGeometry(
    new THREE.BoxGeometry(0.45, 5.4, 1.35).translate(1.36, -0.1, 0),
    LIFT33_PALETTE.GRIP_INLAY
  );

  return sanitizeLift33Mesh(mergeParts([wrapShell, sideInlayL, sideInlayR, frontRidge]));
}

function buildLimbPocketGeometry(isUpper: boolean): THREE.BufferGeometry {
  const s = isUpper ? 1 : -1;
  // Forked 3-channel (Z, Y) cross section extruded along X (twin split-limb channels + central clevis slot)
  // Shape coords: shapeX = Z, shapeY = Y
  const forkShape = new THREE.Shape();
  if (isUpper) {
    forkShape.moveTo(-2.35, -0.85);
    forkShape.lineTo(-0.88, -0.85);
    forkShape.lineTo(-0.88, 0.72);
    forkShape.lineTo(0.88, 0.72);
    forkShape.lineTo(0.88, -0.85);
    forkShape.lineTo(2.35, -0.85);
    forkShape.lineTo(2.35, 1.35);
    forkShape.lineTo(2.05, 1.35);
    forkShape.lineTo(2.05, 0.05);
    forkShape.lineTo(0.95, 0.05);
    forkShape.lineTo(0.95, 1.35);
    forkShape.lineTo(-0.95, 1.35);
    forkShape.lineTo(-0.95, 0.05);
    forkShape.lineTo(-2.05, 0.05);
    forkShape.lineTo(-2.05, 1.35);
    forkShape.lineTo(-2.35, 1.35);
    forkShape.closePath();
  } else {
    forkShape.moveTo(-2.35, -1.35);
    forkShape.lineTo(-2.05, -1.35);
    forkShape.lineTo(-2.05, -0.05);
    forkShape.lineTo(-0.95, -0.05);
    forkShape.lineTo(-0.95, -1.35);
    forkShape.lineTo(0.95, -1.35);
    forkShape.lineTo(0.95, -0.05);
    forkShape.lineTo(2.05, -0.05);
    forkShape.lineTo(2.05, -1.35);
    forkShape.lineTo(2.35, -1.35);
    forkShape.lineTo(2.35, 0.85);
    forkShape.lineTo(0.88, 0.85);
    forkShape.lineTo(0.88, -0.72);
    forkShape.lineTo(-0.88, -0.72);
    forkShape.lineTo(-0.88, 0.85);
    forkShape.lineTo(-2.35, 0.85);
    forkShape.closePath();
  }

  const milledPocket = extrudeShapeX(
    forkShape,
    -1.95,
    3.9,
    LIFT33_PALETTE.RISER_ANODIZED,
    0.02,
    8
  );
  const cradleCap = paintGeometry(
    new THREE.BoxGeometry(1.45, 1.15, 4.72).translate(-1.35, s * 0.82, 0),
    LIFT33_PALETTE.RISER_MACHINED
  );

  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 4.92, 16)
      .rotateX(Math.PI / 2)
      .translate(0.65, -s * 0.35, 0),
    LIFT33_PALETTE.TITANIUM_SILVER
  );
  const weightBolt = buildHexBolt(0.58, 0.42, 0.34, 1.6, LIFT33_PALETTE.TITANIUM_SILVER);
  if (!isUpper) weightBolt.rotateX(Math.PI);
  weightBolt.translate(-0.55, s * 1.42, 0);

  return sanitizeLift33Mesh(
    applyLift33PocketUVs(mergeParts([milledPocket, cradleCap, pivotPin, weightBolt]))
  );
}

/** R-03: CNC Pivoting Upper Limb Pocket & Weight Bolt (`assembledPos: [-1.40, +32.40, 0]`) */
export function buildLift33UpperPocketGeometry(): THREE.BufferGeometry {
  return buildLimbPocketGeometry(true);
}

/** R-04: CNC Pivoting Lower Limb Pocket & Weight Bolt (`assembledPos: [-1.40, -32.40, 0]`) */
export function buildLift33LowerPocketGeometry(): THREE.BufferGeometry {
  return buildLimbPocketGeometry(false);
}

/**
 * R-05: Bridge-Lock Carbon Cable Guard Rod & Twin Low-Friction Rollers
 * (`assembledPos: [-1.80, -11.50, +0.95]`)
 * Sweeps from riser socket `(0, 0, 0)` rearward to `(-11.40, 0, +0.72)` (`z_world = +1.67`)
 * where twin roller bearings guide the buss & control cables clear of the arrow vanes!
 */
export function buildLift33CableGuardGeometry(): THREE.BufferGeometry {
  const rodPts = [
    new THREE.Vector3(1.1, 0, 0),
    new THREE.Vector3(-1.5, 0, 0.1),
    new THREE.Vector3(-4.5, 0, 0.36),
    new THREE.Vector3(-8.2, 0, 0.62),
    new THREE.Vector3(-11.65, 0, 0.72),
  ];
  const carbonRod = buildWatertightTube(rodPts, 0.28, 16, LIFT33_PALETTE.CARBON_ROD);

  const clampCollar = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.48, 1.15, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.45, 0, 0),
    LIFT33_PALETTE.RISER_MACHINED
  );

  // Twin low-friction roller containment carriage at rear tip (-11.35, 0, +0.72)
  const slideBlock = paintGeometry(
    new THREE.BoxGeometry(1.45, 1.05, 0.85).translate(-11.35, 0, 0.72),
    LIFT33_PALETTE.RISER_ANODIZED
  );
  const roller1 = latheAlongY(
    [
      [0, -0.32],
      [0.36, -0.32],
      [0.36, -0.18],
      [0.24, -0.06],
      [0.24, 0.06],
      [0.36, 0.18],
      [0.36, 0.32],
      [0, 0.32],
    ],
    20,
    LIFT33_PALETTE.TITANIUM_SILVER
  ).translate(-11.45, 0.35, 0.72);

  const roller2 = latheAlongY(
    [
      [0, -0.32],
      [0.36, -0.32],
      [0.36, -0.18],
      [0.24, -0.06],
      [0.24, 0.06],
      [0.36, 0.18],
      [0.36, 0.32],
      [0, 0.32],
    ],
    20,
    LIFT33_PALETTE.TITANIUM_SILVER
  ).translate(-11.45, -0.35, 0.84);

  return sanitizeLift33Mesh(
    mergeParts([carbonRod, clampCollar, slideBlock, roller1, roller2])
  );
}

/**
 * R-06: Bridge-Lock 10" Carbon Stabilizer + Harmonic Damper (`assembledPos: [+3.20, -8.50, 0]`)
 * Extends 25.4 cm along +X from Bridge-Lock shank (`x_local ∈ [-2.6, +26.4]`).
 */
export function buildLift33StabilizerGeometry(): THREE.BufferGeometry {
  const shank = latheAlongX(
    [
      [0, -2.5],
      [0.42, -2.5],
      [0.46, -2.35],
      [0.46, 0.45],
      [0.68, 0.55],
      [0.68, 2.25],
      [0.56, 2.38],
      [0.56, 22.8],
      [0.88, 22.95],
      [0.88, 23.6],
      [0.72, 23.7],
      [0.72, 24.05],
      [0.92, 24.15],
      [0.92, 24.75],
      [1.04, 24.85],
      [1.04, 26.35],
      [0.96, 26.45],
      [0, 26.45],
    ],
    28,
    LIFT33_PALETTE.CARBON_ROD
  );

  // Stainless quick-disconnect clamp collar & stacked front balance weights
  const bridgeCollar = paintGeometry(
    new THREE.BoxGeometry(1.15, 1.38, 1.38).translate(-0.2, 0, 0),
    LIFT33_PALETTE.RISER_MACHINED
  );
  const weightStack = latheAlongX(
    [
      [0, 24.82],
      [1.06, 24.82],
      [1.06, 25.28],
      [0.95, 25.32],
      [1.06, 25.36],
      [1.06, 25.82],
      [0.95, 25.86],
      [1.06, 25.9],
      [1.06, 26.38],
      [0.94, 26.48],
      [0, 26.48],
    ],
    28,
    LIFT33_PALETTE.TITANIUM_SILVER
  );

  const damperRing = paintGeometry(
    new THREE.CylinderGeometry(0.96, 0.96, 0.72, 24)
      .rotateZ(Math.PI / 2)
      .translate(23.3, 0, 0),
    LIFT33_PALETTE.DAMPER_ORANGE
  );

  return sanitizeLift33Mesh(
    applyLift33StabilizerUVs(mergeParts([shank, bridgeCollar, weightStack, damperRing]))
  );
}

// ============================================================================
// 3. 'slide' GROUP (C-01 .. C-08 · 8 PARTS)
// ============================================================================

function buildSplitQuadLimbs(isUpper: boolean): THREE.BufferGeometry {
  const s = isUpper ? 1 : -1;
  // Parabolic centerline from pocket root (0, 0) to cam axle tip (-11.20, s * 9.10)
  const steps = 16;
  const spineOuter: Array<[number, number]> = [];
  const spineInner: Array<[number, number]> = [];

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    // Sweeps upward/outward then beyond-parallel rearward
    const cx = -11.2 * Math.pow(u, 1.25);
    const cy = s * (9.1 * Math.sin(u * Math.PI * 0.5) + 0.55 * Math.sin(u * Math.PI));
    // Twin stacked laminate blades diverge near mid-span and converge at root/tip clevis
    const splitHalfGap = 0.28 + 0.42 * Math.sin(u * Math.PI);
    const nx = -s * 0.58;
    const ny = 0.81;
    spineOuter.push([cx + nx * splitHalfGap, cy + ny * splitHalfGap]);
    spineInner.push([cx - nx * splitHalfGap, cy - ny * splitHalfGap]);
  }

  const subParts: THREE.BufferGeometry[] = [];
  for (const zSide of [-1.5, 1.5]) {
    const halfThickFn = (u: number) => 0.32 - 0.13 * u;
    const halfZFn = (u: number) => 0.42 - 0.12 * u;
    subParts.push(
      buildChamferedLimbBlade(
        spineOuter,
        zSide,
        halfThickFn,
        halfZFn,
        0.25,
        LIFT33_PALETTE.CARBON_LIMB
      ),
      buildChamferedLimbBlade(
        spineInner,
        zSide,
        halfThickFn,
        halfZFn,
        0.25,
        LIFT33_PALETTE.CARBON_GLASS_EDGE
      )
    );
    // CNC tip clevis fork joining upper & lower laminate blades cleanly at axle (-11.20, s*9.10)
    subParts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.68, 0.68, 0.72, 20)
          .rotateX(Math.PI / 2)
          .translate(-11.2, s * 9.1, zSide),
        LIFT33_PALETTE.RISER_MACHINED
      )
    );
  }

  const merged = applyLift33LimbsUVs(mergeParts(subParts), isUpper);
  const sanitized = sanitizeLift33Mesh(merged);

  // Attach w = 3 flex attribute so tip deflects inward & rearward under uSpringScale = 1 + flex01
  return attachFlexAttribute(sanitized, (x, y) => {
    const uApprox = clamp01(Math.hypot(x, y) / Math.hypot(-11.2, 9.1));
    const w = limbFlexWeight(uApprox);
    return [LIFT33_TIP_FLEX_DX * w, -s * LIFT33_TIP_FLEX_DY * w, 0];
  });
}

/** C-01: Split Quad Carbon-Glass Upper Limbs (`assembledPos: [-1.40, +32.40, 0]`) */
export function buildLift33UpperLimbsGeometry(): THREE.BufferGeometry {
  return buildSplitQuadLimbs(true);
}

/** C-02: Split Quad Carbon-Glass Lower Limbs (`assembledPos: [-1.40, -32.40, 0]`) */
export function buildLift33LowerLimbsGeometry(): THREE.BufferGeometry {
  return buildSplitQuadLimbs(false);
}

function buildSwitchWeightCam(isUpper: boolean): THREE.BufferGeometry {
  const s = isUpper ? 1 : -1;
  // Asymmetric Mathews SwitchWeight-X eccentric binary cam perimeter centered at axle (0, 0, 0)
  const camShape = new THREE.Shape();
  const numPts = 40;
  for (let i = 0; i < numPts; i++) {
    const a = (i / numPts) * Math.PI * 2;
    // Major lobe extends rearward (-X) and toward bow center (-s * Y)
    const r =
      2.65 +
      1.35 * Math.max(0, -Math.cos(a + s * 0.35)) +
      0.55 * Math.cos(2 * a - s * 0.4);
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) camShape.moveTo(px, py);
    else camShape.lineTo(px, py);
  }
  camShape.closePath();

  // 4 CNC weight-reduction spoke windows + central axle bore (CW polygons, zero duplicate endpoints)
  const axleHole = new THREE.Path();
  for (let i = 0; i < 18; i++) {
    const a = -(i / 18) * Math.PI * 2;
    if (i === 0) axleHole.moveTo(Math.cos(a) * 0.36, Math.sin(a) * 0.36);
    else axleHole.lineTo(Math.cos(a) * 0.36, Math.sin(a) * 0.36);
  }
  camShape.holes.push(axleHole);

  for (let k = 0; k < 4; k++) {
    const aMid = (k * Math.PI) / 2 + 0.42;
    const rIn = 0.95;
    const rOut = 1.78 + 0.65 * Math.max(0, -Math.cos(aMid + s * 0.35));
    const da = 0.38;
    const win = new THREE.Path();
    win.moveTo(Math.cos(aMid + da) * rIn, Math.sin(aMid + da) * rIn);
    win.lineTo(Math.cos(aMid + da * 0.82) * rOut, Math.sin(aMid + da * 0.82) * rOut);
    win.lineTo(Math.cos(aMid - da * 0.82) * rOut, Math.sin(aMid - da * 0.82) * rOut);
    win.lineTo(Math.cos(aMid - da) * rIn, Math.sin(aMid - da) * rIn);
    camShape.holes.push(win);
  }

  // Main cam wheel + twin outer string-track flanges creating deep V-groove around z = 0
  const coreWeb = extrudeShapeZ(camShape, 0, 0.44, LIFT33_PALETTE.CAM_BRONZE, 0, 16);

  // Inner & outer twin cable/yoke track drums flanking the main web
  const trackShape = new THREE.Shape();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = 1.65 + 0.72 * Math.max(0, Math.cos(a - s * 0.5));
    if (i === 0) trackShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else trackShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const trackHole = new THREE.Path();
  for (let i = 0; i < 18; i++) {
    const a = -(i / 18) * Math.PI * 2;
    if (i === 0) trackHole.moveTo(Math.cos(a) * 0.36, Math.sin(a) * 0.36);
    else trackHole.lineTo(Math.cos(a) * 0.36, Math.sin(a) * 0.36);
  }
  trackShape.holes.push(trackHole);

  const trackL = extrudeShapeZ(trackShape, -0.44, 0.32, LIFT33_PALETTE.CAM_GOLD, 0, 14);
  const trackR = extrudeShapeZ(trackShape, 0.44, 0.32, LIFT33_PALETTE.CAM_GOLD, 0, 14);

  // SwitchWeight-X rotating let-off module plate + titanium draw-stop peg
  const modPlate = paintGeometry(
    new THREE.BoxGeometry(2.4, 1.55, 0.24).translate(-1.35, -s * 1.15, 0.58),
    LIFT33_PALETTE.CAM_DARK
  );
  const drawStopPeg = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 1.38, 16)
      .rotateX(Math.PI / 2)
      .translate(1.85, -s * 1.85, 0),
    LIFT33_PALETTE.TITANIUM_SILVER
  );
  const moduleBolts = [
    paintGeometry(
      new THREE.CylinderGeometry(0.14, 0.14, 0.32, 8)
        .rotateX(Math.PI / 2)
        .translate(-2.05, -s * 1.4, 0.62),
      LIFT33_PALETTE.TITANIUM_SILVER
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.14, 0.14, 0.32, 8)
        .rotateX(Math.PI / 2)
        .translate(-0.65, -s * 0.85, 0.62),
      LIFT33_PALETTE.TITANIUM_SILVER
    ),
  ];

  return sanitizeLift33Mesh(
    applyLift33CamUVs(
      mergeParts([coreWeb, trackL, trackR, modPlate, drawStopPeg, ...moduleBolts])
    )
  );
}

/** C-03: Upper SwitchWeight-X Binary Cam (`assembledPos: [-12.60, +41.50, 0]`) */
export function buildLift33UpperCamGeometry(): THREE.BufferGeometry {
  return buildSwitchWeightCam(true);
}

/** C-04: Lower SwitchWeight-X Binary Cam (`assembledPos: [-12.60, -41.50, 0]`) */
export function buildLift33LowerCamGeometry(): THREE.BufferGeometry {
  return buildSwitchWeightCam(false);
}

/**
 * C-05: Titanium Cam Axles, ABEC-7 Bearing Races & E-Clips (`assembledPos: [-12.60, 0, 0]`)
 * Includes `w = 3` flex tracking so upper/lower axles remain coaxial with flexing limb tips & cams!
 */
export function buildLift33CamAxlesGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const yAxle of [41.5, -41.5]) {
    // Titanium shaft
    parts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.32, 0.32, 4.75, 20)
          .rotateX(Math.PI / 2)
          .translate(0, yAxle, 0),
        LIFT33_PALETTE.TITANIUM_SILVER
      )
    );
    // ABEC-7 stainless bearing races & limb spacers + E-clip retainers
    for (const zPos of [-0.82, 0.82]) {
      parts.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.56, 0.56, 0.36, 20)
            .rotateX(Math.PI / 2)
            .translate(0, yAxle, zPos),
          LIFT33_PALETTE.BRIGHT_STEEL
        )
      );
    }
    for (const zClip of [-2.22, 2.22]) {
      parts.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.46, 0.46, 0.14, 16)
            .rotateX(Math.PI / 2)
            .translate(0, yAxle, zClip),
          LIFT33_PALETTE.RISER_DARK
        )
      );
    }
  }

  const merged = sanitizeLift33Mesh(mergeParts(parts));
  return attachFlexAttribute(merged, (_x, y) => [
    LIFT33_TIP_FLEX_DX,
    y > 0 ? -LIFT33_TIP_FLEX_DY : LIFT33_TIP_FLEX_DY,
    0,
  ]);
}

/**
 * C-06: Braided BCY-X Bowstring with Center Serving & Speed Nocks (`assembledPos: [-16.50, 0, 0]`)
 * Flexes via `aSpringParam` mode `w = 3`: cam ends track flexing cam tangents while nock at
 * `y = +2.40` draws cleanly rearward `dx = -27.50 cm` into a crisp V-shape!
 */
export function buildLift33BowstringGeometry(): THREE.BufferGeometry {
  // Dense vertical polyline from upper cam post (+40.2) down to lower cam post (-40.2)
  const stringPts: THREE.Vector3[] = [
    new THREE.Vector3(2.2, 40.3, 0),
    new THREE.Vector3(0.95, 39.6, 0),
    new THREE.Vector3(0.0, 38.6, 0),
  ];
  const segCount = 26;
  for (let i = 1; i < segCount; i++) {
    const y = 38.6 - (77.2 * i) / segCount;
    stringPts.push(new THREE.Vector3(0, y, 0));
  }
  // Ensure an exact vertex ring sits right at LIFT33_NOCK_Y (2.40) for razor-crisp V apex!
  stringPts.push(new THREE.Vector3(0, -38.6, 0));
  stringPts.push(new THREE.Vector3(0.95, -39.6, 0));
  stringPts.push(new THREE.Vector3(2.2, -40.3, 0));

  // Insert exact nock point into sorted descending Y list
  stringPts.sort((a, b) => b.y - a.y);
  const nockIdx = stringPts.findIndex((p) => p.y < LIFT33_NOCK_Y);
  if (nockIdx > 0) {
    stringPts.splice(nockIdx, 0, new THREE.Vector3(0, LIFT33_NOCK_Y, 0));
  }

  const mainString = buildWatertightTube(
    stringPts,
    0.105,
    12,
    LIFT33_PALETTE.STRING_BCYX
  );

  // Braided center serving wrapping y ∈ [-4.5, +9.0]
  const centerServingPts = [
    new THREE.Vector3(0, 9.0, 0),
    new THREE.Vector3(0, LIFT33_NOCK_Y, 0),
    new THREE.Vector3(0, -4.5, 0),
  ];
  const centerServing = buildWatertightTube(
    centerServingPts,
    0.142,
    14,
    LIFT33_PALETTE.SERVING_DARK
  );

  // Twin Speed Nocks at y = +29.5 & -29.5
  const speedNockUpper = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.56, 14).translate(0, 29.5, 0),
    LIFT33_PALETTE.DAMPER_ORANGE
  );
  const speedNockLower = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.56, 14).translate(0, -29.5, 0),
    LIFT33_PALETTE.DAMPER_ORANGE
  );

  const merged = applyLift33BowstringUVs(
    mergeParts([mainString, centerServing, speedNockUpper, speedNockLower])
  );
  const sanitized = sanitizeLift33Mesh(merged);

  // Compute exact V-shape fullDraw displacement per vertex
  return attachFlexAttribute(sanitized, (_x, y) => {
    const camTrackDx = 1.3;
    if (y >= 38.6) {
      return [camTrackDx, -LIFT33_TIP_FLEX_DY, 0];
    }
    if (y <= -38.6) {
      return [camTrackDx, LIFT33_TIP_FLEX_DY, 0];
    }
    if (y >= LIFT33_NOCK_Y) {
      const t = (y - LIFT33_NOCK_Y) / (38.6 - LIFT33_NOCK_Y);
      return [
        LIFT33_NOCK_DRAW_DX * (1 - t) + camTrackDx * t,
        -LIFT33_TIP_FLEX_DY * t,
        0,
      ];
    }
    const t = (LIFT33_NOCK_Y - y) / (LIFT33_NOCK_Y - -38.6);
    return [
      LIFT33_NOCK_DRAW_DX * (1 - t) + camTrackDx * t,
      LIFT33_TIP_FLEX_DY * t,
      0,
    ];
  });
}

/**
 * C-07: Split-Yoke Buss & Control Cables (`assembledPos: [-13.20, 0, 0]`)
 * Pinned at cable-guard rollers (`y = -11.50, z = +1.67..+1.79`), branching via split yokes
 * to upper & lower cam axles and flexing synchronously (`w = 3`).
 */
export function buildLift33YokeCablesGeometry(): THREE.BufferGeometry {
  // Buss Cable (Upper Yoke -> Roller 1 -> Lower Cam)
  const bussMain = buildWatertightTube(
    [
      new THREE.Vector3(0.6, 25.0, 1.38),
      new THREE.Vector3(-0.08, 6.0, 1.56),
      new THREE.Vector3(-0.08, -11.5, 1.67),
      new THREE.Vector3(0.15, -26.0, 1.2),
      new THREE.Vector3(0.6, -41.5, 0.44),
    ],
    0.085,
    10,
    LIFT33_PALETTE.STRING_BCYX
  );
  const bussYokeL = buildWatertightTube(
    [
      new THREE.Vector3(0.6, 41.5, -1.35),
      new THREE.Vector3(0.6, 33.5, -0.45),
      new THREE.Vector3(0.6, 25.02, 1.38),
    ],
    0.072,
    10,
    LIFT33_PALETTE.SERVING_DARK
  );
  const bussYokeR = buildWatertightTube(
    [
      new THREE.Vector3(0.6, 41.5, 1.35),
      new THREE.Vector3(0.6, 33.5, 1.44),
      new THREE.Vector3(0.62, 24.98, 1.4),
    ],
    0.072,
    10,
    LIFT33_PALETTE.SERVING_DARK
  );

  // Control Cable (Lower Yoke -> Roller 2 -> Upper Cam)
  const ctrlMain = buildWatertightTube(
    [
      new THREE.Vector3(0.6, -24.5, 1.48),
      new THREE.Vector3(-0.08, -11.5, 1.79),
      new THREE.Vector3(0.05, 8.0, 1.22),
      new THREE.Vector3(0.45, 25.0, 0.3),
      new THREE.Vector3(0.6, 41.5, -0.44),
    ],
    0.085,
    10,
    LIFT33_PALETTE.STRING_BCYX
  );
  const ctrlYokeL = buildWatertightTube(
    [
      new THREE.Vector3(0.6, -41.5, -1.35),
      new THREE.Vector3(0.6, -33.0, -0.4),
      new THREE.Vector3(0.6, -24.52, 1.48),
    ],
    0.072,
    10,
    LIFT33_PALETTE.SERVING_DARK
  );
  const ctrlYokeR = buildWatertightTube(
    [
      new THREE.Vector3(0.6, -41.5, 1.35),
      new THREE.Vector3(0.6, -33.0, 1.44),
      new THREE.Vector3(0.62, -24.48, 1.5),
    ],
    0.072,
    10,
    LIFT33_PALETTE.SERVING_DARK
  );

  const merged = sanitizeLift33Mesh(
    mergeParts([bussMain, bussYokeL, bussYokeR, ctrlMain, ctrlYokeL, ctrlYokeR])
  );

  // Pinned at cable guard roller (y = -11.5); tracks limb tip deflection at top & bottom cams
  return attachFlexAttribute(merged, (_x, y) => {
    if (y >= -11.5) {
      const t = clamp01((y - -11.5) / (41.5 - -11.5));
      return [LIFT33_TIP_FLEX_DX * t, -LIFT33_TIP_FLEX_DY * t, 0];
    }
    const t = clamp01((-11.5 - y) / (-11.5 - -41.5));
    return [LIFT33_TIP_FLEX_DX * t, LIFT33_TIP_FLEX_DY * t, 0];
  });
}

/**
 * C-08: Bridged Elastomer Limb Dampeners & Carbon String-Stop Damper
 * (`assembledPos: [-6.50, 0, 0]`)
 */
export function buildLift33LimbDampenersGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Upper & lower bridged elastomer limb harmonic dampeners clamped between split quad limbs
  for (const s of [1, -1]) {
    const yDamp = s * 36.2;
    const xDamp = -0.35;
    for (const zSide of [-1.5, 1.5]) {
      parts.push(
        paintGeometry(
          new THREE.BoxGeometry(1.15, 0.72, 0.96).translate(xDamp, yDamp, zSide),
          LIFT33_PALETTE.DAMPER_ORANGE
        ),
        paintGeometry(
          new THREE.CylinderGeometry(0.56, 0.56, 0.36, 18)
            .rotateX(Math.PI / 2)
            .translate(xDamp, yDamp, zSide + (zSide > 0 ? 0.56 : -0.56)),
          LIFT33_PALETTE.GRIP_POLYMER
        )
      );
    }
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.45, 0.42, 3.2).translate(xDamp, yDamp, 0),
        LIFT33_PALETTE.RISER_DARK
      )
    );
  }

  // Rear Bridge-Lock Carbon String-Stop Rod & Elastomer Cup (from riser x=-1.8 -> x=-15.90 at y=-17.5)
  // Local coords (offset from assembledPos.x = -6.50): +4.70 -> -9.40
  const stopRod = buildWatertightTube(
    [
      new THREE.Vector3(4.9, -17.5, 0),
      new THREE.Vector3(-4.2, -17.5, 0),
      new THREE.Vector3(-7.6, -17.2, 0),
      new THREE.Vector3(-9.35, -17.0, 0),
    ],
    0.26,
    14,
    LIFT33_PALETTE.CARBON_ROD
  );
  const stopClamp = paintGeometry(
    new THREE.CylinderGeometry(0.44, 0.44, 1.1, 16)
      .rotateZ(Math.PI / 2)
      .translate(4.35, -17.5, 0),
    LIFT33_PALETTE.RISER_MACHINED
  );
  const stopCup = latheAlongX(
    [
      [0, -9.55],
      [0.18, -9.55],
      [0.48, -9.9],
      [0.58, -9.85],
      [0.44, -9.45],
      [0.32, -9.2],
      [0, -9.2],
    ],
    20,
    LIFT33_PALETTE.DAMPER_ORANGE
  ).translate(0, -17.0, 0);

  parts.push(stopRod, stopClamp, stopCup);

  return sanitizeLift33Mesh(mergeParts(parts));
}
