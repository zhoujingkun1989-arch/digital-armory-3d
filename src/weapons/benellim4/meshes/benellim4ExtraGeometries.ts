import * as THREE from 'three';
import {
  createBeveledCylinder,
  createChamferedBox,
  createHelicalSpring,
  createMilStdPicatinnyRail,
  csgSubtract,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  BENELLIM4_STOCK_ANGLE,
  BM4_BRASS_ACCENT,
  BM4_DARK_STEEL,
  BM4_FOLLOWER_RED,
  BM4_HARD_CHROME,
  BM4_INNER_DARK,
  BM4_PARKERIZED_STEEL,
  BM4_POLYMER_BLACK,
  BM4_POLYMER_GRIP,
  BM4_RECEIVER_ANODIZED,
  BM4_RECEIVER_CHAMFER,
  BM4_RUBBER_PAD,
  BM4_SAFETY_CRIMSON,
  BM4_SPRING_STEEL,
  BM4_STAINLESS,
  BM4_TRITIUM_WHITE,
  applyBenelliFurnitureUVs,
  applyBenelliParkerizedUVs,
  applyBenelliRailSightUVs,
  applyBenelliReceiverUVs,
  extrudeAlongX,
  extrudeAlongZ,
  mergeCutters,
  revolveClosedX,
  sanitizeBenelliMesh,
} from './benellim4Geometries';

// ============================================================================
// 1. 'frame' GROUP — ANODIZED RECEIVER, GHOST-RING SIGHTS & M1014 STOCK (7 PARTS)
// ============================================================================

/**
 * F-01: MIL-STD-8625 Type-III Anodized 7075-T6 Aluminum Receiver (`assembledPos: [0, 0, 0]`, `isShell: true`).
 * Spans `X ∈ [-10.8, +10.2], Y ∈ [-1.92, +2.82], Z ∈ [-1.78, +1.78]`.
 * Features `+Z` 3-inch ejection port, flared bottom loading port, angled rear tang & dual front sockets.
 */
export function buildBenelliM4ReceiverGeometry(): THREE.BufferGeometry {
  const sideProfile = new THREE.Shape();
  sideProfile.moveTo(-10.8, -1.35);
  sideProfile.lineTo(-8.8, -1.92);
  sideProfile.lineTo(10.2, -1.92);
  sideProfile.lineTo(10.2, 2.52);
  sideProfile.lineTo(9.4, 2.82);
  sideProfile.lineTo(-6.8, 2.82);
  sideProfile.quadraticCurveTo(-9.3, 2.75, -10.8, 1.48);
  sideProfile.closePath();

  const rawShell = extrudeAlongZ(
    sideProfile,
    0,
    3.52,
    BM4_RECEIVER_ANODIZED,
    0.09,
    10
  );

  // Carve hollow bolt raceway, +Z 3" ejection port, charging slot, bottom loading port & front sockets
  const internalCutA = mergeCutters(
    [
      // Main internal bolt-carrier & shell-elevator raceway
      new THREE.BoxGeometry(19.6, 3.68, 2.66).translate(-0.2, 0.52, 0),
      // Front 18.5" barrel extension bore (`Y = 1.35`)
      new THREE.CylinderGeometry(1.42, 1.42, 4.8, 26)
        .rotateZ(Math.PI / 2)
        .translate(8.8, 1.35, 0),
      // Front 7-rd magazine tube socket (`Y = -1.25`)
      new THREE.CylinderGeometry(1.28, 1.28, 3.6, 24)
        .rotateZ(Math.PI / 2)
        .translate(9.2, -1.25, 0),
    ],
    BM4_INNER_DARK
  );

  const portsCutB = mergeCutters(
    [
      // Right-flank (+Z) beveled 3-inch combat ejection port & charging-handle slot
      new THREE.BoxGeometry(7.85, 1.56, 1.15).translate(4.35, 1.38, 1.45),
      new THREE.BoxGeometry(6.8, 0.56, 1.15).translate(-0.4, 1.5, 1.45),
      // Flared bottom (-Y) shell loading port & trigger-housing mortise
      new THREE.BoxGeometry(16.8, 1.15, 2.38).translate(-1.2, -1.68, 0),
      // Twin front bulkhead ports for dual ARGO tappet rods (`Y = 0.12, Z = ±1.18`)
      new THREE.CylinderGeometry(0.28, 0.28, 3.4, 16)
        .rotateZ(Math.PI / 2)
        .translate(9.2, 0.12, -1.18),
      new THREE.CylinderGeometry(0.28, 0.28, 3.4, 16)
        .rotateZ(Math.PI / 2)
        .translate(9.2, 0.12, 1.18),
      // Rear angled recoil-tube socket (`Y = 0.35`)
      new THREE.CylinderGeometry(0.95, 0.95, 3.2, 20)
        .rotateZ(Math.PI / 2 + BENELLIM4_STOCK_ANGLE)
        .translate(-10.1, 0.35, 0),
    ],
    BM4_INNER_DARK
  );

  const receiverShell = csgSubtract(rawShell, [internalCutA, portsCutB]);

  // Brass/hull deflector bump behind +Z ejection port & receiver cross-pin bosses
  const hullDeflector = createChamferedBox(
    0.72,
    0.92,
    0.26,
    0.04,
    BM4_RECEIVER_CHAMFER
  );
  hullDeflector.translate(0.15, 1.38, 1.82);

  return sanitizeBenelliMesh(
    applyBenelliReceiverUVs(mergeParts([receiverShell, hullDeflector])),
    true
  );
}

