import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import { applyBarrelAtlasUVs, applySlideAtlasUVs } from './uvAtlasHelper';

/**
 * Filters out zero-area degenerate CSG sliver triangles (`‖(b - a) × (c - a)‖ < 1e-9`) and ensures
 * strictly unit-length vertex normals (`‖n‖ = 1`) before custom PBR UV-atlas projection.
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
 * U-01: 1:1 Gen3 G17 Tenifer/nDLC Nitride Steel Slide
 * Features radiused top-shoulder bevels, Gen3 bullnose muzzle tapers, protruding front recoil chin,
 * internal barrel-hood tilt clearance vault, breech face w/ rectangular striker aperture, left ejector
 * rail slot, stepped LCI extractor pocket, 7 rear cocking serrations, and 2K PBR atlas UVs.
 */
export function buildSlideGeometry(): THREE.BufferGeometry {
  const SLIDE_OUTER = '#454f5e';
  const SLIDE_MILLED = '#242933';
  const SLIDE_CHAMFER = '#586476';

  // Smooth radiused Glock slab-side cross-section in (Z, Y) extruded along +X
  const profile = new THREE.Shape();
  profile.moveTo(-1.24, 0.85);
  profile.lineTo(1.24, 0.85);
  profile.quadraticCurveTo(1.28, 0.85, 1.28, 0.92);
  profile.lineTo(1.28, 2.98);
  // Characteristic smooth radiused Glock upper shoulder bevels
  profile.bezierCurveTo(1.28, 3.22, 1.14, 3.45, 0.92, 3.45);
  profile.lineTo(-0.92, 3.45);
  profile.bezierCurveTo(-1.14, 3.45, -1.28, 3.22, -1.28, 2.98);
  profile.lineTo(-1.28, 0.92);
  profile.quadraticCurveTo(-1.28, 0.85, -1.24, 0.85);
  profile.closePath();

  const rawSlideSlab = new THREE.ExtrudeGeometry(profile, {
    depth: 18.6,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 2,
    curveSegments: 14,
    steps: 1,
  });
  rawSlideSlab.rotateY(Math.PI / 2);
  rawSlideSlab.translate(-7.5, 0, 0);
  paintGeometry(rawSlideSlab, SLIDE_OUTER);

  // Authentic protruding U-shaped front recoil-spring chin collar (nests inside frame dust cover U-channel)
  const chinBoss = paintGeometry(
    new THREE.CylinderGeometry(0.66, 0.66, 1.18, 28)
      .rotateZ(Math.PI / 2)
      .translate(10.47, 1.12, 0),
    SLIDE_OUTER
  );

  const rawSlide = csgUnion([rawSlideSlab, chinBoss]);

  const cutters: THREE.BufferGeometry[] = [];

  // 1. Underside cutout behind dust-cover recoil chin + frame rail slots
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(9.55, 0.98, 1.94).translate(-2.85, 1.26, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(17.3, 0.2, 2.24).translate(1.0, 1.06, 0),
      SLIDE_MILLED
    )
  );

  // 2. Barrel tunnel (r=0.76 for clean Browning tilt clearance) + internal hood clearance vault
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.76, 0.76, 12.1, 32)
        .rotateZ(Math.PI / 2)
        .translate(5.35, 2.55, 0),
      SLIDE_MILLED
    )
  );
  // Internal upper vault ahead of ejection port so dropped locking hood never clips slide ceiling during recoil
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(7.3, 1.36, 1.68).translate(6.2, 2.56, 0),
      SLIDE_MILLED
    )
  );

  // Recoil spring tunnel + Guide rod front bore + central web clearance
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.5, 0.5, 9.3, 28)
        .rotateZ(Math.PI / 2)
        .translate(6.2, 1.38, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.37, 0.37, 1.3, 24)
        .rotateZ(Math.PI / 2)
        .translate(10.9, 1.35, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(9.0, 1.1, 1.18).translate(6.15, 1.95, 0),
      SLIDE_MILLED
    )
  );

  // 3. Open Ejection Port with lowered right-wall flare & angled brass-clearance bevel
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(3.12, 0.88, 1.64).translate(1.03, 3.25, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(3.12, 1.5, 1.5).translate(1.03, 2.8, 0.68),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(3.16, 0.42, 0.42)
        .rotateX(0.65)
        .translate(1.03, 2.08, 1.25),
      SLIDE_CHAMFER
    )
  );

  // Breech face pocket + rectangular Glock firing-pin aperture + left ejector clearance rail groove
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.45, 0.24, 0.09).translate(-0.55, 2.55, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(7.2, 0.68, 0.22).translate(-3.95, 1.62, -0.34),
      SLIDE_MILLED
    )
  );

  // 4. Stepped External Extractor & Gen3 LCI pocket on right wall behind ejection port
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(1.3, 0.56, 0.68).translate(-1.08, 2.55, 1.08),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.76, 0.34, 0.28).translate(-0.95, 2.55, 1.24),
      SLIDE_MILLED
    )
  );

  // 5. Rear Striker channel + Sear slot + Firing-pin safety vertical bore + Extractor plunger channel
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.33, 0.33, 7.3, 24)
        .rotateZ(Math.PI / 2)
        .translate(-4.1, 2.55, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(3.55, 1.2, 0.34).translate(-5.85, 1.95, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 1.65, 20).translate(
        -2.1,
        2.12,
        0.28
      ),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.22, 0.22, 6.2, 24)
        .rotateZ(Math.PI / 2)
        .translate(-4.55, 2.55, 0.72),
      SLIDE_MILLED
    )
  );

  // Rear slide cover-plate vertical T-slot recess at X = -7.52
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.24, 2.15, 1.88).translate(-7.5, 2.22, 0),
      SLIDE_MILLED
    )
  );

  // Front sight oval mounting hole (X = +10.15) & Rear sight dovetail cut (X = -6.45)
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.12, 0.12, 0.36, 16).translate(
        10.15,
        3.38,
        0
      ),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.54, 0.16, 2.6).translate(-6.45, 3.42, 0),
      SLIDE_MILLED
    )
  );

  // 6. Left-side Slide Stop Notch
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.66, 0.48, 0.5).translate(-2.65, 1.02, -1.18),
      SLIDE_MILLED
    )
  );

  // 7. Gen3 Bullnose front bevels (sleek tapered muzzle corners)
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.45, 2.9, 0.85)
          .rotateY(-sign * 0.38)
          .translate(11.18, 2.2, sign * 1.38),
        SLIDE_CHAMFER
      )
    );
  }

  // 8. 7 Deep Crisp Rear Cocking Serrations on both sides (X: -6.88 to -4.66)
  for (let i = 0; i < 7; i++) {
    const sx = -6.88 + i * 0.37;
    for (const sign of [-1, 1]) {
      cutters.push(
        paintGeometry(
          new THREE.BoxGeometry(0.18, 1.98, 0.18).translate(
            sx,
            2.08,
            sign * 1.27
          ),
          SLIDE_MILLED
        )
      );
    }
  }

  return applySlideAtlasUVs(
    sanitizeCsgGeometry(csgSubtract(rawSlide, cutters))
  );
}

