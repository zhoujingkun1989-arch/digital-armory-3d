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
import {
  arrayAlongX,
  buildDovetailBar,
  buildHelicalLands,
  buildStadiumPunchZ,
  mergeCutters,
} from './m82a1CadDetail';

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

  // Core V-shaped arrowhead body in (X, Z), spanning Y ∈ [-0.53, +0.53] (tucked cleanly inside top/bottom plates)
  const brakeCore = new THREE.ExtrudeGeometry(corePlan, {
    depth: 1.06,
    bevelEnabled: false,
  });
  brakeCore.rotateX(Math.PI / 2);
  brakeCore.translate(0, 0.53, 0);
  paintGeometry(brakeCore, M82_PARKERIZED);

  // Distinct Top & Bottom Horizontal Baffle Plates (Y ∈ [±0.495, ±0.795]) framing the open side-vent chambers
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
    bevelSegments: 1,
  });
  topBafflePlate.rotateX(Math.PI / 2);
  topBafflePlate.translate(0, 0.77, 0);
  paintGeometry(topBafflePlate, M82_CHAMFER_STEEL);

  const botBafflePlate = new THREE.ExtrudeGeometry(platePlan, {
    depth: 0.25,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 1,
  });
  botBafflePlate.rotateX(Math.PI / 2);
  botBafflePlate.translate(0, -0.52, 0);
  paintGeometry(botBafflePlate, M82_CHAMFER_STEEL);

  // Rear threaded barrel collar built as a clean closed hollow LatheGeometry (R_in=0.59, R_out=0.84) +
  // twin split-collar clamping ears separated by a 0.08 kerf — eliminates 3 CSG passes & seam slivers!
  const rearCollar = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.59, -0.91),
      new THREE.Vector2(0.84, -0.91),
      new THREE.Vector2(0.84, -0.13),
      new THREE.Vector2(0.59, -0.13),
      new THREE.Vector2(0.59, -0.91),
    ],
    28
  );
  rearCollar.rotateZ(-Math.PI / 2);
  paintGeometry(rearCollar, M82_PARKERIZED);

  const clampEarL = paintGeometry(
    new THREE.BoxGeometry(0.74, 0.38, 0.3).translate(-0.54, -0.84, -0.19),
    M82_DARK_STEEL
  );
  const clampEarR = paintGeometry(
    new THREE.BoxGeometry(0.74, 0.38, 0.3).translate(-0.54, -0.84, 0.19),
    M82_DARK_STEEL
  );

  // Core CSG Cutters batched into 3 clean passes on the 40-tri arrowhead prism:
  const centralBore = paintGeometry(
    new THREE.CylinderGeometry(0.33, 0.33, 3.3, 24)
      .rotateZ(Math.PI / 2)
      .translate(0.95, 0, 0),
    M82_INNER_DARK
  );

  const crownProfile = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, 2.18),
      new THREE.Vector2(0.33, 2.18),
      new THREE.Vector2(0.45, 2.38), // 11° recessed blast crown cone
      new THREE.Vector2(0.49, 2.38), // Stepped crown land
      new THREE.Vector2(0.49, 2.5),
      new THREE.Vector2(0.001, 2.5),
    ],
    24
  );
  crownProfile.rotateZ(-Math.PI / 2);
  const axialPlenums = mergeCutters([
    paintGeometry(
      new THREE.CylinderGeometry(0.59, 0.59, 0.5, 24)
        .rotateZ(Math.PI / 2)
        .translate(-0.42, 0, 0),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.48, 0.44, 0.56, 22)
        .rotateZ(Math.PI / 2)
        .translate(0.2, 0, 0),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.46, 0.42, 0.54, 22)
        .rotateZ(Math.PI / 2)
        .translate(1.31, 0, 0),
      M82_INNER_DARK
    ),
    paintGeometry(crownProfile, M82_INNER_DARK),
  ]);

  const chamberCutters: THREE.BufferGeometry[] = [];
  const ventCutters: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    chamberCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.74, 1.12, 1.92)
          .rotateY(side * 0.58)
          .translate(0.2, 0, side * 0.94),
        M82_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.68, 1.12, 1.68)
          .rotateY(side * 0.58)
          .translate(1.33, 0, side * 0.85),
        M82_INNER_DARK
      )
    );

    for (const vx of [0.28, 1.36]) {
      ventCutters.push(
        paintGeometry(
          new THREE.BoxGeometry(0.38, 1.95, 0.24)
            .rotateY(side * 0.56)
            .translate(vx, 0, side * 0.68),
          M82_INNER_DARK
        )
      );
    }
  }

  const carvedCore = csgSubtract(brakeCore, [
    centralBore,
    axialPlenums,
    mergeCutters(chamberCutters),
  ]);
  const carvedPlates = csgSubtract(
    mergeCutters([topBafflePlate, botBafflePlate]),
    [
      mergeCutters([
        ...ventCutters,
        paintGeometry(
          new THREE.CylinderGeometry(0.59, 0.59, 0.92, 22)
            .rotateZ(Math.PI / 2)
            .translate(-0.66, 0, 0),
          M82_INNER_DARK
        ),
      ]),
    ]
  );

  // True 6-flat hexagonal barrel jam nut (X ∈ [-1.03, -0.87], max Y = 0.86) + chamfer bevel collar,
  // stainless peel-washer stack, internal baffle jet-stripper ring, socket clamp bolts, and
  // 8 helical .50 BMG rifling lands visible inside the barrel socket / crown throat!
  const details: THREE.BufferGeometry[] = [
    carvedCore,
    carvedPlates,
    rearCollar,
    clampEarL,
    clampEarR,
    paintGeometry(
      new THREE.CylinderGeometry(0.86, 0.86, 0.14, 6)
        .rotateZ(Math.PI / 2)
        .rotateX(Math.PI / 6)
        .translate(-0.95, 0, 0),
      M82_BOLT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.81, 0.81, 0.16, 28)
        .rotateZ(Math.PI / 2)
        .translate(-0.95, 0, 0),
      M82_CHAMFER_STEEL
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
    // Machined stainless jet-stripper aperture ring on the central V-splitter baffle bore
    paintGeometry(
      new THREE.TorusGeometry(0.345, 0.022, 8, 24)
        .rotateY(Math.PI / 2)
        .translate(0.76, 0, 0),
      M82_BOLT_STEEL
    ),
  ];

  // Recessed socket-head clamp bolts + hex nuts on bottom split clamping lug
  for (const bx of [-0.72, -0.36]) {
    details.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.082, 0.082, 0.76, 12)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.84, 0),
        M82_BRIGHT_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.125, 0.125, 0.09, 14)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.84, -0.38),
        M82_BOLT_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.125, 0.125, 0.08, 6)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.84, 0.38),
        M82_BOLT_STEEL
      )
    );
  }

  // Internal female thread rings inside rear socket + 8 helical .50 BMG throat rifling lands
  for (const tx of [-0.88, -0.68, -0.48]) {
    details.push(
      paintGeometry(
        new THREE.TorusGeometry(0.585, 0.018, 6, 24)
          .rotateY(Math.PI / 2)
          .translate(tx, 0, 0),
        M82_BOLT_STEEL
      )
    );
  }
  details.push(
    paintGeometry(
      buildHelicalLands({
        count: 8,
        boreRadius: 0.33,
        height: 0.026,
        halfAngle: 0.095,
        x0: -0.22,
        x1: 0.32,
        twist: (Math.PI * 2) / 38.1,
        segments: 4,
      }),
      M82_BOLT_STEEL
    )
  );

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
    new THREE.Vector2(0.58, 31.43),
    new THREE.Vector2(0.56, 31.45), // 45° crown edge break
    new THREE.Vector2(0.47, 31.45), // Flat crown land
    new THREE.Vector2(0.47, 31.415), // Recessed crown step
    // True 11° target crown: (0.47 - 0.285) · tan(11°) ≈ 0.036 deep cone into the bore
    new THREE.Vector2(0.285, 31.379),
    // ---- closed hollow profile: 12.7 mm bore runs back to the chamber ----
    new THREE.Vector2(0.285, 8.25),
    new THREE.Vector2(0.305, 8.0), // Leade / freebore throat cone
    new THREE.Vector2(0.305, 7.62), // Case neck
    new THREE.Vector2(0.4, 7.24), // .50 BMG case shoulder
    new THREE.Vector2(0.43, 4.35), // Tapered case body
    new THREE.Vector2(0.47, 4.2), // Breech face chamfer / extractor relief
    new THREE.Vector2(0.42, 4.15),
  ];
  const outerLathe = new THREE.LatheGeometry(pts, 36);
  outerLathe.rotateZ(-Math.PI / 2);
  paintGeometry(outerLathe, M82_PARKERIZED);
  // Dark bore / chamber walls (inner faces of the closed lathe)
  {
    const pos = outerLathe.getAttribute('position');
    const col = outerLathe.getAttribute('color');
    const dark = new THREE.Color(M82_INNER_DARK);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getY(i), pos.getZ(i));
      const x = pos.getX(i);
      if (r < 0.475 && x > 4.17 && x < 31.42) {
        col.setXYZ(i, dark.r, dark.g, dark.b);
      }
    }
  }

  const cutters: THREE.BufferGeometry[] = [];

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

  // All 16 flutes + 4 spanner notches are mutually disjoint -> ONE merged CSG brush
  const flutedBarrel = csgSubtract(outerLathe, [mergeCutters(cutters)]);

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

  // 8 helical .50 BMG rifling lands (1:15" = 38.1 cm right-hand twist) swept through the
  // muzzle bore (X ∈ [27.4, 31.37]) and the leade ahead of the chamber (X ∈ [8.3, 10.6])
  const twist = (Math.PI * 2) / 38.1;
  subParts.push(
    paintGeometry(
      buildHelicalLands({
        count: 8,
        boreRadius: 0.285,
        height: 0.03,
        halfAngle: 0.1,
        x0: 27.4,
        x1: 31.37,
        twist,
        segments: 10,
        phase: 0.12,
      }),
      M82_BOLT_STEEL
    ),
    paintGeometry(
      buildHelicalLands({
        count: 8,
        boreRadius: 0.285,
        height: 0.03,
        halfAngle: 0.1,
        x0: 8.3,
        x1: 10.6,
        twist,
        segments: 6,
        phase: 0.12,
      }),
      M82_BOLT_STEEL
    )
  );

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

  // springAnchorCollar (+1.92) and acceleratorTripBlock (-2.12) are disjoint -> merge into 1 brush
  const solid = csgUnion([
    outerSleeve,
    keyRail,
    mergeCutters([springAnchorCollar, acceleratorTripBlock]),
  ]);

  //Three 120°-spaced rear bolt-lug entry raceways (X_local ∈ [-2.75, -1.55]) — mutually disjoint!
  const lugRaceways: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI * 2) / 3 + Math.PI / 2;
    lugRaceways.push(
      paintGeometry(
        new THREE.BoxGeometry(1.28, 0.46, 0.44)
          .translate(-2.12, 0.64, 0)
          .rotateX(ang),
        M82_INNER_DARK
      )
    );
  }

  const extensionBody = csgSubtract(solid, [
    paintGeometry(
      new THREE.CylinderGeometry(0.68, 0.68, 5.2, 28)
        .rotateZ(Math.PI / 2)
        .translate(-0.2, 0, 0),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.83, 0.83, 0.92, 28)
        .rotateZ(Math.PI / 2)
        .translate(-1.2, 0, 0),
      M82_INNER_DARK
    ),
    mergeCutters(lugRaceways),
    // Right-side ejection relief & bottom feed-ramp throat are disjoint in Y/Z
    mergeCutters([
      paintGeometry(
        new THREE.BoxGeometry(1.65, 0.78, 0.85).translate(-1.55, 0.14, 0.68),
        M82_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(1.48, 0.68, 0.94)
          .rotateZ(0.38)
          .translate(-2.08, -0.68, 0),
        M82_BRIGHT_STEEL
      ),
    ]),
    paintGeometry(
      new THREE.BoxGeometry(1.35, 0.48, 0.48)
        .rotateY(-0.38)
        .translate(-1.85, 0.68, 0.12),
      M82_INNER_DARK
    ),
  ]);

  // 3 hardened internal locking abutment lugs (120°-spaced between raceways at X_local = -1.92) +
  // Left & Right stainless spring-anchor pins at X_local = +1.96 (world X = 7.36), Z = ±0.84
  const extParts: THREE.BufferGeometry[] = [extensionBody];
  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI * 2) / 3 + Math.PI / 6;
    extParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.38, 0.18, 0.34)
          .translate(-1.92, 0.74, 0)
          .rotateX(ang),
        M82_BOLT_STEEL
      )
    );
  }
  extParts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.085, 0.085, 0.68, 12).translate(
        1.96,
        0,
        -0.84
      ),
      M82_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.085, 0.085, 0.68, 12).translate(
        1.96,
        0,
        0.84
      ),
      M82_BRIGHT_STEEL
    )
  );

  return mergeParts(extParts);
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

  // Subdivide along X (`steps: 32`) so BVH leaves isolate each forend cooling vent instead of
  // splitting one 37.3-unit triangle across all 14 vents simultaneously (3.5x faster CSG!).
  const rawUpper = new THREE.ExtrudeGeometry(crossSec, {
    depth: 37.3,
    steps: 32,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  rawUpper.rotateY(Math.PI / 2);
  rawUpper.translate(-20.8, 0, 0);
  paintGeometry(rawUpper, M82_PARKERIZED);

  // Signature Barrett Ventilated Forend: 2 rows x 7 true oblong stadium cooling vents per side
  // (28 openings total, X ∈ [8.35, 15.35]) — ALL 14 thru-punches are mutually disjoint in X & Y!
  const ventCutters: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const vx = 8.5 + i * 1.1;
    ventCutters.push(
      paintGeometry(
        buildStadiumPunchZ(0.21, 0.18, 1.35, 6).translate(vx, 1.98, 0),
        M82_INNER_DARK
      ),
      paintGeometry(
        buildStadiumPunchZ(0.23, 0.19, 1.35, 6).translate(vx, 1.06, 0),
        M82_INNER_DARK
      )
    );
  }

  const upperShell = csgSubtract(rawUpper, [
    // Interior tunnel (-20.5..+16.2), front barrel bore (+15.0..+17.2), ejection port & charging slot
    paintGeometry(
      new THREE.BoxGeometry(36.7, 2.02, 1.94, 24, 1, 1).translate(
        -2.15,
        1.15,
        0
      ),
      M82_INNER_DARK
    ),
    mergeCutters([
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
    ]),
    // Right-Side Reciprocating Charging Handle Track Slot (X ∈ [-7.05, 2.25])
    paintGeometry(
      new THREE.BoxGeometry(9.3, 0.5, 1.1).translate(-2.4, 1.25, 0.85),
      M82_INNER_DARK
    ),
    mergeCutters(ventCutters),
  ]);
  const subParts: THREE.BufferGeometry[] = [upperShell];

  // Welded lower split-seam reinforcement strips + internal bolt-carrier guide rails
  for (const side of [-1, 1]) {
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(36.2, 0.14, 0.06).translate(
          -2.2,
          0.28,
          side * 1.17
        ),
        M82_DARK_STEEL
      ),
      paintGeometry(
        new THREE.BoxGeometry(19.5, 0.12, 0.09).translate(
          -1.8,
          1.45,
          side * 0.91
        ),
        M82_CHAMFER_STEEL
      )
    );
  }

  // Front Nylatron-lined barrel guide bushing collar (X = +16.28, Y = +1.25) built as a zero-CSG hollow lathe
  const bushingLathe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.765, 15.89),
      new THREE.Vector2(1.05, 15.89),
      new THREE.Vector2(1.05, 16.05),
      new THREE.Vector2(1.01, 16.12), // Machined relief groove
      new THREE.Vector2(1.03, 16.58),
      new THREE.Vector2(0.98, 16.67), // Front chamfered rim
      new THREE.Vector2(0.765, 16.67),
      new THREE.Vector2(0.765, 15.89),
    ],
    28
  );
  bushingLathe.rotateZ(-Math.PI / 2);
  bushingLathe.translate(0, 1.25, 0);
  subParts.push(
    paintGeometry(bushingLathe, M82_DARK_STEEL),
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

  // Full-Length 27-MOA MIL-STD-1913 Picatinny Top Rail w/ authentic 45° dovetail flank bevels!
  // Base riser spine (X ∈ [-14.43, +15.87], Y ∈ [2.41, 2.58]) + 36 dovetail recoil lugs (Y ∈ [2.56, 2.74], Z ∈ [-0.54, +0.54])
  subParts.push(
    paintGeometry(
      buildDovetailBar({
        xStart: -14.43,
        length: 30.3,
        yBottom: 2.41,
        yTop: 2.58,
        halfWidthBottom: 0.45,
        halfWidthMax: 0.49,
        topChamfer: 0.055,
      }),
      M82_DARK_STEEL
    )
  );
  const lugXs: number[] = [];
  for (let s = 0; s < 36; s++) {
    lugXs.push(-13.95 + s * 0.84);
  }
  const dovetailLugTemplate = paintGeometry(
    buildDovetailBar({
      xStart: -0.23,
      length: 0.46,
      yBottom: 2.56,
      yTop: 2.74,
      halfWidthBottom: 0.43,
      halfWidthMax: 0.54,
      topChamfer: 0.055,
    }),
    M82_CHAMFER_STEEL
  );
  subParts.push(arrayAlongX(dovetailLugTemplate, lugXs));

  // 1) Folding Hooded Backup Front Iron Sight at X = +15.35 (zero-CSG hollow lathe hood, max Y = 3.566)
  const frontHoodLathe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.29, 15.08),
      new THREE.Vector2(0.386, 15.08),
      new THREE.Vector2(0.386, 15.62),
      new THREE.Vector2(0.29, 15.62),
      new THREE.Vector2(0.29, 15.08),
    ],
    22
  );
  frontHoodLathe.rotateZ(-Math.PI / 2);
  frontHoodLathe.translate(0, 3.18, 0);
  subParts.push(
    paintGeometry(
      buildDovetailBar({
        xStart: 14.97,
        length: 0.76,
        yBottom: 2.7,
        yTop: 2.94,
        halfWidthBottom: 0.4,
        halfWidthMax: 0.46,
        topChamfer: 0.04,
      }),
      M82_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.08, 0.08, 0.96, 12)
        .rotateX(Math.PI / 2)
        .translate(15.35, 2.82, 0),
      M82_BRIGHT_STEEL
    ),
    paintGeometry(frontHoodLathe, M82_DARK_STEEL),
    paintGeometry(
      new THREE.CylinderGeometry(0.042, 0.055, 0.34, 10).translate(
        15.35,
        3.09,
        0
      ),
      M82_BRIGHT_STEEL
    )
  );

  // 2) Folding Rear Backup Peep Iron Sight at X = -13.8 (hinge base, knurled windage drum & peep leaf)
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
      buildDovetailBar({
        xStart: -14.22,
        length: 0.84,
        yBottom: 2.72,
        yTop: 2.96,
        halfWidthBottom: 0.42,
        halfWidthMax: 0.48,
        topChamfer: 0.04,
      }),
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

  // Stamped ejection-port flange reinforcement + multi-facet angled steel .50 BMG brass deflector (max Z = 1.47)
  const deflPlan = new THREE.Shape();
  deflPlan.moveTo(1.38, 1.02);
  deflPlan.lineTo(2.14, 1.02);
  deflPlan.lineTo(1.98, 1.45); // Angled brass-kiss Strike face
  deflPlan.lineTo(1.52, 1.38);
  deflPlan.closePath();
  const deflectorGeo = new THREE.ExtrudeGeometry(deflPlan, {
    depth: 0.94,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  deflectorGeo.rotateX(Math.PI / 2);
  deflectorGeo.translate(0, 1.79, 0);
  subParts.push(
    paintGeometry(deflectorGeo, M82_DARK_STEEL),
    paintGeometry(
      new THREE.BoxGeometry(5.86, 0.1, 0.08).translate(5.0, 1.98, 1.12),
      M82_CHAMFER_STEEL
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
    // Tapered CNC saddle pedestal w/ lower 45° Picatinny dovetail clamp jaws
    const baseProfile = new THREE.Shape();
    baseProfile.moveTo(-0.56, -0.02);
    baseProfile.lineTo(0.56, -0.02);
    baseProfile.lineTo(0.67, 0.12);
    baseProfile.lineTo(0.67, 0.78);
    baseProfile.lineTo(0.58, 0.86);
    baseProfile.lineTo(-0.58, 0.86);
    baseProfile.lineTo(-0.67, 0.78);
    baseProfile.lineTo(-0.67, 0.12);
    baseProfile.closePath();
    const baseBlock = new THREE.ExtrudeGeometry(baseProfile, {
      depth: 1.36,
      bevelEnabled: false,
    });
    baseBlock.rotateY(Math.PI / 2);
    baseBlock.translate(rx - 0.68, 0, 0);
    paintGeometry(baseBlock, M82_DARK_STEEL);

    const recoilLug = paintGeometry(
      new THREE.BoxGeometry(0.36, 0.18, 1.08).translate(rx, -0.06, 0),
      M82_DARK_STEEL
    );
    const ringOuter = paintGeometry(
      new THREE.CylinderGeometry(0.84, 0.84, 1.32, 32)
        .rotateZ(Math.PI / 2)
        .translate(rx, 1.36, 0),
      M82_DARK_STEEL
    );
    const capFlange = paintGeometry(
      new THREE.BoxGeometry(1.32, 0.26, 1.92).translate(rx, 1.36, 0),
      M82_CHAMFER_STEEL
    );
    const ringSolid = csgUnion([
      baseBlock,
      mergeCutters([recoilLug, capFlange]),
      ringOuter,
    ]);

    const scopeBore = paintGeometry(
      new THREE.CylinderGeometry(0.565, 0.565, 1.65, 32)
        .rotateZ(Math.PI / 2)
        .translate(rx, 1.36, 0),
      M82_INNER_DARK
    );
    // capSplitGap (Y=1.36) and weightHole (Y=0.50) are disjoint in Y -> merge into 1 brush
    const splitAndHole = mergeCutters([
      paintGeometry(
        new THREE.BoxGeometry(1.45, 0.04, 2.05).translate(rx, 1.36, 0),
        M82_INNER_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.22, 0.22, 1.6, 18)
          .rotateX(Math.PI / 2)
          .translate(rx, 0.5, 0),
        M82_INNER_DARK
      ),
    ]);
    parts.push(csgSubtract(ringSolid, [scopeBore, splitAndHole]));

    // Heavy 1/2" hex rail clamp nut + cross-bolt + 6 stainless Torx cap screws w/ dark socket recesses
    parts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.22, 0.22, 1.62, 6)
          .rotateX(Math.PI / 2)
          .translate(rx, 0.1, 0),
        M82_BRIGHT_STEEL
      ),
      paintGeometry(
        new THREE.BoxGeometry(1.34, 0.2, 0.12).translate(rx, 0.1, -0.72),
        M82_CHAMFER_STEEL
      )
    );
    for (const sx of [-0.42, 0, 0.42]) {
      for (const sz of [-0.78, 0.78]) {
        parts.push(
          paintGeometry(
            new THREE.CylinderGeometry(0.076, 0.076, 0.36, 12).translate(
              rx + sx,
              1.42,
              sz
            ),
            M82_BRIGHT_STEEL
          ),
          paintGeometry(
            new THREE.CylinderGeometry(0.042, 0.042, 0.03, 6).translate(
              rx + sx,
              1.595,
              sz
            ),
            M82_INNER_DARK
          )
        );
      }
    }
  }

  return mergeParts(parts);
}

