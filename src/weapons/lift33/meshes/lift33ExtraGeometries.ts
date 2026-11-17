import * as THREE from 'three';
import {
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import { clampUv01 as clamp01 } from '../../../engine/geometry/uvUnwrap';
import {
  LIFT33_PALETTE,
  buildWatertightTube,
  extrudeShapeX,
  extrudeShapeZ,
  latheAlongX,
  sanitizeLift33Mesh,
} from './lift33CadDetail';

// ============================================================================
// 1. PRECISION 2K UV ATLAS UNWRAPPERS (`lift33_riser_*` & `lift33_limbs_*`)
// ============================================================================

/**
 * Unwraps F-01 QAD Integrate MX Drop-Away Rest onto `lift33_riser_*` Band C Right
 * (u ∈ [0.58, 0.96], v ∈ [0.04, 0.28]).
 */
export function applyLift33DropAwayRestUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const xNorm = clamp01((x + 1.4) / 3.4);
    const yNorm = clamp01((y + 1.2) / 3.2);
    const zNorm = clamp01((z + 1.6) / 2.6);
    uvs[i * 2] = clamp01(0.58 + (0.65 * xNorm + 0.35 * zNorm) * 0.38);
    uvs[i * 2 + 1] = clamp01(0.04 + yNorm * 0.24);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-03 Bridge-Lock Sight Housing onto `lift33_riser_*` Band C Left
 * (u ∈ [0.04, 0.56], v ∈ [0.04, 0.28]).
 */
export function applyLift33SightHousingUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const xNorm = clamp01((x + 5.2) / 8.2);
    const yNorm = clamp01((y + 3.0) / 5.4);
    uvs[i * 2] = clamp01(0.04 + xNorm * 0.52);
    uvs[i * 2 + 1] = clamp01(0.04 + yNorm * 0.24);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Q-01 LowPro Quiver Frame onto `lift33_limbs_*` Band C Mid
 * (u ∈ [0.47, 0.72], v ∈ [0.04, 0.31]).
 */
export function applyLift33QuiverFrameUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const yNorm = clamp01((y + 27.5) / 51.0);
    const xNorm = clamp01((x + 3.4) / 6.8);
    uvs[i * 2] = clamp01(0.47 + xNorm * 0.25);
    uvs[i * 2 + 1] = clamp01(0.04 + yNorm * 0.27);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Q-02 Acoustic Foam Broadhead Hood onto `lift33_limbs_*` Band C Right
 * (u ∈ [0.74, 0.96], v ∈ [0.04, 0.31]).
 */
export function applyLift33QuiverHoodUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const xNorm = clamp01((x + 3.4) / 6.8);
    const yNorm = clamp01((y + 8.5) / 14.0);
    uvs[i * 2] = clamp01(0.74 + xNorm * 0.22);
    uvs[i * 2 + 1] = clamp01(0.04 + yNorm * 0.27);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 2. 'fire_control' GROUP (F-01 .. F-05 · 5 PARTS)
// ============================================================================

/**
 * F-01: QAD Integrate MX Limb-Driven Drop-Away Rest Housing
 * (`assembledPos: [+0.45, +1.45, +1.15]`)
 */
export function buildLift33DropAwayRestGeometry(): THREE.BufferGeometry {
  const clampBlock = paintGeometry(
    new THREE.BoxGeometry(1.55, 1.05, 0.68).translate(-0.15, 0, 0),
    LIFT33_PALETTE.RISER_ANODIZED
  );
  const clutchHousing = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.56, 0.92, 20)
      .rotateX(Math.PI / 2)
      .translate(0.95, 0.35, -0.25),
    LIFT33_PALETTE.RISER_DARK
  );
  const windageKnob = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 0.42, 16)
      .rotateX(Math.PI / 2)
      .translate(0.95, 0.35, 0.35),
    LIFT33_PALETTE.RISER_MACHINED
  );
  const elevationKnob = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.36, 16).translate(-0.15, 0.72, 0),
    LIFT33_PALETTE.RISER_MACHINED
  );

  // Protective over-arrow containment arch curving from housing over arrow axis (world [1.40, 2.40, 0])
  // Local offset to world arrow axis = [+0.95, +0.95, -1.15]
  const archPts = [
    new THREE.Vector3(0.95, 0.35, -0.35),
    new THREE.Vector3(0.95, 1.55, -0.45),
    new THREE.Vector3(0.95, 1.85, -1.15),
    new THREE.Vector3(0.95, 1.55, -1.78),
    new THREE.Vector3(0.95, 0.75, -1.85),
  ];
  const containmentArch = buildWatertightTube(
    archPts,
    0.13,
    12,
    LIFT33_PALETTE.RISER_ANODIZED
  );

  return sanitizeLift33Mesh(
    applyLift33DropAwayRestUVs(
      mergeParts([clampBlock, clutchHousing, windageKnob, elevationKnob, containmentArch])
    )
  );
}

