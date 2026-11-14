import * as THREE from 'three';
import {
  clampUv01 as clamp01,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  buildAwmBoltBodyGeometry,
  buildAwmBoltShroudGeometry,
  buildAwmExtractorGeometry,
  buildAwmFiringPinSpringGeometry,
  buildAwmMagBodyGeometry,
  buildAwmMagCatchGeometry,
  buildAwmMagFloorplateGeometry,
  buildAwmMagFollowerGeometry,
  buildAwmMagSpringGeometry,
  buildAwmScopeGeometry,
  buildAwmScopeMountGeometry,
  buildAwmSearGeometry,
  buildAwmStrikerGeometry,
  buildAwmTriggerBoxGeometry,
  buildAwmTriggerShoeGeometry,
  sanitizeAwmMesh,
} from './awmExtraGeometries';
import { buildAwmHelicalLands, mergeAwmCutters } from './awmCadDetail';

export {
  buildAwmBoltBodyGeometry,
  buildAwmBoltShroudGeometry,
  buildAwmExtractorGeometry,
  buildAwmFiringPinSpringGeometry,
  buildAwmMagBodyGeometry,
  buildAwmMagCatchGeometry,
  buildAwmMagFloorplateGeometry,
  buildAwmMagFollowerGeometry,
  buildAwmMagSpringGeometry,
  buildAwmScopeGeometry,
  buildAwmScopeMountGeometry,
  buildAwmSearGeometry,
  buildAwmStrikerGeometry,
  buildAwmTriggerBoxGeometry,
  buildAwmTriggerShoeGeometry,
};

const AWM_OD_GREEN = '#3f4e35'; // Authentic British Olive-Drab Green AI polymer
const AWM_DARK_STEEL = '#46505f'; // Calibrated parkerized ordnance steel
const AWM_PARKERIZED = '#586476'; // Rail, flute, rib & chamfer gunmetal highlight
const AWM_ALLOY_BEAM = '#3b4452'; // Dark anodized CNC alloy / mount block
const AWM_INNER_DARK = '#252b35'; // Recessed bores, slots & baffle interiors
const AWM_MATCH_BARREL = '#737e8c';
const AWM_FLUTE_BRIGHT = '#a3afbf';
const AWM_STAINLESS = '#cfd8e3';
const AWM_MATTE_BLACK = '#313640'; // Matte black Kydex/polyamide saddle & spacer
const AWM_RUBBER_BLACK = '#242830'; // Sorbothane elastomer recoil buttpad
const AWM_SPRING_STEEL = '#64748b';

/**
 * Unwraps British Olive-Drab Green Polymer Chassis Skins & Folding Buttstock onto Zone A (v in [0.50, 0.97])
 * while mapping dark steel hex-bolt heads & hinge hardware onto Zone D1/D4!
 */
function applyAwmChassisUVs(
  geo: THREE.BufferGeometry,
  xMin: number,
  xSpan: number
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, cg, cb, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    // Cool steel/alloy hardware has cb > cg (or cg < cr * 1.12), whereas Olive-Drab #3f4e35 has cg > cb * 2.0!
    const isDarkHardware = (cb > cg || cg < cr * 1.12) && cr < 0.35;
    const isBrightSteel = cr > 0.45;
    const isRight = fnz > 0.3 && cz >= 0;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - xMin) / xSpan);
      const yNorm = clamp01((y - -5.2) / 6.15);

      let u: number;
      let v: number;
      if (isBrightSteel) {
        u = 0.84 + xNorm * 0.12;
        v = 0.03 + clamp01((y + 5.0) / 6.0) * 0.06;
      } else if (isDarkHardware) {
        u = 0.04 + xNorm * 0.2;
        v = 0.03 + clamp01((z + 1.0) / 2.0) * 0.06;
      } else if (isRight) {
        u = 0.05 + xNorm * 0.9;
        v = 0.87 + yNorm * 0.095;
      } else {
        u = 0.05 + (1.0 - xNorm) * 0.9;
        v = 0.64 + yNorm * 0.095;
      }

      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Flat-Sided Steel Action Receiver onto Zone B upper (v in [0.28, 0.45]):
 *  - Left flat wall (-Z): u in [0.035, 0.34] (1 - xNorm -> reads left-to-right "ACCURACY INTERNATIONAL ENGLAND AW .338 LM")
 *  - Right flat wall (+Z): u in [0.365, 0.65] (xNorm -> reads left-to-right "AI PORTSMOUTH UK")
 *  - Bright internal bolt raceways: Zone D4 (u in [0.83, 0.96], v in [0.03, 0.09])
 */
function applyAwmActionReceiverUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    const isBright = cr > 0.42;
    const isLeftWall = fnz < -0.45 && cz < -0.45;
    const isRightWall = fnz > 0.45 && cz > 0.45;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const xNorm = clamp01((x - -5.3) / 10.05);
      const yNorm = clamp01((y - -0.83) / 1.75);

      let u: number;
      let v: number;
      if (isBright) {
        u = 0.83 + xNorm * 0.13;
        v = 0.03 + yNorm * 0.06;
      } else if (isLeftWall) {
        u = 0.035 + (1.0 - xNorm) * 0.305;
        v = 0.29 + yNorm * 0.155;
      } else if (isRightWall) {
        u = 0.365 + xNorm * 0.285;
        v = 0.29 + yNorm * 0.155;
      } else {
        u = 0.38 + xNorm * 0.24;
        v = 0.28 + yNorm * 0.05;
      }

      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// GROUP 2 ('frame'): CHASSIS SKINS, CNC BEAM, ACTION, 27" FLUTED BARREL & FURNITURE
// ============================================================================

/**
 * F-01: Iconic British Olive-Drab Green Two-Piece Polymer Thumbhole Chassis Skins (isShell: true)
 * assembledPos: [0, 0, 0] -> Spans X in [-9.2, +13.8], Y in [-5.15, +0.88], Z in [-0.90, +0.90]
 */
