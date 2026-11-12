import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import { applyAkReceiverUVs } from './ak15UvAtlasHelper';

const AK_DARK_STEEL = '#454f5e';
const AK_STEEL_HIGHLIGHT = '#586476';
const AK_RAIL_FLAT = '#566275';
const AK_RAIL_SLOT = '#262c36';
const AK_INNER_DARK = '#252b35';
const AK_BRIGHT_STEEL = '#cbd5e1';
const AK_POLYMER = '#323842';
const AK_POLYMER_ACCENT = '#282d36';
const AK_RUBBER = '#22262e';

/**
 * Helper: builds an extruded MIL-STD-1913 Picatinny rail along X with CSG-cut recoil cross-slots.
 * If `invertY` is true, the 45-deg dovetail faces downward (-Y) for under-barrel handguard mounting.
 */
function buildPicatinnyRailSection(opts: {
  length: number;
  centerX: number;
  baseY: number;
  slotCount: number;
  invertY?: boolean;
  bodyColor: string;
  slotColor: string;
}): THREE.BufferGeometry {
  const {
    length,
    centerX,
    baseY,
    slotCount,
    invertY = false,
    bodyColor,
    slotColor,
  } = opts;
  const s = invertY ? -1 : 1;

  // Authentic M1913 cross-section in (Z, Y): narrow neck -> wide 45° dovetail -> top flats w/ sight groove
  const prof = new THREE.Shape();
  prof.moveTo(-0.37, 0);
  prof.lineTo(-0.37, 0.07 * s);
  prof.lineTo(-0.49, 0.16 * s);
  prof.lineTo(-0.38, 0.25 * s);
  prof.lineTo(-0.12, 0.25 * s);
  prof.lineTo(-0.09, 0.21 * s);
  prof.lineTo(0.09, 0.21 * s);
  prof.lineTo(0.12, 0.25 * s);
  prof.lineTo(0.38, 0.25 * s);
  prof.lineTo(0.49, 0.16 * s);
  prof.lineTo(0.37, 0.07 * s);
  prof.lineTo(0.37, 0);
  prof.closePath();

  const raw = new THREE.ExtrudeGeometry(prof, {
    depth: length,
    bevelEnabled: false,
  });
  raw.rotateY(Math.PI / 2);
  raw.translate(centerX - length / 2, baseY, 0);
  paintGeometry(raw, bodyColor);

  const cutters: THREE.BufferGeometry[] = [];
  const pitch = length / (slotCount + 0.6);
  const startX = centerX - ((slotCount - 1) * pitch) / 2;
  for (let i = 0; i < slotCount; i++) {
    const sx = startX + i * pitch;
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.28, 0.15, 1.12).translate(
          sx,
          baseY + 0.205 * s,
          0
        ),
        slotColor
      )
    );
  }
  return csgSubtract(raw, [mergeParts(cutters)]);
}

/**
 * R-01: 1.5mm Stamped Steel AK-15M1 (6P71M) Receiver with Front/Rear Trunnions,
 * Magwell Dimples, Center Support Collar, Side Folding Latch & Domed Rivets
 */
