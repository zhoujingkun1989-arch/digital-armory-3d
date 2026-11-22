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

// Authentic Winchester Model 1894 Saddle-Ring Carbine palette (strictly >= 0.018 linear albedo floor)
export const WIN94_BLUED_STEEL = '#2b3340';
export const WIN94_RECEIVER_BLUE = '#323a48';
export const WIN94_BOLT_POLISHED = '#b8c4d4';
export const WIN94_STAINLESS = '#d1dae6';
export const WIN94_BRASS_CARRIER = '#d4a644';
export const WIN94_CASE_HARDENED = '#574e47';
export const WIN94_SPRING_STEEL = '#94a3b8';
export const WIN94_WALNUT = '#6b4228';
export const WIN94_SADDLE_IRON = '#3e4756';

// B-01: 20" Tapered Round Carbine Barrel (`assembledPos: [30.8, 1.45, 0]`, local x in [-25.6, +25.7])
export function buildWin94BarrelGeometry(): THREE.BufferGeometry {
  const outer = revolveClosedX(
    [
      [0.42, -25.6],
      [0.42, -25.3],
      [1.06, -25.25], // Threaded receiver tenon collar
      [1.06, -22.2],
      [0.94, -21.8], // Tapered .30-30 carbine shank
      [0.78, -5.0],
      [0.72, 23.8],
      [0.72, 25.55],
      [0.64, 25.7], // Crown chamfer
      [0.39, 25.7],
      [0.39, 25.5], // Recessed crown
      [0.0, 25.5],
      [0.0, -25.6],
    ],
    28,
    WIN94_BLUED_STEEL
  );

  // Underbarrel front & rear magazine hanger lugs
  const frontLug = createChamferedBox(1.5, 1.45, 0.72, 0.04, WIN94_BLUED_STEEL);
  frontLug.translate(22.6, -1.05, 0);
  const sightRamp = createChamferedBox(2.2, 0.52, 0.56, 0.04, WIN94_BLUED_STEEL);
  sightRamp.translate(23.4, 0.88, 0);

  const solid = mergeParts([outer, frontLug, sightRamp]);
  const rifledBore = createRifledBarrelBoreCutter(51.8, 0.39, 0.016, 6, 1.65);
  return sanitizeWeaponMesh(csgSubtract(solid, [rifledBore]));
}

// B-02: Front Sight Post & Brass Bead (`assembledPos: [54.2, 2.55, 0]`)
export function buildWin94FrontSightGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.95, -0.34);
  s.lineTo(0.92, -0.34);
  s.lineTo(0.75, 0.48);
  s.lineTo(0.28, 0.88);
  s.lineTo(-0.35, 0.22);
  s.closePath();

  const blade = extrudeAlongZ(s, 0, 0.28, WIN94_BLUED_STEEL, 0.02, 8);
  const base = createChamferedBox(1.9, 0.34, 0.82, 0.03, WIN94_BLUED_STEEL);
  base.translate(0, -0.26, 0);
  const bead = createBeveledCylinder(0.14, 0.14, 0.42, 0.02, 14, WIN94_BRASS_CARRIER);
  bead.rotateZ(Math.PI / 2);
  bead.translate(-0.1, 0.62, 0);

  return sanitizeWeaponMesh(mergeParts([base, blade, bead]));
}

// B-03: Top-Eject Cylindrical Breech Bolt (`assembledPos: [-0.4, 1.45, 0]`)
export function buildWin94BreechBoltGeometry(): THREE.BufferGeometry {
  const blank = createChamferedBox(8.6, 1.24, 1.38, 0.12, WIN94_BOLT_POLISHED);
  const faceCollar = revolveClosedX(
    [
      [0.0, 4.1],
      [0.64, 4.1],
      [0.64, 4.4],
      [0.52, 4.4],
      [0.52, 4.25],
      [0.0, 4.25],
    ],
    22,
    WIN94_BOLT_POLISHED
  );
  const extractor = createChamferedBox(3.4, 0.26, 0.38, 0.03, WIN94_BLUED_STEEL);
  extractor.translate(2.2, 0.66, 0);

  const solid = mergeParts([blank, faceCollar, extractor]);
  const fpBore = createBeveledCylinder(0.22, 0.22, 8.8, 0.02, 14, '#1e2430');
  fpBore.rotateZ(Math.PI / 2);
  const rearNotch = createChamferedBox(1.8, 0.85, 0.72, 0.03, '#1e2430');
  rearNotch.translate(-3.6, -0.35, 0);

  return sanitizeWeaponMesh(csgSubtract(solid, [fpBore, rearNotch]));
}

