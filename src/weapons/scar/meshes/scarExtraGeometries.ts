import * as THREE from 'three';
import {
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  finalizeGeometry,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  applyScarLowerUVs,
  applyScarMagUVs,
  applyScarSwatchUVs,
  sanitizeScarGeometry,
  SCAR_BRIGHT_STEEL,
  SCAR_DARK_STEEL,
  SCAR_FDE_COYOTE,
  SCAR_FDE_GRIP,
  SCAR_FDE_MAG,
  SCAR_FDE_RISER,
  SCAR_FDE_STOCK,
  SCAR_INNER_DARK,
  SCAR_POLYMER_DARK,
  SCAR_RAIL_BEVEL,
  SCAR_RUBBER_BLACK,
  SCAR_SPRING_STEEL,
} from './scarGeometries';

const SCAR_FOLLOWER_ORANGE = '#ea580c';

// ==============================================================================
// 2B. POLYMER LOWER, GRIP & "UGG-BOOT" STOCK SUB-GROUP ('frame' rear · 5 PARTS)
// ==============================================================================

/**
 * F-01: Matte Coyote-Tan Polymer Lower Trigger Module w/ Flared STANAG Magwell & Ambi Controls
 * (assembledPos: [0, 0, 0], isShell: true)
 * Meets scar_upper_receiver bottom (Y = +0.35) 100% flush with zero gap!
 * Preserves Band B UV envelope X ∈ [-5.65, +4.95], Y ∈ [-2.38, +0.38] for S-1-A markings.
 */
export function buildScarLowerReceiverGeometry(): THREE.BufferGeometry {
  // Rear fire-control pocket block: X ∈ [-5.65, +0.55], Y ∈ [-0.92, +0.38], Z ∈ [-0.82, +0.82]
  const fcgHull = paintGeometry(
    new THREE.BoxGeometry(6.2, 1.3, 1.64).translate(-2.55, -0.27, 0),
    SCAR_FDE_COYOTE
  );
  // Forward vertical STANAG magazine well: X ∈ [+0.45, +4.55], Y ∈ [-2.35, +0.38], Z ∈ [-0.84, +0.84]
  const magwellHull = paintGeometry(
    new THREE.BoxGeometry(4.1, 2.73, 1.68).translate(2.5, -0.985, 0),
    SCAR_FDE_COYOTE
  );
  // Flared bottom STANAG magwell bevel skirt at Y ∈ [-2.38, -2.02]
  const magwellFlare = paintGeometry(
    new THREE.BoxGeometry(4.32, 0.36, 1.84).translate(2.5, -2.2, 0),
    SCAR_FDE_COYOTE
  );
  // Front pivot pin ear lug block reaching X = +4.95
  const frontPivotBlock = paintGeometry(
    new THREE.BoxGeometry(0.86, 0.98, 1.58).translate(4.52, -0.09, 0),
    SCAR_FDE_COYOTE
  );
  // Integral Enlarged Curved Winter Trigger Guard Bow (X ∈ [-2.78, +0.55], Y ∈ [-2.28, -0.84], Z ∈ [-0.36, +0.36])
  const guardOuter = paintGeometry(
    new THREE.BoxGeometry(3.33, 1.44, 0.72).translate(-1.12, -1.56, 0),
    SCAR_FDE_COYOTE
  );

  const solidLower = csgUnion([
    fcgHull,
    magwellHull,
    magwellFlare,
    frontPivotBlock,
    guardOuter,
  ]);

  // Cutters: FCG cavity, trigger slot, winter trigger-guard loop, flared STANAG magwell chute, rear tang curve
  const cutters: THREE.BufferGeometry[] = [
    // Deep FCG pocket hollow
    paintGeometry(
      new THREE.BoxGeometry(5.12, 1.14, 1.18).translate(-2.35, -0.13, 0),
      SCAR_INNER_DARK
    ),
    // Trigger & disconnector through-slot
    paintGeometry(
      new THREE.BoxGeometry(1.48, 0.78, 0.56).translate(-1.68, -0.78, 0),
      SCAR_INNER_DARK
    ),
    // Gloved winter trigger-guard finger loop cutout + beveled lower corners
    paintGeometry(
      new THREE.BoxGeometry(2.66, 1.06, 1.1).translate(-1.12, -1.5, 0),
      SCAR_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.65, 0.55, 1.1)
        .rotateZ(0.55)
        .translate(-2.62, -2.18, 0),
      SCAR_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.65, 0.55, 1.1)
        .rotateZ(-0.55)
        .translate(0.38, -2.18, 0),
      SCAR_INNER_DARK
    ),
    // Vertical through-chute for 30-rd STANAG magazine (X ∈ [+0.98, +3.92])
    paintGeometry(
      new THREE.BoxGeometry(2.94, 3.15, 1.32).translate(2.45, -0.98, 0),
      SCAR_INNER_DARK
    ),
    // Internal beveled funnel mouth inside flared magwell skirt
    paintGeometry(
      new THREE.BoxGeometry(3.16, 0.34, 1.52).translate(2.45, -2.28, 0),
      SCAR_INNER_DARK
    ),
    // Grip mounting tang mortise underneath at X = -3.05
    paintGeometry(
      new THREE.BoxGeometry(1.65, 0.24, 0.84).translate(-3.35, -0.88, 0),
      SCAR_INNER_DARK
    ),
    // Sculpted rear underside transition above swept beavertail grip
    paintGeometry(
      new THREE.BoxGeometry(1.75, 0.56, 1.9)
        .rotateZ(0.28)
        .translate(-5.15, -0.88, 0),
      SCAR_INNER_DARK
    ),
  ];

  const carvedLower = csgSubtract(solidLower, cutters);

  // External molded magwell fence ribs + captured takedown pins + ambi mag release + ping-pong bolt catch
  const extras: THREE.BufferGeometry[] = [
    carvedLower,

    // Molded coyote polymer mag-release fence ribs on right flank (Z = +0.86)
    paintGeometry(
      new THREE.BoxGeometry(1.18, 0.11, 0.08).translate(1.42, -0.38, 0.86),
      SCAR_FDE_COYOTE
    ),
    paintGeometry(
      new THREE.BoxGeometry(1.18, 0.11, 0.08).translate(1.42, -0.98, 0.86),
      SCAR_FDE_COYOTE
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.12, 0.71, 0.08).translate(2.05, -0.68, 0.86),
      SCAR_FDE_COYOTE
    ),

    // Molded coyote polymer fence ribs framing left ambi mag release & bolt catch (Z = -0.86)
    paintGeometry(
      new THREE.BoxGeometry(1.36, 0.11, 0.08).translate(1.25, -0.98, -0.86),
      SCAR_FDE_COYOTE
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.14, 0.62, 0.1).translate(0.32, 0.02, -0.86),
      SCAR_FDE_COYOTE
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.14, 0.62, 0.1).translate(1.04, 0.02, -0.86),
      SCAR_FDE_COYOTE
    ),

    // Molded horizontal STANAG magwell reinforcement ribs (left & right lower magwell walls)
    paintGeometry(
      new THREE.BoxGeometry(2.15, 0.14, 0.06).translate(3.15, -1.42, 0.86),
      SCAR_FDE_COYOTE
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.15, 0.14, 0.06).translate(3.15, -1.82, 0.86),
      SCAR_FDE_COYOTE
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.15, 0.14, 0.06).translate(3.15, -1.42, -0.86),
      SCAR_FDE_COYOTE
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.15, 0.14, 0.06).translate(3.15, -1.82, -0.86),
      SCAR_FDE_COYOTE
    ),

    // Front & rear captured steel takedown pins w/ enlarged left pull heads
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 1.76, 16)
        .rotateX(Math.PI / 2)
        .translate(4.65, 0.14, 0),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16)
        .rotateX(Math.PI / 2)
        .translate(4.65, 0.14, -0.89),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 1.76, 16)
        .rotateX(Math.PI / 2)
        .translate(-5.2, 0.14, 0),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16)
        .rotateX(Math.PI / 2)
        .translate(-5.2, 0.14, -0.89),
      SCAR_DARK_STEEL
    ),

    // Flush steel hammer & trigger cross-pin ends on receiver walls
    paintGeometry(
      new THREE.CylinderGeometry(0.095, 0.095, 1.68, 14)
        .rotateX(Math.PI / 2)
        .translate(-0.35, -0.08, 0),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.085, 0.085, 1.68, 14)
        .rotateX(Math.PI / 2)
        .translate(-1.75, -0.42, 0),
      SCAR_DARK_STEEL
    ),

    // Ambidextrous SCAR magazine release: right serrated oval button + catch bar + left pivoting paddle
    paintGeometry(
      new THREE.BoxGeometry(0.84, 0.4, 0.14).translate(1.42, -0.68, 0.88),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.2, 0.2, 0.16, 14)
        .rotateX(Math.PI / 2)
        .translate(1.06, -0.68, 0.89),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(1.14, 0.4, 0.14).translate(1.26, -0.68, -0.88),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.06, 0.06, 0.46, 10).translate(
        1.72,
        -0.68,
        -0.91
      ),
      SCAR_DARK_STEEL
    ),

    // Iconic SCAR left-side "ping-pong paddle" bolt catch/release (upper thumb paddle + lower hold-open tab)
    paintGeometry(
      new THREE.BoxGeometry(0.58, 0.48, 0.14).translate(0.68, 0.22, -0.9),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.36, 0.44, 0.13).translate(0.68, -0.22, -0.89),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.055, 0.055, 0.62, 10)
        .rotateZ(Math.PI / 2)
        .translate(0.68, 0.0, -0.92),
      SCAR_DARK_STEEL
    ),
  ];

  // Vertical serration ridges on right mag-catch button & horizontal ribs on left bolt-catch paddle
  for (let s = 0; s < 4; s++) {
    extras.push(
      paintGeometry(
        new THREE.BoxGeometry(0.05, 0.34, 0.04).translate(
          1.34 + s * 0.14,
          -0.68,
          0.96
        ),
        SCAR_INNER_DARK
      )
    );
  }
  for (let r = 0; r < 3; r++) {
    extras.push(
      paintGeometry(
        new THREE.BoxGeometry(0.5, 0.05, 0.04).translate(
          0.68,
          0.1 + r * 0.11,
          -0.98
        ),
        SCAR_INNER_DARK
      )
    );
  }

  return applyScarLowerUVs(mergeParts(extras));
}

