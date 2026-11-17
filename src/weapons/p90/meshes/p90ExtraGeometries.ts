import * as THREE from 'three';
import {
  createHelicalSpring,
  createRectangularMagSpring,
  csgSubtract,
  csgUnion,
  finalizeGeometry,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import { extrudeAlongX, latheAlongX, mergeCutters } from './p90CadDetail';

const P90_DARK_STEEL = '#444e5d';
const P90_CHAMFER_STEEL = '#596678';
const P90_INNER_DARK = '#252b35';
const P90_STAINLESS = '#cbd5e1';
const P90_CHROME = '#e2e8f0';
const P90_POLYMER_BLACK = '#2f3540';
const P90_POLYMER_PACK = '#4c544b';
const P90_HAMMER_RED_POLY = '#b45309';
const P90_BUFFER_AMBER = '#9a3412';
const P90_SPRING_STEEL = '#94a3b8';
const P90_MAG_SMOKED = '#6b5742';
const P90_MAG_DARK_RIB = '#473b2f';
const P90_BRASS_GLINT = '#d4a72c';
const P90_COPPER_TIP = '#b8501c';
const P90_FOLLOWER_ORANGE = '#ea580c';

// ============================================================================
// 1. STRAIGHT-BLOWBACK BOLT, FIRING PIN & DUAL RECOIL SYSTEM ('slide' U-06..U-09)
// ============================================================================

/**
 * U-06: Heavy Straight-Blowback Breech Bolt Assembly (assembledPos: [-5.15, 0.72, 0])
 * Local X ∈ [-2.60, +2.60] -> World X ∈ [-7.75, -2.55] (mates flush w/ barrel breech at -2.55).
 * Features:
 *  - High-mass alloy steel inertial block calibrated for 5.7×28mm blowback timing
 *  - Recessed Ø8.0mm bolt face w/ right-hand spring extractor claw & left fixed-ejector slot
 *  - Upper feed-horn stripping lug that pushes rotated rounds out of the 90° helical ramp
 *  - Twin through-bores at Z = ±0.52, Y = +0.52 (world Y = 1.24) for parallel guide rods
 *  - Bottom hammer-strike ramp & vertical downward case-ejection clearance relief
 */
export function buildP90BoltGeometry(): THREE.BufferGeometry {
  const mainBlock = paintGeometry(
    new THREE.BoxGeometry(5.2, 1.56, 1.58).translate(0, 0.08, 0),
    P90_DARK_STEEL
  );
  const topFeedHorn = paintGeometry(
    new THREE.BoxGeometry(1.85, 0.34, 0.42).translate(1.62, 0.94, 0),
    P90_CHAMFER_STEEL
  );
  const sideRailsL = paintGeometry(
    new THREE.BoxGeometry(4.85, 0.28, 0.14).translate(-0.1, 0.18, -0.82),
    P90_CHAMFER_STEEL
  );
  const sideRailsR = paintGeometry(
    new THREE.BoxGeometry(4.85, 0.28, 0.14).translate(-0.1, 0.18, 0.82),
    P90_CHAMFER_STEEL
  );
  const rawBolt = csgUnion([mainBlock, topFeedHorn, sideRailsL, sideRailsR]);

  // Group non-overlapping cutters into 2 composite brushes (7+ passes -> 2 passes):
  //  G1: chamfered Ø5.7×28mm breech cup + twin guide-rod bores + dual CNC side lightening pockets
  //  G2: firing-pin bore + bottom downward ejection chute + right stepped extractor seat + left ejector bore
  const cutGroupA = mergeCutters(
    [
      new THREE.CylinderGeometry(0.265, 0.305, 0.24, 28)
        .rotateZ(Math.PI / 2)
        .translate(2.52, 0.13, 0),
      new THREE.CylinderGeometry(0.15, 0.15, 5.6, 16)
        .rotateZ(Math.PI / 2)
        .translate(0, 0.52, -0.52),
      new THREE.CylinderGeometry(0.15, 0.15, 5.6, 16)
        .rotateZ(Math.PI / 2)
        .translate(0, 0.52, 0.52),
      new THREE.BoxGeometry(2.6, 0.44, 0.22).translate(-0.55, -0.14, -0.76),
      new THREE.BoxGeometry(2.6, 0.44, 0.22).translate(-0.55, -0.14, 0.76),
    ],
    P90_INNER_DARK
  );
  const cutGroupB = mergeCutters(
    [
      new THREE.CylinderGeometry(0.075, 0.075, 5.6, 14)
        .rotateZ(Math.PI / 2)
        .translate(0, 0.13, 0),
      new THREE.BoxGeometry(3.4, 0.56, 0.68).translate(0.95, -0.52, 0),
      // Milled right-hand (+Z) claw extractor pocket & spring recess
      new THREE.BoxGeometry(1.48, 0.26, 0.22).translate(1.9, 0.13, 0.36),
      // Counterbored left-side (-Z) spring-plunger ejector hole on bolt face
      new THREE.CylinderGeometry(0.062, 0.062, 0.55, 14)
        .rotateZ(Math.PI / 2)
        .translate(2.38, 0.13, -0.165),
    ],
    P90_INNER_DARK
  );

  const machinedBolt = csgSubtract(rawBolt, [cutGroupA, cutGroupB]);

  // Profiled hardened-steel right-side claw extractor w/ undercut rim hook, vertical pivot pin & buffer spring
  const clawShape = new THREE.Shape();
  clawShape.moveTo(1.24, -0.1);
  clawShape.lineTo(2.48, -0.1);
  clawShape.lineTo(2.58, -0.04);
  clawShape.lineTo(2.58, 0.06);
  clawShape.lineTo(2.48, 0.1);
  clawShape.lineTo(1.24, 0.1);
  clawShape.closePath();
  const extractorClaw = new THREE.ExtrudeGeometry(clawShape, {
    depth: 0.14,
    bevelEnabled: false,
  });
  extractorClaw.translate(0, 0.13, 0.27);
  paintGeometry(extractorClaw, P90_STAINLESS);
  const extractorHook = paintGeometry(
    new THREE.BoxGeometry(0.11, 0.18, 0.14).translate(2.53, 0.13, 0.255),
    P90_CHROME
  );
  const extractorPivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.52, 12).translate(
      1.96,
      0.13,
      0.35
    ),
    P90_CHROME
  );
  const extractorSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 1.24,
      end: 1.68,
      centerY: 0.13,
      centerZ: 0.41,
      coilRadius: 0.055,
      wireRadius: 0.014,
      coils: 5,
      radialSegments: 6,
      tubularSegmentsPerCoil: 10,
    }),
    P90_SPRING_STEEL
  );

  // Spring-loaded left-side plunger ejector + stainless firing-pin bushing collar on bolt face
  const ejectorPlunger = latheAlongX(
    [
      [0.015, 2.34],
      [0.052, 2.34],
      [0.052, 2.55],
      [0.038, 2.585],
      [0.015, 2.585],
      [0.015, 2.34],
    ],
    16,
    P90_CHROME
  );
  ejectorPlunger.translate(0, 0.13, -0.165);

  const pinBushing = latheAlongX(
    [
      [0.075, 2.41],
      [0.115, 2.41],
      [0.115, 2.435],
      [0.075, 2.435],
      [0.075, 2.41],
    ],
    20,
    P90_STAINLESS
  );
  pinBushing.translate(0, 0.13, 0);

  // Polished feed-horn stripping ramp + charging-handle cross-lug + rear hammer-strike anvil pad
  const feedHornTip = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.18, 0.4)
      .rotateZ(-0.22)
      .translate(2.43, 0.99, 0),
    P90_CHROME
  );
  const chargingEngageLug = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.32, 1.72).translate(2.15, 0.72, 0),
    P90_CHAMFER_STEEL
  );
  const hammerAnvil = paintGeometry(
    new THREE.BoxGeometry(0.18, 0.56, 0.52).translate(-2.5, -0.12, 0),
    P90_STAINLESS
  );

  return mergeParts([
    machinedBolt,
    extractorClaw,
    extractorHook,
    extractorPivotPin,
    extractorSpring,
    ejectorPlunger,
    pinBushing,
    feedHornTip,
    chargingEngageLug,
    hammerAnvil,
  ]);
}

