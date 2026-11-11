import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from './springHelper';
import { applyAkReceiverUVs } from './ak15UvAtlasHelper';

const AK_DARK_STEEL = '#262c36';
const AK_INNER_DARK = '#141820';
const AK_BRIGHT_STEEL = '#cbd5e1';
const AK_POLYMER = '#20242c';
const AK_POLYMER_ACCENT = '#171a21';
const AK_RUBBER = '#15171c';

/**
 * R-01: 1.5mm Stamped Steel AK-15M1 Receiver with Front/Rear Trunnions, Magwell Dimples, Rivets & Ejector
 */
export function buildAkReceiverGeometry(): THREE.BufferGeometry {
  // Main stamped U-channel receiver body Profile in (X, Y) extruded across Z, or Box + slanted rear cut
  const mainHull = paintGeometry(
    new THREE.BoxGeometry(12.2, 2.46, 1.62).translate(-0.1, 0.35, 0),
    AK_DARK_STEEL
  );

  // cutters: hollow interior, open top for dust cover/carrier, magwell opening, trigger slot, slanted rear bottom
  const innerCavity = paintGeometry(
    new THREE.BoxGeometry(11.1, 2.15, 1.3).translate(-0.15, 0.62, 0),
    AK_INNER_DARK
  );
  const magwellHole = paintGeometry(
    new THREE.BoxGeometry(3.45, 1.2, 1.26).translate(2.55, -0.55, 0),
    AK_INNER_DARK
  );
  const triggerHole = paintGeometry(
    new THREE.BoxGeometry(1.55, 1.1, 0.72).translate(-2.05, -0.58, 0),
    AK_INNER_DARK
  );
  // Stamped oval magazine-well strengthening dimples on right & left walls!
  const dimpleR = paintGeometry(
    new THREE.SphereGeometry(0.65, 18, 12)
      .scale(1.65, 0.62, 0.22)
      .translate(2.55, 0.12, 0.86),
    AK_DARK_STEEL
  );
  const dimpleL = paintGeometry(
    new THREE.SphereGeometry(0.65, 18, 12)
      .scale(1.65, 0.62, 0.22)
      .translate(2.55, 0.12, -0.86),
    AK_DARK_STEEL
  );
  // Rear lower receiver slight upward slant toward stock hinge
  const rearSlantCut = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.8, 2.0)
      .rotateZ(0.16)
      .translate(-5.3, -1.08, 0),
    AK_INNER_DARK
  );

  const shell = csgSubtract(mainHull, [
    innerCavity,
    magwellHole,
    triggerHole,
    dimpleR,
    dimpleL,
    rearSlantCut,
  ]);

  // Forged Front Trunnion block with 2-lug locking recesses & barrel journal collar
  const trunnionRaw = paintGeometry(
    new THREE.BoxGeometry(2.15, 2.28, 1.48).translate(4.85, 0.44, 0),
    AK_DARK_STEEL
  );
  const trunnionBore = paintGeometry(
    new THREE.CylinderGeometry(0.64, 0.64, 2.5, 24)
      .rotateZ(Math.PI / 2)
      .translate(4.85, 1.05, 0),
    AK_INNER_DARK
  );
  const frontTrunnion = csgSubtract(trunnionRaw, [trunnionBore]);

  // Internal carrier guide rails + fixed Left-Side Steel Ejector Blade (kicks spent 7.62 cases out!)
  const railL = paintGeometry(
    new THREE.BoxGeometry(8.6, 0.14, 0.18).translate(-0.8, 1.22, -0.58),
    AK_BRIGHT_STEEL
  );
  const railR = paintGeometry(
    new THREE.BoxGeometry(8.6, 0.14, 0.18).translate(-0.8, 1.22, 0.58),
    AK_BRIGHT_STEEL
  );
  const ejectorFin = paintGeometry(
    new THREE.BoxGeometry(1.15, 0.22, 0.28).translate(1.25, 1.05, -0.48),
    AK_BRIGHT_STEEL
  );

  // Rear folding-stock hinge trunnion block & 2023 cross-lock dust-cover pin boss
  const rearBlock = paintGeometry(
    new THREE.BoxGeometry(0.95, 2.15, 1.56).translate(-5.85, 0.48, 0),
    AK_DARK_STEEL
  );
  const hingeKnuckleL = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 1.65, 16).translate(-6.22, 0.48, -0.78),
    AK_DARK_STEEL
  );
  const coverPinBoss = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 1.88, 16)
      .rotateX(Math.PI / 2)
      .translate(-5.65, 1.38, 0),
    AK_BRIGHT_STEEL
  );

  // Iconic Kalashnikov dome-head trunnion & center-support rivets on both flanks!
  const rivetPositions: [number, number][] = [
    [5.35, 0.85],
    [4.55, 0.25],
    [4.25, -0.32],
    [0.35, -0.35],
    [-5.45, 0.88],
    [-5.55, -0.15],
  ];
  const rivets: THREE.BufferGeometry[] = [];
  for (const [rx, ry] of rivetPositions) {
    for (const side of [-1, 1]) {
      rivets.push(
        paintGeometry(
          new THREE.SphereGeometry(0.12, 12, 10)
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
    railL,
    railR,
    ejectorFin,
    rearBlock,
    hingeKnuckleL,
    coverPinBoss,
    ...rivets,
  ]);
  return applyAkReceiverUVs(merged);
}

/**
 * R-02: 415mm Cold-Hammer-Forged Chrome-Lined 7.62×39mm Barrel (assembledPos: [0, 1.05, 0])
 */
export function buildAkBarrelGeometry(): THREE.BufferGeometry {
  const BARREL_STEEL = '#2b3340';
  const CHROME_CHAMBER = '#dbe4ee';

  // Stepped outer profile revolved around X axis using LatheGeometry
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.32, 3.85),
    new THREE.Vector2(0.61, 3.85), // Breech face & chamber journal
    new THREE.Vector2(0.61, 6.05),
    new THREE.Vector2(0.51, 6.35), // Chamber taper
    new THREE.Vector2(0.45, 10.5), // Rear contour under free-float handguard
    new THREE.Vector2(0.43, 15.55),
    new THREE.Vector2(0.48, 15.65), // 90° Gas-block journal
    new THREE.Vector2(0.48, 17.95),
    new THREE.Vector2(0.39, 18.05), // Forward barrel section
    new THREE.Vector2(0.39, 22.65),
    new THREE.Vector2(0.35, 22.7), // Muzzle spigot inside flash hider
    new THREE.Vector2(0.35, 23.45),
    new THREE.Vector2(0.24, 23.45),
  ];
  const outer = new THREE.LatheGeometry(pts, 28);
  outer.rotateZ(-Math.PI / 2);
  paintGeometry(outer, BARREL_STEEL);

  // Hollow 7.62mm bore + 7.62x39mm chamber cavity
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 20.4, 20)
      .rotateZ(Math.PI / 2)
      .translate(13.8, 0, 0),
    AK_INNER_DARK
  );
  const chamber = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.35, 2.4, 20)
      .rotateZ(Math.PI / 2)
      .translate(4.95, 0, 0),
    AK_INNER_DARK
  );
  // Extractor clearance cut on right breech face + gas port hole at X = 16.7
  const gasPort = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.55, 12).translate(16.7, 0.38, 0),
    AK_INNER_DARK
  );

  const hollowed = csgSubtract(outer, [bore, chamber, gasPort]);

  // Polished chrome-lined breech feed collar
  const chromeCollar = paintGeometry(
    new THREE.TorusGeometry(0.39, 0.065, 10, 24)
      .rotateY(Math.PI / 2)
      .translate(3.87, 0, 0),
    CHROME_CHAMBER
  );

  return mergeParts([hollowed, chromeCollar]);
}

