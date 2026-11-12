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

  // CSG Interior Channels: CNC beam slot, Action bedding, Free-float barrel channel, Magwell, Bolt-handle scoop, Seam & Bolt counterbores
  const cutters: THREE.BufferGeometry[] = [
    // Internal CNC aluminum chassis beam cavity
    paintGeometry(
      new THREE.BoxGeometry(22.9, 1.35, 1.12).translate(2.35, -0.18, 0),
      AWM_OD_GREEN
    ),
    // Flat-sided Magnum steel action receiver bedding channel
    paintGeometry(
      new THREE.BoxGeometry(10.15, 1.6, 1.38).translate(-0.28, 0.65, 0),
      AWM_OD_GREEN
    ),
    // Rear bolt shroud tang channel
    paintGeometry(
      new THREE.BoxGeometry(4.6, 0.95, 0.98).translate(-7.1, 0.72, 0),
      AWM_OD_GREEN
    ),
    // Free-float 27" heavy barrel U-channel along forend (Y = +1.05, R = 0.82)
    paintGeometry(
      new THREE.CylinderGeometry(0.82, 0.82, 10.2, 24)
        .rotateZ(Math.PI / 2)
        .translate(9.1, 1.05, 0),
      AWM_OD_GREEN
    ),
    // Front Parker-Hale bipod spigot bore at X = +13.8, Y = -0.35
    paintGeometry(
      new THREE.CylinderGeometry(0.36, 0.36, 1.8, 18)
        .rotateZ(Math.PI / 2)
        .translate(13.5, -0.35, 0),
      AWM_OD_GREEN
    ),
    // Long-Action .338 LM Rectangular Magazine Well through-cut (X in [-1.85, +4.55])
    paintGeometry(
      new THREE.BoxGeometry(6.42, 3.2, 1.32).translate(1.35, -0.95, 0),
      AWM_OD_GREEN
    ),
    // Trigger box & trigger blade + paddle mag-catch through-slot
    paintGeometry(
      new THREE.BoxGeometry(2.55, 2.35, 0.86).translate(-2.95, -0.92, 0),
      AWM_OD_GREEN
    ),
    // Right-side spherical bolt-knob clearance scoop
    paintGeometry(
      new THREE.SphereGeometry(0.64, 18, 14).translate(-4.88, 0.2, 1.12),
      AWM_OD_GREEN
    ),
    // Forend side fuller grooves (left & right)
    paintGeometry(
      new THREE.BoxGeometry(7.6, 0.24, 0.16).translate(9.2, -0.18, 0.9),
      AWM_OD_GREEN
    ),
    paintGeometry(
      new THREE.BoxGeometry(7.6, 0.24, 0.16).translate(9.2, -0.18, -0.9),
      AWM_OD_GREEN
    ),
    // Two-piece clam-shell skin parting seam along underside of forend & grip bridge (Z = 0)
    paintGeometry(
      new THREE.BoxGeometry(8.6, 0.08, 0.05).translate(9.2, -1.24, 0),
      AWM_OD_GREEN
    ),
    paintGeometry(
      new THREE.BoxGeometry(4.4, 0.1, 0.05).translate(-6.9, -5.18, 0),
      AWM_OD_GREEN
    ),
    // Left-forend AI flush-cup / bar sling slot
    paintGeometry(
      new THREE.BoxGeometry(0.42, 0.86, 0.24).translate(11.45, -0.58, -0.88),
      AWM_OD_GREEN
    ),
  ];

  // Recessed hex-socket skin-fastening screws on both flanks (authentic AI two-piece skin assembly!)
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
    // Left-forend steel sling cross-bar inside recessed sling slot
    paintGeometry(
      new THREE.CylinderGeometry(0.065, 0.065, 0.88, 12).translate(
        11.45,
        -0.58,
        -0.82
      ),
      AWM_DARK_STEEL
    ),
  ];
  for (const [bx, by] of boltCoords) {
    for (const side of [-1, 1]) {
      cutters.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.165, 0.165, 0.22, 16)
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

  const carved = csgSubtract(extruded, cutters);
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

  const cutters: THREE.BufferGeometry[] = [
    // Octagonal V-bedding cradle w/ epoxy-bonding channels for flat-sided steel Magnum action
    paintGeometry(
      new THREE.BoxGeometry(10.08, 0.56, 0.92).translate(-0.28, 0.26, 0),
      AWM_INNER_DARK
    ),
    // Front recoil-lug mortise pocket at X = +4.45
    paintGeometry(
      new THREE.BoxGeometry(0.38, 0.44, 1.12).translate(4.45, 0.12, 0),
      AWM_INNER_DARK
    ),
    // Magwell internal opening (matches 6.32-unit .338 LM box mag)
    paintGeometry(
      new THREE.BoxGeometry(6.36, 2.55, 1.02).translate(1.35, -0.85, 0),
      AWM_INNER_DARK
    ),
    // Trigger box cassette clearance pocket
    paintGeometry(
      new THREE.BoxGeometry(2.42, 1.62, 0.78).translate(-3.05, -0.55, 0),
      AWM_INNER_DARK
    ),
  ];

  // CNC-milled rectangular lightening truss pockets along forend beam [5.8..12.2]
  for (const px of [5.85, 7.95, 10.05, 12.15]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.52, 0.68, 1.3).translate(px, -0.26, 0),
        AWM_INNER_DARK
      )
    );
  }

  const machinedBeam = csgSubtract(
    csgUnion([mainBeam, magwellSkirt, gripCoreTang, rearHingeBlock]),
    cutters
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
  // Iconic AI thick flat-sided octagonal slab ordnance-steel Magnum receiver
  const rawBlock = paintGeometry(
    new THREE.BoxGeometry(10.05, 1.76, 1.56).translate(-0.28, 0.05, 0),
    AWM_DARK_STEEL
  );
  // Integral 11mm AI dovetail + MIL-STD-1913 Picatinny top rail (World Y up to +2.26 -> local Y up to +1.21)
  const topRail = paintGeometry(
    new THREE.BoxGeometry(9.8, 0.34, 0.84).translate(-0.25, 1.04, 0),
    AWM_PARKERIZED
  );

  const cutters: THREE.BufferGeometry[] = [
    // Upper 45-deg octagonal shoulder bevels
    paintGeometry(
      new THREE.BoxGeometry(10.4, 0.65, 0.65)
        .rotateX(Math.PI / 4)
        .translate(-0.28, 0.92, -0.82),
      AWM_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(10.4, 0.65, 0.65)
        .rotateX(Math.PI / 4)
        .translate(-0.28, 0.92, 0.82),
      AWM_DARK_STEEL
    ),
    // Lower 45-deg V-bedding bevels mating into CNC aluminum spine beam
    paintGeometry(
      new THREE.BoxGeometry(10.4, 0.36, 0.36)
        .rotateX(Math.PI / 4)
        .translate(-0.28, -0.82, -0.78),
      AWM_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(10.4, 0.36, 0.36)
        .rotateX(Math.PI / 4)
        .translate(-0.28, -0.82, 0.78),
      AWM_DARK_STEEL
    ),
    // Central bolt raceway & chamber tenon bore (R = 0.56)
    paintGeometry(
      new THREE.CylinderGeometry(0.56, 0.56, 10.5, 28)
        .rotateZ(Math.PI / 2)
        .translate(-0.28, 0, 0),
      AWM_INNER_DARK
    ),
    // Compact high-rigidity right-side .338 Lapua Magnum ejection port (Local X in [-1.55, +2.85])
    paintGeometry(
      new THREE.BoxGeometry(4.4, 0.72, 0.95)
        .rotateX(-0.22)
        .translate(0.65, 0.28, 0.55),
      AWM_INNER_DARK
    ),
    // Left-front overpressure emergency gas-relief port at breech ring (X = +2.95, Z = -0.78)
    paintGeometry(
      new THREE.CylinderGeometry(0.095, 0.095, 0.45, 14)
        .rotateX(Math.PI / 2)
        .translate(2.95, 0.24, -0.68),
      AWM_INNER_DARK
    ),
    // Right-rear bolt-handle turn-in locking & primary-extraction cam notch at Local X = -4.18
    paintGeometry(
      new THREE.BoxGeometry(0.8, 0.7, 0.86).translate(-4.18, -0.12, 0.55),
      AWM_INNER_DARK
    ),
    // Bottom .338 LM magazine feed slot & rear sear/shroud tang slot
    paintGeometry(
      new THREE.BoxGeometry(5.96, 0.76, 0.94).translate(1.32, -0.65, 0),
      AWM_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.35, 0.68, 0.42).translate(-4.12, -0.62, 0),
      AWM_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(1.48, 0.68, 0.44).translate(-3.15, -0.65, 0),
      AWM_INNER_DARK
    ),
  ];

  // 15 MIL-STD-1913 Picatinny recoil cross-slots along integral top rail
  for (let sx = -4.75; sx <= 4.35; sx += 0.65) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.24, 0.14, 1.0).translate(sx, 1.18, 0),
        AWM_INNER_DARK
      )
    );
  }

  const receiverShell = csgSubtract(csgUnion([rawBlock, topRail]), cutters);

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
 * assembledPos: [0, 1.05, 0] -> Spans X in [+2.88, +29.0] (threads into receiver [+2.88..+4.75] & brake [+28.05..+29.0]!)
 */
