import * as THREE from 'three';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';

export const DEAGLE_CHROME = '#b4c0ce';
export const DEAGLE_CHROME_MIRROR = '#c2cdd9';
export const DEAGLE_MILLED_DARK = '#252b36';
export const DEAGLE_RIFLING_DARK = '#2c3340'; // linear R = 0.025 < 0.12 -> maps to 'milled' UV swatch
export const DEAGLE_NITRIDE = '#454f5e';
export const DEAGLE_RUBBER = '#242830';

/**
 * Removes zero-area degenerate CSG sliver triangles (`‖(b - a) × (c - a)‖ < 1e-9`) and guarantees
 * unit-length vertex normals on every remaining vertex prior to custom UV-atlas projection.
 */
export function sanitizeCsgGeometry(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  if (!pos || !norm) return geo;

  const uv = geo.getAttribute('uv');
  const col = geo.getAttribute('color');
  const pArr = pos.array as Float32Array;
  const nArr = norm.array as Float32Array;
  const uvArr = uv ? (uv.array as Float32Array) : null;
  const colArr = col ? (col.array as Float32Array) : null;

  const triCount = Math.floor(pos.count / 3);
  const keepTris: number[] = [];
  let hasSliver = false;

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 9;
    const ax = pArr[i0 + 3] - pArr[i0];
    const ay = pArr[i0 + 4] - pArr[i0 + 1];
    const az = pArr[i0 + 5] - pArr[i0 + 2];
    const bx = pArr[i0 + 6] - pArr[i0];
    const by = pArr[i0 + 7] - pArr[i0 + 1];
    const bz = pArr[i0 + 8] - pArr[i0 + 2];
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const doubleArea = Math.hypot(cx, cy, cz);
    if (!Number.isFinite(doubleArea) || doubleArea < 1e-9) {
      hasSliver = true;
    } else {
      keepTris.push(t);
    }
  }

  if (!hasSliver) {
    for (let t = 0; t < triCount; t++) {
      const p0 = t * 9;
      const ax = pArr[p0 + 3] - pArr[p0];
      const ay = pArr[p0 + 4] - pArr[p0 + 1];
      const az = pArr[p0 + 5] - pArr[p0 + 2];
      const bx = pArr[p0 + 6] - pArr[p0];
      const by = pArr[p0 + 7] - pArr[p0 + 1];
      const bz = pArr[p0 + 8] - pArr[p0 + 2];
      const cx = ay * bz - az * by;
      const cy = az * bx - ax * bz;
      const cz = ax * by - ay * bx;
      const da = Math.hypot(cx, cy, cz) || 1;
      for (let k = 0; k < 3; k++) {
        const ni = p0 + k * 3;
        const len = Math.hypot(nArr[ni], nArr[ni + 1], nArr[ni + 2]);
        if (len > 1e-5 && Number.isFinite(len)) {
          nArr[ni] /= len;
          nArr[ni + 1] /= len;
          nArr[ni + 2] /= len;
        } else {
          nArr[ni] = cx / da;
          nArr[ni + 1] = cy / da;
          nArr[ni + 2] = cz / da;
        }
      }
    }
    norm.needsUpdate = true;
    return geo;
  }

  const outVerts = keepTris.length * 3;
  const outPos = new Float32Array(outVerts * 3);
  const outNorm = new Float32Array(outVerts * 3);
  const outUv = uvArr ? new Float32Array(outVerts * 2) : null;
  const outCol = colArr ? new Float32Array(outVerts * col!.itemSize) : null;
  const colStride = col ? col.itemSize : 3;

  for (let idx = 0; idx < keepTris.length; idx++) {
    const t = keepTris[idx];
    const srcP = t * 9;
    const dstP = idx * 9;
    for (let j = 0; j < 9; j++) outPos[dstP + j] = pArr[srcP + j];

    const ax = pArr[srcP + 3] - pArr[srcP];
    const ay = pArr[srcP + 4] - pArr[srcP + 1];
    const az = pArr[srcP + 5] - pArr[srcP + 2];
    const bx = pArr[srcP + 6] - pArr[srcP];
    const by = pArr[srcP + 7] - pArr[srcP + 1];
    const bz = pArr[srcP + 8] - pArr[srcP + 2];
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const da = Math.hypot(cx, cy, cz) || 1;

    for (let k = 0; k < 3; k++) {
      const sn = srcP + k * 3;
      const dn = dstP + k * 3;
      const len = Math.hypot(nArr[sn], nArr[sn + 1], nArr[sn + 2]);
      if (len > 1e-5 && Number.isFinite(len)) {
        outNorm[dn] = nArr[sn] / len;
        outNorm[dn + 1] = nArr[sn + 1] / len;
        outNorm[dn + 2] = nArr[sn + 2] / len;
      } else {
        outNorm[dn] = cx / da;
        outNorm[dn + 1] = cy / da;
        outNorm[dn + 2] = cz / da;
      }
    }

    if (outUv && uvArr) {
      const su = t * 6;
      const du = idx * 6;
      for (let j = 0; j < 6; j++) outUv[du + j] = uvArr[su + j];
    }
    if (outCol && colArr) {
      const sc = t * 3 * colStride;
      const dc = idx * 3 * colStride;
      for (let j = 0; j < 3 * colStride; j++) outCol[dc + j] = colArr[sc + j];
    }
  }

  const clean = new THREE.BufferGeometry();
  clean.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  clean.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  if (outUv) clean.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
  if (outCol) {
    clean.setAttribute('color', new THREE.BufferAttribute(outCol, colStride));
  }
  clean.computeBoundingBox();
  clean.computeBoundingSphere();
  geo.dispose();
  return clean;
}

