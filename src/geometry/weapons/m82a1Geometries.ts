import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../springHelper';
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
 * U-01: Iconic Barrett Two-Chamber V-Arrowhead Tank Muzzle Brake (vents ~65% recoil!)
 * (assembledPos: [31.6, 1.25, 0], spans local X ∈ [-1.05, +2.40] -> world X ∈ [30.55, 34.00])
 * Mates 100% flush onto barrel shoulder at world X = 30.60!
 */
export function buildM82MuzzleBrakeGeometry(): THREE.BufferGeometry {
  // Planform arrowhead polygon in (X, Z) extruded vertically across Y ∈ [-0.78, +0.78]
  const arrowPlan = new THREE.Shape();
  arrowPlan.moveTo(-0.25, -0.84); // Rear neck left
  arrowPlan.lineTo(-0.52, -1.48); // Swept-back rear wingtip left
  arrowPlan.lineTo(0.28, -1.68); // Max arrowhead width left (Z = -1.68)
  arrowPlan.lineTo(1.38, -1.32); // Second-chamber outer step left
  arrowPlan.lineTo(2.4, -0.52); // Front V-nose left
  arrowPlan.lineTo(2.4, 0.52); // Front V-nose right
  arrowPlan.lineTo(1.38, 1.32); // Second-chamber outer step right
  arrowPlan.lineTo(0.28, 1.68); // Max arrowhead width right (Z = +1.68)
  arrowPlan.lineTo(-0.52, 1.48); // Swept-back rear wingtip right
  arrowPlan.lineTo(-0.25, 0.84); // Rear neck right
  arrowPlan.closePath();

  const brakeHead = new THREE.ExtrudeGeometry(arrowPlan, {
    depth: 1.54,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  // ExtrudeGeometry builds in (X, Y_shape) along +Z -> rotateX(PI/2) puts Y_shape onto +Z and depth onto -Y
  brakeHead.rotateX(Math.PI / 2);
  brakeHead.translate(0, 0.77, 0);
  paintGeometry(brakeHead, M82_PARKERIZED);

  // Rear cylindrical barrel-threading collar + bottom clamping block (X_local ∈ [-1.05, -0.15])
  const rearCollar = paintGeometry(
    new THREE.CylinderGeometry(0.84, 0.84, 0.95, 26)
      .rotateZ(Math.PI / 2)
      .translate(-0.58, 0, 0),
    M82_PARKERIZED
  );
  const clampLug = paintGeometry(
    new THREE.BoxGeometry(0.82, 0.36, 0.68).translate(-0.6, -0.82, 0),
    M82_DARK_STEEL
  );
  const rawBrake = csgUnion([brakeHead, rearCollar, clampLug]);

  // CSG Cutters:
  // 1) Central .50 BMG bullet bore (R = 0.34) + rear barrel tenon socket (R = 0.62)
  // 2) Two massive rearward-swept 34° chevron gas-expansion chambers on Left (-Z) and Right (+Z) sides!
  // 3) Top & Bottom pressure-equalizing vertical vent slots!
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.34, 0.34, 4.0, 22)
        .rotateZ(Math.PI / 2)
        .translate(0.7, 0, 0),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.6, 0.6, 0.95, 22)
        .rotateZ(Math.PI / 2)
        .translate(-0.65, 0, 0),
      M82_INNER_DARK
    ),
  ];

  // Swept-back Chamber 1 (rear) & Chamber 2 (front) on both Left (-1) and Right (+1) sides
  for (const side of [-1, 1]) {
    const ch1 = paintGeometry(
      new THREE.BoxGeometry(0.76, 1.08, 1.65)
        .rotateY(side * 0.56)
        .translate(0.32, 0, side * 1.02),
      M82_INNER_DARK
    );
    const ch2 = paintGeometry(
      new THREE.BoxGeometry(0.68, 1.08, 1.45)
        .rotateY(side * 0.56)
        .translate(1.38, 0, side * 0.92),
      M82_INNER_DARK
    );
    cutters.push(ch1, ch2);
  }

  // Top & bottom gas vent slots over both chambers
  for (const vx of [0.42, 1.42]) {
    for (const side of [-1, 1]) {
      cutters.push(
        paintGeometry(
          new THREE.BoxGeometry(0.46, 1.9, 0.28)
            .rotateY(side * 0.52)
            .translate(vx, 0, side * 0.68),
          M82_INNER_DARK
        )
      );
    }
  }

  const carved = csgSubtract(rawBrake, cutters);

  // Stainless clamping shims & cross-bolts at collar
  const clampBolt1 = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.78, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.78, -0.82, 0),
    M82_BRIGHT_STEEL
  );
  const clampBolt2 = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.78, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.42, -0.82, 0),
    M82_BRIGHT_STEEL
  );

  return mergeParts([carved, clampBolt1, clampBolt2]);
}

