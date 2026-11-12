import * as THREE from 'three';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  finalizeGeometry,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';

// Authentic Steyr AUG A1 (StG 77) color palette (used when PBR toggled off & for vertex-color UV tagging)
export const AUG_OLIVE = '#4b5841';
export const AUG_OLIVE_DARK = '#3b4633';
export const AUG_ANODIZED_GREY = '#3b4452';
export const AUG_DARK_STEEL = '#46505f';
export const AUG_CHAMFER_STEEL = '#586476';
export const AUG_BLACK_POLYMER = '#313640';
export const AUG_INNER_DARK = '#252b35';
export const AUG_BRIGHT_STEEL = '#cbd5e1';
export const AUG_CHROME_STEEL = '#e2e8f0';
export const AUG_RUBBER_BLACK = '#242830';
export const AUG_POLYMER_PACK = '#52584e';
export const AUG_LENS_CYAN = '#0ea5a8';
export const AUG_AMBER_MAG = '#785a28';
export const AUG_SAFETY_RED = '#dc2626';
export const AUG_SAFETY_WHITE = '#f1f5f9';
export const AUG_SPRING_STEEL = '#94a3b8';

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

/**
 * Strips any zero-area CSG/Lathe sliver triangles, ensures non-indexed attributes,
 * enforces exact unit-length normals (|n| = 1) with zero NaN/Infinity, and updates bounds.
 */
export function sanitizeAugMesh(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.getAttribute('position');
  const norm = src.getAttribute('normal');
  const uv = src.getAttribute('uv');
  const col = src.getAttribute('color');
  const vCount = pos.count;

  const validTris: number[] = [];
  for (let i = 0; i + 2 < vCount; i += 3) {
    _vA.fromBufferAttribute(pos, i);
    _vB.fromBufferAttribute(pos, i + 1);
    _vC.fromBufferAttribute(pos, i + 2);
    _e1.subVectors(_vB, _vA);
    _e2.subVectors(_vC, _vA);
    _fn.crossVectors(_e1, _e2);
    if (_fn.lengthSq() > 1e-16) {
      validTris.push(i);
    }
  }

  let out = src;
  if (validTris.length * 3 !== vCount) {
    const nV = validTris.length * 3;
    const pArr = new Float32Array(nV * 3);
    const nArr = new Float32Array(nV * 3);
    const uArr = new Float32Array(nV * 2);
    const cArr = new Float32Array(nV * 3);

    for (let t = 0; t < validTris.length; t++) {
      const base = validTris[t];
      for (let k = 0; k < 3; k++) {
        const si = base + k;
        const di = t * 3 + k;
        pArr[di * 3] = pos.getX(si);
        pArr[di * 3 + 1] = pos.getY(si);
        pArr[di * 3 + 2] = pos.getZ(si);

        nArr[di * 3] = norm ? norm.getX(si) : 0;
        nArr[di * 3 + 1] = norm ? norm.getY(si) : 1;
        nArr[di * 3 + 2] = norm ? norm.getZ(si) : 0;

        uArr[di * 2] = uv ? uv.getX(si) : 0;
        uArr[di * 2 + 1] = uv ? uv.getY(si) : 0;

        cArr[di * 3] = col ? col.getX(si) : 0.5;
        cArr[di * 3 + 1] = col ? col.getY(si) : 0.5;
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.5;
      }
    }
    out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nArr, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uArr, 2));
    out.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
    if (src !== geo) src.dispose();
    geo.dispose();
  } else if (src !== geo) {
    geo.dispose();
  }

  const outPos = out.getAttribute('position');
  const outNorm = out.getAttribute('normal');
  const nTotal = outPos.count;
  for (let i = 0; i + 2 < nTotal; i += 3) {
    let needFace = false;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const nx = outNorm.getX(vi);
      const ny = outNorm.getY(vi);
      const nz = outNorm.getZ(vi);
      const len = Math.hypot(nx, ny, nz);
      if (!Number.isFinite(len) || len < 1e-5) {
        needFace = true;
      } else {
        outNorm.setXYZ(vi, nx / len, ny / len, nz / len);
      }
    }
    if (needFace) {
      _vA.fromBufferAttribute(outPos, i);
      _vB.fromBufferAttribute(outPos, i + 1);
      _vC.fromBufferAttribute(outPos, i + 2);
      _e1.subVectors(_vB, _vA);
      _e2.subVectors(_vC, _vA);
      _fn.crossVectors(_e1, _e2);
      if (_fn.lengthSq() > 1e-16) _fn.normalize();
      else _fn.set(0, 1, 0);
      for (let k = 0; k < 3; k++) {
        const vi = i + k;
        const nx = outNorm.getX(vi);
        const ny = outNorm.getY(vi);
        const nz = outNorm.getZ(vi);
        const len = Math.hypot(nx, ny, nz);
        if (!Number.isFinite(len) || len < 1e-5) {
          outNorm.setXYZ(vi, _fn.x, _fn.y, _fn.z);
        }
      }
    }
  }

  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/**
 * Unwraps F-01 Austrian Olive-Green Polyamide Bullpup Stock onto upper half of aug_stock_*.webp (2048x1024).
 */
