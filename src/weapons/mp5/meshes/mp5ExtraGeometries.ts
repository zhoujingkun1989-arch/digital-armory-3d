import * as THREE from 'three';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';

const HK_DARK_STEEL = '#454f5e';
const HK_STEEL_HIGHLIGHT = '#586476';
const HK_INNER_DARK = '#252b35';
const HK_BRIGHT_STEEL = '#d5dde7';
const HK_CHROME_STEEL = '#e2e8f0';
const HK_SPRING_STEEL = '#94a3b8';
const HK_POLYMER = '#323842';
const HK_POLYMER_ACCENT = '#282d36';
const HK_COPPER = '#b45309';
const HK_FOLLOWER_ORANGE = '#ea580c';

function triFaceInfo(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  i0: number,
  i1: number,
  i2: number
) {
  return sampleTriangleInfo(pos, undefined, i0, i1, i2);
}

/**
 * Unwraps FC-01 Navy Bullet-Pictogram Polymer Grip Housing onto 1024x1024 mp5_lower_{albedo,normal,roughness}.png:
 *  - Local bounds: x in [-4.35, +3.80] (span 8.15), y in [-5.80, +0.95] (span 6.75)
 *  - Selector pivot at local (-1.00, -0.20) => xNorm = 0.4110, yNorm = 0.8296
 *  - Right flank (+Z): u = 0.05 + xNorm * 0.90 (piv u=0.420), v = 0.52 + yNorm * 0.44 (piv v=0.885)
 *  - Left flank  (-Z): u = 0.05 + (1 - xNorm) * 0.90 (piv u=0.580), v = 0.05 + yNorm * 0.44 (piv v=0.415)
 */
export function applyMp5GripHousingUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz } = triFaceInfo(pos, i, i + 1, i + 2);
    let side: 'right' | 'left' | 'edge' = 'edge';
    if (fnz > 0.45 && cz > 0.18) {
      side = 'right';
    } else if (fnz < -0.45 && cz < -0.18) {
      side = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -4.35) / 8.15);
      const yNorm = clamp01((y - -5.8) / 6.75);

      let u: number;
      let v: number;
      if (side === 'right') {
        u = 0.05 + xNorm * 0.9;
        v = 0.52 + yNorm * 0.44;
      } else if (side === 'left') {
        u = 0.05 + (1.0 - xNorm) * 0.9;
        v = 0.05 + yNorm * 0.44;
      } else {
        u = 0.02 + fractPos((x + z) * 0.15) * 0.16;
        v = 0.48 + fractPos(y * 0.15) * 0.03;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 1. ROLLER-DELAYED BLOWBACK BOLT & CHARGING GROUP ('slide' · 9 parts)
// ============================================================================

/**
 * B-01: Non-Reciprocating Left Folding HK-Slap Charging Handle & Support Sleeve
 * (assembledPos: [12.45, 2.08, 0] — stays completely stationary during firing!)
 */
export function buildMp5ChargingHandleGeometry(): THREE.BufferGeometry {
  // Cylindrical cocking support sleeve sliding inside forward cocking tube
  const outerSleeve = paintGeometry(
    new THREE.CylinderGeometry(0.35, 0.35, 3.05, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.1, 0, 0),
    HK_DARK_STEEL
  );
  const innerBore = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 3.3, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.1, 0, 0),
    HK_INNER_DARK
  );
  const sideLighteningSlot = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.24, 0.85).translate(-0.55, 0, 0),
    HK_INNER_DARK
  );
  const sleeve = csgSubtract(outerSleeve, [innerBore, sideLighteningSlot]);

  // Pivoted folding steel lever clevis + vertical hinge axle pin + return spring boss on left (-Z)!
  const clevisBase = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.24, 0.36).translate(0.35, 0.02, -0.42),
    HK_STEEL_HIGHLIGHT
  );
  const foldingArm = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.2, 0.56)
      .rotateX(-0.2)
      .translate(0.35, 0.08, -0.74),
    HK_STEEL_HIGHLIGHT
  );
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.34, 12).translate(
      0.35,
      0.04,
      -0.48
    ),
    HK_BRIGHT_STEEL
  );

  // Iconic HK tapered ribbed black polymer slap knob!
  const knobPts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.23, 0.02),
    new THREE.Vector2(0.23, 0.16),
    new THREE.Vector2(0.205, 0.2),
    new THREE.Vector2(0.22, 0.34),
    new THREE.Vector2(0.195, 0.38),
    new THREE.Vector2(0.21, 0.54),
    new THREE.Vector2(0.185, 0.72),
    new THREE.Vector2(0.13, 0.82),
    new THREE.Vector2(0.0, 0.84),
  ];
  const slapKnob = new THREE.LatheGeometry(knobPts, 20);
  slapKnob.rotateX(-(Math.PI / 2 - 0.2));
  slapKnob.translate(0.35, 0.14, -0.92);
  paintGeometry(slapKnob, HK_POLYMER);

  return mergeParts([sleeve, clevisBase, foldingArm, pivotPin, slapKnob]);
}

/**
 * B-02: Heavy HK MP5 Bolt Carrier w/ Brazed Forward Recoil-Tube Extension
 * (assembledPos: [-1.15, 1.00, 0])
 */
