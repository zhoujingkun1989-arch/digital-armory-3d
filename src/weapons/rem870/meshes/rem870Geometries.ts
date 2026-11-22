import * as THREE from 'three';
import {
  createBeveledCylinder,
  createChamferedBox,
  createHelicalSpring,
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

// Authentic Remington 870 Police Magnum Parkerized Steel + Hard Chrome + Oiled Walnut palette
export const REM870_PARKERIZED = '#343a40';
export const REM870_DARK_STEEL = '#2b3036';
export const REM870_HARD_CHROME = '#dfe6ef';
export const REM870_ALUMINUM_FCG = '#454c56';
export const REM870_SPRING_STEEL = '#94a3b8';
export const REM870_WALNUT = '#724629';
export const REM870_RUBBER_PAD = '#262a32';
export const REM870_ORANGE_FOLLOWER = '#ea580c';
export const REM870_WHITE_DOT = '#f1f5f9';

// B-01: Heavy 18" Improved-Cylinder Parkerized Barrel (`assembledPos: [30.75, 1.35, 0]`, x in [-22.75, +22.75])
export function buildRem870BarrelGeometry(): THREE.BufferGeometry {
  const tube = revolveClosedX(
    [
      [0.925, -22.75], // 12ga inner chamber / smoothbore wall
      [0.925, 22.75],
      [1.18, 22.75], // Heavy wall muzzle crown
      [1.26, 22.4],
      [1.28, -14.5],
      [1.46, -15.5], // Chamber reinforce swell
      [1.46, -22.55],
      [1.36, -22.75],
      [0.925, -22.75],
    ],
    28,
    REM870_PARKERIZED
  );

  // Underbarrel brazed guide ring embracing magazine cap collar (centered at x = +16.5, dy = -2.60)
  const guideRingOuter = createBeveledCylinder(
    1.48,
    1.48,
    2.6,
    0.05,
    24,
    REM870_PARKERIZED
  );
  guideRingOuter.rotateZ(Math.PI / 2);
  guideRingOuter.translate(16.5, -2.2, 0);

  const solid = mergeParts([tube, guideRingOuter]);
  const boreCut = createBeveledCylinder(0.925, 0.925, 47.0, 0.01, 24, '#1e2430');
  boreCut.rotateZ(Math.PI / 2);
  const ringHole = createBeveledCylinder(1.16, 1.16, 3.2, 0.01, 20, '#1e2430');
  ringHole.rotateZ(Math.PI / 2);
  ringHole.translate(16.5, -2.55, 0);
  const topSlot = createChamferedBox(3.4, 0.72, 1.4, 0.02, '#1e2430');
  topSlot.translate(-21.2, 1.05, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [mergeCutters([boreCut, ringHole, topSlot], '#1e2430')])
  );
}

// B-02: Ramped Tritium White-Dot Front Sight (`assembledPos: [51.8, 2.55, 0]`)
export function buildRem870FrontSightGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-1.05, -0.35);
  s.lineTo(1.02, -0.35);
  s.lineTo(0.85, 0.72);
  s.lineTo(0.28, 0.85);
  s.lineTo(-0.42, 0.25);
  s.closePath();

  const body = extrudeAlongZ(s, 0, 0.62, REM870_PARKERIZED, 0.03, 8);
  const dot = createBeveledCylinder(0.14, 0.14, 0.3, 0.02, 14, REM870_WHITE_DOT);
  dot.rotateZ(Math.PI / 2);
  dot.translate(0.18, 0.56, 0);
  return sanitizeWeaponMesh(mergeParts([body, dot]));
}