export function buildAwmChassisSkinsGeometry(): THREE.BufferGeometry {
  // 2D Side Silhouette Shape in (X, Y) with enclosed ergonomic Thumbhole & Oversized Arctic Trigger Guard!
  const shape = new THREE.Shape();
  shape.moveTo(-9.2, 0.88); // Top-rear flush hinge seam
  shape.lineTo(-5.05, 0.88);
  shape.lineTo(-4.72, 0.56); // Clearance dip for bent spherical bolt handle
  shape.lineTo(-3.65, 0.56);
  shape.lineTo(-3.35, 0.78); // Action receiver side skirt
  shape.lineTo(4.72, 0.78);
  shape.lineTo(5.15, 0.64); // Forend upper shoulder
  shape.lineTo(13.55, 0.58);
  shape.lineTo(13.8, 0.25); // Chamfered forend nose around bipod spigot
  shape.lineTo(13.8, -0.88);
  shape.lineTo(13.45, -1.18); // Flat tactical sniper forend underside
  shape.lineTo(4.92, -1.18);
  shape.lineTo(4.62, -1.85); // Long-action .338 LM magwell step-down (flush with awm_mag_body Y = -1.85!)
  shape.lineTo(-1.88, -1.85);
  shape.lineTo(-2.08, -2.85); // Oversized Arctic glove trigger guard bottom bow
  shape.lineTo(-4.05, -2.85);
  // Swept-BACK ergonomic sniper pistol grip front strap (sweeps rearward from X=-4.05 at top to X=-4.75 at bottom!)
  shape.bezierCurveTo(-4.22, -3.45, -4.48, -4.35, -4.75, -5.15);
  // Lower thumbhole bridge bar connecting pistol grip heel to rear stock bridge
  shape.lineTo(-6.05, -5.15);
  shape.bezierCurveTo(-7.15, -5.05, -8.25, -4.65, -8.85, -4.4);
  shape.lineTo(-9.2, -4.4); // Bottom-rear flush hinge seam (matches awm_folding_stock Y = -4.40!)
  shape.closePath();

  // HOLE 1: Authentic Accuracy International Enclosed Oval/Teardrop Thumbhole Cutout!
  const thumbHole = new THREE.Path();
  thumbHole.moveTo(-5.55, -0.58); // Top-front behind grip tang
  thumbHole.bezierCurveTo(-5.68, -1.65, -5.92, -2.95, -6.15, -3.98); // Rearward-swept backstrap of pistol grip!
  thumbHole.bezierCurveTo(-6.72, -4.12, -7.45, -3.95, -7.95, -3.68); // Smooth bottom arch above bridge
  thumbHole.bezierCurveTo(-8.18, -2.65, -8.18, -1.45, -7.92, -0.62); // Rear pillar wall
  thumbHole.bezierCurveTo(-7.25, -0.38, -6.22, -0.38, -5.55, -0.58); // Upper tang arch
  shape.holes.push(thumbHole);

  // HOLE 2: Oversized Arctic Trigger Guard Window
  const trigHole = new THREE.Path();
  trigHole.moveTo(-2.18, -1.25);
  trigHole.lineTo(-2.24, -2.48);
  trigHole.lineTo(-3.82, -2.48);
  trigHole.lineTo(-3.94, -1.25);
  trigHole.closePath();
  shape.holes.push(trigHole);

  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: 1.66,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 2,
    curveSegments: 16,
  });
  extruded.translate(0, 0, -0.83);
  paintGeometry(extruded, AWM_OD_GREEN);

  // Group exterior counterbores, fuller grooves, parting seams & sling slot into ONE merged cutter brush,
  // and group mutually-disjoint axial interior pockets into merged brushes (27 sequential CSG passes -> 4!).
  const boltCoords: [number, number][] = [
    [-8.55, -1.85],
    [-4.95, -2.15],
    [-1.45, -0.85],
    [4.25, -0.85],
    [7.2, -0.58],
    [10.0, -0.58],
    [12.7, -0.58],
  ];
  const extras: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.065, 0.065, 0.88, 12).translate(
        11.45,
        -0.58,
        -0.82
      ),
      AWM_DARK_STEEL
    ),
  ];
  const exteriorDisjointCutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(7.6, 0.24, 0.16).translate(9.2, -0.18, 0.9),
      AWM_OD_GREEN
    ),
    paintGeometry(
      new THREE.BoxGeometry(7.6, 0.24, 0.16).translate(9.2, -0.18, -0.9),
      AWM_OD_GREEN
    ),
    paintGeometry(
      new THREE.BoxGeometry(8.6, 0.08, 0.05).translate(9.2, -1.24, 0),
      AWM_OD_GREEN
    ),
    paintGeometry(
      new THREE.BoxGeometry(4.4, 0.1, 0.05).translate(-6.9, -5.18, 0),
      AWM_OD_GREEN
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.42, 0.86, 0.24).translate(11.45, -0.58, -0.88),
      AWM_OD_GREEN
    ),
    paintGeometry(
      new THREE.SphereGeometry(0.64, 18, 14).translate(-4.88, 0.2, 1.12),
      AWM_OD_GREEN
    ),
  ];
  for (const [bx, by] of boltCoords) {
    for (const side of [-1, 1]) {
      exteriorDisjointCutters.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.165, 0.165, 0.22, 14)
            .rotateX(Math.PI / 2)
            .translate(bx, by, side * 0.88),
          AWM_OD_GREEN
        )
      );
      extras.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.115, 0.115, 0.08, 6)
            .rotateX(Math.PI / 2)
            .translate(bx, by, side * 0.81),
          AWM_DARK_STEEL
        )
      );
    }
  }

  const carved = csgSubtract(extruded, [
    paintGeometry(
      new THREE.BoxGeometry(22.9, 1.35, 1.12).translate(2.35, -0.18, 0),
      AWM_OD_GREEN
    ),
    // Rear shroud (-7.1), free-float barrel U-channel (+9.1) & front spigot bore (+13.5, Y=-0.35) are disjoint!
    mergeAwmCutters([
      paintGeometry(
        new THREE.BoxGeometry(4.6, 0.95, 0.98).translate(-7.1, 0.72, 0),
        AWM_OD_GREEN
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.82, 0.82, 10.2, 24)
          .rotateZ(Math.PI / 2)
          .translate(9.1, 1.05, 0),
        AWM_OD_GREEN
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.36, 0.36, 1.8, 18)
          .rotateZ(Math.PI / 2)
          .translate(13.5, -0.35, 0),
        AWM_OD_GREEN
      ),
    ]),
    // Action bedding (-0.28, Y=+0.65) + disjoint lower trigger (-2.95) & magwell (+1.35)
    paintGeometry(
      new THREE.BoxGeometry(10.15, 1.6, 1.38).translate(-0.28, 0.65, 0),
      AWM_OD_GREEN
    ),
    mergeAwmCutters([
      paintGeometry(
        new THREE.BoxGeometry(6.42, 3.2, 1.32).translate(1.35, -0.95, 0),
        AWM_OD_GREEN
      ),
      paintGeometry(
        new THREE.BoxGeometry(2.55, 2.35, 0.86).translate(-2.95, -0.92, 0),
        AWM_OD_GREEN
      ),
    ]),
    mergeAwmCutters(exteriorDisjointCutters),
  ]);
  const merged = sanitizeAwmMesh(mergeParts([carved, ...extras]));
  return applyAwmChassisUVs(merged, -9.2, 23.0);
}

/**
 * F-02: Internal Full-Length CNC 7075-T6 Aluminum Chassis Spine Beam
 * assembledPos: [0, 0, 0] -> Continuous rigid billet backbone from X = -9.2 to front spigot X = +14.88!
 */
