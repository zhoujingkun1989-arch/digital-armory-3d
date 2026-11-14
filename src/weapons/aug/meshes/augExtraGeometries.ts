import * as THREE from 'three';
import {
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  finalizeGeometry,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  applyAugMagUVs,
  AUG_AMBER_MAG,
  AUG_ANODIZED_GREY,
  AUG_BLACK_POLYMER,
  AUG_BRIGHT_STEEL,
  AUG_CHAMFER_STEEL,
  AUG_CHROME_STEEL,
  AUG_DARK_STEEL,
  AUG_INNER_DARK,
  AUG_MAG_ANG_END,
  AUG_MAG_ANG_START,
  AUG_MAG_ARC_CX,
  AUG_MAG_ARC_CY,
  AUG_MAG_R_INNER,
  AUG_MAG_R_OUTER,
  AUG_OLIVE,
  AUG_OLIVE_DARK,
  AUG_POLYMER_PACK,
  AUG_RUBBER_BLACK,
  AUG_SAFETY_RED,
  AUG_SAFETY_WHITE,
  AUG_SPRING_STEEL,
  sanitizeAugMesh,
} from './augGeometries';
import {
  arcLug,
  extrudeAlongX,
  latheAlongX,
  mergeCutters,
  surfaceRidges,
  twistedRiflingLands,
} from './augCadDetail';

// ============================================================================
// 1. QUICK-CHANGE 20" BARREL, GAS SYSTEM & TWIN-ROD BOLT GROUP (9 Builders)
// ============================================================================

/**
 * U-01: Quick-Change 20" (508mm) Cold-Hammer-Forged Barrel w/ 8 Interrupted Locking Rings & Rifled Bore
 * (assembledPos: [0, 1.05, 0]) — spans local/world X ∈ [-8.20, +18.85]
 */
export function buildAugBarrelGeometry(): THREE.BufferGeometry {
  // Closed hollow 20" (508mm) CHF Steyr AUG barrel lathe (X ∈ [-8.20, +18.85]):
  // 7-lug breech extension -> trunnion journal -> interrupted locking spline hub ->
  // stepped CNC gas-port shoulder w/ gas-seal grooves -> forward heavy contour ->
  // 22mm NATO grenade ring -> M13×1 LH muzzle spigot -> 11° recessed target crown dish ->
  // Ø5.56mm chrome bore -> bottleneck cone -> 5.56×45mm chamber (zero CSG, zero bore stubs!).
  const crownRim = 0.275;
  const crownBore = 0.172;
  const crownDepth = (crownRim - crownBore) * Math.tan((11 * Math.PI) / 180);
  const barrelTube = latheAlongX(
    [
      [0.39, -8.2], // Breech extension mouth
      [0.58, -8.2], // 7-lug steel breech extension collar
      [0.58, -6.55],
      [0.5, -6.25], // Rear trunnion bearing journal
      [0.5, 2.85],
      [0.535, 3.02], // Interrupted quick-change locking flange base
      [0.535, 4.38],
      [0.45, 4.55], // Receiver front bearing journal
      [0.44, 7.82],
      [0.49, 7.9], // Rear gas-block locating shoulder (X ∈ [7.90, 9.78])
      [0.49, 8.18],
      [0.465, 8.22], // Rear gas-seal circumferential groove
      [0.465, 8.32],
      [0.49, 8.36],
      [0.49, 8.7],
      [0.505, 8.75], // Precision ground gas-port metering collar
      [0.505, 9.1],
      [0.49, 9.15],
      [0.49, 9.44],
      [0.465, 9.48], // Front gas-seal circumferential groove
      [0.465, 9.58],
      [0.49, 9.62],
      [0.49, 9.76], // Front gas-block shoulder
      [0.4, 9.88], // Forward heavy 20" CHF barrel contour
      [0.4, 15.65],
      [0.443, 15.75], // NATO 22mm rifle-grenade alignment ring
      [0.443, 16.15],
      [0.39, 16.25],
      [0.39, 18.2],
      [0.295, 18.25], // M13×1 LH thread-relief undercut groove
      [0.295, 18.32],
      [0.32, 18.35], // M13×1 LH muzzle thread spigot inside tulip flash hider
      [0.32, 18.81],
      [0.295, 18.85], // Outer 45° crown chamfer
      [crownRim, 18.85], // Flat target crown rim
      [crownBore, 18.85 - crownDepth], // Recessed 11° target crown dish
      [0.16, 18.85 - crownDepth - 0.018], // Bore-edge break
      [0.16, -5.65], // Chrome-lined Ø5.56mm bore
      [0.175, -5.72], // Leade / throat
      [0.285, -6.12], // 5.56×45mm NATO bottleneck shoulder
      [0.305, -7.82], // Chamber body
      [0.39, -7.86], // Internal locking-lug recess wall
      [0.39, -8.2], // Breech mouth (closes loop)
    ],
    32,
    AUG_DARK_STEEL
  );

  const extras: THREE.BufferGeometry[] = [barrelTube];

  // 8 interrupted quick-change barrel locking rings × 4 angular spline sectors (32 chamfered spline teeth, 0 CSG!)
  for (let i = 0; i < 8; i++) {
    const x0 = 3.08 + i * 0.162;
    for (let s = 0; s < 4; s++) {
      const ang = (s * Math.PI) / 2 + (3 * Math.PI) / 8;
      extras.push(
        arcLug(
          0.525,
          0.585,
          ang,
          (46 * Math.PI) / 180,
          x0,
          0.092,
          AUG_BRIGHT_STEEL,
          0.014
        )
      );
    }
  }

  // 7 internal breech-extension locking lugs inside rear barrel extension (matching 7-lug bolt + extractor gap!)
  for (let k = 1; k < 8; k++) {
    const ang = (k * Math.PI * 2) / 8;
    extras.push(
      arcLug(
        0.305,
        0.392,
        ang,
        (24 * Math.PI) / 180,
        -8.16,
        0.28,
        AUG_CHROME_STEEL,
        0.012
      )
    );
  }

  // 45° slanted top-right gas-port metering boss & dark drilled gas orifice on gas-block journal (X = 8.92)
  extras.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.115, 0.125, 0.08, 16)
        .rotateZ(-Math.PI / 4)
        .rotateY(-Math.PI / 2)
        .translate(8.92, 0.355, 0.355),
      AUG_CHAMFER_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.062, 0.062, 0.09, 14)
        .rotateZ(-Math.PI / 4)
        .rotateY(-Math.PI / 2)
        .translate(8.92, 0.358, 0.358),
      AUG_INNER_DARK
    ),
    // NATO 22mm grenade ring band + M13×1 LH muzzle threads + chrome breech collar & feed ramp + crown dish ring
    latheAlongX(
      [
        [0.44, 15.77],
        [0.446, 15.77],
        [0.446, 16.13],
        [0.44, 16.13],
        [0.44, 15.77],
      ],
      32,
      AUG_CHAMFER_STEEL
    ),
    surfaceRidges({
      count: 16,
      r: 0.318,
      height: 0.008,
      width: 0.028,
      x0: 18.37,
      x1: 18.79,
      twistCm: -1.3,
      color: AUG_BRIGHT_STEEL,
      segments: 6,
    }),
    paintGeometry(
      new THREE.BoxGeometry(0.32, 0.18, 0.34)
        .rotateZ(0.4)
        .translate(-7.98, -0.29, 0),
      AUG_CHROME_STEEL
    ),
    latheAlongX(
      [
        [crownBore, 18.85 - crownDepth],
        [crownRim - 0.004, 18.849],
        [crownRim - 0.004, 18.846],
        [crownBore, 18.847 - crownDepth],
        [crownBore, 18.85 - crownDepth],
      ],
      32,
      AUG_CHROME_STEEL
    ),
    // 6 right-hand 1:9" (22.86 cm) helical 5.56mm rifling lands visible inside bore & recessed crown
    twistedRiflingLands({
      count: 6,
      boreR: 0.16,
      depth: 0.018,
      width: 0.032,
      x0: -5.6,
      x1: 18.85 - crownDepth - 0.022,
      twistCm: 22.86,
      color: AUG_CHROME_STEEL,
    })
  );

  return sanitizeAugMesh(mergeParts(extras));
}

