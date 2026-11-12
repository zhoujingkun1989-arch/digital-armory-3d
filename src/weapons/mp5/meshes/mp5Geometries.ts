import * as THREE from 'three';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
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

const HK_DARK_STEEL = '#454f5e';
const HK_STEEL_HIGHLIGHT = '#586476';
const HK_INNER_DARK = '#252b35';
const HK_BRIGHT_STEEL = '#d5dde7';
const HK_CHROME_STEEL = '#e2e8f0';
const HK_POLYMER = '#323842';
const HK_POLYMER_ACCENT = '#282d36';
const HK_RUBBER = '#22262e';
const HK_BUFFER_AMBER = '#b45309';

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
 * R-01: Stamped Fluted Sheet-Steel Upper Receiver w/ Integral Magwell, Claw Mounts,
 * Ejection Port Lip & Paddle Release (assembledPos: [0, 0, 0], isShell: true)
 * Spans X in [-5.45, +5.45], bore axis Y = 1.00, upper recoil spine Y = 2.08.
 */
export function buildMp5UpperReceiverGeometry(): THREE.BufferGeometry {
  // Iconic HK MP5 stamped figure-8 cross section extruded along X in [-5.45, +5.45]
  const fig8 = new THREE.Shape();
  fig8.moveTo(-0.75, 0.14);
  fig8.lineTo(-0.78, 0.98);
  fig8.quadraticCurveTo(-0.78, 1.56, -0.56, 1.82);
  fig8.lineTo(-0.54, 2.18);
  fig8.quadraticCurveTo(-0.5, 2.6, 0, 2.63);
  fig8.quadraticCurveTo(0.5, 2.6, 0.54, 2.18);
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

  // Integral stamped Magwell (X in [1.45, 4.10], Y in [-1.76, +0.48]) w/ flared funnel rim
  const magwellOuter = paintGeometry(
    new THREE.BoxGeometry(2.65, 2.24, 1.42).translate(2.775, -0.64, 0),
    HK_DARK_STEEL
  );
  const magwellLip = paintGeometry(
    new THREE.BoxGeometry(2.8, 0.18, 1.52).translate(2.775, -1.7, 0),
    HK_DARK_STEEL
  );
  const hullUnion = csgUnion([receiverRaw, magwellOuter, magwellLip]);

  // Cutters: hollow bolt/carrier tunnels, right ejection port, magwell throat, lower FCG opening,
  // twin MP5A3 stock-rail guide channels, and 6 PBR-aligned vertical magwell reinforcement flutes!
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
    new THREE.BoxGeometry(2.42, 0.88, 0.86).translate(2.65, 1.06, 0.56),
    HK_INNER_DARK
  );
  const magwellCavity = paintGeometry(
    new THREE.BoxGeometry(2.14, 2.68, 1.08).translate(2.775, -0.62, 0),
    HK_INNER_DARK
  );

  // Stamped longitudinal MP5A3 retractable stock guide channels along Z = ±0.80, Y = 1.00!
  const stockFluteL = paintGeometry(
    new THREE.BoxGeometry(7.2, 0.3, 0.18).translate(-1.9, 1.0, -0.8),
    HK_DARK_STEEL
  );
  const stockFluteR = paintGeometry(
    new THREE.BoxGeometry(7.2, 0.3, 0.18).translate(-1.9, 1.0, 0.8),
    HK_DARK_STEEL
  );

  // 3 vertical stamped reinforcement flutes on each side of magwell aligned 1:1 with mp5_receiver PBR (.685/.735/.785)!
  const magFlutes: THREE.BufferGeometry[] = [];
  for (const fx of [2.17, 2.75, 3.33]) {
    for (const side of [-1, 1]) {
      magFlutes.push(
        paintGeometry(
          new THREE.BoxGeometry(0.22, 1.38, 0.12).translate(
            fx,
            -0.82,
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

  const details: THREE.BufferGeometry[] = [shell];

  // Iconic HK 4-point STANAG Optic Claw-Mount Locking Bosses w/ undercut lateral clamping ledges & recoil stop!
  for (const cx of [-2.85, -1.85, -0.15, 0.85]) {
    const bossUpper = paintGeometry(
      new THREE.BoxGeometry(0.48, 0.12, 0.98).translate(cx, 2.55, 0),
      HK_STEEL_HIGHLIGHT
    );
    const bossNeck = paintGeometry(
      new THREE.BoxGeometry(0.44, 0.12, 0.78).translate(cx, 2.45, 0),
      HK_DARK_STEEL
    );
    details.push(bossUpper, bossNeck);
  }
  // Welded top optical recoil-stop cross-block on receiver spine
  details.push(
    paintGeometry(
      new THREE.BoxGeometry(0.24, 0.1, 0.44).translate(-1.0, 2.66, 0),
      HK_STEEL_HIGHLIGHT
    )
  );

  // Stamped Right Ejection-Port Rolled Lip & Rear Brass-Deflector Flare (at X = 1.44, matching PBR brass kisses!)
  details.push(
    paintGeometry(
      new THREE.BoxGeometry(2.54, 0.08, 0.1).translate(2.65, 1.51, 0.76),
      HK_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.54, 0.08, 0.1).translate(2.65, 0.61, 0.76),
      HK_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.18, 0.94, 0.14)
        .rotateY(-0.28)
        .translate(1.42, 1.06, 0.78),
      HK_DARK_STEEL
    )
  );

  // HK Ambidextrous Paddle Magazine Release + Hinge Bracket + Right Serrated Push-Button
  details.push(
    paintGeometry(
      new THREE.BoxGeometry(0.38, 0.34, 0.76).translate(1.36, -1.48, 0),
      HK_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.22, 0.62, 0.58)
        .rotateZ(0.24)
        .translate(1.38, -1.88, 0),
      HK_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.065, 0.065, 0.84, 12)
        .rotateX(Math.PI / 2)
        .translate(1.36, -1.52, 0),
      HK_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 0.24, 16)
        .rotateX(Math.PI / 2)
        .translate(1.58, -1.3, 0.72),
      HK_BRIGHT_STEEL
    ),
    // Front lower grip-housing shelf lug + front forearm tab + rear takedown pin tabs
    paintGeometry(
      new THREE.BoxGeometry(0.46, 0.38, 0.92).translate(1.38, -0.1, 0),
      HK_DARK_STEEL
    ),
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
 * R-02: Forward Cocking Tube w/ Connected Left J-Slot & Upward HK-Slap Locking Notch
 * (assembledPos: [10.35, 2.08, 0]) -> Spans world X in [5.40, 15.60] seamlessly!
 */
export function buildMp5CockingTubeGeometry(): THREE.BufferGeometry {
  const outerTube = paintGeometry(
    new THREE.CylinderGeometry(0.5, 0.5, 9.95, 26)
      .rotateZ(Math.PI / 2)
      .translate(0.025, 0, 0),
    HK_DARK_STEEL
  );
  const rearWeldCollar = paintGeometry(
    new THREE.CylinderGeometry(0.55, 0.55, 0.65, 26)
      .rotateZ(Math.PI / 2)
      .translate(-4.65, 0, 0),
    HK_STEEL_HIGHLIGHT
  );
  const solid = csgUnion([outerTube, rearWeldCollar]);

  // Hollow interior + Connected Left-Side HK J-Slot (longitudinal charging track + upward rear slap detent hook)!
  const innerBore = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.38, 10.4, 22)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    HK_INNER_DARK
  );
  const longSlot = paintGeometry(
    new THREE.BoxGeometry(4.45, 0.25, 0.58).translate(0.85, -0.01, -0.38),
    HK_INNER_DARK
  );
  const slapRiser = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.44, 0.58).translate(-1.18, 0.18, -0.38),
    HK_INNER_DARK
  );
  const slapDetentHook = paintGeometry(
    new THREE.BoxGeometry(0.58, 0.24, 0.58).translate(-0.98, 0.31, -0.38),
    HK_INNER_DARK
  );

  const tubeCarved = csgSubtract(solid, [
    innerBore,
    longSlot,
    slapRiser,
    slapDetentHook,
  ]);

  // Serrated front cocking-tube bayonet end-cap plug + spring detent pin
  const frontPlug = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.48, 0.65, 22)
      .rotateZ(Math.PI / 2)
      .translate(5.15, 0, 0),
    HK_BRIGHT_STEEL
  );
  const plugCrossSlot = paintGeometry(
    new THREE.BoxGeometry(0.14, 0.98, 0.12).translate(5.44, 0, 0),
    HK_INNER_DARK
  );
  const carvedPlug = csgSubtract(frontPlug, [plugCrossSlot]);

  return mergeParts([tubeCarved, carvedPlug]);
}