export function buildAwmChassisBeamGeometry(): THREE.BufferGeometry {
  const mainBeam = paintGeometry(
    new THREE.BoxGeometry(23.0, 1.24, 1.06).translate(2.3, -0.24, 0),
    AWM_ALLOY_BEAM
  );
  const magwellSkirt = paintGeometry(
    new THREE.BoxGeometry(6.64, 1.08, 1.18).translate(1.35, -1.26, 0),
    AWM_ALLOY_BEAM
  );
  const gripCoreTang = paintGeometry(
    new THREE.BoxGeometry(1.05, 2.88, 0.72)
      .rotateZ(0.18)
      .translate(-4.95, -1.95, 0),
    AWM_ALLOY_BEAM
  );
  const rearHingeBlock = paintGeometry(
    new THREE.BoxGeometry(1.18, 3.64, 1.04).translate(-8.62, -1.4, 0),
    AWM_ALLOY_BEAM
  );
  // Left-rear clevis hinge knuckles mating with awm_folding_stock hinge pin
  const hingeLugTop = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 0.68, 16).translate(
      -9.2,
      -0.15,
      -0.88
    ),
    AWM_DARK_STEEL
  );
  const hingeLugBot = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 0.68, 16).translate(
      -9.2,
      -3.15,
      -0.88
    ),
    AWM_DARK_STEEL
  );

  // CNC-milled rectangular lightening truss pockets along forend beam [5.8..12.2] + disjoint trigger & magwell cuts
  const disjointBeamCutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(6.36, 2.55, 1.02).translate(1.35, -0.85, 0),
      AWM_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.42, 1.62, 0.78).translate(-3.05, -0.55, 0),
      AWM_INNER_DARK
    ),
  ];
  for (const px of [5.85, 7.95, 10.05, 12.15]) {
    disjointBeamCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.52, 0.68, 1.3).translate(px, -0.26, 0),
        AWM_INNER_DARK
      )
    );
  }

  const machinedBeam = csgSubtract(
    csgUnion([
      mainBeam,
      mergeAwmCutters([magwellSkirt, gripCoreTang, rearHingeBlock]),
    ]),
    [
      paintGeometry(
        new THREE.BoxGeometry(10.08, 0.56, 0.92).translate(-0.28, 0.26, 0),
        AWM_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.38, 0.44, 1.12).translate(4.45, 0.12, 0),
        AWM_INNER_DARK
      ),
      mergeAwmCutters(disjointBeamCutters),
    ]
  );

  // Action-bolting steel pillars + hardened stainless front Parker-Hale bipod spigot w/ detent plunger
  const actionPillarRear = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.18, 14).translate(-4.25, -0.26, 0),
    AWM_STAINLESS
  );
  const actionPillarFront = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.18, 14).translate(3.95, -0.26, 0),
    AWM_STAINLESS
  );
  const frontSpigot = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 1.38, 22)
      .rotateZ(Math.PI / 2)
      .translate(14.2, -0.35, 0),
    AWM_STAINLESS
  );
  const spigotStopCollar = paintGeometry(
    new THREE.CylinderGeometry(0.35, 0.35, 0.16, 20)
      .rotateZ(Math.PI / 2)
      .translate(13.72, -0.35, 0),
    AWM_DARK_STEEL
  );
  const spigotDetentPlunger = paintGeometry(
    new THREE.SphereGeometry(0.075, 12, 10).translate(14.55, -0.61, 0),
    AWM_DARK_STEEL
  );
  const recoilCrossPin = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 1.1, 14)
      .rotateX(Math.PI / 2)
      .translate(4.45, -0.1, 0),
    AWM_STAINLESS
  );

  return sanitizeAwmMesh(
    mergeParts([
      machinedBeam,
      hingeLugTop,
      hingeLugBot,
      actionPillarRear,
      actionPillarFront,
      frontSpigot,
      spigotStopCollar,
      spigotDetentPlunger,
      recoilCrossPin,
    ])
  );
}

/**
 * F-03: Flat-Sided Machined Steel Portsmouth Magnum Action Receiver w/ Integral Picatinny/Dovetail Rail (isShell: true)
 * assembledPos: [0, 1.05, 0] -> Local X in [-5.3, +4.75], World Y in [+0.22, +2.26]
 */
export function buildAwmActionReceiverGeometry(): THREE.BufferGeometry {
  // Iconic Portsmouth AI flat-sided octagonal ordnance-steel Magnum receiver + integral 11mm AI dovetail &
  // 45°-beveled MIL-STD-1913 Picatinny top rail extruded directly from one crisp 2D profile (eliminates 5 CSG passes!)
  const recProfile = new THREE.Shape();
  recProfile.moveTo(-0.56, -0.83); // Bottom V-bedding flat
  recProfile.lineTo(0.56, -0.83);
  recProfile.lineTo(0.78, -0.61); // Lower 45° V-bedding bevel
  recProfile.lineTo(0.78, 0.56); // Flat vertical side slab
  recProfile.lineTo(0.41, 0.93); // Upper 45° octagonal shoulder bevel
  recProfile.lineTo(0.35, 0.93); // Integral rail undercut neck (11mm dovetail root)
  recProfile.lineTo(0.42, 1.01); // 45° lower Picatinny dovetail flare
  recProfile.lineTo(0.42, 1.155);
  recProfile.lineTo(0.365, 1.21); // 45° upper Picatinny dovetail chamfer
  recProfile.lineTo(-0.365, 1.21); // Top rail deck (Y = +1.21 -> World Y = +2.26)
  recProfile.lineTo(-0.42, 1.155);
  recProfile.lineTo(-0.42, 1.01);
  recProfile.lineTo(-0.35, 0.93);
  recProfile.lineTo(-0.41, 0.93);
  recProfile.lineTo(-0.78, 0.56);
  recProfile.lineTo(-0.78, -0.61);
  recProfile.closePath();

  const rawReceiver = new THREE.ExtrudeGeometry(recProfile, {
    depth: 10.05,
    steps: 18,
    bevelEnabled: false,
  });
  rawReceiver.rotateY(Math.PI / 2);
  rawReceiver.translate(-5.305, 0, 0);
  paintGeometry(rawReceiver, AWM_DARK_STEEL);

  // 15 MIL-STD-1913 Picatinny recoil cross-slots + left emergency gas-relief port + right bolt-handle notch — ALL mutually disjoint!
  const slotAndPortCutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.095, 0.095, 0.45, 14)
        .rotateX(Math.PI / 2)
        .translate(2.95, 0.24, -0.68),
      AWM_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.8, 0.7, 0.86).translate(-4.18, -0.12, 0.55),
      AWM_INNER_DARK
    ),
    // Trim rail ends cleanly at [-5.15, +4.65] so front/rear receiver ring shoulders step down authentically
    paintGeometry(
      new THREE.BoxGeometry(0.36, 0.34, 1.0).translate(-5.25, 1.09, 0),
      AWM_PARKERIZED
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.24, 0.34, 1.0).translate(4.72, 1.09, 0),
      AWM_PARKERIZED
    ),
  ];
  for (let sx = -4.75; sx <= 4.35; sx += 0.65) {
    slotAndPortCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.24, 0.14, 1.0).translate(sx, 1.18, 0),
        AWM_INNER_DARK
      )
    );
  }

  const receiverShell = csgSubtract(rawReceiver, [
    // Central bolt raceway & chamber tenon bore (R = 0.56)
    paintGeometry(
      new THREE.CylinderGeometry(0.56, 0.56, 10.5, 28)
        .rotateZ(Math.PI / 2)
        .translate(-0.28, 0, 0),
      AWM_INNER_DARK
    ),
    // Right-side .338 LM ejection port (+0.65, Y=+0.28) & bottom magwell feed slot (+1.32, Y=-0.65) are disjoint in Y!
    mergeAwmCutters([
      paintGeometry(
        new THREE.BoxGeometry(4.4, 0.72, 0.95)
          .rotateX(-0.22)
          .translate(0.65, 0.28, 0.55),
        AWM_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(5.96, 0.76, 0.94).translate(1.32, -0.65, 0),
        AWM_INNER_DARK
      ),
    ]),
    // Rear sear/shroud tang slots
    paintGeometry(
      new THREE.BoxGeometry(2.86, 0.68, 0.44).translate(-3.82, -0.64, 0),
      AWM_INNER_DARK
    ),
    mergeAwmCutters(slotAndPortCutters),
  ]);

  // Bright-steel internal 6-lug locking abutment rings, 3 longitudinal raceway rails & integral front recoil lug
  const lockRingFront = paintGeometry(
    new THREE.TorusGeometry(0.54, 0.052, 10, 26)
      .rotateY(Math.PI / 2)
      .translate(2.42, 0, 0),
    AWM_STAINLESS
  );
  const lockRingRear = paintGeometry(
    new THREE.TorusGeometry(0.54, 0.048, 10, 26)
      .rotateY(Math.PI / 2)
      .translate(1.78, 0, 0),
    AWM_STAINLESS
  );
  const racewayL = paintGeometry(
    new THREE.BoxGeometry(6.8, 0.1, 0.08).translate(-1.6, 0.08, -0.52),
    AWM_STAINLESS
  );
  const racewayR = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.1, 0.08).translate(-3.2, -0.22, 0.5),
    AWM_STAINLESS
  );
  const recoilLug = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.42, 1.06).translate(4.45, -0.92, 0),
    AWM_PARKERIZED
  );

  const merged = sanitizeAwmMesh(
    mergeParts([
      receiverShell,
      lockRingFront,
      lockRingRear,
      racewayL,
      racewayR,
      recoilLug,
    ])
  );
  return applyAwmActionReceiverUVs(merged);
}

