import * as THREE from 'three';

/**
 * CNC Edge Curvature & Cavity Attribute Builder
 * ---------------------------------------------
 * Computes a signed per-vertex dihedral curvature attribute (`aCurvature`, itemSize 1, range [-1, +1])
 * used by the Armory Shader for:
 *  - Convex sharp machined edges (`+0.35 .. +1.0`): exposed steel edge wear & micro-chamfer specular.
 *  - Concave recesses / pinholes / serration roots / rail corners (`-0.35 .. -1.0`): CLP oil & carbon grime AO.
 *  - Smooth planar / gentle cylindrical surfaces (`~0.0`).
 *
 * Algorithm (typed-array open-addressing hash + 1D collinear sweep for CSG T-junctions, zero leaks):
 *  1. Spatially weld coincident vertices (`1e-4` cm quantization) across non-indexed triangle soups.
 *  2. Pass 1: Match exact welded manifold edges `(min(wa, wb), max(wa, wb))` in O(N).
 *  3. Pass 2: Match any remaining unmatched half-edges produced by CSG boolean T-junctions via a
 *     continuous `|u.x|` sweep-and-prune collinear segment overlap test (zero work on closed non-CSG meshes).
 *  4. For every matched edge pair `(t1, t2)`: dihedral angle `θ = acos(n1·n2)` gives magnitude,
 *     `sign = sign(dot(n1 - n2, c1 - c2))` (convex > 0, concave < 0). Authored-smooth edges are skipped.
 *  5. Per welded vertex, net crease energy (`convexSum` vs `concaveSum`) selects dominant sign at
 *     saddle corners (e.g. 2 convex pocket-rim edges vs 1 vertical inner wall edge → convex rim),
 *     while `convexMax` / `concaveMax` preserves full crisp edge magnitude free of diagonal dilution.
 */

/** Spatial weld tolerance in world units (1 unit = 1 cm). */
export const CURVATURE_WELD_TOLERANCE = 1e-4;

/** Attribute name for the signed CNC curvature channel (itemSize 1). */
export const CURVATURE_ATTRIBUTE = 'aCurvature';
/** Attribute name for the constant-wire-diameter GPU spring channel (itemSize 4). */
export const SPRING_PARAM_ATTRIBUTE = 'aSpringParam';

const DEG = Math.PI / 180;
/** Below this dihedral angle an edge is considered planar / gently curved (→ 0). */
const SMOOTH_ANGLE = 8 * DEG;
/** Sharp CNC edge threshold: edges ≥ 20° map into the ±0.35 .. ±1.0 band. */
const SHARP_ANGLE = 20 * DEG;
/** Dihedral angle at which the response saturates to ±1.0. */
const SATURATE_ANGLE = 90 * DEG;
/** Vertex-normal agreement threshold for authored-smooth edges. */
const SMOOTH_NORMAL_DOT = 0.9995;

function nextPow2(n: number): number {
  let p = 16;
  while (p < n) p <<= 1;
  return p;
}

function smoothstep01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/**
 * Maps an unsigned dihedral angle (radians) to curvature magnitude in [0, 1].
 *  - θ < 8°        → 0
 *  - 8° .. 20°     → 0 .. 0.35 (smooth ramp)
 *  - 20° .. 90°+   → 0.35 .. 1.0 (smooth ramp, saturating)
 */
export function dihedralAngleToCurvatureMagnitude(theta: number): number {
  if (!(theta > SMOOTH_ANGLE)) return 0;
  if (theta < SHARP_ANGLE) {
    return (
      0.35 * smoothstep01((theta - SMOOTH_ANGLE) / (SHARP_ANGLE - SMOOTH_ANGLE))
    );
  }
  return (
    0.35 +
    0.65 * smoothstep01((theta - SHARP_ANGLE) / (SATURATE_ANGLE - SHARP_ANGLE))
  );
}

/**
 * Computes the signed CNC dihedral curvature for every vertex of `geo`.
 * Works for both indexed and non-indexed geometries; returns `Float32Array(position.count)`.
 */
