import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../springHelper';
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

// ============================================================================
// GROUP 1: COYOTE TAN PVD SLIDE, OPTIC PLATE & 4.7" BARREL (11 Builders)
// ============================================================================

/**
 * U-01: Coyote Tan PVD Stainless Steel Slide (p320_slide, isShell: true)
 * Features SIG Sauer's signature high-shoulder beveled tri-top profile, full-contour recoil hood,
 * 5 angled front & 6 angled rear cocking serrations, lowered ejection port, and M17 rear optic cut.
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

  // 2. Underside FCU rail channels & open central slide belly
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

  // 3. Barrel bore + Recoil spring tunnel + Guide rod front hole
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.75, 0.75, 12.6, 30)
        .rotateZ(Math.PI / 2)
        .translate(5.55, 2.68, 0),
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
      new THREE.BoxGeometry(9.1, 1.15, 1.14).translate(6.2, 2.05, 0),
      SLIDE_MILLED
    )
  );

  // 4. SIG Sauer Open Top-Right Ejection Port (X in [-0.55, +2.65])
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

  // 5. M17 Rear Optic-Ready Milled Cutout (X in [-7.56, -3.54], Y in [+3.26, +3.72])
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(4.02, 0.46, 2.25).translate(-5.55, 3.49, 0),
      SLIDE_MILLED
    )
  );

  // Front sight dovetail slot at X = +10.55
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.52, 0.14, 2.2).translate(10.55, 3.55, 0),
      SLIDE_MILLED
    )
  );

  // 6. Internal Striker Housing Pocket + External Extractor Slot on Right Wall
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(7.35, 0.92, 0.82).translate(-4.22, 2.52, 0),
      SLIDE_MILLED
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.38, 0.52, 0.56).translate(-1.46, 2.68, 1.08),
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

  // 8. 5 Angled Front Cocking Serrations (X: +7.75 to +9.75) & 6 Angled Rear Serrations (X: -6.95 to -4.45)
  for (let i = 0; i < 5; i++) {
    const fx = 7.75 + i * 0.48;
    for (const sign of [-1, 1]) {
      cutters.push(
        paintGeometry(
          new THREE.BoxGeometry(0.19, 1.55, 0.18)
            .rotateZ(-0.26)
            .translate(fx, 1.78, sign * 1.29),
          SLIDE_MILLED
        )
      );
    }
  }
  for (let i = 0; i < 6; i++) {
    const rx = -6.92 + i * 0.48;
    for (const sign of [-1, 1]) {
      cutters.push(
        paintGeometry(
          new THREE.BoxGeometry(0.19, 1.85, 0.18)
            .rotateZ(-0.26)
            .translate(rx, 1.92, sign * 1.29),
          SLIDE_MILLED
        )
      );
    }
  }

  return applyP320SlideAtlasUVs(csgSubtract(rawSlide, cutters));
}

/**
 * U-02: Removable Black Anodized Rear Optic Plate w/ Integral M17 SIGLITE Night Rear Sight
 * World assembledPos = [-5.55, 3.26, 0] (sits flush inside p320_slide rear optic cut).
 */
