import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from './springHelper';
import { applyBarrelAtlasUVs, applySlideAtlasUVs } from './uvAtlasHelper';

/**
 * U-01: Realistic Gen3 G17 Tenifer/nDLC Nitride Steel Slide
 * Features radiused top-shoulder bevels, Gen3 bullnose muzzle tapers, protruding front recoil chin,
 * flared ejection port, 7 deep milled rear cocking serrations, left-side rollmark recesses & internal channels.
 */
export function buildSlideGeometry(): THREE.BufferGeometry {
  const SLIDE_OUTER = '#2f3744';
  const SLIDE_MILLED = '#181c24';
  const SLIDE_CHAMFER = '#434f61';

  // Smooth radiused Glock slab-side cross-section in (Z, Y) extruded along +X
  const profile = new THREE.Shape();
  profile.moveTo(-1.24, 0.85);
  profile.lineTo(1.24, 0.85);
  profile.quadraticCurveTo(1.28, 0.85, 1.28, 0.92);
  profile.lineTo(1.28, 2.98);
  // Characteristic smooth radiused Glock upper shoulder bevels!
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

  // 1. Underside cutout behind dust-cover recoil chin + frame rail slots (stopping behind front chinBoss)
  const underCut = paintGeometry(
    new THREE.BoxGeometry(9.55, 0.96, 1.94).translate(-2.85, 1.26, 0),
    SLIDE_MILLED
  );
  cutters.push(underCut);

  const railSlot = paintGeometry(
    new THREE.BoxGeometry(17.3, 0.2, 2.24).translate(1.0, 1.06, 0),
    SLIDE_MILLED
  );
  cutters.push(railSlot);

  // 2. Barrel tunnel + Recoil spring tunnel + Guide rod front bore
  const barrelTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.74, 0.74, 12.1, 32)
      .rotateZ(Math.PI / 2)
      .translate(5.35, 2.55, 0),
    SLIDE_MILLED
  );
  cutters.push(barrelTunnel);

  const recoilTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.5, 0.5, 9.3, 28)
      .rotateZ(Math.PI / 2)
      .translate(6.2, 1.38, 0),
    SLIDE_MILLED
  );
  cutters.push(recoilTunnel);

  const guideHole = paintGeometry(
    new THREE.CylinderGeometry(0.37, 0.37, 1.3, 24)
      .rotateZ(Math.PI / 2)
      .translate(10.9, 1.35, 0),
    SLIDE_MILLED
  );
  cutters.push(guideHole);

  const innerBridge = paintGeometry(
    new THREE.BoxGeometry(9.0, 1.1, 1.15).translate(6.15, 1.95, 0),
    SLIDE_MILLED
  );
  cutters.push(innerBridge);

  // 3. Open Ejection Port with lowered right-wall flare & angled brass-clearance bevel!
  const topHoodPort = paintGeometry(
    new THREE.BoxGeometry(3.12, 0.88, 1.62).translate(1.03, 3.25, 0),
    SLIDE_MILLED
  );
  cutters.push(topHoodPort);

  const sideEjectPort = paintGeometry(
    new THREE.BoxGeometry(3.12, 1.5, 1.5).translate(1.03, 2.8, 0.68),
    SLIDE_MILLED
  );
  cutters.push(sideEjectPort);

  const portFlareBevel = paintGeometry(
    new THREE.BoxGeometry(3.16, 0.42, 0.42)
      .rotateX(0.65)
      .translate(1.03, 2.08, 1.25),
    SLIDE_CHAMFER
  );
  cutters.push(portFlareBevel);

  // 4. External Extractor pocket on right wall behind ejection port
  const extractorSlot = paintGeometry(
    new THREE.BoxGeometry(1.26, 0.6, 0.65).translate(-1.1, 2.55, 1.08),
    SLIDE_MILLED
  );
  cutters.push(extractorSlot);

  // 5. Rear Striker channel + Sear slot + Extractor plunger channel
  const strikerBore = paintGeometry(
    new THREE.CylinderGeometry(0.33, 0.33, 7.3, 24)
      .rotateZ(Math.PI / 2)
      .translate(-4.1, 2.55, 0),
    SLIDE_MILLED
  );
  cutters.push(strikerBore);

  const searBottomSlot = paintGeometry(
    new THREE.BoxGeometry(3.55, 1.2, 0.34).translate(-5.85, 1.95, 0),
    SLIDE_MILLED
  );
  cutters.push(searBottomSlot);

  const plungerBore = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 6.2, 24)
      .rotateZ(Math.PI / 2)
      .translate(-4.55, 2.55, 0.72),
    SLIDE_MILLED
  );
  cutters.push(plungerBore);

  // Rear sight dovetail cut across slide roof at X = -6.45
  const dovetailSlot = paintGeometry(
    new THREE.BoxGeometry(0.54, 0.16, 2.6).translate(-6.45, 3.42, 0),
    SLIDE_MILLED
  );
  cutters.push(dovetailSlot);

  // 6. Left-side Slide Stop Notch (engraved rollmarks handled by 2K slide PBR texture atlas)
  const slideStopNotch = paintGeometry(
    new THREE.BoxGeometry(0.66, 0.48, 0.5).translate(-2.65, 1.02, -1.18),
    SLIDE_MILLED
  );
  cutters.push(slideStopNotch);

  // 7. Gen3 Bullnose front bevels (sleek tapered muzzle corners)
  for (const sign of [-1, 1]) {
    const noseCut = paintGeometry(
      new THREE.BoxGeometry(1.45, 2.9, 0.85)
        .rotateY(-sign * 0.38)
        .translate(11.18, 2.2, sign * 1.38),
      SLIDE_CHAMFER
    );
    cutters.push(noseCut);
  }

  // 8. 7 Deep Crisp Rear Cocking Serrations on both sides (X: -6.88 to -4.60)
  for (let i = 0; i < 7; i++) {
    const sx = -6.88 + i * 0.37;
    for (const sign of [-1, 1]) {
      const groove = paintGeometry(
        new THREE.BoxGeometry(0.18, 1.98, 0.18).translate(
          sx,
          2.08,
          sign * 1.27
        ),
        SLIDE_MILLED
      );
      cutters.push(groove);
    }
  }

  return applySlideAtlasUVs(csgSubtract(rawSlide, cutters));
}