export function buildMp5BoltCarrierGeometry(): THREE.BufferGeometry {
  // Lower heavy carrier body X_local in [-1.85, +2.05] (world [-3.00, +0.90]; at -2.59 recoil stops at -5.59 flush on hBuffer!)
  const carrierBlock = paintGeometry(
    new THREE.BoxGeometry(3.9, 0.96, 1.06).translate(0.1, 0.02, 0),
    HK_DARK_STEEL
  );
  // Connecting vertical spine web up to upper recoil tube (Y_local = +1.08 -> world Y = 2.08)
  const spineWeb = paintGeometry(
    new THREE.BoxGeometry(3.8, 0.85, 0.66).translate(0.1, 0.62, 0),
    HK_DARK_STEEL
  );
  // Forward cylindrical recoil-rod extension tube X_local in [-1.20, +10.75] (stops at -4.94 ahead of rearWasher -4.99!)
  const upperTube = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 11.95, 24)
      .rotateZ(Math.PI / 2)
      .translate(4.775, 1.08, 0),
    HK_DARK_STEEL
  );

  const solid = csgUnion([carrierBlock, spineWeb, upperTube]);

  // Cut rear hammer/firing-pin access slot (reaches localX = +0.65 / worldX = -0.50), front twist-lock bayonet socket,
  // upper recoil-spring tunnel, bottom-left ejector clearance slot, and rear hammer-cocking ramp!
  const hammerSlot = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.78, 0.44).translate(-0.65, -0.14, 0),
    HK_INNER_DARK
  );
  const frontSocket = paintGeometry(
    new THREE.CylinderGeometry(0.34, 0.34, 1.55, 20)
      .rotateZ(Math.PI / 2)
      .translate(1.55, 0, 0),
    HK_INNER_DARK
  );
  const springTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 11.75, 18)
      .rotateZ(Math.PI / 2)
      .translate(4.65, 1.08, 0),
    HK_INNER_DARK
  );
  const ejectorTrack = paintGeometry(
    new THREE.BoxGeometry(4.05, 0.26, 0.16).translate(0.1, -0.36, -0.18),
    HK_INNER_DARK
  );
  const rearRamp = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.52, 1.2)
      .rotateZ(-0.38)
      .translate(-1.65, -0.48, 0),
    HK_INNER_DARK
  );

  const carved = csgSubtract(solid, [
    hammerSlot,
    frontSocket,
    springTunnel,
    ejectorTrack,
    rearRamp,
  ]);

  // Bright machined steel side bearing rails + tungsten anti-bounce weld plug cap on top tube
  const railL = paintGeometry(
    new THREE.BoxGeometry(3.7, 0.16, 0.08).translate(0.1, 0.04, -0.55),
    HK_BRIGHT_STEEL
  );
  const railR = paintGeometry(
    new THREE.BoxGeometry(3.7, 0.16, 0.08).translate(0.1, 0.04, 0.55),
    HK_BRIGHT_STEEL
  );
  const antiBounceCap = paintGeometry(
    new THREE.CylinderGeometry(0.365, 0.365, 0.22, 22)
      .rotateZ(Math.PI / 2)
      .translate(10.66, 1.08, 0),
    HK_BRIGHT_STEEL
  );

  return mergeParts([carved, railL, railR, antiBounceCap]);
}

/**
 * B-03: Roller-Delayed Blowback Bolt Head w/ Roller Windows, Extractor Spring Cut & Ejector Slot
 * (assembledPos: [1.75, 1.00, 0])
 * Spans X_local in [-0.85, +0.90] => world X in [0.90, 2.65], roller windows at X_local = +0.40 (world 2.15)!
 */
export function buildMp5BoltHeadGeometry(): THREE.BufferGeometry {
  const mainBody = paintGeometry(
    new THREE.BoxGeometry(1.75, 0.82, 0.84).translate(0.025, 0, 0),
    HK_CHROME_STEEL
  );
  // Bottom cartridge-stripping lug
  const stripLug = paintGeometry(
    new THREE.BoxGeometry(1.35, 0.14, 0.26).translate(0.18, -0.44, 0.08),
    HK_CHROME_STEEL
  );
  const rawHead = csgUnion([mainBody, stripLug]);

  // Cutters:
  // 1) Internal 45-deg locking-piece wedge pocket
  const wedgePocket = paintGeometry(
    new THREE.BoxGeometry(1.42, 0.56, 0.52).translate(-0.2, 0, 0),
    HK_INNER_DARK
  );
  // 2) Bilateral rectangular roller windows (so the two Ø8mm cylindrical rollers protrude from bolt head sides!)
  const rollerWinSlot = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.62, 1.12).translate(0.4, 0, 0),
    HK_INNER_DARK
  );
  // 3) Recessed 9×19mm breech face cup + central firing-pin aperture bore!
  const breechCup = paintGeometry(
    new THREE.CylinderGeometry(0.285, 0.285, 0.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.86, 0, 0),
    HK_INNER_DARK
  );
  const firingPinHole = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.06, 0.55, 14)
      .rotateZ(Math.PI / 2)
      .translate(0.68, 0, 0),
    HK_INNER_DARK
  );
  // 4) Right-side stepped extractor & wire-spring milled cut (+Z flank)!
  const extractorCut = paintGeometry(
    new THREE.BoxGeometry(0.82, 0.26, 0.18).translate(0.52, 0.08, 0.37),
    HK_INNER_DARK
  );
  const extractorSpringCut = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.12, 0.12).translate(0.05, 0.08, 0.39),
    HK_INNER_DARK
  );
  // 5) Full-length left-bottom longitudinal ejector blade slot (-Z flank)!
  const ejectorGroove = paintGeometry(
    new THREE.BoxGeometry(1.9, 0.28, 0.15).translate(0.02, -0.32, -0.18),
    HK_INNER_DARK
  );

  const boltShell = csgSubtract(rawHead, [
    wedgePocket,
    rollerWinSlot,
    breechCup,
    firingPinHole,
    extractorCut,
    extractorSpringCut,
    ejectorGroove,
  ]);

  // Hardened steel extractor claw w/ inward rim hook + Copper-beryllium HK wire extractor spring + Roller retainer pin!
  const extractorClaw = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.2, 0.13).translate(0.56, 0.08, 0.37),
    HK_DARK_STEEL
  );
  const extractorHook = paintGeometry(
    new THREE.BoxGeometry(0.12, 0.2, 0.2).translate(0.86, 0.08, 0.32),
    HK_DARK_STEEL
  );
  const extractorSpringWire = paintGeometry(
    new THREE.BoxGeometry(0.78, 0.065, 0.075).translate(0.08, 0.08, 0.41),
    HK_COPPER
  );
  const retainerPin = paintGeometry(
    new THREE.CylinderGeometry(0.048, 0.048, 0.83, 12).translate(
      0.68,
      0,
      0.26
    ),
    HK_DARK_STEEL
  );

  return mergeParts([
    boltShell,
    extractorClaw,
    extractorHook,
    extractorSpringWire,
    retainerPin,
  ]);
}

