import * as THREE from 'three';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo as readTriInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  csgSubtract,
  createHelicalSpring,
  createRectangularMagSpring,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';

/**
 * Maps p320_slide triangles onto the 2048x2048 p320_m17_{albedo,normal,roughness}.png atlas:
 *  - Right wall:   u in [0.02, 0.98], v in [0.76, 0.98] (UID matrix & US M17 9mmx19)
 *  - Left wall:    u in [0.02, 0.98], v in [0.52, 0.74] (SIG SAUER P320 M17)
 *  - Top/chamfers: u in [0.02, 0.56], v in [0.45, 0.50]
 *  - Milled cuts:  u in [0.60, 0.98], v in [0.45, 0.50]
 */
export function applyP320SlideAtlasUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = readTriInfo(pos, col, i, i + 1, i + 2);

    let mode: 'milled' | 'right' | 'left' | 'deck' = 'deck';
    if (cr < 0.16) {
      mode = 'milled';
    } else if (fnz > 0.28 && cz > 0.35) {
      mode = 'right';
    } else if (fnz < -0.28 && cz < -0.35) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -7.85) / 19.5);
      const yNorm = clamp01((y - 0.88) / 2.72);

      let u: number;
      let v: number;
      if (mode === 'milled') {
        u = 0.6 + fractPos((x + z) * 0.11) * 0.36;
        v = 0.452 + fractPos(y * 0.22) * 0.046;
      } else if (mode === 'right') {
        u = 0.02 + xNorm * 0.96;
        v = 0.76 + yNorm * 0.22;
      } else if (mode === 'left') {
        u = 0.02 + (1.0 - xNorm) * 0.96;
        v = 0.52 + yNorm * 0.22;
      } else {
        u = 0.02 + xNorm * 0.54;
        v = 0.452 + clamp01((z + 1.32) / 2.64) * 0.046;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Maps p320_grip_module triangles onto the Coyote FDE Polymer Grip zones of p320_m17_*.png:
 *  - Right flank + stipple + SIG SAUER medallion: u in [0.02, 0.72], v in [0.23, 0.44]
 *  - Left flank + stipple + SIG SAUER medallion:  u in [0.02, 0.72], v in [0.01, 0.22]
 *  - Front/back/rail/inner Coyote FDE surfaces:   u in [0.75, 0.98], v in [0.02, 0.14]
 */
export function applyP320GripAtlasUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz } = readTriInfo(pos, col, i, i + 1, i + 2);

    let mode: 'right' | 'left' | 'edge' = 'edge';
    if (fnz >= 0.34 && cz > 0.22) {
      mode = 'right';
    } else if (fnz <= -0.34 && cz < -0.22) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -9.1) / 18.8);
      const yNorm = clamp01((y - -9.7) / 10.8);

      let u: number;
      let v: number;
      if (mode === 'right') {
        u = 0.02 + xNorm * 0.7;
        v = 0.23 + yNorm * 0.21;
      } else if (mode === 'left') {
        u = 0.02 + (1.0 - xNorm) * 0.7;
        v = 0.01 + yNorm * 0.21;
      } else {
        u = 0.755 + fractPos((x + y * 0.4) * 0.09) * 0.22;
        v = 0.025 + clamp01((z + 1.35) / 2.7) * 0.11;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Maps p320_fcu_chassis triangles onto the Stainless FCU zones of p320_m17_*.png:
 *  - Right-side serialized plate (cr > 0.84): u in [0.75, 0.98], v in [0.30, 0.43] ("TF004912")
 *  - Brushed 17-4 PH stainless chassis & rails: u in [0.75, 0.98], v in [0.16, 0.28]
 */
export function applyP320FcuAtlasUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr, fnz, cz } = readTriInfo(pos, col, i, i + 1, i + 2);
    const isSerialFace = cr > 0.84 && fnz > 0.65 && cz > 0.75;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (isSerialFace) {
        const xn = clamp01((x - -1.24) / 2.2);
        const yn = clamp01((y - 0.02) / 0.6);
        u = 0.75 + xn * 0.23;
        v = 0.3 + yn * 0.13;
      } else {
        u = 0.755 + fractPos(x * 0.12) * 0.22;
        v = 0.165 + fractPos((y + z) * 0.28) * 0.11;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Maps Coyote FDE Magazine Baseplate onto the Coyote FDE Polymer Swatch of p320_m17_*.png.
 */
export function applyP320FdePatchUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    uvs[i * 2] = 0.755 + clamp01((x + 1.65) / 3.3) * 0.22;
    uvs[i * 2 + 1] = 0.025 + clamp01((z + y * 0.35 + 1.2) / 2.4) * 0.11;
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// GROUP 3: MODULAR STAINLESS FCU CHASSIS & M17 FIRE CONTROL (5 Builders)
// ============================================================================

/**
 * FCU-01: Removable Serialized Stainless-Steel Fire Control Unit Chassis (p320_fcu_chassis)
 * Unified stamped & CNC 17-4 PH stainless receiver insert featuring:
 *  - 4 precision undercut slide guide rails (front & rear pairs)
 *  - Integral front CNC barrel locking block w/ 38° cam ramp & pull-down hook
 *  - Stamped left-flank Takedown Safety Lever (magazine-out takedown interlock!)
 *  - Rear sear housing retention tabs & flat-blade bent 9mm fixed ejector
 *  - Right-flank serialized plate ("TF004912", cr > 0.84) visible through grip window!
 */
export function buildP320FcuChassisGeometry(): THREE.BufferGeometry {
  const FCU_STEEL = '#cfd8e3';
  const FCU_DARK = '#94a3b8';
  const SERIAL_TAG_BRIGHT = '#f8fafc'; // cr > 0.84 marker for UV mapping to "TF004912"

  // Side profile of stamped stainless FCU receiver chassis (X in [-6.55, +3.25], Y in [-0.32, +0.96])
  const sideShape = new THREE.Shape();
  sideShape.moveTo(-6.52, 0.94);
  sideShape.lineTo(3.22, 0.94);
  sideShape.lineTo(3.22, 0.24);
  sideShape.quadraticCurveTo(2.75, -0.14, 1.95, -0.16);
  sideShape.lineTo(-0.45, -0.28);
  sideShape.lineTo(-2.15, -0.28);
  sideShape.lineTo(-2.75, 0.08);
  sideShape.lineTo(-4.65, 0.08);
  sideShape.lineTo(-5.05, -0.26);
  sideShape.lineTo(-6.32, -0.22);
  sideShape.quadraticCurveTo(-6.58, 0.12, -6.52, 0.94);
  sideShape.closePath();

  const rawChassis = new THREE.ExtrudeGeometry(sideShape, {
    depth: 1.84,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 12,
  });
  rawChassis.translate(0, 0, -0.92);
  paintGeometry(rawChassis, FCU_STEEL);

  const cutters: THREE.BufferGeometry[] = [
    // Hollow U-channel interior leaving crisp 0.19 cm stamped stainless side walls
    paintGeometry(
      new THREE.BoxGeometry(9.25, 1.25, 1.44).translate(-1.62, 0.46, 0),
      FCU_DARK
    ),
    // Bottom open pass-throughs for magazine feed column & trigger shoe
    paintGeometry(
      new THREE.BoxGeometry(3.15, 0.95, 1.46).translate(-3.65, -0.08, 0),
      FCU_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(1.45, 0.85, 0.92).translate(0.05, -0.12, 0),
      FCU_DARK
    ),
    // Takedown lever cross-bore (X = +1.85, Y = +0.42), trigger pivot, slide-catch post & sear/safety bores
    paintGeometry(
      new THREE.CylinderGeometry(0.22, 0.22, 2.3, 20)
        .rotateX(Math.PI / 2)
        .translate(1.85, 0.42, 0),
      FCU_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.14, 0.14, 2.3, 18)
        .rotateX(Math.PI / 2)
        .translate(0.05, 0.25, 0),
      FCU_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.12, 0.12, 2.3, 18)
        .rotateX(Math.PI / 2)
        .translate(-5.15, 0.62, 0),
      FCU_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 2.3, 18)
        .rotateX(Math.PI / 2)
        .translate(-5.75, 0.76, 0),
      FCU_DARK
    ),
  ];

  const stampedU = csgSubtract(rawChassis, cutters);

  // Integral Front CNC Barrel Locking Block w/ 38° unlocking cam ramp & pull-down hook
  const rampShape = new THREE.Shape();
  rampShape.moveTo(-0.08, 0.2);
  rampShape.lineTo(1.66, 0.2);
  rampShape.lineTo(1.66, 0.88);
  rampShape.lineTo(1.12, 0.88);
  rampShape.lineTo(0.46, 0.44);
  rampShape.lineTo(0.12, 0.44);
  rampShape.lineTo(-0.08, 0.68);
  rampShape.closePath();

  const camBlock = new THREE.ExtrudeGeometry(rampShape, {
    depth: 1.34,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  camBlock.translate(0, 0, -0.67);
  paintGeometry(camBlock, FCU_STEEL);

  // 4 Precision Undercut Stainless Slide Guide Rails + Rear Sear Housing Retention Tabs
  const rails: THREE.BufferGeometry[] = [];
  const railSpans: [number, number][] = [
    [2.28, 1.86],
    [-5.38, 2.12],
  ];
  for (const [rx, rLen] of railSpans) {
    for (const sign of [-1, 1]) {
      const railFlange = paintGeometry(
        new THREE.BoxGeometry(rLen, 0.11, 0.25).translate(
          rx,
          1.03,
          sign * 0.99
        ),
        FCU_STEEL
      );
      const railRiser = paintGeometry(
        new THREE.BoxGeometry(rLen, 0.18, 0.12).translate(
          rx,
          0.95,
          sign * 0.89
        ),
        FCU_STEEL
      );
      rails.push(railFlange, railRiser);
    }
  }
  // Rear FCU indexing lug & trigger-return-spring anchor hook on right wall
  const rearAnchorLug = paintGeometry(
    new THREE.BoxGeometry(0.54, 0.36, 1.38).translate(-6.22, 0.02, 0),
    FCU_DARK
  );
  const springHookTab = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.24, 0.14).translate(-2.55, 0.16, 0.98),
    FCU_STEEL
  );

  // Signature P320 Left-Wall Stamped Takedown Safety Lever (interlocks takedown lever w/ magwell & sear!)
  const takedownSafetyLever = paintGeometry(
    new THREE.BoxGeometry(4.85, 0.22, 0.08)
      .rotateZ(-0.04)
      .translate(-0.72, 0.54, -0.97),
    '#bac6d4'
  );
  const takedownSafetyRing = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 0.08, 18)
      .rotateX(Math.PI / 2)
      .translate(1.85, 0.42, -0.97),
    '#bac6d4'
  );
  const takedownRingHole = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 0.18, 18)
      .rotateX(Math.PI / 2)
      .translate(1.85, 0.42, -0.97),
    FCU_DARK
  );
  const safetyLeverUnit = mergeParts([
    takedownSafetyLever,
    csgSubtract(takedownSafetyRing, [takedownRingHole]),
  ]);

  // Integral Stamped Flat-Blade Bent Fixed 9mm Ejector on Left Rear FCU Wall!
  const ejectorRiser = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.36, 0.1).translate(-4.65, 1.06, -0.52),
    FCU_STEEL
  );
  const ejectorBlade = paintGeometry(
    new THREE.BoxGeometry(1.75, 0.22, 0.09)
      .rotateY(-0.14)
      .translate(-3.45, 1.25, -0.38),
    FCU_STEEL
  );

  // Right-side Serialized Window Plate ("TF004912" visible right through Grip Module window!)
  // Must maintain cr > 0.84, fnz > 0.65, cz > 0.75 for applyP320FcuAtlasUVs!
  const serialPlate = paintGeometry(
    new THREE.BoxGeometry(2.2, 0.6, 0.06).translate(-0.14, 0.32, 0.95),
    SERIAL_TAG_BRIGHT
  );

  const merged = mergeParts([
    stampedU,
    camBlock,
    ...rails,
    rearAnchorLug,
    springHookTab,
    safetyLeverUnit,
    ejectorRiser,
    ejectorBlade,
    serialPlate,
  ]);
  return applyP320FcuAtlasUVs(merged);
}

