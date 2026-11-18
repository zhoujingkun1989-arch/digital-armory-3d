import * as THREE from 'three';
import {
  createChamferedBox,
  csgSubtract,
  csgUnion,
  mergeParts,
} from '../../../engine/geometry/csgBuilder';
import {
  applyP08FrameUVs,
  applyP08MagKnobUVs,
  applyP08MagTubeUVs,
  applyP08SideplateUVs,
  applyP08StrawPartUVs,
  applyP08WalnutGripUVs,
  createWatertightHelicalSpring,
  extrudeAlongZ,
  mergeCutters,
  P08_ALLOY_KNOB,
  P08_GRIP_ANGLE_RAD,
  P08_MIRROR_STEEL,
  P08_NICKEL_TUBE,
  P08_RUST_BLUE,
  P08_RUST_DEEP,
  P08_SPRING_STEEL,
  P08_STRAW_GOLD,
  P08_STRAW_WARM,
  P08_WALNUT_DARK,
  P08_WALNUT_HEART,
  P08_WHITE_STEEL,
  revolveClosedAlongX,
  sanitizeP08Mesh,
} from './p08Geometries';

// ============================================================================
// 4. FORGED CURVED-RAMP FRAME, SIDEPLATE & WALNUT GRIPS ('frame' · 7 parts: F-01..F-07)
// ============================================================================

/**
 * F-01: Forged Steel DWM 1917 P08 Frame w/ `55 deg` Grip Strap, Rounded Trigger Guard &
 * Twin Curved Rear Toggle Cam Ramps (`Griffstueck`, `isShell: true`, `assembledPos: [0, 0, 0]`).
 * Stationary datum skeleton spanning `X in [-10.00, +3.10], Y in [-9.55, +2.56]`.
 */
