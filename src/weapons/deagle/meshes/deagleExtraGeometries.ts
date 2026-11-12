import * as THREE from 'three';
import {
  csgSubtract,
  createHelicalSpring,
  createRectangularMagSpring,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import { applyDeagleChromeUVs, applyDeagleGripUVs } from './deagleGeometries';

export const DEAGLE_GRIP_ANGLE = (-15 * Math.PI) / 180;

const CHROME_BODY = '#b4c0ce';
const CHROME_MIRROR = '#c2cdd9';
const MILLED_DARK = '#252b36';
const NITRIDE_DARK = '#454f5e';
const RUBBER_BLACK = '#242830';
const RUBBER_DARK = '#1e2229';

/**
 * F-01: Polished Chrome CNC-Machined Forged Steel Receiver Frame (assembledPos: [0, 0, 0], isShell: true)
 * Features full-length dust cover with angled front chin, recurved magnum trigger guard with undercut,
 * serrated chrome front strap (-15° rake), swept extended beavertail tang, and full-length slide guide rails.
 */
export function buildDeagleFrameGeometry(): THREE.BufferGeometry {
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-8.65, 0.88);
  frameShape.lineTo(15.72, 0.88);
  // Signature Desert Eagle forward-slanted dust-cover chin matching slide & barrel front bevel!
  frameShape.lineTo(15.44, -0.2);
  frameShape.lineTo(2.92, -0.2);
  frameShape.quadraticCurveTo(2.48, -0.22, 2.28, -0.5);
  frameShape.lineTo(-1.72, -0.5);

  // High ergonomic undercut transitioning into -15° rearward-raked chrome front strap!
  frameShape.quadraticCurveTo(-2.08, -0.58, -2.05, -2.02);
  frameShape.lineTo(-3.82, -10.18);

  // Exact flush magwell bottom line (-3.82, -10.18) -> (-8.92, -9.78)
  frameShape.lineTo(-8.92, -9.78);

  // Rear grip tang rising inside wrap-around rubber grip, flaring out into swept beavertail tang!
  frameShape.lineTo(-6.98, -1.35);
  frameShape.bezierCurveTo(-6.75, -0.45, -7.65, 0.05, -9.65, 0.22);
  frameShape.quadraticCurveTo(-10.48, 0.3, -10.42, 0.54);
  frameShape.quadraticCurveTo(-10.15, 0.78, -8.65, 0.88);
  frameShape.closePath();

  const mainBody = new THREE.ExtrudeGeometry(frameShape, {
    depth: 2.56,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 14,
  });
  mainBody.translate(0, 0, -1.28);
  paintGeometry(mainBody, CHROME_BODY);

  // Signature Desert Eagle Recurved Combat Trigger Guard
  const guardOuter = new THREE.Shape();
  guardOuter.moveTo(2.92, -0.18);
  guardOuter.lineTo(2.68, -1.85);
  guardOuter.quadraticCurveTo(3.02, -2.42, 2.88, -2.85);
  guardOuter.quadraticCurveTo(2.72, -3.32, 2.12, -3.34);
  guardOuter.lineTo(-1.58, -3.34);
  guardOuter.bezierCurveTo(-1.96, -3.3, -1.92, -2.35, -2.14, -2.05);
  guardOuter.lineTo(-1.95, -0.42);
  guardOuter.closePath();

  const guardHole = new THREE.Path();
  guardHole.moveTo(2.05, -0.52);
  guardHole.quadraticCurveTo(2.22, -0.65, 2.2, -1.95);
  guardHole.quadraticCurveTo(2.18, -2.82, 1.65, -2.86);
  guardHole.lineTo(-1.32, -2.86);
  guardHole.quadraticCurveTo(-1.72, -2.78, -1.72, -1.95);
  guardHole.lineTo(-1.54, -0.52);
  guardHole.closePath();
  guardOuter.holes.push(guardHole);

  const triggerGuard = new THREE.ExtrudeGeometry(guardOuter, {
    depth: 1.24,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
    curveSegments: 14,
  });
  triggerGuard.translate(0, 0, -0.62);
  paintGeometry(triggerGuard, CHROME_BODY);

  // Full-length CNC Chrome Slide Guide Rails along upper frame deck
  const railL = paintGeometry(
    new THREE.BoxGeometry(22.4, 0.14, 0.25).translate(3.1, 0.98, -1.04),
    CHROME_MIRROR
  );
  const railR = paintGeometry(
    new THREE.BoxGeometry(22.4, 0.14, 0.25).translate(3.1, 0.98, 1.04),
    CHROME_MIRROR
  );

  const solidFrame = mergeParts([mainBody, triggerGuard, railL, railR]);

  const cutters: THREE.BufferGeometry[] = [];

  // 1. Dust-cover upper twin-channel bed for dual parallel recoil springs & barrel locking lug
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(13.6, 0.72, 1.88).translate(9.05, 0.62, 0),
      MILLED_DARK
    )
  );

  // Lower boat-hull 45° bevels along front dust cover
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(13.2, 0.52, 0.52)
          .rotateX(sign * 0.75)
          .translate(9.2, -0.2, sign * 1.32),
        CHROME_MIRROR
      )
    );
  }

  // 2. Internal FCG / Sear / Transfer-Bar Receiver Pocket + Rear Hammer Slot + Trigger Window
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(10.8, 1.45, 1.84).translate(-3.1, 0.32, 0),
      MILLED_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(3.6, 1.15, 0.68).translate(-8.9, 0.55, 0),
      MILLED_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(1.65, 1.25, 0.88).translate(0.18, -0.58, 0),
      MILLED_DARK
    )
  );

  // 3. Angled .50 AE Magwell Rectangular Tunnel + Mag-catch mortise
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(4.26, 13.8, 1.72)
        .rotateZ(DEAGLE_GRIP_ANGLE)
        .translate(-5.35, -4.65, 0),
      MILLED_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.42, 0.42, 2.9, 18)
        .rotateX(Math.PI / 2)
        .translate(-2.48, -2.18, 0),
      MILLED_DARK
    )
  );

  // Horizontal traction serrations across gleaming chrome front strap!
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const fx = -2.35 - u * 1.25;
    const fy = -3.15 - u * 5.85;
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.18, 0.1, 2.75)
          .rotateZ(DEAGLE_GRIP_ANGLE)
          .translate(fx, fy, 0),
        MILLED_DARK
      )
    );
  }

  // Cross-pin holes: Takedown cam (3.15, 0.36), Trigger pin (0.35, -0.35), Sear (-6.68, 0.45), Hammer (-7.55, 0.62)
  const pins: [number, number, number][] = [
    [3.15, 0.36, 0.24],
    [0.35, -0.35, 0.16],
    [-6.68, 0.45, 0.14],
    [-7.55, 0.62, 0.17],
  ];
  for (const [px, py, pr] of pins) {
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(pr, pr, 3.0, 18)
          .rotateX(Math.PI / 2)
          .translate(px, py, 0),
        MILLED_DARK
      )
    );
  }

  return applyDeagleChromeUVs(csgSubtract(solidFrame, cutters), {
    xMin: -10.5,
    xSpan: 26.3,
    yMin: -0.4,
    ySpan: 3.6,
  });
}

