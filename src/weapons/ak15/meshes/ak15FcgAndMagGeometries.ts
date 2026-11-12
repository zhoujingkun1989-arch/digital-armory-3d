import * as THREE from 'three';
import {
  csgSubtract,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import { applyAkMagUVs } from './ak15UvAtlasHelper';

const AK_DARK_STEEL = '#454f5e';
const AK_STEEL_HIGHLIGHT = '#586476';
const AK_INNER_DARK = '#252b35';
const AK_BRIGHT_STEEL = '#d8e0ea';
const AK_SPRING_METAL = '#94a3b8';
const AK_POLYMER = '#323842';
const AK_POLYMER_ACCENT = '#282d36';
const AK_FOLLOWER_RED = '#ea580c';

/**
 * FC-01: Kalashnikov Rotary Hammer & Braided Dual-Leg Torsion Spring (assembledPos: [-0.35, -0.05, 0])
 * Pivot is at local (0, 0, 0) so rotating around Z (rz < 0) swings the hammer forward (+X) into the firing pin!
 */
export function buildAkHammerGeometry(): THREE.BufferGeometry {
  // Tubular pivot sleeve w/ axle bore along Z
  const hubOuter = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 1.1, 18).rotateX(Math.PI / 2),
    AK_BRIGHT_STEEL
  );
  const hubBore = paintGeometry(
    new THREE.CylinderGeometry(0.125, 0.125, 1.3, 14).rotateX(Math.PI / 2),
    AK_INNER_DARK
  );
  const hub = csgSubtract(hubOuter, [hubBore]);

  // Machined AK rotary hammer head w/ primary sear step, disconnector hook notch & striking face
  const hammerShape = new THREE.Shape();
  hammerShape.moveTo(-0.24, -0.04);
  hammerShape.lineTo(0.24, -0.18); // Lower primary double-hook sear engagement step!
  hammerShape.lineTo(0.32, -0.06);
  hammerShape.lineTo(0.34, 0.56);
  hammerShape.lineTo(0.2, 1.1); // Chamfered striking face
  hammerShape.lineTo(-0.34, 1.02); // Rear cocking cam contour
  hammerShape.lineTo(-0.48, 0.48); // Upper disconnector catch hook!
  hammerShape.lineTo(-0.38, 0.36);
  hammerShape.closePath();

  const rawHead = new THREE.ExtrudeGeometry(hammerShape, {
    depth: 0.48,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  rawHead.translate(0, 0, -0.24);
  paintGeometry(rawHead, AK_BRIGHT_STEEL);

  // Side weight-relief scallops on hammer cheeks before cocked rotation
  const scallopL = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.08, 16)
      .rotateX(Math.PI / 2)
      .translate(-0.04, 0.62, -0.25),
    AK_DARK_STEEL
  );
  const scallopR = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.08, 16)
      .rotateX(Math.PI / 2)
      .translate(-0.04, 0.62, 0.25),
    AK_DARK_STEEL
  );
  const head = csgSubtract(rawHead, [scallopL, scallopR]);
  // Cocked-flat angle resting rearward on primary sear (worldY_max <= +0.54, well below bolt & carrier!)
  head.rotateZ(1.34);

  // Braided dual-coil torsion spring sleeves coaxial with hammer hub (stationary wire legs sit on trigger!)
  const coilL = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.54,
      end: -0.28,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.34,
      wireRadius: 0.036,
      coils: 4,
    }).rotateX(Math.PI / 2),
    AK_SPRING_METAL
  );
  const coilR = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.28,
      end: 0.54,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.34,
      wireRadius: 0.036,
      coils: 4,
    }).rotateX(Math.PI / 2),
    AK_SPRING_METAL
  );
  const loopBridge = paintGeometry(
    new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8)
      .translate(0.16, 0.42, 0)
      .rotateZ(1.34),
    AK_SPRING_METAL
  );

  return mergeParts([hub, head, coilL, coilR, loopBridge]);
}

/**
 * FC-02: Curved Trigger & Double-Hook Primary Sear (assembledPos: [-2.15, -0.35, 0])
 * Pivot at local (0, 0, 0): trigger shoe hangs down (-Y), dual figure-8 sear hooks extend forward (+X, +Y).
 */
