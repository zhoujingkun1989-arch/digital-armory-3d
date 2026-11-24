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

// Authentic 1920s/WWII Thompson M1928A1 palette (strictly >= 0.018 linear albedo floor)
export const THOMPSON_BLUED_STEEL = '#29303d';
export const THOMPSON_RECEIVER_BLUE = '#2f3747';
export const THOMPSON_POLISHED_STEEL = '#c2ccd8';
export const THOMPSON_BLISH_BRONZE = '#c98e3b';
export const THOMPSON_SPRING_STEEL = '#94a3b8';
export const THOMPSON_WALNUT = '#6b3f23';
export const THOMPSON_BRASS = '#dca930';
export const THOMPSON_COPPER = '#c25923';
export const THOMPSON_FIBER_RED = '#7c3228';

// B-01: 10.5" Deeply Finned Barrel w/ 28 Radial Cooling Fins (`assembledPos: [25.8, 1.6, 0]`)
export function buildThompsonBarrelGeometry(): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [0.57, -13.3],
    [1.32, -13.3], // Threaded receiver tenon
    [1.32, -11.2],
    [1.18, -11.0],
  ];
  // 28 signature radial cooling fins across local X in [-10.8, +10.6]
  const finCount = 28;
  const xStart = -10.8;
  const xEnd = 10.6;
  const pitch = (xEnd - xStart) / finCount;
  for (let i = 0; i < finCount; i++) {
    const x0 = xStart + i * pitch;
    const x1 = x0 + pitch * 0.42;
    const x2 = x0 + pitch * 0.56;
    const x3 = x0 + pitch * 0.96;
    const rPeak = 1.24 - (i / finCount) * 0.16;
    const rRoot = 0.9 - (i / finCount) * 0.08;
    pts.push([rRoot, x0], [rPeak, x1], [rPeak, x2], [rRoot, x3]);
  }
  pts.push(
    [0.82, 10.9],
    [0.82, 13.3], // Muzzle thread seat for Cutts comp
    [0.57, 13.3],
    [0.0, 13.3],
    [0.0, -13.3]
  );

  const outer = revolveClosedX(pts, 26, THOMPSON_BLUED_STEEL);
  const bore = createRifledBarrelBoreCutter(27.4, 0.57, 0.018, 6, 1.3);
  return sanitizeWeaponMesh(csgSubtract(outer, [bore]));
}

// B-02: 4-Slot Cutts Compensator & Ring Front Sight (`assembledPos: [42.6, 1.6, 0]`)
export function buildThompsonCuttsCompGeometry(): THREE.BufferGeometry {
  const body = revolveClosedX(
    [
      [0.62, -3.6],
      [1.06, -3.6],
      [1.06, -1.6],
      [1.26, -1.2], // Expansion chamber bulge
      [1.26, 2.2],
      [1.08, 2.45],
      [1.08, 3.55],
      [0.92, 3.62],
      [0.62, 3.62],
      [0.62, -3.6],
    ],
    24,
    THOMPSON_BLUED_STEEL
  );
  const sightBoss = createChamferedBox(1.5, 1.45, 0.62, 0.04, THOMPSON_BLUED_STEEL);
  sightBoss.translate(2.55, 1.45, 0);
  const blade = createChamferedBox(0.95, 0.92, 0.18, 0.02, THOMPSON_BLUED_STEEL);
  blade.translate(2.65, 2.25, 0);
  const solid = mergeParts([body, sightBoss, blade]);

  // 4 signature upward gas compensation slots
  const slots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const sl = createChamferedBox(0.46, 1.45, 1.55, 0.03, '#1e2430');
    sl.rotateZ(-0.24);
    sl.translate(-0.75 + i * 0.72, 1.05, 0);
    slots.push(sl);
  }
  return sanitizeWeaponMesh(
    csgSubtract(solid, [mergeCutters(slots, '#1e2430')])
  );
}