/**
 * U-02: Iconic Steyr AUG A1 "Tulip" Closed-End 3-Slot Flash Suppressor (assembledPos: [19.40, 1.05, 0])
 * Spans local X ∈ [-1.15, +1.10] => world X ∈ [+18.25, +20.50] (exact muzzle tip at X = +20.50!).
 */
export function buildAugFlashHiderGeometry(): THREE.BufferGeometry {
  // Closed hollow Steyr AUG A1 tulip lathe: rear check-nut -> 22mm grenade collar ->
  // tapered tulip expansion chamber -> closed front ring w/ recessed 11° exit dish (zero bore-stub leak!).
  const rawBody = latheAlongX(
    [
      [0.325, -1.15], // M13×1 LH thread socket
      [0.49, -1.15], // Rear check-nut collar
      [0.49, -0.58],
      [0.535, -0.48], // Knurled 22mm NATO rifle-grenade spring collar
      [0.535, -0.18],
      [0.495, -0.05], // Tulip body swell
      [0.465, 0.84],
      [0.41, 1.1], // Closed-prong tapered tulip crown
      [0.35, 1.1], // Crown rim
      [0.245, 0.94], // Recessed front expansion exit cone
      [0.285, 0.82], // Internal flash-expansion chamber
      [0.285, -0.52],
      [0.325, -0.58], // Barrel muzzle stop shoulder
      [0.325, -1.15],
    ],
    32,
    AUG_DARK_STEEL
  );

  // 3 deep 120° radial flash-suppression slots (preserving closed front tulip ring X ∈ [0.84, 1.10])
  // + 4 rear check-nut wrench flats + 3 front wire-cutter crown V-notches -> ONE merged CSG brush!
  const allCuts: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(0.42, 0.18, 0.86).translate(-0.88, 0.53, 0),
    new THREE.BoxGeometry(0.42, 0.18, 0.86).translate(-0.88, -0.53, 0),
    new THREE.BoxGeometry(0.42, 0.72, 0.18).translate(-0.88, 0, 0.53),
    new THREE.BoxGeometry(0.42, 0.72, 0.18).translate(-0.88, 0, -0.53),
  ];
  for (let k = 0; k < 3; k++) {
    const ang = (k * Math.PI * 2) / 3 + Math.PI / 6;
    allCuts.push(
      new THREE.BoxGeometry(0.84, 0.3, 0.17)
        .translate(0.36, 0.38, 0)
        .rotateX(ang),
      // Subtle wire-cutter serration notch on front rim aligned between the 3 main prongs
      new THREE.BoxGeometry(0.12, 0.18, 0.085)
        .translate(1.08, 0.38, 0)
        .rotateX(ang + Math.PI / 3)
    );
  }

  const slottedTulip = csgSubtract(rawBody, [
    mergeCutters(allCuts, AUG_INNER_DARK),
  ]);

  // Axial knurling ridges on the 22mm grenade collar + captive wire grenade retention spring clip
  const grenadeKnurling = surfaceRidges({
    count: 20,
    r: 0.532,
    height: 0.012,
    width: 0.032,
    x0: -0.46,
    x1: -0.2,
    color: AUG_CHAMFER_STEEL,
  });
  const grenadeSpringClip = paintGeometry(
    new THREE.TorusGeometry(0.525, 0.025, 8, 24)
      .rotateY(Math.PI / 2)
      .translate(-0.33, 0, 0),
    AUG_BRIGHT_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([slottedTulip, grenadeKnurling, grenadeSpringClip])
  );
}

/**
 * U-03: Offset 45°-Slanted Gas Block & Foregrip Hinge Clevis (assembledPos: [8.85, 1.05, 0])
 * Barrel clamp at local (0, 0, 0); offset gas cylinder at local (Y = +0.47, Z = +0.52) => world (Y = +1.52, Z = +0.52);
 * bottom foregrip pivot clevis at local (0, -1.23, 0) => world [8.85, -0.18, 0]!
 */
export function buildAugGasBlockGeometry(): THREE.BufferGeometry {
  const barrelClamp = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.62, 1.88, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    AUG_DARK_STEEL
  );

  // Diagonal 45° slanted gas transfer bridge linking barrel sleeve (0, 0) to right-upper gas cylinder (+0.47, +0.52)
  const tiltedWeb = paintGeometry(
    new THREE.BoxGeometry(1.68, 0.94, 0.46)
      .rotateX(-0.76)
      .translate(-0.08, 0.24, 0.26),
    AUG_ANODIZED_GREY
  );

  // Offset right-upper gas cylinder (local X ∈ [-2.70, +1.05] => world X ∈ [+6.15, +9.90])
  const gasCylinder = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.44, 3.75, 24)
      .rotateZ(Math.PI / 2)
      .translate(-0.825, 0.47, 0.52),
    AUG_DARK_STEEL
  );

  // Bottom foregrip hinge clevis bracket reaching down to local Y = -1.23 (world Y = -0.18)
  const lowerStrut = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.96, 0.88).translate(0, -0.68, 0),
    AUG_ANODIZED_GREY
  );
  const clevisEarL = paintGeometry(
    new THREE.CylinderGeometry(0.39, 0.39, 0.19, 20)
      .rotateX(Math.PI / 2)
      .translate(0, -1.23, -0.44),
    AUG_CHAMFER_STEEL
  );
  const clevisEarR = paintGeometry(
    new THREE.CylinderGeometry(0.39, 0.39, 0.19, 20)
      .rotateX(Math.PI / 2)
      .translate(0, -1.23, 0.44),
    AUG_CHAMFER_STEEL
  );

  const solid = csgUnion([barrelClamp, tiltedWeb, gasCylinder, lowerStrut]);
  const hollowed = csgSubtract(solid, [
    // Barrel bore
    paintGeometry(
      new THREE.CylinderGeometry(0.49, 0.49, 2.2, 22)
        .rotateZ(Math.PI / 2)
        .translate(0, 0, 0),
      AUG_INNER_DARK
    ),
    // Gas piston bore
    paintGeometry(
      new THREE.CylinderGeometry(0.3, 0.3, 4.0, 20)
        .rotateZ(Math.PI / 2)
        .translate(-0.82, 0.47, 0.52),
      AUG_INNER_DARK
    ),
    // Side excess-gas bleed vent port on offset gas cylinder
    paintGeometry(
      new THREE.CylinderGeometry(0.08, 0.08, 0.4, 12)
        .rotateX(Math.PI / 2)
        .translate(0.18, 0.47, 0.84),
      AUG_INNER_DARK
    ),
  ]);

  // Twin taper cross-pins locking gas block onto barrel splines
  const pinF = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 1.18, 12)
      .rotateX(Math.PI / 2)
      .translate(0.52, -0.48, 0),
    AUG_BRIGHT_STEEL
  );
  const pinR = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 1.18, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.52, -0.48, 0),
    AUG_BRIGHT_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([hollowed, clevisEarL, clevisEarR, pinF, pinR])
  );
}

