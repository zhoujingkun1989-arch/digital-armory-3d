import * as THREE from 'three';
import {
  clampUv01 as clamp01,
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

const AWM_DARK_STEEL = '#46505f';
const AWM_PARKERIZED = '#586476';
const AWM_DARK_ALLOY = '#3b4452';
const AWM_INNER_DARK = '#252b35';
const AWM_STAINLESS = '#cfd8e3';
const AWM_SATIN_STEEL = '#94a3b8';
const AWM_SCOPE_BLACK = '#3b4452';
const AWM_RUBBER_DIOPTER = '#242830';
const AWM_LENS_SENTINEL = '#10b981'; // Mapped to Zone D3 emerald optical coating by applyAwmScopeUVs
const AWM_GOLD_BRASS = '#d4a017';
const AWM_RED_DOT = '#dc2626';
const AWM_SAFE_WHITE = '#f1f5f9';
const AWM_SPRING_STEEL = '#64748b';
const AWM_FOLLOWER_COL = '#ea580c';

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
export function sanitizeAwmMesh(
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
      const fLen = _fn.length();
      if (fLen > 1e-10) {
        _fn.divideScalar(fLen);
      } else {
        _fn.set(0, 1, 0);
      }
      for (let k = 0; k < 3; k++) {
        outNorm.setXYZ(i + k, _fn.x, _fn.y, _fn.z);
      }
    }
  }

  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/**
 * Unwraps Schmidt & Bender PM II 5-25x56 Scope onto Zone C & Zone D3 of awm_chassis_*.webp:
 *  - Coated Glass Lenses (cg > 0.35 & cr < 0.25): Zone D3 (u in [0.59, 0.77], v in [0.025, 0.095])
 *  - Elevation / Windage / Parallax Turret Skirts: Zone C upper (u in [0.69, 0.97], v in [0.31, 0.47]) -> 0..14 MIL white ticks & knurling!
 *  - Main Tube & Magnification Throw Ring: Zone C lower (u in [0.69, 0.97], v in [0.15, 0.29]) -> SCHMIDT & BENDER PM II 5-25x56
 */
export function applyAwmScopeUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx, cy, cz, cr, cg, fnx, fnz } = triInfo(
      pos,
      col,
      i,
      i + 1,
      i + 2
    );
    const isLens = cg > 0.35 && cr < 0.25;
    const isElevTurret = cx > -3.2 && cx < -0.7 && cy > 0.72;
    const isSideTurret = cx > -3.2 && cx < -0.7 && Math.abs(cz) > 0.72;
    const isLeftScopeFlank = cz < -0.12 || fnz < -0.25;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;

      if (isLens && Math.abs(fnx) > 0.4) {
        u = 0.68 + clamp01((z + 1.05) / 2.1) * 0.18 - 0.09;
        v = 0.06 + clamp01((y + 1.05) / 2.1) * 0.07 - 0.035;
      } else if (isElevTurret) {
        const ang = clamp01(
          (Math.atan2(z, x - -2.05) + Math.PI) / (2 * Math.PI)
        );
        const hNorm = clamp01((y - 0.72) / 0.95);
        u = 0.69 + ang * 0.28;
        v = 0.31 + hNorm * 0.16;
      } else if (isSideTurret) {
        const ang = clamp01(
          (Math.atan2(y, x - -2.05) + Math.PI) / (2 * Math.PI)
        );
        const hNorm = clamp01((Math.abs(z) - 0.72) / 0.88);
        u = 0.69 + ang * 0.28;
        v = 0.31 + hNorm * 0.16;
      } else if (isLeftScopeFlank) {
        const xNorm = clamp01((x - -9.9) / 19.8);
        const yNorm = clamp01((y + 1.15) / 2.3);
        u = 0.86 + xNorm * 0.1;
        v = 0.15 + yNorm * 0.14;
      } else {
        const xNorm = clamp01((x - -9.9) / 19.8);
        const yNorm = clamp01((y + 1.15) / 2.3);
        u = 0.69 + xNorm * 0.28;
        v = 0.15 + yNorm * 0.14;
      }

      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps M-01 5-Round .338 Lapua Magnum Steel Box Magazine onto Zone B lower (v in [0.14, 0.255])
 */