/**
 * R-03: 8.85" (225mm) CHF Navy 3-Lug & Knurled-Thread-Protector Barrel + 12-Flute Chamber Trunnion
 * (assembledPos: [0, 1.00, 0]) -> Spans X in [1.85, 19.52], recessed rifled muzzle crown at X = +19.52!
 */
export function buildMp5BarrelGeometry(): THREE.BufferGeometry {
  // 1. Forged Roller-Locking Trunnion Block (X in [1.85, 4.85]) w/ 45° roller locking shoulders
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
  // Twin roller locking recesses w/ 45° forward camming abutments at X = 2.15, Z = ±0.40!
  const rollerRecessR = paintGeometry(
    new THREE.CylinderGeometry(0.225, 0.225, 0.74, 20).translate(
      2.15,
      0,
      0.41
    ),
    HK_INNER_DARK
  );
  const rollerRecessL = paintGeometry(
    new THREE.CylinderGeometry(0.225, 0.225, 0.74, 20).translate(
      2.15,
      0,
      -0.41
    ),
    HK_INNER_DARK
  );
  const rearBoltEntry = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.88, 0.88).translate(2.2, 0, 0),
    HK_INNER_DARK
  );
  const trunnion = csgSubtract(trunnionOuter, [
    trunnionBore,
    rollerRecessR,
    rollerRecessL,
    rearBoltEntry,
  ]);

  // 2. 8.85" Cold-Hammer-Forged Navy Barrel Lathe Profile w/ Recessed Target Muzzle Crown!
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.22, 2.65),
    new THREE.Vector2(0.49, 2.65), // Breech face at X = 2.65
    new THREE.Vector2(0.49, 5.4), // Heavy chamber section
    new THREE.Vector2(0.41, 5.85), // Taper under Tropical forearm
    new THREE.Vector2(0.4, 14.7),
    new THREE.Vector2(0.45, 14.8), // Front sight tower journal (X in [14.8, 16.08])
    new THREE.Vector2(0.45, 16.08),
    new THREE.Vector2(0.39, 16.15), // Neck before 3-lug mount
    new THREE.Vector2(0.39, 17.2),
    new THREE.Vector2(0.425, 17.25), // 3-lug QD hub journal (X in [17.25, 18.20])
    new THREE.Vector2(0.425, 18.18),
    new THREE.Vector2(0.38, 18.22), // Thread relief / suppressor O-ring groove
    new THREE.Vector2(0.38, 18.28),
    new THREE.Vector2(0.445, 18.32), // Knurled Navy 1/2×28 thread protector collar!
    new THREE.Vector2(0.445, 19.44),
    new THREE.Vector2(0.39, 19.52), // Outer muzzle rim
    new THREE.Vector2(0.2, 19.41), // Recessed 11° target muzzle crown dish!
  ];
  const barrelOuter = new THREE.LatheGeometry(pts, 28);
  barrelOuter.rotateZ(-Math.PI / 2);
  paintGeometry(barrelOuter, HK_DARK_STEEL);

  // Hollow 9mm bore + chamber + right extractor cut + 12 HK Chamber Gas-Fluting Grooves!
  const barrelCutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.195, 0.195, 17.3, 20)
        .rotateZ(Math.PI / 2)
        .translate(11.1, 0, 0),
      HK_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.27, 0.28, 2.1, 20)
        .rotateZ(Math.PI / 2)
        .translate(3.65, 0, 0),
      HK_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.26, 0.24, 0.28).translate(2.72, 0.06, 0.36),
      HK_INNER_DARK
    ),
  ];

  // 12 longitudinal HK chamber flutes for gas-assisted case flotation
  for (let fIdx = 0; fIdx < 12; fIdx++) {
    const fAng = (fIdx * Math.PI * 2) / 12;
    barrelCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.55, 0.03, 0.03)
          .translate(3.75, 0.28, 0)
          .rotateX(fAng),
        HK_INNER_DARK
      )
    );
  }
  const barrelCarved = csgSubtract(barrelOuter, barrelCutters);

  const subParts: THREE.BufferGeometry[] = [trunnion, barrelCarved];

  // 3. Iconic HK Navy 3-Lug Quick-Detach Suppressor Mount Lugs (120° apart at X = 17.68) + Rear Stop Ring!
  subParts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.46, 0.46, 0.16, 24)
        .rotateZ(Math.PI / 2)
        .translate(17.32, 0, 0),
      HK_BRIGHT_STEEL
    )
  );
  for (let k = 0; k < 3; k++) {
    const ang = (k * Math.PI * 2) / 3 + Math.PI / 6;
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.56, 0.17, 0.23)
          .translate(17.72, 0.455, 0)
          .rotateX(ang),
        HK_BRIGHT_STEEL
      )
    );
  }

  // 4. Fine Axial Knurling Ridges around the Navy 1/2×28 Thread Protector (X in [18.36, 19.40])!
  for (let n = 0; n < 16; n++) {
    const knurlAng = (n * Math.PI * 2) / 16;
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(1.02, 0.025, 0.038)
          .translate(18.88, 0.448, 0)
          .rotateX(knurlAng),
        HK_STEEL_HIGHLIGHT
      )
    );
  }

  // 5. 6 Right-Hand 9×19mm Rifling Lands inside the bore & visible at the recessed muzzle crown!
  for (let r = 0; r < 6; r++) {
    const rAng = (r * Math.PI * 2) / 6;
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(14.5, 0.026, 0.038)
          .translate(12.1, 0.186, 0)
          .rotateX(rAng),
        HK_CHROME_STEEL
      )
    );
  }

  // Polished feed ramp & heavy barrel press cross-pin inside trunnion
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.44, 0.22, 0.48)
        .rotateZ(0.42)
        .translate(2.58, -0.34, 0),
      HK_CHROME_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.11, 0.11, 1.24, 14)
        .rotateX(Math.PI / 2)
        .translate(4.15, -0.32, 0),
      HK_BRIGHT_STEEL
    )
  );

  return mergeParts(subParts);
}

