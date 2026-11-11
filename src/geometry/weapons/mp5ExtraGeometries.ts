import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../springHelper';

const HK_DARK_STEEL = '#212630';
const HK_INNER_DARK = '#12161d';
const HK_BRIGHT_STEEL = '#d5dde7';
const HK_CHROME_STEEL = '#e2e8f0';
const HK_SPRING_STEEL = '#94a3b8';
const HK_POLYMER = '#1b1f27';
const HK_POLYMER_ACCENT = '#14171e';
const HK_COPPER = '#b45309';
const HK_FOLLOWER_ORANGE = '#ea580c';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function fractPos(v: number): number {
  return v - Math.floor(v);
}

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const fNorm = new THREE.Vector3();

function triFaceInfo(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  i0: number,
  i1: number,
  i2: number
) {
  vA.fromBufferAttribute(pos, i0);
  vB.fromBufferAttribute(pos, i1);
  vC.fromBufferAttribute(pos, i2);
  e1.subVectors(vB, vA);
  e2.subVectors(vC, vA);
  fNorm.crossVectors(e1, e2);
  if (fNorm.lengthSq() > 1e-12) fNorm.normalize();
  else fNorm.set(0, 1, 0);
  const cz = (vA.z + vB.z + vC.z) / 3;
  return { cz, fnz: fNorm.z };
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
      const yNorm = clamp01((y - -5.80) / 6.75);

      let u: number;
      let v: number;
      if (side === 'right') {
        u = 0.05 + xNorm * 0.90;
        v = 0.52 + yNorm * 0.44;
      } else if (side === 'left') {
        u = 0.05 + (1.0 - xNorm) * 0.90;
        v = 0.05 + yNorm * 0.44;
      } else {
        // Clean matte polymer swatch along bottom-left corner away from pictogram ink
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
 * B-01: Non-Reciprocating Left HK-Slap Charging Handle & Internal Support Sleeve
 * (assembledPos: [12.45, 2.08, 0] — stays completely stationary during firing!)
 */
export function buildMp5ChargingHandleGeometry(): THREE.BufferGeometry {
  // Cylindrical cocking support sleeve sliding inside forward cocking tube
  const outerSleeve = paintGeometry(
    new THREE.CylinderGeometry(0.35, 0.35, 2.95, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.1, 0, 0),
    HK_DARK_STEEL
  );
  const innerBore = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 3.2, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.1, 0, 0),
    HK_INNER_DARK
  );
  const sleeve = csgSubtract(outerSleeve, [innerBore]);

  // Left-side angled steel lever neck + knurled black polymer HK-Slap knob!
  const leverArm = paintGeometry(
    new THREE.BoxGeometry(0.54, 0.24, 0.68)
      .rotateX(-0.22)
      .translate(0.35, 0.08, -0.58),
    HK_DARK_STEEL
  );
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.36, 12).translate(0.35, 0.08, -0.45),
    HK_BRIGHT_STEEL
  );
  const slapKnob = paintGeometry(
    new THREE.CylinderGeometry(0.19, 0.23, 0.78, 20)
      .rotateX(Math.PI / 2 - 0.22)
      .translate(0.35, 0.22, -1.14),
    HK_POLYMER
  );
  const knobTipCap = paintGeometry(
    new THREE.SphereGeometry(0.19, 16, 12)
      .scale(1, 1, 0.45)
      .translate(0.35, 0.30, -1.51),
    HK_POLYMER_ACCENT
  );

  return mergeParts([sleeve, leverArm, pivotPin, slapKnob, knobTipCap]);
}

/**
 * B-02: Heavy HK MP5 Bolt Carrier w/ Forward Recoil-Tube Extension
 * (assembledPos: [-1.15, 1.00, 0])
 */