/**
 * F-05: Swept Ergonomic FDE Pistol Grip (assembledPos: [-3.05, -0.88, 0])
 * Sweeps BACKWARD (-X) as it descends (-Y) at authentic ~24° SCAR/A2 grip angle; top boss overlaps lower flush!
 */
export function buildScarPistolGripGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // Top mounting collar (overlaps lower receiver bottom Y = -0.92 up to world Y = -0.74!)
  shape.moveTo(-2.08, 0.15);
  shape.lineTo(0.32, 0.15);
  // Front strap w/ A2 ergonomic middle-finger swell sweeping BACKWARD (-X) as -Y descends
  shape.quadraticCurveTo(0.18, -0.85, -0.32, -1.62);
  shape.lineTo(-0.14, -1.78); // Crisp SCAR/A2 middle-finger shelf!
  shape.quadraticCurveTo(-0.56, -2.65, -1.18, -3.75);
  shape.lineTo(-1.68, -4.78);
  // Angled grip floorplate perpendicular to 24° swept axis
  shape.lineTo(-3.68, -4.45);
  // Swept-back palm swell & curved upper beavertail tang hugging rear of lower receiver
  shape.quadraticCurveTo(-3.24, -3.15, -2.62, -1.75);
  shape.quadraticCurveTo(-2.22, -0.72, -2.08, 0.15);
  shape.closePath();

  const rawGrip = new THREE.ExtrudeGeometry(shape, {
    depth: 1.18,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.07,
    bevelSegments: 3,
  });
  rawGrip.translate(0, 0, -0.59);
  paintGeometry(rawGrip, SCAR_FDE_GRIP);

  // Hollow internal mounting screw tunnel + recessed side checkering panel frames + top tang slot
  const gripHollow = paintGeometry(
    new THREE.CylinderGeometry(0.34, 0.44, 4.15, 14)
      .rotateZ(-0.42)
      .translate(-1.82, -2.58, 0),
    SCAR_INNER_DARK
  );
  const panelRecessL = paintGeometry(
    new THREE.BoxGeometry(1.12, 2.55, 0.08)
      .rotateZ(-0.42)
      .translate(-1.68, -2.42, -0.68),
    SCAR_FDE_GRIP
  );
  const panelRecessR = paintGeometry(
    new THREE.BoxGeometry(1.12, 2.55, 0.08)
      .rotateZ(-0.42)
      .translate(-1.68, -2.42, 0.68),
    SCAR_FDE_GRIP
  );
  const carvedGrip = csgSubtract(rawGrip, [
    gripHollow,
    panelRecessL,
    panelRecessR,
  ]);

  const parts: THREE.BufferGeometry[] = [carvedGrip];

  // Tactile horizontal/angled checkering ridges inside left & right recessed panels + backstrap serrations
  for (let i = 0; i < 9; i++) {
    const t = -0.95 + i * 0.24;
    const cx = -1.68 + Math.sin(0.42) * t;
    const cy = -2.42 + Math.cos(0.42) * t;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.96, 0.06, 0.05)
          .rotateZ(-0.42)
          .translate(cx, cy, -0.65),
        SCAR_FDE_GRIP
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.96, 0.06, 0.05)
          .rotateZ(-0.42)
          .translate(cx, cy, 0.65),
        SCAR_FDE_GRIP
      )
    );
  }

  // Internal 1/4"-28 steel grip mounting bolt head
  parts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 0.55, 12)
        .rotateZ(-0.42)
        .translate(-0.98, -0.72, 0),
      SCAR_DARK_STEEL
    )
  );

  // Hinged bottom battery/oil storage compartment cap w/ front squeeze latch tab
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(2.06, 0.22, 1.28)
        .rotateZ(-0.16)
        .translate(-2.68, -4.64, 0),
      SCAR_POLYMER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.32, 0.16, 0.56)
        .rotateZ(-0.16)
        .translate(-1.74, -4.76, 0),
      SCAR_DARK_STEEL
    )
  );

  return applyScarSwatchUVs(mergeParts(parts), 0.34, 0.52, 0.12, 0.24, 0.12);
}