/** U-02: Ramp Front Sight with Inlaid White Aiming Dot & Underside Hex Screw */
export function buildFrontSightGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.46, 0);
  shape.lineTo(0.44, 0);
  shape.lineTo(0.24, 0.44);
  shape.lineTo(-0.42, 0.46);
  shape.closePath();

  const blade = new THREE.ExtrudeGeometry(shape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  blade.translate(0, 0, -0.12);
  paintGeometry(blade, '#454f5e');

  const tenon = paintGeometry(
    new THREE.CylinderGeometry(0.105, 0.105, 0.22, 14).translate(0, -0.11, 0),
    '#586476'
  );

  // Authentic thin low-profile 3/16" hex mounting screw underneath slide roof
  const hexScrew = paintGeometry(
    new THREE.CylinderGeometry(0.145, 0.145, 0.065, 6).translate(0, -0.23, 0),
    '#cbd5e1'
  );

  // Iconic bright white front aiming dot on rear sight face (-X)
  const whiteDot = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.04, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.43, 0.27, 0),
    '#f8fafc'
  );

  return mergeParts([blade, tenon, hexScrew, whiteDot]);
}

/** U-03: Dovetail Rear Sight with Iconic Glock White U-Outline Marking */
export function buildRearSightGeometry(): THREE.BufferGeometry {
  const sideShape = new THREE.Shape();
  sideShape.moveTo(-0.38, 0);
  sideShape.lineTo(0.4, 0);
  sideShape.lineTo(0.26, 0.46);
  sideShape.lineTo(-0.35, 0.46);
  sideShape.closePath();

  const base = new THREE.ExtrudeGeometry(sideShape, {
    depth: 1.54,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  base.translate(0, 0, -0.77);
  paintGeometry(base, '#454f5e');

  const dovetail = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.14, 1.48).translate(0, -0.06, 0),
    '#586476'
  );

  const notch = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.28, 0.38).translate(0, 0.36, 0),
    '#262c36'
  );
  const carvedSight = csgSubtract(mergeParts([base, dovetail]), [notch]);

  // Iconic Glock White U-Bracket inlaid around rear notch face (-X = -0.37)
  const uBottom = paintGeometry(
    new THREE.BoxGeometry(0.03, 0.065, 0.56).translate(-0.37, 0.16, 0),
    '#f8fafc'
  );
  const uLeft = paintGeometry(
    new THREE.BoxGeometry(0.03, 0.27, 0.065).translate(-0.37, 0.29, -0.248),
    '#f8fafc'
  );
  const uRight = paintGeometry(
    new THREE.BoxGeometry(0.03, 0.27, 0.065).translate(-0.37, 0.29, 0.248),
    '#f8fafc'
  );

  return mergeParts([carvedSight, uBottom, uLeft, uRight]);
}