export function buildMp5BoltCarrierGeometry(): THREE.BufferGeometry {
  // Lower heavy carrier body X_local in [-2.45, +2.05] (world [-3.60, +0.90], meets bolt head rear!)
  const carrierBlock = paintGeometry(
    new THREE.BoxGeometry(4.5, 0.96, 1.06).translate(-0.2, 0.02, 0),
    HK_DARK_STEEL
  );
  // Connecting vertical spine web up to upper recoil tube (Y_local = +1.08 -> world Y = 2.08)
  const spineWeb = paintGeometry(
    new THREE.BoxGeometry(4.35, 0.85, 0.66).translate(-0.15, 0.62, 0),
    HK_DARK_STEEL
  );
  // Long forward cylindrical recoil-rod/cocking extension tube (X_local in [-2.35, +10.75] -> world [-3.50, +9.60])
  const upperTube = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 13.1, 24)
      .rotateZ(Math.PI / 2)
      .translate(4.2, 1.08, 0),
    HK_DARK_STEEL
  );

  const solid = csgUnion([carrierBlock, spineWeb, upperTube]);

  // Cut rear hammer/firing-pin access slot, front locking-piece socket, and upper recoil-spring tunnel!
  const hammerSlot = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.72, 0.44).translate(-1.35, -0.14, 0),
    HK_INNER_DARK
  );
  const frontSocket = paintGeometry(
    new THREE.CylinderGeometry(0.34, 0.34, 1.5, 20)
      .rotateZ(Math.PI / 2)
      .translate(1.55, 0, 0),
    HK_INNER_DARK
  );
  const springTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 12.6, 18)
      .rotateZ(Math.PI / 2)
      .translate(3.8, 1.08, 0),
    HK_INNER_DARK
  );
  // Angled rear underside hammer-cocking cam bevel
  const rearRamp = paintGeometry(
    new THREE.BoxGeometry(1.1, 0.5, 1.2)
      .rotateZ(-0.38)
      .translate(-2.25, -0.48, 0),
    HK_INNER_DARK
  );

  const carved = csgSubtract(solid, [
    hammerSlot,
    frontSocket,
    springTunnel,
    rearRamp,
  ]);

  // Bright machined steel side bearing rails + tungsten anti-bounce weight plug seam
  const railL = paintGeometry(
    new THREE.BoxGeometry(4.2, 0.16, 0.08).translate(-0.2, 0.04, -0.55),
    HK_BRIGHT_STEEL
  );
  const railR = paintGeometry(
    new THREE.BoxGeometry(4.2, 0.16, 0.08).translate(-0.2, 0.04, 0.55),
    HK_BRIGHT_STEEL
  );

  return mergeParts([carved, railL, railR]);
}

/**
 * B-03: Roller-Delayed Blowback Bolt Head & Extractor Claw (assembledPos: [1.75, 1.00, 0])
 * Spans X_local in [-0.85, +0.90] => world X in [0.90, 2.65], roller windows at X_local = +0.40 (world 2.15)!
 */
export function buildMp5BoltHeadGeometry(): THREE.BufferGeometry {
  const mainBody = paintGeometry(
    new THREE.BoxGeometry(1.75, 0.82, 0.84).translate(0.025, 0, 0),
    HK_CHROME_STEEL
  );

  // Hollow interior pocket for 45-deg locking piece + left/right rectangular roller windows + recessed bolt face!
  const wedgePocket = paintGeometry(
    new THREE.BoxGeometry(1.35, 0.56, 0.52).translate(-0.22, 0, 0),
    HK_INNER_DARK
  );
  const rollerWinSlot = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.60, 1.10).translate(0.40, 0, 0),
    HK_INNER_DARK
  );
  const breechCup = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.18, 20)
      .rotateZ(Math.PI / 2)
      .translate(0.86, 0, 0),
    HK_INNER_DARK
  );
  const ejectorGroove = paintGeometry(
    new THREE.BoxGeometry(1.85, 0.24, 0.14).translate(0.02, -0.32, -0.22),
    HK_INNER_DARK
  );

  const boltShell = csgSubtract(mainBody, [
    wedgePocket,
    rollerWinSlot,
    breechCup,
    ejectorGroove,
  ]);

  // Copper-finished HK wire extractor spring + hardened steel extractor claw on right side (+Z)
  const extractorClaw = paintGeometry(
    new THREE.BoxGeometry(0.72, 0.20, 0.14).translate(0.54, 0.06, 0.39),
    HK_DARK_STEEL
  );
  const extractorSpringWire = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.07, 0.08).translate(0.18, 0.06, 0.43),
    HK_COPPER
  );
  // Roller retainer pin plate on front top/bottom
  const retainerPin = paintGeometry(
    new THREE.CylinderGeometry(0.05, 0.05, 0.82, 12).translate(0.68, 0, 0.28),
    HK_DARK_STEEL
  );

  return mergeParts([
    boltShell,
    extractorClaw,
    extractorSpringWire,
    retainerPin,
  ]);
}