/**
 * U-02: 29" Longitudinally Fluted Recoiling .50 BMG Heavy Match Barrel
 * (assembledPos: [0, 1.25, 0], spans local X ∈ [+4.15, +31.45])
 * Breech seats inside Barrel Extension [2.8, 7.6]; shoulder at X = 30.60 meets Arrowhead Brake [30.55, 34.0]!
 */
export function buildM82BarrelGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.42, 4.15),
    new THREE.Vector2(0.86, 4.15), // Heavy breech & .50 BMG chamber journal inside barrel extension
    new THREE.Vector2(0.86, 7.55),
    new THREE.Vector2(0.78, 8.35), // Taper ahead of barrel extension
    new THREE.Vector2(0.74, 16.6), // Guided contour passing through front receiver bushing
    new THREE.Vector2(0.71, 29.8), // Heavy match fluted contour
    new THREE.Vector2(0.73, 29.95),
    new THREE.Vector2(0.73, 30.62), // Muzzle brake abutment shoulder (flush w/ brake at 30.55!)
    new THREE.Vector2(0.58, 30.65), // Threaded muzzle tenon inside brake collar
    new THREE.Vector2(0.58, 31.45),
    new THREE.Vector2(0.32, 31.45),
  ];
  const outerLathe = new THREE.LatheGeometry(pts, 32);
  outerLathe.rotateZ(-Math.PI / 2);
  paintGeometry(outerLathe, M82_PARKERIZED);

  // 8 deep CNC longitudinal cooling/weight-reduction flutes from X = 9.8 to X = 29.1!
  const cutters: THREE.BufferGeometry[] = [
    // Full-length 12.7mm (.50 cal) bore + bottleneck .50 BMG chamber cavity
    paintGeometry(
      new THREE.CylinderGeometry(0.29, 0.29, 28.0, 20)
        .rotateZ(Math.PI / 2)
        .translate(17.9, 0, 0),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.44, 0.48, 3.8, 20)
        .rotateZ(Math.PI / 2)
        .translate(6.05, 0, 0),
      M82_INNER_DARK
    ),
  ];

  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4;
    const fy = Math.cos(ang) * 0.79;
    const fz = Math.sin(ang) * 0.79;
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.15, 0.15, 19.2, 12)
          .rotateZ(Math.PI / 2)
          .translate(19.45, fy, fz),
        M82_DARK_STEEL
      )
    );
  }

  const flutedBarrel = csgSubtract(outerLathe, cutters);

  // Polished stainless chamber feed collar ring at X = 4.18
  const feedCollar = paintGeometry(
    new THREE.TorusGeometry(0.58, 0.08, 10, 24)
      .rotateY(Math.PI / 2)
      .translate(4.18, 0, 0),
    M82_BRIGHT_STEEL
  );

  return mergeParts([flutedBarrel, feedCollar]);
}

/**
 * U-03: 3-Lug Locking Barrel Extension & Bolt-Unlocking Cam Sleeve
 * (assembledPos: [5.4, 1.25, 0], spans local X ∈ [-2.6, +2.2] -> world X ∈ [2.8, 7.6])
 */