// B-03: Milled Open-Bolt Breechblock (`assembledPos: [0.2, 1.6, 0]`)
export function buildThompsonBoltGeometry(): THREE.BufferGeometry {
  const body = createChamferedBox(9.4, 2.35, 2.25, 0.12, THOMPSON_POLISHED_STEEL);
  const nose = createChamferedBox(2.2, 2.05, 1.85, 0.1, THOMPSON_POLISHED_STEEL);
  nose.translate(4.6, 0, 0);
  const extractor = createChamferedBox(4.2, 0.42, 0.28, 0.03, THOMPSON_BLUED_STEEL);
  extractor.translate(3.2, 0.25, 1.12);
  const solid = mergeParts([body, nose, extractor]);

  // 72° inclined Blish H-piece cross-cut slot + rear recoil spring pocket
  const blishSlot = createChamferedBox(1.85, 2.65, 2.65, 0.03, '#1e2430');
  blishSlot.rotateZ(0.32);
  blishSlot.translate(1.4, 0.25, 0);
  const springBore = createBeveledCylinder(0.55, 0.55, 5.4, 0.02, 16, '#1e2430');
  springBore.rotateZ(Math.PI / 2);
  springBore.translate(-2.4, 0, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [mergeCutters([blishSlot, springBore], '#1e2430')])
  );
}

// B-04: Signature Patent Cast-Bronze H-Piece Blish Lock (`assembledPos: [1.6, 1.75, 0]`)
export function buildThompsonBlishLockGeometry(): THREE.BufferGeometry {
  // Iconic H-shape viewed from front/top with angled 45° side ears engaging receiver tracks!
  const crossBridge = createChamferedBox(1.55, 1.15, 2.85, 0.06, THOMPSON_BLISH_BRONZE);
  const rightEar = createChamferedBox(1.75, 2.45, 0.62, 0.07, THOMPSON_BLISH_BRONZE);
  rightEar.rotateZ(-0.55);
  rightEar.translate(0.15, 0.12, 1.25);
  const leftEar = createChamferedBox(1.75, 2.45, 0.62, 0.07, THOMPSON_BLISH_BRONZE);
  leftEar.rotateZ(-0.55);
  leftEar.translate(0.15, 0.12, -1.25);
  const topLug = createChamferedBox(1.15, 0.85, 1.05, 0.05, THOMPSON_BLISH_BRONZE);
  topLug.translate(-0.15, 0.85, 0);

  return sanitizeWeaponMesh(
    mergeParts([crossBridge, rightEar, leftEar, topLug])
  );
}

// B-05: Top-Mounted Knurled Open-Bolt Actuator Knob (`assembledPos: [0.2, 3.35, 0]`)
export function buildThompsonActuatorGeometry(): THREE.BufferGeometry {
  const bar = createChamferedBox(6.8, 0.65, 0.92, 0.05, THOMPSON_POLISHED_STEEL);
  bar.translate(0.4, -0.35, 0);
  const stem = createBeveledCylinder(0.42, 0.48, 0.92, 0.04, 18, THOMPSON_POLISHED_STEEL);
  stem.translate(-0.8, 0.25, 0);
  const knob = createBeveledCylinder(1.05, 0.96, 0.72, 0.08, 24, THOMPSON_POLISHED_STEEL);
  knob.translate(-0.8, 0.88, 0);
  const solid = mergeParts([bar, stem, knob]);

  // Iconic central V-sighting channel across top of actuator knob
  const sightSlot = createChamferedBox(2.4, 0.65, 0.42, 0.02, '#1e2430');
  sightSlot.translate(-0.8, 1.12, 0);
  return sanitizeWeaponMesh(csgSubtract(solid, [sightSlot]));
}

// B-06: Bolt-Mounted Pivoting Inertia Hammer & Floating Firing Pin (`assembledPos: [3.8, 1.6, 0]`)
export function buildThompsonHammerPinGeometry(): THREE.BufferGeometry {
  const pin = revolveClosedX(
    [
      [0.0, -1.6],
      [0.24, -1.6],
      [0.24, 0.8],
      [0.12, 1.45],
      [0.04, 1.72],
      [0.0, 1.75],
    ],
    16,
    THOMPSON_POLISHED_STEEL
  );
  const hammer = createChamferedBox(0.95, 1.45, 0.48, 0.04, THOMPSON_BLUED_STEEL);
  hammer.rotateZ(-0.22);
  hammer.translate(-1.35, -0.25, 0);
  return sanitizeWeaponMesh(mergeParts([pin, hammer]));
}

// B-07: Recoil Spring Guide Pilot & Red Fiber Buffer Disc (`assembledPos: [-8.8, 1.6, 0]`)
export function buildThompsonBufferPilotGeometry(): THREE.BufferGeometry {
  const rod = revolveClosedX(
    [
      [0.0, -3.1],
      [0.52, -3.1], // Rear receiver push-button takedown stud
      [0.52, -2.1],
      [1.18, -2.05], // Red fiber buffer flange
      [1.18, -1.35],
      [0.34, -1.3], // Long guide pilot shaft
      [0.34, 4.6],
      [0.0, 4.65],
    ],
    22,
    THOMPSON_BLUED_STEEL
  );
  const disc = createBeveledCylinder(1.24, 1.24, 0.58, 0.05, 22, THOMPSON_FIBER_RED);
  disc.rotateZ(Math.PI / 2);
  disc.translate(-1.68, 0, 0);
  return sanitizeWeaponMesh(mergeParts([rod, disc]));
}

