import * as THREE from 'three';
import {
  csgSubtract,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import { applyFrameAtlasUVs } from './uvAtlasHelper';

const GRIP_ANGLE_RAD = (-20 * Math.PI) / 180;

/**
 * F-01: 1:1 Gen3 G17 Polymer Receiver Frame
 * Features sculpted beavertail tang, arched serrated backstrap, 3 ergonomic front finger grooves,
 * squared-hook checkered trigger guard w/ root undercut, Gen3 Universal Accessory Rail w/ front-open
 * T-grooves & 4.5mm cross-slot, U-contoured recoil dust-cover channel, under-rail serial plate & 4 stainless rails.
 */
export function buildFrameGeometry(): THREE.BufferGeometry {
  const POLYMER_BODY = '#313640';
  const POLYMER_RECESS = '#272b34';
  const POLYMER_DARK = '#242830';
  const STAINLESS_RAIL = '#e2e8f0';

  // 1. Sculpted Side Silhouette with smooth Bezier ergonomics (Z: -1.24 to +1.24)
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-6.92, 0.86);
  bodyShape.lineTo(10.86, 0.86);
  bodyShape.quadraticCurveTo(11.04, 0.84, 11.02, 0.42);
  bodyShape.quadraticCurveTo(10.95, -0.12, 10.48, -0.18);
  bodyShape.lineTo(2.32, -0.18);
  bodyShape.quadraticCurveTo(1.92, -0.2, 1.72, -0.44);
  bodyShape.lineTo(-1.72, -0.44);

  // Ergonomic high undercut transitioning smoothly into angled Gen3 front strap (-20°)
  bodyShape.quadraticCurveTo(-2.12, -0.48, -2.14, -1.92);

  // Finger Groove #1 (middle finger) + crest ridge
  bodyShape.bezierCurveTo(-1.98, -2.28, -2.12, -2.92, -2.48, -3.22);
  bodyShape.lineTo(-2.38, -3.38);
  // Finger Groove #2 (ring finger) + crest ridge
  bodyShape.bezierCurveTo(-2.42, -3.82, -2.62, -4.45, -3.02, -4.82);
  bodyShape.lineTo(-2.92, -4.98);
  // Finger Groove #3 (pinky finger) down to flared magwell front lip
  bodyShape.bezierCurveTo(-3.08, -5.55, -3.45, -6.55, -4.18, -8.35);
  bodyShape.quadraticCurveTo(-4.48, -9.05, -4.72, -9.28);

  // Flared magwell base with rear lanyard heel
  bodyShape.lineTo(-8.36, -8.98);
  bodyShape.quadraticCurveTo(-8.58, -8.85, -8.42, -8.32);

  // Classic Glock arched backstrap hump sweeping into concave thumb-web & beavertail tang
  bodyShape.bezierCurveTo(-7.85, -6.65, -7.22, -4.85, -6.48, -2.75);
  bodyShape.bezierCurveTo(-5.98, -1.35, -5.88, -0.52, -6.28, -0.08);
  bodyShape.quadraticCurveTo(-6.68, 0.22, -7.12, 0.36);
  bodyShape.quadraticCurveTo(-7.22, 0.56, -6.92, 0.86);
  bodyShape.closePath();

  const mainBody = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 2.38,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 3,
    curveSegments: 16,
  });
  mainBody.translate(0, 0, -1.19);
  paintGeometry(mainBody, POLYMER_BODY);

  // 2. Signature Squared-Front Glock Trigger Guard with ergonomic undercut & front hook
  const guardOuter = new THREE.Shape();
  guardOuter.moveTo(2.38, -0.14);
  guardOuter.lineTo(2.32, -1.85);
  guardOuter.lineTo(2.44, -2.52);
  guardOuter.quadraticCurveTo(2.42, -3.06, 1.92, -3.1);
  guardOuter.lineTo(-1.58, -3.1);
  guardOuter.bezierCurveTo(-1.95, -3.08, -1.96, -2.32, -2.22, -2.12);
  guardOuter.lineTo(-2.05, -0.4);
  guardOuter.closePath();

  const guardHole = new THREE.Path();
  guardHole.moveTo(1.62, -0.46);
  guardHole.quadraticCurveTo(1.76, -0.52, 1.76, -1.85);
  guardHole.quadraticCurveTo(1.76, -2.58, 1.32, -2.62);
  guardHole.lineTo(-1.36, -2.62);
  guardHole.quadraticCurveTo(-1.72, -2.55, -1.72, -1.88);
  guardHole.lineTo(-1.56, -0.46);
  guardHole.closePath();
  guardOuter.holes.push(guardHole);

  const triggerGuard = new THREE.ExtrudeGeometry(guardOuter, {
    depth: 1.18,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 14,
  });
  triggerGuard.translate(0, 0, -0.59);
  paintGeometry(triggerGuard, POLYMER_BODY);

  const cutters: THREE.BufferGeometry[] = [];

  // Boat-hull lower bevels along front dust cover (left & right 42° chamfers)
  for (const sign of [-1, 1]) {
    const hullChamfer = new THREE.BoxGeometry(9.2, 0.55, 0.55);
    hullChamfer.rotateX(sign * 0.72);
    hullChamfer.translate(6.55, -0.18, sign * 1.25);
    paintGeometry(hullChamfer, POLYMER_BODY);
    cutters.push(hullChamfer);
  }

  // Front trigger guard checkering grooves (5 crisp horizontal serrations)
  for (let i = 0; i < 5; i++) {
    const gy = -1.92 - i * 0.21;
    const groove = new THREE.BoxGeometry(0.16, 0.09, 1.36);
    groove.translate(2.41, gy, 0);
    paintGeometry(groove, POLYMER_DARK);
    cutters.push(groove);
  }

  // Backstrap horizontal traction ribs along arched hump
  for (let i = 0; i < 8; i++) {
    const u = i / 7;
    const bx = -6.52 - u * 1.55;
    const by = -3.15 - u * 4.65;
    const ribCut = new THREE.BoxGeometry(0.24, 0.14, 1.65);
    ribCut.rotateZ(GRIP_ANGLE_RAD);
    ribCut.translate(bx, by, 0);
    paintGeometry(ribCut, POLYMER_DARK);
    cutters.push(ribCut);
  }

  // True Gen3 U-contoured Dust-Cover Recoil Channel (upper slot + semicircular chin cradle)
  const dustChannelTop = new THREE.BoxGeometry(9.45, 0.62, 1.76);
  dustChannelTop.translate(6.52, 0.76, 0);
  paintGeometry(dustChannelTop, POLYMER_RECESS);
  cutters.push(dustChannelTop);

  const dustCradleCyl = new THREE.CylinderGeometry(0.75, 0.75, 9.45, 24);
  dustCradleCyl.rotateZ(Math.PI / 2);
  dustCradleCyl.translate(6.52, 1.02, 0);
  paintGeometry(dustCradleCyl, POLYMER_RECESS);
  cutters.push(dustCradleCyl);

  // Slide-lock cross-mortise & central leaf-spring trench at X = 2.05
  const slideLockMortise = new THREE.BoxGeometry(0.22, 0.65, 2.75);
  slideLockMortise.translate(2.05, 0.42, 0);
  paintGeometry(slideLockMortise, POLYMER_DARK);
  cutters.push(slideLockMortise);

  const leafSpringTrench = new THREE.BoxGeometry(1.15, 0.56, 0.26);
  leafSpringTrench.translate(1.58, 0.08, 0);
  paintGeometry(leafSpringTrench, POLYMER_DARK);
  cutters.push(leafSpringTrench);

  // Mid & Rear internal Fire-Control / Locking-Block cavity
  const fcgPocket = new THREE.BoxGeometry(8.6, 1.78, 1.76);
  fcgPocket.translate(-2.2, 0.16, 0);
  paintGeometry(fcgPocket, POLYMER_RECESS);
  cutters.push(fcgPocket);

  // Trigger shoe pass-through slot opening into trigger guard window
  const triggerSlot = new THREE.BoxGeometry(1.55, 1.3, 0.92);
  triggerSlot.translate(-0.15, -0.55, 0);
  paintGeometry(triggerSlot, POLYMER_DARK);
  cutters.push(triggerSlot);

  // Angled Magwell Rectangular Tunnel + Rear Grip-Plug Heel Cavity
  const magTunnel = new THREE.BoxGeometry(2.88, 13.2, 1.88);
  magTunnel.rotateZ(GRIP_ANGLE_RAD);
  magTunnel.translate(-5.26, -4.25, 0);
  paintGeometry(magTunnel, POLYMER_DARK);
  cutters.push(magTunnel);

  const magCatchWindow = new THREE.BoxGeometry(0.68, 0.96, 2.75);
  magCatchWindow.rotateZ(GRIP_ANGLE_RAD);
  magCatchWindow.translate(-2.28, -2.05, 0);
  paintGeometry(magCatchWindow, POLYMER_DARK);
  cutters.push(magCatchWindow);

  // 1:1 Gen3 Universal Tactical Accessory Rail: front-open longitudinal T-grooves + 4.5mm cross-locking slot
  for (const sign of [-1, 1]) {
    const accGroove = new THREE.BoxGeometry(6.6, 0.22, 0.26);
    accGroove.translate(8.15, 0.24, sign * 1.22);
    paintGeometry(accGroove, POLYMER_DARK);
    cutters.push(accGroove);

    const railUnderStep = new THREE.BoxGeometry(6.4, 0.16, 0.2);
    railUnderStep.translate(8.05, -0.1, sign * 1.16);
    paintGeometry(railUnderStep, POLYMER_RECESS);
    cutters.push(railUnderStep);
  }

  // Crisp Gen3 4.5mm transverse Weaver/Universal rail locking cross-slot
  const crossSlot = new THREE.BoxGeometry(0.5, 0.26, 2.72);
  crossSlot.translate(7.85, -0.13, 0);
  paintGeometry(crossSlot, POLYMER_DARK);
  cutters.push(crossSlot);

  // Sculpted ergonomic thumb-rest scallops & stippled grip inset panels
  for (const sign of [-1, 1]) {
    const thumbScallop = new THREE.CylinderGeometry(0.68, 0.68, 2.1, 20);
    thumbScallop.rotateZ(Math.PI / 2 - 0.18);
    thumbScallop.scale(1.15, 0.62, 0.35);
    thumbScallop.translate(-3.95, -1.22, sign * 1.33);
    paintGeometry(thumbScallop, POLYMER_RECESS);
    cutters.push(thumbScallop);

    const lockScallop = new THREE.SphereGeometry(0.46, 16, 12);
    lockScallop.scale(1.1, 1.35, 0.32);
    lockScallop.translate(2.05, 0.36, sign * 1.3);
    paintGeometry(lockScallop, POLYMER_RECESS);
    cutters.push(lockScallop);

    const panelShape = new THREE.Shape();
    panelShape.moveTo(-0.98, 2.25);
    panelShape.lineTo(0.95, 2.45);
    panelShape.lineTo(1.02, -2.55);
    panelShape.lineTo(-1.05, -2.42);
    panelShape.closePath();
    const panel = new THREE.ExtrudeGeometry(panelShape, {
      depth: 0.2,
      bevelEnabled: false,
    });
    panel.rotateZ(GRIP_ANGLE_RAD);
    panel.translate(-5.32, -4.92, sign > 0 ? 1.18 : -1.38);
    paintGeometry(panel, POLYMER_DARK);
    cutters.push(panel);
  }

  // Three Gen3 cross-pin holes + rear heel lanyard hole
  const pinCoords: [number, number, number][] = [
    [0, 0.15, 0.2],
    [0.65, 0.58, 0.155],
    [-5.65, 0.1, 0.155],
    [-7.92, -8.52, 0.17],
  ];
  for (const [px, py, pr] of pinCoords) {
    const hole = new THREE.CylinderGeometry(pr, pr, 2.9, 18);
    hole.rotateX(Math.PI / 2);
    hole.translate(px, py, 0);
    paintGeometry(hole, POLYMER_DARK);
    cutters.push(hole);
  }

  const carvedPolymer = csgSubtract(
    mergeParts([mainBody, triggerGuard]),
    cutters
  );

  // 3. Four Precision Embedded Stainless-Steel Slide Guide Rails + Under-Rail Serial Tag
  const metalInserts: THREE.BufferGeometry[] = [];
  const railSpecs: [number, number][] = [
    [2.68, 1.38],
    [-5.78, 1.42],
  ];
  for (const [rx, len] of railSpecs) {
    for (const sign of [-1, 1]) {
      const rVertical = new THREE.BoxGeometry(len, 0.24, 0.12);
      rVertical.translate(rx, 0.96, sign * 0.96);
      paintGeometry(rVertical, STAINLESS_RAIL);
      metalInserts.push(rVertical);

      const rLip = new THREE.BoxGeometry(len, 0.08, 0.24);
      rLip.translate(rx, 1.04, sign * 1.02);
      paintGeometry(rLip, STAINLESS_RAIL);
      metalInserts.push(rLip);
    }
  }

  // Embedded stainless serial-number plate under front dust cover (cr in (0.45, 0.70] -> 'serial' UV!)
  const serialPlate = new THREE.BoxGeometry(1.65, 0.05, 0.68);
  serialPlate.translate(5.15, -0.17, 0);
  paintGeometry(serialPlate, '#cbd5e1');
  metalInserts.push(serialPlate);

  return applyFrameAtlasUVs(mergeParts([carvedPolymer, ...metalInserts]));
}

