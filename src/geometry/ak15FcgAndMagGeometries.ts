import * as THREE from 'three';
import {
  csgSubtract,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from './springHelper';
import { applyAkMagUVs } from './ak15UvAtlasHelper';

const AK_DARK_STEEL = '#28303b';
const AK_BRIGHT_STEEL = '#d8e0ea';
const AK_SPRING_METAL = '#94a3b8';
const AK_POLYMER = '#20242c';
const AK_POLYMER_ACCENT = '#161920';
const AK_FOLLOWER_RED = '#ea580c';

/**
 * FC-01: Kalashnikov Rotary Hammer & Braided Dual-Leg Torsion Spring (assembledPos: [-0.35, -0.05, 0])
 * Pivot is at local (0, 0, 0) so rotating around Z (rz < 0) swings the hammer forward (+X) into the firing pin!
 */
export function buildAkHammerGeometry(): THREE.BufferGeometry {
  // Pivot boss along Z
  const hub = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 1.08, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    AK_BRIGHT_STEEL
  );
  // Hammer neck & heavy striking head (cocked back/up so striking face swings forward on rz = -0.96)
  const hammerShape = new THREE.Shape();
  hammerShape.moveTo(-0.22, 0);
  hammerShape.lineTo(0.22, -0.15);
  hammerShape.lineTo(0.32, 0.55);
  hammerShape.lineTo(0.18, 1.08); // Striking face
  hammerShape.lineTo(-0.38, 0.98); // Rear cocking spur
  hammerShape.lineTo(-0.46, 0.42); // Disconnector hook notch
  hammerShape.closePath();

  const head = new THREE.ExtrudeGeometry(hammerShape, {
    depth: 0.48,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  head.translate(0, 0, -0.24);
  // Cocked angle resting back toward sear
  head.rotateZ(0.55);
  paintGeometry(head, AK_BRIGHT_STEEL);

  // Braided dual-coil torsion spring wrapping left & right of hub + long wire legs extending back to trigger!
  const coilL = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.52,
      end: -0.28,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.34,
      wireRadius: 0.035,
      coils: 3.5,
    }).rotateX(Math.PI / 2),
    AK_SPRING_METAL
  );
  const coilR = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.28,
      end: 0.52,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.34,
      wireRadius: 0.035,
      coils: 3.5,
    }).rotateX(Math.PI / 2),
    AK_SPRING_METAL
  );
  const legL = paintGeometry(
    new THREE.CylinderGeometry(0.035, 0.035, 1.85, 8)
      .rotateZ(Math.PI / 2 + 0.12)
      .translate(-0.92, -0.22, -0.44),
    AK_SPRING_METAL
  );
  const legR = paintGeometry(
    new THREE.CylinderGeometry(0.035, 0.035, 1.85, 8)
      .rotateZ(Math.PI / 2 + 0.12)
      .translate(-0.92, -0.22, 0.44),
    AK_SPRING_METAL
  );

  return mergeParts([hub, head, coilL, coilR, legL, legR]);
}

/**
 * FC-02: Curved Trigger & Double-Hook Primary Sear (assembledPos: [-2.15, -0.35, 0])
 * Pivot at local (0, 0, 0): trigger shoe hangs down (-Y), dual sear hooks extend forward (+X, +Y).
 */
export function buildAkTriggerGeometry(): THREE.BufferGeometry {
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 1.15, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    AK_DARK_STEEL
  );

  // Curved finger shoe hanging down into trigger guard
  const shoeCurve = new THREE.Shape();
  shoeCurve.moveTo(-0.18, -0.1);
  shoeCurve.lineTo(0.22, -0.1);
  shoeCurve.quadraticCurveTo(0.08, -0.95, 0.32, -1.55);
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

  // Twin forward primary sear hooks (left & right of central disconnector slot)
  const hookL = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.38, 0.18).translate(0.42, 0.24, -0.28),
    AK_DARK_STEEL
  );
  const hookR = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.38, 0.18).translate(0.42, 0.24, 0.28),
    AK_DARK_STEEL
  );
  const rearTail = paintGeometry(
    new THREE.BoxGeometry(0.75, 0.24, 0.68).translate(-0.38, 0.02, 0),
    AK_DARK_STEEL
  );

  return mergeParts([pivotPin, shoe, hookL, hookR, rearTail]);
}

/**
 * FC-03: Central Semi-Auto Disconnector & Spring (assembledPos: [-2.35, -0.15, 0])
 */
export function buildAkDisconnectorGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.42, -0.22);
  shape.lineTo(0.45, -0.22);
  shape.lineTo(0.56, 0.32);
  shape.lineTo(0.22, 0.56); // Upper hammer-catching claw
  shape.lineTo(0.05, 0.35);
  shape.lineTo(-0.35, 0.12);
  shape.closePath();

  const plate = new THREE.ExtrudeGeometry(shape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  plate.translate(0, 0, -0.11);
  paintGeometry(plate, AK_BRIGHT_STEEL);

  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.45,
      end: -0.05,
      centerX: -0.22,
      centerZ: 0,
      coilRadius: 0.09,
      wireRadius: 0.022,
      coils: 5,
    }),
    AK_SPRING_METAL
  );

  return mergeParts([plate, spring]);
}

/**
 * FC-04: Model 2023 Ambidextrous Safety/Fire Selector (assembledPos: [-3.85, 0.35, 0])
 */