export function applyAugStockUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx, cy, cz, cr, cg, cb, fnz } = triInfo(pos, col, i, i + 1, i + 2);

    let mode:
      | 'steel'
      | 'dark_accent'
      | 'left_butt'
      | 'right_butt'
      | 'grip'
      | 'olive_plain' = 'olive_plain';

    if (cr > 0.45) {
      mode = 'steel';
    } else if (cb > cg || (cg < 0.035 && cr < 0.035)) {
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

      let u: number;
      let v: number;

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

      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-04 Die-Cast Aluminum Receiver & 1.5x Swarovski Habicht Optic onto lower half of aug_stock_*.webp.
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

      let u: number;
      let v: number;

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

      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
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
 * Unwraps M-01 30-Rd Translucent Amber Waffle Polymer Magazine onto aug_mag_*.webp (1024x1024).
 * Maps rear (-X) convex spine -> u ≈ 0.08 (brass rim) and front (+X) concave spine -> u ≈ 0.92 (copper bullet tip)
 * so cartridges point forward (+X) on BOTH left and right magazine walls!
 */
export function applyAugMagUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
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

      let u: number;
      let v: number;

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

      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
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
 * 1:1 Steyr Mannlicher StG 77 features:
 *  - Rear bullpup cheekpiece housing (X ∈ [-17.30, -2.50], Y ∈ [-4.30, +2.06]) w/ ergonomic cheekweld crown
 *  - Rear bullpup magwell BEHIND pistol grip (X ∈ [-11.75, -8.35]) + ambi rear paddle mag catch & pivot pin
 *  - Right ejection port w/ brass-deflector rear lip & snapped-on Left Ejection Port Cover w/ spring clips
 *  - Cross-bolt safety housing bosses & through-slot above grip + receiver takedown lock wedge
 *  - Swept-back (-18°) ergonomic pistol grip + iconic Steyr full-hand winter trigger guard bow
 *  - Forward receiver cradle saddle (X ∈ [-2.50, +3.85], Y = +0.42) & rear takedown pin bosses
 */
export function buildAugStockGeometry(): THREE.BufferGeometry {
  // 1. Main Bullpup Stock Side Silhouette extruded across Z ∈ [-0.88, +0.88]
  const stockOutline = new THREE.Shape();
  stockOutline.moveTo(-17.3, -4.28); // Buttstock rear bottom toe
  stockOutline.lineTo(-17.3, 1.98); // Buttstock rear top face (mates flush w/ buttpad at X = -17.30!)
  stockOutline.quadraticCurveTo(-17.25, 2.06, -16.95, 2.06);
  stockOutline.lineTo(-2.5, 2.06); // Horizontal bullpup cheekpiece top deck
  stockOutline.lineTo(-2.5, 0.42); // Vertical step down to aluminum receiver mating deck
  stockOutline.lineTo(3.85, 0.42); // Forward receiver saddle top deck (X ∈ [-2.50, +3.85])
  stockOutline.lineTo(3.55, -1.15); // Tapered front nose ahead of trigger guard
  stockOutline.quadraticCurveTo(3.15, -1.78, 2.35, -1.82);
  stockOutline.lineTo(-8.35, -2.08); // Belly bridge between pistol grip and rear magwell
  stockOutline.lineTo(-8.35, -3.48); // Front lip of rear bullpup magwell
  stockOutline.lineTo(-11.75, -3.48); // Magwell bottom opening (X ∈ [-11.75, -8.35])
  stockOutline.lineTo(-11.95, -3.64); // Rear magwell paddle catch housing boss
  stockOutline.lineTo(-13.15, -3.56);
  stockOutline.lineTo(-13.68, -2.98); // Stepped bullpup underside behind magwell
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

  // Molded top cheekpiece comb rounding along [-16.9, -2.6]
  const cheekComb = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 14.3, 18)
      .rotateZ(Math.PI / 2)
      .scale(1, 0.48, 1.85)
      .translate(-9.75, 1.94, 0),
    AUG_OLIVE
  );
  const stockWithComb = csgUnion([mainStockRaw, cheekComb]);

  // Hollow internal cavities:
  // - Upper carrier/hammer-pack/recoil-spring tunnel inside buttstock
  // - Forward receiver/transfer-bar channel
  // - Rear bullpup magwell curved throat
  // - Right-side brass ejection port opening
  // - Left-side ejection port recess (covered by removable dust cover)
  // - Sliding trigger slot & cross-bolt safety bore
  const innerButtCavity = paintGeometry(
    new THREE.BoxGeometry(14.55, 3.55, 1.34).translate(-9.85, 0.05, 0),
    AUG_OLIVE_DARK
  );
  const innerForeChannel = paintGeometry(
    new THREE.BoxGeometry(6.6, 1.85, 1.32).translate(0.55, -0.35, 0),
    AUG_OLIVE_DARK
  );
  const magwellCut = paintGeometry(
    new THREE.BoxGeometry(2.86, 4.65, 1.34)
      .rotateZ(0.08)
      .translate(-9.98, -1.55, 0),
    AUG_OLIVE_DARK
  );
  const rightEjectPort = paintGeometry(
    new THREE.BoxGeometry(2.96, 1.06, 0.78).translate(-8.2, 1.12, 0.65),
    AUG_OLIVE_DARK
  );
  const leftEjectPortRecess = paintGeometry(
    new THREE.BoxGeometry(2.96, 1.06, 0.16).translate(-8.2, 1.12, -0.84),
    AUG_OLIVE_DARK
  );
  const triggerSlotCut = paintGeometry(
    new THREE.BoxGeometry(1.58, 1.22, 0.66).translate(0.55, -1.78, 0),
    AUG_OLIVE_DARK
  );
  const safetyCrossSlot = paintGeometry(
    new THREE.BoxGeometry(0.5, 0.48, 2.0).translate(-0.65, -1.42, 0),
    AUG_OLIVE_DARK
  );
  const takedownPinHole = paintGeometry(
    new THREE.CylinderGeometry(0.19, 0.19, 2.0, 16)
      .rotateX(Math.PI / 2)
      .translate(-15.85, -2.45, 0),
    AUG_OLIVE_DARK
  );

  const hollowedHull = csgSubtract(stockWithComb, [
    innerButtCavity,
    innerForeChannel,
    magwellCut,
    rightEjectPort,
    leftEjectPortRecess,
    triggerSlotCut,
    safetyCrossSlot,
    takedownPinHole,
  ]);

  // 2. Swept-Back Ergonomic Pistol Grip (root at X = -1.05, Y = -1.55 -> sweeps BACKWARD to X = -2.85, Y = -7.26)
  const gripShape = new THREE.Shape();
  gripShape.moveTo(-2.15, -1.55);
  gripShape.lineTo(0.05, -1.55);
  gripShape.quadraticCurveTo(-0.35, -3.6, -1.75, -7.05);
  gripShape.quadraticCurveTo(-1.95, -7.28, -2.35, -7.26);
  gripShape.lineTo(-3.55, -7.12);
  gripShape.quadraticCurveTo(-3.82, -6.92, -3.65, -6.35);
  gripShape.quadraticCurveTo(-2.75, -3.85, -2.35, -2.05);
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

  // Grip base storage plug cap
  const gripBaseCap = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.14, 0.88)
      .rotateZ(0.11)
      .translate(-2.72, -7.2, 0),
    AUG_RUBBER_BLACK
  );

  // 3. Iconic Full-Hand Steyr AUG Winter Trigger Guard Bow
  const bowShape = new THREE.Shape();
  bowShape.moveTo(-2.05, -7.08);
  bowShape.quadraticCurveTo(0.45, -5.85, 2.65, -1.62);
  bowShape.lineTo(1.98, -1.62);
  bowShape.quadraticCurveTo(0.05, -5.28, -1.78, -6.52);
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

  // 4. Molded Flared Magwell Collar, Right Brass Deflector, Left Ejection Port Cover, Ambi Mag Catch & Cross-Bolt Locks
  const magwellFlange = csgSubtract(
    paintGeometry(
      new THREE.BoxGeometry(3.48, 0.54, 1.78).translate(-10.05, -3.32, 0),
      AUG_OLIVE
    ),
    [
      paintGeometry(
        new THREE.BoxGeometry(2.84, 0.82, 1.34).translate(-10.0, -3.32, 0),
        AUG_OLIVE_DARK
      ),
    ]
  );

  // Right ejection port rear brass-deflector bevel lip
  const rightBrassDeflector = paintGeometry(
    new THREE.BoxGeometry(0.32, 1.14, 0.14)
      .rotateY(-0.35)
      .translate(-9.82, 1.12, 0.9),
    AUG_OLIVE
  );

  // Snapped-on Left Ejection Port Polymer Dust Cover w/ twin retention clips
  const leftEjectCover = paintGeometry(
    new THREE.BoxGeometry(3.04, 1.12, 0.14).translate(-8.2, 1.12, -0.87),
    AUG_OLIVE
  );
  const leftCoverClipF = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.34, 0.08).translate(-7.15, 1.12, -0.95),
    AUG_OLIVE_DARK
  );
  const leftCoverClipR = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.34, 0.08).translate(-9.25, 1.12, -0.95),
    AUG_OLIVE_DARK
  );

  // Cross-bolt safety bezel rims on left/right stock walls
  const safetyBezel = csgSubtract(
    paintGeometry(
      new THREE.BoxGeometry(0.68, 0.66, 1.78).translate(-0.65, -1.42, 0),
      AUG_OLIVE
    ),
    [
      paintGeometry(
        new THREE.BoxGeometry(0.49, 0.47, 1.95).translate(-0.65, -1.42, 0),
        AUG_OLIVE_DARK
      ),
    ]
  );

  // Rear Ambidextrous Ribbed Paddle Magazine Release behind magwell + steel cross-pin
  const magCatchPaddle = paintGeometry(
    new THREE.BoxGeometry(1.02, 0.44, 0.98)
      .rotateZ(0.18)
      .translate(-12.38, -3.56, 0),
    AUG_BLACK_POLYMER
  );
  const magCatchPin = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 1.56, 12)
      .rotateX(Math.PI / 2)
      .translate(-12.05, -3.32, 0),
    AUG_BRIGHT_STEEL
  );

  // Receiver Takedown Cross-Lock Wedge above pistol grip (X = -2.05, Y = -0.22)
  const receiverLockWedge = paintGeometry(
    new THREE.BoxGeometry(0.58, 0.36, 1.88).translate(-2.05, -0.22, 0),
    AUG_BLACK_POLYMER
  );

  // Horizontal anti-slip grip ribs on front strap of pistol grip
  const gripRibs: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 6; r++) {
    const t = r / 5;
    const rx = -0.42 - t * 1.18;
    const ry = -2.75 - t * 3.45;
    gripRibs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.16, 0.14, 1.16)
          .rotateZ(-0.31)
          .translate(rx, ry, 0),
        AUG_OLIVE_DARK
      )
    );
  }

  const merged = sanitizeAugMesh(
    mergeParts([
      hollowedHull,
      gripGeo,
      gripBaseCap,
      bowGeo,
      magwellFlange,
      rightBrassDeflector,
      leftEjectCover,
      leftCoverClipF,
      leftCoverClipR,
      safetyBezel,
      magCatchPaddle,
      magCatchPin,
      receiverLockWedge,
      ...gripRibs,
    ])
  );
  return applyAugStockUVs(merged);
}

