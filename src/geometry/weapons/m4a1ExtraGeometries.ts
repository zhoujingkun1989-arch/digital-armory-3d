import * as THREE from 'three';
import {
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from '../springHelper';
import {
  applyM4a1LowerReceiverUVs,
  applyM4a1MagUVs,
  M4_ANODIZED_CHARCOAL,
  M4_ANODIZED_DARK,
  M4_BRIGHT_STEEL,
  M4_BUFFER_GOLD,
  M4_BUMPER_TAN,
  M4_FOLLOWER_TAN,
  M4_PARKERIZED_STEEL,
  M4_POLYMER,
  M4_POLYMER_ACCENT,
  M4_RUBBER,
  M4_SPRING_STEEL,
  M4_STAINLESS,
  M4_STANAG_GREY,
} from './m4a1Geometries';

// ============================================================================
// GROUP 2 ('frame'): LOWER RECEIVER, 14.5" BARREL, FSB & BUFFER/STOCK (9)
// ============================================================================

/**
 * F-01: Forged 7075-T6 M4A1 Lower Receiver w/ Buffer Tower, Flared STANAG Magwell,
 * Bolt Catch, Mag Release Fencing & Pins (assembledPos: [0, 0, 0] — top deck at Y = 0.28!)
 */
export function buildM4a1LowerReceiverGeometry(): THREE.BufferGeometry {
  // Side profile in (X, Y) combining rear FCG pocket (Y ∈ [-0.88, +0.28]),
  // rear buffer-extension tower (X ∈ [-5.80, -4.62], rising to Y = +1.84),
  // and forward flared STANAG magazine well (X ∈ [+0.55, +4.32], descending to Y = -2.22)!
  const side = new THREE.Shape();
  side.moveTo(-5.8, 0.42);
  side.lineTo(-5.8, 1.55);
  side.quadraticCurveTo(-5.75, 1.84, -5.2, 1.84);
  side.lineTo(-4.65, 1.48);
  side.lineTo(-4.62, 0.28); // Horizontal receiver split seam!
  side.lineTo(4.32, 0.28); // Front pivot boss top
  side.lineTo(4.32, -0.35);
  side.lineTo(4.12, -2.22); // Front magwell skirt
  side.lineTo(0.68, -2.22); // Rear magwell skirt
  side.lineTo(0.52, -0.88); // Transition to FCG bottom deck
  side.lineTo(-4.52, -0.88); // Pistol-grip mounting deck (Y = -0.88)
  side.quadraticCurveTo(-5.35, -0.58, -5.8, 0.42); // Curved rear tang web!
  side.closePath();

  const rawLower = new THREE.ExtrudeGeometry(side, {
    depth: 1.52,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  rawLower.translate(0, 0, -0.76);
  paintGeometry(rawLower, M4_ANODIZED_CHARCOAL);

  // Carve hollow FCG pocket, vertical STANAG magwell shaft, trigger slot & buffer-tower bore (Y = 1.05)!
  const fcgPocket = paintGeometry(
    new THREE.BoxGeometry(4.85, 1.12, 1.02).translate(-2.05, -0.18, 0),
    M4_ANODIZED_DARK
  );
  const magwellShaft = paintGeometry(
    new THREE.BoxGeometry(3.05, 2.85, 1.14).translate(2.4, -0.95, 0),
    M4_ANODIZED_DARK
  );
  const triggerSlot = paintGeometry(
    new THREE.BoxGeometry(1.35, 0.65, 0.54).translate(-1.75, -0.85, 0),
    M4_ANODIZED_DARK
  );
  const bufferTowerBore = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 1.8, 22)
      .rotateZ(Math.PI / 2)
      .translate(-5.25, 1.05, 0),
    M4_ANODIZED_DARK
  );

  const lowerShell = csgSubtract(rawLower, [
    fcgPocket,
    magwellShaft,
    triggerSlot,
    bufferTowerBore,
  ]);

  // Integral Enlarged Winter Trigger Guard Bow (X ∈ [-2.48, +0.62], curving to Y = -1.84)
  const guardOuter = paintGeometry(
    new THREE.BoxGeometry(3.12, 1.02, 0.52).translate(-0.92, -1.36, 0),
    M4_ANODIZED_CHARCOAL
  );
  const guardCut = paintGeometry(
    new THREE.BoxGeometry(2.58, 0.84, 0.78).translate(-0.92, -1.24, 0),
    M4_ANODIZED_DARK
  );
  const triggerGuard = csgSubtract(guardOuter, [guardCut]);

  // Flared beveled STANAG magwell bottom collar lip
  const magFlareOuter = paintGeometry(
    new THREE.BoxGeometry(3.58, 0.24, 1.68).translate(2.4, -2.1, 0),
    M4_ANODIZED_CHARCOAL
  );
  const magFlareHole = paintGeometry(
    new THREE.BoxGeometry(3.06, 0.4, 1.16).translate(2.4, -2.1, 0),
    M4_ANODIZED_DARK
  );
  const magFlare = csgSubtract(magFlareOuter, [magFlareHole]);

  // Right-side M4A1 Horizontal Mag-Catch Fencing Ribs & Serrated Oval Mag-Release Button
  const fenceTop = paintGeometry(
    new THREE.BoxGeometry(2.85, 0.14, 0.12).translate(1.25, -0.28, 0.8),
    M4_ANODIZED_CHARCOAL
  );
  const fenceVert = paintGeometry(
    new THREE.BoxGeometry(0.14, 0.92, 0.12).translate(2.62, -0.68, 0.8),
    M4_ANODIZED_CHARCOAL
  );
  const magButton = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.16, 16)
      .scale(1.25, 1, 0.85)
      .rotateX(Math.PI / 2)
      .translate(1.38, -0.68, 0.82),
    M4_ANODIZED_CHARCOAL
  );

  // Left-side AR-15 "Ping-Pong Paddle" Bolt Catch + Left Mag-Catch Bar + Pivot/Takedown Pins!
  const boltCatchPaddle = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.76, 0.14).translate(0.22, 0.06, -0.82),
    M4_BRIGHT_STEEL
  );
  const leftMagBar = paintGeometry(
    new THREE.BoxGeometry(1.78, 0.22, 0.08).translate(1.55, -0.68, -0.78),
    M4_BRIGHT_STEEL
  );
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 1.72, 16)
      .rotateX(Math.PI / 2)
      .translate(3.85, 0.02, 0),
    M4_BRIGHT_STEEL
  );
  const takedownPin = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 1.72, 16)
      .rotateX(Math.PI / 2)
      .translate(-4.95, 0.02, 0),
    M4_BRIGHT_STEEL
  );

  return applyM4a1LowerReceiverUVs(
    mergeParts([
      lowerShell,
      triggerGuard,
      magFlare,
      fenceTop,
      fenceVert,
      magButton,
      boltCatchPaddle,
      leftMagBar,
      pivotPin,
      takedownPin,
    ])
  );
}

