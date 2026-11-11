import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from '../springHelper';
import {
  buildMp5BoltCarrierGeometry,
  buildMp5BoltHeadGeometry,
  buildMp5ChargingHandleGeometry,
  buildMp5FiringPinGeometry,
  buildMp5GripHousingGeometry,
  buildMp5HammerGeometry,
  buildMp5LockingPieceGeometry,
  buildMp5LockingRollerLeftGeometry,
  buildMp5LockingRollerRightGeometry,
  buildMp5MagBodyGeometry,
  buildMp5MagFloorplateGeometry,
  buildMp5MagFollowerGeometry,
  buildMp5MagSpringGeometry,
  buildMp5RecoilRodGeometry,
  buildMp5RecoilSpringGeometry,
  buildMp5SelectorGeometry,
  buildMp5TriggerGeometry,
  buildMp5TriggerPackGeometry,
} from './mp5ExtraGeometries';

const HK_DARK_STEEL = '#212630';
const HK_INNER_DARK = '#12161d';
const HK_BRIGHT_STEEL = '#d5dde7';
const HK_CHROME_STEEL = '#e2e8f0';
const HK_POLYMER = '#1b1f27';
const HK_POLYMER_ACCENT = '#14171e';
const HK_RUBBER = '#14161b';
const HK_BUFFER_AMBER = '#b45309';

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

function triInfo(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  col: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
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
  const cr = col ? (col.getX(i0) + col.getX(i1) + col.getX(i2)) / 3 : 0.15;
  return { cz, cr, fnz: fNorm.z };
}

/**
 * Unwraps R-01 Stamped Fluted Upper Receiver onto 2048x1024 mp5_receiver_{albedo,normal,roughness}.png:
 *  - Right wall (u in [0.03, 0.97], v in [0.53, 0.97]): HECKLER & KOCH GMBH, stock channel wear & magwell flutes
 *  - Left wall  (u in [0.03, 0.97], v in [0.07, 0.51]): Red [HK] MP5 Kal. 9mm×19, Ulm proof marks & magwell flutes
 *  - Bright steel accents: u in [0.80, 0.98], v in [0.01, 0.05]
 */
