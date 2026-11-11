import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from './springHelper';
import { applyAkCarrierUVs } from './ak15UvAtlasHelper';

const AK_DARK_STEEL = '#28303b';
const AK_INNER_DARK = '#151922';
const AK_BRIGHT_STEEL = '#d8e0ea';
const AK_PISTON_STEEL = '#e2e8f0';
const AK_SPRING_METAL = '#94a3b8';
const AK_POLYMER = '#20242c';
const AK_POLYMER_ACCENT = '#171a21';

/**
 * B-01: Railed Stamped Receiver Top Cover w/ Right Ejection Cutout & 2023 Cross-Lock (assembledPos: [-0.1, 2.22, 0])
 */
export function buildAkDustCoverGeometry(): THREE.BufferGeometry {
  // Inverted U-arch cross section in (Z, Y) extruded along X ∈ [-6.05, +6.05]
  const arch = new THREE.Shape();
  arch.moveTo(-0.84, -0.68);
  arch.lineTo(-0.84, 0.18);
  arch.quadraticCurveTo(-0.82, 0.62, -0.45, 0.66);
  arch.lineTo(0.45, 0.66);
  arch.quadraticCurveTo(0.82, 0.62, 0.84, 0.18);
  arch.lineTo(0.84, -0.68);
  arch.closePath();

  const outerCover = new THREE.ExtrudeGeometry(arch, {
    depth: 12.1,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  outerCover.rotateY(Math.PI / 2);
  outerCover.translate(-6.05, 0, 0);
  paintGeometry(outerCover, AK_DARK_STEEL);

  // Hollow interior + wide right-side ejection & charging-handle slot!
  const innerCut = paintGeometry(
    new THREE.BoxGeometry(11.75, 1.24, 1.42).translate(0, -0.18, 0),
    AK_INNER_DARK
  );
  const ejectionPort = paintGeometry(
    new THREE.BoxGeometry(4.75, 0.92, 0.95).translate(2.85, -0.28, 0.56),
    AK_INNER_DARK
  );

  const coverShell = csgSubtract(outerCover, [innerCut, ejectionPort]);

  // Stamped strengthening ribs on left & rear flanks + full-length MIL-STD-1913 Picatinny Top Rail!
  const subParts: THREE.BufferGeometry[] = [coverShell];

  for (const rx of [-3.6, -1.4, 0.8]) {
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.28, 0.58, 1.72).translate(rx, -0.12, 0),
        AK_DARK_STEEL
      )
    );
  }

  // Picatinny rail spine + 15 recoil cross lugs along top (Y_local = +0.74..+0.88)
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(11.9, 0.14, 0.78).translate(0, 0.72, 0),
      AK_DARK_STEEL
    )
  );
  for (let i = 0; i < 15; i++) {
    const lx = -5.45 + i * 0.78;
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.44, 0.15, 0.94).translate(lx, 0.82, 0),
        AK_INNER_DARK
      )
    );
  }

  // Front hinge ears + 2023 rear cross-pin retention tab
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.65, 0.52, 1.54).translate(5.95, 0.35, 0),
      AK_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.65, 0.75, 1.66).translate(-5.85, -0.35, 0),
      AK_DARK_STEEL
    )
  );

  return mergeParts(subParts);
}

/**
 * B-02: Model 2023 Compact Flip-Aperture All-Weather Diopter Rear Sight (assembledPos: [-4.65, 3.32, 0])
 */
export function buildAkRearSightGeometry(): THREE.BufferGeometry {
  const clampBase = paintGeometry(
    new THREE.BoxGeometry(1.38, 0.34, 1.06).translate(0, -0.12, 0),
    AK_DARK_STEEL
  );
  const earL = paintGeometry(
    new THREE.BoxGeometry(0.76, 0.54, 0.14).translate(-0.08, 0.24, -0.42),
    AK_DARK_STEEL
  );
  const earR = paintGeometry(
    new THREE.BoxGeometry(0.76, 0.54, 0.14).translate(-0.08, 0.24, 0.42),
    AK_DARK_STEEL
  );

  // Peep diopter ring with true center aperture hole
  const ringOuter = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.14, 20)
      .rotateZ(Math.PI / 2)
      .translate(-0.08, 0.28, 0),
    AK_DARK_STEEL
  );
  const peepHole = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.32, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.08, 0.28, 0),
    AK_INNER_DARK
  );
  const aperture = csgSubtract(ringOuter, [peepHole]);

  const windageKnob = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 1.28, 18)
      .rotateX(Math.PI / 2)
      .translate(-0.08, 0.04, 0),
    AK_BRIGHT_STEEL
  );

  return mergeParts([clampBase, earL, earR, aperture, windageKnob]);
}

