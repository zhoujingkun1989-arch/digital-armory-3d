import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../springHelper';
import {
  applyScarLowerUVs,
  applyScarMagUVs,
  applyScarSwatchUVs,
  SCAR_BRIGHT_STEEL,
  SCAR_DARK_STEEL,
  SCAR_FDE_COYOTE,
  SCAR_FDE_GRIP,
  SCAR_FDE_MAG,
  SCAR_FDE_RISER,
  SCAR_FDE_STOCK,
  SCAR_INNER_DARK,
  SCAR_RUBBER_BLACK,
  SCAR_SPRING_STEEL,
} from './scarGeometries';

const SCAR_FOLLOWER_ORANGE = '#ea580c';

// ==============================================================================
// 2B. POLYMER LOWER, GRIP & "UGG-BOOT" STOCK SUB-GROUP ('frame' rear · 5 PARTS)
// ==============================================================================

/**
 * F-04: Matte Coyote-Tan Polymer Lower Receiver w/ Flared STANAG Magwell & Ambi Controls
 * (assembledPos: [0, 0, 0], isShell: true)
 * Meets scar_upper_receiver bottom (Y = +0.35) 100% flush with zero gap!
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
  // Flared bottom STANAG magwell skirt bevel at Y ∈ [-2.38, -2.05]
  const magwellFlare = paintGeometry(
    new THREE.BoxGeometry(4.32, 0.34, 1.82).translate(2.5, -2.21, 0),
    SCAR_FDE_COYOTE
  );
  // Front pivot pin ear block reaching X = +4.95
  const frontPivotBlock = paintGeometry(
    new THREE.BoxGeometry(0.85, 0.96, 1.56).translate(4.52, -0.1, 0),
    SCAR_FDE_COYOTE
  );
  // Integral Curved Winter Trigger Guard Bow (X ∈ [-2.78, +0.55], Y ∈ [-2.28, -0.84], Z ∈ [-0.36, +0.36])
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

  // Cutters: FCG cavity, trigger slot, trigger-guard opening, vertical STANAG magwell chute, rear curve!
  const cutters: THREE.BufferGeometry[] = [
    // FCG pocket hollow
    paintGeometry(
      new THREE.BoxGeometry(5.1, 1.12, 1.18).translate(-2.35, -0.14, 0),
      SCAR_INNER_DARK
    ),
    // Trigger shoe slot
    paintGeometry(
      new THREE.BoxGeometry(1.45, 0.75, 0.56).translate(-1.68, -0.78, 0),
      SCAR_INNER_DARK
    ),
    // Gloved winter trigger-guard finger loop cutout
    paintGeometry(
      new THREE.BoxGeometry(2.65, 1.06, 1.1).translate(-1.12, -1.5, 0),
      SCAR_INNER_DARK
    ),
    // Vertical through-chute for 30-rd STANAG magazine (X ∈ [+1.00, +3.90])
    paintGeometry(
      new THREE.BoxGeometry(2.94, 3.1, 1.32).translate(2.45, -0.98, 0),
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

  // External molded magwell fence ribs + captured takedown pins + ambi magazine release + ping-pong bolt catch!
  const extras: THREE.BufferGeometry[] = [
    carvedLower,
    // Front & rear captured steel takedown pins
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 1.76, 16)
        .rotateX(Math.PI / 2)
        .translate(4.65, 0.14, 0),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 1.76, 16)
        .rotateX(Math.PI / 2)
        .translate(-5.2, 0.14, 0),
      SCAR_DARK_STEEL
    ),
    // Ambidextrous SCAR magazine release buttons (right oval button + left pivoting lever)
    paintGeometry(
      new THREE.BoxGeometry(0.86, 0.42, 0.16).translate(1.42, -0.68, 0.88),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(1.12, 0.42, 0.16).translate(1.28, -0.68, -0.88),
      SCAR_DARK_STEEL
    ),
    // Iconic SCAR left-side "ping-pong paddle" bolt catch/release lever
    paintGeometry(
      new THREE.BoxGeometry(0.58, 0.88, 0.16).translate(0.68, 0.02, -0.89),
      SCAR_DARK_STEEL
    ),
  ];

  return applyScarLowerUVs(mergeParts(extras));
}

/**
 * F-05: Swept Ergonomic FDE Pistol Grip (assembledPos: [-3.05, -0.88, 0])
 * Sweeps BACKWARD (-X) as it descends (-Y) at authentic ~24° SCAR/A2 grip angle; top boss overlaps lower flush!
 */
