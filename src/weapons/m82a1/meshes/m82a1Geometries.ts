import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  applyM82ScopeUVs,
  applyM82UpperUVs,
  buildM82BipodGeometry,
  buildM82LowerReceiverGeometry,
  buildM82MagBodyGeometry,
  buildM82MagFloorplateGeometry,
  buildM82MagFollowerGeometry,
  buildM82MagSpringGeometry,
  buildM82PistolGripGeometry,
  buildM82RecoilSpringGeometry,
  buildM82SearGeometry,
  buildM82SelectorGeometry,
  buildM82StrikerGeometry,
  buildM82TriggerGeometry,
  M82_BOLT_STEEL,
  M82_BRIGHT_STEEL,
  M82_CHAMFER_STEEL,
  M82_COATED_LENS,
  M82_DARK_STEEL,
  M82_INNER_DARK,
  M82_PARKERIZED,
  M82_SCOPE_ANODIZED,
  M82_SORBOTHANE,
  M82_SPRING_STEEL,
  M82_TURRET_DRUM,
} from './m82a1ExtraGeometries';

// ============================================================================
// GROUP 1 ('slide'): RECOILING BARREL, ARROWHEAD BRAKE, UPPER, SCOPE & BOLT
// ============================================================================

/**
 * U-01: Iconic Murfreesboro Barrett Two-Chamber V-Arrowhead ("Tank") Muzzle Brake
 * (assembledPos: [31.6, 1.25, 0], spans local X ∈ [-1.06, +2.42] -> world X ∈ [30.54, 34.02])
 * Features:
 *  - Signature 2-chamber V-shaped arrowhead planform with swept-back rear wingtips
 *  - Distinct overhanging top & bottom horizontal baffle plates w/ equalizer vent slots
 *  - Deep 33° rearward-angled chevron gas expansion chambers & sharp central splitter baffle
 *  - Timing shim / peel-washer stack, hex jam nut, split-collar clamp bolts & .50 BMG rifled exit crown
 */
export function buildM82MuzzleBrakeGeometry(): THREE.BufferGeometry {
  // Core V-shaped arrowhead body in (X, Z), extruded across Y ∈ [-0.56, +0.56]
  const corePlan = new THREE.Shape();
  corePlan.moveTo(-0.26, -0.82); // Rear neck left
  corePlan.lineTo(-0.56, -1.48); // Swept-back rear wingtip left
  corePlan.lineTo(0.24, -1.68); // Max Ch.1 arrowhead width left
  corePlan.lineTo(0.52, -1.44); // Step notch between Ch.1 and Ch.2 left
  corePlan.lineTo(1.36, -1.34); // Ch.2 outer corner left
  corePlan.lineTo(2.4, -0.48); // Front V-nose apex left
  corePlan.lineTo(2.4, 0.48); // Front V-nose apex right
  corePlan.lineTo(1.36, 1.34); // Ch.2 outer corner right
  corePlan.lineTo(0.52, 1.44); // Step notch between Ch.1 and Ch.2 right
  corePlan.lineTo(0.24, 1.68); // Max Ch.1 arrowhead width right
  corePlan.lineTo(-0.56, 1.48); // Swept-back rear wingtip right
  corePlan.lineTo(-0.26, 0.82); // Rear neck right
  corePlan.closePath();

  const brakeCore = new THREE.ExtrudeGeometry(corePlan, {
    depth: 1.12,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  brakeCore.rotateX(Math.PI / 2);
  brakeCore.translate(0, 0.56, 0);
  paintGeometry(brakeCore, M82_PARKERIZED);

  // Distinct Top & Bottom Horizontal Baffle Plates (Y ∈ [±0.52, ±0.78]) framing the open side-vent chambers
  const platePlan = new THREE.Shape();
  platePlan.moveTo(-0.28, -0.86);
  platePlan.lineTo(-0.58, -1.54);
  platePlan.lineTo(0.26, -1.72);
  platePlan.lineTo(1.4, -1.36);
  platePlan.lineTo(2.42, -0.5);
  platePlan.lineTo(2.42, 0.5);
  platePlan.lineTo(1.4, 1.36);
  platePlan.lineTo(0.26, 1.72);
  platePlan.lineTo(-0.58, 1.54);
  platePlan.lineTo(-0.28, 0.86);
  platePlan.closePath();

  const topBafflePlate = new THREE.ExtrudeGeometry(platePlan, {
    depth: 0.25,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  topBafflePlate.rotateX(Math.PI / 2);
  topBafflePlate.translate(0, 0.77, 0);
  paintGeometry(topBafflePlate, M82_CHAMFER_STEEL);

  const botBafflePlate = new THREE.ExtrudeGeometry(platePlan, {
    depth: 0.25,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  botBafflePlate.rotateX(Math.PI / 2);
  botBafflePlate.translate(0, -0.52, 0);
  paintGeometry(botBafflePlate, M82_CHAMFER_STEEL);

  // Rear cylindrical threaded collar + bottom split-collar clamp block
  const rearCollar = paintGeometry(
    new THREE.CylinderGeometry(0.84, 0.84, 0.78, 28)
      .rotateZ(Math.PI / 2)
      .translate(-0.52, 0, 0),
    M82_PARKERIZED
  );
  const clampLug = paintGeometry(
    new THREE.BoxGeometry(0.74, 0.38, 0.68).translate(-0.54, -0.84, 0),
    M82_DARK_STEEL
  );

  const rawBrake = csgUnion([
    brakeCore,
    topBafflePlate,
    botBafflePlate,
    rearCollar,
    clampLug,
  ]);

  // CSG Cutters:
  // 1) Central .50 BMG bullet passage (R = 0.33), recessed front exit dish & rear threaded barrel socket (R = 0.59)
  // 2) Two deep 33° rearward-swept V-chambers piercing left (-Z) & right (+Z) between the top/bottom horizontal plates
  // 3) Top/bottom horizontal plate pressure-equalizing oblong slots & bottom clamp split kerf
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.33, 0.33, 4.1, 24)
        .rotateZ(Math.PI / 2)
        .translate(0.7, 0, 0),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.46, 0.33, 0.26, 24)
        .rotateZ(Math.PI / 2)
        .translate(2.36, 0, 0),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.59, 0.59, 0.92, 24)
        .rotateZ(Math.PI / 2)
        .translate(-0.66, 0, 0),
      M82_INNER_DARK
    ),
    // Split kerf along bottom clamping collar
    paintGeometry(
      new THREE.BoxGeometry(0.82, 0.55, 0.08).translate(-0.54, -0.82, 0),
      M82_INNER_DARK
    ),
  ];

  // Swept-back Chamber 1 (rear) & Chamber 2 (front) on Left (-1) and Right (+1), leaving a thick central V-baffle rib
  for (const side of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.74, 1.04, 1.85)
          .rotateY(side * 0.58)
          .translate(0.22, 0, side * 0.98),
        M82_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.68, 1.04, 1.62)
          .rotateY(side * 0.58)
          .translate(1.34, 0, side * 0.88),
        M82_INNER_DARK
      )
    );

    // Angled pressure-equalizing vent slots through top & bottom horizontal baffle plates
    for (const vx of [0.3, 1.38]) {
      cutters.push(
        paintGeometry(
          new THREE.BoxGeometry(0.38, 1.95, 0.24)
            .rotateY(side * 0.56)
            .translate(vx, 0, side * 0.68),
          M82_INNER_DARK
        )
      );
    }
  }

  const carved = csgSubtract(rawBrake, cutters);

  // Hexagonal barrel jam nut (X ∈ [-1.02, -0.86]), stainless timing shims / peel washer,
  // clamp socket bolts, and 8-groove rifling lands visible inside the front bore throat!
  const details: THREE.BufferGeometry[] = [
    carved,
    paintGeometry(
      new THREE.CylinderGeometry(0.86, 0.86, 0.16, 8)
        .rotateZ(Math.PI / 2)
        .translate(-0.95, 0, 0),
      M82_BOLT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.76, 0.76, 0.05, 28)
        .rotateZ(Math.PI / 2)
        .translate(-1.045, 0, 0),
      M82_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.75, 0.75, 0.035, 28)
        .rotateZ(Math.PI / 2)
        .translate(-0.85, 0, 0),
      M82_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.085, 0.085, 0.78, 12)
        .rotateX(Math.PI / 2)
        .translate(-0.72, -0.84, 0),
      M82_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.085, 0.085, 0.78, 12)
        .rotateX(Math.PI / 2)
        .translate(-0.36, -0.84, 0),
      M82_BRIGHT_STEEL
    ),
  ];

  // 8 subtle .50 BMG rifling lands inside the muzzle crown throat (X ∈ [-0.25, +0.25])
  for (let r = 0; r < 8; r++) {
    const ang = (r * Math.PI) / 4;
    details.push(
      paintGeometry(
        new THREE.BoxGeometry(0.65, 0.032, 0.055)
          .translate(0, 0.315, 0)
          .rotateX(ang),
        M82_BOLT_STEEL
      )
    );
  }

  return mergeParts(details);
}

