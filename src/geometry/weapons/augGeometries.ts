import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../springHelper';

// Authentic Steyr AUG A1 (StG 77) color palette (used when PBR toggled off & for vertex-color UV tagging)
export const AUG_OLIVE = '#4b5841';
export const AUG_OLIVE_DARK = '#3b4633';
export const AUG_ANODIZED_GREY = '#31373d';
export const AUG_DARK_STEEL = '#262c34';
export const AUG_INNER_DARK = '#15181e';
export const AUG_BRIGHT_STEEL = '#cbd5e1';
export const AUG_CHROME_STEEL = '#e2e8f0';
export const AUG_RUBBER_BLACK = '#16181c';
export const AUG_POLYMER_PACK = '#52584e';
export const AUG_LENS_CYAN = '#0ea5a8';
export const AUG_AMBER_MAG = '#785a28';
export const AUG_SAFETY_RED = '#dc2626';
export const AUG_SPRING_STEEL = '#94a3b8';

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
  const cr = col ? (col.getX(i0) + col.getX(i1) + col.getX(i2)) / 3 : 0.2;
  const cg = col ? (col.getY(i0) + col.getY(i1) + col.getY(i2)) / 3 : 0.2;
  const cb = col ? (col.getZ(i0) + col.getZ(i1) + col.getZ(i2)) / 3 : 0.2;
  return {
    cx,
    cy,
    cz,
    cr,
    cg,
    cb,
    fnx: fNorm.x,
    fny: fNorm.y,
    fnz: fNorm.z,
  };
}

/**
 * Unwraps F-01 Austrian Olive-Green Polyamide Bullpup Stock onto upper half of aug_stock_*.png (2048x1024).
 */