export function buildAkReceiverGeometry(): THREE.BufferGeometry {
  // Main 1.5mm stamped U-channel receiver body
  const mainHull = paintGeometry(
    new THREE.BoxGeometry(12.2, 2.46, 1.62).translate(-0.1, 0.35, 0),
    AK_DARK_STEEL
  );

  // Cutters: 1.5mm wall interior cavity, magwell opening + front lug notch, trigger slot,
  // stepped upper-right carrier/charging lip, rear slant bevel, and PBR-aligned magwell dimples!
  const innerCavity = paintGeometry(
    new THREE.BoxGeometry(11.1, 2.18, 1.32).translate(-0.15, 0.64, 0),
    AK_INNER_DARK
  );
  const magwellHole = paintGeometry(
    new THREE.BoxGeometry(3.45, 1.24, 1.28).translate(2.55, -0.55, 0),
    AK_INNER_DARK
  );
  const magFrontLugNotch = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.68, 0.98).translate(4.18, -0.56, 0),
    AK_INNER_DARK
  );
  const triggerHole = paintGeometry(
    new THREE.BoxGeometry(1.58, 1.12, 0.74).translate(-2.05, -0.58, 0),
    AK_INNER_DARK
  );
  // Stamped oval magazine-well strengthening dimples aligned 1:1 with ak_receiver PBR (.675,.725)/(.325,.265)
  const dimpleR = paintGeometry(
    new THREE.SphereGeometry(0.66, 20, 14)
      .scale(1.62, 0.6, 0.22)
      .translate(2.14, 0.21, 0.86),
    AK_DARK_STEEL
  );
  const dimpleL = paintGeometry(
    new THREE.SphereGeometry(0.66, 20, 14)
      .scale(1.62, 0.6, 0.22)
      .translate(2.14, 0.21, -0.86),
    AK_DARK_STEEL
  );
  // Rear lower receiver upward slant toward stock hinge
  const rearSlantCut = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.8, 2.0)
      .rotateZ(0.16)
      .translate(-5.3, -1.08, 0),
    AK_INNER_DARK
  );
  // Stepped upper-right charging handle & selector seal notch along top right receiver rim
  const rightTopStep = paintGeometry(
    new THREE.BoxGeometry(4.65, 0.34, 0.36).translate(1.85, 1.48, 0.76),
    AK_INNER_DARK
  );

  const shell = csgSubtract(mainHull, [
    innerCavity,
    magwellHole,
    magFrontLugNotch,
    triggerHole,
    dimpleR,
    dimpleL,
    rearSlantCut,
    rightTopStep,
  ]);

  // Forged Front Trunnion block with 2-lug rotary locking recesses & barrel journal collar
  const trunnionRaw = paintGeometry(
    new THREE.BoxGeometry(2.18, 2.28, 1.46).translate(4.85, 0.44, 0),
    AK_DARK_STEEL
  );
  const trunnionBore = paintGeometry(
    new THREE.CylinderGeometry(0.63, 0.63, 2.55, 24)
      .rotateZ(Math.PI / 2)
      .translate(4.85, 1.05, 0),
    AK_INNER_DARK
  );
  const lugLockPocket = paintGeometry(
    new THREE.BoxGeometry(0.76, 0.44, 1.24).translate(4.02, 1.05, 0),
    AK_INNER_DARK
  );
  const camTurnLeadIn = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.56, 0.54)
      .rotateX(0.45)
      .translate(3.98, 1.18, 0.36),
    AK_INNER_DARK
  );
  const frontTrunnion = csgSubtract(trunnionRaw, [
    trunnionBore,
    lugLockPocket,
    camTurnLeadIn,
  ]);

  // Riveted Curved Steel Bullet Guide Ramp (сухарь) ahead of magwell feeding 7.62×39mm rounds into chamber
  const bulletGuide = paintGeometry(
    new THREE.BoxGeometry(0.58, 0.24, 0.78)
      .rotateZ(0.38)
      .translate(3.84, 0.52, 0),
    AK_BRIGHT_STEEL
  );

  // Internal stepped carrier guide rails + fixed Left-Side Steel Ejector Blade
  const railL = paintGeometry(
    new THREE.BoxGeometry(8.65, 0.14, 0.19).translate(-0.8, 1.22, -0.58),
    AK_BRIGHT_STEEL
  );
  const railR = paintGeometry(
    new THREE.BoxGeometry(8.65, 0.14, 0.19).translate(-0.8, 1.22, 0.58),
    AK_BRIGHT_STEEL
  );
  const ejectorFin = paintGeometry(
    new THREE.BoxGeometry(1.22, 0.2, 0.3).translate(1.25, 1.04, -0.46),
    AK_BRIGHT_STEEL
  );

  // Hardened Tubular Center-Support Spacer Collar across receiver interior at (-1.56, 0.24)
  const centerSupportSleeve = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 1.32, 18)
      .rotateX(Math.PI / 2)
      .translate(-1.56, 0.24, 0),
    AK_BRIGHT_STEEL
  );

  // Rear folding-stock hinge trunnion, twin hinge knuckles, hinge pin, side-folding catch & 6P71M cross-lock boss
  const rearBlock = paintGeometry(
    new THREE.BoxGeometry(0.98, 2.15, 1.54).translate(-5.85, 0.48, 0),
    AK_DARK_STEEL
  );
  const hingeKnuckleUpper = paintGeometry(
    new THREE.CylinderGeometry(0.23, 0.23, 0.56, 16).translate(
      -6.22,
      1.02,
      -0.78
    ),
    AK_DARK_STEEL
  );
  const hingeKnuckleLower = paintGeometry(
    new THREE.CylinderGeometry(0.23, 0.23, 0.56, 16).translate(
      -6.22,
      -0.06,
      -0.78
    ),
    AK_DARK_STEEL
  );
  const hingePin = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 1.82, 14).translate(
      -6.22,
      0.48,
      -0.78
    ),
    AK_BRIGHT_STEEL
  );
  // Left-side stock-folded catch hook & rear release button + right-side selector stop plate
  const sideStockLatch = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.32, 0.14).translate(4.35, -0.18, -0.84),
    AK_DARK_STEEL
  );
  const selectorStopPlate = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.16, 0.08).translate(-1.55, -0.84, 0.83),
    AK_DARK_STEEL
  );
  const coverPinBoss = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 1.88, 16)
      .rotateX(Math.PI / 2)
      .translate(-5.65, 1.38, 0),
    AK_BRIGHT_STEEL
  );

  // FCG Hammer & Trigger axis pin bosses flush on receiver walls
  const fcgPinHammer = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 1.72, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.35, -0.05, 0),
    AK_DARK_STEEL
  );
  const fcgPinTrigger = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 1.72, 14)
      .rotateX(Math.PI / 2)
      .translate(-2.15, -0.35, 0),
    AK_DARK_STEEL
  );

  // Domed Kalashnikov trunnion & center-support rivets aligned 1:1 with ak_receiver 2K PBR map!
  const rivetPositions: [number, number, number][] = [
    [5.29, 0.89, 0.125], // Front trunnion upper
    [4.61, -0.1, 0.125], // Front trunnion lower
    [4.18, -0.36, 0.11], // Bullet-guide / lower trunnion rivet
    [-1.56, 0.24, 0.135], // Center support collar rivet
    [-4.98, 1.06, 0.125], // Rear trunnion upper
    [-4.57, -0.05, 0.12], // Rear trunnion forward-lower
    [-5.34, -0.05, 0.12], // Rear trunnion aft-lower
  ];
  const rivets: THREE.BufferGeometry[] = [];
  for (const [rx, ry, rRad] of rivetPositions) {
    for (const side of [-1, 1]) {
      rivets.push(
        paintGeometry(
          new THREE.SphereGeometry(rRad, 12, 10)
            .scale(1, 1, 0.45)
            .translate(rx, ry, side * 0.82),
          AK_DARK_STEEL
        )
      );
    }
  }

  const merged = mergeParts([
    shell,
    frontTrunnion,
    bulletGuide,
    railL,
    railR,
    ejectorFin,
    centerSupportSleeve,
    rearBlock,
    hingeKnuckleUpper,
    hingeKnuckleLower,
    hingePin,
    sideStockLatch,
    selectorStopPlate,
    coverPinBoss,
    fcgPinHammer,
    fcgPinTrigger,
    ...rivets,
  ]);
  return applyAkReceiverUVs(merged);
}

