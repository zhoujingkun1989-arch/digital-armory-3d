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
  M4_RAIL_BEVEL,
  M4_RUBBER,
  M4_SPRING_STEEL,
  M4_STAINLESS,
  M4_STANAG_GREY,
  sanitizeM4Geometry,
} from './m4a1Geometries';

// ============================================================================
// GROUP 2 ('frame'): LOWER RECEIVER, 14.5" BARREL, FSB & BUFFER/STOCK (9)
// ============================================================================

/**
 * F-01: Forged 7075-T6 Colt M4A1 Lower Receiver w/ Buffer Tower, Flared STANAG Magwell,
 * Full Mag-Catch Fence, Ping-Pong Bolt Catch, Auto-Sear Pin & Buffer Retainer
 * (assembledPos: [0, 0, 0] — top deck at Y = 0.28!)
 */
export function buildM4a1LowerReceiverGeometry(): THREE.BufferGeometry {
  const side = new THREE.Shape();
  side.moveTo(-5.8, 0.42);
  side.lineTo(-5.8, 1.55);
  side.quadraticCurveTo(-5.75, 1.84, -5.2, 1.84);
  side.lineTo(-4.65, 1.48);
  side.lineTo(-4.62, 0.28); // Horizontal receiver split seam
  side.lineTo(4.32, 0.28); // Front pivot boss top
  side.lineTo(4.32, -0.35);
  side.lineTo(4.12, -2.22); // Front magwell skirt
  side.lineTo(0.68, -2.22); // Rear magwell skirt
  side.lineTo(0.52, -0.88); // Transition to FCG bottom deck
  side.lineTo(-4.52, -0.88); // Pistol-grip mounting deck (Y = -0.88)
  side.quadraticCurveTo(-5.35, -0.58, -5.8, 0.42); // Curved rear tang web
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

  const fcgPocket = paintGeometry(
    new THREE.BoxGeometry(4.85, 1.12, 1.02).translate(-2.05, -0.18, 0),
    M4_ANODIZED_DARK
  );
  const magwellShaft = paintGeometry(
    new THREE.BoxGeometry(3.05, 2.95, 1.14).translate(2.4, -0.95, 0),
    M4_ANODIZED_DARK
  );
  const triggerSlot = paintGeometry(
    new THREE.BoxGeometry(1.38, 0.68, 0.54).translate(-1.75, -0.85, 0),
    M4_ANODIZED_DARK
  );
  const bufferTowerBore = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 1.85, 24)
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

  // Pivoted USGI Aluminum Trigger Guard Bow w/ Front Detent Plunger & Rear Roll Pin
  const guardOuter = paintGeometry(
    new THREE.BoxGeometry(3.14, 1.02, 0.52).translate(-0.92, -1.36, 0),
    M4_ANODIZED_CHARCOAL
  );
  const guardCut = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.84, 0.82).translate(-0.92, -1.23, 0),
    M4_ANODIZED_DARK
  );
  const triggerGuard = csgSubtract(guardOuter, [guardCut]);

  // Flared beveled STANAG magwell bottom collar lip
  const magFlareOuter = paintGeometry(
    new THREE.BoxGeometry(3.58, 0.24, 1.68).translate(2.4, -2.1, 0),
    M4_ANODIZED_CHARCOAL
  );
  const magFlareHole = paintGeometry(
    new THREE.BoxGeometry(3.06, 0.42, 1.16).translate(2.4, -2.1, 0),
    M4_ANODIZED_DARK
  );
  const magFlare = csgSubtract(magFlareOuter, [magFlareHole]);

  // Right-side M4A1 Full Mag-Catch Fence (top, front vertical & lower button-surround ribs) + Serrated Mag Button
  const fenceTop = paintGeometry(
    new THREE.BoxGeometry(2.85, 0.13, 0.12).translate(1.25, -0.28, 0.8),
    M4_ANODIZED_CHARCOAL
  );
  const fenceVert = paintGeometry(
    new THREE.BoxGeometry(0.13, 0.92, 0.12).translate(2.62, -0.68, 0.8),
    M4_ANODIZED_CHARCOAL
  );
  const fenceBot = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.12, 0.11).translate(1.42, -1.06, 0.8),
    M4_ANODIZED_CHARCOAL
  );
  const magButton = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.16, 18)
      .scale(1.26, 1, 0.85)
      .rotateX(Math.PI / 2)
      .translate(1.38, -0.68, 0.82),
    M4_ANODIZED_CHARCOAL
  );
  const magCatchStud = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.18, 12)
      .rotateX(Math.PI / 2)
      .translate(1.38, -0.68, 0.84),
    M4_BRIGHT_STEEL
  );

  // Left-side AR-15 "Ping-Pong Paddle" Bolt Catch (upper serrated paddle + lower heel button + mounting ears)
  const boltCatchUpper = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.46, 0.14).translate(0.22, 0.22, -0.83),
    M4_BRIGHT_STEEL
  );
  const boltCatchLower = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.34, 0.13).translate(0.22, -0.16, -0.82),
    M4_BRIGHT_STEEL
  );
  const boltCatchEar = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.3, 0.14).translate(0.22, 0.04, -0.78),
    M4_ANODIZED_CHARCOAL
  );
  const leftMagBar = paintGeometry(
    new THREE.BoxGeometry(1.78, 0.22, 0.08).translate(1.55, -0.68, -0.78),
    M4_BRIGHT_STEEL
  );

  // Buffer Retainer Nipple inside Buffer Tower + Pivot/Takedown Pins + Hammer/Trigger/Auto-Sear Cross-Pins!
  const bufferRetainer = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.09, 0.24, 12).translate(-4.72, 0.48, 0),
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
  const hammerPinEnds = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 1.56, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.35, -0.05, 0),
    M4_BRIGHT_STEEL
  );
  const triggerPinEnds = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 1.56, 12)
      .rotateX(Math.PI / 2)
      .translate(-1.75, -0.32, 0),
    M4_BRIGHT_STEEL
  );
  // Genuine Colt M4A1 Third-Hole Auto-Sear Pin above selector!
  const autoSearPinEnds = paintGeometry(
    new THREE.CylinderGeometry(0.068, 0.068, 1.56, 12)
      .rotateX(Math.PI / 2)
      .translate(-2.25, 0.11, 0),
    M4_BRIGHT_STEEL
  );

  return applyM4a1LowerReceiverUVs(
    mergeParts([
      lowerShell,
      triggerGuard,
      magFlare,
      fenceTop,
      fenceVert,
      fenceBot,
      magButton,
      magCatchStud,
      boltCatchUpper,
      boltCatchLower,
      boltCatchEar,
      leftMagBar,
      bufferRetainer,
      pivotPin,
      takedownPin,
      hammerPinEnds,
      triggerPinEnds,
      autoSearPinEnds,
    ])
  );
}

