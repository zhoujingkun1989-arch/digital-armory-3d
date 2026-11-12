import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import { applyAkCarrierUVs } from './ak15UvAtlasHelper';

const AK_DARK_STEEL = '#454f5e';
const AK_STEEL_HIGHLIGHT = '#586476';
const AK_ANODIZED_BODY = '#3d4654';
const AK_RAIL_FLAT = '#566275';
const AK_RAIL_SLOT = '#262c36';
const AK_INNER_DARK = '#252b35';
const AK_BRIGHT_STEEL = '#d8e0ea';
const AK_PISTON_STEEL = '#e2e8f0';
const AK_SPRING_METAL = '#94a3b8';
const AK_POLYMER = '#323842';
const AK_POLYMER_ACCENT = '#282d36';

/**
 * Shared MIL-STD-1913 Picatinny top rail builder with true 45° hexagonal dovetail & CSG recoil cross-slots
 */
function buildTopPicatinnyRail(opts: {
  length: number;
  centerX: number;
  baseY: number;
  slotCount: number;
  bodyColor: string;
  slotColor: string;
}): THREE.BufferGeometry {
  const { length, centerX, baseY, slotCount, bodyColor, slotColor } = opts;

  const prof = new THREE.Shape();
  prof.moveTo(-0.37, 0);
  prof.lineTo(-0.37, 0.07);
  prof.lineTo(-0.49, 0.16);
  prof.lineTo(-0.38, 0.25);
  prof.lineTo(-0.12, 0.25);
  prof.lineTo(-0.09, 0.205);
  prof.lineTo(0.09, 0.205);
  prof.lineTo(0.12, 0.25);
  prof.lineTo(0.38, 0.25);
  prof.lineTo(0.49, 0.16);
  prof.lineTo(0.37, 0.07);
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
        new THREE.BoxGeometry(0.28, 0.15, 1.12).translate(sx, baseY + 0.205, 0),
        slotColor
      )
    );
  }
  return csgSubtract(raw, [mergeParts(cutters)]);
}