export function buildM82BarrelExtensionGeometry(): THREE.BufferGeometry {
  const outerSleeve = paintGeometry(
    new THREE.CylinderGeometry(0.98, 0.98, 4.8, 28)
      .rotateZ(Math.PI / 2)
      .translate(-0.2, 0, 0),
    M82_DARK_STEEL
  );
  // Flat anti-rotation guide keys on left/right + front twin barrel-spring anchor collar!
  const keyRail = paintGeometry(
    new THREE.BoxGeometry(4.6, 0.42, 2.02).translate(-0.2, 0, 0),
    M82_DARK_STEEL
  );
  const springAnchorCollar = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.56, 2.12).translate(1.92, 0, 0),
    M82_BRIGHT_STEEL
  );

  const solid = csgUnion([outerSleeve, keyRail, springAnchorCollar]);

  // Hollow internal bore for barrel breech & 3-lug bolt head + right ejection window + angled cam slot!
  const innerBore = paintGeometry(
    new THREE.CylinderGeometry(0.76, 0.76, 5.2, 24)
      .rotateZ(Math.PI / 2)
      .translate(-0.2, 0, 0),
    M82_INNER_DARK
  );
  const camSlot = paintGeometry(
    new THREE.BoxGeometry(1.35, 0.45, 0.85)
      .rotateY(-0.42)
      .translate(-1.55, -0.58, 0.55),
    M82_INNER_DARK
  );
  const feedRampCut = paintGeometry(
    new THREE.BoxGeometry(1.4, 0.65, 0.92)
      .rotateZ(0.38)
      .translate(-2.1, -0.72, 0),
    M82_BRIGHT_STEEL
  );

  return csgSubtract(solid, [innerBore, camSlot, feedRampCut]);
}

/**
 * U-04: Twin Parallel Heavy Barrel Return Springs & Front Anchor Hooks
 * (assembledPos: [11.5, 1.25, 0], spans local X ∈ [-4.1, +4.1] -> world X ∈ [7.4, 15.6])
 * Stretches along X during the 2.4-unit short-recoil barrel stroke and pulls the barrel back into battery!
 */
export function buildM82BarrelSpringsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const zPos = side * 0.84;
    parts.push(
      paintGeometry(
        createHelicalSpring({
          axis: 'x',
          start: -3.95,
          end: 3.95,
          centerY: 0,
          centerZ: zPos,
          coilRadius: 0.22,
          wireRadius: 0.048,
          coils: 22,
          radialSegments: 8,
          tubularSegmentsPerCoil: 14,
        }),
        M82_SPRING_STEEL
      ),
      paintGeometry(
        new THREE.TorusGeometry(0.18, 0.045, 8, 16).translate(-4.1, 0, zPos),
        M82_BRIGHT_STEEL
      ),
      paintGeometry(
        new THREE.TorusGeometry(0.18, 0.045, 8, 16).translate(4.1, 0, zPos),
        M82_BRIGHT_STEEL
      )
    );
  }
  return mergeParts(parts);
}

/**
 * U-05: Ventilated Stamped Sheet-Steel Upper Receiver, 27-MOA Full Picatinny Rail & Front Iron Sight
 * (assembledPos: [0, 0, 0], isShell: true)
 * Spans X ∈ [-20.8, +16.5], Y ∈ [+0.20, +2.74], Z ∈ [-1.18, +1.18] — mates 100% flush with Lower at Y = +0.20!
 */