/**
 * R-04: Iconic HK MP5 "Triple Frame" Hooded Circular Ring Front Sight Tower w/ Sling Loop
 * (assembledPos: [15.40, 1.00, 0])
 */
export function buildMp5FrontSightGeometry(): THREE.BufferGeometry {
  const barrelRing = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 1.28, 26).rotateZ(Math.PI / 2),
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
    new THREE.CylinderGeometry(0.55, 0.55, 0.9, 28)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 1.98, 0),
    HK_STEEL_HIGHLIGHT
  );
  // Lower forearm push-pin retaining lug
  const forearmLug = paintGeometry(
    new THREE.BoxGeometry(0.88, 0.54, 0.58).translate(-0.32, -0.62, 0),
    HK_DARK_STEEL
  );

  const solid = csgUnion([
    barrelRing,
    verticalWeb,
    cockingCollar,
    hoodOuter,
    forearmLug,
  ]);

  // Subtract barrel bore, cocking-tube bore, circular sight hood tunnel & side web lightening pockets!
  const cutBarrel = paintGeometry(
    new THREE.CylinderGeometry(0.455, 0.455, 1.6, 24).rotateZ(Math.PI / 2),
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
  const webPocketL = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.44, 0.12).translate(0, 0.54, -0.28),
    HK_INNER_DARK
  );
  const webPocketR = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.44, 0.12).translate(0, 0.54, 0.28),
    HK_INNER_DARK
  );

  const tower = csgSubtract(solid, [
    cutBarrel,
    cutCocking,
    cutHood,
    webPocketL,
    webPocketR,
  ]);

  // Tapered front sight post + roll pin + welded left sling bracket & loop + barrel taper pin!
  const sightPost = paintGeometry(
    new THREE.BoxGeometry(0.11, 0.44, 0.085).translate(-0.02, 1.78, 0),
    HK_BRIGHT_STEEL
  );
  const slingBracket = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.22, 0.26).translate(0.12, 0.54, -0.38),
    HK_DARK_STEEL
  );
  const slingEyelet = paintGeometry(
    new THREE.TorusGeometry(0.22, 0.05, 10, 20)
      .rotateY(Math.PI / 2)
      .translate(0.12, 0.54, -0.56),
    HK_BRIGHT_STEEL
  );
  const barrelCrossPin = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 1.08, 12)
      .rotateX(Math.PI / 2)
      .translate(0.22, -0.44, 0),
    HK_BRIGHT_STEEL
  );
  const forearmPinBushing = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 0.64, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.32, -0.66, 0),
    HK_BRIGHT_STEEL
  );

  return mergeParts([
    tower,
    sightPost,
    slingBracket,
    slingEyelet,
    barrelCrossPin,
    forearmPinBushing,
  ]);
}