/**
 * F-04: 27" Longitudinally Fluted Free-Floated Stainless Match Barrel (.338 Lapua Magnum, 1:10" Twist)
 * assembledPos: [0, 1.05, 0] -> Spans X in [+2.84, +29.0] (threads into receiver [+2.88..+4.75] & brake [+28.05..+29.0]!)
 */
export function buildAwmBarrelGeometry(): THREE.BufferGeometry {
  // Closed watertight hollow LatheGeometry: M27 breech tenon -> heavy chamber -> 27" match taper -> M18 spigot ->
  // recessed 11° target crown dish -> full .338 (8.6mm) bore -> bottleneck .338 Lapua Magnum 70mm chamber!
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.39, 2.88),
    new THREE.Vector2(0.54, 2.88), // Threaded M27x2 breech tenon inside steel Magnum action
    new THREE.Vector2(0.54, 4.64),
    new THREE.Vector2(0.515, 4.67), // Precision thread-relief undercut groove ahead of receiver face
    new THREE.Vector2(0.515, 4.73),
    new THREE.Vector2(0.74, 4.76), // Heavy chamber cylinder flush against receiver front face X = +4.75
    new THREE.Vector2(0.74, 8.15),
    new THREE.Vector2(0.68, 8.85), // Match contour taper start
    new THREE.Vector2(0.55, 27.25), // 27" free-floating heavy sniper contour
    new THREE.Vector2(0.55, 28.05), // Muzzle brake shoulder flush at X = +28.05
    new THREE.Vector2(0.41, 28.08), // Thread relief undercut
    new THREE.Vector2(0.43, 28.12), // M18x1.5 threaded muzzle spigot inside AI muzzle brake
    new THREE.Vector2(0.43, 28.98),
    new THREE.Vector2(0.41, 29.0), // 45° outer crown chamfer
    new THREE.Vector2(0.355, 29.0), // Flat outer crown rim
    new THREE.Vector2(0.355, 28.972), // Recessed crown counterbore step
    // True 11° target muzzle crown cone: (0.355 - 0.215) * tan(11°) ≈ 0.027 deep into the .338 bore
    new THREE.Vector2(0.215, 28.945),
    // ---- closed hollow bore & .338 Lapua Magnum chamber ----
    new THREE.Vector2(0.215, 6.72),
    new THREE.Vector2(0.245, 6.42), // Freebore leade throat cone
    new THREE.Vector2(0.245, 5.98), // .338 LM case neck
    new THREE.Vector2(0.348, 5.66), // 20° bottleneck shoulder
    new THREE.Vector2(0.378, 3.04), // Tapered 14.9mm-base .338 LM case body
    new THREE.Vector2(0.415, 2.92), // Polished breech chamber throat chamfer
    new THREE.Vector2(0.39, 2.88),
  ];
  const outer = new THREE.LatheGeometry(pts, 36);
  outer.rotateZ(-Math.PI / 2);
  paintGeometry(outer, AWM_MATCH_BARREL);
  {
    const pos = outer.getAttribute('position');
    const col = outer.getAttribute('color');
    const dark = new THREE.Color(AWM_INNER_DARK);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getY(i), pos.getZ(i));
      const x = pos.getX(i);
      if (r < 0.395 && x > 2.91 && x < 28.98) {
        col.setXYZ(i, dark.r, dark.g, dark.b);
      }
    }
  }

  // 6 ball-endmill longitudinal flutes (hemispherical ends!) + 2 AI barrel-wrench flats — ALL 8 mutually disjoint!
  const fluteAndFlatCutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(0.68, 0.72, 0.18).translate(5.35, 0, 0.74),
      AWM_FLUTE_BRIGHT
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.68, 0.72, 0.18).translate(5.35, 0, -0.74),
      AWM_FLUTE_BRIGHT
    ),
  ];
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    const rMid = 0.635;
    const fy = Math.cos(ang) * rMid;
    const fz = Math.sin(ang) * rMid;
    const fluteCutter = new THREE.CapsuleGeometry(0.135, 17.5, 4, 12);
    fluteCutter.rotateZ(Math.PI / 2);
    const tilt = 0.0065;
    fluteCutter.rotateY(Math.sin(ang) * tilt);
    fluteCutter.rotateZ(Math.cos(ang) * -tilt);
    fluteCutter.translate(17.75, fy, fz);
    paintGeometry(fluteCutter, AWM_FLUTE_BRIGHT);
    fluteAndFlatCutters.push(fluteCutter);
  }

  const flutedBarrel = csgSubtract(outer, [
    mergeAwmCutters(fluteAndFlatCutters),
  ]);

  // Polished stainless chamber feed cone + 6 helical 1:10" (25.4cm) right-hand twist .338 rifling lands
  // visible inside the recessed 11° muzzle crown & chamber leade!
  const twist = (Math.PI * 2) / 25.4;
  const extras: THREE.BufferGeometry[] = [
    flutedBarrel,
    paintGeometry(
      new THREE.TorusGeometry(0.44, 0.058, 10, 24)
        .rotateY(Math.PI / 2)
        .translate(2.9, 0, 0),
      AWM_STAINLESS
    ),
    paintGeometry(
      buildAwmHelicalLands({
        count: 6,
        boreRadius: 0.215,
        height: 0.024,
        halfAngle: 0.12,
        x0: 25.2,
        x1: 28.94,
        twist,
        segments: 10,
        phase: 0.15,
      }),
      AWM_STAINLESS
    ),
    paintGeometry(
      buildAwmHelicalLands({
        count: 6,
        boreRadius: 0.215,
        height: 0.024,
        halfAngle: 0.12,
        x0: 6.75,
        x1: 9.25,
        twist,
        segments: 6,
        phase: 0.15,
      }),
      AWM_STAINLESS
    ),
  ];

  return sanitizeAwmMesh(mergeParts(extras));
}

