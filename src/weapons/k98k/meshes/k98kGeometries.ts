import * as THREE from 'three';
import {
  createBeveledCylinder,
  createChamferedBox,
  createHelicalSpring,
  createRifledBarrelBoreCutter,
  csgSubtract,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  extrudeAlongZ,
  mergeCutters,
  revolveClosedX,
  sanitizeWeaponMesh,
} from '../../../engine/geometry/meshSanitizer';

// Authentic Mauser Karabiner 98k (byf 43) palette — strictly >= 0.018 linear luma floor
export const K98K_BLUED_STEEL = '#2b3340';
export const K98K_RECEIVER_BLUE = '#313a49';
export const K98K_PARK_STEEL = '#3d4654';
export const K98K_INNER_DARK = '#29303c';
export const K98K_BOLT_BRIGHT = '#c4cedb';
export const K98K_STAINLESS = '#d6dfe9';
export const K98K_SPRING_STEEL = '#94a3b8';
export const K98K_LAMINATE_WOOD = '#7a5233';
export const K98K_BRASS_CLIP = '#d6a944';

// B-01: 600mm 7.92x57mm Stepped Military Barrel (`assembledPos: [36.2, 1.5, 0]`, local x in [-30.0, +30.0])
export function buildK98kBarrelGeometry(): THREE.BufferGeometry {
  const outer = revolveClosedX(
    [
      [0.42, -30.0],
      [0.42, -29.8],
      [1.24, -29.75], // Threaded Mauser large-ring breech tenon
      [1.24, -28.0],
      [1.44, -27.95], // Chamber reinforce shoulder
      [1.28, -22.25],
      [1.12, -22.15], // Classic Mauser Step 1
      [0.96, -10.55],
      [0.88, -10.45], // Classic Mauser Step 2
      [0.78, 29.75],
      [0.71, 30.0], // Military crowned muzzle
      [0.4, 30.0],
      [0.4, 29.82],
      [0.0, 29.82],
      [0.0, -30.0],
    ],
    28,
    K98K_BLUED_STEEL
  );

  // Integral front sight ramp base near muzzle (world X ~ 63.8 -> local x = +27.6)
  const sightRamp = createChamferedBox(3.4, 0.72, 0.88, 0.05, K98K_BLUED_STEEL);
  sightRamp.translate(27.5, 0.92, 0);

  const solid = mergeParts([outer, sightRamp]);
  // 4-groove right-hand 1:240mm Mauser 7.92mm rifled bore
  const rifledBore = createRifledBarrelBoreCutter(60.6, 0.396, 0.018, 4, 2.5);
  return sanitizeWeaponMesh(csgSubtract(solid, [rifledBore]));
}

// B-02: Hooded Inverted-V Barleycorn Front Sight (`assembledPos: [63.8, 2.75, 0]`)
export function buildK98kFrontSightGeometry(): THREE.BufferGeometry {
  const base = createChamferedBox(3.1, 0.42, 1.15, 0.04, K98K_BLUED_STEEL);
  base.translate(0, -0.42, 0);

  // Inverted-V barleycorn front post
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-1.1, -0.25);
  bladeShape.lineTo(0.85, -0.25);
  bladeShape.lineTo(0.32, 0.62);
  bladeShape.lineTo(-0.18, 0.62);
  bladeShape.closePath();
  const blade = extrudeAlongZ(bladeShape, 0, 0.24, K98K_BLUED_STEEL, 0.02, 8);

  // Iconic spring-steel circular front sight hood (hollow cylinder cut at bottom)
  const hoodOuter = createBeveledCylinder(
    0.94,
    0.94,
    2.45,
    0.04,
    24,
    K98K_PARK_STEEL
  );
  hoodOuter.rotateZ(Math.PI / 2);
  hoodOuter.translate(0.05, 0.32, 0);
  const hoodInner = createBeveledCylinder(
    0.79,
    0.79,
    2.8,
    0.02,
    24,
    K98K_INNER_DARK
  );
  hoodInner.rotateZ(Math.PI / 2);
  hoodInner.translate(0.05, 0.32, 0);
  const hoodSlot = createChamferedBox(2.9, 0.68, 0.92, 0.02, K98K_INNER_DARK);
  hoodSlot.translate(0.05, -0.45, 0);
  const hood = csgSubtract(hoodOuter, [
    mergeCutters([hoodInner, hoodSlot], K98K_INNER_DARK),
  ]);

  return sanitizeWeaponMesh(mergeParts([base, blade, hood]));
}