/**
 * F-02: Spring-Loaded V-Launcher Fork (`assembledPos: [+1.40, +1.85, 0]`)
 * Pivots cleanly around local Z at [0, 0, 0]; when raised (`rz = 0`), V-cradle supports arrow at y_world = 2.40!
 */
export function buildLift33LauncherForkGeometry(): THREE.BufferGeometry {
  const pivotAxle = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 1.48, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.55),
    LIFT33_PALETTE.TITANIUM_SILVER
  );
  const forkBase = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.38, 0.42).translate(0, 0.14, 0),
    LIFT33_PALETTE.BRIGHT_STEEL
  );
  // Left & Right V-launcher prongs cradling Ø 6.2mm carbon shaft at y_local = +0.55 (y_world = +2.40)
  const prongL = buildWatertightTube(
    [
      new THREE.Vector3(0, 0.18, -0.08),
      new THREE.Vector3(0, 0.36, -0.32),
      new THREE.Vector3(0, 0.78, -0.48),
    ],
    0.075,
    10,
    LIFT33_PALETTE.BRIGHT_STEEL
  );
  const prongR = buildWatertightTube(
    [
      new THREE.Vector3(0, 0.18, 0.08),
      new THREE.Vector3(0, 0.36, 0.32),
      new THREE.Vector3(0, 0.78, 0.48),
    ],
    0.075,
    10,
    LIFT33_PALETTE.BRIGHT_STEEL
  );
  // Felt cushion pad at V valley
  const cradlePad = paintGeometry(
    new THREE.BoxGeometry(0.36, 0.1, 0.32).translate(0, 0.25, 0),
    LIFT33_PALETTE.GRIP_POLYMER
  );

  return sanitizeLift33Mesh(
    mergeParts([pivotAxle, forkBase, prongL, prongR, cradlePad])
  );
}

/**
 * F-03: Bridge-Lock 5-Pin Micro-Adjust Dovetail Sight Housing & Bubble Level
 * (`assembledPos: [+4.20, +6.40, +1.25]`)
 */
