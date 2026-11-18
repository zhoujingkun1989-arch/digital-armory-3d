import * as THREE from 'three';
import {
  createBeveledCylinder,
  createChamferedBox,
  createMilStdPicatinnyRail,
  csgSubtract,
  csgUnion,
  mergeParts,
} from '../../../engine/geometry/csgBuilder';
import {
  SUPER_V_CHUTE_ANGLE,
  VECTOR_BORE_Y,
  VECTOR_BRASS_ACCENT,
  VECTOR_CAM_POLISHED,
  VECTOR_CHARCOAL_POLY,
  VECTOR_FDE_POLYMER,
  VECTOR_FDE_RIB,
  VECTOR_MAG_ANGLE,
  VECTOR_NITRIDE_STEEL,
  VECTOR_RAIL_ANODIZED,
  VECTOR_RUBBER_PAD,
  VECTOR_SAFETY_RED,
  VECTOR_SIGHT_WHITE,
  VECTOR_SPRING_STEEL,
  VECTOR_STAINLESS,
  applyVectorHousingUVs,
  applyVectorInternalsUVs,
  createWatertightHelicalSpring,
  extrudeAlongZ,
  mergeCutters,
  revolveClosedX,
  sanitizeVectorMesh,
} from './vectorGeometries';

// ============================================================================
// 1. 'frame' GROUP — TWO-TIER POLYMER HOUSING, SIGHTS & GEN II STOCK (8 PARTS)
// ============================================================================

/**
 * F-01 (`vector_upper_housing`): Two-Tone Combat FDE / Matte Charcoal Upper Housing & Top Rail
 * (`assembledPos: [0, 0, 0]`, `isShell: true`).
 * Spans `X ∈ [-13.85, +22.60], Y ∈ [+0.68, +4.10], Z ∈ [-1.86, +1.86]`.
 * Houses the inverted top-mounted hammer/FCU pack (`Y ∈ [+1.15, +3.10]`), carries ambidextrous
 * selector & safety bosses, and integrates a full-length 36-slot top MIL-STD-1913 Picatinny rail!
 */
export function buildVectorUpperHousingGeometry(): THREE.BufferGeometry {
  const upperProfile = new THREE.Shape();
  upperProfile.moveTo(-13.85, 0.68);
  upperProfile.lineTo(22.6, 0.68);
  upperProfile.lineTo(22.6, 3.12);
  upperProfile.lineTo(21.85, 3.58);
  upperProfile.lineTo(-13.15, 3.58);
  upperProfile.lineTo(-13.85, 2.95);
  upperProfile.closePath();

  const rawShell = extrudeAlongZ(
    upperProfile,
    0,
    3.68,
    VECTOR_FDE_POLYMER,
    0.09,
    8
  );

  // Carve hollow FCU cavity & outer wall ports in a single non-overlapping CSG pass
  const upperCuts = mergeCutters([
    new THREE.BoxGeometry(33.4, 2.45, 2.74).translate(3.8, 1.72, 0),
    new THREE.BoxGeometry(4.4, 0.92, 0.72).translate(8.4, 0.92, 1.74),
    new THREE.BoxGeometry(7.2, 0.56, 0.72).translate(14.8, 0.92, -1.74),
  ]);
  const hollowedUpper = csgSubtract(rawShell, [upperCuts]);

  // Full-length Matte Charcoal anodized MIL-STD-1913 Picatinny rail (`crown Y = +4.10`)
  const topRail = createMilStdPicatinnyRail(
    35.2,
    -12.9,
    4.1,
    2.12,
    VECTOR_RAIL_ANODIZED
  );

  // Molded ambidextrous fire-mode (`X = -2.85, Y = +2.55`) & thumb-safety (`X = -8.35, Y = +1.18`) bosses
  // plus 3 upper takedown pin lug ears
  const parts: THREE.BufferGeometry[] = [hollowedUpper, topRail];
  for (const zSign of [-1, 1] as const) {
    parts.push(
      createBeveledCylinder(
        0.58,
        0.64,
        0.22,
        0.03,
        20,
        VECTOR_CHARCOAL_POLY
      )
        .rotateX(Math.PI / 2)
        .translate(-2.85, 2.55, zSign * 1.88),
      createBeveledCylinder(
        0.48,
        0.54,
        0.2,
        0.03,
        18,
        VECTOR_CHARCOAL_POLY
      )
        .rotateX(Math.PI / 2)
        .translate(-8.35, 1.25, zSign * 1.88)
    );
  }
  for (const pinX of [-10.8, 1.2, 14.6]) {
    parts.push(
      createChamferedBox(1.45, 0.65, 3.74, 0.05, VECTOR_FDE_RIB).translate(
        pinX,
        0.95,
        0
      )
    );
  }

  return sanitizeVectorMesh(
    applyVectorHousingUVs(mergeParts(parts), 'upper'),
    true
  );
}

