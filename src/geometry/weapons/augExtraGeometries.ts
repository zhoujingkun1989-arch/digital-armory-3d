import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../springHelper';
import {
  applyAugMagUVs,
  AUG_AMBER_MAG,
  AUG_ANODIZED_GREY,
  AUG_BRIGHT_STEEL,
  AUG_CHROME_STEEL,
  AUG_DARK_STEEL,
  AUG_INNER_DARK,
  AUG_MAG_ANG_END,
  AUG_MAG_ANG_START,
  AUG_MAG_ARC_CX,
  AUG_MAG_ARC_CY,
  AUG_MAG_R_INNER,
  AUG_MAG_R_OUTER,
  AUG_OLIVE,
  AUG_OLIVE_DARK,
  AUG_POLYMER_PACK,
  AUG_RUBBER_BLACK,
  AUG_SAFETY_RED,
  AUG_SPRING_STEEL,
} from './augGeometries';

// ============================================================================
// 1. QUICK-CHANGE 20" BARREL, GAS SYSTEM & TWIN-ROD BOLT GROUP (9 Builders)
// ============================================================================

/**
 * U-01: Quick-Change 20" (508mm) Cold-Hammer-Forged Barrel w/ 8-Ring Interrupted Locking Lugs
 * (assembledPos: [0, 1.05, 0]) — spans local/world X ∈ [-8.20, +18.85]
 */
export function buildAugBarrelGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.32, -8.2),
    new THREE.Vector2(0.58, -8.2), // 7-lug steel breech extension collar
    new THREE.Vector2(0.58, -6.55),
    new THREE.Vector2(0.5, -6.25), // Rear trunnion journal inside stock/receiver
    new THREE.Vector2(0.5, 2.85),
    new THREE.Vector2(0.55, 3.05), // Interrupted quick-change locking flange zone
    new THREE.Vector2(0.55, 4.35),
    new THREE.Vector2(0.45, 4.55), // Receiver front bearing journal
    new THREE.Vector2(0.44, 7.85),
    new THREE.Vector2(0.49, 7.95), // Tilted gas-block seat journal (X ∈ [7.95, 9.75])
    new THREE.Vector2(0.49, 9.75),
    new THREE.Vector2(0.4, 9.88), // Forward heavy 20" barrel contour
    new THREE.Vector2(0.4, 15.65),
    new THREE.Vector2(0.44, 15.75), // Rifle-grenade alignment ring
    new THREE.Vector2(0.44, 16.15),
    new THREE.Vector2(0.39, 16.25),
    new THREE.Vector2(0.39, 18.25),
    new THREE.Vector2(0.32, 18.3), // Muzzle thread spigot inside tulip flash hider
    new THREE.Vector2(0.32, 18.85),
    new THREE.Vector2(0.18, 18.85),
  ];

  const outer = new THREE.LatheGeometry(pts, 28);
  outer.rotateZ(-Math.PI / 2);
  paintGeometry(outer, AUG_DARK_STEEL);

  // Hollow 5.56mm bore + 5.56×45mm chamber cavity
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 27.6, 18)
      .rotateZ(Math.PI / 2)
      .translate(5.4, 0, 0),
    AUG_INNER_DARK
  );
  const chamber = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.31, 2.3, 18)
      .rotateZ(Math.PI / 2)
      .translate(-7.1, 0, 0),
    AUG_INNER_DARK
  );
  const hollowed = csgSubtract(outer, [bore, chamber]);

  // Chrome breech feed ramp collar + interrupted quick-change barrel locking rings at X ∈ [3.15, 4.25]
  const extras: THREE.BufferGeometry[] = [
    hollowed,
    paintGeometry(
      new THREE.TorusGeometry(0.38, 0.06, 10, 24)
        .rotateY(Math.PI / 2)
        .translate(-8.18, 0, 0),
      AUG_CHROME_STEEL
    ),
  ];

  for (let i = 0; i < 4; i++) {
    extras.push(
      paintGeometry(
        new THREE.TorusGeometry(0.55, 0.038, 8, 22)
          .rotateY(Math.PI / 2)
          .translate(3.2 + i * 0.34, 0, 0),
        AUG_BRIGHT_STEEL
      )
    );
  }

  return mergeParts(extras);
}

