import * as THREE from 'three';
import {
  createChamferedBox,
  createHelicalSpring,
  csgSubtract,
  mergeParts,
  paintGeometry,
  SPRING_AXIS_MODE_FLEX,
  SPRING_PARAM_ATTRIBUTE,
} from '../../../engine/geometry/csgBuilder';
import {
  applyPythonCylinderUVs,
  extrudeAlongZ,
  latheAlongX,
  mergeCutters,
  PYTHON_ANODIZED_KNOB,
  PYTHON_BORE_DARK,
  PYTHON_BRASS_CASE,
  PYTHON_CHAMFER_BLUE,
  PYTHON_COPPER_JHP,
  PYTHON_GOLD_MEDALLION,
  PYTHON_MIRROR_STEEL,
  PYTHON_NICKEL_CASE,
  PYTHON_ROYAL_BLUE,
  PYTHON_ROYAL_DEEP,
  PYTHON_SPRING_STEEL,
  PYTHON_STAINLESS,
  sanitizePythonMesh,
  surfaceRidges,
} from './pythonGeometries';

// ============================================================================
// 5. DA/SA CLOCKWORK & FOLDED V-LEAF LOCKWORK ('fire_control' · 8 parts)
// ============================================================================

/**
 * FC-01: Wide Checkered Target Spur DA/SA Hammer
 * (assembledPos: [-4.35, 0.58, 0] — pivots directly around hammer stud `[0, 0, 0]`)
 */
export function buildPythonHammerGeometry(): THREE.BufferGeometry {
  const hammerShape = new THREE.Shape();
  hammerShape.moveTo(-0.35, -0.58); // Lower full-cock & safety-rebound heel
  hammerShape.lineTo(0.45, -0.52); // DA sear strut boss
  hammerShape.quadraticCurveTo(0.68, 0.25, 0.56, 1.15); // Breast curve
  hammerShape.lineTo(1.42, 1.62); // Flat striking nose facing firing pin (world [-2.93, 2.35, 0])
  hammerShape.lineTo(1.42, 1.92);
  hammerShape.lineTo(0.48, 2.02); // Upper hood shoulder
  hammerShape.quadraticCurveTo(-0.45, 2.68, -1.95, 2.86); // Swept wide target thumb spur!
  hammerShape.lineTo(-2.12, 2.58);
  hammerShape.quadraticCurveTo(-0.88, 2.12, -0.58, 1.12); // Rear neck curve
  hammerShape.lineTo(-0.82, -0.32); // Stirrup pin heel (world [-5.17, 0.26, 0])
  hammerShape.closePath();

  const pivotHole = new THREE.Path();
  pivotHole.absarc(0, 0, 0.145, 0, Math.PI * 2, true);
  hammerShape.holes.push(pivotHole);

  const hammerBody = extrudeAlongZ(
    hammerShape,
    -0.19,
    0.38,
    PYTHON_STAINLESS,
    0.024,
    10
  );

  // Wide flared target thumb-spur pad w/ transverse anti-slip checkering bars
  const spurPad = createChamferedBox(1.25, 0.16, 0.62, 0.025, PYTHON_ROYAL_DEEP);
  spurPad.rotateZ(-0.32);
  spurPad.translate(-1.38, 2.64, 0);

  const parts: THREE.BufferGeometry[] = [hammerBody, spurPad];
  for (let i = -3; i <= 3; i++) {
    const bar = paintGeometry(
      new THREE.BoxGeometry(0.055, 0.06, 0.58)
        .rotateZ(-0.32)
        .translate(-1.38 + i * 0.15, 2.71 - i * 0.048, 0),
      PYTHON_STAINLESS
    );
    parts.push(bar);
  }

  // Pivoting DA strut & stirrup cross-pin on lower rear heel
  const daStrut = paintGeometry(
    new THREE.BoxGeometry(0.16, 0.62, 0.18)
      .rotateZ(0.28)
      .translate(0.32, -0.58, 0.06),
    PYTHON_MIRROR_STEEL
  );
  const stirrupPin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.42, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.72, -0.28, 0),
    PYTHON_MIRROR_STEEL
  );
  parts.push(daStrut, stirrupPin);

  return sanitizePythonMesh(mergeParts(parts));
}