/**
 * U-04: 3-Position Winged Gas Regulator Plug (assembledPos: [10.05, 1.52, 0.52])
 */
export function buildAugGasRegulatorGeometry(): THREE.BufferGeometry {
  // Hollow stainless metering valve stem w/ Normal & Adverse radial gas ports
  const valveStemRaw = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.98, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.24, 0, 0),
    AUG_BRIGHT_STEEL
  );
  const valveStem = csgSubtract(valveStemRaw, [
    paintGeometry(
      new THREE.CylinderGeometry(0.18, 0.18, 0.72, 16)
        .rotateZ(Math.PI / 2)
        .translate(-0.42, 0, 0),
      AUG_INNER_DARK
    ),
    // Position 1 standard metering port + Position 2 fouled/adverse larger port
    paintGeometry(
      new THREE.CylinderGeometry(0.065, 0.065, 0.65, 12).translate(-0.32, 0, 0),
      AUG_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.095, 0.095, 0.65, 12)
        .rotateX(Math.PI / 3)
        .translate(-0.32, 0, 0),
      AUG_INNER_DARK
    ),
  ]);

  const frontCap = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.4, 0.42, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.32, 0, 0),
    AUG_DARK_STEEL
  );
  // Spring-loaded detent plunger engaging 3 click stops on gas block face
  const detentPlunger = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.28, 12)
      .rotateZ(Math.PI / 2)
      .translate(0.04, 0.34, 0),
    AUG_CHROME_STEEL
  );

  // Iconic Steyr olive-dark polymer heat-insulated dual adjustment wings + 3 setting index dots!
  const wingTop = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.36, 0.18)
      .rotateZ(-0.12)
      .translate(0.35, 0.5, 0),
    AUG_OLIVE_DARK
  );
  const wingBot = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.36, 0.18)
      .rotateZ(0.12)
      .translate(0.35, -0.5, 0),
    AUG_OLIVE_DARK
  );
  const dot1 = paintGeometry(
    new THREE.SphereGeometry(0.04, 10, 8).translate(0.53, 0.22, 0.16),
    AUG_SAFETY_WHITE
  );
  const dot2 = paintGeometry(
    new THREE.SphereGeometry(0.052, 10, 8).translate(0.53, 0.0, 0.26),
    AUG_SAFETY_WHITE
  );
  const dotGrenade = paintGeometry(
    new THREE.SphereGeometry(0.045, 10, 8).translate(0.53, -0.22, 0.16),
    AUG_SAFETY_RED
  );

  return sanitizeAugMesh(
    mergeParts([
      valveStem,
      frontCap,
      detentPlunger,
      wingTop,
      wingBot,
      dot1,
      dot2,
      dotGrenade,
    ])
  );
}

/**
 * U-05: Chrome-Plated Short-Stroke Gas Piston & Return Spring (assembledPos: [7.85, 1.52, 0.52])
 * Spans local X ∈ [-1.70, +1.65] => world X ∈ [+6.15, +9.50] inside offset gas cylinder!
 * Uses non-zero Lathe radii + end caps so zero degenerate pole normals occur.
 */
export function buildAugGasPistonGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.04, -1.7),
    new THREE.Vector2(0.18, -1.7), // Rear striker tip abutting right carrier rod at X = +6.15
    new THREE.Vector2(0.18, 0.42),
    new THREE.Vector2(0.285, 0.58), // Piston head land 1
    new THREE.Vector2(0.285, 0.74),
    new THREE.Vector2(0.225, 0.78), // Gas seal ring groove 1
    new THREE.Vector2(0.225, 0.86),
    new THREE.Vector2(0.285, 0.9), // Land 2
    new THREE.Vector2(0.285, 1.06),
    new THREE.Vector2(0.225, 1.1), // Gas seal ring groove 2
    new THREE.Vector2(0.225, 1.18),
    new THREE.Vector2(0.285, 1.22), // Land 3
    new THREE.Vector2(0.285, 1.38),
    new THREE.Vector2(0.225, 1.42), // Gas seal ring groove 3
    new THREE.Vector2(0.225, 1.48),
    new THREE.Vector2(0.29, 1.52), // Front gas cup rim
    new THREE.Vector2(0.29, 1.65),
    new THREE.Vector2(0.18, 1.65),
    new THREE.Vector2(0.16, 1.48), // Recessed front gas expansion cup
    new THREE.Vector2(0.04, 1.48),
  ];

  const piston = new THREE.LatheGeometry(pts, 24);
  piston.rotateZ(-Math.PI / 2);
  paintGeometry(piston, AUG_CHROME_STEEL);

  const rearCap = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12)
      .rotateZ(Math.PI / 2)
      .translate(-1.67, 0, 0),
    AUG_CHROME_STEEL
  );
  const cupCenter = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12)
      .rotateZ(Math.PI / 2)
      .translate(1.48, 0, 0),
    AUG_CHROME_STEEL
  );

  // 3 dark spring-steel gas piston rings seated in the grooves
  const rings: THREE.BufferGeometry[] = [];
  for (const gx of [0.82, 1.14, 1.45]) {
    rings.push(
      paintGeometry(
        new THREE.TorusGeometry(0.268, 0.024, 8, 22)
          .rotateY(Math.PI / 2)
          .translate(gx, 0, 0),
        AUG_DARK_STEEL
      )
    );
  }

  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.45,
      end: 0.42,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.24,
      wireRadius: 0.03,
      coils: 8,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    AUG_SPRING_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([piston, rearCap, cupCenter, ...rings, returnSpring])
  );
}

/**
 * U-06: Compact Bolt Carrier w/ Twin Long Hollow Tubular Guide Rods (assembledPos: [-9.20, 1.18, 0])
 * Compact machined carrier body at world X ∈ [-11.05, -7.45];
 * Twin tubular rods at local Y = +0.34 (world Y = +1.52), Z = ±0.52 extending forward to local X = +15.35 (world X = +6.15)!
 */