export function applyAwmMagUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    const isRight = fnz > 0.35 && cz > 0.2;
    const isLeft = fnz < -0.35 && cz < -0.2;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const xNorm = clamp01((x - -3.18) / 6.36);
      const yNorm = clamp01((y - -2.35) / 4.5);

      let u: number;
      let v: number;
      if (isRight) {
        u = 0.04 + xNorm * 0.56;
        v = 0.14 + yNorm * 0.115;
      } else if (isLeft) {
        u = 0.04 + (1.0 - xNorm) * 0.56;
        v = 0.14 + yNorm * 0.115;
      } else {
        u = 0.58 + xNorm * 0.06;
        v = 0.28 + yNorm * 0.08;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// GROUP 1 ('slide'): S&B PM II 5-25x56 OPTIC & 60-DEGREE 6-LUG TURN-BOLT GROUP
// ============================================================================

/**
 * S-01: Schmidt & Bender PM II 5-25x56 L/P FFP Sniper Scope
 * assembledPos: [1.7, 3.42, 0] -> World X in [-8.2, +11.6], optical centerline Y = +3.42
 */
export function buildAwmScopeGeometry(): THREE.BufferGeometry {
  // Revolved 34mm main tube + ocular & 56mm objective bell (all radii >= 0.58 -> zero degenerate Lathe poles)
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.62, -9.9),
    new THREE.Vector2(0.84, -9.9), // Rubberized fast-focus diopter ring
    new THREE.Vector2(0.84, -9.32),
    new THREE.Vector2(0.78, -9.26), // Ocular locking step
    new THREE.Vector2(0.79, -7.25), // Ocular housing
    new THREE.Vector2(0.84, -7.15), // Ribbed 5-25x magnification throw ring
    new THREE.Vector2(0.84, -6.05),
    new THREE.Vector2(0.62, -5.62), // Smooth fillet into 34mm main tube
    new THREE.Vector2(0.62, 2.45), // 34mm central tube (rings clamp at local X = -4.35 and +0.05)
    new THREE.Vector2(0.72, 3.25),
    new THREE.Vector2(1.12, 5.65), // Smooth S&B PM II 56mm objective flare
    new THREE.Vector2(1.12, 9.9), // 56mm objective bell + integral sunshade hood
    new THREE.Vector2(1.0, 9.9),
  ];
  const rawTube = new THREE.LatheGeometry(pts, 36);
  rawTube.rotateZ(-Math.PI / 2);
  paintGeometry(rawTube, AWM_SCOPE_BLACK);

  // Deeply recessed threaded front objective sunshade & rear ocular cavities
  const frontRecess = paintGeometry(
    new THREE.CylinderGeometry(0.99, 0.96, 1.5, 32)
      .rotateZ(Math.PI / 2)
      .translate(9.32, 0, 0),
    AWM_INNER_DARK
  );
  const rearRecess = paintGeometry(
    new THREE.CylinderGeometry(0.66, 0.64, 0.92, 28)
      .rotateZ(Math.PI / 2)
      .translate(-9.58, 0, 0),
    AWM_INNER_DARK
  );
  const hollowedTube = csgSubtract(rawTube, [frontRecess, rearRecess]);

  const extras: THREE.BufferGeometry[] = [hollowedTube];

  // Internal objective anti-reflection threaded retaining rings & diopter rubber collar
  for (const bx of [9.12, 9.48, 9.76]) {
    extras.push(
      paintGeometry(
        new THREE.TorusGeometry(0.98, 0.022, 8, 28)
          .rotateY(Math.PI / 2)
          .translate(bx, 0, 0),
        AWM_INNER_DARK
      )
    );
  }
  extras.push(
    paintGeometry(
      new THREE.TorusGeometry(0.65, 0.024, 8, 24)
        .rotateY(Math.PI / 2)
        .translate(-9.42, 0, 0),
      AWM_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.848, 0.848, 0.44, 28)
        .rotateZ(Math.PI / 2)
        .translate(-9.62, 0, 0),
      AWM_RUBBER_DIOPTER
    )
  );

  // Tactile grip ribs around the 5-25x magnification ring & fast-focus diopter
  for (let k = 0; k < 12; k++) {
    const ang = (k * Math.PI) / 6;
    const ry = Math.cos(ang) * 0.842;
    const rz = Math.sin(ang) * 0.842;
    const rib = new THREE.BoxGeometry(0.96, 0.045, 0.06);
    rib.rotateX(-ang);
    rib.translate(-6.6, ry, rz);
    extras.push(paintGeometry(rib, AWM_PARKERIZED));
  }
  // Sculpted zoom throw fin on magnification ring
  extras.push(
    paintGeometry(
      new THREE.BoxGeometry(0.72, 0.28, 0.16)
        .rotateX(0.28)
        .translate(-6.6, 0.93, -0.26),
      AWM_SCOPE_BLACK
    )
  );

  // Multi-coated emerald-teal glass lenses (sentinel color mapped to Zone D3!)
  const frontLens = paintGeometry(
    new THREE.SphereGeometry(1.42, 28, 18)
      .scale(0.14, 0.68, 0.68)
      .translate(8.76, 0, 0),
    AWM_LENS_SENTINEL
  );
  const rearLens = paintGeometry(
    new THREE.SphereGeometry(0.98, 24, 16)
      .scale(0.14, 0.65, 0.65)
      .translate(-9.22, 0, 0),
    AWM_LENS_SENTINEL
  );
  extras.push(frontLens, rearLens);

  // Sculpted erector turret saddle block around local X = -2.05 (World X = -0.35, centered between mount rings!)
  const saddleBlock = paintGeometry(
    new THREE.BoxGeometry(1.92, 1.5, 1.5).translate(-2.05, 0, 0),
    AWM_SCOPE_BLACK
  );
  const saddleChamferCutters: THREE.BufferGeometry[] = [];
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      saddleChamferCutters.push(
        paintGeometry(
          new THREE.BoxGeometry(2.2, 0.36, 0.36)
            .rotateX(Math.PI / 4)
            .translate(-2.05, sy * 0.76, sz * 0.76),
          AWM_SCOPE_BLACK
        )
      );
    }
  }
  extras.push(csgSubtract(saddleBlock, saddleChamferCutters));

  // 1. Tall S&B PM II Double-Turn (DT) 0.1 MRAD Elevation Turret (+Y)
  const elevBaseCollar = paintGeometry(
    new THREE.CylinderGeometry(0.73, 0.75, 0.22, 28).translate(-2.05, 0.82, 0),
    AWM_DARK_STEEL
  );
  const elevDrum = paintGeometry(
    new THREE.CylinderGeometry(0.69, 0.71, 0.76, 30).translate(-2.05, 1.28, 0),
    AWM_SCOPE_BLACK
  );
  // Characteristic S&B Double-Turn yellow/brass 2nd-revolution indicator ring + top cap
  const elevTurnIndicator = paintGeometry(
    new THREE.CylinderGeometry(0.64, 0.67, 0.12, 28).translate(-2.05, 1.69, 0),
    AWM_GOLD_BRASS
  );
  const elevTopCap = paintGeometry(
    new THREE.CylinderGeometry(0.6, 0.64, 0.1, 28).translate(-2.05, 1.79, 0),
    AWM_SCOPE_BLACK
  );
  extras.push(elevBaseCollar, elevDrum, elevTurnIndicator, elevTopCap);
  // Knurled scalloped flutes & zero-stop hex set screws on elevation turret
  for (let k = 0; k < 12; k++) {
    const ang = (k * Math.PI) / 6;
    const gx = -2.05 + Math.cos(ang) * 0.7;
    const gz = Math.sin(ang) * 0.7;
    extras.push(
      paintGeometry(
        new THREE.BoxGeometry(0.055, 0.32, 0.055)
          .rotateY(-ang)
          .translate(gx, 1.48, gz),
        AWM_PARKERIZED
      )
    );
  }
  for (const ang of [0.4, 2.74]) {
    extras.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.045, 0.045, 0.08, 8)
          .rotateZ(Math.PI / 2)
          .rotateY(-ang)
          .translate(
            -2.05 + Math.cos(ang) * 0.69,
            1.14,
            Math.sin(ang) * 0.69
          ),
        AWM_STAINLESS
      )
    );
  }

  // 2. Right-side MTC Locking Windage Turret (+Z)
  const windCollar = paintGeometry(
    new THREE.CylinderGeometry(0.61, 0.63, 0.2, 26)
      .rotateX(Math.PI / 2)
      .translate(-2.05, 0, 0.82),
    AWM_DARK_STEEL
  );
  const windDrum = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.59, 0.64, 28)
      .rotateX(Math.PI / 2)
      .translate(-2.05, 0, 1.2),
    AWM_SCOPE_BLACK
  );
  const windEndCap = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.54, 0.08, 24)
      .rotateX(Math.PI / 2)
      .translate(-2.05, 0, 1.54),
    AWM_DARK_STEEL
  );
  extras.push(windCollar, windDrum, windEndCap);

  // 3. Left-side Coaxial Side Parallax Focus Turret (50m - Infinity, -Z)
  const parallaxCollar = paintGeometry(
    new THREE.CylinderGeometry(0.63, 0.65, 0.22, 26)
      .rotateX(Math.PI / 2)
      .translate(-2.05, 0, -0.82),
    AWM_DARK_STEEL
  );
  const parallaxDrum = paintGeometry(
    new THREE.CylinderGeometry(0.59, 0.61, 0.68, 28)
      .rotateX(Math.PI / 2)
      .translate(-2.05, 0, -1.22),
    AWM_SCOPE_BLACK
  );
  extras.push(parallaxCollar, parallaxDrum);

  // 4. S&B PM II L/P Angled 11-Position Reticle Illumination Rheostat Dial (45 deg upper-left behind saddle)
  const illumPod = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.45, 0.68, 24)
      .rotateX(-Math.PI / 4)
      .translate(-4.78, 0.56, -0.56),
    AWM_SCOPE_BLACK
  );
  const illumCap = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.42, 0.14, 24)
      .rotateX(-Math.PI / 4)
      .translate(-4.78, 0.84, -0.84),
    AWM_DARK_STEEL
  );
  extras.push(illumPod, illumCap);

  const merged = sanitizeAwmMesh(mergeParts(extras));
  return applyAwmScopeUVs(merged);
}