export function buildScarPistolGripGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // Top mounting collar (overlaps lower receiver bottom Y = -0.92 up to world Y = -0.74!)
  shape.moveTo(-2.05, 0.14);
  shape.lineTo(0.32, 0.14);
  // Front strap w/ A2 ergonomic middle-finger swell sweeping BACKWARD (-X) as -Y descends!
  shape.quadraticCurveTo(0.18, -0.85, -0.32, -1.62);
  shape.lineTo(-0.16, -1.78); // Crisp SCAR/A2 finger-ledge nub!
  shape.quadraticCurveTo(-0.56, -2.65, -1.18, -3.75);
  shape.lineTo(-1.68, -4.78);
  // Angled grip floorplate perpendicular to 24° swept axis
  shape.lineTo(-3.68, -4.45);
  // Swept-back palm swell & curved upper beavertail tang hugging rear of lower receiver
  shape.quadraticCurveTo(-3.22, -3.15, -2.62, -1.75);
  shape.quadraticCurveTo(-2.22, -0.72, -2.05, 0.14);
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

  // Bottom battery/oil storage cap
  const baseCap = paintGeometry(
    new THREE.BoxGeometry(2.05, 0.22, 1.28)
      .rotateZ(-0.16)
      .translate(-2.68, -4.64, 0),
    SCAR_RUBBER_BLACK
  );

  const merged = mergeParts([rawGrip, baseCap]);
  return applyScarSwatchUVs(merged, 0.34, 0.52, 0.12, 0.24, 0.12);
}

/**
 * F-06: Unmistakable "Ugg-Boot" Folding & 6-Position Telescoping FDE Buttstock
 * (assembledPos: [-12.20, 0.85, 0])
 * Front hinge block at local X = +5.78 (world X = -6.42) meets receiver rear (-6.40) 100% flush!
 * Rear flared boot face at local X = -5.65 (world X = -17.85) meets scar_buttpad 100% flush!
 */
export function buildScarButtstockGeometry(): THREE.BufferGeometry {
  // Iconic FN SCAR Mk 16 "Ugg-boot" side profile in (X, Y)
  const boot = new THREE.Shape();
  boot.moveTo(5.78, 1.58); // Top front at upper receiver hinge
  boot.lineTo(1.85, 1.54); // Forward telescoping sleeve spine
  boot.lineTo(-5.65, 1.48); // Rear upper comb under cheek riser
  boot.lineTo(-5.65, -3.22); // Tall flared Ugg-boot rear butt face!
  boot.lineTo(-4.45, -3.26); // Boot toe flat
  boot.quadraticCurveTo(-2.65, -2.45, -0.65, -1.48); // Signature curved boot arch!
  boot.lineTo(5.78, -1.28); // Lower front at receiver hinge
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

  // Sculpted side flutes, 3 iconic vertical SCAR reinforcement ribs/recesses & lower sling slot!
  const cutters: THREE.BufferGeometry[] = [
    // Angled lower foot/toe sling slot window
    paintGeometry(
      new THREE.BoxGeometry(1.35, 0.36, 1.8)
        .rotateZ(0.38)
        .translate(-3.95, -2.55, 0),
      SCAR_FDE_COYOTE
    ),
  ];

  // Recessed side panels between vertical strengthening ribs on telescoping housing
  for (const rx of [3.95, 2.35, 0.75]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.05, 1.65, 0.22).translate(rx, 0.12, 0.68),
        SCAR_FDE_COYOTE
      ),
      paintGeometry(
        new THREE.BoxGeometry(1.05, 1.65, 0.22).translate(rx, 0.12, -0.68),
        SCAR_FDE_COYOTE
      )
    );
  }

  const sculptedBoot = csgSubtract(rawBoot, cutters);

  // Heavy front folding hinge block + left folding hinge knuckles + large round FDE LOP latch button!
  const hingeMount = paintGeometry(
    new THREE.BoxGeometry(0.62, 3.02, 1.66).translate(5.52, 0.16, 0),
    SCAR_FDE_COYOTE
  );
  const knuckleTop = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 1.15, 16).translate(5.78, 0.92, -0.82),
    SCAR_DARK_STEEL
  );
  const knuckleBot = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 1.15, 16).translate(
      5.78,
      -0.55,
      -0.82
    ),
    SCAR_DARK_STEEL
  );
  const hingePin = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 2.95, 14).translate(5.78, 0.18, -0.82),
    SCAR_BRIGHT_STEEL
  );
  // Signature large circular 6-position telescoping LOP button on side of boot!
  const lopButton = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 1.48, 20)
      .rotateX(Math.PI / 2)
      .translate(-0.65, -0.18, 0),
    SCAR_FDE_RISER
  );
  // Fold-release latch button on right front hinge
  const foldButton = paintGeometry(
    new THREE.BoxGeometry(0.55, 0.68, 0.22).translate(5.15, 0.22, 0.84),
    SCAR_DARK_STEEL
  );

  const merged = mergeParts([
    sculptedBoot,
    hingeMount,
    knuckleTop,
    knuckleBot,
    hingePin,
    lopButton,
    foldButton,
  ]);
  return applyScarSwatchUVs(merged, 0.03, 0.31, 0.13, 0.38, 0.06);
}