/**
 * R-05: Authentic HK Tilted Rotary 4-Aperture Diopter Drum Rear Sight
 * (assembledPos: [-4.25, 2.62, 0]) -> Welded pedestal w/ protective ears & 4 graduated diopter apertures!
 */
export function buildMp5RearSightGeometry(): THREE.BufferGeometry {
  // Welded rectangular sight base w/ protective left/right side ears sitting flush on receiver roof
  const baseBlock = paintGeometry(
    new THREE.BoxGeometry(1.46, 0.28, 1.04).translate(0, 0.03, 0),
    HK_DARK_STEEL
  );
  const baseEarL = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.24, 0.12).translate(-0.04, 0.22, -0.45),
    HK_DARK_STEEL
  );
  const baseEarR = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.24, 0.12).translate(-0.04, 0.22, 0.45),
    HK_DARK_STEEL
  );
  const windageClamp = paintGeometry(
    new THREE.BoxGeometry(1.06, 0.2, 0.78).translate(-0.04, 0.2, 0),
    HK_DARK_STEEL
  );

  // Tilted cylindrical rotary diopter drum (+0.28 rad around Z) w/ 4 graduated aperture diameters!
  const drumOuter = paintGeometry(
    new THREE.CylinderGeometry(0.49, 0.51, 0.58, 28),
    HK_STEEL_HIGHLIGHT
  );
  const drumHollow = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 0.5, 24).translate(0, 0.06, 0),
    HK_INNER_DARK
  );

  // 4 genuinely distinct graduated peep holes drilled into the 4 quadrants around the drum circumference!
  const apRadii = [0.052, 0.068, 0.084, 0.1];
  const drumCutters: THREE.BufferGeometry[] = [drumHollow];
  for (let q = 0; q < 4; q++) {
    const qAng = (q * Math.PI) / 2;
    const rHole = apRadii[q];
    drumCutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(rHole, rHole, 0.65, 14)
          .rotateZ(Math.PI / 2)
          .translate(0.36, 0.04, 0)
          .rotateY(qAng),
        HK_INNER_DARK
      ),
      // Top scalloped V-alignment notch above each aperture
      paintGeometry(
        new THREE.BoxGeometry(0.24, 0.1, 0.12)
          .translate(0.44, 0.28, 0)
          .rotateY(qAng),
        HK_INNER_DARK
      )
    );
  }

  const drumCarved = csgSubtract(drumOuter, drumCutters);
  drumCarved.rotateZ(0.28);
  drumCarved.translate(0.04, 0.44, 0);

  // Central elevation/detent clamping turret & windage screw
  const centerDetentScrew = paintGeometry(
    new THREE.CylinderGeometry(0.145, 0.145, 0.6, 16)
      .rotateZ(0.28)
      .translate(0.04, 0.44, 0),
    HK_BRIGHT_STEEL
  );
  const windageScrew = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 1.12, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.04, 0.18, 0),
    HK_BRIGHT_STEEL
  );

  return mergeParts([
    baseBlock,
    baseEarL,
    baseEarR,
    windageClamp,
    drumCarved,
    centerDetentScrew,
    windageScrew,
  ]);
}