/**
 * B-01: Hinged Railed Stamped Receiver Top Cover w/ Crisp MIL-STD-1913 Picatinny Rail
 * & Rear Spring-Loaded Takedown Cam Latch (assembledPos: [-0.1, 2.22, 0])
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
  paintGeometry(outerCover, AK_ANODIZED_BODY);

  // Hollow 1.5mm interior + wide right-side ejection & charging-handle cutout!
  const innerCut = paintGeometry(
    new THREE.BoxGeometry(11.78, 1.25, 1.44).translate(0, -0.18, 0),
    AK_INNER_DARK
  );
  const ejectionPort = paintGeometry(
    new THREE.BoxGeometry(4.78, 0.94, 0.96).translate(2.85, -0.28, 0.56),
    AK_INNER_DARK
  );
  const rearPinHole = paintGeometry(
    new THREE.CylinderGeometry(0.19, 0.19, 1.95, 16)
      .rotateX(Math.PI / 2)
      .translate(-5.55, -0.82, 0),
    AK_INNER_DARK
  );

  const coverShell = csgSubtract(outerCover, [
    innerCut,
    ejectionPort,
    rearPinHole,
  ]);

  // True full-length MIL-STD-1913 Picatinny Top Rail w/ 17 crisp recoil slots (top at Y_local = +0.90 => world Y = 3.12!)
  const topRail = buildTopPicatinnyRail({
    length: 11.95,
    centerX: 0,
    baseY: 0.65,
    slotCount: 17,
    bodyColor: AK_RAIL_FLAT,
    slotColor: AK_RAIL_SLOT,
  });

  const subParts: THREE.BufferGeometry[] = [coverShell, topRail];

  // Stamped Kalashnikov side rigidity ribs on left & rear flanks + rolled ejection port flare
  for (const rx of [-3.85, -1.75, 0.15]) {
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.26, 0.62, 0.07).translate(rx, -0.14, -0.86),
        AK_STEEL_HIGHLIGHT
      )
    );
  }
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.26, 0.62, 0.07).translate(-3.85, -0.14, 0.86),
      AK_STEEL_HIGHLIGHT
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.26, 0.62, 0.07).translate(-1.75, -0.14, 0.86),
      AK_STEEL_HIGHLIGHT
    ),
    // Rolled brass-deflector lip at rear of ejection port
    paintGeometry(
      new THREE.BoxGeometry(0.18, 0.72, 0.12).translate(0.42, -0.24, 0.85),
      AK_STEEL_HIGHLIGHT
    )
  );

  // Front forged hinge clevis arms & pivot pin engaging rear sight / gas-tube block
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.72, 0.48, 0.24).translate(6.18, 0.22, -0.58),
      AK_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.72, 0.48, 0.24).translate(6.18, 0.22, 0.58),
      AK_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.12, 0.12, 1.46, 14)
        .rotateX(Math.PI / 2)
        .translate(6.36, 0.16, 0),
      AK_BRIGHT_STEEL
    )
  );

  // Rear 6P71M spring-loaded takedown cam latch & rotary cross-lock lever on right rear flank!
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.74, 0.78, 1.66).translate(-5.78, -0.42, 0),
      AK_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 0.14, 18)
        .rotateX(Math.PI / 2)
        .translate(-5.55, -0.52, 0.88),
      AK_DARK_STEEL
    ),
    // Rotary cam latch lever arm w/ thumb tab
    paintGeometry(
      new THREE.BoxGeometry(0.86, 0.22, 0.1)
        .rotateZ(0.24)
        .translate(-5.18, -0.44, 0.94),
      AK_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12)
        .rotateX(Math.PI / 2)
        .translate(-4.78, -0.34, 0.98),
      AK_BRIGHT_STEEL
    )
  );

  return mergeParts(subParts);
}

/**
 * B-02: Model 2023 Compact Flip-Aperture All-Weather Diopter Rear Sight (assembledPos: [-4.65, 3.32, 0])
 */
export function buildAkRearSightGeometry(): THREE.BufferGeometry {
  // M1913 dovetail clamp base w/ cross-bolt & hex nut
  const clampRaw = paintGeometry(
    new THREE.BoxGeometry(1.42, 0.36, 1.08).translate(0, -0.14, 0),
    AK_DARK_STEEL
  );
  const railGroove = paintGeometry(
    new THREE.BoxGeometry(1.5, 0.16, 0.82).translate(0, -0.28, 0),
    AK_INNER_DARK
  );
  const clampBase = csgSubtract(clampRaw, [railGroove]);

  const crossBolt = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 1.24, 14)
      .rotateX(Math.PI / 2)
      .translate(0.28, -0.12, 0),
    AK_BRIGHT_STEEL
  );
  const hexNut = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.12, 6)
      .rotateX(Math.PI / 2)
      .translate(0.28, -0.12, -0.58),
    AK_DARK_STEEL
  );

  // Protective serrated sight ears
  const earL = paintGeometry(
    new THREE.BoxGeometry(0.82, 0.58, 0.14).translate(-0.08, 0.24, -0.43),
    AK_STEEL_HIGHLIGHT
  );
  const earR = paintGeometry(
    new THREE.BoxGeometry(0.82, 0.58, 0.14).translate(-0.08, 0.24, 0.43),
    AK_STEEL_HIGHLIGHT
  );

  // L-shaped Dual Flip-Aperture Diopter (upright precision peep + forward-resting CQB aperture!)
  const dayRingOuter = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.14, 20)
      .rotateZ(Math.PI / 2)
      .translate(-0.08, 0.3, 0),
    AK_DARK_STEEL
  );
  const dayPeepHole = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.34, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.08, 0.3, 0),
    AK_INNER_DARK
  );
  const dayAperture = csgSubtract(dayRingOuter, [dayPeepHole]);

  const nightRingOuter = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.12, 18).translate(0.26, 0.06, 0),
    AK_DARK_STEEL
  );
  const nightPeepHole = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.28, 14).translate(0.26, 0.06, 0),
    AK_INNER_DARK
  );
  const nightAperture = csgSubtract(nightRingOuter, [nightPeepHole]);

  const windageKnob = paintGeometry(
    new THREE.CylinderGeometry(0.17, 0.17, 1.32, 18)
      .rotateX(Math.PI / 2)
      .translate(-0.08, 0.04, 0),
    AK_BRIGHT_STEEL
  );

  return mergeParts([
    clampBase,
    crossBolt,
    hexNut,
    earL,
    earR,
    dayAperture,
    nightAperture,
    windageKnob,
  ]);
}