/**
 * F-07: Tilt-Up Adjustable FDE Cheek Riser (assembledPos: [-12.15, 2.48, 0])
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

  const riserBody = new THREE.ExtrudeGeometry(saddle, {
    depth: 8.0,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  riserBody.rotateY(Math.PI / 2);
  riserBody.translate(-4.15, 0, 0);
  // Subtle SCAR tilt-up optic angle (elevated toward rear, hinged at front!)
  riserBody.rotateZ(-0.035);
  paintGeometry(riserBody, SCAR_FDE_RISER);

  // Front hinge pin + cross-bolt elevation lock button
  const frontPin = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 1.64, 14)
      .rotateX(Math.PI / 2)
      .translate(3.55, -0.32, 0),
    SCAR_DARK_STEEL
  );
  const adjustButton = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 1.68, 18)
      .rotateX(Math.PI / 2)
      .translate(-1.25, -0.22, 0),
    SCAR_DARK_STEEL
  );

  const merged = mergeParts([riserBody, frontPin, adjustButton]);
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
  // Subtle ergonomic concave shoulder pocket along rear face (local X ≈ -0.55 at heel & toe)
  padShape.quadraticCurveTo(-0.36, 0.0, -0.55, -2.42);
  padShape.lineTo(0.18, -2.46);
  padShape.closePath();

  const padBody = new THREE.ExtrudeGeometry(padShape, {
    depth: 1.4,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  padBody.translate(0, 0, -0.7);
  paintGeometry(padBody, SCAR_RUBBER_BLACK);

  // Horizontal anti-slip sorbothane ribs on rear face
  const parts: THREE.BufferGeometry[] = [padBody];
  for (let i = 0; i < 8; i++) {
    const ry = -1.95 + i * 0.54;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.12, 0.16, 1.32).translate(-0.46, ry, 0),
        SCAR_INNER_DARK
      )
    );
  }

  return mergeParts(parts);
}

// ==============================================================================
// 3. FIRE CONTROL GROUP ('fire_control' · 4 PARTS)
// ==============================================================================

/**
 * FC-01: Rotary Hammer & Dual-Coil Torsion Spring (assembledPos: [-0.35, -0.08, 0])
 * Pivot at local (0, 0, 0); cocked upright/back so rz < 0 swings FORWARD (+X) into scar_firing_pin!
 */
export function buildScarHammerGeometry(): THREE.BufferGeometry {
  const pivotHub = paintGeometry(
    new THREE.CylinderGeometry(0.25, 0.25, 1.02, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    SCAR_BRIGHT_STEEL
  );

  const shape = new THREE.Shape();
  shape.moveTo(-0.22, -0.05);
  shape.lineTo(0.2, -0.14);
  shape.lineTo(0.26, 0.58);
  shape.lineTo(0.14, 1.12); // Striking face
  shape.lineTo(-0.36, 1.04); // Rear hammer spur / disconnector hook notch
  shape.lineTo(-0.44, 0.44);
  shape.closePath();

  const arm = new THREE.ExtrudeGeometry(shape, {
    depth: 0.44,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  arm.translate(0, 0, -0.22);
  arm.rotateZ(0.48); // Cocked rearward angle
  paintGeometry(arm, SCAR_BRIGHT_STEEL);

  const coilL = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.48,
      end: -0.25,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.31,
      wireRadius: 0.032,
      coils: 3.5,
    }).rotateX(Math.PI / 2),
    SCAR_SPRING_STEEL
  );
  const coilR = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.25,
      end: 0.48,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.31,
      wireRadius: 0.032,
      coils: 3.5,
    }).rotateX(Math.PI / 2),
    SCAR_SPRING_STEEL
  );
  const legL = paintGeometry(
    new THREE.CylinderGeometry(0.03, 0.03, 1.55, 8)
      .rotateZ(Math.PI / 2 + 0.14)
      .translate(-0.78, -0.18, -0.38),
    SCAR_SPRING_STEEL
  );
  const legR = paintGeometry(
    new THREE.CylinderGeometry(0.03, 0.03, 1.55, 8)
      .rotateZ(Math.PI / 2 + 0.14)
      .translate(-0.78, -0.18, 0.38),
    SCAR_SPRING_STEEL
  );

  return mergeParts([pivotHub, arm, coilL, coilR, legL, legR]);
}