/**
 * FC-02: Pivoting Hammer Stirrup Mainspring Link
 * (assembledPos: [-5.12, -0.45, 0])
 * Connects hammer heel (`[-5.07, +0.30, 0]`) down to V-mainspring upper hook (`[-5.35, -1.35, 0]`).
 */
export function buildPythonHammerStirrupGeometry(): THREE.BufferGeometry {
  const leftArm = createChamferedBox(0.18, 1.72, 0.07, 0.015, PYTHON_STAINLESS);
  leftArm.rotateZ(0.14);
  leftArm.translate(-0.08, -0.1, -0.14);

  const rightArm = createChamferedBox(0.18, 1.72, 0.07, 0.015, PYTHON_STAINLESS);
  rightArm.rotateZ(0.14);
  rightArm.translate(-0.08, -0.1, 0.14);

  const topYoke = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.36, 16)
      .rotateX(Math.PI / 2)
      .translate(0.04, 0.72, 0),
    PYTHON_MIRROR_STEEL
  );
  const bottomCrossBar = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.36, 16)
      .rotateX(Math.PI / 2)
      .translate(-0.20, -0.88, 0),
    PYTHON_MIRROR_STEEL
  );

  return sanitizePythonMesh(
    mergeParts([leftArm, rightArm, topYoke, bottomCrossBar])
  );
}

/**
 * FC-03: Grooved Curved Target Trigger w/ DA Sear & Bolt Cam
 * (assembledPos: [-2.35, -1.05, 0] — pivots directly around trigger stud `[0, 0, 0]`)
 */
export function buildPythonTriggerGeometry(): THREE.BufferGeometry {
  const trigShape = new THREE.Shape();
  trigShape.moveTo(-0.42, 0.48); // Rear hand-pawl stud & rebound tail
  trigShape.lineTo(0.56, 0.42); // Forward cylinder-bolt actuator nose
  trigShape.lineTo(0.32, -0.22); // Trigger root
  trigShape.quadraticCurveTo(0.58, -1.15, 0.12, -1.98); // Curved target finger face
  trigShape.lineTo(-0.18, -1.95);
  trigShape.quadraticCurveTo(0.18, -1.12, -0.12, -0.28); // Rear shoe spine
  trigShape.lineTo(-0.55, 0.15); // Upper DA sear nose
  trigShape.closePath();

  const pivotHole = new THREE.Path();
  pivotHole.absarc(0, 0, 0.125, 0, Math.PI * 2, true);
  trigShape.holes.push(pivotHole);

  const triggerBody = extrudeAlongZ(
    trigShape,
    -0.16,
    0.32,
    PYTHON_ROYAL_DEEP,
    0.022,
    10
  );

  // Longitudinal target grooves along front trigger shoe face
  const parts: THREE.BufferGeometry[] = [triggerBody];
  for (const zOff of [-0.1, 0, 0.1]) {
    parts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.022, 0.022, 1.35, 8)
          .rotateZ(-0.18)
          .translate(0.34, -1.12, zOff),
        PYTHON_CHAMFER_BLUE
      )
    );
  }
  // Hand-pawl crank pin on left rear tail
  parts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.065, 0.065, 0.24, 12)
        .rotateX(Math.PI / 2)
        .translate(-0.32, 0.28, -0.18),
      PYTHON_STAINLESS
    )
  );

  return sanitizePythonMesh(mergeParts(parts));
}

/**
 * FC-04: Hand-Tuned Tapered Folded V-Leaf Flat Mainspring (`aSpringParam` `w = 3` Flex!)
 * (assembledPos: [-7.65, -4.85, 0])
 * Anchored at grip-frame heel `[-2.10, -3.60, 0]` (world `[-9.75, -8.45, 0]`):
 *  - Upper hammer limb sweeps up to `[+2.30, +3.50, 0]` (world `[-5.35, -1.35, 0]`)
 *  - Lower rebound limb sweeps up to `[+1.80, +2.20, 0]` (world `[-5.85, -2.65, 0]`)
 * Attaches GPU `SPRING_AXIS_MODE_FLEX` (`w = 3`) cantilever deflection vectors (`maxDisp ~ 0.92 > 0.5`)
 * so both V-limbs pinch smoothly during DA/SA cocking without squashing leaf thickness!
 */