/**
 * R-03: 2023 Fixed Slotted Birdcage Flash Suppressor w/ QD Suppressor Mount Grooves (assembledPos: [24.2, 1.05, 0])
 */
export function buildAkMuzzleDeviceGeometry(): THREE.BufferGeometry {
  // Rear QD suppressor collar + forward birdcage body
  const rearCollar = paintGeometry(
    new THREE.CylinderGeometry(0.57, 0.55, 1.25, 28)
      .rotateZ(Math.PI / 2)
      .translate(-0.95, 0, 0),
    AK_DARK_STEEL
  );
  const cageBody = paintGeometry(
    new THREE.CylinderGeometry(0.51, 0.53, 2.05, 28)
      .rotateZ(Math.PI / 2)
      .translate(0.65, 0, 0),
    AK_DARK_STEEL
  );
  // QD Suppressor alignment ring & locking lug
  const lockRing = paintGeometry(
    new THREE.TorusGeometry(0.59, 0.055, 10, 28)
      .rotateY(Math.PI / 2)
      .translate(-0.55, 0, 0),
    AK_BRIGHT_STEEL
  );
  const qdLug = paintGeometry(
    new THREE.BoxGeometry(0.36, 0.24, 0.24).translate(-1.15, -0.56, 0),
    AK_DARK_STEEL
  );

  const raw = csgUnion([rearCollar, cageBody]);

  // Bore + 5 longitudinal birdcage flash-suppression slots around upper 240° arc (closed bottom eliminates dust kickup!)
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.37, 0.37, 3.6, 22)
        .rotateZ(Math.PI / 2)
        .translate(0.1, 0, 0),
      AK_INNER_DARK
    ),
  ];

  const slotAngles = [-1.65, -0.82, 0, 0.82, 1.65];
  for (const ang of slotAngles) {
    const cutter = paintGeometry(
      new THREE.BoxGeometry(1.38, 0.65, 0.16)
        .translate(0.65, 0.42, 0)
        .rotateX(ang),
      AK_INNER_DARK
    );
    cutters.push(cutter);
  }

  const slotted = csgSubtract(raw, cutters);
  return mergeParts([slotted, lockRing, qdLug]);
}