export function buildLift33SightHousingGeometry(): THREE.BufferGeometry {
  // Long Bridge-Lock dovetail bar passing inline through the riser channel (z_local = -0.95 -> z_world = +0.30)
  const dovetailBar = paintGeometry(
    new THREE.BoxGeometry(7.2, 0.56, 0.92).translate(-2.4, 0, -0.95),
    LIFT33_PALETTE.RISER_ANODIZED
  );
  // Windage offset cross-arm & elevation vertical rack
  const crossArm = paintGeometry(
    new THREE.BoxGeometry(1.1, 0.78, 1.58).translate(0.4, 0, -0.25),
    LIFT33_PALETTE.RISER_MACHINED
  );
  const elevTrack = paintGeometry(
    new THREE.BoxGeometry(0.75, 2.35, 0.55).translate(0.4, -0.45, 0.35),
    LIFT33_PALETTE.RISER_ANODIZED
  );
  const elevKnob = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 0.34, 18).translate(0.4, 0.85, 0.35),
    LIFT33_PALETTE.TITANIUM_SILVER
  );
  const windKnob = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 0.42, 18)
      .rotateX(Math.PI / 2)
      .translate(0.4, -0.8, 0.65),
    LIFT33_PALETTE.TITANIUM_SILVER
  );

  // Machined circular Ø38mm scope ring centered at local (0.40, -0.80, +0.20) -> world (+4.60, +5.60, +1.45)
  const scopeRingShape = new THREE.Shape();
  scopeRingShape.absarc(0, 0, 2.08, 0, Math.PI * 2, false);
  const scopeHole = new THREE.Path();
  scopeHole.absarc(0, 0, 1.72, 0, Math.PI * 2, true);
  scopeRingShape.holes.push(scopeHole);

  const scopeRing = extrudeShapeZ(
    scopeRingShape,
    0,
    1.55,
    LIFT33_PALETTE.RISER_ANODIZED,
    0.03,
    24
  )
    .rotateY(Math.PI / 2)
    .translate(0.4, -0.8, 0.2);

  // High-vis green alignment collar + bottom anti-cant bubble vial
  const greenBezel = paintGeometry(
    new THREE.TorusGeometry(1.78, 0.08, 10, 28)
      .rotateY(Math.PI / 2)
      .translate(-0.36, -0.8, 0.2),
    LIFT33_PALETTE.FIBER_GREEN
  );
  const levelVial = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 0.82, 12)
      .rotateX(Math.PI / 2)
      .translate(0.25, -2.35, 0.2),
    LIFT33_PALETTE.FIBER_GREEN
  );

  return sanitizeLift33Mesh(
    applyLift33SightHousingUVs(
      mergeParts([
        dovetailBar,
        crossArm,
        elevTrack,
        elevKnob,
        windKnob,
        scopeRing,
        greenBezel,
        levelVial,
      ])
    )
  );
}

/**
 * F-04: 0.019" Guarded Multi-Color Fiber-Optic Pins (`assembledPos: [+4.60, +5.60, +1.45]`)
 */
export function buildLift33SightPinsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Vertical pin mounting rack inside the right wall of the sight ring
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.45, 2.45, 0.22).translate(0, 0, 1.48),
      LIFT33_PALETTE.RISER_DARK
    )
  );

  const pinRows: Array<{ y: number; color: string; zLen: number }> = [
    { y: 0.82, color: LIFT33_PALETTE.FIBER_GREEN, zLen: 1.45 },
    { y: 0.42, color: LIFT33_PALETTE.FIBER_AMBER, zLen: 1.48 },
    { y: 0.02, color: LIFT33_PALETTE.DAMPER_ORANGE, zLen: 1.52 },
    { y: -0.38, color: LIFT33_PALETTE.FIBER_RED, zLen: 1.48 },
    { y: -0.78, color: LIFT33_PALETTE.FIBER_GREEN, zLen: 1.45 },
  ];

  for (const pin of pinRows) {
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.22, 0.08, pin.zLen).translate(
          0,
          pin.y,
          1.48 - pin.zLen * 0.5
        ),
        LIFT33_PALETTE.RISER_DARK
      ),
      paintGeometry(
        new THREE.SphereGeometry(0.11, 12, 10).translate(
          0,
          pin.y,
          1.48 - pin.zLen
        ),
        pin.color
      )
    );
  }

  // Top coiled fiber-optic light collector arc (watertight capped tube!)
  const fiberPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = -0.35 * Math.PI + (0.7 * Math.PI * i) / 14;
    fiberPts.push(new THREE.Vector3(0, Math.cos(a) * 1.94, Math.sin(a) * 1.94));
  }
  const fiberWrap = buildWatertightTube(
    fiberPts,
    0.09,
    10,
    LIFT33_PALETTE.DAMPER_ORANGE
  );
  parts.push(fiberWrap);

  return sanitizeLift33Mesh(mergeParts(parts));
}

/**
 * F-05: Dyneema Release D-Loop, Brass Nock Collars & 1/4" Aluminum Peep Sight
 * (`assembledPos: [-16.50, +2.40, 0]`)
 */