// B-04: Two-Piece Interlocked Firing Pin (`assembledPos: [-0.8, 1.45, 0]`)
export function buildWin94FiringPinGeometry(): THREE.BufferGeometry {
  const pin = revolveClosedX(
    [
      [0.0, -4.55],
      [0.24, -4.55], // Rear hammer contact heel
      [0.26, -4.45],
      [0.26, -3.55],
      [0.14, -3.45], // Interlock collar waist
      [0.14, 2.8],
      [0.075, 4.35],
      [0.035, 4.55],
      [0.0, 4.58],
    ],
    18,
    WIN94_STAINLESS
  );
  const safetyLug = createChamferedBox(0.85, 0.42, 0.24, 0.02, WIN94_STAINLESS);
  safetyLug.translate(-3.2, -0.14, 0);
  return sanitizeWeaponMesh(mergeParts([pin, safetyLug]));
}

// B-05: Vertical Rising Locking Bolt (`assembledPos: [-5.9, -0.05, 0]`)
export function buildWin94LockingBoltGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.78, -1.55);
  s.lineTo(0.78, -1.55);
  s.lineTo(0.82, 0.55);
  s.lineTo(0.65, 1.48); // Twin upward vertical bolt-engagement lugs
  s.lineTo(-0.65, 1.48);
  s.lineTo(-0.78, 0.95);
  s.closePath();

  const block = extrudeAlongZ(s, 0, 1.62, WIN94_CASE_HARDENED, 0.05, 8);
  const clearance = createChamferedBox(2.2, 0.78, 0.62, 0.03, '#1e2430');
  clearance.translate(0, 0.15, 0);
  const crossHole = createBeveledCylinder(0.24, 0.24, 2.0, 0.02, 14, '#1e2430');
  crossHole.rotateX(Math.PI / 2);
  crossHole.translate(0, -1.05, 0);

  return sanitizeWeaponMesh(
    csgSubtract(block, [mergeCutters([clearance, crossHole], '#1e2430')])
  );
}

// B-06: Iconic Forged D-Loop Finger Lever (`assembledPos: [0.8, -1.65, 0]`, hinge at local (0, 0, 0))
export function buildWin94LeverGeometry(): THREE.BufferGeometry {
  const armShape = new THREE.Shape();
  armShape.moveTo(-0.68, -0.45);
  armShape.lineTo(0.68, -0.45);
  armShape.lineTo(0.74, 0.48);
  armShape.lineTo(-0.55, 0.48);
  armShape.lineTo(-10.8, -3.55);
  armShape.lineTo(-11.4, -4.35);
  armShape.lineTo(-6.2, -4.35);
  armShape.lineTo(-4.8, -2.55);
  armShape.lineTo(-0.68, -0.45);
  armShape.closePath();

  const outerLoop = extrudeAlongZ(armShape, 0, 0.96, WIN94_CASE_HARDENED, 0.06, 12);

  // D-loop finger opening cutout
  const holeShape = new THREE.Shape();
  holeShape.moveTo(-10.1, -3.58);
  holeShape.lineTo(-5.85, -3.58);
  holeShape.lineTo(-5.25, -2.55);
  holeShape.lineTo(-8.85, -2.95);
  holeShape.closePath();
  const loopHole = extrudeAlongZ(holeShape, 0, 1.5, '#1e2430', 0.02, 10);

  const camTail = createChamferedBox(1.2, 0.85, 0.72, 0.04, WIN94_BLUED_STEEL);
  camTail.translate(-0.2, 0.25, 0);

  return sanitizeWeaponMesh(
    csgSubtract(mergeParts([outerLoop, camTail]), [loopHole])
  );
}

// B-07: Receiver-Bottom Pivoting Link Bridge (`assembledPos: [-4.6, -1.85, 0]`)
export function buildWin94LinkGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-2.35, -0.42);
  s.lineTo(2.45, -0.35);
  s.lineTo(2.55, 0.48);
  s.lineTo(1.25, 0.65);
  s.lineTo(-1.85, 0.45);
  s.lineTo(-2.45, -0.05);
  s.closePath();
  const body = extrudeAlongZ(s, 0, 1.24, WIN94_BLUED_STEEL, 0.05, 8);
  const slot = createChamferedBox(3.4, 0.48, 0.46, 0.02, '#1e2430');
  slot.translate(0.1, 0.45, 0);
  return sanitizeWeaponMesh(csgSubtract(body, [slot]));
}