/**
 * U-02: 29" Longitudinally Fluted Recoiling .50 BMG Heavy Match Barrel & Locking Collar
 * (assembledPos: [0, 1.25, 0], spans local X ∈ [+4.15, +31.45])
 * Features:
 *  - Stepped 29" (737mm) match contour w/ smooth front receiver bushing bearing journal (X ∈ [14.2, 16.95])
 *  - Keyed barrel locking collar w/ spanner notches at X ∈ [7.62, 8.26]
 *  - 8 deep longitudinal ball-endmill flutes on fore-barrel (X ∈ [17.25, 29.55]) & forend cooling zone (X ∈ [8.85, 13.85])
 *  - Recessed muzzle crown + 8-land 1:15" .50 BMG rifling lands & polished chamber throat
 */
export function buildM82BarrelGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.42, 4.15),
    new THREE.Vector2(0.86, 4.15), // Heavy breech & .50 BMG chamber journal inside barrel extension
    new THREE.Vector2(0.86, 7.58),
    new THREE.Vector2(0.94, 7.62), // Integral barrel locking / stop collar flange
    new THREE.Vector2(0.94, 8.24),
    new THREE.Vector2(0.79, 8.42), // Step ahead of barrel locking collar
    new THREE.Vector2(0.76, 14.1), // Rear fluted forend section (visible through upper vents)
    new THREE.Vector2(0.755, 14.25), // Precision cylindrical bearing journal riding in front bushing
    new THREE.Vector2(0.755, 16.95),
    new THREE.Vector2(0.735, 17.15), // Forward heavy match fluted contour
    new THREE.Vector2(0.71, 29.75),
    new THREE.Vector2(0.74, 29.92), // Muzzle swell & timing shim shoulder
    new THREE.Vector2(0.74, 30.58), // Abuts muzzle brake jam-nut/shims at 30.55
    new THREE.Vector2(0.58, 30.61), // Threaded 7/8"-14UNF muzzle tenon inside brake collar
    new THREE.Vector2(0.58, 31.45),
    new THREE.Vector2(0.38, 31.45),
    new THREE.Vector2(0.3, 31.32), // Recessed 11° target muzzle crown dish
  ];
  const outerLathe = new THREE.LatheGeometry(pts, 36);
  outerLathe.rotateZ(-Math.PI / 2);
  paintGeometry(outerLathe, M82_PARKERIZED);

  const cutters: THREE.BufferGeometry[] = [
    // Full-length 12.7mm (.50 cal) bore + bottleneck .50 BMG chamber cavity
    paintGeometry(
      new THREE.CylinderGeometry(0.285, 0.285, 28.0, 22)
        .rotateZ(Math.PI / 2)
        .translate(17.9, 0, 0),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.38, 0.49, 3.65, 22)
        .rotateZ(Math.PI / 2)
        .translate(5.98, 0, 0),
      M82_INNER_DARK
    ),
  ];

  // 8 deep longitudinal CNC flutes forward of front bushing + 8 aligned rear cooling flutes + spanner notches on locking collar
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);

    // Fore-barrel deep longitudinal flutes (X ∈ [17.35, 29.55])
    cutters.push(
      paintGeometry(
        new THREE.CapsuleGeometry(0.145, 11.9, 6, 12)
          .rotateZ(Math.PI / 2)
          .translate(23.45, cosA * 0.785, sinA * 0.785),
        M82_INNER_DARK
      )
    );

    // Forend cooling flutes inside ventilated upper receiver (X ∈ [8.85, 13.85])
    cutters.push(
      paintGeometry(
        new THREE.CapsuleGeometry(0.14, 4.7, 5, 10)
          .rotateZ(Math.PI / 2)
          .translate(11.35, cosA * 0.81, sinA * 0.81),
        M82_INNER_DARK
      )
    );

    // 4 spanner wrench notches at 90° around the barrel locking collar (X = 7.93)
    if (k % 2 === 0) {
      cutters.push(
        paintGeometry(
          new THREE.BoxGeometry(0.26, 0.22, 0.22)
            .translate(7.93, 0.94, 0)
            .rotateX(ang),
          M82_INNER_DARK
        )
      );
    }
  }

  const flutedBarrel = csgSubtract(outerLathe, cutters);

  const subParts: THREE.BufferGeometry[] = [
    flutedBarrel,
    // Polished stainless chamber feed throat collar & locking collar key ring
    paintGeometry(
      new THREE.TorusGeometry(0.58, 0.075, 10, 26)
        .rotateY(Math.PI / 2)
        .translate(4.18, 0, 0),
      M82_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.955, 0.955, 0.12, 28)
        .rotateZ(Math.PI / 2)
        .translate(7.68, 0, 0),
      M82_BOLT_STEEL
    ),
  ];

  // 8 internal .50 BMG rifling lands inside muzzle bore (X ∈ [28.6, 31.32])
  for (let r = 0; r < 8; r++) {
    const ang = (r * Math.PI) / 4 + 0.12;
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(2.65, 0.028, 0.05)
          .translate(29.96, 0.272, 0)
          .rotateX(ang),
        M82_BOLT_STEEL
      )
    );
  }

  return mergeParts(subParts);
}