export function buildAkTriggerGeometry(): THREE.BufferGeometry {
  const sleeveOuter = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 1.12, 16).rotateX(Math.PI / 2),
    AK_DARK_STEEL
  );
  const sleeveBore = paintGeometry(
    new THREE.CylinderGeometry(0.115, 0.115, 1.3, 14).rotateX(Math.PI / 2),
    AK_INNER_DARK
  );
  const pivotSleeve = csgSubtract(sleeveOuter, [sleeveBore]);

  // Curved ergonomic finger shoe hanging down into trigger guard
  const shoeCurve = new THREE.Shape();
  shoeCurve.moveTo(-0.18, -0.1);
  shoeCurve.lineTo(0.22, -0.1);
  shoeCurve.quadraticCurveTo(0.06, -0.94, 0.32, -1.55);
  shoeCurve.lineTo(0.08, -1.66);
  shoeCurve.quadraticCurveTo(-0.28, -0.98, -0.18, -0.1);
  shoeCurve.closePath();

  const shoe = new THREE.ExtrudeGeometry(shoeCurve, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  shoe.translate(0, 0, -0.21);
  paintGeometry(shoe, AK_DARK_STEEL);

  // Twin figure-8 forward primary sear claws flanking the central disconnector trough!
  const searProfile = new THREE.Shape();
  searProfile.moveTo(-0.46, -0.08);
  searProfile.lineTo(0.88, -0.04);
  searProfile.lineTo(0.92, 0.44); // Forward primary sear nose
  searProfile.lineTo(0.68, 0.46); // Crisp sear engagement hook lip!
  searProfile.lineTo(0.62, 0.26);
  searProfile.lineTo(-0.46, 0.16);
  searProfile.closePath();

  const hookL = new THREE.ExtrudeGeometry(searProfile, {
    depth: 0.17,
    bevelEnabled: false,
  });
  hookL.translate(0, 0, -0.37);
  paintGeometry(hookL, AK_DARK_STEEL);

  const hookR = new THREE.ExtrudeGeometry(searProfile, {
    depth: 0.17,
    bevelEnabled: false,
  });
  hookR.translate(0, 0, 0.2);
  paintGeometry(hookR, AK_DARK_STEEL);

  // Rear selector-blocking tail & spring pocket base + stationary braided hammer-spring legs resting on trigger ears!
  const rearTail = paintGeometry(
    new THREE.BoxGeometry(0.78, 0.22, 0.72).translate(-0.4, -0.02, 0),
    AK_DARK_STEEL
  );
  const springLegL = paintGeometry(
    new THREE.CylinderGeometry(0.036, 0.036, 1.92, 8)
      .rotateZ(Math.PI / 2 + 0.12)
      .translate(0.85, 0.21, -0.44),
    AK_SPRING_METAL
  );
  const springLegR = paintGeometry(
    new THREE.CylinderGeometry(0.036, 0.036, 1.92, 8)
      .rotateZ(Math.PI / 2 + 0.12)
      .translate(0.85, 0.21, 0.44),
    AK_SPRING_METAL
  );

  return mergeParts([
    pivotSleeve,
    shoe,
    hookL,
    hookR,
    rearTail,
    springLegL,
    springLegR,
  ]);
}

/**
 * FC-03: Central Semi-Auto Disconnector & Spring (assembledPos: [-2.35, -0.15, 0])
 */
export function buildAkDisconnectorGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.45, -0.24);
  shape.lineTo(0.46, -0.24);
  shape.lineTo(0.58, 0.34);
  shape.lineTo(0.24, 0.58); // Sharp forward hammer-catching hook!
  shape.lineTo(0.18, 0.42);
  shape.lineTo(0.02, 0.34);
  shape.lineTo(-0.42, 0.12);
  shape.closePath();

  const rawPlate = new THREE.ExtrudeGeometry(shape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  rawPlate.translate(0, 0, -0.11);
  paintGeometry(rawPlate, AK_BRIGHT_STEEL);

  // Pivot pin hole coaxial with trigger axle
  const pivotHole = paintGeometry(
    new THREE.CylinderGeometry(0.115, 0.115, 0.4, 14)
      .rotateX(Math.PI / 2)
      .translate(0.2, -0.14, 0),
    AK_INNER_DARK
  );
  const plate = csgSubtract(rawPlate, [pivotHole]);

  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.48,
      end: -0.06,
      centerX: -0.24,
      centerZ: 0,
      coilRadius: 0.088,
      wireRadius: 0.022,
      coils: 5.5,
    }),
    AK_SPRING_METAL
  );

  return mergeParts([plate, spring]);
}

/**
 * FC-04: Ratnik 6P71M Ambidextrous Safety/Fire Selector w/ Index-Finger Shelf (assembledPos: [-3.85, 0.35, 0])
 */
