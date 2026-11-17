import * as THREE from 'three';
import {
  createChamferedBox,
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  createAcmeThreadHelix,
  createFlexTube,
  extrudeAlongZ,
  latheAlongX,
  mergeCutters,
  sanitizeR500Mesh,
} from './r500CadDetail';
import {
  applyR500PolymerUVs,
  applyR500ScopeUVs,
  applyR500SledUVs,
  R500_BRASS_NOCK,
  R500_BROADHEAD_STEEL,
  R500_BRONZE_CAM,
  R500_CARBON_SHAFT,
  R500_CHASSIS_CHAMFER,
  R500_CHASSIS_GUNMETAL,
  R500_CHROME,
  R500_GOLD_ACCENT,
  R500_INNER_DARK,
  R500_LENS_EMERALD,
  R500_POLY_DARK,
  R500_POLY_GRAPHITE,
  R500_SAFETY_ORANGE,
  R500_SCOPE_MATTE,
  R500_STAINLESS,
  R500_STRING_NOOK,
  R500_STRING_SERVED,
} from './r500Geometries';

// ============================================================================
// 1. 'slide': FLEXING BOWSTRING, POWER CABLES & VERSADRIVE ACME SCREW (H-07..H-09)
// ============================================================================

/**
 * H-07: Served High-Tenacity Bowstring (`aSpringParam` mode w = 3)
 * assembledPos: [14.0, 1.80, 0] -> local (0, 0, 0) is nock center!
 * Cam ends at local [+10.7, 0, ±9.35] track flexing cam tips (-1.80, 0, ∓5.05),
 * while center serving (|z| <= 0.45) pulls -36.0 cm into Trac-Trigger jaws!
 */
export function buildR500BowstringGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const halfSamples = 14;
  // Left leg: from [-9.35] inward to [-0.45]
  for (let i = 0; i <= halfSamples; i++) {
    const u = i / halfSamples;
    const z = -9.35 + (9.35 - 0.45) * u;
    const x = 10.7 * (1 - u);
    pts.push(new THREE.Vector3(x, 0, z));
  }
  // Center serving: straight z in [-0.45, +0.45] at x=0
  pts.push(new THREE.Vector3(0, 0, 0));
  pts.push(new THREE.Vector3(0, 0, 0.45));
  // Right leg: from [+0.45] outward to [+9.35]
  for (let i = 1; i <= halfSamples; i++) {
    const u = i / halfSamples;
    const z = 0.45 + (9.35 - 0.45) * u;
    const x = 10.7 * u;
    pts.push(new THREE.Vector3(x, 0, z));
  }

  const flexAt = (_u: number, pt: THREE.Vector3): readonly [number, number, number] => {
    const absZ = Math.abs(pt.z);
    if (absZ <= 0.451) {
      return [-36.0, 0, 0];
    }
    const s = Math.min(1, Math.max(0, (absZ - 0.45) / (9.35 - 0.45)));
    const signZ = pt.z < 0 ? -1 : 1;
    const dx = -36.0 * (1 - s) + -1.8 * s;
    const dz = -signZ * 5.05 * s;
    return [dx, 0, dz];
  };

  const radiusAt = (u: number): number => {
    // Center serving around u ≈ 0.5, speed nocks near u ≈ 0.14 & 0.86
    const dCenter = Math.abs(u - 0.5);
    if (dCenter < 0.045) return 0.075;
    if (Math.abs(u - 0.14) < 0.025 || Math.abs(u - 0.86) < 0.025) return 0.072;
    return 0.044;
  };

  const cord = createFlexTube({
    points: pts,
    radiusAt,
    flexAt,
    radialSegments: 10,
    color: R500_STRING_SERVED,
  });

  // Brass speed-nock weights & center serving visual sleeves
  const centerWrap = createFlexTube({
    points: [
      new THREE.Vector3(0, 0, -0.45),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0.45),
    ],
    radiusAt: () => 0.082,
    flexAt: () => [-36.0, 0, 0],
    radialSegments: 10,
    color: R500_STRING_NOOK,
  });

  return sanitizeR500Mesh(mergeParts([cord, centerWrap]));
}