/**
 * F-02 (`vector_lower_chassis`): Iconic Tall Angular Combat FDE Super V Lower Polymer Chassis
 * (`assembledPos: [0, 0, 0]`, `isShell: true`).
 * Spans `X ∈ [-12.75, +22.60], Y ∈ [-12.60, +0.74], Z ∈ [-1.82, +1.82]`.
 * Houses:
 *  - Low-bore `.45 ACP` barrel shroud (`boreY = -0.95`, below `triggerY = +0.58`!)
 *  - Steeply forward-angled `66°` Glock-21 `.45 ACP` magazine well (`X_mag`)
 *  - Patented `-65°` Super V vertical counterweight chute (`X_chute`, separated by solid bulkhead!)
 *  - Horizontal wrist-stabilizing trigger-guard bridge + Matte Charcoal stippled pistol grip!
 */
export function buildVectorLowerChassisGeometry(): THREE.BufferGeometry {
  // 1. Main forward Super V chassis & barrel-shroud block (`X ∈ [-4.15, +22.60]`)
  const forwardShape = new THREE.Shape();
  forwardShape.moveTo(-1.35, 0.74);
  forwardShape.lineTo(22.6, 0.74);
  forwardShape.lineTo(22.6, -2.32); // Low-bore muzzle nose around Y = -0.95!
  forwardShape.lineTo(15.2, -2.55); // Integrated front handstop step
  forwardShape.lineTo(13.8, -3.55);
  forwardShape.lineTo(6.65, -12.6); // Iconic slanted KRISS lower magwell chin!
  forwardShape.lineTo(-4.15, -12.6); // Flat bottom floor of magwell & Super V chute
  forwardShape.lineTo(0.85, -1.95); // -65° slanted rear wall of Super V chute!
  forwardShape.lineTo(-3.45, -1.95); // Trigger-guard front junction
  forwardShape.lineTo(-3.45, 0.74);
  forwardShape.closePath();

  const forwardBlock = extrudeAlongZ(
    forwardShape,
    0,
    3.62,
    VECTOR_FDE_POLYMER,
    0.09,
    8
  );

  // 2. Rear pistol grip + horizontal trigger-guard bridge (`X ∈ [-12.75, -3.20]`)
  const gripBridgeShape = new THREE.Shape();
  gripBridgeShape.moveTo(-12.55, 0.74);
  gripBridgeShape.lineTo(-3.2, 0.74);
  gripBridgeShape.lineTo(-3.2, -0.05);
  // Upper trigger window ceiling (`triggerY = +0.58` sits right inside X ∈ [-7.8, -3.5]!)
  gripBridgeShape.lineTo(-7.85, -0.05);
  gripBridgeShape.lineTo(-7.85, -1.48);
  gripBridgeShape.lineTo(-3.2, -1.48);
  gripBridgeShape.lineTo(-3.2, -2.08); // Horizontal KRISS wrist-bridge bar!
  gripBridgeShape.lineTo(-8.25, -2.08);
  gripBridgeShape.quadraticCurveTo(-9.35, -6.2, -10.35, -10.55); // Front finger-groove strap
  gripBridgeShape.lineTo(-13.45, -10.15); // Pistol-grip pommel heel
  gripBridgeShape.quadraticCurveTo(-12.35, -5.4, -11.65, -1.15); // High web backstrap aligned w/ boreY = -0.95!!
  gripBridgeShape.lineTo(-12.55, -0.35);
  gripBridgeShape.closePath();

  const gripBridge = extrudeAlongZ(
    gripBridgeShape,
    0,
    3.16,
    VECTOR_FDE_POLYMER,
    0.09,
    8
  );

  const solidLower = csgUnion([forwardBlock, gripBridge]);

  // 3. Carve internal mechanical raceways:
  //    (a) Horizontal bolt & barrel channel along boreY = -0.95
  //    (b) Patented -65° Super V vertical counterweight chute
  //    (c) Parallel 66° Glock-21 .45 ACP magazine well (separated by solid polymer bulkhead!)
  //    (d) Right-side (+Z) .45 ACP ejection port & left-side charging slot
  // Group A (3 mutually disjoint channels: front barrel bore, 66° magwell, -65° Super V chute)
  const tunnelsGroupA = mergeCutters([
    new THREE.CylinderGeometry(1.16, 1.16, 12.8, 24)
      .rotateZ(Math.PI / 2)
      .translate(17.1, VECTOR_BORE_Y, 0),
    new THREE.BoxGeometry(13.6, 2.95, 2.66)
      .rotateZ(SUPER_V_CHUTE_ANGLE)
      .translate(0.9, -5.65, 0),
    new THREE.BoxGeometry(15.2, 3.35, 2.68)
      .rotateZ(VECTOR_MAG_ANGLE)
      .translate(6.1, -7.25, 0),
  ]);

  // Group B (3 mutually disjoint upper raceway & outer-wall ports)
  const racewayGroupB = mergeCutters([
    new THREE.BoxGeometry(9.2, 2.85, 2.68).translate(6.2, -0.45, 0),
    new THREE.BoxGeometry(4.0, 2.45, 0.72).translate(8.2, -0.42, 1.71),
    new THREE.BoxGeometry(7.2, 0.54, 0.72).translate(12.8, 0.25, -1.71),
  ]);

  const hollowedLower = csgSubtract(solidLower, [tunnelsGroupA, racewayGroupB]);

  // 4. Add two-tone Matte Charcoal stippled grip panels & molded -65° KRISS exterior structural ribs
  const parts: THREE.BufferGeometry[] = [hollowedLower];
  for (const zSign of [-1, 1] as const) {
    // Matte Charcoal textured grip insert panels
    parts.push(
      createChamferedBox(2.45, 6.85, 0.14, 0.03, VECTOR_CHARCOAL_POLY)
        .rotateZ(-0.22)
        .translate(-10.55, -5.85, zSign * 1.59)
    );
    // 4 signature angled -65° KRISS structural ribs across the tall Super V magwell/chute housing
    for (let rIdx = 0; rIdx < 4; rIdx++) {
      const rx = 0.8 + rIdx * 2.45;
      parts.push(
        createChamferedBox(8.6, 0.44, 0.16, 0.03, VECTOR_FDE_RIB)
          .rotateZ(SUPER_V_CHUTE_ANGLE)
          .translate(rx, -6.85, zSign * 1.83)
      );
    }
    // Flared magwell bevel lip at Y = -12.45
    parts.push(
      createChamferedBox(5.8, 0.52, 0.22, 0.04, VECTOR_CHARCOAL_POLY).translate(
        3.4,
        -12.34,
        zSign * 1.84
      )
    );
  }

  // Left-side Glock-style extended magazine release button (`X = +5.2, Y = -3.8, Z = -1.88`)
  parts.push(
    createChamferedBox(1.25, 0.72, 0.34, 0.04, VECTOR_CHARCOAL_POLY)
      .rotateZ(0.38)
      .translate(5.25, -3.85, -1.88)
  );

  return sanitizeVectorMesh(
    applyVectorHousingUVs(mergeParts(parts), 'lower'),
    true
  );
}

