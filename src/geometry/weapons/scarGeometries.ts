import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../springHelper';

// Belgian "50 Shades of FDE" & Hardware Vertex Palette (used when PBR toggle is off & for inner faces)
export const SCAR_FDE_CHAMPAGNE = '#a78b62'; // Anodized extruded aluminum upper
export const SCAR_FDE_COYOTE = '#8f7654'; // Matte polymer lower receiver
export const SCAR_FDE_STOCK = '#9d835b'; // Warm mustard-tan Ugg-boot buttstock
export const SCAR_FDE_RISER = '#ad936c'; // Lighter sand-tan cheek riser
export const SCAR_FDE_GRIP = '#846c4b'; // Deep coyote-earth ergonomic pistol grip
export const SCAR_FDE_MAG = '#a2875e'; // Dry-film FDE tan STANAG magazine
export const SCAR_DARK_STEEL = '#252b35';
export const SCAR_INNER_DARK = '#151921';
export const SCAR_BRIGHT_STEEL = '#d6dfe9';
export const SCAR_RUBBER_BLACK = '#1a1d23';
export const SCAR_SPRING_STEEL = '#94a3b8';

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

function triInfo(
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
  const cb = col ? (col.getZ(i0) + col.getZ(i1) + col.getZ(i2)) / 3 : 0.2;
  return { cx, cy, cz, cr, cb, fnx: fNorm.x, fny: fNorm.y, fnz: fNorm.z };
}

/**
 * Unwraps U-01 Monolithic Extruded Aluminum Upper Receiver onto Band A (v in [0.69, 0.99])
 * of 2048x2048 scar_fde_{albedo,normal,roughness}.png:
 *  - Left wall (fnz < -0.35): v in [0.84, 0.985], u reads left-to-right on Left view (FN HERSTAL BELGIUM SCAR-L CAL. 5.56MM + T-marks!)
 *  - Right wall (fnz > 0.35): v in [0.69, 0.835], u reads left-to-right on Right view (T-marks + brass kiss + NATO proof)
 *  - Dark steel screws / inner cavity: Band E (v in [0.02, 0.09])
 */