export function buildAugBoltCarrierGeometry(): THREE.BufferGeometry {
  // Compact CNC/investment-cast steel carrier body (local X ∈ [-1.85, +1.75])
  const carrierBlock = paintGeometry(
    new THREE.BoxGeometry(3.6, 1.12, 1.34).translate(-0.05, -0.04, 0),
    AUG_DARK_STEEL
  );
  const rodBossL = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 3.68, 20)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 0.34, -0.52),
    AUG_CHAMFER_STEEL
  );
  const rodBossR = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 3.68, 20)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 0.34, 0.52),
    AUG_CHAMFER_STEEL
  );

  const unionCarrier = csgUnion([carrierBlock, rodBossL, rodBossR]);

  // Hollow bolt-sleeve tunnel (local Y = -0.13 => world Y = 1.05), helical cam-pin slot, & hollow recoil-spring mouths
  const carrierCutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.41, 0.41, 4.0, 22)
        .rotateZ(Math.PI / 2)
        .translate(0, -0.13, 0),
      AUG_INNER_DARK
    ),
    // Helical cam-pin track rotating 7-lug bolt ~25°
    paintGeometry(
      new THREE.BoxGeometry(1.28, 0.36, 0.56)
        .rotateY(0.48)
        .translate(0.42, 0.24, 0.18),
      AUG_INNER_DARK
    ),
    // Bottom magazine feedlip clearance groove between twin stripping rails
    paintGeometry(
      new THREE.BoxGeometry(3.8, 0.24, 0.56).translate(0, -0.54, 0),
      AUG_INNER_DARK
    ),
    // Rear hollow spring mouths on left & right guide rod bosses
    paintGeometry(
      new THREE.CylinderGeometry(0.19, 0.19, 1.2, 16)
        .rotateZ(Math.PI / 2)
        .translate(-1.45, 0.34, -0.52),
      AUG_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.19, 0.19, 1.2, 16)
        .rotateZ(Math.PI / 2)
        .translate(-1.45, 0.34, 0.52),
      AUG_INNER_DARK
    ),
  ];
  const sculptedCarrier = csgSubtract(unionCarrier, carrierCutters);

  // Twin 13.65-unit Long Chrome-Plated Tubular Guide Rods extending forward to local X = +15.35 (world X = +6.15)
  const rodRight = paintGeometry(
    new THREE.CylinderGeometry(0.185, 0.185, 13.65, 18)
      .rotateZ(Math.PI / 2)
      .translate(8.52, 0.34, 0.52),
    AUG_CHROME_STEEL
  );
  const rodLeft = paintGeometry(
    new THREE.CylinderGeometry(0.185, 0.185, 13.65, 18)
      .rotateZ(Math.PI / 2)
      .translate(8.52, 0.34, -0.52),
    AUG_CHROME_STEEL
  );

  // Right rod hardened gas-piston anvil tip + Left rod charging-handle drive collar
  const rightAnvilTip = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.19, 0.38, 18)
      .rotateZ(Math.PI / 2)
      .translate(15.16, 0.34, 0.52),
    AUG_ANODIZED_GREY
  );
  const leftShuttleCollar = paintGeometry(
    new THREE.CylinderGeometry(0.245, 0.245, 0.56, 18)
      .rotateZ(Math.PI / 2)
      .translate(12.2, 0.34, -0.52),
    AUG_ANODIZED_GREY
  );

  // Rear hammer-cocking roller & axle pin under carrier tail
  const cockingRoller = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 0.58, 18)
      .rotateX(Math.PI / 2)
      .translate(-1.68, -0.48, 0),
    AUG_BRIGHT_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([
      sculptedCarrier,
      rodRight,
      rodLeft,
      rightAnvilTip,
      leftShuttleCollar,
      cockingRoller,
    ])
  );
}

/**
 * U-07: 7-Lug Rotating Bolt Head, Claw Extractor, Spring Plunger Ejector & Cam Pin (assembledPos: [-8.05, 1.05, 0])
 */
export function buildAugBoltGeometry(): THREE.BufferGeometry {
  // Closed hollow stepped CNC bolt body + guide sleeve (X ∈ [-2.175, +0.85]):
  // guide sleeve -> oil-grooved stainless stem -> bolt head -> chamfered Ø5.56×45mm breech cup -> firing-pin bore.
  const boltCore = latheAlongX(
    [
      [0.14, -2.175], // Rear firing-pin tail bore
      [0.38, -2.175], // Bolt cam guide sleeve rear face
      [0.38, -0.125],
      [0.29, -0.1], // Stepped stainless bolt stem
      [0.29, 0.02],
      [0.265, 0.04], // Circumferential lubrication / gas-seal groove
      [0.265, 0.11],
      [0.29, 0.13],
      [0.29, 0.2],
      [0.365, 0.22], // Bolt head root cylinder
      [0.365, 0.85], // Front bolt rim
      [0.265, 0.85], // Chamfered breech-cup mouth
      [0.245, 0.825],
      [0.245, 0.7], // Recessed 5.56×45mm case-head cup floor
      [0.055, 0.7], // Central firing-pin aperture
      [0.055, -0.45],
      [0.14, -0.55], // Internal firing-pin channel
      [0.14, -2.175],
    ],
    32,
    AUG_BRIGHT_STEEL
  );

  // Carve right-side (+Z) extractor seat & left-lower (-Z) counterbored ejector-plunger pocket in 1 pass
  const coreCarved = csgSubtract(boltCore, [
    mergeCutters(
      [
        new THREE.BoxGeometry(0.96, 0.2, 0.22).translate(0.4, 0, 0.34),
        new THREE.CylinderGeometry(0.062, 0.062, 0.42, 14)
          .rotateZ(Math.PI / 2)
          .translate(0.66, -0.06, -0.14),
      ],
      AUG_INNER_DARK
    ),
  ]);

  // Dark parkerized rear cam-sleeve jacket over X ∈ [-2.17, -0.13]
  const sleeveJacket = latheAlongX(
    [
      [0.376, -2.17],
      [0.382, -2.17],
      [0.382, -0.13],
      [0.376, -0.13],
      [0.376, -2.17],
    ],
    28,
    AUG_DARK_STEEL
  );

  // 7 radial chamfered annular-sector locking lugs (positions k=1..7 around +X; k=0 at +Z right is the extractor!)
  const lugs: THREE.BufferGeometry[] = [];
  for (let k = 1; k < 8; k++) {
    const ang = Math.PI / 2 + (k * Math.PI * 2) / 8;
    lugs.push(
      arcLug(
        0.345,
        0.51,
        ang,
        (24 * Math.PI) / 180,
        0.38,
        0.47,
        AUG_CHROME_STEEL,
        0.02
      )
    );
  }

  // 8th-position (+Z right side) wide spring-loaded Steyr claw extractor + undercut rim hook + pivot pin + coil spring
  const clawShape = new THREE.Shape();
  clawShape.moveTo(-0.14, -0.085);
  clawShape.lineTo(0.82, -0.085);
  clawShape.lineTo(0.895, -0.035);
  clawShape.lineTo(0.895, 0.055);
  clawShape.lineTo(0.82, 0.085);
  clawShape.lineTo(-0.14, 0.085);
  clawShape.closePath();
  const extractorBody = new THREE.ExtrudeGeometry(clawShape, {
    depth: 0.16,
    bevelEnabled: false,
  });
  extractorBody.translate(0, 0, 0.35);
  paintGeometry(extractorBody, AUG_DARK_STEEL);
  const extractorHook = paintGeometry(
    new THREE.BoxGeometry(0.11, 0.17, 0.16).translate(0.84, 0, 0.31),
    AUG_CHROME_STEEL
  );
  const extractorPivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.048, 0.048, 0.34, 12).translate(0.32, 0, 0.41),
    AUG_BRIGHT_STEEL
  );
  const extractorSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.25,
      end: 0.36,
      centerX: 0.02,
      centerZ: 0,
      coilRadius: 0.055,
      wireRadius: 0.013,
      coils: 4,
      radialSegments: 6,
      tubularSegmentsPerCoil: 10,
    }).rotateX(Math.PI / 2),
    AUG_SPRING_STEEL
  );

  // Spring-loaded left-lower (-Z) plunger ejector w/ domed face + transverse retainer roll-pin
  const ejectorPlunger = latheAlongX(
    [
      [0.015, 0.56],
      [0.048, 0.56],
      [0.048, 0.81],
      [0.034, 0.845],
      [0.015, 0.845],
      [0.015, 0.56],
    ],
    16,
    AUG_CHROME_STEEL
  );
  ejectorPlunger.translate(0, -0.06, -0.14);
  const ejectorRollPin = paintGeometry(
    new THREE.CylinderGeometry(0.032, 0.032, 0.42, 10).translate(
      0.52,
      -0.06,
      -0.14
    ),
    AUG_DARK_STEEL
  );

  // Stepped helical cam pin rising atop bolt stem w/ milled carrier-track bearing flats
  const camPin = paintGeometry(
    new THREE.CylinderGeometry(0.145, 0.145, 0.62, 20).translate(
      -0.55,
      0.43,
      0
    ),
    AUG_BRIGHT_STEEL
  );
  const camShoe = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.18, 0.25).translate(-0.55, 0.58, 0),
    AUG_CHROME_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([
      coreCarved,
      sleeveJacket,
      ...lugs,
      extractorBody,
      extractorHook,
      extractorPivotPin,
      extractorSpring,
      ejectorPlunger,
      ejectorRollPin,
      camPin,
      camShoe,
    ])
  );
}