/** F-02: Precision MIM/CNC Gen3 2-Pin Steel Locking Block w/ 40° Unlocking Cam Wedge & Pull-Down Hook */
export function buildLockingBlockGeometry(): THREE.BufferGeometry {
  const wallL = new THREE.BoxGeometry(1.82, 1.08, 0.24).translate(
    0.54,
    0.48,
    -0.68
  );
  const wallR = new THREE.BoxGeometry(1.82, 1.08, 0.24).translate(
    0.54,
    0.48,
    0.68
  );

  // Side rail-reinforcing top ears
  const earL = new THREE.BoxGeometry(0.96, 0.14, 0.28).translate(
    0.72,
    0.98,
    -0.72
  );
  const earR = new THREE.BoxGeometry(0.96, 0.14, 0.28).translate(
    0.72,
    0.98,
    0.72
  );

  // Accurate 40° Browning camming cross-wedge + rear pull-down hook shelf
  const wedgeShape = new THREE.Shape();
  wedgeShape.moveTo(-0.22, 0.28);
  wedgeShape.lineTo(1.42, 0.28);
  wedgeShape.lineTo(1.42, 0.9);
  wedgeShape.lineTo(0.88, 0.9);
  wedgeShape.lineTo(0.32, 0.44);
  wedgeShape.lineTo(-0.04, 0.44);
  wedgeShape.lineTo(-0.22, 0.62);
  wedgeShape.closePath();

  const wedge = new THREE.ExtrudeGeometry(wedgeShape, {
    depth: 1.16,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  wedge.translate(0, 0, -0.58);

  const solid = paintGeometry(
    mergeParts([wallL, wallR, earL, earR, wedge]),
    '#d4dde8'
  );

  const pinMain = paintGeometry(
    new THREE.CylinderGeometry(0.195, 0.195, 1.85, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0.15, 0),
    '#94a3b8'
  );
  const pinFront = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 1.85, 18)
      .rotateX(Math.PI / 2)
      .translate(0.65, 0.58, 0),
    '#94a3b8'
  );

  return csgSubtract(solid, [pinMain, pinFront]);
}