/**
 * U-07: Coaxial Floating Firing Pin & Return Spring (assembledPos: [-5.25, 0.85, 0])
 */
export function buildP90FiringPinGeometry(): THREE.BufferGeometry {
  const strikerTip = paintGeometry(
    new THREE.CylinderGeometry(0.038, 0.065, 1.45, 14)
      .rotateZ(Math.PI / 2)
      .translate(1.92, 0, 0),
    P90_CHROME
  );
  const midShaft = paintGeometry(
    new THREE.CylinderGeometry(0.072, 0.072, 2.95, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.15, 0, 0),
    P90_STAINLESS
  );
  const stopCollar = paintGeometry(
    new THREE.CylinderGeometry(0.135, 0.135, 0.22, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.95, 0, 0),
    P90_CHAMFER_STEEL
  );
  const tailCap = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.78, 16)
      .rotateZ(Math.PI / 2)
      .translate(-2.02, 0, 0),
    P90_DARK_STEEL
  );
  const returnCoil = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.45,
      end: 0.82,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.105,
      wireRadius: 0.018,
      coils: 11,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    P90_SPRING_STEEL
  );

  return mergeParts([strikerTip, midShaft, stopCollar, tailCap, returnCoil]);
}

/**
 * U-08: Dual Parallel Guide Rods & Rear Elastomer Buffer Block (assembledPos: [-8.85, 1.24, 0])
 * Local X ∈ [-6.35, +6.00] -> World X ∈ [-15.20, -2.85], rods at Z = ±0.52.
 */