/**
 * F-02: Ribbed Black Elastomer Shoulder Buttpad & Cleaning Trapdoor (assembledPos: [-17.90, -1.12, 0])
 * Spans local X ∈ [-0.62, +0.96] => mates flush with aug_stock rear face at X = -17.30,
 * with internal hollow cleaning-kit plug boss & takedown-pin lock hole!
 */
export function buildAugButtpadGeometry(): THREE.BufferGeometry {
  const padShape = new THREE.Shape();
  padShape.moveTo(0.6, -3.16);
  padShape.lineTo(0.6, 3.18); // Flat front mating lip against stock rear face X = -17.30
  padShape.lineTo(-0.42, 3.14);
  padShape.quadraticCurveTo(-0.2, 0.15, -0.58, -3.08);
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

  // Internal hollow elastomer plug fitting inside buttstock mouth + oiler trapdoor recess
  const innerPlugRaw = paintGeometry(
    new THREE.BoxGeometry(0.56, 5.1, 1.26).translate(0.84, 0.05, 0),
    AUG_RUBBER_BLACK
  );
  const innerPlug = csgSubtract(innerPlugRaw, [
    paintGeometry(
      new THREE.BoxGeometry(0.45, 2.4, 0.88).translate(0.92, 0.35, 0),
      AUG_INNER_DARK
    ),
  ]);

  // Hinged rear cleaning-kit trapdoor lid w/ thumb-pry lip
  const trapdoorFrame = csgSubtract(
    paintGeometry(
      new THREE.BoxGeometry(0.16, 2.05, 0.82).translate(-0.34, 0.35, 0),
      AUG_ANODIZED_GREY
    ),
    [
      paintGeometry(
        new THREE.BoxGeometry(0.18, 1.72, 0.62).translate(-0.38, 0.35, 0),
        AUG_INNER_DARK
      ),
    ]
  );
  const trapdoorLid = paintGeometry(
    new THREE.BoxGeometry(0.1, 1.66, 0.58).translate(-0.33, 0.35, 0),
    AUG_BLACK_POLYMER
  );

  const ribs: THREE.BufferGeometry[] = [];
  for (let i = -5; i <= 5; i++) {
    if (i >= 0 && i <= 2) continue; // Leave clean window over trapdoor lid
    ribs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.14, 0.12, 1.56).translate(
          -0.38 - Math.abs(i) * 0.015,
          i * 0.52,
          0
        ),
        AUG_BLACK_POLYMER
      )
    );
  }

  return sanitizeAugMesh(
    mergeParts([rawPad, innerPlug, trapdoorFrame, trapdoorLid, ...ribs])
  );
}

