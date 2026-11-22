import * as THREE from 'three';
import {
  mergeGeometries,
  toCreasedNormals,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ADDITION, Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import {
  attachCurvatureAttribute,
  CURVATURE_ATTRIBUTE,
  SPRING_PARAM_ATTRIBUTE,
} from './curvatureBuilder';

export { CURVATURE_ATTRIBUTE, SPRING_PARAM_ATTRIBUTE };

const BASE_CSG_ATTRIBUTES = ['position', 'normal', 'uv', 'color'];

const csgEvaluator = new Evaluator();
csgEvaluator.attributes = BASE_CSG_ATTRIBUTES;

/** Dedicated evaluator that also interpolates `aSpringParam` through boolean cuts. */
const springCsgEvaluator = new Evaluator();
springCsgEvaluator.attributes = [
  ...BASE_CSG_ATTRIBUTES,
  SPRING_PARAM_ATTRIBUTE,
];

const tmpColor = new THREE.Color();

/** Spring axis mode flags stored in `aSpringParam.w`. */
export const SPRING_AXIS_MODE_NONE = 0;
export const SPRING_AXIS_MODE_X = 1;
export const SPRING_AXIS_MODE_Y = 2;
export const SPRING_AXIS_MODE_FLEX = 3;

interface CapturedSpringChunk {
  pos: Float32Array;
  spring: Float32Array;
}

let capturingSprings = false;
const capturedSpringChunks: CapturedSpringChunk[] = [];

/**
 * Starts capturing spring coil vertex tables during a synchronous weapon-part `buildFn()` call so
 * `finishPartSpringCapture` can restore `aSpringParam` if a weapon's `sanitize*Mesh` helper strips
 * custom attributes when reconstructing a fresh `BufferGeometry`.
 */
export function beginPartSpringCapture(): void {
  capturedSpringChunks.length = 0;
  capturingSprings = true;
}

/**
 * Validates that `aSpringParam` on `geo` remains aligned with `position` (handling post-build axial
 * `.translate(...)` or `-90°` Z-rotation, and zeroing non-axial rotated torsion springs).
 */
export function validateSpringParamAlignment(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  if (!hasSpringParam(geo)) return geo;
  const pos = geo.getAttribute('position');
  const sp = geo.getAttribute(SPRING_PARAM_ATTRIBUTE) as THREE.BufferAttribute;
  const arr = sp.array as Float32Array;
  const count = pos.count;

  let minDx1 = Infinity;
  let maxDx1 = -Infinity;
  let n1 = 0;
  let minDy2 = Infinity;
  let maxDy2 = -Infinity;
  let minRotX2 = Infinity;
  let maxRotX2 = -Infinity;
  let n2 = 0;

  for (let i = 0; i < count; i++) {
    const w = arr[i * 4 + 3];
    const c = arr[i * 4 + 1];
    if (w > 0.5 && w < 1.5) {
      const dx = pos.getX(i) - c;
      if (dx < minDx1) minDx1 = dx;
      if (dx > maxDx1) maxDx1 = dx;
      n1++;
    } else if (w >= 1.5 && w < 2.5) {
      const dy = pos.getY(i) - c;
      if (dy < minDy2) minDy2 = dy;
      if (dy > maxDy2) maxDy2 = dy;
      const rx = pos.getX(i) - c;
      if (rx < minRotX2) minRotX2 = rx;
      if (rx > maxRotX2) maxRotX2 = rx;
      n2++;
    }
  }

  // Accommodates both small-arms coil wire (<= 0.35 cm) and 1:1 Main Battle Tank
  // forged cannon recuperator / breech springs (wireRadius ~ 0.9–1.8 cm).
  const MAX_WIRE_HALF_SPAN = 2.5;
  const xValid = n1 > 0 && (maxDx1 - minDx1) * 0.5 <= MAX_WIRE_HALF_SPAN;
  const xShift = xValid ? (maxDx1 + minDx1) * 0.5 : 0;
  const yValid = n2 > 0 && (maxDy2 - minDy2) * 0.5 <= MAX_WIRE_HALF_SPAN;
  const yShift = yValid ? (maxDy2 + minDy2) * 0.5 : 0;
  const yRotatedToX =
    !yValid && n2 > 0 && (maxRotX2 - minRotX2) * 0.5 <= MAX_WIRE_HALF_SPAN;
  const yRotShift = yRotatedToX ? (maxRotX2 + minRotX2) * 0.5 : 0;

  let anyActive = false;
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const w = arr[o + 3];
    if (w > 0.5 && w < 1.5) {
      if (xValid) {
        if (Math.abs(xShift) > 1e-4) {
          arr[o + 1] += xShift;
          arr[o + 2] += xShift;
        }
        anyActive = true;
      } else {
        arr[o] = 0;
        arr[o + 1] = 0;
        arr[o + 2] = 0;
        arr[o + 3] = 0;
      }
    } else if (w >= 1.5 && w < 2.5) {
      if (yValid) {
        if (Math.abs(yShift) > 1e-4) {
          arr[o + 1] += yShift;
          arr[o + 2] += yShift;
        }
        anyActive = true;
      } else if (yRotatedToX) {
        arr[o + 1] += yRotShift;
        arr[o + 2] += yRotShift;
        arr[o + 3] = SPRING_AXIS_MODE_X;
        anyActive = true;
      } else {
        arr[o] = 0;
        arr[o + 1] = 0;
        arr[o + 2] = 0;
        arr[o + 3] = 0;
      }
    } else if (w >= 2.5) {
      // Parametric flex displacement vector (dx, dy, dz, 3) for bow limbs/strings/cables
      anyActive = true;
    }
  }

  if (!anyActive) {
    geo.deleteAttribute(SPRING_PARAM_ATTRIBUTE);
  } else {
    sp.needsUpdate = true;
  }
  return geo;
}