/**
 * R-06: Wide "Tropical" MP5 Polymer Forearm w/ Captive Retention Push-Pin
 * (assembledPos: [10.25, 0.72, 0], isShell: true)
 */
export function buildMp5ForearmGeometry(): THREE.BufferGeometry {
  // Authentic wide pear/triangular HK Tropical handguard cross-section in (Z, Y)
  const prof = new THREE.Shape();
  prof.moveTo(-0.62, -0.92);
  prof.quadraticCurveTo(0, -1.04, 0.62, -0.92);
  prof.quadraticCurveTo(1.1, -0.58, 1.04, 0.08);
  prof.lineTo(0.76, 0.88);
  prof.lineTo(-0.76, 0.88);
  prof.lineTo(-1.04, 0.08);
  prof.quadraticCurveTo(-1.1, -0.58, -0.62, -0.92);
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

  // Hollow U-channel interior + angled front nose taper + 7 ergonomic anti-slip grooves!
  const barrelChannel = paintGeometry(
    new THREE.BoxGeometry(10.3, 1.56, 1.28).translate(0, 0.32, 0),
    HK_POLYMER_ACCENT
  );
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

  // Molded bottom mold-seam spine rib + internal aluminum heatshield + captive HK push-pin w/ detent balls!
  const bottomSpine = paintGeometry(
    new THREE.BoxGeometry(7.2, 0.08, 0.24).translate(-0.6, -0.99, 0),
    HK_POLYMER_ACCENT
  );
  const shieldL = paintGeometry(
    new THREE.BoxGeometry(8.2, 0.68, 0.04).translate(-0.2, 0.12, -0.68),
    '#94a3b8'
  );
  const shieldR = paintGeometry(
    new THREE.BoxGeometry(8.2, 0.68, 0.04).translate(-0.2, 0.12, 0.68),
    '#94a3b8'
  );
  const frontPushPin = paintGeometry(
    new THREE.CylinderGeometry(0.135, 0.135, 1.54, 16)
      .rotateX(Math.PI / 2)
      .translate(4.48, -0.38, 0),
    HK_DARK_STEEL
  );
  const pinHeadCap = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 0.1, 16)
      .rotateX(Math.PI / 2)
      .translate(4.48, -0.38, -0.78),
    HK_DARK_STEEL
  );
  const pinDetentBall = paintGeometry(
    new THREE.SphereGeometry(0.055, 10, 8).translate(4.48, -0.25, 0.68),
    HK_BRIGHT_STEEL
  );

  return mergeParts([
    body,
    bottomSpine,
    shieldL,
    shieldR,
    frontPushPin,
    pinHeadCap,
    pinDetentBall,
  ]);
}