// P-01: Corn-Cob Deeply Grooved Walnut Pump Forend (`assembledPos: [23.2, -1.25, 0]`)
export function buildRem870ForendGeometry(): THREE.BufferGeometry {
  const ribs: [number, number][] = [];
  const halfLen = 8.4;
  ribs.push([1.28, -halfLen]);
  const groovCount = 12;
  const span = 14.8;
  for (let i = 0; i < groovCount; i++) {
    const x0 = -halfLen + 0.9 + (i / groovCount) * span;
    const x1 = -halfLen + 0.9 + ((i + 0.55) / groovCount) * span;
    const x2 = -halfLen + 0.9 + ((i + 0.98) / groovCount) * span;
    ribs.push([1.84, x0], [1.84, x1], [1.62, x1 + 0.08], [1.62, x2]);
  }
  ribs.push([1.82, halfLen - 0.55], [1.35, halfLen], [0.0, halfLen], [0.0, -halfLen]);

  const body = revolveClosedX(ribs, 26, REM870_WALNUT);
  const boreCut = createBeveledCylinder(1.24, 1.24, 18.0, 0.02, 22, '#1e2430');
  boreCut.rotateZ(Math.PI / 2);
  return sanitizeWeaponMesh(csgSubtract(body, [boreCut]));
}

// P-02: Twin Parallel Steel Action Bars & Forend Tube Assembly (`assembledPos: [14.2, -0.25, 0]`)
export function buildRem870ActionBarsGeometry(): THREE.BufferGeometry {
  const sleeve = revolveClosedX(
    [
      [1.18, 1.2],
      [1.26, 1.2],
      [1.26, 11.8],
      [1.38, 11.8], // Spanner nut collar
      [1.38, 12.15],
      [1.18, 12.15],
      [1.18, 1.2],
    ],
    22,
    REM870_PARKERIZED
  );
  sleeve.translate(0, -1.0, 0);

  // Left and right rigid steel flat action bars connecting forend sleeve into receiver
  const barL = createChamferedBox(18.5, 0.72, 0.24, 0.02, REM870_DARK_STEEL);
  barL.translate(-2.8, -0.35, -1.42);
  const barR = createChamferedBox(18.5, 0.72, 0.24, 0.02, REM870_DARK_STEEL);
  barR.translate(-2.8, -0.35, 1.42);
  const yokeL = createChamferedBox(0.85, 0.95, 0.46, 0.02, REM870_DARK_STEEL);
  yokeL.translate(1.4, -0.68, -1.32);
  const yokeR = createChamferedBox(0.85, 0.95, 0.46, 0.02, REM870_DARK_STEEL);
  yokeR.translate(1.4, -0.68, 1.32);

  return sanitizeWeaponMesh(mergeParts([sleeve, barL, barR, yokeL, yokeR]));
}

// P-03: Machined Steel Action-Bar Camming Slide Block (`assembledPos: [2.2, 0.35, 0]`)
export function buildRem870SlideBlockGeometry(): THREE.BufferGeometry {
  const base = createChamferedBox(5.2, 1.15, 1.85, 0.05, REM870_DARK_STEEL);
  const camRamp = createChamferedBox(2.4, 0.65, 1.18, 0.03, REM870_DARK_STEEL);
  camRamp.translate(1.1, 0.58, 0);
  const slot = createChamferedBox(2.2, 0.62, 0.85, 0.02, '#1e2430');
  slot.translate(1.2, 0.72, 0);
  return sanitizeWeaponMesh(csgSubtract(mergeParts([base, camRamp]), [slot]));
}

// P-04: Polished Hard-Chrome Breech Bolt Body (`assembledPos: [3.6, 1.35, 0]`)
export function buildRem870BreechBoltGeometry(): THREE.BufferGeometry {
  const blank = createChamferedBox(8.2, 1.56, 1.76, 0.14, REM870_HARD_CHROME);
  const extractor = createChamferedBox(2.8, 0.42, 0.22, 0.02, REM870_DARK_STEEL);
  extractor.translate(2.5, 0.22, 0.92);

  const solid = mergeParts([blank, extractor]);
  const lockWindow = createChamferedBox(2.9, 1.15, 1.25, 0.03, '#1e2430');
  lockWindow.translate(2.3, 0.55, 0);
  const fpBore = createBeveledCylinder(0.24, 0.24, 8.6, 0.02, 14, '#1e2430');
  fpBore.rotateZ(Math.PI / 2);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [mergeCutters([lockWindow, fpBore], '#1e2430')])
  );
}