// B-03: Mauser 98 3-Lug Rotating Bolt Body & Swept-Down Bent Handle (`assembledPos: [-0.2, 1.5, 0]`)
export function buildK98kBoltBodyGeometry(): THREE.BufferGeometry {
  // Main cylindrical bolt body spanning local x in [-7.45, +6.85]
  const body = revolveClosedX(
    [
      [0.0, -7.45],
      [0.86, -7.45],
      [0.86, -4.6],
      [0.88, -4.5], // Bolt handle root collar
      [0.88, 3.6],
      [0.74, 3.65], // Recessed extractor collar raceway groove
      [0.74, 4.45],
      [0.88, 4.5],
      [0.88, 6.85], // Bolt head face
      [0.0, 6.85],
    ],
    24,
    K98K_BOLT_BRIGHT
  );

  // Dual front locking lugs (at 12 o'clock / 6 o'clock in locked battery)
  const frontLugs = createChamferedBox(1.55, 2.52, 0.86, 0.06, K98K_BOLT_BRIGHT);
  frontLugs.translate(5.9, 0, 0);

  // Third rear safety lug (right-bottom rear quadrant ahead of handle root)
  const safetyLug = createChamferedBox(1.35, 0.72, 0.84, 0.05, K98K_BOLT_BRIGHT);
  safetyLug.translate(-4.1, -0.82, 0.42);

  // Guide rib along upper-left for smooth bolt raceway travel
  const guideRib = createChamferedBox(5.6, 0.32, 0.36, 0.03, K98K_BOLT_BRIGHT);
  guideRib.translate(-0.6, 0.78, -0.48);

  // Iconic K98k swept-down bent bolt handle stem & spherical knob (+Z right, -Y down)
  const handlePts = [
    new THREE.Vector3(-5.6, 0.0, 0.65),
    new THREE.Vector3(-5.7, -0.35, 1.75),
    new THREE.Vector3(-5.9, -1.35, 2.65),
    new THREE.Vector3(-6.1, -2.55, 3.25),
    new THREE.Vector3(-6.2, -3.45, 3.65),
  ];
  const handleStem = paintGeometry(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(handlePts),
      20,
      0.34,
      12,
      false
    ),
    K98K_BOLT_BRIGHT
  );
  const knob = paintGeometry(
    new THREE.SphereGeometry(0.92, 18, 14),
    K98K_BOLT_BRIGHT
  );
  knob.translate(-6.2, -3.55, 3.7);

  const solid = mergeParts([
    body,
    frontLugs,
    safetyLug,
    guideRib,
    handleStem,
    knob,
  ]);

  // Firing pin channel & underside gas-escape ports
  const fpBore = createBeveledCylinder(0.46, 0.46, 15.0, 0.02, 16, K98K_INNER_DARK);
  fpBore.rotateZ(Math.PI / 2);
  const gasPort1 = createBeveledCylinder(0.24, 0.24, 1.2, 0.02, 12, K98K_INNER_DARK);
  gasPort1.translate(2.4, -0.65, 0);
  const gasPort2 = createBeveledCylinder(0.24, 0.24, 1.2, 0.02, 12, K98K_INNER_DARK);
  gasPort2.translate(0.9, -0.65, 0);
  const boltFaceRecess = createBeveledCylinder(
    0.6,
    0.6,
    0.45,
    0.02,
    18,
    K98K_INNER_DARK
  );
  boltFaceRecess.rotateZ(Math.PI / 2);
  boltFaceRecess.translate(6.75, 0, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [
      mergeCutters([fpBore, gasPort1, gasPort2, boltFaceRecess], K98K_INNER_DARK),
    ])
  );
}

// B-04: Non-Rotating Full-Length Mauser Claw Extractor (`assembledPos: [-0.2, 1.5, 0]`)
export function buildK98kClawExtractorGeometry(): THREE.BufferGeometry {
  // Full-length leaf bar along +Z right side of bolt body (x in [-0.95, +7.05])
  const blade = createChamferedBox(7.8, 0.62, 0.28, 0.04, K98K_PARK_STEEL);
  blade.translate(2.95, 0.0, 0.96);

  // Heavy controlled-feed claw hook gripping rim at bolt face (+6.95)
  const clawHead = createChamferedBox(0.75, 0.74, 0.56, 0.04, K98K_PARK_STEEL);
  clawHead.translate(6.82, 0.0, 0.78);

  // Rotating extractor collar ring riding in bolt groove at x = +4.05
  const collarOuter = createBeveledCylinder(
    0.96,
    0.96,
    0.68,
    0.03,
    24,
    K98K_BLUED_STEEL
  );
  collarOuter.rotateZ(Math.PI / 2);
  collarOuter.translate(4.05, 0, 0);
  const collarInner = createBeveledCylinder(
    0.76,
    0.76,
    0.95,
    0.01,
    24,
    K98K_INNER_DARK
  );
  collarInner.rotateZ(Math.PI / 2);
  collarInner.translate(4.05, 0, 0);
  const collar = csgSubtract(collarOuter, [collarInner]);

  return sanitizeWeaponMesh(mergeParts([blade, clawHead, collar]));
}