/**
 * F-06: Unmistakable "Ugg-Boot" Side-Folding & 6-Position Telescoping FDE Buttstock
 * (assembledPos: [-12.20, 0.85, 0])
 * Front hinge block at local X = +5.78 (world X = -6.42) meets receiver rear (-6.40) 100% flush!
 * Rear flared boot face at local X = -5.65 (world X = -17.85) meets scar_buttpad 100% flush!
 */
export function buildScarButtstockGeometry(): THREE.BufferGeometry {
  // Iconic FN SCAR Mk 16 "Ugg-boot" outer telescoping sleeve side profile in (X, Y)
  const boot = new THREE.Shape();
  boot.moveTo(4.45, 1.56); // Forward sleeve collar top
  boot.lineTo(1.85, 1.54); // Forward telescoping sleeve spine
  boot.lineTo(-5.65, 1.48); // Rear upper comb under cheek riser
  boot.lineTo(-5.65, -3.22); // Tall flared Ugg-boot rear butt face
  boot.lineTo(-4.45, -3.26); // Boot toe flat
  boot.quadraticCurveTo(-2.65, -2.45, -0.65, -1.48); // Signature curved boot arch
  boot.lineTo(4.45, -1.24); // Lower sleeve collar
  boot.closePath();

  const rawBoot = new THREE.ExtrudeGeometry(boot, {
    depth: 1.28,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  rawBoot.translate(0, 0, -0.64);
  paintGeometry(rawBoot, SCAR_FDE_STOCK);

  // Inner 6-position telescoping strut linking front hinge block (+5.52) into outer boot sleeve
  const innerStrut = paintGeometry(
    new THREE.BoxGeometry(6.4, 2.38, 1.08).translate(2.25, 0.16, 0),
    SCAR_FDE_COYOTE
  );

  // Sculpted side flutes, 3 vertical reinforcement ribs, LOP button counterbores & dual sling slots
  const bootCutters: THREE.BufferGeometry[] = [
    // Angled lower foot/toe tactical sling slot window
    paintGeometry(
      new THREE.BoxGeometry(1.38, 0.34, 1.8)
        .rotateZ(0.38)
        .translate(-3.95, -2.55, 0),
      SCAR_FDE_COYOTE
    ),
    // Upper rear vertical sling loop window near buttplate heel
    paintGeometry(
      new THREE.BoxGeometry(0.32, 1.08, 1.8).translate(-4.92, -0.82, 0),
      SCAR_FDE_COYOTE
    ),
    // Recessed circular bezel housing the iconic SCAR LOP adjustment button
    paintGeometry(
      new THREE.CylinderGeometry(0.54, 0.54, 1.52, 20)
        .rotateX(Math.PI / 2)
        .translate(-0.65, -0.18, 0),
      SCAR_FDE_COYOTE
    ),
  ];

  // Recessed side flutes between the 3 iconic vertical strengthening ribs on telescoping housing
  for (const rx of [3.55, 2.05, 0.55]) {
    bootCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.02, 1.66, 0.22).translate(rx, 0.14, 0.68),
        SCAR_FDE_COYOTE
      ),
      paintGeometry(
        new THREE.BoxGeometry(1.02, 1.66, 0.22).translate(rx, 0.14, -0.68),
        SCAR_FDE_COYOTE
      )
    );
  }

  const sculptedBoot = csgSubtract(rawBoot, bootCutters);

  // 6 position witness detents milled along inner telescoping strut flanks
  const strutCutters: THREE.BufferGeometry[] = [];
  for (let p = 0; p < 3; p++) {
    const dx = 4.62 + p * 0.24;
    strutCutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.08, 0.08, 1.18, 10)
          .rotateX(Math.PI / 2)
          .translate(dx, 0.16, 0),
        SCAR_INNER_DARK
      )
    );
  }
  const detailedStrut = csgSubtract(innerStrut, strutCutters);

  // Heavy front folding hinge block w/ vertical sliding receiver dovetail track
  const hingeMountRaw = paintGeometry(
    new THREE.BoxGeometry(0.66, 3.02, 1.68).translate(5.48, 0.16, 0),
    SCAR_FDE_COYOTE
  );
  const dovetailGrooveL = paintGeometry(
    new THREE.BoxGeometry(0.22, 3.1, 0.18).translate(5.74, 0.16, -0.68),
    SCAR_INNER_DARK
  );
  const dovetailGrooveR = paintGeometry(
    new THREE.BoxGeometry(0.22, 3.1, 0.18).translate(5.74, 0.16, 0.68),
    SCAR_INNER_DARK
  );
  const hingeMount = csgSubtract(hingeMountRaw, [
    dovetailGrooveL,
    dovetailGrooveR,
  ]);

  // Left-side heavy folding hinge knuckles (top, center, bottom) + bright steel hinge pin
  const knuckleTop = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.92, 16).translate(
      5.76,
      1.04,
      -0.82
    ),
    SCAR_DARK_STEEL
  );
  const knuckleMid = paintGeometry(
    new THREE.CylinderGeometry(0.23, 0.23, 0.88, 16).translate(
      5.76,
      0.16,
      -0.82
    ),
    SCAR_FDE_COYOTE
  );
  const knuckleBot = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.92, 16).translate(
      5.76,
      -0.72,
      -0.82
    ),
    SCAR_DARK_STEEL
  );
  const hingePin = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 2.96, 14).translate(
      5.76,
      0.16,
      -0.82
    ),
    SCAR_BRIGHT_STEEL
  );

  // Spring-loaded left-front hinge fold-unlock button + right-side folded retention latch hook
  const hingeLockButton = paintGeometry(
    new THREE.BoxGeometry(0.52, 0.66, 0.22).translate(5.22, 0.22, -0.84),
    SCAR_DARK_STEEL
  );
  const foldedCatchHook = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.62, 0.22).translate(5.18, 0.22, 0.84),
    SCAR_DARK_STEEL
  );

  // Signature large circular 6-position telescoping LOP button + dark steel bezel ring
  const lopBezel = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.48, 1.32, 20)
      .rotateX(Math.PI / 2)
      .translate(-0.65, -0.18, 0),
    SCAR_DARK_STEEL
  );
  const lopButton = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.38, 1.46, 20)
      .rotateX(Math.PI / 2)
      .translate(-0.65, -0.18, 0),
    SCAR_FDE_RISER
  );

  const merged = mergeParts([
    sculptedBoot,
    detailedStrut,
    hingeMount,
    knuckleTop,
    knuckleMid,
    knuckleBot,
    hingePin,
    hingeLockButton,
    foldedCatchHook,
    lopBezel,
    lopButton,
  ]);
  return applyScarSwatchUVs(merged, 0.03, 0.31, 0.13, 0.38, 0.06);
}