/**
 * Unwraps Silver Chrome parts (Slide, Barrel, Frame) onto 2048x1024 deagle_chrome_{albedo,normal,roughness}.png:
 *  - Right (+Z) wall: u in [0.02, 0.98], v in [0.66, 0.97]
 *  - Left (-Z) wall:  u in [0.02, 0.98], v in [0.31, 0.62] (mirrored U so rollmarks read left-to-right!)
 *  - Dark milled recesses / bores / serration cuts (cr < 0.12): u in [0.745, 0.850], v in [0.03, 0.25]
 *  - Polished chrome top deck / scope slots / front strap:      u in [0.875, 0.985], v in [0.03, 0.25]
 */
export function applyDeagleChromeUVs(
  geo: THREE.BufferGeometry,
  opts: {
    xMin: number;
    xSpan: number;
    yMin: number;
    ySpan: number;
    uRightRange?: [number, number];
    uLeftRange?: [number, number];
    vRightRange?: [number, number];
    vLeftRange?: [number, number];
  }
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  const [uR0, uR1] = opts.uRightRange ?? [0.02, 0.98];
  const [uL0, uL1] = opts.uLeftRange ?? [0.02, 0.98];
  const [vR0, vR1] = opts.vRightRange ?? [0.66, 0.97];
  const [vL0, vL1] = opts.vLeftRange ?? [0.31, 0.62];

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);

    let mode: 'milled' | 'right' | 'left' | 'mirror_deck' = 'mirror_deck';
    if (cr < 0.12) {
      mode = 'milled';
    } else if (fnz > 0.34 && cz > 0.32) {
      mode = 'right';
    } else if (fnz < -0.34 && cz < -0.32) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - opts.xMin) / opts.xSpan);
      const yNorm = clamp01((y - opts.yMin) / opts.ySpan);

      let u: number;
      let v: number;
      if (mode === 'milled') {
        u = 0.745 + fractPos((x + z) * 0.12) * 0.105;
        v = 0.03 + fractPos(y * 0.18) * 0.22;
      } else if (mode === 'right') {
        u = uR0 + xNorm * (uR1 - uR0);
        v = vR0 + yNorm * (vR1 - vR0);
      } else if (mode === 'left') {
        u = uL0 + (1.0 - xNorm) * (uL1 - uL0);
        v = vL0 + yNorm * (vL1 - vL0);
      } else {
        u = 0.875 + xNorm * 0.11;
        v = 0.03 + clamp01((z + 1.5) / 3.0) * 0.22;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Wrap-Around Stippled Rubber Grip onto bottom-left swatch (u in [0.04, 0.70], v in [0.03, 0.26])
 * of 2048x1024 deagle_chrome_{albedo,normal,roughness}.png, centering the IMI/MRI Eagle medallion on both flanks.
 */
export function applyDeagleGripUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    const isSideFlank = Math.abs(fnz) > 0.35 && Math.abs(cz) > 0.65;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (isSideFlank) {
        const xNorm = clamp01((x - -9.2) / 5.4);
        const yNorm = clamp01((y - -10.15) / 8.8);
        u = fnz > 0 ? 0.2 + xNorm * 0.36 : 0.2 + (1.0 - xNorm) * 0.36;
        v = 0.04 + yNorm * 0.21;
      } else {
        // Backstrap & inner rubber surfaces avoid center medallion
        u = 0.06 + clamp01((z + 1.55) / 3.1) * 0.12;
        v = 0.04 + clamp01((y - -10.15) / 8.8) * 0.21;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * B-01: Iconic Desert Eagle Mark XIX 6" Fixed Triangular-Profile Barrel
 * Features overhanging Weaver/Picatinny scope rail w/ V-ridge side undercuts & 8 recoil cross-slots,
 * Mark XIX side lightening flutes, recessed .50 AE target muzzle crown + 6 helical polygonal rifling lands,
 * 4-lug rear barrel extension locking mortises, scooped polished feed ramp, diagonal under-bore gas bleed port,
 * longitudinal gas conduit & forward honed gas cylinder cup w/ front gas plug.
 */
export function buildDeagleBarrelGeometry(): THREE.BufferGeometry {
  // 1. Signature Mark XIX Triangular Barrel Cross-Section in (Z, Y) w/ overhanging Weaver/Picatinny scope rail
  const triSec = new THREE.Shape();
  triSec.moveTo(-1.38, 1.7);
  triSec.lineTo(1.38, 1.7);
  triSec.lineTo(1.38, 2.36);
  // Mark XIX flat angled triangular upper flanks tapering to recessed rail neck
  triSec.lineTo(0.84, 3.84);
  triSec.lineTo(0.76, 3.92);
  // Overhanging 21.2mm Weaver/Picatinny scope rail V-ridge
  triSec.lineTo(0.94, 4.03);
  triSec.lineTo(0.86, 4.16);
  triSec.lineTo(-0.86, 4.16);
  triSec.lineTo(-0.94, 4.03);
  triSec.lineTo(-0.76, 3.92);
  triSec.lineTo(-0.84, 3.84);
  triSec.lineTo(-1.38, 2.36);
  triSec.closePath();

  const barrelBody = new THREE.ExtrudeGeometry(triSec, {
    depth: 14.1,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 2,
    steps: 1,
  });
  barrelBody.rotateY(Math.PI / 2);
  barrelBody.translate(1.86, 0, 0);
  paintGeometry(barrelBody, DEAGLE_CHROME);

  // 2. Rear 4-Lug Cylindrical Barrel Extension Ring (seats inside slide breech X in [-0.62, +1.92])
  const chamberRing = paintGeometry(
    new THREE.CylinderGeometry(0.95, 0.95, 2.52, 28)
      .rotateZ(Math.PI / 2)
      .translate(0.64, 2.6, 0),
    DEAGLE_CHROME_MIRROR
  );

  // Scooped Polished .50 AE Wide Feed Ramp at rear-bottom of chamber throat
  const feedRampRaw = paintGeometry(
    new THREE.BoxGeometry(0.7, 0.74, 0.94)
      .rotateZ(0.52)
      .translate(-0.56, 1.78, 0),
    DEAGLE_CHROME_MIRROR
  );
  const rampScoop = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.44, 1.05, 18)
      .rotateZ(Math.PI / 2 - 0.5)
      .translate(-0.68, 2.02, 0),
    DEAGLE_CHROME_MIRROR
  );
  const feedRamp = csgSubtract(feedRampRaw, [rampScoop]);

  // 3. Under-Barrel Gas Conduit Web, Front Muzzle Gas Cylinder Block & Brazed Front Gas Plug
  // Note: Integral muzzle gas cylinder block sits at the front muzzle (X in [13.92, 15.92], Y = 1.48, R = 0.43),
  // while behind X = 13.92 the underside stays >= 1.82 so the slide's lower front crosspiece (X in [12.55, 13.85])
  // and forward-pointing gas piston stroke -4.95 cm rearward cleanly with zero collision!
  const gasConduitWeb = paintGeometry(
    new THREE.BoxGeometry(11.6, 0.24, 0.96).translate(8.95, 1.84, 0),
    DEAGLE_CHROME
  );
  const gasCylinderBoss = paintGeometry(
    new THREE.CylinderGeometry(0.43, 0.43, 1.96, 24)
      .rotateZ(Math.PI / 2)
      .translate(14.9, 1.48, 0),
    DEAGLE_CHROME
  );
  const frontGasPlug = paintGeometry(
    new THREE.CylinderGeometry(0.34, 0.34, 0.28, 20)
      .rotateZ(Math.PI / 2)
      .translate(15.78, 1.48, 0),
    DEAGLE_CHROME_MIRROR
  );

  // Bottom Frame Locking Lug (latches onto rotating takedown cross-shaft at X = 3.15, Y = 0.36)
  const lockLugShape = new THREE.Shape();
  lockLugShape.moveTo(2.42, 1.82);
  lockLugShape.lineTo(3.92, 1.82);
  lockLugShape.lineTo(3.78, 0.45);
  lockLugShape.lineTo(2.56, 0.45);
  lockLugShape.closePath();
  const lockLug = new THREE.ExtrudeGeometry(lockLugShape, {
    depth: 0.92,
    bevelEnabled: false,
  });
  lockLug.translate(0, 0, -0.46);
  paintGeometry(lockLug, DEAGLE_CHROME);

  const rawBarrel = csgUnion([
    barrelBody,
    chamberRing,
    feedRamp,
    gasConduitWeb,
    gasCylinderBoss,
    frontGasPlug,
    lockLug,
  ]);

  const cutters: THREE.BufferGeometry[] = [];

  // Massive .50 Action Express (12.7mm) Hollow Bore & Stepped Chamber Pocket
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.545, 0.545, 17.2, 28)
        .rotateZ(Math.PI / 2)
        .translate(7.7, 2.6, 0),
      DEAGLE_MILLED_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.59, 0.59, 2.45, 24)
        .rotateZ(Math.PI / 2)
        .translate(0.68, 2.6, 0),
      DEAGLE_MILLED_DARK
    )
  );

  // 4-Lug Barrel Extension Locking Mortises at rear of chamber (receives rotating bolt lugs!)
  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2 + Math.PI / 4;
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.62, 0.46, 0.42)
          .translate(-0.28, 0.66, 0)
          .rotateX(ang)
          .translate(0, 2.6, 0),
        DEAGLE_MILLED_DARK
      )
    );
  }

  // Recessed 11° Target Muzzle Crown Dish + Outer Crown Step at X = +16.0
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.69, 0.535, 0.22, 30)
        .rotateZ(Math.PI / 2)
        .translate(15.94, 2.6, 0),
      DEAGLE_MILLED_DARK
    )
  );

  // Sleek Desert Eagle Angled Muzzle Face Bevel at lower front corner
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.85, 1.4, 3.2)
        .rotateZ(0.24)
        .translate(16.32, 1.95, 0),
      DEAGLE_CHROME_MIRROR
    )
  );

  // 8 Integral Mark XIX Top Picatinny / Weaver Scope Cross-Slots (X = 3.25 .. 12.21)
  for (let i = 0; i < 8; i++) {
    const sx = 3.25 + i * 1.28;
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.52, 0.22, 2.08).translate(sx, 4.12, 0),
        DEAGLE_MILLED_DARK
      )
    );
  }

  // Front Sight Dovetail Slot at X = 15.05
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.56, 0.14, 2.02).translate(15.05, 4.13, 0),
      DEAGLE_MILLED_DARK
    )
  );

  // Mark XIX Signature Side Lightening Flutes along both angled triangular flanks
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.23, 0.23, 9.1, 18)
          .rotateZ(Math.PI / 2)
          .rotateX(sign * 0.32)
          .translate(8.85, 2.98, sign * 1.15),
        DEAGLE_CHROME_MIRROR
      )
    );
  }

  // Rearward-opening Honed Gas Cylinder Bore at Front Muzzle (receives Slide's forward-pointing gas piston at Y = 1.48!)
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.345, 0.345, 1.76, 22)
        .rotateZ(Math.PI / 2)
        .translate(14.72, 1.48, 0),
      DEAGLE_MILLED_DARK
    )
  );
  // Shallow semi-cylindrical piston clearance arch behind X = 13.92 (clears r=0.325 piston head on -4.95 recoil!)
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.345, 0.345, 5.4, 20)
        .rotateZ(Math.PI / 2)
        .translate(11.22, 1.48, 0),
      DEAGLE_MILLED_DARK
    )
  );

  // Diagonal Under-Bore Gas Bleed Port + Longitudinal Gas Conduit feeding front muzzle gas plenum (X = 15.45)!
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.09, 0.09, 0.62, 14)
        .rotateZ(-0.52)
        .translate(3.55, 2.05, 0),
      DEAGLE_MILLED_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.075, 0.075, 11.98, 14)
        .rotateZ(Math.PI / 2)
        .translate(9.49, 1.95, 0),
      DEAGLE_MILLED_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.09, 0.09, 0.55, 12).translate(
        15.45,
        1.72,
        0
      ),
      DEAGLE_MILLED_DARK
    )
  );

  // Semicircular Takedown Cross-Cam Notch in lower barrel lug
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.26, 0.26, 1.2, 18)
        .rotateX(Math.PI / 2)
        .translate(3.15, 0.45, 0),
      DEAGLE_MILLED_DARK
    )
  );

  const hollowedBarrel = csgSubtract(rawBarrel, cutters);

  // 6 Right-Hand Helical Hexagonal Polygonal Rifling Lands inside 6" .50 AE Bore (1:19" twist)
  const riflingLands: THREE.BufferGeometry[] = [];
  const xStart = 2.05;
  const xEnd = 15.72;
  const totalTwist = ((xEnd - xStart) / 48.26) * Math.PI * 2;
  for (let k = 0; k < 6; k++) {
    const basePhi = (k * Math.PI * 2) / 6;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      const x = xStart + (xEnd - xStart) * t;
      const phi = basePhi + totalTwist * t;
      pts.push(
        new THREE.Vector3(x, 2.6 + Math.cos(phi) * 0.53, Math.sin(phi) * 0.53)
      );
    }
    const landCurve = new THREE.CatmullRomCurve3(pts);
    riflingLands.push(
      paintGeometry(
        new THREE.TubeGeometry(landCurve, 16, 0.032, 6, false),
        DEAGLE_RIFLING_DARK
      )
    );
  }

  return applyDeagleChromeUVs(
    sanitizeCsgGeometry(mergeParts([hollowedBarrel, ...riflingLands])),
    {
      xMin: -9.6,
      xSpan: 25.6,
      yMin: 0.85,
      ySpan: 3.35,
    }
  );
}