/**
 * Helper for a precision hardened 8mm HK cylindrical locking roller (vertical Y axis)
 */
function buildSingleLockingRollerGeometry(): THREE.BufferGeometry {
  const outer = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.56, 26),
    HK_CHROME_STEEL
  );
  const topBevel = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.18, 0.05, 26).translate(0, 0.30, 0),
    HK_CHROME_STEEL
  );
  const botBevel = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.14, 0.05, 26).translate(0, -0.30, 0),
    HK_CHROME_STEEL
  );
  const solid = csgUnion([outer, topBevel, botBevel]);
  const centerPinHole = paintGeometry(
    new THREE.CylinderGeometry(0.065, 0.065, 0.72, 16),
    HK_INNER_DARK
  );
  return csgSubtract(solid, [centerPinHole]);
}

/**
 * B-04: Right (+Z) Cylindrical 8mm Locking Roller (mp5_locking_rollers, assembledPos: [2.15, 1.00, 0.40])
 * Cams INWARD (dz < 0) during roller-delayed unlock!
 */
export function buildMp5LockingRollerRightGeometry(): THREE.BufferGeometry {
  return buildSingleLockingRollerGeometry();
}

/**
 * B-05: Left (-Z) Symmetrical Cylindrical 8mm Locking Roller (mp5_locking_roller_left, assembledPos: [2.15, 1.00, -0.40])
 * Cams INWARD (dz > 0) symmetrically toward bore centerline during unlock!
 */
export function buildMp5LockingRollerLeftGeometry(): THREE.BufferGeometry {
  return buildSingleLockingRollerGeometry();
}

/**
 * B-06: 45° Locking Piece Wedge ("Steuerstück" No. 17, assembledPos: [1.15, 1.00, 0])
 * Rear bayonet stem locks into bolt carrier; forward 45° angled shoulders wedge between twin rollers!
 */
export function buildMp5LockingPieceGeometry(): THREE.BufferGeometry {
  // Rear cylindrical stem + twist-lock bayonet ears
  const rearStem = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 1.05, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.35, 0, 0),
    HK_BRIGHT_STEEL
  );
  const bayonetEars = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.68, 0.32).translate(-0.55, 0, 0),
    HK_BRIGHT_STEEL
  );

  // Forward 45-degree wedge profile in (X, Z) extruded along Y!
  const wedge2D = new THREE.Shape();
  wedge2D.moveTo(0.15, -0.26);
  wedge2D.lineTo(0.62, -0.26);
  wedge2D.lineTo(1.18, -0.07); // Steep ~45°/50° cam shoulder pressing against left roller!
  wedge2D.lineTo(1.18, 0.07);
  wedge2D.lineTo(0.62, 0.26); // Steep cam shoulder pressing against right roller!
  wedge2D.lineTo(0.15, 0.26);
  wedge2D.closePath();

  const wedgeBody = new THREE.ExtrudeGeometry(wedge2D, {
    depth: 0.50,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  wedgeBody.rotateX(Math.PI / 2);
  wedgeBody.translate(0, 0.25, 0);
  paintGeometry(wedgeBody, HK_CHROME_STEEL);

  const solid = mergeParts([rearStem, bayonetEars, wedgeBody]);

  // Central firing-pin channel bore
  const pinBore = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 2.4, 14)
      .rotateZ(Math.PI / 2)
      .translate(0.2, 0, 0),
    HK_INNER_DARK
  );
  return csgSubtract(solid, [pinBore]);
}

/**
 * B-07: Spring-Loaded Firing Pin & Return Spring (assembledPos: [0.55, 1.00, 0])
 * Spans X_local in [-1.15, +2.05] => world X in [-0.60, +2.60]
 */