/**
 * F-07: Tilt-Up 2-Position Adjustable FDE Cheek Riser (assembledPos: [-12.15, 2.48, 0])
 * Straddles the top comb of scar_buttstock (world Y = +2.33) with skirts down to world Y = +1.88 — ZERO gap!
 */
export function buildScarCheekRiserGeometry(): THREE.BufferGeometry {
  // Inverted U-saddle cross section in (Z, Y) extruded along X ∈ [-4.15, +3.85]
  const saddle = new THREE.Shape();
  saddle.moveTo(-0.78, -0.6);
  saddle.lineTo(-0.78, 0.18);
  saddle.quadraticCurveTo(-0.74, 0.5, 0, 0.54);
  saddle.quadraticCurveTo(0.74, 0.5, 0.78, 0.18);
  saddle.lineTo(0.78, -0.6);
  saddle.lineTo(0.58, -0.6);
  saddle.lineTo(0.58, 0.1);
  saddle.quadraticCurveTo(0.52, 0.3, 0, 0.32);
  saddle.quadraticCurveTo(-0.52, 0.3, -0.58, 0.1);
  saddle.lineTo(-0.58, -0.6);
  saddle.closePath();

  const riserRaw = new THREE.ExtrudeGeometry(saddle, {
    depth: 8.0,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  riserRaw.rotateY(Math.PI / 2);
  riserRaw.translate(-4.15, 0, 0);
  // Subtle SCAR tilt-up optic angle (elevated toward rear, hinged at front!)
  riserRaw.rotateZ(-0.035);
  paintGeometry(riserRaw, SCAR_FDE_RISER);

  // Sculpted side scallop recesses around elevation lock button + angled front hinge clearance
  const riserCutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.34, 0.34, 1.72, 18)
        .rotateX(Math.PI / 2)
        .translate(-1.25, -0.22, 0),
      SCAR_FDE_RISER
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.75, 0.55, 1.9)
        .rotateZ(-0.52)
        .translate(3.82, 0.42, 0),
      SCAR_FDE_RISER
    ),
  ];
  const riserBody = csgSubtract(riserRaw, riserCutters);

  // Front steel pivot hinge pin + spring-loaded cross-bolt elevation lock button w/ serrated cap
  const frontPin = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 1.64, 14)
      .rotateX(Math.PI / 2)
      .translate(3.55, -0.32, 0),
    SCAR_DARK_STEEL
  );
  const adjustShaft = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 1.66, 18)
      .rotateX(Math.PI / 2)
      .translate(-1.25, -0.22, 0),
    SCAR_DARK_STEEL
  );
  const adjustCapR = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 0.1, 18)
      .rotateX(Math.PI / 2)
      .translate(-1.25, -0.22, 0.84),
    SCAR_DARK_STEEL
  );

  const merged = mergeParts([riserBody, frontPin, adjustShaft, adjustCapR]);
  return applyScarSwatchUVs(merged, 0.34, 0.52, 0.26, 0.39, 0.08);
}

/**
 * F-08: Curved Ribbed Black Rubber Buttpad (assembledPos: [-17.95, 0.05, 0])
 * Front collar lip at local X = +0.18 (world X = -17.77) overlaps scar_buttstock rear (-17.85);
 * Rear rubber shoulder pad reaches local X = -0.55 (world X = -18.50 exact)!
 */