/**
 * B-02: Open-Top Bridge Slide with Integrated Forward-Pointing Mark XIX Short-Stroke Gas Piston
 * Rear breech block houses the 4-lug rotating bolt & internal helical cam-pin slot;
 * twin lower chrome bridge bars run forward alongside the stationary barrel to the lower front crosspiece
 * (`X in [12.55, 13.85]`, behind the barrel's muzzle gas block), cantilevering the forward-pointing (`+X`)
 * stainless gas piston w/ 3 labyrinth gas-sealing rings into the barrel's honed muzzle gas cylinder!
 */
export function buildDeagleSlideGeometry(): THREE.BufferGeometry {
  const slideSec = new THREE.Shape();
  slideSec.moveTo(-1.41, 0.88);
  slideSec.lineTo(1.41, 0.88);
  slideSec.lineTo(1.41, 2.38);
  slideSec.lineTo(0.86, 3.98);
  slideSec.lineTo(0.86, 4.16);
  slideSec.lineTo(-0.86, 4.16);
  slideSec.lineTo(-0.86, 3.98);
  slideSec.lineTo(-1.41, 2.38);
  slideSec.closePath();

  const rawHull = new THREE.ExtrudeGeometry(slideSec, {
    depth: 23.34,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 2,
    steps: 1,
  });
  rawHull.rotateY(Math.PI / 2);
  rawHull.translate(-9.52, 0, 0);
  paintGeometry(rawHull, DEAGLE_CHROME);

  const cutters: THREE.BufferGeometry[] = [];

  // 1. Massive Open-Top Barrel Window (X >= 1.85, Y > 1.64 clears stationary barrel underside across full recoil!)
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(12.2, 2.92, 3.2).translate(7.95, 3.1, 0),
      DEAGLE_CHROME_MIRROR
    )
  );

  // Center channel between twin forward bridge bars (X in [+1.85, +12.55]), leaving solid front crosspiece [12.55, 13.85]
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(10.7, 1.02, 1.74).translate(7.2, 1.28, 0),
      DEAGLE_MILLED_DARK
    )
  );

  // 2. Wide Flared Right-Top Ejection Cutout in Rear Breech Hood (X in [-0.62, +1.88])
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.52, 1.45, 2.05).translate(0.64, 3.65, 0.35),
      DEAGLE_MILLED_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.52, 1.85, 1.65).translate(0.64, 2.82, 0.85),
      DEAGLE_MILLED_DARK
    )
  );

  // 3. Internal Bolt Carrier Tunnel + Helical Cam-Pin Slot in Carrier Ceiling + Lower Frame Rail T-Grooves
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(1.02, 1.02, 10.6, 28)
        .rotateZ(Math.PI / 2)
        .translate(-3.1, 2.6, 0),
      DEAGLE_MILLED_DARK
    )
  );
  // Helical cam track milled inside upper bolt-carrier roof (converts carrier stroke to 39° bolt rotation!)
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(1.42, 0.42, 0.56)
        .rotateY(0.46)
        .translate(-2.45, 3.32, -0.18),
      DEAGLE_MILLED_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(11.6, 1.05, 1.98).translate(-3.75, 1.28, 0),
      DEAGLE_MILLED_DARK
    )
  );
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(23.8, 0.22, 0.34).translate(
          2.2,
          1.01,
          sign * 1.04
        ),
        DEAGLE_MILLED_DARK
      )
    );
  }

  // Rear Hammer Strike Slot (allows exposed SA spur hammer to swing into firing pin at Y = 2.60!)
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.05, 2.35, 0.68).translate(-8.85, 2.15, 0),
      DEAGLE_MILLED_DARK
    )
  );

  // Angled Rear Slide Profile Bevel + Angled Front Crosspiece Chin Bevel
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(1.2, 3.8, 3.2)
        .rotateZ(-0.18)
        .translate(-9.92, 2.5, 0),
      DEAGLE_CHROME_MIRROR
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.75, 1.6, 3.2)
        .rotateZ(0.24)
        .translate(14.12, 1.25, 0),
      DEAGLE_CHROME_MIRROR
    )
  );

  // Twin Front Recoil Rod Seat Bores at Y = 1.18, Z = ±0.48 over X in [12.40, 13.90]
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.22, 0.22, 1.5, 18)
          .rotateZ(Math.PI / 2)
          .translate(13.15, 1.18, sign * 0.48),
        DEAGLE_MILLED_DARK
      )
    );
  }

  // Transverse Safety Drum Bore at X = -7.35, Y = 2.68 + Rear Sight Dovetail at X = -7.85
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.42, 0.42, 3.1, 22)
        .rotateX(Math.PI / 2)
        .translate(-7.35, 2.68, 0),
      DEAGLE_MILLED_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.58, 0.15, 2.1).translate(-7.85, 4.13, 0),
      DEAGLE_MILLED_DARK
    )
  );

  // Left-side Slide Stop Catch Notch at X = -2.65
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.72, 0.46, 0.55).translate(-2.65, 1.02, -1.25),
      DEAGLE_MILLED_DARK
    )
  );

  // 9 Crisp Angled (-14°) Desert Eagle Rear Cocking Serrations on Left & Right Breech Walls
  for (let i = 0; i < 9; i++) {
    const sx = -8.35 + i * 0.42;
    for (const sign of [-1, 1]) {
      cutters.push(
        paintGeometry(
          new THREE.BoxGeometry(0.19, 1.68, 0.22)
            .rotateZ(-0.24)
            .translate(sx, 1.98, sign * 1.4),
          DEAGLE_MILLED_DARK
        )
      );
    }
  }

  const carvedSlide = csgSubtract(rawHull, cutters);

  // 4. Integrated Forward-Pointing (+X) Mark XIX Stainless Gas Piston Rod w/ 3 Gas-Sealing Labyrinth Lands
  // Cantilevered forward from front crosspiece (X = 13.85) to 15.41 inside the [13.84, 15.60] honed gas cylinder!
  const pistonRoot = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 0.4, 22)
      .rotateZ(Math.PI / 2)
      .translate(13.7, 1.44, 0),
    DEAGLE_CHROME_MIRROR
  );
  const pistonNeck = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.2, 1.04, 22)
      .rotateZ(Math.PI / 2)
      .translate(14.34, 1.48, 0),
    DEAGLE_CHROME_MIRROR
  );
  const pistonHeadRaw = paintGeometry(
    new THREE.CylinderGeometry(0.325, 0.325, 0.54, 24)
      .rotateZ(Math.PI / 2)
      .translate(15.1, 1.48, 0),
    '#c8b28a' // Subtle warm heat-tinted hard chrome piston head!
  );
  // Carve 2 labyrinth gas-ring grooves around piston head circumference -> 3 distinct sealing lands!
  const ringGrooves: THREE.BufferGeometry[] = [];
  for (const gx of [14.99, 15.21]) {
    const ringOuter = paintGeometry(
      new THREE.CylinderGeometry(0.35, 0.35, 0.055, 24)
        .rotateZ(Math.PI / 2)
        .translate(gx, 1.48, 0),
      DEAGLE_MILLED_DARK
    );
    const ringCore = paintGeometry(
      new THREE.CylinderGeometry(0.275, 0.275, 0.12, 24)
        .rotateZ(Math.PI / 2)
        .translate(gx, 1.48, 0),
      DEAGLE_MILLED_DARK
    );
    ringGrooves.push(csgSubtract(ringOuter, [ringCore]));
  }
  const pistonHead = csgSubtract(pistonHeadRaw, ringGrooves);

  const pistonCarbonFace = paintGeometry(
    new THREE.CylinderGeometry(0.31, 0.31, 0.06, 22)
      .rotateZ(Math.PI / 2)
      .translate(15.38, 1.48, 0),
    DEAGLE_MILLED_DARK
  );

  const fullSlide = sanitizeCsgGeometry(
    csgUnion([
      carvedSlide,
      pistonRoot,
      pistonNeck,
      pistonHead,
      pistonCarbonFace,
    ])
  );

  return applyDeagleChromeUVs(fullSlide, {
    xMin: -9.6,
    xSpan: 25.6,
    yMin: 0.85,
    ySpan: 3.35,
  });
}