/**
 * F-02: Top MIL-STD-1913 Picatinny Optic Rail (`assembledPos: [0, 0, 0]`).
 * Spans `X ∈ [-5.2, +9.4], Y ∈ [+2.80, +3.32], Z ∈ [-1.06, +1.06]`.
 */
export function buildBenelliM4PicatinnyRailGeometry(): THREE.BufferGeometry {
  const rail = createMilStdPicatinnyRail(
    14.6,
    -5.2,
    3.32,
    2.12,
    BM4_RECEIVER_ANODIZED
  );
  const screws: THREE.BufferGeometry[] = [rail];
  for (const sx of [-4.1, -0.4, 3.6, 7.8]) {
    screws.push(
      createBeveledCylinder(0.18, 0.18, 0.16, 0.02, 14, BM4_STAINLESS).translate(
        sx,
        3.06,
        0
      )
    );
  }
  return sanitizeBenelliMesh(
    applyBenelliRailSightUVs(mergeParts(screws)),
    true
  );
}

/**
 * F-03: Protective-Wing Ghost-Ring Front Sight Post (`assembledPos: [51.6, 2.55, 0]`).
 */
export function buildBenelliM4FrontSightGeometry(): THREE.BufferGeometry {
  const baseShape = new THREE.Shape();
  baseShape.moveTo(-1.15, -0.15);
  baseShape.lineTo(1.05, -0.15);
  baseShape.lineTo(0.55, 1.15);
  baseShape.lineTo(-0.65, 1.15);
  baseShape.closePath();

  const towerBase = extrudeAlongZ(
    baseShape,
    0,
    0.92,
    BM4_PARKERIZED_STEEL,
    0.04,
    6
  );
  // Slanted protective left & right steel ears guarding the tritium post
  const wingL = createChamferedBox(0.95, 0.82, 0.16, 0.025, BM4_PARKERIZED_STEEL)
    .rotateX(0.18)
    .translate(-0.08, 1.42, -0.42);
  const wingR = createChamferedBox(0.95, 0.82, 0.16, 0.025, BM4_PARKERIZED_STEEL)
    .rotateX(-0.18)
    .translate(-0.08, 1.42, 0.42);
  const sightPost = createChamferedBox(0.22, 0.68, 0.18, 0.02, BM4_DARK_STEEL);
  sightPost.translate(-0.06, 1.38, 0);
  const tritiumDot = createBeveledCylinder(
    0.075,
    0.075,
    0.08,
    0.01,
    14,
    BM4_TRITIUM_WHITE
  )
    .rotateZ(Math.PI / 2)
    .translate(-0.16, 1.56, 0);
  const hexNut = createBeveledCylinder(
    0.16,
    0.16,
    0.22,
    0.02,
    6,
    BM4_STAINLESS
  ).translate(-0.06, 0.92, 0);

  return sanitizeBenelliMesh(
    applyBenelliRailSightUVs(
      mergeParts([towerBase, wingL, wingR, sightPost, tritiumDot, hexNut])
    ),
    true
  );
}

/**
 * F-04: LPA Winged Adjustable Ghost-Ring Aperture Rear Sight (`assembledPos: [-7.8, 2.82, 0]`).
 */
