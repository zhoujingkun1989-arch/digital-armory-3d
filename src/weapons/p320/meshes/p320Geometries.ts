import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  applyP320GripAtlasUVs,
  applyP320SlideAtlasUVs,
  buildP320FcuChassisGeometry,
  buildP320MagBaseplateGeometry,
  buildP320MagBodyGeometry,
  buildP320MagFollowerGeometry,
  buildP320MagSpringGeometry,
  buildP320ManualSafetyGeometry,
  buildP320SearGroupGeometry,
  buildP320TriggerBarGeometry,
  buildP320TriggerShoeGeometry,
} from './p320ExtraGeometries';

/** P320 M17 natural ergonomic grip angle: -18 degrees (swept rearward -X as Y goes down) */
export const P320_GRIP_ANGLE_RAD = (-18 * Math.PI) / 180;

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

// ============================================================================
// GROUP 1: COYOTE TAN PVD SLIDE, OPTIC PLATE & 4.7" BARREL (11 Builders)
// ============================================================================

/**
 * U-01: Coyote Tan PVD Stainless Steel Slide (p320_slide, isShell: true)
 * Features SIG Sauer's signature high-shoulder beveled tri-top profile, full-contour recoil hood,
 * 5 forward-raked (18°) front & 6 rear cocking serrations, lowered ejection port, top M17 LCI witness slot,
 * Leupold DeltaPoint Pro (DPP) rear optic cut w/ recoil boss sockets & screw holes, and stepped extractor pocket.
 */
export function buildP320SlideGeometry(): THREE.BufferGeometry {
  const SLIDE_COYOTE = '#9d8363';
  const SLIDE_MILLED = '#4a3b2a'; // cr < 0.16 maps to dark Coyote PVD milled swatch

  // Authentic SIG P320 cross-section in (Z, Y): slab lower rail walls + angled upper shoulder facets
  const profile = new THREE.Shape();
  profile.moveTo(-1.26, 0.92);
  profile.lineTo(1.26, 0.92);
  profile.quadraticCurveTo(1.3, 0.92, 1.3, 1.0);
  profile.lineTo(1.3, 2.48);
  // Signature SIG P320 crisp angled upper shoulder bevels narrowing to flat top deck
  profile.lineTo(0.96, 3.46);
  profile.quadraticCurveTo(0.9, 3.58, 0.78, 3.58);
  profile.lineTo(-0.78, 3.58);
  profile.quadraticCurveTo(-0.9, 3.58, -0.96, 3.46);
  profile.lineTo(-1.3, 2.48);
  profile.lineTo(-1.3, 1.0);
  profile.quadraticCurveTo(-1.3, 0.92, -1.26, 0.92);
  profile.closePath();

  const rawSlideSlab = new THREE.ExtrudeGeometry(profile, {
    depth: 19.42,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 2,
    curveSegments: 12,
    steps: 1,
  });
  rawSlideSlab.rotateY(Math.PI / 2);
  rawSlideSlab.translate(-7.81, 0, 0);
  paintGeometry(rawSlideSlab, SLIDE_COYOTE);

  // Full-contour SIG front recoil-spring chin extending under muzzle (X in [+9.35, +11.62])
  const recoilChin = paintGeometry(
    new THREE.CylinderGeometry(0.68, 0.64, 2.28, 26)
      .rotateZ(Math.PI / 2)
      .translate(10.48, 1.32, 0),
    SLIDE_COYOTE
  );

  const rawSlide = csgUnion([rawSlideSlab, recoilChin]);
  const cutters: THREE.BufferGeometry[] = [];

  // 1. Slanted rear M17 slide face bevel + front SIG bullnose muzzle chamfers
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.95, 3.4, 3.0)
        .rotateZ(-0.14)
        .translate(-8.22, 2.35, 0),
      SLIDE_COYOTE
    )
  );
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.55, 3.0, 0.88)
          .rotateY(-sign * 0.42)
          .translate(11.38, 2.25, sign * 1.38),
        SLIDE_COYOTE
      )
    );
    // Lower dust-cover chin angled boat bevels near muzzle
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(2.5, 0.65, 0.65)
          .rotateX(sign * 0.72)
          .translate(10.52, 0.88, sign * 1.15),
        SLIDE_COYOTE
      )
    );
  }

  // 2. Underside FCU rail T-channels & open central slide belly
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(17.2, 0.92, 1.86).translate(0.65, 1.32, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(17.6, 0.2, 2.16).translate(0.75, 1.02, 0),
      SLIDE_MILLED
    )
  );

  // 3. Barrel bore (r=0.76 for zero tilt clipping) + internal barrel-hood vault + recoil tunnel
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.76, 0.76, 12.6, 32)
        .rotateZ(Math.PI / 2)
        .translate(5.55, 2.68, 0),
      SLIDE_MILLED
    )
  );
  // Internal upper vault ahead of ejection port (X in [2.65, 10.15], Y in [2.00, 3.38])
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(7.5, 1.38, 1.7).translate(6.4, 2.69, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.52, 0.52, 9.5, 26)
        .rotateZ(Math.PI / 2)
        .translate(6.35, 1.46, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.36, 0.36, 1.5, 22)
        .rotateZ(Math.PI / 2)
        .translate(11.15, 1.46, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(9.1, 1.15, 1.16).translate(6.2, 2.05, 0),
      SLIDE_MILLED
    )
  );

  // 4. SIG Sauer Open Top-Right Ejection Port (X in [-0.55, +2.65]) + Top M17 LCI Witness Slot
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(3.2, 0.95, 1.66).translate(1.05, 3.36, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(3.2, 1.48, 1.45).translate(1.05, 2.86, 0.68),
      SLIDE_MILLED
    )
  );
  // M17 Top-Center Loaded Chamber Indicator (LCI) witness slot right behind barrel hood
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.84, 0.36, 0.2).translate(-0.92, 3.52, 0),
      SLIDE_MILLED
    )
  );
  // Breech-face firing pin aperture + Left FCU ejector clearance rail groove
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.11, 0.11, 0.5, 14)
        .rotateZ(Math.PI / 2)
        .translate(-0.62, 2.68, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(7.35, 0.64, 0.22).translate(-4.15, 1.52, -0.36),
      SLIDE_MILLED
    )
  );

  // 5. M17 Leupold DeltaPoint Pro (DPP) Rear Optic Cutout (X in [-7.56, -3.54], Y in [+3.26, +3.72])
  // Includes twin front DPP recoil boss sockets & twin Torx screw tapped holes in cut floor
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(4.02, 0.46, 2.25).translate(-5.55, 3.49, 0),
      SLIDE_MILLED
    )
  );
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.11, 0.11, 0.16, 14).translate(
          -3.92,
          3.22,
          sign * 0.48
        ),
        SLIDE_MILLED
      )
    );
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.095, 0.095, 0.24, 14).translate(
          -4.5,
          3.2,
          sign * 0.46
        ),
        SLIDE_MILLED
      )
    );
  }

  // Front sight dovetail slot at X = +10.55
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.52, 0.15, 2.2).translate(10.55, 3.55, 0),
      SLIDE_MILLED
    )
  );

  // 6. Internal Striker Housing Pocket + Stepped External Extractor Pocket on Right Wall
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(7.35, 0.92, 0.82).translate(-4.22, 2.52, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.42, 0.52, 0.58).translate(-1.46, 2.68, 1.08),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.15, 0.15, 1.35, 16)
        .rotateZ(Math.PI / 2)
        .translate(-2.95, 2.68, 0.88),
      SLIDE_MILLED
    )
  );

  // 7. Ambidextrous Slide Catch Notches (X = -2.55) + Rear M17 Manual Thumb Safety Notches (X = -5.75)
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.68, 0.44, 0.45).translate(
          -2.55,
          1.05,
          sign * 1.2
        ),
        SLIDE_MILLED
      )
    );
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.72, 0.34, 0.45).translate(
          -5.75,
          0.98,
          sign * 1.2
        ),
        SLIDE_MILLED
      )
    );
  }

  // 8. Authentic 18° Forward-Raked Front (5) & Rear (6) Cocking Serrations
  for (let i = 0; i < 5; i++) {
    const fx = 7.72 + i * 0.48;
    for (const sign of [-1, 1]) {
      cutters.push(
        paintGeometry(
          new THREE.BoxGeometry(0.2, 1.58, 0.19)
            .rotateZ(-0.31)
            .translate(fx, 1.78, sign * 1.29),
          SLIDE_MILLED
        )
      );
    }
  }
  for (let i = 0; i < 6; i++) {
    const rx = -6.94 + i * 0.48;
    for (const sign of [-1, 1]) {
      cutters.push(
        paintGeometry(
          new THREE.BoxGeometry(0.2, 1.88, 0.19)
            .rotateZ(-0.31)
            .translate(rx, 1.92, sign * 1.29),
          SLIDE_MILLED
        )
      );
    }
  }

  return applyP320SlideAtlasUVs(
    sanitizeCsgGeometry(csgSubtract(rawSlide, cutters))
  );
}

