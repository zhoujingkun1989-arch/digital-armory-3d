import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Precision CAD helpers for the Accuracy International AWM (.338 Lapua Magnum) mesh set.
 * Kept weapon-local so lazy-loaded weapon geometry chunks never cross-import.
 */

function toPlainSoup(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.normal) n.computeVertexNormals();
  const count = n.attributes.position.count;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', n.attributes.position);
  out.setAttribute('normal', n.attributes.normal);
  out.setAttribute(
    'uv',
    n.attributes.uv ??
      new THREE.BufferAttribute(new Float32Array(count * 2), 2)
  );
  out.setAttribute(
    'color',
    n.attributes.color ??
      new THREE.BufferAttribute(new Float32Array(count * 3).fill(0.2), 3)
  );
  return out;
}

/** Merges mutually disjoint cutter solids into ONE CSG brush (replaces N sequential CSG passes). */
export function mergeAwmCutters(
  geometries: THREE.BufferGeometry[]
): THREE.BufferGeometry {
  const prepared = geometries.map(toPlainSoup);
  const merged = mergeGeometries(prepared, false);
  for (const g of geometries) g.dispose();
  return merged;
}

export interface AwmHelicalLandOptions {
  count: number;
  boreRadius: number;
  height: number;
  halfAngle: number;
  x0: number;
  x1: number;
  twist: number;
  segments: number;
  phase?: number;
}

/**
 * Builds raised helical rifling lands along +X inside a bore of radius `boreRadius`,
 * with guaranteed outward-facing normals on every quad and end-cap.
 */
export function buildAwmHelicalLands(
  opts: AwmHelicalLandOptions
): THREE.BufferGeometry {
  const { count, boreRadius, height, halfAngle, x0, x1, twist, segments } =
    opts;
  const phase = opts.phase ?? 0;
  const rIn = boreRadius - height;
  const rOut = boreRadius + 0.005;
  const positions: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  const ctr = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const fn = new THREE.Vector3();
  const mid = new THREE.Vector3();

  const pt = (out: THREE.Vector3, r: number, ang: number, x: number) =>
    out.set(x, Math.cos(ang) * r, Math.sin(ang) * r);

  const pushQuad = (
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    centre: THREE.Vector3
  ) => {
    e1.subVectors(p1, p0);
    e2.subVectors(p2, p0);
    fn.crossVectors(e1, e2);
    mid.copy(p0).add(p1).add(p2).add(p3).multiplyScalar(0.25).sub(centre);
    const flip = fn.dot(mid) < 0;
    const quad = flip ? [p0, p3, p2, p1] : [p0, p1, p2, p3];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      positions.push(quad[idx].x, quad[idx].y, quad[idx].z);
    }
  };

  const rMid = (rIn + rOut) * 0.5;
  for (let l = 0; l < count; l++) {
    const base = phase + (l * Math.PI * 2) / count;
    for (let s = 0; s < segments; s++) {
      const xa = x0 + ((x1 - x0) * s) / segments;
      const xb = x0 + ((x1 - x0) * (s + 1)) / segments;
      const angA = base + twist * (xa - x0);
      const angB = base + twist * (xb - x0);
      pt(ctr, rMid, (angA + angB) * 0.5, (xa + xb) * 0.5);
      pushQuad(
        pt(a, rIn, angA - halfAngle, xa),
        pt(b, rIn, angA + halfAngle, xa),
        pt(c, rIn, angB + halfAngle, xb),
        pt(d, rIn, angB - halfAngle, xb),
        ctr
      );
      pushQuad(
        pt(a, rIn, angA + halfAngle, xa),
        pt(b, rOut, angA + halfAngle, xa),
        pt(c, rOut, angB + halfAngle, xb),
        pt(d, rIn, angB + halfAngle, xb),
        ctr
      );
      pushQuad(
        pt(a, rIn, angA - halfAngle, xa),
        pt(b, rOut, angA - halfAngle, xa),
        pt(c, rOut, angB - halfAngle, xb),
        pt(d, rIn, angB - halfAngle, xb),
        ctr
      );
    }
    for (const [xe, sign] of [
      [x0, -1],
      [x1, 1],
    ] as const) {
      const ang = base + twist * (xe - x0);
      pt(ctr, rMid, ang, xe - sign * 0.05);
      pushQuad(
        pt(a, rIn, ang - halfAngle, xe),
        pt(b, rIn, ang + halfAngle, xe),
        pt(c, rOut, ang + halfAngle, xe),
        pt(d, rOut, ang - halfAngle, xe),
        ctr
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  );
  geo.computeVertexNormals();
  geo.setAttribute(
    'uv',
    new THREE.BufferAttribute(new Float32Array((positions.length / 3) * 2), 2)
  );
  return geo;
}