/**
 * Ends spring capture for the current `buildFn()` call, recovering `aSpringParam` onto `geo` via
 * quantized spatial matching if a weapon sanitizer stripped it, and draining capture buffers.
 */
export function finishPartSpringCapture(
  geo: THREE.BufferGeometry | null
): void {
  capturingSprings = false;
  if (capturedSpringChunks.length === 0) {
    if (geo) validateSpringParamAlignment(geo);
    return;
  }
  const chunks = capturedSpringChunks.splice(0, capturedSpringChunks.length);
  if (!geo) return;
  if (hasSpringParam(geo)) {
    validateSpringParamAlignment(geo);
    return;
  }
  const posAttr = geo.getAttribute('position');
  if (!posAttr || posAttr.count === 0) return;

  let totalCaptured = 0;
  for (let c = 0; c < chunks.length; c++) {
    totalCaptured += (chunks[c].pos.length / 3) | 0;
  }
  if (totalCaptured === 0) return;

  let cap = 16;
  while (cap < totalCaptured * 2) cap <<= 1;
  const mask = cap - 1;
  const keys = new Int32Array(cap * 3);
  const used = new Uint8Array(cap);
  const vals = new Float32Array(cap * 4);
  const inv = 1e4;

  for (let c = 0; c < chunks.length; c++) {
    const p = chunks[c].pos;
    const s = chunks[c].spring;
    const n = (p.length / 3) | 0;
    for (let i = 0; i < n; i++) {
      if (s[i * 4 + 3] <= 0) continue;
      const qx = Math.round(p[i * 3] * inv) | 0;
      const qy = Math.round(p[i * 3 + 1] * inv) | 0;
      const qz = Math.round(p[i * 3 + 2] * inv) | 0;
      let h =
        (Math.imul(qx, 73856093) ^
          Math.imul(qy, 19349663) ^
          Math.imul(qz, 83492791)) &
        mask;
      for (;;) {
        if (used[h] === 0) {
          used[h] = 1;
          keys[h * 3] = qx;
          keys[h * 3 + 1] = qy;
          keys[h * 3 + 2] = qz;
          vals[h * 4] = s[i * 4];
          vals[h * 4 + 1] = s[i * 4 + 1];
          vals[h * 4 + 2] = s[i * 4 + 2];
          vals[h * 4 + 3] = s[i * 4 + 3];
          break;
        }
        if (
          keys[h * 3] === qx &&
          keys[h * 3 + 1] === qy &&
          keys[h * 3 + 2] === qz
        ) {
          break;
        }
        h = (h + 1) & mask;
      }
    }
  }

  const count = posAttr.count;
  const recovered = new Float32Array(count * 4);
  let matched = 0;
  for (let v = 0; v < count; v++) {
    const qx = Math.round(posAttr.getX(v) * inv) | 0;
    const qy = Math.round(posAttr.getY(v) * inv) | 0;
    const qz = Math.round(posAttr.getZ(v) * inv) | 0;
    let h =
      (Math.imul(qx, 73856093) ^
        Math.imul(qy, 19349663) ^
        Math.imul(qz, 83492791)) &
      mask;
    for (;;) {
      if (used[h] === 0) break;
      if (
        keys[h * 3] === qx &&
        keys[h * 3 + 1] === qy &&
        keys[h * 3 + 2] === qz
      ) {
        const o = v * 4;
        recovered[o] = vals[h * 4];
        recovered[o + 1] = vals[h * 4 + 1];
        recovered[o + 2] = vals[h * 4 + 2];
        recovered[o + 3] = vals[h * 4 + 3];
        matched++;
        break;
      }
      h = (h + 1) & mask;
    }
  }

  if (matched > 0) {
    geo.setAttribute(
      SPRING_PARAM_ATTRIBUTE,
      new THREE.BufferAttribute(recovered, 4)
    );
    validateSpringParamAlignment(geo);
  }
}