export function applyAugStockUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx, cy, cz, cr, cg, fnz } = triInfo(pos, col, i, i + 1, i + 2);

    let mode:
      | 'steel'
      | 'dark_accent'
      | 'left_butt'
      | 'right_butt'
      | 'grip'
      | 'olive_plain' = 'olive_plain';

    if (cr > 0.45) {
      mode = 'steel';
    } else if (cg < 0.035 && cr < 0.035) {
      mode = 'dark_accent';
    } else if (cy <= -2.25 && cx > -4.2 && cx < 0.3) {
      mode = 'grip';
    } else if (fnz < -0.42 && cz < -0.45 && cy > -3.45 && cx < -2.6) {
      mode = 'left_butt';
    } else if (fnz > 0.42 && cz > 0.45 && cy > -3.45 && cx < -2.6) {
      mode = 'right_butt';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u = 0.5;
      let v = 0.9;

      if (mode === 'steel') {
        u = 0.76 + fractPos((x + z) * 0.25) * 0.2;
        v = 0.015 + fractPos(y * 0.25) * 0.045;
      } else if (mode === 'dark_accent') {
        u = 0.04 + fractPos((x + z) * 0.2) * 0.26;
        v = 0.015 + fractPos(y * 0.2) * 0.045;
      } else if (mode === 'grip') {
        u = 0.42 + clamp01((x + 3.8) / 3.8) * 0.16;
        v = 0.51 + clamp01((y + 7.3) / 5.2) * 0.11;
      } else if (mode === 'left_butt') {
        const xButtNorm = clamp01((x - -17.3) / 14.7);
        const yButtNorm = clamp01((y - -3.45) / 5.5);
        u = 0.05 + (1.0 - xButtNorm) * 0.4;
        v = 0.56 + yButtNorm * 0.36;
      } else if (mode === 'right_butt') {
        const xButtNorm = clamp01((x - -17.3) / 14.7);
        const yButtNorm = clamp01((y - -3.45) / 5.5);
        u = 0.55 + xButtNorm * 0.4;
        v = 0.56 + yButtNorm * 0.36;
      } else {
        u = 0.06 + fractPos((x + z) * 0.08) * 0.88;
        v = 0.88 + fractPos((y + z) * 0.12) * 0.09;
      }

      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-04 Die-Cast Aluminum Receiver & 1.5x Swarovski Optic onto lower half of aug_stock_*.png.
 */
export function applyAugReceiverOpticUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cy, cz, cr, cg, cb, fnz } = triInfo(pos, col, i, i + 1, i + 2);

    let mode:
      | 'lens'
      | 'steel'
      | 'left_scope'
      | 'right_scope'
      | 'left_rec'
      | 'right_rec'
      | 'anod_plain' = 'anod_plain';

    // Coated cyan optical lens check (linear RGB for #0ea5a8 has high G & B, very low R)
    if (cg > 0.2 && cb > 0.2 && cr < 0.05) {
      mode = 'lens';
    } else if (cr > 0.42) {
      mode = 'steel';
    } else if (cy >= 3.25 && fnz < -0.38 && cz < -0.22) {
      mode = 'left_scope';
    } else if (cy >= 3.25 && fnz > 0.38 && cz > 0.22) {
      mode = 'right_scope';
    } else if (cy < 2.15 && cy > 0.35 && fnz < -0.4 && cz < -0.35) {
      mode = 'left_rec';
    } else if (cy < 2.15 && cy > 0.35 && fnz > 0.4 && cz > 0.35) {
      mode = 'right_rec';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u = 0.5;
      let v = 0.31;

      if (mode === 'lens') {
        const ly = clamp01((y - 3.88 + 0.55) / 1.1);
        const lz = clamp01((z + 0.55) / 1.1);
        u = 0.36 + lz * 0.27;
        v = 0.01 + ly * 0.055;
      } else if (mode === 'steel') {
        u = 0.75 + fractPos((x + z) * 0.2) * 0.22;
        v = 0.015 + fractPos(y * 0.25) * 0.045;
      } else if (mode === 'left_scope') {
        const xn = clamp01((x - -4.45) / 10.3);
        const yn = clamp01((y - 3.3) / 1.15);
        u = 0.07 + (1.0 - xn) * 0.38;
        v = 0.36 + yn * 0.09;
      } else if (mode === 'right_scope') {
        const xn = clamp01((x - -4.45) / 10.3);
        const yn = clamp01((y - 3.3) / 1.15);
        u = 0.55 + xn * 0.38;
        v = 0.36 + yn * 0.09;
      } else if (mode === 'left_rec') {
        const xn = clamp01((x - -2.5) / 8.35);
        const yn = clamp01((y - 0.42) / 1.68);
        u = 0.07 + (1.0 - xn) * 0.38;
        v = 0.16 + yn * 0.11;
      } else if (mode === 'right_rec') {
        const xn = clamp01((x - -2.5) / 8.35);
        const yn = clamp01((y - 0.42) / 1.68);
        u = 0.55 + xn * 0.38;
        v = 0.16 + yn * 0.11;
      } else {
        u = 0.08 + fractPos((x + z) * 0.12) * 0.84;
        v = 0.29 + fractPos(y * 0.15) * 0.05;
      }

      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

export const AUG_MAG_ARC_CX = 18.0;
export const AUG_MAG_ARC_CY = 0.0;
export const AUG_MAG_R_INNER = 16.75;
export const AUG_MAG_R_OUTER = 19.25;
export const AUG_MAG_ANG_START = -0.01;
export const AUG_MAG_ANG_END = 0.48;

/**
 * Unwraps M-01 30-Rd Translucent Amber Waffle Polymer Magazine onto aug_mag_*.png (1024x1024).
 * Maps rear (-X) convex spine -> u ≈ 0.08 (brass rim) and front (+X) concave spine -> u ≈ 0.92 (copper bullet tip)
 * so cartridges point forward (+X) on BOTH left and right magazine walls!
 */
export function applyAugMagUVs(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cy, cz, cg, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'lip' | 'side' | 'spine' = 'spine';
    if (cy > -0.35 && cg > cr * 0.95) {
      mode = 'lip';
    } else if (Math.abs(fnz) > 0.38 && Math.abs(cz) > 0.24) {
      mode = 'side';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u = 0.06;
      let v = 0.5;

      if (mode === 'lip') {
        u = 0.55 + fractPos((x + z) * 0.25) * 0.38;
        v = 0.015 + fractPos(y * 0.25) * 0.045;
      } else {
        const dx = x - AUG_MAG_ARC_CX;
        const dy = y - AUG_MAG_ARC_CY;
        const rad = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(-dy, -dx);
        const sNorm = clamp01(
          (ang - AUG_MAG_ANG_START) / (AUG_MAG_ANG_END - AUG_MAG_ANG_START)
        );
        const rNorm = clamp01(
          (rad - AUG_MAG_R_INNER) / (AUG_MAG_R_OUTER - AUG_MAG_R_INNER)
        );

        if (mode === 'side') {
          u = 0.08 + (1.0 - rNorm) * 0.84;
          v = 0.94 - sNorm * 0.82;
        } else {
          u = 0.03 + clamp01((z + 0.65) / 1.3) * 0.07;
          v = 0.94 - sNorm * 0.82;
        }
      }

      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// FRAME & INTEGRATED SWAROVSKI OPTIC GROUP (7 Builders)
// ============================================================================

/**
 * F-01: Iconic Austrian Olive-Green Polyamide 66 Bullpup Stock (assembledPos: [0, 0, 0], isShell: true)
 * Features:
 *  - Rear bullpup cheekpiece housing (X ∈ [-17.30, -2.50], Y ∈ [-4.30, +2.06])
 *  - Rear bullpup magwell BEHIND pistol grip (X ∈ [-11.75, -8.35]) + ambi rear paddle mag catch
 *  - Right ejection port cutout & snapped-on Left Ejection Port Cover
 *  - Swept-back (-18°) ergonomic pistol grip (Y down to -7.25)
 *  - Iconic Steyr full-hand winter trigger guard bow sweeping from grip base to forend nose!
 *  - Forward receiver cradle saddle (X ∈ [-2.50, +3.85], Y = +0.42) & cross-bolt receiver takedown lock
 */
export function buildAugStockGeometry(): THREE.BufferGeometry {
  // 1. Main Bullpup Stock Side Silhouette extruded across Z ∈ [-0.88, +0.88]
  const stockOutline = new THREE.Shape();
  stockOutline.moveTo(-17.3, -4.28); // Buttstock rear bottom toe
  stockOutline.lineTo(-17.3, 1.98); // Buttstock rear top face (mates flush w/ buttpad at X = -17.30!)
  stockOutline.quadraticCurveTo(-17.25, 2.06, -16.95, 2.06);
  stockOutline.lineTo(-2.5, 2.06); // Horizontal bullpup cheekpiece top deck
  stockOutline.lineTo(-2.5, 0.42); // Vertical step down to aluminum receiver mating deck!
  stockOutline.lineTo(3.85, 0.42); // Forward receiver saddle top deck (X ∈ [-2.50, +3.85])
  stockOutline.lineTo(3.55, -1.15); // Tapered front nose ahead of trigger guard
  stockOutline.quadraticCurveTo(3.15, -1.78, 2.35, -1.82);
  stockOutline.lineTo(-8.35, -2.08); // Belly bridge between pistol grip and rear magwell
  stockOutline.lineTo(-8.35, -3.48); // Front lip of rear bullpup magwell!
  stockOutline.lineTo(-11.75, -3.48); // Magwell bottom opening (X ∈ [-11.75, -8.35])
  stockOutline.lineTo(-11.95, -3.62); // Rear magwell paddle catch housing boss
  stockOutline.lineTo(-13.1, -3.55);
  stockOutline.lineTo(-13.65, -2.98); // Stepped bullpup underside behind magwell
  stockOutline.lineTo(-16.2, -4.05);
  stockOutline.lineTo(-17.3, -4.28);
  stockOutline.closePath();

  const mainStockRaw = new THREE.ExtrudeGeometry(stockOutline, {
    depth: 1.64,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  mainStockRaw.translate(0, 0, -0.82);
  paintGeometry(mainStockRaw, AUG_OLIVE);

  // Hollow internal cavities:
  // - Upper carrier/hammer-pack/recoil-spring tunnel inside buttstock
  // - Forward receiver/transfer-bar channel
  // - Rear bullpup magwell vertical curved well
  // - Right-side brass ejection port opening
  // - Sliding trigger slot
  const innerButtCavity = paintGeometry(
    new THREE.BoxGeometry(14.5, 3.55, 1.34).translate(-9.85, 0.05, 0),
    AUG_OLIVE_DARK
  );
  const innerForeChannel = paintGeometry(
    new THREE.BoxGeometry(6.6, 1.85, 1.32).translate(0.55, -0.35, 0),
    AUG_OLIVE_DARK
  );
  const magwellCut = paintGeometry(
    new THREE.BoxGeometry(2.86, 4.6, 1.34)
      .rotateZ(0.08)
      .translate(-9.98, -1.55, 0),
    AUG_OLIVE_DARK
  );
  const rightEjectPort = paintGeometry(
    new THREE.BoxGeometry(2.95, 1.06, 0.75).translate(-8.2, 1.12, 0.65),
    AUG_OLIVE_DARK
  );
  const leftEjectPortRecess = paintGeometry(
    new THREE.BoxGeometry(2.95, 1.06, 0.16).translate(-8.2, 1.12, -0.84),
    AUG_OLIVE_DARK
  );
  const triggerSlotCut = paintGeometry(
    new THREE.BoxGeometry(1.55, 1.2, 0.66).translate(0.55, -1.78, 0),
    AUG_OLIVE_DARK
  );

  const hollowedHull = csgSubtract(mainStockRaw, [
    innerButtCavity,
    innerForeChannel,
    magwellCut,
    rightEjectPort,
    leftEjectPortRecess,
    triggerSlotCut,
  ]);

  // 2. Swept-Back Ergonomic Pistol Grip (root at X = -1.05, Y = -1.65 -> sweeps BACKWARD to X = -2.85, Y = -7.25!)
  const gripShape = new THREE.Shape();
  gripShape.moveTo(-2.15, -1.55); // Rear upper root (overlaps lower stock belly -> ZERO gap!)
  gripShape.lineTo(0.05, -1.55); // Front upper root behind trigger
  gripShape.quadraticCurveTo(-0.35, -3.6, -1.75, -7.05); // Swept-back front finger spine
  gripShape.quadraticCurveTo(-1.95, -7.28, -2.35, -7.26); // Rounded bottom grip cap
  gripShape.lineTo(-3.55, -7.12); // Rear grip heel
  gripShape.quadraticCurveTo(-3.82, -6.92, -3.65, -6.35);
  gripShape.quadraticCurveTo(-2.75, -3.85, -2.35, -2.05); // Swept-back rear beaver-tail curve
  gripShape.closePath();

  const gripGeo = new THREE.ExtrudeGeometry(gripShape, {
    depth: 1.08,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  gripGeo.translate(0, 0, -0.54);
  paintGeometry(gripGeo, AUG_OLIVE);

  // 3. Iconic Full-Hand Steyr AUG Winter Trigger Guard Bow!
  // Sweeps from front base of pistol grip (-1.90, -7.05) forward-upward to forend nose (+2.45, -1.65)
  const bowShape = new THREE.Shape();
  bowShape.moveTo(-2.05, -7.08);
  bowShape.quadraticCurveTo(0.45, -5.85, 2.65, -1.62); // Outer sleek full-hand bow contour
  bowShape.lineTo(1.98, -1.62); // Inner upper return at forend
  bowShape.quadraticCurveTo(0.05, -5.28, -1.78, -6.52); // Inner winter-glove finger clearance curve
  bowShape.closePath();

  const bowGeo = new THREE.ExtrudeGeometry(bowShape, {
    depth: 0.78,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  bowGeo.translate(0, 0, -0.39);
  paintGeometry(bowGeo, AUG_OLIVE);

  // 4. Molded Flared Magwell Collar, Left Ejection Port Cover, Ambi Mag Catch Paddle & Cross-Bolt Takedown Lock
  const magwellFlange = csgSubtract(
    paintGeometry(
      new THREE.BoxGeometry(3.45, 0.52, 1.78).translate(-10.05, -3.32, 0),
      AUG_OLIVE
    ),
    [
      paintGeometry(
        new THREE.BoxGeometry(2.84, 0.8, 1.34).translate(-10.0, -3.32, 0),
        AUG_OLIVE_DARK
      ),
    ]
  );

  // Snapped-on Left Ejection Port Dust Cover (flush in left ejection recess)
  const leftEjectCover = paintGeometry(
    new THREE.BoxGeometry(3.04, 1.12, 0.14).translate(-8.2, 1.12, -0.87),
    AUG_OLIVE
  );
  const leftCoverLatch = paintGeometry(
    new THREE.BoxGeometry(0.75, 0.34, 0.08).translate(-8.2, 1.12, -0.96),
    AUG_OLIVE_DARK
  );

  // Rear Ambidextrous Paddle Magazine Release behind magwell (matte black polymer accent)
  const magCatchPaddle = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.42, 0.96)
      .rotateZ(0.18)
      .translate(-12.35, -3.56, 0),
    AUG_RUBBER_BLACK
  );

  // Receiver Takedown Cross-Lock Wedge above pistol grip (X = -2.05, Y = -0.25)
  const receiverLockWedge = paintGeometry(
    new THREE.BoxGeometry(0.58, 0.36, 1.88).translate(-2.05, -0.22, 0),
    AUG_RUBBER_BLACK
  );

  // Horizontal grip ribs on front strap of pistol grip
  const gripRibs: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 5; r++) {
    const t = r / 4;
    const rx = -0.45 - t * 1.15;
    const ry = -2.85 - t * 3.35;
    gripRibs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.18, 0.16, 1.18)
          .rotateZ(-0.31)
          .translate(rx, ry, 0),
        AUG_OLIVE_DARK
      )
    );
  }

  const merged = mergeParts([
    hollowedHull,
    gripGeo,
    bowGeo,
    magwellFlange,
    leftEjectCover,
    leftCoverLatch,
    magCatchPaddle,
    receiverLockWedge,
    ...gripRibs,
  ]);
  return applyAugStockUVs(merged);
}

/**
 * F-02: Ribbed Black Elastomer Shoulder Buttpad & Cleaning Trapdoor (assembledPos: [-17.90, -1.12, 0])
 * Spans local X ∈ [-0.62, +0.64] => world X ∈ [-18.52, -17.26], mating flush with aug_stock at X = -17.30!
 */
export function buildAugButtpadGeometry(): THREE.BufferGeometry {
  const padShape = new THREE.Shape();
  // Local Y relative to -1.12: stock spans Y_world ∈ [-4.28, +2.06] => Y_local ∈ [-3.16, +3.18]
  padShape.moveTo(0.64, -3.16);
  padShape.lineTo(0.64, 3.18); // Flat front mating lip against stock rear face!
  padShape.lineTo(-0.42, 3.14);
  // Subtle concave anti-slip shoulder pocket along -X rear face
  padShape.quadraticCurveTo(-0.22, 0.15, -0.58, -3.08);
  padShape.closePath();

  const rawPad = new THREE.ExtrudeGeometry(padShape, {
    depth: 1.62,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  rawPad.translate(0, 0, -0.81);
  paintGeometry(rawPad, AUG_RUBBER_BLACK);

  // Internal plug boss fitting snugly into rear buttstock mouth + anti-slip horizontal rubber serrations
  const innerPlug = paintGeometry(
    new THREE.BoxGeometry(0.45, 5.2, 1.26).translate(0.75, 0.05, 0),
    AUG_RUBBER_BLACK
  );
  const trapdoor = paintGeometry(
    new THREE.BoxGeometry(0.14, 1.85, 0.72).translate(-0.34, 0.35, 0),
    AUG_INNER_DARK
  );

  const ribs: THREE.BufferGeometry[] = [];
  for (let i = -5; i <= 5; i++) {
    ribs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.14, 0.12, 1.56).translate(
          -0.38 - Math.abs(i) * 0.015,
          i * 0.52,
          0
        ),
        AUG_INNER_DARK
      )
    );
  }

  return mergeParts([rawPad, innerPlug, trapdoor, ...ribs]);
}

/**
 * F-03: Rear Captive Takedown Cross-Pin & Left Swivel Sling Loop (assembledPos: [-15.85, -2.45, 0])
 */
export function buildAugTakedownPinGeometry(): THREE.BufferGeometry {
  // Cross-buttstock steel locking pin (locks hammer pack & buttpad)
  const crossPin = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 1.96, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    AUG_DARK_STEEL
  );
  const rightButtonCap = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 0.12, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.96),
    AUG_BRIGHT_STEEL
  );
  const leftSwivelStud = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.24, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -1.02),
    AUG_DARK_STEEL
  );
  // Iconic oval steel rear sling loop hanging on left side
  const slingLoop = paintGeometry(
    new THREE.TorusGeometry(0.52, 0.075, 10, 24)
      .scale(1.35, 0.85, 1)
      .rotateX(0.35)
      .translate(-0.35, -0.32, -1.16),
    AUG_DARK_STEEL
  );

  return mergeParts([crossPin, rightButtonCap, leftSwivelStud, slingLoop]);
}