// B-05: Non-Rotating Gas-Deflecting Mauser Bolt Shroud (`assembledPos: [-8.3, 1.5, 0]`)
export function buildK98kBoltShroudGeometry(): THREE.BufferGeometry {
  const sleeve = revolveClosedX(
    [
      [0.0, -1.45],
      [0.98, -1.45],
      [1.04, -1.35],
      [1.04, 0.55],
      [0.84, 0.62],
      [0.84, 1.48], // Threaded front snout entering bolt rear
      [0.0, 1.48],
    ],
    24,
    K98K_BLUED_STEEL
  );

  // Left gas-deflecting flange & upper safety boss
  const gasFlange = createChamferedBox(0.72, 1.85, 0.82, 0.05, K98K_BLUED_STEEL);
  gasFlange.translate(-0.25, 0.2, -0.78);
  const safetyBoss = createBeveledCylinder(
    0.58,
    0.58,
    1.85,
    0.04,
    18,
    K98K_BLUED_STEEL
  );
  safetyBoss.rotateZ(Math.PI / 2);
  safetyBoss.translate(-0.55, 0.85, 0);

  const solid = mergeParts([sleeve, gasFlange, safetyBoss]);
  const fpThrough = createBeveledCylinder(
    0.44,
    0.44,
    3.2,
    0.02,
    16,
    K98K_INNER_DARK
  );
  fpThrough.rotateZ(Math.PI / 2);
  const cockSlot = createChamferedBox(2.2, 0.95, 0.62, 0.02, K98K_INNER_DARK);
  cockSlot.translate(-0.5, -0.65, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [mergeCutters([fpThrough, cockSlot], K98K_INNER_DARK)])
  );
}

// B-06: Iconic 3-Position Mauser Wing Flag Safety (`assembledPos: [-9.0, 2.35, 0]`)
export function buildK98kFlagSafetyGeometry(): THREE.BufferGeometry {
  // Cam shaft entering shroud safety boss
  const shaft = createBeveledCylinder(0.36, 0.36, 1.95, 0.03, 18, K98K_STAINLESS);
  shaft.rotateZ(Math.PI / 2);
  shaft.translate(0.25, 0, 0);

  // Swept Mauser wing flag extending left (-Z) in FIRE position
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-0.35, -0.32);
  wingShape.lineTo(0.45, -0.32);
  wingShape.lineTo(0.55, 0.25);
  wingShape.lineTo(-0.15, 1.35);
  wingShape.lineTo(-0.65, 1.25);
  wingShape.lineTo(-0.55, 0.2);
  wingShape.closePath();
  const wing = extrudeAlongZ(wingShape, 0, 1.75, K98K_STAINLESS, 0.04, 10);
  wing.rotateX(-Math.PI * 0.38);
  wing.translate(-0.62, 0.15, -0.78);

  return sanitizeWeaponMesh(mergeParts([shaft, wing]));
}

// B-07: Full-Length Mauser Firing Pin & Cocking Piece (`assembledPos: [-1.5, 1.5, 0]`)
export function buildK98kFiringPinGeometry(): THREE.BufferGeometry {
  const shaft = revolveClosedX(
    [
      [0.0, -8.75],
      [0.44, -8.75], // Rear cocking-piece hub
      [0.44, -7.2],
      [0.24, -7.15], // Main firing pin shaft
      [0.24, 3.2],
      [0.42, 3.28], // Spring retainer collar
      [0.42, 3.72],
      [0.2, 3.78],
      [0.14, 7.6],
      [0.055, 8.28], // Striker tip
      [0.0, 8.32],
    ],
    18,
    K98K_STAINLESS
  );

  // Dual anti-gas guide flanges mid-shaft
  const flange = createChamferedBox(0.95, 0.92, 0.32, 0.03, K98K_STAINLESS);
  flange.translate(3.5, 0, 0);

  // Iconic Mauser cocking piece (Schlagbolzenmutter) with lower sear engagement lug
  const cockingPiece = createChamferedBox(
    1.65,
    1.62,
    0.72,
    0.05,
    K98K_BLUED_STEEL
  );
  cockingPiece.translate(-7.95, -0.45, 0);

  return sanitizeWeaponMesh(mergeParts([shaft, flange, cockingPiece]));
}

// B-08: Helical Firing Pin Mainspring (`assembledPos: [-6.8, 1.5, 0]`, DYNAMIC CSG SPRING, w = 1)
export function buildK98kFiringPinSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 8.8,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.38,
      wireRadius: 0.06,
      coils: 22,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    K98K_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// F-01: Forged Mauser 98 Large-Ring Receiver (`assembledPos: [-0.5, 1.1, 0]`, isShell: true)