export function buildScarButtpadGeometry(): THREE.BufferGeometry {
  const padShape = new THREE.Shape();
  padShape.moveTo(0.18, 2.34);
  padShape.lineTo(-0.46, 2.3);
  // Ergonomic concave shoulder pocket along rear face (local X ≈ -0.55 at heel & toe)
  padShape.quadraticCurveTo(-0.34, 0.0, -0.55, -2.42);
  padShape.lineTo(0.18, -2.46);
  padShape.closePath();

  const padRaw = new THREE.ExtrudeGeometry(padShape, {
    depth: 1.4,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  padRaw.translate(0, 0, -0.7);
  paintGeometry(padRaw, SCAR_RUBBER_BLACK);

  // Inner stock-mating lip socket + upper/lower recessed mounting screw counterbores
  const socketRecess = paintGeometry(
    new THREE.BoxGeometry(0.18, 4.46, 1.18).translate(0.16, -0.06, 0),
    SCAR_INNER_DARK
  );
  const screwHoleTop = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.36, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.44, 1.52, 0),
    SCAR_INNER_DARK
  );
  const screwHoleBot = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.36, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.46, -1.62, 0),
    SCAR_INNER_DARK
  );
  const padBody = csgSubtract(padRaw, [
    socketRecess,
    screwHoleTop,
    screwHoleBot,
  ]);

  // 8 horizontal anti-slip sorbothane ribs + recessed steel retaining screws
  const parts: THREE.BufferGeometry[] = [
    padBody,
    paintGeometry(
      new THREE.CylinderGeometry(0.1, 0.1, 0.18, 12)
        .rotateZ(Math.PI / 2)
        .translate(-0.28, 1.52, 0),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.1, 0.1, 0.18, 12)
        .rotateZ(Math.PI / 2)
        .translate(-0.3, -1.62, 0),
      SCAR_DARK_STEEL
    ),
  ];

  for (let i = 0; i < 8; i++) {
    const ry = -1.95 + i * 0.54;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.12, 0.15, 1.32).translate(-0.46, ry, 0),
        SCAR_INNER_DARK
      )
    );
  }

  return sanitizeScarGeometry(mergeParts(parts));
}

// ==============================================================================
// 3. FIRE CONTROL GROUP ('fire_control' · 4 PARTS)
// ==============================================================================

/**
 * FC-01: Rotary Hammer & Dual-Coil Torsion Mainspring (assembledPos: [-0.35, -0.08, 0])
 * Pivot at local (0, 0, 0); cocked-down rearward at f=0 (worldY_max <= 0.30, well below scar_bolt_carrier 0.78!)
 * so rz < 0 (-1.20 rad) swings UP & FORWARD (+X/+Y) into scar_firing_pin at Y=1.05!
 */
export function buildScarHammerGeometry(): THREE.BufferGeometry {
  const pivotHubRaw = paintGeometry(
    new THREE.CylinderGeometry(0.25, 0.25, 1.02, 18).rotateX(Math.PI / 2),
    SCAR_BRIGHT_STEEL
  );

  // Precision FN rotary hammer profile w/ primary sear step & rear disconnector hook notch
  const shape = new THREE.Shape();
  shape.moveTo(-0.24, -0.06);
  shape.lineTo(0.16, -0.18);
  shape.lineTo(0.24, -0.06); // Crisp primary sear catch notch!
  shape.lineTo(0.16, 0.04);
  shape.lineTo(0.28, 0.62);
  shape.lineTo(0.16, 1.14); // Hardened firing-pin striking face
  shape.lineTo(-0.26, 1.08);
  shape.lineTo(-0.42, 0.88); // Rear disconnector hook spur!
  shape.lineTo(-0.3, 0.72);
  shape.lineTo(-0.44, 0.38);
  shape.closePath();

  const armRaw = new THREE.ExtrudeGeometry(shape, {
    depth: 0.44,
    bevelEnabled: true,
    bevelThickness: 0.024,
    bevelSize: 0.022,
    bevelSegments: 2,
  });
  armRaw.translate(0, 0, -0.22);
  armRaw.rotateZ(1.52); // True cocked-down rearward angle on sear (clears BCG bottom!)
  paintGeometry(armRaw, SCAR_BRIGHT_STEEL);

  const hammerUnion = csgUnion([pivotHubRaw, armRaw]);

  // Hollow pivot pin bore + side mass-lightening pockets on cocked hammer web
  const pinBore = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 1.16, 14).rotateX(Math.PI / 2),
    SCAR_INNER_DARK
  );
  const webPocketL = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 0.08, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.55, 0.02, -0.23),
    SCAR_INNER_DARK
  );
  const webPocketR = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 0.08, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.55, 0.02, 0.23),
    SCAR_INNER_DARK
  );
  const hammerBody = csgSubtract(hammerUnion, [
    pinBore,
    webPocketL,
    webPocketR,
  ]);

  const coilL = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.49,
      end: -0.25,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.31,
      wireRadius: 0.032,
      coils: 4,
    }).rotateX(Math.PI / 2),
    SCAR_SPRING_STEEL
  );
  const coilR = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.25,
      end: 0.49,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.31,
      wireRadius: 0.032,
      coils: 4,
    }).rotateX(Math.PI / 2),
    SCAR_SPRING_STEEL
  );
  const springBridge = paintGeometry(
    new THREE.CylinderGeometry(0.03, 0.03, 0.48, 8)
      .rotateX(Math.PI / 2)
      .translate(-0.52, 0.12, 0),
    SCAR_SPRING_STEEL
  );

  return sanitizeScarGeometry(
    mergeParts([hammerBody, coilL, coilR, springBridge])
  );
}

/**
 * FC-02: Curved SCAR Trigger & Primary Sear Nose (assembledPos: [-1.75, -0.42, 0])
 * Pivot at local (0, 0, 0); finger shoe hangs down (-Y) so rz < 0 pulls shoe BACKWARD (-X)!
 */