/** F-03: Slide Lock Cross-Bar with Serrated Finger Tabs & Tempered Leaf Spring */
export function buildSlideLockGeometry(): THREE.BufferGeometry {
  const crossPlate = paintGeometry(
    new THREE.BoxGeometry(0.16, 0.46, 2.68).translate(2.05, 0.42, 0),
    '#454f5e'
  );
  // Top stepped locking lip engaging barrel under-lug front face
  const topLip = paintGeometry(
    new THREE.BoxGeometry(0.11, 0.12, 0.88).translate(2.025, 0.7, 0),
    '#586476'
  );

  const tabs: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    const rawTab = paintGeometry(
      new THREE.BoxGeometry(0.26, 0.56, 0.16).translate(
        2.05,
        0.42,
        sign * 1.32
      ),
      '#454f5e'
    );
    const grooves: THREE.BufferGeometry[] = [];
    for (let k = -1; k <= 1; k++) {
      grooves.push(
        paintGeometry(
          new THREE.BoxGeometry(0.3, 0.06, 0.06).translate(
            2.05,
            0.42 + k * 0.15,
            sign * 1.39
          ),
          '#262c36'
        )
      );
    }
    tabs.push(csgSubtract(rawTab, grooves));
  }

  const springCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.12, -0.18, 0),
    new THREE.Vector3(1.55, -0.15, 0),
    new THREE.Vector3(1.88, 0.08, 0),
    new THREE.Vector3(2.05, 0.26, 0),
  ]);
  const leafSpring = paintGeometry(
    new THREE.TubeGeometry(springCurve, 16, 0.05, 8, false),
    '#94a3b8'
  );

  return mergeParts([crossPlate, topLip, ...tabs, leafSpring]);
}