/**
 * B-03: Bolt Carrier + Integrated Long-Stroke Gas Piston (assembledPos: [1.6, 1.55, 0])
 */
export function buildAkBoltCarrierGeometry(): THREE.BufferGeometry {
  // Heavy carrier body X ∈ [-2.85, +2.85], Y ∈ [-0.62, +0.62], Z ∈ [-0.62, +0.62]
  const rawCarrier = paintGeometry(
    new THREE.BoxGeometry(5.65, 1.18, 1.18).translate(0, -0.05, 0),
    AK_DARK_STEEL
  );
  // Upper cylindrical tower housing the recoil spring & rear of gas piston at Y_local = +0.58..+0.80
  const upperTower = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.48, 5.45, 24)
      .rotateZ(Math.PI / 2)
      .translate(0.05, 0.68, 0),
    AK_DARK_STEEL
  );
  const carrierUnion = csgUnion([rawCarrier, upperTower]);

  // Hollow bolt stem tunnel + diagonal cam slot + recoil spring rear blind bore
  const boltTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 4.8, 20)
      .rotateZ(Math.PI / 2)
      .translate(0.55, -0.45, 0),
    AK_INNER_DARK
  );
  const camSlot = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.38, 0.65)
      .rotateY(0.48)
      .translate(1.35, -0.12, 0.32),
    AK_INNER_DARK
  );
  const recoilHole = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 4.6, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.7, 0.32, 0),
    AK_INNER_DARK
  );
  const sculptedCarrier = csgSubtract(carrierUnion, [
    boltTunnel,
    camSlot,
    recoilHole,
  ]);

  // Iconic Kalashnikov right-side upturned Charging Handle at X_local = +1.85, Z = +0.6..+1.48!
  const handleStem = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.28, 0.78).translate(1.85, -0.08, 0.88),
    AK_DARK_STEEL
  );
  const handleTip = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.24, 0.68, 18)
      .rotateZ(-0.35)
      .translate(1.88, 0.16, 1.32),
    AK_DARK_STEEL
  );

  // Gleaming Chrome-Plated Stainless Long-Stroke Gas Piston Rod & Ribbed Head (X_local ∈ [+2.8, +13.7], Y_local = +0.80)!
  const pistonPts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 2.75),
    new THREE.Vector2(0.32, 2.75), // Rear threaded collar
    new THREE.Vector2(0.32, 3.55),
    new THREE.Vector2(0.23, 3.75), // Fluted slender shaft
    new THREE.Vector2(0.23, 11.75),
    new THREE.Vector2(0.37, 12.05), // Piston head expansion land 1
    new THREE.Vector2(0.37, 12.32),
    new THREE.Vector2(0.3, 12.36), // Gas seal ring groove 1
    new THREE.Vector2(0.3, 12.48),
    new THREE.Vector2(0.37, 12.52), // Land 2
    new THREE.Vector2(0.37, 12.76),
    new THREE.Vector2(0.3, 12.8), // Gas seal ring groove 2
    new THREE.Vector2(0.3, 12.92),
    new THREE.Vector2(0.38, 12.96), // Front piston head
    new THREE.Vector2(0.38, 13.68),
    new THREE.Vector2(0.18, 13.52), // Concave gas-cup face!
    new THREE.Vector2(0.0, 13.48),
  ];
  const pistonLathe = new THREE.LatheGeometry(pistonPts, 24);
  pistonLathe.rotateZ(-Math.PI / 2);
  pistonLathe.translate(0, 0.8, 0);
  paintGeometry(pistonLathe, AK_PISTON_STEEL);

  const merged = mergeParts([
    sculptedCarrier,
    handleStem,
    handleTip,
    pistonLathe,
  ]);
  return applyAkCarrierUVs(merged);
}