/** F-02: Rotating Barrel Takedown Lever & Left Checkered Release Pin (assembledPos: [3.15, 0.36, 0]) */
export function buildDeagleTakedownLeverGeometry(): THREE.BufferGeometry {
  // Half-moon transverse cam shaft locking barrel lug
  const shaftRaw = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 2.78, 20).rotateX(Math.PI / 2),
    '#3b4452'
  );
  const halfMoonCut = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.22, 1.05).translate(0, 0.18, 0),
    '#262c36'
  );
  const shaft = csgSubtract(shaftRaw, [halfMoonCut]);

  // Right-side sculpted teardrop rotating takedown lever
  const leverShape = new THREE.Shape();
  leverShape.moveTo(0.2, -0.24);
  leverShape.lineTo(-1.25, -0.18);
  leverShape.quadraticCurveTo(-1.52, 0, -1.25, 0.22);
  leverShape.lineTo(0.2, 0.26);
  leverShape.quadraticCurveTo(0.38, 0, 0.2, -0.24);
  leverShape.closePath();

  const lever = new THREE.ExtrudeGeometry(leverShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  lever.translate(0, 0, 1.34);
  paintGeometry(lever, NITRIDE_DARK);

  // Left-side checkered push-button head
  const leftBtnRaw = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.18, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -1.4),
    '#586476'
  );
  const btnGroove = paintGeometry(
    new THREE.BoxGeometry(0.6, 0.05, 0.06).translate(0, 0, -1.48),
    '#262c36'
  );
  const leftBtn = csgSubtract(leftBtnRaw, [btnGroove]);

  return mergeParts([shaft, lever, leftBtn]);
}

