import * as THREE from 'three';

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
  return { cx, cy, cz, cr, fnx: fNorm.x, fny: fNorm.y, fnz: fNorm.z };
}

/**
 * Unwraps R-01 Stamped AK-15M1 Receiver onto 2048x1024 ak_receiver_{albedo,normal,roughness}.png:
 *  - Right wall (u in [0.02, 0.98], v in [0.54, 0.96]): ПР / АВ / ОД stamps, AK safety scratch arc, dimple & rivets
 *  - Left wall  (u in [0.02, 0.98], v in [0.08, 0.50]): [КК] АК-15 7,62×39 2024 laser stamp, dimple & rivets
 *  - Internal / trunnion / rail steel: v in [0.01, 0.06]
 */
export function applyAkReceiverUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'bright_steel' | 'right' | 'left' | 'inner' = 'inner';
    if (cr > 0.42) {
      mode = 'bright_steel';
    } else if (fnz > 0.35 && cz > 0.32) {
      mode = 'right';
    } else if (fnz < -0.35 && cz < -0.32) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -6.25) / 12.3);
      const yNorm = clamp01((y - -0.92) / 2.56);

      let u: number;
      let v: number;
      if (mode === 'bright_steel') {
        u = 0.8 + fractPos((x + z) * 0.2) * 0.18;
        v = 0.01 + fractPos(y * 0.25) * 0.05;
      } else if (mode === 'right') {
        u = 0.02 + xNorm * 0.96;
        v = 0.54 + yNorm * 0.42;
      } else if (mode === 'left') {
        u = 0.02 + (1.0 - xNorm) * 0.96;
        v = 0.08 + yNorm * 0.42;
      } else {
        u = 0.03 + xNorm * 0.72;
        v = 0.01 + clamp01((z + 0.9) / 1.8) * 0.05;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps B-03 Bolt Carrier + Long-Stroke Gas Piston onto 1024x1024 ak_metal_{albedo,normal,roughness}.png:
 *  - Bolt carrier body & charging handle (x < 2.85): u in [0.03, 0.52], v in [0.54, 0.96]
 *  - Long-stroke stainless gas piston rod & carbon-fouled piston head (x >= 2.85): u in [0.03, 0.97], v in [0.10, 0.46]
 */
export function applyAkCarrierUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx } = triInfo(pos, col, i, i + 1, i + 2);
    const isPiston = cx >= 2.85;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (isPiston) {
        const pNorm = clamp01((x - 2.8) / 11.0);
        u = 0.03 + pNorm * 0.94;
        v = 0.12 + clamp01((y - 0.35 + z * 0.5) / 0.95) * 0.32;
      } else {
        const cNorm = clamp01((x - -2.9) / 5.8);
        u = 0.03 + cNorm * 0.49;
        v = 0.55 + clamp01((y + 0.5 + z * 0.35) / 1.8) * 0.39;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps M-01 30-Round 7.62×39mm Curved Windowed Magazine onto 1024x1024 ak_mag_{albedo,normal,roughness}.png:
 *  - Arc center in local mag coords: (cxArc = 12.2, cyArc = 0.2), R_mid = 12.2
 *  - Side polymer flanks map along arc angle -> v in [0.08, 0.95] and radial thickness -> u in [0.08, 0.92]
 *    (revealing clear ammo observation window with 7.62x39 cartridges & 10/15/20/25/30 witness marks!)
 *  - Steel locking lugs & feed lips: u in [0.80, 0.98], v in [0.01, 0.06]
 */
export function applyAkMagUVs(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  const ARC_CX = 11.8;
  const ARC_CY = 0.25;

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'steel' | 'right' | 'left' | 'spine' = 'spine';
    if (cr > 0.42) {
      mode = 'steel';
    } else if (fnz > 0.32 && cz > 0.2) {
      mode = 'right';
    } else if (fnz < -0.32 && cz < -0.2) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (mode === 'steel') {
        u = 0.8 + fractPos((x + z) * 0.25) * 0.18;
        v = 0.01 + fractPos(y * 0.25) * 0.05;
      } else {
        const dx = x - ARC_CX;
        const dy = y - ARC_CY;
        const rad = Math.sqrt(dx * dx + dy * dy);
        // Angle from (-1, 0) downward-forward: at top (x~0, y~0), atan2(-dy, -dx) ~ 0; at bottom (x~3.8, y~-10.3), ~ 0.88 rad
        const ang = Math.atan2(-dy, -dx);
        const sNorm = clamp01((ang - -0.03) / 0.92); // 0 at top -> 1 at bottom
        const rNorm = clamp01((rad - 10.45) / 2.7); // 0 at front concave edge -> 1 at rear convex spine

        if (mode === 'right') {
          u = 0.08 + (1.0 - rNorm) * 0.84;
          v = 0.95 - sNorm * 0.85;
        } else if (mode === 'left') {
          u = 0.08 + rNorm * 0.84;
          v = 0.95 - sNorm * 0.85;
        } else {
          // Front/rear spine ribs avoid the center window [0.36..0.64]
          u = 0.08 + clamp01((z + 0.65) / 1.3) * 0.2;
          v = 0.95 - sNorm * 0.85;
        }
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}