// F-01: Top-Eject Milled Forged Model 1894 Receiver (`assembledPos: [-1.0, 0.25, 0]`)
export function buildWin94ReceiverGeometry(): THREE.BufferGeometry {
  const outer = createChamferedBox(12.2, 4.1, 2.8, 0.14, WIN94_RECEIVER_BLUE);
  const lowerTang = createChamferedBox(6.8, 1.35, 1.68, 0.08, WIN94_RECEIVER_BLUE);
  lowerTang.translate(-6.2, -1.1, 0);
  const upperTang = createChamferedBox(5.6, 0.62, 1.48, 0.06, WIN94_RECEIVER_BLUE);
  upperTang.translate(-6.2, 0.85, 0);

  const solid = mergeParts([outer, lowerTang, upperTang]);
  const topEject = createChamferedBox(9.2, 2.2, 1.65, 0.04, '#1e2430');
  topEject.translate(0.35, 1.45, 0);
  const bottomCarrierSlot = createChamferedBox(9.4, 2.2, 1.56, 0.04, '#1e2430');
  bottomCarrierSlot.translate(0.2, -1.5, 0);
  const bblSocket = createBeveledCylinder(0.95, 0.95, 3.2, 0.02, 20, '#1e2430');
  bblSocket.rotateZ(Math.PI / 2);
  bblSocket.translate(5.5, 1.2, 0);
  const loadingPort = createChamferedBox(4.4, 1.45, 0.65, 0.04, '#1e2430');
  loadingPort.translate(1.3, -0.15, 1.32);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [
      mergeCutters([topEject, bottomCarrierSlot, bblSocket, loadingPort], '#1e2430'),
    ])
  );
}

// F-02: Semi-Buckhorn Rear Sight Leaf & Stepped Elevator (`assembledPos: [14.5, 2.35, 0]`)
export function buildWin94RearSightGeometry(): THREE.BufferGeometry {
  const leaf = createChamferedBox(3.8, 0.24, 0.72, 0.03, WIN94_BLUED_STEEL);
  const ramp = createChamferedBox(1.8, 0.56, 0.68, 0.03, WIN94_BLUED_STEEL);
  ramp.translate(-0.7, 0.22, 0);
  const notchPost = createChamferedBox(0.38, 0.68, 1.12, 0.03, WIN94_BLUED_STEEL);
  notchPost.translate(-1.55, 0.42, 0);
  const vCut = createChamferedBox(0.65, 0.45, 0.28, 0.01, '#1e2430');
  vCut.translate(-1.55, 0.65, 0);
  return sanitizeWeaponMesh(csgSubtract(mergeParts([leaf, ramp, notchPost]), [vCut]));
}

// F-03: Left-Side Cavalry Saddle Ring & Bracket (`assembledPos: [-3.8, 0.2, -1.62]`)
export function buildWin94SaddleRingGeometry(): THREE.BufferGeometry {
  const stud = createBeveledCylinder(0.28, 0.28, 0.52, 0.04, 16, WIN94_SADDLE_IRON);
  stud.rotateX(Math.PI / 2);
  const loopPts: THREE.Vector3[] = [];
  const segs = 28;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    loopPts.push(new THREE.Vector3(Math.cos(a) * 0.92, Math.sin(a) * 0.92 - 0.85, -0.18));
  }
  const ring = paintGeometry(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loopPts, true), segs, 0.14, 10, true),
    WIN94_SADDLE_IRON
  );
  return sanitizeWeaponMesh(mergeParts([stud, ring]));
}

// F-04: Oiled Black Walnut Carbine Forend (`assembledPos: [21.5, 0.45, 0]`)
export function buildWin94ForendGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-15.5, -1.25);
  s.lineTo(15.5, -1.18);
  s.lineTo(15.6, 0.92);
  s.lineTo(-15.6, 1.05);
  s.closePath();

  const blank = extrudeAlongZ(s, 0, 3.05, WIN94_WALNUT, 0.28, 12);
  const bblGroove = createBeveledCylinder(0.84, 0.84, 32.2, 0.02, 20, '#1e2430');
  bblGroove.rotateZ(Math.PI / 2);
  bblGroove.translate(0, 1.0, 0);
  const magChannel = createBeveledCylinder(0.62, 0.62, 32.2, 0.02, 18, '#1e2430');
  magChannel.rotateZ(Math.PI / 2);
  magChannel.translate(0, -0.8, 0);

  return sanitizeWeaponMesh(
    csgSubtract(blank, [mergeCutters([bblGroove, magChannel], '#1e2430')])
  );
}