export function buildP08FrameGeometry(): THREE.BufferGeometry {
  // 1. Forged frame profile in (X, Y) with iconic 55 deg Luger grip & curved rear cam ramps!
  const frameShape = new THREE.Shape();
  frameShape.moveTo(3.1, 1.36); // Front dust-cover rail nose
  frameShape.lineTo(-8.25, 1.36); // Upper frame rail deck
  // Iconic twin curved rear toggle cam ramps (Kurvenstuecke) kicking rear toggle rollers upward!
  frameShape.quadraticCurveTo(-9.05, 1.48, -9.62, 2.56);
  frameShape.lineTo(-10.0, 2.48); // Exact rear OAL datum X_min = -10.00 cm!
  frameShape.quadraticCurveTo(-9.98, 1.25, -8.85, 0.55); // Swept beaver-tail tang
  frameShape.lineTo(-5.35, -0.35);
  // 55 deg backstrap sweeping down to grip heel (-9.65, -8.85)
  frameShape.lineTo(-9.78, -6.78);
  frameShape.lineTo(-9.92, -7.85); // Stock-lug (Anschlagkolben-Warze) heel
  frameShape.lineTo(-7.22, -9.55); // Bottom magazine well rim
  // 55 deg frontstrap rising to rounded trigger guard root
  frameShape.lineTo(-1.42, -1.52);
  frameShape.quadraticCurveTo(-1.55, -2.18, 0.35, -2.18); // Classic semicircular DWM trigger guard!
  frameShape.quadraticCurveTo(2.25, -2.18, 2.28, 0.28);
  frameShape.lineTo(3.1, 0.42);
  frameShape.closePath();

  // Trigger guard interior bow aperture
  const tgBow = new THREE.Path();
  tgBow.moveTo(-1.05, 0.24);
  tgBow.lineTo(1.82, 0.24);
  tgBow.quadraticCurveTo(1.82, -1.78, 0.36, -1.78);
  tgBow.quadraticCurveTo(-1.12, -1.78, -1.05, 0.24);
  frameShape.holes.push(tgBow);

  const rawForging = extrudeAlongZ(
    frameShape,
    -1.02,
    2.04,
    P08_RUST_BLUE,
    0.04,
    12
  );

  // Upper-right checkered magazine catch button & stock-lug T-bar on lower backstrap
  const magCatchBtn = revolveClosedAlongX(
    [
      [0.0, 0.72],
      [0.34, 0.72],
      [0.34, 1.12],
      [0.28, 1.16],
      [0.0, 1.16],
    ],
    20,
    P08_RUST_DEEP
  );
  magCatchBtn.rotateY(Math.PI / 2);
  magCatchBtn.translate(-2.05, -0.82, 0);

  const stockLug = createChamferedBox(0.65, 1.55, 0.92, 0.04, P08_RUST_DEEP);
  stockLug.rotateZ(P08_GRIP_ANGLE_RAD);
  stockLug.translate(-9.25, -7.25, 0);

  // 2. Subtract upper barrel-extension guide raceway, central curved-ramp slot,
  //    55 deg magazine well, rear recoil-spring tunnel, left sideplate window & grip tang steps!
  const magWellCutter = new THREE.BoxGeometry(2.68, 12.6, 1.42);
  magWellCutter.rotateZ(P08_GRIP_ANGLE_RAD);
  magWellCutter.translate(-4.45, -3.3, 0);

  const recoilSpringTunnel = new THREE.CylinderGeometry(0.45, 0.45, 8.2, 20);
  recoilSpringTunnel.rotateZ(P08_GRIP_ANGLE_RAD);
  recoilSpringTunnel.translate(-7.15, -4.55, 0);

  const leftGripStep = new THREE.BoxGeometry(4.4, 10.2, 0.46);
  leftGripStep.rotateZ(P08_GRIP_ANGLE_RAD);
  leftGripStep.translate(-5.65, -4.45, -0.92);

  const rightGripStep = new THREE.BoxGeometry(4.4, 10.2, 0.46);
  rightGripStep.rotateZ(P08_GRIP_ANGLE_RAD);
  rightGripStep.translate(-5.65, -4.45, 0.92);

  const frameCutters = mergeCutters([
    // Central upper raceway between twin curved cam ramps (`Z in [-0.64, +0.64]`)
    new THREE.BoxGeometry(13.6, 2.2, 1.28).translate(-3.4, 1.75, 0),
    // S-coupling link & bellcrank vertical slot connecting upper tang to rear recoil-spring tunnel
    new THREE.BoxGeometry(2.2, 3.8, 0.68).translate(-7.85, 0.15, 0),
    // Left-front recessed mortise for `p08_sideplate` & `p08_takedown_lever`
    new THREE.BoxGeometry(3.05, 1.42, 0.56).translate(1.38, 0.92, -0.88),
    // Trigger slot into trigger guard
    new THREE.BoxGeometry(1.32, 0.95, 0.72).translate(0.55, 0.12, 0),
    // Left thumb-safety pivot & "GESICHERT" recess
    new THREE.BoxGeometry(2.15, 1.25, 0.24).translate(-7.15, 0.72, -0.98),
    magWellCutter,
    recoilSpringTunnel,
    leftGripStep,
    rightGripStep,
  ]);

  const milledFrame = csgSubtract(
    csgUnion([rawForging, magCatchBtn, stockLug]),
    [frameCutters]
  );

  return sanitizeP08Mesh(applyP08FrameUVs(milledFrame), true);
}

/**
 * F-02: Detachable Left Trigger-Lever Sideplate (`Abzugsblech`, `isShell: true`)
 * (`assembledPos: [1.35, 0.92, -0.96]`).
 * Houses `p08_trigger_lever` and unlocks instantaneously when `p08_takedown_lever` rotates 90 deg!
 */