export function buildBenelliM4RearSightGeometry(): THREE.BufferGeometry {
  const saddle = createChamferedBox(
    3.1,
    0.58,
    2.18,
    0.05,
    BM4_RECEIVER_ANODIZED
  );
  saddle.translate(0, 0.24, 0);

  // Heavy protective LPA combat wings (`Z = ±0.88`)
  const wingL = createChamferedBox(
    1.95,
    1.15,
    0.24,
    0.035,
    BM4_RECEIVER_ANODIZED
  );
  wingL.translate(-0.15, 0.98, -0.86);
  const wingR = createChamferedBox(
    1.95,
    1.15,
    0.24,
    0.035,
    BM4_RECEIVER_ANODIZED
  );
  wingR.translate(-0.15, 0.98, 0.86);

  // Hollow Ghost-Ring peep aperture ring centered at local Y = +1.13 (`world Y = +3.95`, aligned w/ front dot!)
  const ghostRing = revolveClosedX(
    [
      [0.24, -0.28],
      [0.42, -0.28],
      [0.42, 0.12],
      [0.24, 0.12],
      [0.24, -0.28],
    ],
    24,
    BM4_DARK_STEEL
  );
  ghostRing.translate(-0.1, 1.13, 0);
  const peepStem = createChamferedBox(0.36, 0.56, 0.42, 0.03, BM4_DARK_STEEL);
  peepStem.translate(-0.1, 0.64, 0);

  // Windage adjustment drum & twin tritium rear dots
  const windageDrum = createBeveledCylinder(
    0.28,
    0.28,
    2.48,
    0.03,
    18,
    BM4_STAINLESS
  )
    .rotateX(Math.PI / 2)
    .translate(0.45, 0.42, 0);
  const dotL = createBeveledCylinder(
    0.055,
    0.055,
    0.06,
    0.01,
    12,
    BM4_TRITIUM_WHITE
  )
    .rotateZ(Math.PI / 2)
    .translate(-0.3, 1.13, -0.33);
  const dotR = createBeveledCylinder(
    0.055,
    0.055,
    0.06,
    0.01,
    12,
    BM4_TRITIUM_WHITE
  )
    .rotateZ(Math.PI / 2)
    .translate(-0.3, 1.13, 0.33);

  return sanitizeBenelliMesh(
    applyBenelliRailSightUVs(
      mergeParts([
        saddle,
        wingL,
        wingR,
        ghostRing,
        peepStem,
        windageDrum,
        dotL,
        dotR,
      ])
    ),
    true
  );
}

/**
 * F-05: 2-Piece Glass-Reinforced Ribbed Tactical Polymer Handguard / Forend
 * (`assembledPos: [21.5, -0.35, 0]`, `isShell: true`).
 * Spans local `X ∈ [-11.2, +11.2]` (`world X ∈ [+10.3, +32.7]`), shielding the twin ARGO cylinders!
 */
export function buildBenelliM4ForendGeometry(): THREE.BufferGeometry {
  // Ergonomic U-trough cross-section drawn in (Z, Y) extruded along +X
  const outerShape = new THREE.Shape();
  outerShape.moveTo(-1.72, 1.68);
  outerShape.lineTo(-2.22, 0.42);
  outerShape.quadraticCurveTo(-2.28, -1.85, -1.35, -2.48);
  outerShape.lineTo(1.35, -2.48);
  outerShape.quadraticCurveTo(2.28, -1.85, 2.22, 0.42);
  outerShape.lineTo(1.72, 1.68);
  outerShape.lineTo(1.28, 1.68);
  outerShape.lineTo(1.78, 0.38);
  outerShape.quadraticCurveTo(1.82, -1.45, 1.05, -2.02);
  outerShape.lineTo(-1.05, -2.02);
  outerShape.quadraticCurveTo(-1.82, -1.45, -1.78, 0.38);
  outerShape.lineTo(-1.28, 1.68);
  outerShape.closePath();

  const rawForend = extrudeAlongX(
    outerShape,
    -11.2,
    22.4,
    BM4_POLYMER_BLACK,
    0.06,
    8
  );

  // Carve underside ARGO gas-vent louvers & 2-piece longitudinal seam groove
  const ventCutters: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const vx = -7.5 + i * 2.85;
    ventCutters.push(
      new THREE.BoxGeometry(1.55, 0.65, 0.62).translate(vx, -2.25, -1.15),
      new THREE.BoxGeometry(1.55, 0.65, 0.62).translate(vx, -2.25, 1.15)
    );
  }
  const hollowedForend = csgSubtract(rawForend, [
    mergeCutters(ventCutters, BM4_INNER_DARK),
  ]);

  // Wrap-around tactile anti-slip polymer gripping ribs along both flanks
  const parts: THREE.BufferGeometry[] = [hollowedForend];
  for (let r = 0; r < 11; r++) {
    const rx = -9.2 + r * 1.84;
    parts.push(
      createChamferedBox(0.36, 2.35, 0.14, 0.025, BM4_POLYMER_GRIP).translate(
        rx,
        -0.38,
        -2.22
      ),
      createChamferedBox(0.36, 2.35, 0.14, 0.025, BM4_POLYMER_GRIP).translate(
        rx,
        -0.38,
        2.22
      )
    );
  }

  return sanitizeBenelliMesh(
    applyBenelliFurnitureUVs(mergeParts(parts), 'forend'),
    true
  );
}