export function buildPythonMainspringGeometry(): THREE.BufferGeometry {
  const segs = 22;

  const buildVLeafBlade = (
    p0: [number, number],
    ctrl: [number, number],
    p1: [number, number],
    thickStart: number,
    thickEnd: number,
    widthZ: number
  ): THREE.BufferGeometry => {
    const curve = new THREE.QuadraticBezierCurve(
      new THREE.Vector2(p0[0], p0[1]),
      new THREE.Vector2(ctrl[0], ctrl[1]),
      new THREE.Vector2(p1[0], p1[1])
    );
    const shape = new THREE.Shape();
    const topPts: THREE.Vector2[] = [];
    const botPts: THREE.Vector2[] = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const pt = curve.getPoint(u);
      const tan = curve.getTangent(u).normalize();
      const nrm = new THREE.Vector2(-tan.y, tan.x);
      const halfT = 0.5 * (thickStart + (thickEnd - thickStart) * u);
      topPts.push(pt.clone().addScaledVector(nrm, halfT));
      botPts.push(pt.clone().addScaledVector(nrm, -halfT));
    }
    shape.moveTo(topPts[0].x, topPts[0].y);
    for (let i = 1; i < topPts.length; i++) {
      shape.lineTo(topPts[i].x, topPts[i].y);
    }
    for (let i = botPts.length - 1; i >= 0; i--) {
      shape.lineTo(botPts[i].x, botPts[i].y);
    }
    shape.closePath();
    return extrudeAlongZ(
      shape,
      -widthZ * 0.5,
      widthZ,
      PYTHON_SPRING_STEEL,
      0.012,
      8
    );
  };

  // Upper hammer leaf & lower rebound leaf meeting at tempered hairpin V-bend loop
  const upperLeaf = buildVLeafBlade(
    [-2.1, -3.52],
    [-0.35, 0.45],
    [2.3, 3.5],
    0.16,
    0.085,
    0.42
  );
  const lowerLeaf = buildVLeafBlade(
    [-2.02, -3.68],
    [0.15, -1.25],
    [1.82, 2.18],
    0.15,
    0.085,
    0.42
  );
  const hairpinLoop = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.42, 20)
      .rotateX(Math.PI / 2)
      .translate(-2.1, -3.6, 0),
    PYTHON_SPRING_STEEL
  );
  const loopHole = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 0.62, 16)
      .rotateX(Math.PI / 2)
      .translate(-2.1, -3.6, 0),
    PYTHON_BORE_DARK
  );
  const hookedBase = csgSubtract(hairpinLoop, [loopHole]);
  const stirrupHookTip = createChamferedBox(
    0.24,
    0.16,
    0.44,
    0.02,
    PYTHON_MIRROR_STEEL
  );
  stirrupHookTip.translate(2.3, 3.48, 0);

  const merged = sanitizePythonMesh(
    mergeParts([upperLeaf, lowerLeaf, hookedBase, stirrupHookTip])
  );

  // Attach exact cantilever bending `aSpringParam` (`w = SPRING_AXIS_MODE_FLEX = 3`)!
  const pos = merged.getAttribute('position');
  const vCount = pos.count;
  const spArr = new Float32Array(vCount * 4);
  for (let i = 0; i < vCount; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Normalized distance along leaf from lower hairpin bend `(-2.10, -3.60)` to tip `(+2.30, +3.50)`
    const distFromAnchor = Math.hypot(x - -2.1, y - -3.6);
    const uCantilever = Math.min(1, Math.max(0, (distFromAnchor - 0.35) / 7.95));
    // Quadratic Euler-Bernoulli cantilever deflection: upper limb bends down/forward (+X, -Y),
    // lower rebound limb bends slightly down/inward as rebound lever cams it!
    const bend = uCantilever * uCantilever;
    const isUpperLimb = y - -3.6 > (x - -2.1) * 1.48;
    const flexDx = isUpperLimb ? 0.34 * bend : 0.14 * bend;
    const flexDy = isUpperLimb ? -0.86 * bend : 0.32 * bend;
    spArr[i * 4] = flexDx;
    spArr[i * 4 + 1] = flexDy;
    spArr[i * 4 + 2] = 0;
    spArr[i * 4 + 3] = SPRING_AXIS_MODE_FLEX;
  }
  merged.setAttribute(
    SPRING_PARAM_ATTRIBUTE,
    new THREE.BufferAttribute(spArr, 4)
  );
  return merged;
}