/** U-02: Ramp Front Sight with Inlaid White Aiming Dot */
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
  paintGeometry(blade, '#262c36');

  const tenon = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.22, 14).translate(0, -0.11, 0),
    '#cbd5e1'
  );

  // Iconic bright white front aiming dot on rear sight face (-X)
  const whiteDot = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.04, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.43, 0.27, 0),
    '#f8fafc'
  );

  return mergeParts([blade, tenon, whiteDot]);
}

/** U-03: Dovetail Rear Sight with Iconic White U-Outline Marking */
export function buildRearSightGeometry(): THREE.BufferGeometry {
  // Trapezoidal sloped sight body
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
  paintGeometry(base, '#262c36');

  const dovetail = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.14, 1.48).translate(0, -0.06, 0),
    '#333b48'
  );

  const notch = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.28, 0.38).translate(0, 0.36, 0),
    '#1e232b'
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

/** U-04: Cold-Hammer-Forged Barrel with Boxy Locking Hood, Polished Feed Ramp & Stepped Crown */
export function buildBarrelGeometry(): THREE.BufferGeometry {
  const BARREL_STEEL = '#3b4554';
  const HOOD_CHAMFER = '#485568';
  const POLISHED_STEEL = '#e2e8f0';

  // Precision cylindrical barrel tube + muzzle chamfer collar
  const tube = paintGeometry(
    new THREE.CylinderGeometry(0.65, 0.65, 8.66, 32)
      .rotateZ(Math.PI / 2)
      .translate(6.81, 2.55, 0),
    BARREL_STEEL
  );

  const muzzleCrown = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.65, 0.16, 32)
      .rotateZ(Math.PI / 2)
      .translate(11.22, 2.55, 0),
    POLISHED_STEEL
  );

  // Boxy Glock Chamber Hood with beveled top edges
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

  // Bottom Browning Locking Lug
  const lugShape = new THREE.Shape();
  lugShape.moveTo(-0.42, 1.9);
  lugShape.lineTo(1.72, 1.9);
  lugShape.lineTo(1.72, 1.15);
  lugShape.lineTo(1.22, 0.96);
  lugShape.lineTo(0.82, 0.96);
  lugShape.lineTo(0.55, 1.38);
  lugShape.lineTo(0.12, 1.38);
  lugShape.lineTo(-0.15, 1.05);
  lugShape.lineTo(-0.48, 1.25);
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

  // Mirror-Polished Feed Ramp at rear of chamber!
  const ramp = paintGeometry(
    new THREE.BoxGeometry(0.54, 0.6, 0.68)
      .rotateZ(0.55)
      .translate(-0.56, 1.72, 0),
    POLISHED_STEEL
  );

  const solidBarrel = mergeParts([tube, muzzleCrown, hood, lug, ramp]);

  // Subtract 9mm hollow bore + loaded-chamber witness notch at rear of hood
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.45, 12.4, 28)
      .rotateZ(Math.PI / 2)
      .translate(5.35, 2.55, 0),
    '#242b35'
  );

  const witnessNotch = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.22, 0.24).translate(-0.46, 3.35, 0),
    '#242b35'
  );

  return applyBarrelAtlasUVs(csgSubtract(solidBarrel, [bore, witnessNotch]));
}