/**
 * F-03 (`vector_charging_handle`): Left-Flank Folding Non-Reciprocating Charging Handle & Brass Pivot
 * (`assembledPos: [11.80, 0.25, -1.68]`).
 */
export function buildVectorChargingHandleGeometry(): THREE.BufferGeometry {
  // Internal non-reciprocating steel slide bar with return-detent notch
  const slideBar = createChamferedBox(
    5.4,
    0.46,
    0.34,
    0.03,
    VECTOR_NITRIDE_STEEL
  );
  slideBar.translate(0.6, 0, 0.36);

  const boltPusherFinger = createChamferedBox(
    0.55,
    0.62,
    0.72,
    0.03,
    VECTOR_STAINLESS
  );
  boltPusherFinger.translate(-1.82, -0.22, 0.68);

  // Signature KRISS CNC-machined gold-brass folding hinge knuckle (`VECTOR_BRASS_ACCENT`)!
  const brassKnuckle = createChamferedBox(
    1.28,
    0.68,
    0.54,
    0.05,
    VECTOR_BRASS_ACCENT
  );
  brassKnuckle.translate(-1.25, 0, -0.08);

  const hingePin = createBeveledCylinder(
    0.11,
    0.11,
    0.76,
    0.015,
    14,
    VECTOR_STAINLESS
  ).translate(-1.25, 0, -0.1);

  // Folded-forward contoured black anodized grip lever w/ anti-slip serrations
  const handleBlade = createChamferedBox(
    3.65,
    0.54,
    0.36,
    0.05,
    VECTOR_NITRIDE_STEEL
  );
  handleBlade.translate(0.95, 0, -0.28);

  const fingerHook = createChamferedBox(
    0.65,
    0.64,
    0.52,
    0.05,
    VECTOR_NITRIDE_STEEL
  );
  fingerHook.translate(2.58, 0, -0.38);

  return sanitizeVectorMesh(
    applyVectorInternalsUVs(
      mergeParts([
        slideBar,
        boltPusherFinger,
        brassKnuckle,
        hingePin,
        handleBlade,
        fingerHook,
      ]),
      'brass_accent'
    ),
    true
  );
}