export function buildK98kReceiverGeometry(): THREE.BufferGeometry {
  // Cylindrical large front ring (Ø35.8mm -> r=1.79, x in [+5.4, +9.2])
  const frontRing = createBeveledCylinder(
    1.79,
    1.79,
    3.85,
    0.08,
    28,
    K98K_RECEIVER_BLUE
  );
  frontRing.rotateZ(Math.PI / 2);
  frontRing.translate(7.25, 0.4, 0);

  // Integral recoil lug beneath front receiver ring
  const recoilLug = createChamferedBox(1.55, 1.45, 2.25, 0.06, K98K_RECEIVER_BLUE);
  recoilLug.translate(7.1, -1.25, 0);

  // Main forged receiver body walls (x in [-6.8, +5.8])
  const body = createChamferedBox(12.6, 2.95, 3.25, 0.14, K98K_RECEIVER_BLUE);
  body.translate(-0.5, 0.2, 0);

  // Raised C-ring rear stripper-clip bridge hump (x in [-6.2, -2.8])
  const rearBridge = createBeveledCylinder(
    1.62,
    1.62,
    3.4,
    0.06,
    24,
    K98K_RECEIVER_BLUE
  );
  rearBridge.rotateZ(Math.PI / 2);
  rearBridge.translate(-4.5, 0.4, 0);

  // Rear tang extending into wrist (x in [-10.8, -6.4])
  const rearTang = createChamferedBox(4.4, 1.15, 2.15, 0.08, K98K_RECEIVER_BLUE);
  rearTang.translate(-8.6, -0.5, 0);

  // Left-rear hinged bolt-stop & ejector housing box
  const boltStopBox = createChamferedBox(
    3.6,
    1.25,
    0.85,
    0.06,
    K98K_PARK_STEEL
  );
  boltStopBox.translate(-6.2, 0.45, -1.85);

  const solid = mergeParts([
    frontRing,
    recoilLug,
    body,
    rearBridge,
    rearTang,
    boltStopBox,
  ]);

  // Through bolt raceway bore (bore at local y = +0.40)
  const boltBore = createBeveledCylinder(
    0.94,
    0.94,
    20.2,
    0.02,
    24,
    K98K_INNER_DARK
  );
  boltBore.rotateZ(Math.PI / 2);
  boltBore.translate(0.5, 0.4, 0);

  // Top loading/ejection port opening (x in [-2.6, +5.1])
  const topPort = createChamferedBox(7.8, 2.1, 2.15, 0.04, K98K_INNER_DARK);
  topPort.translate(1.25, 1.35, 0.22);

  // Iconic Mauser left-wall thumb cutout scallop for charger loading
  const thumbCut = createBeveledCylinder(
    1.45,
    1.45,
    1.8,
    0.04,
    18,
    K98K_INNER_DARK
  );
  thumbCut.rotateX(Math.PI / 2);
  thumbCut.translate(0.9, 1.45, -1.55);

  // Magazine feed opening through receiver bottom
  const magFeed = createChamferedBox(8.4, 2.0, 2.25, 0.04, K98K_INNER_DARK);
  magFeed.translate(1.4, -1.1, 0);

  // Stripper-clip vertical guide slot machined into C-ring rear bridge
  const clipSlot = createChamferedBox(1.45, 1.3, 1.55, 0.03, K98K_INNER_DARK);
  clipSlot.translate(-3.6, 1.85, 0);

  // Right-side bolt handle root locking notch behind rear bridge
  const handleNotch = createChamferedBox(1.85, 1.65, 1.45, 0.04, K98K_INNER_DARK);
  handleNotch.translate(-5.4, 0.35, 1.35);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [
      mergeCutters(
        [boltBore, topPort, thumbCut, magFeed, clipSlot, handleNotch],
        K98K_INNER_DARK
      ),
    ])
  );
}

// F-02: 100-2000m Graduated Tangent Leaf Rear Sight (`assembledPos: [16.8, 2.75, 0]`)
export function buildK98kRearSightGeometry(): THREE.BufferGeometry {
  // Barrel mounting collar sleeve (bore at local y = -1.25)
  const collarOuter = createBeveledCylinder(
    1.28,
    1.28,
    6.4,
    0.05,
    24,
    K98K_BLUED_STEEL
  );
  collarOuter.rotateZ(Math.PI / 2);
  collarOuter.translate(0, -1.25, 0);
  const collarInner = createBeveledCylinder(
    1.03,
    1.03,
    6.9,
    0.02,
    24,
    K98K_INNER_DARK
  );
  collarInner.rotateZ(Math.PI / 2);
  collarInner.translate(0, -1.25, 0);
  const collar = csgSubtract(collarOuter, [collarInner]);

  // Curved tangent base walls
  const rampBase = createChamferedBox(6.8, 0.95, 1.85, 0.05, K98K_BLUED_STEEL);
  rampBase.translate(0, -0.05, 0);

  // Graduated tangent leaf (1-20 hundred meters) + sliding elevation cursor
  const leaf = createChamferedBox(6.4, 0.28, 1.48, 0.03, K98K_PARK_STEEL);
  leaf.rotateZ(0.05);
  leaf.translate(-0.15, 0.52, 0);
  const slider = createChamferedBox(1.35, 0.56, 2.05, 0.04, K98K_BLUED_STEEL);
  slider.translate(-1.25, 0.55, 0);

  return sanitizeWeaponMesh(mergeParts([collar, rampBase, leaf, slider]));
}