export function applyMp5UpperReceiverUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'bright' | 'right' | 'left' | 'inner' = 'inner';
    if (cr > 0.42) {
      mode = 'bright';
    } else if (fnz > 0.35 && cz > 0.25) {
      mode = 'right';
    } else if (fnz < -0.35 && cz < -0.25) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -5.5) / 11.0);
      const yNorm = clamp01((y - -1.8) / 4.45);

      let u: number;
      let v: number;
      if (mode === 'bright') {
        u = 0.8 + fractPos((x + z) * 0.2) * 0.18;
        v = 0.01 + fractPos(y * 0.25) * 0.04;
      } else if (mode === 'right') {
        u = 0.03 + xNorm * 0.94;
        v = 0.53 + yNorm * 0.44;
      } else if (mode === 'left') {
        u = 0.03 + (1.0 - xNorm) * 0.94;
        v = 0.07 + yNorm * 0.44;
      } else {
        u = 0.03 + xNorm * 0.7;
        v = 0.01 + clamp01((z + 0.85) / 1.7) * 0.04;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 2. STAMPED FLUTED RECEIVER, 3-LUG NAVY BARREL & A3 STOCK ('frame' · 8 parts)
// ============================================================================

/**
 * R-01: Stamped Fluted Sheet-Steel Upper Receiver w/ Integral Magwell, Claw Mounts & Paddle Release
 * (assembledPos: [0, 0, 0], isShell: true)
 * Spans X in [-5.45, +5.45], bore axis Y = 1.00, upper recoil spine Y = 2.08.
 */
export function buildMp5UpperReceiverGeometry(): THREE.BufferGeometry {
  // Iconic HK MP5 stamped figure-8 cross section extruded along X in [-5.45, +5.45]
  const fig8 = new THREE.Shape();
  fig8.moveTo(-0.75, 0.14);
  fig8.lineTo(-0.78, 0.98);
  fig8.quadraticCurveTo(-0.78, 1.56, -0.56, 1.82);
  fig8.lineTo(-0.54, 2.18);
  fig8.quadraticCurveTo(-0.50, 2.60, 0, 2.63);
  fig8.quadraticCurveTo(0.50, 2.60, 0.54, 2.18);
  fig8.lineTo(0.56, 1.82);
  fig8.quadraticCurveTo(0.78, 1.56, 0.78, 0.98);
  fig8.lineTo(0.75, 0.14);
  fig8.closePath();

  const receiverRaw = new THREE.ExtrudeGeometry(fig8, {
    depth: 10.9,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  receiverRaw.rotateY(Math.PI / 2);
  receiverRaw.translate(-5.45, 0, 0);
  paintGeometry(receiverRaw, HK_DARK_STEEL);

  // Integral stamped vertical/slightly-angled Fluted Magazine Well (X in [1.58, 4.22], Y in [-1.76, +0.48])
  const magwellOuter = paintGeometry(
    new THREE.BoxGeometry(2.64, 2.24, 1.42).translate(2.90, -0.64, 0),
    HK_DARK_STEEL
  );
  const magwellLip = paintGeometry(
    new THREE.BoxGeometry(2.78, 0.18, 1.50).translate(2.90, -1.70, 0),
    HK_DARK_STEEL
  );
  const hullUnion = csgUnion([receiverRaw, magwellOuter, magwellLip]);

  // Cutters: hollow bolt/carrier tunnels, right ejection port, magwell throat, lower FCG opening, and MP5A3 stock-rail flutes!
  const lowerTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.62, 11.4, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 1.0, 0),
    HK_INNER_DARK
  );
  const upperTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.41, 0.41, 11.4, 20)
      .rotateZ(Math.PI / 2)
      .translate(0, 2.08, 0),
    HK_INNER_DARK
  );
  const webSlot = paintGeometry(
    new THREE.BoxGeometry(10.6, 1.15, 0.76).translate(-0.1, 1.54, 0),
    HK_INNER_DARK
  );
  const fcgBottomSlot = paintGeometry(
    new THREE.BoxGeometry(6.8, 0.72, 1.16).translate(-1.95, 0.25, 0),
    HK_INNER_DARK
  );
  const ejectionPort = paintGeometry(
    new THREE.BoxGeometry(2.42, 0.88, 0.85).translate(2.65, 1.06, 0.56),
    HK_INNER_DARK
  );
  const magwellCavity = paintGeometry(
    new THREE.BoxGeometry(2.14, 2.65, 1.08).translate(2.90, -0.62, 0),
    HK_INNER_DARK
  );

  // Stamped longitudinal MP5A3 retractable stock guide channels along Z = ±0.78, Y = 1.00!
  const stockFluteL = paintGeometry(
    new THREE.BoxGeometry(7.2, 0.30, 0.18).translate(-1.90, 1.0, -0.80),
    HK_DARK_STEEL
  );
  const stockFluteR = paintGeometry(
    new THREE.BoxGeometry(7.2, 0.30, 0.18).translate(-1.90, 1.0, 0.80),
    HK_DARK_STEEL
  );

  // 3 vertical stamped strengthening flutes on each side of the magazine well!
  const magFlutes: THREE.BufferGeometry[] = [];
  for (const fx of [2.32, 2.90, 3.48]) {
    for (const side of [-1, 1]) {
      magFlutes.push(
        paintGeometry(
          new THREE.BoxGeometry(0.20, 1.32, 0.12).translate(
            fx,
            -0.88,
            side * 0.72
          ),
          HK_DARK_STEEL
        )
      );
    }
  }

  const shell = csgSubtract(hullUnion, [
    lowerTunnel,
    upperTunnel,
    webSlot,
    fcgBottomSlot,
    ejectionPort,
    magwellCavity,
    stockFluteL,
    stockFluteR,
    ...magFlutes,
  ]);

  // Iconic HK 4-point Optic Claw-Mount Bosses along receiver spine + Paddle Mag Catch + Front Forearm Lug!
  const details: THREE.BufferGeometry[] = [shell];
  for (const cx of [-2.85, -1.85, -0.15, 0.85]) {
    details.push(
      paintGeometry(
        new THREE.BoxGeometry(0.46, 0.14, 0.92).translate(cx, 2.52, 0),
        HK_DARK_STEEL
      )
    );
  }

  // HK Paddle Magazine Release at rear bottom of magwell + right push-button
  details.push(
    paintGeometry(
      new THREE.BoxGeometry(0.24, 0.56, 0.58)
        .rotateZ(0.22)
        .translate(1.52, -1.82, 0),
      HK_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 0.24, 16)
        .rotateX(Math.PI / 2)
        .translate(1.66, -1.32, 0.72),
      HK_BRIGHT_STEEL
    ),
    // Front lower forearm retention tab & rear takedown pin eyelet
    paintGeometry(
      new THREE.BoxGeometry(0.55, 0.42, 0.88).translate(5.18, 0.18, 0),
      HK_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.58, 0.48, 0.96).translate(-5.18, 0.08, 0),
      HK_DARK_STEEL
    )
  );

  return applyMp5UpperReceiverUVs(mergeParts(details));
}

