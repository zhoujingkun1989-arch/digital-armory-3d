import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  createRectangularMagSpring,
  mergeParts,
  paintGeometry,
} from '../springHelper';

export const M82_PARKERIZED = '#282d35';
export const M82_DARK_STEEL = '#1e232b';
export const M82_INNER_DARK = '#12151b';
export const M82_BRIGHT_STEEL = '#cfd8e3';
export const M82_BOLT_STEEL = '#94a3b8';
export const M82_SPRING_STEEL = '#8896a8';
export const M82_SCOPE_ANODIZED = '#1a1e25';
export const M82_TURRET_DRUM = '#2d333d';
export const M82_COATED_LENS = '#14b8a6';
export const M82_SORBOTHANE = '#111317';
export const M82_POLYMER_GRIP = '#1b1f26';
export const M82_FOLLOWER_STEEL = '#d97706';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const fNorm = new THREE.Vector3();

export function triInfo(
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
  const cr = col ? (col.getX(i0) + col.getX(i1) + col.getX(i2)) / 3 : 0.05;
  const cg = col ? (col.getY(i0) + col.getY(i1) + col.getY(i2)) / 3 : 0.05;
  return { cx, cy, cz, cr, cg, fnx: fNorm.x, fny: fNorm.y, fnz: fNorm.z };
}

/**
 * Unwraps m82a1_upper_receiver onto Band A (v in [0.68, 0.98]) of m82a1_body_albedo.png:
 *  - Left wall reads 'BARRETT FIREARMS MFG. INC. / MODEL 82A1 .50 CAL' left-to-right on Left camera
 *  - Right wall maps Parkerized steel + subtle .50 BMG brass deflector kiss behind ejection port
 */