/**
 * U-02: Removable Black Anodized Rear Optic Plate w/ Integral M17 SIGLITE Night Rear Sight
 * World assembledPos = [-5.55, 3.26, 0] (sits flush inside p320_slide DPP optic cut).
 */
export function buildP320OpticPlateSightGeometry(): THREE.BufferGeometry {
  const PLATE_BLACK = '#3b4452';
  const SIGHT_STEEL = '#454f5e';
  const TRITIUM_GLOW = '#bef264';
  const WHITE_RING = '#f8fafc';

  // Precision milled DeltaPoint Pro cover plate spanning x in [-1.98, +1.98], y in [0, +0.32]
  const plate = paintGeometry(
    new THREE.BoxGeometry(3.96, 0.32, 1.86).translate(0, 0.16, 0),
    PLATE_BLACK
  );

  // Underside DPP alignment recoil lugs + front LCI spring-retention tab
  const bossL = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 0.1, 14).translate(
      1.63,
      -0.05,
      -0.48
    ),
    '#586476'
  );
  const bossR = bossL.clone().translate(0, 0, 0.96);
  const frontLciLip = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.1, 0.34).translate(1.92, -0.03, 0),
    PLATE_BLACK
  );

  // Integral M17 protective-wing night rear sight body rising above plate
  const sightShape = new THREE.Shape();
  sightShape.moveTo(-1.74, 0.28);
  sightShape.lineTo(-0.32, 0.28);
  sightShape.lineTo(-0.5, 0.82);
  sightShape.lineTo(-1.64, 0.82);
  sightShape.closePath();

  const sightBody = new THREE.ExtrudeGeometry(sightShape, {
    depth: 1.58,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  sightBody.translate(0, 0, -0.79);
  paintGeometry(sightBody, SIGHT_STEEL);

  // Subtract center U-notch, protective ear scallops & two top Torx screw counterbores
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(1.65, 0.35, 0.38).translate(-1.05, 0.69, 0),
      '#262c36'
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.165, 0.165, 0.16, 16).translate(
        1.05,
        0.3,
        -0.46
      ),
      '#262c36'
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.165, 0.165, 0.16, 16).translate(
        1.05,
        0.3,
        0.46
      ),
      '#262c36'
    ),
  ];

  // Horizontal anti-glare grooves on rear face of M17 sight
  for (let i = 0; i < 4; i++) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.06, 0.04, 1.52).translate(
          -1.7,
          0.38 + i * 0.1,
          0
        ),
        '#262c36'
      )
    );
  }

  const carved = csgSubtract(
    mergeParts([plate, bossL, bossR, frontLciLip, sightBody]),
    cutters
  );

  // Two recessed Torx T15 mounting screws w/ carved hex/star sockets + threaded underside shanks
  const makeTorxScrew = (zPos: number): THREE.BufferGeometry => {
    const headRaw = paintGeometry(
      new THREE.CylinderGeometry(0.135, 0.135, 0.07, 16).translate(
        1.05,
        0.265,
        zPos
      ),
      '#64748b'
    );
    const torxSocket = paintGeometry(
      new THREE.CylinderGeometry(0.068, 0.068, 0.06, 6).translate(
        1.05,
        0.285,
        zPos
      ),
      '#262c36'
    );
    const shank = paintGeometry(
      new THREE.CylinderGeometry(0.075, 0.075, 0.34, 12).translate(
        1.05,
        0.08,
        zPos
      ),
      '#586476'
    );
    return mergeParts([csgSubtract(headRaw, [torxSocket]), shank]);
  };

  // Pivoting M17 Loaded Chamber Indicator (LCI) flag nested at front edge of optic plate
  const lciFlag = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.14, 0.14).translate(2.42, 0.24, 0),
    '#454f5e'
  );

  // Twin SIGLITE tritium rear night dots
  const dots: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    dots.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.085, 0.085, 0.03, 14)
          .rotateZ(Math.PI / 2)
          .translate(-1.69, 0.57, sign * 0.42),
        WHITE_RING
      )
    );
    dots.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.055, 0.055, 0.036, 12)
          .rotateZ(Math.PI / 2)
          .translate(-1.695, 0.57, sign * 0.42),
        TRITIUM_GLOW
      )
    );
  }

  return sanitizeCsgGeometry(
    mergeParts([
      carved,
      makeTorxScrew(-0.46),
      makeTorxScrew(0.46),
      lciFlag,
      ...dots,
    ])
  );
}