export function buildP08SideplateGeometry(): THREE.BufferGeometry {
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-1.42, -0.52);
  plateShape.lineTo(0.85, -0.52);
  plateShape.quadraticCurveTo(1.22, -0.52, 1.42, -0.12); // Front locking nose
  plateShape.lineTo(1.42, 0.58);
  plateShape.lineTo(-1.42, 0.64);
  plateShape.closePath();

  const basePlate = extrudeAlongZ(
    plateShape,
    -0.14,
    0.26,
    P08_RUST_BLUE,
    0.022,
    8
  );

  // Raised circular bellcrank housing boss on outer left face
  const bellcrankBoss = createChamferedBox(
    1.45,
    1.12,
    0.16,
    0.03,
    P08_RUST_DEEP
  );
  bellcrankBoss.translate(-0.18, 0.04, -0.1);

  const innerCutters = mergeCutters([
    // Inner milled pocket accommodating `p08_trigger_lever`
    new THREE.BoxGeometry(1.52, 1.08, 0.2).translate(-0.18, 0.02, 0.08),
    // Semicircular bottom notch engaged by `p08_takedown_lever` cam!
    new THREE.CylinderGeometry(0.28, 0.28, 0.45, 18)
      .rotateX(Math.PI / 2)
      .translate(1.18, -0.46, 0),
  ]);

  const finishedPlate = csgSubtract(csgUnion([basePlate, bellcrankBoss]), [
    innerCutters,
  ]);
  return sanitizeP08Mesh(applyP08SideplateUVs(finishedPlate), true);
}

/**
 * F-03: Straw-Tempered (`Gelbangelassen`) Rotating Takedown Locking Lever (`Zerlegehebel`)
 * (`assembledPos: [2.55, 0.48, -0.95]`).
 */
export function buildP08TakedownLeverGeometry(): THREE.BufferGeometry {
  const leverShape = new THREE.Shape();
  leverShape.moveTo(0.22, 0.22); // Pivot head
  leverShape.lineTo(-0.78, -0.35); // Swept serrated thumb paddle
  leverShape.quadraticCurveTo(-0.88, -0.68, -0.52, -0.68);
  leverShape.lineTo(0.22, -0.18);
  leverShape.closePath();

  const thumbArm = extrudeAlongZ(
    leverShape,
    -0.22,
    0.22,
    P08_STRAW_GOLD,
    0.02,
    8
  );

  // Cross-frame locking cam shaft extending into frame bore (`Z_local in [-0.18, +0.92]`)
  const camShaft = revolveClosedAlongX(
    [
      [0.0, -0.2],
      [0.24, -0.2],
      [0.24, 0.12],
      [0.16, 0.14],
      [0.16, 0.92],
      [0.0, 0.92],
    ],
    20,
    P08_STRAW_WARM
  );
  camShaft.rotateY(Math.PI / 2);

  const unitedLever = csgUnion([thumbArm, camShaft]);
  return sanitizeP08Mesh(applyP08StrawPartUVs(unitedLever, 'lever'), true);
}

/**
 * F-04: Straw-Tempered Right-Flank Leaf-Spring Ejector Blade (`Auswerfer`)
 * (`assembledPos: [-1.15, 2.02, 0.72]`).
 */
export function buildP08EjectorGeometry(): THREE.BufferGeometry {
  const leafBody = createChamferedBox(2.88, 0.24, 0.14, 0.02, P08_STRAW_GOLD);

  // Rear retaining T-lug & front inward-projecting case-kicking nose (`Z_local = -0.16`)
  const rearAnchor = createChamferedBox(0.36, 0.4, 0.2, 0.02, P08_STRAW_WARM);
  rearAnchor.translate(-1.26, 0, 0.03);

  const frontKickNose = createChamferedBox(
    0.42,
    0.22,
    0.26,
    0.02,
    P08_STRAW_GOLD
  );
  frontKickNose.translate(1.22, 0, -0.11);

  const unitedEjector = csgUnion([leafBody, rearAnchor, frontKickNose]);
  return sanitizeP08Mesh(applyP08StrawPartUVs(unitedEjector, 'ejector'), true);
}

/**
 * F-05: Internal Last-Round Toggle Hold-Open Latch & Leaf Spring (`Verschlussfang`)
 * (`assembledPos: [-0.85, 1.28, 0.36]`).
 */