export function applyScarUpperUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, cb, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    // Distinguish dark steel/inner parts (low red or neutral dark grey) from warm FDE champagne (cr > cb * 1.35)
    const isDarkHardware = cr < 0.12 || cr < cb * 1.15;

    let mode: 'hardware' | 'left' | 'right' | 'top' = 'top';
    if (isDarkHardware) {
      mode = 'hardware';
    } else if (fnz < -0.38 && cz < -0.35) {
      mode = 'left';
    } else if (fnz > 0.38 && cz > 0.35) {
      mode = 'right';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -6.4) / 20.0);
      const yNorm = clamp01((y - 0.15) / 2.98);

      let u: number;
      let v: number;
      if (mode === 'hardware') {
        u = 0.38 + fractPos((x + z) * 0.18) * 0.24;
        v = 0.02 + fractPos(y * 0.22) * 0.07;
      } else if (mode === 'left') {
        u = 0.02 + (1.0 - xNorm) * 0.96;
        v = 0.842 + yNorm * 0.145;
      } else if (mode === 'right') {
        u = 0.02 + xNorm * 0.96;
        v = 0.692 + yNorm * 0.145;
      } else {
        // Clean champagne anodized deck without hitting rollmark text
        u = 0.04 + xNorm * 0.42;
        v = 0.855 + clamp01((z + 0.95) / 1.9) * 0.035;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Polymer Lower Receiver onto Band B (v in [0.41, 0.66]) with Left & Right S/1/A selector marks!
 */
export function applyScarLowerUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, cb, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    const isDarkSteel = cr < 0.12 || cr < cb * 1.15;

    let mode: 'steel' | 'left' | 'right' | 'rim' = 'rim';
    if (isDarkSteel) {
      mode = 'steel';
    } else if (fnz < -0.4 && cz < -0.32) {
      mode = 'left';
    } else if (fnz > 0.4 && cz > 0.32) {
      mode = 'right';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -5.65) / 10.6);
      const yNorm = clamp01((y - -2.35) / 2.73);

      let u: number;
      let v: number;
      if (mode === 'steel') {
        u = 0.38 + fractPos((x + z) * 0.2) * 0.24;
        v = 0.02 + fractPos(y * 0.2) * 0.07;
      } else if (mode === 'left') {
        u = 0.02 + (1.0 - xNorm) * 0.47;
        v = 0.41 + yNorm * 0.25;
      } else if (mode === 'right') {
        u = 0.51 + xNorm * 0.47;
        v = 0.41 + yNorm * 0.25;
      } else {
        // Top/bottom/trigger-guard coyote surfaces away from S-1-A text
        u = 0.04 + xNorm * 0.25;
        v = 0.415 + clamp01((z + 0.85) / 1.7) * 0.06;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps "Ugg-Boot" Buttstock, Cheek Riser, Grip, or STANAG Mag onto dedicated "50 Shades of FDE" swatches!
 */
export function applyScarSwatchUVs(
  geo: THREE.BufferGeometry,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number,
  scale = 0.08
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr, cb } = triInfo(pos, col, i, i + 1, i + 2);
    const isBrightSteel = cr > 0.52 && cb > 0.52;
    const isDarkHardware = !isBrightSteel && (cr < 0.1 || cr < cb * 1.12);

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (isBrightSteel) {
        u = 0.72 + fractPos((x + z) * 0.2) * 0.22;
        v = 0.02 + fractPos(y * 0.2) * 0.07;
      } else if (isDarkHardware) {
        u = 0.06 + fractPos((x + z) * 0.2) * 0.22;
        v = 0.02 + fractPos(y * 0.2) * 0.07;
      } else {
        u = uMin + fractPos((x + z * 0.5) * scale) * (uMax - uMin);
        v = vMin + fractPos(y * scale) * (vMax - vMin);
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps 30-Rd FDE Tan STANAG Magazine onto Band D (u in [0.56, 0.96], v in [0.12, 0.39])
 */
export function applyScarMagUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, cb, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    const isBrightLips = cr > 0.48 && cb > 0.48;
    const isSideFlank = Math.abs(fnz) > 0.35 && Math.abs(cz) > 0.2;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (isBrightLips) {
        u = 0.72 + fractPos((x + z) * 0.22) * 0.22;
        v = 0.02 + fractPos(y * 0.22) * 0.07;
      } else {
        const yNorm = clamp01((y - -7.6) / 10.15); // 0 at bottom -> 1 at feed lips
        const xNorm = clamp01((x - -1.45) / 3.6);
        if (isSideFlank) {
          u =
            fnz > 0
              ? 0.58 + xNorm * 0.36
              : 0.58 + (1.0 - xNorm) * 0.36;
          v = 0.125 + yNorm * 0.265;
        } else {
          u = 0.55 + clamp01((z + 0.65) / 1.3) * 0.03;
          v = 0.125 + yNorm * 0.265;
        }
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ==============================================================================
// 1. SLIDE / MONOLITHIC UPPER, PISTON & BOLT CARRIER GROUP (10 PARTS)
// ==============================================================================

/**
 * U-01: Iconic Monolithic Extruded Aluminum FDE Upper Receiver (assembledPos: [0, 0, 0])
 * Spans X ∈ [-6.40, +13.60], Y ∈ [+0.16, +3.12], Z ∈ [-0.96, +1.14]
 */
export function buildScarUpperReceiverGeometry(): THREE.BufferGeometry {
  // 1. Rear/Mid Tall Extruded Receiver Hull (X ∈ [-6.40, +5.60], Y ∈ [+0.35, +2.86], Z ∈ [-0.88, +0.88])
  const rearHull = paintGeometry(
    new THREE.BoxGeometry(12.0, 2.51, 1.76).translate(-0.4, 1.605, 0),
    SCAR_FDE_CHAMPAGNE
  );
  // 2. Forward Monolithic Integral Forend (X ∈ [+5.50, +13.60], Y ∈ [+0.24, +2.86], Z ∈ [-0.82, +0.82])
  const forendHull = paintGeometry(
    new THREE.BoxGeometry(8.1, 2.62, 1.64).translate(9.55, 1.55, 0),
    SCAR_FDE_CHAMPAGNE
  );
  const rawMonolith = csgUnion([rearHull, forendHull]);

  // Cutters: internal carrier/barrel cavity, bottom FCG/magwell opening, ejection port, charging handle tracks & cooling vents!
  const cutters: THREE.BufferGeometry[] = [
    // Main full-length internal bore & bolt carrier raceway
    paintGeometry(
      new THREE.BoxGeometry(20.4, 2.18, 1.36).translate(3.6, 1.48, 0),
      SCAR_INNER_DARK
    ),
    // Bottom receiver opening over magwell & hammer/trigger group (X ∈ [-5.60, +4.45])
    paintGeometry(
      new THREE.BoxGeometry(10.05, 0.55, 1.34).translate(-0.58, 0.35, 0),
      SCAR_INNER_DARK
    ),
    // Right-side rectangular SCAR ejection port (X ∈ [+0.58, +3.82], Y ∈ [+0.78, +1.68])
    paintGeometry(
      new THREE.BoxGeometry(3.24, 0.9, 0.65).translate(2.2, 1.23, 0.68),
      SCAR_INNER_DARK
    ),
    // Ambidextrous Left & Right reciprocating charging-handle track slots (X ∈ [-2.35, +4.45], Y = +2.12)
    paintGeometry(
      new THREE.BoxGeometry(6.8, 0.28, 2.1).translate(1.05, 2.12, 0),
      SCAR_INNER_DARK
    ),
    // Circular charging-handle disassembly keyway hole at rear of track (X = -1.95, Y = +2.12)
    paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 2.1, 18)
        .rotateX(Math.PI / 2)
        .translate(-1.95, 2.12, 0),
      SCAR_INNER_DARK
    ),
  ];

  // Forend dual-row stadium cooling vents (4 upper vents exposing gas piston + 4 lower vents exposing barrel!)
  for (const vx of [6.95, 8.75, 10.55, 12.35]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.18, 0.32, 2.05).translate(vx, 2.08, 0),
        SCAR_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(1.18, 0.3, 2.05).translate(vx, 0.62, 0),
        SCAR_INNER_DARK
      )
    );
  }

  const carvedUpper = csgSubtract(rawMonolith, cutters);
  const parts: THREE.BufferGeometry[] = [carvedUpper];

  // Uninterrupted Full-Length Top MIL-STD-1913 Picatinny Rail (X ∈ [-6.30, +13.52], Y = +2.86..+3.12)
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(19.82, 0.14, 0.78).translate(3.61, 2.91, 0),
      SCAR_FDE_CHAMPAGNE
    )
  );
  for (let i = 0; i < 26; i++) {
    const lx = -5.95 + i * 0.765;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.42, 0.14, 0.94).translate(lx, 3.05, 0),
        SCAR_FDE_CHAMPAGNE
      )
    );
  }

  // Left & Right 3/9 o'clock Forend Picatinny Rails (X ∈ [+6.15, +13.35], Y = +1.34, Z = ±0.88..±0.98)
  for (const side of [-1, 1]) {
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(7.2, 0.56, 0.12).translate(
          9.75,
          1.34,
          side * 0.86
        ),
        SCAR_RUBBER_BLACK
      )
    );
    for (let i = 0; i < 9; i++) {
      const rx = 6.55 + i * 0.8;
      parts.push(
        paintGeometry(
          new THREE.BoxGeometry(0.42, 0.68, 0.14).translate(
            rx,
            1.34,
            side * 0.94
          ),
          SCAR_RUBBER_BLACK
        )
      );
    }
  }

  // Bottom 6 o'clock Forend Picatinny Rail (X ∈ [+5.75, +13.45], Y = +0.16..+0.02)
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(7.7, 0.12, 0.76).translate(9.6, 0.18, 0),
      SCAR_RUBBER_BLACK
    )
  );
  for (let i = 0; i < 10; i++) {
    const bx = 6.15 + i * 0.77;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.42, 0.13, 0.92).translate(bx, 0.06, 0),
        SCAR_RUBBER_BLACK
      )
    );
  }

  // Signature SCAR Angled Polymer Brass Deflector behind Right Ejection Port (X ∈ [-0.28, +0.48])
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.76, 0.86, 0.28)
        .rotateY(-0.34)
        .translate(0.12, 1.24, 0.94),
      SCAR_RUBBER_BLACK
    )
  );

  // Lower-receiver mating pivot & takedown lugs extending down to Y = +0.25 for 100% seamless lockup
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.95, 0.24, 0.78).translate(4.65, 0.32, 0),
      SCAR_FDE_CHAMPAGNE
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.95, 0.24, 0.78).translate(-5.2, 0.32, 0),
      SCAR_FDE_CHAMPAGNE
    )
  );

  return applyScarUpperUVs(mergeParts(parts));
}