/** F-03: Extended Left-Side Slide Stop Release Lever (assembledPos: [-0.85, 0.42, -1.38]) */
export function buildDeagleSlideStopGeometry(): THREE.BufferGeometry {
  const pivotBoss = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 0.18, 20)
      .rotateX(Math.PI / 2)
      .translate(1.85, -0.08, 0),
    '#3b4452'
  );
  const armBar = paintGeometry(
    new THREE.BoxGeometry(4.15, 0.28, 0.14)
      .rotateZ(-0.08)
      .translate(-0.15, 0.08, 0),
    NITRIDE_DARK
  );
  const shelfRaw = paintGeometry(
    new THREE.BoxGeometry(0.98, 0.46, 0.26).translate(-2.05, 0.26, -0.06),
    '#586476'
  );
  const shelfSerrs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    shelfSerrs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.84, 0.05, 0.08).translate(
          -2.05,
          0.16 + i * 0.1,
          -0.18
        ),
        '#262c36'
      )
    );
  }
  const thumbShelf = csgSubtract(shelfRaw, shelfSerrs);

  const followerLug = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.2, 0.56).translate(-1.65, 0.18, 0.26),
    CHROME_BODY
  );
  return mergeParts([pivotBoss, armBar, thumbShelf, followerLug]);
}

/** F-04: Checkered Magazine Catch Button & Coil Spring (assembledPos: [-2.48, -2.18, 0]) */
export function buildDeagleMagCatchGeometry(): THREE.BufferGeometry {
  const crossBar = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.82, 2.66).rotateZ(DEAGLE_GRIP_ANGLE),
    '#3b4452'
  );
  const leftBtnRaw = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.38, 0.22, 22)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -1.4),
    '#454f5e'
  );
  const checks: THREE.BufferGeometry[] = [];
  for (let i = -2; i <= 2; i++) {
    checks.push(
      paintGeometry(
        new THREE.BoxGeometry(0.78, 0.04, 0.06).translate(0, i * 0.12, -1.5),
        '#262c36'
      )
    );
  }
  const leftButton = csgSubtract(leftBtnRaw, checks);

  const rightFace = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 0.12, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 1.32),
    '#3b4452'
  );

  const catchSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.35,
      end: 0.55,
      centerX: 0,
      centerZ: 0.45,
      coilRadius: 0.14,
      wireRadius: 0.026,
      coils: 5,
    }).rotateX(Math.PI / 2),
    '#94a3b8'
  );
  return mergeParts([crossBar, leftButton, rightFace, catchSpring]);
}

/**
 * F-05: Iconic Wrap-Around Black Stippled IMI/MR Rubber Grip (assembledPos: [0, 0, 0], polymer_frame)
 * Features sculpted palm-swell side contours, recessed stipple panel border grooves, 3 horizontal front-seam
 * traction ribs, high thumb-web scallops, and cross retention pin while preserving flush magwell base!
 */