/**
 * F-04: Die-Cast Aluminum Receiver w/ Integrated Slanted 1.5x Swarovski Optical Sight Tube Handle
 * (assembledPos: [0, 0, 0], isShell: true)
 * Includes:
 *  - Dark grey anodized receiver block (X ∈ [-2.50, +5.85], Y ∈ [+0.42, +2.12])
 *  - Rear steel barrel/bolt trunnion sleeve extending into stock (X ∈ [-8.20, -2.50], Y = 1.05)
 *  - Left charging-handle slot w/ lock-back notch & right offset gas-rod sleeve
 *  - Iconic forward-slanted carry-handle struts supporting the 1.5x Swarovski optical sight tube (Y = 3.88)
 *  - Emerald-cyan multi-coated objective & ocular glass lenses + windage/elevation turrets + backup top iron sights!
 */
export function buildAugReceiverOpticGeometry(): THREE.BufferGeometry {
  // 1. Lower Die-Cast Aluminum Receiver Body (mates flush w/ stock at X = -2.50 and Y = +0.42!)
  const recHull = paintGeometry(
    new THREE.BoxGeometry(8.35, 1.68, 1.66).translate(1.675, 1.26, 0),
    AUG_ANODIZED_GREY
  );
  // Right-side cylindrical guide sleeve & left-side charging-handle guide boss
  const rightRodTube = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 8.35, 18)
      .rotateZ(Math.PI / 2)
      .translate(1.675, 1.52, 0.52),
    AUG_ANODIZED_GREY
  );
  const frontBarrelCollar = paintGeometry(
    new THREE.CylinderGeometry(0.76, 0.78, 2.2, 24)
      .rotateZ(Math.PI / 2)
      .translate(4.95, 1.05, 0),
    AUG_ANODIZED_GREY
  );
  const recUnion = csgUnion([recHull, rightRodTube, frontBarrelCollar]);

  // Subtract barrel bore, twin guide-rod bores, and left charging-handle longitudinal slot
  const mainBoreCut = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 9.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(1.65, 1.05, 0),
    AUG_INNER_DARK
  );
  const leftChargingSlot = paintGeometry(
    new THREE.BoxGeometry(6.9, 0.34, 0.55).translate(1.65, 1.62, -0.72),
    AUG_INNER_DARK
  );
  const lockBackNotch = paintGeometry(
    new THREE.BoxGeometry(0.72, 0.42, 0.55).translate(0.15, 1.84, -0.72),
    AUG_INNER_DARK
  );
  const sculptedRec = csgSubtract(recUnion, [
    mainBoreCut,
    leftChargingSlot,
    lockBackNotch,
  ]);

  // 2. Internal Steel Barrel/Bolt Trunnion Extension Tube (X ∈ [-8.20, -2.45], Y = 1.05)
  const trunnionTube = csgSubtract(
    paintGeometry(
      new THREE.CylinderGeometry(0.68, 0.68, 5.75, 24)
        .rotateZ(Math.PI / 2)
        .translate(-5.32, 1.05, 0),
      AUG_BRIGHT_STEEL
    ),
    [
      paintGeometry(
        new THREE.CylinderGeometry(0.52, 0.52, 6.0, 20)
          .rotateZ(Math.PI / 2)
          .translate(-5.32, 1.05, 0),
        AUG_INNER_DARK
      ),
      // Right ejection window cutout on trunnion sleeve
      paintGeometry(
        new THREE.BoxGeometry(2.4, 0.85, 0.7).translate(-7.15, 1.08, 0.48),
        AUG_INNER_DARK
      ),
    ]
  );

  // 3. Iconic Forward-Slanted Carry-Handle Optic Struts (rear strut & front strut slanted +X as +Y rises!)
  const rearStrutShape = new THREE.Shape();
  rearStrutShape.moveTo(-2.35, 2.02);
  rearStrutShape.lineTo(-0.85, 2.02);
  rearStrutShape.lineTo(0.05, 3.55);
  rearStrutShape.lineTo(-1.55, 3.55);
  rearStrutShape.closePath();

  const rearStrut = new THREE.ExtrudeGeometry(rearStrutShape, {
    depth: 0.76,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  rearStrut.translate(0, 0, -0.38);
  paintGeometry(rearStrut, AUG_ANODIZED_GREY);

  const frontStrutShape = new THREE.Shape();
  frontStrutShape.moveTo(3.15, 2.02);
  frontStrutShape.lineTo(4.75, 2.02);
  frontStrutShape.lineTo(5.45, 3.55);
  frontStrutShape.lineTo(3.95, 3.55);
  frontStrutShape.closePath();

  const frontStrut = new THREE.ExtrudeGeometry(frontStrutShape, {
    depth: 0.76,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  frontStrut.translate(0, 0, -0.38);
  paintGeometry(frontStrut, AUG_ANODIZED_GREY);

  // 4. Integrated 1.5x Swarovski Optical Sight Tube (X ∈ [-4.45, +5.85], Y = 3.88, Z = 0)
  const scopePts: THREE.Vector2[] = [
    new THREE.Vector2(0.46, -4.45),
    new THREE.Vector2(0.68, -4.45), // Flared ocular bell rear rim
    new THREE.Vector2(0.68, -3.35),
    new THREE.Vector2(0.55, -2.75), // Main 1.5x optic tube body
    new THREE.Vector2(0.55, 4.35),
    new THREE.Vector2(0.66, 4.95), // Flared objective bell
    new THREE.Vector2(0.66, 5.85),
    new THREE.Vector2(0.48, 5.85),
  ];
  const scopeRaw = new THREE.LatheGeometry(scopePts, 28);
  scopeRaw.rotateZ(-Math.PI / 2);
  scopeRaw.translate(0, 3.88, 0);
  paintGeometry(scopeRaw, AUG_ANODIZED_GREY);

  // Recessed ocular & objective optical cavities + multi-coated emerald-cyan Swarovski glass lenses!
  const ocularRecess = paintGeometry(
    new THREE.CylinderGeometry(0.52, 0.52, 0.45, 24)
      .rotateZ(Math.PI / 2)
      .translate(-4.3, 3.88, 0),
    AUG_INNER_DARK
  );
  const objectiveRecess = paintGeometry(
    new THREE.CylinderGeometry(0.52, 0.52, 0.48, 24)
      .rotateZ(Math.PI / 2)
      .translate(5.7, 3.88, 0),
    AUG_INNER_DARK
  );
  const scopeTube = csgSubtract(scopeRaw, [ocularRecess, objectiveRecess]);

  const ocularLens = paintGeometry(
    new THREE.SphereGeometry(0.51, 22, 16)
      .scale(0.18, 1, 1)
      .translate(-4.15, 3.88, 0),
    AUG_LENS_CYAN
  );
  const objectiveLens = paintGeometry(
    new THREE.SphereGeometry(0.51, 22, 16)
      .scale(0.18, 1, 1)
      .translate(5.54, 3.88, 0),
    AUG_LENS_CYAN
  );

  // Windage & Elevation Adjustment Turrets + Front Left Sling Boss
  const windageTurret = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.31, 0.36, 18)
      .rotateX(Math.PI / 2)
      .translate(1.45, 3.88, 0.62),
    AUG_ANODIZED_GREY
  );
  const elevationTurret = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.31, 0.32, 18).translate(1.45, 3.32, 0),
    AUG_ANODIZED_GREY
  );
  const frontSlingRing = paintGeometry(
    new THREE.TorusGeometry(0.36, 0.065, 10, 20)
      .rotateY(0.5)
      .translate(5.25, 2.22, -0.78),
    AUG_DARK_STEEL
  );

  // 5. Integral Top Backup Open Iron Sights molded atop the Swarovski scope housing (Y = 4.52..4.78)!
  const backupRearEars = csgSubtract(
    paintGeometry(
      new THREE.BoxGeometry(0.78, 0.28, 0.62).translate(-3.65, 4.62, 0),
      AUG_ANODIZED_GREY
    ),
    [
      paintGeometry(
        new THREE.BoxGeometry(0.9, 0.18, 0.18).translate(-3.65, 4.68, 0),
        AUG_INNER_DARK
      ),
    ]
  );
  const backupFrontBase = paintGeometry(
    new THREE.BoxGeometry(0.82, 0.18, 0.44).translate(5.2, 4.58, 0),
    AUG_ANODIZED_GREY
  );
  const backupFrontPost = paintGeometry(
    new THREE.BoxGeometry(0.18, 0.22, 0.12).translate(5.25, 4.74, 0),
    AUG_BRIGHT_STEEL
  );

  // Lower Barrel Lock Housing Boss under receiver at X = +3.65, Y = +0.52
  const barrelLockBoss = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.56, 1.74).translate(3.65, 0.58, 0),
    AUG_ANODIZED_GREY
  );

  const merged = mergeParts([
    sculptedRec,
    trunnionTube,
    rearStrut,
    frontStrut,
    scopeTube,
    ocularLens,
    objectiveLens,
    windageTurret,
    elevationTurret,
    frontSlingRing,
    backupRearEars,
    backupFrontBase,
    backupFrontPost,
    barrelLockBoss,
  ]);
  return applyAugReceiverOpticUVs(merged);
}