/**
 * FC-05: Colt Signature Safety Rebound Lever
 * (assembledPos: [-5.55, -1.72, -0.04] — pivots directly around rear rebound pin `[0, 0, 0]`)
 */
export function buildPythonReboundLeverGeometry(): THREE.BufferGeometry {
  const rebShape = new THREE.Shape();
  rebShape.moveTo(-0.24, -0.22); // Rear pivot boss
  rebShape.lineTo(3.05, 0.38); // Forward arm engaging trigger tail & hand
  rebShape.lineTo(2.96, 0.68);
  rebShape.lineTo(1.42, 0.62);
  rebShape.lineTo(1.08, 1.52); // Positive hammer rebound safety block cam!
  rebShape.lineTo(0.68, 1.48);
  rebShape.lineTo(0.55, 0.45);
  rebShape.lineTo(-0.24, 0.24);
  rebShape.closePath();

  const pivotHole = new THREE.Path();
  pivotHole.absarc(0, 0, 0.115, 0, Math.PI * 2, true);
  rebShape.holes.push(pivotHole);

  const lever = extrudeAlongZ(
    rebShape,
    -0.12,
    0.24,
    PYTHON_STAINLESS,
    0.018,
    8
  );
  return sanitizePythonMesh(lever);
}

/**
 * FC-06: Pivoting Lower Cylinder Locking Bolt / Stop & Leaf Spring
 * (assembledPos: [-0.85, -1.02, 0.12])
 */
export function buildPythonCylinderBoltGeometry(): THREE.BufferGeometry {
  const boltShape = new THREE.Shape();
  boltShape.moveTo(-1.32, -0.14); // Split rear tail engaged by trigger bolt cam
  boltShape.lineTo(1.12, -0.16);
  boltShape.lineTo(1.18, 0.24); // Rounded locking dome at X = +0.95 (world X = +0.10, Y = -0.78!)
  boltShape.quadraticCurveTo(0.95, 0.34, 0.72, 0.22);
  boltShape.lineTo(0.32, 0.08);
  boltShape.lineTo(-1.28, 0.16);
  boltShape.closePath();

  const pivotHole = new THREE.Path();
  pivotHole.absarc(0, 0, 0.095, 0, Math.PI * 2, true);
  boltShape.holes.push(pivotHole);

  const boltBody = extrudeAlongZ(
    boltShape,
    -0.12,
    0.22,
    PYTHON_ROYAL_DEEP,
    0.016,
    8
  );
  const wireSpring = paintGeometry(
    new THREE.BoxGeometry(0.92, 0.045, 0.12)
      .rotateZ(-0.16)
      .translate(-0.55, -0.22, 0),
    PYTHON_SPRING_STEEL
  );

  return sanitizePythonMesh(mergeParts([boltBody, wireSpring]));
}

/**
 * FC-07: Vertical Indexing Ratchet Pawl ("Hand") w/ Colt Two-Step Lockup Fingers
 * (assembledPos: [-2.48, 0.18, -0.14])
 */
export function buildPythonHandGeometry(): THREE.BufferGeometry {
  const handShape = new THREE.Shape();
  handShape.moveTo(-0.22, -0.95); // Lower trigger crank eye
  handShape.lineTo(0.14, -0.92);
  handShape.lineTo(0.22, 0.58); // Secondary bank-vault lockup step
  handShape.lineTo(0.32, 0.68);
  handShape.lineTo(0.30, 0.98); // Primary 60-deg ratchet indexing nose (reaches star at Y ~ 1.17!)
  handShape.lineTo(0.06, 0.96);
  handShape.lineTo(-0.14, 0.22);
  handShape.closePath();

  const handBody = extrudeAlongZ(
    handShape,
    -0.08,
    0.16,
    PYTHON_STAINLESS,
    0.014,
    6
  );
  const crankPin = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.26, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.04, -0.78, 0.10),
    PYTHON_MIRROR_STEEL
  );

  return sanitizePythonMesh(mergeParts([handBody, crankPin]));
}