export function buildDeagleGripGeometry(): THREE.BufferGeometry {
  const gripProfile = new THREE.Shape();
  // Front vertical seam of wrap-around rubber side panels (leaves gleaming chrome front strap exposed!)
  gripProfile.moveTo(-2.72, -1.65);
  gripProfile.lineTo(-4.48, -10.12);
  // Exact flush bottom line matching frame & .50 AE magazine baseplate!
  gripProfile.lineTo(-9.25, -9.75);
  // Arched ergonomic backstrap rising to thumb-web saddle beneath chrome beavertail
  gripProfile.bezierCurveTo(-8.75, -7.25, -7.95, -4.15, -7.28, -1.25);
  gripProfile.quadraticCurveTo(-6.95, -0.78, -5.85, -0.88);
  gripProfile.quadraticCurveTo(-3.95, -1.12, -2.72, -1.65);
  gripProfile.closePath();

  const outerRubber = new THREE.ExtrudeGeometry(gripProfile, {
    depth: 2.98,
    bevelEnabled: true,
    bevelThickness: 0.085,
    bevelSize: 0.075,
    bevelSegments: 3,
    curveSegments: 16,
  });
  outerRubber.translate(0, 0, -1.49);
  paintGeometry(outerRubber, RUBBER_BLACK);

  // Subtle ergonomic palm-swell pads blended onto left & right grip flanks
  const palmSwells: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    palmSwells.push(
      paintGeometry(
        new THREE.SphereGeometry(1.65, 18, 14)
          .scale(1.15, 2.25, 0.14)
          .rotateZ(DEAGLE_GRIP_ANGLE)
          .translate(-6.25, -5.85, sign * 1.38),
        '#2a2f38'
      )
    );
  }
  const swelledGrip = mergeParts([outerRubber, ...palmSwells]);

  const cutters: THREE.BufferGeometry[] = [];

  // Hollow internal U-channel pocket that slides forward onto the chrome steel grip frame!
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(5.2, 11.2, 2.58)
        .rotateZ(DEAGLE_GRIP_ANGLE)
        .translate(-5.35, -5.25, 0),
      RUBBER_DARK
    )
  );

  // Mag-catch button clearance cutout on upper-front left & right grip edges
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.48, 0.48, 3.4, 20)
        .rotateX(Math.PI / 2)
        .translate(-2.48, -2.18, 0),
      RUBBER_DARK
    )
  );

  // Ergonomic thumb-rest scallops + horizontal finger-groove relief flutes + retention pin dimples
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.SphereGeometry(0.76, 16, 12)
          .scale(1.58, 0.74, 0.36)
          .translate(-5.65, -1.65, sign * 1.55),
        RUBBER_DARK
      )
    );
    // 3 horizontal ergonomic traction grooves near front grip border
    for (let j = 0; j < 3; j++) {
      const gy = -4.05 - j * 1.75;
      const gx = -3.22 - j * 0.36;
      cutters.push(
        paintGeometry(
          new THREE.BoxGeometry(1.35, 0.14, 0.18)
            .rotateZ(DEAGLE_GRIP_ANGLE)
            .translate(gx, gy, sign * 1.52),
          RUBBER_DARK
        )
      );
    }
    // Lower rear grip retention pin recess
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.14, 0.14, 0.25, 14)
          .rotateX(Math.PI / 2)
          .translate(-8.25, -8.55, sign * 1.48),
        RUBBER_DARK
      )
    );
  }

  return applyDeagleGripUVs(csgSubtract(swelledGrip, cutters));
}

/**
 * T-01: Exposed Skeletonized Single-Action Spur Hammer (assembledPos: [-7.55, 0.62, 0])
 * Baked in true SA cocked-back rearward pose at f = 0 (worldY_max = +1.74, clearing below recoiling
 * bolt/safety/firing-pin while hovering cleanly above chrome beavertail); swings up & forward (rz < 0)
 * on trigger break to strike the exposed firing-pin head at Y = 2.60!
 */
export function buildDeagleHammerGeometry(): THREE.BufferGeometry {
  const pivotHub = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.56, 20).rotateX(Math.PI / 2),
    '#3b4452'
  );

  const hammerShape = new THREE.Shape();
  hammerShape.moveTo(-0.34, -0.24); // Rear strut pin ear
  hammerShape.lineTo(0.18, -0.2);
  hammerShape.lineTo(0.3, -0.02); // Primary crisp SA full-cock sear hook!
  hammerShape.lineTo(0.18, 0.08);
  hammerShape.lineTo(0.28, 0.22); // Half-cock safety intercept notch!
  hammerShape.lineTo(0.05, 0.56);
  hammerShape.lineTo(-1.58, 1.12); // Upper flat firing-pin striking face
  hammerShape.lineTo(-1.92, 1.06);
  // Iconic rearward-cocked Desert Eagle combat thumb spur!
  hammerShape.lineTo(-2.82, 0.68);
  hammerShape.quadraticCurveTo(-2.9, 0.48, -2.62, 0.4);
  hammerShape.lineTo(-1.68, 0.56);
  hammerShape.quadraticCurveTo(-0.92, 0.34, -0.34, -0.24);
  hammerShape.closePath();

  // Skeletonized elongated teardrop lightening cutout in hammer body
  const lightHole = new THREE.Path();
  lightHole.absellipse(-1.38, 0.72, 0.3, 0.14, 0, Math.PI * 2, false, -0.24);
  hammerShape.holes.push(lightHole);

  const bodyRaw = new THREE.ExtrudeGeometry(hammerShape, {
    depth: 0.44,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  bodyRaw.translate(0, 0, -0.22);
  paintGeometry(bodyRaw, NITRIDE_DARK);

  // 5 Crisp Cross-Serrations across top of cocked hammer spur + pivot pin bore
  const spurCuts: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.14, 0.14, 0.72, 16).rotateX(Math.PI / 2),
      '#262c36'
    ),
  ];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    spurCuts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.085, 0.12, 0.56)
          .rotateZ(0.38)
          .translate(-1.98 - t * 0.72, 1.05 - t * 0.31, 0),
        '#262c36'
      )
    );
  }

  return mergeParts([csgSubtract(mergeParts([pivotHub, bodyRaw]), spurCuts)]);
}