export function buildP320OpticPlateSightGeometry(): THREE.BufferGeometry {
  const PLATE_BLACK = '#1e232b';
  const SIGHT_STEEL = '#282f3a';
  const TRITIUM_GLOW = '#bef264';
  const WHITE_RING = '#f8fafc';

  // Precision milled optic cover plate spanning x in [-1.98, +1.98], y in [0, +0.32]
  const plate = paintGeometry(
    new THREE.BoxGeometry(3.96, 0.32, 1.86).translate(0, 0.16, 0),
    PLATE_BLACK
  );

  // Integral M17 protective-ear night rear sight body rising above plate
  const sightShape = new THREE.Shape();
  sightShape.moveTo(-1.72, 0.28);
  sightShape.lineTo(-0.35, 0.28);
  sightShape.lineTo(-0.52, 0.8);
  sightShape.lineTo(-1.62, 0.8);
  sightShape.closePath();

  const sightBody = new THREE.ExtrudeGeometry(sightShape, {
    depth: 1.56,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  sightBody.translate(0, 0, -0.78);
  paintGeometry(sightBody, SIGHT_STEEL);

  // Subtract center U-notch & two top Torx screw counterbores
  const notch = paintGeometry(
    new THREE.BoxGeometry(1.6, 0.34, 0.4).translate(-1.05, 0.68, 0),
    '#12151b'
  );
  const screwHoleL = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.14, 14).translate(
      1.05,
      0.3,
      -0.46
    ),
    '#12151b'
  );
  const screwHoleR = screwHoleL.clone().translate(0, 0, 0.92);

  const carved = csgSubtract(mergeParts([plate, sightBody]), [
    notch,
    screwHoleL,
    screwHoleR,
  ]);

  // Two Torx screw heads + Twin SIGLITE tritium rear night dots
  const screwHeadL = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 0.06, 6).translate(
      1.05,
      0.27,
      -0.46
    ),
    '#64748b'
  );
  const screwHeadR = screwHeadL.clone().translate(0, 0, 0.92);

  const dots: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    dots.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.085, 0.085, 0.03, 14)
          .rotateZ(Math.PI / 2)
          .translate(-1.67, 0.56, sign * 0.42),
        WHITE_RING
      )
    );
    dots.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.055, 0.055, 0.036, 12)
          .rotateZ(Math.PI / 2)
          .translate(-1.675, 0.56, sign * 0.42),
        TRITIUM_GLOW
      )
    );
  }

  return mergeParts([carved, screwHeadL, screwHeadR, ...dots]);
}

/**
 * U-03: Dovetail SIGLITE Tritium Front Sight (assembledPos = [10.55, 3.56, 0])
 */
export function buildP320FrontSightGeometry(): THREE.BufferGeometry {
  const dovetail = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.12, 1.32).translate(0, -0.04, 0),
    '#2a313d'
  );

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.46, 0);
  bladeShape.lineTo(0.46, 0);
  bladeShape.lineTo(0.22, 0.48);
  bladeShape.lineTo(-0.42, 0.48);
  bladeShape.closePath();

  const blade = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.26,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  blade.translate(0, 0, -0.13);
  paintGeometry(blade, '#222832');

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
 * U-04: Black Nitride 4.7" Tilting Barrel w/ LCI Slot, Polished Feed Ramp & Camming Lug
 * Bore centerline at Y = +2.68; spans X in [-0.54, +11.80].
 */
export function buildP320BarrelGeometry(): THREE.BufferGeometry {
  const NITRIDE_BARREL = '#272e3a';
  const HOOD_STEEL = '#323b49';
  const POLISHED = '#e2e8f0';

  const tube = paintGeometry(
    new THREE.CylinderGeometry(0.65, 0.65, 9.04, 32)
      .rotateZ(Math.PI / 2)
      .translate(7.14, 2.68, 0),
    NITRIDE_BARREL
  );

  const crown = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.65, 0.16, 32)
      .rotateZ(Math.PI / 2)
      .translate(11.72, 2.68, 0),
    POLISHED
  );

  // Rectangular SIG Sauer Locking Chamber Hood (X in [-0.54, +2.64])
  const hoodProfile = new THREE.Shape();
  hoodProfile.moveTo(-0.8, 1.98);
  hoodProfile.lineTo(0.8, 1.98);
  hoodProfile.lineTo(0.8, 3.36);
  hoodProfile.quadraticCurveTo(0.8, 3.56, 0.62, 3.56);
  hoodProfile.lineTo(-0.62, 3.56);
  hoodProfile.quadraticCurveTo(-0.8, 3.56, -0.8, 3.36);
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

  // Browning tilting camming under-lug engaging FCU steel locking block
  const lugShape = new THREE.Shape();
  lugShape.moveTo(-0.38, 2.02);
  lugShape.lineTo(1.94, 2.02);
  lugShape.lineTo(1.94, 1.24);
  lugShape.lineTo(1.42, 1.08);
  lugShape.lineTo(0.95, 1.08);
  lugShape.lineTo(0.55, 1.48);
  lugShape.lineTo(0.12, 1.48);
  lugShape.lineTo(-0.22, 1.16);
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

  const feedRamp = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.62, 0.68)
      .rotateZ(0.55)
      .translate(-0.56, 1.82, 0),
    POLISHED
  );

  const solidBarrel = mergeParts([tube, crown, hood, lug, feedRamp]);

  // Hollow 9x19mm bore + M17 top-rear Loaded Chamber Indicator (LCI) witness slot
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.45, 12.8, 28)
      .rotateZ(Math.PI / 2)
      .translate(5.6, 2.68, 0),
    '#151920'
  );
  const lciSlot = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.24, 0.22).translate(-0.25, 3.5, 0),
    '#151920'
  );

  return csgSubtract(solidBarrel, [bore, lciSlot]);
}