// B-08: Open-Bolt Helical Driving Spring (`assembledPos: [-4.4, 1.6, 0]`, DYNAMIC SPRING!)
export function buildThompsonRecoilSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -5.2,
      end: 5.2,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.44,
      wireRadius: 0.072,
      coils: 22,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    THOMPSON_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// B-09: Brass-Backed Felt Blish-Lock Oiler Pads (`assembledPos: [1.8, 1.6, 0]`)
export function buildThompsonOilerGeometry(): THREE.BufferGeometry {
  const rightPad = createChamferedBox(2.4, 1.75, 0.34, 0.04, THOMPSON_BLISH_BRONZE);
  rightPad.translate(0, 0, 1.32);
  const leftPad = createChamferedBox(2.4, 1.75, 0.34, 0.04, THOMPSON_BLISH_BRONZE);
  leftPad.translate(0, 0, -1.32);
  const arch = createChamferedBox(1.8, 0.28, 2.85, 0.03, THOMPSON_BLISH_BRONZE);
  arch.translate(0, -0.82, 0);
  return sanitizeWeaponMesh(mergeParts([rightPad, leftPad, arch]));
}

// F-01: Solid Milled Billet Steel Upper Receiver (`assembledPos: [1.0, 1.5, 0]`)
export function buildThompsonReceiverGeometry(): THREE.BufferGeometry {
  const mainBody = createChamferedBox(25.0, 3.65, 3.45, 0.14, THOMPSON_RECEIVER_BLUE);
  // Characteristic stepped nose collar where finned barrel threads in
  const noseCollar = createChamferedBox(4.8, 3.15, 3.35, 0.12, THOMPSON_RECEIVER_BLUE);
  noseCollar.translate(10.2, 0.15, 0);
  // Lower transverse T-rail wings holding the 50-round Type L drum magazine!
  const drumShelf = createChamferedBox(5.2, 0.95, 4.35, 0.08, THOMPSON_BLUED_STEEL);
  drumShelf.translate(6.8, -1.7, 0);
  const solid = mergeParts([mainBody, noseCollar, drumShelf]);

  const innerBore = createChamferedBox(21.8, 2.55, 2.48, 0.04, '#1e2430');
  innerBore.translate(-0.2, 0.1, 0);
  const topActuatorSlot = createChamferedBox(15.5, 1.2, 1.12, 0.03, '#1e2430');
  topActuatorSlot.translate(0.6, 1.65, 0);
  const rightEjectPort = createChamferedBox(6.8, 1.85, 1.25, 0.04, '#1e2430');
  rightEjectPort.translate(6.6, 0.25, 1.55);
  const drumFeedCut = createChamferedBox(4.4, 1.4, 3.8, 0.03, '#1e2430');
  drumFeedCut.translate(6.8, -1.65, 0);
  const bblSocket = createBeveledCylinder(1.22, 1.22, 4.2, 0.02, 20, '#1e2430');
  bblSocket.rotateZ(Math.PI / 2);
  bblSocket.translate(11.4, 0.1, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [
      mergeCutters(
        [innerBore, topActuatorSlot, rightEjectPort, drumFeedCut, bblSocket],
        '#1e2430'
      ),
    ])
  );
}

// F-02: Lyman Adjustable Aperture Ladder Rear Sight (`assembledPos: [-8.6, 3.85, 0]`)
export function buildThompsonLymanSightGeometry(): THREE.BufferGeometry {
  const base = createChamferedBox(4.2, 0.65, 2.65, 0.06, THOMPSON_BLUED_STEEL);
  const wingL = createChamferedBox(3.4, 1.65, 0.34, 0.05, THOMPSON_BLUED_STEEL);
  wingL.translate(-0.2, 0.95, -1.12);
  const wingR = createChamferedBox(3.4, 1.65, 0.34, 0.05, THOMPSON_BLUED_STEEL);
  wingR.translate(-0.2, 0.95, 1.12);
  const ladder = createChamferedBox(0.45, 2.85, 1.48, 0.04, THOMPSON_RECEIVER_BLUE);
  ladder.translate(-1.2, 1.65, 0);
  const slideKnob = createBeveledCylinder(0.32, 0.32, 2.05, 0.03, 14, THOMPSON_POLISHED_STEEL);
  slideKnob.rotateX(Math.PI / 2);
  slideKnob.translate(-1.2, 2.25, 0);
  const solid = mergeParts([base, wingL, wingR, ladder, slideKnob]);

  const ladderWindow = createChamferedBox(0.95, 1.65, 0.68, 0.02, '#1e2430');
  ladderWindow.translate(-1.2, 1.65, 0);
  return sanitizeWeaponMesh(csgSubtract(solid, [ladderWindow]));
}