/**
 * F-02: 14.5" USGI Government-Profile Chrome-Lined M4A1 Barrel w/ M203 Step-Cut,
 * 8-Lug M4 Feed-Ramp Barrel Extension, 6-Groove 5.56mm Rifling, Recessed Crown & Crush Washer
 * (assembledPos: [0, 1.05, 0] — spans X ∈ [3.55, 22.38])
 */
export function buildM4a1BarrelGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.24, 3.55),
    new THREE.Vector2(0.56, 3.55), // Steel M4 barrel extension breech
    new THREE.Vector2(0.56, 4.8),
    new THREE.Vector2(0.615, 4.82), // Extension locating flange
    new THREE.Vector2(0.615, 4.96),
    new THREE.Vector2(0.48, 5.05), // Chamber reinforce inside barrel nut
    new THREE.Vector2(0.34, 6.95), // USGI Government slim profile under handguard
    new THREE.Vector2(0.34, 13.68),
    new THREE.Vector2(0.45, 13.8), // .750" Front Sight Base (FSB) journal behind handguard cap
    new THREE.Vector2(0.45, 16.25),
    new THREE.Vector2(0.4, 16.35), // Forward .680" carbine contour
    new THREE.Vector2(0.4, 17.75),
    new THREE.Vector2(0.27, 17.85), // Authentic M203 Grenade-Launcher Front Latch Step-Cut!
    new THREE.Vector2(0.27, 19.22),
    new THREE.Vector2(0.4, 19.32), // Forward .680" muzzle contour
    new THREE.Vector2(0.4, 21.84),
    new THREE.Vector2(0.295, 21.87), // 1/2"-28 UNEF muzzle thread tenon
    new THREE.Vector2(0.295, 22.38), // Outer muzzle rim
    new THREE.Vector2(0.168, 22.29), // Recessed 11° USGI target muzzle crown!
  ];

  const lathe = new THREE.LatheGeometry(pts, 32);
  lathe.rotateZ(-Math.PI / 2);
  paintGeometry(lathe, M4_PARKERIZED_STEEL);

  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.168, 0.168, 19.5, 20)
      .rotateZ(Math.PI / 2)
      .translate(13.0, 0, 0),
    M4_ANODIZED_DARK
  );
  const chamber = paintGeometry(
    new THREE.CylinderGeometry(0.275, 0.295, 2.35, 20)
      .rotateZ(Math.PI / 2)
      .translate(4.65, 0, 0),
    M4_ANODIZED_DARK
  );
  // M4 dual feed-ramp scallops machined into lower barrel extension throat
  const rampL = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.15, 0.65, 12)
      .rotateZ(Math.PI / 2 - 0.32)
      .translate(3.75, -0.26, -0.13),
    M4_STAINLESS
  );
  const rampR = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.15, 0.65, 12)
      .rotateZ(Math.PI / 2 - 0.32)
      .translate(3.75, -0.26, 0.13),
    M4_STAINLESS
  );
  const hollowed = csgSubtract(lathe, [bore, chamber, rampL, rampR]);

  const parts: THREE.BufferGeometry[] = [hollowed];

  // 6 Right-Hand 5.56mm (.223") Chrome-Lined Rifling Lands inside Bore (X ∈ [6.0, 22.26])
  for (let r = 0; r < 6; r++) {
    const ang = (r * Math.PI * 2) / 6 + 0.26;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(16.26, 0.036, 0.044)
          .rotateX(-ang)
          .translate(
            14.13,
            Math.sin(ang) * 0.156,
            Math.cos(ang) * 0.156
          ),
        M4_STAINLESS
      )
    );
  }

  // Stainless M4 Barrel Extension Sleeve + 7 Internal Star Locking Lugs + Top Indexing Pin
  const extCollar = paintGeometry(
    new THREE.CylinderGeometry(0.566, 0.566, 1.18, 26)
      .rotateZ(Math.PI / 2)
      .translate(4.16, 0, 0),
    M4_STAINLESS
  );
  const extBore = paintGeometry(
    new THREE.CylinderGeometry(0.43, 0.43, 1.45, 22)
      .rotateZ(Math.PI / 2)
      .translate(4.16, 0, 0),
    M4_ANODIZED_DARK
  );
  parts.push(csgSubtract(extCollar, [extBore]));

  for (let k = 1; k <= 7; k++) {
    const ang = (k * Math.PI) / 4 + Math.PI / 8;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.36, 0.13, 0.16)
          .rotateX(-ang)
          .translate(3.78, Math.sin(ang) * 0.37, Math.cos(ang) * 0.37),
        M4_STAINLESS
      )
    );
  }

  // Top Barrel Extension Indexing Pin + Conical Steel Muzzle Crush Washer at X = 21.86
  const indexPin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.14, 12).translate(4.25, 0.59, 0),
    M4_BRIGHT_STEEL
  );
  const crushWasherOuter = paintGeometry(
    new THREE.CylinderGeometry(0.415, 0.445, 0.12, 26)
      .rotateZ(Math.PI / 2)
      .translate(21.86, 0, 0),
    M4_BRIGHT_STEEL
  );
  const crushWasherHole = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.3, 18)
      .rotateZ(Math.PI / 2)
      .translate(21.86, 0, 0),
    M4_ANODIZED_DARK
  );

  parts.push(indexPin, csgSubtract(crushWasherOuter, [crushWasherHole]));

  return sanitizeM4Geometry(mergeParts(parts));
}