export function buildP08HoldOpenGeometry(): THREE.BufferGeometry {
  const latchShape = new THREE.Shape();
  latchShape.moveTo(-1.12, -0.12); // Rear pivot end
  latchShape.lineTo(0.75, -0.12);
  latchShape.lineTo(1.12, 0.26); // Upward breechblock-catching tooth (Fangnase)!
  latchShape.lineTo(0.84, 0.26);
  latchShape.lineTo(0.45, 0.04);
  latchShape.lineTo(-1.12, 0.04);
  latchShape.closePath();

  const latchBar = extrudeAlongZ(
    latchShape,
    -0.12,
    0.24,
    P08_WHITE_STEEL,
    0.016,
    6
  );

  // Follower-button lift tab & flat return spring underneath
  const followerTab = createChamferedBox(
    0.34,
    0.16,
    0.32,
    0.015,
    P08_MIRROR_STEEL
  );
  followerTab.translate(0.18, -0.14, -0.06);

  const leafSpring = createChamferedBox(
    1.55,
    0.055,
    0.14,
    0.01,
    P08_SPRING_STEEL
  );
  leafSpring.rotateZ(-0.08);
  leafSpring.translate(-0.22, -0.18, 0);

  return sanitizeP08Mesh(mergeParts([latchBar, followerTab, leafSpring]));
}

/**
 * Shared sculpted builder for F-06 (`left`) & F-07 (`right`) 20-LPI Checkered European Walnut Grip Panels
 * (`isShell: true`, `assembledPos: [-5.65, -4.45, +-0.92]`).
 */
function buildP08WalnutGripPanel(side: 'left' | 'right'): THREE.BufferGeometry {
  const signZ = side === 'right' ? 1 : -1;

  // Exact 55 deg raked parallelogram-trapezoid Luger P08 grip outline in local (X, Y)
  const gripShape = new THREE.Shape();
  gripShape.moveTo(1.35, 4.55); // Upper-rear tang corner
  gripShape.lineTo(3.62, 3.85); // Upper-front corner under trigger guard
  gripShape.lineTo(-1.25, -4.65); // Lower-front magazine butt corner
  gripShape.lineTo(-3.88, -3.55); // Lower-rear heel corner
  gripShape.closePath();

  // Right panel reaches inward to Z_world = +0.02 (straddling section plane z = +0.06 cleanly!)
  const zMin = side === 'right' ? -0.9 : -0.34;
  const rawSlab = extrudeAlongZ(
    gripShape,
    zMin,
    1.24,
    P08_WALNUT_HEART,
    0.11,
    10
  );

  // Carve inner frame-rail bedding step & upper crescent relief for safety (left) / mag catch (right)
  const beddingMortise = new THREE.BoxGeometry(3.4, 9.8, 0.72);
  beddingMortise.rotateZ(P08_GRIP_ANGLE_RAD);
  beddingMortise.translate(0.0, 0.0, side === 'right' ? -0.62 : 0.62);

  const upperRelief = new THREE.CylinderGeometry(0.68, 0.68, 1.5, 20)
    .rotateX(Math.PI / 2)
    .translate(side === 'left' ? -1.45 : 3.25, side === 'left' ? 4.45 : 3.65, 0);

  const sculptedWood = csgSubtract(rawSlab, [
    mergeCutters([beddingMortise, upperRelief], P08_WALNUT_DARK),
  ]);

  // Lower blued slotted grip retention screw head
  const gripScrew = revolveClosedAlongX(
    [
      [0.0, -0.14],
      [0.22, -0.14],
      [0.22, 0.14],
      [0.0, 0.14],
    ],
    18,
    P08_RUST_DEEP
  );
  gripScrew.rotateY(Math.PI / 2);
  gripScrew.translate(-2.45, -3.45, signZ * 0.24);

  return sanitizeP08Mesh(
    applyP08WalnutGripUVs(mergeParts([sculptedWood, gripScrew]), side),
    true
  );
}

/** F-06: Finely Checkered European Walnut Left Grip Panel (`isShell: true`) */
export function buildP08GripLeftGeometry(): THREE.BufferGeometry {
  return buildP08WalnutGripPanel('left');
}

/** F-07: Finely Checkered European Walnut Right Grip Panel (`isShell: true`) */
export function buildP08GripRightGeometry(): THREE.BufferGeometry {
  return buildP08WalnutGripPanel('right');
}

// ============================================================================
// 5. LATERAL L-LEVER SEAR, CRESCENT TRIGGER & S-LINK RECOIL ('fire_control' · 5 parts)
// ============================================================================

/**
 * FC-01: Iconic Straw-Tempered (`Gelbangelassen`) Crescent Trigger (`Abzug`)
 * (`assembledPos: [0.55, -0.15, 0]`, pivots around upper pin `[0, 0, 0]`).
 */