// F-05: Carbine Steel Forend Band & Tube Collar (`assembledPos: [36.2, 0.55, 0]`)
export function buildWin94BarrelBandsGeometry(): THREE.BufferGeometry {
  const strap = createChamferedBox(2.4, 3.35, 3.25, 0.12, WIN94_BLUED_STEEL);
  const screwBoss = createBeveledCylinder(0.32, 0.32, 3.45, 0.03, 16, WIN94_SADDLE_IRON);
  screwBoss.rotateX(Math.PI / 2);
  screwBoss.translate(0, -0.78, 0);
  const upperHole = createBeveledCylinder(0.75, 0.75, 2.8, 0.02, 20, '#1e2430');
  upperHole.rotateZ(Math.PI / 2);
  upperHole.translate(0, 0.9, 0);
  const lowerHole = createBeveledCylinder(0.56, 0.56, 2.8, 0.02, 18, '#1e2430');
  lowerHole.rotateZ(Math.PI / 2);
  lowerHole.translate(0, -0.9, 0);
  return sanitizeWeaponMesh(
    csgSubtract(mergeParts([strap, screwBoss]), [
      mergeCutters([upperHole, lowerHole], '#1e2430'),
    ])
  );
}

// F-06: Straight-Grip Black Walnut Buttstock (`assembledPos: [-22.5, -2.55, 0]`)
export function buildWin94WalnutStockGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-15.0, -5.65);
  s.lineTo(-15.0, 2.05);
  s.lineTo(10.8, 2.95);
  s.lineTo(14.8, 2.95); // Straight grip wrist upper comb
  s.lineTo(14.8, 0.25); // Straight tang receiver fit
  s.lineTo(10.2, 0.25);
  s.lineTo(-15.0, -5.65);
  s.closePath();

  const blank = extrudeAlongZ(s, 0, 2.88, WIN94_WALNUT, 0.24, 14);
  const upperMortise = createChamferedBox(4.8, 0.68, 1.56, 0.03, '#1e2430');
  upperMortise.translate(12.6, 2.85, 0);
  const lowerMortise = createChamferedBox(5.2, 0.75, 1.72, 0.03, '#1e2430');
  lowerMortise.translate(12.4, 0.35, 0);
  return sanitizeWeaponMesh(
    csgSubtract(blank, [mergeCutters([upperMortise, lowerMortise], '#1e2430')])
  );
}

// F-07: Curved Steel Carbine Buttplate (`assembledPos: [-38.4, -4.15, 0]`)
export function buildWin94ButtplateGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.55, -4.1);
  s.lineTo(0.85, -4.1);
  s.lineTo(0.85, 3.8);
  s.lineTo(0.05, 3.95);
  s.lineTo(-0.62, 3.72);
  s.lineTo(-0.28, 0.0);
  s.closePath();
  return sanitizeWeaponMesh(extrudeAlongZ(s, 0, 2.85, WIN94_BLUED_STEEL, 0.12, 12));
}

// FC-01: External Checkered Spurred Steel Hammer (`assembledPos: [-6.8, 0.45, 0]`, hinge at (0,0,0))
export function buildWin94HammerGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.48, -0.58);
  s.lineTo(0.55, -0.58);
  s.lineTo(0.68, 1.45);
  s.lineTo(0.18, 2.35);
  s.lineTo(-1.55, 2.48); // Thumb spur
  s.lineTo(-1.35, 1.92);
  s.lineTo(-0.35, 1.68);
  s.lineTo(-0.48, -0.58);
  s.closePath();
  return sanitizeWeaponMesh(extrudeAlongZ(s, 0, 0.92, WIN94_BLUED_STEEL, 0.04, 12));
}

// FC-02: Steel Curved Trigger Blade (`assembledPos: [-7.2, -1.65, 0]`)
export function buildWin94TriggerGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.52, -0.25);
  s.lineTo(0.65, -0.25);
  s.lineTo(0.65, 1.15);
  s.lineTo(-0.45, 1.15);
  s.lineTo(-0.52, -0.25);
  s.closePath();
  const top = extrudeAlongZ(s, 0, 0.56, WIN94_BLUED_STEEL, 0.03, 8);
  const shoe = createChamferedBox(0.58, 1.85, 0.44, 0.04, WIN94_BLUED_STEEL);
  shoe.rotateZ(0.28);
  shoe.translate(0.12, -1.05, 0);
  return sanitizeWeaponMesh(mergeParts([top, shoe]));
}