export function applyM82UpperUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'stainless' | 'left' | 'right' | 'top_inner' = 'top_inner';
    if (cr > 0.42) {
      mode = 'stainless';
    } else if (fnz < -0.35 && cz < -0.48) {
      mode = 'left';
    } else if (fnz > 0.35 && cz > 0.48) {
      mode = 'right';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const yNorm = clamp01((y - 0.2) / 2.5);

      let u: number;
      let v: number;
      if (mode === 'stainless') {
        u = 0.9 + clamp01((x + 20) / 38) * 0.07;
        v = 0.05 + clamp01((y + z) * 0.2 + 0.5) * 0.25;
      } else if (mode === 'left') {
        // Left view looks toward +Z, so +X is on left of screen and -X is on right of screen
        const sLeft = clamp01((7.8 - x) / 25.5);
        u = 0.04 + sLeft * 0.49;
        v = 0.695 + yNorm * 0.275;
      } else if (mode === 'right') {
        const xNorm = clamp01((x - -20.8) / 37.3);
        u = 0.56 + xNorm * 0.41;
        v = 0.695 + yNorm * 0.275;
      } else {
        const xNorm = clamp01((x - -20.8) / 37.3);
        u = 0.56 + xNorm * 0.38;
        v = 0.72 + clamp01((z + 1.2) / 2.4) * 0.08;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps m82a1_lower_receiver onto Band B (v in [0.38, 0.66]) + Sorbothane & Stainless swatches:
 *  - Rear Sorbothane Buttpad (cx < -20.72) -> Ribbed Elastomer swatch (u in [0.78, 0.88], v in [0.03, 0.33])
 *  - Left wall -> SAFE / FIRE markings around selector pivot X = -2.95
 */
export function applyM82LowerUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx, cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'buttpad' | 'stainless' | 'left' | 'right' | 'other' = 'other';
    if (cx < -20.72) {
      mode = 'buttpad';
    } else if (cr > 0.42) {
      mode = 'stainless';
    } else if (fnz < -0.35 && cz < -0.45) {
      mode = 'left';
    } else if (fnz > 0.35 && cz > 0.45) {
      mode = 'right';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (mode === 'buttpad') {
        u = 0.79 + clamp01((z + 1.25) / 2.5) * 0.08;
        v = 0.04 + clamp01((y + 4.8) / 7.2) * 0.28;
      } else if (mode === 'stainless') {
        u = 0.9 + clamp01((z + 1.4) / 2.8) * 0.07;
        v = 0.05 + clamp01((y + 2.5) / 5.0) * 0.25;
      } else if (mode === 'left') {
        const sLeft = clamp01((2.2 - x) / 24.5);
        const yNorm = clamp01((y - -1.45) / 1.7);
        u = 0.04 + sLeft * 0.48;
        v = 0.4 + yNorm * 0.24;
      } else if (mode === 'right') {
        const xNorm = clamp01((x - -20.8) / 36.6);
        const yNorm = clamp01((y - -2.4) / 2.6);
        u = 0.28 + xNorm * 0.25;
        v = 0.4 + yNorm * 0.24;
      } else {
        u = 0.3 + clamp01((x + 20.8) / 36.6) * 0.22;
        v = 0.44 + clamp01((z + 1.2) / 2.4) * 0.08;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps m82a1_scope onto Band C of m82a1_body_albedo.png:
 *  - Emerald multi-coated lenses (cg > 0.30 && cr < 0.08) -> Coated Lens Swatch (u=0.67, v=0.18)
 *  - Top Elevation & Side Windage Turret Drums -> White '0..15 MIL' graduation band (v in [0.03, 0.155])
 *  - Matte anodized scope tube & 50mm front objective bell w/ 360° Leupold Gold Ring
 */
export function applyM82ScopeUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx, cy, cz, cr, cg, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'lens' | 'elev_turret' | 'wind_turret' | 'bell' | 'body' = 'body';
    if (cg > 0.25 && cr < 0.1) {
      mode = 'lens';
    } else if (cy > 0.62 && Math.abs(cx - -0.3) < 0.8) {
      mode = 'elev_turret';
    } else if (Math.abs(cz) > 0.62 && Math.abs(cx - -0.3) < 0.8) {
      mode = 'wind_turret';
    } else if (cx > 3.8) {
      mode = 'bell';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (mode === 'lens') {
        u = 0.67 + clamp01((z + 1.05) / 2.1 - 0.5 + 0.5) * 0.14 - 0.07;
        v = 0.18 + clamp01((y + 1.05) / 2.1 - 0.5 + 0.5) * 0.24 - 0.12;
      } else if (mode === 'elev_turret') {
        const ang = Math.atan2(z, x - -0.3);
        const uTurn = (ang + Math.PI) / (Math.PI * 2);
        const hNorm = clamp01((y - 0.62) / 0.82);
        u = 0.035 + uTurn * 0.51;
        v = 0.03 + hNorm * 0.125;
      } else if (mode === 'wind_turret') {
        const ang = Math.atan2(y, x - -0.3);
        const uTurn = (ang + Math.PI) / (Math.PI * 2);
        const hNorm = clamp01((Math.abs(z) - 0.62) / 0.75);
        u = 0.035 + uTurn * 0.51;
        v = 0.03 + hNorm * 0.125;
      } else if (mode === 'bell') {
        // Continuous 360° mapping along X so the Leupold Gold Ring wraps cleanly around the 50mm objective bell!
        const xNorm = clamp01((x - -7.4) / 15.2);
        u = 0.04 + xNorm * 0.48;
        v = 0.18 + clamp01((y + 1.15) / 2.3) * 0.15;
      } else {
        const xNorm = clamp01((x - -7.4) / 11.4);
        if (fnz >= 0) {
          u = 0.04 + xNorm * 0.38;
        } else {
          u = 0.04 + (1.0 - xNorm) * 0.38;
        }
        v = 0.18 + clamp01((y + 0.9) / 1.8) * 0.15;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps m82a1_mag_body onto Band B Right Half (u in [0.56, 0.98], v in [0.38, 0.66])
 */
export function applyM82MagUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'stainless' | 'right' | 'left' | 'spine' = 'spine';
    if (cr > 0.42) {
      mode = 'stainless';
    } else if (fnz > 0.35 && cz > 0.35) {
      mode = 'right';
    } else if (fnz < -0.35 && cz < -0.35) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x + 3.05) / 6.1);
      const yNorm = clamp01((y + 6.4) / 9.05);

      let u: number;
      let v: number;
      if (mode === 'stainless') {
        u = 0.9 + clamp01((x + 3.1) / 6.2) * 0.07;
        v = 0.05 + yNorm * 0.25;
      } else if (mode === 'right') {
        u = 0.575 + xNorm * 0.39;
        v = 0.39 + yNorm * 0.26;
      } else if (mode === 'left') {
        u = 0.575 + (1.0 - xNorm) * 0.39;
        v = 0.39 + yNorm * 0.26;
      } else {
        u = 0.57 + clamp01((z + 0.9) / 1.8) * 0.03;
        v = 0.39 + yNorm * 0.26;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// GROUP 2 ('frame'): LOWER RECEIVER, MAIN RECOIL SPRING, SPIKED BIPOD & GRIP
// ============================================================================

/**
 * F-01: Sheet-Steel Lower Receiver w/ Integral Rifle Buttstock, .50 BMG Magwell & Thick Sorbothane Buttpad
 * (assembledPos: [0, 0, 0], isShell: true)
 * Mates 100% flush with Upper Receiver along horizontal split seam Y = +0.20 across X ∈ [-20.8, +15.8]!
 */
export function buildM82LowerReceiverGeometry(): THREE.BufferGeometry {
  // Side profile of stamped sheet-steel lower receiver from buttpad interface (X=-20.8) to front bipod yoke (X=+15.8)
  const lowerShape = new THREE.Shape();
  lowerShape.moveTo(-20.8, 0.2); // Top rear split line
  lowerShape.lineTo(15.8, 0.2); // Top front split line (flush with upper receiver bottom Y=0.20!)
  lowerShape.lineTo(15.8, -0.45); // Front nose bevel
  lowerShape.lineTo(13.6, -0.92); // Front bipod mounting yoke flat
  lowerShape.lineTo(8.85, -0.92); // Forend bottom behind yoke
  lowerShape.lineTo(8.55, -2.35); // Front of massive .50 BMG magwell
  lowerShape.lineTo(1.85, -2.35); // Rear of .50 BMG magwell
  lowerShape.lineTo(1.55, -1.25); // Step behind magwell (meets front of trigger guard!)
  lowerShape.lineTo(-5.2, -1.25); // Flat FCG & pistol-grip mounting deck (meets top of A2 grip!)
  // Iconic Barrett rear hand-hook step & angled sheet-steel buttstock toe!
  lowerShape.lineTo(-14.8, -3.55);
  lowerShape.lineTo(-15.6, -3.15); // Sniper support-hand rear hook cutout
  lowerShape.lineTo(-19.0, -3.95);
  lowerShape.lineTo(-19.6, -4.65); // Buttstock heel
  lowerShape.lineTo(-20.8, -4.65);
  lowerShape.closePath();

  const rawHull = new THREE.ExtrudeGeometry(lowerShape, {
    depth: 2.24,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  rawHull.translate(0, 0, -1.12);
  paintGeometry(rawHull, M82_PARKERIZED);

  // Hollow interior channel, .50 BMG magwell through-cavity, trigger slot & buttstock recoil buffer tunnel!
  const upperTrough = paintGeometry(
    new THREE.BoxGeometry(35.6, 1.35, 1.88).translate(-2.4, -0.35, 0),
    M82_INNER_DARK
  );
  const buttstockCavity = paintGeometry(
    new THREE.BoxGeometry(14.8, 2.4, 1.82)
      .rotateZ(0.14)
      .translate(-13.0, -1.45, 0),
    M82_INNER_DARK
  );
  const magwellThrough = paintGeometry(
    new THREE.BoxGeometry(6.3, 3.0, 1.84).translate(5.25, -1.1, 0),
    M82_INNER_DARK
  );
  const triggerSlot = paintGeometry(
    new THREE.BoxGeometry(2.1, 1.2, 0.84).translate(-0.55, -0.95, 0),
    M82_INNER_DARK
  );

  const shell = csgSubtract(rawHull, [
    upperTrough,
    buttstockCavity,
    magwellThrough,
    triggerSlot,
  ]);

  // Thick Ribbed Sorbothane Recoil-Absorbing Buttpad at X ∈ [-22.0, -20.8], spanning full height Y ∈ [-4.72, +2.38]
  // (covers rear of both Lower and Upper receivers with 0.00mm gap!)
  const padMain = paintGeometry(
    new THREE.BoxGeometry(1.18, 7.08, 2.38).translate(-21.39, -1.17, 0),
    M82_SORBOTHANE
  );
  const padCutters: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 9; r++) {
    const ry = -4.15 + r * 0.74;
    padCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.32, 0.22, 2.6).translate(-21.92, ry, 0),
        M82_SORBOTHANE
      )
    );
  }
  const sorbothanePad = csgSubtract(padMain, padCutters);

  // Internal cylindrical buffer guide seat ring at rear + paddle magazine catch behind magwell + front/rear takedown cross-pins w/ pull rings!
  const rearBufferTube = paintGeometry(
    new THREE.CylinderGeometry(0.76, 0.76, 3.8, 20)
      .rotateZ(Math.PI / 2)
      .translate(-18.8, 1.25, 0),
    M82_DARK_STEEL
  );
  const rearBufferHole = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.62, 4.2, 18)
      .rotateZ(Math.PI / 2)
      .translate(-18.8, 1.25, 0),
    M82_INNER_DARK
  );
  const bufferCollar = csgSubtract(rearBufferTube, [rearBufferHole]);

  const magCatchPaddle = paintGeometry(
    new THREE.BoxGeometry(0.32, 1.05, 0.88)
      .rotateZ(0.24)
      .translate(1.68, -2.55, 0),
    M82_DARK_STEEL
  );

  // Front & Rear quick-detach receiver cross-lock pins + stainless pull rings!
  const frontPin = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 2.58, 16)
      .rotateX(Math.PI / 2)
      .translate(14.6, 0.02, 0),
    M82_BRIGHT_STEEL
  );
  const rearPin = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 2.58, 16)
      .rotateX(Math.PI / 2)
      .translate(-19.8, 0.02, 0),
    M82_BRIGHT_STEEL
  );
  const pullRingF = paintGeometry(
    new THREE.TorusGeometry(0.36, 0.055, 10, 20).translate(14.6, -0.18, -1.32),
    M82_BRIGHT_STEEL
  );
  const pullRingR = paintGeometry(
    new THREE.TorusGeometry(0.36, 0.055, 10, 20).translate(-19.8, -0.18, -1.32),
    M82_BRIGHT_STEEL
  );

  // Front Bipod Mounting Yoke Clevis Ears under X = +14.7, Y = -0.85
  const yokeEarL = paintGeometry(
    new THREE.BoxGeometry(1.75, 0.55, 0.24).translate(14.7, -0.95, -0.68),
    M82_DARK_STEEL
  );
  const yokeEarR = paintGeometry(
    new THREE.BoxGeometry(1.75, 0.55, 0.24).translate(14.7, -0.95, 0.68),
    M82_DARK_STEEL
  );

  const merged = mergeParts([
    shell,
    sorbothanePad,
    bufferCollar,
    magCatchPaddle,
    frontPin,
    rearPin,
    pullRingF,
    pullRingR,
    yokeEarL,
    yokeEarR,
  ]);
  return applyM82LowerUVs(merged);
}