export function buildP08TriggerGeometry(): THREE.BufferGeometry {
  const trigShape = new THREE.Shape();
  trigShape.moveTo(-0.32, 0.44); // Upper bellcrank-actuating cam nose!
  trigShape.lineTo(0.36, 0.36);
  trigShape.lineTo(0.28, -0.18);
  // Deeply sculpted classic Luger half-moon crescent finger shoe!
  trigShape.quadraticCurveTo(0.66, -0.88, 0.14, -1.58);
  trigShape.lineTo(-0.22, -1.52);
  trigShape.quadraticCurveTo(0.22, -0.88, -0.16, -0.24);
  trigShape.lineTo(-0.48, 0.12);
  trigShape.closePath();

  const pivotHole = new THREE.Path();
  pivotHole.absarc(0, 0, 0.11, 0, Math.PI * 2, true);
  trigShape.holes.push(pivotHole);

  const shoe = extrudeAlongZ(
    trigShape,
    -0.28,
    0.56,
    P08_STRAW_GOLD,
    0.028,
    10
  );

  const pivotPin = revolveClosedAlongX(
    [
      [0.0, -0.34],
      [0.105, -0.34],
      [0.105, 0.34],
      [0.0, 0.34],
    ],
    16,
    P08_WHITE_STEEL
  );
  pivotPin.rotateY(Math.PI / 2);

  return sanitizeP08Mesh(
    applyP08StrawPartUVs(mergeParts([shoe, pivotPin]), 'trigger'),
    true
  );
}

/**
 * FC-02: Sideplate L-Shaped Bellcrank Transfer Lever (`Abzugshebel`)
 * (`assembledPos: [1.15, 0.92, -0.82]`).
 * Georg Luger's signature mechanical bellcrank inside `p08_sideplate`: converts rearward
 * `p08_trigger` pull into an outward/inward lateral cam push on `p08_sear_bar`'s front plunger!
 */
export function buildP08TriggerLeverGeometry(): THREE.BufferGeometry {
  // Vertical arm receiving upper cam nose of `p08_trigger`
  const lowerArm = createChamferedBox(0.32, 1.18, 0.18, 0.02, P08_WHITE_STEEL);
  lowerArm.rotateZ(0.22);
  lowerArm.translate(-0.18, -0.22, 0.04);

  // Upper horizontal L-arm pressing inward/upward onto `p08_sear_bar` plunger
  const upperArm = createChamferedBox(0.96, 0.28, 0.22, 0.02, P08_MIRROR_STEEL);
  upperArm.translate(-0.22, 0.46, -0.06);

  // Vertical bellcrank pivot pin anchored in `p08_sideplate`
  const vertPin = revolveClosedAlongX(
    [
      [0.0, -0.52],
      [0.085, -0.52],
      [0.085, 0.52],
      [0.0, 0.52],
    ],
    14,
    P08_WHITE_STEEL
  );
  vertPin.rotateZ(Math.PI / 2);
  vertPin.translate(0.18, 0.08, -0.02);

  return sanitizeP08Mesh(mergeParts([lowerArm, upperArm, vertPin]));
}

/**
 * FC-03: Horizontal Left-Flank Sear Bar, Disconnector Plunger & Leaf Spring (`Abzugsstange`)
 * (`assembledPos: [-1.85, 2.08, -1.04]`).
 * Rides inside the left groove of `p08_barrel_extension`; front plunger pushed by `p08_trigger_lever`
 * rocks rear sear tooth outward (`-Z`) to release `p08_striker`!
 */