/**
 * S-02: AI One-Piece 34mm Tactical Cantilever/Dovetail Scope Mount
 * assembledPos: [-0.4, 2.82, 0]
 * Clamps receiver top rail at World Y = +2.26 (local Y = -0.56) and holds 34mm scope at World Y = +3.42 (local Y = +0.60)
 */
export function buildAwmScopeMountGeometry(): THREE.BufferGeometry {
  // Monolithic CNC rail clamp base (local X in [-3.45, +3.45], local Y in [-0.72, -0.22])
  const railBaseRaw = paintGeometry(
    new THREE.BoxGeometry(6.9, 0.5, 1.34).translate(0, -0.47, 0),
    AWM_DARK_ALLOY
  );
  const railGroove = paintGeometry(
    new THREE.BoxGeometry(7.2, 0.24, 0.86).translate(0, -0.65, 0),
    AWM_INNER_DARK
  );
  // Central weight-reduction bridge pocket & triangulated side lightening scallops
  const bridgeCut = paintGeometry(
    new THREE.BoxGeometry(2.45, 0.34, 1.6).translate(-0.05, -0.26, 0),
    AWM_INNER_DARK
  );
  const sideScallopL = paintGeometry(
    new THREE.BoxGeometry(2.1, 0.24, 0.24).translate(-0.05, -0.44, -0.66),
    AWM_PARKERIZED
  );
  const baseBar = csgSubtract(railBaseRaw, [
    railGroove,
    bridgeCut,
    sideScallopL,
  ]);

  // Separate full-length right-side dovetail/Picatinny clamping jaw bar + underside recoil stop keys
  const clampJawBar = paintGeometry(
    new THREE.BoxGeometry(6.75, 0.34, 0.18).translate(0, -0.53, 0.69),
    AWM_DARK_STEEL
  );
  const recoilStopKey1 = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.14, 0.82).translate(-1.95, -0.68, 0),
    AWM_STAINLESS
  );
  const recoilStopKey2 = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.14, 0.82).translate(1.95, -0.68, 0),
    AWM_STAINLESS
  );

  // Two heavy 34mm scope rings at local X = -2.25 (World X = -2.65) and local X = +2.15 (World X = +1.75)
  const ringPositions = [-2.25, 2.15];
  const ringParts: THREE.BufferGeometry[] = [
    baseBar,
    clampJawBar,
    recoilStopKey1,
    recoilStopKey2,
  ];

  for (const rx of ringPositions) {
    const outerRing = paintGeometry(
      new THREE.CylinderGeometry(0.88, 0.88, 1.14, 30)
        .rotateZ(Math.PI / 2)
        .translate(rx, 0.6, 0),
      AWM_DARK_ALLOY
    );
    const stanchion = paintGeometry(
      new THREE.BoxGeometry(1.14, 0.86, 1.28).translate(rx, -0.01, 0),
      AWM_DARK_ALLOY
    );
    const flangeL = paintGeometry(
      new THREE.BoxGeometry(1.1, 0.28, 0.34).translate(rx, 0.6, -0.92),
      AWM_DARK_STEEL
    );
    const flangeR = paintGeometry(
      new THREE.BoxGeometry(1.1, 0.28, 0.34).translate(rx, 0.6, 0.92),
      AWM_DARK_STEEL
    );
    const topCapRib = paintGeometry(
      new THREE.BoxGeometry(1.06, 0.12, 0.42).translate(rx, 1.48, 0),
      AWM_PARKERIZED
    );
    const bore = paintGeometry(
      new THREE.CylinderGeometry(0.625, 0.625, 1.4, 30)
        .rotateZ(Math.PI / 2)
        .translate(rx, 0.6, 0),
      AWM_INNER_DARK
    );
    const splitSlotL = paintGeometry(
      new THREE.BoxGeometry(1.3, 0.055, 0.6).translate(rx, 0.6, -0.92),
      AWM_INNER_DARK
    );
    const splitSlotR = paintGeometry(
      new THREE.BoxGeometry(1.3, 0.055, 0.6).translate(rx, 0.6, 0.92),
      AWM_INNER_DARK
    );
    ringParts.push(
      csgSubtract(
        csgUnion([outerRing, stanchion, flangeL, flangeR, topCapRib]),
        [bore, splitSlotL, splitSlotR]
      )
    );

    // 4 socket-head cap screws per ring (8 total)
    for (const dx of [-0.33, 0.33]) {
      for (const side of [-1, 1]) {
        ringParts.push(
          paintGeometry(
            new THREE.CylinderGeometry(0.082, 0.082, 0.38, 12).translate(
              rx + dx,
              0.69,
              side * 0.92
            ),
            AWM_STAINLESS
          )
        );
      }
    }
  }

  // 3 heavy AI 13mm hex clamping cross-bolt nuts + washer collars on right side of rail mount
  for (const bx of [-2.55, 0.0, 2.45]) {
    ringParts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.14, 0.14, 1.54, 14)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.52, 0.05),
        AWM_SATIN_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.22, 0.22, 0.06, 18)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.52, 0.8),
        AWM_DARK_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.19, 0.19, 0.16, 6)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.52, 0.9),
        AWM_STAINLESS
      )
    );
  }

  return sanitizeAwmMesh(mergeParts(ringParts));
}