/**
 * U-04: 1:1 Cold-Hammer-Forged Glock 17 Barrel
 * Features boxy locking hood w/ LCI & extractor cuts, recessed 11° target muzzle crown,
 * 6 helical hexagonal polygonal rifling lands inside bore, scooped mirror-polished feed ramp,
 * and accurate Browning camming under-lug geometry.
 */
export function buildBarrelGeometry(): THREE.BufferGeometry {
  const BARREL_STEEL = '#454f5e';
  const HOOD_CHAMFER = '#586476';
  const POLISHED_STEEL = '#e2e8f0';
  const BORE_DARK = '#242933'; // cr < 0.025 -> 'bore' UV region

  // Precision cylindrical barrel tube + outer muzzle bevel collar
  const tube = paintGeometry(
    new THREE.CylinderGeometry(0.65, 0.65, 8.7, 32)
      .rotateZ(Math.PI / 2)
      .translate(6.83, 2.55, 0),
    BARREL_STEEL
  );

  const muzzleCrownBevel = paintGeometry(
    new THREE.CylinderGeometry(0.585, 0.65, 0.14, 32)
      .rotateZ(Math.PI / 2)
      .translate(11.25, 2.55, 0),
    POLISHED_STEEL
  );

  // Boxy Glock Chamber Hood with beveled top edges & front locking shoulder
  const hoodProfile = new THREE.Shape();
  hoodProfile.moveTo(-0.78, 1.86);
  hoodProfile.lineTo(0.78, 1.86);
  hoodProfile.lineTo(0.78, 3.24);
  hoodProfile.quadraticCurveTo(0.78, 3.4, 0.62, 3.4);
  hoodProfile.lineTo(-0.62, 3.4);
  hoodProfile.quadraticCurveTo(-0.78, 3.4, -0.78, 3.24);
  hoodProfile.closePath();

  const hood = new THREE.ExtrudeGeometry(hoodProfile, {
    depth: 3.02,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  hood.rotateY(Math.PI / 2);
  hood.translate(-0.5, 0, 0);
  paintGeometry(hood, HOOD_CHAMFER);

  // Accurate Gen3 Browning Bottom Locking & Camming Lug:
  // Front vertical slide-lock shoulder (x=1.84), half-moon guide rod seat, 40° unlocking ramp & rear pull-down hook
  const lugShape = new THREE.Shape();
  lugShape.moveTo(-0.44, 1.9);
  lugShape.lineTo(1.86, 1.9);
  lugShape.lineTo(1.86, 1.24);
  lugShape.lineTo(1.66, 1.12);
  lugShape.lineTo(1.32, 0.96);
  lugShape.lineTo(0.88, 0.96);
  lugShape.lineTo(0.42, 1.42);
  lugShape.lineTo(0.08, 1.42);
  lugShape.lineTo(-0.18, 1.04);
  lugShape.lineTo(-0.48, 1.22);
  lugShape.closePath();

  const lug = new THREE.ExtrudeGeometry(lugShape, {
    depth: 0.78,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  lug.translate(0, 0, -0.39);
  paintGeometry(lug, BARREL_STEEL);

  // Mirror-Polished Feed Ramp block at rear-bottom of chamber
  const ramp = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.68, 0.72)
      .rotateZ(0.54)
      .translate(-0.58, 1.72, 0),
    POLISHED_STEEL
  );

  const solidBarrel = mergeParts([tube, muzzleCrownBevel, hood, lug, ramp]);

  const cutters: THREE.BufferGeometry[] = [];

  // 1. Hollow 9mm rifled bore + stepped 9x19mm chamber throat
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.462, 0.462, 12.4, 28)
        .rotateZ(Math.PI / 2)
        .translate(5.4, 2.55, 0),
      BORE_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.5, 0.49, 2.62, 26)
        .rotateZ(Math.PI / 2)
        .translate(0.76, 2.55, 0),
      BORE_DARK
    )
  );

  // 2. Recessed 11° Muzzle Target Crown Dish at X = +11.24..11.34
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.555, 0.46, 0.16, 32)
        .rotateZ(Math.PI / 2)
        .translate(11.26, 2.55, 0),
      POLISHED_STEEL
    )
  );

  // 3. Concave Scooped Polished Feed-Ramp Throat + Guide-Rod Half-Moon Seat
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.32, 0.34, 1.05, 20)
        .rotateZ(Math.PI / 2 - 0.54)
        .translate(-0.62, 1.92, 0),
      POLISHED_STEEL
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 0.88, 18)
        .rotateX(Math.PI / 2)
        .translate(1.86, 1.35, 0),
      BARREL_STEEL
    )
  );

  // 4. Top-rear Loaded Chamber Witness Notch + Right-side Extractor Claw Cutout
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.32, 0.22, 0.24).translate(-0.44, 3.35, 0),
      BORE_DARK
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.36, 0.42, 0.34).translate(-0.42, 2.55, 0.68),
      BORE_DARK
    )
  );

  const carvedBarrel = csgSubtract(solidBarrel, cutters);

  // 5. Glock Cold-Hammer-Forged Right-Hand Hexagonal Polygonal Rifling (6 helical rounded lands, 1:250mm twist)
  const riflingLands: THREE.BufferGeometry[] = [];
  const xStart = 2.12;
  const xEnd = 11.12;
  const twistTotal = ((xEnd - xStart) / 25.0) * Math.PI * 2;
  const landRadius = 0.456;
  const steps = 16;

  for (let k = 0; k < 6; k++) {
    const basePhi = (k * Math.PI) / 3;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = xStart + (xEnd - xStart) * u;
      const phi = basePhi + u * twistTotal;
      pts.push(
        new THREE.Vector3(
          x,
          2.55 + Math.cos(phi) * landRadius,
          Math.sin(phi) * landRadius
        )
      );
    }
    const landTube = paintGeometry(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts),
        steps,
        0.028,
        6,
        false
      ),
      BORE_DARK
    );
    riflingLands.push(landTube);
  }

  return applyBarrelAtlasUVs(mergeParts([carvedBarrel, ...riflingLands]));
}

