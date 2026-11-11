import * as THREE from 'three';
import {
  csgSubtract,
  createHelicalSpring,
  createRectangularMagSpring,
  mergeParts,
  paintGeometry,
} from '../springHelper';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function fractPos(v: number): number {
  return v - Math.floor(v);
}

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const fNorm = new THREE.Vector3();

function readTriInfo(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  col: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  i0: number,
  i1: number,
  i2: number
) {
  vA.fromBufferAttribute(pos, i0);
  vB.fromBufferAttribute(pos, i1);
  vC.fromBufferAttribute(pos, i2);
  e1.subVectors(vB, vA);
  e2.subVectors(vC, vA);
  fNorm.crossVectors(e1, e2);
  if (fNorm.lengthSq() > 1e-12) fNorm.normalize();
  else fNorm.set(0, 1, 0);

  const cx = (vA.x + vB.x + vC.x) / 3;
  const cy = (vA.y + vB.y + vC.y) / 3;
  const cz = (vA.z + vB.z + vC.z) / 3;
  const cr = col ? (col.getX(i0) + col.getX(i1) + col.getX(i2)) / 3 : 0.3;

  return { cx, cy, cz, cr, fnx: fNorm.x, fny: fNorm.y, fnz: fNorm.z };
}

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
        u = 0.60 + fractPos((x + z) * 0.11) * 0.36;
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
        u = 0.02 + xNorm * 0.70;
        v = 0.23 + yNorm * 0.21;
      } else if (mode === 'left') {
        u = 0.02 + (1.0 - xNorm) * 0.70;
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
        const xn = clamp01((x - -1.24) / 2.20);
        const yn = clamp01((y - 0.02) / 0.60);
        u = 0.75 + xn * 0.23;
        v = 0.30 + yn * 0.13;
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
 * Signature P320 innovation: unified stamped & machined 17-4 PH stainless steel receiver insert
 * with 4 integral slide guide rails, barrel cam locking block, fixed ejector & "TF004912" serial plate!
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

  const cutters: THREE.BufferGeometry[] = [];

  // Hollow U-channel interior leaving crisp 0.18 cm stamped stainless side walls
  const uChannel = paintGeometry(
    new THREE.BoxGeometry(9.2, 1.25, 1.44).translate(-1.62, 0.46, 0),
    FCU_DARK
  );
  cutters.push(uChannel);

  // Bottom open pass-throughs for trigger shoe & magazine feed column
  const magFeedCut = paintGeometry(
    new THREE.BoxGeometry(3.15, 0.95, 1.46).translate(-3.65, -0.08, 0),
    FCU_DARK
  );
  cutters.push(magFeedCut);

  const triggerShoeCut = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.85, 0.92).translate(0.05, -0.12, 0),
    FCU_DARK
  );
  cutters.push(triggerShoeCut);

  // Takedown lever cross-bore (X = +1.85, Y = +0.42) + trigger pivot & sear pin holes
  const takedownHole = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 2.3, 20)
      .rotateX(Math.PI / 2)
      .translate(1.85, 0.42, 0),
    FCU_DARK
  );
  cutters.push(takedownHole);

  const trigPivotHole = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 2.3, 18)
      .rotateX(Math.PI / 2)
      .translate(0.05, 0.25, 0),
    FCU_DARK
  );
  cutters.push(trigPivotHole);

  const searPinHole = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 2.3, 18)
      .rotateX(Math.PI / 2)
      .translate(-5.15, 0.62, 0),
    FCU_DARK
  );
  cutters.push(searPinHole);

  const safetyAxleNotch = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 2.3, 18)
      .rotateX(Math.PI / 2)
      .translate(-5.75, 0.76, 0),
    FCU_DARK
  );
  cutters.push(safetyAxleNotch);

  const stampedU = csgSubtract(rawChassis, cutters);

  // Integral Front CNC Barrel Locking Block & Cam Ramp welded/pinned inside FCU front
  const rampShape = new THREE.Shape();
  rampShape.moveTo(0.08, 0.22);
  rampShape.lineTo(1.62, 0.22);
  rampShape.lineTo(1.62, 0.88);
  rampShape.lineTo(1.08, 0.88);
  rampShape.lineTo(0.45, 0.48);
  rampShape.lineTo(0.08, 0.48);
  rampShape.closePath();
  const camBlock = new THREE.ExtrudeGeometry(rampShape, {
    depth: 1.32,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  camBlock.translate(0, 0, -0.66);
  paintGeometry(camBlock, FCU_STEEL);

  // 4 Integral Horizontal Stainless Slide Guide Rails (Front & Rear pairs on FCU!)
  const rails: THREE.BufferGeometry[] = [];
  const railSpans: [number, number][] = [
    [2.28, 1.82],
    [-5.38, 2.08],
  ];
  for (const [rx, rLen] of railSpans) {
    for (const sign of [-1, 1]) {
      const railFlange = paintGeometry(
        new THREE.BoxGeometry(rLen, 0.12, 0.24).translate(
          rx,
          1.02,
          sign * 0.98
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

  // Integral Bent Stainless Fixed Ejector Blade on Left Rear FCU Wall!
  const ejectorCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5.05, 0.92, -0.58),
    new THREE.Vector3(-4.35, 1.18, -0.48),
    new THREE.Vector3(-3.55, 1.24, -0.36),
    new THREE.Vector3(-2.82, 1.24, -0.26),
  ]);
  const ejector = paintGeometry(
    new THREE.TubeGeometry(ejectorCurve, 16, 0.072, 8, false),
    FCU_STEEL
  );

  // Right-side Serialized Window Plate ("TF004912" visible right through Grip Module window!)
  const serialPlate = paintGeometry(
    new THREE.BoxGeometry(2.2, 0.6, 0.06).translate(-0.14, 0.32, 0.94),
    SERIAL_TAG_BRIGHT
  );

  const merged = mergeParts([
    stampedU,
    camBlock,
    ...rails,
    ejector,
    serialPlate,
  ]);
  return applyP320FcuAtlasUVs(merged);
}

/**
 * FCU-02: M17 Curved Solid Nitride Steel Trigger Shoe (pivots around local [0, 0, 0])
 * World assembledPos = [0.05, 0.25, 0]; rz < 0 pulls trigger shoe rearward (-X).
 */
export function buildP320TriggerShoeGeometry(): THREE.BufferGeometry {
  const TRIG_BLACK = '#232832';
  const TRIG_PIN = '#cbd5e1';

  const shoeShape = new THREE.Shape();
  // Upper crank arm inside FCU (y > 0) + ergonomic SIG Sauer curved finger bow (y < 0)
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
    '#14181f'
  );
  const carvedShoe = csgSubtract(shoeBody, [pivotHole]);

  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.115, 0.115, 1.78, 16).rotateX(Math.PI / 2),
    TRIG_PIN
  );

  const upperLinkStud = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.52, 14)
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

  const frontClevis = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.46, 0.09).translate(0.12, 0.54, 0.82),
    BAR_STEEL
  );

  const clevisBridge = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.16, 0.34).translate(0.2, 0.55, 0.66),
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

  // Inward-bent rear sear actuator tang engaging sear lower leg & safety lever
  const rearInwardTab = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.22, 0.52).translate(-5.18, 0.66, 0.74),
    '#f1f5f9'
  );

  // Coiled trigger return tension spring along lower right FCU recess
  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -2.45,
      end: -0.55,
      centerY: 0.16,
      centerZ: 0.98,
      coilRadius: 0.13,
      wireRadius: 0.028,
      coils: 10,
    }),
    SPRING_COL
  );

  return mergeParts([
    frontClevis,
    clevisBridge,
    longBar,
    disconnectLobe,
    rearInwardTab,
    returnSpring,
  ]);
}