/**
 * H-08: Dual Helical Power & Control Cables (`aSpringParam` mode w = 3)
 * assembledPos: [22.8, 1.80, 0]
 * Cables route cleanly BELOW the Y=+1.80 bolt axis (local Y = -0.45 .. -0.68)
 * from upper/lower HexCoil cam spools to opposite riser yoke anchors.
 */
export function buildR500PowerCablesGeometry(): THREE.BufferGeometry {
  const buildCableRun = (
    camZ: number,
    camY: number,
    riserZ: number,
    slideY: number,
    slideZ: number
  ): THREE.BufferGeometry => {
    const camTipDx = -1.8;
    const camTipDz = camZ < 0 ? 5.05 : -5.05;
    const pCam = new THREE.Vector3(2.0, camY, camZ);
    const pSlide = new THREE.Vector3(-0.8, slideY, slideZ);
    const pRiser = new THREE.Vector3(3.4, camY * 0.85, riserZ);

    const pts: THREE.Vector3[] = [];
    const segs1 = 10;
    for (let i = 0; i <= segs1; i++) {
      const t = i / segs1;
      pts.push(new THREE.Vector3().lerpVectors(pCam, pSlide, t));
    }
    const segs2 = 6;
    for (let i = 1; i <= segs2; i++) {
      const t = i / segs2;
      pts.push(new THREE.Vector3().lerpVectors(pSlide, pRiser, t));
    }

    return createFlexTube({
      points: pts,
      radiusAt: () => 0.036,
      flexAt: (u) => {
        const splitU = segs1 / (segs1 + segs2);
        if (u <= splitU) {
          const s = u / splitU;
          return [
            camTipDx * (1 - s) + -0.9 * s,
            0,
            camTipDz * (1 - s),
          ];
        }
        const s = (u - splitU) / (1 - splitU);
        return [-0.9 * (1 - s), 0, 0];
      },
      radialSegments: 8,
      color: R500_CHASSIS_CHAMFER,
    });
  };

  const c1 = buildCableRun(-9.25, 0.42, 2.35, -0.46, 0.44);
  const c2 = buildCableRun(-9.25, -0.42, 2.35, -0.66, 0.44);
  const c3 = buildCableRun(9.25, 0.42, -2.35, -0.46, -0.44);
  const c4 = buildCableRun(9.25, -0.42, -2.35, -0.66, -0.44);

  // Low-friction anodized cable-saver slide riding below bolt axis (world Y ≈ 1.24)
  const cableSlide = paintGeometry(
    createChamferedBox(1.15, 0.46, 1.32, 0.05, R500_CHASSIS_CHAMFER).translate(
      -0.8,
      -0.56,
      0
    ),
    R500_CHASSIS_CHAMFER
  );
  // Tag cableSlide with [-0.9, 0, 0, 3] so it translates with the crossing cables!
  const posAttr = cableSlide.getAttribute('position');
  const spSlide = new Float32Array(posAttr.count * 4);
  for (let i = 0; i < posAttr.count; i++) {
    spSlide[i * 4] = -0.9;
    spSlide[i * 4 + 3] = 3;
  }
  cableSlide.setAttribute(
    'aSpringParam',
    new THREE.BufferAttribute(spSlide, 4)
  );

  return sanitizeR500Mesh(mergeParts([c1, c2, c3, c4, cableSlide]));
}

/**
 * H-09: VersaDrive Acme Cocking Screw, Dual-Ratchet Helical Clutch Gear & Folded Crank Hub
 * assembledPos: [-5.5, 0.55, 0] -> world X in [-26.5, +14.9]
 */