/**
 * F-02: 14.5" Chrome-Lined M203-Stepped M4A1 Barrel w/ M4 Feed-Ramp Barrel Extension & Crush Washer
 * (assembledPos: [0, 1.05, 0] — spans X ∈ [3.55, 22.35])
 */
export function buildM4a1BarrelGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.24, 3.55),
    new THREE.Vector2(0.56, 3.55), // Steel M4 barrel extension breech
    new THREE.Vector2(0.56, 4.95),
    new THREE.Vector2(0.42, 5.15), // Chamber shoulder inside barrel nut
    new THREE.Vector2(0.36, 7.2), // Medium contour under KAC RAS
    new THREE.Vector2(0.35, 13.75),
    new THREE.Vector2(0.45, 13.85), // .750" Front Sight Base (FSB) journal
    new THREE.Vector2(0.45, 16.25),
    new THREE.Vector2(0.4, 16.35), // Forward M4A1 heavy barrel step
    new THREE.Vector2(0.4, 18.2),
    new THREE.Vector2(0.28, 18.3), // Signature M203 Grenade-Launcher Step-Down Neck!
    new THREE.Vector2(0.28, 19.45),
    new THREE.Vector2(0.39, 19.55), // Forward .680" muzzle contour
    new THREE.Vector2(0.39, 21.85),
    new THREE.Vector2(0.29, 21.88), // 1/2"-28 muzzle thread tenon inside A2 flash hider
    new THREE.Vector2(0.29, 22.35),
    new THREE.Vector2(0.17, 22.35),
  ];

  const lathe = new THREE.LatheGeometry(pts, 28);
  lathe.rotateZ(-Math.PI / 2);
  paintGeometry(lathe, M4_PARKERIZED_STEEL);

  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 19.4, 18)
      .rotateZ(Math.PI / 2)
      .translate(13.0, 0, 0),
    M4_ANODIZED_DARK
  );
  const chamber = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.29, 2.2, 18)
      .rotateZ(Math.PI / 2)
      .translate(4.65, 0, 0),
    M4_ANODIZED_DARK
  );
  const hollowed = csgSubtract(lathe, [bore, chamber]);

  // Bright Stainless Barrel Extension Ring + Top Indexing Pin + Muzzle Crush Washer at X = 21.87!
  const extCollar = paintGeometry(
    new THREE.CylinderGeometry(0.565, 0.565, 1.15, 24)
      .rotateZ(Math.PI / 2)
      .translate(4.15, 0, 0),
    M4_STAINLESS
  );
  const extBore = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.38, 1.4, 20)
      .rotateZ(Math.PI / 2)
      .translate(4.15, 0, 0),
    M4_ANODIZED_DARK
  );
  const crushWasher = paintGeometry(
    new THREE.CylinderGeometry(0.43, 0.41, 0.14, 24)
      .rotateZ(Math.PI / 2)
      .translate(21.84, 0, 0),
    M4_BRIGHT_STEEL
  );

  return mergeParts([
    hollowed,
    csgSubtract(extCollar, [extBore]),
    crushWasher,
  ]);
}