/**
 * U-08: Stepped Stainless Steel Long Firing Pin (assembledPos: [-9.45, 1.05, 0])
 * Spans local X ∈ [-2.05, +2.05] => world X ∈ [-11.50, -7.40].
 * Non-zero Lathe radii + mergeParts ensures non-indexed BufferGeometry with precomputed boundingBox & unit normals!
 */
export function buildAugFiringPinGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.025, -2.05),
    new THREE.Vector2(0.165, -2.05), // Rear striking button (struck by aug_hammer!)
    new THREE.Vector2(0.165, -1.65),
    new THREE.Vector2(0.11, -1.6),
    new THREE.Vector2(0.11, 0.45),
    new THREE.Vector2(0.17, 0.5), // Stop collar
    new THREE.Vector2(0.17, 0.72),
    new THREE.Vector2(0.09, 0.8),
    new THREE.Vector2(0.075, 1.65),
    new THREE.Vector2(0.032, 2.04), // Firing pin tip
    new THREE.Vector2(0.012, 2.05),
  ];
  const lathe = new THREE.LatheGeometry(pts, 20);
  lathe.rotateZ(-Math.PI / 2);
  paintGeometry(lathe, AUG_CHROME_STEEL);

  const rearButtonCap = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12)
      .rotateZ(Math.PI / 2)
      .translate(-2.025, 0, 0),
    AUG_CHROME_STEEL
  );
  // Cam-pin retention flat collar detail
  const lockFlatRing = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.16, 0.22).translate(0.88, -0.02, 0),
    AUG_BRIGHT_STEEL
  );

  return sanitizeAugMesh(mergeParts([lathe, rearButtonCap, lockFlatRing]));
}

/**
 * U-09: Dual Parallel Helical Recoil Springs & Rear Guide Bridge (assembledPos: [-13.20, 1.52, 0])
 * Spans local X ∈ [-3.85, +3.75] (L0 = 7.60) => world X ∈ [-17.05, -9.45] along Z = ±0.52!
 */
export function buildAugRecoilSpringsGeometry(): THREE.BufferGeometry {
  const springL = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -3.75,
      end: 3.75,
      centerY: 0,
      centerZ: -0.52,
      coilRadius: 0.21,
      wireRadius: 0.034,
      coils: 18,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    AUG_SPRING_STEEL
  );
  const springR = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -3.75,
      end: 3.75,
      centerY: 0,
      centerZ: 0.52,
      coilRadius: 0.21,
      wireRadius: 0.034,
      coils: 18,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    AUG_SPRING_STEEL
  );
  const innerRodL = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 7.3, 12)
      .rotateZ(Math.PI / 2)
      .translate(-0.15, 0, -0.52),
    AUG_BRIGHT_STEEL
  );
  const innerRodR = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 7.3, 12)
      .rotateZ(Math.PI / 2)
      .translate(-0.15, 0, 0.52),
    AUG_BRIGHT_STEEL
  );
  const rearBridge = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.54, 1.4).translate(-3.82, 0, 0),
    AUG_DARK_STEEL
  );
  const bufferPad = paintGeometry(
    new THREE.BoxGeometry(0.14, 0.44, 0.62).translate(-3.66, -0.04, 0),
    AUG_RUBBER_BLACK
  );

  return sanitizeAugMesh(
    mergeParts([springL, springR, innerRodL, innerRodR, rearBridge, bufferPad])
  );
}

// ============================================================================
// 2. PROGRESSIVE TRIGGER, TRANSFER BARS & REAR POLYMER HAMMER PACK (5 Builders)
// ============================================================================

/**
 * FC-01: Progressive Two-Stage Sliding Polymer Trigger (assembledPos: [0.55, -2.35, 0])
 * Slides linearly rearward (-X) in Steyr AUG — 1st stage = semi-auto, 2nd stage = full-auto!
 */
export function buildAugTriggerGeometry(): THREE.BufferGeometry {
  // Linear dovetail slide block riding inside stock fore-channel
  const guideBlock = paintGeometry(
    new THREE.BoxGeometry(1.44, 0.54, 0.58).translate(-0.05, 0.62, 0),
    AUG_BLACK_POLYMER
  );
  const guideRails = paintGeometry(
    new THREE.BoxGeometry(1.4, 0.16, 0.72).translate(-0.05, 0.76, 0),
    AUG_OLIVE_DARK
  );

  const shoeShape = new THREE.Shape();
  shoeShape.moveTo(-0.42, 0.45);
  shoeShape.lineTo(0.46, 0.45);
  shoeShape.quadraticCurveTo(0.22, -0.35, 0.36, -1.08);
  shoeShape.lineTo(-0.18, -1.14);
  shoeShape.quadraticCurveTo(-0.46, -0.45, -0.42, 0.45);
  shoeShape.closePath();

  const shoe = new THREE.ExtrudeGeometry(shoeShape, {
    depth: 0.48,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  shoe.translate(0, 0, -0.24);
  paintGeometry(shoe, AUG_BLACK_POLYMER);

  // Tactile horizontal serrations on sliding trigger face
  const faceRibs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const ty = -0.15 - i * 0.24;
    faceRibs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.08, 0.06, 0.5).translate(0.32, ty, 0),
        AUG_INNER_DARK
      )
    );
  }

  // Clamping yoke & cross-bolt joining sliding trigger rigidly to the dual steel transfer bars
  const yokeBolt = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.84, 16)
      .rotateX(Math.PI / 2)
      .translate(-0.22, 0.65, 0),
    AUG_BRIGHT_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([guideBlock, guideRails, shoe, ...faceRibs, yokeBolt])
  );
}

/**
 * FC-02: Rectangular Cross-Bolt Push-Button Safety w/ Red Warning Band (assembledPos: [-0.65, -1.42, 0])
 */
export function buildAugSafetyGeometry(): THREE.BufferGeometry {
  // Rectangular polymer cross-bar w/ trigger-blocking notch & click-detent V-grooves
  const mainBarRaw = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.44, 1.88).translate(0, 0, 0.04),
    AUG_BLACK_POLYMER
  );
  const mainBar = csgSubtract(mainBarRaw, [
    paintGeometry(
      new THREE.BoxGeometry(0.52, 0.18, 0.38).translate(0.12, -0.18, -0.24),
      AUG_INNER_DARK
    ),
  ]);

  // Iconic bright red left indicator band (FIRE ready) + crisp white safe dot on right face
  const redIndicator = paintGeometry(
    new THREE.BoxGeometry(0.44, 0.42, 0.28).translate(0, 0, -0.96),
    AUG_SAFETY_RED
  );
  const whiteSafeDot = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.06, 14)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.99),
    AUG_SAFETY_WHITE
  );
  const detentPlunger = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.52, 12).translate(0, 0.22, 0.2),
    AUG_BRIGHT_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([mainBar, redIndicator, whiteSafeDot, detentPlunger])
  );
}