/**
 * S-03: Manual 60-Degree 6-Lug (3x2 Tandem) Anti-Icing Turn-Bolt Body + Bent Spherical Bolt Handle
 * assembledPos: [0, 1.05, 0] (Coaxial with barrel & striker so rx rotation orbits cleanly!)
 * Long-action Magnum bolt: Local X in [-4.95, +2.92], recessed bolt face at X = +2.83
 */
export function buildAwmBoltBodyGeometry(): THREE.BufferGeometry {
  // Cylindrical stainless Magnum bolt body (R = 0.45, spans [-4.52, +2.92])
  const mainCyl = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.45, 7.44, 30)
      .rotateZ(Math.PI / 2)
      .translate(-0.8, 0, 0),
    AWM_STAINLESS
  );

  // 6 Arctic anti-bind / ice-relief longitudinal grooves along bolt shaft [-3.55, +1.68]
  const cutters: THREE.BufferGeometry[] = [
    // Hollow internal firing-pin & spring channel
    paintGeometry(
      new THREE.CylinderGeometry(0.285, 0.285, 7.45, 20)
        .rotateZ(Math.PI / 2)
        .translate(-0.92, 0, 0),
      AWM_INNER_DARK
    ),
    // Recessed .338 Lapua Magnum bolt face cup at X = +2.83
    paintGeometry(
      new THREE.CylinderGeometry(0.385, 0.385, 0.22, 24)
        .rotateZ(Math.PI / 2)
        .translate(2.85, 0, 0),
      AWM_INNER_DARK
    ),
    // Central firing-pin tip hole through recessed bolt face
    paintGeometry(
      new THREE.CylinderGeometry(0.068, 0.068, 0.45, 14)
        .rotateZ(Math.PI / 2)
        .translate(2.72, 0, 0),
      AWM_INNER_DARK
    ),
    // Circumferential locking-ring bridge relief groove separating front & rear lug rows (X = 2.35)
    paintGeometry(
      new THREE.TorusGeometry(0.49, 0.06, 10, 28)
        .rotateY(Math.PI / 2)
        .translate(2.35, 0, 0),
      AWM_SATIN_STEEL
    ),
    // Extractor slot along upper-right lug column
    paintGeometry(
      new THREE.BoxGeometry(2.48, 0.16, 0.22).translate(1.82, 0.12, 0.44),
      AWM_INNER_DARK
    ),
  ];

  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3 + Math.PI / 6;
    const fy = Math.cos(ang) * 0.468;
    const fz = Math.sin(ang) * 0.468;
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.115, 0.115, 5.1, 14)
          .rotateZ(Math.PI / 2)
          .translate(-0.92, fy, fz),
        AWM_SATIN_STEEL
      )
    );
  }

  const flutedBody = csgSubtract(mainCyl, cutters);

  // Authentic Portsmouth AI 6-Lug Bolt Head: TWO tandem rows of 3 radially ALIGNED lugs (120 deg apart)
  // Both rows pass cleanly through 3 receiver raceways and lock into 6 abutments with a crisp 60-degree throw!
  const lugs: THREE.BufferGeometry[] = [];
  const rowXs = [2.66, 2.04];
  for (const lx of rowXs) {
    for (let k = 0; k < 3; k++) {
      const ang = (k * 2 * Math.PI) / 3;
      const lugRaw = paintGeometry(
        new THREE.BoxGeometry(0.42, 0.25, 0.34)
          .translate(0, 0.48, 0)
          .rotateX(ang)
          .translate(lx, 0, 0),
        AWM_STAINLESS
      );
      lugs.push(lugRaw);
    }
  }

  // Spring-loaded plunger ejector on recessed bolt face (opposing upper-right claw extractor!)
  const plungerPin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.22, 12)
      .rotateZ(Math.PI / 2)
      .translate(2.79, -0.16, -0.16),
    AWM_GOLD_BRASS
  );

  // Rear bolt handle root collar w/ cock-on-opening V-cam notch & primary-extraction cam bevel
  const rearCollarRaw = paintGeometry(
    new THREE.CylinderGeometry(0.535, 0.535, 0.72, 28)
      .rotateZ(Math.PI / 2)
      .translate(-4.18, 0, 0),
    AWM_DARK_STEEL
  );
  const cockingCamNotch = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.28, 0.38)
      .rotateX(Math.PI / 5)
      .translate(-4.52, -0.34, 0),
    AWM_INNER_DARK
  );
  const rearCollar = csgSubtract(rearCollarRaw, [cockingCamNotch]);

  // Iconic AI swept-back bent bolt handle + oversized phenolic spherical knob!
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.16, -0.04, 0.46),
    new THREE.Vector3(-4.42, -0.22, 1.05),
    new THREE.Vector3(-4.72, -0.55, 1.54),
    new THREE.Vector3(-4.88, -0.85, 1.85),
  ]);
  const handleStem = paintGeometry(
    new THREE.TubeGeometry(handleCurve, 20, 0.145, 16, false),
    AWM_DARK_STEEL
  );
  const handleRootBoss = paintGeometry(
    new THREE.BoxGeometry(0.44, 0.36, 0.34)
      .rotateX(0.18)
      .translate(-4.18, -0.08, 0.58),
    AWM_DARK_STEEL
  );

  const knobRaw = paintGeometry(
    new THREE.SphereGeometry(0.44, 26, 20).translate(-4.88, -0.85, 1.85),
    AWM_RUBBER_DIOPTER
  );
  const knobScrewDimple = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 0.24, 14)
      .rotateX(Math.PI / 3)
      .translate(-4.92, -1.04, 2.18),
    AWM_DARK_ALLOY
  );
  const boltSphereKnob = csgSubtract(knobRaw, [knobScrewDimple]);

  return sanitizeAwmMesh(
    mergeParts([
      flutedBody,
      ...lugs,
      plungerPin,
      rearCollar,
      handleRootBoss,
      handleStem,
      boltSphereKnob,
    ])
  );
}