/**
 * F-05: Quick-Change Barrel Cross-Lock Button & Spring (assembledPos: [3.65, 0.52, 0])
 */
export function buildAugBarrelLockGeometry(): THREE.BufferGeometry {
  // Cross-receiver sliding locking lug w/ angled thumb button on right/left & internal coil spring
  const crossLug = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.36, 1.98).translate(0, 0, 0),
    AUG_DARK_STEEL
  );
  const thumbPad = paintGeometry(
    new THREE.BoxGeometry(0.86, 0.48, 0.22)
      .rotateY(0.12)
      .translate(0, -0.04, 0.98),
    AUG_DARK_STEEL
  );
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = -1; i <= 1; i++) {
    ribs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.12, 0.44, 0.08)
          .rotateZ(0.35)
          .translate(i * 0.24, -0.04, 1.09),
        AUG_BRIGHT_STEEL
      )
    );
  }
  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.78,
      end: -0.15,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.12,
      wireRadius: 0.025,
      coils: 5,
    }).rotateX(Math.PI / 2),
    AUG_SPRING_STEEL
  );

  return mergeParts([crossLug, thumbPad, ...ribs, returnSpring]);
}

/**
 * F-06: Left Non-Reciprocating Folding Charging Handle (assembledPos: [3.45, 1.62, -0.92])
 */