export function buildP90GuideRodsGeometry(): THREE.BufferGeometry {
  const rodLeft = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 11.8, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.1, 0, -0.52),
    P90_CHROME
  );
  const rodRight = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 11.8, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.1, 0, 0.52),
    P90_CHROME
  );
  const frontRetainerL = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 0.22, 16)
      .rotateZ(Math.PI / 2)
      .translate(5.88, 0, -0.52),
    P90_DARK_STEEL
  );
  const frontRetainerR = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 0.22, 16)
      .rotateZ(Math.PI / 2)
      .translate(5.88, 0, 0.52),
    P90_DARK_STEEL
  );

  // Rear synthetic elastomer bolt buffer block & steel backing plate
  const rearBufferBase = paintGeometry(
    new THREE.BoxGeometry(0.92, 1.62, 1.66).translate(-5.88, -0.38, 0),
    P90_POLYMER_BLACK
  );
  const elastomerPad = paintGeometry(
    new THREE.BoxGeometry(0.36, 1.28, 1.42).translate(-5.32, -0.36, 0),
    P90_BUFFER_AMBER
  );

  return mergeParts([
    rodLeft,
    rodRight,
    frontRetainerL,
    frontRetainerR,
    rearBufferBase,
    elastomerPad,
  ]);
}

/**
 * U-09: Dual Parallel Helical Recoil Springs (assembledPos: [-14.25, 1.24, 0])
 * Anchored at local X = 0 (rear buffer face) extending to local X = +6.60 (rear of bolt),
 * so dynamic `scaleX` compresses cleanly against the stationary rear buffer!
 */
export function buildP90RecoilSpringsGeometry(): THREE.BufferGeometry {
  const springLeft = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.06,
      end: 6.55,
      centerY: 0,
      centerZ: -0.52,
      coilRadius: 0.19,
      wireRadius: 0.032,
      coils: 22,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    P90_SPRING_STEEL
  );
  const springRight = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.06,
      end: 6.55,
      centerY: 0,
      centerZ: 0.52,
      coilRadius: 0.19,
      wireRadius: 0.032,
      coils: 22,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    P90_SPRING_STEEL
  );

  return mergeParts([springLeft, springRight]);
}

// ============================================================================
// 2. PROGRESSIVE TRIGGER, ROTARY SELECTOR & POLYMER HAMMER PACK ('fire_control')
// ============================================================================

/**
 * FC-01: Two-Stage Progressive Sliding Polymer Trigger (assembledPos: [6.65, -2.35, 0])
 */
export function buildP90TriggerGeometry(): THREE.BufferGeometry {
  const shoeShape = new THREE.Shape();
  shoeShape.moveTo(-0.55, 0.92);
  shoeShape.lineTo(0.68, 0.92);
  shoeShape.quadraticCurveTo(0.42, 0.15, 0.58, -0.78);
  shoeShape.quadraticCurveTo(0.52, -1.06, 0.18, -1.08);
  shoeShape.lineTo(-0.48, -0.96);
  shoeShape.quadraticCurveTo(-0.66, -0.35, -0.55, 0.92);
  shoeShape.closePath();

  const shoeGeo = new THREE.ExtrudeGeometry(shoeShape, {
    depth: 0.56,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 2,
  });
  shoeGeo.translate(0, 0, -0.28);
  paintGeometry(shoeGeo, P90_POLYMER_BLACK);

  // Horizontal guide carriage & serration ribs on front finger face
  const guideBlock = paintGeometry(
    new THREE.BoxGeometry(1.65, 0.52, 0.68).translate(-0.22, 0.98, 0),
    P90_DARK_STEEL
  );
  const ribs: THREE.BufferGeometry[] = [shoeGeo, guideBlock];
  for (let i = 0; i < 4; i++) {
    const ry = -0.65 + i * 0.36;
    ribs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.08, 0.1, 0.58).translate(0.54, ry, 0),
        P90_CHAMFER_STEEL
      )
    );
  }
  return mergeParts(ribs);
}