/**
 * F-04 (`vector_front_sight`): Low-Profile KRISS Defiance Flip-Up Front Sight (`assembledPos: [20.60, 4.10, 0]`).
 */
export function buildVectorFrontSightGeometry(): THREE.BufferGeometry {
  const railClamp = createChamferedBox(
    2.15,
    0.52,
    2.28,
    0.05,
    VECTOR_RAIL_ANODIZED
  );
  railClamp.translate(0, 0.2, 0);

  const earL = createChamferedBox(0.88, 1.45, 0.22, 0.03, VECTOR_RAIL_ANODIZED)
    .rotateX(0.14)
    .translate(-0.15, 1.12, -0.68);
  const earR = createChamferedBox(0.88, 1.45, 0.22, 0.03, VECTOR_RAIL_ANODIZED)
    .rotateX(-0.14)
    .translate(-0.15, 1.12, 0.68);

  const post = createChamferedBox(0.22, 1.05, 0.18, 0.02, VECTOR_NITRIDE_STEEL);
  post.translate(-0.15, 0.96, 0);

  const whiteDot = createBeveledCylinder(
    0.07,
    0.07,
    0.08,
    0.01,
    12,
    VECTOR_SIGHT_WHITE
  )
    .rotateZ(Math.PI / 2)
    .translate(-0.24, 1.32, 0);

  const crossBolt = createBeveledCylinder(
    0.16,
    0.16,
    2.48,
    0.02,
    16,
    VECTOR_STAINLESS
  )
    .rotateX(Math.PI / 2)
    .translate(0.35, 0.18, 0);

  return sanitizeVectorMesh(
    applyVectorHousingUVs(
      mergeParts([railClamp, earL, earR, post, whiteDot, crossBolt]),
      'sight'
    ),
    true
  );
}

/**
 * F-05 (`vector_rear_sight`): Low-Profile KRISS Defiance Flip-Up Dual-Aperture Rear Sight
 * (`assembledPos: [-11.40, 4.10, 0]`).
 */
export function buildVectorRearSightGeometry(): THREE.BufferGeometry {
  const railClamp = createChamferedBox(
    2.35,
    0.52,
    2.28,
    0.05,
    VECTOR_RAIL_ANODIZED
  );
  railClamp.translate(0, 0.2, 0);

  const towerStem = createChamferedBox(
    0.68,
    0.88,
    1.36,
    0.04,
    VECTOR_RAIL_ANODIZED
  );
  towerStem.translate(-0.18, 0.82, 0);

  // Hollow Ghost-Ring peep aperture centered at local Y = +1.32 (matches front sight dot!)
  const peepRing = revolveClosedX(
    [
      [0.2, -0.34],
      [0.42, -0.34],
      [0.42, -0.02],
      [0.2, -0.02],
      [0.2, -0.34],
    ],
    22,
    VECTOR_NITRIDE_STEEL
  );
  peepRing.translate(0, 1.32, 0);

  const windageKnob = createBeveledCylinder(
    0.28,
    0.28,
    2.54,
    0.03,
    18,
    VECTOR_STAINLESS
  )
    .rotateX(Math.PI / 2)
    .translate(-0.18, 0.72, 0);

  return sanitizeVectorMesh(
    applyVectorHousingUVs(
      mergeParts([railClamp, towerStem, peepRing, windageKnob]),
      'sight'
    ),
    true
  );
}