/**
 * F-03: Rear Captive Takedown Cross-Pin & Left Swivel Sling Loop (assembledPos: [-15.85, -2.45, 0])
 */
export function buildAugTakedownPinGeometry(): THREE.BufferGeometry {
  const crossPinRaw = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 1.98, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    AUG_DARK_STEEL
  );
  // Captive spring-detent groove along shaft
  const detentRingCut = paintGeometry(
    new THREE.TorusGeometry(0.19, 0.04, 8, 18).translate(0, 0, 0.42),
    AUG_INNER_DARK
  );
  const crossPin = csgSubtract(crossPinRaw, [detentRingCut]);

  // Cupped right thumb-press cap
  const rightButtonCap = csgSubtract(
    paintGeometry(
      new THREE.CylinderGeometry(0.26, 0.26, 0.14, 20)
        .rotateX(Math.PI / 2)
        .translate(0, 0, 0.96),
      AUG_BRIGHT_STEEL
    ),
    [
      paintGeometry(
        new THREE.SphereGeometry(0.22, 16, 12).translate(0, 0, 1.12),
        AUG_INNER_DARK
      ),
    ]
  );

  const leftSwivelStud = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.26, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -1.02),
    AUG_DARK_STEEL
  );
  const slingClevis = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.28, 0.24).translate(-0.08, -0.1, -1.14),
    AUG_DARK_STEEL
  );
  // Iconic Steyr oval steel rear sling swivel loop hanging on left side
  const slingLoop = paintGeometry(
    new THREE.TorusGeometry(0.52, 0.075, 12, 26)
      .scale(1.35, 0.85, 1)
      .rotateX(0.35)
      .translate(-0.35, -0.32, -1.16),
    AUG_DARK_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([
      crossPin,
      rightButtonCap,
      leftSwivelStud,
      slingClevis,
      slingLoop,
    ])
  );
}