/**
 * FC-03: Long Dual Parallel Steel Trigger Transfer Bars (assembledPos: [-6.60, -1.25, 0])
 * Spans local X ∈ [-7.35, +6.95] => world X ∈ [-13.95, +0.35] (14.3 units long!),
 * straddling pistol grip & rear magwell at Z = ±0.58 to link front sliding trigger to rear hammer pack!
 */
export function buildAugTransferBarsGeometry(): THREE.BufferGeometry {
  // Front clamping yoke connecting to aug_trigger at world X = +0.35, Y = -1.70
  const frontYoke = paintGeometry(
    new THREE.BoxGeometry(0.52, 0.38, 1.28).translate(6.82, -0.45, 0),
    AUG_DARK_STEEL
  );
  const clampScrew = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.32, 12)
      .rotateZ(Math.PI / 2)
      .translate(7.08, -0.45, 0),
    AUG_BRIGHT_STEEL
  );

  // Stepped twin longitudinal steel bars (low near trigger Y_local = -0.45, stepping up at X_local = +2.5 to Y_local = +0.25 past magwell!)
  const barShape = new THREE.Shape();
  barShape.moveTo(6.95, -0.56);
  barShape.lineTo(6.95, -0.34);
  barShape.lineTo(3.2, -0.34);
  barShape.lineTo(2.1, 0.33); // Smooth upward step clearing rear bullpup magwell!
  barShape.lineTo(-7.35, 0.33);
  barShape.lineTo(-7.35, 0.11);
  barShape.lineTo(1.95, 0.11);
  barShape.lineTo(3.05, -0.56);
  barShape.closePath();

  const barLeft = new THREE.ExtrudeGeometry(barShape, {
    depth: 0.095,
    bevelEnabled: false,
  });
  barLeft.translate(0, 0, -0.625);
  paintGeometry(barLeft, AUG_BRIGHT_STEEL);

  const barRight = new THREE.ExtrudeGeometry(barShape, {
    depth: 0.095,
    bevelEnabled: false,
  });
  barRight.translate(0, 0, 0.53);
  paintGeometry(barRight, AUG_BRIGHT_STEEL);

  // Mid-span alignment guide tabs + Rear sear-actuating crossbar & locknut engaging aug_hammer_pack
  const rearBridge = paintGeometry(
    new THREE.BoxGeometry(0.52, 0.36, 1.26).translate(-7.15, 0.22, 0),
    AUG_DARK_STEEL
  );
  const rearAdjustNut = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.24, 6)
      .rotateZ(Math.PI / 2)
      .translate(-7.42, 0.22, 0),
    AUG_BRIGHT_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([
      frontYoke,
      clampScrew,
      barLeft,
      barRight,
      rearBridge,
      rearAdjustNut,
    ])
  );
}

/**
 * FC-04: Iconic Steyr All-Polymer Rear Hammer Pack Housing (`aug_hammer_pack`, assembledPos: [-14.65, -0.65, 0])
 * Seated in the rear buttstock BEHIND the magwell (world X ∈ [-16.85, -12.45], Y ∈ [-2.35, +0.55]).
 * Molded Autolube polyamide chassis w/ progressive 2-stage sear slide, disconnector, drop safety & autosear!
 */
export function buildAugHammerPackGeometry(): THREE.BufferGeometry {
  const rawChassis = paintGeometry(
    new THREE.BoxGeometry(4.35, 2.22, 1.18).translate(0, -0.06, 0),
    AUG_POLYMER_PACK
  );
  const innerPocket = paintGeometry(
    new THREE.BoxGeometry(3.65, 1.85, 0.82).translate(0.1, 0.28, 0),
    AUG_OLIVE_DARK
  );
  const rearSlant = paintGeometry(
    new THREE.BoxGeometry(1.8, 0.9, 1.4)
      .rotateZ(-0.32)
      .translate(-1.55, -1.08, 0),
    AUG_OLIVE_DARK
  );
  // Molded side lightening pockets on outer polymer pack walls
  const sidePocketL = paintGeometry(
    new THREE.BoxGeometry(2.4, 0.95, 0.12).translate(0.15, -0.1, -0.58),
    AUG_OLIVE_DARK
  );
  const sidePocketR = paintGeometry(
    new THREE.BoxGeometry(2.4, 0.95, 0.12).translate(0.15, -0.1, 0.58),
    AUG_OLIVE_DARK
  );
  const chassisShell = csgSubtract(rawChassis, [
    innerPocket,
    rearSlant,
    sidePocketL,
    sidePocketR,
  ]);

  // Molded Autolube Polymer Progressive Sear Slide, Semi-Auto Disconnector & Bolt-Tripped Autosear Lever
  const searSlide = paintGeometry(
    new THREE.BoxGeometry(2.55, 0.36, 0.56).translate(0.38, -0.16, 0),
    AUG_OLIVE
  );
  const disconnectorHook = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.62, 0.32)
      .rotateZ(0.22)
      .translate(-0.45, 0.34, -0.16),
    AUG_OLIVE_DARK
  );
  const autosearLever = paintGeometry(
    new THREE.BoxGeometry(0.92, 0.68, 0.28)
      .rotateZ(-0.24)
      .translate(1.22, 0.36, 0.18),
    AUG_BLACK_POLYMER
  );

  // Stationary hammer torsion-spring reaction legs anchored inside polymer hammer pack
  const springLegL = paintGeometry(
    new THREE.CylinderGeometry(0.03, 0.03, 0.95, 8)
      .rotateZ(Math.PI / 2 - 0.18)
      .translate(1.34, 0.36, -0.38),
    AUG_SPRING_STEEL
  );
  const springLegR = paintGeometry(
    new THREE.CylinderGeometry(0.03, 0.03, 0.95, 8)
      .rotateZ(Math.PI / 2 - 0.18)
      .translate(1.34, 0.36, 0.38),
    AUG_SPRING_STEEL
  );

  // Transverse pivot pins across polymer hammer pack
  const pin1 = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 1.22, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.45, 0.2, 0),
    AUG_BRIGHT_STEEL
  );
  const pin2 = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 1.22, 14)
      .rotateX(Math.PI / 2)
      .translate(1.22, 0.25, 0),
    AUG_BRIGHT_STEEL
  );

  // Bottom takedown-pin locking lug (engaged by aug_takedown_pin at world [-15.85, -2.45, 0])
  const pinLug = csgSubtract(
    paintGeometry(
      new THREE.BoxGeometry(0.88, 0.76, 0.76).translate(-1.2, -1.38, 0),
      AUG_POLYMER_PACK
    ),
    [
      paintGeometry(
        new THREE.CylinderGeometry(0.19, 0.19, 0.9, 14)
          .rotateX(Math.PI / 2)
          .translate(-1.2, -1.8, 0),
        AUG_INNER_DARK
      ),
    ]
  );

  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.65,
      end: -0.35,
      centerY: -0.15,
      centerZ: 0,
      coilRadius: 0.14,
      wireRadius: 0.026,
      coils: 7,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    AUG_SPRING_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([
      chassisShell,
      searSlide,
      disconnectorHook,
      autosearLever,
      springLegL,
      springLegR,
      pin1,
      pin2,
      pinLug,
      returnSpring,
    ])
  );
}