/**
 * FC-02: Ambidextrous Rotary Thumbwheel Selector Dial S / 1 / A (assembledPos: [5.95, -3.38, 0])
 */
export function buildP90SelectorGeometry(): THREE.BufferGeometry {
  const centerHub = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.46, 0.98, 24).rotateX(Math.PI / 2),
    P90_POLYMER_BLACK
  );
  const leftDial = paintGeometry(
    new THREE.CylinderGeometry(0.54, 0.54, 0.18, 24)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.54),
    P90_CHAMFER_STEEL
  );
  const rightDial = paintGeometry(
    new THREE.CylinderGeometry(0.54, 0.54, 0.18, 24)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.54),
    P90_CHAMFER_STEEL
  );
  const limiterCam = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.52, 0.44).translate(0.18, 0.34, 0),
    P90_STAINLESS
  );
  const redFireDotL = paintGeometry(
    new THREE.BoxGeometry(0.18, 0.1, 0.06).translate(0.28, 0.06, -0.64),
    '#dc2626'
  );
  const redFireDotR = paintGeometry(
    new THREE.BoxGeometry(0.18, 0.1, 0.06).translate(0.28, 0.06, 0.64),
    '#dc2626'
  );

  const parts: THREE.BufferGeometry[] = [
    centerHub,
    leftDial,
    rightDial,
    limiterCam,
    redFireDotL,
    redFireDotR,
  ];
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.09, 0.09, 1.32).translate(
          Math.cos(ang) * 0.52,
          Math.sin(ang) * 0.52,
          0
        ),
        P90_DARK_STEEL
      )
    );
  }
  return mergeParts(parts);
}

/**
 * FC-03: Twin Steel Trigger Transfer Bars Straddling Ejection Chute (assembledPos: [-3.10, -1.08, 0])
 * Local X ∈ [-9.10, +9.30] -> World X ∈ [-12.20, +6.20], bars at Z = ±0.64.
 */
export function buildP90TransferBarsGeometry(): THREE.BufferGeometry {
  const barLeft = paintGeometry(
    new THREE.BoxGeometry(18.2, 0.16, 0.09).translate(0.1, 0, -0.64),
    P90_STAINLESS
  );
  const barRight = paintGeometry(
    new THREE.BoxGeometry(18.2, 0.16, 0.09).translate(0.1, 0, 0.64),
    P90_STAINLESS
  );
  const frontYoke = paintGeometry(
    new THREE.BoxGeometry(0.45, 0.42, 1.38).translate(9.05, -0.14, 0),
    P90_DARK_STEEL
  );
  const midBridge = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.24, 1.38).translate(3.45, 0.18, 0),
    P90_DARK_STEEL
  );
  const rearSearYoke = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.36, 1.38).translate(-8.85, 0.12, 0),
    P90_CHAMFER_STEEL
  );
  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 4.1,
      end: 6.4,
      centerY: 0.18,
      centerZ: 0,
      coilRadius: 0.13,
      wireRadius: 0.022,
      coils: 10,
      radialSegments: 8,
      tubularSegmentsPerCoil: 12,
    }),
    P90_SPRING_STEEL
  );

  return mergeParts([
    barLeft,
    barRight,
    frontYoke,
    midBridge,
    rearSearYoke,
    returnSpring,
  ]);
}

/**
 * FC-04: Removable All-Polymer Modular Hammer Pack Housing (assembledPos: [-12.65, -0.68, 0])
 * Local X ∈ [-2.55, +2.55] -> World X ∈ [-15.20, -10.10], olive-gray engineering polymer cassette.
 */