/**
 * FC-02: Curved SCAR Trigger & Primary Sear Nose (assembledPos: [-1.75, -0.42, 0])
 * Pivot at local (0, 0, 0); finger shoe hangs down (-Y) so rz < 0 pulls shoe BACKWARD (-X)!
 */
export function buildScarTriggerGeometry(): THREE.BufferGeometry {
  const pin = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.06, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    SCAR_DARK_STEEL
  );

  const shoeProfile = new THREE.Shape();
  shoeProfile.moveTo(-0.18, -0.08);
  shoeProfile.lineTo(0.2, -0.08);
  shoeProfile.quadraticCurveTo(0.04, -0.82, 0.28, -1.38);
  shoeProfile.lineTo(0.04, -1.48);
  shoeProfile.quadraticCurveTo(-0.26, -0.86, -0.18, -0.08);
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
    new THREE.BoxGeometry(0.92, 0.32, 0.16).translate(0.42, 0.18, -0.24),
    SCAR_DARK_STEEL
  );
  const searBarR = paintGeometry(
    new THREE.BoxGeometry(0.92, 0.32, 0.16).translate(0.42, 0.18, 0.24),
    SCAR_DARK_STEEL
  );
  const rearTail = paintGeometry(
    new THREE.BoxGeometry(0.76, 0.24, 0.58).translate(-0.42, 0.04, 0),
    SCAR_DARK_STEEL
  );

  return mergeParts([pin, shoe, searBarL, searBarR, rearTail]);
}

/**
 * FC-03: Semi-Auto Disconnector & Spring (assembledPos: [-1.85, -0.24, 0])
 */
export function buildScarDisconnectorGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.46, -0.18);
  shape.lineTo(0.48, -0.18);
  shape.lineTo(0.58, 0.34);
  shape.lineTo(0.24, 0.54);
  shape.lineTo(0.06, 0.32);
  shape.lineTo(-0.38, 0.12);
  shape.closePath();

  const body = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  body.translate(0, 0, -0.1);
  paintGeometry(body, SCAR_BRIGHT_STEEL);

  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.42,
      end: -0.06,
      centerX: -0.24,
      centerZ: 0,
      coilRadius: 0.08,
      wireRadius: 0.02,
      coils: 5,
    }),
    SCAR_SPRING_STEEL
  );

  return mergeParts([body, spring]);
}

/**
 * FC-04: Ambidextrous S-1-A Fire Selector Drum & Twin Sculpted Levers (assembledPos: [-3.45, -0.15, 0])
 */