/**
 * FC-05: Rear Autolube All-Polymer Rotary Hammer & Dual Torsion Springs (`aug_hammer`, assembledPos: [-12.85, -0.05, 0])
 * Pivot at local (0, 0, 0): rests cocked-flat rearward (rotateZ(1.55), worldY_max <= +0.31) below aug_bolt_carrier (+0.49);
 * rotating rz = -2.18 swings hammer UP & FORWARD (+X) to kiss aug_firing_pin rear button at world [-11.50, +1.05, 0]!
 */
export function buildAugHammerGeometry(): THREE.BufferGeometry {
  const pivotAxle = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 1.14, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    AUG_BRIGHT_STEEL
  );

  // Molded Autolube glass-filled polyamide rotary hammer profile (cocked flat rearward at f = 0)
  const hShape = new THREE.Shape();
  hShape.moveTo(-0.24, -0.14);
  hShape.lineTo(0.22, -0.14);
  hShape.lineTo(0.3, 0.42); // Autosear catch step
  hShape.lineTo(0.31, 0.92);
  hShape.lineTo(0.24, 1.54); // Flat striking nose reaching [-11.50, +1.05] at rz = -2.18!
  hShape.lineTo(-0.26, 1.42); // Upper carrier-cocking crest
  hShape.lineTo(-0.44, 0.56); // Disconnector / primary sear notch
  hShape.closePath();

  // Molded lightening hole inside polymer hammer web
  const lightHole = new THREE.Path();
  lightHole.absarc(-0.04, 0.76, 0.14, 0, Math.PI * 2, false);
  hShape.holes.push(lightHole);

  const hammerHead = new THREE.ExtrudeGeometry(hShape, {
    depth: 0.44,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  hammerHead.translate(0, 0, -0.22);
  hammerHead.rotateZ(1.55); // Cocked flat rearward (worldY_max ~ +0.31 < carrier +0.49); rz = -2.18 swings nose onto firing pin!
  paintGeometry(hammerHead, AUG_POLYMER_PACK);

  // Coaxial steel hammer torsion spring coils + short hammer-engaging cross bridge around hub
  const coilL = paintGeometry(
    finalizeGeometry(
      createHelicalSpring({
        axis: 'y',
        start: -0.48,
        end: -0.26,
        centerX: 0,
        centerZ: 0,
        coilRadius: 0.31,
        wireRadius: 0.032,
        coils: 3.5,
      }).rotateX(Math.PI / 2)
    ),
    AUG_SPRING_STEEL
  );
  const coilR = paintGeometry(
    finalizeGeometry(
      createHelicalSpring({
        axis: 'y',
        start: 0.26,
        end: 0.48,
        centerX: 0,
        centerZ: 0,
        coilRadius: 0.31,
        wireRadius: 0.032,
        coils: 3.5,
      }).rotateX(Math.PI / 2)
    ),
    AUG_SPRING_STEEL
  );
  const springBridge = paintGeometry(
    new THREE.CylinderGeometry(0.03, 0.03, 0.96, 8)
      .rotateX(Math.PI / 2)
      .translate(-0.34, 0.22, 0),
    AUG_SPRING_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([pivotAxle, hammerHead, coilL, coilR, springBridge])
  );
}

// ============================================================================
// 3. 30-ROUND TRANSLUCENT AMBER WAFFLE-GRID POLYMER MAGAZINE (4 Builders)
// ============================================================================

/**
 * M-01: 30-Round Translucent Amber Waffle-Pattern Curved Polymer Magazine Body
 * (assembledPos: [-9.95, 0.45, 0], isShell: true)
 * Seated flush in the rear bullpup magwell BEHIND the pistol grip, w/ 3D horizontal & vertical waffle ribs!
 */
export function buildAugMagBodyGeometry(): THREE.BufferGeometry {
  const magShape = new THREE.Shape();
  const steps = 26;

  // Outer (rear -X) convex arc from top (angStart) to bottom (angEnd)
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const ang = AUG_MAG_ANG_START + (AUG_MAG_ANG_END - AUG_MAG_ANG_START) * u;
    const px = AUG_MAG_ARC_CX - Math.cos(ang) * AUG_MAG_R_OUTER;
    const py = AUG_MAG_ARC_CY - Math.sin(ang) * AUG_MAG_R_OUTER;
    if (i === 0) magShape.moveTo(px, py);
    else magShape.lineTo(px, py);
  }
  // Inner (front +X) concave arc from bottom back to top
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    const ang = AUG_MAG_ANG_START + (AUG_MAG_ANG_END - AUG_MAG_ANG_START) * u;
    const px = AUG_MAG_ARC_CX - Math.cos(ang) * AUG_MAG_R_INNER;
    const py = AUG_MAG_ARC_CY - Math.sin(ang) * AUG_MAG_R_INNER;
    magShape.lineTo(px, py);
  }
  magShape.closePath();

  const rawBody = new THREE.ExtrudeGeometry(magShape, {
    depth: 1.14,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  rawBody.translate(0, 0, -0.57);
  paintGeometry(rawBody, AUG_AMBER_MAG);

  // Hollow top feed throat cavity
  const throatCut = paintGeometry(
    new THREE.BoxGeometry(1.96, 1.68, 0.86).translate(0, -0.15, 0),
    AUG_INNER_DARK
  );
  const sculpted = csgSubtract(rawBody, [throatCut]);

  const parts: THREE.BufferGeometry[] = [sculpted];
  const rMid = (AUG_MAG_R_INNER + AUG_MAG_R_OUTER) * 0.5;

  // 1. Physical 3D Horizontal Waffle-Grid Ribs below magwell lip (ang ∈ [0.23, 0.45])
  for (let r = 0; r < 6; r++) {
    const ang = 0.235 + r * 0.042;
    const mx = AUG_MAG_ARC_CX - Math.cos(ang) * rMid;
    const my = AUG_MAG_ARC_CY - Math.sin(ang) * rMid;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(2.44, 0.095, 1.24)
          .rotateZ(ang)
          .translate(mx, my, 0),
        AUG_AMBER_MAG
      )
    );
  }

  // 2. Physical 3D Longitudinal/Curved Waffle-Grid Ribs intersecting the horizontal ribs!
  for (const rFrac of [-0.62, 0.0, 0.62]) {
    const rRib = rMid + rFrac * 0.95;
    for (let s = 0; s < 5; s++) {
      const ang = 0.25 + s * 0.044;
      const mx = AUG_MAG_ARC_CX - Math.cos(ang) * rRib;
      const my = AUG_MAG_ARC_CY - Math.sin(ang) * rRib;
      parts.push(
        paintGeometry(
          new THREE.BoxGeometry(0.11, 0.82, 1.23)
            .rotateZ(ang)
            .translate(mx, my, 0),
          AUG_AMBER_MAG
        )
      );
    }
  }

  // Contoured Steyr olive-dark polymer double-stack C-section feed lips (painted AUG_OLIVE_DARK so
  // applyAugMagUVs routes them to the olive polymer UV island) + front bullet ramp + magwell stop lugs!
  const buildAugFeedLip = (s: 1 | -1): THREE.BufferGeometry => {
    const lip = new THREE.Shape();
    lip.moveTo(s * 0.53, 0.05);
    lip.lineTo(s * 0.53, 0.26);
    lip.quadraticCurveTo(s * 0.53, 0.358, s * 0.36, 0.36);
    lip.lineTo(s * 0.22, 0.352);
    lip.quadraticCurveTo(s * 0.195, 0.32, s * 0.22, 0.292);
    lip.lineTo(s * 0.35, 0.298);
    lip.quadraticCurveTo(s * 0.44, 0.29, s * 0.44, 0.21);
    lip.lineTo(s * 0.44, 0.05);
    lip.closePath();
    return extrudeAlongX(lip, -1.13, 2.26, AUG_OLIVE_DARK, 0.025, 5);
  };
  parts.push(
    buildAugFeedLip(-1),
    buildAugFeedLip(1),
    // Front bullet-guide ramp collar & magwell over-insertion stop shelves
    paintGeometry(
      new THREE.BoxGeometry(0.22, 0.22, 0.92).translate(1.02, 0.08, 0),
      AUG_OLIVE_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.34, 0.14, 0.06)
        .rotateZ(0.18)
        .translate(0.02, -3.12, -0.585),
      AUG_AMBER_MAG
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.34, 0.14, 0.06)
        .rotateZ(0.18)
        .translate(0.02, -3.12, 0.585),
      AUG_AMBER_MAG
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.28, 0.42, 0.84).translate(1.3, -3.28, 0),
      AUG_OLIVE_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.38, 0.36, 0.88).translate(-1.32, -3.55, 0),
      AUG_OLIVE_DARK
    )
  );

  const merged = sanitizeAugMesh(mergeParts(parts));
  return applyAugMagUVs(merged);
}