/**
 * F-03: USGI A2 Birdcage Flash Suppressor / Compensator (assembledPos: [22.95, 1.05, 0])
 * Spans X_local ∈ [-1.06, +1.15] => X_world ∈ [21.89, 24.10], flush against crush washer at 21.84..21.91!
 */
export function buildM4a1FlashHiderGeometry(): THREE.BufferGeometry {
  const body = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.45, 2.21, 26)
      .rotateZ(Math.PI / 2)
      .translate(0.045, 0, 0),
    M4_PARKERIZED_STEEL
  );
  const bfaGroove = paintGeometry(
    new THREE.TorusGeometry(0.45, 0.055, 8, 24)
      .rotateY(Math.PI / 2)
      .translate(-0.42, 0, 0),
    M4_ANODIZED_DARK
  );
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.31, 0.24, 2.5, 20)
      .rotateZ(Math.PI / 2)
      .translate(0.08, 0, 0),
    M4_ANODIZED_DARK
  );

  // 5 Top/Side Birdcage Flash-Suppression Slots across upper 180° (solid closed bottom!)
  const cutters: THREE.BufferGeometry[] = [bfaGroove, bore];
  for (const ang of [-1.42, -0.71, 0, 0.71, 1.42]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.06, 0.55, 0.14)
          .translate(0.36, 0.34, 0)
          .rotateX(ang),
        M4_ANODIZED_DARK
      )
    );
  }

  return csgSubtract(body, cutters);
}

/**
 * F-04: Forged A-Frame Triangular F-Marked Front Sight Base (FSB), Handguard Cap, Bayonet Lug & Swivel
 * (assembledPos: [15.05, 1.05, 0] — front sight post tip at Y_world = 3.52 co-witnessing A2 Carry Handle!)
 */
export function buildM4a1FrontSightBaseGeometry(): THREE.BufferGeometry {
  // Triangular A-Frame silhouette in (X, Y)
  const aFrame = new THREE.Shape();
  aFrame.moveTo(-1.18, 0.35);
  aFrame.lineTo(1.18, 0.35);
  aFrame.lineTo(0.46, 2.66); // Swept-back front leg up to sight ears
  aFrame.lineTo(-0.48, 2.66);
  aFrame.lineTo(-1.18, 0.35);
  aFrame.closePath();

  // Iconic central triangular lightening cutout inside A-frame tower!
  const triHole = new THREE.Path();
  triHole.moveTo(-0.68, 0.72);
  triHole.lineTo(0.52, 0.72);
  triHole.lineTo(-0.08, 1.92);
  triHole.closePath();
  aFrame.holes.push(triHole);

  const towerRaw = new THREE.ExtrudeGeometry(aFrame, {
    depth: 0.54,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  towerRaw.translate(0, 0, -0.27);
  paintGeometry(towerRaw, M4_PARKERIZED_STEEL);

  // Carve U-notch between protective front sight ears at top of tower
  const earSlot = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.48, 0.68).translate(-0.02, 2.52, 0),
    M4_ANODIZED_DARK
  );
  const tower = csgSubtract(towerRaw, [earSlot]);

  // Twin Barrel Journal Rings + Barrel Bore Subtraction
  const ringRear = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 0.68, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.84, 0, 0),
    M4_PARKERIZED_STEEL
  );
  const ringFront = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 0.68, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.84, 0, 0),
    M4_PARKERIZED_STEEL
  );
  const gasBoss = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.95, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.72, 0.78, 0),
    M4_PARKERIZED_STEEL
  );
  const barrelCut = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.45, 2.6, 20)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    M4_ANODIZED_DARK
  );
  const journals = csgSubtract(csgUnion([ringRear, ringFront, gasBoss]), [
    barrelCut,
  ]);

  // Stamped Triangular Handguard End-Cap at X_local = -1.28 (X_world = 13.77, capturing RAS front nose!)
  const hgCapOuter = paintGeometry(
    new THREE.CylinderGeometry(0.92, 0.92, 0.12, 24)
      .rotateZ(Math.PI / 2)
      .translate(-1.28, 0, 0),
    M4_PARKERIZED_STEEL
  );
  const hgCapHole = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.46, 0.3, 20)
      .rotateZ(Math.PI / 2)
      .translate(-1.28, 0, 0),
    M4_ANODIZED_DARK
  );
  const hgCap = csgSubtract(hgCapOuter, [hgCapHole]);

  // Square Front Sight Post (top at Y_local = +2.47 => Y_world = 3.52!) + Bayonet Lug + Sling Loop + Taper Pins
  const sightPost = paintGeometry(
    new THREE.BoxGeometry(0.09, 0.32, 0.09).translate(-0.02, 2.38, 0),
    M4_BRIGHT_STEEL
  );
  const bayoLug = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.34, 0.38).translate(0.75, -0.68, 0),
    M4_PARKERIZED_STEEL
  );
  const slingSwivel = paintGeometry(
    new THREE.TorusGeometry(0.32, 0.055, 8, 18).translate(-0.78, -0.85, 0),
    M4_PARKERIZED_STEEL
  );
  const pinRear = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.78, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.84, -0.44, 0),
    M4_BRIGHT_STEEL
  );
  const pinFront = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.78, 12)
      .rotateX(Math.PI / 2)
      .translate(0.84, -0.44, 0),
    M4_BRIGHT_STEEL
  );

  return mergeParts([
    tower,
    journals,
    hgCap,
    sightPost,
    bayoLug,
    slingSwivel,
    pinRear,
    pinFront,
  ]);
}