export function buildR500VersaDriveScrewGeometry(): THREE.BufferGeometry {
  const screwCore = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 40.4, 20)
      .rotateZ(Math.PI / 2)
      .translate(0.1, 0, 0),
    R500_STAINLESS
  );
  const acmeHelix = createAcmeThreadHelix({
    x0: -18.8,
    x1: 20.0,
    rootRadius: 0.23,
    crestRadius: 0.36,
    pitchCm: 0.84,
    color: R500_CHROME,
  });

  // Rear dual-ratchet helical clutch gear & needle-bearing thrust collar inside buttstock bore
  const clutchGear = paintGeometry(
    new THREE.CylinderGeometry(1.02, 1.02, 0.72, 24)
      .rotateZ(Math.PI / 2)
      .translate(-19.55, 0, 0),
    R500_BRONZE_CAM
  );
  const ratchetTeeth: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ratchetTeeth.push(
      createChamferedBox(0.68, 0.18, 0.22, 0.03, R500_GOLD_ACCENT)
        .rotateX(a)
        .translate(
          -19.55,
          Math.cos(a) * 1.04,
          Math.sin(a) * 1.04
        )
    );
  }

  // Coaxial folded crank-arm drive cap & knurled collar (radius <= 1.28 clears buttstock bore r=1.46!)
  const driveCollar = paintGeometry(
    new THREE.CylinderGeometry(0.68, 0.78, 0.85, 22)
      .rotateZ(Math.PI / 2)
      .translate(-20.4, 0, 0),
    R500_CHASSIS_CHAMFER
  );
  const foldedCrankArm = createChamferedBox(
    0.52,
    1.15,
    0.46,
    0.05,
    R500_STAINLESS
  ).translate(-20.82, 0.45, 0);
  const crankKnob = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.88, 16)
      .rotateZ(Math.PI / 2)
      .translate(-20.42, 0.92, 0),
    R500_POLY_GRAPHITE
  );
  const frontJournal = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 0.45, 18)
      .rotateZ(Math.PI / 2)
      .translate(20.3, 0, 0),
    R500_CHROME
  );

  return sanitizeR500Mesh(
    mergeParts([
      screwCore,
      acmeHelix,
      clutchGear,
      ...ratchetTeeth,
      driveCollar,
      foldedCrankArm,
      crankKnob,
      frontJournal,
    ])
  );
}

// ============================================================================
// 2. 'fire_control': TRAC-TRIGGER SLED, LATCH, ANTI-DRY-FIRE, SEAR & SPRING
// ============================================================================

/**
 * T-01: Trac-Trigger Floating Sear Carriage (TTFS)
 * assembledPos: [12.5, 1.05, 0] -> string catch sits at local X=+1.5 (world +14.0, +1.80, 0)
 */
export function buildR500TriggerSledGeometry(): THREE.BufferGeometry {
  const lowerCarriage = createChamferedBox(
    3.9,
    1.28,
    1.72,
    0.08,
    R500_CHASSIS_GUNMETAL
  ).translate(0.05, -0.22, 0);

  // Upper narrow jaw-tower riding cleanly through top chassis slot (Z in [-0.42, +0.42])
  const upperTower = createChamferedBox(
    3.3,
    0.78,
    0.84,
    0.06,
    R500_CHASSIS_CHAMFER
  ).translate(0.2, 0.68, 0);

  // Bottom sear engagement tail
  const searFoot = createChamferedBox(
    1.15,
    0.55,
    0.66,
    0.05,
    R500_CHASSIS_CHAMFER
  ).translate(-0.85, -1.02, 0);

  const rawSled = csgUnion([lowerCarriage, upperTower, searFoot]);

  // CSG bore for VersaDrive acme screw (local Y = -0.50 -> world Y = +0.55),
  // front string jaw slot (local X = +1.5, local Y = +0.75), & spring pocket
  const acmeNutBore = new THREE.CylinderGeometry(0.41, 0.41, 4.4, 20)
    .rotateZ(Math.PI / 2)
    .translate(0.05, -0.5, 0);
  const stringSlot = new THREE.BoxGeometry(1.1, 0.48, 1.1).translate(
    1.55,
    0.75,
    0
  );
  const springPocket = new THREE.BoxGeometry(2.2, 0.44, 0.46).translate(
    0.1,
    0.43,
    0
  );

  const cutters = mergeCutters(
    [acmeNutBore, stringSlot, springPocket],
    R500_INNER_DARK
  );
  const machinedSled = csgSubtract(rawSled, [cutters]);
  rawSled.dispose();
  cutters.dispose();

  return sanitizeR500Mesh(applyR500SledUVs(machinedSled));
}

/**
 * T-02: Dual Spring-Loaded Pivoting Bowstring Catch Jaws
 * assembledPos: [13.85, 1.80, 0] -> jaws cradle bowstring at local X = +0.15 (world +14.0)
 */