// F-03: Laminated Beechwood Stock w/ Sling Slot & Takedown Disk (`assembledPos: [4.0, -2.1, 0]`, isShell: true)
export function buildK98kStockGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-47.8, -9.3); // Butt toe (world X=-43.8, Y=-11.4)
  s.lineTo(-47.8, 2.2); // Butt heel (world X=-43.8, Y=+0.1)
  s.lineTo(-21.5, 2.55); // Comb to wrist
  s.lineTo(-14.5, 2.85); // Receiver tang crest
  s.lineTo(47.8, 3.2); // Full-length forend top edge (world X=+51.8)
  s.lineTo(47.8, 1.15); // Forend nose beneath front H-band
  s.lineTo(14.5, -1.35); // Slim forend belly
  s.lineTo(4.0, -2.25); // Magazine well flush belly
  s.lineTo(-8.5, -2.25); // Behind trigger guard
  s.lineTo(-15.5, -4.15); // Semi-pistol grip swell
  s.lineTo(-20.2, -3.65); // Grip rear curve
  s.lineTo(-47.8, -9.3); // Lower buttstock edge
  s.closePath();

  const blank = extrudeAlongZ(s, 0, 4.1, K98K_LAMINATE_WOOD, 0.36, 12);

  // Action & internal magazine well mortise cutout (world X in [-10.8, +6.5] -> local x in [-14.8, +2.5])
  const actionCut = createChamferedBox(18.2, 4.4, 2.85, 0.05, K98K_INNER_DARK);
  actionCut.translate(-5.8, 2.1, 0);
  const magWellCut = createChamferedBox(9.8, 5.2, 2.55, 0.05, K98K_INNER_DARK);
  magWellCut.translate(-2.9, -0.4, 0);

  // Barrel channel along upper forend (world Y=1.5 -> local y=+3.6)
  const bblChan = createBeveledCylinder(
    1.18,
    1.18,
    47.0,
    0.02,
    20,
    K98K_INNER_DARK
  );
  bblChan.rotateZ(Math.PI / 2);
  bblChan.translate(25.2, 3.6, 0);

  // Iconic K98k buttstock sling pass-through cutout (world X in [-39.0, -34.0] -> local x in [-43.0, -38.0])
  const slingSlot = createChamferedBox(4.8, 2.5, 5.2, 0.14, K98K_INNER_DARK);
  slingSlot.translate(-40.4, -2.7, 0);

  // Forend lateral finger grooves (both sides)
  const grooveL = createChamferedBox(14.5, 0.65, 0.45, 0.12, K98K_INNER_DARK);
  grooveL.translate(14.5, 1.35, -2.02);
  const grooveR = createChamferedBox(14.5, 0.65, 0.45, 0.12, K98K_INNER_DARK);
  grooveR.translate(14.5, 1.35, 2.02);

  const carved = csgSubtract(blank, [
    mergeCutters(
      [actionCut, magWellCut, bblChan, slingSlot, grooveL, grooveR],
      K98K_INNER_DARK
    ),
  ]);

  // Iconic circular steel bolt takedown disk (Zerlegescheibe) & cross-bolt recoil lug
  const takedownDisk = createBeveledCylinder(
    1.28,
    1.28,
    4.22,
    0.06,
    22,
    K98K_PARK_STEEL
  );
  takedownDisk.rotateX(Math.PI / 2);
  takedownDisk.translate(-32.2, -2.3, 0);
  const recoilCrossBolt = createBeveledCylinder(
    0.45,
    0.45,
    4.24,
    0.04,
    16,
    K98K_PARK_STEEL
  );
  recoilCrossBolt.rotateX(Math.PI / 2);
  recoilCrossBolt.translate(2.7, 0.9, 0);

  return sanitizeWeaponMesh(
    mergeParts([carved, takedownDisk, recoilCrossBolt])
  );
}

// F-04: Laminated Beechwood Upper Handguard (`assembledPos: [31.5, 2.25, 0]`)
export function buildK98kHandguardGeometry(): THREE.BufferGeometry {
  const outer = createBeveledCylinder(
    1.68,
    1.44,
    38.8,
    0.1,
    24,
    K98K_LAMINATE_WOOD
  );
  outer.rotateZ(Math.PI / 2);
  outer.translate(0, -0.3, 0);

  const boreCut = createBeveledCylinder(
    1.08,
    0.92,
    39.6,
    0.02,
    22,
    K98K_INNER_DARK
  );
  boreCut.rotateZ(Math.PI / 2);
  boreCut.translate(0, -0.75, 0);

  const lowerSlice = createChamferedBox(40.2, 2.1, 4.2, 0.02, K98K_INNER_DARK);
  lowerSlice.translate(0, -1.65, 0);

  // Relief window around rear tangent sight base (world X in [13.2..20.4] -> local x in [-18.3..-11.1])
  const sightWindow = createChamferedBox(7.4, 2.6, 2.35, 0.04, K98K_INNER_DARK);
  sightWindow.translate(-14.7, 0.55, 0);

  return sanitizeWeaponMesh(
    csgSubtract(outer, [
      mergeCutters([boreCut, lowerSlice, sightWindow], K98K_INNER_DARK),
    ])
  );
}