export function buildP08SearBarGeometry(): THREE.BufferGeometry {
  const mainBar = createChamferedBox(4.18, 0.26, 0.16, 0.02, P08_RUST_DEEP);

  // Spring-loaded front disconnector plunger (`X_local = +1.85`)
  const frontPlunger = revolveClosedAlongX(
    [
      [0.0, -0.18],
      [0.11, -0.18],
      [0.11, 0.18],
      [0.0, 0.18],
    ],
    16,
    P08_WHITE_STEEL
  );
  frontPlunger.rotateY(Math.PI / 2);
  frontPlunger.translate(1.85, -0.04, 0.04);

  // Rear inward-projecting sear catch tooth (`Z_local = +0.16`) engaging `p08_striker` lug
  const rearSearTooth = createChamferedBox(
    0.42,
    0.24,
    0.24,
    0.02,
    P08_MIRROR_STEEL
  );
  rearSearTooth.translate(-0.95, 0, 0.1);

  // Flat sear leaf return spring
  const searLeaf = createChamferedBox(
    1.85,
    0.06,
    0.14,
    0.01,
    P08_SPRING_STEEL
  );
  searLeaf.translate(-0.65, 0.16, -0.04);

  return sanitizeP08Mesh(
    mergeParts([mainBar, frontPlunger, rearSearTooth, searLeaf])
  );
}

/**
 * FC-04: Straw-Tempered Knurled Thumb Safety Lever & Blocking Bar (`Sicherungshebel`)
 * (`assembledPos: [-7.35, 0.45, -0.96]`).
 * Swings down/rearward to uncover `"GESICHERT"` while sliding its steel blocking bar forward
 * to lock `p08_sear_bar`!
 */
export function buildP08ThumbSafetyGeometry(): THREE.BufferGeometry {
  const leverShape = new THREE.Shape();
  leverShape.moveTo(0.18, -0.22); // Pivot hub
  leverShape.lineTo(-0.88, 0.78); // Swept thumb-lever arm
  leverShape.quadraticCurveTo(-1.22, 1.12, -0.82, 1.32);
  leverShape.lineTo(0.32, 0.18);
  leverShape.closePath();

  const safetyArm = extrudeAlongZ(
    leverShape,
    -0.14,
    0.22,
    P08_STRAW_GOLD,
    0.02,
    8
  );

  // Circular checkered thumb pad (Daumenstueck) at top-rear tip
  const thumbDisc = revolveClosedAlongX(
    [
      [0.0, -0.22],
      [0.36, -0.22],
      [0.36, 0.08],
      [0.0, 0.08],
    ],
    20,
    P08_STRAW_WARM
  );
  thumbDisc.rotateY(Math.PI / 2);
  thumbDisc.translate(-0.92, 0.98, 0);

  // Forward sliding sear-blocking bar (`Sicherungsstange`)
  const blockBar = createChamferedBox(2.35, 0.2, 0.14, 0.018, P08_WHITE_STEEL);
  blockBar.translate(1.15, 0.86, 0.12);

  return sanitizeP08Mesh(
    applyP08StrawPartUVs(
      mergeParts([safetyArm, thumbDisc, blockBar]),
      'lever'
    ),
    true
  );
}

/**
 * FC-05: Grip-Housed Helical Recoil Spring, Guide Rod & S-Shaped Toggle Coupling Link
 * (`Schliessfeder, Federfuehrungsstange & Kupplungsglied`)
 * (`assembledPos: [-8.95, -7.10, 0]`, `assembledRot: [0, 0, P08_GRIP_SPRING_ROT_Z]`).
 * Built cleanly along **local `axis: 'x'`** (`start: 0.16, end: 5.75`, `w = 1` `SPRING_AXIS_MODE_X`)
 * with stationary heel anchor at local `x = 0`, compressing smoothly inside the `55 deg` grip!
 */