/**
 * R-02: Forward Cocking Tube w/ Left Charging Slot & Upward HK-Slap Locking Notch
 * (assembledPos: [10.35, 2.08, 0]) -> Spans world X in [5.40, 15.60] seamlessly!
 */
export function buildMp5CockingTubeGeometry(): THREE.BufferGeometry {
  const outerTube = paintGeometry(
    new THREE.CylinderGeometry(0.50, 0.50, 9.95, 26)
      .rotateZ(Math.PI / 2)
      .translate(0.025, 0, 0),
    HK_DARK_STEEL
  );
  const rearWeldCollar = paintGeometry(
    new THREE.CylinderGeometry(0.55, 0.55, 0.65, 26)
      .rotateZ(Math.PI / 2)
      .translate(-4.65, 0, 0),
    HK_DARK_STEEL
  );
  const solid = csgUnion([outerTube, rearWeldCollar]);

  // Hollow interior + Left-side longitudinal charging slot + Upward rear HK-Slap notch!
  const innerBore = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.38, 10.4, 22)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    HK_INNER_DARK
  );
  const longSlot = paintGeometry(
    new THREE.BoxGeometry(4.35, 0.26, 0.55).translate(0.75, 0.04, -0.38),
    HK_INNER_DARK
  );
  const hkSlapNotch = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.42, 0.55)
      .rotateZ(0.24)
      .translate(-1.22, 0.24, -0.38),
    HK_INNER_DARK
  );

  const tubeCarved = csgSubtract(solid, [innerBore, longSlot, hkSlapNotch]);

  // Knurled front cocking-tube end plug / bayonet adapter protruding slightly forward of sight tower!
  const frontPlug = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.48, 0.65, 22)
      .rotateZ(Math.PI / 2)
      .translate(5.15, 0, 0),
    HK_BRIGHT_STEEL
  );

  return mergeParts([tubeCarved, frontPlug]);
}

/**
 * R-03: 8.85" (225mm) CHF Navy 3-Lug & Threaded Barrel + Pressed Fluted Chamber Trunnion
 * (assembledPos: [0, 1.00, 0]) -> Spans X in [1.85, 19.50], muzzle crown at X = +19.50!
 */