/**
 * U-03: 3-Lug Locking Barrel Extension, Spring Anchor Collar & Accelerator Trip Lug
 * (assembledPos: [5.4, 1.25, 0], spans local X ∈ [-2.6, +2.2] -> world X ∈ [2.8, 7.6])
 */
export function buildM82BarrelExtensionGeometry(): THREE.BufferGeometry {
  const outerSleeve = paintGeometry(
    new THREE.CylinderGeometry(0.98, 0.98, 4.8, 30)
      .rotateZ(Math.PI / 2)
      .translate(-0.2, 0, 0),
    M82_DARK_STEEL
  );
  // Anti-rotation receiver guide keys + front twin barrel-spring anchor collar + bottom accelerator trip lug
  const keyRail = paintGeometry(
    new THREE.BoxGeometry(4.56, 0.42, 2.02).translate(-0.2, 0, 0),
    M82_DARK_STEEL
  );
  const springAnchorCollar = paintGeometry(
    new THREE.BoxGeometry(0.54, 0.62, 2.14).translate(1.92, 0, 0),
    M82_BOLT_STEEL
  );
  const acceleratorTripBlock = paintGeometry(
    new THREE.BoxGeometry(0.86, 0.44, 0.72).translate(-2.12, -0.88, 0),
    M82_DARK_STEEL
  );

  const solid = csgUnion([
    outerSleeve,
    keyRail,
    springAnchorCollar,
    acceleratorTripBlock,
  ]);

  // Hollow internal bore + 3-lug raceway channels + right ejection relief + polished dual feed ramp
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.68, 0.68, 5.2, 26)
        .rotateZ(Math.PI / 2)
        .translate(-0.2, 0, 0),
      M82_INNER_DARK
    ),
    // Internal locking lug abutment ring pocket (X_local ∈ [-1.65, -0.75])
    paintGeometry(
      new THREE.CylinderGeometry(0.83, 0.83, 0.92, 26)
        .rotateZ(Math.PI / 2)
        .translate(-1.2, 0, 0),
      M82_INNER_DARK
    ),
    // Right-side extractor/ejection clearance cutout
    paintGeometry(
      new THREE.BoxGeometry(1.65, 0.78, 0.85).translate(-1.55, 0.14, 0.68),
      M82_INNER_DARK
    ),
    // Bolt cam-pin entry clearance slot
    paintGeometry(
      new THREE.BoxGeometry(1.35, 0.48, 0.48)
        .rotateY(-0.38)
        .translate(-1.85, 0.68, 0.12),
      M82_INNER_DARK
    ),
    // Polished .50 BMG feed ramp throat at bottom rear
    paintGeometry(
      new THREE.BoxGeometry(1.48, 0.68, 0.94)
        .rotateZ(0.38)
        .translate(-2.08, -0.68, 0),
      M82_BRIGHT_STEEL
    ),
  ];

  // Three 120°-spaced rear bolt-lug entry raceways (X_local ∈ [-2.75, -1.55])
  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI * 2) / 3 + Math.PI / 2;
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.28, 0.46, 0.44)
          .translate(-2.12, 0.64, 0)
          .rotateX(ang),
        M82_INNER_DARK
      )
    );
  }

  const extensionBody = csgSubtract(solid, cutters);

  // Left & Right stainless spring-anchor pins at X_local = +1.96 (world X = 7.36), Z = ±0.84
  const anchorPinL = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.68, 12).translate(
      1.96,
      0,
      -0.84
    ),
    M82_BRIGHT_STEEL
  );
  const anchorPinR = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.68, 12).translate(1.96, 0, 0.84),
    M82_BRIGHT_STEEL
  );

  return mergeParts([extensionBody, anchorPinL, anchorPinR]);
}

/**
 * U-04: Twin Parallel Heavy Barrel Return Tension Springs, Threaded Plugs & Anchor Hooks
 * (assembledPos: [11.5, 1.25, 0], spans local X ∈ [-4.12, +4.12] -> world X ∈ [7.38, 15.62])
 * Stretches cleanly along X during the ~2.4-unit short-recoil barrel stroke and pulls the barrel back into battery!
 */
export function buildM82BarrelSpringsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const zPos = side * 0.84;
    parts.push(
      paintGeometry(
        createHelicalSpring({
          axis: 'x',
          start: -3.78,
          end: 3.78,
          centerY: 0,
          centerZ: zPos,
          coilRadius: 0.225,
          wireRadius: 0.048,
          coils: 26,
          radialSegments: 8,
          tubularSegmentsPerCoil: 14,
        }),
        M82_SPRING_STEEL
      ),
      // Threaded steel spring end-plugs screwed into coil ends
      paintGeometry(
        new THREE.CylinderGeometry(0.18, 0.21, 0.34, 16)
          .rotateZ(Math.PI / 2)
          .translate(-3.86, 0, zPos),
        M82_BOLT_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.21, 0.18, 0.34, 16)
          .rotateZ(Math.PI / 2)
          .translate(3.86, 0, zPos),
        M82_BOLT_STEEL
      ),
      // Formed steel tension hook eyes engaging barrel collar (rear) & front bushing ears (front)
      paintGeometry(
        new THREE.TorusGeometry(0.17, 0.046, 8, 18).translate(-4.1, 0, zPos),
        M82_BRIGHT_STEEL
      ),
      paintGeometry(
        new THREE.TorusGeometry(0.17, 0.046, 8, 18).translate(4.1, 0, zPos),
        M82_BRIGHT_STEEL
      )
    );
  }
  return mergeParts(parts);
}

/**
 * U-05: Ventilated Stamped Sheet-Steel Upper Receiver, Oblong Cooling Vents,
 * Full-Length 27-MOA M1913 Top Rail & Folding Front/Rear Backup Iron Sights
 * (assembledPos: [0, 0, 0], isShell: true)
 * Spans X ∈ [-20.8, +16.5], Y ∈ [+0.20, +2.74], Z ∈ [-1.18, +1.18] — mates 100% flush with Lower at Y = +0.20!
 */