/**
 * T-02: Hammer Strut Rod & Dual-Coil Mainspring Plunger Assembly
 * (assembledPos: [-8.15, -3.85, 0], assembledRot: [0, 0, DEAGLE_GRIP_ANGLE])
 */
export function buildDeagleHammerStrutGeometry(): THREE.BufferGeometry {
  const strutRod = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 7.6, 16).translate(0, 0.45, 0),
    CHROME_BODY
  );
  const topYoke = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.48, 0.22).translate(0, 4.25, 0),
    CHROME_MIRROR
  );
  const mainSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -3.2,
      end: 1.95,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.22,
      wireRadius: 0.042,
      coils: 18,
    }),
    '#9aa8ba'
  );
  const baseCap = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.26, 0.42, 18).translate(0, -3.35, 0),
    NITRIDE_DARK
  );
  return mergeParts([strutRod, topYoke, mainSpring, baseCap]);
}

/**
 * T-03: Curved Single-Action Trigger Shoe & Dual Stamped Transfer Bar (assembledPos: [0.35, -0.35, 0])
 * Pivot at local (0, 0, 0): pulling trigger (rz < 0) swings lower shoe rearward (-X) and drives transfer bar!
 */
export function buildDeagleTriggerGeometry(): THREE.BufferGeometry {
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.92, 18).rotateX(Math.PI / 2),
    CHROME_BODY
  );

  // Wide serrated Desert Eagle curved SA trigger shoe
  const shoeShape = new THREE.Shape();
  shoeShape.moveTo(-0.28, 0.18);
  shoeShape.lineTo(0.28, 0.18);
  shoeShape.bezierCurveTo(0.05, -0.68, 0.08, -1.55, 0.42, -2.18);
  shoeShape.quadraticCurveTo(0.24, -2.42, 0.02, -2.32);
  shoeShape.bezierCurveTo(-0.38, -1.65, -0.42, -0.72, -0.28, 0.18);
  shoeShape.closePath();

  const shoeRaw = new THREE.ExtrudeGeometry(shoeShape, {
    depth: 0.56,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  shoeRaw.translate(0, 0, -0.28);
  paintGeometry(shoeRaw, NITRIDE_DARK);

  // Longitudinal traction grooves on curved front face of trigger shoe
  const faceGrooves: THREE.BufferGeometry[] = [];
  for (let zIdx = -1; zIdx <= 1; zIdx++) {
    faceGrooves.push(
      paintGeometry(
        new THREE.BoxGeometry(0.08, 1.65, 0.06)
          .rotateZ(-0.14)
          .translate(0.18, -1.18, zIdx * 0.16),
        '#262c36'
      )
    );
  }
  const shoe = csgSubtract(shoeRaw, faceGrooves);

  // Dual Stamped Stainless Transfer Bars wrapping around both sides of .50 AE magwell back to sear!
  const bars: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    const bar = paintGeometry(
      new THREE.BoxGeometry(6.95, 0.26, 0.09).translate(
        -3.45,
        0.68,
        sign * 0.88
      ),
      CHROME_BODY
    );
    const frontLink = paintGeometry(
      new THREE.BoxGeometry(0.42, 0.62, 0.12).translate(
        -0.05,
        0.42,
        sign * 0.62
      ),
      CHROME_BODY
    );
    const rearHook = paintGeometry(
      new THREE.BoxGeometry(0.48, 0.38, 0.28).translate(
        -6.85,
        0.78,
        sign * 0.72
      ),
      CHROME_MIRROR
    );
    bars.push(bar, frontLink, rearHook);
  }

  return mergeParts([pivotPin, shoe, ...bars]);
}