/**
 * B-03: Bolt Carrier w/ Helical Cam Track + Integrated Long-Stroke Gas Piston w/ 3 Gas Rings
 * (assembledPos: [1.6, 1.55, 0])
 */
export function buildAkBoltCarrierGeometry(): THREE.BufferGeometry {
  // Heavy machined carrier body X ∈ [-2.455, +2.825] (world [-0.855, +4.425]) + upper cylindrical spring/piston tower
  const rawCarrier = paintGeometry(
    new THREE.BoxGeometry(5.28, 1.18, 1.18).translate(0.185, -0.05, 0),
    AK_DARK_STEEL
  );
  const upperTower = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.48, 5.2, 24)
      .rotateZ(Math.PI / 2)
      .translate(0.2, 0.68, 0),
    AK_DARK_STEEL
  );
  const carrierUnion = csgUnion([rawCarrier, upperTower]);

  // Cutters:
  // 1) Central bolt-stem bore at Y_local = -0.48 (world Y = 1.07, coaxial with ak_bolt!)
  const boltTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.39, 0.39, 4.95, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.55, -0.46, 0),
    AK_INNER_DARK
  );
  // 2) Authentic 2-stage Kalashnikov Helical Cam Track on right-lower cam wall:
  //    - Straight initial free-travel dwell slot (X_local ∈ [1.85, 2.35])
  //    - ~35° diagonal helical camming ramp (X_local ∈ [0.85, 1.95])
  const camDwellSlot = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.34, 0.62).translate(2.05, -0.06, 0.34),
    AK_INNER_DARK
  );
  const camHelicalRamp = paintGeometry(
    new THREE.BoxGeometry(1.38, 0.36, 0.66)
      .rotateY(0.54)
      .rotateX(-0.28)
      .translate(1.32, -0.1, 0.32),
    AK_INNER_DARK
  );
  // 3) Left & right receiver guide-rail grooves along lower carrier flanks (world Y = 1.22, Z = ±0.58)
  const railSlotL = paintGeometry(
    new THREE.BoxGeometry(5.5, 0.18, 0.22).translate(0.18, -0.33, -0.56),
    AK_INNER_DARK
  );
  const railSlotR = paintGeometry(
    new THREE.BoxGeometry(5.5, 0.18, 0.22).translate(0.18, -0.33, 0.56),
    AK_INNER_DARK
  );
  // 4) Rear recoil-spring blind bore (extends to localX = +2.55 -> worldX_rest = +4.15) & underside hammer slot/ramp
  const recoilHole = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 5.15, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.025, 0.32, 0),
    AK_INNER_DARK
  );
  const rearHammerRamp = paintGeometry(
    new THREE.BoxGeometry(1.25, 0.52, 1.3)
      .rotateZ(-0.36)
      .translate(-2.08, -0.56, 0),
    AK_INNER_DARK
  );
  const hammerClearanceSlot = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.72, 0.54).translate(-1.35, -0.36, 0),
    AK_INNER_DARK
  );

  const sculptedCarrier = csgSubtract(carrierUnion, [
    boltTunnel,
    camDwellSlot,
    camHelicalRamp,
    railSlotL,
    railSlotR,
    recoilHole,
    rearHammerRamp,
    hammerClearanceSlot,
  ]);

  // Iconic Kalashnikov right-side upturned Charging Handle at X_local = +1.85, Z ∈ [+0.58, +1.48]
  const handleStem = paintGeometry(
    new THREE.BoxGeometry(0.64, 0.28, 0.78).translate(1.85, -0.08, 0.88),
    AK_DARK_STEEL
  );
  const handleTip = paintGeometry(
    new THREE.CylinderGeometry(0.17, 0.24, 0.72, 18)
      .rotateZ(-0.35)
      .translate(1.88, 0.18, 1.34),
    AK_DARK_STEEL
  );

  // Chrome-Plated Stainless Long-Stroke Gas Piston w/ 3 Precision Gas Seal Rings & Concave Cup Face
  // Spans X_local ∈ [+2.85, +13.72] (> 2.85 threshold in applyAkCarrierUVs!) at Y_local = +0.80
  const pistonPts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 2.86),
    new THREE.Vector2(0.33, 2.86), // Pinned joint collar into carrier tower
    new THREE.Vector2(0.33, 3.58),
    new THREE.Vector2(0.23, 3.78), // Tapered flexible shaft
    new THREE.Vector2(0.23, 11.82),
    new THREE.Vector2(0.375, 12.12), // Gas piston head land 1
    new THREE.Vector2(0.375, 12.38),
    new THREE.Vector2(0.295, 12.41), // Gas seal ring groove 1
    new THREE.Vector2(0.295, 12.52),
    new THREE.Vector2(0.375, 12.55), // Land 2
    new THREE.Vector2(0.375, 12.78),
    new THREE.Vector2(0.295, 12.81), // Gas seal ring groove 2
    new THREE.Vector2(0.295, 12.92),
    new THREE.Vector2(0.375, 12.95), // Land 3
    new THREE.Vector2(0.375, 13.18),
    new THREE.Vector2(0.295, 13.21), // Gas seal ring groove 3
    new THREE.Vector2(0.295, 13.32),
    new THREE.Vector2(0.382, 13.35), // Forward piston crown land
    new THREE.Vector2(0.382, 13.7),
    new THREE.Vector2(0.2, 13.53), // Concave high-pressure gas cup face!
    new THREE.Vector2(0.0, 13.48),
  ];
  const pistonRaw = new THREE.LatheGeometry(pistonPts, 24);
  pistonRaw.rotateZ(-Math.PI / 2);
  pistonRaw.translate(0, 0.8, 0);
  paintGeometry(pistonRaw, AK_PISTON_STEEL);

  const merged = mergeParts([
    sculptedCarrier,
    handleStem,
    handleTip,
    pistonRaw,
  ]);
  return applyAkCarrierUVs(merged);
}