/**
 * U-02: Folding Diopter Rear Sight w/ Windage & Elevation Drums (assembledPos: [-5.15, 3.12, 0])
 */
export function buildScarRearSightGeometry(): THREE.BufferGeometry {
  // Picatinny rail clamp base sitting flush on Y = 3.12 rail top
  const railClamp = paintGeometry(
    new THREE.BoxGeometry(1.42, 0.28, 1.06).translate(0, 0.06, 0),
    SCAR_DARK_STEEL
  );
  const crossBolt = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 1.24, 16)
      .rotateX(Math.PI / 2)
      .translate(0.15, 0.06, 0),
    SCAR_BRIGHT_STEEL
  );
  // Folding sight tower stem + protective diopter ears
  const towerStem = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.56, 0.52).translate(-0.18, 0.42, 0),
    SCAR_DARK_STEEL
  );
  const ringOuter = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.18, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.18, 0.62, 0),
    SCAR_DARK_STEEL
  );
  const peepHole = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 0.36, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.18, 0.62, 0),
    SCAR_INNER_DARK
  );
  const diopter = csgSubtract(ringOuter, [peepHole]);

  const earL = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.42, 0.1).translate(-0.18, 0.64, -0.34),
    SCAR_DARK_STEEL
  );
  const earR = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.42, 0.1).translate(-0.18, 0.64, 0.34),
    SCAR_DARK_STEEL
  );
  const windageDrum = paintGeometry(
    new THREE.CylinderGeometry(0.17, 0.17, 1.18, 18)
      .rotateX(Math.PI / 2)
      .translate(-0.18, 0.32, 0),
    SCAR_DARK_STEEL
  );

  return mergeParts([
    railClamp,
    crossBolt,
    towerStem,
    diopter,
    earL,
    earR,
    windageDrum,
  ]);
}