export function buildScarTriggerGeometry(): THREE.BufferGeometry {
  const hubRaw = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.68, 16).rotateX(Math.PI / 2),
    SCAR_DARK_STEEL
  );

  const shoeProfile = new THREE.Shape();
  shoeProfile.moveTo(-0.18, -0.06);
  shoeProfile.lineTo(0.2, -0.06);
  shoeProfile.quadraticCurveTo(0.02, -0.82, 0.28, -1.38);
  shoeProfile.lineTo(0.04, -1.48);
  shoeProfile.quadraticCurveTo(-0.26, -0.86, -0.18, -0.06);
  shoeProfile.closePath();

  const shoe = new THREE.ExtrudeGeometry(shoeProfile, {
    depth: 0.38,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  shoe.translate(0, 0, -0.19);
  paintGeometry(shoe, SCAR_DARK_STEEL);

  const searBarL = paintGeometry(
    new THREE.BoxGeometry(0.94, 0.32, 0.15).translate(0.42, 0.18, -0.25),
    SCAR_DARK_STEEL
  );
  const searBarR = paintGeometry(
    new THREE.BoxGeometry(0.94, 0.32, 0.15).translate(0.42, 0.18, 0.25),
    SCAR_DARK_STEEL
  );
  // Rear selector-blocking tail (engaged by S-1-A safety cam in 'S')
  const rearTail = paintGeometry(
    new THREE.BoxGeometry(0.84, 0.24, 0.58).translate(-0.48, 0.05, 0),
    SCAR_DARK_STEEL
  );

  const rawTrigger = csgUnion([hubRaw, shoe, searBarL, searBarR, rearTail]);

  // Drill trigger pin bore + central disconnector pocket slot
  const pinBore = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 1.12, 14).rotateX(Math.PI / 2),
    SCAR_INNER_DARK
  );
  const discSlot = paintGeometry(
    new THREE.BoxGeometry(1.12, 0.38, 0.24).translate(-0.12, 0.22, 0),
    SCAR_INNER_DARK
  );
  const carvedTrigger = csgSubtract(rawTrigger, [pinBore, discSlot]);

  // Precision-ground bright steel primary sear nose + trigger return torsion coils + stationary mainspring legs
  const searNose = paintGeometry(
    new THREE.BoxGeometry(0.18, 0.12, 0.64).translate(0.82, 0.28, 0),
    SCAR_BRIGHT_STEEL
  );
  const trigCoilL = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.48,
      end: -0.34,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.23,
      wireRadius: 0.024,
      coils: 3,
    }).rotateX(Math.PI / 2),
    SCAR_SPRING_STEEL
  );
  const trigCoilR = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.34,
      end: 0.48,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.23,
      wireRadius: 0.024,
      coils: 3,
    }).rotateX(Math.PI / 2),
    SCAR_SPRING_STEEL
  );
  const legL = paintGeometry(
    new THREE.CylinderGeometry(0.03, 0.03, 1.56, 8)
      .rotateZ(Math.PI / 2 + 0.14)
      .translate(0.62, 0.16, -0.38),
    SCAR_SPRING_STEEL
  );
  const legR = paintGeometry(
    new THREE.CylinderGeometry(0.03, 0.03, 1.56, 8)
      .rotateZ(Math.PI / 2 + 0.14)
      .translate(0.62, 0.16, 0.38),
    SCAR_SPRING_STEEL
  );

  return sanitizeScarGeometry(
    mergeParts([carvedTrigger, searNose, trigCoilL, trigCoilR, legL, legR])
  );
}

/**
 * FC-03: Semi-Auto Disconnector & Coil Spring (assembledPos: [-1.85, -0.24, 0])
 */
export function buildScarDisconnectorGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.48, -0.2);
  shape.lineTo(0.48, -0.2);
  shape.lineTo(0.58, 0.32);
  shape.lineTo(0.32, 0.56); // Upper hammer-catching hook beak
  shape.lineTo(0.18, 0.42);
  shape.lineTo(0.28, 0.28);
  shape.lineTo(-0.04, 0.18);
  shape.lineTo(-0.42, 0.1);
  shape.closePath();

  const bodyRaw = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 1,
  });
  bodyRaw.translate(0, 0, -0.1);
  paintGeometry(bodyRaw, SCAR_BRIGHT_STEEL);

  // Pivot pin hole aligning with trigger pin ([-1.75, -0.42] -> local [+0.10, -0.18])
  const pivotHole = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.36, 12)
      .rotateX(Math.PI / 2)
      .translate(0.1, -0.12, 0),
    SCAR_INNER_DARK
  );
  const body = csgSubtract(bodyRaw, [pivotHole]);

  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.44,
      end: -0.06,
      centerX: -0.26,
      centerZ: 0,
      coilRadius: 0.075,
      wireRadius: 0.02,
      coils: 5.5,
    }),
    SCAR_SPRING_STEEL
  );

  return sanitizeScarGeometry(mergeParts([body, spring]));
}

/**
 * FC-04: Ambidextrous S-1-A Fire Selector Drum & Twin Sculpted FN Levers
 * (assembledPos: [-3.45, -0.35, 0])
 */