/**
 * Helper for a precision hardened Ø8mm HK cylindrical locking roller (vertical Y axis)
 * Outer radius 0.185 at Z = ±0.40 => outer tangent Z = ±0.585, visibly protruding +0.165 past ±0.42 bolt head walls!
 */
function buildSingleLockingRollerGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.065, -0.29),
    new THREE.Vector2(0.145, -0.29),
    new THREE.Vector2(0.185, -0.245), // Lower precision ground chamfer
    new THREE.Vector2(0.185, -0.03),
    new THREE.Vector2(0.175, 0.0), // Subtle oil-retention micro-groove
    new THREE.Vector2(0.185, 0.03),
    new THREE.Vector2(0.185, 0.245),
    new THREE.Vector2(0.145, 0.29), // Upper precision ground chamfer
    new THREE.Vector2(0.065, 0.29),
  ];
  const rollerLathe = new THREE.LatheGeometry(pts, 28);
  paintGeometry(rollerLathe, HK_CHROME_STEEL);

  const centerPinHole = paintGeometry(
    new THREE.CylinderGeometry(0.068, 0.068, 0.72, 16),
    HK_INNER_DARK
  );
  return csgSubtract(rollerLathe, [centerPinHole]);
}

/**
 * B-04R: Right (+Z) Cylindrical 8mm Locking Roller (mp5_locking_rollers, assembledPos: [2.15, 1.00, 0.40])
 * Cams INWARD (dz < 0) during roller-delayed unlock!
 */
export function buildMp5LockingRollerRightGeometry(): THREE.BufferGeometry {
  return buildSingleLockingRollerGeometry();
}

/**
 * B-04L: Left (-Z) Symmetrical Cylindrical 8mm Locking Roller (mp5_locking_roller_left, assembledPos: [2.15, 1.00, -0.40])
 * Cams INWARD (dz > 0) symmetrically toward bore centerline during unlock!
 */
export function buildMp5LockingRollerLeftGeometry(): THREE.BufferGeometry {
  return buildSingleLockingRollerGeometry();
}

/**
 * B-05: 45° Locking Piece Wedge ("Steuerstück" No. 17, assembledPos: [1.15, 1.00, 0])
 * Rear bayonet stem twist-locks into bolt carrier; forward 45° shoulders wedge between the two Ø8mm rollers!
 */
export function buildMp5LockingPieceGeometry(): THREE.BufferGeometry {
  // Rear cylindrical stem + collar + twist-lock bayonet ears
  const rearStem = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 1.02, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.36, 0, 0),
    HK_BRIGHT_STEEL
  );
  const bayonetEars = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.68, 0.32).translate(-0.56, 0, 0),
    HK_BRIGHT_STEEL
  );
  const stopCollar = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 0.14, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.1, 0, 0),
    HK_BRIGHT_STEEL
  );

  // Forward 45-degree Steuerstück wedge profile in (X, Z) extruded along Y!
  const wedge2D = new THREE.Shape();
  wedge2D.moveTo(0.14, -0.25);
  wedge2D.lineTo(0.64, -0.25);
  wedge2D.lineTo(1.18, -0.065); // Precision ground 45°/50° camming shoulder against left roller!
  wedge2D.lineTo(1.22, 0);
  wedge2D.lineTo(1.18, 0.065);
  wedge2D.lineTo(0.64, 0.25); // Precision ground 45°/50° camming shoulder against right roller!
  wedge2D.lineTo(0.14, 0.25);
  wedge2D.closePath();

  const wedgeBody = new THREE.ExtrudeGeometry(wedge2D, {
    depth: 0.52,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  wedgeBody.rotateX(Math.PI / 2);
  wedgeBody.translate(0, 0.26, 0);
  paintGeometry(wedgeBody, HK_CHROME_STEEL);

  const solid = csgUnion([rearStem, bayonetEars, stopCollar, wedgeBody]);

  // Stepped central firing-pin channel bore
  const pinBoreRear = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 1.4, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.3, 0, 0),
    HK_INNER_DARK
  );
  const pinBoreFront = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 1.6, 14)
      .rotateZ(Math.PI / 2)
      .translate(0.65, 0, 0),
    HK_INNER_DARK
  );
  return csgSubtract(solid, [pinBoreRear, pinBoreFront]);
}