export function buildP08RecoilSpringGeometry(): THREE.BufferGeometry {
  // 1. 18-coil tempered music-wire recoil spring (`aSpringParam` `w = 1`)
  const recoilCoils = createWatertightHelicalSpring(
    {
      axis: 'x',
      start: 0.16,
      end: 5.75,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.31,
      wireRadius: 0.048,
      coils: 18,
      radialSegments: 10,
      tubularSegmentsPerCoil: 16,
    },
    P08_SPRING_STEEL
  );

  // 2. Stationary heel seat flange near local x = 0 + upper sliding bellcrank collar & S-coupling hook
  const heelBase = revolveClosedAlongX(
    [
      [0.0, -0.06],
      [0.36, -0.06],
      [0.36, 0.12],
      [0.14, 0.14],
      [0.14, 3.2], // Inner guide rod
      [0.0, 3.22],
    ],
    18,
    P08_WHITE_STEEL
  );

  const upperCollar = revolveClosedAlongX(
    [
      [0.15, 5.72],
      [0.36, 5.72],
      [0.36, 5.96],
      [0.15, 5.96],
      [0.15, 5.72],
    ],
    18,
    P08_MIRROR_STEEL
  );

  // Iconic S-shaped coupling link (`Kupplungsglied`) reaching up from grip lever toward rear toggle hook
  const sLinkLower = createChamferedBox(
    1.85,
    0.22,
    0.24,
    0.02,
    P08_WHITE_STEEL
  );
  sLinkLower.rotateZ(0.32);
  sLinkLower.translate(6.65, 0.28, 0);

  const sLinkUpper = createChamferedBox(
    1.75,
    0.22,
    0.22,
    0.02,
    P08_MIRROR_STEEL
  );
  sLinkUpper.rotateZ(0.68);
  sLinkUpper.translate(7.95, 1.05, 0);

  return sanitizeP08Mesh(
    mergeParts([recoilCoils, heelBase, upperCollar, sLinkLower, sLinkUpper])
  );
}

// ============================================================================
// 6. 8-ROUND SHEET-STEEL MAGAZINE W/ CONCENTRIC PULL KNOB ('magazine' · 4 parts)
// ============================================================================

/**
 * M-01: Brushed Nickel `55 deg`-Angled 8-Round Sheet-Steel Magazine Body (`Magazingehaeuse`, `isShell: true`)
 * (`assembledPos: [-4.45, -3.30, 0]`, `assembledRot: [0, 0, P08_GRIP_ANGLE_RAD]`).
 * Features tapered single-feed lips, right-flank catch notch, and full-length left follower-button slot!
 */
export function buildP08MagBodyGeometry(): THREE.BufferGeometry {
  const outerBox = createChamferedBox(2.52, 11.2, 1.28, 0.06, P08_NICKEL_TUBE);

  // Folded rear stiffening spine rib characteristic of folded sheet-steel P08 magazines
  const spineRib = createChamferedBox(0.24, 11.1, 0.56, 0.03, P08_WHITE_STEEL);
  spineRib.translate(-1.26, 0, 0);

  const magCutters = mergeCutters([
    // Hollow 8-round 9x19mm interior cavity (`x in [-1.10, +1.10], z in [-0.52, +0.52]`)
    new THREE.BoxGeometry(2.2, 10.95, 1.04).translate(0.02, 0.18, 0),
    // Top bullet-nose scoop & angled presentation feed throat!
    new THREE.BoxGeometry(1.75, 1.15, 0.86).translate(0.42, 5.45, 0),
    // Iconic left-flank full-length vertical slot for `p08_mag_follower` loading thumb button!
    new THREE.BoxGeometry(0.32, 8.65, 0.45).translate(0.12, -0.25, -0.58),
    // Right-flank rectangular magazine catch locking window
    new THREE.BoxGeometry(0.52, 0.34, 0.36).translate(0.85, 3.15, 0.56),
  ]);

  const milledTube = csgSubtract(csgUnion([outerBox, spineRib]), [magCutters]);
  return sanitizeP08Mesh(applyP08MagTubeUVs(milledTube), true);
}

/**
 * M-02: Machined Steel Follower w/ Knurled External Thumb Loading Button (`Zubringer & Knopf`)
 * (`assembledPos: [-5.88, -5.35, 0]`, `assembledRot: [0, 0, P08_GRIP_ANGLE_RAD]`).
 */
export function buildP08MagFollowerGeometry(): THREE.BufferGeometry {
  // Stepped cartridge-cradling follower platform tilted to align 9x19mm rounds horizontally
  const platform = createChamferedBox(1.92, 0.68, 0.94, 0.04, P08_WHITE_STEEL);
  platform.rotateZ(0.42);

  const guideSkirt = createChamferedBox(1.48, 0.85, 0.86, 0.03, P08_WHITE_STEEL);
  guideSkirt.translate(-0.08, -0.45, 0);

  // Iconic projecting knurled external thumb loading button (`Zubringerknopf`) on left flank (`-Z`)!
  const thumbButton = revolveClosedAlongX(
    [
      [0.0, -0.96],
      [0.34, -0.96], // Knurled circular thumb button face outside magazine slot!
      [0.38, -0.88],
      [0.38, -0.68],
      [0.14, -0.64], // Neck passing through left magazine slot
      [0.14, -0.15],
      [0.0, -0.15],
    ],
    22,
    P08_MIRROR_STEEL
  );
  thumbButton.rotateY(Math.PI / 2);
  thumbButton.translate(0.12, -0.12, 0);

  return sanitizeP08Mesh(mergeParts([platform, guideSkirt, thumbButton]));
}