/**
 * F-03: USGI A2 Birdcage Closed-Bottom Compensator / Flash Suppressor
 * (assembledPos: [22.95, 1.05, 0] — spans X_local ∈ [-1.05, +1.15] => X_world ∈ [21.90, 24.10])
 * Features 3/4" wrench flats, BFA groove, recessed exit crown, internal expansion chamber & 5 top/side ports (solid bottom!).
 */
export function buildM4a1FlashHiderGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.22, -1.05),
    new THREE.Vector2(0.42, -1.05),
    new THREE.Vector2(0.45, -0.98),
    new THREE.Vector2(0.45, -0.52),
    new THREE.Vector2(0.395, -0.48), // BFA circumferential retention groove
    new THREE.Vector2(0.395, -0.36),
    new THREE.Vector2(0.45, -0.32),
    new THREE.Vector2(0.45, 1.12),
    new THREE.Vector2(0.42, 1.15), // Front chamfered muzzle face
    new THREE.Vector2(0.235, 1.15), // Closed A2 front ring aperture
    new THREE.Vector2(0.215, 1.04), // Recessed 11° muzzle crown dish
  ];
  const body = new THREE.LatheGeometry(pts, 30);
  body.rotateZ(-Math.PI / 2);
  paintGeometry(body, M4_PARKERIZED_STEEL);

  const cutters: THREE.BufferGeometry[] = [
    // Through bullet exit channel (r = 0.225)
    paintGeometry(
      new THREE.CylinderGeometry(0.225, 0.225, 2.6, 22)
        .rotateZ(Math.PI / 2)
        .translate(0.05, 0, 0),
      M4_ANODIZED_DARK
    ),
    // Internal birdcage flash expansion chamber (X_local ∈ [-0.22, +0.94], leaving closed front baffle ring!)
    paintGeometry(
      new THREE.CylinderGeometry(0.335, 0.315, 1.16, 24)
        .rotateZ(Math.PI / 2)
        .translate(0.36, 0, 0),
      M4_ANODIZED_DARK
    ),
    // Left & Right 3/4" parallel wrench flats on rear collar (X_local ∈ [-0.96, -0.60])
    paintGeometry(
      new THREE.BoxGeometry(0.36, 0.96, 0.18).translate(-0.78, 0, 0.47),
      M4_ANODIZED_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.36, 0.96, 0.18).translate(-0.78, 0, -0.47),
      M4_ANODIZED_DARK
    ),
  ];

  // 5 Top/Side Birdcage Flash-Suppression Ports strictly across upper hemisphere (-72°, -36°, 0°, +36°, +72° from +Y)
  // Bottom 180° (-Y) remains completely solid closed to suppress dust kick-up when firing prone!
  for (const ang of [-1.256, -0.628, 0, 0.628, 1.256]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.98, 0.34, 0.135)
          .translate(0.38, 0.37, 0)
          .rotateX(ang),
        M4_ANODIZED_DARK
      )
    );
  }

  return sanitizeM4Geometry(csgSubtract(body, cutters));
}

/**
 * F-04: Forged "F"-Marked Triangular A2 Front Sight Base (FSB) w/ Handguard Cap,
 * M9 Bayonet Lug, Riveted Sling Swivel, Elevation Detent & Dual Taper Pins
 * (assembledPos: [15.05, 1.05, 0] — front sight post tip at Y_world = 3.52 co-witnessing Carry Handle!)
 */