export function buildMp5FiringPinGeometry(): THREE.BufferGeometry {
  const rearHead = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 0.58, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.86, 0, 0),
    HK_CHROME_STEEL
  );
  const collar = paintGeometry(
    new THREE.CylinderGeometry(0.17, 0.17, 0.14, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.50, 0, 0),
    HK_CHROME_STEEL
  );
  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.09, 1.75, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.45, 0, 0),
    HK_CHROME_STEEL
  );
  const strikerNeedle = paintGeometry(
    new THREE.CylinderGeometry(0.035, 0.075, 0.72, 14)
      .rotateZ(Math.PI / 2)
      .translate(1.68, 0, 0),
    HK_CHROME_STEEL
  );
  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.40,
      end: 0.95,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.125,
      wireRadius: 0.022,
      coils: 11,
      radialSegments: 8,
      tubularSegmentsPerCoil: 14,
    }),
    HK_SPRING_STEEL
  );

  return mergeParts([rearHead, collar, shaft, strikerNeedle, returnSpring]);
}

/**
 * B-08: Captive Recoil Spring Guide Rod & Stop Ring (assembledPos: [-5.35, 2.08, 0])
 * Anchored at rear endcap X = -5.35, extends forward along X_local in [0, +11.6] => world [-5.35, +6.25]
 */
export function buildMp5RecoilRodGeometry(): THREE.BufferGeometry {
  const rearFlange = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.76, 0.68).translate(0.11, -0.10, 0),
    HK_DARK_STEEL
  );
  const guideRod = paintGeometry(
    new THREE.CylinderGeometry(0.105, 0.105, 11.55, 16)
      .rotateZ(Math.PI / 2)
      .translate(5.85, 0, 0),
    HK_BRIGHT_STEEL
  );
  const frontStopCollar = paintGeometry(
    new THREE.CylinderGeometry(0.20, 0.20, 0.22, 18)
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

  return mergeParts([rearFlange, guideRod, frontStopCollar, rearWasher]);
}

/**
 * B-09: Captive Long Helical Recoil Spring (assembledPos: [0, 2.08, 0], spans local X in [-5.20, +5.80], L0 = 11.0)
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
    coils: 30,
    radialSegments: 8,
    tubularSegmentsPerCoil: 14,
  });
  return paintGeometry(spring, HK_SPRING_STEEL);
}

// ============================================================================
// 3. NAVY PICTOGRAM GRIP HOUSING & MODULAR TRIGGER PACK ('fire_control' · 5 parts)
// ============================================================================

/**
 * FC-01: HK Navy Bullet-Pictogram Polymer Grip Housing (assembledPos: [-2.15, -0.35, 0], isShell: true)
 * Bound to mp5_lower_{albedo,normal,roughness}.png via applyMp5GripHousingUVs!
 * Pistol grip sweeps BACKWARD (-X) as Y descends (-Y)!
 */
export function buildMp5GripHousingGeometry(): THREE.BufferGeometry {
  // 1. Upper trigger-box housing tray X_local in [-3.30, +3.75] (world [-5.45, +1.60]), Y_local in [-0.98, +0.62]
  const trayOuter = paintGeometry(
    new THREE.BoxGeometry(7.05, 1.60, 1.44).translate(0.225, -0.18, 0),
    HK_POLYMER
  );
  const trayHollow = paintGeometry(
    new THREE.BoxGeometry(6.15, 1.38, 1.12).translate(0.20, 0.01, 0),
    HK_POLYMER_ACCENT
  );
  const triggerSlot = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.72, 0.56).translate(0.40, -0.82, 0),
    HK_POLYMER_ACCENT
  );
  // Slanted rear tang taper to tuck cleanly into MP5A3 stock endcap takedown pin!
  const rearBevel = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.72, 1.70)
      .rotateZ(0.32)
      .translate(-3.05, -0.68, 0),
    HK_POLYMER_ACCENT
  );
  const trayShell = csgSubtract(trayOuter, [
    trayHollow,
    triggerSlot,
    rearBevel,
  ]);

  // Front push-pin / shelf hinge ears meeting the rear of the upper receiver's magwell at world X = +1.55
  const frontEarsRaw = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 1.44, 18)
      .rotateX(Math.PI / 2)
      .translate(3.55, 0.22, 0),
    HK_POLYMER
  );
  const frontPinHole = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 1.65, 14)
      .rotateX(Math.PI / 2)
      .translate(3.55, 0.22, 0),
    HK_POLYMER_ACCENT
  );
  const frontEars = csgSubtract(frontEarsRaw, [frontPinHole]);

  // 2. Iconic HK Navy Smooth Swept-Back Polymer Pistol Grip!
  // Top neck at X_local in [-2.45, -0.55], Y_local = -0.75 -> sweeps BACKWARD (-X) to [-4.22, -2.18] at Y_local = -5.65!
  const gripShape = new THREE.Shape();
  gripShape.moveTo(-2.50, -0.68);
  gripShape.lineTo(-0.48, -0.68);
  // Smooth front straight-tapered Navy contour sweeping backward (-X) as Y goes down (-Y)
  gripShape.quadraticCurveTo(-0.82, -2.15, -1.45, -3.75);
  gripShape.quadraticCurveTo(-1.82, -4.75, -2.18, -5.62);
  // Angled grip baseplate perpendicular to grip axis
  gripShape.lineTo(-4.18, -5.32);
  // Rear palm swell & upper thumb-web beavertail curve!
  gripShape.quadraticCurveTo(-3.82, -3.95, -3.18, -2.35);
  gripShape.quadraticCurveTo(-2.65, -1.18, -2.50, -0.68);
  gripShape.closePath();

  const gripBody = new THREE.ExtrudeGeometry(gripShape, {
    depth: 1.20,
    bevelEnabled: true,
    bevelThickness: 0.10,
    bevelSize: 0.08,
    bevelSegments: 3,
  });
  gripBody.translate(0, 0, -0.60);
  paintGeometry(gripBody, HK_POLYMER);

  // 3. Integral Gloved Polymer Trigger Guard Bow (X_local in [-0.72, +2.95], Y_local in [-2.18, -0.75])
  const guardOuter = paintGeometry(
    new THREE.BoxGeometry(3.65, 1.48, 0.68).translate(1.12, -1.45, 0),
    HK_POLYMER
  );
  const guardCut = paintGeometry(
    new THREE.BoxGeometry(2.85, 1.10, 1.05).translate(1.12, -1.36, 0),
    HK_POLYMER_ACCENT
  );
  const triggerGuard = csgSubtract(guardOuter, [guardCut]);

  const merged = mergeParts([trayShell, frontEars, gripBody, triggerGuard]);
  return applyMp5GripHousingUVs(merged);
}