/**
 * F-04: Die-Cast Aluminum Receiver w/ Integrated 20°-Canted Swarovski Habicht 1.5×14 Optical Sight Handle
 * (assembledPos: [0, 0, 0], isShell: true)
 * 1:1 Steyr Mannlicher StG 77 features:
 *  - Die-cast anodized aluminum receiver block (X ∈ [-2.50, +5.85], Y ∈ [+0.42, +2.10]) w/ octagonal upper chamfers & side lightening ribs
 *  - Rear steel barrel/bolt locking trunnion sleeve extending into stock (X ∈ [-8.20, -2.45], Y = 1.05)
 *  - Left charging-handle guide slot w/ fold-up manual hold-open notch & right offset gas-rod sleeve
 *  - Authentic 20° forward-canted carry-handle stanchions supporting the Swarovski Habicht 1.5×14 scope tube (Y = 3.88)
 *  - Recessed objective & ocular lens cells w/ multi-coated cyan glass lenses, slotted windage/elevation caps & backup iron sights atop scope tube!
 */
export function buildAugReceiverOpticGeometry(): THREE.BufferGeometry {
  // 1. Lower Die-Cast Aluminum Receiver Body (mates flush w/ stock at X = -2.50 and Y = +0.42)
  const recHull = paintGeometry(
    new THREE.BoxGeometry(8.35, 1.68, 1.66).translate(1.675, 1.26, 0),
    AUG_ANODIZED_GREY
  );
  const rightRodTube = paintGeometry(
    new THREE.CylinderGeometry(0.33, 0.33, 8.35, 20)
      .rotateZ(Math.PI / 2)
      .translate(1.675, 1.52, 0.52),
    AUG_ANODIZED_GREY
  );
  const leftGuideRail = paintGeometry(
    new THREE.CylinderGeometry(0.3, 0.3, 8.15, 18)
      .rotateZ(Math.PI / 2)
      .translate(1.58, 1.52, -0.52),
    AUG_ANODIZED_GREY
  );
  const frontBarrelCollar = paintGeometry(
    new THREE.CylinderGeometry(0.76, 0.79, 2.25, 24)
      .rotateZ(Math.PI / 2)
      .translate(4.92, 1.05, 0),
    AUG_ANODIZED_GREY
  );
  // Bottom receiver takedown lug engaging aug_stock cross-wedge at X = -2.05
  const bottomLockLug = paintGeometry(
    new THREE.BoxGeometry(0.88, 0.52, 0.84).translate(-2.05, 0.22, 0),
    AUG_ANODIZED_GREY
  );

  const recUnion = csgUnion([
    recHull,
    rightRodTube,
    leftGuideRail,
    frontBarrelCollar,
    bottomLockLug,
  ]);

  // Subtract upper octagonal chamfers, barrel bore, twin guide-rod bores, side lightening grooves, and left charging slot + hold-open notch
  const recCutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(8.6, 0.48, 0.48)
        .rotateX(Math.PI / 4)
        .translate(1.675, 2.12, 0.85),
      AUG_CHAMFER_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(8.6, 0.48, 0.48)
        .rotateX(Math.PI / 4)
        .translate(1.675, 2.12, -0.85),
      AUG_CHAMFER_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.57, 0.57, 9.2, 24)
        .rotateZ(Math.PI / 2)
        .translate(1.65, 1.05, 0),
      AUG_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.21, 0.21, 8.8, 16)
        .rotateZ(Math.PI / 2)
        .translate(1.65, 1.52, 0.52),
      AUG_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.21, 0.21, 8.8, 16)
        .rotateZ(Math.PI / 2)
        .translate(1.65, 1.52, -0.52),
      AUG_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(6.95, 0.32, 0.58).translate(1.65, 1.62, -0.72),
      AUG_INNER_DARK
    ),
    // Iconic Steyr AUG fold-up manual bolt-hold-open lock notch
    paintGeometry(
      new THREE.BoxGeometry(0.76, 0.44, 0.58).translate(0.18, 1.85, -0.72),
      AUG_INNER_DARK
    ),
    // Subtle die-cast receiver lower flank fuller recesses (preserving mid engraving zone!)
    paintGeometry(
      new THREE.BoxGeometry(4.8, 0.2, 0.12).translate(1.1, 0.58, 0.84),
      AUG_ANODIZED_GREY
    ),
    paintGeometry(
      new THREE.BoxGeometry(4.8, 0.2, 0.12).translate(1.1, 0.58, -0.84),
      AUG_ANODIZED_GREY
    ),
  ];
  const sculptedRec = csgSubtract(recUnion, recCutters);

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
        new THREE.CylinderGeometry(0.53, 0.53, 6.0, 22)
          .rotateZ(Math.PI / 2)
          .translate(-5.32, 1.05, 0),
        AUG_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(2.45, 0.86, 0.72).translate(-7.15, 1.08, 0.48),
        AUG_INNER_DARK
      ),
    ]
  );

  // 3. Authentic 20°-Canted Carry-Handle Optic Stanchions (tan(20°) ≈ 0.364 -> ΔX = +0.56 over ΔY = 1.54!)
  const rearStrutShape = new THREE.Shape();
  rearStrutShape.moveTo(-2.28, 2.0);
  rearStrutShape.lineTo(-0.78, 2.0);
  rearStrutShape.quadraticCurveTo(-0.48, 2.65, -0.22, 3.54);
  rearStrutShape.lineTo(-1.72, 3.54);
  rearStrutShape.quadraticCurveTo(-1.98, 2.75, -2.28, 2.0);
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
  frontStrutShape.moveTo(3.25, 2.0);
  frontStrutShape.lineTo(4.75, 2.0);
  frontStrutShape.quadraticCurveTo(5.05, 2.72, 5.31, 3.54);
  frontStrutShape.lineTo(3.81, 3.54);
  frontStrutShape.quadraticCurveTo(3.52, 2.72, 3.25, 2.0);
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

  // Sculpted under-scope carry-handle reinforcement rib bridging both 20° struts
  const scopeBellyBridge = paintGeometry(
    new THREE.BoxGeometry(5.6, 0.24, 0.56).translate(1.55, 3.42, 0),
    AUG_ANODIZED_GREY
  );

  // 4. Integrated Swarovski Habicht 1.5×14 Tubular Optical Sight (X ∈ [-4.45, +5.85], Y = 3.88, Z = 0)
  const scopePts: THREE.Vector2[] = [
    new THREE.Vector2(0.48, -4.45),
    new THREE.Vector2(0.69, -4.45), // Flared ocular bell rear rim
    new THREE.Vector2(0.69, -3.35),
    new THREE.Vector2(0.56, -2.72), // Main 1.5x14 Habicht tube body
    new THREE.Vector2(0.56, 4.32),
    new THREE.Vector2(0.67, 4.92), // Flared objective bell
    new THREE.Vector2(0.67, 5.85),
    new THREE.Vector2(0.49, 5.85),
  ];
  const scopeRaw = new THREE.LatheGeometry(scopePts, 30);
  scopeRaw.rotateZ(-Math.PI / 2);
  scopeRaw.translate(0, 3.88, 0);
  paintGeometry(scopeRaw, AUG_ANODIZED_GREY);

  // Deep recessed ocular & objective optical cells
  const ocularRecess = paintGeometry(
    new THREE.CylinderGeometry(0.53, 0.53, 0.52, 26)
      .rotateZ(Math.PI / 2)
      .translate(-4.26, 3.88, 0),
    AUG_INNER_DARK
  );
  const objectiveRecess = paintGeometry(
    new THREE.CylinderGeometry(0.52, 0.52, 0.56, 26)
      .rotateZ(Math.PI / 2)
      .translate(5.66, 3.88, 0),
    AUG_INNER_DARK
  );
  const scopeTube = csgSubtract(scopeRaw, [ocularRecess, objectiveRecess]);

  // Internal threaded lens retaining rings + multi-coated emerald-cyan Swarovski glass lenses
  const ocularRetainer = paintGeometry(
    new THREE.TorusGeometry(0.51, 0.032, 8, 24)
      .rotateY(Math.PI / 2)
      .translate(-4.35, 3.88, 0),
    AUG_DARK_STEEL
  );
  const objectiveRetainer = paintGeometry(
    new THREE.TorusGeometry(0.5, 0.032, 8, 24)
      .rotateY(Math.PI / 2)
      .translate(5.75, 3.88, 0),
    AUG_DARK_STEEL
  );
  const ocularLens = paintGeometry(
    new THREE.SphereGeometry(0.5, 24, 16)
      .scale(0.18, 1, 1)
      .translate(-4.12, 3.88, 0),
    AUG_LENS_CYAN
  );
  const objectiveLens = paintGeometry(
    new THREE.SphereGeometry(0.5, 24, 16)
      .scale(0.18, 1, 1)
      .translate(5.5, 3.88, 0),
    AUG_LENS_CYAN
  );

  // Coin-slotted Windage (+Z) & Elevation (-Y) Adjustment Turret Caps + Front Left Captive Sling Swivel
  const windageTurret = csgSubtract(
    paintGeometry(
      new THREE.CylinderGeometry(0.28, 0.32, 0.38, 20)
        .rotateX(Math.PI / 2)
        .translate(1.45, 3.88, 0.62),
      AUG_ANODIZED_GREY
    ),
    [
      paintGeometry(
        new THREE.BoxGeometry(0.46, 0.06, 0.12).translate(1.45, 3.88, 0.8),
        AUG_INNER_DARK
      ),
    ]
  );
  const elevationTurret = csgSubtract(
    paintGeometry(
      new THREE.CylinderGeometry(0.28, 0.32, 0.34, 20).translate(1.45, 3.26, 0),
      AUG_ANODIZED_GREY
    ),
    [
      paintGeometry(
        new THREE.BoxGeometry(0.46, 0.1, 0.06).translate(1.45, 3.1, 0),
        AUG_INNER_DARK
      ),
    ]
  );
  const frontSlingBoss = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.32, 14)
      .rotateX(Math.PI / 2)
      .translate(5.18, 2.18, -0.68),
    AUG_ANODIZED_GREY
  );
  const frontSlingRing = paintGeometry(
    new THREE.TorusGeometry(0.36, 0.065, 10, 22)
      .rotateY(0.5)
      .translate(5.25, 2.22, -0.82),
    AUG_DARK_STEEL
  );

  // 5. Integral Top Backup Iron Sights cast atop the Swarovski scope housing (Y = 4.52..4.82)
  const backupRearEars = csgSubtract(
    paintGeometry(
      new THREE.BoxGeometry(0.84, 0.3, 0.64).translate(-3.65, 4.63, 0),
      AUG_ANODIZED_GREY
    ),
    [
      paintGeometry(
        new THREE.BoxGeometry(0.95, 0.18, 0.16).translate(-3.65, 4.7, 0),
        AUG_INNER_DARK
      ),
    ]
  );
  const backupFrontHood = csgSubtract(
    paintGeometry(
      new THREE.BoxGeometry(0.92, 0.28, 0.52).translate(5.2, 4.62, 0),
      AUG_ANODIZED_GREY
    ),
    [
      paintGeometry(
        new THREE.BoxGeometry(0.98, 0.22, 0.28).translate(5.2, 4.68, 0),
        AUG_INNER_DARK
      ),
    ]
  );
  const backupFrontPost = paintGeometry(
    new THREE.BoxGeometry(0.14, 0.22, 0.09).translate(5.24, 4.68, 0),
    AUG_BRIGHT_STEEL
  );

  // Lower Barrel Lock Housing Boss under receiver at X = +3.65, Y = +0.52
  const barrelLockBoss = csgSubtract(
    paintGeometry(
      new THREE.BoxGeometry(1.18, 0.58, 1.74).translate(3.65, 0.58, 0),
      AUG_ANODIZED_GREY
    ),
    [
      paintGeometry(
        new THREE.BoxGeometry(0.72, 0.4, 1.86).translate(3.65, 0.52, 0),
        AUG_INNER_DARK
      ),
    ]
  );

  const merged = sanitizeAugMesh(
    mergeParts([
      sculptedRec,
      trunnionTube,
      rearStrut,
      frontStrut,
      scopeBellyBridge,
      scopeTube,
      ocularRetainer,
      objectiveRetainer,
      ocularLens,
      objectiveLens,
      windageTurret,
      elevationTurret,
      frontSlingBoss,
      frontSlingRing,
      backupRearEars,
      backupFrontHood,
      backupFrontPost,
      barrelLockBoss,
    ])
  );
  return applyAugReceiverOpticUVs(merged);
}