/**
 * U-03: Dovetail SIGLITE Tritium Front Sight (assembledPos = [10.55, 3.56, 0])
 */
export function buildP320FrontSightGeometry(): THREE.BufferGeometry {
  const dovetail = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.13, 1.34).translate(0, -0.045, 0),
    '#3b4452'
  );

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.46, 0);
  bladeShape.lineTo(0.46, 0);
  bladeShape.lineTo(0.22, 0.48);
  bladeShape.lineTo(-0.42, 0.48);
  bladeShape.closePath();

  const bladeRaw = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.26,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  bladeRaw.translate(0, 0, -0.13);
  paintGeometry(bladeRaw, '#454f5e');

  // Front ramp serrations
  const serrs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    serrs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.05, 0.04, 0.3).translate(
          0.38 - i * 0.06,
          0.12 + i * 0.11,
          0
        ),
        '#262c36'
      )
    );
  }
  const blade = csgSubtract(bladeRaw, serrs);

  const ring = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 0.035, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.43, 0.28, 0),
    '#f8fafc'
  );
  const vial = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.06, 0.042, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.435, 0.28, 0),
    '#bef264'
  );

  return mergeParts([dovetail, blade, ring, vial]);
}

/**
 * U-04: Black Nitride 4.7" Tilting Barrel w/ Recessed Target Crown, Rifling Lands,
 * Top M17 LCI Slot, Scooped Polished Feed Ramp & Browning Camming Lug.
 * Bore centerline at Y = +2.68; spans X in [-0.54, +11.80].
 */
export function buildP320BarrelGeometry(): THREE.BufferGeometry {
  const NITRIDE_BARREL = '#454f5e';
  const HOOD_STEEL = '#586476';
  const POLISHED = '#e2e8f0';
  const BORE_DARK = '#262c36';

  const tube = paintGeometry(
    new THREE.CylinderGeometry(0.65, 0.65, 9.04, 32)
      .rotateZ(Math.PI / 2)
      .translate(7.14, 2.68, 0),
    NITRIDE_BARREL
  );

  const crownCollar = paintGeometry(
    new THREE.CylinderGeometry(0.585, 0.65, 0.16, 32)
      .rotateZ(Math.PI / 2)
      .translate(11.72, 2.68, 0),
    POLISHED
  );

  // Rectangular SIG Sauer Locking Chamber Hood (X in [-0.54, +2.64])
  const hoodProfile = new THREE.Shape();
  hoodProfile.moveTo(-0.8, 1.98);
  hoodProfile.lineTo(0.8, 1.98);
  hoodProfile.lineTo(0.8, 3.36);
  hoodProfile.quadraticCurveTo(0.8, 3.55, 0.62, 3.55);
  hoodProfile.lineTo(-0.62, 3.55);
  hoodProfile.quadraticCurveTo(-0.8, 3.55, -0.8, 3.36);
  hoodProfile.closePath();

  const hood = new THREE.ExtrudeGeometry(hoodProfile, {
    depth: 3.16,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  hood.rotateY(Math.PI / 2);
  hood.translate(-0.54, 0, 0);
  paintGeometry(hood, HOOD_STEEL);

  // Browning tilting camming under-lug engaging FCU steel locking block & D-flange guide rod
  const lugShape = new THREE.Shape();
  lugShape.moveTo(-0.38, 2.02);
  lugShape.lineTo(1.96, 2.02);
  lugShape.lineTo(1.96, 1.24);
  lugShape.lineTo(1.74, 1.12);
  lugShape.lineTo(1.42, 1.06);
  lugShape.lineTo(0.95, 1.06);
  lugShape.lineTo(0.52, 1.48);
  lugShape.lineTo(0.12, 1.48);
  lugShape.lineTo(-0.22, 1.14);
  lugShape.lineTo(-0.46, 1.38);
  lugShape.closePath();

  const lug = new THREE.ExtrudeGeometry(lugShape, {
    depth: 0.78,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  lug.translate(0, 0, -0.39);
  paintGeometry(lug, NITRIDE_BARREL);

  // Mirror-polished feed ramp block sculpted at rear chamber mouth
  const feedRampRaw = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.68, 0.72)
      .rotateZ(0.55)
      .translate(-0.56, 1.84, 0),
    POLISHED
  );
  const rampScoop = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.34, 0.95, 18)
      .rotateZ(Math.PI / 2 - 0.52)
      .translate(-0.68, 2.04, 0),
    POLISHED
  );
  const feedRamp = csgSubtract(feedRampRaw, [rampScoop]);

  const solidBarrel = mergeParts([tube, crownCollar, hood, lug, feedRamp]);

  // Hollow 9x19mm bore, recessed 11° target muzzle crown, chamber throat, LCI witness slot & extractor relief
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.455, 0.455, 12.8, 28)
      .rotateZ(Math.PI / 2)
      .translate(5.6, 2.68, 0),
    BORE_DARK
  );
  const chamberPocket = paintGeometry(
    new THREE.CylinderGeometry(0.5, 0.5, 1.95, 24)
      .rotateZ(Math.PI / 2)
      .translate(0.42, 2.68, 0),
    BORE_DARK
  );
  const crownDish = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.42, 0.16, 28)
      .rotateZ(Math.PI / 2)
      .translate(11.77, 2.68, 0),
    POLISHED
  );
  const lciSlot = paintGeometry(
    new THREE.BoxGeometry(0.74, 0.26, 0.22).translate(-0.2, 3.5, 0),
    BORE_DARK
  );
  const extractorCut = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.36, 0.24).translate(-0.42, 2.68, 0.72),
    BORE_DARK
  );
  const guideRodSeat = paintGeometry(
    new THREE.CylinderGeometry(0.47, 0.47, 0.12, 20)
      .rotateZ(Math.PI / 2)
      .translate(1.98, 1.46, 0),
    NITRIDE_BARREL
  );

  const hollowedBarrel = csgSubtract(solidBarrel, [
    bore,
    chamberPocket,
    crownDish,
    lciSlot,
    extractorCut,
    guideRodSeat,
  ]);

  // 6 Right-Hand Helical Rifling Lands inside 4.7" 9x19mm bore (twist ~1:10")
  const riflingLands: THREE.BufferGeometry[] = [];
  const xStart = 1.45;
  const xEnd = 11.62;
  const totalTwist = ((xEnd - xStart) / 25.4) * Math.PI * 2;
  for (let k = 0; k < 6; k++) {
    const basePhi = (k * Math.PI * 2) / 6;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      const x = xStart + (xEnd - xStart) * t;
      const phi = basePhi + totalTwist * t;
      pts.push(
        new THREE.Vector3(
          x,
          2.68 + Math.cos(phi) * 0.442,
          Math.sin(phi) * 0.442
        )
      );
    }
    const landCurve = new THREE.CatmullRomCurve3(pts);
    riflingLands.push(
      paintGeometry(
        new THREE.TubeGeometry(landCurve, 16, 0.024, 6, false),
        '#586476'
      )
    );
  }

  return mergeParts([hollowedBarrel, ...riflingLands]);
}