export function buildM82UpperReceiverGeometry(): THREE.BufferGeometry {
  // Authentic Murfreesboro octagonal folded sheet-steel upper receiver cross-section in (Z, Y)
  const crossSec = new THREE.Shape();
  crossSec.moveTo(-1.16, 0.2); // Bottom left split seam (flush w/ lower at Y = +0.20)
  crossSec.lineTo(-1.16, 1.78); // Vertical left wall
  crossSec.lineTo(-0.76, 2.42); // Angled upper-left octagonal shoulder
  crossSec.lineTo(0.76, 2.42); // Flat roof deck under 27-MOA Picatinny rail
  crossSec.lineTo(1.16, 1.78); // Angled upper-right octagonal shoulder
  crossSec.lineTo(1.16, 0.2); // Vertical right wall
  crossSec.closePath();

  const rawUpper = new THREE.ExtrudeGeometry(crossSec, {
    depth: 37.3,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  rawUpper.rotateY(Math.PI / 2);
  rawUpper.translate(-20.8, 0, 0);
  paintGeometry(rawUpper, M82_PARKERIZED);

  // Hollow interior tunnel + massive .50 BMG right-side ejection port + charging handle slot + 28 oblong cooling vents
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(36.7, 2.02, 1.94).translate(-2.15, 1.15, 0),
      M82_INNER_DARK
    ),
    // Front barrel passage bore
    paintGeometry(
      new THREE.CylinderGeometry(0.82, 0.82, 2.2, 24)
        .rotateZ(Math.PI / 2)
        .translate(16.1, 1.25, 0),
      M82_INNER_DARK
    ),
    // Massive 12.7x99mm (.50 BMG) Right-Side Ejection Port (X ∈ [2.15, 7.85])
    paintGeometry(
      new THREE.BoxGeometry(5.7, 1.24, 1.1).translate(5.0, 1.32, 0.85),
      M82_INNER_DARK
    ),
    // Right-Side Reciprocating Charging Handle Track Slot (X ∈ [-7.05, 2.25], clears full -7.60u carrier stroke!)
    paintGeometry(
      new THREE.BoxGeometry(9.3, 0.5, 1.1).translate(-2.4, 1.25, 0.85),
      M82_INNER_DARK
    ),
  ];

  // Signature Barrett Ventilated Forend: 2 rows x 7 true oblong stadium cooling vents per side (28 total, X ∈ [8.35, 15.35])!
  for (let i = 0; i < 7; i++) {
    const vx = 8.5 + i * 1.1;
    // Upper sloped-shoulder row of oblong vents
    cutters.push(
      paintGeometry(
        new THREE.CapsuleGeometry(0.18, 0.42, 4, 10)
          .rotateZ(Math.PI / 2)
          .scale(1, 1, 8.5)
          .translate(vx, 1.98, 0),
        M82_INNER_DARK
      )
    );
    // Lower side-wall row of oblong vents
    cutters.push(
      paintGeometry(
        new THREE.CapsuleGeometry(0.19, 0.46, 4, 10)
          .rotateZ(Math.PI / 2)
          .scale(1, 1, 8.5)
          .translate(vx, 1.06, 0),
        M82_INNER_DARK
      )
    );
  }

  const upperShell = csgSubtract(rawUpper, cutters);
  const subParts: THREE.BufferGeometry[] = [upperShell];

  // Welded lower split-seam reinforcement strips along left & right edges
  for (const side of [-1, 1]) {
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(36.2, 0.14, 0.06).translate(
          -2.2,
          0.28,
          side * 1.17
        ),
        M82_DARK_STEEL
      )
    );
  }

  // Front Nylatron-lined barrel guide bushing collar (X = +16.28, Y = +1.25) + internal spring anchor blocks
  const bushingOuter = paintGeometry(
    new THREE.CylinderGeometry(1.03, 1.05, 0.78, 28)
      .rotateZ(Math.PI / 2)
      .translate(16.28, 1.25, 0),
    M82_DARK_STEEL
  );
  const bushingHole = paintGeometry(
    new THREE.CylinderGeometry(0.765, 0.765, 1.15, 26)
      .rotateZ(Math.PI / 2)
      .translate(16.28, 1.25, 0),
    M82_INNER_DARK
  );
  subParts.push(
    csgSubtract(bushingOuter, [bushingHole]),
    paintGeometry(
      new THREE.TorusGeometry(0.84, 0.055, 8, 24)
        .rotateY(Math.PI / 2)
        .translate(16.66, 1.25, 0),
      M82_SORBOTHANE
    )
  );
  for (const side of [-1, 1]) {
    subParts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.085, 0.085, 0.56, 10).translate(
          15.62,
          1.25,
          side * 0.84
        ),
        M82_BRIGHT_STEEL
      )
    );
  }

  // Full-Length 27-MOA MIL-STD-1913 Picatinny Top Rail (X ∈ [-14.4, +15.85], Y ∈ [2.42, 2.74])
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(30.3, 0.18, 0.86).translate(0.72, 2.5, 0),
      M82_DARK_STEEL
    )
  );
  for (let s = 0; s < 36; s++) {
    const rx = -13.95 + s * 0.84;
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.46, 0.16, 1.08).translate(rx, 2.66, 0),
        M82_CHAMFER_STEEL
      )
    );
  }

  // 1) Folding Hooded Backup Front Iron Sight at X = +15.35 (pivot base, detent pin, protective hood & post)
  const frontHoodOuter = paintGeometry(
    new THREE.CylinderGeometry(0.39, 0.39, 0.54, 22)
      .rotateZ(Math.PI / 2)
      .translate(15.35, 3.18, 0),
    M82_DARK_STEEL
  );
  const frontHoodHole = paintGeometry(
    new THREE.CylinderGeometry(0.29, 0.29, 0.78, 20)
      .rotateZ(Math.PI / 2)
      .translate(15.35, 3.18, 0),
    M82_INNER_DARK
  );
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.76, 0.24, 0.88).translate(15.35, 2.82, 0),
      M82_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.08, 0.08, 0.96, 12)
        .rotateX(Math.PI / 2)
        .translate(15.35, 2.82, 0),
      M82_BRIGHT_STEEL
    ),
    csgSubtract(frontHoodOuter, [frontHoodHole]),
    paintGeometry(
      new THREE.CylinderGeometry(0.042, 0.055, 0.34, 10).translate(
        15.35,
        3.09,
        0
      ),
      M82_BRIGHT_STEEL
    )
  );

  // 2) Folding Rear Backup Peep Iron Sight at X = -13.8 (hinge base, windage knob & folded peep aperture leaf)
  const rearLeafRaw = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.16, 0.56).translate(-14.32, 2.94, 0),
    M82_PARKERIZED
  );
  const rearPeepHole = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.36, 14).translate(-14.68, 2.94, 0),
    M82_INNER_DARK
  );
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.84, 0.24, 0.92).translate(-13.8, 2.84, 0),
      M82_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 1.18, 16)
        .rotateX(Math.PI / 2)
        .translate(-13.8, 2.88, 0),
      M82_BRIGHT_STEEL
    ),
    csgSubtract(rearLeafRaw, [rearPeepHole])
  );

  // Angled steel brass deflector block behind right-side .50 BMG ejection port
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.82, 0.96, 0.34)
        .rotateY(0.38)
        .translate(1.82, 1.32, 1.16),
      M82_DARK_STEEL
    )
  );

  return applyM82UpperUVs(mergeParts(subParts));
}