/**
 * FC-08: Frame-Mounted Inertial Firing Pin, Retaining Bushing & Concentric Return Spring
 * (assembledPos: [-2.52, 2.35, 0] — coaxial with barrel bore Y = 2.35, Z = 0)
 */
export function buildPythonFiringPinGeometry(): THREE.BufferGeometry {
  // Hemispherical tip at +0.26 (recessed 0.02cm behind recoil shield X=-2.24 until struck!)
  const pinBody = latheAlongX(
    [
      [0.0, -0.36], // Rear striking head exposed to hammer nose
      [0.105, -0.34],
      [0.115, -0.16], // Rear collar
      [0.068, -0.14], // Spring waist
      [0.068, 0.14],
      [0.042, 0.23], // Tapered firing-pin needle
      [0.0, 0.26], // Rounded Boxer primer striker tip
    ],
    22,
    PYTHON_MIRROR_STEEL
  );

  // Threaded recoil-shield firing-pin bushing collar
  const bushing = latheAlongX(
    [
      [0.078, 0.12],
      [0.165, 0.12],
      [0.165, 0.26],
      [0.078, 0.26],
      [0.078, 0.12],
    ],
    20,
    PYTHON_STAINLESS
  );

  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.14,
      end: 0.12,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.098,
      wireRadius: 0.016,
      coils: 6,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    PYTHON_SPRING_STEEL
  );

  return sanitizePythonMesh(mergeParts([pinBody, bushing, returnSpring]));
}

// ============================================================================
// 6. SWING-OUT 6-CHAMBER .357 CYLINDER, EXTRACTOR STAR & SPEEDLOADER ('magazine' · 6)
// ============================================================================

/**
 * M-01: Swing-Out Cylinder Crane / Yoke & Spindle Arbor
 * (assembledPos: [2.22, 0.28, -0.28])
 * Connects lower-left frame hinge (`world [2.98, -0.48, -0.32]`) up to cylinder spindle (`world [0.10, 1.17, 0]`).
 */
export function buildPythonCraneGeometry(): THREE.BufferGeometry {
  // Lower hinge barrel inside front frame lug (world Y = -0.48, Z = -0.32 -> local Y = -0.76, Z = -0.04)
  const hingeBarrel = latheAlongX(
    [
      [0.0, 0.06],
      [0.255, 0.09],
      [0.255, 1.42],
      [0.22, 1.46],
      [0.0, 1.46],
    ],
    22,
    PYTHON_ROYAL_BLUE
  ).translate(0, -0.76, -0.04);

  // Swept vertical yoke arm climbing from hinge `[0.18, -0.76, -0.04]` up to spindle `[0.18, +0.89, +0.28]`
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.18, -0.76, -0.04),
    new THREE.Vector3(0.18, -0.22, -0.18),
    new THREE.Vector3(0.18, 0.42, 0.12),
    new THREE.Vector3(0.18, 0.89, 0.28),
  ]);
  const yokeArm = paintGeometry(
    new THREE.TubeGeometry(armCurve, 18, 0.22, 14, false),
    PYTHON_ROYAL_BLUE
  );
  const armCapBot = paintGeometry(
    new THREE.SphereGeometry(0.22, 14, 10).translate(0.18, -0.76, -0.04),
    PYTHON_ROYAL_BLUE
  );
  const armCapTop = paintGeometry(
    new THREE.SphereGeometry(0.24, 14, 10).translate(0.18, 0.89, 0.28),
    PYTHON_ROYAL_BLUE
  );

  // Tubular cylinder spindle arbor extending rearward along cylinder axis (local Y = +0.89, Z = +0.28)
  const spindleTube = latheAlongX(
    [
      [0.19, -3.72],
      [0.32, -3.72],
      [0.32, 0.18],
      [0.38, 0.22],
      [0.38, 0.32],
      [0.19, 0.32],
      [0.19, -3.72],
    ],
    24,
    PYTHON_STAINLESS
  ).translate(0, 0.89, 0.28);

  return sanitizePythonMesh(
    mergeParts([hingeBarrel, yokeArm, armCapBot, armCapTop, spindleTube])
  );
}