/**
 * U-05: Captive Steel Recoil Spring Guide Rod (centerline Y = +1.46, X in [+1.96, +11.08])
 * Features authentic SIG P320 vertical-flat (D-cut) rear flange & dual-tube telescoping guide sleeves.
 */
export function buildP320RecoilGuideRodGeometry(): THREE.BufferGeometry {
  const rearFlangeRaw = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.48, 0.16, 26)
      .rotateZ(Math.PI / 2)
      .translate(2.02, 1.46, 0),
    '#454f5e'
  );
  // Signature P320 vertical side flats on rear flange (must orient vertically on reassembly!)
  const flatL = paintGeometry(
    new THREE.BoxGeometry(0.28, 1.1, 0.24).translate(2.02, 1.46, -0.46),
    '#3b4452'
  );
  const flatR = flatL.clone().translate(0, 0, 0.92);
  const rearFlange = csgSubtract(rearFlangeRaw, [flatL, flatR]);

  const outerSleeve = paintGeometry(
    new THREE.CylinderGeometry(0.245, 0.245, 3.85, 22)
      .rotateZ(Math.PI / 2)
      .translate(4.02, 1.46, 0),
    '#586476'
  );
  const innerRod = paintGeometry(
    new THREE.CylinderGeometry(0.175, 0.175, 8.95, 20)
      .rotateZ(Math.PI / 2)
      .translate(6.52, 1.46, 0),
    '#cbd5e1'
  );

  const frontCapRaw = paintGeometry(
    new THREE.CylinderGeometry(0.325, 0.285, 0.26, 22)
      .rotateZ(Math.PI / 2)
      .translate(10.96, 1.46, 0),
    '#454f5e'
  );
  const frontHex = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.14, 6)
      .rotateZ(Math.PI / 2)
      .translate(11.06, 1.46, 0),
    '#262c36'
  );
  const frontCap = csgSubtract(frontCapRaw, [frontHex]);

  return mergeParts([rearFlange, outerSleeve, innerRod, frontCap]);
}

/**
 * U-06: Captured Flat-Wire Recoil Spring (X in [2.12, 10.82], L0 = 8.70, Y = +1.46)
 */
export function buildP320RecoilSpringGeometry(): THREE.BufferGeometry {
  return paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 2.12,
      end: 10.82,
      centerY: 1.46,
      centerZ: 0,
      coilRadius: 0.37,
      wireRadius: 0.058,
      coils: 17,
      flatWireRatio: 0.78,
    }),
    '#9aa8ba'
  );
}

/**
 * U-07: Precision Machined Stainless P320 Striker Assembly Pin (Y = +2.68, X in [-6.85, -0.75])
 */