/**
 * S-04: AI Octagonal Bolt Shroud w/ 3-Position Wing/Flag Safety Lever
 * assembledPos: [-5.18, 1.05, 0] -> World X in [-6.25, -4.42]
 */
export function buildAwmBoltShroudGeometry(): THREE.BufferGeometry {
  const shroudBox = paintGeometry(
    new THREE.BoxGeometry(1.86, 0.96, 0.92).translate(-0.22, 0.04, 0),
    AWM_DARK_STEEL
  );
  // Front threaded/cam boss plugging into rear of bolt body
  const frontPlug = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.45, 0.52, 24)
      .rotateZ(Math.PI / 2)
      .translate(0.58, 0, 0),
    AWM_PARKERIZED
  );
  // Bottom anti-rotation tang guide riding in receiver rear tang slot
  const bottomGuideKey = paintGeometry(
    new THREE.BoxGeometry(1.56, 0.28, 0.36).translate(-0.14, -0.52, 0),
    AWM_PARKERIZED
  );
  const boreHole = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 2.4, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.1, 0, 0),
    AWM_INNER_DARK
  );
  const bottomSearSlot = paintGeometry(
    new THREE.BoxGeometry(1.75, 0.38, 0.22).translate(0.12, -0.52, 0),
    AWM_INNER_DARK
  );
  // Top 45-deg chamfer bevels for authentic hexagonal/octagonal AI shroud profile
  const bevelL = paintGeometry(
    new THREE.BoxGeometry(2.1, 0.45, 0.45)
      .rotateX(Math.PI / 4)
      .translate(-0.22, 0.52, -0.48),
    AWM_PARKERIZED
  );
  const bevelR = paintGeometry(
    new THREE.BoxGeometry(2.1, 0.45, 0.45)
      .rotateX(Math.PI / 4)
      .translate(-0.22, 0.52, 0.48),
    AWM_PARKERIZED
  );
  const body = csgSubtract(
    csgUnion([shroudBox, frontPlug, bottomGuideKey]),
    [boreHole, bottomSearSlot, bevelL, bevelR]
  );

  // Iconic AI 3-Position Wing/Flag Safety Lever on left-rear of shroud + white safe line & red fire-ready dot
  const safetyPivot = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.34, 18)
      .rotateX(Math.PI / 2)
      .translate(-0.68, 0.22, -0.46),
    AWM_SATIN_STEEL
  );
  const safetyWing = paintGeometry(
    new THREE.BoxGeometry(0.78, 0.28, 0.18).translate(-0.76, 0.36, -0.56),
    AWM_DARK_ALLOY
  );
  const wingThumbPad = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.34, 0.26).translate(-1.04, 0.38, -0.59),
    AWM_PARKERIZED
  );
  const whiteSafeBar = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.05, 0.04).translate(-0.72, 0.36, -0.65),
    AWM_SAFE_WHITE
  );
  const redFireDot = paintGeometry(
    new THREE.SphereGeometry(0.072, 12, 10).translate(-0.24, 0.34, -0.46),
    AWM_RED_DOT
  );

  return sanitizeAwmMesh(
    mergeParts([
      body,
      safetyPivot,
      safetyWing,
      wingThumbPad,
      whiteSafeBar,
      redFireDot,
    ])
  );
}

/**
 * S-05: Internal Striker / Firing Pin Assembly w/ Cocking Piece Sear Lug & Tactile Indicator
 * assembledPos: [-1.15, 1.05, 0] -> World X in [-6.37, +2.81] (protrudes to +3.33 on primer strike!)
 */
export function buildAwmStrikerGeometry(): THREE.BufferGeometry {
  // Forward stepped & tapered .338 LM firing-pin tip (local X in [+2.40, +3.96] -> World X up to +2.81)
  const needleTip = paintGeometry(
    new THREE.CylinderGeometry(0.046, 0.105, 1.56, 16)
      .rotateZ(-Math.PI / 2)
      .translate(3.18, 0, 0),
    AWM_STAINLESS
  );
  // Lightweight fluted central shaft inside firing-pin spring
  const mainRod = paintGeometry(
    new THREE.CylinderGeometry(0.125, 0.125, 6.25, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.72, 0, 0),
    AWM_STAINLESS
  );
  // Front spring abutment collar flange
  const springCollar = paintGeometry(
    new THREE.CylinderGeometry(0.255, 0.255, 0.22, 20)
      .rotateZ(Math.PI / 2)
      .translate(2.3, 0, 0),
    AWM_SATIN_STEEL
  );
  // Cocking-piece body & hardened bottom sear lug (local X = -1.98 -> World X = -3.13, engaging awm_sear at World X = -3.25!)
  const cockingPiece = paintGeometry(
    new THREE.BoxGeometry(0.92, 0.36, 0.22).translate(-2.15, -0.22, 0),
    AWM_PARKERIZED
  );
  const searLug = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.48, 0.2).translate(-1.98, -0.44, 0),
    AWM_DARK_STEEL
  );
  // Rear tactile/visual cocking indicator rod protruding behind bolt shroud (World X = -6.37)
  const cockIndicator = paintGeometry(
    new THREE.CylinderGeometry(0.105, 0.105, 1.38, 16)
      .rotateZ(Math.PI / 2)
      .translate(-4.53, 0, 0),
    AWM_STAINLESS
  );
  const cockRing = paintGeometry(
    new THREE.TorusGeometry(0.108, 0.018, 8, 16)
      .rotateY(Math.PI / 2)
      .translate(-5.06, 0, 0),
    AWM_RED_DOT
  );

  return sanitizeAwmMesh(
    mergeParts([
      needleTip,
      mainRod,
      springCollar,
      cockingPiece,
      searLug,
      cockIndicator,
      cockRing,
    ])
  );
}