export function buildMp5BarrelGeometry(): THREE.BufferGeometry {
  // 1. Forged Roller-Locking Trunnion Block (X in [1.85, 4.85])
  const trunnionOuter = paintGeometry(
    new THREE.BoxGeometry(3.0, 1.18, 1.18).translate(3.35, 0, 0),
    HK_DARK_STEEL
  );
  const trunnionBore = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.48, 3.3, 24)
      .rotateZ(Math.PI / 2)
      .translate(3.35, 0, 0),
    HK_INNER_DARK
  );
  // Twin semi-cylindrical Roller Locking Recesses at X = 2.15, Z = ±0.40 where rollers lock in battery!
  const rollerRecessR = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.72, 20).translate(2.15, 0, 0.40),
    HK_INNER_DARK
  );
  const rollerRecessL = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.72, 20).translate(2.15, 0, -0.40),
    HK_INNER_DARK
  );
  const rearBoltEntry = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.88, 0.88).translate(2.22, 0, 0),
    HK_INNER_DARK
  );
  const trunnion = csgSubtract(trunnionOuter, [
    trunnionBore,
    rollerRecessR,
    rollerRecessL,
    rearBoltEntry,
  ]);

  // 2. 8.85" Cold-Hammer-Forged Navy Barrel Lathe Profile (X in [2.65, 19.50])
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.22, 2.65),
    new THREE.Vector2(0.49, 2.65), // Breech face at X = 2.65
    new THREE.Vector2(0.49, 5.40), // Heavy chamber section
    new THREE.Vector2(0.41, 5.85), // Taper under Tropical forearm
    new THREE.Vector2(0.40, 14.70),
    new THREE.Vector2(0.45, 14.80), // Front sight tower journal (X in [14.8, 16.05])
    new THREE.Vector2(0.45, 16.08),
    new THREE.Vector2(0.39, 16.15), // Neck before 3-lug mount
    new THREE.Vector2(0.39, 17.20),
    new THREE.Vector2(0.42, 17.25), // 3-lug hub journal (X in [17.25, 18.20])
    new THREE.Vector2(0.42, 18.22),
    new THREE.Vector2(0.44, 18.26), // Knurled Navy 1/2x28 thread protector collar!
    new THREE.Vector2(0.44, 19.44),
    new THREE.Vector2(0.38, 19.50), // Crowned muzzle tip at X = +19.50!
    new THREE.Vector2(0.20, 19.50),
  ];
  const barrelOuter = new THREE.LatheGeometry(pts, 28);
  barrelOuter.rotateZ(-Math.PI / 2);
  paintGeometry(barrelOuter, '#29313d');

  // Hollow 9mm bore & fluted chamber cavity
  const boreHole = paintGeometry(
    new THREE.CylinderGeometry(0.19, 0.19, 17.2, 20)
      .rotateZ(Math.PI / 2)
      .translate(11.1, 0, 0),
    HK_INNER_DARK
  );
  const chamberCavity = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.28, 2.1, 20)
      .rotateZ(Math.PI / 2)
      .translate(3.65, 0, 0),
    HK_INNER_DARK
  );
  const barrelCarved = csgSubtract(barrelOuter, [boreHole, chamberCavity]);

  // 3. Iconic HK Navy 3-Lug Quick-Detach Suppressor Mount Lugs (120° apart at X = 17.65)!
  const threeLugs: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const ang = (k * Math.PI * 2) / 3 + Math.PI / 6;
    const lug = paintGeometry(
      new THREE.BoxGeometry(0.52, 0.18, 0.22)
        .translate(17.65, 0.45, 0)
        .rotateX(ang),
      HK_BRIGHT_STEEL
    );
    threeLugs.push(lug);
  }

  // Polished feed ramp & heavy barrel cross-pin inside trunnion
  const feedRamp = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.22, 0.48)
      .rotateZ(0.42)
      .translate(2.58, -0.34, 0),
    HK_CHROME_STEEL
  );
  const trunnionPin = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 1.24, 14)
      .rotateX(Math.PI / 2)
      .translate(4.15, -0.32, 0),
    HK_BRIGHT_STEEL
  );

  return mergeParts([
    trunnion,
    barrelCarved,
    ...threeLugs,
    feedRamp,
    trunnionPin,
  ]);
}

/**
 * R-04: Iconic HK MP5 "Triple Frame" Hooded Circular Ring Front Sight Tower
 * (assembledPos: [15.40, 1.00, 0])
 * Lower barrel ring at Y=0, middle cocking-tube ring at Y=+1.08, circular sight hood at Y=+1.98 (world 2.98)!
 */