/**
 * F-05: Quick-Change Barrel Cross-Lock Latch & Spring (assembledPos: [3.65, 0.52, 0])
 */
export function buildAugBarrelLockGeometry(): THREE.BufferGeometry {
  // Stepped cross-receiver locking bar w/ curved upper spline engagement teeth
  const crossLugRaw = paintGeometry(
    new THREE.BoxGeometry(0.66, 0.36, 1.96).translate(0, 0, 0),
    AUG_DARK_STEEL
  );
  // Barrel clearance scallop on upper left half (disengages when pushed inward -Z)
  const releaseScallop = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.46, 0.85, 18)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.46, 0.32),
    AUG_INNER_DARK
  );
  const crossLug = csgSubtract(crossLugRaw, [releaseScallop]);

  // Locking spline teeth engaging barrel's interrupted locking flange
  const lockTeeth: THREE.BufferGeometry[] = [];
  for (let i = -1; i <= 1; i++) {
    lockTeeth.push(
      paintGeometry(
        new THREE.BoxGeometry(0.12, 0.12, 0.56).translate(
          i * 0.22,
          0.22,
          -0.28
        ),
        AUG_BRIGHT_STEEL
      )
    );
  }

  // Right angled diagonal-ribbed thumb push pad & left guide retainer cap
  const thumbPad = paintGeometry(
    new THREE.BoxGeometry(0.88, 0.5, 0.22)
      .rotateY(0.12)
      .translate(0, -0.04, 0.98),
    AUG_ANODIZED_GREY
  );
  const leftStopCap = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 0.14, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -1.0),
    AUG_CHAMFER_STEEL
  );
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = -1; i <= 1; i++) {
    ribs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.11, 0.44, 0.08)
          .rotateZ(0.35)
          .translate(i * 0.24, -0.04, 1.09),
        AUG_BRIGHT_STEEL
      )
    );
  }

  const returnSpring = paintGeometry(
    finalizeGeometry(
      createHelicalSpring({
        axis: 'y',
        start: -0.78,
        end: -0.15,
        centerX: 0,
        centerZ: 0,
        coilRadius: 0.12,
        wireRadius: 0.025,
        coils: 5,
      }).rotateX(Math.PI / 2)
    ),
    AUG_SPRING_STEEL
  );

  return sanitizeAugMesh(
    mergeParts([
      crossLug,
      ...lockTeeth,
      thumbPad,
      leftStopCap,
      ...ribs,
      returnSpring,
    ])
  );
}