/**
 * F-05: Mil-Spec 6-Position Carbine Buffer Tube, Castle Nut & Receiver Endplate
 * (assembledPos: [-11.35, 1.05, 0] — spans X_local ∈ [-5.65, +5.85] => X_world ∈ [-17.00, -5.50])
 */
export function buildM4a1BufferTubeGeometry(): THREE.BufferGeometry {
  const tubeOuter = paintGeometry(
    new THREE.CylinderGeometry(0.68, 0.68, 11.5, 26)
      .rotateZ(Math.PI / 2)
      .translate(0.1, 0, 0),
    M4_ANODIZED_CHARCOAL
  );
  const bottomTrack = paintGeometry(
    new THREE.BoxGeometry(9.6, 0.34, 0.44).translate(-0.8, -0.74, 0),
    M4_ANODIZED_CHARCOAL
  );
  const solidTube = csgUnion([tubeOuter, bottomTrack]);

  // Hollow internal bore open at +X (so H2 buffer & spring are visible in X-Ray!) + 6 LOP detent holes
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.55, 0.55, 11.2, 22)
        .rotateZ(Math.PI / 2)
        .translate(0.45, 0, 0),
      M4_ANODIZED_DARK
    ),
  ];
  for (let p = 0; p < 6; p++) {
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.13, 0.13, 0.25, 12).translate(
          -4.6 + p * 1.15,
          -0.88,
          0
        ),
        M4_ANODIZED_DARK
      )
    );
  }
  const carvedTube = csgSubtract(solidTube, cutters);

  // Stamped Steel Receiver Endplate (X_world = -5.85) & Notched Castle Nut (X_world = -6.12)
  const endPlateOuter = paintGeometry(
    new THREE.CylinderGeometry(0.86, 0.86, 0.14, 24)
      .rotateZ(Math.PI / 2)
      .translate(5.5, -0.06, 0),
    M4_PARKERIZED_STEEL
  );
  const castleNutOuter = paintGeometry(
    new THREE.CylinderGeometry(0.82, 0.82, 0.38, 24)
      .rotateZ(Math.PI / 2)
      .translate(5.22, 0, 0),
    M4_PARKERIZED_STEEL
  );
  const nutBore = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.56, 0.8, 20)
      .rotateZ(Math.PI / 2)
      .translate(5.35, 0, 0),
    M4_ANODIZED_DARK
  );

  return mergeParts([
    carvedTube,
    csgSubtract(csgUnion([endPlateOuter, castleNutOuter]), [nutBore]),
  ]);
}

/**
 * F-06: H2 Heavy Carbine Recoil Buffer w/ Tungsten Weights & Urethane Bumper
 * (assembledPos: [-6.35, 1.05, 0] — spans X_local ∈ [-1.75, +1.85] => X_world ∈ [-8.10, -4.50])
 */