export function buildP320StrikerGeometry(): THREE.BufferGeometry {
  const tip = paintGeometry(
    new THREE.CylinderGeometry(0.052, 0.072, 0.68, 16)
      .rotateZ(Math.PI / 2)
      .translate(-1.05, 2.68, 0),
    '#e2e8f0'
  );
  const frontCone = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.21, 0.48, 20)
      .rotateZ(Math.PI / 2)
      .translate(-1.6, 2.68, 0),
    '#d8e1ec'
  );

  const rawShaft = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 4.75, 20)
      .rotateZ(Math.PI / 2)
      .translate(-4.2, 2.68, 0),
    '#d8e1ec'
  );
  const flutes: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    flutes.push(
      paintGeometry(
        new THREE.BoxGeometry(2.6, 0.08, 0.08).translate(
          -3.4,
          2.68,
          sign * 0.14
        ),
        '#94a3b8'
      )
    );
  }
  const shaft = csgSubtract(rawShaft, flutes);

  // Downward sear engagement tang catching FCU Sear nose at X = -5.12, Y = 1.42
  const tangShape = new THREE.Shape();
  tangShape.moveTo(-5.32, 2.68);
  tangShape.lineTo(-4.82, 2.68);
  tangShape.lineTo(-4.88, 1.52);
  tangShape.lineTo(-5.08, 1.34);
  tangShape.lineTo(-5.32, 1.34);
  tangShape.closePath();

  const searTang = new THREE.ExtrudeGeometry(tangShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  searTang.translate(0, 0, -0.11);
  paintGeometry(searTang, '#cbd5e1');

  // Drop-safety lock catch hook notch on upper right of striker
  const safetyCatch = paintGeometry(
    new THREE.BoxGeometry(0.44, 0.28, 0.24).translate(-4.52, 2.84, 0.14),
    '#e2e8f0'
  );

  const rearStem = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.58, 18)
      .rotateZ(Math.PI / 2)
      .translate(-6.62, 2.68, 0),
    '#cbd5e1'
  );

  return mergeParts([
    tip,
    frontCone,
    shaft,
    searTang,
    safetyCatch,
    rearStem,
  ]);
}

/**
 * U-08: Helical Striker Main Spring & Split Retainer Cups (X in [-6.55, -2.55], L0 = 4.00, Y = +2.68)
 */
export function buildP320StrikerSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -6.55,
      end: -2.55,
      centerY: 2.68,
      centerZ: 0,
      coilRadius: 0.25,
      wireRadius: 0.042,
      coils: 16,
    }),
    '#a3b1c2'
  );
  const frontCupRaw = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.22, 0.3, 20)
      .rotateZ(Math.PI / 2)
      .translate(-2.45, 2.68, 0),
    '#313640'
  );
  const splitSeam = paintGeometry(
    new THREE.BoxGeometry(0.36, 0.035, 0.64).translate(-2.45, 2.68, 0),
    '#242830'
  );
  const frontCup = csgSubtract(frontCupRaw, [splitSeam]);
  return mergeParts([spring, frontCup]);
}

/**
 * U-09: Internal Modular Striker Housing Cage & Black Nitride Rear Slide Cap Plate
 */
export function buildP320StrikerHousingGeometry(): THREE.BufferGeometry {
  const sleeve = paintGeometry(
    new THREE.BoxGeometry(3.45, 0.76, 0.68).translate(-5.92, 2.66, 0),
    '#313640'
  );
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 3.6, 20)
      .rotateZ(Math.PI / 2)
      .translate(-5.92, 2.68, 0),
    '#242830'
  );
  const bottomSlot = paintGeometry(
    new THREE.BoxGeometry(2.8, 0.52, 0.3).translate(-5.6, 2.36, 0),
    '#242830'
  );
  const safetyWindow = paintGeometry(
    new THREE.BoxGeometry(0.92, 0.38, 0.34).translate(-4.45, 2.84, 0.24),
    '#242830'
  );
  const carvedSleeve = csgSubtract(sleeve, [bore, bottomSlot, safetyWindow]);

  // Rear Slide Cap locking into back of P320 slide at X = -7.76
  const capShape = new THREE.Shape();
  capShape.moveTo(-0.88, 1.05);
  capShape.lineTo(0.88, 1.05);
  capShape.lineTo(0.88, 2.55);
  capShape.lineTo(0.68, 3.22);
  capShape.lineTo(-0.68, 3.22);
  capShape.lineTo(-0.88, 2.55);
  capShape.closePath();

  const capPlateRaw = new THREE.ExtrudeGeometry(capShape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  capPlateRaw.rotateY(Math.PI / 2);
  capPlateRaw.translate(-7.82, 0, 0);
  paintGeometry(capPlateRaw, '#454f5e');

  const detentHole = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.12, 14)
      .rotateZ(Math.PI / 2)
      .translate(-7.84, 2.68, 0),
    '#262c36'
  );
  const capPlate = csgSubtract(capPlateRaw, [detentHole]);

  return mergeParts([carvedSleeve, capPlate]);
}

/**
 * U-10: Pivoting Stainless Striker Safety Lock & Micro Spring (assembledPos = [-4.35, 2.86, 0.22])
 */
export function buildP320SafetyLockGeometry(): THREE.BufferGeometry {
  const lockArm = paintGeometry(
    new THREE.BoxGeometry(0.78, 0.28, 0.16),
    '#e2e8f0'
  );
  const catchHook = paintGeometry(
    new THREE.BoxGeometry(0.2, 0.4, 0.26).translate(-0.24, -0.16, -0.06),
    '#cbd5e1'
  );
  const actuatorFoot = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.46, 0.14).translate(0.26, -0.26, 0.06),
    '#dce4ee'
  );
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.38, 12).rotateX(Math.PI / 2),
    '#94a3b8'
  );
  const microSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.14,
      end: 0.44,
      centerX: 0.1,
      centerZ: 0,
      coilRadius: 0.08,
      wireRadius: 0.018,
      coils: 5,
    }),
    '#94a3b8'
  );
  return mergeParts([lockArm, catchHook, actuatorFoot, pivotPin, microSpring]);
}

/**
 * U-11: Long SIG External Extractor Bar, Pivot Pin & Plunger Spring (assembledPos = [-1.45, 2.68, 1.02])
 */
export function buildP320ExtractorGeometry(): THREE.BufferGeometry {
  const barRaw = paintGeometry(
    new THREE.BoxGeometry(2.2, 0.42, 0.28),
    '#454f5e'
  );
  const reliefGroove = paintGeometry(
    new THREE.BoxGeometry(0.85, 0.16, 0.12).translate(-0.15, 0, 0.13),
    '#262c36'
  );
  const bar = csgSubtract(barRaw, [reliefGroove]);

  const clawRaw = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.4, 0.38).translate(0.98, 0, -0.18),
    '#586476'
  );
  const clawUndercut = paintGeometry(
    new THREE.BoxGeometry(0.14, 0.44, 0.16).translate(0.84, 0, -0.32),
    '#262c36'
  );
  const frontClaw = csgSubtract(clawRaw, [clawUndercut]);

  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.56, 14).translate(
      -0.28,
      0,
      -0.02
    ),
    '#64748b'
  );

  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.68,
      end: -0.95,
      centerY: 0,
      centerZ: -0.2,
      coilRadius: 0.11,
      wireRadius: 0.024,
      coils: 8,
    }),
    '#9aa8ba'
  );
  const plunger = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.48, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.78, 0, -0.2),
    '#dce4ee'
  );
  return mergeParts([bar, frontClaw, pivotPin, spring, plunger]);
}