export function buildScarSelectorGeometry(): THREE.BufferGeometry {
  const drumRaw = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 1.72, 18).rotateX(Math.PI / 2),
    SCAR_DARK_STEEL
  );
  // Machined semi-auto sear relief cam flat + 3 detent pockets (S / 1 / A)
  const camCut = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.18, 0.62).translate(0.14, 0.12, 0),
    SCAR_INNER_DARK
  );
  const detentGroove = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.08, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.48),
    SCAR_INNER_DARK
  );
  const drum = csgSubtract(drumRaw, [camCut, detentGroove]);

  // Sculpted FN Herstal tear-drop lever profile w/ pointer beak
  const buildFnLever = (
    lengthX: number,
    zPos: number
  ): THREE.BufferGeometry => {
    const ls = new THREE.Shape();
    ls.moveTo(0.24, 0); // Forward pointer witness tip
    ls.lineTo(0.06, 0.2);
    ls.quadraticCurveTo(-lengthX * 0.55, 0.22, -lengthX, 0.14);
    ls.quadraticCurveTo(-lengthX - 0.1, 0, -lengthX, -0.14);
    ls.quadraticCurveTo(-lengthX * 0.55, -0.2, 0.06, -0.2);
    ls.closePath();

    const ext = new THREE.ExtrudeGeometry(ls, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    ext.translate(0, 0, -0.07);
    ext.rotateZ(-0.52); // Angled cleanly at "1" (Semi-Auto)
    ext.translate(0, 0, zPos);
    return paintGeometry(ext, SCAR_POLYMER_DARK);
  };

  // Left primary thumb lever (1.06 long) & slightly shorter right support-hand index lever (0.88 long)
  const leverL = buildFnLever(1.06, -0.9);
  const leverR = buildFnLever(0.88, 0.9);

  const hubL = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 0.16, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.89),
    SCAR_POLYMER_DARK
  );
  const hubR = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 0.16, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.89),
    SCAR_POLYMER_DARK
  );
  // Torx lever retention screws + tactile thumb ridges
  const screwL = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.19, 12)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.91),
    SCAR_DARK_STEEL
  );
  const screwR = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.19, 12)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.91),
    SCAR_DARK_STEEL
  );
  const ridgeL = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.08, 0.06)
      .rotateZ(-0.52)
      .translate(-0.58, 0.34, -0.99),
    SCAR_RAIL_BEVEL
  );
  const ridgeR = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.08, 0.06)
      .rotateZ(-0.52)
      .translate(-0.48, 0.28, 0.99),
    SCAR_RAIL_BEVEL
  );

  return sanitizeScarGeometry(
    mergeParts([
      drum,
      leverL,
      leverR,
      hubL,
      hubR,
      screwL,
      screwR,
      ridgeL,
      ridgeR,
    ])
  );
}

// ==============================================================================
// 4. 30-ROUND FDE TAN STANAG MAGAZINE GROUP ('magazine' · 4 PARTS — FLUSH FIT!)
// ==============================================================================

/**
 * Helper: STANAG 5.56x45mm centerline curve in local magazine coordinates (assembledPos: [2.45, -1.80, 0]):
 *  - Upper tower (y in [-1.20, +2.55]): straight vertical at x_center = 0 (fits vertical SCAR magwell!)
 *  - Lower body (y in [-7.60, -1.20]): gentle forward 5.56 arc reaching (x = +0.72, y = -7.60) with tangent angle +0.15 rad!
 */
function stanagCenterX(y: number): number {
  if (y >= -1.2) return 0;
  const u = Math.min(1, (-1.2 - y) / 6.4); // 0 at y=-1.2 -> 1 at y=-7.6
  return 0.72 * u * u;
}

/**
 * M-01: 30-Round FDE Tan STANAG Steel Magazine Body (assembledPos: [2.45, -1.80, 0], isShell: true)
 * Upper straight tower sits deep inside lower receiver magwell; bottom face at local (0.72, -7.60) meets Ranger floorplate flush!
 */
export function buildScarMagBodyGeometry(): THREE.BufferGeometry {
  const profile = new THREE.Shape();
  const halfW = 1.38;
  const steps = 24;

  // Rear spine from top (y = +2.55) down to bottom perpendicular plane centered at (0.72, -7.60) tilted +0.15 rad
  const cosA = Math.cos(0.15);
  const sinA = Math.sin(0.15);

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const yMid = 2.55 - u * (2.55 - -7.6);
    const xMid = stanagCenterX(yMid);
    const slopeAng = yMid >= -1.2 ? 0 : 0.15 * ((-1.2 - yMid) / 6.4);
    const px = xMid - Math.cos(slopeAng) * halfW;
    const py = yMid - Math.sin(slopeAng) * halfW;
    if (i === 0) profile.moveTo(px, py);
    else profile.lineTo(px, py);
  }

  // Exact bottom edge along the +0.15 rad plane through (0.72, -7.60)
  profile.lineTo(0.72 + cosA * halfW, -7.6 + sinA * halfW);

  // Front spine from bottom back up to top (y = +2.55)
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    const yMid = 2.55 - u * (2.55 - -7.6);
    const xMid = stanagCenterX(yMid);
    const slopeAng = yMid >= -1.2 ? 0 : 0.15 * ((-1.2 - yMid) / 6.4);
    const px = xMid + Math.cos(slopeAng) * halfW;
    const py = yMid + Math.sin(slopeAng) * halfW;
    profile.lineTo(px, py);
  }
  profile.closePath();

  const rawBody = new THREE.ExtrudeGeometry(profile, {
    depth: 1.12,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  rawBody.translate(0, 0, -0.56);
  paintGeometry(rawBody, SCAR_FDE_MAG);

  // Hollow top feed throat + front bullet ramp notch + rear bolt-catch follower slot + ambi mag-catch cutouts
  const magCutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(2.32, 2.35, 0.88).translate(0, 1.58, 0),
      SCAR_INNER_DARK
    ),
    // Front bullet-tip clearance scoop
    paintGeometry(
      new THREE.BoxGeometry(0.42, 0.34, 0.72).translate(1.28, 2.48, 0),
      SCAR_INNER_DARK
    ),
    // Rear bolt-catch trip cutout
    paintGeometry(
      new THREE.BoxGeometry(0.42, 0.42, 0.46).translate(-1.28, 2.42, -0.18),
      SCAR_INNER_DARK
    ),
    // Left STANAG magazine catch locking window
    paintGeometry(
      new THREE.BoxGeometry(0.54, 0.28, 0.22).translate(-0.82, 1.05, -0.58),
      SCAR_INNER_DARK
    ),
    // Right ambidextrous SCAR magazine catch notch
    paintGeometry(
      new THREE.BoxGeometry(0.54, 0.28, 0.22).translate(-0.82, 1.05, 0.58),
      SCAR_INNER_DARK
    ),
  ];
  const hollowed = csgSubtract(rawBody, magCutters);

  // Stamped STANAG side anti-crush ribs + over-insertion stop bead + inward-curled steel feed lips
  const parts: THREE.BufferGeometry[] = [
    hollowed,
    // Magwell insertion stop tab on rear spine
    paintGeometry(
      new THREE.BoxGeometry(0.14, 0.32, 0.56).translate(-1.42, 0.65, 0),
      SCAR_FDE_MAG
    ),
  ];

  for (const ry of [-2.2, -3.55, -4.9, -6.25]) {
    const cx = stanagCenterX(ry);
    const ang = 0.15 * ((-1.2 - ry) / 6.4);
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(2.05, 0.24, 1.24)
          .rotateZ(ang)
          .translate(cx, ry, 0),
        SCAR_FDE_MAG
      )
    );
  }

  // Twin inward-formed bright stainless STANAG feed lips w/ central presentation channel!
  const feedLipL = paintGeometry(
    new THREE.BoxGeometry(2.28, 0.22, 0.28)
      .rotateX(-0.28)
      .translate(-0.04, 2.58, -0.35),
    SCAR_BRIGHT_STEEL
  );
  const feedLipR = paintGeometry(
    new THREE.BoxGeometry(2.28, 0.22, 0.28)
      .rotateX(0.28)
      .translate(-0.04, 2.58, 0.35),
    SCAR_BRIGHT_STEEL
  );
  parts.push(feedLipL, feedLipR);

  return applyScarMagUVs(mergeParts(parts));
}