// F-05: H-Pattern Front Barrel Band & Integral Bayonet Lug (`assembledPos: [51.6, 0.85, 0]`)
export function buildK98kFrontBandGeometry(): THREE.BufferGeometry {
  // Rear and front straps of the iconic H-band
  const rearStrap = createChamferedBox(1.55, 3.65, 3.25, 0.1, K98K_PARK_STEEL);
  rearStrap.translate(-2.2, 0.25, 0);
  const frontStrap = createChamferedBox(1.55, 3.45, 3.15, 0.1, K98K_PARK_STEEL);
  frontStrap.translate(1.85, 0.2, 0);
  const sideBridgeL = createChamferedBox(4.4, 1.35, 0.36, 0.05, K98K_PARK_STEEL);
  sideBridgeL.translate(-0.2, 0.25, -1.45);
  const sideBridgeR = createChamferedBox(4.4, 1.35, 0.36, 0.05, K98K_PARK_STEEL);
  sideBridgeR.translate(-0.2, 0.25, 1.45);

  // Underbarrel T-bar S84/98 bayonet lug extending forward
  const bayoStem = createChamferedBox(5.2, 0.72, 0.68, 0.04, K98K_BLUED_STEEL);
  bayoStem.translate(3.15, -0.95, 0);
  const bayoRail = createChamferedBox(4.8, 0.38, 1.18, 0.04, K98K_BLUED_STEEL);
  bayoRail.translate(3.25, -1.35, 0);

  const solid = mergeParts([
    rearStrap,
    frontStrap,
    sideBridgeL,
    sideBridgeR,
    bayoStem,
    bayoRail,
  ]);
  const bblHole = createBeveledCylinder(
    0.85,
    0.85,
    7.2,
    0.02,
    22,
    K98K_INNER_DARK
  );
  bblHole.rotateZ(Math.PI / 2);
  bblHole.translate(0, 0.65, 0);
  const stockHole = createChamferedBox(5.8, 1.55, 2.35, 0.04, K98K_INNER_DARK);
  stockHole.translate(-0.2, -0.55, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [mergeCutters([bblHole, stockHole], K98K_INNER_DARK)])
  );
}

// F-06: Rear Barrel Band & Left-Side Cavalry Sling Bar (`assembledPos: [33.0, 0.9, 0]`)
export function buildK98kRearBandGeometry(): THREE.BufferGeometry {
  const strap = createChamferedBox(2.25, 3.65, 3.55, 0.1, K98K_PARK_STEEL);
  // Left-flank vertical K98k sling bar loop (-Z)
  const slingPostTop = createChamferedBox(0.55, 0.42, 0.85, 0.04, K98K_BLUED_STEEL);
  slingPostTop.translate(0, 0.95, -2.05);
  const slingPostBot = createChamferedBox(0.55, 0.42, 0.85, 0.04, K98K_BLUED_STEEL);
  slingPostBot.translate(0, -0.95, -2.05);
  const slingBar = createChamferedBox(0.42, 2.25, 0.34, 0.04, K98K_BLUED_STEEL);
  slingBar.translate(0, 0, -2.32);

  const bblHole = createBeveledCylinder(
    0.92,
    0.92,
    2.8,
    0.02,
    22,
    K98K_INNER_DARK
  );
  bblHole.rotateZ(Math.PI / 2);
  bblHole.translate(0, 0.6, 0);
  const woodHole = createChamferedBox(2.8, 1.85, 2.65, 0.04, K98K_INNER_DARK);
  woodHole.translate(0, -0.6, 0);

  const ring = csgSubtract(strap, [
    mergeCutters([bblHole, woodHole], K98K_INNER_DARK),
  ]);
  return sanitizeWeaponMesh(
    mergeParts([ring, slingPostTop, slingPostBot, slingBar])
  );
}