// ============================================================================
// GROUP 2: COYOTE FDE CARRY GRIP MODULE & CONTROLS (4 Builders)
// ============================================================================

/**
 * F-01: Coyote FDE Polymer Carry Grip Module (p320_grip_module, isShell: true)
 * Features crisp 3-slot MIL-STD-1913 Picatinny dust-cover rail, U-contoured recoil channel,
 * undercut SIG trigger guard, extended M17 beaver-tail out to X=-9.0, recessed right-side FCU
 * serial cutout window revealing "TF004912", and -18 deg beveled Carry magwell rim!
 */
export function buildP320GripModuleGeometry(): THREE.BufferGeometry {
  const COYOTE_FDE = '#8d7251';
  const COYOTE_INNER = '#6e583d';

  // 1. Side silhouette of M17 Carry Grip Module (X in [-9.00, +9.56], bottom rim perpendicular to -18 deg)
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-7.58, 0.92);
  bodyShape.lineTo(9.48, 0.92);
  // Crisp angled Carry dust-cover front nose (exposes full-size 4.7" slide chin ahead of +9.56!)
  bodyShape.quadraticCurveTo(9.62, 0.88, 9.56, 0.42);
  bodyShape.lineTo(9.28, -0.34);
  // 3-slot M1913 Picatinny rail bottom deck back to trigger guard root
  bodyShape.lineTo(2.68, -0.34);
  bodyShape.quadraticCurveTo(2.22, -0.34, 1.96, -0.52);
  bodyShape.lineTo(-1.82, -0.52);

  // High ergonomic SIG Sauer trigger-guard root undercut transitioning into smooth -18 deg front strap
  bodyShape.quadraticCurveTo(-2.22, -0.56, -2.26, -1.96);
  bodyShape.bezierCurveTo(-2.52, -3.45, -3.58, -6.25, -5.06, -9.25);
  // Exact flush front-bottom magwell corner at s = 9.00: (-5.247, -9.642) -> rear heel (-8.177, -8.690)!
  bodyShape.quadraticCurveTo(-5.18, -9.56, -5.247, -9.642);
  bodyShape.lineTo(-8.177, -8.69);
  bodyShape.quadraticCurveTo(-8.32, -8.42, -8.16, -7.88);

  // Ergonomic P320 Carry arched backstrap sweeping into extended M17 beaver-tail tang (X = -9.00)!
  bodyShape.bezierCurveTo(-7.62, -6.05, -6.92, -3.85, -6.48, -1.85);
  bodyShape.bezierCurveTo(-6.22, -0.68, -6.52, 0.02, -7.45, 0.24);
  bodyShape.quadraticCurveTo(-8.62, 0.38, -8.98, 0.52);
  bodyShape.quadraticCurveTo(-9.06, 0.76, -8.65, 0.84);
  bodyShape.lineTo(-7.58, 0.92);
  bodyShape.closePath();

  const mainGrip = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 2.34,
    bevelEnabled: true,
    bevelThickness: 0.075,
    bevelSize: 0.065,
    bevelSegments: 3,
    curveSegments: 16,
  });
  mainGrip.translate(0, 0, -1.17);
  paintGeometry(mainGrip, COYOTE_FDE);

  // 2. Signature Rounded-Front Undercut SIG Sauer Trigger Guard
  const guardOuter = new THREE.Shape();
  guardOuter.moveTo(2.74, -0.26);
  guardOuter.bezierCurveTo(2.76, -1.55, 2.52, -2.86, 1.72, -3.06);
  guardOuter.lineTo(-1.48, -3.06);
  guardOuter.bezierCurveTo(-1.95, -3.02, -1.98, -2.28, -2.32, -2.06);
  guardOuter.lineTo(-2.08, -0.45);
  guardOuter.closePath();

  const guardHole = new THREE.Path();
  guardHole.moveTo(1.98, -0.54);
  guardHole.bezierCurveTo(2.08, -1.48, 1.92, -2.52, 1.34, -2.58);
  guardHole.lineTo(-1.32, -2.58);
  guardHole.quadraticCurveTo(-1.74, -2.52, -1.76, -1.82);
  guardHole.lineTo(-1.62, -0.54);
  guardHole.closePath();
  guardOuter.holes.push(guardHole);

  const triggerGuard = new THREE.ExtrudeGeometry(guardOuter, {
    depth: 1.16,
    bevelEnabled: true,
    bevelThickness: 0.055,
    bevelSize: 0.045,
    bevelSegments: 2,
    curveSegments: 14,
  });
  triggerGuard.translate(0, 0, -0.58);
  paintGeometry(triggerGuard, COYOTE_FDE);

  const cutters: THREE.BufferGeometry[] = [];

  // 3. U-Contoured Dust-Cover Recoil Channel + Central FCU Chassis Receiver Cavity
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.84, 0.84, 7.3, 24)
        .rotateZ(Math.PI / 2)
        .translate(6.25, 1.12, 0),
      COYOTE_INNER
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(7.2, 0.72, 1.78).translate(6.2, 0.72, 0),
      COYOTE_INNER
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(10.05, 1.48, 1.92).translate(-1.68, 0.36, 0),
      COYOTE_INNER
    )
  );
  // Trigger shoe slot opening into trigger guard + reversible triangular mag-catch cross-mortise
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(1.52, 1.25, 0.88).translate(0.02, -0.52, 0),
      COYOTE_INNER
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.82, 0.82, 2.75)
        .rotateZ(P320_GRIP_ANGLE_RAD)
        .translate(-2.35, -2.15, 0),
      COYOTE_INNER
    )
  );

  // 4. Hollow -18 deg Magwell Tunnel + Flared Entry Bevel Funnel
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.64, 12.6, 1.78)
        .rotateZ(P320_GRIP_ANGLE_RAD)
        .translate(-5.25, -4.59, 0),
      COYOTE_INNER
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(1.22, 1.44, 0.55, 16)
        .scale(1.12, 1, 0.74)
        .rotateZ(P320_GRIP_ANGLE_RAD)
        .translate(-6.68, -9.05, 0),
      COYOTE_INNER
    )
  );

  // 5. ICONIC P320 RIGHT-SIDE FCU SERIAL NUMBER CUTOUT WINDOW + RECESSED BEZEL!
  // Reveals gleaming stainless FCU serial plate ("TF004912") on right flank at X in [-1.18, +0.90], Y in [+0.06, +0.58]!
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.08, 0.52, 0.75).translate(-0.14, 0.32, 1.12),
      COYOTE_INNER
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.24, 0.64, 0.16).translate(-0.14, 0.32, 1.22),
      COYOTE_INNER
    )
  );

  // 6. Crisp 3-Slot MIL-STD-1913 Picatinny Dust-Cover Rail (45° V-ridge profile + 3 5.2mm cross-slots)
  for (const sign of [-1, 1]) {
    // Upper Picatinny V-groove undercut above the 21.2mm rail ridge
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(6.65, 0.24, 0.28).translate(
          6.15,
          0.14,
          sign * 1.22
        ),
        COYOTE_INNER
      )
    );
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(6.65, 0.26, 0.26)
          .rotateX(-sign * 0.78)
          .translate(6.15, -0.02, sign * 1.22),
        COYOTE_FDE
      )
    );
    // Lower Picatinny 45-deg side bevels
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(6.7, 0.42, 0.42)
          .rotateX(sign * 0.78)
          .translate(6.15, -0.35, sign * 1.18),
        COYOTE_FDE
      )
    );
  }
  for (const slotX of [4.45, 6.15, 7.85]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.52, 0.26, 2.68).translate(slotX, -0.27, 0),
        COYOTE_INNER
      )
    );
  }

  // 7. Takedown Lever Bore + Slide-Catch Protective Shelf Recesses + Rear M17 Safety Cutouts + Thumb Rests
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 2.8, 20)
        .rotateX(Math.PI / 2)
        .translate(1.85, 0.42, 0),
      COYOTE_INNER
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 2.8, 18)
        .rotateX(Math.PI / 2)
        .translate(-5.75, 0.76, 0),
      COYOTE_INNER
    )
  );
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.18, 0.34, 0.14).translate(
          -2.55,
          0.74,
          sign * 1.24
        ),
        COYOTE_INNER
      )
    );
    cutters.push(
      paintGeometry(
        new THREE.SphereGeometry(0.52, 16, 12)
          .scale(1.5, 0.78, 0.28)
          .translate(-3.95, -0.95, sign * 1.28),
        COYOTE_INNER
      )
    );
  }

  return applyP320GripAtlasUVs(
    sanitizeCsgGeometry(csgSubtract(mergeParts([mainGrip, triggerGuard]), cutters))
  );
}