/**
 * F-06: Notched 3-Position Steel Receiver Extension / Recoil Tube + Ergonomic M1014 Pistol Grip
 * (`assembledPos: [-10.4, 0.35, 0]`, `isShell: true`).
 * Encloses angled `benellim4_recoil_spring` and carries the rubberized combat pistol grip!
 */
export function buildBenelliM4RecoilTubeGeometry(): THREE.BufferGeometry {
  // 1. Hollow steel 3-position notched recoil tube angled at BENELLIM4_STOCK_ANGLE (0.244 rad)
  const tubeHollow = revolveClosedX(
    [
      [0.78, -22.2],
      [1.36, -22.2], // Rear threaded cap shoulder
      [1.36, -18.5],
      [1.22, -18.35], // Position-3 collapsed notch
      [1.22, -17.45],
      [1.36, -17.3],
      [1.36, -11.8],
      [1.22, -11.65], // Position-2 body-armor notch
      [1.22, -10.75],
      [1.36, -10.6],
      [1.36, -4.8],
      [1.22, -4.65], // Position-1 extended notch
      [1.22, -3.75],
      [1.38, -3.6],
      [1.38, 0.45], // Receiver thread boss
      [0.78, 0.45], // Inner recoil-spring bore (`r = 0.78 > coilRadius 0.56 + wire 0.075`)
      [0.78, -22.2],
    ],
    28,
    BM4_DARK_STEEL
  );
  tubeHollow.rotateZ(BENELLIM4_STOCK_ANGLE);

  const rearEndPlug = createBeveledCylinder(
    1.34,
    1.34,
    0.85,
    0.06,
    24,
    BM4_STAINLESS
  )
    .rotateZ(Math.PI / 2 + BENELLIM4_STOCK_ANGLE)
    .translate(
      -22.35 * Math.cos(BENELLIM4_STOCK_ANGLE),
      -22.35 * Math.sin(BENELLIM4_STOCK_ANGLE),
      0
    );

  // 2. Swept ergonomic rubberized M1014 pistol grip threaded around the front of the recoil tube
  const gripShape = new THREE.Shape();
  gripShape.moveTo(0.25, -1.65);
  gripShape.lineTo(-2.45, -1.95);
  gripShape.quadraticCurveTo(-3.65, -5.2, -5.25, -11.2);
  gripShape.lineTo(-1.85, -11.65);
  gripShape.quadraticCurveTo(-0.65, -6.8, 0.35, -2.85);
  gripShape.closePath();

  const gripCore = extrudeAlongZ(
    gripShape,
    0,
    2.96,
    BM4_POLYMER_GRIP,
    0.16,
    10
  );
  const gripPommel = createChamferedBox(
    3.68,
    0.68,
    3.24,
    0.08,
    BM4_POLYMER_BLACK
  )
    .rotateZ(0.14)
    .translate(-3.55, -11.48, 0);

  return sanitizeBenelliMesh(
    applyBenelliFurnitureUVs(
      mergeParts([tubeHollow, rearEndPlug, gripCore, gripPommel]),
      'grip_tube'
    ),
    true
  );
}

/**
 * F-07: U.S. M1014 Skeletonized Collapsible Buttstock w/ Comb Cheekpiece & Rubber Recoil Pad
 * (`assembledPos: [-27.6, -3.95, 0]`).
 * Rear buttpad sits at local `X = -7.50` -> `world X = -35.10` (`88.6 cm` total OAL!).
 */