// P-05: Tilting Steel Wedge Locking Block (`assembledPos: [6.4, 1.52, 0]`)
export function buildRem870LockingBlockGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-1.35, -0.58);
  s.lineTo(1.28, -0.45);
  s.lineTo(1.32, 0.78);
  s.lineTo(-0.35, 0.85);
  s.lineTo(-1.35, 0.25);
  s.closePath();
  return sanitizeWeaponMesh(extrudeAlongZ(s, 0, 1.22, REM870_DARK_STEEL, 0.04, 8));
}

// P-06: Stainless Inertia Firing Pin (`assembledPos: [3.2, 1.35, 0]`)
export function buildRem870FiringPinGeometry(): THREE.BufferGeometry {
  return sanitizeWeaponMesh(
    revolveClosedX(
      [
        [0.0, -3.95],
        [0.24, -3.95],
        [0.26, -3.88],
        [0.26, -3.15],
        [0.14, -3.05],
        [0.14, 1.8],
        [0.24, 1.88], // Spring stop shoulder
        [0.24, 2.15],
        [0.11, 2.22],
        [0.11, 3.35],
        [0.045, 3.92],
        [0.0, 3.95],
      ],
      18,
      REM870_HARD_CHROME
    )
  );
}

// F-01: Solid Machined Billet Steel Receiver (`assembledPos: [0.5, 0.15, 0]`)
export function buildRem870ReceiverGeometry(): THREE.BufferGeometry {
  const outer = createChamferedBox(16.6, 4.65, 3.4, 0.18, REM870_PARKERIZED);
  const bblColl = createBeveledCylinder(1.62, 1.62, 3.8, 0.08, 22, REM870_PARKERIZED);
  bblColl.rotateZ(Math.PI / 2);
  bblColl.translate(7.4, 1.2, 0);
  const magColl = createBeveledCylinder(1.38, 1.38, 3.2, 0.06, 20, REM870_PARKERIZED);
  magColl.rotateZ(Math.PI / 2);
  magColl.translate(7.4, -1.4, 0);

  const solid = mergeParts([outer, bblColl, magColl]);

  const innerCavity = createChamferedBox(15.2, 3.35, 2.25, 0.05, '#1e2430');
  innerCavity.translate(-0.2, 0.05, 0);
  const ejectPort = createChamferedBox(7.2, 1.75, 1.15, 0.04, '#1e2430');
  ejectPort.translate(2.6, 1.05, 1.48);
  const loadPort = createChamferedBox(8.2, 1.45, 2.0, 0.04, '#1e2430');
  loadPort.translate(1.2, -2.0, 0);
  const triggerSlot = createChamferedBox(9.8, 1.6, 1.95, 0.03, '#1e2430');
  triggerSlot.translate(-3.4, -2.0, 0);
  const bblSocket = createBeveledCylinder(1.42, 1.42, 5.2, 0.02, 20, '#1e2430');
  bblSocket.rotateZ(Math.PI / 2);
  bblSocket.translate(7.4, 1.2, 0);
  const magSocket = createBeveledCylinder(1.2, 1.2, 4.2, 0.02, 20, '#1e2430');
  magSocket.rotateZ(Math.PI / 2);
  magSocket.translate(7.4, -1.4, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [
      mergeCutters(
        [innerCavity, ejectPort, loadPort, triggerSlot, bblSocket, magSocket],
        '#1e2430'
      ),
    ])
  );
}

// F-02: Ghost-Ring / Police Rifle Rear Sight (`assembledPos: [-4.5, 2.7, 0]`)
export function buildRem870RearSightGeometry(): THREE.BufferGeometry {
  const base = createChamferedBox(2.6, 0.34, 1.15, 0.04, REM870_PARKERIZED);
  const ringLeft = createChamferedBox(0.55, 0.72, 0.32, 0.02, REM870_PARKERIZED);
  ringLeft.translate(-0.4, 0.45, -0.4);
  const ringRight = createChamferedBox(0.55, 0.72, 0.32, 0.02, REM870_PARKERIZED);
  ringRight.translate(-0.4, 0.45, 0.4);
  const bridge = createChamferedBox(0.55, 0.24, 1.12, 0.02, REM870_PARKERIZED);
  bridge.translate(-0.4, 0.72, 0);
  return sanitizeWeaponMesh(mergeParts([base, ringLeft, ringRight, bridge]));
}