/**
 * R-04: 90° Vertical Gas Block & Hooded Front Sight Combination (assembledPos: [16.7, 1.05, 0])
 */
export function buildAkGasBlockGeometry(): THREE.BufferGeometry {
  // Lower barrel sleeve + vertical 90° gas block tower + upper gas piston cup + hooded sight ears
  const barrelSleeve = paintGeometry(
    new THREE.CylinderGeometry(0.64, 0.64, 2.25, 26)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    AK_DARK_STEEL
  );
  const verticalWeb = paintGeometry(
    new THREE.BoxGeometry(1.85, 1.45, 0.78).translate(-0.05, 0.72, 0),
    AK_DARK_STEEL
  );
  const gasCup = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.56, 2.15, 26)
      .rotateZ(Math.PI / 2)
      .translate(-0.12, 1.3, 0),
    AK_DARK_STEEL
  );
  // Protective circular AK front-sight hood on top of gas block!
  const sightTower = paintGeometry(
    new THREE.BoxGeometry(0.92, 0.65, 0.66).translate(0.15, 1.85, 0),
    AK_DARK_STEEL
  );
  const sightHoodOuter = paintGeometry(
    new THREE.CylinderGeometry(0.48, 0.48, 0.76, 24)
      .rotateZ(Math.PI / 2)
      .translate(0.15, 2.36, 0),
    AK_DARK_STEEL
  );
  // Underside accessory / bayonet lug
  const bottomLug = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.42, 0.46).translate(0.1, -0.72, 0),
    AK_DARK_STEEL
  );

  const solid = csgUnion([
    barrelSleeve,
    verticalWeb,
    gasCup,
    sightTower,
    sightHoodOuter,
    bottomLug,
  ]);

  // Cut barrel bore, gas chamber socket, and hollow sight hood tunnel!
  const barrelHole = paintGeometry(
    new THREE.CylinderGeometry(0.49, 0.49, 2.6, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    AK_INNER_DARK
  );
  const gasSocket = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 1.6, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.65, 1.3, 0),
    AK_INNER_DARK
  );
  const hoodTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.37, 0.37, 0.95, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.15, 2.36, 0),
    AK_INNER_DARK
  );

  const carved = csgSubtract(solid, [barrelHole, gasSocket, hoodTunnel]);

  // Crisp vertical adjustable front sight post + cross pins + windage drum!
  const sightPost = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.07, 0.44, 12).translate(0.15, 2.24, 0),
    AK_BRIGHT_STEEL
  );
  const windageDrum = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 0.78, 16)
      .rotateX(Math.PI / 2)
      .translate(0.15, 1.98, 0),
    AK_BRIGHT_STEEL
  );
  const pin1 = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.92, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.55, -0.38, 0),
    AK_BRIGHT_STEEL
  );
  const pin2 = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.92, 12)
      .rotateX(Math.PI / 2)
      .translate(0.55, -0.38, 0),
    AK_BRIGHT_STEEL
  );

  return mergeParts([carved, sightPost, windageDrum, pin1, pin2]);
}

