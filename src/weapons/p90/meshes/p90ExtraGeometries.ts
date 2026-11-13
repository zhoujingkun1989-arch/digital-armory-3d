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

  const breechRecess = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.24, 22)
      .rotateZ(Math.PI / 2)
      .translate(2.52, 0.13, 0),
    P90_INNER_DARK
  );
  const rodBoreL = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 5.6, 16)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.52, -0.52),
    P90_INNER_DARK
  );
  const rodBoreR = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 5.6, 16)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.52, 0.52),
    P90_INNER_DARK
  );
  const firingPinChannel = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 5.6, 14)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.13, 0),
    P90_INNER_DARK
  );
  const bottomChuteSlot = paintGeometry(
    new THREE.BoxGeometry(3.4, 0.56, 0.68).translate(0.95, -0.52, 0),
    P90_INNER_DARK
  );
  const sideLighteningL = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.44, 0.22).translate(-0.55, -0.14, -0.76),
    P90_INNER_DARK
  );
  const sideLighteningR = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.44, 0.22).translate(-0.55, -0.14, 0.76),
    P90_INNER_DARK
  );

  const machinedBolt = csgSubtract(rawBolt, [
    breechRecess,
    rodBoreL,
    rodBoreR,
    firingPinChannel,
    bottomChuteSlot,
    sideLighteningL,
    sideLighteningR,
  ]);

  // Hardened right-side extractor claw & pivot pin + bright bolt-face ring
  const extractorClaw = paintGeometry(
    new THREE.BoxGeometry(1.38, 0.22, 0.15).translate(1.92, 0.13, 0.34),
    P90_STAINLESS
  );
  const chargingEngageLug = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.32, 1.72).translate(2.15, 0.72, 0),
    P90_CHAMFER_STEEL
  );

  return mergeParts([machinedBolt, extractorClaw, chargingEngageLug]);
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

  // Molded structural polycarbonate top & side gripping ribs
  for (let i = 0; i < 9; i++) {
    const rx = -8.6 + i * 2.15;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.22, 0.08, 2.58).translate(rx, 0.72, 0),
        P90_MAG_DARK_RIB
      )
    );
  }

  // Rear circular turret boss collar above the 90° helical feed ramp (local X = +0.35 -> world X = -3.45)
  const turretRing = csgSubtract(
    paintGeometry(
      new THREE.CylinderGeometry(1.16, 1.16, 0.34, 28).translate(
        0.35,
        -0.58,
        0
      ),
      P90_MAG_SMOKED
    ),
    [
      paintGeometry(
        new THREE.CylinderGeometry(0.92, 0.92, 0.5, 24).translate(
          0.35,
          -0.58,
          0
        ),
        P90_MAG_DARK_RIB
      ),
    ]
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

  // Sculpted 90° helical spiral guide rails (sweeping from Z-axis sideways at top to X-axis forward at bottom!)
  const spiralPtsA: THREE.Vector3[] = [];
  const spiralPtsB: THREE.Vector3[] = [];
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

  // Hardened steel lower feed lips & bolt-lug clearance channel
  const feedLipL = paintGeometry(
    new THREE.BoxGeometry(1.92, 0.16, 0.18).translate(0.18, -0.68, -0.38),
    P90_STAINLESS
  );
  const feedLipR = paintGeometry(
    new THREE.BoxGeometry(1.92, 0.16, 0.18).translate(0.18, -0.68, 0.38),
    P90_STAINLESS
  );

  return mergeParts([
    hollowedTurret,
    helixRailA,
    helixRailB,
    feedLipL,
    feedLipR,
  ]);
}

/**
 * M-03: Twin-Roller Horizontal Polymer Follower (assembledPos: [-1.85, 2.66, 0])
 * Pushes sideways cartridges rearward (-X) toward the helical feed throat; two staggered
 * horizontal polymer rollers mimic a pair of 5.7×28mm cases to feed the final round!
 */
export function buildP90MagFollowerGeometry(): THREE.BufferGeometry {
  const carriage = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.78, 1.92).translate(0.32, 0, 0),
    P90_FOLLOWER_ORANGE
  );
  const rollerUpper = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 1.84, 20)
      .rotateX(Math.PI / 2)
      .translate(-0.32, 0.22, 0),
    P90_POLYMER_BLACK
  );
  const rollerLower = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 1.84, 20)
      .rotateX(Math.PI / 2)
      .translate(-0.12, -0.22, 0),
    P90_COPPER_TIP
  );
  const axlePins = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.06, 1.98, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.32, 0.22, 0),
    P90_CHROME
  );

  return mergeParts([carriage, rollerUpper, rollerLower, axlePins]);
}

/**
 * M-04: Horizontal Rectangular Magazine Drive Spring (assembledPos: [2.25, 2.66, 0])
 * Spans horizontally along X inside the front half of the top magazine, pushing rearward (-X).
 */
export function buildP90MagSpringGeometry(): THREE.BufferGeometry {
  const springRaw = createRectangularMagSpring({
    height: 7.4,
    widthX: 0.78,
    depthZ: 1.72,
    wireRadius: 0.036,
    coils: 13,
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
  const lockButton = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.28, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.22, 0, 0),
    P90_STAINLESS
  );

  return mergeParts([capPlate, innerPlug, lockButton]);
}