/**
 * F-02: Rear Bolt Buffer Plunger Disc & Main Action Recoil Spring
 * (assembledPos: [0, 1.25, 0], spans local X ∈ [-20.4, -6.6], L0 = 13.8)
 * Compresses cleanly along X inside the buttstock when Bolt Carrier recoils!
 */
export function buildM82RecoilSpringGeometry(): THREE.BufferGeometry {
  const mainSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -20.4,
      end: -6.78,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.54,
      wireRadius: 0.082,
      coils: 26,
      radialSegments: 10,
      tubularSegmentsPerCoil: 16,
    }),
    M82_SPRING_STEEL
  );

  // Thin front nylon/steel buffer plunger face at X = -6.68 & rear guide seat flange at X = -20.48
  const frontBufferFace = paintGeometry(
    new THREE.CylinderGeometry(0.6, 0.6, 0.22, 22)
      .rotateZ(Math.PI / 2)
      .translate(-6.68, 0, 0),
    M82_BRIGHT_STEEL
  );
  const rearSeatFlange = paintGeometry(
    new THREE.CylinderGeometry(0.6, 0.6, 0.18, 22)
      .rotateZ(Math.PI / 2)
      .translate(-20.48, 0, 0),
    M82_DARK_STEEL
  );

  return mergeParts([mainSpring, frontBufferFace, rearSeatFlange]);
}