/**
 * B-06: Spring-Loaded Stepped Firing Pin & Return Spring (assembledPos: [0.55, 1.00, 0])
 * Spans X_local in [-1.15, +2.05] => world X in [-0.60, +2.60]
 */
export function buildMp5FiringPinGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -1.16),
    new THREE.Vector2(0.13, -1.12), // Domed hammer-strike anvil
    new THREE.Vector2(0.13, -0.56),
    new THREE.Vector2(0.175, -0.56), // Return-spring stop collar
    new THREE.Vector2(0.175, -0.42),
    new THREE.Vector2(0.09, -0.42), // Main spring-bearing shaft
    new THREE.Vector2(0.085, 1.28),
    new THREE.Vector2(0.055, 1.55), // Locking-piece stepped neck
    new THREE.Vector2(0.032, 2.04), // Hemispherical striker needle
    new THREE.Vector2(0.0, 2.06),
  ];
  const pinLathe = new THREE.LatheGeometry(pts, 18);
  pinLathe.rotateZ(-Math.PI / 2);
  paintGeometry(pinLathe, HK_CHROME_STEEL);

  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.4,
      end: 1.05,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.125,
      wireRadius: 0.022,
      coils: 12,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    HK_SPRING_STEEL
  );

  return mergeParts([pinLathe, returnSpring]);
}

/**
 * B-07: Captive Recoil Spring Guide Rod & Stop Ring (assembledPos: [-5.35, 2.08, 0])
 */
export function buildMp5RecoilRodGeometry(): THREE.BufferGeometry {
  const rearFlange = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.78, 0.68).translate(0.11, -0.1, 0),
    HK_DARK_STEEL
  );
  const crossRivet = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.06, 0.74, 12)
      .rotateX(Math.PI / 2)
      .translate(0.11, -0.34, 0),
    HK_BRIGHT_STEEL
  );
  const guideRod = paintGeometry(
    new THREE.CylinderGeometry(0.105, 0.105, 11.55, 16)
      .rotateZ(Math.PI / 2)
      .translate(5.85, 0, 0),
    HK_BRIGHT_STEEL
  );
  const frontStopCollar = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 0.22, 18)
      .rotateZ(Math.PI / 2)
      .translate(11.15, 0, 0),
    HK_COPPER
  );
  const rearWasher = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.16, 18)
      .rotateZ(Math.PI / 2)
      .translate(0.28, 0, 0),
    HK_DARK_STEEL
  );

  return mergeParts([
    rearFlange,
    crossRivet,
    guideRod,
    frontStopCollar,
    rearWasher,
  ]);
}

/**
 * B-08: Captive Long Helical Recoil Spring (assembledPos: [0, 2.08, 0], spans local X in [-5.20, +5.80], L0 = 11.0)
 */
export function buildMp5RecoilSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: -5.2,
    end: 5.8,
    centerY: 0,
    centerZ: 0,
    coilRadius: 0.21,
    wireRadius: 0.042,
    coils: 32,
    radialSegments: 8,
    tubularSegmentsPerCoil: 14,
  });
  return mergeParts([paintGeometry(spring, HK_SPRING_STEEL)]);
}

// ============================================================================
// 3. NAVY PICTOGRAM GRIP HOUSING & MODULAR TRIGGER PACK ('fire_control' · 5 parts)
// ============================================================================

/**
 * FC-01: HK Navy Bullet-Pictogram Polymer Grip Housing (assembledPos: [-2.15, -0.35, 0], isShell: true)
 * Bound to mp5_lower_{albedo,normal,roughness}.png via applyMp5GripHousingUVs!
 * Strictly preserves local bounds x in [-4.35, +3.80], y in [-5.80, +0.95] so Navy S/1/F pictograms align 1:1!
 */