/**
 * F-06 (`vector_takedown_pins`): 4 Tool-Free Quick-Push Captive Steel Receiver Takedown Pins
 * (`assembledPos: [0, 0, 0]`).
 * Removing the 3 upper pins lifts `vector_upper_housing` & FCU straight off `vector_lower_chassis`,
 * and pulling the 4th lower pin drops `vector_bolt` & `vector_slider` out in seconds without tools!
 */
export function buildVectorTakedownPinsGeometry(): THREE.BufferGeometry {
  const pinCoords: ReadonlyArray<readonly [number, number]> = [
    [-10.8, 0.95], // Rear upper/lower FCU pin
    [1.2, 0.95], // Central Super V bridge pin
    [14.6, 0.95], // Forward upper housing pin
    [13.8, -1.95], // Lower trunnion / handstop retention pin
  ];

  const parts: THREE.BufferGeometry[] = [];
  for (const [px, py] of pinCoords) {
    const shaft = createBeveledCylinder(
      0.24,
      0.24,
      3.92,
      0.03,
      18,
      VECTOR_NITRIDE_STEEL
    )
      .rotateX(Math.PI / 2)
      .translate(px, py, 0);
    const pullHead = createBeveledCylinder(
      0.38,
      0.38,
      0.28,
      0.03,
      18,
      VECTOR_STAINLESS
    )
      .rotateX(Math.PI / 2)
      .translate(px, py, -2.02);
    const dimpleTip = createBeveledCylinder(
      0.28,
      0.28,
      0.16,
      0.02,
      16,
      VECTOR_CAM_POLISHED
    )
      .rotateX(Math.PI / 2)
      .translate(px, py, 1.98);
    parts.push(shaft, pullHead, dimpleTip);
  }

  return sanitizeVectorMesh(mergeParts(parts));
}

/**
 * F-07 (`vector_stock_hinge`): Push-Button Right-Folding Gen II Stock Hinge Knuckle
 * (`assembledPos: [-14.15, 1.55, 0]`). Rear face at `X = -14.50 cm` -> 40.60 cm folded length!
 */
export function buildVectorStockHingeGeometry(): THREE.BufferGeometry {
  const basePlate = createChamferedBox(
    0.95,
    2.45,
    3.12,
    0.07,
    VECTOR_NITRIDE_STEEL
  );
  basePlate.translate(0.18, 0, 0);

  // Right-side (+Z) twin hinge knuckles & vertical push-button release plunger
  const knuckleTop = createBeveledCylinder(
    0.46,
    0.46,
    0.78,
    0.04,
    20,
    VECTOR_NITRIDE_STEEL
  ).translate(-0.22, 0.68, 1.28);
  const knuckleBot = createBeveledCylinder(
    0.46,
    0.46,
    0.78,
    0.04,
    20,
    VECTOR_NITRIDE_STEEL
  ).translate(-0.22, -0.68, 1.28);
  const releaseButton = createBeveledCylinder(
    0.34,
    0.34,
    2.55,
    0.03,
    18,
    VECTOR_STAINLESS
  ).translate(-0.22, 0.08, 1.28);

  // Left-side QD sling cup boss
  const qdBoss = revolveClosedX(
    [
      [0.24, -0.35],
      [0.48, -0.35],
      [0.48, 0.15],
      [0.24, 0.15],
      [0.24, -0.35],
    ],
    20,
    VECTOR_CAM_POLISHED
  )
    .rotateY(Math.PI / 2)
    .translate(0.05, -0.25, -1.48);

  return sanitizeVectorMesh(
    mergeParts([basePlate, knuckleTop, knuckleBot, releaseButton, qdBoss])
  );
}

/**
 * F-08 (`vector_folding_stock`): Skeletonized Gen II Polymer Folding Buttstock & Ribbed Rubber Buttpad
 * (`assembledPos: [-14.50, 1.55, 0]`).
 * Spans local `X ∈ [-21.10, +0.10]` -> extended rear buttpad at **`X = -35.60 cm` (`61.70 cm` OAL!)**!
 */