/**
 * U-06: Detachable Folding Heavy-Duty Carry Handle (clamped to Picatinny rail at assembledPos: [10.8, 2.74, 0])
 * Folded outward-right at 52° so sniper sightline & 50mm Leupold sunshade are 100% unobstructed!
 */
export function buildM82CarryHandleGeometry(): THREE.BufferGeometry {
  // Quick-detach Picatinny rail clamp base w/ dual recoil cross-bolts & knurled left thumb-nuts
  const railClamp = paintGeometry(
    new THREE.BoxGeometry(2.35, 0.38, 1.26).translate(0.1, 0.1, 0),
    M82_DARK_STEEL
  );
  const hingeClevis = paintGeometry(
    new THREE.BoxGeometry(2.25, 0.34, 0.42).translate(0.1, 0.24, 0.62),
    M82_PARKERIZED
  );
  const subParts: THREE.BufferGeometry[] = [railClamp, hingeClevis];

  for (const bx of [-0.55, 0.75]) {
    subParts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.11, 0.11, 1.48, 12)
          .rotateX(Math.PI / 2)
          .translate(bx, 0.08, 0),
        M82_BRIGHT_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.24, 0.24, 0.22, 6)
          .rotateX(Math.PI / 2)
          .translate(bx, 0.08, -0.72),
        M82_BRIGHT_STEEL
      )
    );
  }

  // Folding twin steel bail rods + iconic 5-groove thermally insulated Barrett carry grip
  const bailGroup: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.115, 0.115, 1.52, 14).translate(
        -0.82,
        0.74,
        0
      ),
      M82_PARKERIZED
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.115, 0.115, 1.52, 14).translate(
        2.12,
        0.74,
        0
      ),
      M82_PARKERIZED
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.115, 0.115, 3.16, 14)
        .rotateZ(Math.PI / 2)
        .translate(0.65, 1.46, 0),
      M82_PARKERIZED
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.33, 0.33, 2.52, 22)
        .rotateZ(Math.PI / 2)
        .translate(0.65, 1.46, 0),
      M82_SORBOTHANE
    ),
  ];
  for (let r = -2; r <= 2; r++) {
    bailGroup.push(
      paintGeometry(
        new THREE.TorusGeometry(0.35, 0.058, 10, 20)
          .rotateY(Math.PI / 2)
          .translate(0.65 + r * 0.45, 1.46, 0),
        M82_DARK_STEEL
      )
    );
  }

  const bailMerged = mergeParts(bailGroup);
  bailMerged.rotateX(0.92);
  bailMerged.translate(0, 0.24, 0.56);
  subParts.push(bailMerged);

  return mergeParts(subParts);
}

/**
 * U-07: Leupold Mark 4 LR/T 4.5-14x50mm M1 Tactical Scope w/ Threaded Sunshade,
 * Coated Glass Lenses & 0..15 MIL M1 Turrets
 * (assembledPos: [1.8, 4.10, 0], spans local X ∈ [-7.4, +7.85] -> world X ∈ [-5.6, +9.65])
 */
export function buildM82ScopeGeometry(): THREE.BufferGeometry {
  // External optical housing + threaded 2.5" anti-glare sunshade (seam step at X_local = +5.92)
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.68, -7.4), // Rear rubberized fast-focus eyepiece rim
    new THREE.Vector2(0.83, -7.4),
    new THREE.Vector2(0.83, -7.08),
    new THREE.Vector2(0.8, -7.02), // Diopter lock ring step
    new THREE.Vector2(0.82, -5.55), // Ocular bell
    new THREE.Vector2(0.66, -5.1),
    new THREE.Vector2(0.75, -4.85), // Knurled 4.5-14x magnification power ring
    new THREE.Vector2(0.75, -4.32),
    new THREE.Vector2(0.56, -4.14), // 30mm Main Tube (rear ring at X_local = -3.35)
    new THREE.Vector2(0.56, 3.65), // 30mm Main Tube (front ring at X_local = +3.05)
    new THREE.Vector2(0.89, 4.95), // Flared objective cone
    new THREE.Vector2(1.08, 5.52), // 50mm Objective Bell (Leupold Gold Ring band)
    new THREE.Vector2(1.08, 5.9),
    new THREE.Vector2(1.045, 5.93), // Threaded sunshade seam groove
    new THREE.Vector2(1.075, 5.97), // 2.5" Screw-in Anti-Glare Sunshade
    new THREE.Vector2(1.075, 7.85),
    new THREE.Vector2(0.94, 7.85), // Thin machined front sunshade lip
  ];
  const outerTube = new THREE.LatheGeometry(pts, 36);
  outerTube.rotateZ(-Math.PI / 2);
  paintGeometry(outerTube, M82_SCOPE_ANODIZED);

  // Deep recessed sunshade baffle cavity (lens inset at X_local = +5.78 inside objective bell!) + rear ocular recess
  const frontRecess = paintGeometry(
    new THREE.CylinderGeometry(0.96, 0.95, 2.15, 30)
      .rotateZ(Math.PI / 2)
      .translate(6.88, 0, 0),
    M82_INNER_DARK
  );
  const rearRecess = paintGeometry(
    new THREE.CylinderGeometry(0.68, 0.68, 0.38, 26)
      .rotateZ(Math.PI / 2)
      .translate(-7.28, 0, 0),
    M82_INNER_DARK
  );
  const hollowedScope = csgSubtract(outerTube, [frontRecess, rearRecess]);

  // Rounded-square Leupold Mark 4 erector saddle block at X_local = -0.3
  const saddleBlock = paintGeometry(
    new THREE.SphereGeometry(0.76, 24, 18)
      .scale(1.18, 1.02, 1.02)
      .translate(-0.3, 0, 0),
    M82_SCOPE_ANODIZED
  );

  // Tall Leupold M1 Tactical Elevation Turret (Y_local ∈ [0.62, 1.54]) -> mapped to white 0..15 MIL graduations
  const elevTurret = paintGeometry(
    new THREE.CylinderGeometry(0.49, 0.51, 0.86, 30).translate(-0.3, 1.04, 0),
    M82_TURRET_DRUM
  );
  const elevKnurlCrown = paintGeometry(
    new THREE.CylinderGeometry(0.53, 0.49, 0.2, 30).translate(-0.3, 1.5, 0),
    M82_SCOPE_ANODIZED
  );

  // Right M1 Tactical Windage Turret (Z ∈ [0.62, 1.42]) -> mapped to white 0..15 MIL graduations
  const windTurret = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.47, 0.76, 28)
      .rotateX(Math.PI / 2)
      .translate(-0.3, 0, 0.98),
    M82_TURRET_DRUM
  );
  const windKnurlCrown = paintGeometry(
    new THREE.CylinderGeometry(0.49, 0.45, 0.18, 28)
      .rotateX(Math.PI / 2)
      .translate(-0.3, 0, 1.38),
    M82_SCOPE_ANODIZED
  );

  // Left Side-Focus Parallax Turret & Cap (Z ∈ [-1.34, -0.60])
  const parallaxTurret = paintGeometry(
    new THREE.CylinderGeometry(0.43, 0.45, 0.66, 26)
      .rotateX(Math.PI / 2)
      .translate(-0.3, 0, -0.93),
    M82_TURRET_DRUM
  );
  const parallaxCap = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.43, 0.14, 26)
      .rotateX(Math.PI / 2)
      .translate(-0.3, 0, -1.28),
    M82_SCOPE_ANODIZED
  );

  // Power magnification throw fin & zero-index boss
  const powerFin = paintGeometry(
    new THREE.BoxGeometry(0.34, 0.3, 0.18)
      .rotateX(-0.65)
      .translate(-4.58, 0.8, -0.46),
    M82_SCOPE_ANODIZED
  );

  // Convex Multi-Coated Blue-Green Optical Glass Lenses (50mm objective recessed behind sunshade & rear ocular)
  const frontLens = paintGeometry(
    new THREE.SphereGeometry(0.95, 28, 20)
      .scale(0.18, 1.0, 1.0)
      .translate(5.86, 0, 0),
    M82_COATED_LENS
  );
  const rearLens = paintGeometry(
    new THREE.SphereGeometry(0.68, 24, 18)
      .scale(0.16, 1.0, 1.0)
      .translate(-7.14, 0, 0),
    M82_COATED_LENS
  );

  const merged = mergeParts([
    hollowedScope,
    saddleBlock,
    elevTurret,
    elevKnurlCrown,
    windTurret,
    windKnurlCrown,
    parallaxTurret,
    parallaxCap,
    powerFin,
    frontLens,
    rearLens,
  ]);
  return applyM82ScopeUVs(merged);
}