export function buildM82UpperReceiverGeometry(): THREE.BufferGeometry {
  // Authentic Barrett octagonal/trapezoidal sheet-steel upper receiver cross-section in (Z, Y), extruded along X
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

  // Hollow interior tunnel + massive .50 BMG right-side ejection port + charging handle slot + 24 oval forend cooling vents!
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
    // Massive 12.7x99mm (.50 BMG) Right-Side Ejection Port (X ∈ [2.2, 7.85])
    paintGeometry(
      new THREE.BoxGeometry(5.65, 1.22, 1.1).translate(5.02, 1.32, 0.85),
      M82_INNER_DARK
    ),
    // Right-Side Reciprocating Charging Handle Track Slot (X ∈ [-5.6, 2.3])
    paintGeometry(
      new THREE.BoxGeometry(7.9, 0.44, 1.1).translate(-1.65, 1.25, 0.85),
      M82_INNER_DARK
    ),
  ];

  // Signature Barrett Ventilated Forend: 2 rows x 6 elongated oval cooling slots piercing both Left & Right walls (X ∈ [8.5, 15.2])!
  for (let i = 0; i < 6; i++) {
    const vx = 8.75 + i * 1.22;
    // Upper sloped-shoulder row of oval vents
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.24, 0.24, 2.8, 14)
          .scale(1.85, 1, 1)
          .rotateX(Math.PI / 2)
          .translate(vx, 1.95, 0),
        M82_INNER_DARK
      )
    );
    // Lower side-wall row of oval vents
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.24, 0.24, 2.8, 14)
          .scale(1.85, 1, 1)
          .rotateX(Math.PI / 2)
          .translate(vx, 1.05, 0),
        M82_INNER_DARK
      )
    );
  }

  const upperShell = csgSubtract(rawUpper, cutters);

  const subParts: THREE.BufferGeometry[] = [upperShell];

  // Front synthetic-lined circular barrel guide bushing collar at X = +16.35, Y = +1.25
  const bushingOuter = paintGeometry(
    new THREE.CylinderGeometry(1.02, 1.04, 0.72, 26)
      .rotateZ(Math.PI / 2)
      .translate(16.25, 1.25, 0),
    M82_DARK_STEEL
  );
  const bushingHole = paintGeometry(
    new THREE.CylinderGeometry(0.76, 0.76, 1.1, 24)
      .rotateZ(Math.PI / 2)
      .translate(16.25, 1.25, 0),
    M82_INNER_DARK
  );
  subParts.push(csgSubtract(bushingOuter, [bushingHole]));

  // Full-Length 27-MOA MIL-STD-1913 Picatinny Top Rail (X ∈ [-14.2, +15.8], Y ∈ [2.42, 2.74])
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(30.0, 0.18, 0.86).translate(0.8, 2.5, 0),
      M82_DARK_STEEL
    )
  );
  for (let s = 0; s < 35; s++) {
    const rx = -13.6 + s * 0.84;
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.46, 0.16, 1.08).translate(rx, 2.66, 0),
        M82_PARKERIZED
      )
    );
  }

  // Flip-up Hooded Backup Front Iron Sight at X = +15.35, Y = 2.74..3.55 + Rear Flip Peep at X = -13.6
  const frontHoodOuter = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.38, 0.52, 20)
      .rotateZ(Math.PI / 2)
      .translate(15.35, 3.16, 0),
    M82_DARK_STEEL
  );
  const frontHoodHole = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.75, 18)
      .rotateZ(Math.PI / 2)
      .translate(15.35, 3.16, 0),
    M82_INNER_DARK
  );
  subParts.push(
    csgSubtract(frontHoodOuter, [frontHoodHole]),
    paintGeometry(
      new THREE.CylinderGeometry(0.045, 0.055, 0.34, 10).translate(
        15.35,
        3.08,
        0
      ),
      M82_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.68, 0.52, 0.68).translate(-13.65, 2.96, 0),
      M82_DARK_STEEL
    )
  );

  // Brass deflector wedge behind right ejection port (X = +1.85, Z = +1.18)
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.75, 0.92, 0.32)
        .rotateY(0.35)
        .translate(1.85, 1.32, 1.16),
      M82_DARK_STEEL
    )
  );

  return applyM82UpperUVs(mergeParts(subParts));
}

/**
 * U-06: Folding Heavy-Duty Carry Handle (clamped to Picatinny rail ahead of scope at assembledPos: [10.8, 2.74, 0])
 * Folded outward-right at a combat 42° cant so it clears the 50mm Leupold objective bell with zero collision!
 */