/**
 * U-03: SCAR Gas Block w/ Folding Hooded Front Sight & 2-Pos Rotary Gas Regulator (assembledPos: [14.70, 1.05, 0])
 * Rear face local X = -1.10 meets Upper Receiver front X = +13.60 flush!
 */
export function buildScarGasBlockGeometry(): THREE.BufferGeometry {
  // Lower barrel journal clamp (local Y = 0 -> world Y = +1.05)
  const barrelClamp = paintGeometry(
    new THREE.CylinderGeometry(0.66, 0.66, 2.2, 26)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    SCAR_DARK_STEEL
  );
  // Sculpted vertical gas tower connecting barrel bore to piston cylinder (local Y = +1.07 -> world Y = +2.12)
  const gasWeb = paintGeometry(
    new THREE.BoxGeometry(2.05, 1.25, 0.84).translate(-0.04, 0.56, 0),
    SCAR_DARK_STEEL
  );
  const gasCylinder = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 2.3, 26)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 1.07, 0),
    SCAR_DARK_STEEL
  );
  // Bottom sling / bayonet accessory lug
  const bottomLug = paintGeometry(
    new THREE.BoxGeometry(1.05, 0.42, 0.48).translate(0.08, -0.74, 0),
    SCAR_DARK_STEEL
  );
  // Folding front-sight pivot hinge & vertical post tower
  const sightHinge = paintGeometry(
    new THREE.BoxGeometry(0.96, 0.62, 0.68).translate(-0.12, 1.78, 0),
    SCAR_DARK_STEEL
  );
  const sightTower = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.68, 0.48).translate(-0.12, 2.28, 0),
    SCAR_DARK_STEEL
  );
  // Iconic SCAR Circular Protective Front-Sight Hood centered at local Y = +2.69 (world Y = +3.74 co-witness!)
  const hoodOuter = paintGeometry(
    new THREE.CylinderGeometry(0.44, 0.44, 0.52, 24)
      .rotateZ(Math.PI / 2)
      .translate(-0.12, 2.69, 0),
    SCAR_DARK_STEEL
  );

  const solid = csgUnion([
    barrelClamp,
    gasWeb,
    gasCylinder,
    bottomLug,
    sightHinge,
    sightTower,
    hoodOuter,
  ]);

  // Cut barrel bore, rear short-stroke piston bore, and front sight hood tunnel!
  const barrelHole = paintGeometry(
    new THREE.CylinderGeometry(0.49, 0.49, 2.6, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    SCAR_INNER_DARK
  );
  const pistonSocket = paintGeometry(
    new THREE.CylinderGeometry(0.41, 0.41, 1.65, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.55, 1.07, 0),
    SCAR_INNER_DARK
  );
  const hoodHole = paintGeometry(
    new THREE.CylinderGeometry(0.34, 0.34, 0.72, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.12, 2.69, 0),
    SCAR_INNER_DARK
  );
  const carved = csgSubtract(solid, [barrelHole, pistonSocket, hoodHole]);

  // Front 2-Position Rotary Gas Regulator Plug (protruding forward at local X = +1.10..+1.88, Y = +1.07)
  const regPlug = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.45, 0.78, 22)
      .rotateZ(Math.PI / 2)
      .translate(1.48, 1.07, 0),
    SCAR_BRIGHT_STEEL
  );
  const regWings = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.92, 0.24).translate(1.78, 1.07, 0),
    SCAR_DARK_STEEL
  );
  // Front sight post + side sling loop + cross-pins
  const sightPost = paintGeometry(
    new THREE.CylinderGeometry(0.05, 0.065, 0.38, 12).translate(-0.12, 2.58, 0),
    SCAR_BRIGHT_STEEL
  );
  const hingePin = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.86, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.12, 1.72, 0),
    SCAR_BRIGHT_STEEL
  );
  const crossPin1 = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.96, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.52, -0.42, 0),
    SCAR_BRIGHT_STEEL
  );
  const crossPin2 = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.96, 12)
      .rotateX(Math.PI / 2)
      .translate(0.52, -0.42, 0),
    SCAR_BRIGHT_STEEL
  );

  return mergeParts([
    carved,
    regPlug,
    regWings,
    sightPost,
    hingePin,
    crossPin1,
    crossPin2,
  ]);
}