/**
 * U-08: Barrett Ultra-High Heavy-Duty 6-Screw 30mm Tactical Scope Rings
 * (assembledPos: [1.8, 2.74, 0])
 * Base clamps flush to M1913 rail at Y_local = 0 (world 2.74); 30mm bore centers at Y_local = +1.36 (world 4.10)!
 */
export function buildM82ScopeRingsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (const rx of [-3.35, 3.05]) {
    const baseBlock = paintGeometry(
      new THREE.BoxGeometry(1.36, 0.96, 1.34).translate(rx, 0.36, 0),
      M82_DARK_STEEL
    );
    const recoilLug = paintGeometry(
      new THREE.BoxGeometry(0.36, 0.18, 1.08).translate(rx, -0.06, 0),
      M82_DARK_STEEL
    );
    const ringOuter = paintGeometry(
      new THREE.CylinderGeometry(0.84, 0.84, 1.32, 30)
        .rotateZ(Math.PI / 2)
        .translate(rx, 1.36, 0),
      M82_DARK_STEEL
    );
    const capFlange = paintGeometry(
      new THREE.BoxGeometry(1.32, 0.26, 1.92).translate(rx, 1.36, 0),
      M82_CHAMFER_STEEL
    );
    const ringSolid = csgUnion([baseBlock, recoilLug, ringOuter, capFlange]);

    const scopeBore = paintGeometry(
      new THREE.CylinderGeometry(0.565, 0.565, 1.65, 30)
        .rotateZ(Math.PI / 2)
        .translate(rx, 1.36, 0),
      M82_INNER_DARK
    );
    const capSplitGap = paintGeometry(
      new THREE.BoxGeometry(1.45, 0.04, 2.05).translate(rx, 1.36, 0),
      M82_INNER_DARK
    );
    const weightHole = paintGeometry(
      new THREE.CylinderGeometry(0.2, 0.2, 1.6, 16)
        .rotateX(Math.PI / 2)
        .translate(rx, 0.5, 0),
      M82_INNER_DARK
    );
    parts.push(csgSubtract(ringSolid, [scopeBore, capSplitGap, weightHole]));

    // Heavy 1/2" hex rail clamp nut + 6 stainless Torx cap screws (3 per side)
    parts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.22, 0.22, 1.62, 6)
          .rotateX(Math.PI / 2)
          .translate(rx, 0.1, 0),
        M82_BRIGHT_STEEL
      )
    );
    for (const sx of [-0.42, 0, 0.42]) {
      for (const sz of [-0.78, 0.78]) {
        parts.push(
          paintGeometry(
            new THREE.CylinderGeometry(0.072, 0.072, 0.36, 10).translate(
              rx + sx,
              1.42,
              sz
            ),
            M82_BRIGHT_STEEL
          )
        );
      }
    }
  }

  return mergeParts(parts);
}

/**
 * U-09: Machined Steel Bolt Carrier w/ Helical Cam Slot, Accelerator Arm Linkage Clevis & Charging Handle
 * (assembledPos: [-1.2, 1.25, 0], spans local X ∈ [-5.42, +3.60] -> world X ∈ [-6.62, +2.40])
 */