export function buildLift33DLoopGeometry(): THREE.BufferGeometry {
  const upperCollar = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 0.34, 16).translate(0, 0.46, 0),
    LIFT33_PALETTE.BRASS_NOCK
  );
  const lowerCollar = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 0.34, 16).translate(0, -0.46, 0),
    LIFT33_PALETTE.BRASS_NOCK
  );

  const dLoopPts = [
    new THREE.Vector3(0.05, 0.52, 0),
    new THREE.Vector3(-0.75, 0.54, 0),
    new THREE.Vector3(-1.38, 0.32, 0),
    new THREE.Vector3(-1.46, 0.0, 0),
    new THREE.Vector3(-1.38, -0.32, 0),
    new THREE.Vector3(-0.75, -0.54, 0),
    new THREE.Vector3(0.05, -0.52, 0),
  ];
  const dLoopCord = buildWatertightTube(
    dLoopPts,
    0.11,
    12,
    LIFT33_PALETTE.DAMPER_ORANGE
  );

  // 1/4" Hooded Aluminum Peep Sight at y_local = +14.80 (world y = +17.20)
  const peepOuter = new THREE.Shape();
  peepOuter.absarc(0, 0, 0.52, 0, Math.PI * 2, false);
  const peepAperture = new THREE.Path();
  peepAperture.absarc(0, 0, 0.24, 0, Math.PI * 2, true);
  peepOuter.holes.push(peepAperture);

  const peepHousing = extrudeShapeZ(
    peepOuter,
    0,
    0.42,
    LIFT33_PALETTE.RISER_MACHINED,
    0.04,
    18
  )
    .rotateY(Math.PI / 2)
    .rotateZ(-0.28)
    .translate(0, 14.8, 0);

  return sanitizeLift33Mesh(
    mergeParts([upperCollar, lowerCollar, dLoopCord, peepHousing])
  );
}

// ============================================================================
// 3. 'magazine' GROUP (Q-01 .. Q-05 · 5 PARTS)
// ============================================================================

/**
 * Q-01: Low-Profile 5-Arrow Quick-Detach Quiver Spine & Riser Mount (`magBodyPartId`)
 * (`assembledPos: [+0.60, +2.00, +4.20]`)
 * World span covers X ∈ [-2.5, +3.7], Y ∈ [-25.0, +24.0], Z ∈ [+1.45, +5.80]
 * cleanly enclosing the lower/mid spans of all 5 quiver arrows (`z = +4.95`).
 */
export function buildLift33QuiverFrameGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Twin vertical carbon spine rods (y_local ∈ [-26.8, +21.5] -> y_world ∈ [-24.8, +23.5])
  for (const xRod of [-0.75, 0.75]) {
    parts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.26, 0.26, 48.3, 14).translate(
          xRod,
          -2.65,
          -0.42
        ),
        LIFT33_PALETTE.CARBON_ROD
      )
    );
  }

  // Quick-detach horizontal riser mount bridge arm (z_local ∈ [-2.75, -0.30] -> z_world ∈ [+1.45, +3.90])
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(2.15, 1.45, 2.55).translate(0, 1.5, -1.52),
      LIFT33_PALETTE.RISER_ANODIZED
    )
  );

  // Lower 5-slot arrow gripper bar (y_local = -11.5 -> y_world = -9.5, z_world ∈ [+3.80, +5.85])
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(6.55, 1.35, 1.95).translate(0, -11.5, 0.65),
      LIFT33_PALETTE.GRIP_POLYMER
    )
  );
  // 6 C-clip retention ribs framing the 5 arrow slot X positions (-2.4, -1.2, 0, +1.2, +2.4 local -> -1.8, -0.6, +0.6, +1.8, +3.0 world)
  for (let i = 0; i < 6; i++) {
    const xRib = -3.0 + i * 1.2;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.24, 1.42, 0.72).translate(xRib, -11.5, 1.34),
        LIFT33_PALETTE.GRIP_INLAY
      )
    );
  }

  // Lower protective nock-tail base cradle bar (y_local = -26.5 -> y_world = -24.5)
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(6.55, 0.95, 1.95).translate(0, -26.5, 0.65),
      LIFT33_PALETTE.GRIP_POLYMER
    )
  );

  return sanitizeLift33Mesh(applyLift33QuiverFrameUVs(mergeParts(parts)));
}

/**
 * Q-02: Acoustic Foam Broadhead Hood & Upper Gripper Collar (`throatPartId`)
 * (`assembledPos: [+0.60, +22.50, +4.85]`)
 * World span: X ∈ [-2.75, +3.95], Y ∈ [+14.3, +27.6], Z ∈ [+3.70, +6.00].
 */