/** T-04: CNC-Machined Single-Action Sear, Disconnector & Torsion Spring (assembledPos: [-6.68, 0.45, 0]) */
export function buildDeagleSearGeometry(): THREE.BufferGeometry {
  const searBlock = paintGeometry(
    new THREE.BoxGeometry(0.88, 0.62, 0.96).translate(0, 0.05, 0),
    CHROME_MIRROR
  );
  const searNose = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.24, 0.44)
      .rotateZ(-0.28)
      .translate(-0.52, 0.22, 0),
    CHROME_BODY
  );
  const disconnectorBlade = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.76, 0.18).translate(0.18, 0.46, 0.48),
    '#3b4452'
  );
  const searPin = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 1.35, 16).rotateX(Math.PI / 2),
    '#3b4452'
  );
  const searSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.48,
      end: -0.14,
      centerX: 0.12,
      centerZ: 0,
      coilRadius: 0.11,
      wireRadius: 0.024,
      coils: 4,
    }).rotateX(Math.PI / 2),
    '#9aa8ba'
  );
  return mergeParts([
    searBlock,
    searNose,
    disconnectorBlade,
    searPin,
    searSpring,
  ]);
}

/**
 * M-01: 7-Round .50 Action Express Blued Steel Magazine Body
 * (assembledPos: [-5.35, -4.65, 0], assembledRot: [0, 0, DEAGLE_GRIP_ANGLE], isShell: true)
 */
export function buildDeagleMagBodyGeometry(): THREE.BufferGeometry {
  const MAG_BLUED = '#3b4452';
  const MAG_DARK = '#252b35';

  const rx = 2.04;
  const rz = 0.78;
  const cr = 0.2;
  const sec = new THREE.Shape();
  sec.moveTo(-rx + cr, -rz);
  sec.lineTo(rx - cr, -rz);
  sec.quadraticCurveTo(rx, -rz, rx, -rz + cr);
  sec.lineTo(rx, rz - cr);
  sec.quadraticCurveTo(rx, rz, rx - cr, rz);
  sec.lineTo(-rx + cr, rz);
  sec.quadraticCurveTo(-rx, rz, -rx, rz - cr);
  sec.lineTo(-rx, -rz + cr);
  sec.quadraticCurveTo(-rx, -rz, -rx + cr, -rz);
  sec.closePath();

  const tube = new THREE.ExtrudeGeometry(sec, {
    depth: 11.4,
    bevelEnabled: false,
    curveSegments: 10,
  });
  tube.rotateX(-Math.PI / 2);
  tube.translate(0, -6.1, 0);
  paintGeometry(tube, MAG_BLUED);

  // Angled Single-Feed Steel Feed Lips at top (ly = +5.30 .. +5.62)
  const lipL = paintGeometry(
    new THREE.BoxGeometry(3.58, 0.4, 0.14)
      .rotateX(0.36)
      .translate(-0.12, 5.42, -0.52),
    CHROME_BODY
  );
  const lipR = paintGeometry(
    new THREE.BoxGeometry(3.58, 0.4, 0.14)
      .rotateX(-0.36)
      .translate(-0.12, 5.42, 0.52),
    CHROME_BODY
  );

  const solid = mergeParts([tube, lipL, lipR]);

  const cutters: THREE.BufferGeometry[] = [
    // Exact bottom plane cutter matching grip/baseplate slope ly(lx) = -5.484 + 0.1848*lx
    paintGeometry(
      new THREE.BoxGeometry(6.0, 2.4, 2.4)
        .rotateZ(0.1827)
        .translate(0, -6.684, 0),
      MAG_DARK
    ),
    // Hollow internal .50 AE cartridge column
    paintGeometry(
      new THREE.BoxGeometry(3.82, 11.6, 1.32).translate(0, 0.05, 0),
      MAG_DARK
    ),
    // Top center cartridge stripping slot & front bullet-ogive feed-ramp notch
    paintGeometry(
      new THREE.BoxGeometry(3.85, 0.95, 0.84).translate(0.15, 5.38, 0),
      MAG_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.72, 0.65, 1.8).translate(1.92, 5.18, 0),
      MAG_DARK
    ),
    // Left-front magazine catch locking window
    paintGeometry(
      new THREE.BoxGeometry(0.58, 0.36, 0.34).translate(1.55, 2.65, -0.76),
      MAG_DARK
    ),
  ];

  // Side reinforcement ribs + 7 Round-Count Witness Holes on both flanks!
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.45, 7.6, 0.09).translate(
          0.68,
          -0.65,
          sign * 0.79
        ),
        MAG_DARK
      )
    );
  }
  for (let i = 0; i < 7; i++) {
    const wy = 3.2 - i * 1.15;
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.135, 0.135, 1.85, 14)
          .rotateX(Math.PI / 2)
          .translate(-0.95, wy, 0),
        CHROME_BODY
      )
    );
  }

  return csgSubtract(solid, cutters);
}

