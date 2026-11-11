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
  const cr = col ? (col.getX(i0) + col.getX(i1) + col.getX(i2)) / 3 : 0.2;

  return { cx, cy, cz, cr, fnx: fNorm.x, fny: fNorm.y, fnz: fNorm.z };
}

/**
 * Maps U-01 Slide triangles onto the 2048x1024 slide_{albedo,normal,roughness}.png PBR atlas:
 *  - Right side wall & shoulder: u in [0.02, 0.98], v in [0.55, 0.98] (includes KPV 892 & proof mark)
 *  - Left side wall & shoulder:  u in [0.02, 0.98], v in [0.08, 0.51] (includes [G] 17 AUSTRIA 9x19)
 *  - Top deck / bullnose / chin: u in [0.03, 0.49], v in [0.012, 0.064]
 *  - Milled dark cuts & grooves: u in [0.55, 0.96], v in [0.012, 0.064]
 */
export function applySlideAtlasUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = readTriInfo(pos, col, i, i + 1, i + 2);

    let mode: 'milled' | 'right' | 'left' | 'deck' = 'deck';
    if (cr < 0.018) {
      mode = 'milled';
    } else if (fnz > 0.26 && cz > 0.35) {
      mode = 'right';
    } else if (fnz < -0.26 && cz < -0.35) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -7.55) / 18.75);
      const yNorm = clamp01((y - 0.45) / 3.03);

      let u: number;
      let v: number;
      if (mode === 'milled') {
        u = 0.55 + fractPos((x + z) * 0.09) * 0.41;
        v = 0.012 + fractPos(y * 0.22) * 0.052;
      } else if (mode === 'right') {
        u = 0.02 + xNorm * 0.96;
        v = 0.55 + yNorm * 0.43;
      } else if (mode === 'left') {
        u = 0.02 + (1.0 - xNorm) * 0.96;
        v = 0.08 + yNorm * 0.43;
      } else {
        u = 0.03 + xNorm * 0.46;
        v = 0.012 + clamp01((z + 1.3) / 2.6) * 0.052;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Maps U-04 Barrel triangles onto the 1024x1024 barrel_{albedo,normal,roughness}.png PBR atlas:
 *  - Chamber hood right side (visible in port): u in [0.05, 0.47], v in [0.56, 0.94] (9x19 & KPV 892)
 *  - Chamber hood top/lug/left:                u in [0.52, 0.95], v in [0.56, 0.94] (lockup rub tracks)
 *  - Cylindrical outer tube:                   u in [0.03, 0.97], v in [0.12, 0.48] ("Glock smile" wear)
 *  - Polished feed ramp & muzzle crown:        u in [0.87, 0.98], v in [0.015, 0.085]
 *  - Dark 9mm hollow bore:                     u in [0.66, 0.81], v in [0.015, 0.085]
 */
export function applyBarrelAtlasUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx, cy, cr, fnz } = readTriInfo(pos, col, i, i + 1, i + 2);

    let mode: 'polished' | 'bore' | 'hood_right' | 'hood_other' | 'tube' =
      'tube';
    if (cr > 0.5) {
      mode = 'polished';
    } else if (cr < 0.025) {
      mode = 'bore';
    } else if (cx < 2.58) {
      mode = cy > 1.82 && fnz > 0.45 ? 'hood_right' : 'hood_other';
    }

    const baseTheta = Math.atan2(pos.getZ(i), pos.getY(i) - 2.55);

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (mode === 'polished') {
        u = 0.87 + clamp01((z + 0.7) / 1.4) * 0.11;
        v = 0.015 + clamp01((y - 1.2) / 2.0) * 0.07;
      } else if (mode === 'bore') {
        u = 0.66 + fractPos(x * 0.12) * 0.15;
        v = 0.015 + fractPos((y + z) * 0.25) * 0.07;
      } else if (mode === 'hood_right') {
        u = 0.05 + clamp01((x - -0.5) / 3.05) * 0.42;
        v = 0.56 + clamp01((y - 1.85) / 1.55) * 0.38;
      } else if (mode === 'hood_other') {
        u = 0.52 + clamp01((x - -0.55) / 3.15) * 0.43;
        v = 0.56 + clamp01((z + (y - 2.4) * 0.45 + 1.1) / 2.2) * 0.38;
      } else {
        let th = Math.atan2(z, y - 2.55);
        if (th - baseTheta > Math.PI) th -= Math.PI * 2;
        else if (th - baseTheta < -Math.PI) th += Math.PI * 2;
        u = 0.03 + clamp01((x - 2.52) / 8.66) * 0.94;
        v = Math.max(
          0.115,
          Math.min(0.485, 0.12 + (th / (Math.PI * 2) + 0.5) * 0.36)
        );
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Maps F-01 Polymer Frame & Embedded Metal Inserts onto the 1536x1536 frame_{albedo,normal,roughness}.png atlas:
 *  - Right polymer flank + Gen3 stipple + GEN3 medallion: u in [0.02, 0.98], v in [0.52, 0.98]
 *  - Left polymer flank + Gen3 stipple + G17 medallion:   u in [0.02, 0.98], v in [0.04, 0.50]
 *  - Front/back/inner pebble polymer surfaces:            u in [0.62, 0.96], v in [0.85, 0.96]
 *  - Under-rail engraved serial tag (KPV 892 US):         u in [0.62, 0.82], v in [0.005, 0.033]
 *  - 4 embedded stainless steel slide rails:              u in [0.88, 0.98], v in [0.005, 0.033]
 */
export function applyFrameAtlasUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = readTriInfo(pos, col, i, i + 1, i + 2);

    let mode: 'rail' | 'serial' | 'right' | 'left' | 'edge_poly' = 'edge_poly';
    if (cr > 0.7) {
      mode = 'rail';
    } else if (cr > 0.45) {
      mode = 'serial';
    } else if (fnz >= 0.24 && cz > 0.18) {
      mode = 'right';
    } else if (fnz <= -0.24 && cz < -0.18) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -8.7) / 19.9);
      const yNorm = clamp01((y - -9.45) / 10.6);

      let u: number;
      let v: number;
      if (mode === 'rail') {
        u = 0.88 + fractPos(x * 0.15) * 0.1;
        v = 0.006 + fractPos((y + z) * 0.35) * 0.025;
      } else if (mode === 'serial') {
        u = 0.62 + clamp01((x - 4.325) / 1.65) * 0.2;
        v = 0.005 + clamp01((z + 0.34) / 0.68) * 0.028;
      } else if (mode === 'right') {
        u = 0.02 + xNorm * 0.96;
        v = 0.52 + yNorm * 0.46;
      } else if (mode === 'left') {
        u = 0.02 + (1.0 - xNorm) * 0.96;
        v = 0.04 + yNorm * 0.46;
      } else {
        u = 0.62 + xNorm * 0.34;
        v = 0.85 + clamp01((z + 1.3) / 2.6) * 0.11;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Maps M-01 Magazine Body onto the 1024x1024 mag_{albedo,normal,roughness}.png atlas:
 *  - Rear spine with 4..17 round-count numbers: u in [0.06, 0.44], v in [0.15, 0.95]
 *  - Right polymer wall with G17 9x19 badge:   u in [0.52, 0.96], v in [0.15, 0.95]
 *  - Left/front polymer walls:                 u in [0.52, 0.96], v in [0.55, 0.95]
 *  - Stainless steel inner liner & feed lips:  u in [0.82, 0.98], v in [0.015, 0.10]
 */
export function applyMagAtlasUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx, cz, cr, fnx, fnz } = readTriInfo(pos, col, i, i + 1, i + 2);

    let mode: 'steel' | 'spine' | 'right' | 'other_poly' = 'other_poly';
    if (cr > 0.5) {
      mode = 'steel';
    } else if (fnx < -0.55 && cx < -0.95) {
      mode = 'spine';
    } else if (fnz > 0.45 && cz > 0.4) {
      mode = 'right';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const yNorm = clamp01((y + 4.8) / 10.5);

      let u: number;
      let v: number;
      if (mode === 'steel') {
        u = 0.82 + fractPos((x + z) * 0.25) * 0.16;
        v = 0.015 + fractPos(y * 0.15) * 0.085;
      } else if (mode === 'spine') {
        u = 0.06 + clamp01((z + 0.9) / 1.8) * 0.38;
        v = 0.15 + yNorm * 0.8;
      } else if (mode === 'right') {
        u = 0.52 + clamp01((x + 1.35) / 2.7) * 0.44;
        v = 0.15 + yNorm * 0.8;
      } else {
        u = 0.52 + clamp01((1.35 - x) / 2.7) * 0.44;
        v = 0.56 + yNorm * 0.38;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}