export function buildLift33QuiverHoodGeometry(): THREE.BufferGeometry {
  // Inverted-U channel extruded along X (open bottom broadhead throat, solid top & sides -> 100% watertight!)
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(-1.15, -2.85);
  hoodShape.lineTo(-0.82, -2.85);
  hoodShape.lineTo(-0.82, 3.85);
  hoodShape.lineTo(0.82, 3.85);
  hoodShape.lineTo(0.82, -2.85);
  hoodShape.lineTo(1.15, -2.85);
  hoodShape.lineTo(1.15, 5.15);
  hoodShape.lineTo(-1.15, 5.15);
  hoodShape.closePath();

  const hollowedHood = extrudeShapeX(
    hoodShape,
    -3.32,
    6.64,
    LIFT33_PALETTE.GRIP_POLYMER,
    0.02,
    8
  );
  const sideWallL = paintGeometry(
    new THREE.BoxGeometry(0.38, 8.0, 2.24).translate(-3.13, 1.15, 0),
    LIFT33_PALETTE.GRIP_POLYMER
  );
  const sideWallR = paintGeometry(
    new THREE.BoxGeometry(0.38, 8.0, 2.24).translate(3.13, 1.15, 0),
    LIFT33_PALETTE.GRIP_POLYMER
  );
  const foamCap = paintGeometry(
    new THREE.BoxGeometry(5.65, 1.35, 1.56).translate(0, 3.1, 0),
    LIFT33_PALETTE.HOOD_FOAM
  );
  // Upper 5-slot arrow gripper bar (y_local = -7.5 -> y_world = +15.0)
  const upperGripper = paintGeometry(
    new THREE.BoxGeometry(6.55, 1.25, 1.95).translate(0, -7.5, -0.05),
    LIFT33_PALETTE.GRIP_POLYMER
  );
  // Spine socket collar connecting hood down to twin carbon rods
  const spineCollar = paintGeometry(
    new THREE.BoxGeometry(2.3, 8.8, 0.85).translate(0, -3.5, -0.92),
    LIFT33_PALETTE.RISER_ANODIZED
  );

  return sanitizeLift33Mesh(
    applyLift33QuiverHoodUVs(
      mergeParts([
        hollowedHood,
        sideWallL,
        sideWallR,
        foamCap,
        upperGripper,
        spineCollar,
      ])
    )
  );
}

/**
 * Q-03: Spring-Detent Quiver Release Latch (`followerPartId`)
 * (`assembledPos: [+0.60, +3.50, +2.45]`)
 * Sits cleanly inward (z <= 2.95) of all 5 quiver arrows (z = +4.95).
 */
export function buildLift33QuiverLatchGeometry(): THREE.BufferGeometry {
  const leverArm = paintGeometry(
    new THREE.BoxGeometry(2.65, 0.95, 0.42).translate(-0.2, 0, 0),
    LIFT33_PALETTE.DAMPER_ORANGE
  );
  const camTab = paintGeometry(
    new THREE.BoxGeometry(0.95, 1.35, 0.46).translate(-1.35, 0.25, 0),
    LIFT33_PALETTE.DAMPER_ORANGE
  );
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 1.15, 14).translate(0.55, 0, -0.15),
    LIFT33_PALETTE.TITANIUM_SILVER
  );

  return sanitizeLift33Mesh(mergeParts([leverArm, camTab, pivotPin]));
}

/**
 * Q-04: 29" Match Carbon Arrow Shaft + Half-Out Insert, Illuminated Nock & 3 Helical Fletching Vanes
 * (`assembledPos: [-16.50, +2.40, 0]`)
 * Local x ∈ [-0.40, +47.80] -> world x ∈ [-16.90, +31.30] when nocked on bowstring!
 */