/**
 * U-04: Stainless Short-Stroke Gas Piston Tappet (assembledPos: [12.35, 2.12, 0])
 * Spans local X ∈ [-2.50, +2.45] -> world X ∈ [+9.85, +14.80]
 * Rear tappet face at world X = +9.85 kisses front anvil of SCAR Bolt Carrier; front head sits inside Gas Block!
 */
export function buildScarGasPistonGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -2.5),
    new THREE.Vector2(0.24, -2.5), // Rear tappet striking face
    new THREE.Vector2(0.24, -0.35), // Ground tappet stem
    new THREE.Vector2(0.36, -0.25), // Stop flange collar
    new THREE.Vector2(0.36, 0.15),
    new THREE.Vector2(0.28, 0.22), // Mid waist
    new THREE.Vector2(0.28, 1.25),
    new THREE.Vector2(0.39, 1.32), // Piston head gas land 1
    new THREE.Vector2(0.39, 1.56),
    new THREE.Vector2(0.32, 1.6), // Obturation ring groove 1
    new THREE.Vector2(0.32, 1.72),
    new THREE.Vector2(0.39, 1.76), // Gas land 2
    new THREE.Vector2(0.39, 1.98),
    new THREE.Vector2(0.32, 2.02), // Obturation ring groove 2
    new THREE.Vector2(0.32, 2.14),
    new THREE.Vector2(0.39, 2.18), // Front gas cup land
    new THREE.Vector2(0.39, 2.45),
    new THREE.Vector2(0.22, 2.32), // Cupped gas face
    new THREE.Vector2(0.0, 2.28),
  ];
  const lathe = new THREE.LatheGeometry(pts, 26);
  lathe.rotateZ(-Math.PI / 2);
  return paintGeometry(lathe, SCAR_BRIGHT_STEEL);
}

/**
 * U-05: Heavy Rectangular SCAR Bolt Carrier w/ Forward Piston-Anvil Tower (assembledPos: [2.45, 1.58, 0])
 * Main slab body: local X ∈ [-4.10, +2.00] (world X ∈ [-1.65, +4.45])
 * Upper piston-anvil extension: local X ∈ [+2.00, +7.40], Y = +0.54 (world X ∈ [+4.45, +9.85], Y = +2.12)
 */
