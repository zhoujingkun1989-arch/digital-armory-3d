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

// Authentic WWII German MG 42 palette (strictly >= 0.018 linear albedo floor)
export const MG42_STAMPED_STEEL = '#2b303a';
export const MG42_PHOSPHATE_DARK = '#252a33';
export const MG42_BARREL_BLUE = '#2f3541';
export const MG42_POLISHED_STEEL = '#bcc6d4';
export const MG42_ROLLER_CHROME = '#dce3ec';
export const MG42_SPRING_STEEL = '#94a3b8';
export const MG42_BAKELITE = '#68301c';
export const MG42_FIELD_GRAY = '#4a534d';
export const MG42_BRASS = '#d9a832';
export const MG42_COPPER = '#c25b27';

// B-01: 530mm Quick-Change Rifled Barrel & Forged Barrel Extension (`assembledPos: [44.5, 1.5, 0]`)
export function buildMg42BarrelGeometry(): THREE.BufferGeometry {
  const tube = revolveClosedX(
    [
      [0.42, -29.0],
      [1.38, -29.0],
      [1.38, -22.2], // Rear barrel extension transition
      [1.26, -21.8],
      [1.26, -15.5], // Heavy chamber contour
      [1.04, -14.8],
      [0.92, 16.5],
      [0.88, 25.2], // Front bearing collar
      [0.98, 25.4],
      [0.98, 27.6],
      [0.84, 27.9],
      [0.84, 29.4],
      [0.68, 29.5],
      [0.41, 29.5],
      [0.41, 29.3],
      [0.0, 29.3],
      [0.0, -29.0],
    ],
    28,
    MG42_BARREL_BLUE
  );

  // Forged rectangular barrel locking extension (`Verriegelungsstück`) at local X in [-29.0, -22.0]
  const ext = createChamferedBox(7.0, 2.75, 2.75, 0.1, MG42_STAMPED_STEEL);
  ext.translate(-25.5, 0, 0);

  const solid = mergeParts([tube, ext]);
  const boreCutter = createRifledBarrelBoreCutter(60.0, 0.41, 0.018, 4, 1.8);
  const boltRecess = createChamferedBox(4.6, 1.65, 2.15, 0.04, '#1e2430');
  boltRecess.translate(-27.2, 0, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [mergeCutters([boreCutter, boltRecess], '#1e2430')])
  );
}

// B-02: Conical Muzzle Recoil Booster & Flash Hider (`assembledPos: [76.5, 1.5, 0]`)
export function buildMg42MuzzleBoosterGeometry(): THREE.BufferGeometry {
  const outer = revolveClosedX(
    [
      [1.08, -3.6],
      [1.82, -3.6],
      [1.82, -1.6], // Threaded shroud mount nut
      [1.56, -1.3],
      [1.56, 0.9], // Expansion gas chamber
      [1.18, 1.4],
      [1.18, 2.2],
      [1.76, 4.4], // Flared conical flash hider bell
      [1.62, 4.5],
      [1.38, 4.5],
      [0.92, 2.1],
      [0.58, 1.2], // Recoil booster nozzle throat
      [0.58, 0.5],
      [1.08, 0.2],
      [1.08, -3.6],
    ],
    28,
    MG42_PHOSPHATE_DARK
  );

  const ventA = createChamferedBox(1.8, 0.55, 3.8, 0.02, '#1e2430');
  ventA.translate(-0.2, 0, 0);
  const ventB = createChamferedBox(1.8, 3.8, 0.55, 0.02, '#1e2430');
  ventB.translate(-0.2, 0, 0);
  return sanitizeWeaponMesh(
    csgSubtract(outer, [mergeCutters([ventA, ventB], '#1e2430')])
  );
}