// F-03: Milled Lower Trigger Frame & Welded Closed Trigger Guard (`assembledPos: [-4.2, -1.25, 0]`)
export function buildThompsonLowerFrameGeometry(): THREE.BufferGeometry {
  const frame = createChamferedBox(17.4, 2.25, 3.05, 0.1, THOMPSON_RECEIVER_BLUE);
  frame.translate(0.2, 0.15, 0);

  // Welded closed trigger guard (front drop leg + bottom bar + rear junction!)
  const tgFront = createChamferedBox(0.56, 2.65, 1.25, 0.04, THOMPSON_BLUED_STEEL);
  tgFront.rotateZ(-0.2);
  tgFront.translate(4.65, -1.75, 0);
  const tgBottom = createChamferedBox(6.8, 0.52, 1.25, 0.04, THOMPSON_BLUED_STEEL);
  tgBottom.translate(1.45, -2.92, 0);
  const tgRear = createChamferedBox(0.68, 2.45, 1.35, 0.04, THOMPSON_BLUED_STEEL);
  tgRear.translate(-1.75, -1.75, 0);

  // Rear slide-on buttstock dovetail tail tang
  const stockTang = createChamferedBox(3.4, 1.45, 2.25, 0.08, THOMPSON_BLUED_STEEL);
  stockTang.translate(-9.4, 0.15, 0);

  const solid = mergeParts([frame, tgFront, tgBottom, tgRear, stockTang]);
  const fcgCavity = createChamferedBox(9.2, 1.65, 1.75, 0.03, '#1e2430');
  fcgCavity.translate(0.5, 0.45, 0);
  return sanitizeWeaponMesh(csgSubtract(solid, [fcgCavity]));
}

// F-04: Classic Contoured Finger-Grooved Walnut Vertical Foregrip & Mount Bar (`assembledPos: [23.5, -3.2, 0]`)
export function buildThompsonForegripGeometry(): THREE.BufferGeometry {
  // Heavy blued steel grip mount bar reaching back to receiver front nose (`local X in [-10.4, +2.8]`)
  const mountBar = createChamferedBox(13.2, 1.05, 1.55, 0.08, THOMPSON_BLUED_STEEL);
  mountBar.translate(-3.8, 3.65, 0);

  // Sculpted contoured vertical walnut foregrip with ergonomic finger swell
  const s = new THREE.Shape();
  s.moveTo(-1.35, 3.25);
  s.lineTo(1.75, 3.25);
  s.lineTo(2.35, 0.4);
  s.lineTo(1.85, -1.4);
  s.lineTo(2.3, -3.2);
  s.lineTo(1.85, -5.2);
  s.lineTo(2.15, -7.2);
  s.lineTo(0.85, -8.15);
  s.lineTo(-1.45, -7.85);
  s.lineTo(-1.85, -3.2);
  s.lineTo(-1.35, 3.25);
  s.closePath();

  const grip = extrudeAlongZ(s, 0, 2.75, THOMPSON_WALNUT, 0.28, 12);
  return sanitizeWeaponMesh(mergeParts([mountBar, grip]));
}

// F-05: Contoured American Black Walnut Rear Pistol Grip (`assembledPos: [-8.4, -5.85, 0]`)
export function buildThompsonPistolGripGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-1.35, 3.9);
  s.lineTo(2.15, 3.9);
  s.lineTo(1.8, 1.6);
  s.lineTo(1.25, -0.4);
  s.lineTo(0.85, -2.5);
  s.lineTo(0.35, -4.65);
  s.lineTo(-2.45, -4.25);
  s.lineTo(-2.85, -0.8);
  s.lineTo(-2.1, 2.2);
  s.lineTo(-1.35, 3.9);
  s.closePath();

  return sanitizeWeaponMesh(extrudeAlongZ(s, 0, 2.85, THOMPSON_WALNUT, 0.28, 12));
}