/**
 * U-02: Iconic Steyr AUG A1 "Tulip" Closed-End 3-Slot Flash Suppressor (assembledPos: [19.40, 1.05, 0])
 * Spans local X ∈ [-1.15, +1.10] => world X ∈ [+18.25, +20.50] (exact muzzle tip at X = +20.50!).
 */
export function buildAugFlashHiderGeometry(): THREE.BufferGeometry {
  const tulipPts: THREE.Vector2[] = [
    new THREE.Vector2(0.33, -1.15),
    new THREE.Vector2(0.49, -1.15), // Rear check-nut collar
    new THREE.Vector2(0.49, -0.58),
    new THREE.Vector2(0.53, -0.48), // Knurled grenade spring ring
    new THREE.Vector2(0.53, -0.18),
    new THREE.Vector2(0.49, -0.05), // Tulip swell
    new THREE.Vector2(0.46, 0.85),
    new THREE.Vector2(0.41, 1.1), // Closed-prong tapered tulip crown!
    new THREE.Vector2(0.24, 1.1),
  ];

  const rawBody = new THREE.LatheGeometry(tulipPts, 28);
  rawBody.rotateZ(-Math.PI / 2);
  paintGeometry(rawBody, AUG_DARK_STEEL);

  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.29, 0.29, 2.5, 20)
        .rotateZ(Math.PI / 2)
        .translate(0, 0, 0),
      AUG_INNER_DARK
    ),
  ];

  // 3 radial flash-suppression slots spaced 120° apart (closed front ring preserved at X_local > +0.86!)
  for (let k = 0; k < 3; k++) {
    const ang = (k * Math.PI * 2) / 3 + Math.PI / 6;
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.84, 0.42, 0.16)
          .translate(0.38, 0.36, 0)
          .rotateX(ang),
        AUG_INNER_DARK
      )
    );
  }

  return csgSubtract(rawBody, cutters);
}

/**
 * U-03: Offset 45°-Tilted Gas Block & Foregrip Hinge Clevis (assembledPos: [8.85, 1.05, 0])
 * Barrel clamp at local (0, 0, 0); offset gas cylinder at local (Y = +0.47, Z = +0.52) => world (Y = +1.52, Z = +0.52);
 * bottom foregrip pivot clevis at local (0, -1.23, 0) => world [8.85, -0.18, 0]!
 */
export function buildAugGasBlockGeometry(): THREE.BufferGeometry {
  const barrelClamp = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.62, 1.85, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    AUG_DARK_STEEL
  );

  // Diagonal 45° tilted web linking barrel sleeve (0, 0) to right-upper gas cylinder (+0.47, +0.52)
  const tiltedWeb = paintGeometry(
    new THREE.BoxGeometry(1.65, 0.92, 0.44)
      .rotateX(-0.76)
      .translate(-0.1, 0.24, 0.26),
    AUG_DARK_STEEL
  );

  // Offset right-upper gas cylinder (local X ∈ [-2.70, +1.05] => world X ∈ [+6.15, +9.90])
  const gasCylinder = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.44, 3.75, 24)
      .rotateZ(Math.PI / 2)
      .translate(-0.825, 0.47, 0.52),
    AUG_DARK_STEEL
  );

  // Bottom foregrip hinge clevis bracket reaching down to local Y = -1.23 (world Y = -0.18)
  const lowerStrut = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.95, 0.88).translate(0, -0.68, 0),
    AUG_DARK_STEEL
  );
  const clevisEarL = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.38, 0.18, 18)
      .rotateX(Math.PI / 2)
      .translate(0, -1.23, -0.44),
    AUG_DARK_STEEL
  );
  const clevisEarR = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.38, 0.18, 18)
      .rotateX(Math.PI / 2)
      .translate(0, -1.23, 0.44),
    AUG_DARK_STEEL
  );

  const solid = csgUnion([barrelClamp, tiltedWeb, gasCylinder, lowerStrut]);
  const hollowed = csgSubtract(solid, [
    paintGeometry(
      new THREE.CylinderGeometry(0.49, 0.49, 2.2, 22)
        .rotateZ(Math.PI / 2)
        .translate(0, 0, 0),
      AUG_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.3, 0.3, 4.0, 20)
        .rotateZ(Math.PI / 2)
        .translate(-0.82, 0.47, 0.52),
      AUG_INNER_DARK
    ),
  ]);

  return mergeParts([hollowed, clevisEarL, clevisEarR]);
}