/**
 * U-05: Captive Steel Recoil Spring Guide Rod (centerline Y = +1.46, X in [+1.96, +11.08])
 */
export function buildP320RecoilGuideRodGeometry(): THREE.BufferGeometry {
  const rearFlange = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.46, 0.16, 24)
      .rotateZ(Math.PI / 2)
      .translate(2.02, 1.46, 0),
    '#2a313d'
  );
  // Characteristic P320 flat-sided rear flange D-cut collar
  const outerSleeve = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 3.6, 20)
      .rotateZ(Math.PI / 2)
      .translate(3.9, 1.46, 0),
    '#3b4554'
  );
  const innerRod = paintGeometry(
    new THREE.CylinderGeometry(0.17, 0.17, 8.95, 20)
      .rotateZ(Math.PI / 2)
      .translate(6.52, 1.46, 0),
    '#cbd5e1'
  );
  const frontCap = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.28, 0.24, 22)
      .rotateZ(Math.PI / 2)
      .translate(10.96, 1.46, 0),
    '#2a313d'
  );
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
      coils: 16,
      flatWireRatio: 0.8,
    }),
    '#9aa8ba'
  );
}

/**
 * U-07: Precision Machined Stainless P320 Striker Assembly Pin (Y = +2.68, X in [-6.85, -0.75])
 */
export function buildP320StrikerGeometry(): THREE.BufferGeometry {
  const tip = paintGeometry(
    new THREE.BoxGeometry(0.66, 0.16, 0.08).translate(-1.05, 2.68, 0),
    '#e2e8f0'
  );
  const frontCone = paintGeometry(
    new THREE.CylinderGeometry(0.1, 0.21, 0.48, 20)
      .rotateZ(Math.PI / 2)
      .translate(-1.6, 2.68, 0),
    '#d8e1ec'
  );
  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.145, 0.145, 4.75, 20)
      .rotateZ(Math.PI / 2)
      .translate(-4.2, 2.68, 0),
    '#d8e1ec'
  );

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

  // Safety lock catch hook on upper right of striker
  const safetyCatch = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.26, 0.24).translate(-4.52, 2.84, 0.14),
    '#e2e8f0'
  );

  const rearStem = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.55, 18)
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
 * U-08: Helical Striker Main Spring & Retainer Cups (X in [-6.55, -2.55], L0 = 4.00, Y = +2.68)
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
      coils: 15,
    }),
    '#a3b1c2'
  );
  const frontCup = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.22, 0.28, 20)
      .rotateZ(Math.PI / 2)
      .translate(-2.45, 2.68, 0),
    '#292f3a'
  );
  return mergeParts([spring, frontCup]);
}

/**
 * U-09: Internal Polymer Striker Housing Cage & Black Nitride Rear Slide Cap Plate
 */