// F-07: Underbarrel Threaded Steel Cleaning Rod (`assembledPos: [45.0, -0.35, 0]`)
export function buildK98kCleaningRodGeometry(): THREE.BufferGeometry {
  const rod = revolveClosedX(
    [
      [0.0, -15.5],
      [0.2, -15.5],
      [0.24, -15.2],
      [0.24, 13.8],
      [0.36, 13.95], // Flared slotted cleaning jag tip
      [0.36, 15.35],
      [0.22, 15.5],
      [0.0, 15.5],
    ],
    18,
    K98K_BLUED_STEEL
  );
  const eyeSlot = createChamferedBox(0.95, 0.24, 0.9, 0.02, K98K_INNER_DARK);
  eyeSlot.translate(14.55, 0, 0);
  return sanitizeWeaponMesh(csgSubtract(rod, [eyeSlot]));
}

// F-08: Cupped Stamped Steel Military Buttplate (`assembledPos: [-43.8, -5.65, 0]`)
export function buildK98kButtplateGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.85, -5.75);
  s.lineTo(1.45, -5.75);
  s.lineTo(1.45, 5.75);
  s.lineTo(-0.85, 5.75);
  s.lineTo(-1.05, 0.0);
  s.closePath();
  const outer = extrudeAlongZ(s, 0, 4.18, K98K_PARK_STEEL, 0.14, 12);
  // Cupped interior recess wrapping buttstock wood
  const cup = createChamferedBox(1.85, 10.6, 3.55, 0.08, K98K_INNER_DARK);
  cup.translate(0.75, 0, 0);
  return sanitizeWeaponMesh(csgSubtract(outer, [cup]));
}

// FC-01: Two-Stage Twin-Fulcrum Mauser Trigger (`assembledPos: [-8.2, -1.95, 0]`)
export function buildK98kTriggerGeometry(): THREE.BufferGeometry {
  // Upper lever bar with authentic twin 2-stage fulcrum humps
  const s = new THREE.Shape();
  s.moveTo(-1.45, 0.15);
  s.lineTo(1.42, 0.15);
  s.lineTo(1.35, 0.95); // Front 1st-stage hump
  s.lineTo(0.45, 0.72);
  s.lineTo(-0.15, 1.05); // Rear 2nd-stage hump
  s.lineTo(-1.35, 0.62);
  s.closePath();
  const head = extrudeAlongZ(s, 0, 0.62, K98K_BLUED_STEEL, 0.04, 8);

  // Curved military trigger blade
  const blade = createChamferedBox(0.62, 2.45, 0.54, 0.06, K98K_BLUED_STEEL);
  blade.rotateZ(0.24);
  blade.translate(-0.22, -1.18, 0);
  return sanitizeWeaponMesh(mergeParts([head, blade]));
}

// FC-02: Mauser 98 Pivoting Sear Bar (`assembledPos: [-7.9, -0.35, 0]`)
export function buildK98kSearGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-2.05, -0.35);
  s.lineTo(1.85, -0.35);
  s.lineTo(1.85, 0.35);
  s.lineTo(0.25, 0.35);
  s.lineTo(-0.35, 0.82); // Upper sear tooth engaging cocking piece
  s.lineTo(-1.95, 0.42);
  s.closePath();
  return sanitizeWeaponMesh(extrudeAlongZ(s, 0, 0.78, K98K_PARK_STEEL, 0.04, 8));
}

// FC-03: Helical Sear Return Spring (`assembledPos: [-6.55, 0.35, 0]`, `assembledRot: [0, 0, -PI/2]`, DYNAMIC CSG SPRING)
export function buildK98kSearSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 1.05,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.2,
      wireRadius: 0.042,
      coils: 8,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    K98K_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// FC-04: Milled Trigger Guard & Integral Internal Magazine Box (`assembledPos: [-1.8, -3.2, 0]`, isShell: true)
export function buildK98kTriggerGuardGeometry(): THREE.BufferGeometry {
  // Bottom tang plate spanning rear trigger tang to front recoil screw boss
  const bottomPlate = createChamferedBox(
    17.4,
    0.58,
    2.75,
    0.06,
    K98K_BLUED_STEEL
  );
  bottomPlate.translate(-0.35, -1.15, 0);

  // Integral flush internal 5-round box magazine walls (world X in [-3.4, +5.8] -> local x in [-1.6, +7.6])
  const magBoxOuter = createChamferedBox(
    9.2,
    3.55,
    2.65,
    0.08,
    K98K_BLUED_STEEL
  );
  magBoxOuter.translate(2.9, 0.65, 0);

  // Closed-loop forged trigger guard bow (solidly welded front & rear, zero floating gaps!)
  const guardShape = new THREE.Shape();
  guardShape.moveTo(-8.4, -0.88);
  guardShape.lineTo(-3.2, -0.88);
  guardShape.lineTo(-3.4, -2.15);
  guardShape.lineTo(-4.8, -2.55);
  guardShape.lineTo(-7.2, -2.55);
  guardShape.lineTo(-8.3, -1.85);
  guardShape.closePath();
  const guardOuter = extrudeAlongZ(guardShape, 0, 1.38, K98K_BLUED_STEEL, 0.06, 10);

  const solid = mergeParts([bottomPlate, magBoxOuter, guardOuter]);

  // Hollow interior of the 5-rd staggered box magazine
  const magInterior = createChamferedBox(
    8.45,
    4.6,
    2.15,
    0.03,
    K98K_INNER_DARK
  );
  magInterior.translate(2.9, 0.55, 0);

  // Finger opening through trigger guard bow
  const guardHoleShape = new THREE.Shape();
  guardHoleShape.moveTo(-7.75, -1.2);
  guardHoleShape.lineTo(-3.9, -1.2);
  guardHoleShape.lineTo(-4.15, -2.02);
  guardHoleShape.lineTo(-5.05, -2.18);
  guardHoleShape.lineTo(-6.95, -2.18);
  guardHoleShape.lineTo(-7.7, -1.72);
  guardHoleShape.closePath();
  const guardHole = extrudeAlongZ(guardHoleShape, 0, 2.0, K98K_INNER_DARK, 0.02, 8);

  // Trigger blade pass-through slot in top of trigger guard plate
  const trigSlot = createChamferedBox(2.2, 1.2, 0.72, 0.02, K98K_INNER_DARK);
  trigSlot.translate(-6.4, -1.0, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [
      mergeCutters([magInterior, guardHole, trigSlot], K98K_INNER_DARK),
    ])
  );
}