// B-03: Right-Side Hinged Quick-Change Barrel Latch Door (`assembledPos: [21.2, 1.5, 2.35]`)
export function buildMg42BarrelLatchGeometry(): THREE.BufferGeometry {
  const plate = createChamferedBox(8.2, 3.25, 0.42, 0.06, MG42_STAMPED_STEEL);
  const handle = createChamferedBox(3.4, 1.05, 0.85, 0.08, MG42_PHOSPHATE_DARK);
  handle.translate(-1.8, -0.35, 0.48);
  const hinge = createBeveledCylinder(0.28, 0.28, 3.3, 0.03, 14, MG42_POLISHED_STEEL);
  hinge.translate(3.85, 0, -0.05);
  return sanitizeWeaponMesh(mergeParts([plate, handle, hinge]));
}

// B-04: Twin-Roller Locking Bolt Head (`assembledPos: [10.0, 1.5, 0]`)
export function buildMg42BoltHeadGeometry(): THREE.BufferGeometry {
  const body = createChamferedBox(4.8, 2.15, 2.05, 0.16, MG42_POLISHED_STEEL);
  const faceRing = revolveClosedX(
    [
      [0.0, 2.1],
      [0.88, 2.1],
      [0.88, 2.65],
      [0.62, 2.65],
      [0.62, 2.42],
      [0.0, 2.42],
    ],
    22,
    MG42_POLISHED_STEEL
  );
  const extractor = createChamferedBox(2.4, 0.44, 0.36, 0.03, MG42_STAMPED_STEEL);
  extractor.translate(1.4, 0.15, 0.92);

  const solid = mergeParts([body, faceRing, extractor]);
  const rollerWindow = createChamferedBox(1.35, 1.55, 2.4, 0.03, '#1e2430');
  rollerWindow.translate(0.8, 0, 0);
  const wedgeTunnel = createChamferedBox(5.2, 0.95, 0.88, 0.02, '#1e2430');
  return sanitizeWeaponMesh(
    csgSubtract(solid, [mergeCutters([rollerWindow, wedgeTunnel], '#1e2430')])
  );
}

// B-05: Right-Side (+Z) Hardened Locking Roller (`assembledPos: [10.8, 1.5, 0.92]`)
export function buildMg42LockingRollersGeometry(): THREE.BufferGeometry {
  const cyl = createBeveledCylinder(0.46, 0.46, 1.48, 0.06, 22, MG42_ROLLER_CHROME);
  const axle = createBeveledCylinder(0.24, 0.24, 1.72, 0.03, 16, MG42_POLISHED_STEEL);
  return sanitizeWeaponMesh(mergeParts([cyl, axle]));
}

// B-06: Left-Side (-Z) Hardened Locking Roller (`assembledPos: [10.8, 1.5, -0.92]`)
export function buildMg42LockingRollerLeftGeometry(): THREE.BufferGeometry {
  const cyl = createBeveledCylinder(0.46, 0.46, 1.48, 0.06, 22, MG42_ROLLER_CHROME);
  const axle = createBeveledCylinder(0.24, 0.24, 1.72, 0.03, 16, MG42_POLISHED_STEEL);
  return sanitizeWeaponMesh(mergeParts([cyl, axle]));
}

// B-07: Firing Pin & Beveled Roller-Camming Locking Wedge (`assembledPos: [7.8, 1.5, 0]`)
export function buildMg42LockingWedgeGeometry(): THREE.BufferGeometry {
  const sleeve = createChamferedBox(4.2, 1.45, 0.98, 0.08, MG42_POLISHED_STEEL);
  sleeve.translate(-0.8, 0, 0);

  // Beveled front cam wedge spreading both rollers outward (±Z)
  const wedge = createChamferedBox(2.2, 1.25, 0.72, 0.08, MG42_ROLLER_CHROME);
  wedge.translate(1.85, 0, 0);

  const firingPin = revolveClosedX(
    [
      [0.0, 2.2],
      [0.18, 2.2],
      [0.18, 3.2],
      [0.08, 3.55],
      [0.0, 3.65],
    ],
    16,
    MG42_ROLLER_CHROME
  );
  return sanitizeWeaponMesh(mergeParts([sleeve, wedge, firingPin]));
}