export function buildR500StringLatchGeometry(): THREE.BufferGeometry {
  const jawShape = new THREE.Shape();
  jawShape.moveTo(-0.85, -0.18);
  jawShape.lineTo(0.28, -0.18);
  jawShape.lineTo(0.36, 0.05);
  jawShape.lineTo(0.18, 0.24);
  jawShape.lineTo(-0.08, 0.06);
  jawShape.lineTo(-0.85, 0.14);
  jawShape.closePath();

  const upperJaw = extrudeAlongZ(
    jawShape,
    -0.22,
    0.44,
    R500_STAINLESS,
    0.025,
    8
  );
  const lowerJaw = extrudeAlongZ(
    jawShape,
    -0.22,
    0.44,
    R500_STAINLESS,
    0.025,
    8
  ).rotateX(Math.PI);

  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.92, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.28, 0, 0),
    R500_CHROME
  );
  const rearStopLug = createChamferedBox(
    0.34,
    0.42,
    0.36,
    0.03,
    R500_CHROME
  ).translate(-0.78, -0.02, 0);

  return sanitizeR500Mesh(
    mergeParts([upperJaw, lowerJaw, pivotPin, rearStopLug])
  );
}

/**
 * T-03: Automatic Anti-Dry-Fire Interlock Lever & Bolt-Presence Sensor
 * assembledPos: [13.15, 2.05, 0]
 */
export function buildR500AntiDryFireGeometry(): THREE.BufferGeometry {
  const leverShape = new THREE.Shape();
  leverShape.moveTo(-0.88, -0.12);
  leverShape.lineTo(0.92, -0.18);
  leverShape.lineTo(1.12, -0.02);
  leverShape.lineTo(0.84, 0.18);
  leverShape.lineTo(-0.75, 0.22);
  leverShape.closePath();

  const mainLever = extrudeAlongZ(
    leverShape,
    -0.2,
    0.4,
    R500_BRONZE_CAM,
    0.025,
    8
  );
  const feelerShoe = createChamferedBox(
    0.48,
    0.22,
    0.56,
    0.03,
    R500_GOLD_ACCENT
  ).translate(0.88, -0.18, 0);
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.86, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.52, 0.04, 0),
    R500_CHROME
  );

  return sanitizeR500Mesh(mergeParts([mainLever, feelerShoe, pivotPin]));
}

/**
 * T-04: Zero-Creep 3.5 lb Match Trigger Shoe, Transfer Linkage & Sear
 * assembledPos: [-6.0, -1.0, 0]
 */
export function buildR500TriggerSearGeometry(): THREE.BufferGeometry {
  // Curved match trigger shoe centered inside pistol grip guard (world X ≈ +3.55, Y ≈ -3.25)
  const shoeShape = new THREE.Shape();
  shoeShape.moveTo(9.1, -0.78);
  shoeShape.lineTo(9.82, -0.78);
  shoeShape.quadraticCurveTo(9.55, -1.85, 9.76, -2.75);
  shoeShape.quadraticCurveTo(9.72, -3.05, 9.38, -3.08);
  shoeShape.lineTo(8.98, -2.92);
  shoeShape.quadraticCurveTo(8.92, -1.85, 9.1, -0.78);
  shoeShape.closePath();
  const triggerShoe = extrudeAlongZ(
    shoeShape,
    -0.24,
    0.48,
    R500_CHROME,
    0.04,
    10
  );

  // Horizontal stainless transfer linkage bar running inside lower chassis channel (world Y = -0.35)
  const transferRod = createChamferedBox(
    27.4,
    0.26,
    0.24,
    0.03,
    R500_STAINLESS
  ).translate(-3.9, 0.65, 0);

  // Forward clevis yoke connecting shoe to transfer bar
  const clevisYoke = createChamferedBox(
    0.85,
    1.55,
    0.34,
    0.04,
    R500_STAINLESS
  ).translate(9.45, -0.05, 0);

  // Rear pivoting match sear block at world X = -23.5 (local X = -17.5, Y = +0.85)
  const searBlock = createChamferedBox(
    1.55,
    0.64,
    0.54,
    0.05,
    R500_CHROME
  ).translate(-17.4, 0.88, 0);
  const searPin = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.92, 12)
      .rotateX(Math.PI / 2)
      .translate(-17.5, 0.85, 0),
    R500_BRONZE_CAM
  );

  return sanitizeR500Mesh(
    mergeParts([triggerShoe, transferRod, clevisYoke, searBlock, searPin])
  );
}