/** U-05: Polymer Recoil Guide Rod with Stainless Washer Collar & Front Hex Socket */
export function buildRecoilGuideRodGeometry(): THREE.BufferGeometry {
  const flange = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.45, 0.18, 24)
      .rotateZ(Math.PI / 2)
      .translate(1.83, 1.35, 0),
    '#313640'
  );

  const steelWasher = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24)
      .rotateZ(Math.PI / 2)
      .translate(1.98, 1.35, 0),
    '#dce4ee'
  );

  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 8.8, 20)
      .rotateZ(Math.PI / 2)
      .translate(6.35, 1.35, 0),
    '#3b4452'
  );

  const frontCapRaw = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.28, 0.28, 22)
      .rotateZ(Math.PI / 2)
      .translate(10.82, 1.35, 0),
    '#313640'
  );
  const hexRecess = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.14, 6)
      .rotateZ(Math.PI / 2)
      .translate(10.94, 1.35, 0),
    '#242830'
  );
  const frontCap = csgSubtract(frontCapRaw, [hexRecess]);

  return mergeParts([flange, steelWasher, shaft, frontCap]);
}

/** U-06: Captured Flat-Wire Recoil Spring */
export function buildRecoilSpringGeometry(): THREE.BufferGeometry {
  return paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 2.02,
      end: 10.62,
      centerY: 1.35,
      centerZ: 0,
      coilRadius: 0.36,
      wireRadius: 0.058,
      coils: 17,
      flatWireRatio: 0.78,
    }),
    '#9aa8ba'
  );
}