/** F-04: Stamped Steel Slide Stop Lever with Captive Wire Spring & Serrated Thumb Pad */
export function buildSlideStopLeverGeometry(): THREE.BufferGeometry {
  const rawPivot = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 0.12, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0.15, -0.82),
    '#454f5e'
  );
  const pivotHole = paintGeometry(
    new THREE.CylinderGeometry(0.195, 0.195, 0.3, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0.15, -0.82),
    '#262c36'
  );
  const pivotRing = csgSubtract(rawPivot, [pivotHole]);

  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.15, -0.85),
    new THREE.Vector3(-1.1, 0.38, -1.06),
    new THREE.Vector3(-2.35, 0.68, -1.26),
    new THREE.Vector3(-2.95, 0.72, -1.28),
  ]);
  const arm = paintGeometry(
    new THREE.TubeGeometry(armCurve, 18, 0.085, 8, false),
    '#454f5e'
  );

  // Upward slide-catch tooth + serrated external thumb shelf
  const catchTooth = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.24, 0.16).translate(-2.65, 0.92, -1.22),
    '#586476'
  );
  const thumbPad = paintGeometry(
    new THREE.BoxGeometry(0.84, 0.38, 0.16).translate(-2.68, 0.74, -1.32),
    '#586476'
  );

  const inwardTab = paintGeometry(
    new THREE.BoxGeometry(0.36, 0.12, 0.48).translate(-2.45, 0.56, -0.98),
    '#cbd5e1'
  );

  // Authentic Gen3 captive wire spring bearing under locking_block_pin [0.65, 0.58]
  const springWire = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.66, 0.44, -0.76),
    new THREE.Vector3(0.28, 0.36, -0.76),
    new THREE.Vector3(-0.08, 0.02, -0.76),
    new THREE.Vector3(-0.68, 0.18, -0.88),
  ]);
  const wire = paintGeometry(
    new THREE.TubeGeometry(springWire, 14, 0.028, 6, false),
    '#cbd5e1'
  );

  return mergeParts([pivotRing, arm, catchTooth, thumbPad, inwardTab, wire]);
}