export function buildLift33ArrowShaftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Turned carbon arrow shaft + illuminated nock + half-out stainless insert
  const shaftProfile = latheAlongX(
    [
      [0, -0.35],
      [0.14, -0.35],
      [0.32, 0.0],
      [0.32, 1.15],
      [0.31, 1.2],
      [0.31, 45.8],
      [0.38, 45.95],
      [0.38, 47.8],
      [0.3, 47.85],
      [0, 47.85],
    ],
    22,
    LIFT33_PALETTE.CARBON_ROD
  );
  parts.push(shaftProfile);

  // Illuminated green polycarbonate nock sleeve
  parts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.335, 0.335, 1.25, 18)
        .rotateZ(Math.PI / 2)
        .translate(0.45, 0, 0),
      LIFT33_PALETTE.FIBER_GREEN
    )
  );
  // Machined aluminum nock collar & half-out front insert collar
  parts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.35, 0.35, 0.55, 18)
        .rotateZ(Math.PI / 2)
        .translate(1.35, 0, 0),
      LIFT33_PALETTE.TITANIUM_SILVER
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.39, 0.39, 1.85, 18)
        .rotateZ(Math.PI / 2)
        .translate(46.85, 0, 0),
      LIFT33_PALETTE.TITANIUM_SILVER
    )
  );

  // 2. Three helical 2" Blazer-style polymer fletching vanes (x_local ∈ [2.4, 7.6], 120° apart)
  const vaneShape = new THREE.Shape();
  vaneShape.moveTo(0, 0.28);
  vaneShape.lineTo(0.85, 0.92);
  vaneShape.lineTo(4.2, 1.05);
  vaneShape.lineTo(5.1, 0.52);
  vaneShape.lineTo(5.2, 0.28);
  vaneShape.closePath();

  for (let k = 0; k < 3; k++) {
    const angle = (k * Math.PI * 2) / 3 + 0.35;
    const vane = extrudeShapeZ(
      vaneShape,
      0,
      0.11,
      k === 0 ? LIFT33_PALETTE.BRIGHT_STEEL : LIFT33_PALETTE.DAMPER_ORANGE,
      0.015,
      8
    );
    // Slight helical twist along shaft X
    const pos = vane.attributes.position;
    for (let vi = 0; vi < pos.count; vi++) {
      const vx = pos.getX(vi);
      const vy = pos.getY(vi);
      const vz = pos.getZ(vi);
      const helicalTwist = (vx / 5.2) * 0.16;
      const a = angle + helicalTwist;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      pos.setXYZ(vi, vx + 2.4, vy * ca - vz * sa, vy * sa + vz * ca);
    }
    vane.computeVertexNormals();
    parts.push(vane);
  }

  return sanitizeLift33Mesh(mergeParts(parts));
}

/**
 * Q-05: CNC 3-Blade Mechanical Broadhead (`assembledPos: [+31.30, +2.40, 0]`)
 * Local x ∈ [-0.45, +4.45] -> world tip at +35.75!
 */
export function buildLift33BroadheadGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Turned stainless ferrule & cut-on-contact chisel point
  const ferrule = latheAlongX(
    [
      [0, -0.45],
      [0.24, -0.45],
      [0.37, -0.35],
      [0.38, 0.55],
      [0.44, 0.65],
      [0.44, 1.1],
      [0.36, 2.35],
      [0.18, 3.65],
      [0.03, 4.42],
      [0, 4.45],
    ],
    22,
    LIFT33_PALETTE.BROADHEAD_STEEL
  );
  parts.push(ferrule);

  // Rear blade-retention anodized orange collar
  parts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.46, 0.46, 0.52, 20)
        .rotateZ(Math.PI / 2)
        .translate(0.75, 0, 0),
      LIFT33_PALETTE.DAMPER_ORANGE
    )
  );

  // 3 swept razor mechanical cutting blades at 120° intervals
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.85, 0.34);
  bladeShape.lineTo(3.45, 0.18);
  bladeShape.lineTo(1.25, 1.58);
  bladeShape.lineTo(0.75, 1.32);
  bladeShape.closePath();

  for (let k = 0; k < 3; k++) {
    const angle = (k * Math.PI * 2) / 3;
    const blade = extrudeShapeZ(
      bladeShape,
      0,
      0.1,
      LIFT33_PALETTE.TITANIUM_SILVER,
      0.015,
      6
    );
    blade.rotateX(angle);
    parts.push(blade);
  }

  return sanitizeLift33Mesh(mergeParts(parts));
}