export function buildMp5FrontSightGeometry(): THREE.BufferGeometry {
  const barrelRing = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 1.28, 26)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    HK_DARK_STEEL
  );
  // Slanted classic HK triangular front sight web sweeping slightly forward from barrel up to hood!
  const webShape = new THREE.Shape();
  webShape.moveTo(-0.62, 0);
  webShape.lineTo(0.62, 0);
  webShape.lineTo(0.42, 1.88);
  webShape.lineTo(-0.46, 1.88);
  webShape.closePath();
  const verticalWeb = new THREE.ExtrudeGeometry(webShape, {
    depth: 0.56,
    bevelEnabled: false,
  });
  verticalWeb.translate(0, 0, -0.28);
  paintGeometry(verticalWeb, HK_DARK_STEEL);

  const cockingCollar = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.62, 1.18, 26)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 1.08, 0),
    HK_DARK_STEEL
  );
  // Full circular HK MP5 protective front sight ring!
  const hoodOuter = paintGeometry(
    new THREE.CylinderGeometry(0.55, 0.55, 0.88, 28)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 1.98, 0),
    HK_DARK_STEEL
  );
  // Lower forearm push-pin retaining lug
  const forearmLug = paintGeometry(
    new THREE.BoxGeometry(0.86, 0.52, 0.58).translate(-0.32, -0.62, 0),
    HK_DARK_STEEL
  );

  const solid = csgUnion([
    barrelRing,
    verticalWeb,
    cockingCollar,
    hoodOuter,
    forearmLug,
  ]);

  // Subtract barrel bore, cocking-tube bore, and circular sight hood tunnel!
  const cutBarrel = paintGeometry(
    new THREE.CylinderGeometry(0.455, 0.455, 1.6, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    HK_INNER_DARK
  );
  const cutCocking = paintGeometry(
    new THREE.CylinderGeometry(0.505, 0.505, 1.5, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 1.08, 0),
    HK_INNER_DARK
  );
  const cutHood = paintGeometry(
    new THREE.CylinderGeometry(0.43, 0.43, 1.2, 26)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 1.98, 0),
    HK_INNER_DARK
  );

  const tower = csgSubtract(solid, [cutBarrel, cutCocking, cutHood]);

  // Crisp vertical front sight post centered inside the circular ring + left steel sling loop + cross pins!
  const sightPost = paintGeometry(
    new THREE.BoxGeometry(0.11, 0.44, 0.09).translate(-0.02, 1.78, 0),
    HK_BRIGHT_STEEL
  );
  const slingEyelet = paintGeometry(
    new THREE.TorusGeometry(0.22, 0.05, 10, 20)
      .rotateY(Math.PI / 2)
      .translate(0.12, 0.54, -0.52),
    HK_BRIGHT_STEEL
  );
  const pinCross = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.72, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.32, -0.66, 0),
    HK_BRIGHT_STEEL
  );

  return mergeParts([tower, sightPost, slingEyelet, pinCross]);
}

/**
 * R-05: Authentic HK Tilted Rotary 4-Aperture Diopter Drum Rear Sight
 * (assembledPos: [-4.25, 2.62, 0]) -> Welded pedestal flush on receiver top, drum tilted +0.28 rad!
 */
export function buildMp5RearSightGeometry(): THREE.BufferGeometry {
  // Welded rectangular sight base w/ protective side ears sitting flush on receiver roof (Y_local in [-0.10, +0.20])
  const baseBlock = paintGeometry(
    new THREE.BoxGeometry(1.42, 0.30, 1.02).translate(0, 0.04, 0),
    HK_DARK_STEEL
  );
  const windageClamp = paintGeometry(
    new THREE.BoxGeometry(1.06, 0.20, 0.86).translate(-0.04, 0.22, 0),
    HK_DARK_STEEL
  );

  // Tilted cylindrical rotary diopter drum (axis tilted backward by +0.28 rad around Z!)
  const drumOuter = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.50, 0.56, 28),
    HK_DARK_STEEL
  );
  const drumHollow = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 0.50, 24).translate(0, 0.06, 0),
    HK_INNER_DARK
  );
  // 4 graduated diopter peep apertures drilled at 90° intervals around drum circumference!
  const holeX = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 1.25, 14).rotateZ(Math.PI / 2),
    HK_INNER_DARK
  );
  const holeZ = paintGeometry(
    new THREE.CylinderGeometry(0.065, 0.065, 1.25, 14).rotateX(Math.PI / 2),
    HK_INNER_DARK
  );

  const drumCarved = csgSubtract(drumOuter, [drumHollow, holeX, holeZ]);
  drumCarved.rotateZ(0.28);
  drumCarved.translate(0.04, 0.44, 0);

  const centerDetentScrew = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 0.58, 16)
      .rotateZ(0.28)
      .translate(0.04, 0.44, 0),
    HK_BRIGHT_STEEL
  );

  return mergeParts([baseBlock, windageClamp, drumCarved, centerDetentScrew]);
}