/** F-05: Magazine Catch with Serrated Thumb Pad, Internal Locking Tooth & Tempered Wire Spring */
export function buildMagazineCatchGeometry(): THREE.BufferGeometry {
  const block = paintGeometry(
    new THREE.BoxGeometry(0.58, 0.88, 2.48)
      .rotateZ(GRIP_ANGLE_RAD)
      .translate(-2.28, -2.05, -0.04),
    '#313640'
  );

  const rawBtn = paintGeometry(
    new THREE.BoxGeometry(0.52, 0.8, 0.2)
      .rotateZ(GRIP_ANGLE_RAD)
      .translate(-2.28, -2.05, -1.32),
    '#3b4452'
  );

  // Internal right-side locking catch tooth engaging magazine body notch
  const lockTooth = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.32, 0.24)
      .rotateZ(GRIP_ANGLE_RAD)
      .translate(-2.18, -1.96, 0.84),
    '#454f5e'
  );

  const wireSpring = paintGeometry(
    new THREE.CylinderGeometry(0.045, 0.045, 2.35, 12)
      .rotateZ(GRIP_ANGLE_RAD)
      .translate(-2.68, -3.1, 0.12),
    '#cbd5e1'
  );

  return mergeParts([block, rawBtn, lockTooth, wireSpring]);
}

/** F-06, F-07, F-08: Precision Ground Cross-Pins with Chamfered Ends */
export function buildPinGeometry(
  radius: number,
  length: number,
  grooved = false
): THREE.BufferGeometry {
  const main = new THREE.CylinderGeometry(radius, radius, length - 0.12, 24);
  main.rotateX(Math.PI / 2);

  const capF = new THREE.CylinderGeometry(radius * 0.76, radius, 0.06, 24);
  capF.rotateX(Math.PI / 2);
  capF.translate(0, 0, (length - 0.06) * 0.5);

  const capR = new THREE.CylinderGeometry(radius, radius * 0.76, 0.06, 24);
  capR.rotateX(-Math.PI / 2);
  capR.translate(0, 0, -(length - 0.06) * 0.5);

  const pinColor = grooved ? '#4a5565' : '#cbd5e1';
  const cyl = paintGeometry(mergeParts([main, capF, capR]), pinColor);

  if (!grooved) return cyl;

  const g1 = paintGeometry(
    new THREE.CylinderGeometry(radius + 0.04, radius + 0.04, 0.14, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.68),
    '#2b3340'
  );
  const g2 = g1.clone().translate(0, 0, 1.36);

  return csgSubtract(cyl, [g1, g2]);
}