/**
 * T-05: Automatic Ambidextrous Safety Selector (`SAFE / FIRE`)
 * assembledPos: [-1.8, 0.25, 0]
 */
export function buildR500SafetySelectorGeometry(): THREE.BufferGeometry {
  const crossAxle = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 3.1, 16).rotateX(Math.PI / 2),
    R500_STAINLESS
  );
  const camDrum = createChamferedBox(
    0.64,
    0.54,
    0.68,
    0.05,
    R500_CHASSIS_CHAMFER
  );
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-0.32, -0.22);
  wingShape.lineTo(0.88, -0.14);
  wingShape.lineTo(0.95, 0.12);
  wingShape.lineTo(-0.22, 0.24);
  wingShape.closePath();

  const wingL = extrudeAlongZ(
    wingShape,
    -1.72,
    0.26,
    R500_SAFETY_ORANGE,
    0.03,
    6
  );
  const wingR = extrudeAlongZ(
    wingShape,
    1.46,
    0.26,
    R500_SAFETY_ORANGE,
    0.03,
    6
  );

  return sanitizeR500Mesh(mergeParts([crossAxle, camDrum, wingL, wingR]));
}

/**
 * T-06: Helical Sear & Latch Return Spring (`createHelicalSpring`, mode `w = 1`)
 * assembledPos: [11.55, 1.48, 0] -> pinned at local X = 0 inside sled!
 */
export function buildR500TriggerSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 2.1,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.16,
      wireRadius: 0.028,
      coils: 11,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    R500_STAINLESS
  );
  return sanitizeR500Mesh(spring);
}

// ============================================================================
// 3. 'magazine': 100-YD BDC SCOPE, QUIVER, RETENTION ARM & 500 FPS CARBON BOLT
// ============================================================================

/**
 * Q-01: 1-8x24 Illuminated 100-Yard BDC Crossbow Scope & Cantilever Rings
 * assembledPos: [-6.0, 6.25, 0] -> optical centerline local Y = +0.70 (world Y = +6.95),
 * ring clamps seat flush onto world Y = +4.60 Picatinny rail (local Y = -1.65).
 */