export function buildM82BoltCarrierGeometry(): THREE.BufferGeometry {
  const mainBlock = paintGeometry(
    new THREE.BoxGeometry(8.25, 1.38, 1.58).translate(-0.68, 0, 0),
    M82_DARK_STEEL
  );
  const rearBufferTail = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.58, 1.44, 24)
      .rotateZ(Math.PI / 2)
      .translate(-5.0, 0, 0),
    M82_BOLT_STEEL
  );
  // Downward rear accelerator linkage clevis ears around X_local = -2.20 (world X = -3.40)
  const accelClevis = paintGeometry(
    new THREE.BoxGeometry(1.12, 0.62, 1.24).translate(-2.2, -0.66, 0),
    M82_DARK_STEEL
  );
  const rawCarrier = csgUnion([mainBlock, rearBufferTail, accelClevis]);

  // Bolt stem bore + helical cam slot + side receiver guide rails + accelerator linkage slot + striker slot
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.53, 0.53, 4.9, 24)
        .rotateZ(Math.PI / 2)
        .translate(1.5, 0, 0),
      M82_INNER_DARK
    ),
    // Helical cam-pin track driving 60° 3-lug bolt rotation
    paintGeometry(
      new THREE.BoxGeometry(1.62, 0.56, 0.52)
        .rotateY(0.52)
        .translate(2.05, 0.58, 0.16),
      M82_INNER_DARK
    ),
    // Left & right longitudinal guide rail channels
    paintGeometry(
      new THREE.BoxGeometry(6.8, 0.38, 0.28).translate(-1.0, 0.2, -0.82),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(5.2, 0.38, 0.28).translate(-1.8, 0.2, 0.82),
      M82_INNER_DARK
    ),
    // Full-length bottom clearance channel (X_local ∈ [-4.95, +3.65], roof worldY = +0.97) so recoiling carrier glides cleanly over upright striker (worldY <= +0.85)
    paintGeometry(
      new THREE.BoxGeometry(8.6, 0.82, 0.64).translate(-0.65, -0.69, 0),
      M82_INNER_DARK
    ),
    // Upper pocket around X_local = -2.25 housing the accelerator arm upper linkage roller
    paintGeometry(
      new THREE.BoxGeometry(1.45, 1.22, 0.64).translate(-2.25, -0.15, 0),
      M82_INNER_DARK
    ),
  ];

  const carrierBody = csgSubtract(rawCarrier, cutters);

  // Heavy cylindrical grooved Right-Side Charging Handle + stainless accelerator linkage cross-pin
  const subParts: THREE.BufferGeometry[] = [
    carrierBody,
    paintGeometry(
      new THREE.CylinderGeometry(0.19, 0.23, 0.56, 16)
        .rotateX(Math.PI / 2)
        .translate(2.35, 0, 0.98),
      M82_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.29, 0.29, 0.86, 22)
        .rotateX(Math.PI / 2)
        .translate(2.35, 0, 1.6),
      M82_PARKERIZED
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.14, 0.14, 1.32, 14)
        .rotateX(Math.PI / 2)
        .translate(-2.2, -0.73, 0),
      M82_BRIGHT_STEEL
    ),
  ];
  for (const gz of [1.32, 1.52, 1.72, 1.9]) {
    subParts.push(
      paintGeometry(
        new THREE.TorusGeometry(0.295, 0.024, 8, 20)
          .rotateX(Math.PI / 2)
          .translate(2.35, 0, gz),
        M82_BOLT_STEEL
      )
    );
  }

  return mergeParts(subParts);
}

/**
 * U-10: Short-Recoil Momentum-Transfer Accelerator Arm Linkage ('加速子')
 * (assembledPos: [-3.4, 0.52, 0])
 * Pivots at local (0, 0, 0): struck by recoiling Barrel Extension, upper roller nose swings rearward (-X, rz > 0)
 * multiplying Bolt Carrier rearward velocity while barrel decelerates!
 */
export function buildM82AcceleratorGeometry(): THREE.BufferGeometry {
  const axlePin = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.48, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M82_BRIGHT_STEEL
  );

  const armShape = new THREE.Shape();
  armShape.moveTo(-0.28, -0.32); // Lower receiver-stop abutment toe
  armShape.lineTo(0.26, -0.26);
  armShape.quadraticCurveTo(0.46, 0.42, 0.3, 1.16); // Hardened S-curve cam face struck by barrel extension
  armShape.lineTo(-0.18, 1.1); // Rear carrier-catapulting linkage nose
  armShape.quadraticCurveTo(-0.24, 0.42, -0.28, -0.32);
  armShape.closePath();

  const lever = new THREE.ExtrudeGeometry(armShape, {
    depth: 0.5,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  lever.translate(0, 0, -0.25);
  paintGeometry(lever, M82_BRIGHT_STEEL);

  const upperLinkRoller = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 0.58, 16)
      .rotateX(Math.PI / 2)
      .translate(0.06, 1.04, 0),
    M82_BOLT_STEEL
  );

  const torsionSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.48,
      end: 0.48,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.24,
      wireRadius: 0.032,
      coils: 6,
    }).rotateX(Math.PI / 2),
    M82_SPRING_STEEL
  );

  return mergeParts([axlePin, lever, upperLinkRoller, torsionSpring]);
}

/**
 * U-11: Triangular 3-Lug Rotating .50 BMG Bolt Head, Heavy Claw Extractor & Dual Plunger Ejectors
 * (assembledPos: [2.4, 1.25, 0], spans local X ∈ [-1.85, +1.80] -> world X ∈ [0.55, 4.20])
 */
export function buildM82BoltGeometry(): THREE.BufferGeometry {
  const stem = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.48, 3.15, 26)
      .rotateZ(Math.PI / 2)
      .translate(-0.26, 0, 0),
    M82_BRIGHT_STEEL
  );

  // Rounded equilateral-triangular 3-lug .50 BMG bolt head profile in (Z, Y) extruded along X ∈ [1.02, 1.80]
  const triHead = new THREE.Shape();
  const lugCount = 3;
  const rOuter = 0.82;
  const rRoot = 0.57;
  for (let i = 0; i < lugCount; i++) {
    const baseAng = (i * Math.PI * 2) / 3 - Math.PI / 2;
    const a0 = baseAng - 0.36;
    const a1 = baseAng - 0.24;
    const a2 = baseAng + 0.24;
    const a3 = baseAng + 0.36;
    const nextRoot = baseAng + (Math.PI * 2) / 3 - 0.36;

    const p0z = Math.cos(a0) * rRoot;
    const p0y = Math.sin(a0) * rRoot;
    if (i === 0) triHead.moveTo(p0z, p0y);
    else triHead.lineTo(p0z, p0y);

    triHead.lineTo(Math.cos(a1) * rOuter, Math.sin(a1) * rOuter);
    triHead.quadraticCurveTo(
      Math.cos(baseAng) * (rOuter + 0.055),
      Math.sin(baseAng) * (rOuter + 0.055),
      Math.cos(a2) * rOuter,
      Math.sin(a2) * rOuter
    );
    triHead.lineTo(Math.cos(a3) * rRoot, Math.sin(a3) * rRoot);
    triHead.quadraticCurveTo(
      Math.cos(baseAng + Math.PI / 3) * (rRoot * 1.03),
      Math.sin(baseAng + Math.PI / 3) * (rRoot * 1.03),
      Math.cos(nextRoot) * rRoot,
      Math.sin(nextRoot) * rRoot
    );
  }
  triHead.closePath();

  const headGeo = new THREE.ExtrudeGeometry(triHead, {
    depth: 0.78,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  headGeo.rotateY(Math.PI / 2);
  headGeo.translate(1.02, 0, 0);
  paintGeometry(headGeo, M82_BRIGHT_STEEL);

  // Helical Bolt Cam Pin + rectangular cam guide shoe at X_local = -0.35, Y = +0.58
  const camPin = paintGeometry(
    new THREE.CylinderGeometry(0.17, 0.17, 0.58, 16).translate(-0.35, 0.56, 0),
    M82_DARK_STEEL
  );
  const camShoe = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.16, 0.38).translate(-0.35, 0.82, 0),
    M82_BOLT_STEEL
  );

  const solidBolt = mergeParts([stem, headGeo, camPin, camShoe]);

  // Recessed .50 BMG bolt face cup (20.4mm rim!) + firing-pin aperture + right extractor pocket
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.45, 0.45, 0.22, 24)
        .rotateZ(Math.PI / 2)
        .translate(1.74, 0, 0),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.08, 0.08, 0.6, 12)
        .rotateZ(Math.PI / 2)
        .translate(1.62, 0, 0),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(1.22, 0.32, 0.28).translate(1.24, 0.08, 0.56),
      M82_INNER_DARK
    ),
  ];
  const hollowedBolt = csgSubtract(solidBolt, cutters);

  // Heavy right-side pivoting Claw Extractor + Dual left bolt-face Plunger Ejectors
  const extractor = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.26, 0.22).translate(1.22, 0.08, 0.54),
    M82_DARK_STEEL
  );
  const extractorHook = paintGeometry(
    new THREE.BoxGeometry(0.14, 0.28, 0.18).translate(1.76, 0.08, 0.44),
    M82_DARK_STEEL
  );
  const ejectorTop = paintGeometry(
    new THREE.CylinderGeometry(0.072, 0.072, 0.26, 12)
      .rotateZ(Math.PI / 2)
      .translate(1.68, 0.15, -0.24),
    M82_BOLT_STEEL
  );
  const ejectorBot = paintGeometry(
    new THREE.CylinderGeometry(0.072, 0.072, 0.26, 12)
      .rotateZ(Math.PI / 2)
      .translate(1.68, -0.15, -0.24),
    M82_BOLT_STEEL
  );

  return mergeParts([
    hollowedBolt,
    extractor,
    extractorHook,
    ejectorTop,
    ejectorBot,
  ]);
}