export function buildP90HammerPackGeometry(): THREE.BufferGeometry {
  const outerBox = paintGeometry(
    new THREE.BoxGeometry(5.1, 1.88, 1.38),
    P90_POLYMER_PACK
  );
  const innerWell = paintGeometry(
    new THREE.BoxGeometry(4.35, 1.42, 0.94).translate(0.1, 0.32, 0),
    P90_INNER_DARK
  );
  const sideWindowL = paintGeometry(
    new THREE.BoxGeometry(1.85, 0.72, 0.32).translate(-0.35, 0.05, -0.62),
    P90_INNER_DARK
  );
  const sideWindowR = paintGeometry(
    new THREE.BoxGeometry(1.85, 0.72, 0.32).translate(-0.35, 0.05, 0.62),
    P90_INNER_DARK
  );
  const hollowedPack = csgSubtract(outerBox, [
    innerWell,
    sideWindowL,
    sideWindowR,
  ]);

  // Polymer primary sear, auto-sear release lever & stainless cross-axles
  const primarySear = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.34, 0.56).translate(-0.85, 0.38, 0),
    P90_POLYMER_BLACK
  );
  const autoSearTrip = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.96, 0.44)
      .rotateZ(-0.22)
      .translate(1.82, 0.66, 0),
    P90_HAMMER_RED_POLY
  );
  const rearPullLatch = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.68, 0.86).translate(-2.62, -0.22, 0),
    P90_POLYMER_BLACK
  );
  const pin1 = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 1.48, 14)
      .rotateX(Math.PI / 2)
      .translate(1.3, 0.25, 0),
    P90_STAINLESS
  );
  const pin2 = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 1.48, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.85, 0.15, 0),
    P90_STAINLESS
  );

  return mergeParts([
    hollowedPack,
    primarySear,
    autoSearTrip,
    rearPullLatch,
    pin1,
    pin2,
  ]);
}

/**
 * FC-05: Lightweight Polymer Rotary Hammer & Torsion Spring (assembledPos: [-11.35, -0.35, 0])
 * Pivots around local [0, 0, 0]: cocked horizontal rearward, swings +Z rad upward/forward to strike firing pin!
 */
export function buildP90HammerGeometry(): THREE.BufferGeometry {
  const hub = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.68, 20).rotateX(Math.PI / 2),
    P90_HAMMER_RED_POLY
  );
  const arm = paintGeometry(
    new THREE.BoxGeometry(1.42, 0.36, 0.48)
      .rotateZ(0.18)
      .translate(-0.62, 0.32, 0),
    P90_HAMMER_RED_POLY
  );
  const strikeHead = paintGeometry(
    new THREE.BoxGeometry(0.44, 0.56, 0.54).translate(-1.22, 0.58, 0),
    P90_DARK_STEEL
  );
  const torsionCoil = paintGeometry(
    new THREE.CylinderGeometry(0.33, 0.33, 0.22, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.38),
    P90_SPRING_STEEL
  );
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.1, 0.1, 0.96, 14).rotateX(Math.PI / 2),
    P90_CHROME
  );

  return mergeParts([hub, arm, strikeHead, torsionCoil, pivotPin]);
}

// ============================================================================
// 3. TOP-MOUNTED 50-RD HORIZONTAL MAGAZINE & 90° HELICAL RAMP ('magazine')
// ============================================================================

/**
 * M-01: 50-Round Top-Mounted Smoked Translucent Polycarbonate Magazine Body
 * (assembledPos: [-3.80, 2.66, 0], isShell: true)
 * Local X ∈ [-10.45, +10.45] -> World X ∈ [-14.25, +6.65], Y ∈ [1.94, 3.38], Z ∈ [-1.28, +1.28].
 * Includes internal visible stack of horizontal sideways 5.7×28mm cartridges on the left half
 * (Z <= 0) so even in Section-Cut (`C`), you see stacked sideways rounds waiting to enter the 90° ramp!
 */