/**
 * R-02: 415mm Cold-Hammer-Forged Chrome-Lined Bayonet-Free 7.62×39mm Barrel (assembledPos: [0, 1.05, 0])
 * Features recessed target crown, 4 right-hand rifling lands, extractor relief cut & free-float barrel nut journal.
 */
export function buildAkBarrelGeometry(): THREE.BufferGeometry {
  const BARREL_STEEL = AK_DARK_STEEL;
  const CHROME_CHAMBER = '#dbe4ee';

  // Stepped bayonet-free 6P71M CHF outer contour revolved around X axis, including recessed 11° muzzle crown!
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.32, 3.85),
    new THREE.Vector2(0.61, 3.85), // Breech face & trunnion press journal
    new THREE.Vector2(0.61, 5.95),
    new THREE.Vector2(0.68, 5.98), // Free-float handguard barrel-nut collar
    new THREE.Vector2(0.68, 6.42),
    new THREE.Vector2(0.49, 6.65), // Chamber taper into free-float medium contour
    new THREE.Vector2(0.45, 11.2),
    new THREE.Vector2(0.44, 15.52),
    new THREE.Vector2(0.49, 15.62), // 90° Gas-block press journal
    new THREE.Vector2(0.49, 17.95),
    new THREE.Vector2(0.4, 18.06), // Clean bayonet-free forward barrel contour
    new THREE.Vector2(0.4, 22.58),
    new THREE.Vector2(0.44, 22.62), // Muzzle brake rear stop shoulder
    new THREE.Vector2(0.44, 22.74),
    new THREE.Vector2(0.35, 22.76), // Bayonet/QD muzzle spigot
    new THREE.Vector2(0.35, 23.48), // Outer muzzle rim
    new THREE.Vector2(0.22, 23.38), // Recessed target muzzle crown dish!
  ];
  const outer = new THREE.LatheGeometry(pts, 28);
  outer.rotateZ(-Math.PI / 2);
  paintGeometry(outer, BARREL_STEEL);

  // Hollow 7.62mm bore + 7.62×39mm bottleneck chamber + right extractor cut + 90° gas port + cross-pin grooves
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.215, 0.215, 20.4, 20)
      .rotateZ(Math.PI / 2)
      .translate(13.75, 0, 0),
    AK_INNER_DARK
  );
  const chamber = paintGeometry(
    new THREE.CylinderGeometry(0.31, 0.35, 2.35, 20)
      .rotateZ(Math.PI / 2)
      .translate(4.95, 0, 0),
    AK_INNER_DARK
  );
  const extractorCut = paintGeometry(
    new THREE.BoxGeometry(0.3, 0.34, 0.32).translate(3.92, 0.03, 0.38),
    AK_INNER_DARK
  );
  const gasPort = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.56, 12).translate(16.7, 0.36, 0),
    AK_INNER_DARK
  );
  const pinGroove1 = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.9, 10)
      .rotateX(Math.PI / 2)
      .translate(16.15, -0.45, 0),
    AK_INNER_DARK
  );
  const pinGroove2 = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.9, 10)
      .rotateX(Math.PI / 2)
      .translate(17.25, -0.45, 0),
    AK_INNER_DARK
  );

  const hollowed = csgSubtract(outer, [
    bore,
    chamber,
    extractorCut,
    gasPort,
    pinGroove1,
    pinGroove2,
  ]);

  // 4 chrome-lined right-hand 7.62mm rifling lands along bore + polished chrome breech feed throat
  const riflingAndChrome: THREE.BufferGeometry[] = [
    hollowed,
    paintGeometry(
      new THREE.TorusGeometry(0.38, 0.06, 10, 24)
        .rotateY(Math.PI / 2)
        .translate(3.87, 0, 0),
      CHROME_CHAMBER
    ),
  ];

  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2 + Math.PI / 4;
    riflingAndChrome.push(
      paintGeometry(
        new THREE.BoxGeometry(17.1, 0.032, 0.045)
          .translate(14.75, 0.205, 0)
          .rotateX(ang),
        CHROME_CHAMBER
      )
    );
  }

  return mergeParts(riflingAndChrome);
}