/**
 * F-05: Accuracy International Slab-Sided Two-Chamber Tactical Muzzle Brake (L115A3 Spec)
 * assembledPos: [29.5, 1.05, 0] -> Local X in [-1.50, +1.50] -> World X in [+28.0, +31.0] (exact crown at +31.0!)
 */
export function buildAwmMuzzleBrakeGeometry(): THREE.BufferGeometry {
  // Rear threaded AI tactical suppressor-attachment collar built as a closed hollow LatheGeometry (local X in [-1.50, -0.74])
  const rearCollar = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.43, -1.5),
      new THREE.Vector2(0.59, -1.5),
      new THREE.Vector2(0.61, -0.74),
      new THREE.Vector2(0.43, -0.74),
      new THREE.Vector2(0.43, -1.5),
    ],
    28
  );
  rearCollar.rotateZ(-Math.PI / 2);
  paintGeometry(rearCollar, AWM_DARK_STEEL);

  // Iconic chamfered octagonal-slab AI double-baffle brake body extruded directly from 2D profile (local X in [-0.78, +1.50])
  const slabSec = new THREE.Shape();
  slabSec.moveTo(-0.56, -0.66);
  slabSec.lineTo(0.56, -0.66);
  slabSec.lineTo(0.84, -0.38); // 45° longitudinal corner bevels (eliminates 4 CSG bevel passes!)
  slabSec.lineTo(0.84, 0.38);
  slabSec.lineTo(0.56, 0.66);
  slabSec.lineTo(-0.56, 0.66);
  slabSec.lineTo(-0.84, 0.38);
  slabSec.lineTo(-0.84, -0.38);
  slabSec.closePath();

  const slabRaw = new THREE.ExtrudeGeometry(slabSec, {
    depth: 2.28,
    steps: 8,
    bevelEnabled: false,
  });
  slabRaw.rotateY(Math.PI / 2);
  slabRaw.translate(-0.78, 0, 0);
  paintGeometry(slabRaw, AWM_DARK_STEEL);

  // Stepped 11° target exit crown cutter profile at X = +1.50 (World X = +31.00!)
  const crownDish = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, 1.24),
      new THREE.Vector2(0.235, 1.24),
      new THREE.Vector2(0.42, 1.44), // 11° recessed target exit dish
      new THREE.Vector2(0.47, 1.44), // Stepped crown land
      new THREE.Vector2(0.47, 1.56),
      new THREE.Vector2(0.001, 1.56),
    ],
    24
  );
  crownDish.rotateZ(-Math.PI / 2);

  // 3 clean merged CSG passes on the slab body:
  //   Pass 1: Central .338 projectile passage (R = 0.235)
  //   Pass 2: Disjoint axial plenums — rear spigot socket (-0.78..-0.48), Ch.1 plenum (-0.18), Ch.2 plenum (+0.76), 11° exit crown (+1.44)
  //   Pass 3: Disjoint rearward-swept Ch.1 & Ch.2 exhaust ports (piercing straight through Z so hollow baffles are open!) + top gas-biasing ports
  const brakeSlab = csgSubtract(slabRaw, [
    paintGeometry(
      new THREE.CylinderGeometry(0.235, 0.235, 2.6, 24)
        .rotateZ(Math.PI / 2)
        .translate(0.36, 0, 0),
      AWM_INNER_DARK
    ),
    mergeAwmCutters([
      paintGeometry(
        new THREE.CylinderGeometry(0.435, 0.435, 0.38, 22)
          .rotateZ(Math.PI / 2)
          .translate(-0.64, 0, 0),
        AWM_INNER_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.46, 0.43, 0.56, 22)
          .rotateZ(Math.PI / 2)
          .translate(-0.18, 0, 0),
        AWM_INNER_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.45, 0.42, 0.56, 22)
          .rotateZ(Math.PI / 2)
          .translate(0.76, 0, 0),
        AWM_INNER_DARK
      ),
      paintGeometry(crownDish, AWM_INNER_DARK),
    ]),
    mergeAwmCutters([
      // Swept Chamber 1 & Chamber 2 exhaust ports (Left & Right) exposing internal V-splitter & front baffle walls
      paintGeometry(
        new THREE.BoxGeometry(0.64, 0.86, 1.05)
          .rotateY(0.22)
          .translate(-0.18, 0, 0.5),
        AWM_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.64, 0.86, 1.05)
          .rotateY(-0.22)
          .translate(-0.18, 0, -0.5),
        AWM_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.64, 0.86, 1.05)
          .rotateY(0.22)
          .translate(0.76, 0, 0.5),
        AWM_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.64, 0.86, 1.05)
          .rotateY(-0.22)
          .translate(0.76, 0, -0.5),
        AWM_INNER_DARK
      ),
      // Top anti-muzzle-rise pressure-equalizing compensator ports into Ch.1 & Ch.2
      paintGeometry(
        new THREE.CylinderGeometry(0.085, 0.085, 0.36, 12).translate(
          -0.16,
          0.56,
          -0.24
        ),
        AWM_INNER_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.085, 0.085, 0.36, 12).translate(
          -0.16,
          0.56,
          0.24
        ),
        AWM_INNER_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.08, 0.08, 0.36, 12).translate(
          0.78,
          0.56,
          -0.24
        ),
        AWM_INNER_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.08, 0.08, 0.36, 12).translate(
          0.78,
          0.56,
          0.24
        ),
        AWM_INNER_DARK
      ),
    ]),
  ]);

  // Fine external AI suppressor-mounting thread rings + knurled shoulder ring (max Y = 0.673) +
  // stainless internal baffle jet-stripper aperture rings + 6 helical .338 throat rifling lands!
  const extras: THREE.BufferGeometry[] = [
    rearCollar,
    brakeSlab,
    paintGeometry(
      new THREE.TorusGeometry(0.625, 0.048, 10, 28)
        .rotateY(Math.PI / 2)
        .translate(-0.82, 0, 0),
      AWM_PARKERIZED
    ),
    // Internal baffle jet-stripper rings on Ch.1->Ch.2 splitter (X=+0.29) & front baffle throat (X=+1.24)
    paintGeometry(
      new THREE.TorusGeometry(0.245, 0.02, 8, 22)
        .rotateY(Math.PI / 2)
        .translate(0.29, 0, 0),
      AWM_STAINLESS
    ),
    paintGeometry(
      new THREE.TorusGeometry(0.245, 0.018, 8, 22)
        .rotateY(Math.PI / 2)
        .translate(1.24, 0, 0),
      AWM_STAINLESS
    ),
    paintGeometry(
      buildAwmHelicalLands({
        count: 6,
        boreRadius: 0.235,
        height: 0.02,
        halfAngle: 0.11,
        x0: -0.62,
        x1: -0.44,
        twist: (Math.PI * 2) / 25.4,
        segments: 3,
      }),
      AWM_STAINLESS
    ),
  ];
  for (const tx of [-1.38, -1.24, -1.1, -0.96]) {
    extras.push(
      paintGeometry(
        new THREE.TorusGeometry(0.6, 0.016, 8, 26)
          .rotateY(Math.PI / 2)
          .translate(tx, 0, 0),
        AWM_PARKERIZED
      )
    );
  }

  return sanitizeAwmMesh(mergeParts(extras));
}