/**
 * R-06: Wide "Tropical" MP5 Polymer Forearm w/ Captive Push-Pin
 * (assembledPos: [10.25, 0.72, 0], isShell: true)
 * Spans X_local in [-5.05, +4.95] => world X in [5.20, 15.20] (flush from upper receiver to front sight tower!)
 */
export function buildMp5ForearmGeometry(): THREE.BufferGeometry {
  // Authentic wide pear/triangular HK Tropical handguard cross-section in (Z, Y)
  const prof = new THREE.Shape();
  prof.moveTo(-0.62, -0.92);
  prof.quadraticCurveTo(0, -1.04, 0.62, -0.92);
  prof.quadraticCurveTo(1.10, -0.58, 1.04, 0.08);
  prof.lineTo(0.76, 0.88);
  prof.lineTo(-0.76, 0.88);
  prof.lineTo(-1.04, 0.08);
  prof.quadraticCurveTo(-1.10, -0.58, -0.62, -0.92);
  prof.closePath();

  const rawForearm = new THREE.ExtrudeGeometry(prof, {
    depth: 9.95,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  rawForearm.rotateY(Math.PI / 2);
  rawForearm.translate(-5.0, 0, 0);
  paintGeometry(rawForearm, HK_POLYMER);

  // Hollow U-channel interior so CHF barrel runs freely + subtle angled ergonomic grip grooves!
  const barrelChannel = paintGeometry(
    new THREE.BoxGeometry(10.3, 1.56, 1.28).translate(0, 0.32, 0),
    HK_POLYMER_ACCENT
  );
  // Slight front bottom taper rising smoothly toward the front sight pin lug
  const frontTaper = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.65, 2.5)
      .rotateZ(0.14)
      .translate(4.1, -1.06, 0),
    HK_POLYMER_ACCENT
  );

  const cutters: THREE.BufferGeometry[] = [barrelChannel, frontTaper];
  for (let g = -3; g <= 3; g++) {
    const gx = g * 1.05;
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.18, 0.95, 2.35)
          .rotateZ(0.18)
          .translate(gx, -0.18, 0),
        HK_POLYMER_ACCENT
      )
    );
  }

  const body = csgSubtract(rawForearm, cutters);

  // Internal aluminum heatshield liner + front captive steel HK push-pin!
  const shieldL = paintGeometry(
    new THREE.BoxGeometry(8.2, 0.68, 0.04).translate(-0.2, 0.12, -0.68),
    '#94a3b8'
  );
  const shieldR = paintGeometry(
    new THREE.BoxGeometry(8.2, 0.68, 0.04).translate(-0.2, 0.12, 0.68),
    '#94a3b8'
  );
  const frontPushPin = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 1.52, 16)
      .rotateX(Math.PI / 2)
      .translate(4.48, -0.38, 0),
    HK_DARK_STEEL
  );

  return mergeParts([body, shieldL, shieldR, frontPushPin]);
}

/**
 * R-07: MP5A3 Steel Receiver End Cap w/ Internal H-Buffer, Rail Guides, Rotary Stock Latch & Takedown Pin
 * (assembledPos: [-5.95, 1.05, 0]) -> Spans world X in [-6.70, -5.20], sleeves flush onto upper receiver!
 */