/** U-07: Machined Slide Cover Plate with Stainless Insert & Retention Window */
export function buildSlideCoverPlateGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.92, -1.05);
  shape.lineTo(0.92, -1.05);
  shape.lineTo(0.92, 0.72);
  shape.quadraticCurveTo(0.9, 1.05, 0.62, 1.05);
  shape.lineTo(-0.62, 1.05);
  shape.quadraticCurveTo(-0.9, 1.05, -0.92, 0.72);
  shape.closePath();

  const plate = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  plate.rotateY(Math.PI / 2);
  plate.translate(-0.1, 0, 0);
  paintGeometry(plate, '#3b4452');

  const notch = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.52, 0.36).translate(0, -0.82, 0),
    '#262c36'
  );
  const carved = csgSubtract(plate, [notch]);

  // Embedded stamped steel rail insert visible on inner face
  const steelLiner = paintGeometry(
    new THREE.BoxGeometry(0.04, 1.55, 1.56).translate(0.1, 0.08, 0),
    '#cbd5e1'
  );

  return mergeParts([carved, steelLiner]);
}

/** U-08: Precision Stainless Striker w/ Rectangular Blade Tip, Fluted Shaft, Safety Shoulder & Sear Lug */
export function buildStrikerGeometry(): THREE.BufferGeometry {
  // Iconic Glock rectangular flat firing-pin blade tip (retracted to X_max = -0.72 behind breech face -0.53 at half-cock)
  const tip = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.175, 0.068).translate(-1.0, 2.55, 0),
    '#e2e8f0'
  );

  const frontShoulder = paintGeometry(
    new THREE.CylinderGeometry(0.105, 0.225, 0.46, 20)
      .rotateZ(Math.PI / 2)
      .translate(-1.36, 2.55, 0),
    '#d8e1ec'
  );

  // Right-side firing-pin safety plunger blocking lug shoulder (interfaces with U-10 plunger waist!)
  const safetyLug = paintGeometry(
    new THREE.BoxGeometry(0.34, 0.28, 0.18).translate(-1.82, 2.55, 0.16),
    '#e2e8f0'
  );

  const rawShaft = paintGeometry(
    new THREE.CylinderGeometry(0.155, 0.155, 5.15, 20)
      .rotateZ(Math.PI / 2)
      .translate(-4.15, 2.55, 0),
    '#d8e1ec'
  );
  // 4 longitudinal weight-reduction / hydraulic-relief flutes along mid-shaft
  const shaftFlutes: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2 + Math.PI / 4;
    shaftFlutes.push(
      paintGeometry(
        new THREE.BoxGeometry(2.65, 0.075, 0.075)
          .translate(-3.45, 2.55 + Math.cos(ang) * 0.155, Math.sin(ang) * 0.155)
          .rotateX(0),
        '#94a3b8'
      )
    );
  }
  const mainShaft = csgSubtract(rawShaft, shaftFlutes);

  const searLugShape = new THREE.Shape();
  searLugShape.moveTo(-5.18, 2.55);
  searLugShape.lineTo(-4.65, 2.55);
  searLugShape.lineTo(-4.72, 1.38);
  searLugShape.lineTo(-4.95, 1.14);
  searLugShape.lineTo(-5.18, 1.14);
  searLugShape.closePath();

  const searLug = new THREE.ExtrudeGeometry(searLugShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  searLug.translate(0, 0, -0.11);
  paintGeometry(searLug, '#cbd5e1');

  const rearTail = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.36, 0.28).translate(-6.2, 2.55, 0),
    '#cbd5e1'
  );

  return mergeParts([
    tip,
    frontShoulder,
    safetyLug,
    mainShaft,
    searLug,
    rearTail,
  ]);
}