export function buildM82CarryHandleGeometry(): THREE.BufferGeometry {
  // Picatinny rail clamp block sitting flush on Y_rail = 2.74 (Y_local = 0)
  const railClamp = paintGeometry(
    new THREE.BoxGeometry(2.15, 0.36, 1.24).translate(0, 0.1, 0),
    M82_DARK_STEEL
  );
  const clampNut = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 1.48, 6)
      .rotateX(Math.PI / 2)
      .translate(0, 0.08, 0),
    M82_BRIGHT_STEEL
  );

  // Folding steel bail arms + iconic 5-ribbed Barrett carry grip (canting outward to +Z)
  const bailGroup: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.11, 0.11, 1.45, 12).translate(-0.85, 0.72, 0),
      M82_PARKERIZED
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.11, 0.11, 1.45, 12).translate(2.15, 0.72, 0),
      M82_PARKERIZED
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.11, 0.11, 3.1, 12)
        .rotateZ(Math.PI / 2)
        .translate(0.65, 1.42, 0),
      M82_PARKERIZED
    ),
    // Ribbed polymer/steel carry handle grip barrel
    paintGeometry(
      new THREE.CylinderGeometry(0.32, 0.32, 2.45, 20)
        .rotateZ(Math.PI / 2)
        .translate(0.65, 1.42, 0),
      M82_SORBOTHANE
    ),
  ];
  for (let r = -2; r <= 2; r++) {
    bailGroup.push(
      paintGeometry(
        new THREE.TorusGeometry(0.34, 0.055, 8, 18)
          .rotateY(Math.PI / 2)
          .translate(0.65 + r * 0.44, 1.42, 0),
        M82_DARK_STEEL
      )
    );
  }

  const bailMerged = mergeParts(bailGroup);
  // Folded right by 52° around X so sniper sightline through Leupold scope is 100% unobstructed!
  bailMerged.rotateX(0.92);
  bailMerged.translate(0, 0.22, 0.45);

  return mergeParts([railClamp, clampNut, bailMerged]);
}

/**
 * U-07: Leupold Mark 4 LR/T 4.5-14x50mm M1 Sniper Scope w/ Coated Glass Lenses & 0..15 MIL Turrets
 * (assembledPos: [1.8, 4.10, 0], spans local X ∈ [-7.4, +7.8] -> world X ∈ [-5.6, +9.6])
 */
export function buildM82ScopeGeometry(): THREE.BufferGeometry {
  // Revolve smooth external optical housing along X axis (30mm main tube R = 0.56)
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.68, -7.4), // Rear rubberized eyepiece rim
    new THREE.Vector2(0.82, -7.4),
    new THREE.Vector2(0.82, -5.55), // Ocular bell
    new THREE.Vector2(0.66, -5.1),
    new THREE.Vector2(0.74, -4.85), // Knurled 4.5-14x magnification power ring
    new THREE.Vector2(0.74, -4.35),
    new THREE.Vector2(0.56, -4.15), // 30mm Main Tube (clamped by rear scope ring at X_local = -3.4!)
    new THREE.Vector2(0.56, 3.65), // 30mm Main Tube (clamped by front scope ring at X_local = +3.1!)
    new THREE.Vector2(0.88, 4.95), // Flared objective cone
    new THREE.Vector2(1.08, 5.55), // 50mm Front Objective Bell & Sunshade
    new THREE.Vector2(1.08, 7.8),
    new THREE.Vector2(0.94, 7.8), // Front sunshade lip
  ];
  const outerTube = new THREE.LatheGeometry(pts, 32);
  outerTube.rotateZ(-Math.PI / 2);
  paintGeometry(outerTube, M82_SCOPE_ANODIZED);

  // Recess front objective & rear ocular cavities so coated lenses sit realistically inset
  const frontRecess = paintGeometry(
    new THREE.CylinderGeometry(0.95, 0.95, 0.55, 28)
      .rotateZ(Math.PI / 2)
      .translate(7.62, 0, 0),
    M82_INNER_DARK
  );
  const rearRecess = paintGeometry(
    new THREE.CylinderGeometry(0.68, 0.68, 0.36, 26)
      .rotateZ(Math.PI / 2)
      .translate(-7.3, 0, 0),
    M82_INNER_DARK
  );
  const hollowedScope = csgSubtract(outerTube, [frontRecess, rearRecess]);

  // Central spherical erector saddle block at X_local = -0.3
  const saddleCube = paintGeometry(
    new THREE.SphereGeometry(0.74, 22, 18)
      .scale(1.15, 1.0, 1.0)
      .translate(-0.3, 0, 0),
    M82_SCOPE_ANODIZED
  );

  // Tall Leupold M1 Elevation Turret (Y_local ∈ [0.60, 1.42]) -> mapped to white 0..15 MIL ticks!
  const elevTurret = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.5, 0.84, 28).translate(-0.3, 1.02, 0),
    M82_TURRET_DRUM
  );
  const elevCap = paintGeometry(
    new THREE.CylinderGeometry(0.52, 0.48, 0.16, 28).translate(-0.3, 1.46, 0),
    M82_SCOPE_ANODIZED
  );

  // Right M1 Windage Turret (Z ∈ [0.60, 1.32]) -> mapped to white 0..15 MIL ticks!
  const windTurret = paintGeometry(
    new THREE.CylinderGeometry(0.44, 0.46, 0.74, 26)
      .rotateX(Math.PI / 2)
      .translate(-0.3, 0, 0.96),
    M82_TURRET_DRUM
  );
  const windCap = paintGeometry(
    new THREE.CylinderGeometry(0.47, 0.44, 0.14, 26)
      .rotateX(Math.PI / 2)
      .translate(-0.3, 0, 1.35),
    M82_SCOPE_ANODIZED
  );

  // Left Side-Focus Parallax Turret (Z ∈ [-1.24, -0.60])
  const parallaxTurret = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.44, 0.64, 24)
      .rotateX(Math.PI / 2)
      .translate(-0.3, 0, -0.92),
    M82_TURRET_DRUM
  );

  // Magnification power throw fin at X_local = -4.6
  const powerFin = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.28, 0.18)
      .rotateX(-0.65)
      .translate(-4.6, 0.78, -0.45),
    M82_SCOPE_ANODIZED
  );

  // Convex Multi-Coated Blue-Green Optical Glass Lenses (front 50mm objective & rear ocular!)
  const frontLens = paintGeometry(
    new THREE.SphereGeometry(0.95, 26, 20)
      .scale(0.18, 1.0, 1.0)
      .translate(7.42, 0, 0),
    M82_COATED_LENS
  );
  const rearLens = paintGeometry(
    new THREE.SphereGeometry(0.68, 22, 16)
      .scale(0.16, 1.0, 1.0)
      .translate(-7.18, 0, 0),
    M82_COATED_LENS
  );

  const merged = mergeParts([
    hollowedScope,
    saddleCube,
    elevTurret,
    elevCap,
    windTurret,
    windCap,
    parallaxTurret,
    powerFin,
    frontLens,
    rearLens,
  ]);
  return applyM82ScopeUVs(merged);
}