export function buildBenelliM4TelestockGeometry(): THREE.BufferGeometry {
  // Sliding collar clamping around the angled recoil tube
  const slideCollar = revolveClosedX(
    [
      [1.4, -5.2],
      [1.82, -5.2],
      [1.82, 6.8],
      [1.4, 6.8],
      [1.4, -5.2],
    ],
    24,
    BM4_POLYMER_BLACK
  );
  slideCollar.rotateZ(BENELLIM4_STOCK_ANGLE);
  slideCollar.translate(0.8, 0.2, 0);

  // Molded elastomer elevated comb cheekpiece saddle
  const cheekShape = new THREE.Shape();
  cheekShape.moveTo(-4.8, 0.95);
  cheekShape.lineTo(5.6, 3.25);
  cheekShape.quadraticCurveTo(6.4, 4.85, 4.8, 5.15);
  cheekShape.lineTo(-4.9, 2.95);
  cheekShape.quadraticCurveTo(-5.6, 1.95, -4.8, 0.95);
  cheekShape.closePath();
  const cheekRiser = extrudeAlongZ(
    cheekShape,
    0,
    3.48,
    BM4_POLYMER_GRIP,
    0.14,
    8
  );

  // Skeletonized triangular lower stock frame + sling loop bar
  const lowerStrut = createChamferedBox(
    10.2,
    1.15,
    1.62,
    0.08,
    BM4_POLYMER_BLACK
  )
    .rotateZ(0.46)
    .translate(-1.95, -4.65, 0);
  const rearButtColumn = createChamferedBox(
    1.55,
    10.4,
    2.85,
    0.1,
    BM4_POLYMER_BLACK
  );
  rearButtColumn.translate(-6.05, -2.65, 0);

  // Spring-loaded right-thumb telescope release button
  const releaseBtn = createBeveledCylinder(
    0.46,
    0.46,
    0.55,
    0.04,
    18,
    BM4_DARK_STEEL
  )
    .rotateX(Math.PI / 2)
    .translate(4.6, 0.25, 1.78);

  // Thick contoured vulcanized black rubber recoil buttpad (`local X ∈ [-7.50, -6.45]`)
  const rubberPad = createChamferedBox(1.18, 10.85, 3.28, 0.14, BM4_RUBBER_PAD);
  rubberPad.translate(-6.91, -2.68, 0);

  return sanitizeBenelliMesh(
    applyBenelliFurnitureUVs(
      mergeParts([
        slideCollar,
        cheekRiser,
        lowerStrut,
        rearButtColumn,
        releaseBtn,
        rubberPad,
      ]),
      'telestock'
    ),
    true
  );
}

// ============================================================================
// 2. 'fire_control' GROUP — REMOVABLE TRIGGER PACK & SHELL RELEASE (5 PARTS)
// ============================================================================

/**
 * FC-01: Removable Alloy Trigger Guard Chassis + Retention Pin (`assembledPos: [-6.1, -2.15, 0]`).
 */
export function buildBenelliM4TriggerHousingGeometry(): THREE.BufferGeometry {
  const upperDeck = createChamferedBox(
    7.6,
    1.15,
    1.68,
    0.05,
    BM4_RECEIVER_ANODIZED
  );
  upperDeck.translate(0.1, 0.38, 0);
  const cavityCut = paintGeometry(
    new THREE.BoxGeometry(6.2, 0.95, 1.06).translate(0.1, 0.52, 0),
    BM4_INNER_DARK
  );
  const milledDeck = csgSubtract(upperDeck, [cavityCut]);

  // Oversized winter combat trigger guard loop
  const bowShape = new THREE.Shape();
  bowShape.moveTo(-2.85, -0.1);
  bowShape.lineTo(-2.35, -2.65);
  bowShape.quadraticCurveTo(-0.35, -3.15, 1.95, -2.45);
  bowShape.lineTo(2.65, -0.1);
  bowShape.lineTo(2.05, -0.1);
  bowShape.lineTo(1.52, -1.95);
  bowShape.quadraticCurveTo(-0.35, -2.52, -1.85, -2.08);
  bowShape.lineTo(-2.22, -0.1);
  bowShape.closePath();

  const triggerBow = extrudeAlongZ(
    bowShape,
    0,
    1.18,
    BM4_RECEIVER_ANODIZED,
    0.04,
    10
  );
  const retentionPin = createBeveledCylinder(
    0.22,
    0.22,
    3.68,
    0.03,
    16,
    BM4_DARK_STEEL
  )
    .rotateX(Math.PI / 2)
    .translate(-2.85, 0.42, 0);
  const shellStopLatch = createChamferedBox(
    3.8,
    0.28,
    0.16,
    0.02,
    BM4_STAINLESS
  );
  shellStopLatch.translate(3.15, 0.56, 0.88);

  return sanitizeBenelliMesh(
    applyBenelliReceiverUVs(
      mergeParts([milledDeck, triggerBow, retentionPin, shellStopLatch])
    ),
    true
  );
}

/**
 * FC-02: Curved Combat Trigger + Semi-Auto Disconnector (`assembledPos: [-6.2, -2.65, 0]`).
 */