export function buildAkSelectorGeometry(): THREE.BufferGeometry {
  // Cross-receiver splined selector axle + internal FCG blocking sector cam lug
  const crossAxle = paintGeometry(
    new THREE.CylinderGeometry(0.155, 0.155, 1.82, 16).rotateX(Math.PI / 2),
    AK_DARK_STEEL
  );
  const internalSectorCam = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.46, 0.64).translate(0.36, -0.22, -0.08),
    AK_BRIGHT_STEEL
  );

  // Contoured stamped right-side Kalashnikov safety/dust-seal lever plate
  const leverProfile = new THREE.Shape();
  leverProfile.moveTo(-0.28, -0.24);
  leverProfile.lineTo(4.42, -0.06);
  leverProfile.lineTo(4.56, 0.14);
  leverProfile.lineTo(4.36, 0.38);
  leverProfile.lineTo(0.45, 0.34);
  leverProfile.lineTo(-0.28, 0.24);
  leverProfile.closePath();

  const rightLever = new THREE.ExtrudeGeometry(leverProfile, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  rightLever.translate(0, 0, 0.83);
  paintGeometry(rightLever, AK_DARK_STEEL);

  // Stamped longitudinal stiffening rib + hemispherical detent bump + pivot keyhole cap
  const stiffeningRib = paintGeometry(
    new THREE.BoxGeometry(3.55, 0.16, 0.05)
      .rotateZ(0.03)
      .translate(2.15, 0.12, 0.92),
    AK_STEEL_HIGHLIGHT
  );
  const detentDimple = paintGeometry(
    new THREE.SphereGeometry(0.08, 10, 8).translate(4.32, 0.06, 0.84),
    AK_BRIGHT_STEEL
  );
  const rightPivotCap = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 0.12, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.87),
    AK_STEEL_HIGHLIGHT
  );

  // Iconic AK-15 Extended Index-Finger Tactical Shelf w/ non-slip serration ribs!
  const indexShelf = paintGeometry(
    new THREE.BoxGeometry(1.24, 0.12, 0.38).translate(1.52, -0.16, 1.02),
    AK_STEEL_HIGHLIGHT
  );
  const shelfRibs: THREE.BufferGeometry[] = [];
  for (let s = -2; s <= 2; s++) {
    shelfRibs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.07, 0.04, 0.34).translate(
          1.52 + s * 0.2,
          -0.09,
          1.03
        ),
        AK_BRIGHT_STEEL
      )
    );
  }

  // Left-side ergonomic thumb selector lever above pistol grip
  const leftThumbLever = paintGeometry(
    new THREE.BoxGeometry(1.42, 0.32, 0.16)
      .rotateZ(-0.22)
      .translate(-0.5, -0.16, -0.92),
    AK_DARK_STEEL
  );
  const leftThumbPad = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.42, 0.24)
      .rotateZ(-0.22)
      .translate(-1.08, -0.29, -0.96),
    AK_STEEL_HIGHLIGHT
  );

  return mergeParts([
    crossAxle,
    internalSectorCam,
    rightLever,
    stiffeningRib,
    detentDimple,
    rightPivotCap,
    indexShelf,
    ...shelfRibs,
    leftThumbLever,
    leftThumbPad,
  ]);
}

// Authentic 7.62×39mm banana curve parameters (strictly preserved for applyAkMagUVs!):
// Arc center in local coords: (ARC_CX = 11.8, ARC_CY = 0.25), R_mid = 11.85
const ARC_CX = 11.8;
const ARC_CY = 0.25;
const ARC_R_INNER = 10.65;
const ARC_R_OUTER = 13.05;
const ARC_ANG_START = -0.02;
const ARC_ANG_END = 0.88;

/**
 * M-01: 30-Round 7.62×39mm Windowed Curved Polymer Magazine Body w/ Steel Locking Lugs & Feed Lips
 * (assembledPos: [2.55, -0.55, 0])
 */