/**
 * R-03: AK-15 Multi-Port Slotted Compensator / Flash Suppressor w/ QD Suppressor Mount & Crown
 * (assembledPos: [24.2, 1.05, 0])
 */
export function buildAkMuzzleDeviceGeometry(): THREE.BufferGeometry {
  // Stepped Lathe outer profile with QD suppressor collar, expansion chamber, baffle waist & recessed exit crown
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.36, -1.55),
    new THREE.Vector2(0.56, -1.55),
    new THREE.Vector2(0.56, -0.72), // Rear QD suppressor mounting collar
    new THREE.Vector2(0.5, -0.68),
    new THREE.Vector2(0.5, -0.42), // QD lock-ring groove
    new THREE.Vector2(0.55, -0.38),
    new THREE.Vector2(0.55, 0.24), // Multi-port compensator expansion chamber
    new THREE.Vector2(0.51, 0.32),
    new THREE.Vector2(0.53, 1.68), // Slotted flash-suppressor cage
    new THREE.Vector2(0.41, 1.68), // Crown rim
    new THREE.Vector2(0.34, 1.56), // Recessed muzzle exit crown!
    new THREE.Vector2(0.34, -1.55),
  ];
  const rawBody = new THREE.LatheGeometry(pts, 28);
  rawBody.rotateZ(-Math.PI / 2);
  paintGeometry(rawBody, AK_DARK_STEEL);

  // Internal expansion chambers + central bullet baffle + side compensator brake ports + 5 forward flash slots!
  const cutters: THREE.BufferGeometry[] = [
    // Through bullet bore (leaves internal compensator baffle ring around X_local = +0.26!)
    paintGeometry(
      new THREE.CylinderGeometry(0.27, 0.27, 3.6, 22)
        .rotateZ(Math.PI / 2)
        .translate(0.05, 0, 0),
      AK_INNER_DARK
    ),
    // Rear expansion chamber cavity
    paintGeometry(
      new THREE.CylinderGeometry(0.41, 0.41, 1.55, 22)
        .rotateZ(Math.PI / 2)
        .translate(-0.62, 0, 0),
      AK_INNER_DARK
    ),
    // Forward flash-cage internal cone
    paintGeometry(
      new THREE.CylinderGeometry(0.42, 0.38, 1.32, 22)
        .rotateZ(Math.PI / 2)
        .translate(1.04, 0, 0),
      AK_INNER_DARK
    ),
    // Bilateral horizontal recoil-compensating brake windows!
    paintGeometry(
      new THREE.BoxGeometry(0.42, 0.32, 1.25).translate(-0.1, 0, 0),
      AK_INNER_DARK
    ),
    // Top anti-muzzle-rise gas port
    paintGeometry(
      new THREE.CylinderGeometry(0.13, 0.13, 0.55, 14).translate(-0.1, 0.42, 0),
      AK_INNER_DARK
    ),
  ];

  // 5 longitudinal flash-suppression slots around upper 240° arc (closed bottom eliminates prone dust signature)
  const slotAngles = [-1.68, -0.84, 0, 0.84, 1.68];
  for (const ang of slotAngles) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.06, 0.62, 0.15)
          .translate(0.96, 0.42, 0)
          .rotateX(ang),
        AK_INNER_DARK
      )
    );
  }
  // Front tactical crown wire-cutter notches
  for (let c = 0; c < 3; c++) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.18, 1.18, 0.12)
          .translate(1.64, 0, 0)
          .rotateX((c * Math.PI) / 3),
        AK_INNER_DARK
      )
    );
  }

  const slotted = csgSubtract(rawBody, cutters);

  // Stainless QD suppressor alignment ring & bottom retention detent lug
  const lockRing = paintGeometry(
    new THREE.TorusGeometry(0.54, 0.05, 10, 28)
      .rotateY(Math.PI / 2)
      .translate(-0.55, 0, 0),
    AK_BRIGHT_STEEL
  );
  const qdLug = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.22, 0.24).translate(-1.18, -0.56, 0),
    AK_STEEL_HIGHLIGHT
  );

  return mergeParts([slotted, lockRing, qdLug]);
}

/**
 * R-04: 90° Vertical Gas Block, Removable Front Gas Plug & Hooded Front Sight (assembledPos: [16.7, 1.05, 0])
 * Bayonet-free 6P71M configuration with knurled removable front cleanout plug & detent pin.
 */