export function buildP90MagBodyGeometry(): THREE.BufferGeometry {
  const outerBox = paintGeometry(
    new THREE.BoxGeometry(20.8, 1.4, 2.54),
    P90_MAG_SMOKED
  );
  // Non-overlapping inner cavity + rear helical-turret throat cut -> 2 clean cuts
  const innerCavity = paintGeometry(
    new THREE.BoxGeometry(20.1, 1.1, 2.18).translate(0.15, -0.02, 0),
    P90_MAG_DARK_RIB
  );
  const rearThroatCut = paintGeometry(
    new THREE.BoxGeometry(2.85, 0.72, 1.96).translate(0.35, -0.52, 0),
    P90_MAG_DARK_RIB
  );

  const shell = csgSubtract(outerBox, [innerCavity, rearThroatCut]);

  const parts: THREE.BufferGeometry[] = [shell];

  // Molded structural polycarbonate top & wrap-around flank gripping ribs
  for (let i = 0; i < 9; i++) {
    const rx = -8.6 + i * 2.15;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.22, 0.08, 2.58).translate(rx, 0.72, 0),
        P90_MAG_DARK_RIB
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.2, 1.24, 0.04).translate(rx, 0.04, -1.27),
        P90_MAG_DARK_RIB
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.2, 1.24, 0.04).translate(rx, 0.04, 1.27),
        P90_MAG_DARK_RIB
      )
    );
  }

  // Molded round-count witness index ridges (10 / 25 / 50 rounds) + internal staggered cartridge-guide roof spine
  for (const wx of [-2.4, 1.85, 6.15]) {
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.1, 0.05, 0.68).translate(wx, 0.725, -0.68),
        P90_MAG_DARK_RIB
      )
    );
  }
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(17.8, 0.14, 0.12).translate(0.4, 0.48, 0),
      P90_MAG_DARK_RIB
    ),
    // Rear ambidextrous magazine-catch locking lugs & front upper-receiver hook nose
    paintGeometry(
      new THREE.BoxGeometry(0.76, 0.24, 0.16).translate(-1.15, -0.56, -1.18),
      P90_MAG_DARK_RIB
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.76, 0.24, 0.16).translate(-1.15, -0.56, 1.18),
      P90_MAG_DARK_RIB
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.72, 0.16, 1.18).translate(9.88, -0.66, 0),
      P90_MAG_DARK_RIB
    )
  );

  // Rear circular turret boss collar above the 90° helical feed ramp (closed annular lathe -> zero CSG!)
  const turretPts = [
    new THREE.Vector2(0.92, -0.75),
    new THREE.Vector2(1.16, -0.75),
    new THREE.Vector2(1.16, -0.41),
    new THREE.Vector2(0.92, -0.41),
    new THREE.Vector2(0.92, -0.75),
  ];
  const turretRing = paintGeometry(
    new THREE.LatheGeometry(turretPts, 32).translate(0.35, 0, 0),
    P90_MAG_SMOKED
  );
  parts.push(turretRing);

  return mergeParts(parts);
}

/**
 * M-02: Signature 90° Helical Cartridge-Rotating Feed Ramp Turret
 * (assembledPos: [-3.45, 2.18, 0])
 * THE core mechanical innovation of FN P90 (`BAY-11`):
 * Sculpted spiral guide drum & twin feed lips that receive horizontal 5.7×28mm rounds
 * pointing Left (-Z) and continuously twist them 90° clockwise around +Y while dropping
 * them down (-Y) into axial (+X) alignment with the barrel breech!
 */