/**
 * U-04: 3-Position Winged Gas Regulator Plug (assembledPos: [10.05, 1.52, 0.52])
 */
export function buildAugGasRegulatorGeometry(): THREE.BufferGeometry {
  const valveStem = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.95, 20)
      .rotateZ(Math.PI / 2)
      .translate(-0.22, 0, 0),
    AUG_BRIGHT_STEEL
  );
  const frontCap = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.4, 0.42, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.32, 0, 0),
    AUG_DARK_STEEL
  );
  // Iconic Steyr olive/black polymer heat-insulated finger wings for hot field adjustment!
  const wingTop = paintGeometry(
    new THREE.BoxGeometry(0.36, 0.32, 0.18).translate(0.34, 0.48, 0),
    AUG_OLIVE_DARK
  );
  const wingBot = paintGeometry(
    new THREE.BoxGeometry(0.36, 0.32, 0.18).translate(0.34, -0.48, 0),
    AUG_OLIVE_DARK
  );

  return mergeParts([valveStem, frontCap, wingTop, wingBot]);
}

/**
 * U-05: Chrome-Plated Short-Stroke Gas Piston & Return Spring (assembledPos: [7.85, 1.52, 0.52])
 * Spans local X ∈ [-1.70, +1.65] => world X ∈ [+6.15, +9.50] inside offset gas cylinder!
 */
export function buildAugGasPistonGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -1.7),
    new THREE.Vector2(0.18, -1.7), // Rear striker tip abutting right carrier rod at X = +6.15
    new THREE.Vector2(0.18, 0.45),
    new THREE.Vector2(0.28, 0.65), // Piston head land 1
    new THREE.Vector2(0.28, 0.85),
    new THREE.Vector2(0.22, 0.9), // Gas seal ring groove 1
    new THREE.Vector2(0.22, 1.0),
    new THREE.Vector2(0.28, 1.05), // Land 2
    new THREE.Vector2(0.28, 1.25),
    new THREE.Vector2(0.22, 1.3), // Gas seal ring groove 2
    new THREE.Vector2(0.22, 1.4),
    new THREE.Vector2(0.29, 1.45), // Front gas cup face
    new THREE.Vector2(0.29, 1.65),
    new THREE.Vector2(0.0, 1.55),
  ];

  const piston = new THREE.LatheGeometry(pts, 22);
  piston.rotateZ(-Math.PI / 2);
  paintGeometry(piston, AUG_CHROME_STEEL);

  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.45,
      end: 0.45,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.24,
      wireRadius: 0.032,
      coils: 8,
    }),
    AUG_SPRING_STEEL
  );

  return mergeParts([piston, returnSpring]);
}

/**
 * U-06: Compact Bolt Carrier w/ Twin Long Tubular Guide Rods (assembledPos: [-9.20, 1.18, 0])
 * Compact machined carrier body at world X ∈ [-11.05, -7.45];
 * Twin tubular rods at local Y = +0.34 (world Y = +1.52), Z = ±0.52 extending forward to local X = +15.35 (world X = +6.15)!
 */