/**
 * FCU-02: M17 Curved Solid Nitride Steel Trigger Shoe (pivots around local [0, 0, 0])
 * World assembledPos = [0.05, 0.25, 0]; rz < 0 pulls trigger shoe rearward (-X).
 */
export function buildP320TriggerShoeGeometry(): THREE.BufferGeometry {
  const TRIG_BLACK = '#454f5e';
  const TRIG_PIN = '#cbd5e1';

  const shoeShape = new THREE.Shape();
  shoeShape.moveTo(-0.28, 0.44);
  shoeShape.lineTo(0.32, 0.44);
  shoeShape.lineTo(0.28, -0.15);
  shoeShape.bezierCurveTo(0.34, -0.78, 0.26, -1.48, -0.02, -2.02);
  shoeShape.quadraticCurveTo(-0.18, -2.36, -0.42, -2.32);
  shoeShape.quadraticCurveTo(-0.56, -2.26, -0.44, -1.94);
  shoeShape.bezierCurveTo(-0.18, -1.38, -0.18, -0.68, -0.28, 0.44);
  shoeShape.closePath();

  const shoeBody = new THREE.ExtrudeGeometry(shoeShape, {
    depth: 0.58,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 16,
  });
  shoeBody.translate(0, 0, -0.29);
  paintGeometry(shoeBody, TRIG_BLACK);

  const pivotHole = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 0.9, 18).rotateX(Math.PI / 2),
    '#262c36'
  );
  const clevisSlot = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.36, 0.22).translate(0.14, 0.28, 0.24),
    '#262c36'
  );
  const carvedShoe = csgSubtract(shoeBody, [pivotHole, clevisSlot]);

  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.115, 0.115, 1.78, 16).rotateX(Math.PI / 2),
    TRIG_PIN
  );

  const upperLinkStud = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.54, 14)
      .rotateX(Math.PI / 2)
      .translate(0.16, 0.3, 0.38),
    TRIG_PIN
  );

  return mergeParts([carvedShoe, pivotPin, upperLinkStud]);
}