export function buildAkGasBlockGeometry(): THREE.BufferGeometry {
  const barrelSleeve = paintGeometry(
    new THREE.CylinderGeometry(0.64, 0.64, 2.25, 26)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    AK_DARK_STEEL
  );
  const verticalWeb = paintGeometry(
    new THREE.BoxGeometry(1.82, 1.45, 0.76).translate(-0.04, 0.72, 0),
    AK_DARK_STEEL
  );
  const gasCup = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.56, 2.22, 26)
      .rotateZ(Math.PI / 2)
      .translate(0.02, 1.3, 0),
    AK_DARK_STEEL
  );
  const sightTower = paintGeometry(
    new THREE.BoxGeometry(0.92, 0.65, 0.64).translate(0.08, 1.85, 0),
    AK_DARK_STEEL
  );
  const sightHoodOuter = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.48, 0.78, 24)
      .rotateZ(Math.PI / 2)
      .translate(0.08, 2.36, 0),
    AK_STEEL_HIGHLIGHT
  );
  // Sleek bayonet-free underside cleaning-rod / sling-bracket stop boss
  const bottomStopEar = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.26, 0.38).translate(-0.15, -0.66, 0),
    AK_DARK_STEEL
  );

  const solid = csgUnion([
    barrelSleeve,
    verticalWeb,
    gasCup,
    sightTower,
    sightHoodOuter,
    bottomStopEar,
  ]);

  // Cut barrel bore, rear gas-tube socket, side lightening pockets, and circular sight hood tunnel!
  const barrelHole = paintGeometry(
    new THREE.CylinderGeometry(0.495, 0.495, 2.6, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    AK_INNER_DARK
  );
  const gasSocket = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 1.65, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.55, 1.3, 0),
    AK_INNER_DARK
  );
  const hoodTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.37, 0.37, 1.0, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.08, 2.36, 0),
    AK_INNER_DARK
  );
  const webFluteL = paintGeometry(
    new THREE.BoxGeometry(0.92, 0.48, 0.16).translate(-0.04, 0.66, -0.38),
    AK_INNER_DARK
  );
  const webFluteR = paintGeometry(
    new THREE.BoxGeometry(0.92, 0.48, 0.16).translate(-0.04, 0.66, 0.38),
    AK_INNER_DARK
  );

  const carved = csgSubtract(solid, [
    barrelHole,
    gasSocket,
    hoodTunnel,
    webFluteL,
    webFluteR,
  ]);

  // 1:1 Removable Front Gas Plug w/ radial grip ribs, screwdriver cross-bar & spring detent pin!
  const gasPlugBody = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.47, 0.56, 20)
      .rotateZ(Math.PI / 2)
      .translate(1.36, 1.3, 0),
    AK_BRIGHT_STEEL
  );
  const gasPlugCrossBar = paintGeometry(
    new THREE.BoxGeometry(0.18, 0.78, 0.16).translate(1.62, 1.3, 0),
    AK_BRIGHT_STEEL
  );
  const gasPlugDetent = paintGeometry(
    new THREE.CylinderGeometry(0.065, 0.065, 0.26, 12)
      .rotateZ(Math.PI / 2)
      .translate(1.18, 1.68, 0.24),
    AK_BRIGHT_STEEL
  );

  // Elevation-adjustable front sight post + windage drum + cross-pins + left sling loop
  const sightPost = paintGeometry(
    new THREE.CylinderGeometry(0.05, 0.068, 0.44, 12).translate(0.08, 2.24, 0),
    AK_BRIGHT_STEEL
  );
  const windageDrum = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 0.76, 16)
      .rotateX(Math.PI / 2)
      .translate(0.08, 1.98, 0),
    AK_BRIGHT_STEEL
  );
  const pin1 = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.92, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.55, -0.45, 0),
    AK_BRIGHT_STEEL
  );
  const pin2 = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.92, 12)
      .rotateX(Math.PI / 2)
      .translate(0.55, -0.45, 0),
    AK_BRIGHT_STEEL
  );
  const slingLoop = paintGeometry(
    new THREE.TorusGeometry(0.19, 0.045, 10, 18)
      .rotateY(Math.PI / 2)
      .translate(-0.15, 0.62, -0.44),
    AK_BRIGHT_STEEL
  );

  return mergeParts([
    carved,
    gasPlugBody,
    gasPlugCrossBar,
    gasPlugDetent,
    sightPost,
    windageDrum,
    pin1,
    pin2,
    slingLoop,
  ]);
}

/**
 * R-05: Reinforced Free-Float Polymer Lower Handguard w/ Cooling Vents, Heatshield & Bottom/Side M1913 Rails
 * (assembledPos: [10.75, 0.82, 0])
 */