export function buildM4a1BufferGeometry(): THREE.BufferGeometry {
  const frontFace = paintGeometry(
    new THREE.CylinderGeometry(0.51, 0.51, 0.42, 22)
      .rotateZ(Math.PI / 2)
      .translate(1.64, 0, 0),
    M4_BUFFER_GOLD
  );
  const bodyShaft = paintGeometry(
    new THREE.CylinderGeometry(0.41, 0.41, 2.75, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.06, 0, 0),
    M4_BUFFER_GOLD
  );
  const rearBumper = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.39, 0.48, 20)
      .rotateZ(Math.PI / 2)
      .translate(-1.52, 0, 0),
    M4_BUMPER_TAN
  );
  const rollPin = paintGeometry(
    new THREE.CylinderGeometry(0.05, 0.05, 0.82, 10)
      .rotateX(Math.PI / 2)
      .translate(-1.12, 0, 0),
    M4_BRIGHT_STEEL
  );
  return mergeParts([frontFace, bodyShaft, rearBumper, rollPin]);
}

/**
 * F-07: Helical Stainless Carbine Action / Buffer Spring
 * (assembledPos: [-11.40, 1.05, 0], local X ∈ [-5.30, +5.30] => L0 = 10.60, compresses on recoil!)
 */
export function buildM4a1BufferSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: -5.3,
    end: 5.3,
    centerY: 0,
    centerZ: 0,
    coilRadius: 0.46,
    wireRadius: 0.052,
    coils: 24,
    radialSegments: 8,
    tubularSegmentsPerCoil: 16,
  });
  return paintGeometry(spring, M4_SPRING_STEEL);
}

/**
 * F-08: Colt M4 Waffle / Crane SOPMOD Collapsible Carbine Buttstock
 * (assembledPos: [-13.95, 1.05, 0] — spans X_local ∈ [-4.25, +3.85] => X_world ∈ [-18.20, -10.10])
 */
export function buildM4a1ButtstockGeometry(): THREE.BufferGeometry {
  // Side silhouette in (X, Y) of M4A1 collapsible buttstock
  const shape = new THREE.Shape();
  shape.moveTo(3.85, 0.88);
  shape.lineTo(-3.88, 0.88); // Inline top buffer sleeve comb
  shape.lineTo(-4.02, -3.78); // Rear buttplate face
  shape.lineTo(-3.22, -3.85); // Toe
  shape.lineTo(1.25, -1.25); // Angled M4 triangular brace strut
  shape.lineTo(3.85, -1.02);
  shape.closePath();

  // Iconic M4 triangular sling/lightening window!
  const braceWin = new THREE.Path();
  braceWin.moveTo(-2.75, -1.05);
  braceWin.lineTo(0.25, -1.05);
  braceWin.lineTo(-2.75, -2.75);
  braceWin.closePath();
  shape.holes.push(braceWin);

  const rawBody = new THREE.ExtrudeGeometry(shape, {
    depth: 1.18,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  rawBody.translate(0, 0, -0.59);
  paintGeometry(rawBody, M4_POLYMER);

  // Upper flared SOPMOD / M4 cheekweld saddle tube around Y_local = 0
  const cheekTube = paintGeometry(
    new THREE.CylinderGeometry(0.94, 0.94, 7.65, 24)
      .scale(1, 0.96, 1.28)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 0.02, 0),
    M4_POLYMER
  );

  // Hollow buffer-tube tunnel (R = 0.70) so stock slides cleanly onto m4a1_buffer_tube!
  const bufferTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.7, 0.7, 8.4, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    M4_POLYMER_ACCENT
  );

  const stockMain = csgSubtract(csgUnion([rawBody, cheekTube]), [bufferTunnel]);
  const parts: THREE.BufferGeometry[] = [stockMain];

  // Classic M4 Structural Waffle Grid Ribs on Left & Right Flanks + LOP Release Latch Lever + Rubber Buttpad!
  for (const rx of [-3.1, -1.9, -0.7, 0.5]) {
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.14, 1.25, 1.32).translate(rx, -0.82, 0),
        M4_POLYMER_ACCENT
      )
    );
  }

  // Spring-loaded LOP adjustment lever & cross-bolt nut under stock
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(2.65, 0.28, 0.56)
        .rotateZ(0.18)
        .translate(1.2, -1.32, 0),
      M4_POLYMER_ACCENT
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.22, 0.22, 0.55, 16).translate(
        2.15,
        -1.15,
        0
      ),
      M4_PARKERIZED_STEEL
    ),
    // Checkered Non-Slip Rubber Buttpad at X_local = -4.12 (X_world = -18.07..-18.22)
    paintGeometry(
      new THREE.BoxGeometry(0.36, 4.72, 1.34).translate(-4.08, -1.48, 0),
      M4_RUBBER
    )
  );

  return mergeParts(parts);
}