/**
 * B-03: Rifle-Style 4-Lug Rotating Bolt Head (assembledPos: [-1.45, 2.60, 0])
 * Centered strictly on bore axis (Y = 2.60, Z = 0) so rotating rx in firing kinematics spins concentrically!
 */
export function buildDeagleBoltGeometry(): THREE.BufferGeometry {
  const stem = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.62, 2.88, 28)
      .rotateZ(Math.PI / 2)
      .translate(-0.48, 0, 0),
    DEAGLE_CHROME_MIRROR
  );

  // Longitudinal carrier guide & anti-friction ribs along bolt stem
  const guideRibTop = paintGeometry(
    new THREE.BoxGeometry(1.72, 0.14, 0.24).translate(-0.62, 0.62, 0),
    DEAGLE_CHROME
  );
  const stripLugBottom = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.22, 0.28).translate(0.38, -0.64, 0),
    DEAGLE_CHROME
  );

  // 4 Heavy Radial Locking Lugs w/ chamfered leading locking shoulders (lx in [+0.68, +1.22])
  const lugs: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2 + Math.PI / 4;
    const lug = paintGeometry(
      new THREE.BoxGeometry(0.54, 0.43, 0.39)
        .translate(0.95, 0.66, 0)
        .rotateX(ang),
      DEAGLE_CHROME
    );
    lugs.push(lug);
  }

  // Spring-loaded Ejector Plunger Pin protruding on left-lower .50 AE bolt face
  const ejectorPin = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.26, 14)
      .rotateZ(Math.PI / 2)
      .translate(1.18, -0.18, -0.24),
    '#94a3b8'
  );

  const solidBolt = mergeParts([
    stem,
    guideRibTop,
    stripLugBottom,
    ...lugs,
    ejectorPin,
  ]);

  // Recessed .50 AE Rebated-Rim Bolt Face + Firing Pin Bore + Extractor Pocket + Cam Pin Cross-Bore
  const facePocket = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.48, 0.22, 24)
      .rotateZ(Math.PI / 2)
      .translate(1.18, 0, 0),
    DEAGLE_MILLED_DARK
  );
  const fpBore = paintGeometry(
    new THREE.CylinderGeometry(0.135, 0.135, 3.85, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.3, 0, 0),
    DEAGLE_MILLED_DARK
  );
  const extSlot = paintGeometry(
    new THREE.BoxGeometry(1.42, 0.36, 0.46).translate(0.62, 0.08, 0.56),
    DEAGLE_MILLED_DARK
  );
  const camHole = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 1.42, 18).translate(-0.8, 0.25, 0),
    DEAGLE_MILLED_DARK
  );

  return csgSubtract(solidBolt, [facePocket, fpBore, extSlot, camHole]);
}