/**
 * F-03: Folding Adjustable Spiked Steel Bipod & Pivot Yoke
 * (assembledPos: [14.7, -0.85, 0])
 * Mounted flush inside the lower receiver front clevis yoke at [14.7, -0.85, 0];
 * deployed V-stance perforated legs with telescoping notched inner extensions & aggressive spiked tank-claw feet!
 */
export function buildM82BipodGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Central pivot clevis block, longitudinal cant spigot & transverse clevis cross-bolt
  const yokeBlock = paintGeometry(
    new THREE.BoxGeometry(1.55, 0.76, 1.12).translate(0, -0.18, 0),
    M82_DARK_STEEL
  );
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 1.72, 16)
      .rotateZ(Math.PI / 2)
      .translate(0, -0.12, 0),
    M82_BRIGHT_STEEL
  );
  const clevisCrossBolt = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.78, 16)
      .rotateX(Math.PI / 2)
      .translate(0, -0.08, 0),
    M82_BRIGHT_STEEL
  );
  parts.push(yokeBlock, pivotPin, clevisCrossBolt);

  // Build Left (side = -1) & Right (side = +1) deployed legs splayed ±24° in Z and angled slightly forward (+X)
  for (const side of [-1, 1]) {
    const legGroup: THREE.BufferGeometry[] = [];

    // Hinged upper knuckle
    legGroup.push(
      paintGeometry(
        new THREE.BoxGeometry(0.76, 0.72, 0.62).translate(0, -0.55, 0),
        M82_PARKERIZED
      )
    );

    // Perforated rectangular outer steel leg channel (Y_leg ∈ [-4.6, -0.8])
    const outerLegRaw = paintGeometry(
      new THREE.BoxGeometry(0.64, 3.9, 0.54).translate(0, -2.75, 0),
      M82_PARKERIZED
    );
    const lightenHoles: THREE.BufferGeometry[] = [];
    for (const hy of [-1.45, -2.25, -3.05, -3.85]) {
      lightenHoles.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.16, 0.16, 0.85, 14)
            .rotateZ(Math.PI / 2)
            .translate(0, hy, 0),
          M82_INNER_DARK
        )
      );
    }
    legGroup.push(csgSubtract(outerLegRaw, lightenHoles));

    // External locking latch & tension spring along side of leg
    legGroup.push(
      paintGeometry(
        createHelicalSpring({
          axis: 'y',
          start: -2.1,
          end: -0.95,
          centerX: -0.38,
          centerZ: side * 0.24,
          coilRadius: 0.12,
          wireRadius: 0.028,
          coils: 8,
        }),
        M82_SPRING_STEEL
      ),
      paintGeometry(
        new THREE.TorusGeometry(0.22, 0.04, 8, 16).translate(
          0,
          -4.45,
          side * 0.34
        ),
        M82_BRIGHT_STEEL
      )
    );

    // Notched telescoping inner steel extension leg (Y_leg ∈ [-7.4, -4.5])
    legGroup.push(
      paintGeometry(
        new THREE.BoxGeometry(0.44, 3.05, 0.38).translate(0, -5.95, 0),
        M82_BOLT_STEEL
      )
    );
    for (const ny of [-5.1, -5.7, -6.3, -6.9]) {
      legGroup.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.26, 0.26, 0.08, 14).translate(0, ny, 0),
          M82_DARK_STEEL
        )
      );
    }

    // Iconic Barrett spiked ski/claw footpad + 3 ground-biting steel spikes!
    legGroup.push(
      paintGeometry(
        new THREE.BoxGeometry(1.45, 0.22, 0.88).translate(0.12, -7.48, 0),
        M82_DARK_STEEL
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.32, 0.38, 0.86)
          .rotateZ(-0.45)
          .translate(0.82, -7.36, 0),
        M82_DARK_STEEL
      )
    );
    for (const sx of [-0.38, 0.12, 0.62]) {
      legGroup.push(
        paintGeometry(
          new THREE.ConeGeometry(0.12, 0.36, 8)
            .rotateX(Math.PI)
            .translate(sx, -7.72, 0),
          M82_BRIGHT_STEEL
        )
      );
    }

    const mergedLeg = mergeParts(legGroup);
    // Splay outward in Z by ±24° (rotateX) and cant slightly forward (+X) by 10° (rotateZ)
    mergedLeg.rotateX(side * 0.42);
    mergedLeg.rotateZ(0.17);
    mergedLeg.translate(0, -0.15, side * 0.68);
    parts.push(mergedLeg);
  }

  return mergeParts(parts);
}