function recordSpringChunkIfCapturing(geo: THREE.BufferGeometry): void {
  if (!capturingSprings) return;
  const pos = geo.getAttribute('position');
  const sp = geo.getAttribute(SPRING_PARAM_ATTRIBUTE);
  if (!pos || !sp) return;
  capturedSpringChunks.push({
    pos: new Float32Array(pos.array as ArrayLike<number>),
    spring: new Float32Array(sp.array as ArrayLike<number>),
  });
}

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
 * Generates triplanar box-projected UVs (with U aligned along barrel X-axis on side & top faces)
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
      u = x * scale;
      v = y * scale;
    } else if (ny >= nx) {
      u = x * scale;
      v = z * scale;
    } else {
      u = z * scale;
      v = y * scale;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/** True when `geo` carries a valid itemSize-4 `aSpringParam` channel. */
export function hasSpringParam(geo: THREE.BufferGeometry): boolean {
  const attr = geo.getAttribute(SPRING_PARAM_ATTRIBUTE);
  return (
    !!attr &&
    attr.itemSize === 4 &&
    attr.count === geo.attributes.position?.count
  );
}

/**
 * Normalizes a geometry into a non-indexed `position + normal + uv + color` soup (plus `aSpringParam`
 * when `withSpring` is set, zero-filled `[0,0,0,0]` for non-spring sub-parts). `aCurvature` is dropped
 * on purpose: it is a derived channel recomputed by `finalizeGeometry` after every merge / boolean.
 */
function ensureAllAttributes(
  geo: THREE.BufferGeometry,
  defaultHex: string | number = '#ffffff',
  withSpring = false
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
  if (withSpring) {
    clean.setAttribute(
      SPRING_PARAM_ATTRIBUTE,
      hasSpringParam(g)
        ? g.getAttribute(SPRING_PARAM_ATTRIBUTE)
        : new THREE.BufferAttribute(new Float32Array(count * 4), 4)
    );
  }
  return clean;
}

/**
 * Smooths curved faces (< creaseRad) while preserving crisp CNC/molded edges, then computes box UVs,
 * the signed CNC `aCurvature` edge-wear / cavity channel & bounds.
 */
export function finalizeGeometry(
  geo: THREE.BufferGeometry,
  creaseRad = Math.PI / 5.2
): THREE.BufferGeometry {
  const creased = creaseRad > 0 ? toCreasedNormals(geo, creaseRad) : geo;
  if (creased !== geo) {
    geo.dispose();
  }
  computeAutoBoxUVs(creased, 0.36);
  attachCurvatureAttribute(creased);
  creased.computeBoundingSphere();
  creased.computeBoundingBox();
  return creased;
}

/**
 * Normalizes attributes (position + normal + uv + color [+ aSpringParam]), merges sub-parts, and disposes intermediates.
 */
export function mergeParts(
  geometries: THREE.BufferGeometry[],
  creaseRad = Math.PI / 5.2
): THREE.BufferGeometry {
  const withSpring = geometries.some(hasSpringParam);
  const prepared = geometries.map((g) =>
    ensureAllAttributes(g, '#ffffff', withSpring)
  );
  const merged = mergeGeometries(prepared, false);
  for (let i = 0; i < prepared.length; i++) {
    prepared[i].dispose();
  }
  return finalizeGeometry(merged, creaseRad);
}

/**
 * Performs boolean subtraction of cutter geometries from baseGeo and disposes intermediate CSG brushes.
 * `aSpringParam` on the base solid is interpolated through the cut (cutters are zero-padded).
 */
export function csgSubtract(
  baseGeo: THREE.BufferGeometry,
  cutters: THREE.BufferGeometry[],
  creaseRad = Math.PI / 5.2
): THREE.BufferGeometry {
  const withSpring = hasSpringParam(baseGeo);
  const evaluator = withSpring ? springCsgEvaluator : csgEvaluator;
  let current = new Brush(ensureAllAttributes(baseGeo, '#ffffff', withSpring));
  current.updateMatrixWorld();

  for (let i = 0; i < cutters.length; i++) {
    const cutterBrush = new Brush(
      ensureAllAttributes(cutters[i], '#ffffff', withSpring)
    );
    cutterBrush.updateMatrixWorld();
    const next = evaluator.evaluate(current, cutterBrush, SUBTRACTION);
    current.geometry.dispose();
    cutterBrush.geometry.dispose();
    current = next;
    current.updateMatrixWorld();
  }

  const out = current.geometry.index
    ? current.geometry.toNonIndexed()
    : current.geometry.clone();
  current.geometry.dispose();
  out.computeVertexNormals();
  return finalizeGeometry(out, creaseRad);
}

export function csgUnion(
  geometries: THREE.BufferGeometry[],
  creaseRad = Math.PI / 5.2
): THREE.BufferGeometry {
  const withSpring = geometries.some(hasSpringParam);
  const evaluator = withSpring ? springCsgEvaluator : csgEvaluator;
  let current = new Brush(
    ensureAllAttributes(geometries[0], '#ffffff', withSpring)
  );
  current.updateMatrixWorld();
  for (let i = 1; i < geometries.length; i++) {
    const nextBrush = new Brush(
      ensureAllAttributes(geometries[i], '#ffffff', withSpring)
    );
    nextBrush.updateMatrixWorld();
    const evaluated = evaluator.evaluate(current, nextBrush, ADDITION);
    current.geometry.dispose();
    nextBrush.geometry.dispose();
    current = evaluated;
    current.updateMatrixWorld();
  }
  const out = current.geometry.index
    ? current.geometry.toNonIndexed()
    : current.geometry.clone();
  current.geometry.dispose();
  out.computeVertexNormals();
  return finalizeGeometry(out, creaseRad);
}

export interface HelicalSpringOptions {
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
  /** Alias for `tubularSegmentsPerCoil` accepted by procedural weapon spring builders */
  stepsPerCoil?: number;
  flatWireRatio?: number;
}

/**
 * Writes `aSpringParam = [u01, coilCenterAxialCoord, anchorCoord, axisMode]` for every vertex of an
 * (indexed, pre-`toNonIndexed`) `TubeGeometry`. Each ring `i` is centred exactly on
 * `curve.getPointAt(i / tubularSegments)` (TubeGeometry's own sampling), so `pos[axis] - center`
 * is the exact wire cross-section offset and survives GPU compression undistorted.
 */
function attachTubeSpringParams(
  tube: THREE.TubeGeometry,
  curve: THREE.Curve<THREE.Vector3>,
  tubularSegments: number,
  radialSegments: number,
  axis: 'x' | 'y',
  anchor: number,
  mode: number
): void {
  const count = tube.attributes.position.count;
  const ringStride = radialSegments + 1;
  const arr = new Float32Array(count * 4);
  const p = new THREE.Vector3();
  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    curve.getPointAt(u, p);
    const center = axis === 'x' ? p.x : p.y;
    for (let j = 0; j < ringStride; j++) {
      const o = (i * ringStride + j) * 4;
      if (o + 3 >= arr.length) break;
      arr[o] = u;
      arr[o + 1] = center;
      arr[o + 2] = anchor;
      arr[o + 3] = mode;
    }
  }
  tube.setAttribute(SPRING_PARAM_ATTRIBUTE, new THREE.BufferAttribute(arr, 4));
}