export function buildAkLowerHandguardGeometry(): THREE.BufferGeometry {
  // Ergonomic octagonal U-trough cross section extruded along X ∈ [-4.8, +4.8]
  const shape = new THREE.Shape();
  shape.moveTo(-0.74, -0.88);
  shape.lineTo(0.74, -0.88);
  shape.lineTo(0.96, -0.52);
  shape.lineTo(0.96, 0.78);
  shape.lineTo(0.78, 0.92);
  shape.lineTo(-0.78, 0.92);
  shape.lineTo(-0.96, 0.78);
  shape.lineTo(-0.96, -0.52);
  shape.closePath();

  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: 9.55,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  raw.rotateY(Math.PI / 2);
  raw.translate(-4.775, 0, 0);
  paintGeometry(raw, AK_POLYMER);

  // Hollow interior U-channel so barrel floats freely + 5 angled side heat-ventilation slots + lower vents!
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(9.9, 1.54, 1.4).translate(0, 0.34, 0),
      AK_POLYMER_ACCENT
    ),
  ];

  for (const vx of [-3.35, -1.9, -0.45, 1.0, 2.45]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.98, 0.3, 2.25)
          .rotateZ(0.14)
          .translate(vx, 0.28, 0),
        AK_POLYMER_ACCENT
      )
    );
  }
  for (const lvx of [-2.6, -0.6, 1.4]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.1, 0.16, 2.15).translate(lvx, -0.36, 0),
        AK_POLYMER_ACCENT
      )
    );
  }

  const body = csgSubtract(raw, cutters);

  // Inner brushed aluminum thermal heatshield visible behind cooling vents + rear steel free-float collar
  const heatShieldL = paintGeometry(
    new THREE.BoxGeometry(8.1, 0.72, 0.05).translate(-0.2, 0.2, -0.71),
    '#94a3b8'
  );
  const heatShieldR = paintGeometry(
    new THREE.BoxGeometry(8.1, 0.72, 0.05).translate(-0.2, 0.2, 0.71),
    '#94a3b8'
  );
  const rearFreeFloatCollar = paintGeometry(
    new THREE.BoxGeometry(0.42, 1.65, 1.82).translate(-4.62, 0.02, 0),
    AK_STEEL_HIGHLIGHT
  );
  const collarCut = paintGeometry(
    new THREE.BoxGeometry(0.65, 1.42, 1.42).translate(-4.62, 0.22, 0),
    AK_INNER_DARK
  );
  const rearCollar = csgSubtract(rearFreeFloatCollar, [collarCut]);

  // True MIL-STD-1913 Trapezoidal Bottom Picatinny Rail (12 recoil cross-slots)
  const bottomRail = buildPicatinnyRailSection({
    length: 8.65,
    centerX: 0.05,
    baseY: -0.88,
    slotCount: 12,
    invertY: true,
    bodyColor: AK_RAIL_FLAT,
    slotColor: AK_RAIL_SLOT,
  });

  const subParts: THREE.BufferGeometry[] = [
    body,
    heatShieldL,
    heatShieldR,
    rearCollar,
    bottomRail,
  ];

  // Molded horizontal palm-swell ribs along lower bevels
  for (let r = 0; r < 6; r++) {
    const rx = -3.4 + r * 1.1;
    for (const side of [-1, 1]) {
      subParts.push(
        paintGeometry(
          new THREE.BoxGeometry(0.18, 0.36, 0.08)
            .rotateX(side * 0.45)
            .translate(rx, -0.68, side * 0.88),
          AK_POLYMER_ACCENT
        )
      );
    }
  }

  // Forward Left & Right 4-Slot M1913 Picatinny Side Rails w/ recessed hex mounting screws!
  for (const side of [-1, 1]) {
    const sideRail = buildPicatinnyRailSection({
      length: 2.55,
      centerX: 3.15,
      baseY: 0,
      slotCount: 4,
      invertY: false,
      bodyColor: AK_RAIL_FLAT,
      slotColor: AK_RAIL_SLOT,
    });
    sideRail.rotateX((side * Math.PI) / 2);
    sideRail.translate(0, 0.22, side * 0.95);
    subParts.push(sideRail);

    for (const sx of [2.25, 4.05]) {
      subParts.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.075, 0.075, 0.28, 12)
            .rotateX(Math.PI / 2)
            .translate(sx, 0.22, side * 1.06),
          AK_BRIGHT_STEEL
        )
      );
    }
  }

  return mergeParts(subParts);
}

/**
 * R-06: AK-EVO Solid-Body Folding & 6-Position Telescoping Polymer Buttstock (assembledPos: [-12.35, 0.45, 0])
 */