/**
 * F-04: Swept Checkered USGI A2 Pistol Grip & Enlarged Gloved Trigger Guard
 * (assembledPos: [-2.4, -1.25, 0])
 * Top face Y_local = 0 meets Lower Receiver deck Y = -1.25 100% flush; swept ~22° BACKWARD (-X) as Y descends!
 */
export function buildM82PistolGripGeometry(): THREE.BufferGeometry {
  const gripShape = new THREE.Shape();
  gripShape.moveTo(-1.35, 0.04); // Rear upper tang flush against lower receiver
  gripShape.lineTo(0.68, 0.04); // Front upper lip flush against lower receiver
  // Front strap sweeping backward (-X) as Y goes down, with iconic single A2 middle-finger swell!
  gripShape.quadraticCurveTo(0.55, -0.82, 0.18, -1.45);
  gripShape.lineTo(0.34, -1.62); // Classic USGI A2 finger ledge!
  gripShape.quadraticCurveTo(-0.08, -2.55, -0.92, -4.52); // Lower front toe swept back to X = -0.92!
  gripShape.lineTo(-2.95, -4.18); // Swept-back rear heel at X = -2.95!
  // Rear backstrap rising smoothly to upper tang
  gripShape.quadraticCurveTo(-2.35, -2.55, -1.72, -1.05);
  gripShape.quadraticCurveTo(-1.45, -0.35, -1.35, 0.04);
  gripShape.closePath();

  const rawGrip = new THREE.ExtrudeGeometry(gripShape, {
    depth: 1.24,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 3,
  });
  rawGrip.translate(0, 0, -0.62);
  paintGeometry(rawGrip, M82_POLYMER_GRIP);

  // Raised checkered side grip panels on Left & Right flanks
  const panelShape = new THREE.Shape();
  panelShape.moveTo(-1.22, -0.65);
  panelShape.lineTo(0.05, -0.85);
  panelShape.lineTo(-0.82, -3.85);
  panelShape.lineTo(-2.35, -3.62);
  panelShape.closePath();

  const panelGeoL = new THREE.ExtrudeGeometry(panelShape, {
    depth: 0.07,
    bevelEnabled: false,
  });
  panelGeoL.translate(0, 0, -0.74);
  paintGeometry(panelGeoL, M82_SORBOTHANE);

  const panelGeoR = new THREE.ExtrudeGeometry(panelShape, {
    depth: 0.07,
    bevelEnabled: false,
  });
  panelGeoR.translate(0, 0, 0.67);
  paintGeometry(panelGeoR, M82_SORBOTHANE);

  // Enlarged winter-gloved steel Trigger Guard extending forward from grip (+0.62) to magwell rear (X_world = +1.65 -> X_local = +4.05, Y_local = 0)!
  const guardShape = new THREE.Shape();
  guardShape.moveTo(0.45, 0.02);
  guardShape.lineTo(0.85, 0.02);
  guardShape.lineTo(1.25, -1.28);
  guardShape.lineTo(3.45, -1.28);
  guardShape.lineTo(3.98, 0.02);
  guardShape.lineTo(4.22, 0.02);
  guardShape.lineTo(3.65, -1.52);
  guardShape.lineTo(1.05, -1.52);
  guardShape.closePath();

  const triggerGuard = new THREE.ExtrudeGeometry(guardShape, {
    depth: 0.68,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  triggerGuard.translate(0, 0, -0.34);
  paintGeometry(triggerGuard, M82_DARK_STEEL);

  return mergeParts([rawGrip, panelGeoL, panelGeoR, triggerGuard]);
}

// ============================================================================
// GROUP 3 ('fire_control'): STRIKER COCKING LEVER, SEAR, TRIGGER & SELECTOR
// ============================================================================

/**
 * FC-01: Barrett Upright Cocking Lever & Striker Catch Assembly (assembledPos: [-2.35, -0.35, 0])
 * Pivot at local (0, 0, 0); upright arm rises to Y_local = +1.12 to engage Firing Pin tang.
 * Right-hand rule around +Z: rz < 0 swings upright head (+Y) FORWARD (+X)!
 */
export function buildM82StrikerGeometry(): THREE.BufferGeometry {
  const pivotHub = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 1.15, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M82_BRIGHT_STEEL
  );

  const leverShape = new THREE.Shape();
  leverShape.moveTo(-0.22, -0.25);
  leverShape.lineTo(0.26, -0.25); // Bottom sear engagement notch
  leverShape.lineTo(0.28, 0.65);
  leverShape.lineTo(0.16, 1.18); // Top striker/firing-pin catch nose
  leverShape.lineTo(-0.26, 1.08);
  leverShape.lineTo(-0.32, 0.35);
  leverShape.closePath();

  const arm = new THREE.ExtrudeGeometry(leverShape, {
    depth: 0.44,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  arm.translate(0, 0, -0.22);
  paintGeometry(arm, M82_BRIGHT_STEEL);

  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.15,
      end: -0.25,
      centerY: -0.12,
      centerZ: 0,
      coilRadius: 0.14,
      wireRadius: 0.03,
      coils: 6,
    }),
    M82_SPRING_STEEL
  );

  return mergeParts([pivotHub, arm, returnSpring]);
}