// B-08: 550g Reciprocating Bolt Carrier w/ Top S-Cam Feed Stud (`assembledPos: [4.2, 1.5, 0]`)
export function buildMg42BoltCarrierGeometry(): THREE.BufferGeometry {
  const block = createChamferedBox(9.6, 2.25, 2.2, 0.14, MG42_STAMPED_STEEL);
  const tailTang = createChamferedBox(3.4, 1.65, 1.75, 0.1, MG42_PHOSPHATE_DARK);
  tailTang.translate(-4.2, -0.1, 0);
  // Iconic top vertical roller stud engaging top-cover S-cam feed track!
  const feedStud = createBeveledCylinder(0.44, 0.48, 1.15, 0.05, 18, MG42_ROLLER_CHROME);
  feedStud.translate(0.4, 1.55, 0);
  const searLug = createChamferedBox(2.2, 0.65, 1.25, 0.04, MG42_STAMPED_STEEL);
  searLug.translate(-1.8, -1.25, 0);

  const solid = mergeParts([block, tailTang, feedStud, searLug]);
  const springBore = createBeveledCylinder(0.68, 0.68, 5.2, 0.02, 18, '#1e2430');
  springBore.rotateZ(Math.PI / 2);
  springBore.translate(-3.8, 0, 0);
  return sanitizeWeaponMesh(csgSubtract(solid, [springBore]));
}

// B-09: Right-Flank Non-Reciprocating Folding T-Handle Charging Slide (`assembledPos: [5.5, 1.5, 2.72]`)
export function buildMg42ChargingHandleGeometry(): THREE.BufferGeometry {
  const rail = createChamferedBox(7.8, 1.15, 0.42, 0.05, MG42_STAMPED_STEEL);
  const stem = createChamferedBox(1.2, 0.85, 1.45, 0.06, MG42_PHOSPHATE_DARK);
  stem.translate(-2.4, -0.1, 0.72);
  const tGrip = createBeveledCylinder(0.46, 0.46, 2.65, 0.06, 16, MG42_PHOSPHATE_DARK);
  tGrip.translate(-2.4, -0.1, 1.42);
  return sanitizeWeaponMesh(mergeParts([rail, stem, tGrip]));
}

// B-10: Multi-Strand Braided Driving / Recoil Spring (`assembledPos: [-5.5, 1.5, 0]`, DYNAMIC SPRING!)
export function buildMg42RecoilSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -8.5,
      end: 8.5,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.56,
      wireRadius: 0.095,
      coils: 28,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    MG42_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// B-11: Rear Twist-Lock Friction-Ring Recoil Buffer (`assembledPos: [-15.2, 1.5, 0]`)
export function buildMg42RecoilBufferGeometry(): THREE.BufferGeometry {
  return sanitizeWeaponMesh(
    revolveClosedX(
      [
        [0.0, -2.8],
        [1.52, -2.8],
        [1.62, -2.2],
        [1.62, 0.8],
        [1.24, 1.0],
        [1.24, 2.45], // Impact plunger nose
        [0.92, 2.62],
        [0.0, 2.62],
      ],
      24,
      MG42_POLISHED_STEEL
    )
  );
}

// B-12: Heavy Rear Buffer Rebound Coil Spring (`assembledPos: [-16.4, 1.5, 0]`, DYNAMIC SPRING!)
export function buildMg42BufferSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -2.2,
      end: 2.2,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.92,
      wireRadius: 0.16,
      coils: 8,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    MG42_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// F-01: Monolithic Stamped-Steel Receiver & Perforated Barrel Cooling Shroud (`assembledPos: [0, 0, 0]`)