/**
 * R-05: Reinforced Free-Float Polymer Lower Handguard w/ Cooling Vents, Heatshield & Bottom Picatinny Rail
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

  // Hollow interior U-channel so barrel floats freely + 4 elongated side cooling vents!
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(9.9, 1.52, 1.38).translate(0, 0.34, 0),
      AK_POLYMER_ACCENT
    ),
  ];

  for (const vx of [-2.85, -1.1, 0.65, 2.4]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.18, 0.32, 2.2).translate(vx, 0.24, 0),
        AK_POLYMER_ACCENT
      )
    );
  }

  const body = csgSubtract(raw, cutters);

  // Inner brushed aluminum thermal heatshield visible behind cooling vents!
  const heatShieldL = paintGeometry(
    new THREE.BoxGeometry(7.6, 0.62, 0.05).translate(-0.2, 0.22, -0.72),
    '#94a3b8'
  );
  const heatShieldR = paintGeometry(
    new THREE.BoxGeometry(7.6, 0.62, 0.05).translate(-0.2, 0.22, 0.72),
    '#94a3b8'
  );

  // Bottom MIL-STD-1913 Picatinny Rail + 11 cross-slots + forward side M-LOK / Picatinny bosses
  const subParts: THREE.BufferGeometry[] = [body, heatShieldL, heatShieldR];
  const railSpine = paintGeometry(
    new THREE.BoxGeometry(8.6, 0.14, 0.78).translate(0.1, -0.94, 0),
    AK_POLYMER
  );
  subParts.push(railSpine);

  for (let i = 0; i < 11; i++) {
    const rx = -3.6 + i * 0.76;
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.42, 0.16, 0.94).translate(rx, -1.04, 0),
        AK_POLYMER_ACCENT
      )
    );
  }

  // Forward short side rail mounts (left & right)
  for (const side of [-1, 1]) {
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(2.35, 0.44, 0.16).translate(
          3.15,
          0.22,
          side * 1.02
        ),
        AK_POLYMER_ACCENT
      )
    );
  }

  return mergeParts(subParts);
}

/**
 * R-06: 2023 EVO Solid-Body Folding & Telescoping Buttstock (assembledPos: [-12.35, 0.45, 0])
 */
export function buildAkButtstockGeometry(): THREE.BufferGeometry {
  // Side silhouette in (X, Y) of the 2023 Kalashnikov EVO ergonomic folding stock
  const stockShape = new THREE.Shape();
  stockShape.moveTo(6.1, 1.02); // Front top at receiver hinge
  stockShape.lineTo(-5.65, 0.98); // Straight inline comb
  stockShape.lineTo(-5.85, -2.85); // Rear buttplate line
  stockShape.lineTo(-4.85, -2.92); // Toe
  stockShape.quadraticCurveTo(-2.2, -1.65, 1.85, -0.68); // Angled lower strut
  stockShape.lineTo(6.1, -0.58); // Front bottom at hinge
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

  // Lightening triangular recess / sling window inside EVO stock body + LOP latch recess
  const triangleWindow = paintGeometry(
    new THREE.BoxGeometry(3.4, 0.85, 1.6)
      .rotateZ(0.24)
      .translate(-2.35, -0.65, 0),
    AK_POLYMER_ACCENT
  );
  const sideFluteL = paintGeometry(
    new THREE.BoxGeometry(6.8, 0.48, 0.24).translate(0.9, 0.35, -0.68),
    AK_POLYMER_ACCENT
  );
  const sideFluteR = paintGeometry(
    new THREE.BoxGeometry(6.8, 0.48, 0.24).translate(0.9, 0.35, 0.68),
    AK_POLYMER_ACCENT
  );

  const sculptedBody = csgSubtract(rawStock, [
    triangleWindow,
    sideFluteL,
    sideFluteR,
  ]);

  // Ribbed shock-absorbing rubber buttpad at X = -6.02
  const buttpad = paintGeometry(
    new THREE.BoxGeometry(0.52, 3.92, 1.38).translate(-5.96, -0.95, 0),
    AK_RUBBER
  );

  // Front steel folding hinge block + stainless QD sling swivel sockets on both sides!
  const hingePlate = paintGeometry(
    new THREE.BoxGeometry(0.48, 1.72, 1.44).translate(5.98, 0.22, 0),
    AK_DARK_STEEL
  );
  const qdCupR = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 1.42, 18)
      .rotateX(Math.PI / 2)
      .translate(-4.35, -1.65, 0),
    AK_BRIGHT_STEEL
  );
  const lopLatch = paintGeometry(
    new THREE.BoxGeometry(1.65, 0.32, 0.76).translate(2.45, -0.74, 0),
    AK_POLYMER_ACCENT
  );

  return mergeParts([sculptedBody, buttpad, hingePlate, qdCupR, lopLatch]);
}