export function buildVectorFoldingStockGeometry(): THREE.BufferGeometry {
  const stockShape = new THREE.Shape();
  stockShape.moveTo(0.1, 1.22);
  stockShape.lineTo(-19.85, 0.92);
  stockShape.lineTo(-20.15, -7.85);
  stockShape.lineTo(-18.25, -8.15);
  stockShape.lineTo(-0.05, -1.18);
  stockShape.closePath();

  // Iconic triangular KRISS Gen II weight-saving cutout window!
  const triWindow = new THREE.Path();
  triWindow.moveTo(-2.65, 0.35);
  triWindow.lineTo(-2.65, -1.05);
  triWindow.lineTo(-16.95, -5.85);
  triWindow.lineTo(-16.95, 0.15);
  triWindow.closePath();
  stockShape.holes.push(triWindow);

  const stockFrame = extrudeAlongZ(
    stockShape,
    0,
    2.24,
    VECTOR_FDE_POLYMER,
    0.08,
    8
  );

  // Ergonomic cheek-weld comb saddle along top strut
  const cheekComb = createChamferedBox(
    13.8,
    0.46,
    2.58,
    0.07,
    VECTOR_FDE_RIB
  )
    .rotateZ(0.015)
    .translate(-10.2, 1.18, 0);

  // Thick horizontal-ribbed Matte Charcoal vulcanized rubber recoil buttpad (`X ∈ [-21.10, -19.80]`)
  const buttpadCore = createChamferedBox(
    1.3,
    9.25,
    2.64,
    0.1,
    VECTOR_RUBBER_PAD
  );
  buttpadCore.translate(-20.45, -3.55, 0);

  const parts: THREE.BufferGeometry[] = [stockFrame, cheekComb, buttpadCore];
  for (let r = 0; r < 7; r++) {
    const ry = -7.3 + r * 1.25;
    parts.push(
      createChamferedBox(0.28, 0.42, 2.68, 0.04, VECTOR_CHARCOAL_POLY).translate(
        -21.02,
        ry,
        0
      )
    );
  }

  return sanitizeVectorMesh(
    applyVectorHousingUVs(mergeParts(parts), 'stock'),
    true
  );
}

// ============================================================================
// 2. 'fire_control' GROUP — INVERTED TOP HAMMER PACK & HORIZONTAL TRIGGER (6 PARTS)
// ============================================================================

/**
 * FC-01 (`vector_fcu_chassis`): Top-Deck CNC Steel Fire-Control Sub-Frame
 * (`assembledPos: [0.40, 2.15, 0]`). Mounted inside `vector_upper_housing` **above** the barrel & slider!
 */
export function buildVectorFcuChassisGeometry(): THREE.BufferGeometry {
  // Twin stamped/CNC stainless side rails (`Z = ±0.88`) + rear spring bulkhead + front sear bridge
  const railL = createChamferedBox(12.6, 1.32, 0.22, 0.03, VECTOR_STAINLESS);
  railL.translate(0, 0, -0.88);
  const railR = createChamferedBox(12.6, 1.32, 0.22, 0.03, VECTOR_STAINLESS);
  railR.translate(0, 0, 0.88);

  const rearBulkhead = createChamferedBox(
    1.15,
    1.36,
    1.98,
    0.04,
    VECTOR_NITRIDE_STEEL
  );
  rearBulkhead.translate(-5.65, 0.04, 0);

  const midSearDeck = createChamferedBox(
    2.85,
    0.34,
    1.96,
    0.03,
    VECTOR_NITRIDE_STEEL
  );
  midSearDeck.translate(-1.85, 0.48, 0);

  const frontBridge = createChamferedBox(
    1.45,
    0.44,
    1.98,
    0.04,
    VECTOR_STAINLESS
  );
  frontBridge.translate(5.45, 0.42, 0);

  // Primary sear & 2-round burst ratcheting cam wheel axles
  const searAxle = createBeveledCylinder(
    0.13,
    0.13,
    2.16,
    0.02,
    14,
    VECTOR_CAM_POLISHED
  )
    .rotateX(Math.PI / 2)
    .translate(1.25, 0.18, 0);
  const hammerBossAxle = createBeveledCylinder(
    0.16,
    0.16,
    2.18,
    0.02,
    16,
    VECTOR_CAM_POLISHED
  )
    .rotateX(Math.PI / 2)
    .translate(3.55, -0.3, 0);

  return sanitizeVectorMesh(
    mergeParts([
      railL,
      railR,
      rearBulkhead,
      midSearDeck,
      frontBridge,
      searAxle,
      hammerBossAxle,
    ])
  );
}