export function buildScarSelectorGeometry(): THREE.BufferGeometry {
  const drum = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 1.72, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    SCAR_DARK_STEEL
  );
  // Left & Right SCAR sculpted tear-drop ambidextrous selector levers pointing toward "1" (Semi) / angled ready
  const leverL = paintGeometry(
    new THREE.BoxGeometry(1.12, 0.32, 0.16)
      .rotateZ(-0.52)
      .translate(-0.28, 0.18, -0.9),
    SCAR_RUBBER_BLACK
  );
  const hubL = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.16, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.88),
    SCAR_RUBBER_BLACK
  );
  const leverR = paintGeometry(
    new THREE.BoxGeometry(0.96, 0.3, 0.16)
      .rotateZ(-0.52)
      .translate(-0.22, 0.14, 0.9),
    SCAR_RUBBER_BLACK
  );
  const hubR = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.16, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.88),
    SCAR_RUBBER_BLACK
  );

  return mergeParts([drum, leverL, hubL, leverR, hubR]);
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

  // Hollow top feed throat + magazine catch slot on left wall!
  const throatHollow = paintGeometry(
    new THREE.BoxGeometry(2.25, 2.2, 0.86).translate(0, 1.65, 0),
    SCAR_INNER_DARK
  );
  const catchNotch = paintGeometry(
    new THREE.BoxGeometry(0.52, 0.28, 0.22).translate(-0.82, 1.05, -0.58),
    SCAR_INNER_DARK
  );
  const hollowed = csgSubtract(rawBody, [throatHollow, catchNotch]);

  // Stamped STANAG side anti-crush ribs + rear weld spine + steel feed lips!
  const parts: THREE.BufferGeometry[] = [hollowed];
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

  // Polished steel STANAG feed lips at top (y = +2.58)
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(2.45, 0.26, 0.98).translate(0, 2.58, 0),
      SCAR_BRIGHT_STEEL
    )
  );

  return applyScarMagUVs(mergeParts(parts));
}

/**
 * M-02: Anti-Tilt Polymer STANAG Follower (assembledPos: [2.45, -1.35, 0])
 */
export function buildScarMagFollowerGeometry(): THREE.BufferGeometry {
  const deck = paintGeometry(
    new THREE.BoxGeometry(2.22, 0.26, 0.82).translate(0, 0.15, 0),
    SCAR_FOLLOWER_ORANGE
  );
  const stepRidge = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 2.12, 14)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.3, 0.15),
    SCAR_FOLLOWER_ORANGE
  );
  const frontLeg = paintGeometry(
    new THREE.BoxGeometry(0.22, 1.05, 0.76).translate(0.95, -0.38, 0),
    SCAR_FOLLOWER_ORANGE
  );
  const rearLeg = paintGeometry(
    new THREE.BoxGeometry(0.22, 1.05, 0.76).translate(-0.95, -0.38, 0),
    SCAR_FOLLOWER_ORANGE
  );
  return mergeParts([deck, stepRidge, frontLeg, rearLeg]);
}

/**
 * M-03: Curved Rectangular STANAG Magazine Coil Spring (assembledPos: [2.45, -1.80, 0])
 */
export function buildScarMagSpringGeometry(): THREE.BufferGeometry {
  const coils = 11;
  const stepsPerCoil = 24;
  const totalSteps = coils * stepsPerCoil;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const yMid = -7.25 + u * 7.65; // -7.25 at floorplate -> +0.40 under follower
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
  return paintGeometry(tube, SCAR_SPRING_STEEL);
}

/**
 * M-04: Iconic FDE Ranger Floorplate w/ Rubberized Pull-Loop Tab
 * (assembledPos: [3.17, -9.40, 0], assembledRot: [0, 0, 0.15])
 * Upper flanged sleeve (local Y ∈ [-0.24, +0.20]) wraps over bottom of scar_mag_body with ZERO gap!
 */
export function buildScarMagFloorplateGeometry(): THREE.BufferGeometry {
  // Flanged FDE base collar wrapping cleanly up over the bottom 0.20 units of scar_mag_body!
  const collarOuter = paintGeometry(
    new THREE.BoxGeometry(2.94, 0.44, 1.32).translate(0, -0.02, 0),
    SCAR_FDE_COYOTE
  );
  const socketRecess = paintGeometry(
    new THREE.BoxGeometry(2.68, 0.26, 1.1).translate(0, 0.12, 0),
    SCAR_INNER_DARK
  );
  const baseCap = csgSubtract(collarOuter, [socketRecess]);

  // Iconic Magpul Ranger Plate FDE rubberized tactical finger pull-loop underneath!
  const loopOuter = paintGeometry(
    new THREE.BoxGeometry(2.15, 0.92, 0.88).translate(0, -0.62, 0),
    SCAR_FDE_COYOTE
  );
  const loopHole = paintGeometry(
    new THREE.BoxGeometry(1.42, 0.52, 1.2).translate(0, -0.58, 0),
    SCAR_INNER_DARK
  );
  const rangerLoop = csgSubtract(loopOuter, [loopHole]);

  const merged = mergeParts([baseCap, rangerLoop]);
  return applyScarSwatchUVs(merged, 0.34, 0.52, 0.26, 0.39, 0.12);
}
