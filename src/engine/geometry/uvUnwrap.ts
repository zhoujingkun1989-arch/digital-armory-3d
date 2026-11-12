import * as THREE from 'three';

export function clampUv01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function fractPos(v: number): number {
  return v - Math.floor(v);
}

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const fNorm = new THREE.Vector3();

export interface TriangleSampleInfo {
  cx: number;
  cy: number;
  cz: number;
  cr: number;
  cg: number;
  cb: number;
  fnx: number;
  fny: number;
  fnz: number;
}

/**
 * Shared zero-allocation triangle centroid, vertex-color & face-normal sampler
 * used across all 10 weapon UV-atlas unwrap pipelines.
 */
export function sampleTriangleInfo(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  col: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  i0: number,
  i1: number,
  i2: number
): TriangleSampleInfo {
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