export function buildMp5StockEndcapGeometry(): THREE.BufferGeometry {
  // Main stamped steel cap body matching upper receiver figure-8 height
  const capBody = paintGeometry(
    new THREE.BoxGeometry(1.42, 2.38, 1.54).translate(0.04, 0.12, 0),
    HK_DARK_STEEL
  );
  const frontHollow = paintGeometry(
    new THREE.BoxGeometry(0.75, 2.08, 1.32).translate(0.45, 0.14, 0),
    HK_INNER_DARK
  );
  const capShell = csgSubtract(capBody, [frontHollow]);

  // Left & right cylindrical guide bosses for the twin MP5A3 retractable stock rails (Z = ±0.82, Y_world = 1.00)
  const guideL = paintGeometry(
    new THREE.BoxGeometry(1.48, 0.44, 0.28).translate(0.02, -0.05, -0.82),
    HK_DARK_STEEL
  );
  const guideR = paintGeometry(
    new THREE.BoxGeometry(1.48, 0.44, 0.28).translate(0.02, -0.05, 0.82),
    HK_DARK_STEEL
  );

  // Amber polyurethane recoil H-Buffer pad mounted inside end cap + rear sling loop + rotary release lever + takedown pin!
  const hBuffer = paintGeometry(
    new THREE.BoxGeometry(0.28, 1.65, 1.02).translate(0.22, 0.15, 0),
    HK_BUFFER_AMBER
  );
  const stockReleaseLever = paintGeometry(
    new THREE.BoxGeometry(0.76, 0.46, 0.56)
      .rotateZ(-0.22)
      .translate(-0.28, -1.16, 0),
    HK_DARK_STEEL
  );
  const rearTakedownPin = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 1.68, 16)
      .rotateX(Math.PI / 2)
      .translate(0.50, -0.96, 0),
    HK_DARK_STEEL
  );
  const slingRing = paintGeometry(
    new THREE.TorusGeometry(0.20, 0.045, 10, 18)
      .rotateY(Math.PI / 2)
      .translate(-0.55, 0.35, -0.82),
    HK_BRIGHT_STEEL
  );

  return mergeParts([
    capShell,
    guideL,
    guideR,
    hBuffer,
    stockReleaseLever,
    rearTakedownPin,
    slingRing,
  ]);
}

/**
 * R-08: Iconic MP5A3 Twin-Rail Retractable Steel Buttstock & Concave Rubber Buttpad
 * (assembledPos: [-14.45, 0.35, 0])
 * Rear buttpad at X_local = -1.05 (world X = -15.50); twin notched steel rails run forward to X_local = +11.60
 * (world X = -2.85) directly inside the upper receiver's side flutes!
 */