export function buildAkSelectorGeometry(): THREE.BufferGeometry {
  // Cross-receiver selector axle + internal blocking cam lug
  const crossAxle = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.78, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    AK_DARK_STEEL
  );
  const internalBlockLug = paintGeometry(
    new THREE.BoxGeometry(0.55, 0.44, 0.62).translate(0.35, -0.22, -0.1),
    AK_BRIGHT_STEEL
  );

  // Right-side iconic Kalashnikov stamped safety lever plate + index-finger/thumb tactical shelf!
  const rightLever = paintGeometry(
    new THREE.BoxGeometry(4.65, 0.58, 0.09)
      .rotateZ(0.06)
      .translate(2.15, 0.18, 0.87),
    AK_DARK_STEEL
  );
  const rightPivotCap = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 0.12, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.87),
    AK_DARK_STEEL
  );
  const indexShelf = paintGeometry(
    new THREE.BoxGeometry(1.05, 0.14, 0.34).translate(1.45, -0.12, 0.98),
    AK_DARK_STEEL
  );

  // 2023 New Left-Side Ambidextrous Thumb Lever right above pistol grip!
  const leftThumbLever = paintGeometry(
    new THREE.BoxGeometry(1.38, 0.34, 0.18)
      .rotateZ(-0.22)
      .translate(-0.48, -0.16, -0.92),
    AK_DARK_STEEL
  );

  return mergeParts([
    crossAxle,
    internalBlockLug,
    rightLever,
    rightPivotCap,
    indexShelf,
    leftThumbLever,
  ]);
}

/**
 * Helper to generate points along the authentic 7.62×39mm banana curve:
 * Arc center in local coords: (ARC_CX = 11.8, ARC_CY = 0.25), R_mid = 11.8
 * s = 0 (top feed lips at x=0, y=0.25) -> s = 1 (bottom floorplate at ang = 0.88 rad => x ≈ 4.28, y ≈ -8.85.. -10.2)
 */
const ARC_CX = 11.8;
const ARC_CY = 0.25;
const ARC_R_INNER = 10.65;
const ARC_R_OUTER = 13.05;
const ARC_ANG_START = -0.02;
const ARC_ANG_END = 0.88;

/**
 * M-01: 30-Round 7.62×39mm Windowed Curved Polymer Magazine Body (assembledPos: [2.55, -0.55, 0])
 */
export function buildAkMagBodyGeometry(): THREE.BufferGeometry {
  // Build true smooth circular-arc banana profile in (X, Y) and extrude across Z!
  const banana = new THREE.Shape();
  const steps = 26;

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

  // Hollow top feed throat + recessed side observation window frames!
  const throatCut = paintGeometry(
    new THREE.BoxGeometry(1.9, 1.6, 0.88).translate(-0.05, -0.1, 0),
    AK_POLYMER_ACCENT
  );
  const winRecessR = paintGeometry(
    new THREE.BoxGeometry(0.46, 5.4, 0.1)
      .rotateZ(0.36)
      .translate(1.45, -4.9, 0.62),
    AK_POLYMER_ACCENT
  );
  const winRecessL = paintGeometry(
    new THREE.BoxGeometry(0.46, 5.4, 0.1)
      .rotateZ(0.36)
      .translate(1.45, -4.9, -0.62),
    AK_POLYMER_ACCENT
  );
  const sculpted = csgSubtract(rawBody, [throatCut, winRecessR, winRecessL]);

  // Molded tactile grip ribs along front & rear spines + embedded Steel Front/Rear Locking Lugs & Feed Lips!
  const extras: THREE.BufferGeometry[] = [sculpted];
  for (let r = 1; r <= 5; r++) {
    const ang = 0.16 + r * 0.125;
    const mx = ARC_CX - Math.cos(ang) * 11.85;
    const my = ARC_CY - Math.sin(ang) * 11.85;
    extras.push(
      paintGeometry(
        new THREE.BoxGeometry(0.55, 0.18, 1.32)
          .rotateZ(ang)
          .translate(mx - 0.65, my, 0),
        AK_POLYMER_ACCENT
      )
    );
  }

  // Front steel hook lug & rear steel catch locking tooth (classic rock-and-lock AK mag lugs!)
  extras.push(
    paintGeometry(
      new THREE.BoxGeometry(0.38, 0.34, 0.92).translate(1.18, -0.42, 0),
      AK_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.42, 0.32, 0.86).translate(-1.32, -0.65, 0),
      AK_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.15, 0.28, 1.06).translate(-0.05, 0.32, 0),
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
    new THREE.BoxGeometry(2.05, 0.28, 0.84)
      .rotateZ(0.1)
      .translate(0, 0.15, 0),
    AK_FOLLOWER_RED
  );
  const cartridgeRidge = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 1.95, 14)
      .rotateZ(Math.PI / 2 + 0.1)
      .translate(0, 0.32, -0.16),
    AK_FOLLOWER_RED
  );
  const frontSkirt = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.95, 0.78)
      .rotateZ(0.14)
      .translate(0.92, -0.32, 0),
    AK_FOLLOWER_RED
  );
  const rearSkirt = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.95, 0.78)
      .rotateZ(0.14)
      .translate(-0.92, -0.32, 0),
    AK_FOLLOWER_RED
  );
  return mergeParts([topPlatform, cartridgeRidge, frontSkirt, rearSkirt]);
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
  return paintGeometry(tube, AK_SPRING_METAL);
}

/**
 * M-04: Angled Ribbed Monopod Floorplate & Locking Button (assembledPos: [6.35, -10.85, 0])
 */
export function buildAkMagFloorplateGeometry(): THREE.BufferGeometry {
  const plate = paintGeometry(
    new THREE.BoxGeometry(2.68, 0.38, 1.38)
      .rotateZ(0.88)
      .translate(0, 0, 0),
    AK_DARK_STEEL
  );
  const lockStud = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.25, 16)
      .rotateZ(0.88)
      .translate(0.11, -0.09, 0),
    AK_BRIGHT_STEEL
  );
  return mergeParts([plate, lockStud]);
}