/**
 * F-02: Rotating Black Nitride Takedown Lever (assembledPos = [1.85, 0.42, 0])
 * Features D-cut cam flat, FCU takedown-safety-lever keyway lug & serrated thumb ledge.
 */
export function buildP320TakedownLeverGeometry(): THREE.BufferGeometry {
  const NITRIDE = '#454f5e';
  const CAM_STEEL = '#586476';

  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 2.48, 22).rotateX(Math.PI / 2),
    CAM_STEEL
  );
  // Internal D-cut cam flat + keyway groove that actuates the FCU Takedown Safety Lever
  const dFlat = paintGeometry(
    new THREE.BoxGeometry(0.5, 0.22, 1.38).translate(0, 0.16, 0),
    '#262c36'
  );
  const oRingGroove = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.48, 0.08).translate(0, 0, 0.98),
    '#262c36'
  );
  const camShaft = csgSubtract(shaft, [dFlat, oRingGroove]);

  // Iconic SIG Sauer angled serrated left-side thumb takedown paddle
  const paddleShape = new THREE.Shape();
  paddleShape.moveTo(-0.24, -0.24);
  paddleShape.lineTo(1.24, -0.26);
  paddleShape.quadraticCurveTo(1.44, -0.08, 1.18, 0.18);
  paddleShape.lineTo(-0.18, 0.26);
  paddleShape.quadraticCurveTo(-0.34, 0.04, -0.24, -0.24);
  paddleShape.closePath();

  const paddle = new THREE.ExtrudeGeometry(paddleShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  paddle.translate(0, 0, -1.38);
  paintGeometry(paddle, NITRIDE);

  const ledgeRaw = paintGeometry(
    new THREE.BoxGeometry(0.98, 0.12, 0.16).translate(0.46, -0.18, -1.45),
    '#586476'
  );
  const serrs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    serrs.push(
      paintGeometry(
        new THREE.BoxGeometry(0.08, 0.05, 0.2).translate(
          0.16 + i * 0.2,
          -0.12,
          -1.48
        ),
        '#262c36'
      )
    );
  }
  const ledge = csgSubtract(ledgeRaw, serrs);

  return mergeParts([camShaft, paddle, ledge]);
}

/**
 * F-03: Stamped Black Nitride Ambidextrous Slide Catch Lever (assembledPos = [0, 0, 0])
 */