export function buildMg42ReceiverShroudGeometry(): THREE.BufferGeometry {
  // Rear stamped receiver housing (`X in [-16.8, +18.2]`)
  const receiver = createChamferedBox(35.0, 5.15, 4.65, 0.16, MG42_STAMPED_STEEL);
  receiver.translate(0.7, 1.0, 0);

  // Iconic elongated rectangular-trapezoid perforated cooling shroud (`X in [+17.8, +73.2]`)
  const shroud = createChamferedBox(55.4, 4.15, 4.1, 0.22, MG42_STAMPED_STEEL);
  shroud.translate(45.5, 1.45, 0);

  // Folding hooded front sight post at muzzle end (`X = 69.2`)
  const frontSight = createChamferedBox(1.8, 2.05, 1.15, 0.05, MG42_PHOSPHATE_DARK);
  frontSight.translate(69.2, 4.25, 0);

  // Right-flank charging handle track rib
  const chargeTrack = createChamferedBox(24.0, 1.25, 0.52, 0.05, MG42_PHOSPHATE_DARK);
  chargeTrack.translate(3.5, 1.5, 2.48);

  const solid = mergeParts([receiver, shroud, frontSight, chargeTrack]);

  // Cutters: internal bolt & barrel cavity, top feed opening, bottom ejection port, right barrel-change door, and 8 pairs of cooling vents!
  const cutters: THREE.BufferGeometry[] = [];
  const innerRec = createChamferedBox(33.5, 3.65, 3.35, 0.04, '#1e2430');
  innerRec.translate(1.2, 1.45, 0);
  cutters.push(innerRec);

  const innerShroud = createChamferedBox(56.4, 2.95, 2.95, 0.04, '#1e2430');
  innerShroud.translate(45.8, 1.5, 0);
  cutters.push(innerShroud);

  const topOpen = createChamferedBox(24.0, 1.8, 3.45, 0.03, '#1e2430');
  topOpen.translate(4.8, 3.2, 0);
  cutters.push(topOpen);

  const bottomEject = createChamferedBox(9.2, 1.6, 2.45, 0.03, '#1e2430');
  bottomEject.translate(11.8, -1.25, 0);
  cutters.push(bottomEject);

  const barrelWindow = createChamferedBox(8.6, 3.15, 1.2, 0.03, '#1e2430');
  barrelWindow.translate(21.2, 1.5, 1.95);
  cutters.push(barrelWindow);

  // 7 pairs of iconic MG 42 elongated oval cooling vents along shroud sides & top
  for (let i = 0; i < 7; i++) {
    const vx = 29.0 + i * 6.2;
    const sideVent = createChamferedBox(4.0, 1.45, 5.2, 0.25, '#1e2430');
    sideVent.translate(vx, 1.5, 0);
    cutters.push(sideVent);
    const topVent = createChamferedBox(3.8, 2.4, 1.65, 0.2, '#1e2430');
    topVent.translate(vx, 3.25, 0);
    cutters.push(topVent);
  }

  return sanitizeWeaponMesh(
    csgSubtract(solid, [mergeCutters(cutters, '#1e2430')])
  );
}

// F-02: Hinged Stamped Top Feed Cover (`assembledPos: [16.8, 3.6, 0]`, hinge at local X=0)
export function buildMg42TopCoverGeometry(): THREE.BufferGeometry {
  const shell = createChamferedBox(26.2, 1.45, 4.85, 0.14, MG42_STAMPED_STEEL);
  shell.translate(-12.4, 0.55, 0);
  const latchRear = createChamferedBox(1.8, 1.15, 2.25, 0.08, MG42_PHOSPHATE_DARK);
  latchRear.translate(-25.4, 0.35, 0);
  const solid = mergeParts([shell, latchRear]);

  const cavity = createChamferedBox(24.2, 1.05, 3.85, 0.04, '#1e2430');
  cavity.translate(-12.2, 0.12, 0);
  return sanitizeWeaponMesh(csgSubtract(solid, [cavity]));
}