export function buildR500ScopeGeometry(): THREE.BufferGeometry {
  // Turned main scope tube + objective & ocular bells around optical axis (local Y = +0.70)
  const scopeShell = latheAlongX(
    [
      [0, -10.5],
      [1.82, -10.5],
      [2.04, -10.2],
      [2.04, -6.5],
      [1.76, -5.2],
      [1.5, -4.6], // 30mm main tube
      [1.5, 4.2],
      [1.68, 5.2],
      [1.84, 7.6], // 24mm flared objective bell
      [1.84, 12.6],
      [1.72, 12.8],
      [1.55, 12.8],
      [1.55, 11.4], // recessed objective lens hood
      [0, 11.4],
    ],
    32,
    R500_SCOPE_MATTE
  ).translate(0, 0.7, 0);

  // Sapphire-emerald multi-coated objective & ocular lenses
  const objLens = paintGeometry(
    new THREE.CylinderGeometry(1.48, 1.48, 0.24, 28)
      .rotateZ(Math.PI / 2)
      .translate(11.6, 0.7, 0),
    R500_LENS_EMERALD
  );
  const ocLens = paintGeometry(
    new THREE.CylinderGeometry(1.62, 1.62, 0.24, 28)
      .rotateZ(Math.PI / 2)
      .translate(-10.15, 0.7, 0),
    R500_LENS_EMERALD
  );

  // Power magnification throw-lever ring
  const magRing = paintGeometry(
    new THREE.CylinderGeometry(2.1, 2.1, 0.9, 28)
      .rotateZ(Math.PI / 2)
      .translate(-5.8, 0.7, 0),
    R500_CHASSIS_CHAMFER
  );
  const throwLever = createChamferedBox(
    0.48,
    1.15,
    0.34,
    0.04,
    R500_CHASSIS_CHAMFER
  ).translate(-5.8, 2.45, 0.85);

  // Tactical 100-YD BDC elevation, windage & illumination turrets
  const turretBox = createChamferedBox(
    2.1,
    1.8,
    1.8,
    0.08,
    R500_SCOPE_MATTE
  ).translate(0.2, 0.7, 0);
  const elevTurret = paintGeometry(
    new THREE.CylinderGeometry(0.76, 0.82, 1.05, 24).translate(0.2, 2.35, 0),
    R500_BRONZE_CAM
  );
  const windTurret = paintGeometry(
    new THREE.CylinderGeometry(0.72, 0.78, 0.95, 24)
      .rotateX(Math.PI / 2)
      .translate(0.2, 0.7, 1.68),
    R500_CHASSIS_CHAMFER
  );
  const illumDial = paintGeometry(
    new THREE.CylinderGeometry(0.8, 0.8, 0.95, 24)
      .rotateX(Math.PI / 2)
      .translate(0.2, 0.7, -1.72),
    R500_CHASSIS_CHAMFER
  );

  // Dual tactical cantilever rings clamping onto Y = -1.65 (world Y = +4.60 Picatinny crown)
  const buildRing = (rx: number): THREE.BufferGeometry => {
    const clampBase = createChamferedBox(
      1.65,
      1.05,
      2.65,
      0.06,
      R500_CHASSIS_GUNMETAL
    ).translate(rx, -1.25, 0);
    const ringCollar = paintGeometry(
      new THREE.CylinderGeometry(1.82, 1.82, 1.48, 28)
        .rotateZ(Math.PI / 2)
        .translate(rx, 0.7, 0),
      R500_CHASSIS_GUNMETAL
    );
    const neckPost = createChamferedBox(
      1.48,
      1.55,
      1.95,
      0.05,
      R500_CHASSIS_GUNMETAL
    ).translate(rx, -0.35, 0);
    const clampBolt = paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 2.96, 12)
        .rotateX(Math.PI / 2)
        .translate(rx, -1.35, 0),
      R500_CHROME
    );
    return mergeParts([clampBase, ringCollar, neckPost, clampBolt]);
  };
  const cantileverBridge = createChamferedBox(
    9.6,
    0.58,
    1.85,
    0.05,
    R500_CHASSIS_GUNMETAL
  ).translate(0.2, -1.15, 0);

  const merged = mergeParts([
    scopeShell,
    objLens,
    ocLens,
    magRing,
    throwLever,
    turretBox,
    elevTurret,
    windTurret,
    illumDial,
    cantileverBridge,
    buildRing(-3.8),
    buildRing(4.2),
  ]);
  return sanitizeR500Mesh(applyR500ScopeUVs(merged));
}

/**
 * Q-02: Quick-Detach 3-Bolt Side-Mount Quiver & Broadhead Hood (`magBodyPartId`)
 * assembledPos: [7.5, -3.15, 4.65]
 * World span: X in [-18.5, +34.5], Y in [-6.25, -1.25], Z in [+1.55, +6.65].
 * Houses 3 stacked bolts (`Slots 0..2`) centered at world X = +6.8, Z = +4.85, Y = -2.05 / -3.60 / -5.15!
 */