/**
 * M-02: 6-Chamber Fluted .357 Magnum Cylinder (Exact 1:1 CAD: OD = 3.94 cm, R = 1.97 cm,
 * 6 bored .357 chambers at radial pitch radius `1.18 cm` around cylinder axis!)
 * (assembledPos: [0.10, 1.17, 0] — Chamber #1 at +Y (`[0, +1.18, 0]`) sits at world `[0.10, 2.35, 0]`,
 * 100% coaxial with the 6" barrel bore!)
 * Strictly C_6 (60-deg) rotationally symmetric around +X.
 */
export function buildPythonCylinderGeometry(): THREE.BufferGeometry {
  // 1. Solid outer cylinder blank (L = 4.16 cm, X in [-2.08, +2.08], R = 1.97 cm = 39.4 mm OD)
  //    with iconic Colt beveled front holster-entry nose!
  const blank = latheAlongX(
    [
      [0.34, -2.08], // Central extractor stem bore
      [1.94, -2.08], // Rear face
      [1.97, -2.04], // Rear chamfer
      [1.97, 1.84], // Full 39.4mm OD cylinder wall
      [1.83, 2.08], // Beveled Colt front cylinder nose
      [0.34, 2.08], // Front center bore mouth
      [0.34, -2.08],
    ],
    48,
    PYTHON_ROYAL_BLUE
  );

  // 2. Build all C_6 symmetric cutters:
  //    - 6 through-bored .357 Magnum chambers (`r = 0.495 cm` body + recessed rim counterbore `r = 0.565 cm`)
  //      at radial pitch radius `1.18 cm` (`k * 60 deg`, k=0 at +Y 12 o'clock!)
  //    - 6 external scalloped weight-reduction flutes at `(k + 0.5) * 60 deg` (`X in [-0.82, +1.64]`)
  //    - 6 external rectangular cylinder-bolt stop notches + lead-in ramps at `k * 60 deg + 180 deg` (`X in [-1.18, -0.62]`)
  const chamberCutters: THREE.BufferGeometry[] = [];
  const externalCutters: THREE.BufferGeometry[] = [];

  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    const cy = Math.cos(ang) * 1.18;
    const cz = Math.sin(ang) * 1.18;

    // Main .357 Magnum chamber bore + stepped bullet throat
    chamberCutters.push(
      new THREE.CylinderGeometry(0.475, 0.495, 4.32, 24)
        .rotateZ(Math.PI / 2)
        .translate(0, cy, cz)
    );
    // Recessed cartridge rim counterbore at rear face
    chamberCutters.push(
      new THREE.CylinderGeometry(0.555, 0.555, 0.26, 24)
        .rotateZ(Math.PI / 2)
        .translate(-2.02, cy, cz)
    );

    // Scalloped external flute at (k + 0.5) * 60 deg
    const fluteAng = ang + Math.PI / 6;
    const fy = Math.cos(fluteAng) * 2.18;
    const fz = Math.sin(fluteAng) * 2.18;
    const flute = new THREE.CylinderGeometry(0.46, 0.46, 2.35, 20)
      .rotateZ(Math.PI / 2)
      .translate(0.38, fy, fz);
    const fluteBallRear = new THREE.SphereGeometry(0.46, 16, 12).translate(
      -0.795,
      fy,
      fz
    );
    const fluteBallFront = new THREE.SphereGeometry(0.46, 16, 12).translate(
      1.555,
      fy,
      fz
    );
    externalCutters.push(flute, fluteBallRear, fluteBallFront);

    // External bolt stop notch at `ang + Math.PI` (so k=0 puts notch at 6 o'clock Y = -1.97!)
    const notchAng = ang + Math.PI;
    const notchBox = new THREE.BoxGeometry(0.54, 0.28, 0.30);
    notchBox.translate(-0.92, 1.96, 0);
    notchBox.rotateX(notchAng);
    externalCutters.push(notchBox);
  }

  // Rear star recess pocket (R = 1.24, X in [-2.12, -1.94])
  const starRecess = paintGeometry(
    new THREE.CylinderGeometry(1.24, 1.24, 0.22, 36)
      .rotateZ(Math.PI / 2)
      .translate(-2.03, 0, 0),
    PYTHON_BORE_DARK
  );

  const boredCylinder = csgSubtract(blank, [
    mergeCutters(chamberCutters, PYTHON_BORE_DARK),
    mergeCutters(externalCutters, PYTHON_CHAMFER_BLUE),
    starRecess,
  ]);

  return sanitizePythonMesh(applyPythonCylinderUVs(boredCylinder), true);
}