/** U-05: Polymer Recoil Guide Rod with Stainless Washer Collar */
export function buildRecoilGuideRodGeometry(): THREE.BufferGeometry {
  const flange = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.45, 0.18, 24)
      .rotateZ(Math.PI / 2)
      .translate(1.83, 1.35, 0),
    '#2d333f'
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
    '#343b47'
  );

  const frontCap = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.28, 0.26, 22)
      .rotateZ(Math.PI / 2)
      .translate(10.82, 1.35, 0),
    '#2d333f'
  );

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
      coils: 16,
      flatWireRatio: 0.82,
    }),
    '#9aa8ba'
  );
}

/** U-07: Machined Slide Cover Plate with Retention Window */
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
  paintGeometry(plate, '#2b323f');

  const notch = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.52, 0.36).translate(0, -0.82, 0),
    '#181c24'
  );
  return csgSubtract(plate, [notch]);
}

/** U-08: Precision Stainless Striker / Firing Pin with Bottom Sear Lug */
export function buildStrikerGeometry(): THREE.BufferGeometry {
  const tip = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.18, 0.08).translate(-0.85, 2.55, 0),
    '#e2e8f0'
  );

  const frontShoulder = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.22, 0.45, 20)
      .rotateZ(Math.PI / 2)
      .translate(-1.35, 2.55, 0),
    '#d8e1ec'
  );

  const mainShaft = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 5.15, 20)
      .rotateZ(Math.PI / 2)
      .translate(-4.15, 2.55, 0),
    '#d8e1ec'
  );

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

  return mergeParts([tip, frontShoulder, mainShaft, searLug, rearTail]);
}

/** U-09: Two-Tone Striker Spring (Steel Coil) + Black Polymer Spacer Sleeve & Spring Cups */
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
      coils: 14,
    }),
    '#a3b1c2'
  );

  const sleeve = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 1.05, 22)
      .rotateZ(Math.PI / 2)
      .translate(-6.45, 2.55, 0),
    '#292f3a'
  );

  const cups = paintGeometry(
    new THREE.CylinderGeometry(0.29, 0.24, 0.36, 22)
      .rotateZ(Math.PI / 2)
      .translate(-2.05, 2.55, 0),
    '#292f3a'
  );

  return mergeParts([spring, sleeve, cups]);
}

/** U-10: Machined Stainless Firing Pin Safety Plunger & Coil Spring */
export function buildFiringPinSafetyGeometry(): THREE.BufferGeometry {
  const bottomHead = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.2, 0.38, 22).translate(0, -0.52, 0),
    '#dce4ee'
  );

  const dome = paintGeometry(
    new THREE.SphereGeometry(0.2, 18, 12).translate(0, -0.68, 0),
    '#e2e8f0'
  );

  const waist = paintGeometry(
    new THREE.CylinderGeometry(0.1, 0.1, 0.42, 18).translate(0, -0.12, 0),
    '#cbd5e1'
  );

  const topCap = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 0.24, 22).translate(0, 0.2, 0),
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

/** U-11: External Extractor with Loaded Chamber Indicator Step */
export function buildExtractorGeometry(): THREE.BufferGeometry {
  const mainBody = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.48, 0.32),
    '#343d4b'
  );

  const claw = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.46, 0.38).translate(0.5, 0, -0.22),
    '#495668'
  );

  const lciStep = paintGeometry(
    new THREE.BoxGeometry(0.65, 0.26, 0.08).translate(0.1, 0, 0.18),
    '#242b36'
  );

  const rearHeel = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.36, 0.28).translate(-0.62, 0, -0.12),
    '#343d4b'
  );

  return mergeParts([mainBody, claw, lciStep, rearHeel]);
}

/** U-12: Two-Tone Stainless Extractor Depressor Plunger, Coil Spring & Black Polymer Bearing */
export function buildExtractorPlungerGeometry(): THREE.BufferGeometry {
  const rodHead = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.18, 0.45, 20)
      .rotateZ(Math.PI / 2)
      .translate(-1.92, 2.55, 0.72),
    '#dce4ee'
  );

  const rodShaft = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 1.55, 18)
      .rotateZ(Math.PI / 2)
      .translate(-2.9, 2.55, 0.72),
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
      coils: 13,
    }),
    '#9aa8ba'
  );

  const bearing = paintGeometry(
    new THREE.CylinderGeometry(0.17, 0.15, 0.85, 20)
      .rotateZ(Math.PI / 2)
      .translate(-6.9, 2.55, 0.72),
    '#292f3a'
  );

  return mergeParts([rodHead, rodShaft, spring, bearing]);
}