export function buildAkButtstockGeometry(): THREE.BufferGeometry {
  // 1. Internal 6-position telescoping buffer strut connected to front folding hinge
  const strutTube = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.46, 5.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(3.45, 0.36, 0),
    AK_POLYMER_ACCENT
  );
  const strutBottomTrack = paintGeometry(
    new THREE.BoxGeometry(5.1, 0.48, 0.56).translate(3.45, -0.05, 0),
    AK_POLYMER_ACCENT
  );

  // 2. Outer telescoping AK-EVO stock body silhouette in (X, Y)
  const stockShape = new THREE.Shape();
  stockShape.moveTo(4.55, 1.02); // Front sleeve nose over buffer strut
  stockShape.lineTo(-5.65, 0.98); // Straight inline recoil comb
  stockShape.lineTo(-5.85, -2.85); // Rear buttpad interface
  stockShape.lineTo(-4.85, -2.92); // Toe
  stockShape.quadraticCurveTo(-2.15, -1.62, 1.55, -0.68); // Angled lower strut
  stockShape.lineTo(4.55, -0.58);
  stockShape.closePath();

  const rawStock = new THREE.ExtrudeGeometry(stockShape, {
    depth: 1.24,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  rawStock.translate(0, 0, -0.62);
  paintGeometry(rawStock, AK_POLYMER);

  // Triangular sling/lightening window + vertical strap slot + cheek-riser side guide channels
  const triangleWindow = paintGeometry(
    new THREE.BoxGeometry(3.25, 0.82, 1.65)
      .rotateZ(0.24)
      .translate(-2.35, -0.68, 0),
    AK_POLYMER_ACCENT
  );
  const strapSlot = paintGeometry(
    new THREE.BoxGeometry(0.26, 1.35, 1.65).translate(-4.65, -0.45, 0),
    AK_POLYMER_ACCENT
  );
  const sideFluteL = paintGeometry(
    new THREE.BoxGeometry(6.6, 0.44, 0.24).translate(-0.2, 0.38, -0.68),
    AK_POLYMER_ACCENT
  );
  const sideFluteR = paintGeometry(
    new THREE.BoxGeometry(6.6, 0.44, 0.24).translate(-0.2, 0.38, 0.68),
    AK_POLYMER_ACCENT
  );

  const sculptedBody = csgSubtract(rawStock, [
    triangleWindow,
    strapSlot,
    sideFluteL,
    sideFluteR,
  ]);

  // Horizontally ribbed shock-absorbing rubber buttpad w/ cleaning kit trapdoor
  const buttpadRaw = paintGeometry(
    new THREE.BoxGeometry(0.54, 3.92, 1.38).translate(-5.96, -0.95, 0),
    AK_RUBBER
  );
  const padGrooves: THREE.BufferGeometry[] = [];
  for (let g = 0; g < 8; g++) {
    padGrooves.push(
      paintGeometry(
        new THREE.BoxGeometry(0.18, 0.14, 1.52).translate(
          -6.2,
          -2.45 + g * 0.43,
          0
        ),
        AK_POLYMER_ACCENT
      )
    );
  }
  const buttpad = csgSubtract(buttpadRaw, padGrooves);

  // Front steel left-folding hinge block + release latch + ambidextrous stainless QD sling sockets + LOP paddle
  const hingePlate = paintGeometry(
    new THREE.BoxGeometry(0.62, 1.72, 1.44).translate(5.92, 0.22, 0),
    AK_STEEL_HIGHLIGHT
  );
  const hingeButton = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.32, 14).translate(
      5.92,
      1.12,
      -0.38
    ),
    AK_BRIGHT_STEEL
  );
  const qdCupSocket = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 1.38, 18)
      .rotateX(Math.PI / 2)
      .translate(-4.35, -1.72, 0),
    AK_BRIGHT_STEEL
  );
  const qdCupHole = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 1.5, 14)
      .rotateX(Math.PI / 2)
      .translate(-4.35, -1.72, 0),
    AK_INNER_DARK
  );
  const qdCup = csgSubtract(qdCupSocket, [qdCupHole]);

  const lopLatch = paintGeometry(
    new THREE.BoxGeometry(1.75, 0.34, 0.74)
      .rotateZ(0.08)
      .translate(2.15, -0.74, 0),
    AK_POLYMER_ACCENT
  );

  return mergeParts([
    strutTube,
    strutBottomTrack,
    sculptedBody,
    buttpad,
    hingePlate,
    hingeButton,
    qdCup,
    lopLatch,
  ]);
}

/**
 * R-07: Model 2023 Elevated Saddle Cheek Riser (assembledPos: [-11.8, 1.62, 0])
 */
export function buildAkCheekRiserGeometry(): THREE.BufferGeometry {
  const profile = new THREE.Shape();
  profile.moveTo(-0.76, -0.58);
  profile.lineTo(-0.76, 0.16);
  profile.quadraticCurveTo(-0.74, 0.48, 0, 0.52);
  profile.quadraticCurveTo(0.74, 0.48, 0.76, 0.16);
  profile.lineTo(0.76, -0.58);
  profile.lineTo(0.56, -0.58);
  profile.lineTo(0.56, 0.1);
  profile.quadraticCurveTo(0.52, 0.28, 0, 0.3);
  profile.quadraticCurveTo(-0.52, 0.28, -0.56, 0.1);
  profile.lineTo(-0.56, -0.58);
  profile.closePath();

  const rawSaddle = new THREE.ExtrudeGeometry(profile, {
    depth: 5.1,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  rawSaddle.rotateY(Math.PI / 2);
  rawSaddle.translate(-2.55, 0, 0);
  paintGeometry(rawSaddle, AK_POLYMER);

  // Scalloped front slope + clamping bolt slot
  const frontBevel = paintGeometry(
    new THREE.BoxGeometry(1.1, 0.85, 1.9)
      .rotateZ(-0.45)
      .translate(2.55, 0.42, 0),
    AK_POLYMER_ACCENT
  );
  const boltSlot = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.52, 1.85).translate(0.35, -0.26, 0),
    AK_POLYMER_ACCENT
  );
  const saddle = csgSubtract(rawSaddle, [frontBevel, boltSlot]);

  // Knurled steel locking thumbwheel & cross-bolt
  const crossBolt = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 1.68, 16)
      .rotateX(Math.PI / 2)
      .translate(0.35, -0.26, 0),
    AK_BRIGHT_STEEL
  );
  const thumbWheel = paintGeometry(
    new THREE.CylinderGeometry(0.25, 0.25, 0.18, 20)
      .rotateX(Math.PI / 2)
      .translate(0.35, -0.26, 0.84),
    AK_STEEL_HIGHLIGHT
  );

  return mergeParts([saddle, crossBolt, thumbWheel]);
}