/**
 * FC-02: Primary Sear, Disconnector & Transfer Bar (assembledPos: [-1.45, -0.55, 0])
 */
export function buildM82SearGeometry(): THREE.BufferGeometry {
  const transferBar = paintGeometry(
    new THREE.BoxGeometry(1.95, 0.26, 0.56).translate(0, 0, 0),
    M82_BOLT_STEEL
  );
  const searHookRear = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.48, 0.48).translate(-0.78, 0.22, 0),
    M82_BRIGHT_STEEL
  );
  const disconnectorTop = paintGeometry(
    new THREE.BoxGeometry(0.55, 0.52, 0.26)
      .rotateZ(-0.18)
      .translate(0.35, 0.32, 0),
    M82_BRIGHT_STEEL
  );
  const searSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.52,
      end: -0.08,
      centerX: -0.45,
      centerZ: 0,
      coilRadius: 0.11,
      wireRadius: 0.025,
      coils: 5,
    }),
    M82_SPRING_STEEL
  );

  return mergeParts([
    transferBar,
    searHookRear,
    disconnectorTop,
    searSpring,
  ]);
}

/**
 * FC-03: Curved Match Trigger & Trigger Housing (assembledPos: [-0.45, -1.05, 0])
 * Pivot at local (0, 0, 0); trigger shoe hangs down (-Y) so rz < 0 pulls shoe rearward (-X)!
 */