export function buildMp5GripHousingGeometry(): THREE.BufferGeometry {
  // 1. Upper trigger-box housing tray X_local in [-3.30, +3.75], Y_local in [-0.98, +0.62]
  const trayOuter = paintGeometry(
    new THREE.BoxGeometry(7.05, 1.6, 1.44).translate(0.225, -0.18, 0),
    HK_POLYMER
  );
  const trayHollow = paintGeometry(
    new THREE.BoxGeometry(6.15, 1.38, 1.12).translate(0.2, 0.01, 0),
    HK_POLYMER_ACCENT
  );
  const triggerSlot = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.72, 0.56).translate(0.4, -0.82, 0),
    HK_POLYMER_ACCENT
  );
  const rearBevel = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.72, 1.7)
      .rotateZ(0.32)
      .translate(-3.05, -0.68, 0),
    HK_POLYMER_ACCENT
  );
  const selectorBore = paintGeometry(
    new THREE.CylinderGeometry(0.185, 0.185, 1.65, 16)
      .rotateX(Math.PI / 2)
      .translate(-1.0, -0.2, 0),
    HK_POLYMER_ACCENT
  );
  const rearTakedownHole = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 1.65, 14)
      .rotateX(Math.PI / 2)
      .translate(-3.02, 0.36, 0),
    HK_POLYMER_ACCENT
  );

  const trayShell = csgSubtract(trayOuter, [
    trayHollow,
    triggerSlot,
    rearBevel,
    selectorBore,
    rearTakedownHole,
  ]);

  // Front push-pin / shelf hinge ears meeting rear of upper receiver magwell at world X = +1.40
  const frontEarsRaw = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 1.44, 18)
      .rotateX(Math.PI / 2)
      .translate(3.55, 0.22, 0),
    HK_POLYMER
  );
  const frontPinHole = paintGeometry(
    new THREE.CylinderGeometry(0.145, 0.145, 1.65, 14)
      .rotateX(Math.PI / 2)
      .translate(3.55, 0.22, 0),
    HK_POLYMER_ACCENT
  );
  const frontClevisSlot = paintGeometry(
    new THREE.BoxGeometry(0.9, 0.9, 0.94).translate(3.6, 0.22, 0),
    HK_POLYMER_ACCENT
  );
  const frontEars = csgSubtract(frontEarsRaw, [frontPinHole, frontClevisSlot]);

  // 2. Iconic HK Navy Ergonomic Swept-Back Polymer Pistol Grip w/ Hollow Base & Thumb-Rest Contours!
  const gripShape = new THREE.Shape();
  gripShape.moveTo(-2.5, -0.68);
  gripShape.lineTo(-0.48, -0.68);
  gripShape.quadraticCurveTo(-0.82, -2.15, -1.45, -3.75);
  gripShape.quadraticCurveTo(-1.82, -4.75, -2.18, -5.62);
  gripShape.lineTo(-4.18, -5.32);
  gripShape.quadraticCurveTo(-3.82, -3.95, -3.18, -2.35);
  gripShape.quadraticCurveTo(-2.65, -1.18, -2.5, -0.68);
  gripShape.closePath();

  const gripRaw = new THREE.ExtrudeGeometry(gripShape, {
    depth: 1.2,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 3,
  });
  gripRaw.translate(0, 0, -0.6);
  paintGeometry(gripRaw, HK_POLYMER);

  // Hollow bottom grip storage/molding cavity + subtle ergonomic thumb-web scallops!
  const bottomGripCavity = paintGeometry(
    new THREE.BoxGeometry(1.38, 1.85, 0.82)
      .rotateZ(-0.34)
      .translate(-3.08, -4.85, 0),
    HK_POLYMER_ACCENT
  );
  const thumbScallopL = paintGeometry(
    new THREE.SphereGeometry(0.58, 14, 10)
      .scale(1.25, 0.65, 0.18)
      .translate(-1.55, -1.12, -0.68),
    HK_POLYMER
  );
  const thumbScallopR = paintGeometry(
    new THREE.SphereGeometry(0.58, 14, 10)
      .scale(1.25, 0.65, 0.18)
      .translate(-1.55, -1.12, 0.68),
    HK_POLYMER
  );
  const gripBody = csgSubtract(gripRaw, [
    bottomGripCavity,
    thumbScallopL,
    thumbScallopR,
  ]);

  // 3. Integral Gloved Polymer Trigger Guard Bow w/ Beveled Front Undercut
  const guardOuter = paintGeometry(
    new THREE.BoxGeometry(3.65, 1.48, 0.68).translate(1.12, -1.45, 0),
    HK_POLYMER
  );
  const guardCut = paintGeometry(
    new THREE.BoxGeometry(2.85, 1.1, 1.05).translate(1.12, -1.36, 0),
    HK_POLYMER_ACCENT
  );
  const guardFrontBevel = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.62, 1.05)
      .rotateZ(0.58)
      .translate(2.88, -2.08, 0),
    HK_POLYMER_ACCENT
  );
  const triggerGuard = csgSubtract(guardOuter, [guardCut, guardFrontBevel]);

  const merged = mergeParts([trayShell, frontEars, gripBody, triggerGuard]);
  return applyMp5GripHousingUVs(merged);
}

/**
 * FC-02: Removable Stainless Sheet-Steel SEF/Navy Trigger Box, Sear & Pivoted Ejector Lever
 * (assembledPos: [-1.85, -0.25, 0])
 */