/**
 * M-02: .50 AE Concave Cartridge-Saddle Follower
 * (assembledPos: [-4.12, -0.05, 0], assembledRot: [0, 0, DEAGLE_GRIP_ANGLE])
 */
export function buildDeagleMagFollowerGeometry(): THREE.BufferGeometry {
  const baseBlock = paintGeometry(
    new THREE.BoxGeometry(3.72, 0.48, 1.26),
    '#f97316'
  );
  const guideRail = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.38, 3.62, 18)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.24, 0.24),
    '#fb923c'
  );
  const stopActuator = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.32, 0.28).translate(1.28, 0.24, -0.62),
    '#ea580c'
  );
  const frontSkirt = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.72, 1.16).translate(1.68, -0.46, 0),
    '#ea580c'
  );
  const rearSkirt = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.72, 1.16).translate(-1.68, -0.46, 0),
    '#ea580c'
  );
  return mergeParts([
    baseBlock,
    guideRail,
    stopActuator,
    frontSkirt,
    rearSkirt,
  ]);
}

/**
 * M-03: Heavy-Duty .50 AE Rectangular Coil Magazine Spring
 * (assembledPos: [-5.67, -5.86, 0], assembledRot: [0, 0, DEAGLE_GRIP_ANGLE])
 */
export function buildDeagleMagSpringGeometry(): THREE.BufferGeometry {
  return paintGeometry(
    createRectangularMagSpring({
      height: 6.2,
      widthX: 3.35,
      depthZ: 1.12,
      wireRadius: 0.064,
      coils: 8,
    }),
    '#9aa8ba'
  );
}

/**
 * M-04: Flush-Fit .50 AE Magazine Baseplate & Locking Insert
 * (assembledPos: [-6.769, -9.947, 0], assembledRot: [0, 0, DEAGLE_GRIP_ANGLE])
 */
export function buildDeagleMagBaseplateGeometry(): THREE.BufferGeometry {
  const m = 0.1848;
  const xRear = -2.36;
  const xFront = 2.86;
  const padShape = new THREE.Shape();
  padShape.moveTo(xRear, m * xRear - 0.34);
  padShape.lineTo(xFront - 0.18, m * (xFront - 0.18) - 0.36);
  padShape.quadraticCurveTo(
    xFront + 0.08,
    m * xFront - 0.12,
    xFront,
    m * xFront
  );
  padShape.lineTo(xRear + 0.06, m * (xRear + 0.06));
  padShape.quadraticCurveTo(
    xRear - 0.04,
    m * xRear - 0.16,
    xRear,
    m * xRear - 0.34
  );
  padShape.closePath();

  const pad = new THREE.ExtrudeGeometry(padShape, {
    depth: 1.98,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  pad.translate(0, 0, -0.99);
  paintGeometry(pad, '#313640');

  const punchHole = paintGeometry(
    new THREE.CylinderGeometry(0.23, 0.23, 0.2, 16)
      .rotateZ(0.1827)
      .translate(0, -0.32, 0),
    '#242830'
  );
  const carvedPad = csgSubtract(pad, [punchHole]);

  const lockInsert = paintGeometry(
    new THREE.BoxGeometry(3.74, 0.24, 1.28)
      .rotateZ(0.1827)
      .translate(0, 0.16, 0),
    NITRIDE_DARK
  );

  const detentButton = paintGeometry(
    new THREE.CylinderGeometry(0.19, 0.19, 0.4, 18)
      .rotateZ(0.1827)
      .translate(0, -0.14, 0),
    CHROME_BODY
  );

  return mergeParts([carvedPad, lockInsert, detentButton]);
}