export function buildP90HelicalRampGeometry(): THREE.BufferGeometry {
  const drumOuter = paintGeometry(
    new THREE.CylinderGeometry(1.08, 1.02, 1.24, 32).translate(0, 0.04, 0),
    P90_POLYMER_BLACK
  );
  const lowerFeedBlock = paintGeometry(
    new THREE.BoxGeometry(2.65, 0.68, 1.48).translate(0.05, -0.44, 0),
    P90_POLYMER_BLACK
  );
  const baseBody = csgUnion([drumOuter, lowerFeedBlock]);

  const centralDropThroat = paintGeometry(
    new THREE.BoxGeometry(2.15, 1.45, 0.68).translate(0.08, 0.02, 0),
    P90_INNER_DARK
  );
  const upperEntrySlot = paintGeometry(
    new THREE.BoxGeometry(0.88, 0.68, 2.05).translate(-0.18, 0.42, 0),
    P90_INNER_DARK
  );
  const hollowedTurret = csgSubtract(baseBody, [
    centralDropThroat,
    upperEntrySlot,
  ]);

  // Sculpted 90° helical spiral guide rails (upper shoulder rails + lower case-rim guide tracks!)
  const spiralPtsA: THREE.Vector3[] = [];
  const spiralPtsB: THREE.Vector3[] = [];
  const rimPtsA: THREE.Vector3[] = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const yaw = (1 - u) * (Math.PI * 0.5); // +90° (sideways -Z) -> 0° (forward +X)
    const y = 0.54 - u * 1.06;
    const r = 0.68 - u * 0.14;
    spiralPtsA.push(
      new THREE.Vector3(Math.cos(yaw) * r, y, -Math.sin(yaw) * r)
    );
    spiralPtsB.push(
      new THREE.Vector3(-Math.cos(yaw) * r, y, Math.sin(yaw) * r)
    );
    const rRim = 0.82 - u * 0.18;
    rimPtsA.push(
      new THREE.Vector3(-Math.cos(yaw) * rRim, y - 0.08, Math.sin(yaw) * rRim)
    );
  }
  const helixRailA = paintGeometry(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(spiralPtsA),
      20,
      0.085,
      8,
      false
    ),
    P90_BRASS_GLINT
  );
  const helixRailB = paintGeometry(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(spiralPtsB),
      20,
      0.085,
      8,
      false
    ),
    P90_STAINLESS
  );
  const helixRimTrack = paintGeometry(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(rimPtsA),
      20,
      0.052,
      8,
      false
    ),
    P90_STAINLESS
  );

  // Central conical cartridge-pivot spindle guiding bullet neck vs case rim through the 90° turn
  const spindlePts = [
    new THREE.Vector2(0.03, -0.34),
    new THREE.Vector2(0.18, -0.34),
    new THREE.Vector2(0.12, 0.42),
    new THREE.Vector2(0.03, 0.46),
  ];
  const centerSpindle = paintGeometry(
    new THREE.LatheGeometry(spindlePts, 20).translate(-0.04, 0, 0),
    P90_POLYMER_BLACK
  );

  // Rolled C-hook hardened stainless lower feed lips (open central slot Z ∈ [-0.21, +0.21] for bolt feed horn!)
  const buildFeedLip = (s: 1 | -1): THREE.BufferGeometry => {
    const lip = new THREE.Shape();
    lip.moveTo(s * 0.48, -0.5);
    lip.lineTo(s * 0.48, -0.68);
    lip.quadraticCurveTo(s * 0.48, -0.77, s * 0.34, -0.775);
    lip.lineTo(s * 0.22, -0.77);
    lip.quadraticCurveTo(s * 0.2, -0.74, s * 0.22, -0.715);
    lip.lineTo(s * 0.33, -0.72);
    lip.quadraticCurveTo(s * 0.41, -0.71, s * 0.41, -0.65);
    lip.lineTo(s * 0.41, -0.5);
    lip.closePath();
    return extrudeAlongX(lip, -0.78, 1.92, P90_STAINLESS, 0.02, 5);
  };
  const feedLipL = buildFeedLip(-1);
  const feedLipR = buildFeedLip(1);
  const rearCartridgeStop = paintGeometry(
    new THREE.BoxGeometry(0.16, 0.26, 0.56).translate(-1.02, -0.62, 0),
    P90_STAINLESS
  );

  return mergeParts([
    hollowedTurret,
    helixRailA,
    helixRailB,
    helixRimTrack,
    centerSpindle,
    feedLipL,
    feedLipR,
    rearCartridgeStop,
  ]);
}

/**
 * M-03: Twin-Roller Horizontal Polymer Follower (assembledPos: [3.35, 2.66, 0])
 * Pushes sideways cartridges rearward (-X) toward the helical feed throat; two staggered
 * horizontal polymer rollers mimic a pair of 5.7×28mm cases to feed the final round!
 */