export function buildMp5TriggerPackGeometry(): THREE.BufferGeometry {
  const boxOuter = paintGeometry(
    new THREE.BoxGeometry(4.15, 1.12, 0.96).translate(0.15, -0.1, 0),
    HK_BRIGHT_STEEL
  );
  const boxInner = paintGeometry(
    new THREE.BoxGeometry(3.82, 0.98, 0.76).translate(0.15, 0.04, 0),
    HK_INNER_DARK
  );
  const sideWindow = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.48, 1.2).translate(-0.35, -0.08, 0),
    HK_INNER_DARK
  );
  const selectorNotch = paintGeometry(
    new THREE.CylinderGeometry(0.19, 0.19, 1.2, 14)
      .rotateX(Math.PI / 2)
      .translate(-1.3, -0.3, 0),
    HK_INNER_DARK
  );
  const chassis = csgSubtract(boxOuter, [boxInner, sideWindow, selectorNotch]);

  // Signature HK MP5 Long Pivoted Steel Ejector Lever rising at front-left (Z = -0.18) into bolt-head groove!
  const ejectorArm = paintGeometry(
    new THREE.BoxGeometry(2.78, 0.24, 0.11).translate(1.85, 0.68, -0.18),
    HK_DARK_STEEL
  );
  const ejectorTip = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.44, 0.11)
      .rotateZ(0.14)
      .translate(3.16, 0.9, -0.18),
    HK_DARK_STEEL
  );
  const ejectorPivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 1.02, 12)
      .rotateX(Math.PI / 2)
      .translate(0.85, 0.44, 0),
    HK_DARK_STEEL
  );
  const ejectorSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: 0.05,
      end: 0.48,
      centerX: 0.52,
      centerZ: -0.18,
      coilRadius: 0.07,
      wireRadius: 0.018,
      coils: 5,
    }),
    HK_SPRING_STEEL
  );

  // Internal sear & disconnector plates + cross axles
  const searPlate = paintGeometry(
    new THREE.BoxGeometry(1.38, 0.34, 0.44).translate(-0.15, 0.22, 0),
    HK_DARK_STEEL
  );
  const axle1 = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 1.06, 12)
      .rotateX(Math.PI / 2)
      .translate(1.0, 0.2, 0),
    HK_DARK_STEEL
  );
  const axle2 = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 1.06, 12)
      .rotateX(Math.PI / 2)
      .translate(0.1, -0.25, 0),
    HK_DARK_STEEL
  );

  // Stationary HK hammer strut rod + captive coil mainspring seated inside rear of trigger box!
  const strutRod = paintGeometry(
    new THREE.CylinderGeometry(0.05, 0.05, 1.48, 10)
      .rotateZ(Math.PI / 2 - 0.28)
      .translate(0.22, -0.02, 0),
    HK_BRIGHT_STEEL
  );
  const strutSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.38,
      end: -0.32,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.11,
      wireRadius: 0.024,
      coils: 10,
    })
      .rotateZ(-0.28)
      .translate(1.0, -0.02, 0),
    HK_SPRING_STEEL
  );

  return mergeParts([
    chassis,
    ejectorArm,
    ejectorTip,
    ejectorPivotPin,
    ejectorSpring,
    searPlate,
    axle1,
    axle2,
    strutRod,
    strutSpring,
  ]);
}

/**
 * FC-03: Rotary Steel Hammer (assembledPos: [-0.85, -0.05, 0])
 * Pivot at local (0, 0, 0): cocked-down rearward at rest (worldY_max <= +0.45), swings UP & FORWARD (rz < 0) into firing pin!
 */
export function buildMp5HammerGeometry(): THREE.BufferGeometry {
  const hubOuter = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.68, 18).rotateX(Math.PI / 2),
    HK_BRIGHT_STEEL
  );
  const hubBore = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.85, 14).rotateX(Math.PI / 2),
    HK_INNER_DARK
  );
  const pivotHub = csgSubtract(hubOuter, [hubBore]);

  const hShape = new THREE.Shape();
  hShape.moveTo(-0.2, -0.05);
  hShape.lineTo(0.22, -0.14); // Primary sear step
  hShape.lineTo(0.28, 0.55);
  hShape.lineTo(0.15, 1.08); // Front striking face aligned with firing pin at Y_world = 1.00!
  hShape.lineTo(-0.32, 1.02);
  hShape.lineTo(-0.44, 0.48); // Disconnector catch notch
  hShape.lineTo(-0.34, 0.36);
  hShape.closePath();

  const rawHead = new THREE.ExtrudeGeometry(hShape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  rawHead.translate(0, 0, -0.18);
  paintGeometry(rawHead, HK_CHROME_STEEL);

  const lighteningHole = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.52, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.08, 0.62, 0),
    HK_INNER_DARK
  );
  const hammerHead = csgSubtract(rawHead, [lighteningHole]);
  hammerHead.rotateZ(1.26); // Cocked-down rearward below bolt & carrier (worldY_max <= +0.45)!

  return mergeParts([pivotHub, hammerHead]);
}

/**
 * FC-04: Curved Steel MP5 Trigger Shoe & Transfer Bow (assembledPos: [-1.75, -0.95, 0])
 * Pivot at local (0, 0, 0): finger bow hangs DOWNWARD (-Y) so rz < 0 pulls shoe BACKWARD (-X)!
 */
export function buildMp5TriggerGeometry(): THREE.BufferGeometry {
  const pinHub = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 0.54, 16).rotateX(Math.PI / 2),
    HK_DARK_STEEL
  );

  const bow = new THREE.Shape();
  bow.moveTo(-0.16, 0.08);
  bow.lineTo(0.2, 0.08);
  bow.quadraticCurveTo(0.05, -0.65, 0.28, -1.18);
  bow.lineTo(0.06, -1.28);
  bow.quadraticCurveTo(-0.26, -0.68, -0.16, 0.08);
  bow.closePath();

  const shoe = new THREE.ExtrudeGeometry(bow, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  shoe.translate(0, 0, -0.17);
  paintGeometry(shoe, HK_DARK_STEEL);

  // Upper horizontal trigger transfer bar / sear trip bow inside trigger box
  const transferBar = paintGeometry(
    new THREE.BoxGeometry(1.12, 0.22, 0.48).translate(0.32, 0.28, 0),
    HK_BRIGHT_STEEL
  );

  return mergeParts([pinHub, shoe, transferBar]);
}