/**
 * FC-02: Removable Stainless Sheet-Steel SEF/Navy Trigger Box, Sear & Pivoted Ejector Lever
 * (assembledPos: [-1.85, -0.25, 0])
 */
export function buildMp5TriggerPackGeometry(): THREE.BufferGeometry {
  const boxOuter = paintGeometry(
    new THREE.BoxGeometry(4.15, 1.12, 0.96).translate(0.15, -0.10, 0),
    HK_BRIGHT_STEEL
  );
  const boxInner = paintGeometry(
    new THREE.BoxGeometry(3.82, 0.98, 0.76).translate(0.15, 0.04, 0),
    HK_INNER_DARK
  );
  const chassis = csgSubtract(boxOuter, [boxInner]);

  // Signature HK MP5 Long Pivoted Steel Ejector Lever rising at front-left into bolt head groove!
  const ejectorArm = paintGeometry(
    new THREE.BoxGeometry(2.75, 0.24, 0.11).translate(1.85, 0.68, -0.18),
    HK_DARK_STEEL
  );
  const ejectorTip = paintGeometry(
    new THREE.BoxGeometry(0.55, 0.42, 0.11).translate(3.15, 0.88, -0.18),
    HK_DARK_STEEL
  );

  // Internal roller-tipped sear & disconnector plates + cross axles
  const searPlate = paintGeometry(
    new THREE.BoxGeometry(1.35, 0.34, 0.44).translate(-0.15, 0.22, 0),
    HK_DARK_STEEL
  );
  const axle1 = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 1.06, 12)
      .rotateX(Math.PI / 2)
      .translate(1.0, 0.20, 0),
    HK_DARK_STEEL
  );
  const axle2 = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 1.06, 12)
      .rotateX(Math.PI / 2)
      .translate(0.1, -0.25, 0),
    HK_DARK_STEEL
  );

  return mergeParts([
    chassis,
    ejectorArm,
    ejectorTip,
    searPlate,
    axle1,
    axle2,
  ]);
}

/**
 * FC-03: Rotary Steel Hammer & Captive Hammer Spring Strut (assembledPos: [-0.85, -0.05, 0])
 * Pivot at local (0, 0, 0): upright hammer head rises to +Y so rz < 0 swings FORWARD (+X) into firing pin!
 */