/**
 * B-04: 2-Lug Kalashnikov Rotating Bolt Head (assembledPos: [2.85, 1.05, 0])
 */
export function buildAkBoltGeometry(): THREE.BufferGeometry {
  // Cylindrical bolt stem + wide bolt head + left/right opposing locking lugs + top rotary cam lug!
  const stem = paintGeometry(
    new THREE.CylinderGeometry(0.31, 0.31, 3.15, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.1, 0, 0),
    AK_BRIGHT_STEEL
  );
  const boltHead = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.45, 0.88, 24)
      .rotateZ(Math.PI / 2)
      .translate(1.12, 0, 0),
    AK_BRIGHT_STEEL
  );
  // Two heavy opposing locking lugs (Left & Right) + top cam lug
  const lugLeft = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.36, 0.34).translate(1.08, 0.04, -0.52),
    AK_BRIGHT_STEEL
  );
  const lugRight = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.36, 0.34).translate(1.08, -0.04, 0.52),
    AK_BRIGHT_STEEL
  );
  const camLug = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.17, 0.46, 16).translate(0.68, 0.48, 0.14),
    AK_BRIGHT_STEEL
  );
  // Bottom cartridge feed stripper rib
  const feedRib = paintGeometry(
    new THREE.BoxGeometry(0.92, 0.24, 0.22).translate(1.05, -0.48, 0),
    AK_BRIGHT_STEEL
  );

  const solid = mergeParts([
    stem,
    boltHead,
    lugLeft,
    lugRight,
    camLug,
    feedRib,
  ]);

  // Recessed bolt face + ejector longitudinal slot on left side
  const faceCup = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 0.18, 20)
      .rotateZ(Math.PI / 2)
      .translate(1.52, 0, 0),
    AK_INNER_DARK
  );
  return csgSubtract(solid, [faceCup]);
}

/**
 * B-05: Free-Floating Fluted Firing Pin (assembledPos: [2.68, 1.05, 0])
 */
export function buildAkFiringPinGeometry(): THREE.BufferGeometry {
  const rearHead = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 0.55, 16)
      .rotateZ(Math.PI / 2)
      .translate(-1.45, 0, 0),
    AK_BRIGHT_STEEL
  );
  const midBody = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.11, 2.25, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.05, 0, 0),
    AK_BRIGHT_STEEL
  );
  const strikerTip = paintGeometry(
    new THREE.CylinderGeometry(0.04, 0.095, 0.68, 16)
      .rotateZ(Math.PI / 2)
      .translate(1.4, 0, 0),
    AK_BRIGHT_STEEL
  );
  return mergeParts([rearHead, midBody, strikerTip]);
}

/**
 * B-06: Heavy Claw Extractor & Coil Spring (assembledPos: [4.0, 1.08, 0.34])
 */
export function buildAkExtractorGeometry(): THREE.BufferGeometry {
  const clawBody = paintGeometry(
    new THREE.BoxGeometry(0.96, 0.26, 0.22).translate(-0.08, 0, 0),
    AK_DARK_STEEL
  );
  const hookNose = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.3, 0.32).translate(0.42, 0, -0.06),
    AK_DARK_STEEL
  );
  const miniSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.75,
      end: -0.25,
      centerY: 0,
      centerZ: 0.05,
      coilRadius: 0.08,
      wireRadius: 0.022,
      coils: 5,
    }),
    AK_SPRING_METAL
  );
  return mergeParts([clawBody, hookNose, miniSpring]);
}

/**
 * B-07: Telescoping Dual-Tube Recoil Spring Guide & 2023 Buffer Pad (assembledPos: [-2.1, 1.85, 0])
 */
export function buildAkRecoilGuideGeometry(): THREE.BufferGeometry {
  // Rear trunnion locking heel + polymer shock buffer + outer & inner telescoping guide rods
  const rearHeel = paintGeometry(
    new THREE.BoxGeometry(0.78, 0.86, 0.64).translate(-3.75, -0.14, 0),
    AK_DARK_STEEL
  );
  const bufferPad = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.94, 0.88).translate(-3.26, -0.12, 0),
    '#334155'
  );
  const outerTube = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 3.85, 16)
      .rotateZ(Math.PI / 2)
      .translate(-1.35, 0, 0),
    AK_BRIGHT_STEEL
  );
  const innerRod = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 4.15, 16)
      .rotateZ(Math.PI / 2)
      .translate(2.45, 0, 0),
    AK_BRIGHT_STEEL
  );
  const stopRing = paintGeometry(
    new THREE.CylinderGeometry(0.25, 0.25, 0.16, 16)
      .rotateZ(Math.PI / 2)
      .translate(-3.05, 0, 0),
    AK_DARK_STEEL
  );
  return mergeParts([rearHeel, bufferPad, outerTube, innerRod, stopRing]);
}