export function buildAugBoltCarrierGeometry(): THREE.BufferGeometry {
  // Compact die-cast/CNC carrier body (local X ∈ [-1.85, +1.75])
  const carrierBlock = paintGeometry(
    new THREE.BoxGeometry(3.6, 1.12, 1.34).translate(-0.05, -0.04, 0),
    AUG_DARK_STEEL
  );
  const rodBossL = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 3.65, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 0.34, -0.52),
    AUG_DARK_STEEL
  );
  const rodBossR = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 3.65, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 0.34, 0.52),
    AUG_DARK_STEEL
  );

  const unionCarrier = csgUnion([carrierBlock, rodBossL, rodBossR]);

  // Hollow bolt-sleeve tunnel (local Y = -0.13 => world Y = 1.05) + helical cam-pin slot!
  const boltBore = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 4.0, 20)
      .rotateZ(Math.PI / 2)
      .translate(0, -0.13, 0),
    AUG_INNER_DARK
  );
  const camSlot = paintGeometry(
    new THREE.BoxGeometry(1.25, 0.36, 0.55)
      .rotateY(0.52)
      .translate(0.45, 0.22, 0.22),
    AUG_INNER_DARK
  );
  const sculptedCarrier = csgSubtract(unionCarrier, [boltBore, camSlot]);

  // Twin 13.6-unit Long Chrome-Plated Tubular Guide Rods extending forward to local X = +15.35 (world X = +6.15)!
  const rodRight = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 13.65, 18)
      .rotateZ(Math.PI / 2)
      .translate(8.52, 0.34, 0.52),
    AUG_CHROME_STEEL
  );
  const rodLeft = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 13.65, 18)
      .rotateZ(Math.PI / 2)
      .translate(8.52, 0.34, -0.52),
    AUG_CHROME_STEEL
  );

  // Left rod forward collar engaging the non-reciprocating charging handle shuttle
  const leftShuttleCollar = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.55, 16)
      .rotateZ(Math.PI / 2)
      .translate(12.2, 0.34, -0.52),
    AUG_DARK_STEEL
  );

  // Rear polymer anti-bounce roller / cocking ramp under carrier tail
  const cockingRoller = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 0.58, 16)
      .rotateX(Math.PI / 2)
      .translate(-1.68, -0.48, 0),
    AUG_BRIGHT_STEEL
  );

  return mergeParts([
    sculptedCarrier,
    rodRight,
    rodLeft,
    leftShuttleCollar,
    cockingRoller,
  ]);
}

/**
 * U-07: 7-Lug Rotating Bolt Head, Claw Extractor & Cam Guide Sleeve (assembledPos: [-8.05, 1.05, 0])
 */
export function buildAugBoltGeometry(): THREE.BufferGeometry {
  // Bolt stem + outer guide sleeve + front bolt head
  const sleeve = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.38, 2.05, 22)
      .rotateZ(Math.PI / 2)
      .translate(-1.15, 0, 0),
    AUG_DARK_STEEL
  );
  const stem = paintGeometry(
    new THREE.CylinderGeometry(0.29, 0.29, 2.65, 20)
      .rotateZ(Math.PI / 2)
      .translate(-0.75, 0, 0),
    AUG_BRIGHT_STEEL
  );
  const head = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 0.62, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.52, 0, 0),
    AUG_CHROME_STEEL
  );

  // 7 radial locking lugs + 8th position right-side claw extractor!
  const lugs: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI * 2) / 8;
    if (k === 0) {
      // Right-side (+Z) heavy claw extractor
      lugs.push(
        paintGeometry(
          new THREE.BoxGeometry(0.95, 0.16, 0.18).translate(0.35, 0, 0.42),
          AUG_DARK_STEEL
        )
      );
    } else {
      lugs.push(
        paintGeometry(
          new THREE.BoxGeometry(0.46, 0.14, 0.18)
            .translate(0.52, 0, 0.42)
            .rotateX(ang),
          AUG_CHROME_STEEL
        )
      );
    }
  }

  // Helical cam pin rising atop bolt stem
  const camPin = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 0.56, 16).translate(-0.55, 0.42, 0),
    AUG_BRIGHT_STEEL
  );

  // Recessed bolt face cup
  const rawBolt = mergeParts([sleeve, stem, head, ...lugs, camPin]);
  return csgSubtract(rawBolt, [
    paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 0.28, 18)
        .rotateZ(Math.PI / 2)
        .translate(0.8, 0, 0),
      AUG_INNER_DARK
    ),
  ]);
}

/**
 * U-08: Stepped Stainless Steel Long Firing Pin (assembledPos: [-9.45, 1.05, 0])
 * Spans local X ∈ [-2.05, +2.05] => world X ∈ [-11.50, -7.40].
 */
export function buildAugFiringPinGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -2.05),
    new THREE.Vector2(0.16, -2.05), // Rear striking button (struck by aug_hammer!)
    new THREE.Vector2(0.16, -1.65),
    new THREE.Vector2(0.11, -1.6),
    new THREE.Vector2(0.11, 0.45),
    new THREE.Vector2(0.17, 0.5), // Stop collar
    new THREE.Vector2(0.17, 0.72),
    new THREE.Vector2(0.09, 0.8),
    new THREE.Vector2(0.075, 1.65),
    new THREE.Vector2(0.032, 2.04), // Firing pin tip
    new THREE.Vector2(0.0, 2.06),
  ];
  const lathe = new THREE.LatheGeometry(pts, 18);
  lathe.rotateZ(-Math.PI / 2);
  return paintGeometry(lathe, AUG_CHROME_STEEL);
}