export function computeVertexCurvatureAttribute(
  geo: THREE.BufferGeometry
): Float32Array {
  const posAttr = geo.getAttribute('position');
  const vertCount = posAttr ? posAttr.count : 0;
  const out = new Float32Array(vertCount);
  if (vertCount < 3) return out;

  const indexAttr = geo.getIndex();
  const cornerCount = indexAttr ? indexAttr.count : vertCount;
  const triCount = Math.floor(cornerCount / 3);
  if (triCount < 2) return out;

  const normAttr = geo.getAttribute('normal');

  const cornerVertex = (c: number): number =>
    indexAttr ? indexAttr.getX(c) : c;

  // ---- 1. Spatial weld (quantized open-addressing hash) ----
  const inv = 1 / CURVATURE_WELD_TOLERANCE;
  const weldCap = nextPow2(vertCount * 2);
  const weldMask = weldCap - 1;
  const weldKeys = new Int32Array(weldCap * 3);
  const weldIds = new Int32Array(weldCap).fill(-1);
  const vertexWeld = new Int32Array(vertCount);
  const weldPos = new Float32Array(vertCount * 3);
  let weldCount = 0;

  for (let v = 0; v < vertCount; v++) {
    const px = posAttr.getX(v);
    const py = posAttr.getY(v);
    const pz = posAttr.getZ(v);
    const qx = Math.round(px * inv) | 0;
    const qy = Math.round(py * inv) | 0;
    const qz = Math.round(pz * inv) | 0;
    let h =
      (Math.imul(qx, 73856093) ^
        Math.imul(qy, 19349663) ^
        Math.imul(qz, 83492791)) &
      weldMask;
    for (;;) {
      const id = weldIds[h];
      if (id === -1) {
        const w = weldCount++;
        weldIds[h] = w;
        weldKeys[h * 3] = qx;
        weldKeys[h * 3 + 1] = qy;
        weldKeys[h * 3 + 2] = qz;
        weldPos[w * 3] = px;
        weldPos[w * 3 + 1] = py;
        weldPos[w * 3 + 2] = pz;
        vertexWeld[v] = w;
        break;
      }
      if (
        weldKeys[h * 3] === qx &&
        weldKeys[h * 3 + 1] === qy &&
        weldKeys[h * 3 + 2] === qz
      ) {
        vertexWeld[v] = id;
        break;
      }
      h = (h + 1) & weldMask;
    }
  }

  // ---- 2. Face normals & centroids ----
  const faceN = new Float32Array(triCount * 3);
  const faceC = new Float32Array(triCount * 3);
  const faceValid = new Uint8Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const a = cornerVertex(t * 3);
    const b = cornerVertex(t * 3 + 1);
    const c = cornerVertex(t * 3 + 2);
    const ax = posAttr.getX(a);
    const ay = posAttr.getY(a);
    const az = posAttr.getZ(a);
    const bx = posAttr.getX(b);
    const by = posAttr.getY(b);
    const bz = posAttr.getZ(b);
    const cx = posAttr.getX(c);
    const cy = posAttr.getY(c);
    const cz = posAttr.getZ(c);
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    const t3 = t * 3;
    faceC[t3] = (ax + bx + cx) / 3;
    faceC[t3 + 1] = (ay + by + cy) / 3;
    faceC[t3 + 2] = (az + bz + cz) / 3;
    if (len > 1e-12 && Number.isFinite(len)) {
      faceN[t3] = nx / len;
      faceN[t3 + 1] = ny / len;
      faceN[t3 + 2] = nz / len;
      faceValid[t] = 1;
    }
  }

  // ---- 3. Pass 1: Exact shared manifold edges ----
  const edgeCap = nextPow2(triCount * 3 * 2);
  const edgeMask = edgeCap - 1;
  const edgeA = new Int32Array(edgeCap);
  const edgeB = new Int32Array(edgeCap);
  const edgeCorner = new Int32Array(edgeCap).fill(-1);
  const edgeHiCorner = new Int32Array(edgeCap);
  const edgeMatched = new Uint8Array(edgeCap);

  const convexMax = new Float32Array(weldCount);
  const concaveMax = new Float32Array(weldCount);
  const convexSum = new Float32Array(weldCount);
  const concaveSum = new Float32Array(weldCount);

  const sameNormal = (c1: number, c2: number): boolean => {
    if (!normAttr) return false;
    const v1 = cornerVertex(c1);
    const v2 = cornerVertex(c2);
    const d =
      normAttr.getX(v1) * normAttr.getX(v2) +
      normAttr.getY(v1) * normAttr.getY(v2) +
      normAttr.getZ(v1) * normAttr.getZ(v2);
    return d > SMOOTH_NORMAL_DOT;
  };

  const applyCreaseToVertex = (w: number, s: number, mag: number): void => {
    if (s > 1e-12) {
      if (mag > convexMax[w]) convexMax[w] = mag;
      convexSum[w] += mag;
    } else if (s < -1e-12) {
      if (mag > concaveMax[w]) concaveMax[w] = mag;
      concaveSum[w] += mag;
    }
  };

  const evalFacePair = (
    t1: number,
    t2: number
  ): { s: number; mag: number } | null => {
    const t1o = t1 * 3;
    const t2o = t2 * 3;
    const n1x = faceN[t1o];
    const n1y = faceN[t1o + 1];
    const n1z = faceN[t1o + 2];
    const n2x = faceN[t2o];
    const n2y = faceN[t2o + 1];
    const n2z = faceN[t2o + 2];
    let cosT = n1x * n2x + n1y * n2y + n1z * n2z;
    if (cosT > 1) cosT = 1;
    else if (cosT < -1) cosT = -1;
    const theta = Math.acos(cosT);
    if (!(theta > SMOOTH_ANGLE)) return null;
    const s =
      (n1x - n2x) * (faceC[t1o] - faceC[t2o]) +
      (n1y - n2y) * (faceC[t1o + 1] - faceC[t2o + 1]) +
      (n1z - n2z) * (faceC[t1o + 2] - faceC[t2o + 2]);
    if (Math.abs(s) <= 1e-12) return null;
    return { s, mag: dihedralAngleToCurvatureMagnitude(theta) };
  };

  for (let t = 0; t < triCount; t++) {
    if (!faceValid[t]) continue;
    for (let e = 0; e < 3; e++) {
      const cA = t * 3 + e;
      const cB = t * 3 + ((e + 1) % 3);
      let wa = vertexWeld[cornerVertex(cA)];
      let wb = vertexWeld[cornerVertex(cB)];
      if (wa === wb) continue;
      let loCorner = cA;
      let hiCorner = cB;
      if (wa > wb) {
        const tmp = wa;
        wa = wb;
        wb = tmp;
        loCorner = cB;
        hiCorner = cA;
      }
      let h =
        (Math.imul(wa, 0x9e3779b1) ^ Math.imul(wb, 0x85ebca77)) & edgeMask;
      for (;;) {
        const stored = edgeCorner[h];
        if (stored === -1) {
          edgeA[h] = wa;
          edgeB[h] = wb;
          edgeCorner[h] = loCorner;
          edgeHiCorner[h] = hiCorner;
          break;
        }
        if (edgeA[h] === wa && edgeB[h] === wb) {
          edgeMatched[h] = 1;
          const storedLo = stored;
          const storedHi = edgeHiCorner[h];
          const t2 = (storedLo / 3) | 0;
          if (
            t2 !== t &&
            faceValid[t2] &&
            !(sameNormal(loCorner, storedLo) && sameNormal(hiCorner, storedHi))
          ) {
            const crease = evalFacePair(t, t2);
            if (crease) {
              applyCreaseToVertex(wa, crease.s, crease.mag);
              applyCreaseToVertex(wb, crease.s, crease.mag);
            }
          }
          break;
        }
        h = (h + 1) & edgeMask;
      }
    }
  }

  // ---- 4. Pass 2: Collinear CSG boolean T-junction segment matching ----
  // Count unmatched half-edges (0 on clean non-CSG meshes → immediate skip).
  let unmatchedCount = 0;
  for (let h = 0; h < edgeCap; h++) {
    if (edgeCorner[h] !== -1 && edgeMatched[h] === 0) unmatchedCount++;
  }

  if (unmatchedCount >= 2) {
    const uWa = new Int32Array(unmatchedCount);
    const uWb = new Int32Array(unmatchedCount);
    const uTri = new Int32Array(unmatchedCount);
    const uLoC = new Int32Array(unmatchedCount);
    const uUx = new Float32Array(unmatchedCount);
    const uUy = new Float32Array(unmatchedCount);
    const uUz = new Float32Array(unmatchedCount);
    const uLen = new Float32Array(unmatchedCount);
    const uAbsUx = new Float32Array(unmatchedCount);
    let k = 0;

    for (let h = 0; h < edgeCap; h++) {
      if (edgeCorner[h] === -1 || edgeMatched[h] !== 0) continue;
      const wa = edgeA[h];
      const wb = edgeB[h];
      const dx = weldPos[wb * 3] - weldPos[wa * 3];
      const dy = weldPos[wb * 3 + 1] - weldPos[wa * 3 + 1];
      const dz = weldPos[wb * 3 + 2] - weldPos[wa * 3 + 2];
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-5) continue;
      const invL = 1 / len;
      uWa[k] = wa;
      uWb[k] = wb;
      uLoC[k] = edgeCorner[h];
      uTri[k] = (edgeCorner[h] / 3) | 0;
      uUx[k] = dx * invL;
      uUy[k] = dy * invL;
      uUz[k] = dz * invL;
      uLen[k] = len;
      uAbsUx[k] = Math.abs(dx * invL);
      k++;
    }

    if (k >= 2) {
      const order = new Int32Array(k);
      for (let i = 0; i < k; i++) order[i] = i;
      order.sort((a, b) => uAbsUx[a] - uAbsUx[b]);

      for (let ii = 0; ii < k; ii++) {
        const i = order[ii];
        const keyI = uAbsUx[i];
        const absUyI = Math.abs(uUy[i]);
        const ux = uUx[i];
        const uy = uUy[i];
        const uz = uUz[i];
        const waI = uWa[i];
        const wbI = uWb[i];
        const ax = weldPos[waI * 3];
        const ay = weldPos[waI * 3 + 1];
        const az = weldPos[waI * 3 + 2];
        const lenI = uLen[i];
        const tI = uTri[i];

        for (let jj = ii + 1; jj < k; jj++) {
          const j = order[jj];
          if (uAbsUx[j] - keyI > 0.02) break;
          if (uTri[j] === tI) continue;
          if (Math.abs(Math.abs(uUy[j]) - absUyI) > 0.02) continue;

          const dotU = ux * uUx[j] + uy * uUy[j] + uz * uUz[j];
          if (Math.abs(dotU) < 0.9998) continue;

          const waJ = uWa[j];
          const wbJ = uWb[j];
          const d0x = weldPos[waJ * 3] - ax;
          const d0y = weldPos[waJ * 3 + 1] - ay;
          const d0z = weldPos[waJ * 3 + 2] - az;
          const sJ0 = d0x * ux + d0y * uy + d0z * uz;
          const px = d0x - sJ0 * ux;
          const py = d0y - sJ0 * uy;
          const pz = d0z - sJ0 * uz;
          if (px * px + py * py + pz * pz > 2.5e-7) continue;

          const sJ1 =
            (weldPos[wbJ * 3] - ax) * ux +
            (weldPos[wbJ * 3 + 1] - ay) * uy +
            (weldPos[wbJ * 3 + 2] - az) * uz;
          const b0 = sJ0 < sJ1 ? sJ0 : sJ1;
          const b1 = sJ0 < sJ1 ? sJ1 : sJ0;
          const ov0 = b0 > 0 ? b0 : 0;
          const ov1 = b1 < lenI ? b1 : lenI;
          if (ov1 - ov0 <= 1e-4) continue;

          // Skip authored-smooth seams where vertex normals agree across both triangles
          if (normAttr) {
            const vI = cornerVertex(uLoC[i]);
            const vJ = cornerVertex(uLoC[j]);
            const nd =
              normAttr.getX(vI) * normAttr.getX(vJ) +
              normAttr.getY(vI) * normAttr.getY(vJ) +
              normAttr.getZ(vI) * normAttr.getZ(vJ);
            if (nd > SMOOTH_NORMAL_DOT) continue;
          }

          const crease = evalFacePair(tI, uTri[j]);
          if (!crease) continue;

          // Attribute crease only to welded vertices lying on the shared overlap interval
          const lo = ov0 - 1e-3;
          const hi = ov1 + 1e-3;
          if (0 >= lo && 0 <= hi)
            applyCreaseToVertex(waI, crease.s, crease.mag);
          if (lenI >= lo && lenI <= hi) {
            applyCreaseToVertex(wbI, crease.s, crease.mag);
          }
          if (waJ !== waI && waJ !== wbI && sJ0 >= lo && sJ0 <= hi) {
            applyCreaseToVertex(waJ, crease.s, crease.mag);
          }
          if (wbJ !== waI && wbJ !== wbI && sJ1 >= lo && sJ1 <= hi) {
            applyCreaseToVertex(wbJ, crease.s, crease.mag);
          }
        }
      }
    }
  }

  // ---- 5. Resolve dominant signed response per welded vertex & scatter ----
  for (let v = 0; v < vertCount; v++) {
    const w = vertexWeld[v];
    const cv = convexMax[w];
    const cc = concaveMax[w];
    let val: number;
    if (cv === 0 && cc === 0) {
      val = 0;
    } else {
      val = convexSum[w] + 1e-6 >= concaveSum[w] ? cv : -cc;
    }
    if (val > 1) val = 1;
    else if (val < -1) val = -1;
    out[v] = val;
  }
  return out;
}

/**
 * Computes and attaches `aCurvature` onto `geo` (in place). Vertices belonging to GPU-compressible
 * spring coils (`aSpringParam.w > 0.5`) are forced to `0.0` so round music wire never picks up
 * faceted edge-wear artifacts. When `onlyIfMissing` is true, an existing valid attribute is kept.
 */
export function attachCurvatureAttribute(
  geo: THREE.BufferGeometry,
  onlyIfMissing = false
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  if (!pos) return geo;
  if (onlyIfMissing) {
    const existing = geo.getAttribute(CURVATURE_ATTRIBUTE);
    if (existing && existing.count === pos.count && existing.itemSize === 1) {
      return geo;
    }
  }
  const curv = computeVertexCurvatureAttribute(geo);
  const spring = geo.getAttribute(SPRING_PARAM_ATTRIBUTE);
  if (spring && spring.itemSize === 4 && spring.count === curv.length) {
    for (let i = 0; i < curv.length; i++) {
      if (spring.getW(i) > 0.5) curv[i] = 0;
    }
  }
  geo.setAttribute(CURVATURE_ATTRIBUTE, new THREE.BufferAttribute(curv, 1));
  return geo;
}