export function buildMp5HammerGeometry(): THREE.BufferGeometry {
  const pivotHub = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.68, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    HK_BRIGHT_STEEL
  );

  const hShape = new THREE.Shape();
  hShape.moveTo(-0.20, -0.05);
  hShape.lineTo(0.20, -0.12);
  hShape.lineTo(0.26, 0.55);
  hShape.lineTo(0.14, 1.08); // Front striking face aligned with firing pin at Y_world = 1.00!
  hShape.lineTo(-0.32, 1.00);
  hShape.lineTo(-0.42, 0.45); // Sear & disconnector notch
  hShape.closePath();

  const hammerHead = new THREE.ExtrudeGeometry(hShape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  hammerHead.translate(0, 0, -0.18);
  hammerHead.rotateZ(0.46); // Cocked rearward at rest!
  paintGeometry(hammerHead, HK_CHROME_STEEL);

  // Rear HK hammer strut rod + captive coil mainspring
  const strutRod = paintGeometry(
    new THREE.CylinderGeometry(0.05, 0.05, 1.45, 10)
      .rotateZ(Math.PI / 2 - 0.28)
      .translate(-0.78, -0.22, 0),
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
      coils: 9,
    })
      .rotateZ(-0.28)
      .translate(0, -0.22, 0),
    HK_SPRING_STEEL
  );

  return mergeParts([pivotHub, hammerHead, strutRod, strutSpring]);
}

/**
 * FC-04: Curved Steel MP5 Trigger Shoe (assembledPos: [-1.75, -0.95, 0])
 * Pivot at local (0, 0, 0): finger bow hangs DOWNWARD (-Y) so rz < 0 pulls shoe BACKWARD (-X)!
 */
export function buildMp5TriggerGeometry(): THREE.BufferGeometry {
  const pinHub = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 0.52, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    HK_DARK_STEEL
  );

  const bow = new THREE.Shape();
  bow.moveTo(-0.16, 0.08);
  bow.lineTo(0.20, 0.08);
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

  return mergeParts([pinHub, shoe]);
}

/**
 * FC-05: Ambidextrous Navy Pictogram Fire Selector Lever (assembledPos: [-3.15, -0.55, 0])
 * Centered directly on the selector pivot of mp5_grip_housing, pointing forward (+X) at Red Semi bullet icon!
 */