// F-03: Police Oiled American Walnut Buttstock (`assembledPos: [-22.8, -2.55, 0]`)
export function buildRem870WalnutStockGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-14.8, -5.8);
  s.lineTo(-14.8, 2.25);
  s.lineTo(10.6, 2.95);
  s.lineTo(14.8, 2.55); // Semi-pistol wrist shoulder meeting receiver
  s.lineTo(14.8, -0.35);
  s.lineTo(10.2, -1.45);
  s.lineTo(7.4, -3.55);
  s.lineTo(-14.8, -5.8);
  s.closePath();

  const blank = extrudeAlongZ(s, 0, 3.16, REM870_WALNUT, 0.28, 14);
  const drawTunnel = createBeveledCylinder(0.54, 0.54, 30.8, 0.02, 16, '#1e2430');
  drawTunnel.rotateZ(Math.PI / 2);
  drawTunnel.translate(0.2, 0.7, 0);
  return sanitizeWeaponMesh(csgSubtract(blank, [drawTunnel]));
}

// F-04: Vented Rubber Police Recoil Pad (`assembledPos: [-38.8, -3.95, 0]`)
export function buildRem870ButtplateGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-1.15, -4.35);
  s.lineTo(1.25, -4.25);
  s.lineTo(1.25, 4.15);
  s.lineTo(-1.15, 3.95);
  s.closePath();
  return sanitizeWeaponMesh(extrudeAlongZ(s, 0, 3.12, REM870_RUBBER_PAD, 0.16, 10));
}

// F-05: Steel Stock Draw-Bolt & Washer (`assembledPos: [-22.5, -1.85, 0]`)
export function buildRem870StockBoltGeometry(): THREE.BufferGeometry {
  return sanitizeWeaponMesh(
    revolveClosedX(
      [
        [0.0, -12.2],
        [0.58, -12.2], // Hex head + washer
        [0.58, -11.45],
        [0.28, -11.35],
        [0.28, 11.4],
        [0.34, 11.55], // Threaded nose into receiver
        [0.34, 12.2],
        [0.0, 12.2],
      ],
      18,
      REM870_DARK_STEEL
    )
  );
}

// FC-01: Removable Dual-Pin Aluminum Police Trigger Plate (`assembledPos: [-2.2, -2.65, 0]`)
export function buildRem870TriggerPlateGeometry(): THREE.BufferGeometry {
  const topSpine = createChamferedBox(11.4, 0.92, 2.02, 0.08, REM870_ALUMINUM_FCG);
  topSpine.translate(0, 0.52, 0);
  const sGuard = new THREE.Shape();
  sGuard.moveTo(-5.2, 0.15);
  sGuard.lineTo(-0.8, 0.15);
  sGuard.lineTo(-0.5, -1.42);
  sGuard.lineTo(-5.4, -1.35);
  sGuard.closePath();
  const guardOuter = extrudeAlongZ(sGuard, 0, 1.24, REM870_ALUMINUM_FCG, 0.08, 10);
  const guardHole = createChamferedBox(3.6, 1.1, 1.6, 0.08, '#1e2430');
  guardHole.translate(-3.0, -0.58, 0);
  return sanitizeWeaponMesh(csgSubtract(mergeParts([topSpine, guardOuter]), [guardHole]));
}

// FC-02: Grooved Steel Combat Trigger & Cross-Bolt Safety (`assembledPos: [-5.4, -3.15, 0]`)
export function buildRem870TriggerGeometry(): THREE.BufferGeometry {
  const base = createChamferedBox(1.85, 1.15, 0.65, 0.03, REM870_DARK_STEEL);
  base.translate(0, 0.55, 0);
  const blade = createChamferedBox(0.62, 1.75, 0.44, 0.04, REM870_DARK_STEEL);
  blade.rotateZ(0.24);
  blade.translate(0.15, -0.45, 0);
  return sanitizeWeaponMesh(mergeParts([base, blade]));
}

// FC-03: Forged Internal Hammer (`assembledPos: [-1.4, -1.65, 0]`)
export function buildRem870HammerGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.58, -0.68);
  s.lineTo(0.62, -0.68);
  s.lineTo(1.15, 1.38);
  s.lineTo(0.55, 1.85);
  s.lineTo(-0.85, 1.28);
  s.closePath();
  return sanitizeWeaponMesh(extrudeAlongZ(s, 0, 0.78, REM870_DARK_STEEL, 0.04, 10));
}