/** B-04: Bolt Helical Cam Control Pin (assembledPos: [-2.25, 2.60, 0]) */
export function buildDeagleCamPinGeometry(): THREE.BufferGeometry {
  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 0.94, 20).translate(0, 0.16, 0),
    DEAGLE_CHROME_MIRROR
  );
  // Helical-follower rectangular cam head w/ radiused bearing flanks
  const headShape = new THREE.Shape();
  headShape.moveTo(-0.28, -0.22);
  headShape.lineTo(0.28, -0.22);
  headShape.quadraticCurveTo(0.32, 0, 0.28, 0.22);
  headShape.lineTo(-0.28, 0.22);
  headShape.quadraticCurveTo(-0.32, 0, -0.28, -0.22);
  headShape.closePath();
  const camHead = new THREE.ExtrudeGeometry(headShape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  camHead.rotateX(Math.PI / 2);
  camHead.translate(0, 0.84, 0);
  paintGeometry(camHead, DEAGLE_CHROME);

  // Transverse firing-pin interlock pass-through bore
  const fpPassHole = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 0.65, 16)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    DEAGLE_MILLED_DARK
  );
  return csgSubtract(mergeParts([shaft, camHead]), [fpPassHole]);
}

/** B-05: Triangular Anti-Fouling Stainless Firing Pin, Stop Plate & Return Spring (assembledPos: [-4.55, 2.60, 0]) */
export function buildDeagleFiringPinGeometry(): THREE.BufferGeometry {
  // Authentic triangular-fluted front needle section (prevents gas carbon seizing!)
  const needleTip = paintGeometry(
    new THREE.CylinderGeometry(0.068, 0.095, 0.65, 16)
      .rotateZ(Math.PI / 2)
      .translate(3.92, 0, 0),
    DEAGLE_CHROME_MIRROR
  );
  const triFlutedNeedle = paintGeometry(
    new THREE.CylinderGeometry(0.115, 0.13, 1.15, 3)
      .rotateZ(Math.PI / 2)
      .translate(3.08, 0, 0),
    DEAGLE_CHROME_MIRROR
  );
  const bodyShaftRaw = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 5.4, 20)
      .rotateZ(Math.PI / 2)
      .translate(-0.05, 0, 0),
    DEAGLE_CHROME
  );
  // Safety-drum lock flat near rear of firing pin
  const safetyNotch = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.14, 0.38).translate(-2.8, 0.14, 0),
    DEAGLE_MILLED_DARK
  );
  const bodyShaft = csgSubtract(bodyShaftRaw, [safetyNotch]);

  const stopCollar = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 0.28, 20)
      .rotateZ(Math.PI / 2)
      .translate(-2.45, 0, 0),
    DEAGLE_CHROME_MIRROR
  );
  const strikeHead = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 1.38, 20)
      .rotateZ(Math.PI / 2)
      .translate(-3.58, 0, 0),
    DEAGLE_NITRIDE
  );
  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -2.28,
      end: 1.95,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.23,
      wireRadius: 0.036,
      coils: 17,
    }),
    '#94a3b8'
  );
  return mergeParts([
    needleTip,
    triFlutedNeedle,
    bodyShaft,
    stopCollar,
    strikeHead,
    returnSpring,
  ]);
}