/**
 * M-03: 6-Point Precision Ratchet Extractor Star & Central Stem
 * (assembledPos: [-0.65, 1.17, 0] — strictly C_6 symmetric around +X!)
 */
export function buildPythonExtractorStarGeometry(): THREE.BufferGeometry {
  // Star plate at local X in [-1.53, -1.33] (world X in [-2.18, -1.98] at rear of cylinder)
  const starDisc = paintGeometry(
    new THREE.CylinderGeometry(1.22, 1.22, 0.20, 36)
      .rotateZ(Math.PI / 2)
      .translate(-1.43, 0, 0),
    PYTHON_STAINLESS
  );

  // Scallop out the 6 .357 chamber rim seats at radial radius 1.18 cm so 6 star fingers remain!
  const starCuts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    starCuts.push(
      new THREE.CylinderGeometry(0.495, 0.495, 0.36, 20)
        .rotateZ(Math.PI / 2)
        .translate(-1.43, Math.cos(ang) * 1.18, Math.sin(ang) * 1.18)
    );
  }
  const starHead = csgSubtract(starDisc, [
    mergeCutters(starCuts, PYTHON_CHAMFER_BLUE),
  ]);

  // Central 6-tooth indexing ratchet hub (`X in [-1.60, -1.43]`) engaged by `python_hand`!
  const ratchetTeeth: THREE.BufferGeometry[] = [starHead];
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    const tooth = new THREE.BoxGeometry(0.18, 0.22, 0.16);
    tooth.rotateX(0.32);
    tooth.translate(-1.51, 0.42, 0);
    tooth.rotateX(ang);
    ratchetTeeth.push(paintGeometry(tooth, PYTHON_MIRROR_STEEL));
  }

  // Central tubular extractor guide stem extending forward inside cylinder spindle
  const stem = latheAlongX(
    [
      [0.14, -1.60],
      [0.27, -1.60],
      [0.27, 2.45],
      [0.14, 2.45],
      [0.14, -1.60],
    ],
    22,
    PYTHON_STAINLESS
  );
  ratchetTeeth.push(stem);

  return sanitizePythonMesh(mergeParts(ratchetTeeth));
}

/**
 * M-04: Diamond-Knurled Front Ejector Rod & Collar
 * (assembledPos: [4.95, 1.17, 0] — spans world X in [2.20, 7.72] inside full underlug shroud!)
 */
export function buildPythonExtractorRodGeometry(): THREE.BufferGeometry {
  const rod = latheAlongX(
    [
      [0.0, -2.75], // Threads into extractor star stem at X = 2.20
      [0.135, -2.72],
      [0.145, 1.92], // Polished stainless shaft
      [0.245, 1.98], // Flared diamond-knurled ejector head (world X in [6.93, 7.72])
      [0.245, 2.74],
      [0.185, 2.77], // Front outer bevel
      [0.085, 2.77], // Concave detent locking socket mating w/ `python_detent_plunger`!
      [0.0, 2.68],
    ],
    26,
    PYTHON_STAINLESS
  );

  const knurlCW = surfaceRidges({
    count: 16,
    r: 0.244,
    height: 0.014,
    width: 0.026,
    x0: 2.02,
    x1: 2.70,
    twistCm: 2.4,
    color: PYTHON_MIRROR_STEEL,
    segments: 6,
  });
  const knurlCCW = surfaceRidges({
    count: 16,
    r: 0.244,
    height: 0.014,
    width: 0.026,
    x0: 2.02,
    x1: 2.70,
    twistCm: -2.4,
    color: PYTHON_MIRROR_STEEL,
    segments: 6,
  });

  return sanitizePythonMesh(mergeParts([rod, knurlCW, knurlCCW]));
}

/**
 * M-05: Helical Center Extractor Return Spring (`aSpringParam` `w = 1` via `createHelicalSpring`!)
 * (assembledPos: [3.65, 1.17, 0] — spans local X in [-1.35, +1.35], world X in [2.30, 5.00])
 */