/**
 * FC-02 (`vector_trigger`): Signature Horizontal-Travel Pivoting Trigger Mounted ABOVE Barrel Axis!
 * (`assembledPos: [-5.40, 0.58, 0]` — `triggerY = +0.58 cm > boreY = -0.95 cm` by 15.3 mm!).
 */
export function buildVectorTriggerGeometry(): THREE.BufferGeometry {
  // Ergonomic flat-curved pivoting trigger shoe w/ passive safety blade aesthetic
  const shoeShape = new THREE.Shape();
  shoeShape.moveTo(-0.32, 0.92);
  shoeShape.lineTo(0.42, 0.92);
  shoeShape.quadraticCurveTo(0.28, -0.15, 0.48, -1.18);
  shoeShape.lineTo(-0.08, -1.26);
  shoeShape.quadraticCurveTo(-0.36, -0.2, -0.32, 0.92);
  shoeShape.closePath();

  const triggerShoe = extrudeAlongZ(
    shoeShape,
    0,
    0.68,
    VECTOR_NITRIDE_STEEL,
    0.04,
    8
  );

  // Upper pivot hub (`local Y = +0.88` -> world `Y = +1.46`) + twin horizontal steel transfer bars
  const pivotHub = createBeveledCylinder(
    0.26,
    0.26,
    1.38,
    0.025,
    16,
    VECTOR_STAINLESS
  )
    .rotateX(Math.PI / 2)
    .translate(0.05, 0.88, 0);

  const barL = createChamferedBox(5.85, 0.28, 0.14, 0.02, VECTOR_STAINLESS);
  barL.translate(2.95, 1.08, -0.68);
  const barR = createChamferedBox(5.85, 0.28, 0.14, 0.02, VECTOR_STAINLESS);
  barR.translate(2.95, 1.08, 0.68);

  return sanitizeVectorMesh(mergeParts([triggerShoe, pivotHub, barL, barR]));
}

/**
 * FC-03 (`vector_hammer`): Inverted Top-Mounted Hardened Steel Hammer
 * (`assembledPos: [3.95, 1.85, 0]`).
 * Cocked rearward/upward (`rz = 0`) inside the upper FCU deck; when released by the sear, swings
 * **DOWNWARD and FORWARD (`rz = +0.82 rad`)** so its striking face (`local [-1.95, -1.75]`) drops from
 * world `[+2.00, +0.10]` straight onto `vector_firing_pin`'s rear anvil at `[+3.90, -0.77]`!
 */
export function buildVectorHammerGeometry(): THREE.BufferGeometry {
  const hammerShape = new THREE.Shape();
  hammerShape.moveTo(-0.42, 0.52);
  hammerShape.lineTo(0.52, 0.52); // Upper strut horn (`local Y > 0` drives hammer spring!)
  hammerShape.lineTo(0.45, -0.32);
  hammerShape.quadraticCurveTo(-0.35, -1.15, -1.68, -2.02); // Swept inverted hammer neck
  hammerShape.lineTo(-2.22, -1.52); // Hardened flat firing-pin strike face around (-1.95, -1.75)
  hammerShape.quadraticCurveTo(-1.12, -0.68, -0.42, 0.52);
  hammerShape.closePath();

  const hammerBody = extrudeAlongZ(
    hammerShape,
    0,
    0.66,
    VECTOR_NITRIDE_STEEL,
    0.04,
    8
  );

  const pivotSleeve = createBeveledCylinder(
    0.26,
    0.26,
    1.56,
    0.025,
    18,
    VECTOR_CAM_POLISHED
  ).rotateX(Math.PI / 2);

  const searNotch = createChamferedBox(
    0.42,
    0.26,
    0.72,
    0.02,
    VECTOR_STAINLESS
  );
  searNotch.translate(-0.48, 0.34, 0);

  return sanitizeVectorMesh(mergeParts([hammerBody, pivotSleeve, searNotch]));
}

/**
 * FC-04 (`vector_hammer_spring`): Top-Deck Horizontal Helical Hammer Spring & Guide Strut
 * (`assembledPos: [-0.85, 2.42, 0]`).
 * Pure X-axis `createWatertightHelicalSpring` (`start: 0.0` rear FCU seat -> `end: 4.15` hammer horn)
 * with valid `aSpringParam` `w = 1`!
 */