export function buildM4a1FrontSightBaseGeometry(): THREE.BufferGeometry {
  const aFrame = new THREE.Shape();
  aFrame.moveTo(-1.18, 0.35);
  aFrame.lineTo(1.18, 0.35);
  aFrame.lineTo(0.46, 2.68);
  aFrame.lineTo(-0.48, 2.68);
  aFrame.lineTo(-1.18, 0.35);
  aFrame.closePath();

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

  const earSlot = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.5, 0.68).translate(-0.02, 2.52, 0),
    M4_ANODIZED_DARK
  );
  const tower = csgSubtract(towerRaw, [earSlot]);

  // Twin .750" Barrel Journal Rings + Gas Tube Socket Boss + Raised "F" Mark Pad
  const ringRear = paintGeometry(
    new THREE.CylinderGeometry(0.585, 0.585, 0.68, 24)
      .rotateZ(Math.PI / 2)
      .translate(-0.84, 0, 0),
    M4_PARKERIZED_STEEL
  );
  const ringFront = paintGeometry(
    new THREE.CylinderGeometry(0.585, 0.585, 0.68, 24)
      .rotateZ(Math.PI / 2)
      .translate(0.84, 0, 0),
    M4_PARKERIZED_STEEL
  );
  const gasBoss = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.98, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.72, 0.8, 0),
    M4_PARKERIZED_STEEL
  );
  const fMarkPad = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.26, 0.06).translate(-0.76, 0.68, -0.29),
    M4_RAIL_BEVEL
  );
  const barrelCut = paintGeometry(
    new THREE.CylinderGeometry(0.452, 0.452, 2.6, 22)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    M4_ANODIZED_DARK
  );
  const gasSocketHole = paintGeometry(
    new THREE.CylinderGeometry(0.115, 0.115, 0.65, 12)
      .rotateZ(Math.PI / 2)
      .translate(-1.05, 0.8, 0),
    M4_ANODIZED_DARK
  );
  const journals = csgSubtract(
    csgUnion([ringRear, ringFront, gasBoss, fMarkPad]),
    [barrelCut, gasSocketHole]
  );

  // Stamped Triangular M4 Handguard End-Cap w/ M203 Side Cutouts & Gas-Tube Pass-Through at X_local = -1.28
  const capShape = new THREE.Shape();
  capShape.moveTo(0, 0.98);
  capShape.quadraticCurveTo(0.88, 0.72, 0.92, -0.15);
  capShape.quadraticCurveTo(0.82, -0.88, 0, -0.92);
  capShape.quadraticCurveTo(-0.82, -0.88, -0.92, -0.15);
  capShape.quadraticCurveTo(-0.88, 0.72, 0, 0.98);
  const hgCapRaw = new THREE.ExtrudeGeometry(capShape, {
    depth: 0.11,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  hgCapRaw.rotateY(Math.PI / 2);
  hgCapRaw.translate(-1.33, 0, 0);
  paintGeometry(hgCapRaw, M4_PARKERIZED_STEEL);

  const hgCapBarrelHole = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.46, 0.4, 20)
      .rotateZ(Math.PI / 2)
      .translate(-1.28, 0, 0),
    M4_ANODIZED_DARK
  );
  const hgCapGasHole = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 0.4, 12)
      .rotateZ(Math.PI / 2)
      .translate(-1.28, 0.8, 0),
    M4_ANODIZED_DARK
  );
  const hgCapM203CutL = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.4, 12)
      .rotateZ(Math.PI / 2)
      .translate(-1.28, -0.16, -0.88),
    M4_ANODIZED_DARK
  );
  const hgCapM203CutR = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.4, 12)
      .rotateZ(Math.PI / 2)
      .translate(-1.28, -0.16, 0.88),
    M4_ANODIZED_DARK
  );
  const hgCap = csgSubtract(hgCapRaw, [
    hgCapBarrelHole,
    hgCapGasHole,
    hgCapM203CutL,
    hgCapM203CutR,
  ]);

  // Square Front Sight Post (top at Y_local = +2.47 => Y_world = 3.52!), 4-Notch Flange & Detent Plunger
  const sightFlange = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.07, 16).translate(-0.02, 2.25, 0),
    M4_BRIGHT_STEEL
  );
  const sightPost = paintGeometry(
    new THREE.BoxGeometry(0.088, 0.28, 0.088).translate(-0.02, 2.33, 0),
    M4_BRIGHT_STEEL
  );
  const sightDetent = paintGeometry(
    new THREE.CylinderGeometry(0.036, 0.036, 0.12, 10).translate(0.12, 2.25, 0),
    M4_BRIGHT_STEEL
  );

  // T-Slotted M9 Bayonet Lug + Swivel Ears + Rubberized Oval Sling Swivel & Rivet + Dual Cross Taper Pins
  const bayoStem = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.26, 0.28).translate(0.76, -0.62, 0),
    M4_PARKERIZED_STEEL
  );
  const bayoShoe = paintGeometry(
    new THREE.BoxGeometry(0.66, 0.12, 0.42).translate(0.76, -0.78, 0),
    M4_PARKERIZED_STEEL
  );
  const swivelEars = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.36, 0.34).translate(-0.78, -0.64, 0),
    M4_PARKERIZED_STEEL
  );
  const swivelRivet = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.06, 0.42, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.78, -0.72, 0),
    M4_BRIGHT_STEEL
  );
  const slingSwivel = paintGeometry(
    new THREE.TorusGeometry(0.32, 0.055, 10, 20)
      .scale(0.85, 1.12, 1)
      .translate(-0.78, -0.96, 0),
    M4_RUBBER
  );
  const pinRear = paintGeometry(
    new THREE.CylinderGeometry(0.072, 0.086, 0.84, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.84, -0.44, 0),
    M4_BRIGHT_STEEL
  );
  const pinFront = paintGeometry(
    new THREE.CylinderGeometry(0.072, 0.086, 0.84, 14)
      .rotateX(Math.PI / 2)
      .translate(0.84, -0.44, 0),
    M4_BRIGHT_STEEL
  );

  return sanitizeM4Geometry(
    mergeParts([
      tower,
      journals,
      hgCap,
      sightFlange,
      sightPost,
      sightDetent,
      bayoStem,
      bayoShoe,
      swivelEars,
      swivelRivet,
      slingSwivel,
      pinRear,
      pinFront,
    ])
  );
}

/**
 * F-05: Mil-Spec 6-Position Carbine Buffer Tube, 4-Notch Staked Castle Nut & Sling Receiver Endplate
 * (assembledPos: [-11.35, 1.05, 0] — spans X_local ∈ [-5.65, +5.85] => X_world ∈ [-17.00, -5.50])
 */
