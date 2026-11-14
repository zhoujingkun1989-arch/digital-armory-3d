import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paintGeometry } from '../../../engine/geometry/csgBuilder';

/**
 * Shared CNC-detail primitives for the HK MP5 procedural meshes.
 * All helpers are additive (no CSG), axis-aligned to the bore (+X), and return
 * painted non-merged geometry that callers feed straight into `mergeParts`.
 */

/** Revolves an (r, x) profile around the +X bore axis (pass a closed loop for a solid wall). */
export function latheAlongX(
  profile: ReadonlyArray<readonly [number, number]>,
  segments: number,
  color: string
): THREE.BufferGeometry {
  const pts = profile.map(([r, x]) => new THREE.Vector2(r, x));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.rotateZ(-Math.PI / 2);
  return paintGeometry(geo, color);
}

/**
 * Extrudes a cross-section drawn in the (Z, Y) plane along +X from `x0` to `x0 + len`.
 * `chamfer` > 0 rounds every edge inward so the outline never grows past the drawn shape.
 */
export function extrudeAlongX(
  shape: THREE.Shape,
  x0: number,
  len: number,
  color: string,
  chamfer = 0,
  curveSegments = 8
): THREE.BufferGeometry {
  const c = Math.min(chamfer, len * 0.3);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: len - 2 * c,
    curveSegments,
    bevelEnabled: c > 0,
    bevelThickness: c,
    bevelSize: c,
    bevelOffset: -c,
    bevelSegments: 1,
  });
  // Shape-X -> world +Z, shape-Y -> world +Y, extrusion +Z -> world -X.
  geo.rotateY(-Math.PI / 2);
  geo.translate(x0 + len - c, 0, 0);
  return paintGeometry(geo, color);
}

/**
 * Annular-sector shape in the (Z, Y) plane; angles are measured around +X from +Y toward +Z.
 */
export function annularSectorShape(
  rIn: number,
  rOut: number,
  angCenter: number,
  angWidth: number,
  steps = 8
): THREE.Shape {
  const s = new THREE.Shape();
  const a0 = angCenter - angWidth / 2;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (angWidth * i) / steps;
    const p = [Math.sin(a) * rOut, Math.cos(a) * rOut] as const;
    if (i === 0) s.moveTo(p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + (angWidth * i) / steps;
    s.lineTo(Math.sin(a) * rIn, Math.cos(a) * rIn);
  }
  s.closePath();
  return s;
}

/** Radial locking lug / QD-mount lug: chamfered annular sector spanning X in [x0, x0 + len]. */
export function arcLug(
  rIn: number,
  rOut: number,
  angCenter: number,
  angWidth: number,
  x0: number,
  len: number,
  color: string,
  chamfer = 0.02
): THREE.BufferGeometry {
  return extrudeAlongX(
    annularSectorShape(rIn, rOut, angCenter, angWidth),
    x0,
    len,
    color,
    chamfer,
    4
  );
}

/**
 * Helical rifling lands standing proud of the bore wall (radius `boreR`) toward the axis by `depth`,
 * spanning X in [x0, x1] with a right-hand twist of one revolution per `twistCm` (negative = left-hand).
 */
export function twistedRiflingLands(opts: {
  count: number;
  boreR: number;
  depth: number;
  width: number;
  x0: number;
  x1: number;
  twistCm: number;
  color: string;
  segments?: number;
  phase?: number;
}): THREE.BufferGeometry {
  const { count, boreR, depth, width, x0, x1, twistCm, color } = opts;
  const len = x1 - x0;
  const segs =
    opts.segments ??
    Math.max(6, Math.ceil((Math.abs(len / twistCm) * 360) / 15));
  const embed = Math.min(0.01, depth * 0.5);
  const lands: THREE.BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const base = (opts.phase ?? 0) + (k * Math.PI * 2) / count;
    const box = new THREE.BoxGeometry(len, depth + embed, width, segs, 1, 1);
    box.translate((x0 + x1) / 2, boreR - depth / 2 + embed / 2, 0);
    const pos = box.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = base + ((x - x0) / twistCm) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      pos.setXYZ(i, x, y * ca - z * sa, y * sa + z * ca);
    }
    box.computeVertexNormals();
    lands.push(box.toNonIndexed());
    box.dispose();
  }
  const merged = mergeGeometries(lands, false);
  for (const l of lands) l.dispose();
  return paintGeometry(merged, color);
}

/**
 * Straight or helical surface ridges around a cylinder of radius `r` (knurling / axial serrations).
 * Use two calls with opposite `twistCm` signs for a diamond knurl.
 */
export function surfaceRidges(opts: {
  count: number;
  r: number;
  height: number;
  width: number;
  x0: number;
  x1: number;
  color: string;
  twistCm?: number;
  segments?: number;
  phase?: number;
}): THREE.BufferGeometry {
  return twistedRiflingLands({
    count: opts.count,
    boreR: opts.r + opts.height,
    depth: opts.height,
    width: opts.width,
    x0: opts.x0,
    x1: opts.x1,
    twistCm: opts.twistCm ?? 1e9,
    color: opts.color,
    segments: opts.segments ?? (opts.twistCm ? 6 : 1),
    phase: opts.phase,
  });
}

/** Merges a list of non-overlapping cutter solids into ONE brush so csgSubtract runs a single pass. */
export function mergeCutters(
  cutters: THREE.BufferGeometry[],
  color: string
): THREE.BufferGeometry {
  const prepared = cutters.map((c) => {
    const g = c.index ? c.toNonIndexed() : c;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', g.getAttribute('position'));
    clean.setAttribute('normal', g.getAttribute('normal'));
    const uv = g.getAttribute('uv');
    clean.setAttribute(
      'uv',
      uv ?? new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2)
    );
    return clean;
  });
  const merged = mergeGeometries(prepared, false);
  return paintGeometry(merged, color);
}

/**
 * Row of overlapping squashed-ellipsoid TIG weld ripples ("stack of dimes") between two 3D points.
 */
export function tigWeldSeam(
  p0: readonly [number, number, number],
  p1: readonly [number, number, number],
  radius: number,
  ripples: number,
  color: string
): THREE.BufferGeometry {
  const dir = new THREE.Vector3(
    p1[0] - p0[0],
    p1[1] - p0[1],
    p1[2] - p0[2]
  );
  const len = dir.length() || 1;
  dir.divideScalar(len);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    dir
  );
  const beads: THREE.BufferGeometry[] = [];
  const count = Math.max(2, ripples);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const bead = new THREE.SphereGeometry(radius, 8, 6);
    bead.scale(0.68, 1, 1);
    bead.applyQuaternion(quat);
    bead.translate(
      p0[0] + (p1[0] - p0[0]) * t,
      p0[1] + (p1[1] - p0[1]) * t,
      p0[2] + (p1[2] - p0[2]) * t
    );
    beads.push(bead.toNonIndexed());
    bead.dispose();
  }
  const merged = mergeGeometries(beads, false);
  for (const b of beads) b.dispose();
  return paintGeometry(merged, color);
}