export function buildAwmBarrelGeometry(): THREE.BufferGeometry {
  // All Lathe radii >= 0.215 (> 0) for clean non-degenerate triangles!
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.36, 2.88),
    new THREE.Vector2(0.54, 2.88), // Threaded M27 breech tenon inside steel Magnum action
    new THREE.Vector2(0.54, 4.73),
    new THREE.Vector2(0.74, 4.77), // Heavy chamber cylinder flush against receiver front face X = +4.75
    new THREE.Vector2(0.74, 8.15),
    new THREE.Vector2(0.68, 8.85), // Match contour taper start
    new THREE.Vector2(0.55, 27.25), // 27" free-floating heavy sniper contour
    new THREE.Vector2(0.55, 28.05), // Muzzle brake shoulder flush at X = +28.05
    new THREE.Vector2(0.43, 28.1), // M18x1.5 threaded muzzle spigot inside AI muzzle brake
    new THREE.Vector2(0.43, 29.0),
    new THREE.Vector2(0.215, 29.0),
  ];
  const outer = new THREE.LatheGeometry(pts, 36);
  outer.rotateZ(-Math.PI / 2);
  paintGeometry(outer, AWM_MATCH_BARREL);

  // 6 deep ball-milled longitudinal cooling/stiffening flutes along X in [8.85, 26.65] + .338LM chamber, bore & wrench flats!
  const cutters: THREE.BufferGeometry[] = [
    // .338 (8.6mm) bore core
    paintGeometry(
      new THREE.CylinderGeometry(0.215, 0.215, 26.6, 22)
        .rotateZ(Math.PI / 2)
        .translate(16.0, 0, 0),
      AWM_INNER_DARK
    ),
    // .338 Lapua Magnum tapered 70mm chamber & throat
    paintGeometry(
      new THREE.CylinderGeometry(0.36, 0.395, 3.85, 24)
        .rotateZ(Math.PI / 2)
        .translate(4.85, 0, 0),
      AWM_INNER_DARK
    ),
    // Authentic AI quick-barrel-change spanner wrench flats on chamber reinforce (X = +5.35, Z = +/- 0.70)
    paintGeometry(
      new THREE.BoxGeometry(0.68, 0.72, 0.18).translate(5.35, 0, 0.74),
      AWM_FLUTE_BRIGHT
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.68, 0.72, 0.18).translate(5.35, 0, -0.74),
      AWM_FLUTE_BRIGHT
    ),
  ];

  // 6 longitudinal barrel flutes
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    const rMid = 0.635;
    const fy = Math.cos(ang) * rMid;
    const fz = Math.sin(ang) * rMid;
    const fluteCutter = new THREE.CylinderGeometry(0.145, 0.125, 17.8, 16);
    fluteCutter.rotateZ(Math.PI / 2);
    const tilt = 0.0065;
    fluteCutter.rotateY(Math.sin(ang) * tilt);
    fluteCutter.rotateZ(Math.cos(ang) * -tilt);
    fluteCutter.translate(17.75, fy, fz);
    paintGeometry(fluteCutter, AWM_FLUTE_BRIGHT);
    cutters.push(fluteCutter);
  }

  const flutedBarrel = csgSubtract(outer, cutters);

  // Polished stainless chamber feed cone + 6 internal .338 bore rifling lands visible at breech & muzzle
  const extras: THREE.BufferGeometry[] = [
    flutedBarrel,
    paintGeometry(
      new THREE.TorusGeometry(0.44, 0.058, 10, 24)
        .rotateY(Math.PI / 2)
        .translate(2.9, 0, 0),
      AWM_STAINLESS
    ),
  ];
  for (let r = 0; r < 6; r++) {
    const rAng = (r * Math.PI) / 3;
    const ly = Math.cos(rAng) * 0.2;
    const lz = Math.sin(rAng) * 0.2;
    const land = new THREE.BoxGeometry(22.0, 0.028, 0.042);
    land.rotateX(-rAng + 0.12);
    land.translate(17.85, ly, lz);
    extras.push(paintGeometry(land, AWM_STAINLESS));
  }

  return sanitizeAwmMesh(mergeParts(extras));
}