export function buildM4a1BufferTubeGeometry(): THREE.BufferGeometry {
  const tubeOuter = paintGeometry(
    new THREE.CylinderGeometry(0.68, 0.68, 11.5, 28)
      .rotateZ(Math.PI / 2)
      .translate(0.1, 0, 0),
    M4_ANODIZED_CHARCOAL
  );
  const bottomTrack = paintGeometry(
    new THREE.BoxGeometry(9.65, 0.36, 0.44).translate(-0.8, -0.74, 0),
    M4_ANODIZED_CHARCOAL
  );
  const solidTube = csgUnion([tubeOuter, bottomTrack]);

  // Hollow internal bore open at +X + rear vent hole + 6 Mil-Spec LOP detent blind sockets
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.55, 0.55, 11.2, 24)
        .rotateZ(Math.PI / 2)
        .translate(0.45, 0, 0),
      M4_ANODIZED_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.09, 0.09, 0.6, 12)
        .rotateZ(Math.PI / 2)
        .translate(-5.55, 0, 0),
      M4_ANODIZED_DARK
    ),
  ];
  for (let p = 0; p < 6; p++) {
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.135, 0.135, 0.28, 14).translate(
          -4.6 + p * 1.15,
          -0.88,
          0
        ),
        M4_ANODIZED_DARK
      )
    );
  }
  const carvedTube = csgSubtract(solidTube, cutters);

  // Stamped Steel Receiver Endplate + 4-Notch Spanner Castle Nut!
  const endPlateOuter = paintGeometry(
    new THREE.CylinderGeometry(0.86, 0.86, 0.14, 26)
      .rotateZ(Math.PI / 2)
      .translate(5.5, -0.06, 0),
    M4_PARKERIZED_STEEL
  );
  const endPlateTab = paintGeometry(
    new THREE.BoxGeometry(0.14, 0.52, 0.42).translate(5.5, -0.74, 0),
    M4_PARKERIZED_STEEL
  );
  const castleNutOuter = paintGeometry(
    new THREE.CylinderGeometry(0.83, 0.83, 0.38, 26)
      .rotateZ(Math.PI / 2)
      .translate(5.22, 0, 0),
    M4_PARKERIZED_STEEL
  );
  const nutCutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.56, 0.56, 0.9, 22)
        .rotateZ(Math.PI / 2)
        .translate(5.35, 0, 0),
      M4_ANODIZED_DARK
    ),
  ];
  // Carve 4 authentic spanner wrench notches on rear rim of castle nut
  for (let n = 0; n < 4; n++) {
    const ang = (n * Math.PI) / 2 + Math.PI / 4;
    nutCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.18, 0.18, 0.24)
          .rotateX(-ang)
          .translate(5.06, Math.sin(ang) * 0.8, Math.cos(ang) * 0.8),
        M4_ANODIZED_DARK
      )
    );
  }

  return sanitizeM4Geometry(
    mergeParts([
      carvedTube,
      csgSubtract(
        csgUnion([endPlateOuter, endPlateTab, castleNutOuter]),
        nutCutters
      ),
    ])
  );
}

/**
 * F-06: H2 Heavy Carbine Recoil Buffer (2 Tungsten + 1 Steel Weights) & Polyurethane Bumper
 * (assembledPos: [-6.35, 1.05, 0] — spans X_local ∈ [-1.75, +1.85] => X_world ∈ [-8.10, -4.50])
 */
export function buildM4a1BufferGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -1.28),
    new THREE.Vector2(0.41, -1.28),
    new THREE.Vector2(0.41, 1.32),
    new THREE.Vector2(0.36, 1.38), // Action spring retention neck
    new THREE.Vector2(0.36, 1.48),
    new THREE.Vector2(0.515, 1.52), // Flared H2 front buffer head
    new THREE.Vector2(0.515, 1.82),
    new THREE.Vector2(0.48, 1.85),
    new THREE.Vector2(0.0, 1.85),
  ];
  const body = new THREE.LatheGeometry(pts, 26);
  body.rotateZ(-Math.PI / 2);
  paintGeometry(body, M4_BUFFER_GOLD);

  const rearBumper = paintGeometry(
    new THREE.CylinderGeometry(0.34, 0.395, 0.48, 22)
      .rotateZ(Math.PI / 2)
      .translate(-1.51, 0, 0),
    M4_BUMPER_TAN
  );
  const rollPin = paintGeometry(
    new THREE.CylinderGeometry(0.048, 0.048, 0.83, 12)
      .rotateX(Math.PI / 2)
      .translate(-1.08, 0, 0),
    M4_BRIGHT_STEEL
  );
  return sanitizeM4Geometry(mergeParts([body, rearBumper, rollPin]));
}

/**
 * F-07: Helical 17-7PH Stainless Carbine Action / Buffer Spring
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
  return sanitizeM4Geometry(
    finalizeGeometry(paintGeometry(spring, M4_SPRING_STEEL))
  );
}

/**
 * F-08: USGI Colt M4 Reinforced "Waffle" 6-Position Collapsible Buttstock
 * (assembledPos: [-13.95, 1.05, 0] — spans X_local ∈ [-4.25, +3.85] => X_world ∈ [-18.20, -10.10])
 */
export function buildM4a1ButtstockGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(3.85, 0.88);
  shape.lineTo(-3.88, 0.88);
  shape.lineTo(-4.02, -3.78);
  shape.lineTo(-3.22, -3.85);
  shape.lineTo(1.25, -1.25);
  shape.lineTo(3.85, -1.02);
  shape.closePath();

  // Iconic M4 triangular brace lightening window
  const braceWin = new THREE.Path();
  braceWin.moveTo(-2.65, -1.05);
  braceWin.lineTo(0.25, -1.05);
  braceWin.lineTo(-2.65, -2.72);
  braceWin.closePath();
  shape.holes.push(braceWin);

  // Rear vertical 1.25" footman's sling loop slot
  const slingSlot = new THREE.Path();
  slingSlot.moveTo(-3.55, -1.25);
  slingSlot.lineTo(-3.25, -1.25);
  slingSlot.lineTo(-3.25, -2.65);
  slingSlot.lineTo(-3.55, -2.65);
  slingSlot.closePath();
  shape.holes.push(slingSlot);

  const rawBody = new THREE.ExtrudeGeometry(shape, {
    depth: 1.18,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  rawBody.translate(0, 0, -0.59);
  paintGeometry(rawBody, M4_POLYMER);

  const cheekTube = paintGeometry(
    new THREE.CylinderGeometry(0.94, 0.94, 7.65, 26)
      .scale(1, 0.96, 1.26)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 0.02, 0),
    M4_POLYMER
  );
  const bufferTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.7, 0.7, 8.5, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    M4_POLYMER_ACCENT
  );

  const stockMain = csgSubtract(csgUnion([rawBody, cheekTube]), [bufferTunnel]);
  const parts: THREE.BufferGeometry[] = [stockMain];

  // Authentic USGI M4 Crisscross "Waffle" Reinforcement Grid Ribs (vertical + horizontal ribs on flanks!)
  for (const rx of [-3.1, -1.9, -0.7, 0.5, 1.7]) {
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.13, 1.32, 1.32).translate(rx, -0.76, 0),
        M4_POLYMER_ACCENT
      )
    );
  }
  for (const ry of [-0.36, -0.92]) {
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(5.6, 0.12, 1.31).translate(-0.7, ry, 0),
        M4_POLYMER_ACCENT
      )
    );
  }

  // Spring-loaded LOP release latch lever, knurled lock nut, bottom sling swivel & checkered rubber buttpad
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(2.75, 0.28, 0.56)
        .rotateZ(0.18)
        .translate(1.2, -1.32, 0),
      M4_POLYMER_ACCENT
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.22, 0.22, 0.58, 16).translate(
        2.15,
        -1.15,
        0
      ),
      M4_PARKERIZED_STEEL
    ),
    paintGeometry(
      new THREE.TorusGeometry(0.28, 0.05, 8, 18)
        .scale(1.15, 0.85, 1)
        .translate(-2.55, -3.45, 0),
      M4_PARKERIZED_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.36, 4.74, 1.34).translate(-4.08, -1.48, 0),
      M4_RUBBER
    )
  );

  // Horizontal anti-slip buttpad serrations
  for (let b = 0; b < 7; b++) {
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.08, 0.14, 1.28).translate(
          -4.26,
          -3.35 + b * 0.62,
          0
        ),
        M4_POLYMER_ACCENT
      )
    );
  }

  return sanitizeM4Geometry(mergeParts(parts));
}