export function buildScarBoltCarrierGeometry(): THREE.BufferGeometry {
  // Massive boxy rectangular CNC steel carrier block (signature SCAR silhouette!)
  const mainBlock = paintGeometry(
    new THREE.BoxGeometry(6.1, 1.56, 1.26).translate(-1.05, -0.02, 0),
    SCAR_DARK_STEEL
  );
  // Forward upper tubular extension reaching X_world = +9.85 to receive short-stroke piston tappet blow!
  const anvilTube = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.42, 5.55, 22)
      .rotateZ(Math.PI / 2)
      .translate(4.65, 0.54, 0),
    SCAR_DARK_STEEL
  );
  const anvilCap = paintGeometry(
    new THREE.CylinderGeometry(0.41, 0.41, 0.35, 22)
      .rotateZ(Math.PI / 2)
      .translate(7.25, 0.54, 0),
    SCAR_BRIGHT_STEEL
  );
  const rawCarrier = csgUnion([mainBlock, anvilTube]);

  // Cut bolt bore (world Y = +1.05 -> local Y = -0.53), bottom hammer clearance slot, helical cam slot,
  // side lightening grooves, charging-handle keyway, and top recoil-spring tunnel (world Y = +2.28 -> local Y = +0.70)!
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.44, 0.44, 4.4, 22)
        .rotateZ(Math.PI / 2)
        .translate(0.1, -0.53, 0),
      SCAR_INNER_DARK
    ),
    // Bottom rear slot allowing rotary hammer to strike firing pin
    paintGeometry(
      new THREE.BoxGeometry(4.2, 0.58, 0.56).translate(-2.05, -0.62, 0),
      SCAR_INNER_DARK
    ),
    // Right ejection relief scallop
    paintGeometry(
      new THREE.BoxGeometry(2.45, 0.68, 0.46).translate(0.65, -0.32, 0.52),
      SCAR_INNER_DARK
    ),
    // Helical cam pin track
    paintGeometry(
      new THREE.BoxGeometry(1.15, 0.36, 0.58)
        .rotateY(0.45)
        .translate(0.35, -0.02, 0.25),
      SCAR_INNER_DARK
    ),
    // Top captive recoil-rod & recoil-spring blind bore (local Y = +0.62)
    paintGeometry(
      new THREE.CylinderGeometry(0.28, 0.28, 6.2, 18)
        .rotateZ(Math.PI / 2)
        .translate(-1.2, 0.56, 0),
      SCAR_INNER_DARK
    ),
    // Longitudinal guide rail grooves along left & right flanks
    paintGeometry(
      new THREE.BoxGeometry(6.3, 0.22, 0.16).translate(-1.05, 0.18, -0.62),
      SCAR_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(6.3, 0.22, 0.16).translate(-1.05, 0.18, 0.62),
      SCAR_INNER_DARK
    ),
  ];

  const machinedCarrier = csgSubtract(rawCarrier, cutters);
  return mergeParts([machinedCarrier, anvilCap]);
}

/**
 * U-06: Reversible Side Reciprocating Charging Handle (assembledPos: [4.10, 2.12, 0])
 */
export function buildScarChargingHandleGeometry(): THREE.BufferGeometry {
  // Cross-key tang sliding into carrier keyway (local Z ∈ [-0.66, +0.82])
  const keyTang = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.24, 1.48).translate(0, 0, 0.08),
    SCAR_DARK_STEEL
  );
  // Knurled cylindrical SCAR tactical handle protruding out right side (Z ∈ [+0.82, +1.82])
  const neck = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.42, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.96),
    SCAR_DARK_STEEL
  );
  const knurledDrum = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.22, 0.66, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 1.48),
    SCAR_DARK_STEEL
  );
  const endRing = paintGeometry(
    new THREE.TorusGeometry(0.22, 0.035, 10, 20)
      .translate(0, 0, 1.78),
    SCAR_BRIGHT_STEEL
  );
  return mergeParts([keyTang, neck, knurledDrum, endRing]);
}

/**
 * U-07: 7-Lug Rotating Bolt Head, Claw Extractor & Cam Pin (assembledPos: [2.95, 1.05, 0])
 * Bolt face at local X = +1.50 -> world X = +4.45
 */
export function buildScarBoltGeometry(): THREE.BufferGeometry {
  const boltStem = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 2.55, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.08, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  const boltCollar = paintGeometry(
    new THREE.CylinderGeometry(0.41, 0.41, 0.46, 24)
      .rotateZ(Math.PI / 2)
      .translate(0.95, 0, 0),
    SCAR_BRIGHT_STEEL
  );

  // 7 Radial Locking Lugs spaced at 45° (2π/8), leaving slot 0 (right side) for the heavy Claw Extractor!
  const parts: THREE.BufferGeometry[] = [boltStem, boltCollar];
  for (let idx = 1; idx < 8; idx++) {
    const ang = (idx * Math.PI * 2) / 8;
    const ly = Math.sin(ang) * 0.43;
    const lz = Math.cos(ang) * 0.43;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.38, 0.16, 0.18)
          .rotateX(-ang)
          .translate(1.31, ly, lz),
        SCAR_BRIGHT_STEEL
      )
    );
  }

  // Slot 0 (Z = +0.42): Wide SCAR/AR-18 Claw Extractor!
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.98, 0.2, 0.18).translate(1.02, 0, 0.42),
      SCAR_DARK_STEEL
    ),
    // Vertical rectangular-head SCAR Cam Pin engaging carrier cam slot
    paintGeometry(
      new THREE.CylinderGeometry(0.14, 0.14, 0.56, 16).translate(-0.22, 0.46, 0),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.32, 0.18, 0.26).translate(-0.22, 0.74, 0),
      SCAR_DARK_STEEL
    )
  );

  const merged = mergeParts(parts);
  // Recessed bolt face cup
  const faceCup = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.16, 20)
      .rotateZ(Math.PI / 2)
      .translate(1.48, 0, 0),
    SCAR_INNER_DARK
  );
  return csgSubtract(merged, [faceCup]);
}