/**
 * F-06: Left-Hinged Folding Rear Buttstock Section (AWM-F / L115A3)
 * assembledPos: [-9.2, 0, 0] -> Local X in [-10.3, 0.0] -> World X in [-19.5, -9.2]
 * Mates 100% FLUSH at X = -9.2 with awm_chassis_skins and at X = -19.5 with awm_buttpad_spacers!
 */
export function buildAwmFoldingStockGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.88); // Front hinge top (World [-9.2, +0.88])
  shape.lineTo(-1.55, 0.88);
  shape.lineTo(-1.85, 0.56); // Recessed comb saddle for adjustable black cheekpiece!
  shape.lineTo(-8.2, 0.56);
  shape.lineTo(-8.5, 0.88);
  shape.lineTo(-10.3, 0.88); // Rear buttpad top (World [-19.5, +0.88])
  shape.lineTo(-10.3, -4.4); // Rear buttpad toe (World [-19.5, -4.40])
  shape.lineTo(-8.45, -4.4); // Iconic AI tactical rear bag-rider hook toe!
  shape.lineTo(-7.95, -2.92); // Support-hand clamping step cutout
  shape.lineTo(-3.65, -2.92);
  shape.bezierCurveTo(-2.45, -3.55, -1.2, -4.25, 0, -4.4); // Smooth bridge to front hinge bottom (World [-9.2, -4.40])
  shape.closePath();

  // Central L115A3 weight-saving / sling oval cutout through rear stock body
  const stockWindow = new THREE.Path();
  stockWindow.moveTo(-2.75, -0.45);
  stockWindow.lineTo(-7.45, -0.45);
  stockWindow.lineTo(-7.65, -1.95);
  stockWindow.lineTo(-2.55, -2.15);
  stockWindow.closePath();
  shape.holes.push(stockWindow);

  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: 1.56,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  extruded.translate(0, 0, -0.78);
  paintGeometry(extruded, AWM_OD_GREEN);

  // Counterbores for two-piece skin hex bolts + cheekpiece guide post bores + parting seam
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 1.2, 14).translate(-3.05, 0.4, 0),
      AWM_OD_GREEN
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 1.2, 14).translate(-6.75, 0.4, 0),
      AWM_OD_GREEN
    ),
    paintGeometry(
      new THREE.BoxGeometry(4.2, 0.08, 0.05).translate(-5.8, -2.95, 0),
      AWM_OD_GREEN
    ),
  ];

  const stockBoltCoords: [number, number][] = [
    [-1.15, -0.85],
    [-1.25, -3.35],
    [-9.15, -0.65],
    [-9.15, -3.45],
  ];
  const hardware: THREE.BufferGeometry[] = [
    // Left-side heavy steel folding hinge barrel & captive stainless hinge pin
    paintGeometry(
      new THREE.CylinderGeometry(0.28, 0.28, 2.35, 18).translate(
        0,
        -1.65,
        -0.88
      ),
      AWM_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.14, 0.14, 4.18, 16).translate(
        0,
        -1.65,
        -0.88
      ),
      AWM_STAINLESS
    ),
    // Left-side spring-loaded folding stock release latch button
    paintGeometry(
      new THREE.BoxGeometry(0.54, 0.48, 0.24).translate(-0.42, -0.62, -0.86),
      AWM_DARK_STEEL
    ),
    // Right-side folded-position retention catch socket
    paintGeometry(
      new THREE.CylinderGeometry(0.22, 0.22, 0.24, 16)
        .rotateX(Math.PI / 2)
        .translate(-5.1, -1.25, 0.84),
      AWM_DARK_STEEL
    ),
    // Left-rear tactical sling loop bar
    paintGeometry(
      new THREE.BoxGeometry(0.18, 0.76, 0.28).translate(-9.45, -1.95, -0.86),
      AWM_DARK_STEEL
    ),
  ];

  for (const [bx, by] of stockBoltCoords) {
    for (const side of [-1, 1]) {
      cutters.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.15, 0.15, 0.22, 14)
            .rotateX(Math.PI / 2)
            .translate(bx, by, side * 0.82),
          AWM_OD_GREEN
        )
      );
      hardware.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.105, 0.105, 0.08, 6)
            .rotateX(Math.PI / 2)
            .translate(bx, by, side * 0.76),
          AWM_DARK_STEEL
        )
      );
    }
  }

  const carvedStock = csgSubtract(extruded, [mergeAwmCutters(cutters)]);
  const merged = sanitizeAwmMesh(mergeParts([carvedStock, ...hardware]));
  return applyAwmChassisUVs(merged, -10.3, 10.3);
}

/**
 * F-07: Adjustable Matte-Black Saddle Cheekpiece w/ Twin Stainless Guide Posts & Clamping Screws
 * assembledPos: [-14.1, 1.35, 0] -> Posts descend to Local Y = -1.05 (World Y = +0.30 inside stock comb, ZERO GAP!)
 */