/**
 * U-08: Barrett Ultra-High Heavy-Duty Dual 30mm Picatinny Scope Rings
 * (assembledPos: [1.8, 2.74, 0])
 * Base clamps flush to Picatinny rail at Y_local = 0 (world 2.74); ring bore centers at Y_local = +1.36 (world 4.10)!
 */
export function buildM82ScopeRingsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (const rx of [-3.35, 3.05]) {
    // Lower Picatinny rail clamp base + pedestal riser
    const baseBlock = paintGeometry(
      new THREE.BoxGeometry(1.18, 0.95, 1.32).translate(rx, 0.36, 0),
      M82_DARK_STEEL
    );
    const ringOuter = paintGeometry(
      new THREE.CylinderGeometry(0.82, 0.82, 1.12, 28)
        .rotateZ(Math.PI / 2)
        .translate(rx, 1.36, 0),
      M82_DARK_STEEL
    );
    const capFlange = paintGeometry(
      new THREE.BoxGeometry(1.12, 0.24, 1.88).translate(rx, 1.36, 0),
      M82_DARK_STEEL
    );
    const ringSolid = csgUnion([baseBlock, ringOuter, capFlange]);

    const scopeBore = paintGeometry(
      new THREE.CylinderGeometry(0.565, 0.565, 1.5, 28)
        .rotateZ(Math.PI / 2)
        .translate(rx, 1.36, 0),
      M82_INNER_DARK
    );
    const weightHole = paintGeometry(
      new THREE.CylinderGeometry(0.18, 0.18, 1.6, 14)
        .rotateX(Math.PI / 2)
        .translate(rx, 0.48, 0),
      M82_INNER_DARK
    );
    parts.push(csgSubtract(ringSolid, [scopeBore, weightHole]));

    // Hex cross-bolt nut at rail + 4 stainless cap screws
    parts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.2, 0.2, 1.56, 6)
          .rotateX(Math.PI / 2)
          .translate(rx, 0.08, 0),
        M82_BRIGHT_STEEL
      )
    );
    for (const sx of [-0.32, 0.32]) {
      for (const sz of [-0.76, 0.76]) {
        parts.push(
          paintGeometry(
            new THREE.CylinderGeometry(0.08, 0.08, 0.34, 10).translate(
              rx + sx,
              1.4,
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
 * U-09: Heavy Machined Steel Bolt Carrier, Right Charging Handle & Rear Buffer Tail
 * (assembledPos: [-1.2, 1.25, 0], spans local X ∈ [-5.4, +3.6] -> world X ∈ [-6.6, +2.4])
 */
export function buildM82BoltCarrierGeometry(): THREE.BufferGeometry {
  const mainBlock = paintGeometry(
    new THREE.BoxGeometry(8.2, 1.38, 1.58).translate(-0.7, 0, 0),
    M82_DARK_STEEL
  );
  const rearBufferTail = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.58, 1.4, 22)
      .rotateZ(Math.PI / 2)
      .translate(-5.0, 0, 0),
    M82_BOLT_STEEL
  );
  const rawCarrier = csgUnion([mainBlock, rearBufferTail]);

  // Front cylindrical bolt stem socket + helical cam track + side weight-relief scallops!
  const boltSocket = paintGeometry(
    new THREE.CylinderGeometry(0.54, 0.54, 4.8, 22)
      .rotateZ(Math.PI / 2)
      .translate(1.5, 0, 0),
    M82_INNER_DARK
  );
  const camTrack = paintGeometry(
    new THREE.BoxGeometry(1.55, 0.55, 0.52)
      .rotateY(0.46)
      .translate(2.15, 0.58, 0.15),
    M82_INNER_DARK
  );
  const fluteL = paintGeometry(
    new THREE.BoxGeometry(5.4, 0.46, 0.32).translate(-1.2, 0.18, -0.82),
    M82_INNER_DARK
  );
  const fluteR = paintGeometry(
    new THREE.BoxGeometry(4.2, 0.46, 0.32).translate(-1.8, 0.18, 0.82),
    M82_INNER_DARK
  );
  const bottomSlot = paintGeometry(
    new THREE.BoxGeometry(6.8, 0.48, 0.68).translate(-1.1, -0.58, 0),
    M82_INNER_DARK
  );

  const carrierBody = csgSubtract(rawCarrier, [
    boltSocket,
    camTrack,
    fluteL,
    fluteR,
    bottomSlot,
  ]);

  // Heavy cylindrical knurled Right-Side Charging Handle at X_local = +2.35, Z ∈ [+0.78, +1.98]
  const handleNeck = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.22, 0.55, 16)
      .rotateX(Math.PI / 2)
      .translate(2.35, 0, 0.98),
    M82_DARK_STEEL
  );
  const handleKnob = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.82, 20)
      .rotateX(Math.PI / 2)
      .translate(2.35, 0, 1.58),
    M82_PARKERIZED
  );

  return mergeParts([carrierBody, handleNeck, handleKnob]);
}