/**
 * U-08: Full-Length Stainless Firing Pin (assembledPos: [1.55, 1.05, 0])
 * Spans local X ∈ [-1.45, +2.88] -> world X ∈ [+0.10, +4.43]
 */
export function buildScarFiringPinGeometry(): THREE.BufferGeometry {
  const rearHead = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 0.42, 16)
      .rotateZ(Math.PI / 2)
      .translate(-1.24, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  const stopCollar = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 0.18, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.68, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.1, 2.75, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.75, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  const tip = paintGeometry(
    new THREE.CylinderGeometry(0.035, 0.085, 0.74, 16)
      .rotateZ(Math.PI / 2)
      .translate(2.5, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  return mergeParts([rearHead, stopCollar, shaft, tip]);
}

/**
 * U-09: Captive Recoil Guide Rod & Rear Receiver Backplate Latch (assembledPos: [-6.15, 2.15, 0])
 * Backplate closes rear of upper at world X ∈ [-6.45, -5.90]; guide rod extends along world Y = +2.28 to X = +2.25!
 */
export function buildScarRecoilRodGeometry(): THREE.BufferGeometry {
  const endPlate = paintGeometry(
    new THREE.BoxGeometry(0.54, 2.42, 1.68).translate(-0.04, -0.56, 0),
    SCAR_RUBBER_BLACK
  );
  const bufferPad = paintGeometry(
    new THREE.BoxGeometry(0.24, 1.48, 1.16).translate(0.32, -0.45, 0),
    SCAR_DARK_STEEL
  );
  const guideRod = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 8.2, 16)
      .rotateZ(Math.PI / 2)
      .translate(4.3, 0.13, 0),
    SCAR_BRIGHT_STEEL
  );
  const frontStop = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 0.16, 16)
      .rotateZ(Math.PI / 2)
      .translate(8.35, 0.13, 0),
    SCAR_DARK_STEEL
  );
  return mergeParts([endPlate, bufferPad, guideRod, frontStop]);
}

/**
 * U-10: Captive Helical Recoil Spring (assembledPos: [-1.85, 2.28, 0], spans local X ∈ [-4.00, +4.00])
 */
export function buildScarRecoilSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: -4.0,
    end: 4.0,
    centerY: 0,
    centerZ: 0,
    coilRadius: 0.23,
    wireRadius: 0.044,
    coils: 22,
    radialSegments: 8,
    tubularSegmentsPerCoil: 16,
  });
  return paintGeometry(spring, SCAR_SPRING_STEEL);
}

// ==============================================================================
// 2A. BARREL, 3-PRONG FLASH SUPPRESSOR & QUICK-CHANGE CROSS-BOLTS ('frame' front)
// ==============================================================================

/**
 * F-01: 14" CQC Cold-Hammer-Forged Chrome-Lined 5.56×45mm Barrel + Extension (assembledPos: [0, 1.05, 0])
 * Spans world X ∈ [+3.35, +22.85]; shoulder at X = +22.10 meets 3-prong flash suppressor flush!
 */
export function buildScarBarrelGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 3.35),
    new THREE.Vector2(0.62, 3.35), // Barrel extension breech face
    new THREE.Vector2(0.62, 4.75),
    new THREE.Vector2(0.68, 4.78), // Index flange
    new THREE.Vector2(0.68, 5.05),
    new THREE.Vector2(0.58, 5.1), // Cross-bolt clamping journal
    new THREE.Vector2(0.58, 6.45),
    new THREE.Vector2(0.46, 6.8), // Chamber step-down under free-float forend
    new THREE.Vector2(0.43, 13.55),
    new THREE.Vector2(0.485, 13.62), // SCAR gas block journal
    new THREE.Vector2(0.485, 15.8),
    new THREE.Vector2(0.39, 15.88), // Forward 14" CQC contour
    new THREE.Vector2(0.39, 22.1),
    new THREE.Vector2(0.32, 22.12), // Threaded muzzle spigot inside 3-prong flash suppressor
    new THREE.Vector2(0.32, 22.85),
    new THREE.Vector2(0.0, 22.85),
  ];
  const outer = new THREE.LatheGeometry(pts, 28);
  outer.rotateZ(-Math.PI / 2);
  paintGeometry(outer, SCAR_DARK_STEEL);

  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 20.2, 20)
      .rotateZ(Math.PI / 2)
      .translate(13.2, 0, 0),
    SCAR_INNER_DARK
  );
  const chamber = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.31, 2.5, 20)
      .rotateZ(Math.PI / 2)
      .translate(4.65, 0, 0),
    SCAR_INNER_DARK
  );
  const hollowed = csgSubtract(outer, [bore, chamber]);

  const chromeFeedRamp = paintGeometry(
    new THREE.TorusGeometry(0.36, 0.06, 10, 24)
      .rotateY(Math.PI / 2)
      .translate(3.38, 0, 0),
    SCAR_BRIGHT_STEEL
  );

  return mergeParts([hollowed, chromeFeedRamp]);
}