/** Attaches an all-zero `aCurvature` channel (round spring wire carries no CNC edge wear). */
function attachZeroCurvature(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.setAttribute(
    CURVATURE_ATTRIBUTE,
    new THREE.BufferAttribute(
      new Float32Array(geo.attributes.position.count),
      1
    )
  );
  return geo;
}

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
    tubularSegmentsPerCoil,
    stepsPerCoil,
    flatWireRatio = 1,
  } = opts;

  const points: THREE.Vector3[] = [];
  const segsPerCoil = tubularSegmentsPerCoil ?? stepsPerCoil ?? 20;
  const totalSteps = Math.max(28, Math.round(coils * segsPerCoil));

  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const angle = u * coils * Math.PI * 2;
    let uMapped: number;
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
  attachTubeSpringParams(
    tube,
    curve,
    totalSteps,
    radialSegments,
    axis,
    start,
    axis === 'x' ? SPRING_AXIS_MODE_X : SPRING_AXIS_MODE_Y
  );
  const res = ensureAllAttributes(tube, '#ffffff', true);
  tube.dispose();
  attachZeroCurvature(res);
  recordSpringChunkIfCapturing(res);
  res.computeBoundingBox();
  res.computeBoundingSphere();
  return res;
}

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
  const radialSegments = 8;

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
  const tube = new THREE.TubeGeometry(
    curve,
    totalSteps,
    wireRadius,
    radialSegments,
    false
  );
  attachTubeSpringParams(
    tube,
    curve,
    totalSteps,
    radialSegments,
    'y',
    -halfH,
    SPRING_AXIS_MODE_Y
  );
  const res = ensureAllAttributes(tube, '#ffffff', true);
  tube.dispose();
  attachZeroCurvature(res);
  recordSpringChunkIfCapturing(res);
  res.computeBoundingBox();
  res.computeBoundingSphere();
  return res;
}