export function buildAkMagBodyGeometry(): THREE.BufferGeometry {
  const banana = new THREE.Shape();
  const steps = 28;

  // Outer (rear/back) convex spine from top (angStart) to bottom (angEnd)
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const ang = ARC_ANG_START + (ARC_ANG_END - ARC_ANG_START) * u;
    const px = ARC_CX - Math.cos(ang) * ARC_R_OUTER;
    const py = ARC_CY - Math.sin(ang) * ARC_R_OUTER;
    if (i === 0) banana.moveTo(px, py);
    else banana.lineTo(px, py);
  }
  // Inner (front) concave curve from bottom back to top
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    const ang = ARC_ANG_START + (ARC_ANG_END - ARC_ANG_START) * u;
    const px = ARC_CX - Math.cos(ang) * ARC_R_INNER;
    const py = ARC_CY - Math.sin(ang) * ARC_R_INNER;
    banana.lineTo(px, py);
  }
  banana.closePath();

  const rawBody = new THREE.ExtrudeGeometry(banana, {
    depth: 1.16,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  rawBody.translate(0, 0, -0.58);
  paintGeometry(rawBody, AK_POLYMER);

  // Curved polycarbonate window recess shape following the exact banana arc (v ∈ [0.22, 0.78], u ∈ [0.40, 0.60])!
  const winShape = new THREE.Shape();
  const winSteps = 16;
  const wAng0 = 0.16;
  const wAng1 = 0.7;
  const wRIn = 11.55;
  const wROut = 12.15;
  for (let i = 0; i <= winSteps; i++) {
    const ang = wAng0 + ((wAng1 - wAng0) * i) / winSteps;
    const wx = ARC_CX - Math.cos(ang) * wROut;
    const wy = ARC_CY - Math.sin(ang) * wROut;
    if (i === 0) winShape.moveTo(wx, wy);
    else winShape.lineTo(wx, wy);
  }
  for (let i = winSteps; i >= 0; i--) {
    const ang = wAng0 + ((wAng1 - wAng0) * i) / winSteps;
    const wx = ARC_CX - Math.cos(ang) * wRIn;
    const wy = ARC_CY - Math.sin(ang) * wRIn;
    winShape.lineTo(wx, wy);
  }
  winShape.closePath();

  const winCutR = new THREE.ExtrudeGeometry(winShape, {
    depth: 0.12,
    bevelEnabled: false,
  });
  winCutR.translate(0, 0, 0.56);
  paintGeometry(winCutR, AK_POLYMER_ACCENT);

  const winCutL = new THREE.ExtrudeGeometry(winShape, {
    depth: 0.12,
    bevelEnabled: false,
  });
  winCutL.translate(0, 0, -0.68);
  paintGeometry(winCutL, AK_POLYMER_ACCENT);

  // Hollow top feed throat so follower & cartridges remain visible through open steel feed lips!
  const throatCut = paintGeometry(
    new THREE.BoxGeometry(1.92, 1.85, 0.86).translate(-0.05, 0.15, 0),
    AK_POLYMER_ACCENT
  );

  const sculpted = csgSubtract(rawBody, [throatCut, winCutR, winCutL]);

  // Molded tactile grip ribs along front & rear spines (avoiding the center window!)
  const extras: THREE.BufferGeometry[] = [sculpted];
  for (let r = 1; r <= 6; r++) {
    const ang = 0.14 + r * 0.105;
    // Front concave spine grip ribs
    const fx = ARC_CX - Math.cos(ang) * 10.95;
    const fy = ARC_CY - Math.sin(ang) * 10.95;
    extras.push(
      paintGeometry(
        new THREE.BoxGeometry(0.62, 0.16, 1.3)
          .rotateZ(ang)
          .translate(fx, fy, 0),
        AK_POLYMER_ACCENT
      )
    );
    // Rear convex spine grip ribs
    const bx = ARC_CX - Math.cos(ang) * 12.75;
    const by = ARC_CY - Math.sin(ang) * 12.75;
    extras.push(
      paintGeometry(
        new THREE.BoxGeometry(0.62, 0.16, 1.3)
          .rotateZ(ang)
          .translate(bx, by, 0),
        AK_POLYMER_ACCENT
      )
    );
  }

  // Embedded Rock-and-Lock Steel Front Hook Lug, Rear Catch Tooth & Open Left/Right Steel Feed Lips!
  // (Painted AK_BRIGHT_STEEL so cr > 0.42 routes them cleanly to steel swatch in applyAkMagUVs!)
  extras.push(
    // Front steel trunnion hook lug
    paintGeometry(
      new THREE.BoxGeometry(0.42, 0.36, 0.94)
        .rotateZ(-0.12)
        .translate(1.2, -0.38, 0),
      AK_BRIGHT_STEEL
    ),
    // Rear triangular steel paddle-catch locking tooth
    paintGeometry(
      new THREE.BoxGeometry(0.46, 0.3, 0.88)
        .rotateZ(0.22)
        .translate(-1.34, -0.64, 0),
      AK_BRIGHT_STEEL
    ),
    // Left steel-reinforced feed lip (curved inward at top while leaving center presentation channel open!)
    paintGeometry(
      new THREE.BoxGeometry(2.12, 0.28, 0.22)
        .rotateX(0.26)
        .translate(-0.05, 0.56, -0.41),
      AK_BRIGHT_STEEL
    ),
    // Right steel-reinforced feed lip
    paintGeometry(
      new THREE.BoxGeometry(2.12, 0.28, 0.22)
        .rotateX(-0.26)
        .translate(-0.05, 0.56, 0.41),
      AK_BRIGHT_STEEL
    ),
    // Front steel cartridge bullet-tip guide collar
    paintGeometry(
      new THREE.BoxGeometry(0.24, 0.32, 0.96).translate(0.95, 0.44, 0),
      AK_BRIGHT_STEEL
    )
  );

  return applyAkMagUVs(mergeParts(extras));
}

/**
 * M-02: Anti-Tilt Red/Orange Polymer Follower (assembledPos: [2.65, -1.65, 0])
 */
export function buildAkMagFollowerGeometry(): THREE.BufferGeometry {
  const topPlatform = paintGeometry(
    new THREE.BoxGeometry(2.05, 0.24, 0.82)
      .rotateZ(0.1)
      .translate(0, 0.15, 0),
    AK_FOLLOWER_RED
  );
  // Staggered double-column cartridge stacking ridge on left side
  const cartridgeRidge = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 1.96, 14)
      .rotateZ(Math.PI / 2 + 0.1)
      .translate(0, 0.3, -0.18),
    AK_FOLLOWER_RED
  );
  const frontSkirt = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.98, 0.78)
      .rotateZ(0.14)
      .translate(0.92, -0.34, 0),
    AK_FOLLOWER_RED
  );
  const rearSkirt = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.98, 0.78)
      .rotateZ(0.14)
      .translate(-0.92, -0.34, 0),
    AK_FOLLOWER_RED
  );
  const springBoss = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.26, 0.42)
      .rotateZ(0.1)
      .translate(0, -0.1, 0),
    AK_FOLLOWER_RED
  );
  return mergeParts([
    topPlatform,
    cartridgeRidge,
    frontSkirt,
    rearSkirt,
    springBoss,
  ]);
}