/**
 * R-08: Monolithic Ergonomic Pistol Grip, Gloved Trigger Guard & Paddle Mag Catch (assembledPos: [-3.2, -0.88, 0])
 */
export function buildAkPistolGripGeometry(): THREE.BufferGeometry {
  // ~22-deg swept-back AK-15 ergonomic pistol grip with front finger swells & rear palm beavertail
  const gripShape = new THREE.Shape();
  gripShape.moveTo(-2.15, 0.06);
  gripShape.lineTo(0.28, 0.06);
  gripShape.quadraticCurveTo(0.08, -0.68, -0.26, -1.25);
  gripShape.quadraticCurveTo(-0.18, -1.58, -0.52, -2.15);
  gripShape.quadraticCurveTo(-0.48, -2.52, -0.96, -3.22);
  gripShape.quadraticCurveTo(-1.32, -4.05, -1.92, -5.12);
  gripShape.lineTo(-3.88, -4.85);
  gripShape.quadraticCurveTo(-3.45, -3.55, -2.85, -2.15);
  gripShape.quadraticCurveTo(-2.28, -0.88, -2.15, 0.06);
  gripShape.closePath();

  const rawGrip = new THREE.ExtrudeGeometry(gripShape, {
    depth: 1.16,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 3,
  });
  rawGrip.translate(0, 0, -0.58);
  paintGeometry(rawGrip, AK_POLYMER);

  // Recessed side anti-slip stipple panels on left & right grip flanks
  const panelCutL = paintGeometry(
    new THREE.BoxGeometry(1.08, 2.85, 0.08)
      .rotateZ(-0.36)
      .translate(-1.82, -2.58, -0.66),
    AK_POLYMER_ACCENT
  );
  const panelCutR = paintGeometry(
    new THREE.BoxGeometry(1.08, 2.85, 0.08)
      .rotateZ(-0.36)
      .translate(-1.82, -2.58, 0.66),
    AK_POLYMER_ACCENT
  );
  const gripBody = csgSubtract(rawGrip, [panelCutL, panelCutR]);

  // Oil-bottle storage trapdoor baseplate cap + squeeze latch tab
  const gripCap = paintGeometry(
    new THREE.BoxGeometry(2.06, 0.24, 1.28)
      .rotateZ(-0.14)
      .translate(-2.9, -5.02, 0),
    AK_POLYMER_ACCENT
  );
  const trapdoorTab = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.14, 0.56)
      .rotateZ(-0.14)
      .translate(-2.22, -5.16, 0),
    AK_DARK_STEEL
  );

  // Integrated enlarged gloved polymer trigger guard loop extending forward to X_local = +3.55
  const guardOuter = paintGeometry(
    new THREE.BoxGeometry(3.35, 1.65, 0.72).translate(1.82, -0.78, 0),
    AK_POLYMER
  );
  const guardHole = paintGeometry(
    new THREE.BoxGeometry(2.58, 1.24, 1.1).translate(1.75, -0.68, 0),
    AK_POLYMER_ACCENT
  );
  const guardFrontBevel = paintGeometry(
    new THREE.BoxGeometry(0.65, 0.65, 1.1)
      .rotateZ(0.62)
      .translate(3.42, -1.52, 0),
    AK_POLYMER_ACCENT
  );
  const triggerGuard = csgSubtract(guardOuter, [guardHole, guardFrontBevel]);

  // Central Kalashnikov steel Paddle Magazine Release Lever + U-housing + torsion spring + flared pin
  const magCatchHousingRaw = paintGeometry(
    new THREE.BoxGeometry(0.72, 0.68, 0.88).translate(3.65, -0.28, 0),
    AK_DARK_STEEL
  );
  const housingSlot = paintGeometry(
    new THREE.BoxGeometry(0.8, 0.75, 0.52).translate(3.65, -0.35, 0),
    AK_INNER_DARK
  );
  const magCatchHousing = csgSubtract(magCatchHousingRaw, [housingSlot]);

  const magPaddle = paintGeometry(
    new THREE.BoxGeometry(0.2, 1.02, 0.46)
      .rotateZ(0.28)
      .translate(3.74, -0.84, 0),
    AK_DARK_STEEL
  );
  const magPaddleTip = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.22, 0.68)
      .rotateZ(0.28)
      .translate(3.88, -1.28, 0),
    AK_STEEL_HIGHLIGHT
  );
  const catchPin = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 1.04, 14)
      .rotateX(Math.PI / 2)
      .translate(3.65, -0.32, 0),
    AK_BRIGHT_STEEL
  );

  return mergeParts([
    gripBody,
    gripCap,
    trapdoorTab,
    triggerGuard,
    magCatchHousing,
    magPaddle,
    magPaddleTip,
    catchPin,
  ]);
}