export function buildP320StrikerHousingGeometry(): THREE.BufferGeometry {
  const sleeve = paintGeometry(
    new THREE.BoxGeometry(3.45, 0.74, 0.68).translate(-5.92, 2.66, 0),
    '#20252e'
  );
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 3.6, 20)
      .rotateZ(Math.PI / 2)
      .translate(-5.92, 2.68, 0),
    '#14171d'
  );
  const bottomSlot = paintGeometry(
    new THREE.BoxGeometry(2.8, 0.52, 0.3).translate(-5.6, 2.36, 0),
    '#14171d'
  );
  const carvedSleeve = csgSubtract(sleeve, [bore, bottomSlot]);

  // Rear Slide Cap locking into back of P320 slide at X = -7.76
  const capShape = new THREE.Shape();
  capShape.moveTo(-0.88, 1.05);
  capShape.lineTo(0.88, 1.05);
  capShape.lineTo(0.88, 2.55);
  capShape.lineTo(0.68, 3.22);
  capShape.lineTo(-0.68, 3.22);
  capShape.lineTo(-0.88, 2.55);
  capShape.closePath();

  const capPlate = new THREE.ExtrudeGeometry(capShape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  capPlate.rotateY(Math.PI / 2);
  capPlate.translate(-7.82, 0, 0);
  paintGeometry(capPlate, '#282f3b');

  return mergeParts([carvedSleeve, capPlate]);
}

/**
 * U-10: Pivoting Stainless Striker Safety Lock & Micro Spring (assembledPos = [-4.35, 2.86, 0.22])
 */
export function buildP320SafetyLockGeometry(): THREE.BufferGeometry {
  const lockArm = paintGeometry(
    new THREE.BoxGeometry(0.76, 0.28, 0.16),
    '#e2e8f0'
  );
  const catchHook = paintGeometry(
    new THREE.BoxGeometry(0.2, 0.38, 0.26).translate(-0.24, -0.16, -0.06),
    '#cbd5e1'
  );
  const actuatorFoot = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.44, 0.14).translate(0.26, -0.26, 0.06),
    '#dce4ee'
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
  return mergeParts([lockArm, catchHook, actuatorFoot, microSpring]);
}

/**
 * U-11: Long SIG External Extractor Bar, Pivot Pin & Plunger Spring (assembledPos = [-1.45, 2.68, 1.02])
 */
export function buildP320ExtractorGeometry(): THREE.BufferGeometry {
  const bar = paintGeometry(
    new THREE.BoxGeometry(2.18, 0.42, 0.28),
    '#252b35'
  );
  const frontClaw = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.4, 0.36).translate(0.98, 0, -0.18),
    '#384252'
  );
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.65,
      end: -0.95,
      centerY: 0,
      centerZ: -0.2,
      coilRadius: 0.11,
      wireRadius: 0.024,
      coils: 7,
    }),
    '#9aa8ba'
  );
  const plunger = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.46, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.78, 0, -0.2),
    '#dce4ee'
  );
  return mergeParts([bar, frontClaw, spring, plunger]);
}

// ============================================================================
// GROUP 2: COYOTE FDE CARRY GRIP MODULE & CONTROLS (4 Builders)
// ============================================================================