/**
 * F-09: USGI A2 Checkered Polymer Pistol Grip w/ Single Finger Shelf & Selector Detent Pocket
 * (assembledPos: [-3.45, -0.88, 0] — sweeps BACKWARD -X at authentic 25° AR-15 grip angle!)
 */
export function buildM4a1PistolGripGeometry(): THREE.BufferGeometry {
  const grip = new THREE.Shape();
  grip.moveTo(-1.12, 0.04);
  grip.lineTo(1.02, 0.04);
  grip.lineTo(0.45, -1.55);
  grip.lineTo(0.68, -1.76); // Signature USGI A2 Single Finger Indexing Shelf!
  grip.lineTo(0.34, -1.98);
  grip.lineTo(-0.82, -4.48);
  grip.lineTo(-2.88, -4.22);
  grip.quadraticCurveTo(-2.22, -2.45, -1.58, -0.85);
  grip.quadraticCurveTo(-1.35, -0.25, -1.12, 0.04);
  grip.closePath();

  const rawBody = new THREE.ExtrudeGeometry(grip, {
    depth: 1.12,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  rawBody.translate(0, 0, -0.56);
  paintGeometry(rawBody, M4_POLYMER);

  // Hollow internal grip-screw tunnel + top-right selector detent spring blind hole!
  const screwCavity = paintGeometry(
    new THREE.CylinderGeometry(0.34, 0.42, 3.6, 16)
      .rotateZ(-0.42)
      .translate(-1.25, -2.65, 0),
    M4_POLYMER_ACCENT
  );
  const detentHole = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.45, 10).translate(
      0.1,
      -0.12,
      0.42
    ),
    M4_POLYMER_ACCENT
  );
  const body = csgSubtract(rawBody, [screwCavity, detentHole]);

  // Raised A2 diamond-checkered side panels + rear backstrap vertical serrations
  const parts: THREE.BufferGeometry[] = [
    body,
    paintGeometry(
      new THREE.BoxGeometry(1.18, 2.38, 0.08)
        .rotateZ(0.42)
        .translate(-0.78, -2.35, -0.61),
      M4_POLYMER_ACCENT
    ),
    paintGeometry(
      new THREE.BoxGeometry(1.18, 2.38, 0.08)
        .rotateZ(0.42)
        .translate(-0.78, -2.35, 0.61),
      M4_POLYMER_ACCENT
    ),
    // Internal hex mounting bolt head inside grip cavity
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 0.45, 12)
        .rotateZ(-0.42)
        .translate(-0.28, -0.58, 0),
      M4_BRIGHT_STEEL
    ),
  ];

  return sanitizeM4Geometry(mergeParts(parts));
}

// ============================================================================
// GROUP 3 ('fire_control'): HAMMER, TRIGGER/DISCONNECTOR & AUTO SELECTOR (3)
// ============================================================================

/**
 * FC-01: Upright M4A1 Select-Fire Notched Rotary Hammer & Dual-Coil Torsion Mainspring
 * (assembledPos: [-0.35, -0.05, 0] — pivot at local (0,0,0); rz < 0 swings +X forward into firing pin!)
 */
export function buildM4a1HammerGeometry(): THREE.BufferGeometry {
  const pivotHub = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.94, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M4_PARKERIZED_STEEL
  );
  const pinHole = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 1.15, 12)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M4_ANODIZED_DARK
  );
  const hub = csgSubtract(pivotHub, [pinHole]);

  // Upright cocked M16/M4 select-fire hammer w/ front primary sear notch, disconnector hook & rear auto-sear hook!
  const hShape = new THREE.Shape();
  hShape.moveTo(-0.22, -0.14);
  hShape.lineTo(0.22, -0.16); // Primary sear engagement nose
  hShape.lineTo(0.14, 0.06);
  hShape.lineTo(0.24, 0.68);
  hShape.lineTo(-0.16, 1.2); // Flat firing-pin striking face
  hShape.lineTo(-0.66, 1.06); // M16/M4 Auto-Sear rear tail hook!
  hShape.lineTo(-0.56, 0.88);
  hShape.lineTo(-0.42, 0.84);
  hShape.lineTo(-0.54, 0.42); // Semi-auto disconnector hook notch
  hShape.closePath();

  const head = new THREE.ExtrudeGeometry(hShape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  head.translate(0, 0, -0.21);
  // True cocked-down rearward angle on sear (worldY_max <= 0.28, cleanly below BCG bottom 0.54!)
  head.rotateZ(1.48);
  paintGeometry(head, M4_PARKERIZED_STEEL);

  const springL = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.45,
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
      end: 0.45,
      centerX: 0,
      centerZ: 0,
      coilRadius: 0.3,
      wireRadius: 0.032,
      coils: 3.5,
    }).rotateX(Math.PI / 2),
    M4_SPRING_STEEL
  );
  return sanitizeM4Geometry(mergeParts([hub, head, springL, springR]));
}