/**
 * F-06: Left Non-Reciprocating Folding Charging Handle w/ Fold-Up Lock Notch (assembledPos: [3.45, 1.62, -0.92])
 */
export function buildAugChargingHandleGeometry(): THREE.BufferGeometry {
  // Internal steel shuttle slider riding in left receiver channel + rear drive dog
  const shuttleBar = paintGeometry(
    new THREE.BoxGeometry(2.95, 0.26, 0.32).translate(-0.35, 0, 0.18),
    AUG_DARK_STEEL
  );
  const driveDog = paintGeometry(
    new THREE.BoxGeometry(0.34, 0.36, 0.38).translate(-1.68, -0.06, 0.34),
    AUG_BRIGHT_STEEL
  );
  const hingeKnuckle = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.62, 18)
      .rotateZ(Math.PI / 2)
      .translate(0.45, 0, -0.06),
    AUG_DARK_STEEL
  );
  const hingePin = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.72, 14)
      .rotateZ(Math.PI / 2)
      .translate(0.45, 0, -0.06),
    AUG_BRIGHT_STEEL
  );

  // Iconic Steyr olive-green polymer angled folding palm handle + upward hold-open lock lug!
  const palmHandle = paintGeometry(
    new THREE.BoxGeometry(1.48, 0.38, 0.64)
      .rotateY(0.42)
      .rotateX(-0.35)
      .translate(-0.16, 0.18, -0.44),
    AUG_OLIVE
  );
  const holdOpenLug = paintGeometry(
    new THREE.BoxGeometry(0.44, 0.24, 0.24).translate(-0.22, 0.22, -0.02),
    AUG_DARK_STEEL
  );
  const handleTip = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.26, 0.54, 18)
      .rotateZ(0.45)
      .translate(-0.8, 0.28, -0.66),
    AUG_OLIVE_DARK
  );

  const gripRibs: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    gripRibs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.08, 0.42, 0.66)
          .rotateY(0.42)
          .rotateX(-0.35)
          .translate(-0.02 - k * 0.24, 0.19 + k * 0.03, -0.46 - k * 0.08),
        AUG_OLIVE_DARK
      )
    );
  }

  return sanitizeAugMesh(
    mergeParts([
      shuttleBar,
      driveDog,
      hingeKnuckle,
      hingePin,
      palmHandle,
      holdOpenLug,
      handleTip,
      ...gripRibs,
    ])
  );
}