export function buildR500QuiverFrameGeometry(): THREE.BufferGeometry {
  // Long quiver spine bar (local X in [-25.6, +21.5], local Z = -1.05 -> world Z = +3.60)
  const spineBar = createChamferedBox(
    47.2,
    1.25,
    0.68,
    0.08,
    R500_POLY_GRAPHITE
  ).translate(-2.0, 0.05, -1.05);

  // Quick-detach cam-lever mounting arm bridging inward to chassis mount boss (local Z = -3.10)
  const qdArm = createChamferedBox(
    5.4,
    0.92,
    2.45,
    0.08,
    R500_CHASSIS_GUNMETAL
  ).translate(3.3, 1.42, -1.88);
  const qdCamLever = createChamferedBox(
    2.4,
    0.46,
    0.52,
    0.05,
    R500_CHASSIS_CHAMFER
  ).translate(3.3, 1.5, -2.55);

  // Front molded 3-bolt broadhead protective hood (local X in [+19.6, +27.0], Y in [-3.10, +1.90], Z in [-1.15, +2.00])
  const hoodOuter = createChamferedBox(
    7.4,
    5.0,
    3.15,
    0.16,
    R500_POLY_DARK
  ).translate(23.3, -0.6, 0.42);
  const hoodHollow = new THREE.BoxGeometry(6.6, 4.2, 2.35).translate(
    22.5,
    -0.6,
    0.42
  );
  const hoodShroud = csgSubtract(hoodOuter, [hoodHollow]);
  hoodOuter.dispose();
  hoodHollow.dispose();
  paintGeometry(hoodShroud, R500_POLY_DARK);

  // Internal acoustic foam broadhead retention pad at far front of hood
  const acousticFoam = createChamferedBox(
    1.1,
    3.9,
    2.1,
    0.08,
    R500_POLY_GRAPHITE
  ).translate(26.1, -0.6, 0.42);

  // Front & rear 3-bolt rubber gripper brackets (local X = -1.0 and local X = -25.4)
  // Vertical C-comb spanning local Y in [-2.85, +1.65] with slots at +1.10, -0.45, -2.00
  const buildGripperComb = (cx: number): THREE.BufferGeometry => {
    const post = createChamferedBox(
      1.3,
      4.5,
      1.45,
      0.08,
      R500_POLY_GRAPHITE
    ).translate(cx, -0.6, -0.45);
    const fingers: THREE.BufferGeometry[] = [];
    for (const fy of [1.62, 0.32, -1.22, -2.62]) {
      fingers.push(
        createChamferedBox(1.15, 0.36, 1.55, 0.05, R500_POLY_DARK).translate(
          cx,
          fy,
          0.35
        )
      );
    }
    return mergeParts([post, ...fingers]);
  };

  // Rear protective rubber nock guard cap extending to local X = -26.0 (world -18.5)
  const rearNockCap = createChamferedBox(
    0.85,
    4.6,
    2.55,
    0.1,
    R500_POLY_DARK
  ).translate(-25.58, -0.6, 0.15);

  const merged = mergeParts([
    spineBar,
    qdArm,
    qdCamLever,
    hoodShroud,
    acousticFoam,
    buildGripperComb(-1.0),
    buildGripperComb(-15.5),
    rearNockCap,
  ]);
  return sanitizeR500Mesh(applyR500PolymerUVs(merged, -26.0, 53.0, -3.1, 5.0));
}

/**
 * Q-03: Spring-Loaded Arrow Retention Arm & Frictionless Front Roller (`followerPartId`)
 * assembledPos: [10.4, 3.15, 0] -> extends from bridge underside down to touch top of bolt shaft
 */
export function buildR500RetentionArmGeometry(): THREE.BufferGeometry {
  const armShape = new THREE.Shape();
  armShape.moveTo(-0.85, 0.12);
  armShape.lineTo(0.85, 0.12);
  armShape.lineTo(6.45, -0.78);
  armShape.lineTo(6.35, -1.04);
  armShape.lineTo(0.45, -0.2);
  armShape.lineTo(-0.85, -0.2);
  armShape.closePath();

  const springArm = extrudeAlongZ(
    armShape,
    -0.28,
    0.56,
    R500_CHASSIS_CHAMFER,
    0.04,
    8
  );
  const frontForkL = createChamferedBox(
    0.95,
    0.34,
    0.16,
    0.03,
    R500_STAINLESS
  ).translate(6.45, -0.92, -0.32);
  const frontForkR = createChamferedBox(
    0.95,
    0.34,
    0.16,
    0.03,
    R500_STAINLESS
  ).translate(6.45, -0.92, 0.32);

  // High-visibility low-friction polymer roller wheel hovering cleanly at world Y = +2.20
  const rollerWheel = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.44, 18)
      .rotateX(Math.PI / 2)
      .translate(6.65, -0.95, 0),
    R500_SAFETY_ORANGE
  );
  const rollerPin = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.72, 12)
      .rotateX(Math.PI / 2)
      .translate(6.65, -0.95, 0),
    R500_CHROME
  );

  return sanitizeR500Mesh(
    mergeParts([springArm, frontForkL, frontForkR, rollerWheel, rollerPin])
  );
}