// FC-04: Left Action-Bar Slide Lock Release Lever (`assembledPos: [-4.6, -2.55, -1.25]`)
export function buildRem870ActionReleaseGeometry(): THREE.BufferGeometry {
  const arm = createChamferedBox(3.1, 0.58, 0.24, 0.03, REM870_DARK_STEEL);
  const pad = createChamferedBox(1.15, 0.78, 0.42, 0.04, REM870_PARKERIZED);
  pad.translate(0.95, -0.18, -0.12);
  return sanitizeWeaponMesh(mergeParts([arm, pad]));
}

// FC-05: Helical Hammer Spring (`assembledPos: [-2.4, -1.35, 0]`, DYNAMIC SPRING anchored at x = 0)
export function buildRem870HammerSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 4.8,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.25,
      wireRadius: 0.048,
      coils: 14,
      radialSegments: 9,
      tubularSegmentsPerCoil: 16,
    }),
    REM870_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// FC-06: Helical Inertia Firing Pin Return Spring (`assembledPos: [4.2, 1.35, 0]`, DYNAMIC SPRING anchored at x = 0)
export function buildRem870FiringPinSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: -3.6,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.16,
      wireRadius: 0.036,
      coils: 13,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    REM870_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// M-01: Parkerized 4+1 Underbarrel Steel Magazine Tube (`assembledPos: [29.2, -1.25, 0]`)
export function buildRem870MagTubeGeometry(): THREE.BufferGeometry {
  return sanitizeWeaponMesh(
    revolveClosedX(
      [
        [0.98, -20.5],
        [1.14, -20.5],
        [1.14, 20.5],
        [0.98, 20.5],
        [0.98, -20.5],
      ],
      24,
      REM870_PARKERIZED
    )
  );
}

// M-02: Knurled Steel Magazine End-Cap (`assembledPos: [50.4, -1.25, 0]`)
export function buildRem870MagCapGeometry(): THREE.BufferGeometry {
  return sanitizeWeaponMesh(
    revolveClosedX(
      [
        [0.0, -1.55],
        [1.16, -1.55],
        [1.28, -1.4],
        [1.28, 1.32],
        [1.12, 1.55],
        [0.0, 1.55],
      ],
      24,
      REM870_PARKERIZED
    )
  );
}

// M-03: High-Visibility Orange Fluted Polymer Mag Follower (`assembledPos: [14.0, -1.25, 0]`)
export function buildRem870MagFollowerGeometry(): THREE.BufferGeometry {
  return sanitizeWeaponMesh(
    revolveClosedX(
      [
        [0.0, -1.45],
        [0.92, -1.45],
        [0.94, 0.85],
        [0.72, 1.45],
        [0.0, 1.45],
      ],
      22,
      REM870_ORANGE_FOLLOWER
    )
  );
}

// M-04: Helical Tubular Magazine Spring (`assembledPos: [50.0, -1.25, 0]`, DYNAMIC SPRING anchored at x = 0)
export function buildRem870MagSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: -36.0,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.85,
      wireRadius: 0.068,
      coils: 34,
      radialSegments: 8,
      tubularSegmentsPerCoil: 12,
    }),
    REM870_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// M-05: Hard-Chrome Pivoting Shell Carrier / Lifter (`assembledPos: [-1.5, -1.52, 0]`, hinge at (0,0,0))
export function buildRem870ShellCarrierGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.35, -0.45);
  s.lineTo(6.45, -0.42);
  s.lineTo(6.55, 0.35);
  s.lineTo(0.45, 0.48);
  s.lineTo(-0.35, 0.28);
  s.closePath();
  const base = extrudeAlongZ(s, 0, 1.72, REM870_HARD_CHROME, 0.04, 8);
  const spoonCut = createChamferedBox(4.8, 0.55, 1.12, 0.03, '#1e2430');
  spoonCut.translate(3.4, 0.32, 0);
  return sanitizeWeaponMesh(csgSubtract(base, [spoonCut]));
}