/**
 * U-09: Dual Parallel Helical Recoil Springs & Rear Guide Bridge (assembledPos: [-13.20, 1.52, 0])
 * Spans local X ∈ [-3.85, +3.75] (L0 = 7.60) => world X ∈ [-17.05, -9.45] along Z = ±0.52!
 */
export function buildAugRecoilSpringsGeometry(): THREE.BufferGeometry {
  const springL = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -3.75,
      end: 3.75,
      centerY: 0,
      centerZ: -0.52,
      coilRadius: 0.21,
      wireRadius: 0.034,
      coils: 18,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    AUG_SPRING_STEEL
  );
  const springR = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -3.75,
      end: 3.75,
      centerY: 0,
      centerZ: 0.52,
      coilRadius: 0.21,
      wireRadius: 0.034,
      coils: 18,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    AUG_SPRING_STEEL
  );
  const innerRodL = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 7.2, 12)
      .rotateZ(Math.PI / 2)
      .translate(-0.15, 0, -0.52),
    AUG_BRIGHT_STEEL
  );
  const innerRodR = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 7.2, 12)
      .rotateZ(Math.PI / 2)
      .translate(-0.15, 0, 0.52),
    AUG_BRIGHT_STEEL
  );
  const rearBridge = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.52, 1.38).translate(-3.82, 0, 0),
    AUG_DARK_STEEL
  );

  return mergeParts([springL, springR, innerRodL, innerRodR, rearBridge]);
}

// ============================================================================
// 2. PROGRESSIVE TRIGGER, TRANSFER BARS & REAR POLYMER HAMMER PACK (5 Builders)
// ============================================================================

/**
 * FC-01: Progressive Two-Stage Sliding Polymer Trigger (assembledPos: [0.55, -2.35, 0])
 * Slides linearly rearward (-X) in Steyr AUG — half pull = semi-auto, full pull = full-auto!
 */
export function buildAugTriggerGeometry(): THREE.BufferGeometry {
  const guideBlock = paintGeometry(
    new THREE.BoxGeometry(1.38, 0.52, 0.58).translate(-0.05, 0.62, 0),
    AUG_RUBBER_BLACK
  );

  const shoeShape = new THREE.Shape();
  shoeShape.moveTo(-0.42, 0.45);
  shoeShape.lineTo(0.45, 0.45);
  shoeShape.quadraticCurveTo(0.22, -0.35, 0.36, -1.08); // Ergonomic curved finger face
  shoeShape.lineTo(-0.18, -1.14);
  shoeShape.quadraticCurveTo(-0.46, -0.45, -0.42, 0.45);
  shoeShape.closePath();

  const shoe = new THREE.ExtrudeGeometry(shoeShape, {
    depth: 0.48,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  shoe.translate(0, 0, -0.24);
  paintGeometry(shoe, AUG_RUBBER_BLACK);

  // clamping bolt joining sliding trigger to the dual transfer bars
  const yokeBolt = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.78, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.22, 0.65, 0),
    AUG_BRIGHT_STEEL
  );

  return mergeParts([guideBlock, shoe, yokeBolt]);
}

/**
 * FC-02: Rectangular Cross-Bolt Push-Button Safety w/ Red Warning Band (assembledPos: [-0.65, -1.42, 0])
 */
export function buildAugSafetyGeometry(): THREE.BufferGeometry {
  const mainBar = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.44, 1.86).translate(0, 0, 0.04),
    AUG_RUBBER_BLACK
  );
  // Iconic bright red left indicator band visible when pushed to FIRE!
  const redIndicator = paintGeometry(
    new THREE.BoxGeometry(0.44, 0.42, 0.28).translate(0, 0, -0.96),
    AUG_SAFETY_RED
  );
  const detentNotch = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.52, 12).translate(0, 0.22, 0.2),
    AUG_BRIGHT_STEEL
  );

  return mergeParts([mainBar, redIndicator, detentNotch]);
}