/**
 * U-12: Heavy Two-Piece Stepped Firing Pin, Cocking Tang & Helical Rebound/Drive Spring
 * (assembledPos: [0.6, 1.25, 0], spans local X ∈ [-4.2, +3.55] -> world X ∈ [-3.6, +4.15])
 */
export function buildM82FiringPinGeometry(): THREE.BufferGeometry {
  const rearStrikeHead = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.24, 0.42, 20)
      .rotateZ(Math.PI / 2)
      .translate(-3.98, 0, 0),
    M82_BRIGHT_STEEL
  );
  const rearCollar = paintGeometry(
    new THREE.CylinderGeometry(0.23, 0.23, 0.78, 18)
      .rotateZ(Math.PI / 2)
      .translate(-3.45, 0, 0),
    M82_BOLT_STEEL
  );
  // Downward cocking tang at X_local = -2.85 (world X = -2.25) engaging upright Linear Striker!
  const cockingTang = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.62, 0.28).translate(-2.85, -0.44, 0),
    M82_BRIGHT_STEEL
  );
  const mainShaft = paintGeometry(
    new THREE.CylinderGeometry(0.145, 0.165, 5.1, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.55, 0, 0),
    M82_BRIGHT_STEEL
  );
  const stopFlange = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 0.16, 18)
      .rotateZ(Math.PI / 2)
      .translate(0.75, 0, 0),
    M82_DARK_STEEL
  );
  const strikerNeedle = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.14, 1.58, 16)
      .rotateZ(Math.PI / 2)
      .translate(2.76, 0, 0),
    M82_BRIGHT_STEEL
  );
  const driveSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -3.05,
      end: 0.66,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.25,
      wireRadius: 0.042,
      coils: 18,
    }),
    M82_SPRING_STEEL
  );

  return mergeParts([
    rearStrikeHead,
    rearCollar,
    cockingTang,
    mainShaft,
    stopFlange,
    strikerNeedle,
    driveSpring,
  ]);
}

/**
 * Complete map of all 24 Barrett M82A1 part IDs -> procedural/CSG BufferGeometry builders
 */
export const M82A1_GEOMETRY_BUILDERS: Record<
  string,
  () => THREE.BufferGeometry
> = {
  // 1. Recoiling Barrel, Arrowhead Muzzle Brake, Upper, Optics & Bolt Group ('slide' · 12)
  m82a1_muzzle_brake: buildM82MuzzleBrakeGeometry,
  m82a1_barrel: buildM82BarrelGeometry,
  m82a1_barrel_extension: buildM82BarrelExtensionGeometry,
  m82a1_barrel_springs: buildM82BarrelSpringsGeometry,
  m82a1_upper_receiver: buildM82UpperReceiverGeometry,
  m82a1_carry_handle: buildM82CarryHandleGeometry,
  m82a1_scope: buildM82ScopeGeometry,
  m82a1_scope_rings: buildM82ScopeRingsGeometry,
  m82a1_bolt_carrier: buildM82BoltCarrierGeometry,
  m82a1_accelerator: buildM82AcceleratorGeometry,
  m82a1_bolt: buildM82BoltGeometry,
  m82a1_firing_pin: buildM82FiringPinGeometry,

  // 2. Sheet-Steel Lower Receiver, Main Recoil Spring, Spiked Bipod & Grip ('frame' · 4)
  m82a1_lower_receiver: buildM82LowerReceiverGeometry,
  m82a1_recoil_spring: buildM82RecoilSpringGeometry,
  m82a1_bipod: buildM82BipodGeometry,
  m82a1_pistol_grip: buildM82PistolGripGeometry,

  // 3. Striker Cocking Lever, Sear, Match Trigger & Safety Selector ('fire_control' · 4)
  m82a1_striker: buildM82StrikerGeometry,
  m82a1_sear: buildM82SearGeometry,
  m82a1_trigger: buildM82TriggerGeometry,
  m82a1_selector: buildM82SelectorGeometry,

  // 4. 10-Round .50 BMG Ribbed Steel Box Magazine ('magazine' · 4)
  m82a1_mag_body: buildM82MagBodyGeometry,
  m82a1_mag_follower: buildM82MagFollowerGeometry,
  m82a1_mag_spring: buildM82MagSpringGeometry,
  m82a1_mag_floorplate: buildM82MagFloorplateGeometry,
};

export {
  buildM82LowerReceiverGeometry,
  buildM82RecoilSpringGeometry,
  buildM82BipodGeometry,
  buildM82PistolGripGeometry,
  buildM82StrikerGeometry,
  buildM82SearGeometry,
  buildM82TriggerGeometry,
  buildM82SelectorGeometry,
  buildM82MagBodyGeometry,
  buildM82MagFollowerGeometry,
  buildM82MagSpringGeometry,
  buildM82MagFloorplateGeometry,
};