/**
 * U-09: Machined Steel Bolt Carrier w/ Helical Cam Slot, Accelerator Arm Linkage Clevis & Charging Handle
 * (assembledPos: [-1.2, 1.25, 0], spans local X ∈ [-5.72, +3.445] -> world X ∈ [-6.92, +2.245])
 */
export function buildM82BoltCarrierGeometry(): THREE.BufferGeometry {
  // Machined octagonal-beveled CNC steel carrier cross-section in (Z, Y), extruded over X ∈ [-4.805, +3.445]
  const carrierSec = new THREE.Shape();
  carrierSec.moveTo(-0.65, -0.69);
  carrierSec.lineTo(0.65, -0.69);
  carrierSec.lineTo(0.79, -0.55);
  carrierSec.lineTo(0.79, 0.49);
  carrierSec.lineTo(0.59, 0.69); // 45° upper octagonal carrier shoulder bevels
  carrierSec.lineTo(-0.59, 0.69);
  carrierSec.lineTo(-0.79, 0.49);
  carrierSec.lineTo(-0.79, -0.55);
  carrierSec.closePath();

  const mainBlock = new THREE.ExtrudeGeometry(carrierSec, {
    depth: 8.25,
    bevelEnabled: false,
  });
  mainBlock.rotateY(Math.PI / 2);
  mainBlock.translate(-4.805, 0, 0);
  paintGeometry(mainBlock, M82_DARK_STEEL);

  const rearBufferTail = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.58, 1.44, 26)
      .rotateZ(Math.PI / 2)
      .translate(-5.0, 0, 0),
    M82_BOLT_STEEL
  );
  // Downward rear accelerator linkage clevis ears around X_local = -2.20 (world X = -3.40)
  const accelClevis = paintGeometry(
    new THREE.BoxGeometry(1.12, 0.62, 1.24).translate(-2.2, -0.66, 0),
    M82_DARK_STEEL
  );
  // rearBufferTail (-5.72..-4.28) and accelClevis (-2.76..-1.64) are disjoint in X -> 1 union brush!
  const rawCarrier = csgUnion([
    mainBlock,
    mergeCutters([rearBufferTail, accelClevis]),
  ]);

  // Batch disjoint cutters:
  //  - Group 1: front bolt-stem bore (+1.50) + rear accelerator roller pocket (-2.25) [disjoint in X]
  //  - Group 2: left/right longitudinal receiver guide rail slots + sand-relief cuts [disjoint in Z/Y]
  //  - Group 3: full-length bottom striker clearance channel (-0.69) + upper helical cam-pin slot (+0.58) [disjoint in Y]
  const carrierBody = csgSubtract(rawCarrier, [
    mergeCutters([
      paintGeometry(
        new THREE.CylinderGeometry(0.53, 0.53, 3.89, 26)
          .rotateZ(Math.PI / 2)
          .translate(1.5, 0, 0),
        M82_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(1.45, 1.22, 0.64).translate(-2.25, -0.15, 0),
        M82_INNER_DARK
      ),
    ]),
    mergeCutters([
      paintGeometry(
        new THREE.BoxGeometry(6.8, 0.38, 0.28).translate(-1.0, 0.18, -0.82),
        M82_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(5.2, 0.38, 0.28).translate(-1.8, 0.18, 0.82),
        M82_INNER_DARK
      ),
      // Machined sand/debris lightening fullers along upper side walls
      paintGeometry(
        new THREE.BoxGeometry(5.6, 0.18, 0.1).translate(-0.9, 0.46, -0.78),
        M82_CHAMFER_STEEL
      ),
      paintGeometry(
        new THREE.BoxGeometry(4.4, 0.18, 0.1).translate(-1.5, 0.46, 0.78),
        M82_CHAMFER_STEEL
      ),
    ]),
    mergeCutters([
      paintGeometry(
        new THREE.BoxGeometry(8.4, 0.82, 0.64).translate(-0.65, -0.69, 0),
        M82_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(1.62, 0.56, 0.52)
          .rotateY(0.52)
          .translate(2.05, 0.58, 0.16),
        M82_INNER_DARK
      ),
    ]),
  ]);

  // Hollowed cylindrical grooved Right-Side Charging Handle (LatheGeometry w/ recessed tip cup, Z <= 2.215) +
  // stainless accelerator linkage cross-pin
  const handleLathe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, 0.7),
      new THREE.Vector2(0.23, 0.7),
      new THREE.Vector2(0.19, 1.16),
      new THREE.Vector2(0.29, 1.2),
      new THREE.Vector2(0.29, 2.02),
      new THREE.Vector2(0.25, 2.04),
      new THREE.Vector2(0.16, 2.04),
      new THREE.Vector2(0.16, 1.88), // Hollow lightened charging knob recess
      new THREE.Vector2(0.001, 1.88),
    ],
    24
  );
  handleLathe.rotateX(Math.PI / 2);
  handleLathe.translate(2.35, 0, 0);

  const subParts: THREE.BufferGeometry[] = [
    carrierBody,
    paintGeometry(handleLathe, M82_PARKERIZED),
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
  // Precision stepped CNC bolt stem w/ rear firing-pin bore, gas/sand seal rings & neck relief undercut
  const stemLathe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.18, -1.835),
      new THREE.Vector2(0.46, -1.835),
      new THREE.Vector2(0.48, -1.78),
      new THREE.Vector2(0.48, -1.08),
      new THREE.Vector2(0.445, -1.06), // Twin oil/debris relief ring #1
      new THREE.Vector2(0.445, -0.96),
      new THREE.Vector2(0.48, -0.94),
      new THREE.Vector2(0.48, -0.82),
      new THREE.Vector2(0.445, -0.8), // Twin oil/debris relief ring #2
      new THREE.Vector2(0.445, -0.7),
      new THREE.Vector2(0.48, -0.68),
      new THREE.Vector2(0.48, 0.78),
      new THREE.Vector2(0.435, 0.82), // Locking-lug neck relief undercut
      new THREE.Vector2(0.435, 1.0),
      new THREE.Vector2(0.18, 1.0),
      new THREE.Vector2(0.18, -1.835),
    ],
    28
  );
  stemLathe.rotateZ(-Math.PI / 2);
  paintGeometry(stemLathe, M82_BRIGHT_STEEL);

  // Rounded equilateral-triangular 3-lug .50 BMG bolt head profile in (Z, Y) extruded along X ∈ [1.02, 1.80]
  // with crisp radial lug shoulders & anti-bind crest relief scallops
  const triHead = new THREE.Shape();
  const lugCount = 3;
  const rOuter = 0.82;
  const rRoot = 0.565;
  for (let i = 0; i < lugCount; i++) {
    const baseAng = (i * Math.PI * 2) / 3 - Math.PI / 2;
    const a0 = baseAng - 0.36;
    const a1 = baseAng - 0.25;
    const aMidL = baseAng - 0.065;
    const aMidR = baseAng + 0.065;
    const a2 = baseAng + 0.25;
    const a3 = baseAng + 0.36;
    const nextRoot = baseAng + (Math.PI * 2) / 3 - 0.36;

    const p0z = Math.cos(a0) * rRoot;
    const p0y = Math.sin(a0) * rRoot;
    if (i === 0) triHead.moveTo(p0z, p0y);
    else triHead.lineTo(p0z, p0y);

    triHead.lineTo(Math.cos(a1) * rOuter, Math.sin(a1) * rOuter);
    triHead.quadraticCurveTo(
      Math.cos(baseAng - 0.14) * (rOuter + 0.032),
      Math.sin(baseAng - 0.14) * (rOuter + 0.032),
      Math.cos(aMidL) * (rOuter + 0.015),
      Math.sin(aMidL) * (rOuter + 0.015)
    );
    // Subtle anti-bind longitudinal sand-relief groove along lug crest
    triHead.lineTo(
      Math.cos(baseAng) * (rOuter - 0.022),
      Math.sin(baseAng) * (rOuter - 0.022)
    );
    triHead.lineTo(
      Math.cos(aMidR) * (rOuter + 0.015),
      Math.sin(aMidR) * (rOuter + 0.015)
    );
    triHead.quadraticCurveTo(
      Math.cos(baseAng + 0.14) * (rOuter + 0.032),
      Math.sin(baseAng + 0.14) * (rOuter + 0.032),
      Math.cos(a2) * rOuter,
      Math.sin(a2) * rOuter
    );
    triHead.lineTo(Math.cos(a3) * rRoot, Math.sin(a3) * rRoot);
    triHead.quadraticCurveTo(
      Math.cos(baseAng + Math.PI / 3) * (rRoot * 1.025),
      Math.sin(baseAng + Math.PI / 3) * (rRoot * 1.025),
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

  // Carve recessed .50 BMG bolt face cup (20.4mm rim!), central firing-pin hole, counterbored dual ejector
  // plunger wells (Y = ±0.15, Z = -0.24), and right-side pivoting extractor mortise into headGeo ONLY!
  const hollowedHead = csgSubtract(headGeo, [
    paintGeometry(
      new THREE.CylinderGeometry(0.455, 0.455, 0.2, 28)
        .rotateZ(Math.PI / 2)
        .translate(1.75, 0, 0),
      M82_INNER_DARK
    ),
    // Firing-pin aperture (Y=0,Z=0), dual ejector plunger counterbores (Z=-0.24), and extractor mortise (Z=+0.56) are mutually disjoint!
    mergeCutters([
      paintGeometry(
        new THREE.CylinderGeometry(0.078, 0.078, 0.72, 14)
          .rotateZ(Math.PI / 2)
          .translate(1.42, 0, 0),
        M82_INNER_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.088, 0.088, 0.34, 14)
          .rotateZ(Math.PI / 2)
          .translate(1.56, 0.15, -0.24),
        M82_INNER_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.088, 0.088, 0.34, 14)
          .rotateZ(Math.PI / 2)
          .translate(1.56, -0.15, -0.24),
        M82_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(1.22, 0.32, 0.3).translate(1.25, 0.08, 0.57),
        M82_INNER_DARK
      ),
    ]),
  ]);

  // Helical Bolt Cam Pin + rectangular cam guide shoe at X_local = -0.35, Y = +0.58 + rear firing-pin retainer pin
  const camPin = paintGeometry(
    new THREE.CylinderGeometry(0.17, 0.17, 0.58, 16).translate(-0.35, 0.56, 0),
    M82_DARK_STEEL
  );
  const camShoe = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.16, 0.38).translate(-0.35, 0.82, 0),
    M82_BOLT_STEEL
  );
  const retainerPin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.92, 10)
      .rotateX(Math.PI / 2)
      .translate(-1.42, 0.18, 0),
    M82_DARK_STEEL
  );

  // Contoured pivoting heavy Claw Extractor in (X, Z) w/ undercut .50 BMG rim-hook bevel & pivot pin!
  const extPlan = new THREE.Shape();
  extPlan.moveTo(0.65, 0.44);
  extPlan.lineTo(1.66, 0.44);
  extPlan.lineTo(1.68, 0.35); // Undercut rim-biting claw hook throat
  extPlan.lineTo(1.83, 0.35);
  extPlan.lineTo(1.908, 0.46); // Angled cartridge-rim snap-over feed bevel
  extPlan.lineTo(1.86, 0.64);
  extPlan.lineTo(1.28, 0.66); // Pivoting extractor fulcrum swell
  extPlan.lineTo(0.65, 0.61);
  extPlan.closePath();
  const extractorGeo = new THREE.ExtrudeGeometry(extPlan, {
    depth: 0.25,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.012,
    bevelSegments: 1,
  });
  extractorGeo.rotateX(Math.PI / 2);
  extractorGeo.translate(0, 0.205, 0);
  paintGeometry(extractorGeo, M82_DARK_STEEL);

  const extractorPivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.052, 0.052, 0.36, 10).translate(
      1.28,
      0.08,
      0.56
    ),
    M82_BRIGHT_STEEL
  );

  // Dual spring-loaded rounded-tip Plunger Ejectors seated inside the bolt-face counterbores
  const buildEjectorPlunger = (yOff: number) => {
    const p = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 1.48),
        new THREE.Vector2(0.068, 1.48),
        new THREE.Vector2(0.068, 1.77),
        new THREE.Vector2(0.052, 1.805),
        new THREE.Vector2(0.001, 1.815),
      ],
      14
    );
    p.rotateZ(-Math.PI / 2);
    p.translate(0, yOff, -0.24);
    return paintGeometry(p, M82_BOLT_STEEL);
  };

  return mergeParts([
    stemLathe,
    hollowedHead,
    camPin,
    camShoe,
    retainerPin,
    extractorGeo,
    extractorPivotPin,
    buildEjectorPlunger(0.15),
    buildEjectorPlunger(-0.15),
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