/**
 * F-07: Iconic Folding Vertical Foregrip & Pivot Spring (assembledPos: [8.85, -0.18, 0])
 * Top knuckle centered at local (0, 0, 0) so it mates flush inside aug_gas_block's bottom clevis!
 * Non-zero Lathe tip radius avoids degenerate pole triangles.
 */
export function buildAugForegripGeometry(): THREE.BufferGeometry {
  // Steel top pivot knuckle, locking detent cross-lug & cross-pin
  const topHinge = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 0.68, 22)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    AUG_DARK_STEEL
  );
  const detentLug = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.26, 0.66).translate(0, 0.28, 0),
    AUG_DARK_STEEL
  );
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.08, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    AUG_BRIGHT_STEEL
  );

  // Sculpted Olive-Green Vertical Grip Body hanging down Y_local ∈ [-5.18, -0.15] with subtle -6.5° ergonomic rake
  // Non-zero end radius (0.04) + cap cylinder eliminates degenerate r=0 Lathe triangles!
  const gripPts: THREE.Vector2[] = [
    new THREE.Vector2(0.38, 0.0),
    new THREE.Vector2(0.44, 0.45),
    new THREE.Vector2(0.54, 1.45), // Upper palm swell
    new THREE.Vector2(0.5, 2.65),
    new THREE.Vector2(0.53, 3.85), // Lower finger swell
    new THREE.Vector2(0.47, 4.78),
    new THREE.Vector2(0.3, 5.04), // Rounded bottom shoulder
    new THREE.Vector2(0.05, 5.08),
  ];
  const gripLathe = new THREE.LatheGeometry(gripPts, 24);
  gripLathe.scale(1.12, 1.0, 0.88);
  gripLathe.rotateZ(Math.PI - 0.11);
  gripLathe.translate(0, -0.12, 0);
  paintGeometry(gripLathe, AUG_OLIVE);

  const bottomPlugCap = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.22, 0.14, 18)
      .rotateZ(-0.11)
      .translate(-0.55, -5.12, 0),
    AUG_RUBBER_BLACK
  );

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

  return sanitizeAugMesh(
    mergeParts([
      topHinge,
      detentLug,
      pivotPin,
      gripLathe,
      bottomPlugCap,
      ...grooves,
      lockSpring,
    ])
  );
}