// ---------------------------------------------------------------------------------------------
// Precision CNC CAD primitives
// ---------------------------------------------------------------------------------------------

/** Accumulates a non-indexed triangle soup and emits a flat-shaded BufferGeometry. */
class TriangleSoup {
  private readonly data: number[] = [];

  pushTri(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number
  ): void {
    // Skip zero-area (degenerate) triangles so normals stay finite & unit-length
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    if (nx * nx + ny * ny + nz * nz < 1e-20) return;
    this.data.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  }

  /** Emits a planar convex polygon (any vertex order) wound CCW around `outwardHint`. */
  pushConvexPolygon(pts: THREE.Vector3[], outwardHint: THREE.Vector3): void {
    const c = new THREE.Vector3();
    for (const p of pts) c.add(p);
    c.multiplyScalar(1 / pts.length);
    const n = outwardHint.clone().normalize();
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.x) > 0.9) u.set(0, 1, 0);
    u.sub(n.clone().multiplyScalar(u.dot(n))).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const d = new THREE.Vector3();
    const sorted = pts
      .map((p) => {
        d.subVectors(p, c);
        return { p, a: Math.atan2(d.dot(v), d.dot(u)) };
      })
      .sort((l, r) => l.a - r.a)
      .map((e) => e.p);
    const p0 = sorted[0];
    for (let i = 1; i + 1 < sorted.length; i++) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];
      this.pushTri(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }

  toGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(this.data), 3)
    );
    geo.computeVertexNormals();
    return geo;
  }
}

/**
 * Builds a closed solid of revolution around +Y from an (r, y) profile running from the bottom axis
 * point outward, up the wall and back to the top axis point. Shared ring vertices use identical
 * trig samples so the solid is perfectly watertight; zero-area pole triangles are skipped.
 */
