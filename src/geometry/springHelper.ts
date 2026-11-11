import * as THREE from 'three';
import {
  mergeGeometries,
  toCreasedNormals,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';

const csgEvaluator = new Evaluator();
csgEvaluator.attributes = ['position', 'normal', 'uv', 'color'];

const tmpColor = new THREE.Color();

/**
 * Paints all vertices of a BufferGeometry with an sRGB hex color (stored in linear space for Three.js PBR).
 */
export function paintGeometry(
  geo: THREE.BufferGeometry,
  hexColor: string | number
): THREE.BufferGeometry {
  tmpColor.set(hexColor);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    colors[i3] = tmpColor.r;
    colors[i3 + 1] = tmpColor.g;
    colors[i3 + 2] = tmpColor.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Generates clean triplanar box-projected UVs (with U aligned along barrel X-axis on side & top faces)
 * so procedural brushed-metal and stippled-polymer bump maps never stretch across CSG faces.
 */
export function computeAutoBoxUVs(
  geo: THREE.BufferGeometry,
  scale = 0.35
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = norm ? Math.abs(norm.getX(i)) : 0;
    const ny = norm ? Math.abs(norm.getY(i)) : 0;
    const nz = norm ? Math.abs(norm.getZ(i)) : 1;

    let u: number;
    let v: number;
    if (nz >= nx && nz >= ny) {
      // Side walls: U runs along X (longitudinal barrel axis), V along Y
      u = x * scale;
      v = y * scale;
    } else if (ny >= nx) {
      // Top / bottom decks: U runs along X, V along Z
      u = x * scale;
      v = z * scale;
    } else {
      // Muzzle / breech faces: U along Z, V along Y
      u = z * scale;
      v = y * scale;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

function ensureAllAttributes(
  geo: THREE.BufferGeometry,
  defaultHex: string | number = '#ffffff'
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.attributes.normal) {
    g.computeVertexNormals();
  }
  const count = g.attributes.position.count;
  if (!g.attributes.uv) {
    g.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(count * 2), 2)
    );
  }
  if (!g.attributes.color) {
    paintGeometry(g, defaultHex);
  }

  const clean = new THREE.BufferGeometry();
  clean.setAttribute('position', g.attributes.position);
  clean.setAttribute('normal', g.attributes.normal);
  clean.setAttribute('uv', g.attributes.uv);
  clean.setAttribute('color', g.attributes.color);
  return clean;
}

/**
 * Smooths curved faces (< creaseRad) while preserving crisp CNC/molded edges, then computes box UVs & bounds.
 */
export function finalizeGeometry(
  geo: THREE.BufferGeometry,
  creaseRad = Math.PI / 5.2
): THREE.BufferGeometry {
  const creased = creaseRad > 0 ? toCreasedNormals(geo, creaseRad) : geo;
  computeAutoBoxUVs(creased, 0.36);
  creased.computeBoundingSphere();
  creased.computeBoundingBox();
  return creased;
}

/**
 * Safely normalizes attributes (position + normal + uv + color) and merges sub-part geometries.
 */
export function mergeParts(
  geometries: THREE.BufferGeometry[],
  creaseRad = Math.PI / 5.2
): THREE.BufferGeometry {
  const prepared = geometries.map((g) => ensureAllAttributes(g));
  const merged = mergeGeometries(prepared, false);
  return finalizeGeometry(merged, creaseRad);
}

/**
 * Performs boolean subtraction of one or more cutter geometries from a base geometry,
 * preserving per-part vertex colors and computing smooth creased normals.
 */
export function csgSubtract(
  baseGeo: THREE.BufferGeometry,
  cutters: THREE.BufferGeometry[],
  creaseRad = Math.PI / 5.2
): THREE.BufferGeometry {
  let current = new Brush(ensureAllAttributes(baseGeo));
  current.updateMatrixWorld();

  for (const cutterGeo of cutters) {
    const cutterBrush = new Brush(ensureAllAttributes(cutterGeo));
    cutterBrush.updateMatrixWorld();
    current = csgEvaluator.evaluate(current, cutterBrush, SUBTRACTION);
    current.updateMatrixWorld();
  }

  const out = current.geometry.index
    ? current.geometry.toNonIndexed()
    : current.geometry.clone();
  out.computeVertexNormals();
  return finalizeGeometry(out, creaseRad);
}

export function csgUnion(
  geometries: THREE.BufferGeometry[],
  creaseRad = Math.PI / 5.2
): THREE.BufferGeometry {
  let current = new Brush(ensureAllAttributes(geometries[0]));
  current.updateMatrixWorld();
  for (let i = 1; i < geometries.length; i++) {
    const next = new Brush(ensureAllAttributes(geometries[i]));
    next.updateMatrixWorld();
    current = csgEvaluator.evaluate(current, next, ADDITION);
    current.updateMatrixWorld();
  }
  const out = current.geometry.index
    ? current.geometry.toNonIndexed()
    : current.geometry.clone();
  out.computeVertexNormals();
  return finalizeGeometry(out, creaseRad);
}

export interface HelicalSpringOptions {
  /** Axis direction: 'x' or 'y' */
  axis?: 'x' | 'y';
  start: number;
  end: number;
  centerY?: number;
  centerZ?: number;
  centerX?: number;
  coilRadius: number;
  wireRadius: number;
  coils: number;
  radialSegments?: number;
  tubularSegmentsPerCoil?: number;
  /** Optional axial flattening (< 1) to model flat-wire recoil springs */
  flatWireRatio?: number;
}

/**
 * Generates a realistic 3D helical coil spring with closed end-turns.
 */
export function createHelicalSpring(
  opts: HelicalSpringOptions
): THREE.BufferGeometry {
  const {
    axis = 'x',
    start,
    end,
    centerX = 0,
    centerY = 0,
    centerZ = 0,
    coilRadius,
    wireRadius,
    coils,
    radialSegments = 10,
    tubularSegmentsPerCoil = 20,
    flatWireRatio = 1,
  } = opts;

  const points: THREE.Vector3[] = [];
  const totalSteps = Math.max(28, Math.round(coils * tubularSegmentsPerCoil));

  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const angle = u * coils * Math.PI * 2;
    // Closed end-coils at first & last half-turn for authentic spring seating
    let uMapped = u;
    if (u < 0.04) uMapped = u * 0.35;
    else if (u > 0.96) uMapped = 1 - (1 - u) * 0.35;
    else uMapped = 0.014 + ((u - 0.04) / 0.92) * 0.972;

    const axialPos = start + (end - start) * uMapped;
    const c1 = Math.cos(angle) * coilRadius;
    const c2 = Math.sin(angle) * coilRadius;

    if (axis === 'x') {
      points.push(new THREE.Vector3(axialPos, centerY + c1, centerZ + c2));
    } else {
      points.push(new THREE.Vector3(centerX + c1, axialPos, centerZ + c2));
    }
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(
    curve,
    totalSteps,
    wireRadius * (flatWireRatio < 1 ? flatWireRatio : 1),
    radialSegments,
    false
  );

  return ensureAllAttributes(tube);
}

/**
 * Generates a rounded-rectangular coil spring matching double-stack magazine geometry (along local Y).
 */
export function createRectangularMagSpring(opts: {
  height: number;
  widthX: number;
  depthZ: number;
  wireRadius: number;
  coils: number;
}): THREE.BufferGeometry {
  const { height, widthX, depthZ, wireRadius, coils } = opts;
  const points: THREE.Vector3[] = [];
  const stepsPerCoil = 28;
  const totalSteps = coils * stepsPerCoil;
  const halfH = height / 2;
  const rx = widthX / 2;
  const rz = depthZ / 2;

  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const theta = u * coils * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const sx = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.55) * rx;
    const sz = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.55) * rz;
    const y = -halfH + height * u;
    points.push(new THREE.Vector3(sx, y, sz));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(curve, totalSteps, wireRadius, 8, false);
  return ensureAllAttributes(tube);
}