/**
 * FCU-04: Dual-Notch MIM Stainless Sear, Striker Safety Lever & Polymer Sear Housing
 * Local origin at sear pivot [-5.15, 0.62, 0].
 */
export function buildP320SearGroupGeometry(): THREE.BufferGeometry {
  // Black polymer sear housing sub-cage nested inside rear FCU
  const housing = paintGeometry(
    new THREE.BoxGeometry(1.78, 0.88, 1.28).translate(-0.18, -0.22, 0),
    '#1f242d'
  );
  const housingPocket = paintGeometry(
    new THREE.BoxGeometry(1.28, 0.76, 0.84).translate(-0.08, -0.05, 0),
    '#14171e'
  );
  const carvedHousing = csgSubtract(housing, [housingPocket]);

  // Precision MIM Stainless Pivoting Sear with primary & secondary drop-safe engagement steps
  const searShape = new THREE.Shape();
  searShape.moveTo(-0.42, -0.15);
  searShape.lineTo(0.42, -0.15);
  searShape.lineTo(0.32, 0.52);
  searShape.lineTo(0.08, 0.82); // Top sear nose reaching world Y = 0.62 + 0.82 = 1.44!
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
    new THREE.BoxGeometry(0.92, 0.18, 0.11)
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
 * FCU-05: US Army M17 Ambidextrous Manual Thumb Safety (美军 M17 双侧手动保险)
 * Local origin at safety pivot [-5.75, 0.76, 0].
 */
export function buildP320ManualSafetyGeometry(): THREE.BufferGeometry {
  const SAFETY_NITRIDE = '#222730';
  const SAFETY_SERR = '#333b48';

  const crossAxle = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 2.58, 20).rotateX(Math.PI / 2),
    '#475569'
  );

  const internalBlocker = paintGeometry(
    new THREE.BoxGeometry(0.52, 0.42, 0.24).translate(0.18, -0.06, 0.34),
    '#94a3b8'
  );

  // Sculpted swept M17 teardrop ambidextrous thumb paddles (Left & Right)
  const paddleShape = new THREE.Shape();
  paddleShape.moveTo(0.24, -0.18);
  paddleShape.quadraticCurveTo(0.28, 0.18, -0.05, 0.24);
  paddleShape.lineTo(-1.18, 0.32);
  paddleShape.quadraticCurveTo(-1.42, 0.28, -1.38, 0.04);
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

    const shelf = paintGeometry(
      new THREE.BoxGeometry(1.12, 0.11, 0.24)
        .rotateZ(-0.06)
        .translate(-0.68, 0.22, sign * 1.38),
      SAFETY_SERR
    );
    paddles.push(pad, shelf);
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
  const MAG_STEEL = '#252b35';
  const MAG_DARK = '#161a21';
  const FEED_STEEL = '#4b5563';

  const rx = 1.23;
  const rz = 0.80;
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

  // SIG double-stack-to-single-feed tapered upper neck (local y in [+4.15, +5.05])
  const neck = paintGeometry(
    new THREE.CylinderGeometry(0.66, 1.06, 0.92, 16)
      .scale(1.52, 1, 0.94)
      .translate(0.04, 4.65, 0),
    MAG_STEEL
  );

  const lipL = paintGeometry(
    new THREE.BoxGeometry(1.88, 0.34, 0.12)
      .rotateX(0.3)
      .translate(0.08, 5.08, -0.42),
    FEED_STEEL
  );
  const lipR = paintGeometry(
    new THREE.BoxGeometry(1.88, 0.34, 0.12)
      .rotateX(-0.3)
      .translate(0.08, 5.08, 0.42),
    FEED_STEEL
  );

  const bottomFlange = paintGeometry(
    new THREE.BoxGeometry(2.52, 0.14, 1.68).translate(0, -4.74, 0),
    MAG_STEEL
  );

  const rawMag = mergeParts([tube, neck, lipL, lipR, bottomFlange]);

  const cutters: THREE.BufferGeometry[] = [];
  // Hollow steel interior
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.12, 9.8, 1.32).translate(0, -0.05, 0),
      MAG_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.05, 1.2, 0.68).translate(0.12, 4.95, 0),
      MAG_DARK
    )
  );

  // Ambidextrous reversible magazine catch locking notches + side anti-friction ribs
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.46, 0.34, 0.32).translate(
          1.06,
          2.25,
          sign * 0.78
        ),
        MAG_DARK
      )
    );
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.45, 5.6, 0.12).translate(
          -0.08,
          -0.8,
          sign * 0.81
        ),
        MAG_DARK
      )
    );
  }

  // SIG 5 / 10 / 15 / 17 witness holes on rear spine
  for (let i = 0; i < 4; i++) {
    const wy = 1.9 - i * 1.55;
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.12, 0.12, 0.35, 14)
          .rotateZ(Math.PI / 2)
          .translate(-1.22, wy, 0),
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
    new THREE.BoxGeometry(0.2, 0.72, 1.1).translate(0.84, -0.48, 0),
    '#ea580c'
  );
  const legR = paintGeometry(
    new THREE.BoxGeometry(0.2, 0.72, 1.1).translate(-0.84, -0.48, 0),
    '#ea580c'
  );
  return mergeParts([base, step, catchShelf, legF, legR]);
}

/** M-03: Rectangular Coil Magazine Spring */
export function buildP320MagSpringGeometry(): THREE.BufferGeometry {
  return paintGeometry(
    createRectangularMagSpring({
      height: 7.4,
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
  padShape.lineTo(1.64, -0.46);
  padShape.quadraticCurveTo(1.74, -0.18, 1.54, 0.03);
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

  // Side finger extraction scallops on Coyote FDE baseplate
  const scallops: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    scallops.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.42, 0.42, 0.55, 16)
          .scale(1.3, 1, 0.35)
          .translate(0.15, -0.22, sign * 1.12),
        COYOTE_FDE
      )
    );
  }
  const carvedPad = csgSubtract(pad, scallops);

  // Upper rail collar + retention insert nesting flush into bottom of steel mag body
  const collar = paintGeometry(
    new THREE.BoxGeometry(2.58, 0.2, 1.78).translate(0, 0.1, 0),
    COYOTE_FDE
  );

  const lockStud = paintGeometry(
    new THREE.CylinderGeometry(0.17, 0.17, 0.12, 16).translate(0, -0.45, 0),
    '#475569'
  );

  return applyP320FdePatchUVs(mergeParts([carvedPad, collar, lockStud]));
}