/**
 * FC-03: Long Dual Parallel Steel Trigger Transfer Bars (assembledPos: [-6.60, -1.25, 0])
 * Spans local X ∈ [-7.35, +6.95] => world X ∈ [-13.95, +0.35] (14.3 units long!),
 * straddling pistol grip & rear magwell at Z = ±0.58 to link front sliding trigger to rear hammer pack!
 */
export function buildAugTransferBarsGeometry(): THREE.BufferGeometry {
  // Front cross-yoke connecting to aug_trigger at world X = +0.35, Y = -1.70
  const frontYoke = paintGeometry(
    new THREE.BoxGeometry(0.45, 0.36, 1.26).translate(6.85, -0.45, 0),
    AUG_DARK_STEEL
  );

  // Stepped twin longitudinal steel bars (low near trigger Y_local = -0.45, stepping up at X_local = +2.5 to Y_local = +0.25 past magwell!)
  const barShape = new THREE.Shape();
  barShape.moveTo(6.95, -0.55);
  barShape.lineTo(6.95, -0.35);
  barShape.lineTo(3.2, -0.35);
  barShape.lineTo(2.1, 0.32); // Smooth upward step clearing rear bullpup magwell!
  barShape.lineTo(-7.35, 0.32);
  barShape.lineTo(-7.35, 0.12);
  barShape.lineTo(1.95, 0.12);
  barShape.lineTo(3.05, -0.55);
  barShape.closePath();

  const barLeft = new THREE.ExtrudeGeometry(barShape, {
    depth: 0.09,
    bevelEnabled: false,
  });
  barLeft.translate(0, 0, -0.62);
  paintGeometry(barLeft, AUG_BRIGHT_STEEL);

  const barRight = new THREE.ExtrudeGeometry(barShape, {
    depth: 0.09,
    bevelEnabled: false,
  });
  barRight.translate(0, 0, 0.53);
  paintGeometry(barRight, AUG_BRIGHT_STEEL);

  // Rear sear-actuating bridge engaging aug_hammer_pack
  const rearBridge = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.34, 1.24).translate(-7.15, 0.22, 0),
    AUG_BRIGHT_STEEL
  );

  return mergeParts([frontYoke, barLeft, barRight, rearBridge]);
}

/**
 * FC-04: Iconic Steyr All-Polymer Rear Hammer Pack Housing (`aug_hammer_pack`, assembledPos: [-14.65, -0.65, 0])
 * Seated in the rear buttstock BEHIND the magwell (world X ∈ [-16.85, -12.45], Y ∈ [-2.15, +0.65]).
 * Molded olive-grey glass-filled polyamide chassis w/ polymer disconnector, autosear & drop safety!
 */
export function buildAugHammerPackGeometry(): THREE.BufferGeometry {
  const rawChassis = paintGeometry(
    new THREE.BoxGeometry(4.35, 2.35, 1.18).translate(0, 0, 0),
    AUG_POLYMER_PACK
  );
  const innerPocket = paintGeometry(
    new THREE.BoxGeometry(3.65, 1.85, 0.82).translate(0.1, 0.32, 0),
    AUG_OLIVE_DARK
  );
  const rearSlant = paintGeometry(
    new THREE.BoxGeometry(1.8, 0.9, 1.4)
      .rotateZ(-0.32)
      .translate(-1.55, -1.08, 0),
    AUG_OLIVE_DARK
  );
  const chassisShell = csgSubtract(rawChassis, [innerPocket, rearSlant]);

  // Molded Polymer Progressive Sear Slide & Semi/Auto Disconnector Levers inside pack
  const searSlide = paintGeometry(
    new THREE.BoxGeometry(2.45, 0.36, 0.56).translate(0.35, -0.15, 0),
    AUG_OLIVE
  );
  const disconnectorHook = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.68, 0.34)
      .rotateZ(0.22)
      .translate(-0.45, 0.45, 0),
    AUG_OLIVE_DARK
  );
  // Bottom takedown-pin locking lug (engaged by aug_takedown_pin at world [-15.85, -2.45, 0])
  const pinLug = paintGeometry(
    new THREE.BoxGeometry(0.85, 0.72, 0.76).translate(-1.18, -1.35, 0),
    AUG_POLYMER_PACK
  );
  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.65,
      end: -0.35,
      centerY: -0.15,
      centerZ: 0,
      coilRadius: 0.14,
      wireRadius: 0.026,
      coils: 7,
    }),
    AUG_SPRING_STEEL
  );

  return mergeParts([
    chassisShell,
    searSlide,
    disconnectorHook,
    pinLug,
    returnSpring,
  ]);
}