/**
 * F-01: Coyote FDE Polymer Carry Grip Module (p320_grip_module, isShell: true)
 * Features 3-slot M1913 Picatinny rail, undercut SIG trigger guard, extended M17 beaver-tail out to X=-9.0,
 * right-side FCU serial cutout window revealing "TF004912", and -18 deg flush magwell rim!
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

  // 3. Upper Dust-Cover Recoil Channel + Central FCU Chassis Receiver Cavity
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(7.2, 0.9, 1.76).translate(6.2, 0.62, 0),
      COYOTE_INNER
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(10.05, 1.48, 1.92).translate(-1.68, 0.36, 0),
      COYOTE_INNER
    )
  );
  // Trigger shoe slot opening into trigger guard
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(1.52, 1.25, 0.88).translate(0.02, -0.52, 0),
      COYOTE_INNER
    )
  );

  // 4. Hollow -18 deg Magwell Tunnel matching 17-rd Steel Magazine Body
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.64, 12.6, 1.78)
        .rotateZ(P320_GRIP_ANGLE_RAD)
        .translate(-5.25, -4.59, 0),
      COYOTE_INNER
    )
  );

  // 5. ICONIC P320 RIGHT-SIDE FCU SERIAL NUMBER CUTOUT WINDOW!
  // Reveals gleaming stainless FCU serial plate ("TF004912") on right flank at X in [-1.18, +0.90], Y in [+0.06, +0.58]!
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.08, 0.52, 0.75).translate(-0.14, 0.32, 1.12),
      COYOTE_INNER
    )
  );

  // 6. 3-Slot M1913 Picatinny Accessory Rail (side T-grooves + 3 cross-locking slots)
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(6.45, 0.24, 0.26).translate(
          6.15,
          0.12,
          sign * 1.22
        ),
        COYOTE_INNER
      )
    );
    // Lower Picatinny 45-deg side bevels
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(6.5, 0.42, 0.42)
          .rotateX(sign * 0.76)
          .translate(6.15, -0.35, sign * 1.18),
        COYOTE_FDE
      )
    );
  }
  for (const slotX of [4.45, 6.15, 7.85]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.52, 0.24, 2.65).translate(slotX, -0.28, 0),
        COYOTE_INNER
      )
    );
  }

  // 7. Takedown Lever Bore + Rear M17 Manual Thumb Safety Cutouts + Ergonomic Thumb Rests
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
        new THREE.SphereGeometry(0.52, 16, 12)
          .scale(1.5, 0.78, 0.28)
          .translate(-3.95, -0.95, sign * 1.28),
        COYOTE_INNER
      )
    );
  }

  return applyP320GripAtlasUVs(
    csgSubtract(mergeParts([mainGrip, triggerGuard]), cutters)
  );
}

/**
 * F-02: Rotating Black Nitride Takedown Lever (assembledPos = [1.85, 0.42, 0])
 * Rotates 90 deg around local Z during disassembly before sliding left (-Z) out of FCU & Grip!
 */
export function buildP320TakedownLeverGeometry(): THREE.BufferGeometry {
  const NITRIDE = '#222730';
  const CAM_STEEL = '#475569';

  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 2.48, 22).rotateX(Math.PI / 2),
    CAM_STEEL
  );
  // Internal D-cut cam flat that clears barrel lug when rotated 90 deg
  const dFlat = paintGeometry(
    new THREE.BoxGeometry(0.5, 0.22, 1.38).translate(0, 0.16, 0),
    '#171b22'
  );
  const camShaft = csgSubtract(shaft, [dFlat]);

  // Iconic SIG Sauer angled serrated left-side thumb takedown paddle
  const paddleShape = new THREE.Shape();
  paddleShape.moveTo(-0.24, -0.24);
  paddleShape.lineTo(1.22, -0.26);
  paddleShape.quadraticCurveTo(1.42, -0.08, 1.18, 0.18);
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

  const ledge = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.1, 0.14).translate(0.46, -0.18, -1.44),
    '#343d4b'
  );

  return mergeParts([camShaft, paddle, ledge]);
}

/**
 * F-03: Stamped Black Nitride Ambidextrous Slide Catch Lever (assembledPos = [0, 0, 0])
 */
export function buildP320SlideCatchGeometry(): THREE.BufferGeometry {
  const NITRIDE = '#262d38';

  // Internal U-bridge pivoting near trigger pin at X = +0.05, Y = +0.25
  const crossBridge = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.14, 1.88).translate(-0.55, 0.24, 0),
    '#475569'
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
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.88, 0.32, 0.14).translate(
          -2.55,
          0.86,
          sign * 1.28
        ),
        '#363f4e'
      )
    );
  }
  // Left inward follower-actuated lifter tab
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.34, 0.12, 0.42).translate(-2.35, 0.62, -0.96),
      '#cbd5e1'
    )
  );

  return mergeParts(parts);
}

/**
 * F-04: Reversible Rounded-Triangle Magazine Catch & Coil Spring
 * World assembledPos = [-2.35, -2.15, 0], assembledRot = [0, 0, P320_GRIP_ANGLE_RAD].
 */
export function buildP320MagCatchGeometry(): THREE.BufferGeometry {
  // Signature SIG P320 rounded-triangular checkered release button
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
  paintGeometry(body, '#232933');

  const btnPad = new THREE.ExtrudeGeometry(triShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  btnPad.scale(0.88, 0.88, 1);
  btnPad.translate(0, 0, -1.34);
  paintGeometry(btnPad, '#161a21');

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

  return mergeParts([body, btnPad, spring]);
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