/**
 * FC-05: Ambidextrous Navy Pictogram Fire Selector Lever (assembledPos: [-3.15, -0.55, 0])
 * Centered directly on the selector pivot of mp5_grip_housing, pointing forward (+X) at Red Semi bullet icon!
 */
export function buildMp5SelectorGeometry(): THREE.BufferGeometry {
  const drumRaw = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 1.56, 18).rotateX(Math.PI / 2),
    HK_DARK_STEEL
  );
  const fireCutout = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.18, 0.62).translate(0.08, 0.12, 0),
    HK_INNER_DARK
  );
  const drumAxle = csgSubtract(drumRaw, [fireCutout]);

  const safetyCam = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.34, 0.56).translate(-0.14, 0.12, 0),
    HK_BRIGHT_STEEL
  );

  const levers: THREE.BufferGeometry[] = [drumAxle, safetyCam];
  for (const side of [-1, 1]) {
    const zPos = side * 0.77;
    levers.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.28, 0.28, 0.1, 20)
          .rotateX(Math.PI / 2)
          .translate(0, 0, zPos),
        HK_POLYMER_ACCENT
      )
    );
    const leverLen = side < 0 ? 1.15 : 0.98;
    levers.push(
      paintGeometry(
        new THREE.BoxGeometry(leverLen, 0.24, 0.12).translate(
          leverLen * 0.42,
          0,
          zPos + side * 0.05
        ),
        HK_POLYMER_ACCENT
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.28, 0.36, 0.18).translate(
          leverLen * 0.85,
          0,
          zPos + side * 0.08
        ),
        HK_POLYMER_ACCENT
      ),
      // Tactile thumb traction ridge
      paintGeometry(
        new THREE.BoxGeometry(0.08, 0.34, 0.05).translate(
          leverLen * 0.9,
          0,
          zPos + side * 0.18
        ),
        HK_DARK_STEEL
      ),
      // Crisp white pointer line pointing directly at the Navy Semi bullet pictogram!
      paintGeometry(
        new THREE.BoxGeometry(0.3, 0.05, 0.03).translate(
          leverLen * 0.7,
          0,
          zPos + side * 0.16
        ),
        '#f1f5f9'
      )
    );
  }

  return mergeParts(levers);
}

// ============================================================================
// 4. CURVED 30-ROUND 9×19MM STAMPED STEEL MAGAZINE ('magazine' · 4 parts)
// ============================================================================
const MAG_CX = 16.0;
const MAG_CY = 0.45;
const MAG_R_IN = 15.08;
const MAG_R_OUT = 16.92;
const MAG_ANG_START = -0.05;
const MAG_ANG_END = 0.54;

/**
 * M-01: Curved 30-Round 9×19mm Stamped Steel Magazine Body w/ Ribs, Witness Holes & Open Feed Lips
 * (assembledPos: [2.90, -0.45, 0], isShell: true)
 */
export function buildMp5MagBodyGeometry(): THREE.BufferGeometry {
  const curveProfile = new THREE.Shape();
  const steps = 26;

  // Rear/outer spine from top to bottom
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const ang = MAG_ANG_START + (MAG_ANG_END - MAG_ANG_START) * u;
    const px = MAG_CX - Math.cos(ang) * MAG_R_OUT;
    const py = MAG_CY - Math.sin(ang) * MAG_R_OUT;
    if (i === 0) curveProfile.moveTo(px, py);
    else curveProfile.lineTo(px, py);
  }
  // Front/inner spine from bottom to top
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    const ang = MAG_ANG_START + (MAG_ANG_END - MAG_ANG_START) * u;
    const px = MAG_CX - Math.cos(ang) * MAG_R_IN;
    const py = MAG_CY - Math.sin(ang) * MAG_R_IN;
    curveProfile.lineTo(px, py);
  }
  curveProfile.closePath();

  const rawMag = new THREE.ExtrudeGeometry(curveProfile, {
    depth: 0.92,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 2,
  });
  rawMag.translate(0, 0, -0.46);
  paintGeometry(rawMag, HK_DARK_STEEL);

  // Hollow top feed throat + stamped curved side strengthening flutes + rear witness holes (10/20/30)!
  const throatHollow = paintGeometry(
    new THREE.BoxGeometry(1.54, 1.65, 0.72).translate(0, 0.7, 0),
    HK_INNER_DARK
  );

  const ribCutters: THREE.BufferGeometry[] = [throatHollow];
  for (let s = 1; s <= 6; s++) {
    const ang = 0.08 + s * 0.068;
    const rx = MAG_CX - Math.cos(ang) * 16.0;
    const ry = MAG_CY - Math.sin(ang) * 16.0;
    for (const side of [-1, 1]) {
      ribCutters.push(
        paintGeometry(
          new THREE.BoxGeometry(1.02, 0.42, 0.06)
            .rotateZ(ang)
            .translate(rx, ry, side * 0.49),
          HK_INNER_DARK
        )
      );
    }
  }
  // 3 round-count witness holes drilled into rear spine (10 / 20 / 30 rounds)
  for (const wAng of [0.19, 0.33, 0.46]) {
    const wx = MAG_CX - Math.cos(wAng) * MAG_R_OUT;
    const wy = MAG_CY - Math.sin(wAng) * MAG_R_OUT;
    ribCutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.065, 0.065, 0.28, 12)
          .rotateZ(Math.PI / 2 + wAng)
          .translate(wx, wy, 0),
        HK_INNER_DARK
      )
    );
  }
  const sculptedMag = csgSubtract(rawMag, ribCutters);

  // Open Left & Right Curved Stamped Steel Double-Stack Feed Lips + Stop Collar + Rear Paddle Catch Lug!
  const feedLipL = paintGeometry(
    new THREE.BoxGeometry(1.66, 0.24, 0.18)
      .rotateX(0.28)
      .translate(0.02, 1.24, -0.34),
    HK_BRIGHT_STEEL
  );
  const feedLipR = paintGeometry(
    new THREE.BoxGeometry(1.66, 0.24, 0.18)
      .rotateX(-0.28)
      .translate(0.02, 1.24, 0.34),
    HK_BRIGHT_STEEL
  );
  const frontGuideLip = paintGeometry(
    new THREE.BoxGeometry(0.2, 0.24, 0.78).translate(0.8, 1.16, 0),
    HK_BRIGHT_STEEL
  );
  const stopCollar = paintGeometry(
    new THREE.BoxGeometry(1.94, 0.16, 1.02)
      .rotateZ(0.08)
      .translate(0.12, -1.28, 0),
    HK_STEEL_HIGHLIGHT
  );
  const catchLug = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.28, 0.56).translate(-0.92, -0.92, 0),
    HK_BRIGHT_STEEL
  );

  return mergeParts([
    sculptedMag,
    feedLipL,
    feedLipR,
    frontGuideLip,
    stopCollar,
    catchLug,
  ]);
}