/**
 * B-06: Bolt-Head Claw Extractor & Plunger (assembledPos: [-0.85, 2.60, 0])
 * Offset in local Z (+0.54) so rx rotation around bore centerline orbits cleanly with deagle_bolt!
 */
export function buildDeagleExtractorGeometry(): THREE.BufferGeometry {
  const bar = paintGeometry(
    new THREE.BoxGeometry(1.34, 0.28, 0.24).translate(0, 0.08, 0.54),
    DEAGLE_NITRIDE
  );
  const clawRaw = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.32, 0.36).translate(0.58, 0.08, 0.42),
    '#586476'
  );
  const rimGroove = paintGeometry(
    new THREE.BoxGeometry(0.14, 0.36, 0.16).translate(0.45, 0.08, 0.28),
    DEAGLE_MILLED_DARK
  );
  const claw = csgSubtract(clawRaw, [rimGroove]);

  const pivotBoss = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 0.32, 16).translate(
      -0.25,
      0.08,
      0.52
    ),
    DEAGLE_NITRIDE
  );
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.96,
      end: -0.5,
      centerY: 0.08,
      centerZ: 0.5,
      coilRadius: 0.1,
      wireRadius: 0.022,
      coils: 6,
    }),
    '#94a3b8'
  );
  return mergeParts([bar, claw, pivotBoss, spring]);
}