/**
 * M-02: 4-Way Anti-Tilt Polymer STANAG Follower (assembledPos: [2.45, -1.35, 0])
 */
export function buildScarMagFollowerGeometry(): THREE.BufferGeometry {
  const deck = paintGeometry(
    new THREE.BoxGeometry(2.24, 0.22, 0.82).translate(0, 0.14, 0),
    SCAR_FOLLOWER_ORANGE
  );
  // Staggered double-stack 5.56mm cartridge step ridge on right side
  const stepRidge = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 2.14, 14)
      .rotateZ(Math.PI / 2)
      .translate(0.02, 0.29, 0.18),
    SCAR_FOLLOWER_ORANGE
  );
  // Rear-left bolt-catch actuator tab (lifts SCAR ping-pong paddle on last round!)
  const boltCatchTab = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.24, 0.28).translate(-1.02, 0.28, -0.24),
    SCAR_FOLLOWER_ORANGE
  );
  // Long 4-way anti-tilt front & rear guide skirts + side stabilizing ribs + spring cleat
  const frontLeg = paintGeometry(
    new THREE.BoxGeometry(0.22, 1.18, 0.78).translate(0.96, -0.44, 0),
    SCAR_FOLLOWER_ORANGE
  );
  const rearLeg = paintGeometry(
    new THREE.BoxGeometry(0.22, 1.18, 0.78).translate(-0.96, -0.44, 0),
    SCAR_FOLLOWER_ORANGE
  );
  const springBoss = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.26, 0.38).translate(0, -0.08, 0),
    SCAR_FOLLOWER_ORANGE
  );

  return sanitizeScarGeometry(
    mergeParts([deck, stepRidge, boltCatchTab, frontLeg, rearLeg, springBoss])
  );
}

/**
 * M-03: Curved Rectangular STANAG Magazine Coil Spring (assembledPos: [2.45, -1.80, 0])
 */
export function buildScarMagSpringGeometry(): THREE.BufferGeometry {
  const coils = 12;
  const stepsPerCoil = 24;
  const totalSteps = coils * stepsPerCoil;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const yMid = -7.28 + u * 7.68; // -7.28 at floorplate -> +0.40 under follower
    const xMid = stanagCenterX(yMid);
    const theta = u * coils * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const dx = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.6) * 0.86;
    const dz = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.6) * 0.32;
    points.push(new THREE.Vector3(xMid + dx, yMid, dz));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(curve, totalSteps, 0.044, 8, false);
  return sanitizeScarGeometry(
    finalizeGeometry(paintGeometry(tube, SCAR_SPRING_STEEL))
  );
}

/**
 * M-04: Iconic FDE Ranger Floorplate w/ Overmolded Rubberized Pull-Loop Tab
 * (assembledPos: [3.17, -9.40, 0], assembledRot: [0, 0, 0.15])
 * Upper flanged sleeve (local Y ∈ [-0.24, +0.20]) wraps over bottom of scar_mag_body with ZERO gap!
 */
export function buildScarMagFloorplateGeometry(): THREE.BufferGeometry {
  // Flanged FDE base collar wrapping cleanly up over the bottom 0.20 units of scar_mag_body
  const collarOuter = paintGeometry(
    new THREE.BoxGeometry(2.96, 0.44, 1.32).translate(0, -0.02, 0),
    SCAR_FDE_COYOTE
  );
  const socketRecess = paintGeometry(
    new THREE.BoxGeometry(2.7, 0.26, 1.1).translate(0, 0.12, 0),
    SCAR_INNER_DARK
  );
  const baseCap = csgSubtract(collarOuter, [socketRecess]);

  // Iconic Magpul Ranger Plate FDE rubberized tactical finger pull-loop underneath
  const loopProfile = new THREE.Shape();
  loopProfile.moveTo(-1.18, -0.18);
  loopProfile.lineTo(1.18, -0.18);
  loopProfile.lineTo(0.92, -1.06);
  loopProfile.quadraticCurveTo(0, -1.18, -0.92, -1.06);
  loopProfile.closePath();

  const loopRaw = new THREE.ExtrudeGeometry(loopProfile, {
    depth: 0.88,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  loopRaw.translate(0, 0, -0.44);
  paintGeometry(loopRaw, SCAR_FDE_COYOTE);

  const loopHole = paintGeometry(
    new THREE.BoxGeometry(1.42, 0.5, 1.2).translate(0, -0.6, 0),
    SCAR_INNER_DARK
  );
  const rangerLoop = csgSubtract(loopRaw, [loopHole]);

  // Steel floorplate locking button + lower anti-slip rubber impact ribs
  const lockTab = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.1, 14).translate(0, -0.22, 0),
    SCAR_DARK_STEEL
  );
  const parts: THREE.BufferGeometry[] = [baseCap, rangerLoop, lockTab];
  for (let r = -2; r <= 2; r++) {
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.12, 0.08, 0.92).translate(r * 0.34, -1.12, 0),
        SCAR_RUBBER_BLACK
      )
    );
  }

  return applyScarSwatchUVs(mergeParts(parts), 0.34, 0.52, 0.26, 0.39, 0.12);
}