export function buildP90MagFollowerGeometry(): THREE.BufferGeometry {
  const carriage = paintGeometry(
    new THREE.BoxGeometry(0.82, 0.74, 1.9).translate(0.18, 0, 0),
    P90_FOLLOWER_ORANGE
  );
  const springBoss = paintGeometry(
    new THREE.BoxGeometry(0.08, 0.38, 1.12).translate(0.62, 0, 0),
    P90_POLYMER_BLACK
  );
  // Profiled 5.7×28mm bottleneck dummy-round rollers oriented sideways along -Z (bullet pointing left -Z!)
  const dummyRoundRoller = (color: string): THREE.BufferGeometry => {
    const pts = [
      new THREE.Vector2(0.055, -0.92), // Bullet ogive tip (-Z)
      new THREE.Vector2(0.128, -0.56), // 5.7mm neck
      new THREE.Vector2(0.128, -0.36),
      new THREE.Vector2(0.202, -0.18), // Bottleneck shoulder
      new THREE.Vector2(0.205, 0.78), // Case body
      new THREE.Vector2(0.168, 0.82), // Extractor rim groove
      new THREE.Vector2(0.168, 0.87),
      new THREE.Vector2(0.205, 0.89), // Case head rim (+Z)
      new THREE.Vector2(0.205, 0.92),
      new THREE.Vector2(0.055, 0.92),
    ];
    return paintGeometry(
      new THREE.LatheGeometry(pts, 22).rotateX(Math.PI / 2),
      color
    );
  };
  const rollerUpper = dummyRoundRoller(P90_POLYMER_BLACK).translate(
    -0.32,
    0.185,
    0
  );
  const rollerLower = dummyRoundRoller(P90_COPPER_TIP).translate(
    -0.12,
    -0.185,
    0
  );
  const axleUpper = paintGeometry(
    new THREE.CylinderGeometry(0.058, 0.058, 1.96, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.32, 0.185, 0),
    P90_CHROME
  );
  const axleLower = paintGeometry(
    new THREE.CylinderGeometry(0.058, 0.058, 1.96, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.12, -0.185, 0),
    P90_CHROME
  );
  const guideRailL = paintGeometry(
    new THREE.BoxGeometry(0.8, 0.16, 0.04).translate(0.24, 0, -0.96),
    P90_POLYMER_BLACK
  );
  const guideRailR = paintGeometry(
    new THREE.BoxGeometry(0.8, 0.16, 0.04).translate(0.24, 0, 0.96),
    P90_POLYMER_BLACK
  );

  return mergeParts([
    carriage,
    springBoss,
    rollerUpper,
    rollerLower,
    axleUpper,
    axleLower,
    guideRailL,
    guideRailR,
  ]);
}

/**
 * M-04: Compressed Horizontal Rectangular Magazine Drive Spring (assembledPos: [4.96, 2.66, 0])
 * Fits neatly in the ~1.89 cm front (+X) pocket between `p90_mag_follower` and `p90_mag_floorplate`.
 */
export function buildP90MagSpringGeometry(): THREE.BufferGeometry {
  const springRaw = createRectangularMagSpring({
    height: 1.76,
    widthX: 0.66,
    depthZ: 1.66,
    wireRadius: 0.032,
    coils: 10,
  });
  springRaw.rotateZ(-Math.PI / 2);
  paintGeometry(springRaw, P90_SPRING_STEEL);
  return finalizeGeometry(springRaw);
}

/**
 * M-05: Front Detachable Polycarbonate Magazine Locking End-Plate (assembledPos: [6.52, 2.66, 0])
 */
export function buildP90MagFloorplateGeometry(): THREE.BufferGeometry {
  const capPlate = paintGeometry(
    new THREE.BoxGeometry(0.46, 1.46, 2.62),
    P90_POLYMER_BLACK
  );
  const innerPlug = paintGeometry(
    new THREE.BoxGeometry(0.52, 1.04, 2.08).translate(-0.35, 0, 0),
    P90_MAG_DARK_RIB
  );
  // Twin side slide-rail retainer lips + spring-guide boss + concentric-grooved lock button + traction ribs
  const slideLipL = paintGeometry(
    new THREE.BoxGeometry(0.36, 1.28, 0.1).translate(-0.26, 0, -1.22),
    P90_POLYMER_BLACK
  );
  const slideLipR = paintGeometry(
    new THREE.BoxGeometry(0.36, 1.28, 0.1).translate(-0.26, 0, 1.22),
    P90_POLYMER_BLACK
  );
  const buttonBezel = latheAlongX(
    [
      [0.18, 0.21],
      [0.24, 0.21],
      [0.24, 0.26],
      [0.18, 0.26],
      [0.18, 0.21],
    ],
    20,
    P90_INNER_DARK
  );
  const lockButton = latheAlongX(
    [
      [0.04, 0.08],
      [0.18, 0.08],
      [0.18, 0.34],
      [0.15, 0.36],
      [0.04, 0.36],
      [0.04, 0.08],
    ],
    22,
    P90_STAINLESS
  );
  const tractionRibs: THREE.BufferGeometry[] = [];
  for (const rz of [-0.95, -0.68, 0.68, 0.95]) {
    tractionRibs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.05, 1.12, 0.09).translate(0.245, 0, rz),
        P90_MAG_DARK_RIB
      )
    );
  }

  return mergeParts([
    capPlate,
    innerPlug,
    slideLipL,
    slideLipR,
    buttonBezel,
    lockButton,
    ...tractionRibs,
  ]);
}