/**
 * R-07: Model 2023 Elevated Saddle Cheek Riser (assembledPos: [-11.8, 1.62, 0])
 */
export function buildAkCheekRiserGeometry(): THREE.BufferGeometry {
  // Inverted U-saddle wrapping over the top comb of the EVO buttstock
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

  const saddle = new THREE.ExtrudeGeometry(profile, {
    depth: 5.1,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  saddle.rotateY(Math.PI / 2);
  saddle.translate(-2.55, 0, 0);
  paintGeometry(saddle, AK_POLYMER);

  // Knurled steel locking cross-bolt
  const lockKnob = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 1.72, 18)
      .rotateX(Math.PI / 2)
      .translate(0.35, -0.26, 0),
    AK_DARK_STEEL
  );

  return mergeParts([saddle, lockKnob]);
}

/**
 * R-08: Monolithic Ergonomic Pistol Grip, Gloved Trigger Guard & Paddle Mag Catch (assembledPos: [-3.2, -0.88, 0])
 */
export function buildAkPistolGripGeometry(): THREE.BufferGeometry {
  // Authentic ~22-deg swept-back AK-15/AK-12 ergonomic pistol grip with rear beavertail & front finger swells
  const gripShape = new THREE.Shape();
  gripShape.moveTo(-2.15, 0.06);
  gripShape.lineTo(0.28, 0.06);
  // Front finger-swell contour sweeping backward (-X) as it descends (-Y)
  gripShape.quadraticCurveTo(0.12, -0.78, -0.36, -1.55);
  gripShape.quadraticCurveTo(-0.48, -2.25, -0.98, -3.15);
  gripShape.quadraticCurveTo(-1.32, -4.05, -1.92, -5.12);
  // Angled storage trapdoor base
  gripShape.lineTo(-3.88, -4.85);
  // Swept-back rear palm spine rising cleanly into upper beavertail web
  gripShape.quadraticCurveTo(-3.45, -3.55, -2.85, -2.15);
  gripShape.quadraticCurveTo(-2.28, -0.88, -2.15, 0.06);
  gripShape.closePath();

  const gripBody = new THREE.ExtrudeGeometry(gripShape, {
    depth: 1.16,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 3,
  });
  gripBody.translate(0, 0, -0.58);
  paintGeometry(gripBody, AK_POLYMER);

  // Baseplate cap (oil-bottle storage trapdoor perpendicular to 22-deg grip axis)
  const gripCap = paintGeometry(
    new THREE.BoxGeometry(2.05, 0.24, 1.28)
      .rotateZ(-0.14)
      .translate(-2.9, -5.02, 0),
    AK_POLYMER_ACCENT
  );

  // Integrated enlarged gloved polymer trigger guard loop extending forward to X_local = +3.55!
  const guardOuter = paintGeometry(
    new THREE.BoxGeometry(3.35, 1.65, 0.72).translate(1.82, -0.78, 0),
    AK_POLYMER
  );
  const guardHole = paintGeometry(
    new THREE.BoxGeometry(2.58, 1.24, 1.1).translate(1.75, -0.68, 0),
    AK_POLYMER_ACCENT
  );
  const triggerGuard = csgSubtract(guardOuter, [guardHole]);

  // Iconic Kalashnikov central steel Paddle Magazine Release Lever + housing ahead of trigger guard!
  const magCatchHousing = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.65, 0.86).translate(3.65, -0.28, 0),
    AK_DARK_STEEL
  );
  const magPaddle = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.95, 0.68)
      .rotateZ(0.28)
      .translate(3.72, -0.82, 0),
    AK_DARK_STEEL
  );
  const catchPin = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 1.02, 12)
      .rotateX(Math.PI / 2)
      .translate(3.65, -0.32, 0),
    AK_BRIGHT_STEEL
  );

  return mergeParts([
    gripBody,
    gripCap,
    triggerGuard,
    magCatchHousing,
    magPaddle,
    catchPin,
  ]);
}