/**
 * FC-02: USGI Curved Trigger, Front Primary Sear Nose, Nested Disconnector & Disconnector Spring
 * (assembledPos: [-1.75, -0.32, 0] — pivot at local (0,0,0); rz < 0 pulls shoe -X and dips front sear -Y!)
 */
export function buildM4a1TriggerGeometry(): THREE.BufferGeometry {
  const pin = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.96, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M4_BRIGHT_STEEL
  );

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

  // U-channel trigger body w/ precision-ground front sear nose (+X) & rear selector safety bars (-X)
  const searRaw = paintGeometry(
    new THREE.BoxGeometry(1.82, 0.3, 0.5).translate(-0.08, 0.09, 0),
    M4_PARKERIZED_STEEL
  );
  const disconnectorTrough = paintGeometry(
    new THREE.BoxGeometry(1.36, 0.28, 0.24).translate(-0.12, 0.16, 0),
    M4_ANODIZED_DARK
  );
  const searChannel = csgSubtract(searRaw, [disconnectorTrough]);

  // Nested Semi-Auto Disconnector Plate + Conical Disconnector Coil Spring
  const dShape = new THREE.Shape();
  dShape.moveTo(-0.56, 0.04);
  dShape.lineTo(0.62, 0.04);
  dShape.lineTo(0.7, 0.42);
  dShape.lineTo(0.36, 0.56); // Upper hammer-catching hook!
  dShape.lineTo(0.24, 0.32);
  dShape.lineTo(-0.56, 0.22);
  dShape.closePath();
  const disconnector = new THREE.ExtrudeGeometry(dShape, {
    depth: 0.16,
    bevelEnabled: false,
  });
  disconnector.translate(0, 0, -0.08);
  paintGeometry(disconnector, M4_STAINLESS);

  const discSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.02,
      end: 0.24,
      centerX: -0.34,
      centerZ: 0,
      coilRadius: 0.065,
      wireRadius: 0.016,
      coils: 4,
    }),
    M4_SPRING_STEEL
  );

  // Stationary hammer-spring resting legs seated across trigger pin (don't whip upward with hammer!)
  const legL = paintGeometry(
    new THREE.CylinderGeometry(0.028, 0.028, 1.48, 8)
      .rotateZ(Math.PI / 2 + 0.18)
      .translate(0.68, 0.12, -0.36),
    M4_SPRING_STEEL
  );
  const legR = paintGeometry(
    new THREE.CylinderGeometry(0.028, 0.028, 1.48, 8)
      .rotateZ(Math.PI / 2 + 0.18)
      .translate(0.68, 0.12, 0.36),
    M4_SPRING_STEEL
  );

  return sanitizeM4Geometry(
    mergeParts([pin, shoe, searChannel, disconnector, discSpring, legL, legR])
  );
}

/**
 * FC-03: M4A1 3-Position (SAFE / SEMI / AUTO) Rotary Fire Selector Cam Drum & Serrated Lever
 * (assembledPos: [-3.35, -0.22, 0] — centered on PBR SAFE/SEMI/AUTO dial!)
 */
export function buildM4a1SelectorGeometry(): THREE.BufferGeometry {
  const drumRaw = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 1.62, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M4_PARKERIZED_STEEL
  );
  // Machined central trigger-clearance cam flat + auto-disconnector groove
  const camCut = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.22, 0.58).translate(0.12, -0.14, 0),
    M4_ANODIZED_DARK
  );
  const camDrum = csgSubtract(drumRaw, [camCut]);

  // Left-side USGI serrated teardrop thumb lever pointing upward (SEMI ready position)
  const leftCap = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.14, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.82),
    M4_PARKERIZED_STEEL
  );
  const lShape = new THREE.Shape();
  lShape.moveTo(-0.18, 0);
  lShape.lineTo(0.18, 0);
  lShape.lineTo(0.11, 0.72);
  lShape.lineTo(0, 0.92); // Crisp pointer tip toward SEMI!
  lShape.lineTo(-0.11, 0.72);
  lShape.closePath();
  const leftLever = new THREE.ExtrudeGeometry(lShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  leftLever.translate(0, 0, -0.91);
  paintGeometry(leftLever, M4_PARKERIZED_STEEL);

  // Right-side flush indicator drum cap w/ witness pointer groove
  const rightCap = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.08, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.8),
    M4_BRIGHT_STEEL
  );
  const rightTick = paintGeometry(
    new THREE.BoxGeometry(0.05, 0.36, 0.05).translate(0, 0.06, 0.84),
    M4_PARKERIZED_STEEL
  );

  return sanitizeM4Geometry(
    mergeParts([camDrum, leftCap, leftLever, rightCap, rightTick])
  );
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
 * w/ Precision Curved Feed Lips, Bolt-Catch Follower Notch & Spot-Welded Spine Seams
 * (assembledPos: [2.40, -1.00, 0] — C1-continuous straight magwell tower + 0.36 rad arc!)
 */