// FC-03: Helical Mainspring (`assembledPos: [-12.8, -0.65, 0]`, DYNAMIC SPRING: pure createHelicalSpring!)
export function buildWin94MainspringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 5.2,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.28,
      wireRadius: 0.055,
      coils: 14,
      radialSegments: 9,
      tubularSegmentsPerCoil: 16,
    }),
    WIN94_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// FC-04: Lever-Squeeze Grip Safety Tang Block (`assembledPos: [-8.4, -0.95, 0]`)
export function buildWin94TangSafetyGeometry(): THREE.BufferGeometry {
  const body = createChamferedBox(2.2, 0.58, 0.68, 0.04, WIN94_STAINLESS);
  const tab = createChamferedBox(0.75, 0.72, 0.52, 0.03, WIN94_STAINLESS);
  tab.translate(-0.62, -0.35, 0);
  return sanitizeWeaponMesh(mergeParts([body, tab]));
}

// FC-05: Helical Trigger Return / Sear Spring (`assembledPos: [-10.2, -1.55, 0]`, DYNAMIC SPRING)
export function buildWin94SearSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 2.4,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.22,
      wireRadius: 0.045,
      coils: 8,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    WIN94_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// M-01: Full-Length Seamless Tubular Magazine (`assembledPos: [30.0, -0.35, 0]`)
export function buildWin94MagTubeGeometry(): THREE.BufferGeometry {
  return sanitizeWeaponMesh(
    revolveClosedX(
      [
        [0.48, -24.5],
        [0.58, -24.5],
        [0.58, 24.45],
        [0.64, 24.45], // Threaded front plug collar
        [0.64, 24.6],
        [0.0, 24.6],
        [0.0, 23.75],
        [0.48, 23.75],
        [0.48, -24.5],
      ],
      24,
      WIN94_BLUED_STEEL
    )
  );
}

// M-02: Machined Brass/Bronze Tubular Magazine Follower (`assembledPos: [17.8, -0.35, 0]`)
export function buildWin94MagFollowerGeometry(): THREE.BufferGeometry {
  return sanitizeWeaponMesh(
    revolveClosedX(
      [
        [0.0, -1.35],
        [0.46, -1.35],
        [0.49, -1.2],
        [0.49, 1.15],
        [0.44, 1.32],
        [0.0, 1.32],
      ],
      20,
      WIN94_BRASS_CARRIER
    )
  );
}

// M-03: Helical Tubular Magazine Spring (`assembledPos: [54.0, -0.35, 0]`, DYNAMIC SPRING anchored at x=0 front plug)
export function buildWin94MagSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: -28.2,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.44,
      wireRadius: 0.058,
      coils: 34,
      radialSegments: 8,
      tubularSegmentsPerCoil: 12,
    }),
    WIN94_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// M-04: King's Patent Side Spring Loading Gate (`assembledPos: [0.3, 0.1, 1.44]`)
export function buildWin94LoadingGateGeometry(): THREE.BufferGeometry {
  const gate = createChamferedBox(4.3, 1.38, 0.24, 0.04, WIN94_BLUED_STEEL);
  const tang = createChamferedBox(1.2, 0.55, 0.18, 0.02, WIN94_BLUED_STEEL);
  tang.translate(2.2, 0.15, -0.1);
  return sanitizeWeaponMesh(mergeParts([gate, tang]));
}

// M-05: Pivoting Brass Shell Carrier Lifter (`assembledPos: [-1.4, -0.75, 0]`)
export function buildWin94CarrierGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-3.1, -0.45);
  s.lineTo(3.4, -0.45);
  s.lineTo(3.5, 0.38);
  s.lineTo(-2.8, 0.52);
  s.closePath();
  const base = extrudeAlongZ(s, 0, 1.38, WIN94_BRASS_CARRIER, 0.04, 8);
  const trough = createChamferedBox(5.6, 0.55, 0.88, 0.02, '#1e2430');
  trough.translate(0.4, 0.35, 0);
  return sanitizeWeaponMesh(csgSubtract(base, [trough]));
}