/**
 * FCU-03: Stamped Stainless Trigger Bar & Coiled Return Spring (along Right FCU Flank)
 */
export function buildP320TriggerBarGeometry(): THREE.BufferGeometry {
  const BAR_STEEL = '#dce4ee';
  const SPRING_COL = '#9aa8ba';

  const frontClevisRaw = paintGeometry(
    new THREE.BoxGeometry(0.64, 0.48, 0.09).translate(0.12, 0.54, 0.82),
    BAR_STEEL
  );
  const studHole = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 0.24, 14)
      .rotateX(Math.PI / 2)
      .translate(0.21, 0.55, 0.82),
    '#64748b'
  );
  const frontClevis = csgSubtract(frontClevisRaw, [studHole]);

  const clevisBridge = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.16, 0.28).translate(0.02, 0.56, 0.9),
    BAR_STEEL
  );

  const longBar = paintGeometry(
    new THREE.BoxGeometry(5.55, 0.26, 0.085).translate(-2.58, 0.62, 0.98),
    BAR_STEEL
  );

  // Upward disconnector cam lobe & safety-lever actuator fin
  const disconnectLobe = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.46, 0.09).translate(-3.95, 0.92, 0.98),
    '#f1f5f9'
  );

  // Inward-bent rear sear actuator tang & safety-lever cam tab
  const rearInwardTab = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.22, 0.54).translate(-5.18, 0.66, 0.74),
    '#f1f5f9'
  );
  const springArm = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.42, 0.085).translate(-0.52, 0.36, 0.98),
    BAR_STEEL
  );

  // Coiled trigger return tension spring along lower right FCU recess
  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -2.48,
      end: -0.56,
      centerY: 0.16,
      centerZ: 0.98,
      coilRadius: 0.13,
      wireRadius: 0.028,
      coils: 11,
    }),
    SPRING_COL
  );

  return mergeParts([
    frontClevis,
    clevisBridge,
    longBar,
    disconnectLobe,
    rearInwardTab,
    springArm,
    returnSpring,
  ]);
}