/**
 * Q-04: 20" Match Carbon Crossbow Bolt w/ Brass Half-Moon Nock, 3 Helical Vanes & 100gr Broadhead
 * assembledPos: [3.4, 1.80, 0] -> world span X in [-22.0, +28.8] (50.8 cm = 20")
 */
export function buildR500CarbonBoltGeometry(): THREE.BufferGeometry {
  // Micro-diameter carbon shaft: local X in [-24.5, +22.2], r = 0.36
  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 46.7, 22)
      .rotateZ(Math.PI / 2)
      .translate(-1.15, 0, 0),
    R500_CARBON_SHAFT
  );

  // Brass half-moon nock with watertight CNC U-notch: local X in [-25.4, -24.4]
  const nockCollar = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.38, 0.65, 20)
      .rotateZ(Math.PI / 2)
      .translate(-24.725, 0, 0),
    R500_BRASS_NOCK
  );
  const nockEarShape = new THREE.Shape();
  nockEarShape.moveTo(-25.05, -0.36);
  nockEarShape.lineTo(-24.9, -0.36);
  nockEarShape.lineTo(-24.9, 0.36);
  nockEarShape.lineTo(-25.05, 0.36);
  nockEarShape.lineTo(-25.4, 0.28);
  nockEarShape.lineTo(-25.4, 0.14);
  nockEarShape.lineTo(-25.12, 0.12);
  nockEarShape.lineTo(-25.12, -0.12);
  nockEarShape.lineTo(-25.4, -0.14);
  nockEarShape.lineTo(-25.4, -0.28);
  nockEarShape.closePath();
  const halfMoonEars = extrudeAlongZ(
    nockEarShape,
    -0.28,
    0.56,
    R500_BRASS_NOCK,
    0.02,
    6
  );

  // 3 Helical 2" polymer fletching vanes (120° apart, local X in [-23.4, -18.2], r_tip = 0.88)
  const vaneShape = new THREE.Shape();
  vaneShape.moveTo(-23.4, 0.34);
  vaneShape.lineTo(-22.2, 0.86);
  vaneShape.lineTo(-18.5, 0.88);
  vaneShape.lineTo(-18.2, 0.34);
  vaneShape.closePath();

  const vanes: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    // 60°, 180° (cock vane down into chassis track), 300° straddling retention arm!
    const angle = (k * Math.PI * 2) / 3 + Math.PI / 3;
    const vane = extrudeAlongZ(
      vaneShape,
      -0.035,
      0.07,
      k === 1 ? R500_SAFETY_ORANGE : R500_CHROME,
      0.01,
      4
    ).rotateX(angle);
    vanes.push(vane);
  }

  // Stainless half-out insert collar + 100-gr 3-blade broadhead (local X in [+21.6, +25.4])
  const collar = paintGeometry(
    new THREE.CylinderGeometry(0.4, 0.38, 1.1, 20)
      .rotateZ(Math.PI / 2)
      .translate(22.15, 0, 0),
    R500_STAINLESS
  );
  const broadheadFerrule = latheAlongX(
    [
      [0, 22.6],
      [0.4, 22.6],
      [0.38, 23.6],
      [0.24, 24.6],
      [0, 25.4],
    ],
    18,
    R500_BROADHEAD_STEEL
  );
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(22.7, 0.3);
  bladeShape.lineTo(25.25, 0.04);
  bladeShape.lineTo(22.95, 0.72);
  bladeShape.lineTo(22.55, 0.62);
  bladeShape.closePath();
  const blades: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const angle = (k * Math.PI * 2) / 3 + Math.PI / 3;
    blades.push(
      extrudeAlongZ(
        bladeShape,
        -0.025,
        0.05,
        R500_CHROME,
        0.008,
        4
      ).rotateX(angle)
    );
  }

  return sanitizeR500Mesh(
    mergeParts([
      shaft,
      nockCollar,
      halfMoonEars,
      ...vanes,
      collar,
      broadheadFerrule,
      ...blades,
    ])
  );
}