/**
 * M-02: Stepped Anti-Tilt Follower (assembledPos: [2.95, -0.85, 0])
 */
export function buildMp5MagFollowerGeometry(): THREE.BufferGeometry {
  const topDeck = paintGeometry(
    new THREE.BoxGeometry(1.52, 0.22, 0.68)
      .rotateZ(0.08)
      .translate(0, 0.14, 0),
    HK_FOLLOWER_ORANGE
  );
  const stepBead = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 1.44, 14)
      .rotateZ(Math.PI / 2 + 0.08)
      .translate(0, 0.28, -0.14),
    HK_FOLLOWER_ORANGE
  );
  const skirtF = paintGeometry(
    new THREE.BoxGeometry(0.18, 0.82, 0.64)
      .rotateZ(0.08)
      .translate(0.66, -0.28, 0),
    HK_FOLLOWER_ORANGE
  );
  const skirtR = paintGeometry(
    new THREE.BoxGeometry(0.18, 0.82, 0.64)
      .rotateZ(0.08)
      .translate(-0.66, -0.28, 0),
    HK_FOLLOWER_ORANGE
  );
  return mergeParts([topDeck, stepBead, skirtF, skirtR]);
}

/**
 * M-03: Curved Rectangular Magazine Spring following the exact R=16.0 MP5 arc (assembledPos: [2.90, -0.45, 0])
 */
export function buildMp5MagSpringGeometry(): THREE.BufferGeometry {
  const coils = 11;
  const stepsPerCoil = 24;
  const totalSteps = coils * stepsPerCoil;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const ang = 0.105 + u * 0.405;
    const theta = u * coils * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const radialOff = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.58) * 0.64;
    const zOff = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.58) * 0.26;

    const rCur = 16.0 + radialOff;
    const px = MAG_CX - Math.cos(ang) * rCur;
    const py = MAG_CY - Math.sin(ang) * rCur;
    points.push(new THREE.Vector3(px, py, zOff));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(curve, totalSteps, 0.042, 8, false);
  return mergeParts([paintGeometry(tube, HK_SPRING_STEEL)]);
}

/**
 * M-04: Flush Stamped Steel Magazine Floorplate & Lock Plate (assembledPos: [5.18, -8.23, 0])
 * Rotated +0.54 rad around Z so local top face (y=0) mates with 0.000 gap onto mp5_mag_body bottom!
 */
export function buildMp5MagFloorplateGeometry(): THREE.BufferGeometry {
  const basePlate = paintGeometry(
    new THREE.BoxGeometry(1.98, 0.2, 1.04)
      .translate(0, -0.06, 0)
      .rotateZ(MAG_ANG_END),
    HK_DARK_STEEL
  );
  const lipRailL = paintGeometry(
    new THREE.BoxGeometry(1.92, 0.12, 0.1)
      .translate(0, 0.06, -0.47)
      .rotateZ(MAG_ANG_END),
    HK_STEEL_HIGHLIGHT
  );
  const lipRailR = paintGeometry(
    new THREE.BoxGeometry(1.92, 0.12, 0.1)
      .translate(0, 0.06, 0.47)
      .rotateZ(MAG_ANG_END),
    HK_STEEL_HIGHLIGHT
  );
  const lockButton = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 0.22, 16)
      .translate(0, -0.08, 0)
      .rotateZ(MAG_ANG_END),
    HK_BRIGHT_STEEL
  );
  return mergeParts([basePlate, lipRailL, lipRailR, lockButton]);
}