/**
 * B-04: 2-Lug Kalashnikov Rotating Bolt Head w/ Firing-Pin Channel, Extractor Pocket & Ejector Slot
 * (assembledPos: [2.85, 1.05, 0])
 */
export function buildAkBoltGeometry(): THREE.BufferGeometry {
  // Cylindrical bolt stem + wide bolt head + asymmetric left/right locking lugs + helical cam lug + feed rib
  const stem = paintGeometry(
    new THREE.CylinderGeometry(0.31, 0.31, 3.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.1, 0, 0),
    AK_BRIGHT_STEEL
  );
  const boltHead = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.46, 0.92, 24)
      .rotateZ(Math.PI / 2)
      .translate(1.12, 0, 0),
    AK_BRIGHT_STEEL
  );
  // Left locking lug (with helical camming lead bevel) & oversized Right locking/extractor lug
  const lugLeft = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.36, 0.35)
      .rotateX(-0.08)
      .translate(1.08, 0.04, -0.53),
    AK_BRIGHT_STEEL
  );
  const lugRight = paintGeometry(
    new THREE.BoxGeometry(0.7, 0.4, 0.36).translate(1.08, -0.02, 0.53),
    AK_BRIGHT_STEEL
  );
  // Upper-right master rotary camming lug engaging carrier's helical cam slot
  const camLugBase = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.42, 0.26).translate(0.68, 0.32, 0.14),
    AK_BRIGHT_STEEL
  );
  const camLugPin = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.17, 0.36, 16).translate(
      0.68,
      0.52,
      0.14
    ),
    AK_BRIGHT_STEEL
  );
  // Bottom cartridge-stripping feed lug
  const feedRib = paintGeometry(
    new THREE.BoxGeometry(0.96, 0.24, 0.22).translate(1.06, -0.48, 0),
    AK_BRIGHT_STEEL
  );

  const solid = csgUnion([
    stem,
    boltHead,
    lugLeft,
    lugRight,
    camLugBase,
    camLugPin,
    feedRib,
  ]);

  // CSG Cutters:
  // 1) Full-length axial firing-pin channel bore
  const firingPinChannel = paintGeometry(
    new THREE.CylinderGeometry(0.115, 0.115, 3.6, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 0, 0),
    AK_INNER_DARK
  );
  // 2) Recessed 7.62×39mm cartridge rim breech face cup
  const faceCup = paintGeometry(
    new THREE.CylinderGeometry(0.325, 0.325, 0.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(1.52, 0, 0),
    AK_INNER_DARK
  );
  // 3) Right-side extractor claw & spring pocket (matches ak_extractor at local [1.15, 0.03, 0.34])
  const extractorPocket = paintGeometry(
    new THREE.BoxGeometry(1.02, 0.3, 0.28).translate(1.12, 0.03, 0.38),
    AK_INNER_DARK
  );
  // 4) Left-side longitudinal ejector blade clearance slot (matches ak_receiver ejectorFin at Z = -0.46)
  const ejectorSlot = paintGeometry(
    new THREE.BoxGeometry(1.85, 0.24, 0.26).translate(0.85, -0.01, -0.44),
    AK_INNER_DARK
  );

  const carved = csgSubtract(solid, [
    firingPinChannel,
    faceCup,
    extractorPocket,
    ejectorSlot,
  ]);

  // Extractor pivot cross-pin & firing-pin retention cross-pin
  const extractorPin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.78, 12).translate(
      0.98,
      0.02,
      0.34
    ),
    AK_DARK_STEEL
  );
  const fpRetainerPin = paintGeometry(
    new THREE.CylinderGeometry(0.05, 0.05, 0.58, 12).translate(
      -0.38,
      0.04,
      0.16
    ),
    AK_DARK_STEEL
  );

  return mergeParts([carved, extractorPin, fpRetainerPin]);
}