/**
 * FCU-04: Dual-Notch MIM Stainless Sear, Striker Safety Lever & Polymer Sear Housing
 * Local origin at sear pivot [-5.15, 0.62, 0].
 */
export function buildP320SearGroupGeometry(): THREE.BufferGeometry {
  const housing = paintGeometry(
    new THREE.BoxGeometry(1.82, 0.9, 1.28).translate(-0.18, -0.22, 0),
    '#313640'
  );
  const housingPocket = paintGeometry(
    new THREE.BoxGeometry(1.3, 0.78, 0.84).translate(-0.08, -0.04, 0),
    '#242830'
  );
  const carvedHousing = csgSubtract(housing, [housingPocket]);

  // Precision MIM Stainless Pivoting Sear with primary & secondary drop-safe engagement steps
  const searShape = new THREE.Shape();
  searShape.moveTo(-0.42, -0.16);
  searShape.lineTo(0.44, -0.16);
  searShape.lineTo(0.36, 0.46);
  searShape.lineTo(0.2, 0.52); // Secondary drop-safe intercept shelf!
  searShape.lineTo(0.2, 0.66);
  searShape.lineTo(0.08, 0.82); // Primary full-cock sear nose (world Y = 1.44)
  searShape.lineTo(-0.16, 0.78);
  searShape.lineTo(-0.36, 0.35);
  searShape.closePath();

  const searBody = new THREE.ExtrudeGeometry(searShape, {
    depth: 0.44,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  searBody.translate(0, 0, -0.22);
  paintGeometry(searBody, '#e2e8f0');

  // Upward-camming Striker Safety Lever alongside the sear
  const safetyLever = paintGeometry(
    new THREE.BoxGeometry(0.96, 0.18, 0.11)
      .rotateZ(0.42)
      .translate(0.55, 0.56, 0.32),
    '#cbd5e1'
  );

  const searPin = paintGeometry(
    new THREE.CylinderGeometry(0.1, 0.1, 1.56, 16).rotateX(Math.PI / 2),
    '#94a3b8'
  );

  // Twin vertical sear return coil springs
  const spL = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.52,
      end: -0.08,
      centerX: 0.15,
      centerZ: -0.14,
      coilRadius: 0.08,
      wireRadius: 0.02,
      coils: 5,
    }),
    '#9aa8ba'
  );
  const spR = spL.clone().translate(0, 0, 0.28);

  return mergeParts([carvedHousing, searBody, safetyLever, searPin, spL, spR]);
}