function buildRevolvedProfile(
  profile: ReadonlyArray<readonly [number, number]>,
  radialSegments: number
): THREE.BufferGeometry {
  const soup = new TriangleSoup();
  const seg = Math.max(3, Math.floor(radialSegments));
  const cosA = new Float64Array(seg + 1);
  const sinA = new Float64Array(seg + 1);
  for (let s = 0; s <= seg; s++) {
    const k = s % seg;
    const a = (k / seg) * Math.PI * 2;
    cosA[s] = Math.cos(a);
    sinA[s] = Math.sin(a);
  }
  for (let k = 0; k + 1 < profile.length; k++) {
    const [r0, y0] = profile[k];
    const [r1, y1] = profile[k + 1];
    for (let s = 0; s < seg; s++) {
      const ax = r0 * cosA[s];
      const az = r0 * sinA[s];
      const bx = r0 * cosA[s + 1];
      const bz = r0 * sinA[s + 1];
      const cx = r1 * cosA[s + 1];
      const cz = r1 * sinA[s + 1];
      const dx = r1 * cosA[s];
      const dz = r1 * sinA[s];
      // (A, C, B) + (A, D, C) winds outward for a CCW (r right, y up) profile
      soup.pushTri(ax, y0, az, cx, y1, cz, bx, y0, bz);
      soup.pushTri(ax, y0, az, dx, y1, dz, cx, y1, cz);
    }
  }
  return soup.toGeometry();
}

/**
 * 12-edge 45° CNC-chamfered solid billet block centred at the origin (no razor-sharp 90° box corners).
 * Topology: 6 inset faces + 12 chamfer strips + 8 corner triangles, perfectly watertight.
 */
export function createChamferedBox(
  width: number,
  height: number,
  depth: number,
  chamfer = 0.04,
  hexColor?: string | number
): THREE.BufferGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;
  const c = Math.min(Math.max(chamfer, 0), Math.min(hw, hh, hd) * 0.98);

  let raw: THREE.BufferGeometry;
  if (c <= 1e-6) {
    raw = new THREE.BoxGeometry(width, height, depth);
  } else {
    const soup = new TriangleSoup();
    // Corner points: T (on ±Y face), X (on ±X face), Z (on ±Z face)
    const corner = (sx: number, sy: number, sz: number) => ({
      T: new THREE.Vector3(sx * (hw - c), sy * hh, sz * (hd - c)),
      X: new THREE.Vector3(sx * hw, sy * (hh - c), sz * (hd - c)),
      Z: new THREE.Vector3(sx * (hw - c), sy * (hh - c), sz * hd),
    });
    const signs = [-1, 1];
    const C: Record<string, ReturnType<typeof corner>> = {};
    for (const sx of signs)
      for (const sy of signs)
        for (const sz of signs) C[`${sx}${sy}${sz}`] = corner(sx, sy, sz);
    const at = (sx: number, sy: number, sz: number) => C[`${sx}${sy}${sz}`];
    const hint = new THREE.Vector3();

    // 6 main faces
    for (const s of signs) {
      soup.pushConvexPolygon(
        [at(s, -1, -1).X, at(s, -1, 1).X, at(s, 1, 1).X, at(s, 1, -1).X],
        hint.set(s, 0, 0)
      );
      soup.pushConvexPolygon(
        [at(-1, s, -1).T, at(-1, s, 1).T, at(1, s, 1).T, at(1, s, -1).T],
        hint.set(0, s, 0)
      );
      soup.pushConvexPolygon(
        [at(-1, -1, s).Z, at(-1, 1, s).Z, at(1, 1, s).Z, at(1, -1, s).Z],
        hint.set(0, 0, s)
      );
    }
    // 12 chamfer strips
    for (const a of signs) {
      for (const b of signs) {
        // X-Y edges (run along Z)
        soup.pushConvexPolygon(
          [at(a, b, -1).X, at(a, b, -1).T, at(a, b, 1).T, at(a, b, 1).X],
          hint.set(a, b, 0)
        );
        // Y-Z edges (run along X)
        soup.pushConvexPolygon(
          [at(-1, a, b).T, at(-1, a, b).Z, at(1, a, b).Z, at(1, a, b).T],
          hint.set(0, a, b)
        );
        // X-Z edges (run along Y)
        soup.pushConvexPolygon(
          [at(a, -1, b).X, at(a, -1, b).Z, at(a, 1, b).Z, at(a, 1, b).X],
          hint.set(a, 0, b)
        );
      }
    }
    // 8 corner triangles
    for (const sx of signs)
      for (const sy of signs)
        for (const sz of signs) {
          const k = at(sx, sy, sz);
          soup.pushConvexPolygon([k.T, k.X, k.Z], hint.set(sx, sy, sz));
        }
    raw = soup.toGeometry();
  }

  const g = ensureAllAttributes(raw, hexColor ?? '#ffffff');
  raw.dispose();
  if (hexColor !== undefined) paintGeometry(g, hexColor);
  return finalizeGeometry(g, Math.PI / 6);
}