/**
 * FC-05: Rear All-Polymer Rotary Hammer & Dual Torsion Springs (`aug_hammer`, assembledPos: [-12.85, -0.05, 0])
 * Pivot at local (0, 0, 0): cocked upward/backward at f=0; rotating rz < 0 swings hammer +X forward
 * to strike the rear tail of aug_firing_pin at world [-11.50, +1.05, 0]!
 */
export function buildAugHammerGeometry(): THREE.BufferGeometry {
  const pivotAxle = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 1.12, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    AUG_BRIGHT_STEEL
  );

  // Molded glass-filled polyamide rotary hammer profile (cocked back by +0.52 rad at rest)
  const hShape = new THREE.Shape();
  hShape.moveTo(-0.22, -0.12);
  hShape.lineTo(0.24, -0.12);
  hShape.lineTo(0.36, 0.75);
  hShape.lineTo(0.26, 1.32); // Striking nose!
  hShape.lineTo(-0.28, 1.24); // Upper cocking crest
  hShape.lineTo(-0.44, 0.55); // Disconnector catch notch
  hShape.closePath();

  const hammerHead = new THREE.ExtrudeGeometry(hShape, {
    depth: 0.44,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  hammerHead.translate(0, 0, -0.22);
  hammerHead.rotateZ(0.52); // Rests cocked backward; rz = -0.92 swings nose forward (+X) onto firing pin!
  paintGeometry(hammerHead, AUG_POLYMER_PACK);

  // Dual steel hammer torsion springs flanking the polymer hammer hub
  const coilL = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.48,
      end: -0.26,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.31,
      wireRadius: 0.032,
      coils: 3.5,
    }).rotateX(Math.PI / 2),
    AUG_SPRING_STEEL
  );
  const coilR = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.26,
      end: 0.48,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.31,
      wireRadius: 0.032,
      coils: 3.5,
    }).rotateX(Math.PI / 2),
    AUG_SPRING_STEEL
  );

  return mergeParts([pivotAxle, hammerHead, coilL, coilR]);
}

// ============================================================================
// 3. 30-ROUND TRANSLUCENT AMBER WAFFLE-GRID POLYMER MAGAZINE (4 Builders)
// ============================================================================

/**
 * M-01: 30-Round Translucent Amber Waffle-Pattern Curved Polymer Magazine Body
 * (assembledPos: [-9.95, 0.45, 0], isShell: true)
 * Seated flush in the rear bullpup magwell BEHIND the pistol grip!
 */
export function buildAugMagBodyGeometry(): THREE.BufferGeometry {
  const magShape = new THREE.Shape();
  const steps = 24;

  // Outer (rear -X) convex arc from top (angStart) to bottom (angEnd)
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const ang =
      AUG_MAG_ANG_START + (AUG_MAG_ANG_END - AUG_MAG_ANG_START) * u;
    const px = AUG_MAG_ARC_CX - Math.cos(ang) * AUG_MAG_R_OUTER;
    const py = AUG_MAG_ARC_CY - Math.sin(ang) * AUG_MAG_R_OUTER;
    if (i === 0) magShape.moveTo(px, py);
    else magShape.lineTo(px, py);
  }
  // Inner (front +X) concave arc from bottom back to top
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    const ang =
      AUG_MAG_ANG_START + (AUG_MAG_ANG_END - AUG_MAG_ANG_START) * u;
    const px = AUG_MAG_ARC_CX - Math.cos(ang) * AUG_MAG_R_INNER;
    const py = AUG_MAG_ARC_CY - Math.sin(ang) * AUG_MAG_R_INNER;
    magShape.lineTo(px, py);
  }
  magShape.closePath();

  const rawBody = new THREE.ExtrudeGeometry(magShape, {
    depth: 1.14,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  rawBody.translate(0, 0, -0.57);
  paintGeometry(rawBody, AUG_AMBER_MAG);

  // Hollow top feed throat cavity
  const throatCut = paintGeometry(
    new THREE.BoxGeometry(1.95, 1.65, 0.86).translate(0, -0.15, 0),
    AUG_INNER_DARK
  );
  const sculpted = csgSubtract(rawBody, [throatCut]);

  // Physical 3D Waffle-Grid Horizontal Ribs below magwell lip (ang ∈ [0.24, 0.45]) + Feed Lips & Magwell Stop Lug!
  const parts: THREE.BufferGeometry[] = [sculpted];
  for (let r = 0; r < 5; r++) {
    const ang = 0.25 + r * 0.048;
    const rMid = (AUG_MAG_R_INNER + AUG_MAG_R_OUTER) * 0.5;
    const mx = AUG_MAG_ARC_CX - Math.cos(ang) * rMid;
    const my = AUG_MAG_ARC_CY - Math.sin(ang) * rMid;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(2.42, 0.1, 1.24)
          .rotateZ(ang)
          .translate(mx, my, 0),
        AUG_AMBER_MAG
      )
    );
  }

  // Polymer top feed lips + rear mag-catch locking lug
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(2.25, 0.28, 1.04).translate(0, 0.22, 0),
      AUG_OLIVE_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.36, 0.34, 0.88).translate(-1.32, -3.55, 0),
      AUG_OLIVE_DARK
    )
  );

  return applyAugMagUVs(mergeParts(parts));
}