/**
 * M-03: Curved Rectangular Magazine Spring following the exact 7.62×39mm banana arc! (assembledPos: [2.55, -0.55, 0])
 */
export function buildAkMagSpringGeometry(): THREE.BufferGeometry {
  const coils = 11;
  const stepsPerCoil = 24;
  const totalSteps = coils * stepsPerCoil;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const ang = 0.08 + u * 0.75;
    const theta = u * coils * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const radialOffset = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.6) * 0.78;
    const zOffset = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.6) * 0.34;

    const rCur = 11.85 + radialOffset;
    const px = ARC_CX - Math.cos(ang) * rCur;
    const py = ARC_CY - Math.sin(ang) * rCur;
    points.push(new THREE.Vector3(px, py, zOffset));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(curve, totalSteps, 0.048, 8, false);
  return mergeParts([paintGeometry(tube, AK_SPRING_METAL)]);
}

/**
 * M-04: Angled Ribbed Monopod Floorplate & Locking Button (assembledPos: [6.94, -9.54, 0])
 */
export function buildAkMagFloorplateGeometry(): THREE.BufferGeometry {
  const plateRaw = paintGeometry(
    new THREE.BoxGeometry(2.68, 0.4, 1.38),
    AK_POLYMER_ACCENT
  );
  // Ground-gripping monopod bumper serrations along bottom face
  const grooves: THREE.BufferGeometry[] = [];
  for (let g = -2; g <= 2; g++) {
    grooves.push(
      paintGeometry(
        new THREE.BoxGeometry(0.14, 0.12, 1.5).translate(g * 0.44, -0.18, 0),
        AK_INNER_DARK
      )
    );
  }
  const bumper = csgSubtract(plateRaw, grooves);
  bumper.rotateZ(0.88);

  // Slide-on steel retaining lips & central takedown locking button stud
  const lipL = paintGeometry(
    new THREE.BoxGeometry(2.52, 0.14, 0.12)
      .translate(0, 0.22, -0.61)
      .rotateZ(0.88),
    AK_DARK_STEEL
  );
  const lipR = paintGeometry(
    new THREE.BoxGeometry(2.52, 0.14, 0.12)
      .translate(0, 0.22, 0.61)
      .rotateZ(0.88),
    AK_DARK_STEEL
  );
  const lockStud = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.26, 16)
      .translate(0, -0.1, 0)
      .rotateZ(0.88),
    AK_BRIGHT_STEEL
  );
  return mergeParts([bumper, lipL, lipR, lockStud]);
}