export function buildM4a1MagBodyGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const arcSteps = 24;

  shape.moveTo(-1.36, 1.05);
  shape.lineTo(-1.36, STANAG_ARC_CY);

  for (let i = 1; i <= arcSteps; i++) {
    const ang = (i / arcSteps) * STANAG_ANG_END;
    const px = STANAG_ARC_CX - Math.cos(ang) * STANAG_R_OUTER;
    const py = STANAG_ARC_CY - Math.sin(ang) * STANAG_R_OUTER;
    shape.lineTo(px, py);
  }

  for (let i = arcSteps; i >= 0; i--) {
    const ang = (i / arcSteps) * STANAG_ANG_END;
    const px = STANAG_ARC_CX - Math.cos(ang) * STANAG_R_INNER;
    const py = STANAG_ARC_CY - Math.sin(ang) * STANAG_R_INNER;
    shape.lineTo(px, py);
  }

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

  // Hollow top feed throat, rear bolt-catch follower clearance notch & left STANAG mag-catch window!
  const throatHole = paintGeometry(
    new THREE.BoxGeometry(2.38, 1.95, 0.84).translate(0, 0.35, 0),
    M4_ANODIZED_DARK
  );
  const boltCatchCutout = paintGeometry(
    new THREE.BoxGeometry(0.45, 0.36, 0.56).translate(-1.26, 0.98, 0),
    M4_ANODIZED_DARK
  );
  const frontBulletNotch = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.35, 14).translate(1.34, 1.02, 0),
    M4_ANODIZED_DARK
  );
  const catchSlot = paintGeometry(
    new THREE.BoxGeometry(0.58, 0.28, 0.26).translate(-0.55, 0.25, -0.52),
    M4_ANODIZED_DARK
  );
  const magShell = csgSubtract(rawMag, [
    throatHole,
    boltCatchCutout,
    frontBulletNotch,
    catchSlot,
  ]);

  // Inward-curved stamped USGI STANAG feed lips retaining staggered 5.56mm rounds
  const feedLipL = paintGeometry(
    new THREE.BoxGeometry(2.05, 0.15, 0.22)
      .rotateX(0.24)
      .translate(-0.14, 1.11, -0.39),
    M4_STANAG_GREY
  );
  const feedLipR = paintGeometry(
    new THREE.BoxGeometry(2.05, 0.15, 0.22)
      .rotateX(-0.24)
      .translate(-0.14, 1.11, 0.39),
    M4_STANAG_GREY
  );
  // Rear over-insertion stop tab on spine
  const rearStopTab = paintGeometry(
    new THREE.BoxGeometry(0.08, 0.24, 0.44).translate(-1.39, -1.08, 0),
    M4_STANAG_GREY
  );

  return applyM4a1MagUVs(
    mergeParts([magShell, feedLipL, feedLipR, rearStopTab])
  );
}

/**
 * M-02: USGI Enhanced Tan 4-Way Anti-Tilt Polymer Follower w/ Cartridge Step & Bolt-Catch Trip Shelf
 * (assembledPos: [2.40, -0.35, 0])
 */
export function buildM4a1MagFollowerGeometry(): THREE.BufferGeometry {
  const deck = paintGeometry(
    new THREE.BoxGeometry(2.26, 0.22, 0.78).translate(0, 0.14, 0),
    M4_FOLLOWER_TAN
  );
  // Staggered right-side 5.56mm cartridge presentation rib
  const stepGuide = paintGeometry(
    new THREE.CylinderGeometry(0.135, 0.135, 2.16, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.04, 0.28, 0.17),
    M4_FOLLOWER_TAN
  );
  // Rear bolt-catch actuating trip tab engaging lower receiver ping-pong paddle!
  const boltCatchTab = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.22, 0.38).translate(-1.12, 0.22, -0.14),
    M4_FOLLOWER_TAN
  );
  const frontLeg = paintGeometry(
    new THREE.BoxGeometry(0.2, 1.12, 0.74).translate(1.03, -0.44, 0),
    M4_FOLLOWER_TAN
  );
  const rearLeg = paintGeometry(
    new THREE.BoxGeometry(0.2, 1.24, 0.74).translate(-1.03, -0.5, 0),
    M4_FOLLOWER_TAN
  );
  return sanitizeM4Geometry(
    mergeParts([deck, stepGuide, boltCatchTab, frontLeg, rearLeg])
  );
}

/**
 * M-03: Curved Rectangular 17-7PH Stainless STANAG Magazine Spring (assembledPos: [2.40, -1.00, 0])
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
    if (u < 0.16) {
      const su = u / 0.16;
      px = radialOff;
      // Starts at local py = -0.38 (worldY = -1.38) right underneath lowered m4a1_mag_follower!
      py = -0.38 - su * 0.87;
    } else {
      const cu = (u - 0.16) / 0.84;
      const ang = cu * 0.345;
      const rCur = 18.0 - radialOff;
      px = STANAG_ARC_CX - Math.cos(ang) * rCur;
      py = STANAG_ARC_CY - Math.sin(ang) * rCur;
    }
    points.push(new THREE.Vector3(px, py, zOff));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(curve, totalSteps, 0.045, 8, false);
  return sanitizeM4Geometry(
    finalizeGeometry(paintGeometry(tube, M4_SPRING_STEEL))
  );
}

/**
 * M-04: Flush Stamped Aluminum STANAG Slide-On Floorplate & Retention Tab
 * (assembledPos: [3.554, -8.591, 0], assembledRot: [0, 0, 0.36] — ZERO GAP mathematical fit!)
 */
export function buildM4a1MagFloorplateGeometry(): THREE.BufferGeometry {
  const basePlate = paintGeometry(
    new THREE.BoxGeometry(2.86, 0.14, 1.14).translate(0, -0.06, 0),
    M4_STANAG_GREY
  );
  const railL = paintGeometry(
    new THREE.BoxGeometry(2.84, 0.16, 0.09).translate(0, 0.05, -0.53),
    M4_STANAG_GREY
  );
  const railR = paintGeometry(
    new THREE.BoxGeometry(2.84, 0.16, 0.09).translate(0, 0.05, 0.53),
    M4_STANAG_GREY
  );
  const lockTab = paintGeometry(
    new THREE.BoxGeometry(1.22, 0.08, 0.54).translate(0, -0.15, 0),
    M4_BRIGHT_STEEL
  );
  const pryDimple = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12).translate(-0.92, -0.14, 0),
    M4_BRIGHT_STEEL
  );
  return sanitizeM4Geometry(
    mergeParts([basePlate, railL, railR, lockTab, pryDimple])
  );
}