/**
 * B-05: Free-Floating Tri-Fluted Firing Pin (assembledPos: [2.68, 1.05, 0])
 */
export function buildAkFiringPinGeometry(): THREE.BufferGeometry {
  // Domed rear anvil reaches localX = -2.42 (worldX = +0.26) so ak_hammer meets it squarely through carrier slot!
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -2.42),
    new THREE.Vector2(0.135, -2.37), // Domed rear hammer-strike anvil
    new THREE.Vector2(0.135, -1.55),
    new THREE.Vector2(0.105, -1.48), // Stepped shaft
    new THREE.Vector2(0.105, 1.08),
    new THREE.Vector2(0.068, 1.48),
    new THREE.Vector2(0.032, 1.74), // Tapered striker tip
    new THREE.Vector2(0.0, 1.76),
  ];
  const rawPin = new THREE.LatheGeometry(pts, 18);
  rawPin.rotateZ(-Math.PI / 2);
  paintGeometry(rawPin, AK_BRIGHT_STEEL);

  // 3 longitudinal anti-slamfire weight-reduction/gas-relief flutes + cross-pin flat cut
  const flutes: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(0.62, 0.08, 0.3).translate(-0.22, 0.1, 0),
      AK_DARK_STEEL
    ),
  ];
  for (let k = 0; k < 3; k++) {
    flutes.push(
      paintGeometry(
        new THREE.BoxGeometry(1.55, 0.055, 0.07)
          .translate(0.28, 0.1, 0)
          .rotateX((k * Math.PI * 2) / 3),
        AK_DARK_STEEL
      )
    );
  }

  return csgSubtract(rawPin, flutes);
}