export function buildBenelliM4TriggerGeometry(): THREE.BufferGeometry {
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.38, 0.65);
  bladeShape.lineTo(0.56, 0.65);
  bladeShape.quadraticCurveTo(0.18, -0.55, 0.48, -1.68);
  bladeShape.quadraticCurveTo(0.42, -1.98, 0.08, -1.96);
  bladeShape.quadraticCurveTo(-0.42, -0.88, -0.38, 0.65);
  bladeShape.closePath();

  const blade = extrudeAlongZ(bladeShape, 0, 0.54, BM4_DARK_STEEL, 0.03, 10);
  const searBar = createChamferedBox(1.85, 0.36, 0.58, 0.025, BM4_DARK_STEEL);
  searBar.translate(0.32, 0.68, 0);
  const disconnector = createChamferedBox(
    1.35,
    0.42,
    0.26,
    0.02,
    BM4_STAINLESS
  );
  disconnector.translate(-0.18, 0.94, 0);
  const pivotPin = createBeveledCylinder(
    0.11,
    0.11,
    1.28,
    0.015,
    14,
    BM4_HARD_CHROME
  )
    .rotateX(Math.PI / 2)
    .translate(0.05, 0.62, 0);

  return sanitizeBenelliMesh(
    mergeParts([blade, searBar, disconnector, pivotPin])
  );
}

/**
 * FC-03: Forged Internal Rotating Hammer (`assembledPos: [-5.15, -1.55, 0]`).
 * Cocked rearward at `rz = 0`; rotates forward (`rz = -1.12 rad`) to strike `benellim4_firing_pin`.
 */
export function buildBenelliM4HammerGeometry(): THREE.BufferGeometry {
  const hammerShape = new THREE.Shape();
  hammerShape.moveTo(-0.35, -0.28);
  hammerShape.lineTo(0.38, -0.28);
  hammerShape.lineTo(0.22, 0.55);
  hammerShape.lineTo(-1.55, 1.48);
  hammerShape.lineTo(-1.88, 1.92);
  hammerShape.lineTo(-2.22, 1.52);
  hammerShape.lineTo(-0.62, 0.25);
  hammerShape.closePath();

  const body = extrudeAlongZ(hammerShape, 0, 0.58, BM4_STAINLESS, 0.035, 8);
  const pivotAxle = createBeveledCylinder(
    0.14,
    0.14,
    1.32,
    0.02,
    16,
    BM4_HARD_CHROME
  ).rotateX(Math.PI / 2);

  return sanitizeBenelliMesh(mergeParts([body, pivotAxle]));
}

/**
 * FC-04: Helical Hammer Plunger Spring (`assembledPos: [-8.95, -2.05, 0]`).
 * Pure X-axis `createHelicalSpring` (`start: 0.0` rear housing -> `end: 3.15` hammer strut)
 * with valid `aSpringParam`!
 */
export function buildBenelliM4HammerSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 3.15,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.24,
      wireRadius: 0.042,
      coils: 13,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    BM4_SPRING_STEEL
  );
  const strutPlunger = revolveClosedX(
    [
      [0.0, 2.85],
      [0.14, 2.85],
      [0.27, 3.08],
      [0.27, 3.28],
      [0.16, 3.55],
      [0.0, 3.55],
    ],
    16,
    BM4_STAINLESS
  );
  return sanitizeBenelliMesh(mergeParts([spring, strutPlunger]));
}

/**
 * FC-05: Cross-Bolt Trigger-Guard Safety Button + Cartridge Drop Lever
 * (`assembledPos: [-8.35, -3.15, 0]`).
 */
export function buildBenelliM4SafetyButtonGeometry(): THREE.BufferGeometry {
  const crossShaft = createBeveledCylinder(
    0.26,
    0.26,
    1.48,
    0.02,
    18,
    BM4_DARK_STEEL
  ).rotateX(Math.PI / 2);
  // Iconic crimson-red Benelli fire indicator ring on left side
  const redFireBand = createBeveledCylinder(
    0.28,
    0.28,
    0.22,
    0.015,
    18,
    BM4_SAFETY_CRIMSON
  )
    .rotateX(Math.PI / 2)
    .translate(0, 0, -0.58);
  // Enlarged oversized tactical triangular safety head on right side (+Z)
  const triPad = createChamferedBox(0.66, 0.62, 0.24, 0.04, BM4_DARK_STEEL);
  triPad.translate(0, 0.04, 0.78);

  // Front-right red-dot cartridge drop tab (`shell release lever`)
  const dropTab = createChamferedBox(0.92, 0.44, 0.22, 0.03, BM4_STAINLESS);
  dropTab.translate(5.25, 0.62, 0.68);
  const redDot = createBeveledCylinder(
    0.09,
    0.09,
    0.08,
    0.01,
    12,
    BM4_SAFETY_CRIMSON
  )
    .rotateX(Math.PI / 2)
    .translate(5.42, 0.62, 0.79);

  return sanitizeBenelliMesh(
    mergeParts([crossShaft, redFireBand, triPad, dropTab, redDot])
  );
}