/** U-09: Two-Tone Striker Spring + Slotted Polymer Spacer Sleeve & Split Spring Cups */
export function buildStrikerSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -5.85,
      end: -2.15,
      centerY: 2.55,
      centerZ: 0,
      coilRadius: 0.26,
      wireRadius: 0.044,
      coils: 15,
    }),
    '#a3b1c2'
  );

  const rawSleeve = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 1.08, 22)
      .rotateZ(Math.PI / 2)
      .translate(-6.45, 2.55, 0),
    '#313640'
  );
  const sleeveSlot = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.42, 0.24).translate(-6.45, 2.32, 0),
    '#242830'
  );
  const sleeve = csgSubtract(rawSleeve, [sleeveSlot]);

  // Split two-half polymer spring cups at front of striker spring
  const rawCups = paintGeometry(
    new THREE.CylinderGeometry(0.295, 0.235, 0.38, 22)
      .rotateZ(Math.PI / 2)
      .translate(-2.05, 2.55, 0),
    '#313640'
  );
  const splitSeam = paintGeometry(
    new THREE.BoxGeometry(0.44, 0.035, 0.68).translate(-2.05, 2.55, 0),
    '#242830'
  );
  const cups = csgSubtract(rawCups, [splitSeam]);

  return mergeParts([spring, sleeve, cups]);
}

/** U-10: Machined Spool-Profile Stainless Firing Pin Safety Plunger & Captive Coil Spring */
export function buildFiringPinSafetyGeometry(): THREE.BufferGeometry {
  const bottomHead = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.205, 0.38, 24).translate(0, -0.51, 0),
    '#dce4ee'
  );

  // Smooth polished camming dome kissed by trigger-bar shark-fin
  const dome = paintGeometry(
    new THREE.SphereGeometry(0.205, 20, 14).translate(0, -0.68, 0),
    '#f1f5f9'
  );

  // Narrow clearance waist that frees the striker shoulder when lifted +0.28 in Y
  const waist = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 0.44, 18).translate(0, -0.11, 0),
    '#cbd5e1'
  );

  const topCap = paintGeometry(
    new THREE.CylinderGeometry(0.215, 0.215, 0.22, 22).translate(0, 0.21, 0),
    '#dce4ee'
  );

  const safetySpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.32,
      end: 0.85,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.14,
      wireRadius: 0.026,
      coils: 6,
    }),
    '#94a3b8'
  );

  return mergeParts([bottomHead, dome, waist, topCap, safetySpring]);
}