/**
 * S-06: Heavy-Duty Helical Firing Pin Spring
 * assembledPos: [-1.45, 1.05, 0] -> Local X in [-2.15, +2.15] (L0 = 4.30)
 */
export function buildAwmFiringPinSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -2.15,
      end: 2.15,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.235,
      wireRadius: 0.046,
      coils: 18,
    }),
    AWM_SPRING_STEEL
  );
  const rearEndTurn = paintGeometry(
    new THREE.TorusGeometry(0.235, 0.046, 10, 22)
      .rotateY(Math.PI / 2)
      .translate(-2.15, 0, 0),
    AWM_SPRING_STEEL
  );
  const frontEndTurn = paintGeometry(
    new THREE.TorusGeometry(0.235, 0.046, 10, 22)
      .rotateY(Math.PI / 2)
      .translate(2.15, 0, 0),
    AWM_SPRING_STEEL
  );
  return sanitizeAwmMesh(
    finalizeGeometry(mergeParts([spring, rearEndTurn, frontEndTurn]))
  );
}

/**
 * S-07: Heavy External Leaf-Spring Claw Extractor (Coaxial at [0, 1.05, 0] with bolt body!)
 */
export function buildAwmExtractorGeometry(): THREE.BufferGeometry {
  const springLeaf = paintGeometry(
    new THREE.BoxGeometry(2.18, 0.135, 0.14).translate(1.68, 0.12, 0.44),
    AWM_DARK_STEEL
  );
  const clawBody = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.19, 0.23).translate(2.84, 0.12, 0.39),
    AWM_STAINLESS
  );
  const clawBevelCut = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.28, 0.2)
      .rotateY(0.55)
      .translate(3.02, 0.12, 0.29),
    AWM_STAINLESS
  );
  const clawHook = csgSubtract(clawBody, [clawBevelCut]);
  const retainCollar = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.22, 0.19).translate(0.66, 0.12, 0.42),
    AWM_PARKERIZED
  );
  return sanitizeAwmMesh(mergeParts([springLeaf, clawHook, retainCollar]));
}

// ============================================================================
// GROUP 3 ('fire_control'): TWO-STAGE MATCH TRIGGER PACK & MAG CATCH
// ============================================================================

/**
 * FC-01: Modular Two-Stage Match Trigger Box Cassette Housing
 * assembledPos: [-3.05, -0.65, 0] -> World Y in [-1.34, +0.26] (mates flush with receiver bottom +0.22!)
 */
export function buildAwmTriggerBoxGeometry(): THREE.BufferGeometry {
  const boxRaw = paintGeometry(
    new THREE.BoxGeometry(2.18, 1.4, 0.68).translate(0, 0.02, 0),
    AWM_DARK_STEEL
  );
  const topTang = paintGeometry(
    new THREE.BoxGeometry(2.48, 0.22, 0.82).translate(0.05, 0.8, 0),
    AWM_PARKERIZED
  );
  const innerSlot = paintGeometry(
    new THREE.BoxGeometry(1.74, 1.16, 0.36).translate(0.04, -0.05, 0),
    AWM_INNER_DARK
  );
  const sideWindow1 = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 0.86, 16)
      .rotateX(Math.PI / 2)
      .translate(-0.32, 0.1, 0),
    AWM_INNER_DARK
  );
  const sideWindow2 = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.86, 14)
      .rotateX(Math.PI / 2)
      .translate(0.42, -0.14, 0),
    AWM_INNER_DARK
  );
  const housing = csgSubtract(csgUnion([boxRaw, topTang]), [
    innerSlot,
    sideWindow1,
    sideWindow2,
  ]);

  // Brass/steel 1st-stage travel, 2nd-stage pull-weight (1.5-2.0kg) & overtravel adjustment screws + cross pins
  const adjScrews: THREE.BufferGeometry[] = [];
  for (const sx of [0.7, 0.08, -0.64]) {
    adjScrews.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.068, 0.068, 0.38, 12).translate(
          sx,
          -0.64,
          0
        ),
        AWM_GOLD_BRASS
      )
    );
  }
  const pins: THREE.BufferGeometry[] = [];
  for (const [px, py] of [
    [-0.46, 0.42],
    [0.26, 0.36],
    [0.18, -0.45],
  ]) {
    pins.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.065, 0.065, 0.74, 12)
          .rotateX(Math.PI / 2)
          .translate(px, py, 0),
        AWM_STAINLESS
      )
    );
  }

  return sanitizeAwmMesh(mergeParts([housing, ...adjScrews, ...pins]));
}

/**
 * FC-02: Hardened Tool-Steel Top Sear & First-Stage Transfer Lever
 * assembledPos: [-3.15, 0.18, 0] -> Top sear tooth at World [-3.25, +0.58] engages striker lug!
 */
export function buildAwmSearGeometry(): THREE.BufferGeometry {
  const mainBarRaw = paintGeometry(
    new THREE.BoxGeometry(1.52, 0.28, 0.28).translate(0, 0.02, 0),
    AWM_STAINLESS
  );
  const searTooth = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.38, 0.28).translate(-0.1, 0.26, 0),
    AWM_STAINLESS
  );
  const pivotHole = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.42, 12)
      .rotateX(Math.PI / 2)
      .translate(0.32, 0.02, 0),
    AWM_INNER_DARK
  );
  const searBody = csgSubtract(csgUnion([mainBarRaw, searTooth]), [pivotHole]);

  const transferLeg = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.58, 0.24).translate(0.46, -0.28, 0),
    AWM_SATIN_STEEL
  );
  const searReturnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.42,
      end: -0.08,
      centerX: -0.52,
      centerZ: 0,
      coilRadius: 0.085,
      wireRadius: 0.02,
      coils: 5,
    }),
    AWM_GOLD_BRASS
  );
  return sanitizeAwmMesh(
    mergeParts([searBody, transferLeg, searReturnSpring])
  );
}