// ============================================================================
// 3. 'magazine' GROUP — 7-RD UNDERBARREL TUBE MAG & SHELL ELEVATOR (5 PARTS)
// ============================================================================

/**
 * M-01: Full-Length 18.5" Steel Underbarrel 7-Shell Tubular Magazine w/ Front Sling Mount
 * (`assembledPos: [30.9, -1.25, 0]`, `isShell: true`).
 * Spans local `X ∈ [-20.9, +20.7]` (`world X ∈ [+10.0, +51.6]`).
 */
export function buildBenelliM4MagTubeGeometry(): THREE.BufferGeometry {
  const tube = revolveClosedX(
    [
      [1.05, -20.9],
      [1.24, -20.9], // Receiver thread spigot
      [1.27, -20.2],
      [1.27, 19.35], // Full-length 7-round steel tubular magazine wall
      [1.22, 19.45],
      [1.22, 20.7], // Front cap threads & ratchet detent ring
      [1.05, 20.7], // Polished interior bore (`r = 1.05 > follower r 1.02`)
      [1.05, -20.9],
    ],
    28,
    BM4_PARKERIZED_STEEL
  );

  // Front reversible side-sling mount plate clamped ahead of barrel guide ring (`local X = +19.1`)
  const slingCollar = revolveClosedX(
    [
      [1.27, 18.85],
      [1.48, 18.85],
      [1.48, 19.35],
      [1.27, 19.35],
      [1.27, 18.85],
    ],
    24,
    BM4_DARK_STEEL
  );
  const slingEar = createChamferedBox(0.38, 1.35, 0.92, 0.04, BM4_DARK_STEEL);
  slingEar.translate(19.1, 0, -1.68);
  const brassDetentPin = createBeveledCylinder(
    0.09,
    0.09,
    0.26,
    0.015,
    12,
    BM4_BRASS_ACCENT
  )
    .rotateZ(Math.PI / 2)
    .translate(19.45, 1.18, 0);

  return sanitizeBenelliMesh(
    applyBenelliParkerizedUVs(
      mergeParts([tube, slingCollar, slingEar, brassDetentPin])
    ),
    true
  );
}

/**
 * M-02: Knurled Ratcheting Magazine Tube End-Cap (`assembledPos: [52.35, -1.25, 0]`).
 */
export function buildBenelliM4MagCapGeometry(): THREE.BufferGeometry {
  const cap = revolveClosedX(
    [
      [1.23, -1.05],
      [1.44, -1.05], // Rear ratchet face
      [1.46, -0.96],
      [1.46, 0.78], // Heavy diamond-knurled outer cylinder
      [1.36, 0.98],
      [0.92, 1.05], // Crown face
      [0.86, 0.88],
      [0.0, 0.88], // Front center recess
      [0.0, -0.35], // Internal thread socket floor
      [1.23, -0.35],
      [1.23, -1.05],
    ],
    28,
    BM4_PARKERIZED_STEEL
  );

  const parts: THREE.BufferGeometry[] = [cap];
  for (let k = 0; k < 12; k++) {
    const ang = (k * Math.PI) / 6;
    const flute = createChamferedBox(
      1.42,
      0.08,
      0.08,
      0.015,
      BM4_RECEIVER_CHAMFER
    );
    flute.translate(-0.08, Math.cos(ang) * 1.45, Math.sin(ang) * 1.45);
    parts.push(flute);
  }
  return sanitizeBenelliMesh(
    applyBenelliParkerizedUVs(mergeParts(parts)),
    true
  );
}

/**
 * M-03: Long Horizontal X-Axis Helical Tubular Magazine Spring (`assembledPos: [51.1, -1.25, 0]`).
 * Anchored at front cap (`end: 0.0`) extending rearward (`start: -30.6`) to `benellim4_mag_follower`,
 * with valid X-axis `aSpringParam`!
 */