// F-06: Quick-Detach Slide-On American Black Walnut Buttstock (`assembledPos: [-25.4, -2.85, 0]`)
export function buildThompsonButtstockGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-12.8, -5.65);
  s.lineTo(-12.8, 2.25);
  s.lineTo(8.5, 4.15);
  s.lineTo(12.8, 4.15);
  s.lineTo(12.8, 0.85);
  s.lineTo(6.2, 0.15);
  s.lineTo(-12.8, -5.65);
  s.closePath();

  const body = extrudeAlongZ(s, 0, 3.45, THOMPSON_WALNUT, 0.28, 14);
  const swivel = createChamferedBox(1.8, 0.95, 0.75, 0.04, THOMPSON_BLUED_STEEL);
  swivel.translate(-8.2, -4.65, 0);
  return sanitizeWeaponMesh(mergeParts([body, swivel]));
}

// F-07: Blued Steel Trapdoor Buttplate & Front Slide Latch (`assembledPos: [-38.4, -4.15, 0]`)
export function buildThompsonButtplateGeometry(): THREE.BufferGeometry {
  const plate = createChamferedBox(0.92, 8.2, 3.52, 0.12, THOMPSON_BLUED_STEEL);
  const trapdoor = createChamferedBox(0.28, 2.4, 1.55, 0.04, THOMPSON_RECEIVER_BLUE);
  trapdoor.translate(-0.42, 0.2, 0);
  return sanitizeWeaponMesh(mergeParts([plate, trapdoor]));
}

// FC-01: Curved Milled Steel Trigger (`assembledPos: [-2.8, -2.55, 0]`)
export function buildThompsonTriggerGeometry(): THREE.BufferGeometry {
  const head = createChamferedBox(2.0, 1.05, 0.65, 0.04, THOMPSON_BLUED_STEEL);
  head.translate(0, 0.65, 0);
  const blade = createChamferedBox(0.58, 1.95, 0.52, 0.04, THOMPSON_BLUED_STEEL);
  blade.rotateZ(0.26);
  blade.translate(0.15, -0.68, 0);
  return sanitizeWeaponMesh(mergeParts([head, blade]));
}

// FC-02: Select-Fire Open-Bolt Sear & Rocker (`assembledPos: [-3.2, -0.55, 0]`)
export function buildThompsonSearGeometry(): THREE.BufferGeometry {
  const bar = createChamferedBox(3.4, 0.78, 0.88, 0.04, THOMPSON_POLISHED_STEEL);
  const nose = createChamferedBox(1.05, 0.95, 0.92, 0.04, THOMPSON_BLUED_STEEL);
  nose.translate(-1.05, 0.55, 0);
  return sanitizeWeaponMesh(mergeParts([bar, nose]));
}

// FC-03: Twin Left-Side Paddle Levers — Fire Selector & Safety (`assembledPos: [-5.2, -1.05, -1.78]`)
export function buildThompsonSelectorLeversGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const ox of [-1.45, 1.55]) {
    const boss = createBeveledCylinder(0.46, 0.46, 0.55, 0.04, 16, THOMPSON_BLUED_STEEL);
    boss.rotateX(Math.PI / 2);
    boss.translate(ox, 0, 0);
    const paddle = createChamferedBox(1.85, 0.52, 0.34, 0.04, THOMPSON_BLUED_STEEL);
    paddle.translate(ox + 0.75, 0, -0.22);
    parts.push(boss, paddle);
  }
  return sanitizeWeaponMesh(mergeParts(parts));
}

// FC-04: Left-Side Magazine & Type L Drum Catch (`assembledPos: [4.2, -0.85, -1.72]`)
export function buildThompsonMagCatchGeometry(): THREE.BufferGeometry {
  const arm = createChamferedBox(2.8, 0.68, 0.44, 0.04, THOMPSON_BLUED_STEEL);
  const thumbPad = createBeveledCylinder(0.48, 0.48, 0.52, 0.05, 16, THOMPSON_BLUED_STEEL);
  thumbPad.rotateX(Math.PI / 2);
  thumbPad.translate(-1.25, -0.25, -0.22);
  return sanitizeWeaponMesh(mergeParts([arm, thumbPad]));
}