// M-01: Staggered Stepped Steel Magazine Follower (`assembledPos: [1.1, -3.1, 0]`)
export function buildK98kMagFollowerGeometry(): THREE.BufferGeometry {
  const basePlate = createChamferedBox(7.8, 0.34, 1.92, 0.04, K98K_STAINLESS);
  basePlate.translate(0, -0.14, 0);
  // Left-side stepped stagger ridge + rear bolt-hold-open shoulder
  const stepRidge = createChamferedBox(7.2, 0.34, 0.92, 0.04, K98K_STAINLESS);
  stepRidge.translate(-0.15, 0.16, -0.46);
  const stopShoulder = createChamferedBox(0.85, 0.42, 1.72, 0.04, K98K_STAINLESS);
  stopShoulder.translate(-3.45, 0.14, 0);
  return sanitizeWeaponMesh(mergeParts([basePlate, stepRidge, stopShoulder]));
}

// M-02: Internal 5-Rd Magazine Spring (`assembledPos: [1.1, -4.35, 0]`, `assembledRot: [0, 0, PI/2]`, DYNAMIC CSG SPRING)
export function buildK98kMagSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 1.1,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.5,
      wireRadius: 0.055,
      coils: 7,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    K98K_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// M-03: Removable Steel Magazine Floorplate (`assembledPos: [1.1, -4.45, 0]`)
export function buildK98kMagFloorplateGeometry(): THREE.BufferGeometry {
  const plate = createChamferedBox(8.9, 0.36, 2.38, 0.05, K98K_BLUED_STEEL);
  const frontLip = createChamferedBox(0.95, 0.46, 1.95, 0.04, K98K_BLUED_STEEL);
  frontLip.translate(3.85, 0.22, 0);
  const catchStud = createBeveledCylinder(
    0.26,
    0.26,
    0.48,
    0.03,
    14,
    K98K_PARK_STEEL
  );
  catchStud.translate(-3.8, -0.05, 0);
  return sanitizeWeaponMesh(mergeParts([plate, frontLip, catchStud]));
}

// M-04: Iconic Mauser 98 5-Round Brass Stripper Clip (`assembledPos: [-4.1, 5.5, 0]`)
export function buildK98kStripperClipGeometry(): THREE.BufferGeometry {
  // C-channel brass rail spanning y in [-2.55, +2.55] (5.1 cm tall)
  const spine = createChamferedBox(0.28, 5.1, 1.38, 0.03, K98K_BRASS_CLIP);
  spine.translate(-0.52, 0, 0);
  const wingL = createChamferedBox(1.32, 5.1, 0.22, 0.03, K98K_BRASS_CLIP);
  wingL.translate(0.0, 0, -0.62);
  const wingR = createChamferedBox(1.32, 5.1, 0.22, 0.03, K98K_BRASS_CLIP);
  wingR.translate(0.0, 0, 0.62);
  // Retaining lip tabs curving inward along front rails + central spring rib
  const lipL = createChamferedBox(0.26, 4.95, 0.32, 0.02, K98K_BRASS_CLIP);
  lipL.translate(0.58, 0, -0.48);
  const lipR = createChamferedBox(0.26, 4.95, 0.32, 0.02, K98K_BRASS_CLIP);
  lipR.translate(0.58, 0, 0.48);
  const springLeaf = createChamferedBox(0.18, 4.4, 0.72, 0.02, K98K_PARK_STEEL);
  springLeaf.translate(-0.32, 0, 0);

  return sanitizeWeaponMesh(
    mergeParts([spine, wingL, wingR, lipL, lipR, springLeaf])
  );
}