/**
 * FC-03: Position-Adjustable Grooved Curved Two-Stage Match Trigger Shoe
 * assembledPos: [-2.95, -1.25, 0] (Pivot at [0,0,0]; rz < 0 pulls trigger blade rearward -X!)
 */
export function buildAwmTriggerShoeGeometry(): THREE.BufferGeometry {
  // Slotted longitudinal adjustment rail yoke (+/- 6.5mm shoe position adjustment) + locking hex screw
  const upperYokeRaw = paintGeometry(
    new THREE.BoxGeometry(0.58, 0.34, 0.28).translate(-0.02, 0.08, 0),
    AWM_DARK_STEEL
  );
  const railSlot = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.12, 0.14).translate(-0.02, 0.08, 0),
    AWM_INNER_DARK
  );
  const upperYoke = csgSubtract(upperYokeRaw, [railSlot]);

  const clampPost = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.34, 0.24).translate(0.02, -0.18, 0),
    AWM_SATIN_STEEL
  );
  const clampScrew = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.06, 0.34, 6)
      .rotateX(Math.PI / 2)
      .translate(0.02, -0.14, 0.04),
    AWM_STAINLESS
  );

  // Curved sniper match trigger blade w/ tactile longitudinal grip ribs across front face
  const bladeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.06, -0.26, 0),
    new THREE.Vector3(0.19, -0.56, 0),
    new THREE.Vector3(0.13, -0.86, 0),
    new THREE.Vector3(-0.08, -1.08, 0),
  ]);
  const shoeBlade = paintGeometry(
    new THREE.TubeGeometry(bladeCurve, 18, 0.105, 14, false).scale(
      0.85,
      1,
      1.6
    ),
    AWM_DARK_STEEL
  );
  const gripRibs: THREE.BufferGeometry[] = [];
  for (const gz of [-0.11, -0.055, 0, 0.055, 0.11]) {
    const ribCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.14, -0.34, gz),
      new THREE.Vector3(0.26, -0.58, gz),
      new THREE.Vector3(0.2, -0.85, gz),
      new THREE.Vector3(0.0, -1.04, gz),
    ]);
    gripRibs.push(
      paintGeometry(
        new THREE.TubeGeometry(ribCurve, 12, 0.016, 6, false),
        AWM_PARKERIZED
      )
    );
  }

  return sanitizeAwmMesh(
    mergeParts([upperYoke, clampPost, clampScrew, shoeBlade, ...gripRibs])
  );
}

/**
 * FC-04: Extended Ambidextrous Arctic-Glove Paddle Magazine Catch
 * assembledPos: [-1.92, -1.95, 0]
 */
export function buildAwmMagCatchGeometry(): THREE.BufferGeometry {
  const upperHook = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.64, 0.48).translate(0.09, 0.25, 0),
    AWM_DARK_STEEL
  );
  const paddleRaw = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.72, 0.66)
      .rotateZ(-0.22)
      .translate(-0.06, -0.34, 0),
    AWM_PARKERIZED
  );
  // Horizontal non-slip serrations on rear face of Arctic paddle
  const serrations: THREE.BufferGeometry[] = [];
  for (const sy of [-0.18, -0.31, -0.44, -0.57]) {
    serrations.push(
      paintGeometry(
        new THREE.BoxGeometry(0.06, 0.045, 0.68)
          .rotateZ(-0.22)
          .translate(-0.16 + (sy + 0.34) * 0.22, sy, 0),
        AWM_STAINLESS
      )
    );
  }
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.078, 0.078, 0.94, 14)
      .rotateX(Math.PI / 2)
      .translate(0, 0.05, 0),
    AWM_STAINLESS
  );
  return sanitizeAwmMesh(
    mergeParts([upperHook, paddleRaw, ...serrations, pivotPin])
  );
}

// ============================================================================
// GROUP 4 ('magazine'): 5-ROUND .338 LAPUA MAGNUM CORRUGATED STEEL BOX MAGAZINE
// ============================================================================

/**
 * M-01: Detachable 5-Round .338 Lapua Magnum Corrugated Steel Box Magazine Body (isShell: true)
 * assembledPos: [1.35, -1.85, 0] -> Long-action Magnum box: Local X in [-3.16, +3.16] (World X in [-1.81, +4.51])
 */
export function buildAwmMagBodyGeometry(): THREE.BufferGeometry {
  const outerBox = paintGeometry(
    new THREE.BoxGeometry(6.32, 4.44, 1.26).translate(0, -0.13, 0),
    AWM_DARK_STEEL
  );
  const innerCavity = paintGeometry(
    new THREE.BoxGeometry(6.02, 4.36, 1.04).translate(0, -0.04, 0),
    AWM_INNER_DARK
  );
  // Precision center-feed opening between inwardly curved steel feed lips
  const topFeedSlot = paintGeometry(
    new THREE.BoxGeometry(5.96, 0.46, 0.66).translate(0.06, 2.08, 0),
    AWM_INNER_DARK
  );
  // Front bullet-ogive clearance ramp notch on front wall
  const frontRampNotch = paintGeometry(
    new THREE.BoxGeometry(0.72, 0.44, 0.92).translate(2.9, 1.98, 0),
    AWM_INNER_DARK
  );
  // Rear round-count witness holes on rear spine
  const witnessCutters: THREE.BufferGeometry[] = [];
  for (const wy of [-1.55, -0.65, 0.25]) {
    witnessCutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.085, 0.085, 0.4, 12)
          .rotateZ(Math.PI / 2)
          .translate(-3.12, wy, 0),
        AWM_INNER_DARK
      )
    );
  }

  const shell = csgSubtract(outerBox, [
    innerCavity,
    topFeedSlot,
    frontRampNotch,
    ...witnessCutters,
  ]);

  // Pressed vertical corrugation ribs (5 per flank), rear folded weld seam, spot-weld dimples & front/rear catch lugs
  const extras: THREE.BufferGeometry[] = [
    // Rear magazine-catch locking lug
    paintGeometry(
      new THREE.BoxGeometry(0.24, 0.34, 0.68).translate(-3.2, -0.02, 0),
      AWM_STAINLESS
    ),
    // Front magwell-lip hook lug
    paintGeometry(
      new THREE.BoxGeometry(0.22, 0.28, 0.68).translate(3.2, 0.12, 0),
      AWM_STAINLESS
    ),
    // Rear folded sheet-steel spine reinforcement strip
    paintGeometry(
      new THREE.BoxGeometry(0.08, 4.15, 0.46).translate(-3.17, -0.15, 0),
      AWM_PARKERIZED
    ),
  ];

  // 5 pressed vertical strengthening ribs per side across upper & lower magazine flanks
  for (const rx of [-2.16, -1.08, 0.0, 1.08, 2.16]) {
    for (const side of [-1, 1]) {
      extras.push(
        paintGeometry(
          new THREE.BoxGeometry(0.22, 3.65, 0.075).translate(
            rx,
            -0.36,
            side * 0.645
          ),
          AWM_PARKERIZED
        )
      );
    }
  }

  // Spot-weld dimple bosses along front & rear spine
  for (const wy of [-1.85, -0.95, 0.0, 0.95]) {
    extras.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10)
          .rotateZ(Math.PI / 2)
          .translate(3.16, wy, 0),
        AWM_DARK_STEEL
      )
    );
  }

  const merged = sanitizeAwmMesh(mergeParts([shell, ...extras]));
  return applyAwmMagUVs(merged);
}