/**
 * B-07: Slide-Mounted Ambidextrous Tear-Drop Safety Levers & Rotary Blocking Drum
 * (assembledPos: [-7.35, 2.68, 0])
 */
export function buildDeagleSafetyGeometry(): THREE.BufferGeometry {
  const drumRaw = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 2.86, 24).rotateX(Math.PI / 2),
    DEAGLE_NITRIDE
  );
  // Firing-pin clearance channel + hammer-blocking flat milled into rotary safety drum
  const fpPassCut = paintGeometry(
    new THREE.BoxGeometry(0.85, 0.32, 0.46).translate(0.18, -0.08, 0),
    '#262c36'
  );
  const drum = csgSubtract(drumRaw, [fpPassCut]);

  // Sculpted forward-swept Desert Eagle tear-drop lever profile
  const leverShape = new THREE.Shape();
  leverShape.moveTo(-0.35, -0.32);
  leverShape.quadraticCurveTo(0.45, -0.42, 1.44, -0.18);
  leverShape.quadraticCurveTo(1.7, 0.02, 1.4, 0.28);
  leverShape.quadraticCurveTo(0.45, 0.38, -0.35, 0.32);
  leverShape.quadraticCurveTo(-0.52, 0, -0.35, -0.32);
  leverShape.closePath();

  const levers: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    const wing = new THREE.ExtrudeGeometry(leverShape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    wing.translate(0, 0, sign > 0 ? 1.38 : -1.56);
    paintGeometry(wing, DEAGLE_NITRIDE);

    // Serrated raised teardrop thumb pad + central retention screw head
    const padRaw = paintGeometry(
      new THREE.CylinderGeometry(0.28, 0.28, 0.14, 18)
        .scale(1.35, 0.85, 1)
        .rotateX(Math.PI / 2)
        .translate(1.14, -0.02, sign * 1.56),
      '#586476'
    );
    const padSerrs: THREE.BufferGeometry[] = [];
    for (let i = -1; i <= 1; i++) {
      padSerrs.push(
        paintGeometry(
          new THREE.BoxGeometry(0.68, 0.045, 0.08).translate(
            1.14,
            -0.02 + i * 0.09,
            sign * 1.62
          ),
          '#262c36'
        )
      );
    }
    const screwHead = paintGeometry(
      new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14)
        .rotateX(Math.PI / 2)
        .translate(0, 0, sign * 1.57),
      '#586476'
    );
    levers.push(wing, csgSubtract(padRaw, padSerrs), screwHead);
  }

  return mergeParts([drum, ...levers]);
}