/** U-11: Gen3 15° External Extractor with Tactile/Visual Loaded Chamber Indicator (LCI) Step */
export function buildExtractorGeometry(): THREE.BufferGeometry {
  const mainBody = paintGeometry(
    new THREE.BoxGeometry(1.22, 0.46, 0.3),
    '#454f5e'
  );

  // Undercut front rim-engagement hook claw with bottom feeding bevel
  const rawClaw = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.46, 0.4).translate(0.51, 0, -0.2),
    '#586476'
  );
  const clawGroove = paintGeometry(
    new THREE.BoxGeometry(0.14, 0.5, 0.16).translate(0.39, 0, -0.34),
    '#262c36'
  );
  const claw = csgSubtract(rawClaw, [clawGroove]);

  // Authentic Gen3 tactile & visual Loaded Chamber Indicator (LCI) raised step on outer +Z flank
  const lciBase = paintGeometry(
    new THREE.BoxGeometry(0.74, 0.3, 0.09).translate(0.08, 0, 0.18),
    '#3b4452'
  );
  const lciTactileStep = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.22, 0.055).translate(0.18, 0, 0.235),
    '#586476'
  );

  // Top & bottom slide pivot retention trunnion pads
  const trunnionPads = paintGeometry(
    new THREE.BoxGeometry(0.34, 0.56, 0.18).translate(-0.14, 0, -0.02),
    '#454f5e'
  );

  // Angled 15° rear depressor plunger bearing heel
  const rearHeel = paintGeometry(
    new THREE.BoxGeometry(0.34, 0.36, 0.28)
      .rotateY(0.26)
      .translate(-0.62, 0, -0.12),
    '#dce4ee'
  );

  return mergeParts([
    mainBody,
    claw,
    lciBase,
    lciTactileStep,
    trunnionPads,
    rearHeel,
  ]);
}

/** U-12: Stainless Extractor Depressor Plunger, Coil Spring & Stepped Black Polymer SLB Bearing */
export function buildExtractorPlungerGeometry(): THREE.BufferGeometry {
  const rodHead = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.185, 0.46, 20)
      .rotateZ(Math.PI / 2)
      .translate(-1.91, 2.55, 0.72),
    '#e2e8f0'
  );

  const collar = paintGeometry(
    new THREE.CylinderGeometry(0.19, 0.19, 0.1, 20)
      .rotateZ(Math.PI / 2)
      .translate(-2.18, 2.55, 0.72),
    '#dce4ee'
  );

  const rodShaft = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 1.48, 18)
      .rotateZ(Math.PI / 2)
      .translate(-2.95, 2.55, 0.72),
    '#dce4ee'
  );

  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -6.45,
      end: -3.65,
      centerY: 2.55,
      centerZ: 0.72,
      coilRadius: 0.16,
      wireRadius: 0.03,
      coils: 14,
    }),
    '#9aa8ba'
  );

  const bearingBody = paintGeometry(
    new THREE.CylinderGeometry(0.175, 0.16, 0.72, 20)
      .rotateZ(Math.PI / 2)
      .translate(-6.82, 2.55, 0.72),
    '#313640'
  );
  const bearingTail = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.24, 18)
      .rotateZ(Math.PI / 2)
      .translate(-7.26, 2.55, 0.72),
    '#262b34'
  );

  return mergeParts([
    rodHead,
    collar,
    rodShaft,
    spring,
    bearingBody,
    bearingTail,
  ]);
}