/**
 * M-02: Anti-Tilt Polymer Follower (assembledPos: [-9.88, -0.65, 0])
 */
export function buildAugMagFollowerGeometry(): THREE.BufferGeometry {
  const deck = paintGeometry(
    new THREE.BoxGeometry(2.08, 0.26, 0.82)
      .rotateZ(0.06)
      .translate(0, 0.14, 0),
    AUG_RUBBER_BLACK
  );
  const stackStep = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 1.98, 14)
      .rotateZ(Math.PI / 2 + 0.06)
      .translate(0, 0.28, -0.16),
    AUG_OLIVE
  );
  const legFront = paintGeometry(
    new THREE.BoxGeometry(0.2, 0.88, 0.76)
      .rotateZ(0.08)
      .translate(0.9, -0.28, 0),
    AUG_RUBBER_BLACK
  );
  const legRear = paintGeometry(
    new THREE.BoxGeometry(0.2, 0.88, 0.76)
      .rotateZ(0.08)
      .translate(-0.9, -0.28, 0),
    AUG_RUBBER_BLACK
  );

  return mergeParts([deck, stackStep, legFront, legRear]);
}

/**
 * M-03: Curved Rectangular Magazine Coil Spring matching the exact AUG 5.56mm arc (assembledPos: [-9.95, 0.45, 0])
 */
export function buildAugMagSpringGeometry(): THREE.BufferGeometry {
  const coils = 10;
  const stepsPerCoil = 24;
  const totalSteps = coils * stepsPerCoil;
  const points: THREE.Vector3[] = [];
  const rMid = (AUG_MAG_R_INNER + AUG_MAG_R_OUTER) * 0.5;

  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const ang = 0.06 + u * 0.39;
    const theta = u * coils * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const radialOffset = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.6) * 0.82;
    const zOffset = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.6) * 0.32;

    const rCur = rMid + radialOffset;
    const px = AUG_MAG_ARC_CX - Math.cos(ang) * rCur;
    const py = AUG_MAG_ARC_CY - Math.sin(ang) * rCur;
    points.push(new THREE.Vector3(px, py, zOffset));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(curve, totalSteps, 0.044, 8, false);
  return paintGeometry(tube, AUG_SPRING_STEEL);
}

/**
 * M-04: Flush Angled Polymer Magazine Floorplate & Lock Button (assembledPos: [-7.84, -8.00, 0])
 * Exact match to AUG_MAG_ANG_END = 0.48 rad bottom face of aug_mag_body at [-7.916, -7.862, 0] -> ZERO gap!
 */
export function buildAugMagFloorplateGeometry(): THREE.BufferGeometry {
  const basePlate = paintGeometry(
    new THREE.BoxGeometry(2.74, 0.38, 1.34)
      .rotateZ(AUG_MAG_ANG_END)
      .translate(0, 0, 0),
    AUG_RUBBER_BLACK
  );
  const lockTab = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.24, 16)
      .rotateZ(AUG_MAG_ANG_END)
      .translate(0.08, -0.14, 0),
    AUG_OLIVE_DARK
  );

  return mergeParts([basePlate, lockTab]);
}