/**
 * Lathe-turned cylinder (axis +Y, centred at origin) with real 45° machined end chamfers —
 * for pins, pistons, barrels, muzzle brakes and bolt heads.
 */
export function createBeveledCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  bevel = 0.03,
  radialSegments = 28,
  hexColor?: string | number
): THREE.BufferGeometry {
  const hh = height / 2;
  const rT = Math.max(radiusTop, 1e-4);
  const rB = Math.max(radiusBottom, 1e-4);
  const b = Math.min(Math.max(bevel, 0), Math.min(rT, rB) * 0.9, hh * 0.9);

  const profile: Array<[number, number]> = [[0, -hh]];
  if (b > 1e-6) {
    profile.push([rB - b, -hh], [rB, -hh + b], [rT, hh - b], [rT - b, hh]);
  } else {
    profile.push([rB, -hh], [rT, hh]);
  }
  profile.push([0, hh]);

  const raw = buildRevolvedProfile(profile, radialSegments);
  const g = ensureAllAttributes(raw, hexColor ?? '#ffffff');
  raw.dispose();
  if (hexColor !== undefined) paintGeometry(g, hexColor);
  return finalizeGeometry(g, Math.PI / 5.2);
}

/**
 * Twisted helical land-and-groove rifling cutter along +X (centred at origin, spanning
 * `x ∈ [-length/2, +length/2]`). Lands sit at `boreRadius`, grooves at `boreRadius + grooveDepth`;
 * the profile twists `twistTurns` full revolutions over the cutter length (right-hand twist).
 * Subtract it from a barrel blank: `csgSubtract(barrel, [createRifledBarrelBoreCutter(...).translate(...)])`.
 */
export function createRifledBarrelBoreCutter(
  length: number,
  boreRadius: number,
  grooveDepth = 0.012,
  lands = 6,
  twistTurns = 1.2
): THREE.BufferGeometry {
  const landCount = Math.max(2, Math.floor(lands));
  const SAMPLES_PER_PITCH = 8;
  const angular = landCount * SAMPLES_PER_PITCH;
  const axialSegments = Math.max(12, Math.ceil(Math.abs(twistTurns) * 36));
  const halfL = length / 2;
  const grooveR = boreRadius + Math.max(grooveDepth, 0);

  // Land (k = 0..2, 7) vs groove (k = 3..6) radius per angular sample
  const radius = new Float64Array(angular);
  for (let a = 0; a < angular; a++) {
    const k = a % SAMPLES_PER_PITCH;
    radius[a] = k >= 3 && k <= 6 ? grooveR : boreRadius;
  }

  const ringY = new Float64Array((axialSegments + 1) * angular);
  const ringZ = new Float64Array((axialSegments + 1) * angular);
  for (let i = 0; i <= axialSegments; i++) {
    const t = i / axialSegments;
    const twist = twistTurns * Math.PI * 2 * t;
    for (let a = 0; a < angular; a++) {
      const phi = (a / angular) * Math.PI * 2 + twist;
      ringY[i * angular + a] = radius[a] * Math.cos(phi);
      ringZ[i * angular + a] = radius[a] * Math.sin(phi);
    }
  }

  const soup = new TriangleSoup();
  for (let i = 0; i < axialSegments; i++) {
    const x0 = -halfL + (length * i) / axialSegments;
    const x1 = -halfL + (length * (i + 1)) / axialSegments;
    for (let a = 0; a < angular; a++) {
      const a1 = (a + 1) % angular;
      const iA = i * angular + a;
      const iB = i * angular + a1;
      const iC = (i + 1) * angular + a1;
      const iD = (i + 1) * angular + a;
      soup.pushTri(
        x0,
        ringY[iA],
        ringZ[iA],
        x0,
        ringY[iB],
        ringZ[iB],
        x1,
        ringY[iC],
        ringZ[iC]
      );
      soup.pushTri(
        x0,
        ringY[iA],
        ringZ[iA],
        x1,
        ringY[iC],
        ringZ[iC],
        x1,
        ringY[iD],
        ringZ[iD]
      );
    }
  }
  // End caps (fans from the bore axis)
  const last = axialSegments * angular;
  for (let a = 0; a < angular; a++) {
    const a1 = (a + 1) % angular;
    soup.pushTri(
      -halfL,
      0,
      0,
      -halfL,
      ringY[a1],
      ringZ[a1],
      -halfL,
      ringY[a],
      ringZ[a]
    );
    soup.pushTri(
      halfL,
      0,
      0,
      halfL,
      ringY[last + a],
      ringZ[last + a],
      halfL,
      ringY[last + a1],
      ringZ[last + a1]
    );
  }

  const raw = soup.toGeometry();
  const g = ensureAllAttributes(raw, '#1f2937');
  raw.dispose();
  return finalizeGeometry(g, Math.PI / 7);
}