/**
 * B-08: Braided Helical Recoil Spring (assembledPos: [0, 1.85, 0], spans local X ∈ [-5.6, +3.6])
 */
export function buildAkRecoilSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: -5.6,
    end: 3.6,
    centerY: 0,
    centerZ: 0,
    coilRadius: 0.25,
    wireRadius: 0.048,
    coils: 24,
    radialSegments: 8,
    tubularSegmentsPerCoil: 16,
  });
  return paintGeometry(spring, AK_SPRING_METAL);
}

/**
 * B-09: Polymer Upper Handguard Heatshield w/ Continuous Top Picatinny Rail (assembledPos: [10.55, 2.38, 0])
 */
export function buildAkUpperHandguardGeometry(): THREE.BufferGeometry {
  const arch = new THREE.Shape();
  arch.moveTo(-0.88, -0.58);
  arch.lineTo(-0.88, 0.16);
  arch.quadraticCurveTo(-0.84, 0.48, -0.45, 0.52);
  arch.lineTo(0.45, 0.52);
  arch.quadraticCurveTo(0.84, 0.48, 0.88, 0.16);
  arch.lineTo(0.88, -0.58);
  arch.closePath();

  const raw = new THREE.ExtrudeGeometry(arch, {
    depth: 9.05,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 2,
  });
  raw.rotateY(Math.PI / 2);
  raw.translate(-4.525, 0, 0);
  paintGeometry(raw, AK_POLYMER);

  const innerTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.62, 9.5, 22)
      .rotateZ(Math.PI / 2)
      .translate(0, -0.16, 0),
    AK_POLYMER_ACCENT
  );
  const vents: THREE.BufferGeometry[] = [innerTunnel];
  for (const vx of [-2.4, 0, 2.4]) {
    vents.push(
      paintGeometry(
        new THREE.BoxGeometry(1.15, 0.24, 2.1).translate(vx, -0.1, 0),
        AK_POLYMER_ACCENT
      )
    );
  }
  const body = csgSubtract(raw, vents);

  // Flush top MIL-STD-1913 Picatinny rail + 11 recoil lugs matching Dust Cover height!
  const parts: THREE.BufferGeometry[] = [
    body,
    paintGeometry(
      new THREE.BoxGeometry(8.95, 0.12, 0.78).translate(0, 0.56, 0),
      AK_POLYMER
    ),
  ];
  for (let i = 0; i < 11; i++) {
    const lx = -3.8 + i * 0.76;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.42, 0.14, 0.94).translate(lx, 0.66, 0),
        AK_POLYMER_ACCENT
      )
    );
  }
  return mergeParts(parts);
}

/**
 * B-10: Fluted Steel Gas Tube & Front Cleanout Plug (assembledPos: [10.8, 2.35, 0])
 */
export function buildAkGasTubeGeometry(): THREE.BufferGeometry {
  const outer = paintGeometry(
    new THREE.CylinderGeometry(0.49, 0.49, 9.75, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    AK_DARK_STEEL
  );
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.4, 0.4, 10.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    AK_INNER_DARK
  );
  const tube = csgSubtract(outer, [bore]);

  // Rear mounting collar + front knurled gas cleanout plug
  const rearCollar = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.56, 0.75, 24)
      .rotateZ(Math.PI / 2)
      .translate(-4.65, 0, 0),
    AK_DARK_STEEL
  );
  const cleanoutPlug = paintGeometry(
    new THREE.CylinderGeometry(0.54, 0.54, 0.62, 20)
      .rotateZ(Math.PI / 2)
      .translate(5.05, 0, 0),
    AK_BRIGHT_STEEL
  );
  return mergeParts([tube, rearCollar, cleanoutPlug]);
}
