import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Precision CAD helpers for the Barrett M82A1 mesh set.
 *
 * - `mergeCutters` fuses MUTUALLY NON-OVERLAPPING cutter solids into ONE brush so a single
 *   CSG evaluation replaces N sequential `csgSubtract` passes (overlapping cutters must be
 *   split across separate merged groups — overlapping shells break inside/outside parity).
 * - `buildHelicalLands` sweeps raised rifling lands helically along the bore (1 world unit = 1 cm).
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

/** Merges disjoint cutter solids into one CSG brush geometry (non-indexed, pos/normal/uv/color). */
export function mergeCutters(
  geometries: THREE.BufferGeometry[]
): THREE.BufferGeometry {
  const prepared = geometries.map(toPlainSoup);
  const merged = mergeGeometries(prepared, false);
  for (const g of geometries) g.dispose();
  return merged;
}

/** Clones a template geometry at several X offsets and merges the copies (additive detail). */
export function arrayAlongX(
  template: THREE.BufferGeometry,
  xs: number[]
): THREE.BufferGeometry {
  const soup = toPlainSoup(template);
  const copies = xs.map((x) => soup.clone().translate(x, 0, 0));
  const merged = mergeGeometries(copies, false);
  for (const c of copies) c.dispose();
  soup.dispose();
  template.dispose();
  return merged;
}

export interface HelicalLandOptions {
  /** Number of lands around the bore. */
  count: number;
  /** Bore (groove) radius — land roots are embedded slightly into the bore wall. */
  boreRadius: number;
  /** Radial land height protruding into the bore. */
  height: number;
  /** Angular half-width of each land (radians). */
  halfAngle: number;
  x0: number;
  x1: number;
  /** Twist rate (radians per world unit / cm) — right-hand twist when positive. */
  twist: number;
  /** Longitudinal sweep segments per land. */
  segments: number;
  phase?: number;
}

/**
 * Builds raised rifling lands swept helically along +X inside a bore of radius `boreRadius`.
 * Every quad is wound outward from the land's local centre-line so normals face out.
 */
export function buildHelicalLands(
  opts: HelicalLandOptions
): THREE.BufferGeometry {
  const { count, boreRadius, height, halfAngle, x0, x1, twist, segments } =
    opts;
  const phase = opts.phase ?? 0;
  const rIn = boreRadius - height;
  const rOut = boreRadius + 0.006;
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
      // Inner crest
      pushQuad(
        pt(a, rIn, angA - halfAngle, xa),
        pt(b, rIn, angA + halfAngle, xa),
        pt(c, rIn, angB + halfAngle, xb),
        pt(d, rIn, angB - halfAngle, xb),
        ctr
      );
      // Leading flank
      pushQuad(
        pt(a, rIn, angA + halfAngle, xa),
        pt(b, rOut, angA + halfAngle, xa),
        pt(c, rOut, angB + halfAngle, xb),
        pt(d, rIn, angB + halfAngle, xb),
        ctr
      );
      // Trailing flank
      pushQuad(
        pt(a, rIn, angA - halfAngle, xa),
        pt(b, rOut, angA - halfAngle, xa),
        pt(c, rOut, angB - halfAngle, xb),
        pt(d, rIn, angB - halfAngle, xb),
        ctr
      );
    }
    // End caps
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

/**
 * MIL-STD-1913 Picatinny cross-section in the (Z, Y) plane with 45° dovetail flanks,
 * extruded along +X over [xStart, xStart + length].
 */
export function buildDovetailBar(opts: {
  xStart: number;
  length: number;
  yBottom: number;
  yTop: number;
  halfWidthBottom: number;
  halfWidthMax: number;
  topChamfer: number;
}): THREE.BufferGeometry {
  const { xStart, length, yBottom, yTop, halfWidthBottom, halfWidthMax } =
    opts;
  const flare = halfWidthMax - halfWidthBottom;
  const yFlare = Math.min(yBottom + flare, yTop - opts.topChamfer);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidthBottom, yBottom);
  shape.lineTo(halfWidthBottom, yBottom);
  shape.lineTo(halfWidthMax, yFlare);
  shape.lineTo(halfWidthMax, yTop - opts.topChamfer);
  shape.lineTo(halfWidthMax - opts.topChamfer, yTop);
  shape.lineTo(-halfWidthMax + opts.topChamfer, yTop);
  shape.lineTo(-halfWidthMax, yTop - opts.topChamfer);
  shape.lineTo(-halfWidthMax, yFlare);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
  });
  // Shape X -> world -Z, extrude +Z -> world +X
  geo.rotateY(Math.PI / 2);
  geo.translate(xStart, 0, 0);
  return geo;
}

/**
 * Clean 2D oblong stadium punch extruded along Z across [-halfSpanZ, +halfSpanZ]
 * (replaces Z-stretched 3D CapsuleGeometry cutters with 5x fewer triangles and crisp punch-press walls).
 */
export function buildStadiumPunchZ(
  halfFlatX: number,
  radiusY: number,
  halfSpanZ: number,
  arcSegs = 8
): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.absarc(halfFlatX, 0, radiusY, -Math.PI / 2, Math.PI / 2, false);
  s.absarc(-halfFlatX, 0, radiusY, Math.PI / 2, (Math.PI * 3) / 2, false);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: halfSpanZ * 2,
    bevelEnabled: false,
    curveSegments: arcSegs,
  });
  g.translate(0, 0, -halfSpanZ);
  return g;
}