export function buildAwmCheekpieceGeometry(): THREE.BufferGeometry {
  // Inverted-U ergonomic Kydex/polymer cheek saddle (local X in [-3.225, +2.625] -> World X in [-17.325, -11.475],
  // giving 100% bolt-shroud & 3-position wing-safety clearance at full -4.85 long-action bolt draw!)
  const outerSaddle = paintGeometry(
    new THREE.CylinderGeometry(0.75, 0.84, 5.85, 26)
      .rotateZ(Math.PI / 2)
      .scale(1, 0.92, 0.98)
      .translate(-0.3, 0.02, 0),
    AWM_MATTE_BLACK
  );
  const underCut = paintGeometry(
    new THREE.BoxGeometry(6.2, 0.85, 1.18).translate(-0.3, -0.56, 0),
    AWM_MATTE_BLACK
  );
  const frontBevel = paintGeometry(
    new THREE.BoxGeometry(0.95, 1.2, 1.8)
      .rotateZ(-0.46)
      .translate(2.58, 0.32, 0),
    AWM_MATTE_BLACK
  );
  const saddle = csgSubtract(outerSaddle, [underCut, frontBevel]);

  // Twin vertical stainless steel elevation guide rods w/ calibration rings + right-side clamping thumbscrews
  const extras: THREE.BufferGeometry[] = [saddle];
  for (const px of [1.85, -1.85]) {
    extras.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.14, 0.14, 1.38, 16).translate(
          px,
          -0.45,
          0
        ),
        AWM_STAINLESS
      ),
      paintGeometry(
        new THREE.TorusGeometry(0.144, 0.015, 8, 16)
          .rotateX(Math.PI / 2)
          .translate(px, -0.32, 0),
        AWM_PARKERIZED
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.24, 0.24, 0.24, 18)
          .rotateX(Math.PI / 2)
          .translate(px, -0.62, 0.82),
        AWM_DARK_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.08, 0.08, 0.28, 6)
          .rotateX(Math.PI / 2)
          .translate(px, -0.62, 0.84),
        AWM_STAINLESS
      )
    );
  }

  return sanitizeAwmMesh(mergeParts(extras));
}

/**
 * F-08: Sorbothane Recoil Buttpad & Removable Length-of-Pull (LOP) Spacers
 * assembledPos: [-19.5, -1.76, 0] -> Local X in [-1.50, +0.05] (World X in [-21.0, -19.45]), World Y in [-4.40, +0.88]
 */
export function buildAwmButtpadSpacersGeometry(): THREE.BufferGeometry {
  // Two removable LOP polymer/alloy spacers flush against rear stock at X = -19.5
  const spacer1 = paintGeometry(
    new THREE.BoxGeometry(0.3, 5.26, 1.52).translate(-0.1, 0, 0),
    AWM_MATTE_BLACK
  );
  const spacer2 = paintGeometry(
    new THREE.BoxGeometry(0.3, 5.24, 1.5).translate(-0.44, 0, 0),
    AWM_ALLOY_BEAM
  );

  // Thick Sorbothane recoil pad w/ curved shoulder contour & horizontal anti-slip ribs
  const padRaw = paintGeometry(
    new THREE.BoxGeometry(0.9, 5.24, 1.52).translate(-1.06, 0, 0),
    AWM_RUBBER_BLACK
  );
  const shoulderCurveCut = paintGeometry(
    new THREE.CylinderGeometry(5.6, 5.6, 1.9, 28)
      .rotateX(Math.PI / 2)
      .translate(-6.88, 0, 0),
    AWM_RUBBER_BLACK
  );
  const screwAccessTop = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 1.2, 12)
      .rotateZ(Math.PI / 2)
      .translate(-1.15, 1.55, 0),
    AWM_INNER_DARK
  );
  const screwAccessBot = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 1.2, 12)
      .rotateZ(Math.PI / 2)
      .translate(-1.15, -1.55, 0),
    AWM_INNER_DARK
  );
  const ribOnlyCutters: THREE.BufferGeometry[] = [
    screwAccessTop,
    screwAccessBot,
  ];
  for (let ry = -2.1; ry <= 2.1; ry += 0.42) {
    ribOnlyCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.24, 0.12, 1.7).translate(-1.46, ry, 0),
        AWM_MATTE_BLACK
      )
    );
  }
  const rubberPad = csgSubtract(padRaw, [
    shoulderCurveCut,
    mergeAwmCutters(ribOnlyCutters),
  ]);

  // Twin recessed stainless steel mounting cap screws
  const screwTop = paintGeometry(
    new THREE.CylinderGeometry(0.105, 0.105, 0.72, 12)
      .rotateZ(Math.PI / 2)
      .translate(-0.36, 1.55, 0),
    AWM_STAINLESS
  );
  const screwBot = paintGeometry(
    new THREE.CylinderGeometry(0.105, 0.105, 0.72, 12)
      .rotateZ(Math.PI / 2)
      .translate(-0.36, -1.55, 0),
    AWM_STAINLESS
  );

  return sanitizeAwmMesh(
    mergeParts([spacer1, spacer2, rubberPad, screwTop, screwBot])
  );
}

/**
 * F-09: Front-Spigot Folding Parker-Hale Tactical Sniper Bipod
 * assembledPos: [14.4, -0.35, 0] -> Yoke plugs flush onto front spigot at X = +13.8..+15.2, ski feet rest at World Y = -5.20!
 */