/**
 * F-09: USGI A2 Checkered Polymer Pistol Grip w/ Single Finger Indexing Shelf
 * (assembledPos: [-3.45, -0.88, 0] — top saddle at Y_local = +0.02 meets lower receiver Y = -0.88 FLUSH,
 *  and sweeps BACKWARD (-X) at authentic 25° AR-15 grip angle!)
 */
export function buildM4a1PistolGripGeometry(): THREE.BufferGeometry {
  const grip = new THREE.Shape();
  grip.moveTo(-1.12, 0.04); // Rear top under receiver tang
  grip.lineTo(1.02, 0.04); // Front top behind trigger guard
  grip.lineTo(0.45, -1.55); // Upper front strap
  grip.lineTo(0.66, -1.76); // Signature USGI A2 Single Finger Ledge!
  grip.lineTo(0.34, -1.98);
  grip.lineTo(-0.82, -4.48); // Swept-back lower front strap
  grip.lineTo(-2.88, -4.22); // Angled bottom baseplate
  grip.quadraticCurveTo(-2.22, -2.45, -1.58, -0.85); // Swept-back rear palm spine
  grip.quadraticCurveTo(-1.35, -0.25, -1.12, 0.04);
  grip.closePath();

  const body = new THREE.ExtrudeGeometry(grip, {
    depth: 1.12,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  body.translate(0, 0, -0.56);
  paintGeometry(body, M4_POLYMER);

  // Raised A2 side checkering panels on left & right flanks
  const panelL = paintGeometry(
    new THREE.BoxGeometry(1.18, 2.35, 0.08)
      .rotateZ(0.42)
      .translate(-0.78, -2.35, -0.61),
    M4_POLYMER_ACCENT
  );
  const panelR = paintGeometry(
    new THREE.BoxGeometry(1.18, 2.35, 0.08)
      .rotateZ(0.42)
      .translate(-0.78, -2.35, 0.61),
    M4_POLYMER_ACCENT
  );

  return mergeParts([body, panelL, panelR]);
}

// ============================================================================
// GROUP 3 ('fire_control'): HAMMER, TRIGGER/DISCONNECTOR & AUTO SELECTOR (3)
// ============================================================================

/**
 * FC-01: Upright M4A1 Notched Rotary Hammer & Dual-Coil Torsion Spring
 * (assembledPos: [-0.35, -0.05, 0] — pivot at local (0,0,0); rz < 0 swings +X forward into firing pin!)
 */
export function buildM4a1HammerGeometry(): THREE.BufferGeometry {
  const pivotHub = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.94, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M4_PARKERIZED_STEEL
  );

  // Upright cocked AR-15 hammer profile (tilted slightly back toward sear so rz = -0.82 swings +X into firing pin!)
  const hShape = new THREE.Shape();
  hShape.moveTo(-0.22, -0.1);
  hShape.lineTo(0.2, -0.1);
  hShape.lineTo(0.22, 0.65);
  hShape.lineTo(-0.18, 1.18); // Striking face
  hShape.lineTo(-0.62, 1.05); // Top M16/M4 auto-sear hook tail
  hShape.lineTo(-0.52, 0.42); // Disconnector notch
  hShape.closePath();

  const head = new THREE.ExtrudeGeometry(hShape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  head.translate(0, 0, -0.21);
  head.rotateZ(0.32);
  paintGeometry(head, M4_PARKERIZED_STEEL);

  const springL = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.44,
      end: -0.24,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.3,
      wireRadius: 0.032,
      coils: 3.5,
    }).rotateX(Math.PI / 2),
    M4_SPRING_STEEL
  );
  const springR = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.24,
      end: 0.44,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.3,
      wireRadius: 0.032,
      coils: 3.5,
    }).rotateX(Math.PI / 2),
    M4_SPRING_STEEL
  );

  return mergeParts([pivotHub, head, springL, springR]);
}

/**
 * FC-02: M4A1 Curved Trigger, Front Sear Nose & Central Disconnector
 * (assembledPos: [-1.75, -0.32, 0] — pivot at local (0,0,0); rz < 0 pulls shoe -X and dips front sear -Y!)
 */