export function buildP320SlideCatchGeometry(): THREE.BufferGeometry {
  const NITRIDE = '#454f5e';

  // Internal U-bridge pivoting near trigger pin at X = +0.05, Y = +0.25
  const crossBridge = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.14, 1.88).translate(-0.55, 0.24, 0),
    '#586476'
  );

  const parts: THREE.BufferGeometry[] = [crossBridge];
  for (const sign of [-1, 1]) {
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.05, 0.25, sign * 0.92),
      new THREE.Vector3(-1.05, 0.56, sign * 1.08),
      new THREE.Vector3(-2.15, 0.82, sign * 1.24),
      new THREE.Vector3(-2.88, 0.84, sign * 1.25),
    ]);
    parts.push(
      paintGeometry(
        new THREE.TubeGeometry(armCurve, 16, 0.075, 8, false),
        NITRIDE
      )
    );

    const paddleRaw = paintGeometry(
      new THREE.BoxGeometry(0.9, 0.32, 0.15).translate(
        -2.55,
        0.86,
        sign * 1.28
      ),
      '#586476'
    );
    const padSerrs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      padSerrs.push(
        paintGeometry(
          new THREE.BoxGeometry(0.76, 0.04, 0.06).translate(
            -2.55,
            0.79 + i * 0.07,
            sign * 1.35
          ),
          '#262c36'
        )
      );
    }
    parts.push(csgSubtract(paddleRaw, padSerrs));
  }
  // Left inward follower-actuated lifter tab + wire return spring
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.36, 0.12, 0.42).translate(-2.35, 0.62, -0.96),
      '#cbd5e1'
    )
  );

  return mergeParts(parts);
}

/**
 * F-04: Reversible Rounded-Triangle Checkered Magazine Catch & Coil Spring
 * World assembledPos = [-2.35, -2.15, 0], assembledRot = [0, 0, P320_GRIP_ANGLE_RAD].
 */
export function buildP320MagCatchGeometry(): THREE.BufferGeometry {
  const triShape = new THREE.Shape();
  triShape.moveTo(-0.34, 0.36);
  triShape.quadraticCurveTo(0.38, 0.4, 0.38, 0.04);
  triShape.quadraticCurveTo(0.36, -0.38, -0.18, -0.38);
  triShape.quadraticCurveTo(-0.42, -0.32, -0.34, 0.36);
  triShape.closePath();

  const body = new THREE.ExtrudeGeometry(triShape, {
    depth: 2.38,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  body.translate(0, 0, -1.24);
  paintGeometry(body, '#313640');

  const btnPadRaw = new THREE.ExtrudeGeometry(triShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  btnPadRaw.scale(0.88, 0.88, 1);
  btnPadRaw.translate(0, 0, -1.34);
  paintGeometry(btnPadRaw, '#3b4452');

  // Crisp 3D diamond-grid checkering ribs across triangular thumb button (zero coplanar CSG!)
  const checkPads: THREE.BufferGeometry[] = [];
  for (let iy = -2; iy <= 2; iy++) {
    const py = iy * 0.1;
    const halfSpanX = 0.23 - Math.abs(iy) * 0.035;
    checkPads.push(
      paintGeometry(
        new THREE.BoxGeometry(halfSpanX * 2, 0.032, 0.028).translate(
          0.02,
          py,
          -1.365
        ),
        '#454f5e'
      )
    );
  }
  for (let ix = -2; ix <= 2; ix++) {
    const px = ix * 0.1 + 0.02;
    const halfSpanY = 0.23 - Math.abs(ix) * 0.035;
    checkPads.push(
      paintGeometry(
        new THREE.BoxGeometry(0.032, halfSpanY * 2, 0.028).translate(
          px,
          0,
          -1.368
        ),
        '#454f5e'
      )
    );
  }
  const btnPad = mergeParts([btnPadRaw, ...checkPads]);

  // Reversible polymer locking wedge stop on opposite (+Z) side + internal mag locking tooth
  const wedgeStop = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.42, 0.12).translate(-0.04, 0, 1.14),
    '#3b4452'
  );

  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.22,
      end: 0.22,
      centerX: 0.05,
      centerZ: 0.45,
      coilRadius: 0.1,
      wireRadius: 0.022,
      coils: 5,
    }).rotateX(Math.PI / 2),
    '#cbd5e1'
  );

  return mergeParts([body, btnPad, wedgeStop, spring]);
}

export {
  buildP320FcuChassisGeometry,
  buildP320TriggerShoeGeometry,
  buildP320TriggerBarGeometry,
  buildP320SearGroupGeometry,
  buildP320ManualSafetyGeometry,
  buildP320MagBodyGeometry,
  buildP320MagFollowerGeometry,
  buildP320MagSpringGeometry,
  buildP320MagBaseplateGeometry,
};

export const P320_GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> =
  {
    // 1. Slide & Barrel Assembly (11)
    p320_slide: buildP320SlideGeometry,
    p320_optic_plate_sight: buildP320OpticPlateSightGeometry,
    p320_front_sight: buildP320FrontSightGeometry,
    p320_barrel: buildP320BarrelGeometry,
    p320_recoil_guide_rod: buildP320RecoilGuideRodGeometry,
    p320_recoil_spring: buildP320RecoilSpringGeometry,
    p320_striker: buildP320StrikerGeometry,
    p320_striker_spring: buildP320StrikerSpringGeometry,
    p320_striker_housing: buildP320StrikerHousingGeometry,
    p320_safety_lock: buildP320SafetyLockGeometry,
    p320_extractor: buildP320ExtractorGeometry,

    // 2. Carry Grip Module & Controls (4)
    p320_grip_module: buildP320GripModuleGeometry,
    p320_takedown_lever: buildP320TakedownLeverGeometry,
    p320_slide_catch: buildP320SlideCatchGeometry,
    p320_mag_catch: buildP320MagCatchGeometry,

    // 3. Modular Stainless FCU & M17 Manual Safety (5)
    p320_fcu_chassis: buildP320FcuChassisGeometry,
    p320_trigger_shoe: buildP320TriggerShoeGeometry,
    p320_trigger_bar: buildP320TriggerBarGeometry,
    p320_sear_group: buildP320SearGroupGeometry,
    p320_manual_safety: buildP320ManualSafetyGeometry,

    // 4. 17-Round Steel Magazine w/ Coyote Tan FDE Baseplate (4)
    p320_mag_body: buildP320MagBodyGeometry,
    p320_mag_follower: buildP320MagFollowerGeometry,
    p320_mag_spring: buildP320MagSpringGeometry,
    p320_mag_baseplate: buildP320MagBaseplateGeometry,
  };