/**
 * FCU-05: US Army M17 Ambidextrous Manual Thumb Safety
 * Local origin at safety pivot [-5.75, 0.76, 0].
 * Features swept teardrop thumb paddles w/ horizontal traction serrations, rotary axle & sear blocker.
 */
export function buildP320ManualSafetyGeometry(): THREE.BufferGeometry {
  const SAFETY_NITRIDE = '#454f5e';
  const SAFETY_SERR = '#586476';

  const crossAxleRaw = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 2.58, 20).rotateX(Math.PI / 2),
    '#586476'
  );
  const detentNotch = paintGeometry(
    new THREE.BoxGeometry(0.12, 0.32, 0.12).translate(-0.1, 0, -0.45),
    '#262c36'
  );
  const crossAxle = csgSubtract(crossAxleRaw, [detentNotch]);

  const internalBlocker = paintGeometry(
    new THREE.BoxGeometry(0.54, 0.42, 0.26).translate(0.18, -0.06, 0.34),
    '#94a3b8'
  );

  // Sculpted swept M17 teardrop ambidextrous thumb paddles (Left & Right)
  const paddleShape = new THREE.Shape();
  paddleShape.moveTo(0.24, -0.18);
  paddleShape.quadraticCurveTo(0.28, 0.18, -0.05, 0.24);
  paddleShape.lineTo(-1.18, 0.32);
  paddleShape.quadraticCurveTo(-1.44, 0.28, -1.4, 0.04);
  paddleShape.quadraticCurveTo(-1.26, -0.18, -0.82, -0.2);
  paddleShape.closePath();

  const paddles: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    const pad = new THREE.ExtrudeGeometry(paddleShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 2,
      curveSegments: 12,
    });
    pad.translate(0, 0, sign > 0 ? 1.22 : -1.38);
    paintGeometry(pad, SAFETY_NITRIDE);

    const shelfRaw = paintGeometry(
      new THREE.BoxGeometry(1.14, 0.13, 0.26)
        .rotateZ(-0.06)
        .translate(-0.68, 0.22, sign * 1.38),
      SAFETY_SERR
    );
    const serrs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      serrs.push(
        paintGeometry(
          new THREE.BoxGeometry(0.12, 0.06, 0.28).translate(
            -1.08 + i * 0.24,
            0.27,
            sign * 1.38
          ),
          '#262c36'
        )
      );
    }
    paddles.push(pad, csgSubtract(shelfRaw, serrs));
  }

  return mergeParts([crossAxle, internalBlocker, ...paddles]);
}