/**
 * R-07: MP5A3 Steel Receiver End Cap w/ Internal H-Buffer, Rail Guides, Rotary Stock Latch & Takedown Pin
 * (assembledPos: [-5.95, 1.05, 0])
 */
export function buildMp5StockEndcapGeometry(): THREE.BufferGeometry {
  const capBody = paintGeometry(
    new THREE.BoxGeometry(1.44, 2.38, 1.54).translate(0.04, 0.12, 0),
    HK_DARK_STEEL
  );
  const frontHollow = paintGeometry(
    new THREE.BoxGeometry(0.76, 2.08, 1.32).translate(0.45, 0.14, 0),
    HK_INNER_DARK
  );
  const capShell = csgSubtract(capBody, [frontHollow]);

  // Left & right rectangular guide sleeves for the twin MP5A3 fork stock rails (Z = ±0.80)
  const guideL = paintGeometry(
    new THREE.BoxGeometry(1.5, 0.44, 0.28).translate(0.02, -0.05, -0.82),
    HK_STEEL_HIGHLIGHT
  );
  const guideR = paintGeometry(
    new THREE.BoxGeometry(1.5, 0.44, 0.28).translate(0.02, -0.05, 0.82),
    HK_STEEL_HIGHLIGHT
  );

  // Amber polyurethane recoil H-Buffer pad + dual external rivet heads + rotary release lever + takedown pin + sling loop!
  const hBuffer = paintGeometry(
    new THREE.BoxGeometry(0.28, 1.65, 1.02).translate(0.22, 0.15, 0),
    HK_BUFFER_AMBER
  );
  const bufferRivetU = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.14, 12)
      .rotateZ(Math.PI / 2)
      .translate(-0.68, 0.58, 0),
    HK_BRIGHT_STEEL
  );
  const bufferRivetL = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.14, 12)
      .rotateZ(Math.PI / 2)
      .translate(-0.68, -0.22, 0),
    HK_BRIGHT_STEEL
  );
  const stockReleaseLever = paintGeometry(
    new THREE.BoxGeometry(0.82, 0.46, 0.58)
      .rotateZ(-0.22)
      .translate(-0.28, -1.16, 0),
    HK_STEEL_HIGHLIGHT
  );
  const rearTakedownPin = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 1.72, 16)
      .rotateX(Math.PI / 2)
      .translate(0.5, -0.96, 0),
    HK_DARK_STEEL
  );
  const slingRing = paintGeometry(
    new THREE.TorusGeometry(0.2, 0.045, 10, 18)
      .rotateY(Math.PI / 2)
      .translate(-0.55, 0.35, -0.82),
    HK_BRIGHT_STEEL
  );

  return mergeParts([
    capShell,
    guideL,
    guideR,
    hBuffer,
    bufferRivetU,
    bufferRivetL,
    stockReleaseLever,
    rearTakedownPin,
    slingRing,
  ]);
}