/**
 * M-02: Anti-Tilt Contoured .338 Lapua Magnum Magazine Follower
 * assembledPos: [1.35, -2.35, 0]
 */
export function buildAwmMagFollowerGeometry(): THREE.BufferGeometry {
  const plate = paintGeometry(
    new THREE.BoxGeometry(5.84, 0.22, 0.96).translate(0, 0.06, 0),
    AWM_FOLLOWER_COL
  );
  const guideSkirtF = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.62, 0.92).translate(2.81, -0.2, 0),
    AWM_FOLLOWER_COL
  );
  const guideSkirtR = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.62, 0.92).translate(-2.81, -0.2, 0),
    AWM_FOLLOWER_COL
  );
  // Center-feed raised side rails cradling the 14.9mm rim of a .338 Lapua Magnum case on centerline Z = 0
  const railL = paintGeometry(
    new THREE.BoxGeometry(5.76, 0.14, 0.18).translate(0, 0.2, -0.36),
    AWM_FOLLOWER_COL
  );
  const railR = paintGeometry(
    new THREE.BoxGeometry(5.76, 0.14, 0.18).translate(0, 0.2, 0.36),
    AWM_FOLLOWER_COL
  );
  const springBoss = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.16, 0.44).translate(0, -0.1, 0),
    AWM_DARK_STEEL
  );
  return sanitizeAwmMesh(
    mergeParts([plate, guideSkirtF, guideSkirtR, railL, railR, springBoss])
  );
}

class WideOvalHelixCurve extends THREE.Curve<THREE.Vector3> {
  private readonly yStart: number;
  private readonly yEnd: number;
  private readonly rx: number;
  private readonly rz: number;
  private readonly coils: number;

  constructor(
    yStart: number,
    yEnd: number,
    rx: number,
    rz: number,
    coils: number
  ) {
    super();
    this.yStart = yStart;
    this.yEnd = yEnd;
    this.rx = rx;
    this.rz = rz;
    this.coils = coils;
  }

  override getPoint(t: number, optionalTarget = new THREE.Vector3()): THREE.Vector3 {
    const theta = t * this.coils * Math.PI * 2;
    const x = Math.cos(theta) * this.rx;
    const y = this.yStart + (this.yEnd - this.yStart) * t;
    const z = Math.sin(theta) * this.rz;
    return optionalTarget.set(x, y, z);
  }
}

/**
 * M-03: Heavy Wide-Oval Stainless .338 LM Magazine Spring
 * assembledPos: [1.35, -3.28, 0] -> Spans Local Y in [-0.88, +0.88] -> World Y in [-4.16, -2.40] (flush!)
 * Built from a true parametric wide-oval 3D helix with uniform wire cross-section (zero non-uniform normal distortion!).
 */
export function buildAwmMagSpringGeometry(): THREE.BufferGeometry {
  const curve = new WideOvalHelixCurve(-0.84, 0.84, 2.38, 0.36, 5.5);
  const tube = new THREE.TubeGeometry(curve, 160, 0.048, 8, false);
  paintGeometry(tube, AWM_SPRING_STEEL);
  return sanitizeAwmMesh(finalizeGeometry(tube));
}

/**
 * M-04: Flared-Lip Detachable Steel Magazine Floorplate & Lock Button
 * assembledPos: [1.35, -4.20, 0] -> Local Y in [-0.22, +0.10] overlaps mag_body (-4.20) with ZERO GAP!
 */
export function buildAwmMagFloorplateGeometry(): THREE.BufferGeometry {
  const basePlateRaw = paintGeometry(
    new THREE.BoxGeometry(6.74, 0.18, 1.42).translate(0, -0.11, 0),
    AWM_DARK_STEEL
  );
  const buttonHole = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.14, 18).translate(0, -0.16, 0),
    AWM_INNER_DARK
  );
  const basePlate = csgSubtract(basePlateRaw, [buttonHole]);

  // Rolled inward retaining slide lips gripping magazine bottom flanges + flared extraction finger lips
  const slideRailL = paintGeometry(
    new THREE.BoxGeometry(6.38, 0.16, 0.14).translate(0, 0.02, -0.64),
    AWM_PARKERIZED
  );
  const slideRailR = paintGeometry(
    new THREE.BoxGeometry(6.38, 0.16, 0.14).translate(0, 0.02, 0.64),
    AWM_PARKERIZED
  );
  const frontFingerLip = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 1.42, 12)
      .rotateX(Math.PI / 2)
      .translate(3.36, -0.12, 0),
    AWM_DARK_STEEL
  );
  const rearFingerLip = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 1.42, 12)
      .rotateX(Math.PI / 2)
      .translate(-3.36, -0.12, 0),
    AWM_DARK_STEEL
  );
  const lockButton = paintGeometry(
    new THREE.CylinderGeometry(0.23, 0.23, 0.14, 18).translate(0, -0.15, 0),
    AWM_STAINLESS
  );
  return sanitizeAwmMesh(
    mergeParts([
      basePlate,
      slideRailL,
      slideRailR,
      frontFingerLip,
      rearFingerLip,
      lockButton,
    ])
  );
}