/** MIL-STD-1913 nominal metrology in cm (1 unit = 1 cm). */
export const MIL_STD_1913 = {
  /** Overall dovetail width across the 45° ridges (0.835"). */
  widthZ: 2.12,
  /** Recoil-groove centre-to-centre pitch (0.394"). */
  slotPitch: 1.0,
  /** Recoil-groove width along the bore axis (0.206"). */
  slotWidth: 0.523,
  /** Recoil-groove depth measured from the rail crown (0.118"). */
  slotDepth: 0.3,
  /** Overall rail height from crown to mounting base. */
  railHeight: 0.95,
} as const;

/**
 * True MIL-STD-1913 Picatinny rail: 45° double-beveled dovetail profile extruded along +X from
 * `startX` to `startX + length`, crown at `y = topY`, centred on `z = 0`, with cross recoil slots on
 * the 10.0 mm pitch cut through the dovetail ridges.
 */
export function createMilStdPicatinnyRail(
  length: number,
  startX: number,
  topY: number,
  widthZ: number = MIL_STD_1913.widthZ,
  hexColor: string | number = '#2b313b'
): THREE.BufferGeometry {
  const s = widthZ / MIL_STD_1913.widthZ;
  // Half-profile (z, y) relative to the crown, mirrored for the left flank
  const half: Array<[number, number]> = [
    [0.83, 0], // crown flat edge
    [1.06, -0.23], // upper 45° bevel → dovetail ridge
    [0.8, -0.49], // lower 45° undercut
    [0.8, -0.62], // neck
    [1.0, -0.72], // base flare
    [1.0, -MIL_STD_1913.railHeight], // mounting base
  ];
  const shape = new THREE.Shape();
  shape.moveTo(-half[half.length - 1][0] * s, half[half.length - 1][1]);
  for (let i = half.length - 2; i >= 0; i--) {
    shape.lineTo(-half[i][0] * s, half[i][1]);
  }
  for (let i = 0; i < half.length; i++) {
    shape.lineTo(half[i][0] * s, half[i][1]);
  }
  shape.closePath();

  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
    steps: 1,
  });
  // Local extrusion +Z → world +X; local X (profile z) → world -Z (symmetric profile)
  extruded.rotateY(Math.PI / 2);
  extruded.translate(startX, topY, 0);
  const body = ensureAllAttributes(extruded, hexColor);
  extruded.dispose();

  const { slotPitch, slotWidth, slotDepth } = MIL_STD_1913;
  const usable = length - slotWidth - 0.5;
  const slotCount = usable > 0 ? Math.floor(usable / slotPitch) + 1 : 0;
  if (slotCount <= 0) {
    paintGeometry(body, hexColor);
    return finalizeGeometry(body, Math.PI / 6);
  }
  const span = (slotCount - 1) * slotPitch;
  const firstX = startX + length / 2 - span / 2;
  const slotBoxes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < slotCount; i++) {
    // Subdivide along Z so interior recoil-slot root vertices sit inside the dovetail (aCurvature < 0)
    // while outer 45° dovetail teeth stay crisp convex (+1).
    const box = new THREE.BoxGeometry(
      slotWidth,
      slotDepth * 2,
      widthZ + 0.6,
      1,
      1,
      4
    );
    box.translate(firstX + i * slotPitch, topY, 0);
    slotBoxes.push(ensureAllAttributes(box, hexColor));
    box.dispose();
  }
  const slotCutter = mergeGeometries(slotBoxes, false);
  for (const g of slotBoxes) g.dispose();

  const rail = csgSubtract(body, [slotCutter], Math.PI / 6);
  body.dispose();
  slotCutter.dispose();
  paintGeometry(rail, hexColor);
  return rail;
}