// F-03: 200-2,000m Tangent Rear Sight & Flip-Up Concentric Anti-Aircraft Spider Sight (`assembledPos: [22.8, 3.95, 0]`)
export function buildMg42AaSightGeometry(): THREE.BufferGeometry {
  const base = createChamferedBox(7.8, 0.72, 2.35, 0.06, MG42_PHOSPHATE_DARK);
  base.translate(0.5, -0.1, 0);
  const leaf = createChamferedBox(4.8, 0.42, 1.25, 0.04, MG42_STAMPED_STEEL);
  leaf.translate(-1.2, 0.45, 0);
  const post = createChamferedBox(0.45, 1.25, 0.55, 0.03, MG42_STAMPED_STEEL);
  post.translate(3.0, 0.82, 0);

  // Concentric anti-aircraft spider ring (`Fliegervisier`) centered at local (3.0, 2.55, 0)
  const mkRing = (r: number, tubeR: number): THREE.BufferGeometry => {
    const pts: THREE.Vector3[] = [];
    const segs = 28;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(3.0, 2.55 + Math.cos(a) * r, Math.sin(a) * r));
    }
    return paintGeometry(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), segs, tubeR, 8, true),
      MG42_STAMPED_STEEL
    );
  };

  const outerRing = mkRing(1.55, 0.11);
  const innerRing = mkRing(0.82, 0.08);
  const vSpoke = createChamferedBox(0.14, 3.1, 0.14, 0.01, MG42_STAMPED_STEEL);
  vSpoke.translate(3.0, 2.55, 0);
  const hSpoke = createChamferedBox(0.14, 0.14, 3.1, 0.01, MG42_STAMPED_STEEL);
  hSpoke.translate(3.0, 2.55, 0);

  return sanitizeWeaponMesh(
    mergeParts([base, leaf, post, outerRing, innerRing, vSpoke, hSpoke])
  );
}

// F-04: Zweibein 42 Folding Stamped-Steel Bipod (`assembledPos: [64.5, -1.55, 0]`)
export function buildMg42BipodGeometry(): THREE.BufferGeometry {
  const yoke = createChamferedBox(3.6, 2.05, 4.85, 0.12, MG42_STAMPED_STEEL);
  yoke.translate(0, 0.65, 0);

  const legs: THREE.BufferGeometry[] = [yoke];
  for (const sgn of [-1, 1]) {
    const leg = createChamferedBox(24.5, 0.95, 0.72, 0.06, MG42_PHOSPHATE_DARK);
    leg.rotateY(sgn * 0.06);
    leg.rotateZ(-0.04);
    leg.translate(-12.2, -0.55, sgn * 2.55);
    legs.push(leg);

    const spade = createChamferedBox(2.4, 2.6, 1.35, 0.06, MG42_STAMPED_STEEL);
    spade.translate(-24.2, -1.05, sgn * 3.15);
    legs.push(spade);
  }
  return sanitizeWeaponMesh(mergeParts(legs));
}

// F-05: Twist-Lock Marbled Bakelite / Laminated Wood Buttstock (`assembledPos: [-28.8, -0.35, 0]`)
export function buildMg42ButtstockGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-12.1, -5.2);
  s.lineTo(-12.1, 3.15);
  s.lineTo(4.2, 3.25);
  s.lineTo(10.5, 3.45);
  s.lineTo(12.2, 3.35);
  s.lineTo(12.2, 0.25);
  s.lineTo(6.5, 0.05);
  s.lineTo(2.4, -2.55);
  s.lineTo(-12.1, -5.2);
  s.closePath();

  const stock = extrudeAlongZ(s, 0, 3.85, MG42_BAKELITE, 0.24, 14);
  const collar = createBeveledCylinder(1.85, 1.95, 2.2, 0.08, 22, MG42_STAMPED_STEEL);
  collar.rotateZ(Math.PI / 2);
  collar.translate(11.6, 1.85, 0);
  const buttplate = createChamferedBox(0.85, 8.55, 3.92, 0.1, MG42_PHOSPHATE_DARK);
  buttplate.translate(-12.1, -1.02, 0);

  return sanitizeWeaponMesh(mergeParts([stock, collar, buttplate]));
}