/**
 * B-06: Heavy Claw Extractor & High-Rate Coil Spring (assembledPos: [4.0, 1.08, 0.34])
 */
export function buildAkExtractorGeometry(): THREE.BufferGeometry {
  // Sculpted claw body w/ beveled rim-biting hook & pivot ear
  const clawShape = new THREE.Shape();
  clawShape.moveTo(-0.56, -0.1);
  clawShape.lineTo(0.32, -0.11);
  clawShape.lineTo(0.52, -0.26); // Rim-biting inward claw hook (-Z after rotateY)
  clawShape.lineTo(0.56, -0.14);
  clawShape.lineTo(0.46, 0.12);
  clawShape.lineTo(-0.22, 0.13);
  clawShape.lineTo(-0.56, 0.07);
  clawShape.closePath();

  const clawExtrude = new THREE.ExtrudeGeometry(clawShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  // Map shape (X, Y_shape) -> (X, Z) extruded along Y!
  clawExtrude.rotateX(-Math.PI / 2);
  clawExtrude.translate(0, -0.12, 0);
  paintGeometry(clawExtrude, AK_DARK_STEEL);

  const springGuideStud = paintGeometry(
    new THREE.CylinderGeometry(0.038, 0.038, 0.42, 10)
      .rotateZ(Math.PI / 2)
      .translate(-0.55, 0, 0.04),
    AK_BRIGHT_STEEL
  );
  const miniSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.78,
      end: -0.26,
      centerY: 0,
      centerZ: 0.04,
      coilRadius: 0.078,
      wireRadius: 0.022,
      coils: 6,
    }),
    AK_SPRING_METAL
  );
  return mergeParts([clawExtrude, springGuideStud, miniSpring]);
}

/**
 * B-07: Telescoping Dual-Tube Recoil Spring Guide & 2023 Buffer Pad (assembledPos: [-2.1, 1.85, 0])
 */
export function buildAkRecoilGuideGeometry(): THREE.BufferGeometry {
  // Rear trunnion locking heel w/ cross-lock pin eyelet + polymer shock buffer + telescoping rods
  const heelRaw = paintGeometry(
    new THREE.BoxGeometry(0.84, 0.92, 0.68).translate(-3.72, -0.16, 0),
    AK_DARK_STEEL
  );
  const pinEyelet = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.85, 14)
      .rotateX(Math.PI / 2)
      .translate(-3.55, -0.45, 0),
    AK_INNER_DARK
  );
  const rearHeel = csgSubtract(heelRaw, [pinEyelet]);

  const bufferPad = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.98, 0.92).translate(-3.24, -0.14, 0),
    '#334155'
  );
  const outerTube = paintGeometry(
    new THREE.CylinderGeometry(0.165, 0.165, 2.8, 16)
      .rotateZ(Math.PI / 2)
      .translate(-1.6, 0, 0),
    AK_BRIGHT_STEEL
  );
  // Telescoping inner rod & keeper end at localX <= +1.94 (worldX <= -0.16) so they remain inside carrier recoilHole at full -4.20 recoil!
  const innerRod = paintGeometry(
    new THREE.CylinderGeometry(0.115, 0.115, 2.15, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.78, 0, 0),
    AK_BRIGHT_STEEL
  );
  const frontKeeper = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 0.14, 16)
      .rotateZ(Math.PI / 2)
      .translate(1.86, 0, 0),
    AK_DARK_STEEL
  );
  const stopRing = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 0.16, 16)
      .rotateZ(Math.PI / 2)
      .translate(-3.04, 0, 0),
    AK_DARK_STEEL
  );
  return mergeParts([
    rearHeel,
    bufferPad,
    outerTube,
    innerRod,
    frontKeeper,
    stopRing,
  ]);
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
    coils: 26,
    radialSegments: 8,
    tubularSegmentsPerCoil: 16,
  });
  return mergeParts([paintGeometry(spring, AK_SPRING_METAL)]);
}