/**
 * U-10: Short-Recoil Accelerator Arm & Pivot Pin ('加速子')
 * (assembledPos: [-3.4, 0.52, 0])
 * Pivots at local (0, 0, 0): when struck by recoiling Barrel Extension, top swings rearward (-X, rz > 0)
 * multiplying Bolt Carrier velocity!
 */
export function buildM82AcceleratorGeometry(): THREE.BufferGeometry {
  const axlePin = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.48, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M82_BRIGHT_STEEL
  );

  const armShape = new THREE.Shape();
  armShape.moveTo(-0.26, -0.28); // Bottom receiver abutment toe
  armShape.lineTo(0.24, -0.24);
  armShape.quadraticCurveTo(0.42, 0.42, 0.28, 1.12); // Curved front impact face struck by barrel extension
  armShape.lineTo(-0.18, 1.06); // Rear carrier-driving face
  armShape.quadraticCurveTo(-0.22, 0.42, -0.26, -0.28);
  armShape.closePath();

  const lever = new THREE.ExtrudeGeometry(armShape, {
    depth: 0.48,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  lever.translate(0, 0, -0.24);
  paintGeometry(lever, M82_BRIGHT_STEEL);

  const torsionSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.46,
      end: 0.46,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.24,
      wireRadius: 0.032,
      coils: 5,
    }).rotateX(Math.PI / 2),
    M82_SPRING_STEEL
  );

  return mergeParts([axlePin, lever, torsionSpring]);
}