// FC-01: Stamped Grip Frame, Bakelite Scales & Welded Closed Trigger Guard (`assembledPos: [-2.2, -3.95, 0]`)
export function buildMg42GripFrameGeometry(): THREE.BufferGeometry {
  const upperBox = createChamferedBox(10.4, 2.35, 2.85, 0.1, MG42_STAMPED_STEEL);
  upperBox.translate(0, 1.25, 0);

  // Angled pistol grip spine + bakelite scales
  const gripS = new THREE.Shape();
  gripS.moveTo(-4.8, 0.3);
  gripS.lineTo(-1.0, 0.3);
  gripS.lineTo(-2.6, -5.65);
  gripS.lineTo(-5.8, -5.45);
  gripS.closePath();
  const grip = extrudeAlongZ(gripS, 0, 2.75, MG42_BAKELITE, 0.18, 10);

  // Welded closed-loop winter trigger guard (front leg + bottom bar + rear junction into grip!)
  const tgFront = createChamferedBox(0.62, 2.75, 1.25, 0.04, MG42_STAMPED_STEEL);
  tgFront.rotateZ(-0.22);
  tgFront.translate(4.35, -0.95, 0);
  const tgBottom = createChamferedBox(6.8, 0.56, 1.25, 0.04, MG42_STAMPED_STEEL);
  tgBottom.translate(1.15, -2.18, 0);

  // Cross-bolt safety button (`S / F`)
  const safety = createBeveledCylinder(0.38, 0.38, 3.35, 0.04, 16, MG42_POLISHED_STEEL);
  safety.rotateX(Math.PI / 2);
  safety.translate(-2.4, 1.25, 0);

  return sanitizeWeaponMesh(
    mergeParts([upperBox, grip, tgFront, tgBottom, safety])
  );
}

// FC-02: Full-Auto Curved Steel Trigger (`assembledPos: [-0.2, -3.15, 0]`)
export function buildMg42TriggerGeometry(): THREE.BufferGeometry {
  const top = createChamferedBox(2.2, 1.1, 0.68, 0.04, MG42_STAMPED_STEEL);
  top.translate(0, 0.65, 0);
  const blade = createChamferedBox(0.64, 2.05, 0.52, 0.04, MG42_PHOSPHATE_DARK);
  blade.rotateZ(0.24);
  blade.translate(0.15, -0.75, 0);
  return sanitizeWeaponMesh(mergeParts([top, blade]));
}

// FC-03: Case-Hardened Open-Bolt Sear Catch (`assembledPos: [-2.2, -1.1, 0]`)
export function buildMg42SearGeometry(): THREE.BufferGeometry {
  const bar = createChamferedBox(3.6, 0.85, 0.92, 0.05, MG42_POLISHED_STEEL);
  const catchNose = createChamferedBox(1.15, 1.05, 0.96, 0.05, MG42_STAMPED_STEEL);
  catchNose.translate(-1.1, 0.62, 0);
  return sanitizeWeaponMesh(mergeParts([bar, catchNose]));
}

// FC-04: Helical Sear Return Spring (`assembledPos: [-1.4, -2.25, 0]`, `assembledRot: [0, 0, Math.PI/2]`, DYNAMIC SPRING!)
export function buildMg42SearSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.75,
      end: 0.75,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.24,
      wireRadius: 0.048,
      coils: 8,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    MG42_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// M-01: Hinged Stamped-Steel 7.92mm Belt Feed Tray (`assembledPos: [11.8, 2.55, 0]`)