/**
 * B-09: Polymer Upper Handguard Heatshield w/ Continuous M1913 Top Picatinny Rail
 * (assembledPos: [10.55, 2.38, 0])
 */
export function buildAkUpperHandguardGeometry(): THREE.BufferGeometry {
  const arch = new THREE.Shape();
  arch.moveTo(-0.88, -0.58);
  arch.lineTo(-0.88, 0.16);
  arch.quadraticCurveTo(-0.84, 0.48, -0.45, 0.5);
  arch.lineTo(0.45, 0.5);
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
  for (const vx of [-2.85, -0.95, 0.95, 2.85]) {
    vents.push(
      paintGeometry(
        new THREE.BoxGeometry(1.08, 0.24, 2.1)
          .rotateZ(0.14)
          .translate(vx, -0.1, 0),
        AK_POLYMER_ACCENT
      )
    );
  }
  const body = csgSubtract(raw, vents);

  // Co-planar MIL-STD-1913 Top Picatinny Rail w/ 12 CSG recoil slots (top at Y_local = +0.74 => world Y = 3.12!)
  const topRail = buildTopPicatinnyRail({
    length: 8.95,
    centerX: 0,
    baseY: 0.49,
    slotCount: 12,
    bodyColor: AK_RAIL_FLAT,
    slotColor: AK_RAIL_SLOT,
  });

  // Front & rear steel retention locking clips
  const rearClip = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.48, 1.66).translate(-4.42, -0.28, 0),
    AK_STEEL_HIGHLIGHT
  );
  const frontClip = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.48, 1.66).translate(4.42, -0.28, 0),
    AK_STEEL_HIGHLIGHT
  );

  return mergeParts([body, topRail, rearClip, frontClip]);
}

/**
 * B-10: Fluted Free-Float Steel Gas Tube & Rear Cantilever Collar (assembledPos: [10.8, 2.35, 0])
 * Spans local X ∈ [-4.80, +4.80] => world X ∈ [6.00, 15.60], mating cleanly into ak_gas_block!
 */
export function buildAkGasTubeGeometry(): THREE.BufferGeometry {
  const outer = paintGeometry(
    new THREE.CylinderGeometry(0.49, 0.49, 9.6, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    AK_DARK_STEEL
  );
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.395, 0.395, 10.1, 22)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    AK_INNER_DARK
  );

  // 6 stamped longitudinal piston-guiding/cooling flutes around outer wall
  const fluteCutters: THREE.BufferGeometry[] = [bore];
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3 + Math.PI / 6;
    fluteCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(7.2, 0.06, 0.14)
          .translate(0.1, 0.49, 0)
          .rotateX(ang),
        AK_INNER_DARK
      )
    );
  }
  const tube = csgSubtract(outer, fluteCutters);

  // Heavy rear cantilever barrel-nut collar + front gas-block sealing ferrule
  const rearCollar = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 0.86, 24)
      .rotateZ(Math.PI / 2)
      .translate(-4.38, 0, 0),
    AK_STEEL_HIGHLIGHT
  );
  const frontFerrule = paintGeometry(
    new THREE.CylinderGeometry(0.53, 0.51, 0.58, 22)
      .rotateZ(Math.PI / 2)
      .translate(4.52, 0, 0),
    AK_BRIGHT_STEEL
  );

  return mergeParts([tube, rearCollar, frontFerrule]);
}