/**
 * U-11: Massive .50 BMG 3-Lug Rotating Bolt Head, Heavy Claw Extractor & Plunger Ejector
 * (assembledPos: [2.4, 1.25, 0], spans local X ∈ [-1.85, +1.78] -> world X ∈ [0.55, 4.18])
 */
export function buildM82BoltGeometry(): THREE.BufferGeometry {
  const stem = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.48, 3.2, 24)
      .rotateZ(Math.PI / 2)
      .translate(-0.25, 0, 0),
    M82_BRIGHT_STEEL
  );
  const headCore = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 0.92, 24)
      .rotateZ(Math.PI / 2)
      .translate(1.32, 0, 0),
    M82_BRIGHT_STEEL
  );

  // Three massive 120°-spaced radial locking lugs around X ∈ [1.02, 1.74]
  const lugs: THREE.BufferGeometry[] = [stem, headCore];
  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI * 2) / 3 + Math.PI / 6;
    const lug = paintGeometry(
      new THREE.BoxGeometry(0.72, 0.42, 0.38)
        .translate(1.38, 0.62, 0)
        .rotateX(ang),
      M82_BRIGHT_STEEL
    );
    lugs.push(lug);
  }

  // Helical Bolt Cam Pin at X_local = -0.35, Y = +0.58
  lugs.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.18, 0.18, 0.56, 16).translate(
        -0.35,
        0.58,
        0
      ),
      M82_DARK_STEEL
    )
  );

  const solidBolt = mergeParts(lugs);

  // Recessed .50 BMG bolt face cup (20.4mm rim!)
  const faceCup = paintGeometry(
    new THREE.CylinderGeometry(0.44, 0.44, 0.24, 22)
      .rotateZ(Math.PI / 2)
      .translate(1.72, 0, 0),
    M82_INNER_DARK
  );
  const hollowedBolt = csgSubtract(solidBolt, [faceCup]);

  // Heavy right-side Claw Extractor + left bolt-face Plunger Ejector
  const extractor = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.28, 0.24).translate(1.18, 0.08, 0.54),
    M82_DARK_STEEL
  );
  const ejectorPin = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.28, 12)
      .rotateZ(Math.PI / 2)
      .translate(1.68, -0.14, -0.24),
    M82_BOLT_STEEL
  );

  return mergeParts([hollowedBolt, extractor, ejectorPin]);
}

/**
 * U-12: Heavy Two-Piece Firing Pin, Striker Extension & Helical Drive Spring
 * (assembledPos: [0.6, 1.25, 0], spans local X ∈ [-4.2, +3.55] -> world X ∈ [-3.6, +4.15])
 */
export function buildM82FiringPinGeometry(): THREE.BufferGeometry {
  const rearCollar = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.95, 18)
      .rotateZ(Math.PI / 2)
      .translate(-3.7, 0, 0),
    M82_BRIGHT_STEEL
  );
  // Bottom cocking tang at X_local = -2.85 (world X = -2.25) engaging upright Cocking Lever!
  const cockingTang = paintGeometry(
    new THREE.BoxGeometry(0.44, 0.58, 0.28).translate(-2.85, -0.42, 0),
    M82_BRIGHT_STEEL
  );
  const mainShaft = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.16, 5.2, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.6, 0, 0),
    M82_BRIGHT_STEEL
  );
  const strikerNeedle = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.14, 1.55, 16)
      .rotateZ(Math.PI / 2)
      .translate(2.75, 0, 0),
    M82_BRIGHT_STEEL
  );
  const driveSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -3.2,
      end: 0.65,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.26,
      wireRadius: 0.042,
      coils: 16,
    }),
    M82_SPRING_STEEL
  );

  return mergeParts([
    rearCollar,
    cockingTang,
    mainShaft,
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