export function buildMp5ButtstockGeometry(): THREE.BufferGeometry {
  // Cast aluminum/steel A3 fork yoke + deeply curved/concave MP5A3 rubber buttpad!
  const padShape = new THREE.Shape();
  padShape.moveTo(0.78, 1.18);
  padShape.lineTo(-0.82, 1.18);
  // Concave shoulder pocket curve on rear face (-X)
  padShape.quadraticCurveTo(-0.46, -0.65, -1.05, -2.95);
  padShape.lineTo(-0.35, -3.05);
  padShape.quadraticCurveTo(0.22, -1.35, 0.78, 0.32);
  padShape.closePath();

  const buttpadRaw = new THREE.ExtrudeGeometry(padShape, {
    depth: 1.24,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  buttpadRaw.translate(0, 0, -0.62);
  paintGeometry(buttpadRaw, HK_RUBBER);

  // Cast metal fork yoke clamping the twin steel rails at Y_local = +0.65 (world Y = 1.00)
  const forkYoke = paintGeometry(
    new THREE.BoxGeometry(1.35, 0.92, 1.72).translate(0.55, 0.65, 0),
    HK_DARK_STEEL
  );

  // Twin stamped C-channel steel stock rails extending along Z = ±0.80, Y_local = +0.65, X_local in [+0.45, +11.60]!
  const rails: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const railBar = paintGeometry(
      new THREE.BoxGeometry(11.15, 0.28, 0.13).translate(
        6.025,
        0.65,
        side * 0.80
      ),
      HK_DARK_STEEL
    );
    // Longitudinal stamped lightening flute + 3 locking position notches along bottom of each rail!
    const railFlute = paintGeometry(
      new THREE.BoxGeometry(10.2, 0.11, 0.06).translate(
        6.1,
        0.65,
        side * 0.85
      ),
      HK_INNER_DARK
    );
    const notches: THREE.BufferGeometry[] = [railFlute];
    for (const nx of [3.2, 7.1, 10.8]) {
      notches.push(
        paintGeometry(
          new THREE.BoxGeometry(0.26, 0.12, 0.24).translate(
            nx,
            0.52,
            side * 0.80
          ),
          HK_INNER_DARK
        )
      );
    }
    rails.push(csgSubtract(railBar, notches));

    // Bright polished steel bearing strips along top/bottom of stock rails
    rails.push(
      paintGeometry(
        new THREE.BoxGeometry(11.1, 0.04, 0.135).translate(
          6.02,
          0.78,
          side * 0.80
        ),
        HK_BRIGHT_STEEL
      )
    );
  }

  return mergeParts([buttpadRaw, forkYoke, ...rails]);
}

export {
  buildMp5BoltCarrierGeometry,
  buildMp5BoltHeadGeometry,
  buildMp5ChargingHandleGeometry,
  buildMp5FiringPinGeometry,
  buildMp5GripHousingGeometry,
  buildMp5HammerGeometry,
  buildMp5LockingPieceGeometry,
  buildMp5LockingRollerLeftGeometry,
  buildMp5LockingRollerRightGeometry,
  buildMp5MagBodyGeometry,
  buildMp5MagFloorplateGeometry,
  buildMp5MagFollowerGeometry,
  buildMp5MagSpringGeometry,
  buildMp5RecoilRodGeometry,
  buildMp5RecoilSpringGeometry,
  buildMp5SelectorGeometry,
  buildMp5TriggerGeometry,
  buildMp5TriggerPackGeometry,
};

export const MP5_GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> =
  {
    // 1. Roller-Delayed Bolt & Charging Group ('slide' · 9 parts)
    mp5_charging_handle: buildMp5ChargingHandleGeometry,
    mp5_bolt_carrier: buildMp5BoltCarrierGeometry,
    mp5_bolt_head: buildMp5BoltHeadGeometry,
    mp5_locking_rollers: buildMp5LockingRollerRightGeometry,
    mp5_locking_roller_left: buildMp5LockingRollerLeftGeometry,
    mp5_locking_piece: buildMp5LockingPieceGeometry,
    mp5_firing_pin: buildMp5FiringPinGeometry,
    mp5_recoil_rod: buildMp5RecoilRodGeometry,
    mp5_recoil_spring: buildMp5RecoilSpringGeometry,

    // 2. Stamped Fluted Receiver, 3-Lug Navy Barrel & A3 Stock ('frame' · 8 parts)
    mp5_upper_receiver: buildMp5UpperReceiverGeometry,
    mp5_cocking_tube: buildMp5CockingTubeGeometry,
    mp5_barrel: buildMp5BarrelGeometry,
    mp5_front_sight: buildMp5FrontSightGeometry,
    mp5_rear_sight: buildMp5RearSightGeometry,
    mp5_forearm: buildMp5ForearmGeometry,
    mp5_stock_endcap: buildMp5StockEndcapGeometry,
    mp5_buttstock: buildMp5ButtstockGeometry,

    // 3. Navy Pictogram Grip Housing & Modular Trigger Pack ('fire_control' · 5 parts)
    mp5_grip_housing: buildMp5GripHousingGeometry,
    mp5_trigger_pack: buildMp5TriggerPackGeometry,
    mp5_hammer: buildMp5HammerGeometry,
    mp5_trigger: buildMp5TriggerGeometry,
    mp5_selector: buildMp5SelectorGeometry,

    // 4. Curved 30-Rd 9×19mm Stamped Steel Magazine ('magazine' · 4 parts)
    mp5_mag_body: buildMp5MagBodyGeometry,
    mp5_mag_follower: buildMp5MagFollowerGeometry,
    mp5_mag_spring: buildMp5MagSpringGeometry,
    mp5_mag_floorplate: buildMp5MagFloorplateGeometry,
  };