export function buildMg42FeedTrayGeometry(): THREE.BufferGeometry {
  const tray = createChamferedBox(8.8, 0.55, 6.8, 0.06, MG42_STAMPED_STEEL);
  const stopWall = createChamferedBox(8.4, 1.05, 0.45, 0.04, MG42_PHOSPHATE_DARK);
  stopWall.translate(0, 0.42, 3.15);
  const solid = mergeParts([tray, stopWall]);
  const passSlot = createChamferedBox(6.8, 0.9, 2.2, 0.02, '#1e2430');
  passSlot.translate(-0.2, 0.1, 0);
  return sanitizeWeaponMesh(csgSubtract(solid, [passSlot]));
}

// M-02: Top-Cover S-Cam Feed Arm & Dual Shuttle Belt Feed Pawls (`assembledPos: [10.8, 3.3, 0]`)
export function buildMg42FeedPawlGeometry(): THREE.BufferGeometry {
  const arm = createChamferedBox(7.8, 0.48, 1.45, 0.05, MG42_POLISHED_STEEL);
  arm.translate(-1.6, 0.22, 0);
  const shuttle = createChamferedBox(4.8, 0.56, 5.2, 0.05, MG42_POLISHED_STEEL);
  shuttle.translate(0.9, -0.18, 0);
  const pawlA = createChamferedBox(1.8, 0.62, 0.52, 0.03, MG42_STAMPED_STEEL);
  pawlA.translate(0.9, -0.45, -1.65);
  const pawlB = createChamferedBox(1.8, 0.62, 0.52, 0.03, MG42_STAMPED_STEEL);
  pawlB.translate(0.9, -0.45, 1.25);
  return sanitizeWeaponMesh(mergeParts([arm, shuttle, pawlA, pawlB]));
}

// M-03: Gurt 34 Steel Belt Links w/ 7.92×57mm Mauser Brass Rounds (`assembledPos: [11.8, 1.35, -3.6]`)
export function buildMg42AmmoBeltGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    // Gentle catenary drape from feed tray (Z=+3.4, Y=+1.35) down into side drum mouth (Z=-2.6, Y=-2.1)
    const cz = 3.4 - t * 6.0;
    const cy = 1.35 - Math.pow(t, 1.45) * 3.3;

    const round = revolveClosedX(
      [
        [0.0, -4.1],
        [0.59, -4.1],
        [0.59, -3.9],
        [0.53, -3.85],
        [0.59, -3.72],
        [0.55, 0.45], // Shoulder
        [0.45, 1.1], // Neck
        [0.45, 1.6],
        [0.41, 1.65], // 7.92mm s.S. Spitzer bullet
        [0.36, 2.7],
        [0.14, 3.75],
        [0.0, 4.1],
      ],
      14,
      MG42_BRASS
    );
    round.translate(0, cy, cz);
    parts.push(round);

    const link = createChamferedBox(3.4, 1.26, 1.36, 0.04, MG42_PHOSPHATE_DARK);
    link.translate(-0.8, cy, cz);
    parts.push(link);
  }
  return sanitizeWeaponMesh(mergeParts(parts));
}

// M-04: Gurttrommel 34 Side-Hung 50-Round Stamped-Steel Assault Drum (`assembledPos: [11.8, -2.2, -6.4]`)
export function buildMg42AmmoDrumGeometry(): THREE.BufferGeometry {
  const drum = createBeveledCylinder(5.4, 5.4, 8.9, 0.22, 28, MG42_FIELD_GRAY);
  drum.rotateZ(Math.PI / 2);
  drum.translate(0, -1.0, 0);

  // Angled upper feed neck clipping onto left (-Z) receiver feed opening
  const neck = createChamferedBox(8.6, 4.6, 3.2, 0.14, MG42_FIELD_GRAY);
  neck.rotateX(0.42);
  neck.translate(0, 3.4, 1.85);

  const latch = createChamferedBox(5.2, 1.15, 1.25, 0.06, MG42_STAMPED_STEEL);
  latch.translate(0, 4.4, 2.85);

  return sanitizeWeaponMesh(mergeParts([drum, neck, latch]));
}