export function buildBenelliM4MagSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -30.6,
      end: 0.0,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.84,
      wireRadius: 0.068,
      coils: 26,
      radialSegments: 9,
      tubularSegmentsPerCoil: 16,
    }),
    BM4_SPRING_STEEL
  );
  const retainerPlug = revolveClosedX(
    [
      [0.32, -0.35],
      [0.98, -0.35],
      [0.98, 0.12],
      [0.32, 0.12],
      [0.32, -0.35],
    ],
    20,
    BM4_DARK_STEEL
  );
  return sanitizeBenelliMesh(mergeParts([spring, retainerPlug]));
}

/**
 * M-04: High-Visibility Orange/Anodized Red Fluted Cup Follower (`assembledPos: [19.6, -1.25, 0]`).
 * Slides along `+X/-X` inside `benellim4_mag_tube`!
 */
export function buildBenelliM4MagFollowerGeometry(): THREE.BufferGeometry {
  const cup = revolveClosedX(
    [
      [0.0, -1.12], // Tactile dimple center on rear/front shell-nose face
      [0.45, -1.02],
      [0.96, -1.15], // Chamfered nose rim contacting 12ga shell base
      [1.02, -1.06],
      [1.02, 0.72], // Anodized aluminum outer skirt
      [0.86, 0.82],
      [0.86, 1.15], // Stepped spring-centering tail boss
      [0.64, 1.15],
      [0.64, -0.68], // Hollow interior spring cup
      [0.0, -0.68],
      [0.0, -1.12],
    ],
    24,
    BM4_FOLLOWER_RED
  );

  // 6 anti-grit longitudinal relief ribs
  const parts: THREE.BufferGeometry[] = [cup];
  for (let i = 0; i < 6; i++) {
    const ang = (i * Math.PI) / 3;
    const rib = createChamferedBox(1.55, 0.07, 0.07, 0.015, BM4_FOLLOWER_RED);
    rib.translate(-0.18, Math.cos(ang) * 1.01, Math.sin(ang) * 1.01);
    parts.push(rib);
  }
  return sanitizeBenelliMesh(mergeParts(parts));
}

/**
 * M-05: Pivoting Stamped Stainless Shell Carrier / Elevator Tongue (`assembledPos: [-3.65, -1.68, 0]`).
 * Pivots around local `[0, 0, 0]` (`rz: 0 -> +0.34 rad`), raising its front forked spoon (`X = +8.85`)
 * upward to lift a `12-gauge` shell from magazine level (`Y = -1.25`) into chamber line (`Y = +1.35`)!
 */
export function buildBenelliM4ShellElevatorGeometry(): THREE.BufferGeometry {
  // Stamped U-channel stainless spoon extending forward (+X: 0 -> +8.85) from rear pivot trunnions
  const uProfile = new THREE.Shape();
  uProfile.moveTo(-0.84, 0.36);
  uProfile.lineTo(-0.84, -0.14);
  uProfile.quadraticCurveTo(0, -0.34, 0.84, -0.14);
  uProfile.lineTo(0.84, 0.36);
  uProfile.lineTo(0.68, 0.36);
  uProfile.lineTo(0.68, -0.04);
  uProfile.quadraticCurveTo(0, -0.2, -0.68, -0.04);
  uProfile.lineTo(-0.68, 0.36);
  uProfile.closePath();

  const mainSpoon = extrudeAlongX(uProfile, 0.25, 6.85, BM4_STAINLESS, 0.02, 8);

  // Iconic Benelli forked front carrier prongs (`Z = ±0.62`, leaving anti-pinch thumb gap in middle!)
  const prongL = createChamferedBox(1.95, 0.22, 0.38, 0.025, BM4_HARD_CHROME);
  prongL.translate(7.92, -0.04, -0.58);
  const prongR = createChamferedBox(1.95, 0.22, 0.38, 0.025, BM4_HARD_CHROME);
  prongR.translate(7.92, -0.04, 0.58);

  // Rear pivot ears & carrier dog latch
  const earL = createChamferedBox(0.95, 0.72, 0.16, 0.025, BM4_STAINLESS);
  earL.translate(0.12, 0.22, -0.76);
  const earR = createChamferedBox(0.95, 0.72, 0.16, 0.025, BM4_STAINLESS);
  earR.translate(0.12, 0.22, 0.76);
  const carrierDog = createChamferedBox(0.76, 0.92, 0.22, 0.025, BM4_DARK_STEEL);
  carrierDog.translate(-0.18, 0.56, 0.88);
  const pivotAxle = createBeveledCylinder(
    0.12,
    0.12,
    1.76,
    0.02,
    14,
    BM4_HARD_CHROME
  ).rotateX(Math.PI / 2);

  return sanitizeBenelliMesh(
    mergeParts([mainSpoon, prongL, prongR, earL, earR, carrierDog, pivotAxle])
  );
}