/** B-08: Dovetail Combat Sloped Ramp Front Sight (assembledPos: [15.05, 4.16, 0]) */
export function buildDeagleFrontSightGeometry(): THREE.BufferGeometry {
  const dovetail = paintGeometry(
    new THREE.BoxGeometry(0.52, 0.14, 1.32).translate(0, -0.05, 0),
    '#3b4452'
  );

  const rampShape = new THREE.Shape();
  rampShape.moveTo(-0.52, 0);
  rampShape.lineTo(0.52, 0);
  rampShape.lineTo(0.22, 0.52);
  rampShape.lineTo(-0.48, 0.52);
  rampShape.closePath();

  const blade = new THREE.ExtrudeGeometry(rampShape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  blade.translate(0, 0, -0.14);
  paintGeometry(blade, DEAGLE_NITRIDE);

  const tritiumDot = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.04, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.5, 0.32, 0),
    '#f8fafc'
  );

  return mergeParts([dovetail, blade, tritiumDot]);
}

/** B-09: Dovetail Combat Square-Notch Rear Sight (assembledPos: [-7.85, 4.16, 0]) */
export function buildDeagleRearSightGeometry(): THREE.BufferGeometry {
  const dovetail = paintGeometry(
    new THREE.BoxGeometry(0.54, 0.14, 1.56).translate(0, -0.05, 0),
    '#3b4452'
  );

  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-0.52, 0);
  bodyShape.lineTo(0.56, 0);
  bodyShape.lineTo(0.32, 0.52);
  bodyShape.lineTo(-0.48, 0.52);
  bodyShape.closePath();

  const body = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 1.62,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  body.translate(0, 0, -0.81);
  paintGeometry(body, DEAGLE_NITRIDE);

  const squareNotch = paintGeometry(
    new THREE.BoxGeometry(1.3, 0.3, 0.42).translate(0, 0.42, 0),
    '#262c36'
  );
  const slotted = csgSubtract(mergeParts([dovetail, body]), [squareNotch]);

  const dotL = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.04, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.5, 0.3, -0.38),
    '#f8fafc'
  );
  const dotR = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.04, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.5, 0.3, 0.38),
    '#f8fafc'
  );

  return mergeParts([slotted, dotL, dotR]);
}

/**
 * B-10: Dual Parallel Telescoping Stainless Recoil Guide Rods & Figure-8 Retainer Yoke Plate
 * (assembledPos: [0, 0, 0])
 */
export function buildDeagleRecoilRodsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (const sign of [-1, 1]) {
    const zPos = sign * 0.48;
    // Inner solid stainless rod + outer captive telescoping guide tube (front tips seat inside [12.55, 13.85] slide crosspiece bores!)
    const innerShaft = paintGeometry(
      new THREE.CylinderGeometry(0.135, 0.135, 11.36, 20)
        .rotateZ(Math.PI / 2)
        .translate(7.9, 1.18, zPos),
      DEAGLE_CHROME_MIRROR
    );
    const outerSleeve = paintGeometry(
      new THREE.CylinderGeometry(0.18, 0.18, 4.95, 20)
        .rotateZ(Math.PI / 2)
        .translate(4.92, 1.18, zPos),
      DEAGLE_CHROME
    );
    const rearHead = paintGeometry(
      new THREE.CylinderGeometry(0.26, 0.26, 0.2, 20)
        .rotateZ(Math.PI / 2)
        .translate(2.14, 1.18, zPos),
      DEAGLE_CHROME_MIRROR
    );
    const frontTip = paintGeometry(
      new THREE.CylinderGeometry(0.12, 0.155, 0.28, 18)
        .rotateZ(Math.PI / 2)
        .translate(13.58, 1.18, zPos),
      DEAGLE_CHROME_MIRROR
    );
    parts.push(innerShaft, outerSleeve, rearHead, frontTip);
  }

  // Iconic Figure-8 Machined Steel Recoil Spring Retainer Yoke Plate at X = 2.32
  // Relieved at top-center to hug underneath the barrel's gas belly!
  const plateBridge = paintGeometry(
    new THREE.BoxGeometry(0.2, 0.64, 1.68).translate(2.32, 1.18, 0),
    DEAGLE_CHROME
  );
  const ringL = paintGeometry(
    new THREE.CylinderGeometry(0.37, 0.37, 0.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(2.32, 1.18, -0.48),
    DEAGLE_CHROME
  );
  const ringR = paintGeometry(
    new THREE.CylinderGeometry(0.37, 0.37, 0.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(2.32, 1.18, 0.48),
    DEAGLE_CHROME
  );
  const yokeRaw = mergeParts([plateBridge, ringL, ringR]);
  const topSaddleCut = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 0.32, 16)
      .rotateZ(Math.PI / 2)
      .translate(2.32, 1.54, 0),
    DEAGLE_MILLED_DARK
  );
  parts.push(csgSubtract(yokeRaw, [topSaddleCut]));

  return sanitizeCsgGeometry(mergeParts(parts));
}

/**
 * B-11: Twin Parallel Multi-Strand Helical Recoil Springs (assembledPos: [0, 0, 0])
 * Spans X in [2.46, 12.50] (L0 = 10.04) at Y = 1.18, Z = ±0.48; compresses smoothly on recoil!
 */
export function buildDeagleRecoilSpringsGeometry(): THREE.BufferGeometry {
  const springL = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 2.46,
      end: 12.5,
      centerY: 1.18,
      centerZ: -0.48,
      coilRadius: 0.245,
      wireRadius: 0.044,
      coils: 20,
    }),
    '#9aa8ba'
  );
  const springR = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 2.46,
      end: 12.5,
      centerY: 1.18,
      centerZ: 0.48,
      coilRadius: 0.245,
      wireRadius: 0.044,
      coils: 20,
    }),
    '#9aa8ba'
  );
  return mergeParts([springL, springR]);
}