export function buildM4a1TriggerGeometry(): THREE.BufferGeometry {
  const pin = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.96, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M4_BRIGHT_STEEL
  );

  // Curved finger bow descending into winter trigger guard
  const bow = new THREE.Shape();
  bow.moveTo(-0.16, -0.08);
  bow.lineTo(0.2, -0.08);
  bow.quadraticCurveTo(0.05, -0.82, 0.26, -1.32);
  bow.lineTo(0.04, -1.42);
  bow.quadraticCurveTo(-0.24, -0.85, -0.16, -0.08);
  bow.closePath();

  const shoe = new THREE.ExtrudeGeometry(bow, {
    depth: 0.38,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  shoe.translate(0, 0, -0.19);
  paintGeometry(shoe, M4_PARKERIZED_STEEL);

  // Forward primary sear nose (+X) + rear safety tail (-X) + stainless central disconnector hook!
  const searBar = paintGeometry(
    new THREE.BoxGeometry(1.75, 0.28, 0.48).translate(-0.08, 0.08, 0),
    M4_PARKERIZED_STEEL
  );
  const disconnector = paintGeometry(
    new THREE.BoxGeometry(1.05, 0.38, 0.18)
      .rotateZ(-0.12)
      .translate(0.18, 0.32, 0),
    M4_STAINLESS
  );

  return mergeParts([pin, shoe, searBar, disconnector]);
}

/**
 * FC-03: M4A1 3-Position (SAFE / SEMI / AUTO) Fire Selector Drum & Thumb Lever
 * (assembledPos: [-3.35, -0.22, 0] — centered on PBR SAFE/SEMI/AUTO dial!)
 */
export function buildM4a1SelectorGeometry(): THREE.BufferGeometry {
  const camDrum = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 1.62, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M4_PARKERIZED_STEEL
  );
  // Left-side teardrop serrated thumb lever pointing upward to SEMI (ready to fire!)
  const leftCap = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.14, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.82),
    M4_PARKERIZED_STEEL
  );
  const leftLever = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.88, 0.14).translate(0, 0.38, -0.84),
    M4_PARKERIZED_STEEL
  );
  // Right-side flush position indicator notch cap
  const rightCap = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.08, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.8),
    M4_BRIGHT_STEEL
  );

  return mergeParts([camDrum, leftCap, leftLever, rightCap]);
}

// ============================================================================
// GROUP 4 ('magazine'): 30-RD CURVED STANAG 4179 ALUMINUM MAGAZINE (4)
// ============================================================================

const STANAG_ARC_CX = 18.0;
const STANAG_ARC_CY = -1.25;
const STANAG_R_INNER = 16.64; // Front concave spine (x = +1.36 at y = -1.25)
const STANAG_R_OUTER = 19.36; // Rear convex spine   (x = -1.36 at y = -1.25)
const STANAG_ANG_END = 0.36; // 20.6° authentic 5.56mm STANAG gentle curve!

/**
 * M-01: 30-Round Curved USGI STANAG 4179 Dry-Film Grey Aluminum Magazine Body
 * (assembledPos: [2.40, -1.00, 0] — C1-continuous straight magwell tower + 0.36 rad arc!)
 */
export function buildM4a1MagBodyGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const arcSteps = 22;

  // Start at top-rear feed lip (-1.36, +1.05), go down straight rear tower to (-1.36, -1.25)
  shape.moveTo(-1.36, 1.05);
  shape.lineTo(-1.36, STANAG_ARC_CY);

  // Rear convex arc from ang = 0 to STANAG_ANG_END (0.36 rad)
  for (let i = 1; i <= arcSteps; i++) {
    const ang = (i / arcSteps) * STANAG_ANG_END;
    const px = STANAG_ARC_CX - Math.cos(ang) * STANAG_R_OUTER;
    const py = STANAG_ARC_CY - Math.sin(ang) * STANAG_R_OUTER;
    shape.lineTo(px, py);
  }

  // Radial bottom cut at ang = 0.36 rad -> up front concave arc back to (+1.36, -1.25)
  for (let i = arcSteps; i >= 0; i--) {
    const ang = (i / arcSteps) * STANAG_ANG_END;
    const px = STANAG_ARC_CX - Math.cos(ang) * STANAG_R_INNER;
    const py = STANAG_ARC_CY - Math.sin(ang) * STANAG_R_INNER;
    shape.lineTo(px, py);
  }

  // Straight front magwell tower up to (+1.36, +1.05)
  shape.lineTo(1.36, 1.05);
  shape.closePath();

  const rawMag = new THREE.ExtrudeGeometry(shape, {
    depth: 1.04,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  rawMag.translate(0, 0, -0.52);
  paintGeometry(rawMag, M4_STANAG_GREY);

  // Hollow top feed throat + left STANAG mag-catch locking slot!
  const throatHole = paintGeometry(
    new THREE.BoxGeometry(2.34, 1.85, 0.82).translate(0, 0.35, 0),
    M4_ANODIZED_DARK
  );
  const catchSlot = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.28, 0.24).translate(-0.55, 0.25, -0.52),
    M4_ANODIZED_DARK
  );
  const magShell = csgSubtract(rawMag, [throatHole, catchSlot]);

  // Stamped feed lips & rear bolt-catch notch collar
  const feedLipL = paintGeometry(
    new THREE.BoxGeometry(1.95, 0.16, 0.14).translate(-0.15, 1.1, -0.42),
    M4_STANAG_GREY
  );
  const feedLipR = paintGeometry(
    new THREE.BoxGeometry(1.95, 0.16, 0.14).translate(-0.15, 1.1, 0.42),
    M4_STANAG_GREY
  );

  return applyM4a1MagUVs(mergeParts([magShell, feedLipL, feedLipR]));
}