/**
 * M-02: Anti-Tilt Polymer Follower (assembledPos: [-9.85, -1.45, 0])
 */
export function buildAugMagFollowerGeometry(): THREE.BufferGeometry {
  const deck = paintGeometry(
    new THREE.BoxGeometry(2.08, 0.26, 0.82).rotateZ(0.06).translate(0, 0.14, 0),
    AUG_BLACK_POLYMER
  );
  const stackStep = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 1.98, 18)
      .rotateZ(Math.PI / 2 + 0.06)
      .translate(0, 0.28, -0.16),
    AUG_OLIVE
  );
  const rightGuideBead = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 1.92, 14)
      .rotateZ(Math.PI / 2 + 0.06)
      .translate(0, 0.24, 0.24),
    AUG_OLIVE
  );
  const legFront = paintGeometry(
    new THREE.BoxGeometry(0.2, 0.92, 0.76)
      .rotateZ(0.08)
      .translate(0.9, -0.3, 0),
    AUG_BLACK_POLYMER
  );
  const legRear = paintGeometry(
    new THREE.BoxGeometry(0.2, 0.92, 0.76)
      .rotateZ(0.08)
      .translate(-0.9, -0.3, 0),
    AUG_BLACK_POLYMER
  );
  const springBoss = paintGeometry(
    new THREE.BoxGeometry(0.86, 0.36, 0.38)
      .rotateZ(0.06)
      .translate(0, -0.16, 0),
    AUG_OLIVE_DARK
  );
  const antiTiltRibL = paintGeometry(
    new THREE.BoxGeometry(1.36, 0.12, 0.05)
      .rotateZ(0.06)
      .translate(0, -0.08, -0.38),
    AUG_OLIVE_DARK
  );
  const antiTiltRibR = paintGeometry(
    new THREE.BoxGeometry(1.36, 0.12, 0.05)
      .rotateZ(0.06)
      .translate(0, -0.08, 0.38),
    AUG_OLIVE_DARK
  );

  return sanitizeAugMesh(
    mergeParts([
      deck,
      stackStep,
      rightGuideBead,
      legFront,
      legRear,
      springBoss,
      antiTiltRibL,
      antiTiltRibR,
    ])
  );
}

/**
 * M-03: Curved Rectangular Magazine Coil Spring matching the exact AUG 5.56mm arc (assembledPos: [-9.95, 0.45, 0])
 */
export function buildAugMagSpringGeometry(): THREE.BufferGeometry {
  const coils = 10;
  const stepsPerCoil = 24;
  const totalSteps = coils * stepsPerCoil;
  const points: THREE.Vector3[] = [];
  const rMid = (AUG_MAG_R_INNER + AUG_MAG_R_OUTER) * 0.5;

  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const ang = 0.115 + u * 0.335;
    const theta = u * coils * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const radialOffset = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.6) * 0.82;
    const zOffset = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.6) * 0.32;

    const rCur = rMid + radialOffset;
    const px = AUG_MAG_ARC_CX - Math.cos(ang) * rCur;
    const py = AUG_MAG_ARC_CY - Math.sin(ang) * rCur;
    points.push(new THREE.Vector3(px, py, zOffset));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(curve, totalSteps, 0.044, 8, false);
  paintGeometry(tube, AUG_SPRING_STEEL);
  return sanitizeAugMesh(finalizeGeometry(tube));
}

/**
 * M-04: Flush Angled Polymer Magazine Floorplate & Lock Button (assembledPos: [-7.84, -8.00, 0])
 * Exact match to AUG_MAG_ANG_END = 0.48 rad bottom face of aug_mag_body at [-7.916, -7.862, 0] -> ZERO gap!
 */
export function buildAugMagFloorplateGeometry(): THREE.BufferGeometry {
  const basePlate = paintGeometry(
    new THREE.BoxGeometry(2.76, 0.34, 1.34)
      .rotateZ(AUG_MAG_ANG_END)
      .translate(0, 0, 0),
    AUG_BLACK_POLYMER
  );
  const retainFlange = paintGeometry(
    new THREE.BoxGeometry(2.54, 0.16, 1.24)
      .rotateZ(AUG_MAG_ANG_END)
      .translate(-0.08, 0.16, 0),
    AUG_OLIVE_DARK
  );
  const slideRailL = paintGeometry(
    new THREE.BoxGeometry(2.48, 0.08, 0.12)
      .translate(-0.04, 0.2, -0.55)
      .rotateZ(AUG_MAG_ANG_END),
    AUG_BLACK_POLYMER
  );
  const slideRailR = paintGeometry(
    new THREE.BoxGeometry(2.48, 0.08, 0.12)
      .translate(-0.04, 0.2, 0.55)
      .rotateZ(AUG_MAG_ANG_END),
    AUG_BLACK_POLYMER
  );
  const lockBezel = paintGeometry(
    new THREE.TorusGeometry(0.21, 0.025, 8, 20)
      .rotateX(Math.PI / 2)
      .translate(0.02, -0.17, 0)
      .rotateZ(AUG_MAG_ANG_END),
    AUG_INNER_DARK
  );
  const lockTab = paintGeometry(
    new THREE.CylinderGeometry(0.17, 0.17, 0.24, 20)
      .translate(0.02, -0.13, 0)
      .rotateZ(AUG_MAG_ANG_END),
    AUG_OLIVE_DARK
  );
  const tractionRibs: THREE.BufferGeometry[] = [];
  for (const rx of [-0.92, -0.58, 0.58, 0.92]) {
    tractionRibs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.1, 0.035, 1.08)
          .translate(rx, -0.175, 0)
          .rotateZ(AUG_MAG_ANG_END),
        AUG_OLIVE_DARK
      )
    );
  }

  return sanitizeAugMesh(
    mergeParts([
      basePlate,
      retainFlange,
      slideRailL,
      slideRailR,
      lockBezel,
      lockTab,
      ...tractionRibs,
    ])
  );
}