export function buildAwmBipodGeometry(): THREE.BufferGeometry {
  // Heavy steel spigot mounting block & pendular cant-swivel yoke (local X in [-0.62, +0.86])
  const spigotBlockRaw = paintGeometry(
    new THREE.BoxGeometry(1.48, 1.24, 1.58).translate(0.12, -0.18, 0),
    AWM_ALLOY_BEAM
  );
  const spigotSocket = paintGeometry(
    new THREE.CylinderGeometry(0.295, 0.295, 1.68, 20)
      .rotateZ(Math.PI / 2)
      .translate(0.05, 0, 0),
    AWM_INNER_DARK
  );
  const spigotBlock = csgSubtract(spigotBlockRaw, [spigotSocket]);

  // Quick-detach spigot lock latch lever & cant tension thumb nut on yoke underside
  const qdLatchLever = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.22, 0.34)
      .rotateZ(-0.2)
      .translate(-0.28, -0.86, 0),
    AWM_PARKERIZED
  );
  const pivotPins = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 1.74, 14)
      .rotateX(Math.PI / 2)
      .translate(0.18, -0.42, 0),
    AWM_STAINLESS
  );

  const parts: THREE.BufferGeometry[] = [spigotBlock, qdLatchLever, pivotPins];

  // Left & Right deployed Parker-Hale stamped-channel telescoping legs + external tension springs + ribbed ski feet!
  for (const side of [-1, 1]) {
    const legGroup: THREE.BufferGeometry[] = [];

    // Upper stamped U-channel steel leg (length 2.85) w/ 3 circular lightening perforations
    const upperLegRaw = paintGeometry(
      new THREE.BoxGeometry(0.56, 2.85, 0.44).translate(0, -1.42, 0),
      AWM_DARK_STEEL
    );
    const channelSlot = paintGeometry(
      new THREE.BoxGeometry(0.32, 2.55, 0.26).translate(0.14, -1.48, 0),
      AWM_INNER_DARK
    );
    const holeCutters: THREE.BufferGeometry[] = [];
    for (const hy of [-0.75, -1.42, -2.08]) {
      holeCutters.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.13, 0.13, 0.65, 14)
            .rotateX(Math.PI / 2)
            .translate(0, hy, 0),
          AWM_INNER_DARK
        )
      );
    }
    legGroup.push(
      csgSubtract(upperLegRaw, [channelSlot, mergeAwmCutters(holeCutters)])
    );

    // Telescoping notched stainless inner leg tube (extends down to -4.675 along leg)
    legGroup.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.17, 0.15, 2.25, 16).translate(0, -3.55, 0),
        AWM_STAINLESS
      )
    );
    for (const ny of [-3.05, -3.45, -3.85, -4.25]) {
      legGroup.push(
        paintGeometry(
          new THREE.TorusGeometry(0.162, 0.014, 8, 14)
            .rotateX(Math.PI / 2)
            .translate(0, ny, 0),
          AWM_DARK_STEEL
        )
      );
    }

    // Spring-loaded thumb ratchet lock collar
    legGroup.push(
      paintGeometry(
        new THREE.BoxGeometry(0.66, 0.34, 0.54).translate(0, -2.72, 0),
        AWM_PARKERIZED
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.09, 0.09, 0.2, 12)
          .rotateZ(Math.PI / 2)
          .translate(-0.36, -2.72, 0),
        AWM_STAINLESS
      )
    );

    // External Parker-Hale helical leg tension spring
    const extSpring = createHelicalSpring({
      axis: 'y',
      start: -2.25,
      end: -0.45,
      centerX: -0.34,
      centerZ: 0,
      coilRadius: 0.115,
      wireRadius: 0.028,
      coils: 11,
    });
    legGroup.push(paintGeometry(extSpring, AWM_SPRING_STEEL));

    const mergedLeg = mergeParts(legGroup);
    // Right-hand rule: for y < 0, rotateX(-side * 0.42) splays each leg OUTWARD toward +side * Z,
    // and rotateZ(+0.28) cants the leg forward (+X). Endpoint of (0, -4.675, 0) lands at (1.36, -4.52, side * 2.49).
    mergedLeg.rotateX(-side * 0.42);
    mergedLeg.rotateZ(0.28);
    mergedLeg.translate(0.18, -0.42, side * 0.58);
    parts.push(mergedLeg);

    // Articulated ankle clevis + level curved Parker-Hale ribbed ski foot connected flush at (1.36, -4.52, side * 2.49)
    const ankleClevis = paintGeometry(
      new THREE.BoxGeometry(0.38, 0.3, 0.4).translate(1.36, -4.48, side * 2.49),
      AWM_DARK_STEEL
    );
    const anklePin = paintGeometry(
      new THREE.CylinderGeometry(0.065, 0.065, 0.5, 10)
        .rotateX(Math.PI / 2)
        .translate(1.36, -4.48, side * 2.49),
      AWM_STAINLESS
    );
    const skiFoot = paintGeometry(
      new THREE.BoxGeometry(1.42, 0.15, 0.7).translate(1.45, -4.6, side * 2.49),
      AWM_DARK_STEEL
    );
    const skiToe = paintGeometry(
      new THREE.BoxGeometry(0.44, 0.15, 0.7)
        .rotateZ(0.48)
        .translate(2.22, -4.48, side * 2.49),
      AWM_DARK_STEEL
    );
    const skiHeel = paintGeometry(
      new THREE.BoxGeometry(0.26, 0.14, 0.7)
        .rotateZ(-0.36)
        .translate(0.68, -4.54, side * 2.49),
      AWM_DARK_STEEL
    );
    parts.push(ankleClevis, anklePin, skiFoot, skiToe, skiHeel);
    for (const rx of [0.98, 1.32, 1.66, 2.0]) {
      parts.push(
        paintGeometry(
          new THREE.BoxGeometry(0.08, 0.05, 0.68).translate(
            rx,
            -4.68,
            side * 2.49
          ),
          AWM_PARKERIZED
        )
      );
    }
  }

  return sanitizeAwmMesh(mergeParts(parts));
}

/**
 * Complete 24-Part Procedural/CSG Builder Map for #6 Accuracy International AWM (L115A3 · .338LM)
 */
export const AWM_GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> =
  {
    // 1. Optic & 60° 6-Lug Turn-Bolt Group ('slide' · 7 parts)
    awm_scope: buildAwmScopeGeometry,
    awm_scope_mount: buildAwmScopeMountGeometry,
    awm_bolt_body: buildAwmBoltBodyGeometry,
    awm_bolt_shroud: buildAwmBoltShroudGeometry,
    awm_striker: buildAwmStrikerGeometry,
    awm_firing_pin_spring: buildAwmFiringPinSpringGeometry,
    awm_extractor: buildAwmExtractorGeometry,

    // 2. OD-Green Thumbhole Chassis, CNC Beam, Action & Fluted Barrel ('frame' · 9 parts)
    awm_chassis_skins: buildAwmChassisSkinsGeometry,
    awm_chassis_beam: buildAwmChassisBeamGeometry,
    awm_action_receiver: buildAwmActionReceiverGeometry,
    awm_barrel: buildAwmBarrelGeometry,
    awm_muzzle_brake: buildAwmMuzzleBrakeGeometry,
    awm_folding_stock: buildAwmFoldingStockGeometry,
    awm_cheekpiece: buildAwmCheekpieceGeometry,
    awm_buttpad_spacers: buildAwmButtpadSpacersGeometry,
    awm_bipod: buildAwmBipodGeometry,

    // 3. Two-Stage Match Trigger Group ('fire_control' · 4 parts)
    awm_trigger_box: buildAwmTriggerBoxGeometry,
    awm_sear: buildAwmSearGeometry,
    awm_trigger_shoe: buildAwmTriggerShoeGeometry,
    awm_mag_catch: buildAwmMagCatchGeometry,

    // 4. 5-Round .338 Lapua Magnum Steel Box Magazine ('magazine' · 4 parts)
    awm_mag_body: buildAwmMagBodyGeometry,
    awm_mag_follower: buildAwmMagFollowerGeometry,
    awm_mag_spring: buildAwmMagSpringGeometry,
    awm_mag_floorplate: buildAwmMagFloorplateGeometry,
  };