/**
 * M-02: USGI Enhanced Anti-Tilt Magazine Follower (assembledPos: [2.40, -0.35, 0])
 */
export function buildM4a1MagFollowerGeometry(): THREE.BufferGeometry {
  const deck = paintGeometry(
    new THREE.BoxGeometry(2.26, 0.24, 0.78).translate(0, 0.14, 0),
    M4_FOLLOWER_TAN
  );
  const stepGuide = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 2.15, 14)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.28, 0.16),
    M4_FOLLOWER_TAN
  );
  const frontLeg = paintGeometry(
    new THREE.BoxGeometry(0.2, 1.05, 0.72).translate(1.02, -0.42, 0),
    M4_FOLLOWER_TAN
  );
  const rearLeg = paintGeometry(
    new THREE.BoxGeometry(0.2, 1.15, 0.72).translate(-1.02, -0.46, 0),
    M4_FOLLOWER_TAN
  );
  return mergeParts([deck, stepGuide, frontLeg, rearLeg]);
}

/**
 * M-03: Curved Rectangular STANAG Magazine Spring (assembledPos: [2.40, -1.00, 0])
 * Follows the exact straight-to-0.36-rad STANAG centerline inside M-01!
 */
export function buildM4a1MagSpringGeometry(): THREE.BufferGeometry {
  const coils = 11;
  const stepsPerCoil = 24;
  const totalSteps = coils * stepsPerCoil;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const theta = u * coils * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const radialOff = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.6) * 0.92;
    const zOff = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.6) * 0.33;

    let px: number;
    let py: number;
    if (u < 0.22) {
      // Upper straight magwell section (y from +0.42 down to -1.25)
      const su = u / 0.22;
      px = radialOff;
      py = 0.42 - su * 1.67;
    } else {
      // Lower curved STANAG section (ang from 0 to 0.345 rad)
      const cu = (u - 0.22) / 0.78;
      const ang = cu * 0.345;
      const rCur = 18.0 - radialOff;
      px = STANAG_ARC_CX - Math.cos(ang) * rCur;
      py = STANAG_ARC_CY - Math.sin(ang) * rCur;
    }
    points.push(new THREE.Vector3(px, py, zOff));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(curve, totalSteps, 0.045, 8, false);
  return paintGeometry(tube, M4_SPRING_STEEL);
}

/**
 * M-04: Flush Stamped Aluminum STANAG Floorplate & Locking Tab
 * (assembledPos: [3.554, -8.591, 0], assembledRot: [0, 0, 0.36] — ZERO GAP mathematical fit!)
 */
export function buildM4a1MagFloorplateGeometry(): THREE.BufferGeometry {
  // Top rim overlaps +0.05 onto the bottom radial face of M-01 with side retention rails
  const basePlate = paintGeometry(
    new THREE.BoxGeometry(2.86, 0.16, 1.14).translate(0, -0.06, 0),
    M4_STANAG_GREY
  );
  const railL = paintGeometry(
    new THREE.BoxGeometry(2.84, 0.14, 0.09).translate(0, 0.05, -0.53),
    M4_STANAG_GREY
  );
  const railR = paintGeometry(
    new THREE.BoxGeometry(2.84, 0.14, 0.09).translate(0, 0.05, 0.53),
    M4_STANAG_GREY
  );
  const pullTab = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.08, 0.52).translate(0, -0.16, 0),
    M4_BRIGHT_STEEL
  );
  return mergeParts([basePlate, railL, railR, pullTab]);
}