export function buildAugChargingHandleGeometry(): THREE.BufferGeometry {
  // Internal steel shuttle rod riding in left receiver channel
  const shuttleBar = paintGeometry(
    new THREE.BoxGeometry(2.85, 0.26, 0.32).translate(-0.35, 0, 0.16),
    AUG_DARK_STEEL
  );
  const hingeKnuckle = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.55, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.45, 0, -0.08),
    AUG_DARK_STEEL
  );
  // Iconic Steyr olive-green polymer angled folding palm handle
  const palmHandle = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.38, 0.62)
      .rotateY(0.42)
      .rotateX(-0.35)
      .translate(-0.15, 0.18, -0.44),
    AUG_OLIVE
  );
  const handleTip = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.26, 0.52, 16)
      .rotateZ(0.45)
      .translate(-0.78, 0.28, -0.66),
    AUG_OLIVE_DARK
  );

  return mergeParts([shuttleBar, hingeKnuckle, palmHandle, handleTip]);
}

/**
 * F-07: Iconic Folding Vertical Foregrip & Pivot Spring (assembledPos: [8.85, -0.18, 0])
 * Top knuckle centered at local (0, 0, 0) so it mates flush inside aug_gas_block's bottom clevis!
 */
export function buildAugForegripGeometry(): THREE.BufferGeometry {
  // Steel top pivot knuckle & cross-pin + internal pull-down lock spring
  const topHinge = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 0.68, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    AUG_DARK_STEEL
  );
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.06, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    AUG_BRIGHT_STEEL
  );

  // Sculpted Olive-Green Vertical Grip Body hanging down Y_local ∈ [-5.15, -0.18] with subtle -7° ergonomic rake
  const gripPts: THREE.Vector2[] = [
    new THREE.Vector2(0.38, 0.0),
    new THREE.Vector2(0.44, 0.45),
    new THREE.Vector2(0.54, 1.45), // Upper palm swell
    new THREE.Vector2(0.5, 2.65),
    new THREE.Vector2(0.53, 3.85), // Lower finger swell
    new THREE.Vector2(0.48, 4.78),
    new THREE.Vector2(0.32, 5.05), // Rounded bottom cap
    new THREE.Vector2(0.0, 5.08),
  ];
  const gripLathe = new THREE.LatheGeometry(gripPts, 24);
  gripLathe.scale(1.12, 1.0, 0.88);
  gripLathe.rotateZ(Math.PI - 0.11); // Hangs straight down (-Y) with slight rearward ergonomic rake (-X)!
  gripLathe.translate(0, -0.12, 0);
  paintGeometry(gripLathe, AUG_OLIVE);

  // Horizontal anti-slip tactile grooves along the foregrip
  const grooves: THREE.BufferGeometry[] = [];
  for (let i = 1; i <= 5; i++) {
    const gy = -0.85 - i * 0.68;
    const gx = gy * 0.11;
    grooves.push(
      paintGeometry(
        new THREE.TorusGeometry(0.5, 0.045, 8, 22)
          .scale(1.12, 0.88, 1)
          .rotateX(Math.PI / 2)
          .rotateZ(-0.11)
          .translate(gx, gy, 0),
        AUG_OLIVE_DARK
      )
    );
  }

  const lockSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -1.15,
      end: -0.25,
      centerX: -0.05,
      centerZ: 0,
      coilRadius: 0.16,
      wireRadius: 0.03,
      coils: 5,
    }),
    AUG_SPRING_STEEL
  );

  return mergeParts([topHinge, pivotPin, gripLathe, ...grooves, lockSpring]);
}