/**
 * R-08: Iconic MP5A3 Collapsible Fork Buttstock & Serrated Concave Rubber Buttpad
 * (assembledPos: [-14.45, 0.35, 0])
 */
export function buildMp5ButtstockGeometry(): THREE.BufferGeometry {
  // Deeply curved/concave MP5A3 rubber buttpad
  const padShape = new THREE.Shape();
  padShape.moveTo(0.78, 1.18);
  padShape.lineTo(-0.82, 1.18);
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

  // Horizontal anti-slip shoulder serration grooves along concave rear face
  const padGrooves: THREE.BufferGeometry[] = [];
  for (let g = 0; g < 8; g++) {
    const gy = -2.55 + g * 0.46;
    padGrooves.push(
      paintGeometry(
        new THREE.BoxGeometry(0.32, 0.13, 1.38).translate(-0.88, gy, 0),
        HK_POLYMER_ACCENT
      )
    );
  }
  const buttpad = csgSubtract(buttpadRaw, padGrooves);

  // Cast metal A3 fork yoke clamping the twin steel rails + cross roll-pins + rear sling eyelet
  const forkYoke = paintGeometry(
    new THREE.BoxGeometry(1.38, 0.94, 1.74).translate(0.55, 0.65, 0),
    HK_STEEL_HIGHLIGHT
  );
  const forkRollPin = paintGeometry(
    new THREE.CylinderGeometry(0.065, 0.065, 1.78, 12)
      .rotateX(Math.PI / 2)
      .translate(0.85, 0.65, 0),
    HK_BRIGHT_STEEL
  );

  // Twin stamped C-channel spring-steel stock fork rails extending along Z = ±0.80, Y_local = +0.65, X_local in [+0.45, +11.60]!
  const rails: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const railBar = paintGeometry(
      new THREE.BoxGeometry(11.15, 0.28, 0.13).translate(
        6.025,
        0.65,
        side * 0.8
      ),
      HK_DARK_STEEL
    );
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
          new THREE.BoxGeometry(0.28, 0.12, 0.24).translate(
            nx,
            0.52,
            side * 0.8
          ),
          HK_INNER_DARK
        )
      );
    }
    rails.push(csgSubtract(railBar, notches));

    // Bright polished steel bearing strips along top & bottom edges of stock rails
    rails.push(
      paintGeometry(
        new THREE.BoxGeometry(11.1, 0.04, 0.135).translate(
          6.02,
          0.78,
          side * 0.8
        ),
        HK_BRIGHT_STEEL
      ),
      paintGeometry(
        new THREE.BoxGeometry(11.1, 0.035, 0.135).translate(
          6.02,
          0.52,
          side * 0.8
        ),
        HK_BRIGHT_STEEL
      )
    );
  }

  return mergeParts([buttpad, forkYoke, forkRollPin, ...rails]);
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