export function buildPythonExtractorSpringGeometry(): THREE.BufferGeometry {
  const coilSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.35,
      end: 1.35,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.195,
      wireRadius: 0.032,
      coils: 14,
      radialSegments: 10,
      tubularSegmentsPerCoil: 18,
    }),
    PYTHON_SPRING_STEEL
  );

  // Front spring stop collar (`w = 0` merged fitting tracks `scaleX` cleanly)
  const frontCollar = latheAlongX(
    [
      [0.15, 1.32],
      [0.235, 1.32],
      [0.235, 1.42],
      [0.15, 1.42],
      [0.15, 1.32],
    ],
    20,
    PYTHON_STAINLESS
  );

  return sanitizePythonMesh(mergeParts([coilSpring, frontCollar]));
}

/**
 * M-06: HKS 586-A Style 6-Round Rotary .357 Magnum Speedloader
 * (assembledPos: [4.20, -6.20, -2.20] — staged beside trigger guard at t=0,
 * sweeps into coaxial loading alignment behind swung-out cylinder at t=0.30!)
 */
export function buildPythonSpeedloaderGeometry(): THREE.BufferGeometry {
  // 1. Black anodized aluminum speedloader body housing (`X in [-0.65, +0.35]`, R = 1.84 cm)
  const body = latheAlongX(
    [
      [0.26, -0.65],
      [1.82, -0.65],
      [1.85, -0.58],
      [1.85, 0.28],
      [1.78, 0.35],
      [0.26, 0.35],
      [0.26, -0.65],
    ],
    36,
    PYTHON_ANODIZED_KNOB
  );

  // 2. Rear diamond-knurled rotary twist-release knob (`X in [-1.58, -0.68]`)
  const knob = latheAlongX(
    [
      [0.0, -1.58],
      [0.92, -1.58],
      [0.98, -1.50],
      [0.98, -0.82],
      [0.62, -0.65],
      [0.0, -0.65],
    ],
    28,
    PYTHON_ANODIZED_KNOB
  );
  const knobKnurl = surfaceRidges({
    count: 18,
    r: 0.975,
    height: 0.022,
    width: 0.036,
    x0: -1.48,
    x1: -0.85,
    twistCm: 3.2,
    color: PYTHON_CHAMFER_BLUE,
    segments: 5,
  });

  // 3. 6 Live .357 Magnum Jacketed Hollow-Point (JHP) Cartridges held at exact `R = 1.18 cm` pitch circle!
  const parts: THREE.BufferGeometry[] = [body, knob, knobKnurl];
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    const cy = Math.cos(ang) * 1.18;
    const cz = Math.sin(ang) * 1.18;

    // Nickel-plated / gleaming brass .357 Magnum straight-wall rimmed case (`X in [-0.45, +1.55]`)
    const brassCase = latheAlongX(
      [
        [0.0, -0.45],
        [0.54, -0.45], // Rimmed .357 headstamp
        [0.54, -0.34],
        [0.475, -0.32], // Case body (9.63mm)
        [0.472, 1.55], // Cannelured case mouth
        [0.0, 1.55],
      ],
      18,
      k % 2 === 0 ? PYTHON_BRASS_CASE : PYTHON_NICKEL_CASE
    ).translate(0, cy, cz);

    // 158gr Copper-Jacketed Hollow-Point (JHP) projectile (`X in [1.55, 2.38]`)
    const jhpBullet = latheAlongX(
      [
        [0.0, 1.54],
        [0.452, 1.54],
        [0.452, 1.88],
        [0.34, 2.36], // Truncated cone JHP meplat
        [0.16, 2.36],
        [0.09, 2.18], // Hollow-point cavity!
        [0.0, 2.18],
      ],
      18,
      PYTHON_COPPER_JHP
    ).translate(0, cy, cz);

    parts.push(brassCase, jhpBullet);
  }

  // Gold directional release arrow band on knob collar
  const trimRing = latheAlongX(
    [
      [0.982, -1.18],
      [0.992, -1.18],
      [0.992, -1.12],
      [0.982, -1.12],
      [0.982, -1.18],
    ],
    28,
    PYTHON_GOLD_MEDALLION
  );
  parts.push(trimRing);

  return sanitizePythonMesh(mergeParts(parts));
}