// ============================================================================
// GROUP 4: 17-ROUND STEEL MAGAZINE W/ COYOTE TAN FDE BASEPLATE (4 Builders)
// ============================================================================

/**
 * M-01: SIG Sauer P320 17-Round Matte-Black Steel Double-Stack Magazine Body (isShell: true)
 * Oriented in local space along grip axis (assembledPos = [-5.25, -4.59, 0], rz = -18 deg).
 */
export function buildP320MagBodyGeometry(): THREE.BufferGeometry {
  const MAG_STEEL = '#454f5e';
  const MAG_DARK = '#262c36';
  const FEED_STEEL = '#586476';

  const rx = 1.23;
  const rz = 0.8;
  const cr = 0.22;
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

  // Main stamped steel magazine body spanning local y in [-4.80, +4.25]
  const tube = new THREE.ExtrudeGeometry(sec, {
    depth: 9.05,
    bevelEnabled: false,
    curveSegments: 10,
  });
  tube.rotateX(-Math.PI / 2);
  tube.translate(0, -4.8, 0);
  paintGeometry(tube, MAG_STEEL);

  // SIG/Mec-Gar double-stack-to-single-feed tapered upper neck (local y in [+4.15, +5.05])
  const neck = paintGeometry(
    new THREE.CylinderGeometry(0.66, 1.06, 0.92, 18)
      .scale(1.52, 1, 0.94)
      .translate(0.04, 4.65, 0),
    MAG_STEEL
  );

  const lipL = paintGeometry(
    new THREE.BoxGeometry(1.9, 0.36, 0.12)
      .rotateX(0.32)
      .translate(0.06, 5.08, -0.41),
    FEED_STEEL
  );
  const lipR = paintGeometry(
    new THREE.BoxGeometry(1.9, 0.36, 0.12)
      .rotateX(-0.32)
      .translate(0.06, 5.08, 0.41),
    FEED_STEEL
  );

  const bottomFlange = paintGeometry(
    new THREE.BoxGeometry(2.52, 0.14, 1.68).translate(0, -4.74, 0),
    MAG_STEEL
  );

  const rawMag = mergeParts([tube, neck, lipL, lipR, bottomFlange]);

  const cutters: THREE.BufferGeometry[] = [
    // Hollow steel interior + top cartridge feed throat
    paintGeometry(
      new THREE.BoxGeometry(2.12, 9.8, 1.32).translate(0, -0.05, 0),
      MAG_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.05, 1.25, 0.66).translate(0.12, 4.95, 0),
      MAG_DARK
    ),
    // Front cartridge-ogive feed ramp clearance scoop & rear FCU ejector pass-through slot
    paintGeometry(
      new THREE.CylinderGeometry(0.46, 0.46, 1.3, 16)
        .rotateX(Math.PI / 2)
        .translate(1.06, 5.12, 0),
      MAG_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.48, 0.44, 0.36).translate(-0.98, 5.05, -0.26),
      MAG_DARK
    ),
  ];

  // Ambidextrous reversible magazine catch locking windows + side anti-friction dimple ribs
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.48, 0.34, 0.34).translate(
          1.06,
          2.25,
          sign * 0.78
        ),
        MAG_DARK
      )
    );
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.55, 5.8, 0.11).translate(
          0.18,
          -0.85,
          sign * 0.81
        ),
        MAG_DARK
      )
    );
  }

  // SIG 5 / 10 / 15 / 17 witness holes on rear spine (+ right-flank round-count witness holes)
  for (let i = 0; i < 4; i++) {
    const wy = 1.9 - i * 1.55;
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.125, 0.125, 0.38, 14)
          .rotateZ(Math.PI / 2)
          .translate(-1.2, wy, 0),
        MAG_DARK
      )
    );
  }

  return csgSubtract(rawMag, cutters);
}