/**
 * F-05: Accuracy International Slab-Sided Two-Chamber Tactical Muzzle Brake (L115A3 Spec)
 * assembledPos: [29.5, 1.05, 0] -> Local X in [-1.50, +1.50] -> World X in [+28.0, +31.0] (exact crown at +31.0!)
 */
export function buildAwmMuzzleBrakeGeometry(): THREE.BufferGeometry {
  // Rear threaded AI tactical suppressor-attachment collar (local X in [-1.50, -0.76])
  const rearCollar = paintGeometry(
    new THREE.CylinderGeometry(0.61, 0.59, 0.74, 28)
      .rotateZ(Math.PI / 2)
      .translate(-1.13, 0, 0),
    AWM_DARK_STEEL
  );
  // Iconic slab-sided rectangular double-baffle AI brake body (local X in [-0.78, +1.50])
  const slabRaw = paintGeometry(
    new THREE.BoxGeometry(2.28, 1.32, 1.68).translate(0.36, 0, 0),
    AWM_DARK_STEEL
  );

  const cutters: THREE.BufferGeometry[] = [
    // Central .338 projectile bore channel
    paintGeometry(
      new THREE.CylinderGeometry(0.235, 0.235, 3.4, 22)
        .rotateZ(Math.PI / 2)
        .translate(0, 0, 0),
      AWM_INNER_DARK
    ),
    // Recessed 11-degree target-crowned .338 muzzle exit dish at X = +1.50 (World X = +31.00!)
    paintGeometry(
      new THREE.CylinderGeometry(0.46, 0.24, 0.22, 24)
        .rotateZ(Math.PI / 2)
        .translate(1.42, 0, 0),
      AWM_INNER_DARK
    ),
    // Chamber 1 & Chamber 2 wide rearward-swept gas-deflecting expansion windows (symmetric left & right!)
    paintGeometry(
      new THREE.BoxGeometry(0.62, 0.86, 1.05)
        .rotateY(0.2)
        .translate(-0.18, 0, 0.52),
      AWM_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.62, 0.86, 1.05)
        .rotateY(-0.2)
        .translate(-0.18, 0, -0.52),
      AWM_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.62, 0.86, 1.05)
        .rotateY(0.2)
        .translate(0.76, 0, 0.52),
      AWM_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.62, 0.86, 1.05)
        .rotateY(-0.2)
        .translate(0.76, 0, -0.52),
      AWM_INNER_DARK
    ),
    // Internal expansion chamber cavities around bore
    paintGeometry(
      new THREE.CylinderGeometry(0.42, 0.42, 0.52, 20)
        .rotateZ(Math.PI / 2)
        .translate(-0.16, 0, 0),
      AWM_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.42, 0.42, 0.52, 20)
        .rotateZ(Math.PI / 2)
        .translate(0.78, 0, 0),
      AWM_INNER_DARK
    ),
    // Longitudinal 45-deg edge chamfers on slab brake
    paintGeometry(
      new THREE.BoxGeometry(2.6, 0.46, 0.46)
        .rotateX(Math.PI / 4)
        .translate(0.36, 0.68, 0.86),
      AWM_PARKERIZED
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.6, 0.46, 0.46)
        .rotateX(Math.PI / 4)
        .translate(0.36, 0.68, -0.86),
      AWM_PARKERIZED
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.6, 0.46, 0.46)
        .rotateX(Math.PI / 4)
        .translate(0.36, -0.68, 0.86),
      AWM_PARKERIZED
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.6, 0.46, 0.46)
        .rotateX(Math.PI / 4)
        .translate(0.36, -0.68, -0.86),
      AWM_PARKERIZED
    ),
  ];

  const brakeBody = csgSubtract(csgUnion([rearCollar, slabRaw]), cutters);

  // Fine external suppressor-mounting thread rings + knurled locking ring + recessed crown rifling ring
  const extras: THREE.BufferGeometry[] = [
    brakeBody,
    paintGeometry(
      new THREE.TorusGeometry(0.625, 0.048, 10, 28)
        .rotateY(Math.PI / 2)
        .translate(-0.82, 0, 0),
      AWM_PARKERIZED
    ),
    paintGeometry(
      new THREE.TorusGeometry(0.245, 0.018, 8, 22)
        .rotateY(Math.PI / 2)
        .translate(1.33, 0, 0),
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

  const carvedStock = csgSubtract(extruded, cutters);
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
  const ribCutters: THREE.BufferGeometry[] = [
    shoulderCurveCut,
    screwAccessTop,
    screwAccessBot,
  ];
  for (let ry = -2.1; ry <= 2.1; ry += 0.42) {
    ribCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.24, 0.12, 1.7).translate(-1.46, ry, 0),
        AWM_MATTE_BLACK
      )
    );
  }
  const rubberPad = csgSubtract(padRaw, ribCutters);

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
    const holeCutters: THREE.BufferGeometry[] = [channelSlot];
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
    legGroup.push(csgSubtract(upperLegRaw, holeCutters));

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