export function buildM82TriggerGeometry(): THREE.BufferGeometry {
  const pivotAxle = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.18, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M82_BRIGHT_STEEL
  );

  const shoeShape = new THREE.Shape();
  shoeShape.moveTo(-0.2, 0.15);
  shoeShape.lineTo(0.24, 0.15);
  shoeShape.quadraticCurveTo(0.05, -0.68, 0.32, -1.25);
  shoeShape.lineTo(0.06, -1.36);
  shoeShape.quadraticCurveTo(-0.32, -0.72, -0.2, 0.15);
  shoeShape.closePath();

  const shoe = new THREE.ExtrudeGeometry(shoeShape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  shoe.translate(0, 0, -0.21);
  paintGeometry(shoe, M82_DARK_STEEL);

  // Upper trigger bow arms engaging transfer bar
  const upperBow = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.32, 0.68).translate(-0.32, 0.28, 0),
    M82_DARK_STEEL
  );

  return mergeParts([pivotAxle, shoe, upperBow]);
}

/**
 * FC-04: Left-Side Rotary Thumb Safety Selector Lever (SAFE / FIRE) (assembledPos: [-2.95, -0.48, 0])
 */
export function buildM82SelectorGeometry(): THREE.BufferGeometry {
  const drumShaft = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 2.38, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M82_DARK_STEEL
  );
  // Left-side grooved AR-15 / M82A1 thumb lever at Z = -1.20
  const leftPlate = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 0.14, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -1.2),
    M82_DARK_STEEL
  );
  const thumbPaddle = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.32, 0.18)
      .rotateZ(0.22)
      .translate(0.48, 0.12, -1.24),
    M82_PARKERIZED
  );
  // Right-side witness indicator cap
  const rightCap = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.1, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 1.2),
    M82_BRIGHT_STEEL
  );

  return mergeParts([drumShaft, leftPlate, thumbPaddle, rightCap]);
}

// ============================================================================
// GROUP 4 ('magazine'): 10-ROUND .50 BMG RIBBED STEEL BOX MAGAZINE (4 PARTS)
// ============================================================================

/**
 * M-01: Massive 10-Round .50 BMG Stamped Ribbed Steel Box Magazine Body
 * (assembledPos: [5.3, -2.15, 0], isShell: true)
 * Angled trapezoidal bottom slopes from (-3.05, -6.40) at rear to (+3.05, -4.90) at front (exact 0.24112 rad!).
 */