export function buildMp5SelectorGeometry(): THREE.BufferGeometry {
  const drumAxle = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 1.56, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    HK_DARK_STEEL
  );
  const safetyCam = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.36, 0.64).translate(0.15, 0.08, 0),
    HK_BRIGHT_STEEL
  );

  const levers: THREE.BufferGeometry[] = [drumAxle, safetyCam];
  for (const side of [-1, 1]) {
    const zPos = side * 0.77;
    // Circular pivot boss
    levers.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.28, 0.28, 0.10, 20)
          .rotateX(Math.PI / 2)
          .translate(0, 0, zPos),
        HK_POLYMER_ACCENT
      )
    );
    // Forward-pointing ergonomic HK Navy thumb lever with white pointer line
    const leverLen = side < 0 ? 1.15 : 0.98;
    levers.push(
      paintGeometry(
        new THREE.BoxGeometry(leverLen, 0.24, 0.12).translate(
          leverLen * 0.42,
          0,
          zPos + side * 0.05
        ),
        HK_POLYMER_ACCENT
      )
    );
    levers.push(
      paintGeometry(
        new THREE.BoxGeometry(0.26, 0.34, 0.18).translate(
          leverLen * 0.85,
          0,
          zPos + side * 0.08
        ),
        HK_POLYMER_ACCENT
      )
    );
    // White indicator tick pointing directly at the Navy bullet pictogram!
    levers.push(
      paintGeometry(
        new THREE.BoxGeometry(0.28, 0.05, 0.03).translate(
          leverLen * 0.72,
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
// Exact circular-arc math in local mag coords (mp5_mag_body assembledPos: [2.90, -0.45, 0]):
//   ARC_CX = 16.0, ARC_CY = 0.45, R_IN = 15.08, R_OUT = 16.92, R_MID = 16.00
//   angStart = -0.05 rad (feed lips inside receiver), angEnd = +0.54 rad (bottom face)
//   At angEnd = +0.54 rad:
//     local midpoint = (16.0 - 16.0*cos(0.54), 0.45 - 16.0*sin(0.54)) = (+2.2767, -7.7762)
//     world midpoint = [2.90 + 2.2767, -0.45 - 7.7762, 0] = [5.18, -8.23, 0], tilt = +0.54 rad!
const MAG_CX = 16.0;
const MAG_CY = 0.45;
const MAG_R_IN = 15.08;
const MAG_R_OUT = 16.92;
const MAG_ANG_START = -0.05;
const MAG_ANG_END = 0.54;

/**
 * M-01: Curved 30-Round 9×19mm Stamped Steel Magazine Body (assembledPos: [2.90, -0.45, 0], isShell: true)
 */
export function buildMp5MagBodyGeometry(): THREE.BufferGeometry {
  const curveProfile = new THREE.Shape();
  const steps = 24;

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

  // Hollow top feed throat + stamped longitudinal strengthening ribs along both flanks!
  const throatHollow = paintGeometry(
    new THREE.BoxGeometry(1.52, 1.45, 0.72).translate(0, 0.75, 0),
    HK_INNER_DARK
  );

  // Subtract subtle stamped longitudinal side flutes along curved flanks
  const ribCutters: THREE.BufferGeometry[] = [throatHollow];
  for (let s = 1; s <= 6; s++) {
    const ang = 0.08 + s * 0.068;
    const rx = MAG_CX - Math.cos(ang) * 16.0;
    const ry = MAG_CY - Math.sin(ang) * 16.0;
    for (const side of [-1, 1]) {
      ribCutters.push(
        paintGeometry(
          new THREE.BoxGeometry(0.95, 0.55, 0.06)
            .rotateZ(ang)
            .translate(rx, ry, side * 0.49),
          HK_INNER_DARK
        )
      );
    }
  }
  const sculptedMag = csgSubtract(rawMag, ribCutters);

  // Crisp steel feed lips + magwell stop collar rib + rear locking catch lug!
  const feedLips = paintGeometry(
    new THREE.BoxGeometry(1.68, 0.24, 0.84).translate(0.02, 1.22, 0),
    HK_BRIGHT_STEEL
  );
  const stopCollar = paintGeometry(
    new THREE.BoxGeometry(1.94, 0.16, 1.02)
      .rotateZ(0.08)
      .translate(0.12, -1.28, 0),
    HK_DARK_STEEL
  );

  return mergeParts([sculptedMag, feedLips, stopCollar]);
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
    new THREE.BoxGeometry(0.18, 0.78, 0.64)
      .rotateZ(0.08)
      .translate(0.66, -0.26, 0),
    HK_FOLLOWER_ORANGE
  );
  const skirtR = paintGeometry(
    new THREE.BoxGeometry(0.18, 0.78, 0.64)
      .rotateZ(0.08)
      .translate(-0.66, -0.26, 0),
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
    const ang = 0.02 + u * 0.49;
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
  return paintGeometry(tube, HK_SPRING_STEEL);
}

/**
 * M-04: Flush Stamped Steel Magazine Floorplate & Lock Plate (assembledPos: [5.18, -8.23, 0])
 * Rotated +0.54 rad around Z so local top face (y=0) mates with 0.000 gap onto mp5_mag_body bottom!
 */
export function buildMp5MagFloorplateGeometry(): THREE.BufferGeometry {
  // Base plate with folded slide-on side lips wrapping cleanly onto bottom rim of mag body
  const basePlate = paintGeometry(
    new THREE.BoxGeometry(1.98, 0.20, 1.04)
      .translate(0, -0.06, 0)
      .rotateZ(MAG_ANG_END),
    HK_DARK_STEEL
  );
  const lipRailL = paintGeometry(
    new THREE.BoxGeometry(1.92, 0.12, 0.10)
      .translate(0, 0.06, -0.47)
      .rotateZ(MAG_ANG_END),
    HK_DARK_STEEL
  );
  const lipRailR = paintGeometry(
    new THREE.BoxGeometry(1.92, 0.12, 0.10)
      .translate(0, 0.06, 0.47)
      .rotateZ(MAG_ANG_END),
    HK_DARK_STEEL
  );
  const lockButton = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 0.22, 16)
      .translate(0, -0.08, 0)
      .rotateZ(MAG_ANG_END),
    HK_BRIGHT_STEEL
  );
  return mergeParts([basePlate, lipRailL, lipRailR, lockButton]);
}