export function buildVectorHammerSpringGeometry(): THREE.BufferGeometry {
  const spring = createWatertightHelicalSpring(
    {
      axis: 'x',
      start: 0.0,
      end: 4.15,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.24,
      wireRadius: 0.042,
      coils: 14,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    },
    VECTOR_SPRING_STEEL
  );

  const guideStrut = revolveClosedX(
    [
      [0.0, -0.18],
      [0.32, -0.18],
      [0.32, 0.05],
      [0.12, 0.08],
      [0.12, 4.35],
      [0.28, 4.42],
      [0.28, 4.62],
      [0.0, 4.68],
    ],
    16,
    VECTOR_STAINLESS
  );

  return sanitizeVectorMesh(mergeParts([spring, guideStrut]));
}

/**
 * FC-05 (`vector_fire_selector`): Upper Ambidextrous 3-Position Fire-Mode Selector (`1 / 2 / A`)
 * (`assembledPos: [-2.85, 2.55, 0]`). Controls Semi-Auto, 2-Round Burst & 1,200 RPM Full-Auto!
 */
export function buildVectorFireSelectorGeometry(): THREE.BufferGeometry {
  const camDrum = createBeveledCylinder(
    0.32,
    0.32,
    3.96,
    0.03,
    18,
    VECTOR_STAINLESS
  ).rotateX(Math.PI / 2);

  // Scalloped ambidextrous KRISS fire-selector levers on both left & right upper flanks
  const leverL = createChamferedBox(
    1.85,
    0.54,
    0.26,
    0.04,
    VECTOR_NITRIDE_STEEL
  )
    .rotateZ(-0.18)
    .translate(-0.52, -0.08, -2.06);
  const leverR = createChamferedBox(
    1.85,
    0.54,
    0.26,
    0.04,
    VECTOR_NITRIDE_STEEL
  )
    .rotateZ(-0.18)
    .translate(-0.52, -0.08, 2.06);

  // White index pointer pips
  const pipL = createChamferedBox(0.46, 0.12, 0.08, 0.015, VECTOR_SIGHT_WHITE)
    .rotateZ(-0.18)
    .translate(0.18, 0.04, -2.18);
  const pipR = createChamferedBox(0.46, 0.12, 0.08, 0.015, VECTOR_SIGHT_WHITE)
    .rotateZ(-0.18)
    .translate(0.18, 0.04, 2.18);

  return sanitizeVectorMesh(mergeParts([camDrum, leverL, leverR, pipL, pipR]));
}

/**
 * FC-06 (`vector_thumb_safety`): Lower Ambidextrous Ergonomic Thumb Safety Lever (`S / F`)
 * (`assembledPos: [-8.35, 1.25, 0]`). Blocks trigger bow & primary sear directly above pistol grip!
 */
export function buildVectorThumbSafetyGeometry(): THREE.BufferGeometry {
  const crossAxle = createBeveledCylinder(
    0.28,
    0.28,
    3.92,
    0.03,
    18,
    VECTOR_NITRIDE_STEEL
  ).rotateX(Math.PI / 2);

  const paddleL = createChamferedBox(
    2.15,
    0.62,
    0.28,
    0.05,
    VECTOR_NITRIDE_STEEL
  )
    .rotateZ(-0.12)
    .translate(-0.68, -0.08, -2.04);
  const paddleR = createChamferedBox(
    2.15,
    0.62,
    0.28,
    0.05,
    VECTOR_NITRIDE_STEEL
  )
    .rotateZ(-0.12)
    .translate(-0.68, -0.08, 2.04);

  const redFireDotL = createBeveledCylinder(
    0.09,
    0.09,
    0.08,
    0.01,
    12,
    VECTOR_SAFETY_RED
  )
    .rotateX(Math.PI / 2)
    .translate(0.16, 0.02, -2.16);
  const redFireDotR = createBeveledCylinder(
    0.09,
    0.09,
    0.08,
    0.01,
    12,
    VECTOR_SAFETY_RED
  )
    .rotateX(Math.PI / 2)
    .translate(0.16, 0.02, 2.16);

  return sanitizeVectorMesh(
    mergeParts([crossAxle, paddleL, paddleR, redFireDotL, redFireDotR])
  );
}