export function buildM82MagBodyGeometry(): THREE.BufferGeometry {
  const magShape = new THREE.Shape();
  magShape.moveTo(-3.05, -6.4); // Rear bottom corner
  magShape.lineTo(3.05, -4.9); // Front bottom corner (sloped +1.50 over 6.10 run -> 0.24112 rad!)
  magShape.lineTo(3.05, 2.25); // Front upper feed shoulder
  magShape.lineTo(2.75, 2.65); // Front feed lip
  magShape.lineTo(-2.85, 2.65); // Rear feed lip
  magShape.lineTo(-3.05, 2.35); // Rear upper shoulder
  magShape.closePath();

  const rawBox = new THREE.ExtrudeGeometry(magShape, {
    depth: 1.72,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  rawBox.translate(0, 0, -0.86);
  paintGeometry(rawBox, M82_PARKERIZED);

  // Hollow internal magazine shaft so X-Ray reveals follower, spring & .50 BMG rounds cleanly!
  const innerShaft = paintGeometry(
    new THREE.BoxGeometry(5.68, 7.6, 1.42).translate(0, -1.35, 0),
    M82_INNER_DARK
  );
  const topThroatOpen = paintGeometry(
    new THREE.BoxGeometry(5.45, 2.2, 1.22).translate(-0.05, 2.1, 0),
    M82_INNER_DARK
  );

  // 4 vertical stamped strengthening ribs on both Left & Right steel flanks!
  const ribCutters: THREE.BufferGeometry[] = [innerShaft, topThroatOpen];
  for (const rx of [-2.05, -0.7, 0.65, 2.0]) {
    for (const side of [-1, 1]) {
      ribCutters.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.14, 0.14, 5.6, 12).translate(
            rx,
            -1.95,
            side * 0.92
          ),
          M82_DARK_STEEL
        )
      );
    }
  }

  const magShell = csgSubtract(rawBox, ribCutters);

  // Welded front magwell hook lug + rear catch locking shelf + stainless feed lip reinforcement
  const frontHook = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.48, 1.38).translate(3.14, 0.45, 0),
    M82_BRIGHT_STEEL
  );
  const rearCatchLug = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.42, 1.32).translate(-3.15, -0.05, 0),
    M82_BRIGHT_STEEL
  );
  const feedLips = paintGeometry(
    new THREE.BoxGeometry(5.5, 0.22, 1.56).translate(-0.05, 2.58, 0),
    M82_BRIGHT_STEEL
  );

  const merged = mergeParts([magShell, frontHook, rearCatchLug, feedLips]);
  return applyM82MagUVs(merged);
}

/**
 * M-02: Double-Stack .50 BMG Stepped Anti-Tilt Follower (assembledPos: [5.3, -1.95, 0])
 */
export function buildM82MagFollowerGeometry(): THREE.BufferGeometry {
  const deck = paintGeometry(
    new THREE.BoxGeometry(5.35, 0.34, 1.32)
      .rotateZ(0.08)
      .translate(0, 0.15, 0),
    M82_FOLLOWER_STEEL
  );
  const stepRidge = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 5.2, 16)
      .rotateZ(Math.PI / 2 + 0.08)
      .translate(0, 0.38, -0.26),
    M82_FOLLOWER_STEEL
  );
  const frontLeg = paintGeometry(
    new THREE.BoxGeometry(0.26, 1.35, 1.24).translate(2.45, -0.45, 0),
    M82_FOLLOWER_STEEL
  );
  const rearLeg = paintGeometry(
    new THREE.BoxGeometry(0.26, 1.55, 1.24).translate(-2.45, -0.65, 0),
    M82_FOLLOWER_STEEL
  );
  return mergeParts([deck, stepRidge, frontLeg, rearLeg]);
}

/**
 * M-03: Heavy-Duty Rectangular .50 BMG Magazine Coil Spring (assembledPos: [5.3, -4.85, 0])
 */
export function buildM82MagSpringGeometry(): THREE.BufferGeometry {
  const spring = createRectangularMagSpring({
    height: 4.85,
    widthX: 4.85,
    depthZ: 1.15,
    wireRadius: 0.068,
    coils: 8,
  });
  spring.rotateZ(0.12);
  return paintGeometry(spring, M82_SPRING_STEEL);
}

/**
 * M-04: Angled Monopod Ribbed Steel Magazine Floorplate & Retainer
 * (assembledPos: [5.3, -7.8, 0], assembledRot: [0, 0, 0.24112])
 * Matches exact atan2(1.50, 6.10) = 0.24112 rad bottom slope of m82a1_mag_body with ZERO gap!
 */
export function buildM82MagFloorplateGeometry(): THREE.BufferGeometry {
  // Top lip overlaps +0.06 into bottom rim of mag body along entire 6.38 length -> zero daylight gap!
  const outerPlate = paintGeometry(
    new THREE.BoxGeometry(6.42, 0.36, 1.92).translate(0, -0.12, 0),
    M82_DARK_STEEL
  );
  const upperFlangeLip = paintGeometry(
    new THREE.BoxGeometry(6.28, 0.22, 1.84).translate(0, 0.04, 0),
    M82_PARKERIZED
  );
  // Anti-slip monopod ground traction ribs under floorplate + locking plunger button
  const extras: THREE.BufferGeometry[] = [outerPlate, upperFlangeLip];
  for (let i = -2; i <= 2; i++) {
    extras.push(
      paintGeometry(
        new THREE.BoxGeometry(0.26, 0.1, 1.86).translate(i * 1.15, -0.32, 0),
        M82_SORBOTHANE
      )
    );
  }
  extras.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 0.18, 16).translate(0, -0.26, 0),
      M82_BRIGHT_STEEL
    )
  );
  return mergeParts(extras);
}