/**
 * M-03: Angled Helical Magazine Spring (`Zubringerfeder`)
 * (`assembledPos: [-7.78, -8.06, 0]`, `assembledRot: [0, 0, P08_GRIP_SPRING_ROT_Z]`).
 * Built along local `axis: 'x'` (`start: 0.10, end: 2.25`, `w = 1` `SPRING_AXIS_MODE_X`)
 * with stationary floorplate seat at local `x = 0`!
 */
export function buildP08MagSpringGeometry(): THREE.BufferGeometry {
  const magCoils = createWatertightHelicalSpring(
    {
      axis: 'x',
      start: 0.1,
      end: 2.25,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.34,
      wireRadius: 0.04,
      coils: 10,
      radialSegments: 10,
      tubularSegmentsPerCoil: 16,
    },
    P08_SPRING_STEEL
  );

  const bottomSeat = createChamferedBox(
    0.12,
    0.82,
    0.76,
    0.02,
    P08_WHITE_STEEL
  );
  bottomSeat.translate(0.02, 0, 0);

  return sanitizeP08Mesh(mergeParts([magCoils, bottomSeat]));
}

/**
 * M-04: Machined Aluminum / Walnut Twin-Ear Concentric-Ring Pull-Knob Floorplate (`Magazinboden`)
 * (`assembledPos: [-8.18, -8.62, 0]`, `assembledRot: [0, 0, P08_GRIP_ANGLE_RAD]`).
 */
export function buildP08MagBaseGeometry(): THREE.BufferGeometry {
  // Upper plug & heel wedge inserting into bottom of `p08_mag_body`
  const upperPlug = createChamferedBox(2.12, 0.72, 0.98, 0.04, P08_ALLOY_KNOB);
  upperPlug.translate(0, 0.36, 0);

  const baseCollar = createChamferedBox(
    2.62,
    0.48,
    1.34,
    0.05,
    P08_WALNUT_HEART
  );
  baseCollar.translate(0, -0.12, 0);

  // Iconic twin circular pull-knob ears protruding laterally (`+-Z`) with concentric anti-slip rings!
  const leftKnobEar = revolveClosedAlongX(
    [
      [0.0, -0.98],
      [0.58, -0.98],
      [0.66, -0.88],
      [0.66, -0.45],
      [0.0, -0.45],
    ],
    24,
    P08_ALLOY_KNOB
  );
  leftKnobEar.rotateY(Math.PI / 2);
  leftKnobEar.translate(-0.15, -0.38, 0);

  const rightKnobEar = revolveClosedAlongX(
    [
      [0.0, 0.45],
      [0.66, 0.45],
      [0.66, 0.88],
      [0.58, 0.98],
      [0.0, 0.98],
    ],
    24,
    P08_ALLOY_KNOB
  );
  rightKnobEar.rotateY(Math.PI / 2);
  rightKnobEar.translate(-0.15, -0.38, 0);

  // Transverse magazine base retention pin
  const basePin = revolveClosedAlongX(
    [
      [0.0, -0.68],
      [0.065, -0.68],
      [0.065, 0.68],
      [0.0, 0.68],
    ],
    14,
    P08_RUST_DEEP
  );
  basePin.rotateY(Math.PI / 2);
  basePin.translate(0.45, 0.25, 0);

  const unitedBase = csgUnion([
    upperPlug,
    baseCollar,
    leftKnobEar,
    rightKnobEar,
  ]);
  return sanitizeP08Mesh(
    applyP08MagKnobUVs(mergeParts([unitedBase, basePin])),
    true
  );
}