// FC-05: Helical Trigger & Sear Return Spring (`assembledPos: [-3.8, -1.65, 0]`, `assembledRot: [0,0,Math.PI/2]`, DYNAMIC SPRING!)
export function buildThompsonSearSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.72,
      end: 0.72,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.22,
      wireRadius: 0.044,
      coils: 8,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    THOMPSON_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// M-01: 50-Round Type L Clockwork Drum Magazine Shell (`assembledPos: [7.8, -7.8, 0]`, `isShell: true`)
export function buildThompsonDrumMagGeometry(): THREE.BufferGeometry {
  const drum = createBeveledCylinder(8.25, 8.25, 4.35, 0.18, 36, THOMPSON_BLUED_STEEL);
  drum.rotateZ(Math.PI / 2);

  // Upper transverse feed neck sliding into receiver T-slots (`local Y up to +8.35 -> world Y +0.55`)
  const feedNeck = createChamferedBox(4.35, 2.25, 2.65, 0.1, THOMPSON_BLUED_STEEL);
  feedNeck.translate(0, 7.65, 0);

  const solid = mergeParts([drum, feedNeck]);
  // Hollow out circular interior chamber so cutaway/X-Ray reveals the spiral rounds & rotor cleanly!
  const innerCav = createBeveledCylinder(7.65, 7.65, 3.65, 0.04, 32, '#1e2430');
  innerCav.rotateZ(Math.PI / 2);
  const feedMouth = createChamferedBox(3.75, 2.4, 1.55, 0.03, '#1e2430');
  feedMouth.translate(0, 7.85, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [mergeCutters([innerCav, feedMouth], '#1e2430')])
  );
}

// M-02: Central 4-Arm Clockwork Rotor Spider & Front Folding Winding Key (`assembledPos: [7.8, -7.8, 0]`)
export function buildThompsonDrumRotorGeometry(): THREE.BufferGeometry {
  const hub = createBeveledCylinder(2.15, 2.15, 3.55, 0.08, 24, THOMPSON_POLISHED_STEEL);
  hub.rotateZ(Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [hub];

  // 4 radial clockwork spider arms sweeping the spiral .45 ACP track!
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.35;
    const arm = createChamferedBox(0.55, 7.3, 0.72, 0.04, THOMPSON_POLISHED_STEEL);
    arm.translate(0, 3.65, 0);
    arm.rotateX(a);
    parts.push(arm);
  }

  // Iconic exterior front-face folding steel winding key (`local X = +2.38`)
  const keyShaft = createBeveledCylinder(0.68, 0.68, 0.72, 0.05, 18, THOMPSON_BLUED_STEEL);
  keyShaft.rotateZ(Math.PI / 2);
  keyShaft.translate(2.15, 0, 0);
  const keyBlade = createChamferedBox(0.38, 6.2, 1.45, 0.06, THOMPSON_BLUED_STEEL);
  keyBlade.translate(2.55, 0, 0);
  parts.push(keyShaft, keyBlade);

  return sanitizeWeaponMesh(mergeParts(parts));
}

// M-03: Radial Spiral Array of .45 ACP 230gr Brass Cartridges (`assembledPos: [7.8, -7.8, 0]`)
export function buildThompsonDrumRoundsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Two concentric Archimedean spiral loops (24 rounds visible across outer & inner spiral tracks)
  const count = 24;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const theta = t * Math.PI * 3.25 + 0.25; // ~1.62 spiral turns
    const radius = 3.25 + t * 3.75; // 3.25 cm inner ring -> 7.00 cm outer ring
    const cy = Math.cos(theta) * radius;
    const cz = Math.sin(theta) * radius;

    const round = revolveClosedX(
      [
        [0.0, -1.62],
        [0.6, -1.62],
        [0.6, -1.45],
        [0.54, -1.4],
        [0.6, -1.3],
        [0.59, 0.66], // .45 ACP straight brass case mouth (22.8 mm)
        [0.57, 0.68],
        [0.54, 1.12], // 230 gr round-nose FMJ bullet
        [0.36, 1.48],
        [0.0, 1.62],
      ],
      12,
      THOMPSON_BRASS
    );
    round.translate(0, cy, cz);
    parts.push(round);
  }
  return sanitizeWeaponMesh(mergeParts(parts));
}

// M-04: Central Clockwork Drum Tension Mainspring (`assembledPos: [7.8, -7.8, 0]`, DYNAMIC SPRING!)
export function buildThompsonDrumSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.4,
      end: 1.4,
      centerY: 0,
      centerZ: 0,
      coilRadius: 1.32,
      wireRadius: 0.11,
      coils: 9,
      radialSegments: 8,
      tubularSegmentsPerCoil: 16,
    }),
    THOMPSON_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}