/**
 * F-02: Iconic FN SCAR / AAC Blackout 3-Prong Open-Tine Flash Suppressor (assembledPos: [22.95, 1.05, 0])
 * Rear suppressor ratchet collar at local X = -0.88 (world X = +22.07) overlaps barrel shoulder (+22.10);
 * 3 sculpted open prongs terminate cleanly at local X = +1.55 (world X = +24.50)!
 */
export function buildScarFlashSuppressorGeometry(): THREE.BufferGeometry {
  // Rear 51T suppressor ratchet collar + wrench flats
  const ratchetCollar = paintGeometry(
    new THREE.CylinderGeometry(0.54, 0.52, 0.72, 28)
      .rotateZ(Math.PI / 2)
      .translate(-0.52, 0, 0),
    SCAR_DARK_STEEL
  );
  const ratchetRing = paintGeometry(
    new THREE.TorusGeometry(0.55, 0.045, 10, 28)
      .rotateY(Math.PI / 2)
      .translate(-0.22, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  // Forward cylindrical prong body (local X ∈ [-0.16, +1.55])
  const prongCylinder = paintGeometry(
    new THREE.CylinderGeometry(0.49, 0.51, 1.71, 28)
      .rotateZ(Math.PI / 2)
      .translate(0.695, 0, 0),
    SCAR_DARK_STEEL
  );

  const rawBody = csgUnion([ratchetCollar, prongCylinder]);

  // Bore + 3 deep open longitudinal flute cutouts at 120° creating 3 crisp open tuning-fork tines!
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.31, 0.31, 2.8, 22)
        .rotateZ(Math.PI / 2)
        .translate(0.35, 0, 0),
      SCAR_INNER_DARK
    ),
  ];

  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI * 2) / 3 + Math.PI / 6;
    const cy = Math.sin(ang) * 0.36;
    const cz = Math.cos(ang) * 0.36;
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.48, 0.34, 0.36)
          .rotateX(-ang)
          .translate(0.88, cy, cz),
        SCAR_INNER_DARK
      )
    );
  }

  const threeProng = csgSubtract(rawBody, cutters);
  return mergeParts([threeProng, ratchetRing]);
}

/**
 * F-03: Quick-Change Barrel Steel Trunnion Yoke & 6 Torx T25 Retention Cross-Bolts (assembledPos: [5.10, 0.92, 0])
 */
export function buildScarBarrelCrossboltsGeometry(): THREE.BufferGeometry {
  // U-shaped steel trunnion cradle inside lower monolithic upper
  const yokeRaw = paintGeometry(
    new THREE.BoxGeometry(2.15, 0.95, 1.32).translate(0, -0.1, 0),
    SCAR_BRIGHT_STEEL
  );
  const barrelCut = paintGeometry(
    new THREE.CylinderGeometry(0.6, 0.6, 2.4, 22)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.13, 0),
    SCAR_INNER_DARK
  );
  const yoke = csgSubtract(yokeRaw, [barrelCut]);

  const parts: THREE.BufferGeometry[] = [yoke];
  for (const bx of [-0.82, 0.0, 0.82]) {
    // Transverse high-tensile steel cross-bolt shaft + oversized Torx flange heads on Z = ±0.88
    parts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.11, 0.11, 1.82, 16)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.22, 0),
        SCAR_DARK_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.19, 0.19, 0.1, 16)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.22, 0.89),
        SCAR_DARK_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.19, 0.19, 0.1, 16)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.22, -0.89),
        SCAR_DARK_STEEL
      )
    );
  }

  return mergeParts(parts);
}