/** M-02: Stepped Anti-Tilt Polymer Follower */
export function buildP320MagFollowerGeometry(): THREE.BufferGeometry {
  const base = paintGeometry(
    new THREE.BoxGeometry(2.04, 0.46, 1.24),
    '#f97316'
  );
  const step = paintGeometry(
    new THREE.CylinderGeometry(0.3, 0.3, 1.98, 16)
      .rotateZ(Math.PI / 2 + 0.1)
      .scale(1, 0.82, 0.88)
      .translate(0, 0.24, 0.24),
    '#fb923c'
  );
  const catchShelf = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.28, 0.26).translate(0.64, 0.22, -0.62),
    '#ea580c'
  );
  const legF = paintGeometry(
    new THREE.BoxGeometry(0.2, 0.78, 1.1).translate(0.84, -0.5, 0),
    '#ea580c'
  );
  const legR = paintGeometry(
    new THREE.BoxGeometry(0.2, 0.78, 1.1).translate(-0.84, -0.5, 0),
    '#ea580c'
  );
  return mergeParts([base, step, catchShelf, legF, legR]);
}

/** M-03: Rectangular Coil Magazine Spring */
export function buildP320MagSpringGeometry(): THREE.BufferGeometry {
  return paintGeometry(
    createRectangularMagSpring({
      height: 6.7,
      widthX: 1.86,
      depthZ: 1.12,
      wireRadius: 0.056,
      coils: 9,
    }),
    '#9aa8ba'
  );
}

/**
 * M-04: Flush-Fit Coyote Tan FDE Polymer Magazine Baseplate & Locking Insert
 * Local y = 0 meets the bottom plane of p320_grip_module at s = 9.00 with zero gap!
 */
export function buildP320MagBaseplateGeometry(): THREE.BufferGeometry {
  const COYOTE_FDE = '#8d7251';

  const padShape = new THREE.Shape();
  padShape.moveTo(-1.52, -0.46);
  padShape.lineTo(1.66, -0.46);
  padShape.quadraticCurveTo(1.78, -0.18, 1.56, 0.03);
  padShape.lineTo(-1.52, 0.03);
  padShape.quadraticCurveTo(-1.6, -0.22, -1.52, -0.46);
  padShape.closePath();

  const pad = new THREE.ExtrudeGeometry(padShape, {
    depth: 2.12,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.045,
    bevelSegments: 2,
    curveSegments: 12,
  });
  pad.translate(0, 0, -1.06);
  paintGeometry(pad, COYOTE_FDE);

  // Side finger extraction scallops + bottom retention-stud punch hole
  const scallops: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.21, 0.21, 0.24, 16).translate(0, -0.42, 0),
      '#5c4932'
    ),
  ];
  for (const sign of [-1, 1]) {
    scallops.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.44, 0.44, 0.56, 16)
          .scale(1.32, 1, 0.36)
          .translate(0.15, -0.22, sign * 1.12),
        COYOTE_FDE
      )
    );
  }
  const carvedPad = csgSubtract(pad, scallops);

  // Upper rail collar + internal locking insert w/ retention stud
  const collar = paintGeometry(
    new THREE.BoxGeometry(2.58, 0.2, 1.78).translate(0, 0.1, 0),
    COYOTE_FDE
  );
  const insertPlate = paintGeometry(
    new THREE.BoxGeometry(2.02, 0.16, 1.24).translate(0, 0.24, 0),
    '#334155'
  );
  const lockStud = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.16, 16).translate(0, -0.43, 0),
    '#475569'
  );

  return applyP320FdePatchUVs(
    mergeParts([carvedPad, collar, insertPlate, lockStud])
  );
}
